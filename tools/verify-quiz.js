/* ============================================================
 * 长留玉 · 答题交互行为自检（Node 运行，不参与线上）
 * ------------------------------------------------------------
 * 用一套极简的假 DOM + 假题库，把 js/quiz.js（公共答题引擎）真实跑起来，
 * 验证「选中即自动跳题」这套交互有没有被改坏：
 *
 *   1. 首屏：选项数、按钮禁用态、提示文案
 *   2. 选完一项 → 等延迟 → 自动前进，答案与存档同步
 *   3. 选完立刻手动点「下一题」→ 不能连跳两题
 *   4. 「上一题」回退 → 旧答案回显 → 改选后再次自动前进
 *   5. 最后一题不自动结束，停在原地等「查看结果」
 *   6. 末题点「查看结果」→ 写出 final 快照 + 清掉 progress
 *
 * 运行：node tools/verify-quiz.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'quiz.js'), 'utf8');

// 取出真实文件里的延迟值做一次合理性检查；再在测试副本里调小它，好让跑题瞬间完成
const dm = /var ADVANCE_DELAY = (\d+);/.exec(SRC);
if (!dm) {
  console.error('✗ js/quiz.js 里找不到 ADVANCE_DELAY 声明，本测试需要同步更新');
  process.exit(1);
}
const DELAY = Number(dm[1]);
if (DELAY <= 0 || DELAY > 400) {
  console.warn('! ADVANCE_DELAY = ' + DELAY + 'ms 不太合理（建议 100~300ms），请确认是否有意为之');
}
const CODE = SRC.replace(/var ADVANCE_DELAY = \d+;/, 'var ADVANCE_DELAY = 5;');

/* ------------------------------------------------------------
 * 极简 DOM
 * ---------------------------------------------------------- */
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this._cls = new Set();
    this.style = {};
    this.textContent = '';
    this.parentNode = null;
    this.listeners = {};
    this.disabled = false;
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const s = this;
    return {
      add: (...c) => { c.forEach(x => s._cls.add(x)); },
      remove: (...c) => { c.forEach(x => s._cls.delete(x)); },
      toggle: (c, on) => { if (on === undefined) on = !s._cls.has(c); on ? s._cls.add(c) : s._cls.delete(c); },
      contains: c => s._cls.has(c)
    };
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') IDS.set(String(v), this); }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t) { (this.listeners[t] || []).forEach(f => f.call(this, { key: '', preventDefault() {} })); }
}

const IDS = new Map();
function makeEl(tag) { return new El(tag); }

const els = {};
['progress-fill', 'progress-bar', 'step-now', 'step-all', 'answered-count',
 'question-card', 'question-text', 'question-meta', 'options',
 'btn-prev', 'btn-next', 'nav-hint', 'version-tag'].forEach(id => {
  const e = makeEl('div');
  e.setAttribute('id', id);
  els[id] = e;
});
els.options.className = 'options';

/* ------------------------------------------------------------
 * 假依赖：只给 test.js 需要的那几个接口
 * ---------------------------------------------------------- */
const toasts = [];
const store = new Map();

const CLJ = {
  el: (tag, attrs, children) => {
    const n = makeEl(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(s => { n.style[s] = v[s]; });
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(c => n.appendChild(c));
    return n;
  },
  clear: n => { while (n.firstChild) n.removeChild(n.firstChild); },
  qs: sel => (sel[0] === '#' ? IDS.get(sel.slice(1)) || null : null),
  qsa: (sel, root) => {
    if (sel === '.opt') return (root || els.options).children.filter(c => c.className.split(' ').includes('opt'));
    return [];
  },
  store: {
    get: (k, fb) => (store.has(k) ? store.get(k) : fb),
    set: (k, v) => { store.set(k, v); return true; },
    remove: k => store.delete(k)
  },
  toast: msg => toasts.push(msg)
};

const QUANT = 3;
const questions = [];
for (let i = 1; i <= QUANT; i++) questions.push({ id: 'q' + i, text: '题目' + i });

/* 假的数据源。引擎和 quiz-boot 都指向同一份，二者必须一致 ——
 * 单独抽出来是为了避免 CLJ_DATA 与 CLJ_QUIZ.data 写成两个对象后走散。 */
const MOCK_DATA = {
  DEFAULT_VERSION: 'light',
  VERSIONS: { light: { label: '精简版', badge: '30题' } },
  normalizeVersion: v => v,
  questions: () => questions
};
const MOCK_SCORING = {
  OPTIONS: [
    { value: 1, label: '完全不这样' }, { value: 2, label: '不太这样' },
    { value: 3, label: '说不好' }, { value: 4, label: '比较像' }, { value: 5, label: '这就是我' }
  ]
};

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  navigator: {},
  document: { readyState: 'complete', createElement: makeEl, addEventListener() {}, title: '' },
  window: {
    location: { search: '?v=light', href: '' },
    scrollY: 0,
    scrollTo() {},
    addEventListener() {},
    CLJ_CONFIG: { BRAND: '长留玉' },
    CLJ_DATA: MOCK_DATA,
    CLJ_SCORING: MOCK_SCORING,
    /* 引擎现在靠 quiz-boot 注入数据源，这里补上同样的声明 */
    CLJ_QUIZ: { data: MOCK_DATA, scoring: MOCK_SCORING, storePrefix: 'career', questionsDir: 'js/career/' },
    CLJ: CLJ
  }
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.window.navigator = sandbox.navigator;
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox, { filename: 'quiz.js' });

/* ------------------------------------------------------------
 * 断言
 * ---------------------------------------------------------- */
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { console.log('  ✓ ' + label + ' = ' + JSON.stringify(actual)); pass++; }
  else { console.log('  ✗ ' + label + ' 期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual)); fail++; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pickVal = v => {
  const b = els.options.children.find(c => c.getAttribute('data-value') === String(v));
  if (b) b.fire('click');
};
const nowIdx = () => Number(els['step-now'].textContent);
const progress = () => store.get('career_progress') || {};

(async () => {
  console.log('\n=== 答题交互行为自检（假 DOM 跑真实答题引擎）===\n');
  console.log('  · 源码里的 ADVANCE_DELAY = ' + DELAY + 'ms（测试内临时改为 5ms 加速）\n');

  console.log('[1] 首次进入');
  eq(els.options.children.length, 5, '渲染出的选项数');
  eq(nowIdx(), 1, '当前题号');
  eq(els['btn-prev'].disabled, true, '首题「上一题」禁用');
  eq(els['btn-next'].disabled, true, '未作答时「下一题」禁用');
  eq(els['nav-hint'].textContent, '选一个最接近你的选项，选完自动进入下一题', '首题提示文案');

  console.log('\n[2] 选完一项 → 等延迟 → 自动前进');
  pickVal(4);
  eq(progress().answers.q1, 4, '答案已落库 q1');
  eq(els['nav-hint'].textContent, '已选择，正在进入下一题…', '选中瞬间的提示文案');
  eq(nowIdx(), 1, '延迟未到，仍停在第 1 题');
  await sleep(60);
  eq(nowIdx(), 2, '延迟过后自动到第 2 题');
  eq(progress().index, 1, '存档 index 同步');
  eq(els['nav-hint'].textContent, '选一个最接近你的选项，选完自动进入下一题', '第 2 题提示复位');

  console.log('\n[3] 选完后手动点「下一题」→ 不能连跳两题');
  pickVal(2);
  els['btn-next'].fire('click');
  eq(nowIdx(), 3, '手动切题立即到第 3 题');
  await sleep(60);
  eq(nowIdx(), 3, '挂起的自动跳题已被取消，没有跳到第 4 题');

  console.log('\n[4] 回退修改');
  els['btn-prev'].fire('click');
  eq(nowIdx(), 2, '「上一题」回到第 2 题');
  eq(els.options.children.find(c => c.getAttribute('data-value') === '2').className.includes('is-selected'), true, '旧答案回显为选中');
  pickVal(5);
  await sleep(60);
  eq(nowIdx(), 3, '改选后自动前进到第 3 题');
  eq(progress().answers.q2, 5, '答案被覆盖为新的值');

  console.log('\n[5] 最后一题：不自动结束');
  eq(els['btn-next'].textContent, '查看结果', '末题按钮文案');
  pickVal(3);
  await sleep(60);
  eq(nowIdx(), 3, '末题选完后停在原地，未自动跳走');
  eq(els['btn-next'].disabled, false, '末题选完后「查看结果」可点（disabled 应为 false）');
  eq(els['nav-hint'].textContent, '确认无误后点「查看结果」', '末题提示文案');
  eq(sandbox.window.location.href === '', true, '未擅自跳转到结果页');

  console.log('\n[6] 末题点「查看结果」→ 写出快照并清进度');
  els['btn-next'].fire('click');
  const fin = store.get('career_final') || {};
  eq(!!fin.answers, true, '写入 clj_career_final');
  eq(JSON.stringify(fin.answers), JSON.stringify({ q1: 4, q2: 5, q3: 3 }), '快照内容');
  eq(store.has('career_progress'), false, '清掉了进行中进度');
  eq(sandbox.window.location.href, 'result.html?v=light', '跳转地址');

  console.log('\n[7] 无意外提示');
  eq(toasts.length, 0, '本次正常流程内出现的 toast 数' + (toasts.length ? ' → ' + JSON.stringify(toasts) : ''));

  console.log('\n' + '='.repeat(46));
  if (fail) { console.log('发现 ' + fail + ' 个问题，请按上面的 ✗ 修正。'); process.exitCode = 1; }
  else { console.log('全部通过（' + pass + ' 项）。'); }
})();

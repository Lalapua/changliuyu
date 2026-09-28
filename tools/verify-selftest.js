/* ============================================================
 * 长留玉 · 全站冒烟自测（真实用户流程）
 * ------------------------------------------------------------
 * 用无头 Chrome 逐页走过：首页 → 模块页 → 开始页 → 答题(自动答完 30 题)
 * → 结果页(正常分支) → 结果页(六维持平分支)。
 * 每一页都断言关键节点渲染，并收集 window.onerror / unhandledrejection /
 * console.error。比 verify-pages 那类静态检查多一层「真的能跑通」。
 *
 * 需要本机装了 Chrome（可用环境变量 CHROME 覆盖）。
 * 运行：node tools/verify-selftest.js
 * ============================================================ */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = process.env.PORT || '5225';

const HOOK = `<script>
window.__ERR = [];
window.addEventListener('error', function (e) { window.__ERR.push('onerror: ' + e.message); });
window.addEventListener('unhandledrejection', function (e) {
  window.__ERR.push('unhandled: ' + (e.reason && (e.reason.message || e.reason)));
});
(function () {
  var ce = console.error;
  console.error = function () {
    window.__ERR.push('console.error: ' + Array.prototype.map.call(arguments, function (a) {
      return (a && a.message) || String(a);
    }).join(' ').slice(0, 120));
    ce.apply(console, arguments);
  };
})();
</script>
`;

/* 报告写进真实 <pre> 节点，Node 端按标签抓 —— 不能正则抓标记字符串，
 * 内联 <script> 源码里也有那几个字。 */
const TAIL = `<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var r = document.createElement('pre'); r.id = '__report';
    r.textContent = JSON.stringify(window.__REPORT || {});
    document.body.appendChild(r);
    var e = document.createElement('pre'); e.id = '__errs';
    e.textContent = (window.__ERR || []).join(' || ');
    document.body.appendChild(e);
  }, 500);
});
</script>
`;

function get(url) {
  return new Promise(res => {
    http.get(url, { timeout: 3000 }, r => { r.resume(); res(r.statusCode); })
      .on('error', () => res('ERR')).on('timeout', function () { this.destroy(); res('TO'); });
  });
}

function render(url) {
  return new Promise(res => {
    const prof = path.join(require('os').tmpdir(), '_st' + Date.now() + Math.floor(Math.random() * 999));
    const cp = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--user-data-dir=' + prof, '--virtual-time-budget=25000', '--dump-dom', url], { windowsHide: true });
    let out = '', done = false;
    cp.stdout.on('data', d => { out += d; });
    cp.stderr.on('data', () => {});
    const kill = setTimeout(() => {
      if (done) return; done = true;
      try { cp.kill('SIGKILL'); } catch (e) {}
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
      res(out);
    }, 50000);
    cp.on('close', () => {
      if (done) return; done = true;
      clearTimeout(kill);
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
      res(out);
    });
  });
}

function makeProbe(srcRel, outRel, extraHead, extraTail) {
  let src = fs.readFileSync(path.join(ROOT, srcRel), 'utf8');
  src = src.replace('</head>', HOOK + (extraHead || '') + '</head>');
  if (extraTail) src = src.replace(/\s*<\/body>/, '\n' + extraTail + '\n</body>');
  fs.writeFileSync(path.join(ROOT, outRel), src, 'utf8');
}

function report(dom) {
  const m = /<pre id="__report">([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) return null;
  let s = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  try { return JSON.parse(s); } catch (e) { return { parseErr: s.slice(0, 80) }; }
}
function errs(dom) {
  const m = /<pre id="__errs">([\s\S]*?)<\/pre>/.exec(dom);
  return m ? m[1] : '';
}

let pass = 0, fail = 0;
const ok = (l, x) => { console.log('  ✓ ' + l + (x ? ' → ' + x : '')); pass++; };
const bad = (l, x) => { console.log('  ✗ ' + l + (x ? ' → ' + x : '')); fail++; };
function checkErrors(dom, page) {
  const e = errs(dom);
  if (e && e.trim()) { bad(page + ' 有 JS 错误', e.trim().slice(0, 200)); return false; }
  ok(page + ' 无 JS 运行时错误');
  return true;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'preview-server.js'), PORT], { cwd: ROOT, windowsHide: true });
  srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
  let ready = false;
  for (let i = 0; i < 20; i++) {
    if (await get('http://127.0.0.1:' + PORT + '/index.html') === 200) { ready = true; break; }
    await new Promise(r => setTimeout(r, 300));
  }
  if (!ready) { console.log('服务器没起来'); process.exit(1); }
  const B = 'http://127.0.0.1:' + PORT + '/';
  let dom;

  console.log('=== 1. 首页 ===');
  makeProbe('index.html', '_t_index.html', '', TAIL.replace('window.__REPORT || {}',
    '({ mods: document.querySelectorAll(".mod-card").length, hero: !!document.querySelector(".home-hero"), slogan: (document.querySelector(".home-hero__sub")||{}).textContent })'));
  dom = await render(B + '_t_index.html');
  let r = report(dom);
  if (r) { ok('hero 渲染', r.hero); ok('2 张模块卡', r.mods === 2, r.mods + ' 张'); ok('slogan = 万物皆有回响', r.slogan === '万物皆有回响', JSON.stringify(r.slogan)); }
  else bad('首页拿不到报告');
  checkErrors(dom, '首页');

  console.log('\n=== 2. 模块列表页 ===');
  for (const modName of ['tests', 'games']) {
    makeProbe(modName + '/index.html', '_t_' + modName + '.html', '', TAIL.replace('window.__REPORT || {}',
      '({ name: (document.getElementById("module-name")||{}).textContent, items: document.querySelectorAll(".item-card").length, linkable: document.querySelectorAll("a.item-card").length, soon: document.querySelectorAll(".item-card.is-soon").length })'));
    dom = await render(B + '_t_' + modName + '.html');
    r = report(dom);
    if (r) {
      ok('「' + r.name + '」模块名正确', r.name === (modName === 'tests' ? '测试' : '小游戏'), JSON.stringify(r.name));
      ok('「' + r.name + '」条目数', r.items >= 1, r.items + ' 个（可点 ' + r.linkable + '，筹备中 ' + r.soon + '）');
    } else bad(modName + ' 模块页拿不到报告');
    checkErrors(dom, modName + ' 模块页');
  }

  console.log('\n=== 3. 职业测试开始页 ===');
  makeProbe('career/index.html', 'career/_t_start.html', '', TAIL.replace('window.__REPORT || {}',
    '({ opts: document.querySelectorAll(".version-opt").length, btn: !!document.querySelector(".btn--primary") })'));
  dom = await render(B + 'career/_t_start.html');
  r = report(dom);
  if (r) { ok('版本选项渲染', r.opts >= 2, r.opts + ' 个'); ok('有开始按钮', r.btn); }
  else bad('开始页拿不到报告');
  checkErrors(dom, '开始页');

  console.log('\n=== 4. 答题页（自动答完 30 题）===');
  const QUIZ_TAIL = `<script>
window.__REPORT = { steps: 0, finalBtn: '', hint: '', legal: '' };
(function () {
  localStorage.setItem('clj_career_version', 'light');
  var done = false;
  function step() {
    if (done) return;
    var opts = document.querySelectorAll('.opt');
    var btn = document.getElementById('btn-next');
    if (btn && btn.textContent.indexOf('查看结果') >= 0) {
      done = true;
      window.__REPORT.finalBtn = btn.textContent;
      window.__REPORT.steps = +((document.getElementById('step-now')||{}).textContent || 0);
      window.__REPORT.hint = (document.getElementById('nav-hint')||{}).textContent || '';
      window.__REPORT.legal = (document.querySelector('.quiz-nav__legal')||{}).textContent || '';
      var r = document.createElement('pre'); r.id = '__report';
      r.textContent = JSON.stringify(window.__REPORT);
      document.body.appendChild(r);
      var e = document.createElement('pre'); e.id = '__errs';
      e.textContent = (window.__ERR || []).join(' || ');
      document.body.appendChild(e);
      return;
    }
    if (opts.length) { opts[0].click(); window.__REPORT.steps++; }
    setTimeout(step, 260);
  }
  step();
})();
</script>
`;
  makeProbe('career/test.html', 'career/_t_test.html', '', QUIZ_TAIL);
  dom = await render(B + 'career/_t_test.html');
  r = report(dom);
  if (r) {
    ok('答到了最后一题', r.finalBtn.indexOf('查看结果') >= 0, '按钮=' + JSON.stringify(r.finalBtn));
    ok('进度走到 30', r.steps >= 30, 'step-now=' + r.steps);
    ok('提示行存在', r.hint.length > 0, JSON.stringify(r.hint.slice(0, 30)));
    ok('免责声明并进了提示区', r.legal.indexOf('仅供娱乐') >= 0, r.legal.slice(0, 40));
  } else bad('答题页拿不到报告（可能卡住了）');
  checkErrors(dom, '答题页');

  console.log('\n=== 5. 结果页（正常作答）===');
  const RES_SEED = `<script>
(function () {
  var level = { R: 2, I: 5, A: 4, S: 3, E: 1, C: 2 };
  var qs = window.CLJ_DATA.questions('full');
  var ans = {};
  qs.forEach(function (x, i) { var main = Object.keys(x.dims || {})[0]; var b = level[main] || 3; ans[x.id] = Math.max(1, Math.min(5, b + (i % 2 ? 1 : -1))); });
  localStorage.setItem('clj_career_final', JSON.stringify({ version: 'full', answers: ans, ts: Date.now() }));
})();
</script>
`;
  const RES_TAIL = TAIL.replace('window.__REPORT || {}',
    '({ label: (document.getElementById("code-label")||{}).textContent, code: (document.getElementById("result-code")||{}).textContent, dims: document.querySelectorAll("#dim-bars .dim-row").length, radar: document.querySelectorAll("#radar-holder svg polygon").length, careers: document.querySelectorAll("#career-main .career-card, #career-alt .career-alt").length, saveBtn: !!document.getElementById("btn-save-img"), shareBtn: !!document.getElementById("btn-share"), copyBtn: !!document.getElementById("btn-copy"), others: document.querySelectorAll("#other-tests .mini-test").length })');
  /* 种子必须插在 result.js 之前（data.js 已加载、result.js 还没跑），塞 <head> 会撞 CLJ_DATA 未定义 */
  function makeResultProbe(seedCode, outRel) {
    let src = fs.readFileSync(path.join(ROOT, 'career/result.html'), 'utf8');
    src = src.replace('</head>', HOOK + '</head>');
    src = src.replace('<script src="../js/career/result.js"></script>',
      seedCode + '<script src="../js/career/result.js"></script>');
    src = src.replace(/\s*<\/body>/, '\n' + RES_TAIL + '\n</body>');
    fs.writeFileSync(path.join(ROOT, outRel), src, 'utf8');
  }
  makeResultProbe(RES_SEED, 'career/_t_result.html');
  dom = await render(B + 'career/_t_result.html');
  r = report(dom);
  if (r) {
    ok('显示霍兰德代码', r.label.indexOf('霍兰德') >= 0, JSON.stringify(r.label));
    ok('代码位有值', r.code.length >= 3, r.code);
    ok('6 条维度明细', r.dims === 6, r.dims + ' 条');
    ok('雷达图渲染(≥5 个 polygon)', r.radar >= 5, r.radar + ' 个');
    ok('职业卡片渲染', r.careers >= 1, r.careers + ' 张');
    ok('保存图片按钮在', r.saveBtn);
    ok('分享按钮已删', !r.shareBtn);
    ok('复制链接按钮已删', !r.copyBtn);
    ok('「你可能还想测」渲染', r.others >= 1, r.others + ' 个');
  } else bad('结果页拿不到报告');
  checkErrors(dom, '结果页');

  console.log('\n=== 6. 结果页（六维持平）===');
  const FLAT_SEED = RES_SEED.replace('var level = { R: 2, I: 5, A: 4, S: 3, E: 1, C: 2 };', 'var level = null;')
    .replace('var b = level[main] || 3;', 'var b = 3;');
  makeResultProbe(FLAT_SEED, 'career/_t_result2.html');
  dom = await render(B + 'career/_t_result2.html');
  r = report(dom);
  if (r) {
    ok('持平时显示「整体投入度」', r.label.indexOf('整体投入度') >= 0, JSON.stringify(r.label));
    ok('代码位是投入等级', r.code.indexOf('投入') >= 0, r.code);
    ok('维度明细仍是 6 条', r.dims === 6, r.dims + ' 条');
    ok('职业卡片仍渲染', r.careers >= 1, r.careers + ' 张');
  } else bad('持平结果页拿不到报告');
  checkErrors(dom, '结果页(持平)');

  ['_t_index.html', '_t_tests.html', '_t_games.html', 'career/_t_start.html', 'career/_t_test.html', 'career/_t_result.html', 'career/_t_result2.html'].forEach(f => {
    try { fs.unlinkSync(path.join(ROOT, f)); } catch (e) {}
  });
  try { srv.kill('SIGKILL'); } catch (e) {}

  console.log('\n' + '='.repeat(46));
  console.log(fail ? ('发现 ' + fail + ' 个问题 / 通过 ' + pass + ' 项') : ('自测通过（' + pass + ' 项，无 bug）'));
  process.exit(fail ? 1 : 0);
})();

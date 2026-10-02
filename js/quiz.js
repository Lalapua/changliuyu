/* ============================================================
 * 长留玉 · 答题页引擎（公共模块，两个测试共用）
 * ------------------------------------------------------------
 * 这个文件不认识任何具体的测试 —— 题目从哪儿来、分值怎么算、
 * 存档键叫什么，全部由页面上先引入的 quiz-boot.js 注入（见下方）。
 * 加第三个测试时不需要碰它。
 *
 * 交互规则（硬性要求）：
 *   1. 选中一项后自动跳到下一题，无需再点「下一题」；
 *      但延后一小会儿再跳，留出时间让用户看清自己选了什么；
 *   2. 任何题都不能跳过：未作答时「下一题」按钮保持禁用态；
 *   3. 「上一题」可回退修改，「首题」不可回退；
 *   4. 最后一题不自动结束，会停在原地等用户点「查看结果」；
 *   5. 每次作答与切题都会自动存档，刷新后从「第一道没答的题」继续。
 * ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
   * 数据源：由每个测试自己的 quiz-boot.js 注入
   * ------------------------------------------------------------
   * 页面里的脚本顺序必须是：
   *   config.js → global.js → <测试的题库/画像库> → <测试的 scoring.js>
   *   → <测试的 quiz-boot.js> → 本文件
   * quiz-boot.js 只做一件事：把 window.CLJ_QUIZ 指到这套数据上，
   * 并声明自己的存储键前缀。这样同一个引擎能服务多个测试，
   * 加测试时不用复制这份答题逻辑。
   * ---------------------------------------------------------- */
  var BOOT = window.CLJ_QUIZ || {};
  var DATA = BOOT.data;
  var S = BOOT.scoring;
  var CLJ = window.CLJ;
  var CFG = window.CLJ_CONFIG;

  if (!DATA || !S) {
    /* 少了 boot 就什么都做不了，说清楚缺哪一步，别留一句莫名其妙的报错 */
    if (window.console && console.error) {
      console.error('[长留玉] 答题引擎缺少数据源。页面里要在本文件之前引入 ' +
        '该测试的 quiz-boot.js（它负责设置 window.CLJ_QUIZ）。');
    }
    return;
  }

  var PREFIX = BOOT.storePrefix || 'quiz';
  var KEY_PROGRESS = PREFIX + '_progress';   // 进行中的进度
  var KEY_FINAL = PREFIX + '_final';         // 完成后的答案快照
  var KEY_VERSION = PREFIX + '_version';     // 用户上次选择的版本
  var QUESTIONS_DIR = BOOT.questionsDir || '';   // 只在「题库没加载」的报错里用

  /* 选中后自动跳题的延迟(ms)。
   * 不能设成 0：得先让选中高亮显出来，用户才看得清自己选了什么。
   * 150ms 是「够看清选中态」和「不拖慢 120 题连答」之间的折中。 */
  var ADVANCE_DELAY = 150;

  /* ------------------------------------------------------------
   * 状态
   * ---------------------------------------------------------- */
  var state = {
    version: DATA.DEFAULT_VERSION,
    questions: [],
    answers: {},          // { 题目id: 1~5 }
    index: 0
  };

  var els = {};

  /* 自动跳题的定时器句柄。
   * 用户有可能在延迟结束前手动切题（点按钮 / 按方向键），
   * 这时必须把它取消掉，否则会出现「连跳两题」。 */
  var advanceTimer = null;

  /* ============================================================
   * 工具
   * ============================================================ */

  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function pad2(n) { return ('0' + n).slice(-2); }

  /** 第一道尚未作答的题的下标；全答完则返回 -1 */
  function firstUnanswered() {
    for (var i = 0; i < state.questions.length; i++) {
      if (state.answers[state.questions[i].id] === undefined) return i;
    }
    return -1;
  }

  function answeredCount() {
    var n = 0;
    state.questions.forEach(function (q) {
      if (state.answers[q.id] !== undefined) n++;
    });
    return n;
  }

  /* ============================================================
   * 选中后自动跳题
   * ============================================================ */

  function cancelAdvance() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  }

  function scheduleAdvance() {
    cancelAdvance();
    advanceTimer = setTimeout(function () {
      advanceTimer = null;
      autoAdvance();
    }, ADVANCE_DELAY);
  }

  /** 前进一题；最后一题不自动结束，把「确认」这步留给用户 */
  function autoAdvance() {
    if (state.index >= state.questions.length - 1) return;
    state.index++;
    save();
    renderQuestion('next');
  }

  /* ============================================================
   * 存档 / 读档
   * ============================================================ */

  function save() {
    CLJ.store.set(KEY_PROGRESS, {
      version: state.version,
      answers: state.answers,
      index: state.index,
      ts: Date.now()
    });
  }

  function restore() {
    var p = CLJ.store.get(KEY_PROGRESS, null);
    // 版本不一致的旧进度直接丢弃，避免题目对不上号
    if (!p || p.version !== state.version || !p.answers) return false;

    var valid = {};
    var total = 0;
    state.questions.forEach(function (q) {
      var v = Number(p.answers[q.id]);
      if (v >= 1 && v <= 5) { valid[q.id] = v; total++; }
    });
    state.answers = valid;
    return total > 0;
  }

  /* ============================================================
   * 渲染
   * ============================================================ */

  function cacheEls() {
    els.fill = CLJ.qs('#progress-fill');
    els.bar = CLJ.qs('#progress-bar');
    els.stepNow = CLJ.qs('#step-now');
    els.stepAll = CLJ.qs('#step-all');
    els.answered = CLJ.qs('#answered-count');
    els.card = CLJ.qs('#question-card');
    els.qText = CLJ.qs('#question-text');
    els.qMeta = CLJ.qs('#question-meta');
    els.options = CLJ.qs('#options');
    els.prev = CLJ.qs('#btn-prev');
    els.next = CLJ.qs('#btn-next');
    els.hint = CLJ.qs('#nav-hint');
    els.versionTag = CLJ.qs('#version-tag');
  }

  function renderStructure() {
    var v = DATA.VERSIONS[state.version];
    if (els.versionTag) els.versionTag.textContent = v.label + ' · ' + v.badge;
    if (els.stepAll) els.stepAll.textContent = state.questions.length;
    document.title = v.label + '答题 · ' + CFG.BRAND;
  }

  function renderQuestion(dir) {
    cancelAdvance();          // 任何一次切题都作废掉挂起的自动跳题
    var q = state.questions[state.index];

    els.qText.textContent = q.text;

    // 题干元信息：这一题在整体里的位置感觉（不给维度名，避免用户猜答案）
    if (els.qMeta) {
      els.qMeta.textContent = '第 ' + (state.index + 1) + ' / ' + state.questions.length + ' 题';
    }
    if (els.stepNow) els.stepNow.textContent = pad2(state.index + 1);

    // 重建五个选项
    CLJ.clear(els.options);
    S.OPTIONS.forEach(function (o) {
      var btn = CLJ.el('button', {
        type: 'button',
        class: 'opt',
        role: 'radio',
        'aria-checked': 'false',
        'data-value': o.value
      }, [
        CLJ.el('span', { class: 'opt__key t-num', text: o.value }),
        CLJ.el('span', { class: 'opt__label', text: o.label }),
        CLJ.el('span', { class: 'opt__mark', 'aria-hidden': 'true' })
      ]);
      btn.addEventListener('click', function () { pick(o.value); });
      els.options.appendChild(btn);
    });

    syncSelection();
    updateProgress();
    updateNav();
    animate(dir || 'next');

    // 题目切换后把视口带回顶部，长题目在小屏上体验更好
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function animate(dir) {
    var cls = dir === 'back' ? 'anim-back' : 'anim-up';
    els.card.classList.remove('anim-up', 'anim-back');
    void els.card.offsetWidth;                 // 强制重排，让动画能重复播放
    els.card.classList.add(cls);
  }

  function syncSelection() {
    var q = state.questions[state.index];
    var cur = state.answers[q.id];
    CLJ.qsa('.opt', els.options).forEach(function (btn) {
      var on = Number(btn.getAttribute('data-value')) === cur;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function updateProgress() {
    var pct = ((state.index + 1) / state.questions.length) * 100;
    if (els.fill) els.fill.style.width = pct.toFixed(2) + '%';
    if (els.bar) els.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (els.answered) els.answered.textContent = answeredCount();
  }

  function updateNav() {
    var q = state.questions[state.index];
    var answered = state.answers[q.id] !== undefined;
    var isLast = state.index === state.questions.length - 1;

    els.prev.disabled = state.index === 0;
    els.next.disabled = !answered;
    els.next.textContent = isLast ? '查看结果' : '下一题';

    if (els.hint) {
      if (!answered) {
        els.hint.textContent = isLast
          ? '选一个最接近你的选项'
          : '选一个最接近你的选项，选完自动进入下一题';
      } else {
        els.hint.textContent = isLast
          ? '确认无误后点「查看结果」'
          : '已选择，正在进入下一题…';
      }
    }
  }

  /* ============================================================
   * 交互
   * ============================================================ */

  function pick(value) {
    var q = state.questions[state.index];
    state.answers[q.id] = value;
    syncSelection();
    updateNav();
    updateProgress();
    save();

    // 轻微震动反馈（支持的设备才有，失败就算了）
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }

    // 选完即走，不用再点「下一题」
    scheduleAdvance();
  }

  function goNext() {
    var q = state.questions[state.index];
    if (state.answers[q.id] === undefined) {
      CLJ.toast('先选一项再继续吧');
      els.options.classList.remove('anim-pop');
      void els.options.offsetWidth;
      els.options.classList.add('anim-pop');
      return;
    }
    if (state.index === state.questions.length - 1) { finish(); return; }
    state.index++;
    save();
    renderQuestion('next');
  }

  function goPrev() {
    if (state.index === 0) return;
    state.index--;
    save();
    renderQuestion('back');
  }

  function finish() {
    var missing = firstUnanswered();
    if (missing >= 0) {
      // 防御：正常情况下不会走到这里
      state.index = missing;
      renderQuestion('back');
      CLJ.toast('还有 ' + (state.questions.length - answeredCount()) + ' 题没答');
      return;
    }
    CLJ.store.set(KEY_FINAL, {
      version: state.version,
      answers: state.answers,
      ts: Date.now()
    });
    CLJ.store.remove(KEY_PROGRESS);
    window.location.href = 'result.html?v=' + encodeURIComponent(state.version);
  }

  /* ============================================================
   * 启动
   * ============================================================ */

  function boot() {
    cacheEls();

    state.version = DATA.normalizeVersion(getParam('v') || CLJ.store.get(KEY_VERSION, DATA.DEFAULT_VERSION));
    CLJ.store.set(KEY_VERSION, state.version);
    state.questions = DATA.questions(state.version);

    if (!state.questions.length) {
      els.qText.textContent = '题库加载失败了';
      els.qMeta.textContent = '请检查 ' + QUESTIONS_DIR + ' 下的题库文件是否已正确引入。';
      els.next.disabled = true;
      els.prev.disabled = true;
      return;
    }

    restore();

    // 定位到第一道未作答的题；如果全答完了，停在最后一题等用户点「查看结果」
    var idx = firstUnanswered();
    state.index = idx >= 0 ? idx : state.questions.length - 1;

    renderStructure();
    renderQuestion('next');

    els.next.addEventListener('click', goNext);
    els.prev.addEventListener('click', goPrev);

    // 桌面端快捷键：1~5 选项，左右方向键切题，回车继续
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;
      if (k >= '1' && k <= '5') { pick(Number(k)); return; }
      if (k === 'ArrowLeft') { goPrev(); return; }
      if (k === 'ArrowRight' || k === 'Enter') {
        if (!els.next.disabled) goNext();
      }
    });

    // 离开页面前再存一次，防止极端情况丢进度
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') save();
    });

    if (window.CLJ_DATA && window.CLJ_DATA.validate) {
      var rep = window.CLJ_DATA.validate();
      if (!rep.ok) console.warn('[长留玉] 数据自检发现问题：', rep);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* ============================================================
 * 长留玉 · 开始页逻辑（公共模块，两个测试共用）
 * ------------------------------------------------------------
 * 职责：选择版本、显示上次进度、跳转到答题页。
 * 和答题引擎一样，它不认识任何具体测试 —— 数据源与存储键前缀
 * 都从页面上先引入的 quiz-boot.js 里读（window.CLJ_QUIZ）。
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;
  var BOOT = window.CLJ_QUIZ || {};
  var DATA = BOOT.data;
  var CLJ = window.CLJ;

  if (!DATA) {
    if (window.console && console.error) {
      console.error('[长留玉] 开始页缺少数据源。页面里要在本文件之前引入该测试的 quiz-boot.js。');
    }
    return;
  }

  var PREFIX = BOOT.storePrefix || 'quiz';
  var KEY_PROGRESS = PREFIX + '_progress';
  var KEY_VERSION = PREFIX + '_version';
  var TEST_NAME = BOOT.testName || '测试';

  var current = DATA.DEFAULT_VERSION;

  function answeredCount(progress) {
    if (!progress || !progress.answers) return 0;
    return Object.keys(progress.answers).length;
  }

  function renderVersions() {
    var box = CLJ.qs('#version-list');
    CLJ.clear(box);

    Object.keys(DATA.VERSIONS).forEach(function (id) {
      var v = DATA.VERSIONS[id];
      var btn = CLJ.el('button', { type: 'button', class: 'version-opt', 'data-id': id }, [
        CLJ.el('span', { class: 'version-opt__tick', 'aria-hidden': 'true' }),
        CLJ.el('span', { class: 'version-opt__top' }, [
          CLJ.el('span', { class: 'version-opt__label', text: v.label }),
          CLJ.el('span', { class: 'version-opt__badge', text: v.badge })
        ]),
        CLJ.el('p', { class: 'version-opt__desc', text: v.tagline }),
        CLJ.el('p', { class: 'version-opt__desc', text: v.desc })
      ]);
      btn.addEventListener('click', function () { select(id); });
      box.appendChild(btn);
    });

    select(current, true);
  }

  function select(id, silent) {
    current = DATA.normalizeVersion(id);
    CLJ.store.set(KEY_VERSION, current);
    CLJ.qsa('.version-opt').forEach(function (n) {
      n.classList.toggle('is-active', n.getAttribute('data-id') === current);
    });
    updateStartButton();
    renderResume(silent);
  }

  function updateStartButton() {
    var v = DATA.VERSIONS[current];
    var btn = CLJ.qs('#btn-start');
    btn.textContent = '开始测试 · ' + v.label + '（' + v.count + ' 题）';
  }

  function renderResume(silent) {
    var tip = CLJ.qs('#resume-tip');
    var clearBtn = CLJ.qs('#btn-clear-resume');
    var p = CLJ.store.get(KEY_PROGRESS, null);

    var valid = p && p.version === current && answeredCount(p) > 0;

    if (!valid) {
      tip.hidden = true;
      clearBtn.hidden = true;
      return;
    }

    var n = answeredCount(p);
    tip.hidden = false;
    tip.textContent = '检测到上次的进度：已答 ' + n + ' / ' +
      DATA.questions(current).length + ' 题，点开始会自动从第 ' + (n + 1) + ' 题继续。';
    clearBtn.hidden = false;

    if (!silent) CLJ.toast('已切换到' + DATA.VERSIONS[current].label);
  }

  function boot() {
    // 进入开始页时，先按上次选择的版本高亮
    current = DATA.normalizeVersion(CLJ.store.get(KEY_VERSION, DATA.DEFAULT_VERSION));

    var v = DATA.VERSIONS[current];
    document.title = TEST_NAME + CFG.SHARE_TITLE_SUFFIX;

    var badge = CLJ.qs('#hero-badge');
    if (badge) badge.textContent = v.label + ' · ' + v.badge;

    renderVersions();

    CLJ.qs('#btn-start').addEventListener('click', function () {
      window.location.href = 'test.html?v=' + encodeURIComponent(current);
    });

    CLJ.qs('#btn-clear-resume').addEventListener('click', function () {
      CLJ.store.remove(KEY_PROGRESS);
      CLJ.toast('已清除上次进度');
      renderResume(true);
      CLJ.qs('#resume-tip').hidden = true;
      CLJ.qs('#btn-clear-resume').hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

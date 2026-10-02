/* ============================================================
 * 长留玉 · 天赋测试 · 答题引擎的数据源声明
 * ------------------------------------------------------------
 * 必须在 js/quiz.js 之前加载。引擎本身不认识任何具体测试，
 * 靠这里的 window.CLJ_QUIZ 知道题目从哪儿来、分值怎么算、存档键叫什么。
 * ============================================================ */
(function () {
  'use strict';
  window.CLJ_QUIZ = {
    data: window.CLJ_TALENT_DATA,
    scoring: window.CLJ_TALENT_SCORING,
    storePrefix: 'talent',        // → talent_progress / talent_final / talent_version
    questionsDir: 'js/talent/',   // 只在「题库没加载」的报错文案里用
    testName: '你的天赋是什么'      // 开始页用它设置标签页标题
  };
})();

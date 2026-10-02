/* ============================================================
 * 长留玉 · 天赋测试 · 数据访问层
 * ------------------------------------------------------------
 * 和职业测试的数据层同一个套路：把题库、画像库、版本收在一起，
 * 页面只跟这里打交道，将来换数据文件页面不用改。
 *
 * 依赖：questions.js、talents.js
 *      （都用 `window.XXX = (window.XXX || []).concat([...])` 的写法，
 *        引入顺序无所谓，文件数量也可以随意增减。）
 * ============================================================ */
(function () {
  'use strict';

  var CLJ_TALENT_DATA = {};

  /* ------------------------------------------------------------
   * 版本定义
   * ------------------------------------------------------------
   * 天赋测试目前只有一版（40 题）。仍然做成「版本表」而不是写死，
   * 是为了和职业测试共用同一套答题流程；将来要加「速测 16 题」
   * 或「完整 80 题」，在这里加一项即可，页面代码一行都不用动。
   * ---------------------------------------------------------- */
  CLJ_TALENT_DATA.VERSIONS = {
    light: {
      id: 'light',
      label: '标准版',
      badge: '40 题',
      count: 40,
      minutes: 5,
      tagline: '八项能力各问 5 句，五分钟左右出结果',
      desc: '八种能力各出 5 道题，问的都是「你会不会这么做」这种具体行为，而不是让你自己评价自己有多强。'
    }
  };

  CLJ_TALENT_DATA.DEFAULT_VERSION = 'light';

  CLJ_TALENT_DATA.isVersion = function (v) {
    return Object.prototype.hasOwnProperty.call(CLJ_TALENT_DATA.VERSIONS, v);
  };

  CLJ_TALENT_DATA.normalizeVersion = function (v) {
    return CLJ_TALENT_DATA.isVersion(v) ? v : CLJ_TALENT_DATA.DEFAULT_VERSION;
  };

  /** 取题库（目前只有一个版本，留着参数是为了将来扩展 */
  CLJ_TALENT_DATA.questions = function (version) {
    CLJ_TALENT_DATA.normalizeVersion(version);
    return window.CLJ_TALENT_QUESTIONS || [];
  };

  /** 取天赋画像库 */
  CLJ_TALENT_DATA.talents = function () {
    return window.CLJ_TALENTS || [];
  };

  /** 按维度代码取画像 */
  CLJ_TALENT_DATA.talentById = function (id) {
    var list = CLJ_TALENT_DATA.talents();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  /* ------------------------------------------------------------
   * 自检：数据格式是否合格
   * 结果页会在控制台打印一份；tools/verify-talent.js 也复用同一套判断，
   * 保证「运行时自检」和「命令行自检」说的是一回事。
   * ---------------------------------------------------------- */
  CLJ_TALENT_DATA.validate = function () {
    var S = window.CLJ_TALENT_SCORING;
    var keys = S ? S.DIM_KEYS : ['LIN', 'LOG', 'SPA', 'MUS', 'BOD', 'PER', 'INT', 'NAT'];
    var perDim = S ? S.PER_DIM_LIGHT : 5;
    var report = { ok: true, errors: [], warnings: [], stats: {} };

    /* ---- 题库 ---- */
    var qs = CLJ_TALENT_DATA.questions();
    var ids = {}, counts = {};
    keys.forEach(function (k) { counts[k] = 0; });

    if (!qs.length) {
      report.errors.push('题库为空');
    }
    qs.forEach(function (q, i) {
      var where = '题库 第 ' + (i + 1) + ' 题';
      if (!q || typeof q !== 'object') { report.errors.push(where + '：不是对象'); return; }
      if (!q.id) report.errors.push(where + '：缺 id');
      else if (ids[q.id]) report.errors.push(where + '：id 重复 ' + q.id);
      else ids[q.id] = true;

      if (!q.text) report.errors.push(where + '：缺 text');
      else if (q.text.length < 8) report.warnings.push(where + '（' + q.id + '）：题干只有 ' + q.text.length + ' 字，偏短');
      else if (q.text.length > 40) report.warnings.push(where + '（' + q.id + '）：题干 ' + q.text.length + ' 字，偏长');

      if (!q.dims || !Object.keys(q.dims).length) {
        report.errors.push(where + '：缺 dims');
        return;
      }
      Object.keys(q.dims).forEach(function (k) {
        if (keys.indexOf(k) < 0) { report.errors.push(where + '：未知维度 ' + k); return; }
        if (typeof q.dims[k] !== 'number') { report.errors.push(where + '：维度 ' + k + ' 权重不是数字'); return; }
        counts[k] += 1;
      });
    });

    keys.forEach(function (k) {
      if (counts[k] !== perDim) {
        report.errors.push('维度 ' + k + ' 实际 ' + counts[k] + ' 题，期望 ' + perDim + ' 题');
      }
    });
    report.stats['题库'] = { total: qs.length, perDim: counts };

    /* ---- 画像库 ---- */
    var ts = CLJ_TALENT_DATA.talents();
    var tids = {};
    ts.forEach(function (t, i) {
      var where = '画像 第 ' + (i + 1) + ' 条';
      if (!t || typeof t !== 'object') { report.errors.push(where + '：不是对象'); return; }
      if (!t.id) report.errors.push(where + '：缺 id');
      else if (tids[t.id]) report.errors.push(where + '：id 重复 ' + t.id);
      else tids[t.id] = true;

      if (!t.name) report.errors.push(where + '：缺 name');
      if (!t.tagline) report.errors.push(where + '：缺 tagline');
      if (!t.desc) report.errors.push(where + '：缺 desc');
      if (!t.watch) report.errors.push(where + '：缺 watch（要留意的地方，不能只讲好话）');
      if (!Array.isArray(t.directions) || !t.directions.length) report.errors.push(where + '：directions 必须是非空数组');
    });

    keys.forEach(function (k) {
      if (!tids[k]) report.errors.push('维度 ' + k + ' 没有对应的画像');
    });
    Object.keys(tids).forEach(function (id) {
      if (keys.indexOf(id) < 0) report.errors.push('画像 ' + id + ' 找不到对应维度');
    });
    report.stats['画像库'] = { total: ts.length };

    report.ok = report.errors.length === 0;
    return report;
  };

  window.CLJ_TALENT_DATA = CLJ_TALENT_DATA;
})();

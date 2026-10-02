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
   * 轻量版 40 题（每维 5 题，约 5 分钟）；
   * 全量版 80 题 = 轻量版全部 + 40 道补充（每维 10 题，约 10 分钟）。
   * 全量版是轻量版的**超集** —— 核心题目一致，两个版本的分数才可比。
   * ---------------------------------------------------------- */
  CLJ_TALENT_DATA.VERSIONS = {
    light: {
      id: 'light',
      label: '轻量版',
      badge: '40 题',
      count: 40,
      minutes: 5,
      tagline: '八项各问 5 句，五分钟左右出结果',
      desc: '每项能力 5 道题，问的都是「你会不会这么做」这种具体行为，而不是让你自己评价自己有多强。'
    },
    full: {
      id: 'full',
      label: '全量版',
      badge: '80 题',
      count: 80,
      minutes: 10,
      tagline: '每项 10 题，相近的两项也能分出高低',
      desc: '在轻量版的基础上每项再加 5 道更细的题，能分出「语言还是表达」「人际还是内省」这类挨得很近的能力，结果和名人匹配都更稳。'
    }
  };

  CLJ_TALENT_DATA.DEFAULT_VERSION = 'light';

  CLJ_TALENT_DATA.isVersion = function (v) {
    return Object.prototype.hasOwnProperty.call(CLJ_TALENT_DATA.VERSIONS, v);
  };

  CLJ_TALENT_DATA.normalizeVersion = function (v) {
    return CLJ_TALENT_DATA.isVersion(v) ? v : CLJ_TALENT_DATA.DEFAULT_VERSION;
  };

  /** 取题库。全量版 = 轻量版 40 题 + 补充 40 题 */
  CLJ_TALENT_DATA.questions = function (version) {
    var v = CLJ_TALENT_DATA.normalizeVersion(version);
    var light = window.CLJ_TALENT_Q_LIGHT || [];
    if (v === 'full') return light.concat(window.CLJ_TALENT_Q_EXTRA || []);
    return light;
  };

  /** 取天赋画像库 */
  CLJ_TALENT_DATA.talents = function () {
    return window.CLJ_TALENTS || [];
  };

  /** 取「和你最像的名人」库 */
  CLJ_TALENT_DATA.figures = function () {
    return window.CLJ_TALENT_FIGURES || [];
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

    /* ---- 题库：两个版本分别检查 ---- */
    function checkBank(list, name, expectPerDim) {
      var ids = {}, counts = {};
      keys.forEach(function (k) { counts[k] = 0; });

      if (!list || !list.length) {
        report.errors.push(name + '：为空');
        report.stats[name] = { total: 0, perDim: counts };
        return;
      }
      list.forEach(function (q, i) {
        var where = name + ' 第 ' + (i + 1) + ' 题';
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
        if (counts[k] !== expectPerDim) {
          report.errors.push(name + '：维度 ' + k + ' 实际 ' + counts[k] + ' 题，期望 ' + expectPerDim + ' 题');
        }
      });
      report.stats[name] = { total: list.length, perDim: counts };
    }

    checkBank(CLJ_TALENT_DATA.questions('light'), '轻量版题库', perDim);
    checkBank(CLJ_TALENT_DATA.questions('full'), '全量版题库', perDim * 2);

    /* 全量版必须是轻量版的超集，否则两个版本的分数没法比 */
    var lightIds = {};
    CLJ_TALENT_DATA.questions('light').forEach(function (q) { lightIds[q.id] = true; });
    var missingSuperset = CLJ_TALENT_DATA.questions('full').filter(function (q) { return !lightIds[q.id]; });
    if (missingSuperset.length && CLJ_TALENT_DATA.questions('light').length) {
      report.warnings.push('全量版比轻量版少 ' + (CLJ_TALENT_DATA.questions('full').length - missingSuperset.length) +
        ' 道重叠题（正常，只是提醒：两版核心题不一致时分数不可直接比较）');
    }

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
      /* name 必须是「形容词 + 名词」的结构：光是名词太单薄，
       * 用长度做一个粗筛（「拆解者」3 字不合格，「清醒的拆解者」6 字合格）。 */
      if (t.name && t.name.length < 5) {
        report.errors.push(where + '（' + t.name + '）：name 太短，要用「形容词 + 名词」的结构');
      }
    });

    keys.forEach(function (k) {
      if (!tids[k]) report.errors.push('维度 ' + k + ' 没有对应的画像');
    });
    Object.keys(tids).forEach(function (id) {
      if (keys.indexOf(id) < 0) report.errors.push('画像 ' + id + ' 找不到对应维度');
    });
    report.stats['画像库'] = { total: ts.length };

    /* ---- 名人的库 ---- */
    var fs = CLJ_TALENT_DATA.figures();
    var fids = {}, byPrimary = {};
    keys.forEach(function (k) { byPrimary[k] = 0; });
    fs.forEach(function (f, i) {
      var where = '名人 第 ' + (i + 1) + ' 条';
      if (!f || typeof f !== 'object') { report.errors.push(where + '：不是对象'); return; }
      if (!f.id) report.errors.push(where + '：缺 id');
      else if (fids[f.id]) report.errors.push(where + '：id 重复 ' + f.id);
      else fids[f.id] = true;

      if (!f.name) report.errors.push(where + '：缺 name');
      if (!f.why) report.errors.push(where + '：缺 why（要说清他哪里和这个组合对得上）');
      if (!f.w) { report.errors.push(where + '（' + (f.name || f.id) + '）：缺 w 权重'); return; }

      var max = 0, main = null;
      keys.forEach(function (k) {
        var v = f.w[k];
        if (typeof v !== 'number') { report.errors.push(where + '（' + (f.name || f.id) + '）：w.' + k + ' 缺失或非数字'); return; }
        if (v < 0 || v > 5) report.errors.push(where + '（' + (f.name || f.id) + '）：w.' + k + '=' + v + ' 超出 0~5');
        if (v > max) { max = v; main = k; }
      });
      if (main) byPrimary[main] += 1;
      if (max < 4) report.warnings.push(where + '（' + (f.name || f.id) + '）：八维权重最高只有 ' + max + '，形状太平，很难被匹配到');
    });

    /* 每一项能力都要有足够的名人可选，否则同一类人永远匹配到同一位 */
    keys.forEach(function (k) {
      if (byPrimary[k] < 3) {
        report.warnings.push('以「' + (window.CLJ_TALENT_SCORING ? window.CLJ_TALENT_SCORING.dim(k).name : k) +
          '」为最强项的名人只有 ' + byPrimary[k] + ' 位，建议至少 3 位');
      }
    });
    report.stats['名人的库'] = { total: fs.length, byPrimary: byPrimary };

    report.ok = report.errors.length === 0;
    return report;
  };

  window.CLJ_TALENT_DATA = CLJ_TALENT_DATA;
})();

/* ============================================================
 * 长留玉 · 职业测试 · 数据访问层
 * ------------------------------------------------------------
 * 把「题库文件 / 职业库文件 / 版本配置」收在一起，
 * 页面只跟这里打交道，将来拆分或替换数据文件时页面不用改。
 *
 * 依赖：questions-light.js、questions-full-part*.js、careers-part*.js
 *      （这些文件都用 `window.XXX = (window.XXX || []).concat([...])` 的写法，
 *        所以引入顺序无所谓，文件数量也可以随意增减。）
 * ============================================================ */
(function () {
  'use strict';

  var CLJ_DATA = {};

  /* ------------------------------------------------------------
   * 版本定义：新增版本（比如 60 题中量版）只需在这里加一项
   * ---------------------------------------------------------- */
  CLJ_DATA.VERSIONS = {
    light: {
      id: 'light',
      label: '精简版',
      badge: '30 题',
      count: 30,
      minutes: 3,
      tagline: '十分钟内出结果，适合随手发朋友圈',
      desc: '从六个维度快速勾出你的职业倾向轮廓，问题少、节奏快。'
    },
    full: {
      id: 'full',
      label: '全量版',
      badge: '120 题',
      count: 120,
      minutes: 12,
      tagline: '每维 20 题，结果更稳、职业推荐更细',
      desc: '每个维度 20 道题，能分辨出相近维度之间的细微差别，结果解读和职业推荐都更详细。'
    }
  };

  CLJ_DATA.DEFAULT_VERSION = 'light';

  /** 版本是否合法 */
  CLJ_DATA.isVersion = function (v) {
    return Object.prototype.hasOwnProperty.call(CLJ_DATA.VERSIONS, v);
  };

  /** 规范化版本号，非法值回落到默认版本 */
  CLJ_DATA.normalizeVersion = function (v) {
    return CLJ_DATA.isVersion(v) ? v : CLJ_DATA.DEFAULT_VERSION;
  };

  /** 取某版本的题库 */
  CLJ_DATA.questions = function (version) {
    version = CLJ_DATA.normalizeVersion(version);
    if (version === 'full') return window.CLJ_QUESTIONS_FULL || [];
    return window.CLJ_QUESTIONS_LIGHT || [];
  };

  /** 取职业库 */
  CLJ_DATA.careers = function () {
    return window.CLJ_CAREERS || [];
  };

  /** 取去重后的类别列表（按职业库中的出现顺序） */
  CLJ_DATA.categories = function () {
    var seen = {}, out = [];
    CLJ_DATA.careers().forEach(function (c) {
      if (!c || !c.category) return;
      if (seen[c.category]) return;
      seen[c.category] = true;
      out.push(c.category);
    });
    return out;
  };

  /** 按 id 取职业 */
  CLJ_DATA.careerById = function (id) {
    var list = CLJ_DATA.careers();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  /* ------------------------------------------------------------
   * 自检：数据格式是否合格
   * 结果页会在控制台打印一份，开发时随手看一眼就知道有没有写错。
   * ---------------------------------------------------------- */
  CLJ_DATA.validate = function () {
    var S = window.CLJ_SCORING;
    var keys = S ? S.DIM_KEYS : ['R', 'I', 'A', 'S', 'E', 'C'];
    var report = { ok: true, errors: [], warnings: [], stats: {} };

    function checkQuestions(list, name, expectPerDim) {
      var ids = {}, counts = {};
      keys.forEach(function (k) { counts[k] = 0; });

      // 当前页面没有引入这份题库（比如首页只做展示），跳过而不是报错
      if (!list || !list.length) {
        report.warnings.push(name + '：本页未加载，已跳过检查');
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
        if (!q.dims || !Object.keys(q.dims).length) {
          report.errors.push(where + '：缺 dims');
        } else {
          var main = null, mainW = -1;
          Object.keys(q.dims).forEach(function (k) {
            var w = q.dims[k];
            if (keys.indexOf(k) < 0) { report.errors.push(where + '：未知维度 ' + k); return; }
            if (typeof w !== 'number') { report.errors.push(where + '：维度 ' + k + ' 权重不是数字'); return; }
            if (w > mainW) { mainW = w; main = k; }
          });
          // 均衡性按「主维度」计：次要维度只影响计分幅度，不该被算成独立一题
          if (main) counts[main] += 1;
        }
      });

      if (expectPerDim) {
        keys.forEach(function (k) {
          if (counts[k] !== expectPerDim) {
            report.errors.push(name + '：维度 ' + k + ' 实际 ' + counts[k] + ' 题，期望 ' + expectPerDim + ' 题');
          }
        });
      }
      report.stats[name] = { total: list.length, perDim: counts };
    }

    checkQuestions(window.CLJ_QUESTIONS_LIGHT, '精简版题库', 5);
    checkQuestions(window.CLJ_QUESTIONS_FULL, '全量版题库', 20);

    var careers = CLJ_DATA.careers();
    var cid = {}, catCount = {};
    if (!careers.length) {
      report.warnings.push('职业库：本页未加载，已跳过检查');
    }
    careers.forEach(function (c, i) {
      var where = '职业 第 ' + (i + 1) + ' 条';
      if (!c || typeof c !== 'object') { report.errors.push(where + '：不是对象'); return; }
      if (!c.id) report.errors.push(where + '：缺 id');
      else if (cid[c.id]) report.errors.push(where + '：id 重复 ' + c.id);
      else cid[c.id] = true;

      if (!c.name) report.errors.push(where + '：缺 name');
      if (!c.category) report.errors.push(where + '：缺 category');
      else catCount[c.category] = (catCount[c.category] || 0) + 1;
      if (!c.desc) report.errors.push(where + '：缺 desc');
      if (!c.env) report.errors.push(where + '：缺 env');
      if (!Array.isArray(c.skills) || !c.skills.length) report.errors.push(where + '：skills 必须是数组');

      if (!c.w) { report.errors.push(where + '：缺 w 权重'); return; }
      var max = 0;
      keys.forEach(function (k) {
        if (typeof c.w[k] !== 'number') report.errors.push(where + '：w.' + k + ' 缺失或非数字');
        else max = Math.max(max, c.w[k]);
      });
      if (max < 4) report.warnings.push(where + '（' + c.name + '）：六维权重最高只有 ' + max + '，区分度可能不足');

      // energy：匹配算法「能量轴」的输入，必须是 0~1 的数字
      if (typeof c.energy !== 'number') {
        report.errors.push(where + '（' + (c.name || c.id) + '）：缺 energy（0~1 数字）');
      } else if (!(c.energy >= 0 && c.energy <= 1)) {
        report.errors.push(where + '（' + (c.name || c.id) + '）：energy=' + c.energy + ' 超出 0~1');
      }
    });

    if (careers.length < 100) {
      report.warnings.push('职业库只有 ' + careers.length + ' 个，少于 100 个');
    }

    report.stats['职业库'] = { total: careers.length, perCategory: catCount };
    report.ok = report.errors.length === 0;
    return report;
  };

  window.CLJ_DATA = CLJ_DATA;
})();

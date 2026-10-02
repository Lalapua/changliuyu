/* ============================================================
 * 长留玉 · 天赋测试 · 计分与判定
 * ------------------------------------------------------------
 * 测验框架：加德纳（Howard Gardner）多元智能理论，八种智能。
 * 选它而不是自己编维度，理由和职业测试用霍兰德一样 —— 是学界
 * 公认的模型，说得清、查得到，不用自己硬造一套。
 *
 * 八维：
 *   LIN 语言智能   对文字和语言的敏感度
 *   LOG 逻辑数理   推理、因果、数量关系
 *   SPA 视觉空间   在脑子里转立体图像
 *   MUS 音乐节奏   听出音高、节奏、结构的差别
 *   BOD 身体动觉   用身体去学、去表达
 *   PER 人际交往   读得出别人的情绪和意图
 *   INT 自我内省   看得清自己的想法和动机
 *   NAT 自然观察   辨认、归类自然与人造世界里的模式
 *
 * 计分：每维 5 题，1~5 分自评 —— 原始分 5~25，
 *       pct = (原始分 / 题数 - 1) / 4 × 100，落在 0~100。
 *       和职业测试同一套映射，两边的分数含义一致。
 *
 * 没有「匹配度」这个概念 —— 天赋不是要匹配给谁，就是你自己的分布。
 * 所以结果页直接显示八维分值，不做拉伸。
 * ============================================================ */
(function () {
  'use strict';

  var DIM_KEYS = ['LIN', 'LOG', 'SPA', 'MUS', 'BOD', 'PER', 'INT', 'NAT'];

  var DIM_INFO = {
    LIN: { name: '语言', full: '语言智能', en: 'LINGUISTIC',
           short: '对文字和语言的敏感度',
           desc: '你容易被词语本身的质地吸引：同一件事换种说法，你能听出味道不一样。' },
    LOG: { name: '逻辑', full: '逻辑数理智能', en: 'LOGICAL',
           short: '推理、因果与数量关系',
           desc: '看到一堆信息，你会下意识想找出里面的因果关系和规律。' },
    SPA: { name: '空间', full: '视觉空间智能', en: 'SPATIAL',
           short: '在脑中构建和旋转图像',
           desc: '看过一遍的东西，你能在脑子里把它转个角度重新看。' },
    MUS: { name: '音乐', full: '音乐节奏智能', en: 'MUSICAL',
           short: '对音高、节奏与结构的敏感',
           desc: '你会注意到别人忽略的声音细节：走音、抢拍、某段旋律的重复。' },
    BOD: { name: '动觉', full: '身体动觉智能', en: 'BODILY',
           short: '用身体去学、去表达',
           desc: '很多事要上手做一遍才真的懂，光看光听总差一层。' },
    PER: { name: '人际', full: '人际交往智能', en: 'INTERPERSONAL',
           short: '读别人的情绪和意图',
           desc: '你常常在对方开口之前，就已经感觉到他今天不太对劲。' },
    INT: { name: '内省', full: '自我内省智能', en: 'INTRAPERSONAL',
           short: '看清自己的想法与动机',
           desc: '你习惯回头看自己的选择，也说得清当时到底为什么那么做。' },
    NAT: { name: '自然', full: '自然观察智能', en: 'NATURALISTIC',
           short: '辨认与归类身边的模式',
           desc: '你对物的分类有天然的敏感：这株和那株哪里不一样，你一眼看得出。' }
  };

  var ANSWER_MIN = 1;
  var ANSWER_MAX = 5;
  var PER_DIM_LIGHT = 5;          // 每维题数（40 题 ÷ 8 维）

  /* 自评量表。和职业测试用同一套措辞 —— 两边尺度一致，
   * 用户在这两个测试里选「4」的心理含义才是一样的。 */
  var OPTIONS = [
    { value: 1, label: '完全不这样', tone: '极低' },
    { value: 2, label: '不太这样', tone: '偏低' },
    { value: 3, label: '一般', tone: '中性' },
    { value: 4, label: '比较这样', tone: '偏高' },
    { value: 5, label: '这简直就是我', tone: '极高' }
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** 把 5 个 1~5 的自评换算成 0~100 */
  function toPct(sum, count) {
    if (!count) return 0;
    var mean = sum / count;                       // 1~5
    return clamp(Math.round((mean - ANSWER_MIN) / (ANSWER_MAX - ANSWER_MIN) * 100), 0, 100);
  }

  /**
   * 计分。未作答的题按「中间值 3」计入 —— 不填空会导致分母变小、分值虚高，
   * 而结果页本来就有「已答 N 题」的提示，用户心里有数。
   */
  function computeScores(questions, answers) {
    var sum = {}, count = {};
    DIM_KEYS.forEach(function (k) { sum[k] = 0; count[k] = 0; });

    (questions || []).forEach(function (q) {
      var dims = q.dims || {};
      Object.keys(dims).forEach(function (k) {
        if (DIM_KEYS.indexOf(k) < 0) return;
        var w = Number(dims[k]) || 0;
        if (w <= 0) return;
        var raw = answers && answers[q.id];
        var val = (typeof raw === 'number' && raw >= ANSWER_MIN && raw <= ANSWER_MAX) ? raw : 3;
        /* 权重 w 表示这题在多大程度上算进该维度：按 (val - 3) × w 累加，
         * 再除以权重总和 —— 这样「一道 0.5 权重的题」不会把维度整体拉偏。 */
        sum[k] += (val - 3) * w;
        count[k] += Math.abs(w);
      });
    });

    var pct = {};
    DIM_KEYS.forEach(function (k) {
      /* count 是权重和；把「(均值-3)/4×100 + 50」换算成 0~100 的常规分值 */
      var meanOffset = count[k] ? (sum[k] / count[k]) : 0;      // 相对中性值 3 的偏移，-2~+2
      pct[k] = clamp(Math.round(50 + meanOffset / 2 * 50), 0, 100);
    });

    var values = DIM_KEYS.map(function (k) { return pct[k]; });
    var avg = values.reduce(function (a, b) { return a + b; }, 0) / DIM_KEYS.length;
    var variance = values.reduce(function (a, v) { return a + (v - avg) * (v - avg); }, 0) / DIM_KEYS.length;

    /* 排序：分值降序；分值相同按 DIM_KEYS 的定义顺序，保证结果可复现 */
    var order = DIM_KEYS.slice().sort(function (a, b) {
      if (pct[b] !== pct[a]) return pct[b] - pct[a];
      return DIM_KEYS.indexOf(a) - DIM_KEYS.indexOf(b);
    });

    return { sum: sum, count: count, pct: pct, order: order, avg: avg, variance: variance };
  }

  /**
   * 「八项没有明显形状」的判定阈值 —— 作用在 0~100 分值上，等价于标准差。
   * 阈值取 3.5 分（和职业测试同一个量级）：八项彼此差不了几分时，
   * 说「你的长板是某某」就是编的，那种情况要如实说「比较均衡」。
   *
   * 这里踩过一次坑，记下来：职业测试最初把这个阈值设在归一化向量上，
   * 换算成百分制相当于「标准差 < 10 分就算持平」，结果 28.7% 的正常作答
   * 被误判成没有形状。阈值只能收紧不能放松。
   */
  var FLAT_STD = 3.5;

  function isFlat(scores) {
    return Math.sqrt(scores.variance) < FLAT_STD;
  }

  /** 取分值最高的 n 个维度 */
  function topDims(scores, n) {
    return scores.order.slice(0, Math.max(1, n || 3));
  }

  /** 取分值最低的维度 —— 用来提示「相对最弱的那一项」 */
  function bottomDim(scores) {
    return scores.order[scores.order.length - 1];
  }

  /**
   * 八项持平时改谈「整体水平」。
   * 按平均分给五档，只描述状态，不编造成就 —— 全高不等于样样精通，
   * 更可能是「把想做的当成了擅长的」，这话得说出来。
   */
  var LEVELS = [
    { max: 20, code: '尚未显影', desc: '八项都没怎么亮起来。也许是这些题没问到你自己身上，换个场景再想一遍会有不同答案。' },
    { max: 40, code: '偏内敛', desc: '你不太主动认领自己的能力。但「别人也会吧」这个念头，往往正是天赋藏身的地方。' },
    { max: 60, code: '不偏不倚', desc: '各项都在中间水位，没有明显的长板也没有短板。这种人适应力强，只是不太容易被一句话概括。' },
    { max: 80, code: '整体偏强', desc: '你对自己的能力评价普遍不低，属于样样都能上手的类型。挑一件事扎下去，比同时推进五件更有产出。' },
    { max: 101, code: '全面突出', desc: '八项都很高。这种全高的作答，通常说明你对自己很有信心，或者把「想做」当成了「擅长」—— 两者不是一回事。' }
  ];

  function levelProfile(scores) {
    var avg = scores.avg;
    for (var i = 0; i < LEVELS.length; i++) {
      if (avg < LEVELS[i].max) return { code: LEVELS[i].code, desc: LEVELS[i].desc, avg: Math.round(avg) };
    }
    return { code: LEVELS[LEVELS.length - 1].code, desc: LEVELS[LEVELS.length - 1].desc, avg: Math.round(avg) };
  }

  /** 结果页顶部的「大字」：正常是天赋组合，持平时是整体水平 */
  function headLabel(scores) {
    if (isFlat(scores)) return levelProfile(scores).code;
    return topDims(scores, 3).map(function (k) { return DIM_INFO[k].name; }).join(' · ');
  }

  /* ------------------------------------------------------------
   * 「和你最像的名人」匹配
   * ------------------------------------------------------------
   * 只比**形状**，不比高低 —— 也就是「哪几项相对突出」。
   * 和职业测试的形状轴同一套做法：把向量中心化之后算余弦相似度。
   * 中心化的意义在于，一个人是「样样 70 分但逻辑最突出」还是
   * 「样样 40 分但逻辑最突出」，形状是同一个，就该匹配到同一个人。
   *
   * 八项持平时**不匹配**：没有形状可比，硬套一个名人等于编。
   * 结果页会如实说「八项接近，就不硬套了」。
   * ---------------------------------------------------------- */
  function vectorOf(map, scale) {
    return DIM_KEYS.map(function (k) { return clamp(Number(map && map[k]) || 0, 0, scale) / scale; });
  }

  function centered(v) {
    var m = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    return v.map(function (x) { return x - m; });
  }

  /** 形状相似度，落在 0~1；任一边是零向量（无形状）时返回中性的 0.5 */
  function shapeSim(a, b) {
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (na === 0 || nb === 0) return 0.5;
    return (dot / (Math.sqrt(na) * Math.sqrt(nb)) + 1) / 2;
  }

  /** 某位名人最突出的那项能力。用于筛选候选，见 matchFigures */
  function figurePrimary(f) {
    var best = null, max = -1;
    DIM_KEYS.forEach(function (k) {
      var v = Number((f.w && f.w[k]) || 0);
      if (v > max) { max = v; best = k; }
    });
    return best;
  }

  /**
   * 按形状相似度匹配名人。返回 [{ figure, sim }]，已按相似度降序。
   * 八项持平时返回空数组 —— 调用方据此显示「不硬套」的文案。
   *
   * **先筛候选，再比形状。** 只比形状会出离谱结论，实测随机作答里有
   * 6.2% 会匹配到「最强项根本不在你前三」的人 —— 例如你的长板是共情，
   * 却给你一位最强项是动觉的人。形状相似度本身没算错（那个人确实和你
   * 重叠很多），但「最像的名人」这句话承诺了主要特质要对得上。
   *
   * 筛选标准取的是**最强项 = 你的 Top-1**（不是前三）：用户看到「我最突出
   * 的是共情」，期待的就是一位同样以共情见长的人。放宽到前三的话，
   * 逻辑也高的人仍可能拿到一位逻辑见长的名人，读起来还是别扭。
   * 代价是每位用户只在 3~5 位候选里挑，库大一点就够用。
   */
  function matchFigures(scores, figures, n) {
    if (!figures || !figures.length) return [];
    if (isFlat(scores)) return [];
    var U = centered(vectorOf(scores.pct, 100));

    var top1 = topDims(scores, 1)[0];
    var pool = figures.filter(function (f) { return figurePrimary(f) === top1; });
    if (!pool.length) pool = figures;          // 兜底：理论上不会发生

    var ranked = pool.map(function (f) {
      return { figure: f, sim: shapeSim(U, centered(vectorOf(f.w, 5))) };
    });
    ranked.sort(function (a, b) { return b.sim - a.sim; });
    return ranked.slice(0, Math.max(1, n || 1));
  }

  /* ------------------------------------------------------------
   * 结果页的一句话组合解读（纯模板，不写死组合）
   * ---------------------------------------------------------- */
  function comboLine(scores) {
    if (isFlat(scores)) return '';
    var t = topDims(scores, 3);
    var weak = bottomDim(scores);
    return '八项里最稳的是「' + DIM_INFO[t[0]].name + '」，' +
           '后面跟着「' + DIM_INFO[t[1]].name + '」和「' + DIM_INFO[t[2]].name + '」；' +
           '相对最不显眼的是「' + DIM_INFO[weak].name + '」——' +
           '那不是缺点，只是它不太是你习惯用的那把工具。';
  }

  window.CLJ_TALENT_SCORING = {
    DIM_KEYS: DIM_KEYS,
    DIM_INFO: DIM_INFO,
    OPTIONS: OPTIONS,
    PER_DIM_LIGHT: PER_DIM_LIGHT,
    FLAT_STD: FLAT_STD,
    ANSWER_MIN: ANSWER_MIN,
    ANSWER_MAX: ANSWER_MAX,
    toPct: toPct,
    computeScores: computeScores,
    topDims: topDims,
    bottomDim: bottomDim,
    isFlat: isFlat,
    levelProfile: levelProfile,
    headLabel: headLabel,
    shapeSim: shapeSim,
    figurePrimary: figurePrimary,
    matchFigures: matchFigures,
    comboLine: comboLine,
    /** 维度信息，取不到时给个兜底，调用方不用判空 */
    dim: function (k) { return DIM_INFO[k] || { name: k, full: k, en: k, short: '', desc: '' }; }
  };
})();

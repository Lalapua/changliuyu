/* ============================================================
 * 长留玉 · 计分与匹配算法
 * ------------------------------------------------------------
 * 算法模型：霍兰德 RIASEC 职业兴趣理论
 *
 * 一、维度计分
 *   单选 5 级：1 完全不这样 / 2 不太这样 / 3 一般 / 4 比较这样 / 5 这简直就是我
 *   把 1~5 映射到 -2 ~ +2（减去中性值 3），使「一般」不计入倾向，
 *   再乘以题目对该维度的权重 w，累加得到该维原始分：
 *
 *       raw[d] = Σ  (v_i - 3) × w_i
 *
 *   某维度的理论极值是所有命中该维度的题目都选 5（或都选 1）：
 *
 *       range[d] = Σ  2 × w_i
 *
 *   于是归一到 0~100 的展示分（50 为中性）：
 *
 *       pct[d] = clamp( 50 + 50 × raw[d] / range[d],  1, 99 )
 *
 *   这样不同版本的问卷（30 题 / 120 题）自动得到可比的分值，
 *   新增题目也不需要改任何常数。
 *
 * 二、职业匹配（形状轴 + 能量轴 双轴模型）
 *   两边都先归一化到 0~1，再各拆成两个分量：
 *
 *       形状轴 Us = 归一化向量 - 自身均值     相对偏好结构（A 高 C 低 这种起伏）
 *       能量轴 mU = 归一化向量的均值          整体投入度 / 节奏 / 活跃度
 *
 *   职业侧同理取 Js（w/5 后中心化）与 mJ（手工标注的 energy 字段，0~1）。
 *
 *       score = 0.7 × 形状分 + 0.3 × 能量分
 *       形状分 = (cos(Us, Js) + 1) / 2        皮尔逊相关系数映射到 0~1
 *       能量分 = 1 - |mU - mJ|
 *
 *   为什么不能只用形状轴：
 *   光比形状的话，全选 1、全选 3、全选 5 三种极端作答结果完全一样 ——
 *   六维都相等，中心化后全是零向量，而且相关系数对整体平移本来就不敏感。
 *   所以必须补一条能量轴，让「整体投入度」也参与匹配。
 *
 *   六维方差 < FLAT_VAR(0.01) 时形状分给中性的 0.5：它对所有职业一样、
 *   不影响排序，于是排序完全由能量轴决定（没有形状可谈，就按投入度配）。
 *
 *   最后做一次相对拉伸，把 score 的 [min,max] 铺到 [60,95]，
 *   否则真实分数大多落在 0.4~0.75，显示出来会显得「所有职业都差不多」。
 * ============================================================ */
(function () {
  'use strict';

  var CLJ_SCORING = {};

  /* ============================================================
   * 一、常量与静态文案
   * ============================================================ */

  /** 六维度定义。顺序即雷达图顶点顺序，也是维度条的展示顺序。 */
  var DIMS = [
    {
      key: 'R', name: '现实型', en: 'Realistic', alias: '动手派',
      blurb: '你信任能摸得着的东西。工具、设备、场地、实物，这些具体的存在比抽象的讨论更让你踏实，你愿意用双手把事情变成现实。',
      strengths: ['动手能力', '现场应变', '落地执行'],
      advice: [
        '把「会动手」变成看得见的作品，比说一百句更管用',
        '别只做不记，把手上的操作经验整理成流程文档',
        '有意识补一点理论，你的手艺会升值得更快'
      ]
    },
    {
      key: 'I', name: '研究型', en: 'Investigative', alias: '求真派',
      blurb: '你享受拆解问题本身。一个「为什么」就能拽住你很久。比起快，你更在乎有没有真的想明白。',
      strengths: ['分析推理', '深度钻研', '逻辑建模'],
      advice: [
        '给自己立一个能长期跟踪的研究型小课题',
        '把结论写成别人也看得懂的东西，别只留在脑子里',
        '练习「在有限时间里给出够用的答案」，别追求完美再交'
      ]
    },
    {
      key: 'A', name: '艺术型', en: 'Artistic', alias: '表达派',
      blurb: '你需要表达。规则太满的环境会让你窒息，你更愿意从零做出一个只属于你的东西。',
      strengths: ['创意表达', '审美判断', '从零构建'],
      advice: [
        '给创作定一个固定节律，哪怕每天只有半小时',
        '把作品公开放到平台上，真实反馈是最好的老师',
        '给创意加一点约束，作品才更容易真正完成'
      ]
    },
    {
      key: 'S', name: '社会型', en: 'Social', alias: '助人派',
      blurb: '你在人与人的连接里充电。别人的情绪你接得住，帮助他人本身就让你有成就感。',
      strengths: ['共情理解', '沟通协作', '育人耐心'],
      advice: [
        '设好情绪边界，助人型的人最容易先把自己耗干',
        '把「帮别人」的经验沉淀成方法论，可复用才不亏',
        '留意那些你顺手就能做好、别人却很吃力的事，那往往是天赋'
      ]
    },
    {
      key: 'E', name: '企业型', en: 'Enterprising', alias: '推动派',
      blurb: '你天生想把事情推动起来。你享受说服、组织和竞争的过程，对结果有强烈的占有欲。',
      strengths: ['说服影响', '资源整合', '决策担当'],
      advice: [
        '找到一个你愿意长期下注的方向，别把精力摊在十几个赛道上',
        '刻意练习倾听，说服力有一半来自「让对方觉得被理解」',
        '把目标拆成可验证的节点，否则热情容易烧空'
      ]
    },
    {
      key: 'C', name: '常规型', en: 'Conventional', alias: '秩序派',
      blurb: '你从秩序里获得安全感。流程、数据、细节是你的舒适区，你交付的东西经得起检查。',
      strengths: ['严谨细致', '流程管理', '数据敏感'],
      advice: [
        '警惕把「流程」当成目的，定期回头问一句：这流程还值得吗',
        '在稳定岗位里主动接一点有变量的任务，避免能力停滞',
        '可靠本身就是稀缺资源，要学会把它讲清楚'
      ]
    }
  ];

  /** 五个选项。value 用于计分，label 用于展示，tone 用于结果页回看。 */
  var OPTIONS = [
    { value: 1, label: '完全不这样', tone: '极低' },
    { value: 2, label: '不太这样',   tone: '偏低' },
    { value: 3, label: '一般',       tone: '中性' },
    { value: 4, label: '比较这样',   tone: '偏高' },
    { value: 5, label: '这简直就是我', tone: '极高' }
  ];

  var DIM_KEYS = DIMS.map(function (d) { return d.key; });

  function dim(key) {
    for (var i = 0; i < DIMS.length; i++) if (DIMS[i].key === key) return DIMS[i];
    return null;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ============================================================
   * 二、维度计分
   * ============================================================ */

  /**
   * @param {Array} questions 题目数组，元素形如 { id, dims:{R:1}, text }
   * @param {Object} answers   答案映射，{ 'l01': 4, ... }
   * @returns {{ raw, pct, range, order, answered, total, complete }}
   */
  function computeScores(questions, answers) {
    answers = answers || {};

    var raw = {}, range = {};
    DIM_KEYS.forEach(function (k) { raw[k] = 0; range[k] = 0; });

    var answered = 0;

    questions.forEach(function (q) {
      var v = answers[q.id];
      var dims = q.dims || {};
      // 先累计该题能提供的最大幅度，无论用户有没有作答，
      // 保证「答了 10 题」和「答了 30 题」时同一维度的分母都反映该版本问卷的完整量程
      Object.keys(dims).forEach(function (k) {
        if (range[k] === undefined) return;
        range[k] += 2 * dims[k];
      });
      if (v === undefined || v === null || v === '') return;
      answered++;
      Object.keys(dims).forEach(function (k) {
        if (raw[k] === undefined) return;
        raw[k] += (Number(v) - 3) * dims[k];
      });
    });

    var pct = {};
    DIM_KEYS.forEach(function (k) {
      pct[k] = range[k] > 0
        ? clamp(Math.round(50 + 50 * raw[k] / range[k]), 1, 99)
        : 50;
    });

    // 按得分从高到低排序，结果页直接用它渲染
    var order = DIMS.slice().sort(function (a, b) { return pct[b.key] - pct[a.key]; })
                    .map(function (d) { return d.key; });

    return {
      raw: raw,
      pct: pct,
      range: range,
      order: order,
      answered: answered,
      total: questions.length,
      complete: answered === questions.length && questions.length > 0
    };
  }

  /**
   * 三字霍兰德代码，例如 ['A','I','S'] -> 'AIS'
   */
  function hollandCode(scores, n) {
    return scores.order.slice(0, n || 3).join('');
  }

  /* ============================================================
   * 三、职业匹配（形状轴 + 能量轴 双轴模型）
   * ============================================================ */

  function toUnit(vec) {
    var sum = 0;
    for (var i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
    var len = Math.sqrt(sum);
    if (len < 1e-9) return null;                 // 零向量，没有方向可言
    return vec.map(function (x) { return x / len; });
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function mean(vec) {
    var s = 0;
    for (var i = 0; i < vec.length; i++) s += vec[i];
    return s / vec.length;
  }

  /** 中心化：把向量减去自身均值，只剩「形状」，去掉「整体高低」的影响 */
  function center(vec) {
    var m = mean(vec);
    return vec.map(function (v) { return v - m; });
  }

  /**
   * 皮尔逊相关系数（= 两个中心化向量的余弦），保留给文档与追踪脚本使用。
   * 正式匹配已经改用「形状轴 + 能量轴」双轴模型，见 matchCareers。
   *
   * 它仍然值得留着：它是形状轴的数学内核。两边同时中心化后比的是
   * 「曲线形状是否同款」——用户高于自身平均的维度，正好是职业最看重的维度。
   */
  function pearson(a, b) {
    var ua = toUnit(center(a));
    var ub = toUnit(center(b));
    if (!ua || !ub) return null;                 // 任一向量是常数，无法算相关
    return dot(ua, ub);
  }

  /** 方差：用来判断「六维是不是完全持平、根本没有形状可言」 */
  function variance(vec) {
    var m = mean(vec);
    var s = 0;
    for (var i = 0; i < vec.length; i++) s += (vec[i] - m) * (vec[i] - m);
    return s / vec.length;
  }

  /** 六维方差低于这个值就认定「没有形状」，形状分给中性的 0.5 */
  var FLAT_VAR = 0.01;

  /** 六维权重 → 0~1 归一化向量（先归一化，能量轴才和用户侧可比） */
  function careerUnit(career) {
    return DIM_KEYS.map(function (k) {
      return clamp(Number((career.w && career.w[k]) || 0) / 5, 0, 1);
    });
  }

  /** 职业的能量轴：用手工标注的 energy；万一缺了就退回权重的均值 */
  function careerEnergy(career) {
    var e = Number(career.energy);
    if (isFinite(e)) return clamp(e, 0, 1);
    var u = careerUnit(career);
    return mean(u);
  }

  /** 形状相似度：两边中心化后求余弦，再从 -1~1 映射到 0~1。
   *  返回 null 表示「有一边根本没有形状」，交给调用方决定怎么兜。 */
  function shapeSim(a, b) {
    var ua = toUnit(center(a));
    var ub = toUnit(center(b));
    if (!ua || !ub) return null;
    return (dot(ua, ub) + 1) / 2;
  }

  /**
   * 匹配职业：形状轴 + 能量轴 双轴模型。
   *
   * 为什么不能只用形状轴（皮尔逊相关系数）：
   * 相关系数对「整体平移」不敏感 —— 全选 1、全选 3、全选 5 三种极端作答，
   * 六维都相等，中心化后全是零向量，算出来的结果一模一样。
   * 更糟的是「六维全选同一档」时全库 108 个职业的分数会挤在 65~69，
   * 推荐列表等于没推荐。
   *
   * 所以把两边都拆成两个正交的分量：
   *   形状轴 Us = 归一化向量 - 自身均值      → 相对偏好结构（是不是 A 高 C 低）
   *   能量轴 mU = 归一化向量的均值           → 整体投入度 / 节奏 / 活跃度
   * 职业侧同理取 Js 与 mJ（mJ 用手工标注的 energy 字段）。
   *
   *   score = 0.7 × 形状分 + 0.3 × 能量分
   *   形状分 = (cos(Us, Js) + 1) / 2         ∈ 0~1
   *   能量分 = 1 - |mU - mJ|                 ∈ 0~1
   *
   * 六维方差 < FLAT_VAR 时形状分直接给 0.5 这个中性常数：
   * 它对所有职业一样，不影响排序，于是排序完全交给能量轴 ——
   * 这正是我们想要的（没有形状可谈，就按投入度匹配）。
   *
   * @param {Object} pct        维度百分比 { R: 78, ... }
   * @param {Array}  careers    职业库
   * @param {number} topN       取前几名，默认 5
   * @returns {Array} [{ career, fit, score, shape, energy, corr, mU, mJ, overlap, reason }]
   */
  function matchCareers(pct, careers, topN) {
    topN = topN || 5;
    var list = careers || [];

    // 用户侧也先归一化到 0~1，才能和职业侧的能量轴直接比
    var userUnit = DIM_KEYS.map(function (k) { return clamp((Number(pct[k]) || 0) / 100, 0, 1); });
    var mU = mean(userUnit);
    var flat = variance(userUnit) < FLAT_VAR;

    var scored = list.map(function (c) {
      var jUnit = careerUnit(c);
      var mJ = careerEnergy(c);

      var shape = flat ? 0.5 : shapeSim(userUnit, jUnit);
      if (shape === null) shape = 0.5;            // 职业权重没有起伏，也只能给中性

      var energy = clamp(1 - Math.abs(mU - mJ), 0, 1);
      var score = clamp(0.7 * shape + 0.3 * energy, 0, 1);

      // 命中数：职业权重最高的两个维度里，有几个落在用户的强项（≥60）
      var overlap = topDimsOf(c).filter(function (k) {
        return pct[k] !== undefined && pct[k] >= 60;
      }).length;

      return { career: c, score: score, shape: shape, energy: energy, mU: mU, mJ: mJ, overlap: overlap };
    });

    /* 相对拉伸映射：把 score 的 [min, max] 铺到 [60, 95]。
     * 不做拉伸的话，真实 score 大多落在 0.4~0.75，显示成同样区间会显得
     * 「所有职业都差不多」；拉伸后 Top1 稳定接近 95%、Top5 落在 70~80%，
     * 梯度一眼看得出来。拉伸是单调线性变换，不会改变排名。 */
    var scores = scored.map(function (s) { return s.score; });
    var lo = Math.min.apply(null, scores);
    var hi = Math.max.apply(null, scores);
    var span = hi - lo;
    scored.forEach(function (s) {
      s.fit = span < 1e-9
        ? 78                                                        // 理论上到不了，防御 NaN
        : clamp(Math.round(60 + 35 * (s.score - lo) / span), 60, 95);
      s.corr = s.score;                                            // 兼容旧字段名
    });

    // 先按总分降序；平分时形状分高的优先（更有「像」的依据）
    scored.sort(function (a, b) {
      if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
      return b.shape - a.shape;
    });

    var ctx = { flat: flat, mU: mU };

    // 避免同一类别霸榜：每类别最多取 2 个进入前列
    var picked = [], catCount = {};
    function take(s) {
      catCount[s.career.category || '其他'] = (catCount[s.career.category || '其他'] || 0) + 1;
      s.reason = fitReason(pct, s.career, ctx);
      picked.push(s);
    }
    scored.forEach(function (s) {
      if (picked.length >= topN) return;
      var cat = s.career.category || '其他';
      if ((catCount[cat] || 0) >= 2) return;
      take(s);
    });

    // 若因类别限制没凑够，用剩下的补足
    if (picked.length < topN) {
      scored.forEach(function (s) {
        if (picked.length >= topN) return;
        if (picked.indexOf(s) >= 0) return;
        take(s);
      });
    }

    return picked;
  }

  /** 取某职业权重最高的两个维度键 */
  function topDimsOf(career) {
    var w = career.w || {};
    return DIM_KEYS.slice().sort(function (a, b) {
      return (w[b] || 0) - (w[a] || 0);
    }).slice(0, 2);
  }

  /** 生成「为什么是这个职业」的解释句
   *  @param {Object} ctx 可选，{ flat: 六维是否持平 } */
  function fitReason(pct, career, ctx) {
    ctx = ctx || {};

    // 六维持平时没有维度强弱可比，别硬编一句「正好是你的强项」，实话实说
    if (ctx.flat) {
      return '你的六个维度完全持平，这一条是按「整体投入度」接近程度排出来的。';
    }

    var keys = topDimsOf(career);
    var names = keys.map(function (k) { return dim(k) ? dim(k).name : k; });
    var mine = keys.filter(function (k) { return pct[k] >= 55; });

    if (mine.length === 2) {
      return '你的' + names[0] + '与' + names[1] + '两条曲线，和这个职业的要求高度重合。';
    }
    if (mine.length === 1) {
      return '这个职业最看重的' + names[0] + '，正好是你的强项。';
    }
    return '这个职业的' + names.join('/') + '偏好，和你的整体倾向比较接近。';
  }

  /* ------------------------------------------------------------
   * 「兴趣分布均匀」档位
   * ------------------------------------------------------------
   * 六维完全持平时，霍兰德代码是没有意义的 —— 六个维度并列第一，
   * 任何三字母组合都只是"按定义顺序取前三个"，换个用户也是同一串。
   * 所以这里不编代码，改成按能量轴给出投入等级：这才是这份作答里
   * 唯一真实、且五档之间确实不同的信息。
   * ---------------------------------------------------------- */
  var UNIFORM_LEVELS = [
    { max: 0.15, level: 'verylow', code: '投入很低', typeName: '均匀 · 低动力型',
      text: '兴趣均匀、整体投入度偏低，可能处于探索期或低动力状态，建议从少量低门槛的尝试开始。' },
    { max: 0.375, level: 'low', code: '投入偏低', typeName: '均匀 · 试探型',
      text: '兴趣均匀、整体投入度略低于平均，像是还在四处试探；先从能快速上手的小事里找感觉。' },
    { max: 0.625, level: 'mid', code: '投入中等', typeName: '均匀 · 平衡型',
      text: '兴趣均匀、整体投入度中等，适合节奏平稳、职责清晰、不要求极端偏向某一类能力的职业。' },
    { max: 0.85, level: 'high', code: '投入偏高', typeName: '均匀 · 宽面型',
      text: '兴趣均匀、整体投入度偏高，愿意为多数事情投入精力；适合职责面较宽、能同时用上多种能力的岗位。' },
    { max: 2, level: 'veryhigh', code: '投入很高', typeName: '均匀 · 多面手型',
      text: '兴趣均匀、整体投入度很高，适合多面手、跨领域、节奏快、需要同时调动多种能力的职业。' }
  ];

  /** 六维是否持平（没有形状可言） */
  function isUniform(scores) {
    var pct = (scores && scores.pct) || {};
    var vec = DIM_KEYS.map(function (k) { return clamp((Number(pct[k]) || 0) / 100, 0, 1); });
    return variance(vec) < FLAT_VAR;
  }

  /** 持平时的档位信息；不持平返回 null */
  function uniformProfile(scores) {
    if (!isUniform(scores)) return null;
    var pct = scores.pct;
    var vec = DIM_KEYS.map(function (k) { return clamp((Number(pct[k]) || 0) / 100, 0, 1); });
    var mU = mean(vec);
    for (var i = 0; i < UNIFORM_LEVELS.length; i++) {
      if (mU <= UNIFORM_LEVELS[i].max) {
        var L = UNIFORM_LEVELS[i];
        return {
          level: L.level,
          code: L.code,
          typeName: L.typeName,
          text: L.text,
          mU: mU,
          value: pct[DIM_KEYS[0]]          // 六维都是这个分值
        };
      }
    }
    return null;
  }

  /* ============================================================
   * 四、结果解读
   * ============================================================ */

  /** 整体画像：由前三维拼出的一句话 */
  function profileSentence(scores) {
    var top = dim(scores.order[0]);
    var second = dim(scores.order[1]);
    if (!top) return '';
    var s = '你的主导特质是' + top.name + '（' + top.alias + '）';
    if (second) s += '，辅以' + second.name + '（' + second.alias + '）';
    return s + '。';
  }

  /** 情绪张力：最高分与最低分的落差，用来判断是不是「偏好鲜明」 */
  function spreadLevel(scores) {
    var hi = scores.pct[scores.order[0]];
    var lo = scores.pct[scores.order[scores.order.length - 1]];
    var gap = hi - lo;
    if (gap >= 45) return { level: '鲜明', text: '你的偏好非常集中，方向感很强，不容易被别的东西带跑。' };
    if (gap >= 25) return { level: '清晰', text: '你有明确的主场，同时也保留了不错的适应面。' };
    if (gap >= 12) return { level: '均衡', text: '你的六维比较平均，属于什么都能接得住的类型。' };
    return { level: '极均衡', text: '六个维度几乎没有落差，你更像一块能往很多方向长的橡皮泥——好处是自由，代价是需要自己定方向。' };
  }

  /** 行动建议：取前两维的 advice，去重后返回 4~6 条 */
  function buildAdvice(scores, isLight) {
    var out = [];
    scores.order.slice(0, 2).forEach(function (k) {
      var d = dim(k);
      if (!d) return;
      d.advice.forEach(function (a) {
        if (out.indexOf(a) < 0) out.push(a);
      });
    });
    return isLight ? out.slice(0, 4) : out;
  }

  /* ------------------------------------------------------------
   * 维度点评文案池
   * ------------------------------------------------------------
   * 分五档：>=80 / >=65 / >=50 / >=35 / 其余。
   * 每档先给一组「通用」说法，每个维度再各给两条专属说法，
   * 合起来每档有 10 种候选。
   *
   * 取哪一条由 (维度, 分值) 的哈希决定 —— 同一份结果永远得到同一句话，
   * 刷新不会改口；但不同维度念出来不一样，同一个人不同次测出来的
   * 分数哪怕只差几分，措辞也会换一批，不至于翻来覆去就那五句。
   * ---------------------------------------------------------- */
  var COMMENT_BANDS = [
    { min: 80, key: 'top' },
    { min: 65, key: 'strong' },
    { min: 50, key: 'mid' },
    { min: 35, key: 'low' },
    { min: -1, key: 'weak' }
  ];

  /** 通用说法：任何维度都适用 */
  var COMMENT_GENERIC = {
    top: [
      '这是你的主场，几乎不用费力就能比别人做得好。',
      '你的天赋集中在这里，硬碰硬地比，很少有人是你的对手。',
      '这一项几乎是自带外挂，别人要练很久，你上手就对。',
      '你的能量在这一维度上最满，做相关的事几乎不会觉得累。',
      '这是你最锋利的那把刀，用在该用的地方就别犹豫。',
      '顶端分。这一项上你属于少数派，值得当成长期资产去经营。',
      '你在这件事上有天然的直觉，说不清理由，但结果总不差。',
      '分值几乎顶到头了，它大概率会成为你职业选择里的支点。'
    ],
    strong: [
      '明显的强项，值得在简历和自我介绍里主动亮出来。',
      '这一项你不用太使劲就能超过平均水平，属于可以依靠的能力。',
      '你的优势在这里，但还没到碾压的程度，继续加码回报很可观。',
      '这一项是你稳定的加分项，遇到相关任务可以主动争取。',
      '你的第二梯队里藏着它，往上再推一把就能变成杀手锏。',
      '这一项高于大多数人，只是被更亮的那几维盖住了。',
      '偏强。它未必是你的热爱，但一定是你的好用之处。',
      '这一项的分值说明你在这上面有底子，别只当它是个爱好。'
    ],
    mid: [
      '中等偏好，平时够用，但不必当成主线。',
      '这一项不上不下，属于「不讨厌，但也不上头」的类型。',
      '中间地带。它能兜底，但很难靠它做出差异。',
      '这一项的分值很中庸，说明你不排斥，但也不会主动扑上去。',
      '不算强项也不算短板，当配角合适，当主角会吃力。',
      '你的态度更接近「可以接受」，那就不必在它身上投太多。',
      '中等水平。它不会拖你后腿，也帮不了你破局。',
      '这一项大概是「会做但不爱做」，放在组合里当补充就好。'
    ],
    low: [
      '不太来电，能做好，但很难长期靠它获得成就感。',
      '这一项你做得动，只是做完不太会有满足感。',
      '偏低。它更像是任务，而不是你的兴趣所在。',
      '长期靠它撑事业会累，因为消耗大于收获。',
      '你的分不高，说明这件事很难让你进入状态。',
      '偏弱项。非做不可的时候能做，但别指望它带来热情。',
      '这一项更像是「别人觉得你该擅长」，其实你自己不太有感觉。',
      '分值偏低，大概率是那种做完就想赶紧换下一件事的类型。'
    ],
    weak: [
      '明显的短板，不必硬补，学会找互补的人合作更划算。',
      '这一项是真的不来电，硬练的性价比很低。',
      '低分区。与其补它，不如把强项做得更强。',
      '这一项你天生不敏感，勉强去做只会两头不讨好。',
      '它几乎不参与你的动力系统，交给擅长的人吧。',
      '这一项的分值说明你在这里既不擅长也不享受，绕开是聪明的选择。',
      '短板明确。承认它，比反复跟自己较劲有用得多。',
      '这一项你几乎不占优势，但它不影响你成为厉害的人。'
    ]
  };

  /** 维度专属说法：只说这一维，读起来更有针对性 */
  var COMMENT_BY_DIM = {
    R: {
      top: ['你的手比嘴快，任何需要「把东西做出来」的场景你都能迅速进入状态。',
            '你的优势在于对现实世界的掌控感——设备、材料、场地，到你手里就服帖。'],
      strong: ['需要现场判断和动手的事，交给你比交给谁都稳妥。',
               '你的执行力偏「实」，落地的事你会做得比纸面规划更好。'],
      mid: ['动手能力中规中矩，做得到，但不是你最有兴致的那部分。',
            '你对具体操作的兴趣一般，交给更有手感的人可能效率更高。'],
      low: ['比起亲手操作，你更愿意在思考或沟通的层面解决问题。',
            '你对器械、场地这类具体事物的耐心有限，别勉强自己走技术路线。'],
      weak: ['让你整日泡在设备和材料之间，会消耗得很快。',
             '动手类的事很难给你正反馈，把它分出去是合理的选择。']
    },
    I: {
      top: ['你天生想把事情拆开看清楚，别人满足于「能用」，你非要问「为什么」。',
            '复杂问题对你是燃料而不是负担，越绕的题你越有兴致。'],
      strong: ['你有一套自己的分析路径，遇到需要深想的问题不容易卡住。',
               '你愿意为一个结论花时间，这份耐心在多数人身上已经很稀缺了。'],
      mid: ['你能分析，但不会主动往深里钻；够用，但谈不上着迷。',
            '需要严谨推演的事你做得来，只是不太会为此熬夜。'],
      low: ['长时间的逻辑推演容易让你失去耐心，你更看重结论能不能马上用。',
            '你不太享受「想清楚」本身，实用性比严密性更能打动你。'],
      weak: ['让你长期埋头做研究，多半会把你憋坏。',
             '抽象推理很难给你爽感。这没关系，世界也需要把结论用起来的人。']
    },
    A: {
      top: ['你有强烈的表达欲，从零做出一个只属于你的东西时才最像自己。',
            '你对美感和原创性极度敏感，规则太满的环境会直接把你闷住。'],
      strong: ['你在创作这件事上有持续的动力，作品会替你说话。',
               '你的审美判断明显高于平均水平，做选择时相信自己的第一直觉。'],
      mid: ['你有欣赏力，但未必有强烈的创作冲动；看比做更让你舒服。',
            '创意对你有吸引力，只是还没到非做不可的程度。'],
      low: ['比起自由发挥，你更适应有明确标准的事，创作反而不轻松。',
            '你不需要靠表达来确认自己，务实会让你更安心。'],
      weak: ['开放式、没有标准答案的任务反而会让你发慌。这不是缺点，只是类型不同。',
             '你对原创的驱动力偏弱，把创意环节交给擅长的人效率更高。']
    },
    S: {
      top: ['你在人与人的连接里充电，别人的情绪你接得住。',
            '帮到别人这件事本身就让你有成就感，你的耐心是稀缺资源。'],
      strong: ['沟通和共情是你的顺手技能，团队里有你会顺畅很多。',
               '你天然让人放下防备，这在需要建立信任的场合价值极高。'],
      mid: ['你不排斥和人打交道，但也不会主动把关系往深里推。',
            '人际互动对你来说是日常需求，不是核心动力。'],
      low: ['频繁的情绪劳动会让你疲惫，你更希望关系简单清爽。',
            '你不太愿意把精力花在照顾别人情绪上，独处让你恢复得更快。'],
      weak: ['长期以「服务他人」为主的工作，会持续消耗你。',
             '你对人情的投入意愿偏低，需要大量共情的事交给别人更合适。']
    },
    E: {
      top: ['你天生想把事情推动起来，说服、组织、拿结果是你的本能。',
            '你对目标的占有欲极强，只要方向对，你比别人更敢下注。'],
      strong: ['你具备把人和资源拢到一起的能力，适合站在推进位上。',
               '你愿意为结果承担责任，这一点在多数团队里都很稀缺。'],
      mid: ['你不排斥主导，但也没那么强的胜负欲；当个可靠的执行者也很舒服。',
            '需要带动别人时你能站出来，只是不一定享受这个过程。'],
      low: ['你对「说服别人」兴趣不大，被推到台前反而会不自在。',
            '你不喜欢为结果扛下全部责任，这让你活得比很多领导轻松。'],
      weak: ['竞争和推销会让你本能地想退后一步。',
             '推动别人很难给你带来快感，做专业型角色会比做管理者自在得多。']
    },
    C: {
      top: ['你从秩序里获得安全感，交付的东西永远经得起检查。',
            '细节和数据是你的舒适区，别人看三遍会漏的地方，你一眼就抓住。'],
      strong: ['你办事有章法，交给你的事基本不用二次跟进。',
               '流程意识让你在需要稳定输出的岗位上格外可靠。'],
      mid: ['你能守规矩，但不会为了规矩牺牲效率；够用而不刻板。',
            '你对细节的耐心一般，差不多能用时就不太想再抠了。'],
      low: ['重复和琐碎的细节容易让你烦躁，你更想看到变化。',
            '你不太愿意被流程束缚，灵活性对你比规范性更重要。'],
      weak: ['长期和表格、流程、核对打交道会让你消耗很快。',
             '秩序本身给不了你成就感，你需要的是变化和空间。']
    }
  };

  /** 维度一句话点评：同一份结果稳定，不同维度/分值措辞不同 */
  function dimComment(key, value) {
    var band = 'weak';
    for (var i = 0; i < COMMENT_BANDS.length; i++) {
      if (value >= COMMENT_BANDS[i].min) { band = COMMENT_BANDS[i].key; break; }
    }

    var own = (COMMENT_BY_DIM[key] || {})[band] || [];
    var gen = COMMENT_GENERIC[band] || [];

    // 种子只看「档位 + 分值」：同一份结果永远落在同一个起点
    var h = (window.CLJ && window.CLJ.hash) ? window.CLJ.hash : null;
    var seed = h ? h(band + '#' + value) : (value * 31 + band.length);

    // 三分之一的取值走「维度专属」说法，其余走通用说法
    var pool = (own.length && seed % 3 === 0) ? own : gen;
    if (!pool.length) return '';

    /* 关键：下标 = 起点 + 维度序号。
     * 同一个分值下六个维度的序号 0~5 各不相同，而池子至少有 6 条，
     * 于是六个维度必然落在六个不同位置上 —— 不会出现「两行点评一字不差」。
     * 起点本身由分值决定，所以同一份结果刷新多少次都是同一句话。 */
    var dimIdx = DIM_KEYS.indexOf(key);
    if (dimIdx < 0) dimIdx = 0;
    return pool[(seed + dimIdx) % pool.length];
  }

  /* ============================================================
   * 六、导出
   * ============================================================ */
  CLJ_SCORING.DIMS = DIMS;
  CLJ_SCORING.DIM_KEYS = DIM_KEYS;
  CLJ_SCORING.OPTIONS = OPTIONS;
  CLJ_SCORING.dim = dim;
  CLJ_SCORING.clamp = clamp;

  CLJ_SCORING.computeScores = computeScores;
  CLJ_SCORING.hollandCode = hollandCode;

  /* 双轴匹配 */
  CLJ_SCORING.matchCareers = matchCareers;
  CLJ_SCORING.careerUnit = careerUnit;
  CLJ_SCORING.careerEnergy = careerEnergy;
  CLJ_SCORING.shapeSim = shapeSim;
  CLJ_SCORING.pearson = pearson;
  CLJ_SCORING.variance = variance;
  CLJ_SCORING.FLAT_VAR = FLAT_VAR;
  CLJ_SCORING.isUniform = isUniform;
  CLJ_SCORING.uniformProfile = uniformProfile;
  CLJ_SCORING.topDimsOf = topDimsOf;
  CLJ_SCORING.fitReason = fitReason;

  CLJ_SCORING.profileSentence = profileSentence;
  CLJ_SCORING.spreadLevel = spreadLevel;
  CLJ_SCORING.buildAdvice = buildAdvice;
  CLJ_SCORING.dimComment = dimComment;

  window.CLJ_SCORING = CLJ_SCORING;
})();

/* ============================================================
 * 长留玉 · 天赋测试 · 结果页逻辑
 * ------------------------------------------------------------
 * 依赖：config.js → global.js → questions-*.js → scoring.js
 *      → talents.js → figures.js → data.js → radar.js → poster.js
 *      → save.js → result.js
 *
 * 职责：
 *   1. 读取答题快照，算八维分值
 *   2. 定出主天赋画像 —— 八项持平时不硬套，改谈整体水平
 *   3. 渲染八维图谱 / 明细 / 画像详解 / 最像的名人
 *   4. 交给公共模块出图与交付（js/poster.js + js/save.js）
 *
 * 和职业测试最大的不同：**没有「匹配度」**。
 * 天赋不需要匹配给谁，直接显示八维分值，不做拉伸 ——
 * 一拉伸，「你这项 95 分」就变成了一句好看但没有信息量的话。
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;
  var DATA = window.CLJ_TALENT_DATA;
  var S = window.CLJ_TALENT_SCORING;
  var CLJ = window.CLJ;

  var KEY_FINAL = 'talent_final';         // 完成后的答案快照
  var KEY_PROGRESS = 'talent_progress';   // 进行中的进度

  var state = {
    busy: false,
    version: 'light',
    answers: null,
    scores: null,
    flat: false,
    talent: null,
    figures: []
  };
  var els = {};

  function boot() {
    cacheEls();

    var final = CLJ.store.get(KEY_FINAL, null);
    if (!final || !final.answers) {
      // 没有结果数据（比如用户直接打开链接），回开始页重新走一遍
      window.location.replace('index.html');
      return;
    }

    state.version = DATA.normalizeVersion(final.version);
    state.answers = final.answers;

    var questions = DATA.questions(state.version);

    /* ---- 算分 ---- */
    state.scores = S.computeScores(questions, state.answers);
    state.flat = S.isFlat(state.scores);

    /* ---- 定主画像 ----
     * 持平时不取「分值最高的那项」当主画像 —— 八项差不了几分时，
     * 谁高谁低基本是作答噪声，据此封一个画像就是编。 */
    var top = S.topDims(state.scores, 3);
    state.talent = state.flat ? null : DATA.talentById(top[0]);

    /* ---- 最像的名人（同样比的是形状，持平时为空）---- */
    state.figures = S.matchFigures(state.scores, DATA.figures(), 3);

    /* ---- 渲染 ---- */
    renderHero();
    renderRadar();
    renderDims();
    renderTalent();
    renderFigures();
    renderOthers();
    bindActions();

    /* ---- 开发自检（只在控制台可见）---- */
    var rep = DATA.validate();
    if (!rep.ok) console.warn('[长留玉] 数据自检发现问题：', rep);

    document.title = buildResultTitle();
  }

  function cacheEls() {
    els.codeLabel = CLJ.qs('#code-label');
    els.code = CLJ.qs('#result-code');
    els.comboLabel = CLJ.qs('#combo-label');
    els.title = CLJ.qs('#result-title');
    els.profile = CLJ.qs('#result-profile');
    els.spread = CLJ.qs('#result-spread');
    els.radar = CLJ.qs('#radar-holder');
    els.dims = CLJ.qs('#dim-bars');
    els.talentName = CLJ.qs('#talent-name');
    els.talentDesc = CLJ.qs('#talent-desc');
    els.talentWatch = CLJ.qs('#talent-watch');
    els.figureList = CLJ.qs('#figure-list');
    els.others = CLJ.qs('#other-tests');
    els.strengths = CLJ.qs('#strength-tags');
    els.versionTag = CLJ.qs('#version-tag');
  }

  function versionChipText() {
    var v = DATA.VERSIONS[state.version];
    return v ? (v.label + ' · ' + v.count + ' 题') : state.version;
  }

  /* ============================================================
   * 一、头部
   * ============================================================ */

  /** 头部的大字：正常是主画像名（形容词 + 名词），持平时是整体水平的档位名 */
  function headlineCode() {
    if (state.flat) return S.levelProfile(state.scores).code;
    return state.talent ? state.talent.name : '—';
  }

  function renderHero() {
    var sc = state.scores;
    var top = S.topDims(sc, 3);
    var lvl = S.levelProfile(sc);

    if (els.versionTag) els.versionTag.textContent = versionChipText();

    els.code.textContent = headlineCode();

    if (state.flat) {
      /* 八项持平：不说「你的长板是某某」，改谈整体水平 */
      els.codeLabel.textContent = '整体水平';
      els.comboLabel.textContent = '八项分布';
      els.title.textContent = '八项分值很接近';
      els.profile.textContent = lvl.desc;
    } else {
      els.codeLabel.textContent = '你的主天赋画像';
      els.comboLabel.textContent = '天赋组合';
      els.title.textContent = top.map(function (k) { return S.dim(k).name; }).join(' · ');
      els.profile.textContent = state.talent ? state.talent.tagline : '';
    }

    /* ---- 标签 ---- */
    CLJ.clear(els.strengths);
    if (state.flat) {
      els.strengths.appendChild(CLJ.el('span', { class: 'chip chip--plain', text: '平均 ' + lvl.avg + ' 分' }));
      els.strengths.appendChild(CLJ.el('span', { class: 'chip chip--plain', text: versionChipText() }));
    } else {
      top.forEach(function (k) {
        els.strengths.appendChild(CLJ.el('span', {
          class: 'chip', text: S.dim(k).name + ' · ' + sc.pct[k]
        }));
      });
    }

    /* ---- 底部一行说明 ---- */
    var weak = S.bottomDim(sc);
    var std = Math.sqrt(sc.variance);
    els.spread.textContent = state.flat
      ? '八项标准差 ' + std.toFixed(1) + ' 分，没有哪一项明显突出，所以就不硬挑一个「长板」了。'
      : '八项标准差 ' + std.toFixed(1) + ' 分；相对最不显眼的是「' + S.dim(weak).name +
        '」（' + sc.pct[weak] + ' 分）—— 那不是缺点，只是它不太是你习惯用的那把工具。';
  }

  /* ============================================================
   * 二、图谱与明细
   * ============================================================ */

  function renderRadar() {
    els.radar.innerHTML = CLJ_RADAR.svg(state.scores.pct, 320, {
      keys: S.DIM_KEYS,
      nameOf: function (k) { return S.dim(k).name; }
    });
  }

  function renderDims() {
    var sc = state.scores;
    CLJ.clear(els.dims);

    sc.order.forEach(function (k, i) {
      var d = S.dim(k);
      var val = sc.pct[k];

      var row = CLJ.el('div', { class: 'dim-row anim-up d-' + Math.min(i + 1, 8) });
      row.appendChild(CLJ.el('div', { class: 'dim-row__head' }, [
        CLJ.el('span', { class: 'dim-row__name', text: d.name }),
        CLJ.el('span', { class: 'dim-row__alias', text: d.full }),
        CLJ.el('span', { class: 'dim-row__val t-num', text: val + '' })
      ]));

      var track = CLJ.el('div', { class: 'dim-row__track' });
      var fill = CLJ.el('div', { class: 'dim-row__fill' });
      fill.style.width = val + '%';
      track.appendChild(fill);
      row.appendChild(track);

      /* 每项给一句自己的解释（来自 DIM_INFO.desc），比只给数字有用 */
      if (d.desc) row.appendChild(CLJ.el('p', { class: 'dim-row__comment', text: d.desc }));

      els.dims.appendChild(row);
    });
  }

  /* ============================================================
   * 三、主画像详解
   * ============================================================ */

  function renderTalent() {
    var sc = state.scores;
    var lvl = S.levelProfile(sc);

    if (state.flat) {
      /* 持平时没有画像可说，这一块改成「这份结果怎么读」 */
      els.talentName.textContent = '这份结果怎么读';
      els.talentDesc.textContent = '八项分值挨得很近的时候，排在前面的那几项未必真的更强 —— ' +
        '差距往往来自某一道题的取舍。这种情况下更值得看的不是排序，而是整体水位：' +
        '你八项平均 ' + lvl.avg + ' 分，属于「' + lvl.code + '」。';
      CLJ.clear(els.talentWatch);
      els.talentWatch.appendChild(CLJ.el('li', {
        text: '如果你觉得结果不太像自己，多半是几道题的分寸没拿准。隔一段时间再测一次，通常会不一样。'
      }));
      return;
    }

    var t = state.talent;
    els.talentName.textContent = t.name + ' · ' + t.tagline;
    els.talentDesc.textContent = t.desc;

    CLJ.clear(els.talentWatch);
    els.talentWatch.appendChild(CLJ.el('li', { text: t.watch }));
  }

  /* ============================================================
   * 四、和你最像的名人
   * ============================================================ */

  function renderFigures() {
    var box = els.figureList;
    CLJ.clear(box);
    if (!box) return;

    if (!state.figures.length) {
      /* 八项持平：没有形状可比，如实说不硬套，而不是随便给一个 */
      box.appendChild(CLJ.el('p', {
        class: 't-body',
        text: '这一块要等你八项分值得出明显的高低才好说。现在八项比较接近，硬套一位名人反而是编的。'
      }));
      return;
    }

    /* 最像的那位 + 另外两位，全部塞进同一个容器 —— 间距交给 flex gap 统一管，
     * 不分成两个容器（那样首卡的间距会受容器边距影响，看起来忽大忽小）。 */
    var first = state.figures[0].figure;
    var main = CLJ.el('article', { class: 'result-card result-card--main card card--glow anim-pop' });
    main.appendChild(CLJ.el('div', { class: 'result-card__head' }, [
      CLJ.el('div', { class: 'result-card__title-box' }, [
        CLJ.el('div', { class: 'tag-row' }, [
          CLJ.el('span', { class: 'chip', text: '思维方式相近' })
        ]),
        CLJ.el('h3', { class: 'result-card__name', text: first.name }),
        CLJ.el('p', { class: 'result-card__reason', text: first.why })
      ])
    ]));
    box.appendChild(main);

    state.figures.slice(1).forEach(function (m, i) {
      var card = CLJ.el('article', { class: 'result-card card anim-up d-' + Math.min(i + 1, 6) });
      card.appendChild(CLJ.el('div', { class: 'tag-row' }, [
        CLJ.el('span', { class: 'chip chip--plain chip--sm', text: '也有一点像' })
      ]));
      card.appendChild(CLJ.el('h3', { class: 'result-card__name', text: m.figure.name }));
      card.appendChild(CLJ.el('p', { class: 'result-card__reason', text: m.figure.why }));
      box.appendChild(card);
    });
  }

  /* ============================================================
   * 五、其它测试与操作
   * ============================================================ */

  function renderOthers() {
    var others = (CFG.TESTS || []).filter(function (t) { return t.id !== 'talent'; });
    CLJ.clear(els.others);

    others.forEach(function (t, i) {
      var card;
      if (t.online) {
        card = CLJ.el('a', {
          class: 'mini-test card anim-up d-' + Math.min(i + 1, 6),
          href: CLJ_ASSET(t.path + 'index.html')
        });
      } else {
        card = CLJ.el('div', { class: 'mini-test card is-soon anim-up d-' + Math.min(i + 1, 6) });
      }
      card.appendChild(CLJ.el('div', { class: 'mini-test__top' }, [
        CLJ.el('span', { class: 'mini-test__name', text: t.name }),
        CLJ.el('span', {
          class: 'chip ' + (t.online ? '' : 'chip--plain'),
          text: t.online ? '去测试' : '即将上线'
        })
      ]));
      card.appendChild(CLJ.el('p', { class: 't-small', text: t.intro || '' }));
      els.others.appendChild(card);
    });
  }

  /** 结果页的标题，用主画像名代替干巴巴的「我的测试结果」 */
  function buildResultTitle() {
    var name = state.flat ? S.levelProfile(state.scores).code
                          : (state.talent ? state.talent.name : '我的结果');
    return '我的天赋画像是「' + name + '」' + CFG.SHARE_TITLE_SUFFIX;
  }

  /** 导出的图片文件名。带「天赋测试」四个字，所以留在本文件 */
  function filename() {
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return CFG.BRAND + '-天赋测试-' + stamp + '.png';
  }

  function bindActions() {
    CLJ.qs('#btn-retry').addEventListener('click', function () {
      CLJ.store.remove(KEY_FINAL);
      CLJ.store.remove(KEY_PROGRESS);
      window.location.href = 'index.html';
    });

    CLJ.qs('#btn-home').addEventListener('click', function () {
      window.location.href = CLJ_ASSET('index.html');
    });

    /* 出图与交付整套逻辑在 js/save.js 里，这里只告诉它「这张图怎么生成、
     * 叫什么名字、分享时用什么标题」。 */
    CLJ.qs('#btn-save-img').addEventListener('click', function () {
      CLJ_SAVE.saveResultImage({
        buildCanvas: function () { return CLJ_POSTER.render(posterSpec()); },
        filename: filename,
        shareTitle: buildResultTitle
      });
    });
  }

  /* ============================================================
   * 六、海报内容
   * ============================================================ */

  /** 把天赋测试的结果翻译成海报的**内容描述**，真正画图的是 js/poster.js。
   *  这里只做数据映射，不碰任何画布细节。 */
  function posterSpec() {
    var sc = state.scores;
    var top = S.topDims(sc, 3);
    var lvl = S.levelProfile(sc);

    var spec = {
      subtitle: '你的天赋是什么 · ' + versionChipText(),
      head: headlineCode(),
      headLabel: state.flat ? '八项比较接近' : '主天赋画像',
      radar: {
        keys: S.DIM_KEYS,
        pct: sc.pct,
        nameOf: function (k) { return S.dim(k).name; },
        R: 118                            // 八轴比六轴密，半径收一点留出标签空间
      },
      qr: {
        url: CLJ_POSTER.qrUrl(),
        title: '看看你是哪种天赋人',
        sub: '扫码或长按识别都行'
      },
      footerLine: CFG.POSTER_BRAND_LINE.replace(/^[^·]*·\s*/, ''),
      disclaimer: CFG.DISCLAIMER,
      sections: []
    };

    if (state.flat) {
      spec.lead = {
        label: '八项分布',
        name: '都很接近',
        desc: '平均 ' + lvl.avg + ' 分 · ' + lvl.code + '。没有哪一项明显突出，就没有硬挑一个长板。'
      };
    } else {
      spec.lead = {
        label: '天赋组合',
        name: top.map(function (k) { return S.dim(k).name; }).join(' · '),
        desc: state.talent ? state.talent.tagline + '。' + state.talent.desc : ''
      };
    }

    /* 最像的名人放成列表块 —— 和职业测试的「可能也适合」用的是同一套区块 */
    if (state.figures.length) {
      spec.sections.push({
        label: '和你最像的名人',
        rows: state.figures.map(function (m) {
          return { name: m.figure.name, meta: '', value: '' };
        })
      });
    }

    return spec;
  }

  /* ------------------------------------------------------------
   * 启动
   * ---------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

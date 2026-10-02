/* ============================================================
 * 长留玉 · 职业测试 · 结果页逻辑
 * ------------------------------------------------------------
 * 依赖：config.js → global.js → questions-*.js → careers-part*.js
 *      → scoring.js → data.js → qr.js → result.js
 *
 * 职责：
 *   1. 读取答题快照，算分、匹配职业
 *   2. 渲染雷达图（页面用纯 SVG，海报里用 canvas 画同一套几何）
 *   3. 渲染维度条 / 职业卡片 / 行动建议
 *   4. 生成结果图片：单一的自绘 Canvas 渲染器（含二维码），零外部依赖
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;
  var DATA = window.CLJ_DATA;
  var S = window.CLJ_SCORING;
  var CLJ = window.CLJ;

  var KEY_FINAL = 'career_final';
  var KEY_PROGRESS = 'career_progress';

  var state = {
    version: DATA.DEFAULT_VERSION,
    answers: {},
    scores: null,
    matches: [],
    topCareer: null,
    busy: false
  };

  var els = {};

  /* ============================================================
   * 一、启动
   * ============================================================ */

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
    var careers = DATA.careers();

    /* ---- 算分 ---- */
    state.scores = S.computeScores(questions, state.answers);

    /* ---- 匹配职业 ---- */
    var wants = state.version === 'full' ? 5 : 3;
    state.matches = S.matchCareers(state.scores.pct, careers, wants);
    state.topCareer = state.matches.length ? state.matches[0].career : null;

    /* ---- 渲染 ---- */
    renderHero();
    renderRadar();
    renderDims();
    renderCareers();
    renderAdvice();
    renderOthers();
    bindActions();

    /* ---- 开发自检（只在控制台可见）---- */
    var rep = DATA.validate();
    if (!rep.ok) console.warn('[长留玉] 数据自检发现问题：', rep);

    // 让分享出去的落地页直接就是结果页
    document.title = buildResultTitle();
  }

  function cacheEls() {
    els.codeLabel = CLJ.qs('#code-label');
    els.code = CLJ.qs('#result-code');
    els.title = CLJ.qs('#result-title');
    els.profile = CLJ.qs('#result-profile');
    els.spread = CLJ.qs('#result-spread');
    els.radar = CLJ.qs('#radar-holder');
    els.dims = CLJ.qs('#dim-bars');
    els.main = CLJ.qs('#career-main');
    els.alt = CLJ.qs('#result-alt');
    els.altWrap = CLJ.qs('#result-alt-wrap');
    els.advice = CLJ.qs('#advice-list');
    els.others = CLJ.qs('#other-tests');
    els.strengths = CLJ.qs('#strength-tags');
    els.metaTags = CLJ.qs('#meta-tags');
  }

  /* ============================================================
   * 二、头部画像
   * ============================================================ */

  /** 头部的「代码」位。
   *  六维完全持平时没有霍兰德代码可言 —— 六个维度并列第一，
   *  取谁做前三都是按定义顺序随手拿的，换个用户也是同一串。
   *  这时改用能量轴上的投入等级，那才是这份作答里唯一真实的信息。 */
  function headlineCode() {
    var uni = S.uniformProfile(state.scores);
    return uni ? uni.code : S.hollandCode(state.scores, 3);
  }

  function versionChipText() {
    return state.version === 'full' ? '全量版 · 120 题' : '精简版 · 30 题';
  }

  function renderHero() {
    var sc = state.scores;
    var uni = S.uniformProfile(sc);

    if (uni) {
      /* ---------- 兴趣分布均匀：换个说法，别硬编代码 ---------- */
      if (els.codeLabel) els.codeLabel.textContent = '整体投入度';
      els.code.textContent = uni.code;
      els.title.textContent = state.topCareer ? state.topCareer.name : '暂未匹配到合适职业';
      els.profile.textContent = uni.text;

      CLJ.clear(els.strengths);
      els.strengths.appendChild(CLJ.el('span', { class: 'chip', text: uni.typeName }));
      els.strengths.appendChild(CLJ.el('span', { class: 'chip chip--plain', text: versionChipText() }));

      // 持平时「强项关键词」没有意义（六维一样），换成能解释推荐依据的两条
      CLJ.clear(els.metaTags);
      els.metaTags.appendChild(CLJ.el('span', {
        class: 'chip chip--plain chip--sm', text: '六维都是 ' + uni.value + '%'
      }));
      els.metaTags.appendChild(CLJ.el('span', {
        class: 'chip chip--plain chip--sm', text: '推荐按整体投入度匹配'
      }));

      // 上面那段文案已经说了「均匀」，这行再重复一次没意义
      els.spread.textContent = '';
      return;
    }

    /* ---------- 正常路径 ---------- */
    if (els.codeLabel) els.codeLabel.textContent = '你的霍兰德兴趣代码';
    els.code.textContent = S.hollandCode(sc, 3);
    els.title.textContent = state.topCareer
      ? state.topCareer.name
      : '暂未匹配到合适职业';
    els.profile.textContent = S.profileSentence(sc);

    var spread = S.spreadLevel(sc);
    els.spread.textContent = spread.text;

    // 前两维的强项标签
    CLJ.clear(els.strengths);
    sc.order.slice(0, 2).forEach(function (k) {
      var d = S.dim(k);
      if (!d) return;
      els.strengths.appendChild(CLJ.el('span', { class: 'chip', text: d.name + ' · ' + d.alias }));
    });
    els.strengths.appendChild(CLJ.el('span', {
      class: 'chip chip--plain',
      text: versionChipText()
    }));

    // 每维度的强项关键词汇总
    CLJ.clear(els.metaTags);
    var seen = {};
    sc.order.slice(0, 3).forEach(function (k) {
      var d = S.dim(k);
      if (!d) return;
      d.strengths.forEach(function (s) {
        if (seen[s]) return;
        seen[s] = true;
        els.metaTags.appendChild(CLJ.el('span', { class: 'chip chip--plain chip--sm', text: s }));
      });
    });
  }

  /* ============================================================
   * 三、雷达图（纯 SVG 手绘，零依赖、可缩放、可截图）
   * ============================================================ */

  /* 雷达图的 SVG 生成器已抽到 js/radar.js（公共模块，轴数可变）。 */

  /* 本页用的一层薄封装：把「当前结果的 pct + 六维名称」固定下来。
   * 抽公共模块之后，调用点不用每次都手写那一坨 spec。 */
  function buildRadarSVG(pct, size) {
    return CLJ_RADAR.svg(pct, size, {
      keys: S.DIM_KEYS,
      nameOf: function (k) { return S.dim(k).name; }
    });
  }


  function renderRadar() {
    els.radar.innerHTML = buildRadarSVG(state.scores.pct, 300);
  }

  /* ============================================================
   * 四、维度百分比条
   * ============================================================ */

  function renderDims() {
    CLJ.clear(els.dims);
    var pct = state.scores.pct;
    var detailed = state.version === 'full';

    state.scores.order.forEach(function (key, i) {
      var d = S.dim(key);
      var val = pct[key];

      var row = CLJ.el('div', { class: 'dim-row anim-up d-' + Math.min(i + 1, 6) });
      row.appendChild(CLJ.el('div', { class: 'dim-row__head' }, [
        CLJ.el('span', { class: 'dim-row__name', text: d.name }),
        CLJ.el('span', { class: 'dim-row__alias', text: d.alias }),
        CLJ.el('span', { class: 'dim-row__val t-num', text: val + '%' })
      ]));

      var track = CLJ.el('div', { class: 'dim-row__track' });
      var fill = CLJ.el('div', { class: 'dim-row__fill' });
      // 先给 0 宽度，下一帧再设目标宽度，触发 CSS 过渡
      fill.style.width = '0%';
      track.appendChild(fill);
      row.appendChild(track);

      if (detailed) {
        row.appendChild(CLJ.el('p', { class: 'dim-row__comment', text: S.dimComment(key, val) }));
      }
      els.dims.appendChild(row);

      requestAnimationFrame(function () {
        requestAnimationFrame(function () { fill.style.width = val + '%'; });
      });
    });
  }

  /* ============================================================
   * 五、职业卡片
   * ============================================================ */

  function renderCareers() {
    if (!state.matches.length) {
      els.main.textContent = '职业库没有加载成功，请检查 careers-part*.js 是否已引入。';
      els.altWrap.style.display = 'none';
      return;
    }

    var top = state.matches[0];
    CLJ.clear(els.main);
    els.main.appendChild(careerMainCard(top));

    var rest = state.matches.slice(1);
    CLJ.clear(els.alt);
    if (!rest.length) {
      els.altWrap.style.display = 'none';
    } else {
      els.altWrap.style.display = '';
      rest.forEach(function (m, i) {
        els.alt.appendChild(careerAltCard(m, i));
      });
    }
  }

  function careerMainCard(m) {
    var c = m.career;
    var card = CLJ.el('article', { class: 'result-card result-card--main card card--glow anim-pop' });

    // 顶部：匹配度 + 名称
    var head = CLJ.el('div', { class: 'result-card__head' }, [
      CLJ.el('div', { class: 'result-card__ring' }, [
        CLJ.el('span', { class: 'result-card__ring-num t-num', text: m.fit + '%' }),
        CLJ.el('span', { class: 'result-card__ring-label', text: '匹配度' })
      ]),
      CLJ.el('div', { class: 'result-card__title-box' }, [
        CLJ.el('div', { class: 'tag-row' }, [
          CLJ.el('span', { class: 'chip', text: c.category || '未分类' }),
          CLJ.el('span', { class: 'chip chip--plain', text: '最佳匹配' })
        ]),
        CLJ.el('h3', { class: 'result-card__name', text: c.name }),
        CLJ.el('p', { class: 'result-card__reason', text: m.reason || '' })
      ])
    ]);
    card.appendChild(head);

    card.appendChild(CLJ.el('p', { class: 't-body result-card__desc', text: c.desc || '' }));

    // 推荐技能
    if (c.skills && c.skills.length) {
      var skillBox = CLJ.el('div', { class: 'result-card__block' }, [
        CLJ.el('div', { class: 'result-card__label', text: '推荐积累的技能' })
      ]);
      var tr = CLJ.el('div', { class: 'tag-row' });
      c.skills.forEach(function (s) { tr.appendChild(CLJ.el('span', { class: 'chip', text: s })); });
      skillBox.appendChild(tr);
      card.appendChild(skillBox);
    }

    // 工作环境
    if (c.env) {
      card.appendChild(CLJ.el('div', { class: 'result-card__block' }, [
        CLJ.el('div', { class: 'result-card__label', text: '典型工作环境' }),
        CLJ.el('p', { class: 't-body', text: c.env })
      ]));
    }

    // 全量版追加：该职业最看重的两个维度
    if (state.version === 'full') {
      var keys = S.topDimsOf(c);
      var box = CLJ.el('div', { class: 'result-card__block' }, [
        CLJ.el('div', { class: 'result-card__label', text: '这个职业最看重' })
      ]);
      var tr2 = CLJ.el('div', { class: 'tag-row' });
      keys.forEach(function (k) {
        var d = S.dim(k);
        tr2.appendChild(CLJ.el('span', { class: 'chip chip--plain', text: d.name + ' ' + (c.w[k] || 0) + '/5' }));
      });
      box.appendChild(tr2);
      card.appendChild(box);
    }

    return card;
  }

  function careerAltCard(m, i) {
    var c = m.career;
    return CLJ.el('article', { class: 'result-alt card anim-up d-' + Math.min(i + 2, 6) }, [
      CLJ.el('div', { class: 'result-alt__top' }, [
        CLJ.el('span', { class: 'result-alt__rank t-num', text: '#' + (i + 2) }),
        CLJ.el('h4', { class: 'result-alt__name', text: c.name }),
        CLJ.el('span', { class: 'result-alt__fit t-num', text: m.fit + '%' })
      ]),
      CLJ.el('p', { class: 'result-alt__meta', text: (c.category || '') + ' · ' + (c.env || '') }),
      CLJ.el('p', { class: 't-body', text: c.desc || '' })
    ]);
  }

  /* ============================================================
   * 六、行动建议
   * ============================================================ */

  function renderAdvice() {
    var list = S.buildAdvice(state.scores, state.version !== 'full');
    CLJ.clear(els.advice);
    list.forEach(function (text, i) {
      els.advice.appendChild(CLJ.el('li', { class: 'advice anim-up d-' + Math.min(i + 1, 6) }, [
        CLJ.el('span', { class: 'advice__idx t-num', text: String(i + 1).padStart(2, '0') }),
        CLJ.el('span', { class: 'advice__text', text: text })
      ]));
    });

    // 补一条来自最低维度的提醒，让建议更完整
    var lowest = state.scores.order[state.scores.order.length - 1];
    var ld = S.dim(lowest);
    els.advice.appendChild(CLJ.el('li', { class: 'advice advice--muted anim-up' }, [
      CLJ.el('span', { class: 'advice__idx t-num', text: '说明' }),
      CLJ.el('span', {
        class: 'advice__text',
        text: ld.name + '是你相对最弱的一环（' + state.scores.pct[lowest] + '%），不必硬补，找互补的人合作往往更划算。'
      })
    ]));
  }

  /* ============================================================
   * 八、其它测试推荐
   * ============================================================ */

  function renderOthers() {
    var others = (CFG.TESTS || []).filter(function (t) { return t.id !== 'career'; });
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

  /* ============================================================
   * 九、按钮
   * ============================================================ */

  /** 结果页的标题，用「我的职业倾向是『X』」代替干巴巴的「我的测试结果」。
   *  分享按钮已经下线，这里只服务于浏览器标签页标题。 */
  function buildResultTitle() {
    var name = state.topCareer ? state.topCareer.name : '我的结果';
    return '我的职业倾向是「' + name + '」' + CFG.SHARE_TITLE_SUFFIX;
  }

  /** 导出的图片文件名。这里带「职业测试」四个字，所以留在本文件，
   *  不放进公共的 js/save.js —— 那边只知道一个通用的默认名。 */
  function filename() {
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return CFG.BRAND + '-职业测试-' + stamp + '.png';
  }

  function bindActions() {    CLJ.qs('#btn-retry').addEventListener('click', function () {
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

  /* 结果图片的保存与交付已抽到 js/save.js（公共模块）。
   * 这里只负责用当前结果拼出 buildCanvas / filename / shareTitle。 */

  function posterSpec() {
    var sc = state.scores;
    var uni = S.uniformProfile(sc);
    var c = state.topCareer;

    var spec = {
      subtitle: '你适合什么样的职业 · ' + (state.version === 'full' ? '全量版 120 题' : '精简版 30 题'),
      head: headlineCode(),
      headLabel: uni ? '整体投入度' : '霍兰德兴趣代码',
      radar: {
        keys: S.DIM_KEYS,
        pct: sc.pct,
        nameOf: function (k) { return S.dim(k).name; }
      },
      qr: {
        url: CLJ_POSTER.qrUrl(),
        title: '看看你是哪种职业人',
        sub: '扫码或长按识别都行'
      },
      footerLine: CFG.POSTER_BRAND_LINE.replace(/^[^·]*·\s*/, ''),
      disclaimer: CFG.DISCLAIMER,
      sections: []
    };

    if (c) {
      spec.lead = {
        label: '最佳匹配职业',
        name: c.name,
        badge: state.matches[0].fit + '%',
        desc: (c.category || '') + ' · ' + (c.desc || '')
      };
    }

    var alts = state.matches.slice(1, 3);
    if (alts.length) {
      spec.sections.push({
        label: '可能也适合',
        rows: alts.map(function (m) {
          return { name: m.career.name, meta: m.career.category || '', value: m.fit + '%' };
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

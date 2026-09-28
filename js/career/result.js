/* ============================================================
 * 长留玉 · 职业测试 · 结果页逻辑
 * ------------------------------------------------------------
 * 依赖：config.js → global.js → questions-*.js → careers-part*.js
 *      → scoring.js → data.js → result.js
 *
 * 职责：
 *   1. 读取答题快照，算分、匹配职业
 *   2. 渲染雷达图（纯 SVG，无第三方库）
 *   3. 渲染维度条 / 职业卡片 / 行动建议
 *   4. 分享：复制链接、Web Share、生成结果图片（html2canvas 懒加载 + Canvas 兜底）
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
    document.title = buildShareTitle();
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
    els.alt = CLJ.qs('#career-alt');
    els.altWrap = CLJ.qs('#career-alt-wrap');
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

  function buildRadarSVG(pct, size) {
    size = size || 300;
    var keys = S.DIM_KEYS;
    var n = keys.length;
    var cx = size / 2;
    var cy = size / 2;
    var R = size * 0.315;                 // 数据半径，留出标签空间
    var labelR = R * 1.24;

    function point(i, ratio) {
      var ang = -Math.PI / 2 + i * (2 * Math.PI / n);
      return [cx + Math.cos(ang) * R * ratio, cy + Math.sin(ang) * R * ratio];
    }

    function polygon(ratio) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var p = point(i, ratio);
        out.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
      }
      return out.join(' ');
    }

    var svg = [];
    svg.push('<svg class="radar" viewBox="0 0 ' + size + ' ' + size + '" role="img" ' +
             'aria-label="六维度雷达图" xmlns="http://www.w3.org/2000/svg">');
    svg.push('<defs>' +
      '<linearGradient id="cljRadarFill" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#A78BFA" stop-opacity="0.55"/>' +
        '<stop offset="100%" stop-color="#6C5CE7" stop-opacity="0.18"/>' +
      '</linearGradient>' +
      '<radialGradient id="cljRadarGlow" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0%" stop-color="#6C5CE7" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="#6C5CE7" stop-opacity="0"/>' +
      '</radialGradient>' +
    '</defs>');

    // 背景光晕
    svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 1.18).toFixed(1) +
             '" fill="url(#cljRadarGlow)"/>');

    // 四层网格
    [0.25, 0.5, 0.75, 1].forEach(function (r) {
      svg.push('<polygon points="' + polygon(r) + '" fill="none" ' +
               'stroke="rgba(255,255,255,' + (r === 1 ? '0.18' : '0.07') + ')" ' +
               'stroke-width="1"/>');
    });

    // 六条轴线
    for (var i = 0; i < n; i++) {
      var p = point(i, 1);
      svg.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) +
               '" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>');
    }

    // 数据多边形
    var dataPts = [];
    for (var j = 0; j < n; j++) {
      var ratio = S.clamp(pct[keys[j]] || 0, 0, 100) / 100;
      var q = point(j, Math.max(ratio, 0.06));   // 最小值给一点视觉余量，避免完全塌到圆心
      dataPts.push(q);
    }
    svg.push('<polygon points="' +
             dataPts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') +
             '" fill="url(#cljRadarFill)" stroke="#A78BFA" stroke-width="2" ' +
             'stroke-linejoin="round"/>');

    // 顶点圆点
    dataPts.forEach(function (p) {
      svg.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) +
               '" r="3.5" fill="#F5F5F7" stroke="#8B7CF6" stroke-width="2"/>');
    });

    // 轴标签：维度名 + 分值
    for (var k = 0; k < n; k++) {
      var lp = point(k, labelR / R);
      var dx = lp[0] - cx;
      var anchor = dx > size * 0.06 ? 'start' : (dx < -size * 0.06 ? 'end' : 'middle');
      var dy = lp[1] - cy;
      var baseline = dy > size * 0.08 ? 'hanging' : (dy < -size * 0.08 ? 'auto' : 'middle');

      svg.push('<text x="' + lp[0].toFixed(1) + '" y="' + lp[1].toFixed(1) + '" ' +
               'text-anchor="' + anchor + '" dominant-baseline="' + baseline + '" ' +
               'fill="#A1A1AA" font-size="10" font-family="system-ui,-apple-system,\'PingFang SC\',sans-serif">' +
               S.dim(keys[k]).name +
               '</text>');
      svg.push('<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 13).toFixed(1) + '" ' +
               'text-anchor="' + anchor + '" dominant-baseline="' + baseline + '" ' +
               'fill="#F5F5F7" font-size="12" font-weight="600" ' +
               'font-family="system-ui,-apple-system,\'PingFang SC\',sans-serif">' +
               (pct[keys[k]] || 0) + '</text>');
    }

    svg.push('</svg>');
    return svg.join('');
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
    var card = CLJ.el('article', { class: 'career-card career-card--main card card--glow anim-pop' });

    // 顶部：匹配度 + 名称
    var head = CLJ.el('div', { class: 'career-card__head' }, [
      CLJ.el('div', { class: 'career-card__ring' }, [
        CLJ.el('span', { class: 'career-card__ring-num t-num', text: m.fit + '%' }),
        CLJ.el('span', { class: 'career-card__ring-label', text: '匹配度' })
      ]),
      CLJ.el('div', { class: 'career-card__title-box' }, [
        CLJ.el('div', { class: 'tag-row' }, [
          CLJ.el('span', { class: 'chip', text: c.category || '未分类' }),
          CLJ.el('span', { class: 'chip chip--plain', text: '最佳匹配' })
        ]),
        CLJ.el('h3', { class: 'career-card__name', text: c.name }),
        CLJ.el('p', { class: 'career-card__reason', text: m.reason || '' })
      ])
    ]);
    card.appendChild(head);

    card.appendChild(CLJ.el('p', { class: 't-body career-card__desc', text: c.desc || '' }));

    // 推荐技能
    if (c.skills && c.skills.length) {
      var skillBox = CLJ.el('div', { class: 'career-card__block' }, [
        CLJ.el('div', { class: 'career-card__label', text: '推荐积累的技能' })
      ]);
      var tr = CLJ.el('div', { class: 'tag-row' });
      c.skills.forEach(function (s) { tr.appendChild(CLJ.el('span', { class: 'chip', text: s })); });
      skillBox.appendChild(tr);
      card.appendChild(skillBox);
    }

    // 工作环境
    if (c.env) {
      card.appendChild(CLJ.el('div', { class: 'career-card__block' }, [
        CLJ.el('div', { class: 'career-card__label', text: '典型工作环境' }),
        CLJ.el('p', { class: 't-body', text: c.env })
      ]));
    }

    // 全量版追加：该职业最看重的两个维度
    if (state.version === 'full') {
      var keys = S.topDimsOf(c);
      var box = CLJ.el('div', { class: 'career-card__block' }, [
        CLJ.el('div', { class: 'career-card__label', text: '这个职业最看重' })
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
    return CLJ.el('article', { class: 'career-alt card anim-up d-' + Math.min(i + 2, 6) }, [
      CLJ.el('div', { class: 'career-alt__top' }, [
        CLJ.el('span', { class: 'career-alt__rank t-num', text: '#' + (i + 2) }),
        CLJ.el('h4', { class: 'career-alt__name', text: c.name }),
        CLJ.el('span', { class: 'career-alt__fit t-num', text: m.fit + '%' })
      ]),
      CLJ.el('p', { class: 'career-alt__meta', text: (c.category || '') + ' · ' + (c.env || '') }),
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
   * 九、按钮与分享
   * ============================================================ */

  function buildShareTitle() {
    var name = state.topCareer ? state.topCareer.name : '我的结果';
    return '我的职业倾向是「' + name + '」' + CFG.SHARE_TITLE_SUFFIX;
  }

  function buildShareUrl() {
    return CLJ_ASSET('career/result.html');
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

    CLJ.qs('#btn-copy').addEventListener('click', function () {
      CLJ.copy(buildShareUrl()).then(function (ok) {
        CLJ.toast(ok ? '链接已复制，去粘贴给朋友吧' : '复制失败，请手动复制地址栏链接');
      });
    });

    CLJ.qs('#btn-share').addEventListener('click', function () {
      var payload = {
        title: buildShareTitle(),
        text: CFG.SHARE_TEXT,
        url: buildShareUrl()
      };
      if (navigator.share) {
        navigator.share(payload).catch(function () { /* 用户取消，不打扰 */ });
      } else {
        CLJ.copy(buildShareUrl()).then(function (ok) {
          CLJ.toast(ok ? '当前环境不支持系统分享，链接已复制' : '分享失败，请手动复制链接');
        });
      }
    });

    CLJ.qs('#btn-save-img').addEventListener('click', saveResultImage);
  }

  /* ------------------------------------------------------------
   * 结果图片
   * ---------------------------------------------------------- */

  function buildPoster(scale) {
    scale = scale || 1;
    var sc = state.scores;
    var c = state.topCareer;
    var W = 420;

    var poster = CLJ.el('div', { class: 'poster' });
    poster.style.width = W + 'px';

    // 品牌行
    var brandRow = CLJ.el('div', { class: 'poster__brand' });
    /* 这里刻意不用 <img>：海报里只要出现一张外部图片，
     * 截出来的画布就有被跨域内容污染的风险，一旦污染，
     * toBlob / toDataURL 会直接抛 SecurityError，图就存不下来了。
     * 用 canvas 现画 logo，画布永远是干净的。 */
    brandRow.appendChild(logoElement(26));
    brandRow.appendChild(CLJ.el('span', { class: 'poster__brand-name', text: CFG.BRAND }));
    brandRow.appendChild(CLJ.el('span', { class: 'poster__brand-en', text: CFG.BRAND_EN }));
    poster.appendChild(brandRow);

    poster.appendChild(CLJ.el('div', { class: 'poster__test-name', text: '你适合什么样的职业' }));
    poster.appendChild(CLJ.el('div', { class: 'poster__code', text: headlineCode() + ' · ' + (state.version === 'full' ? '全量版' : '精简版') }));

    // 最佳职业
    if (c) {
      var box = CLJ.el('div', { class: 'poster__career' }, [
        CLJ.el('div', { class: 'poster__career-label', text: '最佳匹配职业' }),
        CLJ.el('div', { class: 'poster__career-name', text: c.name }),
        CLJ.el('div', { class: 'poster__career-meta', text: (c.category || '') + ' · 匹配度 ' + state.matches[0].fit + '%' }),
        CLJ.el('div', { class: 'poster__career-desc', text: c.desc || '' })
      ]);
      poster.appendChild(box);
    }

    // 小型雷达图
    var radarBox = CLJ.el('div', { class: 'poster__radar' });
    radarBox.innerHTML = buildRadarSVG(sc.pct, 240);
    poster.appendChild(radarBox);

    // 维度条
    var bars = CLJ.el('div', { class: 'poster__bars' });
    sc.order.forEach(function (k) {
      var d = S.dim(k);
      var row = CLJ.el('div', { class: 'poster__bar-row' }, [
        CLJ.el('span', { class: 'poster__bar-name', text: d.name }),
        CLJ.el('span', { class: 'poster__bar-value t-num', text: sc.pct[k] + '%' })
      ]);
      var track = CLJ.el('div', { class: 'poster__bar-track' });
      var fill = CLJ.el('div', { class: 'poster__bar-fill' });
      fill.style.width = sc.pct[k] + '%';
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
    });
    poster.appendChild(bars);

    // 底部
    poster.appendChild(CLJ.el('div', { class: 'poster__footer' }, [
      CLJ.el('div', { class: 'poster__foot-brand', text: CFG.POSTER_BRAND_LINE }),
      CLJ.el('div', { class: 'poster__foot-url', text: prettyUrl() }),
      CLJ.el('div', { class: 'poster__foot-note', text: CFG.DISCLAIMER })
    ]));

    if (scale !== 1) poster.style.transform = 'scale(' + scale + ')';

    // 放到屏幕外渲染，不影响可见布局
    var holder = CLJ.el('div', { class: 'poster-holder' });
    holder.appendChild(poster);
    document.body.appendChild(holder);
    return holder;
  }

  function prettyUrl() {
    var u = CFG.BASE_URL || '';
    if (!u || u === './') return CFG.BRAND + ' · 职业测试';
    return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  function filename() {
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return CFG.BRAND + '-职业测试-' + stamp + '.png';
  }

  function ensureHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    // 主 CDN 失败时自动换备用 CDN，再不行就退回本地 Canvas 手绘方案
    return CLJ.loadScript(CFG.CDN.html2canvas)
      .catch(function () {
        return CLJ.loadScript('https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js');
      })
      .then(function () {
        if (!window.html2canvas) throw new Error('html2canvas 不可用');
        return window.html2canvas;
      });
  }

  /* ------------------------------------------------------------
   * 结果图片：多级降级 + 能说清的失败原因
   * ------------------------------------------------------------
   * 管线分三级：
   *   ① html2canvas 渲染真实 DOM —— 最还原，但依赖 CDN，且受跨域策略影响
   *   ② 本地 Canvas 手绘        —— 零依赖、零跨域，断网也能出图
   *   ③ 两级都失败              —— 把真实原因带出来，不再只丢一句「失败」
   *
   * 每一级都必须产出「能被安全导出的 canvas」才算通过：
   * 被跨域图片污染过的画布调用 toBlob 会抛 SecurityError，那画布等于废的，
   * 必须在交付之前就发现，否则用户只会看到一句莫名其妙的失败。
   * ---------------------------------------------------------- */

  /** 把各种异常翻译成一句人话，直接显示在提示条里 */
  function shortErr(e) {
    var m = (e && (e.message || e.name)) ? String(e.message || e.name) : String(e || '未知错误');
    if (/SecurityError|tainted|insecure|origin/i.test(m)) return '画布被跨域内容污染';
    if (/toBlob|toDataURL/i.test(m)) return '画布导出被拒绝';
    if (/fetch|network|load|加载|不可用/i.test(m)) return '外部依赖加载失败';
    if (/过大|内存|quota/i.test(m)) return '画布过大，内存不足';
    return m.replace(/\s+/g, ' ').slice(0, 32);
  }

  /** 导出 canvas。被污染的画布会在这里抛 SecurityError —— 这是最关键的一道关 */
  function exportBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (!canvas) { reject(new Error('没有拿到画布')); return; }
      if (typeof canvas.toBlob !== 'function') {
        // 极老浏览器没有 toBlob：退回 dataURL 探一次，能出就当作通过
        try { canvas.toDataURL('image/png'); resolve(null); } catch (e) { reject(e); }
        return;
      }
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('toBlob 返回空，画布可能过大或内存不足'));
        }, 'image/png');
      } catch (e) {
        reject(e);          // 同步抛出：通常是 SecurityError
      }
    });
  }

  /** 等字体就绪再截图，否则文字可能先用替身字体渲染；最多等 1.2s */
  function waitFonts() {
    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return Promise.race([ready, new Promise(function (r) { setTimeout(r, 1200); })]);
  }

  /** ① html2canvas 渲染真实 DOM */
  function html2canvasPoster() {
    var holder = null;
    function drop() { if (holder && holder.parentNode) holder.parentNode.removeChild(holder); }

    return ensureHtml2Canvas()
      .then(function (h2c) {
        holder = buildPoster();
        return waitFonts().then(function () {
          return h2c(CLJ.qs('.poster', holder), {
            backgroundColor: '#0B0B0F',
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            width: 420,
            windowWidth: 420
          });
        });
      })
      .then(function (canvas) { drop(); return canvas; },
            function (e) { drop(); throw e; });
  }
  html2canvasPoster.label = 'html2canvas';

  /** ② 本地 Canvas 手绘兜底 */
  function localPoster() {
    return Promise.resolve().then(function () { return drawFallbackPoster(); });
  }
  localPoster.label = '本地Canvas';

  function saveResultImage() {
    if (state.busy) return;
    state.busy = true;
    var btn = CLJ.qs('#btn-save-img');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在生成…';

    var reasons = [];
    var producers = [html2canvasPoster, localPoster];

    // 兜底保险：任何环节卡死，按钮都不会永远停在「正在生成…」
    var guard = setTimeout(function () {
      if (!state.busy) return;
      finish();
      CLJ.toast('生成超时了，可以重试或改用「复制链接」分享', 3200);
    }, 20000);

    function finish() {
      clearTimeout(guard);
      state.busy = false;
      btn.disabled = false;
      btn.textContent = old;
    }

    // 逐个 producer 尝试，直到有一个能产出「可安全导出」的画布
    function attempt(i) {
      if (i >= producers.length) return Promise.reject(new Error(reasons.join('；')));
      var make = producers[i];
      return make()
        .then(function (canvas) {
          return exportBlob(canvas).then(function (blob) {
            return { canvas: canvas, blob: blob, by: make.label };
          });
        })
        .catch(function (e) {
          reasons.push(make.label + '：' + shortErr(e));
          if (i === 0) console.warn('[长留玉] html2canvas 方案不可用，改用本地 Canvas 兜底：', e);
          return attempt(i + 1);
        });
    }

    attempt(0)
      .then(function (r) {
        if (r.by !== producers[0].label) {
          console.info('[长留玉] 结果图片由「' + r.by + '」生成。失败原因链：' + reasons.join('；'));
        }
        return deliver(r.canvas, r.blob);
      })
      .catch(function (e) {
        console.error('[长留玉] 生成结果图片失败：', e);
        CLJ.toast('图片生成失败（' + shortErr(e) + '），可以先复制链接分享', 4200);
      })
      .then(finish, finish);
  }

  /* ------------------------------------------------------------
   * 品牌标识的几何重绘
   * ------------------------------------------------------------
   * 站点 logo = 实心圆 + 一条波浪状分水线 + 右下方小圆点。
   * 下面的采样点是从原始 logo 文件逐行扫描描出来的分水线中心线
   * （归一化坐标，y 从 0 到 1 自上而下，x 是该行镂空段的中心）。
   * 用路径重画一遍：不依赖图片、离线可用、任意尺寸都清晰；
   * 而且只画在离屏 canvas 上，主画布不会被跨源图片污染。
   * 换 logo 时把这段删掉，改成 drawImage 加载新图即可。
   * ---------------------------------------------------------- */
  var LOGO_WAVE = [
    [0.006, 0.517], [0.052, 0.570], [0.099, 0.593], [0.145, 0.581],
    [0.192, 0.558], [0.238, 0.523], [0.285, 0.483], [0.331, 0.454],
    [0.378, 0.424], [0.424, 0.419], [0.471, 0.471], [0.517, 0.517],
    [0.564, 0.570], [0.611, 0.587], [0.657, 0.564], [0.704, 0.529],
    [0.750, 0.494], [0.797, 0.454], [0.843, 0.424], [0.890, 0.419],
    [0.936, 0.424], [0.983, 0.459], [1.000, 0.486]
  ];
  var LOGO_DOT = { x: 0.704, y: 0.762, r: 0.054 };
  var LOGO_LINE_W = 0.125;                       // 分水线宽度（相对直径）

  /** 生成一张带品牌标识的离屏 canvas（透明底） */
  function logoCanvas(size) {
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var g = c.getContext('2d');

    // 1. 实心圆，用与站点一致的紫调对角渐变
    var grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#6C5CE7');
    grad.addColorStop(1, '#C4B5FD');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    g.fill();

    // 2. 把分水线「挖掉」
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = size * LOGO_LINE_W;
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    g.beginPath();
    LOGO_WAVE.forEach(function (p, i) {
      var x = p[1] * size, y = p[0] * size;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.stroke();

    // 3. 把小圆点也挖掉
    g.beginPath();
    g.arc(LOGO_DOT.x * size, LOGO_DOT.y * size, LOGO_DOT.r * size, 0, Math.PI * 2);
    g.fill();

    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /** 返回一个已经画好品牌标识的 <canvas>，可直接塞进 DOM 当 logo 用。
   *  内部按 2 倍密度绘制，高分屏上不会糊。 */
  function logoElement(cssSize) {
    var size = Math.max(16, Math.round(cssSize * 2));
    var c = logoCanvas(size);
    c.className = 'poster__mark';
    c.style.width = cssSize + 'px';
    c.style.height = cssSize + 'px';
    return c;
  }

  /** 本地 Canvas 兜底：不依赖任何第三方库，离线也能出图。
   *  品牌标识用几何重绘而不是加载图片：只在离屏 canvas 上画路径，
   *  不会污染主画布，所以在 file:// 下也能正常导出 PNG。 */
  function drawFallbackPoster() {
    var W = 840, H = 1400, P = 56;   // 2 倍图，直接给高清
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var F = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif';

    // 背景
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#14121F');
    g.addColorStop(0.5, '#0B0B0F');
    g.addColorStop(1, '#0B0B0F');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 顶部光晕
    var rg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.9);
    rg.addColorStop(0, 'rgba(108,92,231,0.30)');
    rg.addColorStop(1, 'rgba(108,92,231,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H * 0.55);

    var y = P + 30;

    // 品牌标识（几何重绘）
    ctx.drawImage(logoCanvas(44), P, y - 26, 44, 44);
    ctx.fillStyle = '#A1A1AA';
    ctx.font = '500 22px ' + F;
    ctx.textAlign = 'left';
    ctx.fillText('长留玉', P + 60, y + 4);
    ctx.fillStyle = '#4B4B55';
    ctx.font = '400 16px ' + F;
    ctx.fillText('C H A N G   L I U   Y U', P + 138, y + 4);

    y += 70;
    ctx.fillStyle = '#6E6E78';
    ctx.font = '400 20px ' + F;
    ctx.fillText('你适合什么样的职业 · ' + (state.version === 'full' ? '全量版' : '精简版'), P, y);

    y += 56;
    ctx.fillStyle = '#F5F5F7';
    ctx.font = '700 44px ' + F;
    var head = headlineCode();
    ctx.fillText(head, P, y);

    ctx.fillStyle = '#6E6E78';
    ctx.font = '400 18px ' + F;
    ctx.fillText(S.uniformProfile(state.scores) ? '整体投入度' : '霍兰德兴趣代码', P + 150, y - 4);

    // 最佳职业
    if (state.topCareer) {
      y += 60;
      ctx.fillStyle = '#A78BFA';
      ctx.font = '400 18px ' + F;
      ctx.fillText('最佳匹配职业', P, y);

      y += 52;
      ctx.fillStyle = '#F5F5F7';
      ctx.font = '700 40px ' + F;
      ctx.fillText(state.topCareer.name, P, y);

      var nameW = ctx.measureText(state.topCareer.name).width;
      ctx.fillStyle = '#34D399';
      ctx.font = '600 24px ' + F;
      ctx.fillText(state.matches[0].fit + '%', P + nameW + 20, y);

      y += 40;
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '400 20px ' + F;
      wrapText(ctx, state.topCareer.desc || '', P, y, W - P * 2, 30, 2);
      y += 62;
    }

    // 维度条
    state.scores.order.forEach(function (k) {
      var d = S.dim(k);
      var val = state.scores.pct[k];
      var barW = W - P * 2;

      ctx.fillStyle = '#A1A1AA';
      ctx.font = '400 20px ' + F;
      ctx.fillText(d.name, P, y);

      ctx.fillStyle = '#F5F5F7';
      ctx.font = '600 20px ' + F;
      ctx.textAlign = 'right';
      ctx.fillText(val + '%', P + barW, y);
      ctx.textAlign = 'left';

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, P, y + 14, barW, 10, 5);
      ctx.fill();

      var fg = ctx.createLinearGradient(P, 0, P + barW, 0);
      fg.addColorStop(0, '#6C5CE7');
      fg.addColorStop(1, '#A78BFA');
      ctx.fillStyle = fg;
      roundRect(ctx, P, y + 14, Math.max(barW * val / 100, 8), 10, 5);
      ctx.fill();

      y += 56;
    });

    // 分隔线
    y += 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();

    // 底部
    y += 40;
    ctx.fillStyle = '#A78BFA';
    ctx.font = '400 20px ' + F;
    ctx.fillText(CFG.POSTER_BRAND_LINE, P, y);

    y += 32;
    ctx.fillStyle = '#6E6E78';
    ctx.font = '400 18px ' + F;
    ctx.fillText(prettyUrl(), P, y);

    y += 30;
    ctx.fillStyle = '#4B4B55';
    ctx.font = '400 16px ' + F;
    ctx.fillText(CFG.DISCLAIMER, P, y);

    return cv;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
    var line = '';
    var lines = 0;
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lineH;
        lines++;
        line = text[i];
        if (lines >= maxLines - 1) {
          // 最后一行加省略号收尾
          var rest = text.slice(i);
          while (rest.length > 1 && ctx.measureText(rest + '…').width > maxW) rest = rest.slice(0, -1);
          ctx.fillText(rest + '…', x, y);
          return y + lineH;
        }
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
    return y;
  }

  /** 把结果交给用户。顺序：系统分享 → 下载 → 铺图让用户长按保存。
   *  注意最后一步：在内嵌预览、微信内置浏览器这类环境里，
   *  <a download> 会被静默拦掉（不报错、也不下载），
   *  所以不能盲目提示「已保存」，得看看到底有没有下载能力。 */
  function deliver(canvas, blob) {
    var name = filename();

    var file = null;
    if (blob) {
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
    }

    // 1. 能走系统分享就走分享（移动端最顺）
    if (file && navigator.canShare) {
      var canShare = false;
      try { canShare = navigator.canShare({ files: [file] }); } catch (e) { canShare = false; }
      if (canShare) {
        return navigator.share({ files: [file], title: buildShareTitle(), text: CFG.SHARE_TEXT })
          .then(function () { CLJ.toast('已唤起系统分享'); })
          .catch(function () { download(); });
      }
    }

    download();
    return Promise.resolve();

    function download() {
      var url;
      try {
        url = canvas.toDataURL('image/png');
      } catch (e) {
        console.error('[长留玉] toDataURL 失败：', e);
        CLJ.toast('这张图存不下来（' + shortErr(e) + '），可以截图保存', 3600);
        return;
      }

      var a = document.createElement('a');
      // 内嵌 iframe 里下载多半被拦；老浏览器可能不支持 download 属性
      var canDownload = ('download' in a) && window.self === window.top;

      if (canDownload) {
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        CLJ.toast('图片已保存到下载目录');
      } else {
        showImageOverlay(url);
      }
    }
  }

  /** 不能直接下载时的兜底：把图铺在遮罩层上，让用户长按（桌面右键）保存 */
  function showImageOverlay(dataUrl) {
    var prev = CLJ.qs('#clj-save-overlay');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    var box = CLJ.el('div', {
      id: 'clj-save-overlay',
      class: 'save-overlay',
      role: 'dialog',
      'aria-label': '保存结果图片'
    });
    box.appendChild(CLJ.el('img', { class: 'save-overlay__img', src: dataUrl, alt: '你的测试结果图片' }));
    box.appendChild(CLJ.el('p', {
      class: 'save-overlay__hint',
      text: '当前环境不允许直接下载，长按（电脑上右键）这张图保存即可'
    }));
    var close = CLJ.el('button', {
      class: 'btn btn--ghost btn--sm save-overlay__close', type: 'button', text: '知道了'
    });
    close.addEventListener('click', function () { if (box.parentNode) box.parentNode.removeChild(box); });
    box.addEventListener('click', function (e) {
      if (e.target === box && box.parentNode) box.parentNode.removeChild(box);
    });
    box.appendChild(close);
    document.body.appendChild(box);
  }

  /* ============================================================
   * 十、启动
   * ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

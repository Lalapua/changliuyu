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
   * 九、按钮
   * ============================================================ */

  /** 结果页的标题，用「我的职业倾向是『X』」代替干巴巴的「我的测试结果」。
   *  分享按钮已经下线，这里只服务于浏览器标签页标题。 */
  function buildResultTitle() {
    var name = state.topCareer ? state.topCareer.name : '我的结果';
    return '我的职业倾向是「' + name + '」' + CFG.SHARE_TITLE_SUFFIX;
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

    CLJ.qs('#btn-save-img').addEventListener('click', saveResultImage);
  }

  /* ------------------------------------------------------------
   * 结果图片
   * ---------------------------------------------------------- */


  function filename() {
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return CFG.BRAND + '-职业测试-' + stamp + '.png';
  }

  /* ------------------------------------------------------------
   * 结果图片：单一的自绘 Canvas 渲染器
   * ------------------------------------------------------------
   * 原来是三级降级：html2canvas 渲染真实 DOM → 本地 Canvas 手绘 → 报错。
   * 现在把 html2canvas 整条路砍掉，只留自绘，理由有三个：
   *   1. 它要联网从 CDN 拉 200KB，断网或内网环境下这一整条路直接作废；
   *   2. 它把 DOM 克隆进 iframe 再截图，画面里只要有一张跨域图片就会污染
   *      画布，之后 toBlob 抛 SecurityError，图必然存不下来 —— 之前线上
   *      报「生成图片失败」就是这个原因；
   *   3. 为了让它的渲染结果正确，还得额外维护一整套 .poster 样式，
   *      两处容易走散。
   * 自绘方案零依赖、离线可用、画布永远干净（海报里不放任何 <img>），
   * 代价只是雷达图也得自己画 —— 那本来就是现成的三角函数。
   * 出图分辨率取 2 倍（840px 宽），手机上看着是高清的。
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

  function saveResultImage() {
    if (state.busy) return;
    state.busy = true;
    var btn = CLJ.qs('#btn-save-img');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在生成…';

    // 兜底保险：任何环节卡死，按钮都不会永远停在「正在生成…」
    var guard = setTimeout(function () {
      finish();
      CLJ.toast('生成超时了，请重试', 3200);
    }, 20000);

    function finish() {
      clearTimeout(guard);
      state.busy = false;
      btn.disabled = false;
      btn.textContent = old;
    }

    var canvas;
    try {
      canvas = CLJ_POSTER.render(posterSpec());
    } catch (e) {
      console.error('[长留玉] 绘制结果图片失败：', e);
      CLJ.toast('图片生成失败（' + shortErr(e) + '）', 4200);
      finish();
      return;
    }

    /* 先验一次「能不能安全导出」再交付：被污染的画布 toBlob 会抛
     * SecurityError，那种画布是废的，早点发现比让用户看到一句
     * 莫名其妙的失败要好。 */
    exportBlob(canvas)
      .then(function (blob) { return deliver(canvas, blob); })
      .catch(function (e) {
        console.error('[长留玉] 导出结果图片失败：', e);
        CLJ.toast('图片存不下来（' + shortErr(e) + '），可以截图保存', 4200);
      })
      .then(finish, finish);
  }

  /* 海报绘制已抽到 js/poster.js（公共模块，两个测试共用）。
   * 这里只剩「把 career 的数据翻译成 poster 的内容描述」这一层。 */

  /** 把职业测试的结果翻译成海报的**内容描述**，真正画图的是 js/poster.js。
   *  这一层只做数据映射，不碰任何画布细节 —— 换海报样式不用改这里，
   *  加新测试也只是换一份 spec。 */
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
        return navigator.share({ files: [file], title: buildResultTitle(), text: CFG.SHARE_TEXT })
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

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
      canvas = drawPoster();
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

  /* ------------------------------------------------------------
   * 海报字体与工具
   * ---------------------------------------------------------- */
  var POSTER_FONT = '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif';

  /** 二维码里编的地址。
   *  优先用 config.js 里显式配置的对外地址 —— 本地预览时 BASE_URL 是
   *  127.0.0.1，扫出来对别人没用，所以线上地址要单独配。 */
  function qrUrl() {
    return CFG.SITE_URL || CFG.BASE_URL || '';
  }

  /** 画六维雷达图。
   *  topY 是这块的上边界，**返回值是这块的下边界** —— 由实际画出来的文字位置算出来，
   *  不是手填的常数。之前这里就是栽在手填上：块高按半径算，忘了轴标签还要往外
   *  伸出「维度名 + 分值」两行，结果底部的标签被下一块压住了。
   *  底部标签的落点由下面的 LABEL_PAD / GAP_* 决定，改字号也不会再错位。 */
  function drawRadar(ctx, pct, cx, topY, R) {
    var keys = S.DIM_KEYS, n = keys.length;
    var LABEL_PAD = 46;          // 标签相对半径再往外推多少
    var GAP_OUT = 20;            // 下方标签再往下让多少，别贴着图形
    var GAP_IN = 26;             // 上方/侧边标签往上让多少
    var LINE = 26;               // 名称与分值两行之间的行距
    var cy = topY + R + LABEL_PAD + LINE;   // 圆心：给顶部标签留出位置

    function pt(i, ratio) {
      var a = -Math.PI / 2 + i * (2 * Math.PI / n);
      return [cx + Math.cos(a) * R * ratio, cy + Math.sin(a) * R * ratio];
    }

    // 背后一层柔光
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3);
    halo.addColorStop(0, 'rgba(108,92,231,0.22)');
    halo.addColorStop(1, 'rgba(108,92,231,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();

    // 四层网格
    [0.25, 0.5, 0.75, 1].forEach(function (r) {
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var p = pt(i, r);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.strokeStyle = r === 1 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 六条轴线
    for (var i = 0; i < n; i++) {
      var q = pt(i, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(q[0], q[1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 数据多边形（最小值留一点余量，免得塌到圆心看不见）
    var pts = [];
    for (var j = 0; j < n; j++) {
      var ratio = S.clamp(pct[keys[j]] || 0, 0, 100) / 100;
      pts.push(pt(j, Math.max(ratio, 0.06)));
    }
    var fillGrad = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    fillGrad.addColorStop(0, 'rgba(167,139,250,0.55)');
    fillGrad.addColorStop(1, 'rgba(108,92,231,0.18)');
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();
    ctx.strokeStyle = '#A78BFA';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 顶点圆点
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = '#F5F5F7';
      ctx.fill();
      ctx.strokeStyle = '#8B7CF6';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // 轴标签：维度名 + 分值。按顶点所在方位决定往上还是往下排
    var maxBottom = cy;
    for (var k = 0; k < n; k++) {
      var lp = pt(k, (R + LABEL_PAD) / R);
      var dx = lp[0] - cx, dy = lp[1] - cy;
      ctx.textAlign = Math.abs(dx) < R * 0.22 ? 'center' : (dx > 0 ? 'left' : 'right');
      var nameY = dy > 20 ? lp[1] + GAP_OUT : lp[1] - GAP_IN;
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '400 19px ' + POSTER_FONT;
      ctx.fillText(S.dim(keys[k]).name, lp[0], nameY);
      var valY = nameY + LINE;
      ctx.fillStyle = '#F5F5F7';
      ctx.font = '700 23px ' + POSTER_FONT;
      ctx.fillText(String(pct[keys[k]] || 0), lp[0], valY);
      maxBottom = Math.max(maxBottom, valY);
    }
    ctx.textAlign = 'left';
    /* 多留 18px：底部标签是紧贴下边界的，余量太小会显得被下一块「顶」住 */
    return maxBottom + 18;
  }

  /** 画二维码。风格上**反相 + 圆润**，和站点的深色紫调一致：
   *    · 没有白色底板，码直接落在海报的深色背景上；
   *    · 数据点画成圆点，定位图形画成圆角环 —— 一处直角方块都没有；
   *    · 模块颜色是淡紫 → 浅蓝的对角渐变（#C4B5FD → #93C5FD）。
   *
   *  「为什么这么画还能扫出来」是硬约束，不能为了好看让步：
   *    · 反相二维码（浅色码点 + 深色底）是 ISO/IEC 18004 认可的方案，
   *      现代手机相机（iOS 相机、微信、Google Lens）都能识别；
   *    · 对比度：模块亮度约 0.6，背景 #0B0B0F 亮度约 0.004，对比度约 13:1，
   *      远高于扫码所需的 3:1（见 tools/verify-poster.js 的对比度断言）；
   *    · 静默区：码点外仍留满 4 个模块的纯背景色，周围不放任何文字线条
   *      （drawPoster 里给这块留了 ≥30px 的空白）；
   *    · 三个定位图形保持严格的 1:1:3:1:1 比例：圆角只削掉四个角，
   *      中心线扫过去仍是 1:1:3:1:1 —— 那是扫码器用来定位的生命线。
   *  纠错档取 config 的 QR_ECC_LEVEL（Q，可扛 25% 破损），为圆点造型留足余量。
   *
   *  返回几何信息，drawPoster 会把它挂在 canvas 上，供自检脚本精确定位
   *  （反相且没有底板之后，「找白色底板」那套定位办法就失效了）。 */
  function drawQR(ctx, url, x, y, size) {
    var qr = CLJ_QR.encode(url, CFG.QR_ECC_LEVEL || 'Q');
    var quiet = 4;
    var total = qr.size + quiet * 2;
    var cell = Math.max(2, Math.floor(size / total));
    var real = cell * total;
    var ox = x + Math.floor((size - real) / 2);
    var oy = y + Math.floor((size - real) / 2);

    /* 模块颜色：对角渐变，两端亮度都足够高 */
    var grad = ctx.createLinearGradient(ox, oy, ox + real, oy + real);
    grad.addColorStop(0, '#C4B5FD');
    grad.addColorStop(1, '#93C5FD');
    ctx.fillStyle = grad;
    ctx.strokeStyle = grad;

    function mx(c) { return ox + (c + quiet) * cell; }
    function my(r) { return oy + (r + quiet) * cell; }

    /* 定位图形：**外沿圆角、内沿方正**。
     * 用「圆角外轮廓 + 方正内轮廓」的奇偶填充造出这个环。
     * 内圈必须方正 —— 标准里这个环只有 1 格厚，内圈的角一旦被圆弧鼓出去，
     * 就会把本该留空的 (1,1) 这类格子染上墨（逐格比对直接报错，真踩过）。
     * 外圆角半径要留足余量：半径 r 下，角上模块中心距圆弧只有
     * r − √2·(r − 0.5) 格。取 1.4 时只剩 0.13 格（约 0.8px），
     * 抗锯齿一糊就掉到判定阈值以下，三个定位图形的右下角全被判成空格。
     * 取 1.0 有 0.29 格余量。理论上限是 1.7，但那是「刚好贴边」，不能用。 */
    function finder(top, left) {
      var x0 = mx(left), y0 = my(top), c = cell;
      ctx.beginPath();
      roundRect(ctx, x0, y0, c * 7, c * 7, c * 1.0);   // 外轮廓：圆角
      ctx.rect(x0 + c, y0 + c, c * 5, c * 5);          // 内轮廓：方角（空洞）
      ctx.fill('evenodd');
      roundRect(ctx, x0 + c * 2, y0 + c * 2, c * 3, c * 3, c * 0.8);   // 内核
      ctx.fill();
    }
    function inFinder(r, c) {
      return (r < 7 && c < 7) || (r < 7 && c >= qr.size - 7) || (r >= qr.size - 7 && c < 7);
    }

    /* 数据点：正圆。
     * 半径取 0.47 格（面积约占 69%）—— 再小墨量就不够了，再大相邻点会粘连。
     * 扫码器读的是每格中心，圆心正在中心，所以扫得出来；圆点造型本身也是
     * 业界常见的二维码风格。纠错档用 Q 就是为了给这种造型留容错余量。 */
    var dotR = cell * 0.47;
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (!qr.modules[r][c] || inFinder(r, c)) continue;
        ctx.beginPath();
        ctx.arc(mx(c) + cell / 2, my(r) + cell / 2, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    finder(0, 0);
    finder(0, qr.size - 7);
    finder(qr.size - 7, 0);

    return { x: ox, y: oy, size: real, cell: cell, modules: qr.size, level: CFG.QR_ECC_LEVEL || 'Q' };
  }
  function drawPoster() {
    var W = 840, P = 56;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 2600;                       // 先给足，画完按实际用量裁
    var ctx = cv.getContext('2d');
    var F = POSTER_FONT;
    var sc = state.scores;

    /* --- 背景 --- */
    var bg = ctx.createLinearGradient(0, 0, 0, cv.height);
    bg.addColorStop(0, '#16131F');
    bg.addColorStop(0.42, '#0B0B0F');
    bg.addColorStop(1, '#0B0B0F');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, cv.height);
    var glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.9);
    glow.addColorStop(0, 'rgba(108,92,231,0.30)');
    glow.addColorStop(1, 'rgba(108,92,231,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, cv.height * 0.4);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var y = P;

    /* --- 品牌行 --- */
    ctx.drawImage(logoCanvas(52), P, y, 52, 52);
    ctx.fillStyle = '#F5F5F7';
    ctx.font = '700 27px ' + F;
    ctx.fillText(CFG.BRAND, P + 68, y + 36);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6E6E78';
    ctx.font = '400 15px ' + F;
    ctx.fillText(CFG.BRAND_EN, W - P, y + 36);
    ctx.textAlign = 'left';
    y += 52 + 42;

    /* --- 测试名 --- */
    ctx.fillStyle = '#A1A1AA';
    ctx.font = '400 21px ' + F;
    ctx.fillText('你适合什么样的职业 · ' + (state.version === 'full' ? '全量版 120 题' : '精简版 30 题'), P, y);
    y += 54;

    /* --- 代码位：正常是霍兰德代码，六维持平时是投入等级 --- */
    var head = headlineCode();
    ctx.fillStyle = '#A78BFA';
    ctx.font = '800 62px ' + F;
    ctx.fillText(head, P, y + 46);
    var headW = ctx.measureText(head).width;
    ctx.fillStyle = '#6E6E78';
    ctx.font = '400 18px ' + F;
    ctx.fillText(S.uniformProfile(sc) ? '整体投入度' : '霍兰德兴趣代码', P + headW + 18, y + 46);
    y += 46 + 46;

    /* --- 最佳匹配职业 --- */
    if (state.topCareer) {
      ctx.fillStyle = '#A78BFA';
      ctx.font = '400 18px ' + F;
      ctx.fillText('最佳匹配职业', P, y);
      y += 46;

      ctx.fillStyle = '#F5F5F7';
      ctx.font = '700 46px ' + F;
      ctx.fillText(state.topCareer.name, P, y + 32);
      var nameW = ctx.measureText(state.topCareer.name).width;
      ctx.fillStyle = '#34D399';
      ctx.font = '600 26px ' + F;
      ctx.fillText(state.matches[0].fit + '%', P + nameW + 20, y + 32);
      y += 32 + 36;

      ctx.fillStyle = '#A1A1AA';
      ctx.font = '400 20px ' + F;
      y = wrapText(ctx, (state.topCareer.category || '') + ' · ' + (state.topCareer.desc || ''),
                   P, y, W - P * 2, 32, 2);
      y += 10;
    }

    /* --- 雷达图：块高由 drawRadar 的返回值决定，不再手填 --- */
    y += 14;
    y = drawRadar(ctx, sc.pct, W / 2, y, 128);
    y += 6;

    /* --- 可能也适合：Top2 / Top3 ---
     * 这里原来是六条维度条，和上面的雷达图是同一份数据，在分享图上纯属重复；
     * 换成备选职业，信息量更大，也不跟雷达图打架。 */
    var alts = state.matches.slice(1, 3);
    if (alts.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(P, y);
      ctx.lineTo(W - P, y);
      ctx.lineWidth = 1;
      ctx.stroke();
      y += 44;

      ctx.fillStyle = '#A78BFA';
      ctx.font = '400 18px ' + F;
      ctx.fillText('可能也适合', P, y);
      y += 42;

      alts.forEach(function (m) {
        ctx.fillStyle = '#F5F5F7';
        ctx.font = '600 25px ' + F;
        ctx.fillText(m.career.name, P, y);
        var aw = ctx.measureText(m.career.name).width;
        if (m.career.category) {
          ctx.fillStyle = '#6E6E78';
          ctx.font = '400 18px ' + F;
          ctx.fillText(m.career.category, P + aw + 14, y);
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = '#22D3EE';
        ctx.font = '700 25px ' + F;
        ctx.fillText(m.fit + '%', W - P, y);
        ctx.textAlign = 'left';
        y += 22;

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(P, y);
        ctx.lineTo(W - P, y);
        ctx.lineWidth = 1;
        ctx.stroke();
        y += 34;
      });
    }

    /* --- 二维码：扫一下直达首页。
     * 文案不提品牌名 —— 上面品牌行已经出现过一次，海报上反复念名字很啰嗦。
     * 现在没有白色底板，码直接落在深色背景上，所以四周必须留出干净的背景：
     * 静默区要求 4 个模块（约 24px）之内不能有任何文字或线条，上下各留 32px。 */
    y += 32;
    /* 300px 的框 → 格子 7px。再小圆点在缩略图上就糊成小方块了，
     * 圆润的观感出不来，扫码余量也更小。 */
    var QR = 300;
    var qrRect = drawQR(ctx, qrUrl(), P, y, QR);
    var tx = P + QR + 44;
    ctx.fillStyle = '#F5F5F7';
    ctx.font = '700 33px ' + F;
    ctx.fillText('看看你是哪种职业人', tx, y + 96);
    ctx.fillStyle = '#A1A1AA';
    ctx.font = '400 21px ' + F;
    ctx.fillText('扫码或长按识别都行', tx, y + 140);
    y += QR + 32;

    /* --- 底部：只留品牌语，不再重复品牌名 --- */
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(P, y);
    ctx.lineTo(W - P, y);
    ctx.lineWidth = 1;
    ctx.stroke();
    y += 42;

    ctx.fillStyle = '#A78BFA';
    ctx.font = '400 21px ' + F;
    ctx.fillText(CFG.POSTER_BRAND_LINE.replace(/^[^·]*·\s*/, ''), P, y);
    y += 32;

    ctx.fillStyle = '#4B4B55';
    ctx.font = '400 16px ' + F;
    ctx.fillText(CFG.DISCLAIMER, P, y);
    y += 26;

    /* --- 按实际用量裁掉下面的空白，避免海报底下一大块空的 --- */
    var H = Math.min(cv.height, Math.round(y + P));
    var out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    out.getContext('2d').drawImage(cv, 0, 0, W, H, 0, 0, W, H);
    /* 把二维码的落点挂在 canvas 上。反相 + 无底板之后，「扫纯白像素找底板」
     * 那套定位办法就失效了，自检脚本靠这个元信息才能精确地逐格比对。
     * 只是随画布带出的一段布局信息，不影响任何显示或保存逻辑。 */
    out.__qrRect = qrRect;
    return out;
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

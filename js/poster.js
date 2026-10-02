/* ============================================================
 * 长留玉 · 结果海报渲染器（公共模块）
 * ------------------------------------------------------------
 * 两个测试共用：职业测试画六轴雷达，天赋测试画八轴，其余骨架一样。
 * 调用方不碰任何画布细节，只交一份**内容描述**（spec），见底部 render()。
 *
 * 为什么单独抽出来：这段有五百多行，其中二维码和雷达图的几何都踩过坑
 * （圆角定位图形会啃掉角上模块的中心、雷达底部轴标签会被下一块压住……），
 * 复制一份到第二个测试里，等于把踩过的坑再埋一遍。
 *
 * 硬约束（改之前先读）：
 *   · 海报里**不放任何 <img>** —— 跨域图片会污染画布，toBlob 直接抛错；
 *   · 品牌标识用几何重绘（logoCanvas），不是图片；
 *   · 二维码是反相 + 圆润风格，极性、对比度、静默区、定位图形的
 *     1:1:3:1:1 比例四条都不能动，tools/verify-poster.js 有断言盯着。
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
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
  function drawRadar(ctx, spec, cx, topY, R) {
    var keys = spec.keys, n = keys.length;
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
      var ratio = clamp(spec.pct[keys[j]] || 0, 0, 100) / 100;
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
      ctx.fillText(spec.nameOf(keys[k]), lp[0], nameY);
      var valY = nameY + LINE;
      ctx.fillStyle = '#F5F5F7';
      ctx.font = '700 23px ' + POSTER_FONT;
      ctx.fillText(String(spec.pct[keys[k]] || 0), lp[0], valY);
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
  /** 画一张结果海报。
   *  调用方只交一份**内容描述**（spec），画布细节全部在这里。
   *
   *  spec = {
   *    subtitle   顶部小字，一般是「测试名 · 版本」        （可省）
   *    head       大字：霍兰德代码 / 天赋组合 / 投入等级   （可省）
   *    headLabel  大字右边的小标签                          （可省）
   *    lead       主结果块 { label, name, badge, desc }     （可省）
   *    radar      雷达图   { keys, pct, nameOf, R }         （可省）
   *    sections  通用区块，任意多个：
   *                { label, rows: [{ name, meta, value }] }
   *                meta 会跟在 name 后面用灰色小字显示，可省
   *    qr         二维码   { url, title, sub }
   *    footerLine 页脚品牌语
   *    disclaimer 免责声明
   *  }
   *
   *  返回的 canvas 上挂了 __qrRect（二维码落点），供自检脚本逐格比对 ——
   *  反相且无白色底板之后，「扫纯白像素找底板」那套定位办法已经失效。
   *  那只是一段随画布带出的布局信息，不影响任何显示或保存逻辑。 */
  function render(spec) {
    spec = spec || {};
    var W = 840, P = 56;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 2600;                       // 先给足，画完按实际用量裁
    var ctx = cv.getContext('2d');
    var F = POSTER_FONT;

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
    if (spec.subtitle) {
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '400 21px ' + F;
      ctx.fillText(spec.subtitle, P, y);
      y += 54;
    }

    /* --- 大字：正常是代码/组合，持平时是整体水平的档位名 --- */
    if (spec.head) {
      ctx.fillStyle = '#A78BFA';
      ctx.font = '800 62px ' + F;
      ctx.fillText(spec.head, P, y + 46);
      if (spec.headLabel) {
        var headW = ctx.measureText(spec.head).width;
        ctx.fillStyle = '#6E6E78';
        ctx.font = '400 18px ' + F;
        ctx.fillText(spec.headLabel, P + headW + 18, y + 46);
      }
      y += 46 + 46;
    }

    /* --- 主结果块 --- */
    if (spec.lead) {
      var ld = spec.lead;
      ctx.fillStyle = '#A78BFA';
      ctx.font = '400 18px ' + F;
      ctx.fillText(ld.label || '', P, y);
      y += 46;

      ctx.fillStyle = '#F5F5F7';
      ctx.font = '700 46px ' + F;
      ctx.fillText(ld.name || '', P, y + 32);
      if (ld.badge) {
        var nameW = ctx.measureText(ld.name || '').width;
        ctx.fillStyle = '#34D399';
        ctx.font = '600 26px ' + F;
        ctx.fillText(ld.badge, P + nameW + 20, y + 32);
      }
      y += 32 + 36;

      if (ld.desc) {
        ctx.fillStyle = '#A1A1AA';
        ctx.font = '400 20px ' + F;
        y = wrapText(ctx, ld.desc, P, y, W - P * 2, 32, 2);
        y += 10;
      }
    }

    /* --- 雷达图：块高由 drawRadar 的返回值决定，不再手填 --- */
    if (spec.radar) {
      y += 14;
      y = drawRadar(ctx, spec.radar, W / 2, y, spec.radar.R || 128);
      y += 6;
    }

    /* --- 通用区块：一行一条的列表 ---
     * 职业测试拿来放「可能也适合」的备选职业；天赋测试放「和你最像的名人」。
     * 区块前面拉一条分隔线，纵向位置靠 y 自然堆叠，不需要各自算高度。 */
    (spec.sections || []).forEach(function (sec) {
      var rows = (sec && sec.rows) || [];
      if (!rows.length) return;

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(P, y);
      ctx.lineTo(W - P, y);
      ctx.lineWidth = 1;
      ctx.stroke();
      y += 44;

      ctx.fillStyle = '#A78BFA';
      ctx.font = '400 18px ' + F;
      ctx.fillText(sec.label || '', P, y);
      y += 42;

      rows.forEach(function (row) {
        ctx.fillStyle = '#F5F5F7';
        ctx.font = '600 25px ' + F;
        ctx.fillText(row.name || '', P, y);
        var rw = ctx.measureText(row.name || '').width;
        if (row.meta) {
          ctx.fillStyle = '#6E6E78';
          ctx.font = '400 18px ' + F;
          ctx.fillText(row.meta, P + rw + 14, y);
        }
        if (row.value) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#22D3EE';
          ctx.font = '700 25px ' + F;
          ctx.fillText(row.value, W - P, y);
          ctx.textAlign = 'left';
        }
        y += 22;

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(P, y);
        ctx.lineTo(W - P, y);
        ctx.lineWidth = 1;
        ctx.stroke();
        y += 34;
      });
    });

    /* --- 二维码：扫一下直达首页。
     * 文案不提品牌名 —— 上面品牌行已经出现过一次，海报上反复念名字很啰嗦。
     * 现在没有白色底板，码直接落在深色背景上，所以四周必须留出干净的背景：
     * 静默区要求 4 个模块（约 24px）之内不能有任何文字或线条，上下各留 32px。 */
    var qrRect = null;
    if (spec.qr && spec.qr.url) {
      y += 32;
      /* 300px 的框 → 格子 7px。再小圆点在缩略图上就糊成小方块了，
       * 圆润的观感出不来，扫码余量也更小。 */
      var QR = 300;
      qrRect = drawQR(ctx, spec.qr.url, P, y, QR);
      var tx = P + QR + 44;
      ctx.fillStyle = '#F5F5F7';
      ctx.font = '700 33px ' + F;
      ctx.fillText(spec.qr.title || '', tx, y + 96);
      if (spec.qr.sub) {
        ctx.fillStyle = '#A1A1AA';
        ctx.font = '400 21px ' + F;
        ctx.fillText(spec.qr.sub, tx, y + 140);
      }
      y += QR + 32;
    }

    /* --- 底部：只留品牌语，不再重复品牌名 --- */
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(P, y);
    ctx.lineTo(W - P, y);
    ctx.lineWidth = 1;
    ctx.stroke();
    y += 42;

    if (spec.footerLine) {
      ctx.fillStyle = '#A78BFA';
      ctx.font = '400 21px ' + F;
      ctx.fillText(spec.footerLine, P, y);
      y += 32;
    }

    if (spec.disclaimer) {
      ctx.fillStyle = '#4B4B55';
      ctx.font = '400 16px ' + F;
      ctx.fillText(spec.disclaimer, P, y);
      y += 26;
    }

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
  /* ------------------------------------------------------------
   * 对外入口：只暴露这一个方法
   * ---------------------------------------------------------- */
  window.CLJ_POSTER = {
    render: render,
    qrUrl: qrUrl,
    roundRect: roundRect,
    wrapText: wrapText,
    logoCanvas: logoCanvas
  };
})();

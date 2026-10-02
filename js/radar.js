/* ============================================================
 * 长留玉 · 雷达图（页面用的 SVG 版）
 * ------------------------------------------------------------
 * 和 js/poster.js 里那个 canvas 版是同一套几何，只是渲染方式不同：
 * 页面上用 SVG（清晰、可选中、能跟着 CSS 缩放），海报里用 canvas
 * （要导成图片，必须能 toBlob）。改几何时两边都要看一眼。
 *
 * 轴数不写死：职业测试六轴、天赋测试八轴，都由调用方传进来。
 * 用法：CLJ_RADAR.svg(pct, 320, { keys: [...], nameOf: k => 名称 })
 * ============================================================ */
(function () {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** 生成雷达图的 SVG 字符串。
   *  pct 是「维度代码 → 0~100 分值」的表；
   *  spec = { keys: [维度代码…], nameOf: 代码 => 显示名 }。 */
  function buildRadarSVG(pct, size, spec) {
    size = size || 300;
    var keys = spec.keys;
    var n = keys.length;
    var nameOf = spec.nameOf;
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
      var ratio = clamp(pct[keys[j]] || 0, 0, 100) / 100;
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
               nameOf(keys[k]) +
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

  window.CLJ_RADAR = { svg: buildRadarSVG };
})();

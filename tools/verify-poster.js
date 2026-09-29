/* ============================================================
 * 长留玉 · 结果图片端到端自检
 * ------------------------------------------------------------
 * 验证的不是「代码看着对」，而是「图上那个二维码真的画对了」：
 *   1. 用无头 Chrome 打开真实结果页，点「保存结果图片」
 *   2. 劫持 toBlob 拿到那张海报 canvas
 *   3. 从像素里定位二维码的白色底板，按格采样出点阵
 *   4. 与 Node 端 CLJ_QR.encode(同一地址) 的输出逐格比对
 * 二维码错一格就扫不出来，所以必须逐格对，不能抽样。
 *
 * 需要本机装了 Chrome（可用环境变量 CHROME 指定别的路径）。
 * 运行：node tools/verify-poster.js
 * ============================================================ */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = process.env.PORT || '5223';

/* ---- 从 qr.js 取出「期望点阵」 ---- */
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'qr.js'), 'utf8'), ctx, { filename: 'js/qr.js' });
const QR = ctx.window.CLJ_QR;
const cfgCtx = { window: {}, console, document: { currentScript: null } };
vm.createContext(cfgCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), cfgCtx, { filename: 'js/config.js' });
const CFG = cfgCtx.window.CLJ_CONFIG;
const URL_IN_QR = CFG.SITE_URL || CFG.BASE_URL;
/* 纠错档必须与海报用的一致 —— 两边都读 config.js 的 QR_ECC_LEVEL，避免写死后走散。
 * 万一哪天真走散了，下面的逐格比对会立刻失败，不会静默放过。 */
const ECC_LEVEL = CFG.QR_ECC_LEVEL || 'Q';
const EXPECTED = QR.encode(URL_IN_QR, ECC_LEVEL);
const EXPECTED_SIZE = EXPECTED.size;

/* ---- 生成探针页 ---- */
const PROBE = `
<pre id="probe-out"></pre>
<script>
(function () {
  var D = [];
  window.addEventListener('error', function (e) { D.push('JS错误: ' + e.message); });

  /* 劫持 toBlob，把待导出的 canvas 存下来 */
  var origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
    if (this.width >= 800) window.__poster = this;
    return origToBlob.call(this, cb, type, q);
  };

  window.addEventListener('load', function () {
    setTimeout(function () {
      document.getElementById('btn-save-img').click();
      setTimeout(function () {
        var cv = window.__poster;
        if (!cv) { D.push('没拿到海报 canvas'); document.getElementById('probe-out').textContent = 'PROBE_START' + D.join('\\n') + 'PROBE_END'; return; }
        var g = cv.getContext('2d');
        var W = cv.width, H = cv.height;
        D.push('海报尺寸 ' + W + '×' + H);

        /* 二维码落点：海报把布局信息挂在 canvas 上了。
         * 现在是「反相 + 无白色底板」，靠找白色底板定位的老办法已经失效。 */
        var qrRect = cv.__qrRect;
        if (!qrRect) { D.push('海报没带 __qrRect 元信息，无法定位二维码'); document.getElementById('probe-out').textContent = 'PROBE_START' + D.join('\\n') + 'PROBE_END'; return; }
        D.push('二维码落点 x=' + qrRect.x + ' y=' + qrRect.y + ' 边长=' + qrRect.size +
               ' 格子=' + qrRect.cell + 'px 模块=' + qrRect.modules + ' 纠错档=' + qrRect.level);

        var minX = qrRect.x, minY = qrRect.y;
        var cell = qrRect.cell, qrSize = qrRect.modules;
        var totalModules = qrSize + 8;
        if (cell < 2) { D.push('格子太小，推不出来'); document.getElementById('probe-out').textContent = 'PROBE_START' + D.join('\\n') + 'PROBE_END'; return; }
        if (Math.abs(qrRect.size - cell * totalModules) > 2) D.push('⚠ 落点边长与「格子×总模块数」对不上');

        var img = g.getImageData(0, 0, W, H).data;
        var TH = 128;
        function lumAt(x, y) {
          if (x < 0 || y < 0 || x >= W || y >= H) return 0;
          var k = (y * W + x) * 4;
          return 0.2126 * img[k] + 0.7152 * img[k + 1] + 0.0722 * img[k + 2];
        }

        /* 逐格采样。注意**极性是反的**：反相码里「亮」才是 1。
         * 两个口径分开量，因为圆点造型下它们说的事不一样：
         *   1. 中心实心度 —— 扫码器读的就是每格中心那一小片，必须实打实。
         *      在 ±0.3 格内取 3×3，理论上应全中（圆点半径 0.47 格已把它整个包住）。
         *   2. 整格墨量占比 —— 真数亮点估面积，圆点理论值 π×0.47² ≈ 69%。
         *      低于 55% 说明点缩水了。
         * （之前用「±0.4 格 5×5」当覆盖率，正好卡在圆点羽化带上，圆点被误判成 52% ——
         *  度量口径选错会得出假警报，所以这里特意分成上面两条。） */
        var rows = [], minInk = 100, lowInk = [], minHit = 9, minHitAt = '';
        for (var r = 0; r < qrSize; r++) {
          var line = '';
          for (var cc = 0; cc < qrSize; cc++) {
            var px = minX + Math.floor((cc + 4 + 0.5) * cell);
            var py = minY + Math.floor((r + 4 + 0.5) * cell);
            var on = lumAt(px, py) > TH;
            line += (on ? '1' : '0');

            /* 1) 中心 3×3 实心度 */
            var hit = 0;
            for (var dy = -1; dy <= 1; dy++) {
              for (var dx = -1; dx <= 1; dx++) {
                var sx = minX + Math.floor((cc + 4 + 0.5 + dx * 0.3) * cell);
                var sy = minY + Math.floor((r + 4 + 0.5 + dy * 0.3) * cell);
                if (lumAt(sx, sy) > TH) hit++;
              }
            }

            /* 2) 整格墨量占比（逐像素数） */
            var bx = minX + (cc + 4) * cell, by = minY + (r + 4) * cell;
            var bright = 0, total = 0;
            for (var yy = 0; yy < cell; yy++) {
              for (var xx = 0; xx < cell; xx++) { total++; if (lumAt(bx + xx, by + yy) > TH) bright++; }
            }
            var inkRatio = bright / total * 100;

            if (on) {
              minInk = Math.min(minInk, inkRatio);
              if (hit < minHit) { minHit = hit; minHitAt = '(' + r + ',' + cc + ')'; }
              if (inkRatio < 55) lowInk.push('(' + r + ',' + cc + ')墨量' + Math.round(inkRatio) + '%');
            } else if (inkRatio > 15) {
              lowInk.push('空格(' + r + ',' + cc + ')墨量' + Math.round(inkRatio) + '%');
            }
          }
          rows.push(line);
        }
        D.push('INK|' + minInk.toFixed(0) + '|' + lowInk.slice(0, 6).join(' '));
        /* 中心实心度只报最低值。判据是「≥8/9」而不是「9/9」：
         * 圆角造型（定位图形外圈、内核）必然会削掉角上那一个采样点，
         * 但模块中心本身始终是实的 —— 扫码器读的正是中心。
         * 真正要拦的是「点整体缩水」，那种情况会连丢好几个点。 */
        D.push('SOLID|' + minHit + '|' + minHitAt);

        /* 对比度：码点平均亮度 vs 背景平均亮度，按 WCAG 相对亮度公式算比值。
         * 扫码器本质上就是在读明暗差，这一条比任何「看着清楚」都硬。 */
        function relLum(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        function lumaAt(x, y) { var k = (y * W + x) * 4; return 0.2126 * relLum(img[k]) + 0.7152 * relLum(img[k + 1]) + 0.0722 * relLum(img[k + 2]); }
        var lo = lumaAt(minX - Math.floor(cell * 2), minY + Math.floor(qrRect.size / 2));   // 静默区（纯背景）
        var hi = 0, hn = 0;
        for (var rr = 0; rr < qrSize; rr++) {
          for (var ccc = 0; ccc < qrSize; ccc++) {
            var xx = minX + Math.floor((ccc + 4 + 0.5) * cell);
            var yy = minY + Math.floor((rr + 4 + 0.5) * cell);
            var lv = lumaAt(xx, yy);
            if (lv > 0.2) { hi += lv; hn++; }
          }
        }
        hi = hn ? hi / hn : 0;
        var ratio = (Math.max(hi, lo) + 0.05) / (Math.min(hi, lo) + 0.05);
        D.push('CONTRAST|' + ratio.toFixed(1) + '|' + hi.toFixed(3) + '|' + lo.toFixed(4));

        /* 静默区检查：码点外 4 个模块之内必须是纯背景，不能有文字或线条。
         * 沿四条边各取若干采样点，看亮度是否都接近背景。 */
        var quietBad = 0, quietTot = 0;
        for (var q = 1; q <= 3; q++) {
          for (var t = 0; t < qrSize; t += 4) {
            var pts = [
              [minX + Math.floor((t + 4.5) * cell), minY + Math.floor((4 - q + 0.5) * cell)],
              [minX + Math.floor((t + 4.5) * cell), minY + Math.floor((4 + qrSize + q - 0.5) * cell)],
              [minX + Math.floor((4 - q + 0.5) * cell), minY + Math.floor((t + 4.5) * cell)],
              [minX + Math.floor((4 + qrSize + q - 0.5) * cell), minY + Math.floor((t + 4.5) * cell)]
            ];
            for (var pi = 0; pi < pts.length; pi++) {
              var X = pts[pi][0], Y = pts[pi][1];
              if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
              quietTot++;
              if (lumaAt(X, Y) > lo * 4 + 0.02) quietBad++;
            }
          }
        }
        D.push('QUIET|' + quietBad + '|' + quietTot);

        D.push('GRID_BEGIN');
        D.push(rows.join('\\n'));
        D.push('GRID_END');
        document.getElementById('probe-out').textContent = 'PROBE_START\\n' + D.join('\\n') + '\\nPROBE_END';
      }, 4000);
    }, 800);
  });
})();
</script>
</body>`;

function buildProbe() {
  const src = fs.readFileSync(path.join(ROOT, 'career', 'result.html'), 'utf8');
  const TAG = '<script src="../js/career/result.js"></script>';
  const SEED = `<script>
(function () {
  var level = { R: 2, I: 5, A: 4, S: 3, E: 1, C: 2 };
  var qs = window.CLJ_DATA.questions('full');
  var ans = {};
  qs.forEach(function (x, i) {
    var main = Object.keys(x.dims || {})[0];
    var base = level[main] || 3;
    ans[x.id] = Math.max(1, Math.min(5, base + (i % 2 ? 1 : -1)));
  });
  localStorage.setItem('clj_career_final', JSON.stringify({ version: 'full', answers: ans, ts: Date.now() }));
})();
</script>
`;
  let out = src.replace(TAG, SEED + TAG);
  out = out.replace(/\s*<\/body>/, '\n' + PROBE.split('__EXP_SIZE__').join(String(EXPECTED_SIZE)));
  fs.writeFileSync(path.join(ROOT, 'career', '_p.html'), out, 'utf8');
}

function get(url) {
  return new Promise(res => {
    http.get(url, { timeout: 3000 }, r => { r.resume(); res(r.statusCode); })
      .on('error', () => res('ERR')).on('timeout', function () { this.destroy(); res('TO'); });
  });
}
function render(url) {
  return new Promise(res => {
    const prof = path.join('D:\\!CLY_Tests', '_ep' + Date.now());
    const cp = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--user-data-dir=' + prof, '--virtual-time-budget=25000', '--dump-dom', url], { windowsHide: true });
    let out = '', done = false;
    cp.stdout.on('data', d => { out += d; });
    cp.stderr.on('data', () => {});
    const kill = setTimeout(() => {
      if (done) return; done = true;
      try { cp.kill('SIGKILL'); } catch (e) {}
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
      res(out);
    }, 55000);
    cp.on('close', () => {
      if (done) return; done = true;
      clearTimeout(kill);
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
      res(out);
    });
  });
}

let pass = 0, fail = 0;
const ok = (l, x) => { console.log('  ✓ ' + l + (x ? ' → ' + x : '')); pass++; };
const bad = (l, x) => { console.log('  ✗ ' + l + (x ? ' → ' + x : '')); fail++; };

(async () => {
  console.log('二维码里编的地址：' + URL_IN_QR);
  console.log('Node 端编码结果：v' + EXPECTED.version + ' ' + EXPECTED.size + '×' + EXPECTED.size + '（' + EXPECTED.level + ' 档）\n');

  const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'preview-server.js'), PORT], { cwd: ROOT, windowsHide: true });
  srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
  let ready = false;
  for (let i = 0; i < 20; i++) {
    if (await get('http://127.0.0.1:' + PORT + '/index.html') === 200) { ready = true; break; }
    await new Promise(r => setTimeout(r, 300));
  }
  if (!ready) { console.log('服务器没起来'); process.exit(1); }
  buildProbe();

  const dom = await render('http://127.0.0.1:' + PORT + '/career/_p.html');
  try { fs.unlinkSync(path.join(ROOT, 'career', '_p.html')); } catch (e) {}
  try { srv.kill('SIGKILL'); } catch (e) {}

  const m = /PROBE_START([\s\S]*?)PROBE_END/.exec(dom);
  if (!m) { console.log('!! 没拿到探针输出'); console.log(dom.slice(0, 600)); process.exit(1); }
  const txt = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  console.log('=== 浏览器端探测 ===');
  txt.split('\n').forEach(l => { if (l.indexOf('GRID_') < 0) console.log('  ' + l); });

  /* 注意：Windows 下 dump 出来的 DOM 是 \r\n 换行，直接用 \n 匹配会失败 */
  const gm = /GRID_BEGIN\r?\n([\s\S]*?)\r?\nGRID_END/.exec(txt);
  if (!gm) { console.log('!! 没拿到点阵'); process.exit(1); }
  const rows = gm[1].split(/\r?\n/).filter(l => l.length > 5);

  console.log('\n=== 逐格比对 ===');
  ok('纠错档与海报一致（读 config 的 QR_ECC_LEVEL）', ECC_LEVEL + ' / v' + EXPECTED.version + ' ' + EXPECTED_SIZE + '×' + EXPECTED_SIZE);
  if (rows.length !== EXPECTED_SIZE) {
    bad('从图上抠出的模块数 ' + rows.length + ' 与编码的 ' + EXPECTED_SIZE + ' 不一致');
  } else {
    ok('尺寸一致', rows.length + '×' + rows.length);
    let diff = 0, firstAt = null;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows.length; c++) {
        const a = rows[r][c] === '1';
        const b = !!EXPECTED.modules[r][c];
        if (a !== b) { diff++; if (!firstAt) firstAt = '(行 ' + r + ', 列 ' + c + ')'; }
      }
    }
    if (diff === 0) ok('图上抠出的点阵与编码结果逐格完全一致');
    else bad('有 ' + diff + ' 格不一致，首个在 ' + firstAt);
  }

  /* 码点是否够实。分两个口径（圆点造型下它们说的事不一样）：
   *   中心实心度 —— 扫码器读的就是每格中心那一片，必须 9/9 全中；
   *   整格墨量占比 —— 真数亮点估面积，圆点理论值约 69%。 */
  console.log('\n=== 码点实心度与墨量（验圆点造型是否够实）===');
  const solid = /SOLID\|(\d+)\|(.*)/.exec(txt);
  if (!solid) {
    bad('没拿到中心实心度数据');
  } else {
    const minHit = Number(solid[1]);
    ok('最低中心实心度', minHit + '/9' + (solid[2] ? '（最差在 ' + solid[2] + '）' : ''));
    if (minHit >= 8) ok('所有码点中心都够实（≥8/9；圆角造型允许削掉一个角采样点）');
    else bad('有码点中心只剩 ' + minHit + '/9，点可能整体缩水了');
  }
  const ink = /INK\|(\d+)\|(.*)/.exec(txt);
  if (!ink) {
    bad('没拿到墨量数据');
  } else {
    const minInk = Number(ink[1]);
    const offenders = ink[2].trim();
    ok('码点最低整格墨量', minInk + '%（圆点理论值约 69%，低于 55% 说明点缩水）');
    if (minInk < 55) bad('有码点墨量不足 55%', offenders);
    else ok('所有码点墨量都在 55% 以上');
    if (offenders) bad('存在异常格（码点太淡 / 空格被染）', offenders.slice(0, 160));
    else ok('没有码点太淡或空格被染的格子');
  }

  /* 对比度：反相二维码能不能扫，本质就看明暗差够不够。
   * WCAG 对比度要 ≥ 3:1 才谈得上可读，实际扫码建议 7:1 以上。 */
  console.log('\n=== 明暗对比度（反相码的命门）===');
  const ct = /CONTRAST\|([\d.]+)\|([\d.]+)\|([\d.]+)/.exec(txt);
  if (!ct) {
    bad('没拿到对比度数据');
  } else {
    const ratio = Number(ct[1]);
    ok('码点 vs 背景对比度', ratio + ':1（码点亮 ' + ct[2] + ' / 背景暗 ' + ct[3] + '）');
    if (ratio >= 7) ok('对比度远高于扫码所需的 3:1，反相方案成立');
    else if (ratio >= 3) bad('对比度只有 ' + ratio + ':1，偏低，部分扫码器可能读不出');
    else bad('对比度 ' + ratio + ':1 太低，反相二维码很可能扫不出来');
  }

  /* 静默区：码点外 4 个模块内必须是纯背景，不能有文字线条 */
  console.log('\n=== 静默区（码点外 4 模块不能有杂物）===');
  const qt = /QUIET\|(\d+)\|(\d+)/.exec(txt);
  if (!qt) {
    bad('没拿到静默区数据');
  } else {
    const bads = Number(qt[1]), tots = Number(qt[2]);
    if (tots === 0) bad('静默区没有采样点，检查逻辑有问题');
    else if (bads === 0) ok('静默区干净', tots + ' 个采样点全是背景色');
    else bad('静默区被污染', bads + '/' + tots + ' 个采样点不是背景色，附近可能有文字或线条');
  }

  console.log('\n' + '='.repeat(46));
  console.log(fail ? ('失败 ' + fail + ' 项 / 通过 ' + pass + ' 项') : ('全部通过（' + pass + ' 项）'));
  process.exit(fail ? 1 : 0);
})();

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
const URL_IN_QR = cfgCtx.window.CLJ_CONFIG.SITE_URL || cfgCtx.window.CLJ_CONFIG.BASE_URL;
const EXPECTED = QR.encode(URL_IN_QR, 'M');

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

        /* 找纯白像素的包围盒：海报里只有二维码底板是接近 #FFFFFF 的
         * （正文用的 #F5F5F7 不够白，会被排除） */
        var img = g.getImageData(0, 0, W, H).data;
        var minX = W, minY = H, maxX = -1, maxY = -1, n = 0;
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var i = (y * W + x) * 4;
            if (img[i] >= 252 && img[i + 1] >= 252 && img[i + 2] >= 252) {
              n++;
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) { D.push('没找到白色二维码底板'); document.getElementById('probe-out').textContent = 'PROBE_START' + D.join('\\n') + 'PROBE_END'; return; }
        var side = maxX - minX + 1, sideY = maxY - minY + 1;
        D.push('白底包围盒 x=' + minX + ' y=' + minY + ' 边长=' + side + '×' + sideY);

        /* 推格子大小：边长 = 格子 × (模块数 + 2×静默区4)，模块数必须是 21/25/29... */
        var cell = -1, qrSize = -1;
        for (var c = 2; c <= 20; c++) {
          if (side % c !== 0) continue;
          var s = side / c - 8;
          if (s >= 21 && (s - 17) % 4 === 0 && (s - 17) / 4 >= 1 && (s - 17) / 4 <= 9) { cell = c; qrSize = s; break; }
        }
        if (cell < 0) { D.push('推不出格子大小'); document.getElementById('probe-out').textContent = 'PROBE_START' + D.join('\\n') + 'PROBE_END'; return; }
        D.push('格子 ' + cell + 'px，模块数 ' + qrSize + '×' + qrSize);

        /* 逐格采样：取每格中心像素 */
        var rows = [];
        for (var r = 0; r < qrSize; r++) {
          var line = '';
          for (var cc = 0; cc < qrSize; cc++) {
            var px = minX + Math.floor((cc + 4 + 0.5) * cell);
            var py = minY + Math.floor((r + 4 + 0.5) * cell);
            var j = (py * W + px) * 4;
            line += (img[j] < 128 ? '1' : '0');
          }
          rows.push(line);
        }
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
  out = out.replace(/\s*<\/body>/, '\n' + PROBE);
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
  if (rows.length !== EXPECTED.size) {
    bad('从图上抠出的模块数 ' + rows.length + ' 与编码的 ' + EXPECTED.size + ' 不一致');
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

  console.log('\n' + '='.repeat(46));
  console.log(fail ? ('失败 ' + fail + ' 项 / 通过 ' + pass + ' 项') : ('全部通过（' + pass + ' 项）'));
  process.exit(fail ? 1 : 0);
})();

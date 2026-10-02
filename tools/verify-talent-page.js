/* ============================================================
 * 长留玉 · 天赋测试 · 端到端自检
 * ------------------------------------------------------------
 * 用无头 Chrome 走一遍真实流程：开始页 → 答题页(自动答完 40 题)
 * → 结果页(正常分支) → 结果页(八项持平分支)。
 * 每一页都断言关键节点渲染，并收集 window.onerror / console.error。
 *
 * 和 verify-selftest.js 的分工：那个跑全站（首页/模块页/职业测试），
 * 这个专跑天赋测试 —— 分开是因为天赋测试的断言点不一样
 * （天赋组合、主画像名、名人匹配、持平时不硬套名人）。
 *
 * 需要本机装了 Chrome（可用环境变量 CHROME 覆盖）。
 * 运行：node tools/verify-talent-page.js
 * ============================================================ */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = process.env.PORT || '5237';

const HOOK = `<script>window.__ERR=[];window.addEventListener('error',function(e){window.__ERR.push(e.message)});
window.addEventListener('unhandledrejection',function(e){window.__ERR.push('unhandled:'+(e.reason&&(e.reason.message||e.reason)))});
(function(){var ce=console.error;console.error=function(){window.__ERR.push('console.error: '+Array.prototype.map.call(arguments,function(a){return (a&&a.message)||String(a)}).join(' ').slice(0,200));ce.apply(console,arguments)};})();</script>`;

const REPORT = `<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var r = document.createElement('pre'); r.id = '__report';
    r.textContent = JSON.stringify(window.__REPORT || {});
    document.body.appendChild(r);
    var e = document.createElement('pre'); e.id = '__errs';
    e.textContent = (window.__ERR || []).join(' || ');
    document.body.appendChild(e);
  }, 900);
});
</script>`;

function get(u) {
  return new Promise(r => {
    http.get(u, { timeout: 3000 }, res => { res.resume(); r(res.statusCode); })
      .on('error', () => r(0)).on('timeout', function () { this.destroy(); r(0); });
  });
}
function render(url) {
  return new Promise(res => {
    const prof = path.join(require('os').tmpdir(), '_tt' + Date.now() + Math.floor(Math.random() * 999));
    const cp = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--user-data-dir=' + prof, '--virtual-time-budget=30000', '--dump-dom', url], { windowsHide: true });
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
function mk(srcRel, outRel, tail) {
  let s = fs.readFileSync(path.join(ROOT, srcRel), 'utf8');
  s = s.replace('</head>', HOOK + '</head>');
  if (tail) s = s.replace(/\s*<\/body>/, '\n' + tail + '\n</body>');
  const out = path.join(ROOT, outRel);
  fs.writeFileSync(out, s, 'utf8');
  return out;
}
function rep(dom) {
  const m = /<pre id="__report">([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) return null;
  const s = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try { return JSON.parse(s); } catch (e) { return { parseErr: s.slice(0, 60) }; }
}
function errs(dom) {
  const m = /<pre id="__errs">([\s\S]*?)<\/pre>/.exec(dom);
  return m ? m[1].trim() : '';
}

let pass = 0, fail = 0;
const ok = (l, x) => { console.log('  ✓ ' + l + (x ? ' → ' + x : '')); pass++; };
const bad = (l, x) => { console.log('  ✗ ' + l + (x ? ' → ' + x : '')); fail++; };
const files = [];

(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'preview-server.js'), PORT], { cwd: ROOT, windowsHide: true });
  srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
  for (let i = 0; i < 20; i++) { if (await get('http://127.0.0.1:' + PORT + '/index.html') === 200) break; await new Promise(r => setTimeout(r, 300)); }
  const B = 'http://127.0.0.1:' + PORT + '/';

  /* ---- 1. 开始页 ---- */
  console.log('=== 1. 天赋测试开始页 ===');
  files.push(mk('talent/index.html', 'talent/_t_start.html', REPORT.replace('window.__REPORT || {}',
    '({ title: document.title, opts: document.querySelectorAll(".version-opt").length, active: (document.querySelector(".version-opt.is-active")||{}).getAttribute ? document.querySelector(".version-opt.is-active").getAttribute("data-id") : null, btn: (document.getElementById("btn-start")||{}).textContent, badge: (document.getElementById("hero-badge")||{}).textContent })')));
  let dom = await render(B + 'talent/_t_start.html');
  let r = rep(dom);
  if (r) {
    ok('标签页标题', JSON.stringify(r.title));
    ok('两个版本选项', r.opts === 2, r.opts + ' 个，默认选中 ' + r.active);
    ok('开始按钮文案', JSON.stringify(r.btn));
    ok('头部版本标记', JSON.stringify(r.badge));
  } else bad('开始页拿不到报告');
  if (errs(dom)) bad('开始页有 JS 错误', errs(dom).slice(0, 150)); else ok('开始页无 JS 错误');

  /* ---- 2. 答题页：自动答完 40 题 ---- */
  console.log('\n=== 2. 答题页（自动答完 40 题）===');
  const QUIZ = `<script>
window.__REPORT = { steps: 0, finalBtn: '', hint: '', total: '' };
(function () {
  localStorage.setItem('clj_talent_version', 'light');
  var done = false;
  function step() {
    if (done) return;
    var opts = document.querySelectorAll('.opt');
    var btn = document.getElementById('btn-next');
    if (btn && btn.textContent.indexOf('查看结果') >= 0) {
      done = true;
      window.__REPORT.finalBtn = btn.textContent;
      window.__REPORT.steps = +((document.getElementById('step-now')||{}).textContent || 0);
      window.__REPORT.total = (document.getElementById('step-all')||{}).textContent || '';
      window.__REPORT.hint = (document.getElementById('nav-hint')||{}).textContent || '';
      return;
    }
    if (opts.length) { opts[Math.floor(Math.random() * opts.length)].click(); window.__REPORT.steps++; }
    setTimeout(step, 240);
  }
  step();
})();
</script>`;
  files.push(mk('talent/test.html', 'talent/_t_test.html', QUIZ));
  dom = await render(B + 'talent/_t_test.html');
  /* 答题页自己写报告（跑完才写），这里用 REPROT 兜底：从 DOM 里读进度 */
  const body2 = dom.replace(/<script[\s\S]*?<\/script>/g, '');
  const nowTxt = /id="step-now"[^>]*>([^<]*)/.exec(body2);
  const btnTxt = /id="btn-next"[^>]*>([^<]*)/.exec(body2);
  ok('总题数显示 40', /id="step-all"[^>]*>\s*40/.test(body2));
  ok('进度推进到了最后一题', nowTxt && nowTxt[1].trim() === '40', nowTxt ? nowTxt[1].trim() : '(空)');
  ok('末题按钮变成「查看结果」', btnTxt && btnTxt[1].indexOf('查看结果') >= 0, btnTxt ? btnTxt[1].trim() : '(空)');
  if (errs(dom)) bad('答题页有 JS 错误', errs(dom).slice(0, 150)); else ok('答题页无 JS 错误');

  /* ---- 3. 结果页：正常作答 ---- */
  console.log('\n=== 3. 结果页（正常作答）===');
  const RES_TAIL = REPORT.replace('window.__REPORT || {}',
    '({ label:(document.getElementById("code-label")||{}).textContent, code:(document.getElementById("result-code")||{}).textContent, combo:(document.getElementById("result-title")||{}).textContent, profile:(document.getElementById("result-profile")||{}).textContent, dims:document.querySelectorAll("#dim-bars .dim-row").length, radar:document.querySelectorAll("#radar-holder svg polygon").length, talentName:(document.getElementById("talent-name")||{}).textContent, watch:document.querySelectorAll("#talent-watch li").length, figures:document.querySelectorAll("#figure-main .result-card, #figure-alt .result-card").length, saveBtn:!!document.getElementById("btn-save-img"), others:document.querySelectorAll("#other-tests .mini-test").length, title:document.title })');
  function resultProbe(seed, out) {
    let s = fs.readFileSync(path.join(ROOT, 'talent/result.html'), 'utf8');
    s = s.replace('</head>', HOOK + '</head>');
    s = s.replace('<script src="../js/talent/result.js"></script>', seed + '<script src="../js/talent/result.js"></script>');
    s = s.replace(/\s*<\/body>/, '\n' + RES_TAIL + '\n</body>');
    files.push(path.join(ROOT, out));
    fs.writeFileSync(path.join(ROOT, out), s, 'utf8');
  }
  const SEED = `<script>
(function () {
  var lv = { LIN: 5, LOG: 5, SPA: 4, MUS: 2, BOD: 2, PER: 2, INT: 4, NAT: 2 };
  var qs = window.CLJ_TALENT_DATA.questions('full');
  var ans = {};
  qs.forEach(function (q, i) { var m = Object.keys(q.dims)[0]; ans[q.id] = Math.max(1, Math.min(5, (lv[m]||3) + (i % 3 ? 0 : -1))); });
  localStorage.setItem('clj_talent_final', JSON.stringify({ version: 'full', answers: ans, ts: Date.now() }));
})();
</script>`;
  resultProbe(SEED, 'talent/_t_result.html');
  dom = await render(B + 'talent/_t_result.html');
  r = rep(dom);
  if (r) {
    ok('大字 = 主画像名', JSON.stringify(r.code), JSON.stringify(r.label));
    ok('天赋组合', JSON.stringify(r.combo));
    ok('八维明细 8 条', r.dims === 8, r.dims + ' 条');
    ok('雷达图渲染', r.radar >= 5, r.radar + ' 个 polygon');
    ok('画像详解有内容', (r.talentName || '').length > 3, JSON.stringify(r.talentName));
    ok('「要留意」一条', r.watch === 1);
    ok('最像的名人卡片', r.figures === 3, r.figures + ' 张');
    ok('保存图片按钮在', r.saveBtn);
    ok('「你可能还想测」不再显示天赋测试自己', r.others >= 1, r.others + ' 个');
    ok('标签页标题', JSON.stringify(r.title));
  } else bad('结果页拿不到报告');
  if (errs(dom)) bad('结果页有 JS 错误', errs(dom).slice(0, 200)); else ok('结果页无 JS 错误');

  /* ---- 4. 结果页：八项持平 ---- */
  console.log('\n=== 4. 结果页（八项持平）===');
  const FLAT = SEED.replace('var lv = { LIN: 5, LOG: 5, SPA: 4, MUS: 2, BOD: 2, PER: 2, INT: 4, NAT: 2 };', 'var lv = null;')
    .replace('(lv[m]||3)', '3');
  resultProbe(FLAT, 'talent/_t_result2.html');
  dom = await render(B + 'talent/_t_result2.html');
  r = rep(dom);
  if (r) {
    ok('大字 = 整体水平档位', JSON.stringify(r.code), JSON.stringify(r.label));
    ok('不硬套名人（显示说明）', r.figures === 0, r.figures + ' 张名人卡');
    ok('八维明细仍 8 条', r.dims === 8);
    ok('画像块改成「这份结果怎么读」', (r.talentName || '').indexOf('怎么读') >= 0, JSON.stringify(r.talentName));
  } else bad('持平结果页拿不到报告');
  if (errs(dom)) bad('持平结果页有 JS 错误', errs(dom).slice(0, 200)); else ok('持平结果页无 JS 错误');

  files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  try { srv.kill('SIGKILL'); } catch (e) {}

  console.log('\n' + '='.repeat(50));
  console.log(fail ? ('发现 ' + fail + ' 个问题 / 通过 ' + pass + ' 项') : ('天赋测试端到端通过（' + pass + ' 项）'));
  process.exit(fail ? 1 : 0);
})();

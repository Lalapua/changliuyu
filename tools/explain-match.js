/* ============================================================
 * 长留玉 · 「维度 → 职业」双轴匹配算法追踪器
 * ------------------------------------------------------------
 * 把 matchCareers() 的每一步中间量原样打印：
 *   用户侧：归一化 → mU（能量轴）→ 中心化（形状轴）
 *   职业侧：w/5 归一化 → Js（形状轴）→ energy（能量轴）
 *   形状分 = (cos(Us, Js) + 1) / 2
 *   能量分 = 1 - |mU - mJ|
 *   score  = 0.7 × 形状分 + 0.3 × 能量分
 *   显示匹配度 = 60 + 35 × (score - min) / (max - min)
 *
 * ALGORITHM.md 里引用的所有数字都由这个脚本产出，改了算法就跑一遍，
 * 文档和实现不会走散。
 *
 * 运行：node tools/explain-match.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = { window: {}, console };
vm.createContext(ctx);

[
  'js/career/questions-light.js',
  'js/career/questions-full-part1.js',
  'js/career/questions-full-part2.js',
  'js/career/questions-full-part3.js',
  'js/career/questions-full-part4.js',
  'js/career/careers-part1.js',
  'js/career/careers-part2.js',
  'js/career/careers-part3.js',
  'js/career/careers-part4.js',
  'js/career/scoring.js',
  'js/career/data.js'
].forEach(function (rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
});

const W = ctx.window;
const DATA = W.CLJ_DATA;
const S = W.CLJ_SCORING;
W.CLJ = {
  hash: function (str) {
    var h = 2166136261; str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
};

const K = S.DIM_KEYS;
const f = (x, d) => Number(x).toFixed(d === undefined ? 3 : d);
const vec = a => '[' + a.map(x => f(x)).join(', ') + ']';
const pad6 = a => a.map(x => String(x).padStart(6)).join('');
const pad7 = a => a.map(x => String(x).padStart(7)).join('');
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const center = a => { const m = mean(a); return a.map(v => v - m); };
const unit = a => { const l = Math.sqrt(a.reduce((s, v) => s + v * v, 0)); return l < 1e-9 ? null : a.map(v => v / l); };
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const variance = a => { const m = mean(a); return a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length; };

const careers = DATA.careers();
const qs = DATA.questions('light');

/* ------------------------------------------------------------
 * 场景 A：只在「艺术型」的题上选 5，其余选 3（中性）
 * ---------------------------------------------------------- */
const ansA = {};
qs.forEach(function (q) {
  const dims = q.dims || {};
  ansA[q.id] = Object.keys(dims).some(k => k === 'A' && dims[k] >= 0.5) ? 5 : 3;
});
const scA = S.computeScores(qs, ansA);

console.log('=== 第一步：题目答案 → 六维分值（精简版 30 题）===');
console.log('维度      ' + pad6(K));
console.log('raw       ' + pad6(K.map(k => scA.raw[k])));
console.log('range     ' + pad6(K.map(k => scA.range[k])));
console.log('pct       ' + pad6(K.map(k => scA.pct[k])));
console.log('霍兰德代码：' + S.hollandCode(scA, 3));
K.forEach(function (k) {
  const raw = scA.raw[k], range = scA.range[k];
  if (range <= 0) return;
  console.log('  ' + k + ': pct = clamp(50 + 50 × ' + raw + '/' + range + ', 1, 99) = ' +
              f(50 + 50 * raw / range, 2) + ' → ' + scA.pct[k]);
});

/* ------------------------------------------------------------
 * 第二步：拆成两条轴
 * ---------------------------------------------------------- */
console.log('\n=== 第二步：用户向量拆成「形状轴 + 能量轴」===');
const userUnit = K.map(k => clamp(scA.pct[k] / 100, 0, 1));
const mU = mean(userUnit);
const cU = center(userUnit);
const varU = variance(userUnit);
const uU = unit(cU);
console.log('  归一化 U/100   ' + vec(userUnit));
console.log('  能量轴 mU      ' + f(mU, 4) + '   （六维归一化后的均值 = 整体投入度）');
console.log('  中心化 cU      ' + vec(cU));
console.log('  形状轴 û       ' + (uU ? vec(uU) : 'null（零向量，没有形状）'));
console.log('  六维方差       ' + f(varU, 5) + '   vs 阈值 FLAT_VAR = ' + S.FLAT_VAR +
            '  →  ' + (varU < S.FLAT_VAR ? '持平，形状分给中性 0.5' : '有形状，正常算'));

/* ------------------------------------------------------------
 * 逐个职业拆解
 * ---------------------------------------------------------- */
function detail(career, label) {
  const jUnit = K.map(k => clamp((career.w && career.w[k]) || 0, 0, 5) / 5);
  const mJ = career.energy;
  const cJ = center(jUnit);
  const uJ = unit(cJ);
  const shape = uU && uJ ? (dot(uU, uJ) + 1) / 2 : 0.5;
  const energy = clamp(1 - Math.abs(mU - mJ), 0, 1);
  const score = clamp(0.7 * shape + 0.3 * energy, 0, 1);

  console.log('\n--- ' + label + '：' + career.name + '（' + career.category + '）---');
  console.log('  维度            ' + pad7(K));
  console.log('  职业权重 w      ' + pad7(K.map(k => career.w[k])));
  console.log('  归一化 w/5      ' + vec(jUnit));
  console.log('  形状轴 Js（中心化）' + vec(cJ));
  console.log('  形状轴 ĵ        ' + (uJ ? vec(uJ) : 'null'));
  console.log('  逐项 û×ĵ        ' + pad7(uU && uJ ? uU.map((v, i) => f(v * uJ[i], 4)) : K.map(() => '—')));
  console.log('  形状分 = (cos+1)/2 = ' + f(shape, 4) +
              '   ← cos = ' + f(shape * 2 - 1, 4));
  console.log('  能量轴 mJ = ' + f(mJ, 4) + '，能量分 = 1-|' + f(mU, 3) + '-' + f(mJ, 2) + '| = ' + f(energy, 4));
  console.log('  score = 0.7×' + f(shape, 4) + ' + 0.3×' + f(energy, 4) + ' = ' + f(score, 6));
  console.log('  该职业最看重：' + S.topDimsOf(career).join('/') +
              '；用户这些维度 ≥60 的：' + (S.topDimsOf(career).filter(k => scA.pct[k] >= 60).join('/') || '（无）'));
  return { score: score, shape: shape, energy: energy };
}

console.log('\n=== 第三步：两个反差最大的职业（相对拉伸前）===');
const ranked = S.matchCareers(scA.pct, careers, careers.length);
const best = ranked[0], worst = ranked[ranked.length - 1];
const db = detail(best.career, '最佳匹配');
const dw = detail(worst.career, '垫底职业');

/* ------------------------------------------------------------
 * 相对拉伸
 * ---------------------------------------------------------- */
console.log('\n=== 第四步：相对拉伸，把 score 的 [min,max] 铺到 [60,95] ===');
const rawScores = ranked.map(r => r.score).sort((a, b) => a - b);
const lo = rawScores[0], hi = rawScores[rawScores.length - 1];
console.log('  全库 score：min = ' + f(lo, 6) + '（' + worst.career.name + '）  max = ' + f(hi, 6) + '（' + best.career.name + '）');
console.log('  拉伸公式：显示匹配度 = 60 + 35 × (score - min) / (max - min)');
[['最佳', best, db], ['垫底', worst, dw]].forEach(function (row) {
  const label = row[0], m = row[1], d = row[2];
  console.log('  ' + label + '「' + m.career.name + '」：60 + 35 × (' + f(d.score, 4) + ' - ' + f(lo, 4) + ') / (' +
              f(hi, 4) + ' - ' + f(lo, 4) + ') = 60 + 35 × ' + f((d.score - lo) / (hi - lo), 4) +
              ' = ' + f(60 + 35 * (d.score - lo) / (hi - lo), 2) + ' → ' + m.fit + '%');
});
console.log('  拉伸是单调线性变换，不改变任何排名；只是让梯度看得出来。');

/* ------------------------------------------------------------
 * 反例 1：只用形状轴（旧的皮尔逊方案）
 * ---------------------------------------------------------- */
console.log('\n=== 反例：如果只用形状轴（旧的纯皮尔逊方案）===');
function shapeOnlyFit(userPct, c) {
  const U = K.map(k => clamp(userPct[k] / 100, 0, 1));
  const J = K.map(k => clamp(((c.w && c.w[k]) || 0) / 5, 0, 1));
  const cu = unit(center(U)), cj = unit(center(J));
  const cos = (cu && cj) ? dot(cu, cj) : 0;
  return Math.round(50 + 49 * clamp(cos, -1, 1));
}
const shapeOnly = careers.map(c => shapeOnlyFit(scA.pct, c));
function stat(a) {
  const s = a.slice().sort((x, y) => x - y);
  const avg = mean(s);
  const sd = Math.sqrt(mean(s.map(v => (v - avg) * (v - avg))));
  return 'min=' + s[0] + ' p10=' + s[Math.floor(s.length * 0.1)] + ' 均值=' + f(avg, 1) +
         ' p90=' + s[Math.floor(s.length * 0.9)] + ' max=' + s[s.length - 1] + ' 标准差=' + f(sd, 2);
}
console.log('  只用形状轴：' + stat(shapeOnly));
console.log('  双轴 + 拉伸：' + stat(ranked.map(r => r.fit)));

console.log('\n  但真正致命的问题不是挤压，而是「全选同一档」时形状轴完全失效：');
[1, 2, 3].forEach(function (v) {
  const ans = {}; qs.forEach(q => { ans[q.id] = v; });
  const sc = S.computeScores(qs, ans);
  const U = K.map(k => clamp(sc.pct[k] / 100, 0, 1));
  const cu = unit(center(U));
  const top = careers.slice().sort((a, b) => shapeOnlyFit(sc.pct, b) - shapeOnlyFit(sc.pct, a))[0];
  console.log('    全选 ' + v + '：中心化后 û = ' + (cu ? '有值' : 'null') +
              ' → 形状轴失效，第一名恒为 ' + top.name + '（' + shapeOnlyFit(sc.pct, top) + '%）');
});

/* ------------------------------------------------------------
 * 五种极端作答对照（双轴模型下）
 * ---------------------------------------------------------- */
console.log('\n=== 五种极端作答（双轴模型）===');
console.log('| 作答 | pct | 结果类型 | mU | Top3 | Top3 匹配度 |');
console.log('|---|---|---|---|---|---|');
[1, 2, 3, 4, 5].forEach(function (v) {
  const ans = {}; qs.forEach(q => { ans[q.id] = v; });
  const sc = S.computeScores(qs, ans);
  const uni = S.uniformProfile(sc);
  const m = S.matchCareers(sc.pct, careers, 3);
  console.log('| 全选' + v + ' | ' + K.map(k => sc.pct[k]).join(',') + ' | ' +
              (uni ? uni.code + '（' + uni.typeName + '）' : '(非均匀)') + ' | ' + f(uni.mU, 3) + ' | ' +
              m.map(x => x.career.name).join(' → ') + ' | ' + m.map(x => x.fit).join(', ') + ' |');
});
console.log('\n  注：六维持平时形状分恒为 0.5，对所有职业一样 —— 排序**完全由能量轴决定**，');
console.log('      所以「全选 1」会推最低投入度的职业、「全选 5」推最高投入度的职业。');
console.log('      Top1 的显示匹配度恒为 95%，这是拉伸公式的必然（max → 95）。');

/* ------------------------------------------------------------
 * 类别去重
 * ---------------------------------------------------------- */
console.log('\n=== 第五步：Top5 的类别去重（每类最多 2 个）===');
const top5 = S.matchCareers(scA.pct, careers, 5);
const cnt = {};
top5.forEach(m => { cnt[m.career.category] = (cnt[m.career.category] || 0) + 1; });
top5.forEach((m, i) => {
  console.log('  #' + (i + 1) + ' ' + m.career.name + '  fit=' + m.fit + '  score=' + f(m.score, 4) +
              '  形状=' + f(m.shape, 3) + ' 能量=' + f(m.energy, 3) + '  类别=' + m.career.category);
});
console.log('  类别分布：' + JSON.stringify(cnt) +
            '  ' + (Object.keys(cnt).every(k => cnt[k] <= 2) ? '✓ 每类 ≤2' : '✗ 有类超过 2'));

/* ------------------------------------------------------------
 * 非极端人设回归
 * ---------------------------------------------------------- */
console.log('\n=== 非极端人设回归 ===');
[
  { name: '纯艺术型', pick: k => k === 'A' },
  { name: '纯社会型', pick: k => k === 'S' },
  { name: '纯常规型', pick: k => k === 'C' },
  { name: '研究+现实型', pick: k => k === 'I' || k === 'R' }
].forEach(function (s) {
  const ans = {};
  qs.forEach(q => {
    const dims = q.dims || {};
    ans[q.id] = Object.keys(dims).some(k => s.pick(k) && dims[k] >= 0.5) ? 5 : 3;
  });
  const sc = S.computeScores(qs, ans);
  const m = S.matchCareers(sc.pct, careers, 3);
  const full = S.matchCareers(sc.pct, careers, careers.length);
  console.log('  [' + s.name + '] pct=' + K.map(k => sc.pct[k]).join(',') + '  码=' + S.hollandCode(sc, 3));
  console.log('    推荐：' + m.map(x => x.career.name + '(' + x.fit + '%)').join(' → '));
  console.log('    全库匹配度 ' + full[full.length - 1].fit + ' ~ ' + full[0].fit);
  console.log('    理由：' + m[0].reason);
});

console.log('\n=== 值域汇总 ===');
console.log('  场景 A 全库 score 值域：' + f(lo, 4) + ' ~ ' + f(hi, 4));
console.log('  显示匹配度：60 ~ 95（固定区间，永远如此）');

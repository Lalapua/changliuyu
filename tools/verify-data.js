/* ============================================================
 * 长留玉 · 数据自检脚本（Node 运行，不参与线上页面）
 * ------------------------------------------------------------
 * 用途：
 *   1. 检查题库 id / 维度分布 / 文本是否合规
 *   2. 检查职业库字段完整性与类别分布
 *   3. 用几组「极端人设」跑一遍计分与匹配，确认算法没写歪
 *
 * 运行：
 *   node tools/verify-data.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* --- 用最小 window 垫片把浏览器脚本跑在 Node 里 --- */
const ctx = { window: {}, console };
vm.createContext(ctx);

function load(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    throw new Error('文件不存在：' + rel);
  }
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
}

const FILES = [
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
];

console.log('· 加载数据文件…');
FILES.forEach(f => {
  try { load(f); } catch (e) { console.error('  ✗ ' + f + ' → ' + e.message); process.exitCode = 1; }
});

const W = ctx.window;
const DATA = W.CLJ_DATA;
const S = W.CLJ_SCORING;

if (!DATA || !S) {
  console.error('加载失败，无法继续校验');
  process.exit(1);
}

/* ============================================================
 * 1. 结构性校验
 * ============================================================ */
const report = DATA.validate();

console.log('\n===== 题库 / 职业库结构校验 =====');
console.log('结果：' + (report.ok ? '通过 ✅' : '存在问题 ❌'));

Object.keys(report.stats).forEach(k => {
  const s = report.stats[k];
  if (s.perDim) {
    const total = Object.values(s.perDim).reduce((a, b) => a + b, 0);
    console.log(`  ${k}：${s.total} 条（维度命中合计 ${total}）  ${JSON.stringify(s.perDim)}`);
  } else {
    console.log(`  ${k}：${s.total} 条`);
    console.log('    类别分布：' + JSON.stringify(s.perCategory, null, 0));
  }
});

if (report.errors.length) {
  console.log('\n--- 错误 ---');
  report.errors.forEach(e => console.log('  ✗ ' + e));
}
if (report.warnings.length) {
  console.log('\n--- 提示 ---');
  report.warnings.forEach(e => console.log('  ! ' + e));
}

/* ============================================================
 * 2. 计分算法冒烟测试
 * ============================================================ */
console.log('\n===== 计分与匹配冒烟测试 =====');

const careers = DATA.careers();

/** 造一个只在指定维度上高分的人设：该维度题选 5，其余选 2 */
function persona(version, strongKeys) {
  const qs = DATA.questions(version);
  const answers = {};
  qs.forEach(q => {
    const main = Object.keys(q.dims)[0];
    answers[q.id] = strongKeys.indexOf(main) >= 0 ? 5 : 2;
  });
  return answers;
}

function run(version, keys, label) {
  const qs = DATA.questions(version);
  const answers = persona(version, keys);
  const scores = S.computeScores(qs, answers);
  const matches = S.matchCareers(scores.pct, careers, 3);
  const top = matches.map(m => `${m.career.name}(${m.fit}%)`).join(' → ');
  const dims = S.DIM_KEYS.map(k => k + ':' + scores.pct[k]).join(' ');
  console.log(`\n  [${label}] 版本=${version} 强项=${keys.join('+')}`);
  console.log('    维度分：' + dims);
  console.log('    代码：' + S.hollandCode(scores, 3));
  console.log('    推荐：' + top);

  // 断言：强项维度必须显著高于弱项维度
  const strong = keys.map(k => scores.pct[k]);
  const weak = S.DIM_KEYS.filter(k => keys.indexOf(k) < 0).map(k => scores.pct[k]);
  const minStrong = Math.min.apply(null, strong);
  const maxWeak = Math.max.apply(null, weak);
  if (minStrong <= maxWeak) {
    console.log('    ✗ 断言失败：强项维度没有高于弱项');
    process.exitCode = 1;
  } else {
    console.log('    ✓ 强项(' + minStrong + ') > 弱项(' + maxWeak + ')');
  }

  // 断言：最佳匹配职业的权重，应当在其高分维度上确实高
  const best = matches[0].career;
  const bestTop = S.topDimsOf(best);
  const hit = bestTop.filter(k => keys.indexOf(k) >= 0).length;
  console.log('    ' + (hit > 0 ? '✓' : '✗') + ' 最佳职业「' + best.name + '」最看重 ' + bestTop.join('+') +
              '，与强项命中 ' + hit + ' 项');
  if (hit === 0) process.exitCode = 1;

  return scores;
}

run('light', ['A'], '纯艺术型');
run('light', ['S'], '纯社会型');
run('light', ['C'], '纯常规型');
run('full', ['I', 'R'], '研究+现实型');
run('full', ['E'], '企业型');
run('full', ['E', 'S'], '企业+社会型');

/* 全选「一般」的极端情况不能崩 */
const qsLight = DATA.questions('light');
const neutral = {};
qsLight.forEach(q => { neutral[q.id] = 3; });
const neutralScores = S.computeScores(qsLight, neutral);
const neutralMatch = S.matchCareers(neutralScores.pct, careers, 3);
console.log('\n  [全选中立] 维度分：' + S.DIM_KEYS.map(k => k + ':' + neutralScores.pct[k]).join(' '));
console.log('    推荐：' + neutralMatch.map(m => m.career.name + '(' + m.fit + '%)').join(' → ') +
            (neutralMatch.length ? '  ✓ 未崩溃' : '  ✗ 无结果'));

/* 同好百分比已整体下线（结果页与分享图都不再展示），原来这里有稳定性断言，
 * 相关接口 peerSignature / simulatedPeerPercent / getPeerPercent 已从 scoring.js 移除。 */

/* ============================================================
 * 3. 文本长度抽查
 * ============================================================ */
console.log('\n===== 文案长度抽查 =====');
const tooShort = [], tooLong = [];
DATA.questions('full').forEach(q => {
  const n = q.text.length;
  if (n < 8) tooShort.push(q.id + '(' + n + ') ');
  if (n > 40) tooLong.push(q.id + '(' + n + ') ');
});
console.log('  全量版题干过短(<8字)：' + (tooShort.length ? tooShort.join(', ') : '无 ✓'));
console.log('  全量版题干过长(>40字)：' + (tooLong.length ? tooLong.join(', ') : '无 ✓'));

const dupText = {};
const dupes = [];
DATA.questions('full').forEach(q => {
  if (dupText[q.text]) dupes.push(q.id + ' = ' + dupText[q.text]);
  dupText[q.text] = q.id;
});
console.log('  重复题干：' + (dupes.length ? dupes.join(', ') : '无 ✓'));

const noName = careers.filter(c => !c.name || !c.desc || !c.env || !c.skills || c.skills.length < 3);
console.log('  职业库字段缺失：' + (noName.length ? noName.map(c => c.id).join(', ') : '无 ✓'));

/* ============================================================
 * 4. 极端作答回归（双轴匹配模型的防线）
 * ============================================================ */
console.log('\n===== 极端作答回归（全选 1~5）=====');

const K6 = S.DIM_KEYS;
const extremes = [];

[1, 2, 3, 4, 5].forEach(v => {
  const ans = {};
  qsLight.forEach(q => { ans[q.id] = v; });
  const sc = S.computeScores(qsLight, ans);
  const uni = S.uniformProfile(sc);
  const top3 = S.matchCareers(sc.pct, careers, 3);
  const full = S.matchCareers(sc.pct, careers, careers.length);
  const fits = full.map(x => x.fit);
  extremes.push({
    v: v,
    pct: K6.map(k => sc.pct[k]).join(','),
    type: uni ? uni.code : '(未识别为均匀)',
    typeName: uni ? uni.typeName : '-',
    top1: top3[0] ? top3[0].career.name : '',
    top3names: top3.map(x => x.career.name),
    top3fit: top3.map(x => x.fit),
    min: Math.min.apply(null, fits),
    max: Math.max.apply(null, fits),
    nan: fits.some(f => !Number.isFinite(f))
  });
});

console.log('  | 作答 | pct | 结果类型 | Top3 | Top3 匹配度 | 全库值域 |');
console.log('  |---|---|---|---|---|---|');
extremes.forEach(e => {
  console.log('  | 全选' + e.v + ' | ' + e.pct + ' | ' + e.type + '（' + e.typeName + '） | ' +
              e.top3names.join(' → ') + ' | ' + e.top3fit.join(', ') + ' | ' + e.min + '~' + e.max + ' |');
});

let extFail = 0;
function assert(ok, label, extra) {
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + label + (extra ? ' → ' + extra : ''));
  if (!ok) extFail++;
}

assert(extremes.every(e => e.type.indexOf('(') !== 0), '五种作答都被识别为「兴趣分布均匀」');
assert(new Set(extremes.map(e => e.type)).size === 5, '五种结果类型互不相同',
  extremes.map(e => e.type).join(' / '));
assert(new Set(extremes.map(e => e.top1)).size === 5, '五种 Top1 职业互不相同',
  extremes.map(e => e.top1).join(' / '));
assert(new Set(extremes.map(e => e.top3names.join(','))).size === 5, '五种 Top3 职业组合互不相同',
  extremes.map(e => e.top3names.join('/')).join(' | '));
/* 显示分是四舍五入过的整数，两组不同的作答偶尔会撞出同一串数字
 * （比如 95/94/93），所以这里要求「至少 4 种」而不是「5 种都不同」；
 * 真正的判据是上面的 Top3 职业组合必须完全不同。 */
assert(new Set(extremes.map(e => e.top3fit.join(','))).size >= 4, '五种 Top3 匹配度组合至少 4 种不同',
  extremes.map(e => e.top3fit.join('/')).join(' | '));
assert(extremes.every(e => e.max - e.min >= 25), '全库匹配度极差 ≥ 25（不再挤在 65~69）',
  extremes.map(e => e.min + '~' + e.max).join(' | '));
assert(extremes.every(e => e.max <= 95 && e.min >= 60), '匹配度全部落在 60~95 的显示区间');
assert(extremes.every(e => !e.nan), '没有 NaN / Infinity');

console.log('  说明：Top1 的匹配度恒为 95% —— 这是「相对拉伸」公式的必然结果（max 一定映射到 95），');
console.log('        五种作答的差异体现在结果类型、Top1 职业和 Top3 的梯度上。');

/* energy 字段分布：能量轴的另一半输入 */
const sortedE = careers.slice().sort((a, b) => a.energy - b.energy);
console.log('  职业 energy：' + careers.length + ' 个，值域 ' +
            sortedE[0].energy + ' ~ ' + sortedE[sortedE.length - 1].energy +
            '，不同取值 ' + new Set(careers.map(c => c.energy)).size + ' 种');
console.log('    最低三个：' + sortedE.slice(0, 3).map(c => c.name + '(' + c.energy + ')').join('、'));
console.log('    最高三个：' + sortedE.slice(-3).reverse().map(c => c.name + '(' + c.energy + ')').join('、'));

/* 持平整判率：FLAT_VAR 一旦设松，就会把「正常有偏好」的作答误判成六维持平，
 * 结果页会拿「整体投入度」换掉霍兰德代码 —— 曾经用 0.01 时误判率高达 28.7%。
 * 这里用随机作答守住这个比例，改阈值时它会立刻报警。 */
let fpCount = 0;
const FP_N = 3000;
let fpSeed = 12345;
function fpRand() { fpSeed = (fpSeed * 1103515245 + 12345) & 0x7fffffff; return fpSeed / 0x7fffffff; }
for (let i = 0; i < FP_N; i++) {
  const ans = {};
  qsLight.forEach(q => { ans[q.id] = 1 + Math.floor(fpRand() * 5); });
  if (S.isUniform(S.computeScores(qsLight, ans))) fpCount++;
}
const fpRate = fpCount / FP_N * 100;
assert(fpRate < 1, '随机作答被判为「六维持平」的比例 < 1%',
  fpRate.toFixed(2) + '%（' + fpCount + '/' + FP_N + '）  FLAT_VAR=' + S.FLAT_VAR +
  ' ≈ 百分制 std ' + (Math.sqrt(S.FLAT_VAR) * 100).toFixed(1) + ' 分');

/* 具体反例：极差 20 分的作答绝不能被判成持平 */
const notFlat = { pct: {} };
S.DIM_KEYS.forEach((k, i) => { notFlat.pct[k] = [50, 55, 70, 50, 60, 65][i]; });
assert(!S.isUniform(notFlat), '六维极差 20 分的正常画像不会被误判为持平');
const notFlat2 = { pct: {} };
S.DIM_KEYS.forEach((k, i) => { notFlat2.pct[k] = [55, 46, 60, 67, 63, 45][i]; });
assert(!S.isUniform(notFlat2), '六维极差 22 分的正常画像不会被误判为持平（曾误判的真实案例）');

if (extFail) process.exitCode = 1;

/* ============================================================
 * 5. 维度点评文案池
 * ============================================================ */
console.log('\n===== 维度点评文案池 =====');

/* dimComment 在浏览器里用 CLJ.hash 挑说法，这里补一个等价实现
 * （与 js/global.js 里那段 FNV-1a 完全一致），否则会走 fallback 分支，
 * 测的就不是线上真正的取词逻辑了。 */
W.CLJ = {
  hash: function (str) {
    var h = 2166136261, s = String(str);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
};

const BANDS = [
  { name: '≥80  顶尖', probe: 92 },
  { name: '65-79 偏强', probe: 70 },
  { name: '50-64 中等', probe: 56 },
  { name: '35-49 偏弱', probe: 40 },
  { name: '<35  低  ', probe: 20 }
];

let poolFail = 0;

BANDS.forEach(band => {
  const picked = S.DIM_KEYS.map(k => S.dimComment(k, band.probe));
  const distinct = new Set(picked);
  picked.forEach(t => {
    if (!t || !t.trim()) { console.log('  ✗ ' + band.name + ' 出现空文案'); poolFail++; return; }
    if (!/[。！？]$/.test(t)) { console.log('  ✗ ' + band.name + ' 文案结尾没标点：' + t); poolFail++; }
    if (t.length < 10 || t.length > 46) { console.log('  ✗ ' + band.name + ' 文案长度异常(' + t.length + ')：' + t); poolFail++; }
  });
  const ok = distinct.size >= 5;
  if (!ok) poolFail++;
  console.log('  ' + band.name + ' → 6 个维度取到 ' + distinct.size + ' 种说法' + (ok ? '  ✓' : '  ✗ 重复太多'));
});

/* 稳定性：同一 (维度, 分值) 反复调用必须得到同一句 */
let unstable = 0;
S.DIM_KEYS.forEach(k => {
  for (let v = 1; v <= 99; v += 7) {
    if (S.dimComment(k, v) !== S.dimComment(k, v)) unstable++;
  }
});
console.log('  稳定性：同维度同分值重复取词不一致 ' + unstable + ' 次' + (unstable ? '  ✗' : '  ✓'));
if (unstable) poolFail++;

/* 多样性：6 维 × 1~99 分一共能吐出多少种不同说法 */
const bag = new Set();
S.DIM_KEYS.forEach(k => { for (let v = 1; v <= 99; v++) bag.add(S.dimComment(k, v)); });
const lens = [...bag].map(t => t.length);
console.log('  多样性：6 维 × 1~99 分共 ' + bag.size + ' 种不同说法' + (bag.size >= 40 ? '  ✓' : '  ✗ 偏少'));
console.log('  文案长度：最短 ' + Math.min(...lens) + ' 字，最长 ' + Math.max(...lens) + ' 字');
if (bag.size < 40) poolFail++;

/* 相邻分值不应该只换标点不换话 —— 抽查一下同一档内的差异度 */
const midBand = new Set();
for (let v = 50; v <= 64; v++) S.DIM_KEYS.forEach(k => midBand.add(S.dimComment(k, v)));
console.log('  中等档（50~64）细粒度：6 维 × 15 个分值共 ' + midBand.size + ' 种说法' +
            (midBand.size >= 8 ? '  ✓' : '  ✗ 档内变化太少'));

if (poolFail) process.exitCode = 1;

console.log('\n===== 校验结束 =====');
if (process.exitCode) console.log('存在失败项，请按上面的 ✗ 修正。');
else console.log('全部通过。');

/* ============================================================
 * 长留玉 · 天赋测试 · 自检
 * ------------------------------------------------------------
 * 检查三件事：
 *   A. 数据格式：40 题、八维各 5 题、八张画像一一对应、题干长度合理；
 *   B. 计分逻辑：极端作答要落在预期档位，排序要可复现；
 *   C. 「八项持平」阈值不能设松 —— 这是职业测试踩过的坑，
 *      当初阈值设成「标准差 < 10 分」，28.7% 的正常作答被误判成没有形状。
 *      这里用同一套量级（3.5 分）并守住误判率。
 *
 * 运行：node tools/verify-talent.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = { window: {}, console };
vm.createContext(ctx);

['scoring.js', 'questions.js', 'talents.js', 'data.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'talent', f), 'utf8'), ctx, { filename: 'js/talent/' + f });
});

const S = ctx.window.CLJ_TALENT_SCORING;
const D = ctx.window.CLJ_TALENT_DATA;

let pass = 0, fail = 0;
const ok = (l, x) => { console.log('  ✓ ' + l + (x ? ' → ' + x : '')); pass++; };
const bad = (l, x) => { console.log('  ✗ ' + l + (x ? ' → ' + x : '')); fail++; };

/* ============ A. 数据格式 ============ */
console.log('===== A. 数据格式 =====');
const rep = D.validate();
if (rep.ok) ok('validate() 通过，无错误');
else { bad('validate() 报错 ' + rep.errors.length + ' 条'); rep.errors.slice(0, 8).forEach(e => console.log('      · ' + e)); }
rep.warnings.slice(0, 6).forEach(w => console.log('      ! ' + w));

const qs = D.questions();
ok('题库总数', qs.length + ' 题');
const perDim = {};
S.DIM_KEYS.forEach(k => { perDim[k] = 0; });
qs.forEach(q => Object.keys(q.dims).forEach(k => { perDim[k]++; }));
ok('八维题量', S.DIM_KEYS.map(k => S.dim(k).name + perDim[k]).join(' / '));
const uniq = new Set(qs.map(q => q.id));
ok('题目 id 无重复', uniq.size + ' 个唯一 id');

const ts = D.talents();
ok('画像数量与维度一一对应', ts.length + ' 张 / ' + S.DIM_KEYS.length + ' 维');
S.DIM_KEYS.forEach(k => {
  const t = D.talentById(k);
  if (!t) bad('维度 ' + k + ' 缺画像');
});
if (S.DIM_KEYS.every(k => D.talentById(k))) ok('每个维度都能取到画像');

/* 题干长度分布 */
const lens = qs.map(q => q.text.length);
ok('题干长度', '最短 ' + Math.min.apply(null, lens) + ' 字 / 最长 ' + Math.max.apply(null, lens) + ' 字');

/* ============ B. 计分逻辑 ============ */
console.log('\n===== B. 计分逻辑 =====');

function answersAll(v) {
  const a = {};
  qs.forEach(q => { a[q.id] = v; });
  return a;
}
function answersBy(levelMap) {
  const a = {};
  qs.forEach(q => {
    const dim = Object.keys(q.dims)[0];
    a[q.id] = levelMap[dim] || 3;
  });
  return a;
}

/* 全选同一档 → 八项持平，走「整体水平」档 */
console.log('  极端作答（全选同一档）：');
[[1, '尚未显影'], [2, '偏内敛'], [3, '不偏不倚'], [4, '整体偏强'], [5, '全面突出']].forEach(([v, expect]) => {
  const sc = S.computeScores(qs, answersAll(v));
  const flat = S.isFlat(sc);
  const code = S.levelProfile(sc).code;
  const allSame = S.DIM_KEYS.every(k => sc.pct[k] === sc.pct[S.DIM_KEYS[0]]);
  if (!flat) bad('全选 ' + v + ' 应判为八项持平，却没有');
  else if (code !== expect) bad('全选 ' + v + ' 档位应为「' + expect + '」，实际「' + code + '」');
  else if (!allSame) bad('全选 ' + v + ' 八项分值应完全相同');
  else ok('全选 ' + v + ' → 持平，整体水平「' + code + '」', '分值 ' + sc.pct[S.DIM_KEYS[0]]);
});

/* 单项突出 → 排序正确 */
console.log('  单项突出：');
S.DIM_KEYS.forEach(k => {
  const sc = S.computeScores(qs, answersBy({ [k]: 5 }));
  const top = S.topDims(sc, 3);
  if (top[0] !== k) bad('把「' + S.dim(k).name + '」答成最高，Top1 却是 ' + S.dim(top[0]).name);
});
ok('八维逐个拉高时，Top1 都是对应维度');
ok('排序可复现（同分按下标顺序）', S.topDims(S.computeScores(qs, answersAll(3)), 3).join('-') === 'LIN-LOG-SPA');

/* 大字标签 */
console.log('  结果页大字：');
{
  const flatSc = S.computeScores(qs, answersAll(3));
  ok('持平时显示整体水平', '「' + S.headLabel(flatSc) + '」');
  const lopsided = S.computeScores(qs, answersBy({ LOG: 5, SPA: 5, INT: 5, MUS: 1 }));
  const h = S.headLabel(lopsided);
  if (h.indexOf('·') > 0) ok('有形状时显示天赋组合', '「' + h + '」');
  else bad('天赋组合格式不对：' + h);
}

/* 弱项提示 */
{
  const sc = S.computeScores(qs, answersBy({ LIN: 5, LOG: 4, SPA: 4, NAT: 1 }));
  const weak = S.bottomDim(sc);
  if (weak === 'NAT') ok('相对最弱的那项判定正确', S.dim(weak).name);
  else bad('最弱项应为 NAT，实际 ' + weak);
}

/* ============ C. 持平阈值不能设松 ============ */
console.log('\n===== C. 持平阈值的误判率 =====');
console.log('  当前阈值：标准差 < ' + S.FLAT_STD + ' 分（八维分值彼此差不了几分才算持平）');
let N = 4000, flat = 0, spreadSum = 0;
let seed = 20261002;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < N; i++) {
  const a = {};
  qs.forEach(q => { a[q.id] = 1 + Math.floor(rnd() * 5); });
  const sc = S.computeScores(qs, a);
  const vals = S.DIM_KEYS.map(k => sc.pct[k]);
  const spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
  if (S.isFlat(sc)) { flat++; spreadSum += spread; }
}
const rate = flat / N * 100;
ok('随机作答被判为「八项持平」的比例', rate.toFixed(2) + '%（' + flat + '/' + N + '）');
if (rate < 1) ok('误判率低于 1%，阈值合理');
else bad('误判率 ' + rate.toFixed(2) + '% 偏高，正常作答会丢掉天赋组合');
if (flat) ok('被误判的作答平均极差', (spreadSum / flat).toFixed(1) + ' 分（真正的持平应该只有几分）');

/* 具体反例：极差 20 分绝不能被判持平 */
{
  const a = {};
  const want = { LIN: 5, LOG: 4, SPA: 4, MUS: 3, BOD: 3, PER: 2, INT: 2, NAT: 1 };
  qs.forEach(q => { a[q.id] = want[Object.keys(q.dims)[0]]; });
  const sc = S.computeScores(qs, a);
  const vals = S.DIM_KEYS.map(k => sc.pct[k]);
  const spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
  if (!S.isFlat(sc)) ok('极差 ' + spread + ' 分的正常作答不会被误判成持平');
  else bad('极差 ' + spread + ' 分却被判成持平');
}

console.log('\n' + '='.repeat(50));
if (fail) { console.log('失败 ' + fail + ' 项 / 通过 ' + pass + ' 项'); process.exitCode = 1; }
else console.log('全部通过（' + pass + ' 项）');

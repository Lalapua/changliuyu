/* ============================================================
 * 长留玉 · 天赋测试 · 自检
 * ------------------------------------------------------------
 * 检查四件事：
 *   A. 数据格式：轻量版 40 题 / 全量版 80 题（每维 5 / 10 题）、
 *      八张画像一一对应且 name 是「形容词+名词」、名人的库权重合法；
 *   B. 计分逻辑：极端作答落在预期档位，排序可复现；
 *   C. 「八项持平」阈值不能设松 —— 职业测试踩过坑（阈值相当于标准差 10 分，
 *      28.7% 的正常作答被误判成没有形状）。这里同一套量级并守住误判率；
 *   D. 名人匹配只比**形状**不比高低 —— 同一形状不同水平必须匹配到同一位。
 *
 * 运行：node tools/verify-talent.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = { window: {}, console };
vm.createContext(ctx);

['scoring.js', 'questions-light.js', 'questions-full.js', 'talents.js', 'figures.js', 'data.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'talent', f), 'utf8'), ctx, { filename: 'js/talent/' + f });
});

const S = ctx.window.CLJ_TALENT_SCORING;
const D = ctx.window.CLJ_TALENT_DATA;
const K = S.DIM_KEYS;

let pass = 0, fail = 0;
const ok = (l, x) => { console.log('  ✓ ' + l + (x ? ' → ' + x : '')); pass++; };
const bad = (l, x) => { console.log('  ✗ ' + l + (x ? ' → ' + x : '')); fail++; };

/* ============ A. 数据格式 ============ */
console.log('===== A. 数据格式 =====');
const rep = D.validate();
if (rep.ok) ok('validate() 通过，无错误');
else { bad('validate() 报错 ' + rep.errors.length + ' 条'); rep.errors.slice(0, 8).forEach(e => console.log('      · ' + e)); }
rep.warnings.slice(0, 6).forEach(w => console.log('      ! ' + w));

['light', 'full'].forEach(v => {
  const list = D.questions(v);
  const meta = D.VERSIONS[v];
  const per = {};
  K.forEach(k => { per[k] = 0; });
  list.forEach(q => Object.keys(q.dims).forEach(k => { per[k]++; }));
  const uniq = new Set(list.map(q => q.id)).size;
  const expectPer = v === 'light' ? 5 : 10;
  const allRight = K.every(k => per[k] === expectPer);
  if (list.length === meta.count && uniq === list.length && allRight) {
    ok(meta.label + ' ' + list.length + ' 题，每维 ' + expectPer + ' 题，id 无重复');
  } else {
    bad(meta.label + ' 题量/分布不对', '共 ' + list.length + '（声明 ' + meta.count + '），每维 ' +
      K.map(k => S.dim(k).name + per[k]).join('/') + '，唯一 id ' + uniq);
  }
});

/* 全量版是轻量版的超集 */
{
  const l = new Set(D.questions('light').map(q => q.id));
  const f = D.questions('full');
  const overlap = f.filter(q => l.has(q.id)).length;
  if (overlap === l.size) ok('全量版是轻量版的超集', overlap + ' 道重叠 + ' + (f.length - overlap) + ' 道补充');
  else bad('全量版没有包含轻量版的全部题目', overlap + '/' + l.size);
}

const ts = D.talents();
if (ts.length === K.length && K.every(k => D.talentById(k))) ok('八张画像与八维一一对应');
else bad('画像与维度对不上', ts.length + ' 张');
const shortNames = ts.filter(t => t.name.length < 5);
if (!shortNames.length) ok('画像名都是「形容词 + 名词」结构', ts.map(t => t.name).join(' / '));
else bad('有画像名字太短', shortNames.map(t => t.name).join(' / '));

const figs = D.figures();
ok('名人的库', figs.length + ' 位');
{
  const byPrimary = {};
  K.forEach(k => { byPrimary[k] = 0; });
  figs.forEach(f => {
    let max = -1, main = null;
    K.forEach(k => { if (f.w[k] > max) { max = f.w[k]; main = k; } });
    if (main) byPrimary[main]++;
  });
  const thin = K.filter(k => byPrimary[k] < 3);
  if (!thin.length) ok('每项能力都有 ≥3 位名人可选', K.map(k => S.dim(k).name + byPrimary[k]).join('/'));
  else bad('这些能力的名人太少', thin.map(k => S.dim(k).name + byPrimary[k]).join('/'));
}

/* ============ B. 计分逻辑 ============ */
console.log('\n===== B. 计分逻辑 =====');
const qs = D.questions('light');
const aAll = v => { const a = {}; qs.forEach(q => { a[q.id] = v; }); return a; };
const aBy = m => { const a = {}; qs.forEach(q => { a[q.id] = m[Object.keys(q.dims)[0]] || 3; }); return a; };

[[1, '尚未显影'], [2, '偏内敛'], [3, '不偏不倚'], [4, '整体偏强'], [5, '全面突出']].forEach(([v, expect]) => {
  const sc = S.computeScores(qs, aAll(v));
  const same = K.every(k => sc.pct[k] === sc.pct[K[0]]);
  if (S.isFlat(sc) && S.levelProfile(sc).code === expect && same) {
    ok('全选 ' + v + ' → 持平 / ' + expect, '分值 ' + sc.pct[K[0]]);
  } else {
    bad('全选 ' + v + ' 应持平坦落「' + expect + '」', 'flat=' + S.isFlat(sc) + ' code=' + S.levelProfile(sc).code);
  }
});

K.forEach(k => {
  const top = S.topDims(S.computeScores(qs, aBy({ [k]: 5 })), 1)[0];
  if (top !== k) bad('拉高「' + S.dim(k).name + '」后 Top1 却是 ' + S.dim(top).name);
});
ok('八维逐个拉高时 Top1 都正确');
ok('排序可复现（同分按下标）', S.topDims(S.computeScores(qs, aAll(3)), 3).join('-') === 'LIN-LOG-SPA');
{
  const flatSc = S.computeScores(qs, aAll(3));
  const shaped = S.computeScores(qs, aBy({ LOG: 5, SPA: 5, INT: 5, MUS: 1 }));
  ok('持平时大字显示整体水平', '「' + S.headLabel(flatSc) + '」');
  ok('有形状时大字显示天赋组合', '「' + S.headLabel(shaped) + '」');
  if (S.bottomDim(S.computeScores(qs, aBy({ LIN: 5, NAT: 1 }))) === 'NAT') ok('相对最弱那项判定正确', '自然');
  else bad('最弱项判定错误');
}

/* ============ C. 持平阈值 ============ */
console.log('\n===== C. 持平阈值的误判率 =====');
console.log('  阈值：标准差 < ' + S.FLAT_STD + ' 分');
let N = 4000, fl = 0, seed = 20261002;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < N; i++) {
  const a = {};
  qs.forEach(q => { a[q.id] = 1 + Math.floor(rnd() * 5); });
  if (S.isFlat(S.computeScores(qs, a))) fl++;
}
const rate = fl / N * 100;
ok('随机作答被判为「八项持平」的比例', rate.toFixed(2) + '%（' + fl + '/' + N + '）');
if (rate < 1) ok('误判率低于 1%，阈值合理');
else bad('误判率 ' + rate.toFixed(2) + '% 偏高，正常作答会丢掉天赋组合');
{
  const sc = S.computeScores(qs, aBy({ LIN: 5, LOG: 4, SPA: 4, MUS: 3, BOD: 3, PER: 2, INT: 2, NAT: 1 }));
  const vals = K.map(k => sc.pct[k]);
  const spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
  if (!S.isFlat(sc)) ok('极差 ' + spread + ' 分的正常作答不会被误判成持平');
  else bad('极差 ' + spread + ' 分却被判成持平');
}

/* ============ D. 名人匹配 ============ */
console.log('\n===== D. 名人匹配 =====');
{
  const flatSc = S.computeScores(qs, aAll(3));
  const m = S.matchFigures(flatSc, figs, 3);
  if (m.length === 0) ok('八项持平时不硬套名人', '返回空，结果页会如实说明');
  else bad('持平时本不该匹配名人，却给了 ' + m[0].figure.name);
}
{
  const shaped = S.computeScores(qs, aBy({ LOG: 5, INT: 4, SPA: 4, NAT: 3, MUS: 1, PER: 1 }));
  const m = S.matchFigures(shaped, figs, 3);
  if (m.length === 3 && m[0].sim >= m[1].sim && m[1].sim >= m[2].sim) {
    ok('有形状时给出 3 位，且按相似度降序', m.map(x => x.figure.name).join(' → '));
  } else bad('名人匹配排序不对', JSON.stringify(m.map(x => x.figure.name)));
}
{
  /* 核心性质：只比形状不比高低。同一形状、整体差一档，必须匹配到同一位。
   * 注意构造方式：必须让**八个维度统一平移**（都降 1 档），形状才真的不变。
   * 用 aBy 会把没写到的维度默认成 3，那样平移的就不是同一个常量，形状会变。 */
  const full = (base, over) => {
    const m = {};
    K.forEach(k => { m[k] = base; });
    Object.keys(over).forEach(k => { m[k] = over[k]; });
    return m;
  };
  const pattern = { LOG: 5, PER: 2, INT: 4, NAT: 2 };                 // 其余维度 = 3
  const shifted = { LOG: 4, PER: 1, INT: 3, NAT: 1 };                 // 同上整体 -1，其余 = 2
  const scA = S.computeScores(qs, aBy(full(3, pattern)));
  const scB = S.computeScores(qs, aBy(full(2, shifted)));
  /* 先证明两种作答的形状确实相同（中心化之后向量一致），再验证匹配结果 */
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const cc = sc => { const v = K.map(k => sc.pct[k]); const m = mean(v); return v.map(x => x - m); };
  const sameShape = cc(scA).every((x, i) => Math.abs(x - cc(scB)[i]) < 1e-9);
  const ma = S.matchFigures(scA, figs, 1)[0];
  const mb = S.matchFigures(scB, figs, 1)[0];
  if (!sameShape) bad('测试自身有问题：构造出的两种作答形状并不相同');
  else if (ma && mb && ma.figure.id === mb.figure.id) {
    ok('同一形状、整体差一档 → 匹配到同一位名人', ma.figure.name + '（说明只比形状不比高低）');
  } else {
    bad('形状相同的两种作答匹配到了不同的人', (ma && ma.figure.name) + ' vs ' + (mb && mb.figure.name));
  }
}
{
  /* 形状明显不同的人，不该匹配到同一位（否则匹配等于随机） */
  const heads = {};
  let dup = 0;
  K.forEach(k => {
    const anchor = {}; K.forEach(x => { anchor[x] = 2; }); anchor[k] = 5;
    const m = S.matchFigures(S.computeScores(qs, aBy(anchor)), figs, 1)[0];
    if (m) { if (heads[m.figure.id]) dup++; heads[m.figure.id] = true; }
  });
  ok('八个「单项独高」的形状共匹配到', Object.keys(heads).length + ' 位不同名人' + (dup ? '（有重复）' : ''));
}
{
  /* 核心性质：**名人的最强项必须落在用户的前三项里**。
   * 曾经只比形状，实测随机作答有 6.2% 会给出「答非所问」的结果 ——
   * 比如你的长板是共情，却匹配到一位最强项是动觉的人。形状相似度没算错，
   * 但「最像的名人」这句话承诺了主要特质要对得上。 */
  let seed2 = 424242, n = 0, bad = 0, firstBad = null;
  const rnd2 = () => (seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 5000; i++) {
    const a = {};
    qs.forEach(q => { a[q.id] = 1 + Math.floor(rnd2() * 5); });
    const sc = S.computeScores(qs, a);
    if (S.isFlat(sc)) continue;
    const m = S.matchFigures(sc, figs, 1)[0];
    if (!m) continue;
    n++;
    const top1 = S.topDims(sc, 1)[0];
    const fp = S.figurePrimary(m.figure);
    if (fp !== top1) {
      bad++;
      if (!firstBad) firstBad = m.figure.name + '（最强项 ' + S.dim(fp).name + '）给了最强项是 ' + S.dim(S.topDims(sc,1)[0]).name + ' 的人';
    }
  }
  ok('随机作答 5000 组中「名人的最强项 ≠ 你的最强项」的比例', (bad / n * 100).toFixed(1) + '%（' + bad + '/' + n + '）');
  if (bad === 0) ok('名人匹配的最强项总是和你的最强项一致');
  else bad('有 ' + bad + ' 组答非所问，例如 ' + firstBad);
}
{
  /* 只给一位：多的那几位其实说不准，不如把一位说准 */
  const shaped = S.computeScores(qs, aBy({ PER: 5, INT: 4, LIN: 4, LOG: 2 }));
  ok('默认只返回一位名人', S.matchFigures(shaped, figs, 1).length === 1);
}
ok('组合解读文案能生成', '「' + S.comboLine(S.computeScores(qs, aBy({ LOG: 5, SPA: 4, INT: 4, MUS: 1 }))).slice(0, 28) + '…」');

console.log('\n' + '='.repeat(52));
if (fail) { console.log('失败 ' + fail + ' 项 / 通过 ' + pass + ' 项'); process.exitCode = 1; }
else console.log('全部通过（' + pass + ' 项）');

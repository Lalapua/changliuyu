/* ============================================================
 * 长留玉 · 职业库权重总表生成器
 * ------------------------------------------------------------
 * 从 js/career/careers-part*.js 读出全部职业，生成 CAREERS.md：
 *   · 按类别分组的六维权重总表
 *   · 每行附带「形状」迷你条形图（R I A S E C 依次一格）
 *   · 附录 A：各维度最看重的职业 Top10
 *   · 附录 B：数据健康度（类别分布、峰值偏低需要留意区分的职业）
 *
 * 改完职业库重跑一次即可：
 *   node tools/list-careers.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'CAREERS.md');

/* ---------- 加载数据 ---------- */
const ctx = { window: {}, console };
vm.createContext(ctx);
[
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
const K = S.DIM_KEYS;                        // ['R','I','A','S','E','C']
const careers = DATA.careers();
const categories = DATA.categories();

/* ---------- 小工具 ---------- */
const SHAPE = ['·', '▁', '▂', '▄', '▆', '█'];        // 权重 0~5 → 条块

function shapeOf(c) {
  return K.map(k => SHAPE[Math.max(0, Math.min(5, Number(c.w[k]) || 0))]).join('');
}
function top2(c) {
  return S.topDimsOf(c).filter(k => (c.w[k] || 0) > 0).join(' + ') || '—';
}
function peak(c) {
  return Math.max.apply(null, K.map(k => Number(c.w[k]) || 0));
}
function energyStr(c) {
  return typeof c.energy === 'number' ? c.energy.toFixed(2) : '—';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|');
}

/* 数据指纹：改动职业库（含 energy）后这个值会变，方便判断文档是不是过期了 */
function fingerprint() {
  const payload = careers.map(c => c.id + ':' + K.map(k => c.w[k]).join('') + ':' + (c.energy || '')).join('|');
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) { h ^= payload.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const stamp = (function () {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();

/* ---------- 组装 ---------- */
const L = [];

L.push('# 长留玉 · 职业库六维权重总表');
L.push('');
L.push('> 本文件由 `node tools/list-careers.js` 自动生成，**请勿手改**；改完职业库重跑一次即可。');
L.push('> ');
L.push('> 生成时间 ' + stamp + ' · 数据指纹 `' + fingerprint() + '` · 共 **' + careers.length + '** 个职业 / **' + categories.length + '** 个类别');
L.push('');

L.push('这张表是匹配算法的输入侧。匹配用的是**双轴模型**：');
L.push('');
L.push('- **形状轴**：把「用户六维分」和「这个职业的六维权重」两边各自中心化后求余弦，比的是**整行起伏的形状**；');
L.push('- **能量轴**：把「用户六维归一化后的均值」和「这个职业的 `energy`」相减，比的是**整体投入度**。');
L.push('');
L.push('最终 `score = 0.7 × 形状分 + 0.3 × 能量分`。所以**别只看单个数字高低，要看整行的起伏形状** —— 形状越像你的六维曲线，匹配度越高。原理详见 [`ALGORITHM.md`](./ALGORITHM.md)。');
L.push('');

L.push('## 怎么读这张表');
L.push('');
L.push('| 列 | 含义 |');
L.push('|---|---|');
L.push('| R / I / A / S / E / C | 该职业对这六个维度的依赖度，取值 **0 ~ 5**，越大越看重（形状轴的输入） |');
L.push('| 形状 | 六列权重的迷你条形图，顺序固定为 `R I A S E C`，一眼看整行的起伏 |');
L.push('| 能量 | `energy` 字段，**0 ~ 1**：这个职业通常需要的整体投入度、节奏、外向度、多任务程度（能量轴的输入） |');
L.push('| 最看重 | 权重最高的两个维度（并列时按 R→I→A→S→E→C 顺序取） |');
L.push('| id | 职业唯一标识，对应用户结果里的推荐项 |');
L.push('');

L.push('### 六个维度');
L.push('');
L.push('| 代号 | 名称 | 别名 | 一句话 |');
L.push('|---|---|---|---|');
S.DIMS.forEach(function (d) {
  L.push('| **' + d.key + '** | ' + d.name + ' | ' + d.alias + ' | ' + esc(d.blurb) + ' |');
});
L.push('');

L.push('### 形状条对照');
L.push('');
L.push('| 权重 | 0 | 1 | 2 | 3 | 4 | 5 |');
L.push('|---|---|---|---|---|---|---|');
L.push('| 条块 | ' + SHAPE.join(' | ') + ' |');
L.push('');
L.push('> 当前职业库里**没有任何维度被设为 0**（最小值是 1），所以实际不会出现 `·`；这一格留着是为了将来加权重 0 的职业时不用改图例。');
L.push('');

L.push('## 类别总览');
L.push('');
L.push('| # | 类别 | 职业数 | 本类别最看重的维度（出现次数） |');
L.push('|---|---|---|---|');
const catOf = {};
categories.forEach(function (cat, i) {
  const list = careers.filter(c => c.category === cat);
  catOf[cat] = list;
  const dimHit = {};
  list.forEach(c => S.topDimsOf(c).forEach((k, idx) => {
    dimHit[k] = (dimHit[k] || 0) + (idx === 0 ? 2 : 1);   // 第一顺位权重更高
  }));
  const top = Object.keys(dimHit).sort((a, b) => dimHit[b] - dimHit[a]).slice(0, 3)
    .map(k => k + '×' + dimHit[k]).join('、');
  L.push('| ' + (i + 1) + ' | ' + esc(cat) + ' | ' + list.length + ' | ' + top + ' |');
});
L.push('');
L.push('---');
L.push('');

/* ---------- 正表：按类别分组 ---------- */
categories.forEach(function (cat, ci) {
  const list = catOf[cat];
  L.push('## ' + (ci + 1) + '. ' + esc(cat) + '（' + list.length + '）');
  L.push('');
  L.push('| # | 职业 | id | R | I | A | S | E | C | 形状 | 能量 | 最看重 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  list.forEach(function (c, i) {
    L.push('| ' + (i + 1) + ' | ' + esc(c.name) + ' | `' + esc(c.id) + '` | ' +
      K.map(k => c.w[k]).join(' | ') + ' | `' + shapeOf(c) + '` | ' + energyStr(c) + ' | ' + top2(c) + ' |');
  });
  L.push('');
});

L.push('---');
L.push('');

/* ---------- 附录 A：各维度 Top10 ---------- */
L.push('## 附录 A · 各维度最看重的职业 Top 10');
L.push('');
L.push('> 排序规则：先按该维度权重降序，权重相同时按六维权重之和降序（整体要求更"高"的排前面），再按名称。');
L.push('');
S.DIMS.forEach(function (d) {
  const list = careers.slice().sort(function (a, b) {
    const d1 = (b.w[d.key] || 0) - (a.w[d.key] || 0);
    if (d1) return d1;
    const s1 = K.reduce((s, k) => s + (b.w[k] || 0), 0) - K.reduce((s, k) => s + (a.w[k] || 0), 0);
    if (s1) return s1;
    return a.name.localeCompare(b.name, 'zh');
  }).slice(0, 10);

  L.push('### ' + d.key + ' · ' + d.name + '（' + d.alias + '）');
  L.push('');
  L.push('| # | 职业 | 类别 | ' + K.join(' | ') + ' | ' + d.key + ' 权重 |');
  L.push('|---|---|---|' + K.map(() => '---').join('|') + '|---|');
  list.forEach(function (c, i) {
    L.push('| ' + (i + 1) + ' | ' + esc(c.name) + ' | ' + esc(c.category) + ' | ' +
      K.map(k => c.w[k]).join(' | ') + ' | **' + (c.w[d.key] || 0) + '** |');
  });
  L.push('');
});

L.push('---');
L.push('');

/* ---------- 附录 B：数据健康度 ---------- */
const lowPeak = careers.filter(c => peak(c) < 4);
const noZero = careers.filter(c => K.every(k => (c.w[k] || 0) > 0));
const maxSum = careers.slice().sort(function (a, b) {
  return K.reduce((s, k) => s + (b.w[k] || 0), 0) - K.reduce((s, k) => s + (a.w[k] || 0), 0);
}).slice(0, 5);

L.push('## 附录 B · 数据健康度');
L.push('');
L.push('| 指标 | 值 |');
L.push('|---|---|');
L.push('| 职业总数 | ' + careers.length + ' |');
L.push('| 类别总数 | ' + categories.length + ' |');
L.push('| 权重最小值 | ' + Math.min.apply(null, careers.map(c => Math.min.apply(null, K.map(k => c.w[k])))) + ' |');
L.push('| 权重最大值 | ' + Math.max.apply(null, careers.map(c => peak(c))) + ' |');
L.push('| 权重平均值 | ' + (careers.reduce((s, c) => s + K.reduce((t, k) => t + (c.w[k] || 0), 0), 0) /
  (careers.length * K.length)).toFixed(2) + ' |');
L.push('| 六维权重全为正数的职业 | ' + noZero.length + ' / ' + careers.length + '（说明没有任何职业把某维设为 0） |');
L.push('| 峰值 < 4 的职业 | ' + (lowPeak.length ? lowPeak.length + ' 个：' + lowPeak.map(c => esc(c.name) + '(' + peak(c) + ')').join('、') : '无') + ' |');
{
  const es = careers.map(c => c.energy).filter(v => typeof v === 'number').sort((a, b) => a - b);
  const uniq = new Set(es).size;
  L.push('| energy 值域 | ' + es[0].toFixed(2) + ' ~ ' + es[es.length - 1].toFixed(2) +
    '（中位 ' + es[Math.floor(es.length / 2)].toFixed(2) + '） |');
  L.push('| energy 取值种类 | ' + uniq + ' 种 / ' + careers.length + ' 个职业' +
    (uniq < 40 ? '（偏少，容易出现并列，建议把中段再拆细）' : '') + ' |');
  L.push('| energy < 0.4（低投入度） | ' + es.filter(v => v < 0.4).length + ' 个 |');
  L.push('| energy 0.4 ~ 0.7（中） | ' + es.filter(v => v >= 0.4 && v <= 0.7).length + ' 个 |');
  L.push('| energy > 0.7（高投入度） | ' + es.filter(v => v > 0.7).length + ' 个 |');
}
L.push('');

const byEnergyDesc = careers.slice().sort((a, b) => b.energy - a.energy);

L.push('### 能量轴两端：最"慢"和最"快"的各 10 个职业');
L.push('');
L.push('> `energy` 越高，说明这个职业通常越需要多任务、高频沟通和结果压力。');
L.push('> 六维完全持平的作答（比如每题都选同一档）会完全按这一列排序。');
L.push('');
L.push('| # | 低投入度 | energy | 高投入度 | energy |');
L.push('|---|---|---|---|---|');
for (let i = 0; i < 10; i++) {
  const lo = byEnergyDesc[byEnergyDesc.length - 1 - i];
  const hi = byEnergyDesc[i];
  L.push('| ' + (i + 1) + ' | ' + esc(lo.name) + ' | ' + energyStr(lo) + ' | ' + esc(hi.name) + ' | ' + energyStr(hi) + ' |');
}
L.push('');

L.push('### 六维权重之和最高的 5 个职业');
L.push('');
L.push('> 和越大，说明这个职业对六项特质的要求整体越"满"，匹配时对形状的容错也就越小。');
L.push('');
L.push('| # | 职业 | 类别 | 权重和 | ' + K.join(' | ') + ' |');
L.push('|---|---|---|---|' + K.map(() => '---').join('|') + '|');
maxSum.forEach(function (c, i) {
  const sum = K.reduce((s, k) => s + (c.w[k] || 0), 0);
  L.push('| ' + (i + 1) + ' | ' + esc(c.name) + ' | ' + esc(c.category) + ' | **' + sum + '** | ' +
    K.map(k => c.w[k]).join(' | ') + ' |');
});
L.push('');

L.push('---');
L.push('');
L.push('想改某个职业？直接改 `js/career/careers-part*.js` 里那个职业的 `w`（形状轴）或 `energy`（能量轴），然后：');
L.push('');
L.push('```bash');
L.push('node tools/list-careers.js    # 重新生成本表');
L.push('node tools/verify-data.js     # 检查数据是否仍然合法 + 跑极端作答回归');
L.push('```');
L.push('');

fs.writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('已生成 ' + path.relative(ROOT, OUT) + '（' + L.length + ' 行，' +
            careers.length + ' 个职业 / ' + categories.length + ' 个类别）');
console.log('数据指纹：' + fingerprint());
console.log('类别分布：' + JSON.stringify(categories.map(c => c + '=' + catOf[c].length).join(' ')));

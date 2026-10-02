# 长留玉 · 轻娱乐小站

一个**纯前端、零依赖、可直接静态托管**的轻娱乐小站。移动端优先，PC 端居中显示 420px 卡片。

站内内容**按模块组织**，目前有「测试」和「小游戏」两个模块；测试模块下挂着「你适合什么样的职业」（霍兰德 RIASEC 职业兴趣模型，精简版 30 题 / 全量版 120 题，配套 108 个职业的匹配库）。

> **免责声明：所有内容仅供娱乐，不构成专业建议。**
>
> **配套文档**：
> - [`ALGORITHM.md`](./ALGORITHM.md)——「六维分值 → 职业匹配」的双轴模型推导，为什么不能只用形状轴，手算案例与参数速查表。
> - [`CAREERS.md`](./CAREERS.md)——全部 108 个职业的六维权重 + energy 总表（按类别分组 + 各维度 Top10 + 能量两端），改职业库后由脚本重新生成。

---

## 一、站点结构

三级，**「模块 → 条目 → 内容」**，加新东西不用改导航代码：

```
首页 index.html            只列「模块」，一个模块一张卡
   │
   ├─ 测试模块 →  tests/index.html   列出该模块下的所有测试
   │                 │
   │                 └─ 你适合什么样的职业 → career/index.html → test.html → result.html
   │
   └─ 小游戏模块 → games/index.html  列出该模块下的小游戏
                     │
                     └─ （待挂载）
```

设计要点：

- **模块列表页是通用模板**。`tests/index.html` 和 `games/index.html` 结构完全一样，只差 `<body data-clj-module="tests">` 这一个属性；`js/module.js` 靠它去 `config.js` 里取对应模块来渲染。所以**加一个新模块 = 加一条 config + 复制一份 12 行的 HTML 壳**，不用写新 JS。
- **卡片链接一律用 `CLJ_ASSET(path + 'index.html')`**（返回基于站点根目录的绝对地址），所以配置里的 `path` 永远写相对**站点根**的路径（如 `career/`），不用管页面在几层深。
- **`MODULES` 是唯一事实源**。`config.js` 会在加载时派生出 `CONFIG.ALL_ITEMS`（全部条目拍平）和 `CONFIG.TESTS`（只要测试类条目），老代码读 `CONFIG.TESTS` 一行都不用改。

---

## 二、快速开始

项目是纯静态文件，**必须通过 HTTP 访问**（直接双击打开的 `file://` 协议下，浏览器会限制 localStorage 与 Canvas 导出图片）。

任选一种起服务的方式：

```bash
# 方式 1：项目自带的极简服务器（推荐，零依赖）
node tools/preview-server.js            # → http://127.0.0.1:5173/
node tools/preview-server.js 8080       # 换端口

# 方式 2：Python
python -m http.server 5173

# 方式 3：Node
npx serve .
```

然后浏览器打开 `http://127.0.0.1:5173/`。手机上调试可以把手机和电脑连同一个 Wi-Fi，用电脑内网 IP 访问（如 `http://192.168.1.5:5173/`，需要把 `preview-server.js` 的第二个参数改成 `0.0.0.0`）。

---

## 三、目录结构

```
/
├── index.html                     首页：品牌主视觉 + 模块卡片
├── README.md
├── css/
│   ├── global.css                 设计变量 + 通用组件（换肤只改这里）
│   ├── site.css                   首页 + 模块列表页样式（主视觉、模块卡、条目卡）
│   └── quiz.css                   测试通用样式（开始页 / 答题页 / 结果页 / 保存遮罩）
│                                  两个测试共用，**不用为第二个测试复制一份**
├── js/
│   ├── config.js                  ★ 全站配置：品牌、路径、模块清单（唯一事实源）
│   ├── global.js                  公共工具：存储、IP 图、Toast
│   ├── home.js                    首页逻辑：渲染模块卡片
│   ├── module.js                  模块列表页逻辑：渲染模块下的条目卡片
│   ├── qr.js                      零依赖二维码编码器（结果图片里那个码）
│   ├── poster.js                  ★ 结果海报渲染器（两个测试共用）
│   │                              调用方只交一份「内容描述」，画布细节都在这里
│   ├── career/
│   │   ├── questions-light.js     精简版题库（30 题）
│   │   ├── questions-full-part1.js ~ part4.js   全量版题库（120 题，每份 30 题）
│   │   ├── careers-part1.js ~ part4.js          职业库（108 个，每份 27 个）
│   │   ├── scoring.js             ★ 计分、双轴匹配、点评文案池
│   │   ├── data.js                数据访问层 + 数据自检
│   │   ├── start.js               开始页逻辑（选版本）
│       ├── test.js                答题页逻辑（进度、上下题、存档）
│       └── result.js              结果页逻辑（渲染 + 分享图）
├── tests/
│   └── index.html                 测试模块列表页（data-clj-module="tests"）
├── games/
│   └── index.html                 小游戏模块列表页（data-clj-module="games"）
├── career/
│   ├── index.html                 职业测试开始页
│   ├── test.html                  答题页
│   └── result.html                结果页
├── tools/
│   ├── preview-server.js          本地预览服务器（Node 运行，不参与线上）
│   ├── list-careers.js            生成 CAREERS.md（职业库权重总表）
│   ├── explain-match.js           算法追踪器：逐步打印维度→职业的中间量
│   ├── verify-qr.js               二维码自检：独立解码器还原 + 可选与参考库比对
│   ├── verify-poster.js           结果图片端到端：从画布像素里抠出二维码逐格比对
│   ├── verify-data.js             数据自检：题库/职业库/计分匹配/点评文案池
│   ├── verify-quiz.js             交互自检：自动跳题/回退/末题确认/存档
│   └── verify-pages.js            页面自检：语法/引用/DOM id/脚本顺序/模块清单
├── ALGORITHM.md                   匹配算法说明（数学推导 + 手算案例）
├── CAREERS.md                     职业库权重总表（自动生成）
└── assets/
    ├── ip.png                     IP 图案（紫色版，替换成你自己的即可）
    └── ip-jade.png                同款青玉原色版，想换风格时改 config.js 一行
```

> `css/site.css` 是从 `css/quiz.css` 里拆出来的：原来的首页主视觉（`.home-hero`）和当时还叫 `.test-card` 的条目卡，都只被首页用，混在「职业测试专属样式」里名不副实。现在首页只加载 `global.css + site.css`，不再拖着整套测试样式。

---

## 四、部署

> **当前线上地址**：<https://lalapua.github.io/changliuyu/> —— 托管在 GitHub Pages，源为 `main` 分支根目录。

### GitHub Pages（本项目当前用的方式）

1. Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main` + `/ (root)`；
2. 等一两分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

仓库根目录有一个空的 **`.nojekyll`**：GitHub Pages 默认会拿 Jekyll 过一遍站点，我们的文件虽然不以下划线开头、不会被吞，但关掉它更省心，也避免以后加了带下划线的目录被静默忽略。

> 项目里所有资源路径都是相对路径，并且 `js/config.js` 会用当前脚本的 `src` 反推站点根目录，所以部署在**子路径**（如 GitHub Pages 的 `/仓库名/`）下也能正常工作，不需要改任何配置。这一点已经在线上实测过：首页两张模块卡的 `href` 会正确解析成 `…/changliuyu/tests/index.html`。

### Vercel

1. 把整个目录推到 GitHub；
2. Vercel → **Add New Project** → 选这个仓库；
3. Framework Preset 选 **Other**，Build Command 留空，Output Directory 填 `.`；
4. Deploy。完成。

或者不用 Git，直接 `npm i -g vercel` 然后在项目目录执行 `vercel`，一路回车。

### Netlify

- **拖拽部署**：打开 <https://app.netlify.com/drop>，把整个项目文件夹拖进去，几秒钟就拿到网址。
- **Git 部署**：连仓库，Build command 留空，Publish directory 填 `.`。

### 其它

任何静态托管都行（Cloudflare Pages、对象存储 + CDN、自己的 Nginx）。只要保证目录结构原样上传即可。

---

## 五、增加内容

整站是「模块 → 条目」两层配置驱动，**加内容不用写任何导航代码**。

### 情况 A：往「测试」模块里加一个测试

以新增「你的天赋是什么」为例。

**第 1 步：复制目录**

```
复制 /career/     →  /talent/        （三个页面壳）
复制 /js/career/  →  /js/talent/     （题库 / 结果库 / 计分 / 页面逻辑）
```

**不用复制 CSS，也不用复制海报渲染器** —— `css/quiz.css`（三件套版式）和
`js/poster.js`（结果海报，含雷达图与二维码）都是两个测试共用的。
新测试的结果页只需要写一个 `posterSpec()`，把数据翻译成一份内容描述：

```js
function posterSpec() {
  return {
    subtitle: '测试名 · 版本',
    head: '大字',                       // 代码 / 组合 / 档位名
    headLabel: '大字右侧的小标签',
    lead: { label: '主结果标题', name: '主结果', badge: '95%', desc: '一句话' },
    radar: { keys: KEYS, pct: 分值表, nameOf: k => 名称(k) },
    sections: [{ label: '区块名', rows: [{ name: '条目', meta: '灰字', value: '95%' }] }],
    qr: { url: CLJ_POSTER.qrUrl(), title: '标语', sub: '副标语' },
    footerLine: '万物皆有回响',
    disclaimer: CFG.DISCLAIMER
  };
}
```

海报的版式、雷达图轴数、二维码风格全部由 `poster.js` 决定，调用方不碰画布。

**第 2 步：改题库**

打开 `js/talent/questions-light.js`，把 `window.CLJ_QUESTIONS_LIGHT` 换成你自己的命名空间：

```js
window.TALENT_QUESTIONS = (window.TALENT_QUESTIONS || []).concat([
  { id: 't001', dims: { A: 1 }, text: '……' },
  { id: 't002', dims: { I: 1 }, text: '……' }
]);
```

维度键可以沿用 R/I/A/S/E/C，也可以自定义 6 个（语言 / 逻辑 / 空间 / 音乐 / 身体 / 人际）。**换维度要同步改 `js/talent/scoring.js` 的 `DIMS`** —— 雷达图、维度条、结果解读、点评文案池全部从它读取，改完自动生效。

**第 3 步：改结果库**

把 `js/talent/careers-part*.js` 换成你的结果库，字段保持一致，**别忘了 `energy`（0~1，双轴匹配的能量轴）**：

```js
window.TALENT_RESULTS = (window.TALENT_RESULTS || []).concat([
  {
    id: 'r001', name: '语言天赋型', category: '表达类',
    desc: '……', skills: ['……', '……', '……'], env: '……',
    w: { R: 1, I: 2, A: 4, S: 5, E: 3, C: 2 },
    energy: 0.6
  }
]);
```

**第 4 步：改 HTML 的 script 引用**

把 `talent/*.html` 里的 `../js/career/...` 批量替换成 `../js/talent/...`。
`css/quiz.css`、`js/qr.js`、`js/poster.js` 保持不动 —— 它们是共用的。

**第 5 步：在 config 里把条目挂上去**

打开 `js/config.js`，在 `MODULES` 里 `id: 'tests'` 那个模块的 `items` 中，把占位的 `talent` 改成 `online: true` 并填好文案：

```js
{
  id: 'talent', name: '你的天赋是什么', subtitle: '6 维天赋模型',
  intro: '有些能力你以为人人都会，其实那是别人没有的。',
  path: 'talent/',                   // ← 相对【站点根】，不是相对当前页面
  count: '30 题', minutes: '约 4 分钟',
  online: true, accent: 'cyan'       // ← 改成 true，模块页卡片立刻可点
}
```

`tests/index.html`（模块页）和结果页的「你可能还想测」都会自动列出来，**不用改任何 HTML**。

**第 6 步：跑自检**

```bash
node tools/verify-data.js     # 题库/结果库结构、计分匹配、极端作答回归
node tools/verify-pages.js    # 会检查 items 里的 path 是否真实存在
```

### 情况 B：挂一个小游戏

小游戏不需要题库，只要是一份能独立打开的纯前端页面就行。

1. 把游戏目录放到站点根下，例如 `/lamp/`，入口 `lamp/index.html`（页面内用相对路径引用自己的资源即可）。
2. 在 `js/config.js` 的 `MODULES` 里找到 `id: 'games'` 的模块，往 `items` 加一条：

```js
{
  id: 'lamp', name: '一笔亮灯', subtitle: '一笔画解谜',
  intro: '一次画完所有灯，不能回头。',
  path: 'lamp/', online: true, accent: 'cyan'
  // 小游戏不填 count / minutes —— 模块页不会渲染「题数 / 预计」那一行
}
```

`js/module.js` 会按 `kind === 'game'` 自动把按钮文案切成「开始玩」，并跳过「题数 / 预计」那块。

### 情况 C：开一个全新的模块

1. 在 `js/config.js` 的 `MODULES` 里加一条，`path` 指向新模块列表页的目录：

```js
{
  id: 'tools', kind: 'tool', name: '小工具', en: 'TOOLS',
  intro: '一句话说明这个模块到底是什么。',
  path: 'tools/', accent: 'amber', online: true,
  items: [ /* 条目格式同上面的情况 A / B */ ]
}
```

2. 复制 `tests/index.html` 成 `tools/index.html`，把 `<body data-clj-module="tests">` 改成 `tools`，再把 `<title>` 和 description 改一下。

**就这两步，不用写新 JS** —— `js/module.js` 是通用模板，它靠 `body` 上的 `data-clj-module` 决定渲染哪个模块。别忘了第 3 步：把新页面加进 `tools/verify-pages.js` 第 [5] 节那个页面数组（那是防品牌名硬编码的检查列表）。

> 首页模块卡片上的徽标会自己算：模块 `online` 为 false → 「即将上线」；有在线条目 → 「N 项」；否则 → 「筹备中」。

---

## 六、改品牌 / 图案 / 颜色 / 字体

### 品牌名

全站只有一个来源：`js/config.js`

```js
BRAND: '长留玉',
BRAND_EN: 'CHANG LIU YU',
SLOGAN: '万物皆有回响',
DISCLAIMER: '仅供娱乐，不构成专业建议。'
```

页面里凡是 `data-clj-brand` / `data-clj-brand-en` / `data-clj-slogan` / `data-clj-disclaimer` 标记的地方，都会在加载时被自动替换成这里的文案。改一处，全站生效。

### 首页主视觉（logo + 拼音字标）

导航页顶部刻意「去中文大标题化」：主视觉只留 logo，中文品牌名退成**右上角一枚极小的落款**，正标题换成拼音字标。

```html
<header class="home-hero">
  <span class="home-hero__seal" data-clj-brand>长留玉</span>              <!-- 右上角极小落款 -->
  <span class="home-hero__ip" data-clj-ip="xl"></span>                    <!-- 主视觉 logo -->
  <h1 class="home-hero__wordmark" data-clj-brand-en>CHANG LIU YU</h1>     <!-- 拼音字标 -->
  <div class="home-hero__rule" aria-hidden="true"></div>                  <!-- 细分隔线 -->
  <p class="home-hero__sub" data-clj-slogan></p>                         <!-- slogan -->
</header>
```

样式在 `css/quiz.css` 的「1. 首页」段：

- `.home-hero__wordmark`——细字重（400）+ `letter-spacing: 0.4em` + 冷调渐变文字。`text-indent` 与 `letter-spacing` 取值相同，用来抵消末字后多出的那份字距，否则整行会视觉偏左半个字距。
- `.home-hero__seal`——10px / 0.4em 字距 / 60% 不透明度，绝对定位在右上角。
- 想让中文名重新变大变显眼，把 `.home-hero__seal` 的字号调大、去掉它的 `position: absolute` 即可（去掉后它会回到 logo 下方、恢复成居中排版）。

### IP 图案

把新的图片覆盖到 `assets/ip.png` 即可。路径定义在 `config.js`：

```js
IP_IMAGE_PATH: './assets/ip.png'
```

页面里所有 `data-clj-ip` 占位节点会被自动换成圆形头像框：

```html
<span data-clj-ip="xl"></span>   <!-- 可选尺寸：sm 28px / md 56px / lg 88px / xl 140px -->
```

**图片不存在时不会报错**：`global.js` 里的 `onerror` 会把 `<img>` 摘掉，换成一个渐变色圆 + 「玉」字的占位符。

### 颜色 / 圆角 / 间距 / 动效时长

全部集中在 `css/global.css` 顶部的 `:root`。改强调色只需动三个变量：

```css
--accent:   #6C5CE7;   /* 主色 */
--accent-2: #8B7CF6;
--accent-3: #A78BFA;
```

想换浅色主题，把 `--bg / --card / --text` 这几组翻转一下即可，其余样式全部引用变量，不会花。

### 字体

同样在 `:root`：

```css
--font: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display",
        "PingFang SC", "Microsoft YaHei", sans-serif;
```

想上自定义网络字体，加一行 `@font-face` 再把 `--font` 的第一个值换成你的字体名。

---

## 七、调题目数量 / 选项文案 / 计分规则

### 题目数量

- **精简版**：改 `js/career/questions-light.js` 里的条目数，然后同步改 `js/career/data.js` → `VERSIONS.light.count`（首页和开始页显示的数字）。
- **全量版**：改 `questions-full-part*.js`。**每维题数必须相等**，否则某些维度天生吃亏。比如 120 题就是 6 维 × 20 题。加题时建议保持「按 R→I→A→S→E→C 循环」的顺序，用户在答题时不会察觉规律。
- 想加一个「中量版 60 题」：在 `VERSIONS` 里加一项 `{ id:'mid', label:'中量版', badge:'60 题', count:60, ... }`，再写一份 `questions-mid.js`，`data.js` 的 `normalizeVersion()` 会自动认它。

### 选项文案

在 `js/career/scoring.js` 里：

```js
var OPTIONS = [
  { value: 1, label: '完全不这样', tone: '极低' },
  { value: 2, label: '不太这样',   tone: '偏低' },
  { value: 3, label: '一般',       tone: '中性' },
  { value: 4, label: '比较这样',   tone: '偏高' },
  { value: 5, label: '这简直就是我', tone: '极高' }
];
```

改成 4 级或 7 级也可以，但**必须保证中位数是 3**，或者同步修改 `computeScores()` 里 `(v - 3)` 的那个 3。注意 `value` 必须是连续整数，答题页的键盘快捷键（1~5）是按 value 绑定的。

### 维度点评文案

结果页「维度明细」每行那句点评（如"中等偏好，平时够用，但不必当成主线。"）来自 `scoring.js` 里的两个文案池，**只出现在全量版**：

```js
COMMENT_GENERIC  // 通用池：每档 8 条，任何维度都能用
COMMENT_BY_DIM   // 专属池：每个维度每档 2 条，只给这一维用
```

分档：`≥80 / 65-79 / 50-64 / 35-49 / <35`，也就是 `COMMENT_BANDS`。

取词规则（`dimComment()`）：

```js
seed = hash(档位 + '#' + 分值)        // 起点：同一份结果永远同一个起点
pool = seed % 3 === 0 ? 专属池 : 通用池
idx  = (seed + 维度序号) % pool.length
```

- **起点只看「档位 + 分值」**，所以同一份结果刷新多少次都是同一句话，不会改口；
- **下标再加一个「维度序号」**，同一个分值下六个维度的序号 0~5 各不相同，而池子至少有 6 条，于是六个维度必然落在六个不同位置上，不会出现"两行点评一字不差"。加文案时**每档至少留 6 条**，否则这条保证会被破坏。

加文案直接往池子里塞就行，`tools/verify-data.js` 会自动检查：每档 6 个维度是否取到 6 种说法、同分值重复调用是否稳定、文案长度是否在 10~46 字、结尾有没有标点。

### 计分规则

核心在 `js/career/scoring.js` 的 `computeScores()`：

```
raw[d] = Σ (v_i - 3) × w_i            // 每题把自己的分数贡献到它命中的维度
range[d] = Σ 2 × w_i                  // 该维度的理论极值
pct[d] = clamp(50 + 50 × raw[d] / range[d], 1, 99)
```

- 想让某个维度在结果里更"抢眼"，把该维度题目的 `dims` 权重从 `1` 调到 `1.5`；
- 想加"反向计分题"（选了 5 反而说明该维度低）：把权重写成负数，如 `dims: { C: -1 }`；
- `range` 是自动累加的，**加题、改题都不用改常数**。

### 职业/结果匹配规则（双轴模型）

同一个文件里的 `matchCareers()`。一个用户的六维画像被拆成**两条独立的轴**：

| 轴 | 用户侧 | 职业侧 | 比什么 |
|---|---|---|---|
| **形状轴** | `Us = U - mean(U)` | `Js = w/5 - mean(w/5)` | 相对偏好结构（哪几维高于自己的平均） |
| **能量轴** | `mU = mean(pct/100)` | `mJ = career.energy` | 整体投入度 / 节奏 / 活跃度 |

```
形状分 = (cos(Us, Js) + 1) / 2        // 皮尔逊相关系数 -1~1 映射到 0~1
能量分 = 1 - |mU - mJ|
score  = 0.7 × 形状分 + 0.3 × 能量分
显示匹配度 = 60 + 35 × (score - min) / (max - min)     // min/max 取本次作答的全库值
```

**为什么必须两条轴**：形状用皮尔逊相关系数算，而相关系数**对整体平移完全不敏感** —— 全选 1、全选 2、全选 3 三种极端作答，六维数值不同（1 / 25 / 50）但中心化后都是零向量，旧方案下三者结果**一模一样**。补上能量轴后，低投入的用户推"慢"职业、高投入的用户推"快"职业，五档结果完全不同。

**为什么形状占 0.7**：职业选择的决定性因素是方向，能量只是调节项。一个人 A 高 C 低，去当审计师就是错的，哪怕投入度完全匹配。

**六维方差 < `FLAT_VAR`（0.0012，≈ 百分制标准差 3.5 分）时形状分给中性的 0.5**：它对所有职业一样、不影响排序，于是排序完全交给能量轴 —— 没有形状可谈，就按投入度配。同时结果页会切换成「兴趣分布均匀」专用文案（`S.uniformProfile()`），并用投入等级替代没有意义的霍兰德代码。

> 这个阈值**只能收紧不能放松**。它同时决定了「结果页显示霍兰德代码还是投入等级」，一旦设松（曾经用过 0.01 ≈ std 10 分），大量正常作答会被误判成持平、霍兰德代码被换掉。`verify-data.js` 里有一条回归断言把误判率压在 1% 以下。

想调整观感：改 `score` 的两个系数（0.7 / 0.3）、`FLAT_VAR`、或拉伸区间的 `60 + 35`。想要「同类职业不霸榜」，改 `catCount` 那个 `>= 2` 的阈值。完整的推导与手算案例见 [`ALGORITHM.md`](./ALGORITHM.md)。

> **同好百分比已整体下线**（结果页的「XX% 的人和你拿到了同一个结果」和分享图里的对应内容都删了）。原来的 `peerSignature` / `simulatedPeerPercent` / `getPeerPercent` 和 `window.CLJ_PEERS_PROVIDER` 钩子一并从 `scoring.js` 移除，避免留无人调用的死代码。将来若接入真实统计，请重新实现这一层，而不是只恢复 UI。

---

## 八、结果图片的实现

**单一的自绘 Canvas 渲染器，零外部依赖。** 整条 html2canvas 路线已经拆掉，理由：

1. 它要联网从 CDN 拉 200KB，断网或内网环境下这一整条路直接作废；
2. 它把 DOM 克隆进 iframe 再截图，画面里只要有一张跨域图片就会**污染画布**，之后 `toBlob` 抛 `SecurityError`，图必然存不下来 —— 之前线上报「生成图片失败」正是这个原因；
3. 为了让它的渲染结果正确，还得额外维护一整套 `.poster` 样式，两处容易走散（那套样式也一并删了）。

现在只有一条路：

```
drawPoster()      840px 宽 × 2 倍图，按内容画完再裁掉多余高度
  ├── 背景渐变 + 顶部光晕
  ├── 品牌行（logo 用 logoCanvas() 几何重绘，不是图片）
  ├── 测试名 / 代码位（六维持平时是投入等级）
  ├── 最佳匹配职业 + 匹配度 + 一句话描述
  ├── drawRadar() 六维雷达图（和页面 SVG 同一套几何，只是换成 canvas 画）
  │     块高由它的返回值决定，不手填常数 —— 底部轴标签是紧贴下边界的，
  │     留不够就会被下一块压住（踩过）
  ├── 「可能也适合」Top2 / Top3 备选职业
  │     这里原来是六条维度条，和雷达图是同一份数据，在分享图上纯属重复
  ├── drawQR()    二维码 → 扫了直接回首页
  └── 页脚：品牌语 + 免责声明
```

**文案上只出现一次品牌名**（品牌行那处）。二维码旁边的标语讲「你能得到什么」（「看看你是哪种职业人」），页脚只留品牌语「万物皆有回响」—— 分享图上反复念名字很啰嗦。

**海报里不放任何 `<img>`**。一旦有跨域图片，画布被污染后 `toBlob` 会抛 `SecurityError`，图就废了。品牌标识和历史那套一样，用路径重绘。交付前还会先 `exportBlob()` 验一次「能不能安全导出」再给用户，避免让人看到一句莫名其妙的失败。

交付顺序：`navigator.share({ files })`（移动端唤起原生分享）→ `<a download>` → 内嵌 iframe 里下载会被静默拦掉，这时把图铺在遮罩层上让用户长按保存。

### 二维码

`js/qr.js` 是自己写的**零依赖二维码编码器**（字节模式 + Reed-Solomon 纠错 + 8 种掩码择优），支持版本 1~9、L/M/Q/H 四个纠错档。二维码里编的地址取自 `config.js` 的 **`SITE_URL`**：

```js
SITE_URL: 'https://lalapua.github.io/changliuyu/',
```

留空则回落到 `BASE_URL`，但**本地预览时 `BASE_URL` 是 127.0.0.1，别人扫出来打不开**，所以正式地址建议写死。

#### 海报上的二维码是「反相 + 圆润」风格

没有白色底板，码直接落在海报的深色背景上；数据点画成圆点、三个定位图形画成圆角环，模块颜色是淡紫→浅蓝的渐变（`#C4B5FD` → `#93C5FD`）。

这不是纯装饰，四条硬约束必须守住，动之前先看清楚：

| 约束 | 做法 | 为什么 |
|---|---|---|
| **极性** | 反相（浅色码点 + 深色底） | ISO/IEC 18004 认可的方案，现代手机相机（iOS 相机、微信、Google Lens）都能识别。**代价**：极少数老旧扫码 App 只认「深色码点 + 白底」 |
| **对比度** | 码点亮度 0.52 vs 背景 0.0034，约 **10.7:1** | 扫码器读的就是明暗差；低于 3:1 基本没戏。`verify-poster.js` 有断言 |
| **静默区** | 码点外留满 4 个模块的**纯背景**，上下各留 32px 不放任何文字线条 | 静默区被污染会直接定位失败 |
| **定位图形** | 严格保持 **1:1:3:1:1** 比例；圆角**只削外沿**，内沿必须方正，半径不超过 1.0 格 | 那是扫码器用来定位的生命线。内沿一旦被圆弧鼓出去，就会把本该留空的 (1,1) 染上墨；外圆角半径超过 1.7 格会啃到角上模块的中心（0.13 格的余量会被抗锯齿吃掉） |

纠错档取 `config.js` 的 `QR_ECC_LEVEL`（默认 **Q**，可扛 25% 破损）—— 圆点造型的墨量只有方块的约 2/3，需要更大的容错余量兜底。

自己写的当然要证明它对。两个自检脚本：

- `node tools/verify-qr.js` —— **自解码**（不依赖外部库）：另写一个解码器读格式信息、反掩码、按蛇形顺序取回码字、解交织、还原文本，解不出原文就是错的。解码器**故意不复用编码器的任何函数**，否则同一个 bug 会同时骗过两侧。装了 `qrcode-generator` 时还会做逐位比对。
- `node tools/verify-poster.js` —— **端到端看像素**：真机点「保存结果图片」，从画布上按海报给出的落点**逐格抠出二维码点阵**与编码结果比对，另外量对比度、静默区、码点中心实心度与整格墨量。二维码错一格就扫不出来，所以必须逐格对，不能抽样。

---

## 九、数据格式速查

### 题目

```js
{ id: 'f001', dims: { R: 1 }, text: '……' }
```
- `id`：全局唯一字符串
- `dims`：`{ 维度键: 权重 }`，主维度权重 1，次要维度 0.5，权重可以是小数或负数
- `text`：15~35 字，第一人称，口语化

### 职业 / 结果条目

```js
{
  id: 'c001',
  name: '软件工程师',
  category: '科技互联网',        // 用于「同类别不霸榜」和卡片标签
  desc: '一句话描述',            // 20~40 字
  skills: ['技能A', '技能B', '技能C'],
  env: '工作环境',               // 15~35 字
  w: { R: 3, I: 5, A: 2, S: 1, E: 2, C: 4 },   // 形状轴：六维权重 0~5 整数
  energy: 0.56                                  // 能量轴：整体投入度 0~1
}
```

- `w` 描述这个职业**长什么样**：看单个数字没意义，要看整行的起伏形状。
- `energy` 描述这个职业**有多忙**：节奏、外向度、多任务程度、结果压力。低（≈0.15~0.4）如数据标注师、图书管理员；中（≈0.45~0.65）如会计、编辑、程序员、教师；高（≈0.75~0.93）如产品经理、公关、销售总监、外科医生。
- **`energy` 是必填**，`tools/verify-data.js` 会检查它存在且在 0~1 内。缺了不会崩（会退回权重的均值），但能量轴就废了一半。

改完职业库记得重跑生成器刷新总表：

```bash
node tools/list-careers.js    # 重新生成 CAREERS.md
```

### 数据文件的可拆分写法

所有题库和结果库文件都用同一套模式：

```js
window.XXX = (window.XXX || []).concat([ /* … */ ]);
```

好处是**引入顺序无关**，也不会互相覆盖，所以：

- 单个文件太大就继续拆 `part5`、`part6`，记得在 HTML 里加上 `<script>` 就行；
- 想临时屏蔽某个文件，直接从 HTML 里删掉那行 `<script>`，其余文件照常工作。

---

## 十、localStorage 键名

| 键 | 内容 |
|---|---|
| `clj_career_version` | 上次选择的版本（light / full） |
| `clj_career_progress` | 进行中的答题进度 `{ version, answers, index, ts }` |
| `clj_career_final` | 答完后的答案快照，结果页读它 |

刷新答题页会自动恢复到「第一道没答的题」，**已经答过的题不会被清空，也不能跳过**。

**答题交互**：选中选项后会自动进入下一题，不需要点「下一题」。延迟值在 `js/career/test.js` 顶部的 `ADVANCE_DELAY`（当前 **150ms**）——不能设成 0，得先让选中高亮显出来，用户才看得清自己选了什么；150ms 是「够看清」和「不拖慢 120 题连答」之间的折中，想更跟手可以降到 100ms 左右，想更从容就调回 250~300ms。**最后一题例外**：不会自动结束，会停在原地等用户点「查看结果」，留一个确认动作。期间若用户手动切题（点按钮 / 按方向键），挂起的自动跳题会被 `cancelAdvance()` 取消，不会出现连跳两题。

想彻底重置，在开始页点「清除上次进度」。

---

## 十一、自检与已知限制

### 自检

```bash
node tools/verify-data.js     # 题库/职业库结构 + 计分匹配算法冒烟测试 + 维度点评文案池
node tools/verify-pages.js    # JS 语法 + 资源引用 + DOM id 接线 + 脚本顺序 + 模块清单
node tools/verify-quiz.js     # 答题交互行为（自动跳题 / 回退 / 末题确认 / 存档）
node tools/verify-qr.js       # 二维码：独立解码器还原原文（+ 可选与参考库逐位比对）
node tools/verify-poster.js   # 结果图片端到端：真机出图 → 从像素抠出二维码逐格比对（需 Chrome）
node tools/explain-match.js   # 不是测试，是「算法追踪器」：逐步打印维度→职业的中间量
node tools/list-careers.js    # 不是测试，是「文档生成器」：刷新 CAREERS.md
```

`explain-match.js` 会把 `matchCareers()` 每一步的中间量原样打出来（中心化结果、单位化结果、逐项乘积、相关系数、`fit` 映射、类别去重结果、以及"只中心化用户向量"的反例对比）。`ALGORITHM.md` 里引用的所有数字都由它产出，改了算法跑一遍就知道文档有没有过期。

`list-careers.js` 从 `careers-part*.js` 读出全部职业，生成 `CAREERS.md`（按类别分组的权重总表 + 形状条 + 各维度 Top10 + 数据健康度）。**`CAREERS.md` 是生成物，不要手改**，改职业库后重跑即可。

`verify-data.js` 检查项：题库 id 连续性、每维题数是否均衡、题干长度与重复、职业库字段完整性（含 `energy` 必填且在 0~1）、类别分布，并用 7 组人设（纯 R / 纯 A / I+R / E+S……）跑一遍计分与匹配，断言强项维度确实高于弱项、最佳职业确实命中强项；接着跑**极端作答回归**（全选 1~5 五种），断言结果类型、Top1 职业、Top3 组合互不相同、全库匹配度极差 ≥ 25、无 NaN；最后检查维度点评文案池（每档 6 个维度是否取到 6 种说法、同分值取词是否稳定、长度与标点是否合规）。

`verify-pages.js` 检查项：所有 JS 文件语法、每个页面引用的 css/js 是否真实存在、JS 里用到的每个 `#id` 在对应页面是否有对应元素（改 HTML 时最容易踩的坑）、**`config.js` 的模块清单与磁盘目录是否对得上**（模块列表页 + 每个条目的 `path/index.html`）、脚本引入顺序是否正确、各页面有没有把品牌名写死。

任何一个测试页面在控制台也会打印同一份数据自检结果，方便随手发现问题。

### 结果图片是怎么生成的

三级降级，任何一级成功即交付：

| 级别 | 做法 | 依赖 |
|---|---|---|
| ① `html2canvasPoster()` | html2canvas 渲染真实 DOM（含雷达图），`scale: 2` 出高清图 | 需联网加载 CDN |
| ② `localPoster()` | 本地 Canvas 手绘海报（840×1400，2 倍图） | 零依赖，断网也能出图 |
| ③ 都失败 | 把真实原因翻译成人话写进提示条 | — |

**每一级都必须产出「能被安全导出的 canvas」才算通过**：被跨域图片污染过的画布调用 `toBlob` / `toDataURL` 会直接抛 `SecurityError`，那画布等于废的，必须在交付之前就验出来（`exportBlob()` 就是干这个的）。

所以海报里**刻意不放任何 `<img>`** —— 品牌标识是 `logoCanvas()` 几何重绘出来的 `<canvas>`（见 `logoElement()`），画布永远是干净的，这也是原先最容易出问题的地方。

**保存不下来的常见原因**：

| 现象 | 原因 | 处理 |
|---|---|---|
| 提示「图片生成失败（外部依赖加载失败）」 | html2canvas 的 CDN 被拦 | 会自动降级到本地 Canvas；两级都挂就直接用「复制链接」 |
| 提示「图片生成失败（画布被跨域内容污染）」 | 海报里混进了跨域图片 | 把 `buildPoster()` 里的图片换成本地图，或改用 `logoElement()` |
| 提示「图片生成失败（画布过大，内存不足）」 | 低端机内存不够 | 把 html2canvas 的 `scale` 从 2 降到 1 |
| 点了没反应，而是弹出大图遮罩 | 在 iframe 预览 / 微信内置浏览器里 `<a download>` 会被静默拦掉 | **这是预期行为**：`showImageOverlay()` 把图铺出来让用户长按保存 |

完整失败原因链会打进控制台（`console.error` / `console.info`），排查先看那里。按钮有 20 秒兜底，任何环节卡死都不会让它永远停在「正在生成…」。

### 已知限制

- **真实统计数据未接入**，页面上的「XX% 的人和你一样」是本机模拟值，已明确标注。
- 结果页直接分享链接**不会带上结果**（答案存在访问者自己的 localStorage 里），对方打开会回到开始页。要做「点开链接直接看结果」，需要把答案编码进 URL 或接一个短链后端。
- 首次加载 html2canvas 需要联网（约 200KB，按需加载，不影响首屏）。不联网时会自动走本地 Canvas 方案，功能不受影响。

---

**长留玉 · 万物皆有回响**
仅供娱乐，不构成专业建议。

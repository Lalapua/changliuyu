/* ============================================================
 * 长留玉 · 页面一致性自检（Node 运行，不参与线上）
 * ------------------------------------------------------------
 * 检查所有 HTML 与 JS 之间的接线是否正确：
 *   1. 每个 JS 文件语法是否合法
 *   2. <script src> / <link href> 指向的文件是否存在
 *   3. JS 里用到的 #id 是否在对应页面的 HTML 里真的存在
 *   4. 页面是否具备必要的品牌 / 免责声明占位
 *   5. 每个页面引入的脚本顺序是否正确（config → global → …）
 *
 * 运行：node tools/verify-pages.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let fail = 0;
function ok(msg)   { console.log('  ✓ ' + msg); }
function bad(msg)  { console.log('  ✗ ' + msg); fail++; }
function warn(msg) { console.log('  ! ' + msg); }

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

/* ------------------------------------------------------------
 * 0. 收集全部 js / html
 * ---------------------------------------------------------- */
function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  });
  return out;
}
const all = walk(ROOT);
/* tools/ 下的东西不参与线上，也不受页面规范约束：
 * 自检脚本本身是 node 脚本，审阅页（review-*.html）是给内容校对用的
 * 临时页面，它不加载 config.js、也不需要品牌占位 —— 一并排除。 */
const isTool = f => f.startsWith('tools/');
const jsFiles = all.filter(f => f.endsWith('.js') && !isTool(f));
const htmlFiles = all.filter(f => f.endsWith('.html') && !isTool(f));

/* ------------------------------------------------------------
 * 1. JS 语法
 * ---------------------------------------------------------- */
console.log('\n[1] JavaScript 语法检查');
jsFiles.forEach(f => {
  try {
    new vm.Script(read(f), { filename: f });
    ok(f);
  } catch (e) {
    bad(f + ' → ' + e.message);
  }
});

/* ------------------------------------------------------------
 * 2. HTML 资源引用是否存在
 * ---------------------------------------------------------- */
console.log('\n[2] HTML 资源引用检查');
htmlFiles.forEach(page => {
  const html = read(page);
  const base = path.posix.dirname(page);
  let n = 0, bads = [];

  (html.match(/<script[^>]+src="([^"]+)"/g) || []).forEach(tag => {
    const src = /src="([^"]+)"/.exec(tag)[1];
    if (/^https?:/.test(src)) { n++; return; }
    const target = path.posix.normalize(path.posix.join(base, src));
    n++;
    if (!exists(target)) bads.push(src);
  });
  (html.match(/<link[^>]+href="([^"]+)"/g) || []).forEach(tag => {
    const href = /href="([^"]+)"/.exec(tag)[1];
    if (/^https?:/.test(href)) { n++; return; }
    const target = path.posix.normalize(path.posix.join(base, href));
    n++;
    if (!exists(target)) bads.push(href);
  });

  if (bads.length) bad(page + ' 缺少文件：' + bads.join(', '));
  else ok(page + '（' + n + ' 个引用全部存在）');
});

/* ------------------------------------------------------------
 * 3. JS 里的 #id 选择器 vs 页面 HTML 的 id
 * ---------------------------------------------------------- */
console.log('\n[3] DOM id 接线检查');

/** 解析页面引入了哪些本地 js */
function scriptsOf(page) {
  const html = read(page);
  const base = path.posix.dirname(page);
  const out = [];
  (html.match(/<script[^>]+src="([^"]+)"/g) || []).forEach(tag => {
    const src = /src="([^"]+)"/.exec(tag)[1];
    if (/^https?:/.test(src)) return;
    const target = path.posix.normalize(path.posix.join(base, src));
    if (exists(target)) out.push(target);
  });
  return out;
}

/** 收集 HTML 里出现的所有 id */
function idsOf(page) {
  const html = read(page);
  const set = new Set();
  (html.match(/\sid="([^"]+)"/g) || []).forEach(m => set.add(/id="([^"]+)"/.exec(m)[1]));
  return set;
}

/** 收集 JS 里用到的 #id 选择器
 *  只认真正的选择器调用，避免把 SVG 里的颜色字面量（"#A78BFA"）误判成 id */
function selectorsIn(code, set) {
  const CALLS = /\b(?:qs|qsa|querySelector|querySelectorAll|closest|matches|getElementById)\(\s*(['"])([^'"]+)\1/g;
  let m;
  while ((m = CALLS.exec(code))) {
    const sel = m[2];
    if (sel.charAt(0) === '#') set.add(sel.slice(1));
  }
  // 动态拼接的 id：CLJ.qs('#' + name) 之类不处理，属于运行时行为
  return set;
}

/** 页面里 <script> 内联代码也算进依赖 */
function pageContext(page) {
  const files = scriptsOf(page);
  const html = read(page);
  const inline = [];
  (html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g) || []).forEach(block => {
    inline.push(block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
  });
  const set = new Set();
  function harvest(code) { selectorsIn(code, set); }
  files.forEach(f => harvest(read(f)));
  inline.forEach(harvest);
  return { files, selectors: set, inline };
}

htmlFiles.forEach(page => {
  const ctx = pageContext(page);
  const ids = idsOf(page);

  // global.js 会在运行时动态创建 toast 容器，result.js 会动态创建保存图片的遮罩层
  const DYNAMIC = new Set(['clj-toast', 'clj-save-overlay']);

  const missing = [...ctx.selectors].filter(id => !ids.has(id) && !DYNAMIC.has(id));
  if (missing.length) {
    bad(page + ' 用到了不存在的元素：' + missing.map(i => '#' + i).join(', '));
  } else {
    ok(page + ' 的 ' + ctx.selectors.size + ' 个 id 引用全部有对应元素');
  }

  // 品牌 / 免责声明占位
  const html = read(page);
  if (html.includes('data-clj-brand') && html.includes('data-clj-disclaimer')) {
    ok(page + ' 含有品牌与免责声明占位');
  } else {
    bad(page + ' 缺少 data-clj-brand 或 data-clj-disclaimer 占位');
  }

  // 脚本顺序：config 必须第一，global 第二
  const local = ctx.files;
  if (local.length) {
    if (!/js\/config\.js$/.test(local[0])) bad(page + ' 第一个脚本不是 config.js（当前 ' + local[0] + '）');
    else if (local.length < 2 || !/js\/global\.js$/.test(local[1])) bad(page + ' 第二个脚本不是 global.js');
    else ok(page + ' 脚本顺序正确');
  }
});

/* ------------------------------------------------------------
 * 4. config.js 的模块清单与磁盘目录是否对得上
 * ---------------------------------------------------------- */
console.log('\n[4] config.js 模块清单 vs 实际目录');
const cfgCtx = { window: {}, console, document: undefined };
vm.createContext(cfgCtx);
// config.js 里会用 document.currentScript，这里给个安全替身
cfgCtx.document = { currentScript: null };
vm.runInContext(read('js/config.js'), cfgCtx, { filename: 'js/config.js' });
const CFG = cfgCtx.window.CLJ_CONFIG;

const mods = (CFG && CFG.MODULES) || [];
mods.forEach(m => {
  const mIdx = m.path + 'index.html';
  if (m.online) {
    if (exists(mIdx)) ok(m.name + '（模块） → ' + mIdx + ' 存在');
    else bad(m.name + '（模块）标记为 online，但 ' + mIdx + ' 不存在');
  } else {
    warn(m.name + '（模块）标记为「即将上线」，' + (exists(mIdx) ? '目录已存在' : '目录尚未创建（正常）'));
  }
  (m.items || []).forEach(it => {
    const idx = it.path + 'index.html';
    if (it.online) {
      if (exists(idx)) ok(it.name + '（条目） → ' + idx + ' 存在');
      else bad(it.name + '（条目）标记为 online，但 ' + idx + ' 不存在');
    } else {
      warn(it.name + '（条目）标记为「即将上线」，' + (exists(idx) ? '目录已存在' : '目录尚未创建（正常）'));
    }
  });
});

/* ------------------------------------------------------------
 * 5. 首页 / 结果页列表是否由 config 驱动（无人为硬编码测试名）
 * ---------------------------------------------------------- */
console.log('\n[5] 硬编码检查（防止改品牌后漏改）');

/** 找出某个位置所在的标签；正处在标签内部就返回该标签，处在文本节点就返回包裹它的开标签 */
function enclosingTag(body, pos) {
  const before = body.slice(0, pos);
  const lastGt = before.lastIndexOf('>');
  const lastLt = before.lastIndexOf('<');
  if (lastLt > lastGt) return before.slice(lastLt);            // 在标签内部
  const openLt = before.lastIndexOf('<', lastGt);
  if (openLt < 0) return '';
  return before.slice(openLt, lastGt + 1);
}

['index.html', 'tests/index.html', 'games/index.html', 'career/index.html', 'career/test.html', 'career/result.html'].forEach(page => {
  // 这两个模块页由同事并行创建，落地前先跳过、报一声，免得整段崩溃
  if (!exists(page)) { warn(page + ' 尚未创建（等待同事落地，跳过硬编码检查）'); return; }
  const body = read(page).replace(/<!--[\s\S]*?-->/g, '');
  let pos = -1, total = 0, covered = 0, bare = [];
  while ((pos = body.indexOf('长留玉', pos + 1)) >= 0) {
    total++;
    // 标签里带 data-clj-brand 的属于「渐进增强兜底文案」，会被 JS 覆盖，不算硬编码
    if (/data-clj-brand/.test(enclosingTag(body, pos))) covered++;
    else bare.push('第 ' + (body.slice(0, pos).split('\n').length) + ' 行');
  }
  if (!bare.length) {
    ok(page + ' 品牌名 ' + total + ' 处全部走 config（' + covered + ' 处为 data-clj-brand 兜底文案）');
  } else {
    warn(page + ' 有 ' + bare.length + ' 处品牌名未被 data-clj-brand 接管：' + bare.join('、'));
  }
});

/* ------------------------------------------------------------
 * 汇总
 * ---------------------------------------------------------- */
console.log('\n' + '='.repeat(48));
if (fail) {
  console.log('发现 ' + fail + ' 个问题，请按上面的 ✗ 修正。');
  process.exitCode = 1;
} else {
  console.log('全部通过。');
}

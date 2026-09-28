/* ============================================================
 * 长留玉 · 站点总配置
 * ------------------------------------------------------------
 * 换品牌名 / 换 IP 图案 / 加新测试 / 调分享文案，都只改这个文件。
 * 其它 js 一律不写死这些内容，全部从这里读。
 *
 * 全站**零外部依赖**：结果图片由本地 Canvas 自绘（js/career/result.js），
 * 二维码由 js/qr.js 自己算，没有任何 CDN 资源，离线也能完整运行。
 * ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
   * 1. 推导站点根目录
   *    利用「当前正在执行的 script 标签的 src」反推。
   *    这样即使在 /career/ 子目录的页面里，也能算出正确的资源绝对路径，
   *    部署到 Vercel / GitHub Pages 的子路径时同样有效。
   * ---------------------------------------------------------- */
  var script = document.currentScript;
  var BASE = './';
  if (script && script.src) {
    // 例：https://x.com/site/js/config.js  ->  https://x.com/site/
    BASE = script.src.replace(/\/js\/config\.js(?:\?.*)?$/, '/');
  }

  /* ------------------------------------------------------------
   * 2. 全站配置
   * ---------------------------------------------------------- */
  var CONFIG = {
    /* ===== 品牌 ===== */
    BRAND: '长留玉',
    BRAND_EN: 'CHANG LIU YU',
    SLOGAN: '万物皆有回响',
    COPYRIGHT_TAIL: '保留所有权利',

    /* ===== 免责声明（每个测试页面都必须出现）===== */
    DISCLAIMER: '仅供娱乐，不构成专业建议。',

    /* ===== 路径 ===== */
    BASE_URL: BASE,                       // 站点根目录（绝对地址）
    /* 品牌标识（Logo）。
     * 首页主视觉、开始页、各页面左上角品牌位、分享结果图，统一用这一张。
     * 想换成保留青玉原色的版本，把下面这行改成 './assets/ip-jade.png' 即可。 */
    IP_IMAGE_PATH: './assets/ip.png',
    IP_IMAGE_JADE: './assets/ip-jade.png',
    FAVICON_PATH: './assets/ip.png',
    LOGO_ALT: '长留玉',                    // Logo 的 alt 文案

    /* ===== 本地存储 ===== */
    STORAGE_PREFIX: 'clj_',               // 所有键统一加前缀，避免和同域其它应用冲突

    /* ===== 分享 ===== */
    SHARE_TITLE_SUFFIX: '｜长留玉',
    SHARE_TEXT: '我在长留玉做了一个测试，结果挺准的，你也来试试？',
    POSTER_BRAND_LINE: '长留玉 · 万物皆有回响',   // 分享图底部的品牌语

    /* ===== 生成图片时的二维码指向 =====
     * 结果图片右下角会印一个二维码，扫了直接回首页。
     * 留空则回落到 BASE_URL —— 但本地预览时 BASE_URL 是 127.0.0.1，
     * 别人扫出来打不开，所以正式地址建议在这里写死。 */
    SITE_URL: 'https://lalapua.github.io/changliuyu/',

    /* ===== 内容模块清单（测试 / 小游戏 / 其它）=====
     * 这是首页与模块页的唯一事实源。
     * online: true  -> 模块可被点击进入
     * online: false -> 显示为「即将上线」，点击不跳转
     * 每个模块内部的 items 同理：online 为 true 可进，false 显示即将上线。 */
    MODULES: [
      {
        id: 'tests',
        kind: 'test',
        name: '测试',
        en: 'TESTS',
        intro: '别急着给自己下定义，先看看数据怎么说。',
        path: 'tests/',
        accent: 'violet',
        online: true,
        items: [
          { id: 'career', name: '你适合什么样的职业', subtitle: 'RIASEC 职业兴趣模型',
            intro: '六个维度、上百个职业，算出你最像哪一类职业人。', path: 'career/',
            count: '30 / 120 题', minutes: '约 3 / 12 分钟', online: true, accent: 'violet' },
          { id: 'talent', name: '你的天赋是什么', subtitle: '即将上线',
            intro: '有些能力你以为人人都会，其实那是别人没有的。', path: 'talent/',
            count: '40 题', minutes: '约 5 分钟', online: false, accent: 'cyan' },
          { id: 'reserved-1', name: '待定测试位', subtitle: '即将上线',
            intro: '复制 career 目录即可在这里挂上新的测试。', path: 'reserved-1/',
            count: '待定', minutes: '待定', online: false, accent: 'amber' }
        ]
      },
      {
        id: 'games',
        kind: 'game',
        name: '小游戏',
        en: 'MINI GAMES',
        intro: '规划中',
        path: 'games/',
        accent: 'cyan',
        online: true,
        items: [
          { id: 'game-reserved-1', name: '待定小游戏位', subtitle: '即将上线',
            intro: '把任意纯前端小游戏目录挂进来，首页和这里会自动出现入口。', path: 'game-reserved-1/',
            online: false, accent: 'amber' }
        ]
      }
    ]
  };

  /* ------------------------------------------------------------
   * 2.5 派生字段：让下游老代码一行都不用改
   * ------------------------------------------------------------
   * 结果页的「你可能还想测」等原来直接读 CONFIG.TESTS，
   * 这里在 MODULES 之上拍平出同名派生字段，老调用不用改。
   * 同时给每个条目补上它归属哪个模块、以及它的 kind，方便跨模块查找。 */
  CONFIG.MODULES.forEach(function (m) {
    (m.items || []).forEach(function (it) {
      it.moduleId = m.id;
      it.kind = m.kind;
    });
  });
  CONFIG.ALL_ITEMS = [];
  CONFIG.MODULES.forEach(function (m) {
    (m.items || []).forEach(function (it) { CONFIG.ALL_ITEMS.push(it); });
  });
  CONFIG.TESTS = CONFIG.ALL_ITEMS.filter(function (it) { return it.kind === 'test'; });

  /* ------------------------------------------------------------
   * 3. 工具：把「相对站点根目录的路径」转成可直接用的 URL
   *    CLJ.asset('assets/ip.png') 在任意深度的页面里都返回正确地址
   * ---------------------------------------------------------- */
  function asset(path) {
    if (!path) return '';
    var p = String(path);
    if (/^(https?:)?\/\//.test(p) || /^data:/.test(p)) return p;  // 已经是绝对地址
    return BASE + p.replace(/^\.?\//, '');
  }

  window.CLJ_CONFIG = CONFIG;
  window.CLJ_ASSET = asset;

  /* ------------------------------------------------------------
   * 4. 配置查询辅助
   *    老代码还在用 CLJ_GET_TEST(id)，保留它当兼容别名，
   *    内部统一走 CLJ_GET_ITEM，避免两套查找逻辑各写一份。
   * ---------------------------------------------------------- */
  window.CLJ_GET_MODULE = function (id) {
    var ms = CONFIG.MODULES || [];
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].id === id) return ms[i];
    }
    return null;
  };

  window.CLJ_GET_ITEM = function (id) {
    var all = CONFIG.ALL_ITEMS || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  };

  window.CLJ_ITEMS_OF = function (moduleId) {
    var m = window.CLJ_GET_MODULE(moduleId);
    return m ? (m.items || []) : [];   // 找不到模块也返回空数组，调用方无需判 null
  };

  window.CLJ_GET_TEST = function (id) { return window.CLJ_GET_ITEM(id); };  // 兼容旧别名，别删
})();

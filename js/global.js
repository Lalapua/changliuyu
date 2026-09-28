/* ============================================================
 * 长留玉 · 全站公共逻辑
 * ------------------------------------------------------------
 * 依赖 config.js，必须在它之后引入。
 * 提供：DOM 选择器、本地存储、IP 图案挂载、品牌/页脚挂载、
 *       提示条、复制、脚本懒加载、确定性哈希 等公共能力。
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;

  var CLJ = {};

  /* ============================================================
   * 一、DOM 小工具
   * ============================================================ */
  CLJ.qs = function (sel, root) { return (root || document).querySelector(sel); };
  CLJ.qsa = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /** 创建元素：CLJ.el('div', { class: 'x', text: 'hi' }, [child]) */
  CLJ.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') { node.textContent = v; }
        else if (k === 'html') { node.innerHTML = v; }
        else if (k === 'class') { node.className = v; }
        else if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (s) { node.style[s] = v[s]; });
        }
        else { node.setAttribute(k, v === true ? '' : v); }
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  /** 清空一个容器 */
  CLJ.clear = function (node) { while (node && node.firstChild) node.removeChild(node.firstChild); };

  /** 转义用户可见的文本，防止拼接时破坏结构 */
  CLJ.esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ============================================================
   * 二、本地存储（统一加前缀 + JSON 序列化）
   * ============================================================ */
  CLJ.store = {
    key: function (k) { return CFG.STORAGE_PREFIX + k; },
    get: function (k, fallback) {
      try {
        var raw = window.localStorage.getItem(CFG.STORAGE_PREFIX + k);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;   // 隐私模式 / 数据损坏 时安全降级
      }
    },
    set: function (k, v) {
      try {
        window.localStorage.setItem(CFG.STORAGE_PREFIX + k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;      // 存储写满时静默失败，不打断答题
      }
    },
    remove: function (k) {
      try { window.localStorage.removeItem(CFG.STORAGE_PREFIX + k); } catch (e) {}
    }
  };

  /* ============================================================
   * 三、品牌标识（Logo / IP 图案）
   * ------------------------------------------------------------
   * 两处用法：
   *   1. <span data-clj-ip="xl"> —— 会生成一个圆形标识位，用于首页主视觉等大图位置
   *   2. <span data-clj-logo>    —— 只把 logo 塞进去，用于左上角品牌位这类小图标
   * 图片不存在时 onerror 静默降级为占位，绝不报错、绝不出现裂图。
   * ============================================================ */

  /** 生成一个 <img>，带加载失败兜底 */
  CLJ.logoImg = function (opts) {
    opts = opts || {};
    var img = document.createElement('img');
    img.alt = opts.alt === undefined ? '' : opts.alt;   // 默认按装饰性图形处理
    img.decoding = 'async';
    img.className = 'clj-logo';
    img.onerror = function () {
      // 找不到图片：静默降级，把宿主元素标成 fallback 显示渐变底
      var host = img.parentNode;
      if (host) {
        host.classList.add('is-fallback');
        host.classList.remove('is-loaded');
        host.removeChild(img);
      }
    };
    img.onload = function () {
      if (img.parentNode) img.parentNode.classList.add('is-loaded');
    };
    img.src = CLJ_ASSET(opts.src || CFG.IP_IMAGE_PATH);
    return img;
  };

  /** 圆形大图标识位（原 ipImage，保留旧名字向后兼容） */
  CLJ.ipImage = function (opts) {
    opts = opts || {};
    var wrap = CLJ.el('span', { class: 'clj-ip ' + (opts.class || '') });
    var img = CLJ.logoImg({ alt: opts.alt, src: opts.src });
    img.classList.add('clj-ip__img');
    wrap.appendChild(img);
    return wrap;
  };

  /** 小图标位：把 logo 直接插进 [data-clj-logo] 容器 */
  CLJ.mountLogo = function (root) {
    CLJ.qsa('[data-clj-logo]', root).forEach(function (slot) {
      var src = slot.getAttribute('data-clj-logo') || '';
      slot.appendChild(CLJ.logoImg({ alt: CFG.LOGO_ALT, src: src || CFG.IP_IMAGE_PATH }));
    });
  };

  /** 把页面上所有 [data-clj-ip] 占位节点替换成圆形标识 */
  CLJ.mountIp = function (root) {
    CLJ.qsa('[data-clj-ip]', root).forEach(function (slot) {
      var size = slot.getAttribute('data-clj-ip') || 'md';      // sm / md / lg / xl
      var node = CLJ.ipImage({ class: 'clj-ip--' + size, alt: CFG.LOGO_ALT });
      // 保留占位节点原有的 class，页面自定义的定位样式不会丢
      if (slot.className) node.className += ' ' + slot.className;
      slot.parentNode.replaceChild(node, slot);
    });
  };

  /* ============================================================
   * 四、品牌 / 页脚挂载
   * ------------------------------------------------------------
   * 页面只写空壳 + data 标记，文案从 config 注入，改品牌只需改一处。
   * ============================================================ */
  CLJ.mountBrand = function (root) {
    CLJ.qsa('[data-clj-brand]', root).forEach(function (n) { n.textContent = CFG.BRAND; });
    CLJ.qsa('[data-clj-brand-en]', root).forEach(function (n) { n.textContent = CFG.BRAND_EN; });
    CLJ.qsa('[data-clj-slogan]', root).forEach(function (n) { n.textContent = CFG.SLOGAN; });
    CLJ.qsa('[data-clj-disclaimer]', root).forEach(function (n) { n.textContent = CFG.DISCLAIMER; });
  };

  /* ============================================================
   * 五、轻提示条
   * ============================================================ */
  var toastTimer = null;
  CLJ.toast = function (msg, ms) {
    var node = CLJ.qs('#clj-toast');
    if (!node) {
      node = CLJ.el('div', { id: 'clj-toast', class: 'clj-toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(node);
    }
    node.textContent = msg;
    // 强制重排，保证连续调用时动画能重新播放
    void node.offsetWidth;
    node.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-show'); }, ms || 2200);
  };

  /* ============================================================
   * 六、复制文本
   * ============================================================ */
  CLJ.copy = function (text) {
    function legacy() {
      var ta = CLJ.el('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacy(); }
      );
    }
    return Promise.resolve(legacy());
  };

  /* ============================================================
   * 七、脚本懒加载（用于 html2canvas，避免首屏加载大库）
   * ============================================================ */
  var loadingScripts = {};
  CLJ.loadScript = function (src) {
    if (loadingScripts[src]) return loadingScripts[src];
    loadingScripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('脚本加载失败：' + src)); };
      document.head.appendChild(s);
    });
    return loadingScripts[src];
  };

  /* ============================================================
   * 八、确定性哈希
   * ------------------------------------------------------------
   * 同一个输入永远得到同一个结果。目前用于结果页的维度点评取词
   * （同一个维度 + 同一个分值永远念同一句话，刷新不会改口）。
   * ============================================================ */
  CLJ.hash = function (str) {
    var h = 2166136261;                       // FNV-1a 32 位
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  };

  /* ============================================================
   * 九、动态设置标题（分享时能看到测试名，但页面主视觉仍是测试名）
   * ============================================================ */
  CLJ.setTitle = function (mainTitle) {
    document.title = mainTitle ? (mainTitle + CFG.SHARE_TITLE_SUFFIX) : CFG.BRAND;
  };

  /* ============================================================
   * 十、首屏挂载
   * ============================================================ */
  CLJ.boot = function () {
    CLJ.mountBrand();
    CLJ.mountLogo();
    CLJ.mountIp();

    // 站点左上角/页脚的品牌强曝光
    CLJ.qsa('[data-clj-home]').forEach(function (n) { n.setAttribute('href', CLJ_ASSET('index.html')); });

    // 预览环境下 localStorage 可能不可用，提前探一次，给出温和提示
    var probe = CFG.STORAGE_PREFIX + '__probe';
    try {
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
    } catch (e) {
      CLJ.toast('当前浏览器限制了本地存储，答题进度将无法保存');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', CLJ.boot);
  } else {
    CLJ.boot();
  }

  window.CLJ = CLJ;
})();

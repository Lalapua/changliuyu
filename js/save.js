/* ============================================================
 * 长留玉 · 结果图片的保存与交付（公共模块）
 * ------------------------------------------------------------
 * 两个测试共用。这里装的都是踩出来的经验，不像表面那么直白：
 *   · 交付前先调一次 toBlob 验证画布**能安全导出** —— 被跨域图片污染过的
 *     画布会抛 SecurityError，那种画布是废的，早点发现比让用户看到一句
 *     莫名其妙的失败要好；
 *   · 交付顺序：系统分享 → 下载 → 铺图让用户长按保存。最后一步是必须的：
 *     在内嵌预览、微信内置浏览器里 <a download> 会被静默拦掉（不报错也不下载），
 *     所以不能盲目提示「已保存」，得看看到底有没有下载能力。
 *
 * 调用方式见底部 CLJ_SAVE.saveResultImage()。
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;
  var CLJ = window.CLJ;

  /* ------------------------------------------------------------
   * 调用参数
   * ------------------------------------------------------------
   * 由调用方在 saveResultImage({...}) 里传进来，见文件底部的说明。
   * ---------------------------------------------------------- */
  var OPT = {};
  var busy = false;          // 防止连点重复出图

  /** 默认文件名：长留玉-测试-20261002.png。调用方给了 filename 就用它的 */
  function defaultFilename() {
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return CFG.BRAND + '-测试-' + stamp + '.png';
  }

  function filename() {
    return (typeof OPT.filename === 'function' && OPT.filename()) || defaultFilename();
  }

  /* ------------------------------------------------------------
   * 结果图片：单一的自绘 Canvas 渲染器
   * ------------------------------------------------------------
   * 原来是三级降级：html2canvas 渲染真实 DOM → 本地 Canvas 手绘 → 报错。
   * 现在把 html2canvas 整条路砍掉，只留自绘，理由有三个：
   *   1. 它要联网从 CDN 拉 200KB，断网或内网环境下这一整条路直接作废；
   *   2. 它把 DOM 克隆进 iframe 再截图，画面里只要有一张跨域图片就会污染
   *      画布，之后 toBlob 抛 SecurityError，图必然存不下来 —— 之前线上
   *      报「生成图片失败」就是这个原因；
   *   3. 为了让它的渲染结果正确，还得额外维护一整套 .poster 样式，
   *      两处容易走散。
   * 自绘方案零依赖、离线可用、画布永远干净（海报里不放任何 <img>），
   * 代价只是雷达图也得自己画 —— 那本来就是现成的三角函数。
   * 出图分辨率取 2 倍（840px 宽），手机上看着是高清的。
   * ---------------------------------------------------------- */

  /** 把各种异常翻译成一句人话，直接显示在提示条里 */
  function shortErr(e) {
    var m = (e && (e.message || e.name)) ? String(e.message || e.name) : String(e || '未知错误');
    if (/SecurityError|tainted|insecure|origin/i.test(m)) return '画布被跨域内容污染';
    if (/toBlob|toDataURL/i.test(m)) return '画布导出被拒绝';
    if (/fetch|network|load|加载|不可用/i.test(m)) return '外部依赖加载失败';
    if (/过大|内存|quota/i.test(m)) return '画布过大，内存不足';
    return m.replace(/\s+/g, ' ').slice(0, 32);
  }

  /** 导出 canvas。被污染的画布会在这里抛 SecurityError —— 这是最关键的一道关 */
  function exportBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (!canvas) { reject(new Error('没有拿到画布')); return; }
      if (typeof canvas.toBlob !== 'function') {
        // 极老浏览器没有 toBlob：退回 dataURL 探一次，能出就当作通过
        try { canvas.toDataURL('image/png'); resolve(null); } catch (e) { reject(e); }
        return;
      }
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('toBlob 返回空，画布可能过大或内存不足'));
        }, 'image/png');
      } catch (e) {
        reject(e);          // 同步抛出：通常是 SecurityError
      }
    });
  }

  /** 生成并交付结果图片。
   *  opts = {
   *    buildCanvas: function () { return canvas; }   必须给，每次调用现生成
   *    filename:    function () { return 'x.png'; }  可省
   *    shareTitle:  function () { return '标题'; }   可省，系统分享用
   *    buttonId:    '#btn-save-img'                  可省
   *  }
   *  按钮的禁用/恢复、超时兜底、失败提示都在这里管，调用方不用管。 */
  function saveResultImage(opts) {
    OPT = opts || {};
    if (typeof OPT.buildCanvas !== 'function') {
      if (window.console && console.error) {
        console.error('[长留玉] saveResultImage 需要 buildCanvas（一个返回 canvas 的函数）。');
      }
      return;
    }
    if (busy) return;
    busy = true;
    var btn = CLJ.qs(OPT.buttonId || '#btn-save-img');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在生成…';

    // 兜底保险：任何环节卡死，按钮都不会永远停在「正在生成…」
    var guard = setTimeout(function () {
      finish();
      CLJ.toast('生成超时了，请重试', 3200);
    }, 20000);

    function finish() {
      clearTimeout(guard);
      busy = false;
      btn.disabled = false;
      btn.textContent = old;
    }

    var canvas;
    try {
      canvas = OPT.buildCanvas();
    } catch (e) {
      console.error('[长留玉] 绘制结果图片失败：', e);
      CLJ.toast('图片生成失败（' + shortErr(e) + '）', 4200);
      finish();
      return;
    }

    /* 先验一次「能不能安全导出」再交付：被污染的画布 toBlob 会抛
     * SecurityError，那种画布是废的，早点发现比让用户看到一句
     * 莫名其妙的失败要好。 */
    exportBlob(canvas)
      .then(function (blob) { return deliver(canvas, blob); })
      .catch(function (e) {
        console.error('[长留玉] 导出结果图片失败：', e);
        CLJ.toast('图片存不下来（' + shortErr(e) + '），可以截图保存', 4200);
      })
      .then(finish, finish);
  }

  /** 把结果交给用户。顺序：系统分享 → 下载 → 铺图让用户长按保存。
   *  注意最后一步：在内嵌预览、微信内置浏览器这类环境里，
   *  <a download> 会被静默拦掉（不报错、也不下载），
   *  所以不能盲目提示「已保存」，得看看到底有没有下载能力。 */
  function deliver(canvas, blob) {
    var name = filename();

    var file = null;
    if (blob) {
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
    }

    // 1. 能走系统分享就走分享（移动端最顺）
    if (file && navigator.canShare) {
      var canShare = false;
      try { canShare = navigator.canShare({ files: [file] }); } catch (e) { canShare = false; }
      if (canShare) {
        return navigator.share({ files: [file],
          title: (typeof OPT.shareTitle === 'function' && OPT.shareTitle()) || CFG.BRAND,
          text: CFG.SHARE_TEXT })
          .then(function () { CLJ.toast('已唤起系统分享'); })
          .catch(function () { download(); });
      }
    }

    download();
    return Promise.resolve();

    function download() {
      var url;
      try {
        url = canvas.toDataURL('image/png');
      } catch (e) {
        console.error('[长留玉] toDataURL 失败：', e);
        CLJ.toast('这张图存不下来（' + shortErr(e) + '），可以截图保存', 3600);
        return;
      }

      var a = document.createElement('a');
      // 内嵌 iframe 里下载多半被拦；老浏览器可能不支持 download 属性
      var canDownload = ('download' in a) && window.self === window.top;

      if (canDownload) {
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        CLJ.toast('图片已保存到下载目录');
      } else {
        showImageOverlay(url);
      }
    }
  }

  /** 不能直接下载时的兜底：把图铺在遮罩层上，让用户长按（桌面右键）保存 */
  function showImageOverlay(dataUrl) {
    var prev = CLJ.qs('#clj-save-overlay');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    var box = CLJ.el('div', {
      id: 'clj-save-overlay',
      class: 'save-overlay',
      role: 'dialog',
      'aria-label': '保存结果图片'
    });
    box.appendChild(CLJ.el('img', { class: 'save-overlay__img', src: dataUrl, alt: '你的测试结果图片' }));
    box.appendChild(CLJ.el('p', {
      class: 'save-overlay__hint',
      text: '当前环境不允许直接下载，长按（电脑上右键）这张图保存即可'
    }));
    var close = CLJ.el('button', {
      class: 'btn btn--ghost btn--sm save-overlay__close', type: 'button', text: '知道了'
    });
    close.addEventListener('click', function () { if (box.parentNode) box.parentNode.removeChild(box); });
    box.addEventListener('click', function (e) {
      if (e.target === box && box.parentNode) box.parentNode.removeChild(box);
    });
    box.appendChild(close);
    document.body.appendChild(box);
  }

  /* ------------------------------------------------------------
   * 对外入口
   * ------------------------------------------------------------
   * CLJ_SAVE.saveResultImage({
   *   buildCanvas: function () { return canvas; },   // 每次调用现生成
   *   filename:    function () { return 'xxx.png'; }, // 可省，给默认名
   *   shareTitle:  function () { return '标题'; },    // 可省，系统分享用
   *   buttonId:    '#btn-save-img'                    // 可省
   * })
   * ---------------------------------------------------------- */
  window.CLJ_SAVE = {
    saveResultImage: saveResultImage,
    shortErr: shortErr,
    exportBlob: exportBlob,
    deliver: deliver,
    showImageOverlay: showImageOverlay
  };
})();

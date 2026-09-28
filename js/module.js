/* ============================================================
 * 长留玉 · 模块列表页通用逻辑
 * ------------------------------------------------------------
 * tests/index.html 与 games/index.html 共用本文件，两页的唯一差异是
 * <body data-clj-module> 的值（分别是 tests / games）。
 * 所有内容都由 config.js 的 MODULES 驱动：加模块、加条目只改 config，
 * 这里一行都不用动。脚本顺序固定为 config → global → module.js。
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;
  var CLJ = window.CLJ;

  /* 渲染单条条目卡片。
   * online 为 false 时降级成「即将上线」、不可点（容器换成 div 而非 a）。
   * kind 决定文案与是否展示题数：小游戏没有题数概念，不做 meta 块。
   * 缺 count / minutes 时，对应那一项也不输出。 */
  function buildItemCard(it) {
    var kind = it.kind || 'test';
    var online = it.online !== false;

    var href, cls, ctaText, arrow;
    if (online) {
      // 条目页在子目录里，用 CLJ_ASSET 把相对站点根的路径拼成正确地址
      href = CLJ_ASSET(it.path + 'index.html');
      cls = 'item-card card anim-up';
      ctaText = (kind === 'game') ? '开始玩' : '开始测试';
      arrow = '→';
    } else {
      href = null;
      cls = 'item-card card is-soon anim-up';
      ctaText = '即将上线';
      arrow = '·';
    }

    var card = CLJ.el(online ? 'a' : 'div', online ? { class: cls, href: href } : { class: cls });

    // 头部：副标题（可选）→ 名称 → 简介
    var headChildren = [];
    if (it.subtitle) {
      headChildren.push(CLJ.el('div', { class: 't-eyebrow', text: it.subtitle }));
    }
    headChildren.push(CLJ.el('h3', { class: 'item-card__name', text: it.name || '' }));
    headChildren.push(CLJ.el('p', { class: 'item-card__intro', text: it.intro || '' }));
    card.appendChild(CLJ.el('div', { class: 'item-card__head' }, [
      CLJ.el('div', { class: 'grow' }, headChildren)
    ]));

    // 元信息：仅测试类、且确有题数 / 时长时才输出整块
    if (kind === 'test' && (it.count || it.minutes)) {
      var metaItems = [];
      if (it.count) {
        metaItems.push(CLJ.el('span', { class: 'item-card__meta-item' }, [
          document.createTextNode('题数 '),
          CLJ.el('strong', { text: it.count })
        ]));
      }
      if (it.minutes) {
        metaItems.push(CLJ.el('span', { class: 'item-card__meta-item' }, [
          document.createTextNode('预计 '),
          CLJ.el('strong', { text: it.minutes })
        ]));
      }
      card.appendChild(CLJ.el('div', { class: 'item-card__meta' }, metaItems));
    }

    // 行动按钮
    card.appendChild(CLJ.el('span', { class: 'item-card__cta' }, [
      document.createTextNode(ctaText),
      CLJ.el('span', { class: 'item-card__arrow', text: arrow })
    ]));

    return card;
  }

  function boot() {
    var moduleId = document.body.getAttribute('data-clj-module');
    var m = window.CLJ_GET_MODULE(moduleId);

    var listEl = CLJ.qs('#item-list');

    // 模块不存在：给出明确提示，不抛异常，也不阻塞页面其余部分
    if (!m) {
      var badName = CLJ.qs('#module-name');
      var badIntro = CLJ.qs('#module-intro');
      if (badName) badName.textContent = '模块不存在';
      if (badIntro) badIntro.textContent = '请检查 config.js 里是否定义了 id 为「' + moduleId + '」的模块。';
      if (listEl) CLJ.clear(listEl);
      return;
    }

    // 头部信息从配置注入
    var enEl = CLJ.qs('#module-en');
    var nameEl = CLJ.qs('#module-name');
    var introEl = CLJ.qs('#module-intro');
    if (enEl) enEl.textContent = m.en || '';
    if (nameEl) nameEl.textContent = m.name || '';
    if (introEl) introEl.textContent = m.intro || '';
    // 标题同步成「模块名｜长留玉」，分享 / 多任务视图里能看到当前位置
    CLJ.setTitle(m.name);

    // 列表标题与计数提示
    var listTitle = CLJ.qs('#list-title');
    var listHint = CLJ.qs('#list-hint');
    if (listTitle) listTitle.textContent = '全部' + (m.name || '');
    var items = window.CLJ_ITEMS_OF(moduleId);
    var onlineCount = 0;
    items.forEach(function (it) { if (it.online !== false) onlineCount++; });
    if (listHint) {
      if (items.length === 0) listHint.textContent = '还没有内容';
      else if (onlineCount > 0) listHint.textContent = '共 ' + onlineCount + ' 项可玩';
      else listHint.textContent = '都在筹备中';
    }

    // 渲染卡片，依次加 d-1…d-6 错开入场动画（最多错到第 6 个，避免长列表拖沓）
    if (listEl) {
      CLJ.clear(listEl);
      items.forEach(function (it, i) {
        var card = buildItemCard(it);
        card.classList.add('d-' + Math.min(i + 1, 6));
        listEl.appendChild(card);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

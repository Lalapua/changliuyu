/* ============================================================
 * 长留玉 · 首页逻辑
 * ------------------------------------------------------------
 * 首页的模块列表完全由 config.js 的 MODULES 数组驱动。
 * 新增模块 / 条目只需在 config.js 里加一条，这里会自动渲染出来。
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLJ_CONFIG;
  var CLJ = window.CLJ;

  /* 渲染一个模块卡。online 为 false 时只展示「即将上线」、不可点；
   * 否则是可以点进去的链接。badge 显示该模块的在线条目数或筹备状态。 */
  function buildModuleCard(m) {
    var onlineCount = 0;
    (m.items || []).forEach(function (it) { if (it.online) onlineCount++; });

    var badgeText;
    if (m.online === false) badgeText = '即将上线';
    else if (onlineCount > 0) badgeText = onlineCount + ' 项';
    else badgeText = '筹备中';

    var ctaText = (m.online === false) ? '即将上线' : '进去看看';
    var arrow = (m.online === false) ? '·' : '→';

    var card = (m.online === false)
      ? CLJ.el('div', { class: 'mod-card card is-soon anim-up' })
      : CLJ.el('a', { class: 'mod-card card card--glow anim-up', href: CLJ_ASSET(m.path + 'index.html') });

    var top = CLJ.el('div', { class: 'mod-card__top' }, [
      CLJ.el('span', { class: 'mod-card__en', text: m.en || '' }),
      CLJ.el('span', { class: 'mod-card__badge', text: badgeText })
    ]);
    card.appendChild(top);

    card.appendChild(CLJ.el('h3', { class: 'mod-card__name', text: m.name || '' }));
    card.appendChild(CLJ.el('p', { class: 'mod-card__intro', text: m.intro || '' }));

    card.appendChild(CLJ.el('span', { class: 'mod-card__cta' }, [
      document.createTextNode(ctaText),
      CLJ.el('span', { class: 'mod-card__arrow', text: arrow })
    ]));

    return card;
  }

  function boot() {
    var list = CLJ.qs('#module-list');
    if (list) {
      CLJ.clear(list);
      (CFG.MODULES || []).forEach(function (m, i) {
        var card = buildModuleCard(m);
        card.classList.add('d-' + Math.min(i + 1, 6));
        list.appendChild(card);
      });
    }

    var y = CLJ.qs('#year');
    if (y) y.textContent = String(new Date().getFullYear());

    CLJ.setTitle('轻娱乐小站');

    // 顺手报一下数据健康度，方便开发时发现题库/职业库被改坏
    if (window.CLJ_DATA && window.CLJ_DATA.validate) {
      var rep = window.CLJ_DATA.validate();
      if (typeof console !== 'undefined') {
        console.log('[长留玉] 数据自检：', rep.ok ? '通过' : '有问题', rep.errors.length ? rep.errors : '');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

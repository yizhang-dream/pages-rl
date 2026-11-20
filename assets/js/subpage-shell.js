/* ═══════════════════════════════════════════════════════════
   课程引擎 · 公共导航与辅助页运行壳 (subpage-shell.js)
   1) 为 index.html 与 4 个独立辅助页提供同一套五模块响应式顶栏策略（bindResponsiveNav）：
      - 宽屏在顶栏一行内展开 5 个模块切换链接（课堂 / 知识星图 / 笔记本实验 / 术语索引 / 资料索引）
      - 窄屏或内容溢出行时自动收折为紧凑「模块 / Modules」原生 popover 菜单
   2) 为独立辅助页挂载完整顶栏（mountTopbar）、页脚五模块导航（renderFooterLinks）、
      语言/主题持久化、以及镜像站点 JupyterLite 探测。
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var cfg = window.COURSE_CONFIG || {};
  var prefix = cfg.id || 'rl-viz';
  var THEME_KEY = prefix + '-theme';
  var LANG_KEY = prefix + '-lang';
  var DEFAULT_THEME = cfg.defaultTheme || 'chalk';
  var DEFAULT_LANG = cfg.defaultLang || 'both';

  var DEFAULT_PAGES = [
    { id: 'classroom',   href: 'index.html',       zh: '课堂',       en: 'Classroom' },
    { id: 'graph3d',     href: 'graph3d.html',     zh: '知识星图',   en: 'Constellation' },
    { id: 'lite',        href: 'lite.html',        zh: '笔记本实验', en: 'Notebook Lab' },
    { id: 'concordance', href: 'concordance.html', zh: '术语索引',   en: 'Concordance' },
    { id: 'resources',   href: 'resources.html',   zh: '资料索引',   en: 'Resources' },
  ];

  var DEFAULT_THEMES = [
    { key: 'chalk',   label: '墨板 Chalkboard',  dot: '#ffd76a', swatchClass: 'dot-theme-chalk' },
    { key: 'swiss',   label: '讲义 Swiss Notes', dot: '#2138e0', swatchClass: 'dot-theme-swiss' },
    { key: 'quant',   label: '深空 Quant Dark',  dot: '#3ce6c2', swatchClass: 'dot-theme-quant' },
    { key: 'forest',  label: '教科书 Forest',    dot: '#2e6b45', swatchClass: 'dot-theme-forest' },
    { key: 'classic', label: '经典 Classic',     dot: '#3e6fe0', swatchClass: 'dot-theme-classic' },
  ];

  var BRAND_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="3" y="3" width="5.4" height="5.4" rx="1"/>'
    + '<rect x="15.6" y="3" width="5.4" height="5.4" rx="1"/>'
    + '<rect x="3" y="15.6" width="5.4" height="5.4" rx="1"/>'
    + '<rect x="15.6" y="15.6" width="5.4" height="5.4" rx="1" fill="currentColor" stroke="none"/>'
    + '<path d="M8.4 5.7h7.2M5.7 8.4v7.2M18.3 8.4v7.2M8.4 18.3h7.2"/></svg>';

  var MENU_SVG = '<svg viewBox="0 0 18 14" width="15" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M1 2h16M1 7h16M1 12h16"/></svg>';

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch { /* 隐私模式下静默 */ }
  }

  var themeCbs = [];
  var langCbs = [];
  var boundNav = null;

  function setTheme(key) {
    if (!key) return;
    document.documentElement.dataset.theme = key;
    lsSet(THEME_KEY, key);
    document.querySelectorAll('.theme-btn, .sp-theme-btn, [data-theme-btn]').forEach(function (b) {
      var on = b.dataset.theme === key;
      b.classList.toggle('active', on);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    themeCbs.forEach(function (fn) { try { fn(key); } catch { /* ignore */ } });
  }

  function setLang(key) {
    var k = (key === 'zh' || key === 'en') ? key : 'both';
    document.body.dataset.lang = k;
    lsSet(LANG_KEY, k);
    document.documentElement.lang = k === 'en' ? 'en' : 'zh-CN';
    document.querySelectorAll('.lang-btn, .sp-lang-btn, [data-lang-btn]').forEach(function (b) {
      var on = b.dataset.lang === k;
      b.classList.toggle('active', on);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    langCbs.forEach(function (fn) { try { fn(k); } catch { /* ignore */ } });
    if (boundNav && typeof boundNav.remeasure === 'function') boundNav.remeasure();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPages() {
    return (Array.isArray(cfg.auxPages) && cfg.auxPages.length) ? cfg.auxPages : DEFAULT_PAGES;
  }

  /* ── 响应式五模块顶栏测量与 Popover 状态同步（遵循 navbar 规范）── */
  function bindResponsiveNav(headerEl) {
    if (!headerEl) return null;
    var innerEl = headerEl.querySelector('.topbar-inner');
    var btnEl = headerEl.querySelector('.site-menu-btn');
    var menuEl = headerEl.querySelector('.site-menu');
    if (!innerEl || !btnEl || !menuEl) return null;

    var hasNativePopover = Object.hasOwn(HTMLElement.prototype, 'popover');
    var hasAnchorPos = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      && CSS.supports('inset-block-start', 'anchor(--site-menu-btn bottom)');
    var wide = headerEl.classList.contains('is-wide');
    var lastCollapsedW = 0;
    var disconnected = false;
    var rafId = 0;
    var ro = null;

    function isOpen() {
      return hasNativePopover
        ? menuEl.matches(':popover-open')
        : menuEl.classList.contains(':popover-open');
    }

    function placeFallbackPopover() {
      if (wide || hasAnchorPos) {
        menuEl.style.left = '';
        menuEl.style.top = '';
        return;
      }
      var br = btnEl.getBoundingClientRect();
      var mr = menuEl.getBoundingClientRect();
      var mw = mr.width || 220;
      var left = Math.max(8, Math.min(window.innerWidth - mw - 8, br.left));
      menuEl.style.left = Math.round(left) + 'px';
      menuEl.style.top = Math.round(br.bottom + 6) + 'px';
    }

    function openPopover() {
      if (hasNativePopover) {
        try { menuEl.showPopover(); } catch { /* 已打开时忽略 */ }
      } else {
        menuEl.classList.add(':popover-open');
      }
      btnEl.setAttribute('aria-expanded', 'true');
      placeFallbackPopover();
    }

    function closePopover() {
      if (hasNativePopover) {
        try { if (menuEl.matches(':popover-open')) menuEl.hidePopover(); } catch { /* ignore */ }
      } else {
        menuEl.classList.remove(':popover-open');
      }
      btnEl.setAttribute('aria-expanded', 'false');
    }

    function measure() {
      if (disconnected) return;
      var wasOpen = isOpen();
      headerEl.classList.add('is-measuring', 'is-wide');
      menuEl.removeAttribute('popover');
      menuEl.classList.remove(':popover-open');
      menuEl.style.left = '';
      menuEl.style.top = '';

      var fits = innerEl.scrollWidth <= innerEl.clientWidth + 1;
      wide = fits;
      if (fits) {
        headerEl.classList.add('is-wide');
        menuEl.removeAttribute('popover');
        btnEl.setAttribute('aria-expanded', 'false');
      } else {
        headerEl.classList.remove('is-wide');
        menuEl.setAttribute('popover', 'auto');
        lastCollapsedW = headerEl.clientWidth;
        if (wasOpen) openPopover();
        else btnEl.setAttribute('aria-expanded', 'false');
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function () {
        headerEl.classList.remove('is-measuring');
        rafId = 0;
      });
    }

    function onToggle(ev) {
      var open = ev && ev.newState === 'open';
      btnEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) placeFallbackPopover();
    }

    function onBtnClickFallback() {
      if (isOpen()) closePopover();
      else openPopover();
    }

    function onDocPointerDown(ev) {
      if (wide || !isOpen()) return;
      if (!menuEl.contains(ev.target) && !btnEl.contains(ev.target)) closePopover();
    }

    function onDocKeyDown(ev) {
      if (!wide && ev.key === 'Escape' && isOpen()) {
        closePopover();
        btnEl.focus();
      }
    }

    function onMenuClick(ev) {
      if (!wide && ev.target && ev.target.closest && ev.target.closest('a')) {
        closePopover();
      }
    }

    if (hasNativePopover) {
      menuEl.addEventListener('toggle', onToggle);
    } else {
      btnEl.addEventListener('click', onBtnClickFallback);
      document.addEventListener('pointerdown', onDocPointerDown);
      document.addEventListener('keydown', onDocKeyDown);
    }
    menuEl.addEventListener('click', onMenuClick);

    measure();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (!disconnected) measure(); }).catch(function () {});
    }

    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () {
        if (disconnected) return;
        var curW = headerEl.clientWidth;
        if (wide || curW > lastCollapsedW) measure();
      });
      ro.observe(headerEl);
      ro.observe(menuEl);
    }

    var ctrl = {
      remeasure: measure,
      close: closePopover,
      disconnect: function () {
        disconnected = true;
        if (rafId) cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        if (hasNativePopover) {
          menuEl.removeEventListener('toggle', onToggle);
        } else {
          btnEl.removeEventListener('click', onBtnClickFallback);
          document.removeEventListener('pointerdown', onDocPointerDown);
          document.removeEventListener('keydown', onDocKeyDown);
        }
        menuEl.removeEventListener('click', onMenuClick);
      },
    };
    return ctrl;
  }

  function mountTopbar(opts) {
    var o = opts || {};
    var host = typeof o.el === 'string' ? document.querySelector(o.el) : o.el;
    if (!host) return;
    var activeId = o.activeId || '';
    var brand = cfg.brand || {
      zh: 'RL 可视化课堂',
      en: 'RL Visual Classroom',
      subtitle: 'Mathematical Foundation of RL · Visual Course',
      homeAria: '回到首页 / Back to Home',
    };
    var pages = getPages();
    var themes = (Array.isArray(cfg.themes) && cfg.themes.length) ? cfg.themes : DEFAULT_THEMES;

    var navHtml = pages.map(function (p) {
      var cur = p.id === activeId ? ' aria-current="page"' : '';
      return '<li><a href="' + esc(p.href) + '"' + cur + '>'
        + '<span class="zh">' + esc(p.zh) + '</span>'
        + '<span class="en">' + esc(p.en) + '</span></a></li>';
    }).join('');

    var themeHtml = themes.map(function (t) {
      var dot = t.dot || '#888';
      return '<button type="button" class="theme-btn sp-theme-btn" data-theme="' + esc(t.key)
        + '" title="' + esc(t.label) + '" aria-label="' + esc(t.label) + '">'
        + '<span class="sw-dot" style="background:' + esc(dot) + '"></span></button>';
    }).join('');

    host.className = 'sp-topbar' + (o.extraClass ? ' ' + o.extraClass : '');
    host.innerHTML =
      '<div class="topbar-inner">'
      + '<a class="brand" href="index.html" aria-label="' + esc(brand.homeAria || '回到首页') + '">'
      +   '<span class="brand-logo">' + BRAND_SVG + '</span>'
      +   '<span class="brand-text">'
      +     '<strong class="zh">' + esc(brand.zh || 'RL 可视化课堂') + '</strong>'
      +     '<strong class="en">' + esc(brand.en || brand.zh || 'RL Visual Classroom') + '</strong>'
      +     '<em>' + esc(brand.subtitle || '') + '</em>'
      +   '</span>'
      + '</a>'
      + '<nav class="site-nav" aria-label="课程模块导航 / Course modules">'
      +   '<button type="button" class="site-menu-btn" popovertarget="site-nav-menu" popovertargetaction="toggle" aria-controls="site-nav-menu" aria-expanded="false">'
      +     MENU_SVG + '<span class="zh">模块</span><span class="en">Modules</span>'
      +   '</button>'
      +   '<ul id="site-nav-menu" class="site-menu" popover="auto">' + navHtml + '</ul>'
      + '</nav>'
      + '<div class="topbar-center"></div>'
      + '<div class="lang-switch" role="group" aria-label="语言 / Language">'
      +   '<button type="button" class="lang-btn sp-lang-btn" data-lang="both">双语</button>'
      +   '<button type="button" class="lang-btn sp-lang-btn" data-lang="zh">中文</button>'
      +   '<button type="button" class="lang-btn sp-lang-btn" data-lang="en">EN</button>'
      + '</div>'
      + '<div class="theme-switch" role="group" aria-label="主题 / Theme">' + themeHtml + '</div>'
      + '</div>';
  }

  function renderFooterLinks(el, activeId) {
    var host = typeof el === 'string' ? document.querySelector(el) : el;
    if (!host) return;
    var pages = getPages();
    var zhLinks = pages.map(function (p) {
      var cur = p.id === activeId ? ' aria-current="page"' : '';
      return '<a href="' + esc(p.href) + '"' + cur + '>' + esc(p.zh) + '</a>';
    }).join(' · ');
    var enLinks = pages.map(function (p) {
      var cur = p.id === activeId ? ' aria-current="page"' : '';
      return '<a href="' + esc(p.href) + '"' + cur + '>' + esc(p.en) + '</a>';
    }).join(' · ');
    host.innerHTML = '<span class="zh">' + zhLinks + '</span><span class="en">' + enLinks + '</span>';
  }

  function initControls() {
    var theme = lsGet(THEME_KEY) || DEFAULT_THEME;
    var lang = lsGet(LANG_KEY) || DEFAULT_LANG;
    document.querySelectorAll('.sp-theme-btn').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(b.dataset.theme); });
    });
    document.querySelectorAll('.sp-lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.dataset.lang); });
    });
    setTheme(theme);
    setLang(lang);
    var header = document.querySelector('.sp-topbar');
    if (header) {
      if (boundNav && typeof boundNav.disconnect === 'function') boundNav.disconnect();
      boundNav = bindResponsiveNav(header);
    }
  }

  // 检查当前站点是否带有 /lite/lab/index.html（GitHub Pages 镜像未构建 lite/ 时，
  // 将启动链接改指 liveOrigin 主站，避免点击跳 404；本地 localhost 保留相对路径供冒烟测试）。
  function resolveMirrorLiteLinks(container) {
    if (!/^https?:/.test(location.protocol)) return;
    if (/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) return;
    var live = (cfg.liveOrigin || '').replace(/\/+$/, '');
    if (!live || location.origin === live) return;
    fetch('lite/lab/index.html', { method: 'HEAD' }).then(function (res) {
      if (res.ok) return;
      (container || document).querySelectorAll('a[href^="lite/lab/index.html"]').forEach(function (a) {
        var rel = a.getAttribute('href');
        a.setAttribute('href', live + '/' + rel);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      });
    }).catch(function () { /* 网络异常保持原样 */ });
  }

  window.SubpageShell = {
    lsGet: lsGet,
    lsSet: lsSet,
    setTheme: setTheme,
    setLang: setLang,
    onTheme: function (fn) { if (typeof fn === 'function') themeCbs.push(fn); },
    onLang: function (fn) { if (typeof fn === 'function') langCbs.push(fn); },
    mountTopbar: mountTopbar,
    bindResponsiveNav: bindResponsiveNav,
    renderFooterLinks: renderFooterLinks,
    initControls: initControls,
    resolveMirrorLiteLinks: resolveMirrorLiteLinks,
    THEME_KEY: THEME_KEY,
    LANG_KEY: LANG_KEY,
    VISITED_KEY: prefix + '-visited',
  };
})();

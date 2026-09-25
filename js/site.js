/*
 * "ألعاب الفسحة" portal (Arabic, right-to-left). Plain script (no modules, no
 * fetch) so the site also works when index.html is opened straight from a
 * folder (file://).
 *
 * Routes (hash based):
 *   #/                home
 *   #/c/<category>    one category
 *   #/search/<text>   search results
 *   #/play/<slug>     play a game
 *
 * Data comes from js/catalog.js: window.SITE, window.CATEGORIES, window.GAMES.
 * Every UI string lives in the T table below; game titles, blurbs, controls,
 * category labels and the site name come from the catalog.
 * Numbers are always Western digits (0-9).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ strings */
  var T = {
    home: 'الرئيسية',
    hot: 'الأكثر حماسًا الآن',
    recent: 'تابع اللعب',
    favs: 'ألعابك المفضلة',
    all: 'كل الألعاب',
    seeAll: 'عرض الكل',
    seeAllAria: 'عرض كل ألعاب قسم ',
    different: 'جرّب شيئًا مختلفًا',
    more: 'ألعاب أخرى ستحبها',
    toPlay: ' تنتظرك!',
    searchTitle: 'ابحث عن لعبة',
    searchPrompt: 'اكتب اسم لعبة في مربع البحث بالأعلى',
    searchNone: 'لم نجد أي لعبة',
    found: function (n) { return n === 1 ? 'وجدنا لعبة واحدة' : n === 2 ? 'وجدنا لعبتين' : 'وجدنا ' + nGames(n); },
    noMatch: 'أوه! لا توجد لعبة بهذا الاسم. جرّب واحدة من هذه!',
    oops: 'أوه!',
    noCat: 'لم نجد هذا القسم.',
    noGame: 'هذه اللعبة مختبئة! اختر لعبة أخرى.',
    back: '🏠 العودة إلى كل الألعاب',
    soon: 'الألعاب في الطريق!',
    soonSub: 'عد قريبًا.',
    hotBadge: 'رائج',
    p2Badge: 'لاعبان',
    controls: 'طريقة اللعب',
    controlsNone: 'استخدم الفأرة ولوحة المفاتيح!',
    tip: 'نصيحة',
    tip1: 'المفاتيح لا تعمل؟ <b>انقر على اللعبة</b> أولًا!',
    tip2: 'اضغط <b>ملء الشاشة</b> لتكبير اللعبة.',
    tip3: 'اضغط <b>P</b> أو <b>Esc</b> للإيقاف المؤقت، وزر 🔊 لكتم الصوت.',
    fav: 'أضف للمفضلة',
    favOn: 'في المفضلة',
    favAdded: 'أُضيفت إلى ألعابك المفضلة ❤️',
    favRemoved: 'أُزيلت من المفضلة',
    restart: 'أعد التشغيل',
    fs: 'ملء الشاشة',
    fsExit: 'خروج من ملء الشاشة',
    fsNone: 'ملء الشاشة غير متاح هنا. جرّب زر F11!',
    fsFail: 'لم يعمل ملء الشاشة. جرّب زر F11!',
    loading: 'جارٍ تحميل ',
    building: 'هذه اللعبة ما زالت قيد البناء!',
    buildingSub: 'جرّب لعبة أخرى من الأسفل.',
    titleNotFound: 'لم نجد اللعبة',
    titleSearch: 'بحث: ',
    gameFallback: 'لعبة'
  };
  // Arabic counting: 1 لعبة واحدة, 2 لعبتان, 3-10 ألعاب, 11+ لعبة.
  function nGames(n) {
    if (n === 1) return 'لعبة واحدة';
    if (n === 2) return 'لعبتان';
    if (n >= 3 && n <= 10) return n + ' ألعاب';
    return n + ' لعبة';
  }
  function playersLabel(p) {
    p = String(p || '1').trim();
    var m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (p === '1') return '👤 لاعب واحد';
    if (p === '2') return '👥 لاعبان';
    if (m) return m[1] === '1' && m[2] === '2' ? '👥 لاعب أو لاعبان' : '👥 من ' + m[1] + ' إلى ' + m[2] + ' لاعبين';
    return '👥 ' + p + ' لاعبين';
  }

  /* ------------------------------------------------------------ data */
  var SITE = window.SITE || { name: 'ألعاب الفسحة', tagline: '' };
  SITE.name = String(SITE.name || 'ألعاب الفسحة');
  var ALL_CATS = Array.isArray(window.CATEGORIES) ? window.CATEGORIES : [];
  var GAMES = (Array.isArray(window.GAMES) ? window.GAMES : []).filter(function (g) {
    return g && typeof g.slug === 'string' && g.slug && !g.hidden;
  });
  var BY_SLUG = {};
  GAMES.forEach(function (g) {
    BY_SLUG[g.slug] = g;
    if (!Array.isArray(g.cats)) g.cats = [];
    if (!Array.isArray(g.controls)) g.controls = [];
    g.title = String(g.title || g.slug);
    g.color = /^#[0-9a-f]{3,8}$/i.test(g.color || '') ? g.color : '#4f7cff';
  });
  var CAT_BY_ID = {};
  ALL_CATS.forEach(function (c) { if (c && c.id) CAT_BY_ID[c.id] = c; });
  // Only categories that actually have (visible) games.
  var CATS = ALL_CATS.filter(function (c) {
    return c && c.id && GAMES.some(function (g) { return g.cats.indexOf(c.id) >= 0; });
  });
  var CAT_COLORS = ['#ff7a1a', '#ff3b6b', '#8e5bff', '#1fb86a', '#00a6ff', '#ff4fa3', '#f2a900', '#17c3b2'];

  function gamesIn(catId) { return GAMES.filter(function (g) { return g.cats.indexOf(catId) >= 0; }); }
  function isMulti(g) { return /[2-9]/.test(String(g.players || '')); }
  function catEmoji(g) { var c = CAT_BY_ID[g.cats[0]]; return (c && c.icon) || '🎮'; }
  function catColor(id) { var i = ALL_CATS.findIndex(function (c) { return c.id === id; }); return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length]; }

  /* --------------------------------------------------------- storage */
  var KEY_RECENT = 'sg:site:recent';
  var KEY_FAVS = 'sg:site:favs';
  function loadList(key) {
    try {
      var v = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveList(key, list) {
    try { window.localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function known(list) { return list.filter(function (s) { return !!BY_SLUG[s]; }); }
  function getRecent() { return known(loadList(KEY_RECENT)); }
  function getFavs() { return known(loadList(KEY_FAVS)); }
  function isFav(slug) { return loadList(KEY_FAVS).indexOf(slug) >= 0; }
  function pushRecent(slug) {
    var list = loadList(KEY_RECENT).filter(function (s) { return s !== slug; });
    list.unshift(slug);
    saveList(KEY_RECENT, list.slice(0, 12));
  }
  function toggleFav(slug) {
    var list = loadList(KEY_FAVS);
    var i = list.indexOf(slug);
    if (i >= 0) list.splice(i, 1); else list.unshift(slug);
    saveList(KEY_FAVS, list);
    return i < 0;
  }

  /* ---------------------------------------------------------- helpers */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function enc(s) { return encodeURIComponent(s); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3 || h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // Mix a color toward deep navy for the bottom of gradients.
  function deepen(hex, t) {
    var c = hexToRgb(hex), n = [28, 22, 80];
    return 'rgb(' + c.map(function (v, i) { return Math.round(v + (n[i] - v) * t); }).join(',') + ')';
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // Emoji and variation selectors are dropped from the tab title.
  function noEmoji(s) {
    return String(s || '').replace(/[←-⯿️‍]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g, '').replace(/\s+/g, ' ').trim();
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* -------------------------------------------------------------- logo */
  // Star badge with a joystick; the site name is drawn as whole words (one
  // <text>, never split into letters, so Arabic letters stay joined).
  function iconSVG() {
    return '' +
      '<g class="logo-icon">' +
      '<path d="M32 3l6.5 7.2 9.6-1.5 1.6 9.6 8.7 4.4-4 8.8 4 8.8-8.7 4.4-1.6 9.6-9.6-1.5L32 60l-6.5-7.2-9.6 1.5-1.6-9.6-8.7-4.4 4-8.8-4-8.8 8.7-4.4 1.6-9.6 9.6 1.5z" fill="#ffcf1f" stroke="#1c2250" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<ellipse cx="32" cy="45" rx="15" ry="6.5" fill="#1c2250"/>' +
      '<rect x="17" y="38" width="30" height="8" rx="4" fill="#22b8ff" stroke="#1c2250" stroke-width="3"/>' +
      '<rect x="29.5" y="23" width="5" height="17" rx="2.5" fill="#1c2250"/>' +
      '<circle cx="32" cy="20" r="9" fill="#ff4f6d" stroke="#1c2250" stroke-width="3.5"/>' +
      '<circle cx="29" cy="17" r="2.8" fill="#fff" opacity=".85"/>' +
      '<circle cx="42" cy="42" r="2.2" fill="#ffcf1f"/>' +
      '</g>';
  }
  var LOGO_FS = 36;          // font size of the name, in viewBox units
  var logoTextW = 0;         // measured text width (0 = estimate)
  function logoSVG(name, textW) {
    var tw = textW || Math.round(name.length * LOGO_FS * 0.5);
    var pad = 8;             // room for the outline
    var W = Math.ceil(pad + tw + pad + 6 + 64);
    var cx = pad + tw / 2;
    var base = 44;
    var txt = esc(name);
    // RTL: the badge sits at the right (start) side, the name to its left.
    return '<svg class="logo-svg" viewBox="0 -4 ' + W + ' 70" role="img" aria-label="' + esc(name) + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<linearGradient id="logoRainbow" x1="1" y1="0" x2="0" y2="0">' +
          '<stop offset="0" stop-color="#ff4f6d"/><stop offset=".22" stop-color="#ff9f1c"/>' +
          '<stop offset=".42" stop-color="#ffd21f"/><stop offset=".6" stop-color="#3ddc84"/>' +
          '<stop offset=".8" stop-color="#22b8ff"/><stop offset="1" stop-color="#a66bff"/>' +
        '</linearGradient>' +
        '<linearGradient id="logoShine" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<g transform="translate(' + (W - 64) + ' 0)">' + iconSVG() + '</g>' +
      '<g class="logo-word">' +
        '<text class="lw lw-shadow" x="' + cx + '" y="' + (base + 4) + '" fill="#1c2250" stroke="#1c2250" stroke-width="8" stroke-linejoin="round">' + txt + '</text>' +
        '<text class="lw lw-main" x="' + cx + '" y="' + base + '" fill="url(#logoRainbow)" stroke="#1c2250" stroke-width="7" stroke-linejoin="round" paint-order="stroke">' + txt + '</text>' +
        '<text class="lw lw-shine" x="' + cx + '" y="' + base + '" fill="url(#logoShine)">' + txt + '</text>' +
      '</g>' +
      '<g class="logo-spark" fill="#fff" stroke="#1c2250" stroke-width="1.6" stroke-linejoin="round">' +
        '<path class="sp1" d="M' + (pad + 2) + ' 6l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z"/>' +
        '<path class="sp2" d="M' + (W - 70) + ' 2l1.5 3.3 3.3 1.5-3.3 1.5-1.5 3.3-1.5-3.3-3.3-1.5 3.3-1.5z"/>' +
      '</g>' +
      '</svg>';
  }
  function drawLogo() {
    var el = $('#logo');
    if (el) el.innerHTML = logoSVG(SITE.name, logoTextW);
  }
  // Once the font is ready, fit the viewBox to the real text width.
  function fitLogo() {
    try {
      var t = $('.logo-svg .lw-main');
      if (!t) return;
      var w = Math.ceil(t.getComputedTextLength());
      if (w > 20 && w < 900 && Math.abs(w - logoTextW) > 1) { logoTextW = w; drawLogo(); }
    } catch (e) { /* keep the estimate */ }
  }

  /* ------------------------------------------------------------- tiles */
  // Fallback title size (container-query units) by title length, so long
  // Arabic titles still fit in two lines inside the tile.
  function fbSize(title) {
    var n = title.length, longest = 0;
    title.split(/\s+/).forEach(function (w) { longest = Math.max(longest, w.length); });
    var s = n <= 8 ? 15 : n <= 12 ? 13.5 : n <= 16 ? 12 : 10.5;
    // A single long word must fit on one line: roughly 0.55em per letter.
    s = Math.min(s, 80 / Math.max(1, longest * 0.55));
    return Math.max(8, Math.round(s * 10) / 10);
  }
  function tileHTML(g, opts) {
    opts = opts || {};
    var cls = 'tile' + (opts.big ? ' big' : '') + (opts.cls ? ' ' + opts.cls : '');
    var badges = '';
    if (g.hot) badges += '<b class="badge hot"><span aria-hidden="true">🔥</span>' + T.hotBadge + '</b>';
    if (isMulti(g)) badges += '<b class="badge p2"><span aria-hidden="true">👥</span>' + T.p2Badge + '</b>';
    return '<a class="' + cls + '" href="#/play/' + enc(g.slug) + '" data-slug="' + esc(g.slug) + '"' +
      ' style="--c:' + g.color + ';--c2:' + deepen(g.color, 0.45) + ';--fbs:' + fbSize(g.title) + 'cqw" aria-label="' + esc(g.title) + '">' +
      '<span class="art">' +
        '<span class="fb" aria-hidden="true"><span class="fb-emoji">' + catEmoji(g) + '</span><span class="fb-title">' + esc(g.title) + '</span></span>' +
        '<img src="games/' + esc(g.slug) + '/thumb.svg" alt="" loading="lazy" decoding="async" draggable="false"' +
        ' onload="this.parentNode.parentNode.classList.add(\'loaded\')"' +
        ' onerror="this.parentNode.parentNode.classList.add(\'noimg\');this.parentNode.removeChild(this)">' +
      '</span>' +
      (badges ? '<span class="badges">' + badges + '</span>' : '') +
      '<span class="label" aria-hidden="true">' + esc(g.title) + '</span>' +
      '</a>';
  }
  function gridHTML(list, cls) {
    return '<div class="grid ' + (cls || '') + '">' + list.map(function (g) { return tileHTML(g); }).join('') + '</div>';
  }
  // Mosaic: big (2x2) tiles for hot games plus 1x1 tiles, packed in JS so there are no holes.
  function mosaicHTML(bigs, smalls, fill) {
    return '<div class="grid mosaic" data-fill="' + (fill ? 1 : 0) + '">' +
      bigs.map(function (g) { return tileHTML(g, { big: true }).replace('<a ', '<a data-hot="1" '); }).join('') +
      smalls.map(function (g) { return tileHTML(g); }).join('') +
      '</div>';
  }

  function sectionHTML(icon, title, inner, more) {
    return '<section class="sec">' +
      '<div class="sec-head"><h2><span class="sec-icon" aria-hidden="true">' + icon + '</span><span>' + esc(title) + '</span></h2>' + (more || '') + '</div>' +
      inner + '</section>';
  }

  // A section that sits in a .cat-rows grid, spanning as many columns as it has tiles (at least minSpan).
  function rowSecHTML(icon, title, list, gridCls, minSpan) {
    return '<section class="sec cat-sec" data-n="' + list.length + '" data-min="' + (minSpan || 1) + '">' +
      '<div class="sec-head"><h2><span class="sec-icon" aria-hidden="true">' + icon + '</span><span class="h-txt">' + esc(title) + '</span></h2></div>' +
      gridHTML(list, gridCls) + '</section>';
  }

  /* ------------------------------------------------------------ layout */
  var cols = 8;
  function packMosaic(el) {
    // Work in the original (catalog) order, even after an earlier pass reordered the DOM.
    var kids = Array.prototype.slice.call(el.children);
    kids.forEach(function (k, i) { if (k.__i == null) k.__i = i; });
    kids.sort(function (a, b) { return a.__i - b.__i; });
    var hot = kids.filter(function (k) { return k.getAttribute('data-hot') === '1'; });
    var plain = kids.filter(function (k) { return k.getAttribute('data-hot') !== '1'; });
    var fill = el.getAttribute('data-fill') === '1';
    var bigSize = cols >= 4 ? 2 : 1;
    var C = cols;            // columns used by this mosaic (may be fewer than the grid has)
    // B = how many hot tiles stay big (the rest are shown small), S = how many small tiles are used,
    // v = which ordering to try (0/1 evenly spread, 2+ seeded random mixes, 'first' = bigs first).
    function order(B, S, v) {
      var bigs = hot.slice(0, B), smalls = hot.slice(B).concat(plain).slice(0, S);
      var n = B + S, out = [], bi = 0, si = 0, i;
      if (v === 'first') return { list: bigs.concat(smalls), big: B };
      var isBig = [];
      if (v < 2) {
        var off = v === 0 ? 0 : 0.5;
        for (i = 0; i < B; i++) isBig[Math.min(n - 1, Math.floor((i + off) * n / Math.max(B, 1)))] = true;
      } else {
        var seed = v * 9301 + C * 49297, left = B;
        for (i = 0; i < n; i++) {
          seed = (seed * 9301 + 49297) % 233280;
          if (left && (seed / 233280) < left / (n - i)) { isBig[i] = true; left--; }
        }
      }
      for (i = 0; i < n; i++) {
        if (isBig[i] && bi < B) out.push(bigs[bi++]);
        else if (si < S) out.push(smalls[si++]);
        else out.push(bigs[bi++]);
      }
      return { list: out, big: B };
    }
    function sim(o) {
      var grid = [], pos = [], used = 0;
      function free(r, c, s) {
        if (c + s > C) return false;
        for (var y = r; y < r + s; y++) for (var x = c; x < c + s; x++) if (grid[y] && grid[y][x]) return false;
        return true;
      }
      for (var i = 0; i < o.list.length; i++) {
        var s = o.list[i].__big ? bigSize : 1;
        var placed = false;
        for (var r = 0; !placed; r++) {
          for (var c = 0; c + s <= C; c++) {
            if (free(r, c, s)) {
              for (var y = r; y < r + s; y++) { grid[y] = grid[y] || []; for (var x = c; x < c + s; x++) grid[y][x] = 1; }
              pos.push([r, c, s]); used += s * s; placed = true; break;
            }
          }
        }
      }
      return { pos: pos, holes: grid.length * C - used };
    }
    function mark(B) { hot.forEach(function (k, i) { k.__big = i < B; }); plain.forEach(function (k) { k.__big = false; }); }
    var best = null, bestO = null;
    function attempt(B, S, v) {
      mark(B);
      var o = order(B, S, v), res = sim(o);
      if (!best || res.holes < best.holes) { best = res; bestO = o; }
      return res.holes === 0;
    }
    var done = false, d, B, S, v, poolN, minS;
    if (!fill) {
      // Category pages: every game must show. Use the widest block that has no
      // holes (a hot tile may shrink to 1x1 if it must); else the full width.
      for (d = 0; d <= hot.length && !done && bigSize > 1 && hot.length; d++) {
        B = hot.length - d; S = plain.length + d;
        if (!B) break;
        for (C = cols; C >= 2 && !done; C--) {
          best = null;
          for (v = 0; v < 12 && !done; v++) done = attempt(B, S, v);
        }
        if (done) C++;
      }
      if (!done) { C = cols; best = null; attempt(hot.length, plain.length, 0); }
    } else {
      // Prefer: every hot tile big, then as many small tiles as possible, with a lively order.
      for (d = 0; d <= 3 && d <= hot.length && !done; d++) {
        B = hot.length - d; poolN = d + plain.length; minS = Math.min(poolN, C);
        for (S = poolN; S >= minS && !done; S--) {
          for (v = 0; v < 12 && !done; v++) done = attempt(B, S, v);
        }
      }
      for (S = plain.length; S >= 0 && !done; S--) done = attempt(hot.length, S, 'first');
    }
    mark(bestO.big);
    kids.forEach(function (k) { k.style.display = 'none'; k.classList.toggle('big', !!k.__big); });
    bestO.list.forEach(function (k, i) {
      var p = best.pos[i];
      k.style.display = '';
      k.style.gridArea = (p[0] + 1) + ' / ' + (p[1] + 1) + ' / span ' + p[2] + ' / span ' + p[2];
    });
    // Keep keyboard (Tab) order the same as the visual reading order (row by row, from the right).
    bestO.list.map(function (k, i) { return [best.pos[i][0] * 100 + best.pos[i][1], k]; })
      .sort(function (a, b) { return a[0] - b[0]; })
      .forEach(function (x) { el.appendChild(x[1]); });
  }
  function layout() {
    var app = $('#app');
    if (!app) return;
    var cs = getComputedStyle(app);
    var W = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var gap = W < 760 ? 10 : 14;
    var min = W >= 1500 ? 140 : 118;
    cols = Math.max(3, Math.floor((W + gap) / (min + gap)));
    var cell = Math.floor((W - gap * (cols - 1)) / cols);
    var rs = document.documentElement.style;
    rs.setProperty('--cols', cols);
    rs.setProperty('--gap', gap + 'px');
    rs.setProperty('--cell', cell + 'px');
    $all('.mosaic', app).forEach(packMosaic);
    $all('.one-row', app).forEach(function (el) {
      Array.prototype.forEach.call(el.children, function (k, i) { k.style.display = i < cols ? '' : 'none'; });
    });
    // Short category rows sit side by side, each spanning as many columns as it has tiles.
    $all('.cat-sec', app).forEach(function (sec) {
      var n = Math.min(cols, Math.max(+sec.getAttribute('data-n') || 1, +sec.getAttribute('data-min') || 1));
      sec.style.gridColumn = 'span ' + n;
      sec.classList.toggle('narrow', n <= 2);
      var g = $('.grid', sec);
      if (g) g.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
    });
    fitStage();
  }

  /* ------------------------------------------------------------ search */
  // Arabic-aware normalizing: no tashkeel/tatweel, one form of alef, ة→ه, ى→ي,
  // ؤ→و, ئ→ي, Arabic-Indic digits → 0-9, Latin lowercased.
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ٰٟۖ-ۭ]/g, '')
      .replace(/ـ/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىی]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ک/g, 'ك')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); })
      .replace(/[^a-z0-9ء-ي ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  var MULTI_WORDS = ' لاعبان لاعبين اثنان اثنين صديق صديقك صديقي اصدقاء ضد جماعي 2 two player players friend friends multiplayer versus 2p';
  var HOT_WORDS = ' رائج رائجه مشهور مشهوره حماس hot popular';
  var INDEX = {};
  function idx(g) {
    if (INDEX[g.slug]) return INDEX[g.slug];
    var cats = g.cats.map(function (id) { return CAT_BY_ID[id] ? CAT_BY_ID[id].label + ' ' + id : id; }).join(' ');
    var ix = {
      t: norm(g.title),
      en: norm((g.en || '') + ' ' + g.slug.replace(/-/g, ' ')),
      h: norm(g.title + ' ' + (g.en || '') + ' ' + g.slug.replace(/-/g, ' ') + ' ' + (g.blurb || '') + ' ' + cats +
        (isMulti(g) ? MULTI_WORDS : '') + (g.hot ? HOT_WORDS : ''))
    };
    ix.words = (ix.t + ' ' + ix.en).split(' ').filter(Boolean);
    INDEX[g.slug] = ix;
    return ix;
  }
  function subseq(needle, hay) {
    var j = 0;
    for (var i = 0; i < hay.length && j < needle.length; i++) if (hay[i] === needle[j]) j++;
    return j === needle.length;
  }
  // Levenshtein distance, stopping early when it's already bigger than max.
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // Also try each word without the Arabic "ال" (the) and "و" (and) prefixes.
  function variants(w) {
    var v = [w];
    if (w.length > 3 && w.indexOf('ال') === 0) v.push(w.slice(2));
    if (w.length > 3 && w[0] === 'و') v.push(w.slice(1));
    return v;
  }
  function wordScore(w, ix) {
    var titles = [ix.t, ix.en], best = 0;
    variants(w).forEach(function (x, vi) {
      var s = 0;
      titles.forEach(function (t) {
        if (!t) return;
        if (t.indexOf(x) === 0) s = Math.max(s, 10);
        else if ((' ' + t).indexOf(' ' + x) >= 0 || (' ' + t).indexOf(' ال' + x) >= 0) s = Math.max(s, 7);
        else if (x.length >= 4 && t.indexOf(x) >= 0) s = Math.max(s, 5); // inside a word: only longer bits
      });
      if (!s && ((' ' + ix.h).indexOf(' ' + x) >= 0 || (' ' + ix.h).indexOf(' ال' + x) >= 0)) s = 3;
      if (!s && x.length >= 4 && ix.h.indexOf(x) >= 0) s = 1;
      if (vi) s *= 0.9;
      best = Math.max(best, s);
    });
    return best;
  }
  function search(q) {
    var words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    var scored = [];
    GAMES.forEach(function (g) {
      var ix = idx(g), score = 0;
      var all = words.every(function (w) { var s = wordScore(w, ix); score += s; return s > 0; });
      if (all) scored.push([score + (g.hot ? 0.5 : 0), g]);
    });
    if (!scored.length) {
      // Forgiving fallback for spelling slips: close words (1-2 letters off),
      // or the letters in order inside the title.
      var flat = words.join('');
      GAMES.forEach(function (g) {
        var ix = idx(g), score = 0;
        var ok = words.every(function (w) {
          if (w.length < 3) return true;
          var max = w.length >= 6 ? 2 : 1, bestD = max + 1;
          ix.words.forEach(function (tw) {
            variants(tw).forEach(function (x) {
              bestD = Math.min(bestD, lev(w, x, max));
              if (x.length > w.length) bestD = Math.min(bestD, lev(w, x.slice(0, w.length), max));
            });
          });
          if (bestD <= max) { score += 3 - bestD; return true; }
          return false;
        });
        if (ok && score > 0) scored.push([score, g]);
        else if (flat.length >= 3 && (subseq(flat, ix.t.replace(/ /g, '')) || subseq(flat, ix.en.replace(/ /g, '')))) scored.push([0.5, g]);
      });
    }
    scored.sort(function (a, b) { return b[0] - a[0]; });
    return scored.map(function (s) { return s[1]; });
  }

  /* ------------------------------------------------------------ routes */
  function parseRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var head = parts[0];
    var rest = dec(parts.slice(1).join('/'));
    if (head === 'c' && rest) return { name: 'cat', id: rest };
    if (head === 'search') return { name: 'search', q: rest };
    if (head === 'play' && rest) return { name: 'play', slug: rest };
    return { name: 'home' };
  }

  function chipsHTML(route) {
    var html = '<a class="chip' + (route.name === 'home' ? ' on' : '') + '" href="#/" style="--cc:#1c2250"' + (route.name === 'home' ? ' aria-current="page"' : '') + '>' +
      '<span class="chip-ico" aria-hidden="true">🏠</span>' + T.home + '</a>';
    CATS.forEach(function (c) {
      var on = route.name === 'cat' && route.id === c.id;
      html += '<a class="chip' + (on ? ' on' : '') + '" href="#/c/' + enc(c.id) + '" style="--cc:' + catColor(c.id) + '"' + (on ? ' aria-current="page"' : '') + '>' +
        '<span class="chip-ico" aria-hidden="true">' + esc(c.icon || '🎮') + '</span>' + esc(c.label) + '</a>';
    });
    return html;
  }

  function hotList() {
    var hot = GAMES.filter(function (g) { return g.hot; });
    return hot.length ? hot : GAMES.slice(0, 12);
  }

  function renderHome() {
    var html = '';
    var hot = GAMES.filter(function (g) { return g.hot; });
    var rest = GAMES.filter(function (g) { return !g.hot; });
    if (!GAMES.length) {
      return '<div class="empty"><div class="empty-emoji">🛠️</div><h2>' + T.soon + '</h2><p>' + T.soonSub + '</p></div>';
    }
    var tag = SITE.tagline ? '<span class="tagline">' + esc(SITE.tagline) + '</span>' : '';
    html += sectionHTML('🔥', T.hot, mosaicHTML(hot, rest, true), tag);

    var recent = getRecent();
    var favs = getFavs();
    if (recent.length || favs.length) {
      html += '<div class="cat-rows mine">';
      if (recent.length) html += rowSecHTML('🕹️', T.recent, recent.map(function (s) { return BY_SLUG[s]; }), 'one-row', 3);
      if (favs.length) html += rowSecHTML('❤️', T.favs, favs.map(function (s) { return BY_SLUG[s]; }), '', 3);
      html += '</div>';
    }
    html += '<div class="cat-rows">';
    CATS.forEach(function (c) {
      var list = gamesIn(c.id);
      html += '<section class="sec cat-sec" data-n="' + list.length + '">' +
        '<div class="sec-head"><h2><a href="#/c/' + enc(c.id) + '"><span class="sec-icon" aria-hidden="true">' + esc(c.icon || '🎮') + '</span><span class="h-txt">' + esc(c.label) + '</span></a></h2>' +
        '<a class="see-all" href="#/c/' + enc(c.id) + '" aria-label="' + esc(T.seeAllAria + c.label) + '"><span class="sa-txt">' + T.seeAll + '</span><b>' + list.length + '</b><span class="sa-arr" aria-hidden="true">‹</span></a></div>' +
        gridHTML(list, 'one-row') + '</section>';
    });
    html += '</div>';
    var abc = GAMES.slice().sort(function (a, b) { return a.title.localeCompare(b.title, 'ar'); });
    html += sectionHTML('🎮', T.all, gridHTML(abc), '<span class="count">' + nGames(GAMES.length) + '</span>');
    return html;
  }

  function renderCat(route) {
    var c = CAT_BY_ID[route.id];
    var list = c ? gamesIn(c.id) : [];
    if (!c || !list.length) return notFound(T.noCat);
    var hot = list.filter(function (g) { return g.hot; });
    var rest = list.filter(function (g) { return !g.hot; });
    var others = GAMES.filter(function (g) { return list.indexOf(g) < 0; });
    return '<div class="banner" style="--cc:' + catColor(c.id) + '">' +
        '<span class="banner-ico" aria-hidden="true">' + esc(c.icon || '🎮') + '</span>' +
        '<div><h1>' + esc(c.label) + '</h1><p>' + nGames(list.length) + T.toPlay + '</p></div>' +
      '</div>' +
      '<section class="sec">' + mosaicHTML(hot, rest, false) + '</section>' +
      (others.length ? sectionHTML('✨', T.different, gridHTML(shuffle(others.slice()).slice(0, 24))) : '');
  }

  function renderSearch(route) {
    var q = (route.q || '').trim();
    var res = search(q);
    var head = '<div class="banner search-banner" style="--cc:#00a6ff"><span class="banner-ico" aria-hidden="true">🔍</span><div>' +
      '<h1>' + (q ? '«<bdi>' + esc(q) + '</bdi>»' : T.searchTitle) + '</h1>' +
      '<p>' + (q ? (res.length ? T.found(res.length) : T.searchNone) : T.searchPrompt) + '</p></div></div>';
    if (res.length) {
      // A few results only: suggest more games under them (one row, hot ones first).
      var others = res.length < 8 ? GAMES.filter(function (g) { return res.indexOf(g) < 0; })
        .sort(function (a, b) { return (b.hot ? 1 : 0) - (a.hot ? 1 : 0); }) : [];
      return head + '<section class="sec">' + gridHTML(res) + '</section>' +
        (others.length ? sectionHTML('💖', T.more, gridHTML(others, 'one-row')) : '');
    }
    if (!q) {
      var abc = GAMES.slice().sort(function (a, b) { return a.title.localeCompare(b.title, 'ar'); });
      return head + sectionHTML('🎮', T.all, gridHTML(abc), '<span class="count">' + nGames(GAMES.length) + '</span>');
    }
    return head + '<div class="empty small"><div class="empty-emoji">🙈</div><p>' + T.noMatch + '</p></div>' +
      sectionHTML('🔥', T.hot, gridHTML(hotList()));
  }

  function notFound(msg) {
    return '<div class="empty"><div class="empty-emoji">🙈</div><h2>' + T.oops + '</h2><p>' + esc(msg) + '</p>' +
      '<a class="big-btn" href="#/">' + T.back + '</a></div>' +
      (GAMES.length ? sectionHTML('🔥', T.hot, gridHTML(hotList())) : '');
  }

  var MOUSE_RE = /انقر|نقر|الفأرة|فأرة|الماوس|اسحب|سحب|click|mouse|drag/i;
  function keycap(k) {
    var s = String(k);
    var mouse = MOUSE_RE.test(s);
    var ar = /[؀-ۿ]/.test(s);
    var cls = 'kc' + (mouse ? ' mouse' : '') + (s.length > 2 && !mouse ? ' wide' : '');
    return '<kbd class="' + cls + '" dir="' + (ar ? 'rtl' : 'ltr') + '">' + (mouse ? '<span class="kc-ico" aria-hidden="true">🖱️</span>' : '') + '<span>' + esc(s) + '</span></kbd>';
  }
  function controlsHTML(g) {
    var rows = g.controls.map(function (c) {
      // Keys keep keyboard order (← → reads left to right) even on an RTL page.
      var keys = (Array.isArray(c.keys) ? c.keys : [c.keys]).map(keycap).join('');
      return '<li><span class="keys" dir="ltr">' + keys + '</span><span class="act">' + esc(c.action || '') + '</span></li>';
    }).join('');
    return '<div class="card controls"><h3>🎮 ' + T.controls + '</h3>' +
      (rows ? '<ul class="ctl-list">' + rows + '</ul>' : '<p class="muted">' + T.controlsNone + '</p>') +
      (g.blurb ? '<p class="blurb">' + esc(g.blurb) + '</p>' : '') + '</div>';
  }
  var FS_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderPlay(route) {
    var g = BY_SLUG[route.slug];
    if (!g) return notFound(T.noGame);
    var fav = isFav(g.slug);
    var cats = g.cats.filter(function (id) { return CAT_BY_ID[id]; }).map(function (id) {
      var c = CAT_BY_ID[id];
      return '<a class="mini-chip" href="#/c/' + enc(id) + '" style="--cc:' + catColor(id) + '"><span aria-hidden="true">' + esc(c.icon || '') + '</span> ' + esc(c.label) + '</a>';
    }).join('');
    var pl = '<span class="players">' + playersLabel(g.players) + '</span>';

    // Related: shared categories first (most overlap), then hot, then the rest.
    var more = GAMES.filter(function (o) { return o !== g; }).map(function (o) {
      var shared = o.cats.filter(function (id) { return g.cats.indexOf(id) >= 0; }).length;
      return [shared * 10 + (o.hot ? 2 : 0) + Math.random(), o];
    }).sort(function (a, b) { return b[0] - a[0]; }).map(function (x) { return x[1]; });

    return '<div class="play" id="play">' +
        '<div class="play-main" id="playMain">' +
          '<div class="stage-wrap" id="stageWrap">' +
            '<div class="stage loading" id="stage" style="--c:' + g.color + '">' +
              '<div class="stage-loading" aria-hidden="true"><svg viewBox="0 0 64 64" width="84" height="84">' + iconSVG() + '</svg><span>' + T.loading + esc(g.title) + '…</span></div>' +
              '<div class="stage-msg" id="stageMsg" hidden><div class="empty-emoji">🛠️</div><b>' + T.building + '</b><span>' + T.buildingSub + '</span></div>' +
            '</div>' +
            '<div class="play-bar" id="playBar">' +
              '<div class="pb-info"><h1 class="pb-title">' + esc(g.title) + '</h1><div class="pb-meta">' + pl + cats + '</div></div>' +
              '<div class="pb-btns">' +
                '<button type="button" class="pbtn fav' + (fav ? ' on' : '') + '" id="favBtn" aria-pressed="' + fav + '" title="' + (fav ? T.favOn : T.fav) + '"><span class="heart" aria-hidden="true">' + (fav ? '❤️' : '🤍') + '</span><span class="pb-lbl">' + (fav ? T.favOn : T.fav) + '</span></button>' +
                '<button type="button" class="pbtn" id="restartBtn" title="' + T.restart + '"><span aria-hidden="true">🔄</span><span class="pb-lbl">' + T.restart + '</span></button>' +
                '<button type="button" class="pbtn fs" id="fsBtn" title="' + T.fs + '">' + FS_ICON + '<span class="pb-lbl">' + T.fs + '</span></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<aside class="play-side" id="playSide">' + controlsHTML(g) +
          '<div class="card tip"><h3>💡 ' + T.tip + '</h3><p>' + T.tip1 + '</p><p>' + T.tip2 + '</p><p>' + T.tip3 + '</p></div>' +
        '</aside>' +
      '</div>' +
      sectionHTML('💖', T.more, gridHTML(more));
  }

  /* -------------------------------------------------------- play logic */
  var current = null;   // current play slug
  function frameEl() { return $('#stage iframe'); }
  function focusGame() {
    var f = frameEl();
    if (!f) return;
    var a = document.activeElement;
    if (a && a.id === 'q') return; // don't steal focus from someone typing a search
    try { f.focus({ preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) { /* ignore */ } }
    try { if (f.contentWindow) f.contentWindow.focus(); } catch (e) { /* ignore */ }
  }
  function mountFrame(slug) {
    var stage = $('#stage');
    if (!stage) return;
    var old = frameEl();
    if (old) old.parentNode.removeChild(old);
    var msg = $('#stageMsg');
    if (msg) msg.hidden = true;
    stage.classList.add('loading');
    var f = document.createElement('iframe');
    f.setAttribute('allow', 'fullscreen *; autoplay *');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('title', (BY_SLUG[slug] || {}).title || T.gameFallback);
    f.setAttribute('scrolling', 'no');
    f.addEventListener('load', function () {
      if (frameEl() !== f) return;
      stage.classList.remove('loading');
      checkMissing(f);
      focusGame();
    });
    f.src = 'games/' + encodeURIComponent(slug) + '/index.html';
    stage.appendChild(f);
  }
  // Over http (same origin) we can tell when the game file isn't there yet.
  function checkMissing(f) {
    try {
      var d = f.contentDocument;
      if (!d || !d.body) return;
      // Every real game page has a script or a canvas; a server's 404 page doesn't.
      if (!d.querySelector('script, canvas')) {
        var msg = $('#stageMsg');
        if (msg) msg.hidden = false;
        f.style.visibility = 'hidden';
      }
    } catch (e) { /* cross-origin (file://): can't tell, that's fine */ }
  }
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function exitFullscreen() {
    try {
      var fn = document.exitFullscreen || document.webkitExitFullscreen;
      if (fn && isFullscreen()) { var p = fn.call(document); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { /* ignore */ }
  }
  function toggleFullscreen() {
    var stage = $('#stage');
    if (!stage) return;
    try {
      if (isFullscreen()) { exitFullscreen(); return; }
      var fn = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (!fn) { toast(T.fsNone); return; }
      var p = fn.call(stage);
      if (p && p.then) {
        p.then(focusGame, function () { toast(T.fsFail); });
      } else focusGame();
    } catch (e) {
      toast(T.fsFail);
    }
  }
  function onFsChange() {
    var b = $('#fsBtn');
    if (b) {
      var lbl = isFullscreen() ? T.fsExit : T.fs;
      $('.pb-lbl', b).textContent = lbl;
      b.title = lbl;
    }
    setTimeout(focusGame, 50);
  }
  function heartBurst(btn) {
    var r = btn.getBoundingClientRect();
    for (var i = 0; i < 7; i++) {
      var h = document.createElement('span');
      h.className = 'burst';
      h.textContent = ['❤️', '💖', '✨', '💗'][i % 4];
      h.style.left = (r.left + r.width / 2) + 'px';
      h.style.top = (r.top + r.height / 2) + 'px';
      h.style.setProperty('--dx', Math.round(Math.cos(i / 7 * 6.28) * 60) + 'px');
      h.style.setProperty('--dy', Math.round(Math.sin(i / 7 * 6.28) * 40 - 50) + 'px');
      document.body.appendChild(h);
      setTimeout((function (el) { return function () { if (el.parentNode) el.parentNode.removeChild(el); }; })(h), 900);
    }
  }
  function setupPlay(slug) {
    pushRecent(slug);
    mountFrame(slug);
    var stage = $('#stage');
    stage.addEventListener('mousedown', focusGame);
    stage.addEventListener('click', focusGame);
    $('#favBtn').addEventListener('click', function (e) {
      var on = toggleFav(slug);
      var b = this;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      b.title = on ? T.favOn : T.fav;
      $('.heart', b).textContent = on ? '❤️' : '🤍';
      $('.pb-lbl', b).textContent = on ? T.favOn : T.fav;
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if (on) { heartBurst(b); toast(T.favAdded); } else toast(T.favRemoved);
      // After a mouse click the keys go back to the game (so Space doesn't press this button again).
      if (e.detail) focusGame();
    });
    $('#restartBtn').addEventListener('click', function () {
      var b = this;
      b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
      mountFrame(slug);
    });
    $('#fsBtn').addEventListener('click', toggleFullscreen);
  }

  // Size the 16:9 frame as big as possible while it and the bar fit on screen.
  function fitStage() {
    var wrap = $('#stageWrap');
    if (!wrap) return;
    if (isFullscreen()) return; // the frame fills the screen; re-fit after leaving
    var play = $('#play'), side = $('#playSide'), bar = $('#playBar'), stage = $('#stage');
    var wide = window.innerWidth >= 1200;
    var ps = getComputedStyle(play);
    var availW = play.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
    if (wide) availW -= (side.offsetWidth || 270) + 20;
    // Measure where the frame really starts, plus the bar's gap, and keep 10px of air below.
    var stageTop = stage.getBoundingClientRect().top + (window.pageYOffset || 0);
    var fixed = stageTop + (parseFloat(getComputedStyle(bar).marginTop) || 0) + 10;
    var w = 0;
    for (var pass = 0; pass < 2; pass++) {
      var availH = window.innerHeight - fixed - bar.offsetHeight;
      w = Math.floor(Math.max(300, Math.min(availW, availH * 16 / 9)));
      wrap.style.width = w + 'px';
    }
    side.style.width = wide ? '' : w + 'px';
  }

  /* ------------------------------------------------------------ render */
  var typing = false;
  function render() {
    var route = parseRoute();
    var app = $('#app');
    var body = document.body;
    if (current && route.name !== 'play') exitFullscreen();
    body.className = 'route-' + route.name;
    $('#chips').innerHTML = chipsHTML(route);
    var q = $('#q');
    if (route.name !== 'search') {
      q.value = '';
      if (document.activeElement === q && route.name === 'play') q.blur();
    }
    if (route.name === 'search' && document.activeElement !== q) q.value = route.q || '';

    var html, title, name = noEmoji(SITE.name);
    current = null;
    if (route.name === 'play') {
      var g = BY_SLUG[route.slug];
      html = renderPlay(route);
      title = (g ? g.title : T.titleNotFound) + ' — ' + name;
      if (g) current = g.slug;
      else body.className = 'route-missing';
    } else if (route.name === 'cat') {
      html = renderCat(route);
      var c = CAT_BY_ID[route.id];
      title = (c ? noEmoji(c.label) + ' — ' : '') + name;
    } else if (route.name === 'search') {
      html = renderSearch(route);
      title = (route.q ? T.titleSearch + route.q : T.searchTitle) + ' — ' + name;
    } else {
      html = renderHome();
      var tag = noEmoji(SITE.tagline);
      title = name + (tag ? ' — ' + tag : '');
    }
    app.innerHTML = html;
    document.title = title;
    layout();
    if (current) setupPlay(current);
    if (!typing) window.scrollTo(0, 0);
    typing = false;
  }

  /* ------------------------------------------------------------ events */
  function go(hash, replace) {
    if (location.hash === hash) { render(); return; }
    if (replace) location.replace(hash); else location.hash = hash;
  }

  function surprise() {
    if (!GAMES.length) return;
    var pool = GAMES.filter(function (g) { return g.slug !== current; });
    var g = pool[Math.floor(Math.random() * pool.length)] || GAMES[0];
    var b = $('#surprise');
    b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll');
    go('#/play/' + enc(g.slug));
  }

  var SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ' ': 1, Spacebar: 1, PageUp: 1, PageDown: 1 };
  function onKey(e) {
    var t = e.target;
    var inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    // A focused button or link keeps Space/Enter for itself (keyboard users).
    var onControl = t && (t.tagName === 'BUTTON' || t.tagName === 'A') && (e.key === ' ' || e.key === 'Spacebar');
    if (current && !inField && !onControl && SCROLL_KEYS[e.key]) {
      // In the play view keys belong to the game, never to page scrolling.
      e.preventDefault();
      focusGame();
      return;
    }
    // "/" focuses the search box (the same key is "ظ" on an Arabic keyboard).
    if (!current && !inField && (e.key === '/' || e.code === 'Slash') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      $('#q').focus();
    }
  }

  function init() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    drawLogo();
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitLogo(); layout(); });
      if (document.fonts && document.fonts.load) document.fonts.load('700 36px Fredoka', SITE.name).then(fitLogo, function () {});
    } catch (e) { /* ignore */ }
    setTimeout(fitLogo, 600);

    var skip = $('.skip');
    if (skip) skip.addEventListener('click', function (e) {
      e.preventDefault();
      var target = current ? $('#favBtn') : $('#app .tile, #app a, #app button');
      if (current) focusGame();
      else if (target) target.focus();
    });

    var q = $('#q');
    q.addEventListener('input', function () {
      var v = q.value.replace(/^\s+/, '');
      var onSearch = parseRoute().name === 'search';
      typing = true;
      if (v) go('#/search/' + enc(v), onSearch);
      else if (onSearch) go('#/', true);
      else typing = false;
    });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { q.value = ''; q.blur(); if (parseRoute().name === 'search') go('#/', true); }
    });
    $('#searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var res = search(q.value);
      if (res.length === 1) { q.blur(); go('#/play/' + enc(res[0].slug)); return; }
      // Several results: hand keyboard focus to the first one.
      var first = $('#app .tile');
      if (res.length && first) first.focus(); else q.blur();
    });
    $('#surprise').addEventListener('click', surprise);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', render);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    var rt = 0, lastW = 0;
    window.addEventListener('resize', function () {
      fitStage();
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (window.innerWidth !== lastW) { lastW = window.innerWidth; layout(); } else fitStage();
      }, 120);
    });
    lastW = window.innerWidth;
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

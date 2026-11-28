/*
 * "ألعاب الفسحة" portal (Arabic, right-to-left). Plain script (no modules, no
 * fetch) so the site also works when index.html is opened straight from a
 * folder (file://).
 *
 * Routes (hash based):
 *   #/                home (Poki-grade Bento Hero + curated shelves)
 *   #/c/<category>    consolidated category group or single catalog category
 *   #/quick/<filter>  quick filter (hot, friends, simple, short)
 *   #/favorites       saved favorites
 *   #/search/<text>   (old links) the home page
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
    exitHint: 'اضغط <b>Shift + Tab</b> من مساحة اللعب للعودة إلى أزرار اللعبة خارج الإطار.',
    home: 'الرئيسية',
    hot: 'الأكثر حماسًا الآن',
    hotNav: 'الأكثر حماسًا',
    hotShelf: 'اختيارات الفسحة الذهبية',
    hotHint: 'أكثر الألعاب حماسًا وإثارة باختيار طلاب الصف.',
    friendsNav: 'لاعبان',
    friendsShelf: 'العب مع صديقك!',
    newShelf: 'جديد في الفسحة',
    newBadge: 'جديد',
    recent: 'تابع اللعب',
    favs: 'مفضّلتي',
    favsShelf: 'مفضّلتك',
    favsTitle: 'ألعابك المفضلة',
    all: 'كل الألعاب',
    seeAll: 'عرض الكل',
    favsEmpty: 'لم تضف ألعابًا للمفضلة بعد',
    favsPrompt: 'اضغط رمز القلب على أي بطاقة أو داخل اللعبة لحفظها هنا.',
    more: 'ألعاب أخرى ستحبها',
    toPlay: ' تنتظرك!',
    found: function (n) { return n === 1 ? 'وجدنا لعبة واحدة' : n === 2 ? 'وجدنا لعبتين' : 'وجدنا ' + nGames(n); },
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
    controlsMore: function (n) { return '+ عرض الكل (' + n + ')'; },
    controlsLess: 'عرض أقل',
    help: 'نصائح ومعلومات',
    tip1: 'المفاتيح لا تعمل؟ <b>انقر على اللعبة</b> أولًا!',
    tip2: 'اضغط <b>ملء الشاشة</b> لتكبير اللعبة.',
    tip3: 'اضغط <b>P</b> أو <b>Esc</b> للإيقاف المؤقت، وزر 🔊 لكتم الصوت.',
    fav: 'أضف للمفضلة',
    favOn: 'في المفضلة',
    favAdded: 'أُضيفت إلى ألعابك المفضلة ❤️',
    favRemoved: 'أُزيلت من المفضلة',
    favTemporary: 'تعذّر الحفظ؛ التغيير مؤقت حتى تحديث الصفحة.',
    restart: 'أعد التشغيل',
    fs: 'ملء الشاشة',
    fsExit: 'خروج من ملء الشاشة',
    fsNone: 'ملء الشاشة غير متاح هنا. جرّب زر F11!',
    fsFail: 'لم يعمل ملء الشاشة. جرّب زر F11!',
    loading: 'جارٍ تحميل ',
    loadFailed: 'تعذّر تشغيل اللعبة',
    loadFailedSub: 'أعد المحاولة، أو ارجع واختر لعبة أخرى. تقدّمك المحفوظ يبقى كما هو.',
    retry: 'أعد المحاولة',
    returnGames: 'العودة إلى الألعاب',
    backShort: 'الألعاب',
    shortRound: 'جولة قصيرة',
    oneButton: 'زر واحد',
    playFriend: 'العب مع صديق',
    estimates: 'الأوقات تقريبية وتختلف حسب اللاعب؛ ألعاب الجولة القصيرة تستغرق عادة 3 دقائق أو أقل.',
    openEnded: 'لعب مفتوح',
    // Isolate the numeric range so RTL prose keeps its low-to-high order in
    // both the visible label and the plain-text tile tooltip.
    duration: function (min, max) { return 'حوالي \u2066' + min + '–' + max + '\u2069 ' + minutesWord(max) + ' للجولة'; },
    pointer: 'الفأرة',
    keyboard: 'لوحة المفاتيح',
    mixedInput: 'الفأرة ولوحة المفاتيح',
    oneButtonHint: 'زر واحد أثناء اللعب؛ قد تحتاج الفأرة لاختيار القوائم والترقيات.',
    friendHint: 'العبوا معًا على الجهاز نفسه — دون حسابات.',
    titleNotFound: 'لم نجد اللعبة',
    gameFallback: 'لعبة',
    starterTitle: 'أول مرة مع الفأرة؟',
    starterAge: '\u20665–7\u2069 سنوات',
    starterHint: '✨ بلا خسارة وبلا وقت · 11 عالمًا',
    starterGo: 'ابدأ الآن',
    starterBadge: 'نقطة البداية',
    mute: 'كتم الصوت',
    nextTitle: 'العب بعدها',
    nextGo: 'هيا',
    nextClose: 'إخفاء',
    surpriseTitle: 'لعبة المفاجأة!',
    surpriseSpin: 'نختار لك لعبة رائعة…',
    surprisePlay: 'العب الآن! ▶',
    surpriseReroll: 'لفّ مرة أخرى 🎲',
    surpriseClose: 'إغلاق'
  };
  // Arabic counting: 1 لعبة واحدة, 2 لعبتان, 3-10 ألعاب, 11+ لعبة.
  function nGames(n) {
    if (n === 1) return 'لعبة واحدة';
    if (n === 2) return 'لعبتان';
    if (n >= 3 && n <= 10) return n + ' ألعاب';
    return n + ' لعبة';
  }
  // After a written number: 3-10 دقائق, otherwise دقيقة. A range follows its last number.
  function minutesWord(n) { return n >= 3 && n <= 10 ? 'دقائق' : 'دقيقة'; }
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
  // Keep every catalog game addressable by direct #/play/<slug>, while storefront
  // grids, categories, Surprise and Play-Next show only non-hidden curated games.
  var ALL_GAMES = (Array.isArray(window.GAMES) ? window.GAMES : []).filter(function (g) {
    return g && typeof g.slug === 'string' && g.slug;
  });
  var BY_SLUG = Object.create(null);
  var VISIBLE_BY_SLUG = Object.create(null);
  var GAMES = [];
  ALL_GAMES.forEach(function (g) {
    BY_SLUG[g.slug] = g;
    if (!Array.isArray(g.cats)) g.cats = [];
    if (!Array.isArray(g.controls)) g.controls = [];
    g.title = String(g.title || g.slug);
    g.color = /^#[0-9a-f]{3,8}$/i.test(g.color || '') ? g.color : '#4f7cff';
    if (!g.hidden) {
      GAMES.push(g);
      VISIBLE_BY_SLUG[g.slug] = g;
    }
  });
  var CAT_BY_ID = Object.create(null);
  ALL_CATS.forEach(function (c) { if (c && c.id) CAT_BY_ID[c.id] = c; });
  // White labels on these colors meet WCAG AA (>= 4.5:1) for normal-size text.
  var CAT_COLORS = ['#a74200', '#b71c4a', '#6940bd', '#0e7540', '#0064a8', '#ae2566', '#806000', '#08776d'];
  // Consolidated 1-row storefront category groups (all 11 catalog category IDs still resolve directly).
  var NAV_GROUPS = [
    { id: 'speed', label: 'سرعة وسباق', icon: '🏎️', color: '#a74200', cats: ['racing', 'running', 'sports'] },
    { id: 'action', label: 'أكشن وتصويب', icon: '🎯', color: '#b71c4a', cats: ['shooter', 'battle', 'strategy'] },
    { id: 'brain', label: 'ألغاز وتفكير', icon: '🧩', color: '#0e7540', cats: ['puzzle', 'idle'] },
    { id: 'skills', label: 'مهارات وتحدي', icon: '⌨️', color: '#0064a8', cats: ['challenge', 'arcade'] }
  ];
  var NAV_GROUP_BY_ID = Object.create(null);
  NAV_GROUPS.forEach(function (grp) { NAV_GROUP_BY_ID[grp.id] = grp; });

  var QUICK = Object.create(null);
  QUICK.hot = { label: T.hotNav, icon: '🔥', color: '#c42718', src: 'featured', note: T.hotHint, match: function (g) { return !!g.hot; } };
  QUICK.friends = { label: T.playFriend, icon: '👥', color: '#5936b8', src: 'quick', note: T.friendHint, match: isMulti };
  QUICK.simple = { label: T.oneButton, icon: '👆', color: '#384d91', src: 'quick', note: T.oneButtonHint, match: function (g) { return g.inputStyle === 'one-button'; } };
  QUICK.short = { label: T.shortRound, icon: '⏱️', color: '#0064a8', src: 'quick', note: T.estimates, match: function (g) { return Array.isArray(g.roundMinutes) && g.roundMinutes[1] <= 3; } };
  var INPUT_LABELS = { 'one-button': T.oneButton, pointer: T.pointer, keyboard: T.keyboard, mixed: T.mixedInput };
  function durationLabel(g) {
    return Array.isArray(g.roundMinutes) ? T.duration(g.roundMinutes[0], g.roundMinutes[1]) : T.openEnded;
  }

  function gamesIn(catId) {
    var grp = NAV_GROUP_BY_ID[catId];
    if (grp) return GAMES.filter(function (g) { return g.cats.some(function (id) { return grp.cats.indexOf(id) >= 0; }); });
    return GAMES.filter(function (g) { return g.cats.indexOf(catId) >= 0; });
  }
  function isMulti(g) { return /[2-9]/.test(String(g.players || '')); }
  function catEmoji(g) { var c = CAT_BY_ID[g.cats[0]]; return (c && c.icon) || '🎮'; }
  function catColor(id) {
    if (NAV_GROUP_BY_ID[id]) return NAV_GROUP_BY_ID[id].color;
    var i = ALL_CATS.findIndex(function (c) { return c.id === id; });
    return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length];
  }

  /* --------------------------------------------------------- storage */
  var KEY_RECENT = 'sg:site:recent';
  var KEY_FAVS = 'sg:site:favs';
  var temporaryFavs = null;
  function loadList(key) {
    try {
      var v = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveList(key, list) {
    try { window.localStorage.setItem(key, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function known(list) { return list.filter(function (s) { return !!VISIBLE_BY_SLUG[s]; }); }
  function getRecent() { return known(loadList(KEY_RECENT)); }
  function loadFavs() { return temporaryFavs || loadList(KEY_FAVS); }
  function getFavs() { return known(loadFavs()); }
  function isFav(slug) { return loadFavs().indexOf(slug) >= 0; }
  function pushRecent(slug) {
    var list = loadList(KEY_RECENT).filter(function (s) { return s !== slug; });
    list.unshift(slug);
    saveList(KEY_RECENT, list.slice(0, 12));
  }
  function toggleFav(slug) {
    var list = loadFavs().slice();
    var i = list.indexOf(slug);
    if (i >= 0) list.splice(i, 1); else list.unshift(slug);
    var saved = saveList(KEY_FAVS, list);
    // Keep failed changes usable across routes, and retry them on the next toggle.
    temporaryFavs = saved ? null : list;
    return { on: i < 0, saved: saved };
  }

  /* ---------------------------------------------------------- helpers */
  function $(sel, root) { return (root || document).querySelector(sel); }
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
  // Emoji and variation selectors are dropped from the tab title.
  function noEmoji(s) {
    return String(s || '').replace(/[←-⯿️‍]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g, '').replace(/\s+/g, ' ').trim();
  }

  // In fullscreen only the fullscreen element is drawn, so the toast and bursts go
  // inside it. A game's own fullscreen frame cannot hold them; they stay in the page.
  function overlayHost() {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    return fs && fs.tagName !== 'IFRAME' ? fs : document.body;
  }
  // Back to the page, where redrawing #app (and the stage in it) cannot remove it.
  function parkToast() {
    var t = $('#toast');
    if (t && t.parentNode !== document.body) document.body.appendChild(t);
  }
  var toastTimer = 0;
  function toast(msg) {
    var t = $('#toast'), host = overlayHost();
    if (!t) return;
    if (t.parentNode !== host) host.appendChild(t);
    t.textContent = msg;
    t.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  // Portal sounds (shared/juice.js) are optional: the portal works silently without them.
  function juice(name, x) {
    try { var j = window.Juice; if (j && typeof j[name] === 'function') j[name](x); } catch (e) { /* sounds are optional */ }
  }
  // No decorative motion with reduced motion.
  function calm() {
    return document.documentElement.getAttribute('data-sg-motion') === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  // A little burst of emoji flying out of an element.
  function burst(el, chars) {
    if (calm() || !el) return;
    var host = overlayHost();
    // The topbar is not drawn in fullscreen: the stars fly out of the toast instead.
    if (host !== document.body) el = $('#toast') || el;
    var r = el.getBoundingClientRect();
    for (var i = 0; i < 7; i++) {
      var h = document.createElement('span');
      h.className = 'burst';
      h.textContent = chars[i % chars.length];
      h.style.left = (r.left + r.width / 2) + 'px';
      h.style.top = (r.top + r.height / 2) + 'px';
      h.style.setProperty('--dx', Math.round(Math.cos(i / 7 * 6.28) * 60) + 'px');
      h.style.setProperty('--dy', Math.round(Math.sin(i / 7 * 6.28) * 40 - 50) + 'px');
      host.appendChild(h);
      setTimeout((function (s) { return function () { if (s.parentNode) s.parentNode.removeChild(s); }; })(h), 900);
    }
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
  // The fast build (tools/build.mjs) inlines every thumbnail as window.SG_THUMBS so the
  // home page needs no extra files; the plain source site loads games/<slug>/thumb.svg.
  function thumbSrc(slug) {
    var t = window.SG_THUMBS;
    return (t && t[slug]) || 'games/' + esc(slug) + '/thumb.svg';
  }
  function tileHTML(g, opts) {
    opts = opts || {};
    var badges = '', tip = g.title + ' · ' + durationLabel(g) + ' · ' + (INPUT_LABELS[g.inputStyle] || '');
    if (opts.hero) {
      badges += '<b class="badge badge-crown" aria-hidden="true">👑 #1</b>';
      tip += ' · ' + T.hotBadge;
    } else {
      if (g.isNew) { badges += '<b class="badge badge-new" aria-hidden="true">' + T.newBadge + '</b>'; tip += ' · ' + T.newBadge; }
      if (g.hot) { badges += '<b class="badge hot" aria-hidden="true">🔥</b>'; tip += ' · ' + T.hotBadge; }
    }
    if (g.starter) { badges += '<b class="badge start" aria-hidden="true">🖱️</b>'; tip += ' · ' + T.starterBadge; }
    if (isMulti(g)) { badges += '<b class="badge p2" aria-hidden="true">👥</b>'; tip += ' · ' + T.p2Badge; }
    var tileCls = 'tile' + (opts.hero ? ' hero-tile' : '') + (opts.compact ? ' tile-compact' : '');
    var loadMode = opts.eager ? 'eager' : 'lazy';
    var anchor = '<a class="' + tileCls + '" href="#/play/' + enc(g.slug) + '" data-slug="' + esc(g.slug) + '" title="' + esc(tip) + '"' +
      ' style="--c:' + g.color + ';--c2:' + deepen(g.color, 0.45) + ';--fbs:' + fbSize(g.title) + 'cqw" aria-label="' + esc(g.title) + '">' +
      '<span class="art">' +
        '<span class="fb" aria-hidden="true"><span class="fb-emoji">' + catEmoji(g) + '</span><span class="fb-title">' + esc(g.title) + '</span></span>' +
        '<img src="' + thumbSrc(g.slug) + '" alt="" loading="' + loadMode + '" decoding="async" draggable="false"' +
        ' onload="this.parentNode.parentNode.classList.add(\'loaded\')"' +
        ' onerror="this.parentNode.parentNode.classList.add(\'noimg\');this.parentNode.removeChild(this)">' +
      '</span>' +
      (badges ? '<span class="badges">' + badges + '</span>' : '') +
      '<span class="label" aria-hidden="true">' + esc(g.title) + '</span>' +
      '</a>';
    if (!opts.favBtn) return anchor;
    var fav = isFav(g.slug);
    var favLabel = (fav ? T.favOn : T.fav) + ': ' + g.title;
    return '<div class="tile-wrap' + (opts.hero ? ' hero-wrap' : '') + '">' + anchor +
      '<button type="button" class="tile-fav' + (fav ? ' on' : '') + '" data-fav-slug="' + esc(g.slug) + '" aria-pressed="' + fav + '" aria-label="' + esc(favLabel) + '" title="' + esc(fav ? T.favOn : T.fav) + '"><span aria-hidden="true">' + (fav ? '❤️' : '🤍') + '</span></button>' +
      '</div>';
  }
  function gridHTML(list, cls, opts) {
    opts = opts || {};
    var srcAttr = opts.tmSrc ? ' data-tm-src="' + esc(opts.tmSrc) + '"' : '';
    return '<div class="grid ' + (cls || '') + '"' + srcAttr + '>' + list.map(function (g) {
      return tileHTML(g, { favBtn: opts.favBtn !== false, eager: opts.eager, compact: opts.compact });
    }).join('') + '</div>';
  }
  function sectionHTML(icon, title, inner, more, secCls) {
    return '<section class="sec' + (secCls ? ' ' + secCls : '') + '">' +
      '<div class="sec-head"><h2><span class="sec-icon" aria-hidden="true">' + icon + '</span><span>' + esc(title) + '</span></h2>' + (more || '') + '</div>' +
      inner + '</section>';
  }

  /* ------------------------------------------------------------ routes */
  function parseRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var head = parts[0];
    var rest = dec(parts.slice(1).join('/'));
    if (head === 'c' && rest) return { name: 'cat', id: rest };
    if (head === 'favorites') return { name: 'favorites' };
    if (head === 'play' && rest) return { name: 'play', slug: rest };
    if (head === 'quick' && rest) return { name: 'quick', id: rest };
    return { name: 'home' };
  }

  function chipsHTML(route) {
    var favCount = getFavs().length;
    var activeGroup = route.name === 'cat' ? (NAV_GROUP_BY_ID[route.id] ? route.id : (NAV_GROUPS.find(function (g) { return g.cats.indexOf(route.id) >= 0; }) || {}).id) : '';
    var items = [
      { href: '#/', on: route.name === 'home', cc: '#1c2250', ico: '🏠', lbl: T.home },
      { href: '#/quick/hot', on: route.name === 'quick' && route.id === 'hot', cc: '#c42718', ico: '🔥', lbl: T.hotNav },
      { href: '#/quick/friends', on: route.name === 'quick' && route.id === 'friends', cc: '#5936b8', ico: '👥', lbl: T.friendsNav }
    ];
    NAV_GROUPS.forEach(function (grp) {
      items.push({ href: '#/c/' + enc(grp.id), on: activeGroup === grp.id, cc: grp.color, ico: grp.icon, lbl: grp.label });
    });
    items.push({ href: '#/favorites', on: route.name === 'favorites', cc: '#c2185b', ico: '❤️', lbl: T.favs, cnt: favCount });
    var simpleOn = route.name === 'quick' && route.id === 'simple';
    items.push({ href: simpleOn ? '#/' : '#/quick/simple', on: simpleOn, cc: '#384d91', ico: '👆', lbl: T.oneButton, cls: 'chip-toggle', sep: true });

    return items.map(function (it) {
      return (it.sep ? '<span class="chip-sep" aria-hidden="true"></span>' : '') +
        '<a class="chip' + (it.cls ? ' ' + it.cls : '') + (it.on ? ' on' : '') + '" href="' + it.href + '" style="--cc:' + it.cc + '"' + (it.on ? ' aria-current="page"' : '') + '>' +
        '<span class="chip-ico" aria-hidden="true">' + it.ico + '</span><span>' + esc(it.lbl) + '</span>' +
        (it.cnt ? '<span class="chip-cnt">' + it.cnt + '</span>' : '') + '</a>';
    }).join('');
  }
  function refreshChips() {
    var el = $('#chips');
    if (el) el.innerHTML = chipsHTML(parseRoute());
  }

  function renderQuick(route) {
    var item = QUICK[route.id];
    if (!item) return notFound(T.noCat);
    var list = GAMES.filter(item.match);
    if (route.id === 'hot') list = byHotRank(list);
    return '<div class="banner" style="--cc:' + item.color + '"><span class="banner-ico" aria-hidden="true">' + item.icon + '</span><div><h1>' + item.label + '</h1><p>' + T.found(list.length) + '</p></div></div>' +
      '<p class="filter-note">' + item.note + '</p>' + gridHTML(list, '', { tmSrc: item.src });
  }

  // A featured game's place: catalog `hot: <rank>` (1 leads; `hot: true` comes after the ranked).
  function hotRank(g) { return typeof g.hot === 'number' && g.hot > 0 ? g.hot : 99; }
  function byHotRank(list) {
    return list.map(function (g, i) { return [g, i]; }).sort(function (a, b) {
      return hotRank(a[0]) - hotRank(b[0]) || a[1] - b[1];
    }).map(function (x) { return x[0]; });
  }
  function hotList(limit) {
    var hot = GAMES.filter(function (g) { return g.hot; });
    return (hot.length ? byHotRank(hot) : GAMES).slice(0, limit || 6);
  }

  // Stable featured-first order: proven S-tier hot games lead by rank, then the rest,
  // with the beginner lesson at the end (never duplicated as Tile #1 ahead of superstars).
  function featuredFirst(list) {
    return byHotRank(list.filter(function (g) { return g.hot && !g.starter; }))
      .concat(list.filter(function (g) { return !g.hot && !g.starter; }))
      .concat(list.filter(function (g) { return g.starter; }));
  }
  var STARTER_ART = '<svg class="starter-bubbles" viewBox="0 0 184 42" width="184" height="42" aria-hidden="true">' +
    '<circle cx="24" cy="23" r="14" fill="#63d8ff" fill-opacity=".42" stroke="#1c88c9" stroke-width="2.2"/>' +
    '<path d="M16 18 A9 9 0 0 1 22 13" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
    '<circle cx="70" cy="16" r="11" fill="#ff7dc0" fill-opacity=".38" stroke="#d93b88" stroke-width="2"/>' +
    '<path d="M64 12 A6 6 0 0 1 68 9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="114" cy="25" r="12" fill="#90eb54" fill-opacity=".42" stroke="#2c9e38" stroke-width="2"/>' +
    '<path d="M107 20 A7 7 0 0 1 112 16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="152" cy="18" r="8.5" fill="#c794ff" fill-opacity=".42" stroke="#7c45d4" stroke-width="1.9"/>' +
    '<circle cx="149" cy="15" r="2" fill="#fff"/>' +
    '<path d="M172 19 l2.4 5.2 5.2 2.4 -5.2 2.4 -2.4 5.2 -2.4 -5.2 -5.2 -2.4 5.2 -2.4 z" fill="#ffbe0b" stroke="#9e6d00" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M46 30 l1.8 3.8 3.8 1.8 -3.8 1.8 -1.8 3.8 -1.8 -3.8 -3.8 -1.8 3.8 -1.8 z" fill="#ffbe0b"/>' +
    '<path d="M92 7 l1.6 3.5 3.5 1.6 -3.5 1.6 -1.6 3.5 -1.6 -3.5 -3.5 -1.6 3.5 -1.6 z" fill="#ff9f1c"/>' +
    '</svg>';
  function starterCard(g) {
    if (!g) return '';
    return '<a class="starter" href="#/play/' + enc(g.slug) + '" data-slug="' + esc(g.slug) + '">' +
      '<span class="starter-ico" aria-hidden="true"><img src="' + thumbSrc(g.slug) + '" alt="" loading="eager" decoding="async" draggable="false" onerror="this.style.display=\'none\'"></span>' +
      '<span class="starter-copy"><b>' + T.starterTitle + '</b> <span class="starter-age">🖱️ ' + T.starterAge + '</span> <span class="starter-sep" aria-hidden="true">·</span> <span class="starter-game">' + esc(g.title) + '</span> <span class="starter-hint">' + T.starterHint + '</span></span>' +
      STARTER_ART +
      '<span class="starter-go">' + T.starterGo + ' ▶</span></a>';
  }

  /* ---------------------------------------------------------------- mute */
  // Personal mute, shared with every game through sg:site:muted (Kit uses the same key).
  var personalMuted = false;
  function paintMute() {
    var b = $('#muteBtn'), muted = personalMuted;
    // Juice reads sg:site:muted itself; this also covers blocked storage.
    juice('setQuiet', muted);
    if (!b) return;
    b.setAttribute('aria-pressed', String(muted));
    b.title = T.mute;
    $('span', b).textContent = muted ? '🔇' : '🔊';
  }
  function setupMute() {
    var mute = $('#muteBtn');
    personalMuted = !!storedPreference('muted', false);
    paintMute();
    // Prevent mouse clicks from blurring the game iframe and triggering a pause.
    mute.addEventListener('mousedown', function (e) { if (current) e.preventDefault(); });
    mute.addEventListener('click', function (e) {
      personalMuted = !personalMuted;
      writePreference('muted', personalMuted);
      // The open game follows at once, also from a folder where it has its own storage.
      sendPreferences(personalMuted);
      paintMute();
      if (!personalMuted) juice('toggle', true);
      // After a mouse click the keys go back to the game (so Space doesn't press this button again).
      if (e.detail && current) activateGame();
    });
    window.addEventListener('storage', function (e) {
      if (e.key !== 'sg:site:muted' && e.key !== null) return;
      personalMuted = !!storedPreference('muted', false);
      paintMute();
    });
  }

  function homeFavsInner() {
    var favs = getFavs().map(function (s) { return VISIBLE_BY_SLUG[s]; });
    if (!favs.length) return '';
    var more = favs.length > 6 ? '<a class="sec-more" href="#/favorites">' + T.seeAll + ' (' + favs.length + ') ‹</a>' : '';
    return sectionHTML('❤️', T.favsShelf, gridHTML(favs.slice(0, 6), 'favorites-grid shelf-grid', { tmSrc: 'favorites' }), more, 'shelf-sec');
  }
  function renderHome() {
    if (!GAMES.length) {
      return '<div class="empty"><div class="empty-emoji">🛠️</div><h2>' + T.soon + '</h2><p>' + T.soonSub + '</p></div>';
    }
    var recent = getRecent().slice(0, 6).map(function (s) { return VISIBLE_BY_SLUG[s]; });
    var start = null;
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].starter) { start = GAMES[i]; break; }

    // Poki Bento Hero Spotlight: 1 big 2x2 flagship + 8 crisp 1x1 S-tier tiles (12 grid cells -> zero orphans at 6, 4, or 2 cols).
    var bentoGames = hotList(9);
    var bentoInner = '<div class="bento-grid" data-tm-src="featured">' + bentoGames.map(function (g, idx) {
      return tileHTML(g, { hero: idx === 0, favBtn: true, eager: true });
    }).join('') + '</div>';
    var bentoMore = '<a class="sec-more" href="#/quick/hot">' + T.seeAll + ' ‹</a>';

    // Brand-new games shelf
    var newGames = GAMES.filter(function (g) { return g.isNew; });
    var newSec = newGames.length ? sectionHTML('✨', T.newShelf, gridHTML(newGames, 'new-grid shelf-grid', { tmSrc: 'catalog' }), '', 'shelf-sec') : '';

    // Dedicated 2-player shelf
    var multiAll = featuredFirst(GAMES.filter(isMulti));
    var friendsMore = multiAll.length > 8 ? '<a class="sec-more" href="#/quick/friends">' + T.seeAll + ' (' + multiAll.length + ') ‹</a>' : '';
    var friendsSec = multiAll.length ? sectionHTML('👥', T.friendsShelf, gridHTML(multiAll.slice(0, 8), 'friends-grid shelf-grid', { tmSrc: 'quick' }), friendsMore, 'shelf-sec') : '';

    return (!recent.length ? starterCard(start) : '') +
      sectionHTML('🔥', T.hotShelf, bentoInner, bentoMore, 'bento-sec') +
      (recent.length ? sectionHTML('🕹️', T.recent, gridHTML(recent, 'recent-grid shelf-grid', { tmSrc: 'recent' }), '', 'shelf-sec') : '') +
      '<div id="homeFavsWrap">' + homeFavsInner() + '</div>' +
      newSec +
      friendsSec +
      sectionHTML('🏆', T.all, gridHTML(featuredFirst(GAMES), 'catalog-grid'), '<span class="count">' + nGames(GAMES.length) + '</span>');
  }

  function renderFavorites() {
    var list = getFavs().map(function (s) { return VISIBLE_BY_SLUG[s]; });
    return '<div class="banner" style="--cc:#c2185b"><span class="banner-ico" aria-hidden="true">❤️</span><div><h1>' + T.favsTitle + '</h1><p>' + nGames(list.length) + '</p></div></div>' +
      (list.length ? '<section class="sec">' + gridHTML(list, 'favorites-grid', { tmSrc: 'favorites' }) + '</section>' :
        '<div class="empty"><h2>' + T.favsEmpty + '</h2><p>' + T.favsPrompt + '</p><a class="big-btn" href="#/">' + T.back + '</a></div>');
  }

  function renderCat(route) {
    var grp = NAV_GROUP_BY_ID[route.id];
    var c = grp || CAT_BY_ID[route.id];
    var list = c ? gamesIn(c.id) : [];
    if (!c || !list.length) return notFound(T.noCat);
    return '<div class="banner" style="--cc:' + catColor(c.id) + '">' +
        '<span class="banner-ico" aria-hidden="true">' + esc(c.icon || '🎮') + '</span>' +
        '<div><h1>' + esc(c.label) + '</h1><p>' + nGames(list.length) + T.toPlay + '</p></div>' +
      '</div>' +
      '<section class="sec">' + gridHTML(featuredFirst(list), '', { tmSrc: 'category' }) + '</section>';
  }

  function notFound(msg) {
    return '<div class="empty"><div class="empty-emoji">🙈</div><h2>' + T.oops + '</h2><p>' + esc(msg) + '</p>' +
      '<a class="big-btn" href="#/">' + T.back + '</a></div>' +
      (GAMES.length ? sectionHTML('🔥', T.hot, gridHTML(hotList(6), '', { tmSrc: 'featured' })) : '');
  }

  var MOUSE_RE = /انقر|نقر|الفأرة|فأرة|الماوس|اسحب|سحب|click|mouse|drag/i;
  function keycap(k) {
    var s = String(k);
    var mouse = MOUSE_RE.test(s);
    var ar = /[؀-ۿ]/.test(s);
    var cls = 'kc' + (mouse ? ' mouse' : '') + (s.length > 2 && !mouse ? ' wide' : '');
    return '<kbd class="' + cls + '" dir="' + (ar ? 'rtl' : 'ltr') + '">' + (mouse ? '<span class="kc-ico" aria-hidden="true">🖱️</span>' : '') + '<span>' + esc(s) + '</span></kbd>';
  }
  function controlsHTML(g, meta) {
    var CAP = 4;
    var extra = g.controls.length > CAP;
    var rows = g.controls.map(function (c, idx) {
      // Keys keep keyboard order (← → reads left to right) even on an RTL page.
      var keys = (Array.isArray(c.keys) ? c.keys : [c.keys]).map(keycap).join('');
      return '<li' + (idx >= CAP ? ' class="ctl-extra"' : '') + '><span class="keys" dir="ltr">' + keys + '</span><span class="act">' + esc(c.action || '') + '</span></li>';
    }).join('');
    var moreBtn = extra ? '<button type="button" class="ctl-more" id="ctlMore" aria-expanded="false">' + T.controlsMore(g.controls.length) + '</button>' : '';
    return '<div class="card controls">' + (meta ? '<div class="pb-meta">' + meta + '</div>' : '') + '<h3>🎮 ' + T.controls + '</h3>' +
      (rows ? '<ul class="ctl-list' + (extra ? ' ctl-collapsed' : '') + '" id="ctlList">' + rows + '</ul>' + moreBtn : '<p class="muted">' + T.controlsNone + '</p>') +
      '<p class="exit-hint">' + T.tip1 + ' ' + T.exitHint + '</p></div>';
  }
  function loadingCueHTML(g) {
    var first = g.controls && g.controls[0];
    if (!first) return '';
    var keys = (Array.isArray(first.keys) ? first.keys : [first.keys]).slice(0, 4).map(keycap).join('');
    return '<div class="stage-cue"><span class="keys" dir="ltr">' + keys + '</span><span class="stage-cue-act">' + esc(first.action || '') + '</span></div>';
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
    var pl = '<span class="players">' + playersLabel(g.players) + '</span><span class="players">⏱️ ' + durationLabel(g) + '</span><span class="players">' + esc(INPUT_LABELS[g.inputStyle] || '') + '</span>';

    // Visible 3-tile «العب بعدها» rail in sidebar: top non-recent visible S-tier picks.
    var rail = nextCandidates(g.slug).slice(0, 3);
    var railSlugs = rail.map(function (o) { return o.slug; });

    // Related shelf below stage: 6 unique visible games (shared categories + hot, avoiding sidebar duplicates when possible).
    var relatedPool = GAMES.filter(function (o) { return o.slug !== g.slug; }).map(function (o) {
      var shared = o.cats.filter(function (id) { return g.cats.indexOf(id) >= 0; }).length;
      var inRail = railSlugs.indexOf(o.slug) >= 0 ? -5 : 0;
      return [shared * 10 + (o.hot ? 2 + (30 - Math.min(hotRank(o), 30)) / 100 : 0) + inRail, o];
    }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 6).map(function (x) { return x[1]; });

    var railHTML = rail.length ? '<div class="card side-next"><h3>⚡ ' + T.nextTitle + '</h3>' +
      '<div class="side-next-grid" data-tm-src="related">' + rail.map(function (o) {
        return tileHTML(o, { favBtn: false, compact: true });
      }).join('') + '</div></div>' : '';

    return '<div class="play" id="play">' +
        '<div class="play-main" id="playMain">' +
          '<div class="stage-wrap" id="stageWrap">' +
            '<div class="stage loading" id="stage" style="--c:' + g.color + '">' +
              '<div class="stage-loading" role="status">' +
                '<div class="stage-art-wrap"><img class="stage-thumb" src="' + thumbSrc(g.slug) + '" alt="" decoding="async" draggable="false" onerror="this.style.display=\'none\'"><svg class="stage-spin" aria-hidden="true" viewBox="0 0 64 64" width="44" height="44">' + iconSVG() + '</svg></div>' +
                '<span class="stage-load-title">' + T.loading + esc(g.title) + '…</span>' +
                loadingCueHTML(g) +
              '</div>' +
              '<div class="stage-msg" id="stageMsg" role="alert" hidden><div class="empty-emoji" aria-hidden="true">🛠️</div><b>' + T.loadFailed + '</b><span>' + T.loadFailedSub + '</span><div class="stage-actions"><button type="button" class="pbtn" id="gameRetry">' + T.retry + '</button><a class="pbtn" href="' + esc(playReturn ? playReturn.hash : '#/') + '">' + T.returnGames + '</a></div></div>' +
              '<div class="next-card" id="nextCard" hidden></div>' +
            '</div>' +
            '<div class="play-bar" id="playBar">' +
              '<a class="pbtn back" id="backGames" href="' + esc(playReturn ? playReturn.hash : '#/') + '" aria-label="' + T.returnGames + '" title="' + T.returnGames + '"><span aria-hidden="true">‹</span><span class="pb-lbl">' + T.backShort + '</span></a>' +
              '<div class="pb-info"><h1 class="pb-title">' + esc(g.title) + '</h1></div>' +
              '<div class="pb-btns">' +
                '<button type="button" class="pbtn fav' + (fav ? ' on' : '') + '" id="favBtn" aria-pressed="' + fav + '" aria-label="' + (fav ? T.favOn : T.fav) + '" title="' + (fav ? T.favOn : T.fav) + '"><span class="heart" aria-hidden="true">' + (fav ? '❤️' : '🤍') + '</span><span class="pb-lbl">' + (fav ? T.favOn : T.fav) + '</span></button>' +
                '<button type="button" class="pbtn" id="restartBtn" aria-label="' + T.restart + '" title="' + T.restart + '"><span aria-hidden="true">🔄</span><span class="pb-lbl">' + T.restart + '</span></button>' +
                '<button type="button" class="pbtn fs" id="fsBtn" aria-label="' + T.fs + '" title="' + T.fs + '">' + FS_ICON + '<span class="pb-lbl">' + T.fs + '</span></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<aside class="play-side" id="playSide">' +
          controlsHTML(g, pl + cats) +
          railHTML +
          '<details class="card help"><summary>💡 ' + T.help + '</summary>' +
            (g.blurb ? '<p>' + esc(g.blurb) + '</p>' : '') + '<p>' + T.tip2 + '</p><p>' + (g.tip || T.tip3) + '</p></details>' +
        '</aside>' +
      '</div>' +
      sectionHTML('💖', T.more, gridHTML(relatedPool, 'recommendations', { favBtn: false, tmSrc: 'related' }));
  }

  /* -------------------------------------------------------- play logic */
  var current = null;   // current play slug
  var portalFocus = false;
  var readyTimer = 0;
  var frameReady = false;
  var renderedHash = null;
  var playReturn = null;
  var pendingReturn = null;
  var hadFullscreen = false;
  var frameAt = 0;        // when the current frame was made (performance.now())
  var surpriseOpen = false;
  function routeHash() { return location.hash || '#/'; }
  function frameEl() { return $('#stage iframe'); }
  // A paused game, its title/menu, a pending launch or the roulette modal own the view.
  window.SGUpdateSafe = function () {
    return renderedHash !== null && !current && !frameEl() && !surpriseOpen && parseRoute().name !== 'play';
  };
  // An open game may offer the «new version» button (js/offline.js) only while no round is
  // being played: Kit says when a round starts and ends (sg:round). Tapping reloads the page,
  // which opens the same game again.
  var roundOpen = false;
  window.SGUpdateOffer = function () {
    return renderedHash !== null && !!current && parseRoute().name === 'play' && !roundOpen;
  };
  // The anonymous play statistics sender (js/telemetry.js, docs/TELEMETRY.md). It does
  // nothing unless the fast build gave it the school's statistics server; tm() skips a
  // hook the loaded sender does not have and never lets it break the portal.
  function tm(name, a, b) {
    try { var t = window.SGTelemetry; if (t && typeof t[name] === 'function') t[name](a, b); } catch (e) { /* statistics are optional */ }
  }
  function telemetryOn() {
    try { return !!(window.SGTelemetry && window.SGTelemetry.active && window.SGTelemetry.active()); } catch (e) { return false; }
  }
  // file:// uses an opaque origin, so target/source Window identity is the
  // authentication boundary. Never accept messages from other windows.
  function postGame(message) {
    var f = frameEl();
    if (f && f.contentWindow) f.contentWindow.postMessage(message, location.protocol === 'file:' ? '*' : location.origin);
  }
  // quiet: the child's own mute, sent when the topbar button changes it, and whenever
  // storage could not keep it (a newly opened game reads the stored value instead).
  // telemetry: whether the game should count play for the statistics sender.
  function sendPreferences(quiet) {
    var message = { type: 'sg:preferences', telemetry: telemetryOn() };
    if (typeof quiet !== 'boolean' && personalMuted !== !!storedPreference('muted', false)) quiet = personalMuted;
    if (typeof quiet === 'boolean') message.quiet = quiet;
    postGame(message);
  }
  function focusGame() {
    if (portalFocus || surpriseOpen) return;
    var f = frameEl();
    if (!f || !frameReady) return;
    try { f.focus({ preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) { /* ignore */ } }
    try { if (f.contentWindow) f.contentWindow.focus(); } catch (e) { /* ignore */ }
  }
  function activateGame() { portalFocus = false; focusGame(); }
  function focusPortal() {
    var failure = $('#stageMsg');
    var target = (failure && !failure.hidden && $('#gameRetry')) || $('#favBtn') || $('#logo');
    if (target) {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
  }
  function onGameMessage(e) {
    var f = frameEl();
    if (location.protocol !== 'file:' && e.origin !== location.origin) return;
    // The sender also accepts the last statistics of a game removed under 2 s ago.
    tm('msg', e.source, e.data);
    if (!f || e.source !== f.contentWindow) return;
    if (e.data === 'sg:focus-portal') {
      portalFocus = true;
      exitFullscreen();
      focusPortal();
      return;
    }
    var type = e.data && e.data.type;
    if (type === 'sg:ready') {
      if (!frameReady) tm('ready', current, performance.now() - frameAt);
      clearTimeout(readyTimer);
      frameReady = true;
      f.removeAttribute('inert');
      $('#stage').classList.remove('loading');
      $('#stage').setAttribute('aria-busy', 'false');
      sendPreferences();
      focusGame();
    } else if (type === 'sg:round') onRound(e.data);
    else if (type === 'sg:error') failFrame(f, 'x');
    else if (type === 'sg:warn') noteGameWarn(e.data);
  }
  /* --------------------------------------------------------- play next */
  // Between rounds (Kit's sg:round) the stage offers one next game, weighted across
  // top non-recent visible S-tier games so recommendations stay fresh and never monotonous.
  var nextTimer = 0, nextShut = false;
  var NEXT_DELAY = 1200;
  function nextCandidates(slug) {
    var g = BY_SLUG[slug];
    if (!g) return [];
    var skip = getRecent().slice(0, 4);
    var scored = [];
    GAMES.forEach(function (o) {
      if (o.slug === g.slug || o.starter || skip.indexOf(o.slug) >= 0) return;
      var shared = o.cats.filter(function (id) { return g.cats.indexOf(id) >= 0; }).length;
      var score = (o.hot ? 40 - Math.min(hotRank(o), 30) : 0) + shared * 6 + (isMulti(o) && isMulti(g) ? 2 : 0);
      scored.push([score, o]);
    });
    if (!scored.length) {
      GAMES.forEach(function (o) { if (o.slug !== g.slug && !o.starter) scored.push([o.hot ? 40 - Math.min(hotRank(o), 30) : 0, o]); });
    }
    scored.sort(function (a, b) { return b[0] - a[0]; });
    return scored.map(function (x) { return x[1]; });
  }
  function nextPick(slug) {
    var list = nextCandidates(slug);
    var hotPool = list.filter(function (o) { return o.hot; });
    var top = (hotPool.length ? hotPool : list).slice(0, 6);
    if (!top.length) return null;
    // Weighted random across top 6 S-tier picks (weights 6..1) so play-next varies naturally.
    var total = 0, weights = top.map(function (_, i) { var w = top.length - i; total += w; return w; });
    var r = Math.random() * total;
    for (var i = 0; i < top.length; i++) {
      r -= weights[i];
      if (r <= 0) return top[i];
    }
    return top[0];
  }
  function nextCardHTML(o) {
    return '<a class="next-go" href="#/play/' + enc(o.slug) + '" data-next="' + esc(o.slug) + '" style="--c:' + o.color + '">' +
        '<span class="next-art"><img src="' + thumbSrc(o.slug) + '" alt="" decoding="async" draggable="false" onerror="this.parentNode.removeChild(this)"></span>' +
        '<span class="next-copy"><small>' + T.nextTitle + '</small><b>' + esc(o.title) + '</b></span>' +
        '<span class="next-btn" aria-hidden="true">' + T.nextGo + ' ▶</span>' +
      '</a>' +
      '<button type="button" class="next-x" aria-label="' + T.nextClose + '" title="' + T.nextClose + '"><span aria-hidden="true">✕</span></button>';
  }
  function hideNext() {
    clearTimeout(nextTimer);
    var card = $('#nextCard');
    if (card && !card.hidden) { card.hidden = true; card.classList.remove('show'); }
  }
  function showNext() {
    var card = $('#nextCard'), o = current && nextPick(current);
    if (!card || !o || nextShut || !frameReady) return;
    card.innerHTML = nextCardHTML(o);
    card.setAttribute('aria-label', T.nextTitle + ': ' + o.title);
    card.hidden = false;
    void card.offsetWidth;
    card.classList.add('show');
  }
  function onRound(data) {
    var open = data.phase === 'start';
    if (open !== roundOpen) { roundOpen = open; window.dispatchEvent(new Event('sg:sessionchange')); }
    if (open) hideNext();
    else if (data.phase === 'end' && !nextShut) {
      clearTimeout(nextTimer);
      nextTimer = setTimeout(showNext, NEXT_DELAY);
    }
  }
  function setupNext() {
    var card = $('#nextCard');
    nextShut = false;
    clearTimeout(nextTimer);
    if (!card) return;
    // The stage's own mousedown/click hand the keys to the game; a click here is for the card.
    card.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    card.addEventListener('click', function (e) {
      e.stopPropagation();
      var go = e.target.closest('.next-go'), x = e.target.closest('.next-x');
      if (go) {
        juice('select');
        tm('tag', go.getAttribute('data-next'), 'related');
      } else if (x) {
        nextShut = true;
        hideNext();
        activateGame();
      }
    });
  }

  // A stray error after the game is ready. Count it on this page only: the
  // text is not stored or sent, and the iframe is left alone.
  var gameWarns = 0;
  function noteGameWarn(data) {
    gameWarns++;
    try { window.__sgWarns = { n: gameWarns, last: String(data && data.message || '').slice(0, 240) }; } catch (e) { /* diagnostics stay local */ }
  }
  function failFrame(f, kind) {
    if (frameEl() !== f) return;
    tm('fail', kind);
    clearTimeout(readyTimer);
    frameReady = false;
    roundOpen = false;
    $('#stage').classList.remove('loading');
    $('#stage').setAttribute('aria-busy', 'false');
    $('#stageMsg').hidden = false;
    hideNext();
    // Dispose the browsing context, including timers, audio and pending saves.
    // Merely hiding a game after a runtime error leaves its simulation alive.
    tm('gone');
    f.parentNode.removeChild(f);
    portalFocus = true;
    focusPortal();
  }
  function mountFrame(slug) {
    clearTimeout(readyTimer);
    roundOpen = false;
    portalFocus = false;
    frameReady = false;
    var stage = $('#stage');
    if (!stage) return;
    var old = frameEl();
    if (old) { tm('gone'); old.parentNode.removeChild(old); }
    var msg = $('#stageMsg');
    if (msg) msg.hidden = true;
    hideNext();
    stage.classList.add('loading');
    stage.setAttribute('aria-busy', 'true');
    var f = document.createElement('iframe');
    f.setAttribute('inert', '');
    f.setAttribute('allow', 'fullscreen *; autoplay *');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('title', (BY_SLUG[slug] || {}).title || T.gameFallback);
    f.setAttribute('scrolling', 'no');
    f.addEventListener('load', function () {
      if (frameEl() !== f) return;
      // Load only proves the HTML arrived. Kit.ready() confirms game startup.
      postGame({ type: 'sg:request-ready' });
      sendPreferences();
    });
    f.addEventListener('error', function () { failFrame(f); });
    f.src = 'games/' + encodeURIComponent(slug) + '/index.html';
    stage.appendChild(f);
    frameAt = performance.now();
    tm('mount', f.contentWindow);
    readyTimer = setTimeout(function () { failFrame(f, 't'); }, 20000);
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
    portalFocus = false;
    try {
      if (isFullscreen()) { exitFullscreen(); return; }
      var fn = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (!fn) { toast(T.fsNone); return; }
      var p = fn.call(stage);
      if (p && p.then) {
        p.then(function () {
          // The promise may resolve before fullscreenchange is dispatched.
          // Remember entry here as well so a quick exit still pauses play.
          hadFullscreen = isFullscreen();
          focusGame();
        }, function () { toast(T.fsFail); });
      } else focusGame();
    } catch (e) {
      toast(T.fsFail);
    }
  }
  function onFsChange() {
    var fullscreen = isFullscreen();
    if (hadFullscreen && !fullscreen) postGame({ type: 'sg:pause', reason: 'fullscreen-exit' });
    hadFullscreen = fullscreen;
    if (!fullscreen) parkToast();
    var b = $('#fsBtn');
    if (b) {
      var lbl = isFullscreen() ? T.fsExit : T.fs;
      $('.pb-lbl', b).textContent = lbl;
      b.title = lbl;
      b.setAttribute('aria-label', lbl);
    }
    setTimeout(function () { if (portalFocus) focusPortal(); else focusGame(); }, 50);
  }
  function storedPreference(key, fallback) {
    try { var value = window.localStorage.getItem('sg:site:' + key); return value === null ? fallback : JSON.parse(value); } catch (e) { return fallback; }
  }
  function writePreference(key, value) {
    try { window.localStorage.setItem('sg:site:' + key, JSON.stringify(value)); } catch (e) { /* Current session still works through the frame protocol. */ }
  }
  function setupPlay(slug) {
    tm('open', slug, !renderedHash);
    pushRecent(slug);
    setupNext();
    mountFrame(slug);
    var stage = $('#stage');
    stage.addEventListener('mousedown', activateGame);
    stage.addEventListener('click', activateGame);
    var favBtn = $('#favBtn');
    // Prevent mouse click on heart from stealing iframe focus and pausing gameplay.
    favBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    favBtn.addEventListener('click', function (e) {
      var result = toggleFav(slug), on = result.on;
      var b = this;
      tm('fav', slug, on);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      b.title = on ? T.favOn : T.fav;
      b.setAttribute('aria-label', b.title);
      $('.heart', b).textContent = on ? '❤️' : '🤍';
      $('.pb-lbl', b).textContent = on ? T.favOn : T.fav;
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if (on) burst(b, ['❤️', '💖', '✨', '💗']);
      refreshChips();
      toast(result.saved ? (on ? T.favAdded : T.favRemoved) : T.favTemporary);
      // After a mouse click the keys go back to the game (so Space doesn't press this button again).
      if (e.detail) activateGame();
    });
    var ctlMore = $('#ctlMore');
    if (ctlMore) {
      ctlMore.addEventListener('click', function () {
        var list = $('#ctlList');
        if (!list) return;
        var collapsed = list.classList.toggle('ctl-collapsed');
        var total = list.children.length;
        ctlMore.setAttribute('aria-expanded', String(!collapsed));
        ctlMore.textContent = collapsed ? T.controlsMore(total) : T.controlsLess;
      });
    }
    $('#restartBtn').addEventListener('click', function () {
      var b = this;
      b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
      mountFrame(slug);
    });
    $('#gameRetry').addEventListener('click', function () { mountFrame(slug); });
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
    var gap = parseFloat(ps.columnGap) || 16;
    if (wide) availW -= (side.offsetWidth || 272) + gap;
    // Measure where the frame really starts, plus the bar's gap, and keep 8px of air below.
    var stageTop = stage.getBoundingClientRect().top + (window.pageYOffset || 0);
    var fixed = stageTop + (parseFloat(getComputedStyle(bar).marginTop) || 0) + 8;
    var minW = Math.min(300, availW);
    var w = Math.floor(Math.min(availW, Math.max(minW, (window.innerHeight - fixed - 52) * 16 / 9)));
    wrap.classList.toggle('compact', w < 760);
    wrap.style.width = w + 'px';
    side.style.width = wide ? '' : w + 'px';
    // Width changes can move the stage as well as wrap its toolbar. Measure
    // the rendered bottom after each change instead of reusing its old top.
    // Shrinking monotonically also avoids oscillating across wrap breakpoints.
    for (var pass = 0; pass < 8; pass++) {
      var overflow = bar.getBoundingClientRect().bottom + (window.pageYOffset || 0) - (window.innerHeight - 8);
      if (overflow <= 0) break;
      var nextW = Math.floor(Math.max(minW, w - overflow * 16 / 9));
      if (nextW >= w) break;
      w = nextW;
      wrap.classList.toggle('compact', w < 760);
      wrap.style.width = w + 'px';
      side.style.width = wide ? '' : w + 'px';
    }
  }

  /* ------------------------------------------------------------ render */
  var chipsKey = null;
  function render() {
    closeSurprise(true);
    var route = parseRoute();
    var app = $('#app');
    var body = document.body;
    var active = document.activeElement;
    var previousGame = current;
    var returnState = previousGame && route.name !== 'play' && playReturn && routeHash() === playReturn.hash ? playReturn : null;
    var moveFocus = active && ($('#chips').contains(active) || app.contains(active));
    if (route.name === 'play' && !current && renderedHash) {
      playReturn = pendingReturn || { hash: renderedHash, scroll: window.pageYOffset || 0, slug: route.slug };
    }
    pendingReturn = null;
    clearTimeout(readyTimer);
    clearTimeout(nextTimer);
    if (current && route.name !== 'play') exitFullscreen();
    body.className = 'route-' + route.name;
    var nextChipsKey = route.name + (route.id || '') + ':' + getFavs().length;
    if (chipsKey !== nextChipsKey) {
      $('#chips').innerHTML = chipsHTML(route);
      chipsKey = nextChipsKey;
    }
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
      var c = NAV_GROUP_BY_ID[route.id] || CAT_BY_ID[route.id];
      title = (c ? noEmoji(c.label) + ' — ' : '') + name;
    } else if (route.name === 'favorites') {
      html = renderFavorites();
      title = T.favsTitle + ' — ' + name;
    } else if (route.name === 'quick') {
      html = renderQuick(route);
      title = (QUICK[route.id] ? QUICK[route.id].label + ' — ' : '') + name;
    } else {
      html = renderHome();
      var tag = noEmoji(SITE.tagline);
      title = name + (tag ? ' — ' + tag : '');
    }
    // Leaving the game or switching games closes its visit; a re-render of
    // the same game only replaces the frame.
    tm(current && current === previousGame ? 'gone' : 'close');
    if (previousGame && !current) juice('back');
    // fullscreenchange comes only after the fullscreen stage is replaced here.
    parkToast();
    app.innerHTML = html;
    document.title = title;
    fitStage();
    if (current) setupPlay(current);
    window.scrollTo(0, returnState ? returnState.scroll : 0);
    // A replaced navigation link must not leave keyboard users at the document root.
    // The heading announces the destination; the next Tab reaches its games.
    if (!current && (moveFocus || returnState)) {
      var returningTiles = returnState ? Array.prototype.slice.call(app.querySelectorAll('.tile[data-slug]')).filter(function (tile) {
        if (tile.getAttribute('data-slug') !== returnState.slug) return false;
        var section = tile.closest('section'), label = section && $('h2', section);
        return !returnState.sectionLabel || (label && label.textContent === returnState.sectionLabel);
      }) : [];
      var heading = returningTiles[0] || $('h1, h2', app);
      if (heading) {
        if (!heading.matches('a[href], button')) heading.setAttribute('tabindex', '-1');
        try { heading.focus({ preventScroll: true }); } catch (e) { heading.focus(); }
      }
      // A new «تابع اللعب» row above the list can push the tile off screen.
      // scrollIntoView can still leave a fraction of a pixel past the edge.
      if (returningTiles[0]) {
        var backTile = returningTiles[0];
        backTile.scrollIntoView({ block: 'nearest' });
        var backBox = backTile.getBoundingClientRect();
        var backBar = $('.topbar');
        var backTop = backBar ? backBar.getBoundingClientRect().bottom : 0;
        var pastBottom = backBox.bottom - window.innerHeight;
        var pastTop = backTop - backBox.top;
        if (pastBottom > 0) window.scrollBy(0, Math.ceil(pastBottom));
        else if (pastTop > 0) window.scrollBy(0, -Math.ceil(pastTop));
      }
    }
    renderedHash = routeHash();
    window.dispatchEvent(new Event('sg:sessionchange'));
  }

  /* ---------------------------------------------- smart surprise modal */
  var spinTimer = 0, surpriseChosen = null;
  function pickSurprise(excludeSlug) {
    var base = GAMES.filter(function (g) { return !g.starter && g.slug !== current && g.slug !== excludeSlug; });
    if (!base.length) return GAMES[0] || null;
    var recent = getRecent().slice(0, 8);
    var fresh = base.filter(function (g) { return recent.indexOf(g.slug) < 0; });
    var pool = fresh.length >= 3 ? fresh : base;
    var flagships = pool.filter(function (g) { return g.hot; });
    var discovery = pool.filter(function (g) { return !g.hot; });
    var bucket = (flagships.length && discovery.length) ? (Math.random() < 0.7 ? flagships : discovery) : (flagships.length ? flagships : discovery);
    return bucket[Math.floor(Math.random() * bucket.length)] || pool[0];
  }
  function paintSurpriseCard(g, spinning) {
    var modal = $('#surpriseModal');
    if (!modal || !g) return;
    modal.classList.toggle('spinning', !!spinning);
    modal.classList.toggle('landed', !spinning);
    var meta = playersLabel(g.players) + ' · ⏱️ ' + durationLabel(g);
    modal.innerHTML =
      '<div class="roulette-card" style="--c:' + g.color + ';--c2:' + deepen(g.color, 0.45) + '">' +
        '<button type="button" class="roulette-close" id="surpriseClose" aria-label="' + T.surpriseClose + '" title="' + T.surpriseClose + '"><span aria-hidden="true">✕</span></button>' +
        '<div class="roulette-head"><span class="roulette-dice" aria-hidden="true">🎲</span><span class="roulette-kicker">' + (spinning ? T.surpriseSpin : T.surpriseTitle) + '</span></div>' +
        '<div class="roulette-art">' +
          '<img src="' + thumbSrc(g.slug) + '" alt="" decoding="async" draggable="false" onerror="this.style.display=\'none\'">' +
        '</div>' +
        '<h2 class="roulette-title" id="surpriseTitle">' + esc(g.title) + '</h2>' +
        '<p class="roulette-blurb">' + esc(g.blurb || '') + '</p>' +
        '<p class="roulette-meta">' + meta + '</p>' +
        '<div class="roulette-actions">' +
          '<button type="button" class="roulette-play" id="surprisePlay" data-slug="' + esc(g.slug) + '"' + (spinning ? ' disabled' : '') + '>' + T.surprisePlay + '</button>' +
          '<button type="button" class="roulette-reroll" id="surpriseReroll"' + (spinning ? ' disabled' : '') + '>' + T.surpriseReroll + '</button>' +
        '</div>' +
      '</div>';
  }
  function spinSurprise(excludeSlug) {
    clearTimeout(spinTimer);
    var chosen = pickSurprise(excludeSlug);
    if (!chosen) return;
    surpriseChosen = chosen;
    var modal = $('#surpriseModal');
    if (!modal) return;
    modal.hidden = false;
    surpriseOpen = true;
    var flashPool = GAMES.filter(function (g) { return !g.starter && g.slug !== chosen.slug; });
    if (calm() || !flashPool.length) {
      paintSurpriseCard(chosen, false);
      var btn = $('#surprisePlay');
      if (btn) btn.focus();
      return;
    }
    var step = 0, totalSteps = 5;
    function tick() {
      if (!surpriseOpen) return;
      if (step < totalSteps) {
        var preview = flashPool[Math.floor(Math.random() * flashPool.length)] || chosen;
        paintSurpriseCard(preview, true);
        step++;
        spinTimer = setTimeout(tick, 100);
      } else {
        paintSurpriseCard(chosen, false);
        juice('pop');
        var playBtn = $('#surprisePlay');
        if (playBtn) playBtn.focus();
      }
    }
    tick();
  }
  function closeSurprise(silent) {
    clearTimeout(spinTimer);
    if (!surpriseOpen) return;
    surpriseOpen = false;
    var modal = $('#surpriseModal');
    if (modal) { modal.hidden = true; modal.classList.remove('spinning', 'landed'); }
    if (!silent) {
      if (current) activateGame();
      else { var sb = $('#surprise'); if (sb) sb.focus(); }
    }
  }
  function surprise() {
    if (!GAMES.length) return;
    var b = $('#surprise');
    b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll');
    juice('whoosh', 0.8);
    spinSurprise(null);
  }
  function setupSurpriseModal() {
    var modal = $('#surpriseModal');
    if (!modal) return;
    modal.addEventListener('click', function (e) {
      if (e.target === modal) { closeSurprise(false); return; }
      var playBtn = e.target.closest('#surprisePlay');
      var rerollBtn = e.target.closest('#surpriseReroll');
      var closeBtn = e.target.closest('#surpriseClose');
      if (playBtn && surpriseChosen && !playBtn.disabled) {
        var slug = surpriseChosen.slug;
        closeSurprise(true);
        juice('select');
        tm('tag', slug, 'surprise');
        go('#/play/' + enc(slug));
      } else if (rerollBtn && !rerollBtn.disabled) {
        juice('whoosh', 0.7);
        spinSurprise(surpriseChosen && surpriseChosen.slug);
      } else if (closeBtn) {
        closeSurprise(false);
      }
    });
  }

  /* ------------------------------------------------------------ events */
  function go(hash) {
    if (location.hash === hash) { render(); return; }
    location.hash = hash;
  }

  var SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ' ': 1, Spacebar: 1, PageUp: 1, PageDown: 1 };
  function onKey(e) {
    if (surpriseOpen && e.key === 'Escape') {
      e.preventDefault();
      closeSurprise(false);
      return;
    }
    var t = e.target;
    var inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    // Native controls keep their own keyboard behavior and focus.
    var onControl = t && t.closest && t.closest('button, a[href], input, textarea, select, summary, [role="button"], [role="slider"]');
    if (current && !surpriseOpen && !inField && !onControl && SCROLL_KEYS[e.key]) {
      // In the play view keys belong to the game, never to page scrolling.
      e.preventDefault();
      activateGame();
      return;
    }
  }

  /* --------------------------------------------- warm up a game on hover */
  // Hovering (or focusing) a tile for a moment fetches that game's page in the background,
  // so it opens instantly on click. Only over http(s); once the offline cache (sw.js) has
  // the game this is answered locally and costs nothing.
  var warmed = Object.create(null), warmTimer = 0;
  function warmGame(slug) {
    if (!slug || warmed[slug] || !/^https?:$/.test(location.protocol)) return;
    warmed[slug] = true;
    var l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = 'games/' + encodeURIComponent(slug) + '/index.html';
    document.head.appendChild(l);
  }
  function tileFrom(e) { var t = e.target; return t && t.closest ? t.closest('.tile[data-slug]') : null; }
  function watchTiles() {
    // Quick heart toggle directly on home/category/favorites tiles.
    document.addEventListener('click', function (e) {
      var favEl = e.target && e.target.closest ? e.target.closest('.tile-fav[data-fav-slug]') : null;
      if (!favEl) return;
      e.preventDefault();
      e.stopPropagation();
      var slug = favEl.getAttribute('data-fav-slug');
      var g = VISIBLE_BY_SLUG[slug];
      if (!g) return;
      var result = toggleFav(slug), on = result.on;
      Array.prototype.forEach.call(document.querySelectorAll('.tile-fav[data-fav-slug="' + slug + '"]'), function (btn) {
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        btn.title = on ? T.favOn : T.fav;
        btn.setAttribute('aria-label', (on ? T.favOn : T.fav) + ': ' + g.title);
        var sp = $('span', btn);
        if (sp) sp.textContent = on ? '❤️' : '🤍';
      });
      if (on) { juice('pop'); burst(favEl, ['❤️', '💖', '✨', '💗']); }
      else juice('tap');
      refreshChips();
      var homeFavs = $('#homeFavsWrap');
      if (homeFavs) homeFavs.innerHTML = homeFavsInner();
      else if (parseRoute().name === 'favorites') render();
      toast(result.saved ? (on ? T.favAdded : T.favRemoved) : T.favTemporary);
    });
    // A game tile or the starter card plays the select sound (never a hover sound).
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.tile-fav')) return;
      var t = e.target && e.target.closest ? e.target.closest('.tile[data-slug], .starter') : null;
      if (!t || e.button || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      juice('select');
      // The statistics tell the «ابدأ من هنا» card apart from the game tiles.
      if (t.classList.contains('starter')) tm('tag', t.getAttribute('data-slug'), 'starter');
    });
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.tile-fav')) return;
      var tile = tileFrom(e);
      if (!tile || current || e.button > 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      var slug = tile.getAttribute('data-slug');
      var section = tile.closest('section'), label = section && $('h2', section);
      pendingReturn = { hash: routeHash(), scroll: window.pageYOffset || 0, slug: slug, sectionLabel: label ? label.textContent : '' };
    });
    document.addEventListener('pointerover', function (e) {
      var t = tileFrom(e);
      clearTimeout(warmTimer);
      if (t) warmTimer = setTimeout(function () { warmGame(t.getAttribute('data-slug')); }, 120);
    }, { passive: true });
    document.addEventListener('focusin', function (e) { var t = tileFrom(e); if (t) warmGame(t.getAttribute('data-slug')); });
  }

  function init() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    drawLogo();
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitLogo(); fitStage(); });
      if (document.fonts && document.fonts.load) document.fonts.load('700 36px Fredoka', SITE.name).then(fitLogo, function () {});
    } catch (e) { /* ignore */ }
    setTimeout(fitLogo, 600);

    var skip = $('.skip');
    if (skip) skip.addEventListener('click', function (e) {
      e.preventDefault();
      var target = current ? $('#favBtn') : $('#app .starter, #app .tile') || $('#app a, #app button');
      if (current) activateGame();
      else if (target) target.focus();
    });

    $('#surprise').addEventListener('click', surprise);
    setupSurpriseModal();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', render);
    window.addEventListener('message', onGameMessage);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('resize', fitStage);
    // The reduced-motion choice shared with the games (Kit.motion), else the system setting.
    document.documentElement.setAttribute('data-sg-motion', storedPreference('motion', 'system'));
    setupMute();
    watchTiles();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

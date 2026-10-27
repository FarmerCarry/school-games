/*
 * "ألعاب الفسحة" portal (Arabic, right-to-left). Plain script (no modules, no
 * fetch) so the site also works when index.html is opened straight from a
 * folder (file://).
 *
 * Routes (hash based):
 *   #/                home
 *   #/c/<category>    one category
 *   #/favorites       saved favorites
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
    exitHint: 'اضغط <b>Shift + Tab</b> من مساحة اللعب للعودة إلى أزرار اللعبة خارج الإطار.',
    home: 'الرئيسية',
    hot: 'الأكثر حماسًا الآن',
    recent: 'تابع اللعب',
    favs: 'ألعابك المفضلة',
    all: 'كل الألعاب',
    favsEmpty: 'لم تضف ألعابًا للمفضلة بعد',
    favsPrompt: 'افتح لعبة واضغط زر القلب لحفظها هنا.',
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
    sessionEnded: 'انتهى وقت الجلسة',
    sessionHandoff: 'اللعبة متوقفة. سلّم الجهاز أو تابع هذه الجولة من زر الاستئناف داخل اللعبة.',
    handOver: 'سلّم الجهاز',
    finishRound: 'تابع هذه الجولة',
    startTimer: 'ابدأ المؤقّت',
    startSession: 'ابدأ جلسة جديدة',
    resetTimer: 'أعد ضبط المؤقّت',
    sessionChoice: 'انتهى وقت الجلسة. اختر تسليم الجهاز أو متابعة الجولة.',
    sessionStarted: function (minutes) { return 'بدأت جلسة ' + minutes + ' ' + minutesWord(minutes) + '. يتوقف اللعب عند انتهاء الوقت.'; },
    timerCancelled: 'أُلغي المؤقّت. إذا كانت اللعبة متوقفة، استأنفها من داخل اللعبة.',
    nextPlayer: 'انتهت الجلسة. الجهاز جاهز للاعب التالي.',
    finishHint: 'استأنف من داخل اللعبة، ثم اضغط «العودة إلى الألعاب» لتسليم الجهاز بعد الجولة.',
    titleNotFound: 'لم نجد اللعبة',
    titleSearch: 'بحث: ',
    gameFallback: 'لعبة',
    starterTitle: 'ابدأ من هنا',
    starterGo: 'هيا',
    starterBadge: 'نقطة البداية',
    who: 'مَن يلعب؟',
    whoHint: 'اختر حيوانك لتجمع النجوم ⭐',
    whoGo: 'اختر مَن يلعب',
    guest: 'ضيف',
    guestLabel: 'ضيف: العب دون جمع النجوم',
    addPlayer: 'لاعب جديد',
    addShort: 'جديد',
    pickAnimal: 'اختر حيوانك',
    pickColor: 'اختر لونك',
    pickAge: 'كم عمرك؟',
    taken: ' (مأخوذ)',
    stepBack: 'رجوع',
    cancel: 'إلغاء',
    welcome: 'أهلًا بك! 🎉',
    profileTemporary: 'تعذّر الحفظ؛ هذا اللاعب مؤقت حتى تحديث الصفحة.',
    removeMode: 'حذف لاعب',
    removeHint: 'للمعلم: اختر اللاعب الذي تريد حذفه.',
    removeAsk: 'حذف هذا اللاعب؟ تضيع نجومه ومستواه.',
    removeYes: 'احذف',
    removeSure: 'متأكد؟ احذف نهائيًا',
    removeDone: 'تم',
    removed: 'حُذف اللاعب.',
    invite: 'اختر حيوانك في الرئيسية لتجمع النجوم ⭐',
    level: function (n) { return 'المستوى ' + n; },
    levelUp: function (n) { return 'مستوى جديد! ⭐ ' + n; },
    // A range keeps its low-to-high order inside the Arabic sentence (see duration).
    age: function (b) { var n = b.split('-'); return 'من ' + n[0] + ' إلى ' + n[1] + ' ' + yearsWord(+n[1]); },
    mute: 'كتم الصوت',
    muteLocked: 'وضع الصف يكتم الصوت الآن'
  };
  // Picture profiles (js/profiles.js) have no names: an animal and a ring colour.
  var ANIMAL_NAMES = ['ثعلب', 'باندا', 'نمر', 'ضفدع', 'قرد', 'بطريق', 'أسد', 'أرنب', 'كوالا', 'أخطبوط', 'يونيكورن', 'سلحفاة'];
  var COLOR_NAMES = ['أحمر', 'برتقالي', 'أصفر', 'أخضر', 'سماوي', 'أزرق', 'بنفسجي', 'وردي'];
  function yearsWord(n) { return n >= 3 && n <= 10 ? 'سنوات' : 'سنة'; }
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
  var GAMES = (Array.isArray(window.GAMES) ? window.GAMES : []).filter(function (g) {
    return g && typeof g.slug === 'string' && g.slug && !g.hidden;
  });
  var BY_SLUG = Object.create(null);
  GAMES.forEach(function (g) {
    BY_SLUG[g.slug] = g;
    if (!Array.isArray(g.cats)) g.cats = [];
    if (!Array.isArray(g.controls)) g.controls = [];
    g.title = String(g.title || g.slug);
    g.color = /^#[0-9a-f]{3,8}$/i.test(g.color || '') ? g.color : '#4f7cff';
  });
  var CAT_BY_ID = Object.create(null);
  ALL_CATS.forEach(function (c) { if (c && c.id) CAT_BY_ID[c.id] = c; });
  // Only categories that actually have (visible) games.
  var CATS = ALL_CATS.filter(function (c) {
    return c && c.id && GAMES.some(function (g) { return g.cats.indexOf(c.id) >= 0; });
  });
  // White labels on these colors meet WCAG AA for normal-size text.
  var CAT_COLORS = ['#a74200', '#b71c4a', '#6940bd', '#137a45', '#006aab', '#ae2566', '#806000', '#08776d'];
  var QUICK = Object.create(null);
  QUICK.short = { label: T.shortRound, icon: '⏱️', match: function (g) { return Array.isArray(g.roundMinutes) && g.roundMinutes[1] <= 3; } };
  QUICK.simple = { label: T.oneButton, icon: '👆', match: function (g) { return g.inputStyle === 'one-button'; } };
  QUICK.friends = { label: T.playFriend, icon: '👥', match: isMulti };
  var INPUT_LABELS = { 'one-button': T.oneButton, pointer: T.pointer, keyboard: T.keyboard, mixed: T.mixedInput };
  function durationLabel(g) {
    return Array.isArray(g.roundMinutes) ? T.duration(g.roundMinutes[0], g.roundMinutes[1]) : T.openEnded;
  }

  function gamesIn(catId) { return GAMES.filter(function (g) { return g.cats.indexOf(catId) >= 0; }); }
  function isMulti(g) { return /[2-9]/.test(String(g.players || '')); }
  function catEmoji(g) { var c = CAT_BY_ID[g.cats[0]]; return (c && c.icon) || '🎮'; }
  function catColor(id) { var i = ALL_CATS.findIndex(function (c) { return c.id === id; }); return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length]; }

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
  function known(list) { return list.filter(function (s) { return !!BY_SLUG[s]; }); }
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
  // cls 'gold' is the bigger level-up toast.
  function toast(msg, cls) {
    var t = $('#toast'), host = overlayHost();
    if (!t) return;
    if (t.parentNode !== host) host.appendChild(t);
    t.textContent = msg;
    t.className = 'toast show' + (cls ? ' ' + cls : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, cls ? 3200 : 2600);
  }
  // Profiles (js/profiles.js) and portal sounds (shared/juice.js) are optional:
  // the portal works as a guest, silently, if either failed to load.
  function prof(name, a, b, c) {
    try { var p = window.SGProfiles; return p && typeof p[name] === 'function' ? p[name](a, b, c) : undefined; } catch (e) { return undefined; }
  }
  function juice(name, x) {
    try { var j = window.Juice; if (j && typeof j[name] === 'function') j[name](x); } catch (e) { /* sounds are optional */ }
  }
  function focusEl(el) {
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  // No decorative motion in classroom mode or with reduced motion.
  function calm() {
    return classroomOn || document.documentElement.getAttribute('data-sg-motion') === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  // A little burst of emoji flying out of an element.
  function burst(el, chars) {
    if (calm()) return;
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
  function tileHTML(g) {
    // Icon-only badges keep the names drawn in the thumbnail art readable.
    var badges = '', tip = g.title + ' · ' + durationLabel(g) + ' · ' + (INPUT_LABELS[g.inputStyle] || '');
    if (g.hot) { badges += '<b class="badge hot" aria-hidden="true">🔥</b>'; tip += ' · ' + T.hotBadge; }
    if (g.starter) { badges += '<b class="badge start" aria-hidden="true">🖱️</b>'; tip += ' · ' + T.starterBadge; }
    if (isMulti(g)) { badges += '<b class="badge p2" aria-hidden="true">👥</b>'; tip += ' · ' + T.p2Badge; }
    return '<a class="tile" href="#/play/' + enc(g.slug) + '" data-slug="' + esc(g.slug) + '" title="' + esc(tip) + '"' +
      ' style="--c:' + g.color + ';--c2:' + deepen(g.color, 0.45) + ';--fbs:' + fbSize(g.title) + 'cqw" aria-label="' + esc(g.title) + '">' +
      '<span class="art">' +
        '<span class="fb" aria-hidden="true"><span class="fb-emoji">' + catEmoji(g) + '</span><span class="fb-title">' + esc(g.title) + '</span></span>' +
        '<img src="' + thumbSrc(g.slug) + '" alt="" loading="lazy" decoding="async" draggable="false"' +
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
  function sectionHTML(icon, title, inner, more) {
    return '<section class="sec">' +
      '<div class="sec-head"><h2><span class="sec-icon" aria-hidden="true">' + icon + '</span><span>' + esc(title) + '</span></h2>' + (more || '') + '</div>' +
      inner + '</section>';
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
  var STARTER_WORDS = ' ابدأ هنا نقطة البداية مبتدئ beginner start here tutorial first mouse keyboard';
  var INDEX = Object.create(null);
  function idx(g) {
    if (INDEX[g.slug]) return INDEX[g.slug];
    var cats = g.cats.map(function (id) { return CAT_BY_ID[id] ? CAT_BY_ID[id].label + ' ' + id + ' ' + (CAT_BY_ID[id].tags || '') : id; }).join(' ');
    var ix = {
      t: norm(g.title),
      en: norm((g.en || '') + ' ' + g.slug.replace(/-/g, ' ')),
      h: norm(g.title + ' ' + (g.en || '') + ' ' + g.slug.replace(/-/g, ' ') + ' ' + (g.blurb || '') + ' ' + (g.tags || '') + ' ' + cats +
        (isMulti(g) ? MULTI_WORDS : '') + (g.hot ? HOT_WORDS : '') + (g.starter ? STARTER_WORDS : ''))
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
    if (head === 'favorites') return { name: 'favorites' };
    if (head === 'search') return { name: 'search', q: rest };
    if (head === 'play' && rest) return { name: 'play', slug: rest };
    if (head === 'quick' && rest) return { name: 'quick', id: rest };
    return { name: 'home' };
  }

  function chipsHTML(route) {
    var html = '<a class="chip' + (route.name === 'home' ? ' on' : '') + '" href="#/" style="--cc:#1c2250"' + (route.name === 'home' ? ' aria-current="page"' : '') + '>' +
      '<span class="chip-ico" aria-hidden="true">🏠</span>' + T.home + '</a>';
    html += '<a class="chip' + (route.name === 'favorites' ? ' on' : '') + '" href="#/favorites" style="--cc:#d6246e"' + (route.name === 'favorites' ? ' aria-current="page"' : '') + '><span class="chip-ico" aria-hidden="true">❤️</span>' + T.favs + '</a>';
    CATS.forEach(function (c) {
      var on = route.name === 'cat' && route.id === c.id;
      html += '<a class="chip' + (on ? ' on' : '') + '" href="#/c/' + enc(c.id) + '" style="--cc:' + catColor(c.id) + '"' + (on ? ' aria-current="page"' : '') + '>' +
        '<span class="chip-ico" aria-hidden="true">' + esc(c.icon || '🎮') + '</span>' + esc(c.label) + '</a>';
    });
    return html;
  }
  function quickHTML(route) {
    return Object.keys(QUICK).map(function (id) {
      var item = QUICK[id], active = route.name === 'quick' && route.id === id;
      return '<a class="chip' + (active ? ' on' : '') + '" style="--cc:#384d91" href="#/quick/' + id + '"' + (active ? ' aria-current="page"' : '') + '><span aria-hidden="true">' + item.icon + '</span>' + item.label + '</a>';
    }).join('');
  }
  function renderQuick(route) {
    var item = QUICK[route.id];
    if (!item) return notFound(T.noCat);
    var list = GAMES.filter(item.match);
    return '<div class="banner" style="--cc:#384d91"><span class="banner-ico" aria-hidden="true">' + item.icon + '</span><div><h1>' + item.label + '</h1><p>' + T.found(list.length) + '</p></div></div>' +
      '<p class="filter-note">' + (route.id === 'short' ? T.estimates : route.id === 'simple' ? T.oneButtonHint : T.friendHint) + '</p>' + gridHTML(list);
  }

  function hotList() {
    var hot = GAMES.filter(function (g) { return g.hot; });
    return (hot.length ? hot : GAMES).slice(0, 6);
  }

  // Stable featured-first order, shared by home and category views.
  // The beginner lesson leads, then hot games, then the rest.
  function featuredFirst(list) {
    return list.filter(function (g) { return g.starter; })
      .concat(list.filter(function (g) { return g.hot && !g.starter; }))
      .concat(list.filter(function (g) { return !g.hot && !g.starter; }));
  }
  function starterCard(g) {
    if (!g) return '';
    return '<a class="starter" href="#/play/' + enc(g.slug) + '" data-slug="' + esc(g.slug) + '">' +
      '<span class="starter-ico" aria-hidden="true">🖱️</span>' +
      '<span class="starter-copy"><b>' + T.starterTitle + '</b><span>' + esc(g.title) + '</span><small>' + esc(g.blurb || '') + '</small></span>' +
      '<span class="starter-go">' + T.starterGo + '</span></a>';
  }

  /* ------------------------------------------------- who's playing? */
  // Anonymous picture profiles (js/profiles.js). The strip at the top of home never
  // blocks: a guest plays at once and one click picks a player. A new player makes
  // three picture choices (animal, colour, age); removing one is a small teacher
  // action that asks twice. Every button carries data-w="action[:value]".
  var GUEST_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="14" r="8"/><path d="M4 39c1.6-10 8-14 16-14s14.4 4 16 14z"/></svg>';
  var who = { mode: 'list', step: 1, a: 0, c: 0, k: '', sure: 0 };
  var whoFocus = false;   // focus the strip after the next home render
  var invited = false;    // a guest saw the invitation to pick an animal
  function profiles() { return prof('list') || []; }
  function avatarName(p) { return ANIMAL_NAMES[p.a] + ' بإطار ' + COLOR_NAMES[p.c]; }
  function whoButton(w, cls, label, face, cap, extra) {
    return '<button type="button" class="' + cls + '" data-w="' + esc(w) + '" aria-label="' + esc(label) + '"' + (extra || '') + '>' +
      '<span class="who-face" aria-hidden="true">' + face + '</span>' + (cap ? '<span class="who-cap" aria-hidden="true">' + cap + '</span>' : '') + '</button>';
  }
  function avatar(p, w, label, extra) {
    return whoButton(w + p.k, 'who-av', label, esc(p.animal), '⭐ ' + p.lv, ' style="--rc:' + p.color + '"' + (extra || ''));
  }
  function whoHead(title, icon, hint) {
    return '<div class="who-head"><h2 class="who-title" id="whoTitle">' + (icon ? '<span aria-hidden="true">' + icon + '</span> ' : '') + esc(title) + '</h2>' +
      (hint ? '<p class="who-hint">' + esc(hint) + '</p>' : '') + '</div>';
  }
  function whoNav(back) {
    return '<div class="who-nav">' + (back ? '<button type="button" class="pbtn" data-w="back"><span aria-hidden="true">‹</span>' + T.stepBack + '</button>' : '') +
      '<button type="button" class="pbtn" data-w="cancel"><span aria-hidden="true">✕</span>' + T.cancel + '</button></div>';
  }
  function whoInner() {
    var list = profiles(), me = prof('player') || '', A = window.SGProfiles.ANIMALS, C = window.SGProfiles.COLORS;
    function taken(a, c) { return list.some(function (p) { return p.a === a && p.c === c; }); }
    var html = '', s = who.step;
    if (who.mode === 'new') {
      html = '<div class="who-steps" aria-hidden="true">' + [1, 2, 3].map(function (n) { return '<i' + (n <= s ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
        whoHead(s === 1 ? T.pickAnimal : s === 2 ? T.pickColor : T.pickAge, s === 1 ? '🐾' : s === 2 ? '🎨' : '🎂') + '<div class="who-pick pick' + s + '" role="group" aria-labelledby="whoTitle">';
      if (s === 1) {
        html += A.map(function (e, a) {
          var full = C.every(function (c, i) { return taken(a, i); });
          return whoButton('a:' + a, 'who-opt', ANIMAL_NAMES[a] + (full ? T.taken : ''), esc(e), '', full ? ' disabled' : '');
        }).join('');
      } else if (s === 2) {
        html += C.map(function (color, c) {
          var used = taken(who.a, c);
          return whoButton('c:' + c, 'who-opt who-ring', COLOR_NAMES[c] + (used ? T.taken : ''), esc(A[who.a]), '', ' style="--rc:' + color + '"' + (used ? ' disabled' : ''));
        }).join('');
      } else {
        html += window.SGProfiles.BANDS.map(function (b) {
          var n = b.split('-');
          return '<button type="button" class="who-opt who-age" data-w="b:' + b + '" aria-label="' + esc(T.age(b)) + '"><b dir="ltr" aria-hidden="true">' + n[0] + '–' + n[1] + '</b>' +
            '<small aria-hidden="true">' + yearsWord(+n[1]) + '</small></button>';
        }).join('');
      }
      return html + '</div>' + whoNav(s > 1);
    }
    if (who.mode === 'remove') {
      return whoHead(T.removeMode, '🗑️', T.removeHint) + '<div class="who-row" role="group" aria-labelledby="whoTitle">' +
        list.map(function (p) { return avatar(p, 'rm:', T.removeYes + ' ' + avatarName(p)); }).join('') + '</div>' +
        '<div class="who-nav"><button type="button" class="pbtn" data-w="done">' + T.removeDone + '</button></div>';
    }
    if (who.mode === 'confirm') {
      var target = list.filter(function (p) { return p.k === who.k; })[0];
      return whoHead(T.removeMode, '🗑️') + '<div class="who-row who-confirm">' +
        '<span class="who-av" style="--rc:' + target.color + '"><span class="who-face" aria-hidden="true">' + esc(target.animal) + '</span><span class="who-cap">⭐ ' + target.lv + '</span></span>' +
        '<p id="whoAsk">' + esc(avatarName(target)) + ' — ' + T.removeAsk + '</p>' +
        '<div class="who-nav"><button type="button" class="pbtn" data-w="cancel">' + T.cancel + '</button>' +
        '<button type="button" class="pbtn danger" data-w="del" aria-describedby="whoAsk">' + (who.sure ? T.removeSure : T.removeYes) + '</button></div></div>';
    }
    html = list.map(function (p) {
      var on = p.k === me;
      return avatar(p, 'pick:', avatarName(p) + '، ' + T.level(p.lv), ' aria-pressed="' + on + '"' + (on ? ' data-on' : ''));
    }).join('');
    if (list.length < window.SGProfiles.MAX) html += whoButton('add', 'who-av who-add', T.addPlayer, '+', T.addShort, ' title="' + T.addPlayer + '"');
    html += whoButton('pick:', 'who-av who-guest', T.guestLabel, GUEST_SVG, T.guest, ' aria-pressed="' + !me + '"' + (me ? '' : ' data-on'));
    if (list.length) html += '<button type="button" class="who-edit" data-w="edit" aria-label="' + T.removeMode + '" title="' + T.removeMode + '"><span aria-hidden="true">🗑️</span></button>';
    return whoHead(T.who, '👋', me ? '' : T.whoHint) + '<div class="who-row" role="group" aria-labelledby="whoTitle">' + html + '</div>';
  }
  function whoHTML() {
    if (!window.SGProfiles) return '';
    who.mode = 'list';
    return '<section class="who" id="who" aria-labelledby="whoTitle">' + whoInner() + '</section>';
  }
  // Redraw the strip in place (home stays as it is) and focus `sel`, or the button
  // that had focus, or the current player.
  function paintWho(sel) {
    var el = $('#who'), a = document.activeElement;
    if (!el) return;
    if (!sel && a && el.contains(a) && a.hasAttribute('data-w')) sel = '[data-w="' + a.getAttribute('data-w') + '"]';
    if (who.mode === 'confirm' && !profiles().some(function (p) { return p.k === who.k; })) who.mode = 'list';
    el.innerHTML = whoInner();
    el.className = 'who who-' + who.mode;
    var f = sel && ($(sel + ':not([disabled])', el) || $('[data-on]', el) || $('button:not([disabled])', el));
    if (f) focusEl(f);
  }
  function whoSet(mode, sel) {
    who.mode = mode;
    paintWho(sel);
  }
  function focusWho() {
    window.scrollTo(0, 0);
    if (who.mode !== 'list') who.mode = 'list';
    paintWho('[data-on]');
  }
  function createPlayer(band) {
    who.mode = 'list';
    var p = prof('create', who.a, who.c, band);
    if (!p) { paintWho('[data-w="pick:"]'); return; }
    var sel = '[data-w="pick:' + p.k + '"]';
    paintWho(sel);
    juice('chime', 3);
    toast(p.saved === false ? T.profileTemporary : T.welcome);
    var b = $(sel);
    if (b && !calm()) { b.classList.add('born'); burst(b, ['🎉', '⭐', '✨', '🌟']); }
  }
  function onWho(e) {
    var b = e.target && e.target.closest ? e.target.closest('#who button[data-w]') : null;
    if (!b || b.disabled) return;
    var w = b.getAttribute('data-w'), i = w.indexOf(':'), act = i < 0 ? w : w.slice(0, i), v = i < 0 ? '' : w.slice(i + 1);
    if (act === 'pick') {
      prof('select', v);
      juice('pop', v ? 0.5 : 0.3);
      paintWho('[data-w="' + w + '"]');
      var picked = $('#who [data-w="' + w + '"]');
      if (picked && !calm()) picked.classList.add('pop');
    } else if (act === 'add') {
      juice('tap');
      who.step = 1;
      whoSet('new', '[data-w^="a:"]');
    } else if (act === 'a' || act === 'c') {
      juice('pop', act === 'a' ? 0.4 : 0.6);
      who[act] = +v;
      who.step = act === 'a' ? 2 : 3;
      paintWho(act === 'a' ? '[data-w^="c:"]' : '[data-w^="b:"]');
    } else if (act === 'b') {
      createPlayer(v);
    } else if (act === 'back') {
      juice('tap');
      who.step--;
      paintWho(who.step === 1 ? '[data-w="a:' + who.a + '"]' : '[data-w="c:' + who.c + '"]');
    } else if (act === 'cancel') {
      juice('back');
      if (who.mode === 'confirm') whoSet('remove', '[data-w="rm:' + who.k + '"]');
      else whoSet('list', '[data-w="add"]');
    } else if (act === 'edit') {
      juice('tap');
      whoSet('remove', '[data-w^="rm:"]');
    } else if (act === 'done') {
      juice('back');
      whoSet('list', '[data-w="edit"]');
    } else if (act === 'rm') {
      juice('tap');
      who.k = v;
      who.sure = 0;
      whoSet('confirm', '[data-w="cancel"]');
    } else if (act === 'del') {
      // Asks twice; the second button ignores a double click on the first.
      if (!who.sure) { who.sure = performance.now() || 1; paintWho('[data-w="cancel"]'); }
      else if (performance.now() - who.sure > 500) {
        prof('remove', who.k);
        juice('back');
        toast(T.removed);
        whoSet('list', '[data-w="add"]');
      }
    }
  }

  /* ------------------------------------------------- topbar player badge */
  var personalMuted = false;
  // Avatar, level and XP bar of the current player, or a neutral silhouette for a guest.
  function paintMe() {
    var el = $('#me');
    if (!el) return;
    var p = prof('current');
    el.hidden = !window.SGProfiles;
    el.classList.toggle('guest', !p);
    el.style.setProperty('--rc', p ? p.color : '#8a93b8');
    $('.me-face', el).innerHTML = p ? esc(p.animal) : GUEST_SVG;
    $('.me-lv', el).innerHTML = p ? '<span aria-hidden="true">⭐</span>' + p.lv : esc(T.guest);
    var xp = (p ? Math.round(p.need ? p.have / p.need * 100 : 100) : 0) + '%';
    $('.me-bar i', el).style.width = xp;
    el.style.setProperty('--xp', xp);
    el.setAttribute('aria-label', (p ? avatarName(p) + '، ' + T.level(p.lv) : T.guest) + '. ' + T.whoGo);
  }
  function gained(gain, k) {
    if (!k) {
      // Guests keep nothing; invite them once to pick an animal.
      if (gain && !invited) { invited = true; toast(T.invite); }
      return;
    }
    if (k !== prof('player')) return;
    paintMe();
    var el = $('#me');
    if (!gain || !el) return;
    var s = document.createElement('span');
    s.className = 'me-gain';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = '+' + gain;
    el.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1300);
  }
  function levelled(lv) {
    var el = $('#me');
    tm('level', lv);
    paintMe();
    toast(T.levelUp(lv), 'gold');
    juice('levelUp');
    if (!el || calm()) return;
    el.classList.remove('lvup'); void el.offsetWidth; el.classList.add('lvup');
    burst(el, ['⭐', '🌟', '✨']);
  }
  // A new player, a removed one, another band: the badge, the strip and the open game follow.
  function profilesChanged() {
    paintMe();
    if (who.mode !== 'new') paintWho();
    var band = $('#classBand');
    if (band) band.value = prof('classBand') || '';
    sendPreferences();
  }
  // Personal mute, shared with every game through sg:site:muted (Kit uses the same key).
  // The classroom preset silences everything without touching it.
  function paintMute() {
    var b = $('#muteBtn'), muted = personalMuted || classroomOn;
    // Juice reads sg:site:muted and sg:site:classroom itself; this also covers blocked storage.
    juice('setQuiet', muted);
    if (!b) return;
    b.setAttribute('aria-pressed', String(muted));
    b.setAttribute('aria-disabled', String(classroomOn));
    b.title = classroomOn ? T.muteLocked : T.mute;
    $('span', b).textContent = muted ? '🔇' : '🔊';
  }
  function setupPlayer() {
    var me = $('#me'), mute = $('#muteBtn'), app = $('#app');
    paintMe();
    me.addEventListener('click', function (e) {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      juice('tap');
      if (parseRoute().name === 'home' && $('#who')) focusWho();
      else { whoFocus = true; go('#/'); }
    });
    app.addEventListener('click', onWho);
    app.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || who.mode === 'list' || !e.target.closest || !e.target.closest('#who')) return;
      e.preventDefault();
      whoSet('list', '[data-w="add"]');
    });
    prof('onChange', profilesChanged);
    prof('onXP', gained);
    prof('onLevel', levelled);

    personalMuted = !!storedPreference('muted', false);
    paintMute();
    mute.addEventListener('click', function (e) {
      if (classroomOn) toast(T.muteLocked);
      else {
        personalMuted = !personalMuted;
        writePreference('muted', personalMuted);
        // The open game follows at once, also from a folder where it has its own storage.
        sendPreferences(personalMuted);
        paintMute();
        if (!personalMuted) juice('toggle', true);
      }
      // After a mouse click the keys go back to the game (so Space doesn't press this button again).
      if (e.detail && current) activateGame();
    });
    // The teacher page can stop statistics (and so telemetry) at any time: the open game follows.
    window.addEventListener('storage', function (e) {
      if ((e.key === 'sg:site:statsmeta' || e.key === null) && telemetryOn() !== sentTelemetry) sendPreferences();
    });
    window.addEventListener('storage', function (e) {
      if (e.key !== 'sg:site:muted' && e.key !== null) return;
      personalMuted = !!storedPreference('muted', false);
      paintMute();
    });
  }

  function renderHome() {
    if (!GAMES.length) {
      return '<div class="empty"><div class="empty-emoji">🛠️</div><h2>' + T.soon + '</h2><p>' + T.soonSub + '</p></div>';
    }
    var recent = getRecent().slice(0, 6).map(function (s) { return BY_SLUG[s]; });
    var start = null;
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].starter) { start = GAMES[i]; break; }
    return whoHTML() + starterCard(start) +
      (recent.length ? sectionHTML('🕹️', T.recent, gridHTML(recent, 'recent-grid')) : '') +
      sectionHTML('🎮', T.all, gridHTML(featuredFirst(GAMES), 'catalog-grid'), '<span class="count">' + nGames(GAMES.length) + '</span>');
  }

  function renderFavorites() {
    var list = getFavs().map(function (s) { return BY_SLUG[s]; });
    return '<div class="banner" style="--cc:#d6246e"><span class="banner-ico" aria-hidden="true">❤️</span><div><h1>' + T.favs + '</h1><p>' + nGames(list.length) + '</p></div></div>' +
      (list.length ? '<section class="sec">' + gridHTML(list, 'favorites-grid') + '</section>' :
        '<div class="empty"><h2>' + T.favsEmpty + '</h2><p>' + T.favsPrompt + '</p><a class="big-btn" href="#/">' + T.back + '</a></div>');
  }

  function renderCat(route) {
    var c = CAT_BY_ID[route.id];
    var list = c ? gamesIn(c.id) : [];
    if (!c || !list.length) return notFound(T.noCat);
    return '<div class="banner" style="--cc:' + catColor(c.id) + '">' +
        '<span class="banner-ico" aria-hidden="true">' + esc(c.icon || '🎮') + '</span>' +
        '<div><h1>' + esc(c.label) + '</h1><p>' + nGames(list.length) + T.toPlay + '</p></div>' +
      '</div>' +
      '<section class="sec">' + gridHTML(featuredFirst(list)) + '</section>';
  }

  function renderSearch(route) {
    var q = (route.q || '').trim();
    var res = search(q);
    var head = '<div class="banner search-banner" style="--cc:#00a6ff"><span class="banner-ico" aria-hidden="true">🔍</span><div>' +
      '<h1>' + (q ? '«<bdi>' + esc(q) + '</bdi>»' : T.searchTitle) + '</h1>' +
      '<p>' + (q ? (res.length ? T.found(res.length) : T.searchNone) : T.searchPrompt) + '</p></div></div>';
    if (res.length) {
      return head + '<section class="sec">' + gridHTML(res) + '</section>';
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
  function controlsHTML(g, meta) {
    var rows = g.controls.map(function (c) {
      // Keys keep keyboard order (← → reads left to right) even on an RTL page.
      var keys = (Array.isArray(c.keys) ? c.keys : [c.keys]).map(keycap).join('');
      return '<li><span class="keys" dir="ltr">' + keys + '</span><span class="act">' + esc(c.action || '') + '</span></li>';
    }).join('');
    return '<div class="card controls">' + (meta ? '<div class="pb-meta">' + meta + '</div>' : '') + '<h3>🎮 ' + T.controls + '</h3>' +
      (rows ? '<ul class="ctl-list">' + rows + '</ul>' : '<p class="muted">' + T.controlsNone + '</p>') +
      '<p class="exit-hint">' + T.tip1 + ' ' + T.exitHint + '</p></div>';
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

    // Related: shared categories first (most overlap), then hot, then the rest.
    var more = GAMES.filter(function (o) { return o !== g; }).map(function (o) {
      var shared = o.cats.filter(function (id) { return g.cats.indexOf(id) >= 0; }).length;
      return [shared * 10 + (o.hot ? 2 : 0), o];
    }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 6).map(function (x) { return x[1]; });

    return '<div class="play" id="play">' +
        '<div class="play-main" id="playMain">' +
          '<div class="stage-wrap" id="stageWrap">' +
            '<div class="stage loading" id="stage" style="--c:' + g.color + '">' +
              '<div class="stage-loading" role="status"><svg aria-hidden="true" viewBox="0 0 64 64" width="84" height="84">' + iconSVG() + '</svg><span>' + T.loading + esc(g.title) + '…</span></div>' +
              '<div class="stage-msg" id="stageMsg" role="alert" hidden><div class="empty-emoji" aria-hidden="true">🛠️</div><b>' + T.loadFailed + '</b><span>' + T.loadFailedSub + '</span><div class="stage-actions"><button type="button" class="pbtn" id="gameRetry">' + T.retry + '</button><a class="pbtn" href="' + esc(playReturn ? playReturn.hash : '#/') + '">' + T.returnGames + '</a></div></div>' +
              '<div class="session-handoff" id="sessionHandoff" role="dialog" aria-modal="true" aria-labelledby="sessionEndTitle" hidden><b id="sessionEndTitle">' + T.sessionEnded + '</b><p>' + T.sessionHandoff + '</p><div class="stage-actions"><button type="button" class="pbtn" id="sessionEnd">' + T.handOver + '</button><button type="button" class="pbtn" id="sessionFinish">' + T.finishRound + '</button></div></div>' +
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
        '<aside class="play-side" id="playSide">' + controlsHTML(g, pl + cats) +
          '<details class="card help"><summary>💡 ' + T.help + '</summary>' +
            (g.blurb ? '<p>' + esc(g.blurb) + '</p>' : '') + '<p>' + T.tip2 + '</p><p>' + (g.tip || T.tip3) + '</p></details>' +
        '</aside>' +
      '</div>' +
      sectionHTML('💖', T.more, gridHTML(more, 'recommendations'));
  }

  /* -------------------------------------------------------- play logic */
  var current = null;   // current play slug
  var portalFocus = false;
  var readyTimer = 0;
  var frameReady = false;
  var renderedHash = null;
  var playReturn = null;
  var pendingReturn = null;
  var classroomOn = false;
  var sessionDeadline = 0;
  var sessionExpired = false;
  var hadFullscreen = false;
  var frameAt = 0;        // when the current frame was made (performance.now())
  var sentTelemetry = false;
  function routeHash() { return location.hash || '#/'; }
  function frameEl() { return $('#stage iframe'); }
  // A paused game, its title/menu and the classroom handoff still own a session.
  // Include the pending route so a launch cannot race an offline refresh check.
  // The classroom timer lives only in this page, so a reload would silently drop it.
  window.SGUpdateSafe = function () {
    return renderedHash !== null && !current && !frameEl() && parseRoute().name !== 'play' && !sessionDeadline && !sessionExpired;
  };
  // Local play statistics (js/stats.js, docs/PLAY_STATS.md). Never let them break play.
  function stat(name, a, b) {
    try { window.SGStats[name](a, b); } catch (e) { /* statistics are optional */ }
  }
  // The anonymous telemetry sink (js/telemetry.js) follows the same calls; it does
  // nothing unless the build has an ingest address and the teacher has not stopped it.
  function tm(name, a, b) {
    try { var t = window.SGTelemetry; if (t && typeof t[name] === 'function') t[name](a, b); } catch (e) { /* telemetry is optional */ }
  }
  // file:// uses an opaque origin, so target/source Window identity is the
  // authentication boundary. Never accept messages from other windows.
  function postGame(message) {
    var f = frameEl();
    if (f && f.contentWindow) f.contentWindow.postMessage(message, location.protocol === 'file:' ? '*' : location.origin);
  }
  function telemetryOn() {
    try { return !!(window.SGTelemetry && window.SGTelemetry.active && window.SGTelemetry.active()); } catch (e) { return false; }
  }
  // quiet: the child's own mute, sent when the topbar button changes it, and whenever
  // storage could not keep it (a newly opened game reads the stored value instead).
  function sendPreferences(quiet) {
    // A temporary preset must not overwrite each game's personal settings.
    // Always clear it too: file:// may give every game its own storage area.
    // The player's age band and profile slot are transient too (docs/ARCHITECTURE.md "Kit v2").
    sentTelemetry = telemetryOn();
    var message = { type: 'sg:preferences', classroom: classroomOn, band: String(prof('band') || ''),
      player: String(prof('player') || ''), telemetry: sentTelemetry };
    if (typeof quiet !== 'boolean' && personalMuted !== !!storedPreference('muted', false)) quiet = personalMuted;
    if (typeof quiet === 'boolean') message.quiet = quiet;
    postGame(message);
  }
  function focusGame() {
    if (portalFocus) return;
    var f = frameEl();
    if (!f || !frameReady || sessionExpired) return;
    var a = document.activeElement;
    if (a && a.id === 'q') return; // don't steal focus from someone typing a search
    try { f.focus({ preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) { /* ignore */ } }
    try { if (f.contentWindow) f.contentWindow.focus(); } catch (e) { /* ignore */ }
  }
  function activateGame() { portalFocus = false; focusGame(); }
  function focusPortal() {
    var handoff = $('#sessionHandoff'), failure = $('#stageMsg');
    var target = (handoff && !handoff.hidden && $('#sessionEnd')) || (failure && !failure.hidden && $('#gameRetry')) || $('#favBtn') || $('#logo');
    if (target) {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
  }
  function onGameMessage(e) {
    var f = frameEl();
    if (location.protocol !== 'file:' && e.origin !== location.origin) return;
    // The recorder and the XP counter also accept sg:stats from a game removed under 2 s ago.
    stat('msg', e.source, e.data);
    prof('msg', e.source, e.data);
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
      if (!sessionExpired) f.removeAttribute('inert');
      $('#stage').classList.remove('loading');
      $('#stage').setAttribute('aria-busy', 'false');
      sendPreferences();
      if (sessionExpired) showHandoff(); else focusGame();
    } else if (type === 'sg:error') failFrame(f, 'x');
  }
  function failFrame(f, kind) {
    if (frameEl() !== f) return;
    stat('fail', kind);
    tm('fail', kind);
    clearTimeout(readyTimer);
    frameReady = false;
    $('#stage').classList.remove('loading');
    $('#stage').setAttribute('aria-busy', 'false');
    $('#stageMsg').hidden = false;
    // Dispose the browsing context, including timers, audio and pending saves.
    // Merely hiding a game after a runtime error leaves its simulation alive.
    stat('gone');
    prof('gone');
    tm('gone');
    f.parentNode.removeChild(f);
    portalFocus = true;
    var handoff = $('#sessionHandoff');
    if (handoff) handoff.hidden = true;
    focusPortal();
  }
  function mountFrame(slug) {
    clearTimeout(readyTimer);
    portalFocus = false;
    frameReady = false;
    var stage = $('#stage');
    if (!stage) return;
    var old = frameEl();
    if (old) { stat('gone'); prof('gone'); tm('gone'); old.parentNode.removeChild(old); }
    var msg = $('#stageMsg');
    if (msg) msg.hidden = true;
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
    stat('mount', f.contentWindow);
    prof('mount', f.contentWindow);
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
          if (hadFullscreen) stat('set', 'fs');
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
  function setClassroom(on) {
    classroomOn = !!on;
    if (classroomOn) stat('set', 'calm');
    writePreference('classroom', classroomOn);
    document.documentElement.setAttribute('data-sg-motion', classroomOn ? 'reduce' : storedPreference('motion', 'system'));
    paintMute();
    sendPreferences();
  }
  function showHandoff() {
    if (!frameReady || !frameEl()) return;
    postGame({ type: 'sg:pause', reason: 'session-ended' });
    var overlay = $('#sessionHandoff');
    if (!overlay) return;
    portalFocus = true;
    exitFullscreen();
    overlay.hidden = false;
    var f = frameEl();
    if (f) f.setAttribute('inert', '');
    $('#sessionEnd').focus({ preventScroll: true });
  }
  function clearSession() {
    sessionDeadline = 0;
    sessionExpired = false;
    $('#sessionClock').textContent = '';
    $('#sessionStop').hidden = true;
    $('#sessionStart').textContent = T.startTimer;
    var overlay = $('#sessionHandoff');
    if (overlay) overlay.hidden = true;
    var f = frameEl();
    if (f && frameReady) f.removeAttribute('inert');
    window.dispatchEvent(new Event('sg:sessionchange'));
  }
  function tickSession() {
    if (!sessionDeadline) return;
    var left = Math.max(0, Math.ceil((sessionDeadline - performance.now()) / 1000));
    $('#sessionClock').textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
    if (!left) {
      sessionDeadline = 0;
      sessionExpired = true;
      $('#sessionStatus').textContent = T.sessionChoice;
      $('#sessionStart').textContent = T.startSession;
      showHandoff();
    }
  }
  // The open classroom panel is a strip under the top bar. Move the page down by
  // its height so it never covers a game, then fit the frame to what is left.
  function syncClassroomSpace() {
    var open = $('#classroom').open, root = document.documentElement;
    root.classList.toggle('classroom-open', open);
    root.style.setProperty('--classroom-h', open ? $('.classroom-controls').offsetHeight + 'px' : '0px');
    fitStage();
  }
  function setupClassroom() {
    classroomOn = !!storedPreference('classroom', false);
    $('#classroomMode').checked = classroomOn;
    document.documentElement.setAttribute('data-sg-motion', classroomOn ? 'reduce' : storedPreference('motion', 'system'));
    $('#classroomMode').addEventListener('change', function () { setClassroom(this.checked); });
    // The class default age band is what guests play with.
    var band = $('#classBand');
    if (window.SGProfiles) {
      band.value = prof('classBand') || '';
      band.addEventListener('change', function () { prof('setClassBand', band.value); });
    } else $('#bandPick').hidden = true;
    $('#classroom').addEventListener('toggle', syncClassroomSpace);
    if (window.ResizeObserver) new ResizeObserver(function () { if ($('#classroom').open) syncClassroomSpace(); }).observe($('.classroom-controls'));
    $('#sessionStart').addEventListener('click', function () {
      clearSession();
      var minutes = Number($('#sessionMinutes').value) || 10;
      // performance.now() keeps counting evenly if Windows corrects the PC's clock mid-lesson.
      sessionDeadline = performance.now() + minutes * 60000;
      $('#sessionStop').hidden = false;
      $('#sessionStart').textContent = T.resetTimer;
      $('#sessionStatus').textContent = T.sessionStarted(minutes);
      window.dispatchEvent(new Event('sg:sessionchange'));
      tickSession();
    });
    $('#sessionStop').addEventListener('click', function () {
      clearSession();
      $('#sessionStatus').textContent = T.timerCancelled;
    });
    setInterval(tickSession, 1000);
  }
  function setupPlay(slug) {
    stat('open', slug, !renderedHash);
    // Before the visit is counted: telemetry reports the plays before this one.
    tm('open', slug, !renderedHash);
    prof('visit', slug);
    pushRecent(slug);
    mountFrame(slug);
    var stage = $('#stage');
    stage.addEventListener('mousedown', activateGame);
    stage.addEventListener('click', activateGame);
    $('#favBtn').addEventListener('click', function (e) {
      var result = toggleFav(slug), on = result.on;
      var b = this;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      b.title = on ? T.favOn : T.fav;
      b.setAttribute('aria-label', b.title);
      $('.heart', b).textContent = on ? '❤️' : '🤍';
      $('.pb-lbl', b).textContent = on ? T.favOn : T.fav;
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if (on) burst(b, ['❤️', '💖', '✨', '💗']);
      toast(result.saved ? (on ? T.favAdded : T.favRemoved) : T.favTemporary);
      // After a mouse click the keys go back to the game (so Space doesn't press this button again).
      if (e.detail) activateGame();
    });
    $('#restartBtn').addEventListener('click', function () {
      var b = this;
      b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
      mountFrame(slug);
    });
    $('#gameRetry').addEventListener('click', function () { mountFrame(slug); });
    // The next child starts as a guest on the "who's playing?" strip.
    $('#sessionEnd').addEventListener('click', function () {
      clearSession();
      $('#sessionStatus').textContent = T.nextPlayer;
      prof('select', '');
      whoFocus = true;
      go('#/');
    });
    $('#sessionFinish').addEventListener('click', function () {
      clearSession();
      $('#sessionStatus').textContent = T.finishHint;
      activateGame();
    });
    $('#sessionHandoff').addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      var end = $('#sessionEnd'), finish = $('#sessionFinish');
      (document.activeElement === end ? finish : end).focus();
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
    var minW = Math.min(300, availW);
    var w = Math.floor(Math.min(availW, Math.max(minW, (window.innerHeight - fixed - 64) * 16 / 9)));
    wrap.classList.toggle('compact', w < 760);
    wrap.style.width = w + 'px';
    side.style.width = wide ? '' : w + 'px';
    // Width changes can move the stage as well as wrap its toolbar. Measure
    // the rendered bottom after each change instead of reusing its old top.
    // Shrinking monotonically also avoids oscillating across wrap breakpoints.
    for (var pass = 0; pass < 8; pass++) {
      var overflow = bar.getBoundingClientRect().bottom + (window.pageYOffset || 0) - (window.innerHeight - 10);
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
  var typing = false;
  var chipsKey = null;
  function render() {
    var route = parseRoute();
    var app = $('#app');
    var body = document.body;
    var active = document.activeElement;
    var previousGame = current;
    var returnState = previousGame && route.name !== 'play' && playReturn && routeHash() === playReturn.hash ? playReturn : null;
    var moveFocus = !typing && active && ($('#chips').contains(active) || $('#quickFilters').contains(active) || app.contains(active));
    if (route.name === 'play' && !current && renderedHash) {
      playReturn = pendingReturn || { hash: renderedHash, scroll: window.pageYOffset || 0, slug: route.slug };
    }
    pendingReturn = null;
    clearTimeout(readyTimer);
    if (current && route.name !== 'play') exitFullscreen();
    body.className = 'route-' + route.name;
    var nextChipsKey = route.name + (route.id || '');
    if (chipsKey !== nextChipsKey) {
      $('#chips').innerHTML = chipsHTML(route);
      $('#quickFilters').innerHTML = quickHTML(route);
      chipsKey = nextChipsKey;
    }
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
    } else if (route.name === 'favorites') {
      html = renderFavorites();
      title = T.favs + ' — ' + name;
    } else if (route.name === 'search') {
      html = renderSearch(route);
      title = (route.q ? T.titleSearch + route.q : T.searchTitle) + ' — ' + name;
    } else if (route.name === 'quick') {
      html = renderQuick(route);
      title = (QUICK[route.id] ? QUICK[route.id].label + ' — ' : '') + name;
    } else {
      html = renderHome();
      var tag = noEmoji(SITE.tagline);
      title = name + (tag ? ' — ' + tag : '');
    }
    // Leaving the game or switching games closes its session; a re-render of
    // the same game only replaces the frame.
    stat(current && current === previousGame ? 'gone' : 'close');
    prof(current && current === previousGame ? 'gone' : 'close');
    tm(current && current === previousGame ? 'gone' : 'close');
    if (previousGame && !current) juice('back');
    // fullscreenchange comes only after the fullscreen stage is replaced here.
    parkToast();
    app.innerHTML = html;
    $('#searchStatus').textContent = route.name === 'search' ? ((route.q || '').trim() ? T.found(search(route.q).length) : T.searchPrompt) : '';
    document.title = title;
    fitStage();
    if (current) setupPlay(current);
    if (!typing) window.scrollTo(0, returnState ? returnState.scroll : 0);
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
    // The topbar badge and "hand over the device" lead to the "who's playing?" strip.
    if (whoFocus && route.name === 'home') focusWho();
    whoFocus = false;
    renderedHash = routeHash();
    typing = false;
    window.dispatchEvent(new Event('sg:sessionchange'));
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
    juice('whoosh', 0.8);
    stat('tag', g.slug, 'surprise');
    tm('tag', g.slug, 'surprise');
    go('#/play/' + enc(g.slug));
  }

  var SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ' ': 1, Spacebar: 1, PageUp: 1, PageDown: 1 };
  function onKey(e) {
    var t = e.target;
    var inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    // Native controls keep their own keyboard behavior and focus.
    var onControl = t && t.closest && t.closest('button, a[href], input, textarea, select, summary, [role="button"], [role="slider"]');
    if (current && !inField && !onControl && SCROLL_KEYS[e.key]) {
      // In the play view keys belong to the game, never to page scrolling.
      e.preventDefault();
      activateGame();
      return;
    }
    // "/" focuses the search box (the same key is "ظ" on an Arabic keyboard).
    if (!current && !inField && (e.key === '/' || e.code === 'Slash') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      $('#q').focus();
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
    // A game tile or the starter card plays the select sound (never a hover sound).
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.tile[data-slug], .starter') : null;
      if (!t || e.button || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      juice('select');
      // Telemetry tells the starter card apart (js/stats.js counts it as history).
      if (t.classList.contains('starter')) tm('tag', t.getAttribute('data-slug'), 'starter');
    });
    document.addEventListener('click', function (e) {
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
      if (res.length === 1) { q.blur(); stat('tag', res[0].slug, 'search'); tm('tag', res[0].slug, 'search'); go('#/play/' + enc(res[0].slug)); return; }
      // Several results: hand keyboard focus to the first one.
      var first = $('#app .tile');
      if (res.length && first) first.focus(); else q.blur();
    });
    $('#surprise').addEventListener('click', surprise);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', render);
    window.addEventListener('message', onGameMessage);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('resize', fitStage);
    setupClassroom();
    setupPlayer();
    watchTiles();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

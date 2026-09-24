/*
 * Recess Arcade portal. Plain script (no modules, no fetch) so the site also
 * works when index.html is opened straight from a folder (file://).
 *
 * Routes (hash based):
 *   #/                home
 *   #/c/<category>    one category
 *   #/search/<text>   search results
 *   #/play/<slug>     play a game
 *
 * Data comes from js/catalog.js: window.SITE, window.CATEGORIES, window.GAMES.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ data */
  var SITE = window.SITE || { name: 'Recess Arcade', tagline: '' };
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
  function isMulti(g) { return String(g.players || '').indexOf('2') >= 0 || String(g.players || '').indexOf('3') >= 0; }
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
  var LOGO_COLORS = ['#ff4f6d', '#ff9f1c', '#ffcf1f', '#3ddc84', '#22b8ff', '#a66bff', '#ff5ca8'];
  var LOGO_TILT = [-6, 4, -3, 5, -5, 3, -4, 6, -2, 4];
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
  function logoSVG(name) {
    var words = String(name || 'Arcade').trim().split(/\s+/);
    var line1 = words.length > 1 ? words.slice(0, -1).join(' ') : words[0];
    var line2 = words.length > 1 ? words[words.length - 1].toUpperCase() : '';
    var letters = '', shadow = '', k = 0;
    var rot = [];
    for (var i = 0; i < line1.length; i++) {
      var ch = line1[i];
      rot.push(LOGO_TILT[i % LOGO_TILT.length]);
      if (ch === ' ') { letters += ' '; continue; }
      letters += '<tspan fill="' + LOGO_COLORS[k++ % LOGO_COLORS.length] + '">' + esc(ch) + '</tspan>';
    }
    shadow = esc(line1);
    var y1 = line2 ? 33 : 44;
    var w1 = Math.round(line1.length * 19.5) + 8;
    var w2 = line2 ? Math.round(line2.length * 11.5) + 22 : 0;
    var W = 72 + Math.max(w1, w2) + 6;
    return '<svg class="logo-svg" viewBox="0 0 ' + W + ' 64" height="56" role="img" aria-label="' + esc(name) + '" xmlns="http://www.w3.org/2000/svg">' +
      iconSVG() +
      '<text class="l1s" x="72" y="' + (y1 + 3) + '" rotate="' + rot.join(' ') + '" fill="#1c2250" stroke="#1c2250" stroke-width="7" stroke-linejoin="round">' + shadow + '</text>' +
      '<text class="l1" x="72" y="' + y1 + '" rotate="' + rot.join(' ') + '" stroke="#1c2250" stroke-width="6" stroke-linejoin="round" paint-order="stroke">' + letters + '</text>' +
      (line2 ? '<g class="l2"><rect class="l2bg" x="74" y="40" width="' + w2 + '" height="21" rx="10.5" fill="#ff4fa3" stroke="#1c2250" stroke-width="3"/>' +
        '<text class="l2t" x="' + (74 + w2 / 2) + '" y="56" text-anchor="middle" fill="#fff">' + esc(line2) + '</text></g>' : '') +
      '</svg>';
  }
  // Once the font is ready, fit the viewBox to the real text width.
  function fitLogo() {
    var svg = $('.logo-svg');
    if (!svg) return;
    try {
      var t1 = $('.l1', svg), t2 = $('.l2t', svg), bg = $('.l2bg', svg);
      var w1 = t1.getComputedTextLength() + 10;
      var w2 = 0;
      if (t2 && bg) {
        w2 = t2.getComputedTextLength() + 24;
        bg.setAttribute('width', w2);
        t2.setAttribute('x', 74 + w2 / 2);
      }
      var W = Math.ceil(72 + Math.max(w1, w2) + 6);
      if (W > 80 && W < 800) svg.setAttribute('viewBox', '0 0 ' + W + ' 64');
    } catch (e) { /* keep the estimate */ }
  }

  /* ------------------------------------------------------------- tiles */
  var tileCount = 0;
  function tileHTML(g, opts) {
    opts = opts || {};
    var cls = 'tile' + (opts.big ? ' big' : '') + (opts.cls ? ' ' + opts.cls : '');
    var badges = '';
    if (g.hot) badges += '<b class="badge hot">HOT</b>';
    if (isMulti(g)) badges += '<b class="badge p2">2P</b>';
    tileCount++;
    return '<a class="' + cls + '" href="#/play/' + enc(g.slug) + '" data-slug="' + esc(g.slug) + '"' +
      ' style="--c:' + g.color + ';--c2:' + deepen(g.color, 0.45) + '" aria-label="' + esc(g.title) + '">' +
      '<span class="art">' +
        '<span class="fb" aria-hidden="true"><span class="fb-emoji">' + catEmoji(g) + '</span><span class="fb-title">' + esc(g.title) + '</span></span>' +
        '<img src="games/' + esc(g.slug) + '/thumb.svg" alt="" loading="lazy" decoding="async" draggable="false"' +
        ' onload="this.parentNode.parentNode.classList.add(\'loaded\')"' +
        ' onerror="this.parentNode.parentNode.classList.add(\'noimg\');this.parentNode.removeChild(this)">' +
      '</span>' +
      (badges ? '<span class="badges">' + badges + '</span>' : '') +
      '<span class="label">' + esc(g.title) + '</span>' +
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
      '<div class="sec-head"><h2><span class="sec-icon">' + icon + '</span> ' + esc(title) + '</h2>' + (more || '') + '</div>' +
      inner + '</section>';
  }

  // A section that sits in a .cat-rows grid, spanning as many columns as it has tiles (at least minSpan).
  function rowSecHTML(icon, title, list, gridCls, minSpan) {
    return '<section class="sec cat-sec" data-n="' + list.length + '" data-min="' + (minSpan || 1) + '">' +
      '<div class="sec-head"><h2><span class="sec-icon">' + icon + '</span> ' + esc(title) + '</h2></div>' +
      gridHTML(list, gridCls) + '</section>';
  }

  /* ------------------------------------------------------------ layout */
  var cols = 8;
  function packMosaic(el) {
    var kids = Array.prototype.slice.call(el.children);
    var hot = kids.filter(function (k) { return k.getAttribute('data-hot') === '1'; });
    var plain = kids.filter(function (k) { return k.getAttribute('data-hot') !== '1'; });
    var fill = el.getAttribute('data-fill') === '1';
    var bigSize = cols >= 4 ? 2 : 1;
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
        var seed = v * 9301 + cols * 49297, left = B;
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
        if (c + s > cols) return false;
        for (var y = r; y < r + s; y++) for (var x = c; x < c + s; x++) if (grid[y] && grid[y][x]) return false;
        return true;
      }
      for (var i = 0; i < o.list.length; i++) {
        var s = o.list[i].__big ? bigSize : 1;
        var placed = false;
        for (var r = 0; !placed; r++) {
          for (var c = 0; c + s <= cols; c++) {
            if (free(r, c, s)) {
              for (var y = r; y < r + s; y++) { grid[y] = grid[y] || []; for (var x = c; x < c + s; x++) grid[y][x] = 1; }
              pos.push([r, c, s]); used += s * s; placed = true; break;
            }
          }
        }
      }
      return { pos: pos, holes: grid.length * cols - used };
    }
    function mark(B) { hot.forEach(function (k, i) { k.__big = i < B; }); plain.forEach(function (k) { k.__big = false; }); }
    var best = null, bestO = null;
    function attempt(B, S, v) {
      mark(B);
      var o = order(B, S, v), res = sim(o);
      if (!best || res.holes < best.holes) { best = res; bestO = o; }
      return res.holes === 0;
    }
    if (!fill) {
      attempt(hot.length, plain.length, 0);
    } else {
      var done = false, d, B, S, v, poolN, minS;
      // Prefer: every hot tile big, then as many small tiles as possible, with a lively order.
      for (d = 0; d <= 3 && d <= hot.length && !done; d++) {
        B = hot.length - d; poolN = d + plain.length; minS = Math.min(poolN, cols);
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
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function haystack(g) {
    var cats = g.cats.map(function (id) { return CAT_BY_ID[id] ? CAT_BY_ID[id].label + ' ' + id : id; }).join(' ');
    return norm(g.title + ' ' + g.slug.replace(/-/g, ' ') + ' ' + (g.blurb || '') + ' ' + cats +
      (isMulti(g) ? ' 2 two player players friend multiplayer versus' : '') + (g.hot ? ' hot popular' : ''));
  }
  function subseq(needle, hay) {
    var j = 0;
    for (var i = 0; i < hay.length && j < needle.length; i++) if (hay[i] === needle[j]) j++;
    return j === needle.length;
  }
  function search(q) {
    var words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    var scored = [];
    GAMES.forEach(function (g) {
      var t = norm(g.title), h = haystack(g), score = 0;
      var all = words.every(function (w) {
        if (t.indexOf(w) === 0) { score += 10; return true; }
        if ((' ' + t).indexOf(' ' + w) >= 0) { score += 7; return true; }
        if (t.indexOf(w) >= 0) { score += 5; return true; }
        if ((' ' + h).indexOf(' ' + w) >= 0) { score += 3; return true; }
        if (w.length >= 3 && h.indexOf(w) >= 0) { score += 1; return true; }
        return false;
      });
      if (all) scored.push([score + (g.hot ? 0.5 : 0), g]);
    });
    if (!scored.length) {
      // Forgiving fallback for spelling slips: letters in order inside the title.
      var flat = words.join('');
      GAMES.forEach(function (g) { if (flat.length >= 3 && subseq(flat, norm(g.title).replace(/ /g, ''))) scored.push([1, g]); });
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
    var html = '<a class="chip' + (route.name === 'home' ? ' on' : '') + '" href="#/" style="--cc:#1c2250"><span class="chip-ico">🏠</span>Home</a>';
    CATS.forEach(function (c) {
      var on = route.name === 'cat' && route.id === c.id;
      html += '<a class="chip' + (on ? ' on' : '') + '" href="#/c/' + enc(c.id) + '" style="--cc:' + catColor(c.id) + '">' +
        '<span class="chip-ico">' + esc(c.icon || '🎮') + '</span>' + esc(c.label) + '</a>';
    });
    return html;
  }

  function renderHome() {
    var html = '';
    var hot = GAMES.filter(function (g) { return g.hot; });
    var rest = GAMES.filter(function (g) { return !g.hot; });
    if (!GAMES.length) {
      return '<div class="empty"><div class="empty-emoji">🛠️</div><h2>Games are on the way!</h2><p>Check back soon.</p></div>';
    }
    var tag = SITE.tagline ? '<span class="tagline">' + esc(SITE.tagline) + '</span>' : '';
    html += sectionHTML('🔥', 'Hot right now', mosaicHTML(hot, rest, true), tag);

    var recent = getRecent();
    var favs = getFavs();
    if (recent.length || favs.length) {
      html += '<div class="cat-rows mine">';
      if (recent.length) html += rowSecHTML('🕹️', 'Keep playing', recent.map(function (s) { return BY_SLUG[s]; }), 'one-row', 3);
      if (favs.length) html += rowSecHTML('❤️', 'Your favorites', favs.map(function (s) { return BY_SLUG[s]; }), '', 3);
      html += '</div>';
    }
    html += '<div class="cat-rows">';
    CATS.forEach(function (c) {
      var list = gamesIn(c.id);
      html += '<section class="sec cat-sec" data-n="' + list.length + '">' +
        '<div class="sec-head"><h2><a href="#/c/' + enc(c.id) + '"><span class="sec-icon">' + esc(c.icon || '🎮') + '</span> ' + esc(c.label) + '</a></h2>' +
        '<a class="see-all" href="#/c/' + enc(c.id) + '" aria-label="See all ' + esc(c.label) + ' games"><span class="sa-txt">See all </span>' + list.length + ' ›</a></div>' +
        gridHTML(list, 'one-row') + '</section>';
    });
    html += '</div>';
    var abc = GAMES.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
    html += sectionHTML('🎮', 'All games', gridHTML(abc), '<span class="count">' + GAMES.length + ' games</span>');
    return html;
  }

  function renderCat(route) {
    var c = CAT_BY_ID[route.id];
    var list = c ? gamesIn(c.id) : [];
    if (!c || !list.length) return notFound('We couldn\'t find that category.');
    var hot = list.filter(function (g) { return g.hot; });
    var rest = list.filter(function (g) { return !g.hot; });
    var others = GAMES.filter(function (g) { return list.indexOf(g) < 0; });
    return '<div class="banner" style="--cc:' + catColor(c.id) + '">' +
        '<span class="banner-ico">' + esc(c.icon || '🎮') + '</span>' +
        '<div><h1>' + esc(c.label) + ' games</h1><p>' + list.length + (list.length === 1 ? ' game' : ' games') + ' to play</p></div>' +
      '</div>' +
      '<section class="sec">' + mosaicHTML(hot, rest, false) + '</section>' +
      (others.length ? sectionHTML('✨', 'Try something different', gridHTML(shuffle(others.slice()).slice(0, 24))) : '');
  }

  function renderSearch(route) {
    var q = route.q || '';
    var res = search(q);
    var head = '<div class="banner search-banner" style="--cc:#00a6ff"><span class="banner-ico">🔍</span><div>' +
      '<h1>' + (q ? '“' + esc(q) + '”' : 'Search') + '</h1>' +
      '<p>' + (q ? (res.length ? res.length + (res.length === 1 ? ' game found' : ' games found') : 'No games found') : 'Type to find a game') + '</p></div></div>';
    if (res.length) return head + '<section class="sec">' + gridHTML(res) + '</section>';
    var hot = GAMES.filter(function (g) { return g.hot; });
    return head + '<div class="empty small"><div class="empty-emoji">🙈</div><p>Hmm, nothing matches that. Try one of these!</p></div>' +
      sectionHTML('🔥', 'Hot right now', gridHTML(hot.length ? hot : GAMES.slice(0, 12)));
  }

  function notFound(msg) {
    var hot = GAMES.filter(function (g) { return g.hot; });
    return '<div class="empty"><div class="empty-emoji">🙈</div><h2>Oops!</h2><p>' + esc(msg) + '</p>' +
      '<a class="big-btn" href="#/">🏠 Back to all games</a></div>' +
      (GAMES.length ? sectionHTML('🔥', 'Hot right now', gridHTML(hot.length ? hot : GAMES.slice(0, 12))) : '');
  }

  function keycap(k) {
    var s = String(k);
    var mouse = /click|mouse|drag|swipe|tap/i.test(s);
    var cls = 'kc' + (mouse ? ' mouse' : '') + (s.length > 2 && !mouse ? ' wide' : '');
    return '<kbd class="' + cls + '">' + (mouse ? '<span aria-hidden="true">🖱️</span> ' : '') + esc(s) + '</kbd>';
  }
  function controlsHTML(g) {
    var rows = g.controls.map(function (c) {
      var keys = (Array.isArray(c.keys) ? c.keys : [c.keys]).map(keycap).join('');
      return '<li><span class="keys">' + keys + '</span><span class="act">' + esc(c.action || '') + '</span></li>';
    }).join('');
    return '<div class="card controls"><h3>🎮 Controls</h3>' +
      (rows ? '<ul class="ctl-list">' + rows + '</ul>' : '<p class="muted">Use your mouse and keyboard!</p>') +
      (g.blurb ? '<p class="blurb">' + esc(g.blurb) + '</p>' : '') + '</div>';
  }
  var FS_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderPlay(route) {
    var g = BY_SLUG[route.slug];
    if (!g) return notFound('That game is hiding. Pick another one!');
    var fav = isFav(g.slug);
    var cats = g.cats.filter(function (id) { return CAT_BY_ID[id]; }).map(function (id) {
      var c = CAT_BY_ID[id];
      return '<a class="mini-chip" href="#/c/' + enc(id) + '" style="--cc:' + catColor(id) + '">' + esc(c.icon || '') + ' ' + esc(c.label) + '</a>';
    }).join('');
    var players = String(g.players || '1');
    var pl = '<span class="players">' + (isMulti(g) ? '👥 ' + esc(players) + ' players' : '👤 1 player') + '</span>';

    // Related: shared categories first (most overlap), then hot, then the rest.
    var more = GAMES.filter(function (o) { return o !== g; }).map(function (o) {
      var shared = o.cats.filter(function (id) { return g.cats.indexOf(id) >= 0; }).length;
      return [shared * 10 + (o.hot ? 2 : 0) + Math.random(), o];
    }).sort(function (a, b) { return b[0] - a[0]; }).map(function (x) { return x[1]; });

    return '<div class="play" id="play">' +
        '<div class="play-main" id="playMain">' +
          '<div class="stage-wrap" id="stageWrap">' +
            '<div class="stage loading" id="stage" style="--c:' + g.color + '">' +
              '<div class="stage-loading" aria-hidden="true"><svg viewBox="0 0 64 64" width="84" height="84">' + iconSVG() + '</svg><span>Loading ' + esc(g.title) + '…</span></div>' +
              '<div class="stage-msg" id="stageMsg" hidden><div class="empty-emoji">🛠️</div><b>This game is still being built!</b><span>Try another one below.</span></div>' +
            '</div>' +
            '<div class="play-bar" id="playBar">' +
              '<div class="pb-info"><h1 class="pb-title">' + esc(g.title) + '</h1><div class="pb-meta">' + pl + cats + '</div></div>' +
              '<div class="pb-btns">' +
                '<button type="button" class="pbtn fav' + (fav ? ' on' : '') + '" id="favBtn" aria-pressed="' + fav + '"><span class="heart">' + (fav ? '❤️' : '🤍') + '</span><span class="pb-lbl">' + (fav ? 'Favorite!' : 'Favorite') + '</span></button>' +
                '<button type="button" class="pbtn" id="restartBtn" title="Restart game"><span>🔄</span><span class="pb-lbl">Restart</span></button>' +
                '<button type="button" class="pbtn fs" id="fsBtn" title="Full screen">' + FS_ICON + '<span class="pb-lbl">Full screen</span></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<aside class="play-side" id="playSide">' + controlsHTML(g) +
          '<div class="card tip"><h3>💡 Tip</h3><p>Keys not working? <b>Click on the game</b> first!</p><p>Press <b>Full screen</b> for the biggest view.</p></div>' +
        '</aside>' +
      '</div>' +
      sectionHTML('💖', 'More games you\'ll love', gridHTML(more));
  }

  /* -------------------------------------------------------- play logic */
  var current = null;   // current play slug
  function frameEl() { return $('#stage iframe'); }
  function focusGame() {
    var f = frameEl();
    if (!f) return;
    var a = document.activeElement;
    if (a && a.id === 'q') return; // don't steal focus from someone typing a search
    try { f.focus(); } catch (e) { /* ignore */ }
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
    f.setAttribute('title', (BY_SLUG[slug] || {}).title || 'Game');
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
      if (!fn) { toast('Full screen isn\'t available here. Try the F11 key!'); return; }
      var p = fn.call(stage);
      if (p && p.then) {
        p.then(focusGame, function () { toast('Full screen didn\'t work. Try the F11 key!'); });
      } else focusGame();
    } catch (e) {
      toast('Full screen didn\'t work. Try the F11 key!');
    }
  }
  function onFsChange() {
    var b = $('#fsBtn');
    if (b) $('.pb-lbl', b).textContent = isFullscreen() ? 'Exit full screen' : 'Full screen';
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
    $('#favBtn').addEventListener('click', function () {
      var on = toggleFav(slug);
      var b = this;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      $('.heart', b).textContent = on ? '❤️' : '🤍';
      $('.pb-lbl', b).textContent = on ? 'Favorite!' : 'Favorite';
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if (on) { heartBurst(b); toast('Saved to your favorites ❤️'); } else toast('Removed from favorites');
      focusGame();
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
    var play = $('#play'), side = $('#playSide'), bar = $('#playBar'), top = $('#topbar');
    var wide = window.innerWidth >= 1200;
    var ps = getComputedStyle(play);
    var availW = play.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
    if (wide) availW -= (side.offsetWidth || 270) + 20;
    var fixed = top.offsetHeight + parseFloat(ps.paddingTop) + 12 /* bar gap */ + 12 /* bottom air */;
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

    tileCount = 0;
    var html, title;
    current = null;
    if (route.name === 'play') {
      var g = BY_SLUG[route.slug];
      html = renderPlay(route);
      title = g ? g.title + ' — ' + SITE.name : 'Game not found — ' + SITE.name;
      if (g) current = g.slug;
      else body.className = 'route-missing';
    } else if (route.name === 'cat') {
      html = renderCat(route);
      var c = CAT_BY_ID[route.id];
      title = (c ? c.label + ' games' : 'Category') + ' — ' + SITE.name;
    } else if (route.name === 'search') {
      html = renderSearch(route);
      title = (route.q ? 'Search: ' + route.q : 'Search') + ' — ' + SITE.name;
    } else {
      html = renderHome();
      title = SITE.name + (SITE.tagline ? ' — ' + SITE.tagline.replace(/[^\w\s!.,'-]/g, '').trim() : '');
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
    if (current && !inField && SCROLL_KEYS[e.key]) {
      // In the play view keys belong to the game, never to page scrolling.
      e.preventDefault();
      focusGame();
      return;
    }
    if (!current && !inField && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      $('#q').focus();
    }
  }

  function init() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    $('#logo').innerHTML = logoSVG(SITE.name);
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitLogo(); layout(); });
    } catch (e) { /* ignore */ }
    setTimeout(fitLogo, 600);

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
      if (res.length === 1) { q.blur(); go('#/play/' + enc(res[0].slug)); }
      else q.blur();
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

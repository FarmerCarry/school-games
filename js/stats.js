/*
 * Local play statistics: the portal recorder (docs/PLAY_STATS.md, section 2).
 * Games report engaged time, frame smoothness and round events over the frame
 * channel (sg:stats). This adds opens, sessions, load times, launch sources and
 * settings, and merges small deltas into one localStorage record per local day.
 * Nothing leaves this PC: no network, no names, no typed text, no error text.
 * Every storage call is guarded and nothing is logged; js/site.js calls the
 * window.SGStats methods through its own try/catch as well.
 *
 * A session, also the value of its entry in sg:site:stats:live:
 *   g slug, t opened (Date.now()), e engaged ms, r a frame sent sg:ready,
 *   f a frame failed (sg:error or timeout), m a frame was mounted,
 *   i id of the last started round, q how that round ended ('' while it is open),
 *   p the current frame's open round, u its engaged ms so far,
 *   n when the entry was written (Date.now()),
 *   w the entry was written once, x it files no length and no gave up (another
 *   page closed it, or collection was stopped during it), c closed, d finished;
 *   o only on a session left over from a crash: its open round, now a quit.
 * A frame: w its window (let go of 2 s after removal), s its session,
 *   t mounted (performance.now()), l its load is timed (a session's first frame),
 *   v the page stayed visible while it loaded, r it sent sg:ready,
 *   o its open round and u that round's engaged ms so far (o and om of its last
 *   sg:stats), d that round is settled.
 */
(function () {
  'use strict';

  var PRE = 'sg:site:stats', META = PRE + 'meta', LIVE = PRE + ':live', DAY = PRE + ':d:';
  var D = {}, since = 0;               // unwritten deltas by local date; when the oldest was made (0: none)
  var off = 0, cleared = 0;            // from statsmeta: collection stopped, clearedAt
  var sess = 0, cur = 0, gone = [];    // open session, its frame, frames removed in the last 2 s
  var tag = 0, timer = 0;
  var tab = Math.random();             // this tab's entry in the live key
  var isArr = Array.isArray, max = Math.max, min = Math.min, str = JSON.stringify, doc = document;

  function now() { return Date.now(); }
  // A stored value, or undefined when it is missing, damaged or storage is blocked.
  function get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { /* no value */ } }
  // A stored object as a plain object, whatever was stored.
  function getObj(k) { return Object.assign({}, get(k)); }
  function isObj(o) { return !!o && typeof o == 'object'; }
  function zeros(n) { for (var a = []; n--;) a.push(0); return a; }
  function num(v, top) { return v > 0 && v < 1 / 0 ? min(Math.round(v), top) : 0; }
  // A name that is safe as a key: it matches `re` and no plain lookup reaches Object.prototype.
  function key(v, re) { return typeof v == 'string' && re.test(v) && !(v in Object.prototype); }
  // Level ids come from each game's own list; anything else could be typed text.
  function ok(id) { return key(id, /^(?!.*\d{3})[A-Za-z][\w:.-]{0,23}$/); }

  /* ------------------------------------------------------------ deltas */
  // The delta for a game (or, without a slug, the day) at time t, filed under the
  // local date. While collection is stopped the numbers go nowhere.
  function delta(slug, t) {
    var k = new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10), day = !off && D[k];
    if (!day) {
      day = { s: { calm: 0, fs: 0, mute: 0 }, g: {} };
      if (!off) { D[k] = day; since = since || now(); }
    }
    return !slug ? day : day.g[slug] || (day.g[slug] = {
      o: 0, e: 0, hh: {}, b: zeros(4), ns: 0, src: {}, l: zeros(3), ls: 0,
      x: 0, t: 0, f: zeros(4), tu: zeros(2), fav: 0, lv: {}
    });
  }
  function level(g, id) { return g.lv[id] || (g.lv[id] = zeros(12)); }
  // Add a delta into a record. The load maximum (l[2]) and score maximum (lv[id][8]) keep the larger value.
  function add(t, d, p) {
    for (var k in d) {
      var v = d[k], c = t[k];
      if (isObj(v)) add(isObj(c) ? c : (t[k] = isArr(v) ? [] : {}), v, p == 'lv' ? 'L' : k);
      else t[k] = (p == 'l' && k == 2) || (p == 'L' && k == 8) ? max(+c || 0, v) : (+c || 0) + v;
    }
  }

  /* ------------------------------------------------------------ rounds */
  // Given up: the level's last outcome was a loss or a quit when the child moved on.
  function gaveUp(s, t) { if (s.q == 'l' || s.q == 'q') level(delta(s.g, t), s.i)[11]++; }
  function round(s, x, t) {
    var c = x[0], id = x[1], score = x[3], g = delta(s.g, t), i = { s: 0, w: 1, l: 2, d: 3, e: 4, q: 5 }[c], a;
    // While collection is stopped the session forgets its rounds: nothing from
    // that time can be given up or end a visit later.
    if (off) return s.i = s.q = 0;
    if (c == 't') { i = { start: 0, done: 1 }[id]; if (i >= 0) g.tu[i]++; return; }
    if (!(i >= 0) || !ok(id)) return;
    a = level(g, id);
    a[i]++;
    if (i) {
      a[6] += num(x[2], 108e5);
      if (typeof score == 'number' && score >= 0) {
        score = min(score, 1e9);
        a[7] += score; a[8] = max(a[8], score); a[9]++;
      }
      if (id == s.i) s.q = c;
    } else {
      // A visit is a start whose previous round in the session had another id.
      if (id != s.i) { a[10]++; gaveUp(s, t); s.i = id; }
      s.q = '';
    }
  }
  // The last known open round of a replaced or departed frame becomes a quit,
  // with the engaged ms its last message reported for it.
  function quitOpen(f, t) {
    if (!f.d) { f.d = 1; if (f.o) round(f.s, ['q', f.o, f.u], t); }
  }
  function quitGone(s, t) { gone.forEach(function (f) { if (f.s == s) quitOpen(f, t); }); }

  /* ---------------------------------------------------------- sessions */
  function finish(s) {
    var t = now(), g;
    if (s.d) return;
    s.d = 1;
    quitGone(s, t);
    if (s.o) round(s, ['q', s.o, s.u], t);   // a session left over from a crash
    // Closed by another tab, stopped meanwhile, or begun before a teacher cleared the numbers: no length.
    if (!s.x && s.t >= cleared) {
      gaveUp(s, t);
      g = delta(s.g, s.t);   // the length goes to the day the session opened
      if (!s.r) g.ns++;
      else if (!s.f) g.b[s.e < 6e4 ? 0 : s.e < 3e5 ? 1 : s.e < 9e5 ? 2 : 3]++;
    }
    flush();
  }
  function settle(f) {
    quitOpen(f, now());
    if (f.s.c) finish(f.s);
  }
  // The current frame is being removed: keep its window for 2 s for its last sg:stats.
  function drop() {
    var f = cur;
    if (!f) return;
    cur = 0;
    gone.push(f);
    setTimeout(safe(settle), 1000, f);
    // Then let go of the window. Holding it would keep the removed game's whole
    // document and heap alive, and the next game's garbage collections would walk it.
    setTimeout(function () { f.w = 0; gone = gone.filter(function (x) { return x != f; }); }, 2000);
  }
  function close() {
    var s = sess;
    drop();
    if (!s) return;
    sess = 0;
    s.c = 1;
    if (!gone.some(function (f) { return f.s == s && !f.d; })) finish(s);
  }

  /* ----------------------------------------------------------- storage */
  // statsmeta: stopped collection drops everything, a clear drops older deltas.
  function meta() {
    var m = getObj(META), el = doc.getElementById('statsOff');
    off = m.off ? 1 : 0;
    cleared = +new Date(m.clearedAt) || 0;
    if (off || since && cleared > since) { D = {}; since = 0; }
    // A session that was open while collection stopped files no length or gave up.
    if (off && sess) sess.x = 1;
    if (el) el.hidden = !off;
    return m;
  }
  // Keep the newest 120 day records and all stats keys under 300 KB; `extra` frees one more day.
  // A day removed for space, not by the 120-day limit, is remembered in statsmeta
  // ('pruned', the newest such date), so the teacher page can warn about it.
  function prune(extra) {
    for (var ls = localStorage, days = [], total = 0, i = ls.length, k, n, p, m; i--;) {
      k = ls.key(i);
      if (!k.indexOf(PRE)) {
        total += n = k.length + ls.getItem(k).length;
        if (!k.indexOf(DAY)) days.push([k, n]);
      }
    }
    for (days.sort(); days.length && (days.length > 120 || total > 307200 || extra); extra = 0) {
      k = days.shift();
      ls.removeItem(k[0]);
      total -= k[1];
      if (days.length < 120) p = k[0].slice(DAY.length);
    }
    if (p && !((m = getObj(META)).pruned >= p)) { m.pruned = p; ls.setItem(META, str(m)); }
  }
  // A full storage gives up its oldest day and tries once more; other failures give up.
  function put(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {
      if (!/quota/i.test(e.name)) throw e;
      prune(1);
      localStorage.setItem(k, v);
    }
  }
  function putLive(live) { put(LIVE, str(live)); }
  // A day stays under 16 KB: each game keeps its first 64, 32, 16… level ids of
  // the day and the extra ones fold into '_other'.
  function fit(r) {
    for (var s, n = 64, k, g, id, i; (s = str(r)).length > 16383 && n; n >>= 1) {
      for (k in r.g) {
        g = r.g[k];
        i = 0;
        for (id in g.lv) if (id != '_other' && ++i > n) { add(level(g, '_other'), g.lv[id], 'L'); delete g.lv[id]; }
      }
    }
    return s;
  }
  // Mirror the open session so the next portal load can close it after a crash or
  // a power cut. A page whose written entry is gone was closed by another page.
  function mirror() {
    var live = getObj(LIVE);
    if (sess && sess.w && !live[tab]) sess.x = 1;
    if (sess && !sess.x) { sess.p = cur && cur.o; sess.u = cur && cur.u; sess.n = now(); live[tab] = sess; } else delete live[tab];
    putLive(live);
    if (sess) sess.w = 1;
  }
  // getItem, check, add the deltas, setItem, forget the deltas: open tabs add up.
  function flush() {
    var m = meta(), d, k, r, g, favs;
    clearTimeout(timer);
    timer = 0;
    try {
      if (since) {
        g = m.pc = isObj(m.pc) ? m.pc : {};
        if (!g.id) {
          g.id = 'pc' + [].map.call(crypto.getRandomValues(new Uint8Array(4)), function (b) { return (b % 26 + 10).toString(36); }).join('');
          m.since = m.since || Object.keys(D).sort()[0];
          put(META, str(m));
        }
        favs = get('sg:site:favs');
        for (d in D) {
          r = get(k = DAY + d);
          // add() replaces a damaged part with a fresh one.
          if (!r || r.v !== 1 || r.d !== d) r = { v: 1, d: d, s: {}, g: {} };
          add(r, D[d]);
          for (g in r.g) {
            if (isObj(r.g[g])) r.g[g].fav = +(isArr(favs) && favs.indexOf(g) >= 0);
            else delete r.g[g];
          }
          put(k, fit(r));
        }
        prune();
      }
      mirror();
    } catch (e) { /* statistics are simply not kept */ }
    D = {};
    since = 0;
  }
  // Calls from site.js and the listeners below never throw. Then the next write is
  // set: about 1 s after a change while the page is hidden, else at most once a minute.
  function safe(fn) {
    return function (a, b) {
      try { fn(a, b); } catch (e) { /* statistics never break the portal */ }
      // A pending minute is cut short by the flush when the page becomes hidden.
      if (since && !timer) timer = setTimeout(safe(flush), doc.hidden ? 1000 : 60000);
    };
  }

  /* --------------------------------------------------------------- API */
  var api = {
    // The portal navigated to a game's play page; a re-render keeps the session.
    open: function (slug, firstRender) {
      if (sess) return;
      var t = now(), g = delta(slug, t), src = 'history';
      if (tag && tag.g == slug && t - tag.t < 1000) src = tag.s;
      else if (firstRender) {
        src = 'direct';
        try { if (performance.getEntriesByType('navigation')[0].type == 'reload') src = 'reload'; } catch (e) { /* direct */ }
      }
      tag = 0;
      sess = { g: slug, t: t, e: 0, x: off };
      g.o++;
      g.src[src] = (g.src[src] || 0) + 1;
    },
    close: close,
    gone: drop,
    mount: function (win) {
      if (sess) { cur = { w: win, s: sess, t: performance.now(), l: !sess.m, v: !doc.hidden }; sess.m = 1; }
    },
    // A failure (x: sg:error, t: timeout) keeps the session but takes it out of the length buckets.
    fail: function (kind) {
      if (!cur) return;
      cur.s.f = 1;
      if (kind) delta(cur.s.g, now())[kind]++;
    },
    tag: function (slug, src) { tag = { g: slug, t: now(), s: src }; },
    set: function (k) { delta(0, now()).s[k]++; },
    // A message that passed site.js's origin check. Only the current frame may
    // report readiness; a frame removed under 2 s ago may still send sg:stats.
    msg: function (win, d) {
      var t = now(), f = cur && cur.w === win && cur, type = d && d.type, s, g, ms, i;
      if (!f) {
        gone.forEach(function (x) { if (x.w === win) f = x; });
        if (!f || type != 'sg:stats') return;
      }
      s = f.s;
      if (type == 'sg:ready' && !f.r) {
        f.r = s.r = 1;
        // Load time: a session's first frame only, and only if the page stayed visible.
        // A monotonic clock, so setting the PC's clock meanwhile cannot spoil it.
        if (f.l) {
          g = delta(s.g, t);
          ms = num(performance.now() - f.t, 6e5);
          if (f.v) { g.l[0]++; g.l[1] += ms; g.l[2] = max(g.l[2], ms); } else g.ls++;
        }
      }
      if (type == 'sg:stats' && d.version === 1) {
        if (f == cur) quitGone(s, t);   // a replaced frame's quit comes before the new frame's rounds
        g = delta(s.g, t);
        ms = num(d.e, 12e4);
        g.e += ms;
        s.e += ms;
        i = new Date(t).getHours();
        if (ms) g.hh[i] = (g.hh[i] || 0) + ms;
        for (i = 0; i < 4; i++) g.f[i] += num((d.f || 0)[i], 2e4);
        delta(0, t).s.mute += num(d.m, 100);
        if (isArr(d.r)) d.r.slice(0, 100).forEach(function (x) { if (isArr(x)) round(s, x, t); });
        f.o = ok(d.o) && d.o;
        f.u = d.om;
        if (f != cur) settle(f);
      }
    }
  };
  for (var k in api) api[k] = safe(api[k]);
  window.SGStats = api;

  /* --------------------------------------------------------- listeners */
  // Launch source of a tile click. Capture phase, so play-page tiles count too.
  // Home tiles and the hot list of a not-found page are featured (🔥) or catalog.
  doc.addEventListener('click', safe(function (e) {
    var a = e.target.closest('.tile[data-slug]'), m;
    if (!a || e.button || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    m = /(recent|favorites)-grid|(recommendations)|#\/(quick|search)\/|(#\/c\/)/.exec(a.parentNode.className + location.hash) || [];
    tag = { g: a.getAttribute('data-slug'), t: now(),
      s: m[1] || m[3] || (m[2] ? 'related' : m[4] ? 'category' : a.querySelector('.hot') ? 'featured' : 'catalog') };
  }), true);
  // Hiding the page (another tab, a locked screen) only writes; a hidden load is not timed.
  doc.addEventListener('visibilitychange', safe(function () {
    if (!doc.hidden) return;
    if (cur && !cur.r) cur.v = 0;
    flush();
  }));
  // Unloading closes the session at once: the game's own last message cannot arrive in time.
  addEventListener('pagehide', safe(function (e) {
    if (!e.persisted) { close(); gone.forEach(settle); }
    flush();
  }));
  // Stop and clear from the teacher page take effect at once. A portal page that
  // has just loaded pings the live key, and a page that is still playing answers
  // by writing its entry again, so its session is not closed as a leftover.
  addEventListener('storage', safe(function (e) {
    meta();
    if (e.key == LIVE && sess && sess.w && (JSON.parse(e.newValue) || 0).ping > sess.n) mirror();
  }));

  // Close sessions left open by a crash, a killed tab or a power cut: the entries
  // that did not answer the ping within 1.5 s. Pages that are frozen or in the
  // back-forward cache cannot answer either; their next write finds the entry gone.
  function sweep(t) {
    var live = getObj(LIVE), old = [], k, x;
    // A newer ping belongs to a page that loaded later.
    for (k in live) if (k != tab && !((x = live[k]) && x.n >= t) && (k != 'ping' || x == t)) { old.push(x); delete live[k]; }
    putLive(live);
    // Damaged or foreign entries are dropped one by one.
    old.forEach(safe(function (x) {
      if (key(x.g, /^[a-z][\w-]*$/) && (x.t = num(x.t, 8e15))) {
        x.e = num(x.e, 9e15);
        x.o = ok(x.p) && x.p;
        x.q = ok(x.i) && x.q;
        finish(x);
      }
    }));
  }
  safe(function () {
    var live = getObj(LIVE), t = now(), k;
    meta();
    for (k in live) {
      if (isObj(live[k])) {
        live.ping = t;
        putLive(live);
        return setTimeout(safe(sweep), 1500, t);
      }
    }
  })();
})();

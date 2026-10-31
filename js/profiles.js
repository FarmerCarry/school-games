/*
 * Picture profiles without names, age bands and XP (docs/ARCHITECTURE.md "Profiles and
 * age bands"). Plain script, loaded after shared/juice.js and before js/site.js,
 * which draws everything; this file only keeps the numbers.
 *
 * A profile is an animal (12) and a ring colour (8): no names, no typed text. A PC
 * keeps up to 24 profiles (about 20 children share a lab PC).
 *   localStorage 'sg:site:profiles': the first 12 profiles,
 *     { v: 1, seq, list: [{ k: 'p1', a: animal 0..11, c: colour 0..7, b: band,
 *       xp: total XP, lv: level, d0: day created, dl: last day played, g: { <slug>: visits } }] }
 *   localStorage 'sg:site:profiles:more': profiles 13 to 24, { v: 1, list: [...] } (missing
 *     while there are 12 or fewer). The first key keeps exactly the format of portals made
 *     before 24, which keep 12 records and save them back: an old tab still open on the
 *     PC then drops nothing, and can only add a profile while the first key has room.
 *   Days are local calendar day numbers (days since 1970-01-01 on this PC's calendar).
 *   sessionStorage 'sg:site:player': the current player's key (missing: a guest), so a
 *   closed tab or the classroom "hand over the device" returns to guest.
 *   sessionStorage 'sg:site:xploss': XP already given per player and game in this tab.
 *     Loss totals are the record's own keys; endless-run totals are its `e` object.
 *     Each stops at 40, and a closed tab forgets both.
 *   localStorage 'sg:site:classband': the class default band, used for guests.
 * Everything read from storage is checked and repaired. When storage is blocked or
 * full the same state lives in memory for this page. Every storage call is guarded,
 * nothing is logged, and no call into this file throws.
 *
 * XP comes from the v1 sg:stats round events of the current game frame (or one removed
 * under 2 s ago, as in js/stats.js), so it works with telemetry off: win +10, draw +6,
 * loss +4 (at most 40 XP of losses per game per tab session), neutral end +5 (+1 per
 * 30 s of round time, at most +5 more). An endless run (round id endless, run, classic
 * or arenaN) shorter than 20 s pays nothing, and those runs stop at 40 XP per game in
 * this tab, the same window as the loss cap. Quit 0, plus +1 per full 60 s of engaged
 * time in a visit. Level L to L+1 needs 30 + 15(L-1) XP; the top level is 99. Guests
 * earn nothing.
 * XP goes to the player who was playing when the frame was mounted, so a game's last
 * message after "hand over the device" still reaches the child who played.
 */
(function () {
  'use strict';

  var KEY = 'sg:site:profiles', MORE = KEY + ':more', PLAYER = 'sg:site:player', LOSS = 'sg:site:xploss', CLASS = 'sg:site:classband';
  // Emoji drawn by Windows 10's Segoe UI Emoji; ring colours stay apart for every eye.
  var ANIMALS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🐧', '🦁', '🐰', '🐨', '🐙', '🦄', '🐢'];
  var COLORS = ['#e53935', '#f57c00', '#fdd835', '#43a047', '#00acc1', '#1e5bd6', '#8e24aa', '#ec407a'];
  var BANDS = ['6-7', '8-9', '10-11'];
  var MAX = 24, MAIN = 12, TOP = 99, SEQ = 2821109907455; // 36^8 - 1: the longest key is p + 8 characters
  var KEY_RE = /^p[0-9a-z]{1,8}$/, SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  var isArr = Array.isArray, min = Math.min, floor = Math.floor;

  var mem = fresh(), temp = false;     // the last good data; temp: a write failed, memory holds the truth
  var who = '', classBand = '';        // current player ('' = guest), class default band
  var visit = null, cur = null, gone = [];   // open visit {g, p, e}, its frame {w, g, p, v}, frames removed < 2 s ago
  var lost = Object.create(null);      // 'p1 slug' -> loss XP given in this tab
  var runs = Object.create(null);      // 'p1 slug' -> endless-run XP given in this tab
  var changes = [], levels = [], gains = [];

  function fresh() { return { v: 1, seq: 0, list: [] }; }
  function isObj(o) { return !!o && typeof o == 'object' && !isArr(o); }
  // A whole number lo..hi, or lo for anything else.
  function int(v, lo, hi) { return typeof v == 'number' && v >= lo ? min(floor(v), hi) : lo; }
  function band(b) { return BANDS.indexOf(b) >= 0 ? b : ''; }
  function index(v, n) { return typeof v == 'number' && v >= 0 && v < n && v % 1 === 0; }
  // A name that is safe as a key: it matches `re` and no plain lookup reaches Object.prototype.
  function safeKey(v, re) { return typeof v == 'string' && re.test(v) && !(v in Object.prototype); }
  // Round ids follow the v1 rule (docs/PLAY_STATS.md); anything else could be typed text.
  function okId(id) { return safeKey(id, /^(?!.*\d{3})[A-Za-z][\w:.-]{0,23}$/); }
  function today() { var t = new Date(); return Math.round(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 864e5); }

  /* ------------------------------------------------------------ levels */
  // XP needed to go from level lv to lv + 1, and the total XP at which level lv starts.
  function need(lv) { return lv < TOP ? 30 + 15 * (lv - 1) : 0; }
  function start(lv) { return 30 * (lv - 1) + 7.5 * (lv - 1) * (lv - 2); }
  var XPMAX = start(TOP);
  function levelFor(xp) { for (var lv = 1; lv < TOP && xp >= start(lv + 1);) lv++; return lv; }

  /* ----------------------------------------------------------- storage */
  // Damaged JSON, wrong types, extra or duplicate profiles and prototype names are
  // dropped or repaired; a level always follows from the XP.
  function clean(d) {
    var out = fresh(), seen = Object.create(null), top = 0;
    if (!isObj(d)) return out;
    (isArr(d.list) ? d.list : []).forEach(function (p) {
      if (!isObj(p) || !safeKey(p.k, KEY_RE)) return;
      top = Math.max(top, parseInt(p.k.slice(1), 36));
      if (out.list.length >= MAX || seen[p.k]) return;
      seen[p.k] = 1;
      var xp = int(p.xp, 0, XPMAX), d0 = p.d0 >= 1 && p.d0 <= 9e5 ? floor(p.d0) : today(), g = {}, n = 0, s;
      if (isObj(p.g)) for (s in p.g) if (n < 64 && safeKey(s, SLUG_RE) && int(p.g[s], 0, 1e6)) { g[s] = int(p.g[s], 0, 1e6); n++; }
      out.list.push({ k: p.k, a: index(p.a, ANIMALS.length) ? p.a : 0, c: index(p.c, COLORS.length) ? p.c : 0, b: band(p.b), xp: xp, lv: levelFor(xp), d0: d0, dl: Math.max(d0, int(p.dl, 0, 9e5)), g: g });
    });
    // Keys are never reused: a new child must not inherit a removed one's difficulty in a game.
    out.seq = Math.max(int(d.seq, 0, SEQ), top);
    return out;
  }
  // The two stored texts: the first 12 profiles with seq, and the rest (null: none).
  function split(d) {
    return [JSON.stringify({ v: 1, seq: d.seq, list: d.list.slice(0, MAIN) }),
      d.list.length > MAIN ? JSON.stringify({ v: 1, list: d.list.slice(MAIN) }) : null];
  }
  // The first key goes first: a profile that moves up to it after a removal is then never
  // missing from both keys, even for a tab that reads between the two writes.
  function save(d) {
    var s = split(d);
    mem = d;
    try {
      localStorage.setItem(KEY, s[0]);
      if (s[1]) localStorage.setItem(MORE, s[1]); else localStorage.removeItem(MORE);
      temp = false; return true;
    } catch (e) { temp = true; return false; }
  }
  function parse(raw) { try { raw = JSON.parse(raw); } catch (e) { raw = 0; } return isObj(raw) ? raw : {}; }
  function records(d) { return isArr(d.list) ? d.list : []; }
  // The stored profiles (repaired in place when damaged), or memory when storage fails.
  // The first key comes first and its seq is the one kept; a key in both counts once.
  function load() {
    var raw, more, d, s;
    if (temp) return mem;
    try { raw = localStorage.getItem(KEY); more = localStorage.getItem(MORE); } catch (e) { return mem; }
    if (raw === null && more === null) return mem = fresh();
    d = parse(raw);
    d = clean({ seq: d.seq, list: records(d).concat(records(parse(more))) });
    s = split(d);
    if (s[0] !== raw || s[1] !== more) save(d); else mem = d;
    return mem;
  }
  // Read, change, write: two portal tabs add up instead of overwriting each other.
  function mutate(fn) { var d = load(); fn(d); return save(d); }
  function find(d, k) { for (var i = 0; i < d.list.length; i++) if (d.list[i].k === k) return d.list[i]; return null; }

  function session(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      if (v === '') sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
    } catch (e) { /* this page keeps the value in memory */ }
    return null;
  }
  function readClass() {
    var raw = null, b;
    try { raw = localStorage.getItem(CLASS); } catch (e) { return classBand; }
    try { b = band(JSON.parse(raw)); } catch (e) { b = ''; }
    if (raw !== null && JSON.stringify(b) !== raw) try { localStorage.removeItem(CLASS); } catch (e) { /* ignore */ }
    return b;
  }
  var BAG_RE = /^p[0-9a-z]{1,8} [a-z0-9][a-z0-9-]{0,39}$/;
  // One bag of totals (0..40) from a stored object. Anything else is dropped.
  function readBag(v) {
    var o = Object.create(null), k, n = 0;
    if (isObj(v)) for (k in v) if (n < 512 && BAG_RE.test(k) && int(v[k], 0, 40)) { o[k] = int(v[k], 0, 40); n++; }
    return o;
  }
  function readCaps() {
    var v;
    try { v = JSON.parse(session(LOSS)); } catch (e) { v = null; }
    if (!isObj(v)) v = {};
    lost = readBag(v);
    runs = readBag(v.e);
  }
  function saveCaps() {
    var o = {}, k, any = false;
    for (k in lost) o[k] = lost[k];
    for (k in runs) any = true;
    if (any) o.e = runs;
    session(LOSS, JSON.stringify(o));
  }
  // At most 40 XP of this kind for one player and game in this tab. A guest is not counted.
  function grantCapped(bag, f, raw) {
    var i, n;
    if (!f.p) return raw;
    i = f.p + ' ' + f.g;
    n = min(raw, 40 - (bag[i] || 0));
    if (n <= 0) return 0;
    bag[i] = (bag[i] || 0) + n;
    saveCaps();
    return n;
  }

  /* ----------------------------------------------------------- changes */
  function on(list) {
    return function (fn) {
      if (typeof fn != 'function') return function () {};
      list.push(fn);
      return function () { var i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
    };
  }
  function emit(list, a, b) {
    list.slice().forEach(function (fn) { try { fn(a, b); } catch (e) { /* one listener never breaks another */ } });
  }
  function bandNow() { var p = find(mem, who); return (p && p.b) || classBand; }
  function sig() { return [who, bandNow(), classBand].concat(mem.list.map(function (p) { return p.k + p.b; })).join(' '); }
  // Runs fn, then fires onChange once if the player, a band or the profile list changed.
  // A current player that no longer exists becomes a guest.
  function sync(fn) {
    var was = sig();
    fn();
    if (who && !find(mem, who)) { who = ''; session(PLAYER, ''); }
    if (sig() !== was) emit(changes, { player: who, band: bandNow() });
  }

  /* ---------------------------------------------------------------- XP */
  function award(k, gain) {
    var before = 0, after = 0;
    if (!gain) return;
    if (k) mutate(function (d) {
      var p = find(d, k);
      if (!p) return;
      before = p.lv;
      p.xp = min(XPMAX, p.xp + gain);
      p.lv = after = levelFor(p.xp);
      p.dl = Math.max(p.dl, today());
    });
    if (k && !after) return;   // that profile was removed meanwhile
    emit(gains, gain, k);
    if (after > before && k === who) emit(levels, after);
  }
  // Endless runs report a neutral end, and so do two-player matches and free play.
  // Only the runs can be finished in a second and started again. Their ids are the ones
  // those games use: endless, run (Rail Rush, Drift King), classic (Block Burst), arenaN
  // (Blob Battle). A run shorter than 20 s pays nothing. The rest share the loss cap's
  // window: 40 XP per player and game in this tab.
  function endlessRun(id) {
    return id === 'endless' || id === 'run' || id === 'classic' || /^arena[0-9]+$/.test(id);
  }
  // The XP of one round event. Losses, and endless runs, each stop at 40 XP per player
  // and game in this tab.
  function roundXP(f, x) {
    var c = x[0], ms, pay;
    if (!okId(x[1])) return 0;
    if (c == 'w') return 10;
    if (c == 'd') return 6;
    if (c == 'e') {
      ms = int(x[2], 0, 108e5);
      pay = 5 + min(5, floor(ms / 3e4));
      if (!endlessRun(x[1])) return pay;
      if (ms < 2e4) return 0;
      return grantCapped(runs, f, pay);
    }
    if (c != 'l') return 0;
    return grantCapped(lost, f, 4);
  }

  /* --------------------------------------------------------------- API */
  function view(p) {
    var g = p.g;
    return { k: p.k, a: p.a, c: p.c, b: p.b, xp: p.xp, lv: p.lv, d0: p.d0, dl: p.dl,
      animal: ANIMALS[p.a], color: COLORS[p.c], have: p.xp - start(p.lv), need: need(p.lv),
      // played: a game was opened for this player (dl is the day made until then).
      played: Object.keys(g).length > 0,
      visits: function (slug) { return typeof slug == 'string' && Object.prototype.hasOwnProperty.call(g, slug) ? g[slug] : 0; } };
  }
  var api = {
    ANIMALS: ANIMALS, COLORS: COLORS, BANDS: BANDS, MAX: MAX,
    need: need,
    list: function () { return mem.list.map(view); },
    current: function () { var p = find(mem, who); return p ? view(p) : null; },
    player: function () { return find(mem, who) ? who : ''; },
    // The current player's band, else the class default band, else ''.
    band: bandNow,
    classBand: function () { return classBand; },
    // false while profiles live only in this page's memory (blocked or full storage).
    stored: function () { return !temp; },
    setClassBand: function (b) {
      var ok = true;
      b = band(b);
      sync(function () {
        classBand = b;
        try { if (b) localStorage.setItem(CLASS, JSON.stringify(b)); else localStorage.removeItem(CLASS); } catch (e) { ok = false; }
      });
      return ok;
    },
    // '' picks the guest. A key that is not a profile changes nothing.
    select: function (k) {
      k = typeof k == 'string' ? k : '';
      if (k && !find(load(), k)) return false;
      sync(function () {
        if (k !== who) visit = null;
        who = k;
        session(PLAYER, k);
      });
      return true;
    },
    // A new profile becomes the current player. Its view has `saved: false` when it
    // lives only in memory; null when the list is full or the choice is invalid.
    create: function (a, c, b) {
      var p = null, saved;
      if (!index(a, ANIMALS.length) || !index(c, COLORS.length) || !band(b)) return null;
      sync(function () {
        saved = mutate(function (d) {
          if (d.list.length >= MAX || d.seq >= SEQ) return;
          d.seq++;
          p = { k: 'p' + d.seq.toString(36), a: a, c: c, b: b, xp: 0, lv: 1, d0: today(), dl: today(), g: {} };
          d.list.push(p);
        });
        if (p) { who = p.k; visit = null; session(PLAYER, p.k); }
      });
      if (!p) return null;
      p = view(p);
      p.saved = saved;
      return p;
    },
    remove: function (k) {
      var found = false;
      sync(function () {
        mutate(function (d) { d.list = d.list.filter(function (p) { if (p.k !== k) return true; found = true; return false; }); });
      });
      return found;
    },
    // A game was opened for the current player (a re-render of the same game is not
    // a new visit). Counts the visit and sets the last day played.
    visit: function (slug) {
      if (!safeKey(slug, SLUG_RE) || (visit && visit.g === slug && visit.p === who)) return;
      visit = { g: slug, p: who, e: 0 };
      if (who) mutate(function (d) {
        var p = find(d, who);
        if (!p) return;
        if (p.g[slug] || Object.keys(p.g).length < 64) p.g[slug] = min((p.g[slug] || 0) + 1, 1e6);
        p.dl = Math.max(p.dl, today());
      });
    },
    // The game frame of the open visit was created, replaced or removed, or the child
    // left the game (close). A removed frame may still send sg:stats for 2 s.
    mount: function (win) {
      api.gone();
      if (visit) cur = { w: win, g: visit.g, p: visit.p, v: visit };
    },
    gone: function () {
      var f = cur;
      if (!f) return;
      cur = null;
      gone.push(f);
      setTimeout(function () { gone = gone.filter(function (x) { return x !== f; }); }, 2000);
    },
    close: function () { api.gone(); visit = null; },
    // A message that passed site.js's origin check: sg:stats v1 from the current frame
    // or one removed under 2 s ago.
    msg: function (win, d) {
      var f = cur && cur.w === win ? cur : null, gain = 0, v;
      if (!f) gone.forEach(function (x) { if (x.w === win) f = x; });
      if (!f || !d || d.type !== 'sg:stats' || d.version !== 1) return;
      v = f.v;
      v.e += int(d.e, 0, 12e4);
      gain = floor(v.e / 6e4);
      v.e -= gain * 6e4;
      if (isArr(d.r)) d.r.slice(0, 100).forEach(function (x) { if (isArr(x)) gain += roundXP(f, x); });
      award(f.p, gain);
    },
    onChange: on(changes),   // fn({ player, band })
    onLevel: on(levels),     // fn(newLevel), for the current player
    onXP: on(gains)          // fn(gain, key); key '' is a guest, who keeps nothing
  };
  // Calls from site.js and other scripts never throw.
  Object.keys(api).forEach(function (k) {
    var fn = api[k];
    if (typeof fn == 'function') api[k] = function (a, b, c) { try { return fn(a, b, c); } catch (e) { return undefined; } };
  });
  window.SGProfiles = api;

  /* --------------------------------------------------------- start up */
  try {
    load();
    classBand = readClass();
    readCaps();
    var k = session(PLAYER);
    who = safeKey(k, KEY_RE) && find(mem, k) ? k : '';
    if (k && !who) session(PLAYER, '');
  } catch (e) { /* a guest with no profiles */ }
  // Another tab created, removed or played a profile, or changed the class band.
  addEventListener('storage', function (e) {
    if (e.key !== null && e.key !== KEY && e.key !== MORE && e.key !== CLASS) return;
    try {
      var p = find(mem, who), xp = p && p.xp;
      sync(function () { load(); classBand = readClass(); });
      p = find(mem, who);
      if (p && p.xp !== xp) emit(gains, 0, who);
    } catch (err) { /* keep what this page knows */ }
  });
})();

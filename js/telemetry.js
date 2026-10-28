/*
 * Anonymous telemetry sink (docs/ARCHITECTURE.md "Telemetry sink", docs/TELEMETRY.md).
 * The ONLY file of the site that may use the network. Plain script, loaded after
 * js/profiles.js and before js/site.js, which calls the window.SGTelemetry hooks
 * next to its js/stats.js calls: open(slug, firstRender), tag(slug, source),
 * mount(win), ready(slug, loadMs), fail(kind), gone(), close(), msg(win, data),
 * level(lv) and active().
 *
 * Active only when the fast build set window.SG_TELEMETRY.url to an https:// address,
 * the page is neither a downloaded folder (file:) nor served from this computer
 * (localhost, 127.0.0.1, [::1]; tests opt in with allowLocal), the browser sends no
 * Global Privacy Control, and the teacher has neither stopped statistics
 * (sg:site:statsmeta.off) nor turned sharing off (statsmeta.tm === false), read again
 * before every event and every send. Otherwise it does nothing at all: no timers, no
 * requests, nothing written (only a sharing note left by an earlier build is removed),
 * and games are told telemetry: false.
 *
 * Sent: the events of the contract, timed in whole seconds since the session
 * started; a random session id per page load and per player change. Never names,
 * typed or error text, the PC label, a profile key or avatar, the user agent or the
 * clock. Round events come only from sg:telemetry v2 of the current game frame (or
 * one removed under 2 s ago, as in js/stats.js), checked field by field.
 *
 * Delivery: events wait in memory; batches of at most 200 events and 32 KB go when
 * a game closes, 20 s after the first waiting event, and when the page is hidden, each
 * by fetch without cookies, with keepalive while the bodies in flight fit in 60 KB.
 * Unsent batches wait in localStorage sg:site:tm:q:<hash of the address>, so another
 * copy of the site on this origin that sends elsewhere never sends them (oldest first,
 * at most 128 KB and 7 days). A 2xx or a 4xx other than 429 is final; 429, 5xx and
 * network errors back off 20, 40, 80, 160, 300 s; a request with no answer after a
 * minute is sent again. sg:site:tm:on (the server's host) tells the teacher page that
 * this PC shares. Every storage call is guarded, nothing is logged, every promise is
 * caught and no call into this file throws.
 */
(function () {
  'use strict';

  var TM = 'sg:site:tm:', Q = TM + 'q', ON = TM + 'on', META = 'sg:site:statsmeta';
  var cfg = window.SG_TELEMETRY, url = cfg && cfg.url, doc = document, nav = navigator, perf = performance;
  var isArr = Array.isArray, min = Math.min, floor = Math.floor, str = JSON.stringify;
  var ID = /^(?!.*\d{3})[A-Za-z][\w:.-]{0,23}$/, SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, BACK = [20, 40, 80, 160, 300];
  var ready = false, flagged = '';
  try {
    ready = typeof url == 'string' && url.length <= 200 && /^https:\/\/[\w\-.~:/?#[\]@!$&()*+,;=%]+$/.test(url) &&
      location.protocol != 'file:' && nav.globalPrivacyControl !== true &&
      (cfg.allowLocal === true || !/^(?:(?:.+\.)?localhost|127(?:\.\d+){3}|\[::1\])$/i.test(location.hostname));
    if (ready) {
      flagged = str(new URL(url).host);
      // The queue belongs to this address: a copy of the site elsewhere on this origin,
      // built with another address, never sends (or drops) these batches.
      for (var h = 0, i = 0; i < url.length; i++) h = h * 31 + url.charCodeAt(i) | 0;
      Q += ':' + (h >>> 0).toString(36);
    }
  } catch (e) { ready = false; }

  var on, cleared = 0, sess, game = 0, cur = 0, gone = [], closing = [], pend = [], known = [];
  var tag = 0, timer = 0, timerAt = 0, busy = 0, busyAt = 0, fly = 0, fails = 0, retryAt = 0, mq = [], temp = false;

  function now() { return Date.now(); }
  function safe(fn) {
    return function (a, b) { try { return fn(a, b); } catch (e) { /* telemetry never breaks the portal */ } };
  }
  // A whole number 0..top, or undefined for anything that is not a finite number >= 0.
  function count(v, top) { return typeof v == 'number' && v >= 0 && v < 1 / 0 ? min(Math.round(v), top) : undefined; }
  // Exactly n counts, or undefined.
  function hist(a, n, top) {
    if (!isArr(a) || a.length !== n) return;
    for (var out = [], i = 0, v; i < n; i++) { if ((v = count(a[i], top)) === undefined) return; out.push(v); }
    return out;
  }
  function add(t, a) { if (a) for (var i = 0; i < t.length; i++) t[i] += a[i]; }
  function capped(a, top) { return a.map(function (v) { return min(v, top); }); }
  function zeros(n) { for (var a = []; n--;) a.push(0); return a; }
  function okId(v) { return typeof v == 'string' && ID.test(v) && !(v in Object.prototype); }
  function tier(v) { return typeof v == 'number' && v >= 0 && v <= 9 && v % 1 === 0; }
  // The largest bucket at or below v (the smallest one when v is unknown).
  function bucket(v, list) { for (var i = list.length - 1; i > 0 && !(v >= list[i]); i--); return list[i]; }
  function hex(n) {
    var a = new Uint8Array(n / 2), s = '', i;
    try { crypto.getRandomValues(a); } catch (e) { for (i = 0; i < a.length; i++) a[i] = Math.random() * 256; }
    for (i = 0; i < a.length; i++) s += (a[i] + 256).toString(16).slice(1);
    return s;
  }
  function prof(name, a) {
    try { var p = window.SGProfiles; return p && typeof p[name] == 'function' ? p[name](a) : undefined; } catch (e) { /* a guest */ }
  }
  function band() { var b = prof('band'); return /^(?:6-7|8-9|10-11)$/.test(b) ? b : ''; }
  function keys() { return (prof('list') || []).map(function (p) { return p.k; }); }
  function today() { var t = new Date(); return Math.round(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 864e5); }
  function sec(s) { return min(floor((perf.now() - s.t0) / 1000), 604800); }

  /* ------------------------------------------------------------ events */
  // An event timed from its session's start. The first waiting one sets the 20 s send.
  function rec(s, ev) {
    if (!on) return;
    ev.splice(1, 0, sec(s));
    s.ev.push(ev);
    if (!s.at) { s.at = now(); pend.push(s); }
    arm(20000);
  }
  // A session starts at page load and whenever the player changes. isNew: the player
  // was just made on this page. Profile age 0 new, 1 1-6 days, 2 7-29, 3 30+; days
  // since the last play 0 same day, 1 one, 2 2-6, 3 7+, 4 first time (no game played
  // yet, whenever the profile was made); level 0 a guest.
  function begin(isNew) {
    var p = prof('current'), d = today(), a = p ? d - p.d0 : 0, l = p ? d - p.dl : 0;
    sess = { s: hex(12), t0: perf.now(), a: band(), k: p ? p.k : '', e: 0, o: 0, x: 0, n: {}, ev: [], at: 0 };
    known = keys();
    flag();
    rec(sess, ['ss', isNew ? 1 : 0, a < 1 ? 0 : a < 7 ? 1 : a < 30 ? 2 : 3,
      !p || isNew || !p.played ? 4 : l < 1 ? 0 : l < 2 ? 1 : l < 7 ? 2 : 3, p ? min(p.lv, 999) : 0]);
  }
  // A session ends once its games have closed: 'se' is always its last event.
  function end(s) { s.x = 1; if (!s.o) finish(s); }
  function finish(s) { s.x = 2; rec(s, ['se', min(s.e, 864e5)]); }
  // The player changed (or a profile was made, removed, or a band changed).
  function changed(c) {
    var k = (c && c.player) || '';
    if (k !== sess.k) {
      var isNew = !!k && known.indexOf(k) < 0;
      end(sess);
      begin(isNew);
    } else {
      known = keys();
      // Events so far keep the band they were recorded with.
      if (band() !== sess.a) { seal(); sess.a = band(); }
    }
  }

  /* ------------------------------------------------------------- games */
  // The frame of the open game was removed: its window may still send for 2 s.
  function remove() {
    var f = cur;
    if (!f) return;
    cur = 0;
    gone.push(f);
    setTimeout(function () { gone = gone.filter(function (x) { return x !== f; }); }, 2000);
  }
  // The child left the game: 'gx' waits for the last frame's own last message, 1 s at most.
  function close() {
    var v = game;
    remove();
    if (!v) return;
    game = 0;
    closing.push(v);
    setTimeout(safe(function () { if (live()) settle(v); }), 1000);
  }
  function settle(v, leaving) {
    var s = v.s, i = closing.indexOf(v);
    if (i < 0) return;
    closing.splice(i, 1);
    rec(s, ['gx', v.g, min(v.e, 216e5), capped(v.il, 1e5), capped(v.f, 1e7)]);
    if (!--s.o && s.x == 1) finish(s);
    if (!leaving) send();
  }
  // sg:telemetry v2 round events, checked field by field; anything else is dropped.
  function round(v, x) {
    var s = v.s, k = isArr(x) && x[0], key, n, ms, score, hits, misses, rt;
    if (k === 'rs' && x.length === 3 && okId(x[1]) && tier(x[2])) {
      key = v.g + ' ' + x[1];
      n = s.n[key] || 0;
      s.n[key] = n + 1;
      rec(s, ['rs', v.g, x[1], x[2], min(n, 9999)]);
    } else if (k === 're' && x.length === 9 && typeof x[1] == 'string' && /^[wldeq]$/.test(x[1]) && okId(x[2]) && tier(x[5]) &&
      (ms = count(x[3], 108e5)) !== undefined && (score = x[4] === -1 ? -1 : count(x[4], 1e9)) !== undefined &&
      (hits = count(x[6], 1e5)) !== undefined && (misses = count(x[7], 1e5)) !== undefined && (rt = hist(x[8], 6, 1e5))) {
      rec(s, ['re', v.g, x[1], x[2], ms, score, x[5], hits, misses, rt]);
    }
  }

  /* ---------------------------------------------------------- delivery */
  // statsmeta, read again before every event and send. Stopped statistics or sharing
  // turned off drop everything waiting; a teacher's clear drops what came before it.
  function live() {
    var m = null, c;
    try { m = JSON.parse(localStorage.getItem(META)); } catch (e) { /* no settings */ }
    m = m || {};
    if (m.off || m.tm === false) {
      if (on !== false) {
        // Games open now are forgotten too: the next one opened after a resume counts.
        on = false;
        pend.forEach(function (s) { s.ev = []; s.at = 0; });
        pend = [];
        game = cur = 0;
        gone = [];
        closing = [];
        save([]);
        // The note and every queue on this origin go, also those of another copy of the site.
        try {
          Object.keys(localStorage).forEach(function (k) { if (k.indexOf(TM) === 0) localStorage.removeItem(k); });
        } catch (e) { /* nothing to drop */ }
        clearTimeout(timer);
        timer = 0;
      }
      return false;
    }
    c = +new Date(m.clearedAt) || 0;
    if (c > cleared) {
      cleared = c;
      pend = pend.filter(function (s) { if (s.at < c) { s.ev = []; s.at = 0; } return s.at; });
    }
    if (!on) { on = true; begin(0); }
    return true;
  }
  function flag() { try { if (localStorage.getItem(ON) !== flagged) localStorage.setItem(ON, flagged); } catch (e) { /* no note */ } }
  // The unsent batches, oldest first: whole entries only, at most 7 days old, none from
  // before a teacher's clear, at most 128 KB together. Memory holds them when storage fails.
  function load() {
    var q = mq, t = now();
    if (!temp) try { q = JSON.parse(localStorage.getItem(Q)); } catch (e) { q = mq; }
    q = (isArr(q) ? q : []).filter(function (x) {
      var e = x && x.e;
      return !!e && x.t > t - 6048e5 && x.t >= cleared && e.v === 2 && typeof e.b == 'string' && /^[0-9a-f]{16}$/.test(e.b) && isArr(e.ev);
    });
    return fit(q);
  }
  // The oldest batches go first when the queue passes 128 KB.
  function fit(q) {
    var sizes = q.map(function (x) { return str(x).length + 1; }), total = 1;
    sizes.forEach(function (n) { total += n; });
    while (total > 131072) { total -= sizes.shift(); q.shift(); }
    return q;
  }
  function save(q) {
    mq = q = fit(q);
    try {
      if (q.length) localStorage.setItem(Q, str(q)); else localStorage.removeItem(Q);
      temp = false;
    } catch (e) { temp = true; }
  }
  function without(b) { save(load().filter(function (x) { return x.e.b !== b; })); }
  function envelope(s) {
    var k = window.SG_OFFLINE_VERSION, m = 'web';
    try { if (matchMedia('(display-mode: standalone)').matches) m = 'app'; } catch (e) { /* web */ }
    return { v: 2, b: hex(16), s: s.s, k: typeof k == 'string' && /^[0-9a-f]{16}$/.test(k) ? k : 'src', m: m, a: s.a,
      d: [bucket(nav.hardwareConcurrency, [1, 2, 4, 8, 16]), bucket(nav.deviceMemory, [0, 1, 2, 4, 8]), bucket(screen.width, [1366, 1600, 1920, 2560])],
      ev: [] };
  }
  // Waiting events become batches of at most 200 events and 32 KB, queued until sent.
  function seal() {
    var out = [];
    pend.forEach(function (s) {
      var b, size = 0;
      s.ev.forEach(function (x) {
        var n = str(x).length + 1;
        if (!b || b.ev.length >= 200 || size + n > 32768) { b = envelope(s); out.push({ t: s.at, e: b }); size = str(b).length; }
        b.ev.push(x);
        size += n;
      });
      s.ev = [];
      s.at = 0;
    });
    pend = [];
    if (out.length) { flag(); save(load().concat(out)); }
  }
  // One timer, only while something waits; an earlier deadline wins.
  function arm(ms) {
    var at = now() + ms;
    if (timer && timerAt <= at) return;
    clearTimeout(timer);
    timerAt = at;
    timer = setTimeout(safe(send), ms);
  }
  // One POST, never with cookies. keepalive lets it outlive the page, but the browser
  // refuses keepalive bodies beyond 64 KB in flight together: ours stay within 60 KB.
  function room(json) { return fly + json.length <= 6e4; }
  function post(json) {
    var n = room(json) ? json.length : 0, p = fetch(url, { method: 'POST', body: json, headers: { 'Content-Type': 'text/plain' },
      credentials: 'omit', mode: 'cors', keepalive: n > 0 });
    fly += n;
    p.then(free, free);
    function free() { fly -= n; }
    return p;
  }
  // Sends the oldest batch; the next one follows its answer.
  function send() {
    clearTimeout(timer);
    timer = 0;
    if (!live()) return;
    seal();
    var x = load()[0], b;
    if (!x) return;
    // A request with no answer after a minute no longer holds the queue back: its batch
    // goes again (the server keeps it once), with no new event needed to wake the sink.
    if (busy && now() - busyAt < 6e4) return arm(busyAt + 6e4 - now());
    if (retryAt > now()) return arm(retryAt - now());
    b = x.e.b;
    post(str(x.e)).then(safe(function (r) { done(b, r.status); }), safe(function () { done(b, 0); }));
    busy = b;
    busyAt = now();
    arm(6e4);
  }
  // A 2xx is delivered and a 4xx other than 429 is malformed: both are final.
  // 429, 5xx and network errors keep the batch and back off.
  function done(b, status) {
    if (busy === b) busy = 0;
    // Stopped meanwhile: the queue is gone and no retry is set.
    if (!live()) return;
    if (status > 199 && status < 300 || status > 399 && status < 500 && status !== 429) {
      if (status < 300) fails = 0;
      without(b);
      send();
    } else {
      retryAt = now() + 1e3 * BACK[min(fails++, 4)];
      arm(retryAt - now());
    }
  }
  // The page is hidden or going away: what waits goes at once with keepalive, unless the
  // server has been failing or the PC is offline (the queue keeps it for later). Oldest
  // first while the bodies fit in 60 KB; the batch already on its way stays where it is,
  // and the queue keeps every batch not handed to fetch.
  function beacon() {
    if (!live()) return;
    seal();
    if (fails || nav.onLine === false) return;
    var sent = {};
    load().every(function (x) {
      var json = str(x.e);
      if (x.e.b === busy) return true;
      if (!room(json)) return false;
      post(json);
      return sent[x.e.b] = true;
    });
    save(load().filter(function (x) { return !sent[x.e.b]; }));
    if (!mq.length) { clearTimeout(timer); timer = 0; }
  }

  /* --------------------------------------------------------------- API */
  function hook(fn) { return safe(function (a, b) { if (ready && live()) fn(a, b); }); }
  window.SGTelemetry = {
    active: safe(function () { return ready && live(); }),
    // A launch source site.js knows (surprise, search, starter), as in js/stats.js.
    tag: hook(function (slug, src) { tag = { g: slug, t: now(), s: src }; }),
    // The portal opened a game's play page; a re-render keeps the visit. The launch
    // source and the plays before follow js/stats.js and js/profiles.js.
    open: hook(function (slug, firstRender) {
      if (game || typeof slug != 'string' || slug.length > 40 || !SLUG.test(slug) || slug in Object.prototype) return;
      var t = now(), src = 'history', p = prof('current'), n = p && count(p.visits(slug), 1e6) || 0;
      if (tag && tag.g == slug && t - tag.t < 1000) src = tag.s;
      else if (firstRender) {
        src = 'direct';
        try { if (perf.getEntriesByType('navigation')[0].type == 'reload') src = 'reload'; } catch (e) { /* direct */ }
      }
      tag = 0;
      // A game still waiting for its last message closes first: 'gx' never follows the next 'go'.
      closing.slice().forEach(function (v) { settle(v); });
      game = { g: slug, s: sess, e: 0, il: zeros(6), f: zeros(4) };
      sess.o++;
      rec(sess, ['go', slug, src, n < 2 ? n : n < 5 ? 2 : n < 10 ? 3 : 4]);
    }),
    mount: hook(function (win) {
      if (!game) return;
      remove();
      cur = game.last = { w: win, v: game, l: !game.m, vis: !doc.hidden };
      game.m = 1;
    }),
    // The current frame's first sg:ready. Like js/stats.js, only a visit's first frame
    // is timed, and only if the page stayed visible while it loaded.
    ready: hook(function (slug, ms) {
      var f = cur;
      if (!f || f.r || f.v.g !== slug) return;
      f.r = 1;
      if (f.l && f.vis && (ms = count(ms, 12e4)) !== undefined) rec(f.v.s, ['ld', slug, ms]);
    }),
    // t: load timeout, x: script error, anything else: the page failed to load.
    fail: hook(function (kind) { if (cur) rec(cur.v.s, ['er', cur.v.g, kind === 't' || kind === 'x' ? kind : 'l']); }),
    gone: hook(remove),
    close: hook(close),
    // A message that passed site.js's origin check.
    msg: safe(function (win, d) {
      var f = cur && cur.w === win ? cur : 0, v, e;
      if (!ready || !d || d.type !== 'sg:telemetry' || d.version !== 2 || !live()) return;
      if (!f) gone.forEach(function (x) { if (x.w === win) f = x; });
      // Nothing more counts for a game once its 'gx' is written.
      if (!f || (f.v !== game && closing.indexOf(f.v) < 0)) return;
      v = f.v;
      e = count(d.e, 12e4) || 0;
      v.e += e;
      v.s.e += e;
      add(v.il, hist(d.il, 6, 1e5));
      add(v.f, hist(d.f, 4, 2e4));
      if (isArr(d.ev)) d.ev.slice(0, 64).forEach(function (x) { round(v, x); });
      // The last frame of a closed game has said its last word.
      if (f !== cur && v.last === f) settle(v);
    }),
    // The current player reached a new level (SGProfiles.onLevel).
    level: hook(function (lv) { if (typeof lv == 'number' && lv >= 1 && lv <= 999 && lv % 1 === 0) rec(sess, ['lv', lv]); })
  };

  /* --------------------------------------------------------- listeners */
  // Inert: a sharing note left by an earlier build that shared goes, so the teacher page
  // never says that this PC shares.
  if (!ready) {
    try { if (localStorage.getItem(ON) !== null) localStorage.removeItem(ON); } catch (e) { /* nothing to say */ }
    return;
  }
  // Launch source of a tile click, exactly as js/stats.js tells them apart.
  doc.addEventListener('click', safe(function (e) {
    var a = e.target.closest('.tile[data-slug]'), m;
    if (!a || e.button || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    m = /(recent|favorites)-grid|(recommendations)|#\/(quick|search)\/|(#\/c\/)/.exec(a.parentNode.className + location.hash) || [];
    tag = { g: a.getAttribute('data-slug'), t: now(),
      s: m[1] || m[3] || (m[2] ? 'related' : m[4] ? 'category' : a.querySelector('.hot') ? 'featured' : 'catalog') };
  }), true);
  doc.addEventListener('visibilitychange', safe(function () {
    if (!doc.hidden) return;
    if (cur && !cur.r) cur.vis = 0;
    beacon();
  }));
  // Unloading ends the open game and the session at once; a page kept in the
  // back-forward cache only sends what waits, and its session goes on if it returns.
  addEventListener('pagehide', safe(function (e) {
    if (!e.persisted && live()) {
      close();
      closing.slice().forEach(function (v) { settle(v, 1); });
      end(sess);
    }
    beacon();
  }));
  prof('onChange', hook(changed));
  safe(live)();
})();

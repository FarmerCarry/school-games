/*
 * Kit — tiny shared helper library for every game on the site.
 * Plain script (no modules) so games also work when opened from file://.
 *
 *   Load ../../shared/kit.js with a plain script tag before the game's own scripts.
 *   (Keep literal script tags out of inlined files: the build rejects leftover ones.)
 *
 * Everything lives on window.Kit. Nothing here is required, but using it keeps
 * sound, saving, keyboard and screen scaling consistent across games.
 */
(function () {
  'use strict';

  var Kit = {};

  /* ---------------------------------------------------------------- math */
  Kit.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  Kit.lerp = function (a, b, t) { return a + (b - a) * t; };
  Kit.rand = function (a, b) { return a + Math.random() * (b - a); };
  Kit.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  Kit.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  Kit.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  Kit.dist = function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); };

  /* ------------------------------------------------------------- storage */
  // Kit.store('my-game') -> { get(key, fallback), set(key, value), remove(key) }
  // Keys are namespaced as "sg:<slug>:<key>". Values are JSON. Never throws.
  Kit.store = function (slug) {
    var prefix = 'sg:' + slug + ':';
    return {
      get: function (key, fallback) {
        try {
          var raw = window.localStorage.getItem(prefix + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        try { window.localStorage.setItem(prefix + key, JSON.stringify(value)); return true; } catch (e) { return false; }
      },
      remove: function (key) {
        try { window.localStorage.removeItem(prefix + key); } catch (e) { /* ignore */ }
      }
    };
  };
  var siteStore = Kit.store('site');

  /* --------------------------------------------------------- preferences */
  // System default, with an explicit local override shared by every game.
  // Classroom preferences are transient, including when file:// gives each
  // game a separate storage area. Personal settings never inherit the preset.
  var classroomMode = false;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var motionListeners = [];
  function validMotion(value) { return value === 'reduce' || value === 'full' ? value : 'system'; }
  Kit.motion = {
    preference: validMotion(siteStore.get('motion', 'system')),
    reduced: function () { return classroomMode || this.preference === 'reduce' || (this.preference === 'system' && !!(motionQuery && motionQuery.matches)); },
    setPreference: function (value) { this.preference = validMotion(value); siteStore.set('motion', this.preference); paintMotion(); },
    onChange: function (fn) { motionListeners.push(fn); return function () { var i = motionListeners.indexOf(fn); if (i !== -1) motionListeners.splice(i, 1); }; }
  };
  function paintMotion() {
    var reduced = Kit.motion.reduced();
    document.documentElement.setAttribute('data-sg-motion', reduced ? 'reduce' : 'full');
    motionListeners.forEach(function (fn) { fn(reduced); });
  }
  if (motionQuery) {
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', paintMotion);
    else if (motionQuery.addListener) motionQuery.addListener(paintMotion);
  }
  paintMotion();

  /* ----------------------------------------------------------- lifecycle */
  var lifecycleHandlers = [], pointerResets = [], ready = false, failed = false;
  function tellPortal(message) {
    if (window.parent !== window) window.parent.postMessage(message, window.location && window.location.protocol !== 'file:' ? window.location.origin : '*');
  }
  // Window capture listeners run before any game listener can stop the event.
  function listen(type, fn) { window.addEventListener(type, fn, true); }
  function suspend(reason) {
    sendStats(true);
    if (Kit.keys) Kit.keys.reset();
    pointerResets.forEach(function (reset) { reset(); });
    lifecycleHandlers.slice().forEach(function (hooks) {
      if (hooks.reset) hooks.reset();
      hooks.pause(reason);
    });
  }
  // Enter the game's existing pause state. Returning focus NEVER resumes play.
  // Games retain control of which states can pause (idle games may keep accruing).
  Kit.lifecycle = function (hooks) {
    if (!hooks || typeof hooks.pause !== 'function') throw new TypeError('Kit.lifecycle requires pause');
    lifecycleHandlers.push(hooks);
    return function () { var i = lifecycleHandlers.indexOf(hooks); if (i !== -1) lifecycleHandlers.splice(i, 1); };
  };
  Kit.ready = function () {
    if (failed) return;
    // The first call starts the one statistics timer; repeats (sg:request-ready) do not.
    if (!ready) statsTimer();
    ready = true;
    tellPortal({ type: 'sg:ready', version: 1 });
  };
  Kit.fail = function (error) {
    failed = true;
    tellPortal({ type: 'sg:error', version: 1, message: String(error && error.message || error || 'Game failed to initialize').slice(0, 240) });
  };
  listen('error', function (e) {
    // Capture script download failures as well as exceptions. Optional media do
    // not make a successfully initialized game fail its readiness handshake.
    if (e.message || (e.target && e.target.tagName === 'SCRIPT')) Kit.fail(e.error || e.message || 'Game script failed to load');
  });
  window.addEventListener('unhandledrejection', function (e) { Kit.fail(e.reason); });
  window.addEventListener('blur', function () { suspend('blur'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) suspend('hidden'); });
  var wasFullscreen = !!document.fullscreenElement;
  document.addEventListener('fullscreenchange', function () {
    var fullscreen = !!document.fullscreenElement;
    if (wasFullscreen && !fullscreen) suspend('fullscreen-exit');
    wasFullscreen = fullscreen;
  });
  window.addEventListener('message', function (e) {
    if (window.parent === window || e.source !== window.parent) return;
    var message = e.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'sg:pause') suspend(message.reason || 'portal');
    else if (message.type === 'sg:request-ready' && ready && !failed) Kit.ready();
    else if (message.type === 'sg:preferences') {
      if (typeof message.classroom === 'boolean') {
        classroomMode = message.classroom;
        paintMotion(); paintAudio();
      }
      if (typeof message.quiet === 'boolean') audio.setMuted(message.quiet);
      if (typeof message.motionPreference === 'string') Kit.motion.setPreference(message.motionPreference);
      else if (typeof message.reducedMotion === 'boolean') Kit.motion.setPreference(message.reducedMotion ? 'reduce' : 'full');
    }
  });

  /* ---------------------------------------------------------- play stats */
  // Local-only play statistics (docs/PLAY_STATS.md). Kit only counts, and posts
  // small deltas to the portal, which checks and stores them. Kit stores nothing,
  // posts only after Kit.ready() while embedded, and never uses the network.
  // Engaged time: a key press or click arms the game and starts or extends a
  // 20 s window; mouse moves, the wheel and Kit.stats.busy() only extend an open
  // window. Every pause and pagehide cuts the window and disarms the game.
  // Every Kit.stats call is safe before Kit.ready(), standalone and with any argument.
  // No window is open (from/until unset) before the first key press or click.
  var perf = window.performance, from, until, roundMs, engaged = 0, mutes = 0;
  var frames = [0, 0, 0, 0], events = [], roundId = '', tutorials = {};
  // Whole milliseconds (an int32 holds 24 days of performance.now()).
  function clock() { return perf ? perf.now() | 0 : Date.now(); }
  function text(value, length) { try { return String(value).slice(0, length); } catch (e) { return ''; } }
  function tally() {
    var t = clock(), x = t < until ? t : until;
    if (x > from) { engaged += x - from; if (roundId) roundMs += x - from; from = x; }
    return t;
  }
  function engage(extendOnly) {
    var t = tally();
    if (!extendOnly || t < until) { from = t; until = t + 20000; }
  }
  // Paused games and idle menus draw cheap frames: count only engaged play in a round.
  // Buckets: smooth <= 20 ms, ok <= 34 ms, choppy <= 250 ms, stall.
  function countFrame(ms) {
    try { if (ms > 0 && roundId && clock() < until) frames[ms > 20 ? ms > 34 ? ms > 250 ? 3 : 2 : 1 : 0]++; } catch (e) { /* ignore */ }
  }
  function sendStats(cut) {
    tally();
    if (cut) until = 0;
    if (ready && (engaged || mutes || events.length || frames.some(Number))) { // something changed
      tellPortal({ type: 'sg:stats', version: 1, e: engaged, f: frames, m: mutes, r: events, o: roundId });
      engaged = mutes = 0; frames.fill(0); events = [];
    }
  }
  function statsTimer() { setTimeout(function () { if (!failed) { sendStats(); statsTimer(); } }, 10000); }
  // As the argument, the event object means "cut" for pagehide and "extend only" for moves.
  listen('pagehide', sendStats);
  listen('pointermove', engage);
  listen('wheel', engage);
  Kit.stats = {
    round: function (id) {
      id = text(id, 24);
      tally();
      // A new round while one is open records the open one as a quit.
      if (roundId) events.push(['q', roundId, roundMs]);
      events.push(['s', roundId = id]);
      roundMs = 0;
      sendStats();
    },
    end: function (result, score) {
      if (!roundId) return;
      tally();
      events.push([text(result, 1), roundId, roundMs].concat(Number.isFinite(score) ? score : []));
      roundId = '';
      sendStats();
    },
    tutorial: function (step) {
      step = text(step, 24);
      if (!tutorials[step]) { tutorials[step] = 1; if (events.push(['t', step]) >= 32) sendStats(); }
    },
    busy: function () { engage(1); },
    frame: countFrame
  };

  /* --------------------------------------------------------------- audio */
  // Synthesised sound effects (no audio files). The AudioContext is created
  // lazily on the first user gesture, as browsers require.
  var personalMuted = !!siteStore.get('muted', false);
  var audio = { ctx: null, master: null, muted: personalMuted };
  Kit.audio = audio;

  audio.unlock = function () {
    if (!audio.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = audio.muted ? 0 : 0.5;
        audio.master.connect(audio.ctx.destination);
      } catch (e) { audio.ctx = null; return null; }
    }
    if (audio.ctx.state === 'suspended') { try { audio.ctx.resume(); } catch (e) { /* ignore */ } }
    return audio.ctx;
  };

  function paintAudio() {
    audio.muted = classroomMode || personalMuted;
    if (audio.master) audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.5, audio.ctx.currentTime, 0.015);
    muteListeners.forEach(function (fn) { fn(audio.muted); });
  }
  audio.setMuted = function (m) {
    personalMuted = !!m;
    siteStore.set('muted', personalMuted);
    paintAudio();
  };
  // Only the child's own toggles (button or M) count for statistics, not setMuted().
  audio.toggleMute = function () { if (!classroomMode) { audio.setMuted(!personalMuted); mutes++; } return audio.muted; };
  var muteListeners = [];
  audio.onMuteChange = function (fn) { muteListeners.push(fn); };
  window.addEventListener('storage', function (e) {
    if (e.key === 'sg:site:motion' || e.key === null) { Kit.motion.preference = validMotion(siteStore.get('motion', 'system')); paintMotion(); }
    if (e.key === 'sg:site:muted' || e.key === null) {
      personalMuted = !!siteStore.get('muted', false);
      paintAudio();
    }
  });

  // Play one synthesised tone.
  // opts: { freq=440, to (slide target freq), type='square'|'sine'|'triangle'|'sawtooth',
  //         dur=0.12 (s), vol=0.3, delay=0 (s), attack=0.005 }
  audio.tone = function (opts) {
    var ctx = audio.ctx;
    if (!ctx || audio.muted) return;
    opts = opts || {};
    var t0 = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.12;
    var vol = opts.vol == null ? 0.3 : opts.vol;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    g.gain.value = 0; // start silent: avoids a click before the envelope begins
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.freq || 440, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(audio.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  };

  // White-noise burst (explosions, splashes, hits).
  // opts: { dur=0.25, vol=0.3, delay=0, filter=lowpass cutoff Hz (optional), to (cutoff slide target) }
  var noiseBuf = null;
  audio.noise = function (opts) {
    var ctx = audio.ctx;
    if (!ctx || audio.muted) return;
    opts = opts || {};
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t0 = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.25;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(opts.vol == null ? 0.3 : opts.vol, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var node = src;
    if (opts.filter) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opts.filter, t0);
      if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(audio.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  };

  // Ready-made effects. Call e.g. Kit.sfx.coin().
  Kit.sfx = {
    click: function () { audio.tone({ freq: 660, type: 'triangle', dur: 0.05, vol: 0.15 }); },
    coin: function () {
      audio.tone({ freq: 988, type: 'triangle', dur: 0.07, vol: 0.18 });
      audio.tone({ freq: 1319, type: 'triangle', dur: 0.16, vol: 0.18, delay: 0.07 });
    },
    jump: function () { audio.tone({ freq: 300, to: 700, type: 'triangle', dur: 0.14, vol: 0.18 }); },
    land: function () { audio.tone({ freq: 160, to: 80, type: 'triangle', dur: 0.08, vol: 0.25 }); },
    hit: function () { audio.noise({ dur: 0.15, vol: 0.35, filter: 1800, to: 300 }); audio.tone({ freq: 180, to: 60, type: 'sawtooth', dur: 0.15, vol: 0.2 }); },
    pop: function () { audio.tone({ freq: 500, to: 1200, type: 'sine', dur: 0.08, vol: 0.3 }); },
    boom: function () { audio.noise({ dur: 0.6, vol: 0.5, filter: 1200, to: 60 }); },
    power: function () { [523, 659, 784, 1047].forEach(function (f, i) { audio.tone({ freq: f, type: 'triangle', dur: 0.09, vol: 0.15, delay: i * 0.06 }); }); },
    win: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { audio.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.3, delay: i * 0.1 }); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { audio.tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.3, delay: i * 0.15 }); }); },
    whoosh: function () { audio.noise({ dur: 0.25, vol: 0.2, filter: 3000, to: 400 }); }
  };

  /* ------------------------------------------------------------ keyboard */
  // Kit.keys.down('ArrowLeft')     -> true while held (uses KeyboardEvent.code)
  // Kit.keys.pressed('Space')      -> true once per press; call Kit.keys.endFrame()
  //                                   at the end of every update step to clear it.
  // Kit.keys.anyDown(['KeyA','ArrowLeft'])
  var held = {}, hit = {}, tabCapture = null;
  var scrollBlocked = new WeakSet();
  function nativeKeyTarget(target) {
    return !!(target && (target.isContentEditable || (target.closest && target.closest('button, input, textarea, select, option, a[href], summary, [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]'))));
  }
  function acceptsKeyEvent(e) {
    // Later game listeners may consume a scroll key prevented by Kit itself,
    // while keys already handled by a UI listener stay out of gameplay.
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || (e.defaultPrevented && !scrollBlocked.has(e))) return false;
    if (nativeKeyTarget(e.target)) {
      // Escape closes a game's menu/pause overlay even when one of its buttons
      // has focus. Text fields and selects retain their own Escape behavior.
      return e.code === 'Escape' && !e.target.isContentEditable && !!(e.target.closest && e.target.closest('button, [role="button"]')) && !e.target.closest('input, textarea, select, option, [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]');
    }
    return e.code !== 'Tab' || !!(!e.shiftKey && tabCapture && tabCapture());
  }
  Kit.isGameKeyEvent = acceptsKeyEvent;
  // Tab stays available for menu navigation and leaving an embedded game.
  // Games with a Tab action can handle it while their playing surface is active.
  var BLOCK = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };
  Kit.keys = {
    isNativeTarget: nativeKeyTarget,
    acceptsEvent: acceptsKeyEvent,
    // Only games with a Tab action reserve it, and only while that action is available.
    captureTab: function (active) { tabCapture = active; },
    down: function (code) { return !!held[code]; },
    pressed: function (code) { return !!hit[code]; },
    anyDown: function (codes) { for (var i = 0; i < codes.length; i++) if (held[codes[i]]) return true; return false; },
    anyPressed: function (codes) { for (var i = 0; i < codes.length; i++) if (hit[codes[i]]) return true; return false; },
    endFrame: function () { hit = {}; },
    reset: function () { held = {}; hit = {}; }
  };
  listen('keydown', function (e) {
    engage();
    // Shift+Tab from the game surface returns to the portal. Native controls keep
    // their ordinary Tab order; standalone game pages keep browser navigation.
    if (e.code === 'Tab' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !e.defaultPrevented && !nativeKeyTarget(e.target) && window.parent !== window) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suspend('portal-escape');
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (err) { /* ignore */ }
      tellPortal('sg:focus-portal');
    }
  });
  window.addEventListener('keydown', function (e) {
    audio.unlock();
    if (!acceptsKeyEvent(e)) { if (e.code === 'Tab') Kit.keys.reset(); return; }
    if (BLOCK[e.code] || e.code === 'Tab') { scrollBlocked.add(e); e.preventDefault(); }
    if (!held[e.code]) hit[e.code] = true;
    held[e.code] = true;
  });
  listen('keyup', function (e) { held[e.code] = false; });
  window.addEventListener('blur', Kit.keys.reset);
  window.addEventListener('focusin', function (e) { if (nativeKeyTarget(e.target)) Kit.keys.reset(); });

  // Any click/tap arms engaged time, unlocks audio and makes sure the game frame
  // has keyboard focus.
  listen('pointerdown', function () { engage(); audio.unlock(); try { window.focus(); } catch (e) { /* ignore */ } });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ------------------------------------------------------ canvas scaling */
  // Kit.fit(canvas, 1280, 720) makes the canvas fill the window while keeping
  // a fixed LOGICAL resolution (letterboxed, centred, sharp on HiDPI).
  // Draw using logical coordinates with view.ctx, which is scaled on every resize.
  // Returns { ctx, width, height, scale, toLogical(clientX, clientY) }.
  Kit.fit = function (canvas, width, height, opts) {
    opts = opts || {};
    var view = { canvas: canvas, width: width, height: height, scale: 1, dpr: 1, ctx: null };
    if (!opts.webgl) view.ctx = canvas.getContext('2d');
    canvas.style.position = 'absolute';
    function resize() {
      var ww = window.innerWidth, wh = window.innerHeight;
      var s = Math.min(ww / width, wh / height);
      var dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
      view.scale = s; view.dpr = dpr;
      var cw = Math.round(width * s), ch = Math.round(height * s);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      canvas.style.left = Math.round((ww - cw) / 2) + 'px';
      canvas.style.top = Math.round((wh - ch) / 2) + 'px';
      if (!opts.webgl) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        view.ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
        view.ctx.imageSmoothingEnabled = opts.smooth !== false;
      }
      if (opts.onResize) opts.onResize(view);
    }
    view.toLogical = function (clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left) / view.scale, y: (clientY - r.top) / view.scale };
    };
    view.resize = resize;
    window.addEventListener('resize', resize);
    resize();
    return view;
  };

  // Tracks the mouse in logical coordinates for a Kit.fit view.
  // Kit.pointer(view) -> { x, y, down, pressed (edge), released (edge), endFrame() }
  Kit.pointer = function (view) {
    var p = { x: view.width / 2, y: view.height / 2, down: false, pressed: false, released: false, right: false };
    function move(e) { var l = view.toLogical(e.clientX, e.clientY); p.x = l.x; p.y = l.y; }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', function (e) { move(e); if (e.button === 2) { p.right = true; return; } p.down = true; p.pressed = true; });
    window.addEventListener('pointerup', function (e) { move(e); if (e.button === 2) { p.right = false; return; } if (p.down) p.released = true; p.down = false; });
    p.reset = function () { p.down = false; p.right = false; p.pressed = false; p.released = false; };
    pointerResets.push(p.reset);
    p.endFrame = function () { p.pressed = false; p.released = false; };
    return p;
  };

  /* ---------------------------------------------------------- game loop */
  // Kit.loop(update, render) runs update(dt) at a fixed 60 Hz and render(alpha)
  // once per animation frame. Automatically pauses while the tab is hidden.
  // Returns { stop(), running }.
  Kit.loop = function (update, render, opts) {
    opts = opts || {};
    var step = 1 / (opts.hz || 60);
    var acc = 0, last = 0, rafId = 0;
    var handle = { running: true };
    function frame(t) {
      if (!handle.running) return;
      rafId = requestAnimationFrame(frame);
      // The first frame after starting or showing the page has no frame time.
      var ms = last ? t - last : 0;
      last = t;
      if (document.hidden) return;
      countFrame(ms);
      acc += Math.min(0.25, ms / 1000);
      var n = 0;
      while (acc >= step && n < 8) { update(step); acc -= step; n++; }
      if (n === 8) acc = 0;
      if (render) render(acc / step);
    }
    rafId = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () { last = 0; });
    handle.stop = function () { handle.running = false; cancelAnimationFrame(rafId); };
    return handle;
  };

  /* ------------------------------------------------------------- effects */
  // Simple particle system for 2D canvas games.
  // var fx = Kit.particles(); fx.burst(x, y, {count, color|colors, speed, life, size, gravity});
  // fx.update(dt); fx.draw(ctx);
  Kit.particles = function () {
    var list = [];
    return {
      list: list,
      burst: function (x, y, o) {
        if (Kit.motion.reduced()) return;
        o = o || {};
        var n = o.count || 12;
        for (var i = 0; i < n; i++) {
          var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
          var sp = (o.speed || 200) * (0.4 + Math.random() * 0.6);
          list.push({
            x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: (o.life || 0.6) * (0.6 + Math.random() * 0.4), max: o.life || 0.6,
            size: (o.size || 5) * (0.6 + Math.random() * 0.6),
            color: o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : (o.color || '#fff'),
            g: o.gravity == null ? 400 : o.gravity
          });
        }
        if (list.length > 800) list.splice(0, list.length - 800);
      },
      update: function (dt) {
        if (Kit.motion.reduced()) { list.length = 0; return; }
        for (var i = list.length - 1; i >= 0; i--) {
          var p = list[i];
          p.life -= dt;
          if (p.life <= 0) { list.splice(i, 1); continue; }
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        }
      },
      draw: function (ctx) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      },
      clear: function () { list.length = 0; }
    };
  };

  // Screen shake helper: var shake = Kit.shake(); shake.add(8); shake.update(dt);
  // then ctx.translate(shake.x, shake.y) while drawing the world.
  Kit.shake = function () {
    var s = { x: 0, y: 0, power: 0 };
    s.add = function (p) { if (!Kit.motion.reduced()) s.power = Math.max(s.power, p); };
    s.update = function (dt) {
      if (Kit.motion.reduced()) { s.power = s.x = s.y = 0; return; }
      s.power = Math.max(0, s.power - dt * 40);
      s.x = (Math.random() - 0.5) * 2 * s.power;
      s.y = (Math.random() - 0.5) * 2 * s.power;
    };
    return s;
  };

  /* ------------------------------------------------------------------ UI */
  // Adds the standard round mute button (top-right corner). Also binds the
  // M key unless opts.key === false.
  Kit.muteButton = function (opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.className = 'sg-mute';
    b.type = 'button';
    b.setAttribute('aria-label', 'كتم الصوت');
    b.title = opts.key === false ? 'الصوت' : 'الصوت (M)';
    function paint() {
      b.textContent = audio.muted ? '🔇' : '🔊'; b.setAttribute('aria-pressed', String(audio.muted));
      b.disabled = classroomMode;
      b.title = classroomMode ? 'الصوت مكتوم في وضع الصف' : (opts.key === false ? 'الصوت' : 'الصوت (M)');
    }
    paint();
    audio.onMuteChange(paint);
    b.addEventListener('click', function (e) { e.stopPropagation(); audio.unlock(); audio.toggleMute(); if (e.detail > 0) b.blur(); });
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    document.body.appendChild(b);
    if (opts.key !== false) {
      window.addEventListener('keydown', function (e) { if (Kit.isGameKeyEvent(e) && e.code === 'KeyM' && !e.repeat) audio.toggleMute(); });
    }
    return b;
  };

  // Keep failed writes visible until the caller confirms a successful save.
  // A failure shows its message, then folds into a small corner badge that keeps
  // Retry, so a PC whose storage is blocked is not covered for the whole session.
  Kit.saveStatus = function (opts) {
    opts = opts || {};
    var panel = document.createElement('div'), message = document.createElement('span'), retry = document.createElement('button');
    var timer = 0, foldTimer = 0, hasFailed = false, retrying = false;
    panel.className = 'sg-save-status'; panel.hidden = true;
    panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    retry.type = 'button'; retry.textContent = 'أعد المحاولة'; retry.title = 'تعذّر الحفظ — أعد المحاولة';
    retry.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    retry.addEventListener('click', function (e) {
      e.stopPropagation();
      retrying = true;
      try { if (opts.retry) opts.retry(); } finally { retrying = false; }
      if (e.detail > 0) retry.blur();
    });
    panel.appendChild(message); panel.appendChild(retry); document.body.appendChild(panel);
    function fold(on) {
      clearTimeout(foldTimer);
      panel.setAttribute('data-compact', on ? 'true' : 'false');
      if (!on) foldTimer = setTimeout(function () { fold(true); }, 6000);
    }
    return {
      failed: function () {
        // Autosaves can fail every few seconds; only a new failure or the
        // child's own Retry unfolds the full message again.
        var fresh = !hasFailed || retrying;
        clearTimeout(timer); hasFailed = true; panel.hidden = false; retry.hidden = false;
        message.textContent = 'تعذّر الحفظ — '; panel.setAttribute('data-state', 'failed');
        if (fresh) fold(false);
      },
      saved: function () {
        if (!hasFailed) return;
        clearTimeout(timer); clearTimeout(foldTimer); hasFailed = false; retry.hidden = true;
        panel.setAttribute('data-compact', 'false');
        message.textContent = 'تم الحفظ'; panel.setAttribute('data-state', 'saved');
        timer = setTimeout(function () { panel.hidden = true; }, 2500);
      }
    };
  };

  // Formats 12345 -> "12,345".
  // One shared formatter: toLocaleString() builds a new ICU formatter on every call,
  // which is slow when a HUD formats numbers every frame.
  var numFmt = (typeof Intl !== 'undefined' && Intl.NumberFormat) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }) : null;
  Kit.fmt = function (n) { n = Math.floor(n); return numFmt ? numFmt.format(n) : n.toLocaleString('en-US'); };

  window.Kit = Kit;
})();

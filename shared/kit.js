/*
 * Kit — tiny shared helper library for every game on the site.
 * Plain script (no modules) so games also work when opened from file://.
 *
 *   <script src="../../shared/kit.js"></script>
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
        try { window.localStorage.setItem(prefix + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
      },
      remove: function (key) {
        try { window.localStorage.removeItem(prefix + key); } catch (e) { /* ignore */ }
      }
    };
  };
  var siteStore = Kit.store('site');

  /* --------------------------------------------------------------- audio */
  // Synthesised sound effects (no audio files). The AudioContext is created
  // lazily on the first user gesture, as browsers require.
  var audio = { ctx: null, master: null, muted: !!siteStore.get('muted', false) };
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

  audio.setMuted = function (m) {
    audio.muted = !!m;
    siteStore.set('muted', audio.muted);
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
    muteListeners.forEach(function (fn) { fn(audio.muted); });
  };
  audio.toggleMute = function () { audio.setMuted(!audio.muted); return audio.muted; };
  var muteListeners = [];
  audio.onMuteChange = function (fn) { muteListeners.push(fn); };

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
    g.gain.setValueAtTime(opts.vol == null ? 0.3 : opts.vol, t0);
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
    click: function () { audio.tone({ freq: 660, type: 'square', dur: 0.05, vol: 0.15 }); },
    coin: function () {
      audio.tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.18 });
      audio.tone({ freq: 1319, type: 'square', dur: 0.16, vol: 0.18, delay: 0.07 });
    },
    jump: function () { audio.tone({ freq: 300, to: 700, type: 'square', dur: 0.14, vol: 0.18 }); },
    land: function () { audio.tone({ freq: 160, to: 80, type: 'triangle', dur: 0.08, vol: 0.25 }); },
    hit: function () { audio.noise({ dur: 0.15, vol: 0.35, filter: 1800, to: 300 }); audio.tone({ freq: 180, to: 60, type: 'sawtooth', dur: 0.15, vol: 0.2 }); },
    pop: function () { audio.tone({ freq: 500, to: 1200, type: 'sine', dur: 0.08, vol: 0.3 }); },
    boom: function () { audio.noise({ dur: 0.6, vol: 0.5, filter: 1200, to: 60 }); },
    power: function () { [523, 659, 784, 1047].forEach(function (f, i) { audio.tone({ freq: f, type: 'square', dur: 0.09, vol: 0.15, delay: i * 0.06 }); }); },
    win: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { audio.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.3, delay: i * 0.1 }); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { audio.tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.3, delay: i * 0.15 }); }); },
    whoosh: function () { audio.noise({ dur: 0.25, vol: 0.2, filter: 3000, to: 400 }); }
  };

  /* ------------------------------------------------------------ keyboard */
  // Kit.keys.down('ArrowLeft')     -> true while held (uses KeyboardEvent.code)
  // Kit.keys.pressed('Space')      -> true once per press; call Kit.keys.endFrame()
  //                                   at the end of every update step to clear it.
  // Kit.keys.anyDown(['KeyA','ArrowLeft'])
  var held = {}, hit = {};
  var BLOCK = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, Tab: 1 };
  Kit.keys = {
    down: function (code) { return !!held[code]; },
    pressed: function (code) { return !!hit[code]; },
    anyDown: function (codes) { for (var i = 0; i < codes.length; i++) if (held[codes[i]]) return true; return false; },
    anyPressed: function (codes) { for (var i = 0; i < codes.length; i++) if (hit[codes[i]]) return true; return false; },
    endFrame: function () { hit = {}; },
    reset: function () { held = {}; hit = {}; }
  };
  window.addEventListener('keydown', function (e) {
    if (BLOCK[e.code]) e.preventDefault();
    audio.unlock();
    if (!held[e.code]) hit[e.code] = true;
    held[e.code] = true;
  });
  window.addEventListener('keyup', function (e) { held[e.code] = false; });
  window.addEventListener('blur', function () { held = {}; });

  // Any click/tap unlocks audio and makes sure the game frame has keyboard focus.
  window.addEventListener('pointerdown', function () { audio.unlock(); try { window.focus(); } catch (e) { /* ignore */ } }, true);
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ------------------------------------------------------ canvas scaling */
  // Kit.fit(canvas, 1280, 720) makes the canvas fill the window while keeping
  // a fixed LOGICAL resolution (letterboxed, centred, sharp on HiDPI).
  // Draw using logical coordinates after calling view.begin(ctx) each frame,
  // or just use the returned ctx which is already scaled on every resize.
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
    window.addEventListener('blur', function () { p.down = false; p.right = false; });
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
      if (!last) last = t;
      var dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      if (document.hidden) return;
      acc += dt;
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
    s.add = function (p) { s.power = Math.max(s.power, p); };
    s.update = function (dt) {
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
    b.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
    b.title = opts.key === false ? 'الصوت' : 'الصوت (M)';
    function paint() { b.textContent = audio.muted ? '🔇' : '🔊'; }
    paint();
    audio.onMuteChange(paint);
    b.addEventListener('click', function (e) { e.stopPropagation(); audio.unlock(); audio.toggleMute(); b.blur(); });
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    document.body.appendChild(b);
    if (opts.key !== false) {
      window.addEventListener('keydown', function (e) { if (e.code === 'KeyM' && !e.repeat) audio.toggleMute(); });
    }
    return b;
  };

  // Formats 12345 -> "12,345".
  Kit.fmt = function (n) { return Math.floor(n).toLocaleString('en-US'); };

  window.Kit = Kit;
})();

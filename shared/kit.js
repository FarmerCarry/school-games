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
(() => {
  'use strict';

  const Kit = {}, win = window, doc = document, M = Math;
  const st = (f, ms) => setTimeout(f, ms), ct = id => clearTimeout(id);
  const max = M.max, min = M.min, flr = M.floor, rndI = M.round;
  const PD = 'pointerdown', KD = 'keydown', VC = 'visibilitychange', TR = 'triangle', RD = 'reduce', SY = 'system', BTN = 'button';
  const rnd = () => M.random();
  const bi = () => rnd() * 2 - 1;
  const is = (v, t) => typeof v === t;
  const on = (t, e, f, c) => t.addEventListener(e, f, c);
  const sa = (el, k, v) => el.setAttribute(k, v);
  const ap = (p, c) => p.appendChild(c);
  const stop = e => e.stopPropagation();
  const pd = e => e.preventDefault();
  const each = (list, fn) => list.forEach(fn);
  const z6 = () => [0, 0, 0, 0, 0, 0];

  /* ---------------------------------------------------------------- math */
  Kit.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  Kit.lerp = (a, b, t) => a + (b - a) * t;
  Kit.rand = (a, b) => a + rnd() * (b - a);
  Kit.randInt = (a, b) => flr(a + rnd() * (b - a + 1));
  Kit.pick = arr => arr[flr(rnd() * arr.length)];
  Kit.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = flr(rnd() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  Kit.dist = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return M.sqrt(dx * dx + dy * dy); };

  /* ------------------------------------------------------------- storage */
  const ls = () => win.localStorage;
  Kit.store = slug => {
    const prefix = 'sg:' + slug + ':';
    return {
      get: (key, fallback) => {
        try {
          const raw = ls().getItem(prefix + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch { return fallback; }
      },
      set: (key, value) => {
        try { ls().setItem(prefix + key, JSON.stringify(value)); return true; } catch { return false; }
      },
      remove: key => {
        try { ls().removeItem(prefix + key); } catch { /* ignore */ }
      }
    };
  };
  const siteStore = Kit.store('site');

  /* --------------------------------------------------------- preferences */
  const motionQuery = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const motionListeners = [];
  const validMotion = value => value === RD || value === 'full' ? value : SY;
  const subscribe = (list, fn) => { list.push(fn); return () => { const i = list.indexOf(fn); if (i !== -1) list.splice(i, 1); }; };
  const motion = Kit.motion = {
    preference: validMotion(siteStore.get('motion', SY)),
    reduced() { return this.preference === RD || (this.preference === SY && !!(motionQuery && motionQuery.matches)); },
    setPreference(value) { this.preference = validMotion(value); siteStore.set('motion', this.preference); paintMotion(); },
    onChange: fn => subscribe(motionListeners, fn)
  };
  const isRed = () => motion.reduced();
  const paintMotion = () => {
    const reduced = isRed();
    sa(doc.documentElement, 'data-sg-motion', reduced ? RD : 'full');
    each(motionListeners, fn => fn(reduced));
  };
  if (motionQuery) {
    if (motionQuery.addEventListener) on(motionQuery, 'change', paintMotion);
    else if (motionQuery.addListener) motionQuery.addListener(paintMotion);
  }
  paintMotion();

  /* ----------------------------------------------------------- lifecycle */
  const lifecycleHandlers = [], pointerResets = [], perf = win.performance;
  let ready = false, failed = false;
  const clock = () => perf ? perf.now() | 0 : Date.now();
  const tellPortal = message => {
    if (win.parent !== win) win.parent.postMessage(message, win.location && win.location.protocol !== 'file:' ? win.location.origin : '*');
  };
  const tellV1 = (type, data) => {
    data = data || {}; data.type = type; data.version = 1;
    tellPortal(data);
  };
  const listen = (type, fn) => on(win, type, fn, true);
  const runHooks = reason => each(lifecycleHandlers.slice(), hooks => {
    try { if (hooks.reset) hooks.reset(); } catch { /* keep going */ }
    try { hooks.pause(reason); } catch { /* one faulty hook must not skip later save hooks */ }
  });
  const suspend = reason => {
    if (roundId && until !== 0) rp++;
    send(true);
    cueAt = -1;
    if (Kit.keys) Kit.keys.reset();
    each(pointerResets, reset => reset());
    runHooks(reason);
  };
  Kit.lifecycle = hooks => {
    if (!hooks || !is(hooks.pause, 'function')) throw new TypeError('Kit.lifecycle requires pause');
    return subscribe(lifecycleHandlers, hooks);
  };
  Kit.ready = () => {
    if (failed) return;
    ready = true;
    tellV1('sg:ready');
    tick();
  };
  const errorText = error => String(error && error.message || error || 'Game failed to initialize').slice(0, 240);
  Kit.fail = error => {
    if (failed) return;
    failed = true;
    tellV1('sg:error', { message: errorText(error) });
  };
  let warnAt = -1, recent = [], reporting = false;
  const runtimeError = error => {
    if (failed || reporting) return;
    if (!ready) return Kit.fail(error);
    const t = clock();
    recent = recent.filter(x => t - x < 10000);
    recent.push(t);
    if (recent.length >= 5) {
      reporting = true;
      runHooks('error');
      return Kit.fail(error);
    }
    if (warnAt >= 0 && t - warnAt < 10000) return;
    warnAt = t;
    tellV1('sg:warn', { message: errorText(error) });
  };
  listen('error', e => {
    if (e.message || (e.target && e.target.tagName === 'SCRIPT')) runtimeError(e.error || e.message || 'Game script failed to load');
  });
  on(win, 'unhandledrejection', e => runtimeError(e.reason));
  on(win, 'blur', () => suspend('blur'));
  on(doc, VC, () => { if (doc.hidden) suspend('hidden'); });
  let wasFullscreen = !!doc.fullscreenElement;
  on(doc, 'fullscreenchange', () => {
    const fullscreen = !!doc.fullscreenElement;
    if (wasFullscreen && !fullscreen) suspend('fullscreen-exit');
    wasFullscreen = fullscreen;
  });
  on(win, 'message', e => {
    if (win.parent === win || e.source !== win.parent) return;
    const m = e.data;
    if (!m || !is(m, 'object')) return;
    if (m.type === 'sg:pause') suspend(m.reason || 'portal');
    else if (m.type === 'sg:request-ready' && ready && !failed) Kit.ready();
    else if (m.type === 'sg:preferences') {
      if (is(m.quiet, 'boolean')) audio.setMuted(m.quiet);
      if (is(m.motionPreference, 'string')) motion.setPreference(m.motionPreference);
      else if (is(m.reducedMotion, 'boolean')) motion.setPreference(m.reducedMotion ? RD : 'full');
      if (is(m.telemetry, 'boolean') && !(telemetry = m.telemetry)) { tev = []; unacked = []; il = z6(); cueAt = -1; ct(timer); timer = 0; }
      tick();
    }
  });

  /* ----------------------------------------------------- play statistics */
  let telemetry = win.parent !== win ? null : false, timer = 0, from, until, tn = 0, engaged = 0, roundMs = 0, roundId = '';
  let frames = [0, 0, 0, 0], il = z6(), rt = z6(), tev = [], unacked = [], tutorials = {};
  let tier = 0, hits = 0, misses = 0, cueAt = -1, r0 = 0, ri = 0, rd = 0, rp = 0, rsum = 0, rn = 0, dl = -1;
  const live = () => telemetry !== false && !failed;
  const push = (...a) => { if (live() && tev.length < 400) tev.push(...a); };
  const tally = () => {
    const t = tn = clock(), x = t < until ? t : until;
    if (x > from) { engaged += x - from; if (roundId) roundMs += x - from; from = x; }
    return t;
  };
  const engage = extendOnly => {
    const t = tally();
    if (!extendOnly && roundId && until && t >= until) rd++;
    if (!extendOnly || t < until) { from = t; until = t + 20000; }
  };
  const countFrame = ms => {
    try {
      if (ms > 0 && roundId && clock() < until) {
        frames[ms > 20 ? ms > 34 ? ms > 250 ? 3 : 2 : 1 : 0]++;
        if (Kit._frame) Kit._frame(ms);
      }
    } catch { /* ignore */ }
  };
  const send = (cut, out) => {
    tally();
    if (cut) until = 0;
    while (telemetry && ready && !failed && (engaged || frames.some(Number) || il.some(Number) || tev.length)) {
      const m = { type: 'sg:telemetry', version: 2, e: engaged, f: frames, il, ev: tev.splice(0, 64) };
      if (out) out.push(m); else { if (unacked.length < 16) unacked.push(m); tellPortal(m); }
      engaged = 0; frames = [0, 0, 0, 0]; il = z6();
    }
    return out;
  };
  const tick = () => {
    if (!timer && telemetry && ready && !failed) timer = st(() => { timer = 0; send(); tick(); }, 10000);
  };
  const put = (list, ms, bounds) => { let i = 0; for (; i < 5 && ms >= bounds[i]; i++); list[i]++; };
  const timed = ms => { put(rt, ms, [300, 500, 800, 1200, 2000]); rsum += ms; rn++; };
  const mark = (code, score) => {
    if (code == null) push(['rs', roundId, tier]);
    else push(['rx', tn - r0, ri, rd, rp, rsum, rn, dl], ['re', code, roundId, roundMs, fin(score) ? score : -1, tier, hits, misses, rt]);
    hits = misses = ri = rd = rp = rsum = rn = 0; rt = z6(); cueAt = -1; r0 = tn;
  };
  const input = (e, key) => {
    engage();
    if (roundId && !e.repeat) ri++;
    if (live() && !e.repeat) {
      let t = e.timeStamp;
      if (perf && is(t, 'number') && t > 0 && (t = perf.now() - t) >= 0 && t <= 1000) put(il, t, [8, 16, 33, 50, 100]);
      if (cueAt >= 0 && (!key || acceptsKeyEvent(e))) { timed(clock() - cueAt); cueAt = -1; }
    }
  };
  const text = value => { try { return String(value).slice(0, 24); } catch { return ''; } };
  const quitOpen = quit => { if (quit && roundId) { tally(); mark('q'); roundId = ''; } };
  Kit._ack = () => { unacked.shift(); };
  Kit._flush = quit => { quitOpen(quit); return [unacked.splice(0), send(quit, [])]; };
  listen('pagehide', e => { quitOpen(!(e && e.persisted)); send(e); });
  listen('pointermove', engage);
  listen('wheel', engage);
  const roundNews = (phase, code) => {
    if (ready && !failed) tellV1('sg:round', { phase, result: code || '' });
  };
  Kit.stats = {
    round: id => {
      tally();
      if (roundId) mark('q');
      roundId = text(id);
      mark();
      roundMs = 0;
      send();
      roundNews('start');
    },
    end: (result, score) => {
      if (!roundId) return;
      tally();
      const code = text(result).charAt(0);
      mark(code, score);
      roundId = '';
      send();
      roundNews('end', code);
    },
    tutorial: step => {
      if ((step === 'start' || step === 'done') && !tutorials[step]) { tutorials[step] = 1; push(['tu', step.charAt(0)]); }
    },
    busy: () => engage(1),
    frame: countFrame
  };
  Kit.track = {
    hit: () => { if (live()) hits++; },
    miss: () => { if (live()) misses++; },
    cue: () => { if (live()) cueAt = clock(); },
    react: ms => { if (live() && fin(ms)) timed(ms); },
    tier: n => { if (fin(n) && n < 10) tier = n | 0; }
  };

  /* ------------------------------------------------------------- DDA */
  const fin = v => is(v, 'number') && v >= 0 && v < 1 / 0;
  const obj = v => v && is(v, 'object') && !Array.isArray(v) ? v : {};
  const unit = (v, fallback) => fin(v) && v <= 1 ? v : fallback;
  const pair = v => Array.isArray(v) && v[1] >= 1 && unit(v[0], -1) >= 0 ? v : null;
  const ddaSaved = store => {
    const raw = obj(store.get('dda')), out = {};
    for (const k in raw) if (!pair(raw[k])) { const old = obj(raw[k]); for (const id in old) if (pair(old[id])) out[id] = old[id]; }
    for (const k in raw) if (pair(raw[k])) out[k] = raw[k];
    return out;
  };
  Kit.dda = (slug, opts) => {
    opts = opts || {};
    const store = Kit.store(slug), id = opts.id || 'main';
    let level = 0, n = 0, low = 0, high = 0, loaded = false;
    const target = unit(opts.target, 0.72), tiers = Kit.clamp(opts.tiers | 0, 0, 9) || 5;
    const now = () => {
      if (!loaded) {
        loaded = true;
        const mine = ddaSaved(store)[id];
        if (mine) { level = mine[0]; n = mine[1] >>> 0; }
      }
      return n ? level : unit(opts.start, 0.35);
    };
    const tierOf = l => 1 + flr(l * tiers * 0.9999);
    const read = () => { const l = now(); tier = tierOf(l); dl = rndI(l * 1000); return l; };
    const save = () => {
      const all = ddaSaved(store);
      if (n) all[id] = [level, n]; else delete all[id];
      store.set('dda', all);
    };
    const dda = {
      get level() { return read(); },
      get tier() { return tierOf(read()); },
      value: (easy, hard) => Kit.lerp(easy, hard, read()),
      pick: list => list[min(dda.tier, list.length) - 1],
      result: outcome => {
        let x = outcome === true ? 1 : outcome === false ? 0 : outcome, l = now();
        if (!Number.isFinite(x)) return;
        x = Kit.clamp(x, 0, 1);
        const step = Kit.clamp(0.18 / M.sqrt(1 + n / 2), 0.03, 0.18);
        low = x < 0.3 ? low + 1 : 0; high = x >= 0.9 ? high + 1 : 0;
        l += step * (x - target) - (low > 1 ? step : 0) + (high > 2 ? step / 2 : 0);
        level = rndI(Kit.clamp(l, 0, 1) * 1000) / 1000;
        n++;
        save();
      },
      reset: () => { now(); n = low = high = 0; save(); }
    };
    return dda;
  };

  /* --------------------------------------------------------------- audio */
  let personalMuted = !!siteStore.get('muted', false);
  const audio = Kit.audio = { ctx: null, master: null, muted: personalMuted };
  const muteListeners = [];

  audio.unlock = () => {
    let c = audio.ctx;
    if (!c) {
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      try {
        c = audio.ctx = new AC();
        const m = audio.master = c.createGain();
        m.gain.value = audio.muted ? 0 : 0.5;
        m.connect(c.destination);
      } catch { return audio.ctx = null; }
    }
    if (c.state === 'suspended') { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
    return c;
  };

  const paintAudio = () => {
    audio.muted = personalMuted;
    if (audio.master) audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.5, audio.ctx.currentTime, 0.015);
    each(muteListeners, fn => fn(audio.muted));
  };
  audio.setMuted = m => { personalMuted = !!m; siteStore.set('muted', personalMuted); paintAudio(); };
  audio.toggleMute = () => { audio.setMuted(!personalMuted); return audio.muted; };
  audio.onMuteChange = fn => { muteListeners.push(fn); };
  on(win, 'storage', e => {
    if (e.key === 'sg:site:motion' || e.key === null) { motion.preference = validMotion(siteStore.get('motion', SY)); paintMotion(); }
    if (e.key === 'sg:site:muted' || e.key === null) { personalMuted = !!siteStore.get('muted', false); paintAudio(); }
  });

  const at = (p, v, t) => p.setValueAtTime(v, t);
  const expRamp = (p, v, t) => p.exponentialRampToValueAtTime(v, t);
  audio.tone = opts => {
    const ctx = audio.ctx;
    if (!ctx || audio.muted) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0), dur = opts.dur || 0.12, vol = opts.vol == null ? 0.3 : opts.vol;
    const osc = ctx.createOscillator(), g = ctx.createGain(), gg = g.gain;
    gg.value = 0;
    osc.type = opts.type || 'square';
    at(osc.frequency, opts.freq || 440, t0);
    if (opts.to) expRamp(osc.frequency, max(1, opts.to), t0 + dur);
    at(gg, 0.0001, t0);
    expRamp(gg, vol, t0 + (opts.attack || 0.005));
    expRamp(gg, 0.0001, t0 + dur);
    osc.connect(g); g.connect(audio.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  };

  let noiseBuf = null;
  audio.noise = opts => {
    const ctx = audio.ctx;
    if (!ctx || audio.muted) return;
    opts = opts || {};
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = bi();
    }
    const t0 = ctx.currentTime + (opts.delay || 0), dur = opts.dur || 0.25;
    const src = ctx.createBufferSource(), g = ctx.createGain(), gg = g.gain;
    src.buffer = noiseBuf;
    gg.value = 0;
    at(gg, 0.0001, t0);
    gg.linearRampToValueAtTime(opts.vol == null ? 0.3 : opts.vol, t0 + 0.003);
    expRamp(gg, 0.0001, t0 + dur);
    let node = src;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      at(f.frequency, opts.filter, t0);
      if (opts.to) expRamp(f.frequency, max(20, opts.to), t0 + dur);
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(audio.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  };

  const sfxTone = (f, to, t, d, v) => () => audio.tone({ freq: f, to, type: t, dur: d, vol: v });
  const sfxSeq = (a, d, v, step) => () => each(a, (f, i) => audio.tone({ freq: f, type: TR, dur: d, vol: v, delay: i * step }));
  Kit.sfx = {
    click: sfxTone(660, 0, TR, 0.05, 0.15),
    land: sfxTone(160, 80, TR, 0.08, 0.25),
    pop: sfxTone(500, 1200, 'sine', 0.08, 0.3),
    boom: () => audio.noise({ dur: 0.6, vol: 0.5, filter: 1200, to: 60 }),
    power: sfxSeq([523, 659, 784, 1047], 0.09, 0.15, 0.06),
    win: sfxSeq([523, 659, 784, 1047, 784, 1047], 0.16, 0.3, 0.1),
    lose: sfxSeq([392, 330, 262, 196], 0.22, 0.3, 0.15)
  };

  /* ------------------------------------------------------------ keyboard */
  let held = {}, hit = {}, tabCapture = null;
  const scrollBlocked = new WeakSet();
  const FORM_SEL = 'input, textarea, select, option, [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]';
  const NATIVE_SEL = 'button, a[href], summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], ' + FORM_SEL;
  const nativeKeyTarget = t => !!(t && (t.isContentEditable || (t.closest && t.closest(NATIVE_SEL))));
  const hasMod = e => e.isComposing || e.ctrlKey || e.metaKey || e.altKey;
  const acceptsKeyEvent = e => {
    if (hasMod(e) || (e.defaultPrevented && !scrollBlocked.has(e))) return false;
    const t = e.target;
    if (nativeKeyTarget(t)) {
      return e.code === 'Escape' && !t.isContentEditable && !!(t.closest && t.closest('button, [role="button"]')) && !t.closest(FORM_SEL);
    }
    return e.code !== 'Tab' || !!(!e.shiftKey && tabCapture && tabCapture());
  };
  Kit.isGameKeyEvent = acceptsKeyEvent;
  const BLOCK = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };
  const anyKey = (map, codes) => codes.some(c => map[c]);
  const keys = Kit.keys = {
    isNativeTarget: nativeKeyTarget,
    captureTab: active => { tabCapture = active; },
    down: code => !!held[code],
    pressed: code => !!hit[code],
    anyDown: codes => anyKey(held, codes),
    anyPressed: codes => anyKey(hit, codes),
    endFrame: () => { hit = {}; },
    reset: () => { held = {}; hit = {}; }
  };
  listen(KD, e => {
    input(e, 1);
    if (e.code === 'Tab' && e.shiftKey && !hasMod(e) && !e.defaultPrevented && !nativeKeyTarget(e.target) && win.parent !== win) {
      pd(e);
      e.stopImmediatePropagation();
      suspend('portal-escape');
      try { if (doc.pointerLockElement) doc.exitPointerLock(); } catch { /* ignore */ }
      tellPortal('sg:focus-portal');
    }
  });
  on(win, KD, e => {
    audio.unlock();
    if (!acceptsKeyEvent(e)) { if (e.code === 'Tab') keys.reset(); return; }
    if (BLOCK[e.code] || e.code === 'Tab') { scrollBlocked.add(e); pd(e); }
    if (!held[e.code]) hit[e.code] = true;
    held[e.code] = true;
  });
  listen('keyup', e => { held[e.code] = false; });
  on(win, 'blur', keys.reset);
  on(win, 'focusin', e => { if (nativeKeyTarget(e.target)) keys.reset(); });

  listen(PD, e => { input(e); audio.unlock(); try { win.focus(); } catch { /* ignore */ } });
  on(win, 'contextmenu', pd);

  /* ------------------------------------------------------ canvas scaling */
  const lightCap = () => {
    const v = siteStore.get('gfx-light', 0), nav = win.navigator, hc = nav && nav.hardwareConcurrency;
    return v === true || v === 1 || v === '1' || (is(hc, 'number') && hc > 0 && hc <= 4 && (nav.deviceMemory || 4) <= 4) ? 1 : 1.5;
  };
  Kit.fit = (canvas, width, height, opts) => {
    opts = opts || {};
    const view = { canvas, width, height, scale: 1, dpr: 1, ctx: opts.webgl ? null : canvas.getContext('2d') }, stStyle = canvas.style;
    stStyle.position = 'absolute';
    const resize = () => {
      const ww = win.innerWidth, wh = win.innerHeight, s = min(ww / width, wh / height);
      const dpr = min(win.devicePixelRatio || 1, opts.maxDpr != null ? opts.maxDpr : lightCap());
      view.scale = s; view.dpr = dpr;
      const cw = rndI(width * s), ch = rndI(height * s);
      stStyle.width = cw + 'px';
      stStyle.height = ch + 'px';
      stStyle.left = rndI((ww - cw) / 2) + 'px';
      stStyle.top = rndI((wh - ch) / 2) + 'px';
      if (!opts.webgl) {
        canvas.width = rndI(cw * dpr);
        canvas.height = rndI(ch * dpr);
        view.ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
        view.ctx.imageSmoothingEnabled = opts.smooth !== false;
      }
      if (opts.onResize) opts.onResize(view);
    };
    view.toLogical = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left) / view.scale, y: (clientY - r.top) / view.scale };
    };
    view.resize = resize;
    on(win, 'resize', resize);
    resize();
    return view;
  };

  Kit.pointer = view => {
    const p = { x: view.width / 2, y: view.height / 2, down: false, pressed: false, released: false, right: false };
    const move = e => { const l = view.toLogical(e.clientX, e.clientY); p.x = l.x; p.y = l.y; };
    on(win, 'pointermove', move);
    on(win, PD, e => { move(e); if (e.button === 2) { p.right = true; return; } p.down = p.pressed = true; });
    on(win, 'pointerup', e => { move(e); if (e.button === 2) { p.right = false; return; } if (p.down) p.released = true; p.down = false; });
    p.reset = () => { p.down = p.right = p.pressed = p.released = false; };
    pointerResets.push(p.reset);
    p.endFrame = () => { p.pressed = p.released = false; };
    return p;
  };

  /* ---------------------------------------------------------- game loop */
  Kit.loop = (update, render, opts) => {
    opts = opts || {};
    const step = 1 / (opts.hz || 60), handle = { running: true };
    let acc = 0, last = 0, rafId = 0;
    const frame = t => {
      if (!handle.running) return;
      rafId = requestAnimationFrame(frame);
      const ms = last ? t - last : 0;
      last = t;
      if (doc.hidden) return;
      countFrame(ms);
      acc += min(0.25, ms / 1000);
      let n = 0;
      while (acc >= step && n < 8) { update(step); acc -= step; n++; }
      if (n === 8) acc = 0;
      if (render) render(acc / step);
    };
    rafId = requestAnimationFrame(frame);
    on(doc, VC, () => { last = 0; });
    handle.stop = () => { handle.running = false; cancelAnimationFrame(rafId); };
    return handle;
  };

  /* ------------------------------------------------------------- effects */
  Kit.particles = () => {
    const list = [];
    return {
      list,
      burst: (x, y, o) => {
        if (isRed()) return;
        o = o || {};
        const n = o.count || 12, life = o.life || 0.6;
        for (let i = 0; i < n; i++) {
          const a = o.angle != null ? o.angle + (rnd() - 0.5) * (o.spread || M.PI * 2) : rnd() * M.PI * 2;
          const sp = (o.speed || 200) * (0.4 + rnd() * 0.6);
          list.push({
            x, y, vx: M.cos(a) * sp, vy: M.sin(a) * sp,
            life: life * (0.6 + rnd() * 0.4), max: life,
            size: (o.size || 5) * (0.6 + rnd() * 0.6),
            color: o.colors ? o.colors[flr(rnd() * o.colors.length)] : (o.color || '#fff'),
            g: o.gravity == null ? 400 : o.gravity
          });
        }
        if (list.length > 800) list.splice(0, list.length - 800);
      },
      update: dt => {
        if (isRed()) { list.length = 0; return; }
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          if ((p.life -= dt) <= 0) { list.splice(i, 1); continue; }
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        }
      },
      draw: ctx => {
        for (let i = 0; i < list.length; i++) {
          const p = list[i], h = p.size / 2;
          ctx.globalAlpha = max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - h, p.y - h, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      },
      clear: () => { list.length = 0; }
    };
  };

  Kit.shake = opts => {
    let peak = 0, tr = 0;
    const decay = (opts && opts.decay) || 2.8, s = { x: 0, y: 0, rot: 0, power: 0, trauma: 0 };
    s.add = p => {
      if (isRed() || !(p > 0)) return;
      if (p > peak) peak = p;
      tr = min(1, max(tr, M.sqrt(max(peak * tr * tr, p) / peak)));
      s.trauma = tr; s.power = peak * tr * tr;
    };
    s.update = dt => {
      if (isRed() || tr <= 0) { peak = tr = s.trauma = s.power = s.x = s.y = s.rot = 0; return; }
      tr = max(0, tr - dt * decay);
      const t2 = tr * tr;
      s.trauma = tr; s.power = peak * t2;
      if (!tr) { peak = s.x = s.y = s.rot = 0; return; }
      s.x = bi() * s.power; s.y = bi() * s.power; s.rot = bi() * t2 * 0.035;
    };
    return s;
  };

  let hitLeft = 0, hitUntil = 0;
  const clrHit = () => { hitLeft = hitUntil = 0; return false; };
  const hitstop = sec => {
    if (isRed()) { clrHit(); return 0; }
    if (sec > 0) {
      const s = Kit.clamp(sec, 0, 0.4), u = clock() + s * 1000;
      if (s > hitLeft) hitLeft = s;
      if (u > hitUntil) hitUntil = u;
    }
    return hitstop.active() ? hitLeft : 0;
  };
  hitstop.active = () => isRed() || hitLeft <= 0 || (hitUntil && clock() >= hitUntil) ? clrHit() : true;
  hitstop.tick = dt => {
    if (isRed() || hitLeft <= 0) return clrHit();
    hitLeft = max(0, hitLeft - (dt > 0 ? dt : 0));
    hitUntil = hitLeft ? clock() + hitLeft * 1000 : 0;
    return true;
  };
  hitstop.reset = clrHit;
  Kit.hitstop = hitstop;

  const rtMap = typeof WeakMap === 'function' ? new WeakMap() : null;
  Kit.retrigger = (el, cls) => {
    const cl = el && cls && el.classList;
    let p = cl && rtMap && rtMap.get(el);
    if (!cl || (p && p[cls])) return;
    cl.remove(cls);
    const raf = win.requestAnimationFrame || (typeof requestAnimationFrame === 'function' && requestAnimationFrame);
    if (!raf) { cl.add(cls); return; }
    if (rtMap) { if (!p) rtMap.set(el, p = {}); p[cls] = 1; }
    raf(() => raf(() => { if (p) delete p[cls]; cl.add(cls); }));
  };

  /* ------------------------------------------------------------------ UI */
  const mkEl = t => doc.createElement(t);
  Kit.muteButton = opts => {
    opts = opts || {};
    const b = mkEl(BTN);
    b.className = 'sg-mute'; b.type = BTN;
    sa(b, 'aria-label', 'كتم الصوت');
    b.title = opts.key === false ? 'الصوت' : 'الصوت (M)';
    const paint = () => { b.textContent = audio.muted ? '🔇' : '🔊'; sa(b, 'aria-pressed', String(audio.muted)); };
    paint();
    audio.onMuteChange(paint);
    on(b, 'click', e => { stop(e); audio.unlock(); audio.toggleMute(); if (e.detail > 0) b.blur(); });
    on(b, PD, stop);
    ap(doc.body, b);
    if (opts.key !== false) {
      on(win, KD, e => { if (acceptsKeyEvent(e) && e.code === 'KeyM' && !e.repeat) audio.toggleMute(); });
    }
    return b;
  };

  Kit.saveStatus = opts => {
    opts = opts || {};
    const panel = mkEl('div'), message = mkEl('span'), retry = mkEl(BTN);
    let timer = 0, foldTimer = 0, hasFailed = false, retrying = false;
    panel.className = 'sg-save-status'; panel.hidden = true;
    sa(panel, 'role', 'status'); sa(panel, 'aria-live', 'polite');
    retry.type = BTN; retry.textContent = 'أعد المحاولة'; retry.title = 'تعذّر الحفظ — أعد المحاولة';
    on(retry, PD, stop);
    on(retry, 'click', e => {
      stop(e);
      retrying = true;
      try { if (opts.retry) opts.retry(); } finally { retrying = false; }
      if (e.detail > 0) retry.blur();
    });
    ap(panel, message); ap(panel, retry); ap(doc.body, panel);
    const dc = v => sa(panel, 'data-compact', v);
    const fold = onF => {
      ct(foldTimer);
      dc(onF ? 'true' : 'false');
      if (!onF) foldTimer = st(() => fold(true), 6000);
    };
    return {
      failed: () => {
        const fresh = !hasFailed || retrying;
        ct(timer); hasFailed = true; panel.hidden = retry.hidden = false;
        message.textContent = 'تعذّر الحفظ — '; sa(panel, 'data-state', 'failed');
        if (fresh) fold(false);
      },
      saved: () => {
        if (!hasFailed) return;
        ct(timer); ct(foldTimer); hasFailed = false; retry.hidden = true;
        dc('false');
        message.textContent = 'تم الحفظ'; sa(panel, 'data-state', 'saved');
        timer = st(() => { panel.hidden = true; }, 2500);
      }
    };
  };

  const numFmt = (typeof Intl !== 'undefined' && Intl.NumberFormat) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }) : null;
  Kit.fmt = n => { n = flr(n); return numFmt ? numFmt.format(n) : n.toLocaleString('en-US'); };

  win.Kit = Kit;
})();

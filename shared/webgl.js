/*
 * WebGL guardrails for 3D games on school PCs (Kit.webgl).
 * Classic script, zero dependencies. Load AFTER shared/kit.js (and before game art/scripts):
 *   <script src="../../shared/kit.js"></script>
 *   <script src="../../shared/webgl.js"></script>
 *
 * Opt-in: nothing runs at load. Kept as one shared cached file in the fast build (?v=<hash>).
 *
 *   Kit.webgl.probe(force?)               -> { ok, software, renderer } (cached)
 *   Kit.webgl.isSoftware(glOrRenderer?)   -> boolean (detects SwiftShader/llvmpipe/WARP/Basic Render/Mesa)
 *   Kit.webgl.pixelRatio(opts?)           -> clamped DPR respecting software GPU, Kit.gfx, and low-end caps
 *   Kit.webgl.pacer(rendererOrGl, opts?)  -> { mayDraw(now, playing), markDrawn(), whenDrawn(done, limit), wait(ms), dispose() }
 *   Kit.webgl.whenDrawn(rendererOrGl, done, limit?)  -> polls fenceSync (or finish() fallback) then calls done()
 *   Kit.webgl.watchContext(canvas, opts?) -> { lost, detach() } wiring webglcontextlost/restored
 *   Kit.webgl.showNoGL(opts?)             -> shows #nogl or creates an RTL Arabic fallback panel
 *   Kit.webgl.boot(fn, opts?)             -> deferred 3D init via rAF + setTimeout(0) with fallback timer
 *   Kit.webgl.createRenderer(canvas, opts?) -> { renderer, gl, software, ratio } | null
 */
(function () {
  'use strict';
  var W = window, Kit = W.Kit;
  if (!Kit || Kit.webgl) return;

  var SOFT_RE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|basic render|\bwarp\b|mesa/i;
  var NO = {};
  var cachedProbe = null;

  function doc() { return W.document; }
  function nowMs() {
    var p = W.performance;
    return p && p.now ? p.now() : Date.now();
  }
  function getGl(target) {
    if (!target) return null;
    if (typeof target.getContext === 'function') {
      try { return target.getContext(); } catch (e) { return null; }
    }
    return target;
  }
  function resolveEl(elOrId) {
    if (!elOrId) return null;
    if (typeof elOrId === 'string') {
      var d = doc();
      return d && d.getElementById ? d.getElementById(elOrId) : null;
    }
    return elOrId;
  }
  function inspectContext(gl) {
    var r = '', u = '';
    try { r = String(gl.getParameter(gl.RENDERER) || ''); } catch (e) { /* ignore */ }
    try {
      var info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) u = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '');
    } catch (e) { /* ignore */ }
    return { ok: true, software: SOFT_RE.test(r) || SOFT_RE.test(u), renderer: u || r };
  }

  function probe(force) {
    if (cachedProbe && !force) {
      return { ok: cachedProbe.ok, software: cachedProbe.software, renderer: cachedProbe.renderer };
    }
    var gl = null;
    var res = { ok: false, software: false, renderer: '' };
    try {
      var d = doc();
      if (d && d.createElement) {
        var c = d.createElement('canvas');
        var opts = { powerPreference: 'high-performance' };
        gl = c.getContext('webgl2', opts) || c.getContext('webgl', opts) || c.getContext('experimental-webgl', opts);
        if (gl) res = inspectContext(gl);
      }
    } catch (e) {
      res = { ok: false, software: false, renderer: '' };
    } finally {
      try {
        var lose = gl && gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (e) { /* ignore */ }
    }
    cachedProbe = res;
    return { ok: res.ok, software: res.software, renderer: res.renderer };
  }

  function isSoftware(target) {
    if (target) {
      var gl = getGl(target);
      return gl ? inspectContext(gl).software : false;
    }
    return probe().software;
  }

  function pixelRatio(opts) {
    opts = opts || NO;
    var dpr = W.devicePixelRatio || 1;
    if (!(dpr > 0)) dpr = 1;
    var min = opts.min != null ? opts.min : 0.5;
    var max = opts.max != null ? opts.max : 1.5;
    if (opts.low) return opts.lowRatio != null ? opts.lowRatio : 0.5;
    var soft = opts.software != null ? !!opts.software : isSoftware();
    if (soft) {
      var sr = opts.softRatio != null ? opts.softRatio : 0.75;
      return Math.max(min, Math.min(max, sr));
    }
    var light = !!(opts.light || (opts.gfx && opts.gfx.light));
    if (light) {
      var scale = opts.lightScale != null ? opts.lightScale : 0.75;
      return Math.max(min, Math.min(dpr, 1) * scale);
    }
    return Math.max(min, Math.min(dpr, max));
  }

  function syncSignaled(gl, sync) {
    if (!gl || !sync) return true;
    try {
      if (gl.isContextLost && gl.isContextLost()) return true;
      if (typeof gl.getSyncParameter === 'function') {
        return gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED;
      }
      if (typeof gl.clientWaitSync === 'function') {
        return gl.clientWaitSync(sync, 0, 0) !== gl.TIMEOUT_EXPIRED;
      }
    } catch (e) { /* treat as signaled so loops never stall */ }
    return true;
  }

  function deleteSync(gl, sync) {
    if (!gl || !sync) return;
    try { gl.deleteSync(sync); } catch (e) { /* ignore */ }
  }

  function whenDrawn(rendererOrGl, done, limit) {
    if (typeof done !== 'function') return;
    var gl = getGl(rendererOrGl);
    var maxMs = limit != null ? limit : 5000;
    if (!gl || (gl.isContextLost && gl.isContextLost())) { done(); return; }
    var t0 = nowMs(), sync = null;
    if (typeof gl.fenceSync === 'function') {
      try {
        sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (typeof gl.flush === 'function') gl.flush();
      } catch (e) { sync = null; }
      (function poll() {
        var fin = !sync || nowMs() - t0 > maxMs || syncSignaled(gl, sync);
        if (!fin) { setTimeout(poll, 16); return; }
        deleteSync(gl, sync);
        done();
      })();
      return;
    }
    try { if (typeof gl.finish === 'function') gl.finish(); } catch (e) { /* ignore */ }
    done();
  }

  function pacer(rendererOrGl, opts) {
    opts = opts || NO;
    var gl = getGl(rendererOrGl);
    var hasFence = !!(gl && typeof gl.fenceSync === 'function');
    var soft = opts.software != null ? !!opts.software : (gl ? isSoftware(gl) : isSoftware());
    var active = opts.enabled != null ? !!opts.enabled : soft;
    var maxWait = opts.maxWait != null ? opts.maxWait : 1000;
    var maxBusy = opts.maxBusy != null ? opts.maxBusy : 500;
    var duty = opts.duty != null ? opts.duty : 2;
    var always = !!opts.always;
    var sync = null, t0 = 0, busy = 0;

    return {
      get active() { return active; },
      mayDraw: function (now, playing) {
        if (!active || !gl || (!always && playing)) return true;
        var t = now != null ? now : nowMs();
        if (sync) {
          if (!syncSignaled(gl, sync) && t - t0 < maxWait) return false;
          deleteSync(gl, sync);
          sync = null;
          busy = Math.min(maxBusy, Math.max(0, t - t0));
        }
        return t - t0 >= busy * duty;
      },
      markDrawn: function () {
        if (!active || !gl) return;
        if (hasFence) {
          try {
            deleteSync(gl, sync);
            sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            if (typeof gl.flush === 'function') gl.flush();
            t0 = nowMs();
          } catch (e) { sync = null; active = false; }
        } else {
          t0 = nowMs();
          try { if (typeof gl.finish === 'function') gl.finish(); } catch (e) { /* ignore */ }
          busy = Math.min(maxBusy, Math.max(0, nowMs() - t0));
        }
      },
      wait: function (timeoutMs) {
        if (!gl) return true;
        if (sync && typeof gl.clientWaitSync === 'function') {
          try {
            var res = gl.clientWaitSync(sync, gl.SYNC_FLUSH_COMMANDS_BIT || 0, timeoutMs > 0 ? timeoutMs : 0);
            if (res !== gl.TIMEOUT_EXPIRED) { deleteSync(gl, sync); sync = null; return true; }
            return false;
          } catch (e) { deleteSync(gl, sync); sync = null; return true; }
        }
        try { if (typeof gl.finish === 'function') gl.finish(); } catch (e) { /* ignore */ }
        return true;
      },
      whenDrawn: function (done, limit) { whenDrawn(gl, done, limit); },
      dispose: function () { deleteSync(gl, sync); sync = null; }
    };
  }

  function watchContext(canvas, opts) {
    opts = opts || NO;
    var lost = false;
    function getNotice() { return resolveEl(opts.notice); }
    function onLost(e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      lost = true;
      var n = getNotice();
      if (n) n.hidden = false;
      if (typeof opts.onLost === 'function') opts.onLost(e);
    }
    function onRestored(e) {
      lost = false;
      var n = getNotice();
      if (n) n.hidden = true;
      if (typeof opts.onRestored === 'function') opts.onRestored(e);
    }
    if (canvas && typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('webglcontextrestored', onRestored);
    }
    return {
      get lost() { return lost; },
      detach: function () {
        if (canvas && typeof canvas.removeEventListener === 'function') {
          canvas.removeEventListener('webglcontextlost', onLost);
          canvas.removeEventListener('webglcontextrestored', onRestored);
        }
      }
    };
  }

  function showNoGL(opts) {
    opts = opts || NO;
    var hide = opts.hide;
    if (hide) {
      var list = Array.isArray(hide) ? hide : [hide];
      for (var i = 0; i < list.length; i++) {
        var h = resolveEl(list[i]);
        if (h) h.hidden = true;
      }
    }
    var el = opts.el ? resolveEl(opts.el) : resolveEl('nogl');
    if (el) {
      el.hidden = false;
    } else {
      var d = doc();
      if (d && d.createElement && d.body) {
        el = resolveEl('sg-nogl');
        if (!el) {
          el = d.createElement('div');
          el.id = 'sg-nogl';
          el.className = 'sg-overlay';
          el.setAttribute('role', 'alert');
          var panel = d.createElement('div');
          panel.className = 'sg-panel';
          var title = d.createElement('h1');
          title.className = 'sg-title';
          title.textContent = opts.title || 'عذرًا!';
          var sub = d.createElement('p');
          sub.className = 'sg-sub';
          sub.textContent = opts.message || 'هذا الجهاز لا يدعم الرسوم ثلاثية الأبعاد.';
          panel.appendChild(title);
          panel.appendChild(sub);
          el.appendChild(panel);
          d.body.appendChild(el);
        }
        el.hidden = false;
      }
    }
    if (opts.callFail && Kit.fail) Kit.fail(opts.error || 'WebGL is unavailable');
    return el;
  }

  function boot(fn, opts) {
    opts = opts || NO;
    var started = false, cancelled = false, rafId = 0, innerTimer = 0, fallbackTimer = 0;
    var fallbackMs = opts.fallbackMs == null ? 80 : opts.fallbackMs;
    function run() {
      if (started || cancelled) return;
      if (typeof opts.guard === 'function' && !opts.guard()) return;
      started = true;
      clearTimeout(innerTimer);
      clearTimeout(fallbackTimer);
      try {
        fn();
      } catch (err) {
        if (typeof opts.onError === 'function') opts.onError(err);
        else if (Kit.fail) Kit.fail(err);
      }
    }
    if (typeof W.requestAnimationFrame === 'function') {
      rafId = W.requestAnimationFrame(function () {
        if (!started && !cancelled) innerTimer = setTimeout(run, 0);
      });
    }
    if (fallbackMs >= 0) fallbackTimer = setTimeout(run, fallbackMs);
    return {
      run: run,
      cancel: function () {
        cancelled = true;
        if (rafId && typeof W.cancelAnimationFrame === 'function') W.cancelAnimationFrame(rafId);
        clearTimeout(innerTimer);
        clearTimeout(fallbackTimer);
      }
    };
  }

  function createRenderer(canvas, opts) {
    opts = opts || NO;
    var T = W.THREE;
    if (!T || !T.WebGLRenderer) {
      if (opts.noGL) { showNoGL(typeof opts.noGL === 'object' ? opts.noGL : NO); return null; }
      throw new Error('three.js is unavailable');
    }
    var software = opts.software != null ? !!opts.software : isSoftware();
    var light = !!(opts.light || (opts.gfx && opts.gfx.light));
    var ratio = pixelRatio({
      software: software, light: light, low: opts.low,
      min: opts.min, max: opts.max, softRatio: opts.softRatio,
      lightScale: opts.lightScale, lowRatio: opts.lowRatio
    });
    var renderer = null;
    try {
      var params = {
        canvas: canvas,
        antialias: opts.antialias != null ? !!opts.antialias : !(software || light || opts.low),
        powerPreference: opts.powerPreference || 'high-performance'
      };
      if (opts.alpha != null) params.alpha = !!opts.alpha;
      if (opts.preserveDrawingBuffer != null) params.preserveDrawingBuffer = !!opts.preserveDrawingBuffer;
      renderer = new T.WebGLRenderer(params);
    } catch (err) {
      if (opts.noGL) { showNoGL(typeof opts.noGL === 'object' ? opts.noGL : NO); return null; }
      throw err;
    }
    renderer.setPixelRatio(ratio);
    if (opts.srgb && T.SRGBColorSpace && renderer.outputColorSpace !== undefined) {
      renderer.outputColorSpace = T.SRGBColorSpace;
    }
    return { renderer: renderer, gl: renderer.getContext(), software: software, ratio: ratio };
  }

  Kit.webgl = {
    probe: probe,
    isSoftware: isSoftware,
    pixelRatio: pixelRatio,
    pacer: pacer,
    whenDrawn: whenDrawn,
    watchContext: watchContext,
    showNoGL: showNoGL,
    boot: boot,
    createRenderer: createRenderer
  };
})();

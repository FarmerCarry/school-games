/*
 * Art kit — commercial-looking drawing helpers for ألعاب الفسحة (Kit.art).
 * Classic script, no modules. Load it AFTER shared/kit.js:
 *   <script src="../../shared/kit.js"></script>
 *   <script src="../../shared/artkit.js"></script>
 *
 * Opt-in: nothing runs at load, and no style applies until Kit.art.init().
 * A page that never calls init looks exactly as it does today.
 * Gameplay, scoring and the game's random stream stay untouched. Visuals use
 * Kit.art.rand() (mulberry32). Hit-stop freezes art timers only; update(dt)
 * from Kit.loop is never changed. Version 1 is additive only.
 *
 *   Kit.art.init({ canvas, ctx, mode:'2d'|'webgl', theme? })
 *   Kit.art.pal / shade(hex,amt) / ramp(a,b,n)
 *   Kit.art.round / blob / outlined / gloss / shadow
 *   Kit.art.sprite / blit / bake / glow / vignette / sky / layer
 *   Kit.art.fx / shake / hitstop / spring / blink / tween / ease / pop / flash
 *   Kit.art.texture / three.pixelRatio / three.lights / three.blobShadow
 *   Kit.art.quality.tier / quality.on(fn) / quality.frame(ms)
 *   Kit.art.loop(update, render) / Kit.art.rand()
 *   Kit.art.blink() returns 0..1 (shared eyelid). Pass a plain object to keep
 *   a separate timer per character: Kit.art.blink(hero) each frame.
 *   Kit.art.tween(...) returns { v, done, update(dt) }.
 *   Kit.art.fx(cap) returns { burst, update, draw }.
 *   Kit.art.pop(text, x, y, opts) plus pop.update(dt) and pop.draw(ctx).
 *   Kit.art.flash(color, ms) plus flash.update(dt) and flash.draw(ctx, w, h).
 *   Kit.art.layer(sprite, factor) returns { draw(ctx, camX, camY) }.
 */
(function () {
  'use strict';
  var W = window, Kit = W.Kit;
  if (!Kit || Kit.art) return;

  var art = { version: 1 };
  var ready = false, tier = 2, startTier = 2, themeName = 'day';
  var viewCanvas = null, fitView = null, fitWrapped = false, bucket = 1;
  var cache = new Map(), pixels = 0, tinted = new Map();
  var t0 = 0, ema = null, badSince = 0, goodSince = 0, lastUp = -1e15;
  var listeners = [], layerCount = 0;
  var hitUntil = 0, fl = { t: 0, ms: 0, color: '#fff', last: -1e15 };
  var slots = null, sh = { x: 0, y: 0, trauma: 0 };
  var COLORS = [], shadeCache = Object.create(null);
  var shadowGeo = null, shadowMat = null, texCache = new Map();
  var rng = 0x6d2b79f5;
  var NO = {};
  var THEMES = {
    day: ['#8fd4ff', '#fff3c4'],
    night: ['#14122e', '#3c2d6e'],
    neon: ['#160820', '#3d1466'],
    candy: ['#ffd0ea', '#c9f2ff']
  };
  var CSS = 'html[data-sg-art] .sg-btn{font-family:var(--sg-font);border:3px solid #1b1640;border-radius:18px;padding-block:12px;padding-inline:28px;min-block-size:48px;background-image:linear-gradient(#fff6,#0000 46%);box-shadow:inset 0 3px 0 #fff8,0 4px 0 #1b1640}' +
    'html[data-sg-art] .sg-btn:active{transform:translateY(4px);box-shadow:inset 0 2px 0 #fff6}' +
    'html[data-sg-art] .sg-btn.secondary{background:#fff;color:#1b1640}' +
    'html[data-sg-art] .sg-btn.good{background:var(--sg-good);color:#07351c}' +
    'html[data-sg-art] .sg-panel{border:3px solid #1b1640;border-radius:28px;background-image:linear-gradient(#fff7,#0000 30%);box-shadow:inset 0 4px 0 #fff8,0 8px 0 #1b164055}' +
    'html[data-sg-art] .sg-title{background:linear-gradient(#fff,#ffcc00);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:3px #1b1640;paint-order:stroke fill}' +
    'html[data-sg-art] .sg-key{font-family:var(--sg-font);border:3px solid #1b1640;border-radius:10px;box-shadow:inset 0 2px 0 #fff,0 4px 0 #1b1640}' +
    'html[data-sg-art] .sg-overlay{animation:sg-art-in .34s cubic-bezier(.34,1.56,.64,1);backdrop-filter:blur(6px)}' +
    '@keyframes sg-art-in{from{transform:scale(.86)}to{transform:none}}' +
    'html[data-sg-art="0"] .sg-btn,html[data-sg-art="0"] .sg-panel,html[data-sg-art="0"] .sg-key,html[data-sg-art="0"] .sg-overlay{box-shadow:0 4px 0 #1b1640;backdrop-filter:none}' +
    'html[data-sg-motion="reduce"][data-sg-art] .sg-overlay{animation:none}';

  function perf() {
    var p = W.performance;
    return p && p.now ? p.now() : Date.now();
  }
  function reduced() { return !!(Kit.motion && Kit.motion.reduced && Kit.motion.reduced()); }
  function frozen() { return ready && !reduced() && perf() < hitUntil; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function doc() { return W.document; }

  art.rand = function () {
    rng |= 0;
    rng = rng + 0x6d2b79f5 | 0;
    var t = Math.imul(rng ^ rng >>> 15, 1 | rng);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  art.pal = Object.freeze({
    ink: '#1b1640',
    sky: '#7ec8ff', skyDeep: '#2f6fe0',
    grass: '#3ecf6e', grassDeep: '#1f9a4a',
    gold: '#ffcc00', good: '#3ddc84', bad: '#ff5470',
    team: Object.freeze(['#0072B2', '#E69F00', '#009E73', '#CC79A7']),
    ui: '#fff7ea', uiInk: '#1b1640', uiSoft: '#ffe3b0'
  });
  art.theme = 'day';

  function hexToRgb(hex) {
    var h = String(hex || ''), n;
    if (h.charAt(0) === '#') h = h.slice(1);
    n = parseInt(h, 16);
    if (h.length !== 6 || n !== n) return null;
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  art.shade = function (hex, amt) {
    amt = clamp(+amt || 0, -1, 1);
    amt = Math.round(amt * 50) / 50;
    var key = hex + ':' + amt, hit = shadeCache[key], rgb, i, f;
    if (hit) return hit;
    rgb = hexToRgb(hex);
    if (!rgb) return hex;
    if (amt < 0) { f = 1 + amt; for (i = 0; i < 3; i++) rgb[i] = rgb[i] * f | 0; }
    else for (i = 0; i < 3; i++) rgb[i] = rgb[i] + (255 - rgb[i]) * amt | 0;
    hit = rgbToHex(rgb[0], rgb[1], rgb[2]);
    shadeCache[key] = hit;
    return hit;
  };
  function mix(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    if (!A || !B) return t < 0.5 ? a : b;
    return rgbToHex(A[0] + (B[0] - A[0]) * t | 0, A[1] + (B[1] - A[1]) * t | 0, A[2] + (B[2] - A[2]) * t | 0);
  }
  art.ramp = function (a, b, n) {
    var out = [], i, t;
    n = n | 0;
    if (n < 1) return out;
    for (i = 0; i < n; i++) {
      t = n === 1 ? 0 : i / (n - 1);
      out.push(mix(a, b, t));
    }
    return out;
  };
  art.stops = function () { return THEMES[themeName] || THEMES.day; };

  function makeCanvas(w, h) {
    var Ctor = W.OffscreenCanvas, c = null;
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (typeof Ctor === 'function') { try { c = new Ctor(w, h); } catch (e) { c = null; } }
    if (!c) c = doc().createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function currentBucket() {
    var dpr = W.devicePixelRatio || 1, scale = fitView && fitView.scale ? fitView.scale : 1;
    return Math.round(dpr * scale * 4) / 4 || 1;
  }
  function clearCache() { cache.clear(); tinted.clear(); pixels = 0; }
  function syncBucket() {
    var b = currentBucket();
    if (b !== bucket) { bucket = b; clearCache(); }
  }
  function capPixels() { return tier === 0 ? 8000000 : 16000000; }
  function evict() {
    var cap = capPixels(), first, old;
    while (pixels > cap && cache.size) {
      first = cache.keys().next().value;
      old = cache.get(first);
      cache.delete(first);
      pixels -= old.area;
    }
  }
  function sprite(key, w, h, draw, opt) {
    var pad, sc, bw, bh, id, hit, cnv, c, area, rec;
    if (!ready) return { canvas: null, w: w | 0, h: h | 0, ox: 0, oy: 0 };
    syncBucket();
    opt = opt || NO;
    pad = opt.pad || 0;
    sc = opt.scale || bucket || 1;
    bw = Math.max(1, Math.round(w)); bh = Math.max(1, Math.round(h));
    id = key + '@' + bw + 'x' + bh + '@' + sc;
    hit = cache.get(id);
    if (hit) { cache.delete(id); cache.set(id, hit); return hit; }
    cnv = makeCanvas(Math.ceil((bw + pad * 2) * sc), Math.ceil((bh + pad * 2) * sc));
    c = cnv.getContext('2d');
    if (c) {
      if (c.setTransform) c.setTransform(sc, 0, 0, sc, pad * sc, pad * sc);
      c.lineJoin = 'round'; c.lineCap = 'round';
      draw(c, bw, bh);
    }
    area = cnv.width * cnv.height;
    rec = { canvas: cnv, w: bw, h: bh, ox: pad, oy: pad, area: area };
    pixels += area;
    cache.set(id, rec);
    evict();
    return rec;
  }
  art.sprite = sprite;
  art.bake = function (key, w, h, draw) { return sprite('bake:' + key, w, h, draw); };
  art.blit = function (ctx, s, x, y, o) {
    if (!ctx || !s || !s.canvas) return;
    o = o || NO;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.sx != null || o.sy != null) ctx.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
    ctx.drawImage(s.canvas, -(s.w / 2 + s.ox), -(s.h / 2 + s.oy), s.w + s.ox * 2, s.h + s.oy * 2);
    ctx.restore();
  };

  art.round = function (ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  art.blob = function (ctx, x, y, r, wobble, phase) {
    var n = 10, i, a, rr, px, py;
    wobble = wobble || 0; phase = phase || 0;
    ctx.beginPath();
    for (i = 0; i <= n; i++) {
      a = i / n * 6.2831853;
      rr = r * (1 + wobble * Math.sin(a * 3 + phase));
      px = x + Math.cos(a) * rr; py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  function lineScale(ctx) {
    var dpr = W.devicePixelRatio || 1, a = 1, s;
    try { if (ctx.getTransform) a = ctx.getTransform().a || 1; } catch (e) { /* identity */ }
    s = dpr / a;
    return s > 0 && s < 8 ? s : 1;
  }
  art.outlined = function (ctx, fill, lineW) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = art.pal.ink;
    ctx.lineWidth = (lineW || 3) * lineScale(ctx);
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  function rad(key, w, h, c0, c1, a, b) {
    return sprite(key, w, h, function (c, sw, sh) {
      var g = c.createRadialGradient(sw / 2, sh / 2, sw * a, sw / 2, sh / 2, sw * b);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      c.fillStyle = g; c.fillRect(0, 0, sw, sh);
    });
  }
  function lin(key, w, h, stops) {
    return sprite(key, w, h, function (c, sw, sh) {
      var g = c.createLinearGradient(0, 0, 0, sh), i, n = stops.length;
      for (i = 0; i < n; i++) g.addColorStop(n < 2 ? 0 : i / (n - 1), stops[i]);
      c.fillStyle = g; c.fillRect(0, 0, sw, sh);
    });
  }
  art.gloss = function (ctx, x, y, w, h) {
    var s;
    if (!ready || !ctx) return;
    s = lin('gloss', 32, 16, ['rgba(255,255,255,.75)', 'rgba(255,255,255,0)']);
    if (!s.canvas) return;
    ctx.drawImage(s.canvas, x, y, w, h * 0.46);
  };
  art.shadow = function (ctx, x, y, w, h, alpha) {
    var s, prev;
    if (!ready || !ctx) return;
    s = rad('shadow', 64, 32, 'rgba(27,22,64,.5)', 'rgba(27,22,64,0)', 0.02, 0.5);
    if (!s.canvas) return;
    prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * (alpha == null ? 0.55 : alpha);
    ctx.drawImage(s.canvas, x - w * 0.08, y + h * 0.72, w * 1.16, Math.max(8, h * 0.28));
    ctx.globalAlpha = prev;
  };
  art.glow = function (color, radius) {
    radius = Math.max(4, radius | 0 || 32);
    if (!ready) return { canvas: null, w: 0, h: 0, ox: 0, oy: 0 };
    if (tier === 0) {
      return sprite('flat:' + color, radius, radius, function (c, w, h) {
        c.fillStyle = color; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 6.2831853); c.fill();
      });
    }
    return rad('glow:' + color + ':' + radius, radius * 2, radius * 2, color, 'rgba(0,0,0,0)', 0, 0.5);
  };
  art.vignette = function (ctx, w, h, strength) {
    var s;
    if (!ready || !ctx || tier === 0) return;
    strength = strength == null ? 0.45 : strength;
    s = rad('vig:' + strength, 128, 128, 'rgba(0,0,0,0)', 'rgba(10,8,30,' + strength + ')', 0.28, 0.72);
    if (s.canvas) ctx.drawImage(s.canvas, 0, 0, w, h);
  };
  art.sky = function (key, w, h, stops) {
    if (!stops || stops.length < 2) stops = ['#7ec8ff', '#fff3c4'];
    return lin('sky:' + key, w, h, stops);
  };
  art.layer = function (s, factor) {
    var index = layerCount++, heldX = 0, heldY = 0, has = false;
    return {
      draw: function (ctx, camX, camY) {
        var f, w, h, ox, oy, x0, y0, x, y;
        if (!ctx || !s || !s.canvas) return;
        if (tier === 0 && index > 0) return;
        if (tier === 1 && index > 1) return;
        f = factor || 0;
        if (tier === 0 || reduced()) f = 0;
        if (frozen() && has) { camX = heldX; camY = heldY; }
        else { heldX = camX; heldY = camY; has = true; }
        w = s.w; h = s.h;
        ox = ((-camX * f) % w + w) % w;
        oy = ((-camY * f) % h + h) % h;
        x0 = ox - w; y0 = oy - h;
        for (y = 0; y < 2; y++) for (x = 0; x < 2; x++) ctx.drawImage(s.canvas, x0 + x * w, y0 + y * h, w, h);
      }
    };
  };

  function shapePath(c, kind, w, h) {
    var cx = w / 2, cy = h / 2, i, a, p;
    c.beginPath();
    if (kind === 1) {
      for (i = 0; i < 10; i++) {
        a = -1.5708 + i * 0.62832;
        p = i % 2 ? cx * 0.42 : cx * 0.92;
        if (i) c.lineTo(cx + Math.cos(a) * p, cy + Math.sin(a) * p);
        else c.moveTo(cx + Math.cos(a) * p, cy + Math.sin(a) * p);
      }
      c.closePath();
    } else if (kind === 2) c.rect(w * 0.2, h * 0.32, w * 0.6, h * 0.28);
    else if (kind === 3) { c.rect(cx - 1, 1, 2, h - 2); c.rect(1, cy - 1, w - 2, 2); }
    else c.arc(cx, cy, kind === 4 ? cx * 0.78 : cx * 0.62, 0, 6.2831853);
  }
  function tintedShape(kind, color) {
    var id = kind + ':' + color, hit = tinted.get(id);
    if (hit) return hit;
    hit = sprite('pt:' + id, 16, 16, function (c, w, h) {
      c.fillStyle = color;
      shapePath(c, kind, w, h);
      c.fill();
    });
    tinted.set(id, hit);
    return hit;
  }
  function colorIndex(color) {
    var i = COLORS.indexOf(color);
    if (i < 0) { i = COLORS.length; COLORS.push(color); }
    return i;
  }
  function particleCap() {
    var n = tier <= 0 ? 60 : tier === 1 ? 250 : 600;
    if (reduced()) n = 60;
    return n;
  }
  art.fx = function (maxCap) {
    var N = Math.max(1, Math.min(600, maxCap || 600));
    var S = 9, buf = new Float32Array(N * S), n = 0;
    function limit() { return Math.min(N, particleCap()); }
    return {
      burst: function (x, y, o) {
        var count, life, speed, size, shape, ci, fade, i, a, sp, k, lim;
        if (!ready) return;
        o = o || NO;
        lim = limit();
        count = o.n || 8;
        life = o.life || 0.6;
        speed = o.speed || 180;
        size = o.size || 6;
        shape = o.shape === 'star' ? 1 : o.shape === 'confetti' ? 2 : o.shape === 'spark' ? 3 : o.shape === 'smoke' ? 4 : 0;
        ci = colorIndex(o.color || '#fff');
        fade = reduced();
        for (i = 0; i < count && n < lim; i++) {
          a = art.rand() * 6.2831853;
          sp = fade ? 0 : speed * (0.45 + art.rand() * 0.7);
          k = n * S;
          buf[k] = x; buf[k + 1] = y;
          buf[k + 2] = Math.cos(a) * sp; buf[k + 3] = Math.sin(a) * sp;
          buf[k + 4] = life * (0.6 + art.rand() * 0.5); buf[k + 5] = life;
          buf[k + 6] = size * (0.6 + art.rand() * 0.7); buf[k + 7] = shape; buf[k + 8] = ci;
          n++;
        }
      },
      update: function (dt) {
        var lim, i, k, life;
        if (!ready || frozen()) return;
        lim = limit();
        while (n > lim) n--;
        for (i = 0; i < n; i++) {
          k = i * S;
          life = buf[k + 4] - dt;
          if (life <= 0) {
            n--;
            if (i < n) buf.copyWithin(k, n * S, n * S + S);
            i--;
            continue;
          }
          if (reduced()) { buf[k + 2] = 0; buf[k + 3] = 0; }
          buf[k + 4] = life;
          buf[k] += buf[k + 2] * dt;
          buf[k + 1] += buf[k + 3] * dt;
        }
      },
      draw: function (ctx) {
        var i, k, a, size, spr, prev;
        if (!ready || !ctx) return;
        prev = ctx.globalAlpha;
        for (i = 0; i < n; i++) {
          k = i * S;
          a = buf[k + 5] ? buf[k + 4] / buf[k + 5] : 0;
          if (a <= 0) continue;
          spr = tintedShape(buf[k + 7], COLORS[buf[k + 8] | 0] || '#fff');
          if (!spr.canvas) continue;
          size = buf[k + 6];
          ctx.globalAlpha = prev * (a > 1 ? 1 : a);
          ctx.drawImage(spr.canvas, buf[k] - size / 2, buf[k + 1] - size / 2, size, size);
        }
        ctx.globalAlpha = prev;
      }
    };
  };

  art.shake = {
    add: function (v) {
      if (!ready || reduced()) return;
      v = clamp(+v || 0, 0, 1);
      sh.trauma = Math.min(0.6, sh.trauma + v);
    },
    update: function (dt) {
      var mag, a;
      if (!ready || reduced()) { sh.trauma = sh.x = sh.y = 0; return; }
      if (frozen()) return;
      sh.trauma = Math.max(0, sh.trauma - dt / 0.4);
      mag = sh.trauma * sh.trauma * 14;
      a = art.rand() * 6.2831853;
      sh.x = Math.cos(a) * mag;
      sh.y = Math.sin(a) * mag;
    },
    apply: function (ctx) {
      if (ctx && (sh.x || sh.y)) ctx.translate(sh.x, sh.y);
    }
  };
  art.hitstop = function (ms) {
    var t;
    if (!ready || reduced()) return;
    ms = clamp(+ms || 0, 0, 400);
    t = perf() + ms;
    if (t > hitUntil) hitUntil = t;
  };
  art.spring = function (k, damp) {
    var o = { sx: 1, sy: 1, v: 0 };
    k = k || 220;
    damp = damp == null ? 14 : damp;
    o.kick = function (v) {
      if (!ready) return;
      if (reduced()) { o.sx = o.sy = 1; o.v = 0; return; }
      o.v += +v || 0;
    };
    o.update = function (dt) {
      if (!ready) return;
      if (reduced()) { o.sx = o.sy = 1; o.v = 0; return; }
      if (frozen()) return;
      o.v += (1 - o.sy) * k * dt;
      o.v *= Math.exp(-damp * dt);
      o.sy += o.v * dt;
      if (o.sy < 0.35) o.sy = 0.35;
      o.sx = 1 / Math.sqrt(o.sy);
    };
    return o;
  };
  var blinkShared = { on: false };
  art.blink = function (slot) {
    var s = slot || blinkShared, now, dt, left;
    if (!ready || reduced()) return 0;
    if (!s.on) { s.on = true; s.t = 0; s.next = 2 + art.rand() * 3; s.v = 0; s.then = 0; }
    now = perf();
    if (s.then) {
      dt = (now - s.then) / 1000;
      if (dt > 0 && dt < 0.25 && !frozen()) {
        s.t += dt;
        if (s.t >= s.next) { s.t = 0; s.next = 2 + art.rand() * 3; }
        left = s.next - s.t;
        s.v = left < 0.14 ? Math.sin((1 - left / 0.14) * 3.14159265) : 0;
      }
    }
    s.then = now;
    return s.v || 0;
  };

  art.ease = {
    outQuad: function (t) { return t * (2 - t); },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    outBack: function (t) { var c = 1.70158; return 1 + (t - 1) * (t - 1) * ((c + 1) * (t - 1) + c); },
    outElastic: function (t) {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * 6.2831853 / 0.3) + 1;
    }
  };
  art.tween = function (from, to, ms, easeFn) {
    var o = { v: from, done: false, u: 0 }, dur = (ms || 1) / 1000;
    easeFn = easeFn || art.ease.outQuad;
    o.update = function (dt) {
      if (reduced()) { o.u = 1; o.v = to; o.done = true; return o.v; }
      if (frozen()) return o.v;
      o.u = dur > 0 ? Math.min(1, o.u + dt / dur) : 1;
      o.done = o.u >= 1;
      o.v = from + (to - from) * easeFn(o.u);
      return o.v;
    };
    return o;
  };

  function ensurePops() {
    var i;
    if (slots) return;
    slots = [];
    for (i = 0; i < 24; i++) slots.push({ text: '', x: 0, y: 0, life: 0, max: 0.8, color: '#fff', size: 28 });
  }
  function pop(text, x, y, o) {
    var i, p = null;
    if (!ready) return;
    ensurePops();
    o = o || NO;
    for (i = 0; i < slots.length; i++) if (slots[i].life <= 0) { p = slots[i]; break; }
    if (!p) p = slots[0];
    p.text = String(text);
    p.x = x; p.y = y;
    p.max = 0.8; p.life = 0.8;
    p.color = o.color || '#fff';
    p.size = o.size || 28;
  }
  pop.update = function (dt) {
    var i, p;
    if (!slots || frozen()) return;
    for (i = 0; i < slots.length; i++) {
      p = slots[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (!reduced()) p.y -= 46 * dt;
    }
  };
  pop.draw = function (ctx) {
    var i, p, a, prev;
    if (!slots || !ctx) return;
    prev = ctx.globalAlpha;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (i = 0; i < slots.length; i++) {
      p = slots[i];
      if (p.life <= 0) continue;
      a = p.life / p.max;
      ctx.globalAlpha = prev * (a > 1 ? 1 : a);
      ctx.font = '700 ' + (p.size | 0) + 'px Fredoka';
      ctx.lineWidth = 4;
      ctx.strokeStyle = art.pal.ink;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
    ctx.globalAlpha = prev;
  };
  art.pop = pop;

  function flash(color, ms) {
    var now;
    if (!ready || reduced()) return;
    now = perf();
    if (now - fl.last < 334) return;
    fl.last = now;
    fl.color = color || '#ffffff';
    fl.ms = clamp(+ms || 140, 40, 400);
    fl.t = fl.ms;
  }
  flash.update = function (dt) {
    if (frozen() || fl.t <= 0) return;
    fl.t -= dt * 1000;
    if (fl.t < 0) fl.t = 0;
  };
  flash.draw = function (ctx, w, h) {
    var a;
    if (!ctx || fl.t <= 0 || reduced()) return;
    a = 0.4 * (fl.t / fl.ms);
    if (a > 0.4) a = 0.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.fillStyle = fl.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };
  art.flash = flash;

  art.texture = function (key, w, h, draw) {
    var s = sprite('tex:' + key, w, h, draw), THREE = W.THREE, id, tex;
    if (!THREE || !s.canvas) return s;
    id = key + ':' + s.canvas.width + 'x' + s.canvas.height;
    if (texCache.has(id)) return texCache.get(id);
    tex = new THREE.CanvasTexture(s.canvas);
    tex.needsUpdate = true;
    texCache.set(id, tex);
    return tex;
  };
  art.three = {
    pixelRatio: function () {
      var caps = [0.75, 1, 1.5], dpr = W.devicePixelRatio || 1;
      return Math.min(dpr, caps[tier] == null ? 1 : caps[tier]);
    },
    lights: function (scene, opt) {
      var THREE = W.THREE, hemi, sun;
      if (!THREE || !scene || !scene.add) return null;
      opt = opt || NO;
      hemi = new THREE.HemisphereLight(opt.sky == null ? 0xb7d4ff : opt.sky, opt.ground == null ? 0x3d6b3a : opt.ground, 0.85);
      sun = new THREE.DirectionalLight(opt.sun == null ? 0xfff4d0 : opt.sun, 0.9);
      sun.position.set(30, 60, 20);
      sun.castShadow = tier > 0;
      scene.add(hemi);
      scene.add(sun);
      return { hemi: hemi, sun: sun };
    },
    blobShadow: function () {
      var THREE = W.THREE, s, map, mesh;
      s = rad('blobshadow', 64, 64, 'rgba(0,0,0,.45)', 'rgba(0,0,0,0)', 0.03, 0.5);
      if (!THREE || !s.canvas) return s;
      if (!shadowGeo) {
        map = new THREE.CanvasTexture(s.canvas);
        shadowGeo = new THREE.PlaneGeometry(1, 1);
        shadowMat = new THREE.MeshBasicMaterial({ map: map, transparent: true, depthWrite: false });
      }
      mesh = new THREE.Mesh(shadowGeo, shadowMat);
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    }
  };

  function paintTier() {
    var el = doc() && doc().documentElement;
    if (el && el.setAttribute) el.setAttribute('data-sg-art', String(tier));
  }
  function setTier(n) {
    n = n < 0 ? 0 : n > 2 ? 2 : n;
    if (n === tier) return;
    tier = n;
    paintTier();
    clearCache();
    try { Kit.store('art').set('tier', n); } catch (e) { /* art, not progress */ }
    for (var i = 0; i < listeners.length; i++) listeners[i](tier);
  }
  function weak() {
    var n = W.navigator, c, m;
    if (!n) return false;
    c = n.hardwareConcurrency; m = n.deviceMemory;
    return (typeof c === 'number' && c <= 2) || (typeof m === 'number' && m <= 2);
  }
  art.quality = {
    get tier() { return tier; },
    on: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    },
    frame: function (ms) {
      var now;
      if (!ready) return;
      now = perf();
      if (now - t0 < 3000) return;
      if (doc() && doc().hidden) return;
      if (!(ms > 0) || ms > 250) { badSince = 0; goodSince = 0; ema = null; return; }
      ema = ema == null ? ms : ema * 0.9 + ms * 0.1;
      if (ema > 22) {
        goodSince = 0;
        if (!badSince) badSince = now;
        else if (now - badSince >= 2000 && tier > 0) { setTier(tier - 1); badSince = now; }
      } else if (ema < 14) {
        badSince = 0;
        if (!goodSince) goodSince = now;
        else if (now - goodSince >= 8000 && now - lastUp >= 20000 && tier < startTier) {
          setTier(tier + 1); lastUp = now; goodSince = now;
        }
      } else { badSince = 0; goodSince = 0; }
    }
  };

  art.loop = function (update, render, opts) {
    var last = 0, seen = false;
    return Kit.loop(update, function (alpha) {
      var now = perf();
      if (seen) art.quality.frame(now - last);
      seen = true;
      last = now;
      if (render) render(alpha);
    }, opts);
  };

  function inject() {
    var d = doc(), s;
    if (!d || !d.createElement) return;
    if (d.getElementById && d.getElementById('sg-art')) return;
    s = d.createElement('style');
    s.id = 'sg-art';
    s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }
  art.init = function (opt) {
    var saved, fonts;
    opt = opt || NO;
    viewCanvas = opt.canvas || viewCanvas;
    if (opt.theme && THEMES[opt.theme]) { themeName = opt.theme; art.theme = opt.theme; }
    inject();
    if (!ready) {
      ready = true;
      try { saved = Kit.store('art').get('tier'); } catch (e) { saved = null; }
      startTier = saved === 0 || saved === 1 || saved === 2 ? saved : weak() ? 1 : 2;
      tier = startTier;
      try { Kit.store('art').set('tier', tier); } catch (e) { /* ignore a full disk */ }
      t0 = perf();
      if (Kit.fit && !fitWrapped) {
        fitWrapped = true;
        var orig = Kit.fit;
        Kit.fit = function () {
          var view = orig.apply(this, arguments);
          fitView = view;
          syncBucket();
          return view;
        };
      }
      fonts = dFonts();
      if (fonts && fonts.ready && typeof fonts.ready.then === 'function') {
        fonts.ready.then(function () { clearCache(); }, function () {});
      }
    }
    paintTier();
    syncBucket();
  };
  function dFonts() { var d = doc(); return d ? d.fonts : null; }

  Kit.art = art;
})();

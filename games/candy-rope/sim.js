/*
 * Munch Rope - deterministic physics simulation (no DOM).
 * Loaded by the game (window.MunchSim) and by the Node level verifier
 * (module.exports). Everything runs at a fixed 60 steps per second with
 * SUB sub-steps, so a list of (frame, action) pairs always replays the same.
 *
 * Candy physics: position-based dynamics. Each live rope is an inequality
 * distance constraint (candy can never be further than rope.len from its pin).
 * The wiggly rope you see is a separate verlet chain pinned at both ends; it
 * only matters for drawing and for swipe-cut hit tests.
 */
(function (root) {
  'use strict';

  var W = 1280, H = 720, DT = 1 / 60, SUB = 4, ITER = 8, TAU = Math.PI * 2;
  var C = {
    W: W, H: H, DT: DT,
    GRAV: 1500,
    CANDY_R: 22,
    STAR_R: 48,          // candy centre -> star centre distance that collects it
    EAT_R: 64,           // candy centre -> Munch centre distance that feeds him
    BUBBLE_R: 46,        // catch distance for a bubble item
    BUB_RISE: -118,      // px/s rise speed inside a bubble
    PUFF_RANGE: 560,
    PUFF_CONE: 0.72,     // half angle (rad)
    PUFF_POWER: 640,
    BOUNCE_MIN: 850,
    SPIKE_PAD: 9,
    SEG: 16              // visual rope segment length
  };

  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function norm(o) {
    if (Array.isArray(o)) return { x: o[0], y: o[1] };
    var r = {}; for (var k in o) r[k] = o[k]; return r;
  }

  // Moving things: {move:{x2,y2,period,phase}} ping-pongs between (x,y) and (x2,y2);
  // {move:{cx,cy,r,period,phase,dir}} goes round a circle.
  function movePos(o, t) {
    var m = o.move;
    if (!m) return;
    if (m.cx != null) {
      var a = ((m.phase || 0) + (t / m.period) * (m.dir || 1)) * TAU;
      o.x = m.cx + Math.cos(a) * m.r; o.y = m.cy + Math.sin(a) * m.r;
    } else {
      var u = 0.5 - 0.5 * Math.cos(((t / m.period) + (m.phase || 0)) * TAU);
      o.x = o.x0 + (m.x2 - o.x0) * u; o.y = o.y0 + (m.y2 - o.y0) * u;
    }
  }

  function segEnds(o) {
    var a = o.a || 0, hw = o.w / 2, c = Math.cos(a), s = Math.sin(a);
    o.x1 = o.x - c * hw; o.y1 = o.y - s * hw; o.x2 = o.x + c * hw; o.y2 = o.y + s * hw;
    o.nx = s; o.ny = -c; // normal pointing "up" for a=0
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return dist(px, py, x1 + dx * t, y1 + dy * t);
  }

  function create(level, opts) {
    opts = opts || {};
    var w = {
      level: level, t: 0, frame: 0, visual: opts.visual !== false, events: [],
      state: 'play', reason: '', starsGot: 0, nearest: 1e9, actions: 0
    };
    w.candy = { x: level.candy[0], y: level.candy[1], vx: 0, vy: 0, r: C.CANDY_R, rot: 0, bubble: false, alive: true, bubbleT: 0 };
    w.munch = { x: level.munch[0], y: level.munch[1] };
    w.pins = []; w.ropes = []; w.pieces = [];
    (level.ropes || []).forEach(function (r, i) {
      var p = norm(r); p.x0 = p.x; p.y0 = p.y; p.key = 'p' + i; movePos(p, 0);
      w.pins.push(p);
      addRope(w, p.key, p, r.len || dist(p.x, p.y, w.candy.x, w.candy.y), true);
    });
    w.rings = (level.rings || []).map(function (g, i) {
      var p = norm(g); p.x0 = p.x; p.y0 = p.y; p.key = 'g' + i; p.used = false; movePos(p, 0); return p;
    });
    w.stars = (level.stars || []).map(function (s) { var p = norm(s); p.x0 = p.x; p.y0 = p.y; p.got = false; movePos(p, 0); return p; });
    w.bubbles = (level.bubbles || []).map(function (b) { var p = norm(b); p.x0 = p.x; p.y0 = p.y; p.used = false; movePos(p, 0); return p; });
    w.blowers = (level.blowers || []).map(function (b) {
      var p = norm(b); p.a = (p.a || 0) * Math.PI / 180; p.cool = 0; p.anim = 0; return p;
    });
    w.spikes = (level.spikes || []).map(function (s) {
      var p = norm(s); p.x0 = p.x; p.y0 = p.y; p.a0 = (p.a || 0) * Math.PI / 180; p.a = p.a0; movePos(p, 0); segEnds(p); return p;
    });
    w.tramps = (level.tramps || []).map(function (s) {
      var p = norm(s); p.a = (p.a || 0) * Math.PI / 180; p.anim = 0; segEnds(p); return p;
    });
    return w;
  }

  function addRope(w, key, anchor, len, settle) {
    var c = w.candy;
    var rope = { key: key, anchor: anchor, len: len, alive: true, pts: null, rest: 0 };
    if (w.visual) {
      var n = Math.max(4, Math.min(44, Math.round(len / C.SEG)));
      rope.rest = len / n;
      var pts = [];
      var d = dist(anchor.x, anchor.y, c.x, c.y);
      var slack = Math.max(0, len - d);
      for (var i = 0; i <= n; i++) {
        var u = i / n;
        var x = anchor.x + (c.x - anchor.x) * u;
        var y = anchor.y + (c.y - anchor.y) * u + Math.sin(u * Math.PI) * slack * 0.5;
        pts.push({ x: x, y: y, px: x, py: y });
      }
      rope.pts = pts;
      if (settle) for (var k = 0; k < 40; k++) chainStep(pts, rope.rest, anchor, c, 1);
    }
    w.ropes.push(rope);
    return rope;
  }

  // One verlet step for a visual chain. head/tail: objects with x,y to pin to (or null).
  function chainStep(pts, rest, head, tail, grav) {
    var n = pts.length, i, p;
    for (i = 0; i < n; i++) {
      p = pts[i];
      var vx = (p.x - p.px) * 0.975, vy = (p.y - p.py) * 0.975;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + 0.4 * grav;
    }
    for (var it = 0; it < 14; it++) {
      if (head) { pts[0].x = head.x; pts[0].y = head.y; }
      if (tail) { pts[n - 1].x = tail.x; pts[n - 1].y = tail.y; }
      for (i = 0; i < n - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var diff = (d - rest) / d;
        var wa = (i === 0 && head) ? 0 : 1, wb = (i + 1 === n - 1 && tail) ? 0 : 1;
        var s = wa + wb; if (!s) continue;
        dx *= diff; dy *= diff;
        a.x += dx * wa / s; a.y += dy * wa / s;
        b.x -= dx * wb / s; b.y -= dy * wb / s;
      }
    }
    if (head) { pts[0].x = head.x; pts[0].y = head.y; }
    if (tail) { pts[n - 1].x = tail.x; pts[n - 1].y = tail.y; }
  }

  function findRope(w, key) {
    for (var i = 0; i < w.ropes.length; i++) if (w.ropes[i].key === key && w.ropes[i].alive) return w.ropes[i];
    return null;
  }

  function emit(w, type, x, y, extra) {
    var e = { type: type, x: x, y: y };
    if (extra) for (var k in extra) e[k] = extra[k];
    w.events.push(e);
  }

  function dropRopes(w) {
    for (var i = w.ropes.length - 1; i >= 0; i--) cutRope(w, w.ropes[i], -1, true);
  }

  function cutRope(w, rope, seg, silent) {
    if (!rope.alive) return false;
    rope.alive = false;
    w.ropes.splice(w.ropes.indexOf(rope), 1);
    var cx = rope.anchor.x, cy = rope.anchor.y;
    if (w.visual && rope.pts) {
      var n = rope.pts.length;
      if (seg < 0 || seg > n - 2) seg = Math.floor((n - 1) / 2);
      var a = rope.pts.slice(0, seg + 1), b = rope.pts.slice(seg + 1);
      cx = (rope.pts[seg].x + rope.pts[seg + 1].x) / 2; cy = (rope.pts[seg].y + rope.pts[seg + 1].y) / 2;
      if (a.length >= 2) w.pieces.push({ pts: a, rest: rope.rest, head: rope.anchor, tail: null, life: 1.1 });
      if (b.length >= 2) w.pieces.push({ pts: b, rest: rope.rest, head: null, tail: w.candy.alive ? w.candy : null, life: silent ? 0.5 : 1.1 });
      if (w.pieces.length > 24) w.pieces.splice(0, w.pieces.length - 24);
    }
    if (!silent) { w.actions++; emit(w, 'cut', cx, cy, { key: rope.key }); }
    return true;
  }

  /* ------------------------------------------------------------ actions */
  function cut(w, key, seg) {
    if (w.state !== 'play') return false;
    var r = findRope(w, key);
    return r ? cutRope(w, r, seg == null ? -1 : seg, false) : false;
  }

  function pop(w) {
    var c = w.candy;
    if (w.state !== 'play' || !c.bubble) return false;
    c.bubble = false; w.actions++;
    emit(w, 'pop', c.x, c.y);
    return true;
  }

  function puff(w, i) {
    var b = w.blowers[i];
    if (!b || w.state !== 'play' || b.cool > 0) return false;
    b.cool = 0.14; b.anim = 1; w.actions++;
    var c = w.candy, dx = Math.cos(b.a), dy = Math.sin(b.a);
    var nx = b.x + dx * 34, ny = b.y + dy * 34;
    var ox = c.x - nx, oy = c.y - ny, d = Math.sqrt(ox * ox + oy * oy);
    var hit = false;
    if (c.alive && d < C.PUFF_RANGE) {
      var ang = d < 1 ? 0 : Math.acos(Math.max(-1, Math.min(1, (ox * dx + oy * dy) / d)));
      if (ang < C.PUFF_CONE || d < 50) {
        var f = C.PUFF_POWER * (1 - 0.55 * d / C.PUFF_RANGE) * (c.bubble ? 0.55 : 1);
        c.vx += dx * f; c.vy += dy * f; hit = true;
      }
    }
    emit(w, 'puff', nx, ny, { i: i, hit: hit, a: b.a });
    return true;
  }

  /* ------------------------------------------------------------ step */
  function step(w) {
    var h = DT / SUB, c = w.candy, i, j;
    for (var s = 0; s < SUB; s++) {
      w.t += h;
      for (i = 0; i < w.pins.length; i++) movePos(w.pins[i], w.t);
      for (i = 0; i < w.rings.length; i++) movePos(w.rings[i], w.t);
      for (i = 0; i < w.stars.length; i++) movePos(w.stars[i], w.t);
      for (i = 0; i < w.bubbles.length; i++) movePos(w.bubbles[i], w.t);
      for (i = 0; i < w.spikes.length; i++) {
        var sp = w.spikes[i];
        movePos(sp, w.t);
        if (sp.spin) sp.a = sp.a0 + sp.spin * Math.PI / 180 * w.t;
        segEnds(sp);
      }
      if (w.state !== 'play' || !c.alive) continue;

      // integrate
      if (c.bubble) {
        c.bubbleT += h;
        c.vx *= (1 - 0.9 * h);
        c.vy += (C.BUB_RISE - c.vy) * Math.min(1, 2.6 * h);
      } else {
        c.vy += C.GRAV * h;
        c.vx *= (1 - 0.04 * h); c.vy *= (1 - 0.04 * h);
      }
      var nx = c.x + c.vx * h, ny = c.y + c.vy * h;
      // rope constraints (candy can't be further than len from its pin)
      if (w.ropes.length) {
        for (var it = 0; it < ITER; it++) {
          var moved = false;
          for (j = 0; j < w.ropes.length; j++) {
            var r = w.ropes[j], a = r.anchor;
            var dx = nx - a.x, dy = ny - a.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d > r.len) { nx = a.x + dx * r.len / d; ny = a.y + dy * r.len / d; moved = true; }
          }
          if (!moved) break;
        }
      }
      c.vx = (nx - c.x) / h; c.vy = (ny - c.y) / h; c.x = nx; c.y = ny;
      c.rot += c.vx * h / c.r * 0.6;

      // trampolines
      for (i = 0; i < w.tramps.length; i++) {
        var tp = w.tramps[i];
        var rx = c.x - tp.x, ry = c.y - tp.y;
        var along = rx * Math.cos(tp.a) + ry * Math.sin(tp.a);
        var sd = rx * tp.nx + ry * tp.ny;
        if (Math.abs(along) < tp.w / 2 + c.r * 0.4 && sd < c.r + 6 && sd > -c.r) {
          var vn = c.vx * tp.nx + c.vy * tp.ny;
          if (vn < 0) {
            var out = Math.max(-vn * 0.95, C.BOUNCE_MIN);
            var tx = c.vx - tp.nx * vn, ty = c.vy - tp.ny * vn; // tangential part, partly kept
            c.vx = tp.nx * out + tx * 0.6; c.vy = tp.ny * out + ty * 0.6;
            c.x += tp.nx * (c.r + 6 - sd); c.y += tp.ny * (c.r + 6 - sd);
            tp.anim = 1;
            if (c.bubble) { c.bubble = false; emit(w, 'pop', c.x, c.y, { auto: true }); }
            emit(w, 'bounce', c.x, c.y, { i: i });
          }
        }
      }

      // rings
      for (i = 0; i < w.rings.length; i++) {
        var g = w.rings[i];
        if (!g.used && dist(c.x, c.y, g.x, g.y) <= g.r) {
          g.used = true;
          addRope(w, g.key, g, g.r, false);
          emit(w, 'attach', g.x, g.y, { key: g.key });
        }
      }
      // stars
      for (i = 0; i < w.stars.length; i++) {
        var st = w.stars[i];
        if (!st.got && dist(c.x, c.y, st.x, st.y) < C.STAR_R) {
          st.got = true; w.starsGot++;
          emit(w, 'star', st.x, st.y, { n: w.starsGot, i: i });
        }
      }
      // bubbles
      for (i = 0; i < w.bubbles.length; i++) {
        var bb = w.bubbles[i];
        if (!bb.used && dist(c.x, c.y, bb.x, bb.y) < C.BUBBLE_R) {
          bb.used = true;
          if (!c.bubble) { c.bubble = true; c.bubbleT = 0; c.vy *= 0.2; c.vx *= 0.3; }
          emit(w, 'bubble', bb.x, bb.y, { i: i });
        }
      }
      // spikes
      for (i = 0; i < w.spikes.length; i++) {
        var k = w.spikes[i];
        if (distToSeg(c.x, c.y, k.x1, k.y1, k.x2, k.y2) < c.r + C.SPIKE_PAD) {
          w.state = 'lost'; w.reason = 'spikes'; c.alive = false; c.bubble = false;
          dropRopes(w);
          emit(w, 'spike', c.x, c.y);
          break;
        }
      }
      if (w.state !== 'play') continue;
      // Munch
      var dm = dist(c.x, c.y, w.munch.x, w.munch.y);
      if (dm < w.nearest) w.nearest = dm;
      if (dm < C.EAT_R) {
        w.state = 'won'; c.alive = false; c.bubble = false;
        dropRopes(w);
        emit(w, 'eat', c.x, c.y);
        continue;
      }
      // out of the box
      if (c.y > H + 70 || c.x < -90 || c.x > W + 90 || c.y < -110) {
        w.state = 'lost'; w.reason = c.y < 0 ? 'float' : 'fell'; c.alive = false;
        dropRopes(w);
        emit(w, 'lost', c.x, c.y);
      }
    }
    for (i = 0; i < w.blowers.length; i++) {
      var bl = w.blowers[i];
      if (bl.cool > 0) bl.cool -= DT;
      if (bl.anim > 0) bl.anim = Math.max(0, bl.anim - DT * 4);
    }
    for (i = 0; i < w.tramps.length; i++) if (w.tramps[i].anim > 0) w.tramps[i].anim = Math.max(0, w.tramps[i].anim - DT * 3);
    w.frame++;
    if (w.visual) stepVisual(w);
  }

  function stepVisual(w) {
    var c = w.candy, i;
    for (i = 0; i < w.ropes.length; i++) { var r = w.ropes[i]; chainStep(r.pts, r.rest, r.anchor, c, 1); }
    for (i = w.pieces.length - 1; i >= 0; i--) {
      var p = w.pieces[i];
      p.life -= DT;
      if (p.life <= 0) { w.pieces.splice(i, 1); continue; }
      if (p.tail && !p.tail.alive) p.tail = null;
      chainStep(p.pts, p.rest, p.head, p.tail, 1);
    }
  }

  // Apply an action from a replay/solution list: ['cut', key] | ['pop'] | ['puff', i]
  function act(w, a) {
    if (a[0] === 'cut') return cut(w, a[1]);
    if (a[0] === 'pop') return pop(w);
    if (a[0] === 'puff') return puff(w, a[1]);
    return false;
  }

  // Runs a whole solution headlessly. plan: [[frame, 'cut', 'p0'], ...]
  function run(level, plan, maxFrames) {
    var w = create(level, { visual: false });
    var k = 0, limit = maxFrames || 1500;
    while (w.frame < limit && w.state === 'play') {
      while (k < plan.length && plan[k][0] <= w.frame) { act(w, plan[k].slice(1)); k++; }
      step(w);
      w.events.length = 0;
    }
    return { state: w.state, stars: w.starsGot, frame: w.frame, reason: w.reason, nearest: w.nearest };
  }

  var Sim = { C: C, create: create, step: step, cut: cut, cutRope: cutRope, pop: pop, puff: puff, act: act, run: run, dist: dist, distToSeg: distToSeg, movePos: movePos };
  root.MunchSim = Sim;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
})(typeof window !== 'undefined' ? window : globalThis);

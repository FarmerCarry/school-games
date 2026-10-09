/* ضربة إلى الفضاء (Skybound Golf): deterministic course and ball simulation.
 * Metres and seconds, y points up, the tee is at x = 0. No DOM: verify.js and
 * the browser tests load this file directly. Call step() at a fixed cadence
 * (normally 1/60 s); it substeps internally so fast balls never tunnel.
 *
 * One button drives the flight: press() near the ground arms a super bounce,
 * anywhere else it fires one of the ball's rockets.
 */
(function (root) {
  'use strict';

  var CHUNK = 80;          // course content is generated per 80 m chunk
  var SPACE = 250;         // the "edge of space" line, in metres of altitude
  var RADIUS = 0.55;
  var TIME_LIMIT = 55;
  var ARM_WINDOW = 0.6;    // press up to this long before landing for a super bounce
  var PERFECT_WINDOW = 0.2;
  var LATE_WINDOW = 0.1;   // a press just after an ordinary bounce still counts
  // Swing gauge bands (0 to 1): the gold top tenth is a perfect hit.
  var PERFECT_POWER = 0.9, GREAT_POWER = 0.72, GOOD_POWER = 0.45;

  var worlds = [
    { id: 'meadow', name: 'المروج الخضراء', unlock: 0, gravity: 19, hills: [3.2, 1.6, 5], ground: 'grass', prop: 'tree',
      slots: { green: 3, sand: 3, water: 2, pad: 3, prop: 4, none: 3 } },
    { id: 'desert', name: 'وادي الرمال', unlock: 250, gravity: 17.5, hills: [4.5, 2, 7], ground: 'grass', prop: 'cactus',
      slots: { green: 3, sand: 5, water: 2, pad: 3, prop: 4, none: 2 } },
    { id: 'snow', name: 'قمم الثلج', unlock: 550, gravity: 16, hills: [5.5, 2.4, 10], ground: 'snow', prop: 'pine',
      slots: { green: 3, ice: 4, sand: 1, pad: 3, prop: 4, none: 2 } },
    { id: 'clouds', name: 'جزر السحاب', unlock: 900, gravity: 15.5, hills: [4, 3, 8], ground: 'cloud', prop: 'puff',
      slots: { green: 3, pad: 4, prop: 5, none: 3 } },
    { id: 'moon', name: 'سطح القمر', unlock: 1400, gravity: 13.5, hills: [3, 2.2, 6], ground: 'dust', prop: 'crystal',
      slots: { green: 3, crater: 4, pad: 4, prop: 3, none: 2 } }
  ];

  // Bounce and rolling behaviour of each surface. e is added to the ball's
  // bounce, keep is the share of sliding speed kept on impact, roll is
  // rolling friction in m/s².
  var SURFACES = {
    grass: { e: 0, keep: 0.88, roll: 6.5 },
    snow: { e: -0.03, keep: 0.87, roll: 6 },
    cloud: { e: 0.04, keep: 0.9, roll: 5 },
    dust: { e: -0.02, keep: 0.9, roll: 4.5 },
    green: { e: -0.08, keep: 0.85, roll: 4.5 },
    sand: { e: -0.3, keep: 0.45, roll: 26 },
    ice: { e: -0.06, keep: 0.98, roll: 1.2 },
    pad: { e: 0, keep: 0.9, roll: 6 }
  };
  var PROPS = {
    tree: { lift: 6.2, r: 2.5, k: 0.35 },
    cactus: { lift: 3.8, r: 1.5, k: 0.4 },
    pine: { lift: 5.6, r: 2.1, k: 0.32 },
    puff: { lift: 7.5, r: 2.8, k: 1.05 },
    crystal: { lift: 3.3, r: 1.5, k: 0.75 }
  };

  // Cosmetic ball styles; art.js draws them.
  var skins = [
    { id: 'classic', name: 'كلاسيكية', price: 0 },
    { id: 'gold', name: 'ذهبية', price: 300 },
    { id: 'melon', name: 'بطيخة', price: 700 },
    { id: 'earth', name: 'الأرض', price: 1200 },
    { id: 'donut', name: 'دونات', price: 2000 },
    { id: 'planet', name: 'زحل', price: 3000 },
    { id: 'comet', name: 'مذنّب', price: 4500 },
    { id: 'rainbow', name: 'قوس قزح', price: 6500 }
  ];

  var upgrades = {
    power: { max: 12, base: 30, growth: 1.36 },
    bounce: { max: 10, base: 25, growth: 1.4 },
    rockets: { max: 5, base: 60, growth: 1.9 },
    magnet: { max: 5, base: 40, growth: 1.8 }
  };
  var KINDS = ['power', 'bounce', 'rockets', 'magnet'];

  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var finite = function (x, fallback) { return typeof x === 'number' && Number.isFinite(x) ? x : fallback; };
  var smooth = function (v) { return v * v * (3 - 2 * v); };

  function createCourse(index) {
    index = clamp(Math.floor(finite(index, 0)), 0, worlds.length - 1);
    return { worldIndex: index, world: worlds[index], seed: 11 + index * 29, chunks: {}, cached: 0, layouts: {}, laidOut: 0 };
  }

  function hash(course, n) {
    var x = Math.sin(n * 127.1 + course.seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function baseHeight(course, x) {
    if (x <= 22) return 0;
    var a = course.world.hills, s = course.seed;
    var fade = smooth(clamp((x - 22) / 70, 0, 1));
    return fade * (a[0] * Math.sin(x * 0.019 + s * 0.37) + a[1] * Math.sin(x * 0.053 + s * 1.3) +
      a[2] * (Math.sin(x * 0.0061 + s) - Math.sin(s)));
  }

  function pickSlot(course, weights, roll) {
    var total = 0, k;
    for (k in weights) total += weights[k];
    var t = roll * total;
    for (k in weights) { t -= weights[k]; if (t < 0) return k; }
    return 'none';
  }

  // The ground layer of a chunk: flat features (green, sand, water, ice,
  // pad, crater) and the spots for props. Heights depend only on this layer.
  function layout(course, i) {
    var c = course.layouts[i];
    if (c) return c;
    c = { flats: [], spots: [] };
    var x0 = i * CHUNK, w = course.world, r = function (k) { return hash(course, i * 31 + k); };
    if (i === 0) c.flats.push(flat(course, 'pad', 62, 2));
    else {
      for (var n = 0; n < 4; n++) {
        var sx = x0 + 10 + n * 20 + (r(n) - 0.5) * 5;
        var type = pickSlot(course, w.slots, r(n + 10));
        if (i === 1 && (type === 'water' || type === 'sand')) type = 'prop';
        if (type === 'green') c.flats.push(flat(course, 'green', sx, 8));
        else if (type === 'sand' || type === 'ice') c.flats.push(flat(course, type, sx, 4.5 + r(n + 20) * 2.5));
        else if (type === 'water') c.flats.push(flat(course, 'water', sx, 5 + r(n + 20) * 2));
        else if (type === 'crater') c.flats.push(flat(course, 'crater', sx, 6 + r(n + 20) * 3));
        else if (type === 'pad') c.flats.push(flat(course, 'pad', sx, 2));
        else if (type === 'prop') c.spots.push({ n: n, x: sx });
      }
    }
    if (course.laidOut > 400) { course.layouts = {}; course.laidOut = 0; }
    course.layouts[i] = c; course.laidOut++;
    return c;
  }

  // Everything else in a chunk: props, coins, boost rings and balloons,
  // placed relative to the real ground. Generated once and cached.
  function chunk(course, i) {
    var c = course.chunks[i];
    if (c) return c;
    var ground = layout(course, i);
    c = { flats: ground.flats, props: [], coins: [], rings: [], balloons: [] };
    var x0 = i * CHUNK, w = course.world, n, k, h;
    var r = function (k) { return hash(course, i * 31 + k); };
    if (i === 0) {
      // The tee: a coin column that any fair first swing flies through, then
      // an arc along the path of a perfect one.
      for (k = 0; k < 6; k++) c.coins.push({ id: 0, x: 22, y: 6 + k * 2.2, gem: false });
      for (k = 0; k < 5; k++) { var ax = 30 + k * 4; c.coins.push({ id: 0, x: ax, y: 0.95 * ax - 0.0142 * ax * ax, gem: false }); }
    } else {
      ground.spots.forEach(function (spot) {
        var p = PROPS[w.prop], scale = 0.85 + r(spot.n + 30) * 0.35;
        c.props.push({ id: i * 8 + spot.n, type: w.prop, x: spot.x, ground: heightAt(course, spot.x),
          lift: p.lift * scale, r: p.r * scale, k: p.k });
      });
      // Coin groups: ground lines, arcs, columns and diagonals, climbing
      // higher farther out. Columns cross almost any flight path.
      var groups = 2 + (r(40) > 0.55 ? 1 : 0);
      for (n = 0; n < groups; n++) {
        var gx = x0 + 6 + n * 24 + r(41 + n) * 12, band = r(43 + n), far = clamp(i / 12, 0, 1);
        var base, gem = false, pattern = Math.floor(r(47 + n) * 4), floor = heightAt(course, gx);
        if (band < 0.3) { base = -1; if (pattern === 2) pattern = 1; }
        else if (band < 0.72 - far * 0.12 || i < 3) base = 5 + r(45 + n) * 14;
        else if (band < 0.9 - far * 0.05 || i < 5) base = 24 + r(45 + n) * 36;
        else { base = 80 + r(45 + n) * 180 * far; gem = true; pattern = 2; }
        for (k = 0; k < 7; k++) {
          var px = gx, py = 0;
          if (pattern === 0) { px += k * 2.5; py = Math.sin(k / 6 * Math.PI) * 3.6; }
          else if (pattern === 1) px += k * 2.3;
          else if (pattern === 2) { px += (k % 2) * 0.8; py = k * 2.2; }
          else { px += k * 2; py = k * 1.6; }
          if (gem && k > 4) break;
          var under = heightAt(course, px);
          h = base < 0 ? under + 1.6 + py : Math.max(floor + base + py, under + 2);
          c.coins.push({ id: 0, x: px, y: h, gem: gem });
        }
      }
      if (i >= 2 && r(50) < 0.32) {
        var rx = x0 + 20 + r(51) * 40;
        c.rings.push({ id: i * 4, x: rx, y: heightAt(course, rx) + 11 + r(52) * (28 + i * 1.5), r: 3.2 });
      }
      if (r(53) < 0.42) {
        var bx = x0 + 15 + r(55) * 50;
        c.balloons.push({ id: i * 4 + 1, x: bx, y: heightAt(course, bx) + 15 + r(54) * (30 + Math.min(120, i * 6)), r: 1.55, hue: Math.floor(r(56) * 4) });
      }
    }
    c.coins = c.coins.map(function (coin, index) { coin.id = i * 64 + index; return coin; });
    if (course.cached > 160) { course.chunks = {}; course.cached = 0; }
    course.chunks[i] = c; course.cached++;
    return c;
  }

  function flat(course, type, x, hw) {
    var level = baseHeight(course, x);
    if (type === 'water') level -= 0.7;
    var f = { type: type, x: x, hw: hw, level: level };
    if (type === 'green') f.holeX = x + 2.2;
    if (type === 'crater') f.depth = 1.6 + hw * 0.18;
    return f;
  }

  var BLEND = 5, LIMIT = 1e7;
  function heightAt(course, x) {
    x = clamp(finite(x, 0), -LIMIT, LIMIT);
    var h = baseHeight(course, x);
    var i = Math.floor(x / CHUNK);
    for (var j = i - 1; j <= i + 1; j++) {
      if (j < 0) continue;
      var flats = layout(course, j).flats;
      for (var n = 0; n < flats.length; n++) {
        var f = flats[n], d = Math.abs(x - f.x);
        if (d >= f.hw + BLEND) continue;
        if (f.type === 'crater') {
          if (d < f.hw) { var q = d / f.hw; h -= f.depth * (1 - q * q) * (1 - q * q); }
          continue;
        }
        var t = d <= f.hw ? 1 : 1 - smooth((d - f.hw) / BLEND);
        h = h * (1 - t) + f.level * t;
      }
    }
    return h;
  }

  function surfaceAt(course, x) {
    x = clamp(finite(x, 0), -LIMIT, LIMIT);
    var i = Math.floor(x / CHUNK);
    for (var j = i - 1; j <= i + 1; j++) {
      if (j < 0) continue;
      var flats = layout(course, j).flats;
      for (var n = 0; n < flats.length; n++) {
        var f = flats[n];
        if (f.type !== 'crater' && Math.abs(x - f.x) <= f.hw) return f;
      }
    }
    return null;
  }
  function surfaceType(course, x) { var f = surfaceAt(course, x); return f ? f.type : course.world.ground; }

  function slopeAt(course, x) { return (heightAt(course, x + 0.08) - heightAt(course, x - 0.08)) / 0.16; }

  // Everything a renderer needs between two x positions (a bounded query).
  function features(course, minX, maxX) {
    minX = clamp(finite(minX, 0), -LIMIT, LIMIT); maxX = clamp(finite(maxX, minX + 200), -LIMIT, LIMIT);
    var out = { flats: [], props: [], coins: [], rings: [], balloons: [] };
    if (maxX < minX) return out;
    var first = Math.max(0, Math.floor((minX - 12) / CHUNK)), last = Math.min(Math.floor((maxX + 12) / CHUNK), first + 40);
    for (var i = first; i <= last; i++) {
      var c = chunk(course, i);
      for (var key in out) for (var n = 0; n < c[key].length; n++) out[key].push(c[key][n]);
    }
    return out;
  }

  function levels(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    KINDS.forEach(function (k) { out[k] = clamp(Math.floor(finite(raw[k], 0)), 0, upgrades[k].max); });
    return out;
  }

  function bounceOf(u) { return 0.36 + u.bounce * 0.02; }
  function magnetOf(u) { return 1.3 + u.magnet * 0.7; }
  function rocketsOf(u) { return 1 + u.rockets; }

  // power is the swing gauge, 0 to 1.
  function grade(power) {
    power = clamp(finite(power, 0), 0, 1);
    return power >= PERFECT_POWER ? 'perfect' : power >= GREAT_POWER ? 'great' : power >= GOOD_POWER ? 'good' : 'weak';
  }

  function launch(course, raw, power) {
    var u = levels(raw);
    power = clamp(finite(power, 0), 0, 1);
    var g = grade(power), perfect = g === 'perfect';
    var speed = (33 + u.power * 4.6) * (0.4 + 0.6 * power) * (perfect ? 1.1 : 1);
    var angle = (36 + 8 * power) * Math.PI / 180;
    var y = heightAt(course, 0) + RADIUS;
    return { x: 0, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: RADIUS,
      mode: 'air', done: false, reason: null, time: 0, maxX: 0, maxY: y, power: power, grade: g, perfect: perfect,
      rockets: rocketsOf(u), rocketsLeft: rocketsOf(u), armed: false, armAge: 0, combo: 0, bestCombo: 0,
      supers: 0, bounces: 0, skips: 0, coins: 0, gems: 0, pops: 0, rings: 0, got: {}, used: {},
      lastPad: -1, lastProp: -1, propAt: 0, lateUntil: -1, lateOut: 0, space: false, hole: false, ace: false, surface: null, trackVy: 0 };
  }

  // Seconds until the ball meets the ground on its current arc, or null when
  // that is further away than maxT. Objects are ignored.
  function predictImpact(course, ball, maxT) {
    if (ball.done || ball.mode !== 'air') return null;
    var g = course.world.gravity, x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy, h = 1 / 120;
    maxT = finite(maxT, ARM_WINDOW);
    for (var t = 0; t <= maxT; t += h) {
      vy -= g * h; x += vx * h; y += vy * h;
      var floor = heightAt(course, x) + ball.r;
      if (y <= floor) return { t: t + h, x: x, y: floor - ball.r };
    }
    return null;
  }

  // The player's one button during a flight.
  function press(course, ball, raw) {
    if (ball.done) return { type: 'none' };
    if (ball.mode === 'air' && ball.time <= ball.lateUntil && !ball.armed) {
      // Just missed the landing: turn the bounce into a good super bounce
      // instead of spending a rocket.
      var u = levels(raw), extra = ball.lateOut * 0.1 * Math.pow(0.92, ball.supers) / Math.max(0.1, bounceOf(u));
      ball.vy += extra; ball.supers++; ball.combo = 0; ball.lateUntil = -1;
      return { type: 'late', x: ball.x, y: ball.y - ball.r };
    }
    if (ball.mode === 'air' && ball.vy < 0) {
      var p = predictImpact(course, ball, ARM_WINDOW);
      if (p) {
        // Only the first press of a landing counts, so mashing earns a
        // "good" bounce at best and spends rockets on the way up.
        if (ball.armed) return { type: 'armed' };
        ball.armed = true; ball.armAge = 0;
        return { type: 'arm', t: p.t };
      }
    }
    if (ball.rocketsLeft > 0) {
      ball.rocketsLeft--;
      if (ball.mode === 'roll') { ball.mode = 'air'; ball.y += 0.05; }
      ball.armed = false;
      ball.vy = Math.max(ball.vy, 0) + 18;
      ball.vx = Math.max(ball.vx, 0) + 6;
      return { type: 'rocket', left: ball.rocketsLeft, x: ball.x, y: ball.y };
    }
    return { type: 'empty' };
  }

  function finish(course, ball, events, reason) {
    ball.vx = 0; ball.vy = 0; ball.done = true; ball.mode = 'stop'; ball.reason = reason; ball.armed = false;
    if (reason !== 'hole') ball.y = Math.max(ball.y, heightAt(course, ball.x) + ball.r);
    ball.maxX = Math.max(ball.maxX, ball.x);
    ball.surface = surfaceType(course, ball.x);
    events.push({ type: 'stop', x: ball.x, y: ball.y, reason: reason, surface: ball.surface });
  }

  function padLaunch(course, ball, u, f, events) {
    if (ball.lastPad === f.x) return false;
    ball.lastPad = f.x;
    ball.mode = 'air'; ball.armed = false;
    ball.vy = Math.max(17 + u.bounce * 0.6, Math.abs(ball.vy) * 0.85);
    ball.vx = Math.max(ball.vx, 9) + 4;
    ball.y = f.level + ball.r + 0.05;
    events.push({ type: 'pad', x: ball.x, y: ball.y });
    return true;
  }

  // The ball meets the ground at (ball.x, ball.y) while flying.
  function impact(course, ball, u, events) {
    var f = surfaceAt(course, ball.x), type = f ? f.type : course.world.ground;
    if (type === 'pad' && padLaunch(course, ball, u, f, events)) return;
    var speed = Math.hypot(ball.vx, ball.vy);
    if (type === 'green' && Math.abs(ball.x - f.holeX) < 0.75 && speed < 32) {
      ball.ace = ball.bounces === 0 && ball.supers === 0;
      ball.hole = true; ball.x = f.holeX; ball.y = f.level - 0.3;
      events.push({ type: 'hole', x: ball.x, y: f.level, ace: ball.ace });
      finish(course, ball, events, 'hole');
      return;
    }
    if (type === 'water') {
      if (ball.armed || (ball.vx > 9 && -ball.vy < ball.vx * 1.1)) {
        ball.skips++; ball.armed = false;
        ball.vy = Math.abs(ball.vy) * 0.5 + 2.5; ball.vx *= 0.84;
        ball.y = f.level + ball.r + 0.02;
        events.push({ type: 'skip', x: ball.x, y: f.level, count: ball.skips });
        return;
      }
      ball.y = f.level;
      events.push({ type: 'splash', x: ball.x, y: f.level });
      finish(course, ball, events, 'water');
      return;
    }
    var surf = SURFACES[type] || SURFACES.grass;
    var s = slopeAt(course, ball.x), inv = 1 / Math.sqrt(1 + s * s);
    var nx = -s * inv, ny = inv, tx = inv, ty = s * inv;
    var vn = ball.vx * nx + ball.vy * ny, vt = ball.vx * tx + ball.vy * ty;
    var e = clamp(bounceOf(u) + surf.e, 0.06, 0.9), keep = surf.keep, kind = 'bounce', quality = '';
    if (ball.armed && -vn > 4) {
      // Each super bounce in a run is a little weaker, so chains always end.
      var tire = Math.pow(0.92, ball.supers);
      if (ball.armAge <= PERFECT_WINDOW) { quality = 'perfect'; e = Math.max(e, (0.86 + u.bounce * 0.008) * tire); keep = Math.max(keep, 0.95); }
      else { quality = 'good'; e = Math.max(e, e + 0.1 * tire); keep = Math.max(keep, 0.9); }
      if (type === 'sand') e = Math.min(e, 0.32);
    }
    ball.armed = false;
    ball.bounces++;
    var out = -vn * e;
    if (out < 2.6) {
      // Too gentle to leave the ground, armed or not: it rolls, and no super
      // bounce is counted or paid.
      ball.combo = 0;
      ball.mode = 'roll';
      ball.vx = Math.max(-4, vt * keep) * tx;
      // Track the ground's own vertical speed, so a downslope is not taken
      // for a crest on the next step.
      ball.vy = 0; ball.trackVy = ball.vx * slopeAt(course, ball.x);
      ball.y = heightAt(course, ball.x) + ball.r;
      events.push({ type: 'roll', x: ball.x, y: ball.y, surface: type });
      return;
    }
    if (quality) {
      kind = 'super'; ball.supers++;
      ball.combo = quality === 'perfect' ? ball.combo + 1 : 0;
      ball.bestCombo = Math.max(ball.bestCombo, ball.combo);
    } else ball.combo = 0;
    ball.vx = vt * keep * tx + out * nx;
    ball.vy = vt * keep * ty + out * ny;
    if (kind === 'bounce' && type !== 'sand') { ball.lateUntil = ball.time + LATE_WINDOW; ball.lateOut = out; }
    // Perfect super bounces launch forward, not just up.
    if (quality === 'perfect') ball.vx = Math.max(ball.vx, Math.min(out * 0.9, speed * 0.9));
    ball.y += 0.01;
    events.push({ type: kind, quality: quality, combo: ball.combo, x: ball.x, y: ball.y - ball.r,
      strength: Math.min(1, -vn / 35), surface: type });
  }

  function collect(course, ball, u, ox, events) {
    var i = Math.floor(ball.x / CHUNK), reach = magnetOf(u);
    for (var j = Math.max(0, i - 1); j <= i + 1; j++) {
      var c = chunk(course, j), n, o, key;
      for (n = 0; n < c.coins.length; n++) {
        o = c.coins[n];
        if (ball.got[o.id] || Math.abs(o.x - ball.x) > reach || Math.abs(o.y - ball.y) > reach) continue;
        if (Math.hypot(o.x - ball.x, o.y - ball.y) > reach) continue;
        ball.got[o.id] = 1;
        if (o.gem) ball.gems++; else ball.coins++;
        events.push({ type: 'coin', id: o.id, x: o.x, y: o.y, gem: o.gem });
      }
      for (n = 0; n < c.rings.length; n++) {
        o = c.rings[n]; key = 'r' + o.id;
        if (ball.used[key] || (ox - o.x) * (ball.x - o.x) > 0 || Math.abs(ball.y - o.y) > o.r) continue;
        ball.used[key] = 1; ball.rings++;
        var sp = Math.hypot(ball.vx, ball.vy) || 1, boost = (sp + 9) / sp;
        ball.vx *= boost; ball.vy = ball.vy * boost + 3; ball.armed = false;
        events.push({ type: 'ring', x: o.x, y: o.y });
      }
      for (n = 0; n < c.balloons.length; n++) {
        o = c.balloons[n]; key = 'b' + o.id;
        if (ball.used[key] || Math.hypot(o.x - ball.x, o.y - ball.y) > o.r + ball.r) continue;
        ball.used[key] = 1; ball.pops++;
        ball.vy = Math.max(ball.vy, 0) + 14; ball.vx += 2; ball.armed = false;
        events.push({ type: 'balloon', x: o.x, y: o.y, hue: o.hue });
      }
      for (n = 0; n < c.props.length; n++) {
        o = c.props[n];
        var px = o.x, py = o.ground + o.lift, dx = ball.x - px, dy = ball.y - py, d = Math.hypot(dx, dy);
        if (d > o.r + ball.r || d === 0) continue;
        var nx = dx / d, ny = dy / d, vn = ball.vx * nx + ball.vy * ny;
        ball.x = px + nx * (o.r + ball.r + 0.01); ball.y = py + ny * (o.r + ball.r + 0.01);
        if (vn >= 0) continue;
        ball.vx -= (1 + o.k) * vn * nx; ball.vy -= (1 + o.k) * vn * ny;
        if (o.k < 1) { ball.vx *= 0.85; ball.vy *= 0.85; }
        if (ball.mode === 'roll') ball.mode = 'air';
        // A ball resting on a crown slides off forwards instead of perching.
        if (ny > 0.5 && -vn < 3) ball.vx += 3;
        // A rattle or a soft touch makes no sound; a separate rebound a moment
        // later is heard again.
        var repeat = -vn < 3 || (ball.lastProp === o.id && ball.time - ball.propAt < 0.12);
        ball.lastProp = o.id;
        if (!repeat) {
          ball.propAt = ball.time;
          events.push({ type: 'prop', id: o.id, x: ball.x - nx * ball.r, y: ball.y - ny * ball.r, prop: o.type, strength: Math.min(1, -vn / 25) });
        }
      }
    }
  }

  function step(course, ball, raw, dt) {
    var events = [];
    if (!ball || ball.done) return events;
    var u = levels(raw), g = course.world.gravity;
    dt = clamp(finite(dt, 1 / 60), 0, 0.1);
    var count = Math.max(1, Math.ceil(dt / (1 / 240)), Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 0.5));
    var h = dt / count;
    for (var k = 0; k < count && !ball.done; k++) {
      ball.time += h;
      var ox = ball.x, oy = ball.y;
      if (ball.armed) { ball.armAge += h; if (ball.armAge > ARM_WINDOW + 0.15) ball.armed = false; }
      if (ball.mode === 'roll') {
        var f = surfaceAt(course, ball.x), type = f ? f.type : course.world.ground;
        if (type === 'pad' && padLaunch(course, ball, u, f, events)) continue;
        if (type === 'water') { events.push({ type: 'splash', x: ball.x, y: f.level }); ball.y = f.level; finish(course, ball, events, 'water'); break; }
        var s = slopeAt(course, ball.x), friction = (SURFACES[type] || SURFACES.grass).roll;
        var along = -g * s / Math.sqrt(1 + s * s);
        var next = ball.vx + along * h;
        if (Math.abs(next) <= friction * h + 0.06 && Math.abs(along) < friction) { finish(course, ball, events, 'rest'); break; }
        ball.vx = next - Math.sign(next) * friction * h;
        ball.x = Math.max(0, ball.x + ball.vx * h);
        if (ball.x === 0 && ball.vx < 0) { finish(course, ball, events, 'rest'); break; }
        // A slow ball rolling over the cup drops in.
        if (type === 'green' && (ox - f.holeX) * (ball.x - f.holeX) <= 0 && Math.abs(ball.vx) < 3.6) {
          ball.hole = true; ball.x = f.holeX; ball.y = f.level - 0.3;
          events.push({ type: 'hole', x: ball.x, y: f.level, ace: false });
          finish(course, ball, events, 'hole'); break;
        }
        var ground = heightAt(course, ball.x) + ball.r, vyGround = (ground - oy) / h;
        // Over a crest the ground drops away faster than gravity: take off.
        if (vyGround < ball.trackVy - g * h * 1.2 && Math.abs(ball.vx) > 6) {
          ball.mode = 'air'; ball.vy = ball.trackVy; ball.y = oy + ball.vy * h;
        } else { ball.y = ground; ball.trackVy = vyGround; }
      } else {
        ball.vy -= g * h;
        var drag = Math.exp(-(0.01 + 0.0009 * Math.hypot(ball.vx, ball.vy)) * h);
        ball.vx *= drag; ball.vy *= drag;
        ball.x += ball.vx * h; ball.y += ball.vy * h;
        if (ball.x < 0) { ball.x = 0; ball.vx = Math.abs(ball.vx) * 0.5; }
        var floor = heightAt(course, ball.x) + ball.r;
        if (ball.y <= floor) {
          // Find the first contact on this substep instead of reflecting
          // from under a hill.
          var lo = 0, hi = 1;
          for (var it = 0; it < 10; it++) {
            var mid = (lo + hi) / 2, mx = ox + (ball.x - ox) * mid, my = oy + (ball.y - oy) * mid;
            if (my >= heightAt(course, mx) + ball.r) lo = mid; else hi = mid;
          }
          ball.x = ox + (ball.x - ox) * lo;
          ball.y = heightAt(course, ball.x) + ball.r;
          impact(course, ball, u, events);
        }
      }
      if (!ball.done) collect(course, ball, u, ox, events);
      if (!ball.done && ball.mode !== 'roll') {
        var under = heightAt(course, ball.x) + ball.r;
        if (ball.y < under) ball.y = under;
      }
      ball.maxX = Math.max(ball.maxX, ball.x);
      ball.maxY = Math.max(ball.maxY, ball.y);
      if (!ball.space && ball.y >= SPACE) { ball.space = true; events.push({ type: 'space', x: ball.x, y: ball.y }); }
      if (!ball.done && (ball.time > TIME_LIMIT || ball.x > 20000)) finish(course, ball, events, 'limit');
    }
    return events;
  }

  // Game speed for the next step: the slow end of a shot plays faster, the
  // busy part at full speed. The game multiplies its frame time by this.
  function pace(ball) {
    if (!ball || ball.done) return 1;
    var speed = Math.hypot(ball.vx, ball.vy);
    return (ball.mode === 'roll' && speed < 12) || (speed < 7 && !ball.armed) ? 1.7 : 1;
  }

  // Coins for a finished shot. Gems are worth 5, the distance pays 1 per 10 m.
  function reward(ball) {
    var distance = Math.floor(clamp(finite(ball && ball.maxX, 0), 0, 20000));
    var b = ball || {};
    var parts = {
      coins: (b.coins | 0) + (b.gems | 0) * 5 + (b.rings | 0) * 3 + (b.pops | 0) * 2,
      distance: Math.floor(distance / 10),
      bonus: (b.perfect ? 5 : 0) + (b.supers | 0) + (b.hole ? (b.ace ? 150 : 40) + Math.floor(distance / 10) : 0) + (b.space ? 100 : 0)
    };
    parts.total = parts.coins + parts.distance + parts.bonus;
    return parts;
  }

  function cost(kind, level) {
    var spec = upgrades[kind];
    if (!spec) return Infinity;
    level = clamp(Math.floor(finite(level, 0)), 0, spec.max);
    if (level >= spec.max) return Infinity;
    return Math.round(spec.base * Math.pow(spec.growth, level) / 5) * 5;
  }

  // Saves from the first version of this game (power/bounce/glide upgrades)
  // keep their coins, best distance and balls, and get their upgrade coins back.
  function legacyRefund(old) {
    var bases = { power: 65, bounce: 50, glide: 55 }, total = 0;
    for (var kind in bases) {
      var level = clamp(Math.floor(finite(old && old[kind], 0)), 0, 10);
      for (var n = 0; n < level; n++) total += Math.round(bases[kind] * Math.pow(1.46, n) / 5) * 5;
    }
    return total;
  }

  function sanitizeSave(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var legacy = raw.v !== 2 && raw.upgrades && typeof raw.upgrades === 'object' && 'glide' in raw.upgrades;
    var coins = clamp(Math.floor(finite(raw.coins, 0)), 0, 9999999);
    if (legacy) coins = Math.min(9999999, coins + legacyRefund(raw.upgrades));
    var best = Math.floor(clamp(finite(raw.best, 0), 0, 20000));
    var bests = {};
    worlds.forEach(function (w) {
      bests[w.id] = Math.floor(clamp(finite(raw.bests && raw.bests[w.id], 0), 0, 20000));
      best = Math.max(best, bests[w.id]);
    });
    var world = clamp(Math.floor(finite(raw.world, 0)), 0, worlds.length - 1);
    while (world > 0 && best < worlds[world].unlock) world--;
    var owned = skins.filter(function (k) {
      return !k.price || (Array.isArray(raw.skins) && raw.skins.indexOf(k.id) >= 0);
    }).map(function (k) { return k.id; });
    var count = function (v) { return clamp(Math.floor(finite(v, 0)), 0, 999999); };
    return { v: 2, coins: coins, best: best, bests: bests, high: Math.floor(clamp(finite(raw.high, 0), 0, 99999)),
      world: world, upgrades: legacy ? levels({}) : levels(raw.upgrades),
      shots: count(raw.shots), holes: count(raw.holes), spaces: count(raw.spaces),
      tips: clamp(Math.floor(finite(raw.tips, legacy || raw.shots > 0 ? 2 : 0)), 0, 2),
      skins: owned, skin: owned.indexOf(raw.skin) >= 0 ? raw.skin : 'classic' };
  }

  var api = { worlds: worlds, skins: skins, upgrades: upgrades, kinds: KINDS, CHUNK: CHUNK, SPACE: SPACE,
    ARM_WINDOW: ARM_WINDOW, PERFECT_WINDOW: PERFECT_WINDOW, bands: { perfect: PERFECT_POWER, great: GREAT_POWER, good: GOOD_POWER },
    createCourse: createCourse, heightAt: heightAt, surfaceType: surfaceType, features: features,
    levels: levels, grade: grade, launch: launch, press: press, predictImpact: predictImpact, step: step, pace: pace,
    reward: reward, cost: cost, sanitizeSave: sanitizeSave, magnetOf: magnetOf, rocketsOf: rocketsOf };
  root.GolfPhysics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Skybound Golf — deterministic, frame-independent course and ball simulation.
 * Positions are metres, y points up, and feature x is its centre. No DOM required.
 * Call step at a fixed cadence (normally 1/60 s). Its internal swept collisions
 * keep fast shots above the terrain. A stopped ball may be putted when its
 * surface is a green; putting itself is a separate skill challenge in the UI.
 */
(function (root) {
  'use strict';

  var worlds = [
    { id: 'meadow', name: 'المروج الخضراء', unlock: 0, gravity: 18,
      palette: { sky: '#7bd9ed', skyTop: '#59bfdc', skyBottom: '#e7f8cc', ground: '#418f44', grass: '#79cc54', hill: '#83ba76', far: '#aed7a2', accent: '#ffcf55' } },
    { id: 'desert', name: 'واحة الرمال', unlock: 220, gravity: 16.2,
      palette: { sky: '#ffe0a0', skyTop: '#efae7c', skyBottom: '#fff0bb', ground: '#cf874b', grass: '#edae60', hill: '#dc9c64', far: '#ebba8a', accent: '#55d5c2' } },
    { id: 'sky', name: 'جزر السحاب', unlock: 500, gravity: 12,
      palette: { sky: '#b7b1f0', skyTop: '#899ee8', skyBottom: '#f8d8ee', ground: '#7865b4', grass: '#bcb4ed', hill: '#a297d5', far: '#cfbde6', accent: '#fbe59b' } },
    { id: 'moon', name: 'ملعب القمر', unlock: 1000, gravity: 7.6,
      palette: { sky: '#14253d', skyTop: '#111f37', skyBottom: '#3e5277', ground: '#65758e', grass: '#a5b7c9', hill: '#495a76', far: '#293c5b', accent: '#a4eea2' } }
  ];
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var finite = function (x, fallback) { return typeof x === 'number' && Number.isFinite(x) ? x : fallback; };
  var smooth = function (v) { return v * v * (3 - 2 * v); };
  var CELL = 190;
  var UPGRADE_MAX = 10;

  function createCourse(index) {
    index = clamp(Math.floor(finite(index, 0)), 0, worlds.length - 1);
    return { worldIndex: index, world: worlds[index], seed: 19 + index * 37 };
  }

  function hash(course, n) {
    var x = Math.sin(n * 127.1 + course.seed * 31.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function green(course, n) {
    var x = 144 + n * CELL + (n === 0 ? 0 : (hash(course, n) - .5) * 24);
    return { type: 'green', x: x, width: 68, holeX: x + 7 };
  }

  function baseHeight(course, x) {
    if (x <= 50) return 0;
    var fade = smooth(clamp((x - 50) / 65, 0, 1));
    var w = course.worldIndex;
    return fade * ((3.2 + w * 1.4) * Math.sin(x * .019 + w * .7) +
      (1.8 + w * .7) * Math.sin(x * .047 + w * 1.1));
  }

  function heightAt(course, x) {
    var h = baseHeight(course, x);
    var n = Math.max(0, Math.round((x - 144) / CELL));
    var g = green(course, n);
    var edge = Math.abs(x - g.x);
    if (edge < g.width / 2 + 12) {
      var plateau = baseHeight(course, g.x);
      var blend = 1 - smooth(clamp((edge - g.width / 2) / 12, 0, 1));
      h = h * (1 - blend) + plateau * blend;
    }
    return h;
  }

  function features(course, minX, maxX) {
    minX = finite(minX, 0); maxX = finite(maxX, minX + 300);
    if (maxX < minX) return [];
    var first = Math.max(0, Math.floor((minX - CELL) / CELL));
    var last = Math.max(first, Math.ceil((maxX + CELL) / CELL));
    // A renderer should query its viewport, not the whole infinite course.
    last = Math.min(last, first + 256);
    var out = [];
    for (var i = first; i <= last; i++) {
      var g = green(course, i);
      var chunk = [g,
        { type: 'sand', x: 75 + i * CELL, width: 24 },
        { type: 'pad', x: 199 + i * CELL, width: 12 },
        { type: 'tree', x: 98 + i * CELL, width: 6, height: 11 + hash(course, i + 90) * 5, id: i }
      ];
      for (var j = 0; j < chunk.length; j++) {
        var f = chunk[j];
        if (f.x + f.width / 2 >= minX && f.x - f.width / 2 <= maxX) out.push(f);
      }
    }
    return out;
  }

  function surfaceAt(course, x) {
    var n = Math.max(0, Math.round((x - 144) / CELL));
    var g = green(course, n);
    if (Math.abs(x - g.x) <= g.width / 2) return { type: 'green', holeX: g.holeX, x: g.x, width: g.width };
    var sandN = Math.round((x - 75) / CELL);
    if (sandN >= 0 && Math.abs(x - (75 + sandN * CELL)) <= 12) return { type: 'sand' };
    var padN = Math.round((x - 199) / CELL);
    if (padN >= 0 && Math.abs(x - (199 + padN * CELL)) <= 6) return { type: 'pad' };
    return { type: 'grass' };
  }

  function levels(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return { power: clamp(Math.floor(finite(raw.power, 0)), 0, UPGRADE_MAX),
      bounce: clamp(Math.floor(finite(raw.bounce, 0)), 0, UPGRADE_MAX),
      glide: clamp(Math.floor(finite(raw.glide, 0)), 0, UPGRADE_MAX) };
  }

  function launch(course, upgrades, quality) {
    var u = levels(upgrades);
    quality = clamp(finite(quality, 0), 0, 1);
    var angle = (40 + quality * 5) * Math.PI / 180;
    var speed = (45 + u.power * 5.8) * (.48 + .52 * quality);
    return { x: 0, y: heightAt(course, 0) + .7, vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed, r: .7, stopped: false, rolling: false,
      time: 0, maxX: 0, maxY: .7, quality: quality, perfect: quality >= .94,
      bounces: 0, lastTree: -1, lastPad: -9999, surface: 'grass',
      stopReason: null, holeX: null };
  }

  function slopeAt(course, x) {
    return (heightAt(course, x + .08) - heightAt(course, x - .08)) / .16;
  }

  function stop(course, ball, events, reason) {
    ball.vx = 0; ball.vy = 0; ball.stopped = true; ball.rolling = false;
    ball.y = heightAt(course, ball.x) + ball.r;
    ball.maxX = Math.max(ball.maxX, ball.x);
    var s = surfaceAt(course, ball.x);
    ball.surface = s.type;
    ball.holeX = s.type === 'green' ? s.holeX : null;
    ball.stopReason = reason;
    events.push({ type: 'stop', x: ball.x, y: ball.y, surface: s.type, holeX: ball.holeX });
  }

  function padBounce(course, ball, u, events) {
    if (Math.abs(ball.x - ball.lastPad) < 12 || ball.time < .3) return false;
    ball.lastPad = ball.x;
    ball.vx = Math.max(15, ball.vx * .98 + 6);
    ball.vy = Math.max(20 + u.bounce * .7, Math.abs(ball.vy) * .8);
    ball.rolling = false;
    ball.y = heightAt(course, ball.x) + ball.r + .025;
    events.push({ type: 'pad', x: ball.x, y: ball.y });
    return true;
  }

  function step(course, ball, upgrades, dt) {
    var events = [];
    if (ball.stopped) return events;
    var u = levels(upgrades);
    dt = clamp(finite(dt, 1 / 60), 0, .1);
    // At most 0.7 metres of travel per substep, including late-game shots.
    var count = Math.max(1, Math.ceil(dt / (1 / 240)), Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / .7));
    var h = dt / count;
    var gravity = course.world.gravity;
    var drag = .034 - u.glide * .0027;
    for (var k = 0; k < count && !ball.stopped; k++) {
      ball.time += h;
      var oldX = ball.x;
      var oldY = ball.y;
      var s = surfaceAt(course, ball.x);
      if (ball.rolling) {
        if (s.type === 'pad' && padBounce(course, ball, u, events)) continue;
        var slope = slopeAt(course, ball.x);
        var friction = s.type === 'sand' ? 17 : s.type === 'green' ? 4.7 : 6.7;
        var acceleration = -gravity * slope / (1 + slope * slope);
        var nextV = ball.vx + acceleration * h;
        var resist = friction * h;
        // Static friction holds the ball still even on a gentle hill.
        if (Math.abs(nextV) <= resist + .09) {
          stop(course, ball, events, 'rest');
          break;
        }
        ball.vx = nextV - Math.sign(nextV) * resist;
        ball.x += ball.vx * h;
        ball.x = Math.max(0, ball.x);
        ball.y = heightAt(course, ball.x) + ball.r;
        ball.vy = 0;
      } else {
        ball.vx *= Math.exp(-drag * h);
        ball.vy = (ball.vy - gravity * h) * Math.exp(-drag * h * .6);
        ball.x = Math.max(0, ball.x + ball.vx * h);
        ball.y += ball.vy * h;

        // Swept tree hit, including a ball that crosses a trunk in one step.
        var firstTree = Math.max(0, Math.ceil((Math.min(oldX, ball.x) - 102) / CELL));
        var lastTree = Math.floor((Math.max(oldX, ball.x) - 94) / CELL);
        for (var ti = firstTree; ti <= lastTree; ti++) {
          if (ball.lastTree === ti) continue;
          var tx = 98 + ti * CELL;
          var top = heightAt(course, tx) + 11 + hash(course, ti + 90) * 5;
          var interpolation = oldX === ball.x ? 0 : clamp((tx - oldX) / (ball.x - oldX), 0, 1);
          var ty = oldY + (ball.y - oldY) * interpolation;
          if (ty < top + ball.r && ty > heightAt(course, tx) + 1) {
            ball.lastTree = ti;
            ball.vx *= .73;
            ball.vy = Math.max(7, Math.abs(ball.vy) * .26);
            events.push({ type: 'tree', x: tx, y: ty });
          }
        }

        var floor = heightAt(course, ball.x) + ball.r;
        if (ball.y <= floor) {
          // Locate the first terrain crossing rather than reflecting after
          // the ball has travelled below a hill or a narrow bounce pad.
          var lo = 0, hi = 1;
          for (var iter = 0; iter < 9; iter++) {
            var mid = (lo + hi) / 2;
            var mx = oldX + (ball.x - oldX) * mid;
            var my = oldY + (ball.y - oldY) * mid;
            if (my >= heightAt(course, mx) + ball.r) lo = mid; else hi = mid;
          }
          ball.x = oldX + (ball.x - oldX) * lo;
          ball.y = heightAt(course, ball.x) + ball.r;
          s = surfaceAt(course, ball.x);
          if (s.type === 'pad' && padBounce(course, ball, u, events)) continue;
          var tangent = slopeAt(course, ball.x);
          var inv = 1 / Math.sqrt(1 + tangent * tangent);
          var nx = -tangent * inv, ny = inv;
          var normalV = ball.vx * nx + ball.vy * ny;
          var restitution = s.type === 'sand' ? .09 : s.type === 'green' ? .29 + u.bounce * .018 : .46 + u.bounce * .025;
          ball.bounces++;
          if (normalV < -3.6) {
            ball.vx -= (1 + restitution) * normalV * nx;
            ball.vy -= (1 + restitution) * normalV * ny;
            ball.vx *= s.type === 'sand' ? .55 : s.type === 'green' ? .83 : .9;
            ball.y += .012;
            events.push({ type: 'bounce', x: ball.x, y: ball.y, strength: Math.min(1, Math.abs(normalV) / 35), surface: s.type });
          } else {
            ball.rolling = true;
            ball.vx = Math.max(0, ball.vx * (s.type === 'sand' ? .45 : .82));
            ball.vy = 0;
          }
        }
      }
      ball.maxX = Math.max(ball.maxX, ball.x);
      ball.maxY = Math.max(ball.maxY, ball.y);
      // Bounded safety stop for late-game pad chains or nearly flat rolls.
      if (ball.time > 55 || ball.x > 10000) stop(course, ball, events, 'limit');
    }
    return events;
  }

  function cost(kind, level) {
    level = clamp(Math.floor(finite(level, 0)), 0, UPGRADE_MAX);
    if (level >= UPGRADE_MAX) return Infinity;
    var base = kind === 'power' ? 65 : kind === 'bounce' ? 50 : 55;
    return Math.round(base * Math.pow(1.46, level) / 5) * 5;
  }

  function reward(distance, sunk, perfect) {
    distance = clamp(finite(distance, 0), 0, 10000);
    return Math.round(12 + distance * .31 + (sunk ? 85 + distance * .12 : 0) + (perfect ? 15 : 0));
  }

  function sanitizeSave(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var best = clamp(finite(raw.best, 0), 0, 10000);
    var world = clamp(Math.floor(finite(raw.world, 0)), 0, worlds.length - 1);
    while (world > 0 && best < worlds[world].unlock) world--;
    return { coins: clamp(Math.floor(finite(raw.coins, 0)), 0, 9999999), best: best,
      world: world, upgrades: levels(raw.upgrades),
      shots: clamp(Math.floor(finite(raw.shots, 0)), 0, 999999),
      holes: clamp(Math.floor(finite(raw.holes, 0)), 0, 999999) };
  }

  var api = { worlds: worlds, createCourse: createCourse, heightAt: heightAt,
    surfaceAt: surfaceAt, features: features, launch: launch, step: step,
    cost: cost, sanitizeSave: sanitizeSave, reward: reward, maxUpgrade: UPGRADE_MAX };
  root.GolfPhysics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

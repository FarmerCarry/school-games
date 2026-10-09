/*
 * Sneaky Levels — world 11 (levels 81-90): shy ghosts.
 * Registers its mechanic with the engine (TrollEngine.mod / .tile) and, in the
 * browser, with the drawing (TrollArt), then adds its world with TrollLevels.addWorld.
 *
 * You look the way of the last arrow you pressed (jumping and letting go keep
 * it). Ghosts drift toward you, through walls, only while your back is turned;
 * look at one and it freezes and hides its eyes. Touching a ghost is "بوو!".
 * Map: 'H' a sleeping ghost (its script wakes it); '&' a haunted stone, solid
 * only while you face right: it fades as soon as you turn, even under your feet,
 * and comes back only once you have left its place.
 * Script API:
 *   L.ghosts                 the map's ghosts, in reading order
 *   L.ghost({ x, y, speed, active, hidden, costume, door })  a ghost at tile
 *                            (x, y), speed in tiles/s (5). A hidden ghost appears
 *                            when woken. Costume 'door' looks like a door until it
 *                            first moves; 'bubo' is the giant host (3x3 tiles, x, y
 *                            his middle tile): he carries `door` toward you while
 *                            your back is turned and hides it while you look.
 *   L.wakeGhost(gh)
 *   L.haunt(door or ch, speed)  a door or group that creeps toward you while you
 *                            look away; a group you stand on drifts the way your
 *                            back points. Groups stop at walls, doors glide over all.
 *   L.hauntDir(ch, dir)      the haunted tiles of group ch are solid while you face dir.
 *   L.dark(on), L.lightning(every, first)  lights off leaves a circle of light
 *                            around you; lightning lifts the dark every `every` s.
 */
(function (root) {
  'use strict';
  var E = root.TrollEngine, Art = root.TrollArt;
  var T = E.T, PH = E.PH, DT = E.DT, TAU = Math.PI * 2;
  var SPEED = 5, FLASH = 0.25, NONE = [];

  // The level's ghost state, made by its map or script; every hook returns at
  // once in levels without it. A reset parses the map again into new groups, so
  // a state from before the reset is dropped.
  function state(w) {
    if (!w.gh || w.gh.groups !== w.groups) {
      w.gh = { groups: w.groups, ghosts: [], movers: [], doors: [], stones: null, runs: [], dir: 0, dark: false, every: 0, next: 0, flash: 0 };
    }
    return w.gh;
  }

  // Does the player look toward x (pixels)? Straight above or below counts as behind.
  function looks(w, x) { return (x - w.p.x - PH.w / 2) * w.p.face > 0; }

  function makeGhost(s, o) {
    var c = o.costume || '', x = (o.x + 0.5) * T, y = c === 'door' ? (o.y + 1) * T - 30 : (o.y + 0.5) * T;
    var gh = {
      x: x, y: y, speed: (o.speed || SPEED) * T, active: !!o.active, hidden: !!o.hidden, costume: c,
      flat: c !== '', frozen: false, moved: false, door: o.door || null, ph: s.ghosts.length * 1.7,
      dd: c === 'door' ? { x: x - 20, y: y - 30, g: null, hang: false } : null
    };
    if (gh.door) {
      var d = gh.door;
      if (d.g) { d.x += d.g.ox; d.y += d.g.oy; d.g = null; }
      gh.dox = d.x - x; gh.doy = d.y - y;
      holdDoor(gh);
    }
    s.ghosts.push(gh);
    return gh;
  }

  // How far group g can slide by dx before it meets something solid.
  function free(w, g, dx) {
    for (var k = 0; k < g.tiles.length; k++) {
      var rx = g.tiles[k].x * T + g.ox, ry = g.tiles[k].y * T + g.oy;
      var rs = w.collect(dx > 0 ? rx + T : rx + dx, ry + 1, Math.abs(dx), T - 2, g);
      for (var i = 0; i < rs.length; i++) dx = dx > 0 ? Math.min(dx, rs[i].x - rx - T) : Math.max(dx, rs[i].x + rs[i].w - rx);
    }
    return dx;
  }

  function overlapsPlayer(w, g) {
    var p = w.p;
    for (var k = 0; k < g.tiles.length; k++) {
      if (E.overlap(p.x, p.y, PH.w, PH.h, g.tiles[k].x * T + g.ox, g.tiles[k].y * T + g.oy, T, T)) return true;
    }
    return false;
  }

  // The giant carries his door only while your back is turned; while you look
  // (or he waits) he hides it, parked above the screen where it cannot be touched.
  function holdDoor(gh) {
    gh.door.x = gh.x + gh.dox;
    gh.door.y = gh.active && !gh.frozen ? gh.y + gh.doy : -9 * T;
  }

  function ghostStep(w, gh, cx, cy) {
    if (gh.active) {
      gh.frozen = looks(w, gh.x);
      if (!gh.frozen) {
        var dx = cx - gh.x, dy = gh.flat ? 0 : cy - gh.y, d = Math.sqrt(dx * dx + dy * dy), st = gh.speed * DT;
        if (d > 0.5) {
          if (d <= st) { gh.x = cx; if (!gh.flat) gh.y = cy; } else { gh.x += dx / d * st; gh.y += dy / d * st; }
          if (!gh.moved) { gh.moved = true; w.emit('ghostMove', { gh: gh }); }
        }
      }
    }
    if (gh.door) holdDoor(gh);
  }

  function moverStep(w, m, cx) {
    var g = m.g, p = w.p, dx;
    if (!g.active) return;
    if (p.onGround && p.ground === g) {
      // a ride drifts the way your back points while you stand still, and holds still while you walk
      if (w.gh.dir) { m.moving = false; return; }
      dx = -p.face * m.speed * DT;
    } else {
      var gx = m.cx + g.ox, d = cx - gx;
      if (looks(w, gx) || Math.abs(d) < 1) { m.moving = false; return; }
      dx = d > 0 ? Math.min(d, m.speed * DT) : Math.max(d, -m.speed * DT);
    }
    dx = free(w, g, dx);
    m.moving = Math.abs(dx) > 0.01;
    if (m.moving) w.shiftGroup(g, dx, 0);
  }

  function doorStep(w, h, cx) {
    var d = h.d, dc = d.x + 20, dd = cx - dc;
    if (d.m || looks(w, dc) || Math.abs(dd) < 1) { h.moving = false; return; }
    d.x += dd > 0 ? Math.min(dd, h.speed * DT) : Math.max(dd, -h.speed * DT);
    h.moving = true;
  }

  function stoneStep(w, s) {
    var g = s.stones, want = w.p.face === g.haunt, was = g.fake;
    if (!want) g.fake = true;
    else if (g.fake && !overlapsPlayer(w, g)) g.fake = false; // never back inside you
    g.alpha = E.approach(g.alpha, g.fake ? 0 : 1, DT * 7);
    if (g.fake !== was) w.emit(g.fake ? 'stoneFade' : 'stoneBack', { g: g });
  }

  // A ghost's touch: a round sheet, a door-shaped one, or the giant (only while he hides the door).
  function touches(w, gh) {
    var p = w.p;
    if (gh.costume === 'door') return E.overlap(p.x, p.y, PH.w, PH.h, gh.x - 10, gh.y - 14, 20, 44);
    if (gh.costume === 'bubo') return (!gh.active || looks(w, gh.x)) && E.overlap(p.x, p.y, PH.w, PH.h, gh.x - 48, gh.y - 50, 96, 110);
    var qx = Math.max(p.x, Math.min(gh.x, p.x + PH.w)) - gh.x, qy = Math.max(p.y, Math.min(gh.y + 2, p.y + PH.h)) - gh.y - 2;
    return qx * qx + qy * qy < 15 * 15;
  }

  E.mod({
    chars: 'H&',
    cell: function (w, ch, x, y) {
      var s = state(w);
      if (ch === 'H') { makeGhost(s, { x: x, y: y }); return; }
      var g = s.stones || (s.stones = w.newGroup('&'));
      g.own = true; g.haunt = 1;
      g.tiles.push({ x: x, y: y });
      w.owner[y * E.COLS + x] = g;
      // runs of side-by-side stones, each drawn as one slab
      var r = s.runs[s.runs.length - 1];
      if (r && r.y === y && r.x1 === x - 1) r.x1 = x; else s.runs.push({ x0: x, x1: x, y: y });
    },
    init: function (w) { if (w.gh && w.gh.groups !== w.groups) w.gh = null; },
    api: function (L, w) {
      L.ghosts = w.gh ? w.gh.ghosts : NONE;
      L.ghost = function (o) { return makeGhost(state(w), o); };
      L.wakeGhost = function (gh) {
        if (gh.active) return;
        gh.active = true; gh.hidden = false;
        w.emit('ghostWake', { x: gh.x, y: gh.y });
      };
      L.haunt = function (d, speed) {
        var s = state(w);
        if (typeof d === 'string') {
          var g = w.gmap[d], x0 = 99, x1 = 0;
          g.own = true;
          g.tiles.forEach(function (tl) { x0 = Math.min(x0, tl.x); x1 = Math.max(x1, tl.x); });
          s.movers.push({ g: g, speed: speed * T, cx: (x0 + x1 + 1) * T / 2, moving: false });
          return g;
        }
        if (d.g) { d.x += d.g.ox; d.y += d.g.oy; d.g = null; }
        s.doors.push({ d: d, speed: speed * T, moving: false });
        return d;
      };
      L.hauntDir = function (ch, dir) { w.gmap[ch].haunt = dir; };
      L.dark = function (on) { state(w).dark = on !== false; };
      L.lightning = function (every, first) { var s = state(w); s.every = every; s.next = first == null ? every : first; };
    },
    step: function (w) {
      var s = w.gh, i;
      if (!s) return;
      var p = w.p, cx = p.x + PH.w / 2, cy = p.y + PH.h / 2;
      if (s.stones) stoneStep(w, s);
      for (i = 0; i < s.ghosts.length; i++) ghostStep(w, s.ghosts[i], cx, cy);
      for (i = 0; i < s.doors.length; i++) doorStep(w, s.doors[i], cx);
      for (i = 0; i < s.movers.length; i++) { moverStep(w, s.movers[i], cx); if (w.state !== 'play') return; }
      if (s.flash > 0) s.flash -= DT;
      if (s.every) {
        s.next -= DT;
        if (s.next <= 0) { s.next += s.every; s.flash = FLASH; w.emit('thunder', {}); }
      }
    },
    phys: function (w, p, P, dir) { if (w.gh) w.gh.dir = dir; },
    after: function (w) {
      var s = w.gh;
      if (!s) return;
      for (var i = 0; i < s.ghosts.length; i++) {
        var gh = s.ghosts[i];
        if (!gh.hidden && touches(w, gh)) { w.die('boo'); return; }
      }
    }
  });

  /* ================================================================ drawing */
  if (Art) {
    var SHEET = '#f1e6ff', BLUSH = 'rgba(255,105,150,0.7)', GLOW = '#fff6a8', PUFF = ['#ffffff', '#f1e6ff', '#e2c8ff'];
    var DARK_R = 150, WINDOWS = [128, 372, 210, 300, 316, 196, 330, 300, 432, 340, 520, 372];

    Art.GROUND.haunt = { top: '#e9d2ff', drips: 1, mark: 'pebble' };

    var blob = function (g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); };
    // A bare tree: a trunk from the bottom of the screen, branches ending in curls.
    var tree = function (g, x, h, r) {
      var y = E.H - h, k, a, bx, by, s;
      g.lineWidth = 14; g.beginPath(); g.moveTo(x, E.H); g.quadraticCurveTo(x + 18, E.H - h * 0.5, x - 6, y); g.stroke();
      g.lineWidth = 6; g.beginPath();
      for (k = 0; k < 4; k++) {
        s = k % 2 ? 1 : -1; by = y + 20 + k * h * 0.12; bx = x + 4 + s * (40 + r() * 30);
        g.moveTo(x + 2, by + 30); g.quadraticCurveTo(x + s * 20, by, bx, by - 14);
        for (a = 0; a < 7; a++) g.lineTo(bx + s * Math.cos(a * 0.9) * (12 - a * 1.5), by - 14 - Math.sin(a * 0.9) * (12 - a * 1.5));
      }
      g.stroke();
    };
    // A friendly haunted house: a big moon, a lopsided roofline with crooked
    // windows, curly bare trees, white bats and cobwebs in the corners.
    Art.SCENERY.haunt = function (g, pal, r) {
      var i, k, x, y, s, mx = 860 + r() * 260;
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.14; g.beginPath(); blob(g, mx, 175, 135); g.fill();
      g.globalAlpha = 0.18; g.beginPath(); blob(g, mx, 175, 98); g.fill();
      g.fillStyle = '#fff4d8'; g.globalAlpha = 0.85; g.beginPath(); blob(g, mx, 175, 64); g.fill();
      g.fillStyle = '#efd9b4'; g.globalAlpha = 0.6; g.beginPath(); blob(g, mx - 20, 160, 12); blob(g, mx + 18, 190, 9); blob(g, mx + 22, 150, 6); g.fill();
      // the house: wings, a leaning tower and a chimney, all running down behind the floor
      g.fillStyle = pal.bg2; g.globalAlpha = 1; g.beginPath();
      g.moveTo(90, E.H); g.lineTo(96, 330); g.lineTo(70, 330); g.lineTo(190, 225); g.lineTo(300, 318); g.lineTo(282, 318);
      g.lineTo(286, 250); g.lineTo(262, 250); g.lineTo(334, 120); g.lineTo(392, 248); g.lineTo(370, 248);
      g.lineTo(372, 300); g.lineTo(470, 262); g.lineTo(474, 200); g.lineTo(500, 202); g.lineTo(498, 276);
      g.lineTo(600, 318); g.lineTo(576, 320); g.lineTo(590, E.H); g.closePath(); g.fill();
      // tall crooked windows: most are dark, two are lit
      for (i = 0; i < WINDOWS.length; i += 2) {
        x = WINDOWS[i]; y = WINDOWS[i + 1]; s = (i / 2 % 3 - 1) * 4;
        g.fillStyle = i === 2 || i === 8 ? '#fff2b8' : pal.bg; g.globalAlpha = i === 2 || i === 8 ? 0.55 : 0.75;
        g.beginPath(); g.moveTo(x + s, y); g.quadraticCurveTo(x + 13 + s, y - 22, x + 26 + s, y); g.lineTo(x + 26 - s, y + 64); g.lineTo(x - s, y + 64); g.closePath(); g.fill();
      }
      g.strokeStyle = '#b866ec'; g.globalAlpha = 0.5; g.lineCap = 'round'; g.lineJoin = 'round';
      for (x = 700 + r() * 60; x < E.W + 40; x += 230 + r() * 120) tree(g, x, 260 + r() * 120, r);
      tree(g, 30 + r() * 20, 300, r);
      // bats
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.3; g.beginPath();
      for (i = 0; i < 6; i++) {
        x = 120 + i * 200 + r() * 100; y = 150 + r() * 170; s = 0.8 + r() * 0.6;
        g.moveTo(x - 16 * s, y); g.quadraticCurveTo(x - 9 * s, y - 10 * s, x - 3 * s, y - 2 * s); g.lineTo(x, y - 6 * s); g.lineTo(x + 3 * s, y - 2 * s);
        g.quadraticCurveTo(x + 9 * s, y - 10 * s, x + 16 * s, y); g.quadraticCurveTo(x + 8 * s, y - 3 * s, x, y + 4 * s); g.quadraticCurveTo(x - 8 * s, y - 3 * s, x - 16 * s, y);
      }
      g.fill();
      // cobwebs in the two top corners of the room
      g.strokeStyle = '#ffffff'; g.globalAlpha = 0.4; g.lineWidth = 1.5; g.beginPath();
      for (i = 0; i < 2; i++) {
        x = i ? E.W - T : T; s = i ? -1 : 1;
        for (k = 0; k < 5; k++) { g.moveTo(x, 3 * T); g.lineTo(x + s * Math.cos(k * Math.PI / 8) * 96, 3 * T + Math.sin(k * Math.PI / 8) * 96); }
        for (y = 30; y < 96; y += 26) {
          g.moveTo(x + s * y, 3 * T);
          for (k = 1; k < 5; k++) g.quadraticCurveTo(x + s * Math.cos((k - 0.5) * Math.PI / 8) * y * 0.8, 3 * T + Math.sin((k - 0.5) * Math.PI / 8) * y * 0.8, x + s * Math.cos(k * Math.PI / 8) * y, 3 * T + Math.sin(k * Math.PI / 8) * y);
        }
      }
      g.stroke();
    };

    // Sprites: every ghost pose, Bubo, the stones and the raft are painted once
    // into small canvases (2x, so they stay sharp) and blitted each frame. They
    // are cached by kind and a number per palette ink (only this world's palette
    // draws ghosts today, but another world may borrow them).
    var SC = 2, cache = null, cacheInk = '';
    var sprite = function (pal, kind, i, w, h, ox, oy, paint, a, b, c) {
      if (pal.ink !== cacheInk) { cache = { g: [], d: [], b: [], s: [], r: [], h: [] }; cacheInk = pal.ink; }
      var s = cache[kind][i];
      if (s) return s;
      var cv = document.createElement('canvas');
      cv.width = w * SC; cv.height = h * SC;
      var g = cv.getContext('2d');
      g.setTransform(SC, 0, 0, SC, ox * SC, oy * SC);
      g.lineJoin = 'round'; g.lineCap = 'round';
      paint(g, pal, a, b, c);
      return (cache[kind][i] = { c: cv, ox: ox, oy: oy, w: w, h: h });
    };
    var blit = function (ctx, s, x, y) { ctx.drawImage(s.c, x - s.ox, y - s.oy, s.w, s.h); };

    // The sheet: a round top, straight sides and a hem of three scallops (r = half width).
    var sheet = function (g, r, wig) {
      g.beginPath(); g.moveTo(-r, 14); g.arc(0, -4, r, Math.PI, 0); g.lineTo(r, 14);
      for (var k = 0; k < 3; k++) g.quadraticCurveTo(r - (2 * k + 1) * r / 3, 23 + (k % 2 ? -wig : wig), r - (2 * k + 2) * r / 3, 14);
      g.closePath();
    };
    // The face: asleep (closed eyes), shy (hands over the eyes, pink cheeks) or
    // drifting (big eyes looking your way and a little "oo" mouth).
    var face = function (g, mood, lx, ink) {
      g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 2.5;
      if (mood === 0) {
        g.beginPath(); g.arc(-6, -6, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); g.moveTo(9.4, -5); g.arc(6, -6, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      } else if (mood === 1) {
        g.fillStyle = BLUSH; g.beginPath(); g.ellipse(-10, 3, 4, 2.6, 0, 0, TAU); g.ellipse(10, 3, 4, 2.6, 0, 0, TAU); g.fill();
        g.fillStyle = SHEET; g.lineWidth = 2;
        g.beginPath(); g.arc(-6, -6, 5.5, 0, TAU); g.moveTo(11.5, -6); g.arc(6, -6, 5.5, 0, TAU); g.fill(); g.stroke();
      } else {
        g.beginPath(); g.ellipse(lx - 6, -6, 3.6, 5.2, 0, 0, TAU); g.ellipse(lx + 6, -6, 3.6, 5.2, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(lx - 6, -10, 2, 2); g.fillRect(lx + 6, -10, 2, 2);
        g.fillStyle = ink; g.beginPath(); g.ellipse(lx, 5, 2.6, 3.4, 0, 0, TAU); g.fill();
      }
    };
    var moodOf = function (gh) { return !gh.active ? 0 : gh.frozen ? 1 : 2; };
    var lookAt = function (w, x) { return w.p.x + PH.w / 2 > x ? 1 : -1; };
    // the hem flaps between two shapes while a ghost is awake
    var hemOf = function (gh, t) { return gh.active ? (Math.sin(t * 6 + gh.ph) > 0 ? 1 : -1) : 0; };

    // mood 0-2 (see face), look and hem -1, 0 or 1
    var paintGhost = function (g, pal, mood, look, hem) {
      sheet(g, 17, hem * 3);
      g.fillStyle = SHEET; g.fill(); g.lineWidth = 3; g.strokeStyle = pal.ink; g.stroke();
      face(g, mood, look * 2, pal.ink);
    };
    // A ghost in a door costume, once found out: a lilac door with a wavy hem and a face.
    var paintCostume = function (g, pal, mood, look, hem) {
      g.beginPath(); g.moveTo(-20, 22); g.lineTo(-20, -14); g.arc(0, -14, 20, Math.PI, 0); g.lineTo(20, 22);
      for (var k = 0; k < 3; k++) g.quadraticCurveTo(20 - (2 * k + 1) * 20 / 3, 31 + (k % 2 ? -hem : hem) * 3, 20 - (2 * k + 2) * 20 / 3, 22);
      g.closePath(); g.fillStyle = SHEET; g.fill(); g.lineWidth = 3; g.strokeStyle = pal.ink; g.stroke();
      g.fillStyle = pal.bg2; g.beginPath(); g.moveTo(-12, 18); g.lineTo(-12, -12); g.arc(0, -12, 12, Math.PI, 0); g.lineTo(12, 18); g.closePath(); g.fill();
      g.translate(0, -2);
      face(g, mood, look * 2, pal.ink);
    };
    // Bubo the giant in a top hat. Shy (you look, or he waits): eyes squeezed shut,
    // pink cheeks and his arms folded over the door he hides. Otherwise he grins.
    var paintBubo = function (g, pal, shy, look, hem) {
      var s = 2.8, ink = pal.ink;
      g.scale(s, s);
      sheet(g, 17, hem * 2);
      g.fillStyle = SHEET; g.fill(); g.lineWidth = 3 / s; g.strokeStyle = ink; g.stroke();
      g.fillStyle = ink; g.fillRect(-11, -24, 22, 3); g.fillRect(-7, -34, 14, 11);
      g.fillStyle = '#ff6fa8'; g.fillRect(-7, -27, 14, 2.5);
      g.lineWidth = 1.5; g.fillStyle = ink; g.beginPath();
      if (shy) {
        g.arc(-6, -7, 3.2, 1.15 * Math.PI, 1.85 * Math.PI); g.moveTo(8.8, -8.5); g.arc(6, -7, 3.2, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
        g.fillStyle = BLUSH; g.beginPath(); g.ellipse(-10.5, -1, 3.6, 2.2, 0, 0, TAU); g.ellipse(10.5, -1, 3.6, 2.2, 0, 0, TAU); g.fill();
        g.fillStyle = SHEET; g.lineWidth = 3 / s; g.beginPath(); g.ellipse(0, 9, 13, 5, 0, 0, TAU); g.fill(); g.stroke();
      } else {
        g.ellipse(look * 1.2 - 6, -7, 3, 4.4, 0, 0, TAU); g.ellipse(look * 1.2 + 6, -7, 3, 4.4, 0, 0, TAU); g.fill();
        g.beginPath(); g.arc(look * 1.2, -1, 5, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
      }
    };
    // A run of haunted stones (wd px wide): a lilac slab with a sleepy face and
    // two ghostly tails, or (while you look away) just a dashed outline.
    var paintStone = function (g, pal, wd, dashed) {
      if (dashed) { g.setLineDash([6, 5]); g.lineWidth = 2; g.strokeStyle = '#ffffff'; Art.rr(g, 3, 3, wd - 6, T - 8, 10); g.stroke(); return; }
      g.strokeStyle = SHEET; g.lineWidth = 5; g.beginPath();
      g.moveTo(12, T - 6); g.quadraticCurveTo(5, T + 5, 12, T + 14); g.moveTo(wd - 12, T - 6); g.quadraticCurveTo(wd - 5, T + 5, wd - 12, T + 14); g.stroke();
      Art.rr(g, 2, 1, wd - 4, T - 6, 12);
      g.fillStyle = SHEET; g.fill(); g.lineWidth = 3; g.strokeStyle = pal.ink; g.stroke();
      g.fillStyle = '#ffffff'; g.fillRect(8, 6, wd - 16, 4);
      g.lineWidth = 2.2; g.beginPath();
      g.arc(wd / 2 - 8, 18, 3, 0.15 * Math.PI, 0.85 * Math.PI); g.moveTo(wd / 2 + 10.6, 19.4); g.arc(wd / 2 + 8, 18, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    };
    // A haunted raft (wd px wide): lilac planks with eyes that look your way.
    var paintRaft = function (g, pal, wd, look) {
      Art.rr(g, 1.5, 1.5, wd - 3, T - 11, 8);
      g.fillStyle = '#d9b8f5'; g.fill(); g.lineWidth = 3; g.strokeStyle = pal.ink; g.stroke();
      g.lineWidth = 2; g.beginPath();
      for (var k = 1; k < 6; k++) { g.moveTo(k * wd / 6, 5); g.lineTo(k * wd / 6, T - 13); }
      g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(wd / 2 - 9, 15, 6.5, 7.5, 0, 0, TAU); g.ellipse(wd / 2 + 9, 15, 6.5, 7.5, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = pal.ink; g.beginPath(); g.arc(wd / 2 - 9 + look * 3, 16, 3, 0, TAU); g.arc(wd / 2 + 9 + look * 3, 16, 3, 0, TAU); g.fill();
    };

    var drawGhost = function (ctx, w, gh, pal, t) {
      var m = moodOf(gh), lk = m === 2 ? lookAt(w, gh.x) : 0, hem = hemOf(gh, t), bob = gh.active ? Math.sin(t * 3 + gh.ph) * 2.5 : 0;
      if (gh.costume === 'bubo') {
        // carrying the door he floats a little higher, so his grin shows above it
        var shy = m < 2 ? 1 : 0;
        blit(ctx, sprite(pal, 'b', shy * 9 + lk * 3 + hem + 4, 108, 180, 54, 104, paintBubo, shy, lk, hem), gh.x, gh.y - 16 + shy * 12 + Math.sin(t * 2) * 2);
      } else if (gh.costume !== 'door') blit(ctx, sprite(pal, 'g', m * 9 + lk * 3 + hem + 4, 44, 56, 22, 26, paintGhost, m, lk, hem), gh.x, gh.y + bob);
      else if (gh.moved) blit(ctx, sprite(pal, 'd', m * 9 + lk * 3 + hem + 4, 48, 76, 24, 38, paintCostume, m, lk, hem), gh.x, gh.y + bob * 0.8);
      else {
        // until it first moves, a costume is drawn exactly like a door, glow included
        var pulse = Math.sin(t * 4);
        ctx.globalAlpha = 0.18 + 0.1 * pulse; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(gh.x, gh.y + 2, 38 + 4 * pulse, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        gh.dd.x = gh.x - 20; gh.dd.y = gh.y - 30;
        Art.drawDoor(ctx, gh.dd, pal, t, false);
      }
    };

    var drawStones = function (ctx, s, pal) {
      var a = s.stones.alpha, i, r, wd;
      for (i = 0; i < s.runs.length; i++) {
        r = s.runs[i]; wd = (r.x1 - r.x0 + 1) * T;
        if (a > 0.01) { ctx.globalAlpha = a; blit(ctx, sprite(pal, 's', wd / T * 2, wd, T + 18, 0, 0, paintStone, wd, 0), r.x0 * T, r.y * T); }
        if (a < 0.99) { ctx.globalAlpha = (1 - a) * 0.8; blit(ctx, sprite(pal, 's', wd / T * 2 + 1, wd, T + 18, 0, 0, paintStone, wd, 1), r.x0 * T, r.y * T); }
      }
      ctx.globalAlpha = 1;
    };

    // The raft's tails wave hard while it glides.
    var drawRaft = function (ctx, w, m, pal, t) {
      var g = m.g, x = g.tiles[0].x * T + g.ox, y = g.tiles[0].y * T + g.oy, wd = g.tiles.length * T, k, tx;
      var wv = m.moving ? Math.sin(t * 12) * 5 : Math.sin(t * 3) * 2;
      ctx.strokeStyle = SHEET; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
      for (k = 0; k < 3; k++) { tx = x + 18 + k * (wd - 36) / 2; ctx.moveTo(tx, y + T - 12); ctx.quadraticCurveTo(tx + wv, y + T + 2, tx - wv * 0.5, y + T + 12); }
      ctx.stroke();
      k = lookAt(w, m.cx + g.ox);
      blit(ctx, sprite(pal, 'r', wd / T * 3 + k + 1, wd, T, 0, 0, paintRaft, wd, k), x, y);
    };

    // A haunted door trails wisps while it creeps; while you look at it, it
    // squeezes its eyes shut and blushes.
    var drawShyDoor = function (ctx, w, h, pal, t) {
      var d = h.d, dir = lookAt(w, d.x + 20), wv = Math.sin(t * 10) * 4, bx = dir > 0 ? d.x : d.x + 40;
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      if (h.moving) {
        ctx.strokeStyle = SHEET; ctx.globalAlpha = 0.85; ctx.beginPath();
        ctx.moveTo(bx, d.y + 50); ctx.quadraticCurveTo(bx - dir * 12, d.y + 46 + wv, bx - dir * 22, d.y + 54);
        ctx.moveTo(bx, d.y + 32); ctx.quadraticCurveTo(bx - dir * 14, d.y + 28 - wv, bx - dir * 24, d.y + 36);
        ctx.lineWidth = 5; ctx.stroke(); ctx.globalAlpha = 1;
        return;
      }
      if (!looks(w, d.x + 20)) return;
      ctx.strokeStyle = pal.ink; ctx.beginPath();
      ctx.arc(d.x + 14, d.y + 21, 3, 1.15 * Math.PI, 1.85 * Math.PI); ctx.moveTo(d.x + 28.8, d.y + 19.6); ctx.arc(d.x + 26, d.y + 21, 3, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = BLUSH; ctx.beginPath(); ctx.ellipse(d.x + 11, d.y + 28, 3.5, 2.2, 0, 0, TAU); ctx.ellipse(d.x + 29, d.y + 28, 3.5, 2.2, 0, 0, TAU); ctx.fill();
    };

    // The lights-out layer: an ink square with a soft round hole, made once per level.
    var darkC = null, darkFor = null;
    var darkHole = function (w, pal) {
      if (darkC && darkFor === w.def) return darkC;
      darkC = darkC || document.createElement('canvas');
      darkC.width = darkC.height = DARK_R * 2;
      var g = darkC.getContext('2d'), gr = g.createRadialGradient(DARK_R, DARK_R, 0, DARK_R, DARK_R, DARK_R);
      g.fillStyle = pal.ink; g.fillRect(0, 0, DARK_R * 2, DARK_R * 2);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,1)'); gr.addColorStop(0.75, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(0, 0, DARK_R * 2, DARK_R * 2);
      darkFor = w.def;
      return darkC;
    };
    // The dark around the hole: four rects, each 1 px into the hole's opaque rim, so no seam shows.
    var drawDark = function (ctx, w, s, pal, t) {
      var cx = Math.round(w.p.x + PH.w / 2), cy = Math.round(w.p.y + PH.h / 2), R = DARK_R, i, gh, x, y;
      ctx.drawImage(darkHole(w, pal), cx - R, cy - R);
      ctx.fillStyle = pal.ink;
      ctx.fillRect(-40, -40, E.W + 80, cy - R + 41);
      ctx.fillRect(-40, cy + R - 1, E.W + 80, E.H - cy - R + 41);
      ctx.fillRect(-40, cy - R, cx - R + 41, 2 * R);
      ctx.fillRect(cx + R - 1, cy - R, E.W - cx - R + 41, 2 * R);
      // a drifting ghost's eyes glow in the dark; a shy one only blushes
      for (i = 0; i < s.ghosts.length; i++) {
        gh = s.ghosts[i];
        if (!gh.active || gh.hidden || gh.costume) continue;
        x = gh.x + (gh.frozen ? 0 : lookAt(w, gh.x) * 2); y = gh.y + Math.sin(t * 3 + gh.ph) * 2.5 - 6;
        ctx.fillStyle = gh.frozen ? BLUSH : GLOW; ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(x - 6, y, 9, 0, TAU); ctx.arc(x + 6, y, 9, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(x - 6, y, 3, 4.5, 0, 0, TAU); ctx.ellipse(x + 6, y, 3, 4.5, 0, 0, TAU); ctx.fill();
      }
    };

    // Bubo's head beside the speech bubbles.
    var hostMsg = null, hostW = 0;
    var paintHead = function (g, pal) {
      var ink = pal.ink;
      g.beginPath(); g.moveTo(-26, 26); g.arc(0, 0, 26, Math.PI, 0); g.lineTo(26, 26);
      for (var k = 0; k < 3; k++) g.quadraticCurveTo(26 - (2 * k + 1) * 26 / 3, 33, 26 - (2 * k + 2) * 26 / 3, 26);
      g.closePath(); g.fillStyle = SHEET; g.fill(); g.lineWidth = 3; g.strokeStyle = ink; g.stroke();
      // the hat gets a pale rim, so it still shows over the dark
      g.lineWidth = 2; g.strokeStyle = SHEET; g.strokeRect(-16, -27, 32, 4); g.strokeRect(-10, -42, 20, 16);
      g.fillStyle = ink; g.fillRect(-16, -27, 32, 4); g.fillRect(-10, -42, 20, 16);
      g.fillStyle = '#ff6fa8'; g.fillRect(-10, -31, 20, 4);
      g.fillStyle = ink; g.beginPath(); g.ellipse(-8, 0, 4, 6, 0, 0, TAU); g.ellipse(8, 0, 4, 6, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(-8, -4, 2.4, 2.4); g.fillRect(8, -4, 2.4, 2.4);
      g.fillStyle = BLUSH; g.beginPath(); g.ellipse(-15, 9, 5, 3, 0, 0, TAU); g.ellipse(15, 9, 5, 3, 0, 0, TAU); g.fill();
      g.fillStyle = ink; g.beginPath(); g.ellipse(0, 12, 4, 5, 0, 0, TAU); g.fill();
    };

    Art.mod({
      draw: function (ctx, w, pal, t) {
        var s = w.gh, i;
        if (!s) return;
        if (s.stones) drawStones(ctx, s, pal);
        for (i = 0; i < s.movers.length; i++) if (s.movers[i].g.active) drawRaft(ctx, w, s.movers[i], pal, t);
        for (i = 0; i < s.ghosts.length; i++) if (!s.ghosts[i].hidden) drawGhost(ctx, w, s.ghosts[i], pal, t);
      },
      front: function (ctx, w, pal, t) {
        var s = w.gh, i, gh, d;
        if (!s) return;
        for (i = 0; i < s.doors.length; i++) drawShyDoor(ctx, w, s.doors[i], pal, t);
        // the giant's hands hold his door from the front while he carries it
        for (i = 0; i < s.ghosts.length; i++) {
          gh = s.ghosts[i]; d = gh.door;
          if (!d || !gh.active || gh.frozen) continue;
          ctx.fillStyle = SHEET; ctx.strokeStyle = pal.ink; ctx.lineWidth = 3; ctx.beginPath();
          ctx.ellipse(d.x - 2, d.y + 34, 9, 7, 0, 0, TAU); ctx.moveTo(d.x + 51, d.y + 34); ctx.ellipse(d.x + 42, d.y + 34, 9, 7, 0, 0, TAU);
          ctx.fill(); ctx.stroke();
        }
        if (!s.dark) return;
        // lightning lifts the dark (and flashes, unless motion is reduced); so does a death, to show what got you
        if (s.flash > 0 || w.state === 'dead') {
          if (s.flash > 0 && !root.Kit.motion.reduced()) {
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.45 * s.flash / FLASH; ctx.fillRect(-40, -40, E.W + 80, E.H + 80); ctx.globalAlpha = 1;
          }
          return;
        }
        drawDark(ctx, w, s, pal, t);
      },
      // Bubo pops up beside every speech bubble in his world.
      hud: function (ctx, w, pal, t, ui) {
        var gm = ui.game;
        if (pal.theme !== 'haunt' || !gm.msg || gm.msgT <= 0) return;
        if (gm.msg !== hostMsg) { hostMsg = gm.msg; ctx.font = '700 28px ' + Art.FONT; ctx.direction = 'rtl'; hostW = ctx.measureText(hostMsg).width + 44; }
        var pop = 1 + Math.max(0, gm.msgT - 1.5) * 0.4, h = sprite(pal, 'h', 0, 64, 80, 32, 46, paintHead);
        ctx.globalAlpha = Math.min(1, gm.msgT * 4);
        ctx.drawImage(h.c, Math.min(1240, 640 + hostW * pop / 2 + 34) - h.ox * pop, 170 + Math.sin(t * 4) * 3 - h.oy * pop, h.w * pop, h.h * pop);
        ctx.globalAlpha = 1;
      }
    });

    Art.EV.ghostWake = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 14, colors: PUFF, speed: 170, life: 0.5, size: 8, gravity: -60 });
      ui.shake.add(3);
      ui.sfx('boo');
    };
    // a door in costume gives itself away with a puff
    Art.EV.ghostMove = function (d, ui) {
      if (d.gh.costume === 'door') ui.fx.burst(d.gh.x, d.gh.y, { count: 10, colors: PUFF, speed: 140, life: 0.45, size: 7, gravity: -60 });
    };
    Art.EV.stoneFade = function (d, ui) {
      d.g.rects(function (rx, ry) { ui.fx.burst(rx + T / 2, ry + T / 2, { count: 2, colors: PUFF, speed: 80, life: 0.4, size: 5, gravity: -80 }); });
      ui.sfx('hauntFade');
    };
    Art.EV.stoneBack = function (d, ui) { ui.sfx('hauntBack'); };
    Art.EV.thunder = function (d, ui) { ui.shake.add(3); ui.sfx('thunder'); };

    Art.SFX.boo = function (A) {
      [0, 1, 2, 3, 4].forEach(function (i) { A.tone({ freq: i % 2 ? 190 : 240, to: i % 2 ? 240 : 190, type: 'sine', dur: 0.13, vol: 0.2, delay: i * 0.11 }); });
      A.tone({ freq: 150, to: 95, type: 'triangle', dur: 0.6, vol: 0.12 });
    };
    Art.SFX.thunder = function (A) {
      A.noise({ dur: 0.18, vol: 0.25, filter: 4000, to: 900 });
      A.noise({ dur: 1.1, vol: 0.32, filter: 700, to: 60, delay: 0.08 });
    };
    Art.SFX.hauntFade = function (A) { A.tone({ freq: 700, to: 300, type: 'sine', dur: 0.2, vol: 0.07 }); };
    Art.SFX.hauntBack = function (A) { A.tone({ freq: 300, to: 650, type: 'sine', dur: 0.16, vol: 0.06 }); };
    Art.CAUSE.boo = ['بوو! أخافك الشبح!', 'الشبح كان خلفك!'];

    // The ghost skin: a pale sheet with a wavy white hem over the feet and a
    // little curl of tail behind.
    Art.SKINS.push({ id: 'ghost', name: 'الشبح', stars: 240, body: '#f4f0ff' });
    Art.ACC.ghost = function (ctx, fc, t, ink) {
      ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(14, -8); ctx.lineTo(14, -1);
      for (var k = 0; k < 4; k++) ctx.quadraticCurveTo(14 - (2 * k + 1) * 3.5, 6, 14 - (2 * k + 2) * 3.5, -1);
      ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-fc * 13, -13); ctx.quadraticCurveTo(-fc * 21, -12, -fc * 26, -18); ctx.quadraticCurveTo(-fc * 23, -4, -fc * 13, -3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    };
  }

  /* ================================================================ levels */
  var B = root.TrollLevels.B, room = B.room, pit = B.pit;
  var LEVELS = [];

  // Click: lights out, with the first flash of lightning once the title card is gone.
  function lightsOut(L) { L.dark(true); L.lightning(2.5, Math.max(1.2, 2.6 - L.t())); L.sfx('click'); L.msg('كليك!'); }

  // 11-1: level 25's patience bridge, and a ghost that comes while you wait.
  LEVELS.push({
    name: 'لا تنظر خلفك!',
    msg: 'أنا بوبو! انتظر... ولا تنظر خلفك!',
    hint: 'انظر خلفك! اضغط يسارًا ضغطة واحدة ثم قف بلا حركة حتى يظهر الجسر.',
    map: (function () {
      var b = room();
      pit(b, 10, 24);
      return b.f(10, 13, 24, 13, 'a').s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      var a = L.g('a'), gh = L.ghost({ x: 1, y: 11, hidden: true }), still = 0;
      a.active = false;
      L.when(function () { return L.px() >= 6 && L.t() > 2.2; }, function () { L.wakeGhost(gh); L.msg('لا تلتفت! لا يوجد شيء خلفك!'); });
      L.world.ticks.push(function () {
        if (a.active || !gh.active) return;
        // 2 s standing still once the ghost is out: it reaches you first unless you look at it
        still = L.grounded() && Math.abs(L.world.p.vx) < 20 && L.px() > 6 ? still + 1 : 0;
        if (still > 120) { a.show(); L.world.reveal(a); L.msg('حسنًا... جسر للشجعان!'); }
      });
    },
    sol: 'R55 L2 _200 R300'
  });

  // 11-2: haunted stones over spikes, and a fake "boo" behind you halfway.
  LEVELS.push({
    name: 'الحجارة الخجولة',
    msg: 'حجارتي تختفي إن نظرت خلفك!',
    hint: 'لا يوجد شبح خلفك! لا تلتفت، واقفز من حجر إلى حجر.',
    winMsg: 'لم تلتفت! لا أحد يخدعك!',
    map: (function () {
      var b = room();
      pit(b, 10, 25);
      return b.f(12, 13, 13, 13, '&').f(17, 13, 18, 13, '&').f(22, 13, 23, 13, '&').s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      L.when(function () { return L.on('&') && L.px() > 16; }, function () { L.sfx('boo'); L.shake(4); L.msg('انظر خلفك! بسرعة!'); });
    },
    sol: 'R54 RJ20 R16 RJ20 R16 RJ20 R20 RJ20 R300'
  });

  // 11-3: one ghost behind you, one in front: you can only look one way.
  LEVELS.push({
    name: 'الشبحان',
    msg: 'نحن اثنان! هيهي!',
    hint: 'اقفز فوق الشبح المتجمد ثم اركض: الأشباح أبطأ منك.',
    map: (function () {
      var b = room();
      pit(b, 20, 22);
      return b.s(1, 11, 'H').s(14, 12, 'H').s(5, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      L.when(function () { return Math.abs(L.world.p.vx) > 0 && L.t() > 2.2; }, function () { L.wakeGhost(L.ghosts[0]); L.wakeGhost(L.ghosts[1]); });
    },
    sol: 'R60 RJ20 R30 RJ20 R300'
  });

  // 11-4: no way over the spikes, but the shy door comes to you if you turn your back.
  LEVELS.push({
    name: 'الباب المسكون',
    msg: 'الباب خجول جدًا...',
    hint: 'الباب خجول! أدر ظهرك له وانتظر... سيأتي إليك.',
    winMsg: 'بوو... أوه، ربحت؟',
    map: (function () {
      var b = room();
      return b.f(17, 3, 30, 9, '#').f(18, 10, 24, 10, 'v').f(18, 12, 24, 12, '^').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) { L.haunt(L.door, 5); },
    sol: 'R60 L2 _400'
  });

  // 11-5: lights out over level 6's crumbling bridge, with a spike you only see late.
  LEVELS.push({
    name: 'انطفأت الأنوار',
    msg: 'غرفة سهلة... أليس كذلك؟',
    hint: 'انتظر البرق لترى الطريق! ولا تتوقف على الجسر.',
    map: (function () {
      var b = room();
      pit(b, 8, 20);
      return b.f(8, 13, 20, 13, 'a').s(2, 12, 'P').s(24, 12, '^').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      L.g('a').crumble(0.1);
      L.onX(4, function () {
        lightsOut(L);
        L.after(2, function () { L.msg('لا يوجد شبح هنا... ربما'); });
      });
    },
    sol: 'R40 _60 R120 RJ20 R300'
  });

  // 11-6: the haunted raft: call it with your back, then ride it facing the ghost.
  LEVELS.push({
    name: 'الطوف المسكون',
    msg: 'طوفي يحب الرقص إلى الخلف!',
    hint: 'أدر ظهرك لتنادي الطوف، ثم قف عليه وانظر إلى الشبح فيحملك الطوف.',
    map: (function () {
      var b = room();
      pit(b, 9, 20);
      return b.f(18, 13, 20, 13, 'a').s(1, 11, 'H').s(4, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      L.haunt('a', 4);
      L.when(function () { return L.on('a'); }, function () { L.wakeGhost(L.ghosts[0]); });
    },
    sol: 'R20 L2 _150 R30 L2 _150 R200'
  });

  // 11-7: three doors; turn your back for a moment and the two ghosts in costume move.
  LEVELS.push({
    name: 'الأبواب الشبحية',
    msg: 'تذكّر: الباب الخجول يأتي إليك!',
    hint: 'الأبواب التي تتحرك أشباح! الباب الحقيقي لا يتحرك أبدًا.',
    map: room().s(2, 12, 'P').s(24, 12, 'D').done(),
    script: function (L) {
      var a = L.ghost({ x: 12, y: 12, costume: 'door', speed: 2 }), b = L.ghost({ x: 18, y: 12, costume: 'door', speed: 2 });
      // woken quietly: until they move they are just doors
      L.when(function () { return L.px() >= 4 && L.t() > 2.2; }, function () { a.active = b.active = true; });
      L.when(function () { return a.moved || b.moved; }, function () { L.sfx('boo'); L.msg('بوو! خدعناك!'); });
    },
    sol: 'R30 _110 L2 _40 R27 RJ20 R25 RJ20 R300'
  });

  // 11-8: level 10's pillars: reversed controls, and a ghost arriving while you wait.
  LEVELS.push({
    name: 'انظر بالعكس',
    msg: 'الأعمدة مرة أخرى؟ سهلة!',
    hint: 'التحكم معكوس: لتنظر إلى الشبح خلفك اضغط يمينًا!',
    map: (function () {
      var b = room();
      pit(b, 9, 24);
      // level 10's pillars, the first and last one tile wider: a look back with reversed keys steps you left
      b.f(11, 13, 13, 16, '#').f(16, 13, 18, 16, '#').f(21, 13, 23, 16, '#');
      return b.s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      // the ghost comes out behind you as the controls flip, so it arrives while they are still reversed
      var gh = L.ghost({ x: 4, y: 11, hidden: true });
      L.when(function () { return L.grounded() && L.px() >= 11 && L.px() < 14; }, function () { L.reverse(2.5); L.wakeGhost(gh); });
      L.when(function () { return L.grounded() && L.px() >= 21 && L.px() < 24; }, function () { L.reverse(2.5); });
    },
    sol: 'R45 RJ20 R14 _20 R2 _150 R10 RJ20 R20 RJ20 R10 _20 R2 _170 R10 RJ20 R300'
  });

  // 11-9: darkness, a ghost behind you and haunted stones that fade when you look back.
  LEVELS.push({
    name: 'ظلام وأشباح',
    msg: 'هذه المرة يوجد شبح حقًا!',
    hint: 'جمّد الشبح قبل الحجارة، ثم انظر إلى الأمام واعبر بسرعة.',
    map: (function () {
      var b = room();
      pit(b, 10, 21);
      return b.f(12, 13, 14, 13, '&').f(17, 13, 19, 13, '&').s(2, 12, 'P').s(25, 12, '^').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      var gh = L.ghost({ x: 1, y: 11, hidden: true });
      L.onX(3, function () { lightsOut(L); });
      L.when(function () { return L.px() >= 4 && L.t() > 2.2; }, function () { L.wakeGhost(gh); });
    },
    sol: 'R50 RJ20 R16 RJ20 R16 RJ20 R10 L2 _60 R10 RJ20 R300'
  });

  // 11-10: Bubo's mansion: every ghost trick, then the giant host holding the real door.
  LEVELS.push({
    name: 'قصر بوبو',
    msg: 'أهلًا في قصري! الباب معي... هيهي',
    winMsg: 'بوو!... لماذا تضحك؟ أنا مخيف!',
    hint: 'لا تلتفت على الحجارة، واكشف الأبواب، وفي النهاية أدر ظهرك لبوبو.',
    map: (function () {
      var b = room();
      pit(b, 4, 14);
      return b.f(6, 13, 7, 13, '&').f(11, 13, 12, 13, '&').s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      var chaser = L.ghost({ x: 1, y: 10, hidden: true });
      var a = L.ghost({ x: 19, y: 12, costume: 'door', speed: 2 }), b = L.ghost({ x: 24, y: 12, costume: 'door', speed: 2 });
      var bubo = L.ghost({ x: 29, y: 11, costume: 'bubo', speed: 3, door: L.door });
      L.when(function () { return L.px() >= 3 && L.t() > 2.2; }, function () { L.wakeGhost(chaser); });
      L.when(function () { return L.on('&') && L.px() > 10; }, function () { L.sfx('boo'); L.shake(4); L.msg('انظر خلفك!'); });
      L.when(function () { return L.px() >= 15; }, function () { a.active = b.active = true; });
      // Bubo stirs once both doors are behind you (sooner, a back turned at the start would bring his door over everything)
      L.when(function () { return L.px() > b.x / L.T + 1; }, function () { bubo.active = true; L.msg('لن تأخذ بابي! هيهي'); });
    },
    sol: 'R4 RJ20 R18 RJ20 R18 RJ20 R4 L2 _20 R10 RJ20 R19 RJ20 R10 L2 _200'
  });

  root.TrollLevels.addWorld({ name: 'عالم الأشباح', n: LEVELS.length, theme: 'haunt', bg: '#d38cff', bg2: '#dea6ff', ink: '#24123a', ink2: '#43285f', accent: '#ffffff' }, LEVELS);
})(typeof window !== 'undefined' ? window : globalThis);

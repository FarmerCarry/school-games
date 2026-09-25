/*
 * Beat Dash — deterministic simulation (no drawing, no audio).
 * Units: 1 = one block. y points UP, the ground surface is y = 0.
 * The same file runs in the browser (window.BD) and in Node for level checks.
 *
 * Level chunks are ASCII art (top row first). One character = one block cell.
 *   #  block            =  thin slab (top half of the cell)
 *   ^  spike up         v  spike down (hangs from above)
 *   ,  small spike up   '  small spike down
 *   Y  yellow jump pad  B  blue gravity pad   (sticks to the floor or ceiling next to it)
 *   o  yellow orb       p  pink orb (small hop)   b  blue orb (flips gravity)
 *   G  gravity portal: upside down       N  gravity portal: normal
 *   R  rocket portal    C  cube portal
 *   1..4 speed portals (slow, normal, fast, very fast)
 *   *  star (3 per level)      |  ruler only (ignored), one group = one beat
 */
(function (root) {
  'use strict';
  var BD = root.BD || (root.BD = {});

  var P = BD.PHYS = {
    HZ: 60, SUB: 4,
    GRAV: 105, JUMPV: 21, MAXFALL: 26,
    PADV: 28.5, PADV_BLUE: 11,
    ORBV: 21, ORB_PINK: 15.5, ORB_BLUE: 8,
    R_UP: 44, R_DOWN: 40, R_VMAX: 8.5,
    SNAP: 0.3, BUF: 6, COYOTE: 20, // COYOTE counted in substeps (5 ticks)
    HAZ: 0.15, INNER: 0.3, SIDE: 0.04,
    ORB_R: 1.05, STAR_R: 0.95,
    TIERS: [0.75, 1, 1.25, 1.5]
  };

  var SOLID = { '#': 1, '=': 1 };

  /* ------------------------------------------------------------ compile */
  BD.compile = function (def) {
    var objs = [], grid = [], slabs = [], x = 0, starIdx = 0, pending = [];
    function gridSet(c, r) { grid[c] = (grid[c] || 0) | (1 << r); }
    function isSolidCell(c, r) { return r < 0 || !!(grid[c] & (1 << r)); }
    function add(o) { o.id = objs.length; objs.push(o); return o; }

    def.chunks.forEach(function (chunk) {
      var rows = chunk, h = rows.length, w = 0, r, c;
      for (r = 0; r < h; r++) w = Math.max(w, rows[r].replace(/\|/g, '').length);
      for (r = 0; r < h; r++) {
        var rb = h - 1 - r, line = rows[r].replace(/\|/g, '');
        for (c = 0; c < line.length; c++) {
          var ch = line[c], X = x + c;
          if (ch === ' ' || ch === '.') continue;
          if (ch === '#') { add({ t: 'block', solid: 1, x1: X, y1: rb, x2: X + 1, y2: rb + 1, c: X, r: rb }); gridSet(X, rb); }
          else if (ch === '=') { add({ t: 'slab', solid: 1, x1: X, y1: rb + 0.5, x2: X + 1, y2: rb + 1, c: X, r: rb }); slabs[X] = (slabs[X] || 0) | (1 << rb); }
          else if (ch === '^') add({ t: 'spike', haz: 1, dir: 1, x1: X + 0.33, y1: rb, x2: X + 0.67, y2: rb + 0.6, c: X, r: rb });
          else if (ch === 'v') add({ t: 'spike', haz: 1, dir: -1, x1: X + 0.33, y1: rb + 0.4, x2: X + 0.67, y2: rb + 1, c: X, r: rb });
          else if (ch === ',') add({ t: 'mini', haz: 1, dir: 1, x1: X + 0.34, y1: rb, x2: X + 0.66, y2: rb + 0.32, c: X, r: rb });
          else if (ch === "'") add({ t: 'mini', haz: 1, dir: -1, x1: X + 0.34, y1: rb + 0.68, x2: X + 0.66, y2: rb + 1, c: X, r: rb });
          else if (ch === 'Y' || ch === 'B') pending.push({ ch: ch, X: X, rb: rb });
          else if (ch === 'o' || ch === 'p' || ch === 'b') add({ t: 'orb', kind: ch, cx: X + 0.5, cy: rb + 0.5, x1: X, y1: rb, x2: X + 1, y2: rb + 1, c: X, r: rb });
          else if ('GNRC1234'.indexOf(ch) >= 0) add({ t: 'portal', kind: ch, x1: X + 0.2, y1: rb - 1, x2: X + 0.8, y2: rb + 2, cx: X + 0.5, cy: rb + 0.5, c: X, r: rb });
          else if (ch === '*') add({ t: 'star', idx: starIdx++, cx: X + 0.5, cy: rb + 0.5, x1: X, y1: rb, x2: X + 1, y2: rb + 1, c: X, r: rb });
        }
      }
      x += w;
    });
    // pads attach to whatever solid is next to them
    pending.forEach(function (p) {
      var up = isSolidCell(p.X, p.rb - 1) || !isSolidCell(p.X, p.rb + 1);
      add(up
        ? { t: 'pad', kind: p.ch, dir: 1, x1: p.X + 0.1, y1: p.rb, x2: p.X + 0.9, y2: p.rb + 0.3, c: p.X, r: p.rb }
        : { t: 'pad', kind: p.ch, dir: -1, x1: p.X + 0.1, y1: p.rb + 0.7, x2: p.X + 0.9, y2: p.rb + 1, c: p.X, r: p.rb });
    });

    var width = x;
    var cols = [];
    for (var i = 0; i < width + 40; i++) cols.push([]);
    objs.forEach(function (o) {
      o.c0 = Math.max(0, Math.floor(o.x1));
      var cEnd = Math.min(width + 39, Math.ceil(o.x2) - 1);
      for (var cc = o.c0; cc <= cEnd; cc++) cols[cc].push(o);
    });
    var L = {
      def: def, id: def.id, name: def.name,
      speed: def.bpm / 15, bpm: def.bpm,
      objs: objs, cols: cols, grid: grid, slabs: slabs, width: width,
      finishX: width, stars: starIdx, maxY: 40
    };
    return L;
  };

  /* -------------------------------------------------------------- state */
  BD.newState = function (L) {
    return {
      tick: 0, x: 0, y: 0, vy: 0, grav: 1, mode: 0, tier: 1,
      onGround: true, coyote: 0, buf: 0, dead: false, won: false,
      used: [], stars: 0, jumps: 0, air: 0,
      px: 0, py: 0, ev: null
    };
  };

  BD.clone = function (s) {
    return {
      tick: s.tick, x: s.x, y: s.y, vy: s.vy, grav: s.grav, mode: s.mode, tier: s.tier,
      onGround: s.onGround, coyote: s.coyote, buf: s.buf, dead: s.dead, won: s.won,
      used: s.used.slice(), stars: s.stars, jumps: s.jumps, air: s.air,
      px: s.px, py: s.py, ev: s.ev ? [] : null
    };
  };

  function ev(s, t, o) { if (s.ev) s.ev.push({ t: t, o: o }); }
  function isUsed(s, o) { return s.used.indexOf(o.id) >= 0; }

  function die(s, o) { if (!s.dead) { s.dead = true; ev(s, 'die', o); } }

  function sub(L, s, held, dt) {
    var g = s.grav, o, i, c, list;
    if (s.mode === 0) {
      if ((s.onGround || s.coyote > 0) && (held || s.buf > 0)) {
        s.vy = g * P.JUMPV; s.onGround = false; s.coyote = 0; s.buf = 0; s.jumps++;
        ev(s, 'jump');
      }
      s.vy -= g * P.GRAV * dt;
      if (s.vy * g < -P.MAXFALL) s.vy = -g * P.MAXFALL;
    } else {
      s.vy += g * (held ? P.R_UP : -P.R_DOWN) * dt;
      if (s.vy * g > P.R_VMAX) s.vy = g * P.R_VMAX;
      if (s.vy * g < -P.R_VMAX) s.vy = -g * P.R_VMAX;
    }
    if (s.coyote > 0) s.coyote--;
    var wasGround = s.onGround;
    var py = s.y;
    s.x += L.speed * P.TIERS[s.tier] * dt;
    s.y += s.vy * dt;
    s.onGround = false;

    // the floor
    if (s.y < 0) {
      s.y = 0;
      if (g > 0) { if (s.vy <= 0) { s.vy = 0; s.onGround = true; } }
      else { if (s.vy < 0) { s.vy = 0; ev(s, 'bump'); } }
    }

    var c0 = Math.floor(s.x) - 1, c1 = Math.floor(s.x + 1);
    if (c0 < 0) c0 = 0;
    var ax1 = s.x + P.SIDE, ax2 = s.x + 1 - P.SIDE;

    // solids first
    for (c = c0; c <= c1; c++) {
      list = L.cols[c]; if (!list) continue;
      for (i = 0; i < list.length; i++) {
        o = list[i];
        if (!o.solid || (o.c0 !== c && c !== c0)) continue;
        if (ax2 <= o.x1 || ax1 >= o.x2 || s.y + 1 <= o.y1 || s.y >= o.y2) continue;
        if (g > 0) {
          if (s.vy <= 0 && py >= o.y2 - P.SNAP) { s.y = o.y2; s.vy = 0; s.onGround = true; }
          else if (s.vy > 0 && py + 1 <= o.y1 + P.SNAP) { s.y = o.y1 - 1; s.vy = 0; ev(s, 'bump'); }
          else if (innerHit(s, o)) { die(s, o); return; }
        } else {
          if (s.vy >= 0 && py + 1 <= o.y1 + P.SNAP) { s.y = o.y1 - 1; s.vy = 0; s.onGround = true; }
          else if (s.vy < 0 && py >= o.y2 - P.SNAP) { s.y = o.y2; s.vy = 0; ev(s, 'bump'); }
          else if (innerHit(s, o)) { die(s, o); return; }
        }
      }
    }
    if (s.mode === 0 && wasGround && !s.onGround && s.vy * g <= 0) s.coyote = P.COYOTE;

    // everything else
    var hx1 = s.x + P.HAZ, hx2 = s.x + 1 - P.HAZ, hy1 = s.y + P.HAZ, hy2 = s.y + 1 - P.HAZ;
    var cx = s.x + 0.5, cy = s.y + 0.5, dx, dy;
    for (c = c0; c <= c1; c++) {
      list = L.cols[c]; if (!list) continue;
      for (i = 0; i < list.length; i++) {
        o = list[i];
        if (o.solid || (o.c0 !== c && c !== c0)) continue;
        if (o.haz) {
          if (hx2 > o.x1 && hx1 < o.x2 && hy2 > o.y1 && hy1 < o.y2) { die(s, o); return; }
        } else if (o.t === 'pad') {
          if (isUsed(s, o)) continue;
          if (ax2 > o.x1 && ax1 < o.x2 && s.y + 1 > o.y1 && s.y < o.y2) {
            s.used.push(o.id);
            if (o.kind === 'Y') s.vy = s.grav * P.PADV;
            else { s.grav = -s.grav; s.vy = -s.grav * P.PADV_BLUE; }
            s.onGround = false; s.coyote = 0; s.buf = 0;
            ev(s, 'pad', o);
          }
        } else if (o.t === 'orb') {
          if (s.buf <= 0 || isUsed(s, o)) continue;
          dx = cx - o.cx; dy = cy - o.cy;
          if (dx * dx + dy * dy < P.ORB_R * P.ORB_R) {
            s.used.push(o.id);
            if (o.kind === 'o') s.vy = s.grav * P.ORBV;
            else if (o.kind === 'p') s.vy = s.grav * P.ORB_PINK;
            else { s.grav = -s.grav; s.vy = -s.grav * P.ORB_BLUE; }
            s.onGround = false; s.coyote = 0; s.buf = 0;
            ev(s, 'orb', o);
          }
        } else if (o.t === 'portal') {
          if (isUsed(s, o)) continue;
          if (ax2 > o.x1 && ax1 < o.x2 && s.y + 1 > o.y1 && s.y < o.y2) {
            s.used.push(o.id);
            var k = o.kind;
            if (k === 'G') { if (s.grav !== -1) { s.grav = -1; s.vy *= 0.5; s.onGround = false; } }
            else if (k === 'N') { if (s.grav !== 1) { s.grav = 1; s.vy *= 0.5; s.onGround = false; } }
            else if (k === 'R') { s.mode = 1; s.vy *= 0.4; s.coyote = 0; }
            else if (k === 'C') { s.mode = 0; s.vy *= 0.4; }
            else s.tier = +k - 1;
            ev(s, 'portal', o);
          }
        } else if (o.t === 'star') {
          if (isUsed(s, o)) continue;
          dx = cx - o.cx; dy = cy - o.cy;
          if (dx * dx + dy * dy < P.STAR_R * P.STAR_R) {
            s.used.push(o.id); s.stars |= (1 << o.idx);
            ev(s, 'star', o);
          }
        }
      }
    }
    if (s.y > L.maxY || s.y < -2) { die(s, null); return; }
    if (s.x >= L.finishX) { s.won = true; ev(s, 'win'); }
  }

  function innerHit(s, o) {
    var I = P.INNER;
    return s.x + 1 - I > o.x1 && s.x + I < o.x2 && s.y + 1 - I > o.y1 && s.y + I < o.y2;
  }

  // One 60 Hz tick. held = jump button is down, pressed = it went down this tick.
  BD.tick = function (L, s, held, pressed) {
    if (s.dead || s.won) return;
    s.px = s.x; s.py = s.y;
    var wasGround = s.onGround;
    if (pressed) s.buf = P.BUF;
    var dt = 1 / (P.HZ * P.SUB);
    for (var k = 0; k < P.SUB; k++) {
      sub(L, s, held, dt);
      if (s.dead || s.won) break;
    }
    if (s.buf > 0) s.buf--;
    s.tick++;
    if (s.onGround) {
      if (!wasGround && s.mode === 0) ev(s, 'land', s.air);
      s.air = 0;
    } else s.air++;
    // forget objects we are well past
    if (s.used.length > 6) {
      var keep = [];
      for (var i = 0; i < s.used.length; i++) if (L.objs[s.used[i]].x2 > s.x - 3) keep.push(s.used[i]);
      s.used = keep;
    }
  };

  // Seconds since the level started for a given state (for music sync).
  BD.time = function (s) { return s.tick / P.HZ; };

  if (typeof module !== 'undefined' && module.exports) module.exports = BD;
})(typeof window !== 'undefined' ? window : globalThis);

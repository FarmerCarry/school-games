/* Recess Kitchen (مطبخ الفسحة) canvas artwork:
 * Cached canteen/juice/conveyor/ice rooms, dynamic kitchen appliances, conveyor chevrons,
 * wordless picture order bubbles, cute animal classmates, chibi chefs with 6 aprons &
 * 6 funny hats, and top recess-bell HUD. */
(function () {
  'use strict';
  var W = RK.W, H = RK.H, COLS = RK.COLS, ROWS = RK.ROWS, TILE = RK.TILE, X0 = RK.X0, Y0 = RK.Y0;
  var INK = '#23140c';
  var A = { INK: INK };
  RK.art = A;

  var roomCache = {};
  var backCache = {};
  A.reset = function () { roomCache = {}; backCache = {}; };

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  A.rr = rr;

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  }
  A.circle = circle;

  function fillStroke(ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke !== false) {
      ctx.lineWidth = lw || 3.5;
      ctx.strokeStyle = stroke || INK;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  A.text = function (ctx, str, x, y, size, color, opts) {
    opts = opts || {};
    var isAscii = /^[\x00-\x7F]+$/.test(str);
    ctx.save();
    ctx.direction = opts.dir || (isAscii ? 'ltr' : 'rtl');
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.base || 'middle';
    ctx.font = '700 ' + size + 'px Fredoka, Tahoma, sans-serif';
    if (opts.stroke !== false) {
      ctx.lineWidth = opts.lw || Math.max(4, size * 0.18);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = opts.outline || INK;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color || '#fffdf7';
    ctx.fillText(str, x, y);
    ctx.restore();
  };

  function starPath(ctx, cx, cy, r, inner) {
    inner = inner || r * 0.46;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rad = (i % 2 === 0) ? r : inner;
      var px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  A.starPath = starPath;

  /* --------------------------------------------------- cached backdrops */
  A.backdrop = function (worldIdx, ps) {
    ps = ps || 1;
    var key = worldIdx + '@' + ps;
    if (backCache[key]) return backCache[key];
    var wd = RK.WORLDS[RK.clamp(worldIdx | 0, 0, RK.WORLDS.length - 1)];
    var c = makeCanvas(W * ps, H * ps), g = c.getContext('2d');
    g.scale(ps, ps);
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, wd.bg0);
    grad.addColorStop(1, wd.bg1);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Warm polka & bunting pattern in background
    g.fillStyle = 'rgba(255,255,255,0.045)';
    for (var y = 36; y < H; y += 72) {
      for (var x = (y % 144 === 0 ? 36 : 72); x < W; x += 72) {
        circle(g, x, y, 10); g.fill();
      }
    }
    // Top festive pennant bunting
    var colors = ['#ffb703', '#ff5d9e', '#38b6ff', '#34d399', '#ffd23f'];
    for (var bx = 20, bi = 0; bx < W - 20; bx += 64, bi++) {
      g.beginPath();
      g.moveTo(bx, 0); g.lineTo(bx + 54, 0); g.lineTo(bx + 27, 26); g.closePath();
      g.fillStyle = colors[bi % colors.length];
      g.globalAlpha = 0.22;
      g.fill();
    }
    g.globalAlpha = 1;
    backCache[key] = c;
    return c;
  };

  /* --------------------------------------------------- cached kitchen room */
  A.room = function (w, ps) {
    ps = ps || 1;
    var key = w.level + ':' + w.players + '@' + ps;
    if (roomCache[key]) return roomCache[key];
    var wd = RK.WORLDS[w.world];
    var c = makeCanvas(W * ps, H * ps), g = c.getContext('2d');
    g.scale(ps, ps);
    g.drawImage(A.backdrop(w.world, 1), 0, 0, W, H);

    var kw = COLS * TILE, kh = ROWS * TILE;

    // Customer counter corridor behind serving window (y = 82..164)
    rr(g, X0 - 8, 82, kw + 16, 92, 22);
    fillStroke(g, '#402412', INK, 5);
    // Striped school canteen awning strip along top of counter
    g.save();
    rr(g, X0 - 4, 80, kw + 8, 22, 10);
    g.clip();
    for (var sx = X0 - 12, si = 0; sx < X0 + kw + 12; sx += 34, si++) {
      g.fillStyle = si % 2 === 0 ? wd.color : '#fffdf7';
      g.fillRect(sx, 80, 34, 22);
    }
    g.restore();
    rr(g, X0 - 4, 80, kw + 8, 22, 10);
    fillStroke(g, null, INK, 3.5);

    // Outer kitchen frame shadow + border
    rr(g, X0 - 10, Y0 - 8, kw + 20, kh + 20, 22);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    rr(g, X0 - 8, Y0 - 8, kw + 16, kh + 16, 20);
    fillStroke(g, '#3a2110', INK, 5);

    // Floor tiles
    for (var r = 0; r < ROWS; r++) {
      for (var col = 0; col < COLS; col++) {
        var tx = X0 + col * TILE, ty = Y0 + r * TILE;
        var ch = w.grid[r][col];
        var st = w.stationGrid[r][col];
        if (ch === 'I') {
          g.fillStyle = (r + col) % 2 === 0 ? '#cfeeff' : '#bae4ff';
          g.fillRect(tx, ty, TILE, TILE);
          g.strokeStyle = 'rgba(255,255,255,0.65)';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(tx + 12, ty + 26); g.lineTo(tx + 28, ty + 10);
          g.moveTo(tx + 34, ty + 58); g.lineTo(tx + 60, ty + 32);
          g.stroke();
          g.strokeStyle = '#93c5fd'; g.lineWidth = 1.5;
          g.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
        } else if (ch === '=') {
          // 1P wooden pass-bridge planks
          g.fillStyle = '#c87d3b';
          g.fillRect(tx, ty, TILE, TILE);
          g.fillStyle = '#df9551';
          for (var py = ty + 5; py < ty + TILE - 4; py += 18) {
            rr(g, tx + 4, py, TILE - 8, 13, 4);
            fillStroke(g, '#df9551', '#6e3d16', 2);
          }
        } else {
          g.fillStyle = (r + col) % 2 === 0 ? wd.floor0 : wd.floor1;
          g.fillRect(tx, ty, TILE, TILE);
          g.strokeStyle = 'rgba(35,20,12,0.08)';
          g.lineWidth = 1.5;
          g.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
        }

        // Solid pure wall block (# with no station)
        if (ch === '#' && !st) {
          rr(g, tx + 3, ty + 3, TILE - 6, TILE - 6, 12);
          fillStroke(g, '#523421', INK, 4);
          rr(g, tx + 10, ty + 9, TILE - 20, TILE - 22, 8);
          fillStroke(g, '#6c4730', false);
        }
      }
    }

    // Static bases of counters & stations
    for (var i = 0; i < w.stations.length; i++) {
      drawStationBase(g, w.stations[i], wd);
    }

    roomCache[key] = c;
    return c;
  };

  function drawStationBase(ctx, st, wd) {
    var tx = X0 + st.c * TILE, ty = Y0 + st.r * TILE;
    if (st.type === 'belt') {
      rr(ctx, tx + 3, ty + 3, TILE - 6, TILE - 6, 12);
      fillStroke(ctx, '#334155', INK, 4);
      rr(ctx, tx + 9, ty + 9, TILE - 18, TILE - 18, 8);
      fillStroke(ctx, '#1e293b', '#0f172a', 2);
      return;
    }
    if (st.type === 'serve') {
      rr(ctx, tx + 2, ty + 2, TILE - 4, TILE - 4, 12);
      fillStroke(ctx, '#f59e0b', INK, 4);
      rr(ctx, tx + 8, ty + 8, TILE - 16, TILE - 16, 8);
      fillStroke(ctx, '#fde68a', '#b45309', 2.5);
      // Upward serve chevron
      ctx.beginPath();
      ctx.moveTo(st.x - 14, st.y + 8); ctx.lineTo(st.x, st.y - 8); ctx.lineTo(st.x + 14, st.y + 8);
      ctx.lineWidth = 5; ctx.strokeStyle = '#d97706'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      return;
    }
    if (st.type === 'trash') {
      rr(ctx, tx + 7, ty + 7, TILE - 14, TILE - 14, 16);
      fillStroke(ctx, '#64748b', INK, 4);
      circle(ctx, st.x, st.y, 20);
      fillStroke(ctx, '#334155', INK, 3);
      starPath(ctx, st.x, st.y, 11, 5);
      fillStroke(ctx, '#38bdf8', INK, 2);
      return;
    }
    if (st.type === 'fryer' || st.type === 'grill' || st.type === 'blender') {
      rr(ctx, tx + 3, ty + 3, TILE - 6, TILE - 6, 13);
      fillStroke(ctx, '#94a3b8', INK, 4);
      rr(ctx, tx + 8, ty + 7, TILE - 16, TILE - 18, 9);
      fillStroke(ctx, '#cbd5e1', '#475569', 2);
      return;
    }
    if (st.type === 'crate') {
      rr(ctx, tx + 3, ty + 3, TILE - 6, TILE - 6, 13);
      fillStroke(ctx, '#b4692e', INK, 4);
      rr(ctx, tx + 9, ty + 9, TILE - 18, TILE - 20, 8);
      fillStroke(ctx, '#7c4318', '#542b0c', 2.5);
      return;
    }
    // Counter, chop, plates: warm wood butcher-block counter
    rr(ctx, tx + 3, ty + 3, TILE - 6, TILE - 6, 13);
    fillStroke(ctx, '#d99b5e', INK, 4);
    rr(ctx, tx + 8, ty + 7, TILE - 16, TILE - 18, 9);
    fillStroke(ctx, '#f5cfa0', '#b5763a', 2);
    // Accent strip along bottom front edge
    ctx.fillStyle = wd.trim;
    ctx.fillRect(tx + 12, ty + TILE - 10, TILE - 24, 4);

    if (st.type === 'chop') {
      rr(ctx, tx + 13, ty + 14, TILE - 26, TILE - 28, 7);
      fillStroke(ctx, '#fffbeb', '#92400e', 2.8);
      // Cute mini knife beside board
      ctx.beginPath();
      ctx.moveTo(tx + TILE - 16, ty + 18); ctx.lineTo(tx + TILE - 11, ty + 42); ctx.lineTo(tx + TILE - 19, ty + 42); ctx.closePath();
      fillStroke(ctx, '#e2e8f0', INK, 2);
      rr(ctx, tx + TILE - 17, ty + 42, 5, 12, 2);
      fillStroke(ctx, '#ef4444', INK, 2);
    }
  }

  /* --------------------------------------------------- food & dish icons */
  A.ingredient = function (ctx, kind, x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (kind === 'bread') {
      ctx.beginPath();
      ctx.ellipse(0, 1, 18, 13, -0.15, 0, Math.PI * 2);
      fillStroke(ctx, '#f5c478', INK, 3);
      ctx.strokeStyle = '#b4692e'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-7, -5); ctx.lineTo(-3, 5);
      ctx.moveTo(2, -6); ctx.lineTo(6, 4);
      ctx.stroke();
    } else if (kind === 'falafelRaw' || kind === 'falafel') {
      var col = kind === 'falafel' ? '#9c4a1a' : '#65a30d';
      var hi = kind === 'falafel' ? '#d97706' : '#a3e635';
      var pts = [[-8, 3], [8, 3], [0, -7]];
      for (var i = 0; i < 3; i++) {
        circle(ctx, pts[i][0], pts[i][1], 8.5);
        fillStroke(ctx, col, INK, 2.6);
        circle(ctx, pts[i][0] - 2, pts[i][1] - 2, 2.2);
        ctx.fillStyle = hi; ctx.fill();
      }
    } else if (kind === 'tomatoRaw') {
      circle(ctx, 0, 2, 14);
      fillStroke(ctx, '#ef4444', INK, 3);
      circle(ctx, -4, -3, 3.5);
      ctx.fillStyle = '#fca5a5'; ctx.fill();
      starPath(ctx, 0, -10, 7, 3);
      fillStroke(ctx, '#22c55e', INK, 2);
    } else if (kind === 'tomato') {
      // Sliced juicy tomato rings
      for (var ti = -1; ti <= 1; ti += 2) {
        circle(ctx, ti * 5, ti * 2, 11);
        fillStroke(ctx, '#ef4444', INK, 2.6);
        circle(ctx, ti * 5, ti * 2, 6.5);
        fillStroke(ctx, '#fca5a5', false);
      }
    } else if (kind === 'cheese') {
      ctx.beginPath();
      ctx.moveTo(-16, 10); ctx.lineTo(16, 10); ctx.lineTo(12, -11); ctx.lineTo(-16, 2); ctx.closePath();
      fillStroke(ctx, '#facc15', INK, 3);
      circle(ctx, -4, 4, 2.8); ctx.fillStyle = '#ca8a04'; ctx.fill();
      circle(ctx, 6, 1, 3.2); ctx.fill();
    } else if (kind === 'rawToastie') {
      rr(ctx, -16, -9, 32, 20, 6);
      fillStroke(ctx, '#fde68a', INK, 3);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-14, -1, 28, 5);
    } else if (kind === 'toastie') {
      // Golden grilled cheese with diagonal grill marks & melted cheese!
      rr(ctx, -17, -11, 34, 22, 6);
      fillStroke(ctx, '#eab308', INK, 3);
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-10, -7); ctx.lineTo(-3, 7);
      ctx.moveTo(0, -7); ctx.lineTo(7, 7);
      ctx.moveTo(9, -5); ctx.lineTo(13, 5);
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-13, -1, 26, 4);
    } else if (kind === 'strawberry') {
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.bezierCurveTo(-16, 6, -15, -10, 0, -9);
      ctx.bezierCurveTo(15, -10, 16, 6, 0, 15);
      fillStroke(ctx, '#f43f5e', INK, 3);
      ctx.fillStyle = '#fde047';
      circle(ctx, -4, 0, 1.6); ctx.fill();
      circle(ctx, 4, 1, 1.6); ctx.fill();
      circle(ctx, 0, 6, 1.6); ctx.fill();
      starPath(ctx, 0, -10, 7, 3.2);
      fillStroke(ctx, '#22c55e', INK, 2);
    } else if (kind === 'mango') {
      ctx.beginPath();
      ctx.ellipse(0, 2, 15, 11, -0.35, 0, Math.PI * 2);
      fillStroke(ctx, '#fb923c', INK, 3);
      ctx.beginPath();
      ctx.ellipse(3, 0, 9, 6, -0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#fde047'; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-9, -9, 5, 2.8, -0.5, 0, Math.PI * 2);
      fillStroke(ctx, '#22c55e', INK, 2);
    } else if (kind === 'smoothieStrawberry' || kind === 'smoothieMango') {
      var isMango = kind === 'smoothieMango';
      var cupCol = isMango ? '#ffb703' : '#ff5d9e';
      var hiCol = isMango ? '#fef08a' : '#fbcfe8';
      // Straw
      ctx.beginPath();
      ctx.moveTo(4, -8); ctx.lineTo(9, -21); ctx.lineTo(15, -20);
      ctx.lineWidth = 4.5; ctx.strokeStyle = isMango ? '#22c55e' : '#38bdf8'; ctx.stroke();
      // Cup body
      ctx.beginPath();
      ctx.moveTo(-12, -8); ctx.lineTo(12, -8); ctx.lineTo(9, 15); ctx.lineTo(-9, 15); ctx.closePath();
      fillStroke(ctx, cupCol, INK, 3);
      // Dome lid
      ctx.beginPath();
      ctx.arc(0, -8, 12, Math.PI, 0);
      fillStroke(ctx, 'rgba(255,255,255,0.82)', INK, 2.6);
      // Swirl highlight
      ctx.strokeStyle = hiCol; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(0, 5, 5, 0); ctx.stroke();
    }
    ctx.restore();
  };

  A.item = function (ctx, item, x, y, s) {
    if (!item) return;
    s = s || 1;
    if (item.kind !== 'plate') {
      A.ingredient(ctx, item.kind, x, y, s);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    circle(ctx, 0, 2, 22);
    fillStroke(ctx, '#ffffff', INK, 3.2);
    circle(ctx, 0, 2, 15);
    fillStroke(ctx, '#e2e8f0', false);

    var it = item.items || [];
    var dish = RK.dishOf(item);
    if (dish === 'wrap' || dish === 'wrapTomato') {
      // Appetizing wrapped pita pocket with golden falafel & optional tomato!
      ctx.beginPath();
      ctx.moveTo(-14, 7);
      ctx.quadraticCurveTo(0, -16, 14, 7);
      ctx.quadraticCurveTo(0, 16, -14, 7);
      fillStroke(ctx, '#f5c478', INK, 2.8);
      circle(ctx, -5, -1, 5.5); fillStroke(ctx, '#9c4a1a', INK, 2.2);
      circle(ctx, 5, 0, 5.5); fillStroke(ctx, '#9c4a1a', INK, 2.2);
      if (dish === 'wrapTomato') {
        circle(ctx, 0, -6, 5); fillStroke(ctx, '#ef4444', INK, 2);
      }
    } else if (it.length === 1) {
      A.ingredient(ctx, it[0], 0, 0, 0.82);
    } else if (it.length > 1) {
      for (var i = 0; i < it.length; i++) {
        var ox = (i - (it.length - 1) / 2) * 9;
        A.ingredient(ctx, it[i], ox, -1, 0.66);
      }
    }
    ctx.restore();
  };

  /* -------------------------------------------- dynamic stations & rings */
  function drawRing(ctx, x, y, prog, color, bg) {
    circle(ctx, x, y, 15);
    fillStroke(ctx, bg || 'rgba(35,20,12,0.85)', '#fffdf7', 2.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + RK.clamp(prog, 0, 1) * Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawPuff(ctx, x, y, t, still) {
    var b = still ? 0 : Math.sin(t * 7) * 2;
    ctx.save();
    ctx.translate(x, y + b);
    var puffs = [[-10, 4, 11], [10, 4, 11], [-5, -6, 12], [6, -5, 11], [0, 2, 13]];
    for (var i = 0; i < puffs.length; i++) {
      circle(ctx, puffs[i][0], puffs[i][1], puffs[i][2]);
      fillStroke(ctx, '#64748b', INK, 2.6);
    }
    for (var j = 0; j < puffs.length; j++) {
      circle(ctx, puffs[j][0], puffs[j][1], puffs[j][2] - 2);
      ctx.fillStyle = '#94a3b8'; ctx.fill();
    }
    // Silly cartoon eyes on burnt puff
    circle(ctx, -4, 0, 2.2); ctx.fillStyle = INK; ctx.fill();
    circle(ctx, 4, 0, 2.2); ctx.fill();
    ctx.restore();
  }

  A.stations = function (ctx, w, t, still) {
    // Draw focused station glow first so chefs clearly see target
    for (var p = 0; p < w.chefs.length; p++) {
      var f = w.chefs[p].focus;
      if (!f) continue;
      var fx = X0 + f.c * TILE, fy = Y0 + f.r * TILE;
      rr(ctx, fx + 1, fy + 1, TILE - 2, TILE - 2, 15);
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = p === 0 ? '#ffd23f' : '#ff6b35';
      ctx.stroke();
    }

    for (var i = 0; i < w.stations.length; i++) {
      var st = w.stations[i];
      var x = st.x, y = st.y;

      if (st.type === 'crate') {
        A.ingredient(ctx, st.kind, x, y - 2, 1.05);
        continue;
      }

      if (st.type === 'plates') {
        for (var k = 0; k < st.plates; k++) {
          A.item(ctx, { kind: 'plate', items: [] }, x, y + 4 - k * 4.5, 0.88);
        }
        continue;
      }

      if (st.type === 'belt') {
        // Animated chevrons along belt direction
        var dx = st.dir[0], dy = st.dir[1];
        var shift = still ? 0 : ((t * 28) % 18) - 9;
        ctx.save();
        ctx.translate(x + dx * shift * 0.6, y + dy * shift * 0.6);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (var ci = -1; ci <= 1; ci += 2) {
          var ox = ci * 8;
          ctx.beginPath();
          ctx.moveTo(ox - 5, -9); ctx.lineTo(ox + 5, 0); ctx.lineTo(ox - 5, 9);
          ctx.stroke();
        }
        ctx.restore();
        if (st.item) {
          var slide = (st.beltT || 0) * TILE * 0.55;
          A.item(ctx, st.item, x + dx * slide, y + dy * slide, 0.92);
        }
        continue;
      }

      if (st.type === 'counter') {
        if (st.item) A.item(ctx, st.item, x, y - 2, 0.95);
        continue;
      }

      if (st.type === 'chop') {
        if (st.item) {
          A.item(ctx, st.item, x - 3, y - 1, 0.92);
          if (st.item.kind === 'tomatoRaw' && st.item.prog > 0) {
            rr(ctx, x - 24, y - 33, 48, 10, 5);
            fillStroke(ctx, INK, '#fff', 2);
            rr(ctx, x - 22, y - 31, 44 * RK.clamp(st.item.prog, 0, 1), 6, 3);
            ctx.fillStyle = '#34d399'; ctx.fill();
          }
        }
        continue;
      }

      if (st.type === 'fryer') {
        var ck = st.cook;
        rr(ctx, x - 22, y - 20, 44, 40, 9);
        fillStroke(ctx, '#f59e0b', INK, 3);
        rr(ctx, x - 17, y - 15, 34, 30, 6);
        fillStroke(ctx, '#fbbf24', false);
        if (ck.state === 'burnt') {
          drawPuff(ctx, x, y - 4, t, still);
        } else if (ck.state !== 'idle') {
          var wig = (!still && ck.state === 'warning') ? Math.sin(t * 28) * 3 : 0;
          A.ingredient(ctx, ck.state === 'cooking' ? 'falafelRaw' : 'falafel', x + wig, y, 0.85);
          if (!still) {
            circle(ctx, x - 9, y - 6 + Math.sin(t * 12) * 3, 3);
            ctx.fillStyle = '#fef9c3'; ctx.fill();
            circle(ctx, x + 10, y + 5 + Math.cos(t * 10) * 3, 2.5); ctx.fill();
          }
          var fCol = ck.state === 'cooking' ? '#38bdf8' : ck.state === 'done' ? '#34d399' : '#f43f5e';
          var fProg = ck.state === 'cooking' ? ck.prog : (1 - ck.over);
          drawRing(ctx, x, y - 28, fProg, fCol);
        }
        continue;
      }

      if (st.type === 'grill') {
        var gk = st.cook;
        rr(ctx, x - 23, y - 19, 46, 38, 8);
        fillStroke(ctx, '#334155', INK, 3);
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2.5;
        for (var gy = -11; gy <= 11; gy += 7) {
          ctx.beginPath(); ctx.moveTo(x - 17, y + gy); ctx.lineTo(x + 17, y + gy); ctx.stroke();
        }
        if (gk.state === 'burnt') {
          drawPuff(ctx, x, y - 4, t, still);
        } else if (gk.state === 'idle' && st.parts.length === 1) {
          A.ingredient(ctx, st.parts[0], x, y, 0.82);
        } else if (gk.state !== 'idle') {
          var gwig = (!still && gk.state === 'warning') ? Math.sin(t * 28) * 3 : 0;
          A.ingredient(ctx, gk.state === 'cooking' ? 'rawToastie' : 'toastie', x + gwig, y, 0.86);
          var gCol = gk.state === 'cooking' ? '#38bdf8' : gk.state === 'done' ? '#34d399' : '#f43f5e';
          var gProg = gk.state === 'cooking' ? gk.prog : (1 - gk.over);
          drawRing(ctx, x, y - 28, gProg, gCol);
        }
        continue;
      }

      if (st.type === 'blender') {
        var bk = st.cook;
        // Base
        rr(ctx, x - 15, y + 4, 30, 16, 6);
        fillStroke(ctx, '#ec4899', INK, 3);
        // Pitcher
        ctx.beginPath();
        ctx.moveTo(x - 15, y - 20); ctx.lineTo(x + 15, y - 20);
        ctx.lineTo(x + 11, y + 6); ctx.lineTo(x - 11, y + 6); ctx.closePath();
        var juiceCol = !st.fruit ? 'rgba(226,232,240,0.85)' : (st.fruit === 'mango' ? '#ffb703' : '#ff5d9e');
        var shakeX = (!still && bk.state === 'cooking') ? Math.sin(t * 36) * 2 : 0;
        ctx.save(); ctx.translate(shakeX, 0);
        fillStroke(ctx, juiceCol, INK, 3);
        rr(ctx, x - 17, y - 24, 34, 6, 3);
        fillStroke(ctx, '#334155', INK, 2.5);
        ctx.restore();
        if (bk.state === 'cooking') {
          drawRing(ctx, x, y - 30, bk.prog, '#a855f7');
        } else if (bk.state === 'done') {
          drawRing(ctx, x, y - 30, 1, '#34d399');
        }
      }
    }
  };

  /* -------------------------------------- cute animal classmates & orders */
  A.animal = function (ctx, kind, x, y, s, t, still, happy) {
    s = s || 1;
    var bob = still ? 0 : Math.sin(t * 3.6 + x * 0.02) * 2.5;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(s, s);

    if (kind === 'cat') {
      ctx.beginPath();
      ctx.moveTo(-18, -8); ctx.lineTo(-15, -26); ctx.lineTo(-4, -17);
      ctx.moveTo(18, -8); ctx.lineTo(15, -26); ctx.lineTo(4, -17);
      fillStroke(ctx, '#fb923c', INK, 3.2);
      circle(ctx, 0, 0, 20);
      fillStroke(ctx, '#fdba74', INK, 3.4);
    } else if (kind === 'bunny') {
      for (var bi = -1; bi <= 1; bi += 2) {
        ctx.beginPath(); ctx.ellipse(bi * 9, -23, 5.5, 13, bi * 0.12, 0, Math.PI * 2);
        fillStroke(ctx, '#fbcfe8', INK, 3);
      }
      circle(ctx, 0, 0, 20);
      fillStroke(ctx, '#fff1f2', INK, 3.4);
    } else if (kind === 'bear') {
      circle(ctx, -14, -15, 8); fillStroke(ctx, '#92400e', INK, 3);
      circle(ctx, 14, -15, 8); fillStroke(ctx, '#92400e', INK, 3);
      circle(ctx, 0, 0, 20);
      fillStroke(ctx, '#b45309', INK, 3.4);
      circle(ctx, 0, 4, 8); fillStroke(ctx, '#fde68a', false);
    } else if (kind === 'penguin') {
      circle(ctx, 0, 0, 20);
      fillStroke(ctx, '#3b82f6', INK, 3.4);
      circle(ctx, 0, 3, 14);
      fillStroke(ctx, '#ffffff', false);
    } else {
      // Baby dino
      starPath(ctx, 0, -18, 9, 4);
      fillStroke(ctx, '#facc15', INK, 2.5);
      circle(ctx, 0, 0, 20);
      fillStroke(ctx, '#4ade80', INK, 3.4);
    }

    // Cute eyes & smile
    circle(ctx, -7, -2, 2.8); ctx.fillStyle = INK; ctx.fill();
    circle(ctx, 7, -2, 2.8); ctx.fill();
    circle(ctx, -12, 4, 3.5); ctx.fillStyle = 'rgba(244,63,94,0.35)'; ctx.fill();
    circle(ctx, 12, 4, 3.5); ctx.fill();
    if (kind === 'penguin') {
      ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(4, 2); ctx.lineTo(0, 8); ctx.closePath();
      fillStroke(ctx, '#f97316', INK, 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, happy ? 3 : 4, 5, 0.15, Math.PI - 0.15);
      ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.restore();
  };

  A.orders = function (ctx, w, t, still) {
    for (var i = 0; i < w.orders.length; i++) {
      var o = w.orders[i];
      // Place 4 customer slots cleanly along counter header (x = 128..1152)
      var bx = 132 + o.slot * 260;
      var by = 88;
      var bw = 236, bh = 70;
      var ratio = RK.clamp(o.left / o.max, 0, 1);
      var urgent = !still && ratio < 0.25 ? Math.sin(t * 22) * 2.5 : 0;

      ctx.save();
      ctx.translate(urgent, 0);

      // Classmate peeking at right side of bubble
      A.animal(ctx, o.animal, bx + bw - 26, by + 40, 0.92, t, still, ratio > 0.35);

      // Wordless picture order bubble on left of classmate
      var cardW = 182;
      rr(ctx, bx, by + 2, cardW, bh - 4, 18);
      fillStroke(ctx, o.vip ? '#fef9c3' : '#fffdf7', o.vip ? '#d97706' : INK, o.vip ? 4.5 : 3.8);

      if (o.vip) {
        starPath(ctx, bx + 14, by + 12, 10, 4.5);
        fillStroke(ctx, '#ffd23f', INK, 2.2);
      }

      // Finished dish preview on right of bubble
      var spec = RK.DISHES[o.dish];
      var previewItem = spec.plate ? { kind: 'plate', items: spec.recipe.slice() } : { kind: o.dish };
      A.item(ctx, previewItem, bx + cardW - 34, by + 31, 0.9);

      // Divider line
      ctx.strokeStyle = 'rgba(35,20,12,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx + cardW - 66, by + 12); ctx.lineTo(bx + cardW - 66, by + bh - 18); ctx.stroke();

      // Recipe step mini-icons on left of bubble (zero reading required!)
      var rec = spec.recipe;
      for (var k = 0; k < rec.length; k++) {
        var rx = bx + 24 + k * 31;
        A.ingredient(ctx, rec[k], rx, by + 31, 0.68);
      }

      // Patience bar along bottom inside bubble
      rr(ctx, bx + 12, by + bh - 13, cardW - 24, 7, 3.5);
      ctx.fillStyle = 'rgba(35,20,12,0.15)'; ctx.fill();
      var pCol = ratio > 0.5 ? '#34d399' : ratio > 0.25 ? '#fbbf24' : '#f43f5e';
      rr(ctx, bx + 12, by + bh - 13, (cardW - 24) * ratio, 7, 3.5);
      ctx.fillStyle = pCol; ctx.fill();

      ctx.restore();
    }
  };

  /* ------------------------------------- chibi chefs & 6 funny chef hats */
  A.hat = function (ctx, hatIdx, t, still) {
    var h = RK.HATS[hatIdx] ? RK.HATS[hatIdx].id : 'toque';
    ctx.save();
    if (h === 'toque') {
      ctx.beginPath();
      ctx.moveTo(-13, -15);
      ctx.bezierCurveTo(-20, -30, -8, -38, 0, -32);
      ctx.bezierCurveTo(8, -38, 20, -30, 13, -15);
      ctx.closePath();
      fillStroke(ctx, '#ffffff', INK, 3);
      rr(ctx, -13, -18, 26, 7, 3);
      fillStroke(ctx, '#f1f5f9', INK, 2.8);
    } else if (h === 'crown') {
      ctx.beginPath();
      ctx.moveTo(-14, -13); ctx.lineTo(-16, -29); ctx.lineTo(-6, -21);
      ctx.lineTo(0, -32); ctx.lineTo(6, -21); ctx.lineTo(16, -29); ctx.lineTo(14, -13);
      ctx.closePath();
      fillStroke(ctx, '#ffd23f', INK, 3);
      circle(ctx, 0, -20, 3); ctx.fillStyle = '#f43f5e'; ctx.fill();
    } else if (h === 'strawberry') {
      ctx.beginPath();
      ctx.arc(0, -14, 15, Math.PI, 0);
      ctx.closePath();
      fillStroke(ctx, '#f43f5e', INK, 3);
      circle(ctx, -5, -20, 1.6); ctx.fillStyle = '#fde047'; ctx.fill();
      circle(ctx, 5, -20, 1.6); ctx.fill();
      starPath(ctx, 0, -29, 7, 3.2);
      fillStroke(ctx, '#22c55e', INK, 2);
    } else if (h === 'catears') {
      ctx.beginPath();
      ctx.moveTo(-16, -12); ctx.lineTo(-14, -29); ctx.lineTo(-3, -17);
      ctx.moveTo(16, -12); ctx.lineTo(14, -29); ctx.lineTo(3, -17);
      fillStroke(ctx, '#ffffff', INK, 3);
      ctx.beginPath();
      ctx.moveTo(-13, -15); ctx.lineTo(-12, -24); ctx.lineTo(-6, -17);
      ctx.moveTo(13, -15); ctx.lineTo(12, -24); ctx.lineTo(6, -17);
      ctx.fillStyle = '#ff7ab6'; ctx.fill();
    } else if (h === 'viking') {
      ctx.beginPath();
      ctx.moveTo(-13, -18); ctx.quadraticCurveTo(-25, -22, -22, -33); ctx.quadraticCurveTo(-16, -25, -10, -22);
      ctx.moveTo(13, -18); ctx.quadraticCurveTo(25, -22, 22, -33); ctx.quadraticCurveTo(16, -25, 10, -22);
      fillStroke(ctx, '#fef3c7', INK, 2.8);
      ctx.beginPath(); ctx.arc(0, -14, 14, Math.PI, 0); ctx.closePath();
      fillStroke(ctx, '#94a3b8', INK, 3);
      rr(ctx, -15, -17, 30, 5, 2.5);
      fillStroke(ctx, '#fbbf24', INK, 2.5);
    } else if (h === 'halo') {
      var lift = still ? 0 : Math.sin(t * 5) * 2.5;
      ctx.beginPath();
      ctx.ellipse(0, -29 + lift, 15, 5, 0, 0, Math.PI * 2);
      ctx.lineWidth = 4.5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      starPath(ctx, 13, -29 + lift, 6, 2.8);
      fillStroke(ctx, '#fffbeb', '#d97706', 1.8);
    }
    ctx.restore();
  };

  A.chef = function (ctx, chef, opts) {
    opts = opts || {};
    var apron = RK.APRONS[opts.apron || 0] || RK.APRONS[0];
    var hatIdx = opts.hat || 0;
    var still = !!opts.still;
    var t = opts.t || 0;
    var s = opts.scale || 1;
    var bob = still ? 0 : Math.abs(Math.sin((chef.walk || 0) * 0.08)) * 3.5;

    ctx.save();
    ctx.translate(chef.x, chef.y);
    ctx.scale(s, s);

    // Floor shadow & 2P player ring
    ctx.beginPath();
    ctx.ellipse(0, 20, 19, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(35,20,12,0.26)';
    ctx.fill();
    if (opts.twoPlayer) {
      ctx.beginPath();
      ctx.ellipse(0, 20, 23, 10, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = chef.id === 0 ? '#38bdf8' : '#ff6b35';
      ctx.stroke();
    }

    ctx.translate(0, -bob);

    // Chubby body & apron
    rr(ctx, -15, 0, 30, 21, 10);
    fillStroke(ctx, '#fffdf7', INK, 3.2);
    rr(ctx, -12, 3, 24, 17, 7);
    fillStroke(ctx, apron.body, INK, 2.6);
    rr(ctx, -6, 10, 12, 7, 3);
    fillStroke(ctx, apron.trim, false);

    // Head
    var skin = chef.id === 1 ? '#f3c195' : '#ffe0bd';
    circle(ctx, 0, -6, 15);
    fillStroke(ctx, skin, INK, 3.2);

    // Eyes looking toward movement direction
    var lx = (chef.dirX || 0) * 2.5, ly = (chef.dirY || 0) * 1.8;
    circle(ctx, -5 + lx, -6 + ly, 2.4); ctx.fillStyle = INK; ctx.fill();
    circle(ctx, 5 + lx, -6 + ly, 2.4); ctx.fill();
    circle(ctx, -9 + lx * 0.5, -2 + ly, 3); ctx.fillStyle = 'rgba(244,63,94,0.32)'; ctx.fill();
    circle(ctx, 9 + lx * 0.5, -2 + ly, 3); ctx.fill();
    ctx.beginPath();
    ctx.arc(lx * 0.6, -2 + ly, 4, 0.15, Math.PI - 0.15);
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();

    // Funny chef hat
    A.hat(ctx, hatIdx, t, still);

    // Held item carried clearly in chef's hands
    if (chef.held) {
      var hx = (chef.dirX || 0) * 18, hy = 8 + (chef.dirY || 0) * 12;
      A.item(ctx, chef.held, hx, hy, 0.88);
    }

    ctx.restore();
  };

  /* ------------------------------------------------------------ top HUD */
  A.hud = function (ctx, w, t, still) {
    var wd = RK.WORLDS[w.world];
    var x0 = 280, pw = 720;
    rr(ctx, x0, 10, pw, 58, 29);
    fillStroke(ctx, 'rgba(35,20,12,0.88)', wd.color, 4);

    // Right: Level badge (RTL reading order)
    rr(ctx, x0 + pw - 96, 16, 86, 46, 23);
    fillStroke(ctx, wd.color, INK, 3);
    A.text(ctx, w.R.id, x0 + pw - 53, 40, 26, INK, { stroke: false, dir: 'ltr' });

    // Middle: Coin total + 3-star progress bar
    circle(ctx, x0 + pw - 130, 39, 14);
    fillStroke(ctx, '#ffd23f', '#b45309', 3);
    A.text(ctx, String(w.coins), x0 + pw - 152, 40, 28, '#fef08a', { align: 'right', stroke: false, dir: 'ltr' });

    var barX = x0 + 206, barW = 286, barY = 33;
    rr(ctx, barX, barY, barW, 14, 7);
    fillStroke(ctx, 'rgba(255,255,255,0.16)', INK, 2.5);
    var maxG = w.goals[2];
    var fillW = barW * RK.clamp(w.coins / maxG, 0, 1);
    if (fillW > 2) {
      rr(ctx, barX, barY, fillW, 14, 7);
      ctx.fillStyle = '#34d399'; ctx.fill();
    }
    for (var gi = 0; gi < 3; gi++) {
      var sx = barX + barW * (w.goals[gi] / maxG);
      starPath(ctx, sx, barY + 7, 11, 5);
      fillStroke(ctx, w.coins >= w.goals[gi] ? '#ffd23f' : '#64748b', INK, 2.4);
    }

    // Left: Recess Bell countdown timer (Western digits 0-9)
    var sec = Math.max(0, Math.ceil(w.timeLeft));
    var mm = Math.floor(sec / 60), ss = sec % 60;
    var clockStr = mm + ':' + (ss < 10 ? '0' : '') + ss;
    var low = w.timeLeft <= 12 && !w.done;
    var bellPulse = (!still && low) ? Math.sin(t * 16) * 2.5 : 0;
    circle(ctx, x0 + 44 + bellPulse, 39, 15);
    fillStroke(ctx, low ? '#f43f5e' : '#38bdf8', '#fffdf7', 3);
    ctx.beginPath();
    ctx.moveTo(x0 + 44 + bellPulse, 39);
    ctx.lineTo(x0 + 44 + bellPulse, 30);
    ctx.lineTo(x0 + 51 + bellPulse, 39);
    ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke();
    A.text(ctx, clockStr, x0 + 72, 40, 29, low ? '#fda4af' : '#fffdf7', { align: 'left', stroke: false, dir: 'ltr' });
  };

  /* -------------------------------------------------------- title scene */
  A.titleScene = function (ctx, save, t, still, ps) {
    ctx.drawImage(A.backdrop(0, ps), 0, 0, W, H);
    // Warm sunlit serving counter across bottom
    rr(ctx, 64, 594, W - 128, 110, 26);
    fillStroke(ctx, '#d99b5e', INK, 5);
    rr(ctx, 76, 602, W - 152, 34, 14);
    fillStroke(ctx, '#f5cfa0', '#b5763a', 2.5);

    // Friendly chefs & animal classmates enjoying recess snacks along bottom corners
    A.chef(ctx, { id: 0, x: 184, y: 582, dirX: 1, dirY: 0, walk: still ? 0 : t * 35, held: { kind: 'plate', items: ['bread', 'falafel', 'tomato'] } }, { apron: save.apron, hat: save.hat, t: t, still: still, scale: 1.35 });
    A.chef(ctx, { id: 1, x: 1096, y: 582, dirX: -1, dirY: 0, walk: still ? 0 : t * 35 + 10, held: { kind: 'smoothieMango' } }, { apron: (save.apron + 2) % RK.APRONS.length, hat: (save.hat + 1) % RK.HATS.length, t: t, still: still, scale: 1.35 });
    A.animal(ctx, 'cat', 268, 634, 1.08, t, still, true);
    A.animal(ctx, 'dino', 1012, 634, 1.08, t, still, true);
    A.item(ctx, { kind: 'toastie' }, 132, 620, 1.15);
    A.item(ctx, { kind: 'smoothieStrawberry' }, 1148, 616, 1.15);
  };
})();

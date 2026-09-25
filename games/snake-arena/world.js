/* Snake Arena — world simulation: snakes, food, spatial hashes, bot AI. */
(function () {
  'use strict';
  var SA = window.SA;

  var R = 2800;           // arena radius
  var SPACING = 5;        // distance between body points
  var CAP = 1600;         // max body points per snake
  var SPEED = 190, BOOST = 400;
  var BOT_COUNT = 15;
  var FOOD_TARGET = 2600;

  /* ------------------------------------------------------------ helpers */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 6.283185307; while (d < -Math.PI) d += 6.283185307; return d; }
  SA.angDiff = angDiff;

  // Rainbow palette (24 hues).
  SA.RAINBOW = [];
  (function () {
    function hsl2hex(h, s, l) {
      s /= 100; l /= 100;
      var k = function (n) { return (n + h / 30) % 12; };
      var a = s * Math.min(l, 1 - l);
      var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
      var hx = function (x) { var v = Math.round(x * 255).toString(16); return v.length < 2 ? '0' + v : v; };
      return '#' + hx(f(0)) + hx(f(8)) + hx(f(4));
    }
    for (var i = 0; i < 24; i++) SA.RAINBOW.push(hsl2hex(i * 15, 95, 58));
  })();

  SA.bandPts = function (skin, r) { return Math.max(1, Math.round(skin.band * r / 14)); };
  SA.skinColorAt = function (skin, i, r) {
    var b = Math.floor(i / SA.bandPts(skin, r));
    if (skin.rainbow) return SA.RAINBOW[b % 24];
    return skin.colors[b % skin.colors.length];
  };
  SA.massToR = function (m) { return 14 + 9 * Math.log(Math.max(1, m / 10)) / Math.LN10; };
  function massToN(m) { var n = m < 600 ? 16 + m : 616 + (m - 600) * 0.5; return Math.min(CAP - 4, Math.floor(n)); }

  /* ------------------------------------------------------- snake hash */
  var GOFF = R + 260, CELL = 80, GN = Math.ceil(2 * GOFF / CELL);
  var cellHead = new Int32Array(GN * GN).fill(-1);
  var MAXE = 40000, eCount = 0;
  var eNext = new Int32Array(MAXE), eX = new Float32Array(MAXE), eY = new Float32Array(MAXE), eR = new Float32Array(MAXE), eS = new Int16Array(MAXE);
  function cellOf(v) { var c = ((v + GOFF) / CELL) | 0; return c < 0 ? 0 : c >= GN ? GN - 1 : c; }
  function hashAdd(x, y, r, si) {
    if (eCount >= MAXE) return;
    var c = cellOf(y) * GN + cellOf(x);
    eX[eCount] = x; eY[eCount] = y; eR[eCount] = r; eS[eCount] = si;
    eNext[eCount] = cellHead[c]; cellHead[c] = eCount++;
  }
  var MAXR = 50;
  // First snake (other than self) whose body is within rad + k*segR of (x,y). -1 if none.
  function hitTest(x, y, rad, self, k) {
    var reach = rad + MAXR * k;
    var x0 = cellOf(x - reach), x1 = cellOf(x + reach), y0 = cellOf(y - reach), y1 = cellOf(y + reach);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        for (var e = cellHead[cy * GN + cx]; e !== -1; e = eNext[e]) {
          if (eS[e] === self) continue;
          var dx = eX[e] - x, dy = eY[e] - y, rr = rad + eR[e] * k;
          if (dx * dx + dy * dy < rr * rr) return eS[e];
        }
      }
    }
    return -1;
  }
  function blockedAt(x, y, rad, self) {
    var lim = R - rad - 30;
    if (x * x + y * y > lim * lim) return true;
    return hitTest(x, y, rad, self, 1) !== -1;
  }

  /* --------------------------------------------------------------- food */
  var FMAX = 5000;
  var fX = new Float32Array(FMAX), fY = new Float32Array(FMAX), fV = new Float32Array(FMAX), fR = new Float32Array(FMAX);
  var fBorn = new Float32Array(FMAX), fDie = new Float32Array(FMAX), fAlive = new Uint8Array(FMAX), fT = new Uint8Array(FMAX);
  var fCol = new Array(FMAX);
  var fFree = new Int32Array(FMAX), fFreeN = 0;
  var FCELL = 100, FGN = Math.ceil(2 * GOFF / FCELL);
  var fCellHead = new Int32Array(FGN * FGN).fill(-1), fNext = new Int32Array(FMAX).fill(-1);
  var foodAlive = 0, ambientAlive = 0;
  function fcell(v) { var c = ((v + GOFF) / FCELL) | 0; return c < 0 ? 0 : c >= FGN ? FGN - 1 : c; }

  function foodClear() {
    fAlive.fill(0); fFreeN = 0;
    for (var i = FMAX - 1; i >= 0; i--) fFree[fFreeN++] = i;
    foodAlive = 0; ambientAlive = 0;
  }
  function foodKill(i) {
    if (!fAlive[i]) return;
    fAlive[i] = 0; fFree[fFreeN++] = i; foodAlive--;
    if (fT[i] === 0) ambientAlive--;
  }
  function foodAdd(x, y, v, r, col, type, born, life) {
    if (fFreeN === 0) {
      // recycle: prefer an ambient dot or old pellet far away
      for (var t = 0; t < 40; t++) {
        var j = (Math.random() * FMAX) | 0;
        if (fAlive[j] && fT[j] !== 1) { foodKill(j); break; }
      }
      if (fFreeN === 0) return -1;
    }
    var i = fFree[--fFreeN];
    fX[i] = x; fY[i] = y; fV[i] = v; fR[i] = r; fCol[i] = col; fT[i] = type;
    fBorn[i] = born; fDie[i] = life > 0 ? born + life : 0; fAlive[i] = 1;
    foodAlive++; if (type === 0) ambientAlive++;
    return i;
  }
  function spawnAmbient() {
    var a = Math.random() * 6.283185307, d = Math.sqrt(Math.random()) * (R - 60);
    var roll = Math.random(), v, r;
    if (roll < 0.8) { v = 1; r = rand(4.5, 5.8); } else if (roll < 0.96) { v = 2; r = rand(6.5, 7.5); } else { v = 4; r = rand(8.5, 9.5); }
    foodAdd(Math.cos(a) * d, Math.sin(a) * d, v, r, SA.FOOD_COLORS[(Math.random() * SA.FOOD_COLORS.length) | 0], 0, W.time - 1, 0);
  }
  function rebuildFoodGrid() {
    fCellHead.fill(-1);
    for (var i = 0; i < FMAX; i++) {
      if (!fAlive[i]) continue;
      if (fDie[i] && W.time > fDie[i]) { foodKill(i); continue; }
      var c = fcell(fY[i]) * FGN + fcell(fX[i]);
      fNext[i] = fCellHead[c]; fCellHead[c] = i;
    }
  }

  /* -------------------------------------------------------------- snake */
  function Snake(idx, isPlayer) {
    this.idx = idx;
    this.isPlayer = isPlayer;
    this.px = new Float32Array(CAP);
    this.py = new Float32Array(CAP);
    this.alive = false;
    this.bulges = [];
    this.pw = { magnet: 0, double: 0, turbo: 0 };
  }
  Snake.prototype.init = function (x, y, ang, mass, name, skin, eyes) {
    this.hx = x; this.hy = y; this.ang = ang; this.want = ang; this.look = ang;
    this.mass = mass; this.r = SA.massToR(mass); this.tn = massToN(mass);
    this.name = name; this.skin = skin; this.eyes = eyes;
    this.s = 0; this.n = this.tn; this.frac = 0;
    // lay the body behind the head along a gentle curve
    var bx = x, by = y, a = ang + Math.PI, curl = rand(-1, 1) * 0.004;
    for (var i = 0; i < this.n; i++) {
      bx += Math.cos(a) * SPACING; by += Math.sin(a) * SPACING; a += curl;
      var d = Math.sqrt(bx * bx + by * by);
      if (d > R - 40) { bx *= (R - 40) / d; by *= (R - 40) / d; a += 0.2; }
      this.px[i] = bx; this.py[i] = by;
    }
    this.alive = true; this.boosting = false; this.boostWant = false; this.boostAcc = 0;
    this.kills = 0; this.bornT = W.time; this.protect = this.isPlayer ? 2.5 : 1.0;
    this.headPulse = 0; this.bulges.length = 0; this.blinkT = rand(1, 4); this.blink = 0;
    this.pw.magnet = 0; this.pw.double = 0; this.pw.turbo = 0;
    this.eaten = 0; this.deathT = 0; this.respawnAt = 0; this.killedBy = null;
    this.minx = this.maxx = x; this.miny = this.maxy = y;
    this.tint = 0;
  };
  Snake.prototype.pointX = function (i) { var a = this.s + i; if (a >= CAP) a -= CAP; return this.px[a]; };
  Snake.prototype.pointY = function (i) { var a = this.s + i; if (a >= CAP) a -= CAP; return this.py[a]; };
  Snake.prototype.grow = function (v) {
    this.mass += v;
    this.r = SA.massToR(this.mass);
    this.tn = massToN(this.mass);
  };
  Snake.prototype.turnRate = function () { return Math.max(2.3, Math.min(5.4, 5.4 * Math.pow(14 / this.r, 0.6))); };

  Snake.prototype.move = function (dt) {
    // turning
    var da = angDiff(this.want, this.ang), mt = this.turnRate() * dt * (this.boosting ? 0.9 : 1);
    this.ang += da > mt ? mt : da < -mt ? -mt : da;
    if (this.ang > Math.PI) this.ang -= 6.283185307; else if (this.ang < -Math.PI) this.ang += 6.283185307;
    this.look += angDiff(this.want, this.look) * Math.min(1, dt * 10);

    // boosting
    var free = this.pw.turbo > 0;
    var wasBoost = this.boosting;
    this.boosting = this.boostWant && (free || this.mass > 12);
    if (this.boosting && !free) {
      var loss = (3 + this.mass * 0.012) * dt;
      this.grow(-loss);
      if (this.mass < 10) this.grow(10 - this.mass);
      this.boostAcc += loss;
      if (this.boostAcc >= 1.3) {
        var t = this.n - 1;
        foodAdd(this.pointX(t) + rand(-4, 4), this.pointY(t) + rand(-4, 4), this.boostAcc * 0.7, 5.5 + Math.min(3, this.boostAcc),
          SA.skinColorAt(this.skin, t, this.r), 2, W.time + 0.05, 25);
        this.boostAcc = 0;
      }
    }
    if (this.boosting && !wasBoost) W.events.push({ t: 'boost', s: this });
    var sp = this.boosting ? BOOST : SPEED;
    this.hx += Math.cos(this.ang) * sp * dt;
    this.hy += Math.sin(this.ang) * sp * dt;

    // insert body points
    var px = this.px, py = this.py;
    var x0 = px[this.s], y0 = py[this.s];
    var dx = this.hx - x0, dy = this.hy - y0, d = Math.sqrt(dx * dx + dy * dy);
    while (d >= SPACING) {
      var nx = x0 + dx / d * SPACING, ny = y0 + dy / d * SPACING;
      this.s--; if (this.s < 0) this.s = CAP - 1;
      px[this.s] = nx; py[this.s] = ny;
      if (this.n < this.tn) this.n++;
      x0 = nx; y0 = ny; dx = this.hx - x0; dy = this.hy - y0; d = Math.sqrt(dx * dx + dy * dy);
    }
    this.frac = d / SPACING;
    if (this.n > this.tn) this.n = Math.max(this.tn, this.n - 3);

    // juice timers
    this.headPulse = Math.max(0, this.headPulse - dt * 4);
    for (var b = this.bulges.length - 1; b >= 0; b--) {
      var bu = this.bulges[b];
      bu.p += dt * 55; bu.a *= Math.pow(0.35, dt);
      if (bu.p > this.n || bu.a < 0.03) this.bulges.splice(b, 1);
    }
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = rand(2, 5); }
    if (this.blink > 0) this.blink -= dt;
    if (this.protect > 0) this.protect -= dt;
    if (this.pw.magnet > 0) this.pw.magnet -= dt;
    if (this.pw.double > 0) this.pw.double -= dt;
    if (this.pw.turbo > 0) this.pw.turbo -= dt;
  };

  Snake.prototype.addToHash = function () {
    var st = Math.max(1, Math.floor(this.r * 0.5 / SPACING));
    var px = this.px, py = this.py, r = this.r, s = this.s, idx = this.idx;
    var minx = this.hx, maxx = this.hx, miny = this.hy, maxy = this.hy;
    hashAdd(this.hx, this.hy, r, idx);
    for (var i = 0; i < this.n; i += st) {
      var a = s + i; if (a >= CAP) a -= CAP;
      var x = px[a], y = py[a];
      hashAdd(x, y, r, idx);
      if (x < minx) minx = x; else if (x > maxx) maxx = x;
      if (y < miny) miny = y; else if (y > maxy) maxy = y;
    }
    this.minx = minx - r; this.maxx = maxx + r; this.miny = miny - r; this.maxy = maxy + r;
  };

  /* ------------------------------------------------------------- bot AI */
  var PERS = [
    { id: 'greedy', hunt: 0.2, flee: 0.35, greed: 0.45 },
    { id: 'hunter', hunt: 0.85, flee: 0.2, greed: 0.15 },
    { id: 'timid', hunt: 0.0, flee: 0.9, greed: 0.1 },
    { id: 'wander', hunt: 0.3, flee: 0.5, greed: 0.15 },
    { id: 'hunter', hunt: 0.6, flee: 0.4, greed: 0.3 }
  ];

  function clearance(b, a, look) {
    var c = Math.cos(a), s = Math.sin(a), rad = b.r * 0.9 + 8;
    for (var k = 1; k <= 4; k++) {
      var d = b.r + look * k / 4;
      if (blockedAt(b.hx + c * d, b.hy + s * d, rad, b.idx)) return (k - 1) / 4;
    }
    return 1;
  }

  function findFood(b) {
    var c = Math.cos(b.ang), s = Math.sin(b.ang);
    var ax = b.hx + c * 110, ay = b.hy + s * 110;
    var cx0 = fcell(ax), cy0 = fcell(ay), best = -1, bestS = 0;
    for (var cy = cy0 - 2; cy <= cy0 + 2; cy++) {
      if (cy < 0 || cy >= FGN) continue;
      for (var cx = cx0 - 2; cx <= cx0 + 2; cx++) {
        if (cx < 0 || cx >= FGN) continue;
        for (var f = fCellHead[cy * FGN + cx]; f !== -1; f = fNext[f]) {
          var dx = fX[f] - b.hx, dy = fY[f] - b.hy, d = Math.sqrt(dx * dx + dy * dy) + 1;
          if (d > 440) continue;
          var sc = fV[f] / (d + 50);
          if ((dx * c + dy * s) / d < -0.2) sc *= 0.35;
          if (sc > bestS) { bestS = sc; best = f; }
        }
      }
    }
    return best;
  }

  function think(b, dt) {
    var ai = b.ai;
    ai.modeT -= dt;
    ai.next -= dt;
    if (ai.next > 0) return;
    var D = W.D;
    var sk = ai.skill * (0.4 + 0.6 * D);
    ai.next = (0.34 - 0.22 * sk) * rand(0.8, 1.2);
    var hx = b.hx, hy = b.hy, i, o;
    var gx = hx + Math.cos(b.ang) * 200, gy = hy + Math.sin(b.ang) * 200, boost = false;
    var snakes = W.snakes;

    // --- flee from heads aimed at us
    var fleeing = false;
    if (Math.random() < ai.pers.flee * (0.5 + sk)) {
      for (i = 0; i < snakes.length; i++) {
        o = snakes[i];
        if (!o.alive || o === b) continue;
        var dx = hx - o.hx, dy = hy - o.hy, d2 = dx * dx + dy * dy;
        if (d2 > 230 * 230 || d2 < 1) continue;
        var dd = Math.sqrt(d2);
        if ((Math.cos(o.ang) * dx + Math.sin(o.ang) * dy) / dd > 0.55) {
          gx = hx + dx / dd * 300 + dy / dd * 120; gy = hy + dy / dd * 300 - dx / dd * 120;
          boost = b.mass > 30 && Math.random() < 0.7; fleeing = true;
          break;
        }
      }
    }

    // --- pick a mode
    if (!fleeing && ai.modeT <= 0) {
      ai.modeT = rand(2.5, 5.5);
      ai.mode = 'food'; ai.target = null;
      if (Math.random() < ai.pers.hunt * (0.3 + 0.7 * sk) && b.mass > 25) {
        var bestT = null, bestD = 650 * 650;
        for (i = 0; i < snakes.length; i++) {
          o = snakes[i];
          if (!o.alive || o === b) continue;
          if (o.isPlayer && !W.huntPlayer) continue;
          var ex = o.hx - hx, ey = o.hy - hy, e2 = ex * ex + ey * ey;
          if (o.isPlayer) e2 *= 0.6 / (0.3 + D); // prefer the player as difficulty rises
          if (e2 < bestD && o.mass < b.mass * 2.5) { bestD = e2; bestT = o; }
        }
        if (bestT) { ai.mode = 'hunt'; ai.target = bestT; ai.modeT = rand(3, 6); }
      }
      if (ai.mode === 'food' && Math.random() < 0.12) ai.mode = 'wander';
    }

    if (!fleeing) {
      var T = ai.target;
      if (ai.mode === 'hunt' && T && T.alive) {
        var tx = T.hx - hx, ty = T.hy - hy, td = Math.sqrt(tx * tx + ty * ty);
        if (td > 800) { ai.modeT = 0; }
        var lead = Math.max(70, Math.min(360, td * 0.75)) + T.r;
        gx = T.hx + Math.cos(T.ang) * lead; gy = T.hy + Math.sin(T.ang) * lead;
        var ga = Math.atan2(gy - hy, gx - hx);
        if (td < 420 && Math.abs(angDiff(ga, b.ang)) < 0.6 && b.mass > 40 && Math.random() < 0.3 + 0.6 * sk) boost = true;
      } else if (ai.mode === 'wander') {
        ai.wa += rand(-0.7, 0.7);
        gx = hx + Math.cos(ai.wa) * 300; gy = hy + Math.sin(ai.wa) * 300;
      } else {
        var f = findFood(b);
        if (f >= 0) {
          gx = fX[f]; gy = fY[f];
          var fd = Math.sqrt((gx - hx) * (gx - hx) + (gy - hy) * (gy - hy));
          if (fV[f] >= 2.5 && fd > 90 && fd < 300 && b.mass > 45 && Math.random() < ai.pers.greed * sk) boost = true;
        } else {
          ai.wa += rand(-0.5, 0.5);
          gx = hx + Math.cos(ai.wa) * 300; gy = hy + Math.sin(ai.wa) * 300;
        }
      }
    }

    // --- stay inside the arena
    var dc = Math.sqrt(hx * hx + hy * hy), edge = R - 260 - b.r * 3;
    if (dc > edge) {
      var w = Math.min(1, (dc - edge) / 200);
      gx = gx * (1 - w) + (-hx / dc * 400 + hx) * w;
      gy = gy * (1 - w) + (-hy / dc * 400 + hy) * w;
      ai.wa = Math.atan2(-hy, -hx);
    }

    // --- avoid bodies
    var goalA = Math.atan2(gy - hy, gx - hx);
    var look = 60 + 190 * sk + b.r * 2.2;
    if (b.boosting || boost) look *= 1.5;
    var finalA = goalA;
    var cg = clearance(b, goalA, look);
    if (cg < 1) {
      var bestS = -1e9;
      for (var k = -5; k <= 5; k++) {
        var a = b.ang + k * 0.5;
        var cl = k === 0 ? clearance(b, a, look) : clearance(b, a, look);
        var sc = cl * 10 - Math.abs(angDiff(a, goalA)) * 1.1 - Math.abs(k) * 0.25;
        if (sc > bestS) { bestS = sc; finalA = a; }
      }
      if (cg >= 0.75 && Math.random() < 0.3) finalA = goalA; // sometimes they're brave (or silly)
    }
    b.want = finalA;
    b.boostWant = boost && cg > 0.5;
    if (ai.boostHold > 0) b.boostWant = true;
  }

  /* -------------------------------------------------------------- world */
  var W = SA.world = {
    R: R, SPACING: SPACING, CAP: CAP,
    snakes: [], player: null, time: 0, D: 0.3, huntPlayer: false,
    events: [], powers: [], ranked: [], mode: 'demo',
    food: { x: fX, y: fY, v: fV, r: fR, col: fCol, alive: fAlive, born: fBorn, die: fDie, t: fT, max: FMAX },
    stepMs: 0
  };

  function usedNames() {
    var u = {};
    for (var i = 0; i < W.snakes.length; i++) if (W.snakes[i].alive || W.snakes[i].isPlayer) u[W.snakes[i].name] = 1;
    return u;
  }
  function pickName() {
    var u = usedNames(), tries = 0, n;
    do { n = SA.BOT_NAMES[(Math.random() * SA.BOT_NAMES.length) | 0]; } while (u[n] && ++tries < 30);
    return n;
  }

  function findSpawn(minFromPlayer, clearR) {
    var p = W.player && W.player.alive ? W.player : null;
    for (var t = 0; t < 40; t++) {
      var a = Math.random() * 6.283185307, d = Math.sqrt(Math.random()) * (R * 0.82);
      var x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (p && (x - p.hx) * (x - p.hx) + (y - p.hy) * (y - p.hy) < minFromPlayer * minFromPlayer) continue;
      if (hitTest(x, y, clearR, -1, 1) !== -1) continue;
      return { x: x, y: y };
    }
    var a2 = Math.random() * 6.283185307;
    return { x: Math.cos(a2) * R * 0.5, y: Math.sin(a2) * R * 0.5 };
  }

  function botMass() {
    var D = W.D, roll = Math.random();
    if (roll < 0.58) return rand(10, 45 + 80 * D);
    if (roll < 0.88) return rand(80, 250 + 300 * D);
    return rand(350, 700 + 900 * D);
  }

  function spawnBot(b, mass, nearOK) {
    var sp = findSpawn(nearOK ? 700 : 1100, 260);
    var skin = SA.SKINS[(Math.random() * SA.SKINS.length) | 0];
    var eyes = SA.EYES[(Math.random() * SA.EYES.length) | 0].id;
    b.init(sp.x, sp.y, Math.random() * 6.283185307, mass, pickName(), skin, eyes);
    b.ai = {
      pers: PERS[(Math.random() * PERS.length) | 0], skill: rand(0.55, 1), next: rand(0, 0.3),
      mode: 'food', modeT: rand(0.5, 3), target: null, wa: b.ang, boostHold: 0
    };
  }

  W.reset = function (mode) {
    W.mode = mode;
    W.time = 0; W.events.length = 0; W.powers.length = 0;
    W.D = mode === 'demo' ? 0.55 : 0.2;
    W.huntPlayer = false;
    foodClear();
    for (var i = 0; i < FOOD_TARGET; i++) spawnAmbient();
    W.snakes.length = 0;
    W.player = new Snake(0, true);
    W.snakes.push(W.player);
    cellHead.fill(-1); eCount = 0;
    var masses = [];
    for (i = 0; i < BOT_COUNT; i++) masses.push(i < 8 ? rand(10, 50) : i < 12 ? rand(70, 220) : i < 14 ? rand(300, 600) : rand(800, 1100));
    for (i = 0; i < BOT_COUNT; i++) {
      var b = new Snake(i + 1, false);
      W.snakes.push(b);
      spawnBot(b, masses[i], true);
      b.addToHash();
    }
    for (i = 0; i < 4; i++) spawnPower();
    // Build the food grid now: bots may search it before the first update rebuilds it
    // (an all-zero grid would loop forever on fNext[0] === 0).
    rebuildFoodGrid();
    W.powerT = 6;
    W.rankT = 0;
    rank();
  };

  W.spawnPlayer = function (name, skin, eyes) {
    var p = W.player;
    // clear space around the chosen spot so the start is always fair
    var sp = findSpawn(0, 520);
    p.init(sp.x, sp.y, Math.atan2(-sp.y, -sp.x) + rand(-0.8, 0.8), 10, name, skin, eyes);
    rank();
  };

  function spawnPower() {
    if (W.powers.length >= 5) return;
    var a = Math.random() * 6.283185307, d = Math.sqrt(Math.random()) * (R * 0.85);
    W.powers.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, type: (Math.random() * 3) | 0, born: W.time });
  }

  function killSnake(s, killer, reason) {
    if (!s.alive) return;
    s.alive = false; s.deathT = W.time; s.killedBy = killer || null;
    s.boosting = false;
    var total = s.mass * 0.62 + 6;
    var cnt = Math.max(8, Math.min(240, Math.round(s.n / 5)));
    var per = total / cnt;
    for (var k = 0; k < cnt; k++) {
      var i = Math.floor(k * (s.n - 1) / (cnt - 1));
      var jr = s.r * 0.7;
      var v = per * rand(0.7, 1.3);
      foodAdd(s.pointX(i) + rand(-jr, jr), s.pointY(i) + rand(-jr, jr), v, Math.max(7, Math.min(17, 5 + v * 1.3)),
        SA.skinColorAt(s.skin, i, s.r), 1, W.time + k * 0.006, rand(55, 70));
    }
    if (killer) killer.kills++;
    if (!s.isPlayer) s.respawnAt = W.time + rand(1.5, 4);
    W.events.push({ t: 'death', s: s, killer: killer || null, reason: reason });
  }
  W.killSnake = killSnake;

  function rank() {
    var r = W.ranked; r.length = 0;
    for (var i = 0; i < W.snakes.length; i++) if (W.snakes[i].alive) r.push(W.snakes[i]);
    r.sort(function (a, b) { return b.mass - a.mass; });
  }
  W.rankOf = function (s) { var i = W.ranked.indexOf(s); return i < 0 ? W.ranked.length + 1 : i + 1; };

  function eat(s, dt) {
    var magnet = s.pw.magnet > 0;
    var attract = s.r + 30 + (magnet ? 230 : 0), eatR = s.r * 0.9 + 7;
    var hx = s.hx + Math.cos(s.ang) * s.r * 0.3, hy = s.hy + Math.sin(s.ang) * s.r * 0.3;
    var x0 = fcell(hx - attract), x1 = fcell(hx + attract), y0 = fcell(hy - attract), y1 = fcell(hy + attract);
    var pull = (magnet ? 520 : 330) * dt, a2 = attract * attract, e2 = eatR * eatR, t = W.time;
    var gained = 0, big = false;
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        for (var f = fCellHead[cy * FGN + cx]; f !== -1; f = fNext[f]) {
          if (!fAlive[f] || fBorn[f] > t) continue;
          var dx = hx - fX[f], dy = hy - fY[f], d2 = dx * dx + dy * dy;
          if (d2 > a2) continue;
          if (d2 < e2) {
            gained += fV[f]; if (fV[f] >= 2.5) big = true;
            foodKill(f);
          } else {
            var d = Math.sqrt(d2), m = Math.min(d, pull + (attract - d) * 0.05);
            fX[f] += dx / d * m; fY[f] += dy / d * m;
          }
        }
      }
    }
    if (gained > 0) {
      if (s.pw.double > 0) gained *= 2;
      s.grow(gained);
      s.eaten += gained;
      s.headPulse = Math.min(1, s.headPulse + (big ? 0.7 : 0.35));
      if ((big || gained >= 2 || Math.random() < 0.35) && s.bulges.length < 5) s.bulges.push({ p: 0, a: big ? 0.35 : 0.2 });
      if (s.isPlayer) W.events.push({ t: 'eat', v: gained, big: big });
    }
  }

  W.update = function (dt) {
    var t0 = performance.now();
    W.time += dt;
    var snakes = W.snakes, i, s;

    for (i = 0; i < snakes.length; i++) { s = snakes[i]; if (s.alive && !s.isPlayer) think(s, dt); }
    for (i = 0; i < snakes.length; i++) { s = snakes[i]; if (s.alive) s.move(dt); }

    // rebuild snake hash
    cellHead.fill(-1); eCount = 0;
    for (i = 0; i < snakes.length; i++) { s = snakes[i]; if (s.alive) s.addToHash(); }

    // collisions
    var R2;
    for (i = 0; i < snakes.length; i++) {
      s = snakes[i];
      if (!s.alive) continue;
      R2 = R - s.r * 0.35;
      if (s.hx * s.hx + s.hy * s.hy > R2 * R2) { killSnake(s, null, 'border'); continue; }
      if (s.protect > 0) continue;
      var hit = hitTest(s.hx, s.hy, s.r * (s.isPlayer ? 0.5 : 0.66), s.idx, 0.82);
      if (hit !== -1) killSnake(s, snakes[hit], 'hit');
    }

    // food
    rebuildFoodGrid();
    for (i = 0; i < snakes.length; i++) { s = snakes[i]; if (s.alive) eat(s, dt); }
    var need = FOOD_TARGET - ambientAlive;
    for (i = 0; i < need && i < 25; i++) spawnAmbient();

    // power-ups (player only)
    W.powerT -= dt;
    if (W.powerT <= 0) { W.powerT = 7; if (W.powers.length < 4) spawnPower(); }
    var p = W.player;
    if (p.alive) {
      for (i = W.powers.length - 1; i >= 0; i--) {
        var pw = W.powers[i], pr = p.r + 34;
        if ((pw.x - p.hx) * (pw.x - p.hx) + (pw.y - p.hy) * (pw.y - p.hy) < pr * pr) {
          var def = SA.POWERS[pw.type];
          p.pw[def.id] = def.dur;
          W.powers.splice(i, 1);
          W.events.push({ t: 'power', type: pw.type, x: pw.x, y: pw.y });
        }
      }
    }

    // bot respawn
    for (i = 0; i < snakes.length; i++) {
      s = snakes[i];
      if (!s.alive && !s.isPlayer && W.time > s.respawnAt) spawnBot(s, botMass(), false);
    }

    W.rankT -= dt;
    if (W.rankT <= 0) { W.rankT = 0.25; rank(); }
    W.stepMs = W.stepMs * 0.95 + (performance.now() - t0) * 0.05;
  };

  // Debug / test helpers
  W.foodCount = function () { return foodAlive; };
  W.hashCount = function () { return eCount; };
  W.clearanceFor = clearance;
  W.forceRank = rank;
  W.SPEED = SPEED; W.BOOST = BOOST;
  W.spawnBotAt = function (b, x, y, ang, mass) {
    b.init(x, y, ang, mass, pickName(), SA.SKINS[(Math.random() * SA.SKINS.length) | 0], 'round');
    b.ai = { pers: PERS[2], skill: 0.1, next: 5, mode: 'wander', modeT: 5, target: null, wa: ang, boostHold: 0 };
  };
})();

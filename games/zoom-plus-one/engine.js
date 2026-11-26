/* Zooom +1 (زوووم +1): the pure engine. No DOM, no Kit, no timers, no Math.random.
 *
 * A runner on a road of giant keycaps. Every new keycap row stepped on adds the step gain
 * to the speed stat (+1 at first). The speed stat sets how fast the runner goes. Each
 * stage ends at a giant space-bar ramp over a jelly gap: with at least the stage's need
 * the runner flies over and wins trophies, otherwise it lands in the jelly and bounces
 * back to the start of the stage, keeping its speed, to run (and grow) again.
 * Trophies buy bouncier shoes (more speed per step), a trophy multiplier and runners.
 * From stage 11 on, a rebirth restarts at stage 1 with no speed and a bigger step
 * multiplier for good.
 *
 * The UI layer (game.js) owns the save object; the engine changes it in place.
 * Units: one keycap is 1 wide (lane) and 1 deep (row). z is the runner's row position
 * in the current stage; each stage starts on a pad at z -6..0 and its keys are rows
 * 0..rows-1, then the ramp and the gap.
 */
(function (root) {
  'use strict';
  var ZP = {};
  var M = Math;
  ZP.LANES = 5;
  ZP.PAD = 6;          // the start pad's depth (rows before key row 0)
  ZP.SPAWN = -3;       // where the runner stands on the pad at the start of a try
  ZP.RAMP = 3;         // the space-bar ramp after the last key row
  ZP.FLY = 1.3;        // seconds in the air
  ZP.FALL = 1.0;       // seconds of bloop in the jelly before trying again
  ZP.LAND = 0.8;       // seconds of landing celebration after a cleared stage
  ZP.BONK = 0.55;      // seconds stunned after a bonk
  ZP.TURBO = 8;        // seconds of double gain from a rainbow key
  ZP.MAX_STAGE = 99;

  /* ------------------------------------------------------------ numbers */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // Round to two significant digits so needs read nicely (25, 46, 85, 160, 290 …).
  function nice(n) {
    if (n < 100) return M.round(n);
    var p = M.pow(10, M.floor(M.log(n) / M.LN10) - 1);
    return M.round(n / p) * p;
  }
  ZP.nice = nice;
  // How many key rows a stage has.
  ZP.rows = function (n) { return 40 + 6 * M.min(n, 20) + 2 * M.max(0, M.min(n, 60) - 20); };
  // The speed needed to fly over the gap at the end of stage n.
  ZP.need = function (n) { return nice(25 * M.pow(2.05, n - 1)); };
  // Trophies for clearing stage n (before the trophy multiplier).
  ZP.reward = function (n) { return M.round(1 + n + 0.3 * n * n); };
  // The visible gap: longer for later stages (only for show; the need decides).
  ZP.gap = function (n) { return 8 + M.min(10, n); };
  // Run speed in rows per second for a speed stat: fast at once, then slower growth.
  ZP.vmax = function (speed) { return M.min(30, 5 + 2.2 * M.log(1 + M.max(0, speed) / 10) / M.LN2); };

  // Bouncy shoes: speed per step for each level, and the price of the next level.
  ZP.shoesGain = function (L) { return L <= 2 ? L + 1 : M.round(3 * M.pow(1.5, L - 2)); };
  ZP.shoesCost = function (L) { return nice(8 * M.pow(1.85, L)); };
  ZP.SHOES_MAX = 30;
  // The trophy multiplier.
  ZP.WINX = [1, 2, 3, 5, 8, 12, 20];
  ZP.winxCost = function (L) { return L + 1 < ZP.WINX.length ? nice(30 * M.pow(4.2, L)) : 0; };
  ZP.stepMult = function (save) { return 1 + save.rebirths; };
  ZP.stepGain = function (save) { return ZP.shoesGain(save.shoes) * ZP.stepMult(save); };
  ZP.winMult = function (save) { return ZP.WINX[save.winx]; };
  ZP.REBIRTH_AT = 11;  // reached stage 11 (cleared stage 10)
  ZP.canRebirth = function (save) { return save.stage >= ZP.REBIRTH_AT; };

  // The runners. cost in trophies; art.js draws them by id.
  ZP.SKINS = [
    { id: 'toast', name: 'خبزوز', cost: 0 },
    { id: 'potato', name: 'بطاطوس', cost: 10 },
    { id: 'duck', name: 'بطّوط', cost: 30 },
    { id: 'pickle', name: 'مخلّلو', cost: 80 },
    { id: 'orange', name: 'برتقول', cost: 200 },
    { id: 'cupcake', name: 'كبكوك', cost: 450 },
    { id: 'banana', name: 'موزوز', cost: 900 },
    { id: 'jelly', name: 'جيلوو', cost: 1800 },
    { id: 'toaster', name: 'المحمصة الذهبية', cost: 4000 }
  ];
  // Stage themes (art.js has the colours); a theme lasts three stages.
  ZP.THEMES = 6;
  ZP.theme = function (n) { return M.floor((n - 1) / 3) % ZP.THEMES; };

  /* -------------------------------------------------------------- saves */
  ZP.newSave = function () {
    return { v: 1, speed: 0, stage: 1, best: 1, wins: 0, totalWins: 0, shoes: 0, winx: 0, rebirths: 0,
      skins: [true, false, false, false, false, false, false, false, false], skin: 0, steps: 0, coach: false };
  };
  function int(v, lo, hi, d) { return typeof v === 'number' && v === v && v >= lo && v <= hi ? M.floor(v) : d; }
  function num(v, d) { return typeof v === 'number' && v === v && v >= 0 && v < 1e300 ? v : d; }
  // Anything odd in a stored save falls back to the fresh value for that field.
  ZP.loadSave = function (raw) {
    var s = ZP.newSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    s.speed = num(raw.speed, 0);
    s.stage = int(raw.stage, 1, ZP.MAX_STAGE, 1);
    s.best = M.max(s.stage, int(raw.best, 1, ZP.MAX_STAGE, 1));
    s.wins = num(raw.wins, 0);
    s.totalWins = M.max(s.wins, num(raw.totalWins, 0));
    s.shoes = int(raw.shoes, 0, ZP.SHOES_MAX, 0);
    s.winx = int(raw.winx, 0, ZP.WINX.length - 1, 0);
    s.rebirths = int(raw.rebirths, 0, 999, 0);
    if (Array.isArray(raw.skins)) for (var i = 1; i < s.skins.length; i++) s.skins[i] = raw.skins[i] === true;
    s.skin = int(raw.skin, 0, ZP.SKINS.length - 1, 0);
    if (!s.skins[s.skin]) s.skin = 0;
    s.steps = num(raw.steps, 0);
    s.coach = raw.coach === true;
    return s;
  };

  /* --------------------------------------------------------------- shop */
  // item: 'shoes', 'winx' or 'skin:<i>'. Returns true when bought (or, for an owned
  // runner, when it is now worn).
  ZP.price = function (save, item) {
    if (item === 'shoes') return save.shoes < ZP.SHOES_MAX ? ZP.shoesCost(save.shoes) : 0;
    if (item === 'winx') return ZP.winxCost(save.winx);
    var m = /^skin:(\d+)$/.exec(item);
    if (m && ZP.SKINS[+m[1]]) return save.skins[+m[1]] ? 0 : ZP.SKINS[+m[1]].cost;
    return 0;
  };
  ZP.buy = function (save, item) {
    var m = /^skin:(\d+)$/.exec(item);
    if (m) {
      var i = +m[1];
      if (!ZP.SKINS[i]) return false;
      if (!save.skins[i]) {
        if (save.wins < ZP.SKINS[i].cost) return false;
        save.wins -= ZP.SKINS[i].cost;
        save.skins[i] = true;
      }
      save.skin = i;
      return true;
    }
    if (item === 'shoes') {
      if (save.shoes >= ZP.SHOES_MAX) return false;
      var c = ZP.shoesCost(save.shoes);
      if (save.wins < c) return false;
      save.wins -= c; save.shoes++;
      return true;
    }
    if (item === 'winx') {
      var w = ZP.winxCost(save.winx);
      if (!w || save.wins < w) return false;
      save.wins -= w; save.winx++;
      return true;
    }
    return false;
  };
  ZP.rebirth = function (save) {
    if (!ZP.canRebirth(save)) return false;
    save.rebirths++;
    save.speed = 0;
    save.stage = 1;
    return true;
  };

  /* ------------------------------------------------------------- stages */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = M.imul(t ^ (t >>> 15), t | 1);
      t ^= t + M.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  ZP.rng = rng;
  // busy 0..1 (from the UI's Kit.dda): how many obstacles and how lively they are.
  // The same stage and busy always make the same road. Every obstacle row leaves at
  // least two neighbouring lanes free.
  ZP.stage = function (n, busy) {
    busy = clamp(typeof busy === 'number' && busy === busy ? busy : 0.4, 0, 1);
    var r = rng(n * 7919 + 13), rows = ZP.rows(n), obs = [], picks = [];
    var gapRows = M.round(14 - 7 * busy - M.min(3, n * 0.25)); // rows between obstacle rows
    var first = n === 1 ? 14 : 9;
    for (var row = first; row < rows - 6; row += gapRows + M.floor(r() * 4)) {
      var lane = M.floor(r() * ZP.LANES);
      if (n >= 3 && r() < 0.25 + 0.35 * busy) {
        // a jelly cube that slides between lanes
        obs.push({ row: row, lane: clamp(lane, 1, 3), kind: 'cube', amp: 1, sp: 1.2 + 1.6 * busy + r() * 0.6, ph: r() * 6.283 });
      } else {
        obs.push({ row: row, lane: lane, kind: 'duck' });
        if (busy > 0.45 && n >= 2 && r() < busy * 0.6) {
          var other = (lane + 2 + M.floor(r() * 2)) % ZP.LANES;
          if (M.abs(other - lane) >= 2) obs.push({ row: row, lane: other, kind: 'duck' });
        }
      }
    }
    // Golden keys between obstacles, a rainbow turbo key on most stages, and a chest
    // every third stage near the ramp.
    var golds = 3 + M.min(4, M.floor(n / 3));
    for (var g = 0; g < golds; g++) {
      var at = 6 + M.floor(r() * (rows - 12));
      var ln = M.floor(r() * ZP.LANES), clash = false;
      for (var k = 0; k < obs.length; k++) if (M.abs(obs[k].row - at) < 2) clash = true;
      if (!clash) picks.push({ row: at, lane: ln, kind: 'gold' });
    }
    if (n >= 2 && n % 4 !== 1) {
      var tr = M.floor(rows * (0.25 + r() * 0.3));
      picks.push({ row: tr, lane: M.floor(r() * ZP.LANES), kind: 'turbo' });
    }
    if (n % 3 === 0) picks.push({ row: rows - 4, lane: 2, kind: 'chest' });
    return { n: n, rows: rows, need: ZP.need(n), reward: ZP.reward(n), gap: ZP.gap(n), theme: ZP.theme(n), obs: obs, picks: picks, busy: busy };
  };

  /* -------------------------------------------------------------- world */
  ZP.create = function (save, busy) {
    var w = { save: save, busy: busy, spec: null, ev: [], t: 0, steps: 0, golds: 0, bonks: 0, falls: 0, clears: 0 };
    start(w, save.stage);
    return w;
  };
  function start(w, n) {
    w.spec = ZP.stage(n, w.busy);
    w.z = ZP.SPAWN; w.x = 2; w.lane = 2; w.v = 0; w.y = 0;
    w.phase = 'run'; w.pt = 0; w.at = 0; w.maxRow = -1; w.tryBonks = 0; w.turbo = 0;
    w.ok = false; w.frac = 0; w.lastGain = 0;
    w.hit = {}; w.got = {};
  }
  // A fresh try of the current stage (after a fall, a restart, or a new difficulty).
  ZP.retry = function (w, busy) {
    if (typeof busy === 'number') w.busy = busy;
    start(w, w.save.stage);
  };
  ZP.cubeX = function (o, at) { return o.lane + o.amp * M.sin(o.ph + o.sp * at); };
  // Where the runner is drawn (z can pass the stage's end while flying).
  ZP.pos = function (w) { return { x: w.x, y: w.y, z: w.z }; };

  function emit(w, e) { w.ev.push(e); }
  function addSpeed(w, gain) { w.save.speed += gain; }

  // input: { run: held, dir: -1/0/1 (a lane step this frame), lane: absolute lane or null }
  ZP.step = function (w, dt, input) {
    input = input || {};
    var s = w.save, sp = w.spec;
    w.t += dt; w.pt += dt;
    if (w.turbo > 0) w.turbo = M.max(0, w.turbo - dt);

    if (w.phase === 'run' || w.phase === 'bonk') {
      w.at += dt;
      if (input.dir) w.lane = clamp(w.lane + input.dir, 0, ZP.LANES - 1);
      if (typeof input.lane === 'number' && input.lane === input.lane) w.lane = clamp(M.round(input.lane), 0, ZP.LANES - 1);
      var dx = w.lane - w.x, mv = 10 * dt;
      w.x = M.abs(dx) <= mv ? w.lane : w.x + (dx > 0 ? mv : -mv);
    }
    if (w.phase === 'bonk') {
      w.v = 0;
      if (w.pt >= ZP.BONK) { w.phase = 'run'; w.pt = 0; }
      return w;
    }
    if (w.phase === 'run') {
      var top = ZP.vmax(s.speed) * (w.turbo > 0 ? 1.15 : 1);
      var want = input.run ? top : 0;
      w.v = want > w.v ? M.min(want, w.v + 16 * dt) : M.max(want, w.v - 22 * dt);
      w.z += w.v * dt;
      // New key rows under the runner.
      var row = M.floor(w.z);
      while (w.maxRow < row && w.maxRow < sp.rows - 1) {
        w.maxRow++;
        var gain = ZP.stepGain(s) * (w.turbo > 0 ? 2 : 1);
        addSpeed(w, gain);
        s.steps++; w.steps++; w.lastGain = gain;
        emit(w, { type: 'step', row: w.maxRow, lane: M.round(w.x), gain: gain });
      }
      // Pickups.
      for (var i = 0; i < sp.picks.length; i++) {
        var p = sp.picks[i];
        if (w.got[i] || M.abs(w.z - p.row - 0.5) > 0.6 || M.abs(w.x - p.lane) > 0.6) continue;
        w.got[i] = true;
        if (p.kind === 'gold') { var g = ZP.stepGain(s) * 10; addSpeed(w, g); w.golds++; emit(w, { type: 'gold', gain: g, lane: p.lane, row: p.row }); }
        else if (p.kind === 'turbo') { w.turbo = ZP.TURBO; emit(w, { type: 'turbo', lane: p.lane, row: p.row }); }
        else if (p.kind === 'chest') {
          var c = M.max(1, M.round(sp.reward * 0.5)) * ZP.winMult(s);
          s.wins += c; s.totalWins += c;
          emit(w, { type: 'chest', wins: c, lane: p.lane, row: p.row });
        }
      }
      // Obstacles: a bonk costs a little speed (twelve steps' worth at most) and a short stun.
      for (var j = 0; j < sp.obs.length; j++) {
        var o = sp.obs[j];
        if (w.hit[j] || M.abs(w.z - o.row - 0.5) > 0.55) continue;
        var ox = o.kind === 'cube' ? ZP.cubeX(o, w.at) : o.lane;
        if (M.abs(w.x - ox) > 0.62) continue;
        w.hit[j] = true;
        var lost = M.floor(M.min(s.speed * 0.1, ZP.stepGain(s) * 12));
        s.speed -= lost;
        w.bonks++; w.tryBonks++;
        w.phase = 'bonk'; w.pt = 0; w.v = 0; w.z = M.max(ZP.SPAWN, o.row - 0.2);
        emit(w, { type: 'bonk', lost: lost, kind: o.kind, lane: M.round(w.x) });
        return w;
      }
      // The ramp: launch.
      if (w.z >= sp.rows + ZP.RAMP) {
        w.ok = s.speed >= sp.need;
        w.frac = w.ok ? 1 : clamp(s.speed / sp.need, 0.12, 0.9);
        w.phase = 'fly'; w.pt = 0; w.fromZ = w.z; w.fromX = w.x;
        emit(w, { type: 'launch', ok: w.ok, frac: w.frac });
      }
      return w;
    }
    if (w.phase === 'fly') {
      var f = M.min(1, w.pt / ZP.FLY);
      var land = sp.rows + ZP.RAMP + (sp.gap + ZP.PAD + ZP.SPAWN) * w.frac;
      w.z = w.fromZ + (land - w.fromZ) * f;
      w.x = w.fromX + (2 - w.fromX) * f;
      var H = 2.2 + 2.6 * w.frac;
      w.y = 0.6 + 4 * H * f * (1 - f) - (w.ok ? 0.6 * f : 2.6 * f * f);
      if (f >= 1) {
        w.pt = 0;
        if (w.ok) {
          var won = sp.reward * ZP.winMult(s);
          s.wins += won; s.totalWins += won; w.clears++;
          s.stage = M.min(ZP.MAX_STAGE, s.stage + 1);
          s.best = M.max(s.best, s.stage);
          w.phase = 'land'; w.y = 0;
          emit(w, { type: 'clear', stage: sp.n, wins: won, next: s.stage });
        } else {
          w.phase = 'fall'; w.falls++;
          emit(w, { type: 'fall', stage: sp.n, short: sp.need - s.speed });
        }
      }
      return w;
    }
    if (w.phase === 'fall') {
      w.y = -2.6 - 0.4 * M.sin(w.pt * 9) * M.max(0, 1 - w.pt);
      if (w.pt >= ZP.FALL) { start(w, s.stage); emit(w, { type: 'respawn', stage: s.stage }); }
      return w;
    }
    if (w.phase === 'land') {
      if (w.pt >= ZP.LAND) {
        start(w, s.stage);
        w.v = ZP.vmax(s.speed) * 0.5;
        emit(w, { type: 'next', stage: s.stage });
      }
      return w;
    }
    return w;
  };

  root.ZP = ZP;
})(typeof window !== 'undefined' ? window : this);

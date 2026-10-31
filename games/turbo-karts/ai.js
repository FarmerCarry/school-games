/* سباق التوربو — CPU drivers. Pure: follow the baked racing line. No DOM, no Kit. */
(function () {
  'use strict';
  var TK = window.TK;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function think(race, k) {
    var inp = k.inp;
    inp.th = 1; inp.br = 0; inp.st = 0; inp.drift = 0; inp.use = 0;
    if (k.finished) { inp.th = 0; return inp; }
    if (k.spinT > 0) { inp.th = 0.4; return inp; }
    var track = race.track, n = track.line.length;
    var look = 3 + ((k.vf / 80) | 0);
    if (look > 7) look = 7;
    var seg = (k.seg || 0) + look;
    var aim = track.line[seg % n];
    var here = track.pts[k.seg % n];
    var lane = ((k.i % 3) - 1) * 16;
    var wobble = race.noise * Math.sin(race.time * 1.31 + k.i * 1.7);
    var tx = here.x, ty = here.y;
    var nx = -Math.sin(k.ang), ny = Math.cos(k.ang);
    // Prefer the precomputed line, nudged into a lane so a pack can pass.
    var ax = aim.x + nx * (lane + wobble);
    var ay = aim.y + ny * (lane + wobble);
    var want = Math.atan2(ay - k.y, ax - k.x);
    var diff = TK.wrap(want - k.ang);
    inp.st = clamp(diff / 0.5, -1, 1);

    var curv = track.curv[(k.seg + 4) % n] || 0;
    var target = k.maxV * (curv > 1.05 ? 0.58 : curv > 0.62 ? 0.76 : curv > 0.34 ? 0.9 : 1);
    if (Math.abs(diff) > 0.85) target *= 0.72;
    if (k.vf > target + 12) { inp.th = 0; inp.br = k.vf > target + 36 ? 1 : 0.35; }
    else inp.th = k.vf > target ? 0.45 : 1;

    // A puddle or a slow kart just ahead: step aside, or hop a puddle.
    var i, o, dx, dy, fwd, side, pud;
    for (i = 0; i < race.karts.length; i++) {
      o = race.karts[i];
      if (o === k || o.finished || o.hopT > 0) continue;
      dx = o.x - k.x; dy = o.y - k.y;
      fwd = dx * Math.cos(k.ang) + dy * Math.sin(k.ang);
      side = -dx * Math.sin(k.ang) + dy * Math.cos(k.ang);
      if (fwd > 8 && fwd < 78 && Math.abs(side) < 26) inp.st += side >= 0 ? -0.85 : 0.85;
    }
    for (i = 0; i < race.puddles.length; i++) {
      pud = race.puddles[i];
      if (pud.owner === k.i) continue;
      dx = pud.x - k.x; dy = pud.y - k.y;
      fwd = dx * Math.cos(k.ang) + dy * Math.sin(k.ang);
      side = -dx * Math.sin(k.ang) + dy * Math.cos(k.ang);
      if (fwd > 0 && fwd < 90 && Math.abs(side) < 30) {
        inp.st += side >= 0 ? -1 : 1;
        if (k.item === 'spring') inp.use = 1;
      }
    }
    inp.st = clamp(inp.st, -1, 1);

    if (k.item && race.items) {
      var pulse = 0.5 + 0.5 * Math.sin(race.time * 2.4 + k.i * 2.2);
      if (k.item === 'cookie' && k.vf > 50) inp.use = 1;
      else if (k.item === 'shield' && (k.spinT > 0 || pulse < race.agg * 0.35)) inp.use = 1;
      else if (k.item === 'rocket' && k.place > 1 && pulse < race.agg) {
        var prey = null, p;
        for (p = 0; p < race.karts.length; p++) if (race.karts[p].place === k.place - 1) prey = race.karts[p];
        if (prey && Math.hypot(prey.x - k.x, prey.y - k.y) < 340) inp.use = 1;
      } else if (k.item === 'jelly' && pulse < race.agg) {
        for (i = 0; i < race.karts.length; i++) {
          o = race.karts[i];
          if (o === k || o.finished) continue;
          dx = k.x - o.x; dy = k.y - o.y;
          fwd = dx * Math.cos(k.ang) + dy * Math.sin(k.ang);
          if (fwd > 0 && fwd < 120 && Math.abs(-dx * Math.sin(k.ang) + dy * Math.cos(k.ang)) < 40) inp.use = 1;
        }
      } else if (k.item === 'spring' && pulse < race.agg * 0.5 && k.place > 1) inp.use = 1;
    }
    return inp;
  }

  function inputs(race) {
    var i, k, list = race._ins;
    if (!list || list.length !== race.karts.length) {
      list = race._ins = [];
      for (i = 0; i < race.karts.length; i++) {
        race.karts[i].inp = { th: 0, br: 0, st: 0, drift: 0, use: 0 };
        list.push(race.karts[i].inp);
      }
    }
    for (i = 0; i < race.karts.length; i++) {
      k = race.karts[i];
      if (k.cpu) think(race, k);
    }
    return list;
  }

  window.TKAI = { think: think, inputs: inputs };
})();

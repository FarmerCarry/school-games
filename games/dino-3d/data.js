(function (D) {
  'use strict';
  // Original world dimensions. Feet rest at y=0; the track approaches along +z.
  D.config = Object.freeze({
    startSpeed: 15, maxSpeed: 35, scoreRate: 10,
    jumpSpeed: 19, gravity: 60, releaseGravity: 40,
    holdAfter: 0.2, holdRelief: 20, fastFallGravity: 120,
    playerBottom: 0.24, playerTop: 2.45, duckTop: 1.18,
    playerHalfDepth: 0.48, playerWidth: 0.75,
    spawnDistance: 70, firstDistance: 48, removeDistance: 9,
    maxObstacles: 8, birdScore: 400,
    // Full held flight lasts <0.82 s; this leaves recovery before the next jump.
    recoveryTime: 1.08, dayDuration: 60, nightDuration: 20, transitionTime: 5
  });
  // Difficulty tiers (Kit.dda picks one for a surprise course; a course code always
  // plays tier 3, which is the original balance above). Tiers 1–2 suit 6–9 year olds:
  // slower, longer gaps, fewer obstacle kinds and kinder colliders. Tiers 4–5 suit
  // skilled 10–11 year olds; their colliders stay as fair as tier 3.
  // speedEvery: score points per +1 speed. recovery + random * spread: seconds between
  // obstacles at the speed they are met. birds / cacti: the variants that can appear.
  // grace: how much smaller than the art the colliders are; a slower world keeps a cactus
  // under the dinosaur for longer, so this is what widens the jump timing window (the
  // camera behind the dinosaur hides the overlap). par: a run this long (score) counts
  // as a full success for Kit.dda.
  var C = D.config, COLUMNS = {
    startSpeed: [11, 13, C.startSpeed, 16, 17], maxSpeed: [24, 29, C.maxSpeed, 38, 41],
    speedEvery: [160, 125, 100, 85, 75],
    recovery: [1.6, 1.3, C.recoveryTime, 1.02, 0.97], spread: [0.6, 0.5, 0.43, 0.4, 0.36],
    birdScore: [1500, 800, C.birdScore, 300, 200], birdChance: [0.15, 0.22, 0.29, 0.33, 0.37],
    birds: [[0], [0, 1], [0, 1, 2], [0, 1, 2], [0, 1, 2]],
    cacti: [[0, 1], [0, 1, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
    grace: [0.3, 0.15, 0, 0, 0],
    par: [250, 400, 600, 850, 1100]
  };
  // +1: a larger value is harder; -1: easier; 'set': later tiers add variants.
  D.knobs = Object.freeze({ startSpeed: 1, maxSpeed: 1, speedEvery: -1, recovery: -1, spread: -1,
    birdScore: -1, birdChance: 1, birds: 'set', cacti: 'set', grace: -1, par: 1 });
  D.tiers = Object.freeze([0, 1, 2, 3, 4].map(function (i) {
    var t = { tier: i + 1 };
    for (var k in COLUMNS) t[k] = Array.isArray(COLUMNS[k][i]) ? Object.freeze(COLUMNS[k][i]) : COLUMNS[k][i];
    return Object.freeze(t);
  }));
  // The knobs of tier n (1..5); anything else is tier 3.
  D.tier = function (n) { return D.tiers[typeof n === 'number' && n >= 1 && n <= 5 ? Math.floor(n) - 1 : 2]; };
  D.palette = Object.freeze({
    sky: 0xd9f1e8, fog: 0xe7ebc9, sand: 0xeab351,
    sandLight: 0xf8cd69, sandDark: 0xca873a, water: 0x36bec0,
    dino: 0x59ae68, dinoLight: 0x84c879, dinoDark: 0x32855b,
    cactus: 0x45976b, flower: 0xe873a0, rock: 0xb28458,
    bird: 0xa96eaa, birdLight: 0xd79fc4
  });
})(globalThis.Dino3D = globalThis.Dino3D || {});

/* Chaos Island (جزيرة الفوضى) — pure deterministic simulation engine.
 * UMD export (window.ChaosEngine + module.exports for Node unit testing).
 * Zero DOM, zero Kit, zero Math.random: all randomness flows through a seeded PRNG. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChaosEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SAVE_VERSION = 4;
  var MATCH_ROUNDS = 5;
  var CARD_TIME = 2.0;
  var ROUND_TIME = 10.8;
  var CLEAR_TIME = 1.8;
  var MAX_HEARTS = 3;

  var ISLAND_MIN_X = -10.0;
  var ISLAND_MAX_X = 10.0;
  var SEA_KILL_Y = -1.15;
  var GROUND_Y = 0.3;

  var GRAVITY = 30.0;
  var MOVE_SPEED = 7.5;
  var JUMP_V = 14.0;
  var DRUM_BOUNCE_V = 15.8;
  var COYOTE_TIME = 0.12;
  var JUMP_BUFFER = 0.14;
  var ACTOR_R = 0.44;
  var ACTOR_H = 1.25;

  // Climbable island platforms (ground is solid; upper decks/crates/bridges are one-way).
  var PLATFORMS = [
    { id: 'ground',         x1: -10.0, x2: 10.0, y: 0.30, solid: true,  tier: 0 },
    { id: 'crate_w1',       x1: -9.2,  x2: -7.2, y: 1.65, solid: false, tier: 1 },
    { id: 'crate_mid_l',    x1: -3.2,  x2: -1.7, y: 1.65, solid: false, tier: 1 },
    { id: 'crate_e1',       x1:  4.0,  x2:  6.0, y: 1.75, solid: false, tier: 1 },
    { id: 'west_deck',      x1: -7.7,  x2: -4.4, y: 3.00, solid: false, tier: 2 },
    { id: 'bridge',         x1: -4.4,  x2: -1.6, y: 3.00, solid: false, tier: 2 },
    { id: 'shelter_roof',   x1: -1.6,  x2:  1.6, y: 3.00, solid: false, tier: 2 },
    { id: 'east_deck',      x1:  5.2,  x2:  9.0, y: 3.30, solid: false, tier: 2 },
    { id: 'west_top',       x1: -7.0,  x2: -4.8, y: 4.65, solid: false, tier: 3 },
    { id: 'lighthouse_top', x1: -1.4,  x2:  1.4, y: 4.95, solid: false, tier: 3 },
    { id: 'east_top',       x1:  5.8,  x2:  8.4, y: 4.85, solid: false, tier: 3 }
  ];

  // Central stone shelter shields players inside from tornado pull and lightning bolts.
  var SHELTER = { x1: -1.5, x2: 1.5, y1: 0.3, y2: 2.92 };
  // Bouncy tropical drum launches players straight onto the mid/upper decks.
  var DRUM = { x: 2.75, y: 0.3, r: 0.95 };

  var DISASTERS = [
    { id: 'meteor',    name: 'وابل النيازك',    hint: 'اهرب من الدوائر!', color: '#ff5238' },
    { id: 'flood',     name: 'طوفان الحمم',     hint: 'اصعد للأعلى!',     color: '#ff7a1a' },
    { id: 'tornado',   name: 'الإعصار الدوّار', hint: 'اختبئ أو اركض!',   color: '#2ad4ff' },
    { id: 'lightning', name: 'عاصفة البرق',     hint: 'تجنّب الصواعق!',   color: '#ffd22e' },
    { id: 'coconuts',  name: 'جوز الهند العملاق', hint: 'اقفز فوقها!',    color: '#c97b38' },
    { id: 'quake',     name: 'الزلزال الكبير',  hint: 'ابتعد عن الشقوق!', color: '#ff3b6b' }
  ];
  var DISASTER_MAP = {};
  for (var di = 0; di < DISASTERS.length; di++) DISASTER_MAP[DISASTERS[di].id] = DISASTERS[di];

  var COLORS = [
    { id: 'blue',    name: 'أزرق البحر',    hex: 0x2ea8ff, cost: 0 },
    { id: 'coral',   name: 'مرجاني',        hex: 0xff5a7a, cost: 0 },
    { id: 'sunny',   name: 'أصفر الشمس',    hex: 0xffc824, cost: 30 },
    { id: 'mint',    name: 'أخضر الغابة',   hex: 0x38d878, cost: 45 },
    { id: 'berry',   name: 'بنفسجي التوت',  hex: 0x9b5cff, cost: 60 },
    { id: 'mango',   name: 'برتقالي المانجو', hex: 0xff8524, cost: 80 },
    { id: 'pink',    name: 'فلامنغو',       hex: 0xff6ec7, cost: 100 },
    { id: 'cyan',    name: 'فيروزي',        hex: 0x1ee3cf, cost: 130 }
  ];

  var HATS = [
    { id: 'none',    name: 'بلا قبعة',      cost: 0 },
    { id: 'leaf',    name: 'ورقة نخيل',     cost: 25 },
    { id: 'shades',  name: 'نظارة شمس',     cost: 40 },
    { id: 'pirate',  name: 'قبعة قراصنة',   cost: 65 },
    { id: 'party',   name: 'قبعة حفلة',     cost: 80 },
    { id: 'viking',  name: 'خوذة الفايكنغ', cost: 105 },
    { id: 'dino',    name: 'قبعة ديناصور',  cost: 135 },
    { id: 'crown',   name: 'تاج الجزيرة',   cost: 180 }
  ];

  var BOT_LOOKS = [
    { color: 2, hat: 1 },
    { color: 3, hat: 4 },
    { color: 4, hat: 2 },
    { color: 5, hat: 3 }
  ];

  /* ---------------------------------------------------------- deterministic RNG */
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 1000000) / 1000000;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------------------------------------------------------- save helpers */
  function defaultSave() {
    return {
      v: SAVE_VERSION,
      coins: 0,
      bestScore: 0,
      bestStars: 0,
      bestWaves: 0,
      wins: 0,
      color: 0,
      hat: 0,
      ownedColors: [1, 1, 0, 0, 0, 0, 0, 0],
      ownedHats: [1, 0, 0, 0, 0, 0, 0, 0],
      coachDone: false
    };
  }

  function loadSave(raw) {
    var s = defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return s;
    if (typeof raw.coins === 'number' && raw.coins >= 0 && isFinite(raw.coins)) s.coins = Math.floor(raw.coins);
    if (typeof raw.bestScore === 'number' && raw.bestScore >= 0 && isFinite(raw.bestScore)) s.bestScore = Math.floor(raw.bestScore);
    if (typeof raw.bestStars === 'number' && raw.bestStars >= 0 && isFinite(raw.bestStars)) s.bestStars = clamp(Math.floor(raw.bestStars), 0, 3);
    if (typeof raw.bestWaves === 'number' && raw.bestWaves >= 0 && isFinite(raw.bestWaves)) s.bestWaves = Math.floor(raw.bestWaves);
    if (typeof raw.wins === 'number' && raw.wins >= 0 && isFinite(raw.wins)) s.wins = Math.floor(raw.wins);
    if (Array.isArray(raw.ownedColors)) {
      for (var i = 0; i < COLORS.length; i++) if (raw.ownedColors[i]) s.ownedColors[i] = 1;
    }
    if (Array.isArray(raw.ownedHats)) {
      for (var j = 0; j < HATS.length; j++) if (raw.ownedHats[j]) s.ownedHats[j] = 1;
    }
    var ci = typeof raw.color === 'number' ? Math.floor(raw.color) : 0;
    if (ci >= 0 && ci < COLORS.length && s.ownedColors[ci]) s.color = ci;
    var hi = typeof raw.hat === 'number' ? Math.floor(raw.hat) : 0;
    if (hi >= 0 && hi < HATS.length && s.ownedHats[hi]) s.hat = hi;
    s.coachDone = !!raw.coachDone;
    return s;
  }

  function buyOrEquip(save, kind, index) {
    var list = kind === 'color' ? COLORS : HATS;
    var owned = kind === 'color' ? save.ownedColors : save.ownedHats;
    if (index < 0 || index >= list.length) return 'invalid';
    if (owned[index]) {
      if (kind === 'color') save.color = index; else save.hat = index;
      return 'equip';
    }
    var cost = list[index].cost;
    if (save.coins < cost) return 'poor';
    save.coins -= cost;
    owned[index] = 1;
    if (kind === 'color') save.color = index; else save.hat = index;
    return 'buy';
  }

  /* ---------------------------------------------------------- difficulty knobs */
  function difficultyParams(tier, level, waveIndex) {
    var t = clamp(typeof level === 'number' ? level : ((tier || 2) - 1) / 4, 0, 1);
    var extra = Math.min(0.6, Math.max(0, (waveIndex || 0) - 4) * 0.08);
    var d = clamp(t + extra, 0, 1.35);
    return {
      telegraph: lerp(1.38, 0.88, Math.min(1, d)),
      meteorEvery: lerp(0.88, 0.44, Math.min(1, d)),
      lightningEvery: lerp(0.98, 0.50, Math.min(1, d)),
      coconutEvery: lerp(1.12, 0.62, Math.min(1, d)),
      coconutSpeed: lerp(7.4, 11.4, Math.min(1, d)),
      tornadoPull: lerp(21.0, 31.0, Math.min(1, d)),
      tornadoSpeed: lerp(4.8, 7.2, Math.min(1, d)),
      quakeEvery: lerp(1.65, 1.05, Math.min(1, d)),
      floodPeak: lerp(2.38, 2.55, Math.min(1, d)),
      botSkill: lerp(0.55, 0.82, Math.min(1, t))
    };
  }

  /* ---------------------------------------------------------- helpers */
  function inShelter(a) {
    return a.x >= SHELTER.x1 && a.x <= SHELTER.x2 && a.y >= SHELTER.y1 - 0.1 && a.y <= SHELTER.y2;
  }

  function shuffleIds(rng) {
    var list = DISASTERS.map(function (d) { return d.id; });
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function makeActor(opts) {
    return {
      id: opts.id,
      slot: opts.slot,
      isHuman: !!opts.isHuman,
      humanIndex: opts.humanIndex != null ? opts.humanIndex : -1,
      colorIndex: opts.colorIndex,
      hatIndex: opts.hatIndex,
      x: opts.x,
      y: opts.y,
      zOff: opts.zOff || 0,
      vx: 0,
      vy: 0,
      facing: opts.facing || 1,
      ground: true,
      platId: 'ground',
      coyote: 0,
      jumpBuf: 0,
      jumpHeld: false,
      dropT: 0,
      hearts: MAX_HEARTS,
      maxHearts: MAX_HEARTS,
      alive: true,
      ghost: false,
      invuln: 0,
      hurtT: 0,
      bumpCd: 0,
      squash: 1,
      runPhase: 0,
      walk: 0,
      coins: 0,
      survived: 0,
      score: 0,
      sheltered: false,
      aiTargetX: opts.x,
      aiDecideT: 0
    };
  }

  /* ---------------------------------------------------------- create world */
  function create(opts) {
    opts = opts || {};
    var seed = (opts.seed != null ? opts.seed : 1337) >>> 0;
    var rng = makeRng(seed);
    var duo = !!opts.duo;
    var endless = !!opts.endless;
    var demo = !!opts.demo;
    var tier = clamp(opts.tier || 2, 1, 5);
    var level = typeof opts.level === 'number' ? clamp(opts.level, 0, 1) : (tier - 1) / 4;
    var p1Color = opts.p1Color != null ? opts.p1Color : 0;
    var p1Hat = opts.p1Hat != null ? opts.p1Hat : 0;
    var p2Color = p1Color === 1 ? 0 : 1;
    var p2Hat = opts.p2Hat != null ? opts.p2Hat : 0;

    var schedule = Array.isArray(opts.schedule) && opts.schedule.length ? opts.schedule.slice() : shuffleIds(rng);
    var actors = [];

    if (demo) {
      var demoXs = [-6.2, -2.6, 0.2, 3.6, 6.8];
      for (var d = 0; d < demoXs.length; d++) {
        actors.push(makeActor({
          id: 'b' + d, slot: d, isHuman: false,
          colorIndex: d % COLORS.length, hatIndex: (d + 1) % HATS.length,
          x: demoXs[d], y: GROUND_Y, zOff: ((d % 3) - 1) * 0.45,
          facing: d < 2 ? 1 : -1
        }));
      }
    } else {
      // P1 spawns at x = -3.6 (open deck, NOT inside shelter!), P2 at x = +3.8.
      actors.push(makeActor({
        id: 'p1', slot: 0, isHuman: true, humanIndex: 0,
        colorIndex: p1Color, hatIndex: p1Hat,
        x: -3.6, y: GROUND_Y, zOff: 0, facing: 1
      }));
      if (duo) {
        actors.push(makeActor({
          id: 'p2', slot: 1, isHuman: true, humanIndex: 1,
          colorIndex: p2Color, hatIndex: p2Hat,
          x: 3.8, y: GROUND_Y, zOff: 0, facing: -1
        }));
      }
      var botCount = duo ? 3 : 4;
      var botXs = duo ? [-7.8, 0.2, 7.6] : [-7.8, -0.5, 4.4, 7.8];
      for (var b = 0; b < botCount; b++) {
        var look = BOT_LOOKS[b % BOT_LOOKS.length];
        actors.push(makeActor({
          id: 'bot' + b, slot: actors.length, isHuman: false,
          colorIndex: look.color === p1Color ? (look.color + 2) % COLORS.length : look.color,
          hatIndex: look.hat,
          x: botXs[b], y: GROUND_Y, zOff: ((b % 3) - 1) * 0.42,
          facing: botXs[b] < 0 ? 1 : -1
        }));
      }
    }

    var world = {
      seed: seed,
      rng: rng,
      duo: duo,
      endless: endless,
      demo: demo,
      tier: tier,
      level: level,
      maxRounds: endless ? 9999 : MATCH_ROUNDS,
      round: 0,
      phase: demo ? 'demo' : 'card',
      t: 0,
      frames: 0,
      disaster: schedule[0],
      schedule: schedule,
      bag: schedule.slice(1),
      actors: actors,
      coins: [],
      meteors: [],
      bolts: [],
      coconuts: [],
      cracks: [],
      tornado: null,
      lavaY: -1.65,
      lavaTargetY: -1.65,
      drumBounceT: 0,
      quakeShake: 0,
      spawnAcc: 0,
      subAcc: 0,
      coinAcc: 0,
      humanMoved: false,
      finished: false,
      result: null,
      events: []
    };

    if (!demo) {
      spawnRoundCoins(world);
      world.events.push({ type: 'disasterCard', disaster: world.disaster, round: 0 });
    }
    return world;
  }

  /* ---------------------------------------------------------- round management */
  function nextDisasterId(world) {
    if (!world.bag.length) world.bag = shuffleIds(world.rng);
    // Avoid immediate repeat across bag boundaries.
    if (world.bag[0] === world.disaster && world.bag.length > 1) {
      var tmp = world.bag[0]; world.bag[0] = world.bag[1]; world.bag[1] = tmp;
    }
    return world.bag.shift();
  }

  function clearHazards(world) {
    world.meteors.length = 0;
    world.bolts.length = 0;
    world.coconuts.length = 0;
    world.cracks.length = 0;
    world.tornado = null;
    world.lavaTargetY = -1.65;
    world.quakeShake = 0;
    world.spawnAcc = 0;
    world.subAcc = 0;
  }

  function spawnRoundCoins(world) {
    world.coins.length = 0;
    var spots = [
      [-8.2, 2.5], [-6.0, 3.9], [-5.9, 5.55], [-3.0, 3.9], [0.0, 3.9],
      [0.0, 5.85], [2.75, 2.3], [5.0, 2.65], [7.0, 4.2], [7.1, 5.75],
      [-5.2, 1.2], [5.2, 1.2]
    ];
    // Pick 6 deterministic coin locations per round.
    var picked = [];
    for (var i = 0; i < spots.length; i++) picked.push(i);
    for (var k = picked.length - 1; k > 0; k--) {
      var j = Math.floor(world.rng() * (k + 1));
      var tmp = picked[k]; picked[k] = picked[j]; picked[j] = tmp;
    }
    for (var c = 0; c < 6; c++) {
      var sp = spots[picked[c]];
      world.coins.push({ id: world.round * 20 + c, x: sp[0], y: sp[1], taken: false, phase: c * 1.1 });
    }
  }

  function resetActorsForNextRound(world) {
    var spawns = world.duo ? [-3.6, 3.8, -7.8, 0.2, 7.6] : [-3.6, -7.8, -0.5, 4.4, 7.8];
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!world.endless) {
        a.hearts = MAX_HEARTS;
        a.alive = true;
        a.ghost = false;
      } else if (a.alive) {
        a.hearts = Math.min(MAX_HEARTS, a.hearts + 1);
      } else if (!a.isHuman) {
        // Respawn bots in endless so the island stays lively.
        a.hearts = MAX_HEARTS;
        a.alive = true;
        a.ghost = false;
      }
      if (a.alive) {
        if (a.y < GROUND_Y) {
          a.x = spawns[i % spawns.length];
          a.y = GROUND_Y + 0.2;
        }
        a.vx = 0; a.vy = 0;
        a.invuln = 0.8;
      }
    }
  }

  /* ---------------------------------------------------------- damage & coins */
  function damageActor(world, a, knockX, knockY, reason) {
    if (!a.alive || a.invuln > 0) return false;
    a.hearts = Math.max(0, a.hearts - 1);
    a.invuln = 1.15;
    a.hurtT = 0.45;
    a.vx = clamp(knockX || 0, -9.5, 9.5);
    a.vy = Math.max(5.5, knockY || 7.2);
    a.ground = false;
    a.squash = 0.62;
    world.events.push({ type: 'hit', actorId: a.id, isHuman: a.isHuman, humanIndex: a.humanIndex, x: a.x, y: a.y, reason: reason, hearts: a.hearts });

    if (a.hearts <= 0) {
      a.alive = false;
      a.ghost = true;
      a.vx = 0;
      a.vy = 2.5;
      world.events.push({ type: 'ko', actorId: a.id, isHuman: a.isHuman, humanIndex: a.humanIndex, x: a.x, y: a.y, reason: reason });
    }
    return true;
  }

  function rescueFromSea(world, a) {
    var ok = damageActor(world, a, -Math.sign(a.x || 1) * 4.0, 9.0, 'sea');
    if (a.alive) {
      a.x = clamp(a.x, -7.0, 7.0);
      a.y = Math.max(3.6, world.lavaY + 1.8);
      a.vx = 0;
      a.vy = 3.5;
      a.invuln = 1.6;
    } else if (!ok) {
      // Already invuln while falling into sea -> still teleport back safely.
      a.x = clamp(a.x, -7.0, 7.0);
      a.y = Math.max(3.6, world.lavaY + 1.8);
      a.vx = 0;
      a.vy = 3.5;
    }
  }

  /* ---------------------------------------------------------- disasters */
  function pickTargetX(world, preferOutsideShelter) {
    var cands = [];
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive) continue;
      if (preferOutsideShelter && inShelter(a)) continue;
      cands.push(a);
      // Weight human players slightly higher so standing still is always challenged.
      if (a.isHuman) cands.push(a);
    }
    if (!cands.length) return lerp(-8.8, 8.8, world.rng());
    var picked = cands[Math.floor(world.rng() * cands.length)];
    return clamp(picked.x + (world.rng() - 0.5) * 0.9, -9.2, 9.2);
  }

  function surfaceYAt(x, nearY) {
    var best = GROUND_Y;
    var bestDist = Infinity;
    for (var i = 0; i < PLATFORMS.length; i++) {
      var p = PLATFORMS[i];
      if (x >= p.x1 && x <= p.x2) {
        if (nearY != null) {
          var d = Math.abs(p.y - nearY);
          if (d < bestDist) { bestDist = d; best = p.y; }
        } else if (p.y > best) {
          best = p.y;
        }
      }
    }
    return best;
  }

  function spawnMeteor(world, params) {
    var targeted = world.rng() < 0.62;
    var tx = targeted ? pickTargetX(world, false) : lerp(-9.2, 9.2, world.rng());
    var ty = GROUND_Y;
    if (targeted) {
      // Match the height of the nearest alive actor around tx.
      var near = null, nd = 2.5;
      for (var i = 0; i < world.actors.length; i++) {
        var a = world.actors[i];
        if (a.alive && Math.abs(a.x - tx) < nd) { nd = Math.abs(a.x - tx); near = a; }
      }
      ty = near ? surfaceYAt(tx, near.y) : surfaceYAt(tx, null);
    } else {
      ty = world.rng() < 0.45 ? surfaceYAt(tx, null) : GROUND_Y;
    }
    var tel = params.telegraph;
    world.meteors.push({
      x: tx, y: ty + 16.0, tx: tx, ty: ty,
      t: 0, telegraph: tel, hit: false, fade: 0, r: 1.48
    });
    world.events.push({ type: 'telegraph', kind: 'meteor', x: tx, y: ty });
  }

  function spawnLightning(world, params) {
    var targeted = world.rng() < 0.65;
    var tx = targeted ? pickTargetX(world, false) : lerp(-9.2, 9.2, world.rng());
    var ty = GROUND_Y;
    // Lightning stops on shelter roof if targeting above the shelter.
    if (tx >= SHELTER.x1 && tx <= SHELTER.x2) ty = 3.0;
    else ty = surfaceYAt(tx, null);
    world.bolts.push({
      x: tx, y: ty, t: 0, telegraph: params.telegraph * 0.92,
      struck: false, fade: 0, r: 1.38
    });
    world.events.push({ type: 'telegraph', kind: 'lightning', x: tx, y: ty });
  }

  function spawnCoconut(world, params) {
    var dir = world.rng() < 0.5 ? 1 : -1;
    var startX = dir > 0 ? -10.4 : 10.4;
    // Mostly roll along the ground deck; occasionally drop on the upper bridge!
    var high = world.rng() < 0.24;
    var startY = high ? 3.0 + 0.85 : GROUND_Y + 0.92;
    if (high) startX = dir > 0 ? -7.4 : 8.6;
    world.coconuts.push({
      x: startX, y: startY, vx: dir * params.coconutSpeed, vy: 0,
      r: 0.92, rot: 0, warnT: 0.72, dir: dir, alive: true
    });
    world.events.push({ type: 'telegraph', kind: 'coconuts', x: startX, y: startY, dir: dir });
  }

  function spawnQuakeWave(world, params) {
    // Place 3 glowing magma fissures; always place one right under an alive human!
    var centers = [];
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (a.isHuman && a.alive && a.y < 3.6) centers.push(clamp(a.x, -8.5, 8.5));
    }
    while (centers.length < 3) {
      var cx = lerp(-8.4, 8.4, world.rng());
      var ok = true;
      for (var j = 0; j < centers.length; j++) if (Math.abs(centers[j] - cx) < 2.6) ok = false;
      if (ok) centers.push(cx);
    }
    for (var k = 0; k < centers.length; k++) {
      var x = centers[k];
      var y = k === 0 && world.actors[0] && world.actors[0].alive && world.actors[0].y > 2.4 && world.actors[0].y < 3.6
        ? surfaceYAt(x, world.actors[0].y) : GROUND_Y;
      world.cracks.push({
        x: x, y: y, w: 2.75, t: 0,
        telegraph: params.telegraph * 0.95, eruptDur: 1.15,
        erupted: false, done: false
      });
    }
    world.quakeShake = 0.55;
    world.events.push({ type: 'telegraph', kind: 'quake', x: centers[0], y: GROUND_Y });
  }

  function stepDisaster(world, dt, params) {
    var d = world.disaster;

    if (d === 'meteor') {
      world.spawnAcc -= dt;
      if (world.spawnAcc <= 0 && world.t < ROUND_TIME - 1.2) {
        world.spawnAcc = params.meteorEvery * (0.85 + world.rng() * 0.3);
        spawnMeteor(world, params);
      }
    } else if (d === 'flood') {
      // Rise smoothly from t = 0.2 to t = 4.0 (3.8s climb warning), hold high until t = 9.0, then recede.
      if (world.t < 4.0) {
        var u = clamp((world.t - 0.2) / 3.8, 0, 1);
        world.lavaTargetY = lerp(-1.65, params.floodPeak, u * u * (3 - 2 * u));
      } else if (world.t < ROUND_TIME - 1.8) {
        world.lavaTargetY = params.floodPeak + Math.sin(world.t * 3.5) * 0.12;
      } else {
        var r = clamp((world.t - (ROUND_TIME - 1.8)) / 1.8, 0, 1);
        world.lavaTargetY = lerp(params.floodPeak, -1.65, r);
      }
      // Sizzle any actor submerged in lava!
      for (var fi = 0; fi < world.actors.length; fi++) {
        var fa = world.actors[fi];
        if (fa.alive && fa.y < world.lavaY - 0.08) {
          damageActor(world, fa, (world.rng() - 0.5) * 3.0, 9.8, 'flood');
        }
      }
    } else if (d === 'tornado') {
      if (!world.tornado) {
        var startDir = world.rng() < 0.5 ? 1 : -1;
        world.tornado = {
          x: startDir > 0 ? -9.4 : 9.4,
          vx: startDir * params.tornadoSpeed,
          r: 1.55,
          t: 0,
          active: false
        };
        world.events.push({ type: 'telegraph', kind: 'tornado', x: world.tornado.x, y: GROUND_Y });
      }
      var tor = world.tornado;
      tor.t += dt;
      tor.active = tor.t > 0.75;
      if (tor.active) {
        tor.x += tor.vx * dt;
        if (tor.x > 8.6) { tor.x = 8.6; tor.vx = -Math.abs(params.tornadoSpeed); }
        if (tor.x < -8.6) { tor.x = -8.6; tor.vx = Math.abs(params.tornadoSpeed); }
        for (var ti = 0; ti < world.actors.length; ti++) {
          var ta = world.actors[ti];
          if (!ta.alive) continue;
          if (inShelter(ta)) continue; // Stone shelter protects from tornado pull!
          var dx = tor.x - ta.x;
          var adx = Math.abs(dx);
          if (adx < 8.5) {
            var pull = (1 - adx / 8.5) * params.tornadoPull;
            ta.vx += Math.sign(dx || 1) * pull * dt;
          }
          if (adx < tor.r && ta.y < 4.5) {
            damageActor(world, ta, Math.sign(ta.x - tor.x || tor.vx || 1) * 7.8, 10.2, 'tornado');
          }
        }
      }
    } else if (d === 'lightning') {
      world.spawnAcc -= dt;
      if (world.spawnAcc <= 0 && world.t < ROUND_TIME - 1.2) {
        world.spawnAcc = params.lightningEvery * (0.85 + world.rng() * 0.3);
        spawnLightning(world, params);
      }
    } else if (d === 'coconuts') {
      world.spawnAcc -= dt;
      if (world.spawnAcc <= 0 && world.t < ROUND_TIME - 1.0) {
        world.spawnAcc = params.coconutEvery * (0.85 + world.rng() * 0.3);
        spawnCoconut(world, params);
      }
    } else if (d === 'quake') {
      world.spawnAcc -= dt;
      if (world.spawnAcc <= 0 && world.t < ROUND_TIME - 1.5) {
        world.spawnAcc = params.quakeEvery;
        spawnQuakeWave(world, params);
      }
    }

    // Endless high-wave twist: bonus stray meteors on waves >= 5 (round index >= 5).
    if (world.endless && world.round >= 5 && d !== 'meteor') {
      world.subAcc -= dt;
      if (world.subAcc <= 0 && world.t < ROUND_TIME - 1.5) {
        world.subAcc = 2.4;
        spawnMeteor(world, params);
      }
    }
  }

  function updateHazards(world, dt) {
    // Smooth lava level
    world.lavaY = lerp(world.lavaY, world.lavaTargetY, Math.min(1, dt * 7));
    if (world.quakeShake > 0) world.quakeShake = Math.max(0, world.quakeShake - dt * 1.1);

    // Meteors
    for (var mi = world.meteors.length - 1; mi >= 0; mi--) {
      var m = world.meteors[mi];
      m.t += dt;
      if (!m.hit) {
        var prog = clamp(m.t / m.telegraph, 0, 1);
        // Drop smoothly from sky once past 45% of telegraph
        var fallU = prog < 0.45 ? 0 : (prog - 0.45) / 0.55;
        m.y = lerp(m.ty + 17.0, m.ty + 0.5, fallU * fallU);
        if (m.t >= m.telegraph) {
          m.hit = true;
          m.y = m.ty + 0.4;
          world.events.push({ type: 'impact', kind: 'meteor', x: m.tx, y: m.ty });
          for (var ai = 0; ai < world.actors.length; ai++) {
            var a = world.actors[ai];
            if (!a.alive) continue;
            var dx = a.x - m.tx;
            var dy = (a.y + 0.5) - (m.ty + 0.5);
            if (Math.hypot(dx, dy) < m.r + ACTOR_R * 0.7) {
              damageActor(world, a, Math.sign(dx || (world.rng() - 0.5)) * 7.2, 8.6, 'meteor');
            }
          }
        }
      } else {
        m.fade += dt;
        if (m.fade > 0.42) world.meteors.splice(mi, 1);
      }
    }

    // Lightning bolts
    for (var bi = world.bolts.length - 1; bi >= 0; bi--) {
      var b = world.bolts[bi];
      b.t += dt;
      if (!b.struck) {
        if (b.t >= b.telegraph) {
          b.struck = true;
          world.events.push({ type: 'impact', kind: 'lightning', x: b.x, y: b.y });
          for (var aj = 0; aj < world.actors.length; aj++) {
            var a2 = world.actors[aj];
            if (!a2.alive) continue;
            if (inShelter(a2) && b.y >= 2.8) continue; // Shelter roof absorbs bolt!
            if (Math.abs(a2.x - b.x) < b.r && a2.y >= b.y - 0.5) {
              damageActor(world, a2, Math.sign(a2.x - b.x || 1) * 6.5, 8.2, 'lightning');
            }
          }
        }
      } else {
        b.fade += dt;
        if (b.fade > 0.36) world.bolts.splice(bi, 1);
      }
    }

    // Giant rolling coconuts
    for (var ci = world.coconuts.length - 1; ci >= 0; ci--) {
      var c = world.coconuts[ci];
      if (c.warnT > 0) {
        c.warnT -= dt;
        continue;
      }
      c.vy -= GRAVITY * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot -= (c.vx * dt) / c.r;
      // Support on platforms & ground
      for (var pi = 0; pi < PLATFORMS.length; pi++) {
        var pl = PLATFORMS[pi];
        if (c.x >= pl.x1 - 0.2 && c.x <= pl.x2 + 0.2 && c.vy <= 0) {
          var surf = pl.y + c.r;
          if (c.y <= surf && c.y >= surf - 0.75) {
            c.y = surf;
            c.vy = Math.abs(c.vy) > 4.0 ? Math.abs(c.vy) * 0.42 : 0;
          }
        }
      }
      // Hit actors
      for (var ak = 0; ak < world.actors.length; ak++) {
        var a3 = world.actors[ak];
        if (!a3.alive) continue;
        var cdx = a3.x - c.x;
        var cdy = (a3.y + 0.55) - c.y;
        if (Math.hypot(cdx, cdy) < c.r + ACTOR_R * 0.72) {
          damageActor(world, a3, Math.sign(c.vx || cdx || 1) * 8.4, 8.4, 'coconuts');
        }
      }
      if (c.x < -12.8 || c.x > 12.8 || c.y < -3.0) world.coconuts.splice(ci, 1);
    }

    // Earthquake magma cracks
    for (var qi = world.cracks.length - 1; qi >= 0; qi--) {
      var q = world.cracks[qi];
      q.t += dt;
      if (!q.erupted && q.t >= q.telegraph) {
        q.erupted = true;
        world.quakeShake = Math.max(world.quakeShake, 0.85);
        world.events.push({ type: 'impact', kind: 'quake', x: q.x, y: q.y });
      }
      if (q.erupted) {
        var et = q.t - q.telegraph;
        if (et < q.eruptDur) {
          for (var al = 0; al < world.actors.length; al++) {
            var a4 = world.actors[al];
            if (!a4.alive) continue;
            if (Math.abs(a4.x - q.x) < q.w * 0.5 + 0.15 && Math.abs(a4.y - q.y) < 1.35) {
              damageActor(world, a4, Math.sign(a4.x - q.x || 1) * 5.8, 9.5, 'quake');
            }
          }
        } else {
          world.cracks.splice(qi, 1);
        }
      }
    }
  }

  /* ---------------------------------------------------------- actor physics */
  function stepActor(world, a, dt, input) {
    if (a.invuln > 0) a.invuln = Math.max(0, a.invuln - dt);
    if (a.hurtT > 0) a.hurtT = Math.max(0, a.hurtT - dt);
    if (a.bumpCd > 0) a.bumpCd = Math.max(0, a.bumpCd - dt);
    if (a.dropT > 0) a.dropT = Math.max(0, a.dropT - dt);
    a.squash = lerp(a.squash, 1, Math.min(1, dt * 14));

    if (!a.alive) {
      // Cute cheering ghost bobbing gently over the island!
      a.x += Math.sin(world.frames * 0.03 + a.slot * 1.7) * 0.8 * dt;
      a.x = clamp(a.x, -8.5, 8.5);
      a.y = lerp(a.y, 6.2 + Math.sin(world.frames * 0.06 + a.slot) * 0.45, Math.min(1, dt * 3));
      a.sheltered = false;
      return;
    }

    var mx = clamp(input.moveX || 0, -1, 1);
    var jumpPressed = !!input.jumpPressed;
    var jumpDown = !!input.jumpDown;
    var downPressed = !!input.downPressed;

    // Record intentional human movement/jump ONLY (never external forces!).
    if (a.isHuman) {
      if (Math.abs(mx) > 0.05) {
        a.walk += Math.abs(mx) * 60 * dt;
        world.humanMoved = true;
      }
      if (jumpPressed) {
        a.walk += 12;
        world.humanMoved = true;
      }
    }

    if (mx !== 0) a.facing = mx > 0 ? 1 : -1;

    var targetVx = mx * MOVE_SPEED;
    var accel = a.ground ? (mx !== 0 ? 58 : 44) : (mx !== 0 ? 34 : 7);
    var dv = targetVx - a.vx;
    var maxDv = accel * dt;
    a.vx += clamp(dv, -maxDv, maxDv);
    a.vx = clamp(a.vx, -12.0, 12.0);

    // Coyote time & jump buffer
    if (a.ground) a.coyote = COYOTE_TIME;
    else a.coyote = Math.max(0, a.coyote - dt);

    if (jumpPressed) a.jumpBuf = JUMP_BUFFER;
    else a.jumpBuf = Math.max(0, a.jumpBuf - dt);

    // Drop through one-way platforms
    if (downPressed && a.ground && a.platId !== 'ground') {
      a.dropT = 0.24;
      a.ground = false;
      a.coyote = 0;
      a.y -= 0.08;
      a.vy = -2.2;
    }

    // Execute buffered/coyote jump
    if (a.jumpBuf > 0 && a.coyote > 0) {
      a.vy = JUMP_V;
      a.ground = false;
      a.coyote = 0;
      a.jumpBuf = 0;
      a.squash = 1.28;
      world.events.push({ type: 'jump', actorId: a.id, isHuman: a.isHuman, x: a.x, y: a.y });
    }

    // Variable jump height cut when button released early
    if (!jumpDown && a.jumpHeld && a.vy > 5.0) {
      a.vy *= 0.58;
    }
    a.jumpHeld = jumpDown;

    // Gravity & integrate
    var prevY = a.y;
    a.vy = Math.max(-22.0, a.vy - GRAVITY * dt);
    a.x += a.vx * dt;
    a.y += a.vy * dt;

    // Platform landing collision (one-way & solid ground)
    var wasGround = a.ground;
    a.ground = false;
    a.platId = '';
    if (a.vy <= 0) {
      for (var i = 0; i < PLATFORMS.length; i++) {
        var p = PLATFORMS[i];
        if (!p.solid && a.dropT > 0) continue;
        if (a.x + ACTOR_R * 0.65 >= p.x1 && a.x - ACTOR_R * 0.65 <= p.x2) {
          if (prevY >= p.y - 0.12 && a.y <= p.y + 0.02) {
            a.y = p.y;
            a.vy = 0;
            a.ground = true;
            a.platId = p.id;
            if (!wasGround) {
              a.squash = 0.78;
              world.events.push({ type: 'land', actorId: a.id, isHuman: a.isHuman, x: a.x, y: a.y });
            }
            break;
          }
        }
      }
    }

    // Bouncy Tiki Drum
    if (a.vy <= 0.5 && Math.abs(a.x - DRUM.x) <= DRUM.r && a.y >= DRUM.y - 0.15 && a.y <= DRUM.y + 0.65) {
      a.vy = DRUM_BOUNCE_V;
      a.ground = false;
      a.coyote = 0;
      a.squash = 1.38;
      world.drumBounceT = 0.35;
      world.events.push({ type: 'bounce', actorId: a.id, isHuman: a.isHuman, x: DRUM.x, y: DRUM.y });
    }

    // Keep characters near island bounds softly unless knocked off
    if (a.x < -12.5) a.x = -12.5;
    if (a.x > 12.5) a.x = 12.5;

    // Sea fall rescue
    if (a.y < SEA_KILL_Y) {
      rescueFromSea(world, a);
    }

    // Shelter indicator
    a.sheltered = inShelter(a);

    // Run cycle animation
    if (a.ground && Math.abs(a.vx) > 0.6) a.runPhase += Math.abs(a.vx) * dt * 2.1;
    else a.runPhase *= 0.85;

    // Collect coins
    for (var ci = 0; ci < world.coins.length; ci++) {
      var c = world.coins[ci];
      if (c.taken) continue;
      if (Math.hypot(a.x - c.x, (a.y + 0.6) - c.y) < 1.05) {
        c.taken = true;
        a.coins += 1;
        a.score += 15;
        world.events.push({ type: 'coin', actorId: a.id, isHuman: a.isHuman, x: c.x, y: c.y });
      }
    }
  }

  /* ---------------------------------------------------------- playful bumping */
  function resolveBumps(world) {
    var list = world.actors;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a.alive) continue;
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        if (!b.alive) continue;
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var adx = Math.abs(dx);
        var ady = Math.abs(dy);
        if (adx < ACTOR_R * 1.95 && ady < ACTOR_H * 0.78) {
          // Head bounce!
          if (dy > 0.45 && b.vy < -1.0) {
            b.vy = 8.4;
            b.squash = 1.22;
            a.squash = 0.74;
            if (b.bumpCd <= 0) {
              b.bumpCd = 0.35;
              world.events.push({ type: 'bump', x: (a.x + b.x) * 0.5, y: b.y, human: a.isHuman || b.isHuman });
            }
            continue;
          }
          if (dy < -0.45 && a.vy < -1.0) {
            a.vy = 8.4;
            a.squash = 1.22;
            b.squash = 0.74;
            if (a.bumpCd <= 0) {
              a.bumpCd = 0.35;
              world.events.push({ type: 'bump', x: (a.x + b.x) * 0.5, y: a.y, human: a.isHuman || b.isHuman });
            }
            continue;
          }
          // Gentle horizontal boing (never shove a sheltered player out of cover!)
          var dir = dx >= 0 ? 1 : -1;
          var overlap = ACTOR_R * 1.95 - adx;
          var aShel = inShelter(a), bShel = inShelter(b);
          if (aShel && !bShel) {
            b.x += dir * overlap * 0.8;
          } else if (bShel && !aShel) {
            a.x -= dir * overlap * 0.8;
          } else {
            a.x -= dir * overlap * 0.45;
            b.x += dir * overlap * 0.45;
            if (aShel) a.x = clamp(a.x, SHELTER.x1 + 0.12, SHELTER.x2 - 0.12);
            if (bShel) b.x = clamp(b.x, SHELTER.x1 + 0.12, SHELTER.x2 - 0.12);
          }
          if (a.bumpCd <= 0 && b.bumpCd <= 0 && !aShel && !bShel && Math.abs(a.vx - b.vx) > 2.2) {
            var impulse = clamp(Math.abs(a.vx - b.vx) * 0.42, 1.8, 4.6);
            a.vx -= dir * impulse;
            b.vx += dir * impulse;
            a.squash = 0.82;
            b.squash = 0.82;
            a.bumpCd = 0.35;
            b.bumpCd = 0.35;
            world.events.push({ type: 'bump', x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 + 0.5, human: a.isHuman || b.isHuman });
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------- bot & coach AI */
  function planActorAI(world, a, skill) {
    skill = skill == null ? 0.75 : skill;
    var out = { moveX: 0, jumpPressed: false, jumpDown: false, downPressed: false };
    if (!a.alive) return out;

    // Title demo: playful island exploration
    if (world.demo) {
      if (Math.abs(a.aiTargetX - a.x) < 0.8 || world.frames % 120 === (a.slot * 23) % 120) {
        a.aiTargetX = lerp(-8.0, 8.0, world.rng());
      }
      out.moveX = Math.abs(a.aiTargetX - a.x) > 0.35 ? Math.sign(a.aiTargetX - a.x) : 0;
      if (a.ground && (Math.abs(a.x - DRUM.x) < 1.0 || (world.frames + a.slot * 37) % 95 === 0)) {
        out.jumpPressed = true; out.jumpDown = true;
      }
      return out;
    }

    var d = world.disaster;
    var goalX = a.x;
    var wantHigh = false;
    var urgentJump = false;

    if (d === 'flood') {
      wantHigh = true;
      // Climb toward nearest upper deck (West, Center, or East)
      if (a.y < 2.9) {
        if (a.x < -4.2) goalX = a.y < 1.5 ? -8.2 : -5.8;
        else if (a.x < 1.5) goalX = a.y < 1.5 ? -2.6 : 0.0;
        else goalX = a.y < 1.5 ? 2.75 : 6.8;
        if (a.ground && Math.abs(goalX - a.x) < 1.9) urgentJump = true;
      } else {
        // Safe on upper deck; collect nearby upper coin or center on deck
        goalX = a.x < -1.6 ? -5.8 : (a.x > 4.0 ? 7.0 : 0.0);
      }
    } else if (d === 'tornado') {
      // Shelter inside central stone pillars if close, else run opposite tornado!
      if (Math.abs(a.x) < 5.5 && a.y < 3.5) {
        goalX = 0.0;
        if (a.y > 2.6 && a.ground) out.downPressed = true;
      } else if (world.tornado) {
        var away = a.x >= world.tornado.x ? 1 : -1;
        goalX = clamp(a.x + away * 4.5, -8.5, 8.5);
        if (Math.abs(a.x - world.tornado.x) < 2.8 && a.ground) urgentJump = true;
      }
    } else if (d === 'coconuts') {
      // Jump over oncoming coconuts or hop onto crates!
      var closest = null, bestDist = 4.2;
      for (var ci = 0; ci < world.coconuts.length; ci++) {
        var c = world.coconuts[ci];
        if (c.warnT > 0.25) continue;
        var approaching = (c.vx > 0 && c.x < a.x + 0.5) || (c.vx < 0 && c.x > a.x - 0.5);
        var dist = Math.abs(c.x - a.x);
        if (approaching && Math.abs(c.y - (a.y + 0.8)) < 1.6 && dist < bestDist) {
          bestDist = dist; closest = c;
        }
      }
      if (closest && bestDist < 2.6 && a.ground) {
        urgentJump = true;
        goalX = a.x - Math.sign(closest.vx || 1) * 1.5;
      } else if (a.y < 2.8) {
        goalX = a.x < 0 ? -2.6 : 2.75;
        if (a.ground && Math.abs(goalX - a.x) < 1.4) urgentJump = true;
      }
    } else {
      // Meteor, Lightning, Quake: step away from active telegraphs!
      var danger = 0;
      for (var mi = 0; mi < world.meteors.length; mi++) {
        var m = world.meteors[mi];
        if (!m.hit && Math.abs(a.x - m.tx) < 2.1 && Math.abs(a.y - m.ty) < 2.0) {
          danger += Math.sign(a.x - m.tx || (a.x > 0 ? -1 : 1));
        }
      }
      for (var bi = 0; bi < world.bolts.length; bi++) {
        var b = world.bolts[bi];
        if (!b.struck && !inShelter(a) && Math.abs(a.x - b.x) < 2.0) {
          danger += Math.sign(a.x - b.x || (a.x > 0 ? -1 : 1));
        }
      }
      for (var qi = 0; qi < world.cracks.length; qi++) {
        var q = world.cracks[qi];
        if (Math.abs(a.x - q.x) < q.w * 0.65 && Math.abs(a.y - q.y) < 1.5) {
          danger += Math.sign(a.x - q.x || (a.x > 0 ? -1 : 1));
          if (a.ground && q.t > q.telegraph * 0.6) urgentJump = true;
        }
      }
      if (d === 'lightning' && danger === 0 && Math.abs(a.x) < 4.0) {
        goalX = 0.0;
        if (a.y > 2.6 && a.ground) out.downPressed = true;
      } else if (danger !== 0) {
        goalX = clamp(a.x + Math.sign(danger) * 3.8, -8.8, 8.8);
      } else {
        // Chase nearest untaken coin gently
        var nearC = null, cd = 5.5;
        for (var k = 0; k < world.coins.length; k++) {
          var coin = world.coins[k];
          if (!coin.taken && Math.abs(coin.x - a.x) < cd && Math.abs(coin.y - a.y) < 2.6) {
            cd = Math.abs(coin.x - a.x); nearC = coin;
          }
        }
        if (nearC) {
          goalX = nearC.x;
          if (nearC.y > a.y + 0.9 && a.ground && Math.abs(nearC.x - a.x) < 1.8) urgentJump = true;
        } else {
          goalX = clamp(a.x + Math.sin(world.t * 1.4 + a.slot * 2.1) * 1.6, -8.5, 8.5);
        }
      }
    }

    // Keep away from island cliffs
    if (a.x < -8.6) goalX = Math.max(goalX, -6.5);
    if (a.x > 8.6) goalX = Math.min(goalX, 6.5);

    var diff = goalX - a.x;
    if (Math.abs(diff) > 0.25) out.moveX = Math.sign(diff) * (skill < 0.9 ? (0.72 + 0.28 * skill) : 1);
    if (urgentJump && (skill >= 0.95 || world.rng() < skill)) {
      out.jumpPressed = true;
      out.jumpDown = true;
    }
    if (wantHigh && a.y < 3.0 && a.ground && Math.abs(a.vx) > 2.0 && (Math.abs(a.x + 8.0) < 1.2 || Math.abs(a.x + 2.6) < 1.2 || Math.abs(a.x - 5.0) < 1.2)) {
      out.jumpPressed = true;
      out.jumpDown = true;
    }
    return out;
  }

  /* ---------------------------------------------------------- match evaluation */
  function buildResult(world) {
    var p1 = world.actors[0];
    var p2 = world.duo ? world.actors[1] : null;
    var bestSurvived = p2 ? Math.max(p1.survived, p2.survived) : p1.survived;
    var totalCoins = p2 ? (p1.coins + p2.coins) : p1.coins;
    var totalScore = p2 ? Math.max(p1.score, p2.score) : p1.score;

    var stars = 0;
    var won = false;
    var bonusCoins = 0;

    if (world.endless) {
      won = world.humanMoved && bestSurvived >= 1;
      stars = !world.humanMoved ? 0 : (bestSurvived >= 8 ? 3 : bestSurvived >= 4 ? 2 : bestSurvived >= 1 ? 1 : 0);
      bonusCoins = world.humanMoved ? bestSurvived * 8 : 0;
    } else {
      // Strict anti-AFK rule: never award stars or win if the player never moved!
      if (world.humanMoved) {
        if (bestSurvived >= MATCH_ROUNDS) stars = 3;
        else if (bestSurvived >= 3) stars = 2;
        else if (bestSurvived >= 1) stars = 1;
        won = stars >= 1;
        bonusCoins = bestSurvived * 10 + stars * 10;
      }
    }

    var earnedCoins = world.humanMoved ? (totalCoins + bonusCoins) : 0;
    var ddaOutcome = !world.humanMoved ? 0 :
      (world.endless ? clamp(bestSurvived / 6, 0, 1) : clamp(p1.survived / MATCH_ROUNDS, 0, 1));

    var winner = null;
    if (world.duo && p2) {
      if (p1.survived > p2.survived || (p1.survived === p2.survived && p1.score > p2.score)) winner = 'p1';
      else if (p2.survived > p1.survived || (p2.survived === p1.survived && p2.score > p1.score)) winner = 'p2';
      else winner = 'tie';
    }

    return {
      won: won,
      stars: stars,
      roundsSurvived: bestSurvived,
      p1Survived: p1.survived,
      p2Survived: p2 ? p2.survived : 0,
      score: world.humanMoved ? totalScore : 0,
      coins: earnedCoins,
      humanMoved: world.humanMoved,
      ddaOutcome: ddaOutcome,
      endless: world.endless,
      duo: world.duo,
      winner: winner
    };
  }

  /* ---------------------------------------------------------- main step */
  function step(world, dt, inputs) {
    world.events.length = 0;
    if (world.finished) return world.events;
    dt = clamp(dt || 1 / 60, 0, 0.05);
    world.frames++;
    world.t += dt;
    if (world.drumBounceT > 0) world.drumBounceT = Math.max(0, world.drumBounceT - dt);

    var params = difficultyParams(world.tier, world.level, world.round);

    // Step actors (human inputs or AI)
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      var inp;
      if (a.isHuman) {
        inp = (inputs && inputs[a.humanIndex]) || { moveX: 0, jumpPressed: false, jumpDown: false, downPressed: false };
      } else {
        inp = planActorAI(world, a, params.botSkill);
      }
      stepActor(world, a, dt, inp);
    }
    resolveBumps(world);

    if (world.demo) {
      world.lavaY = -1.65;
      return world.events;
    }

    if (world.phase === 'card') {
      world.lavaY = lerp(world.lavaY, -1.65, Math.min(1, dt * 6));
      if (world.t >= CARD_TIME) {
        world.phase = 'active';
        world.t = 0;
        world.spawnAcc = 0.12;
        world.subAcc = 1.6;
        world.events.push({ type: 'disasterStart', disaster: world.disaster, round: world.round });
      }
      return world.events;
    }

    if (world.phase === 'active') {
      stepDisaster(world, dt, params);
      updateHazards(world, dt);

      // Check if all human players are eliminated in this round
      var anyHumanAlive = false;
      for (var h = 0; h < world.actors.length; h++) {
        if (world.actors[h].isHuman && world.actors[h].alive) anyHumanAlive = true;
      }

      // In endless, if all humans KO, end immediately!
      if (world.endless && !anyHumanAlive) {
        clearHazards(world);
        world.phase = 'over';
        world.finished = true;
        world.result = buildResult(world);
        world.events.push({ type: 'matchEnd', result: world.result });
        return world.events;
      }

      // In match mode, if all humans KO early, shorten remaining wait so kids aren't bored!
      var earlyEnd = !world.endless && !anyHumanAlive && world.t > 2.2;
      if (world.t >= ROUND_TIME || earlyEnd) {
        clearHazards(world);
        // Award survival points to every alive actor!
        for (var s = 0; s < world.actors.length; s++) {
          var sa = world.actors[s];
          if (sa.alive) {
            sa.survived += 1;
            var perfect = sa.hearts === MAX_HEARTS ? 25 : 0;
            sa.score += 100 + perfect;
            sa.coins += 5;
          }
        }
        world.phase = 'clear';
        world.t = 0;
        world.events.push({
          type: 'roundClear',
          round: world.round,
          p1Alive: world.actors[0].alive,
          p2Alive: world.duo ? world.actors[1].alive : false
        });
      }
      return world.events;
    }

    if (world.phase === 'clear') {
      world.lavaY = lerp(world.lavaY, -1.65, Math.min(1, dt * 7));
      if (world.t >= CLEAR_TIME) {
        if (!world.endless && world.round + 1 >= MATCH_ROUNDS) {
          world.phase = 'over';
          world.finished = true;
          world.result = buildResult(world);
          world.events.push({ type: 'matchEnd', result: world.result });
          return world.events;
        }
        world.round += 1;
        world.disaster = nextDisasterId(world);
        world.phase = 'card';
        world.t = 0;
        resetActorsForNextRound(world);
        spawnRoundCoins(world);
        world.events.push({ type: 'disasterCard', disaster: world.disaster, round: world.round });
      }
    }

    return world.events;
  }

  return {
    SAVE_VERSION: SAVE_VERSION,
    MATCH_ROUNDS: MATCH_ROUNDS,
    CARD_TIME: CARD_TIME,
    ROUND_TIME: ROUND_TIME,
    CLEAR_TIME: CLEAR_TIME,
    MAX_HEARTS: MAX_HEARTS,
    GROUND_Y: GROUND_Y,
    ISLAND_MIN_X: ISLAND_MIN_X,
    ISLAND_MAX_X: ISLAND_MAX_X,
    PLATFORMS: PLATFORMS,
    SHELTER: SHELTER,
    DRUM: DRUM,
    DISASTERS: DISASTERS,
    DISASTER_MAP: DISASTER_MAP,
    COLORS: COLORS,
    HATS: HATS,
    defaultSave: defaultSave,
    loadSave: loadSave,
    buyOrEquip: buyOrEquip,
    difficultyParams: difficultyParams,
    inShelter: inShelter,
    create: create,
    step: step,
    planCoach: planActorAI
  };
});

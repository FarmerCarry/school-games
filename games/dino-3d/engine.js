/* Dino 3D (الديناصور ثلاثي الأبعاد) — Pure deterministic gameplay engine.
 * Runs in both browser and Node unit tests (no DOM, no Three.js, no Kit calls).
 * Five vibrant worlds (15 journey levels) + Endless Run with optional 4-digit seed. */
(function (root) {
  'use strict';

  var SAVE_VERSION = 3;
  var MAX_HEARTS = 3;
  var LEVEL_COUNT = 15;

  // Physics tuned for snappy, forgiving kid-friendly platforming (ages 5-11).
  var GRAVITY = 34.0;
  var GRAVITY_HOLD = 21.5;
  var GRAVITY_FAST = 58.0;
  var JUMP_VELOCITY = 13.6;
  var JUMP_HOLD_MAX = 0.22;
  var JUMP_CUT_MULT = 0.74;
  var BOUNCE_VELOCITY = 17.6;
  var COYOTE_TIME = 0.13;
  var JUMP_BUFFER = 0.15;
  var STAND_HEIGHT = 1.42;
  var DUCK_HEIGHT = 0.62;
  var PLAYER_HALF_W = 0.34;
  var HURT_INVULN = 1.35;
  var ROAR_DURATION = 0.56;
  var ROAR_RANGE = 4.5;
  var ROAR_RECHARGE_RATE = 0.17; // full in ~5.9s passively, much faster with eggs
  var ROAR_SPEED_MULT = 1.24;
  var ENDLESS_WORLD_SPAN = 185;

  var WORLDS = [
    { id: 0, key: 'desert',  name: 'الصحراء الذهبية', baseSpeed: 9.2,  hue: 0xf4b942 },
    { id: 1, key: 'jungle',  name: 'الغابة الخضراء',  baseSpeed: 10.2, hue: 0x45c466 },
    { id: 2, key: 'snow',    name: 'جبال الثلج',      baseSpeed: 11.1, hue: 0x69c6ff },
    { id: 3, key: 'volcano', name: 'وادي البراكين',   baseSpeed: 12.0, hue: 0xff6b3d },
    { id: 4, key: 'nest',    name: 'العش الملكي',     baseSpeed: 12.8, hue: 0xff7ad9 }
  ];

  var COLORS = [
    { id: 'emerald', name: 'أخضر الغابة',    hex: 0x45d167, belly: 0xfff3c4, crest: 0xff9f38, cost: 0 },
    { id: 'sky',     name: 'أزرق السماء',    hex: 0x38b6ff, belly: 0xe8fbff, crest: 0xffd13b, cost: 25 },
    { id: 'berry',   name: 'وردي التوت',     hex: 0xff6ba9, belly: 0xfff0f7, crest: 0xffe047, cost: 60 },
    { id: 'gold',    name: 'ذهبي الشمس',     hex: 0xffbe2e, belly: 0xfff9db, crest: 0xff5e3a, cost: 100 },
    { id: 'violet',  name: 'بنفسجي النجوم',  hex: 0x9b6bff, belly: 0xf3ebff, crest: 0x4df0d6, cost: 150 },
    { id: 'coral',   name: 'مرجان البركان',  hex: 0xff5f45, belly: 0xffebd6, crest: 0xffdf3d, cost: 220 }
  ];

  var HATS = [
    { id: 'none',      name: 'بلا قبعة',        cost: 0 },
    { id: 'leaf',      name: 'ورقة الشجر',      cost: 20 },
    { id: 'explorer',  name: 'قبعة المستكشف',   cost: 50 },
    { id: 'party',     name: 'قبعة الحفلة',     cost: 90 },
    { id: 'astronaut', name: 'خوذة الفضاء',     cost: 140 },
    { id: 'crown',     name: 'التاج الملكي',    cost: 200 }
  ];

  // 15 journey stages: 5 worlds x 3 curated, escalating runs.
  var LEVELS = [];
  (function buildLevelDefs() {
    var lengths = [
      225, 260, 295, // World 0: Golden Desert
      280, 315, 350, // World 1: Lush Jungle
      310, 345, 380, // World 2: Snowy Peaks
      335, 370, 405, // World 3: Volcano Valley
      360, 400, 440  // World 4: Royal Nest Finale
    ];
    var kindsByLevel = [
      ['low', 'crate', 'pad'],
      ['low', 'crate', 'arch', 'pad'],
      ['low', 'tall', 'crate', 'arch', 'pad'],
      ['low', 'crate', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'crate', 'boulder', 'flyer', 'pad'],
      ['low', 'tall', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'crate', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'crate', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'crate', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'crate', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'crate', 'boulder', 'arch', 'flyer', 'pad'],
      ['low', 'tall', 'crate', 'boulder', 'arch', 'flyer', 'pad']
    ];
    for (var i = 0; i < LEVEL_COUNT; i++) {
      var w = Math.floor(i / 3);
      var stage = i % 3;
      LEVELS.push({
        index: i,
        id: 'w' + (w + 1) + '-' + (stage + 1),
        world: w,
        stage: stage,
        length: lengths[i],
        speed: WORLDS[w].baseSpeed + stage * 0.55,
        kinds: kindsByLevel[i],
        seed: (w + 1) * 7919 + (stage + 1) * 104729
      });
    }
  })();

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Deterministic PRNG (Mulberry32) so levels & 4-digit codes reproduce identically.
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function parseCode(str) {
    var clean = String(str || '').trim();
    return /^\d{4}$/.test(clean) ? clean : '';
  }

  function seedFromCode(code) {
    var n = parseInt(code, 10);
    return ((n * 2654435761) ^ 0x5f3759df) >>> 0 || 1337;
  }

  // DDA tier tuning (pure function: game.js passes level 0..1 / tier 1..5).
  function tuningFor(ddaLevel, tier) {
    var l = clamp(typeof ddaLevel === 'number' && isFinite(ddaLevel) ? ddaLevel : 0.35, 0, 1);
    var t = clamp((tier | 0) || (1 + Math.floor(l * 5 * 0.9999)), 1, 5);
    return {
      level: l,
      tier: t,
      speedMul: 0.88 + l * 0.24,      // 0.88x (very gentle) .. 1.12x (brisk)
      gapTime: 1.38 - l * 0.44,       // 1.38s .. 0.94s reaction breathing room
      flyerSpeed: 2.1 + l * 1.4,      // swooping speed
      roarGain: 1.18 - l * 0.28       // faster roar recharge for younger kids
    };
  }

  /* ------------------------------------------------------------ save schema */
  function freshSave() {
    var stars = [], best = [];
    for (var i = 0; i < LEVEL_COUNT; i++) { stars.push(0); best.push(0); }
    return {
      v: SAVE_VERSION,
      stars: stars,
      best: best,
      bank: 0,
      far: 0,
      color: 0,
      hat: 0,
      seenBank: 0,
      coached: false
    };
  }

  function loadSave(raw) {
    var base = freshSave();
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return base;
    if (Array.isArray(raw.stars)) {
      for (var i = 0; i < LEVEL_COUNT; i++) {
        base.stars[i] = clamp(raw.stars[i] | 0, 0, 3);
      }
    }
    if (Array.isArray(raw.best)) {
      for (var j = 0; j < LEVEL_COUNT; j++) {
        base.best[j] = Math.max(0, raw.best[j] | 0);
      }
    }
    base.bank = Math.max(0, raw.bank | 0);
    base.far = Math.max(0, raw.far | 0);
    base.seenBank = Math.max(0, Math.min(base.bank, raw.seenBank | 0));
    base.coached = !!raw.coached;
    var c = clamp(raw.color | 0, 0, COLORS.length - 1);
    var h = clamp(raw.hat | 0, 0, HATS.length - 1);
    base.color = base.bank >= COLORS[c].cost ? c : 0;
    base.hat = base.bank >= HATS[h].cost ? h : 0;
    return base;
  }

  function totalStars(save) {
    var sum = 0;
    for (var i = 0; i < LEVEL_COUNT; i++) sum += (save.stars[i] | 0);
    return sum;
  }

  function isLevelOpen(save, idx) {
    if (idx <= 0) return true;
    if (idx >= LEVEL_COUNT) return false;
    return (save.stars[idx - 1] | 0) > 0;
  }

  function isWorldOpen(save, worldIdx) {
    return isLevelOpen(save, worldIdx * 3);
  }

  function nextLevel(save) {
    for (var i = 0; i < LEVEL_COUNT; i++) {
      if (isLevelOpen(save, i) && !(save.stars[i] | 0)) return i;
    }
    return 0;
  }

  function unlockedBetween(prevBank, nextBank) {
    var list = [];
    for (var i = 0; i < COLORS.length; i++) {
      if (COLORS[i].cost > prevBank && COLORS[i].cost <= nextBank) {
        list.push({ kind: 'color', index: i, name: COLORS[i].name });
      }
    }
    for (var j = 0; j < HATS.length; j++) {
      if (HATS[j].cost > prevBank && HATS[j].cost <= nextBank) {
        list.push({ kind: 'hat', index: j, name: HATS[j].name });
      }
    }
    return list;
  }

  function computeStars(eggs, totalEggs, bumps, won) {
    if (!won) return 0;
    var ratio = totalEggs > 0 ? eggs / totalEggs : 1;
    if (ratio >= 0.72 && bumps <= 1) return 3;
    if (ratio >= 0.45 || bumps === 0) return 2;
    return 1;
  }

  /* --------------------------------------------------- obstacle & item gen */
  function obstacleSpec(kind) {
    switch (kind) {
      case 'low':
        return { kind: 'low', w: 0.85, y0: 0, y1: 1.02, smashable: true, bonus: 2, action: 'jump' };
      case 'tall':
        return { kind: 'tall', w: 0.92, y0: 0, y1: 1.78, smashable: true, bonus: 3, action: 'jump' };
      case 'crate':
        return { kind: 'crate', w: 1.15, y0: 0, y1: 1.22, smashable: true, bonus: 5, crate: true, action: 'roar' };
      case 'boulder':
        return { kind: 'boulder', w: 1.32, y0: 0, y1: 1.42, smashable: true, bonus: 5, crate: true, action: 'roar' };
      case 'arch':
        return { kind: 'arch', w: 2.15, y0: 0.88, y1: 2.75, smashable: true, bonus: 3, action: 'duck' };
      case 'flyer':
        return { kind: 'flyer', w: 1.25, y0: 0.92, y1: 1.78, smashable: true, bonus: 3, mobile: true, action: 'duck' };
      case 'pad':
        return { kind: 'pad', w: 1.45, y0: 0, y1: 0.52, smashable: false, bonus: 0, bounce: true, action: 'bounce' };
      default:
        return { kind: 'low', w: 0.85, y0: 0, y1: 1.02, smashable: true, bonus: 2, action: 'jump' };
    }
  }

  function addItem(world, kind, x, y, val, chainIdx) {
    world.items.push({
      id: ++world.nextId,
      kind: kind,
      x: x,
      y: y,
      val: val || 1,
      chain: chainIdx || 0,
      got: false
    });
    if (kind === 'egg' || kind === 'gold' || kind === 'rainbow') {
      world.totalEggs += (val || 1);
    }
  }

  function addEggArc(world, cx, span, peakY, count, kind, val) {
    for (var i = 0; i < count; i++) {
      var u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      var x = cx + u * (span * 0.5);
      var y = 0.72 + (1 - u * u) * (peakY - 0.72);
      addItem(world, kind || 'egg', x, y, val || 1, kind === 'rainbow' ? i + 1 : 0);
    }
  }

  function addLowLine(world, x0, count, spacing, y, kind, val) {
    for (var i = 0; i < count; i++) {
      addItem(world, kind || 'egg', x0 + i * spacing, y, val || 1, kind === 'rainbow' ? i + 1 : 0);
    }
  }

  // Spawn one well-telegraphed encounter starting at `x`, returning the next cursor `x`.
  function spawnEncounter(world, x, kind, rng, speed, gapTime, allowHeart) {
    if (kind === 'flyer') x += 4.2;
    var spec = obstacleSpec(kind);
    var ob = {
      id: ++world.nextId,
      kind: spec.kind,
      x: x,
      baseX: x,
      w: spec.w,
      y0: spec.y0,
      y1: spec.y1,
      smashable: spec.smashable,
      crate: !!spec.crate,
      bounce: !!spec.bounce,
      mobile: !!spec.mobile,
      bonus: spec.bonus,
      action: spec.action,
      variant: Math.floor(rng() * 3),
      smashed: false,
      cleared: false,
      cued: false,
      hit: false,
      flyT: rng() * 6.28
    };
    world.obs.push(ob);

    // Pair every obstacle with playful collectibles that telegraph the fun line!
    if (kind === 'pad') {
      // Bouncy mushroom -> tall scenic hazard 4.2m ahead -> soaring rainbow egg arc!
      var followX = x + Math.max(4.4, speed * 0.42);
      var tallSpec = obstacleSpec('tall');
      world.obs.push({
        id: ++world.nextId,
        kind: 'tall',
        x: followX,
        baseX: followX,
        w: tallSpec.w,
        y0: tallSpec.y0,
        y1: tallSpec.y1,
        smashable: true,
        crate: false,
        bounce: false,
        mobile: false,
        bonus: 3,
        action: 'jump',
        variant: Math.floor(rng() * 3),
        smashed: false,
        cleared: false,
        cued: false,
        hit: false,
        flyT: 0
      });
      var arcSpan = Math.max(7.2, speed * 0.72);
      var arcCx = x + arcSpan * 0.56;
      for (var ri = 0; ri < 5; ri++) {
        var ru = (ri / 4) * 2 - 1;
        var rx = arcCx + ru * (arcSpan * 0.5);
        var ry = 1.2 + (1 - ru * ru) * (4.15 - 1.2);
        if (ri === 2) addItem(world, 'gold', rx, ry + 0.12, 3, 0);
        else addItem(world, 'rainbow', rx, ry, 2, ri + 1);
      }
      return followX + Math.max(9.8, speed * (gapTime + 0.16));
    }

    if (kind === 'low') {
      addEggArc(world, x, Math.max(4.4, speed * 0.42), 2.35, 3, 'egg', 1);
    } else if (kind === 'tall') {
      addEggArc(world, x, Math.max(5.4, speed * 0.52), 3.15, 5, rng() < 0.35 ? 'rainbow' : 'egg', rng() < 0.35 ? 2 : 1);
      if (rng() < 0.5) addItem(world, 'gold', x, 3.45, 3, 0);
    } else if (kind === 'crate' || kind === 'boulder') {
      // Ground eggs leading right into the smashable target + arc over top!
      addLowLine(world, x - 3.0, 2, 1.15, 0.68, 'egg', 1);
      addItem(world, 'gold', x, 2.55, 3, 0);
    } else if (kind === 'arch') {
      // Low sparkling slide trail directly beneath the arch.
      addLowLine(world, x - 1.2, 4, 0.85, 0.45, rng() < 0.35 ? 'rainbow' : 'egg', rng() < 0.35 ? 2 : 1);
    } else if (kind === 'flyer') {
      // Low slide trail beneath the pterosaur's arrival spot.
      addLowLine(world, x - 1.4, 3, 1.0, 0.46, 'egg', 1);
      if (rng() < 0.4) addItem(world, 'gold', x, 2.75, 3, 0);
    }

    // Occasional recovery heart berry on a safe stretch between hazards.
    var gap = Math.max(8.8, speed * (gapTime + (rng() * 0.38 - 0.1)));
    if (allowHeart && rng() < 0.14) {
      addItem(world, 'heart', x + gap * 0.52, 1.25, 1, 0);
    } else if (rng() < 0.32) {
      addLowLine(world, x + gap * 0.36, 3, 1.05, 0.68, 'egg', 1);
    }
    return x + gap;
  }

  function fillEndless(world, upToX) {
    var rng = world.rng;
    while (world.genX < upToX) {
      var wIdx = worldAtDistance(world, world.genX);
      var distSpeed = Math.min(17.4, (WORLDS[0].baseSpeed + world.genX * 0.0068) * world.tune.speedMul);
      var distGap = Math.max(0.84, world.tune.gapTime - Math.min(0.28, world.genX * 0.00024));
      var pool = wIdx === 0
        ? ['low', 'low', 'crate', 'pad', 'arch']
        : ['low', 'tall', 'crate', 'boulder', 'arch', 'flyer', 'pad'];
      var kind = pool[Math.floor(rng() * pool.length)];
      if (kind === world.lastKind && rng() < 0.65) {
        kind = pool[(pool.indexOf(kind) + 1) % pool.length];
      }
      world.lastKind = kind;
      world.genX = spawnEncounter(world, world.genX, kind, rng, distSpeed, distGap, true);
    }
  }

  function worldAtDistance(world, x) {
    if (!world.endless) return world.worldIndex;
    return Math.floor(Math.max(0, x) / ENDLESS_WORLD_SPAN) % WORLDS.length;
  }

  function createWorld(opts) {
    opts = opts || {};
    var endless = !!opts.endless;
    var levelIndex = clamp(opts.level | 0, 0, LEVEL_COUNT - 1);
    var def = LEVELS[levelIndex];
    var tune = tuningFor(opts.ddaLevel, opts.tier);
    var code = endless ? parseCode(opts.code) : '';
    var seed = endless
      ? (code ? seedFromCode(code) : ((opts.seed >>> 0) || (Date.now() & 0xffffffff) || 42))
      : def.seed;
    var rng = makeRng(seed);

    var baseSpeed = (endless ? WORLDS[0].baseSpeed : def.speed) * tune.speedMul;
    var world = {
      id: endless ? 'endless' : def.id,
      level: levelIndex,
      worldIndex: endless ? 0 : def.world,
      stage: endless ? 0 : def.stage,
      endless: endless,
      code: code,
      seed: seed,
      tier: tune.tier,
      tune: tune,
      rng: rng,
      length: endless ? Infinity : def.length,
      baseSpeed: baseSpeed,
      speed: baseSpeed,
      x: 0,
      t: 0,
      eggs: 0,
      totalEggs: 0,
      score: 0,
      streak: 0,
      streakTimer: 0,
      bumps: 0,
      smashed: 0,
      cleared: 0,
      done: false,
      over: false,
      obs: [],
      items: [],
      oi: 0,
      ii: 0,
      ev: [],
      nextId: 0,
      genX: 0,
      lastKind: '',
      p: {
        y: 0,
        vy: 0,
        ground: true,
        duck: false,
        coyote: COYOTE_TIME,
        buffer: 0,
        holdT: 0,
        holdingJump: false,
        superBounce: false,
        hp: MAX_HEARTS,
        invuln: 0,
        roar: 1.0, // start charged so kids can experience the joyful Roar right away!
        roarT: 0,
        squash: 0,
        stride: 0
      }
    };

    // Welcome egg line on the opening stretch (teaches moving & collecting immediately).
    addLowLine(world, 8.5, 4, 1.35, 0.7, 'egg', 1);

    if (endless) {
      world.genX = 22;
      fillEndless(world, 110);
    } else {
      // Curated opening rhythm for Level 1-1: gentle small cactus, crate to roar/hop, bouncy mushroom!
      var cursor = 22;
      if (levelIndex === 0) {
        cursor = spawnEncounter(world, cursor, 'low', rng, baseSpeed, tune.gapTime + 0.15, false);
        cursor = spawnEncounter(world, cursor, 'crate', rng, baseSpeed, tune.gapTime + 0.1, false);
        cursor = spawnEncounter(world, cursor, 'pad', rng, baseSpeed, tune.gapTime + 0.1, false);
      } else if (levelIndex === 1) {
        cursor = spawnEncounter(world, cursor, 'low', rng, baseSpeed, tune.gapTime + 0.1, false);
        cursor = spawnEncounter(world, cursor, 'arch', rng, baseSpeed, tune.gapTime + 0.1, false);
      }
      var endSafe = def.length - 16;
      var kinds = def.kinds;
      while (cursor < endSafe) {
        var k = kinds[Math.floor(rng() * kinds.length)];
        if (k === world.lastKind && rng() < 0.7) {
          k = kinds[(kinds.indexOf(k) + 1) % kinds.length];
        }
        world.lastKind = k;
        cursor = spawnEncounter(world, cursor, k, rng, baseSpeed, tune.gapTime, true);
      }
      // Victory rainbow lead-in right before the family nest!
      addEggArc(world, def.length - 8.5, 6.2, 1.9, 5, 'rainbow', 2);
    }

    return world;
  }

  function progress(world) {
    if (!world || world.endless || !isFinite(world.length) || world.length <= 0) return 0;
    return clamp(world.x / world.length, 0, 1);
  }

  function emit(world, type, data) {
    var ev = { t: type };
    if (data) {
      for (var k in data) ev[k] = data[k];
    }
    world.ev.push(ev);
  }

  /* -------------------------------------------------------------- step sim */
  function step(world, dt, input) {
    if (!world || world.done || world.over) return world;
    dt = clamp(dt, 0, 0.05);
    input = input || {};
    var p = world.p;
    world.t += dt;

    // Speed progression (gentle ramp in endless, steady + roar surge in journey).
    var targetSpeed = world.endless
      ? Math.min(17.8, (WORLDS[0].baseSpeed + world.x * 0.0068) * world.tune.speedMul)
      : world.baseSpeed;
    if (p.roarT > 0) targetSpeed *= ROAR_SPEED_MULT;
    world.speed += (targetSpeed - world.speed) * Math.min(1, dt * 8);

    // Timers.
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (world.streakTimer > 0) {
      world.streakTimer -= dt;
      if (world.streakTimer <= 0) world.streak = 0;
    }

    // Roar activation & recharge.
    if (p.roarT > 0) {
      p.roarT = Math.max(0, p.roarT - dt);
    } else {
      var prevRoar = p.roar;
      p.roar = Math.min(1, p.roar + ROAR_RECHARGE_RATE * world.tune.roarGain * dt);
      if (prevRoar < 1 && p.roar >= 1) emit(world, 'roarReady', { x: world.x });
    }
    if (input.roarPressed && p.roar >= 0.999 && p.roarT <= 0) {
      p.roar = 0;
      p.roarT = ROAR_DURATION;
      p.duck = false;
      emit(world, 'roar', { x: world.x, y: p.y });
    }

    // Jump buffering & coyote time.
    if (input.jumpPressed) p.buffer = JUMP_BUFFER;
    else if (p.buffer > 0) p.buffer = Math.max(0, p.buffer - dt);

    if (p.ground) p.coyote = COYOTE_TIME;
    else if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);

    // Execute jump if buffered and within coyote window.
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = JUMP_VELOCITY;
      p.ground = false;
      p.duck = false;
      p.coyote = 0;
      p.buffer = 0;
      p.holdT = 0;
      p.holdingJump = !!input.jump;
      p.superBounce = false;
      p.squash = 1; // stretch upward
      emit(world, 'jump', { x: world.x, y: p.y });
    }

    // Variable jump height: release early trims upward velocity.
    if (!p.ground && p.vy > 0) {
      if (input.jump && p.holdingJump && p.holdT < JUMP_HOLD_MAX && !p.superBounce) {
        p.holdT += dt;
      } else if (p.holdingJump && !input.jump && !p.superBounce) {
        p.holdingJump = false;
        p.vy *= JUMP_CUT_MULT;
      }
    }

    // Duck / slide on ground, fast-fall in air.
    var wantDuck = !!input.duck;
    if (p.ground) {
      p.duck = wantDuck;
    } else {
      p.duck = false;
      if (wantDuck && p.vy > -18.5) {
        p.vy = Math.min(p.vy - 48 * dt, -11.5);
      }
    }

    // Integrate vertical motion.
    var prevY = p.y;
    if (!p.ground) {
      var g = wantDuck ? GRAVITY_FAST : (p.vy > 0 && p.holdingJump && p.holdT < JUMP_HOLD_MAX ? GRAVITY_HOLD : GRAVITY);
      p.vy -= g * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        var impact = clamp(-p.vy / 20, 0.2, 1);
        p.vy = 0;
        p.ground = true;
        p.superBounce = false;
        p.holdingJump = false;
        p.squash = -impact; // land squash
        emit(world, 'land', { x: world.x, power: impact });
      }
    }

    // Advance along the track.
    var prevWorld = worldAtDistance(world, world.x);
    world.x += world.speed * dt;
    if (p.ground) p.stride += world.speed * dt * 1.45;
    if (world.endless) {
      var nextWorld = worldAtDistance(world, world.x);
      world.worldIndex = nextWorld;
      if (nextWorld !== prevWorld) {
        emit(world, 'worldChange', { world: nextWorld, name: WORLDS[nextWorld].name });
      }
      if (world.genX < world.x + 100) fillEndless(world, world.x + 150);
    }

    // Keep sliding pointers tidy.
    while (world.oi < world.obs.length && world.obs[world.oi].x < world.x - 16) world.oi++;
    while (world.ii < world.items.length && world.items[world.ii].x < world.x - 12) world.ii++;

    // Player AABB.
    var px0 = world.x - PLAYER_HALF_W;
    var px1 = world.x + PLAYER_HALF_W;
    var py0 = p.y;
    var py1 = p.y + (p.duck ? DUCK_HEIGHT : STAND_HEIGHT);

    // Update & check obstacles.
    for (var i = world.oi; i < world.obs.length; i++) {
      var ob = world.obs[i];
      if (ob.x > world.x + 42) break;
      if (ob.smashed) continue;

      // Mobile pterosaur swoops toward dino once approaching.
      if (ob.mobile && ob.x < world.x + 16 && ob.x > world.x - 10) {
        ob.x -= world.tune.flyerSpeed * dt;
        ob.flyT += dt * 7.2;
      }

      // Telegraph cue when approaching reaction range.
      if (!ob.cued && !ob.bounce && ob.x - world.x <= Math.max(9.5, world.speed * 0.92) && ob.x > world.x + 1.5) {
        ob.cued = true;
        emit(world, 'cue', { id: ob.id, kind: ob.kind, action: ob.action, x: ob.x });
      }

      // Roar sonic wave smashes obstacles ahead!
      if (p.roarT > 0 && ob.smashable && ob.x >= world.x - 0.5 && ob.x <= world.x + ROAR_RANGE) {
        ob.smashed = true;
        ob.cleared = true;
        world.smashed++;
        world.cleared++;
        world.eggs += ob.bonus;
        world.score += ob.bonus * 25;
        emit(world, 'smash', { id: ob.id, kind: ob.kind, x: ob.x, y: (ob.y0 + ob.y1) * 0.5, bonus: ob.bonus });
        continue;
      }

      // Collision check.
      var ox0 = ob.x - ob.w * 0.5;
      var ox1 = ob.x + ob.w * 0.5;
      var overlapX = px1 > ox0 && px0 < ox1;
      var overlapY = py1 > ob.y0 && py0 < ob.y1;

      if (ob.bounce) {
        // Forgiving bounce pad contact (triggers on touch or landing on top).
        if (px1 > ox0 - 0.25 && px0 < ox1 + 0.25 && py0 <= ob.y1 + 0.35 && prevY >= -0.05 && p.vy <= 4) {
          ob.cleared = true;
          p.y = ob.y1 + 0.05;
          p.vy = BOUNCE_VELOCITY;
          p.ground = false;
          p.duck = false;
          p.superBounce = true;
          p.holdingJump = false;
          p.squash = 1.25;
          world.score += 30;
          emit(world, 'bounce', { id: ob.id, x: ob.x, y: ob.y1 });
        }
        continue;
      }

      if (overlapX && overlapY && !ob.hit) {
        ob.hit = true;
        if (p.invuln <= 0 && p.roarT <= 0) {
          p.hp = Math.max(0, p.hp - 1);
          p.invuln = HURT_INVULN;
          world.bumps++;
          world.streak = 0;
          world.streakTimer = 0;
          emit(world, 'bump', { id: ob.id, kind: ob.kind, x: ob.x, y: (ob.y0 + ob.y1) * 0.5, hp: p.hp });
          if (p.hp <= 0) {
            world.over = true;
            emit(world, 'over', { x: world.x, eggs: world.eggs, score: world.score });
            return world;
          }
        }
      } else if (!ob.cleared && !ob.hit && ox1 < px0) {
        ob.cleared = true;
        world.cleared++;
        world.score += 15;
        if (p.roarT <= 0) {
          var prevR = p.roar;
          p.roar = Math.min(1, p.roar + 0.08 * world.tune.roarGain);
          if (prevR < 1 && p.roar >= 1) emit(world, 'roarReady', { x: world.x });
        }
        emit(world, 'clear', { id: ob.id, kind: ob.kind, x: ob.x });
      }
    }

    // Collectibles (generous kid-friendly magnet pickup radius!).
    var cx = world.x;
    var cy = p.y + (p.duck ? 0.35 : 0.72);
    for (var j = world.ii; j < world.items.length; j++) {
      var it = world.items[j];
      if (it.x > world.x + 4) break;
      if (it.got) continue;
      var dx = it.x - cx;
      var dy = it.y - cy;
      if (dx * dx + dy * dy <= 1.25 * 1.25) {
        it.got = true;
        if (it.kind === 'heart') {
          var healed = p.hp < MAX_HEARTS;
          if (healed) p.hp++;
          else { world.eggs += 2; world.score += 40; }
          emit(world, 'heart', { x: it.x, y: it.y, healed: healed, hp: p.hp });
        } else {
          world.eggs += it.val;
          world.streak++;
          world.streakTimer = 2.0;
          var pts = it.kind === 'gold' ? 50 : it.kind === 'rainbow' ? 25 : 10;
          world.score += pts + Math.min(world.streak, 10) * 2;
          if (p.roarT <= 0) {
            var beforeR = p.roar;
            var boost = (it.kind === 'gold' ? 0.24 : it.kind === 'rainbow' ? 0.14 : 0.09) * world.tune.roarGain;
            p.roar = Math.min(1, p.roar + boost);
            if (beforeR < 1 && p.roar >= 1) emit(world, 'roarReady', { x: world.x });
          }
          emit(world, 'egg', { kind: it.kind, val: it.val, x: it.x, y: it.y, streak: world.streak });
        }
      }
    }

    // Endless score ticks smoothly with distance.
    if (world.endless) {
      var distScore = Math.floor(world.x);
      if (distScore > world.score) world.score = distScore;
    }

    // Journey finish line!
    if (!world.endless && world.x >= world.length) {
      world.x = world.length;
      world.done = true;
      var stars = computeStars(world.eggs, world.totalEggs, world.bumps, true);
      emit(world, 'finish', { x: world.x, eggs: world.eggs, score: world.score, stars: stars });
    }

    return world;
  }

  // Deep clone for deterministic bot/unit verification.
  function cloneWorld(w) {
    var c = {};
    for (var k in w) {
      if (k === 'obs' || k === 'items') c[k] = w[k].map(function (o) { return Object.assign({}, o); });
      else if (k === 'p') c[k] = Object.assign({}, w.p);
      else if (k === 'ev') c[k] = [];
      else c[k] = w[k];
    }
    return c;
  }

  root.Dino3D = {
    SAVE_VERSION: SAVE_VERSION,
    MAX_HEARTS: MAX_HEARTS,
    LEVEL_COUNT: LEVEL_COUNT,
    ENDLESS_WORLD_SPAN: ENDLESS_WORLD_SPAN,
    STAND_HEIGHT: STAND_HEIGHT,
    DUCK_HEIGHT: DUCK_HEIGHT,
    WORLDS: WORLDS,
    COLORS: COLORS,
    HATS: HATS,
    LEVELS: LEVELS,
    clamp: clamp,
    makeRng: makeRng,
    parseCode: parseCode,
    tuningFor: tuningFor,
    freshSave: freshSave,
    loadSave: loadSave,
    totalStars: totalStars,
    isLevelOpen: isLevelOpen,
    isWorldOpen: isWorldOpen,
    nextLevel: nextLevel,
    unlockedBetween: unlockedBetween,
    computeStars: computeStars,
    worldAtDistance: worldAtDistance,
    createWorld: createWorld,
    progress: progress,
    step: step,
    clone: cloneWorld
  };
})(typeof window !== 'undefined' ? window : globalThis);

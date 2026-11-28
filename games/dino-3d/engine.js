/* Dino 3D (الديناصور ثلاثي الأبعاد) — Pure deterministic 3-Lane 3D Dino Stampede engine.
 * Runs identically in browser and Node unit tests (zero DOM, zero Three.js, zero Kit calls).
 * 5 vibrant worlds (15 journey levels) + Endless Stampede with optional 4-digit seed,
 * 3 crisp lanes (-1, 0, +1), giant chasing Magma Boulder, and 5s Golden Rampage Roar. */
(function (root) {
  'use strict';

  var SAVE_VERSION = 3;
  var MAX_HEARTS = 3;
  var LEVEL_COUNT = 15;
  var LANE_WIDTH = 2.65;

  // Snappy, forgiving behind-the-back 3-lane runner physics (ages 5-11).
  var GRAVITY = 36.0;
  var GRAVITY_HOLD = 22.0;
  var GRAVITY_FAST = 64.0;
  var JUMP_VELOCITY = 14.0;
  var JUMP_HOLD_MAX = 0.22;
  var JUMP_CUT_MULT = 0.72;
  var BOUNCE_VELOCITY = 18.2;
  var COYOTE_TIME = 0.13;
  var JUMP_BUFFER = 0.16;
  var STAND_HEIGHT = 1.42;
  var DUCK_HEIGHT = 0.62;
  var PLAYER_HALF_Z = 0.36;
  var PLAYER_HALF_X = 0.56;
  var HURT_INVULN = 1.3;
  var RAMPAGE_DURATION = 5.0; // 5s golden invincible Rampage!
  var RAMPAGE_SPEED_MULT = 1.32;
  var BOOST_DURATION = 1.15;
  var BOOST_SPEED_MULT = 1.38;
  var LANE_SNAP_RATE = 24.0; // tunnel-blitz 1-exp(-dt*24) crisp steering
  var ENDLESS_WORLD_SPAN = 220;

  var WORLDS = [
    { id: 0, key: 'desert',  name: 'الصحراء الذهبية', baseSpeed: 13.5, hue: 0xf4b942 },
    { id: 1, key: 'jungle',  name: 'الغابة الخضراء',  baseSpeed: 15.0, hue: 0x45c466 },
    { id: 2, key: 'snow',    name: 'جبال الثلج',      baseSpeed: 16.4, hue: 0x69c6ff },
    { id: 3, key: 'volcano', name: 'وادي البراكين',   baseSpeed: 17.8, hue: 0xff6b3d },
    { id: 4, key: 'nest',    name: 'العش الملكي',     baseSpeed: 19.0, hue: 0xff7ad9 }
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

  // 15 journey stages: 5 worlds x 3 brisk, kinetic 3-lane stampedes (~22–34s each).
  var LEVELS = [];
  (function buildLevelDefs() {
    var lengths = [
      300, 340, 380, // World 0: Golden Desert
      360, 400, 440, // World 1: Lush Jungle
      400, 445, 490, // World 2: Snowy Peaks
      440, 485, 530, // World 3: Volcano Valley
      480, 530, 580  // World 4: Royal Nest Finale
    ];
    // Stage 1-1 has ZERO arches/flyers so every player nails lane-weaving + crates + boosts!
    // Stage 1-2+ introduces arches/flyers ONLY in 1-2 lanes (never mandatory mouse-unfriendly walls).
    var kindsByLevel = [
      ['low', 'crate', 'bones', 'pad', 'boost'],
      ['low', 'crate', 'bones', 'pad', 'boost', 'arch'],
      ['low', 'tall', 'crate', 'bones', 'pad', 'boost', 'arch'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'],
      ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost']
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
        speed: WORLDS[w].baseSpeed + stage * 0.75,
        kinds: kindsByLevel[i],
        seed: (w + 1) * 7919 + (stage + 1) * 104729
      });
    }
  })();

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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

  function tuningFor(ddaLevel, tier) {
    var l = clamp(typeof ddaLevel === 'number' && isFinite(ddaLevel) ? ddaLevel : 0.35, 0, 1);
    var t = clamp((tier | 0) || (1 + Math.floor(l * 5 * 0.9999)), 1, 5);
    return {
      level: l,
      tier: t,
      speedMul: 0.90 + l * 0.22,  // brisk even at low tier: 0.90x .. 1.12x
      gapTime: 0.96 - l * 0.24,   // kinetic 0.96s .. 0.72s wave rhythm (no sleepy voids!)
      flyerSpeed: 2.6 + l * 1.8,
      roarGain: 1.22 - l * 0.24   // faster Rampage buildup for younger kids
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
      for (var i = 0; i < LEVEL_COUNT; i++) base.stars[i] = clamp(raw.stars[i] | 0, 0, 3);
    }
    if (Array.isArray(raw.best)) {
      for (var j = 0; j < LEVEL_COUNT; j++) base.best[j] = Math.max(0, raw.best[j] | 0);
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

  function isWorldOpen(save, worldIdx) { return isLevelOpen(save, worldIdx * 3); }

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
    if (ratio >= 0.58 && bumps <= 1) return 3;
    if (ratio >= 0.34 || bumps === 0) return 2;
    return 1;
  }

  /* ---------------------------------------------- 3-lane obstacle & item gen */
  function obstacleSpec(kind) {
    switch (kind) {
      case 'low':
        return { kind: 'low', len: 1.05, y0: 0, y1: 1.05, hazard: true, smashFree: false, bonus: 4, action: 'jump' };
      case 'tall':
        return { kind: 'tall', len: 1.2, y0: 0, y1: 2.35, hazard: true, smashFree: false, bonus: 5, action: 'weave' };
      case 'arch':
        return { kind: 'arch', len: 1.85, y0: 0.90, y1: 2.75, hazard: true, smashFree: false, bonus: 5, action: 'duck' };
      case 'flyer':
        return { kind: 'flyer', len: 1.25, y0: 0.94, y1: 1.85, hazard: true, smashFree: false, mobile: true, bonus: 5, action: 'duck' };
      case 'crate':
        // Smashable wooden crate: steering into it smashes it cleanly for eggs + big Rampage charge!
        return { kind: 'crate', len: 1.25, y0: 0, y1: 1.25, hazard: false, smashFree: true, bonus: 3, roarCharge: 0.24, action: 'smash' };
      case 'bones':
        // Smashable dino bone pile: crunchy Rampage fuel!
        return { kind: 'bones', len: 1.35, y0: 0, y1: 1.05, hazard: false, smashFree: true, bonus: 4, roarCharge: 0.28, action: 'smash' };
      case 'pad':
        return { kind: 'pad', len: 1.65, y0: 0, y1: 0.55, hazard: false, bounce: true, bonus: 0, action: 'bounce' };
      case 'boost':
        return { kind: 'boost', len: 2.4, y0: 0, y1: 0.45, hazard: false, boost: true, bonus: 0, roarCharge: 0.16, action: 'boost' };
      default:
        return { kind: 'low', len: 1.05, y0: 0, y1: 1.05, hazard: true, smashFree: false, bonus: 4, action: 'jump' };
    }
  }

  function addItem(world, kind, dist, lane, y, val, chainIdx) {
    world.items.push({
      id: ++world.nextId,
      kind: kind,
      x: dist,
      lane: lane,
      lx: lane * LANE_WIDTH,
      y: y,
      val: val || 1,
      chain: chainIdx || 0,
      got: false
    });
    if (kind === 'egg' || kind === 'gold' || kind === 'rainbow') {
      world.totalEggs += (val || 1);
    }
  }

  function addEggArc(world, dist, lane, span, peakY, count, kind, val) {
    for (var i = 0; i < count; i++) {
      var u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      var d = dist + u * (span * 0.5);
      var y = 0.78 + (1 - u * u) * (peakY - 0.78);
      addItem(world, kind || 'egg', d, lane, y, val || 1, kind === 'rainbow' ? i + 1 : 0);
    }
  }

  function addLaneLine(world, d0, lane, count, spacing, y, kind, val) {
    for (var i = 0; i < count; i++) {
      addItem(world, kind || 'egg', d0 + i * spacing, lane, y, val || 1, kind === 'rainbow' ? i + 1 : 0);
    }
  }

  function pushObstacle(world, dist, lane, kind, rng) {
    var spec = obstacleSpec(kind);
    var ob = {
      id: ++world.nextId,
      kind: spec.kind,
      x: dist,
      baseX: dist,
      lane: lane,
      lx: lane * LANE_WIDTH,
      w: spec.len,
      y0: spec.y0,
      y1: spec.y1,
      hazard: !!spec.hazard,
      smashFree: !!spec.smashFree,
      bounce: !!spec.bounce,
      boost: !!spec.boost,
      mobile: !!spec.mobile,
      bonus: spec.bonus || 0,
      roarCharge: spec.roarCharge || 0,
      action: spec.action,
      variant: Math.floor(rng() * 3),
      smashed: false,
      cleared: false,
      cued: false,
      hit: false,
      flyT: rng() * 6.28
    };
    world.obs.push(ob);
    return ob;
  }

  // Spawn one 3-lane wave at `dist`. ALWAYS guarantees at least one safe walkable lane
  // so mouse-only / young players are never trapped by an un-duckable death wall!
  function spawnWave(world, dist, primaryKind, rng, speed, gapTime, allowHeart, worldIdx) {
    var lanes = [-1, 0, 1];
    // Pick a guaranteed safe open lane (close to previous safe lane for smooth weaving!).
    var prevSafe = world.lastSafeLane;
    var candidates = [];
    for (var li = 0; li < 3; li++) {
      if (Math.abs(lanes[li] - prevSafe) <= 1) candidates.push(lanes[li]);
    }
    var safeLane = candidates[Math.floor(rng() * candidates.length)];
    world.lastSafeLane = safeLane;
    var otherLanes = lanes.filter(function (l) { return l !== safeLane; });

    if (primaryKind === 'pad') {
      // Bouncy mushroom in safeLane -> tall scenic totem behind it -> soaring rainbow arc!
      pushObstacle(world, dist, safeLane, 'pad', rng);
      var followD = dist + Math.max(5.0, speed * 0.36);
      pushObstacle(world, followD, safeLane, 'tall', rng);
      // Also put a crate or low obstacle in one side lane for richness.
      pushObstacle(world, dist, otherLanes[0], 'low', rng);
      pushObstacle(world, followD, otherLanes[1], 'crate', rng);
      var arcSpan = Math.max(8.5, speed * 0.64);
      var arcC = dist + arcSpan * 0.56;
      for (var ri = 0; ri < 5; ri++) {
        var ru = (ri / 4) * 2 - 1;
        var rd = arcC + ru * (arcSpan * 0.5);
        var ry = 1.25 + (1 - ru * ru) * (4.35 - 1.25);
        addItem(world, ri === 2 ? 'gold' : 'rainbow', rd, safeLane, ry, ri === 2 ? 3 : 2, ri + 1);
      }
      return followD + Math.max(10.5, speed * (gapTime + 0.12));
    }

    if (primaryKind === 'boost') {
      // Turbo boost chevron in safeLane + smashable crates/hazards in side lanes!
      pushObstacle(world, dist, safeLane, 'boost', rng);
      addLaneLine(world, dist + 2.6, safeLane, 4, 1.5, 0.78, 'rainbow', 2);
      pushObstacle(world, dist, otherLanes[0], worldIdx >= 1 ? 'tall' : 'low', rng);
      pushObstacle(world, dist, otherLanes[1], 'crate', rng);
      return dist + Math.max(12.5, speed * (gapTime + 0.14));
    }

    if (primaryKind === 'crate' || primaryKind === 'bones') {
      // Reward lane with smashable crates/bones directly on the fun line!
      pushObstacle(world, dist, safeLane, primaryKind, rng);
      addLaneLine(world, dist - 2.8, safeLane, 2, 1.25, 0.72, 'egg', 1);
      // Side lanes get hazards to frame the smashable target.
      pushObstacle(world, dist, otherLanes[0], 'low', rng);
      if (worldIdx >= 1 || rng() < 0.6) {
        pushObstacle(world, dist, otherLanes[1], worldIdx >= 1 && rng() < 0.5 ? 'tall' : 'low', rng);
      }
      return dist + Math.max(10.0, speed * gapTime);
    }

    // Standard hazard wave (low / tall / arch / flyer):
    // NEVER blocks all 3 lanes with non-jumpable hazards! safeLane stays open or has a smashable reward/eggs!
    var hLane = otherLanes[0];
    var hDist = primaryKind === 'flyer' ? dist + 3.2 : dist;
    pushObstacle(world, hDist, hLane, primaryKind, rng);

    // Second side lane gets a complementary obstacle on higher speed/worlds (or smashable crate!).
    if (rng() < (worldIdx === 0 ? 0.55 : 0.85)) {
      var secondKind = rng() < 0.36 ? (rng() < 0.5 ? 'crate' : 'bones')
        : (primaryKind === 'arch' || primaryKind === 'flyer' ? 'low' : (worldIdx >= 1 && rng() < 0.5 ? 'tall' : 'low'));
      pushObstacle(world, dist, otherLanes[1], secondKind, rng);
    }

    // Guide trail of eggs down the safe weave lane OR jumping arc over a low obstacle!
    if (primaryKind === 'low' && rng() < 0.45) {
      addEggArc(world, dist, hLane, Math.max(4.6, speed * 0.36), 2.45, 3, 'egg', 1);
      addLaneLine(world, dist - 1.5, safeLane, 3, 1.35, 0.72, 'egg', 1);
    } else if (primaryKind === 'arch' || primaryKind === 'flyer') {
      // Tempting golden bonus under the arch for ducking pros, PLUS safe open eggs in safeLane!
      addItem(world, 'gold', dist, hLane, 0.46, 3, 0);
      addLaneLine(world, dist - 1.5, safeLane, 3, 1.35, 0.72, 'egg', 1);
    } else {
      addLaneLine(world, dist - 1.8, safeLane, 4, 1.3, 0.72, rng() < 0.25 ? 'rainbow' : 'egg', rng() < 0.25 ? 2 : 1);
    }

    var gap = Math.max(9.8, speed * (gapTime + (rng() * 0.24 - 0.06)));
    if (allowHeart && rng() < 0.12) {
      addItem(world, 'heart', dist + gap * 0.5, safeLane, 1.05, 1, 0);
    } else if (rng() < 0.25) {
      addItem(world, 'gold', dist + gap * 0.5, otherLanes[1], 0.85, 3, 0);
    }
    return dist + gap;
  }

  function fillEndless(world, upToDist) {
    var rng = world.rng;
    while (world.genX < upToDist) {
      var wIdx = worldAtDistance(world, world.genX);
      var distSpeed = Math.min(25.0, (WORLDS[0].baseSpeed + world.genX * 0.0085) * world.tune.speedMul);
      var distGap = Math.max(0.62, world.tune.gapTime - Math.min(0.24, world.genX * 0.00018));
      var pool = wIdx === 0
        ? ['low', 'crate', 'bones', 'pad', 'boost', 'tall']
        : ['low', 'tall', 'crate', 'bones', 'arch', 'flyer', 'pad', 'boost'];
      var kind = pool[Math.floor(rng() * pool.length)];
      if (kind === world.lastKind && rng() < 0.6) {
        kind = pool[(pool.indexOf(kind) + 1) % pool.length];
      }
      world.lastKind = kind;
      world.genX = spawnWave(world, world.genX, kind, rng, distSpeed, distGap, true, wIdx);
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
      gentle: !endless && def.world === 0,
      baseSpeed: baseSpeed,
      speed: baseSpeed,
      x: 0, // forward distance along track (kept as .x for snapshot/scenario continuity)
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
      lastSafeLane: 0,
      // Giant rolling Magma Boulder behind the dino:
      // 1.0 = safely far behind, 0.0 = right on dino's tail!
      boulderDist: 0.78,
      boulderTarget: 0.78,
      boulderSpin: 0,
      bestFar: opts.bestFar || 0,
      beatBest: false,
      p: {
        lane: 0,
        lx: 0,          // smoothed lateral world X
        lean: 0,        // visual roll when switching lanes
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
        boostT: 0,
        roar: 0.35,     // fills fast from crates/bones/eggs -> 5s golden Rampage!
        roarT: 0,
        squash: 0,
        stride: 0
      }
    };

    // Welcome opening egg line right in center lane!
    addLaneLine(world, 7.5, 0, 5, 1.5, 0.76, 'egg', 1);

    if (endless) {
      world.genX = 20;
      fillEndless(world, 130);
    } else {
      var cursor = 20;
      if (levelIndex === 0) {
        // Curated thrilling 1-1 opener: smashable crate right ahead -> boost pad -> bouncy mushroom!
        cursor = spawnWave(world, cursor, 'crate', rng, baseSpeed, tune.gapTime + 0.08, false, 0);
        cursor = spawnWave(world, cursor, 'boost', rng, baseSpeed, tune.gapTime + 0.08, false, 0);
        cursor = spawnWave(world, cursor, 'low', rng, baseSpeed, tune.gapTime + 0.08, false, 0);
        cursor = spawnWave(world, cursor, 'pad', rng, baseSpeed, tune.gapTime + 0.08, false, 0);
      } else if (levelIndex === 1) {
        cursor = spawnWave(world, cursor, 'bones', rng, baseSpeed, tune.gapTime + 0.06, false, 0);
        cursor = spawnWave(world, cursor, 'low', rng, baseSpeed, tune.gapTime + 0.06, false, 0);
        cursor = spawnWave(world, cursor, 'boost', rng, baseSpeed, tune.gapTime + 0.06, false, 0);
      }
      var endSafe = def.length - 18;
      var gap = tune.gapTime + (def.world === 0 ? 0.1 : 0);
      var kinds = def.kinds;
      while (cursor < endSafe) {
        var k = kinds[Math.floor(rng() * kinds.length)];
        if (k === world.lastKind && rng() < 0.65) {
          k = kinds[(kinds.indexOf(k) + 1) % kinds.length];
        }
        world.lastKind = k;
        cursor = spawnWave(world, cursor, k, rng, baseSpeed, gap, true, def.world);
      }
      // Victory rainbow runway across all 3 lanes into the Royal Nest!
      addLaneLine(world, def.length - 10, 0, 5, 1.6, 0.88, 'rainbow', 2);
      addItem(world, 'gold', def.length - 5, -1, 1.1, 3, 0);
      addItem(world, 'gold', def.length - 5, 1, 1.1, 3, 0);
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

  function startRampage(world) {
    var p = world.p;
    p.roar = 0;
    p.roarT = RAMPAGE_DURATION;
    p.duck = false;
    world.boulderTarget = 1.0;
    emit(world, 'roar', { x: world.x, lx: p.lx, y: p.y, duration: RAMPAGE_DURATION });
  }

  function chargeRampage(world, amount) {
    var p = world.p;
    if (p.roarT > 0 || amount <= 0) return;
    var prev = p.roar;
    p.roar = Math.min(1, p.roar + amount * world.tune.roarGain);
    if (prev < 1 && p.roar >= 1) {
      emit(world, 'roarReady', { x: world.x, lx: p.lx });
      // Auto-unleash 5s Golden Rampage immediately when gauge hits 100% (effortless S++ joy!)
      startRampage(world);
    }
  }

  /* -------------------------------------------------------------- step sim */
  function step(world, dt, input) {
    if (!world || world.done || world.over) return world;
    dt = clamp(dt, 0, 0.05);
    input = input || {};
    var p = world.p;
    world.t += dt;

    // 3-Lane crisp steering (discrete Left/Right presses or direct targetLane from mouse-X).
    var prevLane = p.lane;
    if (input.leftPressed) p.lane = clamp(p.lane - 1, -1, 1);
    if (input.rightPressed) p.lane = clamp(p.lane + 1, -1, 1);
    if (typeof input.targetLane === 'number' && input.targetLane >= -1 && input.targetLane <= 1) {
      p.lane = input.targetLane | 0;
    }
    if (p.lane !== prevLane) {
      p.lean = p.lane > prevLane ? -1 : 1;
      emit(world, 'lane', { lane: p.lane, dir: p.lane - prevLane, x: world.x, lx: p.lane * LANE_WIDTH });
    }
    var targetLx = p.lane * LANE_WIDTH;
    var kSnap = 1 - Math.exp(-dt * LANE_SNAP_RATE);
    p.lx += (targetLx - p.lx) * kSnap;
    p.lean += (0 - p.lean) * Math.min(1, dt * 10);

    // Speed progression + Rampage / Boost surges.
    var targetSpeed = world.endless
      ? Math.min(25.5, (WORLDS[0].baseSpeed + world.x * 0.0085) * world.tune.speedMul)
      : world.baseSpeed;
    if (p.roarT > 0) targetSpeed *= RAMPAGE_SPEED_MULT;
    if (p.boostT > 0) targetSpeed *= BOOST_SPEED_MULT;
    world.speed += (targetSpeed - world.speed) * Math.min(1, dt * 8);

    // Timers.
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.boostT > 0) p.boostT = Math.max(0, p.boostT - dt);
    if (world.streakTimer > 0) {
      world.streakTimer -= dt;
      if (world.streakTimer <= 0) world.streak = 0;
    }

    // Rampage timer + manual activation if already ready.
    if (p.roarT > 0) {
      p.roarT = Math.max(0, p.roarT - dt);
      if (p.roarT === 0) emit(world, 'roarEnd', { x: world.x });
    } else if (input.roarPressed && p.roar >= 0.999) {
      startRampage(world);
    }

    // Magma Boulder chase tension!
    // Base equilibrium depends on remaining hearts; boost/Rampage pushes it far back!
    var hpBase = p.hp >= 3 ? 0.80 : p.hp === 2 ? 0.48 : 0.22;
    if (p.roarT > 0 || p.boostT > 0) world.boulderTarget = 1.0;
    else world.boulderTarget += (hpBase - world.boulderTarget) * Math.min(1, dt * 0.55);
    world.boulderDist += (world.boulderTarget - world.boulderDist) * Math.min(1, dt * 4.5);
    world.boulderSpin += world.speed * dt * 0.55;

    // Jump buffering & coyote time.
    if (input.jumpPressed) p.buffer = JUMP_BUFFER;
    else if (p.buffer > 0) p.buffer = Math.max(0, p.buffer - dt);

    if (p.ground) p.coyote = COYOTE_TIME;
    else if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);

    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = JUMP_VELOCITY;
      p.ground = false;
      p.duck = false;
      p.coyote = 0;
      p.buffer = 0;
      p.holdT = 0;
      p.holdingJump = !!input.jump;
      p.superBounce = false;
      p.squash = 1;
      emit(world, 'jump', { x: world.x, lx: p.lx, y: p.y });
    }

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
      if (wantDuck && p.vy > -20) p.vy = Math.min(p.vy - 52 * dt, -12.5);
    }

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
        p.squash = -impact;
        emit(world, 'land', { x: world.x, lx: p.lx, power: impact });
      }
    }

    // Advance forward along the 3-lane track.
    var prevWorld = worldAtDistance(world, world.x);
    world.x += world.speed * dt;
    if (p.ground) p.stride += world.speed * dt * 1.15;

    if (world.endless) {
      var nextWorld = worldAtDistance(world, world.x);
      world.worldIndex = nextWorld;
      if (nextWorld !== prevWorld) {
        emit(world, 'worldChange', { world: nextWorld, name: WORLDS[nextWorld].name });
      }
      if (world.bestFar > 10 && !world.beatBest && world.x >= world.bestFar) {
        world.beatBest = true;
        emit(world, 'record', { x: world.x, far: world.bestFar });
      }
      if (world.genX < world.x + 120) fillEndless(world, world.x + 180);
    }

    while (world.oi < world.obs.length && world.obs[world.oi].x < world.x - 16) world.oi++;
    while (world.ii < world.items.length && world.items[world.ii].x < world.x - 12) world.ii++;

    // Forgiving player-biased 3D hitbox!
    var pz0 = world.x - PLAYER_HALF_Z;
    var pz1 = world.x + PLAYER_HALF_Z;
    var py0 = p.y;
    var py1 = p.y + (p.duck ? DUCK_HEIGHT : STAND_HEIGHT);

    for (var i = world.oi; i < world.obs.length; i++) {
      var ob = world.obs[i];
      if (ob.x > world.x + 52) break;
      if (ob.smashed) continue;

      if (ob.mobile && ob.x < world.x + 24 && ob.x > world.x - 10) {
        ob.x -= world.tune.flyerSpeed * dt;
        ob.flyT += dt * 7.8;
      }

      var sameLane = Math.abs(p.lx - ob.lx) < (ob.smashFree || ob.bounce || ob.boost ? 1.22 : PLAYER_HALF_X + 0.42);
      var oz0 = ob.x - ob.w * 0.5;
      var oz1 = ob.x + ob.w * 0.5;
      var overlapZ = pz1 > oz0 && pz0 < oz1;
      var overlapY = py1 > ob.y0 && py0 < ob.y1;

      if (!ob.cued && ob.hazard && sameLane && ob.x - world.x <= Math.max(12, world.speed * 0.85) && ob.x > world.x + 2.0) {
        ob.cued = true;
        emit(world, 'cue', { id: ob.id, kind: ob.kind, action: ob.action, x: ob.x, lane: ob.lane });
      }

      // Boost pad: surges speed + kicks Magma Boulder far back!
      if (ob.boost) {
        if (!ob.cleared && sameLane && overlapZ && py0 < 0.7) {
          ob.cleared = true;
          p.boostT = BOOST_DURATION;
          world.boulderTarget = 1.0;
          world.boulderDist = Math.min(1.0, world.boulderDist + 0.25);
          world.score += 45;
          chargeRampage(world, ob.roarCharge);
          emit(world, 'boost', { id: ob.id, x: ob.x, lx: ob.lx, y: 0.35 });
        }
        continue;
      }

      // Bouncy mushroom!
      if (ob.bounce) {
        if (!ob.cleared && sameLane && pz1 > oz0 - 0.35 && pz0 < oz1 + 0.35 && py0 <= ob.y1 + 0.4 && prevY >= -0.05 && p.vy <= 4) {
          ob.cleared = true;
          p.y = ob.y1 + 0.05;
          p.vy = BOUNCE_VELOCITY;
          p.ground = false;
          p.duck = false;
          p.superBounce = true;
          p.holdingJump = false;
          p.squash = 1.28;
          world.score += 35;
          emit(world, 'bounce', { id: ob.id, x: ob.x, lx: ob.lx, y: ob.y1 });
        }
        continue;
      }

      // Smashable crates & bone piles: contact ALWAYS smashes for joyful coins + Rampage charge!
      if (ob.smashFree) {
        if (sameLane && pz1 > oz0 - 0.3 && pz0 < oz1 + 0.3 && py0 < ob.y1 + 0.35) {
          ob.smashed = true;
          ob.cleared = true;
          world.smashed++;
          world.cleared++;
          world.eggs += ob.bonus;
          world.score += ob.bonus * 25;
          world.boulderTarget = Math.min(1.0, world.boulderTarget + 0.14);
          chargeRampage(world, ob.roarCharge);
          emit(world, 'smash', { id: ob.id, kind: ob.kind, x: ob.x, lx: ob.lx, y: 0.65, bonus: ob.bonus, rampage: p.roarT > 0 });
        }
        continue;
      }

      // 5s Golden Rampage bulldozes EVERY obstacle in your lane (and nearby!) with huge coin showers!
      if (p.roarT > 0 && sameLane && pz1 > oz0 - 0.9 && pz0 < oz1 + 0.6) {
        ob.smashed = true;
        ob.cleared = true;
        world.smashed++;
        world.cleared++;
        world.eggs += ob.bonus;
        world.score += ob.bonus * 35;
        world.boulderTarget = 1.0;
        emit(world, 'smash', { id: ob.id, kind: ob.kind, x: ob.x, lx: ob.lx, y: (ob.y0 + ob.y1) * 0.5, bonus: ob.bonus, rampage: true });
        continue;
      }

      // Normal hazard collision.
      if (sameLane && overlapZ && overlapY && !ob.hit) {
        ob.hit = true;
        if (p.invuln <= 0 && p.roarT <= 0) {
          p.hp = Math.max(world.gentle ? 1 : 0, p.hp - 1);
          p.invuln = HURT_INVULN;
          world.bumps++;
          world.streak = 0;
          world.streakTimer = 0;
          // Magma Boulder closes in ominously on stumble!
          world.boulderDist = Math.max(0.06, world.boulderDist - 0.34);
          world.boulderTarget = p.hp <= 0 ? 0.0 : (p.hp === 1 ? 0.20 : 0.44);
          emit(world, 'bump', { id: ob.id, kind: ob.kind, x: ob.x, lx: ob.lx, y: (ob.y0 + ob.y1) * 0.5, hp: p.hp, boulderDist: world.boulderDist });
          if (p.hp <= 0) {
            world.over = true;
            world.boulderDist = 0;
            emit(world, 'over', { x: world.x, eggs: world.eggs, score: world.score });
            return world;
          }
        }
      } else if (!ob.cleared && !ob.hit && oz1 < pz0) {
        ob.cleared = true;
        world.cleared++;
        world.score += 15;
        emit(world, 'clear', { id: ob.id, kind: ob.kind, x: ob.x });
      }
    }

    // Collectibles with generous kid-friendly magnetic pickup (extra wide during Rampage!).
    var magnetX = p.roarT > 0 ? 3.2 : 1.38;
    var magnetZ = p.roarT > 0 ? 2.2 : 1.45;
    var cy = p.y + (p.duck ? 0.38 : 0.78);
    for (var j = world.ii; j < world.items.length; j++) {
      var it = world.items[j];
      if (it.x > world.x + 4.5) break;
      if (it.got) continue;
      var dz = Math.abs(it.x - world.x);
      var dx = Math.abs(it.lx - p.lx);
      var dy = Math.abs(it.y - cy);
      if (dz <= magnetZ && dx <= magnetX && dy <= 1.45) {
        it.got = true;
        if (it.kind === 'heart') {
          var healed = p.hp < MAX_HEARTS;
          if (healed) {
            p.hp++;
            world.boulderTarget = Math.min(1.0, world.boulderTarget + 0.25);
          } else {
            world.eggs += 3;
            world.score += 50;
          }
          emit(world, 'heart', { x: it.x, lx: it.lx, y: it.y, healed: healed, hp: p.hp });
        } else {
          world.eggs += it.val;
          world.streak++;
          world.streakTimer = 2.2;
          var pts = it.kind === 'gold' ? 50 : it.kind === 'rainbow' ? 25 : 10;
          world.score += pts + Math.min(world.streak, 12) * 3;
          chargeRampage(world, it.kind === 'gold' ? 0.16 : it.kind === 'rainbow' ? 0.09 : 0.055);
          emit(world, 'egg', { kind: it.kind, val: it.val, x: it.x, lx: it.lx, y: it.y, streak: world.streak });
        }
      }
    }

    if (world.endless) {
      var distScore = Math.floor(world.x);
      if (distScore > world.score) world.score = distScore;
    }

    if (!world.endless && world.x >= world.length) {
      world.x = world.length;
      world.done = true;
      var stars = computeStars(world.eggs, world.totalEggs, world.bumps, true);
      emit(world, 'finish', { x: world.x, eggs: world.eggs, score: world.score, stars: stars });
    }

    return world;
  }

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
    LANE_WIDTH: LANE_WIDTH,
    RAMPAGE_DURATION: RAMPAGE_DURATION,
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

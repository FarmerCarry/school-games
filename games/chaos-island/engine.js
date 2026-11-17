/*
 * Chaos Island (جزيرة الفوضى) — Pure Party Disaster Brawl Engine.
 * Dual environment: CommonJS (Node tests) + window.CIEngine (browser).
 * Zero DOM, zero audio, zero telemetry calls.
 */
(function () {
  'use strict';

  var W = 1280, H = 720;
  var CARD_TIME = 1.2, ACTION_TIME = 14.0, INTER_TIME = 1.4, ROUNDS = 3;
  var MOVE_SPEED = 320, JUMP_VY = -595, DJUMP_VY = -525, GRAVITY = 1520;
  var DASH_SPEED = 590, DASH_DUR = 0.22, DASH_CD = 0.82;

  var DIFFICULTIES = {
    easy: { id: 'easy', label: 'سهل', desc: '5 قلوب · إنذار مبكر · حواجز إنقاذ آمنة', hearts: 5, warn: 1.1, speed: 0.76, botSkill: 0.45, doubleAll: false, bumpers: true },
    normal: { id: 'normal', label: 'متوسط', desc: '3 قلوب · منافسة حماسية · فوضى مزدوجة بالجولة 3', hearts: 3, warn: 0.84, speed: 1.0, botSkill: 0.74, doubleAll: false, bumpers: false },
    hero: { id: 'hero', label: 'بطل', desc: 'قلبان · فوضى مزدوجة كل جولة · خصوم أشرس!', hearts: 2, warn: 0.62, speed: 1.22, botSkill: 0.95, doubleAll: true, bumpers: false }
  };

  var ISLANDS = [
    {
      id: 'volcano', name: 'بركان القراصنة', sub: 'سفن غارقة وينابيع حمم فوارة',
      waterY: 652, friction: 0.83, sky: ['#ff6b35', '#ffd166'], sea: '#ff3d00', seaHi: '#ffbe0b',
      geysers: [465, 815], springs: [], bumpers: [], moving: false, gravZone: null,
      plats: [
        { id: 'deckL', x: 170, y: 560, w: 310, h: 38, oneWay: false },
        { id: 'deckC', x: 480, y: 560, w: 320, h: 38, oneWay: false },
        { id: 'deckR', x: 800, y: 560, w: 310, h: 38, oneWay: false },
        { id: 'left', x: 205, y: 430, w: 225, h: 24, oneWay: true },
        { id: 'right', x: 850, y: 430, w: 225, h: 24, oneWay: true },
        { id: 'top', x: 485, y: 312, w: 310, h: 24, oneWay: true }
      ]
    },
    {
      id: 'dino', name: 'قلعة الديناصور', sub: 'أعمدة صخرية ونوابض قفز عملاقة',
      waterY: 652, friction: 0.84, sky: ['#2ec4b6', '#cbf3f0'], sea: '#0f766e', seaHi: '#5eead4',
      geysers: [], springs: [290, 990], bumpers: [], moving: false, gravZone: null,
      plats: [
        { id: 'deckL', x: 160, y: 560, w: 320, h: 38, oneWay: false },
        { id: 'deckC', x: 480, y: 560, w: 320, h: 38, oneWay: false },
        { id: 'deckR', x: 800, y: 560, w: 320, h: 38, oneWay: false },
        { id: 'left', x: 195, y: 432, w: 215, h: 24, oneWay: true },
        { id: 'right', x: 870, y: 432, w: 215, h: 24, oneWay: true },
        { id: 'top', x: 470, y: 308, w: 340, h: 24, oneWay: true }
      ]
    },
    {
      id: 'alien', name: 'سفينة الفضاء', sub: 'منصات طائرة وحقل انعدام الجاذبية',
      waterY: 652, friction: 0.85, sky: ['#1b103f', '#5a189a'], sea: '#7209b7', seaHi: '#f72585',
      geysers: [], springs: [], bumpers: [], moving: true, gravZone: { x: 555, w: 170 },
      plats: [
        { id: 'deckL', x: 170, y: 560, w: 310, h: 38, oneWay: false },
        { id: 'deckC', x: 480, y: 560, w: 320, h: 38, oneWay: false },
        { id: 'deckR', x: 800, y: 560, w: 310, h: 38, oneWay: false },
        { id: 'left', x: 200, y: 426, w: 220, h: 24, oneWay: true, moveAmp: 46, moveSpd: 1.5, phase: 0 },
        { id: 'right', x: 860, y: 426, w: 220, h: 24, oneWay: true, moveAmp: 46, moveSpd: 1.5, phase: 3.14 },
        { id: 'top', x: 485, y: 302, w: 310, h: 24, oneWay: true }
      ]
    },
    {
      id: 'glacier', name: 'جزيرة الجليد الآلي', sub: 'جليد متزحلق وقروش آلية ومصدات',
      waterY: 652, friction: 0.93, sky: ['#0077b6', '#caf0f8'], sea: '#03045e', seaHi: '#00f5d4',
      geysers: [], springs: [], bumpers: [182, 1098], moving: false, gravZone: null,
      plats: [
        { id: 'deckL', x: 165, y: 560, w: 315, h: 38, oneWay: false },
        { id: 'deckC', x: 480, y: 560, w: 320, h: 38, oneWay: false },
        { id: 'deckR', x: 800, y: 560, w: 315, h: 38, oneWay: false },
        { id: 'left', x: 205, y: 430, w: 225, h: 24, oneWay: true },
        { id: 'right', x: 850, y: 430, w: 225, h: 24, oneWay: true },
        { id: 'top', x: 485, y: 310, w: 310, h: 24, oneWay: true }
      ]
    }
  ];

  var BASE_DISASTERS = ['meteors', 'shark', 'ufo', 'bombs', 'boulders', 'sinking'];
  var DISASTERS = {
    meteors: { id: 'meteors', name: 'نيازك البركان!', tip: 'راقب سهام الخطر واقفز بعيداً!' },
    shark: { id: 'shark', name: 'موجة القرش!', tip: 'اصعد فوراً إلى المنصات العالية!' },
    ufo: { id: 'ufo', name: 'صحن الاختطاف!', tip: 'اهرب من شعاع المركبة الفضائية!' },
    bombs: { id: 'bombs', name: 'عاصفة القنابل!', tip: 'اندفع بقوة لقذف القنابل على الخصوم!' },
    boulders: { id: 'boulders', name: 'الصخور العملاقة!', tip: 'اقفز فوق الصخور المتدحرجة!' },
    sinking: { id: 'sinking', name: 'الأرض المتساقطة!', tip: 'ابتعد عن الرصيف المهتز قبل غرقه!' },
    double: { id: 'double', name: 'فوضى مزدوجة!', tip: 'كارثتان في وقت واحد! افتح صناديق القوة!' }
  };

  var GADGET_IDS = ['jetpack', 'shield', 'hammer'];
  var GADGETS = {
    jetpack: { id: 'jetpack', name: 'حقيبة نفاثة!', dur: 5.5, color: '#ff7b00' },
    shield: { id: 'shield', name: 'درع البرق!', dur: 8.5, color: '#00e5ff' },
    hammer: { id: 'hammer', name: 'مطرقة عملاقة!', dur: 5.5, color: '#ffd000' }
  };

  var BOTS = [
    { name: 'القبطان رعد', color: '#ef476f', helm: 'h_pirate', trail: 't_fire' },
    { name: 'الآلي زاب', color: '#00b4d8', helm: 'h_mech', trail: 't_bolt' },
    { name: 'تيربو ريكس', color: '#38b000', helm: 'h_dino', trail: 't_spark' },
    { name: 'النينجا ظل', color: '#8338ec', helm: 'h_bandana', trail: 't_plasma' }
  ];

  var SHOP = {
    helmets: [
      { id: 'h_bandana', name: 'عصابة القبطان', price: 0, desc: 'عصابة قرصان حمراء سريعة' },
      { id: 'h_pirate', name: 'قبعة القرصان', price: 35, desc: 'قبعة قبطان البحار الذهبية' },
      { id: 'h_dino', name: 'خوذة ريكس', price: 60, desc: 'فك ديناصور مدرع ومخيف' },
      { id: 'h_mech', name: 'قناع الآلي', price: 85, desc: 'منظار ليزر سيبراني مضيء' },
      { id: 'h_astro', name: 'خوذة الفضاء', price: 115, desc: 'خوذة رائد المجرة المدرعة' },
      { id: 'h_crown', name: 'تاج البركان', price: 150, desc: 'تاج أبطال الجزيرة الناري' }
    ],
    trails: [
      { id: 't_spark', name: 'شرار أبيض', price: 0, desc: 'شرار اندفاع كلاسيكي' },
      { id: 't_fire', name: 'لهب البركان', price: 45, desc: 'ذيل ناري متوهج عند الاندفاع' },
      { id: 't_bolt', name: 'برق الرعد', price: 75, desc: 'صواعق كهربائية خاطفة' },
      { id: 't_plasma', name: 'نجوم المجرة', price: 105, desc: 'حلقات طاقة فضائية مشعة' }
    ]
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }

  function makeRng(seed) {
    var s = (seed == null ? ((Date.now() ^ 0x9e3779b9) >>> 0) : (seed >>> 0)) || 0x12345678;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickPlan(rng, diffCfg) {
    var pool = BASE_DISASTERS.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var plan = [];
    for (var r = 0; r < ROUNDS; r++) {
      var isDouble = diffCfg.doubleAll || r === ROUNDS - 1;
      var a = pool[(r * 2) % pool.length];
      var b = pool[(r * 2 + 1) % pool.length];
      if (b === a) b = pool[(r * 2 + 2) % pool.length];
      plan.push(isDouble ? { id: 'double', sub: [a, b] } : { id: a, sub: [a] });
    }
    return plan;
  }

  function makeActor(slot, opts) {
    return {
      slot: slot,
      name: opts.name,
      isHuman: !!opts.isHuman,
      isBot: !opts.isHuman,
      color: opts.color,
      helm: opts.helm || 'h_bandana',
      trail: opts.trail || 't_spark',
      x: opts.x,
      y: opts.y,
      vx: 0,
      vy: 0,
      r: 22,
      facing: slot % 2 === 0 ? 1 : -1,
      onGround: true,
      groundId: 'deckC',
      jumpsLeft: 2,
      coyoteT: 0,
      jumpBufT: 0,
      dropT: 0,
      dashT: 0,
      dashCd: 0,
      invulnT: 0,
      stunT: 0,
      flipT: 0,
      hearts: opts.hearts,
      maxHearts: opts.hearts,
      state: 'alive', // 'alive' | 'drone' | 'out'
      rescuedOnce: false,
      droneOrbs: 0,
      droneTimer: 0,
      gadget: null,
      gadgetT: 0,
      coins: 0,
      score: 0,
      roundsWon: 0,
      bonks: 0,
      walk: 0,
      aiTimer: 0,
      aiTargetX: opts.x,
      aiJump: false,
      aiDash: false
    };
  }

  function clonePlats(isl) {
    return isl.plats.map(function (p) {
      return {
        id: p.id, baseX: p.x, x: p.x, y: p.y, w: p.w, h: p.h,
        oneWay: !!p.oneWay, moveAmp: p.moveAmp || 0, moveSpd: p.moveSpd || 0,
        phase: p.phase || 0, dx: 0, sinkWarn: 0, sunkT: 0
      };
    });
  }

  function createWorld(opts) {
    opts = opts || {};
    var islIdx = typeof opts.island === 'number' ? clamp(opts.island | 0, 0, ISLANDS.length - 1) : 0;
    if (typeof opts.island === 'string') {
      for (var k = 0; k < ISLANDS.length; k++) if (ISLANDS[k].id === opts.island) islIdx = k;
    }
    var isl = ISLANDS[islIdx];
    var diffCfg = DIFFICULTIES[opts.diff] || DIFFICULTIES.normal;
    var ddaLevel = typeof opts.ddaLevel === 'number' ? clamp(opts.ddaLevel, 0, 1) : 0.35;
    var rng = makeRng(opts.seed);
    var duo = !!opts.duo;
    var duoMode = opts.duoMode === 'versus' ? 'versus' : 'coop';
    var demo = !!opts.demo;

    var p1Cosm = opts.p1Cosm || {};
    var p2Cosm = opts.p2Cosm || {};
    var actors = [];
    // Player 1 spawns at x=430 on flat main deck with clear runway right and left.
    actors.push(makeActor(0, {
      name: 'البطل 1', isHuman: !demo, color: '#ff9f1c',
      helm: p1Cosm.helm || 'h_bandana', trail: p1Cosm.trail || 't_spark',
      x: 430, y: 560 - 22, hearts: diffCfg.hearts
    }));

    if (duo && !demo) {
      actors.push(makeActor(1, {
        name: 'البطل 2', isHuman: true, color: '#2ec4b6',
        helm: p2Cosm.helm || 'h_mech', trail: p2Cosm.trail || 't_bolt',
        x: 540, y: 560 - 22, hearts: diffCfg.hearts
      }));
    }

    var botCount = demo ? 4 : (duo ? (duoMode === 'versus' ? 2 : 3) : 4);
    var botStarts = [740, 880, 300, 980];
    for (var b = 0; b < botCount; b++) {
      var bt = BOTS[b % BOTS.length];
      actors.push(makeActor(actors.length, {
        name: bt.name, isHuman: false, color: bt.color, helm: bt.helm, trail: bt.trail,
        x: botStarts[b % botStarts.length], y: 560 - 22, hearts: Math.max(2, diffCfg.hearts)
      }));
    }

    var bumpers = isl.bumpers.slice();
    if (diffCfg.bumpers && !bumpers.length) bumpers = [178, 1102];

    var world = {
      isl: isl,
      islandIndex: islIdx,
      diff: diffCfg.id,
      diffCfg: diffCfg,
      ddaLevel: ddaLevel,
      speedMul: diffCfg.speed * (0.92 + ddaLevel * 0.18),
      duo: duo,
      duoMode: duoMode,
      demo: demo,
      rng: rng,
      round: 0,
      rounds: ROUNDS,
      phase: demo ? 'action' : 'card', // 'card' | 'action' | 'inter' | 'done'
      t: 0,
      frames: 0,
      waterY: isl.waterY,
      baseWaterY: isl.waterY,
      windX: 0,
      plan: pickPlan(rng, diffCfg),
      plats: clonePlats(isl),
      bumpers: bumpers,
      actors: actors,
      hazards: [],
      crates: [],
      coins: [],
      orbs: [],
      geysers: isl.geysers.map(function (gx, gi) { return { x: gx, timer: 2.2 + gi * 1.9, warnT: 0, activeT: 0 }; }),
      events: [],
      spawnTimers: { a: 0.45, b: 0.95, crate: 2.6, coin: 1.8 },
      winnerSlot: 0,
      won: false,
      stars: 0,
      p1Score: 0
    };

    setupRound(world, 0, true);
    if (demo) { world.phase = 'action'; world.t = 0.2; }
    return world;
  }

  function currentDisasterInfo(world) {
    var entry = world.plan[world.round] || world.plan[0];
    var meta = DISASTERS[entry.id] || DISASTERS.meteors;
    var subText = meta.tip;
    if (entry.id === 'double' && entry.sub.length >= 2) {
      subText = DISASTERS[entry.sub[0]].name + ' + ' + DISASTERS[entry.sub[1]].name;
    }
    return { id: entry.id, sub: entry.sub, name: meta.name, tip: subText };
  }

  function setupRound(world, r, initial) {
    world.round = r;
    world.phase = world.demo ? 'action' : 'card';
    world.t = 0;
    world.waterY = world.baseWaterY;
    world.windX = 0;
    world.hazards.length = 0;
    world.crates.length = 0;
    world.coins.length = 0;
    world.orbs.length = 0;
    world.plats = clonePlats(world.isl);
    world.spawnTimers = { a: 0.35, b: 0.85, crate: 2.2, coin: 1.4 };
    for (var g = 0; g < world.geysers.length; g++) {
      world.geysers[g].timer = 2.0 + g * 1.8;
      world.geysers[g].warnT = 0;
      world.geysers[g].activeT = 0;
    }
    var starts = [430, 540, 740, 880, 300, 980];
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      a.x = starts[i % starts.length];
      a.y = 560 - a.r;
      a.vx = 0; a.vy = 0;
      a.onGround = true; a.groundId = 'deckC';
      a.jumpsLeft = 2; a.coyoteT = 0; a.jumpBufT = 0; a.dropT = 0;
      a.dashT = 0; a.dashCd = a.isBot ? 0.9 + (i * 0.35) : 0; a.stunT = 0; a.flipT = 0;
      a.invulnT = initial ? 0 : 0.8;
      a.hearts = a.maxHearts;
      a.state = 'alive';
      a.rescuedOnce = false;
      a.droneOrbs = 0;
      a.droneTimer = 0;
      if (initial) { a.gadget = null; a.gadgetT = 0; }
    }
  }

  function spawnRescueOrbs(world) {
    var spots = [
      { x: 320, y: 350 }, { x: 520, y: 245 },
      { x: 760, y: 245 }, { x: 960, y: 350 }
    ];
    for (var i = 0; i < spots.length; i++) {
      if (world.orbs.length < 6) {
        world.orbs.push({
          x: spots[i].x + (world.rng() - 0.5) * 40,
          y: spots[i].y + (world.rng() - 0.5) * 30,
          r: 18, bob: world.rng() * 6.28, life: 14
        });
      }
    }
  }

  function triggerKO(world, actor) {
    var otherHumanAlive = false;
    for (var i = 0; i < world.actors.length; i++) {
      var o = world.actors[i];
      if (o !== actor && o.isHuman && o.state === 'alive') otherHumanAlive = true;
    }
    var canDrone = actor.isHuman && (otherHumanAlive || !actor.rescuedOnce);
    if (canDrone) {
      actor.state = 'drone';
      actor.rescuedOnce = true;
      actor.droneOrbs = 0;
      actor.droneTimer = world.duo ? 12.0 : 6.5;
      actor.vx = 0;
      actor.vy = -120;
      actor.y = Math.min(actor.y, 410);
      actor.x = clamp(actor.x, 220, W - 220);
      actor.gadget = null;
      actor.gadgetT = 0;
      spawnRescueOrbs(world);
      world.events.push({ type: 'droneStart', x: actor.x, y: actor.y, slot: actor.slot });
    } else {
      actor.state = 'out';
      for (var c = 0; c < 2; c++) {
        world.coins.push({
          x: clamp(actor.x + (c === 0 ? -22 : 22), 190, W - 190),
          y: Math.min(actor.y, 500),
          vx: (c === 0 ? -95 : 95), vy: -250, r: 13, life: 9
        });
      }
      world.events.push({ type: 'ko', x: actor.x, y: actor.y, slot: actor.slot, human: actor.isHuman });
    }
  }

  function hurtActor(world, actor, kbX, kbY) {
    if (actor.state !== 'alive' || actor.invulnT > 0) return false;
    if (actor.gadget === 'shield') {
      actor.gadget = null;
      actor.gadgetT = 0;
      actor.invulnT = 1.0;
      actor.vx = kbX * 0.5;
      actor.vy = Math.min(-220, kbY * 0.6);
      world.events.push({ type: 'hurt', x: actor.x, y: actor.y, slot: actor.slot, human: actor.isHuman, shielded: true });
      return false;
    }
    actor.hearts = Math.max(0, actor.hearts - 1);
    actor.invulnT = 1.15;
    actor.stunT = 0.25;
    actor.vx = kbX || 0;
    actor.vy = kbY || -340;
    actor.onGround = false;
    world.events.push({ type: 'hurt', x: actor.x, y: actor.y, slot: actor.slot, human: actor.isHuman, shielded: false });
    if (actor.hearts <= 0) triggerKO(world, actor);
    return true;
  }

  function hammerSlam(world, actor) {
    var reach = 155;
    world.events.push({ type: 'boom', x: actor.x, y: actor.y + 10, power: 0.85, hammer: true });
    for (var i = 0; i < world.actors.length; i++) {
      var o = world.actors[i];
      if (o === actor || o.state !== 'alive') continue;
      if (world.duo && world.duoMode === 'coop' && actor.isHuman && o.isHuman) continue;
      var d = dist(actor.x, actor.y, o.x, o.y);
      if (d < reach) {
        var dir = o.x >= actor.x ? 1 : -1;
        o.vx = dir * 560;
        o.vy = -440;
        o.stunT = 0.7;
        o.onGround = false;
        actor.score += 35;
        actor.bonks++;
        world.coins.push({ x: o.x, y: o.y - 18, vx: dir * 80, vy: -240, r: 13, life: 9 });
        world.events.push({ type: 'bonk', x: o.x, y: o.y, attacker: actor.slot, victim: o.slot, head: false });
      }
    }
    for (var h = world.hazards.length - 1; h >= 0; h--) {
      var hz = world.hazards[h];
      if ((hz.kind === 'bomb' || hz.kind === 'boulder') && dist(actor.x, actor.y, hz.x, hz.y) < reach + 25) {
        if (hz.kind === 'bomb') {
          var bdir = hz.x >= actor.x ? 1 : -1;
          hz.vx = bdir * 620;
          hz.vy = -380;
          hz.owner = actor.slot;
        } else {
          world.hazards.splice(h, 1);
          actor.score += 20;
        }
      }
    }
  }

  function stepDrone(world, actor, inp, dt) {
    actor.droneTimer -= dt;
    var mx = inp ? clamp(inp.moveX || 0, -1, 1) : 0;
    var my = inp ? ((inp.down ? 1 : 0) - ((inp.up || inp.jump) ? 1 : 0)) : 0;
    if (actor.slot === 0 && actor.isHuman && mx !== 0) {
      actor.walk += Math.abs(mx) * MOVE_SPEED * dt;
    }
    if (mx !== 0) actor.facing = mx > 0 ? 1 : -1;
    var boost = inp && inp.dash ? 1.45 : 1.0;
    var spd = 370 * boost;
    actor.vx += (mx * spd - actor.vx) * Math.min(1, dt * 10);
    actor.vy += (my * spd - actor.vy) * Math.min(1, dt * 10);
    actor.x = clamp(actor.x + actor.vx * dt, 90, W - 90);
    actor.y = clamp(actor.y + actor.vy * dt, 95, world.waterY - 50);

    for (var i = world.orbs.length - 1; i >= 0; i--) {
      var orb = world.orbs[i];
      if (dist(actor.x, actor.y, orb.x, orb.y) < actor.r + orb.r + 10) {
        world.orbs.splice(i, 1);
        actor.droneOrbs++;
        actor.score += 15;
        world.events.push({ type: 'orb', x: orb.x, y: orb.y, slot: actor.slot, count: actor.droneOrbs });
      }
    }

    if (world.duo && world.duoMode === 'coop') {
      for (var p = 0; p < world.actors.length; p++) {
        var ally = world.actors[p];
        if (ally !== actor && ally.isHuman && ally.state === 'alive' && dist(actor.x, actor.y, ally.x, ally.y) < 54) {
          actor.droneOrbs = 3;
        }
      }
    }

    if (actor.droneOrbs >= 3) {
      actor.state = 'alive';
      actor.hearts = Math.min(actor.maxHearts, world.diff === 'easy' ? 3 : 2);
      actor.invulnT = 1.7;
      actor.vx = 0;
      actor.vy = -260;
      actor.jumpsLeft = 2;
      actor.score += 50;
      world.events.push({ type: 'revive', x: actor.x, y: actor.y, slot: actor.slot });
      return;
    }

    if (actor.droneTimer <= 0) {
      var otherAlive = false;
      for (var j = 0; j < world.actors.length; j++) {
        if (world.actors[j] !== actor && world.actors[j].isHuman && world.actors[j].state === 'alive') otherAlive = true;
      }
      if (world.duo && otherAlive) {
        actor.droneTimer = 8.0;
        if (world.orbs.length < 3) spawnRescueOrbs(world);
      } else {
        actor.state = 'out';
        world.events.push({ type: 'ko', x: actor.x, y: actor.y, slot: actor.slot, human: actor.isHuman });
      }
    }
  }

  function stepActor(world, actor, inp, dt) {
    inp = inp || {};
    var rawMx = clamp(inp.moveX || 0, -1, 1);
    if (actor.state === 'out') {
      if (actor.slot === 0 && actor.isHuman && rawMx !== 0) actor.walk += Math.abs(rawMx) * MOVE_SPEED * dt;
      return;
    }
    if (actor.state === 'drone') { stepDrone(world, actor, inp, dt); return; }

    if (actor.invulnT > 0) actor.invulnT = Math.max(0, actor.invulnT - dt);
    if (actor.stunT > 0) actor.stunT = Math.max(0, actor.stunT - dt * (rawMx !== 0 ? 2.5 : 1));
    if (actor.dashCd > 0) actor.dashCd = Math.max(0, actor.dashCd - dt);
    if (actor.dropT > 0) actor.dropT = Math.max(0, actor.dropT - dt);
    if (actor.flipT > 0) actor.flipT = Math.max(0, actor.flipT - dt);
    if (actor.gadgetT > 0) {
      actor.gadgetT -= dt;
      if (actor.gadgetT <= 0) { actor.gadget = null; actor.gadgetT = 0; }
    }

    var mx = actor.stunT > 0 ? rawMx * 0.45 : rawMx;
    // CRITICAL CONTRACT: player.walk ONLY increments from Player 1's own intentional horizontal input!
    if (actor.slot === 0 && actor.isHuman && rawMx !== 0) {
      actor.walk += Math.abs(rawMx) * MOVE_SPEED * dt;
    }
    if (rawMx !== 0) actor.facing = rawMx > 0 ? 1 : -1;

    if (inp.down && actor.onGround) {
      actor.dropT = 0.22;
      actor.onGround = false;
    } else if (inp.down && !actor.onGround && actor.vy < 460) {
      actor.vy += 900 * dt;
    }

    if (actor.onGround) {
      actor.coyoteT = 0.11;
      actor.jumpsLeft = 2;
    } else if (actor.coyoteT > 0) {
      actor.coyoteT = Math.max(0, actor.coyoteT - dt);
    }

    if (inp.jumpPressed) actor.jumpBufT = 0.11;
    else if (actor.jumpBufT > 0) actor.jumpBufT = Math.max(0, actor.jumpBufT - dt);

    var inGrav = world.isl.gravZone && actor.x >= world.isl.gravZone.x && actor.x <= world.isl.gravZone.x + world.isl.gravZone.w;
    var jumpBoost = inGrav ? 1.18 : 1.0;

    if (actor.jumpBufT > 0 && actor.stunT <= 0) {
      if (actor.coyoteT > 0) {
        actor.vy = JUMP_VY * jumpBoost;
        actor.onGround = false;
        actor.coyoteT = 0;
        actor.jumpsLeft = 1;
        actor.jumpBufT = 0;
        world.events.push({ type: 'jump', x: actor.x, y: actor.y + actor.r, double: false, human: actor.isHuman });
      } else if (actor.jumpsLeft > 0) {
        actor.vy = DJUMP_VY * jumpBoost;
        actor.jumpsLeft--;
        actor.jumpBufT = 0;
        actor.flipT = 0.36;
        world.events.push({ type: 'jump', x: actor.x, y: actor.y + actor.r, double: true, human: actor.isHuman });
      }
    }

    if (actor.gadget === 'jetpack' && (inp.jump || inp.up) && actor.stunT <= 0) {
      actor.vy = Math.max(-390, actor.vy - 2200 * dt);
      actor.onGround = false;
    }

    if (inp.dashPressed && actor.dashCd <= 0 && actor.stunT <= 0) {
      actor.dashT = DASH_DUR;
      actor.dashCd = DASH_CD;
      actor.vx = actor.facing * DASH_SPEED;
      actor.vy = Math.min(actor.vy, -40);
      if (actor.invulnT < 0.18) actor.invulnT = 0.18;
      var hasHammer = actor.gadget === 'hammer';
      world.events.push({ type: 'dash', x: actor.x, y: actor.y, dir: actor.facing, trail: actor.trail, hammer: hasHammer, human: actor.isHuman });
      if (hasHammer) hammerSlam(world, actor);
    }

    if (actor.dashT > 0) {
      actor.dashT = Math.max(0, actor.dashT - dt);
      actor.vx = actor.facing * DASH_SPEED;
      actor.vy *= 0.86;
    } else {
      var targetVx = mx * MOVE_SPEED + world.windX;
      var accel = mx !== 0 ? 14 : (actor.onGround ? (1 - world.isl.friction) * 48 : 5);
      actor.vx += (targetVx - actor.vx) * Math.min(1, accel * dt);
      var gMul = inGrav ? 0.68 : 1.0;
      actor.vy = Math.min(860, actor.vy + GRAVITY * gMul * dt);
    }

    var prevBottom = actor.y + actor.r;
    actor.x += actor.vx * dt;
    actor.y += actor.vy * dt;
    actor.x = clamp(actor.x, 70, W - 70);

    // Side rescue / glacier bumpers
    for (var b = 0; b < world.bumpers.length; b++) {
      var bx = world.bumpers[b];
      if (Math.abs(actor.x - bx) < actor.r + 18 && Math.abs(actor.y - 525) < 48) {
        var pushDir = bx < W / 2 ? 1 : -1;
        actor.vx = pushDir * 460;
        actor.vy = -340;
        actor.onGround = false;
        world.events.push({ type: 'jump', x: bx, y: 525, double: false, human: actor.isHuman });
      }
    }

    // Island springs (Dino Ruins)
    for (var s = 0; s < world.isl.springs.length; s++) {
      var sx = world.isl.springs[s];
      if (actor.vy >= 0 && Math.abs(actor.x - sx) < 30 && actor.y + actor.r >= 538 && actor.y + actor.r <= 572) {
        actor.vy = -760;
        actor.onGround = false;
        actor.jumpsLeft = 2;
        actor.flipT = 0.4;
        world.events.push({ type: 'jump', x: sx, y: 550, double: true, human: actor.isHuman });
      }
    }

    // Platform landing + carrying (moving platforms move actor.x directly, NEVER actor.walk!)
    var landed = false;
    var newBottom = actor.y + actor.r;
    if (actor.vy >= 0) {
      for (var p = 0; p < world.plats.length; p++) {
        var pl = world.plats[p];
        if (pl.sunkT > 0) continue;
        if (pl.oneWay && actor.dropT > 0) continue;
        if (actor.x + 13 > pl.x && actor.x - 13 < pl.x + pl.w) {
          if (prevBottom <= pl.y + 10 && newBottom >= pl.y) {
            var wasAir = !actor.onGround && actor.vy > 180;
            actor.y = pl.y - actor.r;
            actor.vy = 0;
            actor.onGround = true;
            actor.groundId = pl.id;
            actor.x = clamp(actor.x + pl.dx, 70, W - 70);
            landed = true;
            if (wasAir) world.events.push({ type: 'land', x: actor.x, y: pl.y, human: actor.isHuman });
            break;
          }
        }
      }
    }
    if (!landed) actor.onGround = false;

    // Water / Magma hazard check
    if (actor.y + actor.r > world.waterY + 6) {
      var centerDir = actor.x < W / 2 ? 1 : -1;
      actor.vy = -700;
      actor.vx = centerDir * 290;
      actor.y = world.waterY - actor.r - 4;
      actor.jumpsLeft = 2;
      hurtActor(world, actor, centerDir * 290, -700);
    }
  }

  function resolveBrawl(world) {
    var list = world.actors;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.state !== 'alive') continue;

      // Crates pickup / smash
      for (var c = world.crates.length - 1; c >= 0; c--) {
        var cr = world.crates[c];
        if (dist(a.x, a.y, cr.x, cr.y) < a.r + cr.r + 6) {
          world.crates.splice(c, 1);
          a.gadget = cr.gadget;
          a.gadgetT = GADGETS[cr.gadget].dur;
          a.score += 30;
          world.events.push({ type: 'crate', x: cr.x, y: cr.y, gadget: cr.gadget, name: GADGETS[cr.gadget].name, slot: a.slot, human: a.isHuman });
        }
      }

      // Coins pickup (stunned rivals cannot vacuum up coins knocked out of them!)
      if (a.stunT <= 0) {
        for (var k = world.coins.length - 1; k >= 0; k--) {
          var cn = world.coins[k];
          if (cn.grace > 0) continue;
          if (dist(a.x, a.y, cn.x, cn.y) < a.r + cn.r + 6) {
            world.coins.splice(k, 1);
            a.coins++;
            a.score += 10;
            world.events.push({ type: 'coin', x: cn.x, y: cn.y, slot: a.slot, human: a.isHuman });
          }
        }
      }

      // Belly-Dash instantly punts ticking bombs on the exact frame of contact!
      if (a.dashT > 0) {
        for (var bh = 0; bh < world.hazards.length; bh++) {
          var bhz = world.hazards[bh];
          if (bhz.kind === 'bomb' && bhz.owner !== a.slot && dist(a.x, a.y, bhz.x, bhz.y) < a.r + bhz.r + 16) {
            bhz.vx = a.facing * 640;
            bhz.vy = -340;
            bhz.fuse = Math.max(bhz.fuse, 0.75);
            bhz.owner = a.slot;
            a.score += 15;
            world.events.push({ type: 'bonk', x: bhz.x, y: bhz.y, attacker: a.slot, victim: -1, head: false });
          }
        }
      }

      // Actor vs Actor active brawl (Belly-Dash, Electric Shield Zap, Head-Bonk)
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        if (b.state !== 'alive') continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        var minD = a.r + b.r;
        if (d >= minD || d === 0) continue;

        var coopPair = world.duo && world.duoMode === 'coop' && a.isHuman && b.isHuman;
        if (coopPair) continue;

        var nx = dx / d;
        var overlap = (minD - d) * 0.5;
        a.x -= nx * overlap;
        b.x += nx * overlap;

        // Head-bonk check (falling onto rival's head)
        if (a.vy > 80 && a.y < b.y - 12 && b.stunT <= 0) {
          a.vy = -490; a.jumpsLeft = 2;
          b.vx = (dx >= 0 ? 1 : -1) * 260; b.vy = 120; b.stunT = 0.65;
          a.score += 30; a.bonks++;
          world.coins.push({ x: b.x, y: b.y - 20, vx: (dx >= 0 ? 90 : -90), vy: -240, r: 13, life: 9 });
          world.events.push({ type: 'bonk', x: b.x, y: b.y - 10, attacker: a.slot, victim: b.slot, head: true });
          continue;
        }
        if (b.vy > 80 && b.y < a.y - 12 && a.stunT <= 0) {
          b.vy = -490; b.jumpsLeft = 2;
          a.vx = (dx >= 0 ? -1 : 1) * 260; a.vy = 120; a.stunT = 0.65;
          b.score += 30; b.bonks++;
          world.coins.push({ x: a.x, y: a.y - 20, vx: (dx >= 0 ? -90 : 90), vy: -240, r: 13, life: 9 });
          world.events.push({ type: 'bonk', x: a.x, y: a.y - 10, attacker: b.slot, victim: a.slot, head: true });
          continue;
        }

        // Belly-Dash or Shield Zap! (Human hero wins mutual dash clashes against bots!)
        var aAttack = a.dashT > 0 || a.gadget === 'shield';
        var bAttack = b.dashT > 0 || b.gadget === 'shield';
        if (aAttack && (!bAttack || (a.isHuman && b.isBot)) && b.stunT <= 0) {
          var dirA = dx >= 0 ? 1 : -1;
          b.vx = dirA * 510; b.vy = -320; b.stunT = 0.55; b.onGround = false;
          a.vx = -dirA * 140; a.dashT = 0;
          a.score += 25; a.bonks++;
          world.coins.push({ x: b.x, y: b.y - 18, vx: -dirA * 95, vy: -260, r: 13, life: 9, grace: 0.22 });
          world.events.push({ type: 'bonk', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, attacker: a.slot, victim: b.slot, head: false });
        } else if (bAttack && !aAttack && a.stunT <= 0) {
          var dirB = dx >= 0 ? -1 : 1;
          a.vx = dirB * 510; a.vy = -320; a.stunT = 0.55; a.onGround = false;
          b.vx = -dirB * 140; b.dashT = 0;
          b.score += 25; b.bonks++;
          world.coins.push({ x: a.x, y: a.y - 18, vx: -dirB * 95, vy: -260, r: 13, life: 9, grace: 0.22 });
          world.events.push({ type: 'bonk', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, attacker: b.slot, victim: a.slot, head: false });
        } else {
          a.vx -= nx * 130;
          b.vx += nx * 130;
        }
      }
    }
  }

  function spawnDisasterBeat(world, kind) {
    var rng = world.rng, warn = world.diffCfg.warn, sp = world.speedMul;
    if (kind === 'meteors') {
      var tx = 210 + rng() * (W - 420);
      world.hazards.push({
        kind: 'meteor', x: tx + (rng() - 0.5) * 140, y: -40,
        tx: tx, ty: 556, vx: 0, vy: 560 * sp, warnT: warn, r: 26, active: false
      });
    } else if (kind === 'bombs') {
      var bx = 230 + rng() * (W - 460);
      world.hazards.push({
        kind: 'bomb', x: bx, y: -30, vx: (rng() - 0.5) * 140, vy: 80,
        r: 20, fuse: 2.5 / Math.sqrt(sp), owner: -1
      });
    } else if (kind === 'boulders') {
      var fromLeft = rng() < 0.5;
      world.hazards.push({
        kind: 'boulder', x: fromLeft ? 95 : W - 95, y: 520,
        vx: (fromLeft ? 1 : -1) * 310 * sp, vy: -120,
        warnT: warn, r: 30, rot: 0, bounces: 0
      });
    } else if (kind === 'ufo') {
      var hasUfo = world.hazards.some(function (h) { return h.kind === 'ufo'; });
      if (!hasUfo) {
        world.hazards.push({
          kind: 'ufo', x: 260 + rng() * (W - 520), y: 125,
          vx: (rng() < 0.5 ? 1 : -1) * 210 * sp,
          beamWarn: warn, beamOn: 0, cycle: 0.4, r: 44
        });
      }
    } else if (kind === 'shark') {
      var dir = rng() < 0.5 ? 1 : -1;
      world.hazards.push({
        kind: 'shark', x: dir > 0 ? 80 : W - 80, y: world.waterY + 10,
        vx: dir * 430 * sp, vy: -520, warnT: warn * 0.85, r: 28
      });
    } else if (kind === 'sinking') {
      var candidates = world.plats.filter(function (p) { return p.sunkT <= 0 && p.sinkWarn <= 0; });
      var safeDeckCount = world.plats.filter(function (p) { return !p.oneWay && p.sunkT <= 0 && p.sinkWarn <= 0; }).length;
      if (candidates.length > 2) {
        var pick = candidates[Math.floor(rng() * candidates.length)];
        if (pick.oneWay || safeDeckCount >= 2) {
          pick.sinkWarn = warn + 0.35;
        }
      }
    }
  }

  function stepDisasters(world, dt) {
    var entry = world.plan[world.round] || world.plan[0];
    var subs = entry.sub;
    var sp = world.speedMul;

    // Periodic crate & coin drops
    world.spawnTimers.crate -= dt;
    if (world.spawnTimers.crate <= 0 && world.crates.length < 2) {
      world.spawnTimers.crate = 4.2 + world.rng() * 1.6;
      var gId = GADGET_IDS[Math.floor(world.rng() * GADGET_IDS.length)];
      world.crates.push({
        x: 240 + world.rng() * (W - 480), y: -30, vy: 135, r: 22, gadget: gId
      });
    }
    world.spawnTimers.coin -= dt;
    if (world.spawnTimers.coin <= 0 && world.coins.length < 6) {
      world.spawnTimers.coin = 2.0 + world.rng() * 1.2;
      world.coins.push({
        x: 220 + world.rng() * (W - 440), y: -20, vx: 0, vy: 150, r: 13, life: 10
      });
    }

    // Shark surge water level & sinking wind
    var hasShark = subs.indexOf('shark') !== -1;
    var targetWater = hasShark ? (world.baseWaterY - 108 * (0.5 + 0.5 * Math.sin(world.t * 0.55))) : world.baseWaterY;
    world.waterY += (targetWater - world.waterY) * Math.min(1, dt * 2.6);

    var hasSink = subs.indexOf('sinking') !== -1;
    world.windX = hasSink ? Math.sin(world.t * 1.4) * 85 * sp : 0;

    // Spawn cadence for primary (and secondary in double-disaster)
    var rateA = subs.length > 1 ? 1.45 / sp : 1.05 / sp;
    world.spawnTimers.a -= dt;
    if (world.spawnTimers.a <= 0) {
      world.spawnTimers.a = rateA;
      spawnDisasterBeat(world, subs[0]);
    }
    if (subs.length > 1) {
      world.spawnTimers.b -= dt;
      if (world.spawnTimers.b <= 0) {
        world.spawnTimers.b = 1.65 / sp;
        spawnDisasterBeat(world, subs[1]);
      }
    }

    // Island Volcano Geysers
    for (var g = 0; g < world.geysers.length; g++) {
      var gy = world.geysers[g];
      if (gy.activeT > 0) {
        gy.activeT = Math.max(0, gy.activeT - dt);
        for (var ai = 0; ai < world.actors.length; ai++) {
          var ac = world.actors[ai];
          if (ac.state === 'alive' && Math.abs(ac.x - gy.x) < 28 && ac.y > 350) {
            hurtActor(world, ac, (ac.x >= gy.x ? 1 : -1) * 220, -560);
          }
        }
      } else if (gy.warnT > 0) {
        gy.warnT -= dt;
        if (gy.warnT <= 0) gy.activeT = 1.1;
      } else {
        gy.timer -= dt;
        if (gy.timer <= 0) {
          gy.warnT = world.diffCfg.warn;
          gy.timer = 4.5 / sp;
        }
      }
    }

    stepItems(world, dt);

    // Step hazards
    for (var i = world.hazards.length - 1; i >= 0; i--) {
      var h = world.hazards[i];
      if (h.kind === 'meteor') {
        if (h.warnT > 0) {
          h.warnT -= dt;
          if (h.warnT <= 0) {
            h.active = true;
            var flight = (h.ty - h.y) / h.vy;
            h.vx = flight > 0.05 ? (h.tx - h.x) / flight : 0;
          }
        } else {
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          for (var ma = 0; ma < world.actors.length; ma++) {
            var mAct = world.actors[ma];
            if (mAct.state === 'alive' && dist(h.x, h.y, mAct.x, mAct.y) < h.r + mAct.r) {
              hurtActor(world, mAct, (mAct.x >= h.x ? 1 : -1) * 320, -390);
              h.y = h.ty + 10;
            }
          }
          if (h.y >= h.ty) {
            world.events.push({ type: 'boom', x: h.x, y: h.ty, power: 0.7 });
            if (world.rng() < 0.45 && world.coins.length < 7) {
              world.coins.push({ x: clamp(h.x, 190, W - 190), y: h.ty - 24, vx: (world.rng() - 0.5) * 90, vy: -210, r: 13, life: 9 });
            }
            world.hazards.splice(i, 1);
          }
        }
      } else if (h.kind === 'bomb') {
        h.fuse -= dt;
        h.vy = Math.min(620, h.vy + 980 * dt);
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        for (var bp = 0; bp < world.plats.length; bp++) {
          var bpl = world.plats[bp];
          if (bpl.sunkT <= 0 && h.vy >= 0 && h.x > bpl.x && h.x < bpl.x + bpl.w && h.y + h.r >= bpl.y && h.y - h.r < bpl.y + 10) {
            h.y = bpl.y - h.r;
            h.vy = -Math.max(180, Math.abs(h.vy) * 0.55);
            h.vx *= 0.88;
            break;
          }
        }
        // Players can Belly-Dash bombs to punt them across the island!
        for (var ba = 0; ba < world.actors.length; ba++) {
          var bAct = world.actors[ba];
          if (bAct.state === 'alive' && bAct.dashT > 0 && dist(bAct.x, bAct.y, h.x, h.y) < bAct.r + h.r + 14) {
            h.vx = bAct.facing * 640;
            h.vy = -340;
            h.fuse = Math.max(h.fuse, 0.75);
            h.owner = bAct.slot;
            bAct.score += 15;
            world.events.push({ type: 'bonk', x: h.x, y: h.y, attacker: bAct.slot, victim: -1, head: false });
          }
        }
        if (h.fuse <= 0 || h.y > world.waterY + 20) {
          world.events.push({ type: 'boom', x: h.x, y: h.y, power: 0.9 });
          for (var ex = 0; ex < world.actors.length; ex++) {
            var eAct = world.actors[ex];
            if (eAct.state === 'alive' && dist(h.x, h.y, eAct.x, eAct.y) < 105) {
              var kdir = eAct.x >= h.x ? 1 : -1;
              hurtActor(world, eAct, kdir * 420, -430);
            }
          }
          world.hazards.splice(i, 1);
        }
      } else if (h.kind === 'boulder') {
        if (h.warnT > 0) {
          h.warnT -= dt;
        } else {
          h.vy = Math.min(720, h.vy + 1150 * dt);
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          h.rot += (h.vx > 0 ? 1 : -1) * dt * 7;
          for (var rp = 0; rp < world.plats.length; rp++) {
            var rpl = world.plats[rp];
            if (!rpl.oneWay && rpl.sunkT <= 0 && h.vy >= 0 && h.x > rpl.x - 10 && h.x < rpl.x + rpl.w + 10 && h.y + h.r >= rpl.y && h.y - h.r < rpl.y + 16) {
              h.y = rpl.y - h.r;
              h.vy = -270;
              break;
            }
          }
          for (var ra = 0; ra < world.actors.length; ra++) {
            var rAct = world.actors[ra];
            if (rAct.state === 'alive' && dist(h.x, h.y, rAct.x, rAct.y) < h.r + rAct.r - 4) {
              hurtActor(world, rAct, (h.vx >= 0 ? 1 : -1) * 380, -380);
            }
          }
          if (h.x < -60 || h.x > W + 60 || h.y > H + 80) world.hazards.splice(i, 1);
        }
      } else if (h.kind === 'ufo') {
        h.x += h.vx * dt;
        if (h.x < 220 || h.x > W - 220) h.vx = -h.vx;
        if (h.beamOn > 0) {
          h.beamOn -= dt;
          for (var ua = 0; ua < world.actors.length; ua++) {
            var uAct = world.actors[ua];
            if (uAct.state === 'alive' && Math.abs(uAct.x - h.x) < 46 && uAct.y > h.y) {
              hurtActor(world, uAct, (uAct.x >= h.x ? 1 : -1) * 260, -480);
            }
          }
          if (h.beamOn <= 0) h.cycle = 1.15;
        } else if (h.beamWarn > 0) {
          h.beamWarn -= dt;
          if (h.beamWarn <= 0) h.beamOn = 1.25;
        } else {
          h.cycle -= dt;
          if (h.cycle <= 0) h.beamWarn = world.diffCfg.warn;
        }
      } else if (h.kind === 'shark') {
        if (h.warnT > 0) {
          h.warnT -= dt;
        } else {
          h.vy += 680 * dt;
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          for (var sa = 0; sa < world.actors.length; sa++) {
            var sAct = world.actors[sa];
            if (sAct.state === 'alive' && dist(h.x, h.y, sAct.x, sAct.y) < h.r + sAct.r) {
              hurtActor(world, sAct, (h.vx >= 0 ? 1 : -1) * 360, -440);
            }
          }
          if (h.x < -80 || h.x > W + 80 || h.y > H + 90) world.hazards.splice(i, 1);
        }
      }
    }
  }

  function stepItems(world, dt) {
    for (var c = world.crates.length - 1; c >= 0; c--) {
      var cr = world.crates[c];
      cr.y += cr.vy * dt;
      for (var cp = 0; cp < world.plats.length; cp++) {
        var pl = world.plats[cp];
        if (pl.sunkT <= 0 && cr.x > pl.x && cr.x < pl.x + pl.w && cr.y + cr.r >= pl.y && cr.y - cr.r < pl.y) {
          cr.y = pl.y - cr.r; cr.vy = 0; break;
        }
      }
      if (cr.y > world.waterY + 30) world.crates.splice(c, 1);
    }
    for (var k = world.coins.length - 1; k >= 0; k--) {
      var cn = world.coins[k];
      if (cn.grace > 0) cn.grace = Math.max(0, cn.grace - dt);
      cn.life -= dt;
      if (cn.life <= 0 || cn.y > world.waterY + 25) { world.coins.splice(k, 1); continue; }
      cn.vy = Math.min(480, cn.vy + 780 * dt);
      cn.x = clamp(cn.x + cn.vx * dt, 90, W - 90);
      cn.y += cn.vy * dt;
      for (var kp = 0; kp < world.plats.length; kp++) {
        var kpl = world.plats[kp];
        if (kpl.sunkT <= 0 && cn.vy >= 0 && cn.x > kpl.x && cn.x < kpl.x + kpl.w && cn.y + cn.r >= kpl.y && cn.y - cn.r < kpl.y + 8) {
          cn.y = kpl.y - cn.r; cn.vy = -cn.vy * 0.35; cn.vx *= 0.7;
          if (Math.abs(cn.vy) < 40) cn.vy = 0;
          break;
        }
      }
    }
    for (var oi = world.orbs.length - 1; oi >= 0; oi--) {
      world.orbs[oi].bob += dt * 3.5;
      world.orbs[oi].life -= dt;
      if (world.orbs[oi].life <= 0) world.orbs.splice(oi, 1);
    }
  }

  function stepPlatforms(world, dt) {
    for (var i = 0; i < world.plats.length; i++) {
      var pl = world.plats[i];
      var prevX = pl.x;
      if (pl.moveAmp) {
        pl.x = pl.baseX + Math.sin(world.t * pl.moveSpd + pl.phase) * pl.moveAmp;
      }
      pl.dx = pl.x - prevX;
      if (pl.sinkWarn > 0) {
        pl.sinkWarn -= dt;
        if (pl.sinkWarn <= 0) pl.sunkT = 3.0;
      } else if (pl.sunkT > 0) {
        pl.sunkT = Math.max(0, pl.sunkT - dt);
      }
    }
  }

  function planCoach(world, actor, skill) {
    skill = skill == null ? 1.0 : skill;
    var out = { moveX: 0, up: false, down: false, jump: false, jumpPressed: false, dash: false, dashPressed: false };
    if (!actor || actor.state === 'out') return out;

    if (actor.state === 'drone') {
      var target = world.orbs[0] || null;
      var bestD = 1e9;
      for (var oi = 0; oi < world.orbs.length; oi++) {
        var od = dist(actor.x, actor.y, world.orbs[oi].x, world.orbs[oi].y);
        if (od < bestD) { bestD = od; target = world.orbs[oi]; }
      }
      if (target) {
        out.moveX = target.x > actor.x + 10 ? 1 : target.x < actor.x - 10 ? -1 : 0;
        out.up = target.y < actor.y - 10;
        out.jump = out.up;
        out.down = target.y > actor.y + 10;
        out.dash = bestD > 140;
      }
      return out;
    }

    // Evaluate danger around actor
    var dangerX = null, needHigh = world.waterY < 585, jumpNow = false, dashNow = false;
    for (var i = 0; i < world.hazards.length; i++) {
      var h = world.hazards[i];
      if (h.kind === 'meteor' && Math.abs(actor.x - h.tx) < 85) dangerX = h.tx;
      else if (h.kind === 'ufo' && (h.beamWarn > 0 || h.beamOn > 0) && Math.abs(actor.x - h.x) < 75) dangerX = h.x;
      else if (h.kind === 'bomb' && Math.abs(actor.x - h.x) < 115 && Math.abs(actor.y - h.y) < 95) {
        if (skill > 0.65 && actor.dashCd <= 0 && Math.abs(actor.x - h.x) < 68 && h.fuse > 0.45) {
          out.moveX = h.x >= actor.x ? 1 : -1;
          dashNow = true;
        } else dangerX = h.x;
      } else if (h.kind === 'boulder' && h.warnT <= 0 && Math.abs(actor.x - h.x) < 120 && Math.abs(actor.y - h.y) < 70) {
        if ((h.vx > 0 && h.x < actor.x) || (h.vx < 0 && h.x > actor.x)) jumpNow = true;
      } else if (h.kind === 'shark' && h.warnT <= 0 && Math.abs(actor.x - h.x) < 110 && actor.y > 460) {
        jumpNow = true; needHigh = true;
      }
    }

    for (var g = 0; g < world.geysers.length; g++) {
      var gy = world.geysers[g];
      if ((gy.warnT > 0 || gy.activeT > 0) && Math.abs(actor.x - gy.x) < 62) dangerX = gy.x;
    }

    // Check if standing on a warning/sunk platform
    for (var p = 0; p < world.plats.length; p++) {
      var pl = world.plats[p];
      if ((pl.sinkWarn > 0 || pl.sunkT > 0) && actor.x > pl.x - 10 && actor.x < pl.x + pl.w + 10 && Math.abs(actor.y + actor.r - pl.y) < 28) {
        dangerX = pl.x + pl.w / 2;
        jumpNow = true;
      }
    }

    var goalX = 640;
    if (dangerX != null) {
      goalX = dangerX < 640 ? Math.min(980, dangerX + 210) : Math.max(300, dangerX - 210);
    } else if (needHigh) {
      goalX = actor.x < 640 ? 315 : 960;
      if (actor.y > 440) jumpNow = true;
    } else {
      // Seek nearest crate or coin
      var bestItem = null, itemDist = 360;
      for (var c = 0; c < world.crates.length; c++) {
        var cd = Math.abs(world.crates[c].x - actor.x);
        if (cd < itemDist) { itemDist = cd; bestItem = world.crates[c]; }
      }
      if (!bestItem) {
        for (var k = 0; k < world.coins.length; k++) {
          var kd = Math.abs(world.coins[k].x - actor.x);
          if (kd < itemDist) { itemDist = kd; bestItem = world.coins[k]; }
        }
      }
      if (bestItem) {
        goalX = bestItem.x;
        if (bestItem.y < actor.y - 55) jumpNow = true;
      } else {
        goalX = 640 + Math.sin(world.t * 1.3 + actor.slot * 1.7) * 230;
      }

      // Active bot brawl: dash into rival when close!
      if (skill > 0.55 && actor.dashCd <= 0) {
        for (var r = 0; r < world.actors.length; r++) {
          var rv = world.actors[r];
          if (rv !== actor && rv.state === 'alive' && Math.abs(rv.y - actor.y) < 34 && Math.abs(rv.x - actor.x) < 88) {
            if (!(world.duo && world.duoMode === 'coop' && actor.isHuman && rv.isHuman)) {
              goalX = rv.x;
              dashNow = true;
              break;
            }
          }
        }
      }
    }

    if (actor.x < 225) { goalX = 520; if (!actor.onGround) jumpNow = true; }
    if (actor.x > W - 225) { goalX = W - 520; if (!actor.onGround) jumpNow = true; }
    if (actor.y > world.waterY - 75) jumpNow = true;

    if (!dashNow) {
      if (goalX > actor.x + 18) out.moveX = 1;
      else if (goalX < actor.x - 18) out.moveX = -1;
    }
    if (actor.gadget === 'jetpack' && (needHigh || actor.y > 430)) { out.up = true; out.jump = true; }
    if (jumpNow && (actor.onGround || (actor.vy > 40 && actor.jumpsLeft > 0))) {
      out.jump = true;
      out.jumpPressed = true;
    }
    if (dashNow) {
      out.dash = true;
      out.dashPressed = true;
    }
    return out;
  }

  function finishRound(world) {
    var humanSurvived = false;
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (a.state === 'alive') {
        a.roundsWon++;
        a.score += 60 + a.hearts * 15;
        a.coins += 2;
        if (a.isHuman) humanSurvived = true;
      }
    }
    world.events.push({ type: 'roundClear', round: world.round, survivedHumans: humanSurvived });
    if (world.round + 1 >= world.rounds) {
      finishMatch(world);
    } else {
      world.phase = 'inter';
      world.t = 0;
    }
  }

  function finishMatch(world) {
    world.phase = 'done';
    world.t = 0;
    var bestSlot = 0, bestScore = -1;
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (a.score > bestScore) { bestScore = a.score; bestSlot = a.slot; }
    }
    world.winnerSlot = bestSlot;
    var p1 = world.actors[0];
    world.p1Score = p1.score;

    var humanRounds = p1.roundsWon;
    if (world.duo && world.duoMode === 'coop' && world.actors[1] && world.actors[1].isHuman) {
      humanRounds = Math.max(p1.roundsWon, world.actors[1].roundsWon);
    }
    var humanTop = world.actors[bestSlot] && world.actors[bestSlot].isHuman;
    world.won = humanRounds >= 2 || (humanRounds >= 1 && humanTop);
    world.stars = !world.won ? 0 : (humanRounds >= 3 ? 3 : humanRounds >= 2 ? 2 : 1);
    world.events.push({ type: 'matchEnd', won: world.won, stars: world.stars, p1Score: world.p1Score, winnerSlot: bestSlot });
  }

  function stepWorld(world, humanInputs, dt) {
    if (world.phase === 'done') return world;
    dt = clamp(dt || 1 / 60, 0.001, 0.05);
    world.frames++;
    world.t += dt;

    if (world.phase === 'inter') {
      if (world.t >= INTER_TIME) setupRound(world, world.round + 1, false);
      return world;
    }

    stepPlatforms(world, dt);

    if (world.phase === 'card') {
      stepItems(world, dt);
      if (world.t >= CARD_TIME) {
        world.phase = 'action';
        world.t = 0;
      }
    } else if (world.phase === 'action') {
      stepDisasters(world, dt);
    }

    // Step all actors (players CAN move, jump, and dash immediately even during 'card'!)
    for (var i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      var inp;
      if (a.isHuman) {
        inp = (humanInputs && humanInputs[a.slot]) || null;
      } else {
        a.aiTimer -= dt;
        if (a.aiTimer <= 0) {
          a.aiTimer = 0.08 + (1 - world.diffCfg.botSkill) * 0.14;
          a.lastAi = planCoach(world, a, world.diffCfg.botSkill);
        } else if (a.lastAi) {
          a.lastAi.jumpPressed = false;
          a.lastAi.dashPressed = false;
        }
        inp = a.lastAi || planCoach(world, a, world.diffCfg.botSkill);
      }
      stepActor(world, a, inp, dt);
    }

    resolveBrawl(world);

    if (world.demo) {
      if (world.t >= 16) setupRound(world, (world.round + 1) % ROUNDS, false);
      return world;
    }

    // ZERO BORING GHOST WAIT: if 0 humans are alive or piloting a rescue drone, end round immediately!
    var activeHumans = 0;
    for (var h = 0; h < world.actors.length; h++) {
      if (world.actors[h].isHuman && (world.actors[h].state === 'alive' || world.actors[h].state === 'drone')) {
        activeHumans++;
      }
    }
    if (activeHumans === 0) {
      finishRound(world);
      return world;
    }

    if (world.phase === 'action' && world.t >= ACTION_TIME) {
      finishRound(world);
    }
    return world;
  }

  var CIEngine = {
    W: W, H: H,
    CARD_TIME: CARD_TIME, ACTION_TIME: ACTION_TIME, INTER_TIME: INTER_TIME, ROUNDS: ROUNDS,
    MOVE_SPEED: MOVE_SPEED, JUMP_VY: JUMP_VY, DJUMP_VY: DJUMP_VY, DASH_SPEED: DASH_SPEED,
    DIFFICULTIES: DIFFICULTIES,
    ISLANDS: ISLANDS,
    DISASTERS: DISASTERS,
    BASE_DISASTERS: BASE_DISASTERS,
    GADGETS: GADGETS,
    BOTS: BOTS,
    SHOP: SHOP,
    createWorld: createWorld,
    stepWorld: stepWorld,
    planCoach: planCoach,
    currentDisasterInfo: currentDisasterInfo,
    hurtActor: hurtActor,
    spawnDisasterBeat: spawnDisasterBeat
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CIEngine;
  if (typeof window !== 'undefined') window.CIEngine = CIEngine;
})();

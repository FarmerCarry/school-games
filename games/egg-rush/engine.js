/* Egg Rush simulation: world, guardians, economy and saves.
   No drawing and no Kit, so Node tests run the same step the game does. */
(function (ER) {
  'use strict';

  const H = 15, BASE = 14, BW = 22, SAFE = 11.15;
  const GATES = [0, 6, 9, 13, 18, 24, 32];
  const BASE_C = [4, 12, 28, 60, 130, 280, 600];
  const RAR_M = [1, 1, 3, 8, 25, 80];
  const RAR_I = [0, 0, 1, 2, 3, 4];
  const VAR_M = [1, 2, 5, 10];
  const WEIGHT = [0.95, 0.95, 0.9, 0.82, 0.75, 0.7];
  const NOISE = [0.22, 0.25, 0.45, 0.62, 0.82, 1];
  const HATCH = [3, 3, 6, 10, 16, 25];
  const RAR_NAME = ['عادي', 'نادر', 'ملحمي', 'أسطوري', 'خرافي'];
  const BIOMES = [
    { name: 'المرج', kind: 'hen', sleep: 6, stir: 1, watch: 2.2, cone: 3.35, sweep: 2.15, chase: 4.55, hear: 6.2 },
    { name: 'الشاطئ', kind: 'crab', sleep: 4.2, stir: 0.7, watch: 1.7, cone: 2.7, sweep: 1.5, chase: 6.7, hear: 6, patrol: 1 },
    { name: 'الثلج', kind: 'penguin', sleep: 4.3, stir: 0.7, watch: 1.6, cone: 2.9, sweep: 1.35, chase: 8.4, hear: 6.2, ice: 1 },
    { name: 'الصحراء', kind: 'camel', sleep: 5, stir: 0.85, watch: 2.3, cone: 6.4, sweep: 0.42, chase: 10.6, hear: 7.5 },
    { name: 'بركان الحلوى', kind: 'salamander', sleep: 3.5, stir: 0.65, watch: 1.55, cone: 2.8, sweep: 1.45, chase: 13.5, hear: 6.4, puddle: 1 },
    { name: 'الغيوم', kind: 'owl', sleep: 3.8, stir: 0.7, watch: 2.5, cone: 3.5, sweep: 0.85, chase: 17.5, hear: 7, spin: 1 },
    { name: 'القمر', kind: 'robot', sleep: 3.3, stir: 0.6, watch: 1.45, cone: 3.1, sweep: 1.25, chase: 21.5, hear: 7, hop: 1 }
  ];
  const PETS = [
    'فرخ', 'بطة', 'أرنب', 'حمل', 'ضفدع', 'قنفذ',
    'سلحفاة', 'نجم', 'دلفين', 'ببغاء', 'أخطبوط', 'سمكة',
    'بطريق', 'فقمة', 'دب', 'ثعلب', 'بومة', 'رنة',
    'جمل صغير', 'أفعى', 'عقرب', 'فنك', 'سحلية', 'صقر',
    'دونات', 'مارشميلو', 'كب كيك', 'مصاصة', 'غزل بنات', 'جيلي',
    'عصفور', 'فراشة', 'نحلة', 'هرة', 'تنين', 'قوس',
    'روبوت', 'صاروخ', 'نيزك', 'فضائي', 'كوكب', 'رائد'
  ];

  function mulberry(a) {
    a |= 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function speedOf(xp) {
    const raw = 4 + 0.35 * Math.sqrt(Math.max(0, xp));
    if (raw <= 34) return raw;
    return 34 + (raw - 34) / (1 + (raw - 34) * 0.2);
  }
  function petRate(b, s, v) { return BASE_C[b] * RAR_M[s] * VAR_M[v || 0]; }
  function hatchDur(s, lv) { return HATCH[s] * Math.pow(0.8, lv || 0); }
  function fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function biomesDone(seen) {
    let n = 0;
    for (let b = 0; b < 7; b++) {
      let ok = true;
      for (let s = 0; s < 6; s++) if (!seen[b * 6 + s]) ok = false;
      if (ok) n++;
    }
    return n;
  }
  function coinMult(rebirths, seen) { return Math.pow(1.5, rebirths || 0) * (1 + 0.1 * biomesDone(seen)); }
  function maxOpen(xp) {
    const sp = speedOf(xp);
    let m = 0;
    for (let i = 1; i < 7; i++) if (sp + 1e-6 >= GATES[i]) m = i;
    return m;
  }
  function ev(w, e) { w.ev.push(e); if (w.ev.length > 48) w.ev.shift(); }
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function inCone(g, x, y) {
    const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy);
    if (d > g.cone || d < 0.05) return false;
    return Math.abs(angDiff(Math.atan2(dy, dx), g.ang)) < g.sweep * 0.5;
  }

  function makePlayer(id, x, y, facing) {
    return {
      id: id, x: x, y: y, vx: 0, vy: 0, facing: facing || 1, r: 0.42,
      egg: null, bubble: 0, immune: 0, dashT: 0, dashCd: 0, dvx: 0, dvy: 0,
      knock: 0, mill: -1, millArm: 0, gadI: 0, goal: null, step: 0, coins: 0, puddle: 0
    };
  }

  function addNest(w, biome, x, y, species) {
    w.nests.push({ id: w.nests.length, biome: biome, x: x, y: y, species: species, egg: true, respawn: 0, daily: false, baseSpecies: species });
  }
  function addGuard(w, biome, x, y, face) {
    const b = BIOMES[biome];
    const g = {
      biome: biome, kind: b.kind, x: x, y: y, hx: x, hy: y, r: 0.62,
      state: 'sleep', timer: b.sleep * (0.45 + w.rng() * 0.55), ang: face || Math.PI,
      cone: b.cone, sweep: b.sweep, sleep: b.sleep, stir: b.stir, watch: b.watch,
      chase: b.chase, hear: b.hear, facing: (face || Math.PI) > 1 ? -1 : 1,
      patrol: !!b.patrol, ice: !!b.ice, puddle: !!b.puddle, spin: !!b.spin, hop: !!b.hop,
      pmin: x - 2.4, pmax: x + 2.4, meter: 0, hopT: w.rng() * 1.1, air: false,
      script: false, boost: 0, pudT: 0, target: 0
    };
    w.guards.push(g);
    return g;
  }

  function build1p(w) {
    w.w = BASE + 7 * BW;
    w.safeL = SAFE; w.safeR = 999;
    w.players = [makePlayer(0, 6.2, 8, 1)];
    addNest(w, 0, 17.6, 8, 0);
    addNest(w, 0, 24.4, 5.1, 1);
    addNest(w, 0, 30.6, 11.1, 2);
    addNest(w, 0, 33.4, 6.4, 3);
    addGuard(w, 0, 28.4, 8.1, Math.PI);
    for (let i = 1; i < 7; i++) {
      const x0 = BASE + i * BW;
      const specs = [i % 3, (i + 1) % 4, Math.min(5, 2 + (i % 3)), Math.min(5, 3 + (i % 2))];
      addNest(w, i, x0 + 4.6, 5.4, specs[0]);
      addNest(w, i, x0 + 8.8, 10.6, specs[1]);
      addNest(w, i, x0 + 14.2, 6.2, specs[2]);
      addNest(w, i, x0 + 18.6, 11.2, specs[3]);
      if (i >= 3) addNest(w, i, x0 + 19.4, 4.4, 5);
      const g1 = addGuard(w, i, x0 + 7.2, 8.2, Math.PI);
      const g2 = addGuard(w, i, x0 + 15.5, 7.2, Math.PI);
      if (BIOMES[i].patrol) { g1.pmin = x0 + 4; g1.pmax = x0 + 12; g2.pmin = x0 + 12; g2.pmax = x0 + 20; }
    }
    w.mills = [
      { x: 2.3, y: 12.7, mult: 1, side: 0 },
      { x: 5.2, y: 12.7, mult: 2, side: 0 },
      { x: 8.1, y: 12.7, mult: 5, side: 0 }
    ];
    w.shop = { x: 12.2, y: 6.3 };
    w.incs = [null];
    layoutPads(w);
  }
  function build2p(w) {
    w.w = 52; w.safeL = 8.2; w.safeR = 43.8;
    w.players = [makePlayer(0, 4.2, 8, 1), makePlayer(1, 47.8, 8, -1)];
    const spots = [[15, 6, 0, 0], [20, 10, 0, 1], [26, 7.2, 1, 2], [26, 11, 1, 0], [32, 5.5, 2, 1], [37, 9.5, 2, 3]];
    for (const s of spots) addNest(w, s[2], s[0], s[1], s[3]);
    addGuard(w, 0, 18.5, 8, 0);
    addGuard(w, 1, 26, 8.6, Math.PI);
    const c = addGuard(w, 1, 30, 6.2, 0);
    c.pmin = 24; c.pmax = 34;
    addGuard(w, 2, 35.5, 8, Math.PI);
    w.mills = [{ x: 3.2, y: 12.4, mult: 1, side: 0 }, { x: 48.8, y: 12.4, mult: 1, side: 1 }];
    w.shop = null;
    w.incs = [];
    w.pads = [];
  }
  function layoutPads(w) {
    w.pads = [];
    for (let i = 0; i < 16; i++) {
      const col = i % 8, row = (i / 8) | 0;
      w.pads.push({ x: 1.15 + col * 1.42, y: 2.35 + row * 2.15, pile: 0 });
    }
  }

  function fresh(opts) {
    const seed = opts.seed == null ? 1 : opts.seed;
    const w = {
      mode: opts.mode === '2p' ? '2p' : '1p',
      seed: seed, rng: mulberry(seed + 17),
      t: 0, now: opts.now || 0, date: opts.date || 0,
      coins: 0, speedXP: 0, pets: [], pens: 4, incN: 1, hatchLv: 0, millLv: 1, shoes: 0,
      gadgets: [], seen: Array(42).fill(0), giant: Array(42).fill(0), gold: Array(42).fill(0),
      rebirths: 0, bought: 0, banks: 0, taught: false, foxT: 0, fox: null, stolen: null, pending: null,
      settings: { autoGrab: false, clickMove: false, fox: true },
      daily: { date: opts.date || 0, id: -1, claimed: false },
      nests: [], guards: [], flights: [], items: [], puddles: [], ev: [],
      players: [], mills: [], pads: [], incs: [], shop: null,
      over: false, matchT: 240, frenzy: false, winner: -1,
      tut: 'egg', baseTheme: 0, carry: null
    };
    if (w.mode === '2p') build2p(w); else build1p(w);
    return w;
  }

  function validPet(p) {
    return p && (p.b | 0) === p.b && p.b >= 0 && p.b < 7 && (p.s | 0) === p.s && p.s >= 0 && p.s < 6 &&
      (p.v | 0) === p.v && p.v >= 0 && p.v < 4;
  }
  function readSave(raw) {
    if (raw == null) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) return false;
    if (raw.v !== 1) return false;
    if (!Number.isFinite(raw.coins) || raw.coins < 0 || raw.coins > 1e15) return false;
    if (!Number.isFinite(raw.speedXP) || raw.speedXP < 0 || raw.speedXP > 1e12) return false;
    if (!Array.isArray(raw.pets) || raw.pets.length > 16) return false;
    for (const p of raw.pets) {
      if (!validPet(p) || !Number.isFinite(p.pad) || p.pad < -1 || p.pad >= 16) return false;
    }
    const pens = raw.pens | 0;
    if (pens < 4 || pens > 16 || pens !== raw.pens) return false;
    if ([1, 2, 3, 4].indexOf(raw.incN) < 0) return false;
    if (!Array.isArray(raw.incs) || raw.incs.length !== raw.incN) return false;
    for (const s of raw.incs) {
      if (s == null) continue;
      if ((s.b | 0) !== s.b || s.b < 0 || s.b > 6 || (s.s | 0) !== s.s || s.s < 0 || s.s > 5 || !Number.isFinite(s.end)) return false;
    }
    if ([0, 1, 2, 3].indexOf(raw.hatchLv) < 0) return false;
    if ([1, 2, 3].indexOf(raw.millLv) < 0) return false;
    if (!Number.isFinite(raw.shoes) || raw.shoes < 0 || raw.shoes > 80 || (raw.shoes | 0) !== raw.shoes) return false;
    if (!Array.isArray(raw.gadgets) || raw.gadgets.length > 3) return false;
    for (const g of raw.gadgets) if (g !== 'banana' && g !== 'decoy' && g !== 'bubble') return false;
    for (const key of ['seen', 'giant', 'gold']) {
      if (!Array.isArray(raw[key]) || raw[key].length !== 42) return false;
      for (const n of raw[key]) if (n !== 0 && n !== 1) return false;
    }
    if (!Number.isFinite(raw.rebirths) || raw.rebirths < 0 || raw.rebirths > 40 || (raw.rebirths | 0) !== raw.rebirths) return false;
    if (raw.stolen != null && !validPet(raw.stolen)) return false;
    if (raw.pending != null && !validPet(raw.pending)) return false;
    if (!raw.settings || typeof raw.settings !== 'object') return false;
    return true;
  }

  function applySave(w, raw) {
    w.coins = raw.coins;
    w.speedXP = raw.speedXP;
    w.pens = raw.pens;
    w.incN = raw.incN;
    w.hatchLv = raw.hatchLv;
    w.millLv = raw.millLv;
    w.shoes = raw.shoes;
    w.rebirths = raw.rebirths;
    w.baseTheme = raw.rebirths % 4;
    w.gadgets = raw.gadgets.slice();
    w.seen = raw.seen.slice();
    w.giant = raw.giant.slice();
    w.gold = raw.gold.slice();
    w.bought = raw.bought | 0;
    w.banks = raw.banks | 0;
    w.taught = !!raw.taught;
    w.foxT = Number.isFinite(raw.foxT) ? clamp(raw.foxT, 0, 240) : 0;
    w.settings = {
      autoGrab: !!raw.settings.autoGrab,
      clickMove: !!raw.settings.clickMove,
      fox: raw.settings.fox !== false
    };
    w.incs = raw.incs.map(s => s ? { b: s.b, s: s.s, v: 0, end: s.end, nest: -1, daily: !!s.daily, force: s.force || 0 } : null);
    w.pets = raw.pets.map(p => ({ b: p.b, s: p.s, v: p.v, pad: p.pad | 0, rate: petRate(p.b, p.s, p.v) }));
    w.pending = raw.pending ? { b: raw.pending.b, s: raw.pending.s, v: raw.pending.v, pad: -1, rate: petRate(raw.pending.b, raw.pending.s, raw.pending.v) } : null;
    w.stolen = raw.stolen ? { b: raw.stolen.b, s: raw.stolen.s, v: raw.stolen.v, den: clamp(raw.stolen.den | 0, 0, 6) } : null;
    if (raw.carry && validPet(raw.carry)) {
      w.players[0].egg = { nest: -1, biome: raw.carry.b, species: raw.carry.s, rarity: raw.carry.s, daily: false };
    }
    w.daily.date = raw.dailyDate | 0;
    w.daily.claimed = !!raw.dailyClaimed;
    w.daily.id = Number.isFinite(raw.dailyId) ? raw.dailyId | 0 : -1;
    if (w.tutDoneSave || raw.settings.tut) w.tut = 'done';
    if (w.taught) w.tut = w.tut === 'egg' ? 'done' : w.tut;
    layoutPads(w);
  }

  function awayCoins(raw, now) {
    if (!raw || raw === false || !Number.isFinite(raw.awayAt) || !Number.isFinite(now)) return 0;
    let dt = (now - raw.awayAt) / 1000;
    if (!(dt > 0)) return 0;
    dt = Math.min(dt, 30 * 60);
    let rate = 0;
    if (Array.isArray(raw.pets)) for (const p of raw.pets) if (validPet(p) && p.pad >= 0) rate += petRate(p.b, p.s, p.v);
    const mult = coinMult(raw.rebirths | 0, Array.isArray(raw.seen) ? raw.seen : []);
    return Math.floor(rate * mult * dt);
  }

  function pickDaily(w) {
    const maxB = maxOpen(w.speedXP);
    const unseen = [];
    for (let id = 0; id < (maxB + 1) * 6; id++) if (!w.seen[id]) unseen.push(id);
    let pool = unseen;
    if (!pool.length) {
      pool = [];
      for (let id = 0; id < (maxB + 1) * 6; id++) if (!w.gold[id] || !w.giant[id]) pool.push(id);
    }
    if (!pool.length) return -1;
    let h = (w.date * 1664525 + 1013904223) >>> 0;
    return pool[h % pool.length];
  }
  function refreshDaily(w) {
    if (w.mode !== '1p') return;
    if (w.daily.date !== w.date) { w.daily.date = w.date; w.daily.claimed = false; w.daily.id = -1; }
    for (const n of w.nests) n.daily = false;
    if (w.daily.claimed) return;
    if (w.daily.id < 0 || w.daily.id >= 42) w.daily.id = pickDaily(w);
    const id = w.daily.id;
    if (id < 0) return;
    const b = (id / 6) | 0, s = id % 6;
    if (b > maxOpen(w.speedXP)) { w.daily.id = pickDaily(w); return refreshDaily(w); }
    let nest = null;
    for (const n of w.nests) if (n.biome === b && n.id !== 0) { nest = n; break; }
    if (!nest) return;
    if (nestBusy(w, nest.id)) return;
    nest.daily = true;
    nest.species = s;
    nest.egg = true;
  }
  function nestBusy(w, id) {
    for (const p of w.players) if (p.egg && p.egg.nest === id) return true;
    for (const f of w.flights) if (f.nest === id) return true;
    return false;
  }

  function create(opts) {
    opts = opts || {};
    const w = fresh(opts);
    let notice = '', away = 0;
    const raw = opts.save;
    if (raw != null) {
      const ok = readSave(raw);
      if (!ok) notice = 'تعذّر قراءة الحفظ، بدأنا من جديد.';
      else {
        applySave(w, raw);
        away = awayCoins(raw, w.now);
        if (away > 0) {
          w.coins += away;
          notice = 'أثناء غيابك ربحت حيواناتك ' + fmt(away) + ' قطعة';
        }
      }
    }
    if (opts.tutorial === false) { w.tut = 'done'; w.taught = true; }
    refreshDaily(w);
    w.notice = notice;
    w.away = away;
    syncTut(w);
    noteOpen(w, w.players[0].x, w.players[0].y);
    return w;
  }

  function price(w, id) {
    if (id === 'shoes') return Math.round(40 * Math.pow(1.7, w.shoes));
    if (id === 'mill') return w.millLv >= 3 ? 0 : w.millLv === 1 ? 150 : 480;
    if (id === 'pen') return w.pens >= 16 ? 0 : 60 + 45 * (w.pens - 4);
    if (id === 'inc') return w.incN >= 4 ? 0 : 120 * w.incN;
    if (id === 'hatch') return w.hatchLv >= 3 ? 0 : 80 * (w.hatchLv + 1);
    if (id === 'banana') return 25;
    if (id === 'decoy') return 35;
    if (id === 'bubble') return 45;
    if (id === 'rebirth') return speedOf(w.speedXP) + 1e-6 >= GATES[6] ? 1 : 0;
    return 0;
  }
  function buy(w, id) {
    if (w.mode !== '1p' || w.over) return false;
    if (id === 'rebirth') return rebirth(w);
    const c = price(w, id);
    if (!c || w.coins < c) return false;
    const gad = id === 'banana' || id === 'decoy' || id === 'bubble';
    if (gad && w.gadgets.length >= 3) return false;
    w.coins -= c;
    if (id === 'shoes') { w.shoes++; w.speedXP += 40; noteOpen(w, w.players[0].x, w.players[0].y); }
    else if (id === 'mill') w.millLv++;
    else if (id === 'pen') w.pens++;
    else if (id === 'inc') { w.incN++; w.incs.push(null); }
    else if (id === 'hatch') w.hatchLv++;
    else w.gadgets.push(id);
    w.bought++;
    ev(w, { t: 'buy', id: id });
    refreshDaily(w);
    syncTut(w);
    return true;
  }
  function rebirth(w) {
    if (speedOf(w.speedXP) + 1e-6 < GATES[6]) return false;
    w.rebirths++;
    w.baseTheme = w.rebirths % 4;
    w.coins = 0; w.speedXP = 0; w.pets = []; w.pens = 4; w.incN = 1; w.incs = [null];
    w.hatchLv = 0; w.millLv = 1; w.shoes = 0; w.gadgets = [];
    w.pending = null; w.stolen = null; w.fox = null; w.foxT = 0;
    for (const p of w.pads) p.pile = 0;
    layoutPads(w);
    w.players[0].x = 6.2; w.players[0].y = 8; w.players[0].egg = null; w.players[0].vx = w.players[0].vy = 0;
    ev(w, { t: 'rebirth', n: w.rebirths });
    return true;
  }

  function freePad(w) {
    const used = {};
    for (const p of w.pets) if (p.pad >= 0) used[p.pad] = 1;
    for (let i = 0; i < w.pens; i++) if (!used[i]) return i;
    return -1;
  }
  function collectPad(w, i) {
    const pad = w.pads[i];
    if (!pad || i >= w.pens || pad.pile < 1) return 0;
    const n = Math.floor(pad.pile);
    pad.pile -= n;
    w.coins += n;
    w.didCollect = 1;
    ev(w, { t: 'collect', n: n, i: i, x: pad.x, y: pad.y });
    syncTut(w);
    return n;
  }
  function release(w, pad) {
    const i = w.pets.findIndex(p => p.pad === pad);
    if (i < 0) return 0;
    const pet = w.pets[i];
    const refund = Math.max(8, Math.round(pet.rate * 2));
    w.pets.splice(i, 1);
    w.coins += refund;
    ev(w, { t: 'release', n: refund, x: w.pads[pad].x, y: w.pads[pad].y });
    if (w.pending) place(w, pad);
    return refund;
  }
  function place(w, pad) {
    if (!w.pending || pad < 0 || pad >= w.pens) return false;
    if (w.pets.some(p => p.pad === pad)) return false;
    w.pending.pad = pad;
    w.pets.push(w.pending);
    w.pending = null;
    ev(w, { t: 'place', pad: pad });
    return true;
  }

  function alertGrab(w, p) {
    if (!p.egg) return;
    if (w.mode === '1p' && !w.taught && w.banks === 0 && p.egg.biome === 0) return;
    const n = NOISE[p.egg.species];
    for (const g of w.guards) {
      if (Math.hypot(p.x - g.x, p.y - g.y) > g.hear) continue;
      if (g.state === 'sleep') {
        g.meter += n;
        if (g.meter >= 1) { g.state = 'stir'; g.timer = Math.max(0.6, g.stir); g.meter = 0; }
      }
    }
    if (w.mode === '1p' && !w.taught && w.banks >= 1) {
      const hen = w.guards[0];
      if (hen && Math.hypot(p.x - hen.x, p.y - hen.y) < 8) {
        hen.state = 'stir'; hen.timer = 0.6; hen.script = true; hen.boost = 9; hen.meter = 0;
        ev(w, { t: 'stir', g: hen });
      }
    }
  }
  function giveEgg(p, nest) {
    p.egg = { nest: nest.id, biome: nest.biome, species: nest.species, rarity: nest.species, daily: !!nest.daily };
    nest.egg = false;
  }
  function tryGrab(w, p) {
    if (p.egg) return false;
    let best = null, bd = 0.95, loose = null;
    for (const f of w.flights) if (f.kind === 'loose') {
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < bd) { bd = d; loose = f; }
    }
    if (loose) {
      p.egg = { nest: loose.nest, biome: loose.biome, species: loose.species, rarity: loose.species, daily: !!loose.daily };
      w.flights.splice(w.flights.indexOf(loose), 1);
      alertGrab(w, p);
      ev(w, { t: 'grab', p: p.id, biome: p.egg.biome, species: p.egg.species, x: p.x, y: p.y });
      return true;
    }
    bd = 0.95;
    for (const n of w.nests) if (n.egg) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return false;
    giveEgg(p, best);
    alertGrab(w, p);
    ev(w, { t: 'grab', p: p.id, biome: p.egg.biome, species: p.egg.species, x: p.x, y: p.y });
    syncTut(w);
    return true;
  }
  function dropEgg(w, p) {
    if (!p.egg) return;
    if (ownSafe(w, p)) { bank(w, p); return; }
    const e = p.egg;
    w.flights.push({ kind: 'loose', nest: e.nest, biome: e.biome, species: e.species, daily: e.daily, x: p.x, y: p.y, vx: p.facing * 2.2, vy: -1.2, t: 0 });
    p.egg = null;
    ev(w, { t: 'drop', p: p.id });
  }
  function ownSafe(w, p) {
    if (w.mode === '1p') return p.x < w.safeL;
    return p.id === 0 ? p.x < w.safeL : p.x > w.safeR;
  }
  function eggLump(w, e) {
    let s = e.species;
    if (w.frenzy) s = Math.min(5, s + 1);
    return petRate(e.biome, s, 0) * 6;
  }
  function bank(w, p) {
    const e = p.egg;
    if (!e) return false;
    if (w.mode === '2p') {
      const n = eggLump(w, e);
      p.coins += n;
      p.egg = null;
      if (e.nest >= 0) {
        const nest = w.nests[e.nest];
        if (nest) nest.respawn = w.t + 4.5;
      }
      ev(w, { t: 'bank', p: p.id, n: n, x: p.x, y: p.y });
      return true;
    }
    const slot = w.incs.findIndex(s => !s);
    if (slot < 0) { if (!p.fullNote) { p.fullNote = 1; ev(w, { t: 'full' }); } return false; }
    p.fullNote = 0;
    const id = e.biome * 6 + e.species;
    let force = 0;
    if (e.daily && w.seen[id]) {
      if (!w.gold[id]) force = 'gold';
      else if (!w.giant[id]) force = 'giant';
    }
    w.incs[slot] = { b: e.biome, s: e.species, end: w.now + hatchDur(e.species, w.hatchLv) * 1000, nest: e.nest, daily: !!e.daily, force: force };
    p.egg = null;
    w.banks++;
    if (e.nest >= 0 && w.nests[e.nest]) {
      const nest = w.nests[e.nest];
      nest.respawn = w.t + 6.5;
      if (nest.daily) { nest.daily = false; w.daily.claimed = true; }
    }
    ev(w, { t: 'bank', p: p.id, slot: slot });
    syncTut(w);
    return true;
  }
  function rollVariant(rng, force) {
    const giant = rng() < 1 / 8, gold = rng() < 1 / 30;
    if (force === 'gold') return giant ? 3 : 2;
    if (force === 'giant') return gold ? 3 : 1;
    return (giant ? 1 : 0) + (gold ? 2 : 0);
  }
  function hatchSlot(w, inc, slot) {
    const v = rollVariant(w.rng, inc.force);
    const id = inc.b * 6 + inc.s;
    const neu = !w.seen[id];
    w.seen[id] = 1;
    if (v === 1 || v === 3) w.giant[id] = 1;
    if (v === 2 || v === 3) w.gold[id] = 1;
    const pet = { b: inc.b, s: inc.s, v: v, pad: -1, rate: petRate(inc.b, inc.s, v) };
    const pad = freePad(w);
    if (pad >= 0) { pet.pad = pad; w.pets.push(pet); }
    else w.pending = pet;
    ev(w, { t: 'hatch', b: pet.b, s: pet.s, v: pet.v, neu: neu, pad: pet.pad, rate: pet.rate, name: PETS[id], x: 2.2 + slot * 2.3, y: 8.6 });
    refreshDaily(w);
    syncTut(w);
  }

  function useGadget(w, p) {
    if (!w.gadgets.length) return false;
    const i = clamp(p.gadI | 0, 0, w.gadgets.length - 1);
    const id = w.gadgets.splice(i, 1)[0];
    if (p.gadI >= w.gadgets.length) p.gadI = 0;
    if (id === 'bubble') { p.bubble = 1; ev(w, { t: 'arm', p: p.id }); return true; }
    if (id === 'banana') w.items.push({ kind: 'peel', x: p.x - p.facing * 0.3, y: p.y + 0.15, t: 9 });
    else w.items.push({ kind: 'decoy', x: p.x, y: p.y, t: 3.2 });
    ev(w, { t: 'gadget', id: id, x: p.x, y: p.y });
    return true;
  }

  function moveToward(g, x, y, spd, dt, turn) {
    const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy) || 1;
    if (turn) {
      const want = Math.atan2(dy, dx);
      g.ang += clamp(angDiff(want, g.ang), -turn * dt, turn * dt);
      g.x += Math.cos(g.ang) * spd * dt;
      g.y += Math.sin(g.ang) * spd * dt;
    } else {
      g.x += dx / d * spd * dt;
      g.y += dy / d * spd * dt;
      g.ang = Math.atan2(dy, dx);
    }
    g.facing = Math.cos(g.ang) >= 0 ? 1 : -1;
  }
  function tickGuard(w, g, dt) {
    g.hopT += dt;
    g.air = !!(g.hop && (g.hopT % 1.15) < 0.55);
    if (g.patrol && (g.state === 'sleep' || g.state === 'stir' || g.state === 'watch')) {
      g.x += g.facing * 1.35 * dt;
      if (g.x > g.pmax) { g.x = g.pmax; g.facing = -1; g.ang = Math.PI; }
      if (g.x < g.pmin) { g.x = g.pmin; g.facing = 1; g.ang = 0; }
    }
    if (g.spin && g.state === 'watch') g.ang += dt * (Math.PI * 2) / Math.max(0.8, g.watch);
    if (g.state === 'slip' || g.state === 'look') {
      g.timer -= dt;
      if (g.state === 'slip') g.ang += dt * 14;
      else g.ang = Math.atan2(g.lookY - g.y, g.lookX - g.x);
      if (g.timer <= 0) {
        g.state = g.state === 'slip' ? 'chase' : 'sleep';
        g.timer = g.state === 'sleep' ? g.sleep : 0;
      }
      return;
    }
    g.timer -= dt;
    if (g.state === 'sleep' && g.timer <= 0) { g.state = 'stir'; g.timer = Math.max(0.6, g.stir); }
    else if (g.state === 'stir' && g.timer <= 0) {
      if (g.script) {
        g.state = 'chase'; g.timer = 0; g.target = 0; w.taught = true;
        const seen = w.players[0];
        ev(w, { t: 'spot', p: 0, x: seen ? seen.x : g.x, y: seen ? seen.y : g.y });
      } else {
        g.state = 'watch'; g.timer = g.watch;
        let face = null, best = 1e9;
        for (const p of w.players) {
          const d = Math.hypot(p.x - g.x, p.y - g.y);
          if (d < best) { best = d; face = p; }
        }
        if (face) g.ang = Math.atan2(face.y - g.y, face.x - g.x);
      }
    } else if (g.state === 'watch') {
      let seen = null;
      for (const p of w.players) if (inCone(g, p.x, p.y)) seen = p;
      if (seen) {
        g.state = 'chase'; g.timer = 0; g.target = seen.id;
        if (Math.hypot(seen.x - g.x, seen.y - g.y) < 14) ev(w, { t: 'spot', p: seen.id, x: seen.x, y: seen.y });
        if (g.script) w.taught = true;
      } else if (g.timer <= 0) { g.state = 'sleep'; g.timer = g.sleep * (0.85 + w.rng() * 0.3); g.meter = 0; }
    } else if (g.state === 'chase') {
      const p = w.players[g.target] || w.players[0];
      const spd = g.boost || g.chase;
      if (!p || gaveUp(w, p, g)) { g.state = 'return'; g.boost = 0; g.script = false; return; }
      if (g.ice) moveToward(g, p.x, p.y, spd, dt, 1.35);
      else if (!g.air) moveToward(g, p.x, p.y, spd, dt, 0);
      if (g.puddle) {
        g.pudT -= dt;
        if (g.pudT <= 0) { g.pudT = 0.55; w.puddles.push({ x: g.x, y: g.y, t: 4 }); if (w.puddles.length > 18) w.puddles.shift(); }
      }
      if (!g.air && p.egg && p.immune <= 0 && Math.hypot(p.x - g.x, p.y - g.y) < g.r + p.r) boop(w, g, p);
    } else if (g.state === 'return') {
      moveToward(g, g.hx, g.hy, 3.1, dt, 0);
      if (Math.hypot(g.x - g.hx, g.y - g.hy) < 0.28) {
        g.x = g.hx; g.y = g.hy; g.state = 'sleep'; g.timer = g.sleep; g.boost = 0; g.script = false; g.meter = 0;
      }
    }
  }
  function gaveUp(w, p, g) {
    if (Math.hypot(p.x - g.x, p.y - g.y) > 18) return true;
    // Chase time counts down from 0, so a guardian who lost the egg heads home.
    if (!p.egg && g.timer < -2.2) return true;
    if (w.mode === '1p' && p.x < w.safeL + 0.15) return true;
    if (w.mode === '2p' && ownSafe(w, p)) return true;
    return false;
  }
  function boop(w, g, p) {
    if (p.bubble) {
      p.bubble = 0; g.state = 'return'; g.boost = 0; g.script = false;
      ev(w, { t: 'popshield', x: p.x, y: p.y, p: p.id });
      return;
    }
    const e = p.egg;
    const nest = e.nest >= 0 ? w.nests[e.nest] : null;
    const tx = nest ? nest.x : g.hx, ty = nest ? nest.y : g.hy;
    w.flights.push({ kind: 'return', nest: e.nest, biome: e.biome, species: e.species, daily: e.daily, x: p.x, y: p.y, sx: p.x, sy: p.y, tx: tx, ty: ty, t: 0, T: 0.62 });
    p.egg = null;
    const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
    p.vx = dx / d * 7; p.vy = dy / d * 7; p.knock = 0.22;
    g.state = 'return'; g.boost = 0; g.script = false;
    if (w.mode === '1p') w.taught = true;
    ev(w, { t: 'boop', x: p.x, y: p.y, p: p.id });
  }

  function biomeAt(x) {
    if (x < BASE) return -1;
    return clamp(Math.floor((x - BASE) / BW), 0, 6);
  }
  function noteOpen(w, x, y) {
    if (!w || w.mode !== '1p') return;
    const now = maxOpen(w.speedXP);
    if (w.openMark == null) { w.openMark = now; return; }
    const from = w.openMark < now ? w.openMark : now;
    for (let i = from + 1; i <= now; i++) ev(w, { t: 'open', biome: i, name: BIOMES[i].name, x: x, y: y });
    w.openMark = now;
  }
  function gateBlock(w, p, prev) {
    if (w.mode !== '1p') return;
    const sp = speedOf(w.speedXP);
    for (let i = 1; i < 7; i++) {
      const gx = BASE + i * BW;
      if (sp + 1e-6 < GATES[i] && prev <= gx - 0.2 && p.x > gx - 0.2) {
        p.x = gx - 0.2; p.vx = Math.min(0, p.vx);
        ev(w, { t: 'gate', need: GATES[i], biome: i, x: gx, y: p.y });
        return;
      }
    }
  }
  function tickPlayer(w, p, input, dt) {
    if (p.immune > 0) p.immune -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.knock > 0) p.knock -= dt;
    let ix = input.x || 0, iy = input.y || 0;
    if (p.goal && Math.hypot(ix, iy) > 0.2) p.goal = null;
    if (p.goal && Math.hypot(ix, iy) < 0.2) {
      const dx = p.goal.x - p.x, dy = p.goal.y - p.y, d = Math.hypot(dx, dy);
      if (d < 0.25) p.goal = null;
      else { ix = dx / d; iy = dy / d; }
    }
    const onMill = millIndex(w, p);
    if (onMill >= 0 && Math.abs(iy) < 0.45 && p.dashT <= 0) {
      const dir = ix < -0.45 ? -1 : ix > 0.45 ? 1 : 0;
      if (dir && dir !== p.millArm) {
        if (p.millArm) {
          const add = w.mills[onMill].mult;
          if (w.mode === '1p') { w.speedXP += add; noteOpen(w, p.x, p.y); }
          else p.speedXP = (p.speedXP || 0) + add;
          ev(w, { t: 'xp', n: add, x: p.x, y: p.y - 0.8, p: p.id });
        }
        p.millArm = dir;
      }
      if (!dir) p.millArm = p.millArm;
      p.x += (w.mills[onMill].x - p.x) * Math.min(1, dt * 10);
      p.y += (w.mills[onMill].y - p.y) * Math.min(1, dt * 10);
      p.vx = 0; p.vy = 0;
    } else {
      p.millArm = 0;
      let spd = w.mode === '1p' ? speedOf(w.speedXP) : speedOf(p.speedXP || 0);
      if (p.egg) spd *= WEIGHT[p.egg.species];
      p.puddle = 0;
      for (const pud of w.puddles) if (Math.hypot(p.x - pud.x, p.y - pud.y) < 0.85) p.puddle = 1;
      if (p.puddle) spd *= 0.55;
      const ice = w.mode === '1p' && biomeAt(p.x) === 2;
      const accel = ice ? 3.2 : 18;
      const mag = Math.hypot(ix, iy);
      if (mag > 1) { ix /= mag; iy /= mag; }
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx = p.dvx; p.vy = p.dvy;
      } else {
        p.vx += ((mag > 0.08 ? ix : 0) * spd - p.vx) * Math.min(1, accel * dt);
        p.vy += ((mag > 0.08 ? iy : 0) * spd - p.vy) * Math.min(1, accel * dt);
        if (mag <= 0.08 && !ice) { p.vx *= Math.max(0, 1 - 14 * dt); p.vy *= Math.max(0, 1 - 14 * dt); }
      }
      const prev = p.x;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.abs(p.vx) > 0.2) p.facing = p.vx > 0 ? 1 : -1;
      p.y = clamp(p.y, 1.05, H - 1.15);
      if (w.mode === '2p') {
        if (p.id === 0 && p.x > w.safeR - 0.2) { p.x = w.safeR - 0.2; p.vx = 0; }
        if (p.id === 1 && p.x < w.safeL + 0.2) { p.x = w.safeL + 0.2; p.vx = 0; }
      }
      p.x = clamp(p.x, 0.4, w.w - 0.4);
      gateBlock(w, p, prev);
      if (w.mode === '1p' && p.egg && prev >= w.safeL && p.x < w.safeL) ev(w, { t: 'safe', x: p.x, y: p.y });
    }
    p.step += dt * Math.hypot(p.vx, p.vy) * 3.2;
    if (input.dash && w.mode === '2p' && p.dashCd <= 0 && p.dashT <= 0) {
      const mag = Math.hypot(ix, iy);
      const dx = mag > 0.2 ? ix / mag : p.facing, dy = mag > 0.2 ? iy / mag : 0;
      p.dashT = 0.16; p.dashCd = 4; p.dvx = dx * 15; p.dvy = dy * 15;
      ev(w, { t: 'dash', p: p.id });
    }
    if (input.grab) {
      if (p.egg) dropEgg(w, p);
      else tryGrab(w, p);
    } else if (w.settings.autoGrab && !p.egg) tryGrab(w, p);
    if (input.gadget) useGadget(w, p);
    if (p.egg && ownSafe(w, p)) bank(w, p);
    if (w.mode === '1p') {
      if (p.wasPad == null) p.wasPad = -1;
      let insideI = -1;
      for (let i = 0; i < w.pens; i++) {
        if (Math.hypot(p.x - w.pads[i].x, p.y - w.pads[i].y) < 0.72) insideI = i;
      }
      if (insideI >= 0 && (p.wasPad !== insideI || w.pads[insideI].pile >= 6)) collectPad(w, insideI);
      p.wasPad = insideI;
    }
  }
  function millIndex(w, p) {
    for (let i = 0; i < w.mills.length; i++) {
      const m = w.mills[i];
      if (w.mode === '1p' && m.mult === 2 && w.millLv < 2) continue;
      if (w.mode === '1p' && m.mult === 5 && w.millLv < 3) continue;
      if (w.mode === '2p' && m.side !== p.id) continue;
      if (Math.abs(p.x - m.x) < 1 && Math.abs(p.y - m.y) < 0.85) return i;
    }
    return -1;
  }
  function bumps(w) {
    if (w.mode !== '2p') return;
    const a = w.players[0], b = w.players[1];
    if (Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 0.05) return;
    for (const [h, o] of [[a, b], [b, a]]) {
      if (h.dashT > 0 && o.egg && o.immune <= 0 && !ownSafe(w, o)) {
        const e = o.egg;
        const dx = h.dvx, dy = h.dvy, d = Math.hypot(dx, dy) || 1;
        w.flights.push({ kind: 'loose', nest: e.nest, biome: e.biome, species: e.species, daily: e.daily, x: o.x + dx / d, y: o.y + dy / d, vx: dx / d * 3, vy: dy / d * 3, t: 0 });
        o.egg = null; o.immune = 1.5; o.vx = dx / d * 6; o.vy = dy / d * 6;
        ev(w, { t: 'bump', x: o.x, y: o.y, p: o.id });
      }
    }
  }
  function tickFox(w, dt) {
    if (w.mode !== '1p' || w.settings.fox === false) return;
    const p = w.players[0];
    if (w.stolen) {
      const den = denPos(w);
      if (Math.hypot(p.x - den.x, p.y - den.y) < 1.05) {
        const pet = { b: w.stolen.b, s: w.stolen.s, v: w.stolen.v, pad: -1, rate: petRate(w.stolen.b, w.stolen.s, w.stolen.v) };
        const pad = freePad(w);
        if (pad >= 0) { pet.pad = pad; w.pets.push(pet); }
        else w.pending = pet;
        ev(w, { t: 'den', name: PETS[pet.b * 6 + pet.s] });
        w.stolen = null;
      }
      return;
    }
    if (!w.fox) {
      w.foxT += dt;
      if (w.foxT >= 240) w.fox = { x: 13.2, y: 8.4, vx: -1.05 };
      return;
    }
    w.fox.x += w.fox.vx * dt;
    if (Math.hypot(p.x - w.fox.x, p.y - w.fox.y) < 0.95) {
      const bonus = Math.max(20, Math.round(30 * coinMult(w.rebirths, w.seen)));
      w.coins += bonus;
      ev(w, { t: 'fox', n: bonus, x: w.fox.x, y: w.fox.y });
      w.fox = null; w.foxT = 0;
      return;
    }
    if (w.fox.x < 0.55) {
      let worst = null;
      for (const pet of w.pets) if (pet.s < 4 && (!worst || pet.rate < worst.rate)) worst = pet;
      if (worst) {
        w.pets.splice(w.pets.indexOf(worst), 1);
        w.stolen = { b: worst.b, s: worst.s, v: worst.v, den: maxOpen(w.speedXP) };
        ev(w, { t: 'stolen', name: PETS[worst.b * 6 + worst.s] });
      } else ev(w, { t: 'foxmiss' });
      w.fox = null; w.foxT = 0;
    }
  }
  function denPos(w) {
    const b = w.stolen ? w.stolen.den : 0;
    return { x: BASE + b * BW + 3.2, y: 12.4 };
  }
  function handleClick(w, c) {
    if (!c) return;
    if (w.mode === '1p') {
      for (let i = 0; i < w.pens; i++) if (Math.hypot(c.x - w.pads[i].x, c.y - w.pads[i].y) < 0.8) { collectPad(w, i); return; }
      if (w.shop && Math.hypot(c.x - w.shop.x, c.y - w.shop.y) < 1.35) { ev(w, { t: 'shop' }); return; }
      if (w.stolen) {
        const d = denPos(w);
        if (Math.hypot(c.x - d.x, c.y - d.y) < 1.3) { w.players[0].x = d.x; w.players[0].y = d.y; return; }
      }
    }
    if (w.settings.clickMove) w.players[c.p || 0].goal = { x: clamp(c.x, 0.5, w.w - 0.5), y: clamp(c.y, 1, H - 1) };
  }
  function syncTut(w) {
    if (w.mode !== '1p' || w.tut === 'done') return;
    const p = w.players[0];
    if (w.bought > 0 && w.taught) { w.tut = 'done'; ev(w, { t: 'tut', phase: 'done' }); return; }
    if (p.egg) { w.tut = 'home'; return; }
    if (w.incs.some(Boolean)) { w.tut = 'hatch'; return; }
    if (!w.didCollect && w.pets.length) { w.tut = 'pad'; return; }
    if (!w.taught && w.banks >= 1) { w.tut = 'again'; return; }
    if (w.pets.length && w.coins < price(w, 'shoes')) { w.tut = 'pad'; return; }
    if (w.pets.length) { w.tut = 'shop'; return; }
    w.tut = 'egg';
  }
  function lessonHen(w) {
    if (w.mode !== '1p' || w.taught || w.banks < 1) return;
    const hen = w.guards[0];
    if (!hen) return;
    hen.hx = 18.55; hen.hy = 8;
    if ((hen.state === 'sleep' || hen.state === 'return') && Math.hypot(hen.x - hen.hx, hen.y - hen.hy) > 0.35 && hen.state === 'sleep') {
      hen.state = 'return';
    }
  }
  function retreatHen(w) {
    if (!w.taught || w.mode !== '1p') return;
    const hen = w.guards[0];
    if (!hen) return;
    if (hen.hx < 24) { hen.hx = 28.4; hen.hy = 8.1; }
    if (hen.state === 'sleep' && Math.hypot(hen.x - hen.hx, hen.y - hen.hy) > 1.2) hen.state = 'return';
  }
  function skipTut(w) { w.tut = 'done'; w.taught = true; ev(w, { t: 'tut', phase: 'done' }); }

  function step(w, dt, input, now) {
    if (!w || w.over) return w;
    dt = clamp(dt || 0, 0, 0.05);
    input = input || {};
    if (now != null) w.now = now; else w.now += dt * 1000;
    w.t += dt;
    const inputs = [input, input.p2 || {}];
    for (let i = 0; i < w.players.length; i++) tickPlayer(w, w.players[i], inputs[i] || {}, dt);
    bumps(w);
    handleClick(w, input.click);
    for (const n of w.nests) {
      if (!n.egg && n.respawn && w.t >= n.respawn && !nestBusy(w, n.id)) {
        if (!n.daily) n.species = w.rng() < 0.62 ? (w.rng() * 3 | 0) : (w.rng() * 6 | 0);
        n.egg = true; n.respawn = 0;
      }
    }
    for (let i = w.flights.length - 1; i >= 0; i--) {
      const f = w.flights[i];
      f.t += dt;
      if (f.kind === 'return') {
        const u = clamp(f.t / f.T, 0, 1), arc = Math.sin(u * Math.PI) * 1.6;
        f.x = f.sx + (f.tx - f.sx) * u;
        f.y = f.sy + (f.ty - f.sy) * u - arc;
        if (u >= 1) {
          const nest = f.nest >= 0 ? w.nests[f.nest] : null;
          if (nest && !nest.egg && !nestBusy(w, nest.id)) { nest.egg = true; nest.species = f.species; nest.respawn = 0; }
          w.flights.splice(i, 1);
        }
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += dt * 2;
        if (f.t > 16) {
          f.kind = 'return'; f.sx = f.x; f.sy = f.y; f.t = 0; f.T = 0.5;
          const nest = f.nest >= 0 ? w.nests[f.nest] : null;
          f.tx = nest ? nest.x : f.x; f.ty = nest ? nest.y : f.y;
        }
      }
    }
    for (let i = w.items.length - 1; i >= 0; i--) {
      const it = w.items[i];
      it.t -= dt;
      if (it.t <= 0) { w.items.splice(i, 1); continue; }
      for (const g of w.guards) {
        if (Math.hypot(g.x - it.x, g.y - it.y) > 0.8) continue;
        if (it.kind === 'peel' && (g.state === 'chase' || g.state === 'watch')) { g.state = 'slip'; g.timer = 2; w.items.splice(i, 1); ev(w, { t: 'slip', x: g.x, y: g.y }); break; }
        if (it.kind === 'decoy' && (g.state === 'chase' || g.state === 'watch' || g.state === 'stir')) {
          g.state = 'look'; g.timer = 3; g.lookX = it.x; g.lookY = it.y; w.items.splice(i, 1); break;
        }
      }
    }
    for (let i = w.puddles.length - 1; i >= 0; i--) { w.puddles[i].t -= dt; if (w.puddles[i].t <= 0) w.puddles.splice(i, 1); }
    lessonHen(w);
    for (const g of w.guards) tickGuard(w, g, dt);
    retreatHen(w);
    tickFox(w, dt);
    if (w.mode === '1p') {
      for (let i = 0; i < w.incs.length; i++) {
        const inc = w.incs[i];
        if (inc && w.now >= inc.end) { w.incs[i] = null; hatchSlot(w, inc, i); }
      }
      const mult = coinMult(w.rebirths, w.seen);
      for (const pet of w.pets) if (pet.pad >= 0 && pet.pad < w.pens) w.pads[pet.pad].pile += pet.rate * mult * dt;
    }
    syncTut(w);
    if (w.mode === '2p') {
      w.matchT -= dt;
      w.frenzy = w.matchT <= 30;
      if (w.matchT <= 0) {
        w.matchT = 0; w.over = true;
        const a = w.players[0].coins, b = w.players[1].coins;
        w.winner = a === b ? -1 : a > b ? 0 : 1;
        ev(w, { t: 'match', winner: w.winner, a: a, b: b });
      }
    }
    return w;
  }

  function exportSave(w) {
    const p0 = w.players[0];
    return {
      v: 1,
      coins: w.coins,
      speedXP: w.speedXP,
      pets: w.pets.map(p => ({ b: p.b, s: p.s, v: p.v, pad: p.pad })),
      pens: w.pens,
      incN: w.incN,
      incs: w.incs.map(s => s ? { b: s.b, s: s.s, end: s.end, daily: !!s.daily, force: s.force || 0 } : null),
      hatchLv: w.hatchLv,
      millLv: w.millLv,
      shoes: w.shoes,
      gadgets: w.gadgets.slice(),
      seen: w.seen.slice(),
      giant: w.giant.slice(),
      gold: w.gold.slice(),
      rebirths: w.rebirths,
      settings: { autoGrab: !!w.settings.autoGrab, clickMove: !!w.settings.clickMove, fox: w.settings.fox !== false, tut: w.tut === 'done' },
      awayAt: w.now,
      stolen: w.stolen ? { b: w.stolen.b, s: w.stolen.s, v: w.stolen.v, den: w.stolen.den } : null,
      pending: w.pending ? { b: w.pending.b, s: w.pending.s, v: w.pending.v, pad: -1 } : null,
      carry: p0 && p0.egg ? { b: p0.egg.biome, s: p0.egg.species, v: 0, pad: -1 } : null,
      dailyDate: w.daily.date,
      dailyClaimed: !!w.daily.claimed,
      dailyId: w.daily.id,
      bought: w.bought,
      banks: w.banks,
      taught: !!w.taught,
      foxT: w.foxT
    };
  }

  ER.H = H; ER.BASE = BASE; ER.BW = BW; ER.SAFE = SAFE; ER.GATES = GATES;
  ER.BIOMES = BIOMES; ER.PETS = PETS; ER.RAR_NAME = RAR_NAME; ER.RAR_I = RAR_I;
  ER.BASE_C = BASE_C; ER.RAR_M = RAR_M; ER.WEIGHT = WEIGHT; ER.HATCH = HATCH;
  ER.speedOf = speedOf; ER.petRate = petRate; ER.hatchDur = hatchDur; ER.coinMult = coinMult;
  ER.biomesDone = biomesDone; ER.maxOpen = maxOpen; ER.price = price; ER.fmt = fmt;
  ER.create = create; ER.step = step; ER.buy = buy; ER.rebirth = rebirth;
  ER.collectPad = collectPad; ER.release = release; ER.place = place;
  ER.exportSave = exportSave; ER.readSave = readSave; ER.awayCoins = awayCoins;
  ER.biomeAt = biomeAt; ER.inCone = inCone; ER.denPos = denPos; ER.skipTut = skipTut;
  ER.TILE = 48;
})(typeof globalThis !== 'undefined' ? (globalThis.EggRush = globalThis.EggRush || {}) : {});

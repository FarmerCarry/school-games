/* Shortcut Factory (مصنع الاختصارات) — Pure Cyber-Bot Cloner & Blaster Engine.
 * Zero DOM, zero timers, zero Math.random, zero Kit calls.
 * Dual exports: Node `module.exports` and browser `window.SFEngine`. */
(function () {
  'use strict';

  const W = 1280, H = 720, POD_Y = 156;
  const BELT_EXIT_X = 195, BELT_SPAWN_X = 985, VIS_MIN_X = 225, VIS_MAX_X = 955;
  const CLONER = { x: 1138, y: 390 }, TURRET = { x: 104, y: 390 }, MAX_UNDO = 24;

  const BOT_KINDS = ['laser', 'drone', 'tank', 'shark'];
  const BOTS = {
    laser: { id: 'laser', name: 'آلي الليزر', dual: 'آليا ليزر', plural: 'آليي ليزر', color: '#00e5ff', virus: false },
    drone: { id: 'drone', name: 'درون الصواريخ', dual: 'درونا صواريخ', plural: 'درونات صواريخ', color: '#ff9100', virus: false },
    tank: { id: 'tank', name: 'مدرعة البرق', dual: 'مدرعتا برق', plural: 'مدرعات برق', color: '#00e676', virus: false },
    shark: { id: 'shark', name: 'قرش التيربو', dual: 'قرشا تيربو', plural: 'قروش تيربو', color: '#d500f9', virus: false },
    virus: { id: 'virus', name: 'قنبلة الفيروس', dual: 'قنبلتا فيروس', plural: 'قنابل فيروس', color: '#ff1744', virus: true }
  };

  const SHORTCUTS = {
    select: { id: 'select', keys: ['Space'], codes: ['Space'], name: 'تحديد الآلي', badge: 'تحديد' },
    copy: { id: 'copy', keys: ['Ctrl', 'C'], codes: ['ControlLeft', 'KeyC'], name: 'شعاع الاستنساخ', badge: 'استنساخ' },
    paste: { id: 'paste', keys: ['Ctrl', 'V'], codes: ['ControlLeft', 'KeyV'], name: 'إطلاق للسفينة', badge: 'إطلاق' },
    cut: { id: 'cut', keys: ['Ctrl', 'X'], codes: ['ControlLeft', 'KeyX'], name: 'نقل نفاث', badge: 'نقل نفاث' },
    delete: { id: 'delete', keys: ['Delete'], codes: ['Delete'], name: 'ليزر التحطيم', badge: 'تحطيم الفيروس' },
    undo: { id: 'undo', keys: ['Ctrl', 'Z'], codes: ['ControlLeft', 'KeyZ'], name: 'إرجاع الزمن', badge: 'إرجاع الزمن' },
    redo: { id: 'redo', keys: ['Ctrl', 'Y'], codes: ['ControlLeft', 'KeyY'], name: 'تقديم الزمن', badge: 'تقديم الزمن' },
    selectAll: { id: 'selectAll', keys: ['Ctrl', 'A'], codes: ['ControlLeft', 'KeyA'], name: 'الموجة الشاملة', badge: 'تحديد الكل' },
    saveShip: { id: 'saveShip', keys: ['Ctrl', 'S'], codes: ['ControlLeft', 'KeyS'], name: 'الإقلاع الكبير', badge: 'إقلاع شامل' }
  };

  const TIERS = [
    { id: 'easy', index: 0, name: 'سهل', badge: 'مبتدئ', color: '#00e676', missions: [0, 1, 2, 3] },
    { id: 'med', index: 1, name: 'متوسط', badge: 'ماهر', color: '#00e5ff', missions: [4, 5, 6, 7] },
    { id: 'hero', index: 2, name: 'بطل', badge: 'محترف', color: '#ff9100', missions: [8, 9, 10, 11] }
  ];

  const THEMES = [
    { id: 'cyan', name: 'نيون سماوي', price: 0, bg1: '#0b1330', bg2: '#132254', glow: '#00e5ff', accent: '#3d5afe', belt: '#182b63' },
    { id: 'plasma', name: 'بلازما أرجواني', price: 25, bg1: '#1a0b2e', bg2: '#2f1454', glow: '#ff4081', accent: '#aa00ff', belt: '#2d1654' },
    { id: 'solar', name: 'لهب شمسي', price: 40, bg1: '#211008', bg2: '#3b1d0e', glow: '#ffab00', accent: '#ff3d00', belt: '#381e10' },
    { id: 'emerald', name: 'زمرد الطاقة', price: 60, bg1: '#071f1a', bg2: '#0f382f', glow: '#00e676', accent: '#00bfa5', belt: '#113b32' }
  ];

  const ARMORS = [
    { id: 'std', name: 'درع التيتانيوم', price: 0, trim: '#e0f7fa', visor: '#00e5ff', crest: '' },
    { id: 'gold', name: 'درع الذهب الخارق', price: 30, trim: '#ffd740', visor: '#ffff00', crest: 'crown' },
    { id: 'stealth', name: 'درع الشبح الليلي', price: 50, trim: '#546e7a', visor: '#ff1744', crest: 'horns' },
    { id: 'nova', name: 'درع النجم المتوهج', price: 75, trim: '#f8bbd0', visor: '#7c4dff', crest: 'halo' }
  ];

  const MISSIONS = [
    { index: 0, id: 'sf_m1', tier: 0, title: 'استنساخ آلي الليزر', dock: ['select', 'copy', 'paste'], intro: ['copy', 'paste'], belts: [['laser', 'laser', 'laser']], speed: 28, virusRate: 0, pods: [{ kind: 'laser', target: 3, init: [] }], queue: [], timeLimit: 0 },
    { index: 1, id: 'sf_m2', tier: 0, title: 'سرب الدرون والليزر', dock: ['select', 'copy', 'paste'], intro: ['select'], belts: [['laser', 'drone', 'laser', 'drone']], speed: 32, virusRate: 0, pods: [{ kind: 'laser', target: 2, init: [] }, { kind: 'drone', target: 2, init: [] }], queue: [], timeLimit: 0 },
    { index: 2, id: 'sf_m3', tier: 0, title: 'مدفع الفيروسات', dock: ['delete', 'copy', 'paste'], intro: ['delete'], belts: [['tank', 'virus', 'tank', 'virus']], speed: 34, virusRate: 0.28, pods: [{ kind: 'tank', target: 3, init: [] }], queue: [{ kind: 'tank', target: 2, init: [] }], timeLimit: 0 },
    { index: 3, id: 'sf_m4', tier: 0, title: 'أسطول القرش التيربو', dock: ['copy', 'paste', 'delete'], intro: [], belts: [['shark', 'drone', 'virus', 'shark']], speed: 36, virusRate: 0.22, pods: [{ kind: 'shark', target: 2, init: [] }, { kind: 'drone', target: 2, init: [] }], queue: [{ kind: 'laser', target: 2, init: [] }], timeLimit: 0 },
    { index: 4, id: 'sf_m5', tier: 1, title: 'النقل النفاث', dock: ['cut', 'copy', 'paste'], intro: ['cut'], belts: [['laser', 'shark', 'laser'], ['shark', 'laser', 'shark']], speed: 44, virusRate: 0, pods: [{ kind: 'laser', target: 2, init: ['laser', 'shark'] }, { kind: 'shark', target: 2, init: ['shark'] }], queue: [{ kind: 'laser', target: 2, init: [] }], timeLimit: 0 },
    { index: 5, id: 'sf_m6', tier: 1, title: 'خط الإنتاج المزدوج', dock: ['cut', 'copy', 'paste', 'delete'], intro: [], belts: [['tank', 'virus', 'drone'], ['drone', 'tank', 'virus']], speed: 48, virusRate: 0.22, pods: [{ kind: 'tank', target: 2, init: ['drone'] }, { kind: 'drone', target: 3, init: ['drone'] }], queue: [{ kind: 'tank', target: 2, init: [] }], timeLimit: 0 },
    { index: 6, id: 'sf_m7', tier: 1, title: 'درع إرجاع الزمن', dock: ['undo', 'copy', 'paste', 'delete'], intro: ['undo'], belts: [['shark', 'laser', 'virus'], ['laser', 'shark', 'tank']], speed: 48, virusRate: 0.18, pods: [{ kind: 'shark', target: 2, init: ['shark'] }, { kind: 'laser', target: 2, init: ['laser'] }], queue: [{ kind: 'tank', target: 2, init: [] }], saboteurEvery: 11, preSabotage: true, timeLimit: 0 },
    { index: 7, id: 'sf_m8', tier: 1, title: 'صدى المستقبل', dock: ['redo', 'undo', 'copy', 'paste'], intro: ['redo'], belts: [['drone', 'tank', 'drone'], ['tank', 'virus', 'shark']], speed: 50, virusRate: 0.18, pods: [{ kind: 'drone', target: 3, init: ['drone'] }, { kind: 'tank', target: 2, init: [] }], queue: [{ kind: 'shark', target: 2, init: [] }], preRedo: 2, saboteurEvery: 14, timeLimit: 115 },
    { index: 8, id: 'sf_m9', tier: 2, title: 'الموجة الشاملة', dock: ['selectAll', 'copy', 'paste'], intro: ['selectAll'], belts: [['laser', 'drone', 'tank'], ['shark', 'laser', 'drone']], speed: 56, virusRate: 0, pods: [{ kind: 'laser', target: 2, init: [] }, { kind: 'drone', target: 2, init: [] }, { kind: 'tank', target: 2, init: [] }], queue: [{ kind: 'shark', target: 2, init: [] }], timeLimit: 105 },
    { index: 9, id: 'sf_m10', tier: 2, title: 'عاصفة الفيروسات', dock: ['selectAll', 'cut', 'paste', 'delete'], intro: [], belts: [['shark', 'virus', 'laser', 'tank'], ['virus', 'drone', 'shark', 'laser']], speed: 62, virusRate: 0.28, pods: [{ kind: 'shark', target: 3, init: ['laser'] }, { kind: 'laser', target: 3, init: ['shark'] }, { kind: 'drone', target: 2, init: [] }], queue: [{ kind: 'tank', target: 2, init: [] }], saboteurEvery: 13, timeLimit: 115 },
    { index: 10, id: 'sf_m11', tier: 2, title: 'الإقلاع الكبير', dock: ['selectAll', 'copy', 'paste', 'saveShip'], intro: ['saveShip'], belts: [['laser', 'drone', 'virus', 'tank'], ['tank', 'laser', 'drone', 'virus']], speed: 64, virusRate: 0.22, pods: [{ kind: 'laser', target: 2, init: [] }, { kind: 'drone', target: 2, init: [] }, { kind: 'tank', target: 2, init: [] }], queue: [], megaSave: true, saboteurEvery: 12, timeLimit: 110 },
    { index: 11, id: 'sf_m12', tier: 2, title: 'معركة المصنع الكبرى', dock: ['selectAll', 'copy', 'paste', 'saveShip'], intro: [], belts: [['shark', 'laser', 'virus', 'drone'], ['tank', 'virus', 'shark', 'laser']], speed: 68, virusRate: 0.25, pods: [{ kind: 'shark', target: 2, init: ['drone'] }, { kind: 'drone', target: 2, init: ['shark'] }, { kind: 'laser', target: 3, init: [] }], queue: [{ kind: 'tank', target: 2, init: [] }], megaSave: true, saboteurEvery: 10, timeLimit: 130 },
    { index: 12, id: 'sf_rush', tier: 2, title: 'التحدي اللانهائي', endless: true, dock: ['selectAll', 'copy', 'paste', 'delete'], intro: [], belts: [['laser', 'drone', 'virus', 'tank'], ['shark', 'tank', 'laser', 'drone']], speed: 64, virusRate: 0.24, pods: [{ kind: 'laser', target: 2, init: [] }, { kind: 'drone', target: 2, init: [] }, { kind: 'shark', target: 2, init: [] }], queue: [], saboteurEvery: 13, timeLimit: 65 }
  ];

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const isVisible = x => x >= VIS_MIN_X && x <= VIS_MAX_X;
  const cloneData = v => JSON.parse(JSON.stringify(v));
  const nextId = w => (++w.seq);

  function makeRng(seed) {
    let s = ((seed | 0) || 123456789) >>> 0;
    return () => {
      s = (s ^ (s << 13)) >>> 0;
      s = (s ^ (s >>> 17)) >>> 0;
      s = (s ^ (s << 5)) >>> 0;
      return (s >>> 0) / 4294967296;
    };
  }

  function sayBot(kind, n) {
    const b = BOTS[kind] || BOTS.laser;
    return n === 1 ? b.name : n === 2 ? b.dual : n + ' ' + b.plural;
  }

  function podX(index, count) {
    if (count <= 1) return 580;
    return count === 2 ? (index === 0 ? 410 : 750) : 300 + index * 280;
  }

  function podSlot(bx, slotIdx, capOverride) {
    const cap = Math.max(1, capOverride || Math.max(bx.target, bx.items.length));
    const span = Math.min(152, (cap - 1) * 58);
    const step = cap > 1 ? span / (cap - 1) : 0;
    return { x: bx.x - span / 2 + slotIdx * step, y: bx.y + 18 };
  }

  function layoutPodItems(bx) {
    for (let i = 0; i < bx.items.length; i++) {
      const p = podSlot(bx, i);
      bx.items[i].x = p.x; bx.items[i].y = p.y;
    }
  }

  function isPodReady(bx) {
    return !bx.launched && bx.items.length === bx.target &&
      bx.items.every(it => it.kind === bx.kind && !it.virus && !it.glitched);
  }

  function snapshotState(w, reason) {
    return {
      reason: reason || 'act', belts: cloneData(w.belts), boxes: cloneData(w.boxes),
      podQueue: cloneData(w.podQueue), clip: cloneData(w.clip), sel: w.sel.slice(),
      activeBox: w.activeBox, megaReady: w.megaReady
    };
  }

  function restoreSnapshot(w, snap) {
    w.belts = cloneData(snap.belts); w.boxes = cloneData(snap.boxes);
    w.podQueue = cloneData(snap.podQueue); w.clip = cloneData(snap.clip);
    w.sel = snap.sel.slice(); w.activeBox = snap.activeBox; w.megaReady = !!snap.megaReady;
  }

  function pushUndo(w, reason) {
    w.undo.push(snapshotState(w, reason));
    if (w.undo.length > MAX_UNDO) w.undo.shift();
    w.redo.length = 0;
  }

  function neededKinds(w) {
    const need = [];
    for (const bx of w.boxes) {
      if (bx.launched) continue;
      const valid = bx.items.filter(it => it.kind === bx.kind && !it.virus && !it.glitched).length;
      if (valid < bx.target && need.indexOf(bx.kind) < 0) need.push(bx.kind);
    }
    return need.length ? need : BOT_KINDS;
  }

  function pickSpawnKind(w, rng) {
    if (w.virusRate > 0 && rng() < w.virusRate) {
      let recent = 0;
      for (const b of w.belts) {
        const last = b.items[b.items.length - 1];
        if (last && last.virus) recent++;
      }
      if (recent < w.belts.length) return 'virus';
    }
    const need = neededKinds(w);
    return rng() < 0.72 ? need[Math.floor(rng() * need.length)] : BOT_KINDS[Math.floor(rng() * BOT_KINDS.length)];
  }

  function create(missionIndex, opts) {
    opts = opts || {};
    const idx = clamp(missionIndex | 0, 0, MISSIONS.length - 1);
    const def = MISSIONS[idx];
    const rng = makeRng(opts.seed || (idx * 9973 + 17));
    const speedScale = clamp(opts.speedScale == null ? 1 : opts.speedScale, 0.5, 1.65);
    const timeScale = clamp(opts.timeScale == null ? 1 : opts.timeScale, 0.65, 1.6);
    const virusScale = opts.virusScale == null ? 1 : clamp(opts.virusScale, 0, 1.8);
    const sabInterval = clamp(opts.saboteurEvery || def.saboteurEvery || 0, 0, 40);

    const w = {
      index: idx, id: def.id, def: def, phase: 'play', time: 0, offset: 0,
      speed: Math.round(def.speed * speedScale),
      virusRate: def.virusRate > 0 ? clamp(def.virusRate * virusScale, 0.08, 0.42) : 0,
      timeLimit: def.timeLimit ? Math.round(def.timeLimit * timeScale) : 0,
      timeLeft: def.timeLimit ? Math.round(def.timeLimit * timeScale) : 0,
      seq: 0, score: 0, combo: 0, mistakes: 0, zapped: 0, bonks: 0, launchedCount: 0,
      totalPods: def.endless ? 999 : def.pods.length + def.queue.length,
      activeBox: 0, sel: [], clip: null, megaReady: false, saveBoostUsed: false,
      belts: [], boxes: [], podQueue: cloneData(def.queue), undo: [], redo: [],
      saboteur: { enabled: sabInterval > 0, every: sabInterval || 14, timer: sabInterval ? Math.max(5, sabInterval * 0.65) : 999, state: 'away', x: 1180, y: 120, targetBox: -1 },
      events: [], _rng: rng
    };

    const beltYs = def.belts.length === 1 ? [392] : [336, 456];
    for (let bi = 0; bi < def.belts.length; bi++) {
      const row = def.belts[bi], spacing = row.length >= 4 ? 195 : 230, items = [];
      for (let j = 0; j < row.length; j++) {
        const kind = row[j], x = 355 + j * spacing;
        const item = { id: nextId(w), kind: kind, virus: kind === 'virus', glitched: false, x: x, y: beltYs[bi], cued: isVisible(x) };
        items.push(item);
        if (item.cued && !item.virus) w.events.push({ type: 'cue', id: item.id, kind: item.kind });
      }
      w.belts.push({ i: bi, y: beltYs[bi], spacing: spacing, items: items });
    }

    for (let pi = 0; pi < def.pods.length; pi++) {
      const pd = def.pods[pi];
      const bx = { i: pi, x: podX(pi, def.pods.length), y: POD_Y, kind: pd.kind, target: pd.target, items: [], launched: false, launchT: 0 };
      for (const k of (pd.init || [])) bx.items.push({ id: nextId(w), kind: k, virus: k === 'virus', glitched: false, x: bx.x, y: bx.y });
      layoutPodItems(bx);
      w.boxes.push(bx);
    }

    if (def.preSabotage && w.boxes[0] && w.boxes[0].items[0]) {
      pushUndo(w, 'saboteur');
      w.boxes[0].items[0].glitched = true;
      Object.assign(w.saboteur, { state: 'laugh', targetBox: 0, x: w.boxes[0].x + 70, y: w.boxes[0].y - 36, timer: 7 });
    }
    if (def.preRedo && w.boxes[0]) {
      const snaps = [], baseSnap = snapshotState(w, 'echo');
      for (let r = 1; r <= def.preRedo; r++) {
        w.boxes[0].items.push({ id: nextId(w), kind: w.boxes[0].kind, virus: false, glitched: false, x: w.boxes[0].x, y: w.boxes[0].y });
        layoutPodItems(w.boxes[0]);
        snaps.push(snapshotState(w, 'echo'));
      }
      restoreSnapshot(w, baseSnap);
      for (let r = snaps.length - 1; r >= 0; r--) w.redo.push(snaps[r]);
    }
    return w;
  }

  function findItem(w, id) {
    for (let bi = 0; bi < w.belts.length; bi++) {
      const b = w.belts[bi];
      for (let idx = 0; idx < b.items.length; idx++) {
        const it = b.items[idx];
        if (it.id === id) return { where: 'belt', beltIndex: bi, itemIndex: idx, item: it, x: it.x, y: b.y };
      }
    }
    for (let pi = 0; pi < w.boxes.length; pi++) {
      const bx = w.boxes[pi];
      for (let idx = 0; idx < bx.items.length; idx++) {
        const it = bx.items[idx];
        if (it.id === id) return { where: 'box', boxIndex: pi, itemIndex: idx, item: it, x: it.x, y: it.y };
      }
    }
    return null;
  }

  function pruneSelection(w) {
    w.sel = w.sel.filter(id => { const f = findItem(w, id); return f && (f.where === 'box' || isVisible(f.x)); });
  }

  function launchPod(w, bx) {
    if (bx.launched) return;
    bx.launched = true; bx.launchT = 0.85;
    w.launchedCount += 1; w.combo += 1; w.score += 100 + w.combo * 20;
    if (w.def.endless && w.timeLimit > 0) w.timeLeft = Math.min(99, w.timeLeft + 10);
    w.events.push({ type: 'pod_launch', boxIndex: bx.i, kind: bx.kind, combo: w.combo });
  }

  function checkPodProgress(w) {
    let allReady = w.boxes.length > 0;
    for (const bx of w.boxes) {
      if (bx.launched) continue;
      if (isPodReady(bx)) {
        if (!w.def.megaSave || w.podQueue.length > 0) launchPod(w, bx);
      } else allReady = false;
    }
    if (w.def.megaSave) {
      const readyNow = allReady && w.podQueue.length === 0 && w.boxes.every(bx => bx.launched || isPodReady(bx));
      if (readyNow && !w.megaReady) { w.megaReady = true; w.events.push({ type: 'mega_ready' }); }
      else if (!readyNow) w.megaReady = false;
    }
  }

  function finishPodLaunch(w, bx) {
    if (w.def.endless) {
      bx.kind = BOT_KINDS[Math.floor(w._rng() * BOT_KINDS.length)];
      bx.target = 2 + (w.launchedCount >= 4 && w._rng() < 0.45 ? 1 : 0);
      bx.items = []; bx.launched = false; bx.launchT = 0;
      w.events.push({ type: 'pod_arrive', boxIndex: bx.i, kind: bx.kind });
      return;
    }
    if (w.podQueue.length > 0) {
      const nd = w.podQueue.shift();
      bx.kind = nd.kind; bx.target = nd.target;
      bx.items = (nd.init || []).map(k => ({ id: nextId(w), kind: k, virus: k === 'virus', glitched: false, x: bx.x, y: bx.y }));
      bx.launched = false; bx.launchT = 0;
      layoutPodItems(bx);
      w.events.push({ type: 'pod_arrive', boxIndex: bx.i, kind: bx.kind });
      return;
    }
    if (w.boxes.every(b => b.launched)) {
      w.phase = 'win';
      w.score += 150 + Math.max(0, 3 - w.mistakes) * 50;
      w.events.push({ type: 'win', score: w.score });
    }
  }

  function cycleSelect(w, dir, add) {
    const candidates = [];
    for (const bx of w.boxes) if (!bx.launched) for (const it of bx.items) if (it.kind !== bx.kind || it.glitched || it.virus) candidates.push(it);
    for (const b of w.belts) for (const it of b.items) if (isVisible(it.x)) candidates.push(it);
    if (!candidates.length) return 'empty';
    candidates.sort((a, b) => b.x - a.x);
    const cur = w.sel.length ? candidates.findIndex(c => c.id === w.sel[w.sel.length - 1]) : -1;
    const nextIdx = cur < 0 ? 0 : (cur + (dir < 0 ? -1 : 1) + candidates.length) % candidates.length;
    const nextId = candidates[nextIdx].id;
    w.sel = add && w.sel.length ? (w.sel.indexOf(nextId) >= 0 ? w.sel.slice() : w.sel.concat(nextId)) : [nextId];
    w.events.push({ type: 'select', ids: w.sel.slice() });
    return 'ok';
  }

  function handleClick(w, x, y, add) {
    for (const bx of w.boxes) {
      if (bx.launched) continue;
      for (let i = bx.items.length - 1; i >= 0; i--) {
        const it = bx.items[i];
        if (Math.hypot(x - it.x, y - it.y) <= 34) {
          w.activeBox = bx.i;
          w.sel = add && w.sel.indexOf(it.id) < 0 ? w.sel.concat(it.id) : [it.id];
          w.events.push({ type: 'select', ids: w.sel.slice() });
          return 'ok';
        }
      }
      if (Math.abs(x - bx.x) <= 126 && Math.abs(y - bx.y) <= 82) {
        w.activeBox = bx.i; w.events.push({ type: 'focus_pod', boxIndex: bx.i }); return 'ok';
      }
    }
    let best = null, bestDist = 60;
    for (const b of w.belts) {
      for (const it of b.items) {
        if (!isVisible(it.x)) continue;
        const d = Math.min(Math.hypot(x - it.x, y - b.y), Math.hypot(x - it.x, y - (b.y - 18)));
        if (d <= bestDist) { bestDist = d; best = it; }
      }
    }
    if (!best) return 'miss';
    if (add) {
      const idx = w.sel.indexOf(best.id);
      if (idx >= 0) w.sel.splice(idx, 1); else w.sel.push(best.id);
    } else w.sel = [best.id];
    w.events.push({ type: 'select', ids: w.sel.slice() });
    return 'ok';
  }

  function findTargetPod(w, kind) {
    const ok = bx => !bx.launched && bx.kind === kind &&
      bx.items.filter(it => it.kind === kind && !it.glitched && !it.virus).length < bx.target &&
      bx.items.length < bx.target + 1;
    if (w.boxes[w.activeBox] && ok(w.boxes[w.activeBox])) return w.boxes[w.activeBox];
    return w.boxes.find(ok) || null;
  }

  function act(w, action) {
    if (!w || w.phase !== 'play' || !action) return 'inactive';
    pruneSelection(w);
    const t = action.type || action.t;
    if (t === 'click') return handleClick(w, action.x, action.y, !!action.add);
    if (t === 'select' || t === 'tab') return cycleSelect(w, action.dir || 1, !!action.add);
    if (t === 'focusPod') { if (w.boxes[action.boxIndex]) { w.activeBox = action.boxIndex; return 'ok'; } return 'invalid'; }

    if (t === 'selectAll' || t === 'all') {
      const ids = [];
      for (const b of w.belts) for (const it of b.items) if (isVisible(it.x) && !it.virus && !it.glitched) ids.push(it.id);
      if (!ids.length) { w.events.push({ type: 'warn', reason: 'no_bots' }); return 'empty'; }
      w.sel = ids; w.score += 10; w.events.push({ type: 'selectAll', ids: ids.slice() });
      return 'ok';
    }

    if (t === 'copy' || t === 'cut') {
      if (!w.sel.length) { w.events.push({ type: 'warn', reason: 'select_first' }); return 'no_selection'; }
      const selected = w.sel.map(id => findItem(w, id)).filter(Boolean);
      const heroes = selected.filter(f => !f.item.virus && !f.item.glitched);
      if (!heroes.length) {
        w.mistakes += 1; w.combo = 0;
        w.events.push({ type: 'mistake', reason: t === 'copy' ? 'virus_copy' : 'virus_cut' });
        return 'virus_error';
      }
      if (t === 'copy') {
        w.clip = { cut: false, items: heroes.map(f => ({ kind: f.item.kind })) };
        w.score += 15 * heroes.length;
        w.events.push({ type: 'copy', ids: heroes.map(f => f.item.id), kinds: w.clip.items.map(i => i.kind) });
        return 'ok';
      }
      pushUndo(w, 'cut');
      const removed = heroes.map(h => ({ id: h.item.id, kind: h.item.kind, x: h.x, y: h.y }));
      const remSet = new Set(heroes.map(h => h.item.id));
      for (const b of w.belts) b.items = b.items.filter(it => !remSet.has(it.id));
      for (const bx of w.boxes) { bx.items = bx.items.filter(it => !remSet.has(it.id)); layoutPodItems(bx); }
      w.clip = { cut: true, items: heroes.map(h => ({ kind: h.item.kind })) };
      w.sel = []; w.score += 20 * heroes.length;
      w.events.push({ type: 'cut', items: removed });
      checkPodProgress(w);
      return 'ok';
    }

    if (t === 'paste') {
      if (!w.clip || !w.clip.items.length) { w.events.push({ type: 'warn', reason: 'clip_empty' }); return 'empty_clip'; }
      const placements = [];
      for (const ci of w.clip.items) { const pod = findTargetPod(w, ci.kind); if (pod) placements.push({ pod: pod, kind: ci.kind }); }
      if (!placements.length) {
        if (w.megaReady || w.boxes.every(bx => bx.launched || isPodReady(bx))) {
          w.events.push({ type: 'warn', reason: 'pod_full' }); return 'pod_full';
        }
        w.mistakes += 1; w.combo = 0; w.events.push({ type: 'mistake', reason: 'wrong_pod', boxIndex: w.activeBox });
        return 'wrong_pod';
      }
      pushUndo(w, 'paste');
      const deployed = [];
      for (const pl of placements) {
        const pod = pl.pod;
        const validCount = pod.items.filter(it => it.kind === pod.kind && !it.glitched && !it.virus).length;
        if (validCount >= pod.target) continue;
        const bot = { id: nextId(w), kind: pl.kind, virus: false, glitched: false, x: pod.x, y: pod.y };
        pod.items.push(bot); layoutPodItems(pod); w.activeBox = pod.i;
        deployed.push({ id: bot.id, kind: bot.kind, boxIndex: pod.i, x: bot.x, y: bot.y });
      }
      if (!deployed.length) { w.undo.pop(); w.events.push({ type: 'warn', reason: 'pod_full' }); return 'pod_full'; }
      if (w.clip.cut) w.clip = null;
      w.score += 35 * deployed.length;
      w.events.push({ type: 'paste', items: deployed });
      checkPodProgress(w);
      return 'ok';
    }

    if (t === 'delete' || t === 'del') {
      let targets = w.sel.map(id => findItem(w, id)).filter(Boolean);
      if (!targets.length) {
        for (const bx of w.boxes) if (!bx.launched) {
          const bad = bx.items.find(it => it.virus || it.glitched);
          if (bad) { targets = [findItem(w, bad.id)]; break; }
        }
      }
      if (!targets.length) {
        let near = null;
        for (const b of w.belts) for (const it of b.items) if (isVisible(it.x) && it.virus && (!near || it.x < near.x)) near = it;
        if (near) targets = [findItem(w, near.id)];
      }
      if (!targets.length) { w.events.push({ type: 'warn', reason: 'nothing_to_zap' }); return 'no_target'; }
      pushUndo(w, 'delete');
      const remSet = new Set(targets.map(f => f.item.id));
      let viruses = 0;
      const zapped = targets.map(f => {
        if (f.item.virus || f.item.glitched) viruses++;
        return { id: f.item.id, kind: f.item.kind, virus: f.item.virus || f.item.glitched, x: f.x, y: f.y };
      });
      for (const b of w.belts) b.items = b.items.filter(it => !remSet.has(it.id));
      for (const bx of w.boxes) { bx.items = bx.items.filter(it => !remSet.has(it.id)); layoutPodItems(bx); }
      w.sel = [];
      if (viruses > 0) { w.zapped += viruses; w.combo += 1; w.score += 45 * viruses; }
      w.events.push({ type: 'delete', items: zapped, viruses: viruses });
      checkPodProgress(w);
      return 'ok';
    }

    if (t === 'undo' || t === 'redo') {
      const stack = t === 'undo' ? w.undo : w.redo;
      const other = t === 'undo' ? w.redo : w.undo;
      if (!stack.length) { w.events.push({ type: 'warn', reason: t === 'undo' ? 'nothing_undo' : 'nothing_redo' }); return t === 'undo' ? 'empty_undo' : 'empty_redo'; }
      other.push(snapshotState(w, t === 'undo' ? 'redo' : 'undo'));
      const snap = stack.pop();
      restoreSnapshot(w, snap);
      const bonk = t === 'undo' && (snap.reason === 'saboteur' || w.saboteur.state === 'laugh');
      if (bonk) { w.saboteur.state = 'away'; w.saboteur.timer = w.saboteur.every; w.bonks += 1; w.score += 60; }
      else w.score += t === 'undo' ? 15 : 25;
      w.events.push({ type: t, bonk: bonk });
      checkPodProgress(w);
      return 'ok';
    }

    if (t === 'saveShip' || t === 'save') {
      if (w.megaReady) {
        for (const bx of w.boxes) if (!bx.launched) launchPod(w, bx);
        w.megaReady = false; w.score += 200; w.events.push({ type: 'mega_launch' });
        return 'ok';
      }
      const readyPods = w.boxes.filter(bx => isPodReady(bx));
      if (readyPods.length) { for (const bx of readyPods) launchPod(w, bx); return 'ok'; }
      if (!w.saveBoostUsed) { w.saveBoostUsed = true; w.score += 20; w.events.push({ type: 'save_boost' }); return 'ok'; }
      w.events.push({ type: 'warn', reason: 'fill_ships_first' });
      return 'not_ready';
    }
    return 'unknown';
  }

  function stepSaboteur(w, dt) {
    const sab = w.saboteur;
    if (!sab.enabled || w.phase !== 'play') return;
    sab.timer -= dt;
    if (sab.state === 'away' && sab.timer <= 0) {
      const cand = w.boxes.find(bx => !bx.launched && bx.items.some(it => !it.glitched && !it.virus));
      if (!cand) { sab.timer = 4; return; }
      Object.assign(sab, { state: 'warn', targetBox: cand.i, x: cand.x + 90, y: cand.y - 44, timer: 1.6 });
      w.events.push({ type: 'saboteur_warn', boxIndex: cand.i });
    } else if (sab.state === 'warn' && sab.timer <= 0) {
      const bx = w.boxes[sab.targetBox];
      const victim = bx && !bx.launched && bx.items.find(it => !it.glitched && !it.virus);
      if (victim) {
        pushUndo(w, 'saboteur'); victim.glitched = true; w.megaReady = false;
        sab.state = 'laugh'; sab.timer = 5.0;
        w.events.push({ type: 'saboteur_strike', boxIndex: bx.i, itemId: victim.id });
      } else { sab.state = 'away'; sab.timer = sab.every; }
    } else if (sab.state === 'laugh' && sab.timer <= 0) {
      sab.state = 'away'; sab.timer = sab.every;
    }
  }

  function step(w, dt) {
    if (!w || w.phase !== 'play' || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    w.time += dt; w.offset += w.speed * dt;
    if (w.timeLimit > 0) {
      w.timeLeft = Math.max(0, w.timeLeft - dt);
      if (w.timeLeft <= 0) {
        w.phase = w.def.endless && w.launchedCount > 0 ? 'win' : 'lose';
        w.events.push(w.phase === 'win' ? { type: 'win', score: w.score, endless: true } : { type: 'timeup' });
        return;
      }
    }
    for (const b of w.belts) {
      for (const it of b.items) {
        const wasVis = isVisible(it.x);
        it.x -= w.speed * dt;
        if (!wasVis && isVisible(it.x) && !it.cued && !it.virus) {
          it.cued = true; w.events.push({ type: 'cue', id: it.id, kind: it.kind });
        }
      }
      while (b.items.length && b.items[0].x < BELT_EXIT_X) {
        const gone = b.items.shift();
        const si = w.sel.indexOf(gone.id);
        if (si >= 0) w.sel.splice(si, 1);
        if (gone.virus && w.def.tier > 0) { w.mistakes += 1; w.combo = 0; w.events.push({ type: 'virus_leak', beltIndex: b.i }); }
      }
      const rightmost = b.items.length ? b.items[b.items.length - 1].x : 0;
      if (!b.items.length || rightmost <= BELT_SPAWN_X - b.spacing) {
        const kind = pickSpawnKind(w, w._rng);
        b.items.push({ id: nextId(w), kind: kind, virus: kind === 'virus', glitched: false, x: b.items.length ? Math.max(BELT_SPAWN_X, rightmost + b.spacing) : BELT_SPAWN_X, y: b.y, cued: false });
      }
    }
    for (const bx of w.boxes) {
      if (bx.launched && bx.launchT > 0) {
        bx.launchT -= dt;
        if (bx.launchT <= 0) { bx.launchT = 0; finishPodLaunch(w, bx); if (w.phase !== 'play') return; }
      }
    }
    stepSaboteur(w, dt);
  }

  function hint(w) {
    if (!w || w.phase !== 'play') return null;
    pruneSelection(w);
    if (w.undo.length && w.undo[w.undo.length - 1].reason === 'saboteur') return { act: 'undo' };
    if (w.redo.length && w.def.preRedo) return { act: 'redo' };
    if (w.megaReady) return { act: 'saveShip' };
    for (const bx of w.boxes) if (!bx.launched) {
      const bad = bx.items.find(it => it.glitched || it.virus);
      if (bad) return w.undo.length ? { act: 'undo' } : { act: 'delete', targetId: bad.id };
    }
    for (const bx of w.boxes) if (!bx.launched) {
      const wrong = bx.items.find(it => it.kind !== bx.kind);
      if (wrong) return w.sel.length === 1 && w.sel[0] === wrong.id ? { act: 'cut', targetId: wrong.id } : { act: 'select', targetId: wrong.id, boxIndex: bx.i };
    }
    if (w.clip && w.clip.items.length) {
      for (const ci of w.clip.items) { const pod = findTargetPod(w, ci.kind); if (pod) return { act: 'paste', boxIndex: pod.i }; }
    }
    if (w.def.dock.indexOf('delete') >= 0) {
      for (const b of w.belts) { const v = b.items.find(it => isVisible(it.x) && it.virus && it.x < 560); if (v) return { act: 'delete', targetId: v.id }; }
    }
    if (w.sel.length) {
      const heroes = w.sel.map(id => findItem(w, id)).filter(f => f && !f.item.virus && !f.item.glitched);
      if (heroes.some(f => !!findTargetPod(w, f.item.kind))) return { act: 'copy' };
    }
    if (w.def.dock.indexOf('selectAll') >= 0) {
      let matchVis = 0;
      for (const b of w.belts) for (const it of b.items) if (isVisible(it.x) && !it.virus && findTargetPod(w, it.kind)) matchVis++;
      if (matchVis >= 2) return { act: 'selectAll' };
    }
    for (const b of w.belts) for (const it of b.items) if (isVisible(it.x) && !it.virus && findTargetPod(w, it.kind)) return { act: 'select', targetId: it.id };
    return null;
  }

  function defaultSave() {
    return { coins: 0, stars: new Array(12).fill(0), bestScore: new Array(13).fill(0), theme: 'cyan', armor: 'std', themes: ['cyan'], armors: ['std'] };
  }

  function loadSave(raw) {
    const d = defaultSave();
    if (!raw || typeof raw !== 'object') return d;
    if (typeof raw.coins === 'number' && raw.coins >= 0) d.coins = Math.floor(raw.coins);
    if (Array.isArray(raw.stars)) for (let i = 0; i < 12; i++) d.stars[i] = clamp(raw.stars[i] | 0, 0, 3);
    if (Array.isArray(raw.bestScore)) for (let i = 0; i < 13; i++) d.bestScore[i] = Math.max(0, raw.bestScore[i] | 0);
    if (Array.isArray(raw.themes)) for (const id of raw.themes) if (THEMES.some(t => t.id === id) && d.themes.indexOf(id) < 0) d.themes.push(id);
    if (Array.isArray(raw.armors)) for (const id of raw.armors) if (ARMORS.some(a => a.id === id) && d.armors.indexOf(id) < 0) d.armors.push(id);
    if (d.themes.indexOf(raw.theme) >= 0) d.theme = raw.theme;
    if (d.armors.indexOf(raw.armor) >= 0) d.armor = raw.armor;
    return d;
  }

  const isOpen = () => true;
  const totalStars = save => (save && Array.isArray(save.stars) ? save.stars : []).reduce((a, b) => a + (b | 0), 0);

  function starsFor(w) {
    if (!w || w.phase !== 'win') return 0;
    if (w.def.endless) return w.launchedCount >= 6 ? 3 : w.launchedCount >= 3 ? 2 : 1;
    return w.mistakes <= 1 ? 3 : w.mistakes <= 4 ? 2 : 1;
  }

  function outcome(w) {
    if (!w || w.phase !== 'win') return 0.15;
    const st = starsFor(w);
    return st === 3 ? 1 : st === 2 ? 0.72 : 0.5;
  }

  function applyResult(save, w) {
    const win = w.phase === 'win', stars = starsFor(w);
    const coins = win ? 12 + w.launchedCount * 4 + stars * 5 + w.zapped * 2 : Math.min(8, w.launchedCount * 2);
    save.coins += coins;
    let newBest = false;
    if (win && w.index < 12 && stars > save.stars[w.index]) save.stars[w.index] = stars;
    if (w.score > (save.bestScore[w.index] || 0)) { save.bestScore[w.index] = w.score; newBest = win; }
    return { win: win, stars: stars, coins: coins, best: newBest, score: w.score };
  }

  function buyItem(save, category, id) {
    const list = category === 'armor' ? ARMORS : THEMES;
    const owned = category === 'armor' ? save.armors : save.themes;
    const key = category === 'armor' ? 'armor' : 'theme';
    const item = list.find(x => x.id === id);
    if (!item) return 'invalid';
    if (owned.indexOf(id) >= 0) { save[key] = id; return 'equipped'; }
    if (save.coins < item.price) return 'poor';
    save.coins -= item.price; owned.push(id); save[key] = id;
    return 'bought';
  }

  const SFEngine = {
    W, H, POD_Y, CLONER, TURRET, BELT_EXIT_X, BELT_SPAWN_X,
    BOT_KINDS, BOTS, SHORTCUTS, TIERS, THEMES, ARMORS, MISSIONS, COUNT: 12,
    isVisible, sayBot, podSlot, isPodReady, create, findItem, act, step, hint,
    defaultSave, loadSave, isOpen, totalStars, starsFor, outcome, applyResult, buyItem
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SFEngine;
  if (typeof window !== 'undefined') window.SFEngine = SFEngine;
})();

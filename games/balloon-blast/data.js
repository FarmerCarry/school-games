/* Balloon Blast — arenas, critters, power-ups and the 18 adventure grids.
 * Plain data plus a tiny grid carver. Node tests load it with the engine. */
(function (BBD) {
  'use strict';

  BBD.COLS = 15;
  BBD.ROWS = 11;

  BBD.POWERUPS = [
    { id: 'balloon', icon: '🎈', name: 'بالون زائد', max: 6 },
    { id: 'range', icon: '💧', name: 'رش أبعد', max: 7 },
    { id: 'speed', icon: '👟', name: 'سرعة', max: 4 },
    { id: 'kick', icon: '🧤', name: 'ركلة', max: 1 },
    { id: 'slow', icon: '🐢', name: 'بطء', max: 1 }
  ];

  // wins / stars are the cheapest way to unlock. Frog is free.
  BBD.CRITTERS = [
    { id: 'frog', name: 'ضفدع', wins: 0, stars: 0, body: '#3dce6e', belly: '#d8ffb0', extra: '#2a9a4a', accent: '#ff5a7a' },
    { id: 'penguin', name: 'بطريق', wins: 1, stars: 2, body: '#2c3148', belly: '#fff7ea', extra: '#ffb703', accent: '#ffd23f' },
    { id: 'robot', name: 'روبوت', wins: 2, stars: 4, body: '#9aa8b8', belly: '#e7eef6', extra: '#ff5a7a', accent: '#7ec8ff' },
    { id: 'cat', name: 'قط', wins: 3, stars: 6, body: '#ffb703', belly: '#fff1c9', extra: '#ff7a1a', accent: '#ff8fb1' },
    { id: 'dino', name: 'دينو', wins: 4, stars: 9, body: '#6ed38a', belly: '#e7ffd4', extra: '#3aaa62', accent: '#ffd23f' },
    { id: 'panda', name: 'باندا', wins: 5, stars: 12, body: '#f4f1ea', belly: '#ffffff', extra: '#2a2a2a', accent: '#ff8fb1' },
    { id: 'bee', name: 'نحلة', wins: 7, stars: 16, body: '#ffd23f', belly: '#fff6c8', extra: '#2a2a2a', accent: '#ff7a1a' },
    { id: 'camel', name: 'جمل', wins: 9, stars: 20, body: '#e0a35a', belly: '#f6ddb0', extra: '#a56b32', accent: '#c47a3a' }
  ];

  BBD.BALLOONS = [
    { id: 'plain', name: 'ماء', stars: 0 },
    { id: 'stripes', name: 'خطوط', stars: 3 },
    { id: 'stars', name: 'نجوم', stars: 8 },
    { id: 'dots', name: 'نقاط', stars: 14 }
  ];

  BBD.ARENAS = [
    { id: 'garden', name: 'الحديقة', wins: 0, stars: 0,
      sky: ['#8ee0ff', '#fff3b0'], floor: ['#7dce6a', '#69c056'], grass: '#4e9a3e',
      pillar: '#7fbf78', pillarHi: '#e7ffd8', pillarDk: '#3e7a45',
      crate: '#d3924a', crateDk: '#a86a2c', nail: '#f3d7a1', edge: '#2f6a32' },
    { id: 'pool', name: 'المسبح', wins: 2, stars: 5,
      sky: ['#7fd4ff', '#e8fbff'], floor: ['#3ec6ff', '#2eb3f0'], grass: '#1e90d0',
      pillar: '#8fd4f2', pillarHi: '#ffffff', pillarDk: '#2a7eab',
      crate: '#ffb703', crateDk: '#e08a00', nail: '#fff1c2', edge: '#14608a' },
    { id: 'kitchen', name: 'المطبخ', wins: 4, stars: 10,
      sky: ['#ffe1c4', '#fff7ef'], floor: ['#f6e3c0', '#edd3a4'], grass: '#e7c48a',
      pillar: '#f2f0f4', pillarHi: '#ffffff', pillarDk: '#b9b4c2',
      crate: '#e07a5f', crateDk: '#b85540', nail: '#ffe0d4', edge: '#8c4a32' },
    { id: 'desert', name: 'مخيم الصحراء', wins: 6, stars: 15,
      sky: ['#ffd27a', '#fff0c2'], floor: ['#f0c36a', '#e6b350'], grass: '#d39a3e',
      pillar: '#e7b07a', pillarHi: '#fff0d2', pillarDk: '#a86b3c',
      crate: '#c47a3a', crateDk: '#8a4e22', nail: '#f0d0a0', edge: '#7a4a22' }
  ];

  BBD.WORLDS = [
    { id: 1, name: 'الحديقة', tint: 'garden' },
    { id: 2, name: 'حفلة المسبح', tint: 'pool' },
    { id: 3, name: 'مصنع الألعاب', tint: 'kitchen' }
  ];

  function snakeH(max) {
    const path = [];
    let r = 1, dir = 1;
    while (path.length < max && r <= 9) {
      if (dir === 1) { for (let c = 1; c <= 13 && path.length < max; c++) path.push([c, r]); }
      else { for (let c = 13; c >= 1 && path.length < max; c--) path.push([c, r]); }
      if (path.length >= max || r + 2 > 9) break;
      path.push([dir === 1 ? 13 : 1, r + 1]);
      r += 2; dir = -dir;
    }
    return path;
  }

  function snakeV(max) {
    const path = [];
    let c = 1, dir = 1;
    while (path.length < max && c <= 13) {
      if (dir === 1) { for (let r = 1; r <= 9 && path.length < max; r++) path.push([c, r]); }
      else { for (let r = 9; r >= 1 && path.length < max; r--) path.push([c, r]); }
      if (path.length >= max || c + 2 > 13) break;
      path.push([c + 1, dir === 1 ? 9 : 1]);
      c += 2; dir = -dir;
    }
    return path;
  }

  function straight(path, i) {
    if (i <= 0 || i >= path.length - 1) return false;
    const a = path[i - 1], b = path[i + 1];
    return a[0] === b[0] || a[1] === b[1];
  }

  function carve(spec) {
    const path = (spec.vert ? snakeV : snakeH)(spec.len || 62);
    const grid = Array.from({ length: 11 }, () => Array(15).fill('#'));
    const set = (c, r, ch) => { if (r >= 0 && r < 11 && c >= 0 && c < 15) grid[r][c] = ch; };
    const get = (c, r) => (r >= 0 && r < 11 && c >= 0 && c < 15) ? grid[r][c] : '#';
    for (const [c, r] of path) set(c, r, '.');
    const crates = [];
    const spots = [];
    const conflicts = (c, r) => spots.some(([pc, pr]) => {
      const dc = Math.abs(pc - c), dr = Math.abs(pr - r);
      if (dc <= 1 && dr <= 1 && dc !== 0 && dr !== 0) return true;
      if ((dc === 0 || dr === 0) && dc + dr === 2 && get((pc + c) / 2, (pr + r) / 2) !== '#') return true;
      return false;
    });
    let prev = -99;
    for (let i = 4; i < path.length - 4 && crates.length < spec.crates; i++) {
      if (!straight(path, i) || i - prev < 4) continue;
      const [c, r] = path[i];
      if ((c === 1 && r === 1) || (c === 2 && r === 1) || (c === 1 && r === 2)) continue;
      if (conflicts(c, r)) continue;
      set(c, r, 'C');
      crates.push(i);
      spots.push([c, r]);
      prev = i;
    }
    if (crates.length < spec.crates) throw new Error(spec.id + ' only carved ' + crates.length + ' crates');
    const robots = [];
    (spec.robotEvery || []).forEach(n => {
      const ci = crates[n];
      if (ci == null) return;
      const ri = ci + 2;
      if (ri >= path.length || crates.indexOf(ri) >= 0) return;
      const [c, r] = path[ri];
      if (get(c, r) !== '.') return;
      set(c, r, 'R');
      robots.push(ri);
    });
    set(path[0][0], path[0][1], '1');
    set(path[1][0], path[1][1], '2');
    let exit = null, cake = null, duck = null;
    if (spec.kind === 'exit') {
      const [c, r] = path[path.length - 1];
      set(c, r, 'E');
      exit = [c, r];
    }
    if (spec.kind === 'cake') cake = path[0].slice();
    if (spec.kind === 'boss') {
      const di = crates[crates.length - 1] + 3;
      if (di >= path.length) throw new Error(spec.id + ' duck is off the path');
      const [c, r] = path[di];
      set(c, r, 'D');
      // A second cell beside the duck, also next to the approach cell, so a waddle stays in the splash.
      const approach = path[di - 1];
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let c2 = c, r2 = r;
      for (const [dc, dr] of options) {
        const nc = c + dc, nr = r + dr;
        if (nc === approach[0] && nr === approach[1]) continue;
        if (get(nc, nr) === '#' && Math.abs(nc - approach[0]) + Math.abs(nr - approach[1]) === 1) {
          set(nc, nr, '.'); c2 = nc; r2 = nr; break;
        }
      }
      duck = { at: di, c: c, r: r, c2: c2, r2: r2 };
    }
    const plan = [];
    crates.forEach((ci, n) => {
      plan.push({ op: 'bomb', at: ci });
      const rob = robots.find(ri => ri === ci + 2);
      if (rob != null && spec.kind !== 'boss') plan.push({ op: 'pop', at: rob });
    });
    if (spec.kind === 'exit') plan.push({ op: 'exit', at: path.length - 1 });
    if (spec.kind === 'cake') plan.push({ op: 'hold' });
    if (spec.kind === 'boss') plan.push({ op: 'boss', at: duck.at });
    return {
      path: path, crates: crates, robots: robots, exit: exit, cake: cake, duck: duck, plan: plan,
      grid: grid.map(row => row.join(''))
    };
  }

  const NAMES = {
    'w1-1': 'بوابة الزهور', 'w1-2': 'سياج الجزر', 'w1-3': 'روبوتات الورد', 'w1-4': 'كعكة النزهة',
    'w1-5': 'مخرج الدفيئة', 'w1-6': 'البطة العملاقة',
    'w2-1': 'ممر العوامات', 'w2-2': 'روبوتات الماء', 'w2-3': 'كعكة المسبح', 'w2-4': 'مخرج الزحليقة',
    'w2-5': 'حراس النوافير', 'w2-6': 'بطة المسبح',
    'w3-1': 'سير الصناديق', 'w3-2': 'روبوتات الزنبرك', 'w3-3': 'كعكة المعمل', 'w3-4': 'مخرج الورشة',
    'w3-5': 'حراس الدمى', 'w3-6': 'البطة الرئيسة'
  };

  // 3 worlds × 6 stages. Crates sit on a one-cell snake so a starting range of 1
  // has to wait out a fuse for every gate. That is what keeps a clear over 20s.
  const SPECS = [];
  for (let w = 1; w <= 3; w++) {
    const kinds = ['exit', 'robots', 'cake', 'exit', 'robots', 'boss'];
    for (let s = 1; s <= 6; s++) {
      const kind = kinds[s - 1];
      SPECS.push({
        id: 'w' + w + '-' + s, world: w, stage: s, kind: kind,
        name: NAMES['w' + w + '-' + s],
        vert: (w + s) % 2 === 0,
        len: kind === 'boss' ? 48 : 62,
        crates: kind === 'boss' ? 4 : 9,
        robotEvery: kind === 'robots' ? [1, 4, 7] : kind === 'cake' ? [2, 6] : [],
        par: kind === 'boss' ? 70 : kind === 'cake' ? 75 : kind === 'robots' ? 70 : 65,
        wake: kind === 'cake' ? 70 : 0
      });
    }
  }

  BBD.STAGES = SPECS.map(spec => {
    const built = carve(spec);
    return {
      id: spec.id, world: spec.world, stage: spec.stage, kind: spec.kind, name: spec.name,
      par: spec.par, wake: spec.wake, arena: BBD.WORLDS[spec.world - 1].tint,
      grid: built.grid, path: built.path, plan: built.plan,
      crates: built.crates, robots: built.robots, exit: built.exit, cake: built.cake, duck: built.duck
    };
  });

  BBD.stageById = function (id) {
    for (let i = 0; i < BBD.STAGES.length; i++) if (BBD.STAGES[i].id === id) return BBD.STAGES[i];
    return BBD.STAGES[0];
  };
  BBD.critter = function (id) {
    for (let i = 0; i < BBD.CRITTERS.length; i++) if (BBD.CRITTERS[i].id === id) return BBD.CRITTERS[i];
    return BBD.CRITTERS[0];
  };
  BBD.arena = function (id) {
    for (let i = 0; i < BBD.ARENAS.length; i++) if (BBD.ARENAS[i].id === id) return BBD.ARENAS[i];
    return BBD.ARENAS[0];
  };
})(globalThis.BBD = globalThis.BBD || {});

/* هجوم الروبوتات — deterministic sim. No DOM, no Kit, no per-frame allocation.
   Pools, a 64px spatial hash, and fixed caps: 300 robots, 250 shots, 200 bolts. */
(function (RS) {
  'use strict';

  const D = globalThis.RSD;
  const W = D.W, H = D.H, CELL = D.CELL;
  const COLS = Math.ceil(W / CELL), ROWS = Math.ceil(H / CELL), HASH = COLS * ROWS;
  const CAP_R = 300, CAP_P = 250, CAP_B = 200, CAP_Z = 80, HIT_N = 6, EV = 96;
  const KING = 8, SPLIT = 4, MINI = 6, MINIBOSS = 7;
  const ZERO = { x: 0, y: 0, dash: 0 };

  RS.CAP_R = CAP_R;
  RS.CAP_P = CAP_P;
  RS.CAP_B = CAP_B;
  RS.CAP_Z = CAP_Z;
  RS.W = W;
  RS.H = H;
  RS.CELL = CELL;

  function mulberry(run) {
    return function () {
      let s = (run.seed + 0x6D2B79F5) | 0;
      run.seed = s;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tierMul(tier, a, b) {
    const t = (Math.max(1, Math.min(5, tier | 0)) - 1) / 4;
    return a + (b - a) * t;
  }

  function allocOf(free, freeN, alive) {
    return function (run) {
      const n = run[freeN];
      if (n <= 0) return -1;
      const id = run[free][n - 1];
      run[freeN] = n - 1;
      run[alive][id] = 1;
      return id;
    };
  }
  const allocR = allocOf('rFree', 'rFreeN', 'rAlive');
  const allocP = allocOf('pFree', 'pFreeN', 'pAlive');
  const allocB = allocOf('bFree', 'bFreeN', 'bAlive');
  const allocZ = allocOf('zFree', 'zFreeN', 'zAlive');

  function freeOf(free, freeN, alive) {
    return function (run, id) {
      if (!run[alive][id]) return;
      run[alive][id] = 0;
      run[free][run[freeN]++] = id;
    };
  }
  const freeR = freeOf('rFree', 'rFreeN', 'rAlive');
  const freeP = freeOf('pFree', 'pFreeN', 'pAlive');
  const freeB = freeOf('bFree', 'bFreeN', 'bAlive');
  const freeZ = freeOf('zFree', 'zFreeN', 'zAlive');

  function fillFree(buf, n) {
    for (let i = 0; i < n; i++) buf[i] = n - 1 - i;
  }

  RS.newRun = function (opts) {
    opts = opts || {};
    const players = opts.players === 2 ? 2 : 1;
    const tier = Math.max(1, Math.min(5, opts.tier == null ? 1 : opts.tier | 0));
    const map = Math.max(1, Math.min(3, opts.map == null ? 1 : opts.map | 0)) - 1;
    const quick = !!opts.quick && !opts.endless;
    const run = {
      seed: (opts.seed == null ? 1 : opts.seed) >>> 0,
      players: players, map: map, quick: quick, endless: !!opts.endless,
      tier: tier,
      spawnMul: opts.spawnMul == null ? tierMul(tier, 0.7, 1.25) : opts.spawnMul,
      hpMul: opts.hpMul == null ? tierMul(tier, 0.8, 1.3) : opts.hpMul,
      bossMul: opts.bossMul == null ? tierMul(tier, 0.82, 1.28) : opts.bossMul,
      timeScale: quick ? 2 : 1,
      cardsOn: opts.cards !== false,
      immortal: !!opts.immortal,
      noWeapons: !!opts.noWeapons,
      t: 0, xp: 0, level: 1, next: 16, queue: 0, cards: 0, combo: 0, comboT: 0,
      pops: 0, bolts: 0, revives: 0, bossPopped: 0, over: '',
      kingAlive: 0, kingId: -1, miniCount: 0, spawnT: 0.85, frame: 0, maxR: 20,
      evN: 0, offerFor: 0
    };
    run.rng = mulberry(run);
    run.bossAt = 240 / run.timeScale;
    run.nextMini = 90 / run.timeScale;
    run.nextKing = run.bossAt;

    run.rAlive = new Uint8Array(CAP_R);
    run.rGen = new Uint16Array(CAP_R);
    run.rType = new Uint8Array(CAP_R);
    run.rx = new Float32Array(CAP_R);
    run.ry = new Float32Array(CAP_R);
    run.rvx = new Float32Array(CAP_R);
    run.rvy = new Float32Array(CAP_R);
    run.rhp = new Float32Array(CAP_R);
    run.rmax = new Float32Array(CAP_R);
    run.rr = new Float32Array(CAP_R);
    run.rsp = new Float32Array(CAP_R);
    run.rMode = new Uint8Array(CAP_R);
    run.rT = new Float32Array(CAP_R);
    run.rHurt = new Float32Array(CAP_R);
    run.rFree = new Uint16Array(CAP_R);
    run.rFreeN = CAP_R;
    fillFree(run.rFree, CAP_R);

    run.pAlive = new Uint8Array(CAP_P);
    run.pKind = new Uint8Array(CAP_P);
    run.pOwner = new Int8Array(CAP_P);
    run.pPierce = new Uint8Array(CAP_P);
    run.px = new Float32Array(CAP_P);
    run.py = new Float32Array(CAP_P);
    run.pvx = new Float32Array(CAP_P);
    run.pvy = new Float32Array(CAP_P);
    run.plife = new Float32Array(CAP_P);
    run.pdmg = new Float32Array(CAP_P);
    run.pr = new Float32Array(CAP_P);
    run.ptx = new Float32Array(CAP_P);
    run.pty = new Float32Array(CAP_P);
    run.pAge = new Float32Array(CAP_P);
    run.pRet = new Uint8Array(CAP_P);
    run.pHit = new Uint16Array(CAP_P * HIT_N);
    run.pHitG = new Uint16Array(CAP_P * HIT_N);
    run.pFree = new Uint16Array(CAP_P);
    run.pFreeN = CAP_P;
    fillFree(run.pFree, CAP_P);

    run.bAlive = new Uint8Array(CAP_B);
    run.bx = new Float32Array(CAP_B);
    run.by = new Float32Array(CAP_B);
    run.bvx = new Float32Array(CAP_B);
    run.bvy = new Float32Array(CAP_B);
    run.bFree = new Uint16Array(CAP_B);
    run.bFreeN = CAP_B;
    fillFree(run.bFree, CAP_B);

    run.zAlive = new Uint8Array(CAP_Z);
    run.zKind = new Uint8Array(CAP_Z);
    run.zx = new Float32Array(CAP_Z);
    run.zy = new Float32Array(CAP_Z);
    run.zr = new Float32Array(CAP_Z);
    run.zdps = new Float32Array(CAP_Z);
    run.zlife = new Float32Array(CAP_Z);
    run.zFree = new Uint16Array(CAP_Z);
    run.zFreeN = CAP_Z;
    fillFree(run.zFree, CAP_Z);

    run.hHead = new Int16Array(HASH);
    run.hNext = new Int16Array(CAP_R);
    run.hHead.fill(-1);

    run.x = new Float32Array(2);
    run.y = new Float32Array(2);
    run.hp = new Float32Array(2);
    run.maxHp = new Float32Array(2);
    run.speed = new Float32Array(2);
    run.inv = new Float32Array(2);
    run.dashT = new Float32Array(2);
    run.dashCd = new Float32Array(2);
    run.ang = new Float32Array(2);
    run.aim = new Float32Array(2);
    run.shield = new Float32Array(2);
    run.shieldMax = new Float32Array(2);
    run.shieldT = new Float32Array(2);
    run.hurtN = new Float32Array(2);
    run.dashN = new Float32Array(2);
    run.revT = new Float32Array(2);
    run.wcd = [new Float32Array(10), new Float32Array(10)];
    run.lv = [new Uint8Array(10), new Uint8Array(10)];
    run.evo = [new Uint8Array(2), new Uint8Array(2)];
    run.reroll = new Uint8Array(2);
    run.pick = new Int16Array(2);
    run.pick[0] = run.pick[1] = -1;
    run.offers = [[], []];
    run.prad = 18;

    run.ev = new Array(EV);
    for (let i = 0; i < EV; i++) run.ev[i] = { k: 0, a: 0, b: 0, x: 0, y: 0 };

    const meta = opts.meta || {};
    const heart = clamp(meta.heart | 0, 0, 5);
    const spd = clamp(meta.speed | 0, 0, 5);
    const reroll = clamp(meta.reroll | 0, 0, 5);
    const heroes = opts.hero || [0, 0];
    run.x[0] = players === 2 ? 1080 : 1200;
    run.y[0] = 700;
    run.x[1] = 1320;
    run.y[1] = 700;
    for (let p = 0; p < players; p++) {
      const hero = D.heroes[clamp(heroes[p] | 0, 0, D.heroes.length - 1)];
      run.maxHp[p] = hero.hp + heart;
      run.hp[p] = run.maxHp[p];
      run.speed[p] = hero.speed * (1 + 0.05 * spd);
      run.reroll[p] = reroll;
      for (let u = 0; u < 10; u++) run.lv[p][u] = hero.start[u] || 0;
      run.shieldMax[p] = run.lv[p][D.SHIELD];
      run.shield[p] = run.shieldMax[p];
      run.aim[p] = p === 0 ? 0 : Math.PI;
    }
    // A few wind-up toys are already in the box, so the first second is a game.
    for (let n = 0; n < 4; n++) {
      const a = n / 4 * 6.2831853;
      RS.spawnRobot(run, 0, 1200 + Math.cos(a) * 520, 700 + Math.sin(a) * 300);
    }
    if (opts.levels) {
      for (let u = 0; u < 10; u++) if (opts.levels[u]) run.lv[0][u] = opts.levels[u];
      run.shieldMax[0] = run.lv[0][D.SHIELD];
      run.shield[0] = run.shieldMax[0];
      run.maxHp[0] += Math.max(0, run.lv[0][D.HEART] - (D.heroes[clamp(heroes[0] | 0, 0, 5)].start[D.HEART] || 0));
      run.hp[0] = run.maxHp[0];
    }
    return run;
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function emit(run, k, a, b, x, y) {
    let i = run.evN;
    if (i >= EV) {
      if (k < 3) return;
      i = EV - 1;
    } else run.evN = i + 1;
    const e = run.ev[i];
    e.k = k; e.a = a; e.b = b; e.x = x; e.y = y;
  }

  function cellAt(x, y) {
    let c = (x / CELL) | 0, r = (y / CELL) | 0;
    if (c < 0) c = 0; else if (c >= COLS) c = COLS - 1;
    if (r < 0) r = 0; else if (r >= ROWS) r = ROWS - 1;
    return r * COLS + c;
  }

  function buildHash(run) {
    const head = run.hHead, next = run.hNext, alive = run.rAlive;
    head.fill(-1);
    let maxR = 16;
    const rr = run.rr, rx = run.rx, ry = run.ry;
    for (let i = 0; i < CAP_R; i++) {
      if (!alive[i]) continue;
      if (rr[i] > maxR) maxR = rr[i];
      const cell = cellAt(rx[i], ry[i]);
      next[i] = head[cell];
      head[cell] = i;
    }
    run.maxR = maxR;
  }

  // Visit every robot whose center can overlap a circle. The callback does the exact test.
  function queryRobots(run, x, y, rad, fn) {
    const reach = rad + run.maxR;
    let c0 = ((x - reach) / CELL) | 0, c1 = ((x + reach) / CELL) | 0;
    let r0 = ((y - reach) / CELL) | 0, r1 = ((y + reach) / CELL) | 0;
    if (c0 < 0) c0 = 0; if (c1 >= COLS) c1 = COLS - 1;
    if (r0 < 0) r0 = 0; if (r1 >= ROWS) r1 = ROWS - 1;
    const head = run.hHead, next = run.hNext;
    for (let r = r0; r <= r1; r++) {
      const row = r * COLS;
      for (let c = c0; c <= c1; c++) {
        let i = head[row + c], guard = 0;
        while (i >= 0 && guard++ < CAP_R) {
          const nextId = next[i];
          if (fn(i) === false) return;
          i = nextId;
        }
      }
    }
  }

  function overlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    const s = ar + br;
    return dx * dx + dy * dy <= s * s;
  }

  function pairKey(a, b) { return a * 1024 + b; }

  // Geometric overlaps the hash must not miss or invent: every projectile↔robot
  // and every player↔robot circle pair. Enemy shots are projectiles too.
  RS.robotHits = function (run) {
    buildHash(run);
    const out = [];
    for (let pi = 0; pi < CAP_P; pi++) {
      if (!run.pAlive[pi]) continue;
      const rad = run.pr[pi];
      queryRobots(run, run.px[pi], run.py[pi], rad, function (ri) {
        if (overlap(run.px[pi], run.py[pi], rad, run.rx[ri], run.ry[ri], run.rr[ri])) out.push(pairKey(pi, ri));
      });
    }
    for (let p = 0; p < run.players; p++) {
      queryRobots(run, run.x[p], run.y[p], run.prad, function (ri) {
        if (overlap(run.x[p], run.y[p], run.prad, run.rx[ri], run.ry[ri], run.rr[ri])) out.push(pairKey(1000 + p, ri));
      });
    }
    out.sort(function (a, b) { return a - b; });
    return dedupe(out);
  };

  RS.robotHitsBrute = function (run) {
    const out = [];
    for (let pi = 0; pi < CAP_P; pi++) {
      if (!run.pAlive[pi]) continue;
      for (let ri = 0; ri < CAP_R; ri++) {
        if (!run.rAlive[ri]) continue;
        if (overlap(run.px[pi], run.py[pi], run.pr[pi], run.rx[ri], run.ry[ri], run.rr[ri])) out.push(pairKey(pi, ri));
      }
    }
    for (let p = 0; p < run.players; p++) {
      for (let ri = 0; ri < CAP_R; ri++) {
        if (!run.rAlive[ri]) continue;
        if (overlap(run.x[p], run.y[p], run.prad, run.rx[ri], run.ry[ri], run.rr[ri])) out.push(pairKey(1000 + p, ri));
      }
    }
    out.sort(function (a, b) { return a - b; });
    return dedupe(out);
  };

  function dedupe(out) {
    // Query visits each robot once per projectile (one cell). Keep this as a guard.
    if (out.length < 2) return out;
    let n = 1;
    for (let i = 1; i < out.length; i++) if (out[i] !== out[n - 1]) out[n++] = out[i];
    out.length = n;
    return out;
  }
  RS.spawnRobot = function (run, type, x, y) {
    if (run.rFreeN <= 0) return -1;
    const spec = D.bots[type];
    if (!spec) return -1;
    const id = allocR(run);
    run.rGen[id] = (run.rGen[id] + 1) & 65535;
    run.rType[id] = type;
    run.rx[id] = x;
    run.ry[id] = y;
    run.rvx[id] = 0;
    run.rvy[id] = 0;
    const mapHp = type === KING ? 1 : D.maps[run.map].hp;
    const hp = Math.max(1, Math.round(spec.hp * run.hpMul * mapHp));
    run.rhp[id] = hp;
    run.rmax[id] = hp;
    run.rr[id] = spec.r;
    run.rsp[id] = spec.speed * (type === KING ? 1 : D.maps[run.map].speed);
    run.rMode[id] = 0;
    run.rT[id] = 0.4 + (id % 7) * 0.05;
    run.rHurt[id] = 0;
    if (type === KING) {
      run.kingAlive = 1;
      run.kingId = id;
      emit(run, 11, 1, 0, x, y);
    } else if (type === MINIBOSS) emit(run, 11, 0, 0, x, y);
    return id;
  };

  function makeRoom(run) {
    if (run.rFreeN > 0) return;
    for (let i = 0; i < CAP_R; i++) {
      if (run.rAlive[i] && run.rType[i] !== KING) { freeR(run, i); return; }
    }
  }

  const EDGE = { x: 0, y: 0 };
  function edgeInto(run, rng, out) {
    const side = (rng() * 4) | 0;
    let x, y;
    if (side === 0) { x = 28; y = 40 + rng() * (H - 80); }
    else if (side === 1) { x = W - 28; y = 40 + rng() * (H - 80); }
    else if (side === 2) { x = 40 + rng() * (W - 80); y = 28; }
    else { x = 40 + rng() * (W - 80); y = H - 28; }
    let best = 1e12, px = run.x[0], py = run.y[0];
    for (let p = 0; p < run.players; p++) {
      const dx = x - run.x[p], dy = y - run.y[p], d = dx * dx + dy * dy;
      if (d < best) { best = d; px = run.x[p]; py = run.y[p]; }
    }
    if (best < 280 * 280) {
      const dx = x - px, dy = y - py;
      const inv = 1 / (Math.sqrt(best) || 1);
      x = clamp(px + dx * inv * 460, 28, W - 28);
      y = clamp(py + dy * inv * 460, 28, H - 28);
    }
    out.x = x; out.y = y;
  }

  function breakIndex(sched) {
    const br = D.spawn.breaks;
    let bi = 0;
    while (bi < br.length - 1 && sched >= br[bi + 1]) bi++;
    return bi;
  }

  function pickType(run, rng, bi) {
    const w = D.spawn.weights[bi];
    const add = D.maps[run.map].add;
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += w[i] + add[i];
    let r = rng() * sum;
    for (let i = 0; i < 6; i++) {
      r -= w[i] + add[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  function nearestPlayer(run, x, y) {
    let best = 0, bd = 1e12;
    for (let p = 0; p < run.players; p++) {
      if (run.hp[p] <= 0) continue;
      const dx = run.x[p] - x, dy = run.y[p] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function addXp(run, n) {
    if (!run.cardsOn || n <= 0) return;
    run.xp += n;
    while (run.level < 22 && run.xp >= run.next) {
      run.xp -= run.next;
      run.level++;
      run.next = 10 + run.level * 6;
      run.queue++;
    }
  }

  function dropBolts(run, x, y, n) {
    const rng = run.rng;
    for (let i = 0; i < n; i++) {
      if (run.bFreeN <= 0) return;
      const id = allocB(run);
      const a = rng() * 6.2831853;
      const sp = 40 + rng() * 90;
      run.bx[id] = x;
      run.by[id] = y;
      run.bvx[id] = Math.cos(a) * sp;
      run.bvy[id] = Math.sin(a) * sp;
    }
  }

  function killRobot(run, id) {
    if (!run.rAlive[id]) return;
    const type = run.rType[id];
    const x = run.rx[id], y = run.ry[id];
    const spec = D.bots[type];
    freeR(run, id);
    run.pops++;
    run.combo++;
    run.comboT = 1.7;
    const bonus = run.combo >= 12 ? 1 : 0;
    addXp(run, spec.xp + bonus);
    dropBolts(run, x, y, spec.bolts);
    emit(run, 1, type, spec.xp, x, y);
    if (type === SPLIT) {
      RS.spawnRobot(run, MINI, x + 16, y);
      RS.spawnRobot(run, MINI, x - 16, y);
    }
    if (type === KING) {
      run.kingAlive = 0;
      run.kingId = -1;
      run.bossPopped = 1;
      emit(run, 7, 1, 0, x, y);
      if (run.endless) run.nextKing = run.t + 120;
      else run.over = 'win';
    }
  }

  function damageRobot(run, id, dmg, owner) {
    if (!run.rAlive[id] || dmg <= 0) return;
    run.rhp[id] -= dmg;
    run.rHurt[id] = 0.12;
    if (run.rType[id] === KING) {
      run.bossHits = (run.bossHits || 0) + 1;
      emit(run, 5, dmg, owner, run.rx[id], run.ry[id]);
    }
    if (run.rhp[id] <= 0) killRobot(run, id);
  }

  function alreadyHit(run, pi, ri) {
    const b = pi * HIT_N, g = run.rGen[ri];
    for (let k = 0; k < HIT_N; k++) if (run.pHit[b + k] === ri + 1 && run.pHitG[b + k] === g) return true;
    return false;
  }
  function markHit(run, pi, ri) {
    const b = pi * HIT_N, g = run.rGen[ri];
    for (let k = 0; k < HIT_N; k++) if (run.pHit[b + k] === 0) {
      run.pHit[b + k] = ri + 1;
      run.pHitG[b + k] = g;
      return;
    }
  }
  function clearHits(run, pi) {
    const b = pi * HIT_N;
    for (let k = 0; k < HIT_N; k++) run.pHit[b + k] = 0;
  }

  function launch(run, owner, kind, x, y, vx, vy, dmg, pierce, life, rad, tx, ty) {
    if (run.pFreeN <= 0) return -1;
    const id = allocP(run);
    run.pKind[id] = kind;
    run.pOwner[id] = owner;
    run.pPierce[id] = pierce;
    run.px[id] = x;
    run.py[id] = y;
    run.pvx[id] = vx;
    run.pvy[id] = vy;
    run.pdmg[id] = dmg;
    run.plife[id] = life;
    run.pr[id] = rad;
    run.ptx[id] = tx;
    run.pty[id] = ty;
    run.pAge[id] = 0;
    run.pRet[id] = 0;
    clearHits(run, id);
    return id;
  }

  function lvRow(run, p, id) {
    const n = run.lv[p][id];
    return n > 0 ? n - 1 : -1;
  }

  function weapons(run, dt) {
    if (run.noWeapons) return;
    for (let p = 0; p < run.players; p++) {
      if (run.hp[p] <= 0) continue;
      const cds = run.wcd[p];
      for (let u = 0; u < 10; u++) cds[u] -= dt;
      const foam = lvRow(run, p, D.FOAM);
      if (foam >= 0 && cds[D.FOAM] <= 0) {
        const spec = D.weapons[D.FOAM];
        const aim = nearestRobot(run, run.x[p], run.y[p], 820);
        if (aim >= 0) {
          const dx = run.rx[aim] - run.x[p], dy = run.ry[aim] - run.y[p];
          const inv = 1 / (Math.sqrt(dx * dx + dy * dy) || 1);
          run.aim[p] = Math.atan2(dy, dx);
          let pierce = spec.pierce[foam];
          let dmg = spec.dmg[foam];
          if (run.evo[p][1]) { pierce += 2; dmg += 8; }
          launch(run, p, 0, run.x[p] + dx * inv * 28, run.y[p] + dy * inv * 28, dx * inv * spec.speed, dy * inv * spec.speed, dmg, pierce, 0.9, 8, 0, 0);
          cds[D.FOAM] = spec.cd[foam];
        }
      }
      const fr = lvRow(run, p, D.FRISBEE);
      if (fr >= 0 && cds[D.FRISBEE] <= 0) {
        const spec = D.weapons[D.FRISBEE];
        const aim = nearestRobot(run, run.x[p], run.y[p], 900);
        let dx = Math.cos(run.aim[p]), dy = Math.sin(run.aim[p]);
        if (aim >= 0) {
          dx = run.rx[aim] - run.x[p]; dy = run.ry[aim] - run.y[p];
          const inv = 1 / (Math.sqrt(dx * dx + dy * dy) || 1);
          dx *= inv; dy *= inv;
        }
        launch(run, p, 1, run.x[p], run.y[p], dx * spec.speed, dy * spec.speed, spec.dmg[fr], spec.pierce[fr], 2.4, 12, run.x[p], run.y[p]);
        cds[D.FRISBEE] = spec.cd[fr];
      }
      const bal = lvRow(run, p, D.BALLOON);
      if (bal >= 0 && cds[D.BALLOON] <= 0) {
        const spec = D.weapons[D.BALLOON];
        const aim = nearestRobot(run, run.x[p], run.y[p], 760);
        if (aim >= 0) {
          const tx = run.rx[aim], ty = run.ry[aim];
          const dx = tx - run.x[p], dy = ty - run.y[p];
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const sp = Math.max(180, dist / 0.55);
          launch(run, p, 2, run.x[p], run.y[p], dx / dist * sp, dy / dist * sp, spec.dmg[bal], 1, 1.3, 10, tx, ty);
          // stash radius in pAge's partner: use pty already tx. Radius stored by overloading plife? Keep rad on a side channel: pHit unused. Use pr after travel. Store splash in ptx? ptx is target.
          // Splash radius rides in the high byte via a parallel use of pPierce's neighbor: store in pAge after launch? I'll put splash in run and read spec at explode from owner level.
          cds[D.BALLOON] = spec.cd[bal];
        }
      }
      const paint = lvRow(run, p, D.PAINT);
      if (paint >= 0 && cds[D.PAINT] <= 0) {
        const moved = run._moved && run._moved[p];
        if (moved) {
          const spec = D.weapons[D.PAINT];
          const id = allocZ(run);
          if (id >= 0) {
            run.zKind[id] = 0;
            run.zx[id] = run.x[p];
            run.zy[id] = run.y[p];
            run.zr[id] = spec.rad[paint];
            run.zdps[id] = spec.dmg[paint];
            run.zlife[id] = 1.55;
          }
          cds[D.PAINT] = spec.cd[paint];
        }
      }
    }
  }

  function nearestRobot(run, x, y, maxDist) {
    let best = -1, bd = maxDist * maxDist;
    const alive = run.rAlive, rx = run.rx, ry = run.ry;
    for (let i = 0; i < CAP_R; i++) {
      if (!alive[i]) continue;
      const dx = rx[i] - x, dy = ry[i] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function tickOrbit(run, p, dt) {
    if (run.noWeapons) return;
    const ring = lvRow(run, p, D.RING);
    const ducks = lvRow(run, p, D.DUCKS);
    const tornado = run.evo[p][0] === 1;
    run.ang[p] += dt * (tornado ? 5.2 : 2.4);
    if (ring >= 0 && run.wcd[p][D.RING] <= 0) {
      const spec = D.weapons[D.RING];
      orbitDamage(run, p, spec.n[ring], spec.orbit, spec.dmg[ring], 16);
      run.wcd[p][D.RING] = spec.cd[ring];
    }
    if (ducks >= 0 && run.wcd[p][D.DUCKS] <= 0) {
      const spec = D.weapons[D.DUCKS];
      if (tornado) tornadoTick(run, p, spec.dmg[4] + 10);
      else orbitDamage(run, p, spec.n[ducks], spec.orbit, spec.dmg[ducks], 14);
      run.wcd[p][D.DUCKS] = tornado ? 0.22 : spec.cd[ducks];
    } else if (tornado && ducks < 0 && run.wcd[p][D.DUCKS] <= 0) {
      tornadoTick(run, p, 20);
      run.wcd[p][D.DUCKS] = 0.22;
    }
  }

  function orbitDamage(run, p, n, orbit, dmg, rad) {
    const base = run.ang[p];
    for (let i = 0; i < n; i++) {
      const a = base + i * 6.2831853 / n;
      const x = run.x[p] + Math.cos(a) * orbit;
      const y = run.y[p] + Math.sin(a) * orbit;
      hurtCircle(run, x, y, rad, dmg, p);
    }
  }

  function tornadoTick(run, p, dmg) {
    const R = 168;
    queryRobots(run, run.x[p], run.y[p], R, function (ri) {
      const dx = run.x[p] - run.rx[ri], dy = run.y[p] - run.ry[ri];
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R || d2 < 1) return;
      const inv = 1 / Math.sqrt(d2);
      if (run.rType[ri] !== KING) {
        run.rx[ri] += dx * inv * 36;
        run.ry[ri] += dy * inv * 36;
      }
      if (d2 < (R * 0.72) * (R * 0.72)) damageRobot(run, ri, dmg, p);
    });
  }

  function hurtCircle(run, x, y, rad, dmg, owner) {
    queryRobots(run, x, y, rad, function (ri) {
      if (overlap(x, y, rad, run.rx[ri], run.ry[ri], run.rr[ri] * 0.65)) damageRobot(run, ri, dmg, owner);
    });
  }

  function moveProjectiles(run, dt) {
    for (let i = 0; i < CAP_P; i++) {
      if (!run.pAlive[i]) continue;
      run.pAge[i] += dt;
      run.plife[i] -= dt;
      if (run.pKind[i] === 1 && run.pAge[i] > 0.48) run.pRet[i] = 1;
      if (run.pKind[i] === 1 && run.pRet[i]) {
        const o = run.pOwner[i];
        if (o >= 0) {
          const dx = run.x[o] - run.px[i], dy = run.y[o] - run.py[i];
          const inv = 1 / (Math.sqrt(dx * dx + dy * dy) || 1);
          run.pvx[i] = dx * inv * 520;
          run.pvy[i] = dy * inv * 520;
          if (dx * dx + dy * dy < 24 * 24) { freeP(run, i); continue; }
        }
      }
      run.px[i] += run.pvx[i] * dt;
      run.py[i] += run.pvy[i] * dt;
      if (run.pKind[i] === 2) {
        const dx = run.ptx[i] - run.px[i], dy = run.pty[i] - run.py[i];
        if (dx * dx + dy * dy < 18 * 18 || run.plife[i] <= 0) {
          run.pKind[i] = 4;
          continue;
        }
      }
      if (run.plife[i] <= 0 || run.px[i] < -40 || run.py[i] < -40 || run.px[i] > W + 40 || run.py[i] > H + 40) freeP(run, i);
    }
  }

  function explodeBalloon(run, i) {
    const o = run.pOwner[i];
    const row = o >= 0 ? lvRow(run, o, D.BALLOON) : 2;
    const rad = D.weapons[D.BALLOON].rad[row < 0 ? 2 : row];
    const x = run.px[i], y = run.py[i], dmg = run.pdmg[i];
    queryRobots(run, x, y, rad, function (ri) {
      if (overlap(x, y, rad, run.rx[ri], run.ry[ri], run.rr[ri] * 0.4)) damageRobot(run, ri, dmg, o);
    });
    const z = allocZ(run);
    if (z >= 0) {
      run.zKind[z] = 1;
      run.zx[z] = x; run.zy[z] = y; run.zr[z] = rad; run.zdps[z] = 0; run.zlife[z] = 0.35;
    }
    if (o >= 0 && run.evo[o][1]) {
      const pz = allocZ(run);
      if (pz >= 0) {
        run.zKind[pz] = 0; run.zx[pz] = x; run.zy[pz] = y; run.zr[pz] = 48; run.zdps[pz] = 36; run.zlife[pz] = 1.4;
      }
    }
    emit(run, 1, 3, 0, x, y);
  }

  function hitProjectiles(run) {
    for (let i = 0; i < CAP_P; i++) {
      if (!run.pAlive[i]) continue;
      const kind = run.pKind[i];
      const owner = run.pOwner[i];
      if (owner < 0) {
        for (let p = 0; p < run.players; p++) {
          if (run.hp[p] <= 0) continue;
          if (!overlap(run.px[i], run.py[i], run.pr[i], run.x[p], run.y[p], run.prad)) continue;
          if (run.dashT[p] > 0) {
            emit(run, 4, Math.min(2000, run.pAge[i] * 1000), p, run.px[i], run.py[i]);
            freeP(run, i);
            break;
          }
          if (run.inv[p] > 0) { freeP(run, i); break; }
          hurtPlayer(run, p);
          freeP(run, i);
          break;
        }
        continue;
      }
      if (kind === 2) continue;
      let hit = false;
      queryRobots(run, run.px[i], run.py[i], run.pr[i], function (ri) {
        if (hit || !run.pAlive[i]) return;
        if (!overlap(run.px[i], run.py[i], run.pr[i], run.rx[ri], run.ry[ri], run.rr[ri])) return;
        if (alreadyHit(run, i, ri)) return;
        markHit(run, i, ri);
        const cannon = run.evo[owner][1] && kind === 0;
        damageRobot(run, ri, run.pdmg[i], owner);
        if (cannon && run.zFreeN > 0 && (ri & 1) === 0) {
          const z = allocZ(run);
          if (z >= 0) {
            run.zKind[z] = 0; run.zx[z] = run.rx[ri]; run.zy[z] = run.ry[ri];
            run.zr[z] = 36; run.zdps[z] = 28; run.zlife[z] = 1.1;
          }
        }
        run.pPierce[i]--;
        if (run.pPierce[i] <= 0) { freeP(run, i); hit = true; }
      });
    }
  }

  function zones(run, dt) {
    for (let i = 0; i < CAP_Z; i++) {
      if (!run.zAlive[i]) continue;
      run.zlife[i] -= dt;
      if (run.zlife[i] <= 0) { freeZ(run, i); continue; }
      if (run.zKind[i] !== 0 || run.zdps[i] <= 0) continue;
      const x = run.zx[i], y = run.zy[i], rad = run.zr[i], dmg = run.zdps[i] * dt;
      queryRobots(run, x, y, rad, function (ri) {
        if (overlap(x, y, rad, run.rx[ri], run.ry[ri], run.rr[ri] * 0.5)) damageRobot(run, ri, dmg, 0);
      });
    }
  }

  function hurtPlayer(run, p) {
    if (run.immortal || run.hp[p] <= 0 || run.inv[p] > 0 || run.dashT[p] > 0) return;
    if (run.shield[p] > 0) {
      run.shield[p]--;
      run.inv[p] = 0.35;
      emit(run, 3, 0, p, run.x[p], run.y[p]);
      return;
    }
    run.hp[p]--;
    run.hurtN[p]++;
    run.inv[p] = 1;
    emit(run, 3, 1, p, run.x[p], run.y[p]);
    if (run.hp[p] <= 0) {
      run.hp[p] = 0;
      emit(run, 8, p, 0, run.x[p], run.y[p]);
    }
  }

  function movePlayers(run, dt, inputs) {
    if (!run._moved) run._moved = [0, 0];
    for (let p = 0; p < run.players; p++) {
      run.inv[p] = Math.max(0, run.inv[p] - dt);
      run.dashT[p] = Math.max(0, run.dashT[p] - dt);
      run.dashCd[p] = Math.max(0, run.dashCd[p] - dt);
      if (run.shield[p] < run.shieldMax[p]) {
        run.shieldT[p] -= dt;
        if (run.shieldT[p] <= 0) {
          run.shield[p]++;
          run.shieldT[p] = 8;
        }
      }
      if (run.hp[p] <= 0) { run._moved[p] = 0; continue; }
      const inp = (inputs && inputs[p]) || ZERO;
      let ix = inp.x || 0, iy = inp.y || 0;
      if (ix > 1) ix = 1; else if (ix < -1) ix = -1;
      if (iy > 1) iy = 1; else if (iy < -1) iy = -1;
      const m2 = ix * ix + iy * iy;
      if (m2 > 1) { const inv = 1 / Math.sqrt(m2); ix *= inv; iy *= inv; }
      if (inp.dash && run.dashCd[p] <= 0 && run.dashT[p] <= 0) {
        run.dashT[p] = 0.16;
        run.dashCd[p] = 1.5;
        run.dashN[p]++;
        if (m2 > 0.04) run.aim[p] = Math.atan2(iy, ix);
        else { ix = Math.cos(run.aim[p]); iy = Math.sin(run.aim[p]); }
        emit(run, 10, p, 0, run.x[p], run.y[p]);
      }
      const sneaker = lvRow(run, p, D.SNEAK);
      let sp = run.speed[p];
      if (sneaker >= 0) sp *= 1 + D.weapons[D.SNEAK].bonus[sneaker];
      if (run.dashT[p] > 0) sp = 780;
      run.x[p] = clamp(run.x[p] + ix * sp * dt, 26, W - 26);
      run.y[p] = clamp(run.y[p] + iy * sp * dt, 26, H - 26);
      run._moved[p] = m2 > 0.04 ? 1 : 0;
      if (m2 > 0.04 && run.dashT[p] <= 0) run.aim[p] = Math.atan2(iy, ix);
    }
    if (run.players === 2 && run.hp[0] > 0 && run.hp[1] > 0) {
      const dx = run.x[1] - run.x[0], dy = run.y[1] - run.y[0];
      const d2 = dx * dx + dy * dy;
      if (d2 > 1 && d2 < 36 * 36) {
        const inv = 1 / Math.sqrt(d2);
        const push = (36 - d2 * inv) * 0.5;
        run.x[0] = clamp(run.x[0] - dx * inv * push, 26, W - 26);
        run.y[0] = clamp(run.y[0] - dy * inv * push, 26, H - 26);
        run.x[1] = clamp(run.x[1] + dx * inv * push, 26, W - 26);
        run.y[1] = clamp(run.y[1] + dy * inv * push, 26, H - 26);
      }
    }
  }

  function moveRobots(run, dt) {
    const alive = run.rAlive;
    for (let i = 0; i < CAP_R; i++) {
      if (!alive[i]) continue;
      run.rHurt[i] = Math.max(0, run.rHurt[i] - dt);
      const type = run.rType[i];
      const p = nearestPlayer(run, run.rx[i], run.ry[i]);
      const tx = run.x[p], ty = run.y[p];
      let dx = tx - run.rx[i], dy = ty - run.ry[i];
      let d2 = dx * dx + dy * dy;
      const inv = 1 / (Math.sqrt(d2) || 1);
      const sp = run.rsp[i];
      run.rT[i] -= dt;
      if (type === 1) {
        if (run.rMode[i] === 0 && run.rT[i] <= 0) { run.rMode[i] = 1; run.rT[i] = 0.22; }
        else if (run.rMode[i] === 1 && run.rT[i] <= 0) {
          run.rvx[i] = dx * inv * 300;
          run.rvy[i] = dy * inv * 300;
          run.rMode[i] = 2;
          run.rT[i] = 0.28;
        } else if (run.rMode[i] === 2 && run.rT[i] <= 0) { run.rMode[i] = 0; run.rT[i] = 1.15; }
        if (run.rMode[i] === 2) {
          run.rx[i] += run.rvx[i] * dt;
          run.ry[i] += run.rvy[i] * dt;
          run.rvx[i] *= 1 - 1.6 * dt;
          run.rvy[i] *= 1 - 1.6 * dt;
        } else if (run.rMode[i] === 0) {
          run.rx[i] += dx * inv * sp * dt;
          run.ry[i] += dy * inv * sp * dt;
        }
      } else if (type === 2) {
        if (run.rT[i] <= 0 || run.rMode[i] === 0) {
          run.rvx[i] = dx * inv * sp;
          run.rvy[i] = dy * inv * sp;
          run.rMode[i] = 1;
          run.rT[i] = 1.25;
        }
        run.rx[i] += run.rvx[i] * dt;
        run.ry[i] += run.rvy[i] * dt;
      } else if (type === 5) {
        if (d2 < 520 * 520 && run.rT[i] <= 0) {
          const s = 150;
          launch(run, -1, 3, run.rx[i], run.ry[i], dx * inv * s, dy * inv * s, 1, 1, 2.4, 9, 0, 0);
          run.rT[i] = 2.15;
        }
        const creep = d2 < 260 * 260 ? -0.35 : 1;
        run.rx[i] += dx * inv * sp * creep * dt;
        run.ry[i] += dy * inv * sp * creep * dt;
      } else if (type === MINIBOSS) {
        run.rx[i] += dx * inv * sp * dt;
        run.ry[i] += dy * inv * sp * dt;
        if (run.rT[i] <= 0) {
          const n = 8;
          for (let k = 0; k < n; k++) {
            const a = k / n * 6.2831853 + run.t;
            launch(run, -1, 3, run.rx[i], run.ry[i], Math.cos(a) * 150, Math.sin(a) * 150, 1, 1, 2.2, 9, 0, 0);
          }
          run.rT[i] = 2.4 / run.bossMul;
        }
      } else if (type === KING) {
        const ratio = run.rmax[i] > 0 ? run.rhp[i] / run.rmax[i] : 1;
        const freq = run.bossMul;
        if (run.rMode[i] === 0 && run.rT[i] <= 0) { run.rMode[i] = 1; run.rT[i] = 0.32 / freq; }
        else if (run.rMode[i] === 1 && run.rT[i] <= 0) {
          run.rvx[i] = dx * inv * (240 + (ratio < 0.35 ? 80 : 0));
          run.rvy[i] = dy * inv * (240 + (ratio < 0.35 ? 80 : 0));
          run.rMode[i] = 2;
          run.rT[i] = 0.42;
        } else if (run.rMode[i] === 2 && run.rT[i] <= 0) {
          run.rMode[i] = 0;
          run.rT[i] = (ratio < 0.6 ? 1.7 : 2.5) / freq;
          if (ratio < 0.65) {
            const n = ratio < 0.35 ? 12 : 8;
            for (let k = 0; k < n; k++) {
              const a = k / n * 6.2831853;
              const s = 130 * freq;
              launch(run, -1, 3, run.rx[i], run.ry[i], Math.cos(a) * s, Math.sin(a) * s, 1, 1, 2.6, 10, 0, 0);
            }
          }
        }
        if (run.rMode[i] === 2) {
          run.rx[i] += run.rvx[i] * dt;
          run.ry[i] += run.rvy[i] * dt;
        } else if (run.rMode[i] === 0) {
          const chase = sp * (ratio < 0.35 ? 1.35 : 1) * freq;
          run.rx[i] += dx * inv * chase * dt;
          run.ry[i] += dy * inv * chase * dt;
        }
      } else {
        run.rx[i] += dx * inv * sp * dt;
        run.ry[i] += dy * inv * sp * dt;
      }
      if (run.rx[i] < run.rr[i]) run.rx[i] = run.rr[i];
      else if (run.rx[i] > W - run.rr[i]) run.rx[i] = W - run.rr[i];
      if (run.ry[i] < run.rr[i]) run.ry[i] = run.rr[i];
      else if (run.ry[i] > H - run.rr[i]) run.ry[i] = H - run.rr[i];
    }
  }

  function separate(run) {
    // Soft push inside each hash cell. Overlaps across a cell border wait a
    // frame; a full cap stays a short walk instead of an N² search.
    const head = run.hHead, next = run.hNext;
    const alive = run.rAlive, rx = run.rx, ry = run.ry, rr = run.rr, rType = run.rType;
    for (let i = 0; i < CAP_R; i++) {
      if (!alive[i] || rType[i] === KING) continue;
      const xi = rx[i], yi = ry[i], ri = rr[i];
      let j = head[cellAt(xi, yi)], guard = 0, seen = 0;
      while (j >= 0 && seen < 3 && guard++ < 6) {
        const nextJ = next[j];
        if (j > i && alive[j] && rType[j] !== KING) {
          const dx = rx[j] - xi, dy = ry[j] - yi;
          const min = (ri + rr[j]) * 0.85;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 0.01) {
            seen++;
            const inv = 1 / Math.sqrt(d2);
            const push = (min - d2 * inv) * 0.5;
            const px = dx * inv * push, py = dy * inv * push;
            rx[j] += px; ry[j] += py;
            rx[i] -= px; ry[i] -= py;
          }
        }
        j = nextJ;
      }
    }
  }

  function touchPlayers(run) {
    for (let p = 0; p < run.players; p++) {
      if (run.hp[p] <= 0 || run.inv[p] > 0 || run.dashT[p] > 0) continue;
      let hit = false;
      queryRobots(run, run.x[p], run.y[p], run.prad, function (ri) {
        if (hit) return;
        if (!overlap(run.x[p], run.y[p], run.prad, run.rx[ri], run.ry[ri], run.rr[ri])) return;
        hurtPlayer(run, p);
        hit = true;
      });
    }
  }

  function revive(run, dt) {
    if (run.players < 2) return;
    for (let p = 0; p < 2; p++) {
      if (run.hp[p] > 0) { run.revT[p] = 0; continue; }
      const o = 1 - p;
      if (run.hp[o] <= 0) { run.revT[p] = 0; continue; }
      const dx = run.x[o] - run.x[p], dy = run.y[o] - run.y[p];
      if (dx * dx + dy * dy <= 74 * 74) run.revT[p] += dt;
      else run.revT[p] = 0;
      if (run.revT[p] >= 2) {
        run.hp[p] = Math.min(2, run.maxHp[p]);
        run.inv[p] = 1.2;
        run.revT[p] = 0;
        run.revives++;
        emit(run, 9, p, 0, run.x[p], run.y[p]);
      }
    }
  }

  function magnets(run, dt) {
    for (let i = 0; i < CAP_B; i++) {
      if (!run.bAlive[i]) continue;
      run.bx[i] += run.bvx[i] * dt;
      run.by[i] += run.bvy[i] * dt;
      run.bvx[i] *= 1 - 2.2 * dt;
      run.bvy[i] *= 1 - 2.2 * dt;
      let taken = false;
      for (let p = 0; p < run.players; p++) {
        if (run.hp[p] <= 0) continue;
        const row = lvRow(run, p, D.MAGNET);
        let rad = 34;
        if (row >= 0) rad = D.weapons[D.MAGNET].rad[row];
        if (run.evo[p][0]) rad += 80;
        const dx = run.x[p] - run.bx[i], dy = run.y[p] - run.by[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) continue;
        if (d2 < 26 * 26) {
          run.bolts++;
          addXp(run, 1);
          emit(run, 2, p, 0, run.bx[i], run.by[i]);
          freeB(run, i);
          taken = true;
          break;
        }
        const inv = 1 / (Math.sqrt(d2) || 1);
        const pull = (row >= 0 ? 420 : 80) * dt;
        run.bx[i] += dx * inv * pull;
        run.by[i] += dy * inv * pull;
      }
      if (!taken && (run.bx[i] < -20 || run.by[i] < -20 || run.bx[i] > W + 20 || run.by[i] > H + 20)) freeB(run, i);
    }
  }

  function spawnWave(run, dt) {
    run.spawnT -= dt;
    const sched = run.t * run.timeScale;
    const bi = breakIndex(sched);
    const interval = D.spawn.interval[bi] / run.spawnMul;
    if (run.spawnT <= 0) {
      run.spawnT += interval;
      if (run.spawnT < 0) run.spawnT = 0;
      if (run.rFreeN > 0) {
        edgeInto(run, run.rng, EDGE);
        RS.spawnRobot(run, pickType(run, run.rng, bi), EDGE.x, EDGE.y);
      }
    }
    const miniCap = run.endless ? 99 : 2;
    if (run.miniCount < miniCap && run.t >= run.nextMini) {
      makeRoom(run);
      edgeInto(run, run.rng, EDGE);
      if (RS.spawnRobot(run, MINIBOSS, EDGE.x, EDGE.y) >= 0) {
        run.miniCount++;
        run.nextMini += 90 / run.timeScale;
      }
    }
    if (!run.kingAlive && run.t >= run.nextKing && (run.endless || !run.bossPopped)) {
      makeRoom(run);
      edgeInto(run, run.rng, EDGE);
      if (RS.spawnRobot(run, KING, EDGE.x, EDGE.y) >= 0 && run.endless) run.nextKing = run.t + 150;
    }
  }

  function living(run) {
    let n = 0;
    for (let p = 0; p < run.players; p++) if (run.hp[p] > 0) n++;
    return n;
  }

  RS.offerCards = function (run, rng) {
    const p = run.offerFor || 0;
    const rand = rng || run.rng;
    const pool = [];
    const evos = [];
    for (let id = 0; id < 10; id++) {
      if (run.lv[p][id] >= 5) continue;
      if (id === D.SHIELD && run.hurtN[p] < 1) continue;
      if (id === D.HEART && run.level < 3) continue;
      pool.push(id);
    }
    if (!run.evo[p][0] && run.lv[p][D.DUCKS] >= 5 && run.lv[p][D.MAGNET] >= 5) evos.push(D.TORNADO);
    if (!run.evo[p][1] && run.lv[p][D.FOAM] >= 5 && run.lv[p][D.PAINT] >= 5) evos.push(D.CANNON);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const out = [];
    for (let i = 0; i < evos.length && out.length < 3; i++) out.push(evos[i]);
    for (let i = 0; i < pool.length && out.length < 3; i++) out.push(pool[i]);
    return out;
  };

  function openCards(run) {
    for (let p = 0; p < run.players; p++) {
      run.offerFor = p;
      run.offers[p] = RS.offerCards(run, run.rng);
      run.pick[p] = -1;
    }
    if (!run.offers[0].length && (run.players < 2 || !run.offers[1].length)) {
      run.queue = 0;
      run.cards = 0;
      return;
    }
    run.cards = 1;
    emit(run, 6, run.level, 0, run.x[0], run.y[0]);
  }

  RS.applyCard = function (run, player, id) {
    if (player < 0 || player >= run.players) return false;
    if (id === D.TORNADO) {
      if (run.evo[player][0] || run.lv[player][D.DUCKS] < 5 || run.lv[player][D.MAGNET] < 5) return false;
      run.evo[player][0] = 1;
      return true;
    }
    if (id === D.CANNON) {
      if (run.evo[player][1] || run.lv[player][D.FOAM] < 5 || run.lv[player][D.PAINT] < 5) return false;
      run.evo[player][1] = 1;
      return true;
    }
    if (id < 0 || id >= 10 || run.lv[player][id] >= 5) return false;
    run.lv[player][id]++;
    if (id === D.HEART) {
      run.maxHp[player]++;
      if (run.hp[player] > 0) run.hp[player] = Math.min(run.maxHp[player], run.hp[player] + 1);
    }
    if (id === D.SHIELD) {
      run.shieldMax[player] = run.lv[player][id];
      run.shield[player] = run.shieldMax[player];
    }
    return true;
  };

  RS.choose = function (run, player, id) {
    if (!run.cards || player < 0 || player >= run.players || run.pick[player] >= 0) return false;
    const offer = run.offers[player];
    if (!offer || offer.indexOf(id) < 0) return false;
    if (!RS.applyCard(run, player, id)) return false;
    run.pick[player] = id;
    for (let i = 0; i < run.players; i++) if (run.pick[i] < 0) return true;
    run.queue = Math.max(0, run.queue - 1);
    run.cards = 0;
    if (run.queue > 0) openCards(run);
    return true;
  };

  RS.reroll = function (run, player) {
    if (!run.cards || player < 0 || player >= run.players || run.pick[player] >= 0 || run.reroll[player] <= 0) return false;
    run.reroll[player]--;
    run.offerFor = player;
    run.offers[player] = RS.offerCards(run, run.rng);
    return true;
  };

  RS.resolveCards = function (run) {
    if (!run.cards) return false;
    for (let p = 0; p < run.players; p++) {
      const offer = run.offers[p];
      if (offer && offer.length) RS.applyCard(run, p, offer[0]);
      run.pick[p] = 0;
    }
    run.queue = Math.max(0, run.queue - 1);
    run.cards = 0;
    if (run.queue > 0) openCards(run);
    return true;
  };

  RS.counts = function (run) {
    let robots = 0, projectiles = 0, bolts = 0, zones = 0;
    for (let i = 0; i < CAP_R; i++) robots += run.rAlive[i];
    for (let i = 0; i < CAP_P; i++) projectiles += run.pAlive[i];
    for (let i = 0; i < CAP_B; i++) bolts += run.bAlive[i];
    for (let i = 0; i < CAP_Z; i++) zones += run.zAlive[i];
    return { robots: robots, projectiles: projectiles, bolts: bolts, zones: zones };
  };

  RS.stress = function (run) {
    for (let i = 0; i < CAP_R; i++) if (run.rAlive[i]) freeR(run, i);
    const cols = 20, rows = 15;
    let n = 0;
    for (let r = 0; r < rows && n < CAP_R; r++) {
      for (let c = 0; c < cols && n < CAP_R; c++) {
        const x = run.x[0] - 560 + c * 58;
        const y = run.y[0] - 400 + r * 56;
        RS.spawnRobot(run, n % 6, clamp(x, 30, W - 30), clamp(y, 30, H - 30));
        n++;
      }
    }
    run.inv[0] = 999;
    run.inv[1] = 999;
  };

  RS.step = function (run, dt, inputs) {
    if (!run || run.over) return;
    if (run.cards) return;
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    run.evN = 0;
    run.frame++;
    run.t += dt;
    run.comboT -= dt;
    if (run.comboT <= 0) run.combo = 0;
    spawnWave(run, dt);
    movePlayers(run, dt, inputs);
    weapons(run, dt);
    moveProjectiles(run, dt);
    moveRobots(run, dt);
    buildHash(run);
    for (let p = 0; p < run.players; p++) if (run.hp[p] > 0) tickOrbit(run, p, dt);
    for (let i = 0; i < CAP_P; i++) if (run.pAlive[i] && run.pKind[i] === 4) {
      explodeBalloon(run, i);
      freeP(run, i);
    }
    hitProjectiles(run);
    zones(run, dt);
    touchPlayers(run);
    separate(run);
    magnets(run, dt);
    revive(run, dt);
    if (!run.over && living(run) === 0) run.over = 'lose';
    if (run.cardsOn && !run.cards && run.queue > 0 && !run.over) openCards(run);
  };

  // A readable snapshot for the determinism test. Rounded so a 0 ulp tie is exact anyway.
  RS.fingerprint = function (run) {
    let s = run.t.toFixed(4) + '|' + run.pops + '|' + run.over + '|' + run.level + '|' + (run.bossPopped || 0);
    for (let p = 0; p < run.players; p++) s += '|' + run.x[p].toFixed(3) + ',' + run.y[p].toFixed(3) + ',' + run.hp[p];
    let n = 0;
    for (let i = 0; i < CAP_R && n < 8; i++) {
      if (!run.rAlive[i]) continue;
      s += '|' + i + ':' + run.rx[i].toFixed(2) + ',' + run.ry[i].toFixed(2) + ',' + run.rhp[i].toFixed(1);
      n++;
    }
    return s;
  };
})(globalThis.RS = globalThis.RS || {});

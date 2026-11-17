// Unit tests for Egg Rush (سباق البيض: Turbo Dino & Robo-Coop Heist!) pure simulation engine.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/egg-rush/engine.js');
const require = createRequire(import.meta.url);
const E = require(enginePath);
const DT = 1 / 60;

function stepFor(w, seconds, inputFn) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames && !w.over; i++) {
    const inp = typeof inputFn === 'function' ? inputFn(w, i) : inputFn;
    E.stepWorld(w, DT, inp);
  }
}

// Lightweight A* / BFS grid navigator for our scripted test bot across walls & closed lasers.
function makeGridBot(w, pid = 0) {
  const cell = 32;
  const cols = Math.ceil(E.W / cell), rows = Math.ceil(E.H / cell);
  let cachedLaserMask = -1, path = [], targetKey = '', repathCd = 0;

  function laserMask() {
    let m = 0;
    for (let i = 0; i < w.lasers.length; i++) if (w.lasers[i].openTimer <= 0.4) m |= (1 << i);
    return m;
  }

  function blockedCell(cx, cy, mask) {
    const x = cx * cell + cell / 2, y = cy * cell + cell / 2, pad = 23;
    if (x < E.AX0 + pad || x > E.AX1 - pad || y < E.AY0 + pad || y > E.AY1 - pad) return true;
    for (const wl of w.walls) {
      if (x >= wl.x - pad && x <= wl.x + wl.w + pad && y >= wl.y - pad && y <= wl.y + wl.h + pad) return true;
    }
    for (let i = 0; i < w.lasers.length; i++) {
      if (!(mask & (1 << i))) continue;
      const lz = w.lasers[i];
      if (x >= lz.x - pad && x <= lz.x + lz.w + pad && y >= lz.y - pad && y <= lz.y + lz.h + pad) return true;
    }
    return false;
  }

  function bfs(sx, sy, gx, gy, mask) {
    const sc = Math.max(0, Math.min(cols - 1, (sx / cell) | 0));
    const sr = Math.max(0, Math.min(rows - 1, (sy / cell) | 0));
    const gc = Math.max(0, Math.min(cols - 1, (gx / cell) | 0));
    const gr = Math.max(0, Math.min(rows - 1, (gy / cell) | 0));
    const start = sr * cols + sc, goal = gr * cols + gc;
    const prev = new Int32Array(cols * rows).fill(-1);
    const seen = new Uint8Array(cols * rows);
    const q = [start];
    seen[start] = 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let head = 0, bestNode = start, bestDist = Math.hypot(gc - sc, gr - sr);

    while (head < q.length) {
      const cur = q[head++];
      if (cur === goal) { bestNode = goal; break; }
      const cr = (cur / cols) | 0, cc = cur % cols;
      for (const [dc, dr] of dirs) {
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (seen[ni] || blockedCell(nc, nr, mask)) continue;
        if (dc !== 0 && dr !== 0 && (blockedCell(cc + dc, cr, mask) || blockedCell(cc, cr + dr, mask))) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        const d = Math.hypot(gc - nc, gr - nr);
        if (d < bestDist) { bestDist = d; bestNode = ni; }
        q.push(ni);
      }
    }
    if (bestNode === start) return { reachable: start === goal, pts: [{ x: gx, y: gy }] };
    const out = [];
    let cur = bestNode;
    while (cur !== -1 && cur !== start) {
      const r = (cur / cols) | 0, c = cur % cols;
      out.push({ x: c * cell + cell / 2, y: r * cell + cell / 2 });
      cur = prev[cur];
    }
    out.reverse();
    if (bestNode === goal) out.push({ x: gx, y: gy });
    return { reachable: bestNode === goal, pts: out };
  }

  return () => {
    const p = w.players[pid];
    const mask = laserMask();
    const teamCarry = w.mode === 'coop' ? w.players.reduce((s, pl) => s + pl.carry.length, 0) : p.carry.length;
    const needMore = Math.max(0, w.goal - w.hatched);

    let goalObj = null;
    if (p.carry.length >= 3 || (p.carry.length > 0 && teamCarry >= needMore)) {
      goalObj = { x: p.home.x, y: p.home.y, key: 'home' };
    } else {
      let bestEgg = null, bestD = 1e9;
      for (const eg of w.eggs) {
        if (eg.state !== 'nest' && !(eg.state === 'loose' && eg.looseDelay <= 0)) continue;
        const d = Math.hypot(eg.x - p.x, eg.y - p.y) + (pid === 1 ? eg.id * 12 : 0);
        if (d < bestD) { bestD = d; bestEgg = eg; }
      }
      goalObj = bestEgg ? { x: bestEgg.x, y: bestEgg.y, key: 'egg_' + bestEgg.id } : { x: p.home.x, y: p.home.y, key: 'home' };
    }

    repathCd -= DT;
    if (goalObj.key !== targetKey || mask !== cachedLaserMask || repathCd <= 0 || !path.length) {
      let nav = bfs(p.x, p.y, goalObj.x, goalObj.y, mask);
      if (!nav.reachable && mask !== 0 && w.switches.length) {
        // Step on nearest reachable laser switch first!
        let bestSw = null, swDist = 1e9;
        for (const sw of w.switches) {
          const trySw = bfs(p.x, p.y, sw.x, sw.y, mask);
          const d = Math.hypot(sw.x - p.x, sw.y - p.y);
          if (trySw.reachable && d < swDist) { swDist = d; bestSw = trySw; }
        }
        if (bestSw) nav = bestSw;
      }
      path = nav.pts;
      targetKey = goalObj.key;
      cachedLaserMask = mask;
      repathCd = 0.35;
    }

    while (path.length > 1 && Math.hypot(path[0].x - p.x, path[0].y - p.y) < 20) path.shift();
    const wp = path[0] || goalObj;
    const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy) || 1;
    const guardClose = w.guards.some(g => Math.hypot(g.x - p.x, g.y - p.y) < 150);
    return { x: dx / d, y: dy / d, dash: p.dashCd <= 0 && (guardClose || d > 95) };
  };
}

test('dual Node + browser global loading and zero DOM or telemetry inside engine.js', () => {
  const src = readFileSync(enginePath, 'utf8');
  assert.equal(/\bdocument\b/.test(src), false, 'engine.js must not touch document');
  assert.equal(/\bKit\s*\.\s*(?:stats|track)\b/.test(src), false, 'engine.js must not call Kit.stats or Kit.track');

  const ctx = vm.createContext({ window: {} });
  vm.runInContext(src, ctx, { filename: 'engine.js' });
  assert.ok(ctx.window.EREngine, 'exposes window.EREngine in browser context');
  assert.equal(ctx.window.EREngine.WORLDS.length, 4);
  assert.equal(ctx.window.EREngine.STAGES.length, 12);
});

test('all 4 Open Worlds and 12 stages start idle at spawn and walk right cleanly', () => {
  assert.equal(E.WORLDS.length, 4);
  assert.deepEqual(
    E.WORLDS.map(w => w.name),
    ['مزرعة التيربو', 'وادي الديناصورات', 'قلعة الجليد', 'المختبر الآلي']
  );
  assert.equal(E.STAGES.length, 12);

  for (let i = 0; i < E.STAGES.length; i++) {
    const w = E.createWorld({ stage: i, diff: 'normal', seed: 101 + i });
    assert.ok(w.eggs.length >= w.goal, `${w.id}: enough eggs for goal`);
    assert.equal(E.isAtStart(w), true, `${w.id}: starts at spawn`);
    const x0 = w.players[0].x, y0 = w.players[0].y;

    // 2 seconds with zero input must keep P1 completely still and safe inside Hatcher Base
    stepFor(w, 2.0, [{ x: 0, y: 0, dash: false }]);
    assert.equal(w.players[0].x, x0, `${w.id}: px unchanged when idle`);
    assert.equal(w.players[0].y, y0, `${w.id}: py unchanged when idle`);
    assert.equal(E.isAtStart(w), true, `${w.id}: still atStart when idle`);
    assert.equal(w.bonks, 0, `${w.id}: safe at spawn`);

    // Holding right moves P1 cleanly rightward and clears atStart
    stepFor(w, 0.6, [{ x: 1, y: 0, dash: false }]);
    assert.ok(w.players[0].x > x0 + 120, `${w.id}: open rightward lane from spawn`);
    assert.equal(E.isAtStart(w), false, `${w.id}: atStart becomes false once moved`);
  }
});

test('Egg-Chain Turbo boosts speed instead of slowing down, mud never slows, and 3-egg hatch gives mega bonus', () => {
  assert.equal(E.chainSpeedMult(0), 1.0);
  assert.ok(E.chainSpeedMult(1) > 1.0);
  assert.ok(E.chainSpeedMult(2) > E.chainSpeedMult(1));
  assert.ok(E.chainSpeedMult(3) > E.chainSpeedMult(2));
  assert.equal(E.chainScoreMult(3), 2.2);

  // Compare distance covered in 0.5s with 0 eggs vs 3 carried eggs
  const w0 = E.createWorld({ stage: 'w1s1', diff: 'normal' });
  w0.eggs = []; w0.walls = []; w0.pads = []; w0.guards = [];
  stepFor(w0, 0.5, [{ x: 1, y: 0, dash: false }]);
  const dist0 = w0.players[0].x - w0.players[0].spawnX;

  const w3 = E.createWorld({ stage: 'w1s1', diff: 'normal' });
  w3.walls = []; w3.pads = []; w3.guards = [];
  for (let k = 0; k < 3; k++) {
    const eg = w3.eggs[k];
    eg.state = 'carried'; eg.carrier = 0;
    w3.players[0].carry.push(eg);
  }
  w3.players[0].x = 300; // outside home so stack doesn't immediately hatch
  const start3 = w3.players[0].x;
  stepFor(w3, 0.5, [{ x: 1, y: 0, dash: false }]);
  const dist3 = w3.players[0].x - start3;
  assert.ok(dist3 > dist0 * 1.2, '3-egg conga chain runs faster than 0 eggs!');

  // Mud never slows walking below 100%, and dashing through mud gives extra hydro-boost (2.05x vs 1.85x)
  const wMud = E.createWorld({ stage: 'w1s1', diff: 'normal' });
  wMud.walls = []; wMud.eggs = []; wMud.guards = [];
  wMud.pads = [{ kind: 'mud', x: 250, y: 300, w: 500, h: 200, r: 32, dx: 0, dy: 0, cd: 0 }];
  wMud.players[0].x = 280;
  stepFor(wMud, 0.5, [{ x: 1, y: 0, dash: false }]);
  assert.ok(Math.abs((wMud.players[0].x - 280) - dist0) < 1, 'mud never slows normal running');

  wMud.players[0].x = 300; wMud.players[0].dashCd = 0;
  E.stepWorld(wMud, DT, [{ x: 1, y: 0, dash: true }]);
  E.stepWorld(wMud, DT, [{ x: 1, y: 0, dash: false }]);
  const mudDashVx = wMud.players[0].vx;
  assert.ok(mudDashVx > wMud.tuning.baseSpeed * 2.0, 'mud dash gives > 2x hydro-slide boost');

  // Delivering 3 eggs to Turbo Hatcher Base hatches 3 babies, grants feather speed boost, and 2.2x score
  w3.players[0].x = w3.players[0].home.x;
  w3.players[0].y = w3.players[0].home.y;
  w3.events.length = 0;
  E.stepWorld(w3, DT, [{ x: 0, y: 0, dash: false }]);
  assert.equal(w3.hatched, 3);
  assert.equal(w3.babies.length, 3);
  assert.equal(w3.comboBursts, 1);
  assert.ok(w3.players[0].featherTimer >= 4.4, '3-egg hatch grants helper speed-feather boost');
  const hatchEv = w3.events.find(e => e.type === 'hatch');
  assert.ok(hatchEv && hatchEv.mega && hatchEv.points === Math.round(300 * 2.2));
});

test('Turbo Dash drops Squeaky Decoy Duck ("؟!"), stealth pods hide P1, Bubble Shield & 0.65s cartoon bonk work', () => {
  const w = E.createWorld({ stage: 'w1s1', diff: 'easy' });
  const p = w.players[0], g = w.guards[0];
  assert.equal(p.shield, 1, 'easy tier starts with free Bubble-Helmet Shield');

  // Place player near guard and press dash -> drops decoy duck & distracts guard with "؟!"
  p.x = 500; p.y = 385;
  g.x = 620; g.y = 385; g.state = 'patrol'; g.bonkCd = 0;
  w.events.length = 0;
  E.stepWorld(w, DT, [{ x: 1, y: 0, dash: true }]);
  assert.equal(w.decoys.length, 1, 'drops squeaky decoy duck');
  assert.equal(g.state, 'decoy', 'guard switches to decoy state');
  assert.equal(g.bubble, '؟!', 'guard shows comical ؟! bubble');

  // Stealth pod hides player from guard sight & contact
  const pod = w.hides[0];
  p.x = pod.x; p.y = pod.y; p.invuln = 0; p.bonkTimer = 0; p.dashTimer = 0;
  g.state = 'patrol'; g.x = pod.x + 60; g.y = pod.y; g.look = Math.PI;
  E.stepWorld(w, DT, [{ x: 0, y: 0, dash: false }]);
  assert.equal(p.hidden, true, 'inside stealth pod');
  assert.equal(E.canGuardSee(w, g, p), false, 'guard cannot see hidden player');

  // Bubble Shield absorbs guard hit with ZERO stun and ZERO dropped eggs
  p.x = 500; p.y = 385; p.hidden = false; p.invuln = 0;
  for (let k = 0; k < 3; k++) { w.eggs[k].state = 'carried'; p.carry.push(w.eggs[k]); }
  g.x = 505; g.y = 385; g.state = 'patrol'; g.bonkCd = 0;
  w.events.length = 0;
  E.stepWorld(w, DT, [{ x: 0, y: 0, dash: false }]);
  assert.equal(p.shield, 0, 'shield consumed');
  assert.equal(p.bonkTimer, 0, 'zero stun when shielded');
  assert.equal(p.carry.length, 3, 'keeps all 3 eggs when shielded');
  assert.ok(w.events.some(e => e.type === 'shieldPop'));

  // Unshielded bonk is strictly 0.65s (<= 0.65s, NEVER 9s!), drops ONLY 1 loose egg, and lets P1 grab it back
  p.invuln = 0; g.bonkCd = 0; g.state = 'patrol'; g.x = 505; g.y = 385;
  w.events.length = 0;
  E.stepWorld(w, DT, [{ x: 0, y: 0, dash: false }]);
  assert.ok(p.bonkTimer > 0 && p.bonkTimer <= 0.65, `cartoon bounce is <= 0.65s (got ${p.bonkTimer})`);
  assert.equal(E.BONK_DURATION, 0.65);
  assert.equal(p.carry.length, 2, 'drops only 1 egg from a 3-egg stack');
  const looseEgg = w.eggs.find(e => e.state === 'loose');
  assert.ok(looseEgg, 'popped egg is loose nearby');

  // After 0.7s bounce clears while blink-invuln is still active, P1 can snatch the loose egg right back!
  g.x = 950; // move guard away
  stepFor(w, 0.7, [{ x: 0, y: 0, dash: false }]);
  assert.equal(p.bonkTimer, 0, 'bounce recovered in <= 0.7s');
  assert.ok(p.invuln > 1.0, 'blink-shield still active for safe recovery');
  stepFor(w, 0.35, () => {
    const dx = looseEgg.x - p.x, dy = looseEgg.y - p.y, d = Math.hypot(dx, dy) || 1;
    return [{ x: dx / d, y: dy / d, dash: false }];
  });
  assert.equal(p.carry.length, 3, 'recovered popped egg right back!');
});

test('world gadgets work: spring pad, boost strip, paired teleporter, laser floor switch, and pickups', () => {
  // Spring pad launch
  const w1 = E.createWorld({ stage: 'w1s1', diff: 'normal' });
  const sp = w1.pads.find(pd => pd.kind === 'spring');
  w1.players[0].x = sp.x; w1.players[0].y = sp.y;
  w1.events.length = 0;
  E.stepWorld(w1, DT, [{ x: 0, y: 0, dash: false }]);
  assert.ok(w1.players[0].springTimer > 0, 'spring launches player');
  assert.ok(w1.events.some(e => e.type === 'spring'));

  // Glacier boost lane
  const w3 = E.createWorld({ stage: 'w3s1', diff: 'normal' });
  const boost = w3.pads.find(pd => pd.kind === 'boost');
  w3.players[0].x = boost.x + 40; w3.players[0].y = boost.y + boost.h / 2; w3.players[0].moved = true;
  E.stepWorld(w3, DT, [{ x: 1, y: 0, dash: false }]);
  assert.equal(w3.players[0].onBoost, true);
  assert.ok(w3.players[0].vx > w3.tuning.baseSpeed + 140, 'ice boost pad accelerates instead of slowing');

  // Cyber-Coop teleporter + laser switch + laser gate
  const w4 = E.createWorld({ stage: 'w4s2', diff: 'normal' });
  const p = w4.players[0];
  const pt = w4.portals[0];
  w4.eggs[0].state = 'carried'; p.carry.push(w4.eggs[0]);
  p.x = pt.x1; p.y = pt.y1; p.moved = true;
  w4.events.length = 0;
  E.stepWorld(w4, DT, [{ x: 0, y: 0, dash: false }]);
  assert.ok(Math.hypot(p.x - pt.x2, p.y - pt.y2) < 5, 'teleports player to paired pad');
  assert.ok(Math.hypot(p.carry[0].x - pt.x2, p.carry[0].y - pt.y2) < 35, 'carried egg warps with player');
  assert.ok(w4.events.some(e => e.type === 'portal'));

  // Closed laser bonks, stepping on switch opens laser
  const lz = w4.lasers[0], sw = w4.switches[0];
  assert.equal(lz.openTimer, 0);
  p.invuln = 0; p.bonkTimer = 0;
  p.x = lz.x - 5; p.y = lz.y + lz.h / 2;
  E.stepWorld(w4, DT, [{ x: 1, y: 0, dash: false }]);
  assert.ok(p.bonkTimer > 0, 'closed laser bonks player');

  p.bonkTimer = 0; p.invuln = 0;
  p.x = sw.x; p.y = sw.y;
  E.stepWorld(w4, DT, [{ x: 0, y: 0, dash: false }]);
  assert.ok(lz.openTimer > 7.0, 'floor switch opens laser barrier');
});

test('scripted player beats all 12 stages across easy, normal, and hero difficulties', () => {
  for (const diff of ['easy', 'normal', 'hero']) {
    for (let si = 0; si < E.STAGES.length; si++) {
      const w = E.createWorld({ stage: si, diff, seed: 42 + si });
      const bot = makeGridBot(w, 0);
      stepFor(w, w.maxTime + 2, () => [bot()]);
      assert.equal(w.over, true, `${w.id} (${diff}) ended`);
      assert.equal(w.won, true, `${w.id} (${diff}) won (${w.hatched}/${w.goal} hatched, timeLeft=${w.timeLeft.toFixed(1)}s)`);
      assert.ok(w.hatched >= w.goal, `${w.id} (${diff}) met egg goal`);
      assert.ok(w.stars >= 1 && w.stars <= 3, `${w.id} (${diff}) awarded stars`);
      assert.ok(w.coinsEarned > 0, `${w.id} (${diff}) awarded coins`);
    }
  }
});

test('2P Co-Op, 2P VS Egg-Thief Race, save sanitization, and Costume Barn purchases work cleanly', () => {
  // 2P Co-Op
  const coop = E.createWorld({ mode: 'coop', stage: 'w1s1', diff: 'normal' });
  assert.equal(coop.players.length, 2);
  assert.equal(coop.goal, E.getStage('w1s1').goal + 2);
  const b0 = makeGridBot(coop, 0), b1 = makeGridBot(coop, 1);
  stepFor(coop, coop.maxTime, () => [b0(), b1()]);
  assert.equal(coop.won, true, '2P co-op team wins stage');

  // 2P VS Race: rival dash bump + egg respawn + winner resolution
  const vs = E.createWorld({ mode: 'vs', world: 0, diff: 'normal' });
  assert.equal(vs.players.length, 2);
  const p0 = vs.players[0], p1 = vs.players[1];
  p0.x = 600; p0.y = 385; p1.x = 635; p1.y = 385;
  vs.eggs[0].state = 'carried'; p1.carry.push(vs.eggs[0]);
  E.stepWorld(vs, DT, [{ x: 1, y: 0, dash: true }, { x: 0, y: 0, dash: false }]);
  assert.ok(p1.bonkTimer > 0, 'dashing rival bumps opponent in VS mode');
  assert.equal(p1.carry.length, 0, 'bumped rival pops carried egg');

  // Exhaust timer in VS -> higher hatched count wins
  p0.hatched = 4; p1.hatched = 2;
  vs.time = vs.maxTime - 0.01;
  E.stepWorld(vs, 0.02, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  assert.equal(vs.over, true);
  assert.equal(vs.won, true);
  assert.equal(vs.winner, 0);

  // Save sanitization & Costume Barn
  const s = E.loadSave({ coins: -50, stars: [9, -2, 'bad'], skins: [0, 99, 2], skin: 99, diff: 'bogus', world: 99 });
  assert.equal(s.coins, 0);
  assert.equal(s.stars.length, 12);
  assert.deepEqual(s.stars.slice(0, 3), [3, 0, 0]);
  assert.deepEqual(s.skins, [0, 2]);
  assert.equal(s.skin, 0);
  assert.equal(s.diff, 'normal');
  assert.equal(s.world, 3);

  assert.equal(E.buyOrEquipSkin(s, 1).action, 'poor');
  s.coins = 50;
  const buy = E.buyOrEquipSkin(s, 1);
  assert.equal(buy.ok, true);
  assert.equal(buy.action, 'buy');
  assert.equal(s.skin, 1);
  assert.equal(s.coins, 50 - E.SKINS[1].cost);
  assert.equal(E.buyOrEquipSkin(s, 2).action, 'equip');
  assert.equal(s.skin, 2);
});

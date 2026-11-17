import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gameDir = path.join(repo, 'games/balloon-blast');

const BBData = require(path.join(gameDir, 'data.js'));
const BBEngine = require(path.join(gameDir, 'engine.js'));
const BBAI = require(path.join(gameDir, 'ai.js'));

const IDLE = { x: 0, y: 0, drop: false, kick: false };

function clearArena(w) {
  for (let r = 1; r < BBEngine.ROWS - 1; r++) {
    for (let c = 1; c < BBEngine.COLS - 1; c++) {
      BBEngine.setTile(w, c, r, BBEngine.EMPTY);
    }
  }
  w.pipes = [];
}

test('dual browser global and CommonJS exports work cleanly with 13x9 grid constants', () => {
  const ctx = vm.createContext({ window: {} });
  ctx.globalThis = ctx;
  for (const f of ['data.js', 'engine.js', 'ai.js']) {
    vm.runInContext(readFileSync(path.join(gameDir, f), 'utf8'), ctx, { filename: f });
  }
  assert.ok(ctx.window.BBData && ctx.window.BBEngine && ctx.window.BBAI);
  assert.equal(BBData.COLS, 13);
  assert.equal(BBData.ROWS, 9);
  assert.equal(BBData.POWERUPS.length, 6);
  assert.equal(BBData.WORLDS.length, 3);
  assert.equal(BBData.SKINS.length, 4);
});

test('open-grid generation keeps (1,1), (2,1), (3,1) and all 4 corner runways walkable across seeds', () => {
  for (const diff of ['easy', 'normal', 'hero']) {
    for (let seed = 1; seed <= 50; seed++) {
      const w = BBEngine.newMatch({ seed, diff });
      assert.equal(w.round, 1);
      assert.equal(w.phase, 'play');
      assert.equal(w.freeze, 0.4);
      assert.equal(BBEngine.tile(w, 1, 1), BBEngine.EMPTY);
      assert.equal(BBEngine.tile(w, 2, 1), BBEngine.EMPTY, `(2,1) must be walkable for seed ${seed}`);
      assert.equal(BBEngine.tile(w, 3, 1), BBEngine.EMPTY, `(3,1) must be walkable for seed ${seed}`);
      assert.equal(BBEngine.tile(w, 6, 4), BBEngine.EMPTY, 'central plaza open');
      assert.equal(w.pipes.length, 2, 'arena has paired warp pipes');

      for (const [sc, sr] of BBData.SPAWNS) {
        for (const [rc, rr] of BBEngine.escapeRunway(sc, sr)) {
          assert.equal(BBEngine.solid(BBEngine.tile(w, rc, rr)), false, `runway (${rc},${rr}) clear`);
        }
      }
    }
  }

  for (const stage of BBData.STAGES) {
    assert.equal(stage.grid.length, 9, `${stage.id} has 9 rows`);
    assert.ok(stage.grid.every(r => r.length === 13), `${stage.id} has 13 cols`);
    const w = BBEngine.newStage({ stage, seed: 7 });
    assert.equal(BBEngine.solid(BBEngine.tile(w, 1, 1)), false, `${stage.id} (1,1) walkable`);
    assert.equal(BBEngine.solid(BBEngine.tile(w, 2, 1)), false, `${stage.id} (2,1) walkable`);
    assert.equal(BBEngine.solid(BBEngine.tile(w, 3, 1)), false, `${stage.id} (3,1) walkable`);
  }
});

test('movement after 0.4s freeze increases P1 x cleanly, nudges corners, and warps via pipes', () => {
  const w = BBEngine.newMatch({ seed: 5 });
  const p1 = w.players[0];
  const startX = p1.x;
  const goRight = [{ x: 1, y: 0, drop: false, kick: false }, IDLE, IDLE, IDLE];

  // Advance past 0.4s freeze + 0.35s active movement
  for (let i = 0; i < 45; i++) BBEngine.step(w, 1 / 60, goRight);
  assert.equal(w.freeze, 0);
  assert.ok(p1.x - startX > 50, `expected px increase > 50, got ${p1.x - startX}`);

  // Corner nudge test
  clearArena(w);
  BBEngine.setTile(w, 4, 2, BBEngine.PILLAR);
  BBEngine.put(w, 0, 3, 3, 12, 0);
  const laneX = BBEngine.center(3);
  for (let i = 0; i < 35; i++) {
    BBEngine.step(w, 1 / 60, [{ x: 0, y: -1, drop: false, kick: false }, IDLE, IDLE, IDLE]);
  }
  assert.ok(Math.abs(p1.x - laneX) < 3, 'nudged into open vertical lane');
  assert.ok(p1.y < BBEngine.center(3) - 24, 'moved upward into lane');

  // Warp pipe test
  w.pipes = [{ c: 2, r: 2 }, { c: 10, r: 6 }];
  BBEngine.setTile(w, 2, 2, BBEngine.PIPE);
  BBEngine.setTile(w, 10, 6, BBEngine.PIPE);
  BBEngine.put(w, 0, 1, 2, 0, 0);
  p1.warpCd = 0;
  for (let i = 0; i < 30; i++) {
    BBEngine.step(w, 1 / 60, p1.warpCd > 0 ? [IDLE, IDLE, IDLE, IDLE] : goRight);
  }
  assert.equal(BBEngine.cellOf(p1).c, 10);
  assert.equal(BBEngine.cellOf(p1).r, 6);
});

test('chain splashes resolve in one tick and crate loot spawns in both Battle and Adventure modes', () => {
  const w = BBEngine.newMatch({ seed: 9, freeze: 0 });
  clearArena(w);
  BBEngine.setTile(w, 5, 2, BBEngine.PILLAR);
  BBEngine.setTile(w, 2, 4, BBEngine.CRATE);

  const ray = BBEngine.splashCells(w, 5, 4, 4).map(c => `${c.c},${c.r}`);
  assert.ok(ray.includes('5,3') && !ray.includes('5,2') && !ray.includes('5,1'), 'pillar blocks splash');
  assert.ok(ray.includes('2,4') && !ray.includes('1,4'), 'first crate stops splash');

  // Chain reaction order 1 -> 2 -> 3
  BBEngine.addBalloon(w, { id: 1, c: 3, r: 3, fuse: 0, range: 3, owner: 0 });
  BBEngine.addBalloon(w, { id: 2, c: 3, r: 5, fuse: 2.5, range: 3, owner: 1 });
  BBEngine.addBalloon(w, { id: 3, c: 6, r: 5, fuse: 2.5, range: 2, owner: 2 });
  BBEngine.step(w, 1 / 60, [IDLE, IDLE, IDLE, IDLE]);
  assert.equal(w.events.filter(e => e.t === 'boom').map(e => e.id).join(','), '1,2,3');
  assert.equal(w.balloons.length, 0);

  // Crate loot spawns and is NOT deleted by its own blast in Adventure & Battle
  for (const isAdv of [false, true]) {
    const gw = isAdv
      ? BBEngine.newStage({ stage: 'w1-s1', seed: 12, freeze: 0 })
      : BBEngine.newMatch({ seed: 12, freeze: 0 });
    clearArena(gw);
    BBEngine.put(gw, 0, 1, 7, 0, 0);
    for (let c = 2; c <= 10; c++) BBEngine.setTile(gw, c, 3, BBEngine.CRATE);
    for (let c = 2; c <= 10; c++) {
      BBEngine.addBalloon(gw, { c, r: 2, fuse: 0, range: 2, owner: 0 });
    }
    BBEngine.step(gw, 1 / 60, gw.players.map(() => IDLE));
    assert.ok(gw.drops.length > 0, `expected crate powerup drops in ${isAdv ? 'Adventure' : 'Battle'}`);
  }
});

test('all 6 toy powerups apply cleanly, and kick-balloon supports walk-kick and lob-throw', () => {
  const w = BBEngine.newMatch({ seed: 4, freeze: 0 });
  clearArena(w);
  const p = BBEngine.put(w, 0, 3, 4, 0, 0);

  for (let i = 0; i < 10; i++) {
    for (const kind of ['balloon', 'range', 'speed', 'kick', 'shield', 'turtle']) {
      BBEngine.addDrop(w, 3, 4, kind);
    }
    BBEngine.step(w, 1 / 60, [IDLE, IDLE, IDLE, IDLE]);
  }
  assert.equal(p.balloons, 6);
  assert.equal(p.range, 6);
  assert.equal(p.speed, 4);
  assert.equal(p.kick, true);
  assert.equal(p.shield, 1);
  assert.equal(p.mount, true);

  // Walk-into auto-kick slides balloon down corridor
  const b = BBEngine.addBalloon(w, { c: 4, r: 4, fuse: 2.5, range: 2, owner: 1 });
  for (let i = 0; i < 20; i++) {
    BBEngine.step(w, 1 / 60, [{ x: 1, y: 0, drop: false, kick: false }, IDLE, IDLE, IDLE]);
  }
  assert.ok(b.c > 5, `expected kicked balloon to slide past col 5, got ${b.c}`);

  // Blocked corridor triggers lob-throw over crate
  clearArena(w);
  w.balloons = [];
  BBEngine.put(w, 0, 2, 4, 0, 0);
  p.face = 1;
  const b2 = BBEngine.addBalloon(w, { c: 3, r: 4, fuse: 2.5, range: 2, owner: 0 });
  BBEngine.setTile(w, 4, 4, BBEngine.CRATE);
  assert.equal(BBEngine.tryKickOrThrow(w, p), true);
  assert.ok(b2.lob && b2.lob.tc === 5, 'balloon lobbed over crate to col 5');
  for (let i = 0; i < 30; i++) BBEngine.step(w, 1 / 60, [IDLE, IDLE, IDLE, IDLE]);
  assert.equal(b2.lob, null);
  assert.equal(b2.c, 5);
});

test('instant KO wins immediately with ZERO 23s lock, while shield and robo-turtle absorb splashes', () => {
  const w = BBEngine.newMatch({ seed: 2, freeze: 0 });
  clearArena(w);
  BBEngine.put(w, 0, 1, 1, 0, 0);
  // Place all 3 rivals at (6,4) and detonate at t ~ 0.1s
  BBEngine.put(w, 1, 6, 4, 0, 0);
  BBEngine.put(w, 2, 6, 4, 0, 0);
  BBEngine.put(w, 3, 6, 4, 0, 0);
  BBEngine.addBalloon(w, { c: 5, r: 4, fuse: 0.05, range: 2, owner: 0 });

  for (let i = 0; i < 10; i++) BBEngine.step(w, 1 / 60, [IDLE, IDLE, IDLE, IDLE]);
  assert.equal(w.phase, 'end', 'round ends immediately when rivals are KO-ed');
  assert.equal(w.winner, 0);
  assert.ok(w.time < 1.0, `no artificial 23s win lock! ended at ${w.time.toFixed(2)}s`);

  // Robo-turtle + Bubble Shield absorb two separate hits before KO
  const w2 = BBEngine.newMatch({ seed: 3, freeze: 0, diff: 'normal' });
  clearArena(w2);
  const p = BBEngine.put(w2, 0, 4, 4, 0, 0);
  p.mount = true;
  p.shield = 1;

  BBEngine.addBalloon(w2, { c: 3, r: 4, fuse: 0, range: 2, owner: 1 });
  BBEngine.step(w2, 1 / 60, [IDLE, IDLE, IDLE, IDLE]);
  assert.equal(p.state, 'play');
  assert.equal(p.mount, false, 'robo-turtle absorbed first hit');
  assert.equal(p.shield, 1);

  p.invT = 0;
  BBEngine.addBalloon(w2, { c: 3, r: 4, fuse: 0, range: 2, owner: 1 });
  BBEngine.step(w2, 1 / 60, [IDLE, IDLE, IDLE, IDLE]);
  assert.equal(p.state, 'play');
  assert.equal(p.shield, 0, 'bubble shield absorbed second hit');
});

test('difficulty scaling grants Easy shield + self-splash mercy, and Boss Raid wins on clearing boss + mobs', () => {
  const easyW = BBEngine.newMatch({ seed: 1, freeze: 0, diff: 'easy' });
  const heroW = BBEngine.newMatch({ seed: 1, freeze: 0, diff: 'hero' });
  assert.equal(easyW.players[0].shield, 1);
  assert.equal(easyW.players[0].selfMercy, true);
  assert.ok(easyW.fuse > heroW.fuse);
  assert.ok(heroW.players[1].tier > easyW.players[1].tier);

  // Easy self-splash mercy keeps P1 unscathed from own balloon
  clearArena(easyW);
  const p1 = BBEngine.put(easyW, 0, 3, 3, 0, 0);
  BBEngine.addBalloon(easyW, { c: 3, r: 3, fuse: 0, range: 2, owner: 0 });
  BBEngine.step(easyW, 1 / 60, [IDLE, IDLE, IDLE, IDLE]);
  assert.equal(p1.state, 'play');
  assert.equal(p1.shield, 1, 'self-mercy spared even the bubble shield');

  // Boss raid victory check
  const bossStage = BBEngine.newStage({ stage: 'w1-s3', seed: 5, freeze: 0, diff: 'normal' });
  assert.ok(bossStage.boss && bossStage.boss.hp >= 4);
  for (let i = 1; i < bossStage.players.length; i++) bossStage.players[i].state = 'out';
  while (bossStage.boss.hp > 0) {
    bossStage.boss.invT = 0;
    const bc = BBEngine.cellOf(bossStage.boss);
    BBEngine.addBalloon(bossStage, { c: bc.c, r: bc.r, fuse: 0, range: 2, owner: 0 });
    BBEngine.step(bossStage, 1 / 60, bossStage.players.map(() => IDLE));
  }
  assert.equal(bossStage.phase, 'won');
  assert.equal(bossStage.outcome, 'win');
  assert.ok(bossStage.stars >= 1);
});

test('AI danger-evasion flees imminent splashes and tier-5 bot matches complete reliably', () => {
  const w = BBEngine.newMatch({
    seed: 14, freeze: 0, diff: 'hero',
    players: [0, 1, 2, 3].map(i => ({ cpu: true, team: i, tier: 5, skin: 'ninja' }))
  });
  clearArena(w);
  const bot = BBEngine.put(w, 0, 4, 4, 0, 0);
  BBEngine.put(w, 1, 11, 7, 0, 0);
  BBEngine.put(w, 2, 1, 7, 0, 0);
  BBEngine.put(w, 3, 11, 1, 0, 0);
  BBEngine.addBalloon(w, { c: 4, r: 4, fuse: 1.5, range: 2, owner: 1 });

  for (let i = 0; i < 75; i++) BBEngine.step(w, 1 / 60, BBAI.inputs(w));
  assert.equal(bot.state, 'play', 'bot fled out of splash cross before detonation');
  const bc = BBEngine.cellOf(bot);
  assert.ok(bc.c !== 4 && bc.r !== 4, `bot stepped off both splash axes to (${bc.c},${bc.r})`);

  let totalDrops = 0, selfHits = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const mw = BBEngine.newMatch({
      seed, freeze: 0, diff: 'hero',
      players: [0, 1, 2, 3].map(i => ({ cpu: true, team: i, tier: 5, skin: BBData.SKINS[i].id }))
    });
    let steps = 0;
    while (mw.phase === 'play' && steps++ < 1200) BBEngine.step(mw, 0.1, BBAI.inputs(mw));
    assert.equal(mw.phase, 'end', `match seed ${seed} finished`);
    totalDrops += mw.botDrops;
    selfHits += mw.selfHits;
  }
  assert.ok(totalDrops > 40, `bots actively dropped balloons (${totalDrops})`);
  assert.ok(selfHits / totalDrops < 0.04, `low self-hit rate: ${selfHits}/${totalDrops}`);
});

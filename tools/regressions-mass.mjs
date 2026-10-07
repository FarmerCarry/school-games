import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};

// Evaluate the production functions, including their real geometry and mutation rules.
function sourceFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `Missing production function ${name}`);
  const body = source.indexOf('{', start);
  let depth = 0, quote = '', lineComment = false, blockComment = false;
  for (let i = body; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`Missing closing brace for ${name}`);
}

function blobContext(source, owners, extras = {}) {
  const c = { owners, cells: owners.flatMap(o => o.cells), player: null, T: 10,
    anyDead: false, Math, sfx: new Proxy({}, { get: () => noop }), ...extras };
  vm.createContext(c);
  vm.runInContext(['radius', 'resolveOwn', 'eatPellets', 'updateEjected'].map(name => sourceFunction(source, name)).join('\n'), c);
  return c;
}

function owner(masses, mergeAt = 0) {
  const o = { cells: [] };
  o.cells = masses.map(m => ({ o, m, r: 4.4 * Math.sqrt(m) + 4, x: 10, y: 10,
    dead: false, mergeAt, splitT: 0, wob: 0, mouth: 0 }));
  return o;
}

function permutations(a) {
  if (!a.length) return [[]];
  return a.flatMap((v, i) => permutations(a.filter((_, j) => j !== i)).map(rest => [v, ...rest]));
}

export function testMass({ root = REPO } = {}) {
  const blob = fs.readFileSync(path.join(root, 'games/blob-battle/game.js'), 'utf8');
  const cases = [...permutations([10, 20, 30]), ...permutations([10, 20, 40, 80]),
    Array.from({ length: 16 }, (_, i) => 10 + i)];
  for (const masses of cases) {
    const o = owner(masses), c = blobContext(blob, [o]);
    c.resolveOwn(1 / 60);
    const live = o.cells.filter(piece => !piece.dead);
    assert.equal(live.reduce((sum, piece) => sum + piece.m, 0), masses.reduce((a, b) => a + b, 0),
      `Blob merging must conserve mass for order ${masses}`);
    assert.equal(live.length, 1, 'Overlapping eligible pieces should merge completely');
  }
  {
    const a = owner([10, 20, 30]), b = owner([15, 25]), waiting = owner([10, 20, 40], 20);
    blobContext(blob, [a, b, waiting]).resolveOwn(1 / 60);
    assert.equal(a.cells.filter(c => !c.dead).reduce((sum, c) => sum + c.m, 0), 60);
    assert.equal(b.cells.filter(c => !c.dead).reduce((sum, c) => sum + c.m, 0), 40);
    assert.equal(waiting.cells.filter(c => !c.dead).length, 3, 'Merge cooldown must remain effective');
  }
  {
    const o = owner([30, 50]); o.cells[0].dead = true; o.cells[1].x = o.cells[1].y = 1000;
    let removed = 0;
    const c = blobContext(blob, [o], { BS: 100, GW: 1, buckets: [[0]], pX: [10], pY: [10], pGold: [0],
      clamp: (v, a, b) => Math.max(a, Math.min(v, b)), removePellet: () => removed++, placePellet: noop,
      pelletSndT: 0, pelletStreak: 0 });
    c.eatPellets();
    assert.equal(removed, 0, 'A merged-away piece cannot consume pellets before cleanup');
    assert.equal(o.cells[0].m, 30);
    c.ejected = [{ x: 10, y: 10, vx: 0, vy: 0, m: 12, r: 14, o: {}, t: 0, dead: false }];
    c.viruses = []; c.WS = 2000;
    c.updateEjected(0);
    assert.equal(c.ejected.length, 1, 'A merged-away piece cannot consume ejected mass');
    assert.equal(o.cells[0].m, 30);
  }
  {
    // A crowded late game: every sample lies inside a huge blob's danger zone.
    // Bot respawns must still get a spot instead of crashing the whole loop.
    const WS = 3400, step = WS / 6, cells = [];
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 6; gx++) {
      cells.push({ x: (gx + 0.5) * step, y: (gy + 0.5) * step, m: 3000, r: 4.4 * Math.sqrt(3000) + 4 });
    }
    let seed = 1;
    const c = { WS, cells, Math, rand: (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); } };
    vm.createContext(c);
    vm.runInContext(['radius', 'launchDist', 'safeSpot'].map(name => sourceFunction(blob, name)).join('\n'), c);
    for (const minM of [14, 31, 103]) {
      const spot = c.safeSpot(minM);
      assert.ok(spot && Number.isFinite(spot.x) && Number.isFinite(spot.y), `safeSpot(${minM}) must return a spot in a crowded arena`);
      assert.ok(spot.x >= 0 && spot.x <= WS && spot.y >= 0 && spot.y <= WS, 'The spot stays inside the arena');
    }
  }

  const snake = { window: {}, Math, performance: { now: () => 0 } };
  vm.createContext(snake);
  vm.runInContext(fs.readFileSync(path.join(root, 'games/snake-arena/data.js'), 'utf8'), snake);
  const worldSource = fs.readFileSync(path.join(root, 'games/snake-arena/world.js'), 'utf8');
  vm.runInContext(worldSource.replace(/\}\)\(\);\s*$/, 'window.massTest = { foodClear: foodClear, foodAdd: foodAdd, rebuildFoodGrid: rebuildFoodGrid, eat: eat };\n})();'), snake);
  const SA = snake.window.SA, W = SA.world, helpers = snake.window.massTest;
  W.reset('play'); W.spawnPlayer('test', SA.SKINS[0], 'round');
  const p = W.player;
  helpers.foodClear();
  helpers.foodAdd(p.hx + Math.cos(p.ang) * p.r * 0.3, p.hy + Math.sin(p.ang) * p.r * 0.3,
    990, 10, '#ffffff', 0, -1, 0);
  helpers.rebuildFoodGrid(); helpers.eat(p, 1 / 60);
  assert.equal(p.mass, 1000, 'The production food path must grow the player');
  p.grow(-980);
  assert.equal(p.peakMass, 1000, 'Food growth followed by shrinkage in the same tick must retain the peak');
  W.killSnake(p, null, 'border');
  assert.equal(p.mass, 20);
  assert.equal(p.peakMass, 1000, 'Death must preserve the run peak');

  const main = fs.readFileSync(path.join(root, 'games/snake-arena/main.js'), 'utf8');
  const stats = { bestLen: 50, totalKills: 2, bestKills: 1, games: 1, bestTime: 10,
    totalFood: 4, bestRank: 4, powerups: 2, top1Time: 0 };
  const nodes = new Map(), toasts = [];
  let writes = 0;
  const c = { W, SA, Math, stats, G: { state: 'play', run: { t: 5, kills: 1, food: 990,
    powerups: 0, bestRank: 99, top1T: 0, peakLen: 10, deathLen: 20, announced: {},
    checkpoint: { kills: 0, food: 0, powerups: 0, counted: false } } }, mouse: {},
    sfx: new Proxy({}, { get: () => noop }), R: { floatText: noop }, showScreen: noop,
    Kit: { fmt: String }, toast: (...args) => toasts.push(args), saveStats: () => writes++,
    $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } };
  vm.createContext(c);
  vm.runInContext(['unlocked', 'recordLength', 'projected', 'pauseGame', 'liveUnlockCheck', 'commitRun'].map(name => sourceFunction(main, name)).join('\n'), c);
  const original = JSON.stringify(stats);
  assert.equal(c.projected().bestLen, 1000);
  c.liveUnlockCheck();
  assert.equal(c.G.run.announced.grape, 1, 'A reached skin threshold stays unlocked after shrinkage');
  c.pauseGame();
  assert.equal(nodes.get('pBest').textContent, '1000', 'Pause best must show the peak rather than final mass');
  assert.equal(JSON.stringify(stats), original, 'Live projections must not write saved stats');
  assert.equal(writes, 0, 'Growth and unlock checks must not perform storage writes');
  assert.equal(c.commitRun(), true);
  assert.equal(stats.bestLen, 1000);
  assert.equal(stats.totalKills, 3, 'Existing cumulative stats remain compatible');
  assert.equal(c.commitRun(), false);
  assert.equal(writes, 1, 'Each run is committed exactly once');
  W.spawnPlayer('next run', SA.SKINS[0], 'round');
  assert.equal(W.player, p, 'The spawn path reuses the existing player object');
  assert.equal(p.peakMass, 10, 'Respawning must reset the prior run peak');
  W.reset('demo'); W.spawnPlayer('after demo', SA.SKINS[0], 'round');
  assert.equal(W.player.peakMass, 10, 'A world reset must not carry a peak into the next run');
  return { blobMergeOrders: cases.length, deadCellConsumption: 'pass', blobCrowdedRespawn: 'pass', snakePeakAndCommit: 'pass' };
}

export async function testSnake({ page, origin }) {
  await page.addInitScript(() => {
    window.requestAnimationFrame = callback => { window.massFrame = callback; return 1; };
    window.cancelAnimationFrame = () => {};
  });
  await page.goto(`${origin.replace(/\/$/, '')}/games/snake-arena/index.html`);
  // The game rejects starts during its first 250 ms as a double-click guard.
  // Poll with a timer: this fixture deliberately controls requestAnimationFrame.
  await page.waitForFunction(() => window.__game && performance.now() >= 250, null, { polling: 25 });
  const beforeReload = await page.evaluate(() => {
    __game.resetSave(); document.getElementById('btnPlay').click(); __game.god();
    if (__game.state !== 'play') throw new Error('Snake fixture did not start a run');
    __game.setMass(1000); __game.setMass(20);
    document.getElementById('btnPause').click();
    const pauseBest = document.getElementById('pBest').textContent;
    document.getElementById('btnResume').click();
    __game.killPlayer();
    let t = 1; massFrame(t);
    for (let i = 0; i < 110; i++) { t += 17; massFrame(t); }
    if (__game.state !== 'over') throw new Error('Snake fixture did not reach game over');
    const deathLen = SA.game.run.deathLen;
    document.getElementById('btnOSkins').click();
    const grape = document.getElementById('skinGrid').children[SA.SKINS.findIndex(s => s.id === 'grape')];
    return { pauseBest, bestLen: __game.stats.bestLen, deathLen,
      grapeLocked: grape.classList.contains('locked') };
  });
  assert.equal(beforeReload.pauseBest, '1,000');
  assert.equal(beforeReload.bestLen, 1000);
  assert.equal(beforeReload.deathLen, 20);
  assert.equal(beforeReload.grapeLocked, false);
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 25 });
  const afterReload = await page.evaluate(() => ({ bestLen: __game.stats.bestLen,
    titleBest: document.getElementById('tBest').textContent }));
  assert.equal(afterReload.bestLen, 1000, 'Peak record must survive reload');
  assert.equal(afterReload.titleBest, '1,000');
  return { beforeReload, afterReload };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(testMass({ root: process.argv[2] ? path.resolve(process.argv[2]) : REPO })));
}

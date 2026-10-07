import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const require = createRequire(import.meta.url);
const Sim = require(path.join(repo, 'games/candy-rope/sim.js'));
const LEVELS = require(path.join(repo, 'games/candy-rope/levels.js'));
const SOL = require(path.join(repo, 'games/candy-rope/solutions.js'));
let browser, server, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

// Steps the game by hand: each step renders once and advances one 1/60 s update.
async function game(t) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = () => ({ stop() {} });
    } });
    window.step = (n = 1, until) => {
      for (let i = 0; i < n; i++) { if (until && until()) return i; __game.bench(1); }
      return n;
    };
  });
  await page.goto(`${origin}/games/candy-rope/`);
  await page.evaluate(() => __game.resetSave());
  return page;
}

// Cuts both ropes of level 5 so the candy lands on the spikes, then waits for the fail panel.
async function loseLevel5(page) {
  await page.evaluate(() => {
    __game.start(4); step(40);
    __game.swipe(467, 180, 820, 180);
    step(400, () => __game.info().panel);
  });
  assert.deepEqual(await page.evaluate(() => [__game.info().state, __game.info().panel]), ['lost', true]);
}

test('every recorded hint plan wins with three stars, and doing nothing never wins', () => {
  LEVELS.forEach((level, i) => {
    const r = Sim.run(level, SOL[i]);
    assert.deepEqual([r.state, r.stars], ['won', 3], `level ${i + 1}`);
    assert.notEqual(Sim.run(level, []).state, 'won', `level ${i + 1} idle`);
  });
});

test('level 10 ring misses the resting candy but catches the bubble after a quick double cut', () => {
  const level = LEVELS[9], rest = Sim.create(level, { visual: false });
  for (let f = 0; f < 600; f++) { Sim.step(rest); rest.events.length = 0; }
  assert.equal(rest.rings[0].used, false);
  for (let gap = 0; gap <= 3; gap++) {
    const plan = [[30, 'cut', 'p1'], [30 + gap, 'cut', 'p0']], w = Sim.create(level, { visual: false }), seen = [];
    let k = 0;
    while (w.frame < 700 && w.state === 'play' && !seen.includes('attach')) {
      while (k < plan.length && plan[k][0] <= w.frame) Sim.act(w, plan[k++].slice(1));
      Sim.step(w);
      w.events.forEach(e => seen.push(e.type)); w.events.length = 0;
    }
    assert.ok(seen.indexOf('bubble') >= 0 && seen.indexOf('bubble') < seen.indexOf('attach'), `gap ${gap}: ${seen.join(' ')}`);
  }
});

test('after two misses the fail panel plays the solution, which earns nothing, then hands the level back', async t => {
  const page = await game(t);
  await loseLevel5(page);
  assert.match(await page.locator('#fHint').textContent(), /تلميح/);
  await page.keyboard.press('KeyR');
  await loseLevel5(page);
  assert.match(await page.locator('#fHint').textContent(), /شاهد الحل/);
  const saved = await page.evaluate(() => localStorage.getItem('sg:candy-rope:prog'));
  await page.locator('#fHint').click();
  assert.equal(await page.evaluate(() => __game.info().demo), true);
  const end = await page.evaluate(() => {
    const ate = step(1200, () => __game.info().state === 'won');
    return { ate, frames: step(200, () => !__game.info().demo), info: __game.info() };
  });
  assert.ok(end.ate < 1200, 'the demo plays the recorded plan to a win');
  assert.equal(end.info.demo, false);
  assert.equal(end.info.state, 'play');
  assert.equal(end.info.level, 4);
  assert.equal(end.info.world.ropes, 2);
  assert.equal(end.info.prog[4], -1);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:candy-rope:prog')), saved);
  assert.equal(await page.locator('#toast').textContent(), 'دورك الآن!');
});

test('a failed save keeps the stars on screen, warns, and the retry button saves them', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    __game.start(0); step(40);
    const r = __game.world().ropes[0], p = r.pts[Math.floor(r.pts.length / 2)];
    __game.swipe(p.x - 60, p.y, p.x + 60, p.y);
    step(300, () => __game.info().state === 'won');
  });
  assert.equal(await page.evaluate(() => __game.info().prog[0]), 3);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.realSetItem; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').count(), 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:candy-rope:prog')).stars[0]), 3);
});

test('reduced motion drops the decorative particles but keeps the game playable', async t => {
  const page = await game(t);
  const result = await page.evaluate(() => {
    Kit.motion.setPreference('full');
    __game.start(0); step(40);
    let r = __game.world().ropes[0], p = r.pts[Math.floor(r.pts.length / 2)];
    __game.swipe(p.x - 60, p.y, p.x + 60, p.y); step(2);
    const full = __game.info().particles;
    Kit.motion.setPreference('reduce');
    const cleared = __game.info().particles;
    __game.start(0); step(40);
    r = __game.world().ropes[0]; p = r.pts[Math.floor(r.pts.length / 2)];
    __game.swipe(p.x - 60, p.y, p.x + 60, p.y);
    step(300, () => __game.info().state === 'won');
    const reduced = __game.info();
    Kit.motion.setPreference('system');
    return { full, cleared, state: reduced.state, particles: reduced.particles };
  });
  assert.ok(result.full > 0);
  assert.equal(result.cleared, 0);
  assert.deepEqual([result.state, result.particles], ['won', 0]);
});

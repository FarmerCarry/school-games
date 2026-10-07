import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

// The game page with its frame loop captured, so the test drives time with __game.step.
async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = () => ({ stop() {} });
    } });
  });
  await page.goto(`${server.origin}/games/wacky-soccer/`);
  await page.waitForFunction(() => window.__game && __game.state === 'title');
  return page;
}

// The real physics and CPU brain, without a page.
function engine() {
  const sandbox = { Math, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['data.js', 'physics.js', 'ai.js']) {
    vm.runInContext(fs.readFileSync(path.join(repo, 'games/wacky-soccer', file), 'utf8'), sandbox, { filename: file });
  }
  const WS = sandbox.WS;
  const world = new WS.World(WS.makeParams('normal'));
  const homes = [[490, 250], [790, 1030]];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 2; i++) world.players.push(new WS.Player(world, WS.TEAMS[side], side, i, homes[side][i], WS.TEAMS[side].players[i]));
  }
  world.addBall(1000, 600);
  return { WS, world };
}

test('a denied save warns, keeps the purchase in play, and the retry stores it', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:wacky-soccer:save') throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return window.realSetItem.call(this, key, value);
    };
    __game.addCoins(100);
  });
  await clickControl(page, '#bShop');
  await page.locator('#shopGrid .item').nth(1).click();
  // the striped ball costs 40 and the first purchase earns the 10-coin shopping badge
  assert.deepEqual(await page.evaluate(() => [__game.save.ball, __game.save.coins]), ['stripes', 70]);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:wacky-soccer:save')), null);
  await page.evaluate(() => { Storage.prototype.setItem = window.realSetItem; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:wacky-soccer:save')));
  assert.equal(saved.ball, 'stripes');
  assert.ok(saved.balls.includes('stripes'));
  assert.equal(saved.coins, 70);
});

test('a press shortens the goal celebration and the roulette, but not below their minimums', async t => {
  const page = await game(t);
  await clickControl(page, '#b1p');
  await clickControl(page, '#bGo');
  const seen = await page.evaluate(() => {
    const m = () => __game.match;
    // hit-stop on big celebration kicks pauses match time, so step until the phase clock gets there
    const until = t => { for (let i = 0; i < 600 && m().t < t; i++) __game.step(1 / 60); };
    // a press during a hit-stop frame counts on the first frame after it, so look a few frames later
    const press = code => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      __game.step(1 / 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      __game.step(0.1);
      return m().phase;
    };
    const out = [];
    __game.step(1.3); out.push(m().phase);
    __game.goal(0);
    until(0.3); out.push(press('Space'));    // too early: keep celebrating
    until(1.0); out.push(press('Space'));    // after 1 s: on to the roulette
    until(1.0); out.push(press('KeyW'));     // still spinning
    until(2.1); out.push(press('Enter'));    // landed and readable: kick off
    __game.step(1.3);
    __game.winNow(); until(1.0); out.push(press('Space'), __game.state);
    until(1.9); __game.step(0.1); out.push(__game.state);   // the match-end flow is unchanged
    return out;
  });
  assert.deepEqual(seen, ['play', 'goal', 'roulette', 'roulette', 'count', 'end', 'play', 'over']);
});

test('reduced motion keeps the goal celebration but drops its confetti', async t => {
  const page = await game(t);
  await clickControl(page, '#b1p');
  await clickControl(page, '#bGo');
  const seen = await page.evaluate(() => {
    const out = [];
    const toPlay = () => { for (let i = 0; i < 900 && __game.match.phase !== 'play'; i++) __game.step(1 / 60); };
    toPlay(); __game.goal(0); out.push(__game.info().parts >= 110);
    Kit.motion.setPreference('reduce'); out.push(__game.info().parts < 40);   // switching clears flying confetti
    toPlay(); __game.goal(0); out.push(__game.match.phase, __game.info().parts < 40);
    return out;
  });
  assert.deepEqual(seen, [true, true, 'goal', true]);
});

test('a ball trapped under a foot pops out toward the other goal, never toward your own', () => {
  const { WS, world } = engine();
  for (const p of [world.players[0], world.players[2]]) {
    for (const side of [-1, 1]) {
      const ball = world.balls[0];
      ball.x = 600; ball.y = WS.G - ball.r; ball.vx = ball.vy = 0; ball.graceP = null;
      // a resting foot just above the ball, a little to one side of its centre
      const foot = ['c', ball.x - side * 12, ball.y - 20, 0, 0, 11, 0, 0, 0, 0, 'foot1'];
      ball.collidePlayer(p, [foot]);
      assert.ok((ball.x - 600) * p.dir > 0, `side ${p.side}, foot ${side < 0 ? 'right' : 'left'} of the ball: pushed toward the other goal`);
    }
  }
});

test('the CPU lookahead runs one simulated branch per frame and leaves the live match untouched', () => {
  const { WS, world } = engine();
  const cpu = new WS.CPU(1, 1);   // skill 1 always looks ahead when the ball is near
  cpu.cool = cpu.think = 0;
  let simSteps = 0;
  const step = world.step;
  world.step = function (dt) { if (this.sim) simSteps++; return step.call(this, dt); };
  const live = () => JSON.stringify([world.players.map(p => [p.x, p.y, p.vx, p.vy, p.a, p.mood, p.moodT]), world.balls.map(b => [b.x, b.y, b.vx, b.vy])]);
  world.players[2].mood = 1; world.players[2].moodT = 0.5;
  const perFrame = [];
  for (let frame = 0; frame < 2; frame++) {
    const before = live();
    simSteps = 0;
    assert.equal(cpu.update(world, 0), false);
    perFrame.push(simSteps);
    assert.equal(live(), before, `frame ${frame}: the live match is restored`);
  }
  assert.ok(perFrame.every(n => n > 0 && n <= 40), `one branch per frame (${perFrame})`);
  assert.equal(cpu.half, null, 'the lookahead finished on the second frame');
});

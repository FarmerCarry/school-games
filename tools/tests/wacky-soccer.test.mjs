import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
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

test('the Space that resumes a paused celebration does not also skip it', async t => {
  const page = await game(t);
  await clickControl(page, '#b1p');
  await clickControl(page, '#bGo');
  const seen = await page.evaluate(() => {
    const m = () => __game.match;
    const key = code => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };
    const out = [];
    __game.step(1.3);
    __game.goal(0);
    for (let i = 0; i < 600 && m().t < 1.2; i++) __game.step(1 / 60);
    key('KeyP'); out.push(__game.state);
    key('Space'); out.push(__game.state);
    __game.step(0.1); out.push(m().phase);   // the banner keeps playing after the resume
    key('Space'); __game.step(0.1); out.push(m().phase);   // a fresh press still skips it
    return out;
  });
  assert.deepEqual(seen, ['pause', 'play', 'goal', 'roulette']);
});

test('kickoff gives CPU players the shared WS.cpuPower kick', async t => {
  const page = await game(t);
  await clickControl(page, '#b1p');
  await clickControl(page, '#bGo');
  const powers = await page.evaluate(() => __game.world.players.map(p => [p.side, p.power === undefined ? 1 : p.power, WS.cpuPower(__game.match.skill)]));
  for (const [side, power, cpu] of powers) assert.equal(power, side ? cpu : 1);
});

test('a restored canvas context rebuilds the cached background and crowd atlas', async t => {
  const page = await game(t);
  const scales = await page.evaluate(() => {
    const calls = [], set = WS.art.setScale;
    WS.art.setScale = function (s) { calls.push(s); return set.apply(this, arguments); };
    document.getElementById('game').dispatchEvent(new Event('contextrestored'));
    return calls;
  });
  // scale 0 drops the caches, then the real scale is set again so they are redrawn
  assert.equal(scales[0], 0);
  assert.ok(scales.length >= 2 && scales[scales.length - 1] > 0, String(scales));
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

test('an Easy CPU plays its best against a team that stands still next to the ball, and eases off when it presses', () => {
  const { WS, world } = engine();
  const cpu = new WS.CPU(1, 0.2), ball = world.balls[0];
  const run = secs => { for (let i = 0; i < secs * 60; i++) cpu.update(world, 1 / 60); return cpu.sk; };
  ball.x = 1100;                        // far from the human players (490 and 250)
  assert.equal(run(4), 0.2, 'standing still away from the ball does not count');
  ball.x = world.players[0].x - 60;     // behind the front player, out of the back player's reach
  assert.equal(run(4), 0.2, 'nor does a ball they could not kick');
  ball.x = world.players[0].x + 60;     // right next to a human player
  assert.equal(run(1), 0.2, 'a short pause does not count');
  assert.equal(run(1.5), 0.85);
  cpu.notePress();
  assert.equal(run(1 / 60), 0.2, 'one press and the gentle Easy CPU is back');
  const hard = new WS.CPU(1, 0.85);
  for (let i = 0; i < 300; i++) hard.update(world, 1 / 60);
  assert.equal(hard.sk, 0.85, 'a stronger CPU keeps its own skill');
});

test('a Normal CPU plays sharper against button-mashing than against pressing at the right moment', () => {
  const { WS, world } = engine();
  world.balls[0].x = 1100;   // away from the human players, so standing still never counts
  // presses every `every` seconds for `secs` seconds; returns the skill the CPU ends up using
  const play = (cpu, every, secs) => {
    let t = 0;
    for (let i = 0; i < secs * 60; i++) { t += 1 / 60; if (every && t >= every) { t = 0; cpu.notePress(); } cpu.update(world, 1 / 60); }
    return cpu.sk;
  };
  const normal = new WS.CPU(1, 0.55);
  assert.equal(play(normal, 1.2, 6), 0.55, 'a press every 1.2 s is not mashing');
  assert.ok(Math.abs(play(normal, 0.4, 3) - 0.85) < 1e-9, 'a press every 0.4 s is');
  assert.equal(play(normal, 0, 1.2), 0.55, 'and it ends when the presses stop');
  assert.equal(play(new WS.CPU(1, 0.85), 0.4, 5), 0.95, 'Hard tops out just below full skill');
  assert.equal(play(new WS.CPU(1, 0.2), 0.4, 5), 0.2, 'Easy lets mashers win');
});

test('in the kick window legs and feet kick the ball forward, but head and body only bounce it', () => {
  const { world } = engine();
  const p = world.players[0], ball = world.balls[0];
  const touch = part => {
    ball.x = 600; ball.y = 400; ball.vx = -200; ball.vy = 0; ball.graceP = null;
    p.kickT = 0.2; p.kickHit = false; world.events.length = 0;
    // a still body part just to the right of the ball, coming at it from the front
    ball.collidePlayer(p, [['c', ball.x - 25, ball.y, 0, 0, 10, 0, 0, 0, 0, part]]);
    return [world.events.some(e => e.type === 'kick'), p.kickHit, Math.sign(ball.vx)];
  };
  assert.deepEqual(touch('foot0'), [true, true, 1]);
  assert.deepEqual(touch('leg1'), [true, true, 1]);
  assert.deepEqual(touch('foot1'), [true, true, 1]);
  assert.equal(touch('head')[0], false);
  assert.equal(touch('body')[0], false);
  assert.equal(p.kickHit, false, 'the kick is still there for the foot');
});

test('the balance simulator runs the real engine with the game\'s CPU kick power and press hook', () => {
  const sim = createRequire(import.meta.url)(path.join(repo, 'games/wacky-soccer/balance-sim.js'));
  const env = sim.load(), powers = [];
  let notes = 0;
  const power = env.WS.cpuPower, note = env.WS.CPU.prototype.notePress;
  env.WS.cpuPower = skill => { powers.push(skill); return power(skill); };
  env.WS.CPU.prototype.notePress = function () { notes++; return note.call(this); };
  const first = sim.cell(env, 'mash', 0.2, { n: 1, goals: 1, seed: 1 });
  assert.equal(first.n, 1);
  assert.equal(first.gf + first.ga, 1, 'one goal ends a first-to-1 match');
  assert.ok(powers.length > 0 && powers.every(skill => skill === 0.2), 'CPU players get WS.cpuPower(skill)');
  assert.ok(notes > 0, 'the CPU hears the simulated presses');
  // the same match index replays the same match
  assert.deepEqual(sim.cell(env, 'mash', 0.2, { n: 1, goals: 1, seed: 1 }), first);
});

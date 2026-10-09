import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { installGolfHarness } from '../golf-harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEY = 'sg:skybound-golf:progress';
const PEAK = 39; // frames from the start of the backswing to the top of the gauge
let browser, server;
before(async () => { server = await startTestServer(process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

// Frame-stepped game: nothing moves unless the test advances it.
async function game(t, { reducedMotion = 'no-preference', progress = null, scale = 1, play = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 995, height: 560 }, reducedMotion, deviceScaleFactor: scale });
  await context.addInitScript(installGolfHarness, { manual: true });
  if (progress) await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, value); } }, [KEY, JSON.stringify(progress)]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.goto(server.origin + '/games/skybound-golf/');
  if (play) await page.locator('#play').click();
  return page;
}
const phase = page => page.evaluate(() => golfState.phase);
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
async function swing(page, frames = PEAK) {
  await page.evaluate(n => advanceGolfFrames(n), frames);
  await page.keyboard.press('Space');
  await page.evaluate(() => advanceGolfFrames(6));
  assert.equal(await phase(page), 'flight');
}
async function land(page) {
  await page.evaluate(() => { for (let i = 0; i < 6000 && golfState.phase === 'flight'; i++) golfTick(1 / 60); golfRender(); });
  assert.equal(await phase(page), 'landed');
}

test('Golf: a swing at the top of the backswing is perfect, then the hit freezes for a moment', async t => {
  const page = await game(t);
  await page.evaluate(n => advanceGolfFrames(n), PEAK);
  assert(await page.evaluate(() => golfState.gauge.show && golfState.gauge.value > 0.95), 'the gauge peaks in the gold');
  await page.keyboard.press('Space');
  assert.equal(await phase(page), 'swing', 'the club swings down first');
  await page.evaluate(() => advanceGolfFrames(5));
  const hit = await page.evaluate(() => ({ phase: golfState.phase, grade: golfState.ball.grade, x: golfState.ball.x }));
  assert.deepEqual(hit, { phase: 'flight', grade: 'perfect', x: 0 });
  assert(await page.evaluate(() => golfState.flash > 0.3), 'a perfect hit flashes');
  await page.evaluate(() => advanceGolfFrames(4));
  assert.equal(await page.evaluate(() => golfState.ball.x), 0, 'hit-stop holds the ball');
  await page.evaluate(() => advanceGolfFrames(10));
  assert(await page.evaluate(() => golfState.ball.x > 2), 'then it flies');
  assert.match(await page.locator('#rockets').getAttribute('aria-label'), /1 من 1/);
});

test('Golf: the canvas strikes on press, not when a slow click is released', async t => {
  const page = await game(t);
  await page.evaluate(n => advanceGolfFrames(n), PEAK);
  const pressed = await page.evaluate(() => golfState.gauge.value);
  const box = await page.locator('#game').boundingBox();
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.evaluate(() => advanceGolfFrames(7));
  await page.mouse.up();
  await page.evaluate(() => advanceGolfFrames(3));
  assert.deepEqual(await page.evaluate(() => [golfState.ball.power, golfState.ball.rocketsLeft, golfState.ball.rockets, golfState.ball.armed]),
    [pressed, 1, 1, false], 'struck once, at the press; the release fires nothing');
});

test('Golf: one button in flight fires a rocket in the air and a super bounce near the ground', async t => {
  const page = await game(t, { progress: { v: 2, shots: 3, tips: 0, upgrades: { rockets: 1 } } });
  await swing(page);
  await page.evaluate(() => advanceGolfFrames(20));
  const vy = await page.evaluate(() => golfState.ball.vy);
  assert.match(await page.locator('#hint').textContent(), /صاروخ/);
  await page.keyboard.press('Space');
  const rocket = await page.evaluate(() => ({ left: golfState.ball.rocketsLeft, vy: golfState.ball.vy, flame: golfState.flame > 0 }));
  assert.deepEqual([rocket.left, rocket.flame], [1, true]);
  assert(rocket.vy > vy + 10, 'the rocket kicks the ball upwards');
  assert.match(await page.locator('#rockets').getAttribute('aria-label'), /1 من 2/);
  // Press a little early as the landing target appears: a good super bounce,
  // so the first-time hints stay on screen.
  await page.evaluate(() => { for (let i = 0; i < 2000 && !(golfState.reticle && golfState.reticle.t < 0.45); i++) golfTick(1 / 60); });
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => golfState.ball.armed), true);
  await page.evaluate(() => { for (let i = 0; i < 40 && !golfState.ball.supers; i++) golfTick(1 / 60); });
  assert.equal(await page.evaluate(() => golfState.ball.supers), 1, 'the landing becomes a super bounce');
  assert.equal(await page.evaluate(() => golfState.ball.rocketsLeft), 1, 'arming a landing never spends the rocket in hand');
  await page.evaluate(() => advanceGolfFrames(3));
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => golfState.ball.rocketsLeft), 0, 'on the way up the button is a rocket again');
  const hint = await page.locator('#hint').textContent();
  assert.match(hint, /قرب الأرض/);
  assert.doesNotMatch(hint, /صاروخ/, 'with no rockets left the hint stops offering one');
  const before = await page.evaluate(() => ({ vx: golfState.ball.vx, vy: golfState.ball.vy, armed: golfState.ball.armed }));
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => ({ vx: golfState.ball.vx, vy: golfState.ball.vy, armed: golfState.ball.armed })), before, 'an empty press on the way up changes nothing');
});

for (const exit of ['reload', 'menu', 'restart']) {
  test(`Golf: a finished shot is saved once on landing and survives ${exit}`, async t => {
    const page = await game(t);
    await swing(page);
    await land(page);
    const done = await saved(page);
    assert.equal(await page.evaluate(() => golfProbe.saves), 1, 'the shot is saved as it lands');
    assert(done.coins > 0 && done.shots === 1 && done.best === await page.evaluate(() => Math.floor(golfState.ball.maxX)));
    assert.equal(done.bests.meadow, done.best);
    if (exit !== 'reload') {
      await page.locator('#pause').click();
      await page.locator('#' + exit).click();
      assert.equal(await phase(page), exit === 'menu' ? 'title' : 'ready');
      assert.equal(await page.evaluate(() => golfProbe.saves), 1);
    }
    await page.reload();
    assert.deepEqual(await saved(page), done, 'leaving keeps exactly one finished shot');
    assert.equal(await page.evaluate(() => golfProbe.saves), 0, 'loading never awards it again');
  });
}

test('Golf: the result card opens by itself shortly after the landing', async t => {
  const page = await game(t);
  await swing(page);
  await land(page);
  await page.evaluate(() => advanceGolfFrames(60));
  assert.equal(await phase(page), 'landed', 'the landing shows first');
  await page.evaluate(() => advanceGolfFrames(60));
  assert.equal(await phase(page), 'result');
  assert.equal(await page.evaluate(() => golfProbe.saves), 1);
});

test('Golf: a held Space or Enter opens the result card but never skips past it', async t => {
  for (const key of ['Space', 'Enter']) {
    const page = await game(t);
    await swing(page);
    await land(page);
    await page.keyboard.down(key);
    assert.equal(await phase(page), 'result');
    for (let i = 0; i < 3; i++) await page.keyboard.down(key); // auto-repeat
    await page.keyboard.up(key);
    assert.equal(await phase(page), 'result', key + ' held: the card stays');
    await page.close();
  }
});

test('Golf: a held Enter on an upgrade buys one level', async t => {
  const page = await game(t, { play: false, progress: { v: 2, coins: 400, shots: 3, tips: 2 } });
  await page.locator('#open-shop').click();
  await page.locator('[data-upgrade="power"]').focus();
  await page.keyboard.down('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert.equal((await saved(page)).upgrades.power, 1);
  assert.equal(await page.locator('#shop-content').isVisible(), true, 'the shop stays open');
});

test('Golf: the second press of a double-click never acts on what the first one revealed', async t => {
  const page = await game(t, { play: false, progress: { v: 2, best: 300, bests: { meadow: 300 }, world: 0, shots: 3, tips: 2 } });
  await page.locator('#open-worlds').dblclick();
  assert.equal(await page.locator('#worlds-content').isVisible(), true, 'the world picker stays open');
  assert.equal(await page.evaluate(() => golfState.world), 0, 'no world was chosen');
  await page.keyboard.press('Escape');
  await page.locator('#play').dblclick();
  await page.evaluate(() => advanceGolfFrames(10));
  assert.deepEqual(await page.evaluate(() => [golfState.phase, golfState.ball]), ['ready', null], 'no stray swing');
  await page.evaluate(n => advanceGolfFrames(n), PEAK);
  await page.locator('#game').click({ position: { x: 200, y: 200 } });
  await page.evaluate(() => advanceGolfFrames(6));
  assert.equal(await phase(page), 'flight', 'a separate click still swings');
});

test('Golf: quick repeat clicks on one upgrade each buy a level', async t => {
  const page = await game(t, { play: false, progress: { v: 2, coins: 400, shots: 3, tips: 2 } });
  await page.locator('#open-shop').click();
  await page.locator('[data-upgrade="power"]').click();
  await page.locator('[data-upgrade="power"]').click({ clickCount: 2 });
  assert.equal((await saved(page)).upgrades.power, 3, 'a rebuilt card is still the same control');
});

test('Golf: the mute button works while a menu is open', async t => {
  const page = await game(t);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pause-content').isVisible(), true);
  const muted = await page.evaluate(() => Kit.audio.muted);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), !muted);
});

test('Golf: Space skips the landing to the result, which never awards twice; R plays again', async t => {
  const page = await game(t);
  await swing(page);
  await land(page);
  await page.keyboard.press('Space');
  assert.equal(await phase(page), 'result');
  assert.equal(await page.locator('#modal-heading').textContent(), 'رحلة رائعة!');
  assert.match(await page.locator('#result-coins').textContent(), /\+\d+/);
  const done = await saved(page);
  await page.evaluate(() => advanceGolfFrames(200));
  assert.equal(await page.evaluate(() => golfProbe.saves), 1);
  assert.deepEqual(await saved(page), done);
  await page.keyboard.press('KeyR');
  assert.deepEqual(await page.evaluate(() => [golfState.phase, golfState.ball]), ['ready', null]);
});

test('Golf: a new world unlocked by a shot is offered on the result card', async t => {
  const page = await game(t, { progress: { v: 2, best: 200, bests: { meadow: 200 }, shots: 4, tips: 2 } });
  await swing(page);
  await page.evaluate(() => { const b = golfState.ball; b.done = true; b.reason = 'rest'; b.maxX = 300; advanceGolfFrames(20); });
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#modal-heading').textContent(), 'رقم قياسي جديد!');
  assert.equal(await page.locator('#result-unlock').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#result-unlock button')), true);
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => [golfState.phase, golfState.world]), ['ready', 1]);
  assert.equal((await saved(page)).world, 1);
});

test('Golf: a failed save is reported and retried from the warning', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    window.failSaves = true;
    Storage.prototype.setItem = function (k, v) { if (window.failSaves && k.includes('skybound-golf')) throw new Error('full'); return setItem.call(this, k, v); };
  });
  await swing(page);
  await page.evaluate(() => { const b = golfState.ball; b.done = true; b.reason = 'rest'; b.maxX = 90; advanceGolfFrames(20); });
  assert.equal(await phase(page), 'landed');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true, 'a failed write is visible');
  assert.equal(await saved(page), null);
  await page.evaluate(() => { window.failSaves = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal((await saved(page)).best, 90, 'retry writes the kept progress');
  assert.equal(await page.locator('.sg-save-status button').isVisible(), false);
});

test('Golf: real shots in every world match the physics at 60 Hz', async t => {
  const page = await game(t, { play: false });
  for (let world = 0; world < 5; world++) for (const level of [0, 6, 12]) {
    const upgrades = { power: level, bounce: Math.min(10, level), rockets: Math.min(5, level / 2), magnet: Math.min(5, level / 2) };
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, JSON.stringify({ v: 2, world, best: 5000, shots: 9, tips: 2, upgrades })]);
    await page.reload();
    await page.locator('#play').click();
    await swing(page, PEAK - 3 + world);
    const result = await page.evaluate(([world, upgrades]) => {
      for (let i = 0; i < 9000 && golfState.phase === 'flight'; i++) golfTick(1 / 60);
      const P = GolfPhysics, course = P.createCourse(world), b = P.launch(course, upgrades, golfState.ball.power);
      while (!b.done) P.step(course, b, upgrades, P.pace(b) / 60);
      return { actual: golfState.ball.maxX, expected: b.maxX, coins: [golfState.ball.coins, b.coins], phase: golfState.phase, saves: golfProbe.saves };
    }, [world, upgrades]);
    assert.equal(result.actual, result.expected, `world ${world}, level ${level}`);
    assert.deepEqual(result.coins.length, 2); assert.equal(result.coins[0], result.coins[1]);
    assert.equal(result.phase, 'landed');
    assert.equal(result.saves, 1, 'each finished shot saves once');
  }
});

test('Golf: reduced motion keeps play complete without shake, flash, hit-stop, hops or trails', async t => {
  const page = await game(t, { reducedMotion: 'reduce' });
  await page.evaluate(n => advanceGolfFrames(n), PEAK);
  await page.keyboard.press('Space');
  const frames = await page.evaluate(() => {
    const seen = [];
    for (let i = 0; i < 20; i++) {
      golfTick(1 / 60);
      seen.push([golfState.shake.x, golfState.shake.y, golfState.flash, golfState.golfer.jump, golfState.trail.length]);
    }
    return { seen, grade: golfState.ball.grade, x: golfState.ball.x };
  });
  assert.equal(frames.grade, 'perfect');
  assert(frames.seen.every(f => f.every(v => v === 0)), JSON.stringify(frames.seen));
  assert(frames.x > 2, 'no hit-stop holds the ball');
  await page.evaluate(() => advanceGolfFrames(40));
  assert.deepEqual(await page.evaluate(() => [golfState.trail.length, golfState.shake.x, golfState.shake.y, golfState.flash]), [0, 0, 0, 0]);
  await land(page);
  await page.keyboard.press('Space');
  assert.equal(await phase(page), 'result');
  assert.equal(await page.locator('#modal-heading').isVisible(), true);
  // Classroom or system motion changes reach the renderer behind the result card.
  for (const reduced of [false, true]) {
    const motion = await page.evaluate(reduced => {
      const before = golfProbe.draws;
      Kit.motion.setPreference(reduced ? 'reduce' : 'full');
      golfRender(); const changed = golfProbe.draws - before; golfRender();
      return { reduced: golfState.reduced, changed, total: golfProbe.draws - before };
    }, reduced);
    assert.deepEqual(motion, { reduced, changed: 1, total: 1 }, 'a motion change repaints once and settles');
  }
});

test('Golf: a paused scene stays idle, and a lost canvas is repainted once', async t => {
  const page = await game(t, { scale: 2 });
  await swing(page);
  await page.evaluate(() => advanceGolfFrames(30));
  await page.locator('#pause').click();
  const result = await page.evaluate(() => {
    golfRender();
    const state = () => JSON.stringify({ ball: golfState.ball, cam: golfState.cam, time: golfState.time });
    const before = { draws: golfProbe.draws, state: state() };
    advanceGolfFrames(60);
    const idle = golfProbe.draws - before.draws;
    const canvas = document.getElementById('game');
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    golfRender(); const repaint = golfProbe.draws - before.draws - idle;
    for (let i = 0; i < 30; i++) golfRender();
    const settled = golfProbe.draws - before.draws - idle - repaint;
    document.fonts.dispatchEvent(new Event('loadingdone'));
    golfRender(); golfRender();
    const fonts = golfProbe.draws - before.draws - idle - repaint - settled;
    return { idle, repaint, settled, fonts, same: state() === before.state };
  });
  assert.deepEqual(result, { idle: 0, repaint: 1, settled: 0, fonts: 1, same: true }, 'late fonts repaint the kept frame once');
});

test('Golf: a save from the first version keeps its coins, refunds its upgrades and keeps its balls', async t => {
  const page = await game(t, { play: false, progress: { coins: 100, best: 640, world: 2, upgrades: { power: 2, bounce: 1, glide: 0 }, skins: ['gold'], skin: 'gold', shots: 9 } });
  assert.equal(await page.locator('#coins').textContent(), '310');
  assert.equal(await page.locator('#best-meters').textContent(), '640');
  assert.equal(await page.locator('#world-label').textContent(), 'قمم الثلج');
  assert.equal(await page.evaluate(() => golfState.skin), 'gold');
});

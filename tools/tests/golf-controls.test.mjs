import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { installGolfHarness } from '../golf-harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
// Allows this game to be checked against its shared-library dependency before merge.
const sharedRoot = process.env.SG_SHARED_ROOT ? path.resolve(process.env.SG_SHARED_ROOT) : root;
let browser, server, origin;

before(async () => {
  server = await startTestServer(root, {
    pages: { '/golf-parent': `<!doctype html><html><body>
        <button id="before">Before game</button>
        <iframe name="golf" title="Golf" src="/games/skybound-golf/" style="display:block;width:1280px;height:720px"></iframe>
        <button id="after">After game</button>
        <script>addEventListener('message', e => {
          const frame = document.querySelector('iframe');
          if (e.source === frame.contentWindow && e.data === 'sg:focus-portal') document.getElementById('before').focus();
        });</script></body></html>` },
    mounts: { '/shared/': path.join(sharedRoot, 'shared') }
  });
  origin = server.origin;
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

// The real game in the portal's iframe, with its own animation loop.
async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 920 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no browser errors'); });
  await page.addInitScript(installGolfHarness, { manual: false });
  await page.goto(`${origin}/golf-parent`);
  const frame = page.frame({ name: 'golf' });
  await frame.waitForFunction(() => window.golfState && window.golfTick);
  return { page, frame };
}

const phase = frame => frame.evaluate(() => golfState.phase);
const ball = frame => frame.evaluate(() => ({ x: golfState.ball.x, y: golfState.ball.y, time: golfState.ball.time }));
async function startFlight(frame) {
  await frame.locator('#play').click();
  await frame.locator('#game').click({ position: { x: 600, y: 300 } });
  await frame.waitForFunction(() => golfState.phase === 'flight' && golfState.ball.x > 0);
}
async function activate(page, frame, selector, key) {
  await frame.locator(selector).focus();
  await page.keyboard.press(key);
}
async function result(frame, distance = 1000) {
  await frame.evaluate(distance => {
    const b = golfState.ball; b.done = true; b.reason = 'rest'; b.maxX = distance;
  }, distance);
  await frame.waitForFunction(() => golfState.phase === 'landed');
  await frame.evaluate(() => document.getElementById('game').focus());
  await frame.page().keyboard.press('Space');
  assert.equal(await phase(frame), 'result');
}

test('Golf lifecycle pauses are idempotent and never steal focus back from the parent', async t => {
  const { page, frame } = await game(t);
  await startFlight(frame);
  await page.locator('#after').click();
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'after');
  const frozen = await ball(frame);
  await page.waitForTimeout(250);
  assert.deepEqual(await ball(frame), frozen, 'ball must stop after the first blur');

  // Leave the frame again after focusing its already-open pause menu.
  await frame.locator('#resume').focus();
  await page.locator('#before').click();
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'before');
  await frame.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(250);
  assert.deepEqual(await ball(frame), frozen, 'repeated blur/visibility events must not resume the ball');
  await frame.locator('#resume').click();
  await frame.waitForFunction(x => golfState.ball.x !== x || golfState.ball.done, frozen.x);
});

test('Golf manually paused flight remains paused when focus leaves and returns', async t => {
  const { page, frame } = await game(t);
  await startFlight(frame);
  await frame.locator('#game').focus();
  await page.keyboard.press('KeyP');
  const frozen = await ball(frame);
  await page.locator('#after').click();
  await frame.locator('#resume').focus();
  await page.waitForTimeout(250);
  assert.deepEqual(await ball(frame), frozen);
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  await page.keyboard.press('KeyP');
  assert.equal(await frame.locator('#modal').isVisible(), false, 'advertised P resumes with Resume focused');
  await frame.waitForFunction(x => golfState.ball.x !== x || golfState.ball.done, frozen.x);
});

for (const direction of ['forward', 'backward']) {
  test(`Golf ${direction} Tab navigation can leave the iframe during play and from the pause modal`, async t => {
    const { page, frame } = await game(t);
    await startFlight(frame);
    const key = direction === 'forward' ? 'Tab' : 'Shift+Tab';
    const expected = direction === 'forward' ? 'after' : 'before';
    for (let attempt = 0; attempt < 2; attempt++) {
      await frame.locator(direction === 'forward' ? '.sg-mute' : '#pause').focus();
      if (direction === 'backward') {
        await page.keyboard.press(key);
        assert.equal(await frame.evaluate(() => document.activeElement.id), 'game', 'Shift+Tab must not wrap from the first button to the last');
      }
      await page.keyboard.press(key);
      await page.waitForFunction(id => document.activeElement.id === id, expected);
      assert.equal(await frame.locator('#pause-content').isVisible(), true);
      assert.equal(await phase(frame), 'flight');
    }
  });
}

test('Golf ignores browser modifier chords and composition', async t => {
  // Frame-stepped, so the ball cannot pass its apex between presses.
  const page = await manualGame(t, null, false);
  await page.locator('#game').focus();
  const keys = ['Control+Space', 'Alt+Space', 'Meta+Space'];
  const phase = () => page.evaluate(() => golfState.phase);
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await phase(), 'title', `${key} must not start a round`);
  }
  await page.keyboard.press('Space');
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await phase(), 'ready', `${key} must not swing`);
  }
  await page.evaluate(() => document.getElementById('game').dispatchEvent(new KeyboardEvent('keydown', {
    code: 'Space', key: ' ', bubbles: true, cancelable: true, isComposing: true
  })));
  assert.equal(await phase(), 'ready');
  await page.evaluate(() => advanceGolfFrames(39));
  await page.keyboard.press('Space');
  await page.evaluate(() => advanceGolfFrames(20));
  assert.deepEqual(await page.evaluate(() => [golfState.phase, golfState.ball.vy > 5]), ['flight', true]);
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => golfState.ball.rocketsLeft), 1, `${key} must not fire a rocket`);
  }
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => golfState.ball.rocketsLeft), 0, 'unmodified Space fires the rocket');
});

test('Golf native Space activates focused controls once and keeps the pause and result shortcuts', async t => {
  const { page, frame } = await game(t);
  await activate(page, frame, '#open-shop', 'Space');
  assert.equal(await phase(frame), 'title');
  assert.equal(await frame.locator('#shop-content').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#modal').isVisible(), false);
  await activate(page, frame, '#open-worlds', 'Space');
  assert.equal(await frame.locator('#worlds-content').isVisible(), true);
  await page.keyboard.press('Escape');
  await activate(page, frame, '#play', 'Space');
  assert.equal(await phase(frame), 'ready');
  await activate(page, frame, '#game', 'Space');
  await frame.waitForFunction(() => golfState.phase === 'flight');
  await activate(page, frame, '#pause', 'Space');
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#modal').isVisible(), false);
  await frame.locator('#game').focus();
  await page.keyboard.press('Escape');
  await activate(page, frame, '#resume', 'Space');
  assert.equal(await frame.locator('#modal').isVisible(), false);
  await result(frame);
  const before = await frame.evaluate(() => Kit.store('skybound-golf').get('progress').upgrades.power);
  await activate(page, frame, '[data-upgrade="power"]', 'Space');
  assert.equal(await phase(frame), 'result', 'buying an upgrade must not restart the round');
  assert.equal(await frame.evaluate(() => Kit.store('skybound-golf').get('progress').upgrades.power), before + 1);
  assert.equal(await frame.evaluate(() => document.activeElement === document.querySelector('#result-unlock button')), true,
    'a keyboard purchase on the unlock card hands Space back to the new world');
  await activate(page, frame, '#again', 'Space');
  assert.equal(await phase(frame), 'ready');
  await activate(page, frame, '#game', 'Space');
  await frame.waitForFunction(() => golfState.phase === 'flight');
  await result(frame, 50);
  await page.keyboard.press('KeyR');
  assert.equal(await phase(frame), 'ready', 'advertised R plays again with Again focused');
});

// Frame-stepped game: the gauge only moves when the test advances it.
async function manualGame(t, progress, play = true) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  await context.addInitScript(installGolfHarness, { manual: true });
  if (progress) await context.addInitScript(p => localStorage.setItem('sg:skybound-golf:progress', p), JSON.stringify(progress));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no browser errors'); });
  await page.goto(`${origin}/games/skybound-golf/`);
  if (!play) return page;
  await page.locator('#play').click();
  await page.evaluate(() => advanceGolfFrames(39)); // the club is at the top of the gold zone
  return page;
}

test('Golf strikes from the keyboard once, at the moment of the press', async t => {
  const page = await manualGame(t);
  await page.locator('#game').focus();
  const pressed = await page.evaluate(() => golfState.gauge.value);
  await page.keyboard.down('Enter');
  await page.evaluate(() => advanceGolfFrames(7)); // the gauge would have moved on by the release
  await page.keyboard.up('Enter');
  await page.evaluate(() => advanceGolfFrames(3));
  assert.deepEqual(await page.evaluate(() => ({ phase: golfState.phase, power: golfState.ball.power, grade: golfState.ball.grade, rockets: golfState.ball.rocketsLeft })),
    { phase: 'flight', power: pressed, grade: 'perfect', rockets: 1 });
});

test('Golf world unlock keeps Space on the new world after buying upgrades', async t => {
  // A 300 m shot pays 30+ coins: with 80 saved, enough for two bounce levels and one power level.
  const page = await manualGame(t, { v: 2, world: 0, best: 200, bests: { meadow: 200 }, coins: 80, shots: 5, tips: 2 });
  await page.keyboard.press('Space');
  await page.evaluate(() => {
    advanceGolfFrames(20);
    const b = golfState.ball; b.done = true; b.reason = 'rest'; b.maxX = 300;
    advanceGolfFrames(2);
  });
  await page.keyboard.press('Space');
  const go = page.locator('#result-unlock button'), focused = () => go.evaluate(b => b === document.activeElement);
  assert.equal(await focused(), true);
  assert.match(await page.locator('#again').getAttribute('class'), /\bsecondary\b/, 'the new world is the main button');
  // A keyboard purchase returns to the new world even when the upgrade stays
  // affordable, and a held Enter neither buys again nor opens the world.
  const bounce = () => page.evaluate(() => Kit.store('skybound-golf').get('progress').upgrades.bounce);
  await page.locator('[data-upgrade="bounce"]').focus();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert.equal(await bounce(), 1);
  assert.equal(await page.locator('[data-upgrade="bounce"]').isDisabled(), false);
  assert.equal(await focused(), true);
  assert.equal(await page.evaluate(() => golfState.phase), 'result');
  // A mouse purchase leaves Space/Enter with the card's advertised action.
  await page.locator('[data-upgrade="bounce"]').click();
  assert.equal(await bounce(), 2);
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
  // A keyboard purchase that disables its button falls back to the new world, not to Again.
  await page.locator('[data-upgrade="power"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-upgrade="power"]').isDisabled(), true);
  assert.equal(await focused(), true);
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => ({ phase: golfState.phase, world: golfState.world })), { phase: 'ready', world: 1 });
});

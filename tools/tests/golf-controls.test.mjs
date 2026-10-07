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

async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 920 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no browser errors'); });
  await page.addInitScript(() => {
    // Observe the real renderer state and update function without adding a
    // production debug API or replacing the game's animation loop/physics.
    let kit, art, physics;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      const loop = kit.loop;
      kit.loop = (update, render, options) => {
        window.advanceGolf = update;
        return loop(update, render, options);
      };
    } });
    Object.defineProperty(window, 'GolfArt', { configurable: true, get: () => art, set(value) {
      art = value;
      const draw = art.draw;
      art.draw = (ctx, state) => { window.golfState = state; return draw(ctx, state); };
    } });
    Object.defineProperty(window, 'GolfPhysics', { configurable: true, get: () => physics, set(value) {
      physics = value;
      const step = physics.step;
      window.physicsSteps = 0;
      physics.step = (...args) => { window.physicsSteps++; return step(...args); };
    } });
  });
  await page.goto(`${origin}/golf-parent`);
  const frame = page.frame({ name: 'golf' });
  await frame.waitForFunction(() => window.golfState && window.advanceGolf);
  return { page, frame };
}

async function phase(frame) { return frame.evaluate(() => golfState.phase); }
async function ball(frame) { return frame.evaluate(() => ({ x: golfState.ball.x, y: golfState.ball.y, time: golfState.ball.time })); }
async function startFlight(frame) {
  await frame.locator('#play').click();
  await frame.locator('#hit').click();
  await frame.waitForFunction(() => golfState.phase === 'flight' && golfState.ball.x > 0);
}
async function activate(page, frame, selector, key) {
  await frame.locator(selector).focus();
  await page.keyboard.press(key);
}
async function speedSteps(frame) {
  return frame.evaluate(() => {
    physicsSteps = 0;
    advanceGolf(1 / 60);
    return physicsSteps;
  });
}
async function result(frame) {
  await frame.evaluate(() => {
    golfState.ball.stopped = true;
    golfState.ball.surface = 'grass';
    golfState.ball.maxX = 1000;
    for (let i = 0; i < 50; i++) advanceGolf(1 / 60);
  });
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
  await frame.waitForFunction(x => golfState.ball.x !== x, frozen.x);
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
  await frame.waitForFunction(x => golfState.ball.x !== x, frozen.x);
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

test('Golf ignores browser modifier chords and composition without changing phase or flight speed', async t => {
  const { page, frame } = await game(t);
  await frame.locator('#game').focus();
  const keys = ['Control+Space', 'Alt+Space', 'Meta+Space'];
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await phase(frame), 'title', `${key} must not start a round`);
  }
  await page.keyboard.press('Space');
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await phase(frame), 'ready', `${key} must not strike the ball`);
  }
  await frame.evaluate(() => document.getElementById('game').dispatchEvent(new KeyboardEvent('keydown', {
    code: 'Space', key: ' ', bubbles: true, cancelable: true, isComposing: true
  })));
  assert.equal(await phase(frame), 'ready');
  await page.keyboard.press('Space');
  assert.equal(await phase(frame), 'flight');
  assert.equal(await speedSteps(frame), 1);
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await speedSteps(frame), 1, `${key} must not accelerate flight`);
  }
  await page.keyboard.press('Space');
  assert.equal(await speedSteps(frame), 3, 'unmodified game-owned Space accelerates');
});

for (const key of ['Space']) {
  test(`Golf native ${key} activates focused controls once and preserves pause/result shortcuts`, async t => {
    const { page, frame } = await game(t);
    await activate(page, frame, '#open-upgrades', key);
    assert.equal(await phase(frame), 'title');
    assert.equal(await frame.locator('#upgrades-content').isVisible(), true);
    await page.keyboard.press('Escape');
    await activate(page, frame, '#play', key);
    assert.equal(await phase(frame), 'ready');
    await activate(page, frame, '#hit', key);
    assert.equal(await phase(frame), 'flight');
    await activate(page, frame, '#flight-hint', key);
    assert.equal(await speedSteps(frame), 3, 'native activation changes speed exactly once');
    await activate(page, frame, '#pause', key);
    assert.equal(await frame.locator('#pause-content').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await frame.locator('#modal').isVisible(), false);
    await frame.locator('#game').focus();
    await page.keyboard.press('Escape');
    await activate(page, frame, '#resume', key);
    assert.equal(await frame.locator('#modal').isVisible(), false);
    await result(frame);
    const before = await frame.evaluate(() => Kit.store('skybound-golf').get('progress').upgrades.power);
    await activate(page, frame, '[data-upgrade="power"]', key);
    assert.equal(await phase(frame), 'result', 'native upgrade activation must not restart the round');
    assert.equal(await frame.evaluate(() => Kit.store('skybound-golf').get('progress').upgrades.power), before + 1);
    await activate(page, frame, '#again', key);
    assert.equal(await phase(frame), 'ready');
    await activate(page, frame, '#hit', key);
    await result(frame);
    await page.keyboard.press('KeyR');
    assert.equal(await phase(frame), 'ready', 'advertised R restarts with Again focused');
  });
}

// Frame-stepped game: the needle only moves when the test advances it.
async function manualGame(t, progress) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  await context.addInitScript(installGolfHarness, { manual: true });
  if (progress) await context.addInitScript(p => localStorage.setItem('sg:skybound-golf:progress', p), JSON.stringify(progress));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no browser errors'); });
  await page.goto(`${origin}/games/skybound-golf/`);
  await page.locator('#play').click();
  await page.evaluate(() => advanceGolfFrames(29)); // the needle is now in the perfect band
  return page;
}

test('Golf hit button strikes when pressed, not when the slow click is released', async t => {
  const page = await manualGame(t);
  const box = await page.locator('#hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // A normal click holds the button for about 120 ms while the needle keeps moving.
  await page.evaluate(() => advanceGolfFrames(7));
  await page.mouse.up();
  const shot = await page.evaluate(() => ({ phase: golfState.phase, quality: golfState.quality, age: golfState.shotAge }));
  assert.equal(shot.phase, 'flight');
  assert.equal(shot.quality, 1, 'the press time decides the shot (release time would score about 0.58)');
  assert(Math.abs(shot.age - 7 / 60) < 1e-9, 'struck once, at the press');
});

test('Golf hit button still strikes once from the keyboard', async t => {
  const page = await manualGame(t);
  await page.locator('#hit').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => ({ phase: golfState.phase, quality: golfState.quality, age: golfState.shotAge })), { phase: 'flight', quality: 1, age: 0 });
});

test('Golf world unlock keeps Space on the new world after buying upgrades', async t => {
  // The perfect 300 m shot pays 120 coins: enough for one bounce and one power level.
  const page = await manualGame(t, { world: 0, best: 200, coins: 20 });
  await page.locator('#hit').click();
  await page.evaluate(() => {
    golfState.ball.stopped = true; golfState.ball.surface = 'grass'; golfState.ball.maxX = 300;
    advanceGolfFrames(50);
  });
  const go = page.locator('#result-unlock button'), focused = () => go.evaluate(b => b === document.activeElement);
  assert.equal(await focused(), true);
  assert.match(await page.locator('#again').getAttribute('class'), /\bcream\b/, 'the new world is the only coral button');
  // A mouse purchase leaves Space/Enter with the card's advertised action.
  await page.locator('[data-upgrade="bounce"]').click();
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
  // A keyboard purchase that disables its button falls back to the new world, not to Again.
  await page.locator('[data-upgrade="power"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-upgrade="power"]').isDisabled(), true);
  assert.equal(await focused(), true);
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => ({ phase: golfState.phase, world: golfState.world })), { phase: 'ready', world: 1 });
});

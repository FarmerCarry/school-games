import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { installGolfHarness } from '../golf-harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const sharedRoot = process.env.SG_SHARED_ROOT ? path.resolve(repo, process.env.SG_SHARED_ROOT) : root;
let browser, server, origin;

before(async () => {
  server = await startTestServer(root, {
    pages: {
      '/golf-parent': `<!doctype html><html><body>
        <button id="before">Before game</button>
        <iframe name="golf" title="Golf" src="/games/skybound-golf/" style="display:block;width:1280px;height:720px"></iframe>
        <button id="after">After game</button>
        <script>addEventListener('message', e => {
          const frame = document.querySelector('iframe');
          if (e.source === frame.contentWindow && e.data === 'sg:focus-portal') document.getElementById('before').focus();
        });</script></body></html>`
    },
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
  await page.addInitScript(installGolfHarness, { manual: false });
  await page.goto(`${origin}/golf-parent`);
  const frame = page.frame({ name: 'golf' });
  await frame.waitForFunction(() => window.__game && window.golfTick);
  return { page, frame };
}

async function manualGame(t, save = null, play = true) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  await context.addInitScript(installGolfHarness, { manual: true });
  if (save) await context.addInitScript(s => localStorage.setItem('sg:skybound-golf:save_v3', s), JSON.stringify(save));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no browser errors'); });
  await page.goto(`${origin}/games/skybound-golf/`);
  await page.waitForFunction(() => window.__game && window.golfTick);
  if (!play) return page;
  await page.locator('#play').click();
  await page.evaluate(() => advanceGolfFrames(2));
  return page;
}

const phase = frame => frame.evaluate(() => __game.phase);
const ballPos = frame => frame.evaluate(() => ({ x: __game.ball.x, y: __game.ball.y, time: __game.ball.time }));

async function startFlight(frame) {
  await frame.locator('#play').click();
  await frame.waitForFunction(() => __game.phase === 'aim');
  await frame.locator('#game').click({ position: { x: 600, y: 300 } });
  await frame.waitForFunction(() => __game.phase === 'power');
  await frame.locator('#game').click({ position: { x: 600, y: 300 } });
  await frame.waitForFunction(() => __game.phase === 'flight' && __game.ball && __game.ball.x > 0);
}

async function activate(page, frame, selector, key) {
  await frame.locator(selector).focus();
  await page.keyboard.press(key);
}

async function toResult(frame, dist = 300) {
  await frame.evaluate(d => {
    const b = __game.ball; b.done = true; b.reason = 'rest'; b.maxX = d; b.maxY = 85; b.coins = 30;
  }, dist);
  await frame.waitForFunction(() => __game.phase === 'landed');
  await frame.evaluate(() => document.getElementById('game').focus());
  await frame.page().keyboard.press('Space');
  await frame.waitForFunction(() => __game.phase === 'result');
}

test('Golf lifecycle pauses are idempotent and never steal focus back from the parent', async t => {
  const { page, frame } = await game(t);
  await startFlight(frame);
  await page.locator('#after').click();
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'after');
  const frozen = await ballPos(frame);
  await page.waitForTimeout(240);
  assert.deepEqual(await ballPos(frame), frozen, 'ball freezes after iframe blur');

  await frame.locator('#resume').focus();
  await page.locator('#before').click();
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'before');
  await frame.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(240);
  assert.deepEqual(await ballPos(frame), frozen, 'visibility events never resume automatically');
  await frame.locator('#resume').click();
  await frame.waitForFunction(x => __game.ball && (__game.ball.x !== x || __game.ball.done), frozen.x);
});

test('Golf manually paused flight remains paused when focus leaves and returns, and P resumes', async t => {
  const { page, frame } = await game(t);
  await startFlight(frame);
  await frame.locator('#game').focus();
  await page.keyboard.press('KeyP');
  const frozen = await ballPos(frame);
  await page.locator('#after').click();
  await frame.locator('#resume').focus();
  await page.waitForTimeout(240);
  assert.deepEqual(await ballPos(frame), frozen);
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  await page.keyboard.press('KeyP');
  assert.equal(await frame.locator('#modal').isVisible(), false, 'P resumes even with Resume focused');
  await frame.waitForFunction(x => __game.ball && (__game.ball.x !== x || __game.ball.done), frozen.x);
});

test('Golf Shift+Tab leaves iframe back to portal and pauses cleanly', async t => {
  const { page, frame } = await game(t);
  await startFlight(frame);
  await frame.locator('#game').focus();
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(() => document.activeElement.id === 'before');
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  assert.equal(await phase(frame), 'flight');
});

test('Golf ignores browser modifier chords and IME composition in every phase', async t => {
  const page = await manualGame(t, null, false);
  await page.locator('#game').focus();
  const keys = ['Control+Space', 'Alt+Space', 'Meta+Space'];
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await phase(page), 'title', `${key} must not start`);
  }
  await page.keyboard.press('Space');
  assert.equal(await phase(page), 'aim');
  for (const key of keys) {
    await page.keyboard.press(key);
    assert.equal(await phase(page), 'aim', `${key} must not lock aim`);
  }
  await page.evaluate(() => document.getElementById('game').dispatchEvent(new KeyboardEvent('keydown', {
    code: 'Space', key: ' ', bubbles: true, cancelable: true, isComposing: true
  })));
  assert.equal(await phase(page), 'aim');
  await page.evaluate(() => advanceGolfFrames(25));
  await page.keyboard.press('Space');
  assert.equal(await phase(page), 'power');
  await page.evaluate(() => advanceGolfFrames(25));
  await page.keyboard.press('Space');
  await page.evaluate(() => advanceGolfFrames(15));
  assert.equal(await phase(page), 'flight');
  const fuelBefore = await page.evaluate(() => __game.ball.fuel);
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.evaluate(() => advanceGolfFrames(4));
  }
  assert.equal(await page.evaluate(() => __game.ball.fuel), fuelBefore, 'modifier chords never burn fuel');
});

test('Golf two-step strike locks on press, rocket boost burns while held, and ArrowDown dives without fuel', async t => {
  const page = await manualGame(t);
  await page.locator('#game').focus();
  await page.evaluate(() => advanceGolfFrames(20));
  const aimAtPress = await page.evaluate(() => __game.aimAngle);
  await page.keyboard.down('Space');
  await page.evaluate(() => advanceGolfFrames(6));
  await page.keyboard.up('Space');
  assert.equal(await phase(page), 'power');
  assert.equal(await page.evaluate(() => __game.aimAngle), aimAtPress, 'aim locked at keydown, not keyup');

  await page.evaluate(() => advanceGolfFrames(24));
  const pwrAtPress = await page.evaluate(() => __game.powerVal);
  await page.keyboard.down('Enter');
  await page.evaluate(() => advanceGolfFrames(8));
  await page.keyboard.up('Enter');
  await page.evaluate(() => advanceGolfFrames(6));
  assert.equal(await phase(page), 'flight');
  assert.equal(await page.evaluate(() => __game.ball.power), pwrAtPress, 'power locked at keydown, not keyup');

  // Holding Space fires continuous rocket boost
  const fuel0 = await page.evaluate(() => __game.ball.fuel);
  await page.keyboard.down('Space');
  await page.evaluate(() => advanceGolfFrames(15));
  const boosting = await page.evaluate(() => __game.ball.boosting);
  const fuel1 = await page.evaluate(() => __game.ball.fuel);
  await page.keyboard.up('Space');
  await page.evaluate(() => advanceGolfFrames(2));
  assert.equal(boosting, true, 'holding Space activates rocket boost');
  assert(fuel1 < fuel0 - 0.15, 'rocket boost consumes fuel while held');
  assert.equal(await page.evaluate(() => __game.ball.boosting), false, 'releasing Space stops rocket boost');

  // ArrowDown triggers dive without consuming rocket fuel
  const fuelBeforeDive = await page.evaluate(() => __game.ball.fuel);
  await page.keyboard.press('ArrowDown');
  const diveState = await page.evaluate(() => ({ diving: __game.ball.diving, fuel: __game.ball.fuel }));
  assert.equal(diveState.diving, true, 'ArrowDown triggers dive/super-bounce');
  assert.equal(diveState.fuel, fuelBeforeDive, 'ArrowDown saves rocket fuel');
});

test('Golf native Space activates controls once and preserves Pause/Shop/Skins/Result shortcuts', async t => {
  const { page, frame } = await game(t);
  await activate(page, frame, '#open-shop', 'Space');
  assert.equal(await frame.locator('#shop-content').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#modal').isVisible(), false);

  await activate(page, frame, '#open-skins', 'Space');
  assert.equal(await frame.locator('#skins-content').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#modal').isVisible(), false);

  await activate(page, frame, '#play', 'Space');
  assert.equal(await phase(frame), 'aim');
  await frame.locator('#game').click({ position: { x: 600, y: 300 } });
  await frame.waitForFunction(() => __game.phase === 'power');
  await frame.locator('#game').click({ position: { x: 600, y: 300 } });
  await frame.waitForFunction(() => __game.phase === 'flight');

  await activate(page, frame, '#pause', 'Space');
  assert.equal(await frame.locator('#pause-content').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#modal').isVisible(), false);

  await toResult(frame, 360);
  const powerBefore = await frame.evaluate(() => __game.save.upgrades.power);
  await activate(page, frame, '#upgrades [data-upgrade="power"]', 'Space');
  assert.equal(await phase(frame), 'result', 'buying upgrade keeps result open');
  assert.equal(await frame.evaluate(() => __game.save.upgrades.power), powerBefore + 1);

  await page.keyboard.press('KeyR');
  await frame.waitForFunction(() => __game.phase === 'aim');
});

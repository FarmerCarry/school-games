import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
// Allows this game to be checked against its shared-library dependency before merge.
const sharedRoot = process.env.SG_SHARED_ROOT ? path.resolve(process.env.SG_SHARED_ROOT) : root;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let browser, server, origin;

before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/golf-parent') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><body>
        <button id="before">Before game</button>
        <iframe name="golf" title="Golf" src="/games/skybound-golf/" style="display:block;width:1280px;height:720px"></iframe>
        <button id="after">After game</button>
        <script>addEventListener('message', e => {
          const frame = document.querySelector('iframe');
          if (e.source === frame.contentWindow && e.data === 'sg:focus-portal') document.getElementById('before').focus();
        });</script></body></html>`);
      return;
    }
    const base = pathname.startsWith('/shared/') ? sharedRoot : root;
    const file = path.resolve(base, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
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

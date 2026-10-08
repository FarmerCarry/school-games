import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

// The level verifier's winning input for level 1 (one 0/1 per 1/60 s step).
function levelOneInput() {
  const result = spawnSync(process.execPath, ['games/swing-hook/verify-levels.js', '1', '--json'], { cwd: repo, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.split('\n').find(line => line.startsWith('{')))['1'];
}

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});

after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function gamePage(t, { deferFonts = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(deferFonts => {
    if (deferFonts) {
      // Font loads resolve only when the test says so.
      const load = document.fonts.load.bind(document.fonts);
      const gate = new Promise(resolve => { window.releaseFonts = resolve; });
      document.fonts.load = (...args) => load(...args).then(value => gate.then(() => value));
    }
    // Count full scene paints: every frame starts by filling the whole sky.
    window.paints = 0;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && x === 0 && y === 0 && w === 1280 && h === 720) window.paints++;
      return fill.apply(this, arguments);
    };
    // Run the real update function in fixed steps under test control.
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); render(0); };
          // One update and one render per animation frame, like Kit.loop at 60 Hz.
          window.runFrames = count => { for (let i = 0; i < count; i++) { update(1 / 60); render(0); } };
          return { stop() {} };
        };
      }
    });
  }, deferFonts);
  await page.goto(`${server.origin}/games/swing-hook/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

const state = page => page.evaluate(() => __game.state());

test('resuming from pause mid-swing keeps the rope until the player holds again', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); stepGame(1); });
  await page.keyboard.down('Space');
  await page.evaluate(() => { for (let i = 0; i < 120 && !__game.state().hooked; i++) stepGame(1); });
  assert.equal((await state(page)).hooked, true);

  // P to pause and P again while Space is still held: the swing simply continues.
  await page.keyboard.press('KeyP');
  await page.evaluate(() => stepGame(1));
  assert.equal((await state(page)).mode, 'pause');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => stepGame(4));
  let s = await state(page);
  assert.equal(s.mode, 'play');
  assert.equal(s.hooked, true, 'holding through a P pause must not drop the rope');

  // Losing focus resets held keys; the Resume button then waits, frozen, for a new hold.
  await page.evaluate(() => { dispatchEvent(new Event('blur')); stepGame(1); });
  await page.keyboard.up('Space');
  const paused = await state(page);
  assert.equal(paused.mode, 'pause');
  await page.evaluate(() => { document.getElementById('psResume').click(); stepGame(30); });
  const frozen = await state(page);
  assert.equal(frozen.mode, 'play');
  assert.equal(frozen.hooked, true, 'resume must not let go of the rope');
  await page.evaluate(() => stepGame(30));
  s = await state(page);
  assert.deepEqual([s.x, s.y, s.timer], [frozen.x, frozen.y, frozen.timer], 'the swing waits for the player');
  assert.deepEqual(s.cam, paused.cam, 'the view holds still while the swing waits');

  await page.keyboard.down('Space');
  await page.evaluate(() => stepGame(6));
  s = await state(page);
  assert.equal(s.hooked, true);
  assert.ok(s.timer > frozen.timer, 'holding again continues the swing');
  await page.keyboard.up('Space');

  // Restart from a waiting resume starts a normal fresh run.
  await page.evaluate(() => { stepGame(1); dispatchEvent(new Event('blur')); stepGame(1); });
  await page.evaluate(() => { document.getElementById('psRestart').click(); stepGame(2); });
  s = await state(page);
  assert.deepEqual([s.mode, s.st, s.timer], ['play', 'ready', 0]);
});

test('a mouse button held through a P pause keeps the swing going, like Space', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); stepGame(1); });
  await page.mouse.move(550, 360);
  await page.mouse.down();
  await page.evaluate(() => { for (let i = 0; i < 120 && !__game.state().hooked; i++) stepGame(1); });
  const hooked = await state(page);
  assert.equal(hooked.hooked, true);
  await page.keyboard.press('KeyP');
  await page.evaluate(() => stepGame(1));
  assert.equal((await state(page)).mode, 'pause');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => stepGame(4));
  const s = await state(page);
  assert.equal(s.mode, 'play');
  assert.equal(s.hooked, true);
  assert.ok(s.timer > hooked.timer, 'the swing continues without a second press');
  await page.mouse.up();
});

test('a paused game keeps its last frame and redraws only for resize, fonts and context restore', async t => {
  const page = await gamePage(t, { deferFonts: true });
  const paintsDuring = count => page.evaluate(n => { paints = 0; runFrames(n); return paints; }, count);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runFrames(20); });
  await page.keyboard.press('KeyP');
  assert.equal(await paintsDuring(1), 1, 'pausing draws the frozen scene once');
  assert.equal((await state(page)).mode, 'pause');
  assert.equal(await paintsDuring(60), 0, 'then nothing is redrawn while paused');

  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await paintsDuring(10), 1, 'a resize redraws the paused scene once');

  await page.evaluate(async () => { releaseFonts(); await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.equal(await paintsDuring(10), 1, 'a late font redraws the paused scene once');

  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    const transform = () => Array.from(ctx.getTransform().toFloat64Array());
    const before = transform();
    // A restored 2D context has lost both its pixels and its drawing state.
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    paints = 0; runFrames(10);
    // (No pixel read-back: on the software GPU it costs seconds. The paint count shows the redraw.)
    return { same: JSON.stringify(transform()) === JSON.stringify(before), paints };
  });
  assert.deepEqual(restored, { same: true, paints: 1 }, 'a restored canvas gets its scale back and is redrawn');

  await page.keyboard.press('KeyP');
  assert.equal(await paintsDuring(10), 10, 'resuming draws every frame again');
  assert.equal((await state(page)).mode, 'play');
});

test('the hero celebrates above the water after crossing the finish', async t => {
  const page = await gamePage(t);
  await page.evaluate(input => { __game.start(0); __game.script(input); }, levelOneInput());
  await page.evaluate(() => { for (let i = 0; i < 1200 && __game.state().st !== 'won'; i++) stepGame(1); });
  const won = await state(page);
  assert.equal(won.st, 'won');
  const samples = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 300 && __game.mode !== 'result'; i++) { stepGame(1); if (i % 10 === 0) out.push(__game.state()); }
    out.push(__game.state());
    return out;
  });
  assert.equal(samples.at(-1).mode, 'result');
  for (const s of samples) assert.ok(s.y < 900 - 100, `hero must stay above the sea (y ${s.y})`);
  assert.ok(samples.at(-1).x - won.x < 400, 'hero stays near the finish flag');
});

test('a failed save shows the retry warning and keeps progress after a successful retry', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
  });
  await page.evaluate(input => { __game.start(0); __game.script(input); }, levelOneInput());
  await page.evaluate(() => { for (let i = 0; i < 1500 && __game.mode !== 'result'; i++) stepGame(1); });
  const status = () => page.evaluate(() => {
    const panel = document.querySelector('.sg-save-status');
    return { hidden: panel.hidden, state: panel.getAttribute('data-state') };
  });
  assert.deepEqual(await status(), { hidden: false, state: 'failed' });
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:swing-hook:save')), null);

  await page.evaluate(() => {
    Storage.prototype.setItem = window.realSetItem;
    document.querySelector('.sg-save-status button').click();
  });
  assert.equal((await status()).state, 'saved');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:swing-hook:save')));
  assert.equal(stored.unlocked, 2);
  assert.equal(stored.stars[0] & 1, 1);
});

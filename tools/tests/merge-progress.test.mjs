import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = await startTestServer(site);
  origin = server.origin;
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function gamePage(t, ...inits) {
  const context = await browser.newContext();
  t.after(() => context.close());
  for (const init of inits) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'game should not throw browser errors'));
  await page.goto(origin + '/games/merge-2048/');
  return page;
}

const state = page => page.evaluate(() => window.__game.state());
const awaitScreen = (page, screen) =>
  page.waitForFunction(value => window.__game.state().screen === value, screen, { timeout: 15000 });
// Animation frames run only when a test calls runFrames(n), so game time is exact.
const manualFrames = () => {
  const callbacks = [];
  let time = 0;
  window.requestAnimationFrame = callback => callbacks.push(callback);
  window.runFrames = count => {
    for (let i = 0; i < count; i++) { time += 1000 / 60; callbacks.splice(0).forEach(callback => callback(time)); }
  };
};
// Timers fire only when a test calls runTimers(ms), in due order, so toasts need no real waiting.
const manualTimers = () => {
  const timers = new Map();
  let time = 0, id = 0;
  window.setTimeout = (callback, ms = 0) => { timers.set(++id, { at: time + ms, callback }); return id; };
  window.clearTimeout = handle => timers.delete(handle);
  window.runTimers = ms => {
    const end = time + ms;
    for (let due; (due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]);) {
      timers.delete(due[0]); time = due[1].at; due[1].callback();
    }
    time = end;
  };
};
const nextBox = page => page.evaluate(() => ({
  hidden: document.getElementById('nextBox').hidden,
  name: document.getElementById('nextName').textContent,
  req: document.getElementById('nextReq').textContent,
  bar: document.getElementById('nextBar').style.width
}));

test('A failed write shows the save warning until Retry stores the board', async t => {
  const page = await gamePage(t);
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    window.__game.set([2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    Storage.prototype.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
    window.__game.move(3);
  });
  const panel = page.locator('.sg-save-status');
  assert.equal(await panel.getAttribute('data-state'), 'failed');
  assert.equal(await panel.isVisible(), true);
  // Later moves keep warning while storage is still failing.
  await page.evaluate(() => window.__game.move(1));
  assert.equal(await panel.getAttribute('data-state'), 'failed');

  await page.evaluate(() => { Storage.prototype.setItem = Storage.prototype.realSetItem; });
  await panel.locator('button').click();
  assert.equal(await panel.getAttribute('data-state'), 'saved');
  const saved = await state(page);
  assert.equal(saved.screen, 'play', 'Retry must not start a drag move or leave the game');

  await page.reload();
  await page.keyboard.press('Enter');
  const restored = await state(page);
  assert.deepEqual(restored.values, saved.values);
  assert.equal(restored.score, saved.score);
  assert.equal(restored.best[4], saved.best[4]);
});

test('The HUD shows the next theme and switches after its unlock is announced', async t => {
  const page = await gamePage(t);
  await page.keyboard.press('Enter');
  const icon = await page.evaluate(() => {
    let drawn = null;
    const draw = window.M2048.drawTile;
    window.M2048.drawTile = function (c, theme, v) { if (c.canvas.id === 'nextTile') drawn = [theme.id, v]; return draw.apply(this, arguments); };
    window.__game.set([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    return drawn;
  });
  assert.deepEqual(await nextBox(page), { hidden: false, name: 'حلوى', req: 'اصنع 128', bar: '14%' });
  assert.deepEqual(icon, ['candy', 128], 'the icon shows the tile to make, not the theme preview');

  await page.evaluate(() => {
    window.__game.set([64, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3);
  });
  // The earned theme stays on screen with a full bar until its toast.
  assert.deepEqual(await nextBox(page), { hidden: false, name: 'حلوى', req: 'اصنع 128', bar: '100%' });
  await page.waitForFunction(() => document.getElementById('nextName').textContent === 'تطوّر', null, { timeout: 15000 });
  assert.deepEqual(await nextBox(page), { hidden: false, name: 'تطوّر', req: 'اصنع 256', bar: '88%' });

  await page.evaluate(() => window.__game.unlockAll());
  assert.equal((await nextBox(page)).hidden, true);
  await page.reload();
  await page.keyboard.press('Enter');
  assert.equal((await nextBox(page)).hidden, true, 'nothing is left to unlock');
});

test('A theme unlock waiting behind a record toast moves the HUD on only when it shows', async t => {
  // A best score from an earlier game, so beating it shows the record toast.
  const page = await gamePage(t, manualFrames, manualTimers, () => localStorage.setItem('sg:merge-2048:best', '{"4":8}'));
  await page.keyboard.press('Enter');
  const [waiting, between, shown] = await page.evaluate(() => {
    const texts = () => ['toast', 'nextName'].map(id => document.getElementById(id).textContent);
    window.__game.set([64, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3);
    runFrames(90); // 1.5 s: the record toast is up and the unlock (0.9 s) is queued behind it
    const waiting = texts();
    runTimers(2300); // the record toast is sliding away
    const between = texts();
    runTimers(200); // 0.38 s after it left, the unlock takes its place
    return [waiting, between, texts()];
  });
  assert.deepEqual(waiting, ['🏆 رقم قياسي جديد!', 'حلوى']);
  assert.equal(between[1], 'حلوى');
  assert.match(shown[0], /^🔓 شكل جديد: «حلوى»/);
  assert.equal(shown[1], 'تطوّر');
});

test('A 3x3 save from before the 256 goal that already holds 256 resumes into the win screen', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => Kit.store('merge-2048').set('g3', {
    v: [256, 4, 2, 2, 8, 0, 0, 0, 0], s: 3000, u: 3, h: [], w: false, k: false, m: 200, sb: 0
  }));
  await page.reload();
  await page.keyboard.press('Digit3');
  await page.keyboard.press('Enter');
  await awaitScreen(page, 'win');
  assert.equal(await page.locator('#winNum').textContent(), '256');
  await page.locator('#btnKeep').click();
  assert.equal(await page.locator('#goalTxt').textContent(), '512');
  assert.equal((await state(page)).keep, true);
});

test('The 3x3 challenge is won at 256 and its game-over hint names that goal', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => Kit.store('merge-2048').set('best', { 3: 500 }));
  await page.reload();
  await page.keyboard.press('Digit3');
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).N, 3);
  assert.equal(await page.locator('#goalTxt').textContent(), '256');

  await page.evaluate(() => {
    window.__game.set([0, 0, 0, 0, 0, 0, 128, 128, 4]);
    window.__game.move(3);
  });
  await awaitScreen(page, 'win');
  assert.equal(await page.locator('#winNum').textContent(), '256');

  await page.keyboard.press('KeyR');
  await page.evaluate(() => {
    // One move left: after it, no tile can merge whichever tile spawns.
    window.__game.set([2, 4, 2, 4, 2, 16, 0, 128, 8]);
    window.__game.move(3);
  });
  await awaitScreen(page, 'over');
  assert.equal(await page.locator('#overHint').textContent(), 'كنت قريباً جداً من 256! 😮');
});

test('Reduced motion keeps merge feedback but trims celebration particles', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3);
  });
  // The score "+N" pop stays visible instead of finishing its fade at once.
  const plus = page.locator('#scoreBox .plus');
  await plus.waitFor({ state: 'attached', timeout: 15000 });
  assert.deepEqual(await plus.evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el).opacity, el.textContent]),
    ['none', '1', '+4']);
  // A quick second merge replaces the still pop instead of stacking on it.
  await page.evaluate(() => {
    window.__game.set([8, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3);
  });
  const pops = await page.waitForFunction(() => {
    const labels = [...document.querySelectorAll('#scoreBox .plus')].map(el => el.textContent);
    return labels.includes('+16') && labels;
  }, null, { timeout: 15000 });
  assert.deepEqual(await pops.jsonValue(), ['+16']);

  await page.evaluate(() => {
    window.__game.nearWin();
    window.__game.move(3);
  });
  await awaitScreen(page, 'win');
  await page.waitForTimeout(800);
  // Full motion adds 160 + 80 confetti and a 26-particle burst here.
  assert.ok((await state(page)).parts <= 40, 'win confetti is capped');
});

test('A paused board is drawn once, settled, redrawn after resize, context restore or a theme change, and resumes its effects', async t => {
  const page = await gamePage(t, manualFrames);
  await page.keyboard.press('Enter');
  const result = await page.evaluate(() => {
    let n = 0, tiles = [];
    // Remember which tile value each cached sprite shows, to list the tiles a frame draws.
    const art = new Map(), drawTile = window.M2048.drawTile, draw = CanvasRenderingContext2D.prototype.drawImage;
    window.M2048.drawTile = function (c, theme, v) { art.set(c.canvas, v); return drawTile.apply(this, arguments); };
    CanvasRenderingContext2D.prototype.drawImage = function (image) {
      if (this.canvas.id === 'game') { n++; if (art.has(image)) tiles.push(art.get(image)); }
      return draw.apply(this, arguments);
    };
    const frames = count => { n = 0; tiles = []; runFrames(count); return n; };
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3); // its slide, pop, new tile and merge burst are all still to come
    document.getElementById('btnPause').click();
    const first = frames(1), shown = JSON.stringify(tiles.sort());
    const board = JSON.stringify(window.__game.state().values.filter(Boolean).sort());
    const idle = frames(30), parts = window.__game.state().parts;
    dispatchEvent(new Event('resize'));
    const resized = frames(1), resizedIdle = frames(30);
    document.getElementById('game').dispatchEvent(new Event('contextrestored'));
    const restored = frames(1), restoredIdle = frames(30);
    window.__game.unlockAll();
    document.getElementById('btnTheme').click(); // Tab still reaches the HUD behind the pause panel
    const themed = frames(1), themedIdle = frames(30), theme = window.__game.state().theme;
    document.getElementById('btnResume').click();
    const playing = [frames(1), frames(10)];
    return { first: first > 0, settled: shown === board, idle, parts, resized: resized > 0, resizedIdle, restored: restored > 0, restoredIdle,
      themed: themed > 0, themedIdle, theme, playing: playing.every(count => count > 0), burst: window.__game.state().parts > 0 };
  });
  assert.deepEqual(result, { first: true, settled: true, idle: 0, parts: 0, resized: true, resizedIdle: 0, restored: true, restoredIdle: 0,
    themed: true, themedIdle: 0, theme: 'candy', playing: true, burst: true });
});

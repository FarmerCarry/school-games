import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { runScenario } from '../game-scenarios.mjs';
import { testNativeControlGame } from '../regressions-keyboard.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

// The fixture advances the real Kit update callback at 60 Hz. It never moves
// obstacles, forces a crash, or bypasses collisions; inputs use player controls.
async function game(t, { manual = true, saved, deniedStorage = false, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: touch });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  context.on('request', request => { if (!request.url().startsWith(server.origin)) errors.push('External request: ' + request.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors or external requests'); });
  await page.addInitScript(({ manual, saved, deniedStorage }) => {
    if (saved !== undefined && !sessionStorage.getItem('dino-fixture-seeded')) {
      localStorage.setItem('sg:dino-3d:best', saved);
      sessionStorage.setItem('dino-fixture-seeded', '1');
    }
    let kit, update, render;
    const probe = window.dinoProbe = { rounds: [], ends: [], failSave: false, ready: 0, paints: 0 };
    probe.step = count => {
      for (let i = 0; i < count; i++) update(1 / 60);
      if (render) render(0);
    };
    probe.finish = () => {
      for (let i = 0; i < 3600 && window.Dino3DGame.mode === 'playing'; i++) update(1 / 60);
      if (render) render(0);
      return window.Dino3DGame.mode;
    };
    probe.count = count => {
      probe.paints = 0;
      for (let i = 0; i < count; i++) { update(1 / 60); if (render) render(0); }
      return probe.paints;
    };
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const clear = type.prototype.clear;
      type.prototype.clear = function () {
        if (this.canvas.id === 'scene') probe.paints++;
        return clear.apply(this, arguments);
      };
    }
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      const loop = kit.loop, round = kit.stats.round, end = kit.stats.end, ready = kit.ready;
      kit.loop = (u, r, options) => {
        update = u; render = r;
        return manual ? { running: true, stop() {} } : loop(u, r, options);
      };
      kit.stats.round = (...args) => { probe.rounds.push(args); return round.apply(kit.stats, args); };
      kit.stats.end = (...args) => { probe.ends.push(args); return end.apply(kit.stats, args); };
      kit.ready = (...args) => { probe.ready++; return ready.apply(kit, args); };
    } });
    const write = Storage.prototype.setItem, read = Storage.prototype.getItem;
    Storage.prototype.setItem = function (key) {
      if (deniedStorage || (probe.failSave && key.startsWith('sg:dino-3d:'))) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    Storage.prototype.getItem = function () {
      if (deniedStorage) throw new DOMException('Storage fixture', 'SecurityError');
      return read.apply(this, arguments);
    };
  }, { manual, saved, deniedStorage });
  await page.goto(`${server.origin}/games/dino-3d/`);
  await page.waitForFunction(() => !!window.Dino3DGame && window.dinoProbe.ready === 1, null, { polling: 40 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const step = (page, count = 1) => page.evaluate(count => dinoProbe.step(count), count);
const state = page => page.evaluate(() => ({ mode: Dino3DGame.mode, score: Dino3DGame.state.score,
  distance: Dino3DGame.state.distance, player: { ...Dino3DGame.state.player } }));
const focusSurface = page => page.evaluate(() => { document.activeElement?.blur(); Kit.keys.reset(); });
async function key(page, code) {
  await page.keyboard.press(code);
  await step(page);
}
async function crash(page) {
  assert.equal(await page.evaluate(() => dinoProbe.finish()), 'over', 'an unattended run reaches a real obstacle collision');
}

test('Dino 3D participates in the catalog native-control regression', async () => {
  await testNativeControlGame({ browser, origin: server.origin, slug: 'dino-3d' });
});

test('Dino 3D real controls start, jump, pause, and restart the live game', async t => {
  const page = await game(t, { manual: false });
  assert.equal((await runScenario(page, 'dino-3d')).checks.length, 4);
});

test('Dino 3D jumping, crouching and repeated pause freeze the whole simulation', async t => {
  const page = await game(t);
  await page.locator('#play').click();
  await focusSurface(page);
  await page.keyboard.down('Space');
  await step(page, 8);
  assert.ok((await state(page)).player.y > 0, 'Space lifts the dinosaur');
  await page.keyboard.up('Space');
  await page.keyboard.down('ArrowDown');
  await step(page, 80);
  assert.equal((await state(page)).player.y, 0, 'fast descent reaches the ground');
  assert.equal((await state(page)).player.duck, true, 'held Down crouches on landing');
  await page.keyboard.up('ArrowDown');
  await step(page);
  assert.equal((await state(page)).player.duck, false);
  await page.locator('#pause-button').click();
  const frozen = await state(page);
  assert.equal(frozen.mode, 'paused');
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('blur')); });
  await step(page, 300);
  assert.deepEqual(await state(page), frozen, 'score, distance and player are unchanged while paused');
  assert.equal(await page.locator('#pause-screen').isVisible(), true);
  await page.locator('#resume').click();
  await step(page, 10);
  assert.ok((await state(page)).distance > frozen.distance, 'explicit Resume restarts simulation');
});

test('Dino 3D focus loss clears held controls and needs explicit resume', async t => {
  const page = await game(t);
  await page.locator('#play').click();
  await focusSurface(page);
  await page.keyboard.down('ArrowDown');
  await step(page);
  assert.equal((await state(page)).player.duck, true);
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await page.keyboard.up('ArrowDown');
  const frozen = await state(page);
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await step(page, 120);
  assert.equal((await state(page)).mode, 'paused');
  assert.deepEqual(await state(page), frozen);
  await page.locator('#resume').click();
  await step(page);
  assert.equal((await state(page)).player.duck, false, 'resume does not retain a released duck key');
});

test('Dino 3D shortcuts start, pause and resume without changing the round count', async t => {
  const page = await game(t);
  await focusSurface(page);
  await key(page, 'Space');
  assert.equal((await state(page)).mode, 'playing');
  await key(page, 'KeyP');
  assert.equal((await state(page)).mode, 'paused');
  await key(page, 'Escape');
  assert.equal((await state(page)).mode, 'playing');
  assert.equal(await page.evaluate(() => dinoProbe.rounds.length), 1);
  await crash(page);
  await key(page, 'KeyR');
  assert.equal((await state(page)).mode, 'playing');
  assert.equal(await page.evaluate(() => dinoProbe.rounds.length), 2);
});

test('Dino 3D pauses on a hidden tab and stays paused when it is shown again', async t => {
  const page = await game(t);
  await page.locator('#play').click();
  await step(page, 20);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const frozen = await state(page);
  assert.equal(frozen.mode, 'paused');
  await step(page, 120);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await step(page, 120);
  assert.deepEqual(await state(page), frozen);
  await page.locator('#resume').click();
  await step(page, 5);
  assert.ok((await state(page)).distance > frozen.distance);
});

test('Dino 3D redraws a paused scene once and restores a lost WebGL context without auto-resuming', async t => {
  const page = await game(t);
  await page.locator('#play').click();
  await step(page, 20);
  await page.locator('#pause-button').click();
  const frozen = await state(page);
  assert.equal(await page.evaluate(() => dinoProbe.count(30)), 1, 'pause draws the frozen scene once');
  assert.equal(await page.evaluate(() => dinoProbe.count(120)), 0, 'settled pause does not repaint');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => dinoProbe.count(30)), 1, 'resize draws once');
  assert.equal(await page.evaluate(() => dinoProbe.count(30)), 0);

  await page.evaluate(() => new Promise(resolve => {
    const canvas = document.getElementById('scene');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    window.dinoLostContext = gl.getExtension('WEBGL_lose_context');
    canvas.addEventListener('webglcontextlost', () => setTimeout(resolve, 0), { once: true });
    dinoLostContext.loseContext();
  }));
  assert.equal(await page.locator('#context-notice').isVisible(), true);
  assert.equal(await page.evaluate(() => dinoProbe.count(30)), 0, 'lost context does not draw');
  assert.deepEqual(await state(page), frozen);
  await page.evaluate(() => new Promise(resolve => {
    document.getElementById('scene').addEventListener('webglcontextrestored', () => setTimeout(resolve, 0), { once: true });
    dinoLostContext.restoreContext();
  }));
  assert.equal(await page.locator('#context-notice').isVisible(), false);
  assert.equal(await page.evaluate(() => dinoProbe.count(30)), 1, 'restoration draws once');
  assert.equal(await page.evaluate(() => dinoProbe.count(30)), 0);
  assert.deepEqual(await state(page), frozen, 'restoring graphics never resumes gameplay');
  await page.locator('#resume').click();
  assert.equal(await page.evaluate(() => dinoProbe.count(10)), 10);
  assert.ok((await state(page)).distance > frozen.distance);
});

test('Dino 3D touch cancellation releases ducking and permits the next jump', async t => {
  const page = await game(t, { touch: true });
  const input = await page.context().newCDPSession(page);
  await page.locator('#play').click();
  const touch = async (type, y) => input.send('Input.dispatchTouchEvent', {
    type, touchPoints: y === undefined ? [] : [{ x: 550, y, id: 1 }]
  });
  await touch('touchStart', 440);
  await step(page);
  assert.equal((await state(page)).player.duck, true, 'lower screen touch crouches');
  await touch('touchCancel');
  await step(page);
  assert.equal((await state(page)).player.duck, false, 'pointercancel releases crouching');
  await touch('touchStart', 170);
  await step(page, 8);
  assert.ok((await state(page)).player.y > 0, 'upper touch starts a new jump after cancellation');
  await touch('touchCancel');
  await step(page, 70);
  assert.equal((await state(page)).player.y, 0);
  assert.equal(await page.evaluate(() => Dino3DGame.inputJumps), 1, 'cancelled touch cannot keep auto-jumping');
});

test('Dino 3D collision records one result, persists best score, and retry creates one new round', async t => {
  const page = await game(t);
  await page.locator('#play').click();
  await crash(page);
  const first = await page.evaluate(() => ({ score: Math.floor(Dino3DGame.state.score), best: Dino3DGame.best,
    saved: JSON.parse(localStorage.getItem('sg:dino-3d:best')), rounds: dinoProbe.rounds, ends: dinoProbe.ends }));
  assert.ok(first.score > 0);
  assert.equal(first.best, first.score);
  assert.equal(first.saved, first.score);
  assert.deepEqual(first.rounds, [['endless']]);
  assert.deepEqual(first.ends, [['end', first.score]]);
  await step(page, 300);
  assert.equal(await page.evaluate(() => dinoProbe.ends.length), 1, 'crash cannot report again');
  await page.locator('#retry').click();
  assert.equal((await state(page)).mode, 'playing');
  assert.equal((await state(page)).score, 0);
  assert.equal(await page.evaluate(() => dinoProbe.rounds.length), 2);
  await page.reload();
  await page.waitForFunction(() => window.Dino3DGame && dinoProbe.ready === 1, null, { polling: 40 });
  assert.equal(await page.evaluate(() => Dino3DGame.best), first.best, 'best survives reload');
});

test('Dino 3D focused buttons keep native keyboard activation without duplicate actions', async t => {
  const page = await game(t);
  await page.locator('.sg-mute').focus();
  const muted = await page.evaluate(() => Kit.audio.muted);
  await key(page, 'Space');
  assert.equal(await page.evaluate(() => Kit.audio.muted), !muted);
  assert.equal((await state(page)).mode, 'ready', 'mute must not start the game');
  await page.locator('#play').focus();
  await key(page, 'Enter');
  assert.equal((await state(page)).mode, 'playing');
  assert.equal(await page.evaluate(() => dinoProbe.rounds.length), 1);
  assert.equal(await page.evaluate(() => Dino3DGame.inputJumps), 0, 'Play activation is not also a jump');
  await page.locator('#pause-button').focus();
  await key(page, 'Space');
  assert.equal((await state(page)).mode, 'paused');
  await page.locator('#resume').focus();
  await key(page, 'Enter');
  assert.equal((await state(page)).mode, 'playing');
  assert.equal(await page.evaluate(() => dinoProbe.rounds.length), 1, 'Resume is not a new round');
  await page.locator('#pause-button').click();
  await page.locator('#restart').focus();
  await key(page, 'Space');
  assert.equal((await state(page)).mode, 'playing');
  assert.equal(await page.evaluate(() => dinoProbe.rounds.length), 2, 'Restart activates once');
});

test('Dino 3D failed best-score writes preserve the old save and can be retried', async t => {
  const page = await game(t, { saved: '0' });
  await page.evaluate(() => { dinoProbe.failSave = true; });
  await page.locator('#play').click();
  await crash(page);
  const best = await page.evaluate(() => Dino3DGame.best);
  assert.ok(best > 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dino-3d:best')), '0');
  const status = page.locator('.sg-save-status');
  assert.equal(await status.isVisible(), true);
  assert.equal(await status.getAttribute('data-state'), 'failed');
  await page.evaluate(() => { dinoProbe.failSave = false; });
  await status.locator('button').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:dino-3d:best'))), best);
  assert.equal(await status.getAttribute('data-state'), 'saved');
});

for (const saved of ['broken', '-4', '{"score":500}', 'null']) {
  test(`Dino 3D ignores invalid best-score storage (${saved})`, async t => {
    const page = await game(t, { saved });
    assert.equal(await page.evaluate(() => Dino3DGame.best), 0);
    await page.locator('#play').click();
    await step(page, 10);
    assert.equal((await state(page)).mode, 'playing');
  });
}

test('Dino 3D still plays when classroom storage is disabled', async t => {
  const page = await game(t, { deniedStorage: true });
  await page.locator('#play').click();
  await crash(page);
  assert.equal(await page.locator('#over-screen').isVisible(), true);
  await page.locator('#retry').click();
  assert.equal((await state(page)).mode, 'playing');
});

test('Dino 3D keeps its controls within the frame at classroom and narrow sizes', async t => {
  const page = await game(t);
  for (const viewport of [{ width: 1100, height: 620 }, { width: 1920, height: 1080 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await step(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true, 'no page scrollbars');
    const box = await page.locator('#play').boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, 'Play stays reachable');
  }
});

test('Dino 3D does not report ready when WebGL is unavailable', async t => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind) {
      return /^webgl|^experimental-webgl/.test(kind) ? null : getContext.apply(this, arguments);
    };
    let kit;
    window.dinoFailureProbe = { ready: 0, failed: 0 };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      const ready = kit.ready, fail = kit.fail;
      kit.ready = (...args) => { dinoFailureProbe.ready++; return ready.apply(kit, args); };
      kit.fail = (...args) => { dinoFailureProbe.failed++; return fail.apply(kit, args); };
    } });
  });
  await page.goto(`${server.origin}/games/dino-3d/`);
  await page.locator('#error-screen').waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => dinoFailureProbe), { ready: 0, failed: 1 });
  assert.equal(await page.locator('#ready-screen').isVisible(), false);
  assert.deepEqual(errors, [], 'the startup failure is handled');
});

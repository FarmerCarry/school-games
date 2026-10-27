import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
// A stand-in portal: the game in an iframe, the preferences it is sent, and every
// message it posts back (window.got).
const EMBED = '/embed/dino-3d.html';
const HOST = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>host</title></head><body style="margin:0">
<iframe id="game" src="/games/dino-3d/" style="width:1100px;height:620px;border:0"></iframe>
<script>
window.got = [];
addEventListener('message', function (e) { if (e.source === document.getElementById('game').contentWindow) got.push(e.data); });
window.prefs = function (p) { document.getElementById('game').contentWindow.postMessage(Object.assign({ type: 'sg:preferences' }, p), location.origin); };
</script></body></html>`;
before(async () => {
  server = await startTestServer(root, { pages: { [EMBED]: HOST } });
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

// The fixture advances the real Kit update callback at 60 Hz. It never moves
// obstacles, forces a crash, or bypasses collisions; inputs use player controls.
// `embed: {band, telemetry}` opens the game inside the stand-in portal, sends it those
// preferences and returns the game's frame (the host page is frame.page()).
async function game(t, { manual = true, saved, deniedStorage = false, touch = false, embed = null } = {}) {
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
    const probe = window.dinoProbe = { rounds: [], ends: [], writes: [], failSave: false, ready: 0, paints: 0 };
    probe.step = count => {
      for (let i = 0; i < count; i++) update(1 / 60);
      if (render) render(0);
    };
    probe.tick = () => update(1 / 60); // one update without drawing
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
      if (key.startsWith('sg:dino-3d:')) probe.writes.push(key);
      if (deniedStorage || (probe.failSave && key.startsWith('sg:dino-3d:'))) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    Storage.prototype.getItem = function () {
      if (deniedStorage) throw new DOMException('Storage fixture', 'SecurityError');
      return read.apply(this, arguments);
    };
  }, { manual, saved, deniedStorage });
  if (embed) {
    await page.goto(server.origin + EMBED);
    const frame = page.frames().find(f => f.url().includes('/games/dino-3d/'));
    await frame.waitForFunction(() => !!window.Dino3DGame && window.dinoProbe.ready === 1, null, { polling: 40 });
    await frame.evaluate(() => document.fonts.ready);
    await prefs(frame, embed);
    return frame;
  }
  await page.goto(`${server.origin}/games/dino-3d/`);
  await page.waitForFunction(() => !!window.Dino3DGame && window.dinoProbe.ready === 1, null, { polling: 40 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
// The stand-in portal sends new preferences; they are applied once a listener added
// after Kit's own has seen them.
async function prefs(frame, p) {
  await frame.evaluate(() => {
    window.prefsSeen = new Promise(resolve => addEventListener('message', function seen(e) {
      if (e.data && e.data.type === 'sg:preferences') { removeEventListener('message', seen); resolve(); }
    }));
  });
  await frame.page().evaluate(p => window.prefs(p), p);
  await frame.evaluate(() => window.prefsSeen);
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


test('Dino course entry preserves leading zeros, accepts Arabic digits and rejects incomplete codes', async t => {
  const page = await game(t);
  const input = page.locator('#course-code');
  for (const invalid of ['12', 'ab42']) {
    await input.fill(invalid);
    await page.keyboard.press('Enter');
    assert.equal((await state(page)).mode, 'ready');
    assert.equal(await page.locator('#course-error').isVisible(), true);
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
  }
  assert.equal(await page.evaluate(() => dinoProbe.rounds.length), 0, 'invalid entry never creates a round');
  const muted = await page.evaluate(() => Kit.audio.muted);
  await input.fill('');
  await page.keyboard.type('mp');
  assert.equal(await input.inputValue(), 'mp');
  assert.equal(await page.evaluate(() => Kit.audio.muted), muted, 'typing into the code cannot mute');
  assert.equal((await state(page)).mode, 'ready', 'typing P cannot pause or start');
  await input.fill('٠٠٤٢');
  assert.equal(await input.inputValue(), '0042');
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).mode, 'playing');
  assert.equal(await page.evaluate(() => Dino3DGame.state.seed), 43);
  assert.equal(await page.locator('#active-course').textContent(), '0042');
  assert.equal(await page.evaluate(() => Dino3DGame.inputJumps), 0, 'form Enter starts without an extra jump');
});

test('Dino retry and R repeat the selected course while new-course controls choose a different one', async t => {
  const page = await game(t);
  await page.locator('#course-code').fill('0000');
  await page.locator('#play').click();
  const initial = await page.evaluate(() => JSON.stringify(Dino3DGame.state));
  assert.equal(await page.evaluate(() => Dino3DGame.state.seed), 1);
  await crash(page);
  const crashed = await page.evaluate(() => JSON.stringify(Dino3DGame.state));
  await page.locator('#retry').click();
  assert.equal(await page.evaluate(() => JSON.stringify(Dino3DGame.state)), initial);
  await crash(page);
  assert.equal(await page.evaluate(() => JSON.stringify(Dino3DGame.state)), crashed, 'the same untouched attempt reaches the same collision');
  await page.locator('#new-course-over').focus();
  await page.keyboard.press('KeyR');
  assert.equal(await page.evaluate(() => JSON.stringify(Dino3DGame.state)), initial, 'R retries even after tabbing to a result button');
  await step(page, 30);
  await page.locator('#pause-button').click();
  await page.locator('#new-course-paused').focus();
  await page.keyboard.press('KeyR');
  assert.equal(await page.evaluate(() => JSON.stringify(Dino3DGame.state)), initial, 'paused R retries the same course');
  await page.locator('#pause-button').click();
  await page.locator('#restart').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => JSON.stringify(Dino3DGame.state)), initial);
  await page.locator('#pause-button').click();
  await page.locator('#new-course-paused').click();
  const next = await page.locator('#active-course').textContent();
  assert.notEqual(next, '0000');
  assert.equal(await page.evaluate(() => Dino3DGame.state.seed), Number(next) + 1);
  await crash(page);
  await page.locator('#new-course-over').click();
  assert.notEqual(await page.locator('#active-course').textContent(), next);
  await page.locator('#pause-button').click();
  await page.locator('#pause-menu').click();
  const readyCode = await page.locator('#course-code').inputValue();
  await page.locator('#new-course').click();
  assert.equal((await state(page)).mode, 'ready', 'choosing on the ready screen does not start play');
  assert.notEqual(await page.locator('#course-code').inputValue(), readyCode);
});

test('Dino shared codes replay independently of graphics quality and decorative random calls', async t => {
  const traces = [];
  for (const low of [false, true]) {
    const page = await game(t);
    if (low) await page.locator('#quality').click();
    await page.evaluate(() => { for (let i = 0; i < 500; i++) Math.random(); });
    await page.locator('#course-code').fill('2026');
    await page.locator('#play').click();
    await step(page, 150);
    const before = await page.evaluate(() => JSON.stringify(Dino3DGame.state));
    await crash(page);
    traces.push([before, await page.evaluate(() => JSON.stringify(Dino3DGame.state))]);
  }
  assert.deepEqual(traces[0], traces[1], 'same course and controls produce the same approach and collision in both render modes');
});

test('Dino course selection and retries preserve best/quality without per-frame storage writes', async t => {
  const page = await game(t, { saved: '500' });
  await page.locator('#quality').click();
  await page.locator('#course-code').fill('9999');
  await page.locator('#play').click();
  await page.evaluate(() => { dinoProbe.writes.length = 0; });
  await step(page, 100);
  await page.locator('#pause-button').click();
  await step(page, 120);
  await page.locator('#resume').click();
  await step(page, 20);
  await crash(page);
  await page.locator('#retry').click();
  await crash(page);
  await page.locator('#new-course-over').click();
  assert.deepEqual(await page.evaluate(() => dinoProbe.writes), [], 'playing, selecting, pausing and replaying do not write course state');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dino-3d:best')), '500');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dino-3d:quality')), '"low"');
  await page.reload();
  await page.waitForFunction(() => window.Dino3DGame && dinoProbe.ready === 1, null, { polling: 40 });
  assert.equal(await page.locator('#menu-best').textContent(), '500');
  assert.equal(await page.locator('#quality').getAttribute('aria-pressed'), 'true');
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
  // Input.dispatchTouchEvent resolves in the browser process before the renderer
  // delivers pointerdown/pointercancel. Stepping inside one evaluate can therefore
  // run while the previous gesture is still held. A held jump that lasts the 8
  // setup frames plus these 70 frames lands and takes off again, at y just above
  // 2.8 with a second jump. Wait until the page has handled the event first.
  const touch = async (type, y) => {
    const applied = type === 'touchCancel' ? 'pointercancel' : 'pointerdown';
    await page.evaluate(applied => {
      dinoProbe.touchApplied = new Promise(resolve => {
        document.getElementById('scene').addEventListener(applied, () => resolve(), { once: true });
      });
    }, applied);
    await input.send('Input.dispatchTouchEvent', {
      type, touchPoints: y === undefined ? [] : [{ x: 550, y, id: 1 }]
    });
    await page.evaluate(() => dinoProbe.touchApplied);
  };
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
  for (const viewport of [{ width: 1100, height: 620 }, { width: 1920, height: 1080 }, { width: 800, height: 450 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await step(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true, 'no page scrollbars');
    const withinFrame = async ids => {
      for (const id of ids) {
        const box = await page.locator('#' + id).boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${id} stays reachable at ${viewport.width}×${viewport.height}`);
      }
    };
    await withinFrame(['play', 'course-code', 'new-course', 'menu-best']);
    await page.locator('#course-code').fill('12');
    await page.keyboard.press('Enter');
    await withinFrame(['play', 'course-code', 'new-course', 'course-error', 'menu-best']);
    await page.locator('#course-code').fill('0042');
    await page.locator('#play').click();
    await page.locator('#pause-button').click();
    await withinFrame(['resume', 'restart', 'new-course-paused', 'pause-menu']);
    assert.equal(await page.locator('#course-tag').evaluate(tag => {
      const r = tag.getBoundingClientRect();
      return tag.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), true, 'course code stays above the pause veil');
    await page.locator('#resume').click();
    await crash(page);
    await withinFrame(['retry', 'new-course-over', 'menu', 'course-tag']);
    await page.locator('#menu').click();
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

test('Dino 3D keeps the result on screen when a jump is pressed just after the crash', async t => {
  const page = await game(t);
  await page.locator('#play').click();
  await crash(page);
  await key(page, 'Space');
  await page.mouse.click(300, 300);
  assert.equal((await state(page)).mode, 'over', 'a jump pressed at the crash does not restart at once');
  await page.waitForTimeout(650);
  await key(page, 'Space');
  assert.equal((await state(page)).mode, 'playing', 'Space restarts once the result has been seen');
});

test('Dino 3D keeps the best score of a run left from pause and saves a crashed run once', async t => {
  const page = await game(t, { saved: '0' });
  const best = () => page.evaluate(() => ({ best: Dino3DGame.best, saved: JSON.parse(localStorage.getItem('sg:dino-3d:best')) }));
  await page.locator('#play').click();
  // Each run is longer than the last but ends before the first obstacle (189 frames).
  for (const [exit, frames] of [['#pause-menu', 40], ['#restart', 100], ['#new-course-paused', 160]]) {
    await step(page, frames);
    const score = (await state(page)).score;
    assert.ok(score > (await best()).best, `the run beats the best before ${exit} (${score})`);
    if (exit === '#pause-menu') await page.evaluate(() => dispatchEvent(new Event('blur')));
    else await page.locator('#pause-button').click();
    assert.equal((await state(page)).mode, 'paused');
    await page.locator(exit).click();
    assert.deepEqual(await best(), { best: score, saved: score }, `${exit} keeps the paused run's score`);
    if (exit === '#pause-menu') {
      assert.equal(await page.locator('#menu-best').textContent(), String(score));
      await page.locator('#play').click();
    }
  }
  await crash(page);
  const writes = await page.evaluate(() => dinoProbe.writes.length);
  await page.locator('#menu').click();
  assert.equal(await page.evaluate(() => dinoProbe.writes.length), writes, 'leaving a crashed run does not save it again');
});

/* ------------------------------------------------------- difficulty tiers */
const telemetry = page => page.evaluate(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev));
const course = frame => frame.evaluate(() => [Dino3DGame.mode, Dino3DGame.tier, Dino3DGame.shared, Dino3DGame.state.seed]);
const levels = frame => frame.evaluate(() => JSON.parse(localStorage.getItem('sg:dino-3d:dda')));
const sum = list => list.reduce((a, b) => a + b, 0);
// In the page: jump with real (synthetic) Space presses, like the engine's reaction
// policy, until the score passes the tier's par; then stop, so the next obstacle ends it.
function playPastPar() {
  const g = Dino3DGame, C = Dino3D.config, par = Dino3D.tier(g.tier).par;
  const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code }));
  let held = false;
  for (let i = 0; i < 60 * 120 && g.mode === 'playing' && g.state.score < par; i++) {
    const s = g.state, p = s.player, next = s.obstacles.find(o => o.z < o.depth / 2 + C.playerHalfDepth);
    const until = next ? -next.z / s.speed : 9;
    const want = p.y > 0 ? !(p.vy < 0 && p.y < 0.8) : !!next && until < 0.38;
    if (want !== held) { key(want ? 'keydown' : 'keyup', 'Space'); held = want; }
    dinoProbe.tick();
  }
  if (held) key('keyup', 'Space');
  const score = g.state.score;
  dinoProbe.finish();
  return score;
}

test('Dino surprise courses start at the age band tier, while a course code is tier 3 for everyone and never moves it', async t => {
  const frame = await game(t, { embed: { band: '6-7', telemetry: true } }), page = frame.page();
  assert.equal(await frame.locator('#course-code').inputValue(), '', 'an empty code field is a surprise course');
  await frame.locator('#play').click();
  const surprise = await course(frame);
  assert.deepEqual(surprise.slice(0, 3), ['playing', 1, false], 'a 6-7 guest starts at tier 1');
  assert.equal(await frame.locator('#course-tag').isVisible(), false, 'a surprise course shows no code to share');
  await crash(frame);
  const afterSurprise = await levels(frame);
  assert.equal(afterSurprise['_6-7'].main[1], 1, 'the surprise run counts for this guest band');
  await frame.locator('#retry').click();
  assert.deepEqual(await course(frame), surprise, 'Retry replays the same surprise course');
  await frame.locator('#pause-button').click();
  await frame.locator('#pause-menu').click();
  assert.equal(await frame.locator('#course-code').inputValue(), '');
  // A typed code: tier 3 (the original balance), shown to share, and never counted.
  await frame.locator('#course-code').fill('0042');
  await frame.locator('#play').click();
  assert.deepEqual(await course(frame), ['playing', 3, true, 43]);
  assert.equal(await frame.locator('#course-tag').isVisible(), true);
  assert.equal(await frame.locator('#active-course').textContent(), '0042');
  const shared = await frame.evaluate(() => JSON.stringify(Dino3DGame.state));
  await crash(frame);
  await frame.locator('#retry').click();
  assert.equal(await frame.evaluate(() => JSON.stringify(Dino3DGame.state)), shared, 'Retry replays the code exactly');
  await crash(frame);
  // A 10-11 player who types the same code gets the very same course.
  await prefs(frame, { band: '10-11', telemetry: true });
  await frame.locator('#menu').click();
  assert.equal(await frame.locator('#course-code').inputValue(), '0042', 'the code stays on the start screen');
  await frame.locator('#play').click();
  assert.equal(await frame.evaluate(() => JSON.stringify(Dino3DGame.state)), shared, 'the same code is the same course at any age');
  await crash(frame);
  assert.deepEqual(await levels(frame), afterSurprise, 'course-code runs leave every difficulty level alone');
  // From the result, a new course is a surprise course at this player's own tier.
  await frame.locator('#new-course-over').click();
  const next = await course(frame);
  assert.deepEqual(next.slice(0, 3), ['playing', 3, false]);
  assert.notEqual(next[3], 43);
  assert.equal(await frame.locator('#course-tag').isVisible(), false);
  // Telemetry reports the tier each round really played: a code is tier 3 even for a 6-7 guest.
  await page.waitForFunction(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev).filter(e => e[0] === 'rs').length >= 6, null, { polling: 50 });
  assert.deepEqual((await telemetry(page)).filter(e => e[0] === 'rs').map(e => e.slice(1)),
    [['endless', 1], ['endless', 1], ['endless', 3], ['endless', 3], ['endless', 3], ['endless', 3]]);
});

test('Dino surprise-course results move the tier, and obstacles cleared, crashes and reactions reach telemetry', async t => {
  const frame = await game(t, { embed: { band: '10-11', telemetry: true } }), page = frame.page();
  await frame.locator('#play').click();
  const seen = [await frame.evaluate(() => Dino3DGame.tier)];
  for (let i = 0; i < 2; i++) {
    await crash(frame);
    await frame.locator('#retry').click();
    seen.push(await frame.evaluate(() => Dino3DGame.tier));
  }
  assert.deepEqual(seen, [3, 3, 2], 'two crashes at the first cactus ease a 10-11 guest down');
  await frame.locator('#pause-button').click();
  await frame.locator('#pause-menu').click();
  // A 6-7 guest (their own level) who plays past tier 1's par twice is lifted to tier 2.
  await prefs(frame, { band: '6-7', telemetry: true });
  await frame.locator('#play').click();
  const scores = [];
  for (let run = 0; run < 2; run++) {
    if (run) await frame.locator('#retry').click();
    assert.equal(await frame.evaluate(() => Dino3DGame.tier), 1);
    scores.push(await frame.evaluate(playPastPar));
    assert.equal(await frame.evaluate(() => Dino3DGame.mode), 'over');
  }
  assert.ok(scores.every(score => score >= 250), `both runs passed the par (${scores})`);
  await frame.locator('#retry').click();
  assert.equal(await frame.evaluate(() => Dino3DGame.tier), 2);
  const saved = await levels(frame);
  assert.deepEqual(saved['_6-7'].main, [0.211, 2]);
  assert.equal(saved['_10-11'].main[1], 2);
  assert.ok(saved['_10-11'].main[0] < 0.4, `10-11 level ${saved['_10-11'].main[0]}`);
  // Round ends: [code, id, ms, score, tier, hits, misses, reaction times]; the run left
  // through the pause menu is a quit ('q'), not an end.
  await page.waitForFunction(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev).filter(e => e[0] === 're' && e[1] === 'e').length >= 4, null, { polling: 50 });
  const ends = (await telemetry(page)).filter(e => e[0] === 're' && e[1] === 'e');
  for (const e of ends.slice(0, 2)) assert.deepEqual([e[1], e[2], e[5], e[6], e[7], sum(e[8])], ['e', 'endless', 3, 0, 1, 0], 'a crash at the first cactus');
  for (const [i, e] of ends.slice(2, 4).entries()) {
    assert.deepEqual([e[1], e[5], e[7]], ['e', 1, 1], 'tier 1 and the one crash that ended it');
    assert.ok(e[4] >= scores[i] && e[6] >= 8, `obstacles cleared are hits (${e[6]})`);
    assert.ok(sum(e[8]) >= 8, `jumps after an obstacle came close are reaction times (${e[8]})`);
  }
});

test('Dino: a cleared course code gives a new surprise, whose retry promises no same course, and high birds are no cue', async t => {
  const frame = await game(t, { embed: { band: '10-11', telemetry: true } }), page = frame.page();
  const retry = () => frame.locator('#retry').textContent();
  await frame.locator('#course-code').fill('0042');
  await frame.locator('#play').click();
  await crash(frame);
  assert.equal(await retry(), 'أعد المسار نفسه', 'a shared code replays exactly');
  await frame.locator('#menu').click();
  assert.equal(await frame.locator('#course-code').inputValue(), '0042');
  // Clearing the code is asking for a surprise: not course 0042 again at this tier.
  await frame.locator('#course-code').fill('');
  await frame.locator('#play').click();
  const surprise = await course(frame);
  assert.deepEqual(surprise.slice(0, 3), ['playing', 3, false]);
  assert.notEqual(surprise[3], 43, 'a new course');
  // A high bird the dinosaur runs under asks for no reaction: a press then times nothing.
  await frame.evaluate(() => {
    const s = Dino3DGame.state;
    s.obstacles = [{ id: 500, type: 'bird', variant: 2, width: 1.65, depth: 1.35, height: 0.62, bottom: 3.4, z: -8 }];
    for (let i = 0; i < 6; i++) dinoProbe.tick();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    dinoProbe.tick();
    dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown' }));
  });
  await crash(frame);
  assert.equal(await retry(), 'العب مرة أخرى', 'the next try may be at another tier');
  await page.waitForFunction(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev).filter(e => e[0] === 're').length >= 2, null, { polling: 50 });
  const end = (await telemetry(page)).filter(e => e[0] === 're')[1];
  assert.deepEqual([end[5], sum(end[8])], [3, 0], `no reaction time for the high bird (${end[8]})`);
});

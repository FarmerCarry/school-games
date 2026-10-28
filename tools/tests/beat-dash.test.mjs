import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

async function game(t, { loop = false } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'game should not throw'); });
  // The test drives __game.ff() itself, so the real loop must not advance play.
  await page.addInitScript(loop => {
    if (!loop) { window.requestAnimationFrame = () => 0; return; }
    // Or capture the loop, so the test steps update + render itself and counts scene paints.
    let kit, update, render;
    const runtime = window.runtime = { paints: 0 };
    runtime.step = n => { for (let i = 0; i < n; i++) { update(1 / 60); render(0.5); } };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    // A read-back can move an accelerated canvas to the CPU rasterizer mid-test; start it there
    // so two draws of the same scene compare equal pixel for pixel.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      return getContext.call(this, type, type === '2d' ? { ...opts, willReadFrequently: true } : opts);
    };
    // every scene paint starts with the full-canvas background gradient
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && this.fillStyle instanceof CanvasGradient && !x && !y && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
  }, loop);
  await page.goto(server.origin + '/games/beat-dash/index.html');
  await page.waitForFunction(() => window.__game && window.Kit);
  return page;
}

test('practice auto-checkpoints never respawn the cube just before a spike', async t => {
  const page = await game(t);
  // With no input the cube dies at the first spike of level 1 (x 25.5). A checkpoint
  // placed 0.3-0.5 s before it used to trap the player in instant re-deaths.
  const state = await page.evaluate(() => { __game.start(0, true); return __game.ff(700); });
  assert.equal(state.practice, true);
  assert.equal(state.cps, 0, 'no auto-checkpoint in front of the first spike');
  assert.ok(state.attempt <= 5, `only full-length tries (attempt ${state.attempt})`);
});

test('failed saves stay visible until a retry writes every key', async t => {
  const page = await game(t);
  const failed = await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('quota'); };
    __game.start(0, false);
    __game.ff(2);
    const panel = document.querySelector('.sg-save-status');
    return { hidden: panel.hidden, state: panel.dataset.state, att: localStorage.getItem('sg:beat-dash:att') };
  });
  assert.deepEqual(failed, { hidden: false, state: 'failed', att: null });
  const retried = await page.evaluate(() => {
    Storage.prototype.setItem = window.realSetItem;
    document.querySelector('.sg-save-status button').click();
    const panel = document.querySelector('.sg-save-status'), store = Kit.store('beat-dash');
    return { state: panel.dataset.state, att: store.get('att', null), last: store.get('last', null), attempts: store.get('total', {}).attempts };
  });
  assert.deepEqual(retried, { state: 'saved', att: { 'neon-steps': 1 }, last: 0, attempts: 1 });
});

test('a paused run is drawn once with its effects held still, then only on resize, restore or motion change', async t => {
  const page = await game(t, { loop: true });
  await page.evaluate(() => document.fonts.ready);
  const paused = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    const pixels = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const paintsIn = n => { runtime.paints = 0; runtime.step(n); return runtime.paints; };
    __game.start(0, false);
    // With no input the cube dies at the first spike; pause while its burst, ring, flash and shake are live.
    for (let n = 0; n < 2000 && !__game.state.dead; n++) __game.ff(1);
    runtime.step(3);
    document.getElementById('b-pause').click();
    const first = paintsIn(60), picture = pixels(), idle = paintsIn(120);
    canvas.width = canvas.width; // a restored 2D context has lost its pixels and drawing state
    canvas.dispatchEvent(new Event('contextrestored'));
    // the redrawn frame is the same picture: nothing moved during the 2 paused seconds
    const restored = paintsIn(30), same = pixels().every((v, i) => v === picture[i]), settled = paintsIn(30);
    Kit.motion.setPreference('reduce');
    const motion = paintsIn(30);
    return { first, idle, restored, same, settled, motion, attempt: __game.state.attempt };
  });
  assert.deepEqual(paused, { first: 1, idle: 0, restored: 1, same: true, settled: 0, motion: 1, attempt: 1 });
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { runtime.paints = 0; runtime.step(30); return runtime.paints; }), 1, 'a resize redraws the paused frame once');
  const resumed = await page.evaluate(() => {
    document.getElementById('b-resume').click();
    runtime.paints = 0; runtime.step(40);
    return { paints: runtime.paints, attempt: __game.state.attempt, paused: __game.state.paused };
  });
  assert.deepEqual(resumed, { paints: 40, attempt: 2, paused: false }, 'resume draws every frame and the next try starts');
});

test('there is no music: menus and pause stay silent, and each jump plays a note of the level\'s key', async t => {
  const page = await game(t);
  const result = await page.evaluate(() => {
    const calls = [];
    for (const kind of ['tone', 'noise']) {
      const play = Kit.audio[kind];
      Kit.audio[kind] = o => { calls.push({ kind, ...o }); return play.call(Kit.audio, o); };
    }
    const quiet = {};
    __game.ff(240); quiet.title = calls.length;
    document.getElementById('b-play').click(); calls.length = 0; // the button's own click sound
    __game.ff(240); quiet.select = calls.length;
    // jump on the first eight beats of level 1 (135 bpm: a beat every 26.7 ticks)
    let inputs = '';
    for (let tick = 0; tick < 240; tick++) inputs += [0, 1, 2, 3, 4, 5, 6, 7].some(b => Math.abs(tick - Math.round(b * 3600 / 135)) < 2) ? '1' : '0';
    __game.autoplay(0, inputs);
    calls.length = 0;
    __game.ff(180);
    const jumps = calls.filter(c => c.kind === 'tone' && c.type === 'sine' && c.dur === 0.14).map(c => c.freq);
    document.getElementById('b-pause').click(); calls.length = 0;
    __game.ff(240); quiet.pause = calls.length;
    const song = BD.makeSong(BD_LEVELS[0].song, BD_LEVELS[0].bpm);
    return { quiet, jumps, root: song.root, scale: song.scale, music: typeof BD.Music, hook: 'music' in __game };
  });
  assert.deepEqual(result.quiet, { title: 0, select: 0, pause: 0 }, 'nothing sounds unless the player does something');
  assert.equal(result.music, 'undefined');
  assert.equal(result.hook, false);
  assert.ok(result.jumps.length >= 3, `the cube jumped (${result.jumps.length} jump notes)`);
  const notes = result.jumps.map(f => 69 + 12 * Math.log2(f / 440));
  for (const m of notes) {
    assert.ok(Math.abs(m - Math.round(m)) < 1e-6, `a jump note is on the semitone grid (${m})`);
    const step = ((Math.round(m) - result.root) % 12 + 12) % 12;
    assert.ok(result.scale.includes(step), `a jump note is in the level's scale (${m})`);
  }
  assert.ok(new Set(notes.map(Math.round)).size >= 2, `jumps on different beats play different notes (${notes})`);
});

test('a win plays a short fanfare, then the result panel is silent while the fireworks go on', async t => {
  const page = await game(t);
  const result = await page.evaluate(() => {
    const calls = [];
    for (const kind of ['tone', 'noise']) {
      const play = Kit.audio[kind];
      Kit.audio[kind] = o => { calls.push(kind); return play.call(Kit.audio, o); };
    }
    __game.start(0, false);
    __game.skipTo(99.6);
    for (let n = 0; n < 120 && !__game.state.won; n++) __game.ff(1);
    const won = __game.state.won;
    __game.ff(125); // a little over 2 s of fanfare and fireworks
    const fanfare = calls.length;
    calls.length = 0;
    __game.ff(240); // the result panel, with fireworks still bursting
    return { won, fanfare, after: calls.length, panel: !document.getElementById('scr-win').hidden };
  });
  assert.equal(result.won, true, 'the level was finished');
  assert.ok(result.fanfare > 0, 'the win is celebrated with sound');
  assert.equal(result.panel, true, 'the result panel is up');
  assert.equal(result.after, 0, 'nothing sounds on the result panel after the fanfare');
});

test('calm mode keeps the beat as colour only: nothing pulses, the glows still brighten on the beat', async t => {
  const page = await game(t, { loop: true });
  const beats = await page.evaluate(() => {
    const sample = n => { const out = []; for (let i = 0; i < n; i++) { runtime.step(1); out.push(__game.beat); } return out; };
    __game.start(0, false);
    const lively = sample(60);
    Kit.motion.setPreference('reduce');
    const calm = sample(60);
    return { lively, calm };
  });
  const range = (list, key) => [Math.min(...list.map(b => b[key])), Math.max(...list.map(b => b[key]))];
  assert.ok(beats.lively.every(b => b.pulse === b.tint), 'with motion the pulse and the glow move together');
  assert.ok(range(beats.lively, 'pulse')[1] > 0.4, 'with motion things pulse on the beat');
  assert.deepEqual(range(beats.calm, 'pulse'), [0, 0], 'calm mode moves nothing on the beat');
  assert.ok(beats.calm.every(b => b.beat === 0), 'calm mode holds the beat-driven bars still');
  const [low, high] = range(beats.calm, 'tint');
  assert.ok(low < 0.2 && high > 0.4, `calm mode still brightens the glows on the beat (${low}..${high})`);
});

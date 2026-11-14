import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { BD, beatPlayer, level1 } from './beat-dash-player.mjs';

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

// Real key events through Kit.keys, with the game stepped by __game.ff (no animation frames).
const DRIVE = () => {
  window.key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  window.tap = (code, ticks = 6) => { key(code, true); __game.ff(ticks); key(code, false); __game.ff(1); };
  window.until = (cond, max = 3000) => { for (let i = 0; i < max && !cond(__game.state); i++) __game.ff(1); return cond(__game.state); };
};

test('level 1\'s tutorial slows down at each step, waits for the jump and ends when its three jumps are done', async t => {
  const page = await game(t);
  await page.evaluate(DRIVE);
  const run = await page.evaluate(() => {
    const out = { rates: [] };
    __game.start(0, false);
    out.start = __game.tutorial;
    out.opt = __game.difficulty.opt;
    const spots = out.start.spots;
    // A child who does nothing: the run crawls in slow motion over the spot to jump from, then crashes.
    until(s => s.x >= spots[0].a + 0.3);
    out.crawl = __game.state.rate;
    until(s => s.dead, 4000);
    out.crash = { ...__game.state, tutorial: __game.tutorial };
    // That try had no input, so the next one waits; a press starts it. Then do what it shows.
    until(s => !s.dead, 100);
    out.waiting = __game.state.wait;
    tap('Space');
    out.startedStill = { wait: __game.state.wait, y: __game.state.y };
    for (let i = 0; i < 3; i++) {
      const w = __game.tutorial.spots[__game.tutorial.step];
      until(s => s.onGround && s.x >= (w.a + w.b) / 2, 4000);
      out.rates.push(__game.state.rate);
      tap('Space');
      until(s => __game.tutorial.step > i || s.dead, 600);
    }
    out.end = { ...__game.state, tutorial: __game.tutorial, stored: localStorage.getItem('sg:beat-dash:tut') };
    __game.ff(90);
    out.after = __game.state;
    return out;
  });
  assert.deepEqual({ on: run.start.on, steps: run.start.steps, done: run.start.done }, { on: true, steps: 3, done: false });
  assert.ok(run.crawl <= run.opt.rate * 0.31, `the run slows down at the spot (${run.crawl} of ${run.opt.rate})`);
  assert.equal(run.crash.deadBy, 'spike');
  assert.deepEqual({ step: run.crash.tutorial.step, done: run.crash.tutorial.done }, { step: 0, done: false }, 'a crash is no progress');
  assert.equal(run.waiting, true, 'after a try with no input the next one waits for a press');
  assert.deepEqual(run.startedStill, { wait: false, y: 0 }, 'the press that starts the run is not a jump');
  assert.equal(run.rates.length, 3);
  for (const r of run.rates) assert.ok(r <= run.opt.rate * 0.31, `each step waits in slow motion for the press (${r})`);
  assert.equal(run.end.dead, false, 'doing what the tutorial shows clears every step');
  assert.deepEqual({ on: run.end.tutorial.on, step: run.end.tutorial.step, done: run.end.tutorial.done, stored: run.end.stored },
    { on: false, step: 3, done: true, stored: '1' }, 'the tutorial reaches its end and is saved');
  assert.equal(run.after.rate, run.opt.rate, 'then the run is back to its normal speed');

  // On this PC the tutorial is done, so the next visit runs at full speed, until a child
  // crashes twice in a row before its end: then its help comes back.
  await page.reload();
  await page.waitForFunction(() => window.__game && window.Kit);
  await page.evaluate(DRIVE);
  const again = await page.evaluate(() => {
    __game.start(0, false);
    const first = __game.tutorial.on, ons = [];
    for (let k = 0; k < 3; k++) {
      tap('Space'); // a jump on the run-up: someone is playing
      until(s => s.dead, 4000);
      until(s => !s.dead, 100);
      ons.push(__game.tutorial.on);
    }
    return { first, ons };
  });
  assert.deepEqual(again, { first: false, ons: [false, true, true] });
});

test('practice never ends a try by itself: no trap checkpoints, no jump from a held key, idle respawns wait', async t => {
  const page = await game(t);
  await page.evaluate(DRIVE);
  const run = await page.evaluate(() => {
    const out = {};
    __game.save.tut = 1; // the tutorial is done on this PC: no slow motion here
    __game.start(0, true);
    const spots = __game.tutorial.spots;
    // Z (checkpoint) in mid-air over the first spike waits for the landing.
    until(s => s.x >= (spots[0].a + spots[0].b) / 2); tap('Space');
    until(s => s.y > 1); tap('KeyZ', 1);
    out.inAir = __game.state.cps;
    until(s => s.cps === 1 || s.dead, 300);
    out.landed = __game.state;
    // A jump far too early for the second spike, and Z while falling onto it: never placed.
    until(s => s.x >= spots[1].a - 1.2); tap('Space');
    until(s => s.y > 1); tap('KeyZ', 1);
    until(s => s.dead, 600);
    out.crash = __game.state;
    // The child holds the jump key through the crash and the respawn.
    key('Space', true);
    until(s => !s.dead, 100);
    out.respawn = __game.state;
    __game.ff(300);
    out.held = __game.state;
    key('Space', false); __game.ff(2);
    tap('Space', 20); // one long press starts the run; it is not a jump
    out.started = __game.state;
    let n = 0;
    while (!__game.state.dead && n < 2000) { __game.ff(1); n++; }
    out.alone = { ticks: n, deadBy: __game.state.deadBy };
    until(s => !s.dead, 100);
    out.next = __game.state;
    __game.ff(900);
    out.later = __game.state;
    return out;
  });
  assert.equal(run.inAir, 0, 'no checkpoint in mid-air');
  assert.deepEqual({ cps: run.landed.cps, ground: run.landed.onGround, y: run.landed.y, past: run.landed.x > 42.5 },
    { cps: 1, ground: true, y: 0, past: true }, 'the wanted checkpoint is placed on landing');
  assert.equal(run.crash.deadBy, 'spike', 'the try ended on a collision');
  assert.equal(run.crash.cps, 1, 'no checkpoint in front of a spike it cannot avoid');
  assert.deepEqual({ wait: run.respawn.wait, x: run.respawn.x }, { wait: true, x: run.landed.x }, 'respawned at the checkpoint, waiting');
  assert.deepEqual({ attempt: run.held.attempt, wait: run.held.wait, dead: run.held.dead, x: run.held.x, y: run.held.y },
    { attempt: run.respawn.attempt, wait: true, dead: false, x: run.respawn.x, y: 0 }, 'a held key neither starts nor jumps');
  assert.deepEqual({ wait: run.started.wait, y: run.started.y }, { wait: false, y: 0 }, 'a fresh press starts the run without a jump');
  assert.ok(run.alone.ticks >= 45, `from a checkpoint the cube runs at least 0.75 s before anything can hit it (${run.alone.ticks} ticks)`);
  assert.equal(run.alone.deadBy, 'spike');
  assert.equal(run.next.wait, true, 'every practice respawn waits for the player');
  assert.deepEqual({ attempt: run.later.attempt, wait: run.later.wait, dead: run.later.dead }, { attempt: run.next.attempt, wait: true, dead: false },
    'nobody pressing means no new tries and no crashes');
});

test('quick crashes ease the difficulty; idle tries wait for a press and leave it alone', async t => {
  const page = await game(t);
  await page.evaluate(DRIVE);
  const run = await page.evaluate(() => {
    const tries = [];
    __game.start(0, false);
    for (let k = 0; k < 3; k++) {
      const d = __game.difficulty;
      tap('Space'); // a jump on the run-up, then a crash into the first spike
      until(s => s.dead, 4000);
      tries.push({ level: d.level, rate: d.opt.rate, haz: d.opt.haz, x: __game.state.x });
      until(s => !s.dead, 100);
    }
    const eased = __game.difficulty;
    until(s => s.dead, 4000); until(s => !s.dead, 100); // nobody plays this try
    const idle = __game.state;
    __game.ff(900);
    return { tries, eased, idle, later: __game.state, after: __game.difficulty, saved: localStorage.getItem('sg:beat-dash:dda') };
  });
  assert.equal(run.tries[0].level, 0.35, 'a PC with no results starts at 0.35');
  assert.ok(run.tries.every(tr => tr.x < 45), 'each try crashed at the first spike');
  for (let i = 1; i < 3; i++) {
    assert.ok(run.tries[i].level < run.tries[i - 1].level, `try ${i + 1} is easier (${run.tries.map(tr => tr.level)})`);
    assert.ok(run.tries[i].rate < run.tries[i - 1].rate && run.tries[i].haz > run.tries[i - 1].haz, 'slower, with a smaller spike hitbox');
  }
  assert.equal(run.eased.level, 0, 'three quick crashes reach the easiest setting');
  assert.deepEqual(run.eased.opt, JSON.parse(JSON.stringify(BD.forgivingAt(0))));
  assert.equal(run.idle.wait, true, 'after a try with no input the next one waits');
  assert.deepEqual({ attempt: run.later.attempt, wait: run.later.wait }, { attempt: run.idle.attempt, wait: true }, 'an unattended game makes no new tries');
  assert.equal(run.after.level, run.eased.level, 'a try nobody played does not change the difficulty');
  assert.deepEqual(JSON.parse(run.saved), { main: [0, 3] }, 'the difficulty is saved for this PC');
});

test('an older save keeps working: its progress, stars and bests stay, and a PC that beat level 1 skips the tutorial', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    const put = (key, value) => localStorage.setItem('sg:beat-dash:' + key, JSON.stringify(value));
    put('done', { 'neon-steps': true }); put('best', { 'neon-steps': 100, 'pulse-road': 37 }); put('stars', { 'neon-steps': 5 });
    put('att', { 'neon-steps': 45 }); put('total', { attempts: 45, jumps: 300 }); put('last', 1); put('music', true);
  });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.Kit);
  const run = await page.evaluate(() => {
    document.getElementById('b-play').click();
    const select = { level: document.getElementById('lvl-name').textContent, go: !document.getElementById('b-go').disabled };
    __game.start(0, false);
    const tutorial = __game.tutorial;
    __game.ff(120);
    return { select, tutorial, state: __game.state, best: __game.save.best, stars: __game.save.stars, attempts: __game.save.total.attempts };
  });
  assert.deepEqual(run.select, { level: 'طريق النبض', go: true }, 'level 2 is still open and selected');
  assert.equal(run.tutorial.on, false, 'a PC that beat level 1 before needs no tutorial');
  assert.deepEqual(run.best, { 'neon-steps': 100, 'pulse-road': 37 });
  assert.deepEqual(run.stars, { 'neon-steps': 5 });
  assert.equal(run.attempts, 46);
  assert.ok(run.state.x > 5 && !run.state.dead, 'and it plays');
});

test('a child pressing on the beat with a realistic timing error clears level 1 in the real game', async t => {
  const page = await game(t);
  await page.evaluate(DRIVE);
  // Where level 1 needs a jump: the cube's position at each press when pressing exactly on the beat.
  const { pressX } = beatPlayer(level1, BD.forgivingAt(1), 0);
  const run = await page.evaluate(({ pressX, sigma, seed }) => {
    let a = seed;
    const random = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const gauss = () => { let u = 0; while (!u) u = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); };
    const speed = __game.levels[0].length / __game.levels[0].seconds, tries = [];
    __game.start(0, false);
    while (!__game.state.won && tries.length < 12) {
      if (__game.state.wait) tap('Space');
      // this try's timing errors, one per jump, in seconds: early (-) or late (+)
      const err = pressX.map(() => gauss() * sigma / 1000);
      let k = pressX.findIndex(x => x > __game.state.x - 0.5), held = 0;
      for (let n = 0; n < 20000 && !__game.state.dead && !__game.state.won; n++) {
        const s = __game.state;
        if (k >= 0 && k < pressX.length && s.x >= pressX[k] + err[k] * speed * s.rate) { key('Space', true); held = 6; k++; }
        __game.ff(1);
        if (held && --held === 0) key('Space', false);
      }
      if (held) key('Space', false);
      tries.push({ won: __game.state.won, x: __game.state.x, deadBy: __game.state.deadBy, rate: __game.difficulty.opt.rate });
      if (!__game.state.won) until(s => !s.dead, 100);
    }
    return { tries, tutorial: __game.tutorial };
  }, { pressX, sigma: 70, seed: 20261110 });
  assert.equal(run.tries.at(-1).won, true, `level 1 is cleared (${JSON.stringify(run.tries)})`);
  assert.ok(run.tries.length <= 6, `within a few tries (${run.tries.length})`);
  assert.ok(run.tries.every(tr => tr.won || tr.deadBy !== 'fall'), 'every lost try ended on an obstacle');
  assert.equal(run.tutorial.done, true, 'and the tutorial was finished on the way');
});

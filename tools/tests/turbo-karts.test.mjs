import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function karts(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const tk = window.tk = { stats: [], failSave: false };
    tk.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    tk.down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
    tk.up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
    tk.tap = code => { tk.down(code); tk.up(code); };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
      for (const name of ['round', 'end']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { tk.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (tk.failSave && key === 'sg:turbo-karts:save') throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/turbo-karts/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.TK);
  return page;
}

test('the title starts a race with Enter and records one result', async t => {
  const page = await karts(t);
  const started = await page.evaluate(() => {
    tk.tap('Enter'); tk.step(2);
    return { state: __game.state, round: tk.stats[0] };
  });
  assert.equal(started.state, 'count');
  assert.deepEqual(started.round, ['round', 'T1']);
  const result = await page.evaluate(() => {
    __game.skipIntro();
    __game.endNow(1);
    tk.step(2);
    return { state: __game.state, stats: tk.stats };
  });
  assert.equal(result.state, 'result');
  assert.deepEqual(result.stats, [['round', 'T1'], ['end', 'win', 10]]);
});

test('a two-player race records a pvp round and a neutral end', async t => {
  const page = await karts(t);
  const stats = await page.evaluate(() => {
    __game.start({ mode: 'pvp', track: 0 });
    __game.skipIntro();
    __game.endNow(2);
    tk.step(2);
    return tk.stats;
  });
  assert.deepEqual(stats, [['round', 'T1:pvp'], ['end', 'end']]);
});

test('pause freezes the race, a second pause stays paused, and resume continues', async t => {
  const page = await karts(t);
  const out = await page.evaluate(() => {
    __game.start({ mode: 'cpu', track: 0, seed: 1 });
    __game.skipIntro();
    tk.step(20);
    tk.tap('KeyP'); tk.step(1);
    const time = __game.race.time;
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));
    tk.step(30);
    const paused = { state: __game.state, time: __game.race.time, frozen: __game.race.time === time };
    document.getElementById('bResume').click();
    tk.step(20);
    return { paused, state: __game.state, moved: __game.race.time > time };
  });
  assert.deepEqual(out.paused, { state: 'pause', time: out.paused.time, frozen: true });
  assert.equal(out.state, 'race');
  assert.equal(out.moved, true);
});

test('restart begins a fresh countdown and does not end the round', async t => {
  const page = await karts(t);
  const out = await page.evaluate(() => {
    __game.start({ mode: 'cpu', track: 0, seed: 1 });
    __game.skipIntro();
    tk.step(10);
    tk.tap('KeyP'); tk.step(1);
    document.getElementById('bRestart').click();
    tk.step(1);
    return { state: __game.state, lap: __game.race.lap == null ? __game.race.karts[0].lap : __game.race.lap, time: __game.race.time, phase: __game.race.phase, ends: tk.stats.filter(s => s[0] === 'end') };
  });
  assert.equal(out.state, 'count');
  assert.equal(out.phase, 'count');
  assert.equal(out.lap, 0);
  assert.ok(out.time < 0.05);
  assert.deepEqual(out.ends, []);
});

test('holding the drift key through a turn releases a turbo', async t => {
  const page = await karts(t);
  const boost = await page.evaluate(() => {
    __game.start({ mode: 'cpu', track: 0, seed: 1 });
    __game.skipIntro();
    __game.placeStraight();
    tk.down('ArrowUp'); tk.down('ArrowLeft'); tk.down('Space');
    tk.step(24);
    const charged = __game.race.karts[0].charge;
    tk.up('Space');
    tk.step(2);
    return { charged, boost: __game.race.karts[0].boostT };
  });
  assert.ok(boost.charged >= 0.48, 'charge ' + boost.charged);
  assert.ok(boost.boost > 0, 'boost ' + boost.boost);
});

test('a failed save shows the warning and retry writes it', async t => {
  const page = await karts(t);
  const result = await page.evaluate(() => {
    const panel0 = document.querySelector('.sg-save-status');
    const before = !panel0 || panel0.hidden;
    tk.failSave = true;
    __game.start({ mode: 'cpu', track: 0 });
    __game.endNow(1);
    tk.step(2);
    const panel = document.querySelector('.sg-save-status');
    const failed = { shown: !panel.hidden, state: panel.dataset.state, stored: TKU && localStorage.getItem('sg:turbo-karts:save') };
    tk.failSave = false;
    panel.querySelector('button').click();
    const saved = JSON.parse(localStorage.getItem('sg:turbo-karts:save'));
    return { before, failed, state: panel.dataset.state, coins: saved.coins };
  });
  assert.equal(result.before, true);
  assert.deepEqual(result.failed, { shown: true, state: 'failed', stored: null });
  assert.equal(result.state, 'saved');
  assert.ok(result.coins > 0);
});

test('player two keys only drive player two, and arrows never scroll the page', async t => {
  const page = await karts(t);
  const split = await page.evaluate(() => {
    __game.start({ mode: 'pvp', track: 0, seed: 1 });
    __game.skipIntro();
    const a0 = __game.race.karts[0].ang, a1 = __game.race.karts[1].ang;
    tk.down('KeyD'); tk.step(8); tk.up('KeyD');
    const afterD = [__game.race.karts[0].ang - a0, __game.race.karts[1].ang - a1];
    const b0 = __game.race.karts[0].ang, b1 = __game.race.karts[1].ang;
    tk.down('ArrowLeft'); tk.step(8); tk.up('ArrowLeft');
    const afterA = [__game.race.karts[0].ang - b0, __game.race.karts[1].ang - b1];
    return { afterD, afterA, scroll: [window.scrollX, window.scrollY] };
  });
  assert.ok(Math.abs(split.afterD[0]) > 0.05, 'P1 turned');
  assert.ok(Math.abs(split.afterD[1]) < 0.02, 'P2 ignored D');
  assert.ok(Math.abs(split.afterA[1]) > 0.05, 'P2 turned');
  assert.ok(Math.abs(split.afterA[0]) < 0.02, 'P1 ignored the arrow');
  assert.deepEqual(split.scroll, [0, 0]);

  const solo = await page.evaluate(() => {
    __game.start({ mode: 'cpu', track: 0, seed: 1 });
    __game.skipIntro();
    tk.down('ArrowRight'); tk.down('Space'); tk.step(6);
    const human = Math.abs(__game.race.karts[0].ang) >= 0;
    tk.up('ArrowRight'); tk.up('Space');
    tk.down('Slash'); tk.step(4); tk.up('Slash');
    return { state: __game.state, human, scroll: document.scrollingElement.scrollTop };
  });
  assert.equal(solo.state, 'race');
  assert.equal(solo.human, true);
  assert.equal(solo.scroll, 0);
});

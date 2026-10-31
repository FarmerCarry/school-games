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

async function open(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const bb = window.bb = { stats: [], failSave: false };
    bb.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    bb.tap = code => { bb.down(code); bb.up(code); };
    bb.down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    bb.up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
      for (const name of ['round', 'end']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { bb.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (bb.failSave && key === 'sg:balloon-blast:save') throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/balloon-blast/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.BLB);
  return page;
}

test('a 1P match records one cpu tier and one end after the match, not after each round', async t => {
  const page = await open(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'battle', seed: 4 });
    const afterStart = bb.stats.map(row => row.slice());
    __game.winRound(0); bb.step(2);
    const afterRound = bb.stats.map(row => row.slice());
    __game.winRound(0); bb.step(3);
    return { afterStart, afterRound, done: bb.stats, screen: __game.screen };
  });
  assert.equal(result.afterStart.length, 1);
  assert.equal(result.afterStart[0][0], 'round');
  assert.match(result.afterStart[0][1], /^cpu-[1-5]$/);
  assert.deepEqual(result.afterRound, result.afterStart);
  assert.equal(result.done.length, 2);
  assert.equal(result.done[1][0], 'end');
  assert.equal(result.done[1][1], 'win');
  assert.equal(result.done[1][2], 2);
  assert.equal(result.screen, 'result');
});

test('two players record battle:duo and a neutral end', async t => {
  const page = await open(t);
  const stats = await page.evaluate(() => {
    __game.start({ mode: 'duo', seed: 5 });
    __game.winRound(0); bb.step(2);
    __game.winRound(0); bb.step(3);
    return bb.stats;
  });
  assert.deepEqual(stats, [['round', 'battle:duo'], ['end', 'end']]);
});

test('the attract match behind the title records nothing', async t => {
  const page = await open(t);
  const stats = await page.evaluate(() => {
    const demo = __game.demoing;
    bb.step(90);
    return { demo, stats: bb.stats, still: __game.screen };
  });
  assert.equal(stats.demo, true);
  assert.deepEqual(stats.stats, []);
  assert.equal(stats.still, 'title');
});

test('pause freezes the round, restart clears it, and nothing resumes by itself', async t => {
  const page = await open(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'duo', seed: 6 });
    __game.setTime(3);
    bb.step(5);
    const t0 = __game.world.time;
    bb.tap('KeyP'); bb.step(1);
    const paused = __game.paused;
    bb.step(40);
    const frozen = __game.world.time;
    bb.tap('KeyP'); bb.step(8);
    const resumed = !__game.paused && __game.world.time > frozen;
    bb.tap('KeyP'); bb.step(1);
    document.getElementById('bRestart').click();
    bb.step(2);
    return { paused, frozen: frozen === t0, resumed, fresh: __game.world.freeze > 0 && __game.scores[0] === 0 && __game.screen === 'play' };
  });
  assert.deepEqual(result, { paused: true, frozen: true, resumed: true, fresh: true });
});

test('a failed save shows the retry, and retry writes the match', async t => {
  const page = await open(t);
  const result = await page.evaluate(() => {
    bb.failSave = true;
    __game.start({ mode: 'battle', seed: 7 });
    __game.winRound(0); bb.step(2);
    __game.winRound(0); bb.step(3);
    const panel = document.querySelector('.sg-save-status');
    const failed = { shown: !panel.hidden, state: panel.dataset.state };
    bb.failSave = false;
    panel.querySelector('button').click();
    return { failed, state: panel.dataset.state, wins: __game.save ? null : (JSON.parse(localStorage.getItem('sg:balloon-blast:save') || '{}').wins) };
  });
  assert.equal(result.failed.shown, true);
  assert.equal(result.failed.state, 'failed');
  assert.equal(result.state, 'saved');
  assert.equal(result.wins, 1);
});

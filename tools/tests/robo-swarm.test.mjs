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

async function game(t, { saved } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(saved => {
    if (saved !== undefined) localStorage.setItem('sg:robo-swarm:save', saved);
    let kit;
    const rs = window.rs = { stats: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        rs.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { rs.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:robo-swarm:save' && rs.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, saved);
  await page.goto(`${server.origin}/games/robo-swarm/`);
  await page.waitForFunction(() => window.__game && window.rs.step);
  return page;
}

const ends = page => page.evaluate(() => rs.stats.filter(s => s[0] === 'end' || s[0] === 'round'));

test('a 1P run records m1 and exactly one end', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start({ players: 1, map: 1, quick: false, endless: false }); rs.step(8); __game.endNow('lose'); });
  const log = await ends(page);
  assert.deepEqual(log.filter(s => s[0] === 'round'), [['round', 'm1']]);
  const finished = log.filter(s => s[0] === 'end');
  assert.equal(finished.length, 1);
  assert.equal(finished[0][1], 'lose');
  assert.equal(await page.evaluate(() => __game.state), 'result');
});

test('a forced boss pop on a normal run is a win of at least 120 seconds', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start({ players: 1, map: 1, quick: false, endless: false }); __game.setTime(30); __game.endNow('win'); });
  const finished = await page.evaluate(() => rs.stats.filter(s => s[0] === 'end'));
  assert.equal(finished.length, 1);
  assert.equal(finished[0][1], 'win');
  assert.ok(finished[0][2] >= 120, finished[0][2]);
});

test('2P records m1:duo and a neutral end', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start({ players: 2, map: 1, quick: false, endless: false }); rs.step(5); __game.endNow('win'); });
  const log = await ends(page);
  assert.deepEqual(log.filter(s => s[0] === 'round'), [['round', 'm1:duo']]);
  assert.deepEqual(log.filter(s => s[0] === 'end'), [['end', 'end']]);
});

test('the card screen freezes the sim and each player picks their own card', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start({ players: 2, map: 1, quick: false }); rs.step(3); __game.levelUp(); });
  assert.equal(await page.evaluate(() => __game.run.cards), 1);
  const frozen = await page.evaluate(() => {
    const t0 = __game.t;
    rs.step(40);
    return [t0, __game.t, document.getElementById('cards').hidden];
  });
  assert.equal(frozen[0], frozen[1], 'time moves while cards are up');
  assert.equal(frozen[2], false);
  const before = await page.evaluate(() => [Array.from(__game.run.lv[0]), Array.from(__game.run.lv[1])]);
  await page.keyboard.press('KeyD');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => rs.step(1));
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.evaluate(() => rs.step(2));
  const after = await page.evaluate(() => ({
    cards: __game.run.cards,
    a: Array.from(__game.run.lv[0]),
    b: Array.from(__game.run.lv[1]),
    hidden: document.getElementById('cards').hidden
  }));
  assert.equal(after.cards, 0);
  assert.equal(after.hidden, true);
  assert.notDeepEqual(after.a, before[0], 'player 1 took a card');
  assert.notDeepEqual(after.b, before[1], 'player 2 took a card');
  const moved = await page.evaluate(() => { const t0 = __game.t; rs.step(10); return __game.t > t0; });
  assert.equal(moved, true, 'the run resumes after both picks');
});

test('pause freezes the run and restart begins again without an end', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start({ players: 1, map: 1, quick: false }); rs.step(20); });
  const t0 = await page.evaluate(() => __game.t);
  await page.keyboard.press('KeyP');
  await page.evaluate(() => rs.step(1));
  assert.equal(await page.evaluate(() => __game.state), 'pause');
  const frozen = await page.evaluate(() => { const t1 = __game.t; rs.step(30); return [t1, __game.t]; });
  assert.equal(frozen[0], t0);
  assert.equal(frozen[1], t0);
  await page.locator('#btnRestart').click();
  await page.evaluate(() => rs.step(2));
  assert.equal(await page.evaluate(() => __game.state), 'play');
  assert.ok(await page.evaluate(() => __game.t < 0.5));
  const log = await ends(page);
  assert.deepEqual(log.filter(s => s[0] === 'end'), []);
  assert.equal(log.filter(s => s[0] === 'round').length, 2);
});

test('a failed save shows the retry warning and keeps the coins', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start({ players: 1, map: 1, quick: false }); rs.failSave = true; __game.endNow('lose'); });
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.ok(await page.evaluate(() => __game.save.coins > 0));
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:robo-swarm:save')), null);
  await page.evaluate(() => { rs.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:robo-swarm:save')));
  assert.ok(stored.coins > 0);
});

test('a damaged save still opens the title', async t => {
  const page = await game(t, { saved: '{"coins":"lots","map":9,"heroes":"nope","meta":[-3,8],"trophies":null}' });
  assert.equal(await page.evaluate(() => __game.state), 'title');
  assert.equal(await page.locator('#btnPlay').isVisible(), true);
  await page.evaluate(() => { __game.start({ players: 1, map: 1, quick: false }); rs.step(5); });
  assert.equal(await page.evaluate(() => __game.state), 'play');
});

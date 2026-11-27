// Sandwich Tower in real Chromium: real keys and clicks drop the pieces, pause freezes the
// tower, a won level shows its stars and opens the next one, a lost level and «إلى القمر»
// reach their results, the two-player keys, the level map and eaters, saves that survive a
// reload or fail, and no errors or network requests at any point.
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

const KEY = 'sg:sandwich-tower:save';
const beaten = n => ({ v: 1, stars: Array.from({ length: 12 }, (_, i) => (i < n ? 2 : 0)), best: Array(12).fill(0), endless: 0, eater: 0, seen: 1, coach: true });
// The game with its frame loop stepped by hand, and storage that can be made to fail.
async function game(t, { save, failSave = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, failSave, KEY }) => {
    if (!sessionStorage.getItem('st-seeded')) {
      sessionStorage.setItem('st-seeded', '1');
      if (save !== undefined) localStorage.setItem(KEY, JSON.stringify(save));
    }
    let kit;
    const zp = window.zp = { failSave };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        zp.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        zp.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        zp.paint = () => render(0);
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key) === KEY && window.zp.failSave) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, failSave, KEY });
  await page.goto(`${server.origin}/games/sandwich-tower/`);
  await page.waitForFunction(() => window.__game && window.zp.step);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const stored = page => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 2) { if (ok(__game.state)) return true; zp.run(2); }
      return ok(__game.state);
    } finally { zp.paint(); }
  }, { cond, max });
}
// Waits for tower i's next sliding piece and moves it off the tower top by off px, so the
// following real key press decides a known landing.
async function aim(page, off, i = 0) {
  const ok = await page.evaluate(({ off, i }) => {
    const w = __game.world, t = w.towers[i];
    for (let n = 0; n < 600 && t.phase !== 'slide' && w.phase === 'play'; n++) zp.run(1);
    if (t.phase !== 'slide') return false;
    t.cur.x = t.tx + off;
    return true;
  }, { off, i });
  assert.ok(ok, 'a piece is sliding');
}
// Lets the dropped piece land.
async function settle(page, i = 0) {
  await page.evaluate(i => { const t = __game.world.towers[i]; zp.run(1); for (let n = 0; n < 600 && t.phase === 'fall'; n++) zp.run(1); zp.paint(); }, i);
}
async function dropWith(page, key, off = 0, i = 0) { await aim(page, off, i); await page.keyboard.press(key); await settle(page, i); }

test('Enter starts level 1; nothing drops alone; Space drops; P pauses and freezes the tower; restart empties it', async t => {
  const page = await game(t);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(s.next, 1);
  await page.keyboard.press('F2');
  await page.mouse.click(640, 600);
  assert.equal((await state(page)).screen, 'title', 'other keys and the title canvas do not start');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'levels');
  assert.equal(s.level, 1);
  assert.equal(s.hint, true, 'a first-time player gets the tap hint');
  await page.evaluate(() => zp.step(180));
  s = await state(page);
  assert.equal(s.drops, 0, 'nothing drops without input');
  assert.equal(s.height, 0);
  assert.equal(s.piece, 'bread');
  await dropWith(page, 'Space', 0);
  s = await state(page);
  assert.equal(s.drops, 1);
  assert.equal(s.height, 1);
  assert.equal(s.perfects, 1);
  assert.equal(s.score, 3);
  assert.equal(s.hint, false, 'the first landing ends the hint');
  assert.equal((await stored(page)).coach, true);
  await page.evaluate(() => zp.step(30));
  await page.keyboard.press('KeyP');
  s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(await page.locator('#scrPause').isVisible(), true);
  assert.notEqual(s.piece, '', 'a piece hangs mid-slide');
  const frozen = JSON.stringify([s.t, s.x, s.drops, s.height]);
  await page.keyboard.down('ArrowDown');
  await page.mouse.click(640, 120);
  await page.evaluate(() => zp.step(60));
  await page.keyboard.up('ArrowDown');
  s = await state(page);
  assert.equal(JSON.stringify([s.t, s.x, s.drops, s.height]), frozen, 'paused: nothing moves');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play');
  await page.evaluate(() => zp.step(30));
  assert.notEqual((await state(page)).t, JSON.parse(frozen)[0], 'resumed');
  await page.keyboard.press('Escape');
  await page.click('#btnRestart');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 1);
  assert.equal(s.drops, 0);
  assert.equal(s.height, 0);
});

test('a won level: the bun, the chomp, three stars, the next level, and progress that survives a reload', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  const goal = (await state(page)).goal;
  for (let k = 0; k < goal; k++) await dropWith(page, k % 2 ? 'Space' : 'ArrowDown', 0);
  let s = await state(page);
  assert.equal(s.height, goal);
  assert.equal(s.won, true);
  assert.ok(['bun', 'bunwait', 'eat'].includes(s.phase), s.phase);
  assert.ok(await until(page, 's.phase === "eat"', 600));
  assert.ok(await until(page, 's.screen === "result"', 60 * 8));
  // A drop key still held from the last piece cannot skip the result.
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'result');
  await page.evaluate(() => zp.step(100));
  assert.equal(await page.locator('#resStars .on').count(), 3);
  assert.equal(await page.locator('#btnNext').isVisible(), true);
  const saved = await stored(page);
  assert.equal(saved.stars[0], 3);
  assert.equal(saved.best[0], goal * 3);
  s = await state(page);
  assert.equal(s.stars, 3);
  assert.equal(s.next, 2);
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 2);
  assert.equal(s.drops, 0);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.zp.step);
  assert.equal(await page.locator('#titleLevel b').textContent(), '2');
  assert.equal(await page.locator('#titleStars b').textContent(), '3');
});

test('mouse clicks drop too; a lost level shows أوبس! and R tries it again', async t => {
  const page = await game(t, { save: beaten(2) });
  await page.click('#btnPlay');
  let s = await state(page);
  assert.equal(s.level, 3, 'Play goes to the next unbeaten level');
  assert.equal(s.hearts, 3);
  await aim(page, 0);
  const p = await page.evaluate(() => __game.point(640, 420));
  await page.mouse.click(p.x, p.y);
  await settle(page);
  s = await state(page);
  assert.equal(s.drops, 1, 'a click on the play field drops');
  assert.equal(s.height, 1);
  for (let k = 0; k < 3; k++) await dropWith(page, 'Space', 700);
  s = await state(page);
  assert.equal(s.hearts, 0);
  assert.equal(s.misses, 3);
  assert.equal(s.phase, 'lost');
  assert.ok(await until(page, 's.screen === "result"', 60 * 3));
  assert.equal(await page.locator('#resTitle').textContent(), 'أوبس!');
  assert.equal(await page.locator('#resStars').isVisible(), false);
  assert.equal(await page.locator('#btnNext').isVisible(), false);
  assert.equal((await stored(page)).stars[2], 0);
  await page.evaluate(() => zp.step(40));
  await page.keyboard.press('KeyR');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 3);
  assert.equal(s.drops, 0);
  assert.equal(s.hearts, 3);
});

test('the level map opens beaten levels only, and إلى القمر keeps the best height', async t => {
  const page = await game(t, { save: beaten(4) });
  await page.click('#btnLevels');
  assert.equal((await state(page)).screen, 'levels');
  assert.equal(await page.locator('.lvl').count(), 12);
  await page.click(".lvl[data-level='9']");
  assert.equal((await state(page)).screen, 'levels', 'a locked level does not start');
  await page.click(".lvl[data-level='5']");
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 5);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  assert.equal((await state(page)).screen, 'title');

  await page.click('#btnEndless');
  s = await state(page);
  assert.equal(s.mode, 'endless');
  assert.equal(s.goal, 0);
  for (let k = 0; k < 6; k++) await dropWith(page, 'Space', 0);
  for (let k = 0; k < 3; k++) await dropWith(page, 'Space', -700);
  assert.ok(await until(page, 's.screen === "result"', 60 * 10));
  s = await state(page);
  assert.equal(s.height, 6);
  assert.equal(await page.locator('#resTitle').textContent(), 'وصلت إلى 6!');
  assert.equal(await page.locator('#resScore b').textContent(), '6');
  assert.equal((await stored(page)).endless, 6);
});

test('two players: S and Space for the left tower, ↓ and Enter for the right, clicks by half', async t => {
  const page = await game(t, { save: beaten(0) });
  await page.click('#btnDuo');
  let s = await state(page);
  assert.equal(s.mode, 'duo');
  assert.equal(s.goal, 15);
  await page.evaluate(() => zp.step(120));
  s = await state(page);
  assert.deepEqual([s.drops, s.p2.drops], [0, 0], 'nothing drops alone');
  await dropWith(page, 'KeyS', 0, 0);
  await dropWith(page, 'ArrowDown', 0, 1);
  s = await state(page);
  assert.deepEqual([s.drops, s.p2.drops], [1, 1]);
  await dropWith(page, 'Space', 0, 0);
  await dropWith(page, 'Enter', 0, 1);
  s = await state(page);
  assert.deepEqual([s.height, s.p2.height], [2, 2]);
  await aim(page, 0, 1);
  const p = await page.evaluate(() => __game.point(1000, 400));
  await page.mouse.click(p.x, p.y);
  await settle(page, 1);
  s = await state(page);
  assert.deepEqual([s.drops, s.p2.drops], [2, 3], 'a click on the right half is player 2');
  for (let k = 0; k < 13; k++) await dropWith(page, 'KeyS', 0, 0);
  s = await state(page);
  assert.equal(s.winner, 0);
  assert.ok(await until(page, 's.screen === "result"', 60 * 10));
  assert.equal(await page.locator('#resTitle').textContent(), 'فاز اللاعب 1!');
  assert.equal(await page.locator('#resPerf b').textContent(), '15');
  assert.equal(await page.locator('#resScore b').textContent(), '3');
  assert.deepEqual((await stored(page)).duo, [1, 0]);
});

test('eaters: stars unlock them, an open one can be picked, a locked one cannot', async t => {
  const page = await game(t, { save: beaten(3) }); // 6 stars: the hippo and the dino
  assert.equal(await page.locator('#eatersNew').isVisible(), true, 'a new eater is waiting');
  await page.click('#btnEaters');
  assert.equal((await state(page)).screen, 'eaters');
  assert.equal(await page.locator('.eater').count(), 7);
  await page.locator('.eater').nth(2).click();
  assert.equal((await stored(page)).eater, 0, 'locked');
  await page.locator('.eater').nth(1).click();
  assert.equal((await stored(page)).eater, 1);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#eatersNew').isVisible(), false);
  assert.equal((await state(page)).eater, 1);
});

test('a save that fails says so and the game keeps going; Retry saves once storage works', async t => {
  const page = await game(t, { failSave: true });
  await page.click('#btnPlay');
  await dropWith(page, 'Space', 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await stored(page), null);
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play', 'still playable');
  await page.evaluate(() => { zp.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal((await stored(page)).coach, true);
});

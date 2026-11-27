// Cloud Hop in real Chromium: Enter or Play starts level 1 at once, real keys and the
// mouse steer Marshy, pause freezes the sky, restart puts Marshy back on the start cloud,
// a won level (stars, the next level, a save that survives a reload), a lost one, the
// level map, the characters, the endless sky, saves that fail, and no errors or network
// requests at any point.
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

const KEY = 'sg:cloud-hop:save';
const SAVE = (o = {}) => Object.assign({ v: 1, played: true, coach: true, unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], candies: 0, chars: [true, false, false, false, false, false, false, false], char: 0, best: 0, bestAt: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, o);
// The game with its frame loop stepped by hand, and storage that can be made to fail.
async function game(t, { save, failSave = false, reduced = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, failSave, KEY }) => {
    if (!sessionStorage.getItem('ch-seeded')) {
      sessionStorage.setItem('ch-seeded', '1');
      if (save !== undefined) localStorage.setItem(KEY, JSON.stringify(save));
    }
    let kit;
    const ch = window.ch = { failSave, rounds: [], ends: [], dda: [] };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        ch.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        ch.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        ch.paint = () => render(0);
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key) === KEY && window.ch.failSave) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, failSave, KEY });
  await page.goto(`${server.origin}/games/cloud-hop/`);
  await page.waitForFunction(() => window.__game && window.ch.step);
  await page.evaluate(() => document.fonts.ready);
  // Count the play statistics the game reports.
  await page.evaluate(() => {
    const round = Kit.stats.round, end = Kit.stats.end;
    Kit.stats.round = function (id) { ch.rounds.push(id); return round.apply(this, arguments); };
    Kit.stats.end = function (how) { ch.ends.push(how); return end.apply(this, arguments); };
  });
  return page;
}
const state = page => page.evaluate(() => __game.state);
const stored = page => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
const stats = page => page.evaluate(() => ({ rounds: ch.rounds.slice(), ends: ch.ends.slice() }));
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; ch.run(3); }
      return ok(__game.state);
    } finally { ch.paint(); }
  }, { cond, max });
}
// Lifts Marshy just above a height (the castle, or high in the endless sky), to skip the climb.
const lift = (page, metres) => page.evaluate(metres => {
  const w = __game.world, y = metres ? metres * CH.PX : w.castleY + 40;
  w.m.y = y; w.m.vy = 0; w.m.power = null;
}, metres);

test('Enter starts level 1 at once; ← → steer Marshy; nothing moves it otherwise; Esc pauses and freezes the sky; restart', async t => {
  const page = await game(t);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  // a click on the sky or a stray key does not start
  await page.mouse.click(900, 600);
  await page.keyboard.press('F2');
  assert.equal((await state(page)).screen, 'title');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.deepEqual([s.level, s.height, s.bubbles, s.x], [1, 0, -1, 640]);
  assert.ok(s.coach, 'the first visit shows how to steer');
  await page.evaluate(() => ch.step(120));
  s = await state(page);
  assert.equal(s.x, 640, 'nothing moves Marshy sideways but steering');
  assert.ok(s.height > 1, 'Marshy bounces by itself');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => ch.step(30));
  await page.keyboard.up('ArrowRight');
  s = await state(page);
  assert.ok(s.x > 652, 'steered right: ' + s.x);
  assert.equal(s.coach, false, 'steering ends the hint');
  await page.keyboard.down('KeyA');
  await page.evaluate(() => ch.step(40));
  await page.keyboard.up('KeyA');
  assert.ok((await state(page)).x < s.x, 'A steers left');
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(await page.locator('#scrPause').isVisible(), true);
  const frozen = JSON.stringify([s.t, s.x, s.y, s.height]);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => ch.step(60));
  await page.keyboard.up('ArrowRight');
  s = await state(page);
  assert.equal(JSON.stringify([s.t, s.x, s.y, s.height]), frozen, 'paused: nothing moves');
  assert.equal((await stored(page)).coach, true, 'pausing saves');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play');
  await page.evaluate(() => ch.step(30));
  assert.ok((await state(page)).t > JSON.parse(frozen)[0]);
  await page.click('#btnPause');
  await page.click('#btnRestart');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.ok(s.height < 1 && s.t < 2);
  assert.equal(s.x, 640);
  assert.deepEqual((await stats(page)).rounds, ['L1', 'L1']);
  assert.deepEqual((await stats(page)).ends, ['quit']);
  await page.click('#btnPause');
  await page.click('#btnHome');
  assert.equal((await state(page)).screen, 'title');
  assert.deepEqual((await stats(page)).ends, ['quit', 'quit']);
});

test('level 1 won: stars, candies, the next level, and a save that survives a reload', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  // keys work right after clicking Play
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => ch.step(20));
  await page.keyboard.up('ArrowLeft');
  assert.ok((await state(page)).x < 640);
  assert.ok(await until(page, 's.phase === "play" && s.height > 3', 120));
  await lift(page);
  assert.ok(await until(page, 's.phase === "arrive"', 60));
  let s = await state(page);
  assert.equal(s.won, true);
  assert.equal(s.banner, 'وصلت!');
  assert.ok(await until(page, 's.screen === "result"', 60 * 4));
  s = await state(page);
  assert.ok(s.stars >= 1 && s.stars <= 3);
  assert.equal(await page.locator('#btnNext').isVisible(), true);
  assert.equal(await page.locator('#resTitle').textContent(), 'وصلت!');
  assert.equal(await page.locator('#resStars .st.on').count(), s.stars);
  const saved = await stored(page);
  assert.equal(saved.stars[0], s.stars);
  assert.equal(saved.unlocked, 2);
  assert.equal(saved.candies, s.wallet);
  assert.ok(saved.candies >= s.candies + 5 * s.stars, 'candies plus a bonus per star');
  assert.equal(saved.coach, true);
  assert.deepEqual((await stats(page)).ends, ['win']);
  // Enter right away (a key held from play) does nothing; a moment later it goes on
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).screen, 'result');
  await page.evaluate(() => ch.step(40));
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 2);
  assert.equal(s.bubbles, 3);
  assert.deepEqual((await stats(page)).rounds, ['L1', 'L2']);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ch.step);
  assert.equal(await page.locator('#titleLevel b').textContent(), '2');
  assert.equal(await page.locator('#titleCandies b').textContent(), String(saved.candies));
  await page.click('#btnPlay');
  assert.equal((await state(page)).level, 2, 'Play continues at the next level not yet won');
});

test('out of bubbles: the try ends, R tries the same level again, Esc goes to the title', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 5, stars: [2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], candies: 10 }) });
  await page.click('#btnPlay');
  let s = await state(page);
  assert.equal(s.level, 5);
  assert.equal(s.bubbles, 2);
  await page.evaluate(() => ch.step(90));
  // two falls use the bubbles, the third ends the try
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const w = __game.world; w.m.y = w.cam - 200; w.m.vy = -400; });
    assert.ok(await until(page, 's.phase === "rescue"', 30));
    assert.ok(await until(page, 's.phase === "play"', 120));
  }
  s = await state(page);
  assert.equal(s.bubbles, 0); assert.equal(s.falls, 2);
  await page.evaluate(() => { const w = __game.world; w.m.y = w.cam - 200; w.m.vy = -400; });
  assert.ok(await until(page, 's.screen === "result"', 200));
  assert.equal(await page.locator('#btnNext').isVisible(), false);
  assert.equal(await page.locator('.result-card.lose').count(), 1);
  assert.equal(await page.locator('#resStars .st.on').count(), 0);
  assert.equal((await stored(page)).stars[4], 0);
  assert.deepEqual((await stats(page)).ends, ['lose']);
  await page.evaluate(() => ch.step(40));
  await page.keyboard.press('KeyR');
  s = await state(page);
  assert.deepEqual([s.screen, s.level, s.bubbles, s.falls], ['play', 5, 2, 0]);
  await page.evaluate(() => { const w = __game.world; w.bubbles = 0; w.phase = 'play'; w.m.y = w.cam - 200; w.m.vy = -400; });
  assert.ok(await until(page, 's.screen === "result"', 200));
  await page.evaluate(() => ch.step(40));
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');
  assert.deepEqual((await stats(page)).rounds, ['L5', 'L5']);
});

test('the mouse steers only after it moves over the sky during play', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  await page.evaluate(() => ch.step(60));
  assert.equal((await state(page)).x, 640, 'the click on Play does not steer');
  const p = await page.evaluate(() => __game.point(1000, 400));
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.evaluate(() => ch.step(90));
  let s = await state(page);
  assert.equal(s.mouse, true);
  assert.ok(Math.abs(s.x - 1000) < 8, 'eased to the pointer: ' + s.x);
  // a key takes over again
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => ch.step(20));
  await page.keyboard.up('ArrowLeft');
  s = await state(page);
  assert.equal(s.mouse, false);
  assert.ok(s.x < 1000);
});

test('the level map opens won levels only; the characters cost candies and are worn', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 3, stars: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], candies: 120 }) });
  assert.equal(await page.locator('#btnChars .dot').isVisible(), true, 'something to buy');
  await page.click('#btnLevels');
  assert.equal((await state(page)).screen, 'levels');
  assert.equal(await page.locator('.lvl.locked[data-level]').count(), 9);
  assert.equal(await page.locator('.lvl.next').getAttribute('data-level'), '3');
  await page.click('.lvl[data-level="7"]');
  assert.equal((await state(page)).screen, 'levels', 'a locked level does not start');
  await page.click('#lvlEndless');
  assert.equal((await state(page)).screen, 'levels', 'endless opens after level 4');
  await page.click('.lvl[data-level="2"]');
  let s = await state(page);
  assert.deepEqual([s.screen, s.level], ['play', 2]);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.click('#btnChars');
  assert.equal((await state(page)).screen, 'shop');
  await page.click('#chars .char:nth-child(2)');
  let saved = await stored(page);
  assert.deepEqual([saved.char, saved.chars[1], saved.candies], [1, true, 75]);
  await page.click('#chars .char:nth-child(4)');
  saved = await stored(page);
  assert.deepEqual([saved.char, saved.chars[3], saved.candies], [1, false, 75], 'too dear: nothing changes');
  await page.click('#chars .char:nth-child(1)');
  saved = await stored(page);
  assert.deepEqual([saved.char, saved.candies], [0, 75], 'wearing an owned one is free');
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#titleCandies b').textContent(), '75');
});

test('the endless sky: open after level 4, one bubble, and the best height is kept', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 5, stars: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], best: 20 }) });
  await page.click('#btnEndless');
  let s = await state(page);
  assert.deepEqual([s.screen, s.level, s.bubbles], ['play', 0, 1]);
  assert.ok(await until(page, 's.phase === "play"', 60));
  await lift(page, 45);
  assert.ok(await until(page, 's.height > 40', 60));
  await page.evaluate(() => { const w = __game.world; w.bubbles = 0; w.m.power = null; w.m.y = w.cam - 200; w.m.vy = -400; });
  assert.ok(await until(page, 's.screen === "result"', 200));
  s = await state(page);
  const saved = await stored(page);
  assert.equal(saved.best, Math.floor(s.height));
  assert.equal(await page.locator('#resBest').isVisible(), true, 'a new best height');
  assert.equal(await page.locator('#resHeight').textContent(), String(Math.floor(s.height)));
  assert.deepEqual(await stats(page), { rounds: ['endless'], ends: ['end'] });
});

test('a save that fails says so and the game keeps going; Retry saves once storage works', async t => {
  const page = await game(t, { failSave: true });
  await page.click('#btnPlay');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => ch.step(30));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await stored(page), null);
  await page.evaluate(() => { ch.failSave = false; });
  await page.locator('.sg-save-status button').click();
  const saved = await stored(page);
  assert.equal(saved.played, true);
  assert.equal(saved.coach, true);
});

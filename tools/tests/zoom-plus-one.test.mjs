// Zooom +1 in real Chromium: real keys and the mouse run the road, +1 per keycap row,
// a cleared stage and a bloop into the jelly, pause, the shop, rebirth, saves that fail,
// and no errors or network requests at any point.
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

const KEY = 'sg:zoom-plus-one:save';
// The game with its frame loop stepped by hand, and storage that can be made to fail.
async function game(t, { save, failSave = false, reduced = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, failSave, KEY }) => {
    if (!sessionStorage.getItem('zp-seeded')) {
      sessionStorage.setItem('zp-seeded', '1');
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
  await page.goto(`${server.origin}/games/zoom-plus-one/`);
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
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; zp.run(3); }
      return ok(__game.state);
    } finally { zp.paint(); }
  }, { cond, max });
}

test('Enter starts, holding ↑ runs: every new keycap row is +1 speed; ← → change lanes; Esc pauses and freezes the road', async t => {
  const page = await game(t);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.z, -3);
  await page.evaluate(() => zp.step(60));
  assert.equal((await state(page)).steps, 0, 'nothing happens without input');
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => zp.step(90));
  s = await state(page);
  assert.ok(s.steps >= 5, 'steps ' + s.steps);
  assert.equal(s.speed, s.steps, '+1 per row at first');
  assert.ok(s.v > 4);
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => zp.step(20));
  assert.equal((await state(page)).lane, 1);
  await page.keyboard.press('KeyD');
  await page.evaluate(() => zp.step(20));
  assert.equal((await state(page)).lane, 2);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(await page.locator('#scrPause').isVisible(), true);
  const frozen = JSON.stringify([s.z, s.speed, s.steps]);
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => zp.step(60));
  await page.keyboard.up('ArrowUp');
  s = await state(page);
  assert.equal(JSON.stringify([s.z, s.speed, s.steps]), frozen, 'paused: the road does not move');
  assert.equal((await stored(page)).speed, s.speed, 'pausing saves');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play');
  // Restart from the pause menu puts the runner back on the pad and keeps the speed.
  await page.keyboard.press('KeyP');
  await page.click('#btnRestart');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.z, -3);
  assert.equal(s.speed, JSON.parse(frozen)[1]);
});

test('stage 1 is won on the first run: trophies, stage 2 and a save that survives a reload', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  await page.keyboard.down('ArrowUp');
  assert.ok(await until(page, 's.stage === 2 && s.phase === "run"', 60 * 30));
  await page.keyboard.up('ArrowUp');
  const s = await state(page);
  assert.equal(s.clears, 1);
  assert.ok(s.wins > 0);
  const saved = await stored(page);
  assert.equal(saved.stage, 2);
  assert.equal(saved.wins, s.wins);
  assert.equal(saved.coach, true, 'the first win ends the coach');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.zp.step);
  assert.equal(await page.locator('#titleStage b').textContent(), '2');
  assert.equal(await page.locator('#titleWins b').textContent(), String(s.wins));
});

test('short of the need: a bloop into the jelly, the same stage again, and the speed is kept', async t => {
  const page = await game(t, { save: { v: 1, stage: 7, best: 7, speed: 0, coach: true } });
  await page.click('#btnPlay');
  await page.keyboard.down('ArrowUp');
  assert.ok(await until(page, 's.phase === "fall"', 60 * 30));
  assert.equal((await state(page)).banner, 'بلوب!');
  assert.ok(await until(page, 's.phase === "run" && s.z < 0', 60 * 3));
  await page.keyboard.up('ArrowUp');
  const s = await state(page);
  assert.equal(s.stage, 7);
  assert.equal(s.falls, 1);
  assert.ok(s.speed >= s.rows, 'every row of the try is kept');
  assert.equal((await stored(page)).speed, s.speed);
});

test('the mouse: holding the button runs, and the pointer steers to a lane', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  const p = await page.evaluate(() => __game.point(1100, 500));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.evaluate(() => zp.step(60));
  let s = await state(page);
  assert.ok(s.steps > 0, 'running');
  assert.equal(s.lane, 4, 'steered to the right edge');
  await page.mouse.up();
  await page.evaluate(() => zp.step(60));
  s = await state(page);
  const z = s.z;
  await page.evaluate(() => zp.step(30));
  assert.equal((await state(page)).z, z, 'letting go stops the runner');
});

test('the shop: shoes, ×2 trophies and runners cost trophies; a rebirth from stage 11', async t => {
  const page = await game(t, { save: { v: 1, stage: 3, best: 3, wins: 60, speed: 500, coach: true } });
  await page.click('#btnTitleShop');
  assert.equal((await state(page)).screen, 'shop');
  await page.click('#buyShoes');
  let saved = await stored(page);
  assert.equal(saved.shoes, 1);
  assert.equal(saved.wins, 52);
  await page.click('#buyWinx');
  saved = await stored(page);
  assert.equal(saved.winx, 1);
  assert.equal(saved.wins, 22);
  await page.click('#runners .runner:nth-child(2)');
  saved = await stored(page);
  assert.equal(saved.skin, 1);
  assert.equal(saved.wins, 12);
  // Too expensive: nothing changes.
  await page.click('#runners .runner:nth-child(5)');
  assert.equal((await stored(page)).skin, 1);
  await page.click('#btnRebirth');
  assert.equal((await stored(page)).rebirths, 0, 'no rebirth before stage 11');
  assert.equal(await page.locator('#buyShoes .pr').textContent(), '15 🏆');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');
  // Opened during play it pauses the road and goes back to it.
  await page.click('#btnPlay');
  await page.click('#btnShop');
  assert.equal((await state(page)).screen, 'shop');
  await page.click('#shopBack');
  assert.equal((await state(page)).screen, 'play');

  const late = await game(t, { save: { v: 1, stage: 11, best: 11, wins: 5, speed: 40000, coach: true } });
  await late.click('#btnTitleShop');
  await late.click('#btnRebirth');
  const s = await state(late);
  assert.equal(s.screen, 'play');
  assert.deepEqual([s.stage, s.speed, s.rebirths], [1, 0, 1]);
  assert.equal((await stored(late)).rebirths, 1);
});

test('a save that fails says so and the game keeps going; Retry saves once storage works', async t => {
  const page = await game(t, { failSave: true });
  await page.click('#btnPlay');
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => zp.step(60));
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await stored(page), null);
  await page.evaluate(() => { zp.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.ok((await stored(page)).speed > 0);
});

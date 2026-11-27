// Ball Storm in real Chromium with the frame loop stepped by hand: the title (Enter, Space
// and #btnPlay start; a canvas click or a stray key does not), real keys and the mouse move
// the paddle and launch, pause freezes and resume goes on, restart resets, a won and a lost
// level both reach the result card, progress survives a reload, the level map, the shop,
// the endless lock, a failing save shows its retry badge, and no errors or network requests.
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

const KEY = 'sg:ball-storm:save';
const won = n => ({ v: 1, stars: Array.from({ length: 15 }, (_, i) => (i < n ? 2 : 0)), best: Array.from({ length: 15 }, (_, i) => (i < n ? 1000 : 0)), endless: 0, ball: 0, paddle: 0, coach: true, storm: 9, seen: 0 });
// The game with its frame loop stepped by hand, and storage that can be made to fail.
async function game(t, { save, failSave = false, reduced = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, failSave, KEY }) => {
    if (!sessionStorage.getItem('bs-seeded')) {
      sessionStorage.setItem('bs-seeded', '1');
      if (save !== undefined) localStorage.setItem(KEY, JSON.stringify(save));
    }
    let kit;
    const bs = window.bs = { failSave };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        bs.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        bs.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        bs.paint = () => render(0);
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key) === KEY && window.bs.failSave) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, failSave, KEY });
  await page.goto(`${server.origin}/games/ball-storm/`);
  await page.waitForFunction(() => window.__game && window.bs.step);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const stored = page => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
const step = (page, n) => page.evaluate(n => bs.step(n), n);
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; bs.run(3); }
      return ok(__game.state);
    } finally { bs.paint(); }
  }, { cond, max });
}
// Moves the real mouse to a point of the 1280x720 field.
async function mouseTo(page, x, y) {
  const p = await page.evaluate(([x, y]) => __game.point(x, y), [x, y]);
  await page.mouse.move(p.x, p.y);
}

test('the title: a canvas click and stray keys do nothing, Enter starts level 1 with the hint', async t => {
  const page = await game(t);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#scrTitle').isVisible(), true);
  await page.mouse.click(640, 600);
  for (const k of ['KeyX', 'ArrowLeft', 'KeyP', 'Escape']) await page.keyboard.press(k);
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title', 'still on the title');
  await page.keyboard.press('Enter');
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'level');
  assert.equal(s.level, 1);
  assert.equal(s.launched, false);
  assert.equal(s.lives, 3);
  assert.equal(s.coach, 1, 'the short hint is up');
  assert.equal(s.floor, 'perm');
  assert.equal(await page.locator('#btnPause').isVisible(), true);
  assert.equal(await page.locator('#scrTitle').isVisible(), false);
});

test('#btnPlay starts too, and a pointer resting where Play was clicked does not steer', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  let s = await state(page);
  assert.equal(s.screen, 'play');
  await step(page, 60);
  s = await state(page);
  assert.equal(s.mouse, false);
  assert.equal(s.paddle, 640, 'the paddle waits in the middle');
  assert.equal(s.launched, false);
});

test('real input: keys and the mouse move the paddle, Space and a click launch, the ball flies and pops bricks', async t => {
  const page = await game(t);
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play', 'Space starts too');
  await page.keyboard.down('ArrowRight');
  await step(page, 20);
  await page.keyboard.up('ArrowRight');
  let s = await state(page);
  assert.ok(s.paddle > 900, 'right arrow: ' + s.paddle);
  assert.equal(s.bx, s.paddle, 'the ball rides on the paddle');
  await page.keyboard.down('KeyA');
  await step(page, 10);
  await page.keyboard.up('KeyA');
  const afterA = (await state(page)).paddle;
  assert.ok(afterA < s.paddle, 'A moves left');
  await mouseTo(page, 300, 500);
  await mouseTo(page, 320, 500);
  await step(page, 10);
  s = await state(page);
  assert.equal(s.mouse, true);
  assert.ok(Math.abs(s.paddle - 320) < 2, 'the paddle follows the mouse: ' + s.paddle);
  await page.keyboard.press('Space');
  await step(page, 1);
  s = await state(page);
  assert.equal(s.launched, true);
  const by = s.by;
  await step(page, 20);
  assert.ok((await state(page)).by < by - 60, 'the ball flies up');
  assert.ok(await until(page, 's.bricks < 40', 60 * 10), 'bricks pop');
  assert.ok((await state(page)).score > 0);
  // A click on the field launches as well (on the next serve).
  await page.click('#btnPause');
  await page.click('#btnRestart');
  assert.equal((await state(page)).launched, false);
  await page.mouse.click(...Object.values(await page.evaluate(() => __game.point(640, 400))));
  await step(page, 1);
  assert.equal((await state(page)).launched, true, 'a click launches');
});

test('pause freezes everything, resume goes on, restart starts the level again', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await step(page, 90);
  await page.keyboard.press('Escape');
  let s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(await page.locator('#scrPause').isVisible(), true);
  const frozen = JSON.stringify([s.t, s.bx, s.by, s.paddle, s.score, s.bricks]);
  await page.keyboard.down('ArrowLeft');
  await step(page, 60);
  await page.keyboard.up('ArrowLeft');
  s = await state(page);
  assert.equal(JSON.stringify([s.t, s.bx, s.by, s.paddle, s.score, s.bricks]), frozen, 'paused: nothing moves');
  assert.ok(await stored(page), 'pausing saves');
  await page.click('#btnResume');
  assert.equal((await state(page)).screen, 'play');
  await step(page, 30);
  s = await state(page);
  assert.ok(s.t > JSON.parse(frozen)[0], 'time goes on');
  await page.keyboard.press('KeyP');
  assert.equal((await state(page)).screen, 'pause');
  await page.keyboard.press('KeyP');
  assert.equal((await state(page)).screen, 'play', 'P toggles');
  await page.keyboard.press('KeyP');
  await page.click('#btnRestart');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.t, 0);
  assert.equal(s.launched, false);
  assert.equal(s.score, 0);
  assert.equal(s.bricks, 40, 'the whole picture is back');
  // Home goes back to the title.
  await page.click('#btnPause');
  await page.click('#btnHome');
  assert.equal((await state(page)).screen, 'title');
});

test('winning level 1: the result card with stars, the next level, and progress that survives a reload', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter');
  await page.keyboard.down('ArrowLeft');
  await step(page, 12);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space');
  assert.ok(await until(page, 's.screen === "result"', 60 * 240), 'level 1 is won (its bubble floor never pops)');
  let s = await state(page);
  assert.equal(s.result.won, true);
  assert.ok(s.result.stars >= 1);
  assert.equal(await page.locator('#scrResult').isVisible(), true);
  assert.equal(await page.locator('#btnNext').isVisible(), true);
  await step(page, 120);
  assert.equal(await page.locator('#resStars .st.on').count(), s.result.stars, 'the stars come in one by one');
  const saved = await stored(page);
  assert.equal(saved.stars[0], s.result.stars);
  assert.ok(saved.best[0] > 0);
  assert.equal(saved.coach, true, 'moving and launching finishes the hint');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 2, 'Enter goes to the next level');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.bs.step);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleLevel b').textContent(), '2');
  assert.equal(await page.locator('#titleStars b').textContent(), String(saved.stars[0]));
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).level, 2, 'Play goes on from level 2');
});

test('losing the last life: the result card says so, Again plays the same level', async t => {
  const page = await game(t, { save: won(5) });
  await page.click('#btnPlay');
  let s = await state(page);
  assert.equal(s.level, 6);
  assert.equal(s.floor, 0, 'no bubble floor out in space');
  await page.keyboard.press('Space');
  await step(page, 5);
  // The last life and no help: the ball drops past a paddle parked in the far corner.
  await page.evaluate(() => {
    const w = __game.world;
    w.lives = 1; w.first = null; w.drop = 0; w.caps.length = 0; w.rings.length = 0;
    w.x[0] = 200; w.y[0] = 560; w.dx[0] = 0.1; w.dy[0] = 0.99;
  });
  await page.keyboard.down('ArrowRight');
  assert.ok(await until(page, 's.screen === "result"', 60 * 10));
  await page.keyboard.up('ArrowRight');
  s = await state(page);
  assert.equal(s.result.won, false);
  assert.equal(s.lives, 0);
  assert.equal(await page.locator('#resTitle').textContent(), 'أوبس!');
  assert.equal(await page.locator('#btnNext').isVisible(), false);
  assert.equal(await page.locator('#resStars').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btnAgain');
  assert.equal((await stored(page)).stars[5], 0, 'a loss gives no stars');
  await page.click('#btnAgain');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 6);
  assert.equal(s.lives, 3);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  assert.equal(await page.locator('#titleLevel b').textContent(), '6');
});

test('the level map opens won levels only; the shop dresses up with stars; endless opens after level 5', async t => {
  const page = await game(t, { save: won(2) });
  await page.click('#btnEndless');
  assert.equal((await state(page)).screen, 'title', 'endless is locked at first');
  await page.click('#btnLevels');
  assert.equal((await state(page)).screen, 'levels');
  assert.equal(await page.locator('#worlds .lvl.locked').count(), 13, 'levels 4-15 and endless are locked');
  await page.locator('#worlds .world').nth(0).locator('.lvl').nth(4).click();
  assert.equal((await state(page)).screen, 'levels', 'a locked level does not start');
  await page.locator('#worlds .world').nth(0).locator('.lvl').nth(1).click();
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 2, 'a won level can be played again');
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  // The shop: 4 stars buy the tennis ball, not the cat paddle.
  await page.click('#btnShop');
  assert.equal((await state(page)).screen, 'shop');
  await page.locator('#shopPaddles .item').nth(4).click();
  assert.equal((await stored(page)).paddle, 0, 'locked: nothing changes');
  await page.locator('#shopBalls .item').nth(1).click();
  assert.equal((await stored(page)).ball, 1);
  assert.equal(await page.locator('#shopBalls .item').nth(1).getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');

  const later = await game(t, { save: won(5) });
  await later.click('#btnEndless');
  s = await state(later);
  assert.equal(s.screen, 'play');
  assert.equal(s.mode, 'endless');
  await later.keyboard.press('Space');
  await step(later, 120);
  assert.equal((await state(later)).phase, 'play');
});

test('a save that fails says so and the game keeps going; Retry saves once storage works', async t => {
  const page = await game(t, { failSave: true });
  await page.click('#btnPlay');
  await page.keyboard.press('Space');
  await step(page, 30);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await stored(page), null);
  await page.click('#btnResume');
  await step(page, 30);
  assert.equal((await state(page)).screen, 'play', 'still playing');
  await page.evaluate(() => { bs.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.ok(await stored(page), 'saved after Retry');
});

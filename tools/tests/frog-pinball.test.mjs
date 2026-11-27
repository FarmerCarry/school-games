// Frog Pinball in real Chromium, with the frame loop stepped by hand: Enter and Play start
// level 1, real keys and mouse buttons move the flippers and the plunger, pause freezes the
// table, restart resets it, a won level and a lost one reach the result screen, the level
// map and the shop, a save that survives a reload, a save that fails, the statistics (reaction
// times only from a plunger press, free play's own difficulty), and no errors or network
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

const KEY = 'sg:frog-pinball:save';
// The game with its frame loop stepped by hand, and storage that can be made to fail.
async function game(t, { save, failSave = false, reduced = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, failSave, KEY }) => {
    if (!sessionStorage.getItem('fp-seeded')) {
      sessionStorage.setItem('fp-seeded', '1');
      if (save !== undefined) localStorage.setItem(KEY, JSON.stringify(save));
    }
    let kit;
    const fp = window.fp = { failSave, rt: [], cues: 0 };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      // the reaction times the game reports, and any cue it leaves for Kit to answer
      const { react, cue } = kit.track;
      kit.track.react = function (ms) { fp.rt.push(ms); return react.apply(this, arguments); };
      kit.track.cue = function () { fp.cues++; return cue.apply(this, arguments); };
      kit.loop = (update, render) => {
        fp.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        fp.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        fp.paint = () => render(0);
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key) === KEY && window.fp.failSave) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, failSave, KEY });
  await page.goto(`${server.origin}/games/frog-pinball/`);
  await page.waitForFunction(() => window.__game && window.fp.step);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const stored = page => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
const ddaSaved = page => page.evaluate(() => JSON.parse(localStorage.getItem('sg:frog-pinball:dda') || '{}'));
const step = (page, n) => page.evaluate(n => fp.step(n), n);
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; fp.run(3); }
      return ok(__game.state);
    } finally { fp.paint(); }
  }, { cond, max });
}
// Finishes the mission for real: the count one short, then the ball dropped on a bumper.
async function winByBumper(page) {
  await page.evaluate(() => {
    const w = __game.world, b = FP.mainBall(w), c = FP.TABLE.bumpers[2];
    w.bumps = w.L.goal - 1;
    b.st = 'live'; b.x = c[0]; b.y = c[1] - 60; b.vx = 0; b.vy = 100;
  });
}
// A ball straight down the drain, with the ball save over.
async function drain(page) {
  await page.evaluate(() => {
    const w = __game.world, b = w.balls.find(q => q.st === 'live') || FP.mainBall(w);
    w.saveT = 0; w.saveFor = 0;
    b.st = 'live'; b.x = 261; b.y = 712; b.vx = 0; b.vy = 500;
  });
}

test('Enter starts level 1 (a stray key or a click does not); ← flips, Space launches, P freezes the table, restart resets it', async t => {
  const page = await game(t);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  await page.keyboard.press('KeyX');
  await page.mouse.click(640, 420);
  await step(page, 5);
  assert.equal((await state(page)).screen, 'title', 'a stray key or a click on the table does not start');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 1);
  assert.equal(s.launched, false);
  assert.equal(s.hint, 1, 'the first-time hint shows');
  await step(page, 60);
  s = await state(page);
  assert.equal(s.flipL, 0.52, 'flippers only move with input');
  assert.equal(s.flipR, 0.52);
  await page.keyboard.down('ArrowLeft');
  await step(page, 8);
  assert.ok((await state(page)).flipL < 0, 'the left flipper is up');
  assert.equal((await state(page)).flipR, 0.52);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('KeyD');
  await step(page, 8);
  s = await state(page);
  assert.equal(s.flipL, 0.52, 'and back down');
  assert.ok(s.flipR < 0, 'D is the right flipper');
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Space');
  await step(page, 30);
  s = await state(page);
  assert.equal(s.launched, true, 'a tap of Space launches');
  assert.ok(s.by < 600);
  assert.equal(s.hint, 2, 'then the flipper hint');
  await page.keyboard.press('ArrowRight');
  await step(page, 2);
  assert.equal((await state(page)).hint, 0, 'gone after the first flip');
  assert.equal((await stored(page)).coach, true);
  await step(page, 60);
  await page.keyboard.press('KeyP');
  s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(await page.locator('#scrPause').isVisible(), true);
  const frozen = JSON.stringify([s.t, s.bx, s.by, s.score, s.flipL]);
  await page.keyboard.down('ArrowLeft');
  await step(page, 60);
  await page.keyboard.up('ArrowLeft');
  s = await state(page);
  assert.equal(JSON.stringify([s.t, s.bx, s.by, s.score, s.flipL]), frozen, 'paused: nothing moves');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play');
  await step(page, 30);
  assert.ok((await state(page)).t > JSON.parse(frozen)[0], 'resumed');
  await page.click('#btnPause');
  assert.equal((await state(page)).screen, 'pause');
  await page.click('#btnResume');
  assert.equal((await state(page)).screen, 'play');
  await page.keyboard.press('Escape');
  await page.click('#btnRestart');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.score, 0);
  assert.ok(s.t < 2);
  assert.equal(s.launched, false);
  assert.equal(s.level, 1);
  // home from the pause menu
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  assert.equal((await state(page)).screen, 'title');
});

test('Play on a first visit goes straight into level 1; the mouse buttons flip and a click on the lane pulls the plunger', async t => {
  const page = await game(t, { reduced: false });
  await page.click('#btnPlay');
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 1);
  // the left button on the plunger lane while a ball waits: a pull and a launch
  const lane = await page.evaluate(() => __game.point(FP.X0 + 528, 660));
  await page.mouse.move(lane.x, lane.y);
  await page.mouse.down();
  await step(page, 30);
  assert.equal((await state(page)).launched, false, 'pulling');
  await page.mouse.up();
  await step(page, 20);
  assert.equal((await state(page)).launched, true, 'launched on release');
  const mid = await page.evaluate(() => __game.point(640, 420));
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await step(page, 8);
  s = await state(page);
  assert.ok(s.flipL < 0, 'left button: left flipper');
  assert.equal(s.flipR, 0.52);
  await page.mouse.up();
  await page.mouse.down({ button: 'right' });
  await step(page, 8);
  s = await state(page);
  assert.ok(s.flipR < 0, 'right button: right flipper');
  assert.equal(s.flipL, 0.52, 'left one back down');
  await page.mouse.up({ button: 'right' });
  // both together
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await step(page, 8);
  s = await state(page);
  assert.ok(s.flipL < 0 && s.flipR < 0, 'both buttons, both flippers');
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  // a click that comes and goes between two frames still flips
  await page.mouse.click(mid.x, mid.y);
  await step(page, 1);
  assert.ok((await state(page)).flipL < 0.52);
  // with motion allowed the table plays for a while with no errors
  await step(page, 600);
  assert.equal((await state(page)).screen, 'play');
});

test('a won level: the celebration, the result with stars and a new best, Enter goes on; the save survives a reload', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  await page.keyboard.press('Space');
  await step(page, 40);
  await winByBumper(page);
  assert.ok(await until(page, 's.over === "win"', 120), 'the bumper hit finishes the mission');
  let s = await state(page);
  assert.equal(s.screen, 'play', 'the celebration plays on the table first');
  assert.equal(s.mission, 10);
  assert.ok(await until(page, 's.screen === "result"', 60 * 4));
  s = await state(page);
  assert.equal(s.result, 'win');
  assert.equal(await page.locator('#resTitle').textContent(), 'أحسنت!');
  const on = await page.locator('#resStars svg.on').count();
  assert.ok(on >= 1 && on <= 3, 'stars ' + on);
  assert.equal(await page.locator('#live').textContent(), 'أحسنت! ' + ['نجمة واحدة', 'نجمتان', '3 نجوم'][on - 1], 'the stars counted the Arabic way');
  assert.equal(await page.locator('#resNew').isVisible(), true, 'a new best');
  assert.equal(await page.locator('#btnNext').isVisible(), true);
  assert.equal(await page.locator('#btnAgain').isVisible(), true);
  assert.equal(await page.locator('#btnMenu').isVisible(), true);
  const saved = await stored(page);
  assert.equal(saved.stars[0], on);
  assert.ok(saved.best[0] > 0);
  await step(page, 120);
  assert.equal((await state(page)).screen, 'result', 'the result waits for the child');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 2);
  assert.equal(s.score, 0);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.fp.step);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleLevel b').textContent(), '2');
  assert.equal(await page.locator('#titleStars b').textContent(), String(on));
  // Play now goes to level 2
  await page.keyboard.press('Space');
  assert.equal((await state(page)).level, 2);
});

test('a lost level: three drained balls end it, no Next; R plays again; free play ends with a best', async t => {
  const page = await game(t, { save: { v: 1, stars: [2, 2, 1, 0, 0, 0, 0, 0, 0, 0], best: [9000, 8000, 7000, 0, 0, 0, 0, 0, 0, 0], skin: 0, theme: 0, coach: true, seen: 0 } });
  await page.keyboard.press('Enter');
  let s = await state(page);
  assert.equal(s.level, 4, 'Play goes to the first level not yet won');
  assert.equal(s.hint, 0, 'no hint once the coach is done');
  for (let i = 0; i < 3; i++) {
    assert.ok(await until(page, 's.launched && s.live > 0', 60 * 6), 'ball ' + i + ' launches by itself');
    await step(page, 20);
    await drain(page);
    assert.ok(await until(page, `s.drains === ${i + 1}`, 120));
  }
  s = await state(page);
  assert.equal(s.balls, 0);
  assert.equal(s.over, 'lose');
  assert.ok(await until(page, 's.screen === "result"', 60 * 3));
  assert.equal(await page.locator('#resTitle').textContent(), 'انتهت الكرات!');
  assert.equal(await page.locator('#btnNext').isVisible(), false);
  assert.equal(await page.locator('#resStars svg.on').count(), 0);
  assert.equal((await stored(page)).stars[3], 0);
  const main = (await ddaSaved(page)).main;
  assert.deepEqual(main, [0.224, 1], 'a lost mission is one result for the missions (0.35 + 0.18 × (0 - 0.7))');
  await page.keyboard.press('KeyR');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 4);
  assert.equal(s.score, 0);
  assert.equal(s.balls, 3);
  // free play from the level map
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.click('#btnLevels');
  await page.click('#levelGrid button:nth-child(10)');
  s = await state(page);
  assert.equal(s.level, 10);
  assert.equal(await page.locator('#live').textContent(), 'لعب حر: أعلى نتيجة!', 'the label once, not twice');
  for (let i = 0; i < 3; i++) {
    assert.ok(await until(page, 's.launched && s.live > 0', 60 * 6));
    await page.evaluate(() => { __game.world.score += 1234; });
    await drain(page);
    assert.ok(await until(page, `s.drains === ${i + 1}`, 120));
  }
  assert.ok(await until(page, 's.screen === "result"', 60 * 3));
  assert.equal((await state(page)).result, 'end');
  assert.equal(await page.locator('#resStars').isVisible(), false, 'free play has no stars');
  assert.equal((await stored(page)).best[9], (await state(page)).score);
  const dda = await ddaSaved(page);
  assert.deepEqual(dda.main, main, 'free play leaves the missions\' difficulty alone');
  assert.equal(dda.free[1], 1, 'free play has a difficulty of its own');
  assert.ok(dda.free[0] < 0.35, 'balls that went quickly make free play gentler');
  await page.click('#btnMenu');
  assert.equal((await state(page)).screen, 'title');
});

test('a reaction time is the plunger press for a ball waiting after a drain: not a flip, a first ball, a saved ball or a ball that went by itself', async t => {
  const page = await game(t, { save: { v: 1, stars: [2, 2, 1, 0, 0, 0, 0, 0, 0, 0], best: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], skin: 0, theme: 0, coach: true, seen: 0 } });
  const rt = () => page.evaluate(() => fp.rt.slice());
  await page.keyboard.press('Enter');
  await step(page, 20);
  await page.keyboard.press('Space');
  await step(page, 30);
  assert.equal((await state(page)).launched, true);
  assert.deepEqual(await rt(), [], 'the first ball of a round is no reaction');
  // a drained ball: the next one waits; a flip does not answer it, the plunger press does
  await drain(page);
  assert.ok(await until(page, 's.drains === 1 && !s.launched && s.by > 600', 120), 'the next ball waits');
  await step(page, 30);
  await page.keyboard.press('ArrowLeft');
  await step(page, 30);
  assert.deepEqual(await rt(), [], 'a flip is no answer');
  await page.keyboard.press('Space');
  await step(page, 30);
  assert.equal((await state(page)).launched, true);
  let times = await rt();
  assert.equal(times.length, 1);
  assert.ok(times[0] > 900 && times[0] < 1100, 'about a second: ' + times[0]);
  // a saved ball goes by itself, whatever the child presses
  await page.evaluate(() => { const w = __game.world, b = w.balls.find(q => q.st === 'live'); w.saveT = 5; b.x = 261; b.y = 712; b.vx = 0; b.vy = 500; });
  assert.ok(await until(page, 's.saves === 1', 60));
  await page.keyboard.press('Space');
  await step(page, 30);
  assert.equal((await state(page)).launched, true);
  // a ball that launches by itself is no reaction either
  await drain(page);
  assert.ok(await until(page, 's.drains === 2 && !s.launched && s.by > 600', 120));
  assert.ok(await until(page, 's.launched', 60 * 4), 'it launches by itself');
  await page.keyboard.press('Space');
  await step(page, 10);
  assert.equal((await rt()).length, 1, 'still the one reaction time');
  assert.equal(await page.evaluate(() => fp.cues), 0, 'no cue for Kit to answer with any key');
});

test('the level map and the shop: locked levels stay shut, skins and pond colours cost stars and are kept', async t => {
  const page = await game(t, { save: { v: 1, stars: [3, 3, 1, 0, 0, 0, 0, 0, 0, 0], best: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0], skin: 0, theme: 0, coach: true, seen: 0 } });
  assert.equal(await page.locator('#shopDot').isVisible(), true, 'new things to see in the shop');
  await page.click('#btnLevels');
  assert.equal((await state(page)).screen, 'levels');
  assert.equal(await page.locator('#levelGrid button.locked').count(), 5, 'levels 5 to 9 are locked');
  await page.click('#levelGrid button:nth-child(6)');
  assert.equal((await state(page)).screen, 'levels', 'a locked level does not start');
  await page.click('#levelGrid button:nth-child(3)');
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 3);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.click('#btnShop');
  assert.equal((await state(page)).screen, 'shop');
  assert.equal(await page.locator('#shopDot').isVisible(), false);
  assert.equal(await page.locator('#skinGrid button:nth-child(4)').getAttribute('aria-label'), 'دعسوقة، 9 نجوم');
  assert.equal(await page.locator('#skinGrid button:nth-child(5)').getAttribute('aria-label'), 'كوكب صغير، 13 نجمة');
  await page.click('#skinGrid button:nth-child(4)');
  assert.equal((await stored(page)).skin, 0, 'the ladybug needs 9 stars');
  await page.click('#skinGrid button:nth-child(3)');
  assert.equal((await stored(page)).skin, 2, 'the eyeball for 5 stars');
  await page.click('#themeGrid button:nth-child(3)');
  assert.equal((await stored(page)).theme, 0, 'the candy pond needs 15 stars');
  await page.click('#themeGrid button:nth-child(2)');
  assert.equal((await stored(page)).theme, 1, 'the night pond for 7 stars');
  s = await state(page);
  assert.deepEqual([s.skin, s.theme, s.stars], [2, 1, 7]);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.fp.step);
  s = await state(page);
  assert.deepEqual([s.skin, s.theme], [2, 1], 'kept after a reload');
});

test('a save that fails says so and the game keeps going; Retry saves once storage works', async t => {
  const page = await game(t, { failSave: true });
  await page.click('#btnPlay');
  await page.keyboard.press('Space');
  await step(page, 60);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await stored(page), null);
  await page.keyboard.press('Escape');
  await step(page, 30);
  assert.equal((await state(page)).screen, 'play', 'still playing');
  await page.evaluate(() => { fp.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.notEqual(await stored(page), null);
});

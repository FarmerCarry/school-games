// Bonk Garden in real Chromium: real keys and clicks bonk critters, pause freezes the
// garden, restart starts over, a won and a lost round reach the result screen, the levels
// and hammers screens, the endless garden, double clicks, the hammer starting at the
// pointer, saves that survive a reload or fail, a round kept (and reported once) from the
// moment it is decided even when the outro is cut short, R that never throws a round away
// where it is a hole key, and no errors or network requests at any point.
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

const KEY = 'sg:bonk-garden:save';
const blank = () => ({ v: 1, stars: Array(12).fill(0), best: Array(12).fill(0), endless: 0, hammer: 0, coach: true, keys: false, rounds: 0 });
// The game with its frame loop stepped by hand, and storage that can be made to fail.
async function game(t, { save, failSave = false, reduced = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, failSave, KEY }) => {
    if (!sessionStorage.getItem('bg-seeded')) {
      sessionStorage.setItem('bg-seeded', '1');
      if (save !== undefined) localStorage.setItem(KEY, JSON.stringify(save));
    }
    let kit;
    const bg = window.bg = { failSave };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        bg.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        bg.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        bg.paint = () => render(0);
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key) === KEY && window.bg.failSave) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, failSave, KEY });
  await page.goto(`${server.origin}/games/bonk-garden/`);
  await page.waitForFunction(() => window.__game && window.bg.step);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const stored = page => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
const step = (page, n) => page.evaluate(n => bg.step(n), n);
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; bg.run(3); }
      return ok(__game.state);
    } finally { bg.paint(); }
  }, { cond, max });
}
// A player that clicks every critter that is up (never the bunny) until cond holds.
async function bonkUntil(page, cond, max = 60 * 45) {
  for (let f = 0; f < max; f += 4) {
    const r = await page.evaluate(cond => {
      if (new Function('s', 'return (' + cond + ');')(__game.state)) return { done: true };
      bg.step(4);
      const w = __game.world;
      if (!w || w.phase !== 'play') return {};
      for (let i = 0; i < w.holes.length; i++) { const c = w.holes[i].c; if (c && c.st === 'up' && c.kind !== 'bunny') return { at: __game.hole(i) }; }
      return {};
    }, cond);
    if (r.done) return true;
    if (r.at) await page.mouse.click(r.at.x, r.at.y);
  }
  return false;
}

test('Enter starts; a hole key swings; a click bonks a critter; Esc pauses and freezes the garden; restart resets', async t => {
  const page = await game(t, { save: blank() });
  let s = await state(page);
  assert.equal(s.screen, 'title');
  // Only Play (or Enter/Space) starts: not a stray click or another key.
  await page.mouse.click(1000, 520);
  await page.keyboard.press('F2');
  await step(page, 10);
  assert.equal((await state(page)).screen, 'title');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.deepEqual([s.level, s.holes, s.score, s.swings], [1, 9, 0, 0]);
  const ham = await page.evaluate(() => { const h = __game.ham; return __game.point(h.x, h.y); });
  assert.deepEqual([Math.round(ham.x), Math.round(ham.y)], [1000, 520], 'the hammer starts where the pointer is');
  await step(page, 60);
  assert.equal((await state(page)).swings, 0, 'nothing swings without input');
  await page.keyboard.press('KeyS');
  await step(page, 1);
  assert.equal((await state(page)).swings, 1, 'the S key swings at the middle hole');
  assert.ok(await until(page, 's.up > 0', 60 * 5));
  const at = await page.evaluate(() => { const w = __game.world; const i = w.holes.findIndex(h => h.c && (h.c.st === 'up' || h.c.st === 'rise')); return __game.hole(i); });
  // The S swing may have bonked a critter that was already up in the middle hole (random seed).
  const before = await state(page);
  await page.mouse.click(at.x, at.y);
  await step(page, 1);
  s = await state(page);
  assert.equal(s.swings, 2);
  assert.equal(s.bonks - before.bonks, 1, 'the click bonked the critter');
  assert.equal(s.score - before.score, 1);
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(await page.locator('#scrPause').isVisible(), true);
  const frozen = JSON.stringify([s.t, s.score, s.swings, s.up]);
  await page.keyboard.down('KeyD');
  await step(page, 60);
  await page.keyboard.up('KeyD');
  s = await state(page);
  assert.equal(JSON.stringify([s.t, s.score, s.swings, s.up]), frozen, 'paused: the garden does not move');
  assert.equal((await stored(page)).rounds, 1, 'pausing saves');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play');
  await step(page, 30);
  assert.ok((await state(page)).t > JSON.parse(frozen)[0], 'resumed');
  await page.keyboard.press('KeyP');
  await page.click('#btnRestart');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.deepEqual([s.swings, s.score, s.t], [0, 0, 0]);
});

test('a first round from #btnPlay is won by clicking critters: stars, Next, the coach ends, and a reload keeps it all', async t => {
  const page = await game(t, { save: undefined, reduced: false });
  const play = await page.locator('#btnPlay').boundingBox();
  await page.click('#btnPlay');
  let s = await state(page);
  assert.equal(s.screen, 'play');
  const ham = await page.evaluate(() => { const h = __game.ham; return __game.point(h.x, h.y); });
  assert.ok(Math.abs(ham.x - (play.x + play.width / 2)) < 2 && Math.abs(ham.y - (play.y + play.height / 2)) < 2, 'the hammer starts on Play, under the hidden pointer');
  assert.equal(s.coach, false);
  await until(page, 's.hint >= 0', 60 * 4);
  assert.ok((await state(page)).hint >= 0, 'the first round shows the hand over a critter');
  assert.ok(await bonkUntil(page, 's.screen === "result"'));
  s = await state(page);
  assert.ok(s.stars >= 1, 'won with ' + s.score);
  assert.equal(s.coach, true);
  assert.equal(await page.locator('#resStars .on').count(), s.stars);
  assert.equal(await page.locator('#btnNext').isVisible(), true);
  const saved = await stored(page);
  assert.equal(saved.stars[0], s.stars);
  assert.equal(saved.best[0], s.score);
  assert.equal(saved.coach, true);
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).screen, 'result', 'Enter right away is debounced on Result');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'result', 'Space right away is debounced on Result');
  await step(page, 40);
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.deepEqual([s.screen, s.level, s.score], ['play', 2, 0], 'Enter goes on to level 2 after debounce');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.bg.step);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), String(saved.stars[0]));
  assert.equal(await page.locator('#titleLevel b').textContent(), '2');
});

test('a round with no input is lost: try again, no Next, and Enter plays the same level again', async t => {
  const page = await game(t, { save: blank() });
  await page.click('#btnPlay');
  assert.ok(await until(page, 's.screen === "result"', 60 * 34));
  const s = await state(page);
  assert.deepEqual([s.score, s.stars, s.swings], [0, 0, 0]);
  assert.equal(await page.locator('#resTitle').textContent(), 'حاول مرة أخرى!');
  assert.equal(await page.locator('#resSub').textContent(), 'تحتاج 5 نقاط لنجمة');
  assert.equal(await page.locator('#btnNext').isVisible(), false);
  assert.equal((await stored(page)).stars[0], 0);
  await step(page, 40);
  await page.keyboard.press('Enter');
  const again = await state(page);
  assert.deepEqual([again.screen, again.level, again.t], ['play', 1, 0]);
});

test('the levels screen: locked levels stay shut, level 4 opens from it and the bunny costs 3', async t => {
  const save = blank(); save.stars[0] = 2; save.stars[1] = 1; save.stars[2] = 1;
  const page = await game(t, { save });
  await page.click('#btnLevels');
  assert.equal((await state(page)).screen, 'levels');
  assert.equal(await page.locator('.lvl.locked').count(), 8);
  await page.locator('.lvl').nth(5).click();
  assert.equal((await state(page)).screen, 'levels', 'a locked level does not start');
  await page.locator('.lvl').nth(3).click();
  let s = await state(page);
  assert.deepEqual([s.screen, s.level], ['play', 4]);
  await page.evaluate(() => {
    const w = __game.world; w.score = 5; w.combo = 4;
    w.holes[0].c = { id: 999, kind: 'bunny', st: 'up', t: 0, stay: 99, hp: 1, helmet: false, hops: 0, free: false, wind: 0, mood: 0, born: 0 };
  });
  const at = await page.evaluate(() => __game.hole(0));
  await page.mouse.click(at.x, at.y);
  await step(page, 1);
  s = await state(page);
  assert.deepEqual([s.score, s.combo, s.ouches], [2, 0, 1], 'آخ! −3 and the combo is gone');
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  assert.equal((await state(page)).screen, 'title');
  await page.click('#btnLevels');
  assert.equal(await page.locator('.lvl').nth(0).getAttribute('aria-label'), 'المرحلة 1، نجمتان');
  assert.equal(await page.locator('.lvl').nth(1).getAttribute('aria-label'), 'المرحلة 2، نجمة واحدة');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');
});

test('a double click on a critter is one bonk, never a miss: the combo and the frenzy jar stay', async t => {
  const save = blank(); save.stars[0] = 1; save.stars[1] = 1;
  const page = await game(t, { save });
  await page.click('#btnLevels');
  await page.locator('.lvl').nth(2).click();
  assert.deepEqual(await page.evaluate(() => [__game.state.level, __game.world.spec.whiffBreaks]), [3, true]);
  await page.evaluate(() => {
    const miss = Kit.track.miss; window.misses = 0;
    Kit.track.miss = function () { window.misses++; return miss.apply(this, arguments); };
    const w = __game.world; w.spec.gap = 1e6; w.combo = 4;
    w.holes.forEach(h => { h.c = null; });
    w.holes[7].c = { id: 998, kind: 'potato', st: 'up', t: 0, stay: 99, hp: 1, helmet: false, hops: 0, free: false, wind: 0, mood: 0, born: 0 };
  });
  const at = await page.evaluate(() => __game.hole(7));
  await page.mouse.dblclick(at.x, at.y);
  await step(page, 1);
  await step(page, 6);
  await page.mouse.click(at.x, at.y);
  await step(page, 1);
  const s = await state(page);
  assert.deepEqual([s.combo, s.bonks, s.whiffs, s.swings, s.score], [5, 1, 0, 3, 1]);
  assert.equal(await page.evaluate(() => window.misses), 0, 'no miss for the statistics');
});

test('a lost later level asks for its goal in good Arabic', async t => {
  const save = blank(); save.stars.fill(1, 0, 5);
  const page = await game(t, { save });
  await page.click('#btnLevels');
  await page.locator('.lvl').nth(5).click();
  await page.evaluate(() => { __game.world.t = __game.world.spec.dur - 0.1; });
  assert.ok(await until(page, 's.screen === "result"', 60 * 3));
  assert.equal(await page.locator('#resSub').textContent(), 'تحتاج 11 نقطة لنجمة');
});

test('the hammers: an unlocked one is worn and saved, a locked one is not', async t => {
  const save = blank(); save.stars[0] = 3;
  const page = await game(t, { save });
  await page.click('#btnHammers');
  assert.equal((await state(page)).screen, 'hammers');
  assert.equal(await page.locator('.ham.locked').count(), 6);
  await page.locator('.ham').nth(1).click();
  assert.equal((await stored(page)).hammer, 1);
  assert.equal((await state(page)).hammer, 'chicken');
  await page.locator('.ham').nth(7).click();
  assert.equal((await stored(page)).hammer, 1, 'the golden hammer needs 31 stars');
  assert.equal(await page.locator('.ham').nth(2).getAttribute('aria-label'), 'الخبز الطويل، تحتاج 7 نجوم');
  assert.equal(await page.locator('.ham').nth(7).getAttribute('aria-label'), 'المطرقة الذهبية، تحتاج 31 نجمة');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');
});

test('the endless garden: 4 by 3, three hearts, and critters that get away end it', async t => {
  const save = blank(); save.stars = [3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0];
  const page = await game(t, { save });
  await page.click('#btnLevels');
  await page.click('#btnEndless');
  let s = await state(page);
  assert.deepEqual([s.screen, s.level, s.holes, s.hearts], ['play', 0, 12, 3]);
  await page.keyboard.press('KeyV');
  await step(page, 1);
  assert.equal((await state(page)).swings, 1, 'V is the front right hole of the 4 by 3 garden');
  assert.ok(await until(page, 's.screen === "result"', 60 * 60));
  s = await state(page);
  assert.equal(s.hearts, 0);
  assert.equal(await page.locator('#resTitle').textContent(), 'انتهت القلوب!');
  assert.equal(await page.locator('#btnNext').isVisible(), false);
});

test('a save that fails says so and the game keeps going; Retry saves once storage works', async t => {
  const page = await game(t, { failSave: true });
  await page.click('#btnPlay');
  await step(page, 30);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'pause');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await stored(page), null);
  await page.keyboard.press('Space');
  await step(page, 30);
  assert.equal((await state(page)).screen, 'play', 'the game keeps going');
  await page.evaluate(() => { bg.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal((await stored(page)).rounds, 1);
});

// Records Kit.stats.round/end calls as 'round:L1', 'end:win'...; dda() is how many results
// this PC's difficulty has had.
async function watchStats(page) {
  await page.evaluate(() => {
    const log = window.statsLog = [];
    for (const k of ['round', 'end']) { const f = Kit.stats[k]; Kit.stats[k] = function (id) { log.push(k + ':' + id); return f.apply(this, arguments); }; }
  });
}
const statsLog = page => page.evaluate(() => window.statsLog.slice());
const ddaResults = page => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('sg:bonk-garden:dda') || '{}'); return d.main ? d.main[1] : 0; });
// Ends the round with this score: time runs out a few frames later and the outro starts.
async function decideRound(page, goal) {
  await page.evaluate(goal => { const w = __game.world; w.score = w.spec.goals[goal]; w.t = w.spec.dur - 0.05; }, goal);
  assert.ok(await until(page, 's.phase === "over"', 30));
  assert.equal((await state(page)).screen, 'play', 'the outro is still playing');
}

test('a round is kept from the moment it is decided: a pause, Home or Restart during the outro still save it and report it once', async t => {
  const page = await game(t, { save: blank() });
  await watchStats(page);
  await page.click('#btnPlay');
  await decideRound(page, 2);
  const score = (await state(page)).score;
  // a blur (another window) pauses during «انتهى الوقت!», and the child goes Home
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).screen, 'pause');
  await page.click('#btnHome');
  assert.equal((await state(page)).screen, 'title');
  assert.deepEqual(await statsLog(page), ['round:L1', 'end:win'], 'a win, not a quit');
  assert.equal(await ddaResults(page), 1);
  let saved = await stored(page);
  assert.deepEqual([saved.stars[0], saved.best[0]], [3, score]);
  assert.equal(await page.evaluate(() => BG.hammerOpen(__game.save, 1)), true, 'the rubber chicken is unlocked');
  // a pause in the outro, then Resume: the result shows, still reported once
  await page.click('#btnPlay');
  assert.equal((await state(page)).level, 2);
  await decideRound(page, 0);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'pause');
  await page.keyboard.press('Space');
  assert.ok(await until(page, 's.screen === "result"', 60 * 3));
  assert.equal(await page.locator('#resStars .on').count(), 1);
  assert.deepEqual(await statsLog(page), ['round:L1', 'end:win', 'round:L2', 'end:win']);
  assert.equal(await ddaResults(page), 2);
  // Restart during the outro starts a new try without a quit
  await step(page, 40);
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).level, 3);
  await decideRound(page, 1);
  await page.keyboard.press('Escape');
  await page.click('#btnRestart');
  assert.deepEqual([(await state(page)).screen, (await state(page)).level], ['play', 3]);
  saved = await stored(page);
  assert.deepEqual(saved.stars.slice(0, 3), [3, 1, 2]);
  // leaving a round that is still going is a quit
  await step(page, 10);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  assert.deepEqual(await statsLog(page), ['round:L1', 'end:win', 'round:L2', 'end:win', 'round:L3', 'end:win', 'round:L3', 'end:quit']);
  assert.equal(await ddaResults(page), 3, 'one result per decided round, none for the quit');
});

test('R, the top right hole of the 4 by 3 gardens, never throws a round away; in the 3 by 3 garden it still restarts', async t => {
  const save = blank(); save.stars.fill(1, 0, 4);
  const page = await game(t, { save });
  await page.click('#btnLevels');
  await page.locator('.lvl').nth(4).click();
  let s = await state(page);
  assert.deepEqual([s.screen, s.level, s.holes], ['play', 5, 12]);
  await step(page, 30);
  await page.keyboard.press('Escape');
  const t0 = (await state(page)).t;
  await page.keyboard.press('KeyR');
  s = await state(page);
  assert.deepEqual([s.screen, s.t], ['pause', t0], 'R on the pause screen is only a hole key here');
  await page.keyboard.press('Space');
  await decideRound(page, 0);
  assert.ok(await until(page, 's.screen === "result"', 60 * 3));
  await page.keyboard.press('KeyR');
  assert.equal((await state(page)).screen, 'result', 'a child still hammering R sees the result first');
  assert.equal(await page.locator('#btnNext').isVisible(), true);
  await step(page, 40);
  await page.keyboard.press('KeyR');
  s = await state(page);
  assert.deepEqual([s.screen, s.level, s.t], ['play', 5, 0], 'then R plays again');
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.click('#btnLevels');
  await page.locator('.lvl').nth(0).click();
  await step(page, 30);
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyR');
  s = await state(page);
  assert.deepEqual([s.screen, s.level, s.holes, s.t], ['play', 1, 9, 0]);
});

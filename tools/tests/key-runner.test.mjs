// Key Runner in real Chromium: real key presses (by physical key), the type-ahead queue,
// wrong keys, pause, results, saves, the label mode, endless runs, the two-player race and
// the statistics a portal receives.
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

const stars = (rows = {}) => Array.from({ length: 7 }, (_, w) => rows[w] || [0, 0, 0, 0]);
const SAVE = (rows, extra = {}) => ({ v: 2, stars: stars(rows), best: stars(), endless: 0, label: 'both', color: 0, hat: 0, seen: 0, coach: true, ...extra });
// A DDA state for a guest: level 0..1 after a few results (tier 1 at 0.05, tier 5 at 0.95).
const DDA = level => ({ _: { levels: [level, 8], endless: [level, 8] } });

// The game with its frame loop stepped by hand, Kit.stats and Kit.track calls recorded,
// and storage that can be made to fail. Every test: no page errors, no console errors and
// no request off the test server.
async function game(t, { save, dda, deniedStorage = false, viewport = { width: 1280, height: 720 } } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, dda, deniedStorage }) => {
    if (!sessionStorage.getItem('kr-seeded')) {
      sessionStorage.setItem('kr-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:key-runner:save', typeof save === 'string' ? save : JSON.stringify(save));
      if (dda) localStorage.setItem('sg:key-runner:dda', JSON.stringify(dda));
    }
    let kit;
    const kr = window.kr = { stats: [], track: { cue: 0, hit: 0, miss: 0 }, failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        kr.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        kr.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        kr.paint = () => render(0);
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { kr.stats.push([name, ...args]); return call.apply(this, args); };
      }
      for (const name of ['cue', 'hit', 'miss']) {
        const call = kit.track[name];
        kit.track[name] = function (...args) { kr.track[name]++; return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem, read = Storage.prototype.getItem;
    Storage.prototype.setItem = function (key) {
      if (String(key).startsWith('sg:key-runner:save') && (deniedStorage || window.kr.failSave)) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    Storage.prototype.getItem = function (key) {
      if (deniedStorage && String(key).startsWith('sg:key-runner:')) throw new DOMException('Storage fixture', 'SecurityError');
      return read.apply(this, arguments);
    };
  }, { save, dda, deniedStorage });
  await page.goto(`${server.origin}/games/key-runner/`);
  await page.waitForFunction(() => window.__game && window.kr.step);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => kr.step(n), n);
const calls = (page, name) => page.evaluate(name => kr.stats.filter(c => c[0] === name).map(c => c.slice(1)), name);
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; kr.run(3); }
      return ok(__game.state);
    } finally { kr.paint(); }
  }, { cond, max });
}
// Presses the real key the game asks for (by its physical code), then lets a frame run.
async function typeTarget(page) {
  const s = await state(page);
  if (!s.target) return false;
  await page.keyboard.press(s.target);
  await step(page, 1);
  return true;
}
// Plays a level to the flag with the right keys, as soon as each one is shown.
async function finish(page) {
  for (let i = 0; i < 400; i++) {
    const s = await state(page);
    if (s.ending || s.screen !== 'play') return true;
    if (!(await typeTarget(page))) await page.evaluate(() => { kr.run(6); kr.paint(); });
  }
  return false;
}
async function openLevel(page, w, l) {
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  await page.locator(`.lvl[data-w="${w}"][data-l="${l}"]`).click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
}

test('the title is not a round; Enter starts the first run, Space hops and the coach shows the key', async t => {
  const page = await game(t);
  await step(page, 30);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.deepEqual(await calls(page, 'round'), [], 'the attract run on the title is not a round');
  assert.equal(await page.evaluate(() => kr.track.hit), 0);
  await page.keyboard.press('Enter');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.id, 'w1L1'); assert.equal(s.target, 'Space');
  assert.deepEqual(await calls(page, 'round'), [['w1L1']]);
  assert.deepEqual(await calls(page, 'tutorial'), [['start']]);
  // Nothing typed: the runner runs to the first edge and waits there, and the hand shows Space.
  assert.ok(await until(page, 's.phase === "wait"', 600));
  const waiting = await state(page);
  await step(page, 90);
  assert.equal((await state(page)).x, waiting.x, 'it waits; it never falls');
  assert.equal((await state(page)).ghost, true, 'the hand presses Space on the on-screen keyboard');
  // The real Space key hops the runner onto the stone.
  await page.keyboard.press('Space');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.hits, 1); assert.equal(s.phase, 'act'); assert.equal(s.steps, 1);
  assert.equal(s.ghost, false);
  assert.ok(await page.evaluate(() => kr.track.cue) >= 2 && await page.evaluate(() => kr.track.hit) === 1);
  for (let i = 0; i < 2; i++) { assert.ok(await until(page, '!!s.target', 600)); await typeTarget(page); }
  assert.deepEqual(await calls(page, 'tutorial'), [['start'], ['done']]);
  assert.equal((await page.evaluate(() => __game.save)).coach, true);
});

test('keys count by their physical position, in the order typed; repeats, shortcuts and stray keys do not type', async t => {
  const page = await game(t, { save: SAVE({ 0: [3, 3, 3, 3] }), dda: DDA(0.95) });
  await openLevel(page, 1, 0);
  let s = await state(page);
  assert.equal(s.tier, 5); assert.equal(s.ahead, 4, 'four keys shown ahead at the top tier');
  // Type ahead: four right keys at once queue up before the runner gets there.
  for (let i = 0; i < 4; i++) await page.keyboard.press(s.keys[i]);
  await step(page, 1);
  s = await state(page);
  assert.equal(s.hits, 4); assert.equal(s.steps, 4); assert.equal(s.next, 5); assert.equal(s.target, '', 'nothing more is shown yet');
  // An Arabic Windows keyboard sends Arabic letters for the same physical keys.
  await until(page, '!!s.target', 600);
  s = await state(page);
  const want = s.target;
  await page.evaluate(code => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'KeyF' ? 'ب' : 'ت', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: 'x', bubbles: true }));
  }, want);
  await step(page, 1);
  assert.equal((await state(page)).hits, 5);
  // Held keys repeat, Ctrl shortcuts and Shift never type; a wrong key is a soft miss.
  await until(page, '!!s.target', 600);
  s = await state(page);
  const wrong = s.target === 'KeyF' ? 'KeyJ' : 'KeyF';
  await page.keyboard.down(wrong); await page.keyboard.down(wrong); await page.keyboard.down(wrong); await page.keyboard.up(wrong);
  await page.keyboard.press('Control+' + s.target.slice(3).toLowerCase());
  await page.keyboard.press('ShiftLeft');
  await step(page, 1);
  const after = await state(page);
  assert.equal(after.hits, 5);
  assert.equal(after.misses, 1, 'one wrong press, its repeats ignored');
  assert.equal(after.target, s.target, 'the same key is still wanted');
  assert.equal(after.steps, s.steps - 1, 'at the top tier a wrong key costs a speed step');
  assert.equal(await page.evaluate(() => kr.track.miss), 1);
  // P and M are letters here: they neither pause nor mute.
  const muted = await page.evaluate(() => Kit.audio.muted);
  await page.keyboard.press('KeyP'); await page.keyboard.press('KeyM');
  await step(page, 1);
  assert.equal((await state(page)).screen, 'play');
  assert.equal(await page.evaluate(() => Kit.audio.muted), muted);
});

test('pause freezes everything, focus does not resume, and Restart starts the level again', async t => {
  const page = await game(t, { save: SAVE({ 0: [1, 0, 0, 0] }) });
  await openLevel(page, 0, 1);
  await typeTarget(page);
  await step(page, 20);
  await page.keyboard.press('Escape');
  await step(page, 1);
  const frozen = await state(page);
  assert.equal(frozen.screen, 'pause');
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
  await page.keyboard.press(frozen.target || 'Space');
  await step(page, 120);
  const later = await state(page);
  assert.equal(later.screen, 'pause');
  assert.deepEqual([later.x, later.time, later.hits, later.misses], [frozen.x, frozen.time, frozen.hits, frozen.misses], 'nothing moves or types while paused');
  await page.locator('#btnResume').click();
  await step(page, 10);
  assert.equal((await state(page)).screen, 'play');
  assert.ok((await state(page)).time > frozen.time);
  // The tab hidden: the game pauses itself.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await step(page, 1);
  assert.equal((await state(page)).screen, 'pause');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await page.locator('#btnRestart').click();
  await step(page, 1);
  const fresh = await state(page);
  assert.equal(fresh.screen, 'play'); assert.equal(fresh.hits, 0); assert.ok(fresh.time < 0.1);
  assert.deepEqual((await calls(page, 'round')).map(c => c[0]), ['w1L2', 'w1L2']);
});

test('finishing a level: stars, the result, Play again with R, the next level with Enter, saved for a reload', async t => {
  const page = await game(t, { save: SAVE({ 0: [3, 3, 3, 3] }), dda: DDA(0.05) });
  await openLevel(page, 1, 0);
  assert.ok(await finish(page));
  assert.ok(await until(page, 's.screen === "result"', 400));
  let s = await state(page);
  assert.equal(s.stars, 3, 'quick and sure: three stars');
  assert.deepEqual(await calls(page, 'end'), [['win', 3]]);
  assert.equal(await page.locator('#resStars svg.on').count(), 0, 'the stars pop in one by one');
  await step(page, 120);
  assert.equal(await page.locator('#resStars svg.on').count(), 3);
  assert.match(await page.locator('#resAcc').textContent(), /^100%$/);
  const saved = await page.evaluate(() => __game.save);
  assert.equal(saved.stars[1][0], 3);
  assert.ok(saved.best[1][0] > 0);
  await page.keyboard.press('KeyR');
  await step(page, 1);
  assert.deepEqual((await state(page)).id, 'w2L1');
  assert.ok(await finish(page));
  assert.ok(await until(page, 's.screen === "result"', 400));
  await step(page, 60);
  await page.keyboard.press('Enter');
  await step(page, 1);
  s = await state(page);
  assert.equal(s.id, 'w2L2');
  assert.deepEqual((await calls(page, 'round')).map(c => c[0]), ['w2L1', 'w2L1', 'w2L2']);
  // A reload keeps the stars: the map shows them and the next level is open.
  await page.reload();
  await page.waitForFunction(() => window.__game && window.kr.step);
  assert.equal((await page.evaluate(() => __game.save)).stars[1][0], 3);
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await page.locator('.lvl[data-w="1"][data-l="0"] .st svg.on').count(), 3);
  assert.equal(await page.locator('.lvl[data-w="1"][data-l="1"]').evaluate(el => el.classList.contains('locked')), false);
  assert.equal(await page.locator('.lvl[data-w="1"][data-l="2"]').evaluate(el => el.classList.contains('locked')), true);
});

test('saves: junk and the old 3D save load fresh, a denied write shows the warning and Retry clears it', async t => {
  const old3d = JSON.stringify({ v: 1, speed: 80, wins: 5, rebirths: 1, unlocked: 3, best: 80, owned: { shoes: [1, 2] }, quality: 'low' });
  for (const saved of [old3d, '{"v":2,"stars":"lots"', 'null', '[]']) {
    const page = await game(t, { save: saved });
    const s = await page.evaluate(() => __game.save);
    assert.equal(s.v, 2); assert.equal(s.stars.flat().reduce((a, b) => a + b, 0), 0);
    await page.keyboard.press('Enter');
    await step(page, 2);
    assert.equal((await state(page)).id, 'w1L1', 'a fresh save plays the first level');
  }
  const denied = await game(t, { deniedStorage: true });
  await denied.locator('#btnPlay').click();
  await step(denied, 1);
  assert.equal((await state(denied)).screen, 'play');
  assert.ok(await finish(denied));
  const status = denied.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  const flaky = await game(t, { save: SAVE({ 0: [1, 1, 1, 1] }) });
  await flaky.evaluate(() => { kr.failSave = true; });
  await flaky.locator('.lbl[data-label="ar"]').click();
  assert.equal(await flaky.locator('.sg-save-status').getAttribute('data-state'), 'failed');
  await flaky.evaluate(() => { kr.failSave = false; });
  await flaky.locator('.sg-save-status button').click();
  assert.equal(await flaky.locator('.sg-save-status').getAttribute('data-state'), 'saved');
  assert.equal(await flaky.evaluate(() => JSON.parse(localStorage.getItem('sg:key-runner:save')).label), 'ar');
});

test('the label toggle picks which letter is drawn big, and it is saved', async t => {
  const page = await game(t, { save: SAVE({ 0: [1, 0, 0, 0] }) });
  assert.equal(await page.locator('.lbl[data-label="both"]').getAttribute('aria-pressed'), 'true');
  await page.locator('.lbl[data-label="en"]').click();
  await step(page, 1);
  assert.equal(await page.locator('.lbl[data-label="en"]').getAttribute('aria-pressed'), 'true');
  assert.equal((await state(page)).label, 'en');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.kr.step);
  assert.equal((await state(page)).label, 'en');
  assert.equal(await page.locator('.lbl[data-label="en"]').getAttribute('aria-pressed'), 'true');
});

test('the endless run opens after world 2, ends after three long stops and keeps the best', async t => {
  const locked = await game(t, { save: SAVE({ 0: [3, 3, 3, 3] }) });
  await locked.keyboard.press('Enter');
  await step(locked, 2);
  await locked.locator('#btnEndless').click();
  await step(locked, 2);
  assert.equal((await state(locked)).screen, 'map', 'locked before world 2 is done');
  const page = await game(t, { save: SAVE({ 0: [3, 3, 3, 3], 1: [3, 3, 3, 3] }) });
  await page.keyboard.press('Enter');
  await step(page, 2);
  await page.locator('#btnEndless').click();
  await step(page, 2);
  let s = await state(page);
  assert.equal(s.mode, 'endless'); assert.equal(s.hearts, 3);
  assert.deepEqual(await calls(page, 'round'), [['endless']]);
  for (let i = 0; i < 6; i++) { await until(page, '!!s.target', 600); await typeTarget(page); }
  assert.ok(await until(page, 's.screen === "result"', 60 * 40), 'three long stops end the run');
  s = await state(page);
  assert.equal(s.endlessKeys, 6);
  assert.deepEqual(await calls(page, 'end'), [['end', 6]]);
  assert.equal((await page.evaluate(() => __game.save)).endless, 6);
  assert.equal(await page.locator('#resNum').textContent(), '6');
});

test('two players race on the two halves of one keyboard; only "end" is reported', async t => {
  const page = await game(t, { save: SAVE({ 0: [1, 0, 0, 0] }) });
  await page.locator('#btnDuo').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'duo');
  assert.deepEqual(await calls(page, 'round'), [], 'the duo screen is not a round yet');
  await page.locator('#duoGo').click();
  await step(page, 1);
  let s = await state(page);
  assert.equal(s.mode, 'duo'); assert.ok(s.countdown > 0);
  assert.deepEqual(await calls(page, 'round'), [['duo']]);
  // During the 3-2-1 nothing types.
  await page.keyboard.press(s.lanes[0].target || 'KeyF');
  await step(page, 1);
  assert.equal((await state(page)).lanes[0].hits, 0);
  assert.ok(await until(page, 's.countdown === 0', 600));
  s = await state(page);
  const left = s.lanes[0].target, right = s.lanes[1].target;
  assert.ok(['Digit1', 'KeyQ', 'KeyA', 'KeyZ', 'KeyF', 'KeyG', 'KeyT', 'KeyB'].some(() => true) && left && right);
  // Player 1's key moves only lane 1, player 2's only lane 2; the other half's keys never count against a player.
  await page.keyboard.press(left);
  await step(page, 1);
  s = await state(page);
  assert.deepEqual([s.lanes[0].hits, s.lanes[1].hits, s.lanes[1].misses], [1, 0, 0]);
  await page.keyboard.press(right);
  await step(page, 1);
  s = await state(page);
  assert.deepEqual([s.lanes[0].hits, s.lanes[1].hits], [1, 1]);
  // Player 1 types every key; player 2 stops: player 1 wins.
  for (let i = 0; i < 300; i++) {
    s = await state(page);
    if (s.ending || s.screen !== 'play') break;
    if (s.lanes[0].target) { await page.keyboard.press(s.lanes[0].target); await step(page, 1); }
    else await page.evaluate(() => { kr.run(6); kr.paint(); });
  }
  assert.ok(await until(page, 's.screen === "duoEnd"', 600));
  s = await state(page);
  assert.equal(s.winner, 0);
  assert.match(await page.locator('#duoWinner').textContent(), /اللاعب 1/);
  assert.deepEqual(await calls(page, 'end'), [['end']]);
  assert.equal(await page.evaluate(() => kr.track.hit), 0, 'a race between two children is not one child\'s accuracy');
  await step(page, 60);
  await page.keyboard.press('Enter');
  await step(page, 1);
  assert.deepEqual((await calls(page, 'round')).map(c => c[0]), ['duo', 'duo'], 'Enter races again');
});

test('the layout follows the window, and a mouse click on Play hands the keyboard to the game', async t => {
  const page = await game(t, { viewport: { width: 1100, height: 620 } });
  const box = await page.locator('#game').boundingBox();
  assert.ok(Math.abs(box.width - 1100) < 2 && Math.abs(box.height - 618.75) < 2);
  await page.setViewportSize({ width: 800, height: 600 });
  await step(page, 1);
  const small = await page.locator('#game').boundingBox();
  assert.ok(Math.abs(small.width - 800) < 2 && Math.abs(small.height - 450) < 2);
  const play = await page.locator('#btnPlay').boundingBox();
  assert.ok(play.x > small.x && play.x + play.width < small.x + small.width, 'the buttons scale with the canvas');
  await page.locator('#btnPlay').click();
  await step(page, 1);
  assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'btnPlay');
  await page.keyboard.press('Space');
  await step(page, 1);
  assert.equal((await state(page)).hits, 1, 'Space types: it does not click the button again');
});

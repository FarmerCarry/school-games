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

// The game runs its own requestAnimationFrame loop; the page captures it so a test
// can drive frames by hand (waits therefore poll on a timer, not on frames) and count WebGL clears of the main canvas (one or more per
// drawn scene). `idle: false` keeps the idle-time warm-up from running at all;
// `failPictures: n` makes the first n character pictures fail.
async function game(t, { reducedMotion = 'no-preference', idle = true, failPictures = 0, entries = {}, failSave = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(([idle, failPictures, entries, failSave]) => {
    if (!sessionStorage.getItem('road-hopper-fixture')) {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem('sg:road-hopper:' + key, JSON.stringify(value));
      sessionStorage.setItem('road-hopper-fixture', '1');
    }
    const rh = window.rh = { queue: [], now: 1000, clears: 0, pictures: 0, lost: 0, resizes: 0,
      failKeys: failSave ? ['save'] : null, writes: [], failPictures };
    addEventListener('resize', () => rh.resizes++);
    window.requestAnimationFrame = cb => rh.queue.push(cb);
    rh.frames = n => {
      for (let i = 0; i < n; i++) {
        rh.now += 1000 / 60;
        const due = rh.queue; rh.queue = [];
        due.forEach(cb => cb(rh.now));
      }
    };
    window.requestIdleCallback = idle ? cb => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0) : () => 0;
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const clear = type.prototype.clear, getExtension = type.prototype.getExtension;
      type.prototype.clear = function () {
        if (this.canvas.id === 'gl') rh.clears++;
        return clear.apply(this, arguments);
      };
      type.prototype.getExtension = function (name) {
        const ext = getExtension.apply(this, arguments);
        if (name === 'WEBGL_lose_context' && ext && !ext.counted) {
          const lose = ext.loseContext;
          ext.loseContext = function () { rh.lost++; return lose.apply(this, arguments); };
          ext.counted = true;
        }
        return ext;
      };
    }
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function () {
      rh.pictures++;
      if (rh.failPictures > 0) { rh.failPictures--; throw new DOMException('Picture fixture', 'SecurityError'); }
      return toDataURL.apply(this, arguments);
    };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      const short = key.replace('sg:road-hopper:', '');
      if (short !== key) rh.writes.push(short);
      if (short !== key && rh.failKeys && (rh.failKeys === 'all' || rh.failKeys.includes(short))) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, [idle, failPictures, entries, failSave]);
  await page.goto(`${server.origin}/games/road-hopper/`);
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  return page;
}

test('reduced motion keeps the new-world banner and reward popups readable, without confetti', async t => {
  const page = await game(t, { reducedMotion: 'reduce' });
  const world = await page.evaluate(() => {
    const g = __game; g.god(true); g.warp(48);
    for (let i = 0; i < 6 && g.score < 50; i++) { g.hop(0, 1); g.step(0.2); }
    const banner = document.getElementById('banner'), fx = document.getElementById('fx');
    const pixels = fx.getContext('2d').getImageData(0, 0, fx.width, fx.height).data;
    return {
      motion: document.documentElement.dataset.sgMotion, score: g.score,
      banner: banner.classList.contains('show') ? getComputedStyle(banner).opacity : 'hidden',
      confetti: pixels.some((value, i) => i % 4 === 3 && value > 0)
    };
  });
  assert.deepEqual(world, { motion: 'reduce', score: 50, banner: '1', confetti: false });
  // The 25-row milestone shows two popups ("25" and a cheer word).
  const pops = await page.evaluate(() => {
    const g = __game; g.warp(23);
    for (let i = 0; i < 6 && g.score < 25; i++) { g.hop(0, 1); g.step(0.2); }
    return [...document.querySelectorAll('#pops .pop')].map(p => getComputedStyle(p).opacity);
  });
  assert.ok(pops.length >= 2, `milestone popups exist (${pops.length})`);
  assert.ok(pops.every(o => o === '1'), `popups are visible (${pops})`);
  await page.waitForFunction(() => !document.getElementById('banner').classList.contains('show') && !document.querySelector('#pops .pop'), null, { polling: 50, timeout: 5000 });
});

test('full motion still animates popups and the banner, which hides itself afterwards', async t => {
  const page = await game(t);
  const shown = await page.evaluate(() => {
    const g = __game; g.god(true); g.warp(48);
    for (let i = 0; i < 6 && g.score < 50; i++) { g.hop(0, 1); g.step(0.2); }
    g.warp(23);
    for (let i = 0; i < 6 && g.score < 25; i++) { g.hop(0, 1); g.step(0.2); }
    const banner = document.getElementById('banner'), pop = document.querySelector('#pops .pop');
    return { banner: getComputedStyle(banner).animationName, pop: pop && getComputedStyle(pop).animationName };
  });
  assert.deepEqual(shown, { banner: 'banner', pop: 'popUp' });
  await page.waitForFunction(() => !document.getElementById('banner').classList.contains('show'), null, { polling: 50, timeout: 5000 });
});

test('a paused run draws its scene once, redraws after a resize, and resumes normally', async t => {
  const page = await game(t, { idle: false });
  await page.evaluate(() => { document.getElementById('btnPlay').click(); rh.frames(20); __game.hop(0, 1); rh.frames(40); });
  const paused = await page.evaluate(() => {
    document.getElementById('btnPause').click();
    rh.clears = 0; rh.frames(1);
    const first = rh.clears;
    rh.clears = 0; rh.frames(120);
    rh.resizes = 0;
    return { state: __game.state, first: first > 0, settled: rh.clears };
  });
  assert.deepEqual(paused, { state: 'paused', first: true, settled: 0 });
  await page.setViewportSize({ width: 1000, height: 600 });
  // Wait for the browser to deliver its resize event (the game's handler runs right after this one).
  await page.waitForFunction(() => rh.resizes > 0, null, { polling: 50 });
  const resized = await page.evaluate(() => {
    rh.clears = 0; rh.frames(1);
    const once = rh.clears;
    rh.clears = 0; rh.frames(60);
    return { once: once > 0, settled: rh.clears };
  });
  assert.deepEqual(resized, { once: true, settled: 0 });
  const resumed = await page.evaluate(() => {
    const row = __game.player().autoRow;
    document.getElementById('btnResume').click();
    rh.clears = 0; rh.frames(60);
    return { state: __game.state, everyFrame: rh.clears >= 60, moved: __game.player().autoRow > row };
  });
  assert.deepEqual(resumed, { state: 'play', everyFrame: true, moved: true });
});

test('failed saves retain complete session progress and clear the warning only after one record succeeds', async t => {
  const page = await game(t, { idle: false });
  const previous = await savedProgress(page);
  const status = () => { const s = document.querySelector('.sg-save-status'); return s && !s.hidden ? s.dataset.state : 'hidden'; };
  await page.evaluate(() => {
    rh.failKeys = 'all';
    const g = __game; g.start(); g.god(true);
    for (let i = 0; i < 6; i++) { g.hop(0, 1); g.step(0.2); }
    g.god(false); g.kill('car'); g.step(2);
  });
  assert.equal(await page.evaluate(() => __game.state), 'over');
  assert.equal(await page.evaluate(status), 'failed');
  assert.deepEqual(await savedProgress(page), previous);
  // Retrying the failed record must not mistake its unchanged JSON for a saved value.
  await page.evaluate(() => { rh.failKeys = ['save']; document.querySelector('.sg-save-status button').click(); });
  assert.equal(await page.evaluate(status), 'failed');
  assert.deepEqual(await savedProgress(page), previous);
  // A later save (here: coins added) writes all pending progress together.
  await page.evaluate(() => { rh.failKeys = null; __game.addCoins(5); });
  assert.equal(await page.evaluate(status), 'saved');
  const stored = await page.evaluate(() => ({
    ...JSON.parse(localStorage.getItem('sg:road-hopper:save')),
    memBest: __game.best, memCoins: __game.coins
  }));
  assert.ok(stored.best > 0);
  assert.equal(stored.best, stored.memBest);
  assert.equal(stored.coins, stored.memCoins);
  assert.equal(stored.tipRuns, 1);
  assert.equal(stored.stats.games, 1);
});

function legacyProgress(overrides = {}) {
  return { best: 88, coins: 500, owned: ['chick', 'cat'], sel: 'cat',
    stats: { games: 4, splash: 1, hops: 7, coinsAll: 600 },
    missions: [
      { t: 'roads', n: 20, p: 4, done: false, rw: 20 },
      { t: 'rivers', n: 8, p: 2, done: false, rw: 25 },
      { t: 'games', n: 5, p: 1, done: false, rw: 20 }
    ], tiers: { roads: 2 }, giftAt: 123456789, seen: { chick: 1, cat: 1 }, tipRuns: 2, ...overrides };
}
const savedProgress = page => page.evaluate(() => JSON.parse(localStorage.getItem('sg:road-hopper:save')));
const saveState = page => page.locator('.sg-save-status').getAttribute('data-state');
const writeAttempts = page => page.evaluate(() => rh.writes);
const legacyValues = (page, keys) => page.evaluate(keys => Object.fromEntries(keys.map(key =>
  [key, JSON.parse(localStorage.getItem('sg:road-hopper:' + key))])), keys);

test('legacy progress migrates intact once and the new record overrides stale legacy values on reload', async t => {
  const legacy = legacyProgress(), expected = { v: 1, ...legacy };
  const page = await game(t, { idle: false, entries: legacy });
  assert.deepEqual(await savedProgress(page), expected);
  assert.deepEqual(await writeAttempts(page), ['save'], 'existing mission rotation migrates with one complete write');
  assert.deepEqual(await legacyValues(page, Object.keys(legacy)), legacy, 'migration leaves every legacy value untouched');
  await page.evaluate(() => {
    localStorage.setItem('sg:road-hopper:coins', '99999');
    localStorage.setItem('sg:road-hopper:owned', '["chick"]');
    localStorage.setItem('sg:road-hopper:sel', '"chick"');
  });
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  assert.deepEqual(await savedProgress(page), expected);
  assert.deepEqual(await page.evaluate(() => ({ coins: __game.coins, best: __game.best, name: document.getElementById('cpName').textContent })),
    { coins: legacy.coins, best: legacy.best, name: 'القطة' });
  assert.deepEqual(await writeAttempts(page), [], 'loading a complete unchanged record does not rewrite it');
});

for (const migrated of [false, true]) test(`a failed prize purchase keeps ${migrated ? 'the existing record' : 'legacy progress'} coherent after immediate reload`, async t => {
  const legacy = legacyProgress(), previous = migrated ? { v: 1, ...legacy } : null;
  const page = await game(t, { idle: false, entries: migrated ? { save: previous } : legacy, failSave: true });
  assert.deepEqual(await savedProgress(page), previous);
  await page.evaluate(() => { rh.writes = []; });
  await page.locator('#btnMachine').click();
  await page.locator('#mPull').click();
  assert.equal(await page.evaluate(() => __game.coins), 400, 'the purchase remains available in this session');
  assert.equal(await saveState(page), 'failed');
  assert.deepEqual(await writeAttempts(page), ['save'], 'purchase attempts one complete record');
  assert.deepEqual(await savedProgress(page), previous, 'a failed purchase cannot persist only its currency deduction');
  if (!migrated) assert.deepEqual(await legacyValues(page, Object.keys(legacy)), legacy);
  await page.locator('.sg-save-status button').click();
  assert.equal(await saveState(page), 'failed');
  assert.deepEqual(await writeAttempts(page), ['save', 'save'], 'failed unchanged data must be attempted again');
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  assert.equal(await page.evaluate(() => __game.coins), 500);
  assert.deepEqual(await savedProgress(page), previous);
  if (!migrated) assert.deepEqual(await legacyValues(page, Object.keys(legacy)), legacy);
});

test('Retry saves a pending prize, equipment and later earnings together without charging twice', async t => {
  const previous = { v: 1, ...legacyProgress() };
  const page = await game(t, { idle: false, entries: { save: previous } });
  await page.locator('#btnMachine').click();
  await page.evaluate(() => { rh.failKeys = ['save']; rh.writes = []; });
  await page.locator('#mPull').click();
  await page.waitForFunction(() => !document.getElementById('mReveal').hidden, null, { polling: 50 });
  const prize = await page.evaluate(() => RH.CHARS.find(c => c.name === document.getElementById('mName').textContent).id);
  assert.ok(!previous.owned.includes(prize));
  await page.locator('#mUse').click();
  await page.evaluate(() => __game.addCoins(5));
  assert.equal(await page.evaluate(() => __game.coins), 405);
  assert.deepEqual(await savedProgress(page), previous, 'all failed operations leave the old record intact');
  assert.equal(await saveState(page), 'failed');
  await page.evaluate(() => { rh.failKeys = null; rh.writes = []; });
  await page.locator('.sg-save-status button').click();
  const expected = { ...previous, coins: 405, owned: [...previous.owned, prize], sel: prize, seen: { ...previous.seen, [prize]: 1 } };
  assert.deepEqual(await savedProgress(page), expected);
  assert.equal(await saveState(page), 'saved');
  assert.deepEqual(await writeAttempts(page), ['save']);
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  assert.deepEqual(await savedProgress(page), expected);
  assert.equal(await page.evaluate(() => __game.coins), 405);
});

test('unchanged saves and ordinary frames make no writes, while a changed checkpoint writes once', async t => {
  const previous = { v: 1, ...legacyProgress({ owned: ['chick'], sel: 'chick', seen: { chick: 1 } }) };
  const page = await game(t, { idle: false, entries: { save: previous } });
  await page.evaluate(() => rh.frames(1)); // Position the character controls with the game's own first render.
  await page.locator('#cNext').click();
  await page.evaluate(() => { __game.addCoins(0); rh.frames(120); });
  assert.deepEqual(await writeAttempts(page), []);
  await page.locator('#btnPlay').press('Enter'); // Play pulses continuously; use native keyboard activation.
  await page.evaluate(() => rh.frames(120));
  assert.deepEqual(await writeAttempts(page), [], 'active frames without progress events must not write');
  await page.evaluate(() => { __game.addCoins(5); __game.addCoins(0); });
  assert.deepEqual(await writeAttempts(page), ['save']);
  assert.equal((await savedProgress(page)).coins, previous.coins + 5);
});

test('character pictures are drawn in idle time, reused by the characters screen, then their context is freed', async t => {
  // The first picture fails during the warm-up: the characters screen draws it again
  // in a new context, which is freed afterwards too.
  const page = await game(t, { failPictures: 1 });
  await page.waitForFunction(() => rh.pictures === 16 && rh.lost === 1, null, { polling: 100, timeout: 90000 });
  const opened = await page.evaluate(() => {
    document.getElementById('btnChars').click();
    const imgs = [...document.querySelectorAll('#cGrid img')], locked = getComputedStyle(document.querySelector('.card.locked img'));
    return {
      state: __game.state, pictures: rh.pictures, cards: imgs.length,
      drawn: imgs.every(img => img.src.startsWith('data:image/png')), draggable: imgs.some(img => img.draggable),
      locked: locked.filter, lockedPointer: locked.pointerEvents
    };
  });
  assert.deepEqual(opened, {
    state: 'chars', pictures: 17, cards: 16, drawn: true, draggable: false,
    locked: 'brightness(0) opacity(0.65)', lockedPointer: 'none'
  });
  await page.waitForFunction(() => rh.lost === 2, null, { polling: 50, timeout: 10000 });
  const reopened = await page.evaluate(() => {
    document.getElementById('cBack').click();
    document.getElementById('btnChars').click();
    return { state: __game.state, pictures: rh.pictures, lost: rh.lost };
  });
  assert.deepEqual(reopened, { state: 'chars', pictures: 17, lost: 2 });
});

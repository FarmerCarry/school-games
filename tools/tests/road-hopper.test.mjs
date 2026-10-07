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
// drawn scene). `idle: false` keeps the idle-time warm-up from running at all.
async function game(t, { reducedMotion = 'no-preference', idle = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(idle => {
    const rh = window.rh = { queue: [], now: 1000, clears: 0, pictures: 0, lost: 0, resizes: 0, failKeys: null };
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
    HTMLCanvasElement.prototype.toDataURL = function () { rh.pictures++; return toDataURL.apply(this, arguments); };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      const short = key.replace('sg:road-hopper:', '');
      if (short !== key && rh.failKeys && (rh.failKeys === 'all' || rh.failKeys.includes(short))) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, idle);
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

test('failed saves show the warning, retry every failed key, and clear only once all are written', async t => {
  const page = await game(t, { idle: false });
  const status = () => { const s = document.querySelector('.sg-save-status'); return s && !s.hidden ? s.dataset.state : 'hidden'; };
  await page.evaluate(() => {
    rh.failKeys = 'all';
    const g = __game; g.start(); g.god(true);
    for (let i = 0; i < 6; i++) { g.hop(0, 1); g.step(0.2); }
    g.god(false); g.kill('car'); g.step(2);
  });
  assert.equal(await page.evaluate(() => __game.state), 'over');
  assert.equal(await page.evaluate(status), 'failed');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:road-hopper:best')), null);
  // Storage recovers except for one key: the warning must stay up.
  await page.evaluate(() => { rh.failKeys = ['best']; document.querySelector('.sg-save-status button').click(); });
  assert.equal(await page.evaluate(status), 'failed');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:road-hopper:tipRuns')), '1');
  // A later save (here: coins added) retries the missing key by itself.
  await page.evaluate(() => { rh.failKeys = null; __game.addCoins(5); });
  assert.equal(await page.evaluate(status), 'saved');
  const stored = await page.evaluate(() => ({
    best: +localStorage.getItem('sg:road-hopper:best'), coins: +localStorage.getItem('sg:road-hopper:coins'),
    memBest: __game.best, memCoins: __game.coins
  }));
  assert.ok(stored.best > 0);
  assert.equal(stored.best, stored.memBest);
  assert.equal(stored.coins, stored.memCoins);
});

test('character pictures are drawn in idle time, reused by the characters screen, then their context is freed', async t => {
  const page = await game(t);
  await page.waitForFunction(() => rh.pictures === 16 && rh.lost === 1, null, { polling: 100, timeout: 90000 });
  const opened = await page.evaluate(() => {
    document.getElementById('btnChars').click();
    const imgs = [...document.querySelectorAll('#cGrid img')];
    return {
      state: __game.state, pictures: rh.pictures, cards: imgs.length,
      drawn: imgs.every(img => img.src.startsWith('data:image/png')),
      locked: getComputedStyle(document.querySelector('.card.locked img')).filter
    };
  });
  assert.deepEqual(opened, { state: 'chars', pictures: 16, cards: 16, drawn: true, locked: 'brightness(0) opacity(0.65)' });
});

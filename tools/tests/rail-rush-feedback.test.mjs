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

// Rail Rush with its loop captured: game time only moves when a test steps it.
async function railRush(t, { reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, game, update, render, now = 1000;
    Object.defineProperty(performance, 'now', { value: () => now });
    const rr = window.rr = { links: 0, bootLinks: -1, failSave: false };
    rr.step = (count, paint = false) => {
      for (let i = 0; i < count; i++) { now += 1000 / 60; update(1 / 60); if (paint) render(0); }
    };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    // __game is published at the end of boot, before anything is drawn.
    Object.defineProperty(window, '__game', { configurable: true, get: () => game, set(value) { rr.bootLinks = rr.links; game = value; } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:rail-rush:save' && rr.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const link = type.prototype.linkProgram;
      type.prototype.linkProgram = function () { rr.links++; return link.apply(this, arguments); };
    }
  });
  await page.goto(`${server.origin}/games/rail-rush/`);
  await page.waitForFunction(() => window.__game);
  return page;
}

const popState = page => page.evaluate(() => {
  const el = document.getElementById('pop'), style = getComputedStyle(el);
  return { text: el.textContent, show: el.classList.contains('show'), opacity: style.opacity, animation: style.animationName };
});
const confettiVisibility = page => page.evaluate(() => getComputedStyle(document.getElementById('confetti')).visibility);
async function buyOceanBoard(page) {
  await page.evaluate(() => {
    __game.give(1000);
    document.getElementById('shopBtn').click();
    document.querySelector('.tab[data-tab="boards"]').click();
    document.querySelector('[data-act="buy"][data-id="ocean"]').click();
    rr.step(1);
  });
  assert.ok(await page.evaluate(() => __game.save.boards.includes('ocean')));
}

test('Rail Rush links every shader during boot, not in the shop or mid-run', async t => {
  const page = await railRush(t);
  await page.evaluate(() => {
    rr.step(2, true);
    document.getElementById('shopBtn').click();
    document.getElementById('sBack').click();
    __game.god = true; __game.restart(); rr.step(30, true);
    __game.force('oncoming'); __game.skip(400); rr.step(3, true);
  });
  assert.equal(await page.evaluate(() => __game.near('moving').active), true, 'an oncoming train is on screen');
  await page.evaluate(() => {
    __game.power('board'); __game.power('magnet'); rr.step(3, true);
    // the first bump only breaks the hoverboard
    __game.god = false; __game.crash(); __game.crash(); rr.step(30, true);
  });
  const { links, bootLinks, mode } = await page.evaluate(() => ({ links: rr.links, bootLinks: rr.bootLinks, mode: __game.state.mode }));
  assert.equal(mode, 'crash');
  assert.ok(bootLinks > 0, 'shaders are compiled before the first frame');
  assert.equal(links, bootLinks, 'no shader links after boot');
});

test('Rail Rush keeps pop-ups readable under reduced motion and skips confetti', async t => {
  const page = await railRush(t, { reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.sgMotion), 'reduce');
  await buyOceanBoard(page);
  assert.equal(await confettiVisibility(page), 'hidden', 'no confetti layer with reduced motion');
  await page.evaluate(() => { __game.god = true; __game.restart(); rr.step(10); __game.stumble(); });
  assert.deepEqual(await popState(page), { text: 'انتبه!', show: true, opacity: '1', animation: 'none' });
  await page.evaluate(() => rr.step(60));
  assert.equal((await popState(page)).opacity, '1', 'still readable after one second');
  await page.evaluate(() => rr.step(30));
  assert.deepEqual(await popState(page), { text: 'انتبه!', show: false, opacity: '0', animation: 'none' });
  // pausing clears a still pop-up rather than leaving it up behind the pause panel
  await page.evaluate(() => { __game.power('board'); __game.god = false; __game.crash(); __game.god = true; });
  assert.equal((await popState(page)).show, true);
  await page.evaluate(() => document.getElementById('pauseBtn').click());
  assert.equal(await page.evaluate(() => __game.state.mode), 'paused');
  assert.deepEqual(await popState(page), { text: 'اللوح أنقذك!', show: false, opacity: '0', animation: 'none' });
});

test('Rail Rush animates pop-ups and confetti with full motion, then hides the overlays', async t => {
  const page = await railRush(t);
  await page.evaluate(() => rr.step(1));
  assert.equal(await confettiVisibility(page), 'hidden', 'empty confetti layer is not composited');
  await buyOceanBoard(page);
  assert.equal(await confettiVisibility(page), 'visible');
  await page.evaluate(() => rr.step(240));
  assert.equal(await confettiVisibility(page), 'hidden', 'confetti layer hides once it has fallen');
  await page.evaluate(() => { __game.god = true; __game.restart(); rr.step(10); __game.stumble(); });
  const shown = await popState(page);
  assert.equal(shown.show, true);
  assert.equal(shown.animation, 'popText');
  await page.evaluate(() => rr.step(80));
  assert.equal((await popState(page)).show, false);
  assert.equal(await confettiVisibility(page), 'hidden');
});

test('Rail Rush reports a failed save and clears the warning after a retry', async t => {
  const page = await railRush(t);
  const status = () => page.evaluate(() => {
    const el = document.querySelector('.sg-save-status');
    return el && { hidden: el.hidden, state: el.dataset.state, text: el.textContent };
  });
  await page.evaluate(() => { rr.failSave = true; __game.give(500); });
  const failed = await status();
  assert.equal(failed.hidden, false);
  assert.equal(failed.state, 'failed');
  assert.match(failed.text, /تعذّر الحفظ/);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:rail-rush:save')), null);
  await page.evaluate(() => { rr.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal((await status()).state, 'saved');
  await page.reload();
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => __game.save.coins), 500);
});

test('Rail Rush keeps the save warning clear of the title how-to box and the run hint', async t => {
  // reduced motion: the hint is measured at its resting size, not mid-animation
  const page = await railRush(t, { reducedMotion: 'reduce' });
  // the full warning, then the badge it folds into after 6 s (a real-time timer, so set here)
  const clashes = sels => page.evaluate(sels => {
    const panel = document.querySelector('.sg-save-status'), out = [];
    for (const compact of ['false', 'true']) {
      panel.dataset.compact = compact;
      const a = panel.getBoundingClientRect();
      for (const s of sels) {
        const b = document.querySelector(s).getBoundingClientRect();
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(s + (compact === 'true' ? ' (badge)' : ''));
      }
    }
    return out;
  }, sels);
  await page.evaluate(() => { rr.failSave = true; __game.give(1); });
  assert.deepEqual(await clashes(['.title-left', '.howto-box', '.peek']), [], 'title screen');
  const hinted = await page.evaluate(() => {
    __game.god = true; __game.restart(); __game.skip(70);
    const lane = __game.near('train').lane;
    if (lane !== 0) __game.act(lane < 0 ? 'left' : 'right');
    const hint = document.getElementById('hint');
    for (let i = 0; i < 40 && hint.hidden; i++) rr.step(6);
    return !hint.hidden;
  });
  assert.ok(hinted, 'the change-lane hint is showing');
  assert.deepEqual(await clashes(['#hint', '.hud-score', '#coinBox']), [], 'run');
});

test('Rail Rush shows the change-lane hint only when the first train blocks the runner', async t => {
  const page = await railRush(t);
  const trial = blocked => page.evaluate(blocked => {
    __game.god = true; __game.restart(); __game.skip(70);
    const train = __game.near('train');
    const lane = blocked ? train.lane : (train.lane === 0 ? -1 : 0);
    if (lane !== 0) __game.act(lane < 0 ? 'left' : 'right');
    let seen = false;
    for (let i = 0; i < 40; i++) {
      rr.step(6);
      const hint = document.getElementById('hint');
      if (!hint.hidden && hint.textContent.includes('غيّر المسار')) seen = true;
    }
    return { seen, lane: __game.state.lane, trainLane: train.lane, tut: __game.save.tut.lane || 0 };
  }, blocked);
  const safe = await trial(false);
  assert.notEqual(safe.lane, safe.trainLane);
  assert.deepEqual([safe.seen, safe.tut], [false, 0], 'no lane hint while the runner is already safe');
  const inTheWay = await trial(true);
  assert.equal(inTheWay.lane, inTheWay.trainLane);
  assert.deepEqual([inTheWay.seen, inTheWay.tut], [true, 1], 'the lane hint teaches a runner who is in the way');
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

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
  // the hint stays up behind the pause panel, but its bob (like the x2 pulse) waits for resume
  const looping = () => page.evaluate(() => document.getAnimations()
    .filter(a => a.effect.getTiming().iterations === Infinity).map(a => a.animationName + ' ' + a.playState).sort());
  assert.ok(await page.evaluate(() => {
    __game.restart(); __game.skip(70);
    const lane = __game.near('train').lane;
    if (lane !== 0) __game.act(lane < 0 ? 'left' : 'right');
    const hint = document.getElementById('hint');
    for (let i = 0; i < 40 && hint.hidden; i++) rr.step(6);
    __game.power('doubler'); rr.step(1, true);
    return !hint.hidden;
  }), 'the lane hint shows again on the second run');
  assert.deepEqual(await looping(), ['hintBob running', 'pulse running']);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __game.state.mode), 'paused');
  assert.equal(await page.evaluate(() => document.getElementById('hint').hidden), false);
  assert.deepEqual(await looping(), ['hintBob paused', 'pulse paused']);
  await page.keyboard.press('Escape');
  assert.deepEqual(await looping(), ['hintBob running', 'pulse running']);
});

test('Rail Rush keeps the coins and best score of a run left through the pause menu', async t => {
  const page = await railRush(t);
  // Pause in the same turn as the snapshot. A live frame between the two
  // would collect more coins, and the banked total would no longer match.
  const done = await page.evaluate(() => {
    __game.restart(); __game.god = true; __game.sim(25);
    const run = { coins: __game.state.coins, score: __game.state.score };
    document.getElementById('pauseBtn').click();
    rr.step(1);
    document.getElementById('restartBtn').click();
    rr.step(1);
    return { run, saved: JSON.parse(localStorage.getItem('sg:rail-rush:save')) };
  });
  assert.ok(done.run.coins > 0 && done.run.score > 0, `the run earned something (${JSON.stringify(done.run)})`);
  assert.equal(done.saved.coins, done.run.coins, 'the coins of the abandoned run are banked');
  assert.ok(done.saved.best >= done.run.score, 'its score counts towards the best');
});

test('Rail Rush buys one power-up level for a double-click on its upgrade button', async t => {
  const page = await railRush(t);
  await page.evaluate(() => {
    __game.give(1000);
    document.getElementById('shopBtn').click();
    document.querySelector('.tab[data-tab="ups"]').click();
    rr.step(1);
  });
  const level = () => page.evaluate(() => ({ coins: __game.save.coins, magnet: __game.save.up.magnet,
    saved: JSON.parse(localStorage.getItem('sg:rail-rush:save')).up.magnet }));
  const before = await level();
  const upgrade = '#shopBody [data-act="up"][data-id="magnet"]';
  const readyUpgrade = async () => {
    const button = page.locator(upgrade);
    await button.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await button.isEnabled(), true, 'the magnet upgrade must be enabled');
    // The shop panel scales in for 0.35s. A click sampled during that move misses the button.
    await page.evaluate(() => {
      for (const node of [document.getElementById('shopPanel'), document.querySelector('#shopBody [data-act="up"][data-id="magnet"]')]) {
        if (!node) continue;
        for (const animation of node.getAnimations({ subtree: true })) {
          if (animation.effect.getComputedTiming().endTime !== Infinity) animation.finish();
        }
      }
    });
  };
  const press = async (double) => {
    await readyUpgrade();
    if (double) {
      const box = await page.locator(upgrade).boundingBox();
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await clickControl(page, upgrade);
    }
    await page.evaluate(() => rr.step(1));
  };
  await press(true);
  assert.deepEqual(await level(), { coins: before.coins - 200, magnet: before.magnet + 1, saved: before.magnet + 1 }, 'the double-click buys one level');
  await press(false);
  assert.equal((await level()).magnet, before.magnet + 2, 'a separate click still buys the next level');
});

test('Rail Rush survives a 0-px-tall frame and makes the shop portraits once it has room', async t => {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    // the boot timer that makes the portraits
    const timeout = window.setTimeout;
    window.setTimeout = function (fn, ms, ...args) {
      if (ms !== 1200) return timeout(fn, ms, ...args);
      return timeout(() => { try { fn(); } finally { window.portraitTimerRan = true; } }, ms);
    };
  });
  // In a browser window under ~170 px tall the portal has no height left for the game frame.
  await page.route(`${server.origin}/host.html`, route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><body style="margin:0"><iframe src="/games/rail-rush/" style="border:0;width:960px;height:0"></iframe>' }));
  await page.goto(`${server.origin}/host.html`);
  const game = page.frames().find(f => f.url().includes('/games/rail-rush/'));
  await game.waitForFunction(() => window.__game);
  const gl = () => game.evaluate(() => {
    const c = document.getElementById('gl'), g = c.getContext('webgl2');
    return { height: c.height, scissor: g.isEnabled(g.SCISSOR_TEST) };
  });
  const portraits = () => game.evaluate(() => [...document.querySelectorAll('canvas[data-portrait]')].map(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
    return false;
  }));
  await game.waitForFunction(() => window.portraitTimerRan);
  await game.evaluate(() => document.getElementById('shopBtn').click());
  assert.deepEqual(await gl(), { height: 0, scissor: false }, 'a failed portrait pass leaves the main view unclipped');
  await game.evaluate(() => document.getElementById('sBack').click());
  await page.locator('iframe').evaluate(f => { f.style.height = '540px'; });
  await game.waitForFunction(() => document.getElementById('gl').height > 0);
  await game.evaluate(() => document.getElementById('shopBtn').click());
  const drawn = await portraits();
  assert.ok(drawn.length > 0 && drawn.every(Boolean), `every shop portrait is drawn once the frame has room: ${drawn}`);
  assert.equal((await gl()).scissor, false);
});

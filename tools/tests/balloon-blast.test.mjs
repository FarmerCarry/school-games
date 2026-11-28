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

async function open(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
  });
  await page.addInitScript(() => {
    let kit, update, render;
    const bb = window.bb = { stats: [], failSave: false };
    bb.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    bb.tap = code => { bb.down(code); bb.up(code); };
    bb.down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    bb.up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
        for (const name of ['round', 'end']) {
          const call = kit.stats[name];
          kit.stats[name] = function (...args) {
            bb.stats.push([name, ...args]);
            return call.apply(this, args);
          };
        }
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (bb.failSave && key === 'sg:balloon-blast:save') {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/balloon-blast/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.BBData && window.BBEngine && window.BBAI);
  return page;
}

test('attract demo runs behind title screen without recording stats', async t => {
  const page = await open(t);
  const res = await page.evaluate(() => {
    const demoing = __game.demoing;
    bb.step(90);
    return { demoing, stats: bb.stats, screen: __game.screen };
  });
  assert.equal(res.demoing, true);
  assert.deepEqual(res.stats, []);
  assert.equal(res.screen, 'title');
});

test('difficulty selector, #play1 quick battle, ArrowRight movement, HUD bomb button, and instant win telemetry work', async t => {
  const page = await open(t);
  const res = await page.evaluate(() => {
    document.querySelector('#diffBar button[data-diff="easy"]').click();
    document.getElementById('play1').click();
    const startInfo = __game.info();
    const easyShield = __game.world.players[0].shield;
    const easyMercy = __game.world.players[0].selfMercy;

    bb.down('ArrowRight');
    bb.step(45);
    bb.up('ArrowRight');
    const movedInfo = __game.info();

    document.getElementById('bombBtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    bb.step(2);
    const droppedCount = __game.world.balloons.length;

    __game.winRound(0);
    bb.step(2);
    return {
      startPx: startInfo.px,
      startFreeze: startInfo.freeze,
      movedPx: movedInfo.px,
      easyShield,
      easyMercy,
      droppedCount,
      screen: __game.screen,
      stats: bb.stats
    };
  });

  assert.equal(res.startFreeze, 0.4);
  assert.equal(res.easyShield, 1);
  assert.equal(res.easyMercy, true);
  assert.ok(res.movedPx - res.startPx > 40, `expected px increase > 40, got ${res.movedPx - res.startPx}`);
  assert.equal(res.droppedCount, 1);
  assert.equal(res.screen, 'over');
  assert.equal(res.stats.length, 2);
  assert.deepEqual(res.stats[0], ['round', 'qb-easy']);
  assert.equal(res.stats[1][0], 'end');
  assert.equal(res.stats[1][1], 'win');
  assert.ok(res.stats[1][2] >= 150);
});

test('all 3 worlds & boss raids are unlocked immediately, and 2P modes launch cleanly', async t => {
  const page = await open(t);
  const res = await page.evaluate(() => {
    document.getElementById('playAdv').click();
    const worldTabs = Array.from(document.querySelectorAll('#worldTabs button'));
    const disabledTabs = worldTabs.filter(b => b.disabled).length;
    worldTabs[2].click(); // World 3: Soap Volcano
    const stageCards = Array.from(document.querySelectorAll('#stageGrid button'));
    const disabledStages = stageCards.filter(b => b.disabled).length;
    stageCards[2].click(); // Boss Raid w3-s3

    const hasBoss = !!(__game.world && __game.world.boss && __game.world.boss.kind === 'king');
    __game.winRound(0);
    bb.step(2);
    const advScreen = __game.screen;

    document.getElementById('rMenu').click();
    document.getElementById('play2').click();
    document.getElementById('duoCoop').click();
    const coopHumans = __game.world.players.filter(p => !p.cpu && p.team === 0).length;

    return { disabledTabs, disabledStages, hasBoss, advScreen, coopHumans, stats: bb.stats };
  });

  assert.equal(res.disabledTabs, 0);
  assert.equal(res.disabledStages, 0);
  assert.equal(res.hasBoss, true);
  assert.equal(res.advScreen, 'over');
  assert.equal(res.coopHumans, 2);
  assert.deepEqual(res.stats[0], ['round', 'adv-w3-s3']);
  assert.equal(res.stats[1][0], 'end');
  assert.equal(res.stats[1][1], 'win');
  assert.deepEqual(res.stats[2], ['round', 'duo-coop']);
});

test('cosmetic locker purchases and equips hero skins using earned match coins', async t => {
  const page = await open(t);
  const res = await page.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      __game.start({ mode: 'battle', seed: 10 + i });
      __game.winRound(0);
      bb.step(2);
    }
    document.getElementById('rMenu').click();
    document.getElementById('btnShop').click();
    const buyBtns = Array.from(document.querySelectorAll('#skinGrid .skin-act'));
    buyBtns[1].click(); // Purchase & equip Wave Shark (cost 25, have 44 coins)
    document.getElementById('shopBack').click();
    document.getElementById('play1').click();
    const equipped = __game.world.players[0].skin;
    const saved = JSON.parse(localStorage.getItem('sg:balloon-blast:save') || '{}');
    return { equipped, savedSkin: saved.skin, sharkOwned: !!(saved.owned && saved.owned.shark) };
  });

  assert.equal(res.equipped, 'shark');
  assert.equal(res.savedSkin, 'shark');
  assert.equal(res.sharkOwned, true);
});

test('pause freezes elapsed time, resume continues, restart resets round/freeze/scores, and failed save retries', async t => {
  const page = await open(t);
  const res = await page.evaluate(() => {
    document.getElementById('play1').click();
    __game.setTime(2.5);
    bb.step(5);
    const t0 = __game.info().t;

    document.getElementById('pauseBtn').click();
    const paused = __game.paused && __game.screen === 'play';
    bb.step(45);
    const tFrozen = __game.info().t;

    document.getElementById('bResume').click();
    bb.step(10);
    const resumed = !__game.paused && __game.info().t > tFrozen;

    bb.tap('KeyP');
    bb.step(1);
    document.getElementById('bRestart').click();
    const fresh = __game.world.round === 1 &&
      __game.world.phase === 'play' &&
      __game.world.freeze === 0.4 &&
      __game.scores[0] === 0 &&
      !__game.paused &&
      __game.screen === 'play';

    bb.failSave = true;
    __game.winRound(0);
    bb.step(2);
    const panel = document.querySelector('.sg-save-status');
    const failedState = { shown: !panel.hidden, state: panel.dataset.state };
    bb.failSave = false;
    panel.querySelector('button').click();

    return {
      paused,
      frozenOk: tFrozen === t0,
      resumed,
      fresh,
      failedState,
      savedState: panel.dataset.state
    };
  });

  assert.equal(res.paused, true);
  assert.equal(res.frozenOk, true);
  assert.equal(res.resumed, true);
  assert.equal(res.fresh, true);
  assert.deepEqual(res.failedState, { shown: true, state: 'failed' });
  assert.equal(res.savedState, 'saved');
});

test('fresh boot defaults to easy difficulty and left-clicking an adjacent crate drops a balloon', async t => {
  const page = await open(t);
  const res = await page.evaluate(() => {
    const easyActive = document.querySelector('#diffBar button[data-diff="easy"]').classList.contains('on');
    document.getElementById('play1').click();
    const p1 = __game.world.players[0];
    const defaults = { shield: p1.shield, selfMercy: p1.selfMercy, roundKey: bb.stats[0][1] };
    __game.world.freeze = 0;
    const here = BBEngine.cellOf(p1);
    const ac = here.c + 1, ar = here.r;
    __game.world.grid[ar * BBData.COLS + ac] = BBData.CRATE;
    const cv = document.getElementById('game'), rect = cv.getBoundingClientRect();
    const ox = (1280 - BBData.COLS * BBData.TILE) / 2, oy = 96;
    const cx = rect.left + (ox + (ac + 0.5) * BBData.TILE) * (rect.width / 1280);
    const cy = rect.top + (oy + (ar + 0.5) * BBData.TILE) * (rect.height / 720);
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: cx, clientY: cy }));
    bb.step(2);
    return { easyActive, defaults, balloons: __game.world.balloons.length };
  });
  assert.equal(res.easyActive, true);
  assert.deepEqual(res.defaults, { shield: 1, selfMercy: true, roundKey: 'qb-easy' });
  assert.equal(res.balloons, 1, 'left-clicking an adjacent crate drops a balloon');
});

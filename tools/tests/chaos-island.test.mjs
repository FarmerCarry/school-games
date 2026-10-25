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
  if (browser) await browser.close();
  await server?.close();
});

async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1, drawLast = false) => {
          for (let i = 0; i < n; i++) { update(1 / 60); if (!drawLast || i === n - 1) render(0); }
        };
        window.simGame = n => { for (let i = 0; i < n; i++) update(1 / 60); };
        return { stop() {} };
      };
    } });
  });
  await page.goto(`${server.origin}/games/chaos-island/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  await page.evaluate(() => {
    window.ends = []; window.rounds = [];
    const end = Kit.stats.end, round = Kit.stats.round;
    Kit.stats.end = function () { ends.push([...arguments]); return end.apply(this, arguments); };
    Kit.stats.round = function () { rounds.push([...arguments]); return round.apply(this, arguments); };
    window.park = function (actor) {
      const w = window.__game.world;
      let top = null;
      for (const p of w.plats) if (p.spine && !p.solid && !p.ground && !p.gone && (!top || p.y < top.y)) top = p;
      const hazards = w.haz.filter(h => h.k === 'meteor' || h.k === 'zap' || h.k === 'foot');
      const clear = px => hazards.every(h => Math.abs(h.x - px) > h.r + 18);
      let x = top.x + top.w / 2;
      if (!clear(x)) {
        for (let px = top.x + 24; px < top.x + top.w - 24; px += 8) if (clear(px)) { x = px; break; }
      }
      actor.mode = 'run';
      actor.x = x - actor.w / 2;
      actor.y = top.y - actor.h;
      actor.vx = 0; actor.vy = 0;
      actor.ground = top;
    };
  });
  return page;
}

test('the title demo reports nothing and writes nothing', async t => {
  const page = await game(t);
  await page.evaluate(() => stepGame(240));
  assert.deepEqual(await page.evaluate(() => [rounds, ends, Object.keys(localStorage).filter(k => k.startsWith('sg:chaos-island:'))]), [[], [], []]);
  assert.equal(await page.evaluate(() => __game.mode), 'title');
});

test('a save comes back, a corrupt save becomes a fresh island, and a full disk can retry', async t => {
  const page = await game(t);
  const data = await page.evaluate(() => {
    const save = __game.save;
    save.coins = 40;
    __game.persist();
    return JSON.parse(localStorage.getItem('sg:chaos-island:data'));
  });
  assert.equal(data.coins, 40);
  assert.equal(data.v, 1);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.equal(await page.locator('#t-coins').textContent(), '40');
  await clickControl(page, '#btnShop');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('#shopGrid .item')].find(el => el.querySelector('b').textContent === 'قبعة');
    card.querySelector('button').click();
  });
  const bought = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:chaos-island:data')));
  assert.equal(bought.coins, 20);
  assert.deepEqual(bought.hats, ['cap']);
  assert.equal(bought.hat, 'cap');
  await page.evaluate(() => localStorage.setItem('sg:chaos-island:data', '{"v":1,"coins":"nope"}'));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.equal(await page.locator('#t-coins').textContent(), '0');
  assert.equal(await page.evaluate(() => __game.save.hats.length), 0);

  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith('sg:chaos-island:')) throw new DOMException('full', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
    __game.save.coins = 50;
    __game.persist();
  });
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.equal(await page.evaluate(() => __game.save.coins), 50);
});

test('pause freezes the round and draws again only after a resize', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.draws = 0;
    const ctx = document.getElementById('cv').getContext('2d'), draw = ctx.drawImage;
    ctx.drawImage = function (img) {
      if (img && img.width === 1280) window.draws++;
      return draw.apply(this, arguments);
    };
  });
  await clickControl(page, '#btnPlay');
  assert.equal(await page.evaluate(() => __game.world.players), 1);
  assert.equal(await page.evaluate(() => __game.world.actors.filter(a => a.bot).length), 7);
  await page.evaluate(() => stepGame(20));
  const frame = await page.evaluate(() => __game.world.frames);
  await clickControl(page, '#btnPause');
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  const held = await page.evaluate(() => { stepGame(8); const a = draws; const f = __game.world.frames; stepGame(40); return [f, __game.world.frames, a, draws]; });
  assert.equal(held[0], frame);
  assert.equal(held[1], frame);
  assert.equal(held[3], held[2], 'a paused scene is not redrawn');
  await page.setViewportSize({ width: 1100, height: 620 });
  const redrawn = await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    const a = draws; stepGame(6); return draws - a;
  });
  assert.equal(redrawn, 1);
  await clickControl(page, '#btnResume');
  assert.equal(await page.evaluate(() => { const a = __game.world.frames; stepGame(3); return __game.world.frames < a; }), true);
});

test('two players keep separate keys, a popped kid becomes a cloud, and results stay end or draw', async t => {
  const page = await game(t);
  await clickControl(page, '#btnTwo');
  await clickControl(page, '#btnStart');
  assert.equal(await page.evaluate(() => __game.world.players), 2);
  assert.equal(await page.evaluate(() => __game.world.actors.filter(a => a.bot).length), 6);
  const moved = await page.evaluate(() => {
    const a = __game.world.actors.filter(p => !p.bot);
    const start = [a[0].x, a[1].x];
    return { start };
  });
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => stepGame(25));
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  const later = await page.evaluate(() => __game.world.actors.filter(p => !p.bot).map(p => p.x));
  assert.ok(later[0] > moved.start[0] + 4, 'player 1 walks right with D');
  assert.ok(later[1] < moved.start[1] - 4, 'player 2 walks left with ArrowLeft');

  await page.evaluate(() => {
    const p = __game.player;
    p.y = 820; p.vy = 0;
    stepGame(520);
  });
  assert.equal(await page.evaluate(() => __game.player.mode), 'cloud');
  await page.evaluate(() => stepGame(70));
  await page.keyboard.down('KeyE');
  await page.evaluate(() => stepGame(8));
  await page.keyboard.up('KeyE');
  assert.ok(await page.evaluate(() => __game.player.drops >= 1), 'the cloud drops an item');

  await page.evaluate(() => {
    while (__game.mode === 'play' && __game.world.phase !== 'podium') {
      const humans = __game.world.actors.filter(a => !a.bot);
      humans.forEach(park);
      simGame(1);
    }
  });
  assert.equal(await page.evaluate(() => __game.mode), 'result');
  assert.equal(await page.evaluate(() => ends[0][0]), 'draw');
  assert.equal(await page.evaluate(() => rounds[0][0]), 'match');
  assert.equal(await page.evaluate(() => ends.some(e => e[0] === 'win' || e[0] === 'lose')), false);
});

test('the coin count keeps its number and stays clear of mute and pause', async t => {
  const page = await game(t);
  await clickControl(page, '#btnPlay');
  await page.evaluate(() => { __game.save.coins = 128; stepGame(1); });
  const sizes = [[1024, 576], [1100, 620], [1920, 1080]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const box = await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      stepGame(1);
      const r = el => {
        const b = el.getBoundingClientRect();
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
      };
      return {
        coins: r(document.getElementById('hud-coins')),
        num: r(document.getElementById('hud-coin-n')),
        mute: r(document.querySelector('.sg-mute')),
        pause: r(document.getElementById('btnPause')),
        text: document.getElementById('hud-coin-n').textContent,
        hard: document.getElementById('hud-coins').classList.contains('hard'),
        vw: innerWidth
      };
    });
    const label = width + 'x' + height;
    const clearOf = (a, b) => {
      const vert = a.top < b.bottom && a.bottom > b.top;
      const horiz = a.left < b.right && a.right > b.left;
      if (vert && horiz) return 0;
      if (!vert) return 99;
      return a.left >= b.right ? a.left - b.right : b.left - a.right;
    };
    assert.equal(box.text, '128', label + ' shows the coin number');
    assert.ok(box.num.width > 10 && box.num.height > 10, label + ' number is on screen');
    assert.ok(box.num.left >= -1 && box.num.right <= box.vw + 1, label + ' number stays inside the window');
    assert.ok(clearOf(box.coins, box.mute) >= 8, label + ' coins meet the mute button ' + JSON.stringify(box));
    assert.ok(clearOf(box.num, box.mute) >= 8, label + ' number meets the mute button');
    assert.ok(clearOf(box.coins, box.pause) >= 8, label + ' coins meet pause ' + JSON.stringify(box));
  }
});

test('one player can win, restart counts a new round, and leaving early ends the match', async t => {
  const page = await game(t);
  await clickControl(page, '#btnPlay');
  await page.evaluate(() => {
    while (__game.mode === 'play') { park(__game.player); simGame(1); }
  });
  assert.equal(await page.evaluate(() => ends.at(-1)[0]), 'win');
  assert.ok(await page.evaluate(() => __game.save.coins) >= 20, 'a full survival pays for a hat');
  await clickControl(page, '#btnAgain');
  assert.equal(await page.evaluate(() => __game.matches), 2);
  assert.equal(await page.evaluate(() => rounds.length), 2);
  await clickControl(page, '#btnPause');
  await clickControl(page, '#btnMenu');
  assert.equal(await page.evaluate(() => ends.at(-1)[0]), 'end');
  assert.equal(await page.evaluate(() => __game.mode), 'title');
});

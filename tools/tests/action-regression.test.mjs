import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
});

after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function gamePage(t, slug) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // Capture the real fixed-step update before game boot, for source and inlined builds alike.
    // Rendering and wall-clock speed cannot influence these state/save regressions.
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = update => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); };
          return { stop() {} };
        };
      }
    });
  });
  await page.goto(`${origin}/games/${slug}/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

async function newBlockWorld(page) {
  await page.evaluate(() => {
    document.getElementById('playBtn').click();
    document.getElementById('modeSurv').click();
  });
  await page.waitForFunction(() => __game.G.mode === 'play');
}

async function loadBlockWorld(page) {
  await page.evaluate(() => document.getElementById('playBtn').click());
  await page.waitForFunction(() => __game.G.mode === 'play' || __game.G.mode === 'inv');
}

test('Block World preserves a held stack when a pickup fills its old inventory slot', async t => {
  const page = await gamePage(t, 'block-world');
  await newBlockWorld(page);
  const before = await page.evaluate(() => {
    __game.give(BW.B.DIRT, 35 * BW.maxStack(BW.B.DIRT));
    __game.give(BW.I.DIAMOND, 12);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    stepGame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    document.querySelector('#bag').lastChild.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    const p = __game.player;
    __game.G.items.push({ id: BW.B.DIRT, n: 1, x: p.x + p.w / 2 + 0.2, y: p.y + p.h / 2, vx: 0, vy: 0, age: 0, delay: 0, bob: 0 });
    stepGame();
    __game.save();
    const saved = Kit.store('block-world').get('slot1');
    return {
      occupied: saved.inv.filter(Boolean).length,
      cursor: __game.G.cursor,
      savedCursor: saved.cursor,
      bagDiamonds: saved.inv.filter(s => s && s.id === BW.I.DIAMOND)
    };
  });
  assert.equal(before.occupied, 36);
  assert.deepEqual(before.cursor, { id: 105, n: 12 });
  assert.deepEqual(before.savedCursor, before.cursor);
  assert.deepEqual(before.bagDiamonds, []);

  // Repeated save/load cycles must neither lose nor duplicate the held stack.
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await loadBlockWorld(page);
    assert.deepEqual(await page.evaluate(() => ({
      mode: __game.G.mode,
      backpackVisible: !document.getElementById('inv').hidden,
      cursorVisible: !document.getElementById('cursorStack').hidden,
      cursor: __game.G.cursor,
      occupied: __game.G.inv.filter(Boolean).length,
      bagDiamonds: __game.G.inv.filter(s => s && s.id === BW.I.DIAMOND)
    })), { mode: 'inv', backpackVisible: true, cursorVisible: true, cursor: { id: 105, n: 12 }, occupied: 36, bagDiamonds: [] });
    await page.evaluate(() => __game.save());
  }

  // Put the restored stack away through the normal inventory UI, then save once more.
  const placed = await page.evaluate(() => {
    document.querySelector('#bag').lastChild.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    document.getElementById('invClose').click();
    __game.save();
    const saved = Kit.store('block-world').get('slot1');
    return { cursor: saved.cursor, diamonds: saved.inv.filter(s => s && s.id === BW.I.DIAMOND) };
  });
  assert.deepEqual(placed, { cursor: null, diamonds: [{ id: 105, n: 12 }] });
});

test('Block World loads legacy inventory saves without creating a cursor or extra items', async t => {
  const page = await gamePage(t, 'block-world');
  await newBlockWorld(page);
  await page.evaluate(() => {
    __game.give(BW.I.DIAMOND, 7);
    document.getElementById('quitBtn').click();
    const store = Kit.store('block-world'), legacy = store.get('slot1');
    legacy.v = 1;
    delete legacy.cursor;
    store.set('slot1', legacy);
  });
  await loadBlockWorld(page);
  assert.deepEqual(await page.evaluate(() => {
    __game.save();
    const saved = Kit.store('block-world').get('slot1');
    return { mode: __game.G.mode, cursor: __game.G.cursor, savedCursor: saved.cursor, diamonds: saved.inv.filter(s => s && s.id === BW.I.DIAMOND) };
  }), { mode: 'play', cursor: null, savedCursor: null, diamonds: [{ id: 105, n: 7 }] });
});

async function startSnake(page) {
  await page.waitForFunction(() => performance.now() > 300);
  await page.evaluate(() => document.getElementById('btnPlay').click());
  assert.equal(await page.evaluate(() => __game.state), 'play');
}

test('Snake Arena records length on a fatal tick that never reaches runTick', async t => {
  const page = await gamePage(t, 'snake-arena');
  await startSnake(page);
  const result = await page.evaluate(() => {
    __game.setMass(2001);
    SA.world.player.hx = SA.world.R + 100;
    stepGame();
    const stateAfterCollision = __game.state;
    stepGame(200);
    return { stateAfterCollision, best: __game.stats.bestLen, death: SA.game.run.deathLen, peak: SA.game.run.peakLen };
  });
  assert.deepEqual(result, { stateAfterCollision: 'dying', best: 2001, death: 2001, peak: 2001 });
});

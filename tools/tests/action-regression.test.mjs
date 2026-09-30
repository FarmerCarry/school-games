import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
let browser, server, origin;

before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await fs.readFile(file);
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
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

test('Snake Arena keeps a length unlock and record after boosting below the threshold', async t => {
  const page = await gamePage(t, 'snake-arena');
  await startSnake(page);
  const peak = await page.evaluate(() => {
    __game.god();
    __game.setMass(2001);
    stepGame();
    return { length: __game.player.len, announced: SA.game.run.announced.dragon };
  });
  assert.ok(peak.length >= 2000);
  assert.equal(peak.announced, 1);
  await page.keyboard.down('Space');
  await page.evaluate(() => stepGame(180));
  await page.keyboard.up('Space');
  const boosted = await page.evaluate(() => __game.player.len);
  assert.ok(boosted < 2000, `boosting should bring length below the Dragon threshold: ${boosted}`);
  await page.evaluate(() => document.getElementById('btnPause').click());
  assert.equal(await page.evaluate(() => document.getElementById('pBest').textContent === Kit.fmt(SA.game.run.peakLen)), true);
  await page.evaluate(() => {
    document.getElementById('btnResume').click();
    __game.killPlayer();
    stepGame(200);
  });
  const result = await page.evaluate(() => ({
    state: __game.state,
    best: __game.stats.bestLen,
    peak: SA.game.run.peakLen,
    death: SA.game.run.deathLen,
    dragon: SA.reqMet(SA.SKINS.find(s => s.id === 'dragon').req, __game.stats)
  }));
  assert.equal(result.state, 'over');
  assert.ok(result.peak >= peak.length);
  assert.equal(result.best, result.peak);
  assert.equal(result.death, boosted);
  assert.equal(result.dragon, true);
  await page.reload();
  assert.equal(await page.evaluate(() => __game.stats.bestLen), result.peak);
});

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

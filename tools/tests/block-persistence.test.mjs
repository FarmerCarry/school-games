import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let browser, server, origin;

before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      let file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function game(t, init) {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = update => { window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); }; return { stop() {} }; };
    } });
  });
  if (init) await page.addInitScript(init);
  await page.goto(`${origin}/games/block-world/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}
async function create(page) {
  await page.evaluate(() => { document.getElementById('playBtn').click(); document.getElementById('modeSurv').click(); });
  await page.waitForFunction(() => __game.G.mode === 'play');
}
async function restore(page) {
  await page.reload();
  await page.evaluate(() => document.getElementById('playBtn').click());
  await page.waitForFunction(() => __game.G.mode === 'play' || __game.G.mode === 'inv');
}
async function exhaustStorage(page, reserve = 0) {
  return page.evaluate(slack => {
    let lo = 0, hi = 10 * 1024 * 1024;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      try { localStorage.setItem('quota-fixture', 'x'.repeat(mid)); lo = mid; } catch { hi = mid; }
    }
    localStorage.setItem('quota-fixture', 'x'.repeat(Math.max(0, lo - slack)));
    return lo;
  }, reserve);
}

test('real quota failure never advertises a saved world and Save & Quit retains the session', async t => {
  const page = await game(t);
  await exhaustStorage(page, 2048);
  await create(page);
  assert.deepEqual(await page.evaluate(() => ({
    error: __game.G.saveError, flash: __game.G.savedFlash,
    world: Kit.store('block-world').get('slot1', null), slot: __game.meta.slots[0]
  })), { error: 'world', flash: 0, world: null, slot: null });
  assert.equal(await page.locator('#saveError').isVisible(), true);
  await page.locator('#pausebtn').click();
  await page.locator('#quitBtn').click();
  assert.equal(await page.evaluate(() => __game.G.mode), 'pause');
  assert.equal(await page.evaluate(() => __game.G.slot), 1);
  await page.evaluate(() => localStorage.removeItem('quota-fixture'));
  await page.locator('#saveRetry').click();
  assert.equal(await page.evaluate(() => __game.G.saveError), null);
  assert.equal(await page.locator('#saveError').isVisible(), false);
  await page.locator('#quitBtn').click();
  assert.equal(await page.evaluate(() => __game.G.mode), 'title');
  await restore(page);
  assert.equal(await page.evaluate(() => __game.G.slot), 1);
});

test('failed overwrite preserves the previous world and metadata until retry succeeds', async t => {
  const page = await game(t);
  await create(page);
  await page.evaluate(() => { __game.give(BW.I.DIAMOND, 7); __game.save(); });
  const previous = await page.evaluate(() => ({ world: localStorage.getItem('sg:block-world:slot1'), meta: localStorage.getItem('sg:block-world:meta') }));
  await exhaustStorage(page);
  assert.equal(await page.evaluate(() => {
    __game.give(BW.I.DIAMOND, 9);
    __game.G.stats.got[BW.I.DIAMOND] = 12345;
    return __game.save();
  }), false);
  assert.deepEqual(await page.evaluate(() => ({ world: localStorage.getItem('sg:block-world:slot1'), meta: localStorage.getItem('sg:block-world:meta') })), previous);
  await page.evaluate(() => localStorage.removeItem('quota-fixture'));
  assert.equal(await page.evaluate(() => __game.save()), true);
  await restore(page);
  assert.equal(await page.evaluate(() => __game.G.inv.filter(s => s?.id === BW.I.DIAMOND).reduce((n, s) => n + s.n, 0)), 16);
});

test('world records recover missing slot metadata while retaining global unlocks', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    __game.meta.totalStars = 99; __game.meta.skin = 3;
    Kit.store('block-world').set('meta', __game.meta);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:block-world:meta') throw new DOMException('fixture', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await create(page);
  assert.equal(await page.evaluate(() => __game.G.saveError), 'meta');
  assert.equal(await page.evaluate(() => !!Kit.store('block-world').get('slot1')), true);
  assert.equal(await page.evaluate(() => Kit.store('block-world').get('meta').slots[0]), null);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ({ slot: !!__game.meta.slots[0], stars: __game.meta.totalStars, skin: __game.meta.skin })), { slot: true, stars: 99, skin: 3 });
  await page.evaluate(() => document.getElementById('playBtn').click());
  await page.waitForFunction(() => __game.G.mode === 'play');
});

test('denied storage and serialization failures return false instead of claiming success', async t => {
  const page = await game(t, () => {
    Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); };
  });
  await create(page);
  assert.deepEqual(await page.evaluate(() => ({ error: __game.G.saveError, flash: __game.G.savedFlash, result: __game.save() })), { error: 'world', flash: 0, result: false });
  const clean = await game(t);
  assert.deepEqual(await clean.evaluate(() => {
    const store = Kit.store('fixture'), circular = {}; circular.self = circular;
    return { normal: store.set('normal', { n: 1 }), circular: store.set('circular', circular), missing: store.get('circular', null) };
  }), { normal: true, circular: false, missing: null });
});

test('a failed pointer retry returns control to gameplay while keyboard retries retain focus', async t => {
  const page = await game(t, () => {
    Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); };
  });
  await create(page);
  await page.locator('#saveRetry').click();
  assert.equal(await page.evaluate(() => __game.G.saveError), 'world');
  await page.keyboard.down('KeyD');
  assert.equal(await page.evaluate(() => Kit.keys.down('KeyD')), true);
  await page.keyboard.up('KeyD');
  await page.locator('#saveRetry').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'saveRetry');
  await page.locator('#saveRetry').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => stepGame());
  assert.equal(await page.evaluate(() => __game.G.mode), 'pause');
});

test('quests earned during metadata failure recover global stars exactly once', async t => {
  const page = await game(t);
  await create(page);
  const completed = await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:block-world:meta') throw new DOMException('fixture', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    __game.completeAll(); __game.save();
    return { earned: __game.meta.totalStars, stored: Kit.store('block-world').get('meta').totalStars };
  });
  assert.ok(completed.earned > 0);
  assert.equal(completed.stored, 0);
  await restore(page);
  assert.equal(await page.evaluate(() => __game.meta.totalStars), completed.earned);
  await page.evaluate(() => { __game.completeAll(); __game.save(); });
  await restore(page);
  assert.equal(await page.evaluate(() => __game.meta.totalStars), completed.earned);
});

test('crafted overflow survives repeated save/load and is collected exactly once', async t => {
  const page = await game(t);
  await create(page);
  await page.evaluate(() => {
    __game.give(BW.B.DIRT, 35 * BW.maxStack(BW.B.DIRT)); __game.give(BW.B.LOG, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); stepGame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    document.querySelector('.crow[data-r="0"]').dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    __game.save();
  });
  for (let i = 0; i < 3; i++) {
    await restore(page);
    assert.deepEqual(await page.evaluate(() => ({
      logs: __game.G.inv.filter(s => s?.id === BW.B.LOG).reduce((n, s) => n + s.n, 0),
      planks: __game.G.inv.filter(s => s?.id === BW.B.PLANKS).reduce((n, s) => n + s.n, 0),
      drops: __game.G.items.map(it => ({ id: it.id, n: it.n })), crafted: __game.G.stats.craft[BW.B.PLANKS]
    })), { logs: 9, planks: 0, drops: [{ id: 8, n: 4 }], crafted: 4 });
    await page.evaluate(() => __game.save());
  }
  await page.evaluate(() => { __game.G.inv[0] = null; stepGame(120); __game.save(); });
  await restore(page);
  assert.deepEqual(await page.evaluate(() => ({ planks: __game.G.inv.filter(s => s?.id === BW.B.PLANKS).reduce((n, s) => n + s.n, 0), drops: __game.G.items.length })), { planks: 4, drops: 0 });
});

test('mined drops retain their position, motion, and remaining lifetime', async t => {
  const page = await game(t);
  await create(page);
  const before = await page.evaluate(() => {
    const x = Math.floor(__game.player.x) + 10, y = Math.floor(__game.surfaceY(x));
    __game.breakAt(x, y);
    const it = __game.G.items[0]; it.age = 299.99; it.delay = 0.12;
    __game.save(); return structuredClone(__game.G.items);
  });
  assert.ok(before.length > 0);
  await restore(page);
  assert.deepEqual(await page.evaluate(() => structuredClone(__game.G.items)), before);
  await page.evaluate(() => stepGame(2));
  assert.equal(await page.evaluate(() => __game.G.items.length), 0);
});

test('partial pickups preserve the remaining drop and do not duplicate items across reloads', async t => {
  const page = await game(t);
  await create(page);
  const capacity = await page.evaluate(() => BW.maxStack(BW.B.PLANKS));
  await page.evaluate(() => {
    __game.give(BW.B.DIRT, 35 * BW.maxStack(BW.B.DIRT)); __game.give(BW.B.PLANKS, BW.maxStack(BW.B.PLANKS) - 1);
    const p = __game.player;
    __game.G.items.push({ id: BW.B.PLANKS, n: 3, x: p.x + p.w / 2 + 0.2, y: p.y + p.h / 2, vx: 0, vy: 0, age: 40, delay: 0, bob: 1 });
    stepGame(); __game.save();
  });
  for (let i = 0; i < 2; i++) {
    await restore(page);
    assert.deepEqual(await page.evaluate(() => ({ held: __game.G.inv[35].n, dropped: __game.G.items[0].n, age: __game.G.items[0].age })), { held: capacity, dropped: 2, age: 40 + 1 / 60 });
    await page.evaluate(() => __game.save());
  }
});

test('legacy saves without drops still load and malformed optional drops are ignored', async t => {
  const page = await game(t);
  await create(page);
  await page.evaluate(() => {
    document.getElementById('quitBtn').click();
    const store = Kit.store('block-world'), data = store.get('slot1');
    data.v = 1; delete data.items; delete data.cursor; store.set('slot1', data);
  });
  await restore(page);
  assert.equal(await page.evaluate(() => __game.G.items.length), 0);
  await page.evaluate(() => {
    document.getElementById('quitBtn').click();
    const store = Kit.store('block-world'), data = store.get('slot1');
    data.items = [null, { id: 8, n: 4, x: null, y: 20, vx: 0, vy: 0, age: 1, delay: 0, bob: 0 }, { id: 8, n: 4, x: 1, y: 20, vx: 0, vy: 0, age: 301, delay: 0, bob: 0 }];
    store.set('slot1', data);
  });
  await restore(page);
  assert.equal(await page.evaluate(() => __game.G.items.length), 0);
});

test('final quests remain pending across reloads until the celebration is acknowledged', async t => {
  const page = await game(t, () => {
    const original = window.setTimeout;
    window.masterDelays = [];
    window.setTimeout = function (fn, ms, ...args) {
      if (ms === 1800) { window.masterDelays.push(fn); return 999999; }
      return original(fn, ms, ...args);
    };
    window.runMasterDelay = () => { const pending = window.masterDelays.splice(0); pending.forEach(fn => fn()); };
  });
  await create(page);
  await page.evaluate(() => { __game.completeAll(); stepGame(61); __game.save(); });
  assert.deepEqual(await page.evaluate(() => {
    const save = Kit.store('block-world').get('slot1');
    return { mode: __game.G.mode, pending: save.masterPending, acknowledged: save.master };
  }), { mode: 'play', pending: true, acknowledged: false });
  for (let cycle = 0; cycle < 2; cycle++) {
    await restore(page);
    await page.evaluate(() => { stepGame(61); runMasterDelay(); });
    assert.equal(await page.evaluate(() => __game.G.mode), 'master');
    assert.equal(await page.locator('#master').isVisible(), true);
    await page.evaluate(() => __game.save());
  }
  await page.evaluate(() => document.getElementById('masterKeep').click());
  assert.deepEqual(await page.evaluate(() => {
    const save = Kit.store('block-world').get('slot1');
    return { pending: save.masterPending, acknowledged: save.master };
  }), { pending: false, acknowledged: true });
  await restore(page);
  await page.evaluate(() => { stepGame(120); runMasterDelay(); });
  assert.equal(await page.evaluate(() => __game.G.mode), 'play');
  assert.equal(await page.locator('#master').isVisible(), false);
});

test('leaving an open backpack pauses world time and resumes the backpack explicitly', async t => {
  const page = await game(t);
  await create(page);
  const before = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); stepGame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    window.dispatchEvent(new Event('blur'));
    return { play: __game.G.play, tod: __game.G.tod };
  });
  assert.equal(await page.evaluate(() => __game.G.mode), 'pause');
  await page.evaluate(() => stepGame(120));
  assert.deepEqual(await page.evaluate(() => ({ play: __game.G.play, tod: __game.G.tod })), before);
  await page.evaluate(() => document.getElementById('resumeBtn').click());
  assert.equal(await page.evaluate(() => __game.G.mode), 'inv');
  assert.equal(await page.locator('#inv').isVisible(), true);
});

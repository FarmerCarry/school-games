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

async function game(t, { saved } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(saved => {
    if (saved !== undefined) localStorage.setItem('sg:lucky-lake:save', saved);
    let kit;
    const ll = window.ll = { stats: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        ll.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); if (render) render(0); } };
        ll.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        return { stop() {} };
      };
      for (const name of ['round', 'end']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { ll.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:lucky-lake:save' && ll.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, saved);
  await page.goto(`${server.origin}/games/lucky-lake/`);
  await page.waitForFunction(() => window.__game && window.ll.step);
  return page;
}

const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:lucky-lake:save');
  return raw ? JSON.parse(raw) : null;
});

test('a saved lake comes back, and a damaged save still opens', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.give(80); });
  assert.equal((await stored(page)).coins, 80);
  assert.match(await page.locator('#titleProgress').textContent(), /80/);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ll.step);
  assert.match(await page.locator('#titleProgress').textContent(), /80/);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => ll.step(2));
  assert.equal(await page.evaluate(() => __game.world.save.coins), 80);
});

for (const saved of ['broken{', '[1,2]', '{"coins":"abc","rod":9,"quests":[{"k":"nope"}]}', '{"aqua":[{"id":99}]}']) {
  test(`a damaged save never stops the lake (${saved})`, async t => {
    const page = await game(t, { saved });
    assert.equal(await page.evaluate(() => __game.mode), 'title');
    await page.locator('#btnPlay').click();
    await page.evaluate(() => ll.step(2));
    assert.equal(await page.evaluate(() => __game.mode), 'play');
    assert.equal(await page.evaluate(() => __game.phase), 'ready');
  });
}

test('a full disk warns, keeps the coins, and a retry writes them', async t => {
  const page = await game(t);
  await page.evaluate(() => { ll.failSave = true; __game.give(40); });
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.match(await page.locator('#titleProgress').textContent(), /40/);
  assert.equal(await stored(page), null);
  await page.evaluate(() => { ll.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).coins, 40);
});

test('pause freezes the lake, keeps the frame, and a resize draws once', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => ll.step(8));
  await page.keyboard.down('Space');
  await page.evaluate(() => ll.step(20));
  await page.keyboard.up('Space');
  const moving = await page.evaluate(() => { const t0 = __game.tick; ll.step(10); return __game.tick - t0; });
  assert.equal(moving, 10);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  const frozen = await page.evaluate(() => {
    ll.step(1);
    __game.paints = 0;
    const tick = __game.tick;
    const phase = __game.phase;
    ll.step(90);
    return [tick, __game.tick, phase, __game.phase, __game.paints];
  });
  assert.equal(frozen[1], frozen[0]);
  assert.equal(frozen[3], frozen[2]);
  assert.equal(frozen[4], 0);
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
  assert.equal(await page.evaluate(() => { __game.paints = 0; ll.step(30); return __game.paints; }), 1);
  await page.keyboard.press('KeyP');
  await page.evaluate(() => ll.step(1));
  assert.equal(await page.evaluate(() => __game.mode), 'play');
});

test('one finger and two fingers both cast, and a paused derby holds its clock', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => ll.step(1));
  assert.deepEqual(await page.evaluate(() => ll.stats.filter(s => s[0] === 'round')), [['round', 'solo']]);
  await page.keyboard.down('Space');
  await page.evaluate(() => ll.step(30));
  assert.ok(await page.evaluate(() => __game.charge > 0.12));
  await page.keyboard.up('Space');
  await page.locator('#btnPause').click();
  await page.locator('#btnMenu').click();
  assert.equal(await page.evaluate(() => __game.mode), 'title');
  const soloEnd = await page.evaluate(() => ll.stats.filter(s => s[0] === 'end'));
  assert.equal(soloEnd.length, 1);
  assert.equal(soloEnd[0][1], 'end');

  await page.locator('#btnDerby').click();
  await page.evaluate(() => ll.step(2));
  await page.keyboard.down('Space');
  await page.keyboard.down('Enter');
  await page.evaluate(() => ll.step(36));
  const both = await page.evaluate(() => [__game.charge, __game.p2charge]);
  assert.ok(both[0] > 0.12 && both[1] > 0.12, both.join(','));
  await page.keyboard.up('Space');
  await page.keyboard.up('Enter');
  const left = await page.evaluate(() => { ll.step(20); return __game.world.left; });
  await page.locator('#btnPause').click();
  const held = await page.evaluate(() => { ll.step(40); return __game.world.left; });
  assert.equal(held, left);
  await page.evaluate(() => { __game.world.left = 0.02; __game.world.anglers[0].weight = 2; __game.world.anglers[1].weight = 2; });
  await page.locator('#btnResume').click();
  await page.evaluate(() => ll.step(8));
  assert.equal(await page.locator('#scr-result').isVisible(), true);
  assert.equal(await page.evaluate(() => __game.world.draw), 1);
  const derbyEnd = await page.evaluate(() => ll.stats.filter(s => s[0] === 'end' && s[1] === 'draw'));
  assert.equal(derbyEnd.length, 1);
});

test('a nibble ripple draws without a page error', async t => {
  const page = await game(t);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.locator('#btnPlay').click();
  await page.evaluate(() => ll.step(2));
  await page.keyboard.down('Space');
  await page.evaluate(() => {
    for (let i = 0; i < 90 && (__game.phase === 'ready' || __game.phase === 'charge'); i++) ll.step(1);
  });
  await page.keyboard.up('Space');
  const dipped = await page.evaluate(() => {
    for (let i = 0; i < 500; i++) {
      ll.step(1);
      const a = __game.world.anglers[0];
      if (a.dip > 0) return true;
    }
    return false;
  });
  assert.equal(dipped, true);
  await page.evaluate(() => ll.step(20));
  assert.deepEqual(errors, []);
});

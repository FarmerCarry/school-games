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
after(async () => { await browser?.close(); await server?.close(); });

async function game(t, { manual = true, saved, deniedStorage = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  context.on('request', request => { if (!request.url().startsWith(server.origin)) errors.push('External request: ' + request.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors or external requests'); });
  await page.addInitScript(({ manual, saved, deniedStorage }) => {
    if (saved !== undefined && !sessionStorage.getItem('kr-fixture-seeded')) {
      localStorage.setItem('sg:key-runner:save', saved);
      sessionStorage.setItem('kr-fixture-seeded', '1');
    }
    let kit, update, render;
    const probe = window.krProbe = { rounds: [], ends: [], ready: 0 };
    probe.step = count => { for (let i = 0; i < count; i++) update(1 / 60); if (render) render(0); };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      const loop = kit.loop, round = kit.stats.round, end = kit.stats.end, ready = kit.ready;
      kit.loop = (u, r, options) => { update = u; render = r; return manual ? { running: true, stop() {} } : loop(u, r, options); };
      kit.stats.round = (...args) => { probe.rounds.push(args); return round.apply(kit.stats, args); };
      kit.stats.end = (...args) => { probe.ends.push(args); return end.apply(kit.stats, args); };
      kit.ready = (...args) => { probe.ready++; return ready.apply(kit, args); };
    } });
    const write = Storage.prototype.setItem, read = Storage.prototype.getItem;
    Storage.prototype.setItem = function (key) {
      if (String(key).startsWith('sg:key-runner:') && (deniedStorage || probe.failSave)) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    Storage.prototype.getItem = function (key) {
      if (deniedStorage && String(key).startsWith('sg:key-runner:')) throw new DOMException('Storage fixture', 'SecurityError');
      return read.apply(this, arguments);
    };
  }, { manual, saved, deniedStorage });
  await page.goto(`${server.origin}/games/key-runner/`);
  await page.waitForFunction(() => window.KeyRunnerGame && window.krProbe.ready === 1);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const step = (page, count = 1) => page.evaluate(count => krProbe.step(count), count);
const focusSurface = page => page.evaluate(() => { document.activeElement?.blur(); Kit.keys.reset(); });

test('Key Runner stays on the title until Play and then jumps', async t => {
  const page = await game(t);
  assert.deepEqual(await page.evaluate(() => krProbe.rounds), []);
  assert.equal(await page.locator('#title-screen').isVisible(), true);
  await page.locator('#play').click();
  await focusSurface(page);
  assert.equal((await page.evaluate(() => KeyRunnerGame.mode)), 'play');
  assert.deepEqual(await page.evaluate(() => krProbe.rounds.map(r => r[0])), ['tower']);
  const before = await page.evaluate(() => KeyRunnerGame.state.y);
  await page.keyboard.down('Space');
  await step(page, 6);
  assert.ok((await page.evaluate(() => KeyRunnerGame.state.y)) > before + 0.2, 'Space lifts the runner');
  await page.keyboard.up('Space');
});

test('Key Runner pause freezes the run and focus does not resume it', async t => {
  const page = await game(t);
  await page.locator('#play').click();
  await focusSurface(page);
  await page.keyboard.down('KeyW');
  await step(page, 20);
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => KeyRunnerGame.state.z);
  assert.ok(moved > 1.2, 'holding W moves forward');
  await page.locator('#pause-button').click();
  const frozen = await page.evaluate(() => KeyRunnerGame.state);
  await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('blur')); });
  await step(page, 40);
  assert.deepEqual(await page.evaluate(() => KeyRunnerGame.state), frozen);
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await step(page, 10);
  assert.equal(await page.evaluate(() => KeyRunnerGame.mode), 'paused');
  await page.locator('#resume').click();
  await page.keyboard.down('KeyW');
  await step(page, 15);
  await page.keyboard.up('KeyW');
  assert.ok((await page.evaluate(() => KeyRunnerGame.state.z)) > frozen.z);
});

test('Key Runner restores a save, ignores a corrupt one, and can retry a denied write', async t => {
  const good = JSON.stringify({ v: 1, speed: 80, wins: 5, rebirths: 1, unlocked: 3, best: 80, shoe: 2, trail: 0, aura: 0, hat: 0, charm: 0, owned: { shoes: [1, 2], trails: [0], auras: [0], hats: [0], charm: 0 }, medals: {}, tower: {}, quality: 'low' });
  const restored = await game(t, { saved: good });
  assert.equal(await restored.evaluate(() => KeyRunnerGame.save.speed), 80);
  assert.equal(await restored.evaluate(() => KeyRunnerGame.save.unlocked), 3);
  assert.equal(await restored.locator('#quality').getAttribute('aria-pressed'), 'true');
  const corrupt = await game(t, { saved: '{"v":9,"speed":500}' });
  assert.equal(await corrupt.evaluate(() => KeyRunnerGame.save.speed), 0);
  const denied = await game(t, { deniedStorage: true });
  await denied.locator('#play').click();
  assert.equal(await denied.evaluate(() => KeyRunnerGame.mode), 'play');
  const status = denied.locator('.sg-save-status');
  assert.equal(await status.isVisible(), true);
  assert.equal(await status.getAttribute('data-state'), 'failed');
  const flaky = await game(t);
  await flaky.evaluate(() => { krProbe.failSave = true; });
  await flaky.locator('#play').click();
  assert.equal(await flaky.locator('.sg-save-status').getAttribute('data-state'), 'failed');
  await flaky.evaluate(() => { krProbe.failSave = false; });
  await flaky.locator('.sg-save-status button').click();
  assert.equal(await flaky.locator('.sg-save-status').getAttribute('data-state'), 'saved');
  assert.equal(await flaky.evaluate(() => JSON.parse(localStorage.getItem('sg:key-runner:save')).v), 1);
});

test('Key Runner two-player race reports a duo round and not a winner', async t => {
  const page = await game(t);
  await page.locator('#duo').click();
  await page.locator('#race-0').click();
  assert.equal(await page.evaluate(() => KeyRunnerGame.mode), 'play');
  assert.equal(await page.evaluate(() => KeyRunnerGame.state.players), 2);
  assert.deepEqual(await page.evaluate(() => krProbe.rounds.map(r => r[0])), ['duo']);
  await page.evaluate(() => KeyRunnerGame.menu());
  assert.deepEqual(await page.evaluate(() => krProbe.ends.map(e => e[0])), ['quit']);
});

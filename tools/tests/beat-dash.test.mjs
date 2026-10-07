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

async function game(t) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'game should not throw'); });
  // The test drives __game.ff() itself, so the real loop must not advance play.
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(server.origin + '/games/beat-dash/index.html');
  await page.waitForFunction(() => window.__game && window.Kit);
  return page;
}

test('practice auto-checkpoints never respawn the cube just before a spike', async t => {
  const page = await game(t);
  // With no input the cube dies at the first spike of level 1 (x 25.5). A checkpoint
  // placed 0.3-0.5 s before it used to trap the player in instant re-deaths.
  const state = await page.evaluate(() => { __game.start(0, true); return __game.ff(700); });
  assert.equal(state.practice, true);
  assert.equal(state.cps, 0, 'no auto-checkpoint in front of the first spike');
  assert.ok(state.attempt <= 5, `only full-length tries (attempt ${state.attempt})`);
});

test('failed saves stay visible until a retry writes every key', async t => {
  const page = await game(t);
  const failed = await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('quota'); };
    __game.start(0, false);
    __game.ff(2);
    const panel = document.querySelector('.sg-save-status');
    return { hidden: panel.hidden, state: panel.dataset.state, att: localStorage.getItem('sg:beat-dash:att') };
  });
  assert.deepEqual(failed, { hidden: false, state: 'failed', att: null });
  const retried = await page.evaluate(() => {
    Storage.prototype.setItem = window.realSetItem;
    document.querySelector('.sg-save-status button').click();
    const panel = document.querySelector('.sg-save-status'), store = Kit.store('beat-dash');
    return { state: panel.dataset.state, att: store.get('att', null), last: store.get('last', null), attempts: store.get('total', {}).attempts };
  });
  assert.deepEqual(retried, { state: 'saved', att: { 'neon-steps': 1 }, last: 0, attempts: 1 });
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

// The level verifier's winning input for level 1 (one 0/1 per 1/60 s step).
function levelOneInput() {
  const result = spawnSync(process.execPath, ['games/swing-hook/verify-levels.js', '1', '--json'], { cwd: repo, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.split('\n').find(line => line.startsWith('{')))['1'];
}

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});

after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function gamePage(t) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    // Run the real update function in fixed steps under test control.
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
      }
    });
  });
  await page.goto(`${server.origin}/games/swing-hook/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

const state = page => page.evaluate(() => __game.state());

test('resuming from pause mid-swing keeps the rope until the player holds again', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); stepGame(1); });
  await page.keyboard.down('Space');
  await page.evaluate(() => { for (let i = 0; i < 120 && !__game.state().hooked; i++) stepGame(1); });
  assert.equal((await state(page)).hooked, true);

  // P to pause and P again while Space is still held: the swing simply continues.
  await page.keyboard.press('KeyP');
  await page.evaluate(() => stepGame(1));
  assert.equal((await state(page)).mode, 'pause');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => stepGame(4));
  let s = await state(page);
  assert.equal(s.mode, 'play');
  assert.equal(s.hooked, true, 'holding through a P pause must not drop the rope');

  // Losing focus resets held keys; the Resume button then waits, frozen, for a new hold.
  await page.evaluate(() => { dispatchEvent(new Event('blur')); stepGame(1); });
  await page.keyboard.up('Space');
  assert.equal((await state(page)).mode, 'pause');
  await page.evaluate(() => { document.getElementById('psResume').click(); stepGame(30); });
  const frozen = await state(page);
  assert.equal(frozen.mode, 'play');
  assert.equal(frozen.hooked, true, 'resume must not let go of the rope');
  await page.evaluate(() => stepGame(30));
  s = await state(page);
  assert.deepEqual([s.x, s.y, s.timer], [frozen.x, frozen.y, frozen.timer], 'the swing waits for the player');

  await page.keyboard.down('Space');
  await page.evaluate(() => stepGame(6));
  s = await state(page);
  assert.equal(s.hooked, true);
  assert.ok(s.timer > frozen.timer, 'holding again continues the swing');
  await page.keyboard.up('Space');

  // Restart from a waiting resume starts a normal fresh run.
  await page.evaluate(() => { stepGame(1); dispatchEvent(new Event('blur')); stepGame(1); });
  await page.evaluate(() => { document.getElementById('psRestart').click(); stepGame(2); });
  s = await state(page);
  assert.deepEqual([s.mode, s.st, s.timer], ['play', 'ready', 0]);
});

test('the hero celebrates above the water after crossing the finish', async t => {
  const page = await gamePage(t);
  await page.evaluate(input => { __game.start(0); __game.script(input); }, levelOneInput());
  await page.evaluate(() => { for (let i = 0; i < 1200 && __game.state().st !== 'won'; i++) stepGame(1); });
  const won = await state(page);
  assert.equal(won.st, 'won');
  const samples = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 300 && __game.mode !== 'result'; i++) { stepGame(1); if (i % 10 === 0) out.push(__game.state()); }
    out.push(__game.state());
    return out;
  });
  assert.equal(samples.at(-1).mode, 'result');
  for (const s of samples) assert.ok(s.y < 900 - 100, `hero must stay above the sea (y ${s.y})`);
  assert.ok(samples.at(-1).x - won.x < 400, 'hero stays near the finish flag');
});

test('a failed save shows the retry warning and keeps progress after a successful retry', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
  });
  await page.evaluate(input => { __game.start(0); __game.script(input); }, levelOneInput());
  await page.evaluate(() => { for (let i = 0; i < 1500 && __game.mode !== 'result'; i++) stepGame(1); });
  const status = () => page.evaluate(() => {
    const panel = document.querySelector('.sg-save-status');
    return { hidden: panel.hidden, state: panel.getAttribute('data-state') };
  });
  assert.deepEqual(await status(), { hidden: false, state: 'failed' });
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:swing-hook:save')), null);

  await page.evaluate(() => {
    Storage.prototype.setItem = window.realSetItem;
    document.querySelector('.sg-save-status button').click();
  });
  assert.equal((await status()).state, 'saved');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:swing-hook:save')));
  assert.equal(stored.unlocked, 2);
  assert.equal(stored.stars[0] & 1, 1);
});

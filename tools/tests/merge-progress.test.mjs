import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = await startTestServer(site);
  origin = server.origin;
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function gamePage(t) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'game should not throw browser errors'));
  await page.goto(origin + '/games/merge-2048/');
  return page;
}

const state = page => page.evaluate(() => window.__game.state());
const awaitScreen = (page, screen) =>
  page.waitForFunction(value => window.__game.state().screen === value, screen, { timeout: 15000 });
const nextBox = page => page.evaluate(() => ({
  hidden: document.getElementById('nextBox').hidden,
  name: document.getElementById('nextName').textContent,
  req: document.getElementById('nextReq').textContent,
  bar: document.getElementById('nextBar').style.width
}));

test('A failed write shows the save warning until Retry stores the board', async t => {
  const page = await gamePage(t);
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    window.__game.set([2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    Storage.prototype.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
    window.__game.move(3);
  });
  const panel = page.locator('.sg-save-status');
  assert.equal(await panel.getAttribute('data-state'), 'failed');
  assert.equal(await panel.isVisible(), true);
  // Later moves keep warning while storage is still failing.
  await page.evaluate(() => window.__game.move(1));
  assert.equal(await panel.getAttribute('data-state'), 'failed');

  await page.evaluate(() => { Storage.prototype.setItem = Storage.prototype.realSetItem; });
  await panel.locator('button').click();
  assert.equal(await panel.getAttribute('data-state'), 'saved');
  const saved = await state(page);
  assert.equal(saved.screen, 'play', 'Retry must not start a drag move or leave the game');

  await page.reload();
  await page.keyboard.press('Enter');
  const restored = await state(page);
  assert.deepEqual(restored.values, saved.values);
  assert.equal(restored.score, saved.score);
  assert.equal(restored.best[4], saved.best[4]);
});

test('The HUD shows the next theme and switches after its unlock is announced', async t => {
  const page = await gamePage(t);
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__game.set([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  assert.deepEqual(await nextBox(page), { hidden: false, name: 'حلوى', req: 'اصنع 128', bar: '14%' });

  await page.evaluate(() => {
    window.__game.set([64, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3);
  });
  // The earned theme stays on screen with a full bar until its toast.
  assert.deepEqual(await nextBox(page), { hidden: false, name: 'حلوى', req: 'اصنع 128', bar: '100%' });
  await page.waitForFunction(() => document.getElementById('nextName').textContent === 'تطوّر', null, { timeout: 15000 });
  assert.deepEqual(await nextBox(page), { hidden: false, name: 'تطوّر', req: 'اصنع 256', bar: '88%' });

  await page.evaluate(() => window.__game.unlockAll());
  assert.equal((await nextBox(page)).hidden, true);
  await page.reload();
  await page.keyboard.press('Enter');
  assert.equal((await nextBox(page)).hidden, true, 'nothing is left to unlock');
});

test('The 3x3 challenge is won at 256 and its game-over hint names that goal', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => Kit.store('merge-2048').set('best', { 3: 500 }));
  await page.reload();
  await page.keyboard.press('Digit3');
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).N, 3);
  assert.equal(await page.locator('#goalTxt').textContent(), '256');

  await page.evaluate(() => {
    window.__game.set([0, 0, 0, 0, 0, 0, 128, 128, 4]);
    window.__game.move(3);
  });
  await awaitScreen(page, 'win');
  assert.equal(await page.locator('#winNum').textContent(), '256');

  await page.keyboard.press('KeyR');
  await page.evaluate(() => {
    // One move left: after it, no tile can merge whichever tile spawns.
    window.__game.set([2, 4, 2, 4, 2, 16, 0, 128, 8]);
    window.__game.move(3);
  });
  await awaitScreen(page, 'over');
  assert.equal(await page.locator('#overHint').textContent(), 'كنت قريباً جداً من 256! 😮');
});

test('Reduced motion keeps merge feedback but trims celebration particles', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3);
  });
  // The score "+N" pop stays visible instead of finishing its fade at once.
  const plus = page.locator('#scoreBox .plus');
  await plus.waitFor({ state: 'attached', timeout: 15000 });
  assert.deepEqual(await plus.evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el).opacity, el.textContent]),
    ['none', '1', '+4']);

  await page.evaluate(() => {
    window.__game.nearWin();
    window.__game.move(3);
  });
  await awaitScreen(page, 'win');
  await page.waitForTimeout(800);
  // Full motion adds 160 + 80 confetti and a 26-particle burst here.
  assert.ok((await state(page)).parts <= 40, 'win confetti is capped');
});

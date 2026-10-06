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
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox']
  });
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

async function awaitScreen(page, screen) {
  await page.waitForFunction(value => window.__game.state().screen === value, screen, { timeout: 15000 });
}

test('2048 preserves a saved victory on a board with no remaining moves', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    Kit.store('merge-2048').set('g4', {
      v: [2048, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2],
      s: 2048, u: 3, h: [], w: true, k: false, m: 1, sb: 0
    });
  });
  await page.keyboard.press('Enter');
  await awaitScreen(page, 'win');
  assert.equal(await page.evaluate(() => window.__game.state().max), 2048);
  await page.locator('#btnKeep').click();
  await awaitScreen(page, 'over');
});

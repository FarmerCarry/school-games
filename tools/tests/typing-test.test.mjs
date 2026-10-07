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

async function game(t, init) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  if (init) await page.addInitScript(init);
  await page.goto(`${server.origin}/games/typing-test/`);
  await page.waitForFunction(() => !!window.__game);
  return page;
}
// Types a whole words test on the virtual clock (ms per key decides the speed).
const typeTest = (page, ms) => page.evaluate(ms => {
  __game.start({ lang: 'en', mode: 'words', amt: 10, seed: 1 });
  __game.typeText(__game.words(10).join(' '), ms);
  return __game.results();
}, ms);

test('a first visit starts in Arabic and a saved language still wins', async t => {
  const fresh = await game(t);
  assert.equal(await fresh.evaluate(() => __game.state().lang), 'ar');
  const saved = await game(t, () => localStorage.setItem('sg:typing-test:settings', JSON.stringify({ lang: 'en' })));
  assert.equal(await saved.evaluate(() => __game.state().lang), 'en');
});

test('results footer names the real restart key and new animals are celebrated once', async t => {
  // An existing 33 wpm record (🐆) from before the tier key existed: matching it again is not "new".
  const page = await game(t, () => localStorage.setItem('sg:typing-test:pbs',
    JSON.stringify({ 'en|words|10|l': { wpm: 33, acc: 100, raw: 33, cons: 80, t: 1 } })));
  assert.equal(await page.evaluate(() => document.querySelectorAll('#race .ms').length), 4, 'no flag before a record in this type');
  const steady = await typeTest(page, 300);
  assert.ok(steady.isPb && steady.wpm >= 30 && steady.wpm < 45, `about 40 wpm (${steady.wpm})`);
  assert.equal(steady.tierUp, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:typing-test:tier')), null);
  assert.deepEqual(await page.evaluate(() => [document.getElementById('restartKey').textContent, document.getElementById('escHint').hidden]), ['Enter', true]);
  await page.waitForTimeout(350); // Enter is ignored for 300 ms after a result
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => __game.state().screen), 'test');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('restartKey').textContent, document.getElementById('escHint').hidden]), ['Tab', false]);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#race .pbf').length), 1, 'the record flag joins the race');

  const fast = await typeTest(page, 200);
  assert.ok(fast.wpm >= 45, `rocket speed (${fast.wpm})`);
  assert.equal(fast.tierUp, 4);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:typing-test:tier')), '4');
  assert.match(await page.locator('#rBadge').textContent(), /أصبحت/);
});

test('denied saves keep the result in this session and recover on retry', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
  });
  const result = await typeTest(page, 300);
  assert.equal(result.isPb, true);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:typing-test:hist')), null);
  assert.equal(await page.evaluate(() => __game.store.hist().length), 1, 'the progress window still shows the result');
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:typing-test:hist')).length), 1);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:typing-test:pbs'))['en|words|10|l']));
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

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
  // Mid-pulse the new-animal card keeps its inset ring and adds the glow (an outer-only keyframe swapped them).
  const pulse = await page.evaluate(() => {
    const badge = document.getElementById('rBadge');
    badge.className = 'badge'; void badge.offsetWidth; badge.className = 'badge up'; // (re)start the 1.2 s pulse
    const a = badge.getAnimations()[0];
    a.pause(); a.currentTime = 600;
    return getComputedStyle(badge).boxShadow;
  });
  assert.ok(pulse.includes('inset') && pulse.split('rgb').length === 3, pulse);
});

// Boxes the save warning overlaps among the footer hints, the progress text and the results buttons.
const coveredBy = page => page.evaluate(() => {
  const s = document.querySelector('.sg-save-status').getBoundingClientRect(), range = document.createRange();
  range.selectNodeContents(document.getElementById('progTxt'));
  const boxes = { hints: document.querySelector('.hints').getBoundingClientRect(), progress: range.getBoundingClientRect(),
    buttons: document.querySelector('.rbtns').getBoundingClientRect() };
  return Object.keys(boxes).filter(k => { const b = boxes[k]; return b.width && b.left < s.right && s.left < b.right && b.top < s.bottom && s.top < b.bottom; });
});

test('denied saves keep the result in this session and recover on retry', async t => {
  const page = await game(t);
  await page.setViewportSize({ width: 1100, height: 620 }); // the portal's frame: the tightest footer
  await page.evaluate(() => document.fonts.ready); // text widths decide the overlaps below
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
  });
  await page.locator('#bSound').click(); // a setting that cannot be saved: the warning opens on the test screen
  assert.deepEqual(await coveredBy(page), [], 'the warning leaves the Tab hint readable');
  const result = await typeTest(page, 300);
  assert.equal(result.isPb, true);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.deepEqual(await coveredBy(page), [], 'the warning sits between the hints and the progress text');
  await page.evaluate(() => document.querySelector('.sg-save-status').setAttribute('data-compact', 'true')); // folded after 6 s
  assert.deepEqual(await coveredBy(page), [], 'the folded badge leaves the Alt+Shift hint readable');
  // A sloppy result (accuracy under 75%) under that record gets the longest footer line: open or folded,
  // the warning still sits clear of it, on results and back on the test screen.
  const sloppy = await page.evaluate(() => {
    __game.start({ lang: 'en', mode: 'words', amt: 10, seed: 1 });
    __game.typeText(__game.words(10).map((w, i) => i % 3 ? w.replace(/./g, 'q') : w).join(' '), 250);
    return __game.results();
  });
  assert.equal(sloppy.valid, false);
  for (const screen of ['results', 'test']) {
    if (screen === 'test') await page.evaluate(() => __game.start({}));
    assert.equal(await page.evaluate(() => __game.state().screen), screen);
    assert.match(await page.locator('#progTxt').textContent(), /آخر نتيجة \d+ · رقمك القياسي هنا \d+$/);
    for (const compact of ['false', 'true']) {
      await page.evaluate(c => document.querySelector('.sg-save-status').setAttribute('data-compact', c), compact);
      assert.deepEqual(await coveredBy(page), [], `${screen}, folded: ${compact}`);
    }
  }
  assert.match(await page.locator('#progMini').getAttribute('title'), /الدقة \d+%/, 'the accuracy note moves to the tooltip');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:typing-test:hist')), null);
  assert.equal(await page.evaluate(() => __game.store.hist().length), 2, 'the progress window still shows the results');
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:typing-test:hist')).length), 2);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:typing-test:pbs'))['en|words|10|l']));
});

test('a double-click on "erase my results" only asks; erasing needs a second, separate click', async t => {
  const page = await game(t);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) { __game.start({ lang: 'en', mode: 'words', amt: 10, seed: 10 + i }); __game.typeText(__game.words(10).join(' '), 180); } __game.start({ lang: 'en', mode: 'words', amt: 10 }); });
  assert.equal(await page.evaluate(() => __game.store.hist().length), 3);
  await clickControl(page, '#progMini');
  await page.waitForTimeout(400);
  const box = await page.locator('#pReset').boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => __game.store.hist().length), 3, 'the results survive a double-click');
  assert.equal(await page.locator('#pReset.armed').count(), 1, 'the button asks for confirmation');
  await page.waitForTimeout(400);
  await page.locator('#pReset').click();
  assert.equal(await page.evaluate(() => __game.store.hist().length), 0, 'a deliberate second click still erases');
});

test('saved history and records that hold non-results load without them and still record new results', async t => {
  const page = await game(t, () => {
    const old = { t: 1, lang: 'en', mode: 'words', amt: 25, len: 1, wpm: 20, raw: 20, acc: 90, cons: 80 };
    localStorage.setItem('sg:typing-test:hist', JSON.stringify([null, 7, 'x', old]));
    localStorage.setItem('sg:typing-test:pbs', JSON.stringify({ 'en|words|10|l': null, 'en|words|25|l': { wpm: 20, acc: 90, raw: 20, cons: 80, t: 1 } }));
  });
  assert.match(await page.locator('#progTxt').textContent(), /آخر نتيجة 20/);
  const result = await typeTest(page, 300);
  assert.equal(result.isPb, true, 'the null record does not count as a previous best');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:typing-test:hist')).map(e => e.amt)), [25, 10]);
  assert.deepEqual(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sg:typing-test:pbs'))).sort()), ['en|words|10|l', 'en|words|25|l']);
  await page.locator('#bProg').click();
  assert.deepEqual([await page.locator('#histList .row').count(), await page.locator('#pbList .row').count()], [2, 2]);
});

test('a held Enter on "erase my results" only asks, however long it is held', async t => {
  const page = await game(t);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) { __game.start({ lang: 'en', mode: 'words', amt: 10, seed: 10 + i }); __game.typeText(__game.words(10).join(' '), 180); } __game.start({ lang: 'en', mode: 'words', amt: 10 }); });
  await clickControl(page, '#progMini');
  await page.locator('#pReset').focus();
  // A held key repeats its keydown; the repeats after 600 ms used to confirm.
  await page.keyboard.down('Enter');
  await page.waitForTimeout(700);
  for (let i = 0; i < 3; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert.equal(await page.evaluate(() => __game.store.hist().length), 3, 'the results survive a held Enter');
  assert.equal(await page.locator('#pReset.armed').count(), 1, 'the button asks for confirmation');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => __game.store.hist().length), 0, 'a separate press still erases');
});

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

test('race marks light up when the gliding ⚡ reaches them, and run forwards in English', async t => {
  const page = await game(t);
  // Words mode counts finished words only: the ⚡ waits at 0, then one tick puts it at 12 wpm, past the 🐇 (10).
  const cross = () => page.evaluate(() => {
    __game.start({ lang: 'en', mode: 'words', amt: 25, seed: 1 });
    const word = __game.words(1)[0], race = document.getElementById('race'), rabbit = race.querySelector('.ms');
    __game.typeText(word.slice(0, -1), 1000);
    const p0 = +race.style.getPropertyValue('--p');
    __game.typeText(word.slice(-1), 1000);
    return { p0, p: +race.style.getPropertyValue('--p'), mark: +rabbit.style.getPropertyValue('--p'), cls: rabbit.className,
      light: parseFloat(rabbit.style.transitionDelay), pop: parseFloat(rabbit.style.animationDelay),
      turned: [...race.querySelectorAll('.ms')].map(m => getComputedStyle(m).transform !== 'none') };
  });
  const r = await cross();
  assert.match(r.cls, /\bon\b.*\bhit\b/);
  const reach = 0.9 * (r.mark - r.p0) / (r.p - r.p0); // the 0.9 s glide is linear
  assert.ok(r.p0 < r.mark && r.mark < r.p && Math.abs(r.light - reach) < 0.02 && r.pop === r.light, JSON.stringify(r));
  assert.deepEqual(r.turned, [true, true, true, false], 'the animals turn to run left-to-right, the rocket does not');
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  const still = await cross();
  assert.deepEqual([still.light, still.pop], [0, 0], 'no glide to wait for with reduced motion');
  assert.equal(await page.evaluate(() => { __game.start({ lang: 'ar' }); return document.querySelectorAll('#race .lf').length; }), 3);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#race .lf')).transform), 'none', 'Arabic runs right-to-left');
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
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:typing-test:hist')), null);
  assert.equal(await page.evaluate(() => __game.store.hist().length), 1, 'the progress window still shows the result');
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:typing-test:hist')).length), 1);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:typing-test:pbs'))['en|words|10|l']));
});

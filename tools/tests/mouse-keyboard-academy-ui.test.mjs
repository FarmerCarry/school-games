// Browser checks for أكاديمية الفأرة واللوحة: damaged saves, stations, and no page scroll.
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

async function openGame(t, { init, query = '', reduced = false, viewport } = {}) {
  const context = await browser.newContext({
    viewport: viewport || { width: 1280, height: 720 },
    reducedMotion: reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  if (init) await page.addInitScript(init);
  await page.goto(`${server.origin}/games/mouse-keyboard-academy/${query}`);
  await page.waitForFunction(() => window.__game && window.__game.screen);
  return page;
}

test('a damaged save opens a playable map and a real save is kept', async t => {
  const damaged = await openGame(t, { init: () => localStorage.setItem('sg:mouse-keyboard-academy:save', '{not json') });
  assert.equal(await damaged.evaluate(() => __game.screen), 'map');
  assert.equal(await damaged.evaluate(() => __game.save.unlocked), 1);
  assert.equal(await damaged.locator('#btnStart').textContent(), 'ابدأ');

  const kept = await openGame(t, { init: () => localStorage.setItem('sg:mouse-keyboard-academy:save', JSON.stringify({
    v: 1, done: { move: true, nope: true }, unlocked: 2, name: 'ل'
  })) });
  const state = await kept.evaluate(() => ({ unlocked: __game.save.unlocked, move: __game.save.done.move === true, nope: __game.save.done.nope, name: __game.save.name }));
  assert.deepEqual(state, { unlocked: 2, move: true, nope: undefined, name: 'ل' });
  assert.equal(await kept.locator('.station[data-station="click"]').isEnabled(), true);
  assert.equal(await kept.locator('.station[data-station="double"]').isDisabled(), true);
});

test('a new student replaces progress only after the save succeeds', async t => {
  const page = await openGame(t, { init: () => localStorage.setItem('sg:mouse-keyboard-academy:save', JSON.stringify({
    v: 1, done: { move: true }, unlocked: 2, name: 'ل'
  })) });
  await page.locator('#btnNew').click();
  await page.locator('#btnYesReset').click();
  assert.equal(await page.evaluate(() => __game.save.unlocked), 1);
  assert.equal(await page.evaluate(() => __game.save.done.move), undefined);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:mouse-keyboard-academy:save')?.includes('"move":true')), false);
});

test('teacher station links open that station without marking it done', async t => {
  const page = await openGame(t, { query: '?station=double' });
  assert.equal(await page.evaluate(() => __game.screen), 'play');
  assert.equal(await page.evaluate(() => __game.station), 'double');
  assert.equal(await page.evaluate(() => __game.progress), 0);
  assert.equal(await page.evaluate(() => __game.save.done.double), undefined);
  assert.equal(await page.evaluate(() => __game.save.unlocked >= 3), true);
  const chest = page.locator('#chest');
  await chest.dblclick();
  await page.waitForFunction(() => __game.progress === 1);
  assert.equal(await page.evaluate(() => __game.screen), 'play');
});

test('arrows move the character and a letter key follows event.code', async t => {
  const arrows = await openGame(t, { query: '?station=arrows' });
  const before = await arrows.evaluate(() => document.querySelector('.mcell.player')?.getAttribute('data-x'));
  await arrows.keyboard.press('ArrowRight');
  const after = await arrows.evaluate(() => document.querySelector('.mcell.player')?.getAttribute('data-x'));
  assert.notEqual(after, before);
  assert.equal(await arrows.evaluate(() => __game.progress), 0);

  const letters = await openGame(t, { query: '?station=letters' });
  await letters.keyboard.press('a');
  assert.equal(await letters.evaluate(() => __game.progress), 0);
  await letters.keyboard.press('h');
  assert.equal(await letters.evaluate(() => __game.progress), 1);
  assert.match(await letters.locator('#langHint').textContent(), /الإنجليزية/);
  assert.equal(await letters.locator('#langHint').isVisible(), true);
});

test('drag, scroll, and a short window do not scroll the page', async t => {
  const drag = await openGame(t, { query: '?station=drag' });
  const fruit = await drag.locator('#fruit').boundingBox();
  const zone = await drag.locator('#zone').boundingBox();
  await drag.mouse.move(fruit.x + fruit.width / 2, fruit.y + fruit.height / 2);
  await drag.mouse.down();
  await drag.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 8 });
  await drag.mouse.up();
  assert.equal(await drag.evaluate(() => __game.progress), 1);

  const scroll = await openGame(t, { query: '?station=scroll', viewport: { width: 1100, height: 620 } });
  await scroll.waitForFunction(() => {
    const scroller = document.getElementById('scroller');
    return scroller && scroller.clientHeight > 80 && __game.progress === 0;
  });
  const pageScroll = await scroll.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.ok(pageScroll.sh <= pageScroll.ch + 1, `page height ${pageScroll.sh} > ${pageScroll.ch}`);
  assert.ok(pageScroll.sw <= pageScroll.cw + 1, `page width ${pageScroll.sw} > ${pageScroll.cw}`);
  await scroll.evaluate(() => {
    const scroller = document.getElementById('scroller');
    scroller.scrollTop = scroller.scrollHeight;
  });
  await scroll.waitForFunction(() => __game.progress === 3 || __game.screen === 'celebrate');
});

test('reduced motion still shows the station prompt', async t => {
  const page = await openGame(t, { reduced: true });
  await page.locator('#btnStart').click();
  await page.waitForFunction(() => __game.screen === 'play');
  assert.match(await page.locator('#prompt').innerText(), /حرّك الفأرة/);
  assert.equal(await page.locator('#prompt').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-sg-motion')), 'reduce');
});

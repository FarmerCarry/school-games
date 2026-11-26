import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { animationFrames, fontsReady } from '../page-wait.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const base = '/school-games/';
let browser, server, url;

before(async () => {
  server = await startTestServer(root, { base });
  url = server.origin + base;
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function newPage(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  return page;
}

async function slugs(page, selector = '#app .tile') {
  return page.locator(selector).evaluateAll(tiles => tiles.map(tile => tile.dataset.slug));
}

test('category chips replace the search box, and old search links open the home page', async t => {
  const page = await newPage(t);
  await page.goto(url + '#/search/pool');
  await page.waitForFunction(() => document.body.className === 'route-home');
  assert.equal(await page.locator('#q, #searchForm, .search').count(), 0, 'no search box');
  assert.ok(await page.locator('#chips a.chip[href^="#/c/"]').count() >= 5, 'category chips are shown');
  await page.locator('#chips a.chip[href="#/c/sports"]').click();
  await page.waitForFunction(() => document.body.className === 'route-cat');
  assert.ok((await slugs(page)).includes('pool-party'), 'a chip lists its games');
});

test('featured games lead the catalog in their stay-time rank', async t => {
  const page = await newPage(t);
  await page.goto(url);
  const order = await slugs(page, '.catalog-grid .tile');
  const ranked = await page.evaluate(() => GAMES.filter(g => typeof g.hot === 'number').sort((a, b) => a.hot - b.hot).map(g => g.slug));
  assert.ok(ranked.length >= 6, 'ranked featured games');
  assert.deepEqual(order.slice(1, 1 + ranked.length), ranked, 'the starter leads, then featured games by rank');
});

test('a round end offers one play-next game that hides when the next round starts', async t => {
  const page = await newPage(t);
  await page.goto(url + '#/play/tunnel-blitz');
  await page.waitForFunction(() => !document.querySelector('#stage').classList.contains('loading'), null, { timeout: 20000 });
  const kit = 'document.querySelector("#stage iframe").contentWindow.Kit';
  assert.equal(await page.isVisible('#nextCard'), false, 'no card before a round ends');
  await page.evaluate(`${kit}.stats.round('a'); ${kit}.stats.end('lose', 1)`);
  await page.waitForSelector('#nextCard.show');
  const pick = await page.getAttribute('#nextCard .next-go', 'data-next');
  assert.ok(pick && pick !== 'tunnel-blitz', 'another game is offered');
  assert.equal(await page.evaluate(s => !!GAMES.find(g => g.slug === s).hot, pick), true, 'the pick is a featured game');
  assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.closest && document.activeElement.closest('#nextCard')), true, 'the card does not take focus');
  await page.evaluate(`${kit}.stats.round('b')`);
  await page.waitForFunction(() => document.querySelector('#nextCard').hidden);
  // A round that restarts at once never shows the card.
  await page.evaluate(`${kit}.stats.end('lose'); ${kit}.stats.round('c')`);
  await page.waitForTimeout(1500);
  assert.equal(await page.isVisible('#nextCard'), false, 'a quick restart shows no card');
  // ✕ hides it for the rest of the visit.
  await page.evaluate(`${kit}.stats.end('lose')`);
  await page.waitForSelector('#nextCard.show');
  await page.locator('#nextCard .next-x').click();
  await page.evaluate(`${kit}.stats.round('d'); ${kit}.stats.end('win')`);
  await page.waitForTimeout(1500);
  assert.equal(await page.isVisible('#nextCard'), false, 'closed for this visit');
  // The card opens the game it offers.
  await page.click('#restartBtn');
  await page.waitForFunction(() => !document.querySelector('#stage').classList.contains('loading'), null, { timeout: 20000 });
  await page.evaluate(`${kit}.stats.round('e'); ${kit}.stats.end('lose')`);
  await page.waitForTimeout(1500);
  assert.equal(await page.isVisible('#nextCard'), false, 'a restart keeps the visit closed');
  await page.goto(url + '#/play/beat-dash');
  await page.waitForFunction(() => !document.querySelector('#stage').classList.contains('loading'), null, { timeout: 20000 });
  await page.evaluate(`${kit}.stats.round('a'); ${kit}.stats.end('lose')`);
  await page.waitForSelector('#nextCard.show');
  const next = await page.getAttribute('#nextCard .next-go', 'data-next');
  assert.notEqual(next, 'tunnel-blitz', 'a game played just now is not offered again');
  await page.click('#nextCard .next-go');
  await page.waitForFunction(s => location.hash === '#/play/' + s, next);
});

test('desktop and narrow grids retain DOM order, visible cards and RTL reading order', async t => {
  const page = await newPage(t);
  await page.goto(url);
  await fontsReady(page, 'portal catalog fonts');
  await page.evaluate(() => {
    window.savedTiles = Array.from(document.querySelectorAll('.catalog-grid .tile'));
  });
  const original = await slugs(page);
  for (const width of [1280, 390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await animationFrames(page, 2, `catalog layout at ${width}px`);
    const layout = await page.locator('.catalog-grid .tile').evaluateAll(tiles => tiles.map(tile => {
      const rect = tile.getBoundingClientRect(), style = getComputedStyle(tile);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display, visibility: style.visibility };
    }));
    assert.deepEqual(await slugs(page), original, `DOM order at ${width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `no page-wide horizontal overflow at ${width}px`);
    assert.equal(await page.evaluate(() => window.savedTiles.every((tile, index) => tile === document.querySelectorAll('.catalog-grid .tile')[index])), true, 'resize retains the same tile elements');
    for (let i = 0; i < layout.length; i++) {
      const tile = layout[i], previous = layout[i - 1];
      assert.ok(tile.width > 0 && tile.height > 0 && tile.display !== 'none' && tile.visibility !== 'hidden', `card ${i} remains visible at ${width}px`);
      assert.ok(tile.x >= -1 && tile.x + tile.width <= width + 1, `card ${i} fits the viewport at ${width}px`);
      if (previous) {
        assert.ok(tile.y >= previous.y - 1, 'DOM order never moves to an earlier visual row');
        if (Math.abs(tile.y - previous.y) < 1) assert.ok(tile.x < previous.x, 'each visual row reads right to left in DOM order');
      }
    }
  }
});

test('play keeps controls visible, offers keyboard-operable help and limits recommendations', async t => {
  const page = await newPage(t);
  await page.goto(url + '#/play/connect-four');
  await page.waitForFunction(() => {
    const stage = document.querySelector('#stage'), frame = stage?.querySelector('iframe');
    return stage && !stage.classList.contains('loading') && frame?.contentWindow?.Kit && frame.contentDocument.readyState === 'complete';
  });
  const help = page.locator('details.help');
  assert.equal(await help.getAttribute('open'), null, 'long help starts collapsed');
  assert.equal(await page.locator('.controls .ctl-list').isVisible(), true);
  assert.equal(await page.locator('.controls .exit-hint').isVisible(), true);
  assert.match(await page.locator('.controls .exit-hint').innerText(), /Shift \+ Tab/);
  const game = await page.evaluate(() => window.GAMES.find(game => game.slug === 'connect-four'));
  await help.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await help.evaluate(element => element.open), true, 'Enter opens help');
  assert.ok((await help.innerText()).includes(game.blurb));
  assert.ok((await help.innerText()).includes(game.tip));
  await page.keyboard.press('Space');
  assert.equal(await help.evaluate(element => element.open), false, 'Space closes help without sending focus to the game');
  assert.equal(await help.locator('summary').evaluate(element => document.activeElement === element), true);
  assert.equal(await page.locator('.controls .ctl-list').isVisible(), true, 'collapsing help preserves essential controls');
  const recommended = await slugs(page, '.recommendations .tile');
  assert.equal(recommended.length, 6);
  assert.equal(new Set(recommended).size, recommended.length);
  assert.equal(recommended.includes('connect-four'), false);
  assert.equal(await page.locator('.stage-loading svg').evaluate(element => getComputedStyle(element).animationName), 'none', 'loaded games do not keep the hidden spinner running');
});

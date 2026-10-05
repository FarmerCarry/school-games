import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
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

async function search(page, query) {
  await page.locator('#q').fill(query);
  await page.waitForFunction(q => document.body.className === 'route-search' && document.querySelector('#app h1 bdi')?.textContent === q, query);
}

test('fresh homepage contains each game once, with featured games first', async t => {
  const page = await newPage(t);
  await page.goto(url);
  assert.equal(await page.locator('.catalog-grid').count(), 1);
  assert.equal(await page.locator('.recent-grid').count(), 0);
  const games = await page.evaluate(() => window.GAMES.filter(game => !game.hidden));
  const expected = games.filter(game => game.hot).concat(games.filter(game => !game.hot)).map(game => game.slug);
  const actual = await slugs(page);
  assert.ok(games.length > 0, 'the catalog contains visible games');
  assert.equal(actual.length, games.length, 'the cleanup keeps the entire visible catalog');
  assert.equal(new Set(actual).size, actual.length, 'no repeated category or featured cards');
  assert.deepEqual(actual, expected);
});

test('continue-playing keeps only the six most recent known games', async t => {
  const page = await newPage(t);
  await page.goto(url);
  const recent = await page.evaluate(() => {
    const list = window.GAMES.filter(game => !game.hidden).slice(-10).map(game => game.slug);
    localStorage.setItem('sg:site:recent', JSON.stringify(['removed-game', ...list]));
    return list;
  });
  await page.reload();
  assert.deepEqual(await slugs(page, '.recent-grid .tile'), recent.slice(0, 6));
  const catalogCount = await page.evaluate(() => window.GAMES.filter(game => !game.hidden).length);
  assert.equal(await page.locator('.catalog-grid .tile').count(), catalogCount);
  assert.equal(await page.locator('#app .tile').count(), catalogCount + Math.min(6, recent.length), 'personalization adds at most six cards');
});

test('category filters show the complete matching set without unrelated suggestions', async t => {
  const page = await newPage(t);
  await page.goto(url);
  const categories = await page.evaluate(() => window.CATEGORIES.filter(category => window.GAMES.some(game => !game.hidden && game.cats.includes(category.id))).map(category => category.id));
  for (const category of categories) {
    await page.locator(`#chips a[href="#/c/${category}"]`).click();
    await page.waitForFunction(id => document.body.className === 'route-cat' && document.querySelector('#chips a[aria-current="page"]')?.getAttribute('href') === '#/c/' + id, category);
    const expected = await page.evaluate(id => window.GAMES.filter(game => !game.hidden && game.cats.includes(id)).map(game => game.slug).sort(), category);
    assert.deepEqual((await slugs(page)).sort(), expected, category);
    assert.equal(await page.locator(`#chips a[href="#/c/${category}"]`).getAttribute('aria-current'), 'page');
  }
});

test('favorites filter provides an empty state and only saved known games', async t => {
  const page = await newPage(t);
  await page.goto(url);
  await page.locator('#chips a[href="#/favorites"]').click();
  await page.waitForFunction(() => document.body.className === 'route-favorites');
  assert.equal(await page.locator('#chips a[href="#/favorites"]').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('#app .empty').isVisible(), true);
  assert.equal(await page.locator('#app .tile').count(), 0);
  await page.evaluate(() => localStorage.setItem('sg:site:favs', JSON.stringify(['pool-party', 'removed-game', 'air-hockey'])));
  await page.reload();
  assert.deepEqual(await slugs(page), ['pool-party', 'air-hockey']);
  assert.equal(await page.locator('.favorites-grid').count(), 1);
  assert.equal(await page.locator('#app .empty').count(), 0);
});

test('Arabic and fuzzy search retain focus and matching results without rebuilding navigation', async t => {
  const page = await newPage(t);
  await page.goto(url);
  await search(page, 'أربعة على التوالي');
  assert.deepEqual(await slugs(page), ['connect-four']);
  await page.evaluate(() => {
    window.savedChips = document.querySelector('#chips');
    window.savedLinks = Array.from(window.savedChips.children);
    window.savedHeader = document.querySelector('#logo');
  });
  for (const [query, expected] of [['اربعه على التوالي', 'connect-four'], ['connect foor', 'connect-four'], ['pool party', 'pool-party']]) {
    await search(page, query);
    assert.deepEqual(await slugs(page), [expected], query);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'q', 'typing focus stays in search');
    assert.equal(await page.evaluate(() => window.savedChips === document.querySelector('#chips') && window.savedHeader === document.querySelector('#logo') && window.savedLinks.every((node, index) => node === document.querySelector('#chips').children[index])), true, 'subsequent queries reuse all navigation nodes');
  }
});

test('desktop and narrow grids retain DOM order, visible cards and RTL reading order', async t => {
  const page = await newPage(t);
  await page.goto(url);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.savedTiles = Array.from(document.querySelectorAll('.catalog-grid .tile'));
  });
  const original = await slugs(page);
  for (const width of [1280, 390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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

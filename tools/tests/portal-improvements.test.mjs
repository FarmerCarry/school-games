import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
let browser, server, origin;
before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function pageFor(t) {
  if (!browser) browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  return page;
}
async function openGame(page, slug = 'air-hockey') {
  await page.goto(`${origin}/#/play/${slug}`);
  await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
  return page.frames().find(frame => frame.url().includes(`/games/${slug}/`));
}
function contrast(a, b) {
  const lum = hex => {
    const c = hex.map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);

test('every catalog game declares useful duration/input metadata and Pool Party supports friends', async () => {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(repo, 'js/catalog.js'), 'utf8'), context);
  for (const game of context.window.GAMES) {
    assert.ok(['one-button', 'pointer', 'keyboard', 'mixed'].includes(game.inputStyle), game.slug);
    assert.ok(game.roundMinutes === null || (game.roundMinutes.length === 2 && game.roundMinutes[0] > 0 && game.roundMinutes[1] >= game.roundMinutes[0]), game.slug);
  }
  assert.ok(context.window.GAMES.find(game => game.slug === 'pool-party').cats.includes('two-player'));
});

test('personal games appear first and quick filters select matching games', async t => {
  const page = await pageFor(t);
  await page.addInitScript(() => {
    localStorage.setItem('sg:site:recent', '["pool-party"]');
    localStorage.setItem('sg:site:favs', '["drift-king"]');
  });
  await page.goto(origin);
  assert.equal(await page.locator('#app > :first-child').getAttribute('class'), 'cat-rows mine');
  assert.equal(await page.locator('.mine .cat-sec').first().locator('.tile').getAttribute('data-slug'), 'pool-party');
  for (const id of ['short', 'simple', 'friends']) {
    await page.locator(`#quickFilters a[href="#/quick/${id}"]`).click();
    await page.waitForFunction(id => location.hash === `#/quick/${id}`, id);
    const slugs = await page.locator('#app .tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.slug));
    const expected = await page.evaluate(id => window.GAMES.filter(game => id === 'short' ? game.roundMinutes && game.roundMinutes[1] <= 3 : id === 'simple' ? game.inputStyle === 'one-button' : /[2-9]/.test(game.players)).map(game => game.slug), id);
    assert.deepEqual(slugs, expected, id);
    if (id === 'friends') assert.ok(slugs.includes('pool-party'));
  }
  await page.locator('#q').fill('pool');
  await page.waitForFunction(() => document.querySelector('#searchStatus').textContent.includes('واحدة'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q');
});

test('return to games restores the clicked section, keyboard focus, and scroll', async t => {
  const page = await pageFor(t);
  await page.goto(origin);
  const tile = page.locator('#app > section').last().locator('.tile[data-slug="air-hockey"]');
  await tile.scrollIntoViewIfNeeded();
  await tile.focus();
  const before = await tile.evaluate(el => ({ scroll: scrollY, heading: el.closest('section').querySelector('h2').textContent }));
  await tile.press('Enter');
  await page.locator('#backGames').waitFor();
  await page.locator('#backGames').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  const after = await page.evaluate(() => ({ scroll: scrollY, slug: document.activeElement.dataset.slug, heading: document.activeElement.closest('section')?.querySelector('h2')?.textContent }));
  assert.equal(after.slug, 'air-hockey');
  assert.equal(after.heading, before.heading);
  assert.ok(Math.abs(after.scroll - before.scroll) <= 2, `scroll ${before.scroll} -> ${after.scroll}`);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('tabindex')), null, 'restored tile remains in the natural tab order');
});

test('iframe load and foreign messages cannot fake readiness; timeout offers a working retry', async t => {
  const page = await pageFor(t);
  await page.clock.install();
  let requests = 0;
  await page.route('**/games/air-hockey/index.html', route => {
    requests++;
    return route.fulfill({ contentType: 'text/html', body: `<body><script>window.initialized=true;${requests > 1 ? "parent.postMessage({type:'sg:ready',version:1}, location.origin);" : ''}</script></body>` });
  });
  await page.goto(`${origin}/#/play/air-hockey`);
  const frame = page.frames().find(item => item.url().includes('/games/air-hockey/'));
  await frame.waitForFunction(() => window.initialized);
  assert.equal(await page.locator('#stage').getAttribute('aria-busy'), 'true', 'HTML load is not readiness');
  await page.evaluate(() => window.postMessage({ type: 'sg:ready', version: 1 }, location.origin));
  assert.equal(await page.locator('#stage').getAttribute('aria-busy'), 'true', 'wrong source window is rejected');
  await page.clock.fastForward(20001);
  assert.equal(await page.locator('#stageMsg').isVisible(), true);
  assert.match(await page.locator('#stageMsg').innerText(), /تعذّر تشغيل/);
  await page.locator('#gameRetry').click();
  await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
  assert.equal(requests, 2);
});

test('explicit startup failure offers recovery without waiting for timeout', async t => {
  const page = await pageFor(t);
  await page.route('**/games/air-hockey/index.html', route => route.fulfill({ contentType: 'text/html', body: '<script>parent.postMessage({type:"sg:error",version:1,message:"startup failed"}, location.origin)</script>' }));
  await page.goto(`${origin}/#/play/air-hockey`);
  await page.locator('#stageMsg').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#stage iframe').count(), 0, 'failed browsing context is disposed');
  await page.locator('#stageMsg a').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
});

test('a runtime failure disposes the game and rejects stale messages before retrying', async t => {
  const page = await pageFor(t);
  await page.clock.install();
  let requests = 0;
  await page.route('**/games/air-hockey/index.html', route => {
    requests++;
    return route.fulfill({ contentType: 'text/html', body: '<script>setInterval(function(){parent.runtimeTicks=(parent.runtimeTicks||0)+1},10);parent.postMessage({type:"sg:ready",version:1},location.origin)</script>' });
  });
  const frame = await openGame(page);
  await page.clock.fastForward(50);
  await page.evaluate(() => { window.failedWindow = document.querySelector('#stage iframe').contentWindow; });
  await frame.evaluate(() => parent.postMessage({ type: 'sg:error', version: 1, message: 'runtime failure' }, location.origin));
  await page.locator('#stageMsg').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#stage iframe').count(), 0);
  const ticks = await page.evaluate(() => window.runtimeTicks);
  await page.clock.fastForward(1000);
  assert.equal(await page.evaluate(() => window.runtimeTicks), ticks, 'failed game timers have stopped');
  await page.locator('#gameRetry').click();
  await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { source: window.failedWindow, origin: location.origin, data: { type: 'sg:error', version: 1 } })));
  assert.equal(await page.locator('#stageMsg').isVisible(), false, 'the removed game cannot fail its replacement');
  assert.equal(await page.locator('#stage iframe').count(), 1);
  assert.equal(requests, 2);
});

test('classroom changes stay transient across file games with separate saved preferences', async t => {
  const page = await pageFor(t);
  // Browsers differ in file:// storage scoping. Force per-path preference keys
  // so this regression stays covered even when a browser shares file storage.
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    const scoped = key => /^sg:site:(muted|motion)$/.test(key) ? location.pathname + ':' + key : key;
    Storage.prototype.getItem = function (key) { return get.call(this, scoped(key)); };
    Storage.prototype.setItem = function (key, value) { return set.call(this, scoped(key), value); };
    if (location.pathname.includes('/games/air-hockey/') && localStorage.getItem('sg:site:motion') === null) {
      localStorage.setItem('sg:site:muted', 'false'); localStorage.setItem('sg:site:motion', '"full"');
    }
    if (location.pathname.includes('/games/pool-party/') && localStorage.getItem('sg:site:motion') === null) {
      localStorage.setItem('sg:site:muted', 'true'); localStorage.setItem('sg:site:motion', '"system"');
    }
  });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '#/play/air-hockey');
  await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
  let frame = page.frames().find(item => item.url().includes('/games/air-hockey/'));
  assert.equal(await frame.evaluate(() => Kit.audio.muted || Kit.motion.reduced()), false);
  await page.locator('#classroom summary').click();
  await page.locator('#classroomMode').check();
  await frame.waitForFunction(() => Kit.audio.muted && Kit.motion.reduced());
  assert.deepEqual(await frame.evaluate(() => [localStorage.getItem('sg:site:muted'), localStorage.getItem('sg:site:motion')]), ['false', '"full"']);
  await page.evaluate(() => { location.hash = '#/play/pool-party'; });
  await page.waitForFunction(() => document.querySelector('#stage iframe')?.src.includes('/pool-party/') && document.querySelector('#stage').getAttribute('aria-busy') === 'false');
  frame = page.frames().find(item => item.url().includes('/games/pool-party/'));
  await frame.waitForFunction(() => Kit.audio.muted && Kit.motion.reduced());
  await page.locator('#classroomMode').uncheck();
  await frame.waitForFunction(() => Kit.audio.muted && !Kit.motion.reduced());
  await page.evaluate(() => { location.hash = '#/play/air-hockey'; });
  await page.waitForFunction(() => document.querySelector('#stage iframe')?.src.includes('/air-hockey/') && document.querySelector('#stage').getAttribute('aria-busy') === 'false');
  frame = page.frames().find(item => item.url().includes('/games/air-hockey/'));
  await frame.waitForFunction(() => !Kit.audio.muted && !Kit.motion.reduced());
  assert.equal(await frame.evaluate(() => Kit.motion.preference), 'full', 'the original game keeps its personal motion preference');
});

test('selected and hovered category chips and fullscreen controls meet normal text contrast', async t => {
  const page = await pageFor(t);
  await page.goto(origin);
  const colors = await page.locator('#chips .chip').evaluateAll(chips => chips.map(chip => ({ color: getComputedStyle(chip).getPropertyValue('--cc').trim(), text: chip.textContent })));
  for (const item of colors) {
    const channels = item.color.slice(1).match(/../g).map(value => parseInt(value, 16));
    assert.ok(contrast(channels, [255, 255, 255]) >= 4.5, item.text + ': ' + contrast(channels, [255, 255, 255]));
  }
  await openGame(page);
  for (const hover of [false, true]) {
    if (hover) await page.locator('#fsBtn').hover();
    // Sample at the end of the CSS transition, not its intermediate colors.
    await page.locator('#fsBtn').evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
    const colors = await page.locator('#fsBtn').evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    assert.ok(contrast(rgb(colors.foreground), rgb(colors.background)) >= 4.5, JSON.stringify(colors));
  }
});

test('classroom preset reaches the game and timed handoff pauses without replacing its frame', async t => {
  const page = await pageFor(t);
  await page.clock.install();
  const frame = await openGame(page);
  await page.locator('#classroom summary').click();
  await page.locator('#classroomMode').check();
  await frame.waitForFunction(() => Kit.audio.muted && Kit.motion.reduced());
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  await clickControl(frame, '#btnPlay');
  await frame.evaluate(() => { window.handoffSentinel = 'same-session'; });
  await page.clock.fastForward(300001);
  await page.locator('#sessionHandoff').waitFor({ state: 'visible' });
  assert.equal(await frame.evaluate(() => window.__game.state().paused), true);
  assert.equal(await frame.evaluate(() => window.handoffSentinel), 'same-session');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'sessionEnd');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'sessionFinish');
  await page.locator('#sessionFinish').click();
  assert.equal(await page.locator('#sessionHandoff').isVisible(), false);
  assert.equal(await frame.evaluate(() => window.__game.state().paused), true, 'continuing a round requires explicit in-game Resume');
  assert.equal(await frame.evaluate(() => window.handoffSentinel), 'same-session');
  await page.locator('#classroomMode').uncheck();
  await frame.waitForFunction(() => !Kit.audio.muted && Kit.motion.preference === 'system');
});

test('leaving portal fullscreen pauses the still-visible game', async t => {
  const page = await pageFor(t);
  const frame = await openGame(page);
  await page.locator('#fsBtn').click();
  await page.waitForFunction(() => document.fullscreenElement === document.querySelector('#stage'));
  await clickControl(frame, '#btnPlay');
  await page.evaluate(() => document.exitFullscreen());
  await frame.waitForFunction(() => window.__game.state().paused);
  const position = await frame.evaluate(() => window.__game.state().pucks);
  await frame.evaluate(() => window.__game.sim(2));
  assert.deepEqual(await frame.evaluate(() => window.__game.state().pucks), position);
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server, origin;
before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
});
after(async () => { await browser?.close(); await server?.close(); });
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

async function mockCompletedUpdate(page) {
  await page.addInitScript(() => {
    window.SG_OFFLINE_BUILD = true;
    window.SG_OFFLINE_VERSION = 'open-page';
    const mock = window.offlineUpdateTest = { hold: false, pending: [] };
    const active = new EventTarget(); active.state = 'activated';
    active.postMessage = (request, ports) => {
      const reply = () => ports[0].postMessage({ type: 'sg:offline-status', id: request.id,
        ready: true, count: 3, total: 3, version: 'completed-next-build' });
      if (mock.hold) mock.pending.push(reply); else reply();
    };
    const owner = Object.assign(new EventTarget(), { active, installing: null, waiting: null, update: async () => {} });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true,
      value: Object.assign(new EventTarget(), { controller: active, register: async () => owner }) });
  });
}

test('verified update waits through real game menus, play, pause and classroom handoff', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  await page.clock.install();
  const frame = await openGame(page);
  await frame.evaluate(() => { window.updateProgress = 'same-live-game'; });
  assert.equal(await page.evaluate(() => SGUpdateSafe()), false, 'title/menu still owns the iframe session');
  assert.equal(await page.locator('#offlineUpdate').isHidden(), true);
  await clickControl(frame, '#btnPlay');
  await frame.waitForFunction(() => !__game.state().demo && ['countdown', 'play', 'goal'].includes(__game.state().scene));
  assert.equal(await page.locator('#offlineUpdate').isHidden(), true);
  await frame.locator('#pauseBtn').click();
  await frame.waitForFunction(() => __game.state().paused);
  assert.equal(await page.evaluate(() => SGUpdateSafe()), false, 'paused match is not a safe refresh');
  await page.locator('#classroom summary').click();
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  await page.clock.fastForward(300001);
  await page.locator('#sessionHandoff').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => SGUpdateSafe()), false, 'handoff dialog keeps the game session');
  assert.equal(await page.locator('#offlineUpdate').isHidden(), true);
  assert.equal(await frame.evaluate(() => window.updateProgress), 'same-live-game');
  await page.locator('#sessionEnd').click();
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => SGUpdateSafe()), true);
  assert.equal(await page.locator('#stage iframe').count(), 0);
  assert.equal(await page.locator('#offlineRefresh').innerText(), 'حدّث الصفحة الآن');
});

test('verified update waits while the classroom timer runs or has expired between games', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  await page.clock.install();
  await page.goto(origin);
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  await page.locator('#classroom summary').click();
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  assert.equal(await page.locator('#offlineUpdate').isHidden(), true, 'a reload would drop the running timer');
  assert.equal(await page.evaluate(() => SGUpdateSafe()), false);
  await page.clock.fastForward(300001);
  await page.waitForFunction(() => document.querySelector('#sessionClock').textContent === '0:00');
  assert.equal(await page.locator('#offlineUpdate').isHidden(), true, 'the next game still owes the handoff');
  assert.equal(await page.evaluate(() => SGUpdateSafe()), false);
  await page.locator('#sessionStop').click();
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
});

test('refresh verification cannot discard a game launched while the status reply is pending', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  await page.goto(origin);
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  await page.evaluate(() => { window.offlineUpdateTest.hold = true; window.refreshRaceSentinel = 'same-document'; });
  await page.locator('#offlineRefresh').click();
  await page.waitForFunction(() => offlineUpdateTest.pending.length > 0);
  assert.equal(await page.evaluate(() => {
    location.hash = '#/play/air-hockey';
    return SGUpdateSafe();
  }), false, 'pending play route is unsafe even before hashchange renders it');
  await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false');
  const frame = page.frames().find(frame => frame.url().includes('/games/air-hockey/'));
  await frame.evaluate(() => { window.updateProgress = 'preserved-after-await'; });
  await page.evaluate(() => offlineUpdateTest.pending.splice(0).forEach(reply => reply()));
  await page.waitForFunction(() => !document.getElementById('offlineRefresh').disabled);
  assert.equal(await page.evaluate(() => refreshRaceSentinel), 'same-document');
  assert.equal(await frame.evaluate(() => window.updateProgress), 'preserved-after-await');
  assert.equal(await page.locator('#offlineUpdate').isHidden(), true);
  await page.locator('#backGames').click();
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => refreshRaceSentinel), 'same-document', 'closing the game is use: no reload at once');
});

test('a quiet home screen adopts a verified update by itself; other screens, a half-made player and input wait', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  await page.clock.install();
  const quiet = () => page.evaluate(() => SGUpdateQuiet());
  const same = () => page.evaluate(() => window.adoptSentinel === 'same document');
  await page.goto(`${origin}/#/favorites`);
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  await page.evaluate(() => { window.adoptSentinel = 'same document'; });
  assert.equal(await quiet(), -1, 'another screen');
  await page.clock.fastForward(5 * 60000);
  assert.ok(await same(), 'favorites are never reloaded by themselves');
  await page.locator('#chips a[href="#/"]').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  assert.ok(await quiet() >= 0 && await quiet() < 5000, 'the home screen, just used');
  await page.locator('#who [data-w="add"]').click();
  assert.equal(await quiet(), -1, 'a half-made player');
  await page.clock.fastForward(5 * 60000);
  assert.ok(await same());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => SGUpdateQuiet() >= 0);
  await page.clock.fastForward(60000);
  await page.mouse.move(200, 300);
  await page.mouse.move(220, 320);
  assert.ok(await quiet() < 5000, 'a pointer move is use');
  await page.clock.fastForward(60000);
  assert.ok(await same(), '60 s after the move');
  await Promise.all([page.waitForEvent('load'), page.clock.fastForward(20000)]);
  assert.equal(await page.evaluate(() => window.adoptSentinel), undefined, 'reloaded by itself, without a click');
  // The mocked page is still not the new build: once per tab and version, the button stays.
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  await page.evaluate(() => { window.adoptSentinel = 'same document'; });
  await page.clock.fastForward(5 * 60000);
  assert.ok(await same(), 'no reload loop');
});

test('a player sitting on the home screen is never reloaded by itself; after the idle hand-over the guest screen is', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  await page.clock.install();
  await page.goto(origin);
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  await page.locator('#who [data-w="add"]').click();
  await page.locator('#who [data-w="a:4"]').click();
  await page.locator('#who [data-w="c:0"]').click();
  await page.locator('#who [data-w="b:6-7"]').click();
  await page.waitForFunction(() => sessionStorage.getItem('sg:site:player') && document.querySelector('#who').className === 'who who-list');
  await page.evaluate(() => { window.adoptSentinel = 'same document'; });
  // A reload keeps the player but would end the child's statistics session and start another.
  assert.equal(await page.evaluate(() => SGUpdateQuiet()), -1, 'a selected player');
  await page.clock.fastForward(19 * 60000);
  assert.equal(await page.evaluate(() => window.adoptSentinel), 'same document', '19 quiet minutes with a player chosen');
  assert.equal(await page.locator('#offlineUpdate').isVisible(), true, 'the button still offers it');
  await Promise.all([page.waitForEvent('load'), page.clock.fastForward(2 * 60000)]);
  assert.equal(await page.evaluate(() => window.adoptSentinel), undefined, 'the idle hand-over made a guest, then it reloaded by itself');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:player') || 'guest'), 'guest');
});

test('a new player half made and left goes back to the list after 20 minutes, and the quiet home screen adopts the update', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  await page.clock.install();
  await page.goto(origin);
  await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
  await page.locator('#who [data-w="add"]').click();
  await page.locator('#who [data-w="a:2"]').click();
  await page.evaluate(() => { window.adoptSentinel = 'same document'; });
  assert.equal(await page.evaluate(() => SGUpdateQuiet()), -1, 'a half-made player');
  await page.clock.fastForward(19 * 60000);
  assert.equal(await page.evaluate(() => window.adoptSentinel), 'same document');
  assert.equal(await page.locator('#who').getAttribute('class'), 'who who-new', 'a child may still be choosing');
  await Promise.all([page.waitForEvent('load'), page.clock.fastForward(2 * 60000)]);
  assert.equal(await page.evaluate(() => window.adoptSentinel), undefined, 'reloaded by itself once the strip was back to its list');
  assert.equal(await page.evaluate(() => (JSON.parse(localStorage.getItem('sg:site:profiles') || '{}').list || []).length), 0, 'nothing was half saved');
});

test('personal games appear first and quick filters select matching games', async t => {
  const page = await pageFor(t);
  await page.addInitScript(() => {
    localStorage.setItem('sg:site:recent', '["pool-party"]');
    localStorage.setItem('sg:site:favs', '["drift-king"]');
  });
  await page.goto(origin);
  const starter = page.locator('#app > a.starter');
  assert.equal(await starter.count(), 1, 'the beginner card leads the home page');
  assert.equal(await starter.getAttribute('data-slug'), 'bubble-bop');
  assert.match(await starter.innerText(), /ابدأ من هنا/);
  assert.equal(await page.locator('#app > a.starter + section .recent-grid').count(), 1, 'continue playing appears before the complete catalog');
  assert.equal(await page.locator('.catalog-grid .tile').first().getAttribute('data-slug'), 'bubble-bop');
  assert.equal(await page.locator('.recent-grid .tile').getAttribute('data-slug'), 'pool-party');
  await page.locator('#chips a[href="#/favorites"]').click();
  await page.waitForFunction(() => document.body.className === 'route-favorites');
  assert.deepEqual(await page.locator('.favorites-grid .tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.slug)), ['drift-king'], 'favorites stay one click away without duplicating the catalog');
  for (const id of ['short', 'simple', 'friends']) {
    await page.locator(`#quickFilters a[href="#/quick/${id}"]`).click();
    await page.waitForFunction(id => location.hash === `#/quick/${id}` && document.body.className === 'route-quick' && document.querySelector(`#quickFilters a[href="#/quick/${id}"]`)?.getAttribute('aria-current') === 'page', id);
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
  // A fresh profile gains the «تابع اللعب» row above the list on return, which
  // moves every tile down; a known player's list keeps its layout and exact scroll.
  for (const recent of [null, '["air-hockey"]']) {
    const page = await pageFor(t);
    if (recent) await page.addInitScript(value => localStorage.setItem('sg:site:recent', value), recent);
    await page.goto(origin);
    const tile = page.locator('#app > section').last().locator('.tile[data-slug="air-hockey"]');
    await tile.scrollIntoViewIfNeeded();
    await tile.focus();
    const before = await tile.evaluate(el => ({ scroll: scrollY, heading: el.closest('section').querySelector('h2').textContent }));
    await tile.press('Enter');
    await page.locator('#backGames').waitFor();
    await page.locator('#backGames').click();
    await page.waitForFunction(() => document.body.className === 'route-home');
    const after = await page.evaluate(() => {
      const el = document.activeElement, box = el.getBoundingClientRect();
      return { scroll: scrollY, slug: el.dataset.slug, heading: el.closest('section')?.querySelector('h2')?.textContent,
        top: box.top, bottom: box.bottom, header: document.querySelector('.topbar').getBoundingClientRect().bottom };
    });
    assert.equal(after.slug, 'air-hockey');
    assert.equal(after.heading, before.heading);
    assert.ok(after.top >= after.header && after.bottom <= 900, `focused tile on screen (recent ${recent}): ${after.top}-${after.bottom}`);
    if (recent) assert.ok(Math.abs(after.scroll - before.scroll) <= 2, `scroll ${before.scroll} -> ${after.scroll}`);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('tabindex')), null, 'restored tile remains in the natural tab order');
  }
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
  await page.waitForFunction(() => {
    const iframe = document.querySelector('#stage iframe');
    return iframe.clientWidth === innerWidth && iframe.clientHeight === innerHeight && iframe.contentWindow.innerWidth === innerWidth && iframe.contentWindow.innerHeight === innerHeight;
  });
  await clickControl(frame, '#btnPlay');
  await frame.waitForFunction(() => !window.__game.state().demo && ['countdown', 'play', 'goal'].includes(window.__game.state().scene));
  await page.evaluate(() => document.exitFullscreen());
  await frame.waitForFunction(() => window.__game.state().paused);
  const position = await frame.evaluate(() => window.__game.state().pucks);
  await frame.evaluate(() => window.__game.sim(2));
  assert.deepEqual(await frame.evaluate(() => window.__game.state().pucks), position);
});

test('portal metadata preserves board controls at classroom laptop height and numeric ranges read left-to-right', async t => {
  const page = await pageFor(t);
  await page.setViewportSize({ width: 1280, height: 720 });
  const frame = await openGame(page, 'tic-tac-toe');
  await page.evaluate(() => document.fonts.ready);
  await frame.evaluate(() => document.fonts.ready);
  await frame.locator('#localButton').click();
  await frame.locator('#gameBoard [data-move="0"]').click();
  const geometry = () => page.evaluate(() => ({
    width: document.querySelector('#stage').getBoundingClientRect().width,
    bottom: document.querySelector('#playBar').getBoundingClientRect().bottom,
    height: innerHeight
  }));
  const initial = await geometry();
  assert.ok(initial.bottom <= initial.height, `play bar ends at ${initial.bottom}, beyond ${initial.height}px viewport`);
  const controls = await frame.locator('.match-actions button:visible').evaluateAll(buttons => buttons.map(button => {
    const box = button.getBoundingClientRect();
    return { id: button.id, top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: innerWidth, height: innerHeight };
  }));
  assert.ok(controls.length >= 2, 'pause and change-mode controls are present during play');
  for (const control of controls) {
    assert.ok(control.top >= 0 && control.bottom <= control.height && control.left >= 0 && control.right <= control.width, `${control.id} is clipped: ${JSON.stringify(control)}`);
  }
  // Repeated layout requests at the same viewport must converge to the same
  // frame width, rather than alternate at the play bar's wrapping breakpoint.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    // The handler also performs a trailing fit after its 120ms debounce.
    // Measure after that pass, not only the immediate resize callback.
    await page.waitForTimeout(150);
    const next = await geometry();
    assert.ok(Math.abs(next.width - initial.width) <= 1, `frame width oscillated: ${initial.width} -> ${next.width}`);
    assert.ok(next.bottom <= next.height, `resized play bar ends at ${next.bottom}`);
  }
  const range = await page.locator('.pb-meta .players').filter({ hasText: 'حوالي' }).evaluate(label => {
    const node = label.firstChild, index = node.textContent.indexOf('1–2');
    const first = document.createRange(), last = document.createRange();
    first.setStart(node, index); first.setEnd(node, index + 1);
    last.setStart(node, index + 2); last.setEnd(node, index + 3);
    return { first: first.getBoundingClientRect().x, last: last.getBoundingClientRect().x };
  });
  assert.ok(range.first < range.last, `duration range is visually reversed: ${JSON.stringify(range)}`);
});

test('minute counts agree with their number in round estimates and the session status', async t => {
  const page = await pageFor(t);
  await page.goto(origin);
  const tip = slug => page.locator(`#app .tile[data-slug="${slug}"]`).first().getAttribute('title');
  // 3-10 take دقائق, 11 and above دقيقة; a range agrees with its last number.
  assert.match(await tip('pool-party'), /⁦5–10⁩ دقائق للجولة/);
  assert.match(await tip('merge-2048'), /⁦5–15⁩ دقيقة للجولة/);
  await page.locator('#classroom summary').click();
  for (const [minutes, word] of [['10', 'دقائق'], ['15', 'دقيقة'], ['20', 'دقيقة']]) {
    await page.locator('#sessionMinutes').selectOption(minutes);
    await page.locator('#sessionStart').click();
    assert.equal(await page.locator('#sessionStatus').textContent(), `بدأت جلسة ${minutes} ${word}. يتوقف اللعب عند انتهاء الوقت.`);
  }
});

test('the classroom timer ignores a change of the PC clock during the lesson', async t => {
  const page = await pageFor(t);
  await page.clock.install();
  await openGame(page); // the handoff covers a running game
  await page.locator('#classroom summary').click();
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  // Windows corrects the clock by 20 minutes: the handoff must not appear early.
  await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 20 * 60000));
  await page.clock.fastForward(2000);
  assert.equal(await page.locator('#sessionHandoff').isHidden(), true, 'a clock jump does not end the session');
  await page.clock.fastForward(300000);
  await page.locator('#sessionHandoff').waitFor({ state: 'visible' });
});

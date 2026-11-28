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

test('verified update waits through real game menus, play, pause and search focus, then auto-reloads on return', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  await page.clock.install();
  const frame = await openGame(page);
  await page.evaluate(() => { window.portalLiveSentinel = 'same-portal-doc'; });
  await frame.evaluate(() => { window.updateProgress = 'same-live-game'; });
  assert.equal(await page.evaluate(() => SGUpdateSafe()), false, 'title/menu still owns the iframe session');
  assert.equal(await page.locator('#offlineUpdate').count(), 0, 'manual update banner is gone');
  await clickControl(frame, '#btnPlay');
  await frame.waitForFunction(() => !__game.state().demo && __game.state().screen === 'play');
  assert.equal(await page.evaluate(() => window.portalLiveSentinel), 'same-portal-doc');
  await frame.locator('#pauseBtn').click();
  await frame.waitForFunction(() => __game.state().paused);
  assert.equal(await page.evaluate(() => SGUpdateSafe()), false, 'paused match is not a safe refresh');
  assert.equal(await frame.evaluate(() => window.updateProgress), 'same-live-game');
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('#backGames').click()
  ]);
  assert.equal(await page.evaluate(() => window.portalLiveSentinel), undefined, 'closing the game auto-reloads into the verified build');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:offline:reloaded')), 'completed-next-build');
  assert.equal(await page.evaluate(() => SGUpdateSafe()), true);
});

test('refresh verification cannot discard a game launched while the status reply is pending', async t => {
  const page = await pageFor(t);
  await mockCompletedUpdate(page);
  const frame0 = await openGame(page);
  assert.ok(frame0);
  await page.evaluate(() => { window.offlineUpdateTest.hold = true; window.refreshRaceSentinel = 'same-document'; });
  await page.locator('#backGames').click();
  await page.waitForFunction(() => offlineUpdateTest.pending.length > 0);
  assert.equal(await page.evaluate(() => {
    location.hash = '#/play/air-hockey';
    return SGUpdateSafe();
  }), false, 'pending play route is unsafe even before hashchange renders it');
  await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false');
  const frame = page.frames().find(frame => frame.url().includes('/games/air-hockey/'));
  await frame.evaluate(() => { window.updateProgress = 'preserved-after-await'; });
  await page.evaluate(() => offlineUpdateTest.pending.splice(0).forEach(reply => reply()));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => refreshRaceSentinel), 'same-document');
  assert.equal(await frame.evaluate(() => window.updateProgress), 'preserved-after-await');
  await page.evaluate(() => { window.offlineUpdateTest.hold = false; });
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('#backGames').click()
  ]);
  assert.equal(await page.evaluate(() => window.refreshRaceSentinel), undefined, 'safe close later reloads cleanly');
});

test('storefront shelves, conditional starter, bento hero, hover hearts, roulette surprise, and quick filters work cleanly', async t => {
  // Fresh PC (no recent history): conditional compact starter banner appears above Bento Hero.
  const fresh = await pageFor(t);
  await fresh.goto(origin);
  const starter = fresh.locator('#app > a.starter');
  assert.equal(await starter.count(), 1, 'conditional starter banner appears when recent is empty');
  assert.equal(await starter.getAttribute('data-slug'), 'bubble-bop');
  assert.match(await starter.innerText(), /أول مرة مع الفأرة/);
  assert.equal(await fresh.locator('.bento-grid .tile').count(), 9, 'bento hero displays 1 flagship + 8 flanking S-tier tiles');
  assert.equal(await fresh.locator('.bento-grid .tile.hero-tile').first().getAttribute('data-slug'), 'tunnel-blitz');
  assert.equal(await fresh.locator('.catalog-grid .tile').first().getAttribute('data-slug'), 'tunnel-blitz', 'starter is never duplicated as tile #1');
  assert.equal(await fresh.locator('.new-grid .tile').count(), 8, 'new shelf highlights the 8 brand-new games');
  assert.ok(await fresh.locator('.friends-grid .tile').count() >= 6, '2-player shelf appears on home');

  // Hover-heart button toggles favorite without navigating and updates the nav badge + home shelf.
  await fresh.locator('.bento-grid .tile-fav[data-fav-slug="drift-king"]').click({ force: true });
  assert.equal(await fresh.evaluate(() => location.hash), '', 'hearting a home tile stays on home');
  assert.equal(await fresh.locator('#chips a[href="#/favorites"] .chip-cnt').textContent(), '1');
  assert.equal(await fresh.locator('#homeFavsWrap .favorites-grid .tile[data-slug="drift-king"]').count(), 1);

  // Returning PC (has recent history): starter banner hides; recent & favorites shelves appear cleanly.
  const page = await pageFor(t);
  await page.addInitScript(() => {
    localStorage.setItem('sg:site:recent', '["pool-party","critter-mart"]');
    localStorage.setItem('sg:site:favs', '["drift-king","critter-mart"]');
  });
  await page.goto(origin);
  assert.equal(await page.locator('#app > a.starter').count(), 0, 'starter banner hides once the PC has play history');
  assert.deepEqual(await page.locator('.recent-grid .tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.slug)), ['pool-party'], 'hidden duds stay out of recent shelf');
  assert.deepEqual(await page.locator('#homeFavsWrap .favorites-grid .tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.slug)), ['drift-king'], 'hidden duds stay out of favorites shelf');
  await page.locator('#chips a[href="#/favorites"]').click();
  await page.waitForFunction(() => document.body.className === 'route-favorites');
  assert.deepEqual(await page.locator('.favorites-grid .tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.slug)), ['drift-king']);

  for (const [id, inNav, heading] of [['hot', true, 'الأكثر حماسًا'], ['friends', true, 'العب مع صديق'], ['simple', true, 'زر واحد'], ['short', false, 'جولة قصيرة']]) {
    if (inNav) await page.locator(`#chips a[href="#/quick/${id}"]`).click();
    else await page.goto(`${origin}/#/quick/${id}`);
    await page.waitForFunction(([id, heading]) => location.hash === `#/quick/${id}` && document.body.className === 'route-quick' && document.querySelector('#app h1')?.textContent === heading, [id, heading]);
    const slugs = await page.locator('#app .tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.slug));
    const expected = await page.evaluate(id => {
      const visible = window.GAMES.filter(g => !g.hidden);
      if (id === 'hot') return visible.filter(g => g.hot).sort((a, b) => a.hot - b.hot).map(g => g.slug);
      return visible.filter(game => id === 'short' ? game.roundMinutes && game.roundMinutes[1] <= 3 : id === 'simple' ? game.inputStyle === 'one-button' : /[2-9]/.test(game.players)).map(game => game.slug);
    }, id);
    assert.deepEqual(slugs, expected, id);
    if (id === 'friends') assert.ok(slugs.includes('pool-party'));
  }

  // Roulette Surprise modal previews before navigating and excludes hidden/starter/recent.
  await page.locator('#logo').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  await page.locator('#surprise').click();
  await page.locator('#surprisePlay:not([disabled])').waitFor();
  const picked = await page.locator('#surprisePlay').getAttribute('data-slug');
  assert.ok(picked && picked !== 'bubble-bop' && picked !== 'pool-party', 'surprise excludes starter and recent');
  assert.equal(await page.evaluate(s => !!GAMES.find(g => g.slug === s && !g.hidden), picked), true, 'surprise excludes hidden duds');
  assert.equal(await page.evaluate(() => document.body.className), 'route-home', 'modal preview does not mount iframe prematurely');
  await page.locator('#surprisePlay').click();
  await page.waitForFunction(s => location.hash === '#/play/' + s, picked);
});

test('clicking mute or heart during play never blurs or pauses the active game', async t => {
  const page = await pageFor(t);
  const frame = await openGame(page, 'air-hockey');
  await clickControl(frame, '#btnPlay');
  await frame.waitForFunction(() => !__game.state().demo && __game.state().screen === 'play' && !__game.state().paused);
  await page.locator('#muteBtn').click();
  await page.locator('#favBtn').click();
  await page.waitForTimeout(120);
  assert.equal(await frame.evaluate(() => __game.state().paused), false, 'mute and heart keep gameplay unpaused');
  assert.equal(await page.locator('.side-next-grid .tile').count(), 3, '3-tile play-next rail is visible beside stage');
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

test('the portal sound button mutes a game opened from a folder, where it has its own storage', async t => {
  const page = await pageFor(t);
  // Browsers differ in file:// storage scoping. Force per-path preference keys so the
  // game cannot read the portal's stored mute and must follow the portal's message.
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    const scoped = key => /^sg:site:(muted|motion)$/.test(key) ? location.pathname + ':' + key : key;
    Storage.prototype.getItem = function (key) { return get.call(this, scoped(key)); };
    Storage.prototype.setItem = function (key, value) { return set.call(this, scoped(key), value); };
  });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '#/play/air-hockey');
  await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
  const frame = page.frames().find(item => item.url().includes('/games/air-hockey/'));
  assert.equal(await frame.evaluate(() => Kit.audio.muted), false);
  await page.locator('#muteBtn').click();
  await frame.waitForFunction(() => Kit.audio.muted);
  assert.equal(await page.locator('#muteBtn').getAttribute('aria-pressed'), 'true');
  await page.locator('#muteBtn').click();
  await frame.waitForFunction(() => !Kit.audio.muted);
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
  await frame.waitForFunction(() => !window.__game.state().demo && window.__game.state().screen === 'play');
  await page.evaluate(() => document.exitFullscreen());
  await frame.waitForFunction(() => window.__game.state().paused);
  const frozen = await frame.evaluate(() => ({ pucks: window.__game.state().pucks, t: window.__game.state().t }));
  await page.waitForTimeout(250);
  assert.deepEqual(await frame.evaluate(() => ({ pucks: window.__game.state().pucks, t: window.__game.state().t })), frozen);
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

test('minute counts agree with their number in round estimates', async t => {
  const page = await pageFor(t);
  await page.goto(origin);
  const tip = slug => page.locator(`#app .tile[data-slug="${slug}"]`).first().getAttribute('title');
  // 3-10 take دقائق, 11 and above دقيقة; a range agrees with its last number.
  assert.match(await tip('pool-party'), /⁦5–10⁩ دقائق للجولة/);
  assert.match(await tip('merge-2048'), /⁦5–15⁩ دقيقة للجولة/);
});


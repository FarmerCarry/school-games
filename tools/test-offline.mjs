#!/usr/bin/env node
/*
 * Browser regression tests for build caching, offline loading, updates (resumed after a
 * failed download, and adopted by an idle tab by itself in a persistent browser profile),
 * scope isolation, migration from shared legacy caches, and the emergency switch.
 *
 *   node tools/test-offline.mjs
 *   node tools/test-offline.mjs --scopes-only  # focus on migration and isolation
 *
 * Builds and changes only a disposable copy under the OS temporary directory. The
 * checkout and any existing _site/ build remain untouched, even when a check fails.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium, launchPersistentChromium } from './browser.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-offline-'));
const SOURCE = path.join(WORK, 'source');
const BASE = '/school-games/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const mounts = new Map();
const hits = [];
let stalePath = null;
let browser;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  hits.push(u.pathname + u.search);
  // A page outside every worker's scope can inspect registrations during forced
  // navigation by the kill switch without losing its JavaScript execution context.
  if (u.pathname === '/inspect/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Offline test inspector</title>');
    return;
  }
  const base = [...mounts.keys()].sort((a, b) => b.length - a.length).find(p => u.pathname.startsWith(p));
  if (!base) { res.writeHead(404); res.end(); return; }
  let rel = decodeURIComponent(u.pathname.slice(base.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const root = mounts.get(base);
  const fp = path.resolve(root, rel);
  if (!fp.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (u.pathname === stalePath) {
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'text/plain' });
    res.end('old content from a stale server');
    return;
  }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
});

function check(condition, message) {
  assert.ok(condition, message);
  console.log('✓ ' + message);
}
function build(name, ...args) {
  execFileSync(process.execPath, [path.join(SOURCE, 'tools/build.mjs'), ...args], { cwd: SOURCE, encoding: 'utf8' });
  const dir = path.join(WORK, name);
  fs.cpSync(path.join(SOURCE, '_site'), dir, { recursive: true });
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const version = sw.match(/VERSION = "([0-9a-f]+)"/)?.[1];
  const files = JSON.parse(sw.match(/(?:FILES|OWN_FILES) = (\{.*\}|\[.*\]);/)[1]);
  return { dir, version, files, count: Object.keys(files).length };
}
const cachePrefix = scope => 'sg-v2-' + encodeURIComponent(scope) + '|';
const cacheName = (scope, build) => cachePrefix(scope) + build.version;
async function state(inspector, scope, countNames = []) {
  return inspector.evaluate(async ({ scope, countNames }) => {
    const reg = await navigator.serviceWorker.getRegistration(scope);
    const names = (await caches.keys()).filter(name => name.startsWith('sg-'));
    const counts = {};
    // Opening a deleted cache recreates it. Cleanup observers must only list
    // names; count entries only in the specific caches expected to remain live.
    for (const name of countNames) {
      if (names.includes(name)) counts[name] = (await (await caches.open(name)).keys()).length;
    }
    return { active: reg?.scope === scope && !!reg.active, caches: names, counts };
  }, { scope, countNames });
}
async function waitFor(predicate, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + message);
}
async function installed(inspector, scope, build) {
  const name = cacheName(scope, build);
  await waitFor(async () => {
    const s = await state(inspector, scope, [name]);
    return s.active && s.counts[name] === build.count;
  }, 'install ' + scope);
}
async function update(page) {
  // Observe the worker's terminal install state instead of relying on a fixed delay.
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    let worker = registration.installing;
    const found = () => { worker = registration.installing; };
    registration.addEventListener('updatefound', found);
    try { await registration.update(); worker ||= registration.installing; }
    finally { registration.removeEventListener('updatefound', found); }
    if (!worker) return registration.active?.state;
    return new Promise(resolve => {
      const changed = () => {
        if (['activated', 'redundant'].includes(worker.state)) resolve(worker.state);
      };
      worker.addEventListener('statechange', changed);
      changed();
    });
  });
}
async function offlineReload(context, pages) {
  await context.setOffline(true);
  try {
    for (const page of pages) {
      await page.reload({ waitUntil: 'load' });
      assert.ok(await page.locator('#app .tile img').count() > 20, 'offline portal tiles');
    }
  } finally { await context.setOffline(false); }
}
async function openOfflineGame(page, slug) {
  const url = new URL('games/' + slug + '/index.html', page.url()).href;
  const [frame, response] = await Promise.all([
    page.waitForEvent('framenavigated', { predicate: frame => frame.parentFrame() === page.mainFrame() && frame.url() === url }),
    page.waitForResponse(response => response.url() === url && response.request().resourceType() === 'document'),
    page.evaluate(slug => { location.hash = '#/play/' + slug; }, slug)
  ]);
  assert.equal(response.status(), 200, slug + ' returns a successful document response');
  assert.ok(response.fromServiceWorker(), slug + ' document comes from the offline worker');
  await frame.waitForLoadState('load');
  assert.ok(await frame.locator('canvas, .sg-overlay, button').count() > 0, slug + ' initializes its game document');
  if (slug === 'connect-four' || slug === 'tic-tac-toe') {
    await frame.locator('#localButton').click();
    await frame.locator('#gameBoard [data-move="0"]').click();
    await frame.locator('#gameBoard [data-move="1"]').click();
    assert.equal(await frame.locator('#gameBoard').getAttribute('data-moves'), '2', slug + ' takes both local turns from cache');
    assert.equal(await frame.locator('#boardApp').getAttribute('data-mode'), 'local', slug + ' shared-PC play works entirely from cache');
    await frame.locator('#leaveMatch').click();
    await frame.locator('#pcButton').click();
    await frame.locator('#gameBoard [data-move="3"]').click();
    // This suite deliberately disables iframe animation frames; the board's AI
    // uses a timer, so observe it with timer polling rather than Playwright's RAF.
    await frame.waitForFunction(() => document.getElementById('gameBoard').dataset.moves === '2', undefined, { polling: 50 });
    assert.equal(await frame.locator('#boardApp').getAttribute('data-mode'), 'computer', slug + ' computer opponent plays entirely from cache');
  }
}
async function kill(inspector, page, scope, killBuild) {
  const base = new URL(scope).pathname;
  mounts.set(base, killBuild.dir);
  const navigated = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
  // Updating from the stable inspector avoids the kill switch's forced navigation
  // interrupting the evaluate call on a controlled application page.
  await inspector.evaluate(async scope => {
    const registration = await navigator.serviceWorker.getRegistration(scope);
    await registration.update();
  }, scope);
  await waitFor(async () => {
    const s = await state(inspector, scope);
    return !s.active && !s.caches.some(name => name.startsWith(cachePrefix(scope)));
  }, 'kill switch ' + scope);
  await navigated;
  await page.waitForLoadState('load');
}
// A school PC keeps one browser profile and often leaves the portal open all day. A newer
// verified build must replace an idle home-screen tab by itself, with no click, and never
// a tab with a game open: that one waits until the game is closed, the classroom timer is
// off and its home screen has been quiet again (js/offline.js QUIET, 75 s). The pages'
// clocks are fast-forwarded instead of waiting; the service worker keeps real time.
async function automaticAdoption(origin, v1, v2, v3) {
  const base = '/adopt/', scope = origin + base, profile = path.join(WORK, 'profile');
  const options = { viewport: { width: 1280, height: 720 } }, errors = [];
  const watch = page => { page.on('pageerror', error => errors.push(error.message)); return page; };
  const version = page => page.evaluate(() => window.SG_OFFLINE_VERSION);
  const sentinel = page => page.evaluate(() => window.adoptSentinel || null);
  // No readiness check in flight, so a jump in time cannot time it out.
  const settled = page => page.waitForFunction(() => document.getElementById('offlineStatus')?.dataset.state === 'ready' &&
    !document.getElementById('offlineRefresh').disabled);
  mounts.set(base, v1.dir);
  let pc = await launchPersistentChromium(profile, options);
  try {
    const first = watch(pc.pages()[0] || await pc.newPage());
    await first.goto(scope);
    await settled(first);
  } finally { await pc.close(); }
  check(true, 'a PC saves the build in its browser profile and is switched off');

  pc = await launchPersistentChromium(profile, options);
  try {
    await pc.clock.install();
    const inspector = await pc.newPage();
    await inspector.goto(origin + '/inspect/');
    const idle = watch(pc.pages()[0]), playing = watch(await pc.newPage());
    const response = await idle.goto(scope, { waitUntil: 'load' });
    await playing.goto(scope, { waitUntil: 'load' });
    await settled(idle); await settled(playing);
    check(response.fromServiceWorker() && await version(idle) === v1.version, 'after a restart the PC opens its saved build');
    await openOfflineGame(playing, 'merge-2048');
    const game = playing.frames().find(frame => frame.url().includes('/games/merge-2048/'));
    await game.evaluate(() => { window.adoptGame = 'same game'; });
    for (const page of [idle, playing]) await page.evaluate(() => { window.adoptSentinel = 'old document'; });

    mounts.set(base, v2.dir); // published while the portal stays open
    check(await update(idle) === 'activated', 'a newer build installs while both tabs stay open');
    await installed(inspector, scope, v2);
    await idle.locator('#offlineUpdate').waitFor({ state: 'visible' });
    await settled(idle);
    check(await sentinel(idle) === 'old document' && await playing.locator('#offlineUpdate').isHidden(),
      'the verified update waits for a quiet home screen and is not offered over a game');
    await Promise.all([idle.waitForEvent('load'), pc.clock.fastForward(80000)]);
    await settled(idle);
    check(await version(idle) === v2.version && !(await sentinel(idle)) && await idle.locator('#offlineUpdate').isHidden(),
      'after 80 s without input an idle home-screen tab adopts the new build by itself, without a click');
    check(await version(playing) === v1.version && await sentinel(playing) === 'old document' &&
      await game.evaluate(() => window.adoptGame) === 'same game', 'the tab with a game open is not reloaded');

    await playing.locator('#backGames').click();
    await playing.locator('#offlineUpdate').waitFor({ state: 'visible' });
    await settled(playing);
    await pc.clock.fastForward(30000);
    check(await sentinel(playing) === 'old document', 'closing the game is use: 30 s later the tab has not reloaded');
    await playing.locator('#classroom summary').click();
    await playing.locator('#sessionStart').click();
    await settled(playing);
    await pc.clock.fastForward(80000);
    check(await sentinel(playing) === 'old document', 'a running classroom timer keeps the document, however quiet');
    await playing.locator('#sessionStop').click();
    await settled(playing);
    await Promise.all([playing.waitForEvent('load'), pc.clock.fastForward(80000)]);
    await settled(playing);
    check(await version(playing) === v2.version && !(await sentinel(playing)),
      'with the game closed, the timer off and 80 s without input, that tab adopts the new build by itself too');
    await offlineReload(pc, [idle, playing]);
    check(await version(idle) === v2.version && await version(playing) === v2.version, 'both tabs work offline on the adopted build');
  } finally { await pc.close(); }

  mounts.set(base, v3.dir); // another evening publish while the PC is off
  pc = await launchPersistentChromium(profile, options);
  try {
    await pc.clock.install();
    const morning = watch(pc.pages()[0]);
    const response = await morning.goto(scope, { waitUntil: 'load' });
    check(response.fromServiceWorker() && await version(morning) === v2.version, 'the next morning the portal first opens the saved build');
    await morning.locator('#offlineUpdate').waitFor({ state: 'visible', timeout: 60000 });
    await settled(morning);
    await Promise.all([morning.waitForEvent('load'), pc.clock.fastForward(80000)]);
    await settled(morning);
    check(await version(morning) === v3.version, 'the first session after an evening publish adopts it by itself once the home screen is quiet');
  } finally { await pc.close(); }
  check(errors.length === 0, 'automatic adoption has no page errors: ' + errors.join(' | '));
}

try {
  for (const dir of ['games', 'js', 'css', 'shared', 'lib', 'icons', 'tools/lib']) {
    fs.cpSync(path.join(REPO, dir), path.join(SOURCE, dir), { recursive: true });
  }
  for (const file of ['index.html', 'teacher.html', 'manifest.webmanifest', 'favicon.svg', 'tools/build.mjs']) {
    fs.copyFileSync(path.join(REPO, file), path.join(SOURCE, file));
  }
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(SOURCE, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const v1 = build('v1');
  const repeat = build('v1-repeat');
  check(v1.version === repeat.version && fs.readFileSync(path.join(v1.dir, 'index.html')).equals(fs.readFileSync(path.join(repeat.dir, 'index.html'))) && fs.readFileSync(path.join(v1.dir, 'sw.js')).equals(fs.readFileSync(path.join(repeat.dir, 'sw.js'))), 'unchanged builds have identical page metadata and verified worker bytes');
  const gameFile = path.join(SOURCE, 'games/merge-2048/index.html');
  const original = fs.readFileSync(gameFile, 'utf8');
  fs.writeFileSync(gameFile, original.replace('</body>', '<!-- offline update regression -->\n</body>'));
  const v2 = build('v2');
  fs.writeFileSync(gameFile, original.replace('</body>', '<!-- stale update regression -->\n</body>'));
  const v3 = build('v3');
  const portalFile = path.join(SOURCE, 'index.html');
  fs.writeFileSync(portalFile, fs.readFileSync(portalFile, 'utf8').replace('</body>', '<!-- portal update after cache loss -->\n</body>'));
  const v4 = build('v4');
  const killBuild = build('kill', '--kill-sw');
  // Git can check source text out as CRLF on Windows; generated bytes stay LF.
  assert.equal(fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8').replace(/\r\n/g, '\n'), fs.readFileSync(path.join(killBuild.dir, 'sw.js'), 'utf8').replace(/\r\n/g, '\n'), 'root kill switch matches its generator');

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchChromium({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    if (window === window.top) return;
    // This suite checks offline resources and script initialization. Continuous 3D
    // rendering is covered by the game smoke tests and can starve iframe load events
    // when several SwiftShader browser suites share a CPU. Defer game animation
    // frames while keeping normal scripts, resource loads, timers, and portal behavior.
    let nextFrame = 0;
    window.requestAnimationFrame = () => ++nextFrame;
    window.cancelAnimationFrame = () => {};
  });
  const inspector = await context.newPage();
  await inspector.goto(origin + '/inspect/');
  // Reproduce a worker deleting a cache between the observer's names snapshot
  // and its next operation. Reading lifecycle state must not recreate that cache.
  const observerScope = origin + '/inspect/';
  const observerCache = cachePrefix(observerScope) + 'observer-regression';
  await inspector.evaluate(async name => {
    const cache = await caches.open(name);
    await cache.put('/inspect/asset', new Response('fixture'));
    const originalKeys = caches.keys.bind(caches);
    caches.keys = async () => {
      const names = await originalKeys();
      await caches.delete(name);
      caches.keys = originalKeys;
      return names;
    };
  }, observerCache);
  await state(inspector, observerScope);
  check(!(await state(inspector, observerScope)).caches.includes(observerCache), 'cleanup observation never recreates a deleted cache');
  if (!process.argv.includes('--scopes-only')) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    mounts.set(BASE, v1.dir);
    await page.goto(origin + BASE, { waitUntil: 'load' });
    await installed(inspector, origin + BASE, v1);
    check(true, `first visit stores all ${v1.count} files`);
    check(fs.existsSync(path.join(v1.dir, 'school-games-offline.zip')) && !Object.hasOwn(v1.files, 'school-games-offline.zip') &&
      !hits.some(hit => hit.includes('school-games-offline.zip')), 'the offline cache never downloads the offline ZIP');
    await page.waitForFunction(() => document.getElementById('offlineStatus')?.dataset.state === 'ready');
    check(true, 'portal announces readiness only after verifying the complete cache');
    check(await page.evaluate(version => window.SG_OFFLINE_VERSION === version && document.getElementById('offlineUpdate').hidden, v1.version), 'genuine first install has matching page/worker identity and no false update prompt');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.getElementById('offlineStatus').dataset.state === 'ready');
    check(await page.locator('#offlineUpdate').isHidden(), 'unchanged verified worker does not offer an update');
    // A registered worker is insufficient: an evicted file invalidates the UI
    // readiness claim even while the current portal remains open and usable.
    await context.setOffline(true);
    await inspector.evaluate(async ({ name, url }) => {
      await (await caches.open(name)).delete(url);
    }, { name: cacheName(origin + BASE, v1), url: origin + BASE + 'games/merge-2048/index.html' });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.getElementById('offlineStatus')?.dataset.state === 'unavailable');
    assert.equal(await page.locator('#offlineRetry').isVisible(), true, 'incomplete cache offers a retry');
    await context.setOffline(false);
    await page.waitForFunction(() => document.getElementById('offlineStatus')?.dataset.state === 'ready');
    check(true, 'cache eviction removes readiness and reconnect repairs it');
    await offlineReload(context, [page]);
    await context.setOffline(true);
    for (const slug of ['rail-rush', 'merge-2048', 'fire-and-ice', 'road-hopper', 'block-world', 'skybound-golf', 'connect-four', 'tic-tac-toe']) {
      await openOfflineGame(page, slug);
      check(true, 'offline game loads: ' + slug);
    }
    // The teacher statistics page is precached too: a teacher opens it on each PC,
    // often without internet. It reads only this browser's storage.
    const teacher = await context.newPage();
    teacher.on('pageerror', error => errors.push('teacher.html: ' + error.message));
    const teacherResponse = await teacher.goto(origin + BASE + 'teacher.html', { waitUntil: 'load' });
    assert.ok(teacherResponse.ok() && teacherResponse.fromServiceWorker(), 'teacher page comes from the offline worker');
    await teacher.waitForFunction(() => document.getElementById('source')?.dataset.copy === 'web' && !!document.querySelector('#gameTable'));
    assert.equal(await teacher.locator('#storageMsg').isHidden(), true, 'teacher page reads local storage offline');
    await teacher.close();
    check(true, 'offline teacher statistics page loads from cache');
    await page.evaluate(() => { location.hash = '#/'; });
    await context.setOffline(false);

    // Clearing CacheStorage alone does not unregister a worker or cause an
    // unchanged sw.js to install again. An online visit must repair every file.
    await inspector.evaluate(name => caches.delete(name), cacheName(origin + BASE, v1));
    check((await state(inspector, origin + BASE)).active, 'cache loss leaves the existing worker registered');
    await page.reload({ waitUntil: 'load' });
    await installed(inspector, origin + BASE, v1);
    await offlineReload(context, [page]);
    await context.setOffline(true);
    await openOfflineGame(page, 'typing-test');
    await page.evaluate(() => { location.hash = '#/'; });
    await context.setOffline(false);
    check(true, 'online cache repair restores the portal and an unvisited game for offline use');

    // A surviving worker must not serve or cache bytes from another version
    // when a missing resource is fetched from a stale or newly deployed server.
    const missingGame = origin + BASE + 'games/merge-2048/index.html';
    await inspector.evaluate(async ({ name, url }) => {
      await (await caches.open(name)).delete(url);
    }, { name: cacheName(origin + BASE, v1), url: missingGame });
    stalePath = BASE + 'games/merge-2048/index.html';
    const servedStale = await page.evaluate(async url => {
      try { await fetch(url); return true; } catch { return false; }
    }, missingGame);
    check(!servedStale, 'cache repair rejects stale network bytes instead of serving a mixed version');
    const cachedStale = await inspector.evaluate(async ({ name, url }) => {
      return !!(await (await caches.open(name)).match(url));
    }, { name: cacheName(origin + BASE, v1), url: missingGame });
    check(!cachedStale, 'rejected repair bytes never enter the active cache');
    stalePath = null;
    check(await page.evaluate(async url => (await fetch(url)).ok, missingGame), 'a failed cache repair can retry with verified server bytes');
    await installed(inspector, origin + BASE, v1);

    // Off the home screen, so this tab never reloads into the update by itself either.
    const otherTab = await context.newPage();
    await otherTab.goto(origin + BASE + '#/favorites');
    await otherTab.evaluate(() => { window.updateTabSentinel = 'unconsenting-tab'; });
    await openOfflineGame(page, 'connect-four');
    const liveGame = page.frames().find(frame => frame.url().includes('/games/connect-four/'));
    await liveGame.evaluate(() => { window.updateGameSentinel = 'same-game'; });
    await page.evaluate(() => { window.updateTabSentinel = 'consenting-tab'; });
    mounts.set(BASE, v2.dir);
    hits.length = 0;
    await update(page);
    await installed(inspector, origin + BASE, v2);
    const downloads = hits.filter(url => url.includes('?sg='));
    check(downloads.length === 2 && downloads.some(url => url.startsWith(BASE + 'games/merge-2048/index.html?')) && downloads.some(url => url.startsWith(BASE + 'index.html?')), 'update downloads only the changed game and portal build identity');
    check(!(await state(inspector, origin + BASE)).caches.includes(cacheName(origin + BASE, v1)), 'update removes only its old scoped cache');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await otherTab.evaluate(() => window.dispatchEvent(new Event('focus')));
    await otherTab.locator('#offlineUpdate').waitFor({ state: 'visible' });
    check(await page.locator('#offlineUpdate').isHidden() && await liveGame.evaluate(() => window.updateGameSentinel === 'same-game' && document.getElementById('gameBoard').dataset.moves === '2'), 'completed worker upgrade preserves the actual game and defers the refresh action');
    await page.locator('#backGames').click();
    await page.locator('#offlineUpdate').waitFor({ state: 'visible' });
    check(await page.locator('#offlineRefresh').innerText() === 'حدّث الصفحة الآن', 'safe game close reveals an explicit Arabic refresh action');
    if (process.env.SG_OFFLINE_EVIDENCE) {
      fs.mkdirSync(process.env.SG_OFFLINE_EVIDENCE, { recursive: true });
      for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.querySelectorAll('.tile img')].filter(img => {
            const box = img.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight;
          }).map(img => img.decode()));
        });
        await page.waitForFunction(() => [...document.querySelectorAll('.tile img')].filter(img => {
          const box = img.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight;
        }).every(img => img.complete && img.naturalWidth > 0 && img.closest('.tile').classList.contains('loaded') && getComputedStyle(img).opacity === '1'));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        check(await page.locator('#offlineUpdate').evaluate(el => {
          const box = el.getBoundingClientRect(), button = document.getElementById('offlineRefresh').getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && button.left >= box.left && button.right <= box.right;
        }), `settled Arabic update prompt and button fit ${viewport.width}px viewport`);
        await page.screenshot({ path: path.join(process.env.SG_OFFLINE_EVIDENCE, viewport.width === 1280 ? 'phase5-update-ready.png' : 'phase5-update-narrow.png') });
      }
    }
    await context.setOffline(true);
    try {
      await Promise.all([page.waitForEvent('load'), page.locator('#offlineRefresh').click()]);
      await page.waitForFunction(() => document.getElementById('offlineStatus').dataset.state === 'ready');
      check(await page.evaluate(version => window.SG_OFFLINE_VERSION === version && !window.updateTabSentinel && document.getElementById('offlineUpdate').hidden, v2.version), 'explicit refresh adopts the complete verified upgrade while offline without prompting again');
      check(await otherTab.evaluate(() => window.updateTabSentinel === 'unconsenting-tab' && !document.getElementById('offlineUpdate').hidden), 'refresh changes only the consenting tab; the other tab keeps its document');
    } finally { await context.setOffline(false); }
    await otherTab.close();

    mounts.set(BASE, v3.dir);
    stalePath = BASE + 'games/merge-2048/index.html';
    hits.length = 0;
    check(await update(page) === 'redundant', 'stale server bytes cause the new worker to fail installation');
    const afterStale = await state(inspector, origin + BASE, [cacheName(origin + BASE, v2), cacheName(origin + BASE, v3)]);
    check(afterStale.counts[cacheName(origin + BASE, v3)] === v3.count - 1 && afterStale.counts[cacheName(origin + BASE, v2)] === v2.count,
      `failed update keeps the ${v3.count - 1} files it verified and the previous complete version`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.getElementById('offlineStatus').dataset.state === 'ready');
    check(await page.locator('#offlineUpdate').isHidden(), 'failed upgrade never offers the incomplete version as an update');
    await offlineReload(context, [page]);
    check(await page.evaluate(version => window.SG_OFFLINE_VERSION === version, v2.version), 'the partial copy is never served: offline the PC keeps the complete version');
    // The filter still blocks that game page when a newer build is published.
    mounts.set(BASE, v4.dir);
    check(await update(page) === 'redundant', 'a newer publish fails on the same blocked page');
    const piled = await state(inspector, origin + BASE, [cacheName(origin + BASE, v2), cacheName(origin + BASE, v4)]);
    check(!piled.caches.includes(cacheName(origin + BASE, v3)) && piled.counts[cacheName(origin + BASE, v4)] === v4.count - 1 &&
      piled.counts[cacheName(origin + BASE, v2)] === v2.count && piled.caches.filter(name => name.startsWith(cachePrefix(origin + BASE))).length === 3,
      'it takes over the older partial copy and deletes it: the complete version and one marked partial copy, no pile-up');
    mounts.set(BASE, v3.dir); // that publish is rolled back
    // A slow or flaky school line: the next attempt resumes instead of starting from zero.
    stalePath = null;
    hits.length = 0;
    check(await update(page) === 'activated', 'the next attempt completes the failed update');
    const resumed = hits.filter(url => url.includes('?sg='));
    check(resumed.length === 1 && resumed[0].startsWith(BASE + 'games/merge-2048/index.html?'), 'the next attempt downloads only the file still missing');
    await installed(inspector, origin + BASE, v3);
    check(!(await state(inspector, origin + BASE)).caches.includes(cacheName(origin + BASE, v2)), 'the completed version replaces the previous one');
    await offlineReload(context, [page]);
    check(await page.evaluate(version => window.SG_OFFLINE_VERSION === version, v3.version), 'the resumed version works offline');
    await kill(inspector, page, origin + BASE, killBuild);
    check(true, 'kill switch unregisters its worker and removes its scoped cache');
    check(errors.length === 0, 'offline game initialization and updates have no page errors: ' + errors.join(' | '));

    // A cleared old cache must also recover after deployment changed the portal
    // itself. A rejected navigation cannot run the page's registration script.
    const recoveryBase = '/cache-loss-update/', recoveryScope = origin + recoveryBase;
    mounts.set(recoveryBase, v1.dir);
    const recoveryPage = await context.newPage();
    await recoveryPage.goto(recoveryScope);
    await installed(inspector, recoveryScope, v1);
    mounts.set(recoveryBase, v4.dir);
    await inspector.evaluate(name => caches.delete(name), cacheName(recoveryScope, v1));
    // The old worker may reject this navigation while the replacement installs.
    // Its failed-fetch path must request that update without help from the page.
    await recoveryPage.reload({ waitUntil: 'load' }).catch(() => {});
    await installed(inspector, recoveryScope, v4);
    await context.setOffline(true);
    try {
      await recoveryPage.goto(recoveryScope, { waitUntil: 'load' });
      check((await recoveryPage.content()).includes('portal update after cache loss'), 'cache loss with a newer server recovers to its complete portal version');
      await openOfflineGame(recoveryPage, 'merge-2048');
    } finally { await context.setOffline(false); }
    check(true, 'the replacement version works offline after the old cache and server bytes are gone');
    await recoveryPage.close();

    await automaticAdoption(origin, v1, v2, v3);
  }

  // Same-origin deployments must stay independent even when their build hashes match.
  // '-' survives encodeURIComponent, so a namespace delimiter of '-' would make
  // this child cache look like one of the parent's old versions during cleanup.
  const scopeA = origin + '/a/', scopeB = origin + '/a/-child/';
  mounts.set('/a/', v1.dir); mounts.set('/a/-child/', v1.dir);
  const a = await context.newPage(), b = await context.newPage();
  await a.goto(scopeA); await installed(inspector, scopeA, v1);
  await b.goto(scopeB); await installed(inspector, scopeB, v1);
  await offlineReload(context, [a, b]);
  const both = await state(inspector, scopeA, [cacheName(scopeA, v1), cacheName(scopeB, v1)]);
  check(both.counts[cacheName(scopeA, v1)] === v1.count && both.counts[cacheName(scopeB, v1)] === v1.count, 'same-version mounts have independent complete offline caches');
  mounts.set('/a/-child/', v2.dir);
  await update(b); await installed(inspector, scopeB, v2);
  await offlineReload(context, [a, b]);
  check((await state(inspector, scopeA, [cacheName(scopeA, v1)])).counts[cacheName(scopeA, v1)] === v1.count, 'updating one mount preserves the other mount offline');
  mounts.set('/a/', v2.dir);
  await update(a); await installed(inspector, scopeA, v2);
  await offlineReload(context, [a, b]);
  check((await state(inspector, scopeB, [cacheName(scopeB, v2)])).counts[cacheName(scopeB, v2)] === v2.count, 'updating a parent mount preserves its hyphen-prefixed child offline');
  await kill(inspector, a, scopeA, killBuild);
  await offlineReload(context, [b]);
  check((await state(inspector, scopeB, [cacheName(scopeB, v2)])).counts[cacheName(scopeB, v2)] === v2.count, 'killing one mount preserves the other mount offline');

  // Old cache names contained only a build hash. Seed one shared legacy cache with
  // two nested scopes and prove migration/cleanup never consume the other mount.
  const legacyA = origin + '/legacy/', legacyB = origin + '/legacy/child/';
  mounts.set('/legacy/', v1.dir); mounts.set('/legacy/child/', v1.dir);
  const legacyName = 'sg-' + v1.version;
  async function seedLegacy(corrupt = false) {
    await inspector.evaluate(async ({ name, scopes, files, corrupt }) => {
      const cache = await caches.open(name);
      for (const scope of scopes) {
        for (const [file, hash] of Object.entries(files)) {
          const url = new URL(file, scope).href;
          const response = await fetch(url);
          const headers = new Headers(response.headers);
          headers.set('x-sg-hash', hash);
          const body = corrupt && scope === scopes[0] && file === 'games/merge-2048/index.html'
            ? 'corrupted legacy bytes with an unchanged hash header' : await response.arrayBuffer();
          await cache.put(url, new Response(body, { headers }));
        }
      }
    }, { name: legacyName, scopes: [legacyA, legacyB], files: v1.files, corrupt });
  }
  await seedLegacy(true);
  hits.length = 0;
  const legacyPageA = await context.newPage();
  await legacyPageA.goto(legacyA); await installed(inspector, legacyA, v1);
  await waitFor(async () => (await state(inspector, legacyA, [legacyName])).counts[legacyName] === v1.count, 'legacy cleanup preserves nested scope');
  const migratedDownloads = hits.filter(url => url.includes('?sg='));
  check(migratedDownloads.length === 1 && migratedDownloads[0].startsWith('/legacy/games/merge-2048/index.html?'), 'legacy migration reuses verified bytes and refetches a corrupt entry');
  check((await state(inspector, legacyA, [legacyName])).counts[legacyName] === v1.count, 'legacy migration preserves every nested deployment entry');
  const legacyPageB = await context.newPage();
  await legacyPageB.goto(legacyB); await installed(inspector, legacyB, v1);
  await waitFor(async () => !(await state(inspector, legacyB)).caches.includes(legacyName), 'empty legacy cache removed');
  await offlineReload(context, [legacyPageA, legacyPageB]);
  check(true, 'both migrated deployments work offline and the empty legacy cache is removed');

  await seedLegacy();
  await kill(inspector, legacyPageA, legacyA, killBuild);
  const legacyRemainder = await inspector.evaluate(async name => (await (await caches.open(name)).keys()).map(request => request.url), legacyName);
  check(legacyRemainder.length === v1.count && legacyRemainder.every(url => url.startsWith(legacyB)), 'kill switch removes only its exact legacy file URLs');
  await offlineReload(context, [legacyPageB]);
  check(true, 'nested deployment stays offline after its parent deployment is killed');
  console.log('\nAll offline regression checks passed.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(WORK, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server, origin;
before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
});
after(async () => { await browser?.close(); await server?.close(); });

// The throw is the regression. Other page errors still fail the test.
async function pageFor(t, allowed = []) {
  if (!browser) browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => {
    const unexpected = errors.filter(message => !allowed.some(part => message.includes(part)));
    assert.deepEqual(unexpected, [], 'no unexpected browser errors');
  });
  return page;
}
async function openMerge(page) {
  await page.goto(`${origin}/#/play/merge-2048`);
  await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
  const frame = page.frames().find(item => item.url().includes('/games/merge-2048/'));
  await frame.waitForFunction(() => window.__game && window.__game.state().screen === 'title');
  return frame;
}
function throwSoon(frame, message) {
  return frame.evaluate(text => {
    window.addEventListener('error', function mark(event) {
      if (event.error && event.error.message === text) {
        window.__landed = text;
        window.removeEventListener('error', mark);
      }
    });
    setTimeout(() => { throw new Error(text); }, 0);
  }, message);
}

test('a stray error after merge-2048 is ready warns and leaves the iframe and board', async t => {
  const page = await pageFor(t, ['stray-mid-game']);
  const frame = await openMerge(page);
  await frame.evaluate(() => document.querySelector('#btnPlay').click());
  await frame.waitForFunction(() => window.__game.state().screen === 'play');
  const before = await frame.evaluate(() => {
    if (!window.__game.set([2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) throw new Error('board was not set');
    window.__keep = 'run';
    document.documentElement.dataset.keep = 'run';
    return window.__game.state();
  });
  await page.evaluate(() => { document.querySelector('#stage iframe').dataset.keep = 'run'; });
  await throwSoon(frame, 'stray-mid-game');
  await frame.waitForFunction(() => window.__landed === 'stray-mid-game');
  await page.waitForFunction(() => window.__sgWarns && window.__sgWarns.n === 1 && window.__sgWarns.last === 'stray-mid-game');
  await throwSoon(frame, 'stray-mid-game-again');
  await frame.waitForFunction(() => window.__landed === 'stray-mid-game-again');
  // Kit drops the second error before posting, so no second warning is in flight.
  assert.deepEqual(await page.evaluate(() => window.__sgWarns), { n: 1, last: 'stray-mid-game' });
  assert.equal(await page.locator('#stage iframe').count(), 1);
  assert.equal(await page.locator('#stageMsg').isHidden(), true);
  assert.equal(await page.locator('#stage').getAttribute('aria-busy'), 'false');
  assert.equal(await page.evaluate(() => document.querySelector('#stage iframe').dataset.keep), 'run');
  const after = await frame.evaluate(() => ({ keep: window.__keep, root: document.documentElement.dataset.keep, state: window.__game.state() }));
  assert.equal(after.keep, 'run');
  assert.equal(after.root, 'run');
  assert.equal(after.state.screen, 'play');
  assert.deepEqual(after.state.values, before.values);
  assert.equal(after.state.score, before.score);
  await frame.evaluate(() => window.__game.move(3));
  const played = await frame.evaluate(() => window.__game.state());
  assert.equal(played.screen, 'play');
  assert.notDeepEqual(played.values, before.values, 'the board still accepts a move');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.ok(!stored.includes('stray-mid-game'), 'warning text is not stored');
});

test('five runtime errors after ready pause the game and then show the error screen', async t => {
  const page = await pageFor(t, ['burst-']);
  const frame = await openMerge(page);
  await frame.evaluate(() => document.querySelector('#btnPlay').click());
  await frame.waitForFunction(() => window.__game.state().screen === 'play');
  await frame.evaluate(() => {
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4]);
    for (let i = 0; i < 5; i++) setTimeout(() => { throw new Error('burst-' + i); }, 0);
  });
  await page.locator('#stageMsg').waitFor({ state: 'visible', timeout: 5000 });
  assert.match(await page.locator('#stageMsg').innerText(), /تعذّر تشغيل/);
  assert.equal(await page.locator('#stage iframe').count(), 0);
  assert.equal(await page.locator('#gameRetry').isVisible(), true);
  const warns = await page.evaluate(() => window.__sgWarns);
  assert.equal(warns.n, 1);
  assert.equal(warns.last, 'burst-0');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.ok(!stored.includes('burst-'), 'error text is not stored');
  assert.ok(stored.includes('sg:merge-2048:'), 'the run saved before the frame was removed');
});

test('an error before ready still removes the frame and shows the error screen', async t => {
  const page = await pageFor(t, ['before ready']);
  // Installed in the game document itself. An init script only sees the frame's
  // initial about:blank, which is gone before kit.js runs.
  await page.route('**/games/merge-2048/index.html', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace(/<head[^>]*>/i, tag => tag +
      `<script>Object.defineProperty(window,"Kit",{configurable:true,set:function(value){Object.defineProperty(window,"Kit",{value:value,writable:true,configurable:true});throw new Error("before ready");}});</script>`);
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto(`${origin}/#/play/merge-2048`);
  await page.locator('#stageMsg').waitFor({ state: 'visible', timeout: 5000 });
  assert.match(await page.locator('#stageMsg').innerText(), /تعذّر تشغيل/);
  assert.equal(await page.locator('#stage iframe').count(), 0);
  assert.equal(await page.locator('#gameRetry').isVisible(), true);
  assert.equal(await page.evaluate(() => window.__sgWarns), undefined);
});

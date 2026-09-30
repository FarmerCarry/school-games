import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const base = '/school-games/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
let browser, server, origin;

before(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    const file = path.resolve(root, rel);
    if (!url.pathname.startsWith(base) || !file.startsWith(root + path.sep)) {
      res.writeHead(404).end(); return;
    }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
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

async function openGame(page, slug) {
  await page.goto(`${origin}${base}#/play/${slug}`);
  await page.waitForFunction(s => {
    const frame = document.querySelector('#stage iframe');
    return frame?.contentWindow?.Kit && frame.contentDocument.readyState === 'complete' && frame.src.includes(`/games/${s}/`);
  }, slug);
  return page.frames().find(frame => frame.url().endsWith(`/games/${slug}/index.html`));
}

test('inherited object names show the missing-route page', async t => {
  const page = await newPage(t);
  for (const route of ['play/__proto__', 'play/constructor', 'play/toString', 'c/__proto__', 'c/constructor']) {
    await page.goto(`${origin}${base}#/${route}`);
    await page.locator('#app .empty .big-btn').waitFor();
    assert.equal(await page.locator('#stage iframe').count(), 0, route);
    assert.match(await page.locator('#app .empty').innerText(), /لم نجد|مختبئة/, route);
  }
});

test('Tab reaches game menu controls and can leave the iframe', async t => {
  const page = await newPage(t);
  const frame = await openGame(page, 'pool-party');
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.tagName), 'BUTTON');
  let escaped = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement.tagName !== 'IFRAME')) { escaped = true; break; }
  }
  assert.ok(escaped, 'normal Tab navigation must reach the surrounding portal');
});

test('typing restart shortcut leaves controls, modals and Shift+Tab navigable', async t => {
  const page = await newPage(t);
  const frame = await openGame(page, 'typing-test');
  await frame.evaluate(() => window.__game.start({ lang: 'en', seed: 42 }));
  await page.keyboard.type('a');
  assert.equal(await frame.evaluate(() => window.__game.state().input), 'a');
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => window.__game.state().input), '');

  await frame.evaluate(() => window.__game.start({ lang: 'en', seed: 42 }));
  await page.keyboard.press('Shift+Tab');
  assert.equal(await frame.evaluate(() => window.__game.state().seed), 42);
  assert.notEqual(await frame.evaluate(() => document.activeElement.tagName), 'BODY');

  await frame.locator('#bTeacher').focus();
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.id), 'bCode');
  assert.equal(await frame.evaluate(() => window.__game.state().seed), 42);

  await frame.locator('#bTeacher').focus();
  await page.keyboard.press('Enter');
  assert.equal(await frame.evaluate(() => window.__game.state().modal), 'mTeacher');
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.hasAttribute('data-close')), true);
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.getAttribute('data-p')), '1');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.hasAttribute('data-close')), true);
  await page.keyboard.press('Space');
  assert.equal(await frame.evaluate(() => window.__game.state().modal), null);

  await frame.locator('#bCode').focus();
  await page.keyboard.press('Enter');
  const code = await frame.evaluate(() => window.__game.engine.makeCode(1, 123));
  await page.keyboard.type(code);
  await page.keyboard.press('Enter');
  assert.equal(await frame.evaluate(() => window.__game.state().code), code, 'typing a code then Enter still starts the challenge');
  assert.equal(await frame.evaluate(() => window.__game.state().modal), null);

  await frame.evaluate(() => {
    window.__game.start({ lang: 'en', seed: 42 });
    window.__game.typeText('a');
    window.__game.finish();
  });
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => window.__game.state().screen), 'results', 'Tab on results navigates without restarting');
  await frame.locator('#bRepeat').focus();
  await page.keyboard.press('Enter');
  assert.equal(await frame.evaluate(() => window.__game.state().seed), 42, 'Enter activates the focused repeat button');

  // Esc exposes settings; from there the ordinary tab sequence can leave the game.
  await frame.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Escape');
  assert.equal(await frame.evaluate(() => document.body.classList.contains('kbnav')), true);
  let escaped = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement.tagName !== 'IFRAME')) { escaped = true; break; }
  }
  assert.ok(escaped, 'typing settings must provide a keyboard path out of the iframe');
});

test('all game favicons resolve under a repository subpath', async () => {
  const games = await fs.readdir(path.join(root, 'games'), { withFileTypes: true });
  let count = 0;
  for (const game of games.filter(entry => entry.isDirectory())) {
    const url = `${origin}${base}games/${game.name}/index.html`;
    const response = await fetch(url);
    if (response.status === 404) continue;
    const html = await response.text();
    const icon = html.match(/<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i);
    assert.ok(icon, `${game.name} declares a favicon`);
    const iconUrl = new URL(icon[1], url).href;
    assert.equal(iconUrl, `${origin}${base}favicon.svg`, game.name);
    assert.equal((await fetch(iconUrl)).status, 200, game.name);
    count++;
  }
  assert.equal(count, 28);
});

test('Fire and Ice retains solo Tab switching and Shift+Tab can leave play', async t => {
  const page = await newPage(t);
  const frame = await openGame(page, 'fire-and-ice');
  await frame.evaluate(() => {
    window.__game.solo(true);
    window.__game.load(1);
    document.querySelector('canvas').focus();
  });
  const before = await frame.evaluate(() => ({ fire: window.__game.world.fire.x, ice: window.__game.world.ice.x }));
  await page.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.tagName), 'CANVAS');
  await page.keyboard.down('ArrowRight');
  await frame.waitForFunction(x => window.__game.world.ice.x > x + 1, before.ice);
  await page.keyboard.up('ArrowRight');
  assert.equal(await frame.evaluate(() => window.__game.world.fire.x), before.fire, 'Tab selected the ice player');
  await page.keyboard.press('Shift+Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'IFRAME');
  assert.equal(await frame.evaluate(() => window.__game.mode), 'paused');
});

test('Splat Strike retains its Tab scoreboard and Shift+Tab can leave play', async t => {
  const page = await newPage(t);
  // Exercise the supported drag-to-look fallback without depending on an OS
  // pointer-lock grant in the headless test runner.
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = undefined; });
  const frame = await openGame(page, 'splat-strike');
  await frame.evaluate(() => {
    window.__game.start({ skipCountdown: true });
    window.__game.god = true;
    window.__game.botsFrozen = true;
    document.querySelector('canvas').focus();
  });
  await page.keyboard.down('Tab');
  await frame.locator('#board').waitFor({ state: 'visible' });
  assert.equal(await frame.evaluate(() => document.activeElement.tagName), 'CANVAS');
  await page.keyboard.up('Tab');
  await frame.locator('#board').waitFor({ state: 'hidden' });
  await page.keyboard.press('Shift+Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'IFRAME');
  assert.equal(await frame.evaluate(() => window.__game.state.paused), true);
});

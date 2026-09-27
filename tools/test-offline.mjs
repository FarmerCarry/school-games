#!/usr/bin/env node
/*
 * End-to-end test of the offline cache (sw.js) in the fast build.
 *
 *   node tools/build.mjs && node tools/test-offline.mjs
 *
 * Serves _site/ under /school-games/ (like GitHub Pages) and checks, in a real Chromium:
 *   1. first visit: the service worker installs and stores every file of the build
 *   2. offline: the portal and several games (2D and 3D) still load, with no errors
 *   3. update: after a new build, only the changed files are downloaded, the new version
 *      takes over and the old cache is deleted
 *   4. stale server copy: if the server still sends an old file, the update is refused and
 *      the previous version keeps working
 *   5. kill switch (tools/build.mjs --kill-sw): the worker removes itself and its cache
 * Exits non-zero on the first failure. Leaves _site/ rebuilt as it was at the start.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(REPO, '_site');
const BASE = '/school-games/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

let staleFile = null, staleBody = null;   // simulate a CDN still serving an old copy
const hits = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  hits.push(u.pathname + u.search);
  if (!u.pathname.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  let rel = decodeURIComponent(u.pathname.slice(BASE.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const fp = path.join(SITE, rel);
  if (staleFile === rel) { res.writeHead(200, { 'content-type': MIME[path.extname(fp)] }); res.end(staleBody); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const build = (...a) => execFileSync('node', [path.join(REPO, 'tools/build.mjs'), ...a], { cwd: REPO, encoding: 'utf8' });
const swVersion = () => fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8').match(/VERSION = "([0-9a-f]+)"/)[1];
const fileCount = () => Object.keys(JSON.parse(fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8').match(/FILES = (\{.*\});/)[1])).length;

let failed = false;
function check(ok, msg) { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) failed = true; }

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).split('\n')[0]));

async function swState() {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const names = (await caches.keys()).filter(k => k.startsWith('sg-'));
    const counts = {};
    for (const n of names) counts[n] = (await (await caches.open(n)).keys()).length;
    return { active: !!(reg && reg.active), controlled: !!navigator.serviceWorker.controller, caches: counts };
  });
}
async function waitFor(fn, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(250); }
  return false;
}
async function openGame(slug) {
  await page.evaluate(s => { location.hash = '#/play/' + s; }, slug);
  const ok = await waitFor(async () => page.evaluate(() => {
    const f = document.querySelector('#stage iframe');
    try { return !!(f && f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.querySelector('canvas, .sg-overlay, button')); } catch (e) { return false; }
  }), 30000);
  return ok;
}

try {
  const v1 = swVersion(), n1 = fileCount();
  // 1. first visit
  await page.goto(origin + BASE, { waitUntil: 'load' });
  const installed = await waitFor(async () => { const s = await swState(); return s.active && s.caches['sg-' + v1] === n1; });
  check(installed, `first visit stores all ${n1} files (version ${v1})`);
  await page.reload({ waitUntil: 'load' });
  check((await swState()).controlled, 'page is served by the offline cache after reload');

  // 2. offline
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  const tiles = await page.evaluate(() => document.querySelectorAll('#app .tile img').length);
  check(tiles > 20, `portal works offline (${tiles} tiles with pictures)`);
  for (const slug of ['rail-rush', 'merge-2048', 'fire-and-ice', 'road-hopper', 'block-world']) {
    check(await openGame(slug), `offline: ${slug} loads`);
  }
  await page.evaluate(() => { location.hash = '#/'; });
  await ctx.setOffline(false);
  check(errors.length === 0, 'no page errors so far' + (errors.length ? ': ' + errors.join(' | ') : ''));

  // 3. update: change one game, rebuild, only that file should be downloaded
  const gameFile = path.join(REPO, 'games/merge-2048/index.html');
  const orig = fs.readFileSync(gameFile, 'utf8');
  fs.writeFileSync(gameFile, orig.replace('</body>', '<!-- sw update test -->\n</body>'));
  try { build(); } finally { fs.writeFileSync(gameFile, orig); }
  const v2 = swVersion();
  hits.length = 0;
  await page.reload({ waitUntil: 'load' });
  const updated = await waitFor(async () => { const s = await swState(); return s.caches['sg-' + v2] === fileCount() && !s.caches['sg-' + v1]; });
  check(updated && v2 !== v1, `update to ${v2} installed and the old cache was deleted`);
  const downloaded = hits.filter(h => h.includes('?sg='));
  check(downloaded.length === 1 && downloaded[0].includes('games/merge-2048/index.html'), `update downloaded only the changed file (${downloaded.join(', ') || 'none'})`);
  check(await openGame('merge-2048'), 'updated game loads');

  // 4. stale copy on the server: the update must be refused, the current version keeps working
  fs.writeFileSync(gameFile, orig.replace('</body>', '<!-- stale test -->\n</body>'));
  let staleVersion;
  try { build(); staleVersion = swVersion(); } finally { fs.writeFileSync(gameFile, orig); }
  staleFile = 'games/merge-2048/index.html';
  staleBody = 'old content from a stale server';
  await page.goto(origin + BASE, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  let s = await swState();
  check(!s.caches['sg-' + staleVersion] && s.caches['sg-' + v2] === fileCount(), 'stale server copy rejected; previous version still complete');
  check(await openGame('merge-2048'), 'game still loads from the previous version');
  staleFile = null;

  // 5. kill switch
  build('--kill-sw');
  await page.goto(origin + BASE, { waitUntil: 'load' });
  const gone = await waitFor(async () => { const st = await swState(); return !st.active && Object.keys(st.caches).length === 0; });
  check(gone, 'kill switch removes the worker and its caches');
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} catch (e) {
  check(false, 'test crashed: ' + e.message);
} finally {
  build();   // leave a normal build behind
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);

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
 * Tests an isolated copy of _site, so the validated release artifact is unchanged.
 * Exits non-zero if any check fails.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { MIME } from './test-server.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '_site');
if (!fs.existsSync(path.join(BUILD, 'sw.js'))) throw new Error('Run npm run build before npm run test:offline');
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-offline-'));
const SITE = path.join(TEMP_ROOT, 'site');
fs.cpSync(BUILD, SITE, { recursive: true });
const BASE = '/school-games/';
const ORIGINAL_SW = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
const ORIGINAL_FILES = JSON.parse(ORIGINAL_SW.match(/FILES = (\{.*\});/)[1]);
const ORIGINAL_GAME = fs.readFileSync(path.join(SITE, 'games/merge-2048/index.html'), 'utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);

let staleFile = null, staleBody = null;   // simulate a CDN still serving an old copy
const hits = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  hits.push(u.pathname + u.search);
  let rel;
  if (u.pathname === '/favicon.ico' || u.pathname === BASE + 'favicon.ico') rel = 'favicon.svg';
  else if (u.pathname.startsWith(BASE)) {
    try { rel = decodeURIComponent(u.pathname.slice(BASE.length)) || 'index.html'; }
    catch { res.writeHead(400); res.end(); return; }
  } else { res.writeHead(404); res.end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const fp = path.resolve(SITE, rel);
  const relative = path.relative(SITE, fp);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) { res.writeHead(403); res.end(); return; }
  if (staleFile === rel) { res.writeHead(200, { 'content-type': MIME[path.extname(fp)] }); res.end(staleBody); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
// Simulate a new published version in the temporary copy only. Use the same
// manifest order and hashing as build.mjs, without touching source or _site.
function publishUpdate(marker) {
  const rel = 'games/merge-2048/index.html';
  const game = path.join(SITE, rel);
  const body = ORIGINAL_GAME.replace('</body>', `<!-- ${marker} -->\n</body>`);
  fs.writeFileSync(game, body);
  const files = { ...ORIGINAL_FILES, [rel]: hash(body) };
  const version = hash(JSON.stringify(files));
  fs.writeFileSync(path.join(SITE, 'sw.js'), ORIGINAL_SW
    .replace(/VERSION = "[0-9a-f]+"/, 'VERSION = ' + JSON.stringify(version))
    .replace(/FILES = \{.*\};/, 'FILES = ' + JSON.stringify(files) + ';'));
  return version;
}
const swVersion = () => fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8').match(/VERSION = "([0-9a-f]+)"/)[1];
const fileCount = () => Object.keys(JSON.parse(fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8').match(/FILES = (\{.*\});/)[1])).length;

let failed = false;
function check(ok, msg) { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) failed = true; }

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('requestfailed', r => errors.push(r.url() + ' :: ' + r.failure()?.errorText));
page.on('response', r => { if (r.status() >= 400) errors.push(r.url() + ' :: HTTP ' + r.status()); });

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
  const ok = await waitFor(async () => page.evaluate(s => {
    const f = document.querySelector('#stage iframe');
    try {
      return !!(f && f.contentWindow.location.pathname.endsWith('/games/' + s + '/index.html') &&
        f.contentDocument.readyState === 'complete' && f.contentDocument.querySelector('canvas, .sg-overlay, button'));
    } catch (e) { return false; }
  }, slug), 30000);
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

  // 3. publish a changed game in the temporary site; only that file is downloaded
  const v2 = publishUpdate('sw update test');
  hits.length = 0;
  await page.reload({ waitUntil: 'load' });
  const updated = await waitFor(async () => { const s = await swState(); return s.caches['sg-' + v2] === fileCount() && !s.caches['sg-' + v1]; });
  check(updated && v2 !== v1, `update to ${v2} installed and the old cache was deleted`);
  const downloaded = hits.filter(h => h.includes('?sg='));
  check(downloaded.length === 1 && downloaded[0].includes('games/merge-2048/index.html'), `update downloaded only the changed file (${downloaded.join(', ') || 'none'})`);
  check(await openGame('merge-2048'), 'updated game loads');

  // 4. stale copy on the server: the update must be refused, the current version keeps working
  const staleVersion = publishUpdate('stale test');
  staleFile = 'games/merge-2048/index.html';
  staleBody = 'old content from a stale server';
  await page.goto(origin + BASE, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  let s = await swState();
  check(!s.caches['sg-' + staleVersion] && s.caches['sg-' + v2] === fileCount(), 'stale server copy rejected; previous version still complete');
  check(await openGame('merge-2048'), 'game still loads from the previous version');
  staleFile = null;

  // 5. kill switch
  fs.writeFileSync(path.join(SITE, 'sw.js'), fs.readFileSync(path.join(REPO, 'sw.js')));
  await page.goto(origin + BASE, { waitUntil: 'load' });
  const gone = await waitFor(async () => { const st = await swState(); return !st.active && Object.keys(st.caches).length === 0; });
  check(gone, 'kill switch removes the worker and its caches');
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} catch (e) {
  check(false, 'test crashed: ' + e.message);
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
  if (path.dirname(path.resolve(TEMP_ROOT)) !== path.resolve(os.tmpdir())) throw new Error('unexpected offline test directory');
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/*
 * Performance report for the site (headless Chromium, cold cache).
 *
 *   node tools/perf.mjs                 all games + the portal home page
 *   node tools/perf.mjs rail-rush ...   only these games ("portal" = home page)
 *   node tools/perf.mjs --json out.json also write the raw numbers
 *
 * Per page it reports:
 *   files / KB        requests and bytes a cold load needs (every file = one disk read on
 *                     a slow HDD, so fewer files matters more than fewer bytes)
 *   loadMs            navigation start -> load event
 *   scriptMs          main-thread script time during load
 *   longTasks         main-thread tasks > 50 ms during a ~20 s scripted play session (stutters)
 *   p95/maxFrame      frame intervals (ms) during play
 *   heapMB / +MB      JS heap after load, and growth after 20 s of play (after forced GC)
 *   saves/min, KB     localStorage writes per minute during play, and total bytes written
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

const argv = process.argv.slice(2);
let jsonOut = null;
const only = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--json') jsonOut = argv[++i]; else only.push(argv[i]); }

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/catalog.js'), 'utf8'), sandbox);
let targets = ['portal', ...sandbox.window.GAMES.map(g => g.slug)];
if (only.length) targets = targets.filter(t => only.includes(t));

const server = http.createServer((req, res) => {
  let fp = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc']
});

const INIT = () => {
  window.__perf = { saves: 0, saveBytes: 0, frames: [], long: 0 };
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__perf.saves++; window.__perf.saveBytes += String(k).length + String(v).length; return orig.call(this, k, v); };
  try { new PerformanceObserver(l => { window.__perf.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
};

async function measure(target) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  const reqs = new Map();
  cdp.on('Network.loadingFinished', e => reqs.set(e.requestId, e.encodedDataLength));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).split('\n')[0]));

  const url = target === 'portal' ? origin + '/index.html' : origin + `/games/${target}/index.html`;
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { load: n.loadEventEnd || n.duration, dcl: n.domContentLoadedEventEnd }; });
  await page.waitForTimeout(1500);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const loadFiles = reqs.size;
  const loadBytes = [...reqs.values()].reduce((a, b) => a + b, 0);
  await page.evaluate(() => window.gc && window.gc());
  const heap0 = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
  await page.evaluate(() => { window.__perf.saves = 0; window.__perf.saveBytes = 0; window.__perf.long = 0; });

  // ~20 s scripted play session with frame sampling.
  await page.evaluate(() => {
    const f = window.__perf.frames; let last = performance.now();
    (function tick(t) { f.push(t - last); last = t; if (f.length < 5000) requestAnimationFrame(tick); })(performance.now());
  });
  const t0 = Date.now();
  if (target !== 'portal') {
    await page.mouse.click(640, 360); await page.keyboard.press('Enter'); await page.keyboard.press(' ');
  }
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'KeyW', 'KeyA', 'KeyD'];
  let i = 0;
  while (Date.now() - t0 < 20000) {
    if (target === 'portal') { await page.mouse.wheel(0, i % 2 ? -600 : 600); await page.waitForTimeout(500); }
    else {
      const k = keys[i % keys.length];
      await page.keyboard.down(k); await page.waitForTimeout(250); await page.keyboard.up(k);
      await page.mouse.move(300 + (i * 97) % 700, 200 + (i * 53) % 350);
      if (i % 5 === 0) await page.mouse.click(640, 400);
      if (i % 15 === 14) { await page.keyboard.press('Enter'); await page.keyboard.press(' '); }
    }
    i++;
  }
  const secs = (Date.now() - t0) / 1000;
  const p = await page.evaluate(() => {
    const f = window.__perf.frames.slice(5).sort((a, b) => a - b);
    return { saves: window.__perf.saves, saveBytes: window.__perf.saveBytes, long: window.__perf.long,
      p95: f.length ? f[Math.floor(f.length * 0.95)] : 0, max: f.length ? f[f.length - 1] : 0, n: f.length };
  });
  await page.evaluate(() => window.gc && window.gc());
  const heap1 = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
  const m2 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  await ctx.close();
  return {
    target, files: loadFiles, kb: Math.round(loadBytes / 1024), loadMs: Math.round(nav.load), scriptMs: Math.round(m1.ScriptDuration * 1000),
    longTasks: p.long, p95Frame: Math.round(p.p95), maxFrame: Math.round(p.max),
    heapMB: +(heap0 / 1048576).toFixed(1), heapGrowMB: +((heap1 - heap0) / 1048576).toFixed(1),
    domNodes: m2.Nodes, savesPerMin: Math.round(p.saves / secs * 60), saveKB: Math.round(p.saveBytes / 1024), errors
  };
}

const rows = [];
for (const t of targets) {
  try { rows.push(await measure(t)); } catch (e) { rows.push({ target: t, error: String(e).split('\n')[0] }); }
  const r = rows[rows.length - 1];
  console.log(r.error ? `${t}: ERROR ${r.error}` :
    `${t.padEnd(14)} files=${String(r.files).padStart(3)} ${String(r.kb).padStart(5)}KB load=${String(r.loadMs).padStart(5)}ms script=${String(r.scriptMs).padStart(4)}ms ` +
    `long=${String(r.longTasks).padStart(3)} p95=${String(r.p95Frame).padStart(3)}ms max=${String(r.maxFrame).padStart(4)}ms heap=${String(r.heapMB).padStart(5)}MB +${r.heapGrowMB}MB ` +
    `saves/min=${r.savesPerMin} (${r.saveKB}KB)${r.errors.length ? ' ERR ' + r.errors[0] : ''}`);
}
await browser.close();
server.close();
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));

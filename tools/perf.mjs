#!/usr/bin/env node
/*
 * Performance report for the site (headless Chromium, cold cache).
 *
 *   node tools/perf.mjs                 all games + the portal home page
 *   node tools/perf.mjs rail-rush ...   only these games ("portal" = home page)
 *   node tools/perf.mjs --json out.json also write the raw numbers
 *
 * Per page it reports:
 *   --latency <ms>    synthetic response delay; this does not benchmark a real HDD
 *   files / KB        HTTP files and bytes in a fresh browser context; filesystem caching
 *                     and hardware still need separate measurements on a school PC
 *   loadMs            navigation start -> load event
 *   scriptMs          main-thread script time during load
 *   longTasks         main-thread tasks > 50 ms during a ~20 s scripted play session (stutters)
 *   p95/maxFrame      frame intervals (ms) during play
 *   heapMB / +MB      JS heap after load, and growth after 20 s of play (after forced GC)
 *   saves/min, KB     localStorage writes per minute during play, and total bytes written
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// SG_ROOT=_site tests the fast build made by tools/build.mjs instead of the source files.
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;

const argv = process.argv.slice(2);
let jsonOut = null, latency = 0;
const only = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--json') jsonOut = argv[++i];
  else if (argv[i] === '--latency') latency = +argv[++i];
  else only.push(argv[i]);
}

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js/catalog.js'), 'utf8'), sandbox);
let targets = ['portal', ...sandbox.window.GAMES.map(g => g.slug)];
if (only.length) targets = targets.filter(t => only.includes(t));

const { origin, close: closeServer } = await startTestServer(ROOT, { latency, cacheControl: 'max-age=600' });

const browser = await launchChromium({
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc']
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
  const reqs = new Map(), real = new Set();
  cdp.on('Network.requestWillBeSent', e => { if (/^https?:/.test(e.request.url)) real.add(e.requestId); });
  cdp.on('Network.loadingFinished', e => { if (real.has(e.requestId)) reqs.set(e.requestId, e.encodedDataLength); });
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
await closeServer();
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
process.exitCode = rows.some(row => row.error || row.errors.length) ? 1 : 0;

#!/usr/bin/env node
/*
 * Performance report for the site (cold/warm startup and active gameplay).
 *
 *   node tools/perf.mjs                 all games + the portal home page
 *   node tools/perf.mjs rail-rush ...   only these games ("portal" = home page)
 *   node tools/perf.mjs --json out.json also write the raw numbers
 *   node tools/perf.mjs --native-gpu --headed --seconds 60 rail-rush
 *   PLAYWRIGHT_CHANNEL=msedge node tools/perf.mjs --native-gpu --headed
 *
 * Per page it reports:
 *   --latency <ms>    synthetic response delay; this does not benchmark a real HDD
 *   files / KB        HTTP files and bytes in a fresh browser context; filesystem caching
 *                     and hardware still need separate measurements on a school PC
 *   loadMs/warmLoadMs  navigation start -> load event, before/after cache warming
 *   scriptMs          main-thread script time during load
 *   longTasks         main-thread tasks > 50 ms during the scripted play session (stutters)
 *   p95/maxFrame      frame intervals (ms) during play
 *   heapMB / +MB      JS heap after starting, and net growth after play (after forced GC)
 *                     restarts reports recoveries; reloads can lower the final heap
 *   saves/min, KB     localStorage writes per minute during play, and total bytes written
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { prepareScenario, runScenario, performInput, ensureActive } from './game-scenarios.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// SG_ROOT=_site tests the fast build made by tools/build.mjs instead of the source files.
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;

const argv = process.argv.slice(2);
let jsonOut = null, latency = 0, seconds = 20, headed = false;
let graphics = process.env.SG_GRAPHICS || 'software';
const only = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--json') { jsonOut = argv[++i]; if (!jsonOut || jsonOut.startsWith('--')) throw new Error('--json requires a path'); }
  else if (argv[i] === '--latency') latency = +argv[++i];
  else if (argv[i] === '--seconds') seconds = +argv[++i];
  else if (argv[i] === '--native-gpu') graphics = 'native';
  else if (argv[i] === '--headed') headed = true;
  else only.push(argv[i]);
}
if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--seconds must be greater than zero');
if (!Number.isFinite(latency) || latency < 0) throw new Error('--latency must be zero or greater');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js/catalog.js'), 'utf8'), sandbox);
let targets = ['portal', ...sandbox.window.GAMES.map(g => g.slug)];
const unknown = only.filter(t => !targets.includes(t));
if (unknown.length) {
  console.error('Unknown performance target: ' + unknown.join(', '));
  process.exit(1);
}
if (only.length) targets = targets.filter(t => only.includes(t));

const { origin, close: closeServer } = await startTestServer(ROOT, { latency, cacheControl: 'max-age=600' });

let browser;
try {
  browser = await launchChromium({
    graphics, headless: !headed,
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc']
  });
} catch (error) { await closeServer(); throw error; }
let renderer = 'unavailable';
try {
  const session = await browser.newBrowserCDPSession();
  const info = await session.send('SystemInfo.getInfo');
  renderer = info.gpu.auxAttributes?.glRenderer || info.gpu.devices.map(gpu => gpu.deviceString).join(', ') || renderer;
  await session.detach();
} catch { /* Renderer details are optional; keep the requested mode explicit. */ }
console.log(`Graphics: ${graphics}; ${headed ? 'visible window' : 'headless'}; renderer: ${renderer}`);
if (graphics === 'native' && /swiftshader|llvmpipe|software/i.test(renderer)) {
  console.warn('The browser still reports software rendering. These results do not measure the school PC GPU.');
}

const INIT = () => {
  window.__perf = { saves: 0, saveBytes: 0, frames: [], long: 0, measuring: false };
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__perf.saves++; window.__perf.saveBytes += String(k).length + String(v).length; return orig.call(this, k, v); };
  try { new PerformanceObserver(l => { window.__perf.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  let last = performance.now();
  const tick = t => {
    if (window.__perf.measuring) window.__perf.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function resetSample(page) {
  await page.evaluate(() => Object.assign(window.__perf, { saves: 0, saveBytes: 0, long: 0, frames: [], measuring: true }));
}
async function snapshot(page, drain = false) {
  return page.evaluate(drain => {
    const sample = { ...window.__perf, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 };
    if (drain) Object.assign(window.__perf, { saves: 0, saveBytes: 0, long: 0, frames: [] });
    return sample;
  }, drain);
}

async function measure(target) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    if (target !== 'portal') await prepareScenario(page, target);
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
    // Repeat navigation in the same context to measure browser-cache startup.
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const warmLoadMs = await page.evaluate(() => Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd));
    if (target !== 'portal') await runScenario(page, target, { mode: 'performance' });
    await page.evaluate(() => window.gc && window.gc());
    const heap0 = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
    await resetSample(page);
    const t0 = Date.now();
    const samples = [];
    let i = 0, restarts = 0, recoveryMs = 0;
    while (Date.now() - t0 < seconds * 1000) {
      if (target === 'portal') { await page.mouse.wheel(0, i % 2 ? -600 : 600); await page.waitForTimeout(500); }
      else {
        samples.push(await snapshot(page, true));
        const recoveryStart = Date.now();
        if (await ensureActive(page, target)) {
          restarts++;
          recoveryMs += Date.now() - recoveryStart;
          await resetSample(page);
        }
        await performInput(page, target, { repeat: true });
      }
      i++;
    }
    const secs = Math.max(0.001, (Date.now() - t0 - recoveryMs) / 1000);
    samples.push(await snapshot(page));
    const frames = samples.flatMap(s => s.frames).slice(5).sort((a, b) => a - b);
    const p = { saves: samples.reduce((n, s) => n + s.saves, 0), saveBytes: samples.reduce((n, s) => n + s.saveBytes, 0),
      long: samples.reduce((n, s) => n + s.long, 0), p95: frames[Math.floor(frames.length * 0.95)] || 0,
      max: frames.at(-1) || 0 };
    await page.evaluate(() => window.gc && window.gc());
    const heap1 = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
    const m2 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    return {
      target, graphics, renderer, headed, seconds: +secs.toFixed(2), restarts,
      files: loadFiles, kb: Math.round(loadBytes / 1024), loadMs: Math.round(nav.load), warmLoadMs, scriptMs: Math.round(m1.ScriptDuration * 1000),
      longTasks: p.long, p95Frame: Math.round(p.p95), maxFrame: Math.round(p.max),
      heapMB: +(heap0 / 1048576).toFixed(1), heapGrowMB: +((heap1 - heap0) / 1048576).toFixed(1),
      peakHeapMB: +(Math.max(heap0, heap1, ...samples.map(s => s.heap)) / 1048576).toFixed(1),
      domNodes: m2.Nodes, savesPerMin: Math.round(p.saves / secs * 60), saveKB: Math.round(p.saveBytes / 1024), errors
    };
  } finally { await ctx.close(); }
}

const rows = [];
for (const t of targets) {
  try { rows.push(await measure(t)); } catch (e) { rows.push({ target: t, error: String(e).split('\n')[0] }); }
  const r = rows[rows.length - 1];
  console.log(r.error ? `${t}: ERROR ${r.error}` :
    `${t.padEnd(14)} files=${String(r.files).padStart(3)} ${String(r.kb).padStart(5)}KB cold/warm=${r.loadMs}/${r.warmLoadMs}ms script=${String(r.scriptMs).padStart(4)}ms ` +
    `long=${String(r.longTasks).padStart(3)} p95=${String(r.p95Frame).padStart(3)}ms max=${String(r.maxFrame).padStart(4)}ms heap=${String(r.heapMB).padStart(5)}MB +${r.heapGrowMB}MB ` +
    `saves/min=${r.savesPerMin} (${r.saveKB}KB) restarts=${r.restarts}${r.errors.length ? ' ERR ' + r.errors[0] : ''}`);
}
await browser.close();
await closeServer();
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
process.exitCode = rows.some(row => row.error || row.errors.length) ? 1 : 0;

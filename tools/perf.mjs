#!/usr/bin/env node
/* Repeatable startup + real-UI gameplay report. No product instrumentation.
 * SG_ROOT=_site PLAYWRIGHT_CHANNEL=msedge node tools/perf.mjs
 *   --samples 5 --seconds 8 --json artifacts/perf.json portal hoop-heads splat-strike
 * --latency is synthetic HTTP response delay, never a physical HDD measurement.
 * Warm means HTTP-cache-warmed, with service workers blocked and storage reset.
 * First useful is a fonts/layout/two-rAF paint-opportunity proxy; playable is a
 * real Start action, natural countdown completion and a painted active state.
 * Input response is separately proven by the existing real movement scenario.
 * Headless/software frame intervals describe this harness, not classroom FPS.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { scenarios, prepareScenario, runScenario, performInput, ensureActive } from './game-scenarios.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 1280, height: 720 };
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const round = value => +value.toFixed(3);
const TIMINGS = ['loadMs', 'dclMs', 'firstUsefulMs', 'readyForStartMs', 'startRequestedMs', 'playableMs', 'startToPlayableMs', 'inputResponsiveMs', 'startToInputMs', 'scriptToInputMs'];

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  const quantile = q => {
    const index = (sorted.length - 1) * q, lo = Math.floor(index), hi = Math.ceil(index);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  };
  const median = quantile(0.5);
  const deviations = sorted.map(value => Math.abs(value - median)).sort((a, b) => a - b);
  const mid = Math.floor(deviations.length / 2);
  return { n: sorted.length, median: round(median), min: round(sorted[0]), max: round(sorted.at(-1)),
    p10: round(quantile(0.1)), p90: round(quantile(0.9)),
    mad: round(deviations.length % 2 ? deviations[mid] : (deviations[mid - 1] + deviations[mid]) / 2) };
}

export function parseArgs(argv) {
  const options = { samples: 1, seconds: 20, latency: 0, graphics: process.env.SG_GRAPHICS || 'software', headed: false, json: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (['--json', '--samples', '--seconds', '--latency'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(arg + ' requires a value');
      options[arg.slice(2)] = arg === '--json' ? value : Number(value);
    } else if (arg === '--native-gpu') options.graphics = 'native';
    else if (arg === '--headed') options.headed = true;
    else if (arg.startsWith('--')) throw new Error('Unknown option: ' + arg);
    else options.targets.push(arg);
  }
  if (!Number.isSafeInteger(options.samples) || options.samples < 1) throw new Error('--samples must be a positive integer');
  if (!Number.isFinite(options.seconds) || options.seconds <= 0) throw new Error('--seconds must be greater than zero');
  if (!Number.isFinite(options.latency) || options.latency < 0) throw new Error('--latency must be zero or greater');
  if (!['software', 'native'].includes(options.graphics)) throw new Error('SG_GRAPHICS must be software or native');
  return options;
}

// Exported only for the delayed-startup/active-window fixture tests.
export function installObservers({ target, active, ready }) {
  const p = window.__perf = { target, saves: 0, saveBytes: 0, frames: [], long: [], measuring: false,
    firstUsefulMs: null, readyForStartMs: null, startRequestedMs: null, playableMs: null, inputResponsiveMs: null };
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (p.measuring) { p.saves++; p.saveBytes += String(key).length + String(value).length; }
    return original.call(this, key, value);
  };
  try { new PerformanceObserver(list => {
    if (p.measuring) p.long.push(...list.getEntries().filter(entry => entry.startTime >= p.activityStart).map(entry => ({ start: entry.startTime, duration: entry.duration })));
  }).observe({ type: 'longtask', buffered: true }); } catch { /* Optional in other engines. */ }
  const activePredicate = new Function('return !!(' + active + ')');
  const readyPredicate = new Function('return !!(' + ready + ')');
  const playable = () => { try { return activePredicate() && readyPredicate(); } catch { return false; } };
  const laidOut = element => {
    if (!element || element.closest('[hidden]')) return false;
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const visible = element => {
    if (!laidOut(element)) return false;
    for (let node = element; node; node = node.parentElement) {
      if (getComputedStyle(node).opacity !== '1') return false;
    }
    return true;
  };
  const decoded = new WeakMap();
  function artworkReady(img) {
    if (!img.complete || !img.naturalWidth || !visible(img)) return false;
    const src = img.currentSrc || img.src, previous = decoded.get(img);
    if (previous?.src === src) return previous.ready;
    const entry = { src, ready: false };
    decoded.set(img, entry);
    img.decode().then(() => { entry.ready = (img.currentSrc || img.src) === src; }, () => {});
    return false;
  }
  function usefulScreen() {
    if (document.readyState === 'loading' || document.fonts.status !== 'loaded') return false;
    if (target === 'portal') {
      const images = [...document.querySelectorAll('.catalog-grid .tile img')].filter(laidOut);
      return visible(document.getElementById('q')) && images.length > 0 && images.every(artworkReady);
    }
    if (target === 'hoop-heads') return visible(document.getElementById('scrTitle')) && visible(document.querySelector('[data-act="cpu"]'));
    if (target === 'splat-strike') return visible(document.getElementById('title')) && visible(document.getElementById('playBtn')) && document.getElementById('mapSeg')?.children.length > 0;
    if (target === 'typing-test') return visible(document.getElementById('testView')) &&
      visible(document.getElementById('wordsBox')) && document.getElementById('words')?.children.length > 0;
    if (target === 'connect-four' || target === 'tic-tac-toe') return visible(document.getElementById('boardApp')) &&
      visible(document.getElementById('localButton')) && visible(document.getElementById('pcButton'));
    // Generic canvas games need a visible surface, not the first hidden canvas
    // in a results view. This remains a content/paint-opportunity proxy.
    return [...document.querySelectorAll('canvas')].some(visible);
  }
  function startReady() {
    if (target === 'portal') return usefulScreen();
    if (!window.__game && !window.GolfArt && !document.getElementById('boardApp')) return false;
    const button = target === 'hoop-heads' ? document.querySelector('[data-act="cpu"]') : target === 'splat-strike' ? document.getElementById('playBtn') :
      target === 'typing-test' ? document.querySelector('[data-lang="en"]') : target === 'connect-four' || target === 'tic-tac-toe' ? document.getElementById('localButton') : null;
    return usefulScreen() && (!button || !button.disabled);
  }
  const pending = {};
  function latch(key, eligible, time) {
    if (p[key] !== null) return;
    if (eligible && pending[key]) p[key] = time;
    pending[key] = eligible;
  }
  let last = null;
  function tick(time) {
    if (p.firstUsefulMs === null) latch('firstUsefulMs', usefulScreen(), performance.now());
    if (p.readyForStartMs === null) latch('readyForStartMs', startReady(), performance.now());
    if (p.startRequestedMs !== null) {
      if (target !== 'portal') latch('playableMs', playable(), performance.now());
      const response = target === 'portal'
        ? p.portalQuery && document.getElementById('q')?.value === p.portalQuery && decodeURIComponent(location.hash).includes(p.portalQuery) && document.querySelector('#app .tile')
        : window.sgInput?.seen;
      latch('inputResponsiveMs', !!response, performance.now());
    }
    const isActive = p.measuring && (target === 'portal' || playable());
    if (isActive && last !== null) p.frames.push(time - last);
    last = isActive ? time : null; // No idle/countdown/recovery interval leaks in.
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function snapshot(page, drain = false) {
  return page.evaluate(drain => {
    const p = window.__perf;
    const result = { saves: p.saves, saveBytes: p.saveBytes, frames: p.frames, long: p.long,
      heap: performance.memory?.usedJSHeapSize || 0 };
    if (drain) Object.assign(p, { saves: 0, saveBytes: 0, frames: [], long: [] });
    return result;
  }, drain);
}
async function measuring(page, on) {
  await page.evaluate(on => { window.__perf.measuring = on; if (on) window.__perf.activityStart = performance.now(); }, on);
}

async function navigate(page, cdp, url, target) {
  const requests = new Map();
  const requested = event => { if (/^https?:/.test(event.request.url)) requests.set(event.requestId, { url: event.request.url, bytes: 0, cached: false }); };
  const response = event => {
    const request = requests.get(event.requestId);
    if (request) { request.cached = !!(event.response.fromDiskCache || event.response.fromPrefetchCache); request.serviceWorker = !!event.response.fromServiceWorker; }
  };
  const finished = event => { const request = requests.get(event.requestId); if (request) request.bytes = event.encodedDataLength; };
  cdp.on('Network.requestWillBeSent', requested); cdp.on('Network.responseReceived', response); cdp.on('Network.loadingFinished', finished);
  try {
    // Start at the first useful title/catalog paint opportunity. There is no
    // post-load settling delay. Real UI controls are used by runScenario.
    await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForFunction(() => window.__perf && window.__perf.firstUsefulMs !== null && window.__perf.readyForStartMs !== null, null, { timeout: 60000, polling: 'raf' });
    await page.evaluate(() => { window.__perf.startRequestedMs = performance.now(); });
    if (target === 'portal') {
      const query = await page.evaluate(() => window.GAMES.find(game => game.slug === 'hoop-heads')?.title || window.GAMES[0].title);
      await page.evaluate(query => { window.__perf.portalQuery = query; }, query);
      await page.locator('#q').fill(query);
    } else await runScenario(page, target, { mode: 'performance' });
    await page.waitForFunction(target => window.__perf.inputResponsiveMs !== null && (target === 'portal' || window.__perf.playableMs !== null), target, { timeout: 60000, polling: 'raf' });
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    // Readiness can precede load (e.g. an optional late resource). Preserve its
    // earlier timestamp while waiting to obtain the actual completed load event.
    await page.waitForLoadState('load', { timeout: 60000 });
    const result = await page.evaluate(() => {
      const p = window.__perf, n = performance.getEntriesByType('navigation')[0];
      return { loadMs: n.loadEventEnd, dclMs: n.domContentLoadedEventEnd, firstUsefulMs: p.firstUsefulMs,
        readyForStartMs: p.readyForStartMs, startRequestedMs: p.startRequestedMs, playableMs: p.playableMs,
        startToPlayableMs: p.playableMs === null ? null : p.playableMs - p.startRequestedMs,
        inputResponsiveMs: p.inputResponsiveMs, startToInputMs: p.inputResponsiveMs - p.startRequestedMs,
        dpr: devicePixelRatio, controlledByServiceWorker: !!navigator.serviceWorker?.controller };
    });
    if (target === 'portal') {
      await page.locator('#q').fill('');
      await page.waitForFunction(() => !!document.querySelector('.catalog-grid .tile'), null, { timeout: 7000 });
    }
    return { ...result, scriptToInputMs: metrics.ScriptDuration * 1000,
      httpRequests: requests.size, encodedBytes: [...requests.values()].reduce((sum, request) => sum + request.bytes, 0),
      cachedRequests: [...requests.values()].filter(request => request.cached).length,
      fromServiceWorker: [...requests.values()].filter(request => request.serviceWorker).length,
      requests: [...requests.values()].map(request => ({ ...request, url: request.url.replace(new URL(url).origin, '') })) };
  } finally {
    cdp.off('Network.requestWillBeSent', requested); cdp.off('Network.responseReceived', response); cdp.off('Network.loadingFinished', finished);
  }
}

async function activeRun(page, cdp, target, seconds) {
  await page.evaluate(() => window.gc?.());
  const heap0 = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  await measuring(page, true);
  const start = performance.now(), samples = [];
  let iteration = 0, restarts = 0, recoveryMs = 0;
  while (performance.now() - start < seconds * 1000) {
    if (target === 'portal') { await page.mouse.wheel(0, iteration % 2 ? -600 : 600); await page.waitForTimeout(500); }
    else {
      samples.push(await snapshot(page, true));
      // The frame predicate excludes non-play states. A reloaded document starts
      // with measurement off, so recovery/countdown cannot enter its new window.
      const recoveryStart = performance.now();
      if (await ensureActive(page, target)) {
        restarts++;
        recoveryMs += performance.now() - recoveryStart;
        await measuring(page, true);
      }
      await performInput(page, target, { repeat: true });
    }
    iteration++;
  }
  const elapsed = Math.max(0.001, (performance.now() - start - recoveryMs) / 1000);
  samples.push(await snapshot(page));
  await measuring(page, false);
  await page.evaluate(() => window.gc?.());
  const heap1 = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  const frames = samples.flatMap(sample => sample.frames).sort((a, b) => a - b);
  if (!frames.length) throw new Error(target + ': no active rendering frames');
  return { seconds: round(elapsed), restarts, recoveryMs: round(recoveryMs), frameCount: frames.length,
    medianFrameMs: distribution(frames).median, p95FrameMs: frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.95))], maxFrameMs: frames.at(-1),
    longTasks: samples.reduce((sum, sample) => sum + sample.long.length, 0),
    scriptMs: restarts ? null : (after.ScriptDuration - before.ScriptDuration) * 1000,
    heapMB: heap0 / 1048576, heapGrowMB: (heap1 - heap0) / 1048576,
    peakHeapMB: Math.max(heap0, heap1, ...samples.map(sample => sample.heap)) / 1048576,
    domNodes: after.Nodes, savesPerMin: samples.reduce((sum, sample) => sum + sample.saves, 0) / elapsed * 60,
    saveBytes: samples.reduce((sum, sample) => sum + sample.saveBytes, 0) };
}

export function summarize(samples, targets) {
  return targets.map(target => {
    const rows = samples.filter(sample => sample.target === target && !sample.error);
    const summarizeSection = (section, keys) => Object.fromEntries(keys.map(key => [key, distribution(rows.map(row => row[section][key]))]));
    return { target, samples: rows.length,
      cold: summarizeSection('cold', [...TIMINGS, 'httpRequests', 'encodedBytes']),
      warm: summarizeSection('warm', [...TIMINGS, 'httpRequests', 'encodedBytes']),
      activity: summarizeSection('activity', ['seconds', 'frameCount', 'medianFrameMs', 'p95FrameMs', 'maxFrameMs', 'longTasks', 'scriptMs', 'heapMB', 'heapGrowMB', 'peakHeapMB', 'savesPerMin', 'restarts']) };
  });
}

function provenance(root, targets) {
  const git = (...args) => { try { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  const files = [...new Set(['index.html', ...targets.filter(target => target !== 'portal').map(target => `games/${target}/index.html`), 'lib/three/three.min.js',
    ...fs.readdirSync(path.join(root, 'shared/fonts')).filter(name => name.endsWith('.woff2')).map(name => 'shared/fonts/' + name)])];
  return { commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), dirty: git('status', '--porcelain'), root,
    lockfileSha256: sha256(fs.readFileSync(path.join(REPO, 'package-lock.json'))),
    assets: files.map(file => { const data = fs.readFileSync(path.join(root, file)); return { file, bytes: data.length, sha256: sha256(data), localGzipBytes: zlib.gzipSync(data).length, localBrotliBytes: zlib.brotliCompressSync(data).length }; }) };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const root = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js/catalog.js'), 'utf8'), sandbox, { timeout: 1000 });
  const catalog = ['portal', ...sandbox.window.GAMES.map(game => game.slug)];
  const unknown = options.targets.filter(target => !catalog.includes(target));
  if (unknown.length) throw new Error('Unknown performance target: ' + unknown.join(', '));
  const targets = options.targets.length ? [...new Set(options.targets)] : catalog;
  const build = provenance(root, targets);
  const { origin, close } = await startTestServer(root, { latency: options.latency, cacheControl: 'max-age=600' });
  let browser;
  const report = { format: 2, createdAt: new Date().toISOString(), build,
    config: { ...options, targets, viewport: VIEWPORT, deviceScaleFactor: 1, serviceWorkers: 'block', cacheControl: 'max-age=600',
      storage: 'reset before each cold and warm visit', cpuThrottle: 1, networkThrottle: 'none',
      order: 'serial round-robin; rotate first target each repetition; one browser, fresh context per target/repetition',
      scenarioVersion: 'readiness-v2', scenarioSha256: sha256(fs.readFileSync(path.join(REPO, 'tools/game-scenarios.mjs'))),
      browserToolSha256: sha256(fs.readFileSync(path.join(REPO, 'tools/browser.mjs'))),
      inputToolSha256: sha256(fs.readFileSync(path.join(REPO, 'tools/ui-input.mjs'))),
      toolSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))) },
    definitions: { firstUsefulMs: 'Navigation to local fonts loaded, laid-out visible title/catalog/typing words/board chooser; portal viewport artwork must decode and reach opacity 1, including ancestors. Eligible over two consecutive rAF opportunities; a paint proxy, not a pixel measurement.',
      readyForStartMs: 'Navigation to initialized test hook and visible enabled primary Start control. No Kit.ready handshake is used on direct pages.',
      startRequestedMs: 'In-page timestamp just before the normal UI Start sequence; no post-load settling wait.',
      playableMs: 'Navigation to real UI Start, natural intro/countdown completion, and two consecutive active-state rAF opportunities. Portal is null.',
      inputResponsiveMs: 'Navigation to the existing real-movement scenario confirming input has changed gameplay (portal: real search yields matching tiles).',
      warm: 'Same-context HTTP-cache navigation, SW blocked, local/session storage cleared so startup configuration and saves match cold.',
      activity: 'Frame intervals during repeated real inputs/portal scrolling after responsiveness. Idle/countdown/recovery frames excluded; scriptMs is null if a reload invalidates the page-level counter.',
      bytes: 'On-disk release bytes/local compression estimates are separate from CDP HTTP encoded bytes; localhost is not deployed transfer/HDD.',
      limitation: 'Headless software graphics are repeatable harness data, not measured classroom FPS.' },
    samples: [], summary: [] };
  try {
    browser = await launchChromium({ graphics: options.graphics, headless: !options.headed, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
    const cdp = await browser.newBrowserCDPSession();
    let renderer = 'unavailable';
    try { const gpu = (await cdp.send('SystemInfo.getInfo')).gpu; renderer = gpu.auxAttributes?.glRenderer || gpu.devices.map(device => device.deviceString).join(', '); }
    finally { await cdp.detach(); }
    report.environment = { browserVersion: browser.version(), channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', renderer,
      node: process.version, platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length, memoryBytes: os.totalmem() };
    console.log(`Browser ${report.environment.browserVersion}; ${options.graphics}; ${options.headed ? 'headed' : 'headless'}; ${renderer}`);
    for (let repetition = 1; repetition <= options.samples; repetition++) {
      const shift = (repetition - 1) % targets.length;
      for (const target of [...targets.slice(shift), ...targets.slice(0, shift)]) {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, serviceWorkers: 'block' });
        const row = { target, repetition, errors: [] };
        try {
          const s = scenarios[target];
          await context.addInitScript(installObservers, { target, active: s?.active || 'true', ready: s?.ready || 'true' });
          // Startup cache warmth must not also change tutorial/save configuration.
          await context.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* about:blank */ } });
          const page = await context.newPage();
          if (target !== 'portal') await prepareScenario(page, target);
          page.on('pageerror', error => row.errors.push(String(error).split('\n')[0]));
          const session = await context.newCDPSession(page);
          await session.send('Network.enable'); await session.send('Performance.enable');
          const url = target === 'portal' ? origin + '/index.html' : origin + `/games/${target}/index.html`;
          row.cold = await navigate(page, session, url, target);
          row.warm = await navigate(page, session, url, target);
          row.activity = await activeRun(page, session, target, options.seconds);
          if (row.cold.controlledByServiceWorker || row.warm.controlledByServiceWorker || row.cold.fromServiceWorker || row.warm.fromServiceWorker) throw new Error('Service worker contaminated the HTTP cache profile');
          console.log(`${target} ${repetition}/${options.samples}: load ${row.cold.loadMs.toFixed(1)}/${row.warm.loadMs.toFixed(1)}; useful ${row.cold.firstUsefulMs.toFixed(1)}/${row.warm.firstUsefulMs.toFixed(1)}; playable ${row.cold.playableMs?.toFixed(1) ?? 'n/a'}/${row.warm.playableMs?.toFixed(1) ?? 'n/a'} ms; p95 active ${row.activity.p95FrameMs.toFixed(1)} ms`);
        } catch (error) { row.error = String(error).split('\n')[0]; console.error(`${target} ${repetition}/${options.samples}: ${row.error}`); }
        finally { await context.close(); }
        report.samples.push(row);
        report.summary = summarize(report.samples, targets);
        if (options.json) { const output = path.resolve(options.json); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
      }
    }
  } finally { await browser?.close(); await close(); }
  if (report.samples.some(sample => sample.error || sample.errors.length)) process.exitCode = 1;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

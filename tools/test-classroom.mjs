#!/usr/bin/env node
/* Downloaded-folder checks, including spaces/Arabic paths and unavailable storage.
 * PLAYWRIGHT_CHANNEL=msedge node tools/test-classroom.mjs
 * SG_ROOT=_site node tools/test-classroom.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from './browser.mjs';
import { classroomNavigation, isRetryableNavigationError } from './classroom-nav.mjs';
import { runScenario } from './game-scenarios.mjs';
import { withPageDeadline } from './page-wait.mjs';
import { copyClassroomSite } from './classroom-files.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
const artifactDir = path.resolve(process.env.SG_ARTIFACT_DIR || path.join(REPO, '.work', 'classroom'));
fs.mkdirSync(artifactDir, { recursive: true });
// Expand Windows 8.3 temp aliases (RUNNER~1) before constructing file URLs.
const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-classroom-')));
const folder = path.join(temporary, 'ألعاب المدرسة', 'Downloaded games with spaces');
fs.mkdirSync(folder, { recursive: true });
const inventory = copyClassroomSite(ROOT, folder, {mode: process.env.SG_ROOT ? 'build' : 'source'});
fs.writeFileSync(path.join(artifactDir, 'download-inventory.json'), JSON.stringify({ root: ROOT, folder, files: inventory }, null, 2) + '\n');
console.log(`Verified ${inventory.length} downloaded files at ${folder}`);

const cases = [], errors = [];
let browser;
function gotoDownloaded(page, file) {
  return page.goto(pathToFileURL(file).href, classroomNavigation);
}
// The first WebGL page of a browser also starts WebGL in the GPU process (ANGLE and
// SwiftShader here), whatever the game. Linux Chromium with these flags, five runs each:
// Dino 3D as the first WebGL page showed its hook after a median 929 ms, 631 ms after a
// one-pixel draw in another page (GPU-process time before the hook 960 -> 780 ms).
// Whichever game opens first pays that on top of its own start-up (Dino 3D in both
// passes below), so it is paid once per browser here instead.
async function warmUpWebGL(context) {
  const page = await context.newPage();
  try {
    const pixel = await withPageDeadline(page, () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return null;
      gl.clearColor(0, 0.5, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const out = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return Array.from(out);
    }, 30000, 'WebGL warm-up');
    if (!pixel) console.log('WebGL warm-up: no WebGL in this browser; the 3D games will say so.');
  } catch (error) {
    console.log('WebGL warm-up failed: ' + String(error.message || error).split('\n')[0]);
  } finally {
    await page.close().catch(() => {});
  }
}

// On the 3D game pages, a failed case can say what kept the page from answering: graphics
// calls slower than 40 ms, long main-thread tasks, the longest animation frame, and when the
// game's test hook appeared (all in page milliseconds). Only those pages are traced, and the
// trace is printed only when a case fails.
function traceSlowFrames() {
  if (!/\/games\/(dino-3d|neon-slope|road-hopper)\//.test(decodeURI(location.pathname))) return;
  // perSecond: animation frames in each second of the page's life; longestGap: the longest
  // wait between two frames. Long animation frames also count rendering, which long tasks do not:
  // [start, duration, ms before rendering began, blocking ms].
  const trace = window.__sgTrace = { hook: null, slow: [], long: [], loaf: [], frames: 0, perSecond: [], longestFrame: [0, 0], longestGap: [0, 0] };
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (trace.long.length < 40) trace.long.push([Math.round(entry.startTime), Math.round(entry.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* no long-task timing in this browser */ }
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 150 && trace.loaf.length < 30) trace.loaf.push([Math.round(entry.startTime), Math.round(entry.duration), Math.round((entry.renderStart || entry.startTime) - entry.startTime), Math.round(entry.blockingDuration || 0)]);
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* no long-animation-frame timing in this browser */ }
  for (const Context of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Context) continue;
    for (const name of Object.getOwnPropertyNames(Context.prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(Context.prototype, name);
      if (!descriptor || typeof descriptor.value !== 'function' || name === 'constructor') continue;
      const original = descriptor.value;
      Context.prototype[name] = function () {
        const start = performance.now();
        try { return original.apply(this, arguments); } finally {
          const ms = performance.now() - start;
          if (ms > 40 && trace.slow.length < 40) trace.slow.push([Math.round(start), name, Math.round(ms)]);
        }
      };
    }
  }
  const request = window.requestAnimationFrame;
  let lastFrame = 0, lastFrameTime = -1;
  window.requestAnimationFrame = function (callback) {
    return request.call(window, time => {
      const start = performance.now();
      // Several callbacks share one frame (the same time stamp); count the frame once.
      if (time !== lastFrameTime) {
        lastFrameTime = time;
        trace.frames++;
        const second = Math.floor(start / 1000);
        if (second < 40) { while (trace.perSecond.length <= second) trace.perSecond.push(0); trace.perSecond[second]++; }
        if (lastFrame && start - lastFrame > trace.longestGap[1]) trace.longestGap = [Math.round(lastFrame), Math.round(start - lastFrame)];
        lastFrame = start;
      }
      try { return callback(time); } finally {
        const ms = performance.now() - start;
        if (ms > trace.longestFrame[1]) trace.longestFrame = [Math.round(start), Math.round(ms)];
      }
    });
  };
  for (const hook of ['Dino3DGame', '__game']) {
    let value;
    Object.defineProperty(window, hook, { configurable: true, get: () => value, set(next) { value = next; if (trace.hook === null) trace.hook = Math.round(performance.now()); } });
  }
}

// The 3D cases print the test process's longest event-loop delay even when they pass: the
// Windows runner's graphics process runs above normal priority and can starve everything
// else (docs/PERFORMANCE.md, Dino 3D on software rendering).
const PROCESS_TRACED = new Set(['dino-3d', 'neon-slope', 'road-hopper']);

try {
  for (const deniedStorage of [false, true]) {
    // Storage policies are independent runs. Keep browser/GPU-process state from
    // the full normal pass out of the blocked-storage pass.
    browser = await launchChromium();
    const label = deniedStorage ? 'storage-blocked' : 'normal';
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', reducedMotion: 'reduce', offline: true });
    try {
      await warmUpWebGL(context);
      await context.addInitScript(traceSlowFrames);
      if (deniedStorage) {
        await context.addInitScript(() => {
          for (const method of ['getItem', 'setItem', 'removeItem']) {
            Object.defineProperty(Storage.prototype, method, {
              value() { throw new DOMException('Storage disabled by classroom test', 'SecurityError'); }
            });
          }
        });
      }
      // One page per case. Edge on Windows leaves a shared page wedged after a
      // file:// navigation that never fires load, or aborts it with
      // net::ERR_ABORTED while the file is on disk. main run 40967117213 timed
      // out opening road-hopper, then failed to find that game's Play button,
      // and aborted pool-party. Closing the page ends that navigation first.
      function watchPage(page) {
        const bucket = [];
        let accept = true;
        const push = line => { if (accept) bucket.push(line); };
        page.on('pageerror', error => push(`${label}: ${error.message}`));
        page.on('console', message => { if (message.type() === 'error') push(`${label}: ${message.text()}`); });
        page.on('requestfailed', request => {
          let disk = '';
          if (request.url().startsWith('file:')) {
            try { disk = fs.existsSync(fileURLToPath(request.url())) ? ' (file exists on disk)' : ' (file missing on disk)'; }
            catch (error) { disk = ' (invalid file URL: ' + error.message + ')'; }
          }
          push(`${label}: ${request.url()}: ${request.failure()?.errorText}${disk}`);
        });
        page.on('request', request => {
          if (/^https?:/.test(request.url())) push(`${label}: external request ${request.url()}`);
        });
        return {
          commit() { if (!accept) return; accept = false; errors.push(...bucket); },
          discard() { accept = false; }
        };
      }
      async function openPage() {
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        return { page, watch: watchPage(page) };
      }
      async function check(caseLabel, action, { processes = false } = {}) {
        const item = { label: caseLabel, ok: false };
        cases.push(item);
        // How long this test process itself could not run (a starved machine stalls every
        // browser call, not only the page's).
        const lag = monitorEventLoopDelay({ resolution: 20 });
        lag.enable();
        let current;
        try {
          current = await openPage();
          try {
            await action(current.page);
            item.ok = true;
          } catch (error) {
            // One fresh page, and only when Edge aborted or never finished the
            // navigation. A failed gameplay check is reported as itself.
            if (!isRetryableNavigationError(error)) throw error;
            const line = String(error.message || error).split('\n')[0];
            console.log(`RETRY ${caseLabel}: ${line}`);
            item.navigationRetry = line;
            current.watch.discard();
            await current.page.close().catch(() => {});
            current = null;
            current = await openPage();
            await action(current.page);
            item.ok = true;
          }
        } catch (error) {
          item.ok = false;
          item.error = error.stack || String(error);
        }
        lag.disable();
        if (current && !item.ok) {
          // What the page was doing when the check gave up: CI logs are often all there is
          // (the Windows artifacts need a separate download). A page that does not answer
          // within 3 s is reported as such.
          item.pageState = await Promise.race([
            current.page.evaluate(() => ({
              readyState: document.readyState, mode: document.body ? document.body.dataset.mode || document.body.className : null,
              hook: ['__game', 'Dino3DGame', 'GolfArt'].filter(name => window[name]),
              buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent).slice(0, 8).map(b => b.id || b.textContent.trim().slice(0, 20)),
              now: Math.round(performance.now()), trace: window.__sgTrace
            })),
            new Promise(resolve => setTimeout(() => resolve('the page did not answer within 3 s'), 3000))
          ]).catch(error => 'the page could not be read: ' + String(error.message || error).split('\n')[0]);
        }
        if (current) {
          try { await current.page.screenshot({ path: path.join(artifactDir, caseLabel + '.png'), fullPage: true }); }
          catch (error) { item.screenshotError = error.message; }
          current.watch.commit();
          await current.page.close().catch(() => {});
        }
        const retryNote = item.navigationRetry ? ' (retried a file navigation)' : '';
        console.log(`${item.ok ? 'PASS' : 'FAIL'} ${caseLabel}${retryNote}${item.error ? ': ' + item.error.split('\n')[0] : ''}`);
        if (!item.ok) {
          // Playwright's call log (what the locator found, and for how long) follows the first line.
          const detail = String(item.error || '').split('\n').slice(1).filter(line => !/^\s+at /.test(line)).slice(0, 12);
          for (const line of detail) console.log('  ' + line.replace(/\x1b\[[0-9;]*m/g, ''));
          if (item.pageState !== undefined) console.log('  page: ' + JSON.stringify(item.pageState));
        }
        if (!item.ok || processes) console.log(`  test process: longest event-loop delay ${Math.round(lag.max / 1e6)} ms`);
      }

      await check(label + '-portal', async page => {
        await gotoDownloaded(page, path.join(folder, 'index.html'));
        await page.waitForFunction(() => document.querySelectorAll('a[data-slug]').length >= 31);
        assert.ok(await page.locator('a[data-slug]').count() >= 31, 'catalog renders from a file URL');
        await page.locator('a[data-slug="tic-tac-toe"]').first().click();
        const element = await page.locator('#stage iframe').elementHandle();
        assert.ok(element, 'portal creates its game iframe');
        const frame = await element.contentFrame();
        assert.ok(frame, 'local game iframe is accessible to the browser harness');
        await frame.locator('#localButton').click();
        await frame.locator('#gameBoard [data-move="0"]').click();
        await frame.waitForFunction(() => document.getElementById('gameBoard').dataset.moves === '1');
      });

      for (const slug of ['tic-tac-toe', 'connect-four', 'air-hockey', 'merge-2048', 'pizza-clicker', 'dino-3d', 'cake-guards', 'neon-slope', 'road-hopper']) {
        await check(label + '-' + slug, async page => {
          await gotoDownloaded(page, path.join(folder, 'games', slug, 'index.html'));
          const result = await runScenario(page, slug, { mode: 'performance' });
          assert.ok(result.checks.length, 'the game completes observable gameplay checks');
        }, { processes: PROCESS_TRACED.has(slug) });
      }
      await check(label + '-pool-party', async page => {
        await gotoDownloaded(page, path.join(folder, 'games', 'pool-party', 'index.html'));
        await page.locator('#btnTrick').click();
        assert.equal(await page.locator('#lvgrid .lvl').count(), 12, 'all twelve trick-shot puzzles are available in the downloaded menu');
        await page.locator('#lvBack').click();
        const result = await runScenario(page, 'pool-party', { mode: 'performance' });
        assert.ok(result.checks.length, 'Pool completes observable gameplay checks after leaving the puzzle menu');
      });
    } finally { await context.close(); }
    await browser.close();
    browser = null;
  }
} catch (error) {
  errors.push(error.stack || String(error));
} finally {
  if (browser) await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
  const report = { platform: process.platform, channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium',
    root: path.relative(REPO, ROOT) || 'source', cases, errors };
  fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
if (cases.some(item => !item.ok) || errors.length || !cases.length) {
  console.error(errors.join('\n'));
  console.error('Classroom checks failed. Reports: ' + artifactDir);
  process.exitCode = 1;
} else console.log('Downloaded-folder classroom checks passed. Reports: ' + artifactDir);

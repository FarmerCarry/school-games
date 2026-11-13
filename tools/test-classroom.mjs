#!/usr/bin/env node
/* Downloaded-folder checks, including spaces/Arabic paths and unavailable storage.
 * PLAYWRIGHT_CHANNEL=msedge node tools/test-classroom.mjs
 * SG_ROOT=_site node tools/test-classroom.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from './browser.mjs';
import { classroomNavigation, isRetryableNavigationError } from './classroom-nav.mjs';
import { runScenario } from './game-scenarios.mjs';
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

const GAMES = ['tic-tac-toe', 'connect-four', 'air-hockey', 'merge-2048', 'pizza-clicker', 'dino-3d', 'cake-guards', 'neon-slope', 'road-hopper'];
const gameFile = slug => path.join(folder, 'games', slug, 'index.html');
const cases = [], errors = [];
let browser;
function gotoDownloaded(page, file) {
  return page.goto(pathToFileURL(file).href, classroomNavigation);
}
const seconds = ms => (ms / 1000).toFixed(1);
function describeTimings(item) {
  const stages = Object.entries(item.timings || {}).map(([stage, ms]) => `${stage} ${seconds(ms)}`);
  return ` [${seconds(item.ms)} s${stages.length ? '; ' + stages.join(', ') : ''}]`;
}

try {
  for (const deniedStorage of [false, true]) {
    // Storage policies are independent runs. Keep browser/GPU-process state from
    // the full normal pass out of the blocked-storage pass.
    browser = await launchChromium();
    const label = deniedStorage ? 'storage-blocked' : 'normal';
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', reducedMotion: 'reduce', offline: true });
    try {
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
      // item.ms is the whole case; item.timings are milliseconds from the start
      // of the (last) attempt to each stage the action marks.
      async function check(caseLabel, action) {
        const item = { label: caseLabel, ok: false };
        cases.push(item);
        const started = Date.now();
        const attempt = async page => {
          const t0 = Date.now();
          item.timings = {};
          await action(page, stage => { item.timings[stage] = Date.now() - t0; });
        };
        let current;
        try {
          current = await openPage();
          try {
            await attempt(current.page);
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
            await attempt(current.page);
            item.ok = true;
          }
        } catch (error) {
          item.ok = false;
          item.error = error.stack || String(error);
        }
        item.ms = Date.now() - started;
        if (current) {
          try { await current.page.screenshot({ path: path.join(artifactDir, caseLabel + '.png'), fullPage: true }); }
          catch (error) { item.screenshotError = error.message; }
          current.watch.commit();
          await current.page.close().catch(() => {});
        }
        const retryNote = item.navigationRetry ? ' (retried a file navigation)' : '';
        console.log(`${item.ok ? 'PASS' : 'FAIL'} ${caseLabel}${retryNote}${describeTimings(item)}${item.error ? ': ' + item.error.split('\n')[0] : ''}`);
      }

      await check(label + '-portal', async (page, mark) => {
        await gotoDownloaded(page, path.join(folder, 'index.html'));
        mark('dom');
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

      for (const slug of GAMES) {
        await check(label + '-' + slug, async (page, mark) => {
          await gotoDownloaded(page, gameFile(slug));
          mark('dom');
          const result = await runScenario(page, slug, { mode: 'performance', onStage: mark });
          assert.ok(result.checks.length, 'the game completes observable gameplay checks');
        });
      }
      await check(label + '-pool-party', async (page, mark) => {
        await gotoDownloaded(page, path.join(folder, 'games', 'pool-party', 'index.html'));
        mark('dom');
        await page.locator('#btnTrick').click();
        assert.equal(await page.locator('#lvgrid .lvl').count(), 12, 'all twelve trick-shot puzzles are available in the downloaded menu');
        await page.locator('#lvBack').click();
        const result = await runScenario(page, 'pool-party', { mode: 'performance', onStage: mark });
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

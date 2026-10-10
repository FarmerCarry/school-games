#!/usr/bin/env node
/* Downloaded-folder checks, including spaces/Arabic paths, unavailable storage and the teacher page.
 * PLAYWRIGHT_CHANNEL=msedge node tools/test-classroom.mjs
 * SG_ROOT=_site node tools/test-classroom.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from './browser.mjs';
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

const cases = [], errors = [];
let browser;
async function check(page, label, action) {
  const item = { label, ok: false };
  cases.push(item);
  try { await action(); item.ok = true; }
  catch (error) { item.error = error.stack || String(error); }
  try { await page.screenshot({ path: path.join(artifactDir, label + '.png'), fullPage: true }); }
  catch (error) { item.screenshotError = error.message; }
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${label}${item.error ? ': ' + item.error.split('\n')[0] : ''}`);
}

try {
  browser = await launchChromium();
  for (const deniedStorage of [false, true]) {
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
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
      page.on('requestfailed', request => {
        let disk = '';
        if (request.url().startsWith('file:')) {
          try { disk = fs.existsSync(fileURLToPath(request.url())) ? ' (file exists on disk)' : ' (file missing on disk)'; }
          catch (error) { disk = ' (invalid file URL: ' + error.message + ')'; }
        }
        errors.push(`${label}: ${request.url()}: ${request.failure()?.errorText}${disk}`);
      });
      page.on('request', request => {
        if (/^https?:/.test(request.url())) errors.push(`${label}: external request ${request.url()}`);
      });

      await check(page, label + '-portal', async () => {
        await page.goto(pathToFileURL(path.join(folder, 'index.html')).href);
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

      // The teacher statistics page from the same folder: it reads this folder's
      // storage, exports files, and explains itself when storage is blocked.
      await check(page, label + '-teacher', async () => {
        await page.goto(pathToFileURL(path.join(folder, 'teacher.html')).href);
        await page.waitForFunction(() => document.getElementById('source')?.dataset.copy === 'folder');
        if (deniedStorage) {
          assert.ok(await page.locator('#storageMsg').isVisible(), 'blocked storage is explained');
          assert.ok(await page.locator('#exportXlsx').isDisabled(), 'exports need readable storage');
          return;
        }
        // One day record in the storage format the portal writes (docs/PLAY_STATS.md).
        await page.evaluate(() => {
          localStorage.setItem('sg:site:stats:d:2025-09-01', JSON.stringify({ v: 1, d: '2025-09-01', s: { calm: 1 },
            g: { 'tic-tac-toe': { o: 2, e: 95000, hh: { 10: 95000 }, b: [1, 1, 0, 0], lv: { duo: [2, 0, 0, 1, 1, 0, 90000, 0, 0, 0, 1, 0] } } } }));
        });
        await page.reload();
        // A file:// page is a secure context, so Edge offers its save dialog, which a
        // headless browser closes at once. Check the download path instead (the dialog
        // is covered by tools/tests/teacher-page.test.mjs).
        await page.evaluate(() => { delete window.showSaveFilePicker; });
        await page.locator('input[name="period"][value="all"]').check();
        // The portal's own recorder may add today's tic-tac-toe session to the same row.
        const row = page.locator('#gameTable tr[data-game="tic-tac-toe"]');
        await row.waitFor();
        assert.ok(Number(await row.getAttribute('data-sessions')) >= 1, 'the seeded session of a minute or more is shown');
        const [json] = await Promise.all([page.waitForEvent('download'), page.locator('#exportJson').click()]);
        assert.match(json.suggestedFilename(), /^play-stats_pc[a-z]{4}_\d{4}-\d{2}-\d{2}\.json$/);
        const exported = JSON.parse(fs.readFileSync(await json.path(), 'utf8'));
        assert.equal(exported.format, 'sg-play-stats');
        assert.equal(exported.pc.copy, 'folder');
        assert.ok(exported.tables.games.some(row => row.game === 'tic-tac-toe' && row.date === '2025-09-01' && row.seconds === 95));
        // The download counts as an export only once the teacher confirms it was saved.
        assert.match(await page.locator('#lastExport').textContent(), /لم يُصدَّر شيء/);
        await page.locator('#exportYes').click();
        assert.match(await page.locator('#lastExport').textContent(), /آخر تصدير/);
        const [workbook] = await Promise.all([page.waitForEvent('download'), page.locator('#exportXlsx').click()]);
        assert.match(workbook.suggestedFilename(), /^play-stats_pc[a-z]{4}_\d{4}-\d{2}-\d{2}\.xlsx$/);
        assert.equal(fs.readFileSync(await workbook.path()).subarray(0, 4).toString('latin1'), 'PK\u0003\u0004', 'the workbook is a ZIP package');
      });

      for (const slug of ['tic-tac-toe', 'connect-four', 'air-hockey', 'merge-2048', 'pizza-clicker']) {
        await check(page, label + '-' + slug, async () => {
          await page.goto(pathToFileURL(path.join(folder, 'games', slug, 'index.html')).href);
          const result = await runScenario(page, slug, { mode: 'performance' });
          assert.ok(result.checks.length, 'the game completes observable gameplay checks');
        });
      }
    } finally { await context.close(); }
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

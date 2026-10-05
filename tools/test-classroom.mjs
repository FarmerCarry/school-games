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
import { runScenario } from './game-scenarios.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
const artifactDir = path.resolve(process.env.SG_ARTIFACT_DIR || path.join(REPO, '.work', 'classroom'));
fs.mkdirSync(artifactDir, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-classroom-'));
const folder = path.join(temporary, 'ألعاب المدرسة', 'Downloaded games with spaces');
fs.mkdirSync(folder, { recursive: true });
// Only distributable assets are needed. Never copy git history, node_modules,
// test artifacts or a nested build into the classroom download.
for (const name of ['index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js', 'games', 'css', 'js', 'shared', 'lib', 'icons']) {
  const source = path.join(ROOT, name);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(folder, name), { recursive: true });
}

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
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
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
      page.on('requestfailed', request => errors.push(`${label}: ${request.url()}: ${request.failure()?.errorText}`));
      page.on('request', request => {
        if (/^https?:/.test(request.url())) errors.push(`${label}: external request ${request.url()}`);
      });
      await context.route(/^https?:/, route => route.abort());

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

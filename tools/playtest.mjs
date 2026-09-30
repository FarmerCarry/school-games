#!/usr/bin/env node
/*
 * Headless playtest harness (Playwright + Chromium).
 *
 *   node tools/playtest.mjs <slug> [--actions actions.json | --actions-json '<json>']
 *                                  [--out <dir>] [--size 1280x720] [--path /some/page.html]
 *
 * Serves the repo root on a random localhost port, opens games/<slug>/index.html
 * (or --path), runs the action list, and prints a JSON report with console
 * errors, page errors, failed or external requests, and screenshot paths.
 * Screenshots can be viewed with an image viewer / the Read tool.
 *
 * Actions (run in order):
 *   {"wait": 500}                        wait ms
 *   {"shot": "name"}                     screenshot -> <out>/<name>.png
 *   {"click": [x, y]}                    left click at page pixel coords
 *   {"rclick": [x, y]}                   right click
 *   {"clickText": "Play"}                click the first visible element containing text
 *   {"clickSel": ".sg-btn"}              click a CSS selector
 *   {"move": [x, y]}                     move the mouse
 *   {"drag": [[x1,y1],[x2,y2]], "steps": 20}   mouse drag
 *   {"press": "Space"}                   tap a key (KeyboardEvent.key names: ArrowLeft, a, Space, Enter...)
 *   {"hold": "ArrowLeft", "ms": 600}     hold a key for ms
 *   {"holdMany": ["ArrowRight","ArrowUp"], "ms": 600}   hold several keys together
 *   {"eval": "window.someState"}         evaluate JS in the page, result goes in report.evals
 *   {"assert": "window.someState > 0"}   fail if the page expression is false
 *   {"fps": 2000}                        measure requestAnimationFrame rate over ms
 *   {"resize": [800, 600]}               change the viewport size
 *   {"reload": true}                     reload the page (tests saved progress)
 *   {"repeat": 5, "do": [ ...actions ]}  repeat a block
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { reportPassed } from './playtest-report.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// SG_ROOT=_site tests the fast build made by tools/build.mjs instead of the source files.
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) { a[t.slice(2)] = argv[i + 1]; i++; } else a._.push(t);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const slug = args._[0];
if (!slug && !args.path) {
  console.error('usage: node tools/playtest.mjs <slug> [--actions file.json] [--out dir] [--size WxH] [--path /page.html]');
  process.exit(2);
}
const pagePath = args.path || `/games/${slug}/index.html`;
const outDir = args.out ? path.resolve(args.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-playtest-'));
fs.mkdirSync(outDir, { recursive: true });
const [vw, vh] = (args.size || '1280x720').split('x').map(Number);

let actions = [{ wait: 1200 }, { shot: 'loaded' }];
if (args.actions) actions = JSON.parse(fs.readFileSync(args.actions, 'utf8'));
if (args['actions-json']) actions = JSON.parse(args['actions-json']);

const { origin, close: closeServer } = await startTestServer(ROOT);

const report = {
  url: origin + pagePath, consoleErrors: [], consoleWarnings: [], pageErrors: [],
  failedRequests: [], externalRequests: [], screenshots: [], evals: [], fps: [], notes: []
};

let browser, page, actionInProgress;

async function openBrowser() {
  browser = await launchChromium({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: vw, height: vh } });
  page = await context.newPage();

  page.on('console', msg => {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error') report.consoleErrors.push(text);
    else if (t === 'warning') report.consoleWarnings.push(text);
  });
  page.on('pageerror', err => report.pageErrors.push(String(err && err.stack || err)));
  page.on('requestfailed', r => report.failedRequests.push(r.url() + ' :: ' + (r.failure() && r.failure().errorText)));
  page.on('request', r => {
    const url = r.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) report.externalRequests.push(url);
  });
  page.on('response', r => { if (r.status() >= 400) report.failedRequests.push(r.url() + ' :: HTTP ' + r.status()); });
}

const keyName = k => (k === 'Space' || k === ' ') ? ' ' : k;

async function run(list) {
  for (const a of list) {
    actionInProgress = a;
    if (a.wait != null) await page.waitForTimeout(a.wait);
    else if (a.shot) {
      const p = path.join(outDir, a.shot + '.png');
      await page.screenshot({ path: p });
      report.screenshots.push(p);
    } else if (a.click) await page.mouse.click(a.click[0], a.click[1]);
    else if (a.rclick) await page.mouse.click(a.rclick[0], a.rclick[1], { button: 'right' });
    else if (a.clickText) {
      try { await page.getByText(a.clickText, { exact: false }).first().click({ timeout: 3000 }); }
      catch (e) { report.notes.push('clickText failed: ' + a.clickText); }
    } else if (a.clickSel) {
      try { await page.locator(a.clickSel).first().click({ timeout: 3000 }); }
      catch (e) { report.notes.push('clickSel failed: ' + a.clickSel); }
    } else if (a.move) await page.mouse.move(a.move[0], a.move[1], { steps: a.steps || 5 });
    else if (a.drag) {
      await page.mouse.move(a.drag[0][0], a.drag[0][1]);
      await page.mouse.down();
      await page.mouse.move(a.drag[1][0], a.drag[1][1], { steps: a.steps || 20 });
      await page.mouse.up();
    } else if (a.press) await page.keyboard.press(keyName(a.press));
    else if (a.hold) {
      await page.keyboard.down(keyName(a.hold));
      await page.waitForTimeout(a.ms || 300);
      await page.keyboard.up(keyName(a.hold));
    } else if (a.holdMany) {
      for (const k of a.holdMany) await page.keyboard.down(keyName(k));
      await page.waitForTimeout(a.ms || 300);
      for (const k of a.holdMany) await page.keyboard.up(keyName(k));
    } else if (a.eval) {
      try { report.evals.push({ expr: a.eval, value: await page.evaluate(a.eval) }); }
      catch (e) { report.evals.push({ expr: a.eval, error: String(e) }); report.notes.push('eval failed: ' + a.eval); }
    } else if (a.assert) {
      if (!await page.evaluate(a.assert)) report.notes.push('assertion failed: ' + a.assert);
    } else if (a.fps) {
      const fps = await page.evaluate(ms => new Promise(res => {
        let n = 0; const t0 = performance.now();
        function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(n * 1000 / (performance.now() - t0)); }
        requestAnimationFrame(f);
      }), a.fps);
      report.fps.push(Math.round(fps));
    } else if (a.resize) await page.setViewportSize({ width: a.resize[0], height: a.resize[1] });
    else if (a.reload) await page.reload();
    else if (a.repeat) { for (let i = 0; i < a.repeat; i++) await run(a.do || []); }
    else report.notes.push('unknown action: ' + JSON.stringify(a));
  }
}

try {
  await openBrowser();
  await page.goto(origin + pagePath, { waitUntil: 'load', timeout: 20000 });
  await run(actions);
} catch (e) {
  report.notes.push('harness error during ' + JSON.stringify(actionInProgress || { navigation: pagePath }) + ': ' + String(e));
} finally {
  if (browser) await browser.close();
  await closeServer();
}
report.ok = reportPassed(report);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;

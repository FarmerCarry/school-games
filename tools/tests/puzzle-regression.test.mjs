import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(site, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox']
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function gamePage(t) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'game should not throw browser errors'));
  await page.goto(origin + '/games/merge-2048/');
  return page;
}

async function awaitScreen(page, screen) {
  await page.waitForFunction(value => window.__game.state().screen === value, screen, { timeout: 15000 });
}

test('2048 preserves a saved victory on a board with no remaining moves', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    Kit.store('merge-2048').set('g4', {
      v: [2048, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2],
      s: 2048, u: 3, h: [], w: true, k: false, m: 1, sb: 0
    });
  });
  await page.keyboard.press('Enter');
  await awaitScreen(page, 'win');
  assert.equal(await page.evaluate(() => window.__game.state().max), 2048);
  await page.locator('#btnKeep').click();
  await awaitScreen(page, 'over');
});

function verifier(game, args = [], inject = '') {
  const script = path.join(repo, 'games', game, 'verify-levels.js');
  const program = `process.argv = [process.execPath, ${JSON.stringify(script)}, ...${JSON.stringify(args)}];\n${inject}\nrequire(${JSON.stringify(script)});`;
  const result = spawnSync(process.execPath, ['-e', program], {
    cwd: repo, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ONLY: '1' }
  });
  assert.ifError(result.error);
  return result;
}

test('Swing verification fails when the simulation cannot finish a selected level', () => {
  const result = verifier('swing-hook', ['1'], `require('./games/swing-hook/sim.js').step = w => { w.st = 'dead'; };`);
  assert.match(result.stdout, /NOT SOLVED/);
  assert.equal(result.status, 1);
});

test('Swing verification succeeds when a selected real level is solved and replayed', () => {
  const result = verifier('swing-hook', ['1']);
  assert.match(result.stdout, /ALL LEVELS COMPLETABLE/);
  assert.equal(result.status, 0);
});

test('verifiers reject invalid level or run selections instead of checking nothing', () => {
  assert.equal(verifier('swing-hook', ['999']).status, 2);
  assert.equal(verifier('block-burst', ['0']).status, 2);
});

test('Block verification keeps balance thresholds strict unless report mode is explicitly selected', () => {
  // Keep the strong bot winning while making the weaker model miss its threshold.
  const inject = `const rules = require('./games/block-burst/rules.js');
    const newRun = rules.newRun; let n = 0;
    rules.newRun = (...args) => { const run = newRun(...args); run.result = ++n === 1 ? 'win' : 'fail'; return run; };`;
  const strict = verifier('block-burst', ['1'], inject);
  assert.match(strict.stdout, /BALANCE FAIL/);
  assert.equal(strict.status, 1);
  const report = verifier('block-burst', ['--report-balance', '1'], inject);
  assert.match(report.stdout, /BALANCE WARNING/);
  assert.equal(report.status, 0);
});

test('Block report mode still fails unsolved levels and invalid starting boards', () => {
  const unsolved = verifier('block-burst', ['1', '--report-balance'], `
    const rules = require('./games/block-burst/rules.js'); const newRun = rules.newRun;
    rules.newRun = (...args) => { const run = newRun(...args); run.result = 'fail'; return run; };`);
  assert.match(unsolved.stdout, /FAIL: no smart-bot wins/);
  assert.equal(unsolved.status, 1);
  const invalid = verifier('block-burst', ['1', '--report-balance'], `
    const core = require('./games/block-burst/core.js'); const parseBoard = core.parseBoard;
    core.parseBoard = (...args) => { const board = parseBoard(...args); board.cells.fill(1, 0, 8); return board; };
    const rules = require('./games/block-burst/rules.js'); const newRun = rules.newRun;
    rules.newRun = (...args) => { const run = newRun(...args); run.result = 'win'; return run; };`);
  assert.match(invalid.stdout, /starts with full row/);
  assert.equal(invalid.status, 1);
});

test('Block verification passes an unmodified beginner level', () => {
  const result = verifier('block-burst', ['1']);
  assert.match(result.stdout, /all required checks OK/);
  assert.equal(result.status, 0);
});

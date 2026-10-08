// End to end: a real game in the real portal reports a round through Kit.stats, the portal
// stores it in the day record, and the teacher page shows it. Stand-in pages cover the
// details in portal-stats and teacher-page; this checks that the three parts fit together.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

// The record of today's local date (the recorder never uses UTC days).
const today = page => page.evaluate(() => {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  return JSON.parse(localStorage.getItem('sg:site:stats:d:' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())));
});

test('a two-player tic-tac-toe round in the portal reaches the day record and the teacher page', async t => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage(), problems = [];
  const watch = (p, name) => {
    p.on('pageerror', e => problems.push(`${name} page error: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`); });
  };
  watch(page, 'portal');
  context.on('request', r => { if (!r.url().startsWith(server.origin)) problems.push('external request: ' + r.url()); });
  t.after(() => context.close());

  await page.goto(server.origin + '/');
  await page.click('.catalog-grid .tile[data-slug="tic-tac-toe"]');
  const game = page.frameLocator('#stage iframe');
  await game.locator('#localButton').click();
  // X takes the top row: 0, 1, 2 against O on 3 and 4.
  for (const [i, move] of [0, 3, 1, 4, 2].entries()) {
    await game.locator(`#gameBoard [data-move="${move}"]`).click();
    await game.locator(`#gameBoard[data-moves="${i + 1}"]`).waitFor();
  }
  assert.equal(await game.locator('#gameBoard').getAttribute('data-winner'), '1');

  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#stage iframe'));
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('sg:site:stats:d:')));
  await page.waitForFunction(() => {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const day = JSON.parse(localStorage.getItem('sg:site:stats:d:' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())) || 'null');
    const g = day && day.g['tic-tac-toe'];
    return g && g.b.reduce((a, b) => a + b, 0) === 1;
  });
  const g = (await today(page)).g['tic-tac-toe'];
  assert.equal(g.o, 1, 'one open');
  assert.deepEqual(g.b, [1, 0, 0, 0], 'one short session');
  assert.ok(g.e > 0, 'clicks count as engaged time');
  assert.equal((g.src.featured || 0) + (g.src.catalog || 0), 1, 'opened from the home grid');
  assert.ok(g.l[0] === 1 || g.ls === 1, 'the first load is measured or skipped');
  // starts, wins, losses, draws, ends, quits: a two-player round ends without a winner.
  assert.deepEqual(g.lv.local.slice(0, 6), [1, 0, 0, 0, 1, 0]);

  const teacher = await context.newPage();
  watch(teacher, 'teacher');
  await teacher.goto(server.origin + '/teacher.html');
  const row = teacher.locator('table tbody tr', { hasText: 'إكس أو' }).first();
  await row.waitFor();
  assert.deepEqual(problems, []);
});

// End to end: the real portal and a real game in Chromium send their anonymous telemetry
// (js/telemetry.js) to the real ingest server (server/app.mjs), and the server's admin
// KPIs show what the children did. Playwright hands each POST for https://ingest.test to
// the in-process server on 127.0.0.1, so nothing leaves this machine. The sink is switched
// on with window.SG_TELEMETRY = { url, allowLocal: true }, which no build ever writes.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { hideSqliteWarning } from '../../server/warnings.mjs';

hideSqliteWarning();
const { createApp } = await import('../../server/app.mjs');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const TOKEN = 'e2e-admin-token-0123456789';
const SESSIONS = 3; // the server hides any group smaller than three sessions
let browser, site, ingest, ingestUrl, dir;

before(async () => {
  site = await startTestServer(root);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-telemetry-e2e-'));
  ingest = createApp({ dbPath: path.join(dir, 'telemetry.db'), allowedOrigins: [site.origin], adminToken: TOKEN });
  const address = await ingest.listen(0, '127.0.0.1');
  ingestUrl = 'http://127.0.0.1:' + address.port;
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await ingest?.close();
  await site?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function until(check, label, ms = 30000) {
  for (const end = Date.now() + ms; !(await check());) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + label);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const ready = page => page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
async function admin(route) {
  const res = await fetch(ingestUrl + route, { headers: { Authorization: 'Bearer ' + TOKEN } });
  assert.equal(res.status, 200, route);
  return res.json();
}

test('three sessions of a 6-7 year old reach the ingest server and its KPIs', async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const errors = [], outside = [], answers = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== site.origin && url.origin !== 'https://ingest.test') outside.push(request.method() + ' ' + request.url());
  });
  // The ingest server answers for https://ingest.test; the browser sees its real status and headers.
  await context.route('https://ingest.test/**', async route => {
    const request = route.request();
    const res = await fetch(ingestUrl + new URL(request.url()).pathname, {
      method: request.method(),
      headers: { 'Content-Type': request.headers()['content-type'] || 'text/plain', Origin: site.origin },
      body: request.method() === 'POST' ? request.postData() : undefined
    });
    answers.push(res.status);
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  // Sharing starts only once the player exists, so every session belongs to that player.
  await context.addInitScript(() => {
    if (localStorage.getItem('e2e:share')) Object.defineProperty(window, 'SG_TELEMETRY', { value: { url: 'https://ingest.test/v1/batch', allowLocal: true }, writable: false });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(site.origin + '/index.html');
  await page.waitForFunction(() => window.SGProfiles && window.SGTelemetry && !SGTelemetry.active());
  await page.evaluate(() => { const p = SGProfiles.create(1, 4, '6-7'); SGProfiles.select(p.k); localStorage.setItem('e2e:share', '1'); });

  for (let n = 0; n < SESSIONS; n++) {
    // Every page load is a new telemetry session; the player lasts for the tab.
    await page.reload();
    await page.waitForFunction(() => window.SGProfiles && SGProfiles.band() === '6-7' && SGTelemetry.active());
    const sent = answers.length;
    await page.locator('.catalog-grid .tile[data-slug="tic-tac-toe"]').click();
    await ready(page);
    const game = page.frameLocator('#stage iframe');
    await game.locator('#localButton').click();
    for (const [i, move] of [0, 3, 1, 4, 2].entries()) {
      await game.locator(`#gameBoard [data-move="${move}"]`).click();
      await game.locator(`#gameBoard[data-moves="${i + 1}"]`).waitFor();
    }
    await page.locator('#logo').click();
    await page.waitForFunction(() => document.body.className === 'route-home');
    // Leaving the game sends its batch at once.
    await until(() => answers.length > sent, 'session ' + (n + 1) + ' at the server');
  }

  let kpis;
  await until(async () => {
    kpis = await admin('/v1/admin/kpis');
    const ttt = kpis.games.find(g => g.slug === 'tic-tac-toe');
    return ttt && !ttt.suppressed && ttt.closes === SESSIONS;
  }, 'all three visits in the KPIs');
  assert.ok(answers.length >= SESSIONS && answers.every(status => status === 204), 'every batch was accepted: ' + answers);
  assert.equal(kpis.totals.sessions, SESSIONS);
  assert.equal(kpis.totals.gameOpens, SESSIONS);
  assert.equal(kpis.totals.errors, 0);
  assert.equal(kpis.totals.players.sessionStarts, SESSIONS);
  assert.equal(kpis.totals.players.newProfiles, 0, 'the profile was made before sharing started');
  assert.equal(kpis.totals.players.guests, 0);
  assert.deepEqual(kpis.totals.players.profileAge, [SESSIONS, 0, 0, 0], 'a profile made today');
  assert.deepEqual(kpis.totals.players.daysSinceLast, [SESSIONS - 1, 0, 0, 0, 1], 'a first time, then the same day');
  const ttt = kpis.games.find(g => g.slug === 'tic-tac-toe');
  assert.equal(ttt.sessions, SESSIONS);
  assert.equal(ttt.opens, SESSIONS);
  assert.equal(ttt.closes, SESSIONS);
  assert.deepEqual(ttt.rounds.codes, { w: 0, l: 0, d: 0, e: SESSIONS, q: 0 }, 'a two-player round ends neutrally');
  assert.equal(ttt.loads, SESSIONS);
  assert.ok(ttt.il.reduce((a, b) => a + b) > 0, 'the clicks went into the input-latency histogram');
  assert.deepEqual(ttt.replay.playsBefore, [1, 1, 1, 0, 0], 'the child had played it 0, 1 and 2 times before');
  const level = kpis.levels.find(l => l.slug === 'tic-tac-toe' && l.id === 'local');
  assert.equal(level.starts, SESSIONS);
  const band = kpis.bands.find(b => b.band === '6-7');
  assert.equal(band.sessions, SESSIONS);
  assert.equal(band.games.find(g => g.slug === 'tic-tac-toe').share, 1, 'tic-tac-toe is all this band opened');
  assert.ok(!kpis.bands.some(b => b.band !== '6-7' && b.sessions), 'no other band');
  assert.equal(kpis.modes.find(m => m.mode === 'web').sessions, SESSIONS);
  assert.equal((await admin('/v1/admin/kpis?band=10-11')).totals.sessions, 0, 'another band has nothing to show');

  // The database holds neither the site's address nor any of the portal's storage keys.
  const db = fs.readdirSync(dir).map(file => fs.readFileSync(path.join(dir, file)).toString('latin1')).join('');
  for (const secret of [site.origin, 'sg:site']) assert.ok(!db.includes(secret), 'the database never holds ' + secret);
  assert.deepEqual(outside, [], 'nothing else goes over the network');
  assert.deepEqual(errors, [], 'no page or console errors');
});

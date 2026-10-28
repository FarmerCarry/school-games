// End to end: the real portal and a real game in Chromium send their telemetry, without
// names (js/telemetry.js, wire version 3), to the real ingest server (server/app.mjs), and
// the server's admin answers show what the children did: one student per profile, with
// the right minutes, and one student for a child a teacher gave the same code on two PCs
// (the teacher page's transfer, merged through cd). Playwright hands each POST for
// https://ingest.test to the in-process server on 127.0.0.1, so nothing leaves this
// machine. The sink is switched on with window.SG_TELEMETRY = { url, allowLocal: true },
// which no build ever writes. Each browser context is one PC; its time zone is the school's.
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
const { DatabaseSync } = await import('node:sqlite');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const TOKEN = 'e2e-admin-token-0123456789';
const ZONE = 'Asia/Riyadh';
const SESSIONS = 3; // three page loads of one player: one student, three sessions
// What a teacher typed on this PC: the statistics id and label (teacher page), never sent.
const META = JSON.stringify({ pc: { id: 'pcwxyz', label: 'مختبر سارة' }, since: '2026-10-01' });
let browser, site;

before(async () => {
  site = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await site?.close();
});

async function until(check, label, ms = 30000) {
  for (const end = Date.now() + ms; !(await check());) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + label);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const ready = page => page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
// The school's ingest server, with its own database, for one test: its admin answers and
// its facts, read as they are stored.
async function school(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-telemetry-e2e-'));
  const app = createApp({ dbPath: path.join(dir, 'telemetry.db'), allowedOrigins: [site.origin], adminToken: TOKEN });
  const address = await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = 'http://127.0.0.1:' + address.port;
  return {
    url, dir,
    async admin(route) {
      const res = await fetch(url + route, { headers: { Authorization: 'Bearer ' + TOKEN } });
      assert.equal(res.status, 200, route);
      return res.json();
    },
    facts(sql, ...params) {
      const db = new DatabaseSync(path.join(dir, 'telemetry.db'), { readOnly: true });
      try { return db.prepare(sql).all(...params).map(row => ({ ...row })); } finally { db.close(); }
    }
  };
}

// One PC: a browser context whose POSTs to https://ingest.test reach the school's server,
// which answers with its real status and headers. Sharing starts once the page has set
// e2e:share, so a test decides which sessions are sent. No page or console errors and
// no other request. (What an unloading page sends leaves after the page is gone, where
// this route does not see it: here that is only a session's 'se'.)
async function pc(t, server) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: ZONE });
  t.after(() => context.close());
  const state = { context, errors: [], outside: [], answers: [], bodies: [] };
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== site.origin && url.origin !== 'https://ingest.test') state.outside.push(request.method() + ' ' + request.url());
  });
  await context.route('https://ingest.test/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') state.bodies.push(request.postData());
    const res = await fetch(server.url + new URL(request.url()).pathname, {
      method: request.method(),
      headers: { 'Content-Type': request.headers()['content-type'] || 'text/plain', Origin: site.origin },
      body: request.method() === 'POST' ? request.postData() : undefined
    });
    state.answers.push(res.status);
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  await context.addInitScript(() => {
    if (localStorage.getItem('e2e:share')) Object.defineProperty(window, 'SG_TELEMETRY', { value: { url: 'https://ingest.test/v1/batch', allowLocal: true }, writable: false });
  });
  state.page = await context.newPage();
  state.page.on('pageerror', error => state.errors.push(error.message));
  state.page.on('console', message => { if (message.type() === 'error') state.errors.push(message.text()); });
  t.after(() => {
    assert.deepEqual(state.outside, [], 'nothing else goes over the network');
    assert.deepEqual(state.errors, [], 'no page or console errors');
  });
  return state;
}
// A fresh portal page (a new telemetry session), a real two-player round of tic-tac-toe
// plus 90 s of engaged play the game reports, then home: leaving the game sends at once.
async function session(state, label) {
  const { page } = state, sent = state.answers.length;
  await page.goto(site.origin + '/index.html');
  await page.waitForFunction(() => window.SGProfiles && SGProfiles.player() && SGTelemetry.active());
  await page.locator('.catalog-grid .tile[data-slug="tic-tac-toe"]').click();
  await ready(page);
  const game = page.frameLocator('#stage iframe');
  await game.locator('#localButton').click();
  for (const [i, move] of [0, 3, 1, 4, 2].entries()) {
    await game.locator(`#gameBoard [data-move="${move}"]`).click();
    await game.locator(`#gameBoard[data-moves="${i + 1}"]`).waitFor();
  }
  const frame = page.frames().find(f => f.url().includes('/games/tic-tac-toe/'));
  await frame.evaluate(() => parent.postMessage({ type: 'sg:telemetry', version: 2, e: 90000, f: [0, 0, 0, 0], il: [0, 0, 0, 0, 0, 0], ev: [] }, location.origin));
  await page.locator('#logo').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  await until(() => state.bodies.slice(sent).some(body => JSON.parse(body).ev.some(ev => ev[0] === 'gx')), label + ' at the server');
}
// The engaged ms of every game visit the PC sent (gx), as the server adds them up.
const engaged = (...states) => states.flatMap(s => s.bodies).flatMap(body => JSON.parse(body).ev).filter(ev => ev[0] === 'gx')
  .reduce((ms, ev) => ms + ev[4], 0);
const minutes = ms => Math.round(ms / 6000) / 10;
const rid = page => page.evaluate(() => JSON.parse(localStorage.getItem('sg:site:rid')));

test('three sessions of a 6-7 year old: one student with the right minutes, codes in the facts, nothing that could name a child', async t => {
  const server = await school(t), { admin, facts } = server;
  const state = await pc(t, server), { page } = state;
  await page.goto(site.origin + '/index.html');
  await page.waitForFunction(() => window.SGProfiles && window.SGTelemetry && !SGTelemetry.active());
  // The profile is made before sharing starts, so every session sent is that player's.
  await page.evaluate(meta => {
    const p = SGProfiles.create(1, 4, '6-7');
    SGProfiles.select(p.k);
    localStorage.setItem('sg:site:statsmeta', meta);
    localStorage.setItem('e2e:share', '1');
  }, META);
  for (let n = 1; n <= SESSIONS; n++) await session(state, 'session ' + n);
  const { pc: p, k: { p1: u } } = await rid(page);
  assert.match(u, /^[0-9a-f]{12}$/);
  assert.match(p, /^[0-9a-f]{12}$/);

  let kpis;
  await until(async () => {
    kpis = await admin('/v1/admin/kpis');
    return kpis.games.find(g => g.slug === 'tic-tac-toe')?.closes === SESSIONS;
  }, 'all three visits in the KPIs');
  assert.ok(state.answers.length >= SESSIONS && state.answers.every(status => status === 204), 'every batch was accepted: ' + state.answers);
  // The school's clock comes from the PC; nothing is hidden, even for one child.
  assert.deepEqual([kpis.clock.tz, kpis.clock.source, kpis.minSessions], [ZONE, 'pc', 0]);
  assert.equal(kpis.totals.sessions, SESSIONS);
  assert.equal(kpis.totals.gameOpens, SESSIONS);
  assert.equal(kpis.totals.errors, 0);
  assert.equal(kpis.totals.players.sessionStarts, SESSIONS);
  assert.equal(kpis.totals.players.newProfiles, 0, 'the profile was made before sharing started');
  assert.equal(kpis.totals.players.guests, 0);
  assert.deepEqual(kpis.totals.players.profileAge, [SESSIONS, 0, 0, 0], 'a profile made today');
  assert.deepEqual(kpis.totals.players.daysSinceLast, [SESSIONS - 1, 0, 0, 0, 1], 'a first time, then the same day');
  assert.equal(kpis.totals.students.active, 1, 'one child');
  assert.deepEqual([kpis.totals.students.guestSessions, kpis.totals.students.guestMinutes], [0, 0]);
  assert.equal(kpis.totals.engagedMinutes, minutes(engaged(state)));
  const ttt = kpis.games.find(g => g.slug === 'tic-tac-toe');
  assert.equal(ttt.sessions, SESSIONS);
  assert.equal(ttt.opens, SESSIONS);
  assert.equal(ttt.students, 1);
  assert.deepEqual(ttt.rounds.codes, { w: 0, l: 0, d: 0, e: SESSIONS, q: 0 }, 'a two-player round ends neutrally');
  assert.equal(ttt.duoRounds, SESSIONS, 'tic-tac-toe\'s local rounds are two-player rounds');
  assert.equal(ttt.loads, SESSIONS);
  assert.ok(ttt.il.reduce((a, b) => a + b) > 0, 'the clicks went into the input-latency histogram');
  assert.deepEqual(ttt.replay.playsBefore, [1, 1, 1, 0, 0], 'the child had played it 0, 1 and 2 times before');
  assert.ok(ttt.wallMinutes > 0, 'Kit\'s round counters arrived');
  const level = kpis.levels.find(l => l.slug === 'tic-tac-toe' && l.id === 'local');
  assert.equal(level.starts, SESSIONS);
  const band = kpis.bands.find(b => b.band === '6-7');
  assert.deepEqual([band.sessions, band.students], [SESSIONS, 1]);
  assert.equal(band.games.find(g => g.slug === 'tic-tac-toe').share, 1, 'tic-tac-toe is all this band opened');
  assert.ok(!kpis.bands.some(b => b.band !== '6-7' && b.sessions), 'no other band');
  assert.equal(kpis.modes.find(m => m.mode === 'web').sessions, SESSIONS);
  assert.equal((await admin('/v1/admin/kpis?band=10-11')).totals.sessions, 0, 'another band has nothing to show');

  // The child is one student, under the profile's code, with the minutes it played.
  const { students } = await admin('/v1/admin/students');
  assert.equal(students.length, 1);
  const [child] = students;
  assert.deepEqual([child.u, child.label, child.kind, child.band, child.bandFirst, child.linked, child.removed],
    [u, u.slice(0, 4).toUpperCase(), 'profile', '6-7', '6-7', [], null]);
  assert.deepEqual([child.days, child.sessions, child.rounds, child.games, child.top, child.pcs], [1, SESSIONS, SESSIONS, 1, ['tic-tac-toe'], 1]);
  assert.ok(engaged(state) >= SESSIONS * 90000);
  assert.equal(child.minutes, minutes(engaged(state)));

  // The facts hold the codes and the zone name, dated from the PC's elapsed seconds.
  const sessions = facts('SELECT u, p, z, wire, clock, a FROM st_sessions ORDER BY id');
  assert.deepEqual(sessions, Array(SESSIONS).fill({ u, p, z: ZONE, wire: 3, clock: 'w', a: '6-7' }));
  assert.deepEqual(facts('SELECT u, label, band_first FROM st_students'), [{ u, label: u.slice(0, 4).toUpperCase(), band_first: '6-7' }]);
  assert.deepEqual(facts('SELECT p, z FROM st_pcs'), [{ p, z: ZONE }]);
  assert.deepEqual(facts('SELECT n, slug, plays FROM st_visits ORDER BY sid'), [0, 1, 2].map(plays => ({ n: 1, slug: 'tic-tac-toe', plays })));
  assert.deepEqual(facts('SELECT n, k, code, duo, attempt FROM st_rounds ORDER BY sid'), [1, 2, 3].map(attempt => ({ n: 1, k: 1, code: 'e', duo: 1, attempt })));
  assert.ok(facts('SELECT wall_ms, inputs FROM st_rounds').every(r => r.wall_ms > 0 && r.inputs === 4), 'each round\'s counters');

  // Nothing that could name a child or a PC: not the site's address, the portal's keys, the
  // profile's key, picture or colour, the teacher page's PC id or label, or the browser.
  const db = fs.readdirSync(server.dir).map(file => fs.readFileSync(path.join(server.dir, file)).toString('latin1')).join('');
  const bytes = text => Buffer.from(text, 'utf8').toString('latin1');
  for (const secret of [site.origin, 'sg:site', '"p1"', bytes('🐸'), '#f57c00', 'pcwxyz', bytes('مختبر'), bytes('سارة'), 'Mozilla', 'Chrome']) {
    assert.ok(!db.includes(secret), 'the database never holds ' + secret);
  }
});

test('the same child on two PCs: the teacher gives the second PC\'s profile the first PC\'s code, and its earlier play joins through cd', async t => {
  const server = await school(t), { admin, facts } = server;
  const first = await pc(t, server), second = await pc(t, server);
  for (const state of [first, second]) {
    await state.page.goto(site.origin + '/index.html');
    await state.page.waitForFunction(() => window.SGProfiles && window.SGTelemetry);
    await state.page.evaluate(() => { localStorage.setItem('e2e:share', '1'); SGProfiles.create(3, 1, '8-9'); });
  }
  await session(first, 'the first PC');
  await session(second, 'the second PC');
  const a = await rid(first.page), b = await rid(second.page);
  const [codeA, codeB] = [a.k.p1, b.k.p1];
  assert.ok(codeA && codeB && codeA !== codeB && a.pc !== b.pc, 'two PCs, two codes');
  await until(async () => (await admin('/v1/admin/students')).students.length === 2, 'two students so far');

  // The teacher opens the teacher page on each PC: the code the first one shows goes into
  // the second one's "the same child as on another PC".
  await first.page.goto(site.origin + '/teacher.html');
  await first.page.locator('#codesPanel summary').click();
  const shown = await first.page.locator('#codes li[data-key="p1"] .code').textContent();
  assert.match(shown, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]$/);
  assert.equal(shown.replace(/-/g, '').slice(0, 12).toLowerCase(), codeA);
  await second.page.goto(site.origin + '/teacher.html');
  await second.page.locator('#codesPanel summary').click();
  await second.page.locator('#codes li[data-key="p1"] [data-link]').click();
  await second.page.locator('#linkCode').fill(shown);
  await second.page.locator('#linkForm button[type="submit"]').click();
  assert.match(await second.page.locator('#linkStatus').textContent(), /ويُضم إليه ما لعبه هنا من قبل/);
  assert.deepEqual(await rid(second.page), { v: 1, pc: b.pc, k: { p1: codeA }, l: { p1: codeB } });

  // The second PC's next session plays under the first code and names its own once.
  await session(second, 'the second PC after the transfer');
  assert.deepEqual(await rid(second.page), { v: 1, pc: b.pc, k: { p1: codeA }, l: {} });
  const sent = second.bodies.map(body => JSON.parse(body));
  const after = sent.filter(body => body.u === codeA);
  assert.ok(after.length && after.every(body => body.p === b.pc));
  assert.deepEqual(after.flatMap(body => body.ev).filter(ev => ev[0] === 'cd'), [['cd', 0, codeB]]);
  assert.ok(first.answers.concat(second.answers).every(status => status === 204));

  // One student: the first code, with the second as a linked code and all three sessions.
  let students;
  await until(async () => (students = (await admin('/v1/admin/students')).students).length === 1, 'one student');
  const [child] = students;
  assert.deepEqual([child.u, child.linked, child.band, child.sessions, child.pcs, child.rounds], [codeA, [codeB], '8-9', 3, 2, 3]);
  assert.equal(child.minutes, minutes(engaged(first, second)));
  assert.deepEqual(facts('SELECT u_old, u_new, how FROM aliases'), [{ u_old: codeB, u_new: codeA, how: 'pc' }]);
  // Either code opens the same student's page.
  for (const code of [codeA, codeB]) {
    const page = await admin('/v1/admin/student?u=' + code);
    assert.deepEqual([page.student.u, page.student.linked, page.student.pcs.length], [codeA, [codeB], 2]);
  }
});

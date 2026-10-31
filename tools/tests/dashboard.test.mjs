// The insights dashboard (server/dashboard) in Chromium, under the Content Security
// Policy it is served with. The page's /v1/* requests are answered by the real Node
// server (server/app.mjs) on 127.0.0.1, filled by server/simulate.mjs, or by a test's own
// stub of one endpoint; ?demo reads the sample answers in server/dashboard/demo/. Any
// other request (the page loads no script from the games site), any CSP violation, page
// error or unexpected console error fails the test.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { hideSqliteWarning } from '../../server/warnings.mjs';

hideSqliteWarning();
const { createApp } = await import('../../server/app.mjs');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";
const TOKEN = 'dashboard-test-token-0123456789';
const DAY_MS = 86400000;
const catalogSource = fs.readFileSync(path.join(repo, 'js/catalog.js'));
const DEMO = path.join(repo, 'server/dashboard/demo');
const demoFile = name => JSON.parse(fs.readFileSync(path.join(DEMO, name), 'utf8'));
const DEMO_STUDENTS = fs.readdirSync(DEMO).filter(f => f.startsWith('student-')).map(f => f.slice(8, -5));
const insightsWindow = {};
vm.runInThisContext('(function (window) {' + fs.readFileSync(path.join(repo, 'server/dashboard/insights.js'), 'utf8') + '\n})')(insightsWindow);
const I = insightsWindow.SGInsights;
vm.runInThisContext('(function (window) {' + fs.readFileSync(path.join(repo, 'server/dashboard/research.js'), 'utf8') + '\n})')(insightsWindow);
const R = insightsWindow.SGResearch;
vm.runInThisContext('(function (window) {' + fs.readFileSync(path.join(repo, 'server/dashboard/dictionary.js'), 'utf8') + '\n})')(insightsWindow);
const D = insightsWindow.SGDictionary;
const catalogWindow = {};
vm.runInNewContext(catalogSource.toString('utf8'), { window: catalogWindow });
const catalog = new Map(catalogWindow.GAMES.map(g => [g.slug, g]));
const nameOf = lang => slug => I.catalogName(catalog.get(slug), lang) || slug;
const BANDS_ORDER = ['6-7', '8-9', '10-11', 'unknown'];

let browser, site, dir, app, ingest, unset, unsetUrl;
const today = () => new Date().toISOString().slice(0, 10);
const dayBefore = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') - n * DAY_MS).toISOString().slice(0, 10);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, 'server/simulate.mjs'), ...args], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('simulate.mjs exited with ' + code)));
  });
}
const hex = (n, i) => i.toString(16).padStart(n, '0');

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dashboard-'));
  const dbPath = path.join(dir, 'telemetry.db');
  const sim = spawnSync(process.execPath, [path.join(repo, 'server/simulate.mjs'), '--db', dbPath, '--days', '30', '--sessions', '30', '--seed', '3'], { encoding: 'utf8' });
  assert.equal(sim.status, 0, sim.stderr);
  app = createApp({ dbPath, adminToken: TOKEN });
  ingest = 'http://127.0.0.1:' + (await app.listen(0, '127.0.0.1')).port;
  // A few children playing right now (the live view), and a game only two children opened.
  await run(['--url', ingest, '--sessions', '8', '--seed', '5']);
  for (let i = 1; i <= 2; i++) {
    const batch = { v: 2, b: hex(16, 0xd00 + i), s: hex(12, 0xd00 + i), k: 'src', m: 'web', a: '8-9', d: [4, 4, 1920],
      ev: [['ss', 0, 0, 1, 1, 3], ['go', 2, 'zz-private', 'catalog', 0], ['gx', 40, 'zz-private', 30000, [5, 0, 0, 0, 0, 0], [900, 10, 0, 0]]] };
    const res = await fetch(ingest + '/v1/batch', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(batch) });
    assert.equal(res.status, 204);
  }
  // A server deployed without a dashboard password.
  unset = createApp({ dbPath: ':memory:' });
  unsetUrl = 'http://127.0.0.1:' + (await unset.listen(0, '127.0.0.1')).port;
  site = await startTestServer(path.join(repo, 'server/dashboard'));
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await site?.close();
  await app?.close();
  await unset?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// A browser context whose every request is accounted for. mode.api: 'server' (default),
// 'unset' (no ADMIN_TOKEN: 404), 'down' (network error). mode.stub: { '/v1/admin/<path>':
// (method, body, search) => [status, json] } answers that path instead of the server.
// mode.edit(kpis) changes the server's KPI answers; mode.clock() gives every server answer
// that clock instead of its own.
async function open(t, { viewport = { width: 1366, height: 768 }, locale = 'en-GB', colorScheme = 'light', token, lang, timezoneId = 'UTC' } = {}) {
  const context = await browser.newContext({ viewport, locale, colorScheme, serviceWorkers: 'block', timezoneId, acceptDownloads: true });
  t.after(() => { s.closed = true; return context.close(); });
  // missing: the URLs the server answered 404 (a stub of an older server); the browser logs
  // those, and the page carries on without them.
  const s = { context, mode: { api: 'server' }, api: [], outside: [], errors: [], allowed: [], missing: new Set(), files: [] };
  context.on('request', request => {
    const url = request.url();
    if (!url.startsWith(site.origin + '/')) s.outside.push(request.method() + ' ' + url);
  });
  // A request still on its way when the test closes the context is dropped quietly; any
  // other failure of the routing is reported by s.check().
  await context.route('**/*', route => answer(route).catch(error => { if (!s.closed) s.errors.push('routing: ' + error.message); }));
  async function answer(route) {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== site.origin) return route.abort();
    if (url.pathname.startsWith('/v1/')) {
      if (s.mode.api === 'down') return route.abort('connectionrefused');
      const stub = s.mode.stub && s.mode.stub[url.pathname];
      if (stub) {
        // [status, json], or { status, contentType, headers, body } for another kind of answer.
        const body = request.postData() ? JSON.parse(request.postData()) : undefined;
        const out = await stub(request.method(), body, url.searchParams);
        const [status, json] = Array.isArray(out) ? out : [out.status, null];
        s.api.push({ path: url.pathname, method: request.method(), search: url.searchParams, auth: request.headers().authorization,
          type: request.headers()['content-type'], body, status, json });
        return route.fulfill(Array.isArray(out) ? { status, contentType: 'application/json', body: JSON.stringify(json) } : out);
      }
      const target = (s.mode.api === 'unset' ? unsetUrl : ingest) + url.pathname + url.search;
      const auth = request.headers().authorization, type = request.headers()['content-type'];
      const res = await fetch(target, { method: request.method(), headers: { ...(auth ? { Authorization: auth } : {}), ...(type ? { 'Content-Type': type } : {}) },
        body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postData() || undefined });
      let body = Buffer.from(await res.arrayBuffer());
      const entry = { path: url.pathname, method: request.method(), search: url.searchParams, auth, status: res.status };
      const json = res.status === 200 && /json/.test(res.headers.get('content-type') || '');
      if (json) entry.json = JSON.parse(body.toString('utf8'));
      if (res.status === 404) s.missing.add(request.url());
      if (json && s.mode.edit && url.pathname === '/v1/admin/kpis') entry.json = s.mode.edit(entry.json);
      if (json && s.mode.clock && entry.json.clock) entry.json.clock = { ...entry.json.clock, ...s.mode.clock() };
      if (json && (s.mode.edit || s.mode.clock)) body = Buffer.from(JSON.stringify(entry.json));
      s.api.push(entry);
      const headers = Object.fromEntries(res.headers);
      delete headers['content-length'];
      return route.fulfill({ status: res.status, headers, body });
    }
    if (url.pathname.startsWith('/demo/')) s.files.push(url.pathname.slice(6));
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if ((headers['content-type'] || '').startsWith('text/html')) headers['content-security-policy'] = CSP;
    return route.fulfill({ response: res, headers });
  }
  await context.addInitScript(({ token, lang }) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      if (token) localStorage.setItem('sg:dash:token', token);
      if (lang) localStorage.setItem('sg:dash:lang', lang);
    }
  }, { token, lang });
  const page = await context.newPage();
  page.on('pageerror', error => s.errors.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/status of 404/.test(text) && s.missing.has(message.location().url)) return;
    if (!s.allowed.some(re => re.test(text))) s.errors.push(text);
  });
  s.page = page;
  s.check = async () => {
    assert.deepEqual(await page.evaluate(() => window.__csp), [], 'no Content Security Policy violation');
    assert.deepEqual(s.errors, [], 'no page or console errors');
    assert.deepEqual(s.outside, [], 'no request outside the dashboard');
  };
  // The school's day, as the newest answer of the server says (UTC for a server without the clock).
  s.today = () => {
    const hit = s.api.filter(e => e.json && e.json.clock && /^\d{4}-\d\d-\d\d$/.test(e.json.clock.today)).at(-1);
    return hit ? hit.json.clock.today : today();
  };
  s.kpis = () => s.api.filter(e => e.path === '/v1/admin/kpis');
  s.lastKpis = () => s.kpis().at(-1);
  s.lastLive = () => s.api.filter(e => e.path === '/v1/admin/live' && e.json).at(-1);
  return s;
}
const signIn = async (page, password) => {
  await page.fill('#password', password);
  await page.click('#signinBtn');
};
const tileValue = (page, key) => page.locator(`.tile[data-key="${key}"]`).getAttribute('data-value');
const tileText = (page, key) => page.locator(`.tile[data-key="${key}"] .tile-number`).textContent();
// The page marks #dash is-loading before it asks; the answer is logged before the page gets it.
async function waitForKpis(s, count) {
  for (const end = Date.now() + 15000; s.kpis().length < count;) {
    if (Date.now() > end) throw new Error('waiting for KPI request ' + count);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await s.page.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 6 &&
    !document.getElementById('dash').classList.contains('is-loading'));
}
// A tab's page once its data is drawn.
const waitForView = (page, tab) => page.waitForFunction(t => document.querySelector('#view[data-route="' + t + '"] .section') &&
  !document.getElementById('dash').classList.contains('is-loading'), tab);
// The insight sentences as insights.js writes them (without the small-sample chip).
const insightTexts = page => page.locator('.insight-text').evaluateAll(nodes => nodes.map(n => {
  const copy = n.cloneNode(true);
  copy.querySelectorAll('.chip').forEach(c => c.remove());
  return copy.textContent.trim();
}));
const OVERVIEW_SECTIONS = ['daily', 'when', 'favourites', 'by-age', 'stuck', 'difficulty', 'returning', 'health'];

test('sign in: a wrong password says so, the right one shows the server\'s numbers, sign out forgets it', async t => {
  const s = await open(t);
  const { page } = s;
  s.allowed.push(/status of 401/);
  await page.goto(site.origin + '/');
  await page.locator('#signin').waitFor();
  assert.equal(await page.locator('#dash').isHidden(), true);
  assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');

  await signIn(page, 'not-the-password-1234');
  await page.locator('#signinError').waitFor();
  assert.match(await page.locator('#signinError').textContent(), /That password is not right/);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dash:token')), null);
  assert.equal(s.api.at(-1).status, 401);

  await signIn(page, TOKEN);
  await page.locator('#dash').waitFor();
  await waitForKpis(s, 1);
  const call = s.lastKpis();
  assert.equal(call.auth, 'Bearer ' + TOKEN);
  assert.equal(call.search.get('to'), s.today());
  assert.equal(call.search.get('from'), dayBefore(s.today(), 29), 'the default period is 30 days');
  assert.equal(call.search.get('band'), null);
  const k = call.json, live = s.lastLive().json;
  // The headline tiles are the KPI JSON; a server without students per period shows a dash.
  assert.equal(Number(await tileValue(page, 'sessions')), k.totals.sessions);
  assert.equal(await tileText(page, 'sessions'), k.totals.sessions.toLocaleString('en-US'));
  assert.equal(Number(await tileValue(page, 'playTime')), k.totals.engagedMinutes);
  assert.equal(await tileText(page, 'playTime'), I.duration(k.totals.engagedMinutes, 'en').value);
  const st = k.totals.students;
  assert.equal(await tileValue(page, 'students'), st ? String(st.active) : '');
  assert.equal(await tileValue(page, 'newStudents'), st ? String(st.new) : '');
  assert.equal(await tileValue(page, 'perStudentDay'), st ? String(st.minutesPerStudentDay.median) : '');
  if (!st) assert.equal(await tileText(page, 'students'), '—');
  assert.ok(live.total.sessions >= 8);
  assert.equal(Number(await tileValue(page, 'now')), live.total.sessions);
  // The insights are insights.js on that JSON, with the catalog's names.
  const expected = I.insights(k, { lang: 'en', name: nameOf('en'), today: s.today() }).map(x => x.text);
  assert.ok(expected.length >= 1 && expected.length <= 5);
  assert.deepEqual(await insightTexts(page), expected);
  for (const id of OVERVIEW_SECTIONS) assert.equal(await page.locator('#' + id).count(), 1, id);
  assert.equal(await page.locator('#tabs a[aria-current="page"]').getAttribute('data-tab'), 'overview');
  assert.equal(new URL(page.url()).hash, '#/overview');
  assert.match(await page.locator('#status .updated').textContent(), /^Updated \d\d:\d\d$/);

  // Kept across a reload until signing out.
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dash:token')), TOKEN);
  await page.reload();
  await page.locator('#dash').waitFor();
  await waitForKpis(s, 2);
  assert.equal(await page.locator('#signin').isHidden(), true);
  await page.click('#signOutBtn');
  await page.locator('#signin').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dash:token')), null);
  assert.equal(await page.locator('#tiles .tile').count(), 0, 'no numbers left on the page');
  assert.equal(await page.locator('#signinError').isHidden(), true);
  await s.check();
});

test('filters change the request and every section; the period and age band', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const pick = async (filter, value) => {
    const n = s.kpis().length;
    await page.click(`#${filter} button[data-value="${value}"]`);
    await waitForKpis(s, n + 1);
    assert.equal(await page.locator(`#${filter} button[data-value="${value}"]`).getAttribute('aria-pressed'), 'true');
    return s.lastKpis();
  };
  let call = await pick('periodFilter', 7);
  assert.equal(call.search.get('from'), dayBefore(s.today(), 6));
  assert.equal(call.search.get('to'), s.today());
  assert.equal(await tileValue(page, 'sessions'), String(call.json.totals.sessions));
  await page.click('#daily-count .table-toggle');
  assert.equal(await page.locator('#daily-count .table-host tbody tr').count(), 7, 'one row per day');
  assert.equal(await page.locator('#daily-count .chart-host').isHidden(), true);
  await page.click('#daily-count .table-toggle');
  assert.equal(await page.locator('#daily-count svg.chart').count(), 1);

  call = await pick('bandFilter', '8-9');
  assert.equal(call.search.get('band'), '8-9');
  assert.equal(call.json.range.band, '8-9');
  assert.equal(await tileValue(page, 'sessions'), String(call.json.totals.sessions));
  assert.match(await page.locator('#rangeText').textContent(), /8–9$/);
  assert.match(await page.locator('#by-age').textContent(), /Only children aged 8–9 are shown/, 'no second copy of the favourites');
  assert.deepEqual([...new Set(await page.locator('#difficulty .diff-cell[data-band]').evaluateAll(cells => cells.map(c => c.dataset.band)))], ['8-9']);
  assert.deepEqual(await insightTexts(page), I.insights(call.json, { lang: 'en', name: nameOf('en'), today: s.today() }).map(x => x.text));

  call = await pick('periodFilter', 1);
  assert.equal(call.search.get('from'), s.today());
  assert.match(await page.locator('#daily').textContent(), /Choose 7, 30 or 90 days/);
  call = await pick('bandFilter', 'all');
  assert.equal(call.search.get('band'), null);
  call = await pick('periodFilter', 90);
  assert.equal(call.search.get('from'), dayBefore(s.today(), 89));
  assert.equal(await page.locator('#by-age .panel').count(), call.json.bands.length);
  // Refresh with an unchanged answer: the page (its focus and scroll) stays as it is.
  const tile = await page.locator('.tile[data-key="sessions"]').elementHandle();
  const n = s.kpis().length;
  await page.click('#refreshBtn');
  await waitForKpis(s, n + 1);
  assert.equal(s.lastKpis().search.get('from'), dayBefore(s.today(), 89), 'the refresh asks for the same period');
  assert.equal(await tile.evaluate(node => node.isConnected), true, 'no rebuild for the same numbers');
  await s.check();
});

test('table views, tooltips, and a game one child opened: shown with its numbers and a small-sample chip', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  // Students per game, as the updated server sends them: one game only one child played.
  s.mode.edit = k => {
    for (const g of k.games) if (!g.suppressed) g.students = 40;
    const few = k.games.filter(g => !g.suppressed).sort((a, b) => b.opens - a.opens)[0];
    few.students = 1;
    return k;
  };
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const k = s.lastKpis().json;
  const shown = k.games.filter(g => !g.suppressed);
  const top = I.favourites(k).rows[0];
  assert.equal(top.students, 1);
  // The chart: the bar keeps its number, a chip says how few children it is based on.
  assert.match(await page.locator('#fav-card svg .mark').first().textContent(), /based on 1 child/);
  assert.equal(await page.locator('#fav-card svg .mark').first().locator('.bar-label.is-small').count(), 1);
  // The favourites table: every game the server sent, no line about hidden ones.
  await page.click('#fav-card .table-toggle');
  const rows = page.locator('#fav-card .table-host tbody tr');
  assert.equal(await rows.count(), shown.length);
  assert.deepEqual(await rows.first().locator('th, td').allTextContents(),
    [nameOf('en')(top.slug), top.opens.toLocaleString('en-US'), I.pct(top.share), top.sessions.toLocaleString('en-US'), I.duration(top.engagedMinutes, 'en').text]);
  assert.doesNotMatch(await page.locator('body').textContent(), /hidden for privacy|fewer than 3 children/i);
  // Every chart card has its table twin.
  for (const id of ['daily-count', 'daily-minutes', 'when-card', 'cat-card', 'age-card', 'stuck-card', 'diff-card', 'back-card', 'weeks-card']) {
    await page.click(`#${id} .table-toggle`);
    assert.ok(await page.locator(`#${id} .table-host table`).isVisible(), id);
    assert.ok(await page.locator(`#${id} .table-host tbody tr`).count() > 0, id);
  }
  // Tooltips: a bar on hover (with the chip's sentence), the daily chart on keyboard focus.
  await page.click('#fav-card .table-toggle');
  await page.locator('#fav-card svg .mark').first().hover();
  await page.locator('.tip').waitFor();
  assert.match(await page.locator('.tip').textContent(), new RegExp(nameOf('en')(top.slug) + '.*Based on 1 child so far'));
  await page.click('#daily-count .table-toggle');
  await page.locator('#daily-count svg.chart').focus();
  await page.keyboard.press('Home');
  const first = new Date(k.daily[0].day + 'T00:00:00Z');
  const tip = await page.locator('.tip').textContent();
  assert.ok(tip.includes(first.toLocaleString('en-GB', { timeZone: 'UTC', month: 'long' })) && tip.includes(String(first.getUTCDate()) + ' '),
    'the oldest day: ' + tip);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tip').isHidden(), true);
  await s.check();
});

test('the newer server\'s age-group win rates and play time are used when they are there', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  // What server/handler.mjs adds to bands[].games[] (docs/ARCHITECTURE.md, milestone 2).
  s.mode.edit = k => {
    for (const b of k.bands) for (const g of b.games || []) {
      if (g.suppressed) continue;
      const all = k.games.find(x => x.slug === g.slug);
      Object.assign(g, { winRate: all.winRate === null ? null : Math.max(0, Math.round((all.winRate - 0.25 + 0.2 * BANDS_ORDER.indexOf(b.band)) * 1e4) / 1e4),
        dropOffRate: all.dropOffRate, engagedMinutes: Math.round(g.opens * 3.3 * 10) / 10 });
    }
    return k;
  };
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const k = s.lastKpis().json;
  const grid = I.difficultyGrid(k);
  assert.ok(grid.rows.some(r => Object.values(r.cells).some(c => c.basis === 'win')), 'the win rates are judged');
  await page.click('#difficulty .more');
  for (const r of grid.rows) {
    for (const band of I.BANDS) {
      assert.equal(await page.locator(`#difficulty .diff-row[data-slug="${r.slug}"] .diff-cell[data-band="${band}"] .verdict`).getAttribute('data-verdict'),
        r.cells[band].code, r.slug + ' ' + band);
    }
  }
  await page.click('#age-card .table-toggle');
  assert.deepEqual(await page.locator('#age-card .table-host thead th').allTextContents(), ['Age group', 'Game', 'Share of play time', 'Games opened', 'Play time']);
  assert.match(await page.locator('#age-card .card-sub').textContent(), /share of that group’s play time/, 'the subtitle names the measure shown');
  // The switch: by opens, as a share of the group's game opens.
  await page.click('#age-card button[data-value="opens"]');
  assert.deepEqual(await page.locator('#age-card .table-host thead th').allTextContents(), ['Age group', 'Game', 'Share of opens', 'Games opened', 'Play time']);
  assert.match(await page.locator('#age-card .card-sub').textContent(), /share of that group’s game opens/);
  await s.check();
});

test('Arabic: right to left, Arabic game names, Western digits, remembered', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  await page.click('#langBtn');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
  assert.equal(await page.title(), 'لوحة متابعة اللعب · ألعاب الفسحة');
  assert.equal(await page.locator('.tile[data-key="sessions"] .tile-label').textContent(), 'جلسات اللعب');
  const k = s.lastKpis().json;
  const top = I.favourites(k).rows[0];
  await page.click('#fav-card .table-toggle');
  assert.equal(await page.locator('#fav-card .table-host tbody tr th').first().textContent(), catalog.get(top.slug).title);
  assert.deepEqual(await insightTexts(page), I.insights(k, { lang: 'ar', name: nameOf('ar'), today: s.today() }).map(x => x.text));
  const text = await page.locator('body').textContent();
  assert.ok(!/[\u0660-\u0669\u06f0-\u06f9]/.test(text), 'Western digits only');
  // Every number range ("6–7", "2–3 أنوية", ...) is drawn low to high inside the Arabic text.
  const ranges = await page.evaluate(() => {
    const out = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      for (const m of node.textContent.matchAll(/(\d+)–(\d+)/g)) {
        const box = (i, n) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + n); return r.getBoundingClientRect(); };
        const a = box(m.index, m[1].length), b = box(m.index + m[1].length + 1, m[2].length);
        if (a.width) out.push({ text: m[0], lowFirst: a.left < b.left });
      }
    }
    return out;
  });
  assert.ok(ranges.length > 5, 'ranges found: ' + ranges.length);
  assert.deepEqual(ranges.filter(r => !r.lowFirst), [], 'ranges drawn high to low');
  assert.equal(await tileText(page, 'sessions'), k.totals.sessions.toLocaleString('en-US'));
  // Bars grow from the right.
  const bar = await page.locator('#returning svg .bar').first().boundingBox();
  const track = await page.locator('#returning svg .track').first().boundingBox();
  assert.ok(Math.abs(bar.x + bar.width - (track.x + track.width)) < 1.5, 'the bar starts at the right end of its track');
  await page.reload();
  await waitForKpis(s, 2);
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl', 'the language is remembered');
  await page.click('#langBtn');
  assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dash:lang')), 'en');
  await s.check();
});

test('the browser language picks the default; the theme toggle overrides the system and is kept', async t => {
  const s = await open(t, { locale: 'ar-SA', colorScheme: 'dark' });
  const { page } = s;
  await page.goto(site.origin + '/');
  await page.locator('#signin').waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await page.locator('#signinTitle').textContent(), 'تسجيل الدخول');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await bg(), 'rgb(13, 13, 13)', 'dark from the system');
  assert.equal(await page.locator('#themeBtn').getAttribute('aria-pressed'), 'true');
  await page.click('#themeBtn');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await bg(), 'rgb(245, 244, 241)');
  await page.reload();
  await page.locator('#signin').waitFor();
  assert.equal(await bg(), 'rgb(245, 244, 241)', 'the choice is kept');
  await s.check();
});

test('demo mode: sample data without signing in, and nothing sent to the server', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo');
  await page.locator('#demoBanner').waitFor();
  assert.match(await page.locator('#demoBanner').textContent(), /Sample data/);
  await page.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 6 && document.querySelector('.tile[data-key="now"]').dataset.value);
  const k = demoFile('kpis-30-all.json'), live = demoFile('live.json');
  assert.equal(Number(await tileValue(page, 'sessions')), k.totals.sessions);
  assert.equal(Number(await tileValue(page, 'students')), k.totals.students.active);
  assert.equal(Number(await tileValue(page, 'newStudents')), k.totals.students.new);
  assert.equal(Number(await tileValue(page, 'perStudentDay')), k.totals.students.minutesPerStudentDay.median);
  assert.equal(Number(await tileValue(page, 'now')), live.total.sessions);
  assert.match(await page.locator('.tile[data-key="now"] .tile-hint').textContent(), new RegExp(`${live.total.sessions} children: ${live.students} students, ${live.guests} guests`));
  assert.equal(s.lastKpis(), undefined);
  // The school's day of the sample, not this computer's.
  assert.match(await page.locator('#rangeText').textContent(), /27 Oct 2026/);
  assert.match(await page.locator('#clockText').textContent(), /Asia\/Riyadh/);
  assert.equal(await page.locator('#clockChange').count(), 0, 'the sample cannot be changed');
  assert.equal(await page.locator('#signOutBtn').isHidden(), true);
  await page.click('#bandFilter button[data-value="6-7"]');
  await page.waitForFunction(v => document.querySelector('.tile[data-key="sessions"]').dataset.value === v, String(demoFile('kpis-30-6-7.json').totals.sessions));
  await page.click('#periodFilter button[data-value="90"]');
  await page.waitForFunction(v => document.querySelector('.tile[data-key="sessions"]').dataset.value === v, String(demoFile('kpis-90-6-7.json').totals.sessions));
  // The sample has its own periods only.
  assert.deepEqual(await page.locator('#periodFilter button').evaluateAll(b => b.map(x => x.dataset.value)), ['1', '7', '30', '90']);
  assert.deepEqual(s.api, [], 'no /v1 request in demo mode');
  await s.check();
});

test('a password never set (404) and an unreachable server are explained in plain words', async t => {
  const s = await open(t);
  const { page } = s;
  s.allowed.push(/status of 404/, /ERR_CONNECTION_REFUSED|net::ERR_FAILED/);
  await page.goto(site.origin + '/');
  s.mode.api = 'unset';
  await signIn(page, TOKEN);
  await page.locator('#signinError ol').waitFor();
  assert.match(await page.locator('#signinError').textContent(), /The dashboard password was not set when the server was deployed/);
  assert.equal(await page.locator('#signinError li').count(), 5);
  assert.match(await page.locator('#signinError').textContent(), /ADMIN_TOKEN/);
  s.mode.api = 'down';
  await signIn(page, TOKEN);
  await page.waitForFunction(() => /Cannot reach the server/.test(document.getElementById('signinError').textContent));
  // Switching language keeps the message, translated.
  await page.click('#langBtn');
  assert.match(await page.locator('#signinError').textContent(), /تعذّر الوصول إلى الخادم/);
  await s.check();
});

test('a phone and a 360 px screen: no sideways scrolling, every section there', async t => {
  for (const width of [360, 390]) {
    for (const lang of ['en', 'ar']) {
      const s = await open(t, { viewport: { width, height: 800 }, token: TOKEN, lang });
      const { page } = s;
      await page.goto(site.origin + '/');
      await waitForKpis(s, 1);
      for (const id of OVERVIEW_SECTIONS) assert.ok(await page.locator('#' + id).isVisible(), id);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${width}px ${lang}: ${overflow}px of sideways scroll`);
      await s.check();
    }
  }
});

test('game names come with the dashboard, and no script from the games site runs', async t => {
  // A script from another site could read the stored password, and the published fast
  // build (tools/build.mjs) has no js/catalog.js anyway: the names are in names.js.
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const shown = I.favourites(s.lastKpis().json).rows;
  const names = () => page.locator('#fav-card .table-host tbody tr th').allTextContents();
  await page.click('#fav-card .table-toggle');
  assert.deepEqual((await names()).slice(0, shown.length), shown.map(g => nameOf('en')(g.slug)));
  await page.click('#langBtn');
  assert.deepEqual((await names()).slice(0, shown.length), shown.map(g => nameOf('ar')(g.slug)));
  await s.check();
});

test('chart labels stay inside their cards, left to right and right to left', async t => {
  // The sample data too: its longer "x of y" labels showed figures wider than they were measured.
  for (const [lang, width, demoMode] of [['en', 1366], ['ar', 1366], ['ar', 390], ['en', 1366, true], ['ar', 1366, true]]) {
    const s = await open(t, { viewport: { width, height: 800 }, token: TOKEN, lang });
    const { page } = s;
    const shows = period => page.waitForFunction(v => document.querySelector('.tile[data-key="sessions"]')?.dataset.value === v,
      String(demoFile(`kpis-${period}-all.json`).totals.sessions));
    await page.goto(site.origin + (demoMode ? '/?demo' : '/'));
    if (demoMode) await shows(30); else await waitForKpis(s, 1);
    for (const period of [30, 90]) {
      if (period !== 30) {
        const n = s.kpis().length;
        await page.click(`#periodFilter button[data-value="${period}"]`);
        if (demoMode) await shows(period); else await waitForKpis(s, n + 1);
      }
      const outside = await page.evaluate(() => [...document.querySelectorAll('svg.chart text')].flatMap(text => {
        const card = text.closest('.card'), r = text.getBoundingClientRect();
        if (!card || !r.width) return [];
        const c = card.getBoundingClientRect(), cs = getComputedStyle(card);
        const left = c.left + parseFloat(cs.paddingLeft) - 1, right = c.right - parseFloat(cs.paddingRight) + 1;
        return r.left < left || r.right > right ? [`${card.id}: "${text.textContent}" ${Math.round(r.left)}..${Math.round(r.right)}`] : [];
      }));
      assert.deepEqual(outside, [], `${lang} ${width}px, ${period} days`);
    }
    await s.check();
  }
});

test('the keyboard focus stays on a control that is redrawn', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const focused = () => page.evaluate(() => {
    const el = document.activeElement;
    return el === document.body ? 'body' : (el.closest('[id]') || el).id + ': ' + el.textContent.trim();
  });
  let n = s.kpis().length;
  await page.focus('#periodFilter button[data-value="7"]');
  await page.keyboard.press('Enter');
  await waitForKpis(s, n + 1);
  assert.equal(await focused(), 'periodFilter: 7 days');
  n = s.kpis().length;
  await page.focus('#bandFilter button[data-value="8-9"]');
  await page.keyboard.press('Space');
  await waitForKpis(s, n + 1);
  assert.equal(await focused(), 'bandFilter: 8–9');
  await page.focus('#fav-card .more');
  await page.keyboard.press('Enter');
  assert.equal(await focused(), 'fav-card: Show fewer');
  n = s.kpis().length;
  await page.focus('#refreshBtn');
  await page.keyboard.press('Enter');
  await waitForKpis(s, n + 1);
  assert.equal(await focused(), 'refreshBtn: Refresh');
  await s.check();
});

test('the difficulty check shows the win rate each verdict is based on', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const k = s.lastKpis().json, grid = I.difficultyGrid(k);
  await page.click('#diff-card .table-toggle');
  const head = await page.locator('#diff-card .table-host thead th').allTextContents();
  const col = head.indexOf('Won (of finished)');
  assert.ok(col > 0, head.join(' | '));
  const rows = page.locator('#diff-card .table-host tbody tr');
  assert.equal(await rows.count(), grid.rows.length);
  for (let i = 0; i < grid.rows.length; i++) {
    const g = k.games.find(x => x.slug === grid.rows[i].slug);
    assert.equal(await rows.nth(i).locator('th, td').nth(col).textContent(), I.pct(g.winRate), g.slug);
  }
  await page.click('#diff-card .table-toggle');
  const judged = grid.rows.find(r => r.verdict.basis === 'win');
  await page.locator(`#difficulty .diff-row[data-slug="${judged.slug}"]`).focus();
  const g = k.games.find(x => x.slug === judged.slug);
  assert.ok((await page.locator('.tip').textContent()).includes(I.pct(g.winRate) + 'Won (of finished)'), 'the tooltip says it too');
  await s.check();
});

test('the difficulty rule explains the age-group rules only when this server\'s answer needs them', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const rule = () => page.locator('#diff-card details.rule').textContent();
  // This server reports tries and win rates per age group: no fallback rule to explain.
  assert.doesNotMatch(await rule(), /play sessions|reports only/);
  // An older server reported neither.
  s.mode.edit = k => {
    for (const b of k.bands) for (const g of b.games || []) { delete g.starts; delete g.winRate; delete g.dropOffRate; }
    return k;
  };
  const n = s.kpis().length;
  await page.click('#periodFilter button[data-value="7"]');
  await waitForKpis(s, n + 1);
  assert.match(await rule(), /at least 5 play sessions/);
  assert.match(await rule(), /reports only the share of rounds won/);
  await s.check();
});

test('a day of one child shows its number; days an older server left out break the line and keep whole numbers', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  s.mode.edit = k => {
    const i = k.daily.length - 2;
    k.daily[i] = { day: k.daily[i].day, sessions: 1, engagedMinutes: 4.5, opens: 3, students: 1, guestMinutes: 0 };
    return k;
  };
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  await page.click('#daily-count .table-toggle');
  assert.equal(await page.locator('#daily-count .table-host tbody tr').nth(1).locator('td').textContent(), '1');
  await page.click('#daily-count .table-toggle');
  // An older server's suppressed days: no line, and the axis still counts whole play sessions.
  s.mode.edit = k => { k.daily = k.daily.map(d => ({ day: d.day, suppressed: true })); return k; };
  const n = s.kpis().length;
  await page.click('#periodFilter button[data-value="7"]');
  await waitForKpis(s, n + 1);
  const ticks = await page.locator('#daily-count svg.chart .grid .tick').allTextContents();
  assert.ok(ticks.length >= 2 && ticks.every(v => /^\d+$/.test(v)), ticks.join(' '));
  await s.check();
});

test('a period that reaches back before the update: play sessions per day, no child counted from part of it, and the day said', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  // The updated server on a milestone-2 database: the days up to legacyUntil come from daily
  // totals without students, and every student count starts at factsSince.
  let top = null, factsSince = null;
  s.mode.edit = k => {
    factsSince = k.daily[k.daily.length - 10].day;
    Object.assign(k.range, { legacyUntil: dayBefore(factsSince, 1), factsSince });
    for (const d of k.daily) if (d.day < factsSince) Object.assign(d, { students: null, guestMinutes: null });
    top = k.games.filter(g => !g.suppressed).sort((a, b) => b.opens - a.opens || (a.slug < b.slug ? -1 : 1))[0];
    top.students = 1;   // the children of the last days only
    for (const l of k.levels) if (l.slug === top.slug) l.students = 0;
    return k;
  };
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const k = s.lastKpis().json;
  const since = new Date(factsSince + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  assert.match(await page.locator('#view > p.cutover').textContent(), new RegExp('reaches back before the update of ' + since + '.*start on ' + since));
  // Students per day would read 0 before the update: play sessions per day instead, which every day has.
  assert.equal(await page.locator('#daily-count-title').textContent(), 'Play sessions per day');
  await page.click('#daily-count .table-toggle');
  assert.deepEqual(await page.locator('#daily-count .table-host tbody td').allTextContents(), k.daily.slice().reverse().map(d => d.sessions.toLocaleString('en-US')));
  // No chip or sentence counts the children of part of the period.
  assert.doesNotMatch(await page.locator('#fav-card').textContent(), /based on/);
  assert.doesNotMatch(await page.locator('#insights').textContent(), /based on \d+ child/);
  assert.match(await page.locator('.tile[data-key="students"] .tile-hint').textContent(), /^Counted from \d+ \w+, the update day$/);
  // The game page: its tiles count the whole period, its per-child answer starts at the update.
  await page.goto(site.origin + '/#/game/' + top.slug);
  await waitForView(page, 'game');
  assert.equal(await tileText(page, 'students'), '—');
  assert.ok(await page.locator('#view > p.cutover').isVisible());
  await page.click('#game-daily .table-toggle');
  assert.equal(await page.locator('#game-daily .table-host tbody tr').count(), 10, 'the days since the update');
  if (await page.locator('#funnel-card .card-sub').count()) assert.equal(await page.locator('#funnel-card .card-sub').textContent(), 'Tries of each level, in level order.');
  assert.doesNotMatch(await page.locator('#game-who').textContent(), /based on 0 children/, 'an age group nobody counted has no sample to be based on');
  // Habits: the weeks of new and returning students start with the update's week.
  await page.goto(site.origin + '/#/habits');
  await waitForView(page, 'habits');
  await page.click('#habits-weeks .table-toggle');
  const weeks = await page.locator('#habits-weeks .table-host tbody th').allTextContents();
  assert.ok(weeks.length >= 1 && weeks.length <= 2, weeks.join(' | '));
  // The update day is not in the period: nothing of it.
  s.mode.edit = null;
  await page.goto(site.origin + '/#/overview');
  await page.reload();
  await waitForView(page, 'overview');
  assert.equal(await page.locator('.cutover').count(), 0);
  assert.equal(await page.locator('#daily-count-title').textContent(), 'Students per day');
  await s.check();
});

test('10 to 19 tries give an early sign next to the verdict, fewer than 10 say so', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  let early, few;
  s.mode.edit = k => {
    const games = k.games.filter(g => !g.suppressed && g.rounds && g.rounds.starts >= 20 && g.winRate !== null);
    [early, few] = [games[0].slug, games[1].slug];
    Object.assign(games[0], { rounds: { ...games[0].rounds, starts: 15 }, winRate: 0.2, dropOffRate: 0.1 });
    Object.assign(games[1], { rounds: { ...games[1].rounds, starts: 9 } });
    return k;
  };
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  await page.click('#difficulty .more');
  const cell = slug => page.locator(`#difficulty .diff-row[data-slug="${slug}"] .diff-cell[data-band="all"] .verdict`);
  assert.equal(await cell(early).getAttribute('data-verdict'), 'hard');
  assert.equal(await cell(early).getAttribute('data-early'), 'true');
  assert.match(await cell(early).textContent(), /Too hard.*early sign/);
  assert.equal(await cell(few).getAttribute('data-verdict'), 'few');
  assert.match(await cell(few).textContent(), /Not enough tries yet/);
  await page.locator(`#difficulty .diff-row[data-slug="${early}"]`).focus();
  assert.match(await page.locator('.tip').textContent(), /Too hard · Early sign \(10–19 tries\)/);
  assert.ok(!(await page.locator('.insight').allTextContents()).some(x => x.includes(nameOf('en')(early) + ' looks too hard')), 'an early sign is no finding');
  await s.check();
});

// The settings answer of the updated server (§F.4), for a server that has none yet.
function settingsStub(state) {
  const answer = () => ({ v: 1, clock: { ...state.clock, now: '10:42', weekStart: 'sun', weekSource: 'auto', detected: state.detected,
    factsSince: '2026-10-01', legacyUntil: '2026-09-30', v3Since: '2026-10-02' },
  keep: { days: 400, source: 'env', rollupDays: 800 }, storage: { bytes: 82e6, limit: 5e8, guardAt: 4.25e8, trimmedBefore: null },
  usage: { day: state.clock.today, reads: 450000, writes: 34000, readsLimit: 5e6, writesLimit: 1e5, batchEvery: 60 },
  rebuild: { pending: state.pending || 0, full: 0, done: state.done || 0 }, accepts: [2, 3], pcs: { new: 12, seen14d: 14 } });
  return {
    '/v1/admin/settings': (method, body) => {
      if (method === 'POST') {
        state.posts.push(body);
        if (body.source === 'dashboard') { if (['none', 'dashboard'].includes(state.clock.source)) Object.assign(state.clock, { tz: body.tz, source: 'dashboard', offsetMin: 180 }); }
        else Object.assign(state.clock, { tz: body.tz, source: 'owner', offsetMin: body.tz === 'Europe/London' ? 0 : 180 });
        if (!body.source) Object.assign(state, { pending: 40, done: 0 });
      }
      return [200, answer()];
    }
  };
}

test('the school\'s clock: the browser\'s zone once while none is known, the school\'s day for the period, one click to change it', async t => {
  const s = await open(t, { token: TOKEN, timezoneId: 'Asia/Riyadh' });
  const { page } = s;
  // The school's day is ahead of UTC late in the evening; here it is simply a fixed day.
  const schoolDay = dayBefore(today(), 3);
  const clock = { posts: [], detected: [{ tz: 'Asia/Riyadh', pcs: 12 }], clock: { tz: 'UTC', source: 'none', offsetMin: 0, today: schoolDay } };
  s.mode.stub = settingsStub(clock);
  // The other answers carry the same clock, as one server's would.
  s.mode.clock = () => ({ ...clock.clock });
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  assert.deepEqual(clock.posts, [{ tz: 'Asia/Riyadh', source: 'dashboard' }], 'the browser\'s zone, posted once');
  const post = s.api.find(e => e.method === 'POST');
  assert.equal(post.type, 'application/json');
  assert.equal(post.auth, 'Bearer ' + TOKEN);
  assert.equal(s.lastKpis().search.get('to'), schoolDay, 'the period ends on the school\'s today, not the UTC one');
  assert.equal(s.lastKpis().search.get('from'), dayBefore(schoolDay, 29));
  const line = () => page.locator('#clockText').textContent();
  assert.match(await line(), /school’s clock: \u2066Asia\/Riyadh\u2069 \(\u2066UTC\+3\u2069, now \u2066\d\d:\d\d\u2069\), from this browser/);
  // Change: the zones the PCs report, this browser's, then every zone; one click posts the owner's choice.
  await page.click('#clockChange');
  assert.match(await page.locator('#clockPanel .clock-choice[data-tz="Asia/Riyadh"]').textContent(), /Asia\/Riyadh.*12 PCs/);
  await page.selectOption('#clockPanelSelect', 'Europe/London');
  const n = s.kpis().length;
  await page.click('#clockPanel button:has-text("Use this clock")');
  await waitForKpis(s, n + 1);
  assert.deepEqual(clock.posts.at(-1), { tz: 'Europe/London' });
  assert.match(await line(), /Europe\/London.*UTC\b.*as you chose/);
  assert.equal(await page.locator('#clockPanel').count(), 0);
  assert.match(await page.locator('#clockLine').textContent(), /Moving past days to the new clock: 0 of 40 days done/);
  // A reload: the owner's choice stands, nothing is posted again.
  await page.reload();
  await waitForKpis(s, n + 2);
  assert.equal(clock.posts.length, 2);
  // Arabic: the same line, right to left.
  await page.click('#langBtn');
  assert.match(await line(), /ساعة المدرسة: \u2066Europe\/London\u2069/);
  await s.check();
});

test('a server without the clock: no line, UTC days, and a missing endpoint never signs out', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const settings = s.api.find(e => e.path === '/v1/admin/settings');
  if (settings && settings.status === 404) {
    assert.equal(await page.locator('#clockLine').isHidden(), true);
    assert.equal(s.lastKpis().search.get('to'), today());
  }
  assert.equal(await page.locator('#signin').isHidden(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dash:token')), TOKEN);
  await s.check();
});

// WCAG 2 contrast of every visible text run against the nearest opaque background behind it.
function lowContrast() {
  const parse = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const background = el => {
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; }
    return { r: 255, g: 255, b: 255 };
  };
  const low = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || el.closest('[hidden], .sr-only, noscript, .tip') || !el.getBoundingClientRect().width) continue;
    const cs = getComputedStyle(el), svg = el instanceof SVGElement;
    const fg = parse(svg ? cs.fill : cs.color), bg = background(svg ? el.closest('.card') || el : el);
    const a = lum(fg), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) low.add(`"${node.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
  }
  return [...low];
}

const ROUTES = ['overview', 'students', 'student/' + DEMO_STUDENTS[0], 'games', 'game/bubble-bop', 'habits', 'learning', 'pcs', 'data'];

test('text is readable in light and dark on every tab, the ramps\' cell labels included: 4.5 to 1 (3 to 1 for large text)', async t => {
  for (const colorScheme of ['light', 'dark']) {
    const s = await open(t, { colorScheme });
    const { page } = s;
    await page.goto(site.origin + '/');
    await page.locator('#signin').waitFor();
    const low = await page.evaluate(lowContrast);
    const steps = new Set();
    for (const route of ROUTES) {
      await page.goto(site.origin + '/?demo#/' + route);
      await waitForView(page, route.split('/')[0]);
      low.push(...(await page.evaluate(lowContrast)).map(x => route + ': ' + x));
      for (const q of await page.locator('.hm-cell').evaluateAll(cells => cells.map(c => /q\d/.exec(c.className)[0]))) steps.add(q);
    }
    assert.deepEqual([...steps].sort(), ['q0', 'q1', 'q2', 'q3', 'q4', 'q5'], 'every step of the ramp was on a page');
    assert.deepEqual(low, [], colorScheme);
    await s.check();
  }
});

test('every tab and route draws from the sample data, in English and Arabic, on a desktop and at 360 px', async t => {
  for (const [lang, width] of [['en', 1366], ['ar', 1366], ['en', 360], ['ar', 360]]) {
    const s = await open(t, { viewport: { width, height: 800 }, lang });
    const { page } = s;
    for (const route of ROUTES) {
      const tab = route.split('/')[0];
      await page.goto(site.origin + '/?demo#/' + route);
      await waitForView(page, tab);
      const where = `${lang} ${width}px #/${route}`;
      assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr', where);
      const parent = { student: 'students', game: 'games' }[tab] || tab;
      assert.equal(await page.locator('#tabs a[aria-current="page"]').getAttribute('data-tab'), parent, where);
      assert.equal(await page.locator('#view .note.empty, #view .empty-part').count(), 0, where + ': every part has its data');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${where}: ${overflow}px of sideways scroll`);
      // Every chart has its table twin, with rows.
      if (width === 1366 && lang === 'en') {
        const ids = await page.locator('#view .card .table-toggle').evaluateAll(bs => bs.map(b => b.closest('.card').id));
        assert.ok(ids.length > 0 || ['pcs', 'data', 'games'].includes(tab), where);
        for (const id of ids) {
          await page.click(`#${id} .table-toggle`);
          assert.ok(await page.locator(`#${id} .table-host tbody tr`).count() > 0, where + ' ' + id);
          await page.click(`#${id} .table-toggle`);
        }
      }
      // Number ranges ("4–5", "6–7") read low to high inside Arabic text.
      if (lang === 'ar') {
        const reversed = await page.evaluate(() => {
          const out = [], walker = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT);
          for (let node; (node = walker.nextNode());) {
            for (const m of node.textContent.matchAll(/(\d+)–(\d+)/g)) {
              const box = (i, n) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + n); return r.getBoundingClientRect(); };
              const a = box(m.index, m[1].length), b = box(m.index + m[1].length + 1, m[2].length);
              if (a.width && a.left > b.left) out.push(m[0]);
            }
          }
          return out;
        });
        assert.deepEqual(reversed, [], where + ': ranges drawn high to low');
      }
    }
    await s.check();
  }
});

test('each tab asks for its data only when it is opened; the tab and the period are remembered', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo');
  await waitForView(page, 'overview');
  assert.equal(new URL(page.url()).hash, '#/overview', 'the default route');
  for (const f of ['settings.json', 'live.json', 'kpis-30-all.json', 'stats-30.json', 'students-30.json']) assert.ok(s.files.includes(f), f);
  for (const f of ['pcs-30.json', 'cohorts-90.json']) assert.ok(!s.files.includes(f), f + ' is not asked for on the Overview');
  await page.click('#tabs a[data-tab="pcs"]');
  await waitForView(page, 'pcs');
  assert.equal(new URL(page.url()).hash, '#/pcs');
  assert.ok(s.files.includes('pcs-30.json'));
  assert.equal(await page.locator('#bandFilter').isHidden(), true, 'the PCs have no age');
  await page.click('#periodFilter button[data-value="7"]');
  await waitForView(page, 'pcs');
  // Back and forward follow the routes.
  await page.goBack();
  await waitForView(page, 'overview');
  await page.goForward();
  await waitForView(page, 'pcs');
  await page.goto(site.origin + '/?demo');
  await waitForView(page, 'pcs');
  assert.equal(new URL(page.url()).hash, '#/pcs', 'the remembered tab');
  assert.equal(await page.locator('#periodFilter button[data-value="7"]').getAttribute('aria-pressed'), 'true', 'the remembered period');
  // A route that is not one: the remembered tab instead.
  await page.goto(site.origin + '/?demo#/student/not-a-code');
  await waitForView(page, 'pcs');
  await s.check();
});

test('the keyboard reads the heatmap cell by cell and a column chart column by column, mirrored in Arabic', async t => {
  for (const lang of ['en', 'ar']) {
    const s = await open(t, { lang });
    const { page } = s;
    await page.goto(site.origin + '/?demo#/overview');
    await waitForView(page, 'overview');
    const start = page.locator('#when-card .hm-cell[tabindex="0"]');
    assert.equal(await start.count(), 1, 'one tab stop in the grid');
    await start.focus();
    const at = () => page.evaluate(() => { const c = document.activeElement; return [Number(c.dataset.row), Number(c.dataset.col)]; });
    const [r0, c0] = await at();
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await at(), [r0, lang === 'ar' ? Math.max(0, c0 - 1) : c0 + 1], lang + ': the right arrow moves right on the screen');
    await page.keyboard.press('ArrowDown');
    assert.equal((await at())[0], r0 + 1);
    assert.ok(await page.locator('.tip').isVisible());
    assert.match(await page.locator('.tip').textContent(), lang === 'ar' ? /دقيقة|دقائق|ساعة|ساعات/ : /minute|hour/);
    await page.keyboard.press('Escape');
    // The weeks: one column at a time, End for the latest.
    await page.locator('#weeks-card svg.cols').focus();
    await page.keyboard.press('End');
    const weeks = await page.locator('#weeks-card .table-host tbody tr th').allTextContents();
    assert.ok((await page.locator('.tip').textContent()).includes(weeks[0]), 'the latest week');
    await page.keyboard.press('Home');
    assert.ok((await page.locator('.tip').textContent()).includes(weeks.at(-1)), 'the first week');
    await s.check();
  }
});

test('a redraw while the keyboard reads a chart (a scrollbar that comes, a resized window) gives it back the same heatmap cell and column', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo#/overview');
  await waitForView(page, 'overview');
  // Waits until the charts are drawn again and the keyboard is on one of the new marks. The
  // dashboard is at most 1,192 pixels wide, so the window narrows below that.
  const redrawn = async width => {
    await page.evaluate(() => { document.activeElement.dataset.old = '1'; });
    await page.setViewportSize({ width, height: 768 });
    await page.waitForFunction(() => document.activeElement && document.activeElement.isConnected && !document.activeElement.dataset.old &&
      document.activeElement !== document.body);
  };
  await page.locator('#when-card .hm-cell[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const cell = () => page.evaluate(() => { const c = document.activeElement; return [c.className.split(' ')[0], c.dataset.row, c.dataset.col]; });
  const before = await cell();
  await redrawn(1000);
  assert.deepEqual(await cell(), before, 'the same cell');
  assert.equal(await page.locator('#when-card .hm-cell[tabindex="0"]').count(), 1, 'still one tab stop, on that cell');
  assert.equal(await page.locator('#when-card .hm-cell[tabindex="0"]').getAttribute('data-row'), before[1]);
  assert.ok(await page.locator('.tip').isVisible());
  // A column chart keeps its column: the first week, not the latest.
  const weeks = await page.locator('#weeks-card .table-host tbody tr th').allTextContents();
  await page.locator('#weeks-card svg.cols').focus();
  await page.keyboard.press('Home');
  assert.ok((await page.locator('.tip').textContent()).includes(weeks.at(-1)), 'the first week');
  await redrawn(900);
  assert.equal(await page.evaluate(() => document.activeElement.closest('.card').id), 'weeks-card');
  assert.ok((await page.locator('.tip').textContent()).includes(weeks.at(-1)), 'still the first week');
  await s.check();
});

test('the Students tab: the code search, sorting both ways, pages of 50, and a student\'s page', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo#/students');
  await waitForView(page, 'students');
  const all = demoFile('students-30.json').students;
  const rows = page.locator('#students-card tbody tr');
  assert.equal(await rows.count(), Math.min(50, all.length));
  assert.match(await page.locator('.pager-text').textContent(), new RegExp(`1–50 of ${all.length}`));
  await page.click('#students-card button:has-text("Next")');
  assert.equal(await rows.count(), Math.min(50, all.length - 50));
  // Sorting by play time: most first, then least first.
  await page.click('#students-card th button:has-text("Play time")');
  assert.equal(await page.locator('#students-card th[aria-sort]').getAttribute('aria-sort'), 'descending');
  const most = all.slice().sort((a, b) => b.minutes - a.minutes || (a.u < b.u ? -1 : 1))[0];
  assert.equal(await rows.first().getAttribute('data-u'), most.u, 'a new sort starts on the first page');
  await page.click('#students-card th button:has-text("Play time")');
  assert.equal(await page.locator('#students-card th[aria-sort]').getAttribute('aria-sort'), 'ascending');
  // The search keeps the keyboard in its box while the table follows.
  const one = all[5];
  await page.fill('#codeSearch', one.u.slice(0, 2));
  assert.match(await page.locator('#students-card').textContent(), /4 to 13 letters/);
  await page.locator('#codeSearch').fill('');
  await page.locator('#codeSearch').pressSequentially(one.u.slice(0, 6).toUpperCase().replace(/(.{4})/, '$1-'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'codeSearch');
  assert.ok((await rows.evaluateAll(r => r.map(x => x.dataset.u))).includes(one.u));
  assert.ok(await rows.count() >= 1 && await rows.count() < 5);
  await page.fill('#codeSearch', 'ffffff99');
  assert.match(await page.locator('#students-card').textContent(), /No student code starts with/);
  // A student's page from the table.
  await page.fill('#codeSearch', DEMO_STUDENTS[0]);
  await page.click(`#students-card tr[data-u="${DEMO_STUDENTS[0]}"] .student-link`);
  await waitForView(page, 'student');
  assert.equal(new URL(page.url()).hash, '#/student/' + DEMO_STUDENTS[0]);
  const one0 = demoFile('student-' + DEMO_STUDENTS[0] + '.json');
  assert.equal(await page.locator('#student-h').textContent(), 'Student ⁦' + one0.student.label + '⁩');
  assert.equal(await page.locator('#student-sessions tbody tr').count(), Math.min(20, one0.sessions.length));
  // A code that is not in the sample says so.
  s.allowed.push(/status of 404/);
  await page.goto(site.origin + '/?demo#/student/0123456789ab');
  await page.waitForFunction(() => /not in the sample data/.test(document.getElementById('view').textContent));
  await s.check();
});

test('a students answer in pages: every page is asked for with after= its next, and the tabs show them all', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  // The server's own answer, cut into pages of a third of its students the way the server
  // pages it (by code, next: the last code of a page with more after it).
  let whole = null;
  s.mode.stub = { '/v1/admin/students': async (method, body, search) => {
    const q = new URLSearchParams(search), after = q.get('after');
    q.delete('after');
    const res = await fetch(ingest + '/v1/admin/students?' + q, { headers: { Authorization: 'Bearer ' + TOKEN } });
    whole = await res.json();
    const size = Math.ceil(whole.students.length / 3), left = whole.students.filter(x => after == null || x.u > after);
    const students = left.slice(0, size);
    return [200, { ...whole, students, ...(left.length > size ? { next: students.at(-1).u } : {}) }];
  } };
  await page.goto(site.origin + '/#/students');
  await waitForView(page, 'students');
  assert.ok(whole && whole.students.length >= 6, 'the test server has students to page');
  const asked = s.api.filter(e => e.path === '/v1/admin/students' && e.search.get('from') === whole.range.from && e.search.get('to') === whole.range.to);
  assert.equal(asked.length, 3, 'three pages');
  assert.deepEqual(asked.map(e => e.search.get('after')), [null, asked[0].json.next, asked[1].json.next]);
  assert.equal(asked[2].json.next, undefined);
  assert.match(await page.locator('.pager-text').textContent(), new RegExp(`of ${whole.students.length}\\b`));
  // A student of the last page is there.
  const last = whole.students.at(-1);
  await page.fill('#codeSearch', last.u);
  assert.deepEqual(await page.locator('#students-card tbody tr').evaluateAll(r => r.map(x => x.dataset.u)), [last.u]);
  await s.check();
});
test('a student\'s "Getting better?": weeks from every round of the period, no sentence about a child doing worse, and the latest rounds said so', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  const ws = (await (await fetch(ingest + '/v1/admin/settings', { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).clock.weekStart;
  const day = n => dayBefore(today(), n);
  const round = (slug, attempt, code, d, more = {}) => ({ day: d, time: '10:00', slug, id: 'L1', code, ms: 30000, score: null, tier: null, dda: null,
    hits: 0, misses: 0, rtMean: null, attempt, minIntoSession: 1, ...more });
  // Connect 4: all 9 rounds; won 1 of 2 decided in the first third, 0 of 1 in the latest.
  const c4 = ['w', 'l', 'd', 'w', 'w', 'l', 'l', 'q', 'd'].map((code, i) => round('connect-four', i + 1, code, day(20 - i)));
  // Tank Splat: all 9 rounds, accuracy rising.
  const ts = Array.from({ length: 9 }, (_, i) => round('tank-splat', i + 1, 'w', day(20 - i), { hits: 2 + i, misses: 8 - i }));
  // Bubble Bop: 30 rounds over the period, the server listed the latest 9 (its rounds are the latest ones only).
  const bubble = Array.from({ length: 30 }, (_, i) => round('bubble-bop', i + 1, i % 3 ? 'w' : 'l', day(29 - i), { hits: 5, misses: 5 }));
  const listed = c4.concat(ts, bubble.slice(-9));
  const sums = (slug, list) => ({ slug, minutes: list.length, rounds: list.length, w: list.filter(x => x.code === 'w').length, l: list.filter(x => x.code === 'l').length,
    d: list.filter(x => x.code === 'd').length, e: 0, q: list.filter(x => x.code === 'q').length, hits: list.reduce((a, x) => a + x.hits, 0),
    misses: list.reduce((a, x) => a + x.misses, 0), rtMean: null, bestScore: null, avgScore: null, ddaMean: null, hearts: 0 });
  const weekly = [];
  for (const x of c4.concat(ts, bubble)) {
    const week = R.weekOf(x.day, ws);
    let w = weekly.find(y => y.week === week && y.slug === x.slug);
    if (!w) weekly.push(w = { week, slug: x.slug, rounds: 0, w: 0, l: 0, hits: 0, misses: 0, rtSum: 0, rtN: 0, scoreSum: 0, scoreN: 0, ddaSum: 0, ddaN: 0 });
    w.rounds++; w.w += +(x.code === 'w'); w.l += +(x.code === 'l'); w.hits += x.hits; w.misses += x.misses;
  }
  const u = 'abcdef012345';
  const answer = { v: 1, range: { from: day(29), to: day(0), days: 30, band: 'all' },
    student: { u, label: 'ABCD', kind: 'profile', band: '8-9', bandFirst: '8-9', firstDay: day(29), lastDay: day(0), profileMadeDay: day(29), knownBefore: false,
      removed: null, pcs: ['PC01'], linked: [] },
    days: Array.from({ length: 30 }, (_, i) => ({ day: day(29 - i), sessions: 1, minutes: 5, opens: 1, rounds: 1, w: 1, l: 0, q: 0 })),
    hours: Array(24).fill(0), games: [sums('bubble-bop', bubble), sums('connect-four', c4), sums('tank-splat', ts)], weekly,
    rounds: listed.slice().reverse(), sessions: [], persist: { same: 0, level: 0, game: 0, stop: 0 } };
  s.mode.stub = { '/v1/admin/student': () => [200, answer] };
  await page.goto(site.origin + '/#/student/' + u);
  await waitForView(page, 'student');
  const notes = await page.locator('#better-card .panel').evaluateAll(ps => ps.map(p => [p.querySelector('.panel-title').textContent,
    [...p.querySelectorAll(':scope > .note')].map(n => n.textContent).join(' ')]));
  assert.deepEqual(notes.map(n => n[0]), ['bubble-bop', 'connect-four', 'tank-splat'].map(nameOf('en')));
  assert.equal(notes[0][1], '', 'Bubble Bop: its first tries are not in the latest rounds');
  assert.equal(notes[1][1], '', 'no sentence says a child did worse');
  assert.match(notes[2][1], new RegExp('^' + nameOf('en')('tank-splat') + ': accuracy rose from \\d+% in the first tries to \\d+% in the latest\\. based on 3 tries$'));
  assert.equal(await page.locator('#better-card .panel-head .chip').count(), 0, 'the chip is the sentence\'s, not the panel\'s');
  // By week: every round of the period (the weekly sums), not only the listed ones.
  await page.click('#better-card .table-toggle');
  const rows = await page.locator('#better-card .table-host tbody tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(c => c.textContent)));
  assert.equal(rows.filter(r => r[0] === nameOf('en')('bubble-bop')).reduce((a, r) => a + Number(r[4]), 0), 30);
  // By attempt: the listed rounds, and the card says they are the latest.
  await page.click('#better-card button[data-value="attempt"]');
  assert.match(await page.locator('#better-card .card-foot').textContent(), /latest 27 rounds/);
  assert.match(await page.locator('#csvBtn').textContent(), /latest 27 rounds/);
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#csvBtn')]);
  assert.match(file.suggestedFilename(), /^student-abcd_latest27_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/);
  await s.check();
});

test('weekly charts: whole weeks only for a period of two weeks or more, and the last 13 weeks said so', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  const WEEKLY = { students: ['week-minutes', 'week-days'], overview: ['weeks-card'], habits: ['habits-weeks'] };
  // The remembered period, then each tab from a fresh load.
  const visit = async (period, check) => {
    await page.goto(site.origin + '/');
    await page.evaluate(p => localStorage.setItem('sg:dash:period', p), period);
    for (const [tab, ids] of Object.entries(WEEKLY)) {
      await page.goto(site.origin + '/#/' + tab);
      await page.reload();
      await waitForView(page, tab);
      for (const id of ids) await check(id);
    }
  };
  // Today, or 7 days: a student's weekly minutes are whole weeks, mostly outside the period.
  for (const period of ['1', '7']) {
    await visit(period, async id => {
      assert.match(await page.locator(`#${id} .chart-host`).textContent(), /Choose 30 or 90 days above to see the weeks/, period + ' ' + id);
      assert.equal(await page.locator(`#${id} svg`).count(), 0, period + ' ' + id);
    });
  }
  // 120 days: the students answer has 13 weeks per child, so these charts show the last 13.
  await visit('custom:' + dayBefore(today(), 119) + ':' + today(), async id => {
    assert.match(await page.locator(`#${id} .card-foot`).textContent(), /the last 13 weeks of the period/, id);
  });
  await visit('30', async id => {
    assert.doesNotMatch(await page.locator(`#${id}`).textContent(), /last 13 weeks|Choose 30/, id);
    assert.equal(await page.locator(`#${id} svg`).count(), 1, id);
  });
  await s.check();
});

test('the cohort legend tells a week at 0% from a week not reached yet', async t => {
  const s = await open(t);
  const { page } = s;
  for (const [route, id] of [['students', 'cohort-card'], ['habits', 'habits-cohorts']]) {
    await page.goto(site.origin + '/?demo#/' + route);
    await waitForView(page, route);
    const looks = page.locator(`#${id}`).evaluate(card => {
      const bg = el => el && getComputedStyle(el).backgroundColor + ' ' + getComputedStyle(el).boxShadow;
      const swatch = text => [...card.querySelectorAll('.hm-legend .hm-legend-text')].find(x => x.textContent === text)?.previousElementSibling;
      return { zeroCell: bg(card.querySelector('.hm-cell.q0:not(.is-none)')), noneCell: bg(card.querySelector('.hm-cell.is-none')),
        zeroSwatch: bg(swatch('0%')), noneSwatch: bg(swatch('Not reached yet')) };
    });
    const x = await looks;
    assert.ok(x.zeroCell && x.noneCell && x.zeroCell !== x.noneCell, route + ': the sample has both kinds of cell');
    assert.equal(x.noneSwatch, x.noneCell, route + ': "Not reached yet" looks like a week not reached yet');
    assert.equal(x.zeroSwatch, x.zeroCell, route + ': "0%" looks like a week at 0%');
  }
  await s.check();
});

test('a student\'s page: linking and forgetting ask twice before anything is sent; the CSV file', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  // Two students of the test server: the one with the most rounds, and another one.
  const list = (await (await fetch(ingest + '/v1/admin/students', { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).students
    .sort((a, b) => b.rounds - a.rounds || (a.u < b.u ? -1 : 1));
  const me = list[0].u, other = list.find(x => x.u !== me && !x.linked.length);
  const posts = [];
  s.mode.stub = {
    '/v1/admin/link': (method, body, search) => { posts.push({ method, body, u: search.get('u') }); return [200, method === 'DELETE' ? { ok: true } : { ok: true, ...body }]; },
    '/v1/admin/forget': (method, body) => { posts.push({ method, body }); return [200, { removed: { codes: 1, sessions: 9, visits: 20, rounds: 80, marks: 3 } }]; }
  };
  await page.goto(site.origin + '/#/student/' + me);
  await waitForView(page, 'student');
  const own = s.api.find(e => e.path === '/v1/admin/student');
  assert.equal(own.search.get('u'), me);
  assert.equal(own.search.get('to'), s.today());
  // After a loss: this child's losses next to the school's losses (not its losses and quits).
  const school = s.api.find(e => e.path === '/v1/admin/stats' && e.search.get('metrics') === 'persist').json;
  const lost = R.persist(R.statRows(school), { codes: ['l'] });
  assert.ok(lost.n > 0 && lost.n < R.persist(R.statRows(school)).n, 'the school has losses and quits');
  await page.click('#after-card .table-toggle');
  const after = await page.locator('#after-card .table-host tbody tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(c => c.textContent)));
  assert.deepEqual(after.map(r => r.at(-1)), [own.json.persist.same + own.json.persist.level + own.json.persist.game + own.json.persist.stop, lost.n]
    .map(n => n.toLocaleString('en-US')));
  assert.deepEqual(after[1].slice(1, 5), R.PERSIST.map(k => I.pct(lost.shares[k])));
  assert.doesNotMatch(await page.locator('#student-after .section-intro').textContent(), /left/);
  // Link: find the other code, pick it, confirm, confirm again.
  await page.click('#linkBtn');
  await page.locator('#linkSearch').pressSequentially(other.label);
  await page.click(`.link-pick[data-u="${other.u}"]`);
  assert.match(await page.locator('#actionPanel').textContent(), /will count as one child/);
  await page.click('#linkYes');
  assert.deepEqual(posts, [], 'nothing is sent before the second answer');
  assert.match(await page.locator('#actionPanel').textContent(), /really the same child/);
  await page.click('#linkSure');
  await page.waitForFunction(() => /Linked\./.test(document.getElementById('actionPanel').textContent));
  assert.deepEqual(posts, [{ method: 'POST', body: { u: other.u, to: me }, u: null }], 'the other code joins this student');
  const post = s.api.find(e => e.path === '/v1/admin/link');
  assert.equal(post.type, 'application/json');
  assert.equal(post.auth, 'Bearer ' + TOKEN);
  // Forget: two answers, then the server's count of what it removed.
  await page.click('#forgetBtn');
  assert.match(await page.locator('#actionPanel').textContent(), /School totals keep the play already counted/);
  await page.click('#forgetYes');
  assert.equal(posts.length, 1);
  await page.click('#forgetSure');
  await page.waitForFunction(() => /Deleted: 9 play sessions and 80 rounds/.test(document.getElementById('actionPanel').textContent));
  assert.deepEqual(posts[1], { method: 'POST', body: { u: me } });
  // This student's rounds as CSV: a byte-order mark, then the header.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#csvBtn')]);
  assert.match(download.suggestedFilename(), /^student-[0-9a-f]{4}_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/);
  const text = fs.readFileSync(await download.path(), 'utf8');
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.equal(text.slice(1).split('\r\n')[0], 'day,time,game,level,outcome,engaged_ms,score,tier,dda_level,hits,misses,rt_mean_ms,attempt,minutes_into_session');
  assert.equal(text.trim().split('\r\n').length, 1 + own.json.rounds.length);
  assert.ok(own.json.rounds.length > 0);
  await s.check();
});

test('the period: a custom range of at most 366 days, this school year, and children whose age is not set', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  let n = s.kpis().length;
  await page.click('#periodFilter button[data-value="year"]');
  await waitForKpis(s, n + 1);
  const y = Number(s.today().slice(0, 4)), aug = s.today() >= y + '-08-01' ? y + '-08-01' : (y - 1) + '-08-01';
  assert.equal(s.lastKpis().search.get('from'), aug, 'the school year starts on 1 August');
  assert.equal(s.lastKpis().search.get('to'), s.today());
  await page.click('#periodFilter button[data-value="custom"]');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'customFrom');
  await page.fill('#customFrom', dayBefore(s.today(), 400));
  await page.fill('#customTo', s.today());
  await page.click('#customRange button[type="submit"]');
  assert.match(await page.locator('#customRange .field-error').textContent(), /at most 366 days/);
  assert.equal(s.kpis().length, n + 1, 'nothing asked for a range the server refuses');
  await page.fill('#customFrom', dayBefore(s.today(), 9));
  await page.fill('#customTo', dayBefore(s.today(), 2));
  n = s.kpis().length;
  await page.click('#customRange button[type="submit"]');
  await waitForKpis(s, n + 1);
  assert.equal(s.lastKpis().search.get('from'), dayBefore(s.today(), 9));
  assert.equal(s.lastKpis().search.get('to'), dayBefore(s.today(), 2));
  assert.equal(await page.locator('#customRange').isHidden(), true);
  n = s.kpis().length;
  await page.click('#bandFilter button[data-value="unknown"]');
  await waitForKpis(s, n + 1);
  assert.equal(s.lastKpis().search.get('band'), 'unknown');
  await page.reload();
  await waitForKpis(s, n + 2);
  assert.equal(s.lastKpis().search.get('from'), dayBefore(s.today(), 9), 'the custom range is remembered');
  await s.check();
});

test('the Games tab: a card per game, a game\'s page, and the game picker', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/#/games');
  await waitForView(page, 'games');
  const k = s.lastKpis().json;
  assert.equal(await page.locator('.game-card').count(), k.games.filter(g => !g.suppressed).length);
  await page.click('.game-card[data-slug="bubble-bop"] a');
  await waitForView(page, 'game');
  assert.equal(new URL(page.url()).hash, '#/game/bubble-bop');
  const call = s.api.filter(e => e.path === '/v1/admin/game').at(-1);
  assert.equal(call.search.get('slug'), 'bubble-bop');
  assert.equal(await page.locator('#game-h').textContent(), nameOf('en')('bubble-bop'));
  for (const id of ['game-who', 'game-levels', 'game-difficulty', 'game-better', 'game-after', 'game-tired', 'game-flows', 'game-score', 'game-pcs']) {
    assert.equal(await page.locator('#' + id).count(), 1, id);
  }
  assert.match(await page.locator('#game-score').textContent(), /The score here is the stars of a finished level/);
  // How far children get: the children who played each level (the game answer's first-win
  // rows count each child once), never more than played the game.
  const who = Object.fromEntries(call.json.firstWin.map(f => [f.id, f.students]));
  const levels = k.levels.filter(l => l.slug === 'bubble-bop').sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  assert.ok(levels.length >= 2 && levels.every(l => who[l.id] != null));
  await page.click('#funnel-card .table-toggle');
  const funnel = await page.locator('#funnel-card .table-host tbody tr').evaluateAll(trs => trs.map(tr => [tr.children[0].textContent, tr.children[1].textContent]));
  assert.deepEqual(funnel, levels.map(l => [I.levelLabel(l.id, 'en'), who[l.id].toLocaleString('en-US')]));
  const players = k.games.find(g => g.slug === 'bubble-bop').students;
  assert.ok(levels.every(l => who[l.id] <= players), 'a level never has more children than the game');
  assert.match(await page.locator('#funnel-card .card-sub').textContent(), /Students who played each level/);
  // Only the measures this game reports are offered.
  const NAMES = { accuracy: 'Accuracy', reaction: 'Reaction time', winRate: 'Won (of finished)', score: 'Average score', timeToWin: 'Time to win' };
  const reported = R.measuresOf(R.pick(R.statRows(call.json.stats), 'attempt')).filter(m => NAMES[m]).map(m => NAMES[m]);
  assert.ok(reported.length >= 2, reported.join(', '));
  assert.deepEqual(await page.locator('#game-better .list-tools button').allTextContents(), reported);
  await page.selectOption('#gamePick', 'road-hopper');
  await waitForView(page, 'game');
  assert.equal(new URL(page.url()).hash, '#/game/road-hopper');
  assert.equal(await page.locator('#game-h').textContent(), nameOf('en')('road-hopper'));
  await s.check();
});

test('a game\'s levels in the sample: how each level\'s rounds end has its table, with every ending', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo#/game/dino-3d');
  await waitForView(page, 'game');
  const k = demoFile('kpis-30-all.json');
  const levels = k.levels.filter(l => l.slug === 'dino-3d').sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  await page.click('#level-outcomes .table-toggle');
  assert.deepEqual(await page.locator('#level-outcomes .table-host thead th').allTextContents(), ['Level', 'Won', 'Lost', 'Left unfinished', 'Other ending', 'Tries']);
  const rows = await page.locator('#level-outcomes .table-host tbody tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(c => c.textContent)));
  assert.deepEqual(rows, levels.map(l => {
    const c = l.codes, parts = [c.w, c.l, c.q, c.d + c.e], all = parts.reduce((a, b) => a + b, 0);
    return [I.levelLabel(l.id, 'en')].concat(parts.map(v => all ? I.pct(v / all) : '—'), [l.starts.toLocaleString('en-US')]);
  }));
  await s.check();
});

test('the Learning tab: one game or every measured game, and the paired same-child comparison', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo#/learning');
  await waitForView(page, 'learning');
  assert.match(await page.locator('#learning-intro').textContent(), /measured in 3 games so far/);
  assert.equal(await page.locator('#learning-growth .card').count(), 3, 'every measured game');
  assert.ok(await page.locator('#learning-growth .dumbbell .mark').count() >= 3);
  // A group of fewer than 5 children carries its chip at desktop width too, not only on a phone.
  const marks = await page.locator('#learning-growth .dumbbell .mark').evaluateAll(gs => gs.map(g => ({
    small: !!g.querySelector('.bar-label.is-small'), text: g.textContent })));
  assert.ok(marks.some(m => m.small), 'the sample has a small group');
  for (const m of marks) assert.equal(/based on \d+ child/.test(m.text), m.small, m.text);
  assert.match(await page.locator('#footNotes').textContent(), /Charts include play up to last night/);
  await page.selectOption('#gamePick', 'road-hopper');
  await page.waitForFunction(() => document.querySelectorAll('#learning-growth .card').length === 1 && !document.getElementById('dash').classList.contains('is-loading'));
  assert.match(await page.locator('#learning-growth').textContent(), /Road Hopper/);
  assert.equal(await page.locator('#learning-diff .diff-row[data-slug]').count(), 1, 'the difficulty of that game only');
  await s.check();
});

test('tries to a first win include the winning try; the hardest levels start with one nobody has won, never an endless mode', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo#/game/dino-3d');
  await waitForView(page, 'game');
  assert.equal(await page.locator('#first-win-title').textContent(), 'Tries to a first win');
  assert.match(await page.locator('#first-win .card-sub').textContent(), /the winning try included/);
  await page.goto(site.origin + '/?demo#/game/rail-rush');
  await waitForView(page, 'game');
  assert.equal(await page.locator('#first-win').count(), 0, 'an endless mode has no first win to wait for');
  await page.goto(site.origin + '/?demo#/learning');
  await waitForView(page, 'learning');
  await page.selectOption('#gamePick', 'dino-3d');
  await page.waitForFunction(() => document.querySelectorAll('#learning-growth .card').length === 1 && !document.getElementById('dash').classList.contains('is-loading'));
  assert.match(await page.locator('#learning-hardest .section-intro').textContent(), /tries to a first win/i);
  const never = demoFile('game-dino-3d.json').firstWin.filter(f => f.median == null);
  assert.deepEqual(never.map(f => f.id), ['L8'], 'the sample has a level nobody has won');
  await page.click('#hardest-card .table-toggle');
  const rows = await page.locator('#hardest-card .table-host tbody tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(c => c.textContent)));
  assert.deepEqual(rows[0].slice(1, 4), ['level 8', '1', '—'], 'never won: first, with no median');
  assert.equal(rows.length, demoFile('game-dino-3d.json').firstWin.length, 'every level of the game');
  // An endless mode is never won by design: it is no hard level.
  await page.selectOption('#gamePick', 'rail-rush');
  await page.waitForFunction(() => /Rail/.test(document.getElementById('learning-growth').textContent) && !document.getElementById('dash').classList.contains('is-loading'));
  assert.equal(await page.locator('#hardest-card .table-host tbody tr').count(), 0);
  await s.check();
});

// ---- the Data & settings tab ------------------------------------------------------------------
// The entries of a ZIP file as text: { name: text }, each checked against its CRC and size.
function unzip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let end = buffer.length - 22;
  while (view.getUint32(end, true) !== 0x06054b50) end--;
  const out = {};
  for (let i = 0, p = view.getUint32(end + 16, true); i < view.getUint16(end + 10, true); i++) {
    const method = view.getUint16(p + 10, true), crc = view.getUint32(p + 16, true), packed = view.getUint32(p + 20, true), size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true), at = view.getUint32(p + 42, true), name = buffer.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true), raw = buffer.subarray(start, start + packed);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    assert.equal(data.length, size, name);
    assert.equal(zlib.crc32(data), crc, name);
    out[name] = data.toString('utf8');
    p += 46 + nameLength;
  }
  return out;
}
const download = async (page, click) => {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(click)]);
  return { name: file.suggestedFilename(), files: unzip(fs.readFileSync(await file.path())) };
};
const BOM = '﻿';
const lines = text => text.split('\n').filter(Boolean).length;
// Every page of a research file, as the test server answers it: its lines.
async function serverLines(file, from, to) {
  let text = '', after = null;
  do {
    const res = await fetch(ingest + `/v1/admin/export?file=${file}&from=${from}&to=${to}` + (after ? '&after=' + encodeURIComponent(after) : ''),
      { headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal(res.status, 200);
    text += await res.text();
    after = res.headers.get('x-next');
  } while (after);
  return text;
}

test('the Data tab in the sample: the research files with the dictionary\'s headers, a byte-order mark and Arabic names', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(site.origin + '/?demo#/data');
  await waitForView(page, 'data');
  for (const id of ['research-files', 'dictionary', 'settings', 'meters', 'data-quality']) assert.equal(await page.locator('#' + id).count(), 1, id);
  assert.match(await page.locator('#exportCost').textContent(), /^About [\d,]+ rows: (about \d+%|less than 1%) of today’s free reading allowance\.$/);
  assert.match(await page.locator('#export-card').textContent(), /this morning’s play only/);
  // The dictionary: a file's columns, in the files' order.
  assert.deepEqual(await page.locator('#dictionary-card tbody th').allTextContents(), D.columns('students'));
  await page.focus('#dictFile');
  await page.selectOption('#dictFile', 'rounds');
  await page.waitForFunction(n => document.querySelectorAll('#dictionary-card tbody tr').length === n, D.columns('rounds').length);
  assert.equal(await page.locator('#dictFile').evaluate(el => el === document.activeElement), true, 'the picker keeps the keyboard');
  const today = demoFile('settings.json').clock.today;
  const { name, files } = await download(page, '#exportBtn');
  assert.equal(name, `school-games-data_${today}_${today}.zip`);
  assert.deepEqual(Object.keys(files), [...D.SERVER_FILES.map(f => f + '.csv'), 'games.csv', 'dictionary.csv', 'README.txt', 'labels.sps', 'load.R']);
  for (const f of D.SERVER_FILES) {
    const sample = fs.readFileSync(path.join(DEMO, `export-${f}.csv`), 'utf8');
    assert.equal(files[f + '.csv'], BOM + D.header(f) + '\n' + sample, f + ': the sample\'s lines under the dictionary\'s header');
  }
  for (const f of ['games.csv', 'dictionary.csv', 'README.txt', 'labels.sps']) assert.ok(files[f].startsWith(BOM), f);
  assert.ok(files['games.csv'].includes('road-hopper,عبور الطريق,Road Hopper,'), 'Arabic names in games.csv');
  assert.equal(lines(files['games.csv']), 1 + catalog.size);
  assert.match(files['README.txt'], /SAMPLE DATA/);
  assert.ok(files['README.txt'].includes('rounds.csv: ' + lines(fs.readFileSync(path.join(DEMO, 'export-rounds.csv'), 'utf8')) + ' rows'));
  assert.match(await page.locator('#exportResult').textContent(), /^Ready: .*school-games-data_.*\.zip.*\(\d+ KB\)/);
  assert.match(await page.locator('#exportSave').getAttribute('href'), /^blob:/);
  assert.deepEqual(s.files.filter(f => f.startsWith('export-')).sort(), D.SERVER_FILES.map(f => `export-${f}.csv`).sort());
  assert.deepEqual(s.api, [], 'the sample sends nothing');
  await s.check();
});

test('the Data tab: the cost first; the reading allowance stops part 1, and part 2 goes on from there', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  s.allowed.push(/status of 429/);
  let stops = 1;
  s.mode.stub = {
    '/v1/admin/export': async (method, body, search) => {
      if (search.get('file') === 'events' && !search.get('after') && stops-- > 0) return [429, { error: 'reads', until: '03:00' }];
      const res = await fetch(ingest + '/v1/admin/export?' + search, { headers: { Authorization: 'Bearer ' + TOKEN } });
      return { status: res.status, contentType: 'text/csv; charset=utf-8', headers: res.headers.get('x-next') ? { 'X-Next': res.headers.get('x-next') } : {}, body: await res.text() };
    }
  };
  await page.goto(site.origin + '/#/data');
  await waitForView(page, 'data');
  const k = s.lastKpis().json;
  const from = k.range.from, to = k.range.to;
  assert.match(await page.locator('#exportCost').textContent(), /^About [\d,]+ rows/);
  const one = await download(page, '#exportBtn');
  assert.equal(one.name, `school-games-data_${from}_${to}.zip`);
  assert.match(await page.locator('#exportResult').textContent(), /reading allowance is nearly used.*Part 1 is ready.*03:00.*part 2/);
  for (const f of ['students', 'sessions', 'visits', 'rounds']) {
    assert.equal(one.files[f + '.csv'], BOM + D.header(f) + '\n' + await serverLines(f, from, to), f + ': every row, once');
  }
  assert.equal(one.files['events.csv'], BOM + D.header('events') + '\n', 'events stopped before its first page');
  assert.equal(one.files['pcs.csv'], undefined, 'the files after the stop wait for part 2');
  assert.match(one.files['README.txt'], /stopped early, in events\.csv/);
  assert.match(one.files['README.txt'], /will be in the next part only/, 'play after part 1 comes in part 2');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('sg:dash:export')));
  assert.deepEqual([saved.part, saved.file, saved.after, saved.from, saved.to], [2, 'events', null, from, to]);
  // Tomorrow (here: a reload), part 2 starts where part 1 stopped.
  await page.reload();
  await waitForView(page, 'data');
  assert.match(await page.locator('#exportResume').textContent(), /stopped in .*events\.csv.*Part 2 goes on from there/);
  const two = await download(page, '#exportContinue');
  assert.equal(two.name, `school-games-data_${from}_${to}_part2.zip`);
  assert.deepEqual(Object.keys(two.files).filter(f => f.endsWith('.csv')), ['events.csv', 'student_days.csv', 'daily_games.csv', 'pcs.csv', 'games.csv', 'dictionary.csv']);
  for (const f of ['events', 'student_days', 'daily_games', 'pcs']) {
    assert.equal(two.files[f + '.csv'], BOM + D.header(f) + '\n' + await serverLines(f, from, to), f);
  }
  assert.match(two.files['README.txt'], /This is part 2 of the download/);
  assert.match(two.files['README.txt'], /The parts were made on different days/);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:dash:export')), null, 'done: nothing left to continue');
  assert.equal(await page.locator('#exportResume').count(), 0);
  await s.check();
});

test('the Data tab: one child found by the teacher page\'s code and forgotten after two answers; the settings say how they went', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  s.allowed.push(/status of 400/);
  const list = (await (await fetch(ingest + '/v1/admin/students', { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).students;
  const child = list.find(x => !x.linked.length), posts = [];
  const settings = async () => (await fetch(ingest + '/v1/admin/settings', { headers: { Authorization: 'Bearer ' + TOKEN } })).json();
  s.mode.stub = {
    '/v1/admin/forget': (method, body) => { posts.push({ path: 'forget', body }); return [200, { removed: { codes: 1, sessions: 4, visits: 9, rounds: 30, marks: 2 } }]; },
    '/v1/admin/rebuild': (method, body) => { posts.push({ path: 'rebuild', body }); return [200, { pending: 21 }]; },
    '/v1/admin/settings': async (method, body) => {
      if (method !== 'POST') return [200, await settings()];
      posts.push({ path: 'settings', body });
      if (body.keepDays === 760) return [400, { error: 'storage' }];
      const next = await settings();
      next.clock.weekStart = body.weekStart || next.clock.weekStart;
      next.clock.weekSource = 'owner';
      return [200, next];
    }
  };
  await page.goto(site.origin + '/#/data');
  await waitForView(page, 'data');
  // The code as the teacher page shows it, with one character wrong, then right.
  const shown = code => code.toUpperCase().match(/.{4}/g).join('-') + '-' + R.checkChar(code).toUpperCase();
  const wrong = shown(child.u).slice(0, -1) + (R.checkChar(child.u) === '0' ? '1' : '0');
  await page.fill('#childCode', wrong);
  await page.click('#setting-child button[type="submit"]');
  assert.match(await page.locator('#childResult').textContent(), /One character is wrong; check the code\./);
  await page.fill('#childCode', shown(child.u));
  await page.click('#setting-child button[type="submit"]');
  await page.locator('#childResult .student-link').waitFor();
  assert.equal(await page.locator('#childResult .student-link').getAttribute('href'), '#/student/' + child.u);
  assert.equal(s.api.filter(e => e.path === '/v1/admin/student').at(-1).search.get('u'), child.u);
  await page.click('#childForget');
  assert.match(await page.locator('#setting-child #actionPanel').textContent(), /School totals keep the play already counted/);
  await page.click('#forgetYes');
  assert.deepEqual(posts, [], 'nothing is sent before the second answer');
  await page.click('#forgetSure');
  await page.waitForFunction(() => /Deleted: 4 play sessions and 30 rounds/.test(document.getElementById('actionPanel').textContent));
  assert.deepEqual(posts, [{ path: 'forget', body: { u: child.u } }]);
  // A code the server does not hold, and the start of a code.
  await page.fill('#childCode', 'ffffffffffff');
  await page.click('#setting-child button[type="submit"]');
  await page.waitForFunction(() => /The server holds nothing under this code/.test(document.getElementById('childResult').textContent));
  await page.fill('#childCode', child.label);
  await page.click('#setting-child button[type="submit"]');
  await page.locator(`#childResult .student-link[href="#/student/${child.u}"], #childResult .link-pick[data-u="${child.u}"]`).first().waitFor();
  // The settings: two school years do not fit, Monday is saved, a recount asks twice.
  await page.click('#setting-keep button[data-value="760"]');
  await page.waitForFunction(() => /would not fit in the free 500 MB/.test(document.getElementById('note-keepDays').textContent));
  await page.click('#setting-week button[data-value="mon"]');
  await page.waitForFunction(() => document.getElementById('note-weekStart') && /Saved\./.test(document.getElementById('note-weekStart').textContent));
  assert.deepEqual(posts.filter(p => p.path === 'settings').map(p => p.body), [{ keepDays: 760 }, { weekStart: 'mon' }]);
  await page.click('#rebuildBtn');
  await page.click('#rebuildYes');
  await page.waitForFunction(() => /Started: 21 days to recount/.test(document.getElementById('setting-rebuild').textContent));
  assert.deepEqual(posts.at(-1), { path: 'rebuild', body: {} });
  await s.check();
});

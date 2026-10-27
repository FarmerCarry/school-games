// The insights dashboard (server/dashboard) in Chromium, under the Content Security
// Policy it is served with. The page's /v1/* requests are answered by the real Node
// server (server/app.mjs) on 127.0.0.1, filled by server/simulate.mjs; the catalog
// script of the live site is answered with this repository's js/catalog.js. Any other
// request, any CSP violation, page error or unexpected console error fails the test.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { hideSqliteWarning } from '../../server/warnings.mjs';

hideSqliteWarning();
const { createApp } = await import('../../server/app.mjs');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSP = "default-src 'self'; script-src 'self' https://farmercarry.github.io; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";
const CATALOG_URL = 'https://farmercarry.github.io/school-games/js/catalog.js';
const TOKEN = 'dashboard-test-token-0123456789';
const DAY_MS = 86400000;
const catalogSource = fs.readFileSync(path.join(repo, 'js/catalog.js'));
const demo = JSON.parse(fs.readFileSync(path.join(repo, 'server/dashboard/demo.json'), 'utf8'));
const insightsWindow = {};
vm.runInThisContext('(function (window) {' + fs.readFileSync(path.join(repo, 'server/dashboard/insights.js'), 'utf8') + '\n})')(insightsWindow);
const I = insightsWindow.SGInsights;
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
// 'unset' (no ADMIN_TOKEN: 404), 'down' (network error). catalog: false answers the
// site's catalog with 404, as the published fast build does (it inlines the catalog).
async function open(t, { viewport = { width: 1366, height: 768 }, locale = 'en-GB', colorScheme = 'light', token, lang, catalog = true } = {}) {
  const context = await browser.newContext({ viewport, locale, colorScheme, serviceWorkers: 'block' });
  t.after(() => context.close());
  const s = { context, mode: { api: 'server' }, api: [], outside: [], errors: [], allowed: [] };
  context.on('request', request => {
    const url = request.url();
    if (!url.startsWith(site.origin + '/') && url !== CATALOG_URL) s.outside.push(request.method() + ' ' + url);
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.href === CATALOG_URL) {
      return catalog ? route.fulfill({ status: 200, contentType: 'text/javascript', body: catalogSource })
        : route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' });
    }
    if (url.origin !== site.origin) return route.abort();
    if (url.pathname.startsWith('/v1/')) {
      if (s.mode.api === 'down') return route.abort('connectionrefused');
      const target = (s.mode.api === 'unset' ? unsetUrl : ingest) + url.pathname + url.search;
      const auth = request.headers().authorization;
      const res = await fetch(target, { headers: auth ? { Authorization: auth } : {} });
      let body = Buffer.from(await res.arrayBuffer());
      const entry = { path: url.pathname, search: url.searchParams, auth, status: res.status };
      if (res.status === 200) entry.json = JSON.parse(body.toString('utf8'));
      if (res.status === 200 && s.mode.edit && url.pathname === '/v1/admin/kpis') {
        entry.json = s.mode.edit(entry.json);
        body = Buffer.from(JSON.stringify(entry.json));
      }
      s.api.push(entry);
      const headers = Object.fromEntries(res.headers);
      delete headers['content-length'];
      return route.fulfill({ status: res.status, headers, body });
    }
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if ((headers['content-type'] || '').startsWith('text/html')) headers['content-security-policy'] = CSP;
    return route.fulfill({ response: res, headers });
  });
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
    if (!s.allowed.some(re => re.test(text))) s.errors.push(text);
  });
  s.page = page;
  s.check = async () => {
    assert.deepEqual(await page.evaluate(() => window.__csp), [], 'no Content Security Policy violation');
    assert.deepEqual(s.errors, [], 'no page or console errors');
    assert.deepEqual(s.outside, [], 'no request outside the dashboard and the catalog');
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
  await s.page.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 5 &&
    !document.getElementById('dash').classList.contains('is-loading'));
}

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
  assert.equal(call.search.get('to'), today());
  assert.equal(call.search.get('from'), dayBefore(today(), 29), 'the default period is 30 days');
  assert.equal(call.search.get('band'), null);
  const k = call.json, live = s.lastLive().json;
  // The headline tiles are the KPI JSON.
  assert.equal(Number(await tileValue(page, 'sessions')), k.totals.sessions);
  assert.equal(await tileText(page, 'sessions'), k.totals.sessions.toLocaleString('en-US'));
  assert.equal(Number(await tileValue(page, 'playTime')), k.totals.engagedMinutes);
  assert.equal(await tileText(page, 'playTime'), I.duration(k.totals.engagedMinutes, 'en').value);
  assert.equal(Number(await tileValue(page, 'perSession')), k.totals.avgEngagedMinutesPerSession);
  assert.equal(Number(await tileValue(page, 'opens')), k.totals.gameOpens);
  assert.equal(await tileText(page, 'opens'), k.totals.gameOpens.toLocaleString('en-US'));
  assert.ok(live.total.sessions >= 8);
  assert.equal(Number(await tileValue(page, 'now')), live.total.sessions);
  // The insights are insights.js on that JSON, with the catalog's names.
  const expected = I.insights(k, { lang: 'en', name: nameOf('en'), today: today() }).map(x => x.text);
  assert.ok(expected.length >= 1 && expected.length <= 5);
  assert.deepEqual(await page.locator('.insight').allTextContents(), expected);
  for (const id of ['daily', 'favourites', 'by-age', 'stuck', 'difficulty', 'returning', 'health']) {
    assert.equal(await page.locator('#' + id).count(), 1, id);
  }
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
  assert.equal(call.search.get('from'), dayBefore(today(), 6));
  assert.equal(call.search.get('to'), today());
  assert.equal(await tileValue(page, 'sessions'), String(call.json.totals.sessions));
  await page.click('#daily-sessions .table-toggle');
  assert.equal(await page.locator('#daily-sessions .table-host tbody tr').count(), 7, 'one row per day');
  assert.equal(await page.locator('#daily-sessions .chart-host').isHidden(), true);
  await page.click('#daily-sessions .table-toggle');
  assert.equal(await page.locator('#daily-sessions svg.chart').count(), 1);

  call = await pick('bandFilter', '8-9');
  assert.equal(call.search.get('band'), '8-9');
  assert.equal(call.json.range.band, '8-9');
  assert.equal(await tileValue(page, 'sessions'), String(call.json.totals.sessions));
  assert.match(await page.locator('#rangeText').textContent(), /8–9$/);
  assert.match(await page.locator('#by-age').textContent(), /Only children aged 8–9 are shown/, 'no second copy of the favourites');
  assert.deepEqual([...new Set(await page.locator('#difficulty .diff-cell[data-band]').evaluateAll(cells => cells.map(c => c.dataset.band)))], ['8-9']);
  const insights = await page.locator('.insight').allTextContents();
  assert.deepEqual(insights, I.insights(call.json, { lang: 'en', name: nameOf('en'), today: today() }).map(x => x.text));

  call = await pick('periodFilter', 1);
  assert.equal(call.search.get('from'), today());
  assert.match(await page.locator('#daily').textContent(), /Choose 7, 30 or 90 days/);
  call = await pick('bandFilter', 'all');
  assert.equal(call.search.get('band'), null);
  call = await pick('periodFilter', 90);
  assert.equal(call.search.get('from'), dayBefore(today(), 89));
  assert.equal(await page.locator('#by-age .panel').count(), call.json.bands.length);
  // Refresh with an unchanged answer: the page (its focus and scroll) stays as it is.
  const tile = await page.locator('.tile[data-key="sessions"]').elementHandle();
  const n = s.kpis().length;
  await page.click('#refreshBtn');
  await waitForKpis(s, n + 1);
  assert.equal(s.lastKpis().search.get('from'), dayBefore(today(), 89), 'the refresh asks for the same period');
  assert.equal(await tile.evaluate(node => node.isConnected), true, 'no rebuild for the same numbers');
  await s.check();
});

test('table views, tooltips and the privacy wording for hidden groups', async t => {
  const s = await open(t, { token: TOKEN });
  const { page } = s;
  await page.goto(site.origin + '/');
  await waitForKpis(s, 1);
  const k = s.lastKpis().json;
  const hidden = k.games.filter(g => g.suppressed);
  assert.ok(hidden.some(g => g.slug === 'zz-private'), 'the game two children opened is hidden by the server');
  const foot = await page.locator('#fav-card .card-foot').textContent();
  assert.match(foot, new RegExp((hidden.length === 1 ? '1 more game' : hidden.length + ' more games') + ': fewer than 3 children'));
  assert.ok(!(await page.locator('body').textContent()).includes('zz-private'), 'a hidden game is never named');
  // The favourites table: every shown game, then the hidden ones as one line.
  await page.click('#fav-card .table-toggle');
  const rows = page.locator('#fav-card .table-host tbody tr');
  assert.equal(await rows.count(), k.games.filter(g => !g.suppressed).length + 1);
  assert.match(await rows.last().textContent(), /fewer than 3 children — hidden for privacy/);
  const top = I.favourites(k).rows[0];
  assert.deepEqual(await rows.first().locator('th, td').allTextContents(),
    [nameOf('en')(top.slug), top.opens.toLocaleString('en-US'), I.pct(top.share), top.sessions.toLocaleString('en-US'), I.duration(top.engagedMinutes, 'en').text]);
  // Every chart card has its table twin.
  for (const id of ['daily-sessions', 'daily-minutes', 'age-card', 'stuck-card', 'diff-card', 'back-card', 'type-card']) {
    await page.click(`#${id} .table-toggle`);
    assert.ok(await page.locator(`#${id} .table-host table`).isVisible(), id);
    assert.ok(await page.locator(`#${id} .table-host tbody tr`).count() > 0, id);
  }
  // Tooltips: a bar on hover, the daily chart on keyboard focus.
  await page.click('#fav-card .table-toggle');
  await page.locator('#fav-card svg .mark').first().hover();
  await page.locator('.tip').waitFor();
  assert.match(await page.locator('.tip').textContent(), new RegExp(nameOf('en')(top.slug)));
  await page.click('#daily-sessions .table-toggle');
  await page.locator('#daily-sessions svg.chart').focus();
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
  assert.deepEqual(await page.locator('#age-card .table-host thead th').allTextContents(), ['Age group', 'Game', 'Share of opens', 'Games opened', 'Play time']);
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
  assert.deepEqual(await page.locator('.insight').allTextContents(), I.insights(k, { lang: 'ar', name: nameOf('ar'), today: today() }).map(x => x.text));
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
  await page.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 5 && document.querySelector('.tile[data-key="now"]').dataset.value);
  const k = demo.kpis['30|all'];
  assert.equal(Number(await tileValue(page, 'sessions')), k.totals.sessions);
  assert.equal(Number(await tileValue(page, 'opens')), k.totals.gameOpens);
  assert.equal(Number(await tileValue(page, 'now')), demo.live.total.sessions);
  assert.equal(await page.locator('#signOutBtn').isHidden(), true);
  await page.click('#bandFilter button[data-value="6-7"]');
  await page.waitForFunction(v => document.querySelector('.tile[data-key="sessions"]').dataset.value === v, String(demo.kpis['30|6-7'].totals.sessions));
  await page.click('#periodFilter button[data-value="90"]');
  await page.waitForFunction(v => document.querySelector('.tile[data-key="sessions"]').dataset.value === v, String(demo.kpis['90|6-7'].totals.sessions));
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
      for (const id of ['daily', 'favourites', 'by-age', 'stuck', 'difficulty', 'returning', 'health']) {
        assert.ok(await page.locator('#' + id).isVisible(), id);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${width}px ${lang}: ${overflow}px of sideways scroll`);
      await s.check();
    }
  }
});

test('game names come with the dashboard when the site does not publish its catalog', async t => {
  // The published fast build (tools/build.mjs) inlines js/catalog.js into its pages, so the
  // live site answers 404 for it: the names must not depend on that script.
  const s = await open(t, { token: TOKEN, catalog: false });
  const { page } = s;
  s.allowed.push(/status of 404/);
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

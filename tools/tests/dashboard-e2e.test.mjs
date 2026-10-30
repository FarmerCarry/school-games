// The dashboard end to end: the real Node host (server/app.mjs) serves the dashboard with
// its own Content Security Policy (server/dashboard/_headers) and answers every request
// from a database that server/simulate.mjs filled with version-3 play (and children
// playing now). Every tab and page renders in Chromium without a failure, a page or
// console error, a CSP violation or a request elsewhere, in English and Arabic, light and
// dark; and the research download holds every file, each server file with the pinned
// columns of server/export.mjs and exactly the rows the server pages out.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { hideSqliteWarning } from '../../server/warnings.mjs';
import { COLUMNS } from '../../server/export.mjs';

hideSqliteWarning();
const { createApp } = await import('../../server/app.mjs');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOKEN = 'dashboard-e2e-token-0123456789';
let browser, dir, app, origin, student, slug;

const get = async route => {
  const res = await fetch(origin + route, { headers: { Authorization: 'Bearer ' + TOKEN } });
  assert.equal(res.status, 200, route);
  return res;
};
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dashboard-e2e-'));
  const dbPath = path.join(dir, 'telemetry.db');
  const sim = spawnSync(process.execPath, [path.join(repo, 'server/simulate.mjs'), '--db', dbPath, '--days', '21', '--sessions', '40', '--seed', '9'], { encoding: 'utf8' });
  assert.equal(sim.status, 0, sim.stderr);
  app = createApp({ dbPath, adminToken: TOKEN });
  origin = 'http://127.0.0.1:' + (await app.listen(0, '127.0.0.1')).port;
  // Children playing right now, for "Playing now".
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, 'server/simulate.mjs'), '--url', origin, '--sessions', '6', '--seed', '4'], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('simulate.mjs exited with ' + code)));
  });
  const students = (await (await get('/v1/admin/students')).json()).students.sort((a, b) => b.rounds - a.rounds || (a.u < b.u ? -1 : 1));
  student = students[0].u;
  slug = (await (await get('/v1/admin/kpis')).json()).games.sort((a, b) => b.opens - a.opens || (a.slug < b.slug ? -1 : 1))[0].slug;
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await app?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// A signed-in page whose every problem is collected.
async function open(t, { lang = 'en', colorScheme = 'light', width = 1280 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, locale: lang === 'ar' ? 'ar' : 'en-GB', serviceWorkers: 'block', acceptDownloads: true });
  t.after(() => context.close());
  const s = { errors: [], outside: [] };
  context.on('request', request => { if (!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:')) s.outside.push(request.url()); });
  await context.addInitScript(({ token, lang }) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('sg:dash:token', token);
      localStorage.setItem('sg:dash:lang', lang);
    }
  }, { token: TOKEN, lang });
  const page = await context.newPage();
  page.on('pageerror', error => s.errors.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') s.errors.push(message.text()); });
  s.page = page;
  s.check = async where => {
    assert.deepEqual(await page.evaluate(() => window.__csp), [], where + ': no CSP violation');
    assert.deepEqual(s.errors, [], where + ': no page or console error');
    assert.deepEqual(s.outside, [], where + ': no request elsewhere');
  };
  return s;
}
const waitForView = (page, tab) => page.waitForFunction(t => document.querySelector('#view[data-route="' + t + '"] .section') &&
  !document.getElementById('dash').classList.contains('is-loading'), tab, { timeout: 30000 });

for (const [lang, colorScheme] of [['en', 'light'], ['en', 'dark'], ['ar', 'light'], ['ar', 'dark']]) {
  test(`every tab and page renders from the real server: ${lang}, ${colorScheme}`, async t => {
    const s = await open(t, { lang, colorScheme });
    const { page } = s;
    const routes = ['overview', 'students', 'student/' + student, 'games', 'game/' + slug, 'habits', 'learning', 'pcs', 'data'];
    for (const route of routes) {
      await page.goto(origin + '/#/' + route);
      await waitForView(page, route.split('/')[0]);
      assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await page.locator('#notice').isHidden(), true, route + ': ' + await page.locator('#notice').textContent());
      // A part of the page whose request failed says so in an .empty-part note.
      assert.deepEqual(await page.locator('#view .empty-part').allTextContents(), [], route + ': every request answered');
      assert.ok(await page.locator('#view svg, #view table, #view .game-card').count() > 0, route + ': charts, tables or game cards');
      const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
      assert.equal(scheme, colorScheme, route + ': the theme follows the system');
      // The children simulated as playing now are still in the 5-minute window for the first run.
      if (route === 'overview' && lang === 'en' && colorScheme === 'light') {
        await page.waitForFunction(() => Number(document.querySelector('.tile[data-key="now"]').dataset.value) > 0);
      }
      await s.check(route);
    }
  });
}

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
    out[name] = { text: data.toString('utf8'), method };
    p += 46 + nameLength;
  }
  return out;
}

test('the research download holds every file, each with its pinned columns and every row the server pages out', async t => {
  const s = await open(t);
  const { page } = s;
  await page.goto(origin + '/#/data');
  await waitForView(page, 'data');
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#exportBtn')]);
  const settings = await (await get('/v1/admin/settings')).json();
  const to = settings.clock.today, from = new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10);
  assert.equal(file.suggestedFilename(), `school-games-data_${from}_${to}.zip`);
  const files = unzip(fs.readFileSync(await file.path()));
  const server = Object.keys(COLUMNS);
  assert.deepEqual(Object.keys(files), [...server.map(f => f + '.csv'), 'games.csv', 'dictionary.csv', 'README.txt', 'labels.sps', 'load.R']);
  assert.ok(Object.values(files).some(f => f.method === 8), 'Chromium deflates the files');
  for (const name of server) {
    let lines = '', after = null;
    do {
      const res = await get(`/v1/admin/export?file=${name}&from=${from}&to=${to}` + (after ? '&after=' + encodeURIComponent(after) : ''));
      lines += await res.text();
      after = res.headers.get('x-next');
    } while (after);
    assert.ok(lines.length > 0, name + ': the simulated school has rows');
    assert.equal(files[name + '.csv'].text, '﻿' + COLUMNS[name].join(',') + '\n' + lines, name + ': the pinned header, then every row once');
  }
  const header = text => text.slice(1).split('\n')[0];
  assert.equal(header(files['games.csv'].text), 'game,name_ar,name_en,categories,players,input_style,has_levels,dda,reports_hits,reports_reaction,reports_score,score_meaning_en,score_meaning_ar,tutorial');
  assert.equal(header(files['dictionary.csv'].text), 'file,column,type,unit,values,meaning_en,meaning_ar,source,available_for');
  const dictionary = files['dictionary.csv'].text.slice(1).trim().split('\n').slice(1).map(line => line.split(',').slice(0, 2).join('.'));
  for (const name of server) for (const column of COLUMNS[name]) assert.ok(dictionary.includes(name + '.' + column), 'dictionary.csv explains ' + name + '.' + column);
  assert.match(files['README.txt'].text, /SCHOOL GAMES: RESEARCH FILES/);
  assert.match(files['README.txt'].text, /ألعاب الفسحة: ملفات البحث/);
  assert.ok(files['README.txt'].text.includes(settings.clock.tz));
  for (const name of server) assert.ok(files['labels.sps'].text.includes(`/FILE='${name}.csv'`) && files['load.R'].text.includes(`"${name}.csv"`), name);
  assert.match(await page.locator('#exportResult').textContent(), /^Ready: /);
  await s.check('data');
});

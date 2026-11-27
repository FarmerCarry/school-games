#!/usr/bin/env node
/*
 * Smoke-tests the whole site: static checks on every game folder and the root
 * pages and portal scripts (no modules, no network APIs, no external URLs), plus a
 * short headless gameplay scenario per game (start → real input → freeze → restart).
 *
 *   node tools/check-all.mjs            all games
 *   node tools/check-all.mjs rail-rush  just one
 *
 * Reuses one HTTP server and one Chromium browser with isolated BrowserContexts
 * per game (SG_CHECK_CONCURRENCY defaults to 3). Exits non-zero if anything fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { PLAYTEST_BROWSER_ARGS, runPlaytest } from './playtest.mjs';
import { svgDataUri } from './lib/svg-data-uri.mjs';
import { SENDER, networkUse, splitSender } from './lib/network-rules.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_CHECK_CONCURRENCY = 3;

export function parseConcurrency(value = process.env.SG_CHECK_CONCURRENCY, fallback = DEFAULT_CHECK_CONCURRENCY) {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error(`Invalid SG_CHECK_CONCURRENCY "${value}": expected a positive integer`);
  }
  return Number(text);
}

const CRASH_OR_HANG_PATTERN = /Target (?:page, context or browser has been )?closed|Browser has been closed|Page crashed|Target crashed|Playtest timed out/i;
const CONCURRENT_TIMEOUT_PATTERN = /Timeout|timed out|navigation/i;

export function shouldRetryPlaytest(report, { concurrency = 1, browserConnected = true } = {}) {
  if (!report || report.ok) return false;
  // Never hide real page/console/network errors behind a retry.
  const hasAppErrors =
    (report.pageErrors?.length || 0) > 0 ||
    (report.consoleErrors?.length || 0) > 0 ||
    (report.externalRequests?.length || 0) > 0 ||
    (report.failedRequests?.length || 0) > 0 ||
    (report.notes?.length || 0) > 0;
  if (hasAppErrors) return false;
  if (!browserConnected) return true;
  const harnessErrors = report.harnessErrors || [];
  if (!harnessErrors.length) return false;
  if (harnessErrors.some(msg => CRASH_OR_HANG_PATTERN.test(msg))) return true;
  return concurrency > 1 && harnessErrors.some(msg => CONCURRENT_TIMEOUT_PATTERN.test(msg));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

async function main() {
  // SG_ROOT=_site tests the fast build made by tools/build.mjs instead of the source files.
  const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
  const concurrency = parseConcurrency();
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js/catalog.js'), 'utf8'), sandbox);
  const games = sandbox.window.GAMES;
  const only = process.argv.slice(2);

  if (!Array.isArray(games) || !games.length) {
    console.error('No games were found in the catalog.');
    process.exit(1);
  }
  const unknown = only.filter(slug => !games.some(g => g.slug === slug));
  if (unknown.length) {
    console.error('Unknown game selection: ' + unknown.join(', '));
    process.exit(1);
  }
  const selected = only.length ? games.filter(g => only.includes(g.slug)) : games;

  const artifactDir = process.env.SG_ARTIFACT_DIR
    ? path.resolve(process.env.SG_ARTIFACT_DIR)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-check-'));
  fs.mkdirSync(artifactDir, { recursive: true });
  const problems = [];
  const add = (slug, msg) => {
    const problem = `${slug}: ${msg}`;
    problems.push(problem);
    // Print immediately so interrupted CI runs retain each game's diagnostics.
    console.error(problem);
  };

  // Release thumbnails are embedded in the portal. Check every entry against its
  // editable source, so omitting the unused separate copies cannot hide missing or
  // stale artwork. Source/ZIP checks continue to validate the separate SVG files.
  const built = ROOT !== REPO && !fs.existsSync(path.join(ROOT, 'js/catalog.js'));
  let embeddedThumbs;
  if (built) {
    try {
      const portal = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const table = portal.match(/window\.SG_THUMBS=(\{[^\r\n]*\});/);
      if (!table) throw new Error('missing embedded thumbnail table');
      embeddedThumbs = JSON.parse(table[1]);
      for (const g of games) {
        const source = path.join(REPO, 'games', g.slug, 'thumb.svg');
        if (!Object.hasOwn(embeddedThumbs, g.slug)) add(g.slug, 'missing embedded thumbnail');
        else if (!fs.existsSync(source) || embeddedThumbs[g.slug] !== svgDataUri(fs.readFileSync(source, 'utf8'))) {
          add(g.slug, 'embedded thumbnail does not match its source');
        }
      }
      for (const slug of Object.keys(embeddedThumbs)) if (!games.some(g => g.slug === slug)) add(slug, 'embedded thumbnail has no catalog entry');
    } catch (error) { add('portal', 'invalid embedded thumbnails: ' + error.message); }
  }

  // Nothing on the site goes over the network except the portal's anonymous play statistics
  // sender, js/telemetry.js (tools/lib/network-rules.mjs), so the same static checks cover
  // games, the shared scripts, the root pages and the portal scripts. The fast build inlines
  // the sender into the portal: only an exact copy of js/telemetry.js, inlined as
  // tools/build.mjs does it, is checked as the sender.
  let senderCopies;
  function inlinedSender() {
    if (senderCopies) return senderCopies;
    const source = fs.readFileSync(path.join(REPO, SENDER), 'utf8');
    senderCopies = [source];
    try {
      // The same options as jsFor() in tools/build.mjs.
      senderCopies.unshift(createRequire(import.meta.url)('esbuild').transformSync(source,
        { loader: 'js', minify: true, target: 'chrome100', legalComments: 'none', charset: 'utf8' }).code);
    } catch { /* without esbuild only a --no-minify build matches */ }
    return senderCopies = senderCopies.map(code => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--'));
  }
  function staticChecks(label, file) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const site = rel.split(path.sep).join('/');
    if (/type\s*=\s*["']module["']/.test(src)) add(label, `${rel}: uses ES modules`);
    if (/^\s*import\s[\w{*]/m.test(src)) add(label, `${rel}: import statement`);
    const { rest, sender } = built && site === 'index.html' ? splitSender(src, inlinedSender()) : { rest: src, sender: '' };
    const network = [...networkUse(site, rest), ...networkUse(SENDER, sender)];
    if (network.length) add(label, `${rel}: network API (${network[0]})`);
    const urls = src.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/g);
    if (urls) add(label, `${rel}: external URL ${urls[0]}`);
  }
  const rootFiles = fs.readdirSync(ROOT).filter(name => name.endsWith('.html')).map(name => path.join(ROOT, name));
  for (const dir of ['js', 'shared']) {
    if (fs.existsSync(path.join(ROOT, dir))) {
      rootFiles.push(...fs.readdirSync(path.join(ROOT, dir)).filter(name => name.endsWith('.js')).map(name => path.join(ROOT, dir, name)));
    }
  }
  for (const file of rootFiles) staticChecks(path.basename(file), file);

  // Catalog <-> folders
  const folders = fs.readdirSync(path.join(ROOT, 'games')).filter(f => fs.statSync(path.join(ROOT, 'games', f)).isDirectory());
  for (const f of folders) if (!games.find(g => g.slug === f)) add(f, 'folder has no catalog entry');

  const playtestQueue = [];
  for (const g of selected) {
    const dir = path.join(ROOT, 'games', g.slug);
    if (!fs.existsSync(path.join(dir, 'index.html'))) { add(g.slug, 'missing index.html'); continue; }
    const thumb = path.join(built ? REPO : ROOT, 'games', g.slug, 'thumb.svg');
    if (!fs.existsSync(thumb)) add(g.slug, 'missing thumb.svg');
    else {
      const svg = fs.readFileSync(thumb, 'utf8');
      if (svg.length > 30000) add(g.slug, `thumb.svg is ${svg.length} bytes`);
      if (!/viewBox="0 0 400 400"/.test(svg)) add(g.slug, 'thumb.svg viewBox is not 0 0 400 400');
      if (/<image|href="http/.test(svg)) add(g.slug, 'thumb.svg references external/bitmap content');
    }
    for (const file of walk(dir)) if (/\.(html|js|css)$/.test(file)) staticChecks(g.slug, file);
    playtestQueue.push(g);
  }

  function recordReport(slug, out, r) {
    const previousProblems = problems.length;
    for (const e of r.pageErrors) add(slug, 'page error: ' + e.split('\n')[0]);
    for (const e of r.consoleErrors) add(slug, 'console error: ' + e);
    for (const e of r.externalRequests) add(slug, 'external request: ' + e);
    for (const e of r.failedRequests) add(slug, 'failed request: ' + e);
    for (const e of r.harnessErrors || []) add(slug, 'harness error: ' + e.split('\n')[0]);
    for (const n of r.notes) add(slug, n);
    if (!r.ok && problems.length === previousProblems) add(slug, 'playtest failed');
    console.log(`${r.ok ? '✓' : '✗'} ${slug}  (screens in ${out})`);
  }

  if (playtestQueue.length) {
    const server = await startTestServer(ROOT);
    let browser = null;
    let relaunching = null;
    async function getBrowser() {
      if (browser && browser.isConnected()) return browser;
      if (!relaunching) {
        relaunching = (async () => {
          const prev = browser;
          browser = null;
          await prev?.close().catch(() => {});
          browser = await launchChromium({ args: PLAYTEST_BROWSER_ARGS });
          return browser;
        })().finally(() => { relaunching = null; });
      }
      return relaunching;
    }

    const actionsFor = slug => [
      { wait: 350 }, { shot: 'title' }, { scenario: slug }, { shot: 'play' },
      { resize: [1100, 620] }, { wait: 100 }, { resize: [1920, 1080] }, { shot: 'big' }
    ];

    try {
      await getBrowser();
      const effectiveConcurrency = Math.min(concurrency, playtestQueue.length);
      let nextIndex = 0;
      const retries = [];

      async function worker() {
        while (true) {
          const i = nextIndex++;
          if (i >= playtestQueue.length) return;
          const g = playtestQueue[i];
          const out = path.join(artifactDir, g.slug);
          let report;
          try {
            const activeBrowser = await getBrowser();
            report = await runPlaytest({
              browser: activeBrowser,
              origin: server.origin,
              slug: g.slug,
              outDir: out,
              actions: actionsFor(g.slug)
            });
          } catch (error) {
            report = {
              ok: false, pageErrors: [], consoleErrors: [], externalRequests: [],
              failedRequests: [], notes: [], harnessErrors: [String(error)]
            };
          }
          if (shouldRetryPlaytest(report, { concurrency: effectiveConcurrency, browserConnected: !!browser?.isConnected() })) {
            retries.push(g);
          } else {
            recordReport(g.slug, out, report);
          }
        }
      }

      await Promise.all(Array.from({ length: effectiveConcurrency }, () => worker()));

      // Retry any transient browser crashes or concurrent SwiftShader timeouts serially
      // with zero competing contexts so real failures still surface cleanly.
      for (const g of retries) {
        const out = path.join(artifactDir, g.slug);
        console.log(`↻ ${g.slug}  (retrying isolated after crash/hang)`);
        let report;
        try {
          const activeBrowser = await getBrowser();
          report = await runPlaytest({
            browser: activeBrowser,
            origin: server.origin,
            slug: g.slug,
            outDir: out,
            actions: actionsFor(g.slug)
          });
        } catch (error) {
          report = {
            ok: false, pageErrors: [], consoleErrors: [], externalRequests: [],
            failedRequests: [], notes: [], harnessErrors: [String(error)]
          };
        }
        recordReport(g.slug, out, report);
      }
    } finally {
      if (browser) await browser.close().catch(() => {});
      await server.close();
    }
  }

  fs.writeFileSync(path.join(artifactDir, 'summary.json'), JSON.stringify({ games: selected.map(g => g.slug), problems, ok: !problems.length }, null, 2) + '\n');

  if (problems.length) {
    console.log('\nProblems:\n' + problems.map(p => ' - ' + p).join('\n'));
    process.exit(1);
  }
  console.log('\nAll good ✨');
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) await main();

#!/usr/bin/env node
/*
 * Smoke-tests the whole site: static checks on every game folder plus a short
 * headless play session per game (load → click → mash common keys → pause).
 *
 *   node tools/check-all.mjs            all games
 *   node tools/check-all.mjs rail-rush  just one
 *
 * Exits non-zero if anything fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { svgDataUri } from './lib/svg-data-uri.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// SG_ROOT=_site tests the fast build made by tools/build.mjs instead of the source files.
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
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

const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-check-'));
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

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

// Catalog <-> folders
const folders = fs.readdirSync(path.join(ROOT, 'games')).filter(f => fs.statSync(path.join(ROOT, 'games', f)).isDirectory());
for (const f of folders) if (!games.find(g => g.slug === f)) add(f, 'folder has no catalog entry');

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
  for (const file of walk(dir)) {
    if (!/\.(html|js|css)$/.test(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    if (/type\s*=\s*["']module["']/.test(src)) add(g.slug, `${rel}: uses ES modules`);
    if (/^\s*import\s[\w{*]/m.test(src)) add(g.slug, `${rel}: import statement`);
    if (/\bfetch\s*\(|XMLHttpRequest/.test(src)) add(g.slug, `${rel}: fetch/XHR`);
    const urls = src.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/g);
    if (urls) add(g.slug, `${rel}: external URL ${urls[0]}`);
  }

  const actions = [
    { wait: 1500 }, { shot: 'title' },
    { click: [640, 360] }, { press: 'Enter' }, { press: 'Space' }, { wait: 600 },
    { hold: 'ArrowRight', ms: 400 }, { press: 'ArrowUp' }, { hold: 'KeyD', ms: 300 }, { press: 'KeyW' },
    { move: [500, 300] }, { drag: [[600, 500], [640, 300]] }, { wait: 1500 }, { shot: 'play' },
    { press: 'KeyP' }, { wait: 300 }, { press: 'KeyP' }, { press: 'Escape' }, { wait: 300 }, { press: 'Escape' },
    { resize: [1100, 620] }, { wait: 500 }, { resize: [1920, 1080] }, { wait: 800 }, { shot: 'big' },
    { reload: true }, { wait: 1200 }
  ];
  const out = path.join(artifactDir, g.slug);
  const previousProblems = problems.length;
  const child = spawnSync(process.execPath, [path.join(REPO, 'tools/playtest.mjs'), g.slug, '--out', out, '--actions-json', JSON.stringify(actions)],
    { encoding: 'utf8', timeout: 120000 });
  try {
    // A failed playtest still writes its report. Keep its useful diagnostics
    // rather than replacing them with a generic subprocess exception.
    const r = JSON.parse(child.stdout);
    for (const e of r.pageErrors) add(g.slug, 'page error: ' + e.split('\n')[0]);
    for (const e of r.consoleErrors) add(g.slug, 'console error: ' + e);
    for (const e of r.externalRequests) add(g.slug, 'external request: ' + e);
    for (const e of r.failedRequests) add(g.slug, 'failed request: ' + e);
    for (const e of r.harnessErrors || []) add(g.slug, 'harness error: ' + e.split('\n')[0]);
    for (const n of r.notes) add(g.slug, n);
    if ((!r.ok || child.status !== 0) && problems.length === previousProblems) add(g.slug, 'playtest failed');
    console.log(`${r.ok ? '✓' : '✗'} ${g.slug}  (screens in ${out})`);
  } catch (e) {
    const reason = child.error?.message || child.stderr?.trim() || String(e.message);
    add(g.slug, 'harness crashed: ' + reason.split('\n')[0]);
  }
}

if (problems.length) {
  console.log('\nProblems:\n' + problems.map(p => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('\nAll good ✨');

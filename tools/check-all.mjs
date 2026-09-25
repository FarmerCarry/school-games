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
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/catalog.js'), 'utf8'), sandbox);
const games = sandbox.window.GAMES;
const only = process.argv[2];

const problems = [];
const add = (slug, msg) => problems.push(`${slug}: ${msg}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

// Catalog <-> folders
const folders = fs.readdirSync(path.join(ROOT, 'games')).filter(f => fs.statSync(path.join(ROOT, 'games', f)).isDirectory());
for (const f of folders) if (!games.find(g => g.slug === f)) add(f, 'folder has no catalog entry');

for (const g of games) {
  if (only && g.slug !== only) continue;
  const dir = path.join(ROOT, 'games', g.slug);
  if (!fs.existsSync(path.join(dir, 'index.html'))) { add(g.slug, 'missing index.html'); continue; }
  const thumb = path.join(dir, 'thumb.svg');
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
  const out = `/tmp/check-all/${g.slug}`;
  try {
    const raw = execFileSync('node', [path.join(ROOT, 'tools/playtest.mjs'), g.slug, '--out', out, '--actions-json', JSON.stringify(actions)],
      { encoding: 'utf8', timeout: 120000 });
    const r = JSON.parse(raw);
    for (const e of r.pageErrors) add(g.slug, 'page error: ' + e.split('\n')[0]);
    for (const e of r.consoleErrors) add(g.slug, 'console error: ' + e);
    for (const e of r.externalRequests) add(g.slug, 'external request: ' + e);
    for (const e of r.failedRequests) if (!e.includes('favicon')) add(g.slug, 'failed request: ' + e);
    for (const n of r.notes) add(g.slug, n);
    console.log(`${r.ok ? '✓' : '✗'} ${g.slug}  (screens in ${out})`);
  } catch (e) {
    add(g.slug, 'harness crashed: ' + String(e.message).split('\n')[0]);
  }
}

if (problems.length) {
  console.log('\nProblems:\n' + problems.map(p => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('\nAll good ✨');

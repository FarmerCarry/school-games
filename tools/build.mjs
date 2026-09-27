#!/usr/bin/env node
/*
 * Builds the FAST version of the site into _site/ (published to the gh-pages branch by
 * .github/workflows/build.yml on every push to main). The source files are unchanged and
 * still run as-is (locally, from a ZIP, or from main).
 *
 *   node tools/build.mjs [--out _site] [--no-minify] [--kill-sw]
 *
 * Why: the school PCs have slow hard disks. Every file is a separate disk read (and, after
 * GitHub's 10-minute cache expires, a separate check with the server), so the build cuts
 * the number of files a page needs:
 *   - each game becomes ONE html file: its CSS/JS plus shared/kit.js and shared/game.css are
 *     minified and inlined. Fonts and three.js stay shared files (cached once for all games).
 *   - the portal becomes one html file with its CSS, JS, the catalog and all thumbnails inlined.
 *   - sw.js: an offline cache. After the first visit the whole site is stored on the PC, pages
 *     open without asking the server, and it still works if the internet drops. Each build
 *     changes sw.js, so PCs download only the files that changed.
 *   - --kill-sw writes a sw.js that removes itself and its cache (emergency switch).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const OUT = path.resolve(ROOT, opt('--out', '_site'));
const MINIFY = !args.includes('--no-minify');
const KILL_SW = args.includes('--kill-sw');
const esbuild = MINIFY ? require('esbuild') : null;

const posix = p => p.split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8');
const hash = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const isLocal = u => !/^(?:[a-z]+:|\/\/|#|\/)/i.test(u);

if (path.relative(ROOT, OUT).startsWith('..') || OUT === ROOT) throw new Error('refusing to write outside the repo: ' + OUT);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function write(rel, data) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
function copy(rel) { write(rel, fs.readFileSync(path.join(ROOT, rel))); }

/* ------------------------------------------------------------- minify */
const jsCache = new Map();
function jsFor(file) {
  if (jsCache.has(file)) return jsCache.get(file);
  let code = read(file);
  if (MINIFY) {
    // Plain scripts: esbuild keeps top-level names (games share globals between files)
    // and only shortens local names.
    code = esbuild.transformSync(code, { loader: 'js', minify: true, target: 'chrome100', legalComments: 'none', charset: 'utf8' }).code;
  }
  // Keep the inline <script> from being closed or confused by the HTML parser.
  code = code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  jsCache.set(file, code);
  return code;
}
function cssFor(file, htmlDir) {
  let css = read(file);
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    if (!isLocal(u)) return m;
    const abs = path.resolve(path.dirname(file), u);
    return 'url(' + q + posix(path.relative(htmlDir, abs)) + q + ')';
  });
  if (MINIFY) css = esbuild.transformSync(css, { loader: 'css', minify: true, target: 'chrome100', charset: 'utf8' }).code.trim();
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

/* Inline every local stylesheet and script of an html page (except three.js). */
function inlinePage(htmlFile, extra) {
  const dir = path.dirname(htmlFile);
  let html = read(htmlFile);
  html = html.replace(/<link\b[^>]*>/gi, tag => {
    if (!/\brel="stylesheet"/i.test(tag)) return tag;
    const href = (tag.match(/\bhref="([^"]+)"/i) || [])[1];
    if (!href || !isLocal(href)) return tag;
    return '<style>' + cssFor(path.resolve(dir, href), dir) + '</style>';
  });
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs) => {
    const src = (attrs.match(/\bsrc="([^"]+)"/i) || [])[1];
    if (!src || !isLocal(src) || /(^|\/)lib\/three\//.test(src)) return tag;
    if (attrs.replace(/\bsrc="[^"]+"/i, '').trim()) throw new Error(`${htmlFile}: unsupported script attributes: ${tag}`);
    let code = jsFor(path.resolve(dir, src));
    if (extra && extra.before && extra.before[src]) code = extra.before[src] + '\n' + code;
    return '<script>' + code + '</script>';
  });
  const left = html.match(/<script\b[^>]*\bsrc="(?!(?:\.\.\/)*lib\/three\/)[^"]+"/gi);
  if (left) throw new Error(`${htmlFile}: scripts left un-inlined: ${left.join(', ')}`);
  return html;
}

/* --------------------------------------------------------------- games */
const cat = { window: {} };
vm.runInNewContext(read(path.join(ROOT, 'js/catalog.js')), cat);
const catalogSlugs = cat.window.GAMES.map(g => g.slug);
const gameDirs = fs.readdirSync(path.join(ROOT, 'games')).filter(d => fs.existsSync(path.join(ROOT, 'games', d, 'index.html')));
const report = [];
for (const slug of gameDirs) {
  const html = inlinePage(path.join(ROOT, 'games', slug, 'index.html'));
  write(`games/${slug}/index.html`, html);
  if (fs.existsSync(path.join(ROOT, 'games', slug, 'thumb.svg'))) copy(`games/${slug}/thumb.svg`);
  report.push([`games/${slug}/index.html`, Buffer.byteLength(html)]);
}
const missing = catalogSlugs.filter(s => !gameDirs.includes(s));
if (missing.length) console.warn('warning: catalog games without a folder:', missing.join(', '));

/* -------------------------------------------------------------- portal */
function svgDataUri(svg) {
  const min = svg.replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  // Minimal percent-encoding: safe inside an HTML attribute, still compresses well.
  return 'data:image/svg+xml,' + min.replace(/[%#"&<>]|[^\x00-\x7F]/gu, c => encodeURIComponent(c));
}
const thumbs = {};
for (const slug of gameDirs) {
  const f = path.join(ROOT, 'games', slug, 'thumb.svg');
  if (fs.existsSync(f)) thumbs[slug] = svgDataUri(read(f));
}
const REGISTER_SW = `<script>if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))addEventListener('load',function(){navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(function(){})});</script>`;
let portal = inlinePage(path.join(ROOT, 'index.html'), {
  before: { 'js/site.js': 'window.SG_THUMBS=' + JSON.stringify(thumbs).replace(/<\//g, '<\\/') + ';' }
});
portal = portal.replace('</body>', REGISTER_SW + '\n</body>');
write('index.html', portal);
report.unshift(['index.html', Buffer.byteLength(portal)]);

/* --------------------------------------------------------- static files */
const statics = ['favicon.svg', 'manifest.webmanifest', 'lib/three/three.min.js', 'lib/three/LICENSE'];
for (const f of fs.readdirSync(path.join(ROOT, 'shared/fonts'))) statics.push('shared/fonts/' + f);
if (fs.existsSync(path.join(ROOT, 'icons'))) for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) statics.push('icons/' + f);
for (const f of statics) if (fs.existsSync(path.join(ROOT, f))) copy(f);
write('.nojekyll', '');

/* ------------------------------------------------------ service worker */
// Everything a visit can need, with content hashes (thumb.svg files are inlined in the portal).
const precache = {};
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(OUT, dir), { withFileTypes: true })) {
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) { walk(rel); continue; }
    if (/(^|\/)(thumb\.svg|LICENSE[^/]*|\.nojekyll)$/.test(rel)) continue;
    precache[rel] = hash(fs.readFileSync(path.join(OUT, rel)));
  }
})('');
const version = hash(JSON.stringify(precache));
const sw = KILL_SW ? KILL_SW_SOURCE() : SW_SOURCE(version, precache);
write('sw.js', sw);

/* -------------------------------------------------------------- report */
const total = Object.keys(precache).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`built ${gameDirs.length} games + portal into ${posix(path.relative(ROOT, OUT))}/ (minify ${MINIFY ? 'on' : 'off'})`);
console.log(`offline cache: ${Object.keys(precache).length} files, ${(total / 1048576).toFixed(2)} MB, version ${version}${KILL_SW ? ' (KILL SWITCH sw.js)' : ''}`);
for (const [f, b] of report.slice(0, 1)) console.log(`  ${f}: ${(b / 1024).toFixed(0)} KB`);
const gb = report.slice(1).map(r => r[1]);
console.log(`  games: ${(Math.min(...gb) / 1024).toFixed(0)}–${(Math.max(...gb) / 1024).toFixed(0)} KB each (one file per game)`);

function SW_SOURCE(VERSION, FILES) {
  return `/* Offline cache for ألعاب الفسحة. Generated by tools/build.mjs — do not edit. */
'use strict';
var VERSION = ${JSON.stringify(VERSION)};
var FILES = ${JSON.stringify(FILES)};
var CACHE = 'sg-' + VERSION;
var SCOPE = self.registration.scope;
var SCOPE_PATH = new URL(SCOPE).pathname;

function toRel(url) {
  var u = new URL(url);
  if (u.origin !== location.origin || u.pathname.indexOf(SCOPE_PATH) !== 0) return null;
  var p = decodeURIComponent(u.pathname.slice(SCOPE_PATH.length));
  if (p === '' || p.charAt(p.length - 1) === '/') p += 'index.html';
  return Object.prototype.hasOwnProperty.call(FILES, p) ? p : null;
}
function hex(buf) {
  return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

// Install: keep unchanged files from the previous cache, download only the changed ones
// (straight from the network, checked against their hash), then take over right away.
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    var oldNames = (await caches.keys()).filter(function (k) { return k.indexOf('sg-') === 0 && k !== CACHE; });
    var olds = await Promise.all(oldNames.map(function (k) { return caches.open(k); }));
    var paths = Object.keys(FILES);
    var next = 0;
    async function one(p) {
      var url = new URL(p, SCOPE).href;
      if (await cache.match(url)) return;
      for (var i = 0; i < olds.length; i++) {
        var hit = await olds[i].match(url);
        if (hit && hit.headers.get('x-sg-hash') === FILES[p]) { await cache.put(url, hit); return; }
      }
      var res = await fetch(url + '?sg=' + FILES[p], { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + p);
      var body = await res.arrayBuffer();
      var got = hex(await crypto.subtle.digest('SHA-256', body)).slice(0, 16);
      if (got !== FILES[p]) throw new Error('stale copy of ' + p);
      var headers = new Headers(res.headers);
      headers.set('x-sg-hash', FILES[p]);
      await cache.put(url, new Response(body, { status: 200, headers: headers }));
    }
    async function worker() { while (next < paths.length) await one(paths[next++]); }
    try {
      await Promise.all([worker(), worker(), worker(), worker()]);
    } catch (e) {
      // Don't leave a half-filled cache on the disk; the current version keeps working and
      // the update is retried on the next visit.
      await caches.delete(CACHE);
      throw e;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var names = await caches.keys();
    await Promise.all(names.filter(function (k) { return k.indexOf('sg-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

// Files of this version come from the offline cache; anything else goes to the network.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var rel = toRel(req.url);
  if (!rel) return;
  event.respondWith((async function () {
    var hit = await caches.match(new URL(rel, SCOPE).href, { cacheName: CACHE });
    if (hit) return hit;
    return fetch(req);
  })());
});
`;
}

function KILL_SW_SOURCE() {
  return `/* Emergency switch generated by tools/build.mjs --kill-sw: removes the offline cache. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var names = await caches.keys();
    await Promise.all(names.filter(function (k) { return k.indexOf('sg-') === 0; }).map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var list = await self.clients.matchAll({ type: 'window' });
    list.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });
  })());
});
`;
}

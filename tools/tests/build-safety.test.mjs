import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const builder = fs.readFileSync(path.join(repo, 'tools/build.mjs'));
const marker = '.school-games-build.json';
const download = 'school-games-offline.zip';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-build-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };
  write('tools/build.mjs', builder);
  for (const helper of ['svg-data-uri.mjs', 'zip.mjs']) write('tools/lib/' + helper, fs.readFileSync(path.join(repo, 'tools/lib', helper)));
  write('index.html', '<!doctype html><html><body><script src="js/catalog.js"></script><script src="js/site.js"></script><script src="js/offline.js"></script></body></html>');
  write('js/catalog.js', 'window.GAMES = [{ slug: "demo" }];');
  write('js/site.js', 'window.portalReady = true;');
  write('js/offline.js', fs.readFileSync(path.join(repo, 'js/offline.js'), 'utf8'));
  write('teacher.html', '<!doctype html><html><head><link rel="stylesheet" href="css/teacher.css"></head><body><main id="teacherApp"></main><script src="js/catalog.js"></script><script src="js/teacher.js"></script></body></html>');
  write('js/teacher.js', 'window.SGTeacher = {};');
  write('css/teacher.css', 'main { color: navy; }');
  write('games/demo/index.html', '<!doctype html><html><head><link rel="stylesheet" href="../../shared/game.css"></head><body><script src="game.js"></script></body></html>');
  write('games/demo/game.js', 'window.gameReady = true;');
  write('games/demo/thumb.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"></svg>');
  write('shared/game.css', 'body { color: blue; }');
  write('shared/fonts/LICENSE-Test.txt', 'Test font license');
  write('lib/three/three.min.js', 'window.THREE = {};');
  write('lib/three/LICENSE', 'Test library license');
  write('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  write('manifest.webmanifest', '{"name":"Build safety fixture","start_url":"./"}');
  return { root, write };
}

function run(f, args = [], nodeArgs = []) {
  return spawnSync(process.execPath, [...nodeArgs, path.join(f.root, 'tools/build.mjs'), '--no-minify', ...args], {
    cwd: f.root, encoding: 'utf8', timeout: 30000
  });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

function refused(result, message = /refusing/) {
  assert.notEqual(result.status, 0, 'build must fail');
  assert.match(result.stderr, message);
}

function snapshot(root, rel = '', result = {}) {
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const file = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      result[file + '/'] = 'directory';
      snapshot(root, file, result);
    } else if (entry.isSymbolicLink()) result[file] = 'link:' + fs.readlinkSync(path.join(root, file));
    else result[file] = fs.readFileSync(path.join(root, file)).toString('base64');
  }
  return result;
}

function noTemporaryOutput(f) {
  assert.deepEqual(fs.readdirSync(f.root).filter(name => /^\.school-games-(?:build|backup)-/.test(name)), []);
}

test('default and nested custom outputs rebuild safely without caching the ownership marker', t => {
  const f = fixture(t);
  for (const args of [[], [], ['--out', '.work/preview'], ['--out', '.work/preview']]) success(run(f, args));
  for (const directory of ['_site', '.work/preview']) {
    const root = path.join(f.root, directory);
    const inventory = JSON.parse(fs.readFileSync(path.join(root, marker), 'utf8'));
    assert.equal(inventory.producer, 'school-games/tools/build.mjs');
    assert.ok(inventory.files.includes('games/demo/index.html'));
    assert.ok(inventory.files.includes('teacher.html'));
    const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const precache = JSON.parse(worker.match(/^var FILES = (.+);$/m)[1]);
    // The teacher page is one cached file with its catalog, script and styles inlined.
    assert.ok(Object.hasOwn(precache, 'teacher.html'));
    const teacher = fs.readFileSync(path.join(root, 'teacher.html'), 'utf8');
    assert.ok(teacher.includes('window.SGTeacher = {}') && teacher.includes('main { color: navy; }'));
    assert.equal(/<script[^>]+src=|<link[^>]+stylesheet/.test(teacher), false);
    assert.equal(Object.hasOwn(precache, marker), false);
    assert.equal(worker.includes(marker), false);
    // The offline download is replaced by the next build but never cached by children's PCs.
    assert.ok(inventory.files.includes(download));
    assert.equal(Object.hasOwn(precache, download), false);
  }
  noTemporaryOutput(f);
});

test('kill-switch portals stay unregistered after worker-driven navigation', t => {
  const f = fixture(t);
  const portal = () => fs.readFileSync(path.join(f.root, '_site/index.html'), 'utf8');
  // Only the portal registers the worker; the teacher page never does.
  const teacher = () => fs.readFileSync(path.join(f.root, '_site/teacher.html'), 'utf8');
  success(run(f));
  assert.ok(portal().includes('navigator.serviceWorker.register'));
  assert.equal(teacher().includes('serviceWorker'), false);
  success(run(f, ['--kill-sw']));
  assert.equal(portal().includes('navigator.serviceWorker.register'), false);
  assert.equal(teacher().includes('serviceWorker'), false);
  assert.ok(fs.readFileSync(path.join(f.root, '_site/sw.js'), 'utf8').includes('"teacher.html"'), 'the kill switch knows the cached teacher page');
  assert.ok(fs.readFileSync(path.join(f.root, '_site/sw.js'), 'utf8').includes('self.registration.unregister()'));
  success(run(f));
  assert.ok(portal().includes('navigator.serviceWorker.register'));
});

test('worker-only changes get an independent cache while unchanged builds stay deterministic', t => {
  const f = fixture(t);
  const worker = () => fs.readFileSync(path.join(f.root, '_site/sw.js'), 'utf8');
  const portal = () => fs.readFileSync(path.join(f.root, '_site/index.html'), 'utf8');
  const zipped = () => fs.readFileSync(path.join(f.root, '_site', download));
  const version = source => source.match(/^var VERSION = (.+);$/m)[1];
  const files = source => source.match(/^var FILES = (.+);$/m)[1];
  success(run(f));
  const before = worker(), beforeZip = zipped(), beforePortal = portal();
  success(run(f));
  assert.equal(worker(), before, 'an unchanged build must keep the same worker bytes');
  assert.deepEqual(zipped(), beforeZip, 'an unchanged build must keep the same offline download bytes');
  const changedBuilder = builder.toString().replace('var checkingStatus = null;', 'var checkingStatus = null; // worker-only revision');
  assert.notEqual(changedBuilder, builder.toString());
  f.write('tools/build.mjs', changedBuilder);
  success(run(f));
  const after = worker(), afterPortal = portal();
  const beforeFiles = JSON.parse(files(before)), afterFiles = JSON.parse(files(after));
  assert.deepEqual(Object.keys(afterFiles).sort(), Object.keys(beforeFiles).sort(), 'worker-only updates preserve the complete file inventory');
  const withoutPortal = entries => Object.fromEntries(Object.entries(entries).filter(([name]) => name !== 'index.html'));
  assert.deepEqual(withoutPortal(afterFiles), withoutPortal(beforeFiles), 'every non-portal asset hash remains identical');
  assert.notEqual(afterFiles['index.html'], beforeFiles['index.html'], 'the portal carries the new build identity');
  const identity = /window\.SG_OFFLINE_VERSION="([0-9a-f]{16})";/g;
  for (const [page, source, manifest] of [[beforePortal, before, beforeFiles], [afterPortal, after, afterFiles]]) {
    assert.equal((page.match(/window\.SG_OFFLINE_VERSION=/g) || []).length, 1, 'exactly one page identity assignment');
    const values = [...page.matchAll(identity)];
    assert.equal(values.length, 1, 'page identity is one deterministic 16-hex value');
    assert.equal(values[0][1], JSON.parse(version(source)), 'each portal identifies its own worker version');
    assert.equal(crypto.createHash('sha256').update(page).digest('hex').slice(0, 16), manifest['index.html'], 'the manifest verifies the final served portal bytes');
  }
  assert.equal(afterPortal.replace(identity, ''), beforePortal.replace(identity, ''), 'only the identity assignment changes in a worker-only portal update');
  assert.notEqual(version(worker()), version(before), 'worker implementation changes must use a different cache');
});

test('legacy normal and kill-switch builds without markers are recognized', t => {
  const f = fixture(t);
  // Builds without markers also predate the offline download.
  const makeLegacy = () => { for (const file of [marker, download]) fs.unlinkSync(path.join(f.root, '_site', file)); };
  for (const args of [[], ['--kill-sw']]) {
    success(run(f, args));
    makeLegacy();
    success(run(f, args));
    assert.ok(fs.existsSync(path.join(f.root, '_site', marker)));
  }
  makeLegacy();
  // The original emergency switch predates the teacher page, so its output never had one.
  fs.unlinkSync(path.join(f.root, '_site', 'teacher.html'));
  f.write('_site/sw.js', `/* Emergency switch generated by tools/build.mjs --kill-sw: removes the offline cache. */
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
`);
  success(run(f));
  noTemporaryOutput(f);
});

test('invalid command lines fail before touching existing output', t => {
  const f = fixture(t);
  success(run(f));
  const before = snapshot(f.root);
  for (const args of [['--out'], ['--out', '--kill-sw'], ['--out', ''], ['--out', '_site', '--out', 'other'], ['--typo'], ['unexpected']]) {
    refused(run(f, args), /requires a directory|only be specified once|unknown build argument/);
    assert.deepEqual(snapshot(f.root), before);
  }
});

test('source, Git metadata, repository-root and outside destinations preserve every sentinel', t => {
  const f = fixture(t);
  f.write('.git/canary', 'keep Git metadata');
  f.write('docs/canary.md', 'keep documentation');
  const before = snapshot(f.root);
  for (const out of ['games', 'games/demo', 'games/new-build', 'js', 'shared', 'tools', 'docs', 'multiplayer-server', '.git', '.git/objects', '.', '..']) {
    refused(run(f, ['--out', out]));
    assert.deepEqual(snapshot(f.root), before, out);
  }
});

test('tracked files prevent replacing even an otherwise generated output directory', t => {
  const f = fixture(t);
  success(run(f));
  f.write('reports/notes.txt', 'tracked notes');
  execFileSync('git', ['init', '-q', f.root]);
  execFileSync('git', ['-C', f.root, 'add', 'reports/notes.txt', '_site/index.html']);
  const before = snapshot(f.root);
  for (const out of ['reports', '_site']) {
    refused(run(f, ['--out', out]), /tracked repository files/);
    assert.deepEqual(snapshot(f.root), before);
  }
});

test('unrelated nonempty directories and added output files are never cleared', t => {
  const f = fixture(t);
  f.write('scratch/keep.txt', 'unrelated work');
  const before = snapshot(f.root);
  refused(run(f, ['--out', 'scratch']), /non-generated output/);
  assert.deepEqual(snapshot(f.root), before);
  success(run(f));
  f.write('_site/keep.txt', 'new user file inside generated output');
  const added = snapshot(f.root);
  refused(run(f), /unrecognized file/);
  assert.deepEqual(snapshot(f.root), added);
});

test('symlink ancestors, destinations, and links inside output cannot redirect deletion', t => {
  const f = fixture(t);
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-build-canary-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  fs.writeFileSync(path.join(elsewhere, 'keep.txt'), 'outside repository');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(elsewhere, path.join(f.root, 'linked'), linkType);
  fs.symlinkSync(path.join(f.root, 'games'), path.join(f.root, 'source-alias'), linkType);
  const before = snapshot(f.root), external = snapshot(elsewhere);
  for (const out of ['linked', 'linked/preview', 'source-alias', 'source-alias/preview']) {
    refused(run(f, ['--out', out]), /symlink/);
    assert.deepEqual(snapshot(f.root), before);
    assert.deepEqual(snapshot(elsewhere), external);
  }
  success(run(f));
  fs.symlinkSync(elsewhere, path.join(f.root, '_site', 'linked'), linkType);
  const inside = snapshot(f.root);
  refused(run(f), /symlink/);
  assert.deepEqual(snapshot(f.root), inside);
  assert.deepEqual(snapshot(elsewhere), external);
});

test('a build failure preserves the last successful output and removes staging files', t => {
  const f = fixture(t);
  success(run(f));
  const before = snapshot(path.join(f.root, '_site'));
  fs.unlinkSync(path.join(f.root, 'js/site.js'));
  refused(run(f), /ENOENT/);
  assert.deepEqual(snapshot(path.join(f.root, '_site')), before);
  noTemporaryOutput(f);
});

test('failed publication rolls the previous output back into place', t => {
  const f = fixture(t);
  success(run(f));
  const before = snapshot(path.join(f.root, '_site'));
  f.write('js/site.js', 'window.portalReady = "new version";');
  const injection = f.write('fail-publish.cjs', `
    const fs = require('node:fs'), path = require('node:path');
    const rename = fs.renameSync;
    fs.renameSync = function (from, to) {
      if (path.basename(from).startsWith('.school-games-build-') && path.basename(to) === '_site') {
        throw new Error('injected publication failure');
      }
      return rename.call(this, from, to);
    };
  `);
  refused(run(f, [], ['--require', injection]), /injected publication failure/);
  assert.deepEqual(snapshot(path.join(f.root, '_site')), before);
  noTemporaryOutput(f);
});

test('if rollback itself fails, the previous output remains in the reported backup', t => {
  const f = fixture(t);
  success(run(f));
  const before = snapshot(path.join(f.root, '_site'));
  const injection = f.write('fail-restore.cjs', `
    const fs = require('node:fs'), path = require('node:path');
    const rename = fs.renameSync;
    fs.renameSync = function (from, to) {
      if (/^\\.school-games-(build|backup)-/.test(path.basename(from)) && path.basename(to) === '_site') {
        throw new Error('injected replacement/restore failure');
      }
      return rename.call(this, from, to);
    };
  `);
  const result = run(f, [], ['--require', injection]);
  refused(result, /previous build is preserved at/);
  const backup = fs.readdirSync(f.root).find(name => name.startsWith('.school-games-backup-'));
  assert.ok(backup);
  assert.deepEqual(snapshot(path.join(f.root, backup)), before);
  assert.ok(result.stderr.includes(path.join(f.root, backup)));
  assert.equal(fs.readdirSync(f.root).some(name => name.startsWith('.school-games-build-')), false);
});

test('SG_TELEMETRY_URL reaches the portal only, is checked first, and changes nothing when unset or empty', t => {
  const f = fixture(t);
  f.write('index.html', '<!doctype html><html><body><script src="js/catalog.js"></script><script src="js/telemetry.js"></script>' +
    '<script src="js/site.js"></script><script src="js/offline.js"></script></body></html>');
  f.write('js/telemetry.js', 'window.sinkLoaded = true;');
  const unset = { ...process.env };
  delete unset.SG_TELEMETRY_URL;
  const build = (value, args = []) => spawnSync(process.execPath, [path.join(f.root, 'tools/build.mjs'), '--no-minify', ...args], {
    cwd: f.root, encoding: 'utf8', timeout: 30000, env: value === undefined ? unset : { ...unset, SG_TELEMETRY_URL: value }
  });
  const site = () => snapshot(path.join(f.root, '_site'));
  const text = (files, name) => Buffer.from(files[name], 'base64').toString('utf8');

  success(build(undefined));
  const plain = site();
  assert.ok(Object.values(plain).every(data => !Buffer.from(data, 'base64').includes('SG_TELEMETRY')), 'unset: nothing added');
  // GitHub passes an unset repository variable as an empty string.
  success(build(''));
  assert.deepEqual(site(), plain, 'empty is the same as unset, byte for byte');

  const url = 'https://ingest.example.org/v1/batch?school=north-2';
  const result = build(url);
  success(result);
  assert.match(result.stdout, /telemetry: the portal sends play events without names to ingest\.example\.org/);
  const on = site();
  const portal = text(on, 'index.html');
  assert.equal(portal.split('window.SG_TELEMETRY=').length, 2, 'injected once');
  assert.ok(portal.includes('<script>window.SG_TELEMETRY={url:' + JSON.stringify(url) + '};\nwindow.sinkLoaded = true;</script>'),
    'right before the sink, in its own inline script');
  assert.ok(!portal.includes('allowLocal'), 'never allowLocal');
  for (const name of ['teacher.html', 'games/demo/index.html', 'sw.js']) {
    assert.ok(!text(on, name).includes('SG_TELEMETRY') && !text(on, name).includes('ingest.example.org'), name + ' gets nothing');
  }
  // Only the portal, the worker's version and the download that holds them change.
  assert.deepEqual(Object.keys(on).filter(name => on[name] !== plain[name]).sort(), ['index.html', 'school-games-offline.zip', 'sw.js']);
  assert.deepEqual(Object.keys(on).sort(), Object.keys(plain).sort());

  // The emergency switch never sends: no address in a --kill-sw build.
  success(build(url, ['--kill-sw', '--out', '.work/kill']));
  assert.ok(!fs.readFileSync(path.join(f.root, '.work/kill/index.html'), 'utf8').includes('SG_TELEMETRY'));

  // Anything but a plain https:// address is refused before any output is touched.
  for (const bad of ['http://ingest.example.org/v1', 'ingest.example.org', '//ingest.example.org', 'https://', ' https://ingest.example.org',
    'https://ingest.example.org/"', "https://ingest.example.org/'", 'https://ingest.example.org/a b', 'https://ingest.example.org/\n',
    'https://ingest.example.org/</script>', 'https://ingest.example.org/<!--', 'https://ingest.example.org\\x', 'https://ingest.example.org/`',
    'https://user:secret@ingest.example.org/', 'https://ingést.example.org/', 'javascript:alert(1)', 'https://' + 'a'.repeat(190) + '.example.org']) {
    refused(build(bad), /SG_TELEMETRY_URL must be an https:\/\/ address/);
    assert.deepEqual(site(), on, 'refused: ' + JSON.stringify(bad));
    noTemporaryOutput(f);
  }
  // A portal without the sink cannot be given an address.
  f.write('index.html', '<!doctype html><html><body><script src="js/catalog.js"></script><script src="js/site.js"></script><script src="js/offline.js"></script></body></html>');
  refused(build(url), /SG_TELEMETRY_URL is set, but index\.html does not load js\/telemetry\.js/);
  assert.deepEqual(site(), on);
  noTemporaryOutput(f);
});

test('SG_SITE_URL reaches the teacher page only, is checked first, and changes nothing when unset or empty', t => {
  const f = fixture(t);
  const unset = { ...process.env };
  delete unset.SG_SITE_URL;
  delete unset.SG_TELEMETRY_URL;
  const build = (value, args = []) => spawnSync(process.execPath, [path.join(f.root, 'tools/build.mjs'), '--no-minify', ...args], {
    cwd: f.root, encoding: 'utf8', timeout: 30000, env: value === undefined ? unset : { ...unset, SG_SITE_URL: value }
  });
  const site = () => snapshot(path.join(f.root, '_site'));
  const text = (files, name) => Buffer.from(files[name], 'base64').toString('utf8');

  success(build(undefined));
  const plain = site();
  assert.ok(Object.values(plain).every(data => !Buffer.from(data, 'base64').includes('SG_SITE')), 'unset: nothing added');
  // GitHub passes an unset repository variable as an empty string.
  success(build(''));
  assert.deepEqual(site(), plain, 'empty is the same as unset, byte for byte');

  // The workflow's default spells the owner as GitHub does; the page names the host in lower case.
  const url = 'https://name.github.io/school-games/';
  const result = build('https://Name.github.io/school-games/');
  success(result);
  assert.match(result.stdout, /site: a downloaded folder's teacher page names https:\/\/name\.github\.io\/school-games\//);
  const on = site();
  const teacher = text(on, 'teacher.html');
  assert.equal(teacher.split('window.SG_SITE=').length, 2, 'injected once');
  assert.ok(teacher.includes('<script>window.SG_SITE={url:' + JSON.stringify(url) + '};\nwindow.SGTeacher = {};</script>'),
    'right before the teacher page\'s script, in its own inline script');
  for (const name of ['index.html', 'games/demo/index.html', 'sw.js']) {
    assert.ok(!text(on, name).includes('SG_SITE') && !text(on, name).includes('name.github.io'), name + ' gets nothing');
  }
  // Only the teacher page changes, and with it the offline version (in the worker and the
  // portal) and the download that holds them.
  assert.deepEqual(Object.keys(on).filter(name => on[name] !== plain[name]).sort(), ['index.html', 'school-games-offline.zip', 'sw.js', 'teacher.html']);
  assert.equal(text(on, 'index.html').replace(/SG_OFFLINE_VERSION="[0-9a-f]{16}"/, ''), text(plain, 'index.html').replace(/SG_OFFLINE_VERSION="[0-9a-f]{16}"/, ''),
    'the portal only by its offline version');
  assert.deepEqual(Object.keys(on).sort(), Object.keys(plain).sort());

  // Anything but a plain https:// folder address is refused before any output is touched.
  for (const bad of ['http://name.github.io/school-games/', 'name.github.io/school-games/', '//name.github.io/', 'https://',
    'https://name.github.io/school-games', ' https://name.github.io/', 'https://name.github.io/"/', "https://name.github.io/'/",
    'https://name.github.io/a b/', 'https://name.github.io/</script>/', 'https://name.github.io/<!--/', 'https://name.github.io\\x/',
    'https://name.github.io/`/', 'https://name.github.io/?a=/', 'https://name.github.io/#a/', 'https://user:secret@name.github.io/',
    'https://nämé.github.io/', 'javascript:alert(1)//', 'https://' + 'a'.repeat(190) + '.github.io/']) {
    refused(build(bad), /SG_SITE_URL must be the https:\/\/ address of the published site/);
    assert.deepEqual(site(), on, 'refused: ' + JSON.stringify(bad));
    noTemporaryOutput(f);
  }
  // A teacher page without its script cannot be given an address.
  f.write('teacher.html', '<!doctype html><html><body><main id="teacherApp"></main><script src="js/catalog.js"></script></body></html>');
  refused(build(url), /SG_SITE_URL is set, but teacher\.html does not load js\/teacher\.js/);
  assert.deepEqual(site(), on);
  noTemporaryOutput(f);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const builder = fs.readFileSync(path.join(repo, 'tools/build.mjs'));
const marker = '.school-games-build.json';

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
  write('index.html', '<!doctype html><html><body><script src="js/catalog.js"></script><script src="js/site.js"></script><script src="js/offline.js"></script></body></html>');
  write('js/catalog.js', 'window.GAMES = [{ slug: "demo" }];');
  write('js/site.js', 'window.portalReady = true;');
  write('js/offline.js', fs.readFileSync(path.join(repo, 'js/offline.js'), 'utf8'));
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
    const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const precache = JSON.parse(worker.match(/^var FILES = (.+);$/m)[1]);
    assert.equal(Object.hasOwn(precache, marker), false);
    assert.equal(worker.includes(marker), false);
  }
  noTemporaryOutput(f);
});

test('a new empty custom directory is supported', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'preview'));
  success(run(f, ['--out', 'preview']));
  assert.ok(fs.existsSync(path.join(f.root, 'preview', marker)));
});

test('kill-switch portals stay unregistered after worker-driven navigation', t => {
  const f = fixture(t);
  const portal = () => fs.readFileSync(path.join(f.root, '_site/index.html'), 'utf8');
  success(run(f));
  assert.ok(portal().includes('navigator.serviceWorker.register'));
  success(run(f, ['--kill-sw']));
  assert.equal(portal().includes('navigator.serviceWorker.register'), false);
  assert.ok(fs.readFileSync(path.join(f.root, '_site/sw.js'), 'utf8').includes('self.registration.unregister()'));
  success(run(f));
  assert.ok(portal().includes('navigator.serviceWorker.register'));
});

test('legacy normal and kill-switch builds without markers are recognized', t => {
  const f = fixture(t);
  for (const args of [[], ['--kill-sw']]) {
    success(run(f, args));
    fs.unlinkSync(path.join(f.root, '_site', marker));
    success(run(f, args));
    assert.ok(fs.existsSync(path.join(f.root, '_site', marker)));
  }
  fs.unlinkSync(path.join(f.root, '_site', marker));
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

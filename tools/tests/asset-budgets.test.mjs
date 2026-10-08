import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkAssetBudgets } from '../asset-budgets.mjs';

const hash = '0123456789abcdef';
const measuredFiles = ['index.html', 'teacher.html', 'games/alpha/index.html', 'lib/three/three.min.js', 'shared/fonts/test.woff2'];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-asset-budgets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, contents) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return target;
  };
  const config = { format: 1, portalBytes: 100, teacherBytes: 100, gameHtmlBytes: { alpha: 100 }, threeBytes: 100, fontBytes: { 'test.woff2': 100 }, precacheBytes: 1000 };
  const manifest = Object.fromEntries(measuredFiles.map(file => [file, hash]));
  const configPath = write('asset-budgets.json', JSON.stringify(config));
  const catalogPath = write('catalog.js', "window.GAMES=[{slug:'alpha'}];");
  for (const file of measuredFiles) write(file, Buffer.alloc(100, 97));
  const saveConfig = () => write('asset-budgets.json', JSON.stringify(config));
  const saveManifest = () => write('sw.js', 'var FILES = ' + JSON.stringify(manifest) + ';\n');
  saveManifest();
  return { root, write, config, manifest, configPath, catalogPath, saveConfig, saveManifest };
}

function run(f) {
  let report;
  assert.doesNotThrow(() => { report = checkAssetBudgets({ root: f.root, configPath: f.configPath, catalogPath: f.catalogPath }); });
  assert.equal(report.format, 1);
  assert.equal(report.unit, 'bytes');
  assert.equal(typeof report.passed, 'boolean');
  assert.ok(Array.isArray(report.metrics));
  assert.ok(Array.isArray(report.failures));
  assert.ok(report.failures.every(failure => typeof failure === 'string'));
  return report;
}

function rejected(f, explanation) {
  const report = run(f);
  assert.equal(report.passed, false, explanation);
  assert.ok(report.failures.length > 0, explanation);
  return report;
}

function metricFor(report, file) {
  const metric = report.metrics.find(metric => metric.files.length === 1 && metric.files[0] === file);
  assert.ok(metric, 'missing metric for ' + file);
  return metric;
}

test('exact boundaries pass and precache counts every manifest entry deterministically', t => {
  const f = fixture(t);
  f.write('extra.json', Buffer.alloc(37));
  f.manifest['extra.json'] = hash;
  f.saveManifest();
  f.config.precacheBytes = 537;
  f.saveConfig();
  const report = run(f);
  assert.equal(report.passed, true, report.failures.join('\n'));
  assert.deepEqual(report.failures, []);
  assert.equal(report.metrics.length, 6);
  for (const file of measuredFiles) {
    const metric = metricFor(report, file);
    assert.equal(typeof metric.name, 'string');
    assert.equal(metric.bytes, 100);
    assert.equal(metric.limitBytes, 100);
    assert.equal(metric.passed, true);
  }
  const total = report.metrics.find(metric => metric.files.includes('extra.json'));
  assert.ok(total);
  assert.deepEqual([...total.files].sort(), [...measuredFiles, 'extra.json'].sort());
  assert.equal(total.bytes, 537);
  assert.equal(total.limitBytes, 537);
  assert.equal(total.passed, true);
  assert.deepEqual(run(f), report);
});

test('total precache budget fails even when every individual asset passes', t => {
  const f = fixture(t);
  f.config.precacheBytes = 499;
  f.saveConfig();
  const report = rejected(f);
  for (const file of measuredFiles) assert.equal(metricFor(report, file).passed, true);
  const failures = report.metrics.filter(metric => !metric.passed);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].bytes, 500);
  assert.equal(failures[0].limitBytes, 499);
});

test('new hidden catalog games and fonts require their own reviewed budgets', t => {
  const f = fixture(t);
  f.write('catalog.js', "window.GAMES=[{slug:'alpha'},{slug:'beta',hidden:true}];");
  f.write('games/beta/index.html', 'beta');
  f.manifest['games/beta/index.html'] = hash;
  f.saveManifest();
  rejected(f, 'hidden catalog entries must not bypass game budgets');
  f.config.gameHtmlBytes.beta = 4;
  f.saveConfig();
  const report = run(f);
  assert.equal(report.passed, true, report.failures.join('\n'));
  assert.equal(metricFor(report, 'games/beta/index.html').bytes, 4);
  f.write('shared/fonts/new.woff2', 'font');
  f.manifest['shared/fonts/new.woff2'] = hash;
  f.saveManifest();
  rejected(f, 'a newly added font must require an explicit budget');
  f.config.fontBytes['new.woff2'] = 4;
  f.saveConfig();
  const withFont = run(f);
  assert.equal(withFont.passed, true, withFont.failures.join('\n'));
  assert.equal(metricFor(withFont, 'shared/fonts/new.woff2').bytes, 4);
});

test('missing measured assets and extra missing manifest entries return failures', async t => {
  for (const file of ['shared/fonts/test.woff2', 'teacher.html']) await t.test(file, t => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.root, file));
    rejected(f, file);
  });
  await t.test('unbudgeted manifest asset', t => {
    const f = fixture(t);
    f.manifest['missing.json'] = hash;
    f.saveManifest();
    rejected(f);
  });
  await t.test('required assets must belong to the manifest and can be restored', t => {
    const f = fixture(t);
    for (const file of measuredFiles) {
      delete f.manifest[file];
      f.saveManifest();
      rejected(f, 'missing required FILES entry: ' + file);
      f.manifest[file] = hash;
      f.saveManifest();
      const restored = run(f);
      assert.equal(restored.passed, true, restored.failures.join('\n'));
    }
  });
});

test('invalid JSON and incomplete or incorrectly shaped config are rejected', t => {
  const f = fixture(t);
  const invalid = ['{', 'null', '[]', '{}', JSON.stringify({ ...f.config, format: 2 }), JSON.stringify({ ...f.config, gameHtmlBytes: [] }), JSON.stringify({ ...f.config, fontBytes: null })];
  for (const key of ['portalBytes', 'teacherBytes', 'gameHtmlBytes', 'threeBytes', 'fontBytes', 'precacheBytes']) {
    const partial = { ...f.config };
    delete partial[key];
    invalid.push(JSON.stringify(partial));
  }
  for (const contents of invalid) {
    f.write('asset-budgets.json', contents);
    rejected(f, contents);
  }
});

test('all budget fields reject infinity, NaN, negative, string and null values', t => {
  const f = fixture(t);
  for (const field of ['portalBytes', 'teacherBytes', 'alpha', 'threeBytes', 'test.woff2', 'precacheBytes']) {
    for (const value of ['1e999', 'NaN', '-1', '"100"', 'null']) {
      const contents = JSON.stringify(f.config).replace('"' + field + '":' + (field === 'precacheBytes' ? '1000' : '100'), '"' + field + '":' + value);
      f.write('asset-budgets.json', contents);
      rejected(f, field + ': ' + value);
    }
  }
});

test('missing, malformed and ambiguous FILES declarations and invalid hashes fail safely', t => {
  const f = fixture(t);
  const valid = 'var FILES = ' + JSON.stringify(f.manifest) + ';';
  const invalid = [
    '', 'self.addEventListener("install", function () {});', 'var FILES = {;',
    'var FILES = [];', 'var FILES = null;', 'var FILES = {"index.html":"short"};',
    'var FILES = {"index.html":"0123456789ABCDEF"};', 'var FILES = {"index.html":123};',
    valid + '\n' + valid
  ];
  for (const contents of invalid) {
    f.write('sw.js', contents);
    rejected(f, contents);
  }
});

test('manifest traversal and absolute paths cannot include files outside the build', t => {
  const f = fixture(t);
  for (const unsafe of ['../outside.txt', 'games/../../outside.txt', '/outside.txt', 'C:/outside.txt', '..\\outside.txt', '\\\\server\\share\\outside.txt']) {
    f.write('sw.js', 'var FILES = ' + JSON.stringify({ ...f.manifest, [unsafe]: hash }) + ';\n');
    rejected(f, unsafe);
  }
});

test('config game slugs and font names reject path traversal and absolute paths', t => {
  const f = fixture(t);
  for (const unsafe of ['../outside', '/outside', 'C:/outside', '..\\outside', 'alpha/../../outside']) {
    f.write('asset-budgets.json', JSON.stringify({ ...f.config, gameHtmlBytes: { ...f.config.gameHtmlBytes, [unsafe]: 100 } }));
    rejected(f, 'game slug: ' + unsafe);
    f.write('asset-budgets.json', JSON.stringify({ ...f.config, fontBytes: { ...f.config.fontBytes, [unsafe]: 100 } }));
    rejected(f, 'font name: ' + unsafe);
  }
});

test('worker JavaScript is never executed when extracting a valid FILES manifest', t => {
  const f = fixture(t);
  const sentinel = '__schoolGamesAssetBudgetWorkerExecuted';
  const previous = Object.getOwnPropertyDescriptor(globalThis, sentinel);
  delete globalThis[sentinel];
  t.after(() => {
    delete globalThis[sentinel];
    if (previous) Object.defineProperty(globalThis, sentinel, previous);
  });
  f.write('sw.js', `globalThis.${sentinel} = true;\nthrow new Error('worker must never run');\nvar FILES = ${JSON.stringify(f.manifest)};\n`);
  const report = run(f);
  assert.equal(report.passed, true, report.failures.join('\n'));
  assert.equal(Object.hasOwn(globalThis, sentinel), false);
  f.write('sw.js', `var FILES = (() => { globalThis.${sentinel} = true; return ${JSON.stringify(f.manifest)}; })();\n`);
  rejected(f);
  assert.equal(Object.hasOwn(globalThis, sentinel), false);
});

test('directory symlinks cannot make precache measurements escape the build root', t => {
  const f = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-asset-budget-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'asset.txt'), 'outside root');
  try {
    fs.symlinkSync(outside, path.join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) return t.skip('directory symlinks unavailable: ' + error.code);
    throw error;
  }
  f.manifest['linked/asset.txt'] = hash;
  f.saveManifest();
  rejected(f);
  assert.equal(fs.readFileSync(path.join(outside, 'asset.txt'), 'utf8'), 'outside root');
});

test('missing inputs and malformed catalogs produce reports rather than throwing', t => {
  const f = fixture(t);
  for (const key of ['root', 'configPath', 'catalogPath']) rejected({ ...f, [key]: path.join(f.root, 'not-present') }, key);
  for (const contents of ['window.GAMES = [;', 'window.GAMES = null;', 'window.GAMES = {};', 'window.GAMES = [{ title: "missing slug" }];']) {
    f.write('catalog.js', contents);
    rejected(f, contents);
  }
});

test('multiple budget failures are reported together with usable numeric measurements', t => {
  const f = fixture(t);
  for (const file of measuredFiles) f.write(file, Buffer.alloc(110));
  f.config.precacheBytes = 500;
  f.saveConfig();
  const report = rejected(f);
  assert.equal(report.metrics.filter(metric => !metric.passed).length, 6);
  assert.ok(report.failures.length >= 6);
  for (const metric of report.metrics) {
    assert.ok(Number.isFinite(metric.bytes));
    assert.ok(Number.isFinite(metric.limitBytes));
    assert.ok(metric.bytes > metric.limitBytes);
  }
});

test('CLI writes a machine-readable failure report and exits nonzero for invalid config', t => {
  const f = fixture(t);
  f.write('asset-budgets.json', '{"format":1}');
  const reportPath = path.join(f.root, 'reports', 'asset-budgets.json');
  const checker = fileURLToPath(new URL('../asset-budgets.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [checker, '--config', f.configPath, '--report', reportPath], {
    cwd: f.root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_SHA: 'example-commit',
      GITHUB_REPOSITORY: 'example/school-games', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' }
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.format, 1);
  assert.equal(report.unit, 'bytes');
  assert.deepEqual(report.provenance, { environment: 'github-actions', commit: 'example-commit',
    repository: 'example/school-games', runId: '123', runAttempt: '2' });
  assert.equal(report.passed, false);
  assert.ok(report.failures.length > 0);
  assert.ok(report.failures.every(failure => typeof failure === 'string'));
});

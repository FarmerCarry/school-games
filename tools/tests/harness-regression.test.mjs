import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let root;
const fixture = '<!doctype html><link rel="icon" href="data:,"><button id="play" onclick="window.clicks = (window.clicks || 0) + 1">Play</button>';

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-harness-regression-'));
  fs.mkdirSync(path.join(root, 'games/rail-rush'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), fixture);
  fs.writeFileSync(path.join(root, 'games/rail-rush/index.html'), fixture);
  fs.writeFileSync(path.join(root, 'games/rail-rush/thumb.svg'), '<svg viewBox="0 0 400 400"></svg>');
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

test('check-all retains diagnostics from a child exiting with failure', () => {
  fs.writeFileSync(path.join(root, 'games/rail-rush/index.html'), fixture + '<script>throw new Error("child failure marker")</script>');
  const result = spawnSync(process.execPath, [path.join(repo, 'tools/check-all.mjs'), 'rail-rush'], {
    env: { ...process.env, SG_ROOT: root }, encoding: 'utf8', timeout: 40000
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /rail-rush: page error: Error: child failure marker/);
  assert.doesNotMatch(result.stdout, /harness crashed/);
});

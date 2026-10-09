// Skybound Golf's engine: deterministic shots, the one-button rules, reachable
// worlds and save migration (games/skybound-golf/verify.js). Node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Golf physics verifier passes', () => {
  const result = spawnSync(process.execPath, [path.join(repo, 'games/skybound-golf/verify.js')], { cwd: repo, encoding: 'utf8', timeout: 60000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'PASS');
});

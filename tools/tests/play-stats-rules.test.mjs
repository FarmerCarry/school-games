// Static rules for the local-only play statistics (docs/PLAY_STATS.md). Node only:
// nothing on the site goes over the network, engine and simulation files never
// report, and round ids never carry typed text. Runs once in the shared suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = file => path.relative(repo, file).split(path.sep).join('/');
const read = file => fs.readFileSync(file, 'utf8');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const catalog = { window: {} };
vm.runInNewContext(read(path.join(repo, 'js/catalog.js')), catalog);
const slugs = catalog.window.GAMES.map(game => game.slug);

// Kit, the portal and teacher scripts, both root pages and every game file.
const pages = [path.join(repo, 'shared/kit.js'), path.join(repo, 'index.html'), path.join(repo, 'teacher.html'),
  ...fs.readdirSync(path.join(repo, 'js')).filter(name => name.endsWith('.js')).map(name => path.join(repo, 'js', name))];
const gameFiles = walk(path.join(repo, 'games')).filter(file => /\.(?:html|js)$/.test(file));
const NETWORK = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bRTCPeerConnection\b/, 'RTCPeerConnection'],
  [/\bimportScripts\s*\(/, 'importScripts()'],
  [/\.src\s*=\s*['"`]https?:/, 'an external image or script address (a beacon)'],
  [/\b(?:src|href|action)\s*=\s*["']https?:\/\//, 'an external address']
];

// Files that Node verifiers and regression tests load with a stub Kit (engines,
// physics, rules, simulations, level data, verifiers and developer tools).
const ENGINE = /(?:^|\/)(?:engine|physics|sim\w*|balance-sim|rules|core|levels|data|ai|endless|board-rules|verify[\w-]*|solutions)\.js$|^games\/[^/]+\/(?:dev|tools)\/|^games\/snake-arena\/world\.js$/;

// Every game: each catalog entry (hidden ones too) and each folder in games/, so a
// new game that never calls Kit.stats fails here without editing this file.
const folders = fs.readdirSync(path.join(repo, 'games'), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name);
const allGames = [...new Set([...slugs, ...folders])].sort();

// Games allowed not to report rounds, each with the reason (docs/PLAY_STATS.md).
// None today: every game has rounds, levels, runs or a free-play 'main' round.
const NO_ROUND_REPORTS = new Map([]);

test('no network APIs in Kit, the portal, the teacher page or any game', () => {
  assert.ok(fs.existsSync(path.join(repo, 'teacher.html')), 'the teacher page is covered');
  const found = [];
  for (const file of [...pages, ...gameFiles]) {
    const text = read(file);
    for (const [pattern, name] of NETWORK) if (pattern.test(text)) found.push(`${rel(file)}: ${name}`);
  }
  assert.deepEqual(found, []);
});

test('portal-side scripts never log and never clear all of storage', () => {
  const found = [];
  for (const file of pages) {
    const text = read(file);
    if (/\bconsole\s*\./.test(text)) found.push(rel(file) + ': console output');
    if (/\b(?:localStorage|sessionStorage|storage|store)\s*\.\s*clear\s*\(/.test(text)) found.push(rel(file) + ': clears all of storage');
  }
  for (const file of gameFiles) if (/\blocalStorage\s*\.\s*clear\s*\(/.test(read(file))) found.push(rel(file) + ': localStorage.clear()');
  assert.deepEqual(found, []);
});

test('engine, simulation, level and verifier files never call Kit.stats', () => {
  const engines = [...gameFiles, ...walk(path.join(repo, 'shared'))].filter(file => file.endsWith('.js') && ENGINE.test(rel(file)));
  // Guard the pattern itself: these known simulation files must stay covered.
  for (const known of ['games/pool-party/physics.js', 'games/candy-rope/sim.js', 'games/block-burst/core.js',
    'games/maze-dash/endless.js', 'games/fire-and-ice/verify-levels.js', 'games/candy-rope/dev/solve.js', 'shared/board-rules.js',
    'games/wacky-soccer/balance-sim.js', 'games/snake-arena/world.js']) {
    assert.ok(engines.some(file => rel(file) === known), 'engine scan covers ' + known);
  }
  const found = engines.filter(file => /\bKit\s*\.\s*stats\b/.test(read(file))).map(rel);
  assert.deepEqual(found, []);
});

// The UI scripts a game page loads (its own files and shared/board-game.js), not
// Kit itself, three.js or engine files.
function uiScripts(slug) {
  const dir = path.join(repo, 'games', slug);
  const html = read(path.join(dir, 'index.html'));
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => path.resolve(dir, match[1]))
    .filter(file => fs.existsSync(file) && !/\/lib\/three\//.test(rel(file)) && rel(file) !== 'shared/kit.js' && !ENGINE.test(rel(file)));
}

test('round ids are ids from the game, never typed text, names or codes', () => {
  const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
  const problems = [];
  const files = new Set(slugs.flatMap(uiScripts));
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(/Kit\.stats\.round\(\s*(['"])([^'"\n]*)\1\s*[,)]/g)) {
      if (!ID.test(match[2]) || /\d{3}/.test(match[2])) problems.push(`${rel(file)}: literal round id '${match[2]}'`);
    }
    for (const match of text.matchAll(/Kit\.stats\.round\(([^)]*)\)/g)) {
      const code = match[1].replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '');
      if (/\.value\b|\b(?:name|code|input|words|typed|query|text)\b/i.test(code)) problems.push(`${rel(file)}: round id from ${match[1].trim()}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('every game calls Kit.stats.round and Kit.stats.end', () => {
  assert.ok(allGames.length >= 31, 'the game list comes from js/catalog.js and games/');
  for (const slug of allGames) {
    assert.ok(slugs.includes(slug), slug + ' has a folder in games/ but no entry in js/catalog.js');
    assert.ok(fs.existsSync(path.join(repo, 'games', slug, 'index.html')), slug + ' is in js/catalog.js but has no games/' + slug + '/index.html');
    const text = uiScripts(slug).map(read).join('\n');
    const reports = /Kit\.stats\.round\(/.test(text) && /Kit\.stats\.end\(/.test(text);
    if (NO_ROUND_REPORTS.has(slug)) assert.equal(reports, false, slug + ' reports rounds now: remove it from NO_ROUND_REPORTS');
    else {
      assert.match(text, /Kit\.stats\.round\(/, slug + ' starts rounds');
      assert.match(text, /Kit\.stats\.end\(/, slug + ' ends rounds');
    }
  }
  for (const [slug, why] of NO_ROUND_REPORTS) {
    assert.ok(allGames.includes(slug), 'unknown game in NO_ROUND_REPORTS: ' + slug);
    assert.ok(typeof why === 'string' && why.length > 10, slug + ': say why it reports no rounds');
  }
});

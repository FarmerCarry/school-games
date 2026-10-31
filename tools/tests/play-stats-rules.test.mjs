// Static rules for the local play statistics (docs/PLAY_STATS.md). Node only:
// nothing on the site goes over the network except the portal's telemetry sink
// (no names), js/telemetry.js (docs/ARCHITECTURE.md "Telemetry sink"), engine and simulation
// files never report, and round ids never carry typed text. Runs once in the shared suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NETWORK, SENDER, networkUse, splitSender } from '../lib/network-rules.mjs';

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

// Every shared script (Kit, juice, the board games), the portal and teacher scripts,
// both root pages and every game file.
const pages = [path.join(repo, 'index.html'), path.join(repo, 'teacher.html'),
  ...['shared', 'js'].flatMap(dir => fs.readdirSync(path.join(repo, dir)).filter(name => name.endsWith('.js')).map(name => path.join(repo, dir, name)))];
const gameFiles = walk(path.join(repo, 'games')).filter(file => /\.(?:html|js)$/.test(file));

// Files that Node verifiers and regression tests load with a stub Kit (engines,
// physics, rules, simulations, level data, verifiers and developer tools).
const ENGINE = /(?:^|\/)(?:engine|physics|sim\w*|balance-sim|rules|core|levels|data|ai|endless|board-rules|verify[\w-]*|solutions)\.js$|^games\/[^/]+\/(?:dev|tools)\/|^games\/snake-arena\/world\.js$/;

test('no network APIs in the shared scripts, the portal, the teacher page or any game, except the telemetry sink', () => {
  assert.ok(fs.existsSync(path.join(repo, 'teacher.html')), 'the teacher page is covered');
  for (const file of ['shared/kit.js', 'shared/juice.js', 'shared/board-game.js', 'js/site.js', 'js/stats.js', 'js/profiles.js', SENDER]) {
    assert.ok(pages.some(page => rel(page) === file), 'the scan covers ' + file);
  }
  const found = [];
  for (const file of [...pages, ...gameFiles]) found.push(...networkUse(rel(file), read(file)).map(name => `${rel(file)}: ${name}`));
  assert.deepEqual(found, []);
  // The sender really is the one file that sends.
  assert.match(read(path.join(repo, SENDER)), /\bfetch\s*\(/);
});

test('the telemetry carve-out is exactly js/telemetry.js, and only for fetch()', () => {
  const calls = 'fetch(url, { method: "POST", credentials: "omit", keepalive: true });';
  assert.deepEqual(networkUse(SENDER, calls), []);
  // The same calls anywhere else still fail: other portal scripts, Kit, games, other
  // files named telemetry.js, and paths that only look like the sender.
  for (const file of ['js/site.js', 'js/stats.js', 'js/profiles.js', 'js/teacher.js', 'js/offline.js', 'index.html',
    'teacher.html', 'shared/kit.js', 'shared/juice.js', 'shared/telemetry.js', 'games/tic-tac-toe/index.html',
    'games/road-hopper/game.js', 'games/road-hopper/js/telemetry.js', 'js/sub/telemetry.js', 'js/telemetry.js.bak',
    'js/telemetry.jsx', 'JS/telemetry.js', './js/telemetry.js', '/js/telemetry.js', 'js\\telemetry.js', 'js/telemetry']) {
    assert.deepEqual(networkUse(file, calls), ['fetch()'], file);
  }
  // Every other network API stays banned in the sender too, sendBeacon included: it
  // always sends the ingest host's cookies.
  for (const [code, names] of [
    ['navigator.sendBeacon(url, body)', ['navigator.sendBeacon']],
    ['new XMLHttpRequest()', ['XMLHttpRequest']], ['new WebSocket(url)', ['WebSocket']], ['new EventSource(url)', ['EventSource']],
    ['new RTCPeerConnection()', ['RTCPeerConnection']], ['importScripts(url)', ['importScripts()']],
    ["new Image().src = 'https://ingest.test/pixel.gif'", ['an external image or script address (a beacon)', 'an external address']],
    ['<form action="https://ingest.test/">', ['an external address']]
  ]) assert.deepEqual(networkUse(SENDER, code), names, code);
  assert.equal(NETWORK.length, 9, 'every banned API above is tried in the sender');

  // In the fast build the portal inlines the sender: only one exact copy is split off and
  // checked as the sender; the rest of the page is checked like any other file.
  const copy = '(function(){fetch(u,{});fetch(u,b)})();';
  const page = body => '<script>window.SG_TELEMETRY={url:"https://ingest.test/v1"};\n' + body + '</script><script>site()</script>';
  let split = splitSender(page(copy), [copy]);
  assert.equal(split.sender, copy);
  assert.deepEqual([...networkUse('index.html', split.rest), ...networkUse(SENDER, split.sender)], []);
  for (const tampered of [page(copy.replace('b)', 'b);fetch(x)')), page(copy) + '<script>fetch(x)</script>', page(copy + copy),
    page(copy.replace('fetch(u,{})', 'new XMLHttpRequest()'))]) {
    split = splitSender(tampered, [copy]);
    assert.notDeepEqual([...networkUse('index.html', split.rest), ...networkUse(SENDER, split.sender)], [], tampered);
  }
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

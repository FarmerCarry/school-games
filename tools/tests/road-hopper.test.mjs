import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

// A stand-in portal: the game in an iframe, the preferences it is sent, and every
// message it posts back (window.got).
const EMBED = '/embed/road-hopper.html';
const HOST = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>host</title></head><body style="margin:0">
<iframe id="game" src="/games/road-hopper/" style="width:960px;height:540px;border:0"></iframe>
<script>
window.got = [];
addEventListener('message', function (e) { if (e.source === document.getElementById('game').contentWindow) got.push(e.data); });
window.prefs = function (p) { document.getElementById('game').contentWindow.postMessage(Object.assign({ type: 'sg:preferences' }, p), location.origin); };
</script></body></html>`;

before(async () => {
  server = await startTestServer(root, { pages: { [EMBED]: HOST } });
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

// The game runs its own requestAnimationFrame loop; the page captures it so a test
// can drive frames by hand (waits therefore poll on a timer, not on frames) and count WebGL clears of the main canvas (one or more per
// drawn scene). `idle: false` keeps the idle-time warm-up from running at all;
// `failPictures: n` makes the first n character pictures fail. `embed: {band, telemetry}`
// opens the game inside the stand-in portal, sends it those preferences and returns the
// game's frame (the host page is frame.page()).
async function game(t, { reducedMotion = 'no-preference', idle = true, failPictures = 0, entries = {}, failSave = false, embed = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(([idle, failPictures, entries, failSave]) => {
    if (!sessionStorage.getItem('road-hopper-fixture')) {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem('sg:road-hopper:' + key, JSON.stringify(value));
      sessionStorage.setItem('road-hopper-fixture', '1');
    }
    const rh = window.rh = { queue: [], now: 1000, clears: 0, pictures: 0, lost: 0, resizes: 0,
      failKeys: failSave ? ['save'] : null, writes: [], failPictures };
    addEventListener('resize', () => rh.resizes++);
    window.requestAnimationFrame = cb => rh.queue.push(cb);
    rh.frames = n => {
      for (let i = 0; i < n; i++) {
        rh.now += 1000 / 60;
        const due = rh.queue; rh.queue = [];
        due.forEach(cb => cb(rh.now));
      }
    };
    window.requestIdleCallback = idle ? cb => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0) : () => 0;
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const clear = type.prototype.clear, getExtension = type.prototype.getExtension;
      type.prototype.clear = function () {
        if (this.canvas.id === 'gl') rh.clears++;
        return clear.apply(this, arguments);
      };
      type.prototype.getExtension = function (name) {
        const ext = getExtension.apply(this, arguments);
        if (name === 'WEBGL_lose_context' && ext && !ext.counted) {
          const lose = ext.loseContext;
          ext.loseContext = function () { rh.lost++; return lose.apply(this, arguments); };
          ext.counted = true;
        }
        return ext;
      };
    }
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function () {
      rh.pictures++;
      if (rh.failPictures > 0) { rh.failPictures--; throw new DOMException('Picture fixture', 'SecurityError'); }
      return toDataURL.apply(this, arguments);
    };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      const short = key.replace('sg:road-hopper:', '');
      if (short !== key) rh.writes.push(short);
      if (short !== key && rh.failKeys && (rh.failKeys === 'all' || rh.failKeys.includes(short))) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, [idle, failPictures, entries, failSave]);
  if (embed) {
    await page.goto(server.origin + EMBED);
    const frame = page.frames().find(f => f.url().includes('/games/road-hopper/'));
    await frame.waitForFunction(() => window.__game, null, { polling: 50 });
    await prefs(frame, embed);
    return frame;
  }
  await page.goto(`${server.origin}/games/road-hopper/`);
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  return page;
}
// The stand-in portal sends new preferences; they are applied once a listener added
// after Kit's own has seen them.
async function prefs(frame, p) {
  await frame.evaluate(() => {
    window.prefsSeen = new Promise(resolve => addEventListener('message', function seen(e) {
      if (e.data && e.data.type === 'sg:preferences') { removeEventListener('message', seen); resolve(); }
    }));
  });
  await frame.page().evaluate(p => window.prefs(p), p);
  await frame.evaluate(() => window.prefsSeen);
}

test('reduced motion keeps the new-world banner and reward popups readable, without confetti', async t => {
  const page = await game(t, { reducedMotion: 'reduce' });
  const world = await page.evaluate(() => {
    const g = __game; g.god(true); g.warp(48);
    for (let i = 0; i < 6 && g.score < 50; i++) { g.hop(0, 1); g.step(0.2); }
    const banner = document.getElementById('banner'), fx = document.getElementById('fx');
    const pixels = fx.getContext('2d').getImageData(0, 0, fx.width, fx.height).data;
    return {
      motion: document.documentElement.dataset.sgMotion, score: g.score,
      banner: banner.classList.contains('show') ? getComputedStyle(banner).opacity : 'hidden',
      confetti: pixels.some((value, i) => i % 4 === 3 && value > 0)
    };
  });
  assert.deepEqual(world, { motion: 'reduce', score: 50, banner: '1', confetti: false });
  // The 25-row milestone shows two popups ("25" and a cheer word).
  const pops = await page.evaluate(() => {
    const g = __game; g.warp(23);
    for (let i = 0; i < 6 && g.score < 25; i++) { g.hop(0, 1); g.step(0.2); }
    return [...document.querySelectorAll('#pops .pop')].map(p => getComputedStyle(p).opacity);
  });
  assert.ok(pops.length >= 2, `milestone popups exist (${pops.length})`);
  assert.ok(pops.every(o => o === '1'), `popups are visible (${pops})`);
  await page.waitForFunction(() => !document.getElementById('banner').classList.contains('show') && !document.querySelector('#pops .pop'), null, { polling: 50, timeout: 5000 });
});

test('a paused run draws its scene once, redraws after a resize, and resumes normally', async t => {
  const page = await game(t, { idle: false });
  await page.evaluate(() => { document.getElementById('btnPlay').click(); rh.frames(20); __game.hop(0, 1); rh.frames(40); });
  const paused = await page.evaluate(() => {
    document.getElementById('btnPause').click();
    rh.clears = 0; rh.frames(1);
    const first = rh.clears;
    rh.clears = 0; rh.frames(120);
    rh.resizes = 0;
    return { state: __game.state, first: first > 0, settled: rh.clears };
  });
  assert.deepEqual(paused, { state: 'paused', first: true, settled: 0 });
  await page.setViewportSize({ width: 1000, height: 600 });
  // Wait for the browser to deliver its resize event (the game's handler runs right after this one).
  await page.waitForFunction(() => rh.resizes > 0, null, { polling: 50 });
  const resized = await page.evaluate(() => {
    rh.clears = 0; rh.frames(1);
    const once = rh.clears;
    rh.clears = 0; rh.frames(60);
    return { once: once > 0, settled: rh.clears };
  });
  assert.deepEqual(resized, { once: true, settled: 0 });
  const resumed = await page.evaluate(() => {
    const row = __game.player().autoRow;
    document.getElementById('btnResume').click();
    rh.clears = 0; rh.frames(60);
    return { state: __game.state, everyFrame: rh.clears >= 60, moved: __game.player().autoRow > row };
  });
  assert.deepEqual(resumed, { state: 'play', everyFrame: true, moved: true });
});

test('failed saves retain complete session progress and clear the warning only after one record succeeds', async t => {
  const page = await game(t, { idle: false });
  const previous = await savedProgress(page);
  const status = () => { const s = document.querySelector('.sg-save-status'); return s && !s.hidden ? s.dataset.state : 'hidden'; };
  await page.evaluate(() => {
    rh.failKeys = 'all';
    const g = __game; g.start(); g.god(true);
    for (let i = 0; i < 6; i++) { g.hop(0, 1); g.step(0.2); }
    g.god(false); g.kill('car'); g.step(2);
  });
  assert.equal(await page.evaluate(() => __game.state), 'over');
  assert.equal(await page.evaluate(status), 'failed');
  assert.deepEqual(await savedProgress(page), previous);
  // Retrying the failed record must not mistake its unchanged JSON for a saved value.
  await page.evaluate(() => { rh.failKeys = ['save']; document.querySelector('.sg-save-status button').click(); });
  assert.equal(await page.evaluate(status), 'failed');
  assert.deepEqual(await savedProgress(page), previous);
  // A later save (here: coins added) writes all pending progress together.
  await page.evaluate(() => { rh.failKeys = null; __game.addCoins(5); });
  assert.equal(await page.evaluate(status), 'saved');
  const stored = await page.evaluate(() => ({
    ...JSON.parse(localStorage.getItem('sg:road-hopper:save')),
    memBest: __game.best, memCoins: __game.coins
  }));
  assert.ok(stored.best > 0);
  assert.equal(stored.best, stored.memBest);
  assert.equal(stored.coins, stored.memCoins);
  assert.equal(stored.tipRuns, 1);
  assert.equal(stored.stats.games, 1);
});

function legacyProgress(overrides = {}) {
  return { best: 88, coins: 500, owned: ['chick', 'cat'], sel: 'cat',
    stats: { games: 4, splash: 1, hops: 7, coinsAll: 600 },
    missions: [
      { t: 'roads', n: 20, p: 4, done: false, rw: 20 },
      { t: 'rivers', n: 8, p: 2, done: false, rw: 25 },
      { t: 'games', n: 5, p: 1, done: false, rw: 20 }
    ], tiers: { roads: 2 }, giftAt: 123456789, seen: { chick: 1, cat: 1 }, tipRuns: 2, ...overrides };
}
const savedProgress = page => page.evaluate(() => JSON.parse(localStorage.getItem('sg:road-hopper:save')));
const saveState = page => page.locator('.sg-save-status').getAttribute('data-state');
const writeAttempts = page => page.evaluate(() => rh.writes);
const legacyValues = (page, keys) => page.evaluate(keys => Object.fromEntries(keys.map(key =>
  [key, JSON.parse(localStorage.getItem('sg:road-hopper:' + key))])), keys);

test('legacy progress migrates intact once and the new record overrides stale legacy values on reload', async t => {
  const legacy = legacyProgress(), expected = { v: 1, ...legacy };
  const page = await game(t, { idle: false, entries: legacy });
  assert.deepEqual(await savedProgress(page), expected);
  assert.deepEqual(await writeAttempts(page), ['save'], 'existing mission rotation migrates with one complete write');
  assert.deepEqual(await legacyValues(page, Object.keys(legacy)), legacy, 'migration leaves every legacy value untouched');
  await page.evaluate(() => {
    localStorage.setItem('sg:road-hopper:coins', '99999');
    localStorage.setItem('sg:road-hopper:owned', '["chick"]');
    localStorage.setItem('sg:road-hopper:sel', '"chick"');
  });
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  assert.deepEqual(await savedProgress(page), expected);
  assert.deepEqual(await page.evaluate(() => ({ coins: __game.coins, best: __game.best, name: document.getElementById('cpName').textContent })),
    { coins: legacy.coins, best: legacy.best, name: 'القطة' });
  assert.deepEqual(await writeAttempts(page), [], 'loading a complete unchanged record does not rewrite it');
});

for (const migrated of [false, true]) test(`a failed prize purchase keeps ${migrated ? 'the existing record' : 'legacy progress'} coherent after immediate reload`, async t => {
  const legacy = legacyProgress(), previous = migrated ? { v: 1, ...legacy } : null;
  const page = await game(t, { idle: false, entries: migrated ? { save: previous } : legacy, failSave: true });
  assert.deepEqual(await savedProgress(page), previous);
  await page.evaluate(() => { rh.writes = []; });
  await page.locator('#btnMachine').click();
  await page.locator('#mPull').click();
  assert.equal(await page.evaluate(() => __game.coins), 400, 'the purchase remains available in this session');
  assert.equal(await saveState(page), 'failed');
  assert.deepEqual(await writeAttempts(page), ['save'], 'purchase attempts one complete record');
  assert.deepEqual(await savedProgress(page), previous, 'a failed purchase cannot persist only its currency deduction');
  if (!migrated) assert.deepEqual(await legacyValues(page, Object.keys(legacy)), legacy);
  await page.locator('.sg-save-status button').click();
  assert.equal(await saveState(page), 'failed');
  assert.deepEqual(await writeAttempts(page), ['save', 'save'], 'failed unchanged data must be attempted again');
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  assert.equal(await page.evaluate(() => __game.coins), 500);
  assert.deepEqual(await savedProgress(page), previous);
  if (!migrated) assert.deepEqual(await legacyValues(page, Object.keys(legacy)), legacy);
});

test('Retry saves a pending prize, equipment and later earnings together without charging twice', async t => {
  const previous = { v: 1, ...legacyProgress() };
  const page = await game(t, { idle: false, entries: { save: previous } });
  await page.locator('#btnMachine').click();
  await page.evaluate(() => { rh.failKeys = ['save']; rh.writes = []; });
  await page.locator('#mPull').click();
  await page.waitForFunction(() => !document.getElementById('mReveal').hidden, null, { polling: 50 });
  const prize = await page.evaluate(() => RH.CHARS.find(c => c.name === document.getElementById('mName').textContent).id);
  assert.ok(!previous.owned.includes(prize));
  await page.locator('#mUse').click();
  await page.evaluate(() => __game.addCoins(5));
  assert.equal(await page.evaluate(() => __game.coins), 405);
  assert.deepEqual(await savedProgress(page), previous, 'all failed operations leave the old record intact');
  assert.equal(await saveState(page), 'failed');
  await page.evaluate(() => { rh.failKeys = null; rh.writes = []; });
  await page.locator('.sg-save-status button').click();
  const expected = { ...previous, coins: 405, owned: [...previous.owned, prize], sel: prize, seen: { ...previous.seen, [prize]: 1 } };
  assert.deepEqual(await savedProgress(page), expected);
  assert.equal(await saveState(page), 'saved');
  assert.deepEqual(await writeAttempts(page), ['save']);
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  assert.deepEqual(await savedProgress(page), expected);
  assert.equal(await page.evaluate(() => __game.coins), 405);
});

test('unchanged saves and ordinary frames make no writes, while a changed checkpoint writes once', async t => {
  const previous = { v: 1, ...legacyProgress({ owned: ['chick'], sel: 'chick', seen: { chick: 1 } }) };
  const page = await game(t, { idle: false, entries: { save: previous } });
  await page.evaluate(() => rh.frames(1)); // Position the character controls with the game's own first render.
  await page.locator('#cNext').click();
  await page.evaluate(() => { __game.addCoins(0); rh.frames(120); });
  assert.deepEqual(await writeAttempts(page), []);
  await page.locator('#btnPlay').press('Enter'); // Play pulses continuously; use native keyboard activation.
  await page.evaluate(() => rh.frames(120));
  assert.deepEqual(await writeAttempts(page), [], 'active frames without progress events must not write');
  await page.evaluate(() => { __game.addCoins(5); __game.addCoins(0); });
  assert.deepEqual(await writeAttempts(page), ['save']);
  assert.equal((await savedProgress(page)).coins, previous.coins + 5);
});

test('a run left through the pause menu keeps its best score', async t => {
  const page = await game(t, { idle: false });
  const score = await page.evaluate(() => {
    document.getElementById('btnPlay').click(); rh.frames(20);
    for (let i = 0; i < 2; i++) { __game.hop(0, 1); rh.frames(14); }
    return __game.score;
  });
  assert.ok(score > 0, `the run scored (${score})`);
  await page.evaluate(() => { document.getElementById('btnPause').click(); rh.frames(1); document.getElementById('btnRestart').click(); rh.frames(1); });
  assert.equal(await page.evaluate(() => __game.best), score);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:road-hopper:save')).best), score);
});

/* ------------------------------------------------------- difficulty tiers */
// endless.js is pure, so Node runs it with a seeded Math.random of its own.
const lanesVm = vm.createContext({});
vm.runInContext(readFileSync(path.join(repo, 'games/road-hopper/endless.js'), 'utf8'), lanesVm, { filename: 'endless.js' });
const Lanes = vm.runInContext('RHEndless', lanesVm), TIERS = Lanes.TIERS;
const plain = value => JSON.parse(JSON.stringify(value));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// The first `rows` lanes of a world at a tier (from row -10, behind the start).
function world(tier, seed, rows = 400) {
  vm.runInContext('Math', lanesVm).random = mulberry(seed);
  const g = Lanes.newGen(0, Lanes.tier(tier), 5);
  return Array.from({ length: rows }, () => Lanes.genLane(g));
}
const laneKey = L => [L.row, L.type, L.theme, L.variant, Object.entries(L.blocked).sort(), L.decor.map(d => [d.k, d.x, d.rot]),
  L.coin && [L.coin.c, L.coin.big], L.v, L.dir, L.fast, L.pads,
  L.vehicles && L.vehicles.map(v => [v.t, v.x, v.len, v.col]),
  L.logs && L.logs.map(o => [o.x, o.len, o.pad, o.flower]),
  L.rail && [L.rail.phase, L.rail.t, L.rail.x, L.rail.warn, L.rail.speed, L.rail.bell]];
// The debug hook's path check: trees block grass, lily pads are the only footing on a
// still river, and moving lanes can always be crossed with the right timing.
function crossable(lanes) {
  const rows = new Map(lanes.map(L => [L.row, L])), last = lanes[lanes.length - 1].row;
  const open = (r, c) => {
    const L = rows.get(r);
    if (!L || c < -4 || c > 4) return false;
    if (L.type === 'grass') return !L.blocked[c];
    return !L.pads || L.logs.some(o => o.x === c);
  };
  const seen = new Set(['0,0']), queue = [[0, 0]];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === last) return true;
    for (const [dr, dc] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
      const key = r + dr + ',' + (c + dc);
      if (!seen.has(key) && open(r + dr, c + dc)) { seen.add(key); queue.push([r + dr, c + dc]); }
    }
  }
  return false;
}

test('tier 3 holds the original Road Hopper numbers and anything odd is tier 3', () => {
  assert.deepEqual(plain(Lanes.tier(3)), {
    tier: 3, ramp: 220, dMin: 0, dMax: 1, // difficulty = clamp(row / 220, 0, 1)
    carSpeed: 1, carGap: 3.4, heavyAfter: 12, fastAfter: 25, fast: 1, roadMax: 5,
    riverAfter: 7, riverMax: 4, logSpeed: 1, logGap: 1.4, longLogs: 0.25, land: 0.3,
    railAfter: 16, rail: 1, warn: 1.5, trainGap: 1, rest: 0.72, hit: 0.2,
    eagle: 1, warnAt: 2.3, reach: 3.6, par: 75
  });
  for (let r = -12; r <= 500; r++) assert.equal(Lanes.diffAt(r, Lanes.tier(3)), Math.min(1, Math.max(0, r / 220)));
  for (const odd of [undefined, null, 0, 6, -1, NaN, '2', 'x', {}]) assert.equal(Lanes.tier(odd), TIERS[2], String(odd));
  assert.deepEqual([1, 2, 3, 4, 5].map(n => Lanes.tier(n).tier), [1, 2, 3, 4, 5]);
  assert.ok(Object.isFrozen(TIERS[0]) && Object.isFrozen(TIERS[4]));
});

test('tier 3 makes exactly the lanes the game made before the tiers existed', () => {
  // Hashes of 400 lanes from the generator in game.js at da6fa54 (before endless.js),
  // driven by the same seeded Math.random.
  const before = { 1: '999cd041d480c26d', 7: '63f89feb1a0d1a35', 2026: '32852b6ded33f7e0' };
  for (const [seed, hash] of Object.entries(before)) assert.equal(sha(world(3, +seed).map(laneKey)), hash, `seed ${seed}`);
  assert.notEqual(sha(world(2, 1).map(laneKey)), before[1], 'another tier makes another world');
});

test('every tier knob moves one way from tier 1 to 5; tiers 1-2 are kinder, 4-5 harder, never with stricter hitboxes', () => {
  assert.deepEqual(Object.keys(Lanes.KNOBS).sort(), Object.keys(TIERS[0]).filter(k => k !== 'tier').sort());
  for (const [knob, way] of Object.entries(Lanes.KNOBS)) {
    for (let i = 1; i < 5; i++) {
      const a = TIERS[i - 1][knob], b = TIERS[i][knob];
      assert.ok(way > 0 ? b >= a : b <= a, `${knob} ${way > 0 ? 'rises' : 'falls'} from tier ${i} to ${i + 1} (${a} -> ${b})`);
    }
  }
  const [t1, t2, t3, t4, t5] = TIERS;
  const harder = (a, b, knob) => Lanes.KNOBS[knob] > 0 ? a[knob] > b[knob] : a[knob] < b[knob];
  // Slower, wider gaps, hazards later and rarer, a calmer eagle, kinder hitboxes, a slower ramp.
  for (const easy of [t1, t2]) {
    for (const knob of ['ramp', 'dMax', 'carSpeed', 'carGap', 'heavyAfter', 'fastAfter', 'fast', 'roadMax', 'riverAfter', 'riverMax',
      'logSpeed', 'logGap', 'longLogs', 'land', 'railAfter', 'rail', 'warn', 'trainGap', 'rest', 'hit', 'eagle', 'warnAt', 'reach']) {
      assert.ok(harder(t3, easy, knob), `tier ${easy.tier} is kinder than tier 3 in ${knob}`);
    }
  }
  assert.equal(t1.fast, 0, 'no fast lanes at tier 1');
  for (const hard of [t4, t5]) {
    for (const knob of ['ramp', 'dMin', 'carSpeed', 'carGap', 'heavyAfter', 'fastAfter', 'fast', 'riverAfter', 'logSpeed', 'logGap',
      'longLogs', 'railAfter', 'rail', 'warn', 'trainGap', 'rest', 'eagle', 'warnAt', 'reach']) {
      assert.ok(harder(hard, t3, knob), `tier ${hard.tier} is harder than tier 3 in ${knob}`);
    }
    assert.deepEqual([hard.hit, hard.land], [t3.hit, t3.land], 'hitboxes and log landings stay as fair as tier 3');
  }
});

test('every tier makes crossable worlds whose hazards come later, calmer and with more rest rows at lower tiers', () => {
  const measured = TIERS.map(T => {
    let roads = 0, speed = 0, rows = 0, rest = 0, fast = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const lanes = world(T.tier, seed, 360);
      assert.ok(crossable(lanes), `tier ${T.tier}, seed ${seed}: a path leads through`);
      for (const L of lanes) {
        if (L.row <= 4) continue; // the start meadow
        rows++;
        if (L.type === 'grass') rest++;
        if (L.type === 'river') assert.ok(L.row > T.riverAfter, `tier ${T.tier}: river at row ${L.row}`);
        if (L.type === 'rail') {
          assert.ok(L.row > T.railAfter, `tier ${T.tier}: rail at row ${L.row}`);
          assert.ok(Math.abs(L.rail.warn - (T.warn - Lanes.diffAt(L.row, T) * 0.4)) < 1e-12);
        }
        if (L.type !== 'road') continue;
        roads++; speed += Math.abs(L.v); fast += L.fast ? 1 : 0;
        if (L.fast) assert.ok(L.row > T.fastAfter, `tier ${T.tier}: fast lane at row ${L.row}`);
        if (L.vehicles.some(v => v.t === 'truck' || v.t === 'bus')) assert.ok(L.row > T.heavyAfter, `tier ${T.tier}: trucks at row ${L.row}`);
        for (let i = 1; i < L.vehicles.length; i++) {
          const a = L.vehicles[i - 1], b = L.vehicles[i];
          assert.ok(b.x - b.len / 2 - (a.x + a.len / 2) >= (L.fast ? 5 : T.carGap) - 1e-9, `tier ${T.tier}: gap between vehicles`);
        }
      }
    }
    return { tier: T.tier, speed: speed / roads, rest: rest / rows, fast: fast / roads };
  });
  for (let i = 1; i < 5; i++) {
    const [a, b] = [measured[i - 1], measured[i]];
    assert.ok(b.speed > a.speed, `vehicles get faster from tier ${a.tier} to ${b.tier}: ${JSON.stringify(measured)}`);
    assert.ok(b.rest < a.rest, `fewer rest rows from tier ${a.tier} to ${b.tier}: ${JSON.stringify(measured)}`);
  }
  assert.equal(measured[0].fast, 0);
  assert.ok(measured[1].fast < measured[2].fast && measured[2].fast < measured[4].fast, JSON.stringify(measured));
});

const telemetry = page => page.evaluate(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev));
const sum = list => list.reduce((a, b) => a + b, 0);

test('the age band picks the first tier, the title world follows a new player, and finished runs move the tier', async t => {
  const frame = await game(t, { idle: false, embed: { band: '6-7', telemetry: true } }), page = frame.page();
  assert.deepEqual(await frame.evaluate(() => [__game.tier, __game.state]), [1, 'title'], 'a 6-7 guest starts at tier 1');
  await prefs(frame, { band: '10-11', telemetry: true });
  assert.equal(await frame.evaluate(() => __game.tier), 3, 'a 10-11 guest gets a tier-3 world on the title at once');
  // A 10-11 guest who crashes at once twice is eased down to tier 2.
  assert.deepEqual(await frame.evaluate(() => {
    const g = __game, seen = [];
    g.start(); seen.push(g.tier);
    g.kill('car'); g.step(2); g.press('KeyR'); seen.push(g.tier);
    g.kill('car'); g.step(2); g.press('Escape'); seen.push(g.tier, g.state);
    return seen;
  }), [3, 3, 2, 'title']);
  // A 6-7 guest (their own level) who reaches the par twice is lifted to tier 2.
  await prefs(frame, { band: '6-7', telemetry: true });
  const up = await frame.evaluate(() => {
    const g = __game, seen = [g.tier], scores = [];
    for (let run = 0; run < 2; run++) {
      if (run) g.press('KeyR'); else g.start();
      g.god(true); // the autopilot is not killed by cars; it still has to find logs
      for (let s = 0; s < 120 && g.state === 'play' && g.score < RHEndless.tier(g.tier).par; s += 2) g.bot(2);
      scores.push(g.score);
      g.god(false); g.kill('car'); g.step(2);
    }
    g.press('KeyR'); seen.push(g.tier);
    return { seen, scores };
  });
  assert.ok(up.scores.every(score => score >= 30), `both runs reached tier 1's par (${up.scores})`);
  assert.deepEqual(up.seen, [1, 2]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:road-hopper:dda')));
  assert.deepEqual(Object.keys(saved).sort(), ['_10-11', '_6-7'], 'each guest band keeps its own level');
  assert.deepEqual(saved['_10-11'].main, [0.217, 2]);
  assert.deepEqual(saved['_6-7'].main, [0.211, 2]);
  // Telemetry: the tier at every round start and end, roads, rivers and rails crossed
  // as hits and the crash as the miss.
  await page.waitForFunction(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev).filter(e => e[0] === 'rs').length >= 5, null, { polling: 50 });
  const events = await telemetry(page), ends = events.filter(e => e[0] === 're');
  assert.deepEqual(events.filter(e => e[0] === 'rs').map(e => e.slice(1)), [['endless', 3], ['endless', 3], ['endless', 1], ['endless', 1], ['endless', 2]]);
  assert.deepEqual(ends.slice(0, 2).map(e => [e[1], e[2], e[4], e[5], e[6], e[7]]), [['e', 'endless', 0, 3, 0, 1], ['e', 'endless', 0, 3, 0, 1]]);
  for (const [i, e] of ends.slice(2).entries()) {
    assert.deepEqual([e[1], e[2], e[4], e[5], e[7]], ['e', 'endless', up.scores[i], 1, 1]);
    assert.ok(e[6] >= 5 && e[6] < e[4], `hazards crossed are hits (${e[6]} of ${e[4]} rows)`);
  }
});

test('the eagle warning is a telemetry cue: the next hop gives a reaction time', async t => {
  const frame = await game(t, { idle: false, embed: { band: '6-7', telemetry: true } }), page = frame.page();
  assert.equal(await frame.evaluate(() => {
    const g = __game, warn = document.getElementById('warn');
    g.start(); g.hop(0, 1); g.step(0.5);
    for (let s = 0; s < 60 && !warn.classList.contains('on'); s += 0.5) g.step(0.5);
    const warned = warn.classList.contains('on');
    g.press('ArrowUp'); g.kill('car'); g.step(2);
    return warned;
  }), true);
  await page.waitForFunction(() => got.some(m => m && m.type === 'sg:telemetry' && m.ev.some(e => e[0] === 're')), null, { polling: 50 });
  const end = (await telemetry(page)).find(e => e[0] === 're');
  assert.deepEqual([end[5], end[7], sum(end[8])], [1, 1, 1], 'tier 1, one miss and one reaction time');
});

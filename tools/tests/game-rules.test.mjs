import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(repo, process.env.SG_ROOT || '.');
let server, browser, paintPage, poolPage;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  const base = server.origin;
  [paintPage, poolPage] = await Promise.all(['paint-grab', 'pool-party'].map(async slug => {
    const page = await context.newPage();
    await page.goto(`${base}/games/${slug}/`);
    return page;
  }));
  await paintPage.evaluate(() => {
    window.paintRules = {
      fixture(n = 20) {
        const w = new PG.World(n, PG.ARENAS[0].bot);
        const a = w.addAgent({ isPlayer: true, turn: PG.PLAYER_TURN });
        a.alive = true;
        return { w, a };
      },
      position(a, x, y) {
        a.x = x + 0.5; a.y = y + 0.5; a.cx = x; a.cy = y;
      },
      trace(w, a, points) {
        for (const [tx, ty] of points) {
          while (a.cx !== tx || a.cy !== ty) {
            const x = a.cx + Math.sign(tx - a.cx), y = a.cy + Math.sign(ty - a.cy);
            a.lx = a.x; a.ly = a.y;
            a.x = x + 0.5; a.y = y + 0.5;
            w.enter(a, x, y); w.resolve();
            if (!a.alive) throw new Error('fixture crossed its own trail');
          }
        }
      },
      countsAgree(w) {
        return w.agents.slice(1).every(a => {
          let cells = 0, sumX = 0, sumY = 0;
          w.owner.forEach((id, c) => { if (id === a.id) { cells++; sumX += c % w.N; sumY += Math.floor(c / w.N); } });
          return a.cells === cells && a.sumX === sumX && a.sumY === sumY;
        });
      }
    };
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('Paint Grab fills a large loop reached with normal movement, not its exterior', async () => {
  const result = await paintPage.evaluate(() => {
    const { w, a } = paintRules.fixture(PG.N);
    // (20,20) is a valid jittered corner spawn; use the real player radius and controls.
    w.spawn(a, 20, 20, 4.8); a.ang = 0; a.target = 0; w.events.length = 0;
    const route = [[130.5, 20.5], [130.5, 130.5], [20.5, 130.5], [20.5, 20.5]];
    let waypoint = 0;
    for (let i = 0; i < PG.MATCH_TIME * 60 && a.alive && waypoint < route.length; i++) {
      const target = route[waypoint];
      a.target = Math.atan2(target[1] - a.y, target[0] - a.x);
      w.step(1 / 60);
      if (w.events.some(e => e.type === 'capture')) break;
      if (Math.hypot(target[0] - a.x, target[1] - a.y) < 0.3) waypoint++;
    }
    return {
      elapsed: w.time, alive: a.alive, interior: w.owner[50 * w.N + 50], exterior: w.owner[w.N + 1],
      captures: w.events.filter(e => e.type === 'capture').length,
      percent: w.pct(a), countsAgree: paintRules.countsAgree(w)
    };
  });
  assert.equal(result.alive, true);
  assert.equal(result.captures, 1);
  assert.ok(result.elapsed > 50 && result.elapsed < 55);
  assert.equal(result.interior, 1);
  assert.equal(result.exterior, 0);
  assert.ok(result.percent > 50);
  assert.equal(result.countsAgree, true);
});

test('Paint Grab closes small loops through existing territory, including a board edge', async () => {
  const results = await paintPage.evaluate(() => {
    return [false, true].map(atEdge => {
      const { w, a } = paintRules.fixture();
      const left = atEdge ? 0 : 3, right = left + 6;
      // Existing territory supplies the left side; the excursion supplies the other three.
      for (let y = 3; y <= 9; y++) w.setOwner(y * w.N + left, a.id);
      paintRules.position(a, left, 3);
      paintRules.trace(w, a, [[right, 3], [right, 9], [left, 9]]);
      return {
        interior: w.owner[5 * w.N + left + 2], exterior: w.owner[15 * w.N + 15],
        cells: a.cells, captures: w.events.filter(e => e.type === 'capture').length,
        trail: a.trail.length, countsAgree: paintRules.countsAgree(w)
      };
    });
  });
  for (const result of results) {
    assert.deepEqual(result, { interior: 1, exterior: 0, cells: 49, captures: 1, trail: 0, countsAgree: true });
  }
});

test('Paint Grab preserves smaller wall cuts and deterministic equal-area ties', async () => {
  const results = await paintPage.evaluate(() => {
    return [3, 5].map(row => {
      const { w, a } = paintRules.fixture(11);
      // Reconnect two territory pieces with one trail cell across the board.
      for (let x = 0; x < w.N; x++) if (x !== 5) w.setOwner(row * w.N + x, a.id);
      const gap = row * w.N + 5;
      w.trail[gap] = a.id; a.trail.push(gap);
      w.capture(a);
      return { top: w.owner[0], bottom: w.owner[w.NN - 1], countsAgree: paintRules.countsAgree(w) };
    });
  });
  assert.deepEqual(results, [
    { top: 1, bottom: 0, countsAgree: true },
    { top: 0, bottom: 1, countsAgree: true }
  ]);
});

test('Paint Grab fills the single remaining region when a trail closes the owned perimeter', async () => {
  const result = await paintPage.evaluate(() => {
    const { w, a } = paintRules.fixture(12), gap = 6 * w.N;
    for (let c = 0; c < w.NN; c++) {
      const x = c % w.N, y = Math.floor(c / w.N);
      if ((x === 0 || x === w.N - 1 || y === 0 || y === w.N - 1) && c !== gap) w.setOwner(c, a.id);
    }
    w.trail[gap] = a.id; a.trail.push(gap);
    const before = a.cells;
    w.capture(a);
    return { cells: a.cells, allOwned: w.owner.every(id => id === a.id), gained: w.events[0].gained, expectedGain: w.NN - before, countsAgree: paintRules.countsAgree(w) };
  });
  assert.equal(result.cells, 144);
  assert.equal(result.allOwned, true);
  assert.equal(result.gained, result.expectedGain);
  assert.equal(result.countsAgree, true);
});

test('Paint Grab leaves open excursions unclaimed and does not fill outside an unenclosed connection', async () => {
  const result = await paintPage.evaluate(() => {
    const { w, a } = paintRules.fixture();
    w.setOwner(3 * w.N + 3, a.id); w.setOwner(3 * w.N + 8, a.id);
    paintRules.position(a, 3, 3);
    paintRules.trace(w, a, [[6, 3]]);
    const open = { cells: a.cells, trail: a.trail.length, captures: w.events.filter(e => e.type === 'capture').length };
    paintRules.trace(w, a, [[8, 3]]);
    return { open, closedCells: a.cells, outside: w.owner[0], countsAgree: paintRules.countsAgree(w) };
  });
  assert.deepEqual(result, { open: { cells: 2, trail: 3, captures: 0 }, closedCells: 6, outside: 0, countsAgree: true });
});

test('Paint Grab transfers enclosed ownership and eliminates only fully swallowed opponents once', async () => {
  const result = await paintPage.evaluate(() => {
    const { w, a } = paintRules.fixture();
    const inside = w.addAgent({}), outside = w.addAgent({});
    inside.alive = outside.alive = true;
    w.setOwner(3 * w.N + 3, a.id);
    w.setOwner(5 * w.N + 5, inside.id);
    w.setOwner(16 * w.N + 16, outside.id);
    const enemyTrail = 15 * w.N + 16;
    w.trail[enemyTrail] = inside.id; inside.trail.push(enemyTrail);
    paintRules.position(a, 3, 3);
    paintRules.trace(w, a, [[12, 3], [12, 12], [3, 12], [3, 3]]);
    w.resolve();
    const capture = w.events.find(e => e.type === 'capture');
    return {
      insideAlive: inside.alive, outsideAlive: outside.alive, outsideCells: outside.cells,
      cells: a.cells, kills: a.kills, deaths: w.events.filter(e => e.type === 'die').length,
      enemyTrail: w.trail[enemyTrail], gained: capture.gained,
      uniqueChanges: new Set(capture.cells).size === capture.cells.length, countsAgree: paintRules.countsAgree(w)
    };
  });
  assert.deepEqual(result, {
    insideAlive: false, outsideAlive: true, outsideCells: 1, cells: 100, kills: 1, deaths: 1,
    enemyTrail: 0, gained: 99, uniqueChanges: true, countsAgree: true
  });
});

test('Paint Grab gives every bot its own colour, never the player\'s or its look-alike', async () => {
  const result = await paintPage.evaluate(() => {
    const bad = [];
    // the default player colour is pink (0); coral (6) is the bot colour that looks like it
    for (let i = 0; i < 20; i++) {
      document.getElementById(i ? 'bRestart' : 'bPlay').click();
      const bots = __game.botColors();
      if (bots.length !== 8 || new Set(bots).size !== 8 || bots.includes(0) || bots.includes(6)) bad.push(bots.join());
    }
    document.getElementById('bMenu').click();
    const title = __game.botColors();
    return { bad, state: __game.state, titleBots: title.length, titleColours: new Set(title).size };
  });
  assert.deepEqual(result, { bad: [], state: 'title', titleBots: 9, titleColours: 9 });
});

test('Paint Grab boots from a malformed save and keeps progress when a write fails', async t => {
  const page = await paintPage.context().newPage();
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('sg:paint-grab:save', JSON.stringify({ arena: 9, best: 3, skin: { c: 99, f: -1, p: 2.5 } })));
  await page.goto(`${server.origin}/games/paint-grab/`);
  const boot = await page.evaluate(() => {
    document.getElementById('bSkins').click();
    return { state: __game.state, arena: __game.arena(), skin: __game.save.skin, best: __game.save.best };
  });
  const write = await page.evaluate(() => {
    document.getElementById('skDone').click();
    const setItem = Storage.prototype.setItem, panel = document.querySelector('.sg-save-status');
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    document.getElementById('bPlay').click();
    const failed = { hidden: panel.hidden, state: panel.dataset.state, best: __game.save.best };
    Storage.prototype.setItem = setItem;
    panel.querySelector('button').click();
    return { failed, retried: panel.dataset.state, stored: JSON.parse(localStorage.getItem('sg:paint-grab:save')).skin };
  });
  await page.evaluate(() => localStorage.removeItem('sg:paint-grab:save'));
  assert.deepEqual(errors, []);
  assert.deepEqual(boot, { state: 'skins', arena: 0, skin: { c: 0, f: 0, p: 0 }, best: 3 });
  assert.deepEqual(write, { failed: { hidden: false, state: 'failed', best: 3 }, retried: 'saved', stored: { c: 0, f: 0, p: 0 } });
});

// The next two use a running game loop (the shared page above has requestAnimationFrame disabled).
async function livePaintPage(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  await page.goto(`${server.origin}/games/paint-grab/`);
  return page;
}

test('Paint Grab offers a newly opened arena after the round and preselects it in the menu', async t => {
  const page = await livePaintPage(t);
  const finish = async () => {
    await page.evaluate(() => { __game.grab(30); __game.setTime(0.1); });
    await page.waitForFunction(() => __game.state === 'over', null, { timeout: 60000 });
    return page.evaluate(() => ({ arena: __game.arena(), next: !document.getElementById('bNext').hidden }));
  };
  await page.evaluate(() => document.getElementById('bPlay').click());
  const first = await finish();
  await page.evaluate(() => document.getElementById('bOverMenu').click());
  const menu = await page.evaluate(() => ({ arena: __game.arena(), selected: [...document.querySelectorAll('.arena')].findIndex(b => b.classList.contains('sel')) }));
  await page.evaluate(() => { __game.arena(0); document.getElementById('bPlay').click(); });
  const again = await finish();
  await page.evaluate(() => document.getElementById('bNext').click());
  const next = await page.evaluate(() => ({ arena: __game.arena(), state: __game.state }));
  assert.deepEqual({ first, menu, again, next }, {
    first: { arena: 0, next: true }, menu: { arena: 1, selected: 1 },
    again: { arena: 0, next: true }, next: { arena: 1, state: 'play' }
  });
});

test('Paint Grab keeps arrow-key steering when the mouse is only bumped', async t => {
  const page = await livePaintPage(t);
  await page.mouse.move(700, 600);
  await page.evaluate(() => document.getElementById('bPlay').click());
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => __game.player.target === 0);
  await page.keyboard.up('ArrowRight');
  await page.mouse.move(706, 600);
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => __game.player.target), 0, 'a 6 px bump must not steer');
  await page.mouse.move(640, 30);
  await page.waitForFunction(() => __game.player.target < -0.5, null, { timeout: 15000 });
});

test('Pool Party rejects the 8 before the final target using actual pocket-event physics', async () => {
  const results = await poolPage.evaluate(() => {
    const P = PoolPhysics, lv = PoolLevels[9];
    return [true, false].map(eightFirst => {
      const st = P.fromLayout([
        { n: 0, x: 400, y: 400 }, { n: 1, x: 500, y: 400 }, { n: 2, x: 550, y: 400 },
        { n: 3, x: 640, y: eightFirst ? 520 : 580 }, { n: 8, x: 640, y: eightFirst ? 220 : 280 }
      ]);
      P.ball(st, 1).on = P.ball(st, 2).on = false;
      P.shoot(st, 0, 0, 0, 0, false);
      P.ball(st, 8).vy = -400; P.ball(st, 3).vy = 400;
      for (let i = 0; i < 1200 && P.moving(st); i++) P.step(st, 1 / 60);
      return { pots: st.shot.pots, status: PoolLevels.judge(lv, { shotsUsed: 3 }, st.shot, st).status };
    });
  });
  assert.deepEqual(results.map(r => r.pots.map(p => p.n)), [[8, 3], [3, 8]]);
  for (const result of results) assert.ok(result.pots[0].t < result.pots[1].t);
  assert.deepEqual(results.map(r => r.status), ['fail', 'win']);
});

test('Pool Party enforces strict 8-last chronology across prior shots, ties, and timestamp-less fixtures', async () => {
  const results = await poolPage.evaluate(() => {
    const cases = [
      { pots: [{ n: 3, t: 1 }, { n: 8, t: 2 }], expected: 'win' },
      { pots: [{ n: 8, t: 2 }], expected: 'win' },
      { pots: [{ n: 8, t: 1 }], on: [3], expected: 'fail' },
      { pots: [{ n: 3, t: 2 }], expected: 'fail' }, // 8 was down before this shot
      { pots: [{ n: 3, t: 1 }, { n: 8, t: 1 }], expected: 'fail' },
      { pots: [{ n: 8, t: 1 }, { n: 3, t: 1 }], expected: 'fail' },
      { pots: [{ n: 8, t: 2 }, { n: 3, t: 1 }], expected: 'win' }, // timestamps, not array position
      { pots: [{ n: 3, t: 2 }, { n: 8, t: 1 }], expected: 'fail' },
      { pots: [{ n: 3, t: 1 }, { n: 8, t: 1.000001 }], expected: 'win' }, // same frame is not a tie
      { pots: [1, 2, 3, 8].map(n => ({ n })), expected: 'win' },
      { pots: [{ n: 8 }, { n: 3 }], expected: 'fail' },
      { pots: [{ n: 3, t: 1 }], on: [8], expected: 'go' }
    ];
    return cases.map(c => {
      const st = PoolLevels.makeState(PoolLevels[9], PoolPhysics);
      st.balls.forEach(b => { b.on = b.n === 0 || (c.on || []).includes(b.n); });
      const before = JSON.stringify(c.pots);
      const status = PoolLevels.judge(PoolLevels[9], { shotsUsed: 3 }, { pots: c.pots }, st).status;
      return { status, expected: c.expected, unchanged: JSON.stringify(c.pots) === before };
    });
  });
  for (const [i, result] of results.entries()) {
    assert.equal(result.status, result.expected, `chronology case ${i}`);
    assert.equal(result.unchanged, true);
  }
});

test('Pool Party retains scratch, forbidden-ball, pocket, bank, and shot-limit rules', async () => {
  const results = await poolPage.evaluate(() => {
    const cases = [
      { index: 9, pots: [{ n: 0 }, { n: 8, t: 2 }], expected: 'fail' },
      { index: 4, pots: [{ n: 8 }], on: [6], expected: 'fail' },
      { index: 1, pots: [{ n: 2, pocket: 0 }], expected: 'fail' },
      { index: 1, pots: [{ n: 2, pocket: 5 }], expected: 'win' },
      { index: 4, pots: [{ n: 6, cush: 0 }], on: [8], expected: 'fail' },
      { index: 4, pots: [{ n: 6, cush: 1 }], on: [8], expected: 'win' },
      { index: 2, pots: [], on: [3, 11], shots: 1, expected: 'go' },
      { index: 2, pots: [], on: [3, 11], shots: 2, expected: 'fail' }
    ];
    return cases.map(c => {
      const lv = PoolLevels[c.index], st = PoolLevels.makeState(lv, PoolPhysics);
      st.balls.forEach(b => { b.on = b.n === 0 || (c.on || []).includes(b.n); });
      return { status: PoolLevels.judge(lv, { shotsUsed: c.shots || 1 }, { pots: c.pots }, st).status, expected: c.expected };
    });
  });
  for (const [i, result] of results.entries()) assert.equal(result.status, result.expected, `existing rule case ${i}`);
});

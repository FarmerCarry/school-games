// Air Hockey 3D (هوكي الهواء): pure engine/AI physics + real Chromium gameplay checks.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;

const AHEngine = require(path.join(repo, 'games/air-hockey/engine.js'));
const AHAI = require(path.join(repo, 'games/air-hockey/ai.js'));
const AHData = require(path.join(repo, 'games/air-hockey/data.js'));

const T = AHEngine.T;

test('AHEngine: continuous collision prevents fast puck tunneling through walls or mallets', () => {
  const w = AHEngine.create({ target: 7, powerUps: false, seed: 42 });
  w.phase = 'play';
  w.phaseT = 0;
  // Launch puck horizontally at max speed toward the right wall
  const p = w.pucks[0];
  p.alive = true;
  p.x = T.HW - p.r - 5;
  p.y = 0;
  p.vx = T.MAX_PUCK;
  p.vy = 0;
  AHEngine.step(w, 0.05, [{ x: 0, y: 320, spd: 2000 }, { x: 0, y: -320, spd: 2000 }]);
  assert.ok(p.x <= T.HW - p.r + 0.5, `puck tunneled right wall: x=${p.x}`);
  assert.ok(p.vx < 0, `puck should bounce left: vx=${p.vx}`);
  assert.ok(w.events.some(e => e.type === 'wall'));

  // Launch fast puck directly into stationary bottom mallet
  p.x = 0; p.y = 120; p.vx = 0; p.vy = T.MAX_PUCK;
  w.mallets[0].x = 0; w.mallets[0].y = 260; w.mallets[0].px = 0; w.mallets[0].py = 260;
  let hit = false;
  for (let i = 0; i < 6; i++) {
    AHEngine.step(w, 1 / 60, [{ x: 0, y: 260, spd: 2600 }, { x: 0, y: -320, spd: 2600 }]);
    if (w.events.some(e => e.type === 'hit')) hit = true;
  }
  assert.ok(hit, 'fast puck must collide with mallet instead of tunneling');
  assert.ok(p.vy < 0, `puck should rebound upward off bottom mallet: vy=${p.vy}`);
  assert.ok(p.y < w.mallets[0].y, 'puck must stay in front of mallet');
});

test('AHEngine: mallet strike transfers velocity and scores when puck enters goal', () => {
  const w = AHEngine.create({ target: 3, powerUps: false, seed: 7 });
  w.phase = 'play';
  const p = w.pucks[0];
  p.alive = true; p.x = 0; p.y = 200; p.vx = 0; p.vy = 0;
  w.mallets[0].x = 0; w.mallets[0].y = 300; w.mallets[0].px = 0; w.mallets[0].py = 300;
  // Smash upward into puck
  let struck = false;
  for (let i = 0; i < 15 && !struck; i++) {
    AHEngine.step(w, 1 / 60, [{ x: 0, y: 120, spd: 2600 }, { x: 0, y: -380, spd: 0 }]);
    if (w.events.some(e => e.type === 'hit')) struck = true;
  }
  assert.ok(struck, 'mallet moving into resting puck must strike it');
  assert.ok(p.vy < -200, `puck should launch upward: vy=${p.vy}`);

  // Send puck cleanly into top goal (side 1 defends y = -HL)
  p.x = 0; p.y = -T.HL + 40; p.vx = 0; p.vy = -1400; p.last = 0;
  let scored = false;
  for (let i = 0; i < 12; i++) {
    AHEngine.step(w, 1 / 60, [{ x: 0, y: 320, spd: 0 }, { x: 200, y: -320, spd: 0 }]);
    if (w.events.some(e => e.type === 'goal')) scored = true;
  }
  assert.ok(scored, 'puck crossing top goal line must score');
  assert.equal(w.score[0], 1, 'bottom player (0) scores when puck enters top goal');
  assert.equal(w.phase, 'goal');
});

test('AHEngine: power-ups (multi, big, mini) apply cleanly and AHAI tracks pucks', () => {
  const w = AHEngine.create({ target: 7, powerUps: true, seed: 99 });
  w.phase = 'play';
  const p = w.pucks[0];
  p.alive = true; p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.last = 0;
  for (const kind of AHEngine.KINDS) {
    w.item.alive = true; w.item.kind = kind; w.item.x = 0; w.item.y = 0; w.item.t = 0;
    AHEngine.step(w, 1 / 60, [{ x: 0, y: 320, spd: 0 }, { x: 0, y: -320, spd: 0 }]);
    assert.ok(w.events.some(e => e.type === 'power' && e.a === kind), `power-up ${kind} should activate`);
    if (kind === 'multi') assert.ok(AHEngine.aliveCount(w) >= 2, 'multi adds extra puck');
    if (kind === 'big') assert.ok(w.mallets[0].bigT > 0, 'big activates large mallet timer');
    if (kind === 'mini') assert.ok(w.goals[0].miniT > 0, 'mini activates narrow goal timer');
  }

  const ai = AHAI.create(1, 0.6, 5);
  const ctrl = { x: 0, y: -300, spd: 0 };
  p.alive = true; p.x = 120; p.y = -180; p.vx = 40; p.vy = -300;
  for (let i = 0; i < 15; i++) AHAI.think(ai, w, 1 / 60, ctrl);
  assert.ok(ctrl.x > 20, `AI should track incoming puck toward +x, got x=${ctrl.x}`);
  assert.ok(ctrl.spd > 0);
  assert.ok(AHData.LADDER.length >= 4 && AHData.TABLES.length >= 3);

  // Wave 2 balance checks: snappy serve/goal timers, 5-goal duo, looser rung 0-1 defense
  const fresh = AHEngine.create({ seed: 1 });
  assert.equal(fresh.firstServe, 0.9);
  assert.equal(+(fresh.goalDelay + fresh.serveDelay).toFixed(2), 1.0);
  assert.equal(AHData.DUO_GOALS, 5);
  const easyAi = AHAI.create(1, 0.1, 5), sharpAi = AHAI.create(1, 0.6, 5);
  const cEasy = { x: 0, y: 0, spd: 0 }, cSharp = { x: 0, y: 0, spd: 0 };
  p.alive = true; p.x = 0; p.y = 100; p.vx = 0; p.vy = 200; // moving away from top goal -> home mode
  AHAI.think(easyAi, w, 0.5, cEasy);
  AHAI.think(sharpAi, w, 0.5, cSharp);
  assert.ok(Math.abs(cEasy.y) < Math.abs(cSharp.y) - 30, `beginner AI should not camp tight on goal line (easy y=${cEasy.y}, sharp y=${cSharp.y})`);
});

let browser, server;
before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test('Air Hockey 3D browser: title, play, mouse & keyboard control, pause/resume/restart, 2P and skins', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${server.origin}/games/air-hockey/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__game && window.__game.state().screen === 'title', null, { timeout: 15000 });

    // Open skins and go back
    await page.click('#btnSkins');
    await page.waitForFunction(() => window.__game.state().screen === 'skins');
    await page.click('#btnSkinsBack');
    await page.waitForFunction(() => window.__game.state().screen === 'title');

    // Start 1P match
    await page.click('#btnPlay');
    await page.waitForFunction(() => window.__game.state().screen === 'play' && !window.__game.state().paused);

    // Move mallet with pointer over the table (cursor stays visible, no hide-cursor class)
    const before = await page.evaluate(() => window.__game.state().mallets[0]);
    const target = await page.evaluate(() => window.__game.tablePoint(140, 260));
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.waitForFunction(bx => Math.abs(window.__game.state().mallets[0][0] - bx) > 15, before[0], { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.body.classList.contains('hide-cursor')), false, 'cursor must stay visible');

    // Pause, resume, restart
    await page.click('#pauseBtn');
    await page.waitForFunction(() => window.__game.state().paused);
    const tPaused = await page.evaluate(() => window.__game.state().t);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__game.state().t), tPaused, 'time freezes while paused');
    await page.click('#btnResume');
    await page.waitForFunction(() => !window.__game.state().paused);
    await page.click('#pauseBtn');
    await page.waitForFunction(() => window.__game.state().paused);
    await page.click('#btnRestart');
    await page.waitForFunction(() => !window.__game.state().paused && window.__game.state().score.every(n => n === 0));

    // Return home and start 2P match
    await page.click('#pauseBtn');
    await page.waitForFunction(() => window.__game.state().paused);
    await page.click('#btnHome');
    await page.waitForFunction(() => window.__game.state().screen === 'title');
    await page.click('#btnDuo');
    await page.waitForFunction(() => window.__game.state().screen === 'play' && window.__game.state().mode === 'duo');
    // In 2P duo, P1 mouse must not dominate; keyboard moves P1 fairly
    const duoStart = await page.evaluate(() => window.__game.state().mallets[0][0]);
    const duoPt = await page.evaluate(() => window.__game.tablePoint(160, 260));
    await page.mouse.move(duoPt.x, duoPt.y, { steps: 6 });
    await page.waitForTimeout(180);
    const afterDuoMouse = await page.evaluate(() => window.__game.state().mallets[0][0]);
    assert.ok(Math.abs(afterDuoMouse - duoStart) < 2, `2P duo must disable P1 mouse dominance (moved ${(afterDuoMouse - duoStart).toFixed(1)})`);
    await page.keyboard.down('KeyD');
    await page.waitForFunction(bx => window.__game.state().mallets[0][0] > bx + 15, duoStart, { timeout: 5000 });
    await page.keyboard.up('KeyD');

    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join('; ')}`);
  } finally {
    await ctx.close();
  }
});

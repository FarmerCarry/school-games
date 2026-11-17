// End-to-end Chromium tests for Egg Rush (سباق البيض: Turbo Dino & Robo-Coop Heist!).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;

let browser, server;
before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function openGame(t, { saved, failSave = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'expected zero console/page errors');
  });

  await page.addInitScript(({ saved, failSave }) => {
    if (saved !== undefined && !sessionStorage.getItem('er-seeded')) {
      sessionStorage.setItem('er-seeded', '1');
      localStorage.setItem('sg:egg-rush:save', saved);
    }
    let kit;
    const er = (window.er = { failSave: !!failSave });
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          er.step = (n = 1) => {
            for (let i = 0; i < n; i++) {
              update(1 / 60);
              if (render) render(0);
            }
          };
          return { stop() {} };
        };
      }
    });
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:egg-rush:save' && er.failSave) {
        throw new DOMException('Simulated full storage', 'QuotaExceededError');
      }
      return origSet.apply(this, arguments);
    };
  }, { saved, failSave });

  await page.goto(`${server.origin}/games/egg-rush/`);
  await page.waitForFunction(() => window.__game && window.er && window.er.step);
  return page;
}

const g = (page, expr) => page.evaluate(new Function('return (' + expr + ');'));
const step = (page, n = 1) => page.evaluate(n => window.er.step(n), n);
const focusCanvas = page => page.evaluate(() => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  document.getElementById('game').focus();
});

const makeSave = (extra = {}) => JSON.stringify({
  v: 3,
  coins: 0,
  stars: Array(12).fill(0),
  best: Array(12).fill(0),
  skins: [0],
  skin: 0,
  diff: 'normal',
  world: 0,
  stage: 0,
  coached: true,
  ...extra
});

test('Arabic RTL title unlocks all 4 worlds; Play opens stage 1 with intro card; Arrows, WASD, and Space Dash + Decoy work', async t => {
  const page = await openGame(t);
  await step(page, 20);

  assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await g(page, '__game.screen'), 'title');
  assert.equal(await page.locator('#worldGrid .er-wcard').count(), 4, 'all 4 worlds visible and unlocked');

  // Select World 3 then back to World 1 Stage 1 to verify open world selection from start
  await page.locator('#worldGrid .er-wcard[data-world="2"]').click();
  assert.equal(await g(page, '__game.stageId'), 'w3s1');
  await page.locator('#worldGrid .er-wcard[data-world="0"]').click();
  assert.equal(await g(page, '__game.stageId'), 'w1s1');

  await page.locator('#btnPlay').click();
  await step(page, 2);
  assert.equal(await g(page, '__game.screen'), 'play');
  assert.equal(await g(page, '__game.level'), 'w1s1');
  assert.equal(await g(page, '__game.intro'), true, 'first run shows quick visual intro card');
  assert.equal(await g(page, '__game.atStart'), true);

  // Simulation waits while intro card is up
  await step(page, 40);
  assert.equal(await g(page, '__game.time'), 0);

  // Holding ArrowRight immediately dismisses intro AND walks P1 right to snatch first egg!
  await focusCanvas(page);
  const startX = await g(page, '__game.px');
  await page.keyboard.down('ArrowRight');
  await step(page, 45);
  await page.keyboard.up('ArrowRight');

  assert.equal(await g(page, '__game.intro'), false);
  assert.equal(await g(page, '__game.atStart'), false);
  assert.ok((await g(page, '__game.px')) > startX + 180, 'walked right across open lane');
  assert.equal(await g(page, '__game.carrying'), 1, 'snatched first egg along rightward lane');

  // WASD moves vertically and Space triggers Turbo Dash + Squeaky Decoy Duck
  const y0 = await g(page, '__game.py');
  await page.keyboard.down('KeyS');
  await step(page, 18);
  await page.keyboard.up('KeyS');
  assert.ok((await g(page, '__game.py')) > y0 + 40, 'KeyS moves player down');

  await page.keyboard.press('Space');
  await step(page, 4);
  assert.equal(await g(page, '__game.world.decoys.length'), 1, 'Space drops squeaky decoy duck');
  assert.ok((await g(page, '__game.world.players[0].dashTimer')) > 0, 'Space activates Turbo Dash');
});

test('Pause (#btnPause, P, Escape), frozen snapshot, blur auto-pause, and #btnRestart contract', async t => {
  const page = await openGame(t, { saved: makeSave() });
  await page.locator('#btnPlay').click();
  await focusCanvas(page);

  await page.keyboard.down('ArrowRight');
  await step(page, 35);
  await page.keyboard.up('ArrowRight');
  assert.equal(await g(page, '__game.atStart'), false);

  // Pause via button and verify snapshot stays 100% frozen even with keys held
  await page.locator('#btnPause').click();
  assert.equal(await g(page, '__game.screen'), 'pause');
  const snap = await g(page, '[__game.px, __game.py, __game.time, __game.hatched, __game.guards]');
  await page.keyboard.down('ArrowRight');
  await step(page, 90);
  await page.keyboard.up('ArrowRight');
  const snapAfter = await g(page, '[__game.px, __game.py, __game.time, __game.hatched, __game.guards]');
  assert.deepEqual(snapAfter, snap, 'paused snapshot is 100% frozen');

  // Resume via #btnResume, pause via KeyP, resume via Escape
  await page.locator('#btnResume').click();
  assert.equal(await g(page, '__game.screen'), 'play');
  await focusCanvas(page);
  await page.keyboard.press('KeyP');
  assert.equal(await g(page, '__game.screen'), 'pause');
  await page.keyboard.press('Escape');
  assert.equal(await g(page, '__game.screen'), 'play');

  // Window blur pauses, and focus does NOT auto-resume
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await g(page, '__game.screen'), 'pause');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await g(page, '__game.screen'), 'pause');

  // #btnRestart resets stage cleanly with atStart === true, hatched === 0, !intro
  await page.locator('#btnRestart').click();
  await step(page, 2);
  assert.equal(await g(page, '__game.screen'), 'play');
  assert.equal(await g(page, '__game.atStart'), true);
  assert.equal(await g(page, '__game.hatched'), 0);
  assert.equal(await g(page, '__game.intro'), false);
});

test('1P mouse steering & click dash work, keyboard takes priority, and focused native buttons ignore game keys', async t => {
  const page = await openGame(t, { saved: makeSave() });
  await page.locator('#btnPlay').click();
  await step(page, 2);

  // Click arena at (360, 385) -> dashes & steers P1 rightward
  const targetPt = await page.evaluate(() => window.__game.point(360, 385));
  const x0 = await g(page, '__game.px');
  await page.mouse.click(targetPt.x, targetPt.y);
  await step(page, 30);
  const xAfterMouse = await g(page, '__game.px');
  assert.ok(xAfterMouse > x0 + 140, 'mouse click dashes and steers toward clicked target');

  // Holding ArrowLeft immediately overrides mouse target and walks left
  await focusCanvas(page);
  await page.keyboard.down('ArrowLeft');
  await step(page, 25);
  await page.keyboard.up('ArrowLeft');
  assert.ok((await g(page, '__game.px')) < xAfterMouse - 60, 'keyboard immediately overrides mouse steering');

  // Focusing native mute button and pressing Space toggles mute without triggering in-game decoy/dash
  await page.evaluate(() => {
    window.__game.world.decoys.length = 0;
    window.__game.world.players[0].dashCd = 0;
    window.__game.world.players[0].decoyCd = 0;
    document.querySelector('.sg-mute').focus();
  });
  await page.keyboard.press('Space');
  await step(page, 3);
  assert.equal(await g(page, '__game.world.decoys.length'), 0, 'Space on focused button did not leak into game');
});

test('winning stage persists stars & coins, handles storage QuotaExceededError retry, and unlocks Costume Barn skins', async t => {
  const page = await openGame(t, {
    saved: makeSave({ coins: 20, diff: 'easy' }),
    failSave: true
  });

  await page.locator('#btnPlay').click();
  await focusCanvas(page);

  // Move all 5 goal eggs into P1's conga stack and step into Hatcher Base to complete stage cleanly
  await page.evaluate(() => {
    const w = window.__game.world, p = w.players[0];
    for (let i = 0; i < w.goal; i++) {
      w.eggs[i].state = 'carried';
      w.eggs[i].carrier = 0;
      p.carry.push(w.eggs[i]);
    }
    p.x = p.home.x;
    p.y = p.home.y;
  });
  await step(page, 3);

  assert.equal(await g(page, '__game.screen'), 'result');
  assert.equal(await g(page, '__game.hatched'), 5);
  assert.ok((await g(page, '__game.save.stars[0]')) >= 2, 'recorded stage stars');
  assert.ok((await g(page, '__game.save.coins')) > 20, 'awarded hatch + star coins');

  // Blocked storage surfaces saveStatus failed pill; allowing storage and clicking retry saves cleanly
  const statusPill = page.locator('.sg-save-status');
  assert.equal(await statusPill.getAttribute('data-state'), 'failed');
  await page.evaluate(() => { window.er.failSave = false; });
  await statusPill.click();
  assert.equal(await statusPill.getAttribute('data-state'), 'saved');

  // Open Costume Barn (#btnResShop) and buy "نينجا البيض" (cost 15)
  await page.locator('#btnResShop').click();
  assert.equal(await g(page, '__game.screen'), 'shop');
  const coinsBefore = await g(page, '__game.save.coins');
  await page.locator('button[data-skin="1"]').click();
  assert.equal(await g(page, '__game.save.skin'), 1, 'bought and equipped Ninja outfit');
  assert.equal(await g(page, '__game.save.coins'), coinsBefore - 15);
});

test('2P Egg-Thief Race (vs) drives P1 with WASD+Space and P2 with Arrows+Enter', async t => {
  const page = await openGame(t, { saved: makeSave() });
  await page.locator('#modeBar button[data-mode="vs"]').click();
  await page.locator('#worldGrid .er-wcard[data-world="3"]').click();
  await page.locator('#btnPlay').click();
  await step(page, 2);

  assert.equal(await g(page, '__game.screen'), 'play');
  assert.equal(await g(page, '__game.mode'), 'vs');
  assert.equal(await g(page, '__game.level'), 'w4vs');
  assert.equal(await g(page, '__game.world.players.length'), 2);

  await focusCanvas(page);
  const [p1x0, p2x0] = await g(page, '[__game.world.players[0].x, __game.world.players[1].x]');
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await step(page, 25);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');

  const [p1x1, p2x1] = await g(page, '[__game.world.players[0].x, __game.world.players[1].x]');
  assert.ok(p1x1 > p1x0 + 120, 'P1 dashed right with KeyD + Space');
  assert.ok(p2x1 < p2x0 - 120, 'P2 dashed left with ArrowLeft + Enter');
  assert.equal(await g(page, '__game.world.decoys.length'), 2, 'both players dropped decoy ducks');
});

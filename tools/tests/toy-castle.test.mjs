// Toy Castle: Mega-Mech & Lego-Knight Siege (قلعة الألعاب) — Real Chromium Browser Suite
// Verifies fresh-save #btnPlay -> '1-1', frame-1 Digit1 summon, zero P1 auto-spawn,
// active Roof Cannon mouse + Space aiming/firing, Sky Crate popping, Super Meteor,
// all 12 stages unlocked across 4 worlds, clean 2P shared-keyboard duel (keeping P/R/M/Esc),
// pause freeze & restart, win/DDA/quota recovery, Toy Armory, reduced motion, 1100x620 fit, and zero BGM.
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

const SAVE = (cleared = 0, extra = {}) => ({
  v: 2,
  diff: 'normal',
  coins: 0,
  lv: Array.from({ length: 12 }, (_, i) => ({ s: i < cleared ? 2 : 0, t: i < cleared ? 42 : 0 })),
  armors: [1, 0, 0, 0, 0],
  cannons: [1, 0, 0, 0, 0],
  armor: 0,
  cannon: 0,
  ...extra
});

async function game(t, { save, dda = 0.35, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  ctx.setDefaultTimeout(5000);
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => {
    await ctx.close();
    assert.deepEqual(errors, [], 'no console or page errors');
    assert.deepEqual(requests, [], 'no external network requests');
  });

  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('tc-seeded')) {
      sessionStorage.setItem('tc-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:toy-castle:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const tc = window.tc = { results: [], ends: [], rounds: [], failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          tc.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          tc.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const makeDda = kit.dda;
        kit.dda = (slug, opts) => {
          const ctrl = makeDda.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = ctrl.result;
          ctrl.result = outcome => { tc.results.push(outcome); return origResult.call(ctrl, outcome); };
          return ctrl;
        };
        const origRound = kit.stats.round;
        kit.stats.round = function (id) {
          tc.rounds.push(id);
          return origRound.apply(this, arguments);
        };
        const origEnd = kit.stats.end;
        kit.stats.end = function (...args) {
          tc.ends.push(args);
          return origEnd.apply(this, args);
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:toy-castle:save' && window.tc && window.tc.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/toy-castle/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.tc.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => tc.step(n), n);
const run = (page, n = 1) => page.evaluate(n => tc.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:toy-castle:save');
  return raw ? JSON.parse(raw) : null;
});
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);

test('Title -> #btnPlay opens 1-1 with >=30 energy; P1 never auto-spawns; Digit1 summons on frame 1', async t => {
  const page = await game(t);
  await step(page, 15);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/36');

  // Switch difficulty to سهل on title and confirm persistence
  await page.locator('#titleDiffs [data-diff="easy"]').click();
  assert.equal((await stored(page)).diff, 'easy');

  // #btnPlay starts Stage 1-1 immediately
  await page.locator('#btnPlay').click();
  await step(page, 1);
  const s0 = await state(page);
  assert.equal(s0.screen, 'play');
  assert.equal(s0.id, '1-1');
  assert.ok(s0.energy >= 35, 'starts with >= 35 energy so [1] or [2] is ready at t=0');
  assert.equal(s0.p1Spawned, 0);

  // 6 seconds of zero player input MUST keep p1Spawned === 0!
  await run(page, 360);
  assert.equal((await state(page)).p1Spawned, 0, 'never auto-spawns P1 units');

  // Pressing Digit1 immediately spawns sword knight
  await page.keyboard.press('Digit1');
  await step(page, 1);
  assert.equal((await state(page)).p1Spawned, 1);
});

test('Controllable Roof Cannon (mouse + Space), Sky Crate popping, Unit Cards, Super Meteor & Generator', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page, 1);

  // Aim Roof Cannon via mouse move & fire via canvas click
  const target = await pagePoint(page, 720, 420);
  await page.mouse.move(target.x, target.y);
  await page.mouse.click(target.x, target.y);
  await step(page, 2);
  assert.equal((await state(page)).shots, 1, 'canvas click fires Roof Cannon');

  // Wait for cannon cooldown, tilt barrel with ArrowUp, and fire with Space
  await run(page, 45);
  const aimBefore = (await state(page)).aim;
  await page.keyboard.down('ArrowUp');
  await run(page, 12);
  await page.keyboard.up('ArrowUp');
  assert.ok((await state(page)).aim < aimBefore, 'ArrowUp tilts Roof Cannon upward');
  await page.keyboard.press('Space');
  await step(page, 1);
  assert.equal((await state(page)).shots, 2, 'Space fires Roof Cannon');

  // Advance until first Sky Crate appears (~3.6s total) and click directly on crate to pop it!
  await run(page, 190);
  const cratePos = await page.evaluate(() => {
    const c = __game.world.crates[0];
    return c ? { x: c.x, y: c.y } : null;
  });
  assert.ok(cratePos, 'Sky Energy Crate spawned');
  const eBefore = (await state(page)).energy;
  const cratePt = await pagePoint(page, cratePos.x, cratePos.y);
  await page.mouse.click(cratePt.x, cratePt.y);
  await step(page, 1);
  const afterCrate = await state(page);
  assert.equal(afterCrate.cratesPopped, 1);
  assert.ok(afterCrate.energy > eBefore + 10, 'popping crate grants bonus energy');

  // Upgrade Generator via [6] and summon units via HUD cards
  await run(page, 120);
  await page.keyboard.press('Digit6');
  await step(page, 1);
  assert.equal((await state(page)).genLv, 2, 'Digit6 upgrades Generator to level 2');

  await run(page, 240);
  await page.locator('#card-sword').click();
  await page.locator('#card-rocket').click();
  await page.locator('#card-dino').click();
  await step(page, 2);
  assert.equal((await state(page)).p1Spawned, 3, 'clicking unit cards deploys units');

  // Charge Super Meteor to 100% and unleash via Digit5
  await page.evaluate(() => { __game.world.sides[0].superCharge = 100; });
  await step(page, 1);
  await page.keyboard.press('Digit5');
  await step(page, 1);
  assert.equal((await state(page)).superCharge, 0, 'Digit5 unleashes Super Meteor Barrage');
});

test('All 4 Worlds x 3 Stages (1-1..4-3) are unlocked from the start on the Worlds map', async t => {
  const page = await game(t);
  await page.locator('#btnLevels').click();
  await step(page, 1);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('#worlds .w-col').count(), 4, '4 distinct worlds');
  assert.equal(await page.locator('#worlds .lvl').count(), 12, '12 stages visible');

  // Click final stage 4-3 directly on a fresh save
  await page.locator('#worlds .lvl').nth(11).click();
  await step(page, 1);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '4-3');
  assert.equal(s.worldIdx, 3);
});

test('2P Shared-Keyboard Duel (#btnTwo): symmetrical action, preserves P/R shortcuts, no DDA skew', async t => {
  const page = await game(t);
  await page.locator('#btnTwo').click();
  await step(page, 1);
  const s0 = await state(page);
  assert.equal(s0.screen, 'play');
  assert.equal(s0.humans, 2);
  assert.equal(s0.hpL, s0.hpR);

  // P1 summons via Digit1 & fires via Space; P2 summons via Digit7 + KeyI & fires via Enter
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Space');
  await page.keyboard.press('Digit7');
  await run(page, 40);
  await page.keyboard.press('KeyI');
  await page.keyboard.press('Enter');
  await step(page, 2);
  const sMid = await state(page);
  assert.equal(sMid.p1Spawned, 1);
  assert.equal(sMid.p2Spawned, 2);
  assert.equal(sMid.shots, 1);
  assert.equal(sMid.shotsR, 1);

  // KeyP pauses cleanly (NEVER stolen by P2!)
  await page.keyboard.press('KeyP');
  await step(page, 1);
  assert.equal((await state(page)).screen, 'pause');
  await page.keyboard.press('KeyP');
  await step(page, 1);
  assert.equal((await state(page)).screen, 'play');

  // KeyR restarts cleanly (NEVER stolen by P2!)
  await page.keyboard.press('KeyR');
  await step(page, 1);
  const sRes = await state(page);
  assert.equal(sRes.screen, 'play');
  assert.equal(sRes.p1Spawned, 0);
  assert.equal(sRes.p2Spawned, 0);
  assert.ok(sRes.time < 0.2);

  // Finish 2P duel -> reports 'end' to telemetry and does NOT touch 1P DDA
  await page.evaluate(() => { __game.world.sides[1].hp = 5; });
  await page.evaluate(() => {
    window.TCEngine.summon(__game.world, 0, 'sword', { free: true }).x = window.TCEngine.GATE_R - 20;
  });
  await run(page, 30);
  assert.equal((await state(page)).screen, 'result');
  assert.equal(await page.locator('#resTitle').textContent(), 'فاز اللاعب 1!');
  assert.equal((await page.evaluate(() => tc.results.length)), 0, '2P match never mutates 1P DDA');
});

test('Pause freezes snapshot 100%, #btnRestart resets battle, win saves stars/coins & handles QuotaExceededError', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await page.keyboard.press('Digit1');
  await run(page, 30);

  // Pause via #btnPause and verify complete simulation freeze across 60 frames
  await page.locator('#btnPause').click();
  await step(page, 1);
  assert.equal((await state(page)).screen, 'pause');
  const snap1 = await page.evaluate(() => [__game.state.time, __game.state.energy, __game.state.p1Spawned, __game.state.units]);
  await run(page, 60);
  const snap2 = await page.evaluate(() => [__game.state.time, __game.state.energy, __game.state.p1Spawned, __game.state.units]);
  assert.deepEqual(snap2, snap1, 'paused snapshot is 100% frozen');

  // Resume via #btnResume, then pause via blur and restart via #btnRestart
  await page.locator('#btnResume').click();
  await step(page, 5);
  assert.equal((await state(page)).screen, 'play');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).screen, 'pause');
  await page.locator('#btnRestart').click();
  await step(page, 1);
  const afterRestart = await state(page);
  assert.equal(afterRestart.screen, 'play');
  assert.equal(afterRestart.p1Spawned, 0);
  assert.ok(afterRestart.time < 0.2);

  // Win Stage 1-1 while simulating QuotaExceededError, then recover with Retry!
  await page.evaluate(() => {
    tc.failSave = true;
    __game.world.sides[1].hp = 8;
    window.TCEngine.summon(__game.world, 0, 'mech', { free: true }).x = window.TCEngine.GATE_R - 30;
  });
  await run(page, 30);
  assert.equal((await state(page)).screen, 'result');
  assert.equal((await state(page)).winner, 1);
  assert.equal((await page.evaluate(() => tc.results.length)), 1, '1P win updates DDA');

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  await page.evaluate(() => { tc.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  const sv = await stored(page);
  assert.equal(sv.lv[0].s, 3);
  assert.ok(sv.coins >= 40);

  // Press Enter on result screen to advance to Stage 1-2!
  await page.keyboard.press('Enter');
  await step(page, 1);
  assert.equal((await state(page)).id, '1-2');

  // Corrupted save string recovers cleanly
  const broken = await game(t, { save: 'corrupt{{{json' });
  assert.equal((await state(broken)).screen, 'title');
  assert.equal(await broken.locator('#titleStars b').textContent(), '0/36');
});

test('Toy Armory (#scrShop), 1100x620 viewport fit, mute toggle, and reduced motion', async t => {
  const page = await game(t, { save: SAVE(3, { coins: 70 }), reducedMotion: 'reduce', size: [1100, 620] });
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);

  for (const sel of ['#btnPlay', '#btnTwo', '#btnLevels', '#btnShop', '.howto .card >> nth=0', '.howto .card >> nth=3']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(
      b.x >= canvasBox.x - 1 &&
      b.x + b.width <= canvasBox.x + canvasBox.width + 1 &&
      b.y + b.height <= canvasBox.y + canvasBox.height + 1,
      sel + ' fits inside scaled canvas at 1100x620'
    );
  }

  // Open Armory, reject unaffordable Golden Armor (110), buy Cyber Armor (30) & Plasma Cannon (30)
  await page.locator('#btnShop').click();
  await step(page, 1);
  assert.equal((await state(page)).screen, 'armory');

  await page.locator('#shelfArmors .tile').nth(4).click();
  assert.equal((await page.evaluate(() => __game.save.armor)), 0);

  await page.locator('#shelfArmors .tile').nth(1).click();
  await page.locator('#shelfCannons .tile').nth(1).click();
  const sv = await stored(page);
  assert.equal(sv.armor, 1);
  assert.equal(sv.cannon, 1);
  assert.equal(sv.coins, 10);

  // Escape back to title; mute via .sg-mute and KeyM
  await page.keyboard.press('Escape');
  await step(page, 1);
  assert.equal((await state(page)).screen, 'title');
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);

  // Reduced motion keeps fx === 0 and shake === 0 during active battle
  await page.locator('#btnPlay').click();
  await step(page, 1);
  const trayBox = await page.locator('#tray1p').boundingBox();
  assert.ok(trayBox.x >= canvasBox.x && trayBox.x + trayBox.width <= canvasBox.x + canvasBox.width);

  await page.keyboard.press('Digit1');
  await page.keyboard.press('Space');
  await run(page, 45);
  const s = await state(page);
  assert.equal(s.fx, 0, 'zero particle bursts under reduced motion');
  assert.equal(s.shake, 0, 'zero screen shake under reduced motion');
});

test('Zero idle BGM on title and pause screens, and focused button Enter works natively', async t => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  t.after(() => ctx.close());
  await ctx.addInitScript(() => {
    window.__audioStarts = [];
    const hook = (proto, name) => {
      const d = proto && Object.getOwnPropertyDescriptor(proto, name);
      if (!d || typeof d.value !== 'function') return;
      const orig = d.value;
      Object.defineProperty(proto, name, {
        ...d,
        value: function (...args) {
          window.__audioStarts.push([performance.now(), this.constructor.name]);
          return orig.apply(this, args);
        }
      });
    };
    hook(window.AudioScheduledSourceNode?.prototype, 'start');
    hook(window.AudioBufferSourceNode?.prototype, 'start');
    hook(window.HTMLMediaElement?.prototype, 'play');
  });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/toy-castle/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game);

  // Unlock audio via F2 + top-left inert click (3, 3), verify still on title and 0 idle audio starts
  await page.keyboard.press('F2');
  await page.mouse.click(3, 3);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__game.state.screen), 'title');
  await page.evaluate(() => { window.__audioStarts.length = 0; });
  await page.waitForTimeout(750);
  assert.equal(await page.evaluate(() => window.__audioStarts.length), 0, 'zero BGM while idle on title');

  // Focus #btnShop and press Enter -> native click opens Armory
  await page.locator('#btnShop').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__game.state.screen), 'armory');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // Start match, pause, let pause SFX finish, then verify 0 idle audio starts on pause screen
  await page.locator('#btnPlay').click();
  await page.waitForTimeout(150);
  await page.locator('#btnPause').click();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__game.state.screen), 'pause');
  await page.evaluate(() => { window.__audioStarts.length = 0; });
  await page.waitForTimeout(750);
  assert.equal(await page.evaluate(() => window.__audioStarts.length), 0, 'zero BGM while idle on pause');
});

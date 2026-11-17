// Recess Kitchen (games/recess-kitchen/) in real Chromium: 1P keyboard & click-to-dash
// cooking, auto-stacking & Burger-Cannon serving, non-silent Arabic hint bubbles,
// Mini Sous-Bot assist, 3 difficulties (Easy no-burn, Hero VIP 2x), 12 open stages,
// 2P co-op independent controls & telemetry, pause freeze, restart, Chef Locker aprons &
// hats, storage quota retry banner, reduced motion, native HTML control keyboard isolation,
// and zero idle background music.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { testNativeControlGame } from '../regressions-keyboard.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const SAVE = (open = 0, extra = {}) => ({
  v: 2,
  lv: Array.from({ length: 12 }, (_, i) => ({ s: i < open ? 2 : 0, best: i < open ? 95 : 0 })),
  coins: 0,
  aprons: [1, 0, 0, 0],
  hats: [1, 0, 0, 0],
  apron: 0,
  hat: 0,
  difficulty: 'normal',
  ...extra
});

async function game(t, { save, dda = 0.35, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
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
    if (!sessionStorage.getItem('rk-seeded')) {
      sessionStorage.setItem('rk-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:recess-kitchen:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const rk = window.rk = { results: [], rounds: [], ends: [], hits: 0, misses: 0, failSave: false, draws: 0, audioStarts: 0 };

    // Count scheduled WebAudio sources for zero-BGM check
    const origStart = window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype.start;
    if (origStart) {
      window.AudioScheduledSourceNode.prototype.start = function () {
        rk.audioStarts++;
        return origStart.apply(this, arguments);
      };
    }

    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          rk.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          rk.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          rk.renderOnly = () => render(0);
          return { stop() {} };
        };
        const makeDda = kit.dda;
        kit.dda = (slug, opts) => {
          const ctrl = makeDda.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origRes = ctrl.result;
          ctrl.result = outcome => { rk.results.push(outcome); return origRes.call(ctrl, outcome); };
          return ctrl;
        };
        if (kit.stats) {
          const origRound = kit.stats.round;
          const origEnd = kit.stats.end;
          kit.stats.round = id => { rk.rounds.push(id); return origRound.call(kit.stats, id); };
          kit.stats.end = function (outcome, score) {
            rk.ends.push({ outcome, score, argc: arguments.length });
            return origEnd.apply(kit.stats, arguments);
          };
        }
        if (kit.track) {
          const origHit = kit.track.hit;
          const origMiss = kit.track.miss;
          kit.track.hit = () => { rk.hits++; return origHit.call(kit.track); };
          kit.track.miss = () => { rk.misses++; return origMiss.call(kit.track); };
        }
      }
    });

    const origSave = CanvasRenderingContext2D.prototype.save;
    CanvasRenderingContext2D.prototype.save = function () {
      if (this.canvas && this.canvas.id === 'game') rk.draws++;
      return origSave.apply(this, arguments);
    };

    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:recess-kitchen:save' && window.rk && window.rk.failSave) {
        throw new DOMException('Quota exceeded fixture', 'QuotaExceededError');
      }
      return origSetItem.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/recess-kitchen/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.rk && window.rk.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const stations = page => page.evaluate(() => __game.stations);
const step = (page, n = 1) => page.evaluate(n => rk.step(n), n);
const run = (page, n = 1) => page.evaluate(n => rk.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:recess-kitchen:save');
  return raw ? JSON.parse(raw) : null;
});

async function clickStation(page, st, maxFrames = 420) {
  const pt = await page.evaluate(([x, y]) => __game.point(x, y), [st.x, st.y]);
  await page.mouse.click(pt.x, pt.y);
  for (let i = 0; i < maxFrames; i += 6) {
    await run(page, 6);
    const navDone = await page.evaluate(([sx, sy]) => {
      const c = __game.state.chefs[0];
      return c && c.moved && Math.hypot(c.x - sx, c.y - sy) <= 106 && Math.hypot(c.vx, c.vy) === 0;
    }, [st.x, st.y]);
    if (navDone) {
      await run(page, 4);
      return;
    }
  }
}

test('title waits with zero idle audio; all 12 stages open immediately; Play goes straight to 1-1; Chef 1 stays still until input', async t => {
  const page = await game(t);
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/36');
  for (const label of ['شاهد الطلب', 'اشوِ وادمج تلقائياً', 'أطلق بالمدفع!', 'حماس وسرعة مضاعفة']) {
    assert.equal(await page.locator('.howto figcaption', { hasText: label }).isVisible(), true, label);
  }

  // Unlock audio and click top-left (3, 3): stays on title and schedules ZERO background music!
  await page.mouse.click(3, 3);
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  const a0 = await page.evaluate(() => rk.audioStarts);
  await step(page, 180);
  assert.equal(await page.evaluate(() => rk.audioStarts), a0, 'zero audio scheduled while idle on title');

  // Open Kitchens map (#btnLevels): all 12 stages (1-1 .. 4-3) are unlocked & clickable immediately!
  await page.locator('#btnLevels').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('#worlds .lv-btn').count(), 12);
  assert.equal(await page.locator('#worlds .lv-btn[disabled]').count(), 0, 'all 12 stages unlocked immediately');
  await page.locator('#mapHome').click();
  await step(page, 2);

  // #btnPlay enters Level 0 ('1-1') directly
  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-1');
  assert.equal(s.players, 1);
  assert.equal(s.atStart, true);

  // Idle for 3 seconds: Chef 1 never moves on its own
  const x0 = s.chefs[0].x, y0 = s.chefs[0].y;
  await run(page, 180);
  s = await state(page);
  assert.equal(s.atStart, true);
  assert.equal(s.chefs[0].x, x0);
  assert.equal(s.chefs[0].y, y0);

  // Pressing ArrowRight moves chefs[0].x strictly right immediately!
  await page.keyboard.down('ArrowRight');
  await step(page, 6);
  await page.keyboard.up('ArrowRight');
  s = await state(page);
  assert.ok(s.chefs[0].x > x0 + 10, `expected right movement: ${s.chefs[0].x} > ${x0}`);
  assert.equal(s.atStart, false);
});

test('1P click-to-cook, auto-stacking burger, non-silent guidance hint, Mini Sous-Bot, and Burger-Cannon round win', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.locator('#diffEasy').click();
  await page.locator('#btnPlay').click();
  await step(page);

  let s = await state(page);
  assert.equal(s.difficulty, 'easy');

  const sts = await stations(page);
  const bunCrate = sts.find(st => st.type === 'crate' && st.kind === 'bun');
  const meatCrate = sts.find(st => st.type === 'crate' && st.kind === 'meatRaw');
  const fruitCrate = sts.find(st => st.type === 'crate' && st.kind === 'fruitRaw');
  const grill = sts.find(st => st.type === 'grill');
  const blender = sts.find(st => st.type === 'blender');
  const cannon = sts.find(st => st.type === 'cannon' && st.c === 6);

  // 1. Test non-silent friendly visual guidance: taking raw meat to the Serving Cannon pops Arabic hint + grill arrow!
  await clickStation(page, meatCrate);
  assert.deepEqual((await state(page)).chefs[0].held, { kind: 'meatRaw' });
  await clickStation(page, cannon);
  s = await state(page);
  assert.ok(s.hints.length >= 1 && s.hints[0].text.includes('اشوِ اللحم'), 'raw meat at cannon pops helpful Arabic grill hint');
  assert.equal(s.hints[0].targetX, grill.x, 'hint arrow points to Grill');

  // 2. Grill the raw meat, grab a bun while it sizzles, and auto-snap into a finished Mega-Burger!
  await clickStation(page, grill);
  await clickStation(page, bunCrate);
  assert.deepEqual((await state(page)).chefs[0].held, { kind: 'bun' });
  await run(page, 140);
  await clickStation(page, grill);
  assert.deepEqual((await state(page)).chefs[0].held, { kind: 'burger' }, 'touching done grill with bun auto-snaps into burger');

  // Launch Burger at Serving Cannon!
  await clickStation(page, cannon);

  // 3. Also blend & launch Rocket Juice so both initial customer dishes are served!
  await clickStation(page, fruitCrate);
  await clickStation(page, blender);
  await run(page, 120);
  await clickStation(page, blender);
  assert.deepEqual((await state(page)).chefs[0].held, { kind: 'juice' });
  await clickStation(page, cannon);

  // 4. Trigger Mini Sous-Bot (#btnBot) and verify it deploys & enters cooldown
  await page.locator('#btnBot').click();
  await run(page, 150);
  s = await state(page);
  assert.ok(s.served >= 2);
  assert.ok(s.coins >= s.goals[0], `coins ${s.coins} >= 1-star goal ${s.goals[0]}`);
  assert.ok(s.fx > 0 || s.sousBot.state !== 'ready', 'effects and Sous-Bot active');
  assert.equal(await page.evaluate(() => rk.hits), 2);

  // Run remaining time until recess bell rings and result screen appears
  await run(page, Math.ceil(s.timeLeft * 60) + 120);
  s = await state(page);
  assert.equal(s.screen, 'result');
  assert.ok(s.stars >= 1);
  assert.equal(await page.locator('#scrResult').isVisible(), true);

  const tele = await page.evaluate(() => ({ rounds: rk.rounds, ends: rk.ends, results: rk.results }));
  assert.deepEqual(tele.rounds, ['rk_1']);
  assert.equal(tele.results.length, 1, '1P round reports exactly one DDA outcome');
  assert.equal(tele.ends.length, 1);
  assert.equal(tele.ends[0].outcome, 'win');
  assert.equal(tele.ends[0].score, s.coins);

  const saved = await stored(page);
  assert.ok(saved.lv[0].s >= 1);
  assert.equal(saved.coins, s.coins);

  // #resNext advances to 1-2
  await page.locator('#resNext').click();
  await step(page);
  assert.equal((await state(page)).id, '1-2');
});

test('2P Co-op (#btnCoop): independent Chef 1 & Chef 2 movement/dash/interact, shared goal, and NO dda.result on finish', async t => {
  const page = await game(t);
  await page.locator('#btnCoop').click();
  await step(page);

  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.players, 2);
  assert.equal(s.chefs.length, 2);
  assert.equal(await page.locator('#btnBot').isHidden(), true, 'Sous-Bot button hidden in 2P co-op');
  const c0x = s.chefs[0].x, c1x = s.chefs[1].x;

  // Move Chef 1 left toward Grill with KeyA, and Chef 2 right toward Blender with ArrowRight simultaneously!
  await page.keyboard.down('KeyA');
  await page.keyboard.down('ArrowRight');
  await step(page, 36);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ArrowRight');

  s = await state(page);
  assert.ok(s.chefs[0].x < c0x - 100, 'Chef 1 moved left with KeyA');
  assert.ok(s.chefs[1].x > c1x + 140, 'Chef 2 moved right with ArrowRight');

  // Move Chef 1 up to Bun crate (c=1, r=0) and pick up Bun with Space!
  await page.keyboard.down('KeyW');
  await step(page, 28);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Space');
  await step(page, 2);
  s = await state(page);
  assert.ok(s.chefs[0].held && (s.chefs[0].held.kind === 'bun' || s.chefs[0].held.kind === 'meatRaw'), 'Chef 1 picked up crate item with Space');

  // Chef 2 dashes left with ShiftRight!
  const beforeDashX = s.chefs[1].x;
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('ShiftRight');
  await step(page, 8);
  await page.keyboard.up('ArrowLeft');
  s = await state(page);
  assert.ok(s.chefs[1].x < beforeDashX - 45, 'Chef 2 dashed with ShiftRight');

  // Finish the 2P round: telemetry must record round('rk_coop_1'), end('end') with NO score, and ZERO dda.result calls!
  await run(page, Math.ceil(s.timeLeft * 60) + 120);
  assert.equal((await state(page)).screen, 'result');
  const tele = await page.evaluate(() => ({ rounds: rk.rounds, ends: rk.ends, results: rk.results }));
  assert.deepEqual(tele.rounds, ['rk_coop_1']);
  assert.deepEqual(tele.results, [], 'dda.result MUST NOT be called on 2P rounds');
  assert.equal(tele.ends.length, 1);
  assert.equal(tele.ends[0].outcome, 'end');
  assert.equal(tele.ends[0].argc, 1, '2P Kit.stats.end("end") takes NO score argument');
});

test('Pause (#btnPause & window blur) freezes simulation and skips canvas redraws; Resume & Restart work cleanly', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page, 10);

  // Move right slightly so atStart becomes false
  await page.keyboard.down('KeyD');
  await step(page, 8);
  await page.keyboard.up('KeyD');
  assert.equal((await state(page)).atStart, false);

  // Pause via HUD button
  await page.locator('#btnPause').click();
  await step(page, 2);
  const pausedSnap = await state(page);
  assert.equal(pausedSnap.screen, 'pause');
  assert.equal(pausedSnap.paused, true);

  // Zero audio and zero simulation drift & zero canvas redraws while paused
  const beforePauseCheck = await page.evaluate(() => ({ draws: rk.draws, audio: rk.audioStarts }));
  await step(page, 120);
  const afterPauseCheck = await page.evaluate(() => ({ draws: rk.draws, audio: rk.audioStarts }));
  const afterSnap = await state(page);
  assert.equal(afterSnap.time, pausedSnap.time, 'simulation clock frozen while paused');
  assert.equal(afterSnap.timeLeft, pausedSnap.timeLeft, 'countdown frozen while paused');
  assert.deepEqual(afterSnap.chefs, pausedSnap.chefs, 'chefs frozen while paused');
  assert.deepEqual(afterSnap.orders, pausedSnap.orders, 'orders frozen while paused');
  assert.equal(afterPauseCheck.draws, beforePauseCheck.draws, 'skips canvas redraws when paused and !dirty');
  assert.equal(afterPauseCheck.audio, beforePauseCheck.audio, 'zero audio scheduled while paused');

  // Resume via #btnResume
  await page.locator('#btnResume').click();
  await step(page, 10);
  assert.equal((await state(page)).screen, 'play');
  assert.ok((await state(page)).time > pausedSnap.time);

  // Window blur auto-pauses
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page, 2);
  assert.equal((await state(page)).screen, 'pause');

  // #btnRestart resets current round to atStart === true && served === 0
  await page.locator('#btnRestart').click();
  await step(page, 2);
  const restarted = await state(page);
  assert.equal(restarted.screen, 'play');
  assert.equal(restarted.atStart, true);
  assert.equal(restarted.served, 0);
});

test('Chef Locker (#btnShop) buys aprons & hats, handles storage quota failure + Retry via Kit.saveStatus, and recovers corrupt saves', async t => {
  const page = await game(t, { save: SAVE(4, { coins: 300 }) });
  assert.equal(await page.locator('#titleCoins b').textContent(), '300');

  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Buy second apron (طاهي النيون, 60 coins)
  await page.locator('#shelfAprons .tile').nth(1).click();
  await step(page);
  let sv = await page.evaluate(() => __game.save);
  assert.equal(sv.apron, 1);
  assert.equal(sv.coins, 240);

  // Trigger storage quota failure on buying Pirate Hat (قبعة القرصان, 50 coins)
  const status = page.locator('.sg-save-status');
  await page.evaluate(() => { rk.failSave = true; });
  await page.locator('#shelfHats .tile').nth(1).click();
  await step(page);
  assert.equal(await status.getAttribute('data-state'), 'failed', 'save failure state shown');

  // Clear quota failure and click Retry button inside .sg-save-status
  await page.evaluate(() => { rk.failSave = false; });
  await status.locator('button').click();
  await step(page);
  assert.equal(await status.getAttribute('data-state'), 'saved', 'retry transitions saveStatus to saved');
  const disk = await stored(page);
  assert.equal(disk.hat, 1);
  assert.equal(disk.coins, 190);

  // Corrupt save recovery + smaller [1100, 620] portal frame fit check
  const pageCorrupt = await game(t, { save: '{broken-json', size: [1100, 620] });
  await step(pageCorrupt, 5);
  assert.equal((await state(pageCorrupt)).screen, 'title');
  assert.equal((await pageCorrupt.evaluate(() => __game.save)).coins, 0);
  const cBox = await pageCorrupt.locator('#game').boundingBox();
  for (const sel of ['#btnPlay', '#btnCoop', '#btnLevels', '#btnShop', '.howto .how-card >> nth=3']) {
    const b = await pageCorrupt.locator(sel).boundingBox();
    assert.ok(b.x >= cBox.x && b.x + b.width <= cBox.x + cBox.width && b.y + b.height <= cBox.y + cBox.height, sel);
  }
});

test('Reduced motion suppresses particle bursts and screen shake; native HTML controls are never hijacked', async t => {
  const page = await game(t, { reducedMotion: 'reduce', save: SAVE(1, { coins: 200 }) });
  await page.locator('#btnShop').click();
  await step(page);
  await page.locator('#shelfAprons .tile').nth(1).click();
  await step(page, 5);
  const s = await state(page);
  assert.equal(s.fx, 0, 'zero particles in reduced motion');
  assert.equal(s.shake, 0, 'zero shake in reduced motion');

  // Verify shared platform native HTML button/input/range keyboard isolation
  await testNativeControlGame({ browser, origin: server.origin, slug: 'recess-kitchen' });
});

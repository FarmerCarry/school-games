// Magic Crayon: Turbo Stunt Rider (القلم السحري) in real Chromium:
// Arabic title & difficulty tiers (سهل/متوسط/بطل), immediate 1-1 start & guide coach,
// pre-launch & live mid-run crayon bridges, 3 magic inks (الجسر/التيربو/القفز),
// all 15 open stunt stages + Free Stunt Sandbox, Undo/keyboard drawing, Pause freeze & Restart,
// lava crash auto-reset, Stunt Garage + Kit.saveStatus quota retry, reduced motion & [1100,620] fit.
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
  browser = await launchChromium({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

const SAVE = (starsCount = 0, extra = {}) => ({
  v: 2,
  tier: 'normal',
  coins: 0,
  pod: 0,
  trail: 0,
  pods: [1, 0, 0, 0, 0],
  trails: [1, 0, 0, 0],
  lv: Array.from({ length: 15 }, (_, i) => ({ s: i < starsCount ? 2 : 0, ink: i < starsCount ? 400 : 0 })),
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
    assert.deepEqual(errors, [], 'zero console/page errors');
    assert.deepEqual(requests, [], 'zero external network requests');
  });

  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('mc-seeded')) {
      sessionStorage.setItem('mc-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:magic-crayon:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const mc = window.mc = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          mc.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          mc.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const make = kit.dda;
        kit.dda = (slug, opts) => {
          const control = make.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = control.result;
          control.result = outcome => { mc.results.push(outcome); return origResult.call(control, outcome); };
          return control;
        };
      }
    });
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:magic-crayon:save' && window.mc && window.mc.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return origSet.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/magic-crayon/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.mc && window.mc.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => mc.step(n), n);
const run = (page, n = 1) => page.evaluate(n => mc.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:magic-crayon:save');
  return raw ? JSON.parse(raw) : null;
});
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);

async function dragStroke(page, pts) {
  const screenPts = [];
  for (const [x, y] of pts) screenPts.push(await pagePoint(page, x, y));
  await page.mouse.move(screenPts[0].x, screenPts[0].y);
  await page.mouse.down();
  await step(page);
  for (let i = 1; i < screenPts.length; i++) {
    await page.mouse.move(screenPts[i].x, screenPts[i].y, { steps: 6 });
    await step(page, 2);
  }
  await page.mouse.up();
  await step(page);
}

async function openStage(page, idx) {
  await page.locator('#btnLevels').click();
  await step(page);
  await page.locator('.lvl').nth(idx).click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, idx);
}

test('title shows Arabic stunt UI & difficulty tiers; #btnPlay opens 1-1 immediately with waiting pod & guide coach', async t => {
  const page = await game(t);
  await step(page, 20);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/45');

  for (const txt of ['ارسم جسورًا', 'حطّم الصناديق', 'بوابة الفوز']) {
    assert.equal(await page.locator('.howto figcaption', { hasText: txt }).isVisible(), true, txt);
  }

  // Switch difficulty tiers (سهل / بطل / متوسط) and verify Easy doubles ink budget.
  await page.locator('#tierRow [data-tier="easy"]').click();
  assert.equal((await state(page)).tier, 'easy');

  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-1');
  assert.equal(s.rolling, false);
  assert.equal(s.strokes, 0);
  assert.equal(s.inkUsed, 0);
  assert.ok(s.inkMax > 1200, 'easy tier grants generous double ink budget');
  const startBall = s.ball;

  await run(page, 60);
  s = await state(page);
  assert.equal(s.coach, true, 'guide coach glides across gap before first stroke');
  assert.equal(s.inkUsed, 0, 'coach never consumes player ink');
  assert.equal(s.rolling, false, 'stunt pod waits on start pad until Launch');
  assert.deepEqual(s.ball, startBall);
});

test('pre-launch mouse bridge on 1-1, Space launch, crate smash, 3 stars, win overlay & Enter advances to 1-2', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.locator('#btnPlay').click();
  await step(page);

  await dragStroke(page, [[380, 344], [560, 350], [740, 356]]);
  let s = await state(page);
  assert.equal(s.strokes, 1);
  assert.ok(s.inkUsed > 300 && s.inkUsed <= s.inkPar);
  assert.equal(s.rolling, false, 'waits until Space or #btnLaunch');

  await page.keyboard.press('Space');
  await step(page);
  assert.equal((await state(page)).rolling, true, 'Space launches stunt pod');

  await run(page, 320);
  s = await state(page);
  assert.equal(s.done, true);
  assert.equal(s.starsGot, 3);
  assert.equal(s.cratesLeft, 0, 'wooden crates smashed along goal runway');
  assert.deepEqual(await page.evaluate(() => mc.results), [1]);

  const saved = await stored(page);
  assert.equal(saved.lv[0].s, 3);
  assert.ok(saved.coins >= 11);

  await run(page, 60);
  s = await state(page);
  assert.equal(s.screen, 'win');
  assert.equal(s.stars, 3);
  assert.equal(await page.locator('#scrWin').isVisible(), true);
  assert.equal(await page.locator('#winStars svg.on').count(), 3);

  await page.keyboard.press('Enter');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-2');
});

test('3 magic crayons (1/2/3 & HUD), Undo/erase/keyboard drawing, live mid-run drawing & spring trampoline win', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);

  // Switch between the 3 magic crayons via HUD buttons and keys 1/2/3.
  await page.locator('#ink1').click();
  assert.equal((await state(page)).inkType, 1);
  await page.keyboard.press('Digit3');
  await step(page);
  assert.equal((await state(page)).inkType, 2);
  await page.keyboard.press('Digit1');
  await step(page);
  assert.equal((await state(page)).inkType, 0);

  await dragStroke(page, [[390, 360], [560, 360]]);
  await dragStroke(page, [[420, 460], [600, 460]]);
  assert.equal((await state(page)).strokes, 2);

  // Right-click erases a stroke; #btnUndo removes the remaining stroke.
  const p1 = await pagePoint(page, 475, 360);
  await page.mouse.click(p1.x, p1.y, { button: 'right' });
  await step(page);
  assert.equal((await state(page)).strokes, 1);

  await page.locator('#btnUndo').click();
  await step(page);
  assert.equal((await state(page)).strokes, 0);
  assert.equal((await state(page)).inkUsed, 0);

  // Keyboard drawing: Shift + ArrowRight draws a stroke; KeyX undoes it; KeyZ + ArrowRight draws again.
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ArrowRight');
  await step(page, 24);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ShiftLeft');
  await step(page);
  assert.equal((await state(page)).strokes, 1);

  await page.keyboard.press('KeyX');
  await step(page);
  assert.equal((await state(page)).strokes, 0);

  await page.keyboard.down('KeyZ');
  await page.keyboard.down('ArrowRight');
  await step(page, 20);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('KeyZ');
  await step(page);
  assert.equal((await state(page)).strokes, 1);

  // KeyR resets stage cleanly while keeping a helpful ghost trace.
  await page.keyboard.press('KeyR');
  await step(page);
  let s = await state(page);
  assert.equal(s.strokes, 0);
  assert.equal(s.inkUsed, 0);
  assert.equal(s.rolling, false);
  assert.equal(s.ghosts, 1);

  // LIVE mid-run drawing AFTER clicking #btnLaunch guides the moving stunt pod across 1-1!
  await page.locator('#btnLaunch').click();
  await step(page, 8);
  assert.equal((await state(page)).rolling, true);
  await dragStroke(page, [[380, 344], [560, 350], [740, 356]]);
  await run(page, 340);
  assert.equal((await state(page)).done, true);

  // Spring Crayon (قلم القفز #ink2) launches pod sky-high to clear stage 1-3!
  await run(page, 60);
  await page.locator('#winMap').click();
  await step(page);
  await page.locator('.lvl').nth(2).click();
  await step(page);
  s = await state(page);
  assert.equal(s.id, '1-3');
  assert.equal(s.inkType, 2, 'stage 1-3 preselects spring crayon');
  await dragStroke(page, [[415, 448], [560, 434]]);
  await page.locator('#btnLaunch').click();
  await run(page, 360);
  assert.equal((await state(page)).done, true, 'spring crayon bounces pod to upper goal');
});

test('all 15 stunt stages are open from fresh save; Free Stunt Sandbox has infinite ink & prop spawners', async t => {
  const page = await game(t);
  await page.locator('#btnLevels').click();
  await step(page);
  assert.equal(await page.locator('.lvl').count(), 15);

  // Jump straight to final World 3 stage 3-5 with zero prior stars!
  await page.locator('.lvl').nth(14).click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '3-5');
  assert.equal(s.rolling, false);

  // Switch to Free Stunt Sandbox via pause -> map -> sandbox button.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnMap').click();
  await step(page);
  await page.locator('#mapSandbox').click();
  await step(page);

  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.sandbox, true);
  assert.equal(s.id, 'sandbox');
  assert.equal(await page.locator('#sbxBar').isVisible(), true);

  const beforeCrates = s.cratesLeft;
  await page.locator('#sbxBar [data-prop="wood"]').click();
  await page.locator('#sbxBar [data-prop="tnt"]').click();
  await step(page);
  assert.equal((await state(page)).cratesLeft, beforeCrates + 2);

  await dragStroke(page, [[320, 310], [640, 340], [920, 280]]);
  assert.equal((await state(page)).strokes, 1);
  await page.locator('#btnClearInk').click();
  assert.equal((await state(page)).strokes, 0);
  assert.equal((await state(page)).inkUsed, 0);
});

test('Pause (#btnPause, KeyP, Escape, blur) freezes simulation; #btnResume, #btnRestart & lava crash auto-reset', async t => {
  const page = await game(t);
  await openStage(page, 10);
  assert.equal((await state(page)).id, '3-1');

  await dragStroke(page, [[320, 340], [520, 360]]);
  await page.locator('#btnLaunch').click();
  await step(page, 16);

  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.ball, __game.state.inkUsed, __game.state.strokes]));

  for (const how of ['button', 'KeyP', 'Escape', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);

    assert.equal((await state(page)).screen, 'pause', how);
    assert.equal((await state(page)).paused, true, how);
    const frozen = await snap();

    await page.mouse.move(420, 400);
    await page.mouse.down();
    await page.mouse.move(740, 420);
    await page.mouse.up();
    await run(page, 60);
    assert.equal(await snap(), frozen, how + ' freezes world completely');

    if (how === 'KeyP') await page.keyboard.press('KeyP');
    else await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await step(page, 5);
    assert.notEqual(await snap(), frozen, 'simulation resumes cleanly');
  }

  // #btnRestart from pause resets rolling === false, inkUsed === 0, strokes === 0, ghosts === 0.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.inkUsed, 0);
  assert.equal(s.rolling, false);
  assert.equal(s.strokes, 0);
  assert.equal(s.ghosts, 0);

  // Unbridged launch into volcano lava crashes pod and auto-resets it on start pad!
  await page.locator('#btnLaunch').click();
  await run(page, 140);
  assert.equal((await state(page)).crashed, true);
  await run(page, 65);
  s = await state(page);
  assert.equal(s.crashed, false);
  assert.equal(s.rolling, false);
});

test('Stunt Garage buys & equips pods/trails; mute & KeyM; QuotaExceededError warns & Retry saves', async t => {
  const page = await game(t, { save: SAVE(1, { coins: 24 }) });
  assert.equal(await page.locator('#titleStars b').textContent(), '2/45');

  await page.locator('#btnGarage').click();
  await step(page);
  assert.equal((await state(page)).screen, 'garage');

  // Buy Flame Pod (price 8) and Spark Trail (price 6).
  await page.locator('#shelfPods .tile').nth(1).click();
  await step(page);
  await page.locator('#shelfTrails .tile').nth(1).click();
  await step(page);
  const sv = await stored(page);
  assert.equal(sv.pod, 1);
  assert.equal(sv.trail, 1);
  assert.equal(sv.coins, 10);
  assert.match(await page.locator('#shelfPods .tile').nth(1).getAttribute('class'), /wear/);
  assert.match(await page.locator('#shelfTrails .tile').nth(1).getAttribute('class'), /wear/);

  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');

  // Mute button and KeyM toggle audio without starting play.
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM');
  await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'title');

  // Simulate full storage when winning 1-1; verify Kit.saveStatus banner & Retry recovery!
  await page.evaluate(() => { mc.failSave = true; });
  await page.locator('#btnPlay').click();
  await step(page);
  await dragStroke(page, [[380, 344], [560, 350], [740, 356]]);
  await page.keyboard.press('Space');
  await run(page, 340);
  assert.equal((await state(page)).done, true);

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).lv[0].s, 2, 'disk write failed so previous 2-star save remained');
  assert.equal((await page.evaluate(() => __game.save)).lv[0].s, 3, 'in-memory save retained 3 stars');

  await page.evaluate(() => { mc.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).lv[0].s, 3);
});

test('reduced motion suppresses trail, shake & particles; [1100, 620] portal viewport fits with zero HUD overlap', async t => {
  const page = await game(t, { reducedMotion: 'reduce', size: [1100, 620] });
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);

  for (const sel of ['#btnPlay', '#btnLevels', '#btnSandbox', '#btnGarage', '.howto .card >> nth=2']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvasBox.x && b.x + b.width <= canvasBox.x + canvasBox.width && b.y + b.height <= canvasBox.y + canvasBox.height, sel);
  }

  await page.locator('#btnPlay').click();
  await step(page);
  const muteBox = await page.locator('.sg-mute').boundingBox();
  const launchBox = await page.locator('#btnLaunch').boundingBox();
  assert.ok(launchBox.x + launchBox.width < muteBox.x, '#btnLaunch does not overlap .sg-mute');

  await dragStroke(page, [[380, 344], [560, 350], [740, 356]]);
  await page.locator('#btnLaunch').click();
  await run(page, 340);
  const s = await state(page);
  assert.equal(s.done, true);
  assert.equal(s.trail, 0, 'no trail in reduced motion');
  assert.equal(s.shake, 0, 'no shake in reduced motion');
  assert.equal(s.fx, 0, 'no particle burst in reduced motion');
});

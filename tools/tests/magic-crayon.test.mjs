// Magic Crayon (القلم السحري) in real Chromium: title & fresh-visit start, wordless coach,
// real mouse drag drawing a bridge & completing Level 1, Space/#btnRoll launch,
// keyboard Arrows+Shift drawing, Undo (#btnUndo/KeyZ/Right-click), Pause freeze & Restart,
// slime pop retry, Shop + storage quota recovery via Kit.saveStatus, reduced motion, zero errors.
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

const SAVE = (open = 0, extra = {}) => ({
  v: 1,
  lv: Array.from({ length: 20 }, (_, i) => ({ s: i < open ? 2 : 0, ink: i < open ? 420 : 0, c: i < open ? 3 : 0 })),
  coins: 0,
  crayons: [1, 0, 0, 0, 0, 0],
  skins: [1, 0, 0, 0, 0, 0],
  crayon: 0,
  skin: 0,
  coach: true,
  ...extra
});

async function game(t, { save, dda = 0.3, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
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

async function openLevel(page, i) {
  await page.locator('#btnLevels').click();
  await step(page);
  await page.locator('.lvl').nth(i).click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, i);
}

test('title waits; Play goes straight to Level 1 on fresh save; coach hand glides without drawing ink or moving Karroum', async t => {
  const page = await game(t);
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/60');
  for (const txt of ['ارسم جسرًا', 'اضغط انطلق', 'اجمع النجوم', 'الكأس الذهبية']) {
    assert.equal(await page.locator('.howto figcaption', { hasText: txt }).isVisible(), true, txt);
  }

  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-1');
  assert.equal(s.rolling, false);
  assert.equal(s.strokes, 0);
  assert.equal(s.inkUsed, 0);
  const startBall = s.ball;

  await run(page, 60);
  s = await state(page);
  assert.equal(s.coach, true, 'wordless coach hand shows how to draw across the gap');
  assert.equal(s.inkUsed, 0, 'coach never consumes real ink');
  assert.equal(s.rolling, false, 'Karroum stays waiting on start pedestal');
  assert.deepEqual(s.ball, startBall);
});

test('real mouse drag draws a crayon bridge, Space launches Karroum into Golden Star Cup with 3 stars, saves & advances', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.locator('#btnPlay').click();
  await step(page);

  await dragStroke(page, [[368, 355], [570, 362], [772, 369]]);
  let s = await state(page);
  assert.equal(s.strokes, 1);
  assert.ok(s.inkUsed > 380 && s.inkUsed <= s.inkPar);
  assert.equal(s.rolling, false, 'waits until Space or #btnRoll');

  await page.keyboard.press('Space');
  await step(page);
  assert.equal((await state(page)).rolling, true, 'Space launches Karroum');

  await run(page, 360);
  s = await state(page);
  assert.equal(s.done, true);
  assert.equal(s.starsGot, 3);
  assert.deepEqual(await page.evaluate(() => mc.results), [1]);

  const saved = await stored(page);
  assert.equal(saved.lv[0].s, 3);
  assert.equal(saved.coach, true);
  assert.ok(saved.coins >= 9);

  await run(page, 120);
  s = await state(page);
  assert.equal(s.screen, 'result');
  assert.equal(s.stars, 3);
  assert.equal(await page.locator('#scrResult').isVisible(), true);
  await run(page, 90);
  assert.equal(await page.locator('#resStars svg.on').count(), 3);

  // Enter advances to 1-2.
  await page.keyboard.press('Enter');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-2');
});

test('Undo (#btnUndo, KeyZ, right-click), keyboard Arrows+Shift drawing, live mid-roll drawing, and KeyR ghost trace', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);

  await dragStroke(page, [[380, 360], [560, 360]]);
  await dragStroke(page, [[420, 460], [600, 460]]);
  assert.equal((await state(page)).strokes, 2);

  // Right-click on the first stroke erases it.
  const p1 = await pagePoint(page, 470, 360);
  await page.mouse.click(p1.x, p1.y, { button: 'right' });
  await step(page);
  assert.equal((await state(page)).strokes, 1);

  // #btnUndo removes the remaining stroke.
  await page.locator('#btnUndo').click();
  await step(page);
  assert.equal((await state(page)).strokes, 0);
  assert.equal((await state(page)).inkUsed, 0);

  // Keyboard accessibility: Shift + ArrowRight draws a crayon line, KeyZ undoes it!
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ArrowRight');
  await step(page, 25);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ShiftLeft');
  await step(page);
  let s = await state(page);
  assert.equal(s.strokes, 1, 'Shift + ArrowRight drew a crayon stroke');
  assert.ok(s.inkUsed > 80);

  // KeyR resets the level cleanly while keeping a helpful visual ghost trace!
  await page.keyboard.press('KeyR');
  await step(page);
  s = await state(page);
  assert.equal(s.strokes, 0);
  assert.equal(s.inkUsed, 0);
  assert.equal(s.rolling, false);
  assert.equal(s.ghosts, 1);

  // Live drawing AFTER clicking #btnRoll guides Karroum mid-roll!
  await page.locator('#btnRoll').click();
  await step(page, 10);
  assert.equal((await state(page)).rolling, true);
  await dragStroke(page, [[368, 355], [570, 362], [772, 369]]);
  await run(page, 380);
  assert.equal((await state(page)).done, true);
});

test('Pause (#btnPause, KeyP, Escape, blur) freezes physics completely; #btnResume & #btnRestart', async t => {
  const page = await game(t, { save: SAVE(6) });
  await openLevel(page, 5);
  assert.equal((await state(page)).id, '2-1');

  await dragStroke(page, [[250, 295], [535, 542]]);
  await page.locator('#btnRoll').click();
  await step(page, 20);

  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.ball, __game.state.inkUsed, __game.state.strokes]));

  for (const how of ['button', 'KeyP', 'Escape', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);

    assert.equal((await state(page)).screen, 'pause', how);
    assert.equal((await state(page)).paused, true, how);
    const frozen = await snap();

    // Mouse drags and frame ticks while paused do not advance simulation or draw ink.
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(750, 420);
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

  // #btnRestart from pause resets inkUsed === 0 && !rolling && strokes === 0.
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.inkUsed, 0);
  assert.equal(s.rolling, false);
  assert.equal(s.strokes, 0);
  assert.equal(s.ghosts, 0);
});

test('ticklish purple slime pops unbridged Karroum and auto-restarts ready to redraw', async t => {
  const page = await game(t, { save: SAVE(12) });
  await openLevel(page, 11);
  assert.equal((await state(page)).id, '3-2');

  await page.locator('#btnRoll').click();
  await run(page, 160);
  assert.equal((await state(page)).popped, true);

  // After the short bubble-giggle beat, the level auto-restarts cleanly.
  await run(page, 90);
  const s = await state(page);
  assert.equal(s.popped, false);
  assert.equal(s.rolling, false);
  assert.equal(s.strokes, 0);
});

test('Shop buys & equips crayons and skins; mute button & KeyM; full-disk QuotaExceededError warns & Retry saves', async t => {
  const page = await game(t, { save: SAVE(1, { coins: 12 }) });
  assert.equal(await page.locator('#titleStars b').textContent(), '2/60');

  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Buy cyan crayon (price 4) and soccer skin (price 4).
  await page.locator('#shelfColors .tile').nth(1).click();
  await step(page);
  await page.locator('#shelfSkins .tile').nth(1).click();
  await step(page);
  let sv = await stored(page);
  assert.equal(sv.crayon, 1);
  assert.equal(sv.skin, 1);
  assert.equal(sv.coins, 4);
  assert.match(await page.locator('#shelfColors .tile').nth(1).getAttribute('class'), /wear/);
  assert.match(await page.locator('#shelfSkins .tile').nth(1).getAttribute('class'), /wear/);

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

  // Simulate full storage when completing 1-2; verify Kit.saveStatus banner & Retry recovery!
  await page.evaluate(() => { mc.failSave = true; });
  await openLevel(page, 1);
  await dragStroke(page, [[288, 236], [575, 378], [862, 497]]);
  await page.keyboard.press('Space');
  await run(page, 420);
  assert.equal((await state(page)).done, true);

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).lv[1].s, 0, 'disk write failed');
  assert.equal((await page.evaluate(() => __game.save)).lv[1].s, 3, 'in-memory save retained');

  await page.evaluate(() => { mc.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).lv[1].s, 3);
});

test('reduced motion suppresses trail, shake, and particles; smaller [1100, 620] portal frame fits cleanly', async t => {
  const page = await game(t, { reducedMotion: 'reduce', size: [1100, 620] });
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);

  for (const sel of ['#btnPlay', '#btnLevels', '#btnShop', '.howto .card >> nth=3']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvasBox.x && b.x + b.width <= canvasBox.x + canvasBox.width && b.y + b.height <= canvasBox.y + canvasBox.height, sel);
  }

  await page.locator('#btnPlay').click();
  await step(page);
  const muteBox = await page.locator('.sg-mute').boundingBox();
  const rollBox = await page.locator('#btnRoll').boundingBox();
  assert.ok(rollBox.x + rollBox.width < muteBox.x, '#btnRoll does not overlap .sg-mute');

  await dragStroke(page, [[368, 355], [570, 362], [772, 369]]);
  await page.locator('#btnRoll').click();
  await run(page, 360);
  const s = await state(page);
  assert.equal(s.done, true);
  assert.equal(s.trail, 0, 'no trail in reduced motion');
  assert.equal(s.shake, 0, 'no shake in reduced motion');
  assert.equal(s.fx, 0, 'no confetti burst in reduced motion');
});

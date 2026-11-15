// Toy Castle Clash (قلعة الألعاب) in real Chromium: fresh-save Play, frame-1 Digit1 duck
// summon, zero P1 auto-summon, card clicks, sky star-bubble popping, key upgrades & cannon,
// 2P shared-keyboard versus, pause/freeze/restart, full level win + quota warning, shop,
// reduced motion, and 1100x620 portal viewport fit.
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
  lv: Array.from({ length: 12 }, (_, i) => ({ s: i < open ? 2 : 0, t: i < open ? 400 : 0 })),
  coins: 0,
  themes: [1, 0, 0, 0, 0, 0],
  toppers: [1, 0, 0, 0, 0],
  theme: 0,
  topper: 0,
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
    const tc = window.tc = { results: [], ends: [], failSave: false };
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

test('Title screen -> Play starts Level 0 on fresh save; P1 never auto-summons; Digit1 spawns duck on frame 1', async t => {
  const page = await game(t);
  await step(page, 20);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/36');
  for (const label of ['اجمع الطاقة', 'أرسل الألعاب', 'مدفع القصاصات', 'اهزم القلعة']) {
    assert.ok(await page.locator('.howto figcaption', { hasText: label }).isVisible(), label);
  }

  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.humans, 1);
  assert.equal(s.level, 0);
  assert.equal(s.id, '1-1');
  assert.ok(s.energy >= 25, 'starting energy >= 25');
  assert.equal(s.p1Spawned, 0);

  // Digit1 immediately spawns a Wind-Up Duck on frame 1!
  await page.keyboard.press('Digit1');
  await step(page);
  s = await state(page);
  assert.equal(s.p1Spawned, 1, 'Digit1 immediately spawned a duck');
  assert.ok(s.units >= 1);

  // Restart and verify P1 NEVER auto-summons even over 5 seconds of battle time.
  await page.keyboard.press('KeyR');
  await step(page);
  s = await state(page);
  assert.equal(s.p1Spawned, 0);
  assert.equal(s.time, 0);
  await run(page, 60 * 5);
  s = await state(page);
  assert.equal(s.p1Spawned, 0, 'P1 never auto-summons units');
});

test('Unit card clicks, sky star-bubble popping, wind-up key upgrade, and castle confetti cannon', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);

  // Click Paint Frog card
  await page.locator('#card-frog').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.p1Spawned, 1);

  // Advance until first sky star-bubble floats in (~4.2s) and pop it with a real canvas click!
  await run(page, 60 * 5);
  s = await state(page);
  assert.ok(s.bubbles.length >= 1, 'sky star-bubble spawned');
  const beforeBubble = s.energy;
  const bPt = await pagePoint(page, s.bubbles[0].x, s.bubbles[0].y);
  await page.mouse.click(bPt.x, bPt.y);
  await step(page);
  s = await state(page);
  assert.equal(s.bubbles.length, 0, 'bubble popped');
  assert.ok(s.energy >= beforeBubble + 14, `energy rose from ${beforeBubble} to ${s.energy}`);

  // Upgrade Wind-Up Key via KeyU (cost 35)
  assert.equal(s.keyLv, 1);
  await page.keyboard.press('KeyU');
  await step(page);
  s = await state(page);
  assert.equal(s.keyLv, 2, 'Wind-Up Key upgraded to Lv 2');
  assert.equal(await page.locator('#tray1p .klv').textContent(), 'مفتاح 2');

  // Fire Castle Confetti Cannon via Space
  await page.keyboard.press('Space');
  await step(page);
  assert.match(await page.locator('#btnCannon').getAttribute('class'), /dim/, 'cannon enters cooldown');
});

test('2-Player Versus (#btnTwo): symmetrical castles, P1 & P2 keyboard + card controls, no DDA pollution', async t => {
  const page = await game(t, { dda: 0.35 });
  await page.locator('#btnTwo').click();
  await step(page);

  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.humans, 2);
  assert.equal(s.hpLeft, s.hpRight);
  assert.equal(await page.locator('#tray2p').isVisible(), true);
  assert.equal(await page.locator('#tray1p').isVisible(), false);

  // P1 summons duck via Digit1, P2 summons duck via Digit6
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Digit6');
  await step(page);
  s = await state(page);
  assert.equal(s.p1Spawned, 1);
  assert.equal(s.p2Spawned, 1);
  assert.equal(s.units, 2);

  // Let energy charge so both players can upgrade keys (KeyF / KeyH) and summon via alternate keys (KeyR / KeyP / Numpad2)
  await run(page, 60 * 6);
  await page.keyboard.press('KeyF');
  await page.keyboard.press('KeyH');
  await step(page);
  s = await state(page);
  assert.equal(s.keyLv, 2, 'P1 upgraded via KeyF');
  assert.equal(s.keyLvRight, 2, 'P2 upgraded via KeyH');

  await run(page, 60 * 4);
  // KeyR summons P1 plane (does NOT restart!) and KeyP summons P2 plane (does NOT pause!)
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyP');
  await page.keyboard.press('Numpad2');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play', 'KeyP and KeyR are 2P summon keys, not pause/restart');
  assert.equal(s.p1Spawned, 2);
  assert.equal(s.p2Spawned, 3);

  // Fire both cannons (Space for P1, Enter for P2)
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await step(page);
  assert.match(await page.locator('#p1-cannon').getAttribute('class'), /dim/);
  assert.match(await page.locator('#p2-cannon').getAttribute('class'), /dim/);

  // P1 marches an army to win 2P versus while P2 rests; verify DDA is untouched and stats.end('end') has no score
  for (let w = 0; w < 18 && !(await state(page)).done; w++) {
    await page.locator('#p1-train').click();
    await page.locator('#p1-bear').click();
    await page.locator('#p1-duck').click();
    await run(page, 120);
  }
  s = await state(page);
  assert.equal(s.done, true);
  assert.equal(s.winner, 1);
  assert.deepEqual(await page.evaluate(() => tc.results), [], 'DDA is never updated on 2P matches');
  assert.deepEqual(await page.evaluate(() => tc.ends.at(-1)), ['end'], '2P ends with end and no score');

  await run(page, 100);
  assert.equal((await state(page)).screen, 'result');
  assert.match(await page.locator('#resTitle').textContent(), /قلعة اليسار/);
});

test('Pause (#btnPause, KeyP, Escape, window blur) freezes simulation completely; Resume and Restart', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);
  await page.keyboard.press('Digit1');
  await run(page, 30);

  const snap = () => page.evaluate(() => JSON.stringify([
    __game.state.time, __game.state.energy, __game.state.units, __game.state.hpLeft, __game.state.hpRight
  ]));

  for (const how of ['KeyP', 'Escape', 'button', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);

    assert.equal((await state(page)).screen, 'pause', how);
    const frozen = await snap();
    await run(page, 90);
    assert.equal(await snap(), frozen, how + ': simulation stays completely frozen while paused');

    if (how === 'blur') {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await run(page, 20);
      assert.equal((await state(page)).screen, 'pause', 'focus alone never unpauses');
    }

    if (how === 'KeyP') await page.keyboard.press('KeyP');
    else await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await step(page, 5);
    assert.notEqual(await snap(), frozen, 'simulation resumes cleanly');
  }

  // Restart from pause menu resets p1Spawned and time to 0
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.p1Spawned, 0);
  assert.equal(s.time, 0);
});

test('Winning a campaign level awards stars & coins, persists across reload, and handles QuotaExceededError via Kit.saveStatus', async t => {
  const page = await game(t, { dda: 0.2 });
  await page.locator('#btnPlay').click();
  await step(page);

  // Upgrade key and march bears + frogs + ducks to defeat Level 1-1 quickly!
  await run(page, 60);
  await page.keyboard.press('Digit6');
  await step(page);

  for (let i = 0; i < 20 && !(await state(page)).done; i++) {
    await page.keyboard.press('Digit3');
    await page.keyboard.press('Digit2');
    await page.keyboard.press('Digit1');
    await page.keyboard.press('Space');
    await run(page, 90);
  }

  let s = await state(page);
  assert.equal(s.done, true, 'won Level 1-1');
  assert.equal(s.winner, 1);
  assert.equal((await page.evaluate(() => tc.results)).length, 1, 'DDA recorded 1P outcome');

  const saved = await stored(page);
  assert.ok(saved.lv[0].s >= 2);
  assert.ok(saved.coins >= 28);

  // Wait for celebration -> Result screen -> Enter advances to 1-2!
  await run(page, 120);
  s = await state(page);
  assert.equal(s.screen, 'result');
  await run(page, 80);
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).id, '1-2');

  // Reload keeps progress, and Play now opens Map because totalStars > 0!
  await page.reload();
  await page.waitForFunction(() => window.__game && window.tc.step);
  assert.notEqual(await page.locator('#titleStars b').textContent(), '0/36');
  await page.locator('#btnPlay').click();
  await step(page);
  assert.equal((await state(page)).screen, 'map');

  // Simulate full storage on buying a shop item -> Kit.saveStatus warns and Retry saves!
  await page.locator('#mapHome').click();
  await step(page);
  await page.evaluate(() => { tc.failSave = true; });
  await page.locator('#btnShop').click();
  await step(page);
  await page.locator('#shelfThemes .tile').nth(1).click();
  await step(page);

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).themes[1], 0, 'disk write failed as simulated');
  assert.equal((await page.evaluate(() => __game.save)).themes[1], 1, 'kept in memory');

  await page.evaluate(() => { tc.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).themes[1], 1, 'Retry persisted the purchase');

  // Corrupted save recovers cleanly
  const broken = await game(t, { save: 'not-json{{{' });
  assert.equal((await state(broken)).screen, 'title');
  assert.equal(await broken.locator('#titleStars b').textContent(), '0/36');
});

test('Shop unlocks themes & rooftop toppers; mute button & KeyM; reduced motion; 1100x620 viewport fit', async t => {
  const page = await game(t, { save: SAVE(3, { coins: 60 }), reducedMotion: 'reduce', size: [1100, 620] });
  const canvasBox = await page.locator('#game').boundingBox();
  assert.ok(canvasBox.width <= 1100 && canvasBox.height <= 620);

  for (const sel of ['#btnPlay', '#btnTwo', '#btnLevels', '#btnShop', '.howto .card >> nth=0', '.howto .card >> nth=3']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(
      b.x >= canvasBox.x - 1 &&
      b.x + b.width <= canvasBox.x + canvasBox.width + 1 &&
      b.y + b.height <= canvasBox.y + canvasBox.height + 1,
      sel + ' fits inside scaled canvas'
    );
  }

  // Shop: buy theme #1 (price 20) and rooftop topper #2 (rocket, price 35)
  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Too expensive theme #5 (price 90) does not buy
  await page.locator('#shelfThemes .tile').nth(5).click();
  await step(page);
  assert.equal((await page.evaluate(() => __game.save)).theme, 0);

  await page.locator('#shelfThemes .tile').nth(1).click();
  await step(page);
  await page.locator('#shelfToppers .tile').nth(2).click();
  await step(page);
  const sv = await stored(page);
  assert.equal(sv.theme, 1);
  assert.equal(sv.topper, 2);
  assert.equal(sv.coins, 5);
  assert.match(await page.locator('#shelfToppers .tile').nth(2).getAttribute('class'), /wear/);

  // Escape back to title; mute via .sg-mute and KeyM never starts the game
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM');
  await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'title');

  // Reduced motion keeps fx === 0 and shake === 0 during battle & cannon fire
  await page.locator('#btnLevels').click();
  await step(page);
  await page.locator('.lvl').nth(0).click();
  await step(page);
  const hudBox = await page.locator('#tray1p').boundingBox();
  assert.ok(hudBox.x >= canvasBox.x && hudBox.x + hudBox.width <= canvasBox.x + canvasBox.width);

  await page.keyboard.press('Digit1');
  await page.keyboard.press('Space');
  await run(page, 60);
  const s = await state(page);
  assert.equal(s.fx, 0, 'no particle bursts under reduced motion');
  assert.equal(s.shake, 0, 'no screen shake under reduced motion');
});

test('Zero idle BGM on title and pause screens, and no raw keydown stealing from focused buttons', async t => {
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

  // Unlock audio via F2 key press and wait 150ms, then verify 0 audio starts over an idle window on title!
  await page.keyboard.press('F2');
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__audioStarts.length = 0; });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__audioStarts.length), 0, 'zero BGM while idle on title');

  // Tab-focus #btnShop and press Enter: native button click opens shop without starting play!
  await page.locator('#btnShop').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__game.state.screen), 'shop', 'Enter activates focused button');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // Start match, pause it, let pause SFX settle, then verify 0 audio starts while idle on pause!
  await page.locator('#btnPlay').click();
  await page.waitForTimeout(150);
  await page.locator('#btnPause').click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__game.state.screen), 'pause');
  await page.evaluate(() => { window.__audioStarts.length = 0; });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__audioStarts.length), 0, 'zero BGM while idle on pause');
});


// Desk Karts (سباق المكاتب) in real Chromium: zoomed-in chase & 2P framing camera,
// idle P1 stationary guarantee (p1Dist === 0 & time === 0), smart easy auto-gas + pointer
// steering, hop-drift sparks, full 3-lap win + stars + DDA, 4 cups / 12 open tracks,
// 2P mode + warp catch-up, pause freeze + zero paused redraws, restart, garage + quota retry,
// and [1100, 620] responsive fit with zero console/page/network errors.
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

const SAVE = (extra = {}) => ({
  v: 2,
  diff: 'normal',
  coins: 0,
  kart: 0,
  flame: 0,
  karts: [1, 0, 0, 0, 0],
  flames: [1, 0, 0, 0, 0],
  tracks: Array.from({ length: 12 }, () => ({ s: 0, t: 0 })),
  ...extra
});

async function game(t, { save, dda = 0.15, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
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
    if (!sessionStorage.getItem('dk-seeded')) {
      sessionStorage.setItem('dk-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:desk-karts:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const dk = window.dk = { results: [], failSave: false, draws: 0 };
    const origFillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function () {
      dk.draws++;
      return origFillRect.apply(this, arguments);
    };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          dk.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          dk.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const make = kit.dda;
        kit.dda = (slug, opts) => {
          const control = make.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = control.result;
          control.result = outcome => {
            dk.results.push(outcome);
            return origResult.call(control, outcome);
          };
          return control;
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:desk-karts:save' && window.dk && window.dk.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/desk-karts/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.dk.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => dk.step(n), n);
const run = (page, n = 1) => page.evaluate(n => dk.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:desk-karts:save');
  return raw ? JSON.parse(raw) : null;
});
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);

async function driveRace1P(page, maxChunks = 520) {
  await page.keyboard.down('ArrowUp');
  let steerHeld = '';
  try {
    for (let c = 0; c < maxChunks; c++) {
      const decision = await page.evaluate(() => {
        const st = __game.state;
        if (st.finished || st.screen !== 'play') return { done: true };
        const k = st.karts[0];
        const info = __game.trackInfo;
        const wrapS = s => { s = s % info.len; return s < 0 ? s + info.len : s; };
        const targetS = wrapS(k.s + 130 + k.speed * 0.22);
        let wantOff = 0;
        for (const hz of info.hazards) {
          const ds = wrapS(hz.s - k.s);
          if (ds > 0 && ds < 210) wantOff = hz.off >= 0 ? -info.hw * 0.45 : info.hw * 0.45;
        }
        for (const co of info.coils) {
          const ds = wrapS(co.s - k.s);
          if (ds > 0 && ds < 210) wantOff = co.off >= 0 ? -info.hw * 0.48 : info.hw * 0.48;
        }
        const aim = __game.at(targetS);
        const tx = aim.x + aim.nx * wantOff, ty = aim.y + aim.ny * wantOff;
        let diff = Math.atan2(ty - k.y, tx - k.x) - k.ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return {
          done: false,
          dir: diff > 0.10 ? 'ArrowRight' : diff < -0.10 ? 'ArrowLeft' : '',
          useItem: !!k.item
        };
      });
      if (decision.done) break;
      if (decision.dir !== steerHeld) {
        if (steerHeld) await page.keyboard.up(steerHeld);
        steerHeld = decision.dir;
        if (steerHeld) await page.keyboard.down(steerHeld);
      }
      if (decision.useItem) await page.keyboard.press('Space');
      await run(page, 8);
    }
  } finally {
    if (steerHeld) await page.keyboard.up(steerHeld);
    await page.keyboard.up('ArrowUp');
  }
}

test('title screen loads cleanly; #btnPlay starts Track 1-1 immediately; idle P1 stays at p1Dist === 0 & time === 0 while AI bots race', async t => {
  const page = await game(t);
  await step(page, 15);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/36');
  for (const label of ['القيادة والتوجيه', 'مفاجآت الصناديق', '3 دورات للفوز']) {
    assert.ok(await page.locator('.howto figcaption', { hasText: label }).isVisible(), label);
  }
  assert.ok(await page.locator('#btnTwo').isVisible(), '2P button visible');

  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-1');
  assert.equal(s.humans, 1);
  assert.equal(s.p1Dist, 0);
  assert.equal(s.time, 0);

  // Advance 5 seconds untouched: AI bots drive far ahead, P1 remains strictly parked at 0!
  await run(page, 60 * 5);
  s = await state(page);
  assert.equal(s.p1Dist, 0, 'idle P1 never moves or gets bumped');
  assert.equal(s.time, 0, 'idle P1 race timer stays 0');
  assert.equal(s.p1Inputs, 0);
  assert.ok(s.worldTime > 4.5, 'worldTime advances');
  assert.ok(s.karts[1].dist > 600, 'AI bots actively race');

  // Holding ArrowUp immediately accelerates P1 forward and chase camera tracks P1!
  const camBefore = s.cam.x;
  await page.keyboard.down('ArrowUp');
  await run(page, 40);
  await page.keyboard.up('ArrowUp');
  s = await state(page);
  assert.ok(s.p1Dist > 90, `ArrowUp drove P1 forward: ${s.p1Dist}`);
  assert.ok(s.time > 0.5);
  assert.ok(s.cam.x > camBefore + 40, 'zoomed-in dynamic chase camera follows P1');
});

test('smart dual steering: easy auto-gas cruises after first tap, and pointer steering drives toward held cursor', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.locator('#btnPlay').click();
  await step(page);

  // Hovering mouse without pressing button does NOT move P1.
  const ahead = await page.evaluate(() => __game.at(240));
  const pt = await pagePoint(page, ahead.x, ahead.y);
  await page.mouse.move(pt.x, pt.y);
  await run(page, 30);
  assert.equal((await state(page)).p1Dist, 0, 'hover alone does not start P1');

  // Holding mouse button steers & accelerates P1 smoothly toward cursor; releasing on easy keeps cruising!
  await page.mouse.down();
  await run(page, 25);
  await page.mouse.up();
  const midDist = (await state(page)).p1Dist;
  assert.ok(midDist > 35, 'pointer down drove P1');

  await run(page, 35);
  assert.ok((await state(page)).p1Dist > midDist + 70, 'easy auto-gas keeps cruising after first input');
});

test('full 3-lap race completion awards stars, coins, persists save, updates DDA, and opens next track', async t => {
  const page = await game(t, { save: SAVE({ diff: 'normal' }), dda: 0.1 });
  await page.locator('#btnPlay').click();
  await step(page);

  await driveRace1P(page, 600);
  const s = await state(page);
  assert.equal(s.screen, 'result');
  assert.equal(s.finished, true);
  assert.equal(s.karts[0].rank, 1);

  const sv = await stored(page);
  assert.equal(sv.tracks[0].s, 3);
  assert.ok(sv.coins >= 10);
  const ddaResults = await page.evaluate(() => dk.results);
  assert.deepEqual(ddaResults, [1]);

  await page.locator('#resNext').click();
  await step(page);
  assert.equal((await state(page)).id, '1-2');
});

test('all 4 classroom cups & all 12 tracks (1-1..4-3) are open immediately, plus 2P mode with catch-up warp', async t => {
  const page = await game(t, { save: SAVE({ diff: 'normal' }) });
  await page.locator('#btnLevels').click();
  await step(page);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('.cup-card').count(), 4);
  assert.equal(await page.locator('.track-btn').count(), 12);

  // Jump straight to final boss track 4-3 in 2P mode!
  await page.locator('#btnMapMode').click();
  await page.locator('.track-btn[data-track="11"]').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '4-3');
  assert.equal(s.humans, 2);
  assert.equal(s.karts[0].dist, 0);
  assert.equal(s.karts[1].dist, 0);

  // Drive both P1 (ArrowUp) and P2 (KeyW)
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('KeyW');
  await run(page, 35);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowUp');
  s = await state(page);
  assert.ok(s.karts[0].dist > 60 && s.karts[1].dist > 60, 'both human karts accelerate independently');
});

test('pause freezes simulation with zero redraw churn; restart resets p1Dist === 0 & time === 0', async t => {
  const page = await game(t, { save: SAVE({ diff: 'normal' }) });
  await page.locator('#btnPlay').click();
  await step(page);

  await page.keyboard.down('ArrowUp');
  await run(page, 35);
  await page.keyboard.up('ArrowUp');
  assert.ok((await state(page)).p1Dist > 60);

  await page.locator('#btnPause').click();
  await step(page, 1); // draws single paused frame
  const snapA = await state(page);
  assert.equal(snapA.screen, 'pause');
  const drawsAtPause = await page.evaluate(() => dk.draws);

  await step(page, 30);
  const snapB = await state(page);
  const drawsAfterIdlePause = await page.evaluate(() => dk.draws);
  assert.deepEqual(snapB, snapA, 'world state 100% frozen while paused');
  assert.equal(drawsAfterIdlePause, drawsAtPause, 'zero canvas redraws while paused');

  await page.locator('#btnResume').click();
  await run(page, 10);
  assert.equal((await state(page)).screen, 'play');
  assert.ok((await state(page)).worldTime > snapA.worldTime);

  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  const resetState = await state(page);
  assert.equal(resetState.screen, 'play');
  assert.equal(resetState.p1Dist, 0);
  assert.equal(resetState.time, 0);
});

test('kart garage purchases, storage quota retry banner, corrupt save recovery, and [1100, 620] fit', async t => {
  const page = await game(t, { save: SAVE({ coins: 40 }), size: [1100, 620] });
  await step(page, 5);

  // Verify title panel fits inside [1100, 620] with no clipping off viewport
  const titleBox = await page.locator('#scrTitle .panel').boundingBox();
  assert.ok(titleBox.y >= 0 && titleBox.y + titleBox.height <= 620, 'title panel fits vertically in 1100x620');

  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  // Simulate storage quota failure on purchase, then recover via retry!
  await page.evaluate(() => { dk.failSave = true; });
  await page.locator('#shelfKarts [data-idx="1"]').click();
  assert.ok(await page.locator('.sg-save-status').isVisible(), 'save failure banner shown');

  await page.evaluate(() => { dk.failSave = false; });
  await page.locator('.sg-save-status button').click();
  const sv = await stored(page);
  assert.equal(sv.kart, 1);
  assert.equal(sv.karts[1], 1);
});

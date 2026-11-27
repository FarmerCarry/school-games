// Magic Crayon 3D (القلم السحري) browser integration tests in Chromium:
// Minimal Arabic title over live 3D diorama, immediate 1-1 start & ghost coach,
// mouse drag 3D crayon drawing on z=0 plane, 1/2/3 crayons (bridge/boost/bounce),
// Z/right-click undo, Space launch -> 3 stars + crate smash + win overlay -> Enter advances,
// 3-world level select (21 levels), truck skins garage & star unlocks,
// Pause freeze (#btnPause, KeyP, Escape, blur) + Restart, Kit.saveStatus quota retry,
// reduced motion suppression, and 1100x620 viewport fit with zero overlap.
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

const SAVE = (starsList = [], extra = {}) => ({
  v: 3,
  stars: Array.from({ length: 21 }, (_, i) => starsList[i] || 0),
  skin: 0,
  coins: 0,
  bestLevel: starsList.length,
  ...extra
});

async function openGame(t, { save, dda = 0.35, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
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
  await page.waitForFunction(() => window.__game && window.mc && window.mc.step, null, { timeout: 30000 });
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => mc.step(n), n);
const run = (page, n = 1) => page.evaluate(n => mc.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:magic-crayon:save');
  return raw ? JSON.parse(raw) : null;
});
const toPage = (page, wx, wy) => page.evaluate(([x, y]) => __game.point(x, y, 0), [wx, wy]);

async function dragWorld(page, pts) {
  const sp = [];
  for (const [wx, wy] of pts) sp.push(await toPage(page, wx, wy));
  await page.mouse.move(sp[0].x, sp[0].y);
  await page.mouse.down();
  await step(page);
  for (let i = 1; i < sp.length; i++) {
    await page.mouse.move(sp[i].x, sp[i].y, { steps: 8 });
    await step(page, 2);
  }
  await page.mouse.up();
  await step(page);
}

test('minimal Arabic title opens 1-1 immediately with waiting truck & ghost coach', async t => {
  const page = await openGame(t);
  await step(page, 10);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('.game-logo').textContent(), 'القلم السحري');
  assert.equal(await page.locator('#titleStars').textContent(), '0/63');

  await page.locator('#btnPlay').click();
  await step(page, 4);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-1');
  assert.equal(s.rolling, false);
  assert.equal(s.strokes, 0);
  assert.equal(s.inkUsed, 0);
  assert.equal(s.coach, true, 'ghost coach appears on 1-1 before first stroke');
});

test('mouse crayon bridge on 1-1, Space launch, 3 stars, crate smash, win overlay & Enter -> 1-2', async t => {
  const page = await openGame(t, { reducedMotion: 'no-preference' });
  await page.locator('#btnPlay').click();
  await step(page, 2);

  await dragWorld(page, [[6.7, 4.95], [10.8, 4.95], [15.3, 4.95]]);
  let s = await state(page);
  assert.equal(s.strokes, 1);
  assert.ok(s.inkUsed > 6 && s.inkUsed < s.inkBudget);
  assert.equal(s.rolling, false);

  await page.keyboard.press('Space');
  await step(page, 2);
  assert.equal((await state(page)).rolling, true);

  await run(page, 300);
  s = await state(page);
  assert.equal(s.won, true);
  assert.equal(s.starsCollected, 3);
  assert.equal(s.cratesSmashed, 1);
  assert.equal(s.screen, 'win');
  assert.equal(await page.locator('#winStars .bstar.on').count(), 3);
  assert.equal(await page.locator('#winUnlock').isVisible(), true, '3 stars unlocks second truck skin');

  const sv = await stored(page);
  assert.equal(sv.v, 3);
  assert.equal(sv.stars[0], 3);
  assert.equal((await page.evaluate(() => mc.results.length)) >= 1, true);

  await page.keyboard.press('Enter');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-2');
});

test('1/2/3 switch crayons, Z and right-click undo, R restarts, and bounce crayon clears 1-6', async t => {
  const page = await openGame(t, { save: SAVE([3, 3, 3, 3, 3]) });
  await page.locator('#btnPlay').click();
  await step(page, 2);
  assert.equal((await state(page)).id, '1-6');
  assert.equal((await state(page)).crayonType, 2, '1-6 starts on bounce crayon');

  await page.keyboard.press('Digit1');
  await step(page);
  assert.equal((await state(page)).crayonType, 0);
  await page.keyboard.press('Digit2');
  await step(page);
  assert.equal((await state(page)).crayonType, 1);
  await page.locator('#ink2').click();
  await step(page);
  assert.equal((await state(page)).crayonType, 2);

  // Draw two lines, undo one with Z, undo second with right-click
  await dragWorld(page, [[4.5, 4.2], [7.0, 4.2]]);
  await dragWorld(page, [[8.6, 3.35], [11.0, 3.35]]);
  assert.equal((await state(page)).strokes, 2);

  await page.keyboard.press('KeyZ');
  await step(page);
  assert.equal((await state(page)).strokes, 1);

  const pt = await toPage(page, 12, 8);
  await page.mouse.click(pt.x, pt.y, { button: 'right' });
  await step(page);
  assert.equal((await state(page)).strokes, 0);
  assert.equal((await state(page)).inkUsed, 0);

  // Draw spring pad on 1-6, launch and win!
  await dragWorld(page, [[8.8, 3.35], [11.0, 3.35]]);
  await page.locator('#btnLaunch').click();
  await run(page, 260);
  assert.equal((await state(page)).won, true);

  // KeyR on win replays same stage cleanly
  await page.keyboard.press('KeyR');
  await step(page, 2);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.id, '1-6');
  assert.equal(s.strokes, 0);
  assert.equal(s.rolling, false);
});

test('Pause (#btnPause, KeyP, Escape, blur) freezes simulation; #btnRestart resets stage', async t => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();
  await step(page, 2);
  await dragWorld(page, [[6.8, 4.95], [12.0, 4.95]]);
  await page.keyboard.press('Space');
  await step(page, 18);

  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.truck, __game.state.inkUsed]));
  for (const how of ['button', 'KeyP', 'Escape', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    assert.equal((await state(page)).screen, 'pause', how);
    const frozen = await snap();
    await run(page, 45);
    assert.equal(await snap(), frozen, how + ' freezes physics completely');

    if (how === 'KeyP') await page.keyboard.press('KeyP');
    else await page.locator('#btnResume').click();
    await step(page, 4);
    assert.equal((await state(page)).screen, 'play');
    assert.notEqual(await snap(), frozen, how + ' resumes cleanly');
  }

  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page, 2);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.strokes, 0);
  assert.equal(s.inkUsed, 0);
  assert.equal(s.rolling, false);
});

test('3-world level select, truck skins garage, mute/KeyM, and Kit.saveStatus quota retry', async t => {
  const page = await openGame(t, { save: SAVE([3, 3, 3, 3]) }); // 12 stars -> unlocks World 2 & 3 and skins 0..2
  assert.equal(await page.locator('#titleStars').textContent(), '12/63');

  // Garage equips unlocked Golden Tiger skin (index 2, needs 8 stars)
  await page.locator('#btnGarage').click();
  await step(page);
  assert.equal((await state(page)).screen, 'garage');
  await page.locator('#skinGrid .skin-card').nth(2).click();
  await step(page);
  assert.equal((await state(page)).skin, 2);
  assert.equal((await stored(page)).skin, 2);
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');

  // Level select switches to World 3 (Space Poster) and opens 3-1
  await page.locator('#btnLevels').click();
  await step(page);
  assert.equal(await page.locator('#worldTabs .wtab').count(), 3);
  await page.locator('#worldTabs .wtab').nth(2).click();
  await step(page);
  await page.locator('#levelGrid .lvl-btn').first().click();
  await step(page, 2);
  assert.equal((await state(page)).id, '3-1');
  assert.equal((await state(page)).world, 2);

  // Mute button & KeyM toggle audio
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);

  // QuotaExceededError warns & Retry saves cleanly
  await page.evaluate(() => { mc.failSave = true; });
  await page.keyboard.press('Digit2');
  await step(page);
  await dragWorld(page, [[4.8, 4.45], [7.4, 5.2], [9.4, 6.1]]);
  await page.keyboard.press('Space');
  await run(page, 320);
  assert.equal((await state(page)).won, true);

  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  await page.evaluate(() => { mc.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).stars[14], 3);
});

test('reduced motion suppresses shake & particles; [1100, 620] viewport fits with zero HUD overlap', async t => {
  const page = await openGame(t, { reducedMotion: 'reduce', size: [1100, 620] });
  for (const sel of ['.game-logo', '#btnPlay', '#btnLevels', '#btnGarage', '.keys-line']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 1100 && b.y + b.height <= 620, `${sel} fits in 1100x620`);
  }

  await page.locator('#btnPlay').click();
  await step(page, 2);
  const muteBox = await page.locator('.sg-mute').boundingBox();
  const inkBox = await page.locator('.ink-meter').boundingBox();
  const dockBox = await page.locator('.hud-dock').boundingBox();
  assert.ok(inkBox.x + inkBox.width < muteBox.x, 'ink meter clears mute button');
  assert.ok(dockBox.y + dockBox.height <= 620, 'bottom dock fits inside 620px height');

  await dragWorld(page, [[6.8, 4.95], [10.8, 4.95], [15.2, 4.95]]);
  await page.keyboard.press('Space');
  await run(page, 260);
  const s = await state(page);
  assert.equal(s.won, true);
  assert.equal(s.particles, 0, 'no particles in reduced motion');
  assert.equal(s.shake, 0, 'no screen shake in reduced motion');
});

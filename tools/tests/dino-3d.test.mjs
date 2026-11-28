// Dino 3D 3-Lane Stampede browser integration tests in real Chromium:
// fast non-blocking boot, 3-lane keyboard + mouse-X steering, Jump/Click/Duck button/Right-Click,
// Rampage Roar + Magma Boulder HUD, pause/blur lifecycle, lazy wardrobe + Kit.saveStatus retry,
// endless 4-digit seeds, and Arabic WebGL fallback (#scrError).
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

const SAVE = (extra = {}) => ({
  v: 3, stars: Array(15).fill(0), best: Array(15).fill(0),
  bank: 0, far: 0, color: 0, hat: 0, seenBank: 0, coached: true, ...extra
});

async function openGame(t, { save, ddaStart = {}, deniedStorage = false, disableWebGL = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  context.on('request', req => { if (!req.url().startsWith(server.origin)) errors.push('External: ' + req.url()); });
  t.after(async () => {
    await context.close();
    if (!disableWebGL) assert.deepEqual(errors, [], 'zero page/console errors or external requests');
  });

  await context.addInitScript(({ save, ddaStart, deniedStorage, disableWebGL }) => {
    if (!/\/games\/dino-3d\//.test(location.pathname)) return;
    if (!sessionStorage.getItem('dino3d-seeded')) {
      sessionStorage.setItem('dino3d-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:dino-3d:save', JSON.stringify(save));
    }
    if (disableWebGL) {
      HTMLCanvasElement.prototype.getContext = function () { return null; };
    }
    let kit, update, render;
    const probe = window.dinoProbe = { results: [], ready: 0, failed: 0, failSave: false, writes: 0 };
    probe.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
    probe.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(val) {
        kit = val;
        kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
        const origDda = kit.dda;
        kit.dda = (slug, opts = {}) => {
          const id = opts.id || 'main';
          const ctrl = origDda.call(kit, slug, Object.assign({ start: ddaStart[id] }, opts));
          const origRes = ctrl.result;
          ctrl.result = out => { probe.results.push([id, out]); return origRes.call(ctrl, out); };
          return ctrl;
        };
        const origReady = kit.ready;
        kit.ready = (...a) => { probe.ready++; return origReady.apply(kit, a); };
        const origFail = kit.fail;
        kit.fail = (...a) => { probe.failed++; return origFail.apply(kit, a); };
      }
    });
    const setItem = Storage.prototype.setItem, getItem = Storage.prototype.getItem;
    Storage.prototype.setItem = function (k) {
      if (k === 'sg:dino-3d:save') probe.writes++;
      if (deniedStorage || (probe.failSave && k === 'sg:dino-3d:save')) throw new DOMException('Storage blocked', 'QuotaExceededError');
      return setItem.apply(this, arguments);
    };
    Storage.prototype.getItem = function () {
      if (deniedStorage) throw new DOMException('Storage blocked', 'SecurityError');
      return getItem.apply(this, arguments);
    };
  }, { save, ddaStart, deniedStorage, disableWebGL });

  await page.goto(`${server.origin}/games/dino-3d/`);
  if (!disableWebGL) {
    await page.waitForFunction(() => !!window.Dino3DGame && !!window.__game && window.dinoProbe.ready === 1, null, { polling: 40 });
  }
  return page;
}

const getState = page => page.evaluate(() => Dino3DGame.state);
const getMode = page => page.evaluate(() => Dino3DGame.mode);
const step = (page, n = 1) => page.evaluate(n => dinoProbe.step(n), n);
const run = (page, n = 1) => page.evaluate(n => dinoProbe.run(n), n);
const visible = (page, sel) => page.locator(sel).isVisible();

async function key(page, code, how = 'press') {
  for (const type of how === 'press' ? ['keydown', 'keyup'] : [how === 'down' ? 'keydown' : 'keyup']) {
    await page.evaluate(([c, tp]) => {
      window.__keySeen = new Promise(res => addEventListener(tp, function h(e) {
        if (e.code === c) { removeEventListener(tp, h); res(); }
      }));
    }, [code, type]);
    await (type === 'keydown' ? page.keyboard.down(code) : page.keyboard.up(code));
    await page.evaluate(() => window.__keySeen);
  }
}

async function focusSurface(page) {
  await page.evaluate(() => { document.activeElement?.blur(); document.getElementById('scene').focus(); Kit.keys.reset(); });
}

test('title screen, 1-click Enter start, 3-lane keyboard + Jump/Click + Duck button + Rampage HUD', async t => {
  const page = await openGame(t);
  await step(page, 2);
  assert.equal(await getMode(page), 'title');
  assert.ok(await visible(page, '#title') && await visible(page, '#play'));
  assert.equal(await visible(page, '#pause-button'), false);

  // Lazy map & wardrobe DOM is NOT pre-built during fast boot!
  assert.equal(await page.locator('#cards .world-card').count(), 0, 'map builds lazily on demand');

  // Enter starts Level 1-1 directly
  await focusSurface(page);
  await key(page, 'Enter');
  await step(page, 2);
  let s = await getState(page);
  assert.equal(s.mode, 'playing');
  assert.equal(s.id, 'w1-1');
  assert.equal(s.player.lane, 0);
  assert.ok(await visible(page, '#btn-duck'), 'clickable duck button visible for mouse-only players');

  // ArrowLeft / ArrowRight snaps crisply across 3 lanes
  await key(page, 'ArrowLeft');
  await step(page, 4);
  assert.equal((await getState(page)).player.lane, -1, 'ArrowLeft moves to left lane');
  await key(page, 'ArrowRight');
  await step(page, 4);
  assert.equal((await getState(page)).player.lane, 0, 'ArrowRight moves to center lane');
  await key(page, 'KeyD');
  await step(page, 4);
  assert.equal((await getState(page)).player.lane, 1, 'KeyD moves to right lane');

  // Space jumps and increments inputJumps
  const j0 = await page.evaluate(() => Dino3DGame.inputJumps);
  await key(page, 'Space');
  await step(page, 6);
  s = await getState(page);
  assert.ok(s.player.y > 0.35, 'Space lifts dino: ' + s.player.y);
  assert.equal(await page.evaluate(() => Dino3DGame.inputJumps), j0 + 1);

  // Land, then mouse click jumps too
  await run(page, 70);
  await page.mouse.click(550, 310);
  await step(page, 6);
  assert.ok((await getState(page)).player.y > 0.35, 'mouse click jumps');
  assert.equal(await page.evaluate(() => Dino3DGame.inputJumps), j0 + 2);

  // Land, then clickable #btn-duck triggers duck slide for mouse players
  await run(page, 70);
  await page.locator('#btn-duck').click();
  await step(page, 3);
  assert.equal((await getState(page)).player.duck, true, 'clickable #btn-duck activates duck slide');
  await run(page, 50);
  assert.equal((await getState(page)).player.duck, false, 'tap-slide ends cleanly');

  // Filling Rampage gauge triggers 5s golden invincible Rampage!
  await page.evaluate(() => { Dino3DGame.world.p.roar = 1; });
  await page.locator('#roar').click();
  await step(page, 2);
  s = await getState(page);
  assert.equal(s.player.roar, true, 'Rampage Roar activates cleanly');
  assert.ok(s.rampageT > 4.5, '5s golden Rampage timer active: ' + s.rampageT);
});

test('pause, resume, focus loss lifecycle, and clean Restart reset', async t => {
  const page = await openGame(t, { save: SAVE() });
  await page.locator('#play').click();
  await step(page, 2);
  await run(page, 80);

  await key(page, 'KeyP');
  await step(page);
  assert.equal(await getMode(page), 'paused');
  assert.ok(await visible(page, '#pause-screen'));

  const frozen = JSON.stringify(await getState(page));
  await run(page, 180);
  await step(page);
  assert.equal(JSON.stringify(await getState(page)), frozen, 'simulation stays frozen while paused');

  await page.locator('#restart').click();
  await step(page, 2);
  const s = await getState(page);
  assert.equal(s.mode, 'playing');
  assert.ok(s.distance < 1, 'distance reset after restart');
  assert.equal(s.score, 0, 'score reset after restart');

  await run(page, 30);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await run(page, 2);
  assert.equal(await getMode(page), 'paused', 'blur pauses gameplay');
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await run(page, 30);
  assert.equal(await getMode(page), 'paused', 'focus return never auto-resumes');
});

test('lazy wardrobe unlocks, persistence, and Kit.saveStatus retry on storage failure', async t => {
  const page = await openGame(t, { save: SAVE({ bank: 30, seenBank: 0 }) });
  assert.ok(await page.locator('#btn-wardrobe.has-new').isVisible(), 'wardrobe badge highlights new unlock');

  await page.locator('#btn-wardrobe').click();
  await step(page, 2);
  assert.equal(await getMode(page), 'wardrobe');

  await page.locator('#colors .swatch').nth(5).click();
  assert.equal((await page.evaluate(() => Dino3DGame.save)).color, 0, 'locked color stays locked');
  await page.locator('#colors .swatch').nth(1).click();
  await page.locator('#hats .swatch').nth(1).click();
  const saved = await page.evaluate(() => Dino3DGame.save);
  assert.equal(saved.color, 1);
  assert.equal(saved.hat, 1);

  await page.evaluate(() => { window.dinoProbe.failSave = true; });
  await page.locator('#hats .swatch').nth(0).click();
  assert.ok(await visible(page, '.sg-save-status'), 'save failure banner shown');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('sg:dino-3d:save'))).hat, 1, 'prior save preserved on failure');

  await page.evaluate(() => { window.dinoProbe.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('sg:dino-3d:save'))).hat, 0, 'retry writes updated save');
});

test('endless mode 4-digit seed validation and deterministic 3-lane layout', async t => {
  const page = await openGame(t, { save: SAVE() });
  await page.locator('#btn-endless').click();
  await step(page);
  await page.locator('#code-btn').click();
  await page.locator('#code-input').fill('12');
  await page.locator('#code-go').click();
  assert.ok(await visible(page, '#code-error'), 'invalid code displays Arabic error');

  await page.locator('#code-input').fill('0420');
  await page.locator('#code-go').click();
  await step(page, 2);
  assert.equal((await getState(page)).code, '0420');
  const firstLayout = await page.evaluate(() => Dino3DGame.world.obs.slice(0, 6).map(o => [o.kind, o.lane, Math.round(o.x * 100)]));

  await page.locator('#pause-button').click();
  await page.locator('#restart').click();
  await step(page, 2);
  const secondLayout = await page.evaluate(() => Dino3DGame.world.obs.slice(0, 6).map(o => [o.kind, o.lane, Math.round(o.x * 100)]));
  assert.deepEqual(secondLayout, firstLayout, 'restarting with same 4-digit code reproduces exact 3-lane layout');
});

test('WebGL-unavailable fallback shows Arabic #scrError without crashing', async t => {
  const page = await openGame(t, { disableWebGL: true });
  await page.waitForFunction(() => window.dinoProbe && window.dinoProbe.failed >= 1, null, { timeout: 6000, polling: 50 });
  assert.ok(await visible(page, '#scrError'), 'Arabic WebGL fallback card is visible');
  assert.equal(await page.evaluate(() => document.body.dataset.mode), 'error');
});

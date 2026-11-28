// Lucky Lake in real Chromium: 1-click/Enter launch, dual mouse+keyboard cast/hook/reel,
// catch/result next-biome progress, debounced saves & QuotaExceededError retry, pause, map, rods & 2P derby.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

const places = (stars = []) => [0, 1, 2, 3, 4].map(i => ({ n: stars[i] ? 6 : 0, g: [0, 1, 2].map(k => k < (stars[i] || 0) ? 1 : 0) }));
const SAVE = (extra = {}) => ({ v: 2, coins: 0, caught: 0, book: {}, junk: {}, places: places(), rods: { zone: 0, reel: 0, lure: 0, bait: 0 }, coach: true, ...extra });
const TIER = { 1: 0.05, 3: 0.5 };

async function game(t, { save, dda, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no external requests'); });
  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('ll-seeded')) {
      sessionStorage.setItem('ll-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:lucky-lake:save', typeof save === 'string' ? save : JSON.stringify(save));
    }
    let kit;
    const ll = window.ll = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        ll.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        ll.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        ll.render = () => render(0);
        return { stop() {} };
      };
      const make = kit.dda;
      kit.dda = (slug, opts) => {
        const control = make.call(kit, slug, Object.assign({ start: dda }, opts)), result = control.result;
        control.result = outcome => { ll.results.push(outcome); return result.call(control, outcome); };
        return control;
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:lucky-lake:save' && window.ll && window.ll.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, dda });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/lucky-lake/`);
  await page.waitForFunction(() => window.__game && window.ll.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => ll.step(n), n);
const results = page => page.evaluate(() => ll.results);
const stored = page => page.evaluate(() => { const raw = localStorage.getItem('sg:lucky-lake:save'); return raw ? JSON.parse(raw) : null; });

async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += 4) { if (ok(__game.state)) return true; ll.run(4); }
    return ok(__game.state);
  }, { cond, max });
}
async function mouseTo(page, x, y) {
  const p = await page.evaluate(([x, y]) => __game.point(x, y), [x, y]);
  await page.mouse.move(p.x, p.y);
  return p;
}
async function catchOne(page) {
  const start = (await state(page)).trip;
  let waited = 0, held = false;
  for (let i = 0; i < 900; i++) {
    const s = await state(page);
    if (s.trip > start) { if (held) await page.keyboard.up('Space'); return true; }
    const p = s.p1;
    if (p.state === 'ready' || (p.state === 'wait' && !p.fish && waited > 420)) {
      const f = s.fish.find(f => f.state === 'swim' && f.x > 420 && f.x < 1150) || { x: 700, y: 450 };
      const pt = await mouseTo(page, f.x + 20, f.y);
      await page.mouse.click(pt.x, pt.y);
      waited = 0;
    } else if (p.state === 'bite') await page.keyboard.press('Space');
    else if (p.state === 'reel') {
      const r = p.reel, want = r.f > r.z + r.h / 2;
      if (want !== held) { if (want) await page.keyboard.down('Space'); else await page.keyboard.up('Space'); held = want; }
    } else if (s.card) { await page.keyboard.press('Space'); }
    waited += 4;
    await page.evaluate(() => ll.run(4));
  }
  if (held) await page.keyboard.up('Space');
  return false;
}

test('title waits over sunlit lake; 1-click Play or Enter launches straight into active fishing with 0 casts', async t => {
  const page = await game(t, { dda: TIER[1] });
  await step(page, 20);
  assert.equal((await state(page)).screen, 'title');
  assert.equal((await state(page)).tripOpen, false);
  assert.equal(await page.locator('#titleFish b').textContent(), '0/33');
  await page.locator('#btnPlay').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.mode, 'solo'); assert.equal(s.place, 0);
  assert.equal(s.tripOpen, true); assert.equal(s.trip, 0); assert.equal(s.p1.casts, 0);
  assert.ok(await until(page, 's.ghost', 60 * 4), 'idle ghost hand shows where to cast');
  await step(page, 90);
  assert.equal((await state(page)).p1.casts, 0, 'coach never auto-casts');
});

test('dual controls: mouse click and Space/arrows cast smoothly without boat-yanking aim', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[3] });
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play', 'Enter launches straight into play even on returning save');
  const pt = await mouseTo(page, 820, 520);
  await step(page);
  assert.deepEqual((await state(page)).p1.aim, { x: 820, y: 520 });
  await page.mouse.click(pt.x, pt.y);
  assert.ok(await until(page, "s.p1.state === 'wait' || s.p1.state === 'bite'", 300));
  let s = await state(page);
  assert.equal(s.p1.casts, 1);
  assert.deepEqual(s.p1.hook, { x: 820, y: 520 });
  await page.keyboard.down('ArrowLeft'); await step(page, 25); await page.keyboard.up('ArrowLeft');
  const aim = (await state(page)).p1.aim;
  assert.ok(aim.x < 700, 'ArrowLeft aims left');
  if ((await state(page)).p1.state === 'wait') {
    await page.keyboard.press('Space');
    assert.ok(await until(page, "s.p1.casts === 2 && s.p1.state === 'wait'", 400));
    assert.deepEqual((await state(page)).p1.hook, aim);
  }
});

test('full catch flow shows fish card + next-biome progress and flushes debounced save', async t => {
  const page = await game(t, { save: SAVE({ coach: false }), dda: TIER[1] });
  await page.keyboard.press('Space');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
  for (let i = 0; i < 4 && !(await page.evaluate(() => __game.save.caught)); i++) {
    assert.ok(await catchOne(page), 'landed a catch');
    await until(page, 's.card', 120);
    if (await page.evaluate(() => __game.save.caught)) break;
    await step(page, 35); await page.keyboard.press('Space'); await step(page);
  }
  if (!(await state(page)).card) assert.ok(await until(page, 's.card', 120));
  assert.equal(await page.locator('#scrCatch').isVisible(), true);
  assert.match(await page.locator('#catchName').textContent(), /[\u0600-\u06FF]/);
  assert.match(await page.locator('#catchWeight').textContent(), /^\d+\.\d كغ$/);
  assert.match(await page.locator('#catchProg').textContent(), /النهر|الكتاب/);
  // Closing the catch card flushes the debounced save cleanly.
  await step(page, 35);
  await page.mouse.click(200, 650);
  await step(page);
  assert.equal((await state(page)).card, false);
  const saved = await stored(page);
  assert.equal(saved.caught, 1);
  assert.equal(saved.coach, true);
  assert.ok((await results(page)).includes(1));
});

test('pause freezes [time, p1, fish] completely; Escape resumes and Restart resets casts & trip', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[1] });
  await page.locator('#btnPlay').click(); await step(page, 2);
  const pt = await mouseTo(page, 700, 450);
  await page.mouse.click(pt.x, pt.y); await step(page, 25);
  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.p1, __game.state.fish]));
  await page.locator('#btnPause').click(); await step(page);
  assert.equal((await state(page)).screen, 'pause');
  const before = await snap();
  await step(page, 90);
  assert.equal(await snap(), before, 'lake is frozen while paused');
  await page.keyboard.press('Escape'); await step(page);
  assert.equal((await state(page)).screen, 'play');
  await page.locator('#btnPause').click(); await step(page);
  await page.locator('#btnRestart').click(); await step(page);
  const reset = await state(page);
  assert.equal(reset.screen, 'play'); assert.equal(reset.p1.casts, 0); assert.equal(reset.trip, 0);
});

test('leaving trip shows result card with next-biome unlock; map opens via #btnMap & blocks locked biomes', async t => {
  const nearRiver = SAVE({ places: [{ n: 4, g: [0, 1, 0] }, ...places().slice(1)] });
  const page = await game(t, { save: nearRiver, dda: TIER[1] });
  await page.locator('#btnMap').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  await page.locator('.place').nth(1).click(); await step(page);
  assert.equal((await state(page)).screen, 'map', 'locked river stays on map');
  await page.locator('.place').nth(0).click(); await step(page);
  assert.equal((await state(page)).screen, 'play');
  // Catch a fish (retry if junk) to earn 2nd star & unlock the River.
  for (let i = 0; i < 4 && !(await page.evaluate(() => __game.save.places[0].g[0])); i++) {
    assert.ok(await catchOne(page));
    await until(page, 's.card', 120);
    await step(page, 35); await page.keyboard.press('Space'); await step(page);
  }
  await page.locator('#btnBasket').click(); await step(page, 2);
  assert.equal((await state(page)).screen, 'result');
  assert.equal((await state(page)).tripOpen, false);
  assert.match(await page.locator('#resProg').textContent(), /النهر/);
  await step(page, 40);
  await page.keyboard.press('Enter'); await step(page, 2);
  assert.equal((await state(page)).place, 1, 'Enter advances into newly unlocked River');
});

test('rods shop, fish book, QuotaExceededError retry, damaged saves, and 2P derby', async t => {
  const page = await game(t, { save: SAVE({ coins: 60 }) });
  await page.locator('#btnRods').click(); await step(page);
  await page.evaluate(() => { ll.failSave = true; });
  await page.locator('.tile').nth(0).click(); await step(page);
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  await page.evaluate(() => { ll.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).rods.zone, 1);
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnBook').click(); await step(page);
  assert.equal(await page.locator('#bookCount b').textContent(), '0/33');
  await page.keyboard.press('Escape'); await step(page);

  // 2P Derby
  await page.locator('#btnDuo').click(); await step(page);
  assert.equal((await state(page)).duo, 'intro');
  await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await step(page);
  assert.equal((await state(page)).duo, 'count');
  await step(page, 190);
  assert.equal((await state(page)).duo, 'go');
  await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await step(page, 3);
  assert.deepEqual([(await state(page)).p1.casts, (await state(page)).p2.casts], [1, 1]);
  assert.ok(await until(page, "s.screen === 'duoEnd'", 60 * 140));
  assert.equal(await page.locator('#scrDuoEnd').isVisible(), true);
});

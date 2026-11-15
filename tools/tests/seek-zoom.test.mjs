// Seek and Zoom in real Chromium: the world stays fixed full-screen (never dragged);
// the magnifying glass button, keys and mouse wheel (and Ctrl+wheel) control the movable
// lens without scrolling or zooming the page; clicks find things through or outside the
// lens; whole rounds, stickers, instant lightbulb hints, timed rounds, pause, saves and fit.
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

// A save with the first n rounds finished (2 stars each).
const SAVE = (n = 0, extra = {}) => {
  const r = [];
  for (let i = 0; i < 25; i++) r.push(i < n ? [2, 600] : [0, 0]);
  return { v: 1, r, coach: [1, 1], ...extra };
};
// DDA levels: 0.05 is tier 1 (biggest things, no look-alikes, the hint shows by itself),
// 0.5 is tier 3 (look-alikes, wrong clicks in a row cost seconds).
const TIER = { 1: 0.05, 3: 0.5 };

// The game with its frame loop stepped by hand, every Kit.dda result recorded
// (sz.results), and a storage that can be told to fail. No page errors, no console
// errors, no requests off the server.
async function game(t, { save, dda, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await ctx.addInitScript(({ save, dda }) => {
    // Seeded once per tab, so a reload keeps what the game saved.
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('sz-seeded')) {
      sessionStorage.setItem('sz-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:seek-zoom:save', typeof save === 'string' ? save : JSON.stringify(save));
    }
    let kit;
    const sz = window.sz = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        sz.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        sz.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        return { stop() {} };
      };
      const make = kit.dda;
      kit.dda = (slug, opts) => {
        const control = make.call(kit, slug, Object.assign({ start: dda }, opts)), result = control.result;
        control.result = outcome => { sz.results.push(outcome); return result.call(control, outcome); };
        return control;
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:seek-zoom:save' && window.sz && window.sz.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, dda });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/seek-zoom/`);
  await page.waitForFunction(() => window.__game && window.sz.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => sz.step(n), n);
const items = page => page.evaluate(() => __game.items());
const stored = page => page.evaluate(() => { const raw = localStorage.getItem('sg:seek-zoom:save'); return raw ? JSON.parse(raw) : null; });
// Steps the game until a condition on its state holds (or the step budget runs out),
// drawing once every `every` steps (software-rendered frames are slow).
async function until(page, cond, max = 3600, every = 4) {
  return page.evaluate(({ cond, max, every }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += every) { if (ok(__game.state)) return true; sz.run(every); }
    return ok(__game.state);
  }, { cond, max, every });
}
const run = (page, n) => page.evaluate(n => sz.run(n), n);
// Page coordinates of a logical (1280x720) point, and of a scene point right now.
const at = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);
const sceneAt = (page, x, y) => page.evaluate(([x, y]) => __game.world(x, y), [x, y]);
// The scene point under logical screen point (x, y), accounting for an active lens.
const under = (s, x, y) => {
  if (s.lens && s.lens.on && Math.hypot(x - s.lens.x, y - s.lens.y) <= s.lens.r) {
    const wx = s.cam.x + (s.lens.x - 640) / s.cam.z, wy = s.cam.y + (s.lens.y - 360) / s.cam.z;
    return { x: wx + (x - s.lens.x) / s.lens.z, y: wy + (y - s.lens.y) / s.lens.z };
  }
  return { x: s.cam.x + (x - 640) / s.cam.z, y: s.cam.y + (y - 360) / s.cam.z };
};
async function dragBy(page, x, y, dx, dy) {
  const a = await at(page, x, y), b = await at(page, x + dx, y + dy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await step(page);
}
async function wheelAt(page, x, y, dy = -100, n = 1) {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
  for (let i = 0; i < n; i++) await page.mouse.wheel(0, dy);
  await step(page);
}
// From the title to a round, by the map (a save with progress opens the map).
async function openRound(page, i) {
  await page.locator('#btnPlay').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  await page.locator(`.world:nth-child(${Math.floor(i / 5) + 1}) .rnd:nth-child(${i % 5 + 1})`).click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.index, i);
}
const skipIntro = async page => { await page.keyboard.press('Enter'); await step(page, 2); };
// Finds one thing like a child: moves over its spot on the fixed scene, magnifies if needed, clicks.
async function find(page, it) {
  for (let i = 0; i < 14; i++) {
    const s = await state(page), cur = (await items(page)).find(x => x.id === it.id);
    const z = s.lens.on ? s.lens.z : s.cam.z;
    if (z >= cur.need + 0.02 || z >= s.zmax) break;
    const sx = 640 + (cur.x - s.cam.x) * s.cam.z, sy = 360 + (cur.y - s.cam.y) * s.cam.z;
    await wheelAt(page, sx, sy, -100);
    await step(page, 2);
  }
  const s = await state(page), now = (await items(page)).find(x => x.id === it.id);
  const sx = 640 + (now.x - s.cam.x) * s.cam.z, sy = 360 + (now.y - s.cam.y) * s.cam.z;
  const p = await at(page, sx, sy);
  await page.mouse.move(p.x, p.y);
  await step(page);
  await page.mouse.click(p.x, p.y);
  await step(page);
}
async function findAll(page) {
  for (let k = 0; k < 20; k++) {
    const left = (await items(page)).filter(i => i.e >= 0 && !i.got);
    if (!left.length) return;
    await find(page, left[0]);
  }
}

test('the title waits; Play opens the full fixed park, dragging never moves the world, and the magnifier and hint buttons work right away', async t => {
  const page = await game(t, { dda: TIER[1] });
  await step(page, 30);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/75');
  assert.equal(await page.locator('#howLens').isVisible(), true);
  assert.equal(await page.locator('#howClick').isVisible(), true);
  // On the title the wheel changes the magnifying glass, and the page never scrolls.
  await wheelAt(page, 900, 300, -100, 2);
  assert.ok((await state(page)).lensZ > 2.4 + 0.5);
  await page.locator('#btnPlay').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.index, 0);
  assert.deepEqual(s.cam, { x: 1280, y: 720, z: 0.5 }, 'the entire park stays fixed on screen');
  assert.equal(s.intro, true); assert.equal(s.tier, 1);
  assert.equal(await page.locator('#zoomBox').isVisible(), true);
  assert.equal(await page.locator('#btnLens').isVisible(), true);
  assert.equal(await page.locator('#btnHint').isVisible(), true);
  // The list shows big first; the clock waits for it.
  await step(page, 60);
  assert.equal((await state(page)).time, 0);
  // Pressing the magnifier button immediately dismisses the intro and opens the movable lens.
  await page.locator('#btnLens').click();
  await step(page);
  s = await state(page);
  assert.equal(s.intro, false);
  assert.equal(s.lens.on, true, 'the magnifying glass appears right away');
  assert.ok(s.lens.z > s.zmin);
  assert.equal(await page.locator('#btnLens').getAttribute('aria-pressed'), 'true');
  await page.locator('#btnLens').click();
  await step(page);
  assert.equal((await state(page)).lens.on, false, 'pressing it again hides the lens');
  assert.equal(await page.locator('#btnLens').getAttribute('aria-pressed'), 'false');
  // Dragging across the scene never pans the world or counts a wrong click.
  await dragBy(page, 760, 380, -260, -80);
  s = await state(page);
  assert.deepEqual(s.cam, { x: 1280, y: 720, z: 0.5 }, 'the world never moves when dragged');
  assert.equal(s.wrong, 0);
  // Pressing the lightbulb button shows a hint immediately without waiting.
  await page.locator('#btnHint').click();
  await step(page);
  assert.equal((await state(page)).hint, true, 'the lightbulb shows a hint immediately');
  assert.equal(await page.evaluate(() => scrollX + scrollY + document.scrollingElement.scrollTop + document.scrollingElement.scrollLeft), 0);
  // The clock runs now.
  await step(page, 60);
  assert.ok((await state(page)).time > 0.9);
});

test('the real mouse wheel opens and zooms the magnifying glass over the pointer, eased, while the world stays fixed', async t => {
  const page = await game(t, { save: SAVE(2), dda: TIER[1], reducedMotion: 'no-preference' });
  await openRound(page, 2);
  await skipIntro(page);
  let s = await state(page);
  const fixedCam = s.cam;
  assert.equal(s.cam.z, s.zmin); assert.equal(s.lens.on, false);
  // Zoom in on a spot in the middle of the screen, notch by notch.
  const spot = [820, 300], w0 = under(s, ...spot), z0 = s.zmin;
  await wheelAt(page, ...spot, -100);
  s = await state(page);
  assert.equal(s.lens.on, true);
  assert.deepEqual(s.cam, fixedCam, 'the world camera stays fixed');
  assert.ok(s.lens.z > z0 && s.lens.z < s.tz, `eases: ${s.lens.z} on the way to ${s.tz}`);
  let w = under(s, ...spot);
  assert.ok(Math.hypot(w.x - w0.x, w.y - w0.y) < 0.6, 'the point under the lens center stays put while easing');
  await step(page, 40);
  s = await state(page);
  assert.ok(Math.abs(s.lens.z / z0 - Math.exp(100 * 0.0022)) < 0.01, `one notch is about x1.25: ${s.lens.z}`);
  w = under(s, ...spot);
  assert.ok(Math.hypot(w.x - w0.x, w.y - w0.y) < 0.6, 'and after');
  await wheelAt(page, ...spot, -100, 3);
  await step(page, 40);
  s = await state(page);
  w = under(s, ...spot);
  assert.ok(s.lens.z > z0 * 2, 'four notches');
  assert.ok(Math.hypot(w.x - w0.x, w.y - w0.y) < 0.6);
  assert.equal(await page.evaluate(() => scrollX + scrollY + document.scrollingElement.scrollTop + document.scrollingElement.scrollLeft), 0, 'the page never scrolls');
  assert.ok(Number.parseFloat(await page.locator('#zoomFill').evaluate(el => el.style.height)) > 30, 'the zoom bar fills');
  // A wheel that reports lines (three per notch) and 25 tiny trackpad steps zoom like a notch.
  const z1 = s.lens.z;
  await page.evaluate(([x, y]) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, clientX: x, clientY: y, bubbles: true, cancelable: true })), [(await at(page, 640, 360)).x, (await at(page, 640, 360)).y]);
  await step(page, 40);
  s = await state(page);
  assert.ok(Math.abs(s.lens.z / z1 - Math.exp(120 * 0.0022)) < 0.01, 'three lines');
  const z2 = s.lens.z, mid = await at(page, 640, 360);
  for (let i = 0; i < 25; i++) await page.evaluate(([x, y]) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 4, deltaMode: 0, clientX: x, clientY: y, bubbles: true, cancelable: true })), [mid.x, mid.y]);
  await step(page, 40);
  s = await state(page);
  assert.ok(Math.abs(z2 / s.lens.z - Math.exp(100 * 0.0022)) < 0.01, 'tiny steps add up to a notch out');
  // Far out: closes the lens back to the whole scene; far in: never past the top zoom.
  await wheelAt(page, 640, 360, 100, 30); await step(page, 60);
  s = await state(page);
  assert.equal(s.lens.z, s.zmin); assert.equal(s.lens.on, false);
  await wheelAt(page, 640, 360, -100, 30); await step(page, 60);
  s = await state(page);
  assert.equal(s.lens.z, s.zmax); assert.deepEqual(s.cam, fixedCam);
  assert.ok(s.moves >= 6);
});

test('Ctrl+wheel zooms the magnifying glass, not the browser: the event is cancelled and the page scale stays 1', async t => {
  const page = await game(t, { save: SAVE(2), dda: TIER[1] });
  await openRound(page, 2);
  await skipIntro(page);
  // Listen after the game, so the listener sees what the game did with the event.
  await page.evaluate(() => { window.wheels = []; window.addEventListener('wheel', e => wheels.push({ ctrl: e.ctrlKey, prevented: e.defaultPrevented }), { passive: true }); });
  const dpr = await page.evaluate(() => devicePixelRatio), z0 = (await state(page)).zmin;
  const p = await at(page, 700, 330);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await step(page, 3);
  const wheels = await page.evaluate(() => window.wheels);
  assert.equal(wheels.length, 2);
  assert.ok(wheels.every(w => w.ctrl && w.prevented), JSON.stringify(wheels));
  assert.ok((await state(page)).lens.z > z0 * 1.4, 'the magnifying glass zoomed in');
  assert.equal((await state(page)).cam.z, z0, 'the world stayed fixed');
  assert.equal(await page.evaluate(() => devicePixelRatio), dpr, 'the browser did not zoom');
  assert.equal(await page.evaluate(() => window.visualViewport ? visualViewport.scale : 1), 1);
  // A plain wheel is cancelled too (no page scroll), on every screen.
  await page.keyboard.press('KeyP'); await step(page);
  await page.mouse.wheel(0, 300);
  assert.ok((await page.evaluate(() => window.wheels)).every(w => w.prevented));
  assert.equal(await page.evaluate(() => scrollX + scrollY), 0);
});

test('a click on a thing finds it and it flies to the list; empty ground and look-alikes are wrong clicks; a tiny thing says zoom', async t => {
  const page = await game(t, { save: SAVE(5), dda: TIER[3] });
  await openRound(page, 5);
  await skipIntro(page);
  let s = await state(page);
  assert.ok(s.tier >= 3);
  const all = await items(page), target = all.find(i => i.e >= 0), decoy = all.find(i => i.e < 0 && i.k);
  assert.ok(decoy, 'there are look-alikes at this difficulty');
  // Too small to pick without the magnifying glass: no find, no wrong click.
  const p0 = await sceneAt(page, target.x, target.y);
  await page.mouse.click(p0.x, p0.y); await step(page);
  s = await state(page);
  assert.equal(s.found, 0); assert.equal(s.wrong, 0);
  // Magnify it with the lens and click.
  await find(page, target);
  s = await state(page);
  assert.equal(s.found, 1); assert.equal(s.wrong, 0);
  assert.equal(s.list[target.e].got, 1);
  assert.equal(s.list[target.e].shown, 1, 'it reached the list (at once, with reduced motion)');
  assert.equal((await items(page)).find(i => i.id === target.id).got, true);
  // The same thing again: nothing.
  const p1 = await sceneAt(page, target.x, target.y);
  await page.mouse.click(p1.x, p1.y); await step(page);
  assert.deepEqual([(await state(page)).found, (await state(page)).wrong], [1, 0]);
  // A look-alike is a wrong click.
  await find(page, decoy);
  s = await state(page);
  assert.equal(s.found, 1); assert.equal(s.wrong, 1);
  // Turn the lens off and click empty ground: one wrong click; double click is still one.
  if ((await state(page)).lens.on) { await page.locator('#btnLens').click(); await step(page); }
  const near = await items(page), cs = await state(page);
  let empty = null;
  for (let x = 200; x < 1100 && !empty; x += 53) for (let y = 120; y < 540 && !empty; y += 47) {
    const w = under(cs, x, y);
    if (near.every(i => Math.hypot(i.x - w.x, i.y - w.y) > i.r * 2 + 40 / cs.cam.z)) empty = [x, y];
  }
  const pe = await at(page, ...empty);
  await page.mouse.click(pe.x, pe.y); await step(page, 30);
  s = await state(page);
  assert.equal(s.found, 1); assert.equal(s.wrong, 2);
  await page.mouse.dblclick(pe.x, pe.y); await step(page);
  assert.equal((await state(page)).wrong, 3);
});

test('finishing a round: everything found, the result with stars and a new sticker, saved; R plays it again and Enter goes on', async t => {
  const page = await game(t, { dda: TIER[1] });
  await page.locator('#btnPlay').click(); await step(page);
  await skipIntro(page);
  await page.locator('#btnLens').click(); await step(page);
  await page.locator('#btnLens').click(); await step(page);
  await findAll(page);
  let s = await state(page);
  assert.equal(s.done, true); assert.equal(s.found, s.total);
  assert.ok(await until(page, 's.result', 240), 'the result comes after the celebration');
  s = await state(page);
  const first = s.stars;
  assert.ok(s.stars >= 1 && s.stars <= 3);
  assert.equal(await page.locator('#scrResult').isVisible(), true);
  assert.equal(await page.locator('#resSticker').isVisible(), true, 'a new sticker');
  assert.equal(await page.locator('#resStickerText').textContent(), 'ملصق جديد!');
  assert.match(await page.locator('#resTime').textContent(), /^\d+:\d\d$/);
  const saved = await stored(page);
  assert.equal(saved.r[0][0], s.stars); assert.ok(saved.r[0][1] > 0);
  assert.deepEqual(saved.coach, [0, 1], 'the first lens zoom is remembered');
  assert.equal((await page.evaluate(() => sz.results)).length, 1, 'one result for the difficulty');
  await step(page, 60);
  assert.equal(await page.locator('#resStars svg.on').count(), s.stars);
  // R replays the round, fresh.
  await page.keyboard.press('KeyR'); await step(page, 2);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.index, 0); assert.equal(s.found, 0); assert.equal(s.moves, 0);
  await skipIntro(page);
  await findAll(page);
  assert.ok(await until(page, 's.result', 240));
  // Played again, the sticker only shows if it just became shiny (3 stars for the first time).
  assert.equal(await page.locator('#resSticker').isVisible(), (await state(page)).stars === 3 && first < 3);
  // Enter is ignored for a moment, then goes to the next round.
  await page.keyboard.press('Enter'); await step(page);
  assert.equal((await state(page)).screen, 'result');
  await step(page, 50);
  await page.keyboard.press('Enter'); await step(page, 2);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.index, 1);
  // The map shows the stars and the next round open.
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnMenu').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  assert.match(await page.locator('.world:nth-child(1) .rnd:nth-child(1)').getAttribute('class'), /done/);
  assert.doesNotMatch(await page.locator('.world:nth-child(1) .rnd:nth-child(2)').getAttribute('class'), /locked/);
  assert.match(await page.locator('.world:nth-child(1) .rnd:nth-child(3)').getAttribute('class'), /locked/);
  // A locked round wiggles and does not start.
  await page.locator('.world:nth-child(1) .rnd:nth-child(3)').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  // The sticker book shows the sticker.
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnBook').click(); await step(page);
  assert.equal((await state(page)).screen, 'book');
  assert.equal(await page.locator('#bookCount b').textContent(), '1/25');
});

test('a round with covers and moving things: a shut toy box says zoom, magnifying opens it, a moving thing is found where it is', async t => {
  const page = await game(t, { save: SAVE(16), dda: TIER[1] });
  await openRound(page, 16);
  await skipIntro(page);
  const all = await items(page), hidden = all.find(i => i.e >= 0 && i.cover), mover = all.find(i => i.e >= 0 && i.moving);
  assert.ok(hidden && mover);
  // Without the magnifying glass the box is shut.
  const p = await sceneAt(page, hidden.x, hidden.y);
  await page.mouse.click(p.x, p.y); await step(page);
  let s = await state(page);
  assert.equal(s.found, 0); assert.equal(s.wrong, 0, 'a shut box is not a wrong click');
  await find(page, hidden);
  s = await state(page);
  assert.equal(s.found, 1, 'magnified inside the lens, the box is open and the thing is found');
  // Moving things move with the clock and are found where they are now.
  const a = (await state(page)).movers;
  await step(page, 30);
  assert.notDeepEqual((await state(page)).movers, a);
  await find(page, (await items(page)).find(i => i.id === mover.id));
  assert.equal((await state(page)).found, 2);
});

test('P, Esc, the button and a lost focus pause; nothing moves while paused, and focus never resumes', async t => {
  const page = await game(t, { save: SAVE(10), dda: TIER[1] });
  await openRound(page, 10);
  await skipIntro(page);
  await step(page, 30);
  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.cam, __game.state.lens, __game.state.movers, __game.state.found]));
  for (const how of ['KeyP', 'Escape', 'button', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    assert.equal((await state(page)).screen, 'pause', how);
    const before = await snap();
    await wheelAt(page, 640, 360, -100, 3);
    await page.mouse.move(300, 300); await page.mouse.move(900, 500);
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('Equal');
    await step(page, 90);
    await page.keyboard.up('ArrowRight'); await page.keyboard.up('Equal');
    assert.equal(await snap(), before, how + ': the round is frozen');
    if (how === 'blur') {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await step(page, 10);
      assert.equal((await state(page)).screen, 'pause', 'focus coming back never resumes');
    }
    if (how === 'KeyP') await page.keyboard.press('KeyP'); else await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await step(page, 5);
    assert.notEqual(await snap(), before, 'and runs again after Resume');
  }
});

test('Restart from the pause starts the round again: nothing found, no moves, the magnifying glass off again', async t => {
  const page = await game(t, { save: SAVE(3), dda: TIER[1] });
  await openRound(page, 3);
  await skipIntro(page);
  const s0 = await state(page), start = s0.cam;
  await find(page, (await items(page)).find(i => i.e >= 0 && i.need > s0.zmin));
  let s = await state(page);
  assert.equal(s.found, 1); assert.equal(s.lens.on, true); assert.ok(s.moves > 0);
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnRestart').click(); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.found, 0); assert.equal(s.moves, 0); assert.equal(s.time, 0);
  assert.deepEqual(s.cam, start); assert.equal(s.lens.on, false); assert.equal(s.lens.z, s.zmin); assert.equal(s.intro, true);
  // R in the pause restarts too.
  await skipIntro(page); await page.locator('#btnLens').click(); await step(page);
  assert.equal((await state(page)).lens.on, true);
  await page.keyboard.press('KeyP'); await step(page);
  await page.keyboard.press('KeyR'); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.moves, 0); assert.equal(s.lens.on, false);
});

test('the keys and the on-screen buttons: L toggles the lens, + and − zoom it, the arrows move the lens while the world stays fixed', async t => {
  const page = await game(t, { save: SAVE(6), dda: TIER[1] });
  await openRound(page, 6);
  await skipIntro(page);
  let s = await state(page);
  const fixedCam = s.cam, z0 = s.zmin;
  await page.keyboard.press('KeyL'); await step(page);
  assert.equal((await state(page)).lens.on, true);
  await page.keyboard.press('KeyL'); await step(page);
  assert.equal((await state(page)).lens.on, false);
  await page.keyboard.down('Equal'); await step(page, 30); await page.keyboard.up('Equal');
  s = await state(page);
  assert.ok(s.lens.on && s.lens.z > z0 * 2, '+ opens and zooms in while held');
  assert.deepEqual(s.cam, fixedCam, 'world stays fixed');
  const x0 = s.lens.x, y0 = s.lens.y;
  await page.keyboard.down('ArrowRight'); await step(page, 20); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown'); await step(page, 10); await page.keyboard.up('ArrowDown');
  s = await state(page);
  assert.ok(s.lens.x > x0 + 50 && s.lens.y > y0 + 20, '→ and ↓ move the magnifying glass right and down');
  assert.deepEqual(s.cam, fixedCam, 'world never pans');
  const z1 = s.lens.z;
  await page.keyboard.down('Minus'); await step(page, 15); await page.keyboard.up('Minus');
  assert.ok((await state(page)).lens.z < z1 * 0.8, '− zooms out');
  const z2 = (await state(page)).lens.z;
  await page.locator('#btnIn').click(); await step(page, 2);
  assert.ok(Math.abs((await state(page)).lens.z / z2 - 1.45) < 0.01, 'the + button');
  await page.locator('#btnOut').click(); await step(page, 2);
  assert.ok(Math.abs((await state(page)).lens.z - z2) < 0.01, 'the − button');
  for (let i = 0; i < 6; i++) await page.locator('#btnOut').click();
  await step(page, 2);
  s = await state(page);
  assert.equal(s.lens.z, s.zmin); assert.equal(s.lens.on, false);
  assert.match(await page.locator('#btnOut').getAttribute('class'), /off/, 'the − button greys out at the end');
});

test('the hint: pressing H or the lightbulb works right away; after an idle wait the lightbulb glows (and shows by itself for the youngest)', async t => {
  const page = await game(t, { save: SAVE(7), dda: TIER[3] });
  await openRound(page, 7);
  await skipIntro(page);
  await page.keyboard.press('KeyH'); await step(page);
  assert.equal((await state(page)).hint, true, 'H shows the hint immediately without waiting');
  assert.ok(await until(page, '!s.hint', 60 * 6, 15), 'it fades after a few seconds');
  assert.ok(await until(page, 's.hintReady', 60 * 25, 15));
  assert.match(await page.locator('#btnHint').getAttribute('class'), /ready/);
  await run(page, 60 * 6);
  assert.equal((await state(page)).hint, false, 'an older player presses it themselves');
  await page.locator('#btnHint').click(); await step(page);
  assert.equal((await state(page)).hint, true);
  assert.doesNotMatch(await page.locator('#btnHint').getAttribute('class'), /ready/);
  assert.ok(await until(page, '!s.hint', 60 * 6, 15), 'it shows for a few seconds');
  // The youngest players get it by themselves.
  const young = await game(t, { save: SAVE(7), dda: TIER[1] });
  await openRound(young, 7);
  await skipIntro(young);
  assert.ok(await until(young, 's.hint', 60 * 20, 15), 'the hint shows by itself');
});

test('a timed round: wrong clicks in a row cost seconds at higher difficulty; time-up shows its result and R plays again', async t => {
  const page = await game(t, { save: SAVE(20), dda: 0.6 });
  await openRound(page, 20);
  let s = await state(page);
  assert.ok(s.limit > 60); assert.equal(s.left, s.limit);
  await skipIntro(page);
  // Three clicks in a row on empty ground.
  const near = await items(page), cs = await state(page);
  let empty = null;
  for (let x = 200; x < 1100 && !empty; x += 53) for (let y = 120; y < 540 && !empty; y += 47) {
    const w = under(cs, x, y);
    if (near.every(i => Math.hypot(i.x - w.x, i.y - w.y) > i.r * 2 + 40 / cs.cam.z)) empty = [x, y];
  }
  for (let i = 0; i < 3; i++) { const p = await at(page, empty[0] + i * 30, empty[1]); await page.mouse.click(p.x, p.y); await step(page, 30); }
  s = await state(page);
  assert.equal(s.wrong, 3); assert.equal(s.pen, 5);
  assert.ok(Math.abs(s.left - (s.limit - s.time - 5)) < 0.2);
  assert.ok(await until(page, 's.screen === "result"', 60 * 200, 30));
  s = await state(page);
  assert.equal(s.timeUp, true); assert.equal(s.stars, 0);
  assert.equal(await page.locator('#resPlace').textContent(), 'انتهى الوقت!');
  assert.equal(await page.locator('#resNext').isVisible(), false);
  assert.equal(await page.locator('#resStars').isVisible(), false);
  assert.deepEqual(await page.evaluate(() => sz.results), [0.1]);
  assert.deepEqual((await stored(page)).r[20], [0, 0], 'a round that ran out is not finished');
  await step(page, 50);
  await page.keyboard.press('KeyR'); await step(page, 2);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.index, 20); assert.equal(s.wrong, 0); assert.equal(s.left, s.limit);
  // At the lowest difficulty wrong clicks never cost seconds.
  const easy = await game(t, { save: SAVE(20), dda: TIER[1] });
  await openRound(easy, 20);
  await skipIntro(easy);
  for (let i = 0; i < 4; i++) { const p = await at(easy, empty[0] + i * 30, empty[1]); await easy.mouse.click(p.x, p.y); await step(easy, 30); }
  assert.equal((await state(easy)).pen, 0);
});

test('saves come back after a reload; old or broken saves open a fresh game; a full disk keeps progress and Retry writes it', async t => {
  const page = await game(t, { save: SAVE(7, { r: SAVE(7).r.map((e, i) => i === 0 ? [3, 321] : e) }) });
  assert.equal(await page.locator('#titleStars b').textContent(), (3 + 6 * 2) + '/75');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.sz.step);
  assert.equal(await page.locator('#titleStars b').textContent(), '15/75');
  assert.deepEqual((await page.evaluate(() => __game.save)).r[0], [3, 321]);
  for (const save of ['broken{', '[1,2]', '{"v":2,"r":[[3,1]]}', '{"v":1,"r":"x","coach":7}', '{"v":1,"r":[[9,9],["a",1],null],"music":true}']) {
    const old = await game(t, { save });
    assert.equal((await state(old)).screen, 'title');
    assert.equal(await old.locator('#titleStars b').textContent(), '0/75');
    await old.keyboard.press('Enter'); await step(old);
    const s = await state(old);
    assert.equal(s.screen, 'play', save); assert.equal(s.index, 0);
  }
  // A full disk: the finished round stays in the game, the warning shows, Retry writes it.
  const full = await game(t, { dda: TIER[1] });
  await full.evaluate(() => { sz.failSave = true; });
  await full.locator('#btnPlay').click(); await step(full);
  await skipIntro(full);
  await findAll(full);
  assert.ok(await until(full, 's.result', 240));
  const status = full.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal(await stored(full), null, 'nothing was written');
  assert.ok((await full.evaluate(() => __game.save)).r[0][0] >= 1, 'the stars are kept in the game');
  await full.evaluate(() => { sz.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.ok((await stored(full)).r[0][0] >= 1);
});

test('reduced motion: the lens zoom jumps at once vs eases; a flick never moves or glides the fixed world', async t => {
  for (const motion of ['reduce', 'no-preference']) {
    const page = await game(t, { save: SAVE(3), dda: TIER[1], reducedMotion: motion });
    assert.equal(await page.evaluate(() => Kit.motion.reduced()), motion === 'reduce');
    await openRound(page, 3);
    await skipIntro(page);
    const s0 = await state(page), z0 = s0.zmin, fixedCam = s0.cam;
    const p = await at(page, 640, 360);
    await page.mouse.move(p.x, p.y);
    await page.mouse.wheel(0, -100);
    await step(page);
    const z1 = (await state(page)).lens.z;
    if (motion === 'reduce') assert.ok(Math.abs(z1 / z0 - Math.exp(0.22)) < 1e-3, 'at once');
    else assert.ok(z1 > z0 && z1 < z0 * Math.exp(0.22) - 1e-3, 'eased');
    // A quick flick never drags or glides the fixed world in either mode.
    const a = await at(page, 760, 360), b = await at(page, 560, 360);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up();
    await step(page, 20);
    assert.deepEqual((await state(page)).cam, fixedCam, 'fixed world never moves');
  }
});

test('fits the smaller portal frame; a click on a thing finds it at this size too; the mute button and M', async t => {
  const page = await game(t, { size: [1100, 620], dda: TIER[1] });
  const play = await page.locator('#btnPlay').boundingBox();
  const canvas = await page.locator('#game').boundingBox();
  assert.ok(canvas.width <= 1100 && canvas.height <= 620);
  for (const sel of ['#btnPlay', '#btnBook', '.how:nth-child(1)', '.how:nth-child(4)']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvas.x && b.x + b.width <= canvas.x + canvas.width && b.y >= canvas.y && b.y + b.height <= canvas.y + canvas.height + 1, sel + ' inside the frame');
  }
  assert.ok(play.width > 100);
  await page.locator('#btnPlay').click(); await step(page);
  await skipIntro(page);
  const it = (await items(page)).find(i => i.e >= 0);
  await find(page, it);
  assert.equal((await state(page)).found, 1);
  const boxes = [];
  for (const sel of ['#btnPause', '#zoomBox', '#btnLens', '#btnHint']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvas.x && b.y + b.height <= canvas.y + canvas.height + 1, sel);
    boxes.push(b);
  }
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].y >= boxes[i - 1].y + boxes[i - 1].height - 1, 'HUD controls do not overlap');
  // Mute.
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM'); await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'play');
});

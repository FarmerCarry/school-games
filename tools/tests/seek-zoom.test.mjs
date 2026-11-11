// Seek and Zoom in real Chromium: the real mouse wheel (and Ctrl+wheel) zooms the game
// around the pointer and never the page; drags pan; clicks find things (or count as
// wrong clicks); whole rounds, the result, stickers, hints, timed rounds, pause, restart,
// saves (and a full disk), reduced motion and the smaller portal frame.
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
// The scene point under logical screen point (x, y), from the camera the game reports.
const under = (s, x, y) => ({ x: s.cam.x + (x - 640) / s.cam.z, y: s.cam.y + (y - 360) / s.cam.z });
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
// Drags the scene until a scene point is in the free middle of the screen.
async function bring(page, x, y) {
  for (let i = 0; i < 10; i++) {
    const s = await state(page), sx = 640 + (x - s.cam.x) * s.cam.z, sy = 360 + (y - s.cam.y) * s.cam.z;
    if (sx > 170 && sx < 1150 && sy > 120 && sy < 560) return true;
    await dragBy(page, 660, 330, Math.max(-420, Math.min(420, 660 - sx)), Math.max(-240, Math.min(240, 330 - sy)));
  }
  return false;
}
// Finds one thing like a child: drags it into view, zooms in on it with the wheel, clicks.
async function find(page, it) {
  assert.ok(await bring(page, it.x, it.y), `${it.k} brought into view`);
  for (let i = 0; i < 12; i++) {
    const s = await state(page);
    if (s.cam.z >= it.need + 0.02 || s.cam.z >= s.zmax) break;
    const p = 640 + (it.x - s.cam.x) * s.cam.z, q = 360 + (it.y - s.cam.y) * s.cam.z;
    await wheelAt(page, p, q, -100);
    await step(page, 2);
  }
  const now = (await items(page)).find(x => x.id === it.id);
  const p = await sceneAt(page, now.x, now.y);
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

test('the title waits; Play opens the park\'s first round, where the zoom is locked and a real drag pans', async t => {
  const page = await game(t, { dda: TIER[1] });
  await step(page, 30);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/75');
  // On the title the wheel changes the magnifying glass, and the page never scrolls.
  await wheelAt(page, 900, 300, -100, 2);
  assert.ok((await state(page)).lensZ > 2.4 + 0.5);
  await page.locator('#btnPlay').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.index, 0); assert.equal(s.locked, true);
  assert.equal(s.cam.z, 1); assert.equal(s.intro, true); assert.equal(s.coach, 'drag');
  assert.equal(s.tier, 1);
  assert.equal(await page.locator('#zoomBox').isVisible(), false, 'no zoom buttons yet');
  // The list shows big first; the clock waits for it.
  await step(page, 60);
  assert.equal((await state(page)).time, 0);
  const before = (await state(page)).cam;
  await dragBy(page, 760, 380, -260, -80);
  s = await state(page);
  assert.equal(s.intro, false, 'the drag closes the list and moves the scene at once');
  assert.ok(Math.abs(s.cam.x - (before.x + 260)) < 1 && Math.abs(s.cam.y - (before.y + 80)) < 1, JSON.stringify([before, s.cam]));
  assert.equal(s.moves, 1);
  assert.equal(s.coach, '', 'the dragging hand goes once the child drags');
  // The wheel does nothing to a locked round's zoom (it shows the dragging hand instead).
  await wheelAt(page, 640, 360, -100, 3);
  await step(page, 10);
  assert.equal((await state(page)).cam.z, 1);
  assert.equal(await page.evaluate(() => scrollX + scrollY + document.scrollingElement.scrollTop + document.scrollingElement.scrollLeft), 0);
  // The clock runs now.
  await step(page, 60);
  assert.ok((await state(page)).time > 0.9);
});

test('the real mouse wheel zooms around the pointer, eased, and never scrolls the page; lines and tiny trackpad steps too', async t => {
  const page = await game(t, { save: SAVE(2), dda: TIER[1], reducedMotion: 'no-preference' });
  await openRound(page, 2);
  await skipIntro(page);
  let s = await state(page);
  assert.equal(s.locked, false); assert.equal(s.cam.z, s.zmin);
  // Zoom in on a spot in the middle of the screen, notch by notch.
  const spot = [820, 300], w0 = under(s, ...spot), z0 = s.cam.z;
  await wheelAt(page, ...spot, -100);
  s = await state(page);
  assert.ok(s.cam.z > z0 && s.cam.z < s.tz, `eases: ${s.cam.z} on the way to ${s.tz}`);
  let w = under(s, ...spot);
  assert.ok(Math.hypot(w.x - w0.x, w.y - w0.y) < 0.6, 'the point under the pointer stays put while easing');
  await step(page, 40);
  s = await state(page);
  assert.ok(Math.abs(s.cam.z / z0 - Math.exp(100 * 0.0022)) < 0.01, `one notch is about x1.25: ${s.cam.z}`);
  w = under(s, ...spot);
  assert.ok(Math.hypot(w.x - w0.x, w.y - w0.y) < 0.6, 'and after');
  await wheelAt(page, ...spot, -100, 3);
  await step(page, 40);
  s = await state(page);
  w = under(s, ...spot);
  assert.ok(s.cam.z > z0 * 2, 'four notches');
  assert.ok(Math.hypot(w.x - w0.x, w.y - w0.y) < 0.6);
  assert.equal(await page.evaluate(() => scrollX + scrollY + document.scrollingElement.scrollTop + document.scrollingElement.scrollLeft), 0, 'the page never scrolls');
  assert.ok(Number.parseFloat(await page.locator('#zoomFill').evaluate(el => el.style.height)) > 30, 'the zoom bar fills');
  // A wheel that reports lines (three per notch) and 25 tiny trackpad steps zoom like a notch.
  const z1 = s.cam.z;
  await page.evaluate(([x, y]) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, clientX: x, clientY: y, bubbles: true, cancelable: true })), [(await at(page, 640, 360)).x, (await at(page, 640, 360)).y]);
  await step(page, 40);
  s = await state(page);
  assert.ok(Math.abs(s.cam.z / z1 - Math.exp(120 * 0.0022)) < 0.01, 'three lines');
  const z2 = s.cam.z, mid = await at(page, 640, 360);
  for (let i = 0; i < 25; i++) await page.evaluate(([x, y]) => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 4, deltaMode: 0, clientX: x, clientY: y, bubbles: true, cancelable: true })), [mid.x, mid.y]);
  await step(page, 40);
  s = await state(page);
  assert.ok(Math.abs(z2 / s.cam.z - Math.exp(100 * 0.0022)) < 0.01, 'tiny steps add up to a notch out');
  // Far out: never past the whole scene; far in: never past the top zoom.
  await wheelAt(page, 640, 360, 100, 30); await step(page, 60);
  assert.equal((await state(page)).cam.z, s.zmin);
  await wheelAt(page, 640, 360, -100, 30); await step(page, 60);
  assert.equal((await state(page)).cam.z, s.zmax);
  assert.ok((await state(page)).moves >= 6);
});

test('Ctrl+wheel zooms the game, not the browser: the event is cancelled and the page scale stays 1', async t => {
  const page = await game(t, { save: SAVE(2), dda: TIER[1] });
  await openRound(page, 2);
  await skipIntro(page);
  // Listen after the game, so the listener sees what the game did with the event.
  await page.evaluate(() => { window.wheels = []; window.addEventListener('wheel', e => wheels.push({ ctrl: e.ctrlKey, prevented: e.defaultPrevented }), { passive: true }); });
  const dpr = await page.evaluate(() => devicePixelRatio), z0 = (await state(page)).cam.z;
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
  assert.ok((await state(page)).cam.z > z0 * 1.4, 'the game zoomed in');
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
  // Too small to pick at the lowest zoom: no find, no wrong click.
  const p0 = await sceneAt(page, target.x, target.y);
  await page.mouse.click(p0.x, p0.y); await step(page);
  s = await state(page);
  assert.equal(s.found, 0); assert.equal(s.wrong, 0);
  // Zoom in on it and click.
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
  // Empty ground is a wrong click.
  const near = (await items(page)), cs = await state(page);
  let empty = null;
  for (let x = 200; x < 1100 && !empty; x += 53) for (let y = 120; y < 560 && !empty; y += 47) {
    const w = under(cs, x, y);
    if (near.every(i => Math.hypot(i.x - w.x, i.y - w.y) > i.r * 2 + 40 / cs.cam.z)) empty = [x, y];
  }
  const pe = await at(page, ...empty);
  await page.mouse.click(pe.x, pe.y); await step(page, 30);
  s = await state(page);
  assert.equal(s.found, 1); assert.equal(s.wrong, 2);
  // A double click on the ground is one wrong click, not two.
  await page.mouse.dblclick(pe.x, pe.y); await step(page);
  assert.equal((await state(page)).wrong, 3);
});

test('finishing a round: everything found, the result with stars and a new sticker, saved; R plays it again and Enter goes on', async t => {
  const page = await game(t, { dda: TIER[1] });
  await page.locator('#btnPlay').click(); await step(page);
  await skipIntro(page);
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
  assert.deepEqual(saved.coach, [1, 0], 'the first drag is remembered');
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

test('a round with covers and moving things: a shut toy box says zoom, zooming opens it, a moving thing is found where it is', async t => {
  const page = await game(t, { save: SAVE(16), dda: TIER[1] });
  await openRound(page, 16);
  await skipIntro(page);
  const all = await items(page), hidden = all.find(i => i.e >= 0 && i.cover), mover = all.find(i => i.e >= 0 && i.moving);
  assert.ok(hidden && mover);
  // At a zoom where it is big enough but the box is still shut.
  assert.ok(await bring(page, hidden.x, hidden.y));
  let s = await state(page);
  const p = await sceneAt(page, hidden.x, hidden.y);
  await page.mouse.click(p.x, p.y); await step(page);
  s = await state(page);
  assert.equal(s.found, 0); assert.equal(s.wrong, 0, 'a shut box is not a wrong click');
  await find(page, hidden);
  s = await state(page);
  assert.equal(s.found, 1, 'zoomed in, the box is open and the thing is found');
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
  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.cam, __game.state.movers, __game.state.found]));
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

test('Restart from the pause starts the round again: nothing found, no moves, the camera back at the start', async t => {
  const page = await game(t, { save: SAVE(3), dda: TIER[1] });
  await openRound(page, 3);
  await skipIntro(page);
  const start = (await state(page)).cam;
  await find(page, (await items(page)).find(i => i.e >= 0));
  let s = await state(page);
  assert.equal(s.found, 1); assert.notDeepEqual(s.cam, start);
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnRestart').click(); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.found, 0); assert.equal(s.moves, 0); assert.equal(s.time, 0);
  assert.deepEqual(s.cam, start); assert.equal(s.intro, true);
  // R in the pause restarts too.
  await skipIntro(page); await dragBy(page, 600, 300, 200, 0);
  await page.keyboard.press('KeyP'); await step(page);
  await page.keyboard.press('KeyR'); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.moves, 0);
});

test('the keys and the on-screen buttons: + and − zoom around the middle, the arrows move the scene', async t => {
  const page = await game(t, { save: SAVE(6), dda: TIER[1] });
  await openRound(page, 6);
  await skipIntro(page);
  let s = await state(page);
  const z0 = s.cam.z;
  await page.keyboard.down('Equal'); await step(page, 30); await page.keyboard.up('Equal');
  s = await state(page);
  assert.ok(s.cam.z > z0 * 2, '+ zooms in while held');
  const x0 = s.cam.x, y0 = s.cam.y;
  await page.keyboard.down('ArrowRight'); await step(page, 20); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown'); await step(page, 10); await page.keyboard.up('ArrowDown');
  s = await state(page);
  assert.ok(s.cam.x > x0 + 50 && s.cam.y > y0 + 20, '→ and ↓ show what is to the right and below');
  const z1 = s.cam.z;
  await page.keyboard.down('Minus'); await step(page, 15); await page.keyboard.up('Minus');
  assert.ok((await state(page)).cam.z < z1 * 0.8, '− zooms out');
  const z2 = (await state(page)).cam.z;
  await page.locator('#btnIn').click(); await step(page, 2);
  assert.ok(Math.abs((await state(page)).cam.z / z2 - 1.45) < 0.01, 'the + button');
  await page.locator('#btnOut').click(); await step(page, 2);
  assert.ok(Math.abs((await state(page)).cam.z - z2) < 0.01, 'the − button');
  await page.locator('#btnOut').click(); await page.locator('#btnOut').click(); await page.locator('#btnOut').click(); await page.locator('#btnOut').click(); await step(page, 2);
  assert.equal((await state(page)).cam.z, s.zmin);
  assert.match(await page.locator('#btnOut').getAttribute('class'), /off/, 'the − button greys out at the end');
});

test('the hint: after a wait the magnifying glass glows and points at a thing still to find (by itself for the youngest)', async t => {
  const page = await game(t, { save: SAVE(7), dda: TIER[3] });
  await openRound(page, 7);
  await skipIntro(page);
  await page.keyboard.press('KeyH'); await step(page);
  assert.equal((await state(page)).hint, false, 'not before the wait');
  assert.ok(await until(page, 's.hintReady', 60 * 25, 15));
  assert.match(await page.locator('#btnHint').getAttribute('class'), /ready/);
  await run(page, 60 * 6);
  assert.equal((await state(page)).hint, false, 'an older player presses it themselves');
  await page.locator('#btnHint').click(); await step(page);
  assert.equal((await state(page)).hint, true);
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
  for (let x = 200; x < 1100 && !empty; x += 53) for (let y = 120; y < 560 && !empty; y += 47) {
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

test('reduced motion: the zoom jumps at once and a flick does not glide; with motion the flick glides', async t => {
  for (const motion of ['reduce', 'no-preference']) {
    const page = await game(t, { save: SAVE(3), dda: TIER[1], reducedMotion: motion });
    assert.equal(await page.evaluate(() => Kit.motion.reduced()), motion === 'reduce');
    await openRound(page, 3);
    await skipIntro(page);
    const z0 = (await state(page)).cam.z;
    const p = await at(page, 640, 360);
    await page.mouse.move(p.x, p.y);
    await page.mouse.wheel(0, -100);
    await step(page);
    const z1 = (await state(page)).cam.z;
    if (motion === 'reduce') assert.ok(Math.abs(z1 / z0 - Math.exp(0.22)) < 1e-3, 'at once');
    else assert.ok(z1 < z0 * Math.exp(0.22) - 1e-3, 'eased');
    // Zoom in more, so the view has room to glide (not against the scene's edge).
    await page.mouse.wheel(0, -100); await page.mouse.wheel(0, -100);
    await step(page, 40);
    // A quick flick: the mouse lets go while still moving.
    const a = await at(page, 760, 360), b = await at(page, 560, 360);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up();
    const after = (await state(page)).cam.x;
    await step(page, 20);
    const glide = (await state(page)).cam.x - after;
    if (motion === 'reduce') assert.equal(glide, 0, 'no glide');
    else assert.ok(glide > 5, `glides on: ${glide}`);
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
  for (const sel of ['#btnPause', '#btnHint']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvas.x && b.y + b.height <= canvas.y + canvas.height + 1, sel);
  }
  // Mute.
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM'); await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'play');
});

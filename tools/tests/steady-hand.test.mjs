// Steady Hand in real Chromium: real mouse drags (press, move, release), touching an
// edge, a fast flick across a wall, leaving the game picture, a whole level to the lamp,
// pause and restart, no-button levels and doors, saves (and a full disk), reduced motion.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
// Real mouse moves wait for a frame; with the game's loop stepped by hand, these two flags
// keep each move from waiting for a vsync that a headless software renderer paces slowly.
// They change nothing in the game.
before(async () => { server = await startTestServer(root); browser = await launchChromium({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] }); });
after(async () => { await browser?.close(); await server?.close(); });

// A save with the first `open` levels lit (one star each), so later levels can be picked.
const SAVE = (open = 0, extra = {}) => ({
  v: 1, lv: Array.from({ length: 30 }, (_, i) => ({ s: i < open ? 1 : 0, t: i < open ? 300 : 0, c: 0 })), coins: 0,
  colors: [1, 0, 0, 0, 0, 0, 0], trails: [1, 0, 0, 0, 0], color: 0, trail: 0, coach: true, ...extra
});

// The game with its frame loop stepped by hand, every Kit.dda result recorded (sh.results)
// and a storage that can be told to fail. `dda` is the difficulty a PC with no results
// starts at. No page errors, no console errors, no requests off the server.
async function game(t, { save, dda = 0.4, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
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
    if (!sessionStorage.getItem('sh-seeded')) {
      sessionStorage.setItem('sh-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:steady-hand:save', typeof save === 'string' ? save : JSON.stringify(save));
    }
    let kit;
    const sh = window.sh = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        sh.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        sh.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        return { stop() {} };
      };
      const make = kit.dda;
      kit.dda = (slug, opts) => {
        const control = make.call(kit, slug, Object.assign({}, opts, { start: dda }));
        const result = control.result;
        control.result = outcome => { sh.results.push(outcome); return result.call(control, outcome); };
        return control;
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:steady-hand:save' && window.sh && window.sh.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, dda });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/steady-hand/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.sh.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => sh.step(n), n);
// n game steps with one picture at the end (for waits).
const run = (page, n = 1) => page.evaluate(n => sh.run(n), n);
const stored = page => page.evaluate(() => { const raw = localStorage.getItem('sg:steady-hand:save'); return raw ? JSON.parse(raw) : null; });
// Page coordinates of a logical point, and of the centre line at arc length s.
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);
const trackPoint = (page, s) => page.evaluate(s => { const p = __game.at(s); return Object.assign(__game.point(p.x, p.y), { lx: p.x, ly: p.y }); }, s);
// Starts level i (0-based) from the map, like a child.
async function openLevel(page, i) {
  await page.locator('#btnLevels').click(); await step(page);
  await page.locator('.lvl').nth(i).click(); await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.level, i);
}
// Moves the real mouse along the centre line from arc length a to b, `gap` px per pointer
// move and a frame every `per` moves (a frame on a slow PC sees several moves).
async function along(page, a, b, gap = 10, per = 3) {
  const pts = await page.evaluate(([a, b, gap]) => {
    const out = [];
    for (let s = a; a < b ? s <= b : s >= b; s += a < b ? gap : -gap) { const p = __game.at(s); out.push(__game.point(p.x, p.y)); }
    return out;
  }, [a, b, gap]);
  for (let i = 0; i < pts.length; i++) {
    await page.mouse.move(pts[i].x, pts[i].y);
    if (i % per === per - 1 || i === pts.length - 1) await step(page);
  }
}
// Presses on the spark where it is.
async function pressSpark(page) {
  const sp = (await state(page)).spark, p = await pagePoint(page, sp.x, sp.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await step(page);
  return p;
}

test('the title waits; Play goes straight to the first wire on a first visit; the coach hand shows the way and never moves the spark', async t => {
  const page = await game(t);
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/90');
  for (const word of ['الفأرة', 'اضغط مطولًا', 'اسحب']) assert.ok(await page.locator('.howto figcaption', { hasText: word }).isVisible(), word);
  await page.locator('#btnPlay').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.id, '1-1'); assert.equal(s.mode, 'drag'); assert.equal(s.held, false);
  assert.equal(s.atStart, true);
  await run(page, 60 * 3);
  s = await state(page);
  assert.equal(s.coach, true, 'the hand shows how to drag');
  assert.equal(s.atStart, true, 'and never moves the spark');
  assert.equal(s.clock, 0, 'the clock waits for the first grab');
});

test('a real drag: press on the spark, hold and move it along the wire; letting go leaves it there, safe', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await page.keyboard.press('Enter'); await step(page);
  const start = (await state(page)).spark;
  // Moving over the spark without the button does nothing in a drag level.
  const p0 = await pagePoint(page, start.x, start.y);
  await page.mouse.move(p0.x, p0.y); await page.mouse.move(p0.x + 40, p0.y); await step(page);
  assert.deepEqual((await state(page)).spark, start);
  // A press beside the spark (not on it) does not pick it up.
  const off = await pagePoint(page, start.x + 120, start.y);
  await page.mouse.move(off.x, off.y); await page.mouse.down(); await step(page);
  assert.equal((await state(page)).held, false);
  await page.mouse.up(); await step(page);
  await pressSpark(page);
  let s = await state(page);
  assert.equal(s.held, true, 'pressed on the spark');
  await along(page, s.best, s.best + 260);
  s = await state(page);
  assert.equal(s.touches, 0);
  assert.ok(s.dragged > 240 && s.best > 270, JSON.stringify(s));
  assert.ok(s.clock > 0, 'the clock runs once the spark is picked up');
  assert.ok(s.trail > 0, 'the spark leaves a trail');
  assert.equal(await page.locator('#game').getAttribute('class'), 'held', 'the spark is the pointer while held');
  // Letting go of the button drops it right there.
  await page.mouse.up(); await step(page);
  const dropped = await state(page);
  assert.equal(dropped.held, false);
  const far = await trackPoint(page, dropped.best + 100);
  await page.mouse.move(far.x, far.y, { steps: 5 }); await step(page, 5);
  assert.deepEqual((await state(page)).spark, dropped.spark, 'moving without the button leaves it where it is');
  assert.equal((await state(page)).touches, 0);
});

test('touching an edge: bzzt, a shake, and the spark flies back to the last lantern', async t => {
  const page = await game(t, { reducedMotion: 'no-preference', dda: 0.3 });
  await page.keyboard.press('Enter'); await step(page);
  await pressSpark(page);
  const track = await page.evaluate(() => __game.track);
  const cp = track.cps[0];
  await along(page, (await state(page)).best, cp.s + 60);
  let s = await state(page);
  assert.equal(s.cp, 0, 'the first lantern is lit');
  // Out through the wall, sideways, at a careful speed.
  const p = await page.evaluate(() => __game.state.spark);
  for (let d = 4; d < 140 && !(await state(page)).touches; d += 4) { const q = await pagePoint(page, p.x, p.y - d); await page.mouse.move(q.x, q.y); await step(page); }
  s = await state(page);
  assert.equal(s.touches, 1);
  assert.equal(s.held, false, 'a touch drops the spark');
  assert.ok(s.shake > 0, 'the screen shakes');
  assert.ok(Math.hypot(s.spark.x - cp.x, s.spark.y - cp.y) < 1, `back at the lantern: ${JSON.stringify(s.spark)} ${JSON.stringify(cp)}`);
  // It cannot be picked up while it flies home and buzzes, then it can.
  await page.mouse.up();
  const home = await pagePoint(page, cp.x, cp.y);
  await page.mouse.move(home.x, home.y); await page.mouse.down(); await step(page);
  assert.equal((await state(page)).held, false);
  await page.mouse.up(); await step(page, 50);
  await page.mouse.down(); await step(page);
  assert.equal((await state(page)).held, true);
  await page.mouse.up();
});

test('a fast flick across a wall is caught on its way, not jumped over', async t => {
  const page = await game(t, { save: SAVE(2) });
  await openLevel(page, 2);
  const track = await page.evaluate(() => __game.track);
  await pressSpark(page);
  await along(page, (await state(page)).best, 640, 12);
  let s = await state(page);
  assert.equal(s.touches, 0); assert.equal(s.held, true);
  // The bottom leg of the U is right below, beyond the wall: one single mouse move there.
  const below = await trackPoint(page, track.len - 560);
  assert.ok(below.ly - s.spark.y > 200);
  await page.mouse.move(below.x, below.y, { steps: 1 });
  await step(page, 2);
  s = await state(page);
  assert.equal(s.touches, 1, 'the wall was touched');
  assert.ok(s.best < 700, 'no progress through the wall');
  assert.ok(s.spark.y < 400, 'the spark is not on the bottom leg');
  await page.mouse.up();
});

test('leaving the game picture or the window drops the spark safely; a lost focus pauses', async t => {
  // A tall window: the 16:9 picture has bands above and below it.
  const page = await game(t, { size: [1280, 900] });
  await page.keyboard.press('Enter'); await step(page);
  await pressSpark(page);
  await along(page, (await state(page)).best, 200);
  const before = await state(page);
  assert.equal(before.held, true);
  const box = await page.locator('#game').boundingBox();
  assert.ok(box.y > 40, 'there is a band below the picture');
  // Straight down out of the picture, button still held.
  const q = await pagePoint(page, before.spark.x, before.spark.y);
  await page.mouse.move(q.x, box.y + box.height + 30, { steps: 1 });
  await step(page);
  let s = await state(page);
  assert.equal(s.held, false, 'dropped');
  assert.equal(s.touches, 0, 'not punished');
  assert.ok(Math.hypot(s.spark.x - before.spark.x, s.spark.y - before.spark.y) < 4, 'left where it was');
  // Back in with the button still down: sliding onto it picks it up again.
  await page.mouse.move(q.x, q.y, { steps: 3 }); await step(page, 2);
  assert.equal((await state(page)).held, true);
  // A lost focus drops it and pauses; focus coming back never resumes.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'pause'); assert.equal(s.held, false); assert.equal(s.touches, 0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await step(page, 10);
  assert.equal((await state(page)).screen, 'pause');
  await page.mouse.up();
});

test('a whole level: the lamp lights, stars and coins are counted and saved; Enter plays the next level, R this one again', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter'); await step(page);
  const track = await page.evaluate(() => __game.track);
  await pressSpark(page);
  await along(page, (await state(page)).best, track.len, 9);
  await page.mouse.up();
  let s = await state(page);
  assert.equal(s.done, true); assert.equal(s.touches, 0); assert.equal(s.coins, track.coins.length);
  assert.equal(s.celebrate, true);
  assert.deepEqual(await page.evaluate(() => sh.results), [1], 'one full result for the difficulty');
  const saved = await stored(page);
  assert.equal(saved.lv[0].s, 3, 'no touch and in time: three stars');
  assert.equal(saved.lv[0].c, 1); assert.equal(saved.coins, 1);
  assert.equal(saved.coach, true);
  await run(page, 120);
  s = await state(page);
  assert.equal(s.screen, 'result'); assert.equal(s.stars, 3);
  assert.equal(await page.locator('#scrResult').isVisible(), true);
  await run(page, 120);
  assert.equal(await page.locator('#resStars svg.on').count(), 3);
  assert.match(await page.locator('#resTitle').textContent(), /[؀-ۿ]/);
  assert.equal(await page.locator('#resTouch b').textContent(), '0');
  // R plays it again; Enter goes on to 1-2.
  await page.keyboard.press('KeyR'); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.id, '1-1'); assert.equal(s.atStart, true);
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnMap').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  assert.match(await page.locator('.lvl').nth(1).getAttribute('class'), /next/, 'the next level glows');
  await page.keyboard.press('Enter'); await step(page);
  assert.equal((await state(page)).id, '1-2');
});

test('P, Esc, the button and a lost focus pause; the moving parts freeze; Resume and Restart', async t => {
  const page = await game(t, { save: SAVE(12) });
  await openLevel(page, 12);
  assert.equal((await state(page)).id, '3-1');
  await pressSpark(page);
  await along(page, (await state(page)).best, 120);
  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.spark, __game.state.doors, __game.state.clock]));
  for (const how of ['KeyP', 'Escape', 'button', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    let s = await state(page);
    assert.equal(s.screen, 'pause', how);
    assert.equal(s.held, false, how + ': pausing drops the spark');
    const frozen = await snap();
    await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(900, 500); await page.mouse.up();
    await run(page, 90);
    assert.equal(await snap(), frozen, how + ': nothing moves');
    if (how === 'KeyP') await page.keyboard.press('KeyP'); else await page.locator('#btnResume').click();
    await step(page);
    s = await state(page);
    assert.equal(s.screen, 'play');
    assert.equal(s.touches, 0, 'nothing was touched on the way back');
    await step(page, 5);
    assert.notEqual(await snap(), frozen, 'and runs again');
  }
  // Restart from the pause: back at the start, nothing touched, nothing dragged.
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnRestart').click(); await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.atStart, true); assert.equal(s.clock, 0);
  // R restarts during play too.
  await pressSpark(page);
  await along(page, s.best, 100);
  await page.mouse.up();
  await page.keyboard.press('KeyR'); await step(page);
  s = await state(page);
  assert.equal(s.atStart, true); assert.equal(s.id, '3-1');
});

test('no-button levels: the pointer alone picks the spark up and moves it; a closed door stops it, a click opens it', async t => {
  const page = await game(t, { save: SAVE(18), dda: 0.2 });
  await openLevel(page, 18);
  let s = await state(page);
  assert.equal(s.id, '4-1'); assert.equal(s.mode, 'hover');
  const track = await page.evaluate(() => __game.track);
  const door = track.doors[0];
  const p0 = await pagePoint(page, s.spark.x, s.spark.y);
  await page.mouse.move(p0.x, p0.y); await step(page);
  assert.equal((await state(page)).held, true, 'touching it with the pointer picks it up');
  await along(page, s.best, door.s + 60, 8);
  s = await state(page);
  assert.equal(s.held, false, 'the closed door stopped it');
  assert.equal(s.touches, 0, 'a door is not a touch');
  assert.ok(s.best < door.s);
  // A click opens the door; then the spark is picked up again and goes through.
  await page.mouse.down(); await page.mouse.up(); await step(page, 20);
  assert.equal((await state(page)).doors[0], 1);
  const sp = (await state(page)).spark, q = await pagePoint(page, sp.x, sp.y);
  await page.mouse.move(q.x + 60, q.y + 60); await step(page);
  await page.mouse.move(q.x, q.y); await step(page);
  assert.equal((await state(page)).held, true);
  await along(page, (await state(page)).best, track.len, 9);
  s = await state(page);
  assert.equal(s.done, true); assert.equal(s.touches, 0);
});

test('saves come back after a reload; damaged saves start fresh; a full disk warns, keeps the progress and Retry writes it', async t => {
  const page = await game(t, { save: SAVE(3, { coins: 5 }) });
  assert.equal(await page.locator('#titleStars b').textContent(), '3/90');
  assert.equal(await page.locator('#titleCoins b').textContent(), '5');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.sh.step);
  assert.equal(await page.locator('#titleStars b').textContent(), '3/90');
  // A full disk while lighting the lamp of 1-4.
  await page.evaluate(() => { sh.failSave = true; });
  await openLevel(page, 3);
  const track = await page.evaluate(() => __game.track);
  await pressSpark(page);
  await along(page, (await state(page)).best, track.len, 9);
  await page.mouse.up();
  assert.equal((await state(page)).done, true);
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).lv[3].s, 0, 'nothing was written');
  assert.ok((await page.evaluate(() => __game.save)).lv[3].s >= 1, 'the game kept it');
  await page.evaluate(() => { sh.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.ok((await stored(page)).lv[3].s >= 1);
  // (Every kind of damaged save is checked in the engine test; two of them here.)
  for (const save of ['broken{', '{"v":1,"lv":[{"s":7,"t":-1,"c":99}],"coins":"lots","color":5,"colors":[0,0,0,0,0,1]}']) {
    const old = await game(t, { save });
    assert.equal((await state(old)).screen, 'title', save);
    assert.equal(await old.locator('#titleStars b').textContent(), '0/90', save);
    await old.keyboard.press('Enter'); await step(old);
    const s = await state(old);
    assert.equal(s.screen, 'play'); assert.equal(s.id, '1-1');
    await pressSpark(old);
    assert.equal((await state(old)).held, true);
    await old.mouse.up();
  }
});

test('reduced motion: no trail, no shake and no confetti, and the game plays the same', async t => {
  const page = await game(t, { reducedMotion: 'reduce' });
  await page.keyboard.press('Enter'); await step(page);
  await pressSpark(page);
  await along(page, (await state(page)).best, 300);
  let s = await state(page);
  assert.equal(s.trail, 0, 'no trail');
  const p = s.spark;
  for (let d = 4; d < 150 && !(await state(page)).touches; d += 4) { const q = await pagePoint(page, p.x, p.y - d); await page.mouse.move(q.x, q.y); await step(page); }
  s = await state(page);
  assert.equal(s.touches, 1, 'the edge still touches');
  assert.equal(s.shake, 0, 'no shake');
  assert.equal(s.fx, 0, 'no sparks flying');
  await page.mouse.up();
});

test('the buttons fit the smaller portal frame, and a drag there lands where the mouse is', async t => {
  const page = await game(t, { size: [1100, 620] });
  const play = await page.locator('#btnPlay').boundingBox(), canvas = await page.locator('#game').boundingBox();
  assert.ok(canvas.width <= 1100 && canvas.height <= 620);
  for (const sel of ['#btnPlay', '#btnLevels', '#btnShop', '.howto .card >> nth=3']) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.x >= canvas.x && b.x + b.width <= canvas.x + canvas.width && b.y + b.height <= canvas.y + canvas.height, sel);
  }
  assert.ok(play.width > 100);
  await page.locator('#btnPlay').click(); await step(page);
  await pressSpark(page);
  const target = await trackPoint(page, 120);
  await along(page, (await state(page)).best, 120, 8);
  const s = await state(page);
  assert.ok(Math.hypot(s.spark.x - target.lx, s.spark.y - target.ly) < 3, JSON.stringify([s.spark, target]));
  await page.mouse.up();
});

test('the colour shop buys with coins and the spark wears it; the mute button and M; M never starts the game', async t => {
  const page = await game(t, { save: SAVE(0, { coins: 3 }) });
  await page.locator('#btnShop').click(); await step(page);
  assert.equal((await state(page)).screen, 'shop');
  await page.locator('#shelfColors .tile').nth(3).click(); await step(page);
  assert.equal((await page.evaluate(() => __game.save)).color, 0, 'too few coins');
  await page.locator('#shelfColors .tile').nth(2).click(); await step(page);
  let saved = await stored(page);
  assert.equal(saved.color, 2); assert.equal(saved.coins, 0); assert.equal(saved.colors[2], 1);
  assert.match(await page.locator('#shelfColors .tile').nth(2).getAttribute('class'), /wear/);
  await page.locator('#shelfColors .tile').nth(0).click(); await step(page);
  assert.equal((await stored(page)).color, 0);
  await page.keyboard.press('Escape'); await step(page);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  await page.keyboard.press('KeyM'); await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'title');
  // A locked level wiggles and does not start.
  await page.locator('#btnLevels').click(); await step(page);
  await page.locator('.lvl').nth(4).click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
});

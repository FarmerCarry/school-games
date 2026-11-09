// Lucky Lake in real Chromium: real mouse and keyboard input, a whole catch, the trip's
// result, saves (and a full disk), pause, the places map, rods and the two-player derby,
// with the statistics a portal would receive.
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
// DDA levels: 0.05 is tier 1, 0.5 is tier 3.
const TIER = { 1: { _: { solo: [0.05, 4] } }, 3: { _: { solo: [0.5, 4] } } };

// The game with its frame loop stepped by hand, Kit.stats recorded, and a storage that
// can be told to fail. No page errors, no console errors, no requests off the server.
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
    if (!sessionStorage.getItem('ll-seeded')) {
      sessionStorage.setItem('ll-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:lucky-lake:save', typeof save === 'string' ? save : JSON.stringify(save));
      if (dda) localStorage.setItem('sg:lucky-lake:dda', JSON.stringify(dda));
    }
    let kit;
    const ll = window.ll = { stats: [], cues: 0, hits: 0, misses: 0, failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        ll.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        ll.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        ll.render = () => render(0);
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { ll.stats.push([name, ...args]); return call.apply(this, args); };
      }
      for (const name of ['cue', 'hit', 'miss']) {
        const call = kit.track[name];
        const key = { cue: 'cues', hit: 'hits', miss: 'misses' }[name];
        kit.track[name] = function (...args) { ll[key]++; return call.apply(this, args); };
      }
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
const stats = (page, kind) => page.evaluate(kind => ll.stats.filter(s => !kind || s[0] === kind), kind);
const stored = page => page.evaluate(() => { const raw = localStorage.getItem('sg:lucky-lake:save'); return raw ? JSON.parse(raw) : null; });
// Steps the game until a condition on its state holds (or the step budget runs out).
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += 4) { if (ok(__game.state)) return true; ll.run(4); }
    return ok(__game.state);
  }, { cond, max });
}
// Moves the real mouse to a point of the lake (logical 1280x720 pixels).
async function mouseTo(page, x, y) {
  const p = await page.evaluate(([x, y]) => __game.point(x, y), [x, y]);
  await page.mouse.move(p.x, p.y);
  return p;
}
// Fishes one catch like a child: casts at a fish with the mouse, waits for the «!»,
// presses Space, then holds Space while the fish is above the green zone.
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

test('the title is no round; Play goes straight to the village pond the first time and starts the round', async t => {
  const page = await game(t, { dda: TIER[1] });
  await step(page, 30);
  assert.equal((await state(page)).screen, 'title');
  assert.deepEqual(await stats(page), [], 'nothing is reported on the title');
  assert.equal(await page.locator('#titleFish b').textContent(), '0/33');
  await page.locator('#btnPlay').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.mode, 'solo'); assert.equal(s.place, 0); assert.equal(s.tier, 1);
  assert.deepEqual(await stats(page), [['round', 'p1'], ['tutorial', 'start']]);
  assert.equal(s.p1.state, 'ready');
  // The idle coach shows a hand after a moment, and it never casts by itself.
  assert.ok(await until(page, 's.ghost', 60 * 4), 'the hand shows where to cast');
  await step(page, 120);
  assert.equal((await state(page)).p1.casts, 0, 'the coach never casts for the child');
});

test('the mouse aims and a click casts the hook exactly there; the keys aim too and Space casts; a press while waiting casts again', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[3] });
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map', 'a child who has fished before picks a place');
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
  await mouseTo(page, 820, 520);
  await step(page);
  let s = await state(page);
  assert.deepEqual(s.p1.aim, { x: 820, y: 520 }, 'the aim follows the mouse into the water');
  const pt = await mouseTo(page, 820, 520);
  await page.mouse.click(pt.x, pt.y);
  assert.ok(await until(page, "s.p1.state === 'wait' || s.p1.state === 'bite'", 300));
  s = await state(page);
  assert.equal(s.p1.casts, 1);
  assert.deepEqual(s.p1.hook, { x: 820, y: 520 }, 'the hook sinks to the very spot');
  // The arrow keys move the same aim; Space casts there (the hook comes back first).
  await page.keyboard.down('ArrowLeft');
  await step(page, 30);
  await page.keyboard.up('ArrowLeft');
  s = await state(page);
  assert.ok(Math.abs(s.p1.aim.x - (820 - 430 * 0.5)) < 8, `← moved the aim to ${s.p1.aim.x}`);
  await page.keyboard.down('ArrowUp'); await step(page, 15); await page.keyboard.up('ArrowUp');
  const aim = (await state(page)).p1.aim;
  assert.ok(aim.y < 520);
  if ((await state(page)).p1.state === 'wait') {
    await page.keyboard.press('Space');
    assert.ok(await until(page, "s.p1.casts === 2 && s.p1.state === 'wait'", 400), 'Space reels in and casts again');
    assert.deepEqual((await state(page)).p1.hook, aim);
  }
  // Clicking the sky still casts into the water, never off it.
  await step(page, 10);
  if ((await state(page)).p1.state === 'wait') {
    const sky = await mouseTo(page, 900, 60);
    await page.mouse.click(sky.x, sky.y);
    assert.ok(await until(page, "s.p1.state === 'wait'", 400));
    s = await state(page);
    assert.ok(s.p1.hook.y > 236 + 30, 'the hook is in the water');
  }
});

test('a whole catch with real input: the «!», a press, holding to reel; then the catch card, coins and the book', async t => {
  const page = await game(t, { save: SAVE({ coach: false }), dda: TIER[1], reducedMotion: 'no-preference' });
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play', 'a child without catches goes straight to the pond');
  // Junk does not finish the first lesson: fish until a fish is landed.
  for (let i = 0; i < 4 && !((await stored(page)) || {}).caught; i++) {
    assert.ok(await catchOne(page), 'a catch is landed');
    await until(page, 's.card', 120);
    if ((await stored(page)).caught) break;
    await step(page, 40); await page.keyboard.press('Space'); await step(page);
  }
  const s = await state(page);
  assert.ok(s.trip >= 1);
  assert.equal(await page.evaluate(() => ll.cues) >= 1, true, 'the «!» is a reaction cue');
  const saved = await stored(page);
  assert.equal(saved.caught, 1, 'saved the moment it is landed');
  assert.equal(Object.keys(saved.book).length, 1, 'the fish is in the book');
  assert.ok(saved.coins > 0);
  assert.equal(saved.coach, true);
  assert.deepEqual((await stats(page, 'tutorial')).map(c => c[1]), ['start', 'done']);
  assert.ok(await page.evaluate(() => ll.hits) >= 1);
  // The catch card shows the fish big with its name, weight and coins.
  if (!(await state(page)).card) assert.ok(await until(page, 's.card', 120));
  assert.equal(await page.locator('#scrCatch').isVisible(), true);
  assert.match(await page.locator('#catchName').textContent(), /[؀-ۿ]/);
  assert.match(await page.locator('#catchWeight').textContent(), /^\d+\.\d كغ$/);
  assert.match(await page.locator('#catchCoins').textContent(), /^\+\d+$/);
  // A click anywhere (after a moment) closes it, and the coins fly to the counter.
  await step(page, 40);
  await page.mouse.click(200, 650);
  await step(page);
  assert.equal((await state(page)).card, false);
  assert.equal(await page.locator('#scrCatch').isVisible(), false);
  // The trip's basket shows the catch; the book has it.
  assert.equal(await page.locator('#basketNum').textContent(), String(s.trip));
});

test('pressing during a nibble scares the fish off: the hook stays, nothing is hooked', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[3] });
  await page.keyboard.press('Enter'); await step(page, 2);
  await page.keyboard.press('Enter'); await step(page, 2);
  let spooked = false;
  for (let tries = 0; tries < 6 && !spooked; tries++) {
    const s = await state(page);
    if (s.p1.state === 'ready' || s.p1.state === 'wait') {
      const f = s.fish.find(f => f.state === 'swim' && f.x > 420 && f.x < 1150) || { x: 700, y: 450 };
      const pt = await mouseTo(page, f.x + 20, f.y);
      await page.mouse.click(pt.x, pt.y);
    }
    // Tier 3 fish always nibble at least once before the bite.
    if (await until(page, "s.fish.some(f => f.state === 'nibble')", 60 * 15)) {
      const casts = (await state(page)).p1.casts;
      await page.keyboard.press('Space');
      await step(page);
      const now = await state(page);
      assert.notEqual(now.p1.state, 'reel', 'a nibble is never a bite');
      assert.equal(now.p1.casts, casts, 'the hook stays where it is');
      assert.ok(now.fish.some(f => f.state === 'flee'), 'the fish swims off');
      assert.ok(await page.evaluate(() => ll.misses) >= 1);
      spooked = true;
    }
  }
  assert.ok(spooked, 'a fish came and nibbled');
});

test('P, Esc, the button and a lost focus pause the lake; nothing moves while paused, and focus never resumes', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[1] });
  await page.keyboard.press('Enter'); await step(page, 2);
  await page.keyboard.press('Enter'); await step(page, 2);
  const pt = await mouseTo(page, 700, 450);
  await page.mouse.click(pt.x, pt.y);
  await step(page, 30);
  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.p1, __game.state.fish]));
  for (const how of ['KeyP', 'Escape', 'button', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    assert.equal((await state(page)).screen, 'pause', how);
    const before = await snap();
    await page.mouse.move(300, 300); await page.mouse.move(900, 600);
    await page.keyboard.down('ArrowRight');
    await step(page, 90);
    await page.keyboard.up('ArrowRight');
    assert.equal(await snap(), before, how + ': the lake is frozen');
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

test('leaving a place shows the trip: its catches and stars; Play again and R start a new trip, each one round', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[1] });
  await page.keyboard.press('Enter'); await step(page, 2);
  await page.keyboard.press('Enter'); await step(page, 2);
  assert.ok(await catchOne(page));
  if ((await state(page)).card) { await step(page, 40); await page.keyboard.press('Enter'); await step(page); }
  // The basket button ends the trip.
  await page.locator('#btnBasket').click();
  await step(page, 2);
  let s = await state(page);
  assert.equal(s.screen, 'result');
  assert.equal(await page.locator('#resCount').textContent(), '1');
  assert.deepEqual(await stats(page, 'end'), [['end', 'end', 1]], 'the trip ends with its catches');
  // Enter, Space and R are ignored for the first moment, then play again.
  await page.keyboard.press('Enter'); await step(page);
  assert.equal((await state(page)).screen, 'result');
  await step(page, 50);
  await page.keyboard.press('Enter'); await step(page, 2);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.trip, 0); assert.equal(s.p1.casts, 0);
  // The pause menu's places button also ends the trip; R on the result fishes here again.
  await page.keyboard.press('KeyP'); await step(page);
  await page.locator('#btnMenu').click(); await step(page, 60);
  assert.equal((await state(page)).screen, 'result');
  await page.keyboard.press('KeyR'); await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
  // Restart from the pause starts a fresh trip too.
  const casted = await mouseTo(page, 650, 420);
  await page.mouse.click(casted.x, casted.y); await step(page, 5);
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnRestart').click(); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.p1.casts, 0);
  const rounds = (await stats(page)).filter(c => c[0] === 'round' || c[0] === 'end');
  assert.deepEqual(rounds, [['round', 'p1'], ['end', 'end', 1], ['round', 'p1'], ['end', 'end', 0], ['round', 'p1'], ['end', 'end', 0], ['round', 'p1']]);
  // The result's map button goes to the places.
  await page.locator('#btnBasket').click(); await step(page, 50);
  await page.locator('#resMap').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
});

test('the places map: two stars open the next place; a locked one wiggles and does not start', async t => {
  const page = await game(t, { save: SAVE({ places: places([2, 1]) }), dda: TIER[1] });
  await page.locator('#btnPlay').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  const cls = i => page.locator('.place').nth(i).getAttribute('class');
  assert.doesNotMatch(await cls(1), /locked/, 'two stars at the pond open the river');
  assert.match(await cls(2), /locked/, 'one star at the river is not enough');
  assert.match(await cls(1), /next/, 'the river glows as the next place');
  assert.equal(await page.locator('.place').nth(0).locator('.st svg.on').count(), 2);
  // Right to left: the village pond is the rightmost card.
  const xs = await page.locator('.place').evaluateAll(list => list.map(b => b.getBoundingClientRect().x));
  assert.ok(xs[0] > xs[1] && xs[1] > xs[4]);
  await page.locator('.place').nth(2).click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  await page.locator('.place').nth(1).click(); await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.place, 1);
  assert.deepEqual((await stats(page, 'round')).map(c => c[1]), ['p2']);
});

test('saves come back after a reload, and an old or damaged save opens a fresh lake', async t => {
  const page = await game(t, { save: SAVE({ coins: 5, caught: 3, book: { koi: 21, carp: 30 }, places: places([3, 2]) }) });
  assert.equal(await page.locator('#titleFish b').textContent(), '2/33');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ll.step);
  assert.equal(await page.locator('#titleFish b').textContent(), '2/33');
  assert.equal((await page.evaluate(() => __game.save)).places[1].g.join(''), '110');
  for (const save of ['broken{', '[1,2]', '{"coins":"abc","rod":9,"quests":[{"k":"nope"}],"aqua":[{"id":99}]}', '{"v":2,"places":"x","book":{"nemo":3},"rods":{"zone":7}}']) {
    const old = await game(t, { save });
    assert.equal((await state(old)).screen, 'title');
    assert.equal(await old.locator('#titleFish b').textContent(), '0/33');
    await old.keyboard.press('Enter'); await step(old);
    const s = await state(old);
    assert.equal(s.screen, 'play', save); assert.equal(s.place, 0);
    const pt = await old.evaluate(() => __game.point(700, 450));
    await old.mouse.click(pt.x, pt.y); await step(old, 3);
    assert.equal((await state(old)).p1.casts, 1);
  }
});

test('rods: coins buy an upgrade; a full disk shows the warning, keeps the rod, and Retry writes it', async t => {
  const page = await game(t, { save: SAVE({ coins: 60 }) });
  await page.locator('#btnRods').click(); await step(page);
  assert.equal((await state(page)).screen, 'rods');
  await page.evaluate(() => { ll.failSave = true; });
  await page.locator('.tile').nth(0).click(); await step(page);
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).rods.zone, 0, 'nothing was written');
  assert.equal((await page.evaluate(() => __game.save)).rods.zone, 1, 'the rod is kept in the game');
  assert.equal(await page.locator('#rodsCoins b').textContent(), '35');
  await page.evaluate(() => { ll.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).rods.zone, 1);
  // Too few coins: nothing is bought.
  await page.locator('.tile').nth(2).click(); await step(page);
  assert.equal((await page.evaluate(() => __game.save)).rods.lure, 0);
  assert.equal((await page.evaluate(() => __game.save)).coins, 35);
  await page.keyboard.press('Escape'); await step(page);
  assert.equal((await state(page)).screen, 'title');
  // The book counts the species caught.
  await page.locator('#btnBook').click(); await step(page);
  assert.equal((await state(page)).screen, 'book');
  assert.equal(await page.locator('#bookCount b').textContent(), '0/33');
});

test('two players: the derby starts on both keys, each aims and casts with their own keys, and the end reports only end with the heavier total', async t => {
  const page = await game(t, { save: SAVE() });
  await page.locator('#btnDuo').click(); await step(page);
  let s = await state(page);
  assert.equal(s.mode, 'duo'); assert.equal(s.duo, 'intro');
  assert.equal(await page.locator('#scrDuo').isVisible(), true, 'the controls of both players are on screen');
  assert.match(await page.locator('#duoP1').textContent(), /W[\s\S]*A[\s\S]*S[\s\S]*D[\s\S]*مسافة/);
  assert.match(await page.locator('#duoP2').textContent(), /Enter/);
  await step(page, 120);
  assert.equal((await state(page)).left, 120, 'the clock waits for the start');
  await page.keyboard.press('Space'); await step(page);
  assert.match(await page.locator('#duoP1').getAttribute('class'), /ready/);
  await page.keyboard.press('Enter'); await step(page);
  assert.equal((await state(page)).duo, 'count');
  assert.deepEqual(await stats(page, 'round'), [], 'the countdown is not yet the match');
  await step(page, 185);
  s = await state(page);
  assert.equal(s.duo, 'go');
  assert.deepEqual((await stats(page, 'round')).map(c => c[1]), ['duo']);
  // Each player's keys move only their own aim.
  const a0 = s.p1.aim, b0 = s.p2.aim;
  await page.keyboard.down('KeyD'); await step(page, 20); await page.keyboard.up('KeyD');
  s = await state(page);
  assert.ok(s.p1.aim.x > a0.x + 50); assert.deepEqual(s.p2.aim, b0);
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowDown'); await step(page, 20); await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowDown');
  s = await state(page);
  assert.ok(s.p2.aim.x < b0.x - 50 && s.p2.aim.y > b0.y); assert.ok(s.p1.aim.x > a0.x + 50);
  // Space casts for player 1, Enter for player 2.
  await page.keyboard.press('Space'); await step(page, 2);
  assert.deepEqual([(await state(page)).p1.casts, (await state(page)).p2.casts], [1, 0]);
  await page.keyboard.press('Enter'); await step(page, 2);
  assert.deepEqual([(await state(page)).p1.casts, (await state(page)).p2.casts], [1, 1]);
  // The mouse does nothing in the derby (it would belong to nobody).
  const pt = await page.evaluate(() => __game.point(800, 500));
  await page.mouse.click(pt.x, pt.y); await step(page, 2);
  assert.deepEqual([(await state(page)).p1.casts, (await state(page)).p2.casts], [1, 1]);
  // Pausing holds the clock.
  await page.keyboard.press('KeyP'); await step(page);
  const left = (await state(page)).left;
  await step(page, 120);
  assert.equal((await state(page)).left, left);
  await page.keyboard.press('KeyP'); await step(page);
  // Both players fish on until the two minutes are up.
  assert.ok(await until(page, "s.screen === 'duoEnd'", 60 * 140));
  s = await state(page);
  const end = await stats(page, 'end');
  assert.equal(end.length, 1);
  assert.equal(end[0][1], 'end', 'a derby reports only end');
  assert.equal(end[0][2], Math.max(s.p1.total, s.p2.total), 'with the heavier total in tenths of a kg');
  assert.equal(await page.locator('#scrDuoEnd').isVisible(), true);
  assert.match(await page.locator('#duoWinner').textContent(), s.winner ? new RegExp('فاز اللاعب ' + s.winner) : /تعادل/);
  // Play again after a moment.
  await step(page, 50);
  await page.keyboard.press('KeyR'); await step(page);
  assert.equal((await state(page)).duo, 'intro');
});

test('the mute button and M mute every sound and remember it; M never starts the game', async t => {
  const page = await game(t);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:muted')), 'true');
  await page.keyboard.press('KeyM');
  await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'title');
});

test('the layer of buttons fits the smaller portal frame', async t => {
  const page = await game(t, { size: [1100, 620] });
  const play = await page.locator('#btnPlay').boundingBox();
  const canvas = await page.locator('#game').boundingBox();
  assert.ok(canvas.width <= 1100 && canvas.height <= 620);
  assert.ok(play.x > canvas.x && play.x + play.width < canvas.x + canvas.width && play.y + play.height < canvas.y + canvas.height);
  await page.locator('#btnPlay').click(); await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play');
  // A click on a lake point lands the hook there at this size too.
  const pt = await page.evaluate(() => __game.point(760, 500));
  await page.mouse.click(pt.x, pt.y);
  assert.ok(await until(page, "s.p1.state === 'wait' || s.p1.state === 'bite'", 300));
  const hook = (await state(page)).p1.hook;
  assert.ok(Math.abs(hook.x - 760) < 2 && Math.abs(hook.y - 500) < 2, JSON.stringify(hook));
});

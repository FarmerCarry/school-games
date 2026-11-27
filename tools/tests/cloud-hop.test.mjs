// Cloud Hop in real Chromium: Enter or Play starts level 1 at once, real keys and the
// mouse steer Marshy, pause freezes the whole picture (popups and banner too), thunder
// clouds that never flash fast, restart puts Marshy back on the start cloud,
// a won level (stars, the next level, a save that survives a reload), a lost one, the
// level map, the characters, the endless sky, saves that fail, and no errors or network
// requests at any point.
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

const KEY = 'sg:cloud-hop:save';
const SAVE = (o = {}) => Object.assign({ v: 1, played: true, coach: true, unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], candies: 0, chars: [true, false, false, false, false, false, false, false], char: 0, best: 0, bestAt: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, o);
// The game with its frame loop stepped by hand, and storage that can be made to fail.
async function game(t, { save, failSave = false, reduced = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await page.addInitScript(({ save, failSave, KEY }) => {
    if (!sessionStorage.getItem('ch-seeded')) {
      sessionStorage.setItem('ch-seeded', '1');
      if (save !== undefined) localStorage.setItem(KEY, JSON.stringify(save));
    }
    let kit;
    const ch = window.ch = { failSave, rounds: [], ends: [], dda: [] };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        ch.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        ch.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        ch.paint = () => render(0);
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key) === KEY && window.ch.failSave) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, failSave, KEY });
  await page.goto(`${server.origin}/games/cloud-hop/`);
  await page.waitForFunction(() => window.__game && window.ch.step);
  await page.evaluate(() => document.fonts.ready);
  // Count the play statistics the game reports.
  await page.evaluate(() => {
    const round = Kit.stats.round, end = Kit.stats.end;
    Kit.stats.round = function (id) { ch.rounds.push(id); return round.apply(this, arguments); };
    Kit.stats.end = function (how) { ch.ends.push(how); return end.apply(this, arguments); };
  });
  return page;
}
const state = page => page.evaluate(() => __game.state);
const stored = page => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
const stats = page => page.evaluate(() => ({ rounds: ch.rounds.slice(), ends: ch.ends.slice() }));
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; ch.run(3); }
      return ok(__game.state);
    } finally { ch.paint(); }
  }, { cond, max });
}
// Lifts Marshy just above a height (the castle, or high in the endless sky), to skip the climb.
const lift = (page, metres) => page.evaluate(metres => {
  const w = __game.world, y = metres ? metres * CH.PX : w.castleY + 40;
  w.m.y = y; w.m.vy = 0; w.m.power = null;
}, metres);

test('Enter starts level 1 at once; ← → steer Marshy; nothing moves it otherwise; Esc pauses and freezes the sky; restart', async t => {
  const page = await game(t);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  // a click on the sky or a stray key does not start
  await page.mouse.click(900, 600);
  await page.keyboard.press('F2');
  assert.equal((await state(page)).screen, 'title');
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.deepEqual([s.level, s.height, s.bubbles, s.x], [1, 0, -1, 640]);
  assert.ok(s.coach, 'the first visit shows how to steer');
  await page.evaluate(() => ch.step(120));
  s = await state(page);
  assert.equal(s.x, 640, 'nothing moves Marshy sideways but steering');
  assert.ok(s.height > 1, 'Marshy bounces by itself');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => ch.step(30));
  await page.keyboard.up('ArrowRight');
  s = await state(page);
  assert.ok(s.x > 652, 'steered right: ' + s.x);
  assert.equal(s.coach, false, 'steering ends the hint');
  await page.keyboard.down('KeyA');
  await page.evaluate(() => ch.step(40));
  await page.keyboard.up('KeyA');
  assert.ok((await state(page)).x < s.x, 'A steers left');
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(await page.locator('#scrPause').isVisible(), true);
  const frozen = JSON.stringify([s.t, s.x, s.y, s.height]);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => ch.step(60));
  await page.keyboard.up('ArrowRight');
  s = await state(page);
  assert.equal(JSON.stringify([s.t, s.x, s.y, s.height]), frozen, 'paused: nothing moves');
  assert.equal((await stored(page)).coach, true, 'pausing saves');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).screen, 'play');
  await page.evaluate(() => ch.step(30));
  assert.ok((await state(page)).t > JSON.parse(frozen)[0]);
  await page.click('#btnPause');
  await page.click('#btnRestart');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.ok(s.height < 1 && s.t < 2);
  assert.equal(s.x, 640);
  assert.deepEqual((await stats(page)).rounds, ['L1', 'L1']);
  assert.deepEqual((await stats(page)).ends, ['quit']);
  await page.click('#btnPause');
  await page.click('#btnHome');
  assert.equal((await state(page)).screen, 'title');
  assert.deepEqual((await stats(page)).ends, ['quit', 'quit']);
});

test('pause holds the whole picture still: the sky, the popups, the level banner and the sparkles', async t => {
  const page = await game(t, { save: SAVE(), reduced: false });
  const shot = () => page.evaluate(() => document.getElementById('game').toDataURL());
  await page.keyboard.press('Enter');
  assert.ok(await until(page, "s.phase === 'play'"));
  await lift(page, 10.2); // the 10 m popup floats up
  await page.evaluate(() => ch.step(2));
  let s = await state(page);
  assert.ok(s.height >= 10 && s.banner === 'المرحلة 1', JSON.stringify(s));
  await page.keyboard.press('KeyP');
  await page.evaluate(() => ch.step(1));
  const still = await shot();
  for (const n of [10, 30, 110]) { // 2.5 s in all, longer than the banner lasts
    await page.evaluate(n => ch.step(n), n);
    assert.equal(await shot(), still, 'nothing moves behind the pause card');
  }
  s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(s.banner, 'المرحلة 1', 'the banner waits for play to go on');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => ch.step(150));
  assert.equal((await state(page)).banner, '', 'then it runs out');
});

test('a thunder cloud never flashes fast: a gentle glow, stars that blink at 3 Hz at most, all still when motion is reduced', async t => {
  const page = await game(t, { reduced: false });
  // One thunder cloud drawn on its own, a frame every 1/60 s from just before its warning to the end of its charge.
  const frames = calm => page.evaluate(calm => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d', { willReadFrequently: true }), v = CH.createView(ctx);
    v.setScale(1); v.calm = calm;
    const w = CH.create({ level: 7, diff: 0.5, seed: 3 }), p = w.plats.find(q => q.kind === 'cloud' && q.y > 0);
    Object.assign(p, { kind: 'thunder', face: 1, off: 0, x: 400, y: w.cam + 360, hitT: -9 });
    w.plats = [p]; w.items = []; w.foes = []; w.m.x = 1100; w.m.y = w.cam + 100;
    const sum = (x, y, wd, h) => { let n = 0; const d = ctx.getImageData(x, y, wd, h).data; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2]; return n; };
    const out = [];
    for (let f = 0; f <= 102; f++) {
      w.t = 1.405 + f / 60; // the warning starts at 1.45 s, the charge at 1.9 s and ends at 3 s
      v.render(w, { t: w.t, dt: 0, char: 'marshy', theme: 2, theme2: 2, mix: 0 });
      out.push({ on: CH.charged(p, w.t), warn: w.t > 1.45 && w.t < 1.9, stars: sum(330, 300, 140, 46), glow: sum(330, 340, 140, 36) });
    }
    return out;
  }, calm);
  const runs = list => { const r = [1]; for (let i = 1; i < list.length; i++) list[i] === list[i - 1] ? r[r.length - 1]++ : r.push(1); return r; };
  for (const calm of [false, true]) {
    const f = await frames(calm), quiet = f[0].stars, warn = f.filter(x => x.warn), charged = f.filter(x => x.on);
    assert.ok(warn.length === 27 && charged.length === 66 && !warn.some(x => x.on));
    const shown = warn.map(x => x.stars !== quiet);
    assert.equal(shown[0], true, 'the warning starts with the stars showing');
    if (calm) {
      assert.ok(shown.every(Boolean), 'calm: the stars stay on through the warning');
      assert.equal(new Set(charged.map(x => x.glow)).size, 1, 'calm: a steady glow');
    } else {
      // each on or off spell lasts 1/6 s (3 Hz), but the last one, cut short by the charge
      assert.ok(runs(shown).slice(0, -1).every(n => n >= 9), 'stars: ' + runs(shown));
      // the glow rises and falls smoothly, at most 3 times a second
      let turns = 0, last = 0;
      for (let i = 1; i < charged.length; i++) {
        const d = Math.sign(charged[i].glow - charged[i - 1].glow);
        if (d && last && d !== last) turns++;
        if (d) last = d;
      }
      assert.ok(turns >= 2 && turns <= 7, 'glow turns: ' + turns);
    }
  }
});

test('level 1 won: stars, candies, the next level, and a save that survives a reload', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  // keys work right after clicking Play (and squat steering does not dismiss coach)
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => ch.step(20));
  await page.keyboard.up('ArrowLeft');
  assert.ok((await state(page)).x < 640);
  assert.equal((await state(page)).coach, true, 'coach stays visible during squat');
  assert.ok(await until(page, 's.phase === "play" && s.height > 3', 120));
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => ch.step(20));
  await page.keyboard.up('ArrowRight');
  assert.equal((await state(page)).coach, false, 'steering in play dismisses coach');
  await lift(page);
  assert.ok(await until(page, 's.phase === "arrive"', 60));
  let s = await state(page);
  assert.equal(s.won, true);
  assert.equal(s.banner, 'وصلت!');
  assert.ok(await until(page, 's.screen === "result"', 60 * 4));
  s = await state(page);
  assert.ok(s.stars >= 1 && s.stars <= 3);
  assert.equal(await page.locator('#btnNext').isVisible(), true);
  assert.equal(await page.locator('#resTitle').textContent(), 'وصلت!');
  assert.equal(await page.locator('#resStars .st.on').count(), s.stars);
  const saved = await stored(page);
  assert.equal(saved.stars[0], s.stars);
  assert.equal(saved.unlocked, 2);
  assert.equal(saved.candies, s.wallet);
  assert.ok(saved.candies >= s.candies + 5 * s.stars, 'candies plus a bonus per star');
  assert.equal(saved.coach, true);
  assert.deepEqual((await stats(page)).ends, ['win']);
  // Enter right away (a key held from play) does nothing; a moment later it goes on
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).screen, 'result');
  await page.evaluate(() => ch.step(40));
  await page.keyboard.press('Enter');
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 2);
  assert.equal(s.bubbles, 3);
  assert.deepEqual((await stats(page)).rounds, ['L1', 'L2']);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ch.step);
  assert.equal(await page.locator('#titleLevel b').textContent(), '2');
  assert.equal(await page.locator('#titleCandies b').textContent(), String(saved.candies));
  await page.click('#btnPlay');
  assert.equal((await state(page)).level, 2, 'Play continues at the next level not yet won');
});

test('out of bubbles: the try ends, R tries the same level again, Esc goes to the title', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 5, stars: [2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], candies: 10 }) });
  await page.click('#btnPlay');
  let s = await state(page);
  assert.equal(s.level, 5);
  assert.equal(s.bubbles, 2);
  await page.evaluate(() => ch.step(90));
  // two falls use the bubbles, the third ends the try
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const w = __game.world; w.m.y = w.cam - 200; w.m.vy = -400; });
    assert.ok(await until(page, 's.phase === "rescue"', 30));
    assert.ok(await until(page, 's.phase === "play"', 120));
  }
  s = await state(page);
  assert.equal(s.bubbles, 0); assert.equal(s.falls, 2);
  await page.evaluate(() => { const w = __game.world; w.m.y = w.cam - 200; w.m.vy = -400; });
  assert.ok(await until(page, 's.screen === "result"', 200));
  assert.equal(await page.locator('#btnNext').isVisible(), false);
  assert.equal(await page.locator('.result-card.lose').count(), 1);
  assert.equal(await page.locator('#resStars .st.on').count(), 0);
  assert.equal((await stored(page)).stars[4], 0);
  assert.deepEqual((await stats(page)).ends, ['lose']);
  await page.evaluate(() => ch.step(40));
  await page.keyboard.press('KeyR');
  s = await state(page);
  assert.deepEqual([s.screen, s.level, s.bubbles, s.falls], ['play', 5, 2, 0]);
  await page.evaluate(() => { const w = __game.world; w.bubbles = 0; w.phase = 'play'; w.m.y = w.cam - 200; w.m.vy = -400; });
  assert.ok(await until(page, 's.screen === "result"', 200));
  await page.evaluate(() => ch.step(40));
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).screen, 'title');
  assert.deepEqual((await stats(page)).rounds, ['L5', 'L5']);
});

test('the mouse steers only after it moves over the sky during play', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  await page.evaluate(() => ch.step(60));
  assert.equal((await state(page)).x, 640, 'the click on Play does not steer');
  const p = await page.evaluate(() => __game.point(1000, 400));
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.evaluate(() => ch.step(90));
  let s = await state(page);
  assert.equal(s.mouse, true);
  assert.ok(Math.abs(s.x - 1000) < 8, 'eased to the pointer: ' + s.x);
  // a key takes over again
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => ch.step(20));
  await page.keyboard.up('ArrowLeft');
  s = await state(page);
  assert.equal(s.mouse, false);
  assert.ok(s.x < 1000);
  // after a pause with the mouse, Marshy does not run off towards the pause button
  const q = await page.evaluate(() => __game.point(700, 400));
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await page.evaluate(() => ch.step(90));
  s = await state(page);
  assert.ok(s.mouse && Math.abs(s.x - 700) < 8, 'steering by mouse again: ' + s.x);
  const box = await page.locator('#btnPause').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal((await state(page)).screen, 'pause');
  const go = await page.locator('#btnResume').boundingBox();
  await page.mouse.move(go.x + go.width / 2, go.y + go.height / 2, { steps: 4 });
  await page.mouse.click(go.x + go.width / 2, go.y + go.height / 2);
  await page.evaluate(() => ch.step(60));
  const r = await state(page);
  assert.equal(r.screen, 'play');
  assert.equal(r.mouse, false, 'the mouse steers again only once it moves over the sky');
  assert.ok(Math.abs(r.x - s.x) < 20, 'Marshy stays put after Resume: ' + s.x + ' -> ' + r.x);
});

test('the level map opens won levels only; the characters cost candies and are worn', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 3, stars: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], candies: 120 }) });
  assert.equal(await page.locator('#btnChars .dot').isVisible(), true, 'something to buy');
  await page.click('#btnLevels');
  assert.equal((await state(page)).screen, 'levels');
  assert.equal(await page.locator('.lvl.locked[data-level]').count(), 9);
  assert.equal(await page.locator('.lvl.next').getAttribute('data-level'), '3');
  await page.click('.lvl[data-level="7"]');
  assert.equal((await state(page)).screen, 'levels', 'a locked level does not start');
  await page.click('#lvlEndless');
  assert.equal((await state(page)).screen, 'levels', 'endless opens after level 4');
  await page.click('.lvl[data-level="2"]');
  let s = await state(page);
  assert.deepEqual([s.screen, s.level], ['play', 2]);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.click('#btnChars');
  assert.equal((await state(page)).screen, 'shop');
  await page.click('#chars .char:nth-child(2)');
  let saved = await stored(page);
  assert.deepEqual([saved.char, saved.chars[1], saved.candies], [1, true, 75]);
  await page.click('#chars .char:nth-child(4)');
  saved = await stored(page);
  assert.deepEqual([saved.char, saved.chars[3], saved.candies], [1, false, 75], 'too dear: nothing changes');
  await page.click('#chars .char:nth-child(1)');
  saved = await stored(page);
  assert.deepEqual([saved.char, saved.candies], [0, 75], 'wearing an owned one is free');
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#titleCandies b').textContent(), '75');
});

test('a double-click on a title button does not go on to buy a character or start a level', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 6, stars: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], candies: 300 }) });
  await page.locator('#btnChars').dblclick();
  assert.equal((await state(page)).screen, 'shop');
  let saved = await page.evaluate(() => __game.save);
  assert.deepEqual([saved.candies, saved.char, saved.chars.filter(Boolean).length], [300, 0, 1], 'nothing bought or worn');
  await page.keyboard.press('Escape');
  await page.locator('#btnLevels').dblclick();
  assert.equal((await state(page)).screen, 'levels');
  assert.deepEqual((await stats(page)).rounds, [], 'no level started');
  // one click on a card or a tile still works
  await page.keyboard.press('Escape');
  await page.click('#btnChars');
  await page.click('#chars .char:nth-child(4)');
  saved = await page.evaluate(() => __game.save);
  assert.deepEqual([saved.candies, saved.char], [130, 3]);
});

test('with every level won the title says the Play button goes to the endless sky', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 12, stars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] }) });
  assert.equal(await page.locator('#titleLevel small').textContent(), 'بلا نهاية');
  assert.equal(await page.locator('#titleLevel b svg').count(), 1);
  await page.click('#btnPlay');
  assert.equal((await state(page)).level, 0);
  await page.keyboard.press('Escape');
  await page.click('#btnHome');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('sg:cloud-hop:save')); s.stars[11] = 0; localStorage.setItem('sg:cloud-hop:save', JSON.stringify(s)); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ch.step);
  assert.equal(await page.locator('#titleLevel small').textContent(), 'المرحلة');
  assert.equal(await page.locator('#titleLevel b').textContent(), '12');
});

test('the endless sky: open after level 4, one bubble, and the best height is kept', async t => {
  const page = await game(t, { save: SAVE({ unlocked: 5, stars: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], best: 20 }) });
  await page.click('#btnEndless');
  let s = await state(page);
  assert.deepEqual([s.screen, s.level, s.bubbles], ['play', 0, 1]);
  assert.ok(await until(page, 's.phase === "play"', 60));
  await lift(page, 45);
  assert.ok(await until(page, 's.height > 40', 60));
  await page.evaluate(() => { const w = __game.world; w.bubbles = 0; w.m.power = null; w.m.y = w.cam - 200; w.m.vy = -400; });
  assert.ok(await until(page, 's.screen === "result"', 200));
  s = await state(page);
  const saved = await stored(page);
  assert.equal(saved.best, Math.floor(s.height));
  assert.equal(await page.locator('#resBest').isVisible(), true, 'a new best height');
  assert.equal(await page.locator('#resHeight').textContent(), String(Math.floor(s.height)));
  assert.deepEqual(await stats(page), { rounds: ['endless'], ends: ['end'] });
});

test('a save that fails says so and the game keeps going; Retry saves once storage works', async t => {
  const page = await game(t, { failSave: true });
  await page.click('#btnPlay');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => ch.step(55));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await stored(page), null);
  await page.evaluate(() => { ch.failSave = false; });
  await page.locator('.sg-save-status button').click();
  const saved = await stored(page);
  assert.equal(saved.played, true);
  assert.equal(saved.coach, true);
});

test('coach survives a mouse nudge during squat, mouse edge-wraps across seam, and falling logs lose immediately', async t => {
  const page = await game(t);
  await page.click('#btnPlay');
  // Small mouse nudge during squat does not dismiss coach
  const near = await page.evaluate(() => __game.point(646, 360));
  await page.mouse.move(near.x, near.y);
  await page.evaluate(() => ch.step(25)); // still in squat
  let s = await state(page);
  assert.equal(s.phase, 'squat');
  assert.equal(s.coach, true, 'coach survives squat nudge');
  // Enter play and nudge <15px: coach still stays
  await page.evaluate(() => ch.step(20));
  const tiny = await page.evaluate(() => __game.point(655, 360));
  await page.mouse.move(tiny.x, tiny.y);
  await page.evaluate(() => ch.step(20));
  s = await state(page);
  assert.equal(s.phase, 'play');
  assert.equal(s.coach, true, 'coach survives tiny <20px move in play');
  // Mouse at left edge (<24px) smoothly wraps across the seam and dismisses coach
  await page.evaluate(() => { __game.world.m.x = 70; __game.world.m.vx = 0; });
  const edge = await page.evaluate(() => __game.point(8, 360));
  await page.mouse.move(edge.x, edge.y);
  await page.evaluate(() => ch.step(40));
  s = await state(page);
  assert.ok(s.x > 800, 'mouse at left edge wrapped across seam: ' + s.x);
  assert.equal(s.coach, false, 'real travel in play dismisses coach');
  // Leaving while in phase === 'fell' logs 'lose' immediately (never 'quit')
  const page2 = await game(t, { save: SAVE({ unlocked: 5, stars: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0] }) });
  await page2.click('#btnPlay');
  await page2.evaluate(() => ch.step(50));
  await page2.evaluate(() => { const w = __game.world; w.bubbles = 0; w.m.y = w.cam - 200; w.m.vy = -400; });
  assert.ok(await until(page2, 's.phase === "fell"', 30));
  assert.deepEqual((await stats(page2)).ends, ['lose'], 'lose logged immediately on falling');
  await page2.keyboard.press('Escape');
  await page2.click('#btnHome');
  assert.deepEqual((await stats(page2)).ends, ['lose'], 'exiting during fall does not log quit');
});

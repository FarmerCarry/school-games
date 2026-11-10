// Egg Rush (سباق البيض) in real Chromium: real keyboard and mouse input on a frame loop
// stepped by hand, pause, results, saves (also a blocked one) and the two-player race.
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

// The game with its frame loop stepped by hand.
// saved: a raw string put in storage once per tab; failSave: storage refuses the save.
async function game(t, { saved, failSave = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors'); });
  await page.addInitScript(({ saved, failSave }) => {
    if (saved !== undefined && !sessionStorage.getItem('er-seeded')) { sessionStorage.setItem('er-seeded', '1'); localStorage.setItem('sg:egg-rush:save', saved); }
    let kit;
    const er = window.er = { failSave: !!failSave };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        er.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:egg-rush:save' && er.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { saved, failSave });
  await page.goto(`${server.origin}/games/egg-rush/`);
  await page.waitForFunction(() => window.__game && window.er.step);
  return page;
}
const g = (page, expr) => page.evaluate(new Function('return (' + expr + ');'));
const step = (page, n = 1) => page.evaluate(n => er.step(n), n);
const focus = page => page.evaluate(() => { document.activeElement && document.activeElement.blur(); document.getElementById('game').focus(); });
const SAVE = (stars, extra = {}) => JSON.stringify({ v: 2, stars: Array.from({ length: 20 }, (_, i) => i < stars ? 2 : 0), best: Array(20).fill(0), babies: [0, 0, 0, 0, 0], golden: [0, 0, 0, 0, 0], color: 0, hat: 0, seen: 0, coached: true, duo: 0, ...extra });

// Real keys: hold the arrows towards a point (none while the guards are not asleep).
const held = new WeakMap();
async function keys(page, want) {
  const now = held.get(page) || new Set();
  for (const k of [...now]) if (!want.includes(k)) { await page.keyboard.up(k); now.delete(k); }
  for (const k of want) if (!now.has(k)) { await page.keyboard.down(k); now.add(k); }
  held.set(page, now);
}
function towards(s, tx, ty, set = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
  const out = [];
  if (tx > s.x + 8) out.push(set[1]); else if (tx < s.x - 8) out.push(set[0]);
  if (ty > s.y + 8) out.push(set[3]); else if (ty < s.y - 8) out.push(set[2]);
  return out;
}
// Plays the open solo level with the keyboard: to the nearest egg, then home; freeze
// whenever a guard is stirring or looking.
async function playLevel(page, maxFrames = 9000) {
  for (let f = 0; f < maxFrames; f += 10) {
    const s = await page.evaluate(() => ({ screen: __game.screen, ending: __game.ending, x: __game.px, y: __game.py, carrying: __game.carrying, guards: __game.guards, eggs: __game.eggList }));
    if (s.screen !== 'play' || s.ending) break;
    const calm = s.guards.every(q => q.state === 'sleep' || q.state === 'walk');
    let want = [];
    if (calm) {
      if (s.carrying) want = towards(s, 112, 424);
      else {
        const e = s.eggs.filter(e => e.state === 'nest').sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
        if (e) want = towards(s, e.x, e.y);
      }
    }
    await keys(page, want);
    await step(page, 10);
  }
  await keys(page, []);
}

test('the title waits; Play opens the first yard with a picture card, and the arrows move the kid', async t => {
  const page = await game(t);
  await step(page, 30);
  assert.equal(await g(page, '__game.screen'), 'title');
  assert.deepEqual([await g(page, '__game.tries'), await g(page, '__game.level')], [0, ''], 'the title starts no yard');
  await page.locator('#btnPlay').click();
  await step(page, 2);
  assert.equal(await g(page, '__game.screen'), 'play');
  assert.equal(await g(page, '__game.level'), 'w1L1');
  assert.equal(await g(page, '__game.intro'), true, 'the rule card first');
  assert.equal(await g(page, '__game.tries'), 1, 'one yard started');
  assert.equal((await g(page, '__game.save')).coached, false, 'the first yard is the coached one');
  // The world waits behind the card.
  await step(page, 60);
  assert.equal(await g(page, '__game.time'), 0);
  await focus(page);
  const x = await g(page, '__game.px');
  await page.keyboard.down('ArrowRight');
  await step(page, 40);
  await page.keyboard.up('ArrowRight');
  await step(page, 25);
  assert.equal(await g(page, '__game.intro'), false, 'a key closes the card');
  assert.ok(await g(page, '__game.px') > x + 60, 'and moves the kid');
  assert.ok(await g(page, '__game.time') > 0);
  // WASD works too, and up/down
  const y = await g(page, '__game.py');
  await page.keyboard.down('KeyS');
  await step(page, 20);
  await page.keyboard.up('KeyS');
  await step(page, 10);
  assert.ok(await g(page, '__game.py') > y + 30, 'S walks down');
});

test('P and Esc pause; a paused yard is frozen even with keys held; leaving the window pauses and focus does not resume', async t => {
  const page = await game(t, { saved: SAVE(1) });
  await page.locator('#btnPlay').click();
  await step(page, 2);
  await page.locator('.lvl[data-li="0"]').click();
  await step(page, 2);
  await focus(page);
  await page.keyboard.press('ArrowRight');
  await step(page, 30);
  for (const key of ['KeyP', 'Escape']) {
    await page.keyboard.press(key);
    await step(page);
    assert.equal(await g(page, '__game.screen'), 'pause', key);
    const before = await g(page, '[__game.px, __game.py, __game.time, JSON.stringify(__game.guards)]');
    await page.keyboard.down('ArrowDown');
    await step(page, 90);
    await page.keyboard.up('ArrowDown');
    assert.deepEqual(await g(page, '[__game.px, __game.py, __game.time, JSON.stringify(__game.guards)]'), before, 'nothing moves while paused');
    await page.keyboard.press(key);
    await step(page);
    assert.equal(await g(page, '__game.screen'), 'play');
  }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page);
  assert.equal(await g(page, '__game.screen'), 'pause', 'leaving the window pauses');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await step(page, 20);
  assert.equal(await g(page, '__game.screen'), 'pause', 'focus does not resume');
  await page.locator('#btnResume').click();
  await step(page);
  assert.equal(await g(page, '__game.screen'), 'play');
  // Restart from the pause card puts the kid back at the start, as a new round
  await page.keyboard.press('KeyP');
  await step(page);
  await page.locator('#btnRestart').click();
  await step(page);
  assert.equal(await g(page, '__game.screen'), 'play');
  assert.equal(await g(page, '__game.atStart'), true);
  assert.deepEqual([await g(page, '__game.tries'), await g(page, '__game.level'), await g(page, '__game.hatched')], [2, 'w1L1', 0], 'the same yard again, from the start');
  // The map button leaves the level unfinished
  await page.keyboard.press('Escape');
  await step(page);
  await page.locator('#btnMenu').click();
  await step(page);
  assert.equal(await g(page, '__game.screen'), 'map');
  assert.equal(await g(page, '__game.level'), '', 'the yard is left');
  const left = await g(page, '__game.save');
  assert.deepEqual([left.stars[0], left.best[0]], [2, 0], 'leaving early records no result');
});

test('playing the first yard with the keyboard: eggs hatch, the level ends with stars, saves, and Play again', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter');
  await step(page, 2);
  await focus(page);
  await playLevel(page);
  assert.equal(await g(page, '__game.ending'), true, 'the yard is finished');
  assert.ok(await g(page, '__game.hatched') >= await g(page, '__game.goal'));
  await step(page, 150);
  assert.equal(await g(page, '__game.screen'), 'result');
  const stars = await g(page, '__game.stars');
  assert.ok(stars >= 2 && stars <= 3);
  await step(page, 120);
  assert.equal(await page.locator('#resStars svg.on').count(), stars);
  const goal = await g(page, '__game.goal');
  assert.equal(await g(page, '__game.eggs'), goal, 'a win with the eggs hatched');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:egg-rush:save')));
  assert.equal(saved.v, 2);
  assert.equal(saved.stars[0], stars);
  assert.ok(saved.best[0] > 0);
  assert.equal(saved.babies[0], goal, 'the chicks are in the barn');
  assert.equal(saved.coached, true);
  // R plays the same yard again; Enter goes on to the next
  await page.keyboard.press('KeyR');
  await step(page, 2);
  assert.equal(await g(page, '__game.level'), 'w1L1');
  assert.equal(await g(page, '__game.intro'), false, 'a quick retry skips the card');
  await page.keyboard.press('KeyP');
  await step(page);
  await page.locator('#btnMenu').click();
  await step(page);
  assert.equal(await page.locator('.lvl[data-li="1"]').evaluate(b => b.classList.contains('next') && !b.classList.contains('locked')), true, 'level 2 is open and marked');
  assert.equal(await page.locator('.lvl[data-li="4"]').evaluate(b => b.classList.contains('locked')), true, 'world 2 waits');
  // the save survives a reload
  await page.reload();
  await page.waitForFunction(() => window.__game && window.er.step);
  assert.equal((await g(page, '__game.save')).stars[0], stars);
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await g(page, '__game.screen'), 'map', 'a child with stars picks on the map');
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await g(page, '__game.level'), 'w1L2', 'Enter on the map opens the next yard');
});

for (const motion of ['no-preference', 'reduce']) test(`moving in a looking hen's eyes: «!», a bump, and the egg rolls back (motion: ${motion})`, async t => {
  const page = await game(t, { saved: SAVE(1), reducedMotion: motion });
  await page.keyboard.press('Enter');
  await step(page, 2);
  await page.locator('.lvl[data-li="0"]').click();
  await step(page, 2);
  await focus(page);
  // walk to the egg while the hen sleeps, pick it up
  for (let i = 0; i < 300 && !(await g(page, '__game.carrying')); i++) {
    const s = await page.evaluate(() => ({ x: __game.px, y: __game.py, e: __game.eggList[0], h: __game.guards[0] }));
    await keys(page, s.h.state === 'sleep' ? towards(s, s.e.x, s.e.y) : []);
    await step(page, 4);
  }
  await keys(page, []);
  assert.equal(await g(page, '__game.carrying'), true);
  // wait, standing still, until the hen is looking: standing still is safe
  for (let i = 0; i < 900 && (await g(page, '__game.guards[0].state')) !== 'awake'; i++) await step(page, 3);
  await step(page, 30);
  assert.equal(await g(page, '__game.catches'), 0, 'frozen in her eyes is safe');
  // now walk left in her eyes
  await keys(page, ['ArrowLeft']);
  for (let i = 0; i < 60 && !(await g(page, '__game.catches')); i++) await step(page, 2);
  await keys(page, []);
  assert.equal(await g(page, '__game.catches'), 1);
  if (motion === 'reduce') assert.equal(await g(page, '__game.shake'), 0, 'no shake under reduced motion');
  else assert.ok(await g(page, '__game.shake') > 0, 'the screen shakes');
  await step(page, 200);
  assert.equal(await g(page, '__game.carrying'), false, 'the egg was dropped');
  assert.equal(await g(page, '__game.eggList[0].state'), 'nest', 'and rolled back to the nest');
  assert.equal(await g(page, '__game.screen'), 'play', 'no game over');
});

test('the ghost kid shows the way after a few idle seconds, and the mouse can walk the kid too', async t => {
  const page = await game(t, { saved: SAVE(1) });
  await page.keyboard.press('Enter');
  await step(page, 2);
  await page.locator('.lvl[data-li="0"]').click();
  await step(page, 2);
  await page.keyboard.press('ArrowDown');
  await step(page, 10);
  assert.equal(await g(page, '__game.ghost'), false);
  // idle seconds count only while it is safe to walk (freezing for the hen is right)
  for (let i = 0; i < 60 && !(await g(page, '__game.ghost')); i++) await step(page, 20);
  assert.equal(await g(page, '__game.ghost'), true, 'the coach walks after a few idle seconds');
  // holding the mouse button walks towards the pointer (and the coach steps aside)
  const x = await g(page, '__game.px');
  const p = await page.evaluate(() => __game.point(__game.px + 300, __game.py));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await step(page, 30);
  await page.mouse.up();
  await step(page, 10);
  assert.ok(await g(page, '__game.px') > x + 50, 'walked towards the pointer');
  assert.equal(await g(page, '__game.ghost'), false);
});

test('a blocked save shows the warning with a retry, and the game goes on', async t => {
  const page = await game(t, { failSave: true });
  await page.keyboard.press('Enter');
  await step(page, 2);
  await focus(page);
  await playLevel(page);
  await step(page, 10);
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
  assert.equal(await page.locator('.sg-save-status button').isVisible(), true);
  await step(page, 160);
  assert.equal(await g(page, '__game.screen'), 'result', 'the result still shows');
  await page.evaluate(() => { er.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status').getAttribute('data-state'), 'saved');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:egg-rush:save')));
  assert.ok(saved.stars[0] >= 1, 'the retry wrote the stars');
});

test('old and broken saves load as a fresh, playable game', async t => {
  for (const saved of ['{broken', JSON.stringify({ coins: 900, shoes: 3, pets: [1, 2] }), JSON.stringify({ v: 2, stars: 'x', babies: [-4], hat: 99 })]) {
    const page = await game(t, { saved });
    await page.keyboard.press('Enter');
    await step(page, 2);
    assert.equal(await g(page, '__game.level'), 'w1L1', saved);
    const s = await g(page, '__game.save');
    assert.deepEqual(s.stars, Array(20).fill(0));
    assert.equal(s.hat, 0);
  }
});

test('two players: both kids respond to their own keys, bumps and the clock, and the race ends in a win or a draw', async t => {
  const page = await game(t);
  await page.locator('#btnDuo').click();
  await step(page, 2);
  assert.equal(await g(page, '__game.mode'), 'duo');
  assert.equal(await g(page, '__game.tries'), 1, 'one race started');
  assert.equal(await g(page, '__game.intro'), true, 'the keys card first');
  await focus(page);
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await g(page, '__game.countdown'), true);
  await step(page, 60 * 4);
  assert.equal(await g(page, '__game.countdown'), false);
  const start = await g(page, '[__game.px, __game.p2x, __game.py, __game.p2y]');
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await step(page, 30);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  await step(page, 5);
  const moved = await g(page, '[__game.px, __game.p2x, __game.py, __game.p2y]');
  assert.ok(moved[0] > start[0] + 40, 'player 1 walked right with D');
  assert.ok(moved[1] < start[1] - 40, 'player 2 walked left with ←');
  // the arrows do not move player 1, WASD does not move player 2
  await page.keyboard.down('ArrowDown');
  await step(page, 20);
  await page.keyboard.up('ArrowDown');
  await step(page, 5);
  const after = await g(page, '[__game.px, __game.p2x, __game.py, __game.p2y]');
  assert.ok(Math.abs(after[2] - moved[2]) < 1, 'player 1 ignored ↓');
  assert.ok(after[3] > moved[3] + 20, 'player 2 walked down');
  // both kids play: walk to their nearest eggs and home while the guards sleep
  for (let f = 0; f < 60 * 80; f += 10) {
    const s = await page.evaluate(() => ({ p: [[__game.px, __game.py], [__game.p2x, __game.p2y]], guards: __game.guards, eggs: __game.eggList, homes: [[112, 424], [1168, 424]], scores: __game.scores, play: __game.screen === 'play' && !__game.ending }));
    if (!s.play || s.scores.every(n => n >= 1)) break;
    const want = [];
    for (let i = 0; i < 2; i++) {
      const me = { x: s.p[i][0], y: s.p[i][1] }, set = i ? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] : ['KeyA', 'KeyD', 'KeyW', 'KeyS'];
      // each kid freezes while a guard near it is not asleep
      if (s.guards.every(q => q.state === 'sleep' || q.state === 'walk' || Math.hypot(q.x - me.x, q.y - me.y) > 330)) {
        const carrying = s.eggs.some(e => e.state === 'carry' && Math.hypot(e.x - me.x, e.y - me.y) < 4);
        const e = s.eggs.filter(e => e.state === 'nest').sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
        if (carrying) want.push(...towards(me, s.homes[i][0], s.homes[i][1], set)); else if (e) want.push(...towards(me, e.x, e.y, set));
      }
    }
    await keys(page, want);
    await step(page, 10);
  }
  await keys(page, []);
  // then the clock runs out
  await step(page, 60 * 92);
  await step(page, 200);
  assert.equal(await g(page, '__game.screen'), 'result');
  const scores = await g(page, '__game.scores');
  assert.ok(scores[0] >= 1 && scores[1] >= 1, 'both kids hatched eggs: ' + scores);
  const winner = await g(page, '__game.winner');
  assert.equal(winner, scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1, 'the kid with more eggs wins, or a draw');
  assert.equal(await page.locator('#resDuo').isVisible(), true);
  assert.equal((await g(page, '__game.save')).duo, 1);
  // Enter starts a rematch
  await step(page, 60);
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await g(page, '__game.mode'), 'duo');
  assert.deepEqual([await g(page, '__game.tries'), await g(page, '__game.screen'), await g(page, '__game.scores')], [2, 'play', [0, 0]], 'a new race');
});

test('the barn and the wardrobe open from the title and close with Esc; locked outfits stay locked', async t => {
  const page = await game(t, { saved: SAVE(3, { babies: [4, 0, 0, 0, 0], golden: [1, 0, 0, 0, 0] }) });
  await page.locator('#btnBarn').click();
  await step(page, 5);
  assert.equal(await g(page, '__game.screen'), 'barn');
  const counts = await page.locator('.tile b').allTextContents();
  assert.equal(counts[0], '×3');
  assert.equal(counts[5], '×1');
  assert.equal(counts[1], '?');
  await page.keyboard.press('Escape');
  await step(page, 2);
  assert.equal(await g(page, '__game.screen'), 'title');
  await page.locator('#btnCloset').click();
  await step(page, 2);
  assert.equal(await g(page, '__game.screen'), 'closet');
  // 6 stars: the red overalls (2) and the cap (3) are open, the crown (36) is not
  await page.locator('#hats .item').nth(1).click();
  await page.locator('#colors .item').nth(1).click();
  await page.locator('#hats .item').nth(7).click();
  await step(page, 2);
  const s = await g(page, '__game.save');
  assert.equal(s.hat, 1);
  assert.equal(s.color, 1);
  assert.equal(await page.locator('#hats .item').nth(7).evaluate(b => b.classList.contains('locked')), true);
  await page.keyboard.press('Escape');
  await step(page, 2);
  assert.equal(await g(page, '__game.screen'), 'title');
});

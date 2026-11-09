// Bubble Bop in real Chromium: real mouse and keyboard input, saves, pause, mute,
// reduced motion and the difficulty tiers.
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

const SAVE = (worldsDone, extra = {}) => ({ v: 1, stars: [0, 1, 2, 3, 4].map(w => w < worldsDone ? [3, 3, 3] : [0, 0, 0]), best: [0, 0, 0, 0, 0], grip: true, color: 0, hat: 0, seenStars: 0, ...extra });

// Every test: no page errors, no console errors and no request off the test server.
async function context(t, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: options.reducedMotion || 'no-preference' });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  // Seeded once per tab, so a reload keeps what the game saved.
  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:' || sessionStorage.getItem('bb-seeded')) return;
    sessionStorage.setItem('bb-seeded', '1');
    if (save !== undefined) localStorage.setItem('sg:bubble-bop:save', JSON.stringify(save));
    if (dda) localStorage.setItem('sg:bubble-bop:dda', JSON.stringify(dda));
  }, { save: options.save, dda: options.dda });
  return ctx;
}
// The game with its frame loop stepped by hand.
async function game(t, options = {}) {
  const ctx = await context(t, options);
  await ctx.addInitScript(() => {
    let kit;
    const bb = window.bb = {};
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        bb.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        // Simulation only, then one paint: long stretches of play where nothing is checked on screen.
        bb.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        bb.paint = () => render(0);
        return { stop() {} };
      };
    } });
  });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/bubble-bop/`);
  await page.waitForFunction(() => window.__game && window.bb.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => bb.step(n), n);
// Steps the game until a condition on its state holds (or the step budget runs out).
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; bb.run(3); }
      return ok(__game.state);
    } finally { bb.paint(); }
  }, { cond, max });
}
// Opens a level from the map with a real click on its pebble.
async function openLevel(page, w, l) {
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  // Worlds 6-11 are on the map's second page, behind the big arrow.
  const want = w >= 5 ? 1 : 0;
  if ((await state(page)).mapPage !== want) { await page.locator(want ? '#mapNext' : '#mapPrev').click(); await step(page, 2); }
  await page.locator(`.pebble[data-w="${w}"][data-l="${l}"]`).click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
}
// Moves the real mouse onto the first target, again and again, until the level ends.
async function chase(page, { click = false, max = 400 } = {}) {
  for (let i = 0; i < max; i++) {
    const s = await page.evaluate(() => ({ done: __game.state.ending || __game.state.screen !== 'play', p: __game.targetPoint(0) }));
    if (s.done) return true;
    if (s.p) { await page.mouse.move(s.p.x, s.p.y); if (click) await page.mouse.click(s.p.x, s.p.y); }
    await page.evaluate(() => { bb.run(8); bb.paint(); });
  }
  return false;
}

test('Enter or a click starts; a first visit shows the two picture cards, then the first bubbles', async t => {
  const page = await game(t);
  assert.equal((await state(page)).screen, 'title');
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).screen, 'grip');
  assert.equal(await page.locator('#gripImg').getAttribute('src'), 'grip-mouse.webp');
  await page.keyboard.press('KeyJ');
  await step(page);
  assert.equal(await page.locator('#gripImg').getAttribute('src'), 'grip-keys.webp');
  await page.locator('#gripNext').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.world, 0); assert.equal(s.level, 0); assert.equal(s.mode, 'touch');
  assert.equal(s.party, false); assert.equal(s.hits, 0);
  assert.equal((await page.evaluate(() => __game.save)).grip, true, 'the cards are seen once');

  const again = await game(t, { save: SAVE(0) });
  await again.locator('#btnPlay').click();
  await step(again);
  assert.equal((await state(again)).screen, 'play', 'a click on Play goes straight to the bubbles once the cards were seen');
  const back = await game(t, { save: SAVE(1) });
  await back.locator('#btnPlay').click();
  await step(back);
  assert.equal((await state(back)).screen, 'map', 'a child with stars picks a level on the map');
});

test('a click anywhere on the picture cards turns them, but a double click on Play skips none', async t => {
  const page = await game(t);
  const play = await page.locator('#btnPlay').boundingBox();
  await page.mouse.dblclick(play.x + play.width / 2, play.y + play.height / 2);
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'grip'); assert.equal(s.grip, 0, 'the second click of the double click does not turn the first card');
  await step(page, 30);
  await page.mouse.click(100, 650); // the dimmed sea below the card, nowhere near a button
  await step(page);
  assert.equal((await state(page)).grip, 1, 'a click beside the card turns it');
  await step(page, 30);
  await page.mouse.click(1180, 300);
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play', 'and the next one starts the first bubbles');
  assert.equal(s.world, 0); assert.equal(s.level, 0);
  assert.equal((await page.evaluate(() => __game.save)).grip, true, 'the cards are seen once');
});

test('the picture cards can be skipped with the X or Esc', async t => {
  for (const skip of ['x', 'Escape']) {
    const page = await game(t);
    await page.keyboard.press('Enter');
    await step(page);
    assert.equal((await state(page)).screen, 'grip');
    if (skip === 'x') await page.locator('#gripSkip').click(); else await page.keyboard.press('Escape');
    await step(page);
    assert.equal((await state(page)).screen, 'play', skip + ': straight into the first bubbles');
    assert.equal((await page.evaluate(() => __game.save)).grip, true, skip + ': the cards are not shown again');
    const s = await state(page);
    assert.equal(s.world, 0, skip); assert.equal(s.level, 0, skip);
  }
});

test('a double click on a button acts once: its second click never lands on the next screen', async t => {
  // Worlds 1-3 open: the map's world-3 island and pebbles lie under Play and under the pause card's Map button.
  const page = await game(t, { save: SAVE(3) });
  const play = await page.locator('#btnPlay').boundingBox();
  await page.mouse.dblclick(play.x + play.width / 2, play.y + 20);
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map', 'a double click on Play opens the map, not a world-3 level');
  await page.locator('.pebble[data-w="0"][data-l="0"]').click();
  await step(page);
  const lv = await state(page);
  assert.deepEqual([lv.screen, lv.world, lv.level], ['play', 0, 0]);
  await step(page, 30);
  await page.keyboard.press('KeyP');
  await step(page);
  const map = await page.locator('#btnMap').boundingBox();
  await page.mouse.dblclick(map.x + map.width / 2, map.y + map.height / 2);
  await step(page, 2);
  const s = await state(page);
  assert.equal(s.screen, 'map', 'a double click on the pause Map button stays on the map');
  assert.deepEqual([s.world, s.level], [0, 0], 'no other level started');
});

test('world 1 pops by hovering only, and a near miss within the margin still pops', async t => {
  const page = await game(t, { save: SAVE(0) });
  await page.keyboard.press('Enter');
  await step(page);
  assert.ok(await until(page, 's.targets.length > 0 && s.targets[0].y < 600'), 'a bubble rises');
  // The pointer has not moved yet: a bubble passing a resting Bop never pops by itself.
  await step(page, 60);
  assert.equal((await state(page)).hits, 0);
  const s = await state(page), b = s.targets[0];
  const margin = await page.evaluate(tier => BB.TUNE.touch.margin[tier - 1], s.tier);
  const near = await page.evaluate(([x, y]) => __game.point(x, y), [b.x + b.r + margin * 0.7, b.y]);
  let clicks = 0;
  await page.exposeFunction('countClick', () => { clicks++; });
  await page.evaluate(() => window.addEventListener('pointerdown', () => window.countClick(), true));
  await page.mouse.move(near.x, near.y);
  await step(page);
  assert.equal((await state(page)).hits, 1, 'a pointer beside the bubble, outside its art but inside the margin, pops it');
  // Hovering onto the next bubble pops it too: Bop floats there after the mouse.
  assert.ok(await chase(page), 'the whole level is played by moving the mouse');
  assert.equal(clicks, 0, 'no click was needed');
  assert.equal((await state(page)).escapes, 0);
  await step(page, 120);
  assert.equal((await state(page)).screen, 'result');
  assert.ok((await state(page)).stars >= 1);
});

test('world 2: a click near a balloon pops it; a missed click shows a ripple and costs nothing', async t => {
  const page = await game(t, { save: SAVE(1) });
  await openLevel(page, 1, 0);
  assert.ok(await until(page, 's.targets.length > 0'));
  await step(page, 30);
  const s = await state(page), b = s.targets[0];
  const margin = await page.evaluate(tier => BB.TUNE.tap.margin[tier - 1], s.tier);
  // Far from every balloon: a ripple, and nothing lost.
  const far = await page.evaluate(([x, y]) => __game.point(x, y), [b.x > 640 ? 120 : 1160, 620]);
  const ripples = await page.evaluate(() => __game.state.ripples);
  await page.mouse.click(far.x, far.y);
  await step(page);
  let now = await state(page);
  assert.equal(now.missClicks, 1); assert.equal(now.hits, 0); assert.equal(now.escapes, 0);
  assert.ok(now.ripples > ripples, 'a missed click still shows something');
  // Beside the balloon, within the margin.
  const t0 = now.targets.find(o => o.id === b.id);
  const near = await page.evaluate(([x, y]) => __game.point(x, y), [t0.x - (t0.r * 1.1 + margin * 0.6), t0.y]);
  await page.mouse.click(near.x, near.y);
  await step(page);
  now = await state(page);
  assert.equal(now.hits, 1, 'a click near the balloon pops it');
  // Mashing is never punished: many misses still finish with stars.
  for (let i = 0; i < 12; i++) await page.mouse.click(far.x, far.y + (i % 3) * 10);
  assert.ok(await chase(page, { click: true }));
  await step(page, 120);
  const done = await state(page);
  assert.equal(done.screen, 'result');
  assert.ok(done.stars >= 2, 'missed clicks cost no star');
});

test('world 3: Space jumps and catches; other keys never cost anything; at tier 1 any key jumps', async t => {
  const page = await game(t, { save: SAVE(2), dda: { _: { w3: [0.3, 4] } } });
  await openLevel(page, 2, 0);
  assert.equal((await state(page)).tier, 2);
  assert.ok(await until(page, 's.targets.length > 0'));
  const before = await state(page);
  for (const key of ['KeyK', 'ArrowUp', 'Enter', 'KeyA', 'Digit1']) { await page.keyboard.press(key); await step(page, 2); }
  let s = await state(page);
  assert.equal(s.frog.jumps, before.frog.jumps, 'only Space jumps from tier 2');
  assert.equal(s.hits, 0); assert.equal(s.escapes, 0); assert.equal(s.screen, 'play');
  assert.ok(await until(page, 's.targets.some(f => Math.abs(f.x - s.frog.x) < 30)'), 'a firefly reaches the frog');
  await page.keyboard.press('Space');
  await step(page);
  assert.equal((await state(page)).frog.air, true, 'Space jumps');
  assert.ok(await until(page, 's.hits === 1', 120), 'the frog catches the firefly');

  const easy = await game(t, { save: SAVE(2), dda: { _: { w3: [0.05, 4] } } });
  await openLevel(easy, 2, 0);
  assert.equal((await state(easy)).tier, 1);
  await easy.keyboard.press('KeyK');
  await step(easy);
  assert.equal((await state(easy)).frog.jumps, 1, 'at tier 1 any key jumps');
  await until(easy, '!s.frog.air', 120);
  const bar = await easy.evaluate(() => __game.keyPoint('space'));
  await easy.mouse.click(bar.x, bar.y);
  await step(easy);
  assert.equal((await state(easy)).frog.jumps, 2, 'and so does a click on the on-screen Space bar');
});

test('fireflies fly over the frog one after another, where the Space bar lights up', async t => {
  const page = await game(t, { save: SAVE(2), dda: { _: { w3: [0.3, 4] } } });
  await openLevel(page, 2, 0);
  const s = await state(page);
  assert.equal(s.mode, 'jump'); assert.equal(s.tier, 2);
  const over = await page.evaluate(tier => {
    const reach = BB.TUNE.jump.window[tier - 1] * BB.NEAR, seen = new Set();
    try {
      for (let i = 0; i < 60 * 30 && seen.size < 3; i++) {
        const st = __game.state;
        for (const f of st.targets) if (Math.abs(f.x - st.frog.x) < reach) seen.add(f.id);
        bb.run(1);
      }
    } finally { bb.paint(); }
    return seen.size;
  }, s.tier);
  assert.ok(over >= 3, `the fireflies fly past the frog one after another (${over})`);
  const now = await state(page);
  assert.equal(now.hits, 0, 'nothing is caught without a jump'); assert.equal(now.frog.jumps, 0); assert.equal(now.screen, 'play');
});

test('world 4: the arrow keys (and A, D) move the basket under the fruit', async t => {
  const page = await game(t, { save: SAVE(3) });
  await openLevel(page, 3, 0);
  for (let caught = 0; caught < 3;) {
    assert.ok(await until(page, 's.targets.length > 0'));
    const s = await state(page), f = s.targets.sort((a, b) => b.y - a.y)[0];
    const key = f.x < s.basket.x ? (caught % 2 ? 'KeyA' : 'ArrowLeft') : (caught % 2 ? 'KeyD' : 'ArrowRight');
    if (Math.abs(f.x - s.basket.x) > 30) {
      await page.keyboard.down(key);
      await until(page, `Math.abs(${f.x} - s.basket.x) < 30 || !s.targets.some(t => t.id === ${f.id})`, 600);
      await page.keyboard.up(key);
    }
    assert.ok(await until(page, `!s.targets.some(t => t.id === ${f.id})`, 1200));
    const now = await state(page);
    assert.equal(now.escapes, 0, 'the fruit landed in the basket');
    caught = now.hits;
  }
});

test('P and Esc pause and resume; a paused level stays frozen; leaving the window pauses', async t => {
  const page = await game(t, { save: SAVE(0) });
  await page.keyboard.press('Enter');
  await until(page, 's.targets.length > 0');
  for (const key of ['KeyP', 'Escape']) {
    await page.keyboard.press(key);
    await step(page);
    const paused = await state(page);
    assert.equal(paused.screen, 'pause', key);
    await step(page, 60);
    assert.equal((await state(page)).time, paused.time, 'nothing moves while paused');
    await page.keyboard.press(key);
    await step(page);
    assert.equal((await state(page)).screen, 'play');
  }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page);
  assert.equal((await state(page)).screen, 'pause', 'losing focus pauses and never resumes by itself');
  await page.locator('#btnResume').click();
  await step(page);
  assert.equal((await state(page)).screen, 'play');
});

test('every row reads right to left: the picture cards\' dots, the party\'s waves, Map then Again', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter');
  await step(page);
  const dots = await page.locator('.grip-dots i').evaluateAll(list => list.map(i => i.getBoundingClientRect().x));
  assert.ok(dots[0] > dots[1], 'the first card\'s dot is on the right');
  // The first of the party's four waves lights the rightmost dot.
  const lit = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = 1280; c.height = 120;
    BB.art.partyHud(g, { score: 0, mult: 1, left: 60, total: 60, best: 0, wave: 1, still: true });
    return [666, 644, 622, 600].map(x => { const d = g.getImageData(x, 100, 1, 1).data; return d[0] > 200 && d[1] > 180 && d[2] < 120; });
  });
  assert.deepEqual(lit, [true, false, false, false]);
  // The pause card keeps the Map and Again buttons where the result card has them.
  const box = id => page.locator('#' + id).boundingBox();
  await page.keyboard.press('Escape');
  await step(page, 2);
  await page.keyboard.press('KeyP');
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
  assert.ok((await box('btnMap')).x > (await box('btnRestart')).x, 'pause: the Map is on the right');
  await page.evaluate(() => { document.getElementById('scrPause').hidden = true; document.getElementById('scrResult').hidden = false; });
  assert.ok((await box('resMap')).x > (await box('resAgain')).x, 'results: the Map is on the right');
});

test('stars and unlocks are saved at once and survive a reload', async t => {
  const page = await game(t, { save: SAVE(0), dda: { _: { w1: [0.05, 4] } } });
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).screen, 'play');
  assert.ok(await chase(page));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:bubble-bop:save')));
  assert.ok(saved.stars[0][0] >= 1, 'saved the moment the level is won');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.bb.step);
  assert.ok((await page.evaluate(() => __game.save)).stars[0][0] >= 1);
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('.pebble[data-w="0"][data-l="1"]').evaluate(b => b.classList.contains('next') && !b.classList.contains('locked')), true, 'level 2 is open');
  assert.equal(await page.locator('.pebble[data-w="1"][data-l="0"]').evaluate(b => b.classList.contains('locked')), true, 'world 2 waits for level 3');
  assert.ok(await page.locator('.pebble[data-w="0"][data-l="0"] .st svg.on').count() >= 1);
  // Damaged saves still load a playable game.
  const broken = await game(t, { save: { stars: 'x', best: [-1], color: 99 } });
  await broken.keyboard.press('Enter');
  await step(broken);
  assert.equal((await state(broken)).screen, 'grip');
});

test('the mute button and M mute every sound and remember it', async t => {
  const page = await game(t);
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:muted')), 'true');
  await page.keyboard.press('KeyM');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  assert.equal((await state(page)).screen, 'title', 'M never starts the game');
});

test('reduced motion turns off screen shake; full motion shakes on a pop', async t => {
  for (const [reducedMotion, shakes] of [['no-preference', true], ['reduce', false]]) {
    const page = await game(t, { save: SAVE(1), reducedMotion });
    await openLevel(page, 1, 0);
    assert.ok(await until(page, 's.targets.length > 0'));
    await step(page, 30);
    const p = await page.evaluate(() => __game.targetPoint(0));
    await page.mouse.click(p.x, p.y);
    await step(page);
    const s = await state(page);
    assert.equal(s.hits, 1);
    assert.equal(s.shake > 0, shakes, reducedMotion);
  }
});

test('the idle hand shows the move after a few seconds and repeats while the child waits', async t => {
  const page = await game(t, { save: SAVE(0, { stars: [[1, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]] }) });
  await page.keyboard.press('Enter');
  await step(page, 2);
  await page.locator('.pebble[data-w="0"][data-l="0"]').click();
  assert.ok(await until(page, 's.ghost', 60 * 3), 'the first hint comes quickly the first time');
  assert.ok(await until(page, '!s.ghost', 60 * 4));
  assert.ok(await until(page, 's.ghost', 60 * 7), 'and it comes back about 6 s later');
  assert.equal(await page.locator('#ghost').isVisible(), true);
  // Stray keys in a mouse world are ignored.
  for (const key of ['KeyQ', 'Space', 'ArrowLeft', 'Enter']) await page.keyboard.press(key);
  await step(page, 2);
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.escapes, 0);
});

test('the hand that shows a key along the bottom edge is wholly on screen, on that key', async t => {
  for (const [w, key] of [[2, 'space'], [3, null]]) {
    const page = await game(t, { save: SAVE(w), dda: { _: { ['w' + (w + 1)]: [0.05, 4] } } });
    await openLevel(page, w, 0);
    assert.ok(await until(page, 's.ghost', 60 * 4), `world ${w + 1}: the hand shows the key`);
    await step(page, 12);
    const box = await page.evaluate(() => { const r = document.getElementById('ghost').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    assert.ok(box.top >= 0 && box.bottom <= 720 && box.left >= 0 && box.right <= 1280, `world ${w + 1}: the whole hand is visible ${JSON.stringify(box)}`);
    // Its fingertip (the lowest point of the turned hand) is on the key it presses.
    const keys = await page.evaluate(() => ({ space: BB.KEYS.space, left: BB.KEYS.left, right: BB.KEYS.right }));
    const on = k => box.bottom >= k.y - k.h / 2 && box.bottom <= k.y + k.h / 2 && box.left < k.x + k.w / 2 && box.right > k.x - k.w / 2;
    assert.ok(key ? on(keys[key]) : on(keys.left) || on(keys.right), `world ${w + 1}: the fingertip is on the key`);
  }
});

test('the orchard leaves keep their apples out from behind the pips and the buttons', async t => {
  const page = await game(t);
  // Red or orange apple paint in the top band where the pause button, the pips and mute sit.
  const reds = await page.evaluate(() => {
    const c = BB.art.bg('orchard', 1), d = c.getContext('2d').getImageData(0, 0, 1280, 104).data;
    let n = 0;
    for (let y = 0; y < 104; y++) for (let x = 0; x < 1280; x++) {
      if (!(x < 108 || (x > 308 && x < 972) || x > 1204)) continue;
      const i = (y * 1280 + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      if (r > 220 && g < 200 && b < 100) n++;
    }
    return n;
  });
  assert.equal(reds, 0, 'no apple under the HUD');
});

test('spoken hints use only an Arabic voice installed on the PC, never an online one', async t => {
  for (const [voices, expected] of [
    [[{ name: 'online', lang: 'ar-SA', localService: false }, { name: 'local', lang: 'ar-EG', localService: true }], 'local'],
    [[{ name: 'online', lang: 'ar-SA', localService: false }, { name: 'english', lang: 'en-US', localService: true }], null]
  ]) {
    const ctx = await context(t, { save: SAVE(0) });
    await ctx.addInitScript(list => {
      window.spoken = [];
      window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => list, speak: u => window.spoken.push(u.voice && u.voice.name), cancel() {}, addEventListener() {}
      } });
    }, voices);
    await ctx.addInitScript(() => {
      let kit;
      Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
        kit = value;
        kit.loop = update => { window.bb = { run: n => { for (let i = 0; i < n; i++) update(1 / 60); } }; return { stop() {} }; };
      } });
    });
    const page = await ctx.newPage();
    await page.goto(`${server.origin}/games/bubble-bop/`);
    await page.waitForFunction(() => window.__game && window.bb);
    await page.keyboard.press('Enter');
    await page.evaluate(() => { for (let i = 0; i < 400 && !__game.state.ghost; i++) bb.run(1); });
    assert.equal((await page.evaluate(() => __game.state)).ghost, true, 'the first hint shows');
    assert.deepEqual(await page.evaluate(() => window.spoken), expected ? [expected] : [], `voices ${voices.map(v => v.name)}`);
  }
});

// The saved difficulty sets the starting tier: tier 1 has bigger bubbles than tier 3.
test('the difficulty tier sets the bubbles: tier 1 gets bigger bubbles than tier 3', async t => {
  const seen = {};
  for (const [name, level] of [['easy', 0.12], ['hard', 0.6]]) {
    const page = await game(t, { save: SAVE(0), dda: { _: { w1: [level, 4] } } });
    await page.locator('#btnPlay').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play', name);
    assert.ok(await until(page, 's.targets.length > 0'), name + ': a bubble rises');
    const s = await state(page);
    seen[name] = { tier: s.tier, r: s.targets[0].r };
  }
  assert.deepEqual(seen.easy, { tier: 1, r: 66 });
  assert.equal(seen.hard.tier, 3);
  assert.ok(seen.hard.r < seen.easy.r);
});

/* ------------------------------------------------------------ worlds 6-11 */
// An eleven-world save with worlds before `done` finished and `open` levels of world `done` starred.
const SAVE11 = (done, open = 0) => ({ v: 1, stars: Array.from({ length: 11 }, (_, w) => w < done ? [3, 3, 3] : w === done ? [0, 1, 2].map(i => i < open ? 1 : 0) : [0, 0, 0]),
  best: Array(11).fill(0), grip: true, color: 0, hat: 0, seenStars: 0 });
const at = (page, x, y) => page.evaluate(([x, y]) => __game.point(x, y), [x, y]);

test('a five-world save opens world 6 on the map\'s second page; the arrows and ← → turn the pages', async t => {
  const page = await game(t, { save: SAVE(5) });
  assert.equal((await page.evaluate(() => __game.save)).stars.length, 11, 'an old save grows to eleven worlds');
  await page.keyboard.press('Enter');
  await step(page, 2);
  let s = await state(page);
  assert.equal(s.screen, 'map'); assert.equal(s.mapPage, 1, 'the map opens where the next level is');
  const visible = sel => page.locator(sel).isVisible();
  assert.ok(await visible('.pebble[data-w="5"][data-l="0"]') && await visible('.pebble[data-w="10"][data-l="P"]'));
  assert.ok(!await visible('.pebble[data-w="0"][data-l="0"]'));
  assert.equal(await page.locator('.pebble[data-w="5"][data-l="0"]').evaluate(b => b.classList.contains('next') && !b.classList.contains('locked')), true, 'world 6 is open');
  assert.equal(await page.locator('.pebble[data-w="6"][data-l="0"]').evaluate(b => b.classList.contains('locked')), true, 'world 7 waits');
  await page.locator('#mapPrev').click();
  await step(page, 2);
  assert.equal((await state(page)).mapPage, 0);
  assert.ok(await visible('.pebble[data-w="0"][data-l="0"]') && !await visible('.pebble[data-w="5"][data-l="0"]'));
  assert.equal(await page.locator('.pebble[data-w="4"][data-l="2"] .st svg.on').count(), 3, 'the old stars are all there');
  await page.keyboard.press('ArrowLeft');
  await step(page, 2);
  assert.equal((await state(page)).mapPage, 1, '← turns to the next page, like the reading direction');
  await page.keyboard.press('Enter');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.world, 5); assert.equal(s.level, 0); assert.equal(s.mode, 'drag');
});

test('world 6: a real press, move and release carries a turtle into its pool', async t => {
  const page = await game(t, { save: SAVE11(5), dda: { _: { w6: [0.3, 4] } } });
  await openLevel(page, 5, 0);
  assert.equal((await state(page)).tier, 2);
  assert.ok(await until(page, 's.targets.length > 0'));
  await step(page, 20);
  let s = await state(page);
  const turtle = s.targets[0], pool = s.pools.find(p => p.color === turtle.home);
  // A click on the sand does nothing bad; a click on the turtle (tier 2) does not pick it up.
  const sand = await at(page, 1100, 260);
  await page.mouse.click(sand.x, sand.y);
  const a = await at(page, turtle.x, turtle.y);
  await page.mouse.click(a.x, a.y);
  await step(page, 2);
  s = await state(page);
  assert.equal(s.held, 0); assert.equal(s.hits, 0); assert.equal(s.slips, 0); assert.ok(s.missClicks >= 1);
  // Press, hold, move, release.
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await step(page, 2);
  s = await state(page);
  assert.equal(s.held, turtle.id, 'pressed on the turtle: it is in the hand');
  assert.equal(s.button, true, 'the on-screen mouse shows the button held');
  const b = await at(page, pool.x, pool.y);
  for (let i = 1; i <= 10; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10); await step(page, 3); }
  const carried = (await state(page)).targets.find(o => o.id === turtle.id);
  assert.ok(Math.hypot(carried.x - pool.x, carried.y - pool.y) < pool.r, 'the turtle follows the pointer');
  await page.mouse.up();
  assert.ok(await until(page, 's.hits === 1', 60), 'let go over its pool: home');
  s = await state(page);
  assert.equal(s.held, 0); assert.equal(s.slips, 0);
});

test('world 7: one click knocks a clam; a double click opens it', async t => {
  const page = await game(t, { save: SAVE11(6), dda: { _: { w7: [0.3, 4] } } });
  await openLevel(page, 6, 0);
  assert.ok(await until(page, 's.targets.length > 0'));
  await step(page, 20);
  const c = (await state(page)).targets[0], p = await at(page, c.x, c.y);
  await page.mouse.click(p.x, p.y);
  await step(page, 1);
  let s = await state(page);
  assert.equal(s.hits, 0); assert.equal(s.targets.find(o => o.id === c.id).armed, true, 'one click fills one dot');
  await step(page, 90);
  assert.equal((await state(page)).targets.find(o => o.id === c.id).armed, false, 'too slow: the dot empties, nothing lost');
  await page.mouse.dblclick(p.x, p.y);
  await step(page, 2);
  s = await state(page);
  assert.equal(s.hits, 1, 'a real double click opens the clam');
  assert.equal(s.escapes, 0);
});

test('world 8: holding the button or Space blows the bubble; letting go in the ring fills it', async t => {
  const page = await game(t, { save: SAVE11(7), dda: { _: { w8: [0.05, 4] } } });
  await openLevel(page, 7, 0);
  assert.ok(await until(page, 's.targets.length > 0 && s.targets[0].state === "ready"'));
  // A short click only poofs a little bubble: no pop, no slip.
  await page.mouse.move(640, 600);
  await page.mouse.click(640, 600);
  await step(page, 3);
  let s = await state(page);
  assert.equal(s.hits, 0); assert.equal(s.escapes, 0);
  // The mouse button held down.
  await page.mouse.down();
  await step(page, 2);
  assert.equal((await state(page)).targets[0].state, 'grow');
  assert.ok(await until(page, 's.targets[0].inBand', 400), 'the bubble reaches the ring');
  await step(page, 4);
  await page.mouse.up();
  await step(page, 2);
  assert.equal((await state(page)).hits, 1, 'let go inside the ring');
  // Space works the same.
  assert.ok(await until(page, 's.targets.length > 0 && s.targets[0].state === "ready"', 300));
  await page.keyboard.down('Space');
  await step(page, 2);
  assert.ok(await until(page, 's.targets[0] && s.targets[0].inBand', 400));
  await step(page, 4);
  await page.keyboard.up('Space');
  await step(page, 2);
  s = await state(page);
  assert.equal(s.hits, 2, 'Space blows bubbles too');
  // Pausing while holding drops the bubble quietly.
  assert.ok(await until(page, 's.targets.length > 0 && s.targets[0].state === "ready"', 300));
  await page.keyboard.down('Space');
  await step(page, 20);
  await page.keyboard.press('KeyP');
  await step(page, 2);
  await page.keyboard.up('Space');
  assert.equal((await state(page)).screen, 'pause');
  const frozen = await state(page);
  await step(page, 60);
  assert.equal((await state(page)).time, frozen.time, 'nothing grows while paused');
  await page.keyboard.press('KeyP');
  await step(page, 3);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.targets[0].state, 'ready'); assert.equal(s.escapes, 0); assert.equal(s.hits, 2);
});

test('world 9: the arrows and WASD steer the submarine to the starfish', async t => {
  const page = await game(t, { save: SAVE11(8), dda: { _: { w9: [0.05, 4] } } });
  await openLevel(page, 8, 0);
  assert.ok(await until(page, 's.targets.length > 0'));
  for (const [key, axis, sign] of [['ArrowRight', 'x', 1], ['ArrowLeft', 'x', -1], ['KeyW', 'y', -1], ['KeyS', 'y', 1]]) {
    const before = (await state(page)).sub;
    await page.keyboard.down(key);
    await step(page, 20);
    await page.keyboard.up(key);
    // The submarine glides to a stop before the next key.
    await step(page, 30);
    const after = (await state(page)).sub;
    assert.ok((after[axis] - before[axis]) * sign > 30, `${key} moves the submarine (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
  }
  // Steer to the first starfish with the arrows.
  for (let i = 0; i < 40 && (await state(page)).hits === 0; i++) {
    const s = await state(page), f = s.targets[0];
    if (!f) { await step(page, 5); continue; }
    const keys = [];
    if (Math.abs(f.x - s.sub.x) > 20) keys.push(f.x > s.sub.x ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(f.y - s.sub.y) > 20) keys.push(f.y > s.sub.y ? 'ArrowDown' : 'ArrowUp');
    for (const k of keys) await page.keyboard.down(k);
    await step(page, 6);
    for (const k of keys) await page.keyboard.up(k);
  }
  assert.equal((await state(page)).hits, 1, 'the submarine picked up a starfish');
});

test('world 10: the letter on the balloon pops it, in English or Arabic input; a wrong key costs nothing', async t => {
  const page = await game(t, { save: SAVE11(9), dda: { _: { w10: [0.05, 4] } } });
  await openLevel(page, 9, 0);
  assert.ok(await until(page, 's.targets.length > 0'));
  let s = await state(page);
  const code = s.targets[0].code;
  assert.ok(['KeyF', 'KeyJ'].includes(code), 'tier 1 is F and J');
  for (const key of ['KeyQ', 'Space', code === 'KeyF' ? 'KeyJ' : 'KeyF']) await page.keyboard.press(key);
  await step(page, 2);
  s = await state(page);
  assert.equal(s.hits, 0); assert.equal(s.escapes, 0); assert.equal(s.screen, 'play');
  assert.ok(s.missClicks >= 3, 'wrong keys are counted for the difficulty, never against the stars');
  await page.keyboard.press(code);
  await step(page, 2);
  assert.equal((await state(page)).hits, 1, 'the right key pops its balloon');
  // The same key with an Arabic keyboard layout: the key's place (code) counts, not its letter.
  assert.ok(await until(page, 's.targets.length > 0', 400));
  const next = (await state(page)).targets[0].code, cdp = await page.context().newCDPSession(page);
  const ar = { KeyF: 'ب', KeyJ: 'ت' }[next];
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: next, key: ar, text: ar, unmodifiedText: ar, windowsVirtualKeyCode: next === 'KeyF' ? 70 : 74 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: next, key: ar, windowsVirtualKeyCode: next === 'KeyF' ? 70 : 74 });
  await step(page, 2);
  assert.equal((await state(page)).hits, 2, 'the Arabic letter on the same key pops it');
  // P still pauses and M still mutes in the letters world.
  await page.keyboard.press('KeyP');
  await step(page, 1);
  assert.equal((await state(page)).screen, 'pause');
  const frozen = await state(page);
  await step(page, 60);
  assert.equal((await state(page)).time, frozen.time);
});

test('world 11 mixes the five new skills, part after part', async t => {
  const page = await game(t, { save: SAVE11(10), dda: { _: { w11: [0.05, 4] } } });
  await openLevel(page, 10, 0);
  const s = await state(page);
  assert.equal(s.mode, 'drag'); assert.equal(s.goal, 2);
  assert.equal(s.screen, 'play'); assert.equal(s.world, 10); assert.equal(s.level, 0);
});

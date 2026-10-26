// Bubble Bop in real Chromium: real mouse and keyboard input, saves, pause, mute,
// reduced motion, and the statistics and telemetry a portal receives.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
// A portal stand-in: it embeds the game, records what the game posts, and sends preferences.
const PARENT = `<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{position:absolute;left:0;top:0;width:1280px;height:720px;border:0}</style>
<iframe id="f" src="/games/bubble-bop/"></iframe>
<script>window.msgs = []; addEventListener('message', e => { if (e.source === f.contentWindow) msgs.push(e.data); });
function prefs(p) { f.contentWindow.postMessage(Object.assign({ type: 'sg:preferences' }, p), location.origin); }</script>`;
let browser, server;
before(async () => { server = await startTestServer(root, { pages: { '/bb-parent': PARENT } }); browser = await launchChromium(); });
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
// The game with its frame loop stepped by hand, and its Kit.stats calls recorded.
async function game(t, options = {}) {
  const ctx = await context(t, options);
  await ctx.addInitScript(() => {
    let kit;
    const bb = window.bb = { stats: [] };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        bb.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        // Simulation only, then one paint: long stretches of play where nothing is checked on screen.
        bb.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        bb.paint = () => render(0);
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { bb.stats.push([name, ...args]); return call.apply(this, args); };
      }
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
  const calls = await page.evaluate(() => bb.stats);
  assert.deepEqual(calls.filter(c => c[0] === 'tutorial').map(c => c[1]), ['start', 'done']);
  assert.deepEqual(calls.find(c => c[0] === 'round'), ['round', 'w1L1']);
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
  assert.deepEqual((await page.evaluate(() => bb.stats)).filter(c => c[0] === 'tutorial').map(c => c[1]), ['start', 'done']);
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
  // Far from every balloon: a ripple, a miss for statistics, and nothing lost.
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

// Embedded like in the portal: rounds, ends and telemetry reach the parent.
async function embedded(t, prefs, options) {
  const ctx = await context(t, options);
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/bb-parent`);
  const frame = page.frames().find(f => f.url().includes('/games/bubble-bop/'));
  await frame.waitForFunction(() => window.__game && window.Kit);
  await page.waitForFunction(() => window.msgs.some(m => m && m.type === 'sg:ready'));
  await page.evaluate(p => prefs(p), prefs);
  return { page, frame };
}
const fstate = frame => frame.evaluate(() => __game.state);

test('the age band sets the starting tier: a 6-year-old gets bigger, slower bubbles than a 10-year-old', async t => {
  const seen = {};
  for (const band of ['6-7', '10-11']) {
    const { page, frame } = await embedded(t, { band, player: '', telemetry: false }, { save: SAVE(0) });
    await page.mouse.click(640, 545); // the Play button
    await frame.waitForFunction(() => __game.state.screen === 'play' && __game.state.targets.length > 0);
    const s = await fstate(frame);
    seen[band] = { tier: s.tier, r: s.targets[0].r };
  }
  assert.deepEqual(seen['6-7'], { tier: 1, r: 66 });
  assert.equal(seen['10-11'].tier, 3);
  assert.ok(seen['10-11'].r < seen['6-7'].r);
});

test('statistics and telemetry reach a stub portal with valid round ids, hits and misses', async t => {
  const { page, frame } = await embedded(t, { band: '6-7', player: '', telemetry: true }, { save: SAVE(1) });
  // Win world 1 level 1 by moving the mouse.
  await page.mouse.click(640, 545);
  await frame.waitForFunction(() => __game.state.screen === 'map');
  await frame.locator('.pebble[data-w="0"][data-l="0"]').click();
  await frame.waitForFunction(() => __game.state.screen === 'play');
  for (let i = 0; i < 300 && (await fstate(frame)).screen === 'play' && !(await fstate(frame)).ending; i++) {
    const p = await frame.evaluate(() => __game.targetPoint(0));
    if (p) await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(60);
  }
  await frame.waitForFunction(() => __game.state.screen === 'result', null, { timeout: 10000 });
  // World 2: one miss and one hit, then back to the map from the pause. (The result
  // ignores clicks for its first 0.6 s, so a child mashing the mouse sees the stars.)
  await page.waitForTimeout(900);
  await frame.locator('#resMap').click();
  await frame.waitForFunction(() => __game.state.screen === 'map');
  await frame.locator('.pebble[data-w="1"][data-l="0"]').click();
  await frame.waitForFunction(() => __game.state.targets.length > 0);
  await page.waitForTimeout(400);
  // A click far from every balloon: the corner farthest from them.
  const miss = await frame.evaluate(() => {
    const spots = [[90, 640], [1190, 640], [640, 690], [90, 160], [1190, 160]], ts = __game.state.targets;
    const room = ([x, y]) => Math.min(...ts.map(t => Math.hypot(t.x - x, t.y - y)));
    return spots.sort((a, b) => room(b) - room(a))[0];
  });
  await page.mouse.click(miss[0], miss[1]);
  await frame.waitForFunction(() => __game.state.missClicks >= 1, null, { timeout: 10000 });
  for (let i = 0; i < 20 && !(await fstate(frame)).hits; i++) {
    const p = await frame.evaluate(() => __game.targetPoint(0));
    if (p) await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
  }
  assert.ok((await fstate(frame)).hits >= 1);
  await page.keyboard.press('KeyP');
  await frame.locator('#btnMap').click();
  await page.waitForFunction(() => msgs.some(m => m.type === 'sg:telemetry' && m.ev.some(e => e[0] === 're' && e[2] === 'w2L1')));
  const msgs = await page.evaluate(() => window.msgs);
  const events = msgs.filter(m => m.type === 'sg:stats').flatMap(m => m.r);
  const starts = events.filter(e => e[0] === 's').map(e => e[1]);
  assert.deepEqual(starts, ['w1L1', 'w2L1']);
  for (const id of starts) { assert.match(id, ID); assert.doesNotMatch(id, /\d{3}/); }
  const win = events.find(e => e[0] === 'w');
  assert.equal(win[1], 'w1L1'); assert.ok(win[3] >= 1 && win[3] <= 3, 'a win carries its stars');
  assert.ok(events.some(e => e[0] === 'q' && e[1] === 'w2L1'), 'leaving a level is a quit');
  const tm = msgs.filter(m => m.type === 'sg:telemetry').flatMap(m => m.ev);
  const rs = tm.filter(e => e[0] === 'rs');
  assert.deepEqual(rs.map(e => [e[1], e[2]]), [['w1L1', 1], ['w2L1', 1]], 'round starts carry the tier');
  const won = tm.find(e => e[0] === 're' && e[2] === 'w1L1'), quit = tm.find(e => e[0] === 're' && e[2] === 'w2L1');
  assert.equal(won[1], 'w'); assert.ok(won[6] >= 8, 'hits for every popped bubble'); assert.equal(won[7], 0);
  assert.equal(quit[1], 'q'); assert.ok(quit[6] >= 1, 'a hit'); assert.ok(quit[7] >= 1, 'a missed click');
  assert.ok(quit[8].reduce((a, b) => a + b, 0) >= 1, 'a reaction time to a balloon');
});

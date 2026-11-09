// Chaos Island in real Chromium: real keyboard and mouse input, the disaster card, pause,
// a whole match won by following the coach's keys, the result card, two players, saves,
// the wardrobe, and layouts that fit every window size.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
const NAMES = ['فيضان الجيلي', 'نيازك المارشملو', 'الريح', 'الأرض الجليدية', 'الزلزال', 'غيوم البرق', 'كرات الشاطئ', 'الإعصار الصغير'];
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

const SAVE = (extra = {}) => ({ v: 2, coins: 0, stars: [0, 0, 0, 0], best: [0, 0, 0, 0], duo: 0, owned: ['c0', 'h0', 'x0'], color: 'c0', hat: 'h0', extra: 'x0', island: 0, tut: true, ...extra });
// A guest's difficulty level: 0.05 is tier 1 (three rounds), 0.95 is tier 5.
const DDA = level => ({ _: { match: [level, 4], duo: [level, 4] } });

// Every test: no page errors, no console errors, nothing fetched from anywhere else.
async function game(t, { save, dda = DDA(0.05), raw, viewport = { width: 1280, height: 720 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  // Seeded once per tab, so a reload keeps what the game saved.
  await ctx.addInitScript(({ save, dda, raw }) => {
    if (location.protocol !== 'http:' || sessionStorage.getItem('ci-seeded')) return;
    sessionStorage.setItem('ci-seeded', '1');
    if (save !== undefined) localStorage.setItem('sg:chaos-island:save', JSON.stringify(save));
    if (raw !== undefined) localStorage.setItem('sg:chaos-island:save', raw);
    if (dda) localStorage.setItem('sg:chaos-island:dda', JSON.stringify(dda));
  }, { save, dda, raw });
  // The frame loop is stepped by hand; Kit.stats and Kit.track calls are recorded.
  await ctx.addInitScript(() => {
    let kit;
    const ci = window.ci = { stats: [], track: [] };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        ci.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        ci.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        ci.paint = () => render(0);
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { ci.stats.push([name, ...args]); return call.apply(this, args); };
      }
      for (const name of ['cue', 'hit', 'miss']) {
        const call = kit.track[name];
        kit.track[name] = function (...args) { ci.track.push(name); return call.apply(this, args); };
      }
    } });
  });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/chaos-island/`);
  await page.waitForFunction(() => window.__game && window.ci.step);
  await page.evaluate(() => ci.step(2));
  return page;
}
const g = (page, expr) => page.evaluate(expr);
const step = (page, n = 1) => page.evaluate(n => ci.step(n), n);
const run = (page, n = 1) => page.evaluate(n => { ci.run(n); ci.paint(); }, n);
const calls = (page, name) => page.evaluate(name => ci.stats.filter(c => c[0] === name).map(c => c.slice(1)), name);
// Runs the game until a condition holds (or the frame budget runs out).
async function until(page, cond, max = 60 * 400) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('g', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 6) { if (ok(__game)) return true; ci.run(6); }
      return ok(__game);
    } finally { ci.paint(); }
  }, { cond, max });
}
// Plays the child's islander with the real arrow keys, holding exactly the keys the
// coach lights up (the coach plans like the computer islanders, without their mistakes).
async function autoplay(page, max = 60 * 400) {
  const held = new Set(), map = { l: 'ArrowLeft', r: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
  for (let f = 0; f < max; f += 2) {
    const s = await page.evaluate(() => ({ mode: __game.mode, inp: __game.coach.inp }));
    if (s.mode !== 'play') break;
    const want = new Set(Object.keys(map).filter(k => s.inp && s.inp[k]).map(k => map[k]));
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    await page.evaluate(() => ci.run(2));
  }
  for (const k of held) await page.keyboard.up(k);
  await page.evaluate(() => ci.paint());
}
const me = page => page.evaluate(() => { const a = __game.player; return { x: a.x, y: a.y, vy: a.vy, ground: a.ground && a.ground.id, hearts: a.hearts, coins: a.coins, ghost: a.ghost }; });

test('the title shows the island with its islanders at play, and reports and saves nothing', async t => {
  const page = await game(t);
  assert.equal(await g(page, () => __game.mode), 'title');
  const before = await g(page, () => __game.demo.actors.map(a => [a.x, a.y]));
  await step(page, 400);
  const after = await g(page, () => __game.demo.actors.map(a => [a.x, a.y]));
  assert.notDeepEqual(after, before, 'the islanders on the title move about');
  assert.deepEqual(await g(page, () => ci.stats), [], 'no round, no end, no tutorial from the title');
  assert.deepEqual(await g(page, () => Object.keys(localStorage).filter(k => k.startsWith('sg:chaos-island:') && k !== 'sg:chaos-island:dda')), []);
  // One big Play button, two side buttons and the four islands: nothing else to click.
  assert.deepEqual(await g(page, () => [...document.querySelectorAll('#scrTitle button')].map(b => b.id || b.className)), ['btnPlay', 'btnWardrobe', 'btnDuo', 'isle on', 'isle locked', 'isle locked', 'isle locked']);
});

test('Enter starts a match: the tier is read first, then the round; the card names the disaster and counts 3, 2, 1', async t => {
  const page = await game(t, { save: SAVE() });
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal(await g(page, () => __game.mode), 'play');
  assert.deepEqual(await calls(page, 'round'), [['i1']]);
  const w = await g(page, () => ({ rounds: __game.world.rounds, bots: __game.world.actors.length - 1, tier: __game.world.tier, first: __game.world.plan.rounds[0].a }));
  assert.deepEqual(w, { rounds: 3, bots: 3, tier: 1, first: w.first }, 'tier 1: three rounds and three computer islanders');
  assert.ok(['flood', 'meteors'].includes(w.first), 'the very first disaster is a gentle one');
  const card = await g(page, () => __game.card);
  assert.equal(card.shown, true);
  assert.ok(NAMES.includes(card.name), card.name);
  const counts = [];
  for (let i = 0; i < 240 && (await g(page, () => __game.world.phase)) === 'card'; i++) {
    const c = await g(page, () => __game.card.count);
    if (c && counts[counts.length - 1] !== c) counts.push(c);
    await run(page, 3);
  }
  assert.deepEqual(counts, ['3', '2', '1']);
  assert.equal(await g(page, () => __game.world.phase), 'live');
  await step(page, 30);
  assert.equal(await g(page, () => __game.card.shown), false, 'the card gets out of the way');
});

test('the arrow keys and A/D walk, Space and Up jump, Down drops through a platform', async t => {
  const page = await game(t, { save: SAVE() });
  await page.locator('#btnPlay').click();
  await step(page);
  // During the card nothing falls yet: a calm moment to try the keys.
  const x0 = (await me(page)).x;
  await page.keyboard.down('ArrowRight'); await step(page, 20); await page.keyboard.up('ArrowRight');
  const x1 = (await me(page)).x;
  assert.ok(x1 > x0 + 40, `→ walks right (${x0} → ${x1})`);
  await page.keyboard.down('KeyA'); await step(page, 20); await page.keyboard.up('KeyA');
  assert.ok((await me(page)).x < x1 - 40, 'A walks left');
  await step(page, 20);
  for (const key of ['Space', 'ArrowUp', 'KeyW']) {
    await page.keyboard.down(key); await step(page, 6);
    const up = await me(page);
    assert.ok(up.y < 590 && up.vy < 0, `${key} jumps`);
    await page.keyboard.up(key); await step(page, 50);
    assert.equal((await me(page)).ground, 'ground');
  }
  // Up onto the crate by the house, then Down through it.
  const crate = await g(page, () => { const p = __game.world.plats.find(q => q.id === 'crate'); return p.x + p.w / 2; });
  for (let i = 0; i < 80; i++) {
    const p = await me(page);
    if (Math.abs(p.x - crate) < 8) break;
    const key = p.x < crate ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key); await step(page, 1); await page.keyboard.up(key);
  }
  await page.keyboard.down('ArrowUp'); await step(page, 4); await page.keyboard.up('ArrowUp'); await step(page, 40);
  assert.equal((await me(page)).ground, 'crate', 'a hop lands on the crate');
  await page.keyboard.down('ArrowDown'); await step(page, 3); await page.keyboard.up('ArrowDown'); await step(page, 30);
  assert.equal((await me(page)).ground, 'ground', 'Down drops through it');
});

test('P and Esc pause and resume; nothing moves or redraws while paused; leaving the window pauses for good', async t => {
  const page = await game(t, { save: SAVE() });
  await page.keyboard.press('Enter');
  await step(page);
  await until(page, "g.world.phase === 'live'");
  await page.evaluate(() => {
    window.draws = 0;
    const ctx = document.getElementById('game').getContext('2d'), draw = ctx.drawImage;
    ctx.drawImage = function (img) { if (img && img.width >= 1280 * 0.5) window.draws++; return draw.apply(this, arguments); };
  });
  for (const key of ['KeyP', 'Escape']) {
    await page.keyboard.press(key);
    await step(page);
    assert.equal(await g(page, () => __game.mode), 'pause', key);
    const frozen = await g(page, () => [__game.world.frames, __game.world.t, JSON.stringify(__game.world.actors.map(a => [a.x, a.y])), window.draws]);
    await step(page, 90);
    assert.deepEqual(await g(page, () => [__game.world.frames, __game.world.t, JSON.stringify(__game.world.actors.map(a => [a.x, a.y])), window.draws]), frozen, 'frozen, and the paused frame is kept');
    await page.keyboard.press(key);
    await step(page);
    assert.equal(await g(page, () => __game.mode), 'play');
  }
  // A resize while paused redraws once.
  await page.keyboard.press('KeyP'); await step(page);
  const d0 = await g(page, () => window.draws);
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await step(page, 5);
  assert.equal(await g(page, () => window.draws) - d0, 1, 'one redraw for the new size');
  await page.keyboard.press('KeyP'); await step(page);
  // Losing focus pauses; getting it back does not resume.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await step(page, 30);
  assert.equal(await g(page, () => __game.mode), 'pause', 'it waits for the child');
  await clickControl(page, '#btnResume');
  await step(page);
  assert.equal(await g(page, () => __game.mode), 'play');
});

test('following the coach\'s keys wins the youngest tier: stars, a new island, coins, a reload keeps them', async t => {
  const page = await game(t, { save: SAVE() });
  await page.keyboard.press('Enter');
  await step(page);
  await autoplay(page);
  await until(page, "g.mode === 'result'", 300);
  assert.equal(await g(page, () => __game.mode), 'result');
  const res = await g(page, () => __game.result), saved = await g(page, () => __game.save);
  assert.ok(res.stars >= 2, 'survived the rounds: ' + JSON.stringify(res));
  assert.deepEqual(await calls(page, 'end'), [['win', res.coins]], 'a win, with the coins collected as the score');
  assert.ok(res.coins >= 6, 'two coins per round survived at least');
  assert.equal(saved.stars[0], res.stars);
  assert.equal(saved.coins, res.coins);
  assert.equal(res.newIsle, 1, 'the snow island opens');
  const dda = await g(page, () => JSON.parse(localStorage.getItem('sg:chaos-island:dda'))._.match);
  assert.equal(dda[1], 5, 'one difficulty result for the match');
  const track = await g(page, () => ci.track);
  assert.ok(track.includes('cue') && track.includes('hit'), 'warnings cue, dodges and survived rounds hit');
  // The result card: the stars pop in, Play again is the big ringed button.
  await step(page, 90);
  assert.equal(await g(page, () => document.querySelectorAll('#resStars svg.on').length), res.stars);
  assert.equal(await g(page, () => !document.getElementById('resNext').hidden), true, 'Next island is offered');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ci.step);
  await step(page, 2);
  const tiles = await g(page, () => [...document.querySelectorAll('.isle')].map(b => [b.classList.contains('locked'), b.querySelectorAll('.st svg.on').length]));
  assert.deepEqual(tiles, [[false, res.stars], [false, 0], [true, 0], [true, 0]]);
  assert.equal(await g(page, () => document.querySelector('#titleCoins b').textContent), String(res.coins));
});

test('doing nothing loses, and Play again (Enter) starts a fresh match at once', async t => {
  const page = await game(t, { save: SAVE() });
  await page.keyboard.press('Enter');
  await step(page);
  await until(page, "g.mode === 'result'", 60 * 140);
  assert.equal(await g(page, () => __game.mode), 'result');
  assert.equal((await g(page, () => __game.result)).stars, 0);
  const end = (await calls(page, 'end'))[0];
  assert.equal(end[0], 'lose');
  assert.ok(Number.isInteger(end[1]) && end[1] >= 0);
  assert.ok((await g(page, () => ci.track)).includes('miss'), 'every bonk is a miss');
  await step(page, 50);
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal(await g(page, () => __game.mode), 'play');
  assert.deepEqual(await calls(page, 'round'), [['i1'], ['i1']]);
  assert.equal(await g(page, () => __game.matches), 2);
});

test('Restart from the pause starts the match over; Menu leaves it as a quit', async t => {
  const page = await game(t, { save: SAVE() });
  await page.keyboard.press('Enter');
  await step(page);
  await until(page, 'g.world.round === 1');
  await clickControl(page, '#btnPause');
  await step(page);
  await clickControl(page, '#btnRestart');
  await step(page);
  assert.deepEqual(await g(page, () => [__game.mode, __game.matches, __game.world.round, __game.world.phase]), ['play', 2, 0, 'card']);
  assert.deepEqual(await calls(page, 'round'), [['i1'], ['i1']]);
  await page.keyboard.press('Escape');
  await step(page);
  await clickControl(page, '#btnMenu');
  await step(page);
  assert.equal(await g(page, () => __game.mode), 'title');
  assert.deepEqual(await calls(page, 'end'), [['quit']]);
});

test('two players share the keyboard: W A S D and the arrows, both on the island, reported only as end', async t => {
  const page = await game(t, { save: SAVE() });
  await clickControl(page, '#btnDuo');
  await step(page);
  assert.deepEqual(await calls(page, 'round'), [['duo']]);
  const pos = () => g(page, () => __game.players.map(a => ({ x: a.x, y: a.y })));
  const p0 = await pos();
  assert.equal(p0.length, 2);
  assert.ok(p0[0].x < p0[1].x, 'player 1 starts on the left');
  await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft');
  await step(page, 18);
  await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
  const p1 = await pos();
  assert.ok(p1[0].x > p0[0].x + 30, 'D walks player 1 right');
  assert.ok(p1[1].x < p0[1].x - 30, '← walks player 2 left');
  await page.keyboard.down('KeyW'); await step(page, 6);
  const p2 = await pos();
  assert.ok(p2[0].y < 590 && p2[1].y === 600, 'W jumps player 1 only');
  await page.keyboard.up('KeyW'); await step(page, 40);
  await page.keyboard.down('ArrowUp'); await step(page, 6);
  const p3 = await pos();
  assert.ok(p3[1].y < 590 && p3[0].y === 600, '↑ jumps player 2 only');
  await page.keyboard.up('ArrowUp');
  await until(page, "g.mode === 'result'", 60 * 140);
  const ends = await calls(page, 'end'), coins = await g(page, () => __game.players.reduce((s, a) => s + a.coins, 0));
  assert.deepEqual(ends, [['end', coins]], 'a two-player match only ends, with both players\' coins');
  assert.equal(await g(page, () => document.querySelectorAll('#resSheet .who').length), 2, 'both players on the card');
  assert.equal(await g(page, () => document.getElementById('resStars').hidden), true);
});

test('the first match shows the coach and reports the tutorial', async t => {
  const page = await game(t, { save: SAVE({ tut: false }) });
  await page.keyboard.press('Enter');
  await step(page);
  assert.deepEqual(await calls(page, 'tutorial'), [['start']]);
  await page.keyboard.down('ArrowRight'); await step(page, 10); await page.keyboard.up('ArrowRight');
  assert.equal((await g(page, () => __game.coach)).on, true, 'the coach stays on through the first round');
  await autoplay(page, 60 * 40);
  await until(page, 'g.world.round === 1 || g.mode !== "play"', 60 * 10);
  assert.deepEqual(await calls(page, 'tutorial'), [['start'], ['done']]);
  assert.equal(await g(page, () => __game.save.tut), true);
  // Later on the coach waits until the child stops pressing keys.
  await page.keyboard.down('ArrowRight'); await step(page, 10); await page.keyboard.up('ArrowRight');
  await step(page, 2);
  assert.equal((await g(page, () => __game.coach)).on, false);
  await step(page, 60 * 3);
  if (await g(page, () => __game.world.phase === 'live' || __game.world.phase === 'card')) assert.equal((await g(page, () => __game.coach)).on, true, 'and lights the keys after a few idle seconds');
});

test('the wardrobe sells for coins, puts the item on, and keeps it; dear items stay in the shop', async t => {
  const page = await game(t, { save: SAVE({ coins: 30 }) });
  await clickControl(page, '#btnWardrobe');
  await step(page);
  assert.equal(await g(page, () => __game.mode), 'wardrobe');
  const tile = n => clickControl(page, `#shelfHat .item:nth-child(${n + 1})`);
  await tile(2); // the cap, 25 coins
  await step(page);
  let s = await g(page, () => __game.save);
  assert.equal(s.coins, 5); assert.equal(s.hat, 'h2'); assert.ok(s.owned.includes('h2'));
  await tile(5); // the crown, 90 coins: too dear
  await step(page);
  s = await g(page, () => __game.save);
  assert.equal(s.coins, 5); assert.equal(s.hat, 'h2'); assert.ok(!s.owned.includes('h5'));
  await tile(0); // no hat: free, already owned
  await step(page);
  assert.equal((await g(page, () => __game.save)).hat, 'h0');
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal(await g(page, () => __game.mode), 'title');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ci.step);
  s = await g(page, () => __game.save);
  assert.deepEqual([s.coins, s.hat, s.owned.includes('h2')], [5, 'h0', true]);
});

test('a save that cannot be written shows the warning and Retry; old and broken saves start fresh', async t => {
  const page = await game(t, { save: SAVE({ coins: 40 }) });
  await page.evaluate(() => {
    window.realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith('sg:chaos-island:save')) throw new DOMException('full', 'QuotaExceededError');
      return window.realSet.call(this, key, value);
    };
  });
  await clickControl(page, '#btnWardrobe');
  await step(page);
  await clickControl(page, '#shelfColor .item:nth-child(2)');
  await step(page);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.realSet; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  assert.equal(JSON.parse(await g(page, () => localStorage.getItem('sg:chaos-island:save'))).color, 'c1');

  for (const raw of ['{"v":1,"coins":40,"hats":["cap"],"islands":["beach","candy"]}', 'not json', '{"v":2,"coins":"lots","stars":"all"}']) {
    const fresh = await game(t, { raw });
    const s = await g(fresh, () => __game.save);
    assert.deepEqual([s.v, s.coins, s.stars], [2, 0, [0, 0, 0, 0]], raw);
    await fresh.keyboard.press('Enter');
    await step(fresh);
    assert.equal(await g(fresh, () => __game.mode), 'play', 'and plays');
  }
});

const VIEWPORTS = [[1024, 576], [1100, 620], [1280, 720], [1366, 768], [1920, 1080], [1280, 600]];
async function sweep(page, selectors, label) {
  const failures = [];
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); ci.step(1); });
    const report = await page.evaluate(({ selectors, width, height }) => selectors.map(sel => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return { sel, missing: true };
      const b = el.getBoundingClientRect(), inside = b.top >= -0.5 && b.left >= -0.5 && b.bottom <= height + 0.5 && b.right <= width + 0.5 && b.width > 8 && b.height > 8;
      let exposed = true;
      if (el.tagName === 'BUTTON') { const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); exposed = !!hit && (hit === el || el.contains(hit)); }
      return { sel, inside, exposed, b: [b.left, b.top, b.right, b.bottom].map(Math.round) };
    }), { selectors, width, height });
    for (const r of report) {
      const tag = `${label} ${width}x${height} ${r.sel}`;
      if (r.missing) failures.push(tag + ' missing');
      else if (!r.inside) failures.push(tag + ' clips ' + r.b);
      else if (!r.exposed) failures.push(tag + ' covered');
    }
  }
  assert.deepEqual(failures, []);
}

test('the end card, the pause card, the title and the wardrobe fit every window; the HUD keeps clear of the mute button', async t => {
  const page = await game(t, { save: SAVE({ stars: [1, 0, 0, 0], coins: 99 }) });
  await sweep(page, ['.logo', '#btnPlay', '#btnWardrobe', '#btnDuo', '.isle:nth-child(1)', '.isle:nth-child(4)', '#titleCoins'], 'title');
  await clickControl(page, '#btnWardrobe');
  await sweep(page, ['.ward-panel', '#wardBack', '#shelfExtra .item:last-child', '#shelfColor .item:first-child'], 'wardrobe');
  await clickControl(page, '#wardBack');
  await clickControl(page, '#btnDuo');
  await step(page, 50);
  await sweep(page, ['#card', '#cardCount', '#btnPause'], 'card');
  // The pause button and both players' hearts and coins never meet the mute button.
  const overlaps = [];
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    const r = await page.evaluate(() => {
      window.dispatchEvent(new Event('resize')); ci.step(1);
      const box = el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
      return { mute: box(document.querySelector('.sg-mute')), pause: box(document.getElementById('btnPause')), p1: __game.hudBox(0), p2: __game.hudBox(1) };
    });
    const meet = (a, b) => a.left < b.right + 6 && a.right > b.left - 6 && a.top < b.bottom + 6 && a.bottom > b.top - 6;
    for (const k of ['pause', 'p1', 'p2']) if (meet(r[k], r.mute)) overlaps.push(`${width}x${height} ${k} ${JSON.stringify(r[k])} mute ${JSON.stringify(r.mute)}`);
  }
  assert.deepEqual(overlaps, []);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press('KeyP');
  await step(page);
  await sweep(page, ['.pause-card', '#btnResume', '#btnRestart', '#btnMenu'], 'pause');
  await page.keyboard.press('KeyP');
  await until(page, "g.mode === 'result'", 60 * 140);
  await step(page, 60);
  await sweep(page, ['.card.result', '#resTitle', '#resSheet', '#resAgain', '#resMenu'], 'result');
  // Play again is the biggest button on the card.
  const sizes = await page.evaluate(() => ['resAgain', 'resMenu'].map(id => document.getElementById(id).getBoundingClientRect().width));
  assert.ok(sizes[0] > sizes[1]);
});

test('round ids are valid and a quit or a new match never leaves a round open twice', async t => {
  const page = await game(t, { save: SAVE({ stars: [3, 3, 3, 0], island: 3 }) });
  assert.equal(await g(page, () => __game.island), 3);
  await page.keyboard.press('Enter');
  await step(page);
  await page.keyboard.press('KeyP'); await step(page);
  await clickControl(page, '#btnMenu'); await step(page);
  await page.keyboard.press('ArrowRight'); await step(page);
  assert.equal(await g(page, () => __game.island), 2, '→ picks the island to the right (the one before)');
  await page.keyboard.press('Enter'); await step(page);
  const rounds = (await calls(page, 'round')).map(c => c[0]);
  assert.deepEqual(rounds, ['i4', 'i3']);
  for (const id of rounds) assert.match(id, ID);
});

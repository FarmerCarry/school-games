// Dino 3D in real Chromium: real keyboard and mouse input, the journey and endless
// rounds, pause and lifecycle, saves and failed saves, the wardrobe and the map, the
// course code, difficulty and the statistics and telemetry a portal receives.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
// A stand-in portal: the game in an iframe, the preferences it is sent, and every
// message it posts back (window.got).
const EMBED = '/embed/dino-3d.html';
const HOST = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>host</title></head><body style="margin:0">
<iframe id="game" src="/games/dino-3d/" style="width:1100px;height:620px;border:0"></iframe>
<script>
window.got = [];
addEventListener('message', function (e) { if (e.source === document.getElementById('game').contentWindow) got.push(e.data); });
window.prefs = function (p) { document.getElementById('game').contentWindow.postMessage(Object.assign({ type: 'sg:preferences' }, p), location.origin); };
</script></body></html>`;
let browser, server;
before(async () => { server = await startTestServer(root, { pages: { [EMBED]: HOST } }); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

const SAVE = (extra = {}) => ({ v: 2, stars: Array(15).fill(0), best: Array(15).fill(0), bank: 0, far: 0, color: 0, hat: 0, seen: 0, coach: true, ...extra });
const starsUpTo = n => Array.from({ length: 15 }, (_, i) => i < n ? 3 : 0);

// The page with its frame loop stepped by hand (probe.step: updates and one paint;
// probe.run: updates only), Kit.stats and Kit.ready recorded, and storage that can fail.
// It never moves obstacles or the dino: input goes through the real keyboard and mouse.
async function game(t, { save, dda, deniedStorage = false, embed = null, viewport = { width: 1100, height: 620 } } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  context.on('request', request => { if (!request.url().startsWith(server.origin)) errors.push('External request: ' + request.url()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no errors or external requests'); });
  await context.addInitScript(({ save, dda, deniedStorage }) => {
    if (!/\/games\/dino-3d\//.test(location.pathname)) return;
    if (!sessionStorage.getItem('dino-seeded')) {
      sessionStorage.setItem('dino-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:dino-3d:save', JSON.stringify(save));
      if (dda) localStorage.setItem('sg:dino-3d:dda', JSON.stringify(dda));
    }
    let kit, update, render;
    const probe = window.dinoProbe = { stats: [], ready: 0, failSave: false, writes: 0 };
    probe.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
    probe.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
    // Updates until a condition holds (or the budget runs out), then one paint.
    probe.until = (cond, max = 6000) => {
      const ok = new Function('g', 'return (' + cond + ');');
      try { for (let i = 0; i < max; i++) { if (ok(window.Dino3DGame)) return true; update(1 / 60); } return ok(window.Dino3DGame); } finally { render(0); }
    };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { probe.stats.push([name, ...args]); return call.apply(this, args); };
      }
      const ready = kit.ready;
      kit.ready = (...args) => { probe.ready++; return ready.apply(kit, args); };
    } });
    const write = Storage.prototype.setItem, read = Storage.prototype.getItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:dino-3d:save') probe.writes++;
      if (deniedStorage || (probe.failSave && key === 'sg:dino-3d:save')) throw new DOMException('Storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    Storage.prototype.getItem = function () {
      if (deniedStorage) throw new DOMException('Storage fixture', 'SecurityError');
      return read.apply(this, arguments);
    };
  }, { save, dda, deniedStorage });
  if (embed) {
    await page.goto(server.origin + EMBED);
    const frame = page.frames().find(f => f.url().includes('/games/dino-3d/'));
    await frame.waitForFunction(() => !!window.Dino3DGame && window.dinoProbe.ready === 1, null, { polling: 50 });
    await prefs(frame, embed);
    return frame;
  }
  await page.goto(`${server.origin}/games/dino-3d/`);
  await page.waitForFunction(() => !!window.Dino3DGame && window.dinoProbe.ready === 1, null, { polling: 50 });
  return page;
}
async function prefs(frame, p) {
  await frame.evaluate(() => {
    window.prefsSeen = new Promise(resolve => addEventListener('message', function seen(e) {
      if (e.data && e.data.type === 'sg:preferences') { removeEventListener('message', seen); resolve(); }
    }));
  });
  await frame.page().evaluate(p => window.prefs(p), p);
  await frame.evaluate(() => window.prefsSeen);
}
const state = page => page.evaluate(() => Dino3DGame.state);
const mode = page => page.evaluate(() => Dino3DGame.mode);
const step = (page, n = 1) => page.evaluate(n => dinoProbe.step(n), n);
const run = (page, n = 1) => page.evaluate(n => dinoProbe.run(n), n);
const until = (page, cond, max) => page.evaluate(([c, m]) => dinoProbe.until(c, m), [cond, max]);
const stats = page => page.evaluate(() => dinoProbe.stats);
const visible = (page, sel) => page.locator(sel).isVisible();
// keyboard.down resolves when the browser takes the key, which can be before the page
// runs its listeners; wait until this page has seen it (after Kit's own listener).
async function key(page, code, how = 'press') {
  for (const type of how === 'press' ? ['keydown', 'keyup'] : [how === 'down' ? 'keydown' : 'keyup']) {
    await page.evaluate(([code, type]) => {
      window.keySeen = new Promise(resolve => addEventListener(type, function seen(e) { if (e.code === code) { removeEventListener(type, seen); resolve(); } }));
    }, [code, type]);
    const keyboard = page.keyboard || page.page().keyboard;
    await (type === 'keydown' ? keyboard.down(code) : keyboard.up(code));
    await page.evaluate(() => window.keySeen);
  }
}
async function focusGame(page) { await page.evaluate(() => { document.activeElement?.blur(); document.getElementById('scene').focus(); Kit.keys.reset(); }); }
async function clickPlay(page) { await page.locator('#play').click(); await step(page); }

// A careful child: looks ahead with copies of the world and presses Space (or holds ↓)
// with the real keyboard when an obstacle comes, as long as needed.
const BOT = () => {
  const D = window.Dino3D, DT = 1 / 60;
  const PLANS = [{ jump: 0.05 }, { jump: 0.12 }, { jump: 0.2 }, { jump: 0.3 }, { jump: 0.45 }, { duck: 0.4 }, { duck: 0.7 }, { duck: 1 }];
  const inp = (p, t) => p ? { jump: !!p.jump && t < p.jump, duck: !!p.duck && t < p.duck } : {};
  const len = p => p ? Math.max(p.jump || 0, p.duck || 0) : 0;
  function sim(w, p, H, done) {
    const c = D.clone(w);
    for (let t = 0; t < H; t += DT) {
      D.step(c, DT, inp(p, t));
      for (const e of c.ev) if (e.t === 'bump' || e.t === 'splash') return { hit: e, t, c };
      c.ev.length = 0;
      if (c.done || (done && done(c, t))) return { hit: null, t, c };
    }
    return { hit: null, t: H, c };
  }
  function end(w, e) {
    const o = w.obs.find(o => o.id === e.id);
    if (o) return o.x + o.w;
    for (const g of w.obs) if (g.kind === 'gap') for (const s of g.goo) if (w.x >= s[0] - 0.6 && w.x <= s[1] + 0.6) return s[1];
    return w.x + 3;
  }
  const clears = (w, p, x) => { const r = sim(w, p, 2.2, (c, t) => t >= len(p) && c.p.ground && c.x > x + 0.35); return r.hit ? null : r.c; };
  function decide(w) {
    const r = sim(w, null, 1.2);
    if (!r.hit || r.t > 0.5) return null;
    const x = end(r.c, r.hit);
    for (const p of PLANS) if (clears(w, p, x)) return p;
    return null;
  }
  window.dinoBot = {
    // Steps until the dino should act (or the round is over).
    next(max = 3000) {
      for (let i = 0; i < max; i++) {
        if (Dino3DGame.mode !== 'playing') return { mode: Dino3DGame.mode };
        const p = decide(Dino3DGame.world);
        if (p) return { mode: 'playing', key: p.jump ? 'Space' : 'ArrowDown', frames: Math.max(2, Math.round(len(p) * 60)) };
        dinoProbe.run(1);
      }
      return { mode: Dino3DGame.mode };
    }
  };
};
async function playWithBot(page, maxMoves = 400) {
  await page.evaluate(BOT);
  for (let i = 0; i < maxMoves; i++) {
    const next = await page.evaluate(() => dinoBot.next());
    if (next.mode !== 'playing') return next.mode;
    await key(page, next.key, 'down');
    await run(page, next.frames);
    await key(page, next.key, 'up');
    await run(page, 1);
  }
  return mode(page);
}

test('the title is not a round; Play starts level 1-1 with its coach, and real keys and clicks move the dino', async t => {
  const page = await game(t);
  await step(page, 3);
  assert.equal(await mode(page), 'title');
  assert.ok(await visible(page, '#title') && await visible(page, '#play'));
  assert.equal(await visible(page, '#pause-button'), false);
  assert.deepEqual(await stats(page), [], 'the title is not a round');
  // A click on the empty title makes the dino hop; it starts nothing.
  await page.mouse.click(40, 400);
  await step(page, 2);
  assert.equal(await mode(page), 'title');
  await focusGame(page);
  await key(page, 'Enter');
  await step(page);
  let s = await state(page);
  assert.equal(s.mode, 'playing'); assert.equal(s.id, 'b1L1'); assert.equal(s.level, 0);
  assert.deepEqual((await stats(page)).map(c => c.slice(0, 2)), [['round', 'b1L1'], ['tutorial', 'start']]);
  assert.ok(await visible(page, '#intro'), 'a first-time child sees the keys');
  assert.ok(await visible(page, '#pause-button'));
  assert.equal(s.player.y, 0);
  const jumps = await page.evaluate(() => Dino3DGame.inputJumps);
  await key(page, 'Space');
  await step(page, 6);
  s = await state(page);
  assert.ok(s.player.y > 0.3, 'Space jumps: ' + s.player.y);
  assert.equal(await page.evaluate(() => Dino3DGame.inputJumps), jumps + 1);
  await run(page, 60);
  // A click on the game jumps too.
  await page.mouse.click(700, 400);
  await step(page, 6);
  assert.ok((await state(page)).player.y > 0.3, 'a click jumps');
  assert.equal(await page.evaluate(() => Dino3DGame.inputJumps), jumps + 2);
  await run(page, 60);
  await key(page, 'ArrowDown', 'down');
  await step(page, 2);
  assert.equal((await state(page)).player.duck, true, '↓ ducks');
  await key(page, 'ArrowDown', 'up');
  await step(page, 2);
  assert.equal((await state(page)).player.duck, false);
  for (const c of (await stats(page)).filter(c => c[0] === 'round')) assert.match(c[1], ID);
});

test('P and Esc pause and resume; a pause freezes the world; focus loss pauses and coming back does not resume', async t => {
  const page = await game(t, { save: SAVE() });
  await clickPlay(page);
  await run(page, 90);
  await key(page, 'KeyP');
  await step(page);
  assert.equal(await mode(page), 'paused');
  assert.ok(await visible(page, '#pause-screen'));
  const frozen = JSON.stringify(await state(page));
  await run(page, 200); await step(page);
  assert.equal(JSON.stringify(await state(page)), frozen, 'nothing moves while paused');
  await key(page, 'Space');
  await run(page, 1);
  assert.equal(await mode(page), 'playing', 'Space resumes');
  await run(page, 20);
  await key(page, 'Escape');
  await run(page, 1);
  assert.equal(await mode(page), 'paused', 'Esc pauses');
  await key(page, 'Escape');
  await run(page, 1);
  assert.equal(await mode(page), 'playing');
  await run(page, 30);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await run(page, 1);
  assert.equal(await mode(page), 'paused', 'losing focus pauses');
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await run(page, 30);
  assert.equal(await mode(page), 'paused', 'coming back does not resume by itself');
  await page.locator('#resume').click();
  await step(page);
  assert.equal(await mode(page), 'playing');
  // R in the pause restarts the level as a new round.
  await key(page, 'KeyP'); await run(page, 1);
  await key(page, 'KeyR'); await step(page);
  const s = await state(page);
  assert.equal(s.mode, 'playing'); assert.ok(s.distance < 1);
  assert.deepEqual((await stats(page)).filter(c => c[0] === 'round').map(c => c[1]), ['b1L1', 'b1L1']);
});

test('an idle dino bumps obstacles, tumbles, runs out of hearts and gets a result; R plays again at once', async t => {
  const page = await game(t, { save: SAVE() });
  await clickPlay(page);
  assert.ok(await until(page, `g.state.bumps >= 1`, 3000), 'the first obstacle is bumped');
  let s = await state(page);
  assert.ok(s.hearts < 6 && s.mode === 'playing', 'a bump costs hearts and play goes on');
  assert.ok(await until(page, `g.mode === 'ending'`, 6000), 'out of hearts');
  assert.ok((await state(page)).over);
  // A jump pressed during the tumble does not skip the result.
  await key(page, 'Space');
  await run(page, 2);
  assert.equal(await mode(page), 'ending');
  assert.ok(await until(page, `g.mode === 'result'`, 400));
  assert.ok(await visible(page, '#result'));
  assert.equal(await visible(page, '#next'), false, 'level 1-2 is not open yet');
  assert.equal((await state(page)).stars, 0);
  const ends = (await stats(page)).filter(c => c[0] === 'end');
  assert.equal(ends.length, 1); assert.equal(ends[0][1], 'lose'); assert.equal(ends[0][2], s.eggs >= 0 ? (await state(page)).eggs : 0);
  await key(page, 'KeyR');
  await run(page, 1);
  assert.equal(await mode(page), 'result', 'R waits a moment so a late jump cannot skip the result');
  await run(page, 40);
  await key(page, 'KeyR');
  await step(page);
  s = await state(page);
  assert.equal(s.mode, 'playing'); assert.equal(s.id, 'b1L1'); assert.equal(s.hearts, 6); assert.equal(s.score, 0);
  assert.deepEqual((await stats(page)).filter(c => c[0] === 'round').map(c => c[1]), ['b1L1', 'b1L1']);
});

test('a careful child finishes level 1-1: the family, stars, eggs, the save survives a reload and Next opens 1-2', async t => {
  const page = await game(t, { save: SAVE({ coach: false }), dda: { _: { main: [0.05, 4] } } });
  await clickPlay(page);
  assert.equal((await state(page)).tier, 1);
  assert.equal(await playWithBot(page), 'ending');
  let s = await state(page);
  assert.ok(s.done && !s.over && s.bumps === 0, JSON.stringify(s));
  assert.ok(await until(page, `g.mode === 'result'`, 400));
  await run(page, 200); await step(page);
  s = await state(page);
  assert.ok(s.stars >= 2, 'stars: ' + s.stars);
  assert.equal(await page.locator('#res-stars svg.on').count(), s.stars, 'the stars pop in');
  assert.equal(await page.locator('#res-n').textContent(), String(s.eggs), 'the eggs count up');
  const calls = await stats(page);
  assert.deepEqual(calls.filter(c => c[0] === 'end'), [['end', 'win', s.eggs]]);
  assert.deepEqual(calls.filter(c => c[0] === 'tutorial').map(c => c[1]), ['start', 'done']);
  const saved = await page.evaluate(() => Dino3DGame.save);
  assert.equal(saved.stars[0], s.stars); assert.equal(saved.best[0], s.eggs); assert.equal(saved.bank, s.eggs); assert.equal(saved.coach, true);
  assert.ok(await visible(page, '#next'));
  await page.locator('#next').click();
  await step(page);
  s = await state(page);
  assert.equal(s.mode, 'playing'); assert.equal(s.id, 'b1L2');
  await page.reload();
  await page.waitForFunction(() => !!window.Dino3DGame && window.dinoProbe.ready === 1, null, { polling: 50 });
  await step(page);
  assert.equal(await page.locator('#title-stars').textContent(), String(saved.stars[0]), 'the stars are still there');
  await clickPlay(page);
  assert.equal(await mode(page), 'map', 'with a star, Play shows the map');
  assert.equal(await page.locator('.pebble[data-level="1"]').getAttribute('class'), 'pebble next');
  assert.match(await page.locator('.pebble[data-level="2"]').getAttribute('class'), /locked/);
});

test('the map opens unlocked levels only; a locked one stays shut', async t => {
  const page = await game(t, { save: SAVE({ stars: starsUpTo(4) }) });
  await clickPlay(page);
  assert.equal(await mode(page), 'map');
  await page.locator('.pebble[data-level="7"]').click();
  await step(page);
  assert.equal(await mode(page), 'map', 'a locked level does not start');
  await page.locator('.biome.b3 .art').click();
  await step(page);
  assert.equal(await mode(page), 'map', 'a locked biome does not start');
  await page.locator('.pebble[data-level="4"]').click();
  await step(page);
  const s = await state(page);
  assert.equal(s.mode, 'playing'); assert.equal(s.id, 'b2L2');
  await page.locator('#pause-button').click(); await step(page);
  await page.locator('#pause-menu').click(); await step(page);
  assert.equal(await mode(page), 'map');
  assert.deepEqual((await stats(page)).filter(c => c[0] === 'end').map(c => c[1]), ['quit'], 'leaving from the pause is a quit');
  await key(page, 'Escape'); await step(page);
  assert.equal(await mode(page), 'title');
});

test('the wardrobe: eggs unlock colours and hats; a locked tile stays locked; the choice is saved', async t => {
  const page = await game(t, { save: SAVE({ bank: 40 }) });
  await page.locator('#btn-wardrobe').click();
  await step(page);
  assert.equal(await mode(page), 'wardrobe');
  assert.equal(await page.locator('#bank').textContent(), '40');
  const tiles = page.locator('#colors .tile');
  await tiles.nth(3).click(); await step(page);
  assert.equal((await page.evaluate(() => Dino3DGame.save)).color, 0, 'a colour that needs 90 eggs stays locked');
  await tiles.nth(1).click(); await step(page);
  await page.locator('#hats .tile').nth(2).click(); await step(page);
  const saved = await page.evaluate(() => Dino3DGame.save);
  assert.equal(saved.color, 1); assert.equal(saved.hat, 2);
  assert.equal(saved.seen, 40, 'the new things were seen');
  assert.equal(await tiles.nth(1).getAttribute('aria-pressed'), 'true');
  await page.locator('#wardrobe-back').click(); await step(page);
  assert.equal(await mode(page), 'title');
});

test('a failed save keeps the old progress, shows the warning, and Retry saves', async t => {
  const page = await game(t, { save: SAVE({ bank: 40 }) });
  await page.evaluate(() => { dinoProbe.failSave = true; });
  await page.locator('#btn-wardrobe').click(); await step(page);
  assert.ok(await page.locator('.sg-save-status').isVisible(), 'the warning shows');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('sg:dino-3d:save'))).seen, 0, 'the old save is kept');
  await page.evaluate(() => { dinoProbe.failSave = false; });
  await page.locator('.sg-save-status button').click();
  await step(page);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('sg:dino-3d:save'))).seen, 40);
  assert.equal(await page.locator('.sg-save-status').getAttribute('data-state'), 'saved');
});

test('with storage blocked the game still plays', async t => {
  const page = await game(t, { deniedStorage: true });
  await clickPlay(page);
  assert.equal(await mode(page), 'playing');
  await key(page, 'Space'); await step(page, 4);
  assert.ok((await state(page)).player.y > 0);
});

test('endless: a course code is the same course for everyone, at tier 3, and never moves the difficulty', async t => {
  const page = await game(t, { save: SAVE({ far: 120 }), dda: { _: { main: [0.9, 6], endless: [0.05, 3] } } });
  await page.locator('#btn-endless').click(); await step(page);
  assert.equal(await mode(page), 'endless');
  assert.equal(await page.locator('#far-best').textContent(), '120');
  assert.equal(await visible(page, '#code-row'), false, 'the code is tucked away');
  await page.locator('#code-btn').click(); await step(page);
  await page.locator('#code-input').fill('42');
  await page.keyboard.press('Enter');
  await step(page);
  assert.ok(await visible(page, '#code-error'), 'four digits are needed');
  assert.equal(await mode(page), 'endless');
  await page.locator('#code-input').fill('٠٠٤٢');
  await page.locator('#code-input').dispatchEvent('input');
  assert.equal(await page.locator('#code-input').inputValue(), '0042', 'Arabic digits are read');
  await page.locator('#code-go').click(); await step(page);
  let s = await state(page);
  assert.equal(s.mode, 'playing'); assert.equal(s.endless, true); assert.equal(s.code, '0042'); assert.equal(s.tier, 3);
  assert.ok(await visible(page, '#code-tag'));
  const layout = () => page.evaluate(() => Dino3DGame.world.obs.slice(0, 8).map(o => [o.kind, Math.round((o.slot || o.x) * 100)]));
  const first = await layout();
  assert.ok(await until(page, `g.mode !== 'playing'`, 8000));
  assert.ok(await until(page, `g.mode === 'result'`, 400));
  s = await state(page);
  assert.ok(await visible(page, '#res-far'));
  assert.deepEqual((await stats(page)).filter(c => c[0] === 'end'), [['end', 'end', Math.floor(s.distance)]]);
  const dda = JSON.parse(await page.evaluate(() => localStorage.getItem('sg:dino-3d:dda')));
  assert.deepEqual(dda._.endless, [0.05, 3], 'a code run does not move the difficulty');
  await run(page, 40);
  await key(page, 'KeyR'); await step(page);
  assert.equal((await state(page)).code, '0042', 'again plays the same course');
  assert.deepEqual(await layout(), first);
  // Without a code: the child's own tier.
  await key(page, 'KeyP'); await run(page, 1);
  await page.locator('#pause-menu').click(); await step(page);
  await page.locator('#btn-endless').click(); await step(page);
  await key(page, 'Enter'); await step(page);
  s = await state(page);
  assert.equal(s.endless, true); assert.equal(s.code, ''); assert.equal(s.tier, 1);
  assert.deepEqual((await stats(page)).filter(c => c[0] === 'round').map(c => c[1]), ['endless', 'endless', 'endless']);
});

test('difficulty: the age band seeds the tier, results move it, and cues, hits and misses reach telemetry', async t => {
  const frame = await game(t, { embed: { band: '6-7', telemetry: true } }), page = frame.page();
  await frame.locator('#play').click();
  await step(frame);
  assert.equal((await state(frame)).tier, 1, 'a 6-7 guest starts at tier 1');
  // A few obstacles cleared with the real keyboard, then the menu.
  await frame.evaluate(BOT);
  for (let i = 0; i < 4; i++) {
    const next = await frame.evaluate(() => dinoBot.next());
    await key(frame, next.key, 'down'); await run(frame, next.frames); await key(frame, next.key, 'up');
  }
  await run(frame, 80);
  assert.ok((await frame.evaluate(() => Dino3DGame.world.cleared)) >= 3);
  await key(frame, 'KeyP'); await run(frame, 1);
  await frame.locator('#pause-menu').click(); await step(frame);
  // Then an idle try that runs out of hearts: the next try is easier.
  await frame.locator('.pebble[data-level="0"]').click(); await step(frame);
  assert.ok(await until(frame, `g.mode === 'result'`, 8000));
  const dda = JSON.parse(await frame.evaluate(() => localStorage.getItem('sg:dino-3d:dda')));
  assert.equal(dda['_6-7'].main[1], 1, 'one result, the quit is not one');
  assert.ok(dda['_6-7'].main[0] < 0.12, 'a failed try eases off: ' + dda['_6-7'].main[0]);
  await page.waitForFunction(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev).filter(e => e[0] === 're').length >= 2, null, { polling: 50 });
  const ev = await page.evaluate(() => got.filter(m => m && m.type === 'sg:telemetry').flatMap(m => m.ev));
  const ends = ev.filter(e => e[0] === 're');
  assert.deepEqual(ev.filter(e => e[0] === 'rs').map(e => e.slice(1)), [['b1L1', 1], ['b1L1', 1]]);
  // [re, code, id, ms, score, tier, hits, misses, reaction times]
  assert.equal(ends[0][1], 'q');
  assert.ok(ends[0][6] >= 3 && ends[0][7] === 0, `cleared obstacles are hits: ${ends[0]}`);
  assert.ok(ends[0][8].reduce((a, b) => a + b, 0) >= 3, 'presses after a cue are reaction times');
  assert.equal(ends[1][1], 'l'); assert.equal(ends[1][5], 1);
  assert.ok(ends[1][7] >= 3 && ends[1][6] === 0, `bumps are misses: ${ends[1]}`);
});

test('the controls stay inside the frame at classroom and full-screen sizes', async t => {
  for (const viewport of [{ width: 1100, height: 620 }, { width: 1920, height: 1080 }, { width: 900, height: 700 }]) {
    const page = await game(t, { viewport, save: SAVE({ stars: starsUpTo(3) }) });
    const inside = async sel => {
      const b = await page.locator(sel).boundingBox();
      return b && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1;
    };
    for (const sel of ['#play', '#btn-endless', '#btn-wardrobe', '.stars-chip >> nth=0']) assert.ok(await inside(sel), `${sel} at ${viewport.width}x${viewport.height}`);
    await clickPlay(page);
    for (const sel of ['.pebble[data-level="0"]', '.pebble[data-level="14"]', '#map-home']) assert.ok(await inside(sel), `${sel} at ${viewport.width}x${viewport.height}`);
    await page.locator('.pebble[data-level="1"]').click(); await step(page);
    for (const sel of ['#pause-button', '#hearts', '#roar', '#trip']) assert.ok(await inside(sel), `${sel} at ${viewport.width}x${viewport.height}`);
  }
});

test('without WebGL the game shows a message and never reports ready', async t => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind) { return /webgl/.test(kind) ? null : getContext.apply(this, arguments); };
    let kit;
    window.failureProbe = { ready: 0, failed: 0 };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      const ready = kit.ready, fail = kit.fail;
      kit.ready = (...args) => { failureProbe.ready++; return ready.apply(kit, args); };
      kit.fail = (...args) => { failureProbe.failed++; return fail.apply(kit, args); };
    } });
  });
  await page.goto(`${server.origin}/games/dino-3d/`);
  await page.locator('#error-screen').waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => failureProbe), { ready: 0, failed: 1 });
  assert.equal(await page.locator('#title').isVisible(), false);
  assert.deepEqual(errors, [], 'the startup failure is handled');
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const require = createRequire(import.meta.url);
const Sim = require(path.join(repo, 'games/candy-rope/sim.js'));
const LEVELS = require(path.join(repo, 'games/candy-rope/levels.js'));
const SOL = require(path.join(repo, 'games/candy-rope/solutions.js'));
let browser, server, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

// Steps the game by hand: each step renders once and advances one 1/60 s update.
async function game(t) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = () => ({ stop() {} });
    } });
    window.step = (n = 1, until) => {
      for (let i = 0; i < n; i++) { if (until && until()) return i; __game.bench(1); }
      return n;
    };
  });
  await page.goto(`${origin}/games/candy-rope/`);
  await page.evaluate(() => __game.resetSave());
  return page;
}

// In the page: a short swipe across the middle of rope `key`, like a player's cut.
const CUT = `window.cut = key => {
  const r = __game.world().ropes.find(r => r.key === key && r.alive), m = Math.floor(r.pts.length / 2);
  const a = r.pts[m - 1], b = r.pts[m + 1], d = Math.hypot(b.x - a.x, b.y - a.y), nx = (a.y - b.y) / d * 20, ny = (b.x - a.x) / d * 20;
  __game.swipe(r.pts[m].x - nx, r.pts[m].y - ny, r.pts[m].x + nx, r.pts[m].y + ny);
};`;

// Node replay of a player who makes the first move `late` frames after the plan, then does every
// "when" cue exactly on time (all steps of a "cut both" together), as the game plans them.
function followCues(i, late) {
  const plan = SOL[i], w = Sim.create(LEVELS[i], { visual: false }), moves = [];
  const search = (from) => {
    const d = Sim.planRest(plan, moves);
    if (!d.rest.length || w.state !== 'play') return null;
    const job = Sim.shiftSearch(w, d.rest, d.late, from);
    while (!job.work());
    return job.shift === null ? null : { rest: d.rest, f: d.rest[0][0] + job.shift };
  };
  const doStep = (a) => { if (Sim.act(w, a.slice(1))) moves.push([w.frame, a[1], a[2]]); };
  let cue = null, cues = 0;
  while (w.state === 'play' && w.frame < 1500) {
    if (!moves.length && w.frame === plan[0][0] + late) {
      plan.filter(a => a[0] - plan[0][0] <= 3).forEach(doStep);
      cue = search(w.frame + 8);
    } else if (cue && w.frame === cue.f) {
      cues++;
      cue.rest.filter(a => a[0] - cue.rest[0][0] <= 3).forEach(doStep);
      cue = search(w.frame + 8);
    }
    Sim.step(w); w.events.length = 0;
  }
  return { state: w.state, stars: w.starsGot, cues };
}

// Cuts both ropes of level 5 so the candy lands on the spikes, then waits for the fail panel.
async function loseLevel5(page) {
  await page.evaluate(() => {
    __game.start(4); step(40);
    __game.swipe(467, 180, 820, 180);
    step(400, () => __game.info().panel);
  });
  assert.deepEqual(await page.evaluate(() => [__game.info().state, __game.info().panel]), ['lost', true]);
}

test('every recorded hint plan wins with three stars, and doing nothing never wins', () => {
  LEVELS.forEach((level, i) => {
    const r = Sim.run(level, SOL[i]);
    assert.deepEqual([r.state, r.stars], ['won', 3], `level ${i + 1}`);
    assert.notEqual(Sim.run(level, []).state, 'won', `level ${i + 1} idle`);
  });
});

test('level 10 ring misses the resting candy but catches the bubble after a quick double cut', () => {
  const level = LEVELS[9], rest = Sim.create(level, { visual: false });
  for (let f = 0; f < 600; f++) { Sim.step(rest); rest.events.length = 0; }
  assert.equal(rest.rings[0].used, false);
  for (let gap = 0; gap <= 3; gap++) {
    const plan = [[30, 'cut', 'p1'], [30 + gap, 'cut', 'p0']], w = Sim.create(level, { visual: false }), seen = [];
    let k = 0;
    while (w.frame < 700 && w.state === 'play' && !seen.includes('attach')) {
      while (k < plan.length && plan[k][0] <= w.frame) Sim.act(w, plan[k++].slice(1));
      Sim.step(w);
      w.events.forEach(e => seen.push(e.type)); w.events.length = 0;
    }
    assert.ok(seen.indexOf('bubble') >= 0 && seen.indexOf('bubble') < seen.indexOf('attach'), `gap ${gap}: ${seen.join(' ')}`);
  }
});

test('after a late or early first move, following the timing cues never leads into a loss', () => {
  // the levels the review found broken: a late first cut made every later "now!" early
  for (const n of [3, 4, 5, 7, 24, 26, 30]) for (const late of [-8, 10, 20]) {
    const r = followCues(n - 1, late);
    assert.equal(r.state, 'won', `level ${n}, first move ${late} frames off`);
    assert.ok(r.cues >= 1, `level ${n}: a cue was shown`);
  }
  // every multi-step level: a cue may be missing when the first move already lost, but a shown
  // cue, followed exactly, always wins
  LEVELS.forEach((level, i) => {
    if (SOL[i].length < 2) return;
    for (const late of [-5, 12]) {
      const r = followCues(i, late);
      if (r.cues) assert.equal(r.state, 'won', `level ${i + 1}, first move ${late} frames off`);
    }
  });
});

test('the timing ring moves with a late first cut on level 3, and cutting on it wins with three stars', async t => {
  const page = await game(t);
  const r = await page.evaluate(CUT + `;(() => {
    __game.start(2, { hint: true });
    step(120, () => __game.info().cue != null);
    const first = __game.info().cue, firstAt = __game.world().frame;
    step(300, () => __game.world().frame >= 20);
    cut('p0');                                   // the plan cuts p0 at frame 10: 10 frames late
    step(30, () => __game.info().cue != null);
    const next = __game.info().cue;
    step(300, () => __game.world().frame >= next);
    cut('p1');
    step(600, () => __game.info().state !== 'play');
    return { first, firstAt, next, info: __game.info() };
  })()`);
  assert.equal(r.firstAt, 0, 'the first ring is planned during the frozen start (no title with the hint)');
  assert.equal(r.first, SOL[2][0][0]);
  assert.equal(r.next, SOL[2][1][0] + 10, 'the second ring moves by the same 10 frames');
  assert.deepEqual([r.info.state, r.info.world.stars], ['won', 3]);
});

test('a "cut both" step in the demo is one swipe through both ropes', async t => {
  const page = await game(t);
  const strokes = await page.evaluate(() => [7, 9].map(i => {
    __game.start(i, { replay: __game.solution(i), demo: true });
    step(120, () => __game.world().frame >= 13);
    return __game.info().strokes;
  }));
  assert.deepEqual(strokes, [1, 1]);
});

test('a paused level draws its frozen scene once, then only after a resize, and resumes', async t => {
  const page = await game(t);
  const key = code => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const r = await page.evaluate(`(() => {
    const key = ${key};
    __game.start(0); step(60);
    let draws = 0;
    const real = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () { if (this.canvas.id === 'cv') draws++; return real.apply(this, arguments); };
    key('KeyP');
    const frame = __game.world().frame;
    step(1); const once = draws;
    step(10); const idle = draws - once;
    window.dispatchEvent(new Event('resize'));
    step(3); const resized = draws - once - idle;
    const paused = [__game.info().state, __game.world().frame];
    key('KeyP'); step(5);
    return { frame, once, idle, resized, paused, after: [__game.info().state, __game.world().frame], resumedDraws: draws - once - idle - resized };
  })()`);
  assert.ok(r.once > 0, 'the paused scene is drawn once');
  assert.equal(r.idle, 0, 'then nothing is redrawn while paused');
  assert.ok(r.resized > 0 && r.resized <= r.once, 'a resize redraws the frozen scene once');
  assert.deepEqual(r.paused, ['pause', r.frame]);
  assert.deepEqual(r.after, ['play', r.frame + 5]);
  assert.ok(r.resumedDraws >= 5 * r.once - 5, 'rendering resumes every frame');
});

test('after two misses the fail panel plays the solution, which earns nothing, then hands the level back', async t => {
  const page = await game(t);
  await loseLevel5(page);
  assert.match(await page.locator('#fHint').textContent(), /تلميح/);
  await page.keyboard.press('KeyR');
  await loseLevel5(page);
  assert.match(await page.locator('#fHint').textContent(), /شاهد الحل/);
  const saved = await page.evaluate(() => localStorage.getItem('sg:candy-rope:prog'));
  await page.locator('#fHint').click();
  assert.equal(await page.evaluate(() => __game.info().demo), true);
  const end = await page.evaluate(() => {
    const ate = step(1200, () => __game.info().state === 'won');
    return { ate, frames: step(200, () => !__game.info().demo), info: __game.info() };
  });
  assert.ok(end.ate < 1200, 'the demo plays the recorded plan to a win');
  assert.equal(end.info.demo, false);
  assert.equal(end.info.state, 'play');
  assert.equal(end.info.level, 4);
  assert.equal(end.info.world.ropes, 2);
  assert.equal(end.info.prog[4], -1);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:candy-rope:prog')), saved);
  assert.equal(await page.locator('#toast').textContent(), 'دورك الآن!');
  // the player's turn starts with the same markers and a timing ring for the first cut
  assert.equal(await page.evaluate(() => step(60, () => __game.info().cue != null) < 60), true);
});

test('a failed save keeps the stars on screen, warns, and the retry button saves them', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    __game.start(0); step(40);
    const r = __game.world().ropes[0], p = r.pts[Math.floor(r.pts.length / 2)];
    __game.swipe(p.x - 60, p.y, p.x + 60, p.y);
    step(300, () => __game.info().state === 'won');
  });
  assert.equal(await page.evaluate(() => __game.info().prog[0]), 3);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.realSetItem; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').count(), 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:candy-rope:prog')).stars[0]), 3);
});

test('reduced motion drops the decorative particles but keeps the game playable', async t => {
  const page = await game(t);
  const result = await page.evaluate(() => {
    Kit.motion.setPreference('full');
    __game.start(0); step(40);
    let r = __game.world().ropes[0], p = r.pts[Math.floor(r.pts.length / 2)];
    __game.swipe(p.x - 60, p.y, p.x + 60, p.y); step(2);
    const full = __game.info().particles;
    Kit.motion.setPreference('reduce');
    const cleared = __game.info().particles;
    __game.start(0); step(40);
    r = __game.world().ropes[0]; p = r.pts[Math.floor(r.pts.length / 2)];
    __game.swipe(p.x - 60, p.y, p.x + 60, p.y);
    step(300, () => __game.info().state === 'won');
    const reduced = __game.info();
    Kit.motion.setPreference('system');
    return { full, cleared, state: reduced.state, particles: reduced.particles };
  });
  assert.ok(result.full > 0);
  assert.equal(result.cleared, 0);
  assert.deepEqual([result.state, result.particles], ['won', 0]);
});

test('in classroom / reduced motion the hint bulb still glows after two misses, as a still ring', async t => {
  const page = await game(t);
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  await loseLevel5(page);
  await page.keyboard.press('KeyR');
  await loseLevel5(page);
  await page.keyboard.press('KeyR');
  const bulb = await page.evaluate(() => {
    const b = document.getElementById('bHint'), cs = getComputedStyle(b);
    return { glow: b.classList.contains('glow'), animation: cs.animationName, shadow: cs.boxShadow };
  });
  assert.equal(bulb.glow, true);
  assert.equal(bulb.animation, 'none');
  assert.match(bulb.shadow, /rgba\(255, 225, 77, 0\.9\) 0px 0px 0px 5px/);
});

test('in play the unfolded save warning sits above the level tip and lets cuts and taps through', async t => {
  const page = await game(t);
  const r = await page.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    __game.start(2); step(30);
    __game.unlockAll(); // a save that fails while the tip is on screen
    const s = document.querySelector('.sg-save-status'), b = s.getBoundingClientRect(), btn = s.querySelector('button').getBoundingClientRect();
    const c = document.getElementById('cv').getBoundingClientRect();
    const r = {
      compact: s.dataset.compact, bottom: b.bottom, tipTop: c.top + 648 * c.height / 720,
      through: document.elementFromPoint(b.right - 8, b.top + b.height / 2).id,
      retry: document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2).tagName
    };
    document.getElementById('bPause').click();
    r.menuGap = innerHeight - s.getBoundingClientRect().bottom;
    return r;
  });
  assert.equal(r.compact, 'false');
  assert.ok(r.bottom <= r.tipTop, `warning bottom ${r.bottom} must clear the tip at ${r.tipTop}`);
  assert.equal(r.through, 'cv', 'the panel passes clicks to the canvas');
  assert.equal(r.retry, 'BUTTON');
  assert.equal(r.menuGap, 12, 'menus keep the shared spot');
});

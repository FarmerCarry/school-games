// Math Gates in real Chromium: real keys and mouse, lanes, gates that change the crowd by
// their operation, a question answered right and wrong, a whole level to the number
// battle and the result, pause, restart, saves (and a full disk), reduced motion.
// The frame loop is stepped by hand; the 3D view runs in its low-quality test path (?lq).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

const STARS = (n, k = 2) => Array.from({ length: 30 }, (_, i) => i < n ? k : 0);
const SAVE = (extra = {}) => ({ v: 1, coins: 0, stars: STARS(0), best: STARS(0, 0), color: 0, hat: 0, seen: 0, coach: true, ...extra });
// DDA levels: 0.05 is tier 1, 0.5 tier 3.
const TIER = { 1: 0.05, 3: 0.5 };

// The game with its frame loop stepped by hand, every Kit.dda result recorded
// (mg.results), and a storage that can be told to fail.
// No page errors, no console errors, no requests off the server.
async function game(t, { save, dda = TIER[1], reducedMotion = 'no-preference', size = [1280, 720] } = {}) {
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
    if (!sessionStorage.getItem('mg-seeded')) {
      sessionStorage.setItem('mg-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:math-gates:save', typeof save === 'string' ? save : JSON.stringify(save));
    }
    let kit;
    const mg = window.mg = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        mg.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        mg.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        return { stop() {} };
      };
      const make = kit.dda;
      kit.dda = (slug, opts) => {
        const control = make.call(kit, slug, Object.assign({}, opts, { start: dda })), result = control.result;
        control.result = outcome => { mg.results.push(outcome); return result.call(control, outcome); };
        return control;
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:math-gates:save' && window.mg && window.mg.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, dda });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/math-gates/?lq`);
  await page.waitForFunction(() => window.__game && window.mg.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => mg.step(n), n);
const run = (page, n = 1) => page.evaluate(n => mg.run(n), n);
const results = page => page.evaluate(() => mg.results);
const stored = page => page.evaluate(() => { const raw = localStorage.getItem('sg:math-gates:save'); return raw ? JSON.parse(raw) : null; });
// Steps the game until a condition on its state holds (or the step budget runs out).
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += 4) { if (ok(__game.state)) return true; mg.run(4); }
    return ok(__game.state);
  }, { cond, max });
}
// Moves the crowd to a lane with the arrow keys, like a child.
async function steer(page, lane) {
  for (let i = 0; i < 3; i++) {
    const s = await state(page);
    if (s.lane === lane) return;
    await page.keyboard.press(lane < s.lane ? 'ArrowLeft' : 'ArrowRight');
    await step(page);
  }
  assert.equal((await state(page)).lane, lane);
}
// Plays like a child who always finds the best gate and dodges obstacles; choose(s)
// may pick another lane for a row.
async function playLevel(page, choose = null, max = 60 * 200) {
  for (let f = 0; f < max; f += 6) {
    const s = await state(page);
    if (s.screen !== 'play' || s.phase === 'done') return s;
    if (s.phase === 'run' && s.next && s.next.shown) {
      let want = choose ? choose(s) : s.next.best;
      const obs = s.obstacles.find(o => !o.passed && o.d > s.d && o.d - s.d < 7);
      if (obs && obs.lanes.includes(want) && s.next.d - s.d > 8) want = [0, 1, 2].find(l => !obs.lanes.includes(l));
      if (want !== s.lane) await steer(page, want);
    }
    await run(page, 6);
  }
  return state(page);
}

test('the title waits; Play goes straight to the first level the first time, at the gentlest tier, and the crowd runs by itself', async t => {
  const page = await game(t, {});
  await step(page, 30);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#title h1').textContent(), 'بواباتالحساب');
  assert.match(await page.locator('.howto').textContent(), /←[\s\S]*→[\s\S]*A[\s\S]*D/, 'how to play shows the keys');
  assert.equal(await page.locator('.howto .mouse').count(), 1, 'and the mouse');
  await page.locator('#btnPlay').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.level, 0); assert.equal(s.tier, 1); assert.equal(s.lane, 1);
  assert.equal(s.next.i, 0); assert.equal(s.next.shown, true, 'the first row is there to read');
  assert.equal(s.next.labels.length, 3);
  assert.ok(s.next.labels.every(l => /^[+−×÷]\d+( [+−×÷]\d+)?$/.test(l)), s.next.labels.join());
  assert.equal(await page.locator('#coach').isVisible(), true, 'the first level shows the keys and the mouse');
  assert.equal(await page.locator('#crowdNum b').isVisible(), true, 'the crowd number shows');
  assert.equal(await page.locator('#crowdNum').textContent(), String(s.count));
  const d0 = s.d;
  await step(page, 60);
  s = await state(page);
  assert.ok(s.d > d0 + 3, 'the crowd runs forward by itself');
  assert.equal(s.lane, 1, 'nothing changes lanes by itself');
  assert.ok(s.glyphs >= 3, 'the gate numbers are drawn');
  assert.ok(s.calls > 5 && s.calls <= 40, `few draw calls (${s.calls})`);
});

test('lanes: ← → and A D move one lane, the mouse clicks a lane, and dragging moves the crowd too', async t => {
  const page = await game(t, { save: SAVE({ stars: STARS(1) }) });
  await page.keyboard.press('Enter'); await step(page, 2);
  assert.equal((await state(page)).screen, 'map', 'a child who has won before picks a level');
  await page.keyboard.press('Enter'); await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
  await page.keyboard.press('ArrowLeft'); await step(page);
  assert.equal((await state(page)).lane, 0);
  await page.keyboard.press('ArrowLeft'); await step(page);
  assert.equal((await state(page)).lane, 0, 'the crowd never leaves the track');
  await page.keyboard.press('KeyD'); await step(page);
  assert.equal((await state(page)).lane, 1);
  await page.keyboard.press('ArrowRight'); await step(page);
  assert.equal((await state(page)).lane, 2);
  await page.keyboard.press('KeyA'); await step(page);
  assert.equal((await state(page)).lane, 1);
  await step(page, 20);
  assert.ok(Math.abs((await state(page)).x) < 0.1, 'the crowd slid into the middle lane');
  // The mouse: a click on a lane goes there.
  let p = await page.evaluate(() => __game.lanePoint(0));
  await page.mouse.click(p.x, p.y); await step(page);
  assert.equal((await state(page)).lane, 0, 'clicked the left lane');
  p = await page.evaluate(() => __game.lanePoint(2));
  await page.mouse.click(p.x, p.y); await step(page);
  assert.equal((await state(page)).lane, 2, 'clicked the right lane');
  // Dragging: press on the right lane, move to the middle, then the left.
  const right = await page.evaluate(() => __game.lanePoint(2)), mid = await page.evaluate(() => __game.lanePoint(1)), left = await page.evaluate(() => __game.lanePoint(0));
  await page.mouse.move(right.x, right.y); await page.mouse.down(); await step(page);
  await page.mouse.move(mid.x, mid.y, { steps: 4 }); await step(page);
  assert.equal((await state(page)).lane, 1, 'dragged to the middle');
  await page.mouse.move(left.x, left.y, { steps: 4 }); await step(page);
  assert.equal((await state(page)).lane, 0, 'dragged to the left');
  await page.mouse.up();
  // Moving the mouse without a press changes nothing.
  await page.mouse.move(right.x, right.y, { steps: 4 }); await step(page, 3);
  assert.equal((await state(page)).lane, 0, 'hovering does not steer');
});

test('passing a gate changes the crowd by its operation; the best gate is praised, another shows the best one in gold', async t => {
  const page = await game(t, { save: SAVE({ stars: STARS(12), coach: true }), dda: TIER[3] });
  // World 3 (multiplication) is open: start its first level from the map.
  await page.locator('#btnPlay').click(); await step(page);
  await clickControl(page, '.pebble >> nth=12'); await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.level, 12); assert.equal(s.world, 2);
  // Row 0: take a gate that is not the best.
  const row = s.next, other = [0, 1, 2].find(l => l !== row.best);
  await steer(page, other);
  const before = s.count, expect = await page.evaluate(([label, c]) => {
    const [a, b] = label.split(' '), gate = { op: a[0], n: Number(a.slice(1)) };
    if (b) { gate.op2 = b[0]; gate.n2 = Number(b.slice(1)); }
    return MG.pass(gate, c);
  }, [row.labels[other], before]);
  assert.ok(await until(page, 's.passed === 1', 60 * 12));
  s = await state(page);
  assert.equal(s.count, expect, `${row.labels[other]} on ${before} gives ${expect}`);
  assert.match(s.popup, /الأفضل/, 'the best gate is shown');
  assert.ok(s.popup.includes(row.labels[row.best]), s.popup);
  await step(page, 120);
  assert.equal((await state(page)).popup.includes('الأفضل'), false, 'and goes away');
  // Row 1 (or the next gate row): take the best gate.
  assert.ok(await until(page, 's.next && s.next.shown', 600));
  s = await state(page);
  if (s.next.kind === 'gate') {
    const b = s.next.best, c = s.count, res = s.next.results[b];
    await steer(page, b);
    assert.ok(await until(page, 's.passed === 2', 60 * 12));
    assert.equal((await state(page)).count, res, 'the best gate applied');
    assert.equal(await page.locator('#crowdNum').textContent(), String(res), 'the big number follows the crowd');
    assert.ok(res > c);
  }
});

test('a question gate: the right answer adds a burst of runners and «صح!»; a wrong one takes a few and shows the right answer', async t => {
  // Several levels in world 1 at tier 3 ask two questions.
  const page = await game(t, { save: SAVE({ stars: STARS(1) }), dda: TIER[3] });
  await page.locator('#btnPlay').click(); await step(page);
  await clickControl(page, '.pebble >> nth=1'); await step(page);
  let answered = 0;
  for (let k = 0; k < 2; k++) {
    // Play the best gates up to the next question row.
    for (let f = 0; f < 60 * 120; f += 6) {
      const s = await state(page);
      if (s.phase !== 'run' || (s.next && s.next.kind === 'quiz' && s.next.shown)) break;
      if (s.next && s.next.shown && s.lane !== s.next.best) await steer(page, s.next.best);
      await run(page, 6);
    }
    const s = await state(page);
    if (!(s.next && s.next.kind === 'quiz')) break;
    const q = s.next, right = q.answers.indexOf(q.ans), wrong = (right + 1) % 3, pick = k === 0 ? right : wrong;
    assert.equal(q.answers.filter(a => a === q.ans).length, 1, 'exactly one right answer');
    assert.match(q.text, /^\d+ [+−×÷] \d+.* = \?$/);
    await steer(page, pick);
    // Obstacles sit at least 10 m before a row: the crowd's number 2 m before it is the one the question changes.
    const n = s.passed;
    assert.ok(await until(page, `s.d > ${q.d - 2}`, 60 * 12));
    const before = (await state(page)).count;
    assert.ok(await until(page, `s.passed === ${n + 1}`, 60 * 2));
    const after = await state(page);
    const equation = q.text.replace('?', String(q.ans));
    if (pick === right) {
      assert.equal(after.count, before + await page.evaluate(c => MG.quizBonus(c), before), 'a bonus burst of runners');
      assert.match(after.popup, /صح!/);
    } else {
      assert.equal(after.count, Math.max(1, before - await page.evaluate(c => MG.quizLoss(c), before)), 'a few runners are lost');
      assert.match(after.popup, /حاول مرة أخرى/);
    }
    assert.ok(after.popup.includes(equation), 'the right answer is shown: ' + after.popup);
    answered++;
  }
  assert.ok(answered >= 1, 'the level asked a question');
});

test('a whole level: the number battle, the staircase and the result with stars; the save, the difficulty, Enter for the next level and R to replay', async t => {
  const page = await game(t, {});
  await page.keyboard.press('Space'); await step(page, 2);
  const start = await state(page);
  assert.equal(start.screen, 'play');
  let busiest = { calls: 0, triangles: 0 };
  const end = await playLevel(page, st => { if (st.triangles > busiest.triangles) busiest = st; return st.next.best; });
  assert.equal(end.phase, 'done');
  assert.ok(busiest.calls <= 40 && busiest.triangles < 250000, `light enough for a school PC: ${busiest.calls} draw calls, ${busiest.triangles} triangles`);
  assert.ok(await until(page, "s.screen === 'result'", 120));
  const s = await state(page);
  assert.equal(s.result.won, true); assert.equal(s.result.stars, 3, 'the best gates win three stars');
  assert.equal(s.result.count, start.par);
  assert.equal(await page.locator('#result').isVisible(), true);
  assert.equal(await page.locator('#res-count').textContent(), String(s.result.count));
  assert.equal(await page.locator('#res-rival').textContent(), String(start.rival));
  assert.equal(await page.locator('#res-cmp').textContent(), '>');
  await step(page, 150);
  assert.equal(await page.locator('#res-stars .star.on').count(), 3, 'three stars pop in');
  const saved = await stored(page);
  assert.equal(saved.stars[0], 3); assert.equal(saved.best[0], s.result.count); assert.equal(saved.coach, true);
  assert.equal(saved.coins, s.result.coins); assert.ok(saved.coins > 0, 'coins from the track and the staircase');
  assert.deepEqual(await results(page), [1], 'one full result for the difficulty');
  assert.equal(await page.locator('#res-next').isVisible(), true);
  // R replays the same level; Enter after a win goes to the next one.
  await page.keyboard.press('KeyR'); await step(page, 2);
  let n = await state(page);
  assert.equal(n.screen, 'play'); assert.equal(n.level, 0); assert.equal(n.passed, 0); assert.equal(n.attempt, 2);
  await playLevel(page);
  assert.ok(await until(page, "s.screen === 'result'", 120));
  await step(page, 40);
  await page.keyboard.press('Enter'); await step(page, 2);
  n = await state(page);
  assert.equal(n.screen, 'play'); assert.equal(n.level, 1, 'Enter: the next level');
});

test('losing the battle: careless gates lose to the rival crowd, no stars, a gentle "try again", and Enter replays', async t => {
  // World 5 at tier 3: the worst gates never win there (checked over 3000 seeds).
  const page = await game(t, { save: SAVE({ stars: STARS(24) }), dda: TIER[3] });
  await page.locator('#btnPlay').click(); await step(page);
  await clickControl(page, '.pebble >> nth=24'); await step(page);
  // The worst gate every time, the wrong answer every time.
  const end = await playLevel(page, s => {
    if (s.next.kind === 'quiz') return s.next.answers.findIndex(a => a !== s.next.ans);
    const r = s.next.results;
    return r.indexOf(Math.min(...r));
  });
  assert.equal(end.phase, 'done');
  assert.ok(await until(page, "s.screen === 'result'", 120));
  const s = await state(page);
  assert.equal(s.result.won, false); assert.equal(s.result.stars, 0);
  assert.equal(await page.locator('#res-title').textContent(), 'حاول مرة أخرى!');
  assert.equal(await page.locator('#res-next').isVisible(), false);
  assert.equal((await stored(page)).stars[24], 0, 'no stars saved');
  const r = await results(page);
  assert.equal(r.length, 1); assert.ok(r[0] <= 0.25, 'a lost battle is a poor result for the difficulty');
  await step(page, 40);
  await page.keyboard.press('Enter'); await step(page, 2);
  const again = await state(page);
  assert.equal(again.screen, 'play'); assert.equal(again.level, 24, 'Enter after a loss: the same level again');
});

test('P, Esc, the button and a lost focus pause; nothing moves while paused, focus never resumes; Restart starts the level fresh', async t => {
  const page = await game(t, { save: SAVE({ stars: STARS(1) }) });
  await page.keyboard.press('Enter'); await step(page, 2);
  await page.keyboard.press('Enter'); await step(page, 30);
  const snap = () => page.evaluate(() => JSON.stringify([__game.state.d, __game.state.lane, __game.state.count, __game.state.t]));
  for (const how of ['KeyP', 'Escape', 'button', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    assert.equal((await state(page)).screen, 'paused', how);
    assert.equal(await page.locator('#pause-screen').isVisible(), true);
    const before = await snap();
    await page.keyboard.press('ArrowLeft');
    const p = await page.evaluate(() => __game.lanePoint(2));
    await page.mouse.click(p.x, p.y);
    await run(page, 90);
    assert.equal(await snap(), before, how + ': everything is frozen');
    if (how === 'blur') {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await step(page, 10);
      assert.equal((await state(page)).screen, 'paused', 'focus coming back never resumes');
    }
    if (how === 'KeyP') await page.keyboard.press('KeyP'); else await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await step(page, 5);
    assert.notEqual(await snap(), before, 'and runs again after Resume');
  }
  // Restart from the pause: the same level from its start.
  await page.keyboard.press('ArrowRight'); await run(page, 200);
  await page.keyboard.press('Escape'); await step(page);
  const attempt = (await state(page)).attempt;
  await page.locator('#btnRestart').click(); await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.attempt, attempt + 1); assert.equal(s.passed, 0); assert.equal(s.lane, 1); assert.ok(s.d < 1);
  // R in the pause restarts too; the map button leaves for the levels.
  await run(page, 100);
  await page.keyboard.press('KeyP'); await step(page);
  await page.keyboard.press('KeyR'); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.attempt, attempt + 2);
  await page.keyboard.press('KeyP'); await step(page);
  await page.locator('#btnQuit').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  assert.deepEqual(await results(page), [], 'restarts and leaving are not results for the difficulty');
});

test('saves come back after a reload; old or damaged saves open a fresh game; a full disk warns and Retry writes', async t => {
  const page = await game(t, { save: SAVE({ coins: 330, stars: STARS(7, 3), best: STARS(7, 25), color: 3, hat: 2, seen: 330 }) });
  assert.equal(await page.locator('#title-stars').textContent(), '21');
  assert.equal(await page.locator('#title-coins').textContent(), '330');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.mg.step);
  assert.equal(await page.locator('#title-stars').textContent(), '21');
  const sv = await page.evaluate(() => __game.save);
  assert.equal(sv.color, 3); assert.equal(sv.hat, 2);
  // The map: world 2 is open (level 3 of world 1 was won), world 3 is not.
  await page.locator('#btn-map').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  assert.doesNotMatch(await page.locator('.world').nth(1).getAttribute('class'), /locked/);
  assert.match(await page.locator('.world').nth(2).getAttribute('class'), /locked/);
  assert.match(await page.locator('.pebble').nth(8).getAttribute('class'), /locked/, 'levels open one by one');
  await clickControl(page, '.pebble >> nth=8'); await step(page);
  assert.equal((await state(page)).screen, 'map', 'a locked level does not start');
  assert.equal(await page.locator('.pebble').nth(0).locator('.st svg.on').count(), 3);
  // The wardrobe: a colour that 330 coins unlock is worn and saved; a locked one is not.
  await page.locator('#map-wardrobe').click(); await step(page);
  assert.equal((await state(page)).screen, 'wardrobe');
  await page.evaluate(() => { mg.failSave = true; });
  await page.locator('#colors .tile').nth(2).click(); await step(page);
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed', 'a full disk shows the warning');
  assert.equal((await stored(page)).color, 3, 'nothing was written');
  assert.equal((await page.evaluate(() => __game.save)).color, 2, 'the colour is kept in the game');
  await page.evaluate(() => { mg.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).color, 2);
  await page.locator('#colors .tile').nth(7).click(); await step(page);
  assert.equal((await page.evaluate(() => __game.save)).color, 2, 'gold needs 1200 coins');
  assert.match(await page.locator('#colors .tile').nth(7).getAttribute('class'), /locked/);
  assert.equal(await page.locator('#colors .tile').nth(7).locator('.need b').textContent(), '1200');
  await page.keyboard.press('Escape'); await step(page);
  assert.equal((await state(page)).screen, 'map');
  // (Every kind of damaged save is checked in the engine test; three load in the page.)
  for (const save of ['broken{', '{"v":1,"coins":"abc","stars":"x","hat":99,"color":-3}', '{"v":7,"coins":5000,"stars":[3,3,3],"music":true}']) {
    const old = await game(t, { save });
    assert.equal((await state(old)).screen, 'title');
    assert.equal(await old.locator('#title-stars').textContent(), '0', save);
    await old.keyboard.press('Enter'); await step(old);
    const s = await state(old);
    assert.equal(s.screen, 'play', save); assert.equal(s.level, 0);
  }
});

test('reduced motion: the run is calm, messages stay readable and leave on time, and play works the same', async t => {
  const page = await game(t, { save: SAVE({ stars: STARS(1) }), dda: TIER[3], reducedMotion: 'reduce' });
  await page.locator('#btnPlay').click(); await step(page);
  await clickControl(page, '.pebble >> nth=1'); await step(page);
  let s = await state(page);
  assert.equal(s.calm, true, 'the view knows');
  // Take a non-best gate: the gold hint shows, still readable, and is gone after its time.
  const other = [0, 1, 2].find(l => l !== s.next.best);
  await steer(page, other);
  assert.ok(await until(page, 's.passed === 1', 60 * 12));
  s = await state(page);
  assert.match(s.popup, /الأفضل/);
  assert.equal(await page.locator('#popup').isVisible(), true);
  const opacity = await page.locator('#popup').evaluate(el => getComputedStyle(el).opacity);
  assert.equal(opacity, '1', 'not faded away by a cut animation');
  await step(page, 110);
  assert.equal(await page.locator('#popup').isVisible(), false, 'removed by its timer');
  const end = await playLevel(page);
  assert.equal(end.phase, 'done');
  assert.ok(await until(page, "s.screen === 'result'", 120));
  const r = (await state(page)).result;
  assert.equal(await page.locator('#result .card').isVisible(), true, 'the result card shows at once');
  assert.equal(await page.locator('#result .card').evaluate(el => getComputedStyle(el).opacity), '1');
  await step(page, 100);
  assert.equal(await page.locator('#res-stars .star.on').count(), r.stars, 'its stars are lit');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};

function loadEngine(root) {
  const HH = {
    sfx: new Proxy({}, { get: () => noop }),
    save: { tips: {} },
    charById: () => ({ spd: 3, jmp: 3, sht: 3, headR: 42 })
  };
  const Kit = {
    keys: { down: () => false, pressed: () => false },
    particles: () => ({ burst: noop, update: noop }),
    shake: () => ({ add: noop, update: noop }),
    rand: (a, b) => (a + b) / 2
  };
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.5;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'games/hoop-heads/engine.js'), 'utf8'),
    { window: { HH }, Kit, Math: deterministicMath }, { filename: 'hoop-heads/engine.js' });
  return HH;
}

function makeMatch(HH, scores, opts = {}) {
  const m = HH.newMatch({ mode: 'duo', p1: 'test', p2: 'test', target: 21 });
  m.phase = 'play';
  m.time = opts.buzzer ? 1 / 120 : 60;
  m.overtime = !!opts.overtime;
  if (m.overtime) m.time = 0;
  m.players.forEach((p, i) => { p.score = scores[i]; });
  return m;
}

function landBasket(HH, m, scorer, pts = 2) {
  const hoop = m.hoops[1 - scorer];
  Object.assign(m.ball, {
    hidden: false, holder: null, x: hoop.x, y: hoop.y - 1,
    vx: 0, vy: 300, state: 'shot', shooter: m.players[scorer], pts,
    touched: false, scoredT: 0
  });
  HH.stepMatch(m, 1 / 60);
}

function stepUntil(HH, m, predicate, label) {
  for (let i = 0; i < 600 && !predicate(m); i++) HH.stepMatch(m, 1 / 60);
  assert.ok(predicate(m), label);
}

// Run the real engine, including buzzer detection, basket collision, celebration,
// overtime and the final end event consumed by the rewards/tournament UI.
export function testHoop({ root = REPO } = {}) {
  const HH = loadEngine(root);
  let checks = 0;
  for (const scorer of [0, 1]) {
    for (const pts of [2, 3]) {
      for (const outcome of ['trailing', 'tying', 'winning']) {
        const scores = [10, 10];
        scores[scorer] = outcome === 'trailing' ? 0 : 10 - pts + (outcome === 'winning' ? 1 : 0);
        const m = makeMatch(HH, scores, { buzzer: true });
        landBasket(HH, m, scorer, pts);
        assert.ok(m.timeUp, 'the timer must expire before this in-flight shot lands');
        assert.equal(m.players[scorer].score, scores[scorer] + pts);
        assert.equal(m.events.filter(e => e.type === 'buzzer').length, 1);
        assert.equal(m.events.filter(e => e.type === 'score').length, 1);
        if (outcome === 'tying') {
          assert.equal(m.ended, false, 'a tying buzzer basket must go to overtime');
          stepUntil(HH, m, game => game.overtime, 'overtime must follow the tying celebration');
          assert.equal(m.winner, -1);
          assert.equal(m.done, undefined);
          assert.equal(m.events.filter(e => e.type === 'end').length, 0, 'no result/reward event for a tie');
        } else {
          const winner = outcome === 'trailing' ? 1 - scorer : scorer;
          assert.equal(m.winner, winner, `${outcome} buzzer shot by player ${scorer} (${pts} points)`);
          stepUntil(HH, m, game => game.done, 'the final result must complete');
          assert.equal(m.winner, winner);
          assert.equal(m.events.filter(e => e.type === 'end').length, 1, 'one result/reward event');
        }
        checks++;
      }
    }

    for (const overtime of [false, true]) {
      const scores = [10, 10];
      if (!overtime) scores[scorer] = 19;
      const m = makeMatch(HH, scores, { overtime });
      landBasket(HH, m, scorer);
      assert.equal(m.ended, true, overtime ? 'the first overtime basket wins' : 'reaching the target wins');
      assert.equal(m.winner, scorer);
      stepUntil(HH, m, game => game.done, 'the target/overtime result must complete');
      assert.equal(m.events.filter(e => e.type === 'end').length, 1);
      checks++;
    }
  }

  const ordinary = makeMatch(HH, [0, 0]);
  landBasket(HH, ordinary, 0);
  assert.equal(ordinary.ended, false, 'an ordinary basket must not end the match');
  stepUntil(HH, ordinary, m => m.phase === 'play', 'ordinary play must resume after celebration');
  assert.equal(ordinary.winner, -1);
  checks++;

  const miss = makeMatch(HH, [5, 10], { buzzer: true });
  Object.assign(miss.ball, {
    hidden: false, x: 640, y: HH.FLOOR - HH.BALL_R - 1,
    vx: 0, vy: 200, state: 'shot', touched: false, shooter: miss.players[0]
  });
  stepUntil(HH, miss, m => m.done, 'a missed final shot must finish the match');
  assert.equal(miss.winner, 1);
  assert.equal(miss.players[0].score, 5);
  assert.equal(miss.events.filter(e => e.type === 'end').length, 1);
  checks++;
  return { checks };
}

// Optional integration check for a caller that already has a browser and server.
// This exercises the unchanged result UI and its persisted rewards, including
// the final tournament match, using baskets scored by the real engine.
export async function testHoopRewards({ page, baseURL }) {
  let checks = 0;
  for (const mode of ['cpu', 'tour']) {
    for (const winning of [false, true]) {
      await page.goto(new URL('games/hoop-heads/', baseURL).href);
      await page.waitForFunction(() => window.__game && window.HH);
      const game = await page.evaluate(({ mode, winning }) => {
        const save = window.HH.save;
        save.coins = 0; save.stats.games = 0; save.stats.wins = 0;
        save.streak = 2; save.bestStreak = 2; save.cups.b = false;
        if (mode === 'tour') {
          window.__game.tour(0, 4, 'robo');
          document.getElementById('ladGo').click();
        } else window.__game.start({ mode: 'cpu', lv: 0 });
        const m = window.__game.match;
        // Hold the opponents still so this isolates the pending final basket.
        m.players.forEach(p => { p.ctrl = 'human'; p.ai = null; });
        m.phase = 'play'; m.time = 1 / 120;
        m.players[0].score = winning ? 9 : 0; m.players[1].score = 10;
        Object.assign(m.ball, {
          hidden: false, holder: null, x: m.hoops[1].x, y: m.hoops[1].y - 1,
          vx: 0, vy: 300, state: 'shot', shooter: m.players[0], pts: 2,
          touched: false, scoredT: 0
        });
        for (let i = 0; i < 600 && !m.done; i++) window.HH.stepMatch(m, 1 / 60);
        return { winner: m.winner, score: m.players.map(p => p.score), done: m.done };
      }, { mode, winning });
      assert.equal(game.winner, winning ? 0 : 1);
      assert.deepEqual(game.score, [winning ? 11 : 2, 10]);
      assert.equal(game.done, true);
      const expectedState = mode === 'tour' && winning ? 'trophy' : 'result';
      await page.waitForFunction(state => window.__game.state === state, expectedState);
      const result = await page.evaluate(() => ({
        state: window.__game.state,
        loseBanner: document.getElementById('resBanner').classList.contains('lose'),
        save: window.HH.store.get('save', null)
      }));
      assert.equal(result.save.stats.games, 1, 'the result is saved once');
      assert.equal(result.save.stats.wins, winning ? 1 : 0);
      if (!winning) {
        assert.equal(result.loseBanner, true);
        assert.equal(result.save.coins, 7, 'two points and the loss reward, with no win bonus');
      } else if (mode === 'cpu') assert.equal(result.save.coins, 26, 'eleven points and the CPU win reward');
      if (mode === 'cpu') assert.equal(result.save.streak, winning ? 3 : 0);
      else assert.equal(result.save.cups.b, winning, 'a losing final must not award the cup');
      if (mode === 'tour' && !winning) {
        await page.evaluate(() => document.getElementById('rAgain').click());
        assert.equal(await page.evaluate(() => window.__game.state), 'play', 'loss retries the same match');
      }
      checks++;
    }
  }
  return { checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootAt = process.argv.indexOf('--root');
  const root = rootAt >= 0 ? path.resolve(process.argv[rootAt + 1]) : REPO;
  const { checks } = testHoop({ root });
  console.log(`Hoop Heads: ${checks} gameplay regression scenarios passed.`);
}

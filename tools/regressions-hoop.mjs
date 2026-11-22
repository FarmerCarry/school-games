import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function loadEngine(root) {
  const full = path.join(root, 'games/hoop-heads/engine.js');
  delete require.cache[full];
  return require(full);
}

function makeMatch(E, scores, opts = {}) {
  const m = E.createMatch({ mode: 'duo', target: opts.target ?? 21, seed: 777 });
  m.phase = 'play';
  m.time = opts.buzzer ? 1 / 120 : 60;
  m.overtime = !!opts.overtime;
  if (m.overtime) m.time = 0;
  m.players.forEach((p, i) => { p.score = scores[i]; });
  return m;
}

function landBasket(E, m, scorer, pts = 2) {
  const hoop = m.hoops[1 - scorer];
  Object.assign(m.ball, {
    holder: null,
    x: hoop.x,
    y: hoop.y - 2,
    prevX: hoop.x,
    prevY: hoop.y - 10,
    vx: 0,
    vy: 380,
    state: 'shot',
    shooter: m.players[scorer],
    pts,
    isSuper: false,
    touchedRim: false,
    touchedBoard: false,
    scoredT: 0
  });
  E.stepMatch(m, 1 / 60);
}

function stepUntil(E, m, predicate, label) {
  for (let i = 0; i < 600 && !predicate(m); i++) E.stepMatch(m, 1 / 60);
  assert.ok(predicate(m), label);
}

// Run the pure engine across buzzer beaters, 2pt/3pt baskets, overtime, target score,
// ordinary celebrations, and missed final shots.
export function testHoop({ root = REPO } = {}) {
  const E = loadEngine(root);
  let checks = 0;

  for (const scorer of [0, 1]) {
    for (const pts of [2, 3]) {
      for (const outcome of ['trailing', 'tying', 'winning']) {
        const scores = [10, 10];
        scores[scorer] = outcome === 'trailing' ? 0 : 10 - pts + (outcome === 'winning' ? 1 : 0);
        const m = makeMatch(E, scores, { buzzer: true });
        landBasket(E, m, scorer, pts);
        assert.ok(m.timeUp, 'the timer must expire before this in-flight shot lands');
        assert.equal(m.players[scorer].score, scores[scorer] + pts);
        assert.equal(m.events.filter(e => e.type === 'buzzer').length, 1);
        assert.equal(m.events.filter(e => e.type === 'score').length, 1);

        if (outcome === 'tying') {
          assert.equal(m.ended, false, 'a tying buzzer basket must go to overtime');
          stepUntil(E, m, game => game.overtime, 'overtime must follow the tying celebration');
          assert.equal(m.winner, -1);
          assert.equal(m.done, false);
          assert.equal(m.events.filter(e => e.type === 'end').length, 0, 'no end event for a tie');
        } else {
          const winner = outcome === 'trailing' ? 1 - scorer : scorer;
          assert.equal(m.winner, winner, `${outcome} buzzer shot by player ${scorer} (${pts} points)`);
          stepUntil(E, m, game => game.done, 'the final result must complete');
          assert.equal(m.winner, winner);
          assert.equal(m.events.filter(e => e.type === 'end').length, 1, 'one final end event');
        }
        checks++;
      }
    }

    for (const overtime of [false, true]) {
      const scores = [10, 10];
      if (!overtime) scores[scorer] = 19;
      const m = makeMatch(E, scores, { overtime });
      landBasket(E, m, scorer);
      assert.equal(m.ended, true, overtime ? 'the first overtime basket wins' : 'reaching the target wins');
      assert.equal(m.winner, scorer);
      stepUntil(E, m, game => game.done, 'the target/overtime result must complete');
      assert.equal(m.events.filter(e => e.type === 'end').length, 1);
      checks++;
    }
  }

  const ordinary = makeMatch(E, [0, 0]);
  landBasket(E, ordinary, 0);
  assert.equal(ordinary.ended, false, 'an ordinary basket must not end the match');
  stepUntil(E, ordinary, m => m.phase === 'play', 'ordinary play must resume after celebration');
  assert.equal(ordinary.winner, -1);
  checks++;

  const miss = makeMatch(E, [5, 10], { buzzer: true });
  Object.assign(miss.ball, {
    holder: null,
    x: 640,
    y: E.FLOOR_Y - E.BALL_R - 1,
    prevX: 640,
    prevY: E.FLOOR_Y - E.BALL_R - 6,
    vx: 0,
    vy: 220,
    state: 'shot',
    touchedRim: false,
    touchedBoard: false,
    shooter: miss.players[0],
    scoredT: 0
  });
  stepUntil(E, miss, m => m.done, 'a missed final shot must finish the match');
  assert.equal(miss.winner, 1);
  assert.equal(miss.players[0].score, 5);
  assert.equal(miss.events.filter(e => e.type === 'end').length, 1);
  checks++;

  return { checks };
}

// Browser integration check exercising the result UI and persisted stars, coins,
// stage unlocks, and win streak for both losing and winning CPU ladder matches.
export async function testHoopRewards({ page, baseURL }) {
  let checks = 0;
  for (const stage of [0, 4]) {
    for (const winning of [false, true]) {
      await page.goto(new URL('games/hoop-heads/', baseURL).href);
      await page.waitForFunction(() => window.__game && window.HH);
      const result = await page.evaluate(({ stage, winning }) => {
        const save = window.HH.save;
        save.coins = 0;
        save.bestScore = 0;
        save.streak = 2;
        save.bestStreak = 2;
        save.unlocked = stage;
        save.stars = [0, 0, 0, 0, 0];
        save.ownedHeads = { classic: true };
        save.stats = { games: 0, wins: 0, baskets: 0, dunks: 0, swishes: 0 };

        window.__game.start({ mode: 'cpu', stage });
        const m = window.__game.match;
        m.players.forEach(p => { p.ctrl = 'human'; });
        m.phase = 'play';
        m.time = 1 / 120;
        m.players[0].score = winning ? 10 : 0;
        m.players[1].score = 10;
        Object.assign(m.ball, {
          holder: null,
          x: m.hoops[1].x,
          y: m.hoops[1].y - 2,
          prevX: m.hoops[1].x,
          prevY: m.hoops[1].y - 10,
          vx: 0,
          vy: 380,
          state: 'shot',
          shooter: m.players[0],
          pts: 2,
          touchedRim: false,
          touchedBoard: false,
          scoredT: 0
        });
        return { startStage: stage };
      }, { stage, winning });

      assert.equal(result.startStage, stage);
      await page.waitForFunction(() => window.__game.state === 'result', { timeout: 10000 });
      const check = await page.evaluate(() => ({
        state: window.__game.state,
        winner: window.__game.match.winner,
        scores: window.__game.match.players.map(p => p.score),
        loseBanner: document.getElementById('resBanner').classList.contains('lose'),
        save: window.HH.store.get('save_v3', null)
      }));

      assert.equal(check.winner, winning ? 0 : 1);
      assert.deepEqual(check.scores, [winning ? 12 : 2, 10]);
      assert.equal(check.loseBanner, !winning);
      assert.equal(check.save.stats.games, 1, 'result is saved once');
      assert.equal(check.save.stats.wins, winning ? 1 : 0);
      assert.equal(check.save.streak, winning ? 3 : 0);
      assert.ok(check.save.coins > 0, 'coins awarded on both win and loss');
      if (winning) {
        assert.ok(check.save.stars[stage] >= 1, 'winning earns at least 1 star');
        if (stage === 0) assert.equal(check.save.unlocked, 1, 'winning stage 1 unlocks stage 2');
        if (stage === 4) assert.equal(check.save.ownedHeads.crown, true, 'beating stage 5 awards crown');
      } else {
        assert.equal(check.save.stars[stage], 0, 'loss awards 0 stars');
        if (stage === 4) assert.ok(!check.save.ownedHeads.crown, 'loss must not award crown');
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

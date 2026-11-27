import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openGame(t, { saved } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'no-preference'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
  });

  await page.addInitScript((rawSaved) => {
    if (rawSaved !== undefined) localStorage.setItem('sg:robo-swarm:save', rawSaved);
    let kit;
    const rs = (window.rs = { stats: [], hits: 0, misses: 0, failSave: false });
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          rs.step = (n = 1) => {
            for (let i = 0; i < n; i++) {
              update(1 / 60);
              render(0);
            }
          };
          return { stop() {} };
        };
        for (const fnName of ['round', 'end', 'tutorial']) {
          const orig = kit.stats[fnName];
          kit.stats[fnName] = function (...args) {
            rs.stats.push([fnName, ...args]);
            return orig.apply(this, args);
          };
        }
        const origHit = kit.track.hit;
        kit.track.hit = function (...args) {
          rs.hits++;
          return origHit.apply(this, args);
        };
        const origMiss = kit.track.miss;
        kit.track.miss = function (...args) {
          rs.misses++;
          return origMiss.apply(this, args);
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:robo-swarm:save' && rs.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, saved);

  await page.goto(`${server.origin}/games/robo-swarm/`);
  await page.waitForFunction(() => window.__game && window.rs?.step);
  await page.evaluate(() => rs.step(1));
  return page;
}

test('title UI renders 100% Arabic labels, 3 difficulties, and all 3 unlocked arenas', async (t) => {
  const page = await openGame(t);
  assert.equal(await page.evaluate(() => __game.state), 'title');
  assert.equal(await page.evaluate(() => __game.paused), false);

  // All 3 arenas are open immediately without locks
  const arenas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#arenaRow .rs-arena')).map((b) => ({
      disabled: b.disabled,
      title: b.querySelector('.nm').textContent
    }))
  );
  assert.equal(arenas.length, 3);
  assert.deepEqual(
    arenas.map((a) => a.disabled),
    [false, false, false]
  );
  assert.deepEqual(
    arenas.map((a) => a.title),
    ['مصنع الشرار', 'حفرة الحمم', 'محطة الفضاء']
  );

  // Zero English words outside .sg-key keycap badges
  const leakedLatin = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('.sg-key, script, style').forEach((el) => el.remove());
    const m = clone.textContent.match(/[A-Za-z]+/g);
    return m || [];
  });
  assert.deepEqual(leakedLatin, []);

  // Select Easy + Arena 2 (Magma Core) -> 6 hearts and magma_1p round
  await page.locator('#diffRow button[data-diff="easy"]').click();
  await page.locator('#arenaRow .rs-arena').nth(1).click();
  await page.locator('#btnPlay').click();

  const state1 = await page.evaluate(() => ({
    state: __game.state,
    arena: __game.run.arena.id,
    hearts: __game.run.mechs[0].maxHp
  }));
  assert.deepEqual(state1, { state: 'play', arena: 'magma', hearts: 6 });

  // Return to menu, select Hero + Arena 3 (Orbital Deck) -> 3 hearts and orbit_1p round
  await page.locator('#btnPause').click();
  await page.locator('#btnMenu').click();
  await page.locator('#diffRow button[data-diff="hero"]').click();
  await page.locator('#arenaRow .rs-arena').nth(2).click();
  await page.locator('#btnPlay').click();

  const state2 = await page.evaluate(() => ({
    state: __game.state,
    arena: __game.run.arena.id,
    hearts: __game.run.mechs[0].maxHp,
    rounds: rs.stats.filter((s) => s[0] === 'round').map((s) => s[1])
  }));
  assert.equal(state2.state, 'play');
  assert.equal(state2.arena, 'orbit');
  assert.equal(state2.hearts, 3);
  assert.deepEqual(state2.rounds, ['magma_1p', 'orbit_1p']);
});

test('1P keyboard + mouse movement, EMP dash, and instant Holo Weapon Pod pickup never freeze play', async (t) => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();

  const px0 = await page.evaluate(() => __game.px);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => rs.step(12));
  await page.keyboard.up('ArrowRight');
  const px1 = await page.evaluate(() => __game.px);
  assert.ok(px1 > px0 + 40, `ArrowRight moved P1 from ${px0} to ${px1}`);

  // Mouse pointer move steers mech upward smoothly, and left-click does NOT dash
  const py0 = await page.evaluate(() => __game.py);
  await page.mouse.move(640, 120);
  await page.evaluate(() => rs.step(18));
  const py1 = await page.evaluate(() => __game.py);
  assert.ok(py1 < py0 - 30, 'active mouse pointer steers mech smoothly');

  await page.mouse.click(640, 120);
  await page.evaluate(() => rs.step(2));
  assert.equal(await page.evaluate(() => __game.run.mechs[0].dashCd), 0, 'left-click does not accidentally trigger dash');

  // Right-click triggers Turbo EMP Dash, and Shift/Space trigger dash too
  await page.mouse.click(640, 120, { button: 'right' });
  await page.evaluate(() => rs.step(2));
  assert.ok(await page.evaluate(() => __game.run.mechs[0].dashCd > 0.5), 'right-click triggers Turbo EMP Dash');

  await page.evaluate(() => { __game.run.mechs[0].dashCd = 0; __game.run.mechs[0].dashT = 0; });
  await page.keyboard.press('ShiftLeft');
  await page.evaluate(() => rs.step(2));
  assert.ok(await page.evaluate(() => __game.run.mechs[0].dashCd > 0.5), 'Shift triggers Turbo EMP Dash');

  await page.evaluate(() => { __game.run.mechs[0].dashCd = 0; __game.run.mechs[0].dashT = 0; });
  await page.keyboard.press('Space');
  await page.evaluate(() => rs.step(2));
  assert.ok(await page.evaluate(() => __game.run.mechs[0].dashCd > 0.5), 'Space triggers Turbo EMP Dash');

  // Instant Holo Weapon Pod pickup upgrades weapon without pausing or opening any modal
  const podUpgrade = await page.evaluate(() => {
    const m = __game.run.mechs[0];
    const before = m.lv[2];
    window.RSEngine.spawnPod(__game.run, 2, m.x + 12, m.y);
    const tBefore = __game.t;
    rs.step(10);
    return { state: __game.state, before, after: m.lv[2], advanced: __game.t > tBefore };
  });
  assert.equal(podUpgrade.state, 'play');
  assert.equal(podUpgrade.after, podUpgrade.before + 1);
  assert.equal(podUpgrade.advanced, true);
});

test('defeating Mega-Boss wins with stars & coins, and losing all hearts records lose', async (t) => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => {
    __game.run.t = 69.98;
    rs.step(3);
    const boss = __game.run.enemies.find((e) => e.kind === 5);
    window.RSEngine.damageEnemy(__game.run, boss, boss.hp + 100, 0, 0);
    rs.step(1);
  });

  const winInfo = await page.evaluate(() => ({
    state: __game.state,
    coins: __game.save.coins,
    resultHidden: document.getElementById('scrResult').hidden,
    title: document.getElementById('resTitle').textContent,
    ends: rs.stats.filter((s) => s[0] === 'end'),
    hits: rs.hits
  }));
  assert.equal(winInfo.state, 'win');
  assert.equal(winInfo.resultHidden, false);
  assert.equal(winInfo.title, 'انتصار ساحق!');
  assert.ok(winInfo.coins >= 40);
  assert.ok(winInfo.hits >= 1);
  assert.equal(winInfo.ends.length, 1);
  assert.equal(winInfo.ends[0][1], 'win');

  // Play again and lose all hearts -> 'over' state and 'lose' telemetry
  await page.locator('#btnAgain').click();
  await page.evaluate(() => {
    const m = __game.run.mechs[0];
    while (m.alive) {
      m.invuln = 0;
      m.dashT = 0;
      window.RSEngine.hurtMech(__game.run, m);
    }
    rs.step(1);
  });
  const loseInfo = await page.evaluate(() => ({
    state: __game.state,
    misses: rs.misses,
    ends: rs.stats.filter((s) => s[0] === 'end')
  }));
  assert.equal(loseInfo.state, 'over');
  assert.ok(loseInfo.misses >= 3);
  assert.equal(loseInfo.ends.length, 2);
  assert.equal(loseInfo.ends[1][1], 'lose');
});

test('2P co-op mode supports independent controls and 1.5s hologram partner revive', async (t) => {
  const page = await openGame(t);
  await page.locator('#btn2p').click();
  await page.locator('#btnPlay').click();

  const startPositions = await page.evaluate(() => ({
    players: __game.run.players,
    p1x: __game.run.mechs[0].x,
    p2x: __game.run.mechs[1].x,
    rounds: rs.stats.filter((s) => s[0] === 'round')
  }));
  assert.equal(startPositions.players, 2);
  assert.deepEqual(startPositions.rounds, [['round', 'spark_2p']]);

  // P1 moves left (KeyA), P2 moves right (ArrowRight)
  await page.keyboard.down('KeyA');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => rs.step(12));
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ArrowRight');

  const moved = await page.evaluate(() => ({
    p1x: __game.run.mechs[0].x,
    p2x: __game.run.mechs[1].x
  }));
  assert.ok(moved.p1x < startPositions.p1x - 30);
  assert.ok(moved.p2x > startPositions.p2x + 30);

  // Knock down P2 and revive via P1 touching P2 hologram ring for 1.5s
  const revived = await page.evaluate(() => {
    const [p1, p2] = __game.run.mechs;
    __game.run.enemies.length = 0;
    while (p2.alive) {
      p2.invuln = 0;
      window.RSEngine.hurtMech(__game.run, p2);
    }
    const stillPlaying = __game.state === 'play' && !p2.alive;
    p1.x = p2.x + 15;
    p1.y = p2.y;
    for (let i = 0; i < 100; i++) {
      __game.run.enemies.length = 0;
      rs.step(1);
      if (p2.alive) break;
    }
    return { stillPlaying, p2Alive: p2.alive, revives: __game.run.revives };
  });
  assert.deepEqual(revived, { stillPlaying: true, p2Alive: true, revives: 1 });
});

test('Mech Garage unlocks & equips skins, retries failed saves, and handles damaged save data', async (t) => {
  const page = await openGame(t, { saved: JSON.stringify({ coins: 120, equipped: 0, skins: [1, 0, 0, 0, 0] }) });
  await page.locator('#btnGarage').click();
  assert.equal(await page.locator('#scrGarage').isVisible(), true);

  // Buy skin index 1 (التنين الناري, cost 50)
  await page.locator('#skinList .rs-skin').nth(1).locator('button').click();
  const afterBuy = await page.evaluate(() => ({
    coins: __game.save.coins,
    equipped: __game.save.equipped,
    skins: __game.save.skins,
    stored: JSON.parse(localStorage.getItem('sg:robo-swarm:save'))
  }));
  assert.equal(afterBuy.coins, 70);
  assert.equal(afterBuy.equipped, 1);
  assert.equal(afterBuy.skins[1], 1);
  assert.equal(afterBuy.stored.equipped, 1);
  await page.locator('#btnGarageBack').click();

  // Simulate storage failure on round end and verify retry button recovers save
  await page.locator('#btnPlay').click();
  await page.evaluate(() => {
    localStorage.removeItem('sg:robo-swarm:save');
    rs.failSave = true;
    const m = __game.run.mechs[0];
    while (m.alive) {
      m.invuln = 0;
      window.RSEngine.hurtMech(__game.run, m);
    }
    rs.step(1);
  });
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  await page.evaluate(() => { rs.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:robo-swarm:save')).coins > 70));

  // Damaged save fixture still boots cleanly onto Title screen
  const damagedPage = await openGame(t, { saved: '{"coins":"bad","equipped":99,"skins":"invalid"}' });
  assert.equal(await damagedPage.evaluate(() => __game.state), 'title');
  assert.equal(await damagedPage.locator('#btnPlay').isVisible(), true);
});

test('pause freezes time completely, resume continues, and restart resets round timer', async (t) => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => rs.step(25));
  const tBeforePause = await page.evaluate(() => __game.t);
  assert.ok(tBeforePause > 0.3);

  await page.keyboard.press('KeyP');
  await page.evaluate(() => rs.step(1));
  assert.equal(await page.evaluate(() => __game.state), 'pause');
  assert.equal(await page.evaluate(() => __game.paused), true);

  await page.evaluate(() => rs.step(40));
  assert.equal(await page.evaluate(() => __game.t), tBeforePause, 'simulation freezes completely when paused');

  await page.locator('#btnResume').click();
  await page.evaluate(() => rs.step(10));
  assert.equal(await page.evaluate(() => __game.state), 'play');
  assert.ok((await page.evaluate(() => __game.t)) > tBeforePause);

  await page.locator('#btnPause').click();
  await page.locator('#btnRestart').click();
  await page.evaluate(() => rs.step(2));
  const afterRestart = await page.evaluate(() => ({
    state: __game.state,
    paused: __game.paused,
    t: __game.t,
    stats: rs.stats
  }));
  assert.equal(afterRestart.state, 'play');
  assert.equal(afterRestart.paused, false);
  assert.ok(afterRestart.t < 0.5);
  assert.deepEqual(
    afterRestart.stats.map((s) => [s[0], s[1]]),
    [
      ['round', 'spark_1p'],
      ['end', 'quit'],
      ['round', 'spark_1p']
    ]
  );
});

test('title defaults to Easy (6 HP), Enter/Space quick-starts, and sprite baking is cached across frames', async (t) => {
  const page = await openGame(t);
  assert.equal(await page.locator('#diffRow button[data-diff="easy"]').evaluate((b) => b.classList.contains('on')), true);

  // Quick-start from title with Enter
  await page.locator('#game').focus();
  await page.keyboard.press('Enter');
  await page.evaluate(() => rs.step(1));
  assert.equal(await page.evaluate(() => __game.state), 'play');
  assert.equal(await page.evaluate(() => __game.run.mechs[0].maxHp), 6, 'defaults to Easy (6 HP)');

  // Verify sprite cache stops creating offscreen canvases after both anim frames warm up
  const canvasAllocs = await page.evaluate(() => {
    for (let k = 0; k < 5; k++) window.RSEngine.spawnEnemy(__game.run, k, 500 + k * 40, 400);
    rs.step(20);
    let created = 0;
    const orig = Document.prototype.createElement;
    Document.prototype.createElement = function (tag) {
      if (String(tag).toLowerCase() === 'canvas') created++;
      return orig.apply(this, arguments);
    };
    try {
      rs.step(60);
    } finally {
      Document.prototype.createElement = orig;
    }
    return created;
  });
  assert.equal(canvasAllocs, 0, `expected 0 new offscreen canvases across 60 steady frames, got ${canvasAllocs}`);
});

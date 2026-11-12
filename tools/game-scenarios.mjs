/* Real UI smoke scenarios. Debug hooks are read-only here: starting, moving,
 * pausing and restarting all go through the same controls as a player. */
import assert from 'node:assert/strict';
import { animationFrames, waitForFrameTime, waitForGameClock } from './page-wait.mjs';
import { clickControl } from './ui-input.mjs';

const g = 'window.__game';
const select = (expr, fields) => `(() => { const s = ${expr}; return [${fields.map(f => `s.${f}`).join(',')}]; })()`;
const pos = expr => `[${expr}.x,${expr}.y]`;
const hold = (key = 'ArrowRight', ms = 220) => async page => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
const holdUntil = (key, expr, label, timeout = 7000, { retry = false } = {}) => async page => {
  const deadline = Date.now() + timeout;
  let last;
  try {
    do {
      // Release and press again so a focus reset that swallowed the first
      // keydown still produces a new edge the game can see.
      await page.keyboard.up(key).catch(() => {});
      if (retry) {
        await page.evaluate(() => {
          const surface = document.getElementById('gl') || document.querySelector('canvas');
          if (surface) { try { surface.focus({ preventScroll: true }); } catch (e) { surface.focus(); } }
          window.Kit?.keys.reset();
        });
      }
      await page.keyboard.down(key);
      // A software-rendered frame can take longer than a short fixed key hold.
      // Keep the real key down until the simulation consumes it; a broken
      // control still fails the same bounded observable-state assertion.
      const slice = Math.max(1, retry ? Math.min(1500, deadline - Date.now()) : deadline - Date.now());
      try {
        await requireState(page, expr, label, slice);
        return;
      } catch (error) {
        last = error;
        if (!retry || Date.now() >= deadline) break;
      }
    } while (retry);
    throw last;
  } finally { await page.keyboard.up(key).catch(() => {}); }
};
const holdUntilChanged = (key, snapshot) => async page => {
  const before = await page.evaluate(`JSON.stringify(${snapshot})`);
  await holdUntil(key, `JSON.stringify(${snapshot}) !== ${JSON.stringify(before)}`,
    `${key}: held input must change gameplay (${before})`)(page);
};
const click = selector => page => clickControl(page, selector);
const sequence = (...steps) => async page => { for (const step of steps) await step(page); };
const move = async page => { await page.mouse.move(400, 220, { steps: 8 }); await page.waitForTimeout(240); };
const defaults = (start, active, snapshot, input, pause, paused, restart, reset, extra = {}) =>
  ({ start: start.map(step => typeof step === 'function' ? step : click(step)), active, snapshot, input, pause, paused, restart, reset, ...extra });

export const scenarios = {
  // Three.js load (and Edge on a file:// Arabic path) can stall the title past a 5 s
  // click. Wait for the Play button, then click with a longer timeout.
  'dino-3d': defaults([async page => {
    await requireState(page, `!!document.getElementById('play')`, 'dino-3d: title ready', 20000);
    await clickControl(page, '#play', { timeout: 20000 });
  }], `window.Dino3DGame.mode === 'playing'`, `[window.Dino3DGame.state.score,window.Dino3DGame.state.distance,window.Dino3DGame.state.player]`, hold('Space', 180), '#pause-button', `window.Dino3DGame.mode === 'paused'`, '#restart', `window.Dino3DGame.state.score < 10`),
  // A first visit starts world 1, level 1. The runner waits at each edge: only the real key
  // its next stone shows (Space here) counts as a hit and hops it on.
  'key-runner': defaults(['#btnPlay'], `${g}.state.screen === 'play' && ${g}.state.id === 'w1L1'`, `[${g}.state.time,${g}.state.x,${g}.state.hits]`, async page => {
    const before = await page.evaluate(() => window.__game.state.hits);
    for (let i = 0; i < 40 && await page.evaluate(hits => window.__game.state.hits <= hits, before); i++) {
      const key = await page.evaluate(() => window.__game.state.target);
      if (key) await page.keyboard.press(key);
      await page.waitForTimeout(120);
    }
  }, '#btnPause', `${g}.state.screen === 'pause'`, '#btnRestart', `${g}.state.screen === 'play' && ${g}.state.hits === 0 && ${g}.state.next === 1`),
  'rail-rush': defaults(['#playBtn'], `${g}.state.mode === 'play'`, select(`${g}.state`, ['x','y','dist','score','lane']), hold('ArrowRight'), '#pauseBtn', `${g}.state.mode === 'pause' || ${g}.state.mode === 'paused'`, '#restartBtn', `${g}.state.dist < 15`),
  'neon-slope': defaults(['#btnPlay'], `${g}.state.mode === 'play'`, select(`${g}.state`, ['x','y','dist','gemsRun']), holdUntilChanged('ArrowRight', `${g}.state.x`), '#btnPause', `${g}.state.mode === 'paused'`, '#btnRestart', `${g}.state.dist < 15`),
  'tunnel-blitz': defaults(['#playBtn'], `${g}.info().state === 'play'`, select(`${g}.info()`, ['rot','D','score','orbsRun']), hold('ArrowRight'), '#pauseBtn', `${g}.info().state === 'paused'`, '#restartBtn', `${g}.info().D < 15`),
  'beat-dash': defaults(['#b-play','#b-go'], `${g}.scene === 'play' && !${g}.state.paused`, select(`${g}.state`, ['x','y','pct','dead','attempt']), hold('Space', 160), '#b-pause', `${g}.state.paused`, '#b-restart', `${g}.state.pct < 5`),
  'swing-hook': defaults(['#btnPlay'], `${g}.mode === 'play'`, select(`${g}.state()`, ['x','y','timer','hooked']), hold('Space', 200), '#pauseBtn', `${g}.mode === 'pause'`, '#psRestart', `${g}.state().timer < 1`),
  'moto-madness': defaults(['#btnPlay','.mm-tile[data-i="0"]'], `${g}.state === 'play'`, `[${g}.world.bike.x,${g}.world.bike.y,${g}.world.time]`, hold('ArrowUp', 280), '#pauseBtn', `${g}.state === 'paused'`, '#btnRestart', `!${g}.world.started`),
  'drift-king': defaults(['#btnPlay'], `${g}.mode === 'play'`, pos(`${g}.car`), hold('Space'), '#btnPause', `${g}.mode === 'pause' || ${g}.mode === 'paused'`, '#btnRestart', `${g}.car.progress < 1`, {
    beforePause: async page => {
      // Nobody steers the car, so it leaves the road at the first corner about
      // three seconds after Start, which a slow runner's pause click can miss.
      // Begin a fresh run with the player's own P and R shortcuts first.
      if (await evaluate(page, `${g}.mode === 'play'`)) await page.keyboard.press('KeyP');
      await requireState(page, `${g}.mode === 'paused' || ${g}.mode === 'over'`, 'drift-king: run must pause or end before retry');
      // A fresh run builds a new car. Checking for it, not for a distance under
      // one, cannot miss the new run when a slow frame carries the car past 1.
      await page.evaluate(() => { window.sgRetryCar = window.__game.car; });
      const fresh = `${g}.mode === 'play' && ${g}.car !== window.sgRetryCar`;
      // The results screen ignores R for its first 0.45s of game time. One
      // slow frame moves that clock by at most 0.13s, so a wall-clock gap can
      // be spent before the game has caught up. Press R until the fresh run
      // starts, giving the clock 0.2s between presses.
      for (let i = 0; i < 12 && !(await evaluate(page, fresh)); i++) {
        await page.keyboard.press('KeyR');
        await waitForGameClock(page, 0.2, 'drift-king: time between retry presses');
      }
      await requireState(page, fresh, 'drift-king: retry must start a fresh run before pause');
    }
  }),
  'fire-and-ice': defaults(['#playBtn'], `${g}.mode === 'play'`, `[${g}.world.fire.x,${g}.world.ice.x,${g}.world.t]`, hold('ArrowRight'), '#pauseBtn', `${g}.mode === 'paused'`, '#restartBtn', `${g}.world.t < 0.4`),
  'tank-splat': defaults(['[data-act="free"]','[data-act="startFree"]'], `${g}.app.screen === 'game'`, `${g}.app.game.tanks.map(t => [t.x,t.y,t.a,t.score,t.alive])`, hold('KeyD', 300), '#pauseBtn', `${g}.app.screen === 'pause'`, '#scr-pause [data-act="restart"]', `${g}.app.game.state === 'ready' && ${g}.app.game.tanks.every(t => t.score === 0)`, { ready: `${g}.app.game.state === 'play'` }),
  'sumo-bonk': defaults(['#b1p','#bFight'], `${g}.state.scr === 'game' && !${g}.state.paused`, select(`${g}.state`, ['players','roundT','score']), hold('ArrowDown'), '#bPause', `${g}.state.paused`, '#bRestart', `${g}.state.phase === 'intro' && ${g}.state.score.every(n => n === 0)`, { ready: `${g}.state.phase === 'fight'` }),
  'air-hockey': defaults(['#btnPlay'], `!${g}.state().demo && !${g}.state().paused`, select(`${g}.state()`, ['pucks','mallets','score']), move, '#pauseBtn', `${g}.state().paused`, '#btnRestart', `${g}.state().score.every(n => n === 0)`),
  'hoop-heads': defaults(['[data-act="cpu"]','#selGo'], `${g}.state === 'play'`, select(`${g}.info()`, ['time','score','ball','p']), hold('ArrowRight'), '#pauseBtn', `${g}.state === 'pause'`, '#pRestart', `${g}.match.phase === 'intro' && ${g}.match.players.every(p => p.score === 0)`, { ready: `${g}.match.phase === 'play'` }),
  'wacky-soccer': defaults(['#b1p','#bGo'], `${g}.state === 'play'`, `[${g}.match.time,${g}.match.score,${g}.world.players.map(p => [p.x,p.y])]`, hold('Space'), '#bPause', `${g}.state === 'pause'`, '#bRestart', `${g}.match.phase === 'count' && ${g}.match.score.every(n => n === 0)`, { ready: `${g}.match.phase === 'play'` }),
  'pool-party': defaults(['#btnPlay'], `${g}.screen === 'game'`, `[${g}.balls(),${g}.aim,${g}.phase]`, holdUntilChanged('ArrowRight', `${g}.aim`), '#pauseBtn', `${g}.screen === 'pause'`, '#pRestart', `${g}.phase === 'aim' && ${g}.balls().length === 16`, { ready: `${g}.phase === 'aim'` }),
  'skybound-golf': defaults(['#play'], `document.getElementById('title-screen').hidden && document.getElementById('modal').hidden`, `document.getElementById('meters').textContent`, click('#game'), '#pause', `!document.getElementById('pause-content').hidden && !document.getElementById('modal').hidden`, '#restart', `document.getElementById('ui').dataset.phase === 'ready' && document.getElementById('meters').textContent === '0'`),
  'critter-mart': defaults(['#playBtn'], `${g}.mode === 'play'`, select(`${g}.state()`, ['player','coins','play','served']), hold('ArrowRight'), '#pauseBtn', `${g}.mode === 'pause'`, '#resumeBtn', `${g}.mode === 'play'`, { persistent: true }),
  'pizza-clicker': defaults(['#bPlay'], `${g}.mode === 'play'`, `[${g}.S.pizzas,${g}.S.clicks]`, async page => { await page.mouse.click(840, 405); }, '#bPause', `${g}.mode === 'pause'`, '#bResume', `${g}.mode === 'play'`, { persistent: true }),
  'block-world': defaults(['#playBtn','#modeCrea'], `${g}.G.mode === 'play'`, `[${g}.player.x,${g}.player.y,${g}.G.tod]`, hold('ArrowRight'), '#pausebtn', `${g}.G.mode === 'pause'`, '#resumeBtn', `${g}.G.mode === 'play'`, { persistent: true, startIf: ['true', `${g}.G.mode === 'newworld'`] }),
  // Lucky Lake: a first visit goes straight to the village pond. The fish swim by
  // themselves; only the child's own cast (the mouse in the water, a click or Space)
  // moves the hook, and Restart starts a fresh trip with no cast yet.
  'lucky-lake': defaults(['#btnPlay'], `${g}.state.screen === 'play' && ${g}.state.mode === 'solo'`, `[${g}.state.time,${g}.state.p1,${g}.state.fish]`, async page => {
    const point = await page.evaluate(() => window.__game.point(760, 470));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.mouse.click(point.x, point.y);
  }, '#btnPause', `${g}.state.screen === 'pause'`, '#btnRestart', `${g}.state.screen === 'play' && ${g}.state.p1.casts === 0 && ${g}.state.trip === 0`),
  // Cake Guards: click a pad beside the road like a player, then pick popcorn from its menu.
  'cake-guards': defaults(['#btnPlay'], `${g}.state.screen === 'play'`, `[${g}.state.coins,${g}.state.towers,${g}.state.time,${g}.state.wave]`, async page => {
    const pad = await page.evaluate(() => window.__game.padPoint(0));
    await page.mouse.click(pad.x, pad.y);
    await clickControl(page, '#panel .cg-card[data-type="pop"]');
  }, '#btnPause', `${g}.state.screen === 'pause'`, '#btnRestart', `${g}.state.screen === 'play' && ${g}.state.towers === 0 && ${g}.state.wave === 0`),
  'block-burst': defaults(['#btnClassic'], `${g}.state === 'play'`, `[${g}.run.cells,${g}.run.score]`, async page => {
    // A dealt piece can be grabbed only once it has slid into the tray. After Start or a new
    // deal that takes several frames, and a software-rendered frame can take hundreds of ms.
    await page.waitForFunction(() => __game.trayReady || __game.state !== 'play', null, { timeout: 7000, polling: 40 }).catch(() => {});
    const sh = await page.evaluate(() => {
      const mask = BBCore.maskFromBoard(__game.run.cells);
      for (let slot=0;slot<3;slot++) {
        const piece = __game.run.tray[slot]; if (!piece) continue;
        for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (BBCore.fits(mask,piece.shape,r,c))
          return {slot,r,c,w:piece.shape.w,h:piece.shape.h};
      }
      return null;
    });
    if (!sh) { await page.waitForTimeout(180); return; }
    await page.mouse.move([410,640,870][sh.slot],628); await page.mouse.down();
    await page.mouse.move(392 + sh.c*62 + sh.w*31,34 + sh.r*62 + sh.h*31 + 18,{steps:12});
    await page.waitForTimeout(180); await page.mouse.up();
  }, '#btnPause', `${g}.state === 'pause'`, '#btnRestart', `${g}.run.score === 0`),
  'merge-2048': defaults(['#btnPlay'], `${g}.state().screen === 'play'`, select(`${g}.state()`, ['values','score','hist']), sequence(hold('ArrowLeft',80),hold('ArrowDown',80),hold('ArrowRight',80)), '#btnPause', `${g}.state().screen === 'pause'`, '#btnPauseRestart', `${g}.state().score === 0 && ${g}.state().hist === 0`),
  // World 1 needs no click: moving the real mouse onto the ringed bubble pops it.
  'bubble-bop': defaults(['#btnPlay'], `${g}.state.screen === 'play' && ${g}.state.mode === 'touch'`, `[${g}.state.time,${g}.state.hits,${g}.state.targets.map(t => [t.x, t.y])]`, async page => {
    const hits = await page.evaluate(() => window.__game.state.hits);
    await page.waitForFunction(() => window.__game.state.targets.length > 0, null, { timeout: 7000, polling: 40 });
    for (let i = 0; i < 40 && await page.evaluate(hits => window.__game.state.hits <= hits, hits); i++) {
      const point = await page.evaluate(() => window.__game.targetPoint(0));
      if (point) await page.mouse.move(point.x, point.y, { steps: 6 });
      await page.waitForTimeout(80);
    }
  }, '#btnPause', `${g}.state.screen === 'pause'`, '#btnRestart', `${g}.state.screen === 'play' && ${g}.state.hits === 0`, {
    init: () => localStorage.setItem('sg:bubble-bop:save', JSON.stringify({ v: 1, stars: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], best: [0, 0, 0, 0, 0], grip: true, color: 0, hat: 0, seenStars: 0 }))
  }),
  'candy-rope': defaults(['#tPlay'], `${g}.info().state === 'play'`, `${g}.info().world`, async page => {
    const point = await page.evaluate(() => {
      const r = __game.world().ropes.find(r => r.alive);
      if (!r) return null;
      const p = r.pts[Math.floor(r.pts.length / 2)]; return {x:p.x,y:p.y};
    });
    if (!point) { await page.waitForTimeout(180); return; }
    await page.mouse.move(point.x-60,point.y); await page.mouse.down();
    await page.mouse.move(point.x+60,point.y,{steps:15}); await page.mouse.up();
  }, '#bPause', `${g}.info().state === 'pause'`, '#pRestart', `${g}.info().world.stars === 0`, {
    // The sim does not step during the 0.55s intro, so world.frame stays 0.
    // The first step is the intro ending. A 650ms sleep can arrive before that.
    settle: `${g}.info().world.frame >= 1`,
    beforePause: async page => {
      // The first level is solved by the one cut already asserted above.
      // Retry via the player's R shortcut before checking pause so success
      // cannot race the pause click. No debug hook changes the world.
      await page.keyboard.press('KeyR');
      await requireState(page, `${g}.info().state === 'play' && ${g}.info().world.ropes > 0 && ${g}.info().world.stars === 0`,
        'candy-rope: Retry must restore a fresh round before pause');
    }
  }),
  'maze-dash': defaults(['#btn-play'], `${g}.state.screen === 'play'`, select(`${g}.state`, ['px','py','dots','time','hearts']), hold('ArrowRight'), null, `${g}.state.screen === 'pause'`, '#btn-restart', `${g}.state.dots === 0`),
  // The first WebGL frame (and a blocked store) can stall the title past a 5 s
  // click, and a 220 ms ArrowUp can be released before that frame reads it.
  // Wait until the play loop has actually stepped, then hold Up until the hop
  // lands on a higher row. The eagle's autoRow moves by itself and does not count.
  'road-hopper': defaults([async page => {
    await requireState(page, `!!${g} && !!document.getElementById('btnPlay')`, 'road-hopper: title ready', 20000);
    await clickControl(page, '#btnPlay', { timeout: 20000 });
    await page.evaluate(() => { window.sgRoadFrames = window.__game.frames; });
  }], `${g}.state === 'play'`, `${g}.player()`, hold('ArrowUp'), '#btnPause', `${g}.state === 'paused'`, '#btnRestart', `${g}.score === 0`, {
    // autoRow stays put until the first hop, so a new frame is the ready signal.
    settle: `${g}.state === 'play' && ${g}.frames > window.sgRoadFrames`, settleTimeout: 20000,
    inputSnapshot: `${g}.player().row`,
    inputSeen: `${g}.player().row > sgInput.before`,
    retryHold: true
  }),
  'troll-level': defaults(['#btn-play'], `${g}.mode === 'play'`, `${g}.player`, hold('ArrowRight'), '#btn-pause', `${g}.mode === 'pause'`, '#btn-restart', `${g}.mode === 'play'`),
  // Only the child's own keys add to player.walk (the wind, bonks and platforms never do).
  // Restart begins a new match: its first round's picture card, a fresh clock.
  'chaos-island': defaults(['#btnPlay'], `${g}.mode === 'play'`, `[${g}.world.round, ${g}.world.frames, ${g}.player.x, ${g}.player.y]`, hold('ArrowRight'), '#btnPause', `${g}.mode === 'pause'`, '#btnRestart', `${g}.matches > 1 && ${g}.world.round === 0 && ${g}.world.phase === 'card' && ${g}.world.t < 3`, { inputSnapshot: `${g}.player.walk`, inputSeen: `${g}.player.walk > sgInput.before + 8` }),
  'blob-battle': defaults(['#btnPlay'], `${g}.info().state === 'play'`, select(`${g}.info()`, ['T','mass','playerCells','alive','player']), move, '#pauseBtn', `${g}.info().state === 'pause'`, async page => {
    // Observe after the real button handler, in the same event dispatch. A fresh
    // blob can eat nearby golden pellets before a slow runner's next async poll.
    await page.evaluate(() => {
      window.sgBlobRestart = null;
      document.getElementById('btnRestart').addEventListener('click', () => {
        const s = window.__game.info();
        window.sgBlobRestart = { state: s.state, alive: s.alive, playerCells: s.playerCells, mass: s.mass };
      }, { once: true });
    });
    await click('#btnRestart')(page);
  }, `window.sgBlobRestart?.state === 'play' && window.sgBlobRestart.alive && window.sgBlobRestart.playerCells === 1 && window.sgBlobRestart.mass === 20`),
  'paint-grab': defaults(['#bPlay'], `${g}.state === 'play'`, `[${g}.player.x,${g}.player.y,${g}.time()]`, hold('ArrowRight'), '#bPause', `${g}.state === 'pause'`, '#bRestart', `${g}.time() > PG.MATCH_TIME - 1`),
  'snake-arena': defaults(['#btnPlay'], `${g}.state === 'play'`, select(`${g}.player`, ['x','y','len','alive']), move, '#btnPause', `${g}.state === 'paused'`, '#btnRestart', `${g}.player.alive`),
  'splat-strike': defaults(['#playBtn'], `${g}.state.ui === 'play' && !${g}.state.paused`, `[${g}.state.player,${g}.state.matchT]`, hold('KeyW'), '#pauseBtn', `${g}.state.paused`, '#restartBtn', `${g}.state.player.kills === 0 && ${g}.state.player.deaths === 0`, { ready: `${g}.state.countdown === 0`, init: () => { H
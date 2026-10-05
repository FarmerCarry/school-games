/* Real UI smoke scenarios. Debug hooks are read-only here: starting, moving,
 * pausing and restarting all go through the same controls as a player. */
import assert from 'node:assert/strict';

const g = 'window.__game';
const select = (expr, fields) => `(() => { const s = ${expr}; return [${fields.map(f => `s.${f}`).join(',')}]; })()`;
const pos = expr => `[${expr}.x,${expr}.y]`;
const hold = (key = 'ArrowRight', ms = 220) => async page => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
const click = selector => async page => { await page.locator(selector).first().click({ timeout: 5000 }); };
const sequence = (...steps) => async page => { for (const step of steps) await step(page); };
const move = async page => { await page.mouse.move(400, 220, { steps: 8 }); await page.waitForTimeout(240); };
const defaults = (start, active, snapshot, input, pause, paused, restart, reset, extra = {}) =>
  ({ start: start.map(click), active, snapshot, input, pause, paused, restart, reset, ...extra });

export const scenarios = {
  'rail-rush': defaults(['#playBtn'], `${g}.state.mode === 'play'`, select(`${g}.state`, ['x','y','dist','score','lane']), hold('ArrowRight'), '#pauseBtn', `${g}.state.mode === 'pause' || ${g}.state.mode === 'paused'`, '#restartBtn', `${g}.state.dist < 15`),
  'neon-slope': defaults(['#btnPlay'], `${g}.state.mode === 'play'`, select(`${g}.state`, ['x','y','dist','gemsRun']), hold('ArrowRight'), '#btnPause', `${g}.state.mode === 'paused'`, '#btnRestart', `${g}.state.dist < 15`),
  'tunnel-blitz': defaults(['#playBtn'], `${g}.info().state === 'play'`, select(`${g}.info()`, ['rot','D','score','orbsRun']), hold('ArrowRight'), '#pauseBtn', `${g}.info().state === 'paused'`, '#restartBtn', `${g}.info().D < 15`),
  'beat-dash': defaults(['#b-play','#b-go'], `${g}.scene === 'play' && !${g}.state.paused`, select(`${g}.state`, ['x','y','pct','dead','attempt']), hold('Space', 160), '#b-pause', `${g}.state.paused`, '#b-restart', `${g}.state.pct < 5`),
  'swing-hook': defaults(['#btnPlay'], `${g}.mode === 'play'`, select(`${g}.state()`, ['x','y','timer','hooked']), hold('Space', 200), '#pauseBtn', `${g}.mode === 'pause'`, '#psRestart', `${g}.state().timer < 1`),
  'moto-madness': defaults(['#btnPlay','.mm-tile[data-i="0"]'], `${g}.state === 'play'`, `[${g}.world.bike.x,${g}.world.bike.y,${g}.world.time]`, hold('ArrowUp', 280), '#pauseBtn', `${g}.state === 'paused'`, '#btnRestart', `!${g}.world.started`),
  'drift-king': defaults(['#btnPlay'], `${g}.mode === 'play'`, pos(`${g}.car`), hold('Space'), '#btnPause', `${g}.mode === 'pause' || ${g}.mode === 'paused'`, '#btnRestart', `${g}.car.progress < 1`),
  'fire-and-ice': defaults(['#playBtn'], `${g}.mode === 'play'`, `[${g}.world.fire.x,${g}.world.ice.x,${g}.world.t]`, hold('ArrowRight'), '#pauseBtn', `${g}.mode === 'paused'`, '#restartBtn', `${g}.world.t < 0.4`),
  'tank-splat': defaults(['[data-act="free"]','[data-act="startFree"]'], `${g}.app.screen === 'game'`, `${g}.app.game.tanks.map(t => [t.x,t.y,t.a,t.score,t.alive])`, hold('KeyD', 300), '#pauseBtn', `${g}.app.screen === 'pause'`, '#scr-pause [data-act="restart"]', `${g}.app.game.state === 'ready' && ${g}.app.game.tanks.every(t => t.score === 0)`, { ready: `${g}.app.game.state === 'play'` }),
  'sumo-bonk': defaults(['#b1p','#bFight'], `${g}.state.scr === 'game' && !${g}.state.paused`, select(`${g}.state`, ['players','roundT','score']), hold('ArrowUp'), '#bPause', `${g}.state.paused`, '#bRestart', `${g}.state.phase === 'intro' && ${g}.state.score.every(n => n === 0)`, { ready: `${g}.state.phase === 'fight'` }),
  'air-hockey': defaults(['#btnPlay'], `!${g}.state().demo && !${g}.state().paused`, select(`${g}.state()`, ['pucks','mallets','score']), move, '#pauseBtn', `${g}.state().paused`, '#btnRestart', `${g}.state().score.every(n => n === 0)`),
  'hoop-heads': defaults(['[data-act="cpu"]','#selGo'], `${g}.state === 'play'`, select(`${g}.info()`, ['time','score','ball','p']), hold('ArrowRight'), '#pauseBtn', `${g}.state === 'pause'`, '#pRestart', `${g}.match.phase === 'intro' && ${g}.match.players.every(p => p.score === 0)`, { ready: `${g}.match.phase === 'play'` }),
  'wacky-soccer': defaults(['#b1p','#bGo'], `${g}.state === 'play'`, `[${g}.match.time,${g}.match.score,${g}.world.players.map(p => [p.x,p.y])]`, hold('Space'), '#bPause', `${g}.state === 'pause'`, '#bRestart', `${g}.match.phase === 'count' && ${g}.match.score.every(n => n === 0)`, { ready: `${g}.match.phase === 'play'` }),
  'pool-party': defaults(['#btnPlay'], `${g}.screen === 'game'`, `[${g}.balls(),${g}.aim,${g}.phase]`, hold('ArrowRight'), '#pauseBtn', `${g}.screen === 'pause'`, '#pRestart', `${g}.phase === 'aim' && ${g}.balls().length === 16`, { ready: `${g}.phase === 'aim'` }),
  'skybound-golf': defaults(['#play'], `document.getElementById('title-screen').hidden && document.getElementById('modal').hidden`, `document.getElementById('meters').textContent`, click('#hit'), '#pause', `!document.getElementById('pause-content').hidden && !document.getElementById('modal').hidden`, '#restart', `!document.getElementById('swing-controls').hidden && document.getElementById('meters').textContent === '0'`),
  'critter-mart': defaults(['#playBtn'], `${g}.mode === 'play'`, select(`${g}.state()`, ['player','coins','play','served']), hold('ArrowRight'), '#pauseBtn', `${g}.mode === 'pause'`, '#resumeBtn', `${g}.mode === 'play'`, { persistent: true }),
  'pizza-clicker': defaults(['#bPlay'], `${g}.mode === 'play'`, `[${g}.S.pizzas,${g}.S.clicks]`, async page => { await page.mouse.click(840, 405); }, '#bPause', `${g}.mode === 'pause'`, '#bResume', `${g}.mode === 'play'`, { persistent: true }),
  'block-world': defaults(['#playBtn','#modeCrea'], `${g}.G.mode === 'play'`, `[${g}.player.x,${g}.player.y,${g}.G.tod]`, hold('ArrowRight'), '#pausebtn', `${g}.G.mode === 'pause'`, '#resumeBtn', `${g}.G.mode === 'play'`, { persistent: true, startIf: ['true', `${g}.G.mode === 'newworld'`] }),
  'block-burst': defaults(['#btnClassic'], `${g}.state === 'play'`, `[${g}.run.cells,${g}.run.score]`, async page => {
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
  }, '#btnPause', `${g}.state === 'pause'`, '#btnRestart', `${g}.run.score === 0`, { settle: 650 }),
  'merge-2048': defaults(['#btnPlay'], `${g}.state().screen === 'play'`, select(`${g}.state()`, ['values','score','hist']), sequence(hold('ArrowLeft',80),hold('ArrowDown',80),hold('ArrowRight',80)), '#btnPause', `${g}.state().screen === 'pause'`, '#btnPauseRestart', `${g}.state().score === 0 && ${g}.state().hist === 0`),
  'candy-rope': defaults(['#tPlay'], `${g}.info().state === 'play'`, `${g}.info().world`, async page => {
    const point = await page.evaluate(() => {
      const r = __game.world().ropes.find(r => r.alive);
      if (!r) return null;
      const p = r.pts[Math.floor(r.pts.length / 2)]; return {x:p.x,y:p.y};
    });
    if (!point) { await page.waitForTimeout(180); return; }
    await page.mouse.move(point.x-60,point.y); await page.mouse.down();
    await page.mouse.move(point.x+60,point.y,{steps:15}); await page.mouse.up();
  }, '#bPause', `${g}.info().state === 'pause'`, '#pRestart', `${g}.info().world.stars === 0`, { settle: 650 }),
  'maze-dash': defaults(['#btn-play'], `${g}.state.screen === 'play'`, select(`${g}.state`, ['px','py','dots','time','hearts']), hold('ArrowRight'), null, `${g}.state.screen === 'pause'`, '#btn-restart', `${g}.state.dots === 0`),
  'road-hopper': defaults(['#btnPlay'], `${g}.state === 'play'`, `${g}.player()`, hold('ArrowUp'), '#btnPause', `${g}.state === 'paused'`, '#btnRestart', `${g}.score === 0`),
  'troll-level': defaults(['#btn-play'], `${g}.mode === 'play'`, `${g}.player`, hold('ArrowRight'), '#btn-pause', `${g}.mode === 'pause'`, '#btn-restart', `${g}.mode === 'play'`),
  'blob-battle': defaults(['#btnPlay'], `${g}.info().state === 'play'`, select(`${g}.info()`, ['T','mass','playerCells','alive','player']), move, '#pauseBtn', `${g}.info().state === 'pause'`, '#btnRestart', `${g}.info().alive && ${g}.info().playerCells === 1 && ${g}.info().mass < 30`),
  'paint-grab': defaults(['#bPlay'], `${g}.state === 'play'`, `[${g}.player.x,${g}.player.y,${g}.time()]`, hold('ArrowRight'), '#bPause', `${g}.state === 'pause'`, '#bRestart', `${g}.time() > PG.MATCH_TIME - 1`),
  'snake-arena': defaults(['#btnPlay'], `${g}.state === 'play'`, select(`${g}.player`, ['x','y','len','alive']), move, '#btnPause', `${g}.state === 'paused'`, '#btnRestart', `${g}.player.alive`),
  'splat-strike': defaults(['#playBtn'], `${g}.state.ui === 'play' && !${g}.state.paused`, `[${g}.state.player,${g}.state.matchT]`, hold('KeyW'), '#pauseBtn', `${g}.state.paused`, '#restartBtn', `${g}.state.player.kills === 0 && ${g}.state.player.deaths === 0`, { ready: `${g}.state.countdown === 0`, init: () => { HTMLCanvasElement.prototype.requestPointerLock = undefined; } }),
  'typing-test': {
    start: [async page => { await page.keyboard.press('Enter'); }], active: `${g}.state().screen === 'test'`, snapshot: select(`${g}.state()`, ['input','cur','correctKeys','incorrectKeys']),
    input: async page => { await page.keyboard.type(await page.evaluate(() => __game.words(1)[0].slice(0,3))); },
    pause: async page => { await page.evaluate(() => window.dispatchEvent(new Event('blur'))); }, paused: `${g}.state().unfocused`,
    restart: async page => { await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); }, reset: `${g}.state().phase === 'ready' && ${g}.state().input === ''`
  }
};
for (const slug of ['connect-four','tic-tac-toe']) scenarios[slug] = {
  start: [click('#localButton')], active: `document.getElementById('boardApp').dataset.mode === 'local' && document.getElementById('gameBoard').dataset.winner === '0' && document.getElementById('gameBoard').dataset.draw !== 'true'`,
  snapshot: `document.getElementById('gameBoard').dataset.moves`, input: click('[data-move="0"]'),
  pause: '#pauseButton', paused: `!document.getElementById('pauseLayer').hidden`,
  restart: sequence(click('#leaveMatch'),click('#localButton')), reset: `document.getElementById('gameBoard').dataset.moves === '0'`
};

// Compare the part controlled by this input separately from the broader snapshot
// used to catch simulation advancing while paused. A running clock is not proof
// that a movement control works.
const inputSnapshots = {
  'rail-rush': `${g}.state.lane`, 'neon-slope': `${g}.state.x`, 'tunnel-blitz': `${g}.info().rot`,
  'beat-dash': `${g}.state.y`, 'drift-king': `${g}.car.head`, 'fire-and-ice': `${g}.world.fire.x`,
  'moto-madness': `${g}.world.bike.x`, 'tank-splat': `${g}.app.game.tanks[0].a`,
  'sumo-bonk': `[${g}.state.players[0].y,${g}.state.players[0].action]`,
  'air-hockey': `${g}.state().mallets[0]`, 'hoop-heads': `${g}.info().p[0].x`,
  'wacky-soccer': `${g}.world.players.filter(p => p.side === 0).map(p => p.y)`,
  'pool-party': `${g}.aim`, 'critter-mart': `${g}.state().player`,
  'block-world': `${g}.player.x`, 'candy-rope': `${g}.world().ropes.filter(r => r.alive).length`,
  'maze-dash': `[${g}.state.px,${g}.state.py,${g}.state.dots]`,
  'blob-battle': `${g}.info().player`, 'splat-strike': `[${g}.state.player.x,${g}.state.player.z]`
};
for (const [slug, expr] of Object.entries(inputSnapshots)) scenarios[slug].inputSnapshot = expr;

async function evaluate(page, expr) { return page.evaluate(expr); }
async function requireState(page, expr, label) {
  try { await page.waitForFunction(expr, null, { timeout: 7000, polling: 40 }); }
  catch (error) { throw new Error(`${label}: ${expr}`, { cause: error }); }
}
async function focusSurface(page) { await page.evaluate(() => { document.activeElement?.blur(); window.Kit?.keys.reset(); }); }
export async function prepareScenario(page, slug) {
  const s = scenarios[slug];
  assert.ok(s, `No gameplay scenario for ${slug}`);
  if (s.init) await page.addInitScript(s.init);
}
async function start(page, slug, s) {
  await requireState(page, '!!window.Kit && (!!window.__game || !!document.getElementById("boardApp") || !!window.GolfArt)', `${slug}: initialized`);
  for (let i=0;i<s.start.length;i++) if (!s.startIf || await evaluate(page,s.startIf[i])) await s.start[i](page);
  await focusSurface(page);
  await requireState(page,s.active,`${slug}: Start must reach gameplay`);
  if (s.ready) await requireState(page,s.ready,`${slug}: countdown must reach active play`);
  if (s.settle) await page.waitForTimeout(s.settle);
}
export async function performInput(page, slug, {repeat = false} = {}) {
  const s = scenarios[slug];
  await focusSurface(page);
  if (repeat && (slug === 'connect-four' || slug === 'tic-tac-toe')) {
    const legal = page.locator('[data-move]:enabled');
    if (await legal.count()) await legal.first().click();
  } else if (repeat && slug === 'skybound-golf') {
    if (await page.locator('#hit').isVisible()) await click('#hit')(page);
    else await page.waitForTimeout(250);
  } else if (repeat && slug === 'pool-party') {
    if (await evaluate(page,`${g}.phase === 'aim'`)) await hold('Space',650)(page);
    else await page.waitForTimeout(250);
  } else await s.input(page);
  await page.waitForTimeout(120);
}
export async function ensureActive(page, slug) {
  const s = scenarios[slug];
  if (await evaluate(page,s.active)) return false;
  await page.reload({waitUntil:'load'});
  await start(page,slug,s);
  return true;
}
export async function runScenario(page, slug, { mode = 'smoke' } = {}) {
  const s = scenarios[slug];
  assert.ok(s, `No gameplay scenario for ${slug}`);
  const checks = [];
  await start(page,slug,s); checks.push('Start reaches active gameplay');
  const inputSnapshot = s.inputSnapshot || s.snapshot;
  const before = await evaluate(page,`JSON.stringify(${inputSnapshot})`);
  await performInput(page,slug);
  const after = await evaluate(page,`JSON.stringify(${inputSnapshot})`);
  assert.notEqual(after,before,`${slug}: primary input must change gameplay (${before})`);
  checks.push('Primary input changes gameplay');
  if (mode === 'performance') return {slug,checks};
  if (!s.noPause) {
    await focusSurface(page);
    if (typeof s.pause === 'function') await s.pause(page);
    else if (s.pause) await click(s.pause)(page); else await page.keyboard.press('Escape');
    await requireState(page,s.paused,`${slug}: Pause must open`);
    // Let pending events settle before comparing meaningful simulation state.
    await page.waitForTimeout(80);
    const paused = await evaluate(page,`JSON.stringify(${s.snapshot})`);
    await page.waitForTimeout(350);
    assert.equal(await evaluate(page,`JSON.stringify(${s.snapshot})`),paused,`${slug}: gameplay must freeze while paused`);
    checks.push('Pause freezes gameplay');
  } else checks.push(s.noPause);
  if (typeof s.restart === 'function') await s.restart(page); else await click(s.restart)(page);
  await requireState(page,s.active,`${slug}: Restart/resume must return to play`);
  await requireState(page,s.reset,`${slug}: Restart must reset round state`);
  checks.push(s.persistent ? 'Resume returns to persistent world (no destructive reset)' : 'Restart resets round state');
  return {slug,checks};
}

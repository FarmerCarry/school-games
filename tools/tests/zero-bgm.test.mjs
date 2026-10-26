// Zero background music (docs/ARCHITECTURE.md, "Zero-BGM policy"): no catalog game may
// start a sound while the child only looks at its title screen or its pause screen.
// Every AudioScheduledSourceNode.start() call (oscillators and constant sources; buffer
// sources have their own start()) and every media element play() is counted in an idle
// window on the title screen, after audio is unlocked, and in an idle window on the pause
// screen, after the game's own scenario (tools/game-scenarios.mjs) has started play and
// paused it. A music loop, a step scheduler or a repeating jingle starts sources all the
// time; one-shot SFX from the gesture or the Pause click are over before the window opens;
// a continuous sound tied to the player's input (an engine, a rolling ball, wind while
// steering) is started once and only changes its level, so it never counts.
//
// Audio is unlocked the way a child does it: a key press no game uses (F2; Kit unlocks on
// every keydown) and a primary click in the top-left corner, away from every control (some
// games start their title music on the first click). The test checks that neither starts
// or leaves play. Special flows, taken from each game's scenario:
// - dino-3d and skybound-golf get no click: their whole title is a canvas, and a click is
//   the first jump or swing, which starts play.
// - typing-test has no title screen: its first screen is the ready test, which is where a
//   child idles, and its pause is the "click to continue" state after focus leaves.
// - connect-four and tic-tac-toe start on their two-choice mode menu (their title).
// - maze-dash has no Pause button: Esc pauses it, as in runScenario.
// - drift-king and candy-rope first run their scenario's beforePause step (a fresh run or
//   round), so a slow runner cannot reach the results screen instead of the pause screen.
// - A scenario with noPause has no pause screen at all; only its title is checked.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';
import { prepareScenario, scenarios } from '../game-scenarios.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), sandbox);
const games = sandbox.window.GAMES.map(g => g.slug);

// 4 s, not 3: a sparse ambient bed that plays a few notes every 2.6-6 s is heard in
// nearly every window of this length.
const IDLE_MS = 4000;
// The longest allowed one-shot cue is about 2 s, and a cue calls start() for all of its
// notes when it begins (later notes get a later start time), so 2 s also covers cues
// that queue a note or two on short timers.
const TAIL_MS = 2000;
// Several pages share the CPU with software WebGL, so a countdown or a first frame can
// take far longer than on a school PC; waits are generous, only the idle windows count.
const SLOW_MS = 60000;
const CLICK_PLAYS = new Set(['dino-3d', 'skybound-golf']);
// Pages run side by side in one browser: each game spends most of its time waiting.
const PAGES = Math.max(2, Math.min(4, os.availableParallelism()));
const FIXTURE = '/zero-bgm-fixture';
// A deliberately musical page: proves that the counter hears both kinds of source.
const fixturePage = `<!doctype html><html><body><script>
addEventListener('keydown', () => {
  if (window.ac) return;
  const ac = window.ac = new AudioContext(), noise = ac.createBuffer(1, 2205, 44100), out = ac.createGain();
  out.gain.value = 0.001; out.connect(ac.destination);
  setInterval(() => {
    const o = ac.createOscillator(), n = ac.createBufferSource();
    n.buffer = noise; o.connect(out); n.connect(out);
    o.start(); o.stop(ac.currentTime + 0.05); n.start(); n.stop(ac.currentTime + 0.05);
  }, 250);
});
</script></body></html>`;

let browser, server;
before(async () => {
  server = await startTestServer(root, { pages: { [FIXTURE]: fixturePage } });
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

function instrument() {
  const starts = window.sgStarts = [], contexts = window.sgContexts = [];
  const count = (proto, name) => {
    const d = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.value !== 'function') return;
    const real = d.value;
    Object.defineProperty(proto, name, { ...d, value: function (...args) {
      starts.push([performance.now(), this.constructor.name]);
      return real.apply(this, args);
    } });
  };
  count(window.AudioScheduledSourceNode?.prototype, 'start');
  count(window.AudioBufferSourceNode?.prototype, 'start');
  count(window.HTMLMediaElement?.prototype, 'play');
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const AC = window[name];
    if (AC) window[name] = new Proxy(AC, { construct(target, args, newTarget) {
      const ac = Reflect.construct(target, args, newTarget); contexts.push(ac); return ac;
    } });
  }
}

async function requireState(page, expr, label, timeout = SLOW_MS) {
  try { await page.waitForFunction(expr, null, { timeout, polling: 50 }); }
  catch (error) { throw new Error(`${label}: ${expr}`, { cause: error }); }
}
// Starts in the next IDLE_MS, as "+ms Kind" (ms after the window opened). A loaded runner
// draws few frames, and a game loop advances at most about 133 ms of game time per frame
// (Kit.loop runs 8 steps), so the window also lasts until the frames add up to IDLE_MS of
// game time (at most twice as long): a game-clock timer gets its full chance to fire.
async function idleStarts(page) {
  const t0 = await page.evaluate(() => {
    const w = window.sgIdle = { t0: performance.now(), game: 0, last: 0 };
    const frame = now => {
      if (window.sgIdle !== w) return;
      if (w.last) w.game += Math.min(now - w.last, 8000 / 60);
      w.last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return w.t0;
  });
  await page.waitForTimeout(IDLE_MS);
  await page.waitForFunction(ms => window.sgIdle.game >= ms, IDLE_MS, { timeout: IDLE_MS, polling: 100 }).catch(() => {});
  const t1 = await page.evaluate(() => performance.now());
  return page.evaluate(([t0, t1]) => window.sgStarts.filter(s => s[0] >= t0 && s[0] <= t1)
    .map(s => `+${Math.round(s[0] - t0)}ms ${s[1]}`), [t0, t1]);
}
async function unlockAudio(page, click) {
  await page.keyboard.press('F2');
  if (click) await page.mouse.click(3, 3);
  await requireState(page, `window.sgContexts.some(ac => ac.state === 'running')`, 'the gesture must unlock a running AudioContext', 5000);
}
const summary = list => list.length ? `${list.length} starts (${list.slice(0, 6).join(', ')}${list.length > 6 ? ', …' : ''})` : 'none';

test('the start counter hears a page that plays a loop', async t => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.addInitScript(instrument);
  await page.goto(server.origin + FIXTURE);
  await unlockAudio(page, false);
  const heard = await idleStarts(page);
  assert.ok(heard.some(s => s.endsWith('OscillatorNode')), 'oscillator starts are counted: ' + summary(heard));
  assert.ok(heard.some(s => s.endsWith('AudioBufferSourceNode')), 'buffer source starts are counted: ' + summary(heard));
});

describe('no catalog game plays background music on its title or pause screen', { concurrency: PAGES }, () => {
  for (const slug of games) test(slug, async t => {
    const s = scenarios[slug];
    assert.ok(s, `${slug} needs a gameplay scenario in tools/game-scenarios.mjs`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    t.after(() => context.close());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(instrument);
    await prepareScenario(page, slug);
    // A heavy page can take longer than the default 30 s to fire "load" here, so wait
    // for the scenario runner's own readiness condition instead.
    await page.goto(`${server.origin}/games/${slug}/index.html`, { waitUntil: 'commit' });
    await requireState(page, '!!window.Kit && (!!window.__game || !!document.getElementById("boardApp") || !!window.GolfArt || !!window.Dino3DGame)', `${slug}: initialized`, 90000);

    const wasActive = await page.evaluate(s.active);
    await unlockAudio(page, !CLICK_PLAYS.has(slug));
    assert.equal(await page.evaluate(s.active), wasActive, `${slug}: the unlock gesture must not start or leave play`);
    assert.equal(await page.evaluate(() => window.Kit.audio.muted), false, `${slug}: a muted game would schedule nothing`);
    await page.waitForTimeout(TAIL_MS);
    const title = await idleStarts(page);

    let paused = [];
    for (let i = 0; i < s.start.length; i++) if (!s.startIf || await page.evaluate(s.startIf[i])) await s.start[i](page);
    await page.evaluate(() => { document.activeElement?.blur(); window.Kit?.keys.reset(); });
    await requireState(page, s.active, `${slug}: Start must reach gameplay`);
    if (s.ready) await requireState(page, s.ready, `${slug}: countdown must reach active play`);
    if (!s.noPause) {
      if (s.beforePause) await s.beforePause(page);
      if (typeof s.pause === 'function') await s.pause(page);
      else if (s.pause) await clickControl(page, s.pause); else await page.keyboard.press('Escape');
      await requireState(page, s.paused, `${slug}: Pause must open`);
      await page.waitForTimeout(TAIL_MS);
      paused = await idleStarts(page);
    } else t.diagnostic(`${slug} has no pause screen (${s.noPause}); only its title is checked`);

    assert.deepEqual({ title: summary(title), pause: summary(paused), errors },
      { title: 'none', pause: 'none', errors: [] }, `${slug}: sound sources started while idle`);
  });
});

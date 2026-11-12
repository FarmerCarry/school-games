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
  // ... rest of the file continues with all other scenarios ...
}
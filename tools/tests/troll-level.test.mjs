import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { waitForCondition } from '../page-wait.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

// The game's loop is stepped by hand (update + render), so the checks do not
// depend on how fast the software renderer draws frames. stepGame(n, true)
// renders only the last of the n frames.
async function game(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...options });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1, drawLast = false) => {
          for (let i = 0; i < n; i++) { update(1 / 60); if (!drawLast || i === n - 1) render(0); }
        };
        return { stop() {} };
      };
    } });
  });
  await page.goto(`${server.origin}/games/troll-level/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}
const where = page => page.evaluate(() => `${__game.mode}:${__game.level}`);

test('Continue moves on past a skipped level instead of sending the player back', async t => {
  const page = await game(t);
  await clickControl(page, '#btn-play');
  assert.equal(await where(page), 'play:0');
  await page.evaluate(() => __game.setDeaths(10));
  await clickControl(page, '#btn-pause');
  await page.locator('#btn-skip').click();
  assert.equal(await where(page), 'play:1');
  await clickControl(page, '#btn-pause');
  await page.locator('#btn-p-menu').click();
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  await clickControl(page, '#btn-play');
  assert.equal(await where(page), 'play:1', 'the skipped level stays in the level select');
});

test('a save from before the space world continues into it, and its levels play through to the end', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    // All 24 old levels won; back then level 24 was the last one to unlock.
    const set = (key, value) => localStorage.setItem('sg:troll-level:' + key, JSON.stringify(value));
    set('best', Array(24).fill(0)); set('stars', Array(24).fill(3)); set('unl', 23); set('last', 23); set('ended', true);
  });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.equal(await page.evaluate(() => __game.save.unl), 24, 'beating level 24 unlocks level 25');
  assert.equal(await page.locator('#t-levels').textContent(), '24/30');
  assert.equal(await page.locator('#t-stars-max').textContent(), '/90');
  assert.equal(await page.locator('#btn-play').textContent(), 'تابع!');
  await clickControl(page, '#btn-play');
  assert.equal(await where(page), 'play:24', 'Continue opens the first space level');
  // Each new level is won through the real game loop (sounds, HUD and traps included).
  for (let i = 24; i < 30; i++) {
    await page.evaluate(i => { __game.start(i); __game.solve(); }, i);
    await page.evaluate(() => { for (let f = 0; f < 120 && __game.mode === 'play'; f++) stepGame(10, true); });
    assert.equal(await where(page), `win:${i}`, `level ${i + 1} is won by its recorded solution`);
  }
  assert.equal(await page.locator('#w-lvl').textContent(), 'عالم الفضاء · المرحلة 30');
  await clickControl(page, '#btn-next');
  assert.equal(await page.evaluate(() => __game.mode), 'end');
  assert.equal(await page.locator('#e-stars').textContent(), '90/90');
  // Finish this finite entrance animation before sampling the button's center. Waiting for it
  // timed out on a loaded CI runner: it stays pending until the compositor draws a frame.
  assert.equal(await page.evaluate(() => {
    const animations = document.querySelector('#scr-end .panel').getAnimations();
    animations.forEach(animation => animation.finish());
    return animations.every(animation => animation.effect.getComputedTiming().endTime !== Infinity);
  }), true, 'the end panel has only finite entrance animations');
  await clickControl(page, '#btn-e-levels');
  assert.equal(await page.locator('#worlds .wrow').count(), 5);
  assert.equal(await page.locator('#worlds .lv:not(.locked)').count(), 30);
});

test('denied saves warn, keep progress in memory and clear only after a full retry', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('sg:troll-level:')) throw new DOMException('full', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
  });
  await clickControl(page, '#btn-play');
  const [top, bottom] = await page.evaluate(() => {
    const box = document.querySelector('.sg-save-status').getBoundingClientRect();
    const cv = document.getElementById('cv').getBoundingClientRect(), s = cv.width / 1280;
    return [(box.top - cv.top) / s, (box.bottom - cv.top) / s];
  });
  assert.ok(top > 56 && bottom < 120, `while playing, the warning waits on the ceiling under the HUD, clear of the hint bar (${top}-${bottom})`);
  for (const [width, height] of [[1100, 620], [900, 520]]) {
    await page.setViewportSize({ width, height });
    const gap = await page.evaluate(() => document.querySelector('.sg-save-status').getBoundingClientRect().top
      - document.getElementById('btn-pause').getBoundingClientRect().bottom);
    assert.ok(gap >= 3, `the warning stays clear of the pause button at ${width}x${height} (${gap})`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => { __game.win(); stepGame(120); });
  assert.equal(await page.evaluate(() => __game.mode), 'win');
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:troll-level:unl')), null);
  assert.equal(await page.evaluate(() => __game.save.unl), 1);
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.deepEqual(await page.evaluate(() => [__game.save.unl, __game.save.stars[0]]), [1, 3]);
});

test('a level is saved when the door is reached, before the win panel opens, and the title demo saves nothing', async t => {
  const page = await game(t);
  const saved = () => page.evaluate(() => ['best', 'stars', 'unl'].map(k => JSON.parse(localStorage.getItem('sg:troll-level:' + k))));
  await page.evaluate(() => {
    window.ends = [];
    const end = Kit.stats.end;
    Kit.stats.end = function () { ends.push([...arguments]); return end.apply(this, arguments); };
    // The attract demo on the title reaches its own door after about 9 s.
    for (let f = 0; f < 900; f++) stepGame(1, true);
  });
  assert.deepEqual(await page.evaluate(() => [Object.keys(localStorage).filter(k => k.startsWith('sg:troll-level:')), ends]), [[], []]);
  await page.evaluate(() => { __game.start(0); stepGame(150); __game.win(); });
  await page.evaluate(() => { for (let f = 0; f < 120 && __game.player.state !== 'win'; f++) stepGame(1); });
  assert.equal(await page.evaluate(() => __game.mode), 'play', 'the win panel waits 0.9 s');
  const atDoor = await saved();
  assert.deepEqual([atDoor[0][0], atDoor[1][0], atDoor[2]], [0, 3, 1], 'the stars and the next level are stored at the door');
  assert.deepEqual(await page.evaluate(() => ends), [['win', 3]]);
  await page.evaluate(() => stepGame(60));
  assert.equal(await page.evaluate(() => __game.mode), 'win');
  assert.deepEqual([await page.locator('#w-best').textContent(), await page.locator('#w-newbest').isHidden()], ['0', true]);
  assert.deepEqual(await saved(), atDoor, 'the panel only shows the stored result');
  assert.equal(await page.evaluate(() => ends.length), 1, 'the win is reported once');
});

test('a settled pause stops redrawing until a resize, and reduced motion skips the flash', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.draws = 0; window.flashes = 0;
    const ctx = document.getElementById('cv').getContext('2d'), draw = ctx.drawImage, fill = ctx.fillRect;
    ctx.drawImage = function () { window.draws++; return draw.apply(this, arguments); };
    ctx.fillRect = function (x, y, w, h) {
      if (w === 1280 && h === 720 && this.fillStyle === '#ffffff') window.flashes++;
      return fill.apply(this, arguments);
    };
  });
  await clickControl(page, '#btn-play');
  await page.evaluate(() => stepGame(240)); // the intro card and level message finish
  await clickControl(page, '#btn-pause');
  const [paused, later] = await page.evaluate(() => { stepGame(5); const a = draws; stepGame(60); return [a, draws]; });
  assert.ok(paused > 0);
  assert.equal(later, paused, 'a still paused scene is not redrawn every frame');
  await page.setViewportSize({ width: 1100, height: 620 });
  const redrawn = await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    const a = draws; stepGame(10); return draws - a;
  });
  assert.equal(redrawn, 1, 'a resize repaints the paused scene once');
  // The pause panel scales in over 300ms. A click during that pop can miss
  // the button even though it is already in the DOM.
  await waitForCondition(page, () => {
    const panel = document.querySelector('#scr-pause .panel');
    const button = document.getElementById('btn-resume');
    if (!panel || !button) return false;
    const settling = panel.getAnimations().some(animation => {
      const timing = animation.effect && animation.effect.getComputedTiming();
      return timing && timing.iterations !== Infinity && animation.playState === 'running';
    });
    if (settling) return false;
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return box.width > 0 && (hit === button || button.contains(hit));
  }, null, 'pause panel finished popping in', 5000);
  await clickControl(page, '#btn-resume');
  assert.equal(await page.evaluate(() => { const a = draws; stepGame(3); return draws - a; }), 3);

  async function dieOnce() {
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => { for (let i = 0; i < 900 && __game.deaths < 1; i++) stepGame(1); stepGame(2); });
    await page.keyboard.up('ArrowRight');
    assert.equal(await page.evaluate(() => __game.deaths), 1);
  }
  await page.evaluate(() => { Kit.motion.setPreference('reduce'); __game.start(0); });
  await dieOnce();
  assert.equal(await page.evaluate(() => flashes), 0, 'no full-screen flash with reduced motion');
  await page.evaluate(() => { Kit.motion.setPreference('full'); __game.start(0); });
  await dieOnce();
  assert.ok(await page.evaluate(() => flashes) > 0, 'full motion keeps the death flash');
});

test('the baked level canvas is rebaked when its context comes back', async t => {
  const page = await game(t);
  const alpha = await page.evaluate(() => {
    const ctx = document.getElementById('cv').getContext('2d'), draw = ctx.drawImage;
    ctx.drawImage = function (image) { window.baked = image; return draw.apply(this, arguments); };
    __game.start(0); stepGame(1);
    const centre = () => baked.getContext('2d').getImageData(baked.width >> 1, baked.height >> 1, 1, 1).data[3];
    baked.width = baked.width; // a GPU reset leaves the canvas blank
    const lost = centre();
    baked.dispatchEvent(new Event('contextrestored')); stepGame(1);
    return [lost, centre()];
  });
  assert.deepEqual(alpha, [0, 255], 'the level background is painted again');
});

test('after a mouse click on a pause-panel button, P still pauses and resumes and Enter does not click it again', async t => {
  const page = await game(t);
  await clickControl(page, '#btn-play');
  await clickControl(page, '#btn-pause');
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  await page.evaluate(() => stepGame(10)); // past the short guard after pausing
  // Every pause-panel button leaves the panel (there is no music toggle any more), so the
  // restart button stands in for them: a mouse click must give the keyboard back.
  await page.locator('#btn-restart').click();
  assert.equal(await page.evaluate(() => __game.mode), 'play');
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'btn-restart', 'the clicked button gives focus back');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => stepGame(30));
  await page.keyboard.up('ArrowRight');
  const moved = await page.evaluate(() => __game.player.x);
  await page.keyboard.press('p');
  await page.evaluate(() => stepGame(1));
  assert.equal(await page.evaluate(() => __game.mode), 'pause', 'P reaches the game after the mouse click');
  await page.evaluate(() => stepGame(10));
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => __game.player.x), moved, 'Enter does not click the restart button again');
  await page.keyboard.press('p');
  await page.evaluate(() => stepGame(1));
  assert.equal(await page.evaluate(() => __game.mode), 'play');
});

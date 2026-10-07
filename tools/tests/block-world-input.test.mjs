import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
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

// Deterministic Block World with a fixed-step loop (stepGame) and a fresh adventure world.
async function adventure(t) {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = update => { window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); }; return { stop() {} }; };
    } });
  });
  await page.goto(`${origin}/games/block-world/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  await page.evaluate(() => { document.getElementById('playBtn').click(); document.getElementById('modeSurv').click(); });
  await page.waitForFunction(() => __game.G.mode === 'play');
  await page.evaluate(() => {
    // Mouse helper: aim at a world point (re-aimed every step, since the camera eases) and press.
    window.clickAt = (wx, wy, button, steps) => {
      const M = __game.input, G = __game.G;
      for (let i = 0; i < steps; i++) {
        M.x = (wx - G.cam.x) * BW.TS; M.y = (wy - G.cam.y) * BW.TS;
        if (i === 0) { if (button === 2) { M.right = M.rp = true; } else { M.left = M.lp = true; } }
        stepGame();
      }
      M.left = M.right = false;
      stepGame();
    };
  });
  return page;
}

test('Block World chops a guided trunk with an animal in front, and still pets animals', async t => {
  const page = await adventure(t);
  const result = await page.evaluate(() => {
    const G = __game.G, P = __game.player, B = BW.B;
    stepGame(90);
    const g = __game.guide;
    // Stand two tiles left of the guided tree and let the camera settle.
    const px = g.x - 2;
    __game.tp(px, __game.surfaceY(px) - P.h - 0.01);
    stepGame(240);
    // Park an animal right in front of the trunk base the guide arrow points at.
    const a = G.animals[0];
    const park = (x, y) => { a.x = x + 0.5 - a.w / 2; a.y = y + 1 - a.h; a.vx = a.vy = 0; a.dir = 0; a.timer = 999; a.petCD = 0; };
    park(g.x, g.y);
    const tile = [g.x + 0.5, g.y + 0.5];
    // Right-click still pets (or shears) the animal and leaves the tree alone.
    clickAt(tile[0], tile[1], 2, 2);
    const afterRight = { pets: G.stats.pets, trunk: G.world.get(g.x, g.y) === B.TRUNK };
    park(g.x, g.y);
    // Holding the left button on the trunk chops it instead of petting.
    clickAt(tile[0], tile[1], 0, 150);
    const afterLeft = { pets: G.stats.pets, mined: G.stats.mined[B.TRUNK] || 0 };
    // Left-click on an animal standing on open grass still pets it.
    let gx = px - 2;
    while (G.world.get(gx, __game.surfaceY(gx) - 1) !== 0) gx--;
    park(gx, __game.surfaceY(gx) - 1);
    clickAt(gx + 0.5, __game.surfaceY(gx) - 0.5, 0, 2);
    return { afterRight, afterLeft, grassPets: G.stats.pets };
  });
  assert.deepEqual(result.afterRight, { pets: 1, trunk: true });
  assert.equal(result.afterLeft.pets, 1);
  assert.ok(result.afterLeft.mined > 0, 'the trunk should be chopped');
  assert.equal(result.grassPets, 2);
});

test('Block World tells the player which hotbar slot holds the item a place quest needs', async t => {
  const page = await adventure(t);
  const result = await page.evaluate(() => {
    const G = __game.G, P = __game.player, B = BW.B;
    ['logs', 'planks', 'table'].forEach(id => { G.done[id] = true; });
    G.inv.fill(null);
    __game.give(B.LOG, 3);
    __game.give(B.TABLE, 1);
    G.sel = 0;
    stepGame(30);
    const px = Math.floor(P.x + P.w / 2), ground = __game.surfaceY(px + 2);
    // Right-clicking a spot where the selected logs cannot go names the slot to press.
    clickAt(px + 2.5, ground + 0.5, 2, 2);
    const hint = G.hint && G.hint.s;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
    stepGame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' }));
    clickAt(px + 2.5, ground - 0.5, 2, 2);
    return { hint, sel: G.sel, placed: G.stats.placed[B.TABLE] || 0 };
  });
  assert.match(result.hint, /طاولة الصنع/);
  assert.match(result.hint, /2/);
  assert.equal(result.sel, 1);
  assert.equal(result.placed, 1);
});

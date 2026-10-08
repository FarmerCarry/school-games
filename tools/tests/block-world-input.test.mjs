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
    const press = code => { window.dispatchEvent(new KeyboardEvent('keydown', { code })); stepGame(); window.dispatchEvent(new KeyboardEvent('keyup', { code })); };
    const slotDown = (el, shiftKey = false) => el.dispatchEvent(new MouseEvent('mousedown', { button: 0, shiftKey, bubbles: true }));
    const slotUp = el => el.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    const state = () => ({ cursor: G.cursor && G.cursor.id, table: G.inv[1] && G.inv[1].id === B.TABLE, marks: document.querySelectorAll('.qslot').length, drop: hot.classList.contains('qdrop'), tip: hotTip.textContent });
    const bag = document.getElementById('bag'), hot = document.getElementById('hot'), hotTip = document.getElementById('hotTip');
    ['logs', 'planks', 'table'].forEach(id => { G.done[id] = true; });
    // A full hotbar sends the crafted table to the backpack (slot 10).
    G.inv.fill(null);
    for (let i = 0; i < 9; i++) G.inv[i] = { id: B.LOG, n: 1 };
    __game.give(B.TABLE, 1);
    G.sel = 0;
    stepGame(30);
    const px = Math.floor(P.x + P.w / 2), ground = __game.surfaceY(px + 2);
    // Right-clicking a spot where the selected logs cannot go points to the backpack.
    clickAt(px + 2.5, ground + 0.5, 2, 2);
    const bagHint = G.hint && G.hint.s;
    // The backpack marks the table and says to move it to the hotbar, until it is there.
    press('KeyE');
    const inBag = { mode: G.mode, marked: bag.children[0].classList.contains('qslot'), tip: hotTip.textContent };
    // Click, click: while the table is held (a press and release on its own slot keeps it held),
    // the note stays and the hotbar is marked; clicking hotbar slot 2 swaps it with the logs there.
    slotDown(bag.children[0]); slotUp(bag.children[0]);
    const held = state();
    slotDown(hot.children[1]); slotUp(hot.children[1]);
    const moved = state();
    // Put the logs down, send the table back to the backpack (Shift+click) and drag it instead:
    // a press on its slot released over hotbar slot 2 puts it there.
    slotDown(bag.children[0]); slotUp(bag.children[0]);
    slotDown(hot.children[1], true);
    const backInBag = { marked: bag.children[1].classList.contains('qslot'), tip: hotTip.textContent };
    slotDown(bag.children[1]); slotUp(hot.children[1]);
    const dragged = state();
    press('KeyE');
    G.hint = null;
    // Right-clicking a spot where the selected logs cannot go names the slot to press.
    clickAt(px + 2.5, ground + 0.5, 2, 2);
    const hint = G.hint && G.hint.s;
    press('Digit2');
    clickAt(px + 2.5, ground - 0.5, 2, 2);
    return { ids: { table: B.TABLE, log: B.LOG }, bagHint, inBag, held, moved, backInBag, dragged, hint, sel: G.sel, placed: G.stats.placed[B.TABLE] || 0 };
  });
  assert.match(result.bagHint, /الحقيبة/);
  assert.match(result.bagHint, /طاولة الصنع/);
  assert.equal(result.inBag.mode, 'inv');
  assert.equal(result.inBag.marked, true);
  assert.match(result.inBag.tip, /انقر على طاولة الصنع ثم/);
  assert.equal(result.held.cursor, result.ids.table);
  assert.equal(result.held.marks, 0);
  assert.equal(result.held.drop, true);
  assert.match(result.held.tip, /انقر على خانة هنا لتضع طاولة الصنع/);
  assert.deepEqual(result.moved, { cursor: result.ids.log, table: true, marks: 0, drop: false, tip: '' });
  assert.equal(result.backInBag.marked, true);
  assert.match(result.backInBag.tip, /طاولة الصنع/);
  assert.deepEqual(result.dragged, { cursor: null, table: true, marks: 0, drop: false, tip: '' });
  assert.match(result.hint, /طاولة الصنع/);
  assert.match(result.hint, /2/);
  assert.equal(result.sel, 1);
  assert.equal(result.placed, 1);
});

test('Block World redraws a kept pause frame when reduced motion clears its confetti', async t => {
  const page = await adventure(t);
  const paints = await page.evaluate(() => {
    const G = __game.G, B = BW.B, ctx = document.getElementById('game').getContext('2d'), clear = ctx.clearRect;
    let n = 0;
    ctx.clearRect = function () { n++; return clear.apply(this, arguments); };
    // Finishing the planks quest throws confetti; pause while it is still falling.
    __game.give(B.LOG, 1);
    __game.craftId(B.PLANKS);
    G.toasts.length = 0;
    document.getElementById('pausebtn').click();
    stepGame(30);
    for (let i = 0; i < 20; i++) __game.render();
    n = 0; __game.render();
    const settled = n, live = __game.confettiCount;
    Kit.motion.setPreference('reduce');
    n = 0; __game.render();
    return { settled, live, reduced: n, left: __game.confettiCount };
  });
  assert.ok(paints.live > 0, 'confetti should still be falling when reduced motion is switched on');
  assert.deepEqual({ settled: paints.settled, reduced: paints.reduced, left: paints.left }, { settled: 0, reduced: 1, left: 0 });
});

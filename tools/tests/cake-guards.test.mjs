import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

async function game(t, { saved, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(saved => {
    if (saved !== undefined) localStorage.setItem('sg:cake-guards:save', saved);
    let kit;
    const cg = window.cg = { paints: 0, failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        cg.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        cg.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        return { stop() {} };
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:cake-guards:save' && cg.failSave) throw new DOMException('Full storage', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () {
      if (this.canvas.id === 'game' && arguments[0] instanceof HTMLCanvasElement && arguments[3] === 1280) cg.paints++;
      return drawImage.apply(this, arguments);
    };
  }, saved);
  await page.goto(`${server.origin}/games/cake-guards/`);
  await page.waitForFunction(() => window.__game && window.cg.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('sg:cake-guards:save')));

test('instant action: Wave 1 auto-spawns in 1.5s with 1 free starter turret, zero Start Wave button or text wall', async t => {
  const page = await game(t);
  assert.equal(await page.locator('#btnWave').count(), 0, 'no Start Wave button');
  assert.equal(await page.locator('.cg-howto').count(), 0, 'no text wall on title');
  await page.locator('#btnPlay').click();
  await page.evaluate(() => cg.step(2));
  let s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.towers, 1, '1 free starter Frosting Turret already placed');
  assert.equal(s.phase, 'intro');
  assert.equal(await page.locator('#bar .cg-card').count(), 3, '3 chunky bottom turret cards');
  // Advance 1.6s -> Wave 1 spawns automatically!
  await page.evaluate(() => cg.run(100));
  s = await state(page);
  assert.equal(s.phase, 'wave');
  assert.equal(s.wave, 1);
  assert.ok(s.enemies > 0, 'jelly blobs marching automatically');
});

test('live Frosting Blaster (click board + Space) pops blobs; 1-click bar & 1-tap pad build/upgrade with zero popups', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter');
  await page.evaluate(() => { cg.step(1); __game.give(400); cg.run(110); cg.step(1); });
  // 1. Click board away from pads -> shoots Frosting Blaster!
  const pt = await page.evaluate(() => __game.point(260, 340));
  await page.mouse.click(pt.x, pt.y);
  await page.evaluate(() => cg.step(2));
  assert.equal((await state(page)).blasts, 1, 'clicking board fires Frosting Blaster');

  // 2. Press Space -> auto-blasts leading blob!
  await page.evaluate(() => cg.run(20));
  await page.keyboard.press('Space');
  await page.evaluate(() => cg.step(2));
  assert.equal((await state(page)).blasts, 2, 'Space auto-blasts leading blob');

  // 3. Click bottom turret card (1-click auto-place on best glowing pad, zero popup!)
  const beforeTowers = (await state(page)).towers;
  await page.locator('#bar .cg-card[data-type="bubble"]').click();
  await page.evaluate(() => cg.step(2));
  assert.equal((await state(page)).towers, beforeTowers + 1);
  assert.equal(await page.locator('#panel').count(), 0, 'zero popup menus');

  // 4. Press Digit3 -> 1-key auto-places Cupcake Splash Cannon!
  await page.keyboard.press('Digit3');
  await page.evaluate(() => cg.step(2));
  assert.equal((await state(page)).towers, beforeTowers + 2);

  // 5. Direct 1-tap on an empty pad builds; tapping again upgrades!
  const freePad = await page.evaluate(() => __game.bestPad);
  const padPt = await page.evaluate(i => __game.padPoint(i), freePad);
  await page.mouse.click(padPt.x, padPt.y);
  await page.evaluate(() => cg.step(2));
  assert.equal((await state(page)).towers, beforeTowers + 3);
  await page.mouse.click(padPt.x, padPt.y);
  await page.evaluate(() => cg.step(2));
  assert.equal(await page.evaluate(i => __game.world.pads[i].tower.lv, freePad), 1, '1-tap occupied pad upgrades directly');
});

test('win saves immediately, pause freezes cleanly, restart resets, and failed saves offer working retry', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => { cg.failSave = true; cg.step(2); __game.win(); cg.step(1); });
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  await page.evaluate(() => { cg.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).stars[0], 3);

  // Pause via blur freezes completely; Restart opens fresh stage 1
  await page.evaluate(() => { __game.start(0); cg.run(120); cg.step(1); });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).screen, 'pause');
  const frozen = await page.evaluate(() => { cg.step(1); cg.paints = 0; const t = __game.state.time; cg.step(60); return [t, __game.state.time, cg.paints]; });
  assert.equal(frozen[1], frozen[0]);
  assert.equal(frozen[2], 0);
  await page.locator('#btnRestart').click();
  await page.evaluate(() => cg.step(1));
  const r = await state(page);
  assert.deepEqual([r.screen, r.towers, r.wave, r.blasts], ['play', 1, 0, 0]);
});

test('damaged saves recover safely and endless opens after 2 won levels', async t => {
  for (const saved of ['broken{', '{"stars":"bad","cake":99,"endless":-3}']) {
    const page = await game(t, { saved });
    assert.equal((await state(page)).screen, 'title');
    assert.equal(await page.evaluate(() => __game.save.cake), 0);
  }
  const page = await game(t, { saved: JSON.stringify({ stars: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }) });
  assert.equal(await page.locator('#btnEndless').isDisabled(), false, 'endless unlocks after 2 levels');
  await page.locator('#btnEndless').click();
  await page.evaluate(() => cg.step(2));
  assert.equal((await state(page)).endless, true);
});

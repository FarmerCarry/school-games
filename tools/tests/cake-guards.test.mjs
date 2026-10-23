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

// The frame loop is stepped by hand, Kit.stats calls are recorded and saves can be made to fail.
async function game(t, { saved, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(saved => {
    if (saved !== undefined) localStorage.setItem('sg:cake-guards:save', saved);
    let kit;
    const cg = window.cg = { paints: 0, stats: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        cg.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        // Simulation only, for long stretches of play where nothing is checked on screen.
        cg.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { cg.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:cake-guards:save' && cg.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () {
      // The cached map is blitted once at the start of every scene paint.
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
async function clickPad(page, i) {
  const p = await page.evaluate(i => __game.padPoint(i), i);
  await page.mouse.click(p.x, p.y);
}
// Starts endless with four towers and holds n waves; the board waits in the break after the last.
async function holdEndless(page, n) {
  await page.evaluate(() => { __game.endless(); __game.give(5000); });
  for (const [i, type] of [[0, 'cane'], [1, 'cake'], [2, 'pop'], [3, 'cane']]) {
    await clickPad(page, i);
    await page.locator(`#panel .cg-card[data-type="${type}"]`).click();
  }
  await page.evaluate(n => { for (let w = 0; w < n; w++) { document.getElementById('btnWave').click(); for (let i = 0; i < 4000 && __game.state.phase === 'wave'; i++) cg.run(1); } }, n);
  return (await state(page)).wave;
}

test('a won level is saved the moment it is won; Restart from a pause in the celebration keeps it', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => { cg.step(2); __game.win(); cg.step(1); });
  assert.equal((await state(page)).phase, 'won');
  assert.equal(await page.locator('#scr-win').isHidden(), true, 'the celebration plays before the result screen');
  assert.equal((await stored(page)).stars[0], 3, 'the stars are already saved');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => cg.step(1));
  assert.equal((await state(page)).screen, 'pause');
  await page.locator('#btnRestart').click();
  await page.evaluate(() => cg.step(1));
  assert.deepEqual([(await state(page)).screen, (await state(page)).wave], ['play', 0]);
  assert.equal((await stored(page)).stars[0], 3, 'restarting does not take the win away');
  assert.deepEqual(await page.evaluate(() => cg.stats.filter(s => s[0] !== 'tutorial')), [['round', 'L1'], ['end', 'win', 3], ['round', 'L1']]);
  // Without a pause the result screen follows, and Enter goes on to level 2.
  await page.evaluate(() => { __game.win(); cg.run(200); cg.step(1); });
  assert.equal(await page.locator('#scr-win').isVisible(), true);
  assert.equal(await page.locator('#winStars .on').count(), 0, 'stars pop in one by one');
  await page.waitForFunction(() => document.querySelectorAll('#winStars .on').length === 3);
  await page.evaluate(() => cg.step(40));
  await page.keyboard.press('Enter');
  await page.evaluate(() => cg.step(1));
  assert.deepEqual([(await state(page)).screen, (await state(page)).level], ['play', 1]);
});

test('a lost level reports the waves it held; an endless run saves its best at the moment it ends', async t => {
  const page = await game(t, { saved: JSON.stringify({ stars: [3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0] }) });
  await page.evaluate(() => { __game.start(4); cg.step(2); __game.lose(); cg.step(1); });
  assert.equal((await state(page)).phase, 'lost');
  await page.evaluate(() => cg.step(120));
  assert.equal(await page.locator('#scr-lose').isVisible(), true);
  assert.match(await page.locator('#loseSub').textContent(), /صمدت 0 من 7 موجات/);
  assert.equal(await page.locator('#btnEndless').isDisabled(), false, 'four finished levels open endless');
  assert.equal(await holdEndless(page, 3), 3, 'three waves held');
  // The fourth wave eats the cake.
  await page.evaluate(() => { document.getElementById('btnWave').click(); __game.lose(); cg.step(1); });
  assert.equal((await stored(page)).endless, 3, 'the best is saved before the result screen');
  const ends = await page.evaluate(() => cg.stats.filter(s => s[0] === 'end'));
  assert.deepEqual(ends, [['end', 'lose', 0], ['end', 'end', 3]]);
  await page.evaluate(() => cg.step(120));
  assert.equal(await page.locator('#scr-over').isVisible(), true);
  assert.equal(await page.locator('#overWaves').textContent(), '3');
  assert.equal(await page.locator('#overNew').isVisible(), true, 'the waves saved during the run still count as a new record');
});

test('an endless run left from the pause menu keeps the waves it held', async t => {
  const page = await game(t, { saved: JSON.stringify({ stars: [3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0] }) });
  assert.equal(await holdEndless(page, 2), 2, 'two waves held');
  assert.equal((await stored(page)).endless, 2, 'each held wave is saved at once');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => cg.step(1));
  await page.locator('#btnMenu').click();
  assert.equal(await page.locator('#endlessSub').textContent(), 'أفضل: 2 موجة');
});

test('pads build through their menu or the tower bar; upgrades and sales move coins; menus close', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start(2); __game.give(500); cg.step(1); });
  const coins = (await state(page)).coins;
  await clickPad(page, 4);
  assert.equal(await page.locator('#panel').isVisible(), true);
  assert.equal(await page.locator('#panel .cg-card').count(), 3, 'level 3 offers three towers');
  await page.locator('#panel .cg-card[data-type="cake"]').click();
  assert.equal(await page.locator('#panel').isVisible(), false, 'building closes the menu');
  assert.equal((await state(page)).coins, coins - 110);
  // The bar: press 2 for the bubble tower, then click a pad.
  await page.keyboard.press('Digit2');
  await page.evaluate(() => cg.step(1));
  assert.equal((await state(page)).placing, 'bubble');
  await clickPad(page, 6);
  assert.equal((await state(page)).towers, 2);
  // Select the cupcake tower: U upgrades it, X sells it for 70% of everything spent.
  await clickPad(page, 4);
  assert.equal(await page.locator('#btnUpgrade').isVisible(), true);
  await page.keyboard.press('KeyU');
  await page.evaluate(() => cg.step(1));
  assert.equal(await page.evaluate(() => __game.world.pads[4].tower.lv), 1);
  const before = (await state(page)).coins;
  await page.keyboard.press('KeyX');
  await page.evaluate(() => cg.step(1));
  assert.equal((await state(page)).coins, before + Math.floor((110 + 110) * 0.7));
  assert.equal(await page.locator('#panel').isVisible(), false);
  // An open menu never outlives the level.
  await clickPad(page, 4);
  assert.equal(await page.locator('#panel').isVisible(), true);
  await page.evaluate(() => { __game.lose(); cg.step(100); });
  assert.equal(await page.locator('#scr-lose').isVisible(), true);
  assert.equal(await page.locator('#panel').isVisible(), false, 'the build menu is hidden behind the result');
});

test('a paused level freezes, keeps its last frame, and redraws once after a resize', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await clickPad(page, 2);
  await page.locator('#panel .cg-card[data-type="pop"]').click();
  await page.evaluate(() => { document.getElementById('btnWave').click(); cg.run(240); });
  const live = await page.evaluate(() => __game.world.enemies.length);
  assert.ok(live > 0, 'blobs are on the road');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).screen, 'pause', 'losing focus pauses');
  const frozen = await page.evaluate(() => { cg.step(1); cg.paints = 0; const t = __game.state.time; cg.step(120); return [t, __game.state.time, cg.paints]; });
  assert.equal(frozen[1], frozen[0], 'nothing moves while paused');
  assert.equal(frozen[2], 0, 'the paused frame is kept');
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
  assert.equal(await page.evaluate(() => { cg.paints = 0; cg.step(60); return cg.paints; }), 1, 'a resize repaints once');
  await page.keyboard.press('KeyP');
  await page.evaluate(() => cg.step(1));
  assert.equal((await state(page)).screen, 'play');
  assert.equal(await page.evaluate(() => { cg.paints = 0; cg.step(10); return cg.paints; }), 10, 'play draws every frame');
});

test('failed saves warn with a retry and keep the stars until a retry works', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => { cg.failSave = true; __game.win(); cg.step(1); });
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal(await page.evaluate(() => __game.save.stars[0]), 3, 'the stars stay in this session');
  assert.equal(await stored(page), null);
  await page.evaluate(() => { cg.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).stars[0], 3);
});

for (const saved of ['broken{', '[1,2]', '{"stars":"abc","cake":99,"endless":-4,"seen":"g"}', '{"stars":[7,-1,null,"3"],"cake":3}']) {
  test(`a damaged save never stops the game (${saved})`, async t => {
    const page = await game(t, { saved });
    assert.equal((await state(page)).screen, 'title');
    const save = await page.evaluate(() => __game.save);
    assert.ok(save.stars.every(s => Number.isInteger(s) && s >= 0 && s <= 3));
    assert.equal(save.cake, 0, 'a locked or unknown cake falls back to the first');
    assert.equal(save.endless, 0);
    await page.locator('#btnPlay').click();
    await page.evaluate(() => cg.step(5));
    assert.equal((await state(page)).screen, 'play');
  });
}

test('the first level teaches by doing, and the keyboard covers waves, speed and pause', async t => {
  const page = await game(t);
  await page.keyboard.press('Enter');
  await page.evaluate(() => cg.step(1));
  assert.equal((await state(page)).screen, 'play');
  assert.match(await page.locator('#hint').textContent(), /الدائرة المتوهجة/);
  // A pause (also the automatic one when the window loses focus) hides the hint; resuming shows the same step again.
  const hintAfterPause = async () => {
    await page.keyboard.press('KeyP');
    await page.evaluate(() => cg.step(1));
    await page.locator('#btnResume').click();
    return page.locator('#hint').evaluate(e => e.hidden ? '' : e.textContent);
  };
  assert.match(await hintAfterPause(), /الدائرة المتوهجة/);
  await clickPad(page, 0);
  await page.locator('#panel .cg-card[data-type="pop"]').click();
  assert.match(await page.locator('#hint').textContent(), /ابدأ الموجة/);
  assert.match(await hintAfterPause(), /ابدأ الموجة/);
  await page.keyboard.press('KeyF');
  await page.evaluate(() => cg.step(1));
  assert.equal((await state(page)).speed, 2);
  assert.equal(await page.locator('#btnSpeed').textContent(), '×2');
  await page.keyboard.press('Space');
  await page.evaluate(() => cg.step(2));
  assert.equal((await state(page)).phase, 'wave');
  assert.equal(await page.locator('#btnWave').isDisabled(), true, 'no second wave while one is coming');
  assert.match(await page.locator('#hint').textContent(), /الأبراج ترمي/);
  await page.keyboard.press('Escape');
  await page.evaluate(() => cg.step(1));
  assert.equal((await state(page)).screen, 'pause');
  assert.deepEqual(await page.evaluate(() => cg.stats.filter(s => s[0] === 'tutorial')), [['tutorial', 'start']]);
});

test('reduced motion keeps the banner readable and removes it by a timer', async t => {
  const page = await game(t, { reducedMotion: 'reduce' });
  await page.locator('#btnPlay').click();
  const banner = await page.$eval('#banner', e => ({ hidden: e.hidden, opacity: getComputedStyle(e).opacity, animation: getComputedStyle(e).animationName }));
  assert.deepEqual(banner, { hidden: false, opacity: '1', animation: 'none' });
  await page.waitForFunction(() => document.getElementById('banner').hidden, null, { timeout: 5000 });
});

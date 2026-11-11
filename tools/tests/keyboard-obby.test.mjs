// Keyboard Obby in real Chromium: real key presses by physical key (whatever the keyboard
// language), hops, wrong keys, a whole level, the result screen, pause, restart, saves (and
// a full disk), the عربي / English toggle, the map, the shop, reduced motion and sizes.
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

const LEVELS = [6, 6, 6, 5, 6];
const rows = (stars = {}) => LEVELS.map((n, w) => Array.from({ length: n }, (_, l) => (stars[w] || [])[l] || 0));
const SAVE = (stars, extra = {}) => ({ v: 1, lang: 'ar', stars: rows(stars), best: rows(stars).map(r => r.map(s => s ? 300 : 0)), coins: 0,
  colors: [true, false, false, false, false, false, false, false], hats: [true, false, false, false, false, false, false, false, false], color: 0, hat: 0, coach: true, ...extra });
// DDA levels: 0.05 is tier 1, 0.95 is tier 5.
const TIER = { 1: 0.05, 3: 0.5, 5: 0.95 };

// The game with its frame loop stepped by hand, every Kit.dda result recorded (ko.results)
// and a storage that can be told to fail. `dda` is the level a fresh PC starts at.
// No page errors, no console errors, no requests off the server.
async function game(t, { save, dda, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await ctx.addInitScript(({ save, dda }) => {
    // Seeded once per tab, so a reload keeps what the game saved.
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('ko-seeded')) {
      sessionStorage.setItem('ko-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:keyboard-obby:save', typeof save === 'string' ? save : JSON.stringify(save));
    }
    let kit;
    const ko = window.ko = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        ko.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        ko.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        ko.render = () => render(0);
        return { stop() {} };
      };
      const make = kit.dda;
      kit.dda = (slug, opts) => {
        const control = make.call(kit, slug, Object.assign({}, opts, dda == null ? {} : { start: dda })), result = control.result;
        control.result = outcome => { ko.results.push(outcome); return result.call(control, outcome); };
        return control;
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:keyboard-obby:save' && window.ko && window.ko.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, dda });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/keyboard-obby/`);
  await page.waitForFunction(() => window.__game && window.ko.step);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => ko.step(n), n);
const run = (page, n = 1) => page.evaluate(n => ko.run(n), n);
const stored = page => page.evaluate(() => { const raw = localStorage.getItem('sg:keyboard-obby:save'); return raw ? JSON.parse(raw) : null; });
// Steps the game until a condition on its state holds (or the step budget runs out).
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += 4) { if (ok(__game.state)) return true; ko.run(4); }
    return ok(__game.state);
  }, { cond, max });
}
// Plays the level like a quick child: presses the key the glowing key shows each time the
// hero stands, until the level ends.
async function playLevel(page, max = 400) {
  for (let i = 0; i < max; i++) {
    const s = await state(page);
    if (s.screen !== 'play' || s.done) return s;
    if (s.target && s.hero.phase === 'stand' && !s.queue) await page.keyboard.press(s.target);
    await run(page, 8);
  }
  return state(page);
}
async function startFirst(page) {
  await page.locator('#btnPlay').click();
  await step(page);
  assert.equal((await state(page)).screen, 'play');
}

test('the title waits with the hero hopping round the keyboard; Play starts level 1-1 on the space bar at a gentle tier', async t => {
  const page = await game(t, { reducedMotion: 'no-preference' });
  await step(page, 30);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/87');
  assert.ok(await page.locator('#btnPlay').isVisible());
  // The attract run is the menu's own: nothing is saved, nothing is reported.
  await run(page, 240);
  assert.equal(await stored(page), null, 'the title saves nothing');
  await page.keyboard.press('Enter');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.id, 'w1l1'); assert.equal(s.tier, 1, 'a fresh PC starts at tier 1');
  assert.equal(s.target, 'KeyF'); assert.equal(s.at, -1);
  assert.deepEqual(s.hero, { phase: 'stand', x: 6.875, y: 0, z: 4.5 }, 'on the space bar');
  assert.equal(s.started, false); assert.equal(s.time, 0);
  // The clock and the jelly wait for the first key.
  await run(page, 120);
  s = await state(page);
  assert.equal(s.time, 0); assert.equal(s.jelly, 0);
  assert.ok(await page.evaluate(() => __game.drawCalls()) <= 20, 'few draw calls');
});

test('the glowing key hops the hero onto that very key (by physical key, whatever the layout); a wrong key only wobbles it', async t => {
  const page = await game(t, { save: SAVE({}, { coach: false }) });
  await startFirst(page);
  await page.keyboard.press('KeyK');
  await step(page);
  let s = await state(page);
  assert.equal(s.mistakes, 1); assert.equal(s.hops, 0); assert.equal(s.hero.phase, 'oops');
  assert.equal(s.hero.x, 6.875, 'no hop into the void');
  assert.equal(s.target, 'KeyF');
  // Keys that are not keys of the course do nothing.
  // (Tab is left out: it moves the focus to the buttons, as it should.)
  for (const k of ['ShiftLeft', 'Enter', 'ArrowLeft', 'CapsLock', 'Backspace', 'Minus']) await page.keyboard.press(k);
  await step(page, 2);
  assert.equal((await state(page)).mistakes, 1);
  // Windows set to Arabic types ب on the F key: the game reads the physical key.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'ب', bubbles: true })));
  await step(page);
  s = await state(page);
  assert.equal(s.hops, 1); assert.equal(s.hero.phase, 'hop'); assert.equal(s.started, true);
  await run(page, 40);
  s = await state(page);
  assert.equal(s.at, 0); assert.equal(s.hero.phase, 'stand');
  assert.equal(s.hero.x, 5.25); assert.equal(s.hero.z, 2.5); assert.equal(s.hero.y, 0);
  assert.equal(s.target, 'KeyF', 'the path asks for F twice');
  await page.keyboard.press('KeyF');
  await run(page, 40);
  assert.equal((await state(page)).at, 1);
  // Right keys typed ahead queue up and the hero chains the hops.
  await page.keyboard.press('KeyJ'); await page.keyboard.press('KeyJ');
  await step(page);
  assert.equal((await state(page)).next, 4);
  await run(page, 90);
  s = await state(page);
  assert.equal(s.at, 3); assert.equal(s.hops, 4);
  // The wordless coach: after a few idle seconds a hand taps the lit key on the little keyboard.
  assert.ok(await until(page, 's.ghost', 60 * 7), 'the hand shows the key');
  await page.keyboard.press('KeyF');
  await step(page);
  assert.equal((await state(page)).ghost, false, 'a press hides the hand');
});

test('finishing a level: stars, coins and a saved best; Enter goes on to the next level and R plays it again', async t => {
  const page = await game(t, { dda: TIER[1] });
  await startFirst(page);
  const s = await playLevel(page);
  assert.equal(s.done, true);
  assert.ok(await until(page, "s.screen === 'result'", 60 * 4), 'the result shows after the cheer');
  await run(page, 120);
  const r = await state(page);
  assert.equal(r.stars, 3);
  assert.equal(await page.locator('#resStars svg.on').count(), 3);
  const saved = await stored(page);
  assert.equal(saved.stars[0][0], 3); assert.ok(saved.best[0][0] > 0); assert.ok(saved.coins >= 9 + 3, `coins ${saved.coins}`);
  assert.equal(saved.coach, true);
  assert.equal((await page.evaluate(() => ko.results)).length, 1, 'one DDA result per level');
  assert.ok((await page.evaluate(() => ko.results))[0] > 0.7);
  await page.keyboard.press('KeyR');
  await step(page);
  assert.equal((await state(page)).id, 'w1l1', 'R plays the level again');
  assert.equal((await state(page)).hops, 0);
  await playLevel(page);
  assert.ok(await until(page, "s.screen === 'result'", 60 * 4));
  await run(page, 60);
  await page.keyboard.press('Enter');
  await step(page);
  const n = await state(page);
  assert.equal(n.screen, 'play'); assert.equal(n.id, 'w1l2', 'Enter: the next level');
  assert.equal((await stored(page)).stars[0][0], 3, 'the stars stay');
});

test('pause: Esc, P (in a level without P) and the button freeze the course; Resume carries on; Restart starts afresh', async t => {
  const page = await game(t, { save: SAVE({ 0: [3, 3, 3, 3, 3, 3], 1: [3, 3, 3] }) });
  await page.locator('#btnPlay').click();
  await step(page);
  assert.equal((await state(page)).screen, 'map', 'a child with stars picks a level');
  await page.locator('.lvl').nth(0).click();
  await step(page);
  await page.keyboard.press('KeyF');
  await run(page, 30);
  await page.keyboard.press('Escape');
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'pause'); assert.equal(s.paused, true);
  await run(page, 120);
  assert.deepEqual(await state(page), s, 'nothing moves while paused');
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'play');
  await page.keyboard.press('KeyP');
  await step(page);
  assert.equal((await state(page)).screen, 'pause', 'P pauses a level that never asks for P');
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).screen, 'play');
  await page.locator('#btnPause').click();
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
  await page.locator('#btnRestart').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.hops, 0); assert.equal(s.next, 0); assert.equal(s.started, false); assert.equal(s.id, 'w1l1');
  // A level whose path uses P: P is a key of the course there (a wrong key, not a pause).
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnMenu').click(); await step(page);
  await page.locator('.world').nth(1).locator('.lvl').nth(3).click(); await step(page);
  s = await state(page);
  assert.equal(s.id, 'w2l4'); assert.ok(s.path.includes('KeyP'));
  assert.notEqual(s.target, 'KeyP');
  await page.keyboard.press('KeyP');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.mistakes, 1);
  // Losing focus pauses too (Kit.lifecycle), and never resumes by itself.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await step(page, 5);
  assert.equal((await state(page)).screen, 'pause');
});

test('saves: progress, coins, the outfit and the language survive a reload; a broken save starts fresh; a full disk warns and keeps playing', async t => {
  const page = await game(t, { save: SAVE({ 0: [2, 1] }, { coins: 40, lang: 'en', hats: [true, true, false, false, false, false, false, false, false], hat: 1 }) });
  await step(page, 2);
  assert.deepEqual(await page.locator('.lang[aria-pressed="true"]').evaluateAll(b => b.map(x => x.dataset.lang)), ['en', 'en']);
  assert.equal(await page.locator('#titleCoins b').textContent(), '40');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.ko.step);
  await step(page, 2);
  let sv = await page.evaluate(() => __game.save);
  assert.equal(sv.lang, 'en'); assert.equal(sv.coins, 40); assert.equal(sv.hat, 1); assert.deepEqual(sv.stars[0].slice(0, 3), [2, 1, 0]);
  // A full disk: the warning shows and the game goes on.
  await page.evaluate(() => { ko.failSave = true; });
  await page.locator('.lang[data-lang="ar"]').first().click();
  await step(page);
  assert.ok(await page.locator('.sg-save-status').isVisible(), 'the save warning shows');
  assert.equal((await page.evaluate(() => __game.save)).lang, 'ar');
  await page.evaluate(() => { ko.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal((await stored(page)).lang, 'ar', 'Retry saves');
  // A damaged save loads as a fresh one.
  const broken = await game(t, { save: '{"v":1,"stars":"lots","coins":-3,"lang":7' });
  await step(broken, 2);
  sv = await broken.evaluate(() => __game.save);
  assert.equal(sv.coins, 0); assert.equal(sv.lang, 'ar'); assert.equal(sv.stars[0][0], 0);
  await startFirst(broken);
  assert.equal((await state(broken)).id, 'w1l1');
});

test('عربي / English: the prompt, the printed keys and the word levels follow the language; the keys stay the same physical keys', async t => {
  const page = await game(t, { save: SAVE({ 0: [1, 1, 1, 1, 1] }) });
  await step(page);
  await page.locator('#btnPlay').click(); await step(page);
  await page.locator('.world').nth(0).locator('.lvl').nth(5).click(); await step(page);
  let s = await state(page);
  assert.equal(s.id, 'w1l6'); assert.equal(s.lang, 'ar');
  // بيت شمس كتاب: ب is F, ي is D, ت is J...
  assert.deepEqual(s.path.slice(0, 3), ['KeyF', 'KeyD', 'KeyJ']);
  assert.equal(s.path.length, 10);
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnMenu').click(); await step(page);
  assert.equal(await page.locator('.world .keys').first().textContent(), 'شسيب');
  await page.locator('#scrMap .lang[data-lang="en"]').click(); await step(page);
  assert.equal((await page.evaluate(() => __game.save)).lang, 'en');
  assert.equal(await page.locator('.world .keys').first().textContent(), 'ASDF');
  await page.locator('.world').nth(0).locator('.lvl').nth(5).click(); await step(page);
  s = await state(page);
  assert.equal(s.lang, 'en');
  assert.deepEqual(s.path, ['KeyD', 'KeyA', 'KeyD', 'KeyF', 'KeyL', 'KeyA', 'KeyG', 'KeyS', 'KeyA', 'KeyL', 'KeyA', 'KeyD'], 'DAD FLAG SALAD');
  await page.keyboard.press('KeyD');
  await run(page, 40);
  assert.equal((await state(page)).at, 0);
  // A lesson level is the same course in both languages.
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnMenu').click(); await step(page);
  await page.locator('.world').nth(0).locator('.lvl').nth(2).click(); await step(page);
  const en = (await state(page)).path;
  await page.keyboard.press('Escape'); await step(page);
  await page.locator('#btnMenu').click(); await step(page);
  await page.locator('#scrMap .lang[data-lang="ar"]').click(); await step(page);
  await page.locator('.world').nth(0).locator('.lvl').nth(2).click(); await step(page);
  assert.deepEqual((await state(page)).path, en);
});

test('reduced motion: no particles, no shake and a still title; the course plays the same', async t => {
  const calm = await game(t, { reducedMotion: 'reduce' });
  await startFirst(calm);
  assert.equal((await state(calm)).calm, true);
  await calm.keyboard.press('KeyF');
  await run(calm, 40);
  let s = await state(calm);
  assert.equal(s.at, 0, 'hops still work');
  assert.equal(s.particles, 0, 'no particles');
  const lively = await game(t, { reducedMotion: 'no-preference' });
  await startFirst(lively);
  await lively.keyboard.press('KeyF');
  await run(lively, 26);
  s = await state(lively);
  assert.equal(s.calm, false);
  assert.ok(s.particles > 0, 'dust when the hero lands');
});

test('hazards in a real level: a crumbly key drops a hero who waits on it, who splashes and bounces back to the checkpoint', async t => {
  const page = await game(t, { save: SAVE({ 0: [3, 3] }), dda: TIER[5] });
  await page.locator('#btnPlay').click(); await step(page);
  await page.locator('.world').nth(0).locator('.lvl').nth(2).click(); await step(page);
  let s = await state(page);
  assert.equal(s.id, 'w1l3'); assert.equal(s.tier, 5);
  const world = await page.evaluate(() => ({ kind: __game.world.L.kind, cps: __game.world.L.cps }));
  const crumbly = Object.keys(world.kind).find(c => world.kind[c] === 'crumble');
  const at = s.path.indexOf(crumbly);
  assert.ok(at > world.cps[0], 'the crumbly key comes after the first checkpoint');
  for (let i = 0; i <= at; i++) {
    await page.keyboard.press(s.path[i]);
    assert.ok(await until(page, `s.at === ${i} && s.hero.phase === 'stand'`, 200), `reached step ${i}`);
  }
  assert.ok(await until(page, 's.falls === 1', 60 * 4), 'the key drops the hero');
  assert.ok(await until(page, "s.hero.phase === 'stand'", 60 * 3), 'bounced back');
  s = await state(page);
  assert.equal(s.at, world.cps[0], 'on the checkpoint key');
  assert.equal(s.target, s.path[world.cps[0] + 1]);
  assert.equal(s.screen, 'play');
});

test('the map: locked levels say no, open ones start; the shop sells hats and colours for coins', async t => {
  const page = await game(t, { save: SAVE({ 0: [3] }, { coins: 100 }) });
  await page.locator('#btnPlay').click(); await step(page);
  assert.equal(await page.locator('.lvl.locked').count(), 27, 'all but 1-1 and 1-2 are locked');
  assert.equal(await page.locator('.lvl.next').count(), 1);
  await page.locator('.world').nth(2).locator('.lvl').nth(0).click(); await step(page);
  assert.equal((await state(page)).screen, 'map', 'a locked level does not start');
  await page.keyboard.press('Escape'); await step(page);
  assert.equal((await state(page)).screen, 'title');
  await page.locator('#btnShop').click(); await step(page);
  assert.equal((await state(page)).screen, 'shop');
  const hat = page.locator('#hats .item').nth(1), pricey = page.locator('#colors .item').nth(7);
  await hat.click(); await step(page);
  let sv = await page.evaluate(() => __game.save);
  assert.equal(sv.hat, 1); assert.equal(sv.coins, 85); assert.equal(sv.hats[1], true);
  assert.equal(await hat.getAttribute('aria-pressed'), 'true');
  await pricey.click(); await step(page);
  sv = await page.evaluate(() => __game.save);
  assert.equal(sv.color, 7); assert.equal(sv.coins, 25);
  await page.locator('#colors .item').nth(6).click(); await step(page);
  sv = await page.evaluate(() => __game.save);
  assert.equal(sv.color, 7, 'too few coins: nothing bought'); assert.equal(sv.coins, 25);
  await page.locator('#colors .item').nth(0).click(); await step(page);
  assert.equal((await stored(page)).color, 0, 'owned colours are worn for free');
  assert.equal((await stored(page)).coins, 25);
});

test('the picture fills the 1100x620 frame and full screen without scrollbars', async t => {
  for (const size of [[1100, 620], [1920, 1080], [1024, 768]]) {
    const page = await game(t, { size });
    await startFirst(page);
    const box = await page.evaluate(() => {
      const c = document.getElementById('scene').getBoundingClientRect(), h = document.getElementById('hud').getBoundingClientRect(), u = document.getElementById('ui').getBoundingClientRect();
      return { c: [c.left, c.top, c.width, c.height], h: [h.left, h.top, h.width, h.height], u: [u.left, u.top, u.width, u.height],
        scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight] };
    });
    const s = Math.min(size[0] / 1280, size[1] / 720);
    assert.ok(Math.abs(box.c[2] - 1280 * s) < 2 && Math.abs(box.c[3] - 720 * s) < 2, `scene ${box.c}`);
    assert.deepEqual(box.h.map(Math.round), box.c.map(Math.round), 'the HUD sits on the scene');
    assert.ok(Math.abs(box.u[2] - box.c[2]) < 2 && Math.abs(box.u[0] - box.c[0]) < 2, 'the buttons sit on the scene');
    assert.ok(box.scroll[0] <= box.scroll[2] && box.scroll[1] <= box.scroll[3], 'no scrollbars');
  }
});

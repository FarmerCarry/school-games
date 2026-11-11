// Word Garden in real Chromium: real keys (by event.code, with the Arabic or the Latin
// letter a PC's input language puts in event.key), the joined word in the page, the hint
// on the keyboard, whole levels, the English mode, pause, saves, the garden shop and
// reduced motion. The frame loop is stepped by hand (window.wg) like the other games' tests.
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

const grid = (v = 0) => [0, 1, 2, 3, 4].map(() => [v, v, v, v, v, v]);
const SAVE = (extra = {}) => ({ v: 1, lang: 'ar', stars: { ar: grid(), en: grid() }, best: { ar: grid(), en: grid() }, seeds: 0, owned: [], coach: true, ...extra });
// DDA levels: 0.05 is tier 1, 0.5 tier 3, 0.95 tier 5.
const TIER = { 1: 0.05, 3: 0.5, 5: 0.95 };

// The game with its frame loop stepped by hand, every Kit.dda result recorded (wg.results)
// and a storage that can be told to fail (wg.failSave). Seeded once per tab, so a reload
// keeps what the game saved. No page errors, no console errors, no requests off the server.
async function game(t, { save, dda, reducedMotion = 'no-preference', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('wg-seeded')) {
      sessionStorage.setItem('wg-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:word-garden:save', typeof save === 'string' ? save : JSON.stringify(save));
      if (dda !== undefined) localStorage.setItem('sg:word-garden:dda', JSON.stringify({ ar: [dda, 4], en: [dda, 4] }));
    }
    let kit;
    const wg = window.wg = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        wg.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        wg.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        wg.paint = () => render(0);
        return { stop() {} };
      };
      const make = kit.dda;
      kit.dda = (slug, opts) => {
        const control = make.call(kit, slug, opts), result = control.result;
        control.result = outcome => { wg.results.push(outcome); return result.call(control, outcome); };
        return control;
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:word-garden:save' && window.wg && window.wg.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, dda });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/word-garden/`);
  await page.waitForFunction(() => window.__game && window.wg.step);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => wg.step(n), n);
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('sg:word-garden:save') || 'null'));
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 4) { if (ok(__game.state)) return true; wg.run(4); }
      return ok(__game.state);
    } finally { wg.paint(); }
  }, { cond, max });
}
// A trusted key press with any key value: { code: 'KeyR', key: 'ق' } is the R key on a PC
// set to Arabic, { code: 'KeyR', key: 'r' } the same key set to English.
const cdps = new WeakMap();
async function press(page, code, key, shift = false) {
  if (!cdps.has(page)) cdps.set(page, await page.context().newCDPSession(page));
  const cdp = cdps.get(page), vk = /^Key[A-Z]$/.test(code) ? code.charCodeAt(3) : 0, modifiers = shift ? 8 : 0;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, text: key, unmodifiedText: key, windowsVirtualKeyCode: vk, modifiers });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk, modifiers });
}
// The letter a physical key prints, in Arabic or Latin (the game's own keyboard table).
const legend = (page, code, lang, shift = false) => page.evaluate(([c, l, s]) => __game.engine.keyChar(c, s, l), [code, lang, shift]);
// Presses the key the game wants (Windows layout: 'ar' or 'en' decides event.key).
async function pressNeeded(page, layout) {
  const s = await state(page);
  await press(page, s.need, await legend(page, s.need, layout, s.shift), s.shift);
}
async function openLevel(page, lang, w = 0, l = 0) {
  await page.locator(`[data-lang="${lang}"]`).click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  await page.locator(`.lvl-btn[data-w="${w}"][data-l="${l}"]`).click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
}
// Types every word of the level with the wanted keys; returns when the result shows.
async function typeLevel(page, layout = 'en', per = 6) {
  for (let i = 0; i < 400; i++) {
    if (!await until(page, '!!s.need || s.screen !== "play"', 900)) return false;
    if ((await state(page)).screen !== 'play') return true;
    await pressNeeded(page, layout);
    await page.evaluate(n => wg.run(n), per);
  }
  return false;
}
// The rendered word compared with the same text in the same font: equal widths mean the
// browser shaped it as one joined word; letters forced apart (ZWNJ) must differ.
const joined = page => page.evaluate(() => {
  const el = document.getElementById('word'), text = el.textContent, cs = getComputedStyle(el);
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;font-weight:' + cs.fontWeight + ';font-size:' + cs.fontSize + ';font-family:' + cs.fontFamily;
  probe.dir = el.dir;
  el.parentNode.append(probe);
  probe.textContent = text;
  const whole = probe.getBoundingClientRect().width;
  probe.textContent = [...text].join('‌');
  const apart = probe.getBoundingClientRect().width;
  probe.remove();
  const range = document.createRange(); range.selectNodeContents(el);
  const joins = [...text].filter((c, i) => __game.engine.joins(c, text[i + 1])).length;
  return { text, nodes: el.childNodes.length, elements: el.children.length, shown: range.getBoundingClientRect().width, whole, apart, joins };
});

test('the title waits; a language opens its map; the first level shows a picture and its word with one glowing gap', async t => {
  const page = await game(t, { dda: TIER[1] });
  await step(page, 30);
  let s = await state(page);
  assert.deepEqual([s.screen, s.lang, s.t, s.keys], ['title', 'ar', 0, 0], 'a first visit waits on the title, in Arabic');
  assert.equal(await page.locator('#btnAr').evaluate(b => b.classList.contains('ring')), true);
  assert.match(await page.locator('#howWord').textContent(), /طة/, 'the how-to card shows a word with a gap');
  await page.locator('[data-lang="ar"]').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('.lvl-btn.next').getAttribute('data-w'), '0');
  assert.equal(await page.locator('.lvl-btn[data-w="0"][data-l="1"]').evaluate(b => b.classList.contains('locked')), true);
  // A locked level wiggles and stays on the map.
  await page.locator('.lvl-btn[data-w="1"][data-l="0"]').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  await page.keyboard.press('Enter');
  await step(page, 2);
  s = await state(page);
  assert.deepEqual([s.screen, s.world, s.level, s.mode, s.tier, s.lang], ['play', 0, 0, 'first', 1, 'ar'], 'Enter plays the next level');
  assert.equal(s.total, 6, 'tier 1 levels have six words');
  assert.ok(s.text.length >= 2 && s.pic, 'a word and its picture');
  assert.deepEqual(s.gaps, [[0, 1]], 'its first letter is missing');
  assert.equal(s.holes, 1, 'one glowing gap');
  assert.equal(s.wordText, s.text.slice(1), 'the page shows the rest of the word');
  assert.equal(s.lit, false, 'the key does not glow at once');
  assert.equal(await page.locator('#tip').textContent(), 'اكتب الحرف الناقص');
  assert.equal(await page.locator('#hudLevel').textContent(), '1-1');
});

test('the right letter, by its key with an Arabic or a Latin key value, completes the word: the page then holds the whole word, joined', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[1] });
  await openLevel(page, 'ar');
  // Windows set to Arabic: event.key is the Arabic letter.
  let s = await state(page);
  const first = s.text;
  await pressNeeded(page, 'ar');
  s = await state(page);
  assert.deepEqual([s.keys, s.errors, s.complete], [1, 0, true], 'the letter fills the gap and the word is done');
  assert.equal(s.wordText, first, 'the finished word reads whole');
  let j = await joined(page);
  assert.deepEqual([j.text, j.nodes, j.elements], [first, 1, 0], 'one run of text, exactly the word, no joiners or pieces');
  assert.ok(Math.abs(j.shown - j.whole) < 1.5, `shaped like the word itself (${j.shown} vs ${j.whole})`);
  if (j.joins) assert.ok(Math.abs(j.apart - j.whole) > 3, 'letters forced apart would look different: the check can see broken joins');
  // The check itself, on a word that surely joins.
  const probe = await page.evaluate(() => {
    const el = document.getElementById('word'), keep = el.textContent;
    el.textContent = 'نحلة';
    const range = document.createRange(); range.selectNodeContents(el);
    const a = range.getBoundingClientRect().width;
    el.textContent = 'ن‌ح‌ل‌ة';
    range.selectNodeContents(el);
    const b = range.getBoundingClientRect().width;
    el.textContent = keep;
    return [a, b];
  });
  assert.ok(Math.abs(probe[0] - probe[1]) > 3, `joined and broken «نحلة» differ (${probe})`);
  assert.equal(await page.locator('#word').evaluate(el => el.classList.contains('done')), true);
  // The next word comes after the celebration; Windows set to English: event.key is Latin.
  assert.ok(await until(page, 's.item === 1 && !s.complete', 300));
  s = await state(page);
  const code = s.need, latin = await legend(page, code, 'en');
  assert.match(latin, /^[a-z;'[\],./`]$/, 'a Latin key value');
  await press(page, code, latin);
  s = await state(page);
  assert.deepEqual([s.keys, s.done, s.complete], [2, 2, true]);
  j = await joined(page);
  assert.equal(j.text, s.text);
  assert.ok(Math.abs(j.shown - j.whole) < 1.5, 'joined');
  // The seeds of both words grow: the plot sprouts once its seed lands.
  assert.ok(await until(page, 's.grown === 2', 120));
});

test('while letters are missing, the letters around each gap keep their joined shapes (zero-width joiners exactly where they join)', async t => {
  const page = await game(t, { save: SAVE({ stars: { ar: [[3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 0, 0]], en: grid() } }), dda: TIER[5] });
  for (const [w, l] of [[1, 0], [2, 3], [3, 4], [4, 4]]) {
    if ((await state(page)).screen !== 'title') { await page.keyboard.press('Escape'); await step(page); await page.locator('#btnMap').click(); await step(page); await page.locator('#mapHome').click(); await step(page); }
    await openLevel(page, 'ar', w, l);
    for (let k = 0; k < 3; k++) {
      const check = await page.evaluate(() => {
        const s = __game.state, WG = __game.engine, el = document.getElementById('word'), text = s.text, out = [];
        // Walk the word: text outside gaps, and each gap's typed letters.
        const parts = [];
        for (const n of el.childNodes) parts.push(n.nodeType === 3 ? { plain: n.textContent } : { gap: n.querySelector('.typed') ? n.querySelector('.typed').textContent : '', holes: n.querySelectorAll('.hole').length });
        const flat = parts.map(p => p.plain != null ? p.plain : p.gap).join('').replace(/‍/g, '');
        // Every boundary between a shown piece and a gap: a joiner on both sides iff the letters join.
        let pos = 0, gi = 0;
        for (const p of parts) {
          if (p.plain != null) {
            const a = pos, b = pos + p.plain.replace(/‍/g, '').length;
            out.push([p.plain.startsWith('‍'), a > 0 && WG.joins(text[a - 1], text[a])], [p.plain.endsWith('‍'), b < text.length && WG.joins(text[b - 1], text[b])]);
            pos = b;
          } else { pos = s.gaps[gi++][1]; }
        }
        return { text, flat, gaps: s.gaps, pos: s.pos, out };
      });
      for (const [has, want] of check.out) assert.equal(has, want, `«${check.text}»: a joiner only where the letters join`);
      assert.ok(check.text.replace(/\s/g, '').length >= check.flat.replace(/\s/g, '').length);
      await pressNeeded(page, 'en');
      if ((await state(page)).complete) { const j = await joined(page); assert.ok(Math.abs(j.shown - j.whole) < 1.5, `«${j.text}» joined when done`); await until(page, '!s.complete', 300); }
    }
  }
});

test('a wrong letter shakes the gap, never fills it, and lights the right key: at once after two wrong letters, or after the tier\'s wait', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[5] });
  await openLevel(page, 'ar');
  let s = await state(page);
  assert.equal(s.tier, 5);
  const wrong = s.need === 'KeyQ' ? 'KeyW' : 'KeyQ', wrong2 = s.need === 'KeyZ' ? 'KeyX' : 'KeyZ';
  await press(page, wrong, await legend(page, wrong, 'ar'));
  s = await state(page);
  assert.deepEqual([s.keys, s.errors, s.pos, s.complete, s.holes, s.lit], [0, 1, 0, false, 1, false], 'the gap stays empty; tier 5 does not light the key yet');
  assert.equal(await page.locator('#word .gap.cur').evaluate(el => el.classList.contains('shake')), true, 'the gap shakes');
  await press(page, wrong2, await legend(page, wrong2, 'en'));
  s = await state(page);
  assert.deepEqual([s.errors, s.lit], [2, true], 'two wrong letters: the right key glows at once');
  await pressNeeded(page, 'ar');
  s = await state(page);
  assert.deepEqual([s.keys, s.complete], [1, true]);
  // Tier 1: the key glows by itself after a short think.
  const young = await game(t, { save: SAVE(), dda: TIER[1] });
  await openLevel(young, 'ar');
  await step(young, 60);
  assert.equal((await state(young)).lit, false);
  await step(young, 40);
  assert.equal((await state(young)).lit, true, 'little ones see the key after 1.5 s');
});

test('a whole level: every word grows a plant, the result saves at once with stars and seeds; Enter plays the next level and R the same again', async t => {
  const page = await game(t, { save: SAVE({ seeds: 5 }), dda: TIER[3] });
  await openLevel(page, 'ar');
  assert.ok(await typeLevel(page, 'en'), 'the level ends');
  assert.ok(await until(page, 's.screen === "result"', 600));
  // A child still typing never skips the card: keys wait a moment.
  await page.keyboard.press('Enter');
  await page.keyboard.press('KeyR');
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'result', 'Enter and R wait a moment');
  assert.equal(s.grown, s.total, 'a plant for every word');
  assert.equal(s.stars, 3, 'quick and right: three stars');
  const store = await saved(page);
  assert.equal(store.stars.ar[0][0], 3, 'saved before the celebration');
  assert.ok(store.best.ar[0][0] > 0, 'with a best time');
  assert.equal(store.seeds, 5 + s.total + 6, 'a seed per word and two per star');
  assert.equal((await page.evaluate(() => wg.results)).length, 1, 'one result for the difficulty');
  assert.ok(await until(page, 'document.querySelectorAll("#resStars .on").length === 3', 200));
  assert.equal(await page.locator('#resSeeds').textContent(), '+' + (s.total + 6));
  await step(page, 10);
  await page.keyboard.press('Enter');
  await step(page);
  s = await state(page);
  assert.deepEqual([s.screen, s.world, s.level, s.keys], ['play', 0, 1, 0], 'Enter plays the next level');
  assert.ok(await typeLevel(page, 'ar'));
  assert.ok(await until(page, 's.screen === "result"', 600));
  await step(page, 60);
  await page.keyboard.press('KeyR');
  await step(page);
  s = await state(page);
  assert.deepEqual([s.screen, s.world, s.level, s.keys, s.done], ['play', 0, 1, 0, 0], 'R plays the same level again');
});

test('a better try shows «New best»; the stars and seeds come back after a reload', async t => {
  const best = grid(); best[0][0] = 999;
  const stars = grid(); stars[0][0] = 1;
  const page = await game(t, { save: SAVE({ stars: { ar: stars, en: grid() }, best: { ar: best, en: grid() } }), dda: TIER[1] });
  await openLevel(page, 'ar');
  assert.ok(await typeLevel(page, 'ar'));
  assert.ok(await until(page, 's.screen === "result"', 600));
  assert.equal((await state(page)).newBest, true);
  assert.ok(await until(page, '!document.getElementById("resBest").hidden', 200), 'the New best ribbon shows');
  const seeds = (await saved(page)).seeds;
  await page.reload();
  await page.waitForFunction(() => window.__game && window.wg.step);
  const s = await page.evaluate(() => __game.save);
  assert.equal(s.stars.ar[0][0], 3);
  assert.ok(s.best.ar[0][0] < 999);
  assert.equal(s.seeds, seeds);
  assert.equal(await page.locator('#titleStars b').textContent(), '3');
});

test('the English mode: English words, the Latin letter, and the key still counts with Windows set to Arabic', async t => {
  const page = await game(t, { save: SAVE({ lang: 'en' }), dda: TIER[3] });
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await page.locator('#mapLang').textContent(), 'English');
  await page.keyboard.press('Enter');
  await step(page, 2);
  let s = await state(page);
  assert.deepEqual([s.screen, s.lang, s.mode], ['play', 'en', 'first']);
  assert.match(s.text, /^[a-z]+$/);
  assert.equal(s.wordText, s.text.slice(1));
  assert.equal(await page.locator('#word').getAttribute('dir'), 'ltr');
  // The physical key of the Latin letter, with an Arabic key value.
  const code = s.need;
  await press(page, code, await legend(page, code, 'ar'));
  s = await state(page);
  assert.deepEqual([s.keys, s.complete, s.wordText], [1, true, s.text]);
  // Caps Lock / Shift never block a Latin letter.
  assert.ok(await until(page, 's.item === 1 && !s.complete', 300));
  s = await state(page);
  await page.keyboard.press('Shift+' + s.need);
  assert.equal((await state(page)).complete, true);
});

test('Esc and the button pause; nothing moves while paused; P and M are letters; focus never resumes; Restart begins again', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[3] });
  await openLevel(page, 'en');
  await page.keyboard.press('KeyP');
  await page.keyboard.press('KeyM');
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'play', 'P never pauses: it is a letter');
  assert.equal(s.keys + s.errors, 2, 'P and M were typed as letters');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false, 'M never mutes');
  await page.keyboard.press('Escape');
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'pause');
  const frozen = JSON.stringify([s.t, s.item, s.pos, s.lit, s.keys]);
  await step(page, 600);
  s = await state(page);
  assert.equal(JSON.stringify([s.t, s.item, s.pos, s.lit, s.keys]), frozen, 'nothing moves while paused (not even the hint timer)');
  await page.keyboard.type('abc');
  await step(page);
  assert.equal(JSON.stringify([(await state(page)).keys, (await state(page)).errors]), JSON.stringify([s.keys, s.errors]), 'letters do nothing on the pause card');
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).screen, 'play');
  await page.locator('#btnPause').click();
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
  await page.locator('#btnResume').click();
  await step(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page);
  assert.equal((await state(page)).screen, 'pause', 'leaving the window pauses');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await step(page, 30);
  assert.equal((await state(page)).screen, 'pause', 'coming back does not resume by itself');
  await pressNeeded(page, 'en');
  await page.locator('#btnRestart').click();
  await step(page);
  s = await state(page);
  assert.deepEqual([s.screen, s.keys, s.errors, s.done, s.item, s.world, s.level], ['play', 0, 0, 0, 0, 0, 0], 'Restart starts the same level again');
  // The mute button still mutes.
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
});

test('saves: an old or broken save opens a fresh garden; a full disk shows the warning, play goes on, and Retry writes', async t => {
  const broken = await game(t, { save: '{"v":1,"stars":{"ar":"lots"},"seeds":-4,"owned":["dragon"]', dda: TIER[1] });
  await step(broken, 5);
  assert.deepEqual(await broken.evaluate(() => [__game.save.seeds, __game.save.owned.length, __game.state.screen]), [0, 0, 'title']);
  assert.equal(await broken.locator('#titleStars b').textContent(), '0');
  const page = await game(t, { save: SAVE({ lang: 'en' }), dda: TIER[1] });
  await page.evaluate(() => { wg.failSave = true; });
  await page.locator('[data-lang="ar"]').click();
  await step(page, 2);
  assert.equal(await page.locator('.sg-save-status').isVisible(), true, 'the save warning shows');
  assert.equal((await state(page)).screen, 'map', 'the game goes on');
  await page.evaluate(() => { wg.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal((await saved(page)).lang, 'ar', 'Retry saved');
});

test('the garden: seeds buy a plant or a decoration once, too few seeds wiggle, and it all stays after a reload', async t => {
  const page = await game(t, { save: SAVE({ seeds: 30, stars: { ar: [[3, 2, 0, 0, 0, 0], ...grid().slice(1)], en: grid() } }), dda: TIER[1] });
  await page.locator('#btnGarden').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'garden');
  assert.equal(await page.locator('#gardenPlants b').textContent(), '5', 'a plant for every star');
  assert.equal(await page.locator('.item[data-id="pond"]').evaluate(b => b.classList.contains('poor')), true);
  await page.locator('.item[data-id="carrot"]').click();
  await step(page, 2);
  let s = await page.evaluate(() => __game.save);
  assert.deepEqual([s.seeds, s.owned], [18, ['carrot']]);
  assert.equal(await page.locator('.item[data-id="carrot"]').evaluate(b => b.classList.contains('owned')), true);
  await page.locator('.item[data-id="pond"]').click();
  await page.locator('.item[data-id="carrot"]').click();
  await step(page, 2);
  s = await page.evaluate(() => __game.save);
  assert.deepEqual([s.seeds, s.owned], [18, ['carrot']], 'too few seeds buy nothing; nothing is bought twice');
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.wg.step);
  assert.deepEqual(await page.evaluate(() => __game.save.owned), ['carrot']);
  assert.equal(await page.locator('#titleSeeds b').textContent(), '18');
});

test('reduced motion: letters appear at once, plants grow without waiting, and the level still ends with its stars', async t => {
  const page = await game(t, { save: SAVE(), dda: TIER[1], reducedMotion: 'reduce' });
  await openLevel(page, 'ar');
  await pressNeeded(page, 'ar');
  const s = await state(page);
  assert.deepEqual([s.complete, s.flyers, s.grown], [true, 0, 1], 'no flying letter or seed: the plant is there at once');
  assert.ok(await typeLevel(page, 'ar'));
  assert.ok(await until(page, 's.screen === "result"', 600));
  assert.ok(await until(page, 'document.querySelectorAll("#resStars .on").length === ' + (await state(page)).stars, 200));
  assert.equal(await page.locator('#resStars').isVisible(), true);
});

for (const size of [[1100, 620], [1920, 1080]]) {
  test(`the word and the buttons fit the ${size[0]}x${size[1]} frame`, async t => {
    const page = await game(t, { save: SAVE(), dda: TIER[5], size });
    await openLevel(page, 'ar', 0, 0);
    const box = await page.evaluate(() => {
      const r = el => { const b = document.getElementById(el).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      return { canvas: r('game'), board: r('board'), word: r('word'), pause: r('btnPause'), vw: innerWidth, vh: innerHeight, scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
    });
    const inside = (a, b) => a[0] >= b[0] - 1 && a[1] >= b[1] - 1 && a[2] <= b[2] + 1 && a[3] <= b[3] + 1;
    assert.ok(inside(box.board, box.canvas) && inside(box.pause, box.canvas), 'the UI layer sits on the canvas');
    assert.ok(box.word[0] >= box.board[0] && box.word[2] <= box.board[2], 'the word fits its board');
    assert.ok(box.scroll[0] <= box.vw && box.scroll[1] <= box.vh, 'no scrollbars');
  });
}

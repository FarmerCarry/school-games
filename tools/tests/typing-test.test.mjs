// Lightning Fingers in real Chromium: real keyboard and mouse, cloud levels in English and
// Arabic (the PC's layout is English here, so Arabic levels are typed by physical key),
// pause, saves, the speed test, the class challenge, and what a portal receives.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
// A portal stand-in: it embeds the game, records what the game posts, and sends preferences.
const PARENT = `<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{position:absolute;left:0;top:0;width:1280px;height:720px;border:0}</style>
<iframe id="f" src="/games/typing-test/"></iframe>
<script>window.msgs = []; addEventListener('message', e => { if (e.source === f.contentWindow) msgs.push(e.data); });
function prefs(p) { f.contentWindow.postMessage(Object.assign({ type: 'sg:preferences' }, p), location.origin); }</script>`;
let browser, server;
before(async () => { server = await startTestServer(root, { pages: { '/tt-parent': PARENT } }); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

const grid = done => [0, 1, 2, 3, 4].map(w => w < done ? [3, 3, 3, 3] : [0, 0, 0, 0]);
const SAVE = (extra = {}) => ({ v: 2, lang: 'en', stars: { ar: grid(0), en: grid(0) }, coach: true, tlang: 'en', tdur: 30, best: { ar30: 0, ar60: 0, en30: 0, en60: 0 }, tests: [], ...extra });

// Every test: no page errors, no console errors and no request off the test server.
async function context(t, options = {}) {
  const ctx = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 720 }, reducedMotion: options.reducedMotion || 'no-preference' });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no errors'); assert.deepEqual(requests, [], 'no network requests'); });
  // Seeded once per tab, so a reload keeps what the game saved.
  await ctx.addInitScript(({ save, dda, failSave }) => {
    if (location.protocol === 'http:' && !sessionStorage.getItem('tt-seeded')) {
      sessionStorage.setItem('tt-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:typing-test:save', JSON.stringify(save));
      if (dda) localStorage.setItem('sg:typing-test:dda', JSON.stringify(dda));
    }
    if (failSave) {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'sg:typing-test:save' && window.failSave) throw new DOMException('full', 'QuotaExceededError');
        return real.call(this, k, v);
      };
      window.failSave = true;
    }
  }, { save: options.save, dda: options.dda, failSave: !!options.failSave });
  return ctx;
}
// The game with its frame loop stepped by hand, and its Kit.stats / Kit.track calls recorded.
async function game(t, options = {}) {
  const ctx = await context(t, options);
  await ctx.addInitScript(() => {
    let kit;
    const tt = window.tt = { stats: [], track: [] };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        tt.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        tt.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        tt.paint = () => render(0);
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { tt.stats.push([name, ...args]); return call.apply(this, args); };
      }
      for (const name of ['hit', 'miss', 'cue']) {
        const call = kit.track[name];
        kit.track[name] = function (...args) { tt.track.push(name); return call.apply(this, args); };
      }
    } });
  });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/typing-test/`);
  await page.waitForFunction(() => window.__game && window.tt.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => tt.step(n), n);
// Steps the game until a condition on its state holds (or the step budget runs out).
async function until(page, cond, max = 3600) {
  return page.evaluate(({ cond, max }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    try {
      for (let i = 0; i < max; i += 3) { if (ok(__game.state)) return true; tt.run(3); }
      return ok(__game.state);
    } finally { tt.paint(); }
  }, { cond, max });
}
// Opens a level from the map with real clicks.
async function openLevel(page, lang, w = 0, l = 0) {
  await page.locator(`[data-lang="${lang}"]`).click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  await page.locator(`.pebble[data-w="${w}"][data-l="${l}"]`).click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'play');
}
// Presses the lit key (by its physical code) until the level ends; slow sets steps per key.
async function typeLevel(page, { per = 6, max = 600, wrongEvery = 0 } = {}) {
  for (let i = 0; i < max; i++) {
    if (!await until(page, '!!s.nextKey || s.ending || s.screen !== "play"', 600)) return false;
    const s = await state(page);
    if (s.ending || s.screen !== 'play') return true;
    if (wrongEvery && i % wrongEvery === wrongEvery - 1) await page.keyboard.press(s.nextKey === 'KeyQ' ? 'KeyZ' : 'KeyQ');
    await page.keyboard.press(s.nextKey);
    await page.evaluate(n => tt.run(n), per);
  }
  return false;
}

test('the title is not a round; a language opens its map and is remembered', async t => {
  const page = await game(t);
  await step(page, 5);
  const s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(s.lang, 'ar', 'a first visit starts in Arabic');
  assert.equal(await page.locator('#btnAr').evaluate(b => b.classList.contains('ring')), true);
  assert.deepEqual(await page.evaluate(() => tt.stats), [], 'the title starts no round');
  await page.locator('[data-lang="en"]').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('.pebble.next').getAttribute('data-w'), '0');
  assert.equal(await page.locator('.pebble[data-w="1"][data-l="0"]').evaluate(b => b.classList.contains('locked')), true);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.tt.step);
  assert.equal((await state(page)).lang, 'en', 'the language choice is saved');
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.deepEqual([(await state(page)).screen, (await state(page)).lang], ['map', 'en'], 'Enter picks the remembered language');
  // A locked level wiggles and stays on the map.
  await page.locator('.pebble[data-w="2"][data-l="1"]').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'map');
});

test('a level reads the tier, starts a round, and the lit key pops the cloud; the first coach is reported', async t => {
  const page = await game(t, { save: SAVE({ coach: false }), dda: { _: { en: [0.05, 3] } } });
  await openLevel(page, 'en');
  let s = await state(page);
  assert.equal(s.tier, 1, 'a low DDA level plays tier 1');
  assert.equal(s.wait, true, 'tier 1 clouds wait at the edge');
  assert.ok(await until(page, '!!s.next'), 'a cloud comes in');
  s = await state(page);
  assert.ok(s.nextKey, 'the next key always glows');
  const letter = s.next;
  await page.keyboard.type(letter);
  await step(page, 2);
  s = await state(page);
  assert.equal(s.keys, 1);
  assert.equal(s.done, 1, 'a one-letter cloud pops with one key');
  const calls = await page.evaluate(() => tt.stats);
  assert.deepEqual(calls.filter(c => c[0] === 'round'), [['round', 'en1L1']]);
  assert.deepEqual(calls.filter(c => c[0] === 'tutorial').map(c => c[1]), ['start', 'done']);
  const track = await page.evaluate(() => tt.track);
  assert.ok(track.includes('cue') && track.includes('hit'), 'a cue when the cloud can be typed, a hit for the key');
  assert.equal((await page.evaluate(() => __game.save)).coach, true, 'the coach is saved as done');
  // The idle hand shows the key after a few seconds of waiting.
  assert.ok(await until(page, 's.ghost', 60 * 6), 'the coach hand comes back while the child waits');
});

test('a wrong key shakes the cloud and costs accuracy, never progress; Backspace and Space are never needed', async t => {
  const page = await game(t, { save: SAVE({ stars: { ar: grid(0), en: grid(1) } }), dda: { _: { en: [0.3, 3] } } });
  await openLevel(page, 'en', 1, 0);
  assert.ok(await until(page, '!!s.next'));
  const s0 = await state(page);
  const target = s0.clouds.find(c => c.text[0] === s0.next);
  await page.keyboard.type(s0.next);
  await step(page);
  let s = await state(page);
  assert.equal(s.lock, target.id, 'the first letter locks onto that cloud');
  const wrong = 'qzxjv'.split('').find(c => c !== s.next);
  await page.keyboard.type(wrong);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Space');
  await step(page);
  s = await state(page);
  assert.deepEqual([s.keys, s.errors], [1, 1], 'one wrong key; Backspace and Space cost nothing');
  assert.equal(s.clouds.find(c => c.id === target.id).typed, 1, 'nothing has to be erased');
  await page.keyboard.type(s.rest);
  await step(page, 2);
  s = await state(page);
  assert.equal(s.done, 1, 'typing the rest pops the cloud');
  assert.equal(s.errors, 1);
  assert.equal((await page.evaluate(() => tt.track)).filter(x => x === 'miss').length, 1, 'one miss per wrong key');
});

test('an Arabic level counts the physical keys when the PC is set to English, and «لا» is one B press', async t => {
  const page = await game(t, { save: SAVE({ lang: 'ar', stars: { ar: [[3, 3, 3, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], en: grid(0) } }), dda: { _: { ar: [0.05, 3] } } });
  await openLevel(page, 'ar', 0, 3);
  for (let i = 0; i < 3; i++) {
    assert.ok(await until(page, '!!s.nextKey'));
    const s = await state(page);
    assert.match(s.next, /[؀-ۿ]/, 'Arabic words');
    await page.keyboard.press(s.nextKey); // the English layout sends Latin letters
    await step(page);
    assert.ok((await state(page)).keys > i, 'the key of the lit letter counts');
  }
  // «لا» on B: a world-1 cloud holding it pops with one press.
  await page.evaluate(() => {
    const w = __game.engine;
    window.lam = w.match('لا', 0, { key: 'b', code: 'KeyB' }, 'ar');
  });
  assert.equal(await page.evaluate(() => window.lam), 2);
});

test('Esc and the pause button pause; a paused level stays frozen; P is a letter; focus never resumes', async t => {
  const page = await game(t, { save: SAVE({ stars: { ar: grid(0), en: grid(2) } }), dda: { _: { en: [0.7, 6] } } });
  await openLevel(page, 'en', 2, 0);
  assert.ok(await until(page, '!!s.next'));
  await page.keyboard.press('KeyP');
  await step(page);
  assert.equal((await state(page)).screen, 'play', 'P never pauses: it is a letter');
  await page.keyboard.press('Escape');
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'pause');
  const frozen = JSON.stringify([s.t, s.clouds]);
  await step(page, 120);
  assert.equal(JSON.stringify([(await state(page)).t, (await state(page)).clouds]), frozen, 'nothing moves while paused');
  await page.keyboard.type('abc');
  await step(page);
  assert.equal((await state(page)).keys, s.keys, 'letters do nothing on the pause screen');
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
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
  await step(page, 30);
  assert.equal((await state(page)).screen, 'pause', 'coming back does not resume by itself');
  await page.locator('#btnRestart').click();
  await step(page);
  s = await state(page);
  assert.deepEqual([s.screen, s.keys, s.done], ['play', 0, 0], 'Restart starts the level again');
  const rounds = (await page.evaluate(() => tt.stats)).filter(c => c[0] === 'round').map(c => c[1]);
  assert.deepEqual(rounds, ['en3L1', 'en3L1']);
});

test('a finished level shows its stars, saves at once (also after a reload), and Enter goes on', async t => {
  const page = await game(t, { save: SAVE(), dda: { _: { en: [0.05, 3] } } });
  await openLevel(page, 'en', 0, 0);
  assert.ok(await typeLevel(page, { per: 20 }), 'the level ends');
  assert.ok(await until(page, 's.screen === "result"', 60 * 4));
  const s = await state(page);
  assert.ok(s.stars >= 1 && s.stars <= 3);
  assert.equal((await page.evaluate(() => __game.save)).stars.en[0][0], s.stars, 'saved before the celebration');
  const end = (await page.evaluate(() => tt.stats)).find(c => c[0] === 'end');
  assert.equal(end[1], 'win'); assert.ok(Number.isInteger(end[2]) && end[2] >= 0, 'the score is the speed in words per minute');
  // The result ignores keys for a moment (a child still typing never skips it), then Enter goes on.
  await page.keyboard.press('Enter');
  await step(page);
  assert.equal((await state(page)).screen, 'result');
  await step(page, 60);
  await page.keyboard.press('Enter');
  await step(page);
  const n = await state(page);
  assert.deepEqual([n.screen, n.world, n.level], ['play', 0, 1], 'Enter plays the next level');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.tt.step);
  assert.equal((await page.evaluate(() => __game.save)).stars.en[0][0], s.stars, 'the stars survive a reload');
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await page.locator('.pebble.next').getAttribute('data-l'), '1');
});

test('a level where every cloud reaches the town ends gently and offers another try', async t => {
  const page = await game(t, { save: SAVE({ stars: { ar: grid(0), en: grid(3) } }), dda: { _: { en: [0.95, 9] } } });
  await openLevel(page, 'en', 3, 0);
  assert.equal((await state(page)).tier, 5);
  assert.ok(await until(page, 's.screen === "result"', 60 * 120), 'without typing, the suns are rained out');
  const s = await state(page);
  assert.deepEqual([s.suns, s.stars], [0, 0]);
  assert.equal(await page.locator('#resRainy').isVisible(), true);
  assert.equal(await page.locator('#resAgain').isVisible(), false);
  assert.equal((await page.evaluate(() => tt.stats)).find(c => c[0] === 'end')[1], 'lose');
  await step(page, 60);
  await page.keyboard.press('KeyR');
  await step(page);
  assert.deepEqual([(await state(page)).screen, (await state(page)).world], ['play', 3], 'R tries the same level again');
});

test('a failed save shows the warning, keeps playing, and Retry saves', async t => {
  const page = await game(t, { save: SAVE(), failSave: true });
  await page.locator('[data-lang="ar"]').click();
  await step(page, 2);
  assert.equal(await page.locator('.sg-save-status').isVisible(), true, 'the save warning shows');
  assert.equal((await state(page)).screen, 'map', 'the game goes on');
  await page.evaluate(() => { window.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('sg:typing-test:save'))).lang, 'ar', 'Retry saved');
});

test('the speed test: the clock starts at the first key, stops at 30 s, and keeps a best and a history', async t => {
  const page = await game(t, { save: SAVE({ best: { ar30: 0, ar60: 0, en30: 5, en60: 0 }, tests: [{ k: 'en30', w: 5, a: 90, c: 0 }] }) });
  await page.locator('#btnTest').click();
  await step(page);
  assert.equal((await state(page)).screen, 'setup');
  await page.locator('[data-tlang="en"]').click();
  await page.locator('[data-tdur="30"]').click();
  await page.keyboard.press('Enter');
  await step(page);
  let s = await state(page);
  assert.deepEqual([s.screen, s.mode, s.test.dur, s.test.started], ['test', 'test', 30, false]);
  await step(page, 120);
  assert.equal((await state(page)).test.t, 0, 'nothing runs before the first key');
  // 3 keys a second for 30 s.
  for (let i = 0; i < 95; i++) {
    s = await state(page);
    if (s.screen !== 'test' || s.over) break;
    await page.keyboard.press(s.nextKey);
    await page.evaluate(() => tt.run(20));
  }
  assert.ok(await until(page, 's.screen === "tresult"', 60 * 3));
  s = await state(page);
  assert.ok(s.result.wpm > 25 && s.result.wpm < 45, 'about 36 words a minute: ' + s.result.wpm);
  assert.equal(s.result.acc, 100);
  assert.equal(s.result.best, true, 'a new personal best');
  const save = await page.evaluate(() => __game.save);
  assert.equal(save.best.en30, s.result.wpm);
  assert.equal(save.tests.length, 2);
  const stats = await page.evaluate(() => tt.stats);
  assert.deepEqual(stats.filter(c => c[0] === 'round').map(c => c[1]), ['test30']);
  assert.equal(stats.find(c => c[0] === 'end')[2], Math.round(s.result.wpm));
  await step(page, 60);
  await page.keyboard.press('KeyR');
  await step(page);
  assert.equal((await state(page)).screen, 'test', 'R starts another test');
});

test('a class code typed on two PCs gives both exactly the same words; the code is never in statistics', async t => {
  const words = [];
  let code = '';
  for (let pc = 0; pc < 2; pc++) {
    const page = await game(t);
    if (!pc) {
      await page.locator('#btnClass').click();
      await step(page);
      await page.locator('#teacherBtn').click();
      await page.locator('[data-p="4"]').click();
      code = await page.locator('#showCode').textContent();
      assert.match(code, /^4\d{3}$/);
      await page.locator('#showPlay').click();
    } else {
      await page.locator('#btnClass').click();
      await step(page);
      await page.keyboard.type(code.slice(0, 3));
      await page.keyboard.press('Backspace');
      await page.keyboard.type(code.slice(2));
      assert.equal((await state(page)).typedCode, code);
      await page.keyboard.press('Enter');
    }
    await step(page);
    const s = await state(page);
    assert.deepEqual([s.screen, s.mode, s.code, s.test.lang, s.test.dur], ['test', 'class', code, 'ar', 60]);
    words.push(s.test.words);
    const stats = JSON.stringify(await page.evaluate(() => tt.stats));
    assert.ok(stats.includes('"class"') && !stats.includes(code), 'round id class, never the code');
  }
  assert.deepEqual(words[0], words[1]);
  // A code that is not a test wiggles and empties.
  const page = await game(t);
  await page.locator('#btnClass').click();
  await page.keyboard.type('9123');
  await page.keyboard.press('Enter');
  await step(page);
  assert.deepEqual([(await state(page)).screen, (await state(page)).typedCode], ['klass', '']);
  await page.keyboard.press('Escape');
  await step(page);
  assert.equal((await state(page)).screen, 'title');
});

test('reduced motion: the level still plays, pops and shows its stars', async t => {
  const page = await game(t, { save: SAVE(), dda: { _: { en: [0.05, 3] } }, reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => Kit.motion.reduced()), true);
  await openLevel(page, 'en', 0, 0);
  assert.ok(await typeLevel(page, { per: 20 }));
  assert.ok(await until(page, 's.screen === "result"', 60 * 4));
  await step(page, 120);
  const s = await state(page);
  assert.equal(await page.locator('#resStars svg.on').count(), s.stars, 'every star earned is shown');
  assert.equal(await page.locator('#resStars svg.on').first().isVisible(), true);
});

test('the mute button mutes without binding M, which stays a letter', async t => {
  const page = await game(t, { save: SAVE(), dda: { _: { en: [0.05, 3] } } });
  assert.equal(await page.locator('.sg-mute').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('KeyM');
  assert.equal(await page.locator('.sg-mute').getAttribute('aria-pressed'), 'false', 'M does not mute');
  await page.locator('.sg-mute').click();
  assert.equal(await page.locator('.sg-mute').getAttribute('aria-pressed'), 'true');
});

test('the layout fits a small portal frame: the UI layer follows the canvas', async t => {
  const page = await game(t, { viewport: { width: 1100, height: 620 } });
  await step(page, 2);
  const box = await page.evaluate(() => {
    const c = document.getElementById('game').getBoundingClientRect(), b = document.getElementById('btnEn').getBoundingClientRect();
    return { c: [c.left, c.top, c.width, c.height], b: [b.left, b.top, b.right, b.bottom] };
  });
  assert.ok(box.c[2] <= 1100 && box.c[3] <= 620 && Math.abs(box.c[2] / box.c[3] - 16 / 9) < 0.01);
  assert.ok(box.b[0] >= box.c[0] && box.b[2] <= box.c[0] + box.c[2] && box.b[3] <= box.c[1] + box.c[3], 'the buttons stay on the canvas');
});

// Embedded like in the portal: rounds, ends and telemetry reach the parent.
test('statistics and telemetry reach a stub portal with valid round ids, hits, misses and a reaction time', async t => {
  const ctx = await context(t, { save: SAVE() });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/tt-parent`);
  const frame = page.frames().find(f => f.url().includes('/games/typing-test/'));
  await frame.waitForFunction(() => window.__game && window.Kit);
  await page.waitForFunction(() => window.msgs.some(m => m && m.type === 'sg:ready'));
  await page.evaluate(() => prefs({ band: '6-7', player: '', telemetry: true }));
  await frame.waitForFunction(() => Kit.profile.band === '6-7');
  await frame.locator('[data-lang="en"]').click();
  await frame.locator('.pebble[data-w="0"][data-l="0"]').click();
  await frame.waitForFunction(() => __game.state.screen === 'play' && !!__game.state.next, null, { timeout: 15000 });
  assert.equal(await frame.evaluate(() => __game.state.tier), 1, 'a six-year-old starts at tier 1');
  await page.waitForTimeout(400);
  await page.keyboard.press(await frame.evaluate(() => __game.state.nextKey === 'KeyQ' ? 'KeyZ' : 'KeyQ'));
  await page.keyboard.press(await frame.evaluate(() => __game.state.nextKey));
  await frame.waitForFunction(() => __game.state.done >= 1);
  await page.keyboard.press('Escape');
  await frame.waitForFunction(() => __game.state.screen === 'pause');
  await frame.locator('#btnMap').click();
  await page.waitForFunction(() => msgs.some(m => m.type === 'sg:telemetry' && m.ev.some(e => e[0] === 're' && e[2] === 'en1L1')));
  const msgs = await page.evaluate(() => window.msgs);
  const events = msgs.filter(m => m.type === 'sg:stats').flatMap(m => m.r);
  const starts = events.filter(e => e[0] === 's').map(e => e[1]);
  assert.deepEqual(starts, ['en1L1']);
  for (const id of starts) { assert.match(id, ID); assert.doesNotMatch(id, /\d{3}/); }
  assert.ok(events.some(e => e[0] === 'q' && e[1] === 'en1L1'), 'leaving a level is a quit');
  const tm = msgs.filter(m => m.type === 'sg:telemetry').flatMap(m => m.ev);
  assert.deepEqual(tm.filter(e => e[0] === 'rs').map(e => [e[1], e[2]]), [['en1L1', 1]], 'the round start carries the tier');
  const re = tm.find(e => e[0] === 're' && e[2] === 'en1L1');
  assert.equal(re[1], 'q');
  assert.ok(re[6] >= 1, 'a hit for the right key'); assert.ok(re[7] >= 1, 'a miss for the wrong key');
  assert.ok(re[8].reduce((a, b) => a + b, 0) >= 1, 'a reaction time from the cloud to the first key');
});

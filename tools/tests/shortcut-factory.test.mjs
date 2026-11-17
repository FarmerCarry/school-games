// Shortcut Factory (مصنع الاختصارات — Cyber-Bot Cloner & Blaster) in real Chromium:
// real clicks, clickable bottom keycap dock badges, and real Ctrl+C / Ctrl+V / Ctrl+X /
// Ctrl+Z / Ctrl+Y / Ctrl+A / Ctrl+S / Delete / Backspace / Tab / Space / Arrow / Enter
// shortcuts across keyboard layouts (including Arabic «ؤ»/«ر» with KeyC/KeyV), all 12 open
// missions across 3 tiers + Endless Cyber-Rush, Saboteur chrono-bonks, pause/resume/restart,
// workshop persistence + QuotaExceededError retry, and reduced motion.
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

const SAVE = (done = 0, extra = {}) => ({
  coins: 0,
  stars: Array.from({ length: 12 }, (_, i) => (i < done ? 2 : 0)),
  bestScore: Array.from({ length: 13 }, (_, i) => (i < done ? 220 : 0)),
  theme: 'cyan',
  armor: 'std',
  themes: ['cyan'],
  armors: ['std'],
  ...extra
});

// Launch the game with deterministic manual frame stepping (sf.step / sf.run),
// Kit.dda outcome recording (sf.results), and optional storage quota failure (sf.failSave).
async function game(t, { save, dda = 0.35, reducedMotion = 'no-preference', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => {
    await ctx.close();
    assert.deepEqual(errors, [], 'no console or page errors');
    assert.deepEqual(requests, [], 'no external network requests');
  });
  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('sf-seeded')) {
      sessionStorage.setItem('sf-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:shortcut-factory:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const sf = window.sf = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          sf.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          sf.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const make = kit.dda;
        kit.dda = (slug, opts) => {
          const control = make.call(kit, slug, Object.assign({ start: dda }, opts));
          const origResult = control.result;
          control.result = outcome => { sf.results.push(outcome); return origResult.call(control, outcome); };
          return control;
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:shortcut-factory:save' && window.sf && window.sf.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/shortcut-factory/`);
  await page.waitForFunction(() => window.__game && window.sf && window.sf.step);
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => sf.run(n), n);
const frames = (page, n = 1) => page.evaluate(n => sf.step(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:shortcut-factory:save');
  return raw ? JSON.parse(raw) : null;
});

async function until(page, cond, max = 3600, every = 6) {
  return page.evaluate(({ cond, max, every }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += every) { if (ok(__game.state)) return true; sf.run(every); }
    return ok(__game.state);
  }, { cond, max, every });
}

async function watchKeys(page) {
  await page.evaluate(() => {
    window.sfKeys = [];
    window.addEventListener('keydown', e => {
      window.sfKeys.push({ code: e.code, key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, prevented: e.defaultPrevented });
    });
  });
}
const keys = page => page.evaluate(() => window.sfKeys.splice(0));

async function press(page, key) { await page.keyboard.press(key); await step(page); }

async function clickBot(page, id) {
  const p = await page.evaluate(id => __game.toyPoint(id), id);
  assert.ok(p, `toyPoint(${id}) should exist`);
  await page.mouse.click(p.x, p.y);
  await step(page);
}

async function clickDock(page, id) {
  const p = await page.evaluate(id => __game.dockPoint(id), id);
  assert.ok(p, `dockPoint(${id}) should exist`);
  await page.mouse.click(p.x, p.y);
  await step(page);
}

async function startMissionFromMap(page, index) {
  const s0 = await state(page);
  if (s0.screen === 'title') { await page.locator('#btnLevels').click(); await step(page); }
  else if (s0.screen !== 'map') { await page.evaluate(() => document.getElementById('resMap').click()); await step(page); }
  assert.equal((await state(page)).screen, 'map');
  if (index === 12) await page.locator('#mapRush').click();
  else await page.locator('.mcard').nth(index).click();
  await step(page);
  assert.equal((await state(page)).level, index);
  if ((await state(page)).demo) await press(page, 'Enter');
  assert.equal((await state(page)).demo, false);
}

const visibleHero = (s, kind) =>
  s.belts.flatMap(b => b.items).find(it => it.visible && !it.virus && (!kind || it.kind === kind));
const visibleVirus = s =>
  s.belts.flatMap(b => b.items).find(it => it.visible && it.virus);

const HINT_KEYS = {
  copy: 'Control+KeyC',
  paste: 'Control+KeyV',
  cut: 'Control+KeyX',
  delete: 'Delete',
  undo: 'Control+KeyZ',
  redo: 'Control+KeyY',
  selectAll: 'Control+KeyA',
  saveShip: 'Control+KeyS'
};

async function playGuided(page, { maxActions = 180, pace = 10 } = {}) {
  for (let i = 0; i < maxActions; i++) {
    const s = await state(page);
    if (s.screen !== 'play') return s;
    if (s.phase === 'win' || s.phase === 'lose') { await step(page, 65); return state(page); }
    const h = await page.evaluate(() => __game.hint);
    if (!h) { await step(page, pace); continue; }
    if (h.act === 'select') {
      if (h.targetId) await clickBot(page, h.targetId);
      else await press(page, 'Space');
    } else if (HINT_KEYS[h.act]) {
      await press(page, HINT_KEYS[h.act]);
    }
    await step(page, pace);
  }
  return state(page);
}

test('title screen shows Arabic Cyber-Bot guide & 0/36 stars; Play opens sf_m1 with brief keycap demo that closes on Enter or auto-timer', async t => {
  const page = await game(t);
  await frames(page, 30);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/36');
  assert.match(await page.locator('.howto').textContent(), /استنساخ الآلي[\s\S]*Ctrl\+C/);

  await page.locator('#btnPlay').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 0);
  assert.equal(s.id, 'sf_m1');
  assert.equal(s.demo, true);
  assert.equal(s.timeLimit, 0, 'Tier 0 easy missions have zero fail-timer stress');

  // Behind the intro card, belt motion pauses until demo closes.
  const off0 = s.offset;
  await frames(page, 30);
  assert.equal((await state(page)).offset, off0);
  assert.equal((await state(page)).demo, true);

  await press(page, 'Enter');
  s = await state(page);
  assert.equal(s.demo, false);
  assert.ok(visibleHero(s, 'laser'), 'a visible hero bot is immediately ready on belt 0');

  await frames(page, 20);
  assert.ok((await state(page)).offset > off0, 'conveyor belt rolls smoothly once demo closes');

  // Verify the intro demo also auto-closes after ~1.15s without user input.
  const autoPage = await game(t);
  await autoPage.locator('#btnPlay').click();
  assert.equal((await state(autoPage)).demo, true);
  assert.ok(await until(autoPage, '!s.demo', 120), 'demo auto-closes within ~1.2s');
});

test('real Ctrl+C & Ctrl+V AND clickable bottom dock badges clone Cyber-Bots, win sf_m1 with 3 stars, and keep focus/scroll/selection clean', async t => {
  const page = await game(t);
  await watchKeys(page);
  await page.locator('#btnPlay').click();
  await step(page);
  await press(page, 'Enter');

  let s = await state(page);
  const bot = visibleHero(s, 'laser');
  assert.ok(bot, 'laser bot visible on belt');

  // 1) Real mouse click on bot + keyboard Control+KeyC + Control+KeyV
  await clickBot(page, bot.id);
  assert.deepEqual((await state(page)).sel, [bot.id]);
  await press(page, 'Control+KeyC');
  s = await state(page);
  assert.deepEqual(s.clip, { cut: false, kinds: ['laser'] });
  await press(page, 'Control+KeyV');
  s = await state(page);
  assert.equal(s.boxes[0].items.length, 1);

  // 2) Clickable bottom keycap dock badges (for 5-6yo beginners): select, copy, and paste x2!
  await press(page, 'Escape'); // quick check or keep in play? Let's test dock clicks directly in play:
  await press(page, 'Escape'); // resumes right back to play
  assert.equal((await state(page)).screen, 'play');

  // Clear selection first by clicking empty factory floor, then use dock 'select' + 'copy' + 'paste'
  const emptyPt = await page.evaluate(() => __game.point(640, 520));
  await page.mouse.click(emptyPt.x, emptyPt.y);
  await step(page);

  await clickDock(page, 'select');
  assert.equal((await state(page)).sel.length, 1, 'clicking Select badge locks onto a bot');
  await clickDock(page, 'copy');
  assert.deepEqual((await state(page)).clip, { cut: false, kinds: ['laser'] });
  await clickDock(page, 'paste');
  assert.equal((await state(page)).boxes[0].items.length, 2);
  await clickDock(page, 'paste');

  // Pod is now 3/3 full -> launches and completes sf_m1!
  assert.ok(await until(page, 's.screen === "result"', 180), 'mission finishes to result screen');
  await frames(page, 70); // let all 3 star pop animations fire
  s = await state(page);
  assert.deepEqual(s.result, { win: true, stars: 3, coins: 31, best: true });
  assert.equal(await page.locator('#resStars svg.on').count(), 3);
  assert.equal((await stored(page)).stars[0], 3);
  assert.equal((await stored(page)).coins, 31);
  assert.deepEqual(await page.evaluate(() => window.sf.results), [1]);

  // Verify browser default actions were prevented and page never selected text, scrolled, or lost canvas focus during play.
  const seen = await keys(page);
  assert.ok(seen.some(k => k.code === 'KeyC' && k.ctrl && k.prevented));
  assert.ok(seen.some(k => k.code === 'KeyV' && k.ctrl && k.prevented));
  assert.equal(await page.evaluate(() => String(window.getSelection())), '');
  assert.equal(s.scrollX, 0);
  assert.equal(s.scrollY, 0);

  // Clicking Next advances directly into Mission 2 (sf_m2).
  await page.locator('#resNext').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.level, 1);
  assert.equal(s.id, 'sf_m2');
});

test('Arabic keyboard layout (event.key «ؤ»/«ر» with KeyC/KeyV) and Meta+V work; browser shortcuts Ctrl+W/T/N/P/R & F5 are left alone', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);
  await press(page, 'Enter');
  await watchKeys(page);

  const bot = visibleHero(await state(page), 'laser');
  await clickBot(page, bot.id);

  // Dispatch real CDP key events simulating Windows/Linux Arabic keyboard layout where KeyC produces «ؤ» and KeyV produces «ر».
  const cdp = await page.context().newCDPSession(page);
  const ctrlCombo = async (code, key, vk) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ControlLeft', key: 'Control', windowsVirtualKeyCode: 17, modifiers: 2 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key, windowsVirtualKeyCode: vk, modifiers: 2 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk, modifiers: 2 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ControlLeft', key: 'Control', windowsVirtualKeyCode: 17, modifiers: 0 });
    await step(page);
  };
  await ctrlCombo('KeyC', 'ؤ', 67);
  assert.deepEqual((await state(page)).clip, { cut: false, kinds: ['laser'] }, 'Arabic layout Ctrl+ؤ copies via physical KeyC');
  await ctrlCombo('KeyV', 'ر', 86);
  assert.equal((await state(page)).boxes[0].items.length, 1, 'Arabic layout Ctrl+ر pastes via physical KeyV');

  // Meta+KeyV (macOS Command+V) also deploys from the Holo-Cloner.
  await press(page, 'Meta+KeyV');
  assert.equal((await state(page)).boxes[0].items.length, 2, 'Meta+KeyV deploys second clone');

  // Browser tab/print/reload shortcuts must NOT be hijacked by the game.
  await keys(page);
  const browserCheck = await page.evaluate(() => {
    const probe = (code, ctrl) => {
      const ev = new KeyboardEvent('keydown', { code, key: code.replace('Key', '').toLowerCase(), ctrlKey: ctrl, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    return {
      ctrlW: probe('KeyW', true),
      ctrlT: probe('KeyT', true),
      ctrlN: probe('KeyN', true),
      ctrlP: probe('KeyP', true),
      ctrlR: probe('KeyR', true),
      f5: probe('F5', false)
    };
  });
  assert.deepEqual(browserCheck, { ctrlW: false, ctrlT: false, ctrlN: false, ctrlP: false, ctrlR: false, f5: false });
});

test('all 12 missions across 3 tiers + Endless Rush are open from start; Delete zaps viruses, Ctrl+X cuts misplaced bots, and Ctrl+Z / Ctrl+Y rewind & redo', async t => {
  const page = await game(t);
  await page.locator('#btnLevels').click();
  await step(page);
  assert.equal((await state(page)).screen, 'map');
  assert.equal(await page.locator('.tier-row').count(), 3, '3 difficulty tiers rendered');
  assert.equal(await page.locator('.mcard').count(), 12, 'all 12 missions rendered');
  assert.equal(await page.locator('.mcard:disabled').count(), 0, 'all 12 missions unlocked from the start');
  assert.equal(await page.locator('#mapRush').isDisabled(), false, 'Endless Cyber-Rush unlocked');

  // Mission 3 (sf_m3, index 2): Delete & Backspace vaporize virus glitch-bombs!
  await page.locator('.mcard').nth(2).click();
  await step(page);
  await press(page, 'Enter');
  assert.equal((await state(page)).id, 'sf_m3');
  assert.ok(await until(page, 's.belts[0].items.some(i => i.visible && i.virus)', 240));
  const vBefore = visibleVirus(await state(page));
  assert.ok(vBefore);
  await press(page, 'Delete');
  assert.ok(!(await state(page)).belts[0].items.some(i => i.id === vBefore.id), 'Delete vaporizes virus bomb');

  // Spawn or wait for next virus and test Backspace too.
  assert.ok(await until(page, 's.belts[0].items.some(i => i.visible && i.virus)', 400));
  const vNext = visibleVirus(await state(page));
  await clickBot(page, vNext.id);
  await press(page, 'Backspace');
  assert.ok(!(await state(page)).belts[0].items.some(i => i.id === vNext.id), 'Backspace also zaps selected virus bomb');

  // Mission 5 (sf_m5, index 4): Ctrl+X cuts misplaced shark from laser pod -> Ctrl+V drops into shark pod -> Ctrl+Z & Ctrl+Y!
  await page.locator('#btnPause').click();
  await step(page);
  await page.locator('#btnMenu').click();
  await step(page);
  await startMissionFromMap(page, 4);
  let s = await state(page);
  assert.equal(s.id, 'sf_m5');
  const wrongShark = s.boxes[0].items.find(it => it.kind === 'shark');
  assert.ok(wrongShark, 'laser pod starts with a misplaced shark bot');

  await clickBot(page, wrongShark.id);
  await press(page, 'Control+KeyX');
  s = await state(page);
  assert.deepEqual(s.clip, { cut: true, kinds: ['shark'] });
  assert.equal(s.boxes[0].items.length, 1, 'misplaced bot lifted out of pod 0');

  // Test Ctrl+Z undo & Ctrl+Y / Ctrl+Shift+KeyZ redo before pasting!
  await press(page, 'Control+KeyZ');
  assert.equal((await state(page)).boxes[0].items.length, 2, 'Ctrl+Z restores cut bot back into pod 0');
  await press(page, 'Control+KeyY');
  assert.equal((await state(page)).boxes[0].items.length, 1, 'Ctrl+Y redoes the warp-cut');
  await press(page, 'Control+KeyZ');
  assert.equal((await state(page)).boxes[0].items.length, 2);
  await press(page, 'Control+Shift+KeyZ');
  assert.equal((await state(page)).boxes[0].items.length, 1, 'Ctrl+Shift+Z also redoes');

  // Paste the cut shark into pod 1 (shark pod, which had 1/2 sharks -> now 2/2 and launches!).
  await press(page, 'Control+KeyV');
  s = await state(page);
  assert.equal(s.clip, null, 'cut clipboard is consumed after paste');
  assert.equal(s.boxes[1].launched, true, 'shark pod launches once filled');

  // Finish the rest of Mission 5 with guided play.
  await playGuided(page);
  assert.ok(await until(page, 's.screen === "result"', 240));
  assert.equal((await state(page)).result.win, true);
});

test('Saboteur glitch recovery (Ctrl+Z), preRedo echo (Ctrl+Y), multi-select (Tab / Shift+Arrow / Shift+Click / Ctrl+A) & Mega Launch (Ctrl+S), plus Rush & DDA scaling', async t => {
  // Compare low vs high DDA belt speed & time limit on Tier 2 Mission 9 (sf_m9, index 8).
  const calmPage = await game(t, { dda: 0.05 });
  await startMissionFromMap(calmPage, 8);
  const calmState = await state(calmPage);

  const proPage = await game(t, { dda: 0.95 });
  await startMissionFromMap(proPage, 8);
  const proState = await state(proPage);
  assert.ok(proState.speed > calmState.speed, 'higher DDA increases belt speed');
  assert.ok(proState.timeLimit < calmState.timeLimit, 'higher DDA tightens mission clock');

  // Mission 7 (sf_m7, index 6): pre-sabotaged pod item is repaired by Ctrl+Z, and live Saboteur attack is bonked!
  const page = await game(t);
  await startMissionFromMap(page, 6);
  let s = await state(page);
  assert.equal(s.id, 'sf_m7');
  assert.equal(s.boxes[0].items[0].glitched, true, 'pod 0 starts with Saboteur glitch');
  await press(page, 'Control+KeyZ');
  s = await state(page);
  assert.equal(s.boxes[0].items[0].glitched, false, 'Ctrl+Z rewinds Saboteur sabotage');

  // Advance until the live Saboteur strikes a pod, then bonk it with Ctrl+Z!
  assert.ok(await until(page, 's.saboteur === "laugh"', 1400));
  const bonksBefore = (await state(page)).bonks;
  await press(page, 'Control+KeyZ');
  s = await state(page);
  assert.equal(s.bonks, bonksBefore + 1, 'Ctrl+Z bonks the live Saboteur and repairs pod');
  assert.equal(s.saboteur, 'away');

  // Mission 8 (sf_m8, index 7): preRedo stack deploys bots immediately on Ctrl+Y!
  await page.locator('#btnPause').click(); await step(page);
  await page.locator('#btnMenu').click(); await step(page);
  await startMissionFromMap(page, 7);
  s = await state(page);
  assert.equal(s.redo, 2);
  await press(page, 'Control+KeyY');
  await press(page, 'Control+KeyY');
  assert.equal((await state(page)).boxes[0].launched, true, 'two Ctrl+Y presses replay future echo and launch drone pod');

  // Mission 11 (sf_m11, index 10): Tab / Shift+ArrowLeft / Shift+Click / Ctrl+A multi-clone + Ctrl+S Mega Fleet Launch!
  await page.locator('#btnPause').click(); await step(page);
  await page.locator('#btnMenu').click(); await step(page);
  await startMissionFromMap(page, 10);
  s = await state(page);
  assert.equal(s.id, 'sf_m11');

  await press(page, 'Tab');
  assert.equal((await state(page)).sel.length, 1, 'Tab selects rightmost visible bot');
  await press(page, 'Shift+ArrowLeft');
  assert.equal((await state(page)).sel.length, 2, 'Shift+ArrowLeft adds next bot to selection');

  // Shift+Click toggles/adds another visible hero bot.
  const heroes = (await state(page)).belts.flatMap(b => b.items).filter(it => it.visible && !it.virus);
  await clickBot(page, heroes[0].id);
  const secondPt = await page.evaluate(id => __game.toyPoint(id), heroes[1].id);
  await page.keyboard.down('Shift');
  await page.mouse.click(secondPt.x, secondPt.y);
  await page.keyboard.up('Shift');
  await step(page);
  assert.equal((await state(page)).sel.length, 2, 'Shift+Click selects two bots simultaneously');

  // Ctrl+A locks onto ALL visible hero bots on both belts!
  await press(page, 'Control+KeyA');
  assert.ok((await state(page)).sel.length >= 3, 'Ctrl+A multi-locks all visible hero bots');
  await press(page, 'Control+KeyC');
  await press(page, 'Control+KeyV');
  await press(page, 'Control+KeyV');

  // Guide until all 3 pods are ready and megaReady lights up, then fire Ctrl+S!
  for (let i = 0; i < 120 && !(await state(page)).megaReady; i++) {
    const h = await page.evaluate(() => __game.hint);
    if (h && h.act === 'select' && h.targetId) await clickBot(page, h.targetId);
    else if (h && HINT_KEYS[h.act] && h.act !== 'saveShip') await press(page, HINT_KEYS[h.act]);
    await step(page, 8);
  }
  assert.equal((await state(page)).megaReady, true, 'all pods filled and waiting for Ctrl+S Mega Launch');
  await press(page, 'Control+KeyS');
  assert.ok(await until(page, 's.screen === "result"', 200), 'Ctrl+S triggers Mega Rocket Launch and completes mission with zero paperwork modals');
  assert.equal((await state(page)).result.win, true);

  // Endless Cyber-Rush (sf_rush, index 12) from map: score a wave (+10s bonus up to 99s) and finish cleanly when timer expires.
  await page.locator('#resMap').click(); await step(page);
  await startMissionFromMap(page, 12);
  assert.equal((await state(page)).id, 'sf_rush');
  await press(page, 'Control+KeyA');
  await press(page, 'Control+KeyC');
  await press(page, 'Control+KeyV');
  await press(page, 'Control+KeyV');
  assert.ok((await state(page)).launchedCount >= 1, 'at least one pod launched in Endless Rush');
  assert.ok(await until(page, 's.screen === "result"', 60 * 115, 300));
  assert.equal((await state(page)).result.win, true, 'Endless Cyber-Rush ends as a celebratory run summary');

  // Timed campaign lose & retry: letting proPage (sf_m9) run out of time records 0 stars and #resNext retries sf_m9.
  assert.ok(await until(proPage, 's.screen === "result"', 60 * 120, 300));
  assert.deepEqual((await state(proPage)).result, { win: false, stars: 0, coins: 0, best: false });
  await proPage.locator('#resNext').click();
  await step(proPage);
  assert.equal((await state(proPage)).screen, 'play');
  assert.equal((await state(proPage)).id, 'sf_m9');
});

test('pause (#btnPause, KeyP, Escape, window blur) freezes world snapshot; resume & restart (#btnRestart, KeyR) work cleanly', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await step(page);
  await press(page, 'Enter');

  const bot = visibleHero(await state(page), 'laser');
  await clickBot(page, bot.id);
  await press(page, 'Control+KeyC');
  await press(page, 'Control+KeyV');
  assert.equal((await state(page)).boxes[0].items.length, 1);

  const snapOf = s => [s.time, s.offset, s.boxes, s.clip, s.sel];

  // 1) Pause via #btnPause freezes simulation completely across 120 frames.
  await page.locator('#btnPause').click();
  await step(page);
  let s = await state(page);
  assert.equal(s.screen, 'pause');
  assert.equal(s.paused, true);
  const frozen = snapOf(s);
  await frames(page, 120);
  assert.deepEqual(snapOf(await state(page)), frozen, 'world snapshot frozen while paused');

  // Resume via #btnResume advances time & belt offset again.
  await page.locator('#btnResume').click();
  await frames(page, 20);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.ok(s.time > frozen[0] && s.offset > frozen[1]);

  // 2) Window blur triggers lifecycle auto-pause; KeyP resumes.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await step(page);
  assert.equal((await state(page)).screen, 'pause');
  await press(page, 'KeyP');
  assert.equal((await state(page)).screen, 'play');

  // 3) Escape pauses; #btnRestart resets level cleanly with empty pod, empty clip, and demo=false.
  await press(page, 'Escape');
  assert.equal((await state(page)).screen, 'pause');
  await page.locator('#btnRestart').click();
  await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play');
  assert.equal(s.demo, false);
  assert.equal(s.boxes[0].items.length, 0);
  assert.equal(s.clip, null);
});

test('workshop shop unlocks & persists across reload, corrupt save recovers cleanly, and QuotaExceededError surfaces retry banner', async t => {
  // 1) Corrupt save JSON falls back cleanly to 0/36 stars with zero errors.
  const broken = await game(t, { save: '{broken-json' });
  assert.equal(await broken.locator('#titleStars b').textContent(), '0/36');

  // 2) Seed 60 coins, buy Plasma theme (25) & Gold armor (30), verify unaffordable Nova armor (75) wiggles, and reload!
  const page = await game(t, { save: SAVE(3, { coins: 60 }) });
  assert.equal(await page.locator('#titleStars b').textContent(), '6/36');
  await page.locator('#btnShop').click();
  await step(page);
  assert.equal((await state(page)).screen, 'shop');

  await page.locator('#shopThemes .tile').nth(1).click(); // plasma (25)
  await page.locator('#shopArmors .tile').nth(1).click(); // gold (30)
  assert.equal((await state(page)).coins, 5);

  // Nova armor costs 75 -> cannot afford with 5 coins.
  const novaBtn = page.locator('#shopArmors .tile').nth(3);
  await novaBtn.click();
  assert.equal((await state(page)).coins, 5);
  assert.ok(await novaBtn.evaluate(el => el.classList.contains('wiggle')));

  await page.reload();
  await page.waitForFunction(() => window.__game && window.sf && window.sf.step);
  const saved = await page.evaluate(() => __game.save);
  assert.equal(saved.theme, 'plasma');
  assert.equal(saved.armor, 'gold');
  assert.equal(saved.coins, 5);

  // 3) QuotaExceededError shows .sg-save-status[data-state="failed"] and clicking Retry writes the save.
  await page.evaluate(() => { window.sf.failSave = true; });
  await page.locator('#btnShop').click();
  await step(page);
  await page.locator('#shopThemes .tile').nth(0).click(); // equip owned 'cyan' -> triggers persist()
  const banner = page.locator('.sg-save-status');
  await banner.waitFor({ state: 'visible' });
  assert.equal(await banner.getAttribute('data-state'), 'failed');

  await page.evaluate(() => { window.sf.failSave = false; });
  await banner.locator('button').click();
  assert.equal((await stored(page)).theme, 'cyan');
  assert.equal(await banner.getAttribute('data-state'), 'saved');
});

test('reduced motion disables particles & screen shake; 1100x620 viewport fits cleanly and mute button toggles without pausing', async t => {
  const page = await game(t, { reducedMotion: 'reduce', size: [1100, 620] });

  // Verify title card & buttons stay within canvas bounds at 1100x620.
  const fitTitle = await page.evaluate(() => {
    const g = document.getElementById('game').getBoundingClientRect();
    const play = document.getElementById('btnPlay').getBoundingClientRect();
    const how = document.querySelector('.howto').getBoundingClientRect();
    return play.top >= g.top && play.bottom <= g.bottom && how.left >= g.left && how.right <= g.right;
  });
  assert.equal(fitTitle, true, 'title UI fits inside 1100x620 game frame');

  // Start Mission 3 (viruses + explosions) to test reduced motion suppression of particles & shake.
  await startMissionFromMap(page, 2);
  assert.ok(await until(page, 's.belts[0].items.some(i => i.visible && i.virus)', 240));
  await press(page, 'Delete');
  let s = await state(page);
  assert.equal(s.particles, 0, 'no particle bursts under prefers-reduced-motion: reduce');
  assert.equal(s.shake, 0, 'no camera shake under prefers-reduced-motion: reduce');

  // Mute button (.sg-mute) & KeyM toggle Kit.audio.muted while keeping screen === 'play'.
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  assert.equal((await state(page)).screen, 'play');
  await page.keyboard.press('KeyM');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
});

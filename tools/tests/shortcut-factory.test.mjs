// Shortcut Factory in real Chromium: real clicks and real Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+Z /
// Ctrl+Y / Ctrl+A / Ctrl+S / Delete / Tab / Enter presses do the right thing, and the page
// never scrolls, selects its text or loses focus; a shortcut typed while Windows writes
// Arabic (event.key «ؤ», event.code KeyC) still works; whole levels, the stamp, the result,
// pause, restart, saves (and a full disk), the gremlin and reduced motion.
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

// A save with the first n levels done (two stars each), so level n is the next one.
const SAVE = (n = 0, extra = {}) => ({ v: 1, stars: Array.from({ length: 30 }, (_, i) => i < n ? 2 : 0), best: Array.from({ length: 30 }, (_, i) => i < n ? 30 : 0),
  coins: 0, hats: ['none'], colors: ['sun'], hat: 'none', color: 'sun', ...extra });

// The game with its frame loop stepped by hand (sf.step), every Kit.dda result recorded
// (sf.results), and a storage that can be told to fail. No page errors, no console errors,
// no requests off the server.
async function game(t, { save, dda = 0.35, reducedMotion = 'no-preference', size = [1280, 720] } = {}) {
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
    if (!sessionStorage.getItem('sf-seeded')) {
      sessionStorage.setItem('sf-seeded', '1');
      if (save !== undefined) localStorage.setItem('sg:shortcut-factory:save', typeof save === 'string' ? save : JSON.stringify(save));
    }
    let kit;
    const sf = window.sf = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        sf.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        sf.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
        return { stop() {} };
      };
      const make = kit.dda;
      kit.dda = (slug, opts) => {
        const control = make.call(kit, slug, Object.assign({ start: dda }, opts)), result = control.result;
        control.result = outcome => { sf.results.push(outcome); return result.call(control, outcome); };
        return control;
      };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:shortcut-factory:save' && window.sf && window.sf.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { save, dda });
  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/shortcut-factory/`);
  await page.waitForFunction(() => window.__game && window.sf.step);
  return page;
}
const state = page => page.evaluate(() => __game.state);
// n fixed steps of the game, drawn once at the end; frames() draws every one of them.
const step = (page, n = 1) => page.evaluate(n => sf.run(n), n);
const frames = (page, n = 1) => page.evaluate(n => sf.step(n), n);
const stored = page => page.evaluate(() => { const raw = localStorage.getItem('sg:shortcut-factory:save'); return raw ? JSON.parse(raw) : null; });
// Steps the game until a condition on its state holds (or max steps have run), checking
// every `every` steps (and drawing the frame then).
async function until(page, cond, max = 3600, every = 6) {
  return page.evaluate(({ cond, max, every }) => {
    const ok = new Function('s', 'return (' + cond + ');');
    for (let i = 0; i < max; i += every) { if (ok(__game.state)) return true; sf.run(every); }
    return ok(__game.state);
  }, { cond, max, every });
}
// Records, for every keydown, whether the game prevented the browser's own action.
async function watchKeys(page) {
  await page.evaluate(() => {
    window.sfKeys = [];
    window.addEventListener('keydown', e => window.sfKeys.push({ code: e.code, key: e.key, ctrl: e.ctrlKey, prevented: e.defaultPrevented }));
  });
}
const keys = page => page.evaluate(() => window.sfKeys.splice(0));
async function clickToy(page, id) {
  const p = await page.evaluate(id => __game.toyPoint(id), id);
  await page.mouse.click(p.x, p.y);
  await step(page);
}
async function clickBox(page, con) {
  const p = await page.evaluate(c => __game.boxPoint(c), con);
  await page.mouse.click(p.x, p.y);
  await step(page);
}
async function press(page, key) { await page.keyboard.press(key); await step(page); }
// Starts level li from the map (the level before it has stars) and closes its demo.
async function startAt(page, li) {
  await page.keyboard.press('Enter'); await step(page);
  if ((await state(page)).screen === 'map') { await page.locator('.lvl').nth(li).click(); await step(page); }
  assert.equal((await state(page)).level, li);
  if ((await state(page)).demo) { await step(page, 30); await press(page, 'Enter'); }
  assert.equal((await state(page)).demo, false);
}
const visible = (s, kind) => s.belts.flatMap(b => b.items).find(t => t.k === kind && !t.b && t.visible);
const box = (s, n = 0) => s.boxes[n];
const KEYS = { copy: 'Control+KeyC', paste: 'Control+KeyV', cut: 'Control+KeyX', del: 'Delete', undo: 'Control+KeyZ', gremlin: 'Control+KeyZ', redo: 'Control+KeyY', all: 'Control+KeyA', save: 'Control+KeyS', ship: 'Enter' };
// Plays the current level like a child who follows the coach: real clicks on the toys and
// boxes it points at, real key presses for the shortcuts it lights up.
async function playLevel(page, { pace = 12 } = {}) {
  for (let i = 0; i < 300; i++) {
    const s = await state(page);
    if (s.screen !== 'play' || s.phase === 'done' || s.phase === 'fail') return s;
    const h = await page.evaluate(() => __game.hint);
    if (!h) { await step(page, 10); continue; }
    if (h.act === 'select') {
      const t = s.belts.concat(s.boxes).flatMap(c => c.items).find(t => t.id === h.toy);
      if (!t || !t.visible) { await step(page, 10); continue; }
      await clickToy(page, h.toy);
    } else if (h.act === 'place') await clickBox(page, h.con);
    else await press(page, KEYS[h.act]);
    await step(page, pace);
  }
  return state(page);
}

test('the title waits; Play opens level 1-1 with its Ctrl+C and Ctrl+V demo; Enter closes it', async t => {
  const page = await game(t);
  await frames(page, 60);
  let s = await state(page);
  assert.equal(s.screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/90');
  assert.match(await page.locator('.howto').textContent(), /Ctrl[\s\S]*C[\s\S]*نسخ/);
  await page.locator('#btnPlay').click(); await step(page);
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.id, '1-1'); assert.equal(s.demo, true);
  // The factory waits behind the demo: the belt does not move.
  const off = s.offset;
  await frames(page, 60);
  assert.equal((await state(page)).offset, off);
  assert.equal((await state(page)).demo, true);
  await press(page, 'Enter');
  assert.equal((await state(page)).demo, false);
  await frames(page, 30);
  assert.ok((await state(page)).offset > off, 'then the belt runs');
  // The demo closes by itself too (about 4 s for its two shortcuts).
  const again = await game(t);
  await again.locator('#btnPlay').click();
  assert.ok(await until(again, '!s.demo', 60 * 6));
});

test('real Ctrl+C and Ctrl+V copy the duck into the box, Enter ships it; the page never scrolls, selects or loses focus', async t => {
  const page = await game(t);
  await startAt(page, 0);
  await watchKeys(page);
  let s = await state(page);
  const duck = visible(s, 'duck');
  await clickToy(page, duck.id);
  s = await state(page);
  assert.deepEqual(s.sel, [duck.id], 'a click picks the duck');
  assert.equal(s.focus, true, 'the click gives the game the keyboard');
  await press(page, 'Control+KeyC');
  s = await state(page);
  assert.deepEqual(s.clip, { cut: false, kinds: ['duck'] }, 'the copy machine holds a duck');
  await press(page, 'Control+KeyV');
  await press(page, 'Control+KeyV');
  s = await state(page);
  assert.deepEqual(box(s).items.map(t => t.k), ['duck', 'duck']);
  assert.equal(box(s).ready, true);
  assert.equal(s.belts[0].items.length, 1, 'the original duck rides on');
  await press(page, 'Control+KeyA');
  assert.equal(await page.evaluate(() => String(window.getSelection())), '', 'Ctrl+A selects toys, never the page text');
  await press(page, 'Control+KeyS');
  await press(page, 'Tab');
  s = await state(page);
  assert.equal(s.focus, true, 'Tab moves the factory selection, not the page focus');
  assert.deepEqual([s.scrollX, s.scrollY], [0, 0]);
  const log = await keys(page);
  for (const code of ['KeyC', 'KeyV', 'KeyA', 'KeyS', 'Tab']) {
    const k = log.filter(k => k.code === code);
    assert.ok(k.length && k.every(k => k.prevented), code + ' is kept from the browser');
  }
  await press(page, 'Enter');
  assert.equal(log.length >= 6, true);
  assert.ok((await keys(page)).some(k => k.code === 'Enter' && k.prevented), 'Enter is kept from the browser');
  s = await state(page);
  assert.equal(s.done, 1);
  assert.ok(await until(page, "s.screen === 'result'", 60 * 4));
  s = await state(page);
  assert.equal(s.result.stars, 3); assert.equal(s.result.fail, false);
  assert.equal((await stored(page)).stars[0], 3, 'saved at once');
  assert.ok((await page.evaluate(() => sf.results)).length === 1, 'one result for the difficulty');
  assert.match(await page.locator('#resTitle').textContent(), /1-1/);
});

test('a shortcut typed while Windows writes Arabic still works: KeyC with the key «ؤ»; other Ctrl keys stay the browser\'s', async t => {
  const page = await game(t);
  await startAt(page, 0);
  await watchKeys(page);
  const duck = visible(await state(page), 'duck');
  await clickToy(page, duck.id);
  // A trusted key press from the browser itself, as the Arabic 101 layout sends it.
  const cdp = await page.context().newCDPSession(page);
  const send = async (code, key, vk) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await step(page);
  };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ControlLeft', key: 'Control', windowsVirtualKeyCode: 17, modifiers: 2 });
  await send('KeyC', 'ؤ', 67);
  await send('KeyV', 'ر', 86);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ControlLeft', key: 'Control', windowsVirtualKeyCode: 17 });
  const s = await state(page);
  assert.deepEqual(s.clip, { cut: false, kinds: ['duck'] });
  assert.deepEqual(box(s).items.map(t => t.k), ['duck']);
  const log = await keys(page);
  assert.ok(log.some(k => k.code === 'KeyC' && k.key === 'ؤ' && k.ctrl && k.prevented), JSON.stringify(log));
  // ⌘ works like Ctrl; a Ctrl key the factory does not use is left alone.
  const other = await page.evaluate(() => ['KeyW', 'KeyT', 'KeyN', 'KeyP', 'KeyR', 'KeyB'].map(code => {
    const e = new KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase(), ctrlKey: true, bubbles: true, cancelable: true });
    document.getElementById('game').dispatchEvent(e);
    return e.defaultPrevented;
  }));
  assert.deepEqual(other, [false, false, false, false, false, false]);
  await page.keyboard.press('Meta+KeyV'); await step(page);
  assert.equal(box(await state(page)).items.length, 2, '⌘+V pastes too');
  // F5 is never taken either.
  const f5 = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { code: 'F5', key: 'F5', bubbles: true, cancelable: true }); document.getElementById('game').dispatchEvent(e); return e.defaultPrevented; });
  assert.equal(f5, false);
});

test('Ctrl+X moves a toy to another box; Ctrl+Z puts it back and Ctrl+Y does it again', async t => {
  const page = await game(t, { save: SAVE(6) });
  await startAt(page, 6);   // 2-1: a car and a ball in the wrong boxes
  let s = await state(page);
  const [a, b] = s.boxes;
  assert.deepEqual(a.items.map(t => t.k), ['car', 'ball']);
  const ball = a.items.find(t => t.k === 'ball');
  await clickToy(page, ball.id);
  await press(page, 'Control+KeyX');
  s = await state(page);
  assert.deepEqual(s.boxes[0].items.map(t => t.k), ['car'], 'the ball left box 1');
  assert.deepEqual(s.clip, { cut: true, kinds: ['ball'] });
  await clickBox(page, b.i);
  assert.equal((await state(page)).place, b.i);
  await press(page, 'Control+KeyV');
  s = await state(page);
  assert.deepEqual(s.boxes[1].items.map(t => t.k), ['ball', 'car', 'ball']);
  assert.equal(s.undo, 2);
  await press(page, 'Control+KeyZ');
  assert.deepEqual((await state(page)).boxes[1].items.map(t => t.k), ['ball', 'car']);
  await press(page, 'Control+KeyZ');
  s = await state(page);
  assert.deepEqual(s.boxes[0].items.map(t => t.k), ['car', 'ball'], 'two undos: the ball is back where it was');
  assert.equal(s.boxes[0].items[1].id, ball.id, 'the very same ball');
  await press(page, 'Control+KeyY');
  await press(page, 'Control+Shift+KeyZ');
  s = await state(page);
  assert.deepEqual(s.boxes[1].items.map(t => t.k), ['ball', 'car', 'ball'], 'Ctrl+Y (and Ctrl+Shift+Z) redo');
  assert.equal(s.redo, 0);
  // Finish the level by following the coach; it ends with the Ctrl+S stamp.
  s = await playLevel(page);
  assert.equal(s.phase, 'done');
  assert.ok(await until(page, "s.screen === 'result'", 60 * 4));
  assert.ok((await stored(page)).stars[6] >= 1);
});

test('Delete (and Backspace) recycle the broken toys, Ctrl+Z brings one back; the day ends with Ctrl+S', async t => {
  const page = await game(t, { save: SAVE(12) });
  await startAt(page, 12);   // 3-1
  await watchKeys(page);
  let s = await state(page);
  const broken = box(s).items.filter(t => t.b);
  assert.equal(broken.length, 2);
  await clickToy(page, broken[0].id);
  await press(page, 'Delete');
  s = await state(page);
  assert.equal(box(s).items.length, 3);
  await press(page, 'Control+KeyZ');
  assert.equal(box(await state(page)).items.length, 4, 'undo after Delete');
  await press(page, 'Control+KeyY');
  await clickToy(page, broken[1].id);
  await press(page, 'Backspace');
  s = await state(page);
  assert.deepEqual(box(s).items.map(t => t.k + (t.b ? '!' : '')), ['duck', 'duck']);
  assert.ok((await keys(page)).filter(k => k.code === 'Delete' || k.code === 'Backspace').every(k => k.prevented));
  // Copy one more duck in, ship, then the stamp sheet waits for Ctrl+S.
  await clickToy(page, box(s).items[0].id);
  await press(page, 'Control+KeyC'); await press(page, 'Control+KeyV');
  await press(page, 'Enter');
  assert.ok(await until(page, "s.phase === 'stamp'", 120));
  await step(page, 120);
  assert.equal((await state(page)).screen, 'play', 'the day waits for its stamp');
  await press(page, 'Control+KeyS');
  s = await state(page);
  assert.equal(s.phase, 'done');
  assert.ok(await until(page, "s.screen === 'result'", 60 * 4));
  const saved = await stored(page);
  assert.ok(saved.stars[12] >= 2 && saved.coins > 0);
  // The result: Enter goes on to the next level; R plays this one again (without the demo).
  await step(page, 60);
  await press(page, 'KeyR');
  s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.level, 12); assert.equal(s.demo, false, 'no demo on a replay');
});

test('Tab and the arrows move the selection; Ctrl+A picks a whole belt; Shift+click picks more', async t => {
  const page = await game(t, { save: SAVE(25) });
  await startAt(page, 25);   // 5-2: rocket, teddy and duck on the belt; three boxes want all three
  await press(page, 'Tab');
  let s = await state(page);
  assert.equal(s.sel.length, 1);
  const first = s.sel[0];
  await press(page, 'Tab');
  s = await state(page);
  assert.notEqual(s.sel[0], first); assert.equal(s.focus, true);
  await press(page, 'ArrowRight');
  assert.deepEqual((await state(page)).sel, [first], '→ goes back to the toy on the right');
  await press(page, 'Shift+ArrowLeft');
  assert.equal((await state(page)).sel.length, 2, 'Shift+← adds one');
  await press(page, 'Control+KeyA');
  s = await state(page);
  assert.equal(s.sel.length, 3);
  assert.equal(await page.evaluate(() => String(window.getSelection())), '');
  await press(page, 'Control+KeyC');
  assert.equal((await state(page)).clip.kinds.length, 3);
  for (const b of s.boxes) {
    await clickBox(page, b.i);
    await press(page, 'Control+KeyV');
  }
  s = await state(page);
  assert.ok(s.boxes.every(b => b.ready), 'one copy, three pastes');
  await press(page, 'ArrowDown');
  assert.equal(s.focus, true);
  // Shift+click: pick two toys, deselect one again.
  const ids = s.belts[0].items.filter(t => t.visible).map(t => t.id);
  await clickToy(page, ids[0]);
  const p = await page.evaluate(id => __game.toyPoint(id), ids[1]);
  await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift'); await step(page);
  assert.equal((await state(page)).sel.length, 2);
  await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift'); await step(page);
  assert.deepEqual((await state(page)).sel, [ids[0]]);
  for (let i = 0; i < 3; i++) await press(page, 'Enter');
  assert.ok(await until(page, "s.phase === 'stamp'", 160));
  await press(page, 'Control+KeyS');
  assert.ok(await until(page, "s.screen === 'result'", 60 * 4));
});

test('P, Esc, the button and a lost focus pause the factory; nothing moves while paused; Restart begins again', async t => {
  const page = await game(t, { save: SAVE(18) });
  await startAt(page, 18);   // 4-1: the gremlin comes after a few seconds
  const snap = () => page.evaluate(() => JSON.stringify([__game.state.time, __game.state.offset, __game.state.boxes, __game.state.gremlin]));
  for (const how of ['KeyP', 'Escape', 'button', 'blur']) {
    if (how === 'button') await page.locator('#btnPause').click();
    else if (how === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(how);
    await step(page);
    assert.equal((await state(page)).screen, 'pause', how);
    const before = await snap();
    await page.keyboard.press('Control+KeyV'); await page.keyboard.press('Delete');
    await step(page, 600);
    assert.equal(await snap(), before, how + ': the factory is frozen');
    if (how === 'blur') {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await step(page, 10);
      assert.equal((await state(page)).screen, 'pause', 'focus coming back never resumes');
    }
    if (how === 'KeyP') await press(page, 'KeyP'); else await page.locator('#btnResume').click();
    await step(page);
    assert.equal((await state(page)).screen, 'play');
    await step(page, 5);
    assert.notEqual(await snap(), before, 'and runs again after Resume');
  }
  // The gremlin: one Ctrl+Z undoes his mess and bonks him.
  assert.ok(await until(page, "s.gremlin === 'mess'", 60 * 40), 'he comes');
  const mess = await state(page);
  assert.equal(mess.undo, 1);
  await press(page, 'Control+KeyZ');
  const s = await state(page);
  assert.equal(s.gremlin, 'flee'); assert.equal(s.bonks, 1); assert.equal(s.undo, 0);
  // Restart from the pause menu: an empty level, without the demo.
  const duck = visible(s, 'duck');
  await clickToy(page, duck.id); await press(page, 'Control+KeyC'); await press(page, 'Control+KeyV');
  await press(page, 'Escape');
  await page.locator('#btnRestart').click(); await step(page);
  const r = await state(page);
  assert.equal(r.screen, 'play'); assert.equal(r.demo, false); assert.equal(r.clip, null);
  assert.ok(r.boxes.every(b => b.items.length === 0)); assert.equal(r.time < 0.1, true);
  // R restarts from the pause menu too.
  await press(page, 'KeyP'); await press(page, 'KeyR');
  assert.equal((await state(page)).screen, 'play');
});

test('saves come back after a reload; old or broken saves open a fresh factory; a full disk warns and Retry writes', async t => {
  const page = await game(t, { save: SAVE(3, { coins: 80 }) });
  assert.equal(await page.locator('#titleStars b').textContent(), '6/90');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.sf.step);
  assert.equal(await page.locator('#titleStars b').textContent(), '6/90');
  await page.locator('#btnShop').click(); await step(page);
  assert.equal((await state(page)).screen, 'shop');
  await page.evaluate(() => { sf.failSave = true; });
  await page.locator('.tile').nth(1).click(); await step(page);   // the cap, 15 coins
  const status = page.locator('.sg-save-status');
  assert.equal(await status.getAttribute('data-state'), 'failed');
  assert.equal((await stored(page)).hat, 'none', 'nothing was written');
  assert.equal((await page.evaluate(() => __game.save)).hat, 'cap', 'the cap is kept in the game');
  await page.evaluate(() => { sf.failSave = false; });
  await status.locator('button').click();
  assert.equal(await status.getAttribute('data-state'), 'saved');
  assert.equal((await stored(page)).hat, 'cap');
  assert.equal((await stored(page)).coins, 65);
  await press(page, 'Escape');
  assert.equal((await state(page)).screen, 'title');
  for (const save of ['broken{', '[1,2]', '{"v":1,"stars":"x","coins":-4,"hat":"crown"}', '{"v":3,"stars":[3,3,3]}', '{"music":true}']) {
    const old = await game(t, { save });
    assert.equal(await old.locator('#titleStars b').textContent(), '0/90', save);
    await old.keyboard.press('Enter'); await step(old);
    const s = await state(old);
    assert.equal(s.screen, 'play', save); assert.equal(s.level, 0);
  }
});

test('the map: a level opens with a star in the one before; a locked one wiggles and does not start', async t => {
  const page = await game(t, { save: SAVE(2) });
  await page.locator('#btnLevels').click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  const cls = i => page.locator('.lvl').nth(i).getAttribute('class');
  assert.doesNotMatch(await cls(2), /locked/);
  assert.match(await cls(2), /next/);
  assert.match(await cls(3), /locked/);
  assert.equal(await page.locator('.lvl').nth(0).locator('.st svg.on').count(), 2);
  // Right to left: a world's first level is the rightmost.
  const xs = await page.locator('.lvl').evaluateAll(list => list.slice(0, 6).map(b => b.getBoundingClientRect().x));
  assert.ok(xs[0] > xs[1] && xs[1] > xs[5]);
  await page.locator('.lvl').nth(3).click(); await step(page);
  assert.equal((await state(page)).screen, 'map');
  await press(page, 'Enter');
  const s = await state(page);
  assert.equal(s.screen, 'play'); assert.equal(s.level, 2, 'Enter starts the next level');
});

test('a timed day that runs out ends with no stars; Enter tries again', async t => {
  const page = await game(t, { save: SAVE(5), dda: 0.95 });
  await startAt(page, 5);   // 1-6, the copy workshop's rush
  const s = await state(page);
  assert.ok(s.limit > 0);
  assert.ok(await until(page, "s.screen === 'result'", 60 * (s.limit + 5), 120));
  const r = await state(page);
  assert.equal(r.result.fail, true); assert.equal(r.result.stars, 0);
  assert.match(await page.locator('#resTitle').textContent(), /انتهى الوقت/);
  assert.equal(await page.locator('#resAgain').isVisible(), false, 'one big «again» button, no twin');
  assert.equal(await page.locator('#resNext').getAttribute('aria-label'), 'العب مرة أخرى');
  assert.equal((await stored(page)).stars[5], 0);
  assert.deepEqual(await page.evaluate(() => sf.results), [0]);
  await step(page, 60);
  await press(page, 'Enter');
  const again = await state(page);
  assert.equal(again.screen, 'play'); assert.equal(again.level, 5);
});

test('reduced motion: everything still works, with no particles, no shaking and no sliding', async t => {
  const page = await game(t, { reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.sgMotion), 'reduce');
  await startAt(page, 0);
  let most = 0;
  for (let i = 0; i < 40; i++) {
    const s = await state(page);
    if (s.phase === 'done') break;
    const h = await page.evaluate(() => __game.hint);
    if (h && h.act === 'select') await clickToy(page, h.toy);
    else if (h) await press(page, { copy: 'Control+KeyC', paste: 'Control+KeyV', ship: 'Enter' }[h.act]);
    for (let k = 0; k < 4; k++) { await frames(page, 3); const f = await state(page); most = Math.max(most, f.particles, f.shake); }
  }
  const s = await state(page);
  assert.equal(s.phase, 'done');
  assert.equal(most, 0, 'no particles and no shaking at any time');
  assert.equal(await page.evaluate(() => Kit.motion.reduced()), true);
  assert.ok(await until(page, "s.screen === 'result'", 60 * 4));
  await step(page, 120);
  assert.equal(await page.locator('#resStars svg.on').count(), (await state(page)).result.stars, 'the stars are all there, without the pop');
  assert.equal(await page.locator('#resStars svg.on').first().isVisible(), true);
});

test('the layer of buttons fits the smaller portal frame, and a click picks the toy under it', async t => {
  const page = await game(t, { size: [1100, 620] });
  const play = await page.locator('#btnPlay').boundingBox();
  const canvas = await page.locator('#game').boundingBox();
  assert.ok(canvas.width <= 1100 && canvas.height <= 620);
  assert.ok(play.x > canvas.x && play.x + play.width < canvas.x + canvas.width && play.y + play.height < canvas.y + canvas.height);
  const howto = await page.locator('.howto').boundingBox();
  assert.ok(howto.x + howto.width <= canvas.x + canvas.width + 1 && howto.y + howto.height <= canvas.y + canvas.height);
  await startAt(page, 0);
  const duck = visible(await state(page), 'duck');
  await clickToy(page, duck.id);
  assert.deepEqual((await state(page)).sel, [duck.id]);
  // The mute button and M mute the game and remember it; M never starts or pauses anything.
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.keyboard.press('KeyM'); await step(page);
  assert.equal(await page.evaluate(() => Kit.audio.muted), true);
  assert.equal((await state(page)).screen, 'play');
  await page.locator('.sg-mute').click();
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
});

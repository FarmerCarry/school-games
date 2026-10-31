// The portal's picture profiles without names, age bands and XP (js/profiles.js and the
// "who's playing?" strip in js/site.js, docs/ARCHITECTURE.md "Profiles and age bands"),
// driven through the real portal UI and real game pages.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
// The fast build inlines every portal script, so a script cannot be swapped out there.
const sourceTree = fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('src="js/profiles.js"');
const KEY = 'sg:site:profiles', MORE = 'sg:site:profiles:more';
let browser, server, origin, pings = 0;

before(async () => {
  server = await startTestServer(root, { pages: { '/seed.html': '<!doctype html><title>seed</title>' } });
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

// Every test: no page or console errors, and nothing over the network (no beacons,
// uploads, sockets or other origins; the static files of this server only).
async function setup(t, { storage = true, reducedMotion = 'no-preference', clock = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', reducedMotion });
  t.after(() => context.close());
  const state = { context, errors: [], requests: [] };
  context.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'GET' || /^(fetch|xhr|websocket|eventsource|ping)$/.test(request.resourceType()) ||
      (/^https?:$/.test(url.protocol) && url.origin !== origin)) state.requests.push(request.method() + ' ' + request.url());
  });
  await context.addInitScript(() => {
    // A ping posted after a game message is handled after it (same source, same order).
    addEventListener('message', e => { if (e.data && e.data.type === 'test:ping') window.lastPing = e.data.n; });
    // Inside game frames: every sg:preferences the portal sends.
    addEventListener('message', e => { if (e.data && e.data.type === 'sg:preferences') (window.prefs = window.prefs || []).push(e.data); });
  });
  if (!storage) {
    await context.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem', 'key', 'clear']) {
        Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage disabled by test', 'SecurityError'); } });
      }
    });
  }
  if (clock) await context.clock.install();
  state.page = await newPage(state);
  t.after(() => {
    assert.deepEqual(state.errors, [], 'no page or console errors');
    assert.deepEqual(state.requests, [], 'nothing goes over the network');
  });
  return state;
}
async function newPage(state) {
  const page = await state.context.newPage();
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') state.errors.push(message.text()); });
  return page;
}

const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const xp = page => page.evaluate(() => SGProfiles.current() && SGProfiles.current().xp);
const active = page => page.evaluate(() => document.activeElement.getAttribute('data-w') || document.activeElement.id);
const stats = (r, e = 0) => ({ type: 'sg:stats', version: 1, e, f: [0, 0, 0, 0], m: 0, r, o: '' });
async function home(page) {
  await page.locator('#logo').click();
  await page.waitForFunction(() => document.body.className === 'route-home' && document.querySelector('#who'));
}
// Opens a game from home through its tile and waits for Kit.ready().
async function play(page, slug) {
  await page.locator(`.catalog-grid .tile[data-slug="${slug}"]`).click();
  await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
  return page.frames().find(frame => frame.url().includes(`/games/${slug}/`));
}
// A message from inside the game frame, sent with the game's own window.parent.postMessage,
// so it passes the portal's source check exactly like Kit's own messages.
async function post(page, frame, data) {
  const n = ++pings;
  await frame.evaluate(([d, n]) => { parent.postMessage(d, location.origin); parent.postMessage({ type: 'test:ping', n }, location.origin); }, [data, n]);
  await page.waitForFunction(n => window.lastPing === n, n);
}
const kitProfile = frame => frame.evaluate(() => ({ band: Kit.profile.band, player: Kit.profile.player }));

test('home renders at once; a new player is made with the mouse and reaches the game', async t => {
  const { page } = await setup(t);
  await page.goto(origin + '/');
  // Never blocking: the strip sits above the starter card, nothing modal, the flow is closed.
  assert.equal(await page.locator('#app > #who.who + a.starter').count(), 1, 'the strip is directly above the starter card');
  assert.equal(await page.locator('#app > a.starter').count(), 1);
  assert.equal(await page.locator('[role="dialog"]:visible, [aria-modal="true"]:visible').count(), 0, 'nothing modal on home');
  assert.equal(await page.locator('#who [data-w^="a:"]').count(), 0, 'the new-player flow is not shown on first load');
  assert.equal(await page.locator('#who [data-w="pick:"]').getAttribute('aria-pressed'), 'true', 'a guest plays by default');
  assert.equal(await page.locator('#me').getAttribute('class'), 'me guest');
  assert.match(await page.locator('#who .who-hint').innerText(), /اختر حيوانك/);
  assert.equal(await page.evaluate(() => [SGProfiles.player(), SGProfiles.band(), SGProfiles.current()].join('|')), '||');

  await page.locator('#who [data-w="add"]').click();
  assert.equal(await page.locator('#who [data-w^="a:"]').count(), 12, 'twelve animals');
  assert.equal(await active(page), 'a:0', 'focus moves to the first animal');
  assert.equal(await page.locator('#whoTitle').innerText(), '🐾 اختر حيوانك');
  await page.locator('#who [data-w="a:3"]').click();
  assert.equal(await page.locator('#who [data-w^="c:"]').count(), 8, 'eight colours');
  assert.equal(await page.locator('#who [data-w="c:0"] .who-face').innerText(), '🐸', 'colours show the chosen animal');
  await page.locator('#who [data-w="c:1"]').click();
  const ages = page.locator('#who [data-w^="b:"]');
  assert.deepEqual(await ages.evaluateAll(cards => cards.map(card => card.querySelector('b').textContent)), ['6–7', '8–9', '10–11']);
  // The numbers read low to high, left to right, inside the right-to-left page.
  const order = await ages.last().locator('b').evaluate(b => {
    const node = b.firstChild, first = document.createRange(), last = document.createRange();
    first.setStart(node, 0); first.setEnd(node, 1);
    last.setStart(node, node.length - 1); last.setEnd(node, node.length);
    return [first.getBoundingClientRect().x, last.getBoundingClientRect().x];
  });
  assert.ok(order[0] < order[1], 'age range is not reversed: ' + order);
  assert.equal(await ages.first().getAttribute('aria-label'), 'من 6 إلى 7 سنوات');
  assert.equal(await ages.last().getAttribute('aria-label'), 'من 10 إلى 11 سنة');
  await page.locator('#who [data-w="b:8-9"]').click();

  const record = await stored(page);
  assert.equal(record.v, 1);
  assert.equal(record.seq, 1);
  assert.equal(record.list.length, 1);
  const [p] = record.list;
  const today = await page.evaluate(() => { const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); });
  assert.deepEqual(p, { k: 'p1', a: 3, c: 1, b: '8-9', xp: 0, lv: 1, d0: today, dl: today, g: {} });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:player')), 'p1', 'the current player lives in sessionStorage');
  assert.equal(await active(page), 'pick:p1', 'focus lands on the new avatar');
  assert.equal(await page.locator('#who [data-w="pick:p1"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#who [data-w="pick:"]').getAttribute('aria-pressed'), 'false');
  assert.match(await page.locator('#toast').innerText(), /أهلًا بك/);
  assert.equal(await page.locator('#me').getAttribute('class'), 'me');
  assert.equal(await page.locator('#me').getAttribute('aria-label'), 'ضفدع بإطار برتقالي، المستوى 1. اختر مَن يلعب');
  assert.equal(await page.locator('#me .me-face').innerText(), '🐸');
  // No names, no typed text anywhere in the flow.
  assert.equal(await page.locator('#who input, #who textarea, #who [contenteditable]').count(), 0);

  const frame = await play(page, 'air-hockey');
  assert.deepEqual(await kitProfile(frame), { band: '8-9', player: 'p1' }, 'Kit.profile in the real game');
  const prefs = await frame.evaluate(() => window.prefs.at(-1));
  assert.deepEqual(prefs, { type: 'sg:preferences', classroom: false, band: '8-9', player: 'p1', telemetry: false });
  assert.deepEqual((await stored(page)).list[0].g, { 'air-hockey': 1 }, 'the open is counted for the player');
  // Restart replaces the frame within the same visit; leaving and coming back is a new one.
  await page.locator('#restartBtn').click();
  await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false');
  assert.deepEqual((await stored(page)).list[0].g, { 'air-hockey': 1 });
  await home(page);
  await play(page, 'air-hockey');
  assert.deepEqual((await stored(page)).list[0].g, { 'air-hockey': 2 });
});

test('the keyboard alone makes a player; Back, Escape and taken colours behave', async t => {
  const { page } = await setup(t);
  await page.goto(origin + '/');
  await page.locator('#who [data-w="add"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 'a:0');
  const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, parseFloat(s.outlineWidth)]; });
  assert.ok(outline[0] !== 'none' && outline[1] >= 3, 'keyboard focus is clearly visible: ' + outline);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await active(page), 'a:2');
  await page.keyboard.press('Space');
  assert.equal(await active(page), 'c:0');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 'b:6-7');
  // Back returns to the colour that was chosen; Back again to the animal.
  await page.locator('#who [data-w="back"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 'c:1');
  await page.locator('#who [data-w="back"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 'a:2');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 'b:6-7');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  assert.equal(await active(page), 'pick:p1');
  assert.equal(await page.evaluate(() => SGProfiles.band()), '8-9');
  assert.deepEqual(await page.evaluate(() => [SGProfiles.current().a, SGProfiles.current().c]), [2, 0]);

  // Escape closes the flow and focus returns to the + button.
  await page.locator('#who [data-w="add"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#who [data-w^="a:"]').count(), 0);
  assert.equal(await active(page), 'add');
  // The same animal in the same colour is taken; another colour is free.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#who [data-w="c:0"]').isDisabled(), true, 'a taken animal and colour cannot be picked twice');
  assert.match(await page.locator('#who [data-w="c:0"]').getAttribute('aria-label'), /مأخوذ/);
  assert.equal(await active(page), 'c:1', 'focus skips the taken colour');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.equal(await active(page), 'pick:p2');
  assert.equal((await stored(page)).list.length, 2);

  // Picking players with the keyboard; the guest button is a player too.
  await page.locator('#who [data-w="pick:p1"]').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => SGProfiles.player()), 'p1');
  assert.equal(await active(page), 'pick:p1', 'focus stays on the picked avatar');
  await page.locator('#who [data-w="pick:"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => SGProfiles.player()), '');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:player')), null);
});

test('XP from a real round, the rules per round code, the loss cap, level-ups and the guest', async t => {
  const { page } = await setup(t);
  await page.goto(origin + '/');
  await page.evaluate(() => {
    SGProfiles.create(0, 0, '6-7');
    window.levels = [];
    SGProfiles.onLevel(level => window.levels.push(level));
  });

  // A real two-player tic-tac-toe round ends neutrally ('e'): +5.
  let frame = await play(page, 'tic-tac-toe');
  const game = page.frameLocator('#stage iframe');
  await game.locator('#localButton').click();
  for (const [i, move] of [0, 3, 1, 4, 2].entries()) {
    await game.locator(`#gameBoard [data-move="${move}"]`).click();
    await game.locator(`#gameBoard[data-moves="${i + 1}"]`).waitFor();
  }
  await page.waitForFunction(() => SGProfiles.current().xp === 5);
  await home(page);

  // A game without any input sends nothing by itself, so the counts below are exact.
  frame = await play(page, 'air-hockey');
  await post(page, frame, stats([['s', 'L1'], ['w', 'L1', 1000]]));
  assert.equal(await xp(page), 15, 'win +10');
  await post(page, frame, stats([['s', 'L1'], ['d', 'L1', 1000]]));
  assert.equal(await xp(page), 21, 'draw +6');
  await post(page, frame, stats([['s', 'endless'], ['e', 'endless', 95000, 120]]));
  assert.equal(await xp(page), 29, 'endless end +5, +1 per 30 s');
  await post(page, frame, stats([['s', 'endless'], ['e', 'endless', 9e6]]));
  assert.equal(await xp(page), 39, 'at most +5 for round time');
  await post(page, frame, stats([['s', 'L2'], ['q', 'L2', 5000], ['t', 'done'], ['w', '1-4', 1000], ['w', 'L123', 1], ['x', 'L1'], 'w', ['w']]));
  assert.equal(await xp(page), 39, 'quits, tutorials, unknown codes and bad ids earn nothing');
  assert.deepEqual(await page.evaluate(() => window.levels), [2], 'reached level 2 at 30 XP');
  assert.match(await page.locator('#toast').innerText(), /^مستوى جديد! ⭐ 2$/);
  assert.equal(await page.locator('#toast').getAttribute('class'), 'toast show gold');
  assert.equal(await page.locator('#me').evaluate(el => el.classList.contains('lvup')), true, 'the badge bursts');
  assert.equal(await page.locator('#me .me-lv').innerText(), '⭐2');

  // Losses: at most 40 XP per game per tab session. Classroom mode keeps the toast but
  // drops the burst.
  await page.locator('#classroom summary').click();
  await page.locator('#classroomMode').check();
  await page.evaluate(() => document.querySelector('#me').classList.remove('lvup'));
  await page.waitForFunction(() => !document.querySelector('.burst'));
  await post(page, frame, stats(Array.from({ length: 12 }, () => ['l', 'L1', 1000])));
  assert.equal(await xp(page), 79, 'twelve losses give 40, not 48');
  assert.deepEqual(await page.evaluate(() => window.levels), [2, 3]);
  assert.match(await page.locator('#toast').innerText(), /مستوى جديد! ⭐ 3/);
  assert.equal(await page.locator('#me').evaluate(el => el.classList.contains('lvup')), false, 'no burst in classroom mode');
  assert.equal(await page.locator('.burst').count(), 0);
  await page.locator('#classroomMode').uncheck();
  await post(page, frame, stats([['l', 'L1', 1000], ['w', 'L1', 1000]]));
  assert.equal(await xp(page), 89, 'the cap is reached; wins still count');
  // The two endless runs above (8 + 10) sit in the same tab record, under their own cap.
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:xploss')), '{"p1 air-hockey":40,"e":{"p1 air-hockey":18}}');
  // XP bar: level 3 starts at 75 XP and needs 60 more.
  assert.equal(await page.locator('#me .me-bar i').evaluate(el => el.style.width), '23%');

  // Engaged time: +1 per full minute in a visit, at most 120 s per message.
  await post(page, frame, stats([], 150000));
  assert.equal(await xp(page), 91, '120 s counted: +2');
  await post(page, frame, stats([], 30000));
  assert.equal(await xp(page), 91);
  await post(page, frame, stats([], 30000));
  assert.equal(await xp(page), 92, 'the minute adds up across messages');
  await post(page, frame, stats([], 59000));
  // Other windows never count: the portal itself and a frame that is not the game.
  await page.evaluate(data => {
    window.postMessage(data, location.origin);
    const helper = document.createElement('iframe');
    helper.srcdoc = '<script>parent.postMessage(' + JSON.stringify(data) + ', "*"); parent.postMessage({ type: "test:ping", n: -1 }, "*")<\/script>';
    document.body.appendChild(helper);
  }, stats([['w', 'L1', 1000]], 120000));
  await page.waitForFunction(() => window.lastPing === -1);
  assert.equal(await xp(page), 92, 'foreign windows earn nothing');

  // Another game has its own loss cap. Leaving ends the visit (its 59 s are not carried).
  await page.evaluate(() => { window.oldGame = document.querySelector('#stage iframe').contentWindow; });
  await home(page);
  // A removed game's last message within 2 s still counts, for the player who played it.
  await page.evaluate(d => dispatchEvent(new MessageEvent('message', { source: window.oldGame, origin: location.origin, data: d })), stats([['w', 'L1', 1000]]));
  assert.equal(await xp(page), 102, 'a late message from the removed game');
  frame = await play(page, 'maze-dash');
  await post(page, frame, stats([['l', 'L1', 1000]], 1000));
  assert.equal(await xp(page), 106, 'maze-dash losses count on their own');
  await page.waitForTimeout(2100);
  await page.evaluate(d => dispatchEvent(new MessageEvent('message', { source: window.oldGame, origin: location.origin, data: d })), stats([['w', 'L1', 1000]]));
  assert.equal(await xp(page), 106, 'nothing from a game removed more than 2 s ago');
  const p = (await stored(page)).list[0];
  assert.deepEqual([p.xp, p.lv], [106, 3]);
  assert.deepEqual(p.g, { 'tic-tac-toe': 1, 'air-hockey': 1, 'maze-dash': 1 });

  // A guest keeps nothing and is invited, once, to pick an animal.
  await home(page);
  await page.locator('#who [data-w="pick:"]').click();
  const before = await page.evaluate(k => localStorage.getItem(k), KEY);
  frame = await play(page, 'air-hockey');
  await post(page, frame, stats([['s', 'L1'], ['w', 'L1', 1000]], 120000));
  assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), before, 'guests earn nothing');
  assert.equal(await page.locator('#toast').innerText(), 'اختر حيوانك في الرئيسية لتجمع النجوم ⭐');
  assert.deepEqual(await page.evaluate(() => window.levels), [2, 3]);
});

test('an endless run under 20 s pays nothing, a 30 s run pays as before, and one game stops at 40 XP', async t => {
  const { page } = await setup(t);
  await page.goto(origin + '/');
  await page.evaluate(() => SGProfiles.create(0, 0, '8-9'));
  // A quiet game, so these counts are exact. The portal pays from the round id:
  // endless, run (Rail Rush, Drift King), classic (Block Burst) and arenaN (Blob Battle).
  const frame = await play(page, 'air-hockey');
  await post(page, frame, stats([
    ['e', 'endless', 5000], ['e', 'run', 5000], ['e', 'classic', 5000], ['e', 'arena1', 5000], ['e', 'endless', 19999]
  ]));
  assert.equal(await xp(page), 0, 'a run shorter than 20 s pays 0');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:xploss')), null, 'a short run does not spend the cap');

  await post(page, frame, stats([['e', 'endless', 30000]]));
  assert.equal(await xp(page), 6, '30 s pays +5 and +1 for the 30 s');
  // 6 so far. Five more 30 s runs make 36; the next pays the 4 that are left; then nothing.
  await post(page, frame, stats(Array.from({ length: 5 }, () => ['e', 'endless', 30000])));
  assert.equal(await xp(page), 36);
  await post(page, frame, stats([['e', 'run', 30000]]));
  assert.equal(await xp(page), 40, 'the last 4 XP, and a run id counts toward the same game');
  await post(page, frame, stats([['e', 'endless', 30000], ['e', 'endless', 9e6], ['e', 'arena2', 120000]]));
  assert.equal(await xp(page), 40, 'further endless runs in this game pay nothing');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:xploss')), '{"e":{"p1 air-hockey":40}}');

  // A two-player end is not an endless run, and a win is not part of this cap.
  await post(page, frame, stats([['e', 'local', 5000], ['w', 'L1', 1000]]));
  assert.equal(await xp(page), 55, 'a short neutral end and a win are outside the endless cap');

  // Another game has its own 40, in the same tab record. 20 s keeps the usual +5.
  await home(page);
  const dash = await play(page, 'maze-dash');
  await post(page, dash, stats([['e', 'endless', 5000]]));
  assert.equal(await xp(page), 55, 'a short run in another game still pays nothing');
  await post(page, dash, stats([['e', 'endless', 20000], ['e', 'endless', 30000]]));
  assert.equal(await xp(page), 66, '20 s pays +5 and 30 s pays +6, on this game\'s own cap');
  await post(page, dash, stats([['l', 'L1', 1000]]));
  assert.equal(await xp(page), 70, 'a loss still pays, from its own cap');
  assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('sg:site:xploss'))),
    { 'p1 maze-dash': 4, e: { 'p1 air-hockey': 40, 'p1 maze-dash': 11 } });
});

test('in fullscreen the level-up toast and burst are drawn over the game, and the toast comes back', async t => {
  const { page } = await setup(t);
  await page.goto(origin + '/');
  await page.evaluate(() => SGProfiles.create(0, 0, '8-9'));
  const frame = await play(page, 'air-hockey');
  await page.locator('#fsBtn').click();
  await page.waitForFunction(() => document.fullscreenElement === document.querySelector('#stage'));
  // Only the fullscreen element is drawn. Record where each burst star goes, and its start.
  await page.evaluate(() => {
    window.stars = [];
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
      if (n.className === 'burst') window.stars.push([n.parentNode === document.fullscreenElement, parseFloat(n.style.left)]);
    }))).observe(document.documentElement, { childList: true, subtree: true });
  });
  await post(page, frame, stats([['s', 'L1'], ['w', 'L1', 1000], ['w', 'L1', 1000], ['w', 'L1', 1000]]));
  assert.equal(await page.evaluate(() => SGProfiles.current().lv), 2);
  assert.equal(await page.evaluate(() => document.fullscreenElement.contains(document.querySelector('#toast'))), true, 'the toast is drawn in fullscreen');
  assert.match(await page.locator('#toast').innerText(), /^مستوى جديد! ⭐ 2$/);
  assert.equal(await page.locator('#toast').getAttribute('class'), 'toast show gold');
  const stars = await page.evaluate(() => window.stars), middle = await page.evaluate(() => innerWidth / 2);
  assert.equal(stars.length, 7, 'the burst');
  for (const [inside, x] of stars) {
    assert.equal(inside, true, 'every star is drawn in fullscreen');
    assert.ok(Math.abs(x - middle) < 2, 'the stars fly from the toast (the badge is not drawn): ' + x);
  }
  // Out of fullscreen the toast goes back to the page, where a redrawn view cannot remove it.
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.waitForFunction(() => document.querySelector('#toast').parentNode === document.body);

  // Leaving the game while still in fullscreen redraws the view at once: the toast survives.
  await page.locator('#fsBtn').click();
  await page.waitForFunction(() => document.fullscreenElement === document.querySelector('#stage'));
  await post(page, frame, stats(Array.from({ length: 5 }, () => ['w', 'L1', 1000])));
  assert.equal(await page.evaluate(() => document.fullscreenElement.contains(document.querySelector('#toast'))), true);
  assert.match(await page.locator('#toast').innerText(), /^مستوى جديد! ⭐ 3$/);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => document.body.className === 'route-home' && !document.fullscreenElement);
  assert.equal(await page.evaluate(() => document.querySelector('#toast')?.parentNode === document.body), true, 'the toast is still in the page');
  await page.locator('#who [data-w="add"]').click();
  await page.locator('#who [data-w="a:4"]').click();
  await page.locator('#who [data-w="c:4"]').click();
  await page.locator('#who [data-w="b:6-7"]').click();
  assert.equal(await page.locator('#toast').innerText(), 'أهلًا بك! 🎉', 'and still shows the next message');
});

test('the class band is the guest band; a new tab is a guest; the band reaches Kit.dda', async t => {
  const state = await setup(t);
  const { page } = state;
  await page.goto(origin + '/');
  await page.locator('#classroom summary').click();
  await page.locator('#classBand').selectOption('6-7');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:classband')), '"6-7"');
  assert.equal(await page.evaluate(() => SGProfiles.band()), '6-7');
  await page.locator('#classroom summary').click();
  let frame = await play(page, 'air-hockey');
  assert.deepEqual(await kitProfile(frame), { band: '6-7', player: '' });
  // A guest of a known band starts at that band's difficulty seed.
  assert.equal(await frame.evaluate(() => Kit.dda('test-band', { id: 'probe' }).level), 0.12);
  // The band changes while the game is open: the game follows at once.
  await page.locator('#classroom summary').click();
  await page.locator('#classBand').selectOption('10-11');
  await frame.waitForFunction(() => Kit.profile.band === '10-11');
  await page.locator('#classBand').selectOption('');
  await frame.waitForFunction(() => Kit.profile.band === '');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:classband')), null);
  await page.locator('#classBand').selectOption('8-9');

  await home(page);
  await page.evaluate(() => SGProfiles.create(5, 2, '10-11'));
  frame = await play(page, 'air-hockey');
  assert.deepEqual(await kitProfile(frame), { band: '10-11', player: 'p1' }, "the player's own band wins over the class band");

  // sessionStorage scoping: a new tab of the same browser starts as a guest.
  const second = await newPage(state);
  await second.goto(origin + '/');
  assert.equal(await second.evaluate(() => SGProfiles.player()), '');
  assert.equal(await second.evaluate(() => SGProfiles.band()), '8-9');
  assert.equal(await second.locator('#me').getAttribute('class'), 'me guest');
  assert.equal(await second.locator('#who [data-w="pick:p1"]').getAttribute('aria-pressed'), 'false', 'the player exists, but is not picked here');
  const other = await play(second, 'maze-dash');
  assert.deepEqual(await kitProfile(other), { band: '8-9', player: '' });
  assert.equal(await page.evaluate(() => SGProfiles.player()), 'p1', 'the first tab keeps its player');
  // A profile removed in another tab turns this tab's player into a guest.
  await second.evaluate(() => SGProfiles.remove('p1'));
  await page.waitForFunction(() => SGProfiles.player() === '');
  await frame.waitForFunction(() => Kit.profile.player === '' && Kit.profile.band === '8-9');
  assert.equal(await page.locator('#me').getAttribute('class'), 'me guest');
});

test('hand over the device and the topbar badge return to the strip; the mute toggle', async t => {
  const { page } = await setup(t, { clock: true });
  await page.goto(origin + '/');
  await page.evaluate(() => SGProfiles.create(1, 4, '8-9'));
  let frame = await play(page, 'air-hockey');
  // The badge goes home to the strip with the current player focused.
  await page.locator('#me').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  assert.equal(await active(page), 'pick:p1');
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.evaluate(() => scrollTo(0, 800));
  await page.locator('#me').click();
  assert.equal(await page.evaluate(() => scrollY), 0, 'on home it scrolls back to the strip');
  assert.equal(await active(page), 'pick:p1');

  frame = await play(page, 'air-hockey');
  await page.locator('#classroom summary').click();
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  await page.clock.fastForward(300001);
  await page.locator('#sessionHandoff').waitFor({ state: 'visible' });
  await page.evaluate(() => { window.oldGame = document.querySelector('#stage iframe').contentWindow; });
  await page.locator('#sessionEnd').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  assert.equal(await page.evaluate(() => SGProfiles.player()), '');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:player')), null);
  assert.equal(await page.locator('#who [data-w="pick:"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await active(page), 'pick:', 'the next child starts on the strip as a guest');
  assert.equal(await page.locator('#me').getAttribute('class'), 'me guest');
  // The game's last message after the handover still goes to the child who played.
  await page.evaluate(d => dispatchEvent(new MessageEvent('message', { source: window.oldGame, origin: location.origin, data: d })), stats([['w', 'L1', 1000]]));
  assert.equal((await stored(page)).list[0].xp, 10);

  // Mute: the same sg:site:muted key as Kit, so the open game follows.
  await page.locator('#classroom summary').click();
  await page.evaluate(() => SGProfiles.select('p1'));
  frame = await play(page, 'air-hockey');
  const mute = page.locator('#muteBtn');
  assert.deepEqual([await mute.getAttribute('aria-pressed'), await mute.innerText()], ['false', '🔊']);
  await mute.click();
  assert.deepEqual([await mute.getAttribute('aria-pressed'), await mute.innerText()], ['true', '🔇']);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:muted')), 'true');
  await frame.waitForFunction(() => Kit.audio.muted);
  // Like every sg:preferences, the mute carries the player's band, slot and telemetry.
  assert.deepEqual(await frame.evaluate(() => window.prefs.at(-1)),
    { type: 'sg:preferences', classroom: false, band: '8-9', player: 'p1', telemetry: false, quiet: true });
  await mute.click();
  await frame.waitForFunction(() => !Kit.audio.muted);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:muted')), 'false');
  // The game's own mute button: the portal toggle follows.
  await frame.evaluate(() => Kit.audio.toggleMute());
  await page.waitForFunction(() => document.querySelector('#muteBtn').getAttribute('aria-pressed') === 'true');
  await frame.evaluate(() => Kit.audio.toggleMute());
  await page.waitForFunction(() => document.querySelector('#muteBtn').getAttribute('aria-pressed') === 'false');
  // Classroom mode locks it: shown muted and disabled, a click explains and changes nothing.
  await page.locator('#classroom summary').click();
  await page.locator('#classroomMode').check();
  assert.deepEqual([await mute.getAttribute('aria-disabled'), await mute.getAttribute('aria-pressed'), await mute.getAttribute('title')], ['true', 'true', 'وضع الصف يكتم الصوت الآن']);
  // aria-disabled keeps it focusable and clickable (Playwright would wait for "enabled").
  await mute.click({ force: true });
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:muted')), 'false');
  assert.equal(await page.locator('#toast').innerText(), 'وضع الصف يكتم الصوت الآن');
  await page.locator('#classroomMode').uncheck();
  assert.deepEqual([await mute.getAttribute('aria-disabled'), await mute.getAttribute('aria-pressed')], ['false', 'false']);
});

test('a mouse click on the topbar mute gives the keys back to the game; the keyboard keeps them', async t => {
  const { page } = await setup(t);
  await page.goto(origin + '/');
  const frame = await play(page, 'air-hockey');
  await frame.evaluate(() => { window.spaces = 0; addEventListener('keydown', e => { if (e.code === 'Space') window.spaces++; }, true); });
  const mute = page.locator('#muteBtn');
  const sound = () => page.evaluate(() => [document.querySelector('#muteBtn').getAttribute('aria-pressed'), localStorage.getItem('sg:site:muted')]);
  const focused = () => page.evaluate(() => document.activeElement.tagName === 'IFRAME' ? 'IFRAME' : document.activeElement.id);
  await mute.click();
  assert.deepEqual(await sound(), ['true', 'true']);
  await frame.waitForFunction(() => Kit.audio.muted);
  assert.equal(await focused(), 'IFRAME', 'the game has the keys again');
  // The child's next Space goes to the game and does not press the mute button again.
  await page.keyboard.press('Space');
  assert.deepEqual(await sound(), ['true', 'true'], 'Space does not toggle the sound back');
  assert.equal(await frame.evaluate(() => [window.spaces, Kit.audio.muted].join()), '1,true');
  assert.equal(await focused(), 'IFRAME');

  // From the keyboard the button keeps focus, like the heart: Enter and Space press it again.
  await mute.focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await sound(), ['false', 'false']);
  assert.equal(await focused(), 'muteBtn');
  await page.keyboard.press('Space');
  assert.deepEqual(await sound(), ['true', 'true']);
  assert.equal(await focused(), 'muteBtn');
  assert.equal(await frame.evaluate(() => window.spaces), 1);

  // Locked by the classroom preset, a click explains and still gives the keys back.
  await page.locator('#classroom summary').click();
  await page.locator('#classroomMode').check();
  await mute.click({ force: true });
  assert.equal(await page.locator('#toast').innerText(), 'وضع الصف يكتم الصوت الآن');
  assert.equal(await focused(), 'IFRAME');
  await page.keyboard.press('Space');
  assert.equal(await frame.evaluate(() => window.spaces), 2);
  await mute.focus();
  await page.keyboard.press('Enter');
  assert.equal(await focused(), 'muteBtn', 'the keyboard stays on the locked button too');
  assert.deepEqual(await sound(), ['true', 'true']);
});

test('removing a player asks twice and never happens on one click', async t => {
  const { page } = await setup(t);
  await page.goto(origin + '/');
  await page.evaluate(() => { SGProfiles.create(7, 3, '6-7'); SGProfiles.create(8, 6, '8-9'); });
  await page.locator('#logo').click();
  await page.locator('#who [data-w="edit"]').click();
  assert.equal(await page.locator('#who').getAttribute('class'), 'who who-remove');
  assert.equal(await active(page), 'rm:p1');
  // Cancel goes back to the choice without removing anything.
  await page.locator('#who [data-w="rm:p2"]').click();
  assert.equal(await active(page), 'cancel', 'the safe button has focus');
  await page.locator('#who [data-w="cancel"]').click();
  assert.equal(await active(page), 'rm:p2');
  await page.locator('#who [data-w="rm:p2"]').click();
  await page.locator('#who [data-w="del"]').click();
  assert.equal((await stored(page)).list.length, 2, 'the first click only asks again');
  assert.equal(await page.locator('#who [data-w="del"]').innerText(), 'متأكد؟ احذف نهائيًا');
  await page.locator('#who [data-w="del"]').click();
  assert.equal((await stored(page)).list.length, 2, 'a double click is not a second answer');
  await page.waitForTimeout(600);
  await page.locator('#who [data-w="del"]').click();
  assert.deepEqual((await stored(page)).list.map(p => p.k), ['p1']);
  assert.equal(await page.locator('#toast').innerText(), 'حُذف اللاعب.');
  assert.equal(await page.evaluate(() => SGProfiles.player()), '', 'the removed current player becomes a guest');
  assert.equal(await page.locator('#who').getAttribute('class'), 'who who-list');
  // A new player never gets a removed player's key (games keep difficulty per key).
  await page.evaluate(() => SGProfiles.create(0, 0, '6-7'));
  assert.deepEqual((await stored(page)).list.map(p => p.k), ['p1', 'p3']);
  // Done leaves the remove mode.
  await page.locator('#who [data-w="edit"]').click();
  await page.locator('#who [data-w="done"]').click();
  assert.equal(await active(page), 'edit');
  assert.equal(await page.locator('#who').getAttribute('class'), 'who who-list');
});

test('with storage blocked the portal plays as a guest, and a player lives in memory', async t => {
  const state = await setup(t, { storage: false, reducedMotion: 'reduce' }), { page } = state;
  // Every sound source the portal page starts.
  await state.context.addInitScript(() => {
    if (window.top !== window) return;
    window.sounds = 0;
    const start = AudioScheduledSourceNode.prototype.start;
    AudioScheduledSourceNode.prototype.start = function () { window.sounds++; return start.apply(this, arguments); };
  });
  await page.goto(origin + '/');
  assert.equal(await page.locator('#app > #who + a.starter').count(), 1);
  assert.equal(await page.locator('#me').getAttribute('class'), 'me guest');
  let frame = await play(page, 'air-hockey');
  assert.deepEqual(await kitProfile(frame), { band: '', player: '' });
  await page.locator('#muteBtn').click();
  assert.equal(await page.locator('#muteBtn').getAttribute('aria-pressed'), 'true');
  await page.locator('#muteBtn').click();
  await home(page);
  await page.locator('#who [data-w="add"]').click();
  await page.locator('#who [data-w="a:5"]').click();
  await page.locator('#who [data-w="c:5"]').click();
  await page.locator('#who [data-w="b:10-11"]').click();
  assert.equal(await page.locator('#toast').innerText(), 'تعذّر الحفظ؛ هذا اللاعب مؤقت حتى تحديث الصفحة.');
  assert.deepEqual(await page.evaluate(() => [SGProfiles.player(), SGProfiles.stored()]), ['p1', false]);
  frame = await play(page, 'air-hockey');
  assert.deepEqual(await kitProfile(frame), { band: '10-11', player: 'p1' });
  await post(page, frame, stats([['s', 'L1'], ['w', 'L1', 1000], ['w', 'L1', 1000], ['w', 'L1', 1000]]));
  assert.equal(await xp(page), 30);
  assert.match(await page.locator('#toast').innerText(), /مستوى جديد! ⭐ 2/, 'the level-up toast stays readable with reduced motion');
  assert.equal(await page.locator('#me').evaluate(el => el.classList.contains('lvup')), false, 'no burst with reduced motion');
  await page.reload();
  await page.waitForFunction(() => document.body.className === 'route-play');
  assert.deepEqual(await page.evaluate(() => [SGProfiles.player(), SGProfiles.list().length]), ['', 0], 'nothing survives a reload');

  // Storage cannot keep the classroom preset, and it still silences the portal's sounds.
  await home(page);
  await page.locator('#who [data-w="pick:"]').click();
  assert.ok(await page.evaluate(() => window.sounds) > 0, 'the portal plays its sounds');
  await page.locator('#classroom summary').click();
  await page.locator('#classroomMode').check();
  const sounds = await page.evaluate(() => window.sounds);
  await page.locator('#who [data-w="add"]').click();
  await page.locator('#who [data-w="a:1"]').click();
  await page.locator('#who [data-w="back"]').click();
  assert.equal(await page.evaluate(() => window.sounds), sounds, 'no sound in classroom mode');
  await page.locator('#classroomMode').uncheck();
  await page.locator('#who [data-w="cancel"]').click();
  assert.ok(await page.evaluate(() => window.sounds) > sounds, 'sounds again without it');
});

test('with storage blocked a game opened later still follows the topbar mute', async t => {
  const { page } = await setup(t, { storage: false });
  await page.goto(origin + '/');
  let frame = await play(page, 'air-hockey');
  await page.locator('#muteBtn').click();
  await frame.waitForFunction(() => Kit.audio.muted);
  await home(page);
  assert.equal(await page.locator('#muteBtn').getAttribute('aria-pressed'), 'true');
  // The new game cannot read the mute from storage: the portal says it (on load and on ready).
  frame = await play(page, 'maze-dash');
  await frame.waitForFunction(() => (window.prefs || []).length >= 2);
  assert.equal(await frame.evaluate(() => Kit.audio.muted), true, 'the new game is muted, as the topbar shows');
  assert.deepEqual(await frame.evaluate(() => window.prefs.at(-1)),
    { type: 'sg:preferences', classroom: false, band: '', player: '', telemetry: false, quiet: true });
  // Unmuted again, the next game plays its sounds, and no correction is needed.
  await page.locator('#muteBtn').click();
  await frame.waitForFunction(() => !Kit.audio.muted);
  await home(page);
  frame = await play(page, 'air-hockey');
  await frame.waitForFunction(() => (window.prefs || []).length >= 2);
  assert.equal(await frame.evaluate(() => Kit.audio.muted), false);
  assert.deepEqual(await frame.evaluate(() => window.prefs.at(-1)), { type: 'sg:preferences', classroom: false, band: '', player: '', telemetry: false });
});

test('damaged stored profiles, class band and loss tallies are repaired silently', async t => {
  const state = await setup(t);
  const { page } = state;
  const today = await page.evaluate(() => { const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); });
  const seed = async (values, session = {}) => {
    await page.goto(origin + '/seed.html');
    await page.evaluate(([values, session]) => {
      Object.keys(localStorage).forEach(k => localStorage.removeItem(k));
      for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(session)) sessionStorage.setItem(k, v);
    }, [values, session]);
    await page.goto(origin + '/');
    await page.waitForFunction(() => document.querySelector('#who'));
  };
  for (const raw of ['not json{', '[1,2]', '"text"', 'null', '{"v":1,"seq":-3,"list":"none"}', '{"list":[null,"p1",{"k":"p1"},{"k":5}]}']) {
    await seed({ [KEY]: raw }, { 'sg:site:player': 'p1' });
    const fixed = await stored(page);
    const expected = raw.includes('"k":"p1"')
      ? { v: 1, seq: 1, list: [{ k: 'p1', a: 0, c: 0, b: '', xp: 0, lv: 1, d0: today, dl: today, g: {} }] }
      : { v: 1, seq: 0, list: [] };
    assert.deepEqual(fixed, expected, raw);
    assert.equal(await page.evaluate(() => SGProfiles.player()), raw.includes('"k":"p1"') ? 'p1' : '', raw);
  }
  // The second key is repaired the same way. It is read after the first, whose seq is the
  // one kept; a key in both counts once; it is removed while 12 or fewer profiles are left.
  const rec = (k, a = 0) => ({ k, a, c: 0, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} });
  const twelve = Array.from({ length: 12 }, (_, i) => rec('p' + (i + 1).toString(36), i));
  for (const [main, more, keys, seq, rest] of [
    [{ v: 1, seq: 2, list: twelve.slice(0, 2) }, 'not json{', ['p1', 'p2'], 2, null],
    [{ v: 1, seq: 2, list: twelve.slice(0, 2) }, JSON.stringify({ v: 1, list: [rec('p1', 5), rec('p9')] }), ['p1', 'p2', 'p9'], 9, null],
    [{ v: 1, seq: 12, list: twelve }, JSON.stringify({ seq: 99, list: [rec('pc', 3), null, rec('pz', 4)] }), [...twelve.map(p => p.k), 'pz'], 35, ['pz']],
    [null, JSON.stringify({ v: 1, list: [rec('p5'), rec('p7')] }), ['p5', 'p7'], 7, null]
  ]) {
    await seed(main ? { [KEY]: JSON.stringify(main), [MORE]: more } : { [MORE]: more });
    const [first, second] = await page.evaluate(k => k.map(key => JSON.parse(localStorage.getItem(key))), [KEY, MORE]);
    assert.deepEqual(await page.evaluate(() => SGProfiles.list().map(p => p.k)), keys, more);
    assert.deepEqual([first.seq, first.list.length, second && second.list.map(p => p.k)], [seq, Math.min(keys.length, 12), rest], more);
    assert.equal(first.list[0].a, 0, 'the first key wins: ' + more);
  }

  const list = [
    { k: 'p1', a: 3, c: 2, b: '8-9', xp: 100, lv: 50, d0: 20000, dl: 19000, extra: 'dropped',
      g: { 'air-hockey': 3, __proto__x: 1, constructor: 2, toString: 4, 'Bad Slug': 1, 'maze-dash': -4, 'pool-party': 'x', 'drift-king': 2.7 } },
    { k: 'p1', a: 1, c: 1, b: '6-7', xp: 5 },
    { k: '__proto__', a: 1 }, { k: 'toString' }, { k: 'P2' }, { k: 'p123456789' },
    { k: 'p2', a: 99, c: -1, b: 'old', xp: -5, lv: 'x', d0: 'yesterday', g: [1, 2] },
    null, 'p9', [{ k: 'p8' }]
  ];
  for (let i = 3; i <= 30; i++) list.push({ k: 'p' + i.toString(36), a: i % 12, c: i % 8, b: '10-11', xp: 1e12, d0: 20500, dl: 20600, g: {} });
  const text = JSON.stringify({ v: 7, seq: 'x', list, more: true }).replace('"__proto__x"', '"__proto__"');
  await seed({ [KEY]: text, 'sg:site:classband': '"5-6"' }, { 'sg:site:player': '__proto__', 'sg:site:xploss': '{"p1 air-hockey":999,"__proto__":3,"x":"y"}' });
  const fixed = await stored(page), more = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), MORE);
  assert.deepEqual(Object.keys(fixed), ['v', 'seq', 'list']);
  assert.equal(fixed.v, 1);
  assert.equal(fixed.list.length, 12, 'the first key keeps 12 profiles');
  assert.deepEqual(Object.keys(more), ['v', 'list']);
  assert.deepEqual(more.list.map(p => p.k), ['pd', 'pe', 'pf', 'pg', 'ph', 'pi', 'pj', 'pk', 'pl', 'pm', 'pn', 'po'], 'at most 24 profiles in all');
  assert.equal(fixed.seq, 30, 'the highest key seen, so no key is ever reused');
  assert.deepEqual(fixed.list[0], { k: 'p1', a: 3, c: 2, b: '8-9', xp: 100, lv: 3, d0: 20000, dl: 20000, g: { 'air-hockey': 3, 'drift-king': 2 } });
  assert.deepEqual(fixed.list[1], { k: 'p2', a: 0, c: 0, b: '', xp: 0, lv: 1, d0: today, dl: today, g: {} });
  assert.deepEqual(fixed.list[2], { k: 'p3', a: 3, c: 3, b: '10-11', xp: 74235, lv: 99, d0: 20500, dl: 20600, g: {} }, 'XP and level are capped at 99');
  assert.deepEqual(fixed.list.map(p => p.k), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'pa', 'pb', 'pc']);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:classband')), null, 'a band that does not exist is removed');
  assert.deepEqual(await page.evaluate(() => [SGProfiles.player(), SGProfiles.band(), SGProfiles.classBand()]), ['', '', '']);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:player')), null);
  // The repaired data works: XP at level 99 stays full, the bar stays full.
  await page.locator('#who [data-w="pick:p3"]').click();
  assert.equal(await page.locator('#me .me-bar i').evaluate(el => el.style.width), '100%');
  await page.locator('#who [data-w="pick:p1"]').click();
  const frame = await play(page, 'air-hockey');
  // The damaged tally of 999 reads as the cap of 40: no more loss XP in this tab.
  await post(page, frame, stats([['l', 'L1', 1000], ['w', 'L1', 1000]]));
  assert.equal(await xp(page), 110);
});

const listKeys = page => page.evaluate(() => SGProfiles.list().map(p => p.k));
const storedKeys = page => page.evaluate(k => k.map(key => { const d = JSON.parse(localStorage.getItem(key)); return d && d.list.map(p => p.k); }), [KEY, MORE]);
const keysFrom = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 'p' + (a + i).toString(36));
const allStored = page => page.evaluate(k => k.flatMap(key => (JSON.parse(localStorage.getItem(key)) || { list: [] }).list), [KEY, MORE]);
// The next n profiles through the API, each with its own animal and colour.
const makeProfiles = (page, n, from = 0) => page.evaluate(([n, from]) => {
  for (let i = from; i < from + n; i++) SGProfiles.create(i % 12, Math.floor(i / 12), '8-9');
}, [n, from]);

test('24 players fit: the 13th to 24th live in sg:site:profiles:more and the strip wraps at 360 px', async t => {
  const { page } = await setup(t);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => SGProfiles.MAX), 24);
  await makeProfiles(page, 12);
  assert.deepEqual(await storedKeys(page), [keysFrom(1, 12), null], 'the second key is only made for the 13th profile');
  await makeProfiles(page, 11, 12);
  await home(page);
  // The 24th through the strip, like a child.
  await page.locator('#who [data-w="add"]').click();
  await page.locator('#who [data-w="a:11"]').click();
  await page.locator('#who [data-w="c:2"]').click();
  await page.locator('#who [data-w="b:6-7"]').click();
  assert.equal(await active(page), 'pick:po', 'the 24th player is picked');
  assert.deepEqual(await storedKeys(page), [keysFrom(1, 12), keysFrom(13, 24)]);
  const main = await stored(page);
  assert.deepEqual([Object.keys(main), main.seq], [['v', 'seq', 'list'], 24], 'the first key keeps the format of portals made before 24');
  assert.equal(await page.locator('#who [data-w="add"]').count(), 0, 'no + button when the PC is full');
  assert.equal(await page.evaluate(() => SGProfiles.create(0, 7, '8-9')), null);
  // Every player and the guest on the strip, in rows, inside a 360 px screen.
  for (const mode of ['list', 'remove']) {
    if (mode === 'remove') await page.locator('#who [data-w="edit"]').click();
    const boxes = await page.locator('#who .who-row > button').evaluateAll(list => list.map(b => b.getBoundingClientRect().toJSON()));
    assert.equal(await page.locator('#who .who-row > .who-av').count(), mode === 'list' ? 25 : 24, mode + ': every player (and the guest)');
    assert.ok(boxes.every(b => b.left >= 0 && b.right <= 360), mode + ': every avatar fits the width');
    assert.ok(new Set(boxes.map(b => Math.round(b.top))).size >= 6, mode + ': the strip wraps into rows');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, mode + ': no horizontal scroll');
  }
  // A reload reads both keys back.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#who'));
  assert.deepEqual(await listKeys(page), keysFrom(1, 24));
  assert.equal(await page.locator('#who [data-w^="pick:p"]').count(), 24);
});

// js/profiles.js as it was before 24 profiles (CI checkouts without history skip this).
const OLD_PROFILES = '252283d';
const oldProfiles = (() => {
  const shown = spawnSync('git', ['show', `${OLD_PROFILES}:js/profiles.js`], { cwd: repo, encoding: 'utf8' });
  return shown.status === 0 && shown.stdout.includes('MAX = 12') ? shown.stdout : null;
})();

test('a portal tab from before 24 profiles, still open on the PC, never drops a profile',
  { skip: !oldProfiles && `commit ${OLD_PROFILES} is not in this checkout (git show failed)` }, async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/');
  await makeProfiles(page, 24);
  await page.evaluate(() => { SGProfiles.select('pk'); SGProfiles.visit('air-hockey'); });
  const texts = p => p.evaluate(k => k.map(key => localStorage.getItem(key)), [KEY, MORE]);
  const before = await texts(page);
  // The old tab: the same origin and storage, running the old js/profiles.js.
  const old = await newPage(state);
  await old.goto(origin + '/seed.html');
  await old.addScriptTag({ content: oldProfiles });
  assert.deepEqual(await texts(old), before, 'loading the old code writes nothing');
  assert.deepEqual(await listKeys(old), keysFrom(1, 12));
  assert.equal(await old.evaluate(() => SGProfiles.create(5, 5, '6-7')), null, 'the old tab sees a full list and makes nothing');
  // The old tab plays and removes; the new tab follows and keeps the first key full.
  await old.evaluate(() => { SGProfiles.select('p3'); SGProfiles.visit('maze-dash'); });
  await page.waitForFunction(() => SGProfiles.list().find(p => p.k === 'p3').visits('maze-dash') === 1);
  assert.deepEqual(await listKeys(page), keysFrom(1, 24));
  assert.deepEqual((await allStored(page)).find(p => p.k === 'pk').g, { 'air-hockey': 1 }, 'the visit counted in the new tab stays');
  await old.evaluate(() => SGProfiles.remove('p2'));
  await page.waitForFunction(k => JSON.parse(localStorage.getItem(k)).list.length === 12 && SGProfiles.list().length === 23, KEY);
  assert.deepEqual(await storedKeys(page), [['p1', ...keysFrom(3, 13)], keysFrom(14, 24)], 'profile 13 moves up into the first key');
  await old.waitForFunction(() => SGProfiles.list().length === 12);
  assert.equal(await old.evaluate(() => SGProfiles.create(5, 5, '6-7')), null, 'so the old tab still cannot make one');
  // With no new tab open, the old tab removes one and makes one in the room it sees.
  await page.close();
  await old.evaluate(() => { SGProfiles.remove('p4'); return SGProfiles.create(5, 5, '6-7'); });
  assert.deepEqual(await old.evaluate(() => SGProfiles.player()), 'pp', 'the new key follows the highest key ever used');
  const next = await newPage(state);
  await next.goto(origin + '/');
  await next.waitForFunction(() => document.querySelector('#who'));
  assert.deepEqual(await listKeys(next), ['p1', 'p3', ...keysFrom(5, 13), 'pp', ...keysFrom(14, 24)]);
  assert.deepEqual([(await stored(next)).seq, (await storedKeys(next))[1].length], [25, 11]);
  assert.equal(await next.locator('#who [data-w^="pick:p"]').count(), 23, 'every profile is on the strip');
  await old.close();
});

test('after 20 minutes with nobody playing, the player becomes a guest; why the session ended goes to telemetry', async t => {
  const { page } = await setup(t, { clock: true });
  await page.goto(origin + '/');
  // A recorder in front of the telemetry hooks (the current sink may not have them yet).
  await page.evaluate(() => {
    window.calls = [];
    for (const name of ['why', 'fav', 'timer']) {
      const real = SGTelemetry[name];
      SGTelemetry[name] = (a, b) => { window.calls.push(b === undefined ? [name, a] : [name, a, b]); if (typeof real === 'function') real(a, b); };
    }
    SGProfiles.create(1, 4, '8-9');
  });
  const calls = () => page.evaluate(() => window.calls.splice(0));
  const player = () => page.evaluate(() => SGProfiles.player());
  let frame = await play(page, 'air-hockey');
  await page.clock.fastForward(19 * 60000);
  assert.equal(await player(), 'p1', 'nothing happens before 20 minutes');
  // A game that reports engaged play keeps the player; a message with none does not.
  await post(page, frame, { ...stats([], 5000), om: 0 });
  await page.clock.fastForward(19 * 60000);
  await post(page, frame, { ...stats([], 0), om: 0 });
  assert.equal(await player(), 'p1');
  await page.clock.fastForward(60001);
  await page.waitForFunction(() => document.body.className === 'route-home');
  assert.equal(await player(), '', 'the next child starts as a guest');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sg:site:player')), null);
  assert.equal(await active(page), 'pick:', 'on the strip');
  assert.deepEqual(await calls(), [['why', 'i']]);
  // A guest has nothing to hand over.
  await page.clock.fastForward(21 * 60000);
  assert.deepEqual(await calls(), []);

  // Portal input keeps the player: a click, a key press, then a wheel turn.
  await page.locator('#who [data-w="pick:p1"]').click();
  await page.clock.fastForward(19 * 60000);
  await page.keyboard.press('Shift');
  await page.clock.fastForward(19 * 60000);
  // A wheel event reaches the page after mouse.wheel() returns: wait for it.
  await page.evaluate(() => addEventListener('wheel', () => { window.wheeled = true; }, { passive: true }));
  await page.mouse.wheel(0, 10);
  await page.waitForFunction(() => window.wheeled);
  await page.clock.fastForward(19 * 60000);
  assert.equal(await player(), 'p1');

  // The classroom timer: start (5 min), its end with the hand-over overlay, then idle.
  frame = await play(page, 'air-hockey');
  await page.locator('#favBtn').click();
  await page.locator('#favBtn').click();
  await page.locator('#classroom summary').click();
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  await page.locator('#sessionStop').click();
  await page.locator('#sessionStart').click();
  await page.clock.fastForward(300001);
  await page.locator('#sessionHandoff').waitFor({ state: 'visible' });
  assert.deepEqual(await calls(), [['fav', 'air-hockey', true], ['fav', 'air-hockey', false], ['timer', 's', 5], ['timer', 'c', 0], ['timer', 's', 5], ['timer', 'e', 0]]);
  await page.clock.fastForward(15 * 60000);
  await page.waitForFunction(() => document.body.className === 'route-home');
  assert.equal(await player(), '');
  assert.deepEqual(await calls(), [['why', 'i']]);
  assert.equal(await page.locator('#sessionStatus').innerText(), 'انتهت الجلسة. الجهاز جاهز للاعب التالي.');
  assert.equal(await page.evaluate(() => SGUpdateSafe()), true, 'the overlay of the ended timer went too');

  // A timer still running is left alone (started here without a click, so the idle time runs on).
  await page.locator('#who [data-w="pick:p1"]').click();
  await page.clock.fastForward(10 * 60000);
  await page.evaluate(() => { document.querySelector('#sessionMinutes').value = '20'; document.querySelector('#sessionStart').click(); });
  await page.clock.fastForward(10 * 60000 + 1);
  assert.equal(await player(), '');
  assert.match(await page.locator('#sessionClock').innerText(), /^(9|10):\d\d$/, 'the timer keeps running');
  assert.equal(await page.locator('#sessionStop').isVisible(), true);
  assert.deepEqual(await calls(), [['timer', 's', 20], ['why', 'i']]);
  await page.locator('#sessionStop').click();

  // The hand-over button: 'h' for a player, nothing for a guest.
  await page.locator('#sessionMinutes').selectOption('5');
  for (const who of ['p1', '']) {
    await page.locator(`#who [data-w="pick:${who}"]`).click();
    await play(page, 'air-hockey');
    await page.locator('#sessionStart').click();
    await page.clock.fastForward(300001);
    await page.locator('#sessionHandoff').waitFor({ state: 'visible' });
    await page.locator('#sessionEnd').click();
    await page.waitForFunction(() => document.body.className === 'route-home');
    assert.deepEqual((await calls()).filter(c => c[0] === 'why'), who ? [['why', 'h']] : [], who || 'guest');
  }
});

test('the portal still works when js/profiles.js is missing', { skip: !sourceTree && 'the fast build inlines every portal script' }, async t => {
  const state = await setup(t);
  const { page } = state;
  await state.context.route('**/js/profiles.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => typeof window.SGProfiles), 'undefined');
  assert.equal(await page.locator('#who').count(), 0);
  assert.equal(await page.locator('#app > a.starter').count(), 1);
  assert.equal(await page.locator('#me').isHidden(), true);
  assert.equal(await page.locator('#bandPick').isHidden(), true);
  const frame = await play(page, 'air-hockey');
  assert.deepEqual(await frame.evaluate(() => window.prefs.at(-1)), { type: 'sg:preferences', classroom: false, band: '', player: '', telemetry: false });
  await post(page, frame, stats([['w', 'L1', 1000]]));
  await page.locator('#muteBtn').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:site:muted')), 'true');
});

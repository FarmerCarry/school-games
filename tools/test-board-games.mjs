#!/usr/bin/env node
/* Browser checks for both shared-PC board games and their computer opponents.
 * node tools/test-board-games.mjs
 * SG_ROOT=_site node tools/test-board-games.mjs
 * node tools/test-board-games.mjs --portal-only # focus on embedding and layout
 * Set SG_BOARD_SCREENSHOTS to a directory outside the checkout for evidence.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
const GAMES = ['tic-tac-toe', 'connect-four'];
const WIN = { 'tic-tac-toe': [0, 3, 1, 4, 2], 'connect-four': [0, 1, 0, 1, 0, 1, 0] };
const DRAW = {
  'tic-tac-toe': [0, 1, 2, 4, 3, 5, 7, 6, 8],
  'connect-four': [6, 2, 5, 1, 6, 5, 5, 4, 0, 1, 3, 4, 6, 3, 0, 5, 5, 3, 2, 6, 1, 0, 6, 5, 2, 6, 2, 0, 1, 2, 3, 2, 0, 0, 4, 1, 1, 3, 3, 4, 4, 4]
};
const contexts = new Set();
const errors = [];
let browser, site;
const move = (scope, index) => scope.locator(`#gameBoard [data-move="${index}"]`);
const board = scope => scope.locator('#gameBoard');
const passed = message => console.log('  PASS ' + message);

async function waitFor(predicate, message, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Timed out: ' + message);
}
async function moves(scope, count) {
  await waitFor(async () => await board(scope).getAttribute('data-moves') === String(count), count + ' moves render');
}
async function mode(scope, value) {
  await waitFor(async () => await scope.locator('#boardApp').getAttribute('data-mode') === value, value + ' mode');
}
async function screenshot(page, name, fullPage = true) {
  if (!process.env.SG_BOARD_SCREENSHOTS) return;
  fs.mkdirSync(process.env.SG_BOARD_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(process.env.SG_BOARD_SCREENSHOTS, name + '.png'), fullPage });
}
async function dumpFitTrace(page, label) {
  const trace = await page.evaluate(() => window.__portalFitTrace || []);
  if (trace.length) console.error(label + ' portal fit trace:\n' + JSON.stringify(trace.slice(-60), null, 2));
}
async function fits(scope, selectors, label) {
  for (const selector of selectors) {
    const box = await scope.locator(selector).evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    const inside = box.left >= -1 && box.top >= -1 && box.right <= box.width + 1 && box.bottom <= box.height + 1;
    if (!inside && typeof scope.evaluate === 'function') await dumpFitTrace(scope, label);
    assert.ok(inside,
      `${label}: ${selector} fits viewport: ${JSON.stringify(box)}`);
  }
}
async function student(label, { reducedMotion = 'reduce', deniedStorage = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block', reducedMotion });
  contexts.add(context);
  await context.addInitScript(({ deniedStorage }) => {
    // Old tabs may retain a saved online session after this release. That must
    // never cause an automatic connection or interfere with the mode chooser.
    try {
      for (const game of ['tic-tac-toe', 'connect-four']) {
        sessionStorage.setItem('sg:multiplayer:' + game, JSON.stringify({ name: 'Old student', token: 'legacy-session-token' }));
      }
    } catch { /* file:// storage can be restricted */ }
    if (deniedStorage) {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage disabled by test', 'SecurityError'); } });
      }
    }
  }, { deniedStorage });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const sockets = [], requests = [], failures = [];
  page.on('pageerror', error => errors.push(label + ': ' + error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location().url;
    if (url === site.origin + '/favicon.svg' && message.text() === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED') return;
    errors.push(label + ': ' + message.text() + ' (' + url + ')');
  });
  page.on('request', request => requests.push(request.url()));
  page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('websocket', socket => sockets.push(socket.url()));
  // Prevent accidental external access while still recording and failing it.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== site.origin ? route.abort() : route.continue();
  });
  return {
    page, context,
    async close() {
      assert.deepEqual(sockets, [], label + ': no WebSockets');
      assert.deepEqual(requests.filter(url => /^https?:/.test(url) && new URL(url).origin !== site.origin), [], label + ': no external requests');
      assert.equal(requests.some(url => /multiplayer-(?:client|config)\.js/.test(url)), false, label + ': no online scripts');
      assert.deepEqual(failures.filter(({ url, error }) => !(url === site.origin + '/favicon.svg' && error === 'net::ERR_INTERNET_DISCONNECTED')), [], label + ': all requested resources load');
      await context.close();
      contexts.delete(context);
    }
  };
}
async function open(player, game, file = false) {
  await player.page.goto(file ? pathToFileURL(path.join(ROOT, 'games', game, 'index.html')).href : site.origin + '/games/' + game + '/', { waitUntil: 'load' });
  await mode(player.page, 'menu');
  assert.ok(new URL(player.page.url()).pathname.includes('/games/' + game + '/'), game + ': correct page URL');
  assert.match(await player.page.title(), game === 'connect-four' ? /أربعة على التوالي/ : /إكس أو/, game + ': correct page title');
  assert.ok((await player.page.locator('body').innerText()).trim().length > 70, game + ': meaningful content');
  assert.equal(await player.page.locator('#playerName, #joinButton, #playerList, #connectionStatus').count(), 0, game + ': online lobby removed');
  assert.equal(await player.page.evaluate(() => typeof window.SGMultiplayer), 'undefined', game + ': online client absent');
  assert.equal(await player.page.locator('#gameBoard [data-move]:enabled').count(), 0, game + ': chooser board does not accept moves');
}
async function start(scope, value = 'local') {
  await scope.locator(value === 'local' ? '#localButton' : '#pcButton').click();
  await mode(scope, value);
  await moves(scope, 0);
}
async function sequence(scope, list) {
  for (const [i, index] of list.entries()) {
    await move(scope, index).click();
    await moves(scope, i + 1);
  }
}

async function localRounds(game) {
  const player = await student(game + ' local rounds');
  const { page } = player;
  await open(player, game);
  await fits(page, ['#localButton', '#pcButton', '#gameBoard', '#turnLine'], game + ' desktop chooser');
  await screenshot(page, game + '-choices');
  await start(page);
  for (const winner of [1, 2]) {
    assert.equal(await board(page).getAttribute('data-turn'), String(winner), 'rematch alternates the starting player');
    await sequence(page, WIN[game]);
    assert.equal(await board(page).getAttribute('data-winner'), String(winner), game + ': correct player wins');
    assert.equal(await page.locator('#gameBoard .winning').count(), game === 'connect-four' ? 4 : 3, 'winning line highlighted');
    assert.match(await page.locator('#turnLine').innerText(), winner === 1 ? /الأول/ : /الثاني/, 'result identifies winning player');
    assert.equal(await page.locator('#gameBoard [data-move]:enabled').count(), 0, 'finished board locked');
    const count = WIN[game].length;
    await move(page, 2).evaluate(button => button.click());
    await moves(page, count);
    await fits(page, ['#gameBoard', '#rematchButton', '#leaveMatch'], game + ' desktop result');
    if (winner === 1) await screenshot(page, game + '-local-win');
    await page.locator('#rematchButton').click();
    await moves(page, 0);
  }
  await sequence(page, DRAW[game]);
  assert.equal(await board(page).getAttribute('data-draw'), 'true', game + ': complete board draws');
  assert.equal(await board(page).getAttribute('data-winner'), '0', 'draw has no winner');
  assert.match(await page.locator('#turnLine').innerText(), /تعادل/, 'Arabic draw message');
  assert.equal(await page.locator('#gameBoard [data-move]:enabled').count(), 0, 'draw locks board');
  await page.keyboard.press('r');
  await moves(page, 0);
  assert.equal(await board(page).getAttribute('data-turn'), '2', 'keyboard rematch also alternates starter');
  await page.locator('#leaveMatch').click();
  await start(page);
  assert.equal(await board(page).getAttribute('data-turn'), '1', 'fresh local session resets the starting player');
  if (game === 'tic-tac-toe') {
    await move(page, 0).click();
    assert.equal(await move(page, 0).isEnabled(), false, 'occupied square disabled');
    await move(page, 0).evaluate(button => button.click());
    await moves(page, 1);
  } else {
    await sequence(page, [0, 0, 0, 0, 0, 0]);
    assert.equal(await move(page, 0).isEnabled(), false, 'full column disabled');
    await move(page, 0).evaluate(button => button.click());
    await moves(page, 6);
  }
  await player.close();
  passed(game + ': both players win, full-board draw, legal moves, locked results and alternating rematches');
}

async function keyboardAndLifecycle(game) {
  const player = await student(game + ' keyboard and lifecycle');
  const { page } = player;
  await open(player, game);
  await start(page);
  await move(page, 0).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.move), '1', 'right arrow selects physical next cell');
  await page.keyboard.press('Enter');
  await moves(page, 1);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.matches('#gameBoard [data-move]:enabled')), true, 'keyboard stays on a playable cell after the first turn');
  await page.keyboard.press('Space');
  await moves(page, 2);
  const beforeArrow = await page.evaluate(() => document.activeElement.dataset.move);
  await page.keyboard.press(game === 'tic-tac-toe' ? 'ArrowDown' : 'ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.matches('#gameBoard [data-move]:enabled')), true, 'keyboard remains playable after the second turn');
  assert.notEqual(await page.evaluate(() => document.activeElement.dataset.move), beforeArrow, 'board arrow navigation moves focus');
  await page.keyboard.press('Escape');
  await page.locator('#resumeButton').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#gameBoard [data-move]:enabled').count(), 0, 'local pause locks board');
  await page.locator('#resumeButton').click();
  await page.keyboard.press('p');
  await page.locator('#resumeButton').waitFor({ state: 'visible' });
  await page.keyboard.press('p');
  await page.locator('#pauseLayer').waitFor({ state: 'hidden' });
  await page.locator('#leaveMatch').click();
  await start(page, 'computer');
  await move(page, 0).click();
  await page.locator('#pauseButton').click();
  await page.waitForTimeout(650);
  await moves(page, 1);
  // Explicitly exercise the visibility listener while headless Chromium remains
  // foreground. The pending AI stays stopped until an explicit Resume.
  const hidden = value => page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
  await hidden(true);
  await hidden(false);
  assert.equal(await page.locator('#pauseLayer').isVisible(), true, 'manual pause survives visibility changes');
  await moves(page, 1);
  await page.locator('#resumeButton').click();
  await moves(page, 2);
  await page.locator('#leaveMatch').click();
  await start(page, 'computer');
  await move(page, 0).click();
  await hidden(true);
  await page.waitForTimeout(650);
  await moves(page, 1);
  await hidden(false);
  assert.equal(await page.locator('#pauseLayer').isVisible(), true, 'returning to the tab keeps play paused');
  await page.waitForTimeout(650);
  await moves(page, 1);
  await page.locator('#resumeButton').click();
  await moves(page, 2);
  await page.locator('#leaveMatch').click();
  await start(page, 'computer');
  await move(page, 0).click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.waitForTimeout(650);
  await moves(page, 1);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  assert.equal(await page.locator('#pauseLayer').isVisible(), true, 'history restoration keeps play paused');
  await page.locator('#resumeButton').click();
  await moves(page, 2);
  await page.locator('#leaveMatch').click();
  await start(page, 'computer');
  await move(page, 0).click();
  await page.locator('#leaveMatch').click();
  await start(page);
  await page.waitForTimeout(650);
  await moves(page, 0);
  await move(page, 0).click();
  await moves(page, 1);
  assert.equal(await page.locator('#gameBoard .two').count(), 0, 'cancelled AI does not enter new local round');
  await player.close();
  passed(game + ': real keyboard moves, local pause, AI pause/visibility/history restoration and mode-switch cancellation');
}

async function computerRounds(game) {
  const player = await student(game + ' computer rounds');
  const { page } = player;
  await open(player, game);
  await start(page, 'computer');
  // No test-generated board state: finish real games by choosing the first
  // available square/column while the actual opponent answers each move.
  async function finish() {
    while (!(await page.locator('#rematchButton').isVisible())) {
      const button = page.locator('#gameBoard [data-move]:enabled').first();
      await button.waitFor({ state: 'visible' });
      const previous = Number(await board(page).getAttribute('data-moves'));
      await button.click();
      await waitFor(async () => (await page.locator('#rematchButton').isVisible()) ||
        Number(await board(page).getAttribute('data-moves')) >= previous + 2, 'computer completes its turn');
    }
  }
  await move(page, 0).focus();
  await page.keyboard.press('Enter');
  await moves(page, 2);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.matches('#gameBoard [data-move]:enabled')), true, 'keyboard control returns after the computer reply');
  await page.keyboard.press('Space');
  await moves(page, 4);
  await finish();
  await page.locator('#rematchButton').click();
  await moves(page, 0);
  assert.equal(await board(page).getAttribute('data-turn'), '2', 'computer starts the second round');
  await moves(page, 1);
  assert.equal(await page.locator('#gameBoard .two').count(), 1, 'computer makes the opening move');
  await finish();
  await page.locator('#rematchButton').click();
  await moves(page, 0);
  assert.equal(await board(page).getAttribute('data-turn'), '1', 'student starts the third round');
  await page.waitForTimeout(650);
  await moves(page, 0);
  await player.close();
  passed(game + ': full computer rounds, keyboard after AI reply and alternating rematch starters');
}

async function standaloneAndOffline(game) {
  for (const file of [false, true]) {
    const player = await student(game + (file ? ' local file' : ' network disconnected'), { deniedStorage: true });
    await open(player, game, file);
    await player.page.waitForLoadState('networkidle');
    await player.context.setOffline(true);
    await start(player.page);
    await sequence(player.page, WIN[game]);
    await player.page.locator('#leaveMatch').click();
    await start(player.page, 'computer');
    await move(player.page, 0).click();
    await moves(player.page, 2);
    assert.equal(await player.page.locator('#gameBoard .one').count(), 1, 'student plays without storage or network');
    assert.equal(await player.page.locator('#gameBoard .two').count(), 1, 'computer responds without storage or network');
    await player.close();
  }
  passed(game + ': same-PC and computer modes work disconnected and from file:// with storage denied');
}

async function animation() {
  const player = await student('normal falling motion', { reducedMotion: 'no-preference' });
  await open(player, 'connect-four');
  await start(player.page);
  await move(player.page, 0).focus();
  await player.page.keyboard.press('Enter');
  assert.equal(await player.page.locator('#gameBoard .dropping').count(), 1, 'normal motion animates the placed disc');
  assert.equal(await move(player.page, 1).isEnabled(), false, 'input waits until the disc lands');
  await waitFor(() => move(player.page, 1).isEnabled(), 'disc lands and next player can move');
  assert.equal(await player.page.locator('#gameBoard .dropping').count(), 0, 'drop class clears after landing');
  await player.page.keyboard.press('ArrowRight');
  assert.equal(await player.page.evaluate(() => document.activeElement.dataset.move), '1', 'normal-motion turn retains keyboard focus');
  await player.page.keyboard.press('Enter');
  await moves(player.page, 2);
  await waitFor(() => move(player.page, 2).isEnabled(), 'second disc lands');
  await player.page.emulateMedia({ reducedMotion: 'reduce' });
  await move(player.page, 2).click();
  await moves(player.page, 3);
  assert.equal(await player.page.locator('#gameBoard .dropping').count(), 0, 'reduced motion skips falling animation');
  assert.equal(await move(player.page, 2).isEnabled(), true, 'reduced-motion play is immediately ready');
  await player.close();
  passed('Connect 4 preserves falling animation, guards rapid input and respects reduced motion');
}

async function classroomSound() {
  const player = await student('board classroom sound');
  const { page } = player;
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const game of GAMES) {
    await page.goto(site.origin + '/#/play/' + game, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
    const frame = page.frames().find(item => item.url().includes('/games/' + game + '/'));
    const sound = frame.locator('#soundButton');
    async function assertSound(muted, locked) {
      await frame.waitForFunction(({ muted, locked }) => {
        const button = document.getElementById('soundButton');
        return Kit.audio.muted === muted && button.disabled === locked;
      }, { muted, locked });
      assert.equal(await sound.textContent(), muted ? 'الصوت: مغلق' : 'الصوت: يعمل', game + ': sound label follows actual audio');
      assert.equal(await sound.getAttribute('aria-pressed'), String(!muted), game + ': sound pressed state follows actual audio');
    }
    const savedMute = () => frame.evaluate(() => localStorage.getItem('sg:site:muted'));
    await assertSound(false, false);
    const originalPreference = await savedMute();
    if (!await page.locator('#classroom').evaluate(details => details.open)) {
      await page.locator('#classroom summary').click();
    }
    await page.locator('#classroomMode').check();
    await assertSound(true, true);
    // The keyboard shortcut cannot override the temporary classroom lock either.
    await frame.locator('#pcButton').press('m');
    await assertSound(true, true);
    assert.equal(await savedMute(), originalPreference, game + ': classroom mute and M leave the personal preference intact');
    await page.locator('#classroomMode').uncheck();
    await assertSound(false, false);
    assert.equal(await savedMute(), originalPreference, game + ': leaving classroom restores sound without saving its preset');

    await sound.click();
    await assertSound(true, false);
    assert.equal(await savedMute(), 'true', game + ': sound button saves personal mute');
    await page.locator('#classroomMode').check();
    await assertSound(true, true);
    await page.locator('#classroomMode').uncheck();
    await assertSound(true, false);
    assert.equal(await savedMute(), 'true', game + ': a personally muted game stays muted after classroom mode');
    await sound.press('m');
    await assertSound(false, false);
    assert.equal(await savedMute(), 'false', game + ': M still toggles personal sound outside classroom mode');
  }
  await player.close();
  passed('both board sound controls follow classroom mute, remain locked and preserve personal preferences');
}

async function portalAndMobile() {
  const player = await student('portal and mobile');
  const { page } = player;
  await page.addInitScript(() => {
    if (window !== window.parent) return;
    const readRect = Element.prototype.getBoundingClientRect;
    const trace = window.__portalFitTrace = [];
    const record = entry => { trace.push(entry); if (trace.length > 120) trace.shift(); };
    const box = element => {
      if (!element) return null;
      const rect = readRect.call(element);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
    };
    Element.prototype.getBoundingClientRect = function () {
      const result = readRect.call(this);
      if (this.id === 'playBar' || this.id === 'stage') {
        const wrap = document.getElementById('stageWrap');
        record({
          time: performance.now(), measured: this.id,
          viewport: [innerWidth, innerHeight], scroll: [scrollX, scrollY],
          styleWidth: wrap?.style.width, compact: wrap?.classList.contains('compact'),
          stage: box(document.getElementById('stage')), wrap: box(wrap),
          main: box(document.getElementById('playMain')), play: box(document.getElementById('play')),
          bar: box(document.getElementById('playBar')), info: box(document.querySelector('.pb-info')),
          buttons: box(document.querySelector('.pb-btns')),
          caller: new Error().stack.split('\n').slice(2, 5).join('\n')
        });
      }
      return result;
    };
    window.addEventListener('resize', () => record({ time: performance.now(), event: 'resize', viewport: [innerWidth, innerHeight], scroll: [scrollX, scrollY] }));
  });
  for (const game of GAMES) {
    await page.goto(site.origin + '/#/play/' + game, { waitUntil: 'load' });
    await page.locator(`#stage iframe[src*="${game}"]`).waitFor();
    await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
    const frame = page.frameLocator('#stage iframe');
    await mode(frame, 'menu');
    await page.evaluate(() => document.fonts.ready);
    await frame.locator('body').evaluate(() => document.fonts.ready);
    // fitStage measures the portal toolbar. Repeated resize must not feed its
    // wrapped text height back into an ever smaller, unusable game iframe.
    await page.setViewportSize({ width: 1100, height: 619 });
    await page.setViewportSize({ width: 1100, height: 620 });
    await page.waitForTimeout(180);
    await screenshot(page, 'portal-' + game + '-chooser', false);
    await fits(page, ['#stage', '#playBar'], game + ' embedded portal');
    const stageSize = await page.locator('#stage').boundingBox();
    if (stageSize.width < 480 || stageSize.height < 270) await dumpFitTrace(page, game + ' minimum embedded dimensions');
    assert.ok(stageSize.width >= 480 && stageSize.height >= 270, `${game}: embedded board retains usable dimensions: ${JSON.stringify(stageSize)}`);
    const actions = await page.locator('#playBar .pbtn').evaluateAll(buttons => buttons.map(button => ({
      top: button.offsetTop, label: button.getAttribute('aria-label')
    })));
    assert.ok(actions.every(action => Math.abs(action.top - actions[0].top) <= 1 && action.label), game + ': named portal controls remain in one row');
    await fits(frame, ['#localButton', '#pcButton', '#gameBoard', '#turnLine'], game + ' embedded chooser');
    await start(frame);
    await sequence(frame, WIN[game]);
    await fits(frame, ['#gameBoard', '#rematchButton', '#leaveMatch'], game + ' embedded result');
    await screenshot(page, 'portal-' + game + '-local', false);
    await frame.locator('#leaveMatch').click();
    await start(frame, 'computer');
    await move(frame, 0).click();
    await moves(frame, 2);
  }
  // This is the landscape iframe size produced by a 1100x620 laptop portal.
  // It must not select the long, stacked portrait-phone layout at width<600.
  for (const viewport of [{ width: 529, height: 298 }, { width: 480, height: 270 }, { width: 400, height: 225 }]) {
    await page.setViewportSize(viewport);
    const size = viewport.width + 'x' + viewport.height;
    for (const game of GAMES) {
      await open(player, game);
      await page.evaluate(() => document.fonts.ready);
      await screenshot(page, game + '-small-landscape-' + size + '-chooser', false);
      await fits(page, ['.game-header', '#localButton', '#pcButton', '#gameBoard', '#turnLine'], game + ' small landscape chooser ' + size);
      await start(page);
      await sequence(page, WIN[game]);
      await screenshot(page, game + '-small-landscape-' + size + '-result', false);
      await fits(page, ['.game-header', '#gameBoard', '#turnLine', '#rematchButton', '#leaveMatch'], game + ' small landscape result ' + size);
    }
  }
  await page.setViewportSize({ width: 692, height: 388 });
  for (const game of GAMES) {
    await open(player, game);
    await fits(page, ['.game-header', '#localButton', '#pcButton', '#gameBoard', '#turnLine'], game + ' compact chooser');
    await start(page);
    await sequence(page, WIN[game]);
    await fits(page, ['.game-header', '#gameBoard', '#turnLine', '#rematchButton', '#leaveMatch'], game + ' compact result');
    await screenshot(page, game + '-compact');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const game of GAMES) {
    await open(player, game);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, game + ': mobile has no horizontal overflow');
    await start(page);
    await sequence(page, WIN[game]);
    await fits(page, ['#gameBoard', '#turnLine', '#rematchButton', '#leaveMatch'], game + ' mobile result');
    await screenshot(page, game + '-mobile');
    await page.locator('#rematchButton').click();
    await moves(page, 0);
    await page.locator('#leaveMatch').click();
    await mode(page, 'menu');
  }
  await player.close();
  passed('portal iframe navigation, both embedded modes, compact fit and mobile rematches');
}

try {
  console.log('Shared-PC board browser checks (' + (path.relative(REPO, ROOT) || 'source') + ')');
  site = await startTestServer(ROOT);
  browser = await launchChromium();
  if (!process.argv.includes('--portal-only')) {
    for (const game of GAMES) {
      await localRounds(game);
      await keyboardAndLifecycle(game);
      await computerRounds(game);
      await standaloneAndOffline(game);
    }
    await animation();
  }
  await classroomSound();
  await portalAndMobile();
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('\nAll shared-PC board checks passed; no WebSockets, external requests, online scripts or browser exceptions.');
} finally {
  await Promise.allSettled([...contexts].map(context => context.close()));
  if (browser) await browser.close();
  if (site) await site.close();
}

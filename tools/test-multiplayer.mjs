#!/usr/bin/env node
/*
 * End-to-end checks with independent student browser sessions and the real
 * multiplayer service. No hosted account or external network is required.
 *
 *   node tools/test-multiplayer.mjs
 *   SG_ROOT=_site node tools/test-multiplayer.mjs
 *
 * Set SG_MULTIPLAYER_SCREENSHOTS to an output directory outside the checkout
 * when screenshot evidence is wanted. Browser plugin not available: this uses
 * the repository's Playwright / installed Chromium workflow.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { createMultiplayerServer } from '../multiplayer-server/server.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
const screenshots = process.env.SG_MULTIPLAYER_SCREENSHOTS;
const contexts = [];
const errors = [];
const expectedBrowserErrors = [];
let browser;
let site;
let multiplayer;

async function waitFor(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out: ' + message);
}

function passed(message) {
  console.log('  PASS ' + message);
}

async function student(name, endpoint = '') {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
  contexts.push(context);
  await context.addInitScript(url => { window.SG_MULTIPLAYER_URL = url; }, endpoint);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const sockets = [];
  const requests = [];
  const conditions = { intentionalOffline: false };
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location().url || page.url();
    // Chromium may request its tab icon only after the first interaction, even
    // after networkidle. This one expected browser request is unrelated to the
    // game: every script exception and every other failed resource still fails.
    if (conditions.intentionalOffline && url === site.origin + '/favicon.svg' &&
        message.text() === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED') {
      expectedBrowserErrors.push(`${name}: tab icon requested after deliberate network disconnect`);
      return;
    }
    errors.push(`${name}: ${message.text()} (${url})`);
  });
  page.on('request', request => requests.push(request.url()));
  page.on('websocket', socket => sockets.push(socket.url()));
  return { name, context, page, sockets, requests, conditions };
}

async function screenshot(page, name) {
  if (!screenshots) return;
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, name + '.png'), fullPage: true });
}

async function fitsViewport(scope, selectors, label) {
  for (const selector of selectors) {
    const bounds = await scope.locator(selector).evaluate(element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1,
      `${label}: ${selector} fits its viewport (${JSON.stringify(bounds)})`);
  }
}

async function cleanup() {
  await Promise.allSettled(contexts.map(context => context.close()));
  if (browser) await browser.close();
  if (multiplayer) await multiplayer.close();
  if (site) await site.close();
}

const rosterRow = (page, name) => page.locator('#playerList [data-player-id]').filter({ hasText: name });
const occupied = page => page.locator('#gameBoard .one, #gameBoard .two');
const moveButton = (page, move) => page.locator(`#gameBoard [data-move="${move}"]`);

async function openGame(player, game) {
  await player.page.goto(`${site.origin}/games/${game}/`, { waitUntil: 'load' });
  await player.page.locator('#boardApp').waitFor();
  assert.match(player.page.url(), new RegExp(`/games/${game}/$`));
  assert.ok((await player.page.title()).trim(), `${game}: has a page title`);
  assert.ok((await player.page.locator('body').innerText()).trim().length > 40, `${game}: meaningful page content`);
}

async function register(player, game) {
  await openGame(player, game);
  await player.page.locator('#playerName').fill(player.name);
  await player.page.locator('#joinButton').click();
  await waitFor(async () => (await player.page.locator('#myName').innerText()).includes(player.name), `${player.name} joins ${game}`);
}

async function invite(from, to) {
  await rosterRow(from.page, to.name).locator('.invite-button').click();
  await to.page.locator('#acceptInvite').waitFor({ state: 'visible' });
  assert.ok((await to.page.locator('#inviteText').innerText()).includes(from.name), 'invite shows the sender');
}

async function inMode(player, mode) {
  await waitFor(async () => await player.page.locator('#boardApp').getAttribute('data-mode') === mode, `${player.name} enters ${mode} mode`);
}

async function boardMoves(player, count) {
  await waitFor(async () => await occupied(player.page).count() === count, `${player.name}'s board has ${count} moves`);
}

async function sameBoards(players) {
  const snapshots = await Promise.all(players.map(player => player.page.locator('#gameBoard .cell, #gameBoard .tic-cell').evaluateAll(cells =>
    cells.map(cell => cell.classList.contains('one') ? 1 : cell.classList.contains('two') ? 2 : 0))));
  assert.ok(snapshots[0].length > 0, 'board renders cells');
  assert.deepEqual(snapshots[0], snapshots[1], 'both students see the same board');
}

async function testOnline(endpoint) {
  const alice = await student('Alice', endpoint);
  const bob = await student('Bob', endpoint);
  const charlie = await student('Charlie', endpoint);
  await Promise.all([register(alice, 'connect-four'), register(bob, 'connect-four'), register(charlie, 'tic-tac-toe')]);
  await rosterRow(alice.page, 'Bob').waitFor();
  await rosterRow(bob.page, 'Alice').waitFor();
  assert.equal(await rosterRow(alice.page, 'Charlie').count(), 0, 'Connect 4 hides Tic-tac-toe students');
  assert.equal(await rosterRow(charlie.page, 'Alice').count(), 0, 'Tic-tac-toe hides Connect 4 students');
  assert.equal(await rosterRow(charlie.page, 'Bob').count(), 0, 'Tic-tac-toe is a separate lobby');
  passed('independent student sessions see only their game lobby');
  await screenshot(alice.page, 'connect-four-lobby');
  await fitsViewport(alice.page, ['#gameBoard', '#pcButton', '#turnLine'], '1100x620 lobby');

  await invite(alice, bob);
  await bob.page.locator('#declineInvite').click();
  await waitFor(() => rosterRow(alice.page, 'Bob').locator('.invite-button').isEnabled(), 'declined invite releases sender');
  await bob.page.locator('#acceptInvite').waitFor({ state: 'hidden' });
  await invite(alice, bob);
  await alice.page.locator('#cancelInvite').click();
  await waitFor(() => rosterRow(alice.page, 'Bob').locator('.invite-button').isEnabled(), 'cancelled invite releases sender');
  await bob.page.locator('#acceptInvite').waitFor({ state: 'hidden' });
  passed('students can decline incoming invitations or cancel outgoing invitations');

  await invite(alice, bob);
  await bob.page.locator('#acceptInvite').click();
  await Promise.all([inMode(alice, 'online'), inMode(bob, 'online')]);
  await Promise.all([boardMoves(alice, 0), boardMoves(bob, 0)]);
  const moves = [0, 1, 0, 1, 0, 1, 0];
  for (let i = 0; i < moves.length; i += 1) {
    const current = i % 2 === 0 ? alice : bob;
    const opponent = i % 2 === 0 ? bob : alice;
    await waitFor(() => moveButton(current.page, moves[i]).isEnabled(), `${current.name}'s turn`);
    assert.equal(await moveButton(opponent.page, 2).isEnabled(), false, 'opponent cannot play out of turn');
    await moveButton(current.page, moves[i]).click();
    await Promise.all([boardMoves(alice, i + 1), boardMoves(bob, i + 1)]);
    await sameBoards([alice, bob]);
    if (i === 2) {
      await alice.page.reload({ waitUntil: 'load' });
      await inMode(alice, 'online');
      await boardMoves(alice, 3);
      assert.ok((await alice.page.locator('#myName').innerText()).includes('Alice'), 'refresh preserves identity');
      await sameBoards([alice, bob]);
      passed('refresh reconnects to the same match and restores its board');
    }
  }
  await waitFor(() => alice.page.locator('#rematchButton').isEnabled(), 'Connect 4 reaches a finished match');
  assert.equal(await alice.page.locator('#gameBoard .one').count(), 4, 'winning player placed four discs');
  assert.equal(await alice.page.locator('#gameBoard .two').count(), 3, 'other player placed three discs');
  assert.equal(await alice.page.locator('#gameBoard').getAttribute('data-winner'), '1', 'first student sees the winning seat');
  assert.equal(await bob.page.locator('#gameBoard').getAttribute('data-winner'), '1', 'second student sees the same winning seat');
  assert.ok((await bob.page.locator('#seat1Name').innerText()).includes('Alice'), 'winning seat identifies the correct student');
  assert.equal(await alice.page.locator('#gameBoard .winning').count(), 4, 'four winning discs are highlighted');
  assert.equal(await alice.page.locator('#gameBoard [data-move]:enabled').count(), 0, 'finished board rejects further moves');
  passed('Connect 4 alternates turns and shows the same authoritative win on both screens');
  await screenshot(alice.page, 'connect-four-win');
  await fitsViewport(alice.page, ['#gameBoard', '#rematchButton', '#leaveMatch'], '1100x620 finished game');

  await alice.page.locator('#rematchButton').click();
  await waitFor(async () => !(await alice.page.locator('#rematchButton').isEnabled()), 'first rematch request waits for opponent');
  assert.equal(await occupied(alice.page).count(), 7, 'one rematch request does not reset the match');
  await bob.page.locator('#rematchButton').click();
  await Promise.all([boardMoves(alice, 0), boardMoves(bob, 0)]);
  await waitFor(() => moveButton(bob.page, 3).isEnabled(), 'rematch gives other student the first turn');
  await moveButton(bob.page, 3).click();
  await Promise.all([boardMoves(alice, 1), boardMoves(bob, 1)]);
  passed('rematch requires both students and swaps who starts');

  await register(bob, 'tic-tac-toe');
  await rosterRow(charlie.page, 'Bob').waitFor();
  await alice.page.locator('#leaveMatch').click();
  await inMode(alice, 'lobby');
  await waitFor(async () => await rosterRow(alice.page, 'Bob').count() === 0, 'leaving Connect 4 removes the old presence');
  assert.equal(await rosterRow(charlie.page, 'Alice').count(), 0, 'changing games does not merge lobbies');
  passed('switching games leaves the old lobby and joins the new one');

  await invite(bob, charlie);
  await charlie.page.locator('#acceptInvite').click();
  await Promise.all([inMode(bob, 'online'), inMode(charlie, 'online')]);
  for (const [i, move] of [0, 3, 1, 4, 2].entries()) {
    const current = i % 2 === 0 ? bob : charlie;
    await moveButton(current.page, move).click();
    await Promise.all([boardMoves(bob, i + 1), boardMoves(charlie, i + 1)]);
    await sameBoards([bob, charlie]);
  }
  await waitFor(() => bob.page.locator('#rematchButton').isEnabled(), 'Tic-tac-toe reaches a finished match');
  assert.equal(await charlie.page.locator('#gameBoard').getAttribute('data-winner'), '1', 'Tic-tac-toe shows the winning seat');
  assert.ok((await charlie.page.locator('#seat1Name').innerText()).includes('Bob'), 'Tic-tac-toe identifies the winning student');
  assert.equal(await charlie.page.locator('#gameBoard .winning').count(), 3, 'Tic-tac-toe highlights the winning line');
  passed('Tic-tac-toe supports the same invitation and synchronized play flow');
  await charlie.page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await charlie.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'mobile board fits viewport width');
  await screenshot(charlie.page, 'tic-tac-toe-mobile');
  await charlie.page.setViewportSize({ width: 1100, height: 620 });
  return { alice, bob, charlie };
}

async function testPortalFrames(endpoint, { alice, charlie }) {
  const dana = await student('Dana', endpoint);
  await dana.page.goto(site.origin + '/#/play/connect-four', { waitUntil: 'load' });
  let frame = dana.page.frameLocator('#stage iframe');
  await frame.locator('#playerName').fill('Dana');
  await frame.locator('#joinButton').click();
  await rosterRow(alice.page, 'Dana').waitFor();
  await rosterRow(frame, 'Alice').waitFor();
  await screenshot(dana.page, 'portal-connect-four-lobby');
  await fitsViewport(frame, ['#gameBoard', '#pcButton', '#connectionStatus'], 'portal Connect 4 iframe');

  // Same-document hash navigation exercises the real portal router, which
  // removes the old iframe and mounts the next game without reloading the site.
  await dana.page.goto(site.origin + '/#/play/tic-tac-toe');
  await dana.page.locator('#stage iframe[src*="tic-tac-toe"]').waitFor();
  frame = dana.page.frameLocator('#stage iframe');
  await frame.locator('#playerName').fill('Dana');
  await frame.locator('#joinButton').click();
  await rosterRow(charlie.page, 'Dana').waitFor();
  await fitsViewport(frame, ['#gameBoard', '#pcButton', '#connectionStatus'], 'portal Tic-tac-toe iframe');
  await waitFor(async () => await rosterRow(alice.page, 'Dana').count() === 0, 'iframe removal leaves Connect 4 presence');
  assert.equal(await rosterRow(frame, 'Alice').count(), 0, 'replacement iframe has no old-game roster');
  assert.equal(dana.sockets.length, 2, 'each game iframe opens exactly one connection');
  await dana.context.close();
  await waitFor(async () => await rosterRow(charlie.page, 'Dana').count() === 0, 'closing the portal removes current presence');
  passed('portal iframe navigation removes the old presence and keeps game lobbies separate');
}

async function testServiceRestart({ bob, charlie }) {
  await bob.page.locator('#rematchButton').click();
  await charlie.page.locator('#rematchButton').click();
  await Promise.all([boardMoves(bob, 0), boardMoves(charlie, 0)]);
  await moveButton(charlie.page, 4).click();
  await Promise.all([boardMoves(bob, 1), boardMoves(charlie, 1)]);
  const { port } = multiplayer.server.address();
  await multiplayer.close();
  multiplayer = createMultiplayerServer({ allowedOrigins: [site.origin], inviteCooldownMs: 0, reconnectGraceMs: 15000, sweepMs: 100 });
  await multiplayer.listen(port, '127.0.0.1');
  await Promise.all([inMode(bob, 'lobby'), inMode(charlie, 'lobby')]);
  await Promise.all([boardMoves(bob, 0), boardMoves(charlie, 0)]);
  await rosterRow(bob.page, 'Charlie').waitFor();
  await invite(bob, charlie);
  await charlie.page.locator('#acceptInvite').click();
  await Promise.all([inMode(bob, 'online'), inMode(charlie, 'online')]);
  await moveButton(bob.page, 0).click();
  await Promise.all([boardMoves(bob, 1), boardMoves(charlie, 1)]);
  passed('service restart replaces expired sessions, clears the obsolete match, and permits a new invitation');
}

async function testComputer() {
  for (const game of ['connect-four', 'tic-tac-toe']) {
    const player = await student('Computer ' + game);
    await openGame(player, game);
    await player.page.waitForLoadState('networkidle');
    player.conditions.intentionalOffline = true;
    await player.context.setOffline(true);
    await player.page.locator('#pcButton').click();
    await inMode(player, 'computer');
    await moveButton(player.page, game === 'connect-four' ? 3 : 0).click();
    await boardMoves(player, 2);
    assert.equal(player.sockets.length, 0, `${game}: computer play opens no sockets`);
    assert.equal(await player.page.locator('#gameBoard .one').count(), 1, `${game}: student's move is rendered`);
    assert.equal(await player.page.locator('#gameBoard .two').count(), 1, `${game}: computer responds offline`);
    await player.context.close();
  }
  const filePlayer = await student('Local file computer');
  await filePlayer.page.goto(pathToFileURL(path.join(ROOT, 'games/tic-tac-toe/index.html')).href, { waitUntil: 'load' });
  await filePlayer.page.locator('#pcButton').click();
  await inMode(filePlayer, 'computer');
  await moveButton(filePlayer.page, 0).click();
  await boardMoves(filePlayer, 2);
  assert.equal(filePlayer.sockets.length, 0, 'file:// computer play opens no socket');
  await filePlayer.context.close();
  passed('both computer opponents work without a service or network; local file play also works');

  const restricted = await student('Restricted storage');
  await restricted.context.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage disabled by test', 'SecurityError'); } });
    }
  });
  await openGame(restricted, 'connect-four');
  await restricted.page.locator('#pcButton').click();
  await moveButton(restricted.page, 3).click();
  await boardMoves(restricted, 2);
  await restricted.context.close();
  passed('computer play works when the browser denies session and local storage');
}

async function testExistingPages(endpoint) {
  const player = await student('Existing pages', endpoint);
  for (const route of ['/', '/games/merge-2048/']) {
    await player.page.goto(site.origin + route, { waitUntil: 'load' });
    assert.ok((await player.page.title()).trim(), `${route}: page loads`);
    assert.equal(await player.page.evaluate(() => typeof window.SGMultiplayer), 'undefined', `${route}: no multiplayer runtime loaded`);
    assert.equal(await player.page.evaluate(() => typeof window.SGBoardRules), 'undefined', `${route}: no new board rules loaded`);
  }
  assert.equal(player.sockets.length, 0, 'portal and existing games create no multiplayer sockets');
  assert.equal(player.requests.some(url => /(?:multiplayer-(?:client|config)|board-(?:game|rules))\.js/.test(url)), false, 'portal and existing games do not request multiplayer scripts');
  await player.context.close();
  passed('portal and existing games load no multiplayer code and create no sockets');
}

try {
  console.log(`Multiplayer browser checks (${path.relative(REPO, ROOT) || 'source'})`);
  site = await startTestServer(ROOT);
  multiplayer = createMultiplayerServer({ allowedOrigins: [site.origin], inviteCooldownMs: 0, reconnectGraceMs: 15000, sweepMs: 100 });
  const address = await multiplayer.listen(0, '127.0.0.1');
  const endpoint = `ws://127.0.0.1:${address.port}/ws`;
  browser = await launchChromium();
  const students = await testOnline(endpoint);
  await testPortalFrames(endpoint, students);
  await testServiceRestart(students);
  await Promise.all(Object.values(students).map(player => player.context.close()));
  await testComputer();
  await testExistingPages(endpoint);
  assert.deepEqual(errors, [], 'all browser contexts are free of runtime and console errors');
  passed('all student browser contexts have no JavaScript exceptions or unexpected console errors');
  if (expectedBrowserErrors.length) console.log(`  NOTE ${expectedBrowserErrors.length} browser tab-icon requests failed as expected after deliberate offline switches.`);
  console.log('All multiplayer browser checks passed.');
} catch (error) {
  if (errors.length) console.error('Browser console errors:', errors);
  throw error;
} finally {
  await cleanup();
}

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = await startTestServer(site);
  origin = server.origin;
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function gamePage(t, start = true) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'game should not throw browser errors'));
  await page.goto(origin + '/games/merge-2048/');
  if (start) await page.keyboard.press('Enter');
  return page;
}

async function state(page) {
  return page.evaluate(() => window.__game.state());
}

async function awaitScreen(page, screen) {
  await page.waitForFunction(value => window.__game.state().screen === value, screen, { timeout: 15000 });
}


test('Repeated Undo clears the newly scheduled result when the winning move is undone too', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.__game.nearWin();
    window.__game.move(3);
    window.__game.move(0);
    window.__game.undo();
    window.__game.undo();
  });
  await page.waitForTimeout(900);
  const restored = await state(page);
  assert.equal(restored.screen, 'play');
  assert.equal(restored.max, 1024);
  assert.equal(restored.won, false);
  assert.equal(restored.undos, 1);
  assert.equal(restored.hist, 0);
  await page.evaluate(() => window.__game.move(3));
  await awaitScreen(page, 'win');
});

for (const exit of ['menu', 'reload']) {
  test(`Undo's pending victory survives ${exit} and stops repeating after acknowledgement`, async t => {
    const page = await gamePage(t);
    const winning = await page.evaluate(exit => {
      window.__game.nearWin();
      window.__game.move(3);
      const previous = window.__game.state();
      window.__game.move(0);
      window.__game.undo();
      // Pause in the same task so the result cannot race browser navigation.
      if (exit === 'menu') window.__game.menu();
      else window.__game.pause();
      return previous;
    }, exit);
    if (exit === 'reload') await page.reload();
    await page.keyboard.press('Enter');
    await awaitScreen(page, 'win');
    assert.deepEqual((await state(page)).values, winning.values);
    await page.locator('#btnKeep').click();
    if (exit === 'menu') await page.evaluate(() => window.__game.menu());
    else await page.reload();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const acknowledged = await state(page);
    assert.equal(acknowledged.screen, 'play');
    assert.equal(acknowledged.won, true);
    assert.equal(acknowledged.keep, true);
  });
}

test('Undo after acknowledgement never presents the same victory again', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.__game.nearWin();
    window.__game.move(3);
    window.__game.move(0);
  });
  await awaitScreen(page, 'win');
  await page.locator('#btnKeep').click();
  await page.evaluate(() => window.__game.undo());
  await page.waitForTimeout(900);
  assert.equal((await state(page)).screen, 'play');
  assert.equal((await state(page)).max, 2048);
  await page.evaluate(() => {
    window.__game.undo();
    window.__game.move(3);
  });
  await page.reload();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const acknowledged = await state(page);
  assert.equal(acknowledged.screen, 'play');
  assert.equal(acknowledged.max, 2048);
  assert.equal(acknowledged.keep, true);
});

for (const key of ['Space']) {
  test(`${key} activates the focused size and pause-menu buttons without a gameplay shortcut`, async t => {
    const page = await gamePage(t, false);
    const size = page.locator('.szb[data-n="3"]');
    await size.focus();
    await page.keyboard.press(key);
    assert.equal((await state(page)).screen, 'title');
    assert.equal(await size.evaluate(button => button.classList.contains('on')), true);
    await page.locator('#btnPlay').focus();
    await page.keyboard.press(key);
    assert.equal((await state(page)).N, 3);
    assert.equal((await state(page)).screen, 'play');
    await page.keyboard.press('Escape');
    await page.locator('#btnPauseMenu').focus();
    await page.keyboard.press(key);
    assert.equal((await state(page)).screen, 'title');
  });
}

test('Pointer Undo returns focus to the board so the next arrow can merge tiles', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    window.__game.move(3);
  });
  await page.locator('#btnUndo').click();
  assert.equal((await state(page)).score, 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
  await page.keyboard.press('ArrowLeft');
  const moved = await state(page);
  assert.equal(moved.score, 4);
  assert.equal(moved.max, 4);
  assert.equal(moved.hist, 1);
});

async function makeThreeMoves(page) {
  await page.evaluate(() => {
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0]);
    window.__game.move(3);
    window.__game.move(0);
    window.__game.move(1);
  });
}

// makeThreeMoves spawns random tiles, so a fixed arrow can be a no-op (e.g. ArrowDown when every
// tile already rests on the bottom edge or a full column has no pair). Pick one that moves.
function movingArrow(values) {
  const n = Math.sqrt(values.length);
  for (const [key, dr, dc] of [['ArrowDown', 1, 0], ['ArrowUp', -1, 0], ['ArrowLeft', 0, -1], ['ArrowRight', 0, 1]]) {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = values[r * n + c], tr = r + dr, tc = c + dc;
      if (!v || tr < 0 || tr >= n || tc < 0 || tc >= n) continue;
      const next = values[tr * n + tc];
      if (!next || next === v) return key;
    }
  }
  throw new Error(`no arrow moves this board: ${values.join()}`);
}

test('Pointer restart confirmation returns board focus and still requires its second activation', async t => {
  const page = await gamePage(t);
  await makeThreeMoves(page);
  const previous = await state(page);
  await page.locator('#btnRestart').click();
  assert.deepEqual((await state(page)).values, previous.values);
  assert.equal(await page.locator('#btnRestart').evaluate(button => button.classList.contains('warn')), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
  await page.keyboard.press(movingArrow(previous.values));
  assert.notDeepEqual((await state(page)).values, previous.values);
  await page.locator('#btnRestart').click();
  const restarted = await state(page);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.hist, 0);
  assert.equal(restarted.undos, 3);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
});

test('A double-click or a held Enter on New game only asks, and a held Enter on Undo spends one undo', async t => {
  const page = await gamePage(t);
  await makeThreeMoves(page);
  const previous = await state(page);
  const box = await page.locator('#btnRestart').boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  assert.deepEqual((await state(page)).values, previous.values, 'the board survives a double-click');
  assert.equal(await page.locator('#btnRestart.warn').count(), 1, 'the button asks for confirmation');
  // Pausing and resuming withdraws the question.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#btnRestart.warn').count(), 0);
  // A held Enter keydown repeats; each repeat would click the focused button again.
  const hold = async id => {
    await page.locator('#' + id).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
  };
  await hold('btnUndo');
  const undone = await state(page);
  assert.deepEqual([undone.undos, undone.hist], [2, 2], 'a held Enter spends one undo');
  await hold('btnRestart');
  assert.deepEqual((await state(page)).values, undone.values, 'the board survives a held Enter');
  assert.equal(await page.locator('#btnRestart.warn').count(), 1);
  await page.keyboard.press('Enter');
  const restarted = await state(page);
  assert.deepEqual([restarted.score, restarted.hist, restarted.undos], [0, 0, 3], 'a separate press still confirms');
});

for (const key of ['Space']) {
  test(`Keyboard ${key} on live HUD controls preserves Tab navigation and restart confirmation`, async t => {
    const page = await gamePage(t);
    await makeThreeMoves(page);
    await page.locator('#btnUndo').focus();
    await page.keyboard.press(key);
    assert.equal((await state(page)).undos, 2);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnUndo');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnTheme');
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnTheme');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnRestart');
    await page.keyboard.press(key);
    assert.equal(await page.locator('#btnRestart').evaluate(button => button.classList.contains('warn')), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnRestart');
    await page.keyboard.press(key);
    const restarted = await state(page);
    assert.equal(restarted.screen, 'play');
    assert.equal(restarted.score, 0);
    assert.equal(restarted.hist, 0);
    assert.equal(restarted.undos, 3);
  });
}

test('Undo from the game-over screen reopens a statistics round, so the next full board is counted', async t => {
  const page = await gamePage(t, false);
  await page.evaluate(() => {
    window.statsLog = [];
    for (const name of ['round', 'end']) {
      const call = Kit.stats[name];
      Kit.stats[name] = function () { window.statsLog.push(name); return call.apply(this, arguments); };
    }
  });
  await page.keyboard.press('Enter');
  await awaitScreen(page, 'play');
  await page.evaluate(() => {
    const n = window.__game.state().N;
    const values = Array(n * n).fill(0);
    // The opening tiles are random. Left then up can both be blocked, and
    // forceOver replaces the board without recording a move, so Undo finds
    // an empty history and stays on the game-over screen. Two separated
    // tiles make the left move slide, whichever way the round spawned.
    values[1] = 2;
    values[n + 2] = 4;
    if (!window.__game.set(values)) throw new Error('could not place the undo board');
    window.__game.move(3);
    if (window.__game.state().hist < 1) throw new Error('left move recorded no undo');
    window.__game.forceOver();
  });
  await awaitScreen(page, 'over');
  await page.evaluate(() => window.__game.undo());
  assert.equal((await state(page)).screen, 'play');
  await page.evaluate(() => window.__game.forceOver());
  await awaitScreen(page, 'over');
  assert.deepEqual(await page.evaluate(() => window.statsLog), ['round', 'end', 'round', 'end']);
});

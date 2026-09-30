import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(site, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
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

async function pendingUndo(page) {
  return page.evaluate(() => {
    window.__game.nearWin();
    window.__game.move(3);
    const winning = window.__game.state();
    window.__game.move(0);
    window.__game.undo();
    return winning;
  });
}

test('Undo after an extra move preserves the first victory on the restored winning board', async t => {
  const page = await gamePage(t);
  const winning = await pendingUndo(page);
  const restored = await state(page);
  assert.deepEqual(restored.values, winning.values);
  assert.equal(restored.score, winning.score);
  assert.equal(restored.undos, 2);
  assert.equal(restored.hist, 1);
  assert.equal(restored.won, true);
  assert.equal(restored.keep, false);
  await awaitScreen(page, 'win');
  assert.equal(await page.locator('#winNum').textContent(), '2048');
});

test('Undo of the winning move cancels its result and allows the next win', async t => {
  const page = await gamePage(t);
  const beforeWin = await page.evaluate(() => {
    window.__game.nearWin();
    const previous = window.__game.state();
    window.__game.move(3);
    window.__game.undo();
    return previous;
  });
  await page.waitForTimeout(900);
  const restored = await state(page);
  assert.deepEqual(restored.values, beforeWin.values);
  assert.equal(restored.score, beforeWin.score);
  assert.equal(restored.screen, 'play');
  assert.equal(restored.won, false);
  assert.equal(restored.keep, false);
  await page.evaluate(() => window.__game.move(3));
  await awaitScreen(page, 'win');
});

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

for (const key of ['Enter', 'Space']) {
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

test('Pointer Theme returns focus to the board without blocking the next merge', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.__game.unlockAll();
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  const previousTheme = (await state(page)).theme;
  await page.locator('#btnTheme').click();
  assert.notEqual((await state(page)).theme, previousTheme);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state(page)).score, 4);
});

async function makeThreeMoves(page) {
  await page.evaluate(() => {
    window.__game.set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0]);
    window.__game.move(3);
    window.__game.move(0);
    window.__game.move(1);
  });
}

test('Pointer restart confirmation returns board focus and still requires its second activation', async t => {
  const page = await gamePage(t);
  await makeThreeMoves(page);
  const previous = await state(page);
  await page.locator('#btnRestart').click();
  assert.deepEqual((await state(page)).values, previous.values);
  assert.equal(await page.locator('#btnRestart').evaluate(button => button.classList.contains('warn')), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
  await page.keyboard.press('ArrowDown');
  assert.notDeepEqual((await state(page)).values, previous.values);
  await page.locator('#btnRestart').click();
  const restarted = await state(page);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.hist, 0);
  assert.equal(restarted.undos, 3);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
});

for (const key of ['Enter', 'Space']) {
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

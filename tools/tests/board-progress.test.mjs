// Browser checks for the board games' computer levels, session score, saved
// wins against the computer and win celebration.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const KEY = 'sg:tic-tac-toe:progress';
let browser, server, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function ticTacToe(t, { reducedMotion = 'reduce', init } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block', reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  if (init) await page.addInitScript(init);
  await page.goto(`${origin}/games/tic-tac-toe/`);
  await page.waitForFunction(() => document.getElementById('boardApp').dataset.mode === 'menu');
  return page;
}
const moves = (page, count) => page.waitForFunction(count => document.getElementById('gameBoard').dataset.moves === String(count), count);
const pressed = page => page.locator('[data-level][aria-pressed="true"]').getAttribute('data-level');
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
async function play(page, list) {
  for (const move of list) {
    const before = Number(await page.locator('#gameBoard').getAttribute('data-moves'));
    await page.locator(`#gameBoard [data-move="${move}"]`).click();
    await page.waitForFunction(before => {
      const board = document.getElementById('gameBoard');
      return board.dataset.winner !== '0' || board.dataset.draw === 'true' ||
        (Number(board.dataset.moves) >= before + 1 && board.querySelector('[data-move]:enabled'));
    }, before);
  }
}

test('the computer starts on easy, remembers the chosen level and ignores corrupt progress', async t => {
  const page = await ticTacToe(t);
  await page.locator('#pcButton').click();
  await moves(page, 0);
  assert.equal(await page.locator('#boardApp').getAttribute('data-mode'), 'computer');
  assert.equal(await pressed(page), 'easy');
  await page.locator('[data-level="medium"]').click();
  assert.equal(await pressed(page), 'medium');
  assert.equal((await saved(page)).level, 'medium');
  await page.reload();
  await page.locator('#pcButton').click();
  assert.equal(await pressed(page), 'medium');

  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ level: 'expert', wins: { easy: -2, medium: '3', hard: 1.5 } })), KEY);
  await page.reload();
  await page.locator('#pcButton').click();
  assert.equal(await pressed(page), 'easy');
  assert.equal(await page.locator('#levelTally').textContent(), 'انتصاراتك: سهل 0 · متوسط 0 · صعب 0');
});

test('wins against the computer score once, are saved and suggest the next level', async t => {
  // With this fixed random value the easy computer never blocks, so 0, 1, 2 wins.
  const page = await ticTacToe(t, { init: () => { Math.random = () => 0.99; } });
  await page.locator('#pcButton').click();
  await play(page, [0, 1, 2]);
  assert.equal(await page.locator('#gameBoard').getAttribute('data-winner'), '1');
  assert.equal(await page.locator('#turnLine').textContent(), 'جديد! هزمت الكمبيوتر السهل!');
  assert.deepEqual([await page.locator('#score1').textContent(), await page.locator('#score2').textContent()], ['1', '0']);
  assert.deepEqual((await saved(page)).wins, { easy: 1, medium: 0, hard: 0 });
  assert.equal(await page.locator('[data-level="easy"]').evaluate(button => button.classList.contains('won')), true);

  await page.locator('#rematchButton').click();
  await moves(page, 1);
  await play(page, [0, 1, 2]);
  assert.equal(await page.locator('#gameBoard').getAttribute('data-winner'), '1');
  assert.equal(await page.locator('#turnLine').textContent(), 'فزت! أحسنت اللعب!');
  assert.equal(await page.locator('#boardHint').textContent(), 'جاهز لتحدي المستوى المتوسط؟');
  assert.equal(await page.locator('#score1').textContent(), '2');
  assert.deepEqual((await saved(page)).wins, { easy: 2, medium: 0, hard: 0 });

  await page.reload();
  await page.locator('#pcButton').click();
  assert.equal(await page.locator('#score1').textContent(), '0');
  assert.match(await page.locator('#levelTally').textContent(), /سهل 2/);
});

test('the session score counts both players, resets with the mode and celebrates with confetti', async t => {
  const page = await ticTacToe(t, { reducedMotion: 'no-preference' });
  await page.locator('#localButton').click();
  await play(page, [0, 3, 1, 4, 2]);
  assert.equal(await page.locator('#score1').textContent(), '1');
  assert.equal(await page.locator('.board-wrap .confetti i').count(), 24);
  assert.equal(await page.locator('#gameBoard .confetti').count(), 0, 'confetti stays outside the board');
  await page.locator('#rematchButton').click();
  assert.equal(await page.locator('.confetti').count(), 0, 'a new round clears the confetti');
  await play(page, [0, 3, 1, 4, 2]);
  assert.equal(await page.locator('#gameBoard').getAttribute('data-winner'), '2');
  assert.deepEqual([await page.locator('#score1').textContent(), await page.locator('#score2').textContent()], ['1', '1']);
  await page.locator('#leaveMatch').click();
  await page.locator('#localButton').click();
  assert.deepEqual([await page.locator('#score1').textContent(), await page.locator('#score2').textContent()], ['0', '0']);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await play(page, [0, 3, 1, 4, 2]);
  assert.equal(await page.locator('#score1').textContent(), '1');
  assert.equal(await page.locator('.confetti').count(), 0, 'reduced motion skips confetti');
});

test('a failed progress save keeps the earlier record and recovers on retry', async t => {
  const page = await ticTacToe(t, {
    init: () => {
      const key = 'sg:tic-tac-toe:progress';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ level: 'easy', wins: { easy: 1, medium: 0, hard: 0 } }));
    }
  });
  const before = await page.evaluate(key => localStorage.getItem(key), KEY);
  await page.evaluate(key => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('blocked', 'SecurityError');
      return window.restoreStorage.call(this, name, value);
    };
  }, KEY);
  await page.locator('#pcButton').click();
  await page.locator('[data-level="hard"]').click();
  assert.equal(await pressed(page), 'hard');
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), before);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  assert.deepEqual(await saved(page), { level: 'hard', wins: { easy: 1, medium: 0, hard: 0 } });
});

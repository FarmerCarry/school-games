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

async function game(t, { saved, failSave = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(({ saved, failSave }) => {
    if (saved !== undefined) localStorage.setItem('sg:egg-rush:save', saved);
    let kit;
    const er = window.er = { stats: [], failSave: !!failSave };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        er.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        return { stop() {} };
      };
      for (const name of ['round', 'end', 'tutorial']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { er.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:egg-rush:save' && er.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { saved, failSave });
  await page.goto(`${server.origin}/games/egg-rush/`);
  await page.waitForFunction(() => window.__game && window.er.step);
  return page;
}
const blur = page => page.evaluate(() => { document.activeElement && document.activeElement.blur(); document.getElementById('game').focus(); });

test('the title is not a round, and a run can pause, resume, and return to the menu', async t => {
  const page = await game(t);
  assert.deepEqual(await page.evaluate(() => er.stats), []);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => er.step(2));
  assert.equal(await page.evaluate(() => __game.screen), 'play');
  assert.equal((await page.evaluate(() => er.stats))[0][0], 'round');
  await blur(page);
  await page.keyboard.press('KeyP');
  await page.evaluate(() => er.step(1));
  assert.equal(await page.evaluate(() => __game.screen), 'pause');
  const x = await page.evaluate(() => __game.px);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => er.step(20));
  await page.keyboard.up('ArrowRight');
  assert.equal(await page.evaluate(() => __game.px), x, 'pause freezes the runner');
  await page.locator('#btnResume').click();
  await page.evaluate(() => er.step(1));
  assert.equal(await page.evaluate(() => __game.screen), 'play');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => er.step(1));
  assert.equal(await page.evaluate(() => __game.screen), 'pause', 'leaving the window pauses');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.evaluate(() => er.step(5));
  assert.equal(await page.evaluate(() => __game.screen), 'pause', 'focus does not resume');
  await page.locator('#btnMenu').click();
  assert.equal(await page.evaluate(() => __game.screen), 'title');
  assert.equal((await page.evaluate(() => er.stats.filter(s => s[0] === 'end'))).length, 1);
});

test('moving right changes the runner, and a bought upgrade survives a reload', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await blur(page);
  const x = await page.evaluate(() => __game.px);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => er.step(30));
  await page.keyboard.up('ArrowRight');
  assert.ok(await page.evaluate(x => __game.px > x + 0.3, x));
  await page.evaluate(() => { __game.give(100); __game.buy('shoes'); er.step(2); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:egg-rush:save')));
  assert.equal(saved.shoes, 1);
  assert.ok(saved.coins < 100);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.er.step);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => er.step(2));
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:egg-rush:save')));
  assert.equal(again.shoes, 1);
  assert.ok(again.coins >= saved.coins - 1);
});

test('a hatch in progress finishes after a reload, on the saved clock', async t => {
  const page = await game(t);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => { er.step(2); __game.setInc(8000); __game.save(); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.er.step);
  await page.locator('#btnPlay').click();
  await page.evaluate(() => er.step(2));
  assert.equal(await page.evaluate(() => __game.pets()), 0);
  await page.evaluate(() => er.step(520));
  assert.equal(await page.evaluate(() => __game.pets()), 1);
});

test('a corrupt save shows the Arabic notice and the game still starts', async t => {
  const page = await game(t, { saved: '{broken' });
  await page.locator('#btnPlay').click();
  await page.evaluate(() => er.step(3));
  assert.match(await page.evaluate(() => __game.notice()), /تعذّر قراءة الحفظ/);
  await blur(page);
  const x = await page.evaluate(() => __game.px);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => er.step(20));
  await page.keyboard.up('ArrowRight');
  assert.ok(await page.evaluate(x => __game.px > x, x));
});

test('a blocked save shows the retry status', async t => {
  const page = await game(t, { failSave: true });
  await page.locator('#btnPlay').click();
  await page.evaluate(() => er.step(2));
  assert.equal(await page.locator('.sg-save-status').isVisible(), true);
});

test('both duelists move, and the match reports end or draw', async t => {
  const page = await game(t);
  await page.locator('#btn2p').click();
  await blur(page);
  await page.evaluate(() => er.step(2));
  const start = await page.evaluate(() => [__game.px, __game.p2x()]);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => er.step(25));
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  const moved = await page.evaluate(() => [__game.px, __game.p2x()]);
  assert.ok(moved[0] > start[0] + 0.2, 'player 1 moved right');
  assert.ok(moved[1] < start[1] - 0.2, 'player 2 moved left');
  await page.evaluate(() => { __game.tune(w => { w.matchT = 0.05; }); er.step(8); });
  assert.equal(await page.evaluate(() => __game.screen), 'result');
  const end = await page.evaluate(() => er.stats.filter(s => s[0] === 'end'));
  assert.equal(end.length, 1);
  assert.ok(end[0][1] === 'end' || end[0][1] === 'draw');
});

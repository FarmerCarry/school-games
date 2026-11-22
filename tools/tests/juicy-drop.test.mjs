// Juicy Drop 2.5D (سلّة الفواكه): browser gameplay checks (title, aim, drop, pause/restart, jar skins).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;

let browser, server;
before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test('Juicy Drop 2.5D browser: title, aim & drop, pause freeze, restart, and jar skins', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${server.origin}/games/juicy-drop/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__game && window.__game.state.screen === 'title', null, { timeout: 15000 });

    // Skins menu opens and closes cleanly
    await page.click('#btnSkins');
    await page.waitForFunction(() => window.__game.state.screen === 'skins');
    await page.click('#skinsBack');
    await page.waitForFunction(() => window.__game.state.screen === 'title');

    // Start play
    await page.click('#btnPlay');
    await page.waitForFunction(() => window.__game.state.screen === 'play' && window.__game.state.canDrop);

    // Aim right with ArrowRight then drop with Space
    const aim0 = await page.evaluate(() => window.__game.state.aim);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(a0 => window.__game.state.aim > a0 + 0.05, aim0, { timeout: 4000 });
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__game.state.drops === 1 && window.__game.state.fruits >= 1, null, { timeout: 4000 });

    // Pause freezes simulation, resume continues, restart resets jar
    await page.click('#btnPause');
    await page.waitForFunction(() => window.__game.state.paused);
    const tPaused = await page.evaluate(() => window.__game.state.time);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__game.state.time), tPaused, 'time freezes while paused');
    await page.click('#btnResume');
    await page.waitForFunction(() => !window.__game.state.paused);
    await page.click('#btnPause');
    await page.waitForFunction(() => window.__game.state.paused);
    await page.click('#btnRestart');
    await page.waitForFunction(() => window.__game.state.screen === 'play' && window.__game.state.drops === 0 && window.__game.state.score === 0);

    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join('; ')}`);
  } finally {
    await ctx.close();
  }
});

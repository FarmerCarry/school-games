// Shortcut Factory 3D (مصنع الاختصارات): browser gameplay checks (title, Ctrl+C/V, pause/restart, map, skins).
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

test('Shortcut Factory 3D browser: title, Ctrl+C/Ctrl+V, pause/resume/restart, map and skins', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${server.origin}/games/shortcut-factory/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__game && window.__game.state.screen === 'title', null, { timeout: 15000 });

    // Map & skins open cleanly
    await page.click('#btnMap');
    await page.waitForFunction(() => window.__game.state.screen === 'map');
    await page.click('#mapSkins');
    await page.waitForFunction(() => window.__game.state.screen === 'skins');
    await page.click('#skinsBack');
    await page.waitForFunction(() => window.__game.state.screen === 'map');
    await page.click('#mapHome');
    await page.waitForFunction(() => window.__game.state.screen === 'title');

    // Start level 1-1
    await page.click('#btnPlay');
    await page.waitForFunction(() => window.__game.state.screen === 'play' && window.__game.state.toys >= 1);

    // Select the duck via ArrowRight (if not already selected), then Ctrl+C and Ctrl+V
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+KeyC');
    await page.waitForFunction(() => window.__game.state.copies >= 1 && window.__game.state.clip >= 1, null, { timeout: 5000 });
    await page.keyboard.press('Control+KeyV');
    await page.waitForFunction(() => window.__game.state.pastes >= 1 && window.__game.state.toys >= 2, null, { timeout: 5000 });

    // Pause freezes time, resume continues, restart resets counts
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
    await page.waitForFunction(() => window.__game.state.screen === 'play' && window.__game.state.copies === 0 && window.__game.state.pastes === 0);

    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join('; ')}`);
  } finally {
    await ctx.close();
  }
});

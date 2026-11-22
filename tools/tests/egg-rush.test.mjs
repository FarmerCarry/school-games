// Egg Rush 3D (سباق البيض): browser gameplay checks (title, solo race, steering, pause/restart, 2P, skins).
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
  browser = await launchChromium({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test('Egg Rush 3D browser: start, race steering, pause/resume/restart, 2P and wardrobe', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${server.origin}/games/egg-rush/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__game && window.__game.state.screen === 'title', null, { timeout: 15000 });

    // Open wardrobe and return
    await page.click('#btnSkins');
    await page.waitForFunction(() => window.__game.state.screen === 'skins');
    await page.click('#skinsBack');
    await page.waitForFunction(() => window.__game.state.screen === 'title');

    // Start solo race
    await page.click('#btnPlay');
    await page.waitForFunction(() => window.__game.state.screen === 'play' && window.__game.state.phase === 'race', null, { timeout: 12000 });

    // Steer right with ArrowRight and verify lateral movement
    const x0 = await page.evaluate(() => window.__game.state.p1.x);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(oldX => window.__game.state.p1.x > oldX + 0.15, x0, { timeout: 5000 });
    await page.keyboard.up('ArrowRight');

    // Pause freezes race time, resume continues, restart resets distance
    await page.click('#btnPause');
    await page.waitForFunction(() => window.__game.state.screen === 'pause');
    const tPaused = await page.evaluate(() => window.__game.state.time);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__game.state.time), tPaused, 'time freezes while paused');
    await page.click('#btnResume');
    await page.waitForFunction(() => window.__game.state.screen === 'play');
    await page.click('#btnPause');
    await page.waitForFunction(() => window.__game.state.screen === 'pause');
    await page.click('#btnRestart');
    await page.waitForFunction(() => window.__game.state.screen === 'play' && window.__game.state.p1.s === 0);

    // Go to map -> home -> 2P mode
    await page.click('#btnPause');
    await page.waitForFunction(() => window.__game.state.screen === 'pause');
    await page.click('#btnHome');
    await page.waitForFunction(() => window.__game.state.screen === 'map');
    await page.click('#mapHome');
    await page.waitForFunction(() => window.__game.state.screen === 'title');
    await page.click('#btnDuo');
    await page.click('#btnPlay');
    await page.waitForFunction(() => window.__game.state.screen === 'play' && window.__game.state.humans === 2 && !!window.__game.state.p2);

    assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join('; ')}`);
  } finally {
    await ctx.close();
  }
});

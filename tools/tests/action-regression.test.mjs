import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
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

async function gamePage(t, slug) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let seed = 123456789;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // Capture the real fixed-step update before game boot, for source and inlined builds alike.
    // Rendering and wall-clock speed cannot influence these state/save regressions.
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = update => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); };
          return { stop() {} };
        };
      }
    });
  });
  await page.goto(`${origin}/games/${slug}/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

async function startSnake(page) {
  await page.waitForFunction(() => performance.now() > 300);
  await page.evaluate(() => document.getElementById('btnPlay').click());
  assert.equal(await page.evaluate(() => __game.state), 'play');
}

test('Snake Arena records length on a fatal tick that never reaches runTick', async t => {
  const page = await gamePage(t, 'snake-arena');
  await startSnake(page);
  const result = await page.evaluate(() => {
    __game.setMass(2001);
    SA.world.player.hx = SA.world.R + 100;
    stepGame();
    const stateAfterCollision = __game.state;
    stepGame(200);
    return { stateAfterCollision, best: __game.stats.bestLen, death: SA.game.run.deathLen, peak: SA.game.run.peakLen };
  });
  assert.deepEqual(result, { stateAfterCollision: 'dying', best: 2001, death: 2001, peak: 2001 });
});

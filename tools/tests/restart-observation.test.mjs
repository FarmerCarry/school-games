import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';
import { scenarios } from '../game-scenarios.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const scenario = scenarios['blob-battle'];
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

async function pageFor(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  return page;
}

test('Blob restart observation survives legitimate growth before the next async check', async t => {
  const page = await pageFor(t);
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = update => {
        window.stepGame = n => { for (let i = 0; i < n; i++) update(1 / 60); };
        return { stop() {} };
      };
    } });
  });
  await page.goto(server.origin + '/games/blob-battle/');
  await page.waitForFunction(() => window.__game && window.stepGame);
  await clickControl(page, '#btnPlay');
  await clickControl(page, '#pauseBtn');
  await page.evaluate(() => {
    // This ordinary world has nearby golden pellets. No entity/state is edited.
    let seed = 1;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let n = Math.imul(seed ^ seed >>> 15, seed | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  });
  const realClick = page.mouse.click.bind(page.mouse);
  page.mouse.click = async (...args) => {
    await realClick(...args);
    // Model a delayed driver observation: normal updates run after the UI
    // handler and before runScenario can issue its next browser query.
    await page.evaluate(() => stepGame(20));
  };
  try { await scenario.restart(page); } finally { page.mouse.click = realClick; }
  const current = await page.evaluate(() => __game.info());
  assert.ok(current.mass >= 30, 'the old live mass threshold must actually be exceeded');
  assert.equal(current.alive, true);
  assert.equal(current.playerCells, 1);
  assert.deepEqual(await page.evaluate(() => window.sgBlobRestart), { state: 'play', alive: true, playerCells: 1, mass: 20 });
  assert.equal(await page.evaluate(scenario.active), true, 'live gameplay still resumes');
  assert.equal(await page.evaluate(scenario.reset), true, 'the exact reset was observed before growth');
});

test('Blob restart observation rejects wrong mass, dead or split players, and a paused result', async t => {
  const page = await pageFor(t);
  for (const bad of [
    { state: 'play', alive: true, playerCells: 1, mass: 40 },
    { state: 'play', alive: false, playerCells: 1, mass: 20 },
    { state: 'play', alive: true, playerCells: 2, mass: 20 },
    { state: 'pause', alive: true, playerCells: 1, mass: 20 }
  ]) {
    await page.setContent('<button id="btnRestart" onclick="window.clicked++">Broken restart</button>');
    await page.evaluate(bad => {
      window.clicked = 0;
      window.__game = { info: () => bad };
      // A previous successful observation must not conceal a broken restart.
      window.sgBlobRestart = { state: 'play', alive: true, playerCells: 1, mass: 20 };
    }, bad);
    await scenario.restart(page);
    assert.equal(await page.evaluate(() => window.clicked), 1, 'the actual button handler ran');
    assert.deepEqual(await page.evaluate(() => window.sgBlobRestart), bad);
    assert.equal(await page.evaluate(scenario.reset), false, JSON.stringify(bad));
  }
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function gamePage(t, slug) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  await page.goto(`${origin}/games/${slug}/`);
  await page.waitForFunction(() => window.__game && window.Kit);
  return page;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function activate(page, selector, key) {
  await page.locator(selector).focus();
  await page.keyboard.press(key, { delay: 60 });
  await settle(page);
}

for (const key of ['Enter', 'Space']) {
  test(`Pool Party ${key} activates focused settings, mute and two-player controls only`, async t => {
    const page = await gamePage(t, 'pool-party');
    const before = await page.evaluate(() => window.__game.save.aim);
    await activate(page, '#btnAim', key);
    assert.notEqual(await page.evaluate(() => window.__game.save.aim), before);
    assert.equal(await page.evaluate(() => window.__game.screen), 'title');

    await activate(page, '.sg-mute', key);
    assert.equal(await page.evaluate(() => Kit.audio.muted), true);
    assert.equal(await page.evaluate(() => window.__game.screen), 'title');
    await activate(page, '#btn2p', key);
    assert.equal(await page.evaluate(() => window.__game.kind), 'pvp');
    assert.equal(await page.evaluate(() => window.__game.screen), 'game');
    assert.equal(await page.evaluate(() => Kit.keys.down('Space') || Kit.keys.down('Enter')), false);
  });

  test(`Fire and Ice ${key} selects solo mode without also starting a level`, async t => {
    const page = await gamePage(t, 'fire-and-ice');
    await activate(page, '#modeSolo', key);
    assert.equal(await page.evaluate(() => window.__game.save.solo), true);
    assert.equal(await page.evaluate(() => window.__game.mode), 'title');
    await page.locator('#game').focus();
    await page.keyboard.press(key);
    await page.waitForFunction(() => window.__game.mode === 'play');
    const x = await page.evaluate(() => window.__game.world.fire.x);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(x => window.__game.world.fire.x > x + 1, x);
    await page.keyboard.up('ArrowRight');
  });

  test(`Paint Grab ${key} opens the focused skins menu and retains canvas shortcuts`, async t => {
    const page = await gamePage(t, 'paint-grab');
    await activate(page, '#bSkins', key);
    assert.equal(await page.evaluate(() => window.__game.state), 'skins');
    await page.locator('#game').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__game.state), 'title');
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => window.__game.state), 'play');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__game.state), 'pause');
  });

  test(`Hoop Heads and Troll Level allow native ${key} on menu buttons`, async t => {
    const hoop = await gamePage(t, 'hoop-heads');
    await activate(hoop, '[data-act="shop"]', key);
    assert.equal(await hoop.evaluate(() => window.__game.state), 'shop');
    const troll = await gamePage(t, 'troll-level');
    await activate(troll, '#btn-levels', key);
    assert.equal(await troll.evaluate(() => window.__game.mode), 'select');
  });
}

test('Tab and Shift+Tab traverse focused game controls without starting play', async t => {
  const page = await gamePage(t, 'pool-party');
  await page.locator('#btn2p').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btnTrick');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btn2p');
  await settle(page);
  assert.equal(await page.evaluate(() => window.__game.screen), 'title');
  await page.locator('#game').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.screen === 'game');
  assert.equal(await page.evaluate(() => window.__game.kind), 'cpu');
  await page.keyboard.press('m');
  assert.equal(await page.evaluate(() => Kit.audio.muted), true, 'canvas mute shortcut remains available');
});

test('editable controls, browser chords and keys handled by UI stay out of gameplay', async t => {
  const page = await gamePage(t, 'paint-grab');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'keyboard-fixture';
    document.body.appendChild(input);
    input.focus();
  });
  await page.keyboard.type('my name');
  await page.keyboard.press('Home');
  await page.keyboard.type('a ');
  assert.equal(await page.locator('#keyboard-fixture').inputValue(), 'a my name');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false, 'typing M must not mute the game');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__game.state), 'title');
  await page.keyboard.down('ArrowRight');
  assert.equal(await page.evaluate(() => Kit.keys.down('ArrowRight')), false);
  await page.keyboard.up('ArrowRight');

  await page.locator('#game').focus();
  await page.keyboard.press('Control+Space');
  await page.keyboard.press('Control+m');
  assert.equal(await page.evaluate(() => window.__game.state), 'title');
  assert.equal(await page.evaluate(() => Kit.audio.muted), false);
  await page.evaluate(() => window.addEventListener('keydown', e => {
    if (e.code === 'Space') e.preventDefault();
  }, { capture: true, once: true }));
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__game.state), 'title', 'UI handled key must not also start a match');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__game.state), 'play', 'Kit scroll blocking still permits game-owned Space');
});

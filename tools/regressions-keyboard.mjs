import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

function stateOfGame() {
  const g = window.__game;
  if (!g && window.GolfArt && document.getElementById('title-screen')) {
    // Golf exposes its screens in the DOM instead of a production debug API.
    // A leaked shortcut can start a shot or open an overlay, both observable here.
    const screens = ['title-screen', 'swing-controls', 'flight-hint', 'modal', 'pause-content', 'result-content', 'worlds-content', 'upgrades-content'];
    return JSON.stringify(Object.fromEntries(screens.map(id => [id, !document.getElementById(id).hidden])));
  }
  let state = typeof g.state === 'function' ? g.state() : g.state;
  if (state && typeof state === 'object') return JSON.stringify({ screen: state.screen, phase: state.phase, ui: state.ui, paused: state.paused, modal: state.modal });
  return state ?? g.mode ?? g.screen ?? null;
}

// Check the real event listeners of every game, including handlers outside Kit.
// Temporary native controls isolate browser behavior from each game's menu layout.
export async function testNativeControls({ browser, origin, repo }) {
  const catalog = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), catalog);
  for (const { slug } of catalog.window.GAMES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(`${origin}/games/${slug}/`, { waitUntil: 'load' });
      await page.waitForFunction(slug => !!window.Kit && (slug === 'skybound-golf'
        ? !!window.GolfArt && !!window.GolfPhysics && !!document.getElementById('title-screen')
        : !!window.__game), slug);
      await page.evaluate(() => {
        const panel = document.createElement('div');
        panel.id = 'regression-controls';
        panel.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:white;padding:8px';
        panel.innerHTML = '<button id="regression-button" type="button">test</button><input id="regression-text" type="text"><input id="regression-range" type="range" min="0" max="10" value="5" step="1">';
        document.body.appendChild(panel);
        window.__nativeClicks = 0;
        document.getElementById('regression-button').addEventListener('click', () => window.__nativeClicks++);
        Kit.keys.reset();
      });
      const before = await page.evaluate(stateOfGame);
      await page.locator('#regression-button').focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__nativeClicks), 2, `${slug}: Space and Enter each activate a native button once`);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'regression-text', `${slug}: Tab reaches the next control`);
      const muted = await page.evaluate(() => Kit.audio.muted);
      await page.keyboard.type('mp');
      assert.equal(await page.locator('#regression-text').inputValue(), 'mp', `${slug}: text fields receive game hotkey letters`);
      assert.equal(await page.evaluate(() => Kit.audio.muted), muted, `${slug}: typing M does not mute the game`);
      assert.equal(await page.evaluate(stateOfGame), before, `${slug}: native controls do not start, pause, or restart the game`);
      await page.locator('#regression-range').focus();
      await page.keyboard.press('ArrowRight');
      assert.notEqual(await page.locator('#regression-range').inputValue(), '5', `${slug}: native slider arrow works`);
      await page.keyboard.press('Home');
      assert.equal(await page.locator('#regression-range').inputValue(), '0', `${slug}: native slider Home works`);
      await page.keyboard.press('End');
      assert.equal(await page.locator('#regression-range').inputValue(), '10', `${slug}: native slider End works`);
      assert.equal(await page.evaluate(() => Kit.keys.anyDown(['Space', 'Enter', 'KeyM', 'KeyP', 'ArrowRight', 'Home', 'End', 'Tab'])), false, `${slug}: control keys stay out of gameplay state`);
      const surface = await page.evaluate(() => {
        document.getElementById('regression-controls').remove();
        Kit.keys.reset();
        const event = new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true, cancelable: true });
        window.dispatchEvent(event);
        const result = { prevented: event.defaultPrevented, held: Kit.keys.down('ArrowRight') };
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
        result.released = !Kit.keys.down('ArrowRight');
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', cancelable: true }));
        window.dispatchEvent(new Event('blur'));
        result.clearOnBlur = !Kit.keys.down('ArrowRight') && !Kit.keys.pressed('ArrowRight');
        return result;
      });
      assert.deepEqual(surface, { prevented: true, held: true, released: true, clearOnBlur: true }, `${slug}: surface input still works and resets`);
      assert.deepEqual(errors, [], `${slug}: no browser exceptions`);
      console.log(`  ✓ ${slug}: native controls and surface input`);
    } finally { await context.close(); }
  }
  return catalog.window.GAMES.length;
}

async function focusSurface(frame) {
  await frame.evaluate(() => { document.activeElement?.blur(); window.focus(); Kit.keys.reset(); });
}

export async function testPortalKeyboard({ browser, origin }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${origin}/#/play/air-hockey`);
    await page.waitForSelector('#stage iframe');
    const frame = page.frames().find(f => f.url().includes('/games/air-hockey/'));
    await frame.waitForSelector('#tab1');
    await frame.locator('#tab1').focus();
    await page.keyboard.press('Tab');
    assert.notEqual(await frame.evaluate(() => document.activeElement.id), 'tab1', 'game menu Tab changes focus');
    await focusSurface(frame);
    await page.evaluate(() => window.postMessage('sg:focus-portal', '*'));
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'IFRAME', 'messages from outside the active game cannot steal focus');
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => document.activeElement.id === 'favBtn');
    const favorite = await page.locator('#favBtn').getAttribute('aria-pressed');
    await page.keyboard.press('Space');
    assert.notEqual(await page.locator('#favBtn').getAttribute('aria-pressed'), favorite, 'keyboard activates portal favorite');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'favBtn', 'portal button keeps keyboard focus');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'favBtn', 'portal arrows do not steal control focus');
    await page.locator('#fsBtn').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await focusSurface(frame);
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => !document.fullscreenElement && document.activeElement.id === 'favBtn');
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'favBtn', 'fullscreen change does not return focus to the iframe');
    assert.deepEqual(errors, [], 'portal navigation has no browser exceptions');
    console.log('  ✓ portal: menu navigation, favorites, and fullscreen keyboard return');
  } finally { await context.close(); }
}

export async function testTypingTab({ browser, origin }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/games/typing-test/`);
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => { document.activeElement?.blur(); __game.start({ lang: 'en', mode: 'words', amt: 10, seed: 1234 }); });
    await page.keyboard.type('abc');
    assert.equal((await page.evaluate(() => __game.state())).input, 'abc', 'typing remains functional on the test surface');
    await page.keyboard.press('Tab');
    assert.equal((await page.evaluate(() => __game.state())).input, '', 'ordinary Tab still restarts the typing test');
    assert.equal((await page.evaluate(() => __game.state())).phase, 'ready', 'restart returns to a fresh test');
    await page.locator('#bProg').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __game.state().modal === 'mProg');
    await page.locator('#mProg [data-close]').focus();
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => __game.state())).modal, null, 'Escape closes a typing modal from its focused button');
    console.log('  ✓ typing test: letters and Tab restart');
  } finally { await context.close(); }
}

export async function testGameTab({ browser, origin }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/games/air-hockey/`);
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => { document.activeElement?.blur(); });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !__game.state().demo);
    await page.locator('#pauseBtn').focus();
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => __game.state())).paused, true, 'Escape pauses with a native button focused');
    await page.locator('#btnResume').focus();
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => __game.state())).paused, false, 'Escape resumes from a focused pause-menu button');
    await page.goto(`${origin}/games/merge-2048/`);
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#btnPlay').focus();
    await page.keyboard.press('Enter');
    await page.locator('#btnPause').focus();
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => __game.state())).screen, 'pause', '2048 Escape pauses from a focused HUD button');
    await page.locator('#btnResume').focus();
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => __game.state())).screen, 'play', '2048 Escape resumes from a focused pause-menu button');
    await page.goto(`${origin}/games/fire-and-ice/`);
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => { __game.solo(true); __game.load(1); document.activeElement?.blur(); });
    // The captured Tab reaches the existing character-switch logic without
    // allowing the browser to move focus to an unrelated button.
    const fireTab = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', cancelable: true });
      window.dispatchEvent(e);
      const result = { prevented: e.defaultPrevented, held: Kit.keys.down('Tab') };
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab', key: 'Tab' }));
      return result;
    });
    assert.deepEqual(fireTab, { prevented: true, held: true }, 'Fire & Ice solo character-switch Tab stays captured');
    await page.evaluate(() => __game.bench(1));
    const positions = await page.evaluate(() => ({ fire: __game.world.fire.x, ice: __game.world.ice.x }));
    // Ice starts immediately left of Fire: moving left avoids the other
    // character's collider and tests which character receives the input.
    await page.keyboard.down('ArrowLeft');
    await page.evaluate(() => __game.bench(12));
    await page.keyboard.up('ArrowLeft');
    const moved = await page.evaluate(() => ({ fire: __game.world.fire.x, ice: __game.world.ice.x }));
    assert.ok(moved.ice < positions.ice, `after Tab, movement controls the ice character: ${JSON.stringify({ positions, moved })}`);
    assert.equal(moved.fire, positions.fire, 'switching characters leaves fire in place');
    // Exercise the supported drag-to-look fallback without depending on a
    // headless operating-system pointer-lock grant.
    await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = undefined; });
    await page.goto(`${origin}/games/splat-strike/`);
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#setBtn').click();
    await page.locator('#sSens').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => __game.save.set.sens), 0.2, 'native slider input updates sensitivity');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => __game.save.set.sens), 3, 'sensitivity slider retains its full range');
    await page.locator('#sFov').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => __game.save.set.fov), 60, 'native FOV slider updates game settings');
    await page.locator('#sBack').click();
    await page.evaluate(() => { __game.start({ skipCountdown: true }); __game.god = true; __game.botsFrozen = true; document.activeElement?.blur(); });
    await page.keyboard.down('Tab');
    await page.waitForFunction(() => !document.getElementById('board').hidden);
    await page.keyboard.up('Tab');
    await page.waitForFunction(() => document.getElementById('board').hidden);
    console.log('  ✓ Fire & Ice and Splat Strike: gameplay Tab shortcuts');
  } finally { await context.close(); }
}

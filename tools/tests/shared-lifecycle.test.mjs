import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

async function embeddedGame(t, slug) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught game errors'));
  // Execute actual game updates at fixed steps so assertions cannot race a
  // natural death, bot action, or slow CI renderer.
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true, get: () => kit,
      set(value) {
        kit = value;
        kit.loop = update => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); };
          return { running: true, stop() {} };
        };
      }
    });
  });
  await page.goto(`${server.origin}/`);
  await page.setContent(`<button id="outside">Portal</button><script>
    window.gameMessages = [];
    addEventListener('message', e => {
      if (e.source !== document.querySelector('iframe').contentWindow) return;
      gameMessages.push(e.data);
      if(e.data === 'sg:focus-portal') document.querySelector('#outside').focus();
    });
  </script><iframe src="${server.origin}/games/${slug}/index.html"></iframe>`);
  const frame = page.frames().find(f => f.parentFrame());
  await frame.waitForFunction(() => window.__game && window.stepGame);
  await page.waitForFunction(() => gameMessages.some(m => m.type === 'sg:ready'));
  return { page, frame };
}

const games = [
  { slug: 'beat-dash', start: () => __game.start(0), resume: '#b-resume',
    snapshot: () => ({ paused: __game.state.paused, x: __game.state.x, y: __game.state.y, attempts: __game.state.attempt }),
    paused: state => state.paused === true },
  { slug: 'air-hockey', start: () => document.querySelector('#btnPlay').click(), resume: '#btnResume',
    snapshot: () => { const s = __game.state(); return { paused: s.paused, pucks: s.pucks, mallets: s.mallets, score: s.score, scene: s.scene }; },
    paused: state => state.paused === true },
  { slug: 'blob-battle', start: () => document.querySelector('#btnPlay').click(), resume: '#btnResume',
    snapshot: () => { const s = __game.info(); return { state: s.state, T: s.T, player: s.player, mass: s.mass }; },
    paused: state => state.state === 'pause' },
  { slug: 'hoop-heads', start: () => __game.start({mode: 'duo'}), resume: '#pResume',
    snapshot: () => ({ state: __game.state, time: __game.match.time, ball: { x: __game.match.ball.x, y: __game.match.ball.y }, players: __game.match.players.map(p => ({x: p.x, y: p.y, score: p.score})) }),
    paused: state => state.state === 'pause' }
];

for (const game of games) {
  test(`${game.slug} freezes on focus loss and portal escape until explicit resume`, async t => {
    const { page, frame } = await embeddedGame(t, game.slug);
    await frame.evaluate(game.start);
    for (const reason of ['blur', 'hidden', 'portal-escape', 'portal-message']) {
      await frame.evaluate(() => {
        window.focus(); document.activeElement?.blur();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
        window.testPointer = Kit.pointer({ width: 1280, height: 720, toLogical: (x, y) => ({x, y}) });
        window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 40, clientY: 40 }));
      });
      if (reason === 'portal-message') {
        await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({type: 'sg:pause', reason: 'session-ended'}, '*'));
        await frame.waitForFunction(() => !Kit.keys.down('ArrowRight'));
      } else await frame.evaluate(reason => {
        if (reason === 'blur') window.dispatchEvent(new Event('blur'));
        if (reason === 'hidden') {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        if (reason === 'portal-escape') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', shiftKey: true, cancelable: true }));
      }, reason);
      const frozen = await frame.evaluate(game.snapshot);
      assert.equal(game.paused(frozen), true, `${reason} enters the game's pause state`);
      assert.deepEqual(await frame.evaluate(() => ({ key: Kit.keys.down('ArrowRight'), down: testPointer.down, pressed: testPointer.pressed })), {key: false, down: false, pressed: false});
      await frame.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        stepGame(120);
      });
      assert.deepEqual(await frame.evaluate(game.snapshot), frozen, `${reason}: focus restoration and 2 seconds do not advance play`);
      // The resume button is deliberately activated without pointer events, to
      // prove that the held pointer state cannot leak into the next round.
      await frame.evaluate(selector => document.querySelector(selector).click(), game.resume);
      assert.equal(game.paused(await frame.evaluate(game.snapshot)), false, 'only explicit Resume restarts play');
    }
  });
}

test('shared preferences follow system motion, persist overrides and expose mute state', async t => {
  const { page, frame } = await embeddedGame(t, 'beat-dash');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frame.waitForFunction(() => Kit.motion.reduced());
  assert.deepEqual(await frame.evaluate(() => { const s = Kit.shake(); s.add(10); s.update(.01); return { x: s.x, y: s.y, power: s.power }; }), {x: 0, y: 0, power: 0});
  await frame.evaluate(() => Kit.motion.setPreference('full'));
  assert.equal(await frame.evaluate(() => { const s = Kit.shake(); s.add(10); s.update(.01); return s.power > 0; }), true);
  await frame.evaluate(() => Kit.audio.setMuted(true));
  assert.equal(await frame.locator('.sg-mute').getAttribute('aria-pressed'), 'true');
  await frame.evaluate(() => document.querySelector('.sg-mute').click());
  assert.equal(await frame.locator('.sg-mute').getAttribute('aria-pressed'), 'false');
  await frame.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyM'})));
  assert.equal(await frame.locator('.sg-mute').getAttribute('aria-pressed'), 'true');
  await frame.goto(frame.url());
  assert.equal(await frame.evaluate(() => Kit.motion.reduced()), false, 'explicit full-motion override survives reload');
  assert.equal(await frame.locator('.sg-mute').getAttribute('aria-pressed'), 'true', 'saved mute state is exposed after reload');
});

test('readiness requires explicit successful initialization and rejects foreign parent commands', async t => {
  const { page, frame } = await embeddedGame(t, 'beat-dash');
  await page.evaluate(() => { gameMessages = []; document.querySelector('iframe').contentWindow.postMessage({type: 'sg:request-ready'}, '*'); });
  await page.waitForFunction(() => gameMessages.some(m => m.type === 'sg:ready'));
  await frame.evaluate(() => {
    Kit.motion.setPreference('full');
    window.dispatchEvent(new MessageEvent('message', { data: {type: 'sg:preferences', reducedMotion: true}, source: window }));
  });
  assert.equal(await frame.evaluate(() => Kit.motion.reduced()), false, 'only the actual parent can send preferences');
  await page.evaluate(() => { gameMessages = []; });
  await frame.evaluate(() => { Kit.fail(new Error('failed to initialize')); Kit.ready(); });
  await page.waitForFunction(() => gameMessages.some(m => m.type === 'sg:error'));
  assert.equal(await page.evaluate(() => gameMessages.some(m => m.type === 'sg:ready')), false, 'a failed initialization cannot report ready');
});

test('typing time freezes away from the game and requires explicit resume', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(`${server.origin}/games/typing-test/index.html`);
  await page.evaluate(() => __game.typeText(__game.words(1)[0].slice(0, 1), 0));
  assert.equal(await page.evaluate(() => __game.state().phase), 'running');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.locator('#unfocus').waitFor({state: 'visible'});
  const timer = await page.locator('#timer').textContent();
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await page.locator('#unfocus').isVisible(), true);
  assert.equal(await page.locator('#timer').textContent(), timer);
  await page.locator('#unfocus').click();
  assert.equal(await page.locator('#unfocus').isVisible(), false);
  assert.equal(await page.evaluate(() => __game.state().phase), 'running');
});

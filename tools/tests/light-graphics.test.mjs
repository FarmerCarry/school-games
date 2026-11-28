import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

// Kit.gfx in the four heavy games: unsmooth round play turns light graphics on during the
// round (fewer pixels at once), and the next start of that game, or of another heavy game
// on this PC, is light from the start (no antialiasing either). 1920 x 1080 like the lab PCs.
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

const GAMES = {
  'rail-rush': { canvas: 'gl', start: g => { g.god = true; g.restart(); } },
  'neon-slope': { canvas: 'gl', start: g => { g.god = true; g.start(); } },
  'road-hopper': { canvas: 'gl', start: g => { g.god(); g.start(); } },
  'moto-madness': { canvas: 'game', start: g => { g.start(0); } }
};

async function open(context, slug) {
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${server.origin}/games/${slug}/?gfxauto`);
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  return { page, errors };
}
const canvasOf = (page, id) => page.evaluate(id => {
  const c = document.getElementById(id), gl = id === 'gl' && (c.getContext('webgl2') || c.getContext('webgl'));
  return { width: c.width, antialias: gl ? gl.getContextAttributes().antialias : null };
}, id);

async function hardwareContext() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  // Simulate an integrated hardware GPU so SwiftShader in headless CI does not pre-trip before frame-drop tests.
  await context.addInitScript(() => {
    for (const Ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Ctor || !Ctor.prototype) continue;
      const orig = Ctor.prototype.getParameter;
      Ctor.prototype.getParameter = function (p) {
        if (p === 0x1f01 || p === 0x9246) return 'ANGLE (Intel, UHD 620)';
        return orig.call(this, p);
      };
    }
  });
  return context;
}

for (const [slug, game] of Object.entries(GAMES)) {
  test(`${slug}: slow frames switch to light graphics during play, and the next start is light`, async t => {
    const context = await hardwareContext();
    t.after(() => context.close());
    const first = await open(context, slug);
    const full = await canvasOf(first.page, game.canvas);
    await first.page.evaluate(`(${game.start})(window.__game)`);
    await first.page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F13' }));
      for (let i = 0; i < 60; i++) window.Kit.stats.frame(30);
    });
    await first.page.waitForTimeout(300);
    const light = await canvasOf(first.page, game.canvas);
    assert.ok(light.width < full.width * 0.8, `fewer pixels at once (${full.width} -> ${light.width})`);
    assert.equal(await first.page.locator('.sg-gfx-notice').isVisible(), true, 'a notice says so');
    assert.equal(await first.page.evaluate(s => localStorage.getItem('sg:' + s + ':gfx'), slug), '"light"');
    assert.deepEqual(first.errors, []);

    const next = await open(context, slug);
    const again = await canvasOf(next.page, game.canvas);
    assert.equal(again.width, light.width, 'the next start keeps light graphics');
    if (again.antialias !== null) {
      assert.equal(full.antialias, true);
      assert.equal(again.antialias, false, 'and drops antialiasing');
    }
    await next.page.locator('.sg-gfx-notice').waitFor({ state: 'detached', timeout: 100 }).catch(() => {});
    assert.equal(await next.page.locator('.sg-gfx-notice').count(), 0, 'with no notice');
    assert.deepEqual(next.errors, []);
  });
}

test('the way back: the notice\'s button restores full graphics and keeps them', async t => {
  const context = await hardwareContext();
  t.after(() => context.close());
  const { page, errors } = await open(context, 'road-hopper');
  const full = await canvasOf(page, 'gl');
  await page.evaluate(() => {
    const g = window.__game; g.god(); g.start();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F13' }));
    for (let i = 0; i < 60; i++) window.Kit.stats.frame(30);
  });
  await page.locator('.sg-gfx-notice button').click();
  assert.equal((await canvasOf(page, 'gl')).width, full.width);
  assert.equal(await page.locator('.sg-gfx-notice').isVisible(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:road-hopper:gfx')), '"full"');
  const other = await open(context, 'neon-slope');
  assert.equal((await canvasOf(other.page, 'gl')).antialias, false, 'other heavy games on this PC still start light');
  assert.deepEqual(errors, []);
  assert.deepEqual(other.errors, []);
});

test('software WebGL pre-trips light graphics immediately on start without a mid-play notice', async t => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  t.after(() => context.close());
  const { page, errors } = await open(context, 'road-hopper');
  const soft = await page.evaluate(() => window.Kit.webgl.isSoftware());
  assert.equal(soft, true, 'headless CI runs SwiftShader');
  const info = await canvasOf(page, 'gl');
  assert.equal(info.antialias, false, 'pre-tripped light mode disables antialiasing immediately');
  assert.equal(await page.locator('.sg-gfx-notice').count(), 0, 'no mid-play notice when pre-tripped');
  assert.deepEqual(errors, []);
});

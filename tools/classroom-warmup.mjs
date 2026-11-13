// Software WebGL starts cold in every browser. The first 3D page has to bring up
// the GPU process's SwiftShader device, and every 3D game compiles its own
// pipelines. While it does, that page cannot answer calls or take screenshots.
// On the Windows Edge runner Dino 3D, the first 3D game of each classroom
// browser, failed four runs in Nov 2026 (42968019025, 42980856427, 43082500652,
// 43118055225): the case took 23 to 48 s, the page stopped answering for 5 to
// 15 s and more after its hook, and three failure screenshots timed out as well.
// The first launch on that runner is the slowest for every 3D game (Road Hopper
// failed once too, after 73 s); later launches start the same games in 4 to 7 s.
//
// The classroom checks test what a downloaded folder does, not how fast a cold
// software renderer is. So each browser first opens its WebGL games in a context
// of its own and lets them draw a few frames, then closes that context. The
// checks then run as before, each on a fresh page in their own context, with
// their own storage policy. The warm-up is not a check: a page that does not get
// that far within its limit is reported, and its real check decides.
import { GAME_HOOK } from './game-scenarios.mjs';
import { withPageDeadline } from './page-wait.mjs';

export const warmupLimits = { page: 30000, frames: 3 };

// A downloaded page draws with WebGL when it loads three.js (source folder) or
// carries it inline (built single file).
export function usesWebGL(html) {
  return /three(\.min)?\.js|WebGLRenderer|getContext\(\s*['"](webgl2?|experimental-webgl)['"]/.test(html);
}

// pages: [{ slug, url }]. Returns { ms, pages: [{ slug, ok, ms, hookMs?, error? }] }.
export async function warmUpWebGL(browser, contextOptions, pages, limits = warmupLimits) {
  const started = Date.now();
  const result = { ms: 0, pages: [] };
  const context = await browser.newContext(contextOptions);
  try {
    for (const { slug, url } of pages) {
      const item = { slug, ok: false };
      result.pages.push(item);
      const t0 = Date.now();
      const left = () => Math.max(1, limits.page - (Date.now() - t0));
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: left() });
        await page.waitForFunction(GAME_HOOK, null, { timeout: left(), polling: 40 });
        item.hookMs = Date.now() - t0;
        await withPageDeadline(page, count => new Promise(resolve => {
          let n = 0;
          const tick = () => { if (++n >= count) resolve(); else requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        }), left(), `${slug}: ${limits.frames} warm-up frames`, limits.frames);
        item.ok = true;
      } catch (error) {
        item.error = String(error.message || error).split('\n')[0];
      } finally {
        item.ms = Date.now() - t0;
        // Closing also ends a file navigation Edge never finished.
        await page.close().catch(() => {});
      }
    }
  } finally {
    await context.close().catch(() => {});
    result.ms = Date.now() - started;
  }
  return result;
}

const seconds = ms => (ms / 1000).toFixed(1) + ' s';
export function describeWarmup(label, warmup) {
  const parts = warmup.pages.map(p => p.ok
    ? `${p.slug} ${seconds(p.ms)} (hook ${seconds(p.hookMs)})`
    : `${p.slug} not ready after ${seconds(p.ms)}: ${p.error}`);
  return `WARMUP ${label} ${seconds(warmup.ms)}: ${parts.join(', ') || 'no WebGL games'}`;
}

// Software WebGL starts cold in every browser. The first 3D page has to bring up
// the GPU process's SwiftShader device, and every 3D game compiles its own
// pipelines, most of them only once play starts and its world appears. While it
// does, that page cannot answer calls or take screenshots.
// On the Windows Edge runner Dino 3D, the first 3D game of each classroom
// browser, failed four runs in Nov 2026 (42968019025, 42980856427, 43082500652,
// 43118055225): the case took 23 to 48 s, the page stopped answering for 5 to
// 15 s and more after its hook, and three failure screenshots timed out as well.
// The first launch on that runner is the slowest for every 3D game (Road Hopper
// failed once too, after 73 s); later launches start the same games in 4 to 7 s.
// A warm-up that only waited for the title (PR #90, run 43479591693) moved the
// first launch's stall from before Dino 3D's hook (5.5 s) to after it: Play
// to gameplay then took 14.4 s.
//
// The classroom checks test what a downloaded folder does, not how fast a cold
// software renderer is. So each browser first plays its WebGL games once in a
// context of its own, through the same start and first input as their checks,
// and then closes that context. The checks then run as before, each on a fresh
// page in their own context, with their own storage policy. The warm-up is not
// a check: a page that does not get through within its limit is reported, and
// its real check decides.
import { runScenario } from './game-scenarios.mjs';

export const warmupLimits = { page: 45000 };

// A downloaded page draws with WebGL when it loads three.js (source folder) or
// carries it inline (built single file).
export function usesWebGL(html) {
  return /three(\.min)?\.js|WebGLRenderer|getContext\(\s*['"](webgl2?|experimental-webgl)['"]/.test(html);
}

// pages: [{ slug, url }]. Returns { ms, pages: [{ slug, ok, ms, timings, error? }] },
// timings in ms from opening the page to 'dom', 'hook', 'active' and 'input'.
export async function warmUpWebGL(browser, contextOptions, pages, limits = warmupLimits) {
  const started = Date.now();
  const result = { ms: 0, pages: [] };
  const context = await browser.newContext(contextOptions);
  try {
    for (const { slug, url } of pages) {
      const item = { slug, ok: false, timings: {} };
      result.pages.push(item);
      const t0 = Date.now();
      const mark = stage => { item.timings[stage] = Date.now() - t0; };
      const page = await context.newPage();
      page.setDefaultTimeout(limits.page);
      const work = (async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: limits.page });
        mark('dom');
        await runScenario(page, slug, { mode: 'performance', onStage: mark });
      })();
      work.catch(() => {});
      let timer;
      try {
        await Promise.race([work, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`not through its first input within ${limits.page / 1000} s`)), limits.page);
        })]);
        item.ok = true;
      } catch (error) {
        item.error = String(error.message || error).split('\n')[0];
      } finally {
        clearTimeout(timer);
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

const seconds = ms => (ms / 1000).toFixed(1);
export function describeWarmup(label, warmup) {
  const parts = warmup.pages.map(p => {
    const stages = Object.entries(p.timings || {}).filter(([stage]) => stage !== 'dom')
      .map(([stage, ms]) => `${stage} ${seconds(ms)}`).join(', ');
    return p.ok ? `${p.slug} ${seconds(p.ms)} s (${stages})`
      : `${p.slug} failed after ${seconds(p.ms)} s${stages ? ` (${stages})` : ''}: ${p.error}`;
  });
  return `WARMUP ${label} ${seconds(warmup.ms)} s: ${parts.join('; ') || 'no WebGL games'}`;
}

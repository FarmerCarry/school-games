import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribution, parseArgs, installObservers, summarize } from '../perf.mjs';
import { compareReports } from '../perf-compare.mjs';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

test('measurement summaries retain unrounded median/spread and exclude absent values', () => {
  assert.deepEqual(distribution([4, 1, 9, 2, 3, null, undefined, NaN]), { n: 5, median: 3, min: 1, max: 9, p10: 1.4, p90: 7, mad: 1 });
  assert.equal(distribution([null, undefined]), null);
  assert.equal(distribution([1, 2, 3, 4]).median, 2.5);
  assert.equal(distribution([1, 2, 3, 4]).mad, 1);
});

test('invalid benchmark arguments fail before launching a browser', () => {
  for (const args of [['--samples', '0'], ['--samples', '2.5'], ['--seconds', '0'], ['--seconds', 'NaN'], ['--latency', '-1'], ['--json'], ['--bogus']]) {
    assert.throws(() => parseArgs(args));
  }
  const args = parseArgs(['--samples', '5', '--seconds', '8', '--latency', '20', '--native-gpu', 'portal']);
  assert.equal(args.samples, 5); assert.equal(args.seconds, 8); assert.equal(args.graphics, 'native');
});

function report(values = [100, 102, 104, 106, 108]) {
  const samples = values.map((value, index) => {
    const navigation = { loadMs: value, dclMs: value - 10, firstUsefulMs: value + 10, readyForStartMs: value + 10,
      startRequestedMs: value + 20, playableMs: value + 1000, startToPlayableMs: 980,
      inputResponsiveMs: value + 1100, startToInputMs: 1080, scriptToInputMs: value,
      httpRequests: 6, encodedBytes: 1000, dpr: 1, controlledByServiceWorker: false, fromServiceWorker: 0 };
    return { target: 'hoop-heads', repetition: index + 1, errors: [], cold: navigation, warm: { ...navigation },
      activity: { seconds: 8, frameCount: 200, medianFrameMs: 16, p95FrameMs: value / 5, maxFrameMs: value / 2,
        longTasks: 0, scriptMs: value, heapMB: 2, heapGrowMB: 0, peakHeapMB: 3, savesPerMin: 0, restarts: 0 } };
  });
  return { format: 2, config: { samples: values.length, targets: ['hoop-heads'], seconds: 8, graphics: 'software', deviceScaleFactor: 1, serviceWorkers: 'block', scenarioVersion: 'readiness-v1', toolSha256: 'same-tool' },
    environment: { browserVersion: 'test-edge', renderer: 'software', platform: 'win32' },
    build: { commit: 'commit', root: 'root', assets: [{ file: 'index.html', bytes: 1000, localGzipBytes: 500, localBrotliBytes: 400 }] },
    samples, summary: summarize(samples, ['hoop-heads']) };
}

test('comparison refuses mismatched profiles, missing samples, failed input and SW/DPR contamination', () => {
  const baseline = report();
  assert.throws(() => compareReports(baseline, report([100, 101, 102, 103])), /at least five/);
  for (const mutate of [
    candidate => { candidate.environment.browserVersion = 'different-edge'; },
    candidate => { candidate.config.seconds = 60; },
    candidate => { candidate.config.toolSha256 = 'different-tool'; },
    candidate => { candidate.config.browserToolSha256 = 'different-launcher'; },
    candidate => { candidate.config.inputToolSha256 = 'different-input'; },
    candidate => { candidate.config.scenarioVersion = 'different-scenario'; }
  ]) {
    const candidate = report(); mutate(candidate);
    assert.throws(() => compareReports(baseline, candidate), /different.*profiles/);
  }
  const failed = report(); failed.samples[0].errors = ['Movement did not react'];
  assert.throws(() => compareReports(baseline, failed), /failed samples/);
  const sw = report(); sw.samples[0].warm.controlledByServiceWorker = true;
  assert.throws(() => compareReports(baseline, sw), /service-worker/);
  const dpr = report(); dpr.samples[0].warm.dpr = 2;
  assert.throws(() => compareReports(baseline, dpr), /DPR/);
});

test('comparison requires the same repetition IDs before claiming paired timing evidence', () => {
  const baseline = report();
  for (const offset of [1, 5]) {
    const candidate = report([50, 52, 54, 56, 58]);
    for (const sample of candidate.samples) sample.repetition += offset;
    assert.throws(() => compareReports(baseline, candidate), /same repetition IDs/,
      'partially overlapping or disjoint repetitions cannot establish paired evidence');
  }
  const reordered = report([50, 52, 54, 56, 58]);
  reordered.samples.reverse();
  const comparison = compareReports(baseline, reordered);
  assert.ok(comparison.timings.every(metric => metric.pairs === 5));
  assert.equal(comparison.hasTimingGain, true, 'matching repetitions need not have the same array order');
});

test('load improvement cannot conceal a playable regression and noisy medians are not claimed', () => {
  const baseline = report(), candidate = report([50, 52, 54, 56, 58]);
  for (const sample of candidate.samples) {
    sample.cold.playableMs += 300; sample.cold.startToPlayableMs += 350;
    sample.warm.playableMs += 300; sample.warm.startToPlayableMs += 350;
  }
  // Deliberately stale summary: comparison must use the underlying samples.
  candidate.summary = baseline.summary;
  const comparison = compareReports(baseline, candidate);
  assert.match(comparison.timings.find(metric => metric.section === 'cold' && metric.metric === 'loadMs').outcome, /^improvement/);
  assert.match(comparison.timings.find(metric => metric.section === 'cold' && metric.metric === 'playableMs').outcome, /^regression/);
  assert.equal(comparison.hasTimingRegression, true);
  const noisy = compareReports(baseline, report([100, 150, 20, 99, 98]));
  assert.match(noisy.timings.find(metric => metric.section === 'cold' && metric.metric === 'loadMs').outcome, /^within observed/);
  assert.equal(compareReports(baseline, baseline).hasTimingGain, false);
  const controlled = compareReports(baseline, candidate, compareReports(baseline, candidate));
  assert.equal(controlled.hasTimingGain, false);
});

test('delayed initialization/countdown/input remain visible after load; idle gaps are excluded from active frames', async t => {
  const fixture = `<!doctype html><html><head><title>Delayed readiness fixture</title><link rel="icon" href="data:,"></head><body>
    <section id="scrTitle"><button data-act="cpu" disabled>Start</button></section><canvas></canvas>
    <script>
      window.__game = { state: 'title', match: { phase: 'intro' } };
      window.sgInput = { seen: false };
      const button = document.querySelector('button');
      window.addEventListener('load', () => {
        window.loadedAt = performance.now();
      });
      window.initialize = () => {
        window.initRequestedAt = performance.now();
        setTimeout(() => { button.disabled = false; window.initAt = performance.now(); }, 250);
      };
      button.onclick = () => {
        document.getElementById('scrTitle').hidden = true;
        __game.state = 'play';
        setTimeout(() => { __game.match.phase = 'play'; window.activeAt = performance.now(); }, 250);
      };
      window.addEventListener('keydown', () => { if (__game.match.phase === 'play') sgInput.seen = true; });
    </script></body></html>`;
  const server = await startTestServer(process.cwd(), { pages: { '/fixture': fixture } });
  t.after(() => server.close());
  const browser = await launchChromium({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.addInitScript(installObservers, { target: 'hoop-heads', active: "window.__game?.state === 'play'", ready: "window.__game?.match?.phase === 'play'" });
  const page = await context.newPage();
  await page.goto(server.origin + '/fixture');
  await page.waitForFunction(() => window.__perf.firstUsefulMs !== null);
  assert.equal(await page.evaluate(() => __perf.readyForStartMs), null, 'a visible disabled Start control is not ready');
  await page.evaluate(() => initialize());
  await page.waitForFunction(() => window.__perf.readyForStartMs !== null);
  const early = await page.evaluate(() => ({ ...__perf, load: performance.getEntriesByType('navigation')[0].loadEventEnd, initAt, initRequestedAt }));
  assert.ok(early.firstUsefulMs < early.readyForStartMs, 'Visible screen and ready control must remain separate');
  assert.ok(early.readyForStartMs >= early.initAt && early.readyForStartMs > early.load + 200, 'Deferred initialization cannot disappear after load');
  assert.ok(early.readyForStartMs - early.initRequestedAt >= 250, 'the actual initialization delay must remain in readiness');
  assert.equal(early.playableMs, null, 'A visible enabled title is not playable');
  await page.evaluate(() => { __perf.startRequestedMs = performance.now(); });
  await page.locator('button').click();
  await page.waitForFunction(() => __perf.playableMs !== null);
  const active = await page.evaluate(() => ({ ...__perf, activeAt }));
  assert.ok(active.playableMs >= active.activeAt);
  assert.ok(active.playableMs - active.startRequestedMs >= 250, 'Natural countdown must be counted');
  assert.equal(active.inputResponsiveMs, null, 'Active rendering alone is not proof that input works');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => __perf.inputResponsiveMs !== null);
  await page.evaluate(() => { __perf.measuring = true; __perf.activityStart = performance.now(); });
  await page.waitForFunction(() => __perf.frames.length >= 5);
  await page.evaluate(() => { __game.state = 'pause'; });
  await page.waitForTimeout(80);
  const pausedCount = await page.evaluate(() => __perf.frames.length);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => __perf.frames.length), pausedCount, 'Paused frames must be excluded');
  await page.evaluate(() => { __perf.frames = []; __game.state = 'play'; });
  await page.waitForFunction(() => __perf.frames.length >= 5);
  assert.ok(await page.evaluate(() => Math.max(...__perf.frames) < 300), 'Resume must not include the idle gap');
});

async function observeFixture(t, target, html, active = 'true') {
  const server = await startTestServer(process.cwd(), { pages: { '/fixture': html } });
  t.after(() => server.close());
  const browser = await launchChromium({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.addInitScript(installObservers, { target, active, ready: 'true' });
  const page = await context.newPage();
  await page.goto(server.origin + '/fixture');
  return page;
}

test('portal useful screen waits for decoded fully opaque artwork, not gradient placeholders', async t => {
  const picture = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>');
  const page = await observeFixture(t, 'portal', `<!doctype html><style>
    img { width:100px;height:100px;opacity:0;transition:opacity .35s linear }
    .offscreen { position:absolute;top:2000px }
    </style><input id="q"><div class="catalog-grid"><a class="tile"><img src="${picture}"></a>
    <a class="tile offscreen"><img src="data:,"></a></div><script>
    const img=document.querySelector('img'), decode=img.decode.bind(img);
    img.decode=()=>decode().then(()=>new Promise(resolve=>setTimeout(()=>{ window.decodedAt=performance.now();resolve(); },150)));
    img.addEventListener('transitionend',()=>{window.opaqueAt=performance.now()});
    addEventListener('load',()=>{window.loadAt=performance.now()});
    window.startFade=()=>setTimeout(()=>{img.style.opacity='1'},100);
    </script>`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  assert.equal(await page.evaluate(() => __perf.firstUsefulMs), null);
  await page.evaluate(() => startFade());
  await page.waitForFunction(() => __perf.firstUsefulMs !== null);
  const result = await page.evaluate(() => ({ useful: __perf.firstUsefulMs, decodedAt, opaqueAt, loadAt, opacity: getComputedStyle(document.querySelector('img')).opacity }));
  assert.equal(result.opacity, '1');
  assert.ok(result.useful >= result.decodedAt && result.useful >= result.opaqueAt);
  assert.ok(result.useful - result.loadAt > 450, 'deferred decode and fade must remain in visible readiness');
});

test('typing readiness uses populated visible words and enabled language control, not hidden chart', async t => {
  const page = await observeFixture(t, 'typing-test', `<!doctype html>
    <section id="resView" hidden><canvas id="chart"></canvas></section>
    <section id="testView"><button data-lang="en" disabled>English</button><div id="wordsBox"><div id="words"></div></div></section>
    <script>window.__game={};</script>`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  assert.equal(await page.evaluate(() => __perf.firstUsefulMs), null);
  assert.equal(await page.evaluate(() => __perf.readyForStartMs), null, 'empty words and a disabled control are not ready');
  await page.evaluate(() => {
    document.getElementById('words').innerHTML = '<span>ready</span>';
    window.wordsAt = performance.now();
  });
  // Observe each readiness gate separately: slow rAF delivery may skip the
  // entire gap between two wall-clock timers without any observer regression.
  await page.waitForFunction(() => __perf.firstUsefulMs !== null);
  assert.equal(await page.evaluate(() => __perf.readyForStartMs), null, 'visible words alone cannot make the disabled control ready');
  await page.evaluate(() => {
    document.querySelector('button').disabled = false;
    window.enabledAt = performance.now();
  });
  await page.waitForFunction(() => __perf.readyForStartMs !== null);
  const result = await page.evaluate(() => ({ ...__perf, wordsAt, enabledAt }));
  assert.ok(result.firstUsefulMs >= result.wordsAt);
  assert.ok(result.readyForStartMs >= result.enabledAt);
  assert.ok(result.firstUsefulMs < result.readyForStartMs);
});

test('board readiness waits for its chooser and proves Start plus a real move', async t => {
  const page = await observeFixture(t, 'connect-four', `<!doctype html>
    <section hidden><canvas></canvas></section><main id="boardApp" style="min-height:100px"></main>
    <script>window.showChooser=()=>{
      setTimeout(()=>{
        boardApp.innerHTML='<button id="localButton" disabled>Local</button><button id="pcButton">Computer</button><button id="move">Move</button>';
        window.chooserAt=performance.now();
        localButton.onclick=()=>{boardApp.dataset.mode='local'};
        move.onclick=()=>{window.sgInput={seen:true}};
      },150);
    };
    window.enableChooser=()=>setTimeout(()=>{localButton.disabled=false;window.enabledAt=performance.now()},150);
    </script>`, "document.getElementById('boardApp').dataset.mode === 'local'");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  assert.equal(await page.evaluate(() => __perf.firstUsefulMs), null);
  assert.equal(await page.evaluate(() => __perf.readyForStartMs), null, 'an absent chooser is not ready');
  await page.evaluate(() => showChooser());
  await page.waitForFunction(() => __perf.firstUsefulMs !== null);
  assert.equal(await page.evaluate(() => __perf.readyForStartMs), null, 'a visible disabled chooser is not ready');
  await page.evaluate(() => enableChooser());
  await page.waitForFunction(() => __perf.readyForStartMs !== null);
  const ready = await page.evaluate(() => ({ ...__perf, chooserAt, enabledAt }));
  assert.ok(ready.firstUsefulMs >= ready.chooserAt && ready.readyForStartMs >= ready.enabledAt);
  assert.equal(ready.playableMs, null);
  await page.evaluate(() => { __perf.startRequestedMs = performance.now(); });
  await page.locator('#localButton').click();
  await page.waitForFunction(() => __perf.playableMs !== null);
  assert.equal(await page.evaluate(() => __perf.inputResponsiveMs), null);
  await page.locator('#move').click();
  await page.waitForFunction(() => __perf.inputResponsiveMs !== null);
});

test('generic canvas readiness skips a hidden results canvas before a visible surface', async t => {
  const page = await observeFixture(t, 'rail-rush', `<!doctype html><section hidden><canvas></canvas></section>
    <canvas width="200" height="100"></canvas><script>window.__game={}</script>`);
  await page.waitForFunction(() => __perf.readyForStartMs !== null);
  assert.ok(await page.evaluate(() => __perf.firstUsefulMs > 0));
});

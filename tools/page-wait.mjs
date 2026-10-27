// page.evaluate has no Playwright timeout. A font promise, img.decode(), or
// requestAnimationFrame that never settles used to sit until the file limit
// (the thumbnail pixel test on 26 October 2026). These helpers fail that wait
// on a clock, and the error names the condition.
//
// Kit.loop turns animation-frame time into at most eight 60 Hz steps and then
// drops the rest. A wall-clock sleep can therefore finish before a delay the
// game scheduled, or outlast a handler that already ran. Game-clock waits
// follow that same cap so the test observes the clock the game actually uses.

export async function withPageDeadline(scope, fn, ms, label, arg) {
  let timer;
  const work = arg === undefined ? scope.evaluate(fn) : scope.evaluate(fn, arg);
  work.catch(() => {});
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); })
    ]);
  } finally { clearTimeout(timer); }
}

async function failWithWatch(scope, label, error) {
  const watch = await scope.evaluate(() => window.sgTestWatch || null).catch(() => null);
  const game = watch && typeof watch.time === 'number' ? `, game ${watch.time.toFixed(3)}s` : '';
  const detail = watch ? ` (frames ${watch.frames}, span ${Math.round(watch.span)}ms${game})` : '';
  throw new Error(`${label}${detail}`, { cause: error });
}

export async function fontsReady(scope, label = 'document.fonts.ready', ms = 8000) {
  await scope.evaluate(async ({ label, ms }) => {
    if (!document.fonts || !document.fonts.ready) throw new Error(label + ': document.fonts.ready is missing');
    let timer;
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms (fonts.status=' + document.fonts.status + ')')), ms);
        })
      ]);
    } finally { clearTimeout(timer); }
  }, { label, ms });
}

export async function animationFrames(scope, count, label, ms = 8000) {
  await scope.evaluate(async ({ count, label, ms }) => {
    let timer;
    try {
      await Promise.race([
        new Promise(resolve => {
          let n = 0;
          const tick = () => { if (++n >= count) resolve(); else requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms (' + count + ' animation frames did not run)')), ms);
        })
      ]);
    } finally { clearTimeout(timer); }
  }, { count, label, ms });
}

export async function waitForFrameTime(scope, ms, label, timeout = ms + 8000) {
  await scope.evaluate(ms => {
    const watch = window.sgTestWatch = { span: 0, frames: 0, time: 0, done: false };
    let start = 0;
    const tick = t => {
      if (window.sgTestWatch !== watch) return;
      if (!start) start = t;
      watch.frames++;
      watch.span = t - start;
      if (watch.span >= ms) watch.done = true;
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  try {
    await scope.waitForFunction(() => window.sgTestWatch && window.sgTestWatch.done, null, { timeout, polling: 40 });
  } catch (error) { await failWithWatch(scope, `${label}: animation frames did not cover ${ms}ms within ${timeout}ms`, error); }
}

// Mirrors shared/kit.js Kit.loop: leftover time beyond eight steps is dropped.
export async function waitForGameClock(scope, seconds, label, timeout = 15000) {
  await scope.evaluate(seconds => {
    const step = 1 / 60;
    const watch = window.sgTestWatch = { span: 0, frames: 0, time: 0, acc: 0, done: false, start: 0 };
    let last = 0;
    const tick = t => {
      if (window.sgTestWatch !== watch) return;
      if (!watch.start) watch.start = t;
      if (last) {
        let acc = watch.acc + Math.min(0.25, (t - last) / 1000);
        let n = 0;
        while (acc >= step && n < 8) { acc -= step; n++; }
        if (n === 8) acc = 0;
        watch.acc = acc;
        watch.time += n * step;
      }
      last = t;
      watch.frames++;
      watch.span = t - watch.start;
      if (watch.time >= seconds) watch.done = true;
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, seconds);
  try {
    await scope.waitForFunction(() => window.sgTestWatch && window.sgTestWatch.done, null, { timeout, polling: 40 });
  } catch (error) { await failWithWatch(scope, `${label}: game clock did not reach ${seconds}s within ${timeout}ms`, error); }
}

export async function waitForElapsed(scope, ms, label, timeout = ms + 8000) {
  const start = await scope.evaluate(() => performance.now());
  try {
    // ms has to travel with the argument. The predicate runs in the page and
    // cannot see this function's local variables.
    await scope.waitForFunction(({ start, ms }) => performance.now() - start >= ms, { start, ms }, { timeout, polling: 40 });
  } catch (error) {
    throw new Error(`${label}: page clock did not advance ${ms}ms within ${timeout}ms`, { cause: error });
  }
}

export async function waitForCondition(scope, predicate, arg, label, timeout = 8000) {
  try {
    await scope.waitForFunction(predicate, arg, { timeout, polling: 40 });
  } catch (error) {
    throw new Error(`${label} (waited ${timeout}ms)`, { cause: error });
  }
}

/* Offline readiness belongs to verified cached bytes, not navigator.onLine.
 *
 * Updates: when the worker of a newer, complete and verified version controls this
 * tab, the tab reloads into it by itself, but only while nobody is using it. js/site.js
 * SGUpdateQuiet() is -1 unless the portal is on its home screen with no game open, no
 * classroom timer or its hand-over, no player chosen (a guest: a reload would split a
 * child's statistics session) and no half-made player, and otherwise how long it
 * has been without a key press, click, wheel or pointer move (the 20-minute idle
 * hand-over that closes a game is not use). plan() looks when the page comes back into
 * view, when the screen changes and on a timer; after QUIET without use it verifies the
 * new version once more and reloads, once per version and tab. The button stays for
 * anyone who wants the update right away. A tab left open also asks for a newer worker
 * when it comes back into view, at most once an hour (CHECK_EVERY), and on reconnecting,
 * so an update the line cut off resumes (Retry shows only while no complete version is).
 */
(function () {
  'use strict';
  var status = document.getElementById('offlineStatus');
  var retry = document.getElementById('offlineRetry');
  if (!status || !retry) return;
  var update = document.getElementById('offlineUpdate'), refresh = document.getElementById('offlineRefresh');
  var pageVersion = window.SG_OFFLINE_VERSION, availableVersion = null, refreshing = false;
  var registration = null, starting = false, checking = false, checkingRepair = false, queued = false, queuedRepair = false, sequence = 0, installingTimer = 0, observedWorker = null, shown = '';
  var QUIET = 75000, CHECK_EVERY = 3600000, ADOPTED = 'sg:site:adopted', adoptTimer = 0, reloading = false, checkedAt = performance.now(), attempted = '';
  function safeToRefresh() { return typeof window.SGUpdateSafe === 'function' && window.SGUpdateSafe(); }
  // How long the home screen has been quiet, or -1 while a reload could lose something.
  function quietFor() {
    try { var ms = typeof window.SGUpdateQuiet === 'function' ? Number(window.SGUpdateQuiet()) : -1; return ms >= 0 ? ms : -1; }
    catch (e) { return -1; }
  }
  function quiet() { return !document.hidden && quietFor() >= QUIET && safeToRefresh(); }
  // One automatic reload per version and tab: if the reloaded page is still not that
  // version, the button stays instead of a reload every QUIET. No storage, no reload;
  // the attempt is also kept in memory, so a sessionStorage that reads but cannot be
  // written (full) stops this page from verifying again and again, too.
  function tried(version) {
    if (version === attempted) return true;
    try { return window.sessionStorage.getItem(ADOPTED) === version; } catch (e) { return true; }
  }
  function mark(version) {
    attempted = version;
    try { window.sessionStorage.setItem(ADOPTED, version); return window.sessionStorage.getItem(ADOPTED) === version; } catch (e) { return false; }
  }
  // Reload by itself now if it is quiet, else look again when the quiet period could
  // be over (input restarts it). A hidden tab waits until it is visible again.
  function plan() {
    clearTimeout(adoptTimer);
    adoptTimer = 0;
    if (!availableVersion || checking || refreshing || reloading || document.hidden || tried(availableVersion)) return;
    if (quiet()) { adopt(true); return; }
    var ms = quietFor();
    adoptTimer = setTimeout(plan, ms >= 0 ? Math.max(1000, QUIET - ms) : 30000);
  }
  // A tab left open learns of a new publish only when a page of the site opens, and an
  // update cut off by the line is tried again only when asked: on reconnecting (resume)
  // and when the tab comes back into view at most hourly (freshen). The files it
  // verified before are kept (tools/build.mjs install), so it continues where it stopped.
  function resume() {
    var owner = registration;
    if (!owner || !owner.active || owner.installing) return;
    checkedAt = performance.now();
    try { owner.update().catch(function () {}); } catch (e) { /* the next visit asks again */ }
  }
  function freshen() { if (performance.now() - checkedAt >= CHECK_EVERY) resume(); }
  function showUpdate() {
    if (!update || !refresh) return;
    update.hidden = !availableVersion || !safeToRefresh();
    refresh.disabled = checking || refreshing;
  }
  function complete(result) { return result.ready && result.count === result.total && result.total > 0; }
  function remember(result) {
    // An uncontrolled page (first visit, or Ctrl+F5 bypassing the worker) came from
    // the network, so a different cached version is older, never an update.
    var controlled = !!navigator.serviceWorker.controller;
    availableVersion = controlled && complete(result) && typeof pageVersion === 'string' && typeof result.version === 'string' &&
      result.version && result.version !== pageVersion ? result.version : null;
  }
  function paint(state, text, canRetry) {
    shown = state;
    status.hidden = false;
    status.setAttribute('data-state', state);
    // Avoid repeating live announcements when focus returns to the page.
    if (status.textContent !== text) status.textContent = text;
    retry.hidden = !canRetry;
    retry.disabled = checking;
    showUpdate();
  }
  if (location.protocol === 'file:') {
    paint('local', 'تعمل هذه النسخة من المجلد دون إنترنت', false);
    return;
  }
  // Source and emergency-switch deployments must never install an offline worker.
  if (!window.SG_OFFLINE_BUILD) return;
  if (!('serviceWorker' in navigator) || typeof MessageChannel === 'undefined') {
    paint('unavailable', 'الحفظ دون إنترنت غير متاح في هذا المتصفح', false);
    return;
  }
  function ask(worker, repair) {
    return new Promise(function (resolve, reject) {
      var channel = new MessageChannel(), id = ++sequence;
      var timer = setTimeout(function () { finish(new Error('timeout')); }, 15000);
      function finish(error, value) {
        clearTimeout(timer);
        channel.port1.close();
        if (error) reject(error); else resolve(value);
      }
      channel.port1.onmessage = function (event) {
        var data = event.data;
        if (!data || data.type !== 'sg:offline-status' || data.id !== id) return;
        finish(null, data);
      };
      // Routine checks only confirm that every verified file is still cached, so a
      // slow disk is not re-read on each visit; Retry re-hashes every body.
      try { worker.postMessage({ type: 'sg:offline-status', id: id, repair: !!repair, quick: !repair }, [channel.port2]); }
      catch (e) { finish(e); }
    });
  }
  function hasWorker(owner) {
    return owner && [owner.active, owner.installing, owner.waiting].some(function (worker) {
      return worker && worker.state !== 'redundant';
    });
  }
  async function inspect(repair) {
    if (checking) {
      // Focus and visibility commonly arrive together. The current request
      // covers both; only an upgrade to repair needs another scan. Worker
      // replacement is detected again when the current reply arrives below.
      if (repair && !checkingRepair) queued = queuedRepair = true;
      return;
    }
    if (!registration) return start();
    var owner = registration, worker = owner.active;
    if (!worker) {
      availableVersion = null;
      if (!hasWorker(owner)) {
        // Nothing is installing after a failed first install, so keep its failure
        // and Retry up; Retry and reconnecting register again.
        if (repair) return start();
        if (shown !== 'unavailable') paint('unavailable', 'تعذّر تجهيز الألعاب دون إنترنت — أعد المحاولة', true);
        return;
      }
      paint('preparing', 'جارٍ تجهيز الألعاب للعمل دون إنترنت…', true);
      return;
    }
    checking = true;
    checkingRepair = !!repair;
    paint('checking', repair ? 'جارٍ إصلاح النسخة المحفوظة…' : 'جارٍ التحقق من الألعاب المحفوظة…', false);
    try {
      var result = await ask(worker, repair);
      if (owner !== registration || worker !== owner.active) { queued = true; return; }
      remember(result);
      if (complete(result)) {
        paint('ready', registration.installing ? 'جاهز دون إنترنت — جارٍ تنزيل تحديث' : 'جاهز دون إنترنت', false);
      } else {
        paint('unavailable', 'النسخة دون إنترنت غير مكتملة — اتصل بالإنترنت ثم أعد المحاولة', true);
      }
    } catch (e) {
      if (owner !== registration || worker !== owner.active) queued = true;
      else { availableVersion = null; paint('unavailable', 'تعذّر التأكد من النسخة دون إنترنت — أعد المحاولة', true); }
    } finally {
      checking = false;
      checkingRepair = false;
      retry.disabled = false;
      showUpdate();
      if (queued) { var repairNext = queuedRepair; queued = queuedRepair = false; inspect(repairNext); }
      plan();
    }
  }
  function observe(owner, worker) {
    if (owner !== registration) return;
    if (!worker) return;
    observedWorker = worker;
    clearTimeout(installingTimer);
    installingTimer = setTimeout(function () {
      if (owner !== registration || worker !== observedWorker) return;
      if (!owner.active) paint('unavailable', 'لم يكتمل تنزيل الألعاب بعد — أعد المحاولة عند الاتصال', true);
    }, 45000);
    worker.addEventListener('statechange', function () {
      if (owner !== registration || worker !== observedWorker) return;
      if (worker.state === 'activated') { clearTimeout(installingTimer); inspect(false); }
      else if (worker.state === 'redundant') {
        clearTimeout(installingTimer);
        if (owner.active) inspect(false);
        else paint('unavailable', 'تعذّر تجهيز الألعاب دون إنترنت — أعد المحاولة', true);
      }
    });
  }
  async function start() {
    if (starting) return;
    if (hasWorker(registration)) return inspect(false);
    // A failed first install can remove the browser's registration while this
    // page still holds its now-empty object. Register again instead of updating it.
    registration = null;
    availableVersion = null;
    observedWorker = null;
    clearTimeout(installingTimer);
    starting = true;
    paint('preparing', 'جارٍ تجهيز الألعاب للعمل دون إنترنت…', false);
    try {
      var owner = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      registration = owner;
      owner.addEventListener('updatefound', function () { observe(owner, owner.installing); });
      observe(owner, owner.installing);
      if (owner.active) inspect(false);
    } catch (e) { paint('unavailable', 'تعذّر تجهيز الألعاب دون إنترنت — أعد المحاولة', true); }
    finally { starting = false; }
  }
  retry.addEventListener('click', async function () {
    if (starting) return;
    var owner = registration;
    if (!hasWorker(owner)) return start();
    // Keep a working old version usable while a newer complete version installs.
    try { await owner.update(); } catch (e) { /* Inspect the surviving worker, or register again if installation failed. */ }
    if (owner !== registration) return;
    if (!hasWorker(owner)) return start();
    inspect(true);
  });
  // Reload only this tab into the verified newer version: on the button (auto false),
  // or by itself on a quiet home screen (plan).
  async function adopt(auto) {
    if (checking || refreshing || !availableVersion || !safeToRefresh()) return;
    var owner = registration, worker = owner && owner.active, expected = availableVersion;
    if (!worker) return;
    refreshing = true;
    clearTimeout(adoptTimer);
    showUpdate();
    try {
      var result = await ask(worker, false);
      if (owner !== registration || worker !== owner.active) { inspect(false); return; }
      remember(result);
      if (!complete(result)) paint('unavailable', 'النسخة دون إنترنت غير مكتملة — اتصل بالإنترنت ثم أعد المحاولة', true);
      // Verification can yield while a game opens or a child starts using the page.
      // Never discard that; check everything again after the wait.
      if (availableVersion === expected && safeToRefresh() && (!auto || (quiet() && mark(expected)))) {
        reloading = true;
        location.reload();
      }
    } catch (e) {
      if (owner !== registration || worker !== owner.active) inspect(false);
      else { availableVersion = null; paint('unavailable', 'تعذّر التأكد من النسخة دون إنترنت — أعد المحاولة', true); }
    } finally { refreshing = false; showUpdate(); plan(); }
  }
  if (refresh) refresh.addEventListener('click', function () { adopt(false); });
  window.addEventListener('sg:sessionchange', function () { showUpdate(); plan(); });
  navigator.serviceWorker.addEventListener('controllerchange', function () { inspect(false); });
  // Reconnecting repairs an incomplete copy (a ready one only needs the quick check) and
  // asks for a newer worker, which resumes an update the line cut off.
  window.addEventListener('online', function () { resume(); inspect(shown !== 'ready'); });
  window.addEventListener('focus', function () { if (!document.hidden) { freshen(); inspect(false); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { freshen(); inspect(false); } });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}());

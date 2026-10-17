/* Offline readiness belongs to verified cached bytes, not navigator.onLine. */
(function () {
  'use strict';
  var status = document.getElementById('offlineStatus');
  var retry = document.getElementById('offlineRetry');
  if (!status || !retry) return;
  var update = document.getElementById('offlineUpdate'), refresh = document.getElementById('offlineRefresh');
  var pageVersion = window.SG_OFFLINE_VERSION, availableVersion = null, refreshing = false;
  var registration = null, starting = false, checking = false, queued = false, queuedRepair = false, sequence = 0, installingTimer = 0, observedWorker = null, shown = '';
  function safeToRefresh() { return typeof window.SGUpdateSafe === 'function' && window.SGUpdateSafe(); }
  function showUpdate() {
    if (!update || !refresh) return;
    update.hidden = !availableVersion || !safeToRefresh();
    refresh.disabled = checking || refreshing;
  }
  function complete(result) { return result.ready && result.count === result.total && result.total > 0; }
  function remember(result) {
    availableVersion = complete(result) && typeof pageVersion === 'string' && typeof result.version === 'string' &&
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
    if (checking) { queued = true; queuedRepair = queuedRepair || !!repair; return; }
    if (!registration) return start();
    var owner = registration, worker = owner.active;
    if (!worker) {
      availableVersion = null;
      if (repair && !hasWorker(owner)) return start();
      paint('preparing', 'جارٍ تجهيز الألعاب للعمل دون إنترنت…', true);
      return;
    }
    checking = true;
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
      retry.disabled = false;
      showUpdate();
      if (queued) { var repairNext = queuedRepair; queued = queuedRepair = false; inspect(repairNext); }
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
  if (refresh) refresh.addEventListener('click', async function () {
    if (checking || refreshing || !availableVersion || !safeToRefresh()) return;
    var owner = registration, worker = owner && owner.active, expected = availableVersion;
    if (!worker) return;
    refreshing = true;
    showUpdate();
    try {
      var result = await ask(worker, false);
      if (owner !== registration || worker !== owner.active) { inspect(false); return; }
      remember(result);
      if (!complete(result)) paint('unavailable', 'النسخة دون إنترنت غير مكتملة — اتصل بالإنترنت ثم أعد المحاولة', true);
      // Verification can yield while a game opens. Never discard that new session,
      // and reload only this tab after its own explicit consent.
      if (availableVersion === expected && safeToRefresh()) location.reload();
    } catch (e) {
      if (owner !== registration || worker !== owner.active) inspect(false);
      else { availableVersion = null; paint('unavailable', 'تعذّر التأكد من النسخة دون إنترنت — أعد المحاولة', true); }
    } finally { refreshing = false; showUpdate(); }
  });
  window.addEventListener('sg:sessionchange', showUpdate);
  navigator.serviceWorker.addEventListener('controllerchange', function () { inspect(false); });
  // Reconnecting repairs an incomplete copy; a ready one only needs the quick check.
  window.addEventListener('online', function () { inspect(shown !== 'ready'); });
  window.addEventListener('focus', function () { if (!document.hidden) inspect(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) inspect(false); });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}());

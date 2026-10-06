/* Offline readiness belongs to verified cached bytes, not navigator.onLine. */
(function () {
  'use strict';
  var status = document.getElementById('offlineStatus');
  var retry = document.getElementById('offlineRetry');
  if (!status || !retry) return;
  var registration = null, starting = false, checking = false, queued = false, queuedRepair = false, sequence = 0, installingTimer = 0, observedWorker = null;
  function paint(state, text, canRetry) {
    status.hidden = false;
    status.setAttribute('data-state', state);
    // Avoid repeating live announcements when focus returns to the page.
    if (status.textContent !== text) status.textContent = text;
    retry.hidden = !canRetry;
    retry.disabled = checking;
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
      try { worker.postMessage({ type: 'sg:offline-status', id: id, repair: !!repair }, [channel.port2]); }
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
      if (repair && !hasWorker(owner)) return start();
      paint('preparing', 'جارٍ تجهيز الألعاب للعمل دون إنترنت…', true);
      return;
    }
    checking = true;
    paint('checking', repair ? 'جارٍ إصلاح النسخة المحفوظة…' : 'جارٍ التحقق من الألعاب المحفوظة…', false);
    try {
      var result = await ask(worker, repair);
      if (owner !== registration || worker !== owner.active) { queued = true; return; }
      if (result.ready && result.count === result.total && result.total > 0) {
        paint('ready', registration.installing ? 'جاهز دون إنترنت — جارٍ تنزيل تحديث' : 'جاهز دون إنترنت', false);
      } else {
        paint('unavailable', 'النسخة دون إنترنت غير مكتملة — اتصل بالإنترنت ثم أعد المحاولة', true);
      }
    } catch (e) {
      if (owner !== registration || worker !== owner.active) queued = true;
      else paint('unavailable', 'تعذّر التأكد من النسخة دون إنترنت — أعد المحاولة', true);
    } finally {
      checking = false;
      retry.disabled = false;
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
  navigator.serviceWorker.addEventListener('controllerchange', function () { inspect(false); });
  window.addEventListener('online', function () { inspect(true); });
  window.addEventListener('focus', function () { if (!document.hidden) inspect(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) inspect(false); });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}());

/* Offline readiness belongs to verified cached bytes, not navigator.onLine. */
(function () {
  'use strict';
  var status = document.getElementById('offlineStatus');
  var retry = document.getElementById('offlineRetry');
  var note = document.getElementById('updateNote');
  if (!status || !retry) return;
  var pageVersion = window.SG_OFFLINE_VERSION, availableVersion = null, reloadedVersion = null, refreshing = false;
  var registration = null, starting = false, checking = false, checkingRepair = false, queued = false, queuedRepair = false, sequence = 0, installingTimer = 0, observedWorker = null, shown = '';
  // offeredVersion: a newer version that is verified on this PC and waits for a tap.
  // activeVersion: the version of the worker that answered last; serverCheckAt: the last look at version.json.
  var offeredVersion = null, activeVersion = null, serverCheckAt = 0, serverChecking = false, updatedAt = 0;
  var SERVER_EVERY = 10 * 60 * 1000, SERVER_SOON = 2 * 60 * 1000;
  // Idle views (the catalog, no typing) reload by themselves; nothing is lost there.
  function safeToRefresh() { return typeof window.SGUpdateSafe === 'function' && window.SGUpdateSafe(); }
  // An open game between rounds (or with no round at all) may offer the button instead.
  function canOffer() { return typeof window.SGUpdateOffer === 'function' && window.SGUpdateOffer(); }
  function alreadyReloaded(version) {
    if (!version) return false;
    if (reloadedVersion === version) return true;
    try { return !!(window.sessionStorage && window.sessionStorage.getItem('sg:offline:reloaded') === version); }
    catch (e) { return false; }
  }
  function markReloaded(version) {
    reloadedVersion = version;
    try { if (window.sessionStorage) window.sessionStorage.setItem('sg:offline:reloaded', version); }
    catch (e) { /* storage may be blocked */ }
  }
  function complete(result) { return result.ready && result.count === result.total && result.total > 0; }
  // The «new version» button: shown only for the verified version that is still the newest
  // here, never mid-round, and never twice for one version in this tab.
  function paintOffer() {
    if (!note) return;
    var show = !!offeredVersion && offeredVersion === availableVersion && !alreadyReloaded(offeredVersion) && canOffer();
    // It sits in the game's bar under the game, never over the game itself. Opening a game
    // draws a new bar, so the button moves into the current one.
    var bar = document.getElementById('playBar'), buttons = bar && bar.querySelector('.pb-btns');
    if (show && !buttons) show = false;
    if (show && note.nextSibling !== buttons) bar.insertBefore(note, buttons);
    if (bar) bar.classList.toggle('has-update', show);
    if (note.hidden === !show) return;
    note.hidden = !show;
  }
  function remember(result) {
    if (typeof result.version === 'string' && result.version) activeVersion = result.version;
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
  function askLatest(worker) {
    return new Promise(function (resolve) {
      var channel = new MessageChannel(), id = ++sequence;
      var timer = setTimeout(function () { finish(null); }, 15000);
      function finish(value) { clearTimeout(timer); channel.port1.close(); resolve(value); }
      channel.port1.onmessage = function (event) {
        var data = event.data;
        if (!data || data.type !== 'sg:offline-latest' || data.id !== id) return;
        finish(typeof data.v === 'string' && /^[0-9a-f]{16}$/.test(data.v) ? data.v : null);
      };
      try { worker.postMessage({ type: 'sg:offline-latest', id: id }, [channel.port2]); }
      catch (e) { finish(null); }
    });
  }
  function hasWorker(owner) {
    return owner && [owner.active, owner.installing, owner.waiting].some(function (worker) {
      return worker && worker.state !== 'redundant';
    });
  }
  async function applyUpdate() {
    paintOffer();
    if (checking || refreshing || !availableVersion || alreadyReloaded(availableVersion)) return;
    // Verify once before offering the button; the catalog's quiet reload verifies every time.
    if (!safeToRefresh() && (offeredVersion === availableVersion || !canOffer())) return;
    var owner = registration, worker = owner && owner.active, expected = availableVersion;
    if (!worker) return;
    refreshing = true;
    try {
      var result = await ask(worker, false);
      if (owner !== registration || worker !== owner.active) { refreshing = false; inspect(false); return; }
      remember(result);
      if (!complete(result)) paint('unavailable', 'النسخة دون إنترنت غير مكتملة — اتصل بالإنترنت ثم أعد المحاولة', true);
      // Verification can yield while a game opens. Never discard a live session.
      if (availableVersion === expected && !alreadyReloaded(expected)) {
        if (safeToRefresh()) {
          markReloaded(expected);
          location.reload();
        } else {
          offeredVersion = expected;
          paintOffer();
        }
      }
    } catch (e) {
      if (owner !== registration || worker !== owner.active) { refreshing = false; inspect(false); return; }
      availableVersion = null;
      paint('unavailable', 'تعذّر التأكد من النسخة دون إنترنت — أعد المحاولة', true);
    } finally { refreshing = false; }
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
        checkServer(SERVER_SOON);
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
      if (queued) { var repairNext = queuedRepair; queued = queuedRepair = false; inspect(repairNext); }
      else applyUpdate();
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
  // A tab can stay open all day, and a cache between the PC and the site can keep handing
  // out an old sw.js. So ask the site itself, past every cache, which version it has now;
  // when it differs from this PC's, have the browser fetch the worker, and if that brings
  // nothing new, fetch it under a new address that no cache can hold yet.
  async function checkServer(gap) {
    var owner = registration;
    if (serverChecking || !owner || !owner.active || !activeVersion || document.hidden) return;
    if (Date.now() - serverCheckAt < gap) return;
    serverChecking = true;
    serverCheckAt = Date.now();
    try {
      // The worker fetches version.json: this page itself never uses the network.
      var latest = await askLatest(owner.active);
      if (owner !== registration || latest === activeVersion || owner.installing || owner.waiting) return;
      // No answer (offline, or the site is down): a plain update check costs one small file,
      // unless Retry has just made one.
      if (latest || Date.now() - updatedAt >= SERVER_SOON) {
        updatedAt = Date.now();
        try { await owner.update(); } catch (e) { /* offline or a server error: try again later */ }
      }
      if (!latest || owner !== registration || owner.installing || owner.waiting || !owner.active) return;
      var url = new URL('sw.js?v=' + latest, location.href).href;
      if (owner.active.scriptURL === url) return;
      // Same scope, so the same registration: its updatefound listener follows the install.
      await navigator.serviceWorker.register('sw.js?v=' + latest, { updateViaCache: 'none' });
    } catch (e) { /* the site is unreachable; the PC keeps its working version */ }
    finally { serverChecking = false; }
  }
  // Keep the worker address this PC already uses (sw.js, or sw.js?v=… after the check above):
  // registering another address would make every visit install the same worker again.
  async function workerUrl() {
    try {
      var owner = await navigator.serviceWorker.getRegistration();
      var worker = owner && (owner.active || owner.waiting || owner.installing);
      var url = worker && new URL(worker.scriptURL);
      var plain = new URL('sw.js', location.href);
      if (url && url.origin === plain.origin && url.pathname === plain.pathname && /^\?v=[0-9a-f]{16}$/.test(url.search)) return 'sw.js' + url.search;
    } catch (e) { /* use the plain address */ }
    return 'sw.js';
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
      var owner = await navigator.serviceWorker.register(await workerUrl(), { updateViaCache: 'none' });
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
    updatedAt = Date.now();
    try { await owner.update(); } catch (e) { /* Inspect the surviving worker, or register again if installation failed. */ }
    if (owner !== registration) return;
    if (!hasWorker(owner)) return start();
    inspect(true);
  });
  window.addEventListener('sg:sessionchange', applyUpdate);
  if (note) note.addEventListener('click', function () {
    if (!offeredVersion || offeredVersion !== availableVersion || alreadyReloaded(offeredVersion) || !canOffer()) { paintOffer(); return; }
    // The page opens again on the same address, so an open game comes back in its new version.
    markReloaded(offeredVersion);
    location.reload();
  });
  setInterval(function () { checkServer(SERVER_EVERY); }, 60 * 1000);
  navigator.serviceWorker.addEventListener('controllerchange', function () { inspect(false); });
  // Reconnecting repairs an incomplete copy; a ready one only needs the quick check.
  window.addEventListener('online', function () { inspect(shown !== 'ready'); });
  window.addEventListener('focus', function () { if (!document.hidden) inspect(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) inspect(false); });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}());

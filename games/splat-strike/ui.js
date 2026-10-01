/*
 * Splat Strike — ui.js
 * Presentation + input: WebGL renderer and quality safety net, first-person camera and view model,
 * pointer lock (with a drag-to-look fallback), HUD (crosshair, hitmarkers, damage direction,
 * kill feed, callouts, minimap, name tags, scoreboard), menus (title with a live bot match behind it,
 * locker, settings, how-to, pause, results podium), progression/saving and window.__game test hooks.
 */
(function () {
  'use strict';
  var T = window.THREE, SS = window.SS, G = SS.G, sfx = SS.sfx, music = SS.music, WEAPONS = SS.WEAPONS;
  var $ = function (id) { return document.getElementById(id); };
  var store = Kit.store('splat-strike');
  var clamp = Kit.clamp;
  function ltr(t) { return '⁦' + t + '⁩'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hex(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }

  /* =================================================================== SAVE */
  function num(v, d, a, b) { v = +v; return isFinite(v) ? clamp(v, a, b) : d; }
  function list(v, d) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : d.slice(); }
  // everything lives in ONE key (one small write per save on slow school disks)
  var D0 = store.get('data', null);
  if (!D0 || typeof D0 !== 'object') D0 = {};
  var S0 = (D0.set && typeof D0.set === 'object') ? D0.set : {};
  var save = {
    coins: Math.max(0, Math.floor(+D0.coins || 0)),
    xp: Math.max(0, +D0.xp || 0), level: Math.max(1, Math.floor(+D0.level || 1)),
    ownC: list(D0.ownC, ['pink', 'sky']), ownH: list(D0.ownH, ['none', 'cap']), ownS: list(D0.ownS, ['classic', 'lagoon']),
    color: String(D0.color || 'pink'), hat: String(D0.hat || 'cap'), skin: String(D0.skin || 'classic'), wpn: num(D0.wpn, 0, 0, 2) | 0,
    bestSplats: Math.max(0, +D0.bestSplats || 0), bestStreak: Math.max(0, +D0.bestStreak || 0),
    matches: Math.max(0, +D0.matches || 0), wins: Math.max(0, +D0.wins || 0),
    mode: D0.mode === 'team' ? 'team' : 'ffa', map: num(D0.map, 0, 0, SS.MAPS.length - 1) | 0, diff: num(D0.diff, 0, 0, 2) | 0,
    set: {
      sens: num(S0.sens, 1, 0.2, 3), fov: num(S0.fov, 72, 60, 95), inv: !!S0.inv, qual: ['auto', 'high', 'low'].indexOf(S0.qual) >= 0 ? S0.qual : 'auto',
      music: S0.music !== false, nums: S0.nums !== false, bob: !!S0.bob, aaOff: !!S0.aaOff
    }
  };
  ['pink', 'sky'].forEach(function (c) { if (save.ownC.indexOf(c) < 0) save.ownC.push(c); });
  ['none', 'cap'].forEach(function (c) { if (save.ownH.indexOf(c) < 0) save.ownH.push(c); });
  ['classic', 'lagoon'].forEach(function (c) { if (save.ownS.indexOf(c) < 0) save.ownS.push(c); });
  if (save.ownC.indexOf(save.color) < 0) save.color = 'pink';
  if (save.ownH.indexOf(save.hat) < 0) save.hat = 'cap';
  if (save.ownS.indexOf(save.skin) < 0) save.skin = 'classic';
  function persist() { store.set('data', save); }
  function myColor() { return SS.byId(SS.COLORS, save.color).c; }
  function mySkin() { return SS.byId(SS.SKINS, save.skin); }
  music.enabled = save.set.music;

  /* ================================================================ RENDERER */
  var canvas = $('gl'), uiEl = $('ui');
  var LQ = /[?&]lq\b/.test(location.search);
  var renderer;
  try {
    var aa = save.set.qual === 'high' || (save.set.qual === 'auto' && !LQ && !save.set.aaOff && window.innerWidth * Math.min(window.devicePixelRatio || 1, 1.25) <= 1600);
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: aa, powerPreference: 'high-performance' });
  } catch (e) { $('nogl').hidden = false; $('title').hidden = true; return; }
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  function basePR() {
    var d = window.devicePixelRatio || 1;
    if (LQ) return 0.5;
    return save.set.qual === 'low' ? Math.min(d, 0.8) : Math.min(d, 1.25);
  }
  var PR = basePR();
  renderer.setPixelRatio(PR);
  var camera = G.camera = new T.PerspectiveCamera(save.set.fov, 16 / 9, 0.05, 400);
  camera.rotation.order = 'YXZ';

  function lightsFor(sc) {
    var h = new T.HemisphereLight(0xeaf6ff, 0x9bbf7a, 1.9), d = new T.DirectionalLight(0xfff2dc, 2.3);
    d.position.set(-0.5, 1, 0.35);
    sc.add(h, d);
    return { h: h, d: d };
  }
  /* ---- view model */
  var vmScene = new T.Scene(), vmL = lightsFor(vmScene);
  var vmCam = new T.PerspectiveCamera(54, 16 / 9, 0.01, 10);
  var vmRoot = new T.Group(); vmScene.add(vmRoot);
  var vmMat = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
  var vmGun = new T.Mesh(new T.BufferGeometry(), vmMat); vmRoot.add(vmGun);
  var flashGeo = (function () {
    var b = new SS.Builder(), n = 7;
    for (var i = 0; i < n * 2; i++) {
      var a0 = i / (n * 2) * Math.PI * 2, a1 = (i + 1) / (n * 2) * Math.PI * 2, r0 = i % 2 ? 0.05 : 0.11, r1 = i % 2 ? 0.11 : 0.05;
      b.tri(0, 0, 0, Math.cos(a0) * r0, Math.sin(a0) * r0, 0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0, 0xffffff);
      b.tri(0, 0, 0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0, Math.cos(a0) * r0, Math.sin(a0) * r0, 0, 0xffffff);
    }
    return b.geometry();
  })();
  var vmFlashMat = new T.MeshBasicMaterial({ color: 0xffffff });
  var vmFlash = new T.Mesh(flashGeo, vmFlashMat); vmFlash.visible = false; vmRoot.add(vmFlash);
  var vmBalloon = new T.Mesh(SS.balloonGeo(), new T.MeshLambertMaterial({ vertexColors: true })); vmBalloon.visible = false; vmScene.add(vmBalloon);
  vmBalloon.position.set(-0.17, -0.13, -0.45); vmBalloon.scale.setScalar(0.42);
  var vmMuzzle = new T.Vector3(0, 0, -0.5), vmW = -1, vmSkin = null, vmCol = -1;
  var VM_BASE = [[0.2, -0.145, -0.38], [0.21, -0.15, -0.37], [0.19, -0.135, -0.35]];
  vmRoot.scale.setScalar(0.55);
  function setVmGun() {
    var p = G.player; if (!p) return;
    var col = G.bodyColor(p);
    if (p.wpn === vmW && p.skin === vmSkin && col === vmCol) return;     // no per-frame string keys (garbage)
    vmW = p.wpn; vmSkin = p.skin; vmCol = col;
    var gg = G.gunGeo(p.wpn, p.skin, G.bodyColor(p));
    vmGun.geometry = gg.geo;
    vmMuzzle.set(gg.muzzle[0], gg.muzzle[1], gg.muzzle[2]);
    vmFlash.position.copy(vmMuzzle);
    vmFlashMat.color.setRGB(G.paint(p)[0], G.paint(p)[1], G.paint(p)[2]);
  }
  /* ---- showcase (title / locker) */
  var showScene = new T.Scene(); lightsFor(showScene);
  var showCam = new T.PerspectiveCamera(28, 16 / 9, 0.1, 50);
  showCam.position.set(0, 1.5, 8.6); showCam.lookAt(0, 0.62, 0);
  var showRoot = new T.Group(); showScene.add(showRoot);
  var footMat = new T.MeshLambertMaterial({ color: 0xffffff });
  function makeDoll(root) {
    var d = { g: new T.Group() };
    d.body = new T.Mesh(new T.BufferGeometry(), new T.MeshLambertMaterial({ vertexColors: true })); d.g.add(d.body);
    d.pivot = new T.Group(); d.pivot.position.set(0.2, 0.98, -0.2); d.g.add(d.pivot);
    d.gun = new T.Mesh(new T.BufferGeometry(), G.mats.gun); d.gun.scale.setScalar(1.55); d.pivot.add(d.gun);
    d.fm = new T.MeshLambertMaterial({ color: 0xffffff });
    d.f1 = new T.Mesh(SS.footGeo(), d.fm); d.f2 = new T.Mesh(d.f1.geometry, d.fm);
    d.f1.position.set(-0.18, 0, 0); d.f2.position.set(0.18, 0, 0); d.g.add(d.f1, d.f2);
    root.add(d.g);
    return d;
  }
  function dressDoll(d, o) {
    d.body.geometry = G.buddyGeo({ team: 0, color: o.color, hat: o.hat, accent: o.accent || 0xffe14d });
    d.gun.geometry = G.gunGeo(o.wpn, o.skin, o.color).geo;
    var c = SS.shade(o.color, 0.85); d.fm.color.setHex(c);
  }
  var doll = makeDoll(showRoot);
  G.geoPinned.push(vmGun, doll.body, doll.gun);
  (function () {
    var b = new SS.Builder();
    b.cyl(0, -0.25, 0, 1.25, 0.25, 0xff3d8b, { seg: 28, top: 0xff7ab8 });
    b.ring(0, 0.005, 0, 0.95, 1.1, 0xffffff, 28);
    showRoot.add(new T.Mesh(b.geometry(), G.mats.map));
  })();
  function refreshDoll() { dressDoll(doll, { color: myColor(), hat: save.hat, skin: mySkin(), wpn: save.wpn }); }
  /* ---- results podium */
  var podScene = new T.Scene(); lightsFor(podScene);
  var podCam = new T.PerspectiveCamera(34, 16 / 9, 0.1, 200);
  podCam.position.set(0, 2.6, 9.5); podCam.lookAt(0, 1.4, 0);
  (function () {
    var g = new T.SphereGeometry(80, 20, 12);
    var col = new Float32Array(g.attributes.position.count * 3), a = SS.lin(0x6a5cff), b = SS.lin(0xff7ab8), c = SS.lin(0xffd6ec);
    for (var i = 0; i < g.attributes.position.count; i++) {
      var y = g.attributes.position.getY(i) / 80, k = clamp((y + 0.2) / 0.9, 0, 1), k2 = clamp((0.1 - y) / 0.4, 0, 1);
      col[i * 3] = b[0] + (a[0] - b[0]) * k + (c[0] - b[0]) * k2 * 0.5; col[i * 3 + 1] = b[1] + (a[1] - b[1]) * k + (c[1] - b[1]) * k2 * 0.5; col[i * 3 + 2] = b[2] + (a[2] - b[2]) * k + (c[2] - b[2]) * k2 * 0.5;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    podScene.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })));
    podScene.add(new T.Mesh(SS.podiumGeo(), G.mats.map));
  })();
  var podDolls = [makeDoll(podScene), makeDoll(podScene), makeDoll(podScene)];
  podDolls.forEach(function (d) { G.geoPinned.push(d.body, d.gun); });
  var POD_X = [0, -1.7, 1.7], POD_Y = [1.2, 0.85, 0.6];

  /* ---- layout */
  var W = 1280, H = 720;
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    var a = W / H;
    camera.aspect = vmCam.aspect = showCam.aspect = podCam.aspect = a;
    camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
    showCam.setViewOffset(W, H, W * 0.24, 0, W, H);
    podCam.setViewOffset(W, H, W * 0.2, 0, W, H);
    uiEl.style.fontSize = (16 * Math.min(W / 1280, H / 720)).toFixed(2) + 'px';
    drips.width = Math.max(1, Math.round(W / 2)); drips.height = Math.max(1, Math.round(H / 2));
    dripsDirty = true;
  }
  var drips = $('drips'), dctx = drips.getContext('2d'), dripsDirty = false;
  window.addEventListener('resize', layout);

  /* ================================================================ STATE */
  var UI = { state: 'boot', paused: false, resuming: false, back: 'title', aimingThrow: false, hookFire: false, hookFireP: false, hookThrow: false, board: false, resultsShown: false };
  var screens = ['title', 'locker', 'settings', 'howto', 'pause', 'over'];
  function show(id) { for (var i = 0; i < screens.length; i++) $(screens[i]).hidden = screens[i] !== id; }
  var hudEl = $('hud');

  /* ============================================================ POINTER LOCK */
  // The match only runs while the mouse is locked: a refused lock (Chrome refuses a re-lock that comes
  // right after Esc) keeps the pause screen up with "click again". Drag-to-look is the fallback only when
  // the browser has no pointer lock at all, or keeps refusing it (3 times in a row).
  // Raw mouse input (no Windows pointer acceleration) is asked for first, plain lock where unsupported.
  var lock = { on: false, fails: 0, releasing: false, drag: !canvas.requestPointerLock, raw: true, promise: false, since: 0, lastFail: 0 };
  function requestLock() {
    if (lock.on) return;
    if (!canvas.requestPointerLock) { lock.drag = true; return; }
    var p = null;
    try { p = lock.raw ? canvas.requestPointerLock({ unadjustedMovement: true }) : canvas.requestPointerLock(); }
    catch (e) { if (lock.raw) { lock.raw = false; requestLock(); } else onLockFail(); return; }
    if (p && typeof p.then === 'function') {
      lock.promise = true;
      p.then(null, function (err) {
        // no raw input on this system: ask again for a plain lock (still inside the click's activation window)
        if (lock.raw && err && err.name === 'NotSupportedError') { lock.raw = false; requestLock(); return; }
        onLockFail();
      });
    }
  }
  function onLockFail() {
    var now = performance.now();
    if (now - lock.lastFail < 60) return;       // the promise and the pointerlockerror event report the same refusal
    lock.lastFail = now;
    lock.fails++; lock.on = false;
    if (lock.fails >= 3) lock.drag = true;
    if (UI.state !== 'play' || G.over) return;
    if (UI.paused) {
      if (UI.resuming && lock.drag) finishResume();
      else { UI.resuming = false; $('pLockMsg').hidden = false; }
    } else if (!lock.drag) { pause(); $('pLockMsg').hidden = false; }
    else dragHint();
  }
  function dragHint() { hint('اسحب بالفأرة للنظر حولك، وانقر لتطلق', 4); }
  function releaseLock() {
    if (document.pointerLockElement) { lock.releasing = true; try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  }
  document.addEventListener('pointerlockchange', function () {
    var on = document.pointerLockElement === canvas;
    lock.on = on;
    if (on) {
      lock.fails = 0; lock.since = performance.now(); $('lockHint').hidden = true; $('pLockMsg').hidden = true;
      if (UI.paused && UI.resuming) finishResume();
    } else {
      mouse.left = mouse.right = false;
      if (!lock.releasing && UI.state === 'play' && !UI.paused && !G.over) pause();
      lock.releasing = false;
    }
  });
  document.addEventListener('pointerlockerror', function () { if (!lock.promise) onLockFail(); });

  /* ================================================================ INPUT */
  function gameSurfaceFocused() { return document.activeElement === canvas || document.activeElement === document.body; }
  var mouse = { left: false, leftP: false, right: false, wheel: 0, dx: 0, dy: 0, avg: 0, dropped: false };
  function look(dx, dy) {
    var p = G.player;
    if (!p || !p.alive || UI.state !== 'play' || UI.paused) return;
    // Chrome/Windows sometimes reports one bogus jump (right after locking, or now and then): drop only a
    // lone event that is far bigger than the recent movement. Real fast flicks build up over a few events.
    var m = Math.max(Math.abs(dx), Math.abs(dy));
    if (m > 250 && performance.now() - lock.since < 120) return;
    if (m > 1500 && m > mouse.avg * 20 && !mouse.dropped) { mouse.dropped = true; return; }
    mouse.dropped = false;
    mouse.avg += (m - mouse.avg) * 0.3;
    if (m > 2000) { dx = dx * 2000 / m; dy = dy * 2000 / m; }
    var s = save.set.sens * 0.0022 * (p.zoom ? 1 / WEAPONS[2].zoom : 1);
    p.yaw -= dx * s;
    p.pitch = clamp(p.pitch - dy * s * (save.set.inv ? -1 : 1), -1.45, 1.45);
    mouse.dx += dx; mouse.dy += dy;
  }
  window.addEventListener('mousemove', function (e) {
    if (UI.state !== 'play' || UI.paused) return;
    if (lock.on || (lock.drag && e.buttons)) look(e.movementX || 0, e.movementY || 0);
  });
  canvas.addEventListener('mousedown', function (e) {
    if (UI.state !== 'play' || UI.paused) return;
    if (!lock.on) {
      requestLock();
      if (!lock.drag) return; // this click only grabs the mouse
    }
    if (e.button === 0) { mouse.left = true; mouse.leftP = true; }
    else if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) mouse.left = false; else if (e.button === 2) mouse.right = false; });
  window.addEventListener('wheel', function (e) {
    if (UI.state !== 'play') return;
    e.preventDefault();   // inside the portal the wheel would otherwise scroll the whole page away from the game
    if (!UI.paused) mouse.wheel += e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
  }, { passive: false });
  window.addEventListener('blur', function () { mouse.left = mouse.right = false; if (UI.state === 'play') pause(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && UI.state === 'play') pause(); });

  function readInput() {
    var p = G.player, K = Kit.keys;
    if (!p) return;
    var f = (K.down('KeyW') || K.down('ArrowUp') ? 1 : 0) - (K.down('KeyS') || K.down('ArrowDown') ? 1 : 0);
    var s = (K.down('KeyD') || K.down('ArrowRight') ? 1 : 0) - (K.down('KeyA') || K.down('ArrowLeft') ? 1 : 0);
    var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    var mx = -sy * f + cy * s, mz = -cy * f - sy * s, l = Math.sqrt(mx * mx + mz * mz);
    if (l > 1) { mx /= l; mz /= l; }
    p.mx = mx; p.mz = mz;
    p.sprint = K.down('ShiftLeft') || K.down('ShiftRight');
    p.jumpReq = K.down('Space');
    p.fire = mouse.left || UI.hookFire;
    p.fireP = mouse.leftP || UI.hookFireP;
    mouse.leftP = false; UI.hookFireP = false;
    if (K.pressed('Digit1') || K.pressed('Numpad1')) p.wantSwap = 0;
    if (K.pressed('Digit2') || K.pressed('Numpad2')) p.wantSwap = 1;
    if (K.pressed('Digit3') || K.pressed('Numpad3')) p.wantSwap = 2;
    if (K.pressed('KeyQ')) p.wantSwap = p.lastW;
    if (mouse.wheel) { p.wantSwap = (p.wpn + (mouse.wheel > 0 ? 1 : 2)) % 3; mouse.wheel = 0; }
    p.wantReload = K.pressed('KeyR');
    var th = (K.down('KeyG') || (mouse.right && p.wpn !== 2) || UI.hookThrow) && p.alive && !G.frozen;
    if (th && p.balloons > 0) UI.aimingThrow = true;
    else if (UI.aimingThrow) { UI.aimingThrow = false; if (p.balloons > 0 && p.alive) p.wantThrow = true; }
    if (th && p.balloons === 0 && (K.pressed('KeyG'))) hint('لا توجد بالونات! التقط علبة طلاء', 1.4);
    var z = p.wpn === 2 && mouse.right && p.reloadT <= 0 && p.swapT <= 0 && p.alive && !G.frozen;
    if (z !== p.zoom) { p.zoom = z; sfx.zoom(z); }
  }

  /* ================================================================ SCREENS */
  function setPlaying(on) { document.body.classList.toggle('playing', on); }
  function goTitle() {
    UI.state = 'title'; UI.paused = false; UI.resuming = false; UI.resultsShown = false; document.body.classList.remove('paused');
    releaseLock(); setPlaying(false);
    hudEl.hidden = true; $('pauseBtn').hidden = true;
    moveConfetti(G.scene);
    G.start({ demo: true, map: save.map, mode: 'ffa', diff: 1 });
    show('title');
    refreshTitle(); refreshDoll();
    music.play('menu');
  }
  function startMatch() {
    persist();
    UI.state = 'play'; UI.paused = false; UI.resuming = false; UI.resultsShown = false; UI.aimingThrow = false; document.body.classList.remove('paused');
    mouse.left = mouse.right = false; mouse.wheel = 0;
    show(null);
    moveConfetti(G.scene);
    G.start({ mode: save.mode, map: save.map, diff: save.diff, me: { color: myColor(), hat: save.hat, skin: mySkin(), wpn: save.wpn } });
    hudEl.hidden = false; $('pauseBtn').hidden = false;
    setPlaying(true);
    requestLock();
    music.play('game');
    sfx.start();
  }
  function pause() {
    if (UI.state !== 'play' || UI.paused || G.over) return;
    UI.paused = true; UI.resuming = false;
    show('pause'); $('pLockMsg').hidden = true;
    releaseLock();
    mouse.left = mouse.right = false; UI.aimingThrow = false;
    if (G.player) { G.player.zoom = false; }
    music.hold(true);            // nothing plays while paused
    $('pauseBtn').hidden = true; $('board').hidden = true; hudEl.classList.remove('boardon');
    document.body.classList.add('paused');
  }
  // resuming asks for the mouse first; the match only continues once the lock is really granted
  function resume() {
    if (!UI.paused || UI.state !== 'play') return;
    if (lock.on || lock.drag) { finishResume(); return; }
    UI.resuming = true;
    requestLock();
  }
  function finishResume() {
    if (!UI.paused) return;
    UI.paused = false; UI.resuming = false;
    show(null);
    music.hold(false);
    $('pauseBtn').hidden = false;
    document.body.classList.remove('paused');
    heartT = 0.6; mouse.avg = 0;
    if (lock.drag && !lock.on) dragHint();
  }
  function openSettings(from) { UI.back = from; UI.state = from === 'pause' ? 'play' : 'settings'; show('settings'); refreshSettings(); }
  function closeSettings() { persist(); if (UI.back === 'pause') { show('pause'); } else { UI.state = 'title'; show('title'); refreshTitle(); } }

  /* ---- title */
  var mapSeg = $('mapSeg');
  SS.MAPS.forEach(function (m, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'mapc'; b.setAttribute('data-v', i);
    b.innerHTML = '<span class="mi">' + m.icon + '</span><span class="mn">' + esc(m.name) + '</span>';
    mapSeg.appendChild(b);
  });
  function segOn(el, v) { var bs = el.querySelectorAll('button'); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-v') === String(v)); }
  function needXp(l) { return 100 + (l - 1) * 60; }
  function refreshTitle() {
    segOn($('modeSeg'), save.mode); segOn(mapSeg, save.map); segOn($('diffSeg'), save.diff);
    $('tCoins').textContent = Kit.fmt(save.coins);
    $('tLevel').textContent = save.level;
    $('tXp').style.width = Math.round(save.xp / needXp(save.level) * 100) + '%';
    var r = '';
    if (save.matches) r += '<div class="chip">مباريات: <b>' + save.matches + '</b></div>';
    if (save.bestSplats) r += '<div class="chip">أكثر لطخات: <b>' + save.bestSplats + '</b></div>';
    if (save.bestStreak) r += '<div class="chip">أفضل سلسلة: <b>' + save.bestStreak + '</b></div>';
    $('records').innerHTML = r;
  }
  $('modeSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; sfx.click(); save.mode = b.getAttribute('data-v'); refreshTitle(); persist(); });
  $('diffSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; sfx.click(); save.diff = +b.getAttribute('data-v'); refreshTitle(); persist(); });
  mapSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    sfx.click();
    var v = +b.getAttribute('data-v');
    if (v !== save.map) { save.map = v; persist(); G.start({ demo: true, map: v, mode: 'ffa', diff: 1 }); }
    refreshTitle();
  });

  /* ---- locker */
  var lTab = 'colors';
  // drawn icon (the bubbles emoji is too new for Windows 10 school PCs)
  var BUBBLES_ICON = '<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><circle cx="9.5" cy="13.5" r="6.5" fill="#d9f6ff" stroke="#fff" stroke-width="1.6"/><circle cx="17.5" cy="7.5" r="4" fill="#d9f6ff" stroke="#fff" stroke-width="1.3"/><circle cx="18.5" cy="17.5" r="2.6" fill="#d9f6ff" stroke="#fff" stroke-width="1.1"/><circle cx="7.3" cy="11" r="1.7" fill="#fff"/><circle cx="16.3" cy="6.3" r="1" fill="#fff"/></svg>';
  var HAT_ICON = { none: '&#10134;', cap: '&#129506;', party: '&#127881;', bunny: '&#128048;', propeller: '&#127744;', chef: '&#127859;', cowboy: '&#129312;', viking: '&#128737;&#65039;', flower: '&#127800;', antenna: '&#128125;', tophat: '&#127913;', crown: '&#128081;' };
  function renderLocker() {
    $('lCoins').textContent = Kit.fmt(save.coins);
    var tabs = $('lTabs').querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-t') === lTab);
    var h = '', items, own, cur;
    if (lTab === 'wpn') {
      for (var w = 0; w < 3; w++) {
        h += '<div class="card' + (save.wpn === w ? ' eq' : '') + '" data-id="' + w + '"><div class="sw" style="background:' + ['#ff7ab8', '#3fb8ff', '#ffd23f'][w] + '">' + [BUBBLES_ICON, '&#128166;', '&#127919;'][w] + '</div><div class="nm">' + esc(WEAPONS[w].name) + '</div>' +
          (save.wpn === w ? '<div class="pr eq">مُجهّز</div>' : '<div class="pr own">اختر</div>') + '</div>';
      }
      $('lTip').textContent = 'اختر البخّاخ الذي تبدأ به. يمكنك التبديل أثناء اللعب بالأزرار 1 و2 و3.';
    } else {
      if (lTab === 'colors') { items = SS.COLORS; own = save.ownC; cur = save.color; }
      else if (lTab === 'hats') { items = SS.HATS; own = save.ownH; cur = save.hat; }
      else { items = SS.SKINS; own = save.ownS; cur = save.skin; }
      items.forEach(function (it) {
        var owned = own.indexOf(it.id) >= 0, eq = cur === it.id;
        var sw;
        if (lTab === 'colors') sw = '<div class="sw" style="background:' + hex(it.c) + '"></div>';
        else if (lTab === 'hats') sw = '<div class="sw" style="background:#ffffff22">' + (HAT_ICON[it.id] || '') + '</div>';
        else sw = '<div class="sw" style="background:linear-gradient(135deg,' + hex(it.main) + ' 0 45%,' + hex(it.acc) + ' 45% 70%,' + hex(it.tank) + ' 70%)"></div>';
        var sel = lPreview === lTab + ':' + it.id;
        var pr = eq ? '<div class="pr eq">مُجهّز</div>' : owned ? '<div class="pr own">اختر</div>' :
          sel ? '<div class="pr buy">اشترِ <span class="coin"></span>' + it.price + '</div>' :
          '<div class="pr' + (save.coins < it.price ? ' no' : '') + '"><span class="coin"></span>' + it.price + '</div>';
        h += '<div class="card' + (eq ? ' eq' : '') + (owned ? '' : ' locked') + (sel ? ' sel' : '') + '" data-id="' + it.id + '">' + sw + '<div class="nm">' + esc(it.name) + '</div>' + pr + '</div>';
      });
      $('lTip').textContent = lPreview ? 'تجربة! انقر على القطعة مرة أخرى لتشتريها.' : 'اربح العملات في المباريات لتفتح أشياء جديدة! كل لطخة = 5 عملات.';
    }
    $('lGrid').innerHTML = h;
  }
  $('lTabs').addEventListener('click', function (e) { var b = e.target.closest('.tab'); if (!b) return; sfx.click(); lTab = b.getAttribute('data-t'); if (lPreview) { lPreview = ''; refreshDoll(); } renderLocker(); });
  $('lGrid').addEventListener('click', function (e) {
    var c = e.target.closest('.card'); if (!c) return;
    var id = c.getAttribute('data-id');
    if (lTab === 'wpn') { save.wpn = +id; sfx.swap(); persist(); refreshDoll(); renderLocker(); return; }
    var items = lTab === 'colors' ? SS.COLORS : lTab === 'hats' ? SS.HATS : SS.SKINS;
    var own = lTab === 'colors' ? save.ownC : lTab === 'hats' ? save.ownH : save.ownS;
    var it = SS.byId(items, id);
    if (own.indexOf(id) < 0) {
      // first click tries it on, second click buys it
      if (lPreview !== lTab + ':' + id) { lPreview = lTab + ':' + id; sfx.click(); previewDoll(lTab, id); renderLocker(); return; }
      if (save.coins < it.price) { sfx.deny(); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); $('lTip').textContent = 'تحتاج ' + (it.price - save.coins) + ' عملة أخرى. العب مباراة لتربحها!'; return; }
      save.coins -= it.price; own.push(id); sfx.buy();
    } else sfx.click();
    lPreview = '';
    if (lTab === 'colors') save.color = id; else if (lTab === 'hats') save.hat = id; else save.skin = id;
    persist(); refreshDoll(); renderLocker();
  });
  var lPreview = '';
  function previewDoll(tab, id) {
    dressDoll(doll, { color: tab === 'colors' ? SS.byId(SS.COLORS, id).c : myColor(), hat: tab === 'hats' ? id : save.hat, skin: tab === 'skins' ? SS.byId(SS.SKINS, id) : mySkin(), wpn: save.wpn });
  }
  function openLocker() { UI.state = 'locker'; lPreview = ''; show('locker'); renderLocker(); refreshDoll(); }

  /* ---- settings */
  function tog(id, on) { var b = $(id); b.classList.toggle('on', on); b.textContent = on ? 'تعمل' : 'متوقفة'; }
  function refreshSettings() {
    $('sSens').value = save.set.sens; $('sSensV').textContent = save.set.sens.toFixed(2);
    $('sFov').value = save.set.fov; $('sFovV').textContent = save.set.fov;
    tog('sInv', save.set.inv); tog('sMus', save.set.music); tog('sNums', save.set.nums); tog('sBob', save.set.bob);
    segOn($('sQual'), save.set.qual);
  }
  $('sSens').addEventListener('input', function () { save.set.sens = +this.value; $('sSensV').textContent = save.set.sens.toFixed(2); });
  $('sFov').addEventListener('input', function () { save.set.fov = +this.value; $('sFovV').textContent = save.set.fov; });
  $('sInv').addEventListener('click', function () { sfx.click(); save.set.inv = !save.set.inv; refreshSettings(); });
  $('sNums').addEventListener('click', function () { sfx.click(); save.set.nums = !save.set.nums; refreshSettings(); });
  $('sBob').addEventListener('click', function () { sfx.click(); save.set.bob = !save.set.bob; refreshSettings(); });
  $('sMus').addEventListener('click', function () {
    sfx.click(); save.set.music = !save.set.music; music.enabled = save.set.music;
    if (save.set.music) music.play(UI.state === 'play' ? 'game' : 'menu'); else music.stop();
    if (UI.paused) music.hold(true);
    refreshSettings();
  });
  $('sQual').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    sfx.click(); save.set.qual = b.getAttribute('data-v'); save.set.aaOff = false;
    PR = basePR(); dres.ratio = PR; dres.min = PR * 0.6; renderer.setPixelRatio(PR); layout();
    $('sNote').textContent = 'تنعيم الحواف يتغير بعد إعادة فتح اللعبة.';
    refreshSettings();
  });
  $('sBack').addEventListener('click', function () { sfx.click(); closeSettings(); });

  /* ---- buttons */
  function btn(id, fn) {
    var el = $(id);
    el.addEventListener('click', function (e) { e.stopPropagation(); sfx.click(); fn(); if (e.detail > 0 && el.blur) el.blur(); });
    el.addEventListener('mouseenter', function () { sfx.hover(); });
  }
  btn('playBtn', startMatch);
  btn('lockerBtn', openLocker);
  btn('setBtn', function () { openSettings('title'); });
  btn('howBtn', function () { UI.state = 'howto'; show('howto'); });
  btn('hBack', function () { UI.state = 'title'; show('title'); });
  btn('lBack', function () { UI.state = 'title'; lPreview = ''; refreshDoll(); show('title'); refreshTitle(); });
  btn('resumeBtn', resume);
  btn('restartBtn', startMatch);
  btn('pSetBtn', function () { openSettings('pause'); });
  btn('pMenuBtn', goTitle);
  btn('againBtn', function () { if (performance.now() - overAt > 400) startMatch(); });
  btn('oMenuBtn', goTitle);
  // "click anywhere": the backdrop, the panel, its title and text all resume; only the buttons do their own thing
  $('pause').addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('button, input, a, label, select'))) resume(); });
  $('pauseBtn').addEventListener('click', function (e) { e.stopPropagation(); pause(); if (e.detail > 0) this.blur(); });
  $('pauseBtn').addEventListener('pointerdown', function (e) { e.stopPropagation(); });

  /* ================================================================ HUD */
  var H$ = {
    hpNum: $('hpNum'), hpBar: $('hpBar'), hpBox: $('hpbox'), ammoNum: $('ammoNum'), ammoRes: $('ammoRes'), wpnName: $('wpnName'), balN: $('balN'),
    slots: document.querySelectorAll('#slots .slot[data-w]'), timer: $('timer'), scorebar: $('scorebar'), xhair: $('xhair'), hit: $('hitmark'),
    lowhp: $('lowhp'), scope: $('scope'), power: $('powerBox'), powT: $('powT'), dead: $('dead'), deadBy: $('deadBy'), deadN: $('deadN'),
    feed: $('feed'), callout: $('callout'), toast: $('toast'), big: $('bigmsg'), hint: $('hint'), board: $('board'), tags: $('tags'), nums: $('nums'),
    dirs: document.querySelectorAll('#dmgdir i'), mm: $('minimap'), arc: $('arc')
  };
  var hudC = { hp: -1, hpCls: '', ammo: -1, res: -1, wpn: -1, bal: -1, sec: -1, sa: -1, sb: -1, gap: -1, enemy: false, low: false, pow: -1, deadN: -1, scope: false, xh: true };
  function resetHudCache() { for (var k in hudC) if (typeof hudC[k] === 'number') hudC[k] = -1; }
  var anims = {};
  function play(el, key, frames, opts) { try { if (anims[key]) anims[key].cancel(); anims[key] = el.animate(frames, opts); } catch (e) { /* old browser */ } }
  var hintT = 0;
  function hint(text, sec) { H$.hint.textContent = text; H$.hint.classList.add('on'); hintT = sec || 1.6; }
  function callout(text, sub, color) {
    H$.callout.innerHTML = esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    H$.callout.style.color = color || '';
    play(H$.callout, 'co', [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1.15)', offset: 0.12 }, { opacity: 1, transform: 'scale(1)', offset: 0.22 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: 'translateY(-0.4em)' }], { duration: 1500, easing: 'ease-out', fill: 'forwards' });
  }
  function toast(text, color) {
    H$.toast.textContent = text; H$.toast.style.color = color || '#fff';
    play(H$.toast, 'to', [{ opacity: 0, transform: 'translate(-50%, 0.5em)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0, transform: 'translate(-50%, -0.6em)' }], { duration: 1300, fill: 'forwards' });
  }
  function bigmsg(text, dur, color) {
    H$.big.textContent = text; H$.big.style.color = color || '';
    play(H$.big, 'big', [{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'scale(1)', offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: 'scale(0.9)' }], { duration: dur || 900, fill: 'forwards' });
  }
  // kill feed
  function feed(src, v, head, w) {
    var el = document.createElement('div');
    var me = (src && src.isPlayer) || v.isPlayer;
    el.className = 'fl' + (me ? ' me' : '');
    var sc = src ? hex(G.bodyColor(src)) : '#fff', vc = hex(G.bodyColor(v));
    var icon = w === 3 ? '&#127880;' : head ? '&#127919;' : '&#127912;';
    var h;
    if (src && src !== v) {
      h = '<span style="color:' + sc + '">' + esc(src.name) + '</span><span class="ic">' + icon + ' ';
      if (v.isPlayer) h += 'لطّخك</span>';
      else h += (src.isPlayer ? 'لطّخت' : 'لطّخ') + '</span><span style="color:' + vc + '">' + esc(v.name) + '</span>';
    } else h = '<span class="ic">&#128165;</span><span style="color:' + vc + '">' + esc(v.name) + '</span>';
    el.innerHTML = h;
    H$.feed.insertBefore(el, H$.feed.firstChild);
    while (H$.feed.children.length > 5) H$.feed.removeChild(H$.feed.lastChild);
    setTimeout(function () { el.classList.add('fade'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450); }, 5000);
  }
  // floating damage numbers: ONE growing number per target (hits within 0.55 s add up and re-pop),
  // beside the buddy's head so it never sits on the name tag / health bar above it
  var numPool = [], numI = 0;
  for (var ni = 0; ni < 8; ni++) { var sp = document.createElement('span'); H$.nums.appendChild(sp); numPool.push({ el: sp, v: null, t: -1e9, amt: 0, head: false, anim: null }); }
  var PV = new T.Vector3();
  var NUM_FRAMES = [{ opacity: 1, transform: 'translate(-50%,-50%) scale(1.35)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.18 },
    { opacity: 1, transform: 'translate(-50%,-80%) scale(1)', offset: 0.6 }, { opacity: 0, transform: 'translate(-50%,-140%) scale(0.9)' }];
  function dmgNumber(v, amt, head) {
    if (!save.set.nums) return;
    var now = performance.now(), n = null;
    for (var i = 0; i < numPool.length; i++) if (numPool[i].v === v && now - numPool[i].t < 550) { n = numPool[i]; break; }
    if (!n) { n = numPool[numI]; numI = (numI + 1) % numPool.length; n.v = v; n.amt = 0; n.head = false; }
    n.amt += amt; n.t = now; n.head = n.head || head;
    PV.set(v.x, v.y + 1.35, v.z).project(camera);
    if (PV.z > 1) return;
    var el = n.el, x = (PV.x * 0.5 + 0.5) * W, y = (-PV.y * 0.5 + 0.5) * H;
    el.textContent = n.amt; el.className = n.head ? 'head' : '';
    el.style.left = x + 'px'; el.style.top = y + 'px';
    try { if (n.anim) n.anim.cancel(); n.anim = el.animate(NUM_FRAMES, { duration: 900, easing: 'ease-out', fill: 'forwards' }); } catch (e) { /* ignore */ }
  }
  // screen-edge paint when YOU get hit
  var dripA = 0;
  function drip(col, dx, dz) {
    var w = drips.width, h = drips.height;
    if (dripA < 0.05 || dripsDirty) { dctx.clearRect(0, 0, w, h); dripsDirty = false; }
    var r = Math.round(col[0] * 255), g = Math.round(col[1] * 255), b = Math.round(col[2] * 255);
    // side towards the attacker
    var a = Math.atan2(-dx, -dz) - camYaw, side = -Math.sin(a);
    dctx.fillStyle = 'rgba(' + Math.min(255, r + 40) + ',' + Math.min(255, g + 40) + ',' + Math.min(255, b + 40) + ',0.85)';
    var nb = dripA > 0.7 ? 1 : 2;
    for (var i = 0; i < nb; i++) {
      var edge = Math.random();
      var x, y;
      // stay near the screen edge on the attacker's side, never over the crosshair
      if (edge < 0.3) { x = side > 0.2 ? w - Math.random() * w * 0.2 : side < -0.2 ? Math.random() * w * 0.2 : (Math.random() < 0.5 ? Math.random() * w * 0.3 : w - Math.random() * w * 0.3); y = Math.random() * h * 0.12; }
      else if (edge < 0.8) { x = (side >= 0 ? w * 0.97 : w * 0.03) + (Math.random() - 0.5) * w * 0.06; y = h * 0.1 + Math.random() * h * 0.7; }
      else { x = Math.random() < 0.5 ? Math.random() * w * 0.25 : w - Math.random() * w * 0.25; y = h - Math.random() * h * 0.06; }
      var R = (0.022 + Math.random() * 0.03) * h;
      dctx.beginPath(); dctx.arc(x, y, R, 0, Math.PI * 2); dctx.fill();
      for (var k = 0; k < 4; k++) { dctx.beginPath(); dctx.arc(x + (Math.random() - 0.5) * R * 2.6, y + (Math.random() - 0.5) * R * 2.6, R * (0.2 + Math.random() * 0.3), 0, Math.PI * 2); dctx.fill(); }
      var dl = R * (1 + Math.random() * 2.5);
      dctx.fillRect(x - R * 0.18, y, R * 0.36, dl);
      dctx.beginPath(); dctx.arc(x, y + dl, R * 0.24, 0, Math.PI * 2); dctx.fill();
    }
    dripA = 1;
  }
  // directional hit indicators
  var dirs = [], dirI = 0;
  for (var di = 0; di < H$.dirs.length; di++) dirs.push({ el: H$.dirs[di], t: 9, x: 0, z: 0, a: -1, rot: 999 });
  function dmgDir(src) {
    if (!src) return;
    var d = dirs[dirI]; dirI = (dirI + 1) % dirs.length;
    d.t = 0; d.x = src.x; d.z = src.z; d.src = src;
  }
  // minimap background per map
  var mmBg = null, mmS = 160 / 44, mctx = H$.mm.getContext('2d'), mmT = 0;
  function buildMinimap() {
    var c = document.createElement('canvas'); c.width = c.height = 160;
    var g = c.getContext('2d'), Wd = G.W, s = mmS, o = 22;
    g.fillStyle = 'rgba(200,220,255,0.25)'; g.fillRect((o - 20) * s, (o - 20) * s, 40 * s, 40 * s);
    for (var i = 0; i < Wd.boxes.length; i++) {
      var b = Wd.boxes[i];
      if (b.noShot && b.noDecal && b.y1 > 10) continue;
      if (b.y0 > 3.5 || b.y1 - b.y0 < 0.1 && b.y1 < 0.3) continue;
      var hgt = b.y1;
      g.fillStyle = hgt > 2.2 ? 'rgba(40,44,110,0.85)' : hgt > 0.9 ? 'rgba(80,90,170,0.8)' : 'rgba(150,160,220,0.6)';
      g.fillRect((b.x0 + o) * s, (b.z0 + o) * s, Math.max(1, (b.x1 - b.x0) * s), Math.max(1, (b.z1 - b.z0) * s));
    }
    for (var r = 0; r < Wd.ramps.length; r++) { var R = Wd.ramps[r]; g.fillStyle = 'rgba(120,110,210,0.7)'; g.fillRect((R.x0 + o) * s, (R.z0 + o) * s, (R.x1 - R.x0) * s, (R.z1 - R.z0) * s); }
    mmBg = c;
  }
  function drawMinimap() {
    var p = G.player; if (!p || !mmBg) return;
    var g = mctx, s = mmS, o = 22;
    g.clearRect(0, 0, 160, 160);
    g.save();
    g.translate(80, 80); g.rotate(p.yaw);
    var px = camera.position.x, pz = camera.position.z;
    g.translate(-(px + o) * s, -(pz + o) * s);
    g.drawImage(mmBg, 0, 0);
    for (var i = 0; i < G.pickups.length; i++) {
      var q = G.pickups[i]; if (!q.active) continue;
      g.fillStyle = q.type === 'hp' ? '#ff3d6e' : q.type === 'ammo' ? '#3fb8ff' : '#ffc61a';
      g.beginPath(); g.arc((q.x + o) * s, (q.z + o) * s, 2.6, 0, 6.283); g.fill();
    }
    for (var j = 0; j < G.ents.length; j++) {
      var e = G.ents[j];
      if (e === p || !e.alive) continue;
      var mate = !G.enemy(p, e);
      if (!mate && !(G.t - e.lastFireT < 1.2 || (e.tag && e.tag.vis))) continue;
      g.fillStyle = mate ? '#5fb0ff' : '#ff4d8d';
      g.beginPath(); g.arc((e.x + o) * s, (e.z + o) * s, 3.4, 0, 6.283); g.fill();
    }
    g.restore();
    g.fillStyle = '#fff'; g.strokeStyle = '#1b1f4b'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(80, 72); g.lineTo(86, 88); g.lineTo(80, 84); g.lineTo(74, 88); g.closePath(); g.stroke(); g.fill();
  }
  // name tags
  function tagFor(e) {
    if (e.tag) return e.tag;
    var d = document.createElement('div');
    d.className = 'tag';
    d.innerHTML = '<span class="tn"></span><span class="tb"><b></b></span>';
    d.firstChild.textContent = e.name;
    H$.tags.appendChild(d);
    e.tag = { el: d, bar: d.lastChild.firstChild, on: false, vis: false, visT: Math.random() * 0.2, hp: -1, mate: null, x: -1, y: -1 };
    return e.tag;
  }
  function removeTag(e) { if (e.tag && e.tag.el.parentNode) e.tag.el.parentNode.removeChild(e.tag.el); e.tag = null; }
  function updateTags(dt) {
    var p = G.player, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (e === p) continue;
      var t = tagFor(e);
      var mate = p && !G.enemy(p, e);
      if (t.mate !== mate) { t.mate = mate; t.el.classList.toggle('mate', mate); }
      var want = false;
      if (e.alive && p && UI.state === 'play' && !p.zoom) {
        var dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
        if (mate) want = d2 < 3600;
        else {
          t.visT -= dt;
          if (t.visT <= 0) { t.visT = 0.15; t.vis = d2 < 34 * 34 && G.W.los(cx, cy, cz, e.x, e.y + 1.3, e.z); }
          want = t.vis;
        }
        if (want) {
          PV.set(e.x, e.y + 2.05, e.z).project(camera);
          if (PV.z > 1 || PV.x < -1.2 || PV.x > 1.2 || PV.y < -1.2 || PV.y > 1.2) want = false;
          else {
            var sx = Math.round((PV.x * 0.5 + 0.5) * W), sy = Math.round((-PV.y * 0.5 + 0.5) * H);
            if (sx !== t.x || sy !== t.y) { t.x = sx; t.y = sy; t.el.style.transform = 'translate(' + sx + 'px,' + sy + 'px) translate(-50%,-100%)'; }
            var hp = Math.ceil(e.hp);
            if (hp !== t.hp) { t.hp = hp; t.bar.style.transform = 'scaleX(' + (hp / 100) + ')'; }
          }
        }
      } else t.vis = false;
      if (want !== t.on) { t.on = want; t.el.classList.toggle('on', want); }
    }
  }
  function boardHTML() {
    var p = G.player, rows = G.ents.slice().sort(function (a, b) { return (a.team - b.team) * (G.mode === 'team' ? 1 : 0) || G.rankCmp(a, b); });
    var h = '<h3>' + (G.mode === 'team' ? 'الأزرق ' + ltr(G.teamScore[1]) + ' - ' + ltr(G.teamScore[2]) + ' البرتقالي' : 'النتائج') + '</h3><table><tr><th></th><th>الاسم</th><th>لطخات</th><th>تلطّخ</th><th>أفضل سلسلة</th></tr>';
    var lastTeam = -1, rank = 0;
    rows.forEach(function (e) {
      if (G.mode === 'team' && e.team !== lastTeam) { if (lastTeam >= 0) h += '<tr class="sep"><td colspan="5"></td></tr>'; lastTeam = e.team; rank = 0; }
      rank++;
      h += '<tr class="' + (e === p ? 'me ' : '') + (e.team ? 't' + e.team : '') + '"><td>' + rank + '</td><td class="n"><span class="dotc" style="background:' + hex(G.bodyColor(e)) + '"></span>' + esc(e.name) + '</td><td>' + e.kills + '</td><td>' + e.deaths + '</td><td>' + e.best + '</td></tr>';
    });
    return h + '</table>';
  }

  /* ============================================================ UI HOOKS (called by core) */
  var SP = { vol: 0, pan: 0 }, camYaw = 0;
  function spatial(x, y, z, range) {
    var dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > range || G.demo) { SP.vol = 0; return SP; }
    SP.vol = Math.min(1, 1.8 / (1 + d * 0.2)) * (1 - d / range);
    var a = Math.atan2(-dx, -dz) - camYaw;
    SP.pan = -Math.sin(a) * Math.min(1, d / 2) * 0.8;
    return SP;
  }
  var VM = { kick: 0, kickV: 0, swX: 0, swY: 0, bob: 0, land: 0, flashT: 0, sprint: 0, punch: 0, shake: 0, fovK: 0, zoomK: 0, stepY: 0, dip: 0, dipV: 0 };
  var heartT = 0, overAt = 0, streakShown = 0;
  G.ui = {
    matchStart: function () {
      if (G.demo) return;
      resetHudCache();
      for (var i = 0; i < G.ents.length; i++) if (G.ents[i] !== G.player) tagFor(G.ents[i]);
      buildMinimap();
      H$.feed.innerHTML = ''; H$.dead.hidden = true; $('board').hidden = true; hudEl.classList.remove('boardon'); $('lockHint').hidden = true;
      dripA = 0; drips.style.opacity = 0; dctx.clearRect(0, 0, drips.width, drips.height);
      for (var d = 0; d < dirs.length; d++) dirs[d].t = 9;
      setVmGun();
      VM.kick = VM.kickV = 0; vmW = -1;
      bigmsg('3', 900);
      sfx.count(3);
      streakShown = 0;
      if (save.matches < 3) setTimeout(function () { if (UI.state === 'play') hint('W A S D للحركة • انقر لتطلق • G بالون طلاء • R تعبئة', 6); }, 1200);
    },
    countdown: function (c) {
      if (G.demo) return;
      if (c > 0 && c < 3) { bigmsg(String(c), 900); sfx.count(c); }
      else if (c <= 0) { bigmsg('انطلق!', 1000, '#ffd23f'); sfx.count(0); }
    },
    respawned: function (e) {
      if (G.demo) return;
      H$.dead.hidden = true; sfx.shield(); setVmGun();
      VM.kick = 0; VM.dip = -0.2;
    },
    jumped: function () { if (!G.demo) sfx.jump(); },
    landed: function (e, v) { if (G.demo) return; if (v > 4) { sfx.land(v > 11); VM.dipV -= Math.min(2.5, v * 0.12); VM.land = Math.min(1, v / 12); } },
    step: function (e) {
      if (G.demo) return;
      var surf = G.map.def.step;
      if (e.gBox === null && e.y > 1.5 && G.mapIdx === 1) surf = 'metal';
      if (e.isPlayer) sfx.step(surf, 0.55, 0);
      else { var s = spatial(e.x, e.y, e.z, 20); if (s.vol > 0.05) sfx.step(surf, s.vol * 0.8, s.pan); }
    },
    fired: function (e, w, mz) {
      if (G.demo) return;
      if (e.isPlayer) {
        sfx.fire(w, 1, 0, true);
        VM.kickV += w === 0 ? 1.6 : 4.2; VM.flashT = 0.05; VM.punch += w === 0 ? 0.004 : 0.02;
        vmFlash.rotation.z = Math.random() * 6.28; vmFlash.scale.setScalar(w === 1 ? 1.5 : w === 2 ? 1.2 : 0.9 + Math.random() * 0.3);
      } else {
        var s = spatial(e.x, e.y, e.z, 45);
        if (s.vol > 0.03) sfx.fire(w, s.vol * 0.7, s.pan, false);
        if (s.vol > 0) G.fx.burst(mz.x, mz.y, mz.z, G.paint(e), 2, 1.5, 0.05, 0.5);
      }
    },
    reload: function (e) { sfx.reload(e.wpn); if (hintT > 0 && H$.hint.textContent.indexOf('R') >= 0) hintT = 0.01; },
    reloaded: function () { sfx.reloadDone(); },
    swapped: function (e) { sfx.swap(); setVmGun(); hudC.wpn = -1; },
    empty: function () { sfx.empty(); hint('لا يوجد طلاء! التقط علبة طلاء أو بدّل البخّاخ', 1.6); },
    threw: function (e) { if (G.demo) return; if (e.isPlayer) sfx.throwB(); },
    balloonPop: function (x, y, z, owner) {
      if (G.demo) return;
      var s = spatial(x, y, z, 50);
      if (s.vol > 0.02) sfx.balloon(Math.min(1, s.vol * 1.3), s.pan);
      var p = G.player; if (p) { var d = Math.sqrt((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z)); if (d < 9) VM.shake = Math.max(VM.shake, (1 - d / 9) * 0.5); }
    },
    wallHit: function (x, y, z, src) {
      if (G.demo) return;
      var s = spatial(x, y, z, 14);
      if (s.vol > 0.1 && (src && src.isPlayer || s.vol > 0.35)) sfx.wallSplat(s.vol * 0.8, s.pan);
    },
    shieldHit: function (v, src) { if (src && src.isPlayer) { sfx.shieldHit(); H$.hit.className = 'shield'; play(H$.hit, 'hm', [{ opacity: 1, transform: 'scale(1.2)' }, { opacity: 0, transform: 'scale(1)' }], { duration: 220 }); } },
    hitMarker: function (v, amt, head, kill, w) {
      H$.hit.className = kill ? 'kill' : head ? 'head' : '';
      play(H$.hit, 'hm', [{ opacity: 1, transform: 'scale(' + (head || kill ? 1.5 : 1.2) + ')' }, { opacity: 1, transform: 'scale(1)', offset: 0.35 }, { opacity: 0, transform: 'scale(1)' }], { duration: head || kill ? 360 : 240 });
      sfx.hitTick(head);
      var s = spatial(v.x, v.y, v.z, 40); sfx.squelch(Math.max(0.3, s.vol), s.pan);
      dmgNumber(v, amt, head);
    },
    hurt: function (v, src, amt, dx, dz) {
      sfx.hurt(Math.min(1, 0.5 + amt / 40));
      drip(src ? G.paint(src) : [1, 0.3, 0.6], src ? src.x - v.x : 0, src ? src.z - v.z : 1);
      if (src && src !== v) dmgDir(src);
      VM.shake = Math.max(VM.shake, Math.min(0.35, amt / 90));
      H$.hpBox.classList.remove('hit'); void H$.hpBox.offsetWidth; H$.hpBox.classList.add('hit');
    },
    splat: function (v, src, head, w, first, revenge) {
      if (G.demo) return;
      var s = spatial(v.x, v.y, v.z, 50);
      if (s.vol > 0.02 && !v.isPlayer) sfx.pop(Math.min(1, s.vol * 1.4), s.pan);
      feed(src, v, head, w);
      if (src && src.isPlayer && v !== src) {
        sfx.confirm(src.multi);
        toast(ltr('+1') + ' لطّخت ' + v.name + '!', '#ffd23f');
        var m = src.multi;
        if (m === 2) { callout('ضربة مزدوجة!', '', '#ffd23f'); sfx.callout(1); }
        else if (m === 3) { callout('ثلاثية!', '', '#ff9f1c'); sfx.callout(2); }
        else if (m >= 4) { callout('رباعية خارقة!', '', '#ff5f9e'); sfx.callout(3); }
        else if (src.streak === 3 && streakShown < 3) { callout('سلسلة رائعة!', '3 لطخات متتالية', '#7dffcf'); sfx.callout(1); }
        else if (src.streak === 5) { callout('لا يمكن إيقافك!', '5 لطخات متتالية', '#ff5f9e'); sfx.callout(3); }
        else if (src.streak === 8) { callout('أسطورة الطلاء!', '8 لطخات متتالية', '#ffd23f'); sfx.callout(3); }
        else if (first) { callout('أول لطخة!', '', '#7dffcf'); sfx.callout(1); }
        else if (revenge) { callout('انتقام!', '', '#ff9f1c'); sfx.callout(1); }
        else if (head) { callout('في الرأس!', '', '#ffd23f'); }
        streakShown = src.streak;
      }
      if (v.isPlayer) {
        sfx.splatted();
        H$.dead.hidden = false;
        H$.deadBy.textContent = src && src !== v ? 'لطّخك ' + src.name + '!' : 'انفجر بالونك!';
        H$.deadBy.style.color = src ? hex(G.bodyColor(src)) : '#fff';
        hudC.deadN = -1; UI.aimingThrow = false;
        deathCam.t = 0; deathCam.x = camera.position.x; deathCam.y = camera.position.y; deathCam.z = camera.position.z; deathCam.yaw = camYaw; deathCam.pitch = camera.rotation.x; deathCam.killer = src && src !== v ? src : null;
      }
    },
    picked: function (e, p) {
      if (G.demo) return;
      if (e.isPlayer) {
        sfx.pickup(p.type);
        if (p.type === 'hp') toast('+50 صحة', '#ff8fb8'); else if (p.type === 'ammo') toast('طلاء كامل! +1 بالون', '#8fe8ff'); else { callout('طلاء خارق ×2!', '12 ثانية', '#ffd23f'); sfx.callout(2); }
      } else {
        var s = spatial(p.x, p.y, p.z, 25); if (s.vol > 0.2 && p.type === 'power') sfx.pickup('power');
      }
    },
    matchEnding: function () {
      var R = G.results();
      bigmsg('انتهت المباراة!', 1600, '#ffd23f');
      $('pauseBtn').hidden = true;
      sfx.roundEnd(R.win === 1);
      UI.aimingThrow = false;
      if (G.player) G.player.zoom = false;
    },
    muzzle: function (out) {
      PV.copy(vmMuzzle).applyMatrix4(vmRoot.matrix);          // view-model space == camera space
      // the view model is drawn with its own narrower FOV: rescale so the blob starts where the barrel shows
      var k = Math.tan(camera.fov * Math.PI / 360) / Math.tan(vmCam.fov * Math.PI / 360);
      PV.x *= k; PV.y *= k;
      PV.applyMatrix4(camera.matrixWorld);
      out.x = PV.x; out.y = PV.y; out.z = PV.z;
    },
    // a sniper bot scoped in on you: a soft "ting" from its direction (the glint shows at the same time)
    botScope: function (e) {
      var p = G.player;
      if (G.demo || !p || !p.alive || e.bot.target !== p) return;
      var s = spatial(e.x, e.y, e.z, 55);
      if (s.vol > 0) sfx.glint(Math.min(1, 0.35 + s.vol * 2), s.pan);
    },
    removeTag: removeTag
  };

  /* ================================================================ RESULTS */
  function showResults() {
    UI.resultsShown = true; UI.state = 'over';
    releaseLock(); setPlaying(false);
    hudEl.hidden = true; $('pauseBtn').hidden = true;
    var R = G.results(), p = G.player;
    var title, sub = '';
    if (R.team) {
      title = R.win === 1 ? 'فاز فريقك! &#127942;' : R.win === 2 ? 'فاز الفريق البرتقالي' : 'تعادل!';
      sub = 'الأزرق ' + ltr(R.scores[1]) + ' - ' + ltr(R.scores[2]) + ' البرتقالي';
    } else {
      var tied = R.tie.length > 0;
      if (tied) {
        title = R.place === 1 ? 'تعادل على المركز الأول!' : 'تعادل على المركز ' + R.place;
        sub = 'مع ' + R.tie.slice(0, 2).map(function (e) { return esc(e.name); }).join(' و') + (R.tie.length > 2 ? ' وغيرهم' : '');
      } else {
        title = R.place === 1 ? 'فزت! &#127942;' : R.place === 2 ? 'المركز الثاني!' : R.place === 3 ? 'المركز الثالث!' : 'المركز ' + R.place;
        var lead = R.list[0];
        sub = R.place === 1 ? 'أنت بطل الساحة!' : 'الأول: ' + esc(lead.name) + ' (' + lead.kills + ')';
      }
    }
    $('oTitle').innerHTML = title; $('oSub').innerHTML = sub;
    var acc = p.shots ? Math.round(p.hits / p.shots * 100) : 0;
    var stats = [[p.kills, 'لطخات'], [p.deaths, 'تلطّخت'], [acc + '%', 'الدقة'], [p.best, 'أفضل سلسلة'], [p.heads, 'في الرأس'], [G.stats.pickups, 'التقاطات']];
    $('oStats').innerHTML = stats.map(function (s) { return '<div class="ostat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
    // rewards
    var won = R.win === 1;
    var coins = 10 + p.kills * 5 + p.heads * 2 + (R.team ? (R.win === 1 ? 35 : R.win === 0 ? 15 : 0) : (R.tie.length ? [0, 30, 20, 12] : [0, 40, 25, 15])[R.place] || 0);
    coins = Math.round(coins * [1, 1.25, 1.5][G.diff]);
    var xp = 20 + p.kills * 10 + p.heads * 5 + (won ? 50 : 0);
    var best = p.kills > save.bestSplats && p.kills > 0;
    if (best) save.bestSplats = p.kills;
    if (p.best > save.bestStreak) save.bestStreak = p.best;
    save.matches++; if (won) save.wins++;
    save.coins += coins;
    save.xp += xp;
    var ups = 0, bonus = 0;
    while (save.xp >= needXp(save.level)) { save.xp -= needXp(save.level); save.level++; ups++; bonus += 25; }
    save.coins += bonus;
    persist();
    $('oBest').hidden = !best;
    $('oLevel').textContent = save.level;
    $('oXpT').textContent = ltr('+' + xp + ' XP');
    $('oXp').style.width = '0%';
    setTimeout(function () { $('oXp').style.width = Math.round(save.xp / needXp(save.level) * 100) + '%'; }, 60);
    $('oLevelUp').hidden = !ups;
    if (ups) { $('oLevelUp').innerHTML = 'مستوى جديد! المستوى ' + save.level + ' &#127881; ' + ltr('+' + bonus) + ' <span class="coin"></span>'; setTimeout(function () { sfx.level(); }, 700); }
    coinAnim = { from: 0, to: coins, t: 0 };
    $('oCoins').textContent = '+0';
    // podium: top three (winning team first in team mode)
    var top = R.team ? R.list.filter(function (e) { return e.team === (R.win || 1); }).concat(R.list.filter(function (e) { return e.team !== (R.win || 1); })) : R.list;
    var tagsH = '';
    for (var i = 0; i < 3; i++) {
      var e = top[i], d = podDolls[i];
      d.g.visible = !!e;
      if (!e) continue;
      dressDoll(d, { color: G.bodyColor(e), hat: e.hat, skin: e.skin, wpn: e.prefW, accent: e.accent });
      d.g.position.set(POD_X[i], POD_Y[i], 0);
      d.g.rotation.y = Math.PI - POD_X[i] * 0.18;
      d.e = e;
      tagsH += '<div class="ptag' + (e === p ? ' me' : '') + '" data-i="' + i + '">' + esc(e.name) + '<small>' + e.kills + ' لطخة</small></div>';
    }
    $('podTags').innerHTML = tagsH;
    podTagEls = $('podTags').children;
    moveConfetti(podScene);
    G.fx.clear();
    podT = 0;
    show('over');
    overAt = performance.now();
    music.play('menu');
  }
  var coinAnim = null, podT = 0, podTagEls = null;
  function moveConfetti(sc) { if (G.fx.conf.parent !== sc) sc.add(G.fx.conf); }

  /* ================================================================ CAMERA + VIEW MODEL */
  var deathCam = { t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, killer: null };
  var fovCur = save.set.fov, titleA = 0.6, dollSpin = 0;
  var QY = new T.Vector3();
  function updateCamera(dt, alpha) {
    var p = G.player;
    if (UI.state === 'play' && p) {
      if (p.alive) {
        var x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha, z = p.pz + (p.z - p.pz) * alpha;
        p.stepUp *= Math.exp(-14 * dt); if (Math.abs(p.stepUp) < 0.002) p.stepUp = 0;
        // landing dip spring (sub-stepped so a slow frame can never make it blow up)
        springs(dt);
        var hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
        var bob = save.set.bob && p.grounded ? Math.sin(p.walk * 2.2) * 0.035 * Math.min(1, hs / 6) : 0;
        camera.position.set(x, y + SS.EYE_H + p.stepUp + VM.dip * 0.25 + bob, z);
        VM.punch *= Math.exp(-12 * dt);
        VM.shake *= Math.exp(-7 * dt);
        var sh = VM.shake * 0.04;
        camYaw = p.yaw + p.ry;
        camera.rotation.set(p.pitch + p.rp + VM.punch + (Math.random() - 0.5) * sh, camYaw + (Math.random() - 0.5) * sh, 0);
        // FOV: sprint kick, sniper zoom
        var target = save.set.fov + (p.sprinting ? 7 : 0);
        VM.zoomK += ((p.zoom ? 1 : 0) - VM.zoomK) * Math.min(1, dt * 14);
        target = target / (1 + (WEAPONS[2].zoom - 1) * VM.zoomK);
        if (Math.abs(fovCur - target) > 0.01) { fovCur += (target - fovCur) * Math.min(1, dt * 10); camera.fov = fovCur; camera.updateProjectionMatrix(); }
      } else {
        // splatted: float up and look at whoever did it
        deathCam.t += dt;
        var k = Math.min(1, deathCam.t * 1.6);
        camera.position.set(deathCam.x, deathCam.y + k * 1.4, deathCam.z);
        var yaw = deathCam.yaw, pit = deathCam.pitch;
        var K = deathCam.killer;
        if (K && K.alive) {
          var dx = K.x - deathCam.x, dz = K.z - deathCam.z, dy = K.y + 1.2 - (deathCam.y + k * 1.4);
          var ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
          var dyw = ty - yaw; while (dyw > Math.PI) dyw -= 6.283; while (dyw < -Math.PI) dyw += 6.283;
          yaw += dyw * k; pit += (tp - pit) * k;
        } else pit += (-0.5 - pit) * k;
        camYaw = yaw;
        camera.rotation.set(pit, yaw, 0.12 * k);
        VM.zoomK = 0;
        if (Math.abs(fovCur - save.set.fov) > 0.01) { fovCur += (save.set.fov - fovCur) * Math.min(1, dt * 10); camera.fov = fovCur; camera.updateProjectionMatrix(); }
      }
    } else if (UI.state === 'title' || UI.state === 'locker' || UI.state === 'settings' || UI.state === 'howto') {
      titleA += dt * 0.045;
      var r = 25;
      camera.position.set(Math.sin(titleA) * r, 11.5, Math.cos(titleA) * r);
      camera.lookAt(0, 1.2, 0);
      camYaw = titleA;
      if (Math.abs(camera.fov - 60) > 0.1) { camera.fov = 60; fovCur = 60; camera.updateProjectionMatrix(); }
    }
    camera.updateMatrixWorld();
  }
  function updateVM(dt) {
    var p = G.player; if (!p) return;
    setVmGun();
    var w = p.wpn, base = VM_BASE[w];

    // sway from mouse movement
    var mdx = clamp(mouse.dx, -80, 80), mdy = clamp(mouse.dy, -80, 80); mouse.dx = mouse.dy = 0;
    var k = Math.exp(-9 * dt);
    VM.swX = VM.swX * k - mdx * 0.00022; VM.swY = VM.swY * k + mdy * 0.00022;
    VM.swX = clamp(VM.swX, -0.05, 0.05); VM.swY = clamp(VM.swY, -0.05, 0.05);
    var hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz), mv = p.grounded ? Math.min(1, hs / RUNS) : 0;
    VM.bob += dt * hs * 1.25;
    var bx = Math.sin(VM.bob) * 0.011 * mv, by = -Math.abs(Math.cos(VM.bob)) * 0.01 * mv;
    VM.sprint += ((p.sprinting ? 1 : 0) - VM.sprint) * Math.min(1, dt * 9);
    var W0 = WEAPONS[w];
    var rel = p.reloadT > 0 ? Math.sin((1 - p.reloadT / W0.reload) * Math.PI) : 0;
    var swp = p.swapT > 0 ? p.swapT / 0.3 : 0;
    var thr = UI.aimingThrow ? 1 : 0;
    VM.land *= Math.exp(-8 * dt);
    vmRoot.position.set(base[0] + VM.swX + bx - VM.sprint * 0.03, base[1] + VM.swY + by - rel * 0.09 - swp * 0.18 - VM.sprint * 0.02 - VM.land * 0.03 - thr * 0.07 + VM.dip * 0.06, base[2] + VM.kick * 0.06);
    vmRoot.rotation.set(0.02 + VM.kick * 0.6 - rel * 0.35 - VM.sprint * 0.18 + VM.swY * 2, 0.09 + VM.sprint * 0.55 + VM.swX * 2 - thr * 0.2, 0.04 + rel * 0.55 + VM.swX * 1.5);
    vmRoot.updateMatrix();
    VM.flashT -= dt;
    vmFlash.visible = VM.flashT > 0;
    vmBalloon.visible = UI.aimingThrow;
    if (UI.aimingThrow) { var pc = G.paint(p); vmBalloon.rotation.y += dt * 2; vmBalloon.material.color.setRGB(Math.min(1, pc[0] * 1.2), Math.min(1, pc[1] * 1.2), Math.min(1, pc[2] * 1.2)); vmBalloon.position.y = -0.13 + Math.sin(performance.now() / 300) * 0.006; }
    var glow = p.power > 0 ? 0.25 + Math.sin(performance.now() / 120) * 0.1 : 0;
    vmMat.emissive.setRGB(glow, glow * 0.8, 0);
    vmL.h.color.copy(G.hemi.color); vmL.h.groundColor.copy(G.hemi.groundColor); vmL.h.intensity = G.hemi.intensity;
    vmL.d.color.copy(G.sun.color); vmL.d.intensity = G.sun.intensity;
  }
  var RUNS = G.MOVE.RUN;
  function springs(dt) {
    for (var t = Math.min(dt, 0.25); t > 1e-6; t -= 1 / 240) {
      var h = Math.min(t, 1 / 240);
      VM.dipV += (-VM.dip * 90 - VM.dipV * 14) * h; VM.dip += VM.dipV * h;
      VM.kickV += (-VM.kick * 170 - VM.kickV * 20) * h; VM.kick += VM.kickV * h;
    }
    VM.dip = clamp(VM.dip, -0.6, 0.3); VM.kick = clamp(VM.kick, -0.3, 0.5);
    if (VM.dip !== VM.dip) VM.dip = VM.dipV = 0;
    if (VM.kick !== VM.kick) VM.kick = VM.kickV = 0;
  }

  /* ================================================================ WORLD DRAW */
  var fx = G.fx;
  function drawWorld(dt, alpha) {
    var E = G.ents, feetA = G.feet.instanceMatrix.array, feetC = G.feet.instanceColor.array, fi = 0;
    var sh = fx.shadows.instanceMatrix.array, si = 0, shA = fx.shields.instanceMatrix.array, shi = 0;
    var stA = G.stainMesh.instanceMatrix.array, stC = G.stainMesh.instanceColor.array, sti = 0, gi = 0;
    var now = performance.now() / 1000;
    for (var i = 0; i < E.length; i++) {
      var e = E[i];
      if (!e.mesh) continue;
      var fp = e.isPlayer && UI.state === 'play';
      if (!e.alive || fp) { e.mesh.visible = false; continue; }
      e.mesh.visible = true;
      var x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha, z = e.pz + (e.z - e.pz) * alpha;
      var hs = Math.sqrt(e.vx * e.vx + e.vz * e.vz), mv = Math.min(1, hs / 5);
      var bob = e.grounded ? Math.abs(Math.sin(e.walk * 1.9)) * 0.08 * mv : 0;
      var sq = (e.grounded ? 1 - bob * 0.35 : 1.06) - (e.flash > 0 ? e.flash * 0.9 : 0);
      e.mesh.position.set(x, y + bob, z);
      e.mesh.rotation.set(0, e.yaw, 0);
      e.body.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
      // lean into movement
      var fwd = (-Math.sin(e.yaw) * e.vx - Math.cos(e.yaw) * e.vz) / 8, side = (Math.cos(e.yaw) * e.vx - Math.sin(e.yaw) * e.vz) / 8;
      e.body.rotation.set(-fwd * 0.25, 0, -side * 0.2);
      if (e.kick > 0) e.kick = Math.max(0, e.kick - dt * 9);
      e.gunPivot.rotation.x = e.pitch + e.kick * 0.22;
      e.gunPivot.position.y = 0.98 + bob * 0.3;
      e.gunPivot.position.z = -0.2 + e.kick * 0.07;
      var fl = e.flash > 0 ? e.flash * 6 : 0;
      if (fl !== e.flashShown) { e.flashShown = fl; e.body.material.emissive.setRGB(fl, fl, fl); }
      // feet
      var cy = Math.cos(e.yaw), sy = Math.sin(e.yaw), ph = e.walk * 1.9;
      for (var f = 0; f < 2; f++) {
        var sgn = f ? 1 : -1, stride = Math.sin(ph + f * Math.PI) * 0.2 * mv, lift = Math.max(0, Math.cos(ph + f * Math.PI)) * 0.1 * mv;
        var lx = sgn * 0.19, lz = -stride;
        var wx = x + lx * cy + lz * sy, wz = z - lx * sy + lz * cy;
        var o = fi * 16;
        feetA[o] = cy; feetA[o + 1] = 0; feetA[o + 2] = -sy; feetA[o + 3] = 0;
        feetA[o + 4] = 0; feetA[o + 5] = 1; feetA[o + 6] = 0; feetA[o + 7] = 0;
        feetA[o + 8] = sy; feetA[o + 9] = 0; feetA[o + 10] = cy; feetA[o + 11] = 0;
        feetA[o + 12] = wx; feetA[o + 13] = y + lift + (e.grounded ? 0 : 0.05); feetA[o + 14] = wz; feetA[o + 15] = 1;
        var fc = e.footCol || (e.footCol = SS.lin(SS.shade(G.bodyColor(e), 0.8)));
        feetC[fi * 3] = fc[0]; feetC[fi * 3 + 1] = fc[1]; feetC[fi * 3 + 2] = fc[2];
        fi++;
      }
      // blob shadow on the ground below
      var gy = e.grounded ? e.y : G.W.ground(e.x, e.z, 0.3, e.y + 0.1);
      var ss = 1.25 - Math.min(0.6, (y - gy) * 0.15);
      SS.mTS(sh, si++, x, gy + 0.03, z, ss, 1, ss);
      if (e.shield > 0) { var sc = 1.08 + Math.sin(now * 9) * 0.03; SS.mTS(shA, shi++, x, y + 0.9, z, sc, sc * 1.02, sc); }
      if (e.zoom && e.bot && gi < 10) gi = glint(e, x, y, z, gi, now);
      // paint stains ride along with the buddy (same squash as the body)
      for (var st = 0; st < e.stainN && sti < 72; st++) {
        var lx2 = e.stains[st * 4], ly2 = e.stains[st * 4 + 1], lz2 = e.stains[st * 4 + 2], ss2 = e.stains[st * 4 + 3], so = sti * 16;
        stA[so] = ss2; stA[so + 5] = ss2 * 0.8; stA[so + 10] = ss2; stA[so + 15] = 1;
        var sxz = 1 + (1 - sq) * 0.5;
        stA[so + 12] = x + (lx2 * cy + lz2 * sy) * sxz; stA[so + 13] = y + bob + ly2 * sq; stA[so + 14] = z + (lz2 * cy - lx2 * sy) * sxz;
        var scl = e.stainCol[st]; stC[sti * 3] = scl[0]; stC[sti * 3 + 1] = scl[1]; stC[sti * 3 + 2] = scl[2];
        sti++;
      }
      if (e.power > 0 && Math.random() < dt * 12) fx.burst(x + (Math.random() - 0.5) * 0.8, y + 0.6 + Math.random() * 1.2, z + (Math.random() - 0.5) * 0.8, [1, 0.85, 0.2], 1, 1.2, 0.05, 1.5);
    }
    G.feet.count = fi; SS.upload(G.feet.instanceMatrix, fi * 16); SS.upload(G.feet.instanceColor, fi * 3);
    G.stainMesh.count = sti; SS.upload(G.stainMesh.instanceMatrix, sti * 16); SS.upload(G.stainMesh.instanceColor, sti * 3);
    // balloons in flight + their shadows
    var ba = G.balloonMesh.instanceMatrix.array, bc = G.balloonMesh.instanceColor.array, bn = 0;
    for (var b = 0; b < G.balloons.length; b++) {
      var B = G.balloons[b];
      if (!B.on) continue;
      var wob = 1 + Math.sin(B.spin * 3) * 0.08;
      SS.mTS(ba, bn, B.x, B.y, B.z, wob, 2 - wob, wob);
      bc[bn * 3] = Math.min(1, B.col[0] * 1.2); bc[bn * 3 + 1] = Math.min(1, B.col[1] * 1.2); bc[bn * 3 + 2] = Math.min(1, B.col[2] * 1.2);
      bn++;
      if (si < 24) { var bg = G.W.ground(B.x, B.z, 0.1, B.y); SS.mTS(sh, si++, B.x, bg + 0.03, B.z, 0.5, 1, 0.5); }
    }
    G.balloonMesh.count = bn; SS.upload(G.balloonMesh.instanceMatrix, bn * 16); SS.upload(G.balloonMesh.instanceColor, bn * 3);
    fx.shadows.count = si; SS.upload(fx.shadows.instanceMatrix, si * 16);
    fx.shields.count = shi; SS.upload(fx.shields.instanceMatrix, shi * 16);
    fx.glints.count = gi; SS.upload(fx.glints.instanceMatrix, gi * 16);
    // paint shots in flight: stretched blobs along their direction
    var S = G.shots, sa = fx.shots.instanceMatrix.array, scol = fx.shots.instanceColor.array;
    for (var j = 0; j < S.n; j++) {
      var dx = S.dx[j], dy = S.dy[j], dz = S.dz[j], s0 = S.size[j], L = Math.min(S.left[j], s0 * 7);
      var ux = dz, uz = -dx, ul = Math.sqrt(ux * ux + uz * uz) || 1; ux /= ul; uz /= ul;
      var vx = dy * uz, vy = dz * ux - dx * uz, vz = -dy * ux;
      var hl = L * 0.5 > s0 ? L * 0.5 : s0, o = j * 16;
      sa[o] = ux * s0; sa[o + 1] = 0; sa[o + 2] = uz * s0; sa[o + 3] = 0;
      sa[o + 4] = vx * s0; sa[o + 5] = vy * s0; sa[o + 6] = vz * s0; sa[o + 7] = 0;
      sa[o + 8] = dx * hl; sa[o + 9] = dy * hl; sa[o + 10] = dz * hl; sa[o + 11] = 0;
      sa[o + 12] = S.x[j] - dx * L * 0.5; sa[o + 13] = S.y[j] - dy * L * 0.5; sa[o + 14] = S.z[j] - dz * L * 0.5; sa[o + 15] = 1;
      var c = S.col[j]; scol[j * 3] = Math.min(1, c[0] * 1.15 + 0.08); scol[j * 3 + 1] = Math.min(1, c[1] * 1.15 + 0.08); scol[j * 3 + 2] = Math.min(1, c[2] * 1.15 + 0.08);
    }
    fx.shots.count = S.n; SS.upload(fx.shots.instanceMatrix, S.n * 16); SS.upload(fx.shots.instanceColor, S.n * 3);
    // pickups bob and spin
    for (var q = 0; q < G.pickups.length; q++) {
      var P = G.pickups[q];
      P.mesh.visible = P.active;
      if (P.active) { P.mesh.rotation.y = now * 1.6 + P.ph; P.mesh.position.y = P.y + 0.8 + Math.sin(now * 2.2 + P.ph) * 0.1; }
    }
    // balloon arc preview
    var p = G.player;
    if (UI.state === 'play' && p && p.alive && UI.aimingThrow) drawArc(p); else { fx.arc.count = 0; fx.ring.visible = false; }
    G.updateBelts(dt);
    var sky = G.sky; sky.position.copy(camera.position);
    fx.update(dt, camera.position.x, camera.position.y, camera.position.z);
  }
  // scope glint on a scoped sniper bot's front lens, only when it points roughly at the camera. It swells
  // while the bot charges its shot, so a kid can see it coming and duck behind something.
  function glint(e, x, y, z, i, now) {
    var cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
    var gx = x + 0.2 * cy - 0.5 * sy, gy = y + 1.17, gz = z - 0.2 * sy - 0.5 * cy;
    var cx = camera.position.x - gx, cyy = camera.position.y - gy, cz = camera.position.z - gz, d = Math.sqrt(cx * cx + cyy * cyy + cz * cz) || 1;
    var cp = Math.cos(e.pitch), face = (-sy * cp * cx + Math.sin(e.pitch) * cyy - cy * cp * cz) / d;
    if (face < 0.75) return i;
    var charge = Math.min(1, e.bot.zoomT / e.bot.D.scope);
    var s = (0.2 + d * 0.04) * (0.6 + 0.4 * charge) * (0.85 + 0.15 * Math.sin(now * 22)) * (face - 0.55) / 0.45;
    var m = camera.matrixWorld.elements;
    SS.mB(fx.glints.instanceMatrix.array, i, gx, gy, gz, m[0] * s, m[1] * s, m[2] * s, m[4] * s, m[5] * s, m[6] * s, m[8], m[9], m[10]);
    return i + 1;
  }
  var AV = { x: 0, y: 0, z: 0 }, AS = { x: 0, y: 0, z: 0 }, arh = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
  function drawArc(p) {
    G.throwStart(p, AS); G.throwVel(p, AV);
    var x = AS.x, y = AS.y, z = AS.z, vx = AV.x, vy = AV.y, vz = AV.z, a = fx.arc.instanceMatrix.array, n = 0, dt = 0.035;
    var hit = false;
    for (var i = 0; i < 90 && n < 40; i++) {
      vy -= SS.BALLOON.grav * dt;
      var sx = vx * dt, sy = vy * dt, sz = vz * dt, L = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (G.W.ray(x, y, z, sx / L, sy / L, sz / L, L, arh, true)) {
        x += sx / L * arh.t; y += sy / L * arh.t; z += sz / L * arh.t; hit = true; break;
      }
      x += sx; y += sy; z += sz;
      if (i % 2 === 1) { var s = 1 - n / 60; SS.mTS(a, n++, x, y, z, s, s, s); }
    }
    fx.arc.count = n; SS.upload(fx.arc.instanceMatrix, n * 16);
    fx.ring.visible = hit;
    if (hit) {
      fx.ring.position.set(x + arh.nx * 0.03, y + arh.ny * 0.03, z + arh.nz * 0.03);
      QY.set(arh.nx, arh.ny, arh.nz);
      fx.ring.quaternion.setFromUnitVectors(UPV, QY);
      var r = SS.BALLOON.radius / 0.95 * 0.9; fx.ring.scale.set(r, r, r);
    }
  }
  var UPV = new T.Vector3(0, 1, 0);

  /* ================================================================ HUD PER FRAME */
  var boardT = 0, lastHeart = 0;
  function hud(dt) {
    var p = G.player; if (!p) return;
    var paused = UI.paused;
    if (paused) dt = 0;            // hint / damage-arc / drip timers wait while paused
    var hp = Math.max(0, Math.ceil(p.hp));
    if (hp !== hudC.hp) {
      hudC.hp = hp; H$.hpNum.textContent = hp; H$.hpBar.style.transform = 'scaleX(' + (hp / 100) + ')';
      var cls = hp > 60 ? '' : hp > 30 ? 'mid' : 'low';
      if (cls !== hudC.hpCls) { H$.hpBox.classList.remove('mid', 'low'); if (cls) H$.hpBox.classList.add(cls); hudC.hpCls = cls; }
    }
    var W0 = WEAPONS[p.wpn], am = p.ammo[p.wpn], rs = p.res[p.wpn];
    if (am !== hudC.ammo || rs !== hudC.res || p.wpn !== hudC.wpn) {
      if (p.wpn !== hudC.wpn) { H$.wpnName.textContent = W0.name; for (var s = 0; s < H$.slots.length; s++) H$.slots[s].classList.toggle('on', s === p.wpn); }
      hudC.ammo = am; hudC.res = rs; hudC.wpn = p.wpn;
      H$.ammoNum.textContent = am; H$.ammoRes.textContent = rs;
      H$.ammoNum.classList.toggle('low', am <= Math.ceil(W0.mag * 0.25));
      if (am === 0 && rs > 0 && p.alive && p.reloadT <= 0) hint('اضغط R لإعادة التعبئة', 1.5);
    }
    if (p.balloons !== hudC.bal) { hudC.bal = p.balloons; H$.balN.textContent = p.balloons; }
    // timer + score
    var rem = Math.max(0, Math.ceil(G.limit - G.matchT));
    if (rem !== hudC.sec) {
      hudC.sec = rem;
      H$.timer.textContent = Math.floor(rem / 60) + ':' + ('0' + rem % 60).slice(-2);
      H$.timer.classList.toggle('low', rem <= 30 && !G.over);
    }
    var sa, sb;
    if (G.mode === 'team') { sa = G.teamScore[1]; sb = G.teamScore[2]; }
    else { sb = 0; for (var i = 0; i < G.ents.length; i++) if (G.ents[i] !== p && G.ents[i].kills > sb) sb = G.ents[i].kills; sa = p.kills; }
    if (sa !== hudC.sa || sb !== hudC.sb) {
      hudC.sa = sa; hudC.sb = sb;
      if (G.mode === 'team') H$.scorebar.innerHTML = '<div class="tbar"><span class="ts t1">' + sa + '</span><span class="of">الهدف ' + G.target + '</span><span class="ts t2">' + sb + '</span></div>';
      else H$.scorebar.innerHTML = '<div class="sb me">أنت <b>' + sa + '</b></div><div class="sb">الأعلى <b>' + sb + '</b></div><div class="sb">الهدف <b>' + G.target + '</b></div>';
    }
    // crosshair: gap follows the real spread; turns pink over an enemy
    var hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    var spread = (p.wpn === 2 && p.zoom ? W0.zoomSpread : W0.spread) + Math.min(1, hs / RUNS) * W0.moveSpread + (p.grounded ? 0 : W0.airSpread) + p.bloom;
    var gap = Math.round(clamp(Math.tan(spread) / Math.tan(camera.fov * Math.PI / 360) * H / 2, 4, 90));
    if (gap !== hudC.gap) { hudC.gap = gap; H$.xhair.style.setProperty('--gap', gap + 'px'); }
    var xh = p.alive && !p.zoom && !UI.aimingThrow;
    if (xh !== hudC.xh) { hudC.xh = xh; H$.xhair.classList.toggle('hide', !xh); }
    enemyT -= dt;
    if (enemyT <= 0 && p.alive) {
      enemyT = 0.05;
      var d = G.aimDir(p, AD), tr = G.trace(p, camera.position.x, camera.position.y, camera.position.z, d.x, d.y, d.z, W0.range);
      var en = !!tr.ent;
      if (en !== hudC.enemy) { hudC.enemy = en; H$.xhair.classList.toggle('enemy', en); }
    }
    if (p.zoom !== hudC.scope) { hudC.scope = p.zoom; H$.scope.hidden = !p.zoom; }
    // low health
    var low = p.alive && p.hp <= 30;
    if (low !== hudC.low) { hudC.low = low; H$.lowhp.classList.toggle('on', low); }
    if (low && !paused && !G.over) { heartT -= dt; if (heartT <= 0) { heartT = 0.95; sfx.heartbeat(); } }
    var pw = p.power > 0 ? Math.ceil(p.power) : 0;
    if (pw !== hudC.pow) { hudC.pow = pw; H$.power.hidden = !pw; if (pw) H$.powT.textContent = pw; }
    if (!p.alive) { var dn = Math.max(1, Math.ceil(p.respawnT)); if (dn !== hudC.deadN) { hudC.deadN = dn; H$.deadN.textContent = dn; } }
    // paint on screen fades
    if (dripA > 0) { dripA = Math.max(0, dripA - dt * 0.7); drips.style.opacity = (dripA > 0.6 ? 1 : dripA / 0.6).toFixed(2); }
    // damage direction arcs
    for (var k = 0; k < dirs.length; k++) {
      var D = dirs[k];
      if (D.t > 1.3) { if (D.a !== 0) { D.a = 0; D.el.style.opacity = 0; } continue; }
      D.t += dt;
      if (D.src && D.src.alive) { D.x = D.src.x; D.z = D.src.z; }
      var ang = Math.atan2(-(D.x - camera.position.x), -(D.z - camera.position.z)) - camYaw;
      var rot = Math.round(-ang * 180 / Math.PI), a = Math.max(0, 1 - D.t / 1.3);
      if (rot !== D.rot) { D.rot = rot; D.el.style.transform = 'rotate(' + rot + 'deg)'; }
      var aa = Math.round(a * 20) / 20;
      if (aa !== D.a) { D.a = aa; D.el.style.opacity = aa; }
    }
    // hint timer
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) H$.hint.classList.remove('on'); }
    updateTags(dt);
    mmT -= dt; if (mmT <= 0) { mmT = 0.1; drawMinimap(); }
    // scoreboard while Tab is held; at the end it opens after the "match over" banner has been read
    var boardKey = Kit.keys.down('Tab') && gameSurfaceFocused() && !Kit.keys.anyDown(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
    var showB = !paused && (boardKey || (G.over && G.endT > 1.1 && !UI.resultsShown));
    if (showB !== !H$.board.hidden) { H$.board.hidden = !showB; hudEl.classList.toggle('boardon', showB); }
    if (showB) { boardT -= dt; if (boardT <= 0) { boardT = 0.3; H$.board.innerHTML = boardHTML(); } } else boardT = 0;
  }
  var enemyT = 0, AD = { x: 0, y: 0, z: 0 };

  /* ================================================================ PODIUM */
  var podConfT = 0;
  function renderPodium(dt) {
    podT += dt;
    for (var i = 0; i < 3; i++) {
      var d = podDolls[i]; if (!d.g.visible) continue;
      var jump = Math.max(0, Math.sin(podT * 5 - i * 1.3)) * (i === 0 ? 0.35 : 0.18);
      d.g.position.y = POD_Y[i] + jump;
      d.body.scale.y = 1 - (jump > 0 ? 0 : 0.04);
      d.pivot.rotation.x = -0.3 + Math.sin(podT * 3 + i) * 0.25;
      d.g.rotation.y = Math.PI - POD_X[i] * 0.18 + Math.sin(podT * 0.8 + i) * 0.25;
    }
    podConfT -= dt;
    if (podConfT <= 0 && podT < 12) { podConfT = 0.35; fx.confetti((Math.random() - 0.5) * 5, 5.5, (Math.random() - 0.5) * 2, 10, 2); }
    fx.update(dt, 0, 0, 0);
    if (coinAnim) {
      coinAnim.t += dt;
      var v = Math.round(coinAnim.to * Math.min(1, coinAnim.t / 1.2));
      if (v !== coinAnim.shown) { coinAnim.shown = v; $('oCoins').textContent = '+' + v; if (v > 0 && v < coinAnim.to) sfx.coin(v); }
      if (coinAnim.t > 1.2) coinAnim = null;
    }
    podCam.updateMatrixWorld();
    renderer.render(podScene, podCam);
    // name tags above the podium places
    if (podTagEls) {
      for (var j = 0; j < podTagEls.length; j++) {
        var el = podTagEls[j], di = +el.getAttribute('data-i');
        PV.set(POD_X[di], POD_Y[di] + 2.25, 0).project(podCam);
        el.style.left = ((PV.x * 0.5 + 0.5) * W) + 'px'; el.style.top = ((-PV.y * 0.5 + 0.5) * H) + 'px';
      }
    }
  }

  /* ================================================================ LOOP */
  Kit.keys.captureTab(function () { return UI.state === 'play' && !UI.paused && !G.over && gameSurfaceFocused(); });
  var perf = { upd: 0, ren: 0, frame: 0, frames: 0 };
  function update(dt) {
    var t0 = performance.now();
    var K = Kit.keys;
    if (UI.state === 'play') {
      if (!UI.paused) {
        if (K.pressed('KeyP') || K.pressed('Escape')) pause();
        else {
          if (G.player && G.player.alive && !G.over) readInput();
          else if (G.player) { G.player.mx = G.player.mz = 0; G.player.fire = false; }
          G.update(dt);
          if (G.over && G.endT > 2.2 && !UI.resultsShown) showResults();
        }
      } else if (K.pressed('KeyP') || K.pressed('Escape')) {
        if ($('settings').hidden) resume(); else closeSettings();
      }
    } else if (UI.state === 'title') {
      if (K.pressed('Enter') || K.pressed('NumpadEnter') || K.pressed('Space')) startMatch();
      G.update(dt);
    } else if (UI.state === 'locker' || UI.state === 'howto' || UI.state === 'settings') {
      if (K.pressed('Escape')) { if (UI.state === 'settings') closeSettings(); else { UI.state = 'title'; if (lPreview) { lPreview = ''; refreshDoll(); } show('title'); refreshTitle(); } }
      G.update(dt);
    } else if (UI.state === 'over') {
      if ((K.pressed('Enter') || K.pressed('NumpadEnter') || K.pressed('Space') || K.pressed('KeyR')) && performance.now() - overAt > 600) startMatch();
      else if (K.pressed('Escape')) goTitle();
    }
    K.endFrame();
    perf.upd += performance.now() - t0;
  }
  var lastR = performance.now();
  function render(alpha) {
    var t0 = performance.now(), dt = Math.min(0.1, (t0 - lastR) / 1000); lastR = t0;
    renderer.info.reset();
    renderer.clear();
    if (UI.state === 'over') renderPodium(dt);
    else {
      updateCamera(dt, UI.paused ? 1 : alpha);
      drawWorld(UI.paused ? 0 : dt, UI.paused ? 1 : alpha);
      if (!UI.noGL) renderer.render(G.scene, camera);
      var p = G.player;
      if (UI.state === 'play' && p) {
        if (p.alive && !p.zoom && VM.zoomK < 0.5 && !G.over) {
          updateVM(dt);
          renderer.clearDepth();
          if (!UI.noGL) renderer.render(vmScene, vmCam);
        }
        hud(dt);
      } else if (UI.state === 'title' || UI.state === 'locker') {
        dollSpin += dt;
        doll.g.rotation.y = Math.PI + (UI.state === 'locker' ? Math.sin(dollSpin * 0.6) * 0.9 - 0.2 : Math.sin(dollSpin * 0.7) * 0.3 - 0.75);
        doll.g.position.y = Math.abs(Math.sin(dollSpin * 2.2)) * 0.06;
        doll.pivot.rotation.x = Math.sin(dollSpin * 1.3) * 0.12;
        renderer.clearDepth();
        renderer.render(showScene, showCam);
      }
    }
    dynRes(t0, UI.state === 'play' && !UI.paused);
    music.pump();
    var ft = performance.now() - t0;
    perf.ren += ft; perf.frames++;
  }

  // Safety net for weak integrated graphics (auto quality only): if play runs clearly below
  // ~45 fps for a few seconds, render fewer pixels (never below 60 percent). Very slow frames count too
  // (clamped to 250 ms). If it is still slow at the floor, suggest «منخفضة» once and start the next visit
  // without anti-aliasing (the biggest fill-rate cost; it can only change on reload).
  var dres = { ratio: PR, min: PR * 0.6, buf: new Float32Array(120), sorted: new Float32Array(120), n: 0, last: 0, bad: 0, told: false };
  function dynRes(now, playing) {
    if (!playing || save.set.qual !== 'auto' || navigator.webdriver) { dres.last = 0; dres.n = 0; return; }
    if (dres.last) { var d = now - dres.last; if (d > 0) dres.buf[dres.n++] = d < 250 ? d : 250; }
    dres.last = now;
    if (dres.n < 120) return;
    dres.n = 0;
    dres.sorted.set(dres.buf); dres.sorted.sort();
    var med = dres.sorted[60];
    dres.bad = med > 22 ? dres.bad + 1 : 0;
    if (dres.bad < 2) return;
    dres.bad = 0;
    if (dres.ratio > dres.min + 0.01) { dres.ratio = Math.max(dres.min, dres.ratio * 0.85); renderer.setPixelRatio(dres.ratio); layout(); }
    else if (!dres.told) {
      dres.told = true;
      if (!save.set.aaOff) { save.set.aaOff = true; persist(); }
      hint('الجهاز بطيء قليلًا: اختر الجودة «منخفضة» من الإعدادات', 6);
    }
  }

  /* ================================================================ BOOT */
  Kit.muteButton().setAttribute('aria-label', 'الصوت: تشغيل / إيقاف');
  layout();
  goTitle();
  // Compile AND draw every shader once now (hidden objects and empty instanced pools too) so nothing
  // hitches mid-match: a program is only really finished by the driver on its first draw. The draw goes to
  // a 1-pixel scissor of the real canvas (same program variants as the game; a render target would differ).
  // The confetti is also drawn inside the fog-less podium scene, where it lives on the results screen.
  (function warm() {
    var hidden = [], empty = [], culled = [];
    var tmp = new T.Mesh(new T.PlaneGeometry(0.1, 0.1), G.mats.belt); G.scene.add(tmp);
    [G.scene, vmScene, showScene, podScene].forEach(function (sc) {
      sc.traverse(function (o) {
        if (!o.visible) { hidden.push(o); o.visible = true; }
        if (o.isInstancedMesh && o.count === 0) { empty.push(o); o.count = 1; }
        if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
      });
    });
    try {
      camera.updateMatrixWorld();
      renderer.compile(G.scene, camera); renderer.compile(vmScene, vmCam); renderer.compile(showScene, showCam); renderer.compile(podScene, podCam);
      renderer.initTexture(fx.decals.material.map);
      renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1);
      renderer.render(G.scene, camera); renderer.render(vmScene, vmCam); renderer.render(showScene, showCam); renderer.render(podScene, podCam);
      moveConfetti(podScene); renderer.compile(podScene, podCam); renderer.render(podScene, podCam); moveConfetti(G.scene);
    } catch (e) { /* ignore */ }
    renderer.setScissorTest(false);
    G.scene.remove(tmp); tmp.geometry.dispose();
    for (var i = 0; i < hidden.length; i++) hidden[i].visible = false;
    for (var j = 0; j < empty.length; j++) empty[j].count = 0;
    for (var k = 0; k < culled.length; k++) culled[k].frustumCulled = true;
  })();
  Kit.loop(update, render);

  /* ================================================================ TEST HOOKS */
  function entInfo(e) { return { name: e.name, team: e.team, alive: e.alive, hp: Math.round(e.hp), x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2), wpn: e.wpn, kills: e.kills, deaths: e.deaths, shield: +Math.max(0, e.shield).toFixed(2) }; }
  window.__game = {
    get state() {
      var p = G.player;
      return { ui: UI.state, paused: UI.paused, locked: lock.on, lockFails: lock.fails, mode: G.mode, map: G.mapIdx, diff: G.diff, t: +G.t.toFixed(2), matchT: +G.matchT.toFixed(2),
        countdown: +Math.max(0, G.countdown).toFixed(2), over: G.over, team: G.teamScore.slice(1),
        player: p ? { hp: Math.round(p.hp), alive: p.alive, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), grounded: p.grounded, wpn: p.wpn, ammo: p.ammo.slice(), res: p.res.slice(), balloons: p.balloons, kills: p.kills, deaths: p.deaths, shots: p.shots, hits: p.hits, zoom: p.zoom, power: +Math.max(0, p.power).toFixed(1) } : null,
        bots: G.ents.filter(function (e) { return e.bot; }).map(entInfo),
        calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pr: +renderer.getPixelRatio().toFixed(2), decals: fx.dUsed, particles: fx.pn, shots: G.shots.n };
    },
    save: save,
    start: function (o) { o = o || {}; if (o.mode) save.mode = o.mode; if (o.map != null) save.map = o.map; if (o.diff != null) save.diff = o.diff; startMatch(); if (o.skipCountdown) { G.countdown = 0; G.frozen = false; } return this.state; },
    set god(v) { if (G.player) G.player.god = !!v; }, get god() { return !!(G.player && G.player.god); },
    set botsFrozen(v) { G.ents.forEach(function (e) { if (e.bot) { e.bot.frozen = !!v; if (v) { e.bot._tick = e.bot._tick || e.bot.tick; e.bot.tick = function () { var b = this.e; b.mx = b.mz = 0; b.fire = b.fireP = false; b.jumpReq = false; }; } else if (e.bot._tick) { e.bot.tick = e.bot._tick; } } }); },
    teleport: function (x, y, z, yaw, pitch) { var p = G.player; p.x = p.px = x; p.y = p.py = y; p.z = p.pz = z; p.vx = p.vy = p.vz = 0; if (yaw != null) p.yaw = yaw; if (pitch != null) p.pitch = pitch; return entInfo(p); },
    moveBot: function (i, x, y, z) { var b = G.ents.filter(function (e) { return e.bot; })[i]; b.x = b.px = x; b.y = b.py = y; b.z = b.pz = z; b.vx = b.vy = b.vz = 0; return entInfo(b); },
    look: function (yaw, pitch) { var p = G.player; p.yaw = yaw; p.pitch = pitch; },
    mouse: function (dx, dy) { look(dx, dy); return { yaw: G.player.yaw, pitch: G.player.pitch }; },
    aimAt: function (i, head) {
      var p = G.player, b = G.ents.filter(function (e) { return e.bot; })[i];
      var dx = b.x - p.x, dz = b.z - p.z, dy = b.y + (head ? SS.HEAD_Y : 0.8) - (p.y + SS.EYE_H);
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)); p.rp = p.ry = 0;
      return { yaw: p.yaw, pitch: p.pitch, dist: Math.sqrt(dx * dx + dz * dz) };
    },
    trigger: function (on) { UI.hookFire = !!on; if (on) UI.hookFireP = true; },
    throwHold: function (on) { UI.hookThrow = !!on; },
    swap: function (w) { if (G.player) G.player.wantSwap = w; },
    pause: pause, resume: resume, menu: goTitle, replay: startMatch,
    endNow: function () { G.matchT = G.limit; },
    simulate: function (sec, o) { return G.simulate(sec, o); },
    lockNow: function () { requestLock(); return typeof canvas.requestPointerLock; },
    // renders n frames back to back and reports CPU time per frame + draw calls
    bench: function (n, noGL) {
      n = n || 120; UI.noGL = !!noGL;
      var heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      var u0 = perf.upd, r0 = perf.ren, t0 = performance.now();
      for (var i = 0; i < n; i++) { update(1 / 60); render(1); }
      var ms = performance.now() - t0; UI.noGL = false;
      var heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      return { frames: n, msPerFrame: +(ms / n).toFixed(2), updateMs: +((perf.upd - u0) / n).toFixed(2), renderMs: +((perf.ren - r0) / n).toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, heapKB: Math.round((heap1 - heap0) / 1024), programs: renderer.info.programs.length };
    },
    get perf() { return { updMs: perf.upd, renMs: perf.ren, frames: perf.frames }; },
    buy: function (kind, id) { var own = kind === 'colors' ? save.ownC : kind === 'hats' ? save.ownH : save.ownS; if (own.indexOf(id) < 0) own.push(id); if (kind === 'colors') save.color = id; else if (kind === 'hats') save.hat = id; else save.skin = id; persist(); refreshDoll(); return true; },
    give: function (n) { save.coins += n; persist(); refreshTitle(); return save.coins; },
    openLocker: openLocker,
    _vm: function () { return { key: vmW + '|' + (vmSkin && vmSkin.id) + '|' + vmCol, pos: vmRoot.position.toArray().map(function (v) { return +v.toFixed(3); }), rot: [vmRoot.rotation.x, vmRoot.rotation.y, vmRoot.rotation.z].map(function (v) { return +v.toFixed(3); }), verts: vmGun.geometry.attributes.position ? vmGun.geometry.attributes.position.count : 0, zoomK: VM.zoomK, swapT: G.player && G.player.swapT, reloadT: G.player && G.player.reloadT }; }
  };
})();

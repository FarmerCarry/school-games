/* Math Gates: Galactic Mech Squad (بوابات الحساب — كتيبة الآليين)
 * 2D Pseudo-3D perspective renderer (Kit.art), UI screens, Hangar shop,
 * keyboard/mouse controls, Kit.juice one-shot SFX, Kit.dda, and telemetry. */
(function () {
  'use strict';

  var MG = window.MGEngine, A = Kit.art, J = Kit.juice;
  function $(id) { return document.getElementById(id); }
  var canvas = $('scene'), ui = $('ui'), body = document.body;

  /* ------------------------------------------------ Art & Viewport Init */
  A.init({ canvas: canvas, mode: '2d', theme: 'neon' });

  function syncUi(v) {
    var ww = window.innerWidth, wh = window.innerHeight;
    var cw = Math.round(1280 * v.scale), ch = Math.round(720 * v.scale);
    ui.style.transform = 'scale(' + v.scale + ')';
    ui.style.left = Math.round((ww - cw) / 2) + 'px';
    ui.style.top = Math.round((wh - ch) / 2) + 'px';
  }

  var dirty = true;
  var view = Kit.fit(canvas, 1280, 720, { maxDpr: 1.5, onResize: function (v) { syncUi(v); dirty = true; } });
  syncUi(view);

  var fx = A.fx(280), badgeSpring = A.spring(260, 13), heroBlink = {};

  /* --------------------------------------------------- Save & Difficulty */
  var store = Kit.store('math-gates');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = MG.loadSave(store.get('save', null));

  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  var dda = Kit.dda('math-gates', { id: 'main', start: 0.2 });

  /* ----------------------------------------------- Baked Cartoon Sprites */
  function rOut(c, x, y, w, h, r, fill, lw) { A.round(c, x, y, w, h, r); A.outlined(c, fill, lw); }

  function bakeMech(idx) {
    var sk = MG.SKINS[idx] || MG.SKINS[0];
    return A.sprite('mech_' + idx, 84, 96, function (c, w) {
      var cx = w / 2, d1 = A.shade(sk.primary, -0.35), d2 = A.shade(sk.primary, -0.2);
      rOut(c, 12, 34, 14, 28, 6, d1, 3); rOut(c, w - 26, 34, 14, 28, 6, d1, 3);
      rOut(c, 24, 66, 14, 22, 6, d2, 3.2); rOut(c, 46, 66, 14, 22, 6, d2, 3.2);
      rOut(c, 6, 38, 16, 22, 7, sk.secondary, 3); rOut(c, w - 22, 38, 16, 22, 7, sk.secondary, 3);
      c.fillStyle = '#0e1028';
      c.beginPath(); c.arc(14, 55, 4, 0, 6.283); c.arc(w - 14, 55, 4, 0, 6.283); c.fill();
      rOut(c, 20, 38, 44, 34, 12, sk.primary, 3.5);
      c.beginPath(); c.arc(cx, 55, 7.5, 0, 6.283); A.outlined(c, sk.secondary, 2.5);
      c.beginPath();
      if (idx === 1) { c.moveTo(22, 18); c.lineTo(12, 3); c.lineTo(31, 14); c.moveTo(62, 18); c.lineTo(72, 3); c.lineTo(53, 14); }
      else if (idx === 2) { c.moveTo(18, 22); c.lineTo(6, 10); c.lineTo(24, 14); c.moveTo(66, 22); c.lineTo(78, 10); c.lineTo(60, 14); }
      else { c.moveTo(cx - 5, 14); c.lineTo(cx, 3); c.lineTo(cx + 5, 14); }
      A.outlined(c, sk.secondary, 3);
      rOut(c, 18, 12, 48, 32, 14, sk.primary, 3.5); A.gloss(c, 22, 14, 40, 14);
      rOut(c, 23, 20, 38, 16, 7, '#0b1026', 2.5);
      c.fillStyle = sk.visor;
      c.beginPath(); c.arc(cx - 9, 28, 4.2, 0, 6.283); c.arc(cx + 9, 28, 4.2, 0, 6.283); c.fill();
    }, { pad: 6 });
  }

  function bakeBoss(worldIdx) {
    var w = MG.WORLDS[worldIdx % MG.WORLDS.length];
    return A.sprite('boss_' + (worldIdx % 4), 210, 210, function (c, bw) {
      var cx = bw / 2;
      rOut(c, 18, 34, 38, 52, 10, '#334155', 4); rOut(c, bw - 56, 34, 38, 52, 10, '#334155', 4);
      c.fillStyle = '#ef4444';
      for (var m = 0; m < 2; m++) { c.beginPath(); c.arc(30 + m * 14, 48, 4.5, 0, 6.283); c.arc(bw - 44 + m * 14, 48, 4.5, 0, 6.283); c.fill(); }
      rOut(c, 58, 148, 32, 50, 10, '#1e293b', 4); rOut(c, bw - 90, 148, 32, 50, 10, '#1e293b', 4);
      rOut(c, 10, 78, 34, 62, 12, w.edge, 4); rOut(c, bw - 44, 78, 34, 62, 12, w.edge, 4);
      rOut(c, 40, 66, 130, 92, 22, '#1e293b', 4.5); rOut(c, 56, 82, 98, 60, 16, A.shade(w.edge, -0.45), 3.5);
      c.beginPath(); c.arc(cx, 112, 20, 0, 6.283); A.outlined(c, w.edge, 3.5);
      c.fillStyle = '#fff'; dot(c, cx - 5, 107, 6);
      c.beginPath(); c.moveTo(68, 44); c.lineTo(44, 10); c.lineTo(84, 34); c.moveTo(bw - 68, 44); c.lineTo(bw - 44, 10); c.lineTo(bw - 84, 34);
      A.outlined(c, '#fbbf24', 4);
      rOut(c, 64, 26, 82, 50, 16, '#0f172a', 4.5); rOut(c, 74, 42, 62, 18, 8, '#ff2a55', 3); A.gloss(c, 76, 44, 58, 8);
    }, { pad: 8 });
  }

  var GATE_TONES = {
    good:    ['#00f0b5', 'rgba(16,235,175,.56)', 'rgba(6,148,185,.24)', '#7dffdf', '#e6fff9', 'rgba(0,240,181,.48)'],
    mega:    ['#2eff9b', 'rgba(46,255,155,.62)', 'rgba(250,204,21,.28)', '#fde047', '#fefce8', 'rgba(46,255,155,.58)'],
    bad:     ['#ff335c', 'rgba(255,45,85,.58)',  'rgba(153,27,27,.28)', '#ff9eb0', '#ffe4e6', 'rgba(255,51,92,.52)'],
    mystery: ['#d946ef', 'rgba(217,70,239,.58)', 'rgba(109,40,217,.28)', '#f5d0fe', '#fdf4ff', 'rgba(217,70,239,.52)']
  };

  function mkGrad(c, g, st) {
    for (var i = 0; i < st.length; i += 2) g.addColorStop(st[i], st[i + 1]);
    return g;
  }

  function bakeGate(tone) {
    var p = GATE_TONES[tone] || GATE_TONES.good;
    return A.sprite('gate_v2_' + tone, 216, 172, function (c, w, h) {
      c.fillStyle = mkGrad(c, c.createRadialGradient(w / 2, h * 0.52, 16, w / 2, h * 0.52, w * 0.5), [0, p[5], 1, 'rgba(0,0,0,0)']);
      c.fillRect(0, 6, w, h - 6);
      A.round(c, 20, 26, w - 40, h - 34, 14);
      c.fillStyle = mkGrad(c, c.createLinearGradient(0, 26, 0, h - 8), [0, p[1], 0.55, p[2], 1, p[1]]); c.fill();
      c.fillStyle = mkGrad(c, c.createRadialGradient(w / 2, h * 0.48, 8, w / 2, h * 0.48, 72), [0, 'rgba(255,255,255,.28)', 1, 'rgba(255,255,255,0)']); c.fill();
      c.strokeStyle = p[3]; c.lineWidth = 4; c.stroke();
      rOut(c, 5, 16, 18, h - 22, 7, '#162044', 3.5); rOut(c, w - 23, 16, 18, h - 22, 7, '#162044', 3.5);
      rOut(c, 2, h - 22, 24, 16, 5, '#1e293b', 3); rOut(c, w - 26, h - 22, 24, 16, 5, '#1e293b', 3);
      c.fillStyle = p[0]; c.fillRect(10, 34, 8, h - 62); c.fillRect(w - 18, 34, 8, h - 62);
      c.fillStyle = p[4]; c.fillRect(12, 38, 3, h - 70); c.fillRect(w - 16, 38, 3, h - 70);
      rOut(c, 10, 8, w - 20, 24, 11, p[0], 3.5); A.gloss(c, 16, 10, w - 32, 9);
      c.fillStyle = p[4]; dot(c, 24, 20, 5); dot(c, w - 24, 20, 5);
    }, { pad: 8 });
  }

  function bakeMeteor(kind) {
    var col = kind === 'laser' ? '#a855f7' : kind === 'coin' ? '#f59e0b' : '#0ea5e9';
    var core = kind === 'laser' ? '#f0abfc' : kind === 'coin' ? '#fef08a' : '#67e8f9';
    return A.sprite('meteor_' + kind, 104, 104, function (c, w, h) {
      var cx = w / 2, cy = h / 2;
      A.blob(c, cx, cy, 42, 0.1, kind === 'coin' ? 1.2 : 0.4); A.outlined(c, '#1e293b', 4);
      A.blob(c, cx, cy, 32, 0.08, 2.1); A.outlined(c, col, 3);
      c.fillStyle = core; c.beginPath(); c.arc(cx - 10, cy - 12, 7, 0, 6.283); c.fill();
    }, { pad: 6 });
  }

  function getCoinSprite() {
    return A.sprite('star_coin', 46, 46, function (c, w, h) {
      c.beginPath(); c.arc(w / 2, h / 2, 18, 0, 6.283); A.outlined(c, '#ffd23f', 3.5);
      c.beginPath(); c.arc(w / 2, h / 2, 10, 0, 6.283); c.fillStyle = '#fef08a'; c.fill();
    }, { pad: 4 });
  }

  function getBoltSprite(boosted) {
    return A.sprite(boosted ? 'bolt_gold' : 'bolt_cyan', 20, 44, function (c, w, h) {
      A.round(c, 4, 2, w - 8, h - 4, 6);
      c.fillStyle = boosted ? '#fde047' : '#38bdf8'; c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(7, 6, w - 14, h - 14);
    }, { pad: 2 });
  }

  function getTurboSprite() {
    return A.sprite('turbo_pad', 130, 52, function (c, w, h) {
      A.round(c, 6, 6, w - 12, h - 12, 14); A.outlined(c, '#0d9488', 3.5);
      c.strokeStyle = '#5eead4'; c.lineWidth = 5;
      for (var k = 0; k < 2; k++) {
        var y = 34 - k * 12;
        c.beginPath(); c.moveTo(34, y); c.lineTo(w / 2, y - 10); c.lineTo(w - 34, y); c.stroke();
      }
    }, { pad: 4 });
  }

  function getCruiserSprite() {
    return A.sprite('cruiser', 160, 56, function (c) {
      c.beginPath();
      c.moveTo(12, 34); c.lineTo(52, 16); c.lineTo(132, 20); c.lineTo(152, 32); c.lineTo(126, 40); c.lineTo(26, 42);
      c.closePath(); A.outlined(c, '#1e293b', 3);
      c.fillStyle = '#38bdf8'; c.fillRect(60, 24, 38, 5);
      c.beginPath(); c.arc(18, 34, 6, 0, 6.283); c.fill();
    }, { pad: 4 });
  }

  /* -------------------------------------------- Perspective Projection */
  var HORIZON_Y = 216, PLAYER_Y = 602, CAM_DIST = 14, LANE_W_PX = 236;
  function clampVal(v, a, b) { return v < a ? a : v > b ? b : v; }

  function project(laneCoord, heightM, zRel) {
    var s = CAM_DIST / Math.max(1.4, zRel + CAM_DIST);
    return { x: 640 + laneCoord * LANE_W_PX * s, y: HORIZON_Y + (PLAYER_Y - HORIZON_Y) * s - (heightM || 0) * 66 * s, s: s };
  }

  function laneFromLogicalX(lx, ly) {
    var s = Math.max(0.28, (clampVal(ly, HORIZON_Y + 40, 700) - HORIZON_Y) / (PLAYER_Y - HORIZON_Y));
    var norm = (lx - 640) / (LANE_W_PX * s);
    return norm < -0.42 ? 0 : norm > 0.42 ? 2 : 1;
  }

  /* ------------------------------------------------------ Game State */
  var PRAISE = ['أحسنت!', 'ضربة عبقرية!', 'كتيبة خارقة!', 'رائع!'];
  var mode = 'title', curStage = 0, attempt = 0, run = null;
  var demoRun = MG.create({ stage: 0, diff: 'easy', seed: 11 });
  demoRun.count = 12; demoRun.d = 5;

  var animT = 0, streak = 0, lastBoltSfx = 0, hangarFrom = 'title';
  var resultInfo = null, resultTimer = 0, timers = [];

  // Pointer & Held-Key state (Stationary initial pointer NEVER overrides keyboard!)
  var ptr = { hasBase: false, baseX: 0, targetLane: null, clickJump: false, down: false };
  var keyHold = { dir: 0, t: 0 };

  function resetInputState() {
    ptr.hasBase = false; ptr.targetLane = null; ptr.clickJump = false; ptr.down = false;
    keyHold.dir = 0; keyHold.t = 0;
    Kit.keys.reset();
  }

  function later(sec, fn) { timers.push({ t: sec, fn: fn }); }
  function say(txt) { $('live').textContent = txt; }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* ----------------------------------------------------- Screen Transitions */
  var SCREEN_IDS = { title: 'title', map: 'map', hangar: 'hangar', paused: 'pause-screen', result: 'result' };

  function setMode(next) {
    mode = next;
    body.dataset.mode = next;
    for (var k in SCREEN_IDS) $(SCREEN_IDS[k]).hidden = (k !== next);
    $('hud').hidden = !(next === 'play' || next === 'paused');
    dirty = true;
    if (next === 'play') focusGame();
  }

  function syncDiffPills() {
    var pills = document.querySelectorAll('.diff-pill');
    for (var i = 0; i < pills.length; i++) {
      var on = pills[i].getAttribute('data-diff') === save.diff;
      pills[i].classList.toggle('on', on);
      pills[i].setAttribute('aria-pressed', String(on));
    }
  }

  function syncTopChips() {
    var st = String(MG.totalStars(save)), co = String(save.coins);
    $('title-stars').textContent = st; $('map-stars').textContent = st;
    $('title-coins').textContent = co; $('bank').textContent = co;
    $('endless-best').textContent = String(save.bestWave || 0);
    $('btnHangar').classList.toggle('ring', MG.canAffordAnySkin(save));
    syncDiffPills();
  }

  function setDifficulty(diffId) {
    if (!MG.DIFFS[diffId]) return;
    save.diff = diffId; persist(); syncDiffPills(); J.select(); dirty = true;
  }

  function toTitle() { run = null; syncTopChips(); setMode('title'); }

  /* ----------------------------------------------------- Worlds & Map UI */
  var stageButtons = [], mapBuilt = false;
  function buildMap() {
    mapBuilt = true;
    var box = $('worlds'); box.innerHTML = ''; stageButtons = [];
    MG.WORLDS.forEach(function (w, wIdx) {
      var card = document.createElement('div');
      card.className = 'world-card w' + wIdx;
      card.innerHTML = '<div class="w-head"><div class="w-icon" aria-hidden="true">' + w.icon + '</div><h3>' + w.name + '</h3><small>' + w.sub + '</small></div>';
      var row = document.createElement('div'); row.className = 'stage-row';
      for (var s = 0; s < MG.PER_WORLD; s++) {
        (function (stIdx) {
          var stObj = MG.STAGES[stIdx], b = document.createElement('button');
          b.type = 'button'; b.className = 'stage-btn'; b.setAttribute('data-stage', String(stIdx));
          b.innerHTML = '<b dir="ltr">' + stObj.tag + '</b><span class="st-mini"><svg aria-hidden="true"><use href="#i-star"/></svg><svg aria-hidden="true"><use href="#i-star"/></svg><svg aria-hidden="true"><use href="#i-star"/></svg></span>';
          onBtn(b, function () { J.select(); startStage(stIdx); });
          row.appendChild(b); stageButtons[stIdx] = b;
        })(wIdx * MG.PER_WORLD + s);
      }
      card.appendChild(row); box.appendChild(card);
    });
  }

  function refreshMap() {
    for (var i = 0; i < stageButtons.length; i++) {
      var b = stageButtons[i], st = save.stars[i] || 0;
      b.classList.toggle('done', st > 0);
      var starsSvg = b.querySelectorAll('.st-mini svg');
      for (var k = 0; k < starsSvg.length; k++) starsSvg[k].classList.toggle('on', k < st);
      b.setAttribute('aria-label', MG.STAGES[i].name + '، ' + st + ' من 3 نجوم');
    }
    syncTopChips();
  }

  function toMap() { if (!mapBuilt) buildMap(); run = null; refreshMap(); setMode('map'); J.whoosh(0.35); }

  /* --------------------------------------------------- Mech Hangar Shop */
  var skinCards = [], hangarBuilt = false;
  function buildHangar() {
    hangarBuilt = true;
    var grid = $('skins-grid'); grid.innerHTML = ''; skinCards = [];
    MG.SKINS.forEach(function (sk, idx) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'skin-card'; b.setAttribute('data-skin', String(idx));
      b.innerHTML = '<div class="skin-preview"><canvas width="96" height="96"></canvas></div><div class="skin-name">' + sk.name + '</div><div class="skin-status"></div>';
      onBtn(b, function () { pickSkin(idx, b); });
      grid.appendChild(b); skinCards.push(b);
    });
  }

  function refreshHangar() {
    for (var i = 0; i < skinCards.length; i++) {
      var card = skinCards[i], c = card.querySelector('canvas').getContext('2d');
      c.clearRect(0, 0, 96, 96);
      A.blit(c, bakeMech(i), 48, 50, { sx: 0.9, sy: 0.9 });
      var sk = MG.SKINS[i], unlocked = !!save.unlockedSkins[i], active = save.skin === i;
      card.classList.toggle('on', active);
      card.setAttribute('aria-pressed', String(active));
      card.querySelector('.skin-status').innerHTML = active ? 'مفعّل ✓' : unlocked ? 'اختيار الدرع' : '<i class="coin"></i><b dir="ltr">' + sk.cost + '</b>';
    }
    syncTopChips();
  }

  function openHangar(from) { if (!hangarBuilt) buildHangar(); hangarFrom = from || 'title'; run = null; refreshHangar(); setMode('hangar'); J.select(); }
  function closeHangar() { J.back(); if (hangarFrom === 'map') toMap(); else toTitle(); }

  function pickSkin(idx, el) {
    var out = MG.buyOrEquipSkin(save, idx);
    if (!out.ok) {
      J.error();
      if (Kit.retrigger) Kit.retrigger(el, 'wiggle');
      else { el.classList.remove('wiggle'); requestAnimationFrame(function () { el.classList.add('wiggle'); }); }
      return;
    }
    persist();
    if (out.bought) {
      J.levelUp();
      fx.burst(640, 360, { n: 32, speed: 260, life: 0.85, size: 10, shape: 'star', color: '#ffd23f' });
    } else J.select();
    refreshHangar(); dirty = true;
  }

  /* --------------------------------------------------- Gameplay Lifecycle */
  var popupGen = 0;
  function showPopup(html, cls, dur) {
    var el = $('popup'), gen = ++popupGen;
    el.className = 'popup ' + (cls || ''); el.innerHTML = html; el.hidden = false;
    later(dur || 1.35, function () { if (gen === popupGen) el.hidden = true; });
  }

  function startStage(stageIdx) {
    if (!MG.isOpen(save, stageIdx)) stageIdx = 0;
    curStage = stageIdx; attempt++;
    var stObj = MG.STAGES[stageIdx];
    var seed = ((Date.now() ^ (attempt * 0x9e3779b9) ^ (stageIdx * 7919)) >>> 0) || 1;
    run = MG.create({ stage: stageIdx, diff: save.diff, seed: seed, ddaLevel: dda.level });

    timers = []; streak = 0; resultInfo = null;
    $('popup').hidden = true;
    resetInputState();

    $('hud-world').textContent = stObj.endless ? 'طور الفضاء' : MG.WORLDS[stObj.world].name;
    $('hud-level').textContent = stObj.tag;
    $('hud-coins').textContent = '0';
    resetHudCache();
    updateHudProgress();

    Kit.stats.round(stObj.roundKey);

    $('banner').hidden = true;

    setMode('play');
    say(stObj.name);
    J.whoosh(0.45);
  }

  function restartStage() { J.select(); startStage(curStage); }
  function pauseGame(byUser) { if (mode !== 'play') return; resetInputState(); setMode('paused'); if (byUser) J.back(); }
  function resumeGame() { if (mode !== 'paused') return; resetInputState(); J.select(); setMode('play'); }
  function quitToMap() { if (run) Kit.stats.end('quit', run.count); J.back(); toMap(); }

  function finishRun() {
    var res = run.result, out = MG.applyResult(save, curStage, res);
    persist();
    dda.result(MG.outcome(res));
    Kit.stats.end(res.won ? 'win' : 'lose', res.score);

    resultInfo = { res: res, newBest: out.newBest }; resultTimer = 0;
    $('res-title').textContent = !res.won ? 'حاول مرة أخرى!' : res.stars >= 3 ? 'انتصار أسطوري!' : 'دمّرت الزعيم!';
    var starsEls = $('res-stars').querySelectorAll('.star'), capsEls = $('res-stars').querySelectorAll('.cap');
    var goals = [res.won, res.won && res.stars >= 2, res.won && res.stars >= 3];
    for (var i = 0; i < 3; i++) { starsEls[i].classList.remove('on'); capsEls[i].classList.toggle('got', goals[i]); }
    $('res-count').textContent = String(res.count);
    $('res-boss').textContent = String(res.bossMax);
    $('res-cmp').textContent = res.count >= res.bossMax ? '>' : '<';
    $('res-coins').textContent = '+' + res.coins;
    $('res-best').hidden = !out.newBest;
    $('res-next').hidden = !(res.won && !res.endless && curStage < MG.STAGES_N - 1);
    $('res-hangar').hidden = !MG.canAffordAnySkin(save);
    later(0.35, function () { setMode('result'); });
  }

  function nextOrReplay() {
    if (!resultInfo) return;
    if (resultInfo.res.won && !resultInfo.res.endless && curStage < MG.STAGES_N - 1) { J.select(); startStage(curStage + 1); }
    else restartStage();
  }

  /* --------------------------------------------------- Events & Feedback */
  function burstFx(x, y, n, speed, life, size, shape, color) {
    fx.burst(x, y, { n: n, speed: speed, life: life, size: size, shape: shape, color: color });
  }

  function processEvents() {
    if (!run) return;
    var ev = run.ev;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t === 'cue') Kit.track.cue();
      else if (e.t === 'lane') J.tap();
      else if (e.t === 'jump') {
        J.jump(0.75);
        var jp = project(e.lane - 1, 0.2, 0);
        burstFx(jp.x, jp.y, 14, 180, 0.45, 7, 'spark', '#38bdf8');
      } else if (e.t === 'coin') {
        J.coin(1 + (e.total % 5)); $('hud-coins').textContent = String(run.runCoins);
      } else if (e.t === 'boltHit') {
        if (animT - lastBoltSfx > 0.16) { lastBoltSfx = animT; J.pop(0.2); }
        var hpPt = project(e.lane - 1, 0.8, e.d - run.d);
        burstFx(hpPt.x, hpPt.y, 4, 120, 0.25, 5, 'spark', '#38bdf8');
      } else if (e.t === 'meteorBreak') {
        J.impact(0.65); A.shake.add(0.22);
        var mp = project(e.lane - 1, 0.9, e.d - run.d);
        var mCol = e.kind === 'laser' ? '#c084fc' : e.kind === 'coin' ? '#ffd23f' : '#2eff9b';
        burstFx(mp.x, mp.y, 22, 240, 0.65, 9, 'star', mCol);
        if (e.kind === 'mech') { A.pop('+' + e.val, mp.x, mp.y - 20, { color: '#2eff9b', size: 32 }); badgeSpring.kick(4.5); }
        else if (e.kind === 'coin') { $('hud-coins').textContent = String(run.runCoins); A.pop('+' + e.val, mp.x, mp.y - 20, { color: '#ffd23f', size: 30 }); }
        else { $('hud-coins').textContent = String(run.runCoins); showPopup('مدفع الليزر المزدوج!', 'boost', 1.3); }
      } else if (e.t === 'shieldBreak') {
        J.chime(2);
        var sp = project(e.lane - 1, 1.2, run.rows[e.row].d - run.d);
        burstFx(sp.x, sp.y, 16, 200, 0.5, 8, 'spark', '#e879f9');
      } else if (e.t === 'turbo') {
        J.streak(4); badgeSpring.kick(4); showPopup('اندفاع تيربو! +2', 'praise', 1.0);
      } else if (e.t === 'leap') {
        J.coin(3); $('hud-coins').textContent = String(run.runCoins); A.pop('+2', 640, 480, { color: '#38bdf8', size: 30 });
      } else if (e.t === 'hit') {
        Kit.track.miss(); streak = 0; J.impact(0.75); A.shake.add(0.42); A.flash('#ff3b5c', 120);
        A.pop(MG.MINUS + e.lost, 640, 520, { color: '#ff6b81', size: 34 });
      } else if (e.t === 'gate') {
        var gp = project(e.lane - 1, 1.2, 0), delta = e.after - e.before;
        if (delta >= 0) {
          J.pop(0.8); badgeSpring.kick(5.5);
          burstFx(gp.x, gp.y - 30, 24, 230, 0.65, 9, 'confetti', '#2eff9b');
          A.pop('+' + delta, gp.x, gp.y - 50, { color: '#2eff9b', size: 36 });
        } else {
          J.error(); A.shake.add(0.28);
          A.pop(MG.MINUS + Math.abs(delta), gp.x, gp.y - 50, { color: '#ff6b81', size: 36 });
        }
        if (e.best) {
          Kit.track.hit(); streak++; J.streak(Math.min(10, streak));
          if (streak >= 2 && streak % 2 === 0) showPopup(PRAISE[(streak / 2 - 1) % PRAISE.length], 'praise', 1.0);
        } else {
          Kit.track.miss(); streak = 0;
          showPopup('الأقوى: <span dir="ltr">' + run.rows[e.row].gates[e.bestLane].label + '</span>', 'hint', 1.35);
        }
      } else if (e.t === 'waveClear') {
        J.levelUp(); A.flash('#00e5ff', 150);
        $('hud-world').textContent = 'موجة ' + (e.wave + 1);
        $('hud-boss').textContent = String(run.bossMax);
        $('hud-coins').textContent = String(run.runCoins);
        showPopup('تدمير الحارس! موجة <span dir="ltr">' + (e.wave + 1) + '</span>', 'praise', 1.5);
      } else if (e.t === 'bossStart') {
        J.whoosh(0.85); showPopup('معركة الزعيم!', 'boost', 1.1);
      } else if (e.t === 'clash') {
        if (A.rand() < 0.45) J.pop(0.5);
        A.shake.add(0.12);
        burstFx(640, 390, 6, 220, 0.4, 8, 'spark', '#ffd23f');
      } else if (e.t === 'won') {
        J.levelUp(); A.shake.add(0.45); A.flash('#2eff9b', 180);
        burstFx(640, 340, 55, 320, 1.1, 11, 'star', '#ffd23f');
      } else if (e.t === 'lost') {
        J.fail(); A.shake.add(0.35);
      } else if (e.t === 'done') finishRun();
    }
    ev.length = 0;
  }

  var elTripFill = $('trip-fill'), elTripMe = $('trip-me'), elHudSquad = $('hud-squad'), elHudBoss = $('hud-boss'), elJumpCd = $('jump-cd');
  var hudPrev = { pct: '', squad: -1, boss: -1, cd: '' };
  function resetHudCache() { hudPrev.pct = ''; hudPrev.squad = -1; hudPrev.boss = -1; hudPrev.cd = ''; }
  function updateHudProgress() {
    if (!run) return;
    var pct = (Math.round(MG.progress(run) * 200) / 2).toFixed(1) + '%';
    if (pct !== hudPrev.pct) {
      hudPrev.pct = pct;
      elTripFill.style.width = pct;
      elTripMe.style.left = 'calc(' + pct + ' - 20px)';
    }
    if (run.count !== hudPrev.squad) {
      hudPrev.squad = run.count;
      elHudSquad.textContent = '×' + run.count;
    }
    var bossVal = run.phase === 'clash' ? run.bossHp : run.bossMax;
    if (bossVal !== hudPrev.boss) {
      hudPrev.boss = bossVal;
      elHudBoss.textContent = String(bossVal);
    }
    var cdVal = run.jumpCd > 0 ? (Math.min(1, run.jumpCd / 0.85)).toFixed(2) : '0';
    if (cdVal !== hudPrev.cd) {
      hudPrev.cd = cdVal;
      if (elJumpCd) elJumpCd.style.transform = 'scaleY(' + cdVal + ')';
    }
  }

  /* --------------------------------------------------- Input Handling */
  function onBtn(el, fn) {
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.detail > 1) return;
      Kit.audio.unlock();
      if (e.detail > 0) { el.blur(); focusGame(); }
      fn(e);
    });
  }

  onBtn($('btnPlay'), function () { J.select(); startStage(curStage); });
  onBtn($('btnMap'), toMap);
  onBtn($('btnHangar'), function () { openHangar('title'); });
  onBtn($('btnEndless'), function () { J.select(); startStage(MG.ENDLESS_INDEX); });
  onBtn($('map-home'), function () { J.back(); toTitle(); });
  onBtn($('map-hangar'), function () { openHangar('map'); });
  onBtn($('btnEndlessMap'), function () { J.select(); startStage(MG.ENDLESS_INDEX); });
  onBtn($('hangar-back'), closeHangar);
  onBtn($('btnPause'), function () { pauseGame(true); });
  onBtn($('btnJump'), function () { if (mode === 'play') ptr.clickJump = true; });
  onBtn($('btnResume'), resumeGame);
  onBtn($('btnRestart'), function () { if (mode === 'paused') restartStage(); });
  onBtn($('btnQuit'), function () { if (mode === 'paused') quitToMap(); });
  onBtn($('res-next'), function () { if (mode === 'result') nextOrReplay(); });
  onBtn($('res-again'), function () { if (mode === 'result') restartStage(); });
  onBtn($('res-map'), function () { if (mode === 'result') { J.back(); toMap(); } });
  onBtn($('res-hangar'), function () { if (mode === 'result') openHangar('map'); });

  var diffBtns = document.querySelectorAll('.diff-pill');
  for (var di = 0; di < diffBtns.length; di++) {
    (function (btn) { onBtn(btn, function () { setDifficulty(btn.getAttribute('data-diff')); }); })(diffBtns[di]);
  }

  // Guarded keyboard listener — respects focused native controls (tools/regressions-keyboard.mjs)!
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    var c = e.code;
    if (mode === 'title') {
      if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') { J.select(); startStage(curStage); }
    } else if (mode === 'map') {
      if (c === 'Escape') { J.back(); toTitle(); }
      else if (c === 'Enter' || c === 'NumpadEnter') { J.select(); startStage(curStage); }
    } else if (mode === 'hangar') {
      if (c === 'Escape') closeHangar();
    } else if (mode === 'play') {
      if (c === 'KeyP' || c === 'Escape') pauseGame(true);
      else if (c === 'Digit1' || c === 'Numpad1') ptr.targetLane = 0;
      else if (c === 'Digit2' || c === 'Numpad2') ptr.targetLane = 1;
      else if (c === 'Digit3' || c === 'Numpad3') ptr.targetLane = 2;
    } else if (mode === 'paused') {
      if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'NumpadEnter' || c === 'Space') resumeGame();
      else if (c === 'KeyR') restartStage();
    } else if (mode === 'result') {
      if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') nextOrReplay();
      else if (c === 'KeyR') restartStage();
      else if (c === 'Escape') { J.back(); toMap(); }
    }
  });

  // Mouse / Touch steering on canvas (Stationary initial pointer NEVER overrides keyboard!)
  canvas.addEventListener('pointerdown', function (e) {
    focusGame();
    if (e.button !== 0 || mode !== 'play' || !run) return;
    var l = view.toLogical(e.clientX, e.clientY);
    ptr.down = true; ptr.hasBase = true; ptr.baseX = l.x;
    var lane = laneFromLogicalX(l.x, l.y);
    if (lane !== run.lane) ptr.targetLane = lane; else ptr.clickJump = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (mode !== 'play' || !run) return;
    var l = view.toLogical(e.clientX, e.clientY);
    if (!ptr.hasBase) { ptr.hasBase = true; ptr.baseX = l.x; return; }
    if (Math.abs(l.x - ptr.baseX) >= 16) {
      ptr.baseX = l.x;
      ptr.targetLane = laneFromLogicalX(l.x, l.y);
    }
  });

  function onPtrEnd() { ptr.down = false; }
  canvas.addEventListener('pointerup', onPtrEnd);
  canvas.addEventListener('pointercancel', onPtrEnd);

  function gatherPlayInput(dt) {
    var K = Kit.keys;
    var mv = (K.anyPressed(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyPressed(['ArrowLeft', 'KeyA']) ? 1 : 0);
    var heldDir = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
    if (mv !== 0) {
      keyHold.dir = mv; keyHold.t = 0.22; ptr.targetLane = null;
    } else if (heldDir !== 0) {
      if (keyHold.dir !== heldDir) { mv = heldDir; keyHold.dir = heldDir; keyHold.t = 0.22; }
      else { keyHold.t -= dt; if (keyHold.t <= 0) { mv = heldDir; keyHold.t = 0.2; } }
      ptr.targetLane = null;
    } else { keyHold.dir = 0; keyHold.t = 0; }

    var jump = K.anyPressed(['Space', 'ArrowUp', 'KeyW']) || ptr.clickJump;
    ptr.clickJump = false;

    var inp = { move: mv, lane: null, jump: jump };
    if (mv === 0 && ptr.targetLane !== null) { inp.lane = ptr.targetLane; ptr.targetLane = null; }
    return inp;
  }

  /* --------------------------------------------------- 2D Pseudo-3D Render */
  var TEXT_BASE = 48, textCache = new Map();
  function clearRenderCaches() { textCache.clear(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { clearRenderCaches(); dirty = true; });
  canvas.addEventListener('contextrestored', function () { clearRenderCaches(); dirty = true; });

  function getTextSprite(text, fill, dir) {
    var key = text + '|' + (fill || '#ffffff') + '|' + (dir || 'ltr');
    var hit = textCache.get(key);
    if (hit) return hit;
    if (textCache.size >= 96) textCache.clear();
    var c = document.createElement('canvas'), g = c.getContext('2d');
    var lw = Math.round(TEXT_BASE * 0.14);
    g.font = '700 ' + TEXT_BASE + 'px Fredoka';
    var tw = Math.ceil(g.measureText(text).width) + lw * 2 + 12;
    var th = Math.ceil(TEXT_BASE * 1.4) + lw * 2;
    c.width = Math.max(16, tw); c.height = Math.max(16, th);
    g.direction = dir || 'ltr';
    g.font = '700 ' + TEXT_BASE + 'px Fredoka';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = lw; g.strokeStyle = '#0b0e26'; g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = fill || '#ffffff'; g.fillText(text, c.width / 2, c.height / 2);
    var spr = { c: c, w: c.width, h: c.height };
    textCache.set(key, spr);
    return spr;
  }

  function drawOutlinedText(ctx, text, x, y, size, fill, dir) {
    var s = Math.max(11, Math.round(size * 0.5) * 2);
    var spr = getTextSprite(text, fill, dir), sc = s / TEXT_BASE;
    var dw = spr.w * sc, dh = spr.h * sc;
    ctx.drawImage(spr.c, x - dw / 2, y - dh / 2, dw, dh);
  }

  // [top, mid, hor, nebA, nebB, aurA, aurB, cityFar, cityNear, deckTop, deckBot, grid, moon]
  var WORLD_FX = [
    ['#090b2e','#1d1e68','#174c8f','168,85,247,.34','0,229,255,.34','46,255,155,.22','192,132,252,.26','#14235e','#0e1b4d','#112561','#060c28','0,229,255,.22','#c4b5fd'],
    ['#240818','#5e1730','#a8342d','255,107,53,.34','251,191,36,.28','255,93,59,.24','244,63,94,.26','#461428','#2e0d1d','#3e1226','#140610','255,107,53,.24','#fde68a'],
    ['#130738','#3a157d','#6325b5','250,204,21,.26','192,132,252,.38','56,189,248,.24','255,210,63,.22','#2b1263','#1c0c47','#29125c','#0b0524','255,210,63,.22','#7dd3fc'],
    ['#051c22','#0c4747','#127a6b','46,255,155,.30','56,189,248,.32','46,255,155,.26','244,63,94,.20','#0b383b','#07272b','#0b363a','#041216','46,255,155,.24','#fda4af']
  ];
  function rgba(s) { return 'rgba(' + s + ')'; }

  function seg(c, x1, y1, x2, y2) { c.moveTo(x1, y1); c.lineTo(x2, y2); }
  function dot(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }

  function bakeBackdrop(idx) {
    var w = MG.WORLDS[idx], f = WORLD_FX[idx], H = HORIZON_Y, Z = rgba('0,0,0,0');
    return A.sprite('bd2_' + idx, 1280, 720, function (c) {
      c.fillStyle = mkGrad(c, c.createLinearGradient(0, 0, 0, H + 24), [0, f[0], 0.58, f[1], 1, f[2]]);
      c.fillRect(0, 0, 1280, H + 24);
      c.fillStyle = mkGrad(c, c.createRadialGradient(250, 120, 20, 250, 120, 340), [0, rgba(f[3]), 1, Z]);
      c.fillRect(0, 0, 720, H + 30);
      c.fillStyle = mkGrad(c, c.createRadialGradient(1010, 118, 20, 1010, 118, 360), [0, rgba(f[4]), 1, Z]);
      c.fillRect(560, 0, 720, H + 30);
      for (var a = 0; a < 2; a++) {
        c.beginPath(); c.moveTo(0, 118 + a * 30);
        c.bezierCurveTo(320, 28 + a * 42, 640, 168 - a * 34, 960, 62 + a * 28);
        c.bezierCurveTo(1110, 20 + a * 26, 1210, 96 + a * 18, 1280, 84 + a * 22);
        c.lineTo(1280, 132 + a * 26);
        c.bezierCurveTo(1140, 148 + a * 16, 940, 108 + a * 22, 640, 196 - a * 22);
        c.bezierCurveTo(340, 88 + a * 34, 160, 152 + a * 20, 0, 162 + a * 16);
        c.closePath(); c.fillStyle = rgba(f[5 + a]); c.fill();
      }
      // Crescent moon (left) + Ringed hero planet (right)
      c.fillStyle = mkGrad(c, c.createRadialGradient(220, 106, 4, 228, 114, 36), [0, '#fff', 0.55, f[12], 1, Z]);
      dot(c, 228, 114, 36); c.fillStyle = f[12]; dot(c, 228, 114, 24); c.fillStyle = f[1]; dot(c, 238, 110, 21);
      c.save();
      c.strokeStyle = rgba('125,211,252,.25'); c.lineWidth = 14;
      c.beginPath(); c.ellipse(1005, 112, 106, 26, -0.22, Math.PI, 6.283); c.stroke();
      c.fillStyle = mkGrad(c, c.createRadialGradient(985, 92, 6, 1005, 112, 56), [0, '#fff', 0.28, w.accent, 0.82, w.sky[1], 1, f[0]]);
      dot(c, 1005, 112, 54);
      c.strokeStyle = w.edge; c.globalAlpha = 0.55; c.lineWidth = 5;
      c.beginPath(); c.ellipse(1005, 112, 98, 22, -0.22, 0, Math.PI); c.stroke();
      c.strokeStyle = '#fff'; c.globalAlpha = 0.35; c.lineWidth = 2;
      c.beginPath(); c.ellipse(1005, 112, 114, 28, -0.22, 0, Math.PI); c.stroke();
      c.restore();
      // Horizon bloom + symmetric far skyline + anchored star-city spires & domes
      c.fillStyle = mkGrad(c, c.createLinearGradient(0, H - 68, 0, H + 12), [0, Z, 0.75, rgba(f[4]), 1, w.edge]);
      c.fillRect(0, H - 68, 1280, 74);
      var rPts = [0,156, 75,134, 145,152, 220,122, 295,158, 370,148, 448,184, 525,216];
      c.fillStyle = f[7]; c.beginPath(); c.moveTo(0, H + 4);
      for (var i = 0; i < rPts.length; i += 2) c.lineTo(rPts[i], rPts[i + 1]);
      for (i = rPts.length - 2; i >= 0; i -= 2) c.lineTo(1280 - rPts[i], rPts[i + 1]);
      c.lineTo(1280, H + 4); c.closePath(); c.fill();
      var sp = [[18,44,108,0,1],[74,58,66,1,0],[146,36,126,0,1],[196,50,80,0,0],[262,62,52,1,0],[338,32,72,0,1],[384,42,40,0,0]];
      for (i = 0; i < sp.length; i++) {
        for (var side = 0; side < 2; side++) {
          var s = sp[i], sx = side ? 1280 - s[0] - s[1] : s[0], sw = s[1], sh = s[2], sy = H - sh;
          c.fillStyle = f[8];
          if (s[3]) {
            c.beginPath(); c.arc(sx + sw / 2, H - sh * 0.45, sw * 0.5, Math.PI, 0);
            c.lineTo(sx + sw, H + 4); c.lineTo(sx, H + 4); c.closePath(); c.fill();
            c.strokeStyle = w.edge; c.globalAlpha = 0.65; c.lineWidth = 2.5;
            c.beginPath(); c.arc(sx + sw / 2, H - sh * 0.45, sw * 0.46, 3.6, 5.8); c.stroke();
          } else {
            c.beginPath(); c.moveTo(sx, H + 4); c.lineTo(sx + 5, sy + 10); c.lineTo(sx + sw / 2, sy);
            c.lineTo(sx + sw - 5, sy + 10); c.lineTo(sx + sw, H + 4); c.closePath(); c.fill();
            if (s[4]) {
              c.strokeStyle = w.edge; c.lineWidth = 2; c.beginPath(); seg(c, sx + sw / 2, sy, sx + sw / 2, sy - 24); c.stroke();
              c.fillStyle = '#fde047'; dot(c, sx + sw / 2, sy - 25, 3);
            }
            c.fillStyle = w.edge; c.globalAlpha = 0.72;
            for (var wy = sy + 18; wy < H - 12; wy += 13) c.fillRect(sx + 9, wy, sw - 18, 3);
            c.fillStyle = '#fde047'; c.globalAlpha = 0.55; c.fillRect(sx + sw * 0.46, sy + 14, 3, sh - 24);
          }
          c.globalAlpha = 1;
        }
      }
      c.fillStyle = mkGrad(c, c.createLinearGradient(0, H, 0, 720), [0, f[9], 0.45, w.sky[1], 1, f[10]]);
      c.fillRect(0, H, 1280, 720 - H);
      c.fillStyle = w.edge; c.globalAlpha = 0.75; c.fillRect(0, H - 2, 1280, 4); c.globalAlpha = 1;
      c.strokeStyle = rgba(f[11]); c.lineWidth = 1.6; c.beginPath();
      for (var gx = -7; gx <= 7; gx++) if (Math.abs(gx) > 1) seg(c, 640 + gx * 36, H, 640 + gx * 285, 720);
      c.stroke();
      c.fillStyle = mkGrad(c, c.createLinearGradient(0, H, 0, H + 95), [0, rgba(f[4]), 1, Z]);
      c.fillRect(0, H, 1280, 95);
    }, { pad: 0 });
  }

  function drawScene(ctx, r, isDemo) {
    var idx = (r ? r.world : 0) % MG.WORLDS.length, w = MG.WORLDS[idx], f = WORLD_FX[idx];
    var reduced = Kit.motion.reduced(), t = reduced ? 0 : animT;
    var bd = bakeBackdrop(idx);
    if (bd.canvas) ctx.drawImage(bd.canvas, 0, 0, 1280, 720);

    ctx.fillStyle = '#fff';
    for (var si = 0; si < 42; si++) {
      var sx = ((si * 197 + 53) % 1260) + 10, sy = ((si * 83 + 13) % (HORIZON_Y - 26)) + 8;
      ctx.globalAlpha = reduced ? 0.75 : 0.35 + 0.65 * Math.abs(Math.sin(t * 2.4 + si * 0.9));
      if (si % 6 === 0) { ctx.fillRect(sx - 4, sy, 9, 1.5); ctx.fillRect(sx, sy - 4, 1.5, 9); }
      else ctx.fillRect(sx, sy, si % 3 ? 2 : 3, si % 3 ? 2 : 3);
    }
    ctx.globalAlpha = 1;

    var dVal = isDemo ? (t * 14) : r.d, firstGrid = Math.floor(dVal / 6) * 6;
    ctx.strokeStyle = rgba(f[11]); ctx.lineWidth = 1.6;
    for (var fgD = firstGrid; fgD < dVal + 74; fgD += 8) {
      var fz = fgD - dVal;
      if (fz < -1) continue;
      var fy = project(0, 0, fz).y;
      ctx.globalAlpha = clampVal(1 - fz / 76, 0.12, 0.65);
      ctx.beginPath(); seg(ctx, 0, fy, 1280, fy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    var cruiser = getCruiserSprite(), cDrift = reduced ? 0 : ((t * 22) % 1480);
    A.blit(ctx, cruiser, 1360 - cDrift, 86, { sx: 0.72, sy: 0.72, alpha: 0.9 });
    A.blit(ctx, cruiser, 280 + (reduced ? 0 : Math.sin(t * 0.8) * 18), 146, { sx: 0.52, sy: 0.52, alpha: 0.72 });

    ctx.save();
    for (var rd = Math.floor(dVal / 22) * 22 + 22; rd < dVal + 78; rd += 22) {
      var rz = rd - dVal;
      if (rz < 1.5 || rz > 74) continue;
      var rl = project(-1.82, 0, rz), rr = project(1.82, 0, rz), rTop = project(0, 3.4, rz);
      ctx.strokeStyle = w.edge; ctx.globalAlpha = clampVal((1 - rz / 74) * 0.52, 0.08, 0.48); ctx.lineWidth = Math.max(2, 7 * rl.s);
      ctx.beginPath(); ctx.moveTo(rl.x, rl.y); ctx.quadraticCurveTo(rl.x - 16 * rl.s, rTop.y, 640, rTop.y); ctx.quadraticCurveTo(rr.x + 16 * rr.s, rTop.y, rr.x, rr.y); ctx.stroke();
    }
    ctx.restore();

    var topL = project(-1.5, 0, 76), topR = project(1.5, 0, 76), botL = project(-1.5, 0, -3), botR = project(1.5, 0, -3);
    var midTL = project(-0.5, 0, 76), midTR = project(0.5, 0, 76), midBL = project(-0.5, 0, -3), midBR = project(0.5, 0, -3);
    ctx.beginPath(); ctx.moveTo(topL.x, topL.y); ctx.lineTo(topR.x, topR.y); ctx.lineTo(botR.x, botR.y); ctx.lineTo(botL.x, botL.y); ctx.closePath(); ctx.fillStyle = w.track; ctx.fill();
    ctx.beginPath(); ctx.moveTo(midTL.x, midTL.y); ctx.lineTo(midTR.x, midTR.y); ctx.lineTo(midBR.x, midBR.y); ctx.lineTo(midBL.x, midBL.y); ctx.closePath(); ctx.fillStyle = w.laneAlt; ctx.fill();

    ctx.strokeStyle = rgba('148,163,184,.22'); ctx.lineWidth = 2;
    for (var gd = firstGrid; gd < dVal + 74; gd += 6) {
      var gz = gd - dVal;
      if (gz < -2) continue;
      var gl = project(-1.48, 0, gz), gr = project(1.48, 0, gz);
      ctx.beginPath(); seg(ctx, gl.x, gl.y, gr.x, gr.y); ctx.stroke();
      if (Math.round(gd / 6) % 2 === 0 && gz > 2 && gz < 52) {
        ctx.save(); ctx.strokeStyle = w.edge; ctx.globalAlpha = clampVal((1 - gz / 52) * 0.32, 0.05, 0.3); ctx.lineWidth = Math.max(1.5, 3.5 * gl.s);
        ctx.beginPath();
        for (var cl = -1; cl <= 1; cl++) { var cT = project(cl, 0, gz + 1.4), cL = project(cl - 0.24, 0, gz), cR = project(cl + 0.24, 0, gz); ctx.moveTo(cL.x, cL.y); ctx.lineTo(cT.x, cT.y); ctx.lineTo(cR.x, cR.y); }
        ctx.stroke(); ctx.restore();
      }
    }

    ctx.strokeStyle = rgba('255,255,255,.38'); ctx.lineWidth = 3;
    ctx.beginPath(); seg(ctx, midTL.x, midTL.y, midBL.x, midBL.y); seg(ctx, midTR.x, midTR.y, midBR.x, midBR.y); ctx.stroke();

    ctx.save();
    var rails = [[w.edge, 0.32, 18], [w.edge, 1, 6], ['#fff', 1, 2]];
    for (var rn = 0; rn < 3; rn++) {
      ctx.strokeStyle = rails[rn][0]; ctx.globalAlpha = rails[rn][1]; ctx.lineWidth = rails[rn][2];
      ctx.beginPath(); seg(ctx, topL.x, topL.y, botL.x, botL.y); seg(ctx, topR.x, topR.y, botR.x, botR.y); ctx.stroke();
    }
    ctx.restore();

    for (var pd = Math.floor(dVal / 10) * 10 + 10; pd < dVal + 70; pd += 10) {
      var pz = pd - dVal;
      if (pz < -0.5 || pz > 68) continue;
      for (var sideP = -1; sideP <= 1; sideP += 2) {
        var pb = project(sideP * 1.66, 0, pz), pt = project(sideP * 1.92, 1.45, pz);
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = Math.max(3, 12 * pb.s) + 4; ctx.beginPath(); seg(ctx, pb.x, pb.y, pt.x, pt.y); ctx.stroke();
        ctx.strokeStyle = w.edge; ctx.lineWidth = Math.max(2, 5 * pb.s); ctx.beginPath(); seg(ctx, pb.x, pb.y, pt.x, pt.y); ctx.stroke();
        ctx.fillStyle = '#fde047'; dot(ctx, pt.x, pt.y, Math.max(2.5, 6.5 * pb.s));
      }
    }

    if (!reduced && (isDemo || (r && r.phase === 'run'))) {
      ctx.strokeStyle = w.edge; ctx.globalAlpha = 0.38; ctx.lineWidth = 3; ctx.beginPath();
      for (var sl = 0; sl < 10; sl++) {
        var prog = (t * 2.4 + sl * 0.11) % 1, side = sl % 2 ? 1 : -1, lxS = side * (2.1 + (sl % 3) * 0.35), hS = 0.55 + (sl % 2) * 0.5;
        var p1 = project(lxS, hS, (1 - prog) * 58), p2 = project(lxS, hS, (1 - prog) * 58 - 7);
        seg(ctx, p1.x, p1.y, p2.x, p2.y);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    var drawables = [], curD = isDemo ? 5 : r.d;
    function addList(arr, k, maxZ, skip) {
      for (var i = 0; i < arr.length; i++) { var o = arr[i], z = o.d - curD; if (z > -2 && z < maxZ && !skip(o)) drawables.push([z, k, o]); }
    }
    if (!isDemo && r) {
      var bz = r.bossD - curD;
      if (bz > -4 && bz < 76 && !(r.phase === 'done' && r.result && r.result.won)) drawables.push([bz, 0, r]);
      addList(r.rows, 1, 74, function (o) { return !o.shown || o.passed; });
      addList(r.meteors, 3, 72, function (o) { return o.shattered || o.passed; });
      addList(r.hazards, 4, 70, function (o) { return o.passed; });
      addList(r.pads, 5, 70, function (o) { return o.used; });
      addList(r.coins, 6, 68, function (o) { return o.got; });
      addList(r.bolts, 7, 60, function () { return false; });
    } else {
      drawables.push([18.5, 2, { labels: [MG.MINUS + '3', '×3', '+10'], tones: ['bad', 'mega', 'good'], pips: [2, 8, 6] }],
        [11.2, 3, { lane: 0, hp: 8, maxHp: 8, kind: 'mech' }], [11.2, 3, { lane: 2, hp: 6, maxHp: 6, kind: 'mech' }],
        [reduced ? 9 : 7 + ((t * 22) % 10), 7, { x: -0.55 }], [reduced ? 11.5 : 7 + ((t * 22 + 5) % 10), 7, { x: 0.55 }]);
    }

    drawables.sort(function (a, b) { return b[0] - a[0]; });
    for (var di = 0; di < drawables.length; di++) {
      var it = drawables[di], z = it[0], k = it[1], o = it[2];
      if (k === 0) drawBoss(ctx, r, z, t);
      else if (k === 1) drawGateRow(ctx, r, o, z, t);
      else if (k === 2) drawDemoRow(ctx, o, z, t);
      else if (k === 3) drawMeteor(ctx, o, z, t);
      else if (k === 4) drawHazard(ctx, o, z);
      else if (k === 5) drawPad(ctx, o, z);
      else if (k === 6) drawCoin(ctx, o, z, t);
      else drawBolt(ctx, o, z, !isDemo && r && r.blasterBoost > 0);
    }

    if (!isDemo && r && r.phase === 'clash') drawClashBeam(ctx, r, t);
    drawSquad(ctx, isDemo ? demoRun : r, isDemo, t);
  }

  function drawPipsBar(ctx, x, y, s, pipsN, isBest) {
    var pipW = 11 * s, pipH = 7 * s, gap = 3 * s, totalW = 8 * pipW + 7 * gap, startX = x - totalW / 2;
    A.round(ctx, startX - 5 * s, y - 3 * s, totalW + 10 * s, pipH + 6 * s, 6 * s);
    ctx.fillStyle = 'rgba(10,14,38,.72)'; ctx.fill();
    for (var pk = 0; pk < 8; pk++) {
      ctx.fillStyle = pk < pipsN ? (isBest ? '#fde047' : '#38bdf8') : 'rgba(148,163,184,.28)';
      ctx.fillRect(startX + pk * (pipW + gap), y, pipW, pipH);
    }
  }

  function drawGateSweep(ctx, x, y, gw, gh, tone, t, laneIdx) {
    var gt = GATE_TONES[tone] || GATE_TONES.good;
    ctx.save();
    ctx.fillStyle = gt[5]; ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.ellipse(x, y, gw * 0.48, gh * 0.11, 0, 0, 6.283); ctx.fill();
    var sweep = ((t * 0.9 + laneIdx * 0.33) % 1.4) - 0.2;
    if (sweep >= 0 && sweep <= 1) {
      ctx.beginPath(); ctx.rect(x - gw * 0.38, y - gh * 0.84, gw * 0.76, gh * 0.76); ctx.clip();
      var sx = x - gw * 0.45 + sweep * gw * 0.95;
      ctx.fillStyle = 'rgba(255,255,255,.24)';
      ctx.beginPath(); ctx.moveTo(sx, y - gh * 0.86); ctx.lineTo(sx + gw * 0.16, y - gh * 0.86);
      ctx.lineTo(sx - gw * 0.08, y - gh * 0.06); ctx.lineTo(sx - gw * 0.24, y - gh * 0.06); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawGateRow(ctx, r, row, zRel, t) {
    for (var l = 0; l < 3; l++) {
      var g = row.gates[l], p = project((l - 1) + (row.moveOffset || 0), 0, zRel);
      var isMystery = g.mystery && !g.revealed, tone = isMystery ? 'mystery' : g.tone;
      var gw = 196 * p.s, gh = 158 * p.s;
      drawGateSweep(ctx, p.x, p.y, gw, gh, tone, t, l);
      A.blit(ctx, bakeGate(tone), p.x, p.y - gh * 0.48, { sx: p.s * 0.92, sy: p.s * 0.92 });

      if (row.hintBest && l === row.best) {
        ctx.save();
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = Math.max(2, 5 * p.s);
        ctx.globalAlpha = 0.65 + 0.3 * Math.sin(t * 6);
        A.round(ctx, p.x - gw * 0.46, p.y - gh * 0.93, gw * 0.92, gh * 0.88, 14 * p.s);
        ctx.stroke(); ctx.restore();
      }

      var label = isMystery ? '؟' : g.label, fontSize = (label.length > 5 ? 38 : 50) * p.s;
      if (fontSize >= 10) drawOutlinedText(ctx, label, p.x, p.y - gh * 0.50, fontSize, '#ffffff', isMystery ? 'rtl' : 'ltr');
      if (r.diff === 'easy' && row.pips && !isMystery && p.s > 0.25) drawPipsBar(ctx, p.x, p.y - gh * 0.17, p.s, row.pips[l], l === row.best);
    }
  }

  function drawDemoRow(ctx, dRow, zRel, t) {
    for (var l = 0; l < 3; l++) {
      var p = project(l - 1, 0, zRel), gw = 196 * p.s, gh = 158 * p.s;
      drawGateSweep(ctx, p.x, p.y, gw, gh, dRow.tones[l], t || 0, l);
      A.blit(ctx, bakeGate(dRow.tones[l]), p.x, p.y - gh * 0.48, { sx: p.s * 0.92, sy: p.s * 0.92 });
      drawOutlinedText(ctx, dRow.labels[l], p.x, p.y - gh * 0.50, 48 * p.s, '#ffffff', 'ltr');
      drawPipsBar(ctx, p.x, p.y - gh * 0.17, p.s, dRow.pips[l], l === 1);
    }
  }

  function drawMeteor(ctx, met, zRel, t) {
    var p = project(met.lane - 1, 0, zRel), rY = p.y - 46 * p.s;
    A.shadow(ctx, p.x - 36 * p.s, p.y - 16 * p.s, 72 * p.s, 22 * p.s, 0.5);
    A.blit(ctx, bakeMeteor(met.kind), p.x, rY, { sx: p.s, sy: p.s, rot: Kit.motion.reduced() ? 0 : t * 1.8 + met.lane });
    if (p.s > 0.22) drawOutlinedText(ctx, String(met.hp), p.x, rY, 34 * p.s, '#ffffff', 'ltr');
  }

  function drawHazard(ctx, haz, zRel) {
    for (var i = 0; i < haz.lanes.length; i++) {
      var l = haz.lanes[i], pL = project((l - 1) - 0.44, 0, zRel), pR = project((l - 1) + 0.44, 0, zRel);
      var beamY = pL.y - 16 * pL.s, pw = 10 * pL.s, ph = 26 * pL.s;
      ctx.save();
      ctx.strokeStyle = '#ff2a55'; ctx.lineWidth = Math.max(3, 11 * pL.s);
      ctx.beginPath(); ctx.moveTo(pL.x, beamY); ctx.lineTo(pR.x, beamY); ctx.stroke();
      ctx.strokeStyle = '#ffe4e6'; ctx.lineWidth = Math.max(1.5, 4 * pL.s);
      ctx.beginPath(); ctx.moveTo(pL.x, beamY); ctx.lineTo(pR.x, beamY); ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(pL.x - pw / 2, pL.y - ph, pw, ph); ctx.fillRect(pR.x - pw / 2, pR.y - ph, pw, ph);
      ctx.restore();
    }
  }

  function drawPad(ctx, pad, zRel) {
    var p = project(pad.lane - 1, 0, zRel);
    A.blit(ctx, getTurboSprite(), p.x, p.y - 6 * p.s, { sx: p.s, sy: p.s });
  }

  function drawCoin(ctx, coin, zRel, t) {
    var p = project(coin.lane - 1, 0.35 + (Kit.motion.reduced() ? 0 : Math.sin(t * 5 + coin.d) * 0.12), zRel);
    A.blit(ctx, getCoinSprite(), p.x, p.y, { sx: p.s, sy: p.s });
  }

  function drawBolt(ctx, bolt, zRel, boosted) {
    var p = project(bolt.x / MG.LANE_W, 0.55, zRel);
    A.blit(ctx, getBoltSprite(boosted), p.x, p.y, { sx: p.s, sy: p.s });
  }

  function drawBoss(ctx, r, zRel, t) {
    var p = project(0, 0, Math.max(5.5, zRel));
    var by = p.y - 96 * p.s + (Kit.motion.reduced() ? 0 : Math.sin(t * 3.5) * 6 * p.s);
    A.shadow(ctx, p.x - 85 * p.s, p.y - 24 * p.s, 170 * p.s, 36 * p.s, 0.6);
    A.blit(ctx, bakeBoss(r.world), p.x, by, { sx: p.s * 1.18, sy: p.s * 1.18 });
    if (p.s > 0.22) drawOutlinedText(ctx, String(r.phase === 'clash' ? r.bossHp : r.bossMax), p.x, by - 102 * p.s, 42 * p.s, '#ff6b81', 'ltr');
  }

  function drawClashBeam(ctx, r, t) {
    var bossP = project(0, 1.1, 5.5), squadP = project(r.x / MG.LANE_W, 0.8, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 28 + Math.sin(t * 30) * 6;
    ctx.beginPath(); ctx.moveTo(squadP.x, squadP.y); ctx.lineTo(bossP.x, bossP.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(squadP.x, squadP.y); ctx.lineTo(bossP.x, bossP.y); ctx.stroke();
    ctx.restore();
  }

  function drawSquad(ctx, r, isDemo, t) {
    if (!r || r.count <= 0) return;
    var skIdx = save.skin || 0, spr = bakeMech(skIdx), sk = MG.SKINS[skIdx] || MG.SKINS[0];
    var reduced = Kit.motion.reduced();
    var jumpH = (!isDemo && r.jumpT > 0) ? Math.sin((1 - r.jumpT / r.jumpDur) * Math.PI) * 1.65 : 0;
    var centerLane = isDemo ? 0 : (r.x / MG.LANE_W);
    var zBase = isDemo ? 6.5 : 0.4;
    var visCount = Math.min(isDemo ? 7 : 19, r.count);

    // Crisp V-wedge formation behind heroic Commander Mech (i === 0 leads at front tip!)
    var units = [{ i: 0, lx: centerLane, z: zBase + 0.45 }];
    var placed = 1, row = 1;
    while (placed < visCount) {
      var rowSlots = row + 1;
      for (var c = 0; c < rowSlots && placed < visCount; c++) {
        var norm = rowSlots === 1 ? 0 : (c / (rowSlots - 1) - 0.5) * 2;
        var spread = Math.min(0.46, row * 0.16);
        units.push({ i: placed++, lx: centerLane + norm * spread, z: zBase + 0.45 - row * 0.56 });
      }
      row++;
    }
    units.sort(function (a, b) { return b.z - a.z; });

    for (var k = 0; k < units.length; k++) {
      var uMech = units[k], isLead = uMech.i === 0;
      var stride = reduced ? 0 : Math.abs(Math.sin(t * 9 + uMech.i * 1.1)) * 0.11;
      var gp = project(uMech.lx, 0, uMech.z);
      var p = project(uMech.lx, jumpH + stride, uMech.z);
      var sc = p.s * (isLead ? 1.04 : 0.78);

      // Ground contact shadow + Commander cyan/gold hover ring
      ctx.save();
      ctx.fillStyle = 'rgba(4, 8, 28, 0.58)';
      ctx.beginPath(); ctx.ellipse(gp.x, gp.y + 4 * sc, 28 * sc, 9 * sc, 0, 0, 6.283); ctx.fill();
      if (isLead) {
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3 * sc; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(gp.x, gp.y + 4 * sc, 34 * sc, 11 * sc, 0, 0, 6.283); ctx.stroke();
      }
      ctx.restore();

      if (!reduced) {
        ctx.fillStyle = sk.flame;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 6 * sc, 9 * sc, (12 + Math.sin(t * 28 + uMech.i) * 4) * sc, 0, 0, 6.283); ctx.fill();
      }
      A.blit(ctx, spr, p.x, p.y - 34 * sc, { sx: sc, sy: sc });
    }

    var lead = project(centerLane, jumpH, zBase + 0.45);
    if (!isDemo && (r.jumpT > 0 || r.turboT > 0)) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8'; ctx.fillStyle = 'rgba(56, 189, 248, 0.18)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(lead.x, lead.y - 36, 76, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Holographic Squad Power Badge anchored cleanly BELOW the V-wedge (never overlaps gate labels!)
    var bScale = isDemo ? 0.84 : 0.98;
    var badgeY = isDemo ? (lead.y + 42) : Math.min(678, lead.y + 64);
    ctx.save();
    ctx.translate(lead.x, badgeY);
    ctx.scale(badgeSpring.sx * bScale, badgeSpring.sy * bScale);
    A.round(ctx, -48, -20, 96, 40, 20);
    A.outlined(ctx, '#10b981', 4);
    A.gloss(ctx, -42, -17, 84, 14);
    drawOutlinedText(ctx, '×' + r.count, 0, 1, 27, '#ffffff', 'ltr');
    ctx.restore();
  }

  /* --------------------------------------------------- Main Update & Loop */
  function update(dt) {
    if (mode !== 'paused') {
      animT += dt;
      badgeSpring.update(dt); fx.update(dt); A.pop.update(dt); A.shake.update(dt); A.flash.update(dt); A.blink(heroBlink);
      for (var ti = timers.length - 1; ti >= 0; ti--) {
        timers[ti].t -= dt;
        if (timers[ti].t <= 0) { var cb = timers[ti].fn; timers.splice(ti, 1); cb(); }
      }
    }

    if (mode === 'play' && run) {
      MG.step(run, dt, gatherPlayInput(dt));
      processEvents();
      if (mode === 'play') updateHudProgress();
      dirty = true;
    } else if (mode === 'result') {
      var beforeT = resultTimer; resultTimer += dt;
      if (resultInfo && resultInfo.res.won) {
        var stEls = $('res-stars').querySelectorAll('.star');
        for (var s = 0; s < resultInfo.res.stars; s++) {
          var trig = 0.18 + s * 0.26;
          if (beforeT < trig && resultTimer >= trig) { stEls[s].classList.add('on'); J.star(s + 1); }
        }
      }
      dirty = true;
    } else if (mode !== 'paused') dirty = true;

    Kit.keys.endFrame();
  }

  function render() {
    if (mode === 'paused' && !dirty) return;
    var ctx = view.ctx;
    ctx.save();
    ctx.clearRect(0, 0, 1280, 720);
    A.shake.apply(ctx);
    var showDemo = (mode === 'title' || mode === 'map' || mode === 'hangar');
    drawScene(ctx, showDemo ? demoRun : run, showDemo);
    fx.draw(ctx);
    ctx.save(); ctx.direction = 'ltr'; A.pop.draw(ctx); ctx.restore();
    A.flash.draw(ctx, 1280, 720); A.vignette(ctx, 1280, 720, 0.32);
    ctx.restore();
    dirty = false;
  }

  /* --------------------------------------------------- Test & Scenario Hook */
  function rowSnapshot(row) {
    if (!row) return null;
    return {
      i: row.i, d: row.d, shown: row.shown, passed: row.passed, best: row.best, pick: row.pick,
      hintBest: row.hintBest, moving: row.moving, pips: row.pips ? row.pips.slice() : null,
      labels: row.gates ? row.gates.map(function (g) { return g.label; }) : null,
      results: row.gates && run ? row.gates.map(function (g) { return MG.applyGate(g, run.count); }) : null
    };
  }

  function snapshot() {
    var r = run;
    return {
      screen: mode, paused: mode === 'paused', stage: curStage, level: curStage, attempt: attempt,
      world: r ? r.world : 0, diff: save.diff, endless: r ? r.endless : false, wave: r ? r.wave : 1,
      lane: r ? r.lane : 1, x: r ? Math.round(r.x * 1000) / 1000 : 0,
      d: r ? Math.round(r.d * 1000) / 1000 : 0, t: r ? Math.round(r.t * 1000) / 1000 : 0,
      count: r ? r.count : 0, par: r ? r.par : 0, rival: r ? r.bossMax : 0,
      bossMax: r ? r.bossMax : 0, bossHp: r ? r.bossHp : 0, bossD: r ? r.bossD : 0,
      phase: r ? r.phase : '', jumpT: r ? Math.round(r.jumpT * 1000) / 1000 : 0,
      runCoins: r ? r.runCoins : 0, coins: save.coins, skin: save.skin,
      passed: r ? r.next : 0, rows: r ? r.R : 0, next: r ? rowSnapshot(r.rows[r.next]) : null,
      meteors: r ? r.meteors.map(function (m) {
        return { id: m.id, d: m.d, lane: m.lane, hp: m.hp, maxHp: m.maxHp, kind: m.kind, shattered: m.shattered };
      }) : [],
      hazards: r ? r.hazards.map(function (h) {
        return { id: h.id, d: h.d, lanes: h.lanes.slice(), passed: h.passed, hit: h.hit };
      }) : [],
      result: resultInfo ? resultInfo.res : null,
      popup: $('popup').hidden ? '' : $('popup').textContent,
      calm: Kit.motion.reduced()
    };
  }

  function laneClientPoint(lane) {
    var p = project(clampVal(lane, 0, 2) - 1, 0, 6), rect = canvas.getBoundingClientRect();
    return { x: rect.left + p.x * view.scale, y: rect.top + p.y * view.scale };
  }

  /* ----------------------------------------------------------- Boot */
  Kit.muteButton();
  Kit.lifecycle({ pause: function () { pauseGame(false); }, reset: function () { resetInputState(); } });
  Kit.motion.onChange(function () { dirty = true; });

  var loop = null;
  try {
    toTitle();
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      lanePoint: laneClientPoint
    };
    loop = A.loop(update, render);
    Kit.ready();
  } catch (err) {
    if (loop) loop.stop();
    for (var sk in SCREEN_IDS) $(SCREEN_IDS[sk]).hidden = true;
    $('error-screen').hidden = false; body.dataset.mode = 'error';
    Kit.fail(err);
  }
})();

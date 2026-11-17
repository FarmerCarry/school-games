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
  var view = Kit.fit(canvas, 1280, 720, { onResize: function (v) { syncUi(v); dirty = true; } });
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
  function bakeMech(idx) {
    var sk = MG.SKINS[idx] || MG.SKINS[0];
    return A.sprite('mech_' + idx, 84, 96, function (c, w) {
      var cx = w / 2;
      A.round(c, 12, 34, 14, 28, 6); A.outlined(c, A.shade(sk.primary, -0.35), 3);
      A.round(c, w - 26, 34, 14, 28, 6); A.outlined(c, A.shade(sk.primary, -0.35), 3);
      A.round(c, 24, 66, 14, 22, 6); A.outlined(c, A.shade(sk.primary, -0.2), 3.2);
      A.round(c, 46, 66, 14, 22, 6); A.outlined(c, A.shade(sk.primary, -0.2), 3.2);
      A.round(c, 6, 38, 16, 22, 7); A.outlined(c, sk.secondary, 3);
      A.round(c, w - 22, 38, 16, 22, 7); A.outlined(c, sk.secondary, 3);
      c.fillStyle = '#0e1028';
      c.beginPath(); c.arc(14, 55, 4, 0, 6.283); c.arc(w - 14, 55, 4, 0, 6.283); c.fill();
      A.round(c, 20, 38, 44, 34, 12); A.outlined(c, sk.primary, 3.5);
      c.beginPath(); c.arc(cx, 55, 7.5, 0, 6.283); A.outlined(c, sk.secondary, 2.5);
      c.beginPath();
      if (idx === 1) {
        c.moveTo(22, 18); c.lineTo(12, 3); c.lineTo(31, 14);
        c.moveTo(62, 18); c.lineTo(72, 3); c.lineTo(53, 14);
      } else if (idx === 2) {
        c.moveTo(18, 22); c.lineTo(6, 10); c.lineTo(24, 14);
        c.moveTo(66, 22); c.lineTo(78, 10); c.lineTo(60, 14);
      } else {
        c.moveTo(cx - 5, 14); c.lineTo(cx, 3); c.lineTo(cx + 5, 14);
      }
      A.outlined(c, sk.secondary, 3);
      A.round(c, 18, 12, 48, 32, 14); A.outlined(c, sk.primary, 3.5);
      A.gloss(c, 22, 14, 40, 14);
      A.round(c, 23, 20, 38, 16, 7); A.outlined(c, '#0b1026', 2.5);
      c.fillStyle = sk.visor;
      c.beginPath(); c.arc(cx - 9, 28, 4.2, 0, 6.283); c.arc(cx + 9, 28, 4.2, 0, 6.283); c.fill();
    }, { pad: 6 });
  }

  function bakeBoss(worldIdx) {
    var w = MG.WORLDS[worldIdx % MG.WORLDS.length];
    return A.sprite('boss_' + (worldIdx % 4), 210, 210, function (c, bw) {
      var cx = bw / 2;
      A.round(c, 18, 34, 38, 52, 10); A.outlined(c, '#334155', 4);
      A.round(c, bw - 56, 34, 38, 52, 10); A.outlined(c, '#334155', 4);
      c.fillStyle = '#ef4444';
      for (var m = 0; m < 2; m++) {
        c.beginPath(); c.arc(30 + m * 14, 48, 4.5, 0, 6.283); c.arc(bw - 44 + m * 14, 48, 4.5, 0, 6.283); c.fill();
      }
      A.round(c, 58, 148, 32, 50, 10); A.outlined(c, '#1e293b', 4);
      A.round(c, bw - 90, 148, 32, 50, 10); A.outlined(c, '#1e293b', 4);
      A.round(c, 10, 78, 34, 62, 12); A.outlined(c, w.edge, 4);
      A.round(c, bw - 44, 78, 34, 62, 12); A.outlined(c, w.edge, 4);
      A.round(c, 40, 66, 130, 92, 22); A.outlined(c, '#1e293b', 4.5);
      A.round(c, 56, 82, 98, 60, 16); A.outlined(c, A.shade(w.edge, -0.45), 3.5);
      c.beginPath(); c.arc(cx, 112, 20, 0, 6.283); A.outlined(c, w.edge, 3.5);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx - 5, 107, 6, 0, 6.283); c.fill();
      c.beginPath();
      c.moveTo(68, 44); c.lineTo(44, 10); c.lineTo(84, 34);
      c.moveTo(bw - 68, 44); c.lineTo(bw - 44, 10); c.lineTo(bw - 84, 34);
      A.outlined(c, '#fbbf24', 4);
      A.round(c, 64, 26, 82, 50, 16); A.outlined(c, '#0f172a', 4.5);
      A.round(c, 74, 42, 62, 18, 8); A.outlined(c, '#ff2a55', 3);
      A.gloss(c, 76, 44, 58, 8);
    }, { pad: 8 });
  }

  var GATE_TONES = {
    good: { mid: '#38bdf8', fill: 'rgba(14, 165, 233, 0.44)', rim: '#7dd3fc' },
    mega: { mid: '#4ade80', fill: 'rgba(34, 197, 94, 0.48)', rim: '#fde047' },
    bad:  { mid: '#fb7185', fill: 'rgba(239, 68, 68, 0.46)', rim: '#fda4af' },
    mystery: { mid: '#c084fc', fill: 'rgba(168, 85, 247, 0.5)', rim: '#f0abfc' }
  };

  function bakeGate(tone) {
    var p = GATE_TONES[tone] || GATE_TONES.good;
    return A.sprite('gate_' + tone, 210, 164, function (c, w, h) {
      A.round(c, 16, 18, w - 32, h - 30, 16);
      c.fillStyle = p.fill; c.fill();
      c.strokeStyle = p.rim; c.lineWidth = 4; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      for (var y = 34; y < h - 24; y += 16) c.fillRect(22, y, w - 44, 4);
      A.round(c, 12, 8, w - 24, 24, 10); A.outlined(c, p.mid, 3.5);
      A.gloss(c, 16, 10, w - 32, 10);
      A.round(c, 4, 14, 16, h - 18, 7); A.outlined(c, '#1e293b', 3.5);
      A.round(c, w - 20, 14, 16, h - 18, 7); A.outlined(c, '#1e293b', 3.5);
      c.fillStyle = p.mid; c.fillRect(9, 32, 6, h - 54); c.fillRect(w - 15, 32, 6, h - 54);
    }, { pad: 6 });
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
  var HORIZON_Y = 212, PLAYER_Y = 616, CAM_DIST = 14;
  function clampVal(v, a, b) { return v < a ? a : v > b ? b : v; }

  function project(laneCoord, heightM, zRel) {
    var s = CAM_DIST / Math.max(1.4, zRel + CAM_DIST);
    return { x: 640 + laneCoord * 268 * s, y: HORIZON_Y + (PLAYER_Y - HORIZON_Y) * s - (heightM || 0) * 66 * s, s: s };
  }

  function laneFromLogicalX(lx, ly) {
    var s = Math.max(0.28, (clampVal(ly, HORIZON_Y + 40, 700) - HORIZON_Y) / (PLAYER_Y - HORIZON_Y));
    var norm = (lx - 640) / (268 * s);
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
  var stageButtons = [];
  function buildMap() {
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

  function toMap() { run = null; refreshMap(); setMode('map'); J.whoosh(0.35); }

  /* --------------------------------------------------- Mech Hangar Shop */
  var skinCards = [];
  function buildHangar() {
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

  function openHangar(from) { hangarFrom = from || 'title'; run = null; refreshHangar(); setMode('hangar'); J.select(); }
  function closeHangar() { J.back(); if (hangarFrom === 'map') toMap(); else toTitle(); }

  function pickSkin(idx, el) {
    var out = MG.buyOrEquipSkin(save, idx);
    if (!out.ok) {
      J.error();
      el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle');
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
    $('hud-squad').textContent = '×' + run.count;
    $('hud-boss').textContent = String(run.bossMax);
    updateHudProgress();

    Kit.stats.round(stObj.roundKey);

    var b = $('banner');
    b.textContent = stObj.endless ? 'طور الفضاء اللانهائي' : MG.WORLDS[stObj.world].name + ' — ' + stObj.tag;
    b.hidden = false;
    later(1.8, function () { b.hidden = true; });

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
        fx.burst(jp.x, jp.y, { n: 14, speed: 180, life: 0.45, size: 7, shape: 'spark', color: '#38bdf8' });
      } else if (e.t === 'coin') {
        J.coin(1 + (e.total % 5)); $('hud-coins').textContent = String(run.runCoins);
      } else if (e.t === 'boltHit') {
        if (animT - lastBoltSfx > 0.16) { lastBoltSfx = animT; J.pop(0.2); }
        var hpPt = project(e.lane - 1, 0.8, e.d - run.d);
        fx.burst(hpPt.x, hpPt.y, { n: 4, speed: 120, life: 0.25, size: 5, shape: 'spark', color: '#38bdf8' });
      } else if (e.t === 'meteorBreak') {
        J.impact(0.65); A.shake.add(0.22);
        var mp = project(e.lane - 1, 0.9, e.d - run.d);
        var mCol = e.kind === 'laser' ? '#c084fc' : e.kind === 'coin' ? '#ffd23f' : '#2eff9b';
        fx.burst(mp.x, mp.y, { n: 22, speed: 240, life: 0.65, size: 9, shape: 'star', color: mCol });
        if (e.kind === 'mech') { A.pop('+' + e.val, mp.x, mp.y - 20, { color: '#2eff9b', size: 32 }); badgeSpring.kick(4.5); }
        else if (e.kind === 'coin') { $('hud-coins').textContent = String(run.runCoins); A.pop('+' + e.val, mp.x, mp.y - 20, { color: '#ffd23f', size: 30 }); }
        else { $('hud-coins').textContent = String(run.runCoins); showPopup('مدفع الليزر المزدوج!', 'boost', 1.3); }
      } else if (e.t === 'shieldBreak') {
        J.chime(2);
        var sp = project(e.lane - 1, 1.2, run.rows[e.row].d - run.d);
        fx.burst(sp.x, sp.y, { n: 16, speed: 200, life: 0.5, size: 8, shape: 'spark', color: '#e879f9' });
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
          fx.burst(gp.x, gp.y - 30, { n: 24, speed: 230, life: 0.65, size: 9, shape: 'confetti', color: '#2eff9b' });
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
        fx.burst(640, 390, { n: 6, speed: 220, life: 0.4, size: 8, shape: 'spark', color: '#ffd23f' });
      } else if (e.t === 'won') {
        J.levelUp(); A.shake.add(0.45); A.flash('#2eff9b', 180);
        fx.burst(640, 340, { n: 55, speed: 320, life: 1.1, size: 11, shape: 'star', color: '#ffd23f' });
      } else if (e.t === 'lost') {
        J.fail(); A.shake.add(0.35);
      } else if (e.t === 'done') finishRun();
    }
    ev.length = 0;
  }

  function updateHudProgress() {
    if (!run) return;
    var p = MG.progress(run);
    $('trip-fill').style.width = (p * 100).toFixed(1) + '%';
    $('trip-me').style.left = 'calc(' + (p * 100).toFixed(1) + '% - 20px)';
    $('hud-squad').textContent = '×' + run.count;
    $('hud-boss').textContent = String(run.phase === 'clash' ? run.bossHp : run.bossMax);
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
  function drawOutlinedText(ctx, text, x, y, size, fill, dir, lineW) {
    ctx.save();
    ctx.direction = dir || 'ltr';
    ctx.font = '700 ' + Math.max(11, Math.round(size)) + 'px Fredoka';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = lineW || Math.max(3, size * 0.14);
    ctx.strokeStyle = '#0b0e26'; ctx.strokeText(text, x, y);
    ctx.fillStyle = fill || '#ffffff'; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawScene(ctx, r, isDemo) {
    var wIdx = r ? r.world : 0, w = MG.WORLDS[wIdx % MG.WORLDS.length];
    var reduced = Kit.motion.reduced(), t = reduced ? 0 : animT;

    var sky = A.sky('sky_' + wIdx, 1280, HORIZON_Y + 30, w.sky);
    if (sky.canvas) ctx.drawImage(sky.canvas, 0, 0, 1280, HORIZON_Y + 30);
    else { ctx.fillStyle = w.sky[0]; ctx.fillRect(0, 0, 1280, HORIZON_Y + 30); }

    ctx.fillStyle = '#ffffff';
    for (var si = 0; si < 38; si++) {
      var sx = ((si * 197 + 53) % 1260) + 10, sy = ((si * 89 + 17) % (HORIZON_Y - 18)) + 8;
      ctx.globalAlpha = reduced ? 0.75 : 0.45 + 0.5 * Math.sin(t * 2.5 + si);
      ctx.fillRect(sx, sy, (si % 3 === 0) ? 3 : 2, (si % 3 === 0) ? 3 : 2);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    var px = 980, py = 112;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.ellipse(px, py, 92, 22, -0.22, 0, 6.283); ctx.stroke();
    var pg = ctx.createRadialGradient(px - 18, py - 18, 8, px, py, 52);
    pg.addColorStop(0, w.accent); pg.addColorStop(1, w.sky[0]);
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 50, 0, 6.283); ctx.fill();
    ctx.restore();

    var cruiser = getCruiserSprite(), cDrift = reduced ? 0 : ((t * 22) % 1480);
    A.blit(ctx, cruiser, 1360 - cDrift, 96, { sx: 0.72, sy: 0.72, alpha: 0.85 });
    A.blit(ctx, cruiser, 260 + (reduced ? 0 : Math.sin(t * 0.8) * 18), 142, { sx: 0.5, sy: 0.5, alpha: 0.65 });

    // Cyber spaceport horizon silhouettes flanking the highway
    ctx.fillStyle = '#08112b';
    for (var ti = 0; ti < 10; ti++) {
      var tx = ti < 5 ? 36 + ti * 84 : 840 + (ti - 5) * 84;
      var th = 22 + ((ti * 19) % 38);
      ctx.fillRect(tx, HORIZON_Y - th, 44, th + 4);
      ctx.fillStyle = w.edge; ctx.globalAlpha = 0.35;
      ctx.fillRect(tx + 8, HORIZON_Y - th + 6, 28, 3);
      ctx.fillStyle = '#08112b'; ctx.globalAlpha = 1;
    }

    var bgGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, 720);
    bgGrad.addColorStop(0, w.sky[1]); bgGrad.addColorStop(1, '#040717');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, HORIZON_Y, 1280, 720 - HORIZON_Y);

    // Pseudo-3D Star-Cruiser Highway
    var topL = project(-1.5, 0, 76), topR = project(1.5, 0, 76);
    var botL = project(-1.5, 0, -3), botR = project(1.5, 0, -3);
    ctx.beginPath();
    ctx.moveTo(topL.x, topL.y); ctx.lineTo(topR.x, topR.y); ctx.lineTo(botR.x, botR.y); ctx.lineTo(botL.x, botL.y);
    ctx.closePath(); ctx.fillStyle = w.track; ctx.fill();

    var midTL = project(-0.5, 0, 76), midTR = project(0.5, 0, 76);
    var midBL = project(-0.5, 0, -3), midBR = project(0.5, 0, -3);
    ctx.beginPath();
    ctx.moveTo(midTL.x, midTL.y); ctx.lineTo(midTR.x, midTR.y); ctx.lineTo(midBR.x, midBR.y); ctx.lineTo(midBL.x, midBL.y);
    ctx.closePath(); ctx.fillStyle = w.laneAlt; ctx.fill();

    var dVal = isDemo ? (t * 14) : r.d, firstGrid = Math.floor(dVal / 6) * 6;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'; ctx.lineWidth = 2;
    for (var gd = firstGrid; gd < dVal + 74; gd += 6) {
      var gz = gd - dVal;
      if (gz < -2) continue;
      var gl = project(-1.48, 0, gz), gr = project(1.48, 0, gz);
      ctx.beginPath(); ctx.moveTo(gl.x, gl.y); ctx.lineTo(gr.x, gr.y); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(midTL.x, midTL.y); ctx.lineTo(midBL.x, midBL.y);
    ctx.moveTo(midTR.x, midTR.y); ctx.lineTo(midBR.x, midBR.y);
    ctx.stroke();

    ctx.strokeStyle = w.edge; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(topL.x, topL.y); ctx.lineTo(botL.x, botL.y);
    ctx.moveTo(topR.x, topR.y); ctx.lineTo(botR.x, botR.y);
    ctx.stroke();

    if (!reduced && (isDemo || (r && r.phase === 'run'))) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)'; ctx.lineWidth = 2.5;
      for (var sl = 0; sl < 8; sl++) {
        var prog = (t * 2.2 + sl * 0.13) % 1, side = sl % 2 === 0 ? -1 : 1;
        var p1 = project(side * 1.75, 0.4, (1 - prog) * 55), p2 = project(side * 1.75, 0.4, (1 - prog) * 55 - 6);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
    }

    var drawables = [], curD = isDemo ? 5 : r.d;
    if (!isDemo && r) {
      var bz = r.bossD - curD;
      if (bz > -4 && bz < 76 && !(r.phase === 'done' && r.result && r.result.won)) drawables.push({ z: bz, kind: 'boss' });
      for (var ri = 0; ri < r.rows.length; ri++) {
        var row = r.rows[ri], rz = row.d - curD;
        if (row.shown && !row.passed && rz > -2 && rz < 74) drawables.push({ z: rz, kind: 'row', row: row });
      }
      for (var mi = 0; mi < r.meteors.length; mi++) {
        var met = r.meteors[mi], mz = met.d - curD;
        if (!met.shattered && !met.passed && mz > -2 && mz < 72) drawables.push({ z: mz, kind: 'meteor', met: met });
      }
      for (var hi = 0; hi < r.hazards.length; hi++) {
        var haz = r.hazards[hi], hz = haz.d - curD;
        if (!haz.passed && hz > -2 && hz < 70) drawables.push({ z: hz, kind: 'hazard', haz: haz });
      }
      for (var pi = 0; pi < r.pads.length; pi++) {
        var pad = r.pads[pi], pz = pad.d - curD;
        if (!pad.used && pz > -2 && pz < 70) drawables.push({ z: pz, kind: 'pad', pad: pad });
      }
      for (var ci = 0; ci < r.coins.length; ci++) {
        var cn = r.coins[ci], cz = cn.d - curD;
        if (!cn.got && cz > -2 && cz < 68) drawables.push({ z: cz, kind: 'coin', coin: cn });
      }
      for (var bi = 0; bi < r.bolts.length; bi++) {
        var blt = r.bolts[bi], blz = blt.d - curD;
        if (blz > -1 && blz < 60) drawables.push({ z: blz, kind: 'bolt', bolt: blt });
      }
    } else {
      // Showcase scene positioned cleanly in the open center window above .command-deck!
      drawables.push({ z: 26.5, kind: 'demoRow', labels: [MG.MINUS + '3', '×3', '+10'], tones: ['bad', 'mega', 'good'], pips: [2, 8, 6] });
      drawables.push({ z: 16.5, kind: 'demoMeteor', lane: 0, hp: 8 });
      drawables.push({ z: 16.5, kind: 'demoMeteor', lane: 2, hp: 6 });
      var bOff1 = reduced ? 12 : 10 + ((t * 24) % 14);
      var bOff2 = reduced ? 14.5 : 10 + ((t * 24 + 7) % 14);
      drawables.push({ z: bOff1, kind: 'bolt', bolt: { x: -0.55 } });
      drawables.push({ z: bOff2, kind: 'bolt', bolt: { x: 0.55 } });
    }

    drawables.sort(function (a, b) { return b.z - a.z; });
    for (var di = 0; di < drawables.length; di++) {
      var it = drawables[di];
      if (it.kind === 'boss') drawBoss(ctx, r, it.z, t);
      else if (it.kind === 'row') drawGateRow(ctx, r, it.row, it.z, t);
      else if (it.kind === 'demoRow') drawDemoRow(ctx, it, it.z);
      else if (it.kind === 'meteor') drawMeteor(ctx, it.met, it.z, t);
      else if (it.kind === 'demoMeteor') drawMeteor(ctx, { lane: it.lane, hp: it.hp, maxHp: it.hp, kind: 'mech' }, it.z, t);
      else if (it.kind === 'hazard') drawHazard(ctx, it.haz, it.z);
      else if (it.kind === 'pad') drawPad(ctx, it.pad, it.z);
      else if (it.kind === 'coin') drawCoin(ctx, it.coin, it.z, t);
      else if (it.kind === 'bolt') drawBolt(ctx, it.bolt, it.z, !isDemo && r && r.blasterBoost > 0);
    }

    if (!isDemo && r && r.phase === 'clash') drawClashBeam(ctx, r, t);
    drawSquad(ctx, isDemo ? demoRun : r, isDemo, t);
  }

  function drawPipsBar(ctx, x, y, s, pipsN, isBest) {
    var pipW = 12 * s, pipH = 7 * s, gap = 3 * s, startX = x - (8 * pipW + 7 * gap) / 2;
    for (var pk = 0; pk < 8; pk++) {
      ctx.fillStyle = pk < pipsN ? (isBest ? '#fde047' : '#7dd3fc') : 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(startX + pk * (pipW + gap), y, pipW, pipH);
    }
  }

  function drawGateRow(ctx, r, row, zRel, t) {
    for (var l = 0; l < 3; l++) {
      var g = row.gates[l], p = project((l - 1) + (row.moveOffset || 0), 0, zRel);
      var isMystery = g.mystery && !g.revealed;
      var gw = 196 * p.s, gh = 154 * p.s;
      A.blit(ctx, bakeGate(isMystery ? 'mystery' : g.tone), p.x, p.y - gh * 0.48, { sx: p.s * 0.94, sy: p.s * 0.94 });

      if (row.hintBest && l === row.best) {
        ctx.save();
        ctx.strokeStyle = '#2eff9b'; ctx.lineWidth = Math.max(2, 5 * p.s);
        ctx.globalAlpha = 0.65 + 0.3 * Math.sin(t * 6);
        A.round(ctx, p.x - gw * 0.44, p.y - gh * 0.9, gw * 0.88, gh * 0.82, 12 * p.s);
        ctx.stroke(); ctx.restore();
      }

      var label = isMystery ? '؟' : g.label, fontSize = (label.length > 5 ? 34 : 44) * p.s;
      if (fontSize >= 10) drawOutlinedText(ctx, label, p.x, p.y - gh * 0.48, fontSize, '#ffffff', isMystery ? 'rtl' : 'ltr');
      if (r.diff === 'easy' && row.pips && !isMystery && p.s > 0.25) drawPipsBar(ctx, p.x, p.y - gh * 0.16, p.s, row.pips[l], l === row.best);
    }
  }

  function drawDemoRow(ctx, dRow, zRel) {
    for (var l = 0; l < 3; l++) {
      var p = project(l - 1, 0, zRel), gh = 154 * p.s;
      A.blit(ctx, bakeGate(dRow.tones[l]), p.x, p.y - gh * 0.48, { sx: p.s * 0.94, sy: p.s * 0.94 });
      drawOutlinedText(ctx, dRow.labels[l], p.x, p.y - gh * 0.48, 42 * p.s, '#ffffff', 'ltr');
      drawPipsBar(ctx, p.x, p.y - gh * 0.16, p.s, dRow.pips[l], l === 1);
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
    var zBase = isDemo ? 8.2 : 0;
    var visCount = Math.min(isDemo ? 9 : 28, r.count);

    var units = [];
    for (var i = 0; i < visCount; i++) {
      var ring = i === 0 ? 0 : Math.floor((i + 2) / 3), slot = i === 0 ? 0 : ((i - 1) % 3) - 1;
      units.push({ i: i, lx: centerLane + slot * 0.24 + ((i % 2 === 0 ? 1 : -1) * (ring % 2) * 0.06), z: zBase + ring * 0.85 });
    }
    units.sort(function (a, b) { return b.z - a.z; });

    for (var k = 0; k < units.length; k++) {
      var uMech = units[k], stride = reduced ? 0 : Math.abs(Math.sin(t * 9 + uMech.i * 1.1)) * 0.1;
      var p = project(uMech.lx, jumpH + stride, uMech.z);
      var sc = p.s * (uMech.i === 0 ? 0.92 : 0.76);
      if (!reduced) {
        ctx.fillStyle = sk.flame;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 6 * sc, 9 * sc, (12 + Math.sin(t * 28 + uMech.i) * 4) * sc, 0, 0, 6.283); ctx.fill();
      }
      A.blit(ctx, spr, p.x, p.y - 34 * sc, { sx: sc, sy: sc });
    }

    var lead = project(centerLane, jumpH, zBase);
    if (!isDemo && (r.jumpT > 0 || r.turboT > 0)) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8'; ctx.fillStyle = 'rgba(56, 189, 248, 0.18)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(lead.x, lead.y - 36, 76, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Chunky Squad Power Badge above lead Mech
    var bScale = isDemo ? 0.78 : 1;
    ctx.save();
    ctx.translate(lead.x, lead.y - (isDemo ? 74 : 102));
    ctx.scale(badgeSpring.sx * bScale, badgeSpring.sy * bScale);
    A.round(ctx, -46, -22, 92, 44, 22);
    A.outlined(ctx, '#10b981', 4);
    drawOutlinedText(ctx, '×' + r.count, 0, 1, 28, '#ffffff', 'ltr', 4);
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
    fx.draw(ctx); A.pop.draw(ctx); A.flash.draw(ctx, 1280, 720); A.vignette(ctx, 1280, 720, 0.32);
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
    buildMap(); buildHangar(); toTitle(); render();
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

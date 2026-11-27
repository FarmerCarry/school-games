/* Balloon Blast — Canvas renderer, one-shot SFX (Kit.juice), UI, shop, and telemetry. */
(function () {
  'use strict';

  var D = window.BBData, E = window.BBEngine, AI = window.BBAI;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui'), W = 1280, H = 720, TILE = D.TILE;
  var OX = (W - D.COLS * TILE) / 2, OY = 96, pausePainted = false;

  function place(v) {
    ui.style.transform = 'translate(' + canvas.style.left + ',' + canvas.style.top + ') scale(' + v.scale + ')';
    pausePainted = false;
  }
  var view = Kit.fit(canvas, W, H, { onResize: place });
  Kit.muteButton();

  var store = Kit.store('balloon-blast');
  var saveUI = Kit.saveStatus({ retry: function () { persist(); } });
  var dda = Kit.dda('balloon-blast', { id: 'main', target: 0.7, tiers: 5 });
  var shake = Kit.shake ? Kit.shake() : { x: 0, y: 0, add: function () {}, update: function () {} };

  function clampInt(n, lo, hi) { n = n | 0; return n < lo ? lo : n > hi ? hi : n; }
  function loadSave() {
    var raw = store.get('save', null);
    var s = { v: 2, coins: 0, stars: 0, wins: 0, diff: 'normal', skin: 'ninja', owned: { ninja: 1 }, best: {} };
    if (raw && typeof raw === 'object') {
      s.coins = clampInt(raw.coins, 0, 999999); s.stars = clampInt(raw.stars, 0, 9999); s.wins = clampInt(raw.wins, 0, 9999);
      if (D.DIFFICULTIES[raw.diff]) s.diff = raw.diff;
      if (raw.owned && typeof raw.owned === 'object') D.SKINS.forEach(function (sk) { if (raw.owned[sk.id]) s.owned[sk.id] = 1; });
      if (s.owned[raw.skin]) s.skin = raw.skin;
      if (raw.best && typeof raw.best === 'object') D.STAGES.forEach(function (st) { s.best[st.id] = clampInt(raw.best[st.id], 0, 3); });
    }
    return s;
  }
  var save = loadSave();
  function persist() { var ok = store.set('save', save) !== false; if (ok) saveUI.saved(); else saveUI.failed(); return ok; }

  var sfx = {
    tap: function () { if (Kit.juice) Kit.juice.tap(); },
    select: function () { if (Kit.juice) Kit.juice.select(); },
    back: function () { if (Kit.juice) Kit.juice.back(); },
    drop: function () { if (Kit.juice) Kit.juice.pop(0.4); },
    kick: function () { if (Kit.juice) Kit.juice.whoosh(0.75); },
    warp: function () { if (Kit.juice) Kit.juice.chime(1); },
    item: function () { if (Kit.juice) Kit.juice.coin(); },
    shield: function () { if (Kit.juice) Kit.juice.pop(0.85); },
    ko: function () { if (Kit.juice) Kit.juice.star(2); },
    win: function () { if (Kit.juice) Kit.juice.levelUp(); },
    lose: function () { if (Kit.juice) Kit.juice.fail(); },
    pause: function (on) { if (Kit.juice) Kit.juice.toggle(!!on); },
    splash: function (cells) {
      if (Kit.juice) { Kit.juice.whoosh(Math.min(1, 0.7 + (cells || 3) * 0.04)); Kit.juice.pop(0.75); if (cells >= 7) Kit.juice.streak(3); }
      if (Kit.audio && typeof Kit.audio.noise === 'function') { try { Kit.audio.noise(0.14, 0.16, 1200); } catch (e) {} }
    }
  };

  /* ---- Procedural Cartoon Sprites (Bounded Static Keys) ---- */
  var SPR = {}, localSprites = {}, bakedArena = null;
  function makeSprite(key, w, h, drawFn) {
    if (!localSprites[key]) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      drawFn(cv.getContext('2d'), w, h); localSprites[key] = cv;
    }
    return localSprites[key];
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function drawEyes(c, cx, cy, dir, rad) {
    var lx = dir === 1 ? 3 : dir === 3 ? -3 : 0, ly = dir === 2 ? 2.5 : dir === 0 ? -2.5 : 0;
    for (var s = -1; s <= 1; s += 2) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(cx + s * rad * 0.36, cy, rad * 0.27, rad * 0.32, 0, 0, 6.283); c.fill();
      c.strokeStyle = '#0f2942'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#0f2942'; c.beginPath(); c.arc(cx + s * rad * 0.36 + lx, cy + ly, rad * 0.14, 0, 6.283); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + s * rad * 0.36 + lx - 1.8, cy + ly - 2, rad * 0.055, 0, 6.283); c.fill();
    }
  }

  function bootSprites() {
    bakedArena = null;
    ['sand', 'soda', 'soap'].forEach(function (aid) {
      var a = D.ARENAS[aid];
      SPR['fl_' + aid] = makeSprite('fl_' + aid, TILE, TILE, function (c) {
        c.fillStyle = a.floor[0]; c.fillRect(0, 0, TILE, TILE);
        c.fillStyle = a.floor[1]; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32);
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.arc(16, 16, 4, 0, 6.283); c.fill();
      });
      SPR['pl_' + aid] = makeSprite('pl_' + aid, TILE, TILE, function (c) {
        rr(c, 4, 6, TILE - 8, TILE - 8, 12); c.fillStyle = a.pillarDk; c.fill();
        rr(c, 4, 3, TILE - 8, TILE - 12, 12); c.fillStyle = a.pillar; c.fill();
        c.lineWidth = 3; c.strokeStyle = '#0f2942'; c.stroke();
        rr(c, 10, 8, TILE - 20, 12, 6); c.fillStyle = a.pillarHi; c.fill();
      });
      SPR['cr_' + aid] = makeSprite('cr_' + aid, TILE, TILE, function (c) {
        rr(c, 5, 7, TILE - 10, TILE - 10, 10); c.fillStyle = a.crateDk; c.fill();
        rr(c, 5, 4, TILE - 10, TILE - 12, 10); c.fillStyle = a.crate; c.fill();
        c.lineWidth = 3; c.strokeStyle = '#0f2942'; c.stroke();
        c.strokeStyle = a.crateHi; c.lineWidth = 4;
        c.beginPath(); c.moveTo(13, 12); c.lineTo(TILE - 13, TILE - 16); c.moveTo(TILE - 13, 12); c.lineTo(13, TILE - 16); c.stroke();
      });
      SPR['pp_' + aid] = makeSprite('pp_' + aid, TILE, TILE, function (c) {
        c.fillStyle = a.floor[0]; c.fillRect(0, 0, TILE, TILE);
        c.fillStyle = a.pipeDk; c.beginPath(); c.arc(32, 34, 24, 0, 6.283); c.fill();
        c.fillStyle = a.pipe; c.beginPath(); c.arc(32, 30, 24, 0, 6.283); c.fill();
        c.lineWidth = 3.5; c.strokeStyle = '#0f2942'; c.stroke();
        c.fillStyle = '#082f49'; c.beginPath(); c.arc(32, 30, 14, 0, 6.283); c.fill();
        c.strokeStyle = '#7dd3fc'; c.lineWidth = 2.5; c.beginPath(); c.arc(32, 30, 8, 0.4, 4.5); c.stroke();
      });
    });

    SPR.jelly = makeSprite('jelly', TILE, TILE, function (c) {
      rr(c, 4, 4, TILE - 8, TILE - 8, 14); c.fillStyle = '#38bdf8'; c.fill();
      c.lineWidth = 3; c.strokeStyle = '#0284c7'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(22, 18, 10, 5, -0.4, 0, 6.283); c.fill();
    });

    D.SKINS.forEach(function (sk) {
      for (var dir = 0; dir < 4; dir++) for (var fr = 0; fr < 2; fr++) {
        var key = 'cm_' + sk.id + '_' + dir + '_' + fr;
        SPR[key] = makeSprite(key, 80, 80, (function (s, d, f) {
          return function (c) {
            var bob = f ? -3 : 0;
            c.fillStyle = 'rgba(15,41,66,0.22)'; c.beginPath(); c.ellipse(40, 71, 20, 6, 0, 0, 6.283); c.fill();
            c.fillStyle = '#0f2942';
            c.beginPath(); c.arc(31, 65 + (f ? -2 : 1), 7, 0, 6.283); c.fill();
            c.beginPath(); c.arc(49, 65 + (f ? 1 : -2), 7, 0, 6.283); c.fill();
            rr(c, 16, 30 + bob, 48, 24, 10); c.fillStyle = s.splash; c.fill();
            c.fillStyle = s.suit; c.beginPath(); c.arc(40, 41 + bob, 23, 0, 6.283); c.fill();
            c.lineWidth = 3.5; c.strokeStyle = '#0f2942'; c.stroke();
            rr(c, 23, 27 + bob, 34, 21, 10); c.fillStyle = s.visor; c.fill();
            c.lineWidth = 2.5; c.strokeStyle = '#0f2942'; c.stroke();
            rr(c, 18, 20 + bob, 44, 9, 5); c.fillStyle = s.band; c.fill(); c.stroke();
            if (s.id === 'shark') {
              c.fillStyle = s.suit; c.beginPath(); c.moveTo(34, 20 + bob); c.lineTo(41, 6 + bob); c.lineTo(48, 20 + bob); c.closePath(); c.fill(); c.stroke();
            } else if (s.id === 'gold') {
              c.fillStyle = '#fde047'; c.beginPath();
              c.moveTo(26, 20 + bob); c.lineTo(29, 8 + bob); c.lineTo(36, 16 + bob); c.lineTo(40, 6 + bob);
              c.lineTo(44, 16 + bob); c.lineTo(51, 8 + bob); c.lineTo(54, 20 + bob); c.closePath(); c.fill(); c.stroke();
            }
            drawEyes(c, 40, 38 + bob, d, 19);
          };
        })(sk, dir, fr));
      }
    });

    ['crab', 'bot', 'suds'].forEach(function (m) {
      for (var fr = 0; fr < 2; fr++) {
        SPR['mb_' + m + '_' + fr] = makeSprite('mb_' + m + '_' + fr, 72, 72, (function (kind, f) {
          return function (c) {
            var bob = f ? -3 : 0;
            c.fillStyle = 'rgba(15,41,66,0.2)'; c.beginPath(); c.ellipse(36, 64, 18, 5, 0, 0, 6.283); c.fill();
            c.fillStyle = kind === 'crab' ? '#ef4444' : kind === 'bot' ? '#38bdf8' : '#ec4899';
            c.beginPath(); c.arc(36, 39 + bob, 21, 0, 6.283); c.fill();
            c.lineWidth = 3.5; c.strokeStyle = '#0f2942'; c.stroke();
            if (kind === 'crab') {
              c.beginPath(); c.arc(13, 34 + bob, 8, 0.5, 5.5); c.fill(); c.stroke();
              c.beginPath(); c.arc(59, 34 + bob, 8, 0.8, 5.8); c.fill(); c.stroke();
            } else if (kind === 'bot') { c.fillStyle = '#fde047'; c.beginPath(); c.arc(36, 13 + bob, 5, 0, 6.283); c.fill(); c.stroke(); }
            drawEyes(c, 36, 37 + bob, 2, 18);
          };
        })(m, fr));
      }
    });

    for (var tf = 0; tf < 2; tf++) {
      SPR['mt_' + tf] = makeSprite('mt_' + tf, 76, 52, (function (f) {
        return function (c) {
          c.fillStyle = '#10b981'; rr(c, 10, 14 + (f ? -2 : 0), 56, 28, 14); c.fill();
          c.lineWidth = 3; c.strokeStyle = '#0f2942'; c.stroke();
          c.fillStyle = '#38bdf8';
          c.beginPath(); c.arc(10, 28, 7, 0, 6.283); c.fill(); c.stroke();
          c.beginPath(); c.arc(66, 28, 7, 0, 6.283); c.fill(); c.stroke();
        };
      })(tf));
    }

    ['crab', 'octo', 'king'].forEach(function (bk) {
      for (var bf = 0; bf < 2; bf++) {
        SPR['bs_' + bk + '_' + bf] = makeSprite('bs_' + bk + '_' + bf, 124, 124, (function (kind, f) {
          return function (c) {
            var bob = f ? -4 : 0;
            c.fillStyle = 'rgba(15,41,66,0.28)'; c.beginPath(); c.ellipse(62, 110, 42, 10, 0, 0, 6.283); c.fill();
            c.fillStyle = kind === 'crab' ? '#dc2626' : kind === 'octo' ? '#7c3aed' : '#eab308';
            c.beginPath(); c.arc(62, 64 + bob, 40, 0, 6.283); c.fill();
            c.lineWidth = 4.5; c.strokeStyle = '#0f2942'; c.stroke();
            c.fillStyle = '#334155';
            rr(c, 8, 52 + bob, 20, 24, 8); c.fill(); c.stroke();
            rr(c, 96, 52 + bob, 20, 24, 8); c.fill(); c.stroke();
            if (kind === 'king') {
              c.fillStyle = '#fef08a'; c.beginPath();
              c.moveTo(38, 28 + bob); c.lineTo(44, 8 + bob); c.lineTo(54, 22 + bob); c.lineTo(62, 6 + bob);
              c.lineTo(70, 22 + bob); c.lineTo(80, 8 + bob); c.lineTo(86, 28 + bob); c.closePath(); c.fill(); c.stroke();
            }
            drawEyes(c, 62, 58 + bob, 2, 30);
            c.strokeStyle = '#0f2942'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(42, 42 + bob); c.lineTo(56, 48 + bob); c.moveTo(82, 42 + bob); c.lineTo(68, 48 + bob); c.stroke();
          };
        })(bk, bf));
      }
    });

    var bCols = { blue: '#22b8ff', teal: '#00d2b8', neon: '#d946ef', gold: '#fbbf24', boss: '#f43f5e' };
    Object.keys(bCols).forEach(function (ck) {
      var col = bCols[ck];
      for (var wf = 0; wf < 2; wf++) {
        SPR['bl_' + ck + '_' + wf] = makeSprite('bl_' + ck + '_' + wf, TILE, TILE, (function (cl, f) {
          return function (c) {
            c.fillStyle = 'rgba(15,41,66,0.22)'; c.beginPath(); c.ellipse(32, 55, 16, 5, 0, 0, 6.283); c.fill();
            c.fillStyle = cl; c.beginPath(); c.moveTo(28, 12); c.lineTo(36, 12); c.lineTo(32, 18); c.closePath(); c.fill();
            c.beginPath(); c.ellipse(32, 35, f ? 22 : 20, f ? 20 : 22, 0, 0, 6.283); c.fill();
            c.lineWidth = 3.5; c.strokeStyle = '#0f2942'; c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.82)'; c.beginPath(); c.ellipse(24, 27, 7, 4, -0.5, 0, 6.283); c.fill();
          };
        })(col, wf));
      }
      SPR['spc_' + ck] = makeSprite('spc_' + ck, TILE, TILE, function (c) {
        c.fillStyle = col; c.beginPath(); c.arc(32, 32, 28, 0, 6.283); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 32, 18, 0, 6.283); c.fill();
      });
    });

    var puColors = { balloon: ['#38bdf8', '🎈'], range: ['#0ea5e9', '💦'], speed: ['#22c55e', '👟'], kick: ['#f97316', '🥊'], shield: ['#a855f7', '🫧'], turtle: ['#10b981', '🐢'] };
    Object.keys(puColors).forEach(function (pk) {
      SPR['pu_' + pk] = makeSprite('pu_' + pk, 56, 56, function (c) {
        c.fillStyle = '#fff'; c.beginPath(); c.arc(28, 28, 23, 0, 6.283); c.fill();
        c.lineWidth = 4; c.strokeStyle = puColors[pk][0]; c.stroke();
        c.lineWidth = 2; c.strokeStyle = '#0f2942'; c.beginPath(); c.arc(28, 28, 25, 0, 6.283); c.stroke();
        c.font = '700 26px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#0f2942'; c.fillText(puColors[pk][1], 28, 29);
      });
    });
  }

  var parts = [], skyKOs = [], partHead = 0;
  for (var pi = 0; pi < 220; pi++) parts.push({ on: 0 });
  function spawnBurst(x, y, count, col, upward) {
    if (Kit.motion && Kit.motion.reduced()) return;
    for (var i = 0; i < count; i++) {
      var p = parts[partHead]; partHead = (partHead + 1) % parts.length;
      var ang = Math.random() * 6.283, spd = 80 + Math.random() * 210;
      p.on = 1; p.x = x; p.y = y; p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd - (upward ? 220 : 60);
      p.life = p.max = 0.42 + Math.random() * 0.28; p.r = 3 + Math.random() * 4; p.col = col;
    }
  }
  function pushSkyKO(e) {
    skyKOs.push({ x: OX + e.x, y: OY + e.y, vx: (Math.random() - 0.5) * 180, vy: -640, rot: 0, spin: (Math.random() < 0.5 ? -1 : 1) * 11, spr: SPR[e.mob ? ('mb_' + e.mob + '_0') : ('cm_' + (e.skin || 'shark') + '_2_0')], life: 1.05 });
    spawnBurst(OX + e.x, OY + e.y, 18, '#38bdf8', true); spawnBurst(OX + e.x, OY + e.y, 12, '#fbbf24', true);
  }

  var screenState = 'title', activeModal = 'scrTitle', paused = false, world = null, demo = null, cfg = null;
  var scores = [0, 0, 0, 0], reported = false, resultDelay = 0, pointerGoal = null, mouseDrop = false, pointerHeld = false, advWorldTab = 1;

  function showModal(id) {
    activeModal = id;
    ['scrTitle', 'scrAdv', 'scrDuo', 'scrShop', 'scrPause', 'scrResult'].forEach(function (sid) { $(sid).hidden = sid !== id; });
    var inPlay = screenState === 'play' && !paused;
    $('pauseBtn').hidden = !inPlay;
    $('bombBtn').hidden = !(inPlay && cfg && !cfg.duo);
    pausePainted = false;
  }

  function closeTelemetry(outcome) {
    if (reported || !cfg || cfg.demo) return;
    reported = true; Kit.stats.end(outcome, scores[0] | 0);
  }

  function freshDemo() {
    demo = E.newMatch({
      seed: ((Math.random() * 8000) | 0) + 1, freeze: 0, demo: true, diff: 'normal', arena: 'sand',
      players: [0, 1, 2, 3].map(function (i) { return { cpu: true, team: i, tier: 3, skin: D.SKINS[i].id, name: D.SKINS[i].name }; })
    });
  }

  function refreshTitleUI() {
    $('diffDesc').textContent = D.diffById(save.diff).desc;
    var btns = $('diffBar').querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].className = btns[i].getAttribute('data-diff') === save.diff ? 'on' : '';
    $('shopSub').textContent = D.skinById(save.skin).name + ' · العملات ' + String(save.coins);
  }

  function beginMatch(nextCfg) {
    if (screenState === 'play' && !reported) closeTelemetry('quit');
    cfg = nextCfg; paused = false; reported = false; scores = [0, 0, 0, 0];
    skyKOs = []; pointerGoal = null; mouseDrop = false; screenState = 'play';
    var diffId = cfg.diff || save.diff, baseTier = D.diffById(diffId).botTier;
    var tunedTier = Math.max(1, Math.min(5, baseTier + (diffId === 'easy' ? 0 : dda.pick([-1, 0, 0, 1, 1]))));

    if (!cfg.demo) {
      var rKey = cfg.mode === 'adv' ? cfg.stage.roundKey : (cfg.duo ? (cfg.team ? 'duo-coop' : 'duo-ffa') : ('qb-' + diffId));
      Kit.stats.round(rKey);
    }

    if (cfg.mode === 'adv') {
      world = E.newStage({ stage: cfg.stage, seed: cfg.seed || 7, diff: diffId, tier: tunedTier, coop: !!cfg.duo, skin: save.skin, round: 1, freeze: 0.4 });
    } else {
      var specs = cfg.duo ? (cfg.team ? [
        { cpu: false, team: 0, skin: save.skin, name: 'اللاعب 1' }, { cpu: false, team: 0, skin: 'shark', name: 'اللاعب 2' },
        { cpu: true, team: 1, skin: 'neon', name: 'نيون', tier: tunedTier }, { cpu: true, team: 1, skin: 'gold', name: 'ذهبي', tier: tunedTier }
      ] : [
        { cpu: false, team: 0, skin: save.skin, name: 'اللاعب 1' }, { cpu: false, team: 1, skin: 'shark', name: 'اللاعب 2' },
        { cpu: true, team: 2, skin: 'neon', name: 'نيون', tier: tunedTier }, { cpu: true, team: 3, skin: 'gold', name: 'ذهبي', tier: tunedTier }
      ]) : null;
      world = E.newMatch({ seed: cfg.seed || 1, diff: diffId, tier: tunedTier, skin: save.skin, arena: cfg.arena || ['sand', 'soda', 'soap'][(cfg.seed || 0) % 3], players: specs, round: 1, freeze: 0.4 });
    }
    showModal(null); Kit.keys.reset(); canvas.focus();
  }

  function drainEvents(w, quiet) {
    if (!w || !w.events.length) return;
    var list = w.events.splice(0, w.events.length);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.t === 'score' && !quiet && e.id >= 0 && e.id < scores.length) scores[e.id] += e.pts;
      else if (e.t === 'boom') { if (!quiet) sfx.splash(e.n); spawnBurst(OX + (e.c + 0.5) * TILE, OY + (e.r + 0.5) * TILE, 10, '#e0f2fe', false); }
      else if (e.t === 'crate') spawnBurst(OX + (e.c + 0.5) * TILE, OY + (e.r + 0.5) * TILE, 8, '#fbbf24', true);
      else if (e.t === 'drop' && !quiet) sfx.drop();
      else if ((e.t === 'kick' || e.t === 'throw') && !quiet) sfx.kick();
      else if (e.t === 'warp') { if (!quiet) sfx.warp(); spawnBurst(OX + (e.c + 0.5) * TILE, OY + (e.r + 0.5) * TILE, 10, '#67e8f9', false); }
      else if (e.t === 'item') { if (!quiet) sfx.item(); spawnBurst(OX + (e.c + 0.5) * TILE, OY + (e.r + 0.5) * TILE, 8, '#fde047', false); }
      else if (e.t === 'shieldPop' || e.t === 'unmount' || e.t === 'mercy') {
        if (!quiet) sfx.shield();
        spawnBurst(OX + e.x, OY + e.y, 12, '#c084fc', false);
        if (!quiet && !w.demo) { if (e.id === 0 && (e.own || e.t === 'mercy')) Kit.track.miss(); else if (e.by === 0 && e.id !== 0) Kit.track.hit(); }
      } else if (e.t === 'bossHit') {
        if (!quiet) sfx.ko();
        spawnBurst(OX + e.x, OY + e.y, 16, '#fb7185', true);
        if (!quiet && !w.demo && e.by === 0) Kit.track.hit();
      } else if (e.t === 'ko') {
        if (!quiet) sfx.ko();
        pushSkyKO(e);
        if (!quiet && !w.demo) { if (e.victim === 0 && e.own) Kit.track.miss(); else if (e.by === 0 && e.victim !== 0) Kit.track.hit(); }
      }
    }
  }

  function onMatchEnded() {
    var outcome = world.outcome || 'lose', p1Win = outcome === 'win', earned = 0;
    if (cfg.mode === 'adv') {
      var st = world.stars || 0;
      if (p1Win) {
        if (st > (save.best[cfg.stage.id] || 0)) save.best[cfg.stage.id] = st;
        save.stars = 0; D.STAGES.forEach(function (s) { save.stars += save.best[s.id] || 0; });
      }
      earned = p1Win ? (12 + st * 8) : 6;
    } else {
      if (p1Win) save.wins++;
      earned = p1Win ? 22 : (outcome === 'draw' ? 12 : 8);
    }
    save.coins = clampInt(save.coins + earned, 0, 999999); persist();
    if (!cfg.duo) dda.result(p1Win ? 1 : 0);
    closeTelemetry(outcome);

    var banner = $('resBanner');
    if (cfg.duo && !cfg.team && cfg.mode !== 'adv') {
      banner.className = 'banner';
      banner.textContent = world.winner === 0 ? 'فاز اللاعب 1!' : world.winner === 1 ? 'فاز اللاعب 2!' : 'فاز المنافس الآلي!';
    } else {
      banner.className = 'banner' + (p1Win ? '' : ' lose');
      banner.textContent = p1Win ? 'انتصار ساحق!' : (outcome === 'draw' ? 'تعادل مثير!' : 'حاول مجدداً!');
    }
    $('resStars').textContent = cfg.mode === 'adv' ? ('★'.repeat(world.stars || 0) + '☆'.repeat(3 - (world.stars || 0))) : '';
    $('resSub').textContent = 'النقاط: ' + String(scores[0]) + ' · ربحت ' + String(earned) + ' عملة · الرصيد: ' + String(save.coins);

    var nextStage = (cfg.mode === 'adv' && p1Win && D.STAGES.indexOf(cfg.stage) + 1 < D.STAGES.length) ? D.STAGES[D.STAGES.indexOf(cfg.stage) + 1] : null;
    $('rNext').hidden = !nextStage;
    $('rNext').onclick = nextStage ? function () { sfx.tap(); beginMatch({ mode: 'adv', stage: nextStage, duo: cfg.duo, diff: save.diff, seed: (cfg.seed || 1) + 5 }); } : null;

    screenState = 'over'; paused = false; resultDelay = 0.35;
    showModal('scrResult');
    if (p1Win || (cfg.duo && !cfg.team)) sfx.win(); else sfx.lose();
  }

  function pauseGame() { if (screenState !== 'play' || paused) return; paused = true; showModal('scrPause'); sfx.pause(true); Kit.keys.reset(); }
  function resumeGame() { if (screenState !== 'play' || !paused) return; paused = false; showModal(null); sfx.pause(false); canvas.focus(); }
  function restartGame() { if (!cfg) return; sfx.tap(); beginMatch({ mode: cfg.mode, duo: cfg.duo, team: cfg.team, stage: cfg.stage, diff: save.diff, arena: cfg.arena, seed: ((cfg.seed || 1) + 13) % 8999 + 1 }); }
  function goTitle() { if (screenState === 'play' && !reported) closeTelemetry('quit'); world = null; cfg = null; paused = false; screenState = 'title'; refreshTitleUI(); showModal('scrTitle'); if (!demo) freshDemo(); sfx.back(); }

  function pointerToArena(ev) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var c = Math.floor(((ev.clientX - rect.left) * (W / rect.width) - OX) / TILE);
    var r = Math.floor(((ev.clientY - rect.top) * (H / rect.height) - OY) / TILE);
    return E.inside(c, r) ? { c: c, r: r } : null;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (screenState !== 'play' || paused || !world || (cfg && cfg.duo)) return;
    if (ev.button === 2) { mouseDrop = true; return; }
    var cell = pointerToArena(ev); if (!cell) return;
    pointerHeld = true;
    var p1 = world.players[0];
    if (p1 && p1.state === 'play') {
      var hc = E.cellOf(p1);
      if (hc.c === cell.c && hc.r === cell.r) { mouseDrop = true; pointerGoal = null; } else pointerGoal = { c: cell.c, r: cell.r };
    }
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!pointerHeld || screenState !== 'play' || paused || !world || (cfg && cfg.duo)) return;
    var cell = pointerToArena(ev); if (cell) pointerGoal = { c: cell.c, r: cell.r };
  });
  window.addEventListener('pointerup', function () { pointerHeld = false; });
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); if (screenState === 'play' && !paused && cfg && !cfg.duo) mouseDrop = true; });

  function readHumanInput(idxP, duo) {
    var K = Kit.keys;
    if (!duo) {
      var kx = (K.down('ArrowRight') || K.down('KeyD') ? 1 : 0) - (K.down('ArrowLeft') || K.down('KeyA') ? 1 : 0);
      var ky = (K.down('ArrowDown') || K.down('KeyS') ? 1 : 0) - (K.down('ArrowUp') || K.down('KeyW') ? 1 : 0);
      if (kx || ky) pointerGoal = null;
      else if (pointerGoal && world && world.players[0]) {
        var p = world.players[0], here = E.cellOf(p);
        if (here.c === pointerGoal.c && here.r === pointerGoal.r && Math.abs(p.x - E.center(here.c)) < 6 && Math.abs(p.y - E.center(here.r)) < 6) pointerGoal = null;
        else { var st = AI.pathStep(world, here.c, here.r, pointerGoal.c, pointerGoal.r, null) || pointerGoal, dir = AI.steerTo(p, st.c, st.r); kx = dir.x; ky = dir.y; }
      }
      var drop = K.pressed('Space') || K.pressed('Enter') || K.pressed('NumpadEnter') || K.pressed('Slash') || mouseDrop;
      mouseDrop = false;
      return { x: kx, y: ky, drop: drop, kick: K.pressed('KeyE') || K.pressed('Period') };
    }
    if (idxP === 0) return { x: (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0), y: (K.down('KeyS') ? 1 : 0) - (K.down('KeyW') ? 1 : 0), drop: K.pressed('Space'), kick: K.pressed('KeyE') };
    return { x: (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0), y: (K.down('ArrowDown') ? 1 : 0) - (K.down('ArrowUp') ? 1 : 0), drop: K.pressed('Enter') || K.pressed('NumpadEnter') || K.pressed('Slash'), kick: K.pressed('Period') };
  }

  function update(dt) {
    var K = Kit.keys;
    if (screenState === 'title') {
      if (activeModal === 'scrTitle' && K.anyPressed(['Enter', 'NumpadEnter', 'Space'])) { sfx.tap(); beginMatch({ mode: 'battle', duo: false, team: false, diff: save.diff, seed: ((Math.random() * 8000) | 0) + 1 }); }
      else if (activeModal !== 'scrTitle' && K.pressed('Escape')) { sfx.back(); showModal('scrTitle'); }
      if (demo) { E.step(demo, dt, AI.inputs(demo)); drainEvents(demo, true); if (demo.phase !== 'play') freshDemo(); }
    } else if (screenState === 'play') {
      if (paused) { if (K.anyPressed(['KeyP', 'Escape'])) resumeGame(); else if (K.pressed('KeyR')) restartGame(); K.endFrame(); return; }
      if (K.anyPressed(['KeyP', 'Escape'])) { pauseGame(); K.endFrame(); return; }
      if (K.pressed('KeyR')) { restartGame(); K.endFrame(); return; }
      if (world) {
        var duo = !!(cfg && cfg.duo), humans = world.players.map(function (p, i) { return p.cpu ? null : readHumanInput(i, duo); });
        E.step(world, dt, AI.mix(world, humans));
        drainEvents(world, false);
        if (world.pendingShake) { shake.add(world.pendingShake); world.pendingShake = 0; }
        shake.update(dt);
        if (world.phase !== 'play') onMatchEnded();
      }
    } else if (screenState === 'over') {
      if (resultDelay > 0) resultDelay -= dt;
      else if (K.anyPressed(['Enter', 'NumpadEnter', 'Space', 'KeyR'])) restartGame();
      else if (K.pressed('Escape')) goTitle();
    }
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = 0; continue; }
      p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (var k = skyKOs.length - 1; k >= 0; k--) {
      var ko = skyKOs[k]; ko.life -= dt; ko.vy += 760 * dt; ko.x += ko.vx * dt; ko.y += ko.vy * dt; ko.rot += ko.spin * dt;
      if (ko.life <= 0) skyKOs.splice(k, 1);
    }
    K.endFrame();
  }

  function drawText(ctx, str, x, y, size, align, fill, plain) {
    ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + size + 'px Fredoka';
    if (!plain) { ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f2942'; ctx.lineWidth = Math.max(3, size * 0.16); ctx.strokeText(str, x, y); }
    ctx.fillStyle = fill || '#fff'; ctx.fillText(str, x, y); ctx.restore();
  }

  function balloonColorKey(b) {
    if (b.owner < 0) return 'boss';
    return b.color === '#00d2b8' ? 'teal' : b.color === '#d946ef' ? 'neon' : b.color === '#fbbf24' ? 'gold' : 'blue';
  }

  function drawSplash(ctx, s) {
    var cells = s.cells; if (!cells.length) return;
    var ox = OX + (cells[0].c + 0.5) * TILE, oy = OY + (cells[0].r + 0.5) * TILE;
    var ck = s.color === '#00d2b8' ? 'teal' : s.color === '#d946ef' ? 'neon' : s.color === '#fbbf24' ? 'gold' : s.color === '#f43f5e' ? 'boss' : 'blue';
    ctx.save(); ctx.globalAlpha = Math.min(1, (s.life / s.max) * 1.6); ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 1; i < cells.length; i++) { ctx.moveTo(ox, oy); ctx.lineTo(OX + (cells[i].c + 0.5) * TILE, OY + (cells[i].r + 0.5) * TILE); }
    ctx.lineWidth = TILE * 0.78; ctx.strokeStyle = s.color || '#22b8ff'; ctx.stroke();
    ctx.lineWidth = TILE * 0.34; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (SPR['spc_' + ck]) ctx.drawImage(SPR['spc_' + ck], ox - 32, oy - 32);
    ctx.restore();
  }

  function drawFighterCard(ctx, p, x, y, scoreVal) {
    rr(ctx, x, y, 192, 92, 18);
    ctx.fillStyle = p.state === 'out' ? 'rgba(226,232,240,0.85)' : 'rgba(255,255,255,0.96)';
    ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0f2942'; ctx.stroke();
    var spr = SPR['cm_' + p.skin + '_2_0'];
    if (spr) ctx.drawImage(spr, x + 6, y + 12, 52, 52);
    drawText(ctx, p.name, x + 180, y + 24, 18, 'right', '#0f2942', true);
    var stTxt = 'بالون ' + String(p.balloons) + ' · مدى ' + String(p.range) + (p.kick ? ' · ركل' : '') + (p.shield ? ' · درع' : '');
    drawText(ctx, stTxt, x + 180, y + 51, 13, 'right', '#0284c7', true);
    drawText(ctx, p.state === 'out' ? 'خرج من الساحة!' : ('النقاط: ' + String(scoreVal || 0)), x + 180, y + 74, 14, 'right', p.state === 'out' ? '#e11d48' : '#059669', true);
  }

  function render() {
    if (paused && pausePainted) return;
    var w = screenState === 'title' ? demo : world; if (!w) return;
    var ctx = view.ctx, arena = D.arenaById(w.arena);
    var sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, arena.sky[0]); sky.addColorStop(1, arena.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (screenState === 'play' && !paused) ctx.translate(shake.x || 0, shake.y || 0);
    rr(ctx, OX - 14, OY - 10, D.COLS * TILE + 28, D.ROWS * TILE + 28, 24); ctx.fillStyle = arena.rimDk; ctx.fill();
    rr(ctx, OX - 14, OY - 14, D.COLS * TILE + 28, D.ROWS * TILE + 26, 24); ctx.fillStyle = arena.rim; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#0f2942'; ctx.stroke();

    var sig = w.arena + ':' + Array.prototype.join.call(w.grid, ',');
    if (!bakedArena || bakedArena.sig !== sig) {
      var cv = document.createElement('canvas'); cv.width = D.COLS * TILE; cv.height = D.ROWS * TILE;
      var mc = cv.getContext('2d');
      for (var r = 0; r < D.ROWS; r++) for (var c = 0; c < D.COLS; c++) {
        var t = w.grid[r * D.COLS + c];
        mc.drawImage(SPR['fl_' + w.arena], c * TILE, r * TILE);
        if (t === D.PILLAR) mc.drawImage(SPR['pl_' + w.arena], c * TILE, r * TILE);
        else if (t === D.CRATE) mc.drawImage(SPR['cr_' + w.arena], c * TILE, r * TILE);
        else if (t === D.PIPE) mc.drawImage(SPR['pp_' + w.arena], c * TILE, r * TILE);
        else if (t === D.JELLY) mc.drawImage(SPR.jelly, c * TILE, r * TILE);
      }
      bakedArena = { sig: sig, cv: cv };
    }
    ctx.drawImage(bakedArena.cv, OX, OY);

    if (screenState === 'play' && pointerGoal && cfg && !cfg.duo) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(OX + (pointerGoal.c + 0.5) * TILE, OY + (pointerGoal.r + 0.5) * TILE, 18, 0, 6.283); ctx.stroke();
    }

    for (var di = 0; di < w.drops.length; di++) {
      var drp = w.drops[di], pSpr = SPR['pu_' + drp.kind];
      if (pSpr) ctx.drawImage(pSpr, OX + drp.c * TILE + 4, OY + drp.r * TILE + 4 + Math.sin(w.time * 5 + di) * 4);
    }

    for (var bi = 0; bi < w.balloons.length; bi++) {
      var b = w.balloons[bi], hot = !b.lob && b.fuse < 0.75;
      var bSpr = SPR['bl_' + balloonColorKey(b) + '_' + (Math.floor(w.time * (hot ? 14 : 6) + b.id) % 2)];
      var arcY = b.lob ? Math.sin(Math.min(1, b.lob.t / b.lob.dur) * 3.1415) * 44 : 0, sc = hot ? 1 + Math.sin(w.time * 24) * 0.1 : 1;
      ctx.save(); ctx.translate(OX + b.x, OY + b.y - arcY); ctx.scale(sc, sc);
      if (bSpr) ctx.drawImage(bSpr, -TILE / 2, -TILE / 2);
      ctx.restore();
    }

    for (var si = 0; si < w.splashes.length; si++) drawSplash(ctx, w.splashes[si]);

    for (var pi2 = 0; pi2 < w.players.length; pi2++) {
      var pl = w.players[pi2];
      if (pl.state !== 'play' || (pl.invT > 0 && Math.floor(w.time * 16) % 2 === 1)) continue;
      var px = OX + pl.x, py = OY + pl.y, fr2 = Math.floor(w.time * 8 + pl.id) % 2;
      if (pl.mount) ctx.drawImage(SPR['mt_' + fr2], px - 38, py - 12);
      if (pl.mob) ctx.drawImage(SPR['mb_' + pl.mob + '_' + fr2], px - 36, py - 42);
      else ctx.drawImage(SPR['cm_' + pl.skin + '_' + pl.face + '_' + fr2], px - 40, py - (pl.mount ? 58 : 48));
      if (pl.shield > 0) {
        ctx.save(); ctx.strokeStyle = '#e0f2fe'; ctx.fillStyle = 'rgba(56,189,248,0.25)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py - 8, 32, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (!pl.cpu && !w.demo) drawText(ctx, (cfg && cfg.duo) ? (pl.id === 0 ? 'ل1' : 'ل2') : 'أنت', px, py - (pl.mount ? 66 : 54), 15, 'center', '#fde047');
    }

    if (w.boss && w.boss.hp > 0 && !(w.boss.invT > 0 && Math.floor(w.time * 18) % 2 === 1)) {
      ctx.drawImage(SPR['bs_' + w.boss.kind + '_' + (Math.floor(w.time * 6) % 2)], OX + w.boss.x - 62, OY + w.boss.y - 68);
    }
    for (var ki = 0; ki < skyKOs.length; ki++) {
      var ko = skyKOs[ki]; if (!ko.spr) continue;
      ctx.save(); ctx.translate(ko.x, ko.y); ctx.rotate(ko.rot); ctx.drawImage(ko.spr, -40, -40, 80, 80); ctx.restore();
    }
    for (var qi = 0; qi < parts.length; qi++) {
      var pt = parts[qi]; if (!pt.on) continue;
      ctx.globalAlpha = Math.max(0, pt.life / pt.max); ctx.fillStyle = pt.col;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();

    if (screenState !== 'title' && world) {
      var rem = Math.max(0, Math.ceil((world.adventure ? 140 : 90) - world.time));
      drawText(ctx, 'الوقت: ' + String(rem), 640, 32, 28, 'center', world.sudden ? '#fb7185' : '#fff');
      if (world.boss && world.boss.hp > 0) {
        rr(ctx, 480, 56, 320, 22, 11); ctx.fillStyle = '#0f2942'; ctx.fill();
        rr(ctx, 483, 59, 314 * (world.boss.hp / world.boss.maxHp), 16, 8); ctx.fillStyle = '#ef4444'; ctx.fill();
        drawText(ctx, world.boss.name + ' (' + String(world.boss.hp) + '/' + String(world.boss.maxHp) + ')', 640, 67, 15, 'center', '#fff');
      } else {
        drawText(ctx, world.adventure && world.stage ? world.stage.name : 'معركة البالونات', 640, 64, 20, 'center', '#fde047');
      }
      var fighters = world.players.filter(function (p) { return !p.mob; });
      for (var fi = 0; fi < fighters.length; fi++) {
        drawFighterCard(ctx, fighters[fi], fi % 2 === 0 ? 16 : 1072, 104 + Math.floor(fi / 2) * 108, scores[fighters[fi].id] || 0);
      }
      if (world.freeze > 0) drawText(ctx, 'انطلق!', 640, 380, 68, 'center', '#fde047');
    }
    if (paused) pausePainted = true;
  }

  function renderAdvMenu() {
    var tabs = $('worldTabs'); tabs.innerHTML = '';
    D.WORLDS.forEach(function (wObj) {
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = wObj.id + '. ' + wObj.name; b.className = advWorldTab === wObj.id ? 'on' : '';
      b.onclick = function () { advWorldTab = wObj.id; sfx.select(); renderAdvMenu(); };
      tabs.appendChild(b);
    });
    var grid = $('stageGrid'); grid.innerHTML = '';
    D.STAGES.filter(function (st) { return st.world === advWorldTab; }).forEach(function (st) {
      var card = document.createElement('button'), best = save.best[st.id] || 0;
      card.type = 'button'; card.className = 'stage-card' + (st.boss ? ' boss' : '');
      card.innerHTML = '<strong>' + (st.boss ? '👑 ' : '') + st.stage + '. ' + st.name + '</strong><span>' + (st.boss ? 'غارة زعيم عملاق!' : 'ساحة مفتوحة') + '</span><span class="st-stars">' + '★'.repeat(best) + '☆'.repeat(3 - best) + '</span>';
      card.onclick = function () { sfx.tap(); beginMatch({ mode: 'adv', stage: st, duo: $('advCoop').checked, diff: save.diff, seed: st.world * 11 + st.stage }); };
      grid.appendChild(card);
    });
  }

  function renderShopMenu() {
    $('lockerBal').textContent = 'العملات: ' + String(save.coins) + ' · النجوم: ' + String(save.stars);
    var grid = $('skinGrid'); grid.innerHTML = '';
    D.SKINS.forEach(function (sk) {
      var owned = !!save.owned[sk.id], active = save.skin === sk.id, div = document.createElement('div');
      div.className = 'skin-card' + (active ? ' active' : '');
      div.innerHTML = '<div class="swatch" style="background:' + sk.suit + ';box-shadow:inset 0 -8px 0 ' + sk.band + '"></div><div class="skin-info"><strong>' + sk.name + '</strong><small>' + sk.desc + '</small></div>';
      var act = document.createElement('button'); act.type = 'button'; act.className = 'skin-act' + (owned ? ' owned' : '');
      if (active) { act.textContent = 'مُجهّز'; act.disabled = true; }
      else if (owned) { act.textContent = 'اختيار'; act.onclick = function () { save.skin = sk.id; sfx.select(); persist(); renderShopMenu(); refreshTitleUI(); }; }
      else {
        act.textContent = 'شراء (' + String(sk.cost) + ')'; act.disabled = save.coins < sk.cost;
        act.onclick = function () {
          if (save.coins < sk.cost) return;
          save.coins -= sk.cost; save.owned[sk.id] = 1; save.skin = sk.id; sfx.item(); persist(); renderShopMenu(); refreshTitleUI();
        };
      }
      div.appendChild(act); grid.appendChild(div);
    });
  }

  $('diffBar').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-diff]'); if (!btn) return;
    save.diff = btn.getAttribute('data-diff'); sfx.select(); persist(); refreshTitleUI();
  });
  $('play1').onclick = function () { sfx.tap(); beginMatch({ mode: 'battle', duo: false, team: false, diff: save.diff, seed: ((Math.random() * 8000) | 0) + 1 }); };
  $('playAdv').onclick = function () { sfx.select(); renderAdvMenu(); showModal('scrAdv'); };
  $('play2').onclick = function () { sfx.select(); showModal('scrDuo'); };
  $('btnShop').onclick = function () { sfx.select(); renderShopMenu(); showModal('scrShop'); };
  $('advBack').onclick = $('duoBack').onclick = $('shopBack').onclick = function () { sfx.back(); showModal('scrTitle'); };
  $('duoFfa').onclick = function () { sfx.tap(); beginMatch({ mode: 'battle', duo: true, team: false, diff: save.diff, seed: ((Math.random() * 8000) | 0) + 1 }); };
  $('duoCoop').onclick = function () { sfx.tap(); beginMatch({ mode: 'battle', duo: true, team: true, diff: save.diff, seed: ((Math.random() * 8000) | 0) + 1 }); };
  $('duoBoss').onclick = function () { sfx.tap(); beginMatch({ mode: 'adv', stage: D.stageById('w1-s3'), duo: true, diff: save.diff, seed: 33 }); };
  $('pauseBtn').onclick = pauseGame;
  $('bombBtn').addEventListener('pointerdown', function (ev) { ev.preventDefault(); if (screenState === 'play' && !paused) mouseDrop = true; });
  $('bResume').onclick = resumeGame; $('bRestart').onclick = restartGame; $('bMenu').onclick = goTitle;
  $('rAgain').onclick = function () { if (resultDelay <= 0) restartGame(); }; $('rMenu').onclick = goTitle;
  canvas.addEventListener('contextrestored', function () { bootSprites(); view.resize(); });

  window.__game = {
    get screen() { return screenState; },
    get paused() { return paused; },
    get scores() { return scores; },
    get world() { return world; },
    get demoing() { return screenState === 'title' && !!demo; },
    info: function () {
      var p = world && world.players[0];
      return { t: world ? +world.time.toFixed(2) : 0, px: p ? Math.round(p.x) : 0, py: p ? Math.round(p.y) : 0, phase: world ? world.phase : '', freeze: world ? +world.freeze.toFixed(2) : 0, round: world ? world.round : 0 };
    },
    start: function (o) {
      o = o || {};
      if (o.mode === 'adv') beginMatch({ mode: 'adv', stage: D.stageById(o.stage || 'w1-s1'), duo: !!o.duo, diff: o.diff || save.diff, seed: o.seed || 5 });
      else beginMatch({ mode: 'battle', duo: !!o.duo, team: !!o.team, diff: o.diff || save.diff, seed: o.seed || 5 });
    },
    endNow: function (winner) { if (world) E.forceEnd(world, winner == null ? 0 : winner); },
    winRound: function (team) { if (world) E.forceEnd(world, team == null ? 0 : team); },
    setTime: function (t) { if (world) { world.time = t; world.freeze = 0; } }
  };

  bootSprites(); refreshTitleUI(); freshDemo(); showModal('scrTitle');
  Kit.loop(update, render);
  if (document.fonts && document.fonts.load) document.fonts.load('700 40px Fredoka', 'ب').then(function () { pausePainted = false; }).catch(function () {});
  Kit.lifecycle({ pause: pauseGame });
  Kit.ready();
})();

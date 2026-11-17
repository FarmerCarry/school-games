/* هوكي الهواء — Laser & Power-Puck Cyber-Mech Arena (game loop, physics, AI, UI). */
(function () {
  'use strict';
  var AH = window.AH;
  var G = AH.G, art = AH.art, J = Kit.juice, M = Math;
  var W = G.W, H = G.H;
  var PMAX = 2100, PMAX_FIRE = 2200, KMH = 0.062;
  var MOUSE_MAX = 2500, KEY_MAX = 1480, KEY_ACC = 16500, BOOST_SPD = 2080;

  function $(id) { return document.getElementById(id); }
  function on(id, fn) { $(id).addEventListener('click', fn); }
  function mk(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  var canvas = $('game'), ui = $('ui'), pauseBtn = $('pauseBtn'), toastsEl = $('toasts');

  if (Kit.art && Kit.art.init) Kit.art.init({ canvas: canvas, mode: '2d', theme: 'arcade' });

  var frameDirty = true;
  var view = Kit.fit(canvas, W, H, {
    onResize: function (v) {
      ui.style.transform = 'scale(' + v.scale + ')';
      ui.style.left = canvas.style.left;
      ui.style.top = canvas.style.top;
      frameDirty = true;
    }
  });
  var ctx = view.ctx;
  var ptr = Kit.pointer(view);
  var fx = Kit.particles();
  var shake = Kit.shake();
  Kit.muteButton();

  canvas.addEventListener('contextlost', function (e) { e.preventDefault(); });
  canvas.addEventListener('contextrestored', function () {
    view.resize();
    art.clearCaches();
    frameDirty = true;
  });

  /* ------------------------------------------------------------- audio */
  function canSfx() { return !st.demo && !Kit.audio.muted; }
  var S = {
    hit: function (p) {
      if (!canSfx()) return;
      p = Kit.clamp(p || 0.4, 0.12, 1);
      J.impact(p);
      Kit.audio.tone({ freq: 240 + p * 340, to: 115, type: 'triangle', dur: 0.07, vol: 0.14 * (0.4 + p * 0.6) });
    },
    wall: function (p) {
      if (!canSfx()) return;
      p = Kit.clamp(p || 0.3, 0.1, 1);
      J.tap();
      Kit.audio.tone({ freq: 520 + p * 260, to: 260, type: 'sine', dur: 0.05, vol: 0.08 + p * 0.08 });
    },
    post: function () {
      if (!canSfx()) return;
      J.chime(1);
      Kit.audio.tone({ freq: 1180, to: 880, type: 'triangle', dur: 0.16, vol: 0.2 });
    },
    rocket: function () {
      if (!canSfx()) return;
      J.whoosh(0.95);
      Kit.audio.tone({ freq: 260, to: 980, type: 'sawtooth', dur: 0.16, vol: 0.16 });
    },
    boost: function () {
      if (!canSfx()) return;
      J.whoosh(0.75);
      Kit.audio.tone({ freq: 330, to: 760, type: 'triangle', dur: 0.1, vol: 0.14 });
    },
    save: function () { if (canSfx()) J.chime(2); },
    goal: function (good) {
      if (!canSfx()) return;
      if (good) {
        J.star(2);
        [392, 523, 659, 784].forEach(function (f, i) {
          Kit.audio.tone({ freq: f, type: 'sawtooth', dur: 0.17, vol: 0.15, delay: i * 0.055 });
        });
      } else {
        J.fail();
        Kit.audio.tone({ freq: 290, to: 145, type: 'sawtooth', dur: 0.26, vol: 0.17 });
      }
    },
    power: function () { if (canSfx()) J.coin(3); },
    fire: function () {
      if (!canSfx()) return;
      J.whoosh(1);
      Kit.audio.noise({ dur: 0.2, vol: 0.2, filter: 2200, to: 420 });
    },
    freeze: function () {
      if (!canSfx()) return;
      J.chime(3);
      Kit.audio.tone({ freq: 1560, to: 620, type: 'sine', dur: 0.18, vol: 0.15 });
    },
    tick: function (go) { if (canSfx()) J.countdown(go ? 0 : 1); },
    win: function () { if (canSfx()) J.levelUp(); },
    lose: function () { if (canSfx()) J.fail(); },
    click: function () { J.tap(); },
    buy: function () { J.levelUp(); },
    nope: function () { J.error(); },
    unlock: function () { J.star(3); }
  };

  /* ------------------------------------------------------- save & data */
  var store = Kit.store('air-hockey');
  var dda = Kit.dda('air-hockey', { id: 'main', target: 0.68, tiers: 5, start: 0.35 });
  var saveStatus = Kit.saveStatus({ retry: function () { persist(); } });

  function byId(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return arr[0];
  }
  function plainObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function mergeOwned(defaults, saved, list) {
    var out = defaults.slice();
    if (Array.isArray(saved)) {
      for (var i = 0; i < saved.length; i++) {
        var id = saved[i];
        if (out.indexOf(id) < 0 && list.some(function (it) { return it.id === id; })) out.push(id);
      }
    }
    return out;
  }

  function loadSave() {
    var d = plainObj(store.get('save', null));
    var own = plainObj(d.owned), eq = plainObj(d.eq);
    var mallets = mergeOwned(['blue'], own.mallet, AH.MALLETS);
    var tables = mergeOwned(['neon', 'lava', 'cyber', 'space'], own.table, AH.TABLES);
    var pucks = mergeOwned(['classic'], own.puck, AH.PUCKS);
    return {
      coins: Math.max(0, d.coins | 0),
      wins: plainObj(d.wins),
      beaten: plainObj(d.beaten),
      owned: { mallet: mallets, table: tables, puck: pucks },
      eq: {
        mallet: mallets.indexOf(eq.mallet) >= 0 ? eq.mallet : 'blue',
        table: tables.indexOf(eq.table) >= 0 ? eq.table : 'neon',
        puck: pucks.indexOf(eq.puck) >= 0 ? eq.puck : 'classic'
      },
      awards: plainObj(d.awards),
      bot: AH.BOTS.some(function (b) { return b.id === d.bot; }) ? d.bot : 'easy',
      mode: d.mode === 2 ? 2 : 1,
      goals: [5, 7, 10].indexOf(d.goals) >= 0 ? d.goals : 7,
      chaos: typeof d.chaos === 'boolean' ? d.chaos : true,
      matches: Math.max(0, d.matches | 0),
      totalGoals: Math.max(0, d.totalGoals | 0)
    };
  }
  var save = loadSave();

  function persist() {
    if (store.set('save', save)) saveStatus.saved();
    else saveStatus.failed();
    syncCoinsUI();
  }

  /* ------------------------------------------------------------- state */
  var shopTab = 'mallet';
  var uiScreen = 'title';
  var lastPtr = { x: W / 2, y: H / 2 };

  var st = {
    demo: true,
    paused: false,
    scene: 'play',
    t: 0,
    stateT: 0,
    countBeat: 0,
    mode: save.mode,
    bot: byId(AH.BOTS, save.bot),
    table: byId(AH.TABLES, save.eq.table),
    puckSkin: byId(AH.PUCKS, save.eq.puck),
    goalsToWin: save.goals,
    chaos: save.chaos,
    score: [0, 0],
    maxDeficit: 0,
    streak: [0, 0],
    saves: [0, 0],
    shots: [0, 0],
    topKmh: [0, 0],
    powerHits: 0,
    lastScorer: 0,
    goalFlash: [0, 0],
    banner: null,
    mallets: [],
    pucks: [],
    powers: [],
    rings: [],
    popups: [],
    powerT: 3.8,
    tiny: [0, 0],
    useKeys: false,
    ptrActive: false,
    lastRocket: -10,
    awardQ: [],
    matchAwards: [],
    matchCoins: 0,
    committed: false
  };

  function sideIdx(side) { return side < 0 ? 0 : 1; }

  function makeMallet(side, skin, face) {
    var x = side < 0 ? G.L + 140 : G.R - 140;
    return {
      side: side, x: x, y: G.CY, vx: 0, vy: 0, avx: 0, avy: 0,
      r: G.MR, skin: skin, face: face || 'player',
      sq: 0, sqAng: 0, mood: '', moodT: 0, blinkT: Kit.rand(1.8, 4.2), blink: 0,
      big: 0, frozen: 0, boost: 0, boostCd: 0,
      aiT: 0, tx: x, ty: G.CY, errY: 0
    };
  }

  function makePuck(x, y, vx, vy) {
    return {
      x: x, y: y, vx: vx || 0, vy: vy || 0, r: G.PR,
      alive: true, scored: false, spawn: 0, fire: 0,
      lastHit: 0, banked: false, savedClose: false, stuck: 0,
      trail: []
    };
  }

  function emit(x, y, color, count, speed) {
    fx.burst(x, y, { count: count || 14, color: color, speed: speed || 300, life: 0.45, size: 6, gravity: 0 });
  }
  function ring(x, y, color, maxR) {
    if (Kit.motion.reduced()) return;
    st.rings.push({ x: x, y: y, r: 12, maxR: maxR || 86, life: 0.34, max: 0.34, color: color || '#00e5ff' });
  }
  function popup(x, y, text, color, size) {
    st.popups.push({
      x: Kit.clamp(x, G.L + 110, G.R - 110),
      y: Kit.clamp(y, G.T + 46, G.B - 36),
      text: text, color: color || '#fff06a', size: size || 28, life: 0.95, max: 0.95
    });
  }
  function setBanner(text, sub, color, dur) {
    st.banner = { text: text, sub: sub || '', color: color || '#fff06a', t: 0, dur: dur || 1.1 };
  }

  /* ------------------------------------------------------------ awards */
  function unlockedGearCount() {
    return (save.owned.mallet.length - 1) + save.owned.puck.length - 1;
  }

  function earn(id, immediateToast) {
    if (save.awards[id]) return false;
    var def = byId(AH.AWARDS, id);
    if (!def) return false;
    save.awards[id] = 1;
    save.coins += AH.AWARD_COINS;
    st.matchAwards.push(def);
    if (immediateToast) showToast(def);
    else st.awardQ.push(def);
    persist();
    syncAwardsCount();
    return true;
  }

  function showToast(def) {
    S.unlock();
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span>🏆 إنجاز: ' + def.name + '</span><span dir="ltr">+' + AH.AWARD_COINS + ' 🪙</span>';
    toastsEl.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3100);
  }

  function flushAwards() {
    while (st.awardQ.length) showToast(st.awardQ.shift());
  }

  /* ---------------------------------------------------- match setup/flow */
  function equipSkins() {
    st.table = byId(AH.TABLES, save.eq.table);
    st.puckSkin = byId(AH.PUCKS, save.eq.puck);
    var p1Skin = byId(AH.MALLETS, save.eq.mallet);
    var p2Skin;
    if (st.mode === 2) {
      p2Skin = save.eq.mallet === 'magma' ? byId(AH.MALLETS, 'volt') : byId(AH.MALLETS, 'magma');
    } else {
      p2Skin = {
        id: 'bot_' + st.bot.id,
        kind: st.bot.mech === 'boss' ? 'saw' : 'cyber',
        color: st.bot.color,
        ring: st.bot.ring
      };
    }
    var face2 = st.mode === 2 ? 'player' : st.bot.mech;
    return [p1Skin, p2Skin, face2];
  }

  function resetField(serveDir) {
    var eq = equipSkins();
    st.mallets = [
      makeMallet(-1, eq[0], 'player'),
      makeMallet(1, eq[1], eq[2])
    ];
    st.tiny[0] = 0; st.tiny[1] = 0;
    st.powers.length = 0;
    st.powerT = 3.8;
    servePuck(serveDir || 0);
  }

  function servePuck(dir) {
    var sx = G.CX + (dir ? dir * 110 : 0);
    var vx = dir ? -dir * 180 : 0;
    var vy = st.demo ? (Math.random() < 0.5 ? 240 : -240) : 0;
    if (st.demo && !vx) vx = Math.random() < 0.5 ? 420 : -420;
    st.pucks = [makePuck(sx, G.CY, vx, vy)];
  }

  function setScene(sc) {
    st.scene = sc;
    st.stateT = 0;
    frameDirty = true;
  }

  function startDemo() {
    st.demo = true;
    st.paused = false;
    st.mode = save.mode;
    st.bot = byId(AH.BOTS, save.bot);
    st.goalsToWin = save.goals;
    st.chaos = save.chaos;
    st.score = [0, 0];
    st.banner = null;
    st.rings.length = 0;
    st.popups.length = 0;
    fx.clear();
    resetField(0);
    st.mallets[0].face = 'turbo';
    st.mallets[1].face = st.bot.mech;
    setScene('play');
    pauseBtn.hidden = true;
  }

  function startMatch() {
    S.click();
    toastsEl.innerHTML = '';
    st.demo = false;
    st.paused = false;
    st.committed = false;
    st.mode = save.mode;
    st.bot = byId(AH.BOTS, save.bot);
    st.goalsToWin = save.goals;
    st.chaos = save.chaos;
    st.score = [0, 0];
    st.maxDeficit = 0;
    st.streak = [0, 0];
    st.saves = [0, 0];
    st.shots = [0, 0];
    st.topKmh = [0, 0];
    st.powerHits = 0;
    st.lastScorer = 0;
    st.goalFlash = [0, 0];
    st.awardQ = [];
    st.matchAwards = [];
    st.matchCoins = 0;
    st.lastRocket = -10;
    st.useKeys = st.mode === 2;
    st.ptrActive = false;
    ptr.reset();
    lastPtr.x = ptr.x;
    lastPtr.y = ptr.y;
    st.rings.length = 0;
    st.popups.length = 0;
    fx.clear();
    resetField(0);
    st.countBeat = 3;
    setBanner('3', st.mode === 2 ? 'مواجهة لاعبين!' : 'ضد ' + st.bot.name, '#5ef2ff', 0.65);
    S.tick(false);
    setScene('ready');
    openScreen('none');
    pauseBtn.hidden = false;
    if (st.mode === 1) { var warm = dda.level; void warm; }
    Kit.stats.round(st.mode === 2 ? 'duo' : 'cpu-' + st.bot.id);
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
  }

  function pauseGame(withSfx) {
    if (st.demo || st.paused || st.scene === 'over') return;
    if (withSfx) S.click();
    st.paused = true;
    frameDirty = true;
    Kit.keys.reset();
    ptr.reset();
    openScreen('pause');
  }

  function resumeGame() {
    if (!st.paused) return;
    S.click();
    st.paused = false;
    frameDirty = true;
    Kit.keys.reset();
    ptr.reset();
    openScreen('none');
    pauseBtn.hidden = false;
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
  }

  function goMenu() {
    S.click();
    if (!st.demo && st.scene !== 'over') {
      if (st.scene === 'ending' && !st.committed) commitMatch();
      else if (!st.committed) Kit.stats.end('quit', st.score[0]);
    }
    flushAwards();
    startDemo();
    openScreen('title');
  }

  function spawnPower(forcedId) {
    if (st.powers.length >= 2) return null;
    var def = forcedId ? byId(AH.POWERS, forcedId) : Kit.pick(AH.POWERS);
    var px = Kit.rand(G.CX - 190, G.CX + 190);
    var py = Kit.rand(G.T + 96, G.B - 96);
    for (var i = 0; i < st.powers.length; i++) {
      if (Kit.dist(px, py, st.powers[i].x, st.powers[i].y) < 110) {
        py = py < G.CY ? G.CY + 120 : G.CY - 120;
      }
    }
    var pw = { x: px, y: py, r: 30, def: def, age: 0, life: 11, seed: Math.random() * 6.28 };
    st.powers.push(pw);
    ring(px, py, def.color, 64);
    return pw;
  }

  function commitMatch() {
    if (st.committed || st.demo) return;
    st.committed = true;
    var p1Won = st.score[0] > st.score[1];
    save.matches++;
    if (st.mode === 2) {
      st.matchCoins = 20;
      save.coins += st.matchCoins;
      earn('friends', false);
      Kit.stats.end('end', Math.max(st.score[0], st.score[1]));
    } else {
      var base = p1Won ? st.bot.coins : Math.max(6, st.score[0] * 3);
      var cleanBonus = p1Won && st.score[1] === 0 ? 10 : 0;
      st.matchCoins = base + cleanBonus;
      save.coins += st.matchCoins;
      if (p1Won) {
        var bid = st.bot.id;
        save.wins[bid] = (save.wins[bid] | 0) + 1;
        save.beaten[bid] = true;
        AH.MALLETS.forEach(function (m) {
          if (m.unlock === bid && save.owned.mallet.indexOf(m.id) < 0) save.owned.mallet.push(m.id);
        });
        earn('win1', false);
        earn('beat_' + bid, false);
        if (st.score[1] === 0) earn('clean', false);
        if (st.maxDeficit >= 3) earn('comeback', false);
        if (st.chaos) earn('chaos', false);
        if (unlockedGearCount() >= 3) earn('shopper', false);
      }
      var diff = (st.score[0] - st.score[1]) / Math.max(1, st.goalsToWin);
      dda.result(Kit.clamp(0.5 + diff * 0.5, 0, 1));
      Kit.stats.end(p1Won ? 'win' : 'lose', st.score[0]);
    }
    persist();
    buildBotCards();
  }

  function onGoal(sideScoredOn, puck) {
    if (st.scene !== 'play') return;
    puck.scored = true;
    puck.alive = false;
    var scorerIdx = sideScoredOn > 0 ? 0 : 1;
    var victimIdx = 1 - scorerIdx;
    var gx = sideScoredOn < 0 ? G.L : G.R;
    var col = scorerIdx === 0 ? st.table.a : st.table.b;

    st.goalFlash[victimIdx] = 1;
    emit(gx, puck.y, col, 36, 520);
    emit(gx, puck.y, '#fff06a', 18, 380);
    ring(gx, puck.y, col, 175);
    shake.add(14);

    if (st.demo) {
      servePuck(sideScoredOn);
      return;
    }

    st.score[scorerIdx]++;
    st.lastScorer = sideScoredOn;
    st.streak[scorerIdx]++;
    st.streak[victimIdx] = 0;
    st.mallets[scorerIdx].mood = 'joy'; st.mallets[scorerIdx].moodT = 1.3;
    st.mallets[victimIdx].mood = 'sad'; st.mallets[victimIdx].moodT = 1.3;

    if (st.mode === 1) {
      st.maxDeficit = Math.max(st.maxDeficit, st.score[1] - st.score[0]);
      if (scorerIdx === 0) Kit.track.hit(); else Kit.track.miss();
    }

    var humanScored = scorerIdx === 0 || st.mode === 2;
    S.goal(scorerIdx === 0 || st.mode === 2);

    if (scorerIdx === 0) {
      save.totalGoals++;
      if (!earn('goal1', false)) persist();
      if (st.streak[0] >= 3) earn('hat', false);
    } else if (st.mode === 2) {
      save.totalGoals++;
      persist();
    }

    var won = st.score[scorerIdx] >= st.goalsToWin;
    var word = puck.banked ? AH.WORDS.bank : (st.streak[scorerIdx] >= 3 ? AH.WORDS.hat : Kit.pick(AH.WORDS.goal));
    var sub = st.score[0] + ' - ' + st.score[1];
    if (!won && (st.score[0] === st.goalsToWin - 1 || st.score[1] === st.goalsToWin - 1)) {
      sub = AH.WORDS.matchPoint + '  ' + sub;
    }

    if (won) {
      commitMatch();
      flushAwards();
      setBanner(scorerIdx === 0 ? 'هدف الفوز!' : (st.mode === 2 ? 'فوز اللاعب 2!' : 'انتهت المباراة!'), sub, col, 1.35);
      setScene('ending');
    } else {
      flushAwards();
      setBanner(humanScored ? word : 'هدف للخصم!', sub, col, 1.15);
      setScene('goal');
    }
  }

  /* ------------------------------------------------ mallet & AI control */
  function clampMallet(m) {
    var pad = m.r + 4;
    var minX = m.side < 0 ? G.L + pad : G.CX + m.r + 2;
    var maxX = m.side < 0 ? G.CX - m.r - 2 : G.R - pad;
    var minY = G.T + pad, maxY = G.B - pad;
    if (m.x < minX) { m.x = minX; if (m.vx < 0) m.vx = 0; }
    if (m.x > maxX) { m.x = maxX; if (m.vx > 0) m.vx = 0; }
    if (m.y < minY) { m.y = minY; if (m.vy < 0) m.vy = 0; }
    if (m.y > maxY) { m.y = maxY; if (m.vy > 0) m.vy = 0; }
    // Keep out of the curved rink corners
    var cx = m.side < 0 ? G.L + G.CR : G.R - G.CR;
    if ((m.side < 0 && m.x < cx) || (m.side > 0 && m.x > cx)) {
      var cy = m.y < G.T + G.CR ? G.T + G.CR : (m.y > G.B - G.CR ? G.B - G.CR : 0);
      if (cy) {
        var dx = m.x - cx, dy = m.y - cy, d = M.hypot(dx, dy), lim = G.CR - m.r - 3;
        if (d > lim && d > 0.001) {
          m.x = cx + dx / d * lim;
          m.y = cy + dy / d * lim;
        }
      }
    }
  }

  function triggerBoost(m, kx, ky) {
    if (m.boostCd > 0 || m.frozen > 0 || st.scene !== 'play') return;
    var bx = kx, by = ky;
    if (!bx && !by) {
      // Aim toward a nearby puck ahead, otherwise straight toward rival goal
      var best = null, bestD = 260;
      for (var i = 0; i < st.pucks.length; i++) {
        var p = st.pucks[i];
        if (!p.alive || p.scored) continue;
        var d = Kit.dist(m.x, m.y, p.x, p.y);
        if (d < bestD && (p.x - m.x) * (m.side < 0 ? 1 : -1) > -24) { best = p; bestD = d; }
      }
      if (best) {
        var ang = M.atan2(best.y - m.y, best.x - m.x);
        bx = M.cos(ang); by = M.sin(ang);
      } else {
        bx = m.side < 0 ? 1 : -1; by = 0;
      }
    }
    var len = M.hypot(bx, by) || 1;
    bx /= len; by /= len;
    m.boost = 0.18;
    m.boostCd = 0.44;
    m.vx = bx * BOOST_SPD;
    m.vy = by * BOOST_SPD;
    m.avx = m.vx;
    m.avy = m.vy;
    m.sq = 0.7;
    m.sqAng = M.atan2(by, bx);
    S.boost();
    ring(m.x, m.y, '#fff06a', m.r + 30);
    emit(m.x - bx * m.r * 0.7, m.y - by * m.r * 0.7, '#fff06a', 10, 260);
  }

  function stepKeyboardMallet(m, dt, upK, dnK, lfK, rtK, boostKeys) {
    var kx = (Kit.keys.anyDown(rtK) ? 1 : 0) - (Kit.keys.anyDown(lfK) ? 1 : 0);
    var ky = (Kit.keys.anyDown(dnK) ? 1 : 0) - (Kit.keys.anyDown(upK) ? 1 : 0);
    if (Kit.keys.anyPressed(boostKeys)) triggerBoost(m, kx, ky);
    var slow = m.frozen > 0 ? 0.36 : 1;
    if (m.boost > 0) {
      m.x += m.vx * slow * dt;
      m.y += m.vy * slow * dt;
    } else if (kx || ky) {
      var l = M.hypot(kx, ky);
      kx /= l; ky /= l;
      var maxS = KEY_MAX * slow;
      m.vx += (kx * maxS - m.vx) * M.min(1, KEY_ACC / maxS * dt);
      m.vy += (ky * maxS - m.vy) * M.min(1, KEY_ACC / maxS * dt);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    } else {
      var damp = M.max(0, 1 - dt * 20);
      m.vx *= damp; m.vy *= damp;
      m.x += m.vx * dt; m.y += m.vy * dt;
    }
    m.avx += (m.vx - m.avx) * M.min(1, dt * 30);
    m.avy += (m.vy - m.avy) * M.min(1, dt * 30);
    clampMallet(m);
  }

  function stepMouseMallet(m, dt) {
    var slow = m.frozen > 0 ? 0.36 : 1;
    if (Kit.keys.anyPressed(['Space', 'ShiftLeft'])) {
      triggerBoost(m, 0, 0);
    }
    if (m.boost > 0) {
      m.x += m.vx * slow * dt;
      m.y += m.vy * slow * dt;
      m.avx = m.vx; m.avy = m.vy;
      clampMallet(m);
      return;
    }
    var tx = Kit.clamp(ptr.x, G.L + m.r + 4, G.CX - m.r - 2);
    var ty = Kit.clamp(ptr.y, G.T + m.r + 4, G.B - m.r - 4);
    var dx = tx - m.x, dy = ty - m.y;
    var dist = M.hypot(dx, dy);
    var maxStep = MOUSE_MAX * slow * dt;
    var ox = m.x, oy = m.y;
    if (dist > maxStep && dist > 0.001) {
      m.x += dx / dist * maxStep;
      m.y += dy / dist * maxStep;
    } else {
      m.x = tx; m.y = ty;
    }
    clampMallet(m);
    m.vx = (m.x - ox) / dt;
    m.vy = (m.y - oy) / dt;
    m.avx += (m.vx - m.avx) * M.min(1, dt * 28);
    m.avy += (m.vy - m.avy) * M.min(1, dt * 28);
  }

  function stepBotMallet(m, dt, profile) {
    var side = m.side;
    var ddaScale = st.demo ? 1 : (0.86 + dda.level * 0.26);
    var maxSpd = profile.speed * ddaScale * (m.frozen > 0 ? 0.34 : 1);
    var acc = profile.accel * ddaScale;
    var homeX = side < 0 ? G.L + profile.depth : G.R - profile.depth;

    // Pick highest-threat live puck
    var p = null, bestScore = -1e9;
    for (var i = 0; i < st.pucks.length; i++) {
      var q = st.pucks[i];
      if (!q.alive || q.scored) continue;
      var towardMe = q.vx * side > 40;
      var onMySide = (q.x - G.CX) * side > -30;
      var sc = (towardMe ? 500 : 0) + (onMySide ? 350 : 0) - M.abs(q.x - homeX) * 0.4;
      if (sc > bestScore) { bestScore = sc; p = q; }
    }

    m.aiT -= dt;
    if (m.aiT <= 0) {
      m.aiT = M.max(0.035, profile.react * (st.demo ? 0.9 : (1.12 - dda.level * 0.24)));
      m.errY = Kit.rand(-profile.err, profile.err) * (st.demo ? 0.45 : (1.12 - dda.level * 0.3));
      if (!p) {
        m.tx = homeX; m.ty = G.CY;
      } else {
        var onHalf = (p.x - G.CX) * side > 0;
        var coming = p.vx * side > 30;
        var sp = M.hypot(p.vx, p.vy);
        if (onHalf && sp < profile.attackMax + 360) {
          // Strike through the puck toward opposing goal!
          var behind = side * 18;
          m.tx = p.x + behind;
          m.ty = p.y + m.errY * 0.32 + (M.random() < profile.bank ? (p.y < G.CY ? 28 : -28) : 0);
        } else if (coming) {
          var tHit = M.abs(homeX - p.x) / M.max(180, M.abs(p.vx));
          var py = p.y + p.vy * tHit * profile.lead + m.errY;
          var minB = G.T + G.PR, maxB = G.B - G.PR, span = maxB - minB;
          while (py < minB || py > maxB) {
            if (py < minB) py = minB + (minB - py);
            if (py > maxB) py = maxB - (py - maxB);
            if (M.abs(py) > span * 4) { py = G.CY; break; }
          }
          m.tx = homeX;
          m.ty = Kit.clamp(py, G.CY - G.GOAL - 18, G.CY + G.GOAL + 18);
        } else {
          // Guard crease or grab a safe power-up on own side
          var powTarget = null;
          for (var j = 0; j < st.powers.length; j++) {
            var pw = st.powers[j];
            if ((pw.x - G.CX) * side > 25) { powTarget = pw; break; }
          }
          if (powTarget && !profile.naive) {
            m.tx = powTarget.x; m.ty = powTarget.y;
          } else {
            m.tx = homeX;
            m.ty = Kit.lerp(G.CY, p.y, 0.42) + m.errY * 0.25;
          }
        }
      }
    }

    // Immediate emergency lunge when puck is right in front of mallet on own half
    var tx = m.tx, ty = m.ty;
    if (p && (p.x - G.CX) * side > 10 && (m.x - p.x) * side > -10 && Kit.dist(m.x, m.y, p.x, p.y) < 190) {
      tx = p.x - side * 26;
      ty = p.y + m.errY * 0.18;
      maxSpd *= profile.strike || 1.15;
    }

    var dx = tx - m.x, dy = ty - m.y, d = M.hypot(dx, dy);
    var wantVx = d > 3 ? dx / d * M.min(maxSpd, d * 11) : 0;
    var wantVy = d > 3 ? dy / d * M.min(maxSpd, d * 11) : 0;
    var dvx = wantVx - m.vx, dvy = wantVy - m.vy, dv = M.hypot(dvx, dvy);
    var maxDv = acc * dt;
    if (dv > maxDv && dv > 0.001) { m.vx += dvx / dv * maxDv; m.vy += dvy / dv * maxDv; }
    else { m.vx = wantVx; m.vy = wantVy; }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.avx += (m.vx - m.avx) * M.min(1, dt * 24);
    m.avy += (m.vy - m.avy) * M.min(1, dt * 24);
    clampMallet(m);
  }

  /* --------------------------------------------------- puck & collisions */
  function collideMalletPuck(m, p) {
    var dx = p.x - m.x, dy = p.y - m.y;
    var d = M.hypot(dx, dy), minD = m.r + p.r;
    if (d >= minD) return;
    var nx = d > 0.001 ? dx / d : (m.side < 0 ? 1 : -1);
    var ny = d > 0.001 ? dy / d : 0;
    p.x = m.x + nx * (minD + 0.5);
    p.y = m.y + ny * (minD + 0.5);

    var mvx = m.avx, mvy = m.avy;
    var idx = sideIdx(m.side);
    var rvx = p.vx - mvx, rvy = p.vy - mvy;
    var vn = rvx * nx + rvy * ny;

    // Close-save check before reversing velocity!
    if (!st.demo && !p.savedClose && p.lastHit === -m.side) {
      var goalX = m.side < 0 ? G.L : G.R;
      var headingIn = (m.side < 0 && p.vx < -480) || (m.side > 0 && p.vx > 480);
      if (headingIn && M.abs(p.x - goalX) < 235 && M.abs(p.y - G.CY) < G.GOAL + 24) {
        p.savedClose = true;
        st.saves[idx]++;
        S.save();
        popup(m.x, m.y - m.r - 18, Kit.pick(AH.WORDS.save), '#5ef2ff', 26);
        if (idx === 0 && st.saves[0] >= 5) earn('keeper', false);
      }
    }

    if (vn < 0) {
      var boostMul = m.boost > 0 ? 1.3 : 1;
      var j = -(1 + 0.92) * vn * boostMul;
      p.vx += nx * j + mvx * 0.22;
      p.vy += ny * j + mvy * 0.22;
    } else {
      var msp = M.hypot(mvx, mvy);
      var push = M.max(360, msp * 1.15);
      p.vx = nx * push;
      p.vy = ny * push;
    }

    var cap = p.fire > 0 ? PMAX_FIRE : PMAX;
    var sp = M.hypot(p.vx, p.vy);
    if (sp > cap) { p.vx = p.vx / sp * cap; p.vy = p.vy / sp * cap; sp = cap; }
    if (sp < 210) { p.vx = nx * 210; p.vy = ny * 210; sp = 210; }

    p.lastHit = m.side;
    p.banked = false;
    p.savedClose = false;
    p.stuck = 0;

    var kmh = M.round(sp * KMH);
    if (!st.demo) {
      st.shots[idx]++;
      if (kmh > st.topKmh[idx]) st.topKmh[idx] = kmh;
      var isHuman = idx === 0 || st.mode === 2;
      if (kmh >= 110) {
        if (idx === 0) earn('rocket', false);
        if (isHuman && st.t - st.lastRocket > 0.75) {
          st.lastRocket = st.t;
          S.rocket();
          shake.add(9);
          ring(p.x, p.y, '#fff06a', 96);
          popup(p.x, p.y - 28, Kit.pick(AH.WORDS.rocket) + ' ' + kmh + ' كم/س', '#fff06a', 27);
        }
      }
    }

    var pow = Kit.clamp(sp / 1600, 0.15, 1);
    m.sq = M.min(0.85, 0.25 + pow * 0.55);
    m.sqAng = M.atan2(ny, nx);
    S.hit(pow);
    if (pow > 0.48) {
      emit(p.x - nx * p.r, p.y - ny * p.r, m.skin.color, 10, 260);
      if (pow > 0.75) shake.add(5);
    }
  }

  function collidePuckWalls(p) {
    var r = p.r;
    var halfL = st.tiny[0] > 0 ? G.TINY : G.GOAL;
    var halfR = st.tiny[1] > 0 ? G.TINY : G.GOAL;

    // Top & bottom laser rails
    if (p.y - r < G.T) {
      p.y = G.T + r;
      if (p.vy < 0) { p.vy = -p.vy * 0.96; p.banked = true; S.wall(M.abs(p.vy) / 1400); emit(p.x, G.T, st.table.line, 6, 180); }
    } else if (p.y + r > G.B) {
      p.y = G.B - r;
      if (p.vy > 0) { p.vy = -p.vy * 0.96; p.banked = true; S.wall(M.abs(p.vy) / 1400); emit(p.x, G.B, st.table.line, 6, 180); }
    }

    // Goal post pylons (crisp metallic clang!)
    var posts = [
      [G.L, G.CY - halfL], [G.L, G.CY + halfL],
      [G.R, G.CY - halfR], [G.R, G.CY + halfR]
    ];
    for (var i = 0; i < 4; i++) {
      var px = posts[i][0], py = posts[i][1];
      var dx = p.x - px, dy = p.y - py, d = M.hypot(dx, dy), minP = r + 8;
      if (d < minP && d > 0.001) {
        var nx = dx / d, ny = dy / d;
        p.x = px + nx * minP; p.y = py + ny * minP;
        var vn = p.vx * nx + p.vy * ny;
        if (vn < 0) {
          p.vx -= 1.92 * vn * nx;
          p.vy -= 1.92 * vn * ny;
          S.post();
          emit(px, py, '#ffffff', 12, 320);
          shake.add(5);
        }
      }
    }

    // Left goal or left wall
    if (p.x - r < G.L) {
      if (M.abs(p.y - G.CY) < halfL - r * 0.35) {
        if (p.x < G.L - r * 0.35) onGoal(-1, p);
        return;
      }
      p.x = G.L + r;
      if (p.vx < 0) { p.vx = -p.vx * 0.96; S.wall(M.abs(p.vx) / 1400); emit(G.L, p.y, st.table.a, 6, 180); }
    }

    // Right goal or right wall
    if (p.x + r > G.R) {
      if (M.abs(p.y - G.CY) < halfR - r * 0.35) {
        if (p.x > G.R + r * 0.35) onGoal(1, p);
        return;
      }
      p.x = G.R - r;
      if (p.vx > 0) { p.vx = -p.vx * 0.96; S.wall(M.abs(p.vx) / 1400); emit(G.R, p.y, st.table.b, 6, 180); }
    }

    // Rounded corners (keeps pucks flowing back into play, never wedged!)
    var cx = p.x < G.L + G.CR ? G.L + G.CR : (p.x > G.R - G.CR ? G.R - G.CR : 0);
    var cy = p.y < G.T + G.CR ? G.T + G.CR : (p.y > G.B - G.CR ? G.B - G.CR : 0);
    if (cx && cy) {
      var cdx = p.x - cx, cdy = p.y - cy, cd = M.hypot(cdx, cdy), maxC = G.CR - r;
      if (cd > maxC && cd > 0.001) {
        var cnx = cdx / cd, cny = cdy / cd;
        p.x = cx + cnx * maxC;
        p.y = cy + cny * maxC;
        var cvn = p.vx * cnx + p.vy * cny;
        if (cvn > 0) {
          p.vx -= 1.92 * cvn * cnx;
          p.vy -= 1.92 * cvn * cny;
          p.banked = true;
          S.wall(M.abs(cvn) / 1400);
        }
      }
    }
  }

  function collidePuckPairs() {
    for (var i = 0; i < st.pucks.length; i++) {
      var a = st.pucks[i];
      if (!a.alive || a.scored) continue;
      for (var j = i + 1; j < st.pucks.length; j++) {
        var b = st.pucks[j];
        if (!b.alive || b.scored) continue;
        var dx = b.x - a.x, dy = b.y - a.y, d = M.hypot(dx, dy), minD = a.r + b.r;
        if (d < minD && d > 0.001) {
          var nx = dx / d, ny = dy / d, ov = (minD - d) * 0.5;
          a.x -= nx * ov; a.y -= ny * ov;
          b.x += nx * ov; b.y += ny * ov;
          var dv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (dv > 0) {
            a.vx -= dv * nx; a.vy -= dv * ny;
            b.vx += dv * nx; b.vy += dv * ny;
            S.wall(0.35);
          }
        }
      }
    }
  }

  function stepSim(dt) {
    var timeScale = st.scene === 'ending' ? 0.32 : 1;
    var sdt = dt * timeScale;
    st.t += sdt;
    st.stateT += dt;

    // Detect fresh pointer vs keyboard preference in 1P mode
    if (st.mode === 1 && !st.demo) {
      if (M.hypot(ptr.x - lastPtr.x, ptr.y - lastPtr.y) > 1.5 || ptr.pressed) {
        st.ptrActive = true;
        st.useKeys = false;
        lastPtr.x = ptr.x; lastPtr.y = ptr.y;
      } else if (Kit.keys.anyDown(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft'])) {
        st.useKeys = true;
      }
    }

    // Scene state transitions
    if (st.scene === 'ready') {
      var beat = 3 - M.floor(st.stateT / 0.55);
      if (beat < st.countBeat && beat >= 1) {
        st.countBeat = beat;
        setBanner(String(beat), st.mode === 2 ? 'مواجهة لاعبين!' : 'ضد ' + st.bot.name, '#5ef2ff', 0.6);
        S.tick(false);
      } else if (st.stateT >= 1.65) {
        setBanner('انطلق!', '', '#fff06a', 0.65);
        S.tick(true);
        setScene('play');
      }
    } else if (st.scene === 'goal') {
      if (st.stateT >= 1.25) {
        resetField(st.lastScorer);
        setScene('play');
      }
    } else if (st.scene === 'ending') {
      if (st.stateT >= 1.35) {
        showOver();
        return;
      }
    }

    // Timers & visual decay
    st.tiny[0] = M.max(0, st.tiny[0] - sdt);
    st.tiny[1] = M.max(0, st.tiny[1] - sdt);
    st.goalFlash[0] = M.max(0, st.goalFlash[0] - dt * 2.2);
    st.goalFlash[1] = M.max(0, st.goalFlash[1] - dt * 2.2);
    if (st.banner) {
      st.banner.t += dt;
      if (st.banner.t >= st.banner.dur) st.banner = null;
    }

    // Mallet updates
    for (var mi = 0; mi < 2; mi++) {
      var m = st.mallets[mi];
      m.big = M.max(0, m.big - sdt);
      m.frozen = M.max(0, m.frozen - sdt);
      m.boost = M.max(0, m.boost - dt);
      m.boostCd = M.max(0, m.boostCd - dt);
      m.sq = M.max(0, m.sq - dt * 5.5);
      if (m.moodT > 0) { m.moodT -= dt; if (m.moodT <= 0) m.mood = ''; }
      m.blinkT -= dt;
      if (m.blinkT <= 0) { m.blink = 1; m.blinkT = Kit.rand(2.4, 5.2); }
      else m.blink = M.max(0, m.blink - dt * 8);
      var targetR = m.big > 0 ? G.BIG : G.MR;
      m.r += (targetR - m.r) * M.min(1, dt * 14);
    }

    if (st.demo) {
      stepBotMallet(st.mallets[0], sdt, AH.BOTS[1]);
      stepBotMallet(st.mallets[1], sdt, st.bot);
    } else if (st.mode === 2) {
      stepKeyboardMallet(st.mallets[0], sdt, ['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['Space', 'ShiftLeft']);
      stepKeyboardMallet(st.mallets[1], sdt, ['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight'], ['Enter', 'NumpadEnter', 'ShiftRight']);
    } else {
      if (st.useKeys) {
        stepKeyboardMallet(st.mallets[0], sdt, ['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'], ['Space', 'ShiftLeft']);
      } else if (st.ptrActive) {
        stepMouseMallet(st.mallets[0], sdt);
      }
      if (st.scene === 'play' || st.scene === 'ending') stepBotMallet(st.mallets[1], sdt, st.bot);
    }

    // Power-up spawning & pickup
    if (st.chaos && st.scene === 'play') {
      st.powerT -= sdt;
      if (st.powerT <= 0) {
        spawnPower();
        st.powerT = st.demo ? 4.8 : Kit.rand(5.4, 7.4);
      }
    }
    for (var pi = st.powers.length - 1; pi >= 0; pi--) {
      var pw = st.powers[pi];
      pw.age += sdt;
      if (pw.age >= pw.life) { st.powers.splice(pi, 1); continue; }
      var ownerSide = 0, hitPuck = null;
      for (var qi = 0; qi < st.pucks.length; qi++) {
        var qp = st.pucks[qi];
        if (!qp.alive || qp.scored) continue;
        if (Kit.dist(pw.x, pw.y, qp.x, qp.y) < pw.r + qp.r) {
          ownerSide = qp.lastHit || (st.demo ? (qp.vx >= 0 ? -1 : 1) : 0);
          hitPuck = qp;
          break;
        }
      }
      if (!ownerSide) {
        for (var m2 = 0; m2 < 2; m2++) {
          var mm = st.mallets[m2];
          if (Kit.dist(pw.x, pw.y, mm.x, mm.y) < pw.r + mm.r) { ownerSide = mm.side; break; }
        }
      }
      if (ownerSide) {
        st.powers.splice(pi, 1);
        if (!st.demo && ownerSide < 0) st.powerHits++;
        applyPower(pw, ownerSide, hitPuck);
      }
    }

    // Sub-stepped puck physics so blazing 2200 px/s fireballs never tunnel!
    if (st.scene === 'play' || st.scene === 'ending') {
      var subSteps = 3, pdt = sdt / subSteps;
      for (var s = 0; s < subSteps; s++) {
        for (var k = 0; k < st.pucks.length; k++) {
          var p = st.pucks[k];
          if (!p.alive || p.scored) continue;
          p.x += p.vx * pdt;
          p.y += p.vy * pdt;
          var drag = M.pow(0.992, pdt * 60);
          p.vx *= drag; p.vy *= drag;
          collideMalletPuck(st.mallets[0], p);
          collideMalletPuck(st.mallets[1], p);
          collidePuckWalls(p);
          if (st.scene !== 'play' && st.scene !== 'ending') break;
        }
        collidePuckPairs();
        if (st.scene !== 'play' && st.scene !== 'ending') break;
      }
    }

    // Puck trails, fire decay & anti-dead-zone gentle drift
    for (var ti = st.pucks.length - 1; ti >= 0; ti--) {
      var pk = st.pucks[ti];
      if (!pk.alive) { st.pucks.splice(ti, 1); continue; }
      pk.spawn = M.min(1, pk.spawn + dt * 5);
      pk.fire = M.max(0, pk.fire - sdt);
      var psp = M.hypot(pk.vx, pk.vy);
      if (st.scene === 'play' && psp < 42 && M.abs(pk.x - G.CX) > 40) {
        pk.stuck += sdt;
        if (pk.stuck > 1.8) {
          var ndx = G.CX - pk.x, ndy = G.CY - pk.y, nd = M.hypot(ndx, ndy) || 1;
          pk.vx += ndx / nd * 240;
          pk.vy += ndy / nd * 240;
          pk.stuck = 0;
        }
      } else pk.stuck = 0;
      if (!Kit.motion.reduced() && psp > 140) {
        pk.trail.push({ x: pk.x, y: pk.y, fire: pk.fire > 0 });
        if (pk.trail.length > 12) pk.trail.shift();
      } else if (pk.trail.length) pk.trail.shift();
    }

    // Rings, popups, particles & camera shake
    for (var ri = st.rings.length - 1; ri >= 0; ri--) {
      st.rings[ri].life -= dt;
      if (st.rings[ri].life <= 0) st.rings.splice(ri, 1);
    }
    for (var oi = st.popups.length - 1; oi >= 0; oi--) {
      st.popups[oi].life -= dt;
      st.popups[oi].y -= dt * 34;
      if (st.popups[oi].life <= 0) st.popups.splice(oi, 1);
    }
    fx.update(dt);
    shake.update(dt);
  }

  function applyPower(pw, side, puck) {
    var idx = sideIdx(side), foe = 1 - idx;
    var m = st.mallets[idx], fm = st.mallets[foe];
    var id = pw.def.id, col = pw.def.color;
    S.power();
    emit(pw.x, pw.y, col, 22, 420);
    ring(pw.x, pw.y, col, 92);
    popup(pw.x, pw.y - 24, pw.def.name, col, 30);
    if (id === 'fire') {
      var p = puck;
      if (!p || !p.alive || p.scored) {
        var best = 1e9;
        for (var i = 0; i < st.pucks.length; i++) {
          var q = st.pucks[i];
          if (q.alive && !q.scored) {
            var d = Kit.dist(m.x, m.y, q.x, q.y);
            if (d < best) { best = d; p = q; }
          }
        }
      }
      if (p) {
        p.fire = 5;
        var dir = side < 0 ? 1 : -1;
        var sp = Math.hypot(p.vx, p.vy);
        if (!sp) { p.vx = dir; p.vy = 0; sp = 1; }
        if (p.vx * dir < 0) p.vx = -p.vx;
        var ns = Math.min(PMAX_FIRE, Math.max(1500, sp * 1.6));
        p.vx = p.vx / sp * ns;
        p.vy = p.vy / sp * ns;
        S.fire();
        shake.add(8);
        ring(p.x, p.y, '#ff6a00', 110);
      }
    } else if (id === 'multi') {
      if (st.pucks.length < 3) {
        var src = puck && puck.alive && !puck.scored ? puck : st.pucks[0];
        var bx = src ? src.x : G.CX, by = src ? src.y : G.CY;
        var bvx = src && (src.vx || src.vy) ? src.vx : (side < 0 ? 680 : -680);
        var bvy = src ? src.vy : 0;
        var ang = Math.atan2(bvy, bvx) + (Math.random() < 0.5 ? 0.45 : -0.45);
        var msp = Math.max(640, Math.min(1350, Math.hypot(bvx, bvy)));
        var np = makePuck(bx, by, Math.cos(ang) * msp, Math.sin(ang) * msp);
        np.lastHit = side;
        st.pucks.push(np);
      }
    } else if (id === 'big') {
      m.big = 7;
    } else if (id === 'tiny') {
      st.tiny[idx] = 7.5;
    } else if (id === 'freeze') {
      fm.frozen = 2.4;
      S.freeze();
      emit(fm.x, fm.y, '#80f5ff', 20, 340);
      ring(fm.x, fm.y, '#80f5ff', 84);
    }
  }

  /* ---------------------------------------------------------- update */
  function update(dt) {
    if (st.paused) { Kit.keys.endFrame(); ptr.endFrame(); return; }
    stepSim(dt);
    Kit.keys.endFrame();
    ptr.endFrame();
  }

  /* ========================================================== render */
  function drawHUD() {
    var th = st.table;
    var nameL = st.mode === 2 ? 'اللاعب 1' : 'أنت';
    var nameR = st.mode === 2 ? 'اللاعب 2' : st.bot.name;

    // Left score plate: x = 180..544 (clears .sg-save-status corner 0..170 x 0..96!)
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,42,0.88)';
    AH.rrect(ctx, 180, 14, 364, 70, 20);
    ctx.fill();
    ctx.strokeStyle = AH.hexA(th.a, 0.72);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Right score plate: x = 736..1100 (clears #pauseBtn and .sg-mute on top-right!)
    ctx.fillStyle = 'rgba(8,14,42,0.88)';
    AH.rrect(ctx, 736, 14, 364, 70, 20);
    ctx.fill();
    ctx.strokeStyle = AH.hexA(th.b, 0.72);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Center target badge: x = 556..724
    ctx.fillStyle = 'rgba(12,20,58,0.92)';
    AH.rrect(ctx, 556, 18, 168, 62, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,106,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.font = '700 24px Fredoka, sans-serif';
    ctx.fillStyle = '#dff8ff';
    ctx.textAlign = 'right';
    ctx.fillText(nameL, 456, 49);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe2ea';
    ctx.fillText(nameR, 824, 49);

    // Big arcade digits near center
    ctx.direction = 'ltr';
    ctx.font = '800 44px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5ef2ff';
    ctx.fillText(String(st.score[0]), 504, 50);
    ctx.fillStyle = '#ff6b8a';
    ctx.fillText(String(st.score[1]), 776, 50);

    // Center win target + Power-Up badge
    ctx.direction = 'rtl';
    ctx.font = '700 18px Fredoka, sans-serif';
    ctx.fillStyle = '#fff06a';
    ctx.fillText('الهدف: ' + st.goalsToWin, 640, st.chaos ? 39 : 49);
    if (st.chaos) {
      ctx.font = '700 14px Fredoka, sans-serif';
      ctx.fillStyle = '#ff9d2e';
      ctx.fillText('⚡ أقراص القوة', 640, 62);
    }

    // Active power-up mini bars under plates
    if (st.mallets[0].big > 0 || st.tiny[0] > 0) {
      ctx.fillStyle = '#2bff88';
      AH.rrect(ctx, 196, 88, 150 * M.min(1, M.max(st.mallets[0].big, st.tiny[0]) / 7.5), 5, 3);
      ctx.fill();
    }
    if (st.mallets[1].big > 0 || st.tiny[1] > 0) {
      ctx.fillStyle = '#ff9442';
      AH.rrect(ctx, 934, 88, 150 * M.min(1, M.max(st.mallets[1].big, st.tiny[1]) / 7.5), 5, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    if (st.paused && !frameDirty) return;
    frameDirty = false;

    // Exact clear rect signature observed by tools/tests/air-hockey.test.mjs
    ctx.fillStyle = '#050716';
    ctx.fillRect(0, 0, 1280, 720);

    ctx.save();
    if (shake.power > 0.2) ctx.translate(shake.x, shake.y);

    // 1. Baked Cyber Arena
    var arenaSpr = art.arena(st.table);
    ctx.drawImage(arenaSpr.canvas, 0, 0, W, H);

    // 2. Goals & active Goal Shield barriers
    var halfL = st.tiny[0] > 0 ? G.TINY : G.GOAL;
    var halfR = st.tiny[1] > 0 ? G.TINY : G.GOAL;
    art.goal(ctx, -1, halfL, st.table.a, st.goalFlash[0], st.t);
    art.goal(ctx, 1, halfR, st.table.b, st.goalFlash[1], st.t);

    // 3. Power-Up capsules on rink
    for (var pi = 0; pi < st.powers.length; pi++) {
      art.power(ctx, st.powers[pi], st.t);
    }

    // 4. Shockwave rings
    for (var ri = 0; ri < st.rings.length; ri++) {
      var rg = st.rings[ri], u = 1 - rg.life / rg.max;
      ctx.save();
      ctx.globalAlpha = (1 - u) * 0.8;
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 5 * (1 - u * 0.6);
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r + (rg.maxR - rg.r) * u, 0, M.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Puck comet trails & pucks
    var pspr = art.puckSprite(st.puckSkin);
    var trailCols = st.puckSkin.trail;
    for (var k = 0; k < st.pucks.length; k++) {
      var p = st.pucks[k];
      if (!p.alive) continue;
      for (var ti = 0; ti < p.trail.length; ti++) {
        var pt = p.trail[ti], frac = (ti + 1) / (p.trail.length + 1);
        ctx.globalAlpha = frac * 0.58;
        ctx.fillStyle = pt.fire ? (ti % 2 ? '#ffe033' : '#ff5500') : trailCols[ti % trailCols.length];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, p.r * (0.32 + frac * 0.62), 0, M.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (p.fire > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var fg = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, p.r * 2.1);
        fg.addColorStop(0, 'rgba(255,235,80,0.9)');
        fg.addColorStop(0.5, 'rgba(255,95,0,0.65)');
        fg.addColorStop(1, 'rgba(255,30,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.1, 0, M.PI * 2); ctx.fill();
        ctx.restore();
      }
      var psz = pspr.w * (0.5 + 0.5 * p.spawn);
      ctx.drawImage(pspr.canvas, p.x - psz / 2, p.y - psz / 2, psz, psz);
    }

    // 6. Cyber-Mech Mallets (eyes track nearest puck!)
    var trackPuck = st.pucks[0];
    for (var mi = 0; mi < 2; mi++) {
      var m = st.mallets[mi];
      var lx = 0, ly = 0;
      if (trackPuck) {
        var ldx = trackPuck.x - m.x, ldy = trackPuck.y - m.y, ld = M.hypot(ldx, ldy) || 1;
        lx = ldx / ld; ly = ldy / ld;
      }
      art.mallet(ctx, m, m.skin, {
        face: m.face, look: { x: lx, y: ly }, mood: m.mood,
        blink: m.blink, sq: m.sq, sqAng: m.sqAng,
        frozen: m.frozen, boost: m.boost, t: st.t
      });
    }

    // 7. Sparks & floating callout popups
    fx.draw(ctx);
    for (var oi = 0; oi < st.popups.length; oi++) {
      var pp = st.popups[oi], pa = M.min(1, pp.life / pp.max * 1.6);
      ctx.save();
      ctx.globalAlpha = pa;
      ctx.direction = 'rtl';
      ctx.font = '800 ' + pp.size + 'px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(4,8,28,0.9)';
      ctx.strokeText(pp.text, pp.x, pp.y);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, pp.y);
      ctx.restore();
    }

    ctx.restore();

    // Goal scorer flash wash (uses scorer colour, never #050716)
    var flash = M.max(st.goalFlash[0], st.goalFlash[1]);
    if (flash > 0.02 && !Kit.motion.reduced()) {
      var fcol = st.goalFlash[1] >= st.goalFlash[0] ? st.table.a : st.table.b;
      ctx.fillStyle = AH.hexA(fcol, flash * 0.18);
      ctx.fillRect(0, 0, W, H);
    }

    if (!st.demo) {
      drawHUD();
      if (st.banner) {
        var b = st.banner, bu = b.t / b.dur;
        var bsc = bu < 0.16 ? 0.65 + (bu / 0.16) * 0.42 : (bu < 0.28 ? 1.07 - ((bu - 0.16) / 0.12) * 0.07 : 1);
        var balpha = bu > 0.78 ? (1 - bu) / 0.22 : 1;
        ctx.save();
        ctx.globalAlpha = M.max(0, balpha);
        ctx.translate(G.CX, G.CY - 22);
        ctx.scale(bsc, bsc);
        ctx.direction = 'rtl';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 68px Fredoka, sans-serif';
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(4,8,28,0.92)';
        ctx.strokeText(b.text, 0, 0);
        ctx.fillStyle = b.color;
        ctx.fillText(b.text, 0, 0);
        if (b.sub) {
          ctx.font = '700 28px Fredoka, sans-serif';
          ctx.lineWidth = 6;
          ctx.strokeText(b.sub, 0, 54);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(b.sub, 0, 54);
        }
        ctx.restore();
      }
    }
  }

  /* --------------------------------------------------------------- UI */
  var screens = { title: $('scr-title'), pause: $('scr-pause'), over: $('scr-over'), shop: $('scr-shop'), awards: $('scr-awards') };

  function openScreen(name) {
    uiScreen = name;
    for (var k in screens) screens[k].hidden = (k !== name);
    pauseBtn.hidden = st.demo || name !== 'none';
    frameDirty = true;
    if (name === 'title') {
      syncTitleControls();
      buildBotCards();
      buildArenaBar();
      syncCoinsUI();
      syncAwardsCount();
    } else if (name === 'shop') renderShop();
    else if (name === 'awards') renderAwards();
  }

  function syncCoinsUI() {
    var nodes = document.querySelectorAll('.coins');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = Kit.fmt(save.coins);
  }

  function syncAwardsCount() {
    var got = 0;
    for (var i = 0; i < AH.AWARDS.length; i++) if (save.awards[AH.AWARDS[i].id]) got++;
    $('awCount').textContent = $('awProg').textContent = got + '/' + AH.AWARDS.length;
  }

  function syncTitleControls() {
    var m2 = save.mode === 2;
    $('tab1').classList.toggle('on', !m2);
    $('tab2').classList.toggle('on', m2);
    $('bots').hidden = $('howto1').hidden = m2;
    $('twop').hidden = $('howto2').hidden = !m2;
    var gBtns = document.querySelectorAll('.seg.g');
    for (var i = 0; i < gBtns.length; i++) gBtns[i].classList.toggle('on', Number(gBtns[i].getAttribute('data-g')) === save.goals);
    var cb = $('chaosBtn');
    cb.classList.toggle('on', save.chaos);
    cb.textContent = save.chaos ? 'أقراص القوة: مفعّلة ⚡' : 'أقراص القوة: كلاسيكي';
  }

  function buildBotCards() {
    var wrap = $('bots');
    wrap.innerHTML = '';
    AH.BOTS.forEach(function (b) {
      var btn = mk('button', 'bot' + (save.bot === b.id ? ' sel' : ''));
      btn.type = 'button';
      btn.setAttribute('data-bot', b.id);
      var cv = mk('canvas');
      cv.width = cv.height = 112;
      art.preview(cv, 'bot', b);
      btn.appendChild(cv);
      if (save.beaten[b.id]) {
        var cup = mk('span', 'cup', '🏆');
        cup.style.fontSize = '22px';
        btn.appendChild(cup);
      }
      btn.appendChild(mk('div', 'nm', b.name));
      var lv = mk('div', 'lv', b.level);
      lv.style.background = b.lvColor;
      btn.appendChild(lv);
      var wins = save.wins[b.id] | 0;
      btn.appendChild(mk('div', 'rec', wins > 0 ? ('الانتصارات: ' + wins) : ('جائزة الفوز: +' + b.coins + ' 🪙')));
      btn.addEventListener('click', function () {
        S.click();
        save.bot = b.id;
        st.bot = b;
        if (st.demo && st.mallets[1]) {
          st.mallets[1].face = b.mech;
          st.mallets[1].skin = { id: 'bot_' + b.id, kind: b.mech === 'boss' ? 'saw' : 'cyber', color: b.color, ring: b.ring };
        }
        persist();
        buildBotCards();
      });
      wrap.appendChild(btn);
    });
  }

  function buildArenaBar() {
    var bar = $('arenaBar');
    bar.innerHTML = '<span class="lbl">الحلبة:</span>';
    AH.TABLES.forEach(function (tb) {
      var btn = mk('button', 'seg ar' + (save.eq.table === tb.id ? ' on' : ''), tb.name);
      btn.type = 'button';
      btn.setAttribute('data-arena', tb.id);
      btn.addEventListener('click', function () {
        S.click();
        save.eq.table = tb.id;
        st.table = tb;
        frameDirty = true;
        persist();
        buildArenaBar();
      });
      bar.appendChild(btn);
    });
  }

  function applyShopEquip(item) {
    save.eq[shopTab] = item.id;
    if (shopTab === 'table') st.table = item;
    if (shopTab === 'puck') st.puckSkin = item;
    if (shopTab === 'mallet' && st.mallets[0]) st.mallets[0].skin = item;
  }

  function renderShop() {
    syncCoinsUI();
    var tabs = document.querySelectorAll('#scr-shop .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-k') === shopTab);
    var list = shopTab === 'table' ? AH.TABLES : (shopTab === 'puck' ? AH.PUCKS : AH.MALLETS);
    var grid = $('shopGrid');
    grid.innerHTML = '';
    list.forEach(function (item) {
      var owned = save.owned[shopTab].indexOf(item.id) >= 0 || item.price === 0;
      var eqd = save.eq[shopTab] === item.id;
      var card = mk('button', 'item' + (eqd ? ' eq' : '') + (!owned && save.coins < item.price ? ' poor' : ''));
      card.type = 'button';
      var cv = mk('canvas');
      cv.width = 180; cv.height = 106;
      art.preview(cv, shopTab, item);
      card.appendChild(cv);
      card.appendChild(mk('div', 'in', item.name));

      var pr = mk('div', eqd ? 'pr eqd' : (owned ? 'pr own' : 'pr'), eqd ? 'مجهّز ✓' : (owned ? 'اختيار' : null));
      if (!eqd && !owned) pr.innerHTML = '<span class="coin"></span><span>' + item.price + '</span>';
      card.appendChild(pr);

      card.addEventListener('click', function () {
        if (owned) {
          S.click();
          applyShopEquip(item);
          persist();
          renderShop();
          return;
        }
        if (save.coins < item.price) {
          S.nope();
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
          return;
        }
        S.buy();
        save.coins -= item.price;
        save.owned[shopTab].push(item.id);
        applyShopEquip(item);
        if (unlockedGearCount() >= 3) earn('shopper', true);
        else persist();
        renderShop();
      });
      grid.appendChild(card);
    });
  }

  function renderAwards() {
    syncAwardsCount();
    var grid = $('awGrid');
    grid.innerHTML = '';
    AH.AWARDS.forEach(function (aw) {
      var row = mk('div', 'aw' + (save.awards[aw.id] ? ' got' : ''));
      row.innerHTML =
        '<div class="ic" style="font-size:32px;display:flex;align-items:center;justify-content:center">🏆</div>' +
        '<div><div class="t">' + aw.name + '</div><div class="d">' + aw.desc + '</div></div>' +
        '<div class="rw"><span>+' + AH.AWARD_COINS + '</span><span class="coin" style="width:18px;height:18px"></span></div>';
      grid.appendChild(row);
    });
  }

  function showOver() {
    if (!st.committed) commitMatch();
    flushAwards();
    setScene('over');
    var p1Won = st.score[0] > st.score[1];
    if (p1Won || st.mode === 2) S.win(); else S.lose();

    var titleEl = $('ovTitle'), subEl = $('ovSub');
    titleEl.className = (!p1Won && st.mode === 1) ? 'lose' : '';
    if (st.mode === 2) {
      titleEl.textContent = p1Won ? 'فاز اللاعب 1!' : 'فاز اللاعب 2!';
      subEl.textContent = 'مباراة حماسية في ' + st.table.name;
    } else if (p1Won) {
      titleEl.textContent = 'انتصار ساحق!';
      subEl.textContent = 'هزمت ' + st.bot.name + ' في ' + st.table.name + '!';
    } else {
      titleEl.textContent = 'جولة قوية!';
      subEl.textContent = 'تغلّب عليك ' + st.bot.name + ' — جرّب ضربة التيربو مجدداً!';
    }

    $('ovScore').innerHTML = '<span style="color:#5ef2ff">' + st.score[0] + '</span><span class="dash">:</span><span style="color:#ff6b8a">' + st.score[1] + '</span>';
    var n1 = st.mode === 2 ? 'اللاعب 1' : 'أنت', n2 = st.mode === 2 ? 'اللاعب 2' : st.bot.name;
    $('ovStats').innerHTML =
      '<tr><th>' + n1 + '</th><th>الإحصائيات</th><th>' + n2 + '</th></tr>' +
      '<tr><td class="v">' + st.shots[0] + '</td><td class="n">التسديدات</td><td class="v">' + st.shots[1] + '</td></tr>' +
      '<tr><td class="v">' + st.saves[0] + '</td><td class="n">التصديات الحاسمة</td><td class="v">' + st.saves[1] + '</td></tr>' +
      '<tr><td class="v">' + st.topKmh[0] + ' كم/س</td><td class="n">أقصى سرعة</td><td class="v">' + st.topKmh[1] + ' كم/س</td></tr>';
    $('ovEarn').innerHTML = '<span class="coin"></span><span>+' + st.matchCoins + '</span>';

    var badgesEl = $('ovBadges');
    badgesEl.innerHTML = '';
    badgesEl.className = 'badges' + (st.matchAwards.length > 3 ? ' many' : '');
    st.matchAwards.forEach(function (aw) { badgesEl.appendChild(mk('span', 'badge gold', '🏆 ' + aw.name)); });
    openScreen('over');
  }

  /* --------------------------------------------------- DOM & key hooks */
  function pickMode(m) { S.click(); save.mode = st.mode = m; persist(); syncTitleControls(); }
  on('tab1', function () { pickMode(1); });
  on('tab2', function () { pickMode(2); });
  var goalSegs = document.querySelectorAll('.seg.g');
  for (var gi = 0; gi < goalSegs.length; gi++) {
    goalSegs[gi].addEventListener('click', function () {
      S.click();
      save.goals = st.goalsToWin = Number(this.getAttribute('data-g')) || 7;
      persist();
      syncTitleControls();
    });
  }
  on('chaosBtn', function () { S.click(); save.chaos = st.chaos = !save.chaos; persist(); syncTitleControls(); });
  on('btnPlay', startMatch);
  on('btnShop', function () { S.click(); openScreen('shop'); });
  on('btnAwards', function () { S.click(); openScreen('awards'); });
  on('shopBack', function () { S.click(); openScreen('title'); });
  on('awBack', function () { S.click(); openScreen('title'); });

  var shopTabs = document.querySelectorAll('#scr-shop .tab');
  for (var si = 0; si < shopTabs.length; si++) {
    shopTabs[si].addEventListener('click', function () {
      S.click();
      shopTab = this.getAttribute('data-k') || 'mallet';
      renderShop();
    });
  }

  pauseBtn.addEventListener('click', function () { if (st.paused) resumeGame(); else pauseGame(true); });
  on('btnResume', resumeGame);
  on('btnRestart', startMatch);
  on('btnMenu1', goMenu);
  on('btnAgain', startMatch);
  on('btnMenu2', goMenu);

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    var code = e.code;
    if (uiScreen === 'title') {
      if (code === 'Enter' || code === 'NumpadEnter') { e.preventDefault(); startMatch(); }
      return;
    }
    if (uiScreen === 'shop' || uiScreen === 'awards') {
      if (code === 'Escape') { e.preventDefault(); S.click(); openScreen('title'); }
      return;
    }
    if (uiScreen === 'over') {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'KeyR') { e.preventDefault(); startMatch(); }
      else if (code === 'Escape') { e.preventDefault(); goMenu(); }
      return;
    }
    if (!st.demo) {
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        if (st.paused) resumeGame(); else pauseGame(true);
      } else if (code === 'KeyR') {
        e.preventDefault();
        startMatch();
      }
    }
  });

  Kit.lifecycle({
    pause: function () {
      if (!st.demo && st.scene !== 'over' && !st.paused) pauseGame(false);
    }
  });

  /* ------------------------------------------------ test & debug hooks */
  window.__game = {
    st: st,
    save: save,
    state: function () {
      return {
        demo: st.demo,
        paused: st.paused,
        scene: st.scene,
        score: [st.score[0], st.score[1]],
        pucks: st.pucks.map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy) }; }),
        mallets: st.mallets.map(function (m) { return { x: Math.round(m.x), y: Math.round(m.y) }; })
      };
    },
    shot: function (vx, vy, x, y) {
      var p = st.pucks[0];
      if (!p || !p.alive || p.scored) { p = makePuck(G.CX, G.CY, 0, 0); st.pucks = [p]; }
      p.vx = vx || 0; p.vy = vy || 0;
      if (x != null) p.x = x;
      if (y != null) p.y = y;
      p.alive = true; p.scored = false; p.fire = 0; p.stuck = 0;
      frameDirty = true;
      return p;
    },
    goal: function (side) {
      var s = side < 0 ? -1 : 1;
      var p = st.pucks[0];
      if (!p || !p.alive || p.scored) { p = makePuck(G.CX, G.CY, 0, 0); st.pucks = [p]; }
      p.x = s < 0 ? G.R - 30 : G.L + 30;
      p.y = G.CY;
      p.vx = s < 0 ? 1100 : -1100;
      p.vy = 0;
      p.lastHit = s;
      p.alive = true;
      p.scored = false;
      frameDirty = true;
    },
    setScore: function (a, b) {
      st.score[0] = a | 0;
      st.score[1] = b | 0;
      frameDirty = true;
    },
    power: function (id, side) {
      var pw = spawnPower(id || 'fire');
      if (pw) {
        st.powers.pop();
        applyPower(pw, side || -1, st.pucks[0]);
      }
    },
    sim: function (sec) {
      var n = Math.max(1, Math.round((sec || 0) * 60));
      for (var i = 0; i < n; i++) update(1 / 60);
    },
    spawnPower: spawnPower
  };

  /* -------------------------------------------------------------- boot */
  startDemo();
  openScreen('title');
  Kit.loop(update, render);
  Kit.ready();
})();

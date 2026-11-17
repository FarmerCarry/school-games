/* Hoop Heads: Turbo Super-Dunk Brawl — UI controller, Kit.art + Kit.juice glue, cups, shop & telemetry. */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('game');
  var ui = $('ui');
  var dirty = true;

  // MANDATORY ORDER: Kit.art.init BEFORE Kit.fit!
  Kit.art.init({ canvas: canvas, mode: '2d', theme: 'day' });
  function placeUI(v) {
    ui.style.transform = 'translate(' + canvas.style.left + ',' + canvas.style.top + ') scale(' + v.scale + ')';
    dirty = true;
  }
  var view = Kit.fit(canvas, 1280, 720, { onResize: placeUI });
  placeUI(view);
  HH.initArt();
  Kit.muteButton();

  var dda = Kit.dda('hoop-heads', { id: 'main', target: 0.7, tiers: 5 });

  var state = 'title';
  var match = null;
  var demo = HH.newMatch({ mode: 'demo', p1: 'robo', p2: 'titan', court: HH.save.court });
  var selMode = 'cpu';
  var selIdx = [0, 1];
  var shopTab = 'balls';
  var resultLockT = 0;
  var confirmAct = null;
  var returnState = 'pause';
  var tourState = null;

  /* --------------------------------------------------- Procedural SFX (Zero BGM!) */
  function canPlayMatchSfx() {
    return state === 'play' && match && match.mode !== 'demo';
  }
  function tone(freq, dur, type, vol, slide) {
    if (!Kit.audio || Kit.audio.muted) return;
    var ac = Kit.audio.unlock();
    if (!ac || !Kit.audio.master) return;
    try {
      var t = ac.currentTime;
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(vol || 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(Kit.audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    } catch (e) { /* ignore */ }
  }

  HH.sfx = {
    click: function () { if (Kit.juice) Kit.juice.tap(); },
    move: function () { if (Kit.juice) Kit.juice.select(); },
    jump: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.whoosh(0.55); },
    land: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.pop(0.32); },
    bounce: function () { if (canPlayMatchSfx()) tone(165, 0.07, 'sine', 0.14, 88); },
    shoot: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.whoosh(0.8); },
    swish: function () {
      if (!canPlayMatchSfx()) return;
      if (Kit.juice) { Kit.juice.chime(1.1); Kit.juice.pop(0.7); }
    },
    dunk: function () {
      if (!canPlayMatchSfx()) return;
      tone(140, 0.22, 'sawtooth', 0.22, 48);
      if (Kit.juice) Kit.juice.star(2);
    },
    superDunk: function () {
      if (!canPlayMatchSfx()) return;
      tone(220, 0.34, 'sawtooth', 0.26, 52);
      if (Kit.juice) { Kit.juice.streak(3); Kit.juice.star(3); }
    },
    clank: function () { if (canPlayMatchSfx()) tone(420, 0.08, 'square', 0.11, 210); },
    board: function () { if (canPlayMatchSfx()) tone(240, 0.06, 'triangle', 0.12, 130); },
    steal: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.chime(0.85); },
    block: function () {
      if (!canPlayMatchSfx()) return;
      tone(310, 0.14, 'square', 0.18, 110);
      if (Kit.juice) Kit.juice.pop(0.95);
    },
    dash: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.whoosh(0.65); },
    power: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.coin(); },
    ice: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.chime(1.3); },
    fire: function () { if (canPlayMatchSfx() && Kit.juice) Kit.juice.streak(2); },
    whistle: function () { if (canPlayMatchSfx()) tone(1480, 0.16, 'sine', 0.12, 1320); },
    buzzer: function () { if (canPlayMatchSfx()) tone(180, 0.35, 'sawtooth', 0.18, 115); },
    tick: function () { if (canPlayMatchSfx()) tone(780, 0.05, 'sine', 0.09, 760); },
    win: function () { if (Kit.juice) Kit.juice.levelUp(); },
    lose: function () { if (Kit.juice) Kit.juice.fail(); },
    buy: function () { if (Kit.juice) Kit.juice.coin(); },
    error: function () { if (Kit.juice) Kit.juice.miss(); }
  };

  /* --------------------------------------------------- Screen Management */
  var SCREENS = {
    title: 'scrTitle',
    select: 'scrSelect',
    cups: 'scrCups',
    ladder: 'scrLadder',
    shop: 'scrShop',
    pause: 'scrPause',
    confirm: 'scrConfirm',
    result: 'scrResult',
    trophy: 'scrTrophy'
  };

  function isTouchDevice() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function setScreen(next) {
    state = next;
    dirty = true;
    for (var k in SCREENS) {
      var el = $(SCREENS[k]);
      if (el) el.hidden = (k !== next);
    }
    $('pauseBtn').hidden = (next !== 'play');
    $('touchPad').hidden = !(next === 'play' && match && match.mode !== 'duo' && isTouchDevice());
    if (next === 'title') refreshTitle();
    if (next === 'play') canvas.focus();
  }

  function syncTheme(courtId) {
    var ct = HH.findById(HH.COURTS, courtId || HH.save.court);
    if (Kit.art) Kit.art.theme = ct.theme || 'day';
  }

  function refreshTitle() {
    var s = HH.save;
    $('coinBadge').textContent = String(s.coins);
    $('streakBadge').textContent = String(s.streak);
    var cupCount = (s.cups.b ? 1 : 0) + (s.cups.s ? 1 : 0) + (s.cups.g ? 1 : 0);
    $('cupBadges').textContent = '🏆 الكؤوس: ' + cupCount + '/3';
    var ch = HH.charById(s.p1);
    var ct = HH.findById(HH.COURTS, s.court);
    $('quickSub').textContent = ch.name + ' • ' + ct.name + ' • ' + HH.DIFF_NAMES[s.diff];
    var bl = HH.findById(HH.BALLS, s.ball);
    $('shopSub').textContent = bl.name + ' • 🪙 ' + s.coins;
    if (demo) demo.court = s.court;
  }

  /* --------------------------------------------------- Fighter & Arena Select */
  function charIndex(id) {
    for (var i = 0; i < HH.CHARS.length; i++) if (HH.CHARS[i].id === id) return i;
    return 0;
  }

  function openSelect(mode) {
    selMode = mode;
    selIdx[0] = charIndex(HH.save.p1);
    selIdx[1] = charIndex(HH.save.p2);
    if (selIdx[1] === selIdx[0]) selIdx[1] = (selIdx[0] + 1) % HH.CHARS.length;

    $('selTitle').textContent = mode === 'duo' ? 'طور اللاعبين — اختارا البطل والملعب'
      : mode === 'tour' ? 'اختر بطلك للبطولة 🏆'
      : 'مباراة فردية — اختر البطل والملعب';
    $('diffRow').hidden = (mode !== 'cpu');
    $('duoHint').hidden = (mode !== 'duo');
    renderSelectUI();
    setScreen('select');
  }

  function renderSelectUI() {
    var diffBtns = $('diffRow').querySelectorAll('[data-diff]');
    for (var d = 0; d < diffBtns.length; d++) {
      diffBtns[d].classList.toggle('on', +diffBtns[d].dataset.diff === HH.save.diff);
    }

    var grid = $('charGrid');
    grid.innerHTML = '';
    HH.CHARS.forEach(function (ch, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var isP1 = selIdx[0] === idx;
      var isP2 = selMode === 'duo' && selIdx[1] === idx;
      btn.className = 'cc' + (isP1 ? ' p1' : '') + (isP2 ? ' p2' : '');
      var tag = isP1 && isP2 ? '<span class="cc-tag">لاعب 1 و 2</span>'
        : isP1 ? '<span class="cc-tag">اللاعب 1</span>'
        : isP2 ? '<span class="cc-tag t2">اللاعب 2</span>' : '';
      btn.innerHTML = tag +
        '<div class="cc-ava" style="background:' + ch.skin + ';border-color:#1b1640">' + ch.num + '</div>' +
        '<div class="cc-name">' + ch.name + '</div>' +
        '<div class="cc-desc">' + ch.desc + '</div>' +
        '<div class="cc-bars">⚡' + ch.spd + ' • 🦘' + ch.jmp + ' • 🎯' + ch.sht + '</div>';
      btn.addEventListener('click', function (e) {
        HH.sfx.move();
        if (selMode === 'duo' && e.shiftKey) selIdx[1] = idx;
        else selIdx[0] = idx;
        HH.save.p1 = HH.CHARS[selIdx[0]].id;
        HH.persist();
        renderSelectUI();
      });
      grid.appendChild(btn);
    });

    var crow = $('courtRow');
    crow.innerHTML = '';
    HH.COURTS.forEach(function (ct) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'court-btn' + (HH.save.court === ct.id ? ' on' : '');
      b.textContent = ct.name;
      b.addEventListener('click', function () {
        HH.sfx.move();
        HH.save.court = ct.id;
        syncTheme(ct.id);
        HH.persist();
        renderSelectUI();
      });
      crow.appendChild(b);
    });
  }

  /* --------------------------------------------------- Tournament Cups & Ladder */
  function buildOpponents(cup, heroId) {
    var pool = HH.CHARS.map(function (c) { return c.id; }).filter(function (id) { return id !== heroId && id !== cup.boss; });
    var out = [];
    for (var i = 0; i < 4; i++) out.push(pool[i % pool.length] || 'shark');
    out.push(cup.boss);
    return out;
  }

  function openCups() {
    var row = $('cupRow');
    row.innerHTML = '';
    HH.CUPS.forEach(function (cp, idx) {
      var won = !!HH.save.cups[cp.id];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'cupc';
      card.innerHTML =
        '<div class="cup-ico" style="filter:drop-shadow(0 4px 0 #1b1640)">🏆</div>' +
        '<div class="cup-name" style="color:' + cp.color + '">' + cp.name + '</div>' +
        '<div class="cup-rew">الجائزة الكبرى: 🪙 +' + cp.reward + '</div>' +
        (won ? '<div class="cup-won">✓ فزت بهذه الكأس!</div>' : '<div class="cup-rew" style="color:#7dd3fc;margin-top:6px">5 جولات حماسية</div>');
      card.addEventListener('click', function () {
        HH.sfx.click();
        setupTour(idx, 0, HH.save.p1);
      });
      row.appendChild(card);
    });
    setScreen('cups');
  }

  function setupTour(cupIdx, roundIdx, p1Id, fixedOpp) {
    var cIdx = Math.max(0, Math.min(HH.CUPS.length - 1, cupIdx | 0));
    var rIdx = Math.max(0, Math.min(4, roundIdx | 0));
    var hero = p1Id ? HH.charById(p1Id).id : HH.save.p1;
    var cup = HH.CUPS[cIdx];
    var opps = buildOpponents(cup, hero);
    if (fixedOpp) opps[rIdx] = HH.charById(fixedOpp).id;
    tourState = {
      cup: cIdx,
      round: rIdx,
      p1: hero,
      opps: opps
    };
    renderLadder();
    setScreen('ladder');
  }

  function renderLadder() {
    if (!tourState) return;
    var cup = HH.CUPS[tourState.cup];
    $('ladTitle').textContent = cup.name + ' 🏆';
    $('ladSub').textContent = 'المباراة ' + (tourState.round + 1) + ' من 5 • جائزة الكأس 🪙 +' + cup.reward;
    var list = $('ladder');
    list.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var opp = HH.charById(tourState.opps[i]);
      var div = document.createElement('div');
      div.className = 'lslot' + (i < tourState.round ? ' done' : (i === tourState.round ? ' cur' : ''));
      var badge = i < tourState.round ? '✓ فوز' : (i === 4 ? '👑 الزعيم النهائي' : 'الجولة ' + (i + 1));
      div.innerHTML = '<span>' + (i + 1) + '. ' + opp.name + '</span><span>' + badge + '</span>';
      list.appendChild(div);
    }
  }

  function startTourRound() {
    if (!tourState) return;
    var cup = HH.CUPS[tourState.cup];
    var r = tourState.round;
    startMatch({
      mode: 'tour',
      p1: tourState.p1,
      p2: tourState.opps[r],
      lv: cup.lv[r],
      court: cup.court
    });
  }

  /* --------------------------------------------------- Locker Shop */
  function openShop() {
    renderShop();
    setScreen('shop');
  }

  function renderShop() {
    var s = HH.save;
    $('shopCoins').textContent = String(s.coins);
    var tabBtns = $('shopTabs').querySelectorAll('[data-tab]');
    for (var t = 0; t < tabBtns.length; t++) {
      tabBtns[t].classList.toggle('on', tabBtns[t].dataset.tab === shopTab);
    }

    var list = shopTab === 'balls' ? HH.BALLS : HH.TRAILS;
    var owned = shopTab === 'balls' ? s.ownBalls : s.ownTrails;
    var eqId = shopTab === 'balls' ? s.ball : s.trail;

    var grid = $('shopGrid');
    grid.innerHTML = '';
    list.forEach(function (item) {
      var has = owned.indexOf(item.id) >= 0;
      var eq = eqId === item.id;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sh-item' + (eq ? ' eq' : '');
      var bg = shopTab === 'balls'
        ? 'radial-gradient(circle at 35% 35%,' + item.c1 + ',' + item.c2 + ')'
        : 'linear-gradient(135deg,' + item.colors[0] + ',' + item.colors[1] + ')';
      var lbl = eq ? '✓ مجهّز حالياً' : has ? 'اضغط للتجهيز' : '🪙 ' + item.price;
      btn.innerHTML =
        '<div class="sh-swatch" style="background:' + bg + '"></div>' +
        '<div class="sh-name">' + item.name + '</div>' +
        '<div class="sh-price">' + lbl + '</div>';
      btn.addEventListener('click', function () {
        if (has) {
          if (shopTab === 'balls') s.ball = item.id;
          else s.trail = item.id;
          HH.sfx.move();
          HH.persist();
          renderShop();
        } else if (s.coins >= item.price) {
          s.coins -= item.price;
          owned.push(item.id);
          if (shopTab === 'balls') s.ball = item.id;
          else s.trail = item.id;
          HH.sfx.buy();
          HH.persist();
          renderShop();
        } else {
          HH.sfx.error();
        }
      });
      grid.appendChild(btn);
    });
  }

  /* --------------------------------------------------- Match Start, Rewards & End */
  function matchHUDInfo(m) {
    if (!m) return { mode: '', tags: ['', ''] };
    if (m.mode === 'tour' && tourState) {
      var cp = HH.CUPS[tourState.cup];
      return {
        mode: cp.name + ' • المباراة ' + (tourState.round + 1) + ' من 5',
        tags: ['أنت', 'الخصم ' + (tourState.round + 1) + ' من 5']
      };
    }
    if (m.mode === 'duo') return { mode: 'لاعبان وجهاً لوجه • أول من يصل 15', tags: ['اللاعب 1', 'اللاعب 2'] };
    return { mode: 'ضد الحاسوب (' + HH.DIFF_NAMES[m.diff || 0] + ') • أول من يصل 15', tags: ['أنت', 'الحاسوب'] };
  }

  function startMatch(opts) {
    opts = opts || {};
    var s = HH.save;
    var mode = opts.mode || 'cpu';
    var diff = opts.diff !== undefined ? opts.diff : s.diff;
    var lv = opts.lv;
    if (lv === undefined) {
      var baseLv = diff === 0 ? 0.28 : diff === 1 ? 1.05 : 1.85;
      lv = Math.max(0, baseLv + dda.value(-0.22, 0.32));
    } else {
      // Touch dda.tier so telemetry captures current adaptive tier
      void dda.tier;
    }

    var p1 = opts.p1 || s.p1;
    var p2 = opts.p2;
    if (!p2) {
      if (mode === 'duo') {
        p2 = s.p2 !== p1 ? s.p2 : HH.CHARS[(charIndex(p1) + 1) % HH.CHARS.length].id;
      } else {
        var pool = HH.CHARS.filter(function (c) { return c.id !== p1; });
        p2 = pool[Math.floor(Math.random() * pool.length)].id;
      }
    }
    var court = opts.court || s.court;
    syncTheme(court);
    HH.resetBg();

    match = HH.newMatch({
      mode: mode,
      p1: p1,
      p2: p2,
      lv: lv,
      diff: diff,
      court: court,
      ball: s.ball,
      trail: s.trail,
      len: opts.len || s.len || 60,
      target: opts.target || 15
    });
    match.settled = false;

    var roundKey = mode === 'tour' && tourState
      ? 'tour-' + HH.CUPS[tourState.cup].id + '-' + (tourState.round + 1)
      : mode === 'duo' ? 'duo' : 'cpu-' + diff;
    Kit.stats.round(roundKey);

    setScreen('play');
    return match;
  }

  function recordOutcome(m) {
    if (!m || m.settled) return null;
    m.settled = true;
    var s = HH.save;
    var p0 = m.players[0], p1 = m.players[1];
    var won = m.winner === 0;

    s.stats.games = (s.stats.games || 0) + 1;
    if (won) s.stats.wins = (s.stats.wins || 0) + 1;
    s.stats.points = (s.stats.points || 0) + p0.score;
    s.stats.dunks = (s.stats.dunks || 0) + p0.st.dunks;
    s.stats.threes = (s.stats.threes || 0) + p0.st.threes;
    s.stats.blocks = (s.stats.blocks || 0) + p0.st.blocks;
    s.stats.steals = (s.stats.steals || 0) + p0.st.steals;

    // Exact reward contract verified by regressions-hoop.mjs (testHoopRewards):
    var earned = p0.score + (won ? 15 : 5);
    s.coins = (s.coins || 0) + earned;

    if (m.mode === 'cpu') {
      s.streak = won ? (s.streak || 0) + 1 : 0;
      if (s.streak > (s.bestStreak || 0)) s.bestStreak = s.streak;
      dda.result(won);
    }

    var wonCup = null;
    if (m.mode === 'tour' && tourState && won) {
      if (tourState.round >= 4) {
        wonCup = HH.CUPS[tourState.cup];
        s.cups[wonCup.id] = true;
        s.coins += wonCup.reward;
      } else {
        tourState.round += 1;
      }
    }

    Kit.stats.end(m.mode === 'duo' ? 'end' : (won ? 'win' : 'lose'), p0.score);
    HH.persist();

    return { won: won, earned: earned, wonCup: wonCup, s0: p0.score, s1: p1.score };
  }

  function showMatchEndScreen(m) {
    var res = m.outcome || recordOutcome(m);
    m.outcome = res;
    resultLockT = 0.45;

    if (res.wonCup) {
      HH.sfx.win();
      $('trText').textContent = 'فزت بـ' + res.wonCup.name + '! 🪙 +' + (res.earned + res.wonCup.reward);
      setScreen('trophy');
      return;
    }

    var banner = $('resBanner');
    banner.classList.remove('win', 'lose');
    if (m.mode === 'duo') {
      banner.classList.add('win');
      banner.textContent = m.winner === 0 ? 'فاز اللاعب 1! 🎉' : 'فاز اللاعب 2! 🎉';
      HH.sfx.win();
    } else if (res.won) {
      banner.classList.add('win');
      banner.textContent = 'انتصار ساحق! 🎉';
      HH.sfx.win();
    } else {
      banner.classList.add('lose');
      banner.textContent = 'حاول مجدداً! 💪';
      HH.sfx.lose();
    }

    $('resScore').textContent = res.s0 + ' - ' + res.s1;
    var p0 = m.players[0];
    $('resSummary').textContent = 'دانك: ' + p0.st.dunks + ' • ثلاثيات: ' + p0.st.threes + ' • خطف وتصدٍّ: ' + (p0.st.steals + p0.st.blocks);
    $('resCoins').textContent = '🪙 +' + res.earned + ' عملة';

    if (m.mode === 'tour' && tourState) {
      $('rAgain').textContent = res.won ? 'المباراة التالية ▶' : 'إعادة المحاولة 🔥';
    } else {
      $('rAgain').textContent = 'العب مجدداً! 🔥';
    }
    setScreen('result');
  }

  /* --------------------------------------------------- Pause & Lifecycle */
  function pauseGame() {
    if (state !== 'play' || !match) return;
    setScreen('pause');
  }

  function resumeGame() {
    if (state !== 'pause' || !match) return;
    setScreen('play');
  }

  function restartMatch() {
    if (!match) return;
    if (match.ended && !match.settled) {
      match.outcome = recordOutcome(match);
      if (match.mode === 'tour') {
        showMatchEndScreen(match);
        return;
      }
    } else if (!match.ended) {
      Kit.stats.end('quit', match.players[0].score);
    }

    if (match.mode === 'tour' && tourState) {
      startTourRound();
    } else {
      startMatch({
        mode: match.mode,
        p1: match.players[0].ch.id,
        p2: match.players[1].ch.id,
        lv: match.lv,
        diff: match.diff,
        court: match.court
      });
    }
  }

  function leaveToMenu() {
    if (match) {
      if (match.ended && !match.settled) recordOutcome(match);
      else if (!match.settled) Kit.stats.end('quit', match.players[0].score);
    }
    match = null;
    tourState = null;
    syncTheme(HH.save.court);
    setScreen('title');
  }

  Kit.lifecycle({
    pause: function () {
      if (state === 'play') pauseGame();
    }
  });

  canvas.addEventListener('contextrestored', function () {
    view.resize();
    HH.resetBg();
    dirty = true;
  });

  if (Kit.motion && typeof Kit.motion.onChange === 'function') {
    Kit.motion.onChange(function () { dirty = true; });
  }

  /* --------------------------------------------------- Input Wiring (Guarded!) */
  window.addEventListener('keydown', function (e) {
    // CRITICAL: Guard ALL custom keydown handlers so native focused buttons (e.g. [data-act="shop"] + Space) work cleanly!
    if (!Kit.isGameKeyEvent(e)) return;

    var c = e.code;
    if (state === 'play' && match) {
      if (c === 'Escape' || c === 'KeyP') {
        e.preventDefault();
        pauseGame();
        return;
      }
      if (c === 'KeyR') {
        e.preventDefault();
        restartMatch();
        return;
      }
      HH.latchKey(match, c, true);
      return;
    }

    if (state === 'pause') {
      if (c === 'Escape' || c === 'KeyP') {
        e.preventDefault();
        resumeGame();
      } else if (c === 'KeyR') {
        e.preventDefault();
        restartMatch();
      }
      return;
    }

    if (state === 'result' && resultLockT <= 0) {
      if (c === 'Enter') {
        e.preventDefault();
        $('rAgain').click();
      } else if (c === 'Escape') {
        e.preventDefault();
        $('rMenu').click();
      }
      return;
    }

    if (state === 'select' && selMode === 'duo') {
      if (c === 'KeyA') { selIdx[0] = (selIdx[0] + HH.CHARS.length - 1) % HH.CHARS.length; renderSelectUI(); }
      else if (c === 'KeyD') { selIdx[0] = (selIdx[0] + 1) % HH.CHARS.length; renderSelectUI(); }
      else if (c === 'ArrowLeft') { selIdx[1] = (selIdx[1] + HH.CHARS.length - 1) % HH.CHARS.length; renderSelectUI(); }
      else if (c === 'ArrowRight') { selIdx[1] = (selIdx[1] + 1) % HH.CHARS.length; renderSelectUI(); }
    }
  });

  window.addEventListener('keyup', function (e) {
    if (state === 'play' && match) {
      HH.latchKey(match, e.code, false);
    }
  });

  // Canvas pointer click/tap shoots, dunks, steals or blocks!
  canvas.addEventListener('pointerdown', function (e) {
    if (state !== 'play' || !match || match.mode === 'duo') return;
    if (e.button === 2) return;
    var pt = view.toLogical(e.clientX, e.clientY);
    // Tap upper court to jump + action, or regular click to shoot / dunk / steal!
    if (pt.y < 360 && match.players[0].onGround) {
      match.players[0].latch.j = true;
    }
    match.players[0].latch.sDown = true;
  });
  window.addEventListener('pointerup', function () {
    if (state === 'play' && match && match.mode !== 'duo') {
      match.players[0].latch.sUp = true;
    }
  });

  // Touch buttons for mobile/tablet Chromebooks
  var touchBtns = $('touchPad').querySelectorAll('[data-tkey]');
  for (var tb = 0; tb < touchBtns.length; tb++) {
    (function (btn) {
      var act = btn.dataset.tkey;
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (!match) return;
        var p0 = match.players[0];
        if (act === 'left') p0.inp.l = true;
        else if (act === 'right') p0.inp.r = true;
        else if (act === 'jump') p0.latch.j = true;
        else if (act === 'shoot') { p0.latch.sDown = true; p0.inp.s = true; }
      });
      var upFn = function () {
        if (!match) return;
        var p0 = match.players[0];
        if (act === 'left') p0.inp.l = false;
        else if (act === 'right') p0.inp.r = false;
        else if (act === 'shoot') { p0.latch.sUp = true; p0.inp.s = false; }
      };
      btn.addEventListener('pointerup', upFn);
      btn.addEventListener('pointercancel', upFn);
    })(touchBtns[tb]);
  }

  /* --------------------------------------------------- UI Button Bindings */
  $('quickPlay').addEventListener('click', function () {
    HH.sfx.click();
    startMatch({ mode: 'cpu' });
  });

  $('mainMenu').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    HH.sfx.click();
    var act = btn.dataset.act;
    if (act === 'cpu') openSelect('cpu');
    else if (act === 'duo') openSelect('duo');
    else if (act === 'tour') openCups();
    else if (act === 'shop') openShop();
  });

  $('diffRow').addEventListener('click', function (e) {
    var b = e.target.closest('[data-diff]');
    if (!b) return;
    HH.sfx.move();
    HH.save.diff = +b.dataset.diff || 0;
    HH.persist();
    renderSelectUI();
  });

  $('selBack').addEventListener('click', function () {
    HH.sfx.click();
    setScreen('title');
  });

  $('selGo').addEventListener('click', function () {
    HH.sfx.click();
    HH.save.p1 = HH.CHARS[selIdx[0]].id;
    if (selMode === 'duo') HH.save.p2 = HH.CHARS[selIdx[1]].id;
    HH.persist();
    if (selMode === 'tour') {
      openCups();
    } else {
      startMatch({
        mode: selMode,
        p1: HH.CHARS[selIdx[0]].id,
        p2: selMode === 'duo' ? HH.CHARS[selIdx[1]].id : undefined,
        diff: HH.save.diff,
        court: HH.save.court
      });
    }
  });

  $('cupsBack').addEventListener('click', function () {
    HH.sfx.click();
    setScreen('title');
  });

  $('ladGo').addEventListener('click', function () {
    HH.sfx.click();
    startTourRound();
  });

  $('ladBack').addEventListener('click', function () {
    HH.sfx.click();
    returnState = 'ladder';
    confirmAct = function () {
      tourState = null;
      match = null;
      openCups();
    };
    $('cfTitle').textContent = 'الانسحاب من الكأس؟';
    $('cfSub').textContent = 'سيتم إلغاء تقدمك في هذه البطولة.';
    setScreen('confirm');
  });

  $('shopTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    HH.sfx.move();
    shopTab = b.dataset.tab;
    renderShop();
  });

  $('shopBack').addEventListener('click', function () {
    HH.sfx.click();
    setScreen('title');
  });

  $('pauseBtn').addEventListener('click', function () {
    HH.sfx.click();
    pauseGame();
  });

  $('pResume').addEventListener('click', function () {
    HH.sfx.click();
    resumeGame();
  });

  $('pRestart').addEventListener('click', function () {
    HH.sfx.click();
    restartMatch();
  });

  $('pMenu').addEventListener('click', function () {
    HH.sfx.click();
    returnState = 'pause';
    confirmAct = leaveToMenu;
    $('cfTitle').textContent = 'مغادرة المباراة؟';
    $('cfSub').textContent = 'هل تريد إنهاء المباراة والعودة للقائمة؟';
    setScreen('confirm');
  });

  $('cfNo').addEventListener('click', function () {
    HH.sfx.click();
    setScreen(returnState);
  });

  $('cfYes').addEventListener('click', function () {
    HH.sfx.click();
    var fn = confirmAct;
    confirmAct = null;
    if (fn) fn();
  });

  $('rAgain').addEventListener('click', function () {
    HH.sfx.click();
    if (match && match.mode === 'tour' && tourState) {
      if (match.outcome && match.outcome.won) {
        renderLadder();
        setScreen('ladder');
      } else {
        startTourRound();
      }
      return;
    }
    var prev = match;
    startMatch({
      mode: prev ? prev.mode : 'cpu',
      p1: prev ? prev.players[0].ch.id : HH.save.p1,
      p2: prev && prev.mode === 'duo' ? prev.players[1].ch.id : undefined,
      diff: prev ? prev.diff : HH.save.diff,
      court: prev ? prev.court : HH.save.court
    });
  });

  $('rMenu').addEventListener('click', function () {
    HH.sfx.click();
    leaveToMenu();
  });

  $('trDone').addEventListener('click', function () {
    HH.sfx.click();
    leaveToMenu();
  });

  /* --------------------------------------------------- Main Loop */
  function inspectTelemetryEvents(m) {
    if (!m || !m.events) return;
    for (var i = 0; i < m.events.length; i++) {
      var ev = m.events[i];
      if (ev.type === 'score') {
        if (ev.who === 0) Kit.track.hit();
        else Kit.track.miss();
      } else if ((ev.type === 'steal' || ev.type === 'block') && ev.who === 0) {
        Kit.track.hit();
      }
    }
  }

  function update(dt) {
    if (resultLockT > 0) resultLockT = Math.max(0, resultLockT - dt);

    if (state === 'play' && match) {
      if (!match.done) {
        HH.stepMatch(match, dt);
      }
      inspectTelemetryEvents(match);
      HH.consumeVisualEvents(match);
      HH.updateArt(match, dt);
      dirty = true;

      if (match.done && state === 'play') {
        showMatchEndScreen(match);
      }
    } else if (state === 'title' || state === 'select' || state === 'cups' || state === 'shop') {
      HH.stepMatch(demo, dt);
      demo.events.length = 0;
      HH.updateArt(demo, dt);
      dirty = true;
    }
    // Note: during 'pause' / 'confirm' / 'result' / 'trophy' / 'ladder', simulation stays frozen and redraws only when dirty!
    if (Kit.keys && typeof Kit.keys.endFrame === 'function') Kit.keys.endFrame();
  }

  function render() {
    if (!dirty) return;
    dirty = false;
    var activeScene = match || demo;
    var info = match ? matchHUDInfo(match) : { mode: '', tags: ['', ''] };
    HH.render(view.ctx, view, activeScene, info);
  }

  /* --------------------------------------------------- Public __game API */
  window.__game = {
    get state() { return state; },
    get match() { return match; },
    get demo() { return demo; },
    get save() { return HH.save; },
    start: function (opts) { return startMatch(opts); },
    tour: function (cupIdx, roundIdx, oppId) {
      setupTour(cupIdx, roundIdx, HH.save.p1, oppId);
    },
    info: function () {
      var m = match || demo;
      return {
        state: state,
        time: m ? m.time : 0,
        score: m ? [m.players[0].score, m.players[1].score] : [0, 0],
        ball: m ? [m.ball.x, m.ball.y] : [640, 360],
        p: m ? [
          { x: m.players[0].x, y: m.players[0].y },
          { x: m.players[1].x, y: m.players[1].y }
        ] : [{ x: 320, y: 590 }, { x: 960, y: 590 }]
      };
    },
    skipIntro: function () {
      if (match && match.phase === 'intro') {
        match.phase = 'play';
        match.phaseT = 0;
      }
    },
    give: function (who, x) {
      if (!match) return;
      var p = match.players[who | 0];
      if (!p) return;
      if (typeof x === 'number') {
        p.x = x;
        p.vx = 0;
      }
      HH.giveBall(match, p, true);
    },
    endNow: function (winnerIdx) {
      if (!match) return;
      var w = winnerIdx === 1 ? 1 : 0;
      match.players[w].score = Math.max(match.players[w].score, 5);
      match.players[1 - w].score = Math.min(match.players[1 - w].score, match.players[w].score - 1);
      match.ended = true;
      match.winner = w;
      match.phase = 'end';
      match.phaseT = 0.5;
    }
  };

  syncTheme(HH.save.court);
  refreshTitle();
  setScreen('title');
  Kit.loop(update, render);
  Kit.ready();
})();

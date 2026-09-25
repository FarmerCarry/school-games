/*
 * Pool Party — main game (original code).
 * Modes: vs CPU (3 opponents), 2 players hot-seat, Trick Shots (10 puzzles).
 */
(function () {
  'use strict';
  var P = window.PoolPhysics, Rules = window.PoolRules, AI = window.PoolAI, LV = window.PoolLevels, Art = window.PoolArt;
  var W = 1280, H = 720, R = P.R;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = Kit.clamp;

  /* =============================================================== save */
  var store = Kit.store('pool-party');
  function obj(v, d) { return v && typeof v === 'object' && !Array.isArray(v) ? v : d; }
  var save = {
    coins: +store.get('coins', 0) || 0,
    owned: obj(store.get('owned', null), { cues: ['classic'], felts: ['green'] }),
    cue: store.get('cue', 'classic'), felt: store.get('felt', 'green'),
    aim: store.get('aim', 'big') === 'pro' ? 'pro' : 'big',
    wins: obj(store.get('wins', null), { easy: 0, medium: 0, hard: 0 }),
    losses: obj(store.get('losses', null), { easy: 0, medium: 0, hard: 0 }),
    stars: Array.isArray(store.get('stars', null)) ? store.get('stars', []) : [],
    opp: store.get('opp', 'easy'), streak: +store.get('streak', 0) || 0, bestStreak: +store.get('bestStreak', 0) || 0,
    shots: +store.get('shots', 0) || 0, totalPots: +store.get('totalPots', 0) || 0, pvpGames: +store.get('pvpGames', 0) || 0
  };
  if (!Array.isArray(save.owned.cues)) save.owned.cues = ['classic'];
  if (!Array.isArray(save.owned.felts)) save.owned.felts = ['green'];
  function persist() { for (var k in save) store.set(k, save[k]); }
  function starTotal() { var t = 0; for (var i = 0; i < LV.length; i++) t += save.stars[i] || 0; return t; }

  var OPPS = [
    { id: 'easy', name: 'الجرو ريكس', short: 'ريكس', avatar: 'rex', label: 'سهل', color: '#5ff0a0', reward: 40 },
    { id: 'medium', name: 'القطة كوكو', short: 'كوكو', fem: true, avatar: 'coco', label: 'متوسط', color: '#ffc94d', reward: 80 },
    { id: 'hard', name: 'القرش زعنون', short: 'زعنون', avatar: 'finn', label: 'صعب', color: '#ff6b8a', reward: 150 }
  ];
  var LINES = {
    easy: { pot: ['هاو! نجحت!', 'ياي، دخلت!', 'ذيلي يهتز من الفرح!'], youPot: ['واو، ضربة رائعة!', 'أوه، جميلة!', 'مخالبي تصفّق لك!'], youFoul: ['أوه أوه!', 'أوبس!'], miss: ['آه، ضاعت!', 'هاو... حظ سيئ!'], start: ['هيا نلعب! هاو هاو!'] },
    medium: { pot: ['بكل هدوء.', 'سهلة جدًا.', 'مياو، ممتاز!'], youPot: ['ليست سيئة!', 'حسنًا، حسنًا!', 'حركة جميلة.'], youFoul: ['حظ صعب!', 'مياو... أوبس!'], miss: ['همف!', 'قصدت ذلك!'], start: ['ابقَ هادئًا...'] },
    hard: { pot: ['قضمة!', 'سهلة جدًا!', 'هجوم القرش!'], youPot: ['أنت ماهر!', 'واو، ضربة رائعة!'], youFoul: ['دوري الآن!', 'هاها، فرصتي!'], miss: ['بلوب... ضاعت!', 'زعنفتي انزلقت!'], start: ['أهلًا بك في حوضي!'] }
  };
  function say(key) {
    if (!G || G.kind !== 'cpu') return;
    var L = LINES[G.opp.id][key];
    if (!L) return;
    G.say = { text: L[Math.floor(Math.random() * L.length)], t: 0 };
  }
  function winTxt(pl) { return (pl.fem ? 'فازت ' : 'فاز ') + pl.name + '!'; }
  function oppById(id) { for (var i = 0; i < OPPS.length; i++) if (OPPS[i].id === id) return OPPS[i]; return OPPS[0]; }

  /* =============================================================== canvas */
  var canvas = $('game');
  var ui = $('ui');
  var tableLayer = document.createElement('canvas');
  var needTable = true, K = 1;
  var sprites = [];
  for (var sn = 0; sn <= 15; sn++) sprites.push(Art.makeSprite(sn));
  Art.buildNumberTextures('bold Arial, sans-serif');
  var view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    K = v.scale * v.dpr;
    needTable = true;
    if (avatarCache) for (var ak in avatarCache) delete avatarCache[ak];
    for (var i = 0; i < sprites.length; i++) sprites[i].dirty = true;
    ui.style.transform = 'translate(' + canvas.style.left + ',' + canvas.style.top + ') scale(' + v.scale + ')';
  } });
  var ctx = view.ctx;
  // Arabic text must be drawn right-to-left, but pure number text ("3/10", "75%") left-to-right,
  // so every fillText/strokeText on the game canvas picks its direction from the string.
  var AR_RE = /[\u0600-\u06FF]/;
  function autoDir(g) {
    var f = g.fillText, st = g.strokeText;
    g.fillText = function (t, x, y, m) { this.direction = AR_RE.test(t) ? 'rtl' : 'ltr'; return m === undefined ? f.call(this, t, x, y) : f.call(this, t, x, y, m); };
    g.strokeText = function (t, x, y, m) { this.direction = AR_RE.test(t) ? 'rtl' : 'ltr'; return m === undefined ? st.call(this, t, x, y) : st.call(this, t, x, y, m); };
    return g;
  }
  autoDir(ctx);
  // keep "+40" / "3/10" in reading order inside Arabic sentences
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  function shotsLeftTxt(n) { return n === 1 ? 'بقيت ضربة واحدة' : n === 2 ? 'بقيت ضربتان' : n === 0 ? 'لا ضربات' : 'بقيت ' + n + ' ضربات'; }
  var ptr = Kit.pointer(view);
  var muteBtn = Kit.muteButton();
  if (muteBtn && muteBtn.setAttribute) { muteBtn.setAttribute('aria-label', 'الصوت'); muteBtn.title = 'الصوت (M)'; }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 20px Fredoka').then(function () {
      Art.buildNumberTextures(Art.font);
      for (var i = 0; i < sprites.length; i++) sprites[i].dirty = true;
      needTable = true;
    }, function () {});
  }

  /* =============================================================== sound */
  var nbuf = null;
  function actx() { var a = Kit.audio; return (a.ctx && !a.muted) ? a.ctx : null; }
  function quiet() { return !G || G.kind === 'demo'; }
  function tone(f, to, type, dur, vol, delay) {
    if (!actx()) return;
    Kit.audio.tone({ freq: f, to: to, type: type, dur: dur, vol: vol, delay: delay || 0 });
  }
  function noise(dur, vol, freq, q, ftype, delay, to) {
    var c = actx(); if (!c) return;
    if (!nbuf) {
      nbuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      var d = nbuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t0 = c.currentTime + (delay || 0);
    var src = c.createBufferSource(); src.buffer = nbuf;
    var f = c.createBiquadFilter(); f.type = ftype || 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 1;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(Kit.audio.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  var lastClack = 0, lastThud = 0;
  var SFX = {
    clack: function (v) {
      if (quiet()) return;
      var now = performance.now();
      if (now - lastClack < 22) return; lastClack = now;
      var vol = clamp(v / 1400, 0.05, 1);
      tone(2600 + Math.random() * 500, 1700, 'triangle', 0.04, 0.32 * vol);
      tone(5200, 4200, 'sine', 0.02, 0.12 * vol);
      noise(0.03, 0.5 * vol, 3500, 1.2, 'bandpass');
    },
    thud: function (v) {
      if (quiet()) return;
      var now = performance.now();
      if (now - lastThud < 30) return; lastThud = now;
      var vol = clamp(v / 1200, 0.04, 0.8);
      tone(150, 70, 'sine', 0.11, 0.35 * vol);
      noise(0.06, 0.35 * vol, 500, 0.8, 'lowpass');
    },
    pocket: function () {
      if (quiet()) return;
      tone(110, 50, 'sine', 0.25, 0.45);
      noise(0.28, 0.4, 900, 0.7, 'lowpass', 0, 150);
      tone(900, 700, 'triangle', 0.03, 0.12, 0.07);
      tone(760, 600, 'triangle', 0.03, 0.1, 0.13);
      tone(640, 500, 'triangle', 0.03, 0.08, 0.18);
    },
    cue: function (p) {
      if (quiet()) return;
      noise(0.05, 0.25 + 0.5 * p, 1800, 1, 'bandpass');
      tone(520, 260, 'sine', 0.07, 0.25 + 0.2 * p);
      if (p > 0.8) noise(0.12, 0.5, 2500, 0.6, 'highpass');
    },
    tick: function (p) {
      if (quiet()) return; tone(260 + 700 * p, null, 'square', 0.025, 0.05); },
    place: function () {
      if (quiet()) return; tone(420, 900, 'sine', 0.09, 0.25); },
    foul: function () {
      if (quiet()) return; tone(200, 150, 'sawtooth', 0.22, 0.18); tone(150, 100, 'sawtooth', 0.3, 0.18, 0.2); },
    turn: function () {
      if (quiet()) return; tone(660, null, 'sine', 0.1, 0.18); tone(990, null, 'sine', 0.16, 0.18, 0.09); },
    good: function (k) {
      if (quiet()) return;
      var base = 523 * Math.pow(1.122, Math.min(k, 8));
      tone(base, null, 'triangle', 0.1, 0.22); tone(base * 1.26, null, 'triangle', 0.1, 0.22, 0.07); tone(base * 1.5, null, 'triangle', 0.16, 0.22, 0.14);
    },
    coin: function () { tone(988, null, 'square', 0.07, 0.12); tone(1319, null, 'square', 0.14, 0.12, 0.07); },
    cheer: function () {
      noise(1.2, 0.18, 1200, 0.5, 'bandpass', 0, 2400);
      noise(0.9, 0.12, 2400, 0.5, 'bandpass', 0.25, 1400);
      Kit.sfx.win && actx() && Kit.sfx.win();
    },
    lose: function () { actx() && Kit.sfx.lose(); },
    star: function (i) { tone(880 * Math.pow(1.26, i), null, 'triangle', 0.18, 0.28); tone(1760 * Math.pow(1.26, i), null, 'sine', 0.12, 0.1, 0.05); },
    click: function () { tone(660, null, 'square', 0.05, 0.12); },
    whoosh: function () { noise(0.25, 0.2, 2500, 0.8, 'bandpass', 0, 600); },
    buy: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, null, 'square', 0.08, 0.12, i * 0.06); }); },
    nope: function () { tone(220, 180, 'square', 0.12, 0.12); }
  };

  /* =============================================================== FX */
  var fx = Kit.particles();
  var shake = Kit.shake();
  var floats = [], rings = [], confetti = [];
  function float(text, x, y, color, size, dur) {
    floats.push({ text: text, x: x, y: y, color: color || '#fff', size: size || 28, t: 0, dur: dur || 1.1 });
    if (floats.length > 30) floats.shift();
  }
  function ring(x, y, color, r0, r1, dur) {
    rings.push({ x: x, y: y, color: color, r0: r0, r1: r1, t: 0, dur: dur || 0.4 });
    if (rings.length > 40) rings.shift();
  }
  function confettiBurst(n) {
    var cols = ['#ff3b8d', '#ffe45c', '#3ec5ff', '#3ddc84', '#b48cff', '#ff8a00'];
    for (var i = 0; i < n; i++) {
      confetti.push({ x: Math.random() * W, y: -20 - Math.random() * 300, vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 180,
        a: Math.random() * 6, va: (Math.random() - 0.5) * 12, w: 8 + Math.random() * 8, h: 5 + Math.random() * 5, c: cols[i % cols.length], t: 0 });
    }
    if (confetti.length > 400) confetti.splice(0, confetti.length - 400);
  }

  /* =============================================================== game state */
  var G = null;              // current session
  var screen = 'title';      // title | levels | shop | game | pause | over | done
  var ptrArmed = true;       // needs a pointer release before the table accepts a press
  var lastPX = 0, lastPY = 0;
  var time = 0;

  function speedFromPower(p) { return 60 + (P.MAX_SPEED - 60) * Math.pow(clamp(p, 0, 1), 1.5); }
  function powerFromSpeed(s) { return Math.pow(clamp((s - 60) / (P.MAX_SPEED - 60), 0, 1), 1 / 1.5); }

  function baseSession(kind) {
    return {
      kind: kind, st: null, players: [], groups: [null, null], turn: 0, isBreak: false, inHand: false, kitchen: false,
      phase: 'aim', aim: 0, power: 0, drag: null, spinX: 0, spinY: 0, legal: [], tray: [], potAnims: [], banner: null,
      stats: { pots: [0, 0], fouls: [0, 0], shots: [0, 0] }, coinsEarned: 0, cpu: null, timeScale: 1, zoom: 1, zx: P.CX, zy: P.CY,
      shotPots: [], overT: -1, rollT: 0, fineHold: 0, lastTick: 0, strike: null, cueAlpha: 1, hover: false, placeOk: true,
      comboStreak: 0, tipT: 0
    };
  }

  function wireState(st) {
    st.onEvent = onPhysEvent;
    for (var i = 0; i < sprites.length; i++) { sprites[i].m = Art.newOrientation(); sprites[i].dirty = true; sprites[i].sq = 0; }
  }

  function newMatch(kind, oppId) {
    G = baseSession(kind);
    G.st = P.rack();
    wireState(G.st);
    if (kind === 'cpu') {
      G.opp = oppById(oppId);
      G.players = [{ name: 'أنت', avatar: 'you', cpu: null }, { name: G.opp.name, fem: !!G.opp.fem, avatar: G.opp.avatar, cpu: G.opp.id }];
    } else if (kind === 'pvp') {
      G.players = [{ name: 'اللاعب 1', avatar: 'you', cpu: null }, { name: 'اللاعب 2', avatar: 'p2', cpu: null }];
    } else {
      G.players = [{ name: 'أ', avatar: 'rex', cpu: 'medium' }, { name: 'ب', avatar: 'coco', cpu: 'medium' }];
      G.turn = Math.random() < 0.5 ? 0 : 1;
    }
    G.isBreak = true; G.inHand = true; G.kitchen = true;
    var cue = P.ball(G.st, 0); cue.x = P.HEAD_X - 60; cue.y = P.CY;
    G.aim = 0;
    startTurn(true);
    if (kind !== 'demo') {
      banner(kind === 'cpu' ? 'أنت تبدأ!' : 'اللاعب 1 يبدأ!', 'حطّم المثلث بضربة قوية!', '#ffe45c');
      if (kind === 'cpu') { say('start'); G.say.t = -1.2; }
    }
  }

  function newTrick(idx) {
    G = baseSession('trick');
    G.level = idx; G.lv = LV[idx]; G.attempts = 1;
    G.players = [{ name: 'أنت', avatar: 'you', cpu: null }];
    resetTrick(true);
  }
  function resetTrick(first) {
    G.st = LV.makeState(G.lv, P);
    wireState(G.st);
    G.prog = { shotsUsed: 0 };
    G.tray = []; G.potAnims = []; G.phase = 'aim'; G.drag = null; G.power = 0; G.overT = -1; G.failT = -1;
    G.inHand = false; G.timeScale = 1; G.zoom = 1;
    // aim at the first target
    var cue = P.ball(G.st, 0), t = P.ball(G.st, G.lv.targets[0]);
    G.aim = Math.atan2(t.y - cue.y, t.x - cue.x);
    startTurn(true);
    banner((first ? 'التحدي ' + (G.level + 1) : 'المحاولة ' + G.attempts), G.lv.name, '#5fe0ff');
  }

  function match() { return { groups: G.groups, turn: G.turn, isBreak: G.isBreak }; }

  function startTurn(first) {
    G.spinX = 0; G.spinY = 0; G.power = 0; G.drag = null; G.strike = null; G.cueAlpha = 0;
    G.shotPots = []; G.rollT = 0;
    // keep the helpful preset aim until the mouse really moves
    lastPX = ptr.x; lastPY = ptr.y;
    if (G.kind === 'trick') {
      G.legal = G.lv.targets.filter(function (n) { var b = P.ball(G.st, n); return b && b.on; });
      if (G.lv.eightLast && G.legal.length > 1) G.legal = G.legal.filter(function (n) { return n !== 8; });
      G.phase = 'aim';
      return;
    }
    G.legal = Rules.targets(G.st, match(), G.turn);
    var pl = G.players[G.turn];
    var cue = P.ball(G.st, 0);
    if (pl.cpu) {
      G.phase = 'cpu';
      G.cpu = { planner: AI.planner(G.st, match(), pl.cpu, { inHand: G.inHand, kitchen: G.kitchen, isBreak: G.isBreak }), t: 0, stage: 'think', st0: 0 };
    } else {
      G.phase = 'aim';
      if (G.isBreak) {
        G.aim = Math.atan2(P.CY - cue.y, P.FOOT_X - cue.x);
      } else if (cue.on) {
        // point roughly at the nearest legal ball so the guide shows something useful
        var best = null, bd = 1e9;
        for (var i = 0; i < G.st.balls.length; i++) {
          var b = G.st.balls[i];
          if (!b.on || G.legal.indexOf(b.n) < 0) continue;
          var d = Kit.dist(cue.x, cue.y, b.x, b.y);
          if (d < bd) { bd = d; best = b; }
        }
        if (best) G.aim = Math.atan2(best.y - cue.y, best.x - cue.x);
      }
    }
  }

  function banner(text, sub, color, dur) {
    if (!G || G.kind === 'demo') return;
    G.banner = { text: text, sub: sub || '', color: color || '#ffe45c', t: 0, dur: dur || 1.5 };
  }

  /* =============================================================== physics events */
  function onPhysEvent(type, a, b, v, x, y) {
    if (!G) return;
    if (type === 'ball') {
      SFX.clack(v);
      var sq = Math.min(0.18, v / 7000);
      sprites[a.n].sq = Math.max(sprites[a.n].sq || 0, sq);
      sprites[b.n].sq = Math.max(sprites[b.n].sq || 0, sq);
      if (v > 700) { ring(x, y, 'rgba(255,255,255,0.8)', 3, 10 + v / 90, 0.22); fx.burst(x, y, { count: Math.min(10, v / 200 | 0), color: '#fff', speed: v / 5, life: 0.25, size: 3, gravity: 0 }); }
      if (v > 1600) shake.add(Math.min(7, v / 450));
    } else if (type === 'cushion') {
      SFX.thud(v);
      if (v > 900) { fx.burst(x, y, { count: 5, color: 'rgba(255,255,255,0.6)', speed: 120, life: 0.3, size: 3, gravity: 0 }); shake.add(Math.min(4, v / 600)); }
    } else if (type === 'pot') {
      var pk = P.pockets[b];
      G.potAnims.push({ n: a.n, x: a.x, y: a.y, vx: a.vx, vy: a.vy, px: pk.x, py: pk.y, t: 0 });
      G.shotPots.push(a.n);
      SFX.pocket();
      shake.add(a.n === 0 ? 4 : 5);
      var col = Art.BALL_HEX[a.n];
      ring(pk.x, pk.y, a.n === 0 ? '#ff5a5f' : '#ffe45c', 10, 60, 0.45);
      fx.burst(pk.x, pk.y, { count: 22, colors: [col, '#ffe45c', '#fff', '#ff3b8d'], speed: 320, life: 0.7, size: 7, gravity: 300 });
      var cnt = 0; for (var i = 0; i < G.shotPots.length; i++) if (G.shotPots[i] !== 0) cnt++;
      if (a.n === 0) float('سقطت البيضاء!', pk.x, pk.y - 30, '#ff8a8a', 30);
      else if (G.kind !== 'demo') {
        var human = !G.players[G.turn].cpu;
        var own = G.kind === 'trick' ? G.lv.targets.indexOf(a.n) >= 0 : isOwnBall(a.n);
        if (own) {
          SFX.good(G.comboStreak + cnt);
          if (G.kind === 'cpu' && human) { float('+5', pk.x, pk.y - 30, '#ffe45c', 32); }
          else float('رائع!', pk.x, pk.y - 30, '#fff', 28);
        }
        if (cnt >= 2) float(cnt === 2 ? 'كرتان معًا!' : cnt === 3 ? 'ثلاث كرات!' : 'ضربة خارقة!', P.CX, P.CY - 40, '#ff8cc6', 56, 1.3);
      }
    }
  }

  function isOwnBall(n) {
    if (!G || G.kind === 'trick') return false;
    var g = G.groups[G.turn];
    if (n === 8) return G.legal.length === 1 && G.legal[0] === 8;
    if (!g) return n !== 0 && n !== 8;
    return P.groupOf(n) === g;
  }

  /* =============================================================== shooting */
  function strike(angle, speed, sx, sy) {
    G.strike = { t: 0, angle: angle, speed: speed, sx: sx, sy: sy, pull: G.power };
    G.phase = 'strike';
    G.inHand = false;
  }

  function doShoot() {
    var s = G.strike;
    P.shoot(G.st, s.angle, s.speed, s.sx, s.sy, G.isBreak && G.kind !== 'trick');
    var p = s.speed / P.MAX_SPEED;
    SFX.cue(p);
    var cue = P.ball(G.st, 0);
    fx.burst(cue.x - Math.cos(s.angle) * R, cue.y - Math.sin(s.angle) * R, { count: 8, colors: ['#5fb8ff', '#bfe3ff'], speed: 80, life: 0.35, size: 4, gravity: 0 });
    if (p > 0.85) { shake.add(5); ring(cue.x, cue.y, 'rgba(255,255,255,0.7)', 6, 40, 0.25); }
    G.phase = 'rolling'; G.rollT = 0;
    G.cueAlpha = 1;
    G.stats.shots[G.turn]++;
    if (G.kind === 'trick') G.prog.shotsUsed++;
    if (G.kind !== 'demo' && !G.players[G.turn].cpu) { save.shots++; }
  }

  /* =============================================================== update */
  function update(dt) {
    time += dt;
    handleScreenKeys();
    if (!ptr.down) ptrArmed = true;
    if (screen !== 'pause' && G) {
      updateGame(dt);
    }
    fx.update(dt); shake.update(dt);
    for (var i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > floats[i].dur) floats.splice(i, 1); }
    for (i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > rings[i].dur) rings.splice(i, 1); }
    for (i = confetti.length - 1; i >= 0; i--) {
      var c = confetti[i]; c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt; c.vx += Math.sin(time * 3 + i) * 8 * dt;
      if (c.y > H + 30) confetti.splice(i, 1);
    }
    Kit.keys.endFrame(); ptr.endFrame();
  }

  function updateGame(dt) {
    var st = G.st;
    if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
    if (G.say) { G.say.t += dt; if (G.say.t > 2.4) G.say = null; }
    // sprite squash decay
    for (var i = 0; i < sprites.length; i++) if (sprites[i].sq) { sprites[i].sq *= Math.pow(0.0005, dt); if (sprites[i].sq < 0.005) sprites[i].sq = 0; }
    // pot animations
    for (i = G.potAnims.length - 1; i >= 0; i--) {
      var pa = G.potAnims[i];
      pa.t += dt;
      if (pa.t > 0.3) {
        G.potAnims.splice(i, 1);
        if (pa.n !== 0) G.tray.push({ n: pa.n, x: 870, tx: 450 + G.tray.length * 25.6, v: -700 });
      }
    }
    for (i = 0; i < G.tray.length; i++) {
      var tb = G.tray[i];
      if (tb.x > tb.tx) {
        tb.x += tb.v * dt;
        Art.rotate(sprites[tb.n].m, 0, 1, 0, -tb.v * dt / R); sprites[tb.n].dirty = true;
        if (tb.x <= tb.tx) { tb.x = tb.tx; if (G.kind !== 'demo') SFX.clack(250); }
      }
    }
    if (G.cueAlpha > 0 && G.phase === 'rolling') G.cueAlpha = Math.max(0, G.cueAlpha - dt * 3);
    else if (G.phase === 'aim' || G.phase === 'cpu') G.cueAlpha = Math.min(1, G.cueAlpha + dt * 4);

    if (G.phase === 'aim') humanAim(dt);
    else if (G.phase === 'cpu') cpuTurn(dt);
    else if (G.phase === 'strike') {
      G.strike.t += dt;
      if (G.strike.t >= 0.07) doShoot();
    } else if (G.phase === 'rolling') {
      rolling(dt);
    } else if (G.phase === 'over') {
      G.overT += dt;
      if (G.kind !== 'demo' && G.overT > 1.3 && screen === 'game') showOver();
      if (G.kind === 'demo' && G.overT > 2.5) newMatch('demo');
    } else if (G.phase === 'fail') {
      G.failT += dt;
      if (G.failT > 1.6) { G.attempts++; resetTrick(false); }
    } else if (G.phase === 'won') {
      G.overT += dt;
      if (G.overT > 1.1 && screen === 'game') showDone();
    }
  }

  function rolling(dt) {
    var st = G.st;
    G.rollT += dt;
    if (G.rollT > 0.4) G.power = Math.max(0, G.power - dt * 1.2);
    // slow motion when a decisive ball is about to drop
    var want = 1, focus = null;
    if (G.kind !== 'demo') {
      var key = null;
      if (G.kind === 'trick') { var left = 0; for (var q = 0; q < G.lv.targets.length; q++) { var tb = P.ball(st, G.lv.targets[q]); if (tb && tb.on) { left++; key = tb; } } if (left !== 1) key = null; }
      else if (G.legal.length === 1 && G.legal[0] === 8) key = P.ball(st, 8);
      if (key && key.on) {
        var sp = Math.sqrt(key.vx * key.vx + key.vy * key.vy);
        if (sp > 20) {
          for (var k = 0; k < P.pockets.length; k++) {
            var pk = P.pockets[k], dx = pk.x - key.x, dy = pk.y - key.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 110 && (dx * key.vx + dy * key.vy) / (d * sp) > 0.93) { want = 0.3; focus = key; break; }
          }
        }
      }
    }
    G.timeScale += (want - G.timeScale) * Math.min(1, dt * 10);
    var zt = focus ? 1.12 : 1;
    G.zoom += (zt - G.zoom) * Math.min(1, dt * 6);
    if (focus) { G.zx += (focus.x - G.zx) * Math.min(1, dt * 8); G.zy += (focus.y - G.zy) * Math.min(1, dt * 8); }
    var sdt = dt * G.timeScale;
    P.step(st, sdt);
    spinSprites(sdt);
    if ((!P.moving(st) && G.potAnims.length === 0) || G.rollT > 45) {
      if (G.rollT > 45) st.balls.forEach(function (b) { b.vx = b.vy = b.wx = b.wy = 0; });
      G.timeScale = 1;
      endShot();
    }
  }

  var orthoCount = 0;
  function spinSprites(dt) {
    var balls = G.st.balls;
    orthoCount++;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on) continue;
      var sp = sprites[b.n];
      var wl = Math.sqrt(b.wx * b.wx + b.wy * b.wy);
      if (wl > 0.5) { Art.rotate(sp.m, b.wy, -b.wx, 0, wl * dt / R); sp.dirty = true; }
      else if (b.vx || b.vy) { var vl = Math.sqrt(b.vx * b.vx + b.vy * b.vy); Art.rotate(sp.m, b.vy, -b.vx, 0, vl * dt / R * 0.3); sp.dirty = true; }
      if (b.s) { Art.rotate(sp.m, 0, 0, 1, -b.s * 14 * dt); sp.dirty = true; }
      if (orthoCount % 30 === 0) Art.orthonormalize(sp.m);
    }
  }

  /* ---------------------------------------------------------- human input */
  var BAR = { x: 62, y: 214, w: 44, h: 350 };
  var SPIN = { x: 1204, y: 330, r: 52 };
  function inBar(x, y) { return x > BAR.x - 16 && x < BAR.x + BAR.w + 16 && y > BAR.y - 20 && y < BAR.y + BAR.h + 20; }
  function inSpin(x, y) { return Kit.dist(x, y, SPIN.x, SPIN.y) < SPIN.r + 14; }

  function humanAim(dt) {
    var cue = P.ball(G.st, 0);
    var mx = ptr.x, my = ptr.y;
    var moved = Math.abs(mx - lastPX) > 0.5 || Math.abs(my - lastPY) > 0.5;
    lastPX = mx; lastPY = my;
    var tableClick = ptrArmed && ptr.pressed && screen === 'game';

    // fine aim with keys
    var rot = 0;
    if (Kit.keys.anyDown(['ArrowLeft', 'KeyA'])) rot -= 1;
    if (Kit.keys.anyDown(['ArrowRight', 'KeyD'])) rot += 1;
    if (rot && (!G.drag || G.drag.type === 'key' || G.drag.type === 'shot' && G.power < 0.02)) {
      G.fineHold += dt;
      var slow = Kit.keys.anyDown(['ShiftLeft', 'ShiftRight']);
      var step = slow ? 0.0006 : (G.fineHold < 0.3 ? 0.0015 : Math.min(0.014, 0.0015 + (G.fineHold - 0.3) * 0.01));
      G.aim += rot * step;
    } else G.fineHold = 0;

    G.hover = G.inHand && Kit.dist(mx, my, cue.x, cue.y) < R * 2.4;
    if (!G.drag) {
      if (moved && Kit.dist(mx, my, cue.x, cue.y) > R * 1.6 && !inBar(mx, my) && !inSpin(mx, my)) {
        G.aim = magnet(cue, Math.atan2(my - cue.y, mx - cue.x));
      }
      if (tableClick) {
        if (inSpin(mx, my)) { G.drag = { type: 'spin' }; SFX.click(); }
        else if (inBar(mx, my)) G.drag = { type: 'bar', y0: my };
        else if (G.hover) { G.drag = { type: 'ball', ox: cue.x - mx, oy: cue.y - my }; SFX.click(); }
        else G.drag = { type: 'shot', x0: mx, y0: my };
      } else if (Kit.keys.pressed('Space') || Kit.keys.pressed('Enter')) {
        G.drag = { type: 'key', t: 0, code: Kit.keys.pressed('Space') ? 'Space' : 'Enter' };
      }
    }
    var d = G.drag;
    if (!d) { G.power = 0; return; }
    if (d.type === 'spin') {
      var sx = (mx - SPIN.x) / (SPIN.r * 0.78), sy = (my - SPIN.y) / (SPIN.r * 0.78);
      var sl = Math.sqrt(sx * sx + sy * sy);
      if (sl > 1) { sx /= sl; sy /= sl; }
      if (sl < 0.14) { sx = 0; sy = 0; }
      G.spinX = sx; G.spinY = -sy;
      if (!ptr.down) G.drag = null;
      return;
    }
    if (d.type === 'ball') {
      var tx = mx + d.ox, ty = my + d.oy;
      tx = clamp(tx, P.TX0 + R, G.kitchen ? P.HEAD_X : P.TX1 - R); ty = clamp(ty, P.TY0 + R, P.TY1 - R);
      if (P.canPlace(G.st, tx, ty, G.kitchen)) { cue.x = tx; cue.y = ty; G.placeOk = true; }
      else G.placeOk = false;
      if (!ptr.down) { G.drag = null; SFX.place(); ring(cue.x, cue.y, '#fff', R, R * 2.5, 0.3); G.placeOk = true; }
      return;
    }
    var prevPow = G.power;
    if (d.type === 'shot') {
      G.power = clamp(Kit.dist(mx, my, d.x0, d.y0) / 250, 0, 1);
      if (ptr.right) { G.drag = null; G.power = 0; return; }
      if (!ptr.down) release();
    } else if (d.type === 'bar') {
      G.power = clamp((my - d.y0) / (BAR.h * 0.8), 0, 1);
      if (ptr.right) { G.drag = null; G.power = 0; return; }
      if (!ptr.down) release();
    } else if (d.type === 'key') {
      d.t += dt;
      var ph = (d.t / 1.3) % 2; G.power = ph < 1 ? ph : 2 - ph;
      G.power = Math.max(0.02, G.power);
      if (!Kit.keys.down(d.code)) release();
    }
    if (G.drag && Math.floor(G.power * 10) !== Math.floor(prevPow * 10)) SFX.tick(G.power);
  }
  // BIG aim help: a small "sweet spot" pull toward angles that pot the ball in the guide
  function magnet(cue, ang) {
    if (save.aim !== 'big') return ang;
    var tr = P.trace(G.st, cue.x, cue.y, ang);
    if (!tr || tr.type !== 'ball') return ang;
    var b = tr.ball;
    if (G.legal.indexOf(b.n) < 0) return ang;
    var best = ang, bd = 0.007;
    for (var k = 0; k < P.pockets.length; k++) {
      var pts = AI.aimPoints(P.pockets[k]);
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i][0] - b.x, dy = pts[i][1] - b.y, dl = Math.sqrt(dx * dx + dy * dy);
        if (dl < 1) continue;
        var gx = b.x - dx / dl * 2 * R, gy = b.y - dy / dl * 2 * R;
        var a2 = Math.atan2(gy - cue.y, gx - cue.x);
        var d = Math.abs(Math.atan2(Math.sin(a2 - ang), Math.cos(a2 - ang)));
        if (d < bd) {
          // only snap if the ball would really head into that pocket
          var t2 = P.trace(G.st, cue.x, cue.y, a2);
          if (!t2 || t2.type !== 'ball' || t2.ball !== b) continue;
          var ot = P.trace(G.st, b.x, b.y, Math.atan2(t2.oy, t2.ox), b.n);
          if (ot && ot.type === 'pocket') { bd = d; best = a2; }
        }
      }
    }
    return best;
  }

  function release() {
    G.drag = null;
    if (G.power < 0.03) { G.power = 0; return; }
    strike(G.aim, speedFromPower(G.power), G.spinX, G.spinY);
  }

  /* ---------------------------------------------------------- CPU */
  function cpuTurn(dt) {
    var c = G.cpu, cue = P.ball(G.st, 0);
    var fast = G.kind === 'demo' ? 1.4 : 1;
    c.t += dt * fast;
    if (c.stage === 'think') {
      c.planner.step(3);
      if (c.planner.done && c.t > c.planner.thinkTime) {
        c.res = c.planner.result;
        if (c.res.place) {
          c.stage = 'place'; c.t = 0;
          c.from = cue.on ? { x: cue.x, y: cue.y } : { x: c.res.place.x, y: c.res.place.y - 80 };
          cue.on = true;
        } else { c.stage = 'aim'; c.t = 0; c.a0 = G.aim; }
      }
    } else if (c.stage === 'place') {
      var k = Math.min(1, c.t / 0.5), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cue.x = c.from.x + (c.res.place.x - c.from.x) * e; cue.y = c.from.y + (c.res.place.y - c.from.y) * e;
      if (k >= 1) { SFX.place(); ring(cue.x, cue.y, '#fff', R, R * 2.5, 0.3); c.stage = 'aim'; c.t = 0; c.a0 = G.aim; }
    } else if (c.stage === 'aim') {
      var k2 = Math.min(1, c.t / 0.7), e2 = 1 - Math.pow(1 - k2, 3);
      var da = Math.atan2(Math.sin(c.res.angle - c.a0), Math.cos(c.res.angle - c.a0));
      G.aim = c.a0 + da * e2;
      G.spinX = c.res.spinX; G.spinY = c.res.spinY;
      if (k2 >= 1 && c.t > 0.95) { c.stage = 'pull'; c.t = 0; }
    } else if (c.stage === 'pull') {
      var target = powerFromSpeed(c.res.speed);
      G.power = target * Math.min(1, c.t / 0.45);
      if (c.t > 0.6) { G.aim = c.res.angle; strike(c.res.angle, c.res.speed, c.res.spinX, c.res.spinY); }
    }
  }

  /* ---------------------------------------------------------- end of shot */
  function endShot() {
    var shot = G.st.shot;
    if (!shot) { startTurn(); return; }
    var human = !G.players[G.turn].cpu;
    var realPots = shot.pots.filter(function (p) { return p.n !== 0; });
    if (G.kind === 'trick') return trickEnd(shot);
    var res = Rules.judge(match(), G.legal, shot);
    var shooter = G.turn, name = G.players[shooter].name, wasBreak0 = G.isBreak;

    // juice callouts
    if (G.kind !== 'demo') {
      var bank = false;
      shot.pots.forEach(function (p) { if (p.n !== 0 && p.cush > 0 && !G.isBreak) bank = true; });
      if (bank && !res.foul) float('ضربة ارتداد!', P.CX, P.CY + 30, '#5fe0ff', 46, 1.3);
      if (!realPots.length && !res.foul && !G.isBreak) soClose(G.legal);
    }
    if (G.kind === 'cpu' && !res.win && !res.lose) {
      if (res.foul && human) say('youFoul');
      else if (res.keepTurn && human && !wasBreak0) { if (Math.random() < 0.45) say('youPot'); }
      else if (res.keepTurn && !human) { if (Math.random() < 0.5) say('pot'); }
      else if (!res.keepTurn && !human && Math.random() < 0.5) say('miss');
    }
    if (res.win) { finishMatch(shooter, ''); return; }
    if (res.lose) { finishMatch(1 - shooter, res.reason); return; }
    if (res.assign) {
      G.groups[shooter] = res.assign; G.groups[1 - shooter] = Rules.other(res.assign);
    }
    // stats and coins
    var own = 0;
    shot.pots.forEach(function (p) { if (G.groups[shooter] && P.groupOf(p.n) === G.groups[shooter]) own++; });
    G.stats.pots[shooter] += own;
    if (G.kind === 'cpu' && human && own) { G.coinsEarned += own * 5; save.totalPots += own; }
    if (res.respot8) {
      var e8 = P.ball(G.st, 8), sp8 = P.findPlace(G.st, P.FOOT_X, P.CY, false);
      e8.on = true; e8.x = sp8.x; e8.y = sp8.y; e8.vx = e8.vy = e8.wx = e8.wy = 0;
      G.tray = G.tray.filter(function (t) { return t.n !== 8; });
      G.tray.forEach(function (t, i) { t.tx = 450 + i * 25.6; t.x = Math.min(t.x, t.tx + 1); });
      float('عادت الكرة 8 إلى مكانها', P.FOOT_X - 60, P.CY - 40, '#fff', 24);
    }
    var wasBreak = G.isBreak;
    G.isBreak = false; G.kitchen = false;
    var cue = P.ball(G.st, 0);
    if (res.foul) {
      G.stats.fouls[shooter]++;
      G.turn = 1 - shooter;
      G.inHand = true;
      if (!cue.on) { var sp = P.findPlace(G.st, P.HEAD_X - 60, P.CY, false); cue.on = true; cue.x = sp.x; cue.y = sp.y; cue.vx = cue.vy = cue.wx = cue.wy = 0; cue.s = 0; }
      if (G.kind !== 'demo') SFX.foul();
      G.comboStreak = 0;
      startTurn();
      var nxt = G.players[G.turn];
      banner('خطأ! ' + res.reason, (G.kind === 'cpu' && !nxt.cpu ? 'الكرة بيدك: اسحب البيضاء إلى أي مكان!' : 'الكرة البيضاء بيد ' + nxt.name), '#ff6b6b', 2.1);
      return;
    }
    G.inHand = false;
    if (res.keepTurn) {
      G.comboStreak++;
      startTurn();
      if (res.assign) {
        var mine = G.kind === 'cpu' && human ? 'كراتك: ' : (name + ': ');
        banner(mine + (res.assign === 'solid' ? 'السادة!' : 'المخطّطة!'), res.assign === 'solid' ? 'الكرات من 1 إلى 7' : 'الكرات من 9 إلى 15', '#ffe45c', 1.8);
      } else if (G.legal.length === 1 && G.legal[0] === 8) {
        banner('الآن الكرة 8!', 'أدخل الكرة 8 لتفوز!', '#ffe45c', 1.8);
      } else if (G.comboStreak >= 3 && human) {
        float(G.comboStreak + ' ضربات متتالية!', P.CX, P.CY - 70, '#ffe45c', 44, 1.2);
      } else if (!wasBreak && human) float('اضرب مرة أخرى!', P.CX, P.CY + 70, '#fff', 30, 1);
      return;
    }
    G.comboStreak = 0;
    G.turn = 1 - shooter;
    startTurn();
    if (G.kind === 'demo') return;
    var np = G.players[G.turn];
    SFX.turn();
    if (res.assign) banner((G.kind === 'cpu' && !np.cpu ? 'كراتك' : np.name) + ': ' + (G.groups[G.turn] === 'solid' ? 'السادة' : 'المخطّطة'), (G.kind === 'cpu' && !np.cpu) ? 'دورك الآن!' : 'الدور الآن على ' + np.name, '#5fe0ff');
    else if (G.kind === 'cpu') banner(np.cpu ? 'دور ' + np.name : 'دورك!', '', np.cpu ? '#ff8cc6' : '#5fe0ff', 1.2);
    else banner('دور ' + np.name, '', G.turn === 0 ? '#5fe0ff' : '#ff8cc6', 1.3);
  }

  function soClose(targets) {
    var st = G.st;
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on || targets.indexOf(b.n) < 0) continue;
      for (var k = 0; k < P.pockets.length; k++) {
        var pk = P.pockets[k];
        if (Kit.dist(b.x, b.y, pk.x, pk.y) < pk.r + 16) { float('كادت تدخل!', b.x, b.y - 30, '#ffb3d9', 30, 1.2); return; }
      }
    }
  }

  function finishMatch(winner, reason) {
    G.phase = 'over'; G.overT = 0; G.winner = winner; G.loseReason = reason;
    if (G.kind === 'demo') return;
    var humanWon = G.kind === 'pvp' || !G.players[winner].cpu;
    if (humanWon) { SFX.cheer(); confettiBurst(160); shake.add(6); }
    else SFX.lose();
    banner(G.kind === 'cpu' && !G.players[winner].cpu ? 'فزت!' : winTxt(G.players[winner]), reason || '', humanWon ? '#ffe45c' : '#9fdcff', 2);
    // rewards
    G.badges = [];
    if (G.kind === 'cpu') {
      var o = G.opp;
      if (humanWon) {
        var first = !save.wins[o.id];
        save.wins[o.id] = (save.wins[o.id] || 0) + 1;
        G.coinsEarned += o.reward;
        if (first) { G.coinsEarned += 100; G.badges.push('كأس جديد: هزمت ' + o.name + '!'); }
        if (o.id === 'hard' && first) G.badges.push('فتحت عصا القرش الذهبي!');
        save.streak++;
        if (save.streak > save.bestStreak) { save.bestStreak = save.streak; if (save.streak > 1) G.badges.push('أفضل سلسلة فوز: ' + save.streak + '!'); }
      } else {
        save.losses[o.id] = (save.losses[o.id] || 0) + 1;
        save.streak = 0;
        G.coinsEarned += 10;
      }
    } else if (G.kind === 'pvp') {
      save.pvpGames++;
      G.coinsEarned += 20;
    }
    save.coins += G.coinsEarned;
    persist();
  }

  function trickEnd(shot) {
    var r = LV.judge(G.lv, G.prog, shot, G.st);
    if (r.status === 'win') {
      G.phase = 'won'; G.overT = 0;
      var stars = G.attempts === 1 ? 3 : G.attempts <= 3 ? 2 : 1;
      var prev = save.stars[G.level] || 0;
      G.newStars = stars; G.prevStars = prev;
      G.coinsEarned = Math.max(0, stars - prev) * 15;
      if (stars > prev) save.stars[G.level] = stars;
      save.coins += G.coinsEarned;
      G.badges = [];
      if (starTotal() === LV.length * 3 && prev < 3) G.badges.push('كل النجوم الـ30! فتحت طاولة المجرّة!');
      persist();
      SFX.cheer(); confettiBurst(120); shake.add(5);
      banner('مذهل!', 'أنجزت: ' + G.lv.name, '#ffe45c', 1.4);
      return;
    }
    if (r.status === 'fail') {
      G.phase = 'fail'; G.failT = 0;
      SFX.foul();
      banner('لم تنجح!', r.reason, '#ff8a8a', 1.6);
      soClose(G.lv.targets);
      return;
    }
    // keep going
    var cue = P.ball(G.st, 0);
    if (!cue.on) { G.phase = 'fail'; G.failT = 0; return; }
    var left = G.lv.shots - G.prog.shotsUsed;
    if (shot.pots.length) float('رائع! ' + shotsLeftTxt(left), P.CX, P.CY + 60, '#fff', 30);
    else float(shotsLeftTxt(left), P.CX, P.CY + 60, '#ffd0e6', 30);
    startTurn();
  }

  /* =============================================================== render */
  function render() {
    if (needTable) { Art.renderTable(tableLayer, K, save.felt); needTable = false; }
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.fillStyle = '#130c33'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (G && G.zoom > 1.001) {
      ctx.translate(G.zx, G.zy); ctx.scale(G.zoom, G.zoom); ctx.translate(-G.zx, -G.zy);
    }
    ctx.drawImage(tableLayer, 0, 0, W, H);
    if (G) {
      drawKitchen();
      drawBalls();
      if (G.phase === 'aim' || (G.phase === 'cpu' && G.cpu.stage !== 'think' && G.cpu.stage !== 'place') || G.phase === 'strike') drawGuide();
      drawCueStick();
      drawTray();
    }
    fx.draw(ctx);
    drawRings();
    ctx.restore();
    if (G && G.kind !== 'demo' && (screen === 'game' || screen === 'pause' || screen === 'over' || screen === 'done')) drawHUD();
    drawFloats();
    if (G && G.banner) drawBanner();
    drawConfetti();
  }

  function drawKitchen() {
    if (!(G.inHand && G.kitchen && (G.phase === 'aim' || G.phase === 'cpu'))) return;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + 0.03 * Math.sin(time * 4)) + ')';
    ctx.fillRect(P.TX0, P.TY0, P.HEAD_X - P.TX0, P.TH);
  }

  function drawBalls() {
    var st = G.st, sh = Art.shadow();
    var rpx = Math.min(30, R * K * (G.zoom || 1));
    var i, b;
    for (i = 0; i < st.balls.length; i++) {
      b = st.balls[i];
      if (!b.on) continue;
      ctx.drawImage(sh, b.x - R * 1.25 + 3.5, b.y - R * 1.25 + 5, R * 2.5, R * 2.5);
    }
    for (i = 0; i < G.potAnims.length; i++) {
      var pa = G.potAnims[i], k = Math.min(1, pa.t / 0.3);
      var x = pa.x + (pa.px - pa.x) * k, y = pa.y + (pa.py - pa.y) * k;
      drawSprite(pa.n, x, y, R * (1 - 0.5 * k), 1 - 0.7 * k, rpx);
    }
    for (i = 0; i < st.balls.length; i++) {
      b = st.balls[i];
      if (!b.on) continue;
      var sq = sprites[b.n].sq || 0;
      drawSprite(b.n, b.x, b.y, R * (1 + sq), 1, rpx);
    }
    // ball in hand marker
    if (G.inHand && (G.phase === 'aim' && !G.players[G.turn].cpu)) {
      var cue = P.ball(st, 0);
      ctx.save();
      ctx.strokeStyle = G.placeOk ? 'rgba(255,255,255,0.85)' : '#ff5a5f';
      ctx.lineWidth = 2.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -time * 20;
      ctx.beginPath(); ctx.arc(cue.x, cue.y, R + 7 + Math.sin(time * 6) * 1.5, 0, 6.283); ctx.stroke();
      ctx.restore();
      if (!G.drag) drawHand(cue.x + 16, cue.y + 14, G.hover);
    }
  }

  function drawSprite(n, x, y, r, alpha, rpx) {
    var sp = sprites[n];
    if (sp.dirty || Math.abs(sp.rpx - rpx) > 0.01) Art.renderSprite(sp, rpx);
    var s = sp.size / sp.rpx * r;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp.canvas, x - s / 2, y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }

  function drawHand(x, y, active) {
    ctx.save(); ctx.translate(x, y); var s = active ? 1.15 : 1; ctx.scale(s, s);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d2340'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.lineTo(0, -8); ctx.quadraticCurveTo(3, -11, 6, -8); ctx.lineTo(6, -2);
    ctx.lineTo(6, -5); ctx.quadraticCurveTo(9, -8, 12, -5); ctx.lineTo(12, 0);
    ctx.quadraticCurveTo(15, -3, 18, 0); ctx.lineTo(18, 10); ctx.quadraticCurveTo(18, 18, 10, 18); ctx.lineTo(4, 18); ctx.quadraticCurveTo(-4, 14, -6, 6);
    ctx.lineTo(-6, 4); ctx.quadraticCurveTo(-3, 1, 0, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function guideLen() { return save.aim === 'pro' ? 0.35 : 1; }

  function drawGuide() {
    var st = G.st, cue = P.ball(st, 0);
    if (!cue.on) return;
    if (G.drag && G.drag.type === 'ball') return;
    var cpu = !!G.players[G.turn].cpu;
    var tr = P.trace(st, cue.x, cue.y, G.aim);
    if (!tr) return;
    var gl = guideLen();
    var alpha = cpu ? 0.45 : 0.95;
    ctx.save();
    ctx.lineCap = 'round';
    // main line
    var endX = tr.x, endY = tr.y;
    if (save.aim === 'pro' && !cpu) {
      var maxL = 260;
      if (tr.t > maxL) { endX = cue.x + tr.dx * maxL; endY = cue.y + tr.dy * maxL; }
    }
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time * 30;
    ctx.beginPath(); ctx.moveTo(cue.x + tr.dx * R, cue.y + tr.dy * R); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.setLineDash([]);
    if (endX !== tr.x) { ctx.restore(); return; }
    if (tr.type === 'ball') {
      var legal = G.legal.indexOf(tr.ball.n) >= 0;
      var avoid = G.kind === 'trick' && ((G.lv.avoid && G.lv.avoid.indexOf(tr.ball.n) >= 0) ||
        (G.lv.eightLast && tr.ball.n === 8 && G.legal.indexOf(8) < 0));
      var good = G.kind === 'trick' ? !avoid : legal;
      // ghost ball
      ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')'; ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, R, 0, 6.283); ctx.fill(); ctx.stroke();
      if (!good && !cpu) {
        // red X on the wrong ball
        ctx.strokeStyle = '#ff4d5a'; ctx.lineWidth = 4;
        var bx = tr.ball.x, by = tr.ball.y;
        ctx.beginPath(); ctx.arc(bx, by, R + 5, 0, 6.283); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 7, by - 7); ctx.lineTo(bx + 7, by + 7); ctx.moveTo(bx + 7, by - 7); ctx.lineTo(bx - 7, by + 7); ctx.stroke();
        ctx.restore(); return;
      }
      // object ball path
      var oL = (40 + 170 * tr.cut) * gl;
      var ox = tr.ball.x, oy = tr.ball.y;
      var otr = P.trace(st, ox, oy, Math.atan2(tr.oy, tr.ox), tr.ball.n);
      var into = otr && otr.type === 'pocket' ? P.pockets[otr.pocket] : null;
      var col = cpu ? 'rgba(255,255,255,0.4)' : (into && save.aim === 'big' ? '#6dffa8' : 'rgba(255,228,92,0.95)');
      if (otr && otr.t < oL) oL = otr.t;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + tr.ox * oL, oy + tr.oy * oL); ctx.stroke();
      arrowHead(ox + tr.ox * oL, oy + tr.oy * oL, Math.atan2(tr.oy, tr.ox), col);
      if (save.aim === 'big' && !cpu) {
        if (otr && otr.type === 'cushion' && oL === otr.t) {
          // show the bounce
          var vn = tr.ox * otr.nx + tr.oy * otr.ny;
          var rx = tr.ox - 1.74 * vn * otr.nx, ry = tr.oy - 1.74 * vn * otr.ny, rl = Math.sqrt(rx * rx + ry * ry);
          rx /= rl; ry /= rl;
          ctx.strokeStyle = 'rgba(255,228,92,0.55)'; ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.moveTo(otr.x, otr.y); ctx.lineTo(otr.x + rx * 90, otr.y + ry * 90); ctx.stroke(); ctx.setLineDash([]);
        }
        if (into) {
          var pulse = 0.5 + 0.5 * Math.sin(time * 9);
          ctx.fillStyle = 'rgba(109,255,168,' + (0.18 + 0.12 * pulse) + ')';
          ctx.beginPath(); ctx.arc(into.x, into.y, into.hole + 8 + pulse * 4, 0, 6.283); ctx.fill();
          ctx.strokeStyle = '#6dffa8'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(into.x, into.y, into.hole + 3 + pulse * 3, 0, 6.283); ctx.stroke();
        }
      }
      // cue ball path after contact
      if (tr.cs > 0.02 && gl > 0.5 || (G.spinY && gl > 0.5)) {
        var cL = 26 + 110 * tr.cs * gl;
        var dirx = tr.cx * tr.cs, diry = tr.cy * tr.cs;
        // follow / draw bends the cue path along the shot line
        dirx += tr.dx * G.spinY * tr.cut * 0.8; diry += tr.dy * G.spinY * tr.cut * 0.8;
        var dl = Math.sqrt(dirx * dirx + diry * diry);
        if (dl > 0.03) {
          dirx /= dl; diry /= dl;
          cL = 26 + 110 * Math.min(1, dl) * gl;
          ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.6) + ')'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(tr.x + dirx * cL, tr.y + diry * cL); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    } else if (tr.type === 'cushion') {
      ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, R, 0, 6.283); ctx.stroke();
      var bl = 70 * gl;
      ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(tr.x + tr.rx * bl, tr.y + tr.ry * bl); ctx.stroke(); ctx.setLineDash([]);
    } else if (tr.type === 'pocket' && !cpu) {
      var pk = P.pockets[tr.pocket];
      ctx.strokeStyle = 'rgba(255,90,95,' + (0.6 + 0.4 * Math.sin(time * 10)) + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.hole + 3, 0, 6.283); ctx.stroke();
    }
    ctx.restore();
  }
  function arrowHead(x, y, a, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
    ctx.lineTo(x + Math.cos(a + 2.5) * 9, y + Math.sin(a + 2.5) * 9);
    ctx.lineTo(x + Math.cos(a - 2.5) * 9, y + Math.sin(a - 2.5) * 9); ctx.closePath(); ctx.fill();
  }

  function drawCueStick() {
    var cue = P.ball(G.st, 0);
    if (!cue.on) return;
    var gap, alpha = G.cueAlpha;
    if (alpha <= 0.01) return;
    if (G.phase === 'strike') {
      var k = Math.min(1, G.strike.t / 0.07);
      gap = R + 2 + (G.strike.pull * 130 + 6) * (1 - k);
    } else if (G.phase === 'rolling') {
      gap = R + 2 - (1 - alpha) * 10;
    } else {
      if (G.drag && G.drag.type === 'ball') return;
      if (G.phase === 'cpu' && (G.cpu.stage === 'think' || G.cpu.stage === 'place')) { alpha *= 0.5; }
      gap = R + 6 + G.power * 130 + (G.power === 0 ? Math.sin(time * 3) * 2 + 2 : 0);
    }
    var skin = G.players[G.turn].cpu ? (G.turn === 1 && G.kind === 'cpu' ? cpuCue() : 'classic') : save.cue;
    Art.drawCue(ctx, cue.x, cue.y, G.aim, gap, skin, alpha);
  }
  function cpuCue() { return G.opp.id === 'hard' ? 'gold' : G.opp.id === 'medium' ? 'ocean' : 'candy'; }

  function drawTray() {
    for (var i = 0; i < G.tray.length; i++) {
      var tb = G.tray[i];
      drawSprite(tb.n, tb.x, 685, R, 1, Math.min(30, R * K));
    }
  }

  function drawRings() {
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i], k = r.t / r.dur;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)), 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < floats.length; i++) {
      var f = floats[i], k = f.t / f.dur;
      var pop = k < 0.15 ? 0.5 + 0.5 * (k / 0.15) * 1.2 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.translate(f.x, f.y - 40 * k); ctx.scale(pop, pop);
      ctx.font = '700 ' + f.size + 'px ' + Art.font;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,10,50,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  function drawBanner() {
    var b = G.banner, k = b.t / b.dur;
    var inK = Math.min(1, b.t / 0.25), outK = k > 0.8 ? (k - 0.8) / 0.2 : 0;
    var s = (1 - Math.pow(1 - inK, 3)) * (1 - outK * 0.3);
    ctx.save();
    ctx.globalAlpha = 1 - outK;
    ctx.translate(P.CX, P.CY - 20);
    ctx.fillStyle = 'rgba(15,8,40,0.78)';
    var bw = 820 * s, bh = b.sub ? 118 : 90;
    ctx.beginPath(); ctx.moveTo(-bw / 2 - 20, -bh / 2); ctx.lineTo(bw / 2 + 20, -bh / 2); ctx.lineTo(bw / 2, bh / 2); ctx.lineTo(-bw / 2, bh / 2); ctx.closePath(); ctx.fill();
    ctx.scale(s, s);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var fs = 56;
    ctx.font = '700 ' + fs + 'px ' + Art.font;
    while (fs > 30 && ctx.measureText(b.text).width > 780) { fs -= 2; ctx.font = '700 ' + fs + 'px ' + Art.font; }
    var ty = b.sub ? -14 : 0;
    ctx.lineWidth = 8; ctx.strokeStyle = '#2a1060'; ctx.lineJoin = 'round';
    ctx.strokeText(b.text, 0, ty);
    ctx.fillStyle = b.color; ctx.fillText(b.text, 0, ty);
    if (b.sub) {
      var ss = 24; ctx.font = '500 ' + ss + 'px ' + Art.font;
      while (ss > 16 && ctx.measureText(b.sub).width > 780) { ss--; ctx.font = '500 ' + ss + 'px ' + Art.font; }
      ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, 36);
    }
    ctx.restore();
  }

  function drawConfetti() {
    for (var i = 0; i < confetti.length; i++) {
      var c = confetti[i];
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -c.h / 2 * Math.abs(Math.cos(c.a * 2)), c.w, c.h * Math.abs(Math.cos(c.a * 2)) + 1);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------- HUD */
  var avatarCache = {};
  function avatarImg(id, mood) {
    var key = id + (mood || '') + '@' + K.toFixed(2);
    if (avatarCache[key]) return avatarCache[key];
    var c = document.createElement('canvas'), s = Math.ceil(84 * K);
    c.width = s; c.height = s;
    var g = c.getContext('2d'); g.scale(s / 84, s / 84);
    Art.drawAvatar(g, 42, 42, 40, id, mood);
    avatarCache[key] = c;
    return c;
  }

  function drawHUD() {
    if (G.kind === 'trick') drawTrickHUD();
    else { drawCard(0, 170, 14, false); drawCard(1, 690, 14, true); drawVS(); drawSay(); }
    drawPowerBar();
    drawSpin();
    drawTips();
  }

  function drawCard(i, x, y, mirror) {
    var w = 420, h = 104, active = G.turn === i && G.phase !== 'over';
    var pl = G.players[i];
    ctx.save();
    var bob = active ? Math.sin(time * 4) * 2 : 0;
    ctx.translate(0, bob);
    ctx.globalAlpha = active ? 1 : 0.72;
    if (active) { ctx.shadowColor = i === 0 ? '#5fe0ff' : '#ff8cc6'; ctx.shadowBlur = 22; }
    ctx.fillStyle = active ? 'rgba(40,26,110,0.95)' : 'rgba(20,14,50,0.85)';
    Art.rr(ctx, x, y, w, h, 22); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4; ctx.strokeStyle = active ? (i === 0 ? '#5fe0ff' : '#ff8cc6') : 'rgba(255,255,255,0.15)';
    Art.rr(ctx, x, y, w, h, 22); ctx.stroke();
    var ax = mirror ? x + w - 54 : x + 54;
    var mood = G.phase === 'over' ? (G.winner === i ? '' : 'sad') : '';
    ctx.drawImage(avatarImg(pl.avatar, mood), ax - 42, y + 10, 84, 84);
    var tx = mirror ? x + w - 108 : x + 108;
    ctx.textAlign = mirror ? 'right' : 'left'; ctx.textBaseline = 'middle';
    ctx.font = '700 26px ' + Art.font; ctx.fillStyle = '#fff';
    ctx.fillText(pl.name, tx, y + 30);
    // group chip
    var g = G.groups[i];
    var label = g === 'solid' ? 'السادة' : g === 'stripe' ? 'المخطّطة' : 'لم تُحدَّد بعد';
    ctx.font = '700 15px ' + Art.font;
    var tw = ctx.measureText(label).width + 18;
    var cx = mirror ? tx - tw : tx;
    ctx.fillStyle = g ? (g === 'solid' ? '#ffd21f' : '#fff') : 'rgba(255,255,255,0.25)';
    Art.rr(ctx, cx, y + 45, tw, 20, 10); ctx.fill();
    ctx.fillStyle = g ? '#2a1a00' : '#fff'; ctx.textAlign = 'center';
    ctx.fillText(label, cx + tw / 2, y + 55.5);
    // balls row
    var list = g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : g === 'stripe' ? [9, 10, 11, 12, 13, 14, 15] : null;
    for (var k = 0; k < 8; k++) {
      var bx = mirror ? tx - 12 - k * 30 : tx + 12 + k * 30, by = y + 84;
      if (k === 7) {
        var onEight = list && Rules.remaining(G.st, g) === 0;
        Art.drawMiniBall(ctx, bx, by, 11, 8, onEight ? 1 : 0.25);
        if (onEight && active) { ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by, 14 + Math.sin(time * 8) * 1.5, 0, 6.283); ctx.stroke(); }
        continue;
      }
      if (!list) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(bx, by, 11, 0, 6.283); ctx.fill();
        continue;
      }
      var n = list[k], bb = P.ball(G.st, n), down = !bb.on;
      if (down) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, 10, 0, 6.283); ctx.stroke();
        ctx.fillStyle = '#3ddc84'; ctx.font = '700 14px ' + Art.font; ctx.fillText('✓', bx, by + 1);
      } else Art.drawMiniBall(ctx, bx, by, 11, n, 1);
    }
    ctx.restore();
  }

  function drawSay() {
    if (!G.say || G.say.t < 0) return;
    var t = G.say.t, k = Math.min(1, t / 0.18), out = t > 2.1 ? (t - 2.1) / 0.3 : 0;
    var s = (0.6 + 0.4 * k) * (1 - out * 0.2);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(1030, 126); ctx.scale(s, s);
    ctx.font = '700 20px ' + Art.font;
    var w = ctx.measureText(G.say.text).width + 30;
    ctx.fillStyle = '#fff';
    Art.rr(ctx, -w + 30, 0, w, 40, 20); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(14, -12); ctx.lineTo(22, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1060'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(G.say.text, -w / 2 + 30, 21);
    ctx.restore();
  }

  function drawVS() {
    var status = '';
    var pl = G.players[G.turn];
    if (G.phase === 'cpu') status = G.cpu.stage === 'think' ? 'يفكّر' + '...'.substr(0, 1 + ((time * 3) | 0) % 3) : 'يصوّب...';
    else if (G.phase === 'aim') status = G.inHand ? 'الكرة بيدك' : (G.kind === 'cpu' ? 'دورك' : 'اضرب!');
    else if (G.phase === 'rolling' || G.phase === 'strike') status = '';
    ctx.save();
    ctx.translate(640, 58);
    ctx.fillStyle = '#ffe45c'; ctx.strokeStyle = '#2a1060'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.font = '700 34px ' + Art.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText('ضد', 0, -12); ctx.fillText('ضد', 0, -12);
    // turn arrow
    var dir = G.turn === 0 ? -1 : 1;
    if (G.phase !== 'over') {
      ctx.fillStyle = G.turn === 0 ? '#5fe0ff' : '#ff8cc6';
      var ax = dir * (30 + Math.sin(time * 6) * 4);
      ctx.beginPath(); ctx.moveTo(ax + dir * 14, 22); ctx.lineTo(ax, 12); ctx.lineTo(ax, 32); ctx.closePath(); ctx.fill();
    }
    if (status) { ctx.font = '700 15px ' + Art.font; ctx.fillStyle = '#fff'; ctx.fillText(status, 0, 50); }
    ctx.restore();
  }

  function drawTrickHUD() {
    // Arabic reads right-to-left: level title, name and hint sit on the right,
    // shots / tries / target balls on the left.
    var x = 170, y = 14, w = 940, h = 104, RX = x + w - 24;
    ctx.save();
    ctx.fillStyle = '#1e1450'; Art.rr(ctx, x, y, w, h, 22); ctx.fill();
    ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 4; Art.rr(ctx, x, y, w, h, 22); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillStyle = '#5fe0ff'; ctx.font = '700 20px ' + Art.font;
    ctx.fillText('التحدي ' + ltr((G.level + 1) + '/' + LV.length), RX, y + 24);
    ctx.fillStyle = '#fff'; ctx.font = '700 32px ' + Art.font;
    ctx.fillText(G.lv.name, RX, y + 56);
    var hf = 18;
    ctx.font = '500 ' + hf + 'px ' + Art.font;
    while (ctx.measureText(G.lv.hint).width > 560 && hf > 12) { hf--; ctx.font = '500 ' + hf + 'px ' + Art.font; }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(G.lv.hint, RX, y + 87);
    // left side: shots and tries
    ctx.textAlign = 'left';
    ctx.font = '700 15px ' + Art.font; ctx.fillStyle = '#ffe45c';
    ctx.fillText('الضربات المتبقية', x + 24, y + 22);
    var left = G.lv.shots - G.prog.shotsUsed;
    for (var i = 0; i < G.lv.shots; i++) {
      var cx = x + 33 + i * 24;
      ctx.fillStyle = i < left ? '#fff' : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(cx, y + 48, 8.5, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.font = '700 16px ' + Art.font;
    ctx.fillText('المحاولة ' + G.attempts, x + 24, y + 80);
    var tw = ctx.measureText('المحاولة ' + G.attempts).width;
    var nst = G.attempts === 1 ? 3 : G.attempts <= 3 ? 2 : 1;
    ctx.fillStyle = '#ffd21f';
    ctx.fillText('\u2605'.repeat(nst), x + 24 + tw + 10, y + 80);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('\u2605'.repeat(3 - nst), x + 24 + tw + 10 + ctx.measureText('\u2605'.repeat(nst)).width, y + 80);
    // target balls
    ctx.textAlign = 'center';
    var nT = G.lv.targets.length, tL = x + 232;
    for (var t = 0; t < nT; t++) {
      var n = G.lv.targets[t], b = P.ball(G.st, n);
      var tx = tL + t * 30;
      Art.drawMiniBall(ctx, tx, y + 50, 12, n, b && b.on ? 1 : 0.25);
      if (b && !b.on) { ctx.fillStyle = '#3ddc84'; ctx.font = '700 18px ' + Art.font; ctx.fillText('\u2713', tx, y + 51); }
    }
    ctx.font = '700 15px ' + Art.font; ctx.fillStyle = '#ffe45c';
    ctx.fillText(G.lv.eightLast ? 'أدخلها، والـ8 أخيرًا' : 'أدخل هذه', tL + (nT - 1) * 15, y + 22);
    if (G.lv.avoid) {
      var ax = tL + (nT - 1) * 30 + 104;
      Art.drawMiniBall(ctx, ax, y + 50, 12, G.lv.avoid[0], 1);
      ctx.strokeStyle = '#ff4d5a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax - 12, y + 38); ctx.lineTo(ax + 12, y + 62); ctx.stroke();
      ctx.fillStyle = '#ff8a8a'; ctx.fillText('ليس هذه!', ax, y + 22);
    }
    ctx.restore();
  }

  function drawPowerBar() {
    var human = !G.players[G.turn].cpu;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 18px ' + Art.font; ctx.fillStyle = '#fff';
    ctx.fillText('القوة', BAR.x + BAR.w / 2, BAR.y - 26);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; Art.rr(ctx, BAR.x - 6, BAR.y - 6, BAR.w + 12, BAR.h + 12, 18); ctx.fill();
    ctx.fillStyle = '#1a1238'; Art.rr(ctx, BAR.x, BAR.y, BAR.w, BAR.h, 14); ctx.fill();
    var p = G.power;
    if (p > 0) {
      var fh = BAR.h * p;
      var gr = ctx.createLinearGradient(0, BAR.y + BAR.h, 0, BAR.y);
      gr.addColorStop(0, '#3ddc84'); gr.addColorStop(0.55, '#ffe45c'); gr.addColorStop(1, '#ff3b5c');
      ctx.fillStyle = gr;
      ctx.save(); Art.rr(ctx, BAR.x, BAR.y, BAR.w, BAR.h, 14); ctx.clip();
      ctx.fillRect(BAR.x, BAR.y + BAR.h - fh, BAR.w, fh);
      ctx.restore();
      ctx.font = '700 20px ' + Art.font; ctx.fillStyle = '#fff';
      ctx.fillText(Math.round(p * 100) + '%', BAR.x + BAR.w / 2, BAR.y + BAR.h + 26);
    } else if (human && G.phase === 'aim') {
      ctx.font = '500 13px ' + Art.font; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('اسحب', BAR.x + BAR.w / 2, BAR.y + BAR.h + 22);
      ctx.fillText('للأسفل', BAR.x + BAR.w / 2, BAR.y + BAR.h + 40);
    }
    // ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
    for (var i = 1; i < 10; i++) { var yy = BAR.y + BAR.h * i / 10; ctx.beginPath(); ctx.moveTo(BAR.x + 6, yy); ctx.lineTo(BAR.x + 14, yy); ctx.stroke(); }
    ctx.restore();
  }

  function drawSpin() {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 18px ' + Art.font; ctx.fillStyle = '#fff';
    ctx.fillText('الدوران', SPIN.x, SPIN.y - SPIN.r - 22);
    var g = ctx.createRadialGradient(SPIN.x - 16, SPIN.y - 18, 4, SPIN.x, SPIN.y, SPIN.r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#eeeae0'); g.addColorStop(1, '#b8b2a4');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(SPIN.x, SPIN.y, SPIN.r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(SPIN.x - SPIN.r, SPIN.y); ctx.lineTo(SPIN.x + SPIN.r, SPIN.y); ctx.moveTo(SPIN.x, SPIN.y - SPIN.r); ctx.lineTo(SPIN.x, SPIN.y + SPIN.r); ctx.stroke();
    var dx = SPIN.x + G.spinX * SPIN.r * 0.78, dy = SPIN.y - G.spinY * SPIN.r * 0.78;
    ctx.fillStyle = '#ff2d3a'; ctx.beginPath(); ctx.arc(dx, dy, 9, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    var lab = [];
    if (G.spinY > 0.2) lab.push('للأمام'); else if (G.spinY < -0.2) lab.push('للخلف');
    if (G.spinX > 0.2) lab.push('يمين'); else if (G.spinX < -0.2) lab.push('يسار');
    ctx.font = '500 14px ' + Art.font; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(lab.length ? lab.join(' + ') : 'انقر لتختار', SPIN.x, SPIN.y + SPIN.r + 20);
    ctx.restore();
  }

  function drawTips() {
    if (G.phase !== 'aim' || G.players[G.turn].cpu) return;
    var tip = '';
    if (G.isBreak && save.shots < 3 && !G.drag) tip = 'صوّب نحو الكرات، ثم انقر واسحب للخلف واترك!';
    else if (G.inHand && !G.drag) tip = G.kitchen ? 'يمكنك سحب الكرة البيضاء (يسار الخط)' : 'الكرة بيدك! اسحب البيضاء إلى أي مكان';
    else if (save.shots < 4 && !G.drag) tip = 'انقر واسحب للخلف، ثم اترك لتضرب!';
    else if (G.drag && G.drag.type === 'shot' && save.shots < 6) tip = 'اترك لتضرب (النقرة اليمنى تلغي)';
    if (!tip) return;
    ctx.save();
    ctx.font = '700 20px ' + Art.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(tip).width + 36;
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 4);
    ctx.fillStyle = 'rgba(15,8,40,0.8)'; Art.rr(ctx, P.CX - w / 2, 136, w, 34, 17); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(tip, P.CX, 153);
    ctx.restore();
  }

  /* =============================================================== screens (DOM) */
  var SCREENS = ['scr-title', 'scr-levels', 'scr-shop', 'scr-pause', 'scr-over', 'scr-done'];
  function show(name) {
    screen = name;
    SCREENS.forEach(function (id) { $(id).hidden = id !== 'scr-' + name; });
    $('pauseBtn').hidden = name !== 'game';
    ptrArmed = false;
    Kit.keys.endFrame();   // a key that switched screens must not also act on the new screen
    canvas.style.cursor = name === 'game' ? 'crosshair' : 'default';
    if ((name === 'title' || name === 'levels' || name === 'shop') && (!G || G.kind !== 'demo')) newMatch('demo');
    if (name === 'title') refreshTitle();
    if (name === 'levels') refreshLevels();
    if (name === 'shop') refreshShop();
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  // prevent buttons from keeping focus (so Enter/Space never double-fire)
  ui.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('button')) e.preventDefault(); });
  function on(id, fn) {
    $(id).addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); SFX.click(); fn(e); });
  }

  // ---- title
  function buildOpps() {
    var box = $('opps'); box.innerHTML = '';
    OPPS.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'opp' + (save.opp === o.id ? ' sel' : '');
      b.type = 'button';
      var c = document.createElement('canvas'); c.width = 208; c.height = 208;
      var g = c.getContext('2d'); g.scale(2.6, 2.6); Art.drawAvatar(g, 40, 40, 38, o.avatar);
      b.appendChild(c);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = o.name; b.appendChild(nm);
      var lv = document.createElement('div'); lv.className = 'lv'; lv.textContent = o.label; lv.style.background = o.color; b.appendChild(lv);
      var rec = document.createElement('div'); rec.className = 'rec';
      var w = save.wins[o.id] || 0, l = save.losses[o.id] || 0;
      if (w || l) rec.textContent = 'فوز ' + w + '  •  خسارة ' + l;
      else rec.innerHTML = 'الجائزة: <span dir="ltr">+' + o.reward + '</span> عملة';
      b.appendChild(rec);
      if (w) {
        var t = document.createElement('div'); t.className = 'trophy';
        t.innerHTML = '<svg viewBox="0 0 40 40"><path d="M11 5h18v6a9 9 0 0 1-18 0z" fill="#ffd21f" stroke="#a86e00" stroke-width="2"/><path d="M11 8H5a6 6 0 0 0 7 7M29 8h6a6 6 0 0 1-7 7" fill="none" stroke="#a86e00" stroke-width="2.5"/><rect x="17" y="19" width="6" height="8" fill="#ffd21f" stroke="#a86e00" stroke-width="2"/><rect x="11" y="27" width="18" height="6" rx="2" fill="#ffd21f" stroke="#a86e00" stroke-width="2"/></svg>';
        b.appendChild(t);
      }
      b.addEventListener('click', function (e) {
        e.stopPropagation(); Kit.audio.unlock();
        if (save.opp === o.id) { startCpu(); return; }
        save.opp = o.id; store.set('opp', o.id); SFX.click(); buildOpps(); updatePlayLabel();
      });
      box.appendChild(b);
    });
  }
  function updatePlayLabel() { $('btnPlay').innerHTML = '&#9654; العب ضد ' + oppById(save.opp).short; }
  function refreshTitle() {
    buildOpps(); updatePlayLabel();
    var cs = document.querySelectorAll('.coins'); for (var i = 0; i < cs.length; i++) cs[i].textContent = Kit.fmt(save.coins);
    $('streakTxt').textContent = 'أفضل سلسلة فوز: ' + save.bestStreak;
    $('trickStars').innerHTML = '<span dir="ltr">★ ' + starTotal() + '/' + (LV.length * 3) + '</span>';
    aimLabels();
  }
  function aimLabels() { $('btnAim').textContent = 'خط التصويب: ' + (save.aim === 'big' ? 'طويل' : 'قصير (محترف)'); $('pAim').textContent = $('btnAim').textContent; }
  function toggleAim() { save.aim = save.aim === 'big' ? 'pro' : 'big'; store.set('aim', save.aim); aimLabels(); }

  function startCpu() { newMatch('cpu', save.opp); show('game'); }
  on('btnPlay', startCpu);
  on('btn2p', function () { newMatch('pvp'); show('game'); });
  on('btnTrick', function () { show('levels'); });
  on('btnShop', function () { show('shop'); });
  on('btnAim', toggleAim);

  // ---- levels
  var STAR_SVG = function (on) {
    return '<svg viewBox="0 0 40 40"' + (on ? ' class="on"' : '') + '><path d="M20 3l5 11 12 1.5-9 8.2 2.6 11.8L20 29.6 9.4 35.5 12 23.7 3 15.5 15 14z" fill="' + (on ? '#ffd21f' : 'rgba(255,255,255,0.18)') + '" stroke="' + (on ? '#b37400' : 'rgba(255,255,255,0.25)') + '" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  };
  var LOCK_SVG = '<svg viewBox="0 0 40 40" width="46" height="46"><rect x="8" y="17" width="24" height="18" rx="4" fill="#9a8fd0"/><path d="M13 17v-5a7 7 0 0 1 14 0v5" fill="none" stroke="#9a8fd0" stroke-width="4"/><circle cx="20" cy="26" r="3" fill="#241d44"/></svg>';
  function unlockedLevel(i) { return i === 0 || (save.stars[i - 1] || 0) > 0; }
  function refreshLevels() {
    var g = $('lvgrid'); g.innerHTML = '';
    LV.forEach(function (lv, i) {
      var b = document.createElement('button'); b.type = 'button';
      var un = unlockedLevel(i);
      b.className = 'lvl' + (un ? '' : ' locked');
      if (un) {
        var s = save.stars[i] || 0;
        b.innerHTML = '<div class="num">' + (i + 1) + '</div><div class="ln">' + lv.name + '</div><div class="st">' + STAR_SVG(s > 0) + STAR_SVG(s > 1) + STAR_SVG(s > 2) + '</div>';
        b.addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); SFX.click(); newTrick(i); show('game'); });
      } else {
        b.innerHTML = LOCK_SVG + '<div class="ln">' + lv.name + '</div>';
        b.addEventListener('click', function (e) { e.stopPropagation(); SFX.nope(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); });
      }
      g.appendChild(b);
    });
    $('lvStars').textContent = starTotal() + '/' + (LV.length * 3);
  }
  on('lvBack', function () { show('title'); });

  // ---- shop
  function trophyOk(item) {
    if (item.trophy === 'hard') return (save.wins.hard || 0) > 0;
    if (item.trophy === 'stars') return starTotal() >= LV.length * 3;
    return false;
  }
  function refreshShop() {
    var cs = document.querySelectorAll('.coins'); for (var i = 0; i < cs.length; i++) cs[i].textContent = Kit.fmt(save.coins);
    buildShopRow('shopCues', Art.CUES, 'cues', 'cue');
    buildShopRow('shopFelts', Art.FELTS, 'felts', 'felt');
  }
  function buildShopRow(boxId, items, ownKey, eqKey) {
    var box = $(boxId); box.innerHTML = '';
    items.forEach(function (it) {
      var owned = save.owned[ownKey].indexOf(it.id) >= 0 || (it.trophy && trophyOk(it));
      var eq = save[eqKey] === it.id;
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'item' + (eq ? ' eq' : '') + (!owned && !it.trophy && save.coins < it.price ? ' poor' : '');
      var c = document.createElement('canvas'); c.width = 268; c.height = 184;
      var g = c.getContext('2d'); g.scale(2, 2);
      if (ownKey === 'cues') {
        g.save(); g.translate(22, 76); g.rotate(-0.5); g.scale(0.29, 0.29);
        Art.drawCue(g, 0, 0, Math.PI, 0, it.id, 1); g.restore();
        Art.drawMiniBall(g, 12, 81, 8, 0);
      }
      else {
        g.fillStyle = '#8a4519'; Art.rr(g, 4, 6, 126, 82, 12); g.fill();
        g.fillStyle = it.bed; Art.rr(g, 14, 16, 106, 62, 6); g.fill();
        if (it.stars) { g.fillStyle = '#fff'; for (var s = 0; s < 18; s++) g.fillRect(16 + (s * 37 % 100), 18 + (s * 23 % 56), 1.5, 1.5); }
        g.fillStyle = '#000'; [[14, 16], [67, 14], [120, 16], [14, 78], [67, 80], [120, 78]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 5, 0, 6.283); g.fill(); });
        Art.drawMiniBall(g, 50, 46, 7, 0); Art.drawMiniBall(g, 82, 40, 7, 3); Art.drawMiniBall(g, 90, 52, 7, 11);
      }
      b.appendChild(c);
      var nm = document.createElement('div'); nm.className = 'in'; nm.textContent = it.name; b.appendChild(nm);
      var pr = document.createElement('div');
      if (eq) { pr.className = 'pr eqd'; pr.textContent = 'مُختار ✓'; }
      else if (owned) { pr.className = 'pr own'; pr.textContent = 'استخدم'; }
      else if (it.trophy) { pr.className = 'pr lock'; pr.textContent = it.trophy === 'hard' ? 'اهزم زعنون!' : 'اجمع 30 ★'; }
      else { pr.className = 'pr'; pr.innerHTML = '<span class="coin" style="width:18px;height:18px"></span>' + it.price; }
      b.appendChild(pr);
      b.addEventListener('click', function (e) {
        e.stopPropagation(); Kit.audio.unlock();
        if (eq) return;
        if (owned) { save[eqKey] = it.id; SFX.click(); }
        else if (it.trophy) { SFX.nope(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        else if (save.coins >= it.price) {
          save.coins -= it.price; save.owned[ownKey].push(it.id); save[eqKey] = it.id; SFX.buy();
        } else { SFX.nope(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        persist();
        if (eqKey === 'felt') needTable = true;
        refreshShop();
      });
      box.appendChild(b);
    });
  }
  on('shopBack', function () { show('title'); });

  // ---- pause
  function pause() { if (screen !== 'game') return; show('pause'); G.drag = null; G.power = G.phase === 'aim' ? 0 : G.power; }
  function resume() { show('game'); }
  function restart() {
    if (!G) return;
    if (G.kind === 'trick') { newTrick(G.level); }
    else newMatch(G.kind, G.opp ? G.opp.id : null);
    show('game');
  }
  function toMenu() { G = null; show('title'); }
  on('pResume', resume); on('pRestart', restart); on('pMenu', toMenu); on('pAim', toggleAim);
  $('pauseBtn').addEventListener('click', function (e) { e.stopPropagation(); pause(); });
  $('pauseBtn').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  $('pauseBtn').addEventListener('mousedown', function (e) { e.preventDefault(); });

  // ---- match over
  function showOver() {
    var humanWon = G.kind === 'pvp' || !G.players[G.winner].cpu;
    var t = $('oTitle');
    var win = G.players[G.winner];
    if (G.kind === 'cpu') {
      t.textContent = humanWon ? 'فزت!' : winTxt(win);
      t.className = humanWon ? '' : 'lose';
      var left = G.groups[0] ? Rules.remaining(G.st, G.groups[0]) : 7;
      $('oSub').textContent = humanWon ? (G.opp.id === 'hard' ? 'تفوّقت على القرش نفسه!' : 'هزمت ' + G.opp.name + '!') :
        (G.loseReason ? G.loseReason + ' ' : '') + (left <= 2 ? 'كدت تفوز! مباراة أخرى؟' : 'ستفوز في المرة القادمة!');
    } else {
      t.textContent = winTxt(win); t.className = '';
      $('oSub').textContent = G.loseReason ? G.loseReason : 'يا لها من مباراة!';
    }
    var c = $('oAvatar'), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 240, 240); g.scale(3, 3);
    Art.drawAvatar(g, 40, 40, 38, G.kind === 'cpu' && !humanWon ? win.avatar : win.avatar, humanWon ? 'wow' : '');
    $('oEarn').innerHTML = '<span class="coin"></span> <bdi dir="ltr">+' + G.coinsEarned + '</bdi> عملة';
    $('oBadges').innerHTML = (G.badges || []).map(function (b) { return '<div class="badge">' + b + '</div>'; }).join('');
    show('over');
  }
  on('oAgain', restart); on('oMenu', toMenu);

  // ---- trick done
  function showDone() {
    var s = G.newStars;
    $('dTitle').textContent = s === 3 ? 'ممتاز!' : 'أنجزت التحدي!';
    $('dStars').innerHTML = STAR_SVG(s > 0) + STAR_SVG(s > 1) + STAR_SVG(s > 2);
    var svgs = $('dStars').querySelectorAll('svg');
    for (var i = 0; i < svgs.length; i++) svgs[i].style.animationDelay = (i * 0.25) + 's';
    for (i = 0; i < s; i++) (function (k) { setTimeout(function () { SFX.star(k); }, 250 * k + 100); })(i);
    $('dSub').textContent = G.attempts === 1 ? 'من أول محاولة! مذهل!' : 'أنجزته في ' + (G.attempts === 2 ? 'محاولتين' : G.attempts + (G.attempts <= 10 ? ' محاولات' : ' محاولة')) + '.' + (s < 3 ? ' أعده من أول محاولة لتربح 3 نجوم!' : '');
    $('dEarn').innerHTML = G.coinsEarned ? '<span class="coin"></span> <bdi dir="ltr">+' + G.coinsEarned + '</bdi> عملة' : '';
    $('dBadges').innerHTML = (G.badges || []).map(function (b) { return '<div class="badge">' + b + '</div>'; }).join('');
    $('dNext').style.display = G.level < LV.length - 1 ? '' : 'none';
    show('done');
  }
  function nextLevel() { if (G.level < LV.length - 1) { newTrick(G.level + 1); show('game'); } else { G = null; show('levels'); } }
  on('dNext', nextLevel); on('dRetry', restart); on('dLevels', function () { G = null; show('levels'); });

  // ---- keyboard for screens
  function handleScreenKeys() {
    var k = Kit.keys;
    if (screen === 'title') {
      if (k.pressed('Enter') || k.pressed('Space')) startCpu();
      else if (k.pressed('ArrowLeft') || k.pressed('ArrowRight')) {
        var i = OPPS.indexOf(oppById(save.opp)) + (k.pressed('ArrowLeft') ? 1 : -1);
        save.opp = OPPS[(i + OPPS.length) % OPPS.length].id; store.set('opp', save.opp); SFX.click(); buildOpps(); updatePlayLabel();
      }
    } else if (screen === 'game') {
      if (k.pressed('KeyP') || k.pressed('Escape')) pause();
      else if (k.pressed('KeyR') && G && G.kind === 'trick' && (G.phase === 'aim' || G.phase === 'fail' || G.phase === 'rolling')) { G.attempts++; resetTrick(false); }
    } else if (screen === 'pause') {
      if (k.pressed('KeyP') || k.pressed('Escape')) resume();
      else if (k.pressed('KeyR')) restart();
    } else if (screen === 'over') {
      if (k.pressed('Enter') || k.pressed('Space') || k.pressed('KeyR')) restart();
      else if (k.pressed('Escape')) toMenu();
    } else if (screen === 'done') {
      if (k.pressed('Enter') || k.pressed('Space')) nextLevel();
      else if (k.pressed('KeyR')) restart();
      else if (k.pressed('Escape')) { G = null; show('levels'); }
    } else if (screen === 'levels' || screen === 'shop') {
      if (k.pressed('Escape')) show('title');
      else if (screen === 'levels' && (k.pressed('Enter') || k.pressed('Space'))) {
        var n = 0; while (n < LV.length - 1 && (save.stars[n] || 0) > 0) n++;
        if (!unlockedLevel(n)) n = 0;
        newTrick(n); show('game');
      }
    }
  }

  // hover cursor
  window.addEventListener('pointermove', function () {
    if (screen !== 'game' || !G) return;
    var cur = 'crosshair';
    if (G.phase === 'aim' && !G.players[G.turn].cpu) {
      if (G.drag && G.drag.type === 'ball') cur = 'grabbing';
      else if (G.hover) cur = 'grab';
      else if (inSpin(ptr.x, ptr.y) || inBar(ptr.x, ptr.y)) cur = 'pointer';
    } else cur = 'default';
    if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && screen === 'game') pause(); });

  /* =============================================================== debug hook */
  window.__game = {
    get screen() { return screen; },
    get phase() { return G && G.phase; },
    get kind() { return G && G.kind; },
    get turn() { return G && G.turn; },
    get groups() { return G && G.groups; },
    get inHand() { return G && G.inHand; },
    get power() { return G && G.power; },
    get aim() { return G && G.aim; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get level() { return G && G.level; },
    get attempts() { return G && G.attempts; },
    balls: function () { return G ? G.st.balls.filter(function (b) { return b.on; }).map(function (b) { return [b.n, Math.round(b.x), Math.round(b.y)]; }) : []; },
    // aim the human at the best makeable shot (for automated tests)
    autoAim: function () {
      if (!G || G.phase !== 'aim') return null;
      var cue = P.ball(G.st, 0);
      var c = AI.candidates(G.st, cue.x, cue.y, G.legal);
      if (!c.length) return null;
      G.aim = c[0].ang; lastPX = ptr.x; lastPY = ptr.y;
      return { ang: c[0].ang, speed: c[0].speed, power: powerFromSpeed(c[0].speed), n: c[0].n };
    },
    shoot: function (power, spinY) {
      if (!G || G.phase !== 'aim') return false;
      G.power = power; G.spinY = spinY || 0;
      strike(G.aim, speedFromPower(power), 0, G.spinY); return true;
    },
    setAim: function (a) { if (G) { G.aim = a; lastPX = ptr.x; lastPY = ptr.y; } },
    fast: function (on) { window.__fast = !!on; },
    win: function (p) { if (G && G.kind !== 'trick' && G.kind !== 'demo') finishMatch(p || 0, p ? 'دخلت الكرة 8 قبل وقتها!' : ''); else if (G && G.kind === 'trick') { G.attempts = 1; trickEnd({ pots: G.lv.targets.map(function (n) { var b = P.ball(G.st, n); b.on = false; return { n: n, pocket: (G.lv.pockets || [0])[0], cush: 1 }; }) }); } },
    skip: function () { if (G && G.kind === 'trick') { nextLevel(); } },
    trick: function (i) { newTrick(i); show('game'); },
    coins: function (n) { save.coins = n; persist(); },
    say: function (k) { say(k); if (G && G.say) G.say.t = 0; },
    banner: function (t, s) { banner(t, s, '#ff6b6b', 3); }
  };

  /* =============================================================== go */
  show('title');
  var perf = { upd: 0, ren: 0, n: 0 };
  window.__game.perf = perf;
  Kit.loop(function (dt) {
    var t0 = performance.now();
    if (window.__fast && G && G.phase === 'rolling') { for (var i = 0; i < 6; i++) update(dt); }
    else update(dt);
    perf.upd = perf.upd * 0.95 + (performance.now() - t0) * 0.05;
  }, function (a) {
    var t0 = performance.now();
    render(a);
    perf.ren = perf.ren * 0.95 + (performance.now() - t0) * 0.05; perf.n++;
  });
})();

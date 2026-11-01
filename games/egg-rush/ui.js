/* Screens, input, juice and the local save. The simulation lives in engine.js. */
(function () {
  'use strict';
  const ER = window.EggRush;
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ui = $('ui');
  let frameDirty = true;
  const mute = Kit.muteButton();
  function placeChrome(v) {
    ui.style.left = canvas.style.left;
    ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
    const rect = canvas.getBoundingClientRect();
    mute.style.top = Math.round(rect.top + 10) + 'px';
    mute.style.right = Math.round(window.innerWidth - rect.right + 10) + 'px';
    mute.style.left = 'auto';
    const hud = $('hud');
    if (hud) hud.style.paddingInlineStart = Math.ceil(130 / v.scale - 16) + 'px';
    frameDirty = true;
  }
  const view = Kit.fit(canvas, 1280, 720, { maxDpr: 1.5, onResize: placeChrome });
  const lastPop = [0, 0];
  ER.art.onArrive = function (who) {
    const i = who ? 1 : 0;
    const now = performance.now();
    if (now - lastPop[i] < 80) return;
    lastPop[i] = now;
    const pill = $(i ? 'p2coins' : 'coinPill');
    if (!pill) return;
    pill.classList.remove('pop');
    void pill.offsetWidth;
    pill.classList.add('pop');
  };
  function aimCoins() {
    const uiRect = ui.getBoundingClientRect();
    const s = view.scale || 1;
    function at(el, xf, yf) {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2) return null;
      return { x: (r.left + r.width * xf - uiRect.left) / s, y: (r.top + r.height * yf - uiRect.top) / s };
    }
    const coin = at($('coinPill'), 0.8, 0.34);
    if (coin) ER.art.hudCoin = coin;
    ER.art.hudCoin2 = at($('p2coins'), 0.5, 0.5) || ER.art.hudCoin;
  }
  const pointer = Kit.pointer(view);
  const shake = Kit.shake();
  const store = Kit.store('egg-rush');
  const saveStatus = Kit.saveStatus({ retry: function () { persist(true); } });

  const TUT = {
    egg: 'امشِ إلى البيضة',
    home: 'ارجع إلى البيت',
    hatch: 'انتظر الفقس',
    pad: 'اجمع العملات',
    again: 'بيضة أخرى... راقب الحارس',
    shop: 'اشترِ الحذاء'
  };
  const CALL = [
    'فرخ أصفر', 'بطة بيضاء', 'أرنب وردي', 'حمل أبيض', 'ضفدع أخضر', 'قنفذ بني',
    'سلحفاة خضراء', 'نجم ذهبي', 'دلفين أزرق', 'ببغاء أحمر', 'أخطبوط بنفسجي', 'سمكة زرقاء',
    'بطريق', 'فقمة', 'دب بني', 'ثعلب برتقالي', 'بومة', 'رنة',
    'جمل صغير', 'أفعى', 'عقرب', 'فنك', 'سحلية خضراء', 'صقر',
    'دونات', 'مارشميلو', 'كب كيك', 'مصاصة', 'غزل بنات', 'جيلي',
    'عصفور', 'فراشة', 'نحلة صفراء', 'هرة', 'تنين أخضر', 'قوس',
    'روبوت', 'صاروخ', 'نيزك', 'فضائي', 'كوكب', 'رائد'
  ];
  const SHIRT = ['#3d7dff', '#ff5a8a', '#3cbf6e', '#ffd23f', '#9b6bff', '#ff8a3d', '#3ec6ff'];
  const SHIRT_NAME = ['أزرق', 'وردي', 'أخضر', 'ذهبي', 'بنفسجي', 'برتقالي', 'سماوي'];
  const HAT_NAME = ['بدون', 'قبعة', 'شمس', 'صوف', 'زهرة', 'فيونكة', 'نجمة'];
  const GAD = { banana: 'موز', decoy: 'دمية', bubble: 'فقاعة' };
  const SHOP = [
    ['shoes', '👟', 'حذاء'],
    ['mill', '🏃', 'مشي'],
    ['pen', '🏡', 'حظيرة'],
    ['inc', '🥚', 'حاضنة'],
    ['hatch', '✨', 'أسرع'],
    ['banana', '🍌', 'موز'],
    ['decoy', '🧸', 'دمية'],
    ['bubble', '🫧', 'فقاعة']
  ];

  let screen = 'title';
  let world = null;
  let backdrop = null;
  let clock = 0;
  let showCoins = 0;
  let savedAt = 0;
  let dirty = false;
  let slow = 0;
  let zoom = 1;
  let flash = 0;
  let cardT = 0;
  let bannerT = 0;
  let wantGadget = false;
  let pointerUI = false;
  let tutDoneSent = false;
  let lastStep = 0;
  let time = 0;
  let cam = { x: 0, y: 0, z: 1 };
  let cardDelay = 0;
  let pendingCard = null;
  let streak = 0;
  let hatchHint = 0;
  let penCam = null;
  let hopWait = 0;
  let hopJob = null;
  let roundLeft = 180;
  let roundPets = [];
  let paradeT = 0;
  let replayMode = '1p';
  let hitStop = 0;
  let hitArmed = false;
  let ended = false;
  let chaseOn = false;
  let chaseX = 0;
  let chaseY = 0;

  function ymd() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function readRaw() {
    let text = null;
    try { text = localStorage.getItem('sg:egg-rush:save'); } catch (e) { return { raw: null, corrupt: false }; }
    if (!text) return { raw: null, corrupt: false };
    try {
      const parsed = JSON.parse(text);
      if (ER.readSave(parsed) !== true) return { raw: null, corrupt: true };
      return { raw: parsed, corrupt: false };
    } catch (e) { return { raw: null, corrupt: true }; }
  }
  function persist(force) {
    if (!world || world.mode !== '1p') return false;
    if (!force && clock - savedAt < 1500) { dirty = true; return false; }
    dirty = false;
    savedAt = clock;
    if (store.set('save', ER.exportSave(world)) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function modalOpen() {
    return !$('ovShop').hidden || !$('ovBook').hidden || !$('ovSet').hidden;
  }
  function closeModals() {
    $('ovShop').hidden = $('ovBook').hidden = $('ovSet').hidden = $('ovCard').hidden = true;
    cardT = 0;
  }
  function paintChrome() {
    $('ovTitle').hidden = screen !== 'title';
    $('ovPause').hidden = screen !== 'pause';
    $('ovResult').hidden = screen !== 'result';
    $('hud').hidden = screen === 'title' || screen === 'parade';
    applyHint();
    $('btnShop').hidden = $('btnBook').hidden = $('btnGear').hidden = !world || world.mode !== '1p';
    frameDirty = true;
  }
  function banner(text) {
    $('banner').hidden = false;
    $('banner').textContent = text;
    bannerT = 3.2;
  }
  function markTut() {
    if (tutDoneSent) return;
    tutDoneSent = true;
    Kit.stats.tutorial('done');
  }

  function makeWorld(mode) {
    const loaded = mode === '1p' ? readRaw() : { raw: null, corrupt: false };
    clock = Date.now();
    const w = ER.create({
      mode: mode,
      now: clock,
      date: ymd(),
      save: loaded.raw,
      seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0
    });
    if (mode !== '1p') { w.tut = 'done'; w.taught = true; }
    if (loaded.corrupt) w.notice = 'تعذّر قراءة الحفظ، بدأنا من جديد.';
    return w;
  }
  function start(mode) {
    closeModals();
    world = makeWorld(mode);
    screen = 'play';
    ER.art.clearFx();
    showCoins = world.mode === '1p' ? world.coins : 0;
    slow = 0; zoom = 1; flash = 0; lastStep = 0; cardDelay = 0; pendingCard = null; streak = 0; hatchHint = 0;
    penCam = null; hopWait = 0; hopJob = null;
    roundLeft = 180; roundPets = []; paradeT = 0; replayMode = mode === '2p' ? '2p' : '1p';
    hitStop = 0; hitArmed = false; ended = false; chaseOn = false;
    ER.art.onCeremonyEnd = null;
    if (mode === '1p') {
      Kit.stats.round('main');
      if (world.tut !== 'done') Kit.stats.tutorial('start');
      persist(true);
    } else Kit.stats.round('duel:pvp');
    paintChrome();
    if (world.notice) banner(world.notice);
    Kit.keys.reset();
    focusGame();
    paintHud();
  }
  function pause() {
    if (screen !== 'play' || !world) return;
    closeModals();
    screen = 'pause';
    if (world.mode === '1p') persist(true);
    paintChrome();
  }
  function resume() {
    if (screen !== 'pause') return;
    screen = 'play';
    Kit.keys.reset();
    focusGame();
    paintChrome();
  }
  function toTitle() {
    if (world && world.mode === '1p' && (screen === 'play' || screen === 'pause')) {
      persist(true);
      Kit.stats.end('end');
    }
    world = null;
    pendingCard = null; cardDelay = 0; penCam = null; hopWait = 0; hopJob = null;
    screen = 'title';
    closeModals();
    paintChrome();
    const loaded = readRaw();
    $('titleSub').textContent = loaded.corrupt
      ? 'تعذّر قراءة الحفظ، بدأنا من جديد.'
      : loaded.raw
        ? 'رصيدك ' + ER.fmt(loaded.raw.coins) + ' قطعة'
        : '';
  }

  function axis(K, neg, pos) {
    const n = K.anyDown(neg), p = K.anyDown(pos);
    if (n === p) return 0;
    return p ? 1 : -1;
  }
  function stick(K, neg, pos, grabCodes) {
    const held = K.anyDown(grabCodes);
    const edge = K.anyPressed(grabCodes);
    return { x: axis(K, neg[0], pos[0]), y: axis(K, neg[1], pos[1]), held: held, edge: edge };
  }
  function grabFlag(player, stickIn) {
    if (!player) return false;
    return player.egg ? stickIn.edge : stickIn.held;
  }
  function cameraOf(w) {
    const a = w.players[0], b = w.players[1];
    let z = w.mode === '2p' ? 1 : 1.62;
    if (w.mode === '2p' && b) {
      const span = Math.abs(a.x - b.x) + 12;
      z = Math.max(0.74, Math.min(1.15, 1280 / (span * 48)));
      const viewW = 1280 / (48 * z), viewH = 720 / (48 * z);
      let x = (a.x + b.x) / 2 - viewW * 0.5;
      x = Math.max(0, Math.min(Math.max(0, w.w - viewW), x));
      let y = (a.y + b.y) / 2 - viewH * 0.48;
      y = Math.max(0, Math.min(Math.max(0, 15 - viewH), y));
      return { x: x, y: y, z: z };
    }
    const viewW = 1280 / (48 * z), viewH = 720 / (48 * z);
    let focus = a.x, fy = a.y;
    if (a.egg) focus = a.x + (8.6 < a.x ? -1 : 1) * viewW * 0.2;
    else focus = a.x + (a.facing || 1) * viewW * 0.04;
    if (penCam && penCam.life > 0) {
      const k = Math.min(1, (penCam.max - penCam.life) / 0.5);
      focus += (penCam.x - focus) * k;
      fy += (penCam.y - fy) * k;
    }
    if (!chaseOn) { chaseX = focus; chaseY = fy; chaseOn = true; }
    const dead = viewW * 0.15;
    if (a.egg || Math.abs(focus - chaseX) > dead * 0.5) chaseX += (focus - chaseX) * 0.18;
    if (Math.abs(fy - chaseY) > viewH * 0.12) chaseY += (fy - chaseY) * 0.18;
    let x = chaseX - viewW * 0.5;
    x = Math.max(0, Math.min(Math.max(0, w.w - viewW), x));
    let y = chaseY - viewH * 0.48 + 1.35;
    y = Math.max(0, Math.min(Math.max(0, 15 - viewH), y));
    return { x: x, y: y, z: z };
  }
  function inputOf(K) {
    if (modalOpen()) return {};
    let p1, p2 = {};
    if (world.mode === '2p') {
      p1 = stick(K, [['KeyA'], ['KeyW']], [['KeyD'], ['KeyS']], ['KeyE']);
      const q = stick(K, [['ArrowLeft'], ['ArrowUp']], [['ArrowRight'], ['ArrowDown']], ['Slash']);
      p2 = {
        x: q.x, y: q.y,
        grab: grabFlag(world.players[1], q),
        gadget: K.anyPressed(['Period']),
        dash: K.anyPressed(['Enter', 'NumpadEnter'])
      };
    } else {
      p1 = stick(K, [['ArrowLeft', 'KeyA'], ['ArrowUp', 'KeyW']], [['ArrowRight', 'KeyD'], ['ArrowDown', 'KeyS']], ['Space', 'KeyE']);
    }
    const input = {
      x: p1.x, y: p1.y,
      grab: grabFlag(world.players[0], p1),
      gadget: wantGadget || (world.mode === '2p' ? K.pressed('KeyQ') : K.pressed('KeyQ')),
      dash: world.mode === '2p' && K.pressed('KeyF'),
      p2: p2
    };
    wantGadget = false;
    if (pointer.pressed && !pointerUI && screen === 'play') {
      const pt = ER.art.worldPoint(cam, pointer.x, pointer.y);
      const inc = incubatorAt(pt.x, pt.y);
      if (inc >= 0) {
        const slot = world.incs[inc];
        banner(slot ? 'تفقس بعد ' + Math.ceil(Math.max(0, (slot.end - world.now) / 1000)) + ' ث' : 'حاضنة فارغة');
      } else input.click = { x: pt.x, y: pt.y, p: 0 };
    }
    return input;
  }
  function incubatorAt(x, y) {
    if (!world || world.mode !== '1p') return -1;
    for (let i = 0; i < world.incs.length; i++) {
      if (Math.hypot(x - (2.2 + i * 2.3), y - 8.6) < 1.15) return i;
    }
    return -1;
  }

  function onEvent(e) {
    const A = ER.art, S = ER.sfx, calm = Kit.motion.reduced();
    function cheer() {
      const word = streak >= 10 ? 'خارق!' : streak >= 6 ? 'ممتاز!' : streak >= 3 ? 'رائع!' : '';
      if (!word || (streak !== 3 && streak !== 6 && streak !== 10)) return;
      const p = world.players[0];
      if (p) A.float(p.x, p.y - 1.7, word, '#ffd23f', 40);
      S.cheer();
    }
    if (e.t === 'grab') {
      streak += 1; cheer();
      Kit.track.hit();
      S.grab();
      const px = e.x != null ? e.x : (world.players[e.p] || world.players[0]).x;
      const py = e.y != null ? e.y : (world.players[e.p] || world.players[0]).y;
      if (!calm) A.grabPop = 0.42;
      A.confetti(px, py - 0.4, 12);
      A.sparkle(px, py - 0.5, 6);
      A.burst(px, py - 0.6, 8, ['#fff', '#ffd23f', '#ff8ad8'], 2.4);
      if (streak !== 3 && streak !== 6 && streak !== 10) A.float(px, py - 1.6, 'خذتها!', '#fff', 34);
      if (!calm) shake.add(3);
    }
    else if (e.t === 'boop') {
      streak = 0;
      Kit.track.miss();
      S.boop(); A.burst(e.x, e.y, 16, ['#fff', '#ffd23f', '#ff8a3d'], 3); A.float(e.x, e.y - 0.6, 'بوينغ!', '#fff');
      if (!calm) { shake.add(5); hitStop = Math.max(hitStop, 0.05); A.grabPop = 0.28; }
    } else if (e.t === 'spot') {
      Kit.track.cue();
      S.alert();
      if (!calm) { slow = 0.2; zoom = 1.06; shake.add(3); }
    } else if (e.t === 'collect') {
      streak += 1; cheer();
      S.coin();
      A.flyCoins(e.x, e.y, calm ? 4 : 8);
      A.coins(e.x, e.y, 4);
      A.float(e.x, e.y - 0.4, '+' + ER.fmt(e.n), '#ffd23f');
      persist(false);
    } else if (e.t === 'hatch') {
      const rare = e.s >= 2;
      const wobble = calm ? 0.65 : (rare ? 1.5 : 1.1);
      const dur = calm ? 1.45 : (rare ? 2.3 : 2.15);
      if (e.s >= 4) S.legend(); else S.hatch();
      S.riser(wobble, rare);
      Kit.stats.busy();
      A.startCeremony({ b: e.b, s: e.s, v: e.v, neu: e.neu, name: petCall(e), calm: calm, wobble: wobble, dur: dur });
      hitArmed = !calm;
      roundPets.push({ b: e.b, s: e.s, v: e.v, neu: !!e.neu });
      paintPetBar(true);
      const born = { b: e.b, s: e.s, v: e.v };
      A.onCeremonyEnd = function () { A.follow = { b: born.b, s: born.s, v: born.v, life: 6 }; paintPetBar(true); };
      hatchHint = dur + 0.5;
      const who = world.players[0];
      const pad = e.pad >= 0 ? world.pads[e.pad] : null;
      if (!pad) { pendingCard = e; cardDelay = dur + 0.15; }
      else if (!calm) {
        hopJob = {
          b: e.b, s: e.s, v: e.v, pad: e.pad,
          x: who ? who.x : 4, y: who ? who.y - 0.4 : 8,
          tx: pad.x, ty: pad.y
        };
        hopWait = dur + 0.05;
        A.hopPad = e.pad;
      }
      persist(true);
    } else if (e.t === 'buy') { S.buy(); persist(true); if (!$('ovShop').hidden) paintShop(); }
    else if (e.t === 'gate') { S.gate(); A.float(e.x, e.y - 0.8, 'تحتاج سرعة ' + e.need, '#fff'); if (!calm) shake.add(2); }
    else if (e.t === 'open') {
      S.open();
      wearNew(e.biome);
      banner('انفتحت بوابة ' + e.name + '! ملابس جديدة');
      const kid = world.players[0];
      A.float(kid ? kid.x : e.x, kid ? kid.y - 1.9 : e.y - 1.4, 'ملابس جديدة!', '#ffd23f', 36);
      A.confetti(e.x, e.y, 14);
      A.sparkle(kid ? kid.x : e.x, (kid ? kid.y : e.y) - 1.1, 10);
      if (!calm) { A.party = { biome: e.biome, life: 4 }; shake.add(3); }
    }
    else if (e.t === 'safe') {
      A.homeGlow = calm ? 1.1 : 1.9;
      S.cheer();
      A.float(8.6, 9.55, 'وصلت!', '#fff6c2', 40);
      A.sparkle(8.6, 10.7, 8);
      A.burst(8.6, 10.9, 8, ['#ffe14a', '#fff', '#ffd23f'], 2);
      if (!calm) shake.add(2);
    }
    else if (e.t === 'xp') { S.xp(); A.float(e.x, e.y, '+' + e.n, '#7ec8ff'); }
    else if (e.t === 'fox') { S.fox(); A.float(e.x, e.y, '+' + e.n, '#ffd23f'); banner('أفزعت الثعلب!'); persist(true); }
    else if (e.t === 'stolen') { S.fox(); banner('الثعلب استعارت ' + e.name + '. الحق بها في الوكر!'); persist(true); }
    else if (e.t === 'den') { S.hatch(); banner('رجع ' + e.name + ' إلى البيت'); persist(true); }
    else if (e.t === 'full') banner('الحاضنة ممتلئة!');
    else if (e.t === 'shop') openShop();
    else if (e.t === 'bump') { S.bump(); if (!calm) shake.add(5); A.float(e.x, e.y, '!', '#fff'); }
    else if (e.t === 'slip') S.slip();
    else if (e.t === 'popshield') { S.boop(); A.float(e.x, e.y, 'فقاعة!', '#8fd8ff'); }
    else if (e.t === 'bank' && world.mode === '2p') { S.coin(); A.flyCoins(e.x, e.y, 6, e.p === 1 ? 1 : 0); A.float(e.x, e.y, '+' + e.n, '#ffd23f'); }
    else if (e.t === 'bank') {
      S.cascade();
      A.flyCoins(e.x != null ? e.x : 6, e.y != null ? e.y : 8, calm ? 8 : 16);
      A.float(e.x != null ? e.x : 6, (e.y != null ? e.y : 8) - 0.7, '+' + ER.fmt(e.n || 0), '#ffd23f', 42);
      A.burst(2.2 + (e.slot || 0) * 2.3, 8.2, 10, ['#fff', '#ffd23f'], 2);
      if (!calm) shake.add(2);
      persist(true);
    }
    else if (e.t === 'release' || e.t === 'place') persist(true);
    else if (e.t === 'rebirth') { S.legend(); banner('مهرجان الفقس! التاج رقم ' + e.n); persist(true); }
    else if (e.t === 'tut' && e.phase === 'done') { markTut(); persist(true); }
    else if (e.t === 'match') showResult(e);
    else if (e.t === 'gadget') A.float(e.x, e.y - 0.5, GAD[e.id] || '', '#fff');
  }
  function showResult(e) {
    screen = 'result';
    const draw = e.winner < 0;
    $('resultTitle').textContent = draw ? 'تعادل!' : (e.winner === 0 ? 'اللاعب الأول فاز!' : 'اللاعب الثاني فاز!');
    $('resultSub').textContent = 'الأول ' + ER.fmt(e.a) + ' · الثاني ' + ER.fmt(e.b);
    const hi = Math.max(e.a, e.b);
    const best = Number(store.get('duelBest', 0)) || 0;
    const record = !draw && hi > best;
    if (record) store.set('duelBest', hi);
    $('resultNew').hidden = !record;
    $('resultBook').hidden = true;
    replayMode = '2p';
    const stars = draw ? 2 : hi >= 30 ? 3 : hi >= 12 ? 2 : 1;
    const starBox = $('resultStars');
    starBox.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const star = document.createElement('i');
      star.textContent = '★';
      star.className = i < stars ? 'on' : 'off';
      star.style.animationDelay = (i * 0.12) + 's';
      starBox.appendChild(star);
    }
    const burst = $('resultBurst');
    burst.replaceChildren();
    if (!Kit.motion.reduced()) {
      const colors = ['#ff5a8a', '#ffd23f', '#7ec8ff', '#fff', '#9dff8a', '#ff8a3d', '#c9a0ff'];
      for (let i = 0; i < 28; i++) {
        const bit = document.createElement('b');
        bit.style.left = (3 + Math.random() * 94) + '%';
        bit.style.background = colors[i % colors.length];
        bit.style.animationDelay = (Math.random() * 0.45) + 's';
        bit.style.animationDuration = (1.5 + Math.random() * 1.3) + 's';
        bit.style.width = (10 + (i % 4) * 3) + 'px';
        burst.appendChild(bit);
      }
      const p = world.players[e.winner < 0 ? 0 : e.winner] || world.players[0];
      if (p) ER.art.confetti(p.x, p.y - 1, 20);
    }
    ER.sfx.fanfare();
    Kit.stats.end(draw ? 'draw' : 'end', hi);
    paintChrome();
  }

  function paintHud() {
    if (!world || screen === 'title') return;
    const p = world.players[0];
    if (world.mode === '1p') {
      const target = world.coins;
      showCoins += (target - showCoins) * 0.35;
      if (Math.abs(target - showCoins) < 0.6) showCoins = target;
      $('coins').textContent = ER.fmt(showCoins);
      const sp = ER.speedOf(world.speedXP);
      let next = '';
      for (let i = 1; i <= 2; i++) if (sp + 1e-6 < ER.GATES[i]) { next = String(ER.GATES[i]); break; }
      $('speedLine').textContent = 'السرعة ' + sp.toFixed(1);
      $('gateLine').textContent = next || 'تم';
      $('gatePill').hidden = false;
      $('timer').hidden = false;
      $('timer').textContent = fmtTime(roundLeft);
      $('timer').classList.toggle('frenzy', roundLeft <= 30);
      $('p2coins').hidden = true;
      paintPetBar(false);
    } else {
      $('coins').textContent = ER.fmt(p.coins);
      $('speedLine').textContent = 'الأول';
      $('gatePill').hidden = true;
      $('timer').hidden = false;
      $('timer').textContent = fmtTime(world.matchT);
      $('timer').classList.toggle('frenzy', world.frenzy);
      $('p2coins').hidden = false;
      $('p2coins').textContent = '2: ' + ER.fmt(world.players[1].coins);
    }
    paintGadgets();
  }
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    const m = (s / 60) | 0, r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function paintGadgets() {
    const box = $('gads');
    if (!world || world.mode !== '1p') { box.textContent = ''; return; }
    const key = world.gadgets.join(',');
    if (box.dataset.k === key) return;
    box.dataset.k = key;
    box.textContent = '';
    world.gadgets.forEach(function (id, i) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'gad'; b.textContent = GAD[id] || id;
      b.addEventListener('click', function () { world.players[0].gadI = i; wantGadget = true; });
      box.appendChild(b);
    });
  }

  function openShop() {
    if (!world || world.mode !== '1p' || screen !== 'play') return;
    paintShop();
    $('ovShop').hidden = false;
    frameDirty = true;
  }
  function paintShop() {
    const list = $('shopList');
    list.textContent = '';
    function deal(icon, label, priceText, coin, disabled, onClick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deal';
      btn.disabled = !!disabled;
      const pic = document.createElement('i');
      pic.textContent = icon;
      const name = document.createElement('b');
      name.textContent = label;
      const price = document.createElement('em');
      if (coin) {
        const mark = document.createElement('s');
        mark.className = 'coin';
        price.appendChild(mark);
      }
      price.appendChild(document.createTextNode(priceText));
      btn.appendChild(pic); btn.appendChild(name); btn.appendChild(price);
      btn.addEventListener('click', onClick);
      list.appendChild(btn);
    }
    SHOP.forEach(function (row) {
      const id = row[0], cost = ER.price(world, id);
      const full = id !== 'banana' && id !== 'decoy' && id !== 'bubble' && !cost;
      const bag = (id === 'banana' || id === 'decoy' || id === 'bubble') && world.gadgets.length >= 3;
      deal(row[1], row[2], full ? 'تم' : bag ? 'ممتلئ' : ER.fmt(cost), !full && !bag, full || bag || world.coins < cost, function () {
        if (!ER.buy(world, id)) ER.sfx.deny();
      });
    });
    if (ER.price(world, 'rebirth')) {
      deal('👑', 'تاج', 'ابدأ', false, false, function () { ER.buy(world, 'rebirth'); closeModals(); });
    }
  }
  function openBook() {
    if (!world || world.mode !== '1p') return;
    const grid = $('bookGrid');
    grid.textContent = '';
    let owned = 0;
    for (let id = 0; id < 18; id++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (world.seen[id]) {
        owned++;
        if (roundPets.some(function (p) { return p.neu && p.b * 6 + p.s === id; })) cell.className = 'cell fresh';
        const cv = ER.art.sprite((id / 6) | 0, id % 6, world.gold[id] && world.giant[id] ? 3 : world.gold[id] ? 2 : world.giant[id] ? 1 : 0);
        cv.style.width = '72px'; cv.style.height = '72px';
        cell.appendChild(cv);
        if (world.gold[id] || world.giant[id]) {
          const star = document.createElement('div');
          star.className = 'star';
          star.textContent = (world.giant[id] ? '★' : '') + (world.gold[id] ? '●' : '');
          cell.appendChild(star);
        }
      } else {
        const sil = document.createElement('div');
        sil.className = 'sil';
        cell.appendChild(sil);
      }
      grid.appendChild(cell);
    }
    $('bookSub').textContent = owned + ' / 18 · كل منطقة مكتملة +10%';
    const pens = $('penList');
    pens.textContent = '';
    world.pets.forEach(function (pet) {
      if (pet.pad < 0) return;
      const item = document.createElement('div');
      item.className = 'item';
      const name = document.createElement('b');
      name.textContent = ER.PETS[pet.b * 6 + pet.s];
      const desc = document.createElement('span');
      desc.textContent = ER.fmt(pet.rate) + ' /ث';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'sg-btn secondary'; btn.textContent = 'أطلِق';
      btn.addEventListener('click', function () { ER.release(world, pet.pad); openBook(); });
      item.appendChild(name); item.appendChild(desc); item.appendChild(btn);
      pens.appendChild(item);
    });
    $('ovBook').hidden = false;
  }
  function openCard(e) {
    $('cardNew').hidden = !e.neu;
    const rar = ER.RAR_NAME[ER.RAR_I[e.s]] || '';
    $('cardName').textContent = e.name + (e.v >= 2 ? ' الذهبي' : '') + (e.v === 1 || e.v === 3 ? ' العملاق' : '');
    $('cardRate').textContent = rar + ' · ' + ER.fmt(e.rate) + ' /ث';
    const box = $('cardPens');
    box.textContent = '';
    if (e.pad < 0 && world.pending) {
      $('cardRate').textContent += ' · اختر مكانًا في الحظيرة';
      for (let i = 0; i < world.pens; i++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sg-btn secondary';
        const taken = world.pets.some(function (p) { return p.pad === i; });
        b.textContent = taken ? 'بدّل ' + (i + 1) : 'مكان ' + (i + 1);
        b.addEventListener('click', function () {
          if (taken) ER.release(world, i);
          ER.place(world, i);
          if (!world.pending) $('ovCard').hidden = true;
        });
        box.appendChild(b);
      }
      cardT = 0;
    } else cardT = 2.4;
    $('ovCard').hidden = false;
  }
  function paintSettings() {
    const on = (btn, yes) => { btn.textContent = yes ? 'نعم' : 'لا'; btn.setAttribute('aria-pressed', yes ? 'true' : 'false'); };
    if (!world) return;
    on($('togGrab'), world.settings.autoGrab);
    on($('togMove'), world.settings.clickMove);
    on($('togFox'), world.settings.fox !== false);
    paintLooks();
  }
  function petCall(e) {
    const id = ((e.b | 0) * 6 + (e.s | 0)) % 42;
    let s = CALL[id] || e.name || 'حيوان';
    if (e.v === 3) s += ' عملاق ذهبي';
    else if (e.v === 2) s += ' ذهبي';
    else if (e.v === 1) s += ' عملاق';
    return s + '!';
  }
  function hintLine() {
    if (!world || world.mode !== '1p' || world.tut === 'done') return '';
    if (hatchHint > 0) return 'فقست! الحيوان الجديد معك';
    const p = world.players[0];
    if (p && p.egg) return 'ارجع إلى البيت';
    if (world.incs.some(Boolean)) return 'انتظر الفقس';
    return TUT[world.tut] || '';
  }
  function applyHint() {
    const showDock = screen === 'play' && !!world && world.mode === '1p';
    $('dock').hidden = !showDock;
    const line = showDock ? hintLine() : '';
    $('hint').hidden = !line;
    if (line) $('hintText').textContent = line;
  }
  function wearNew(biome) {
    const i = biome | 0;
    if (i < 1 || i > 6) return;
    const cur = readLook();
    cur.shirt = i;
    cur.hat = i;
    store.set('look', cur);
    applyLook();
    if (!$('ovSet').hidden) paintLooks();
  }
  function readLook() {
    const v = store.get('look', null);
    let shirt = v && Number.isFinite(v.shirt) ? v.shirt | 0 : 0;
    let hat = v && Number.isFinite(v.hat) ? v.hat | 0 : 0;
    if (shirt < 0 || shirt > 6) shirt = 0;
    if (hat < 0 || hat > 6) hat = 0;
    return { shirt: shirt, hat: hat };
  }
  function applyLook() {
    const saved = readLook();
    const open = world && world.mode === '1p' ? Math.min(2, ER.maxOpen(world.speedXP)) : 0;
    const shirt = saved.shirt <= open ? saved.shirt : 0;
    const hat = saved.hat <= open ? saved.hat : 0;
    ER.art.look = { shirt: SHIRT[shirt], hat: hat };
  }
  function paintLooks() {
    if (!world) return;
    const open = Math.min(2, ER.maxOpen(world.speedXP));
    const saved = readLook();
    function row(box, kind) {
      box.textContent = '';
      const names = kind === 'hat' ? HAT_NAME : SHIRT_NAME;
      for (let i = 0; i < 7; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch' + ((saved[kind] | 0) === i ? ' on' : '');
        b.style.background = kind === 'shirt' ? SHIRT[i] : '#fff8e8';
        b.disabled = i > open;
        b.textContent = i > open ? 'مقفل' : (kind === 'hat' ? names[i] : '');
        const biome = ER.BIOMES[i] ? ER.BIOMES[i].name : '';
        b.setAttribute('aria-label', i > open ? 'تفتح مع ' + biome : names[i]);
        b.addEventListener('click', function () {
          const cur = readLook();
          cur[kind] = i;
          store.set('look', cur);
          applyLook();
          paintLooks();
          ER.sfx.click();
        });
        box.appendChild(b);
      }
    }
    row($('shirtRow'), 'shirt');
    row($('hatRow'), 'hat');
  }
  function tutPoint() {
    const p = world.players[0];
    if (hatchHint > 0) {
      const pet = world.pets[world.pets.length - 1];
      if (pet && pet.pad >= 0 && world.pads[pet.pad]) return { x: world.pads[pet.pad].x, y: world.pads[pet.pad].y };
      return { x: p.x, y: p.y };
    }
    if (world.tut === 'home') return { x: 5.2, y: 8 };
    if (world.tut === 'hatch') return { x: 2.2, y: 8.6 };
    if (world.tut === 'pad') return { x: world.pads[0].x, y: world.pads[0].y };
    if (world.tut === 'shop') return world.shop;
    let best = null, bd = 1e9;
    for (const n of world.nests) if (n.egg && (world.tut !== 'again' || n.biome === 0)) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best || { x: 17.6, y: 8 };
  }
  function drawArrow(ctx, x, y) {
    const bob = Math.sin(time * 7) * 10;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#2a2348'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(-16, -10); ctx.lineTo(16, -10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function toScreen(c, x, y) { return { x: (x - c.x) * 48 * c.z, y: (y - c.y) * 48 * c.z }; }

  function paintPetBar(force) {
    const bar = $('petbar');
    if (!bar) return;
    const show = screen === 'play' && !!world && world.mode === '1p' && roundPets.length > 0;
    bar.hidden = !show;
    if (!show) return;
    const key = roundPets.map(function (p) { return p.b + ':' + p.s + ':' + p.v; }).join(',');
    if (!force && bar.dataset.k === key) return;
    bar.dataset.k = key;
    $('petCount').textContent = '+' + roundPets.length;
    const slots = $('petSlots');
    slots.textContent = '';
    const from = Math.max(0, roundPets.length - 6);
    for (let i = from; i < roundPets.length; i++) {
      const pet = roundPets[i];
      const cv = ER.art.sprite(pet.b, pet.s, pet.v);
      cv.className = 'pslot';
      slots.appendChild(cv);
    }
  }
  function fillStars(n) {
    const starBox = $('resultStars');
    starBox.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const star = document.createElement('i');
      star.textContent = '★';
      star.className = i < n ? 'on' : 'off';
      star.style.animationDelay = (i * 0.12) + 's';
      starBox.appendChild(star);
    }
  }
  function beginParade() {
    if (screen !== 'play' || !world || world.mode !== '1p') return;
    closeModals();
    screen = 'parade';
    paradeT = 0;
    persist(true);
    paintChrome();
  }
  function finishParade() {
    if (screen !== 'parade') return;
    screen = 'result';
    replayMode = '1p';
    $('resultTitle').textContent = 'انتهت الجولة';
    $('resultSub').textContent = roundPets.length ? ('فقست ' + roundPets.length + ' بيضة') : 'البيضة القادمة أقرب';
    $('resultNew').hidden = true;
    $('resultBook').hidden = false;
    fillStars(roundPets.length >= 4 ? 3 : roundPets.length >= 2 ? 2 : roundPets.length ? 1 : 0);
    const grid = $('resultBook');
    grid.textContent = '';
    for (let id = 0; id < 18; id++) {
      const cell = document.createElement('div');
      const fresh = roundPets.some(function (p) { return p.b * 6 + p.s === id; });
      cell.className = 'cell' + (fresh ? ' fresh' : '');
      if (world && world.seen[id]) {
        const cv = ER.art.sprite((id / 6) | 0, id % 6, world.gold[id] ? 2 : 0);
        cv.style.width = '64px';
        cv.style.height = '64px';
        cell.appendChild(cv);
      } else {
        const sil = document.createElement('div');
        sil.className = 'sil';
        cell.appendChild(sil);
      }
      grid.appendChild(cell);
    }
    if (!ended) { ended = true; Kit.stats.end('end', roundPets.length); }
    ER.sfx.fanfare();
    paintChrome();
  }
  function update(dt) {
    const K = Kit.keys;
    time += dt;
    if (screen === 'title') {
      if (!backdrop) {
        backdrop = ER.create({ mode: '1p', seed: 2, now: 1, date: 1, tutorial: false });
        backdrop.settings.fox = false;
      }
      ER.step(backdrop, dt, {}, backdrop.now + dt * 1000);
      backdrop.ev.length = 0;
      if (K.anyPressed(['Enter', 'NumpadEnter', 'Space'])) start('1p');
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume();
    } else if (screen === 'parade') {
      paradeT += dt;
      if (paradeT > 4.2) finishParade();
    } else if (screen === 'result') {
      if (K.anyPressed(['Enter', 'NumpadEnter', 'KeyR', 'Space'])) start(replayMode);
      else if (K.pressed('Escape')) toTitle();
    } else if (screen === 'play' && world) {
      if ((modalOpen() || !$('ovCard').hidden) && K.pressed('Escape')) closeModals();
      else if (K.anyPressed(['KeyP', 'Escape'])) pause();
      else {
        let sim = dt;
        const cny = ER.art.ceremony;
        if (cny && hitArmed && cny.t >= cny.wobble) {
          hitStop = 0.09;
          hitArmed = false;
          ER.sfx.popHatch();
          if (!Kit.motion.reduced()) shake.add(4);
        }
        if (hitStop > 0) { hitStop -= dt; sim = 0; ER.art.hold = true; }
        else if (cny) { sim = 0; ER.art.hold = false; }
        else {
          ER.art.hold = false;
          if (slow > 0) { sim = dt * 0.35; slow -= dt; }
        }
        clock += sim * 1000;
        cam = cameraOf(world);
        const before = world.players[0].step;
        ER.step(world, sim, inputOf(K), clock);
        if (Math.hypot(world.players[0].vx, world.players[0].vy) > 1.2 && (before | 0) !== (world.players[0].step | 0)) {
          ER.art.burst(world.players[0].x, world.players[0].y + 0.35, 4, ['#fff6d0', '#c8b48a'], 1.3);
        }
        if (world.mode === '1p') {
          const kid = world.players[0];
          let red = false, near = false;
          for (const g of world.guards) {
            if (!ER.inCone(g, kid.x, kid.y)) continue;
            if (g.state === 'chase') red = true;
            else if (g.state === 'watch' || g.state === 'stir') near = true;
          }
          if ((red || near) && !cny) ER.sfx.heart(red);
          if (kid.egg) ER.art.homeGlow = Math.max(ER.art.homeGlow, 0.9);
          if (!ER.art.ceremony && hitStop <= 0) {
            roundLeft = Math.max(0, roundLeft - sim);
            if (roundLeft <= 0) beginParade();
          }
        }
        lastStep = world.players[0].step;
        const ev = world.ev.splice(0, world.ev.length);
        for (let i = 0; i < ev.length; i++) onEvent(ev[i]);
        if (cardT > 0) { cardT -= dt; if (cardT <= 0 && !world.pending) $('ovCard').hidden = true; }
        if (cardDelay > 0) { cardDelay -= dt; if (cardDelay <= 0 && pendingCard) { openCard(pendingCard); pendingCard = null; } }
        if (penCam) { penCam.life -= dt; if (penCam.life <= 0) penCam = null; }
        if (hopWait > 0) {
          hopWait -= dt;
          if (hopWait <= 0 && hopJob) {
            if (!Kit.motion.reduced()) ER.art.hopToPen(hopJob);
            hopJob = null;
          }
        }
        if (dirty && clock - savedAt >= 1500) persist(true);
        zoom += (1 - zoom) * Math.min(1, dt * 6);
        if (flash > 0) flash = Math.max(0, flash - dt);
      }
    }
    if (screen === 'play' && hatchHint > 0) hatchHint -= dt;
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').hidden = true; }
    shake.update(dt);
    if (world && screen === 'play') ER.art.tick(world, dt);
    else if (screen === 'title' && backdrop) ER.art.tick(backdrop, dt);
    K.endFrame();
    pointer.endFrame();
    pointerUI = false;
  }
  function render() {
    if (screen === 'parade') {
      const ctx = view.ctx;
      ctx.fillStyle = '#1d2440';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#5cbf4a';
      ctx.fillRect(0, 500, 1280, 220);
      ctx.fillStyle = '#e7c49a';
      ctx.fillRect(0, 548, 1280, 26);
      ctx.fillStyle = '#fff8e8';
      ctx.font = '700 56px Fredoka';
      ctx.textAlign = 'center';
      ctx.fillText('عرض الحيوانات', 640, 130);
      roundPets.forEach(function (pet, i) {
        const spr = ER.art.sprite(pet.b, pet.s, pet.v);
        const x = ((paradeT * 240 + i * 180) % 1760) - 180;
        const y = 340 + Math.sin(paradeT * 7 + i) * 14;
        ctx.drawImage(spr, x, y, 160, 160);
      });
      return;
    }
    if (screen === 'pause' && !frameDirty) return;
    frameDirty = false;
    aimCoins();
    applyLook();
    ER.art.titleDemo = screen === 'title';
    ER.art.reduced = Kit.motion.reduced();
    const ctx = view.ctx;
    if (screen === 'title') {
      if (!backdrop) return;
      const c = cameraOf(backdrop);
      c.x = Math.max(0, c.x);
      const sx = shake.x / (48 * c.z), sy = shake.y / (48 * c.z);
      ER.art.draw(ctx, backdrop, { x: c.x - sx, y: c.y - sy, z: c.z }, time, 1);
      return;
    }
    if (!world) return;
    const c = cameraOf(world);
    cam = c;
    const sx = shake.x / (48 * c.z), sy = shake.y / (48 * c.z);
    ER.art.draw(ctx, world, { x: c.x - sx, y: c.y - sy, z: c.z }, time, zoom);
    if (screen === 'play' && world.mode === '1p' && hintLine()) {
      const t = tutPoint();
      const s = toScreen(c, t.x, t.y - 1.3);
      if (s.x > 40 && s.x < 1240 && s.y > 96 && s.y < 620) drawArrow(ctx, s.x, s.y);
    }
    if (world.mode === '2p') {
      world.players.forEach(function (p, i) {
        const s = toScreen(c, p.x, p.y);
        if (s.x > -20 && s.x < 1300) return;
        const edge = s.x < 0 ? 36 : 1244;
        drawArrow(ctx, edge, Math.max(40, Math.min(680, s.y)));
        ctx.fillStyle = '#2a2348'; ctx.font = '700 22px Fredoka'; ctx.textAlign = 'center';
        ctx.fillText(i === 0 ? '1' : '2', edge, Math.max(40, Math.min(680, s.y)) - 28);
      });
    }
    if (flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.85, flash * 2); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1280, 720); ctx.restore(); }
    paintHud();
    applyHint();
  }

  function on(id, fn) { $(id).addEventListener('click', function () { ER.sfx.click(); fn(); }); }
  on('btnPlay', function () { start('1p'); });
  on('btn2p', function () { start('2p'); });
  on('btnPause', pause);
  on('btnResume', resume);
  on('btnMenu', toTitle);
  on('btnResultMenu', toTitle);
  on('btnReplay', function () { start(replayMode); });
  on('btnShop', openShop);
  on('btnShopClose', closeModals);
  on('btnBook', openBook);
  on('btnBookClose', closeModals);
  on('btnGear', function () { paintSettings(); $('ovSet').hidden = false; });
  on('btnSetClose', closeModals);
  on('btnCardClose', function () { $('ovCard').hidden = true; cardT = 0; });
  on('btnSkip', function () { if (world) { ER.skipTut(world); markTut(); persist(true); } });
  function toggle(id, key) {
    $(id).addEventListener('click', function () {
      if (!world) return;
      if (key === 'fox') world.settings.fox = world.settings.fox === false;
      else world.settings[key] = !world.settings[key];
      paintSettings();
      persist(true);
      ER.sfx.click();
    });
  }
  toggle('togGrab', 'autoGrab');
  toggle('togMove', 'clickMove');
  toggle('togFox', 'fox');

  window.addEventListener('pointerdown', function (e) {
    pointerUI = !!(e.target.closest && e.target.closest('button, a, .ov, .sg-save-status, .sg-mute'));
  }, true);

  Kit.lifecycle({
    pause: function () { if (screen === 'play') pause(); },
    reset: function () { Kit.keys.reset(); }
  });

  if (document.fonts && document.fonts.load) {
    try { document.fonts.load('700 40px Fredoka', 'ب'); } catch (e) { /* canvas falls back */ }
  }
  paintChrome();
  const loaded = readRaw();
  if (loaded.raw) $('titleSub').textContent = 'رصيدك ' + ER.fmt(loaded.raw.coins) + ' قطعة';

  window.__game = {
    get screen() { return screen; },
    get px() { return world ? world.players[0].x : 0; },
    get py() { return world ? world.players[0].y : 0; },
    get coins() { return world ? (world.mode === '2p' ? world.players[0].coins : world.coins) : 0; },
    get mode() { return world ? world.mode : screen; },
    state: function () { return { screen: screen, paused: screen === 'pause', modal: modalOpen() ? 'open' : '' }; },
    give: function (n) { if (world) world.coins += n; },
    buy: function (id) { return !!(world && ER.buy(world, id)); },
    save: function () { return persist(true); },
    clock: function () { return clock; },
    setInc: function (ms) {
      if (!world) return;
      world.incs[0] = { b: 0, s: 0, v: 0, end: clock + ms, nest: -1, daily: false, force: 0 };
    },
    pets: function () { return world ? world.pets.length : 0; },
    notice: function () { return $('banner').hidden ? '' : $('banner').textContent; },
    tune: function (fn) { if (world) fn(world); },
    ceremony: function () {
      const c = ER.art.ceremony;
      return c ? { t: c.t, dur: c.dur, wobble: c.wobble, s: c.s } : null;
    },
    p2x: function () { return world && world.players[1] ? world.players[1].x : 0; }
  };

  Kit.loop(update, render);
  Kit.ready();
})();

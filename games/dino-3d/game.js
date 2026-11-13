/* Dino 3D (الديناصور ثلاثي الأبعاد): screens, keyboard and mouse, the coach, saves
 * and sound. engine.js runs the journey; art.js draws it in 3D.
 * This is the UI layer: it reads Kit.dda at every round start and reports each
 * result back to it. */
(function () {
  'use strict';
  var D = window.Dino3D, J = Kit.juice;
  function $(id) { return document.getElementById(id); }
  var canvas = $('scene'), ui = $('ui'), body = document.body;
  var NAMES = ['الصحراء', 'الغابة', 'الجبال الثلجية', 'جزيرة البركان', 'الليل'];
  var PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'خارق!'];
  var JUMP = ['Space', 'ArrowUp'], DUCK = ['ArrowDown'], DASH = ['ArrowRight', 'ShiftLeft', 'ShiftRight'];
  var INK = '#2a2140';

  /* --------------------------------------------------------------- save */
  var store = Kit.store('dino-3d'), saveStatus = Kit.saveStatus({ retry: persist });
  var save = D.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty for the journey and one for the endless run (Kit keeps them on this PC).
  var ddaMain = Kit.dda('dino-3d', { id: 'main' }), ddaRun = Kit.dda('dino-3d', { id: 'endless' });

  /* -------------------------------------------------------------- state */
  var mode = 'title', world = null, cur = { level: 0, endless: false, code: '' }, view = null, time = 0, viewTime = 0;
  var inputJumps = 0, pointerJump = false, pointerTap = false, ending = null, result = null, resultT = 0, resultLock = 0, wardFrom = 'title';
  var menuIdle = 0, menuNext = 4, dirty = true, contextLost = false, snap = true, spin = 0, lastFrame = 0;
  var live = false, queued = null; // live: the 3D view has drawn its first frame (see init)
  var coach = { id: 0, t: 0, seen: {}, bumped: {}, intro: 0 }, streak = 0, bannerT = 0, ghostT = 0;
  var hud = { hp: -1, eggs: -1, trip: -1, roar: -1, m: -1 };
  var show = { x: 0, y: 0, ground: true, running: false, hop: true, idle: true, speed: 0 };
  var uiS = 1, uiL = 0, uiT = 0;
  var calm = function () { return Kit.motion.reduced(); };
  function say(text) { $('live').textContent = text; }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* ---------------------------------------------------------- pictures */
  var S = function (inner) { return '<svg viewBox="0 0 64 64" aria-hidden="true">' + inner + '</svg>'; };
  var ST = ' stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"';
  var PIC = {
    block: S('<path d="M26 60 V16 Q26 8 32 8 Q38 8 38 16 V60 Z M38 38 H46 V24 Q46 19 49.5 19 Q53 19 53 24 V42 Q53 44 50 44 H38 Z M26 32 H18 V20 Q18 15 14.5 15 Q11 15 11 20 V36 Q11 38 14 38 H26 Z" fill="#3fbf5a"' + ST + '/><circle cx="32" cy="9" r="5" fill="#ff6fae"' + ST + '/>'),
    crate: S('<rect x="8" y="12" width="48" height="44" rx="4" fill="#f2b248"' + ST + '/><path d="M8 24 H56 M8 44 H56" stroke="#a45f22" stroke-width="5"/><path d="M32 25 L35 31 L41 31 L36 35 L38 41 L32 37 L26 41 L28 35 L23 31 L29 31 Z" fill="#ffe14d" stroke="' + INK + '" stroke-width="2"/>'),
    vine: S('<path d="M4 6 H60" stroke="#8a5a33" stroke-width="8" stroke-linecap="round"/><path d="M32 8 V40" stroke="#3fae36" stroke-width="6"/><path d="M32 16 L22 12 M32 26 L42 22 M32 34 L22 31" stroke="#6fe04f" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="48" r="10" fill="#ff6fae"' + ST + '/>'),
    roller: S('<circle cx="36" cy="34" r="22" fill="#fff"' + ST + '/><path d="M2 26 H10 M4 36 H12 M2 46 H10" stroke="#9fd8ff" stroke-width="5" stroke-linecap="round"/><circle cx="30" cy="28" r="3" fill="#bfe4ff"/><circle cx="44" cy="40" r="4" fill="#bfe4ff"/>'),
    gap: S('<path d="M2 40 H62 V60 H2 Z" fill="#ff6a3c"' + ST + '/><rect x="24" y="34" width="16" height="10" rx="3" fill="#8d7480"' + ST + '/><circle cx="12" cy="48" r="3" fill="#ffd0a0"/><circle cx="52" cy="50" r="4" fill="#ffd0a0"/><path d="M2 40 H10 M54 40 H62" stroke="#d9a46b" stroke-width="8"/>'),
    flyer: S('<path d="M8 30 L30 22 L56 30 L30 34 Z" fill="#ffd23f"' + ST + '/><path d="M22 26 Q30 18 40 26 L40 34 Q30 38 22 34 Z" fill="#34c6c0"' + ST + '/><path d="M22 28 L10 24 L14 30 Z" fill="#ffb03c"' + ST + '/><path d="M40 32 Q48 44 44 54" fill="none" stroke="#ff4f9a" stroke-width="4" stroke-linecap="round"/>'),
    mud: S('<ellipse cx="32" cy="44" rx="28" ry="12" fill="#9a6236"' + ST + '/><ellipse cx="24" cy="42" rx="6" ry="3" fill="#7a4a26"/><circle cx="44" cy="32" r="4" fill="#9a6236"' + ST + '/>'),
    jump: S('<path d="M12 54 Q14 20 40 14" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M30 6 L50 12 L36 26 Z" fill="#fff"/>'),
    duck: S('<path d="M32 8 V44" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M16 38 L32 58 L48 38 Z" fill="#fff"/>')
  };
  var BIOME_ART = [
    S('<circle cx="48" cy="16" r="9" fill="#ffe14d"' + ST + '/><path d="M0 52 Q20 40 40 50 T64 46 V64 H0 Z" fill="#f7cd73"' + ST + '/><path d="M22 52 V24 Q22 18 26 18 Q30 18 30 24 V52 M30 38 H36 V30 M22 34 H16 V26" fill="#3fbf5a"' + ST + '/>'),
    S('<path d="M4 4 Q30 20 26 60" fill="none" stroke="#3fae36" stroke-width="6"/><path d="M60 8 Q36 24 44 60" fill="none" stroke="#3fae36" stroke-width="6"/><path d="M10 20 Q2 30 12 34 Q18 26 10 20 Z M52 22 Q62 32 52 36 Q46 28 52 22 Z M28 40 Q20 48 28 52 Q34 46 28 40 Z" fill="#6fe04f"' + ST + '/><circle cx="40" cy="44" r="5" fill="#ff5a8a"' + ST + '/>'),
    S('<path d="M2 58 L24 18 L36 36 L44 26 L62 58 Z" fill="#9fb4cc"' + ST + '/><path d="M18 30 L24 18 L30 28 L26 26 L22 30 Z" fill="#fff"/><path d="M46 40 L52 30 L58 40 Z M44 50 L52 36 L60 50 Z" fill="#2f8a5a"' + ST + '/>'),
    S('<path d="M2 60 L22 24 H42 L62 60 Z" fill="#5b475f"' + ST + '/><path d="M22 24 H42 L38 32 H26 Z" fill="#ff8a3c"' + ST + '/><circle cx="26" cy="12" r="6" fill="#fff"' + ST + '/><circle cx="38" cy="8" r="5" fill="#fff"' + ST + '/>'),
    S('<path d="M44 8 A18 18 0 1 0 58 34 A14 14 0 1 1 44 8 Z" fill="#fff6c8"' + ST + '/><path d="M12 14 L14 20 L20 22 L14 24 L12 30 L10 24 L4 22 L10 20 Z" fill="#ffe14d"/><path d="M28 44 V60 M28 44 Q16 44 18 36 Q28 30 38 36 Q40 44 28 44" fill="#46ffd2"' + ST + '/>')
  ];
  var HAT_ART = {
    none: S('<circle cx="32" cy="32" r="22" fill="none" stroke="#c9c2dc" stroke-width="7"/><path d="M16 48 L48 16" stroke="#c9c2dc" stroke-width="7" stroke-linecap="round"/>'),
    bow: S('<path d="M32 32 L8 18 L8 46 Z M32 32 L56 18 L56 46 Z" fill="#ff7eb9"' + ST + '/><circle cx="32" cy="32" r="7" fill="#ff4f9a"' + ST + '/>'),
    cap: S('<path d="M10 40 Q10 14 32 14 Q52 14 52 40 Z" fill="#ff4b4b"' + ST + '/><path d="M44 40 H62 Q62 46 50 46 H10 V40 Z" fill="#ff4b4b"' + ST + '/><circle cx="32" cy="14" r="3" fill="#fff"/>'),
    flower: S('<ellipse cx="32" cy="40" rx="26" ry="9" fill="none" stroke="#4fbf4a" stroke-width="6"/><circle cx="14" cy="36" r="7" fill="#ff6fae"' + ST + '/><circle cx="32" cy="30" r="7" fill="#ffd23f"' + ST + '/><circle cx="50" cy="36" r="7" fill="#7ad3ff"' + ST + '/>'),
    party: S('<path d="M32 4 L50 54 H14 Z" fill="#7a5cff"' + ST + '/><path d="M24 30 H40 M20 42 H44" stroke="#ffd23f" stroke-width="5"/><circle cx="32" cy="6" r="5" fill="#ff4f9a"' + ST + '/>'),
    shades: S('<path d="M4 24 H60" stroke="' + INK + '" stroke-width="6"/><rect x="8" y="24" width="20" height="16" rx="6" fill="' + INK + '"/><rect x="36" y="24" width="20" height="16" rx="6" fill="' + INK + '"/><path d="M12 28 L18 28" stroke="#8fd8ff" stroke-width="3"/>'),
    crown: S('<path d="M8 50 L8 18 L22 32 L32 12 L42 32 L56 18 L56 50 Z" fill="#ffcf2e"' + ST + '/><circle cx="32" cy="40" r="5" fill="#ff4b6e"/>'),
    viking: S('<path d="M12 46 Q12 18 32 18 Q52 18 52 46 Z" fill="#b9c3d6"' + ST + '/><path d="M12 36 Q2 30 6 12 Q12 26 18 28 M52 36 Q62 30 58 12 Q52 26 46 28" fill="#fff"' + ST + '/><path d="M10 46 H54" stroke="#8a6a3a" stroke-width="7"/>'),
    wizard: S('<path d="M30 4 L46 50 H14 Z" fill="#6b4fe6"' + ST + '/><path d="M4 50 H60 Q60 58 32 58 Q4 58 4 50 Z" fill="#5b3fd1"' + ST + '/><path d="M30 24 L32 30 L38 30 L33 34 L35 40 L30 36 L25 40 L27 34 L22 30 L28 30 Z" fill="#ffe14d"/>')
  };
  function colorPic(c) { return '<svg class="pic" aria-hidden="true" style="fill:#' + c.toString(16).padStart(6, '0') + '"><use href="#i-dino"/></svg>'; }
  function key(label, wide) { return '<span class="sg-key' + (wide ? ' wide' : '') + '">' + label + '</span>'; }
  var ACT_KEYS = {
    jump: '<span dir="ltr">' + key('مسافة', 1) + key('↑') + '</span>',
    duck: '<span dir="ltr">' + key('↓') + '</span>',
    dash: '<span dir="ltr">' + key('→') + key('Shift') + '</span>'
  };

  /* ------------------------------------------------------------ screens */
  var SCREENS = { title: 'title', map: 'map', endless: 'endless', wardrobe: 'wardrobe', paused: 'pause-screen', result: 'result' };
  function setMode(next) {
    mode = next; body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'playing' || next === 'paused' || next === 'ending');
    $('pause-button').hidden = next !== 'playing';
    hideGhost(); menuIdle = 0; menuNext = 4; dirty = true;
    if (next === 'playing') focusGame();
  }
  function menuWorld(b) { return { endless: false, biome: b, obs: [], items: [], oi: 0, ii: 0, len: Infinity }; }
  function menuScene(b) {
    world = null;
    view.resetCourse(menuWorld(b)); view.setBiome(b, true);
    show.x = 0; snap = true;
  }
  function stars() { return D.totalStars(save); }
  function newItems() { return D.unlocks(save.seen, save.bank).length > 0; }
  function titleScreen() {
    $('title-stars').textContent = String(stars());
    $('btn-wardrobe').classList.toggle('ring', newItems());
    setMode('title');
  }
  function toTitle() { menuScene(D.LEVEL[D.nextLevel(save)].biome); titleScreen(); }
  function play() {
    J.select();
    if (!stars()) startLevel(0); else toMap();
  }

  /* ---------------------------------------------------------------- map */
  var levelBtns = [], cardEls = [];
  function buildMap() {
    var box = $('cards');
    D.BIOMES.forEach(function (B, b) {
      var card = document.createElement('div');
      card.className = 'biome b' + b;
      var art = document.createElement('button');
      art.type = 'button'; art.className = 'art';
      art.innerHTML = BIOME_ART[b] + '<b>' + NAMES[b] + '</b><svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
      on(art, function () { openBiome(b, art); });
      card.appendChild(art);
      var row = document.createElement('div'); row.className = 'lv';
      for (var n = 0; n < 3; n++) (function (i) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'pebble'; btn.dataset.level = String(i);
        btn.innerHTML = '<b>' + (i % 3 + 1) + '</b><span class="st">' + '<svg aria-hidden="true"><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(btn, function () { pickLevel(i, btn); });
        row.appendChild(btn); levelBtns[i] = btn;
      })(b * 3 + n);
      card.appendChild(row); box.appendChild(card); cardEls.push({ card: card, art: art });
    });
  }
  function refreshMap() {
    var next = D.nextLevel(save);
    levelBtns.forEach(function (btn, i) {
      var open = D.isOpen(save, i), st = save.stars[i];
      btn.classList.toggle('locked', !open); btn.classList.toggle('done', st > 0); btn.classList.toggle('next', i === next && open && !st);
      btn.querySelectorAll('.st svg').forEach(function (s, j) { s.classList.toggle('on', j < st); });
      btn.setAttribute('aria-label', 'المرحلة ' + (i % 3 + 1) + (open ? '' : ' (مقفلة)'));
    });
    cardEls.forEach(function (c, b) {
      var open = D.biomeOpen(save, b);
      c.card.classList.toggle('locked', !open);
      c.art.setAttribute('aria-label', NAMES[b] + (open ? '' : ' (مقفل)'));
    });
    $('map-stars').textContent = String(stars());
  }
  function toMap() {
    if (mode !== 'title' && mode !== 'map') menuScene(D.LEVEL[D.nextLevel(save)].biome);
    refreshMap(); setMode('map');
    J.whoosh(0.4);
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }
  function pickLevel(i, el) {
    if (!D.isOpen(save, i)) { J.tap(); wiggle(el); return; }
    J.select(); startLevel(i);
  }
  function openBiome(b, el) {
    if (!D.biomeOpen(save, b)) { J.tap(); wiggle(el); return; }
    for (var i = b * 3; i < b * 3 + 3; i++) if (D.isOpen(save, i) && !save.stars[i]) { J.select(); startLevel(i); return; }
    J.select(); startLevel(b * 3);
  }

  /* ------------------------------------------------------------ wardrobe */
  var tiles = [];
  function buildWardrobe() {
    [['color', D.COLORS, 'colors'], ['hat', D.HATS, 'hats']].forEach(function (g) {
      g[1].forEach(function (it, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'tile';
        b.innerHTML = (g[0] === 'color' ? colorPic(it.c) : HAT_ART[it.id].replace('<svg', '<svg class="pic"')) +
          '<span class="need"><svg aria-hidden="true"><use href="#i-egg"/></svg>' + it.need + '</span><svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, function () { equip(g[0], i, b); });
        $(g[2]).appendChild(b);
        tiles.push({ type: g[0], i: i, el: b, need: it.need });
      });
    });
  }
  function refreshWardrobe() {
    tiles.forEach(function (t) {
      var locked = t.need > save.bank, onNow = (t.type === 'color' ? save.color : save.hat) === t.i;
      t.el.classList.toggle('locked', locked); t.el.classList.toggle('on', onNow);
      t.el.setAttribute('aria-label', (t.type === 'color' ? 'لون ' : 'قبعة ') + (t.i + 1) + (locked ? ' (مقفل)' : ''));
      t.el.setAttribute('aria-pressed', String(onNow));
    });
    $('bank').textContent = String(save.bank);
  }
  function openWardrobe(from) {
    wardFrom = from; J.select();
    if (save.seen !== save.bank) { save.seen = save.bank; persist(); }
    if (mode !== 'title' && mode !== 'map') menuScene(D.LEVEL[D.nextLevel(save)].biome);
    refreshWardrobe(); setMode('wardrobe'); snap = false;
  }
  function closeWardrobe() { J.back(); if (wardFrom === 'map') toMap(); else toTitle(); }
  function dress() { var c = D.COLORS[save.color].c; view.setLook(c, D.HATS[save.hat].id); $('trip-me').style.fill = '#' + c.toString(16).padStart(6, '0'); }
  function equip(type, i, el) {
    var list = type === 'color' ? D.COLORS : D.HATS;
    if (list[i].need > save.bank) { J.error(); wiggle(el); return; }
    if (type === 'color') save.color = i; else save.hat = i;
    persist(); dress(); J.select(); view.kick('hop');
    view.burst(show.x, 1.2, 0, { count: 26, colors: [0xffd23f, 0xffffff, 0xff6fae, 0x4fb8ff], speed: 3.4, life: 0.8, size: 0.1 });
    refreshWardrobe();
  }

  /* ------------------------------------------------------------- rounds */
  function resetRound() {
    pointerJump = pointerTap = false; Kit.keys.reset();
    ending = null; result = null; streak = 0;
    coach.id = 0; coach.t = 0; coach.seen = {}; coach.bumped = {};
    hud.hp = hud.eggs = hud.trip = hud.roar = hud.m = -1;
    clearFloats(); hideCoach();
    view.resetCourse(world); view.setBiome(D.biomeAt(world, 0), true);
    snap = true;
  }
  function startLevel(i) {
    // The difficulty is read at every start.
    var tier = ddaMain.tier, L = D.LEVEL[i];
    world = D.create({ level: i, tier: tier });
    cur = { level: i, endless: false, code: '' };
    resetRound();
    $('trip').hidden = false; $('meters').hidden = true; $('code-tag').hidden = true;
    coach.intro = !save.coach && i === 0 ? 7 : 0;
    if (coach.intro) showIntro(); else $('intro').hidden = true;
    showBanner(L, !!coach.intro);
    setMode('playing');
    J.whoosh(0.5);
  }
  // A course code is the same course for every child on this version: tier 3 for all,
  // and it never moves the difficulty.
  function startEndless(code) {
    var shared = D.validCode(code), tier = shared ? 3 : ddaRun.tier;
    world = D.create({ endless: true, tier: tier, seed: shared ? D.codeSeed(code) : (Math.random() * 4294967296) >>> 0 });
    cur = { level: -1, endless: true, code: shared ? code : '' };
    resetRound();
    $('trip').hidden = true; $('meters').hidden = false; $('hud-far').textContent = String(save.far);
    $('code-tag').hidden = !shared; $('code-now').textContent = shared ? code : '';
    $('intro').hidden = true; coach.intro = 0;
    showBanner(null);
    setMode('playing');
    J.whoosh(0.5);
  }
  function restart() { J.select(); if (cur.endless) startEndless(cur.code); else startLevel(cur.level); }
  function pause(own) {
    if (mode !== 'playing') return;
    pointerJump = pointerTap = false; Kit.keys.reset();
    setMode('paused');
    if (own) J.back();
  }
  function resume() {
    if (mode !== 'paused' || contextLost) return;
    J.select(); Kit.keys.reset();
    setMode('playing');
  }
  function quit() {
    J.back();
    if (cur.endless) toTitle(); else toMap();
  }

  // The result is saved the moment the round ends, before the celebration.
  function finishRound() {
    var r = D.result(world), before = save.bank;
    save.bank = Math.min(99999999, save.bank + r.eggs);
    if (cur.endless) {
      var far = save.far, best = r.distance > far;
      if (best) save.far = r.distance;
      persist();
      if (!cur.code) ddaRun.result(D.outcome(r));
      result = { endless: true, won: false, r: r, best: best && far > 0, distance: r.distance, items: D.unlocks(before, save.bank) };
    } else {
      var i = cur.level, st = D.stars(r), prev = save.stars[i], prevBest = save.best[i];
      if (st > prev) save.stars[i] = st;
      if (r.finished && r.eggs > prevBest) save.best[i] = r.eggs;
      if (r.finished && i === 0 && !save.coach) save.coach = true;
      persist();
      ddaMain.result(D.outcome(r));
      result = { endless: false, won: r.finished, r: r, stars: st, best: r.finished && prevBest > 0 && r.eggs > prevBest, items: D.unlocks(before, save.bank),
        next: i < 14 && D.isOpen(save, i + 1) };
    }
    ending = { t: 0, dur: result.won ? 3 : 1.6, x: world.x, v: world.speed, hopT: 0 };
    updateHud(); hideCoach(); $('intro').hidden = true;
    setMode('ending');
    if (result.won) {
      J.levelUp();
      if (!calm()) for (var k = 0; k < 3; k++) view.burst(world.len + 3.2, 2.6, 0, { count: 30, colors: [0xff6fae, 0xffd23f, 0x4fb8ff, 0x7be05a, 0xffffff], speed: 5, up: 0.8, life: 1.6, size: 0.14, gravity: 5, jitter: 2 });
    } else { J.fail(); view.kick('bump'); }
  }
  function stepEnding(dt) {
    var e = ending;
    e.t += dt;
    if (result.won) {
      var target = world.len + 1.3;
      if (e.x < target) { e.v = Math.max(2.4, e.v * (1 - dt * 1.4)); e.x = Math.min(target, e.x + e.v * dt); }
      else { e.hopT -= dt; if (e.hopT <= 0) { e.hopT = 0.75; view.kick('hop'); } }
      if (!calm() && Math.floor(e.t * 2.5) !== Math.floor((e.t - dt) * 2.5)) view.burst(world.len + 3.2 + (Math.random() - 0.5) * 3, 3.2, (Math.random() - 0.5) * 2, { count: 14, colors: [0xff6fae, 0xffd23f, 0x4fb8ff, 0x7be05a], speed: 3, life: 1.4, size: 0.12, gravity: 3 });
    }
    if (e.t >= e.dur) showResult();
  }
  function showResult() {
    var r = result;
    resultT = 0; resultLock = 0.55;
    $('res-stars').hidden = r.endless;
    $('res-stars').querySelectorAll('svg').forEach(function (s) { s.classList.remove('on'); });
    $('res-far').hidden = !r.endless; $('res-m').textContent = '0';
    $('res-n').textContent = '0';
    $('res-best').hidden = true; $('res-gift').hidden = true;
    $('res-title').textContent = r.endless ? 'أحسنت!' : !r.won ? 'حاول مرة أخرى!' : r.stars >= 3 ? 'مذهل!' : r.stars === 2 ? 'رائع!' : 'وصلت!';
    $('next').hidden = r.endless || !r.won && !r.next;
    $('next').setAttribute('aria-label', !r.endless && cur.level < 14 ? 'المرحلة التالية' : 'الخريطة');
    $('result').classList.toggle('lost', !r.endless && !r.won);
    $('again').classList.toggle('play', !!$('next').hidden);
    say(r.endless ? r.distance + ' م' : r.won ? r.stars + ' / 3' : 'حاول مرة أخرى');
    setMode('result');
  }
  // Stars pop in one by one on the game clock, the eggs count up, then the rewards.
  function stepResult(dt) {
    var r = result, before = resultT;
    resultT += dt;
    function at(t) { return before < t && resultT >= t; }
    if (!r.endless) for (var i = 0; i < r.stars; i++) if (at(0.3 + i * 0.4)) { $('res-stars').children[i].classList.add('on'); J.star(i + 1); }
    var k = Math.min(1, Math.max(0, (resultT - 0.2) / 1.1)), eggs = Math.round(r.r.eggs * k);
    if ($('res-n').textContent !== String(eggs)) { $('res-n').textContent = String(eggs); if (eggs % 3 === 0) J.coin(Math.min(5, 1 + (eggs / 6 | 0))); }
    if (r.endless) $('res-m').textContent = String(Math.round(r.distance * Math.min(1, resultT / 1.2)));
    var after = r.endless ? 1.4 : 0.45 + r.stars * 0.4 + 0.5;
    if (at(after)) {
      if (r.best) { $('res-best').hidden = false; J.chime(3); }
      if (r.items.length) {
        var it = r.items[r.items.length - 1];
        $('res-gift').innerHTML = (it.type === 'color' ? colorPic(D.COLORS[it.i].c) : HAT_ART[D.HATS[it.i].id]) + '<span>جديد!</span>';
        $('res-gift').hidden = false; J.chime(2);
      }
    }
  }
  function next() {
    if (!result) return;
    J.select();
    if (!result.endless && cur.level < 14 && D.isOpen(save, cur.level + 1)) startLevel(cur.level + 1); else toMap();
  }
  function again() { if (result) restart(); }
  function resultMenu() { J.back(); if (cur.endless) toTitle(); else toMap(); }

  /* ------------------------------------------------------------- the HUD */
  function showBanner(L, plain) {
    var b = $('banner');
    if (!L) { b.innerHTML = '<span class="big"><svg aria-hidden="true"><use href="#i-inf"/></svg></span><span>' + NAMES[0] + '</span>'; }
    else {
      var fresh = plain ? '' : L.n === 0 ? D.BIOMES[L.biome].fresh : L.i === 1 ? 'crate' : '';
      var act = fresh === 'crate' ? 'dash' : fresh === 'vine' ? 'duck' : 'jump';
      b.innerHTML = '<span class="big" dir="ltr">' + (L.biome + 1) + '-' + (L.n + 1) + '</span><span>' + NAMES[L.biome] + '</span>' +
        (fresh ? '<span class="fresh"><i>جديد!</i>' + PIC[fresh] + ACT_KEYS[act] + '</span>' : '');
    }
    b.hidden = false; b.classList.remove('out'); bannerT = 2.8;
  }
  function showIntro() {
    var el = $('intro');
    el.innerHTML = '<div>' + ACT_KEYS.jump + PIC.jump.replace('<svg', '<svg class="act"') + '</div><div>' + ACT_KEYS.duck + PIC.duck.replace('<svg', '<svg class="act"') + '</div>' +
      '<div>' + ACT_KEYS.dash + '<svg class="act bolt" aria-hidden="true"><use href="#i-bolt"/></svg></div><div><svg class="mouse" aria-hidden="true"><use href="#i-mouse"/></svg>' + PIC.jump.replace('<svg', '<svg class="act"') + '</div>';
    el.hidden = false; el.classList.remove('out');
  }
  function showCoach(action, id) {
    var el = $('coach');
    el.innerHTML = ACT_KEYS[action] + (action === 'jump' ? '<svg class="mouse" aria-hidden="true"><use href="#i-mouse"/></svg>' : '') + (PIC[action] || '<svg class="act bolt" aria-hidden="true"><use href="#i-bolt"/></svg>');
    el.className = 'coach ' + action; el.hidden = false;
    coach.id = id; coach.t = 0;
  }
  function hideCoach() { $('coach').hidden = true; coach.id = 0; }
  function wantsCoach(kind) {
    if (world.tier <= 2) return true;
    var fresh = !world.endless && world.n === 0 && D.BIOMES[world.biome].fresh === kind;
    return fresh && (coach.seen[kind] || 0) <= 2 || (coach.bumped[kind] || 0) > 0;
  }
  function updateHud() {
    var p = world.p;
    if (hud.hp !== p.hp) {
      var hurt = hud.hp > p.hp && hud.hp >= 0;
      hud.hp = p.hp;
      $('hearts').querySelectorAll('i').forEach(function (h, i) { h.dataset.v = String(Math.max(0, Math.min(2, p.hp - i * 2))); });
      if (hurt) wiggle($('hearts'));
    }
    if (hud.eggs !== world.eggs) { hud.eggs = world.eggs; $('hud-eggs').textContent = String(world.eggs); }
    if (!world.endless) {
      var k = Math.round(D.progress(world) * 500) / 500;
      if (k !== hud.trip) { hud.trip = k; $('trip-fill').style.width = (k * 100).toFixed(1) + '%'; $('trip-me').style.left = 'calc(' + (k * 100).toFixed(1) + '% - 22px)'; }
    } else {
      var m = Math.floor(world.x);
      if (m !== hud.m) { hud.m = m; $('hud-m').textContent = String(m); }
    }
    var roar = Math.round(p.roar * 100);
    if (roar !== hud.roar) {
      hud.roar = roar; $('roar-fill').style.width = roar + '%';
      $('roar').classList.toggle('full', roar >= 100);
    }
  }

  /* ---------------------------------------- flying eggs and callouts */
  var flyPool = [], flying = [], floatPool = [], floating = [];
  function uiPoint(x, y, z) {
    var p = view.project(x, y, z), w = window.innerWidth, h = window.innerHeight;
    return { x: (p.x * w - uiL) / uiS, y: (p.y * h - uiT) / uiS };
  }
  function flyEgg(x, y) {
    if (calm() || flying.length >= 8) return;
    var el = flyPool.pop();
    if (!el) { el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('class', 'fly'); el.innerHTML = '<use href="#i-egg"/>'; $('floats').appendChild(el); }
    var a = uiPoint(x, y, 0);
    el.style.display = ''; flying.push({ el: el, x: a.x, y: a.y, t: 0 });
  }
  function callout(text, x, y, color) {
    var el = floatPool.pop();
    if (!el) { el = document.createElement('div'); el.className = 'float'; $('floats').appendChild(el); }
    el.textContent = text; el.style.color = color || '#ffd23f'; el.style.display = '';
    var a = x == null ? { x: 640, y: 300 } : uiPoint(x, y, 0);
    floating.push({ el: el, x: a.x, y: a.y, t: 0 });
    if (floating.length > 5) dropFloat(0);
  }
  function dropFloat(i) { var f = floating.splice(i, 1)[0]; f.el.style.display = 'none'; floatPool.push(f.el); }
  function clearFloats() {
    while (flying.length) { var f = flying.pop(); f.el.style.display = 'none'; flyPool.push(f.el); }
    while (floating.length) dropFloat(0);
  }
  function stepFloats(dt) {
    var tx = 104, ty = 96;
    for (var i = flying.length - 1; i >= 0; i--) {
      var f = flying[i], k;
      f.t += dt; k = Math.min(1, f.t / 0.55);
      var e = k * k, x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 60;
      f.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (1 - k * 0.4).toFixed(2) + ')';
      if (k >= 1) { f.el.style.display = 'none'; flyPool.push(f.el); flying.splice(i, 1); wiggle($('egg-chip')); }
    }
    for (i = floating.length - 1; i >= 0; i--) {
      var g = floating[i];
      g.t += dt;
      g.el.style.transform = 'translate(' + g.x.toFixed(1) + 'px,' + (g.y - g.t * 50).toFixed(1) + 'px)';
      g.el.style.opacity = String(Math.max(0, 1 - Math.max(0, g.t - 0.7) / 0.4));
      if (g.t > 1.1) dropFloat(i);
    }
  }

  /* -------------------------------------------------------------- events */
  function obsById(id) {
    for (var i = Math.max(0, world.oi - 2); i < world.obs.length; i++) if (world.obs[i].id === id) return world.obs[i];
    return null;
  }
  var BIT = [0xffd23f, 0xffffff, 0xff8a3c];
  function handleEvents() {
    var p = world.p, ev = world.ev;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i], o;
      switch (e.t) {
        case 'jump': inputJumps++; J.jump(0.6); view.kick('jump'); view.burst(world.x - 0.2, 0.05, 0, { count: 5, colors: [0xffffff, 0xf0e0c0], speed: 1.6, up: 0.2, life: 0.4, size: 0.13, gravity: 2 }); break;
        case 'land': J.land(e.power * 0.7); view.kick('land', e.power); if (e.power > 0.35) view.burst(world.x, 0.05, 0, { count: 8, colors: [0xffffff, 0xf0e0c0], speed: 2, up: 0.15, life: 0.45, size: 0.14, gravity: 2 }); break;
        case 'cue':
          coach.seen[e.kind] = (coach.seen[e.kind] || 0) + 1;
          if (e.kind === 'crate' && p.roar >= 1) showCoach('dash', e.id);
          else if (wantsCoach(e.kind)) { showCoach(e.kind === 'vine' || e.form === 'mid' ? 'duck' : 'jump', e.id); if (coach.bumped[e.kind]) coach.bumped[e.kind]--; }
          if (coach.intro > 1.5) coach.intro = 1.5;
          break;
        case 'clear':
          if (e.id === coach.id) hideCoach();
          streak++;
          if (streak % 6 === 0) { callout(PRAISE[Math.min(3, streak / 6 - 1)], world.x, p.y + 2.2); J.streak(Math.min(8, streak / 6 + 1)); }
          break;
        case 'smash':
          if (e.id === coach.id) hideCoach();
          o = obsById(e.id);
          J.impact(0.8); J.pop(1); view.shake(0.35);
          if (o) view.burst(o.x + o.w / 2, 0.6, 0, { count: 26, colors: e.kind === 'crate' ? [0xf2b248, 0xa45f22, 0xffe14d] : [0xffffff, 0xffd23f, 0x9a6236], speed: 5.5, up: 0.6, life: 0.9, size: 0.2, gravity: 12, vx: 3 });
          callout('+' + e.bonus, world.x + 0.8, 1.6, '#ffffff');
          for (var b = 0; b < e.bonus; b++) flyEgg(world.x + 0.8, 1.2 + b * 0.3);
          break;
        case 'bump':
          if (e.id === coach.id) hideCoach();
          coach.bumped[e.kind] = 2; streak = 0;
          J.impact(0.5); view.kick('bump'); view.shake(0.5);
          view.burst(world.x + 0.4, p.y + 1, 0, { count: 12, colors: BIT, speed: 3, life: 0.7, size: 0.12, gravity: 4 });
          break;
        case 'splash':
          coach.bumped.gap = 2; streak = 0; hideCoach();
          J.pop(0.9); J.land(0.8); view.kick('bump'); view.shake(0.4);
          view.burst(world.x, -0.1, 0, { count: 22, colors: [view.BIO[D.biomeAt(world, world.x)].goo, 0xffffff], speed: 4.5, up: 1.2, life: 0.8, size: 0.16, gravity: 10 });
          break;
        case 'egg': J.coin(Math.min(5, e.n)); view.burst(world.x + 0.3, p.y + 0.9, 0, { count: 5, colors: [0xffffff, 0xffe14d], speed: 2, life: 0.4, size: 0.08, gravity: 0 }); flyEgg(world.x + 0.3, p.y + 0.9); break;
        case 'fruit':
          J.pop(0.55);
          view.burst(world.x + 0.3, p.y + 0.8, 0, { count: 9, colors: [0xff5a5a, 0x7be05a, 0xffd23f], speed: 2.4, life: 0.5, size: 0.1, gravity: 6 });
          if (e.full) { J.chime(2); callout('→', world.x, p.y + 2.2, '#ffd23f'); }
          wiggle($('roar'));
          break;
        case 'heart': J.chime(3); view.burst(world.x, p.y + 1.5, 0, { count: 14, colors: [0xff3b6b, 0xffffff], speed: 3, life: 0.7, size: 0.1, gravity: 0 }); break;
        case 'dash': J.whoosh(1); J.impact(0.35); view.kick('roar'); view.shake(0.3); view.burst(world.x + 0.6, 0.8, 0, { count: 18, colors: [0xffffff, 0xffd23f], speed: 6, up: 0, spread: 0.6, life: 0.4, size: 0.12, gravity: 0, flat: 1 }); if (coach.id && $('coach').classList.contains('dash')) hideCoach(); break;
        case 'noRoar': J.tap(); wiggle($('roar')); break;
        case 'mud': J.land(0.15); view.burst(world.x, 0.1, 0, { count: 6, colors: [view.BIO[D.biomeAt(world, world.x)].mud], speed: 2, up: 0.8, life: 0.5, size: 0.12, gravity: 9 }); break;
        case 'meter': J.chime(1); callout(e.m + ' م', world.x + 1, 2.4, '#ffffff'); break;
        case 'biome': view.setBiome(e.b, false); J.whoosh(0.6); var bn = $('banner'); bn.innerHTML = '<span>' + NAMES[e.b] + '</span>'; bn.hidden = false; bn.classList.remove('out'); bannerT = 2.2; break;
        case 'finish': case 'over': finishRound(); break;
      }
    }
    ev.length = 0;
  }

  /* -------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // The second click of a double click is dropped (it would land on the next screen).
  // Until the 3D view is up (see init) the title's buttons only remember the press.
  function on(el, fn) {
    el.addEventListener('click', function (e) {
      e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); }
      if (live) fn(e); else queued = function () { fn(e); };
    });
  }
  on($('play'), play);
  on($('btn-endless'), function () { J.select(); openEndless(); });
  on($('btn-wardrobe'), function () { openWardrobe('title'); });
  on($('map-home'), function () { J.back(); toTitle(); });
  on($('endless-home'), function () { J.back(); toTitle(); });
  on($('endless-go'), function () { J.select(); startEndless(''); });
  on($('code-btn'), function () {
    var row = $('code-row'), open = row.hidden;
    row.hidden = !open; $('code-btn').setAttribute('aria-expanded', String(open)); J.tap();
    if (open) { $('code-error').hidden = true; setTimeout(function () { try { $('code-input').focus(); } catch (e) { /* ignore */ } }, 0); }
  });
  $('code-input').addEventListener('input', function () {
    this.value = this.value.replace(/[٠-٩۰-۹]/g, function (d) { return String(d.charCodeAt(0) - (d <= '٩' ? 1632 : 1776)); }).replace(/[^0-9]/g, '').slice(0, 4);
    $('code-error').hidden = true;
  });
  $('code-row').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('code-input').value.trim();
    if (!D.validCode(code)) { $('code-error').hidden = false; J.error(); return; }
    Kit.audio.unlock(); J.select(); startEndless(code);
  });
  on($('pause-button'), function () { pause(true); });
  on($('resume'), resume);
  on($('restart'), function () { if (mode === 'paused') restart(); });
  on($('pause-menu'), function () { if (mode === 'paused') quit(); });
  on($('next'), function () { if (mode === 'result' && resultLock <= 0) next(); });
  on($('again'), function () { if (mode === 'result' && resultLock <= 0) again(); });
  on($('result-menu'), function () { if (mode === 'result' && resultLock <= 0) resultMenu(); });
  on($('res-gift'), function () { if (mode === 'result') openWardrobe('map'); });
  on($('wardrobe-back'), closeWardrobe);
  function openEndless() {
    $('far-best').textContent = String(save.far);
    $('code-row').hidden = true; $('code-btn').setAttribute('aria-expanded', 'false');
    if (mode !== 'title') menuScene(0);
    setMode('endless');
  }

  canvas.addEventListener('pointerdown', function (e) {
    focusGame();
    if (e.button !== 0 || !live) return;
    menuIdle = 0; hideGhost();
    if (mode === 'playing') { pointerJump = pointerTap = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } e.preventDefault(); }
    else if (mode === 'title' || mode === 'map' || mode === 'wardrobe' || mode === 'endless') { view.kick('hop'); J.jump(0.4); }
  });
  function release() { pointerJump = false; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  window.addEventListener('keydown', function (e) { if (Kit.isGameKeyEvent(e)) { menuIdle = 0; hideGhost(); } });
  function handleKeys() {
    var K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']), esc = K.pressed('Escape');
    if (mode === 'title') { if (go) play(); }
    else if (mode === 'map') { if (go) { J.select(); startLevel(D.nextLevel(save)); } else if (esc) { J.back(); toTitle(); } }
    else if (mode === 'endless') { if (go) { J.select(); startEndless(''); } else if (esc) { J.back(); toTitle(); } }
    else if (mode === 'wardrobe') { if (go || esc) closeWardrobe(); }
    else if (mode === 'playing') { if (K.anyPressed(['KeyP', 'Escape'])) pause(true); }
    else if (mode === 'paused') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (mode === 'result' && resultLock <= 0) {
      if (go || K.pressed('KeyR')) again();
      else if (K.pressed('ArrowRight') && !$('next').hidden) next();
      else if (esc) resultMenu();
    }
  }

  /* ---------------------------------------------------- the ghost hand */
  // A wordless coach for the menus: after a few idle seconds a hand shows what to press.
  function hideGhost() { $('ghost').hidden = true; ghostT = 0; }
  function menuGhost() {
    var el = mode === 'title' ? $('play') : mode === 'map' ? document.querySelector('.pebble.next') || levelBtns[D.nextLevel(save)] :
      mode === 'endless' ? $('endless-go') : mode === 'result' && resultT > 1.6 ? (!$('next').hidden ? $('next') : $('again')) : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (!r.width) return;
    var g = $('ghost');
    g.style.left = ((r.left + r.width / 2 - uiL) / uiS - 26).toFixed(0) + 'px';
    g.style.top = ((r.top + r.height / 2 - uiT) / uiS).toFixed(0) + 'px';
    g.hidden = false; g.classList.remove('tap'); void g.getBoundingClientRect(); g.classList.add('tap');
    ghostT = 2.4;
  }

  /* ---------------------------------------------------------------- loop */
  function playerState() {
    if (world && (mode === 'playing' || mode === 'paused')) {
      var p = world.p;
      return { x: world.x, y: p.y, ground: p.ground, duck: p.duck, dash: p.dash > 0, hurt: p.hurt, running: true, speed: world.speed, hop: false };
    }
    if (world && ending && (mode === 'ending' || mode === 'result')) {
      if (result.won) { var target = world.len + 1.3; return { x: ending.x, y: 0, ground: true, running: ending.x < target - 0.01, speed: ending.v, hop: ending.x >= target - 0.01 }; }
      return { x: world.x, y: Math.max(0, world.p.y), ground: true, running: false, speed: 0, hop: false };
    }
    show.idle = mode !== 'wardrobe';
    return show;
  }
  function stepPlay(dt) {
    var K = Kit.keys;
    // A quick click counts even if the button is up again before the next step.
    var input = { jump: pointerJump || pointerTap || K.anyDown(JUMP) || K.anyPressed(JUMP), duck: K.anyDown(DUCK), dash: K.anyDown(DASH) || K.anyPressed(DASH) };
    pointerTap = false;
    D.step(world, dt, input);
    handleEvents();
    if (mode !== 'playing') return;
    if (coach.id) { coach.t += dt; if (coach.t > 2.4) hideCoach(); }
    if (coach.intro > 0) { coach.intro -= dt; if (coach.intro <= 0) $('intro').classList.add('out'); }
    updateHud();
  }
  function update(dt) {
    if (mode !== 'paused') time += dt;
    handleKeys();
    if (mode === 'playing') stepPlay(dt);
    else if (mode === 'ending') stepEnding(dt);
    else if (mode === 'result') { stepResult(dt); if (resultLock > 0) resultLock -= dt; }
    if (mode === 'wardrobe') spin += dt * 0.6; else spin *= 0.9;
    if (bannerT > 0 && mode !== 'paused') { bannerT -= dt; if (bannerT <= 0) $('banner').classList.add('out'); if (bannerT <= -0.5) $('banner').hidden = true; }
    if (mode === 'title' || mode === 'map' || mode === 'endless' || mode === 'result') {
      menuIdle += dt;
      if ($('ghost').hidden && menuIdle >= menuNext) { menuNext = menuIdle + 6; menuGhost(); }
    }
    if (ghostT > 0) { ghostT -= dt; if (ghostT <= 0) hideGhost(); }
    if (mode !== 'paused') { stepFloats(dt); dirty = true; }
    Kit.keys.endFrame();
  }
  function render() {
    if (!view || contextLost || (!dirty && mode === 'paused')) return;
    var now = performance.now();
    if (mode === 'playing' && lastFrame && view.frameTime(now - lastFrame)) layout();
    lastFrame = now;
    if (mode !== 'paused' || snap) {
      var dt = Math.max(0, Math.min(0.1, time - viewTime));
      viewTime = time;
      var camMode = mode === 'playing' || mode === 'paused' ? 'play' : mode === 'ending' || mode === 'result' ? 'finish' : mode === 'wardrobe' ? 'wardrobe' : 'menu';
      view.update({ mode: camMode, dt: dt, t: time, player: playerState(), spin: mode === 'wardrobe' ? Math.sin(spin) * 0.6 - 0.35 : 0, idle: camMode === 'menu' || camMode === 'wardrobe', snap: snap });
      snap = false;
    }
    view.render();
    dirty = false;
  }
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    uiS = Math.min(w / 1280, h / 720); uiL = (w - 1280 * uiS) / 2; uiT = (h - 720 * uiS) / 2;
    ui.style.transform = 'scale(' + uiS + ')'; ui.style.left = uiL + 'px'; ui.style.top = uiT + 'px';
    if (view) view.resize(w, h);
    dirty = true;
  }

  /* ------------------------------------------------- test and debug hook */
  function snapshot() {
    var w = world, p = w && w.p;
    return {
      mode: mode, score: w ? w.eggs : 0, eggs: w ? w.eggs : 0, total: w ? w.total : 0, distance: w ? Math.round(w.x * 1000) / 1000 : 0,
      hearts: p ? p.hp : D.HP, roar: p ? Math.round(p.roar * 1000) / 1000 : 0, level: cur.level, id: w ? w.id : '', tier: w ? w.tier : 0,
      endless: cur.endless, code: cur.code, progress: w ? Math.round(D.progress(w) * 1000) / 1000 : 0, done: !!(w && w.done), over: !!(w && w.over),
      bumps: w ? w.bumps : 0, smashed: w ? w.smashed : 0, stars: result && !result.endless ? result.stars : 0,
      player: p ? { y: Math.round(p.y * 1000) / 1000, vy: Math.round(p.vy * 1000) / 1000, ground: p.ground, duck: p.duck, dash: p.dash > 0 } : { y: 0, vy: 0, ground: true, duck: false, dash: false }
    };
  }

  /* ---------------------------------------------------------------- init */
  $('hearts').querySelectorAll('i').forEach(function (h) { h.innerHTML = '<svg class="bg" aria-hidden="true"><use href="#i-heart"/></svg><span class="fg"><svg aria-hidden="true"><use href="#i-heart"/></svg></span>'; h.dataset.v = '2'; });
  Kit.muteButton();
  Kit.lifecycle({ pause: function () { pause(false); }, reset: function () { pointerJump = pointerTap = false; } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); contextLost = true; pause(false); $('context-notice').hidden = false; });
  canvas.addEventListener('webglcontextrestored', function () { contextLost = false; $('context-notice').hidden = true; snap = true; dirty = true; layout(); });
  if (document.fonts && document.fonts.load) document.fonts.load('700 40px Fredoka', 'رائع 5').then(function () { dirty = true; }, function () { /* fallback fonts */ });
  // Start-up runs in three steps, so the title is on screen and the page keeps answering
  // while a software renderer works (a cold browser's first frames can keep the processor
  // busy for seconds there):
  //  1. now: the menus and the title, no 3D yet (the page's sky colour shows behind it);
  //  2. after that first paint: the 3D view, its shaders and its first frame;
  //  3. once the graphics card has finished that frame and the remaining shaders: the frame
  //     loop, the test hook and Kit.ready, so none of that cost comes after the game says
  //     it is ready.
  // A title button pressed before step 3 runs then.
  var loop = null, failed = false;
  function fail(error) {
    if (failed) return;
    failed = true; live = false; queued = null;
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('error-screen').hidden = false;
    body.dataset.mode = 'error';
    Kit.fail(error);
  }
  function guarded(fn) { return function () { if (failed) return; try { fn(); } catch (error) { fail(error); } }; }
  function goLive() {
    window.Dino3DGame = {
      get mode() { return mode; },
      get state() { return snapshot(); },
      get inputJumps() { return inputJumps; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      // Where a course point is on the page, for tests that aim the real mouse.
      point: function (x, y, z) { var p = view.project(x, y, z || 0); return { x: p.x * window.innerWidth, y: p.y * window.innerHeight }; }
    };
    loop = Kit.loop(update, render);
    live = true;
    Kit.ready();
    if (queued) { var press = queued; queued = null; press(); }
  }
  // The portal gives up on a game that is not ready after 20 s, so a frame the graphics
  // card has not finished after 8 s is not waited for any longer.
  // The shaders the title does not show (eggs, fruit, dust, the night sky) are queued with
  // the first frame, so the wait below covers them too: without background compiling
  // (software WebGL) they would otherwise keep the graphics process, and so every frame
  // after the game said it was ready, busy for seconds.
  function firstFrame() { render(); view.compileRest(); view.whenDrawn(guarded(goLive), 8000); }
  function start3D() {
    view = D.createView(canvas);
    view.calm = calm();
    dress(); layout(); menuScene(D.LEVEL[D.nextLevel(save)].biome);
    view.prepare(guarded(firstFrame));
  }
  try {
    buildMap(); buildWardrobe(); layout(); titleScreen();
    // After the next paint where frames are drawn; a hidden page gets no animation
    // frames, so a timer starts it there.
    var begun = false, begin = function () { if (!begun) { begun = true; setTimeout(guarded(start3D), 0); } };
    requestAnimationFrame(begin); setTimeout(begin, 100);
  } catch (error) {
    fail(error);
  }
})();

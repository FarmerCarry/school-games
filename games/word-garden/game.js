/* حديقة الكلمات (Word Garden): screens, typing, the word as joined DOM text, the garden,
 * saves and sound. engine.js decides what is right; art.js draws.
 * This is the UI layer: it reads Kit.dda at every level start. */
(function () {
  'use strict';
  const WG = window.WG, A = WG.art, J = Kit.juice, W = WG.W, H = WG.H, ZWJ = '‍';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  let dirty = true, gardenLayer = null;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    A.reset(); gardenLayer = null; dirty = true;
  } });
  const fx = Kit.particles(), shake = Kit.shake();
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('word-garden');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = WG.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty per language: a child's Arabic and English spelling differ.
  const dda = { ar: Kit.dda('word-garden', { id: 'ar' }), en: Kit.dda('word-garden', { id: 'en' }) };

  /* --------------------------------------------------------------- state */
  let screen = 'title', lang = save.lang || 'ar', level = null, cur = { w: 0, l: 0 }, time = 0, pausedFrom = '', gardenFrom = 'title';
  let ending = null, result = null, resultT = 0, resultLock = 0, cardPop = 1, boardGlow = 0, coaching = false;
  let plots = [], flyers = [], seeds = [], bugs = [], floats = [], titleBugs = [], shownSeeds = save.seeds;
  const lit = {}; // code -> { kind: 'good' | 'bad', t }
  const PRAISE = ['رائع!', 'ممتاز!', 'أحسنت!', 'مذهل!'];
  const BUG_COLORS = ['#ff7eb6', '#b48cff', '#4fd1ff', '#ff9f43'];

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', garden: 'scrGarden' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function starsText(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتان' : n + ' نجوم'; }
  function chip(id, v) { $(id).querySelector('b').textContent = String(v); }
  function on(el, fn) {
    // A mouse click hands the keyboard back to the game; a double click acts once.
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }

  /* --------------------------------------------------------------- title */
  function toTitle() {
    level = null;
    setScreen('title');
    chip('titleStars', WG.total(save)); chip('titleSeeds', save.seeds);
    $('btnAr').classList.toggle('ring', lang === 'ar');
    $('btnEn').classList.toggle('ring', lang === 'en');
    paintHowto();
  }
  // The how-to card: the cat with its first letter missing, the key that types it, a flower.
  function paintHowto() {
    const ar = lang === 'ar', el = $('howWord');
    el.dir = ar ? 'rtl' : 'ltr'; el.lang = ar ? 'ar' : 'en'; el.textContent = '';
    const gap = document.createElement('span'), hole = document.createElement('i');
    gap.className = 'gap'; hole.className = 'hole'; gap.append(hole);
    el.append(gap, ar ? ZWJ + 'طة' : 'at');
    $('howKey').querySelector('.ar').textContent = ar ? 'ق' : '';
    $('howKey').querySelector('.en').textContent = ar ? 'R' : 'C';
    A.icon($('howPic'), 'pic', 'cat');
  }
  function pickLang(l) {
    lang = l;
    if (save.lang !== l) { save.lang = l; persist(); }
    J.select();
    toMap();
  }

  /* ---------------------------------------------------------------- map */
  const WORLD_NAMES = ['الحيوانات', 'الطعام', 'البيت والمدرسة', 'في الخارج', 'كلمتان معًا'];
  const WORLD_TIPS = ['الحرف الأول والأخير', 'حرف من الوسط', 'حرفان ناقصان', 'اكتب الكلمة كلها', 'كلمتان وصورة'];
  const WORLD_PICS = ['lion', 'apple', 'book', 'sun', 'ball'];
  const rows = [];
  function buildMap() {
    const box = $('worlds');
    for (let w = 0; w < WG.WORLDS; w++) {
      const row = document.createElement('div');
      row.className = 'world'; row.style.top = (98 + w * 122) + 'px';
      const badge = document.createElement('div');
      badge.className = 'badge';
      const pic = document.createElement('canvas'); pic.width = 92; pic.height = 78;
      A.icon(pic, 'pic', WORLD_PICS[w]);
      const name = document.createElement('div');
      name.innerHTML = '<b>' + WORLD_NAMES[w] + '</b><small>' + WORLD_TIPS[w] + '</small>';
      badge.append(pic, name);
      row.append(badge);
      const btns = [];
      for (let l = 0; l < WG.LEVELS; l++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lvl-btn';
        b.dataset.w = String(w); b.dataset.l = String(l);
        b.innerHTML = '<span class="n">' + (l + 1) + '</span><span class="st" aria-hidden="true">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span>';
        on(b, () => pickLevel(w, l, b));
        row.append(b); btns.push(b);
      }
      const lock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      lock.setAttribute('class', 'lock'); lock.setAttribute('aria-hidden', 'true');
      lock.innerHTML = '<use href="#i-lock"/>';
      row.append(lock);
      box.append(row);
      rows.push({ el: row, btns: btns, lock: lock });
    }
  }
  function refreshMap() {
    const next = WG.nextLevel(save, lang);
    rows.forEach((row, w) => {
      const open = WG.worldOpen(save, lang, w);
      row.el.classList.toggle('locked', !open);
      row.lock.style.display = open ? 'none' : '';
      row.btns.forEach((b, l) => {
        const ok = WG.isOpen(save, lang, w, l), stars = save.stars[lang][w][l];
        b.classList.toggle('locked', !ok);
        b.classList.toggle('done', stars > 0);
        b.classList.toggle('next', next.w === w && next.l === l);
        b.querySelectorAll('.st svg').forEach((s, i) => s.classList.toggle('on', i < stars));
        b.setAttribute('aria-label', WORLD_NAMES[w] + '، المرحلة ' + (l + 1) + (ok ? (stars ? '، ' + starsText(stars) : '') : ' (مقفلة)'));
      });
    });
    chip('mapStars', WG.total(save, lang)); chip('mapSeeds', save.seeds);
    $('mapLang').textContent = lang === 'ar' ? 'عربي' : 'English';
    $('mapLang').dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
  function toMap() {
    level = null;
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }
  function pickLevel(w, l, el) {
    if (!WG.isOpen(save, lang, w, l)) { J.tap(); wiggle(el); return; }
    J.select(); startLevel(w, l);
  }
  function startNext() { const n = WG.nextLevel(save, lang); J.select(); startLevel(n.w, n.l); }

  /* -------------------------------------------------------------- levels */
  const TIPS = { first: 'اكتب الحرف الناقص', last: 'اكتب الحرف الناقص', ends: 'اكتب الحرف الناقص', middle: 'اكتب الحرف الناقص', any: 'اكتب الحرف الناقص',
    two: 'اكتب الحرفين الناقصين', whole: 'اكتب الكلمة كلها', p1: 'اكتب الحرف الناقص', p2: 'اكتب الحرفين الناقصين', pw: 'اكتب الكلمتين' };
  function clearFx() { fx.clear(); flyers = []; seeds = []; bugs = []; floats = []; for (const k in lit) delete lit[k]; boardGlow = 0; }
  function plotX(i, n) { return Math.round(640 + (i - (n - 1) / 2) * Math.min(150, 1150 / n)); }
  function startLevel(w, l) {
    // Difficulty is read at every level start.
    const plan = WG.plan(lang, w, l, dda[lang].tier);
    coaching = !save.coach;
    // The very first word ever: the key glows soon, whatever the tier.
    if (coaching) plan.hint = Math.min(plan.hint, 1.5);
    level = WG.create(plan, (Math.random() * 2147483647) | 0);
    cur = { w: w, l: l };
    ending = null; result = null;
    clearFx();
    const kinds = WG.plantKinds(save);
    plots = level.items.map((it, i) => ({ x: plotX(i, level.total), kind: kinds[(Math.random() * kinds.length) | 0], k: 0, grow: false, phase: Math.random() * 6 }));
    cardPop = 0; shownSeeds = save.seeds;
    $('tip').textContent = TIPS[plan.mode];
    $('hudLevel').querySelector('b').textContent = (w + 1) + '-' + (l + 1);
    chip('hudSeeds', save.seeds);
    setScreen('play');
    renderWord(true);
    Kit.keys.reset();
    J.whoosh(0.5);
  }
  function restart() { J.select(); startLevel(cur.w, cur.l); }
  function pause(own) {
    if (screen !== 'play') return;
    pausedFrom = screen;
    setScreen('pause');
    if (own) J.back();
    say('استراحة');
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function quit() { J.back(); toMap(); }

  /* ------------------------------------------------------------ the word */
  // The word is DOM text, so the browser shapes it whole and its letters stay joined.
  // A missing letter is an inline-block slot; where the letters on either side of a
  // slot would join, a zero-width joiner on each side keeps their joined shapes.
  function piece(text, a, b) {
    return (a > 0 && WG.joins(text[a - 1], text[a]) ? ZWJ : '') + text.slice(a, b) + (b < text.length && WG.joins(text[b - 1], text[b]) ? ZWJ : '');
  }
  // changed: the gap that just got a letter (its letters pop or bump in as the flyer lands).
  function gapEl(it, gi, ar, changed) {
    const g = it.gaps[gi], text = it.text, el = document.createElement('span');
    const to = gi < it.g ? g[1] : gi === it.g ? it.pos : g[0];
    el.className = 'gap' + (gi < it.g ? ' full' : gi === it.g ? ' cur' : '');
    el.dataset.g = String(gi);
    if (to > g[0]) {
      const t = document.createElement('span');
      t.className = 'typed' + (gi === changed ? (to === g[1] ? ' pop' : ' bump') : '');
      t.textContent = piece(text, g[0], to);
      el.append(t);
    }
    const rest = WG.units(text.slice(to, g[1]), ar ? 'ar' : 'en').length;
    for (let k = 0; k < rest; k++) { const h = document.createElement('i'); h.className = 'hole' + (gi === it.g && k === 0 ? ' now' : ''); el.append(h); }
    return el;
  }
  function renderWord(enter, changed) {
    const el = $('word'), it = level && WG.item(level);
    el.textContent = '';
    if (!it) return;
    const ar = level.plan.lang === 'ar', text = it.text;
    el.dir = ar ? 'rtl' : 'ltr'; el.lang = ar ? 'ar' : 'en';
    el.className = (it.state === 'done' ? 'done' : '') + (enter ? ' enter' : '') + (level.plan.mode === 'whole' || level.plan.mode === 'pw' ? ' many' : '');
    if (it.state === 'done') el.textContent = text; // the finished word: one run of text, joined exactly like the word
    else {
      let i = 0;
      it.gaps.forEach((g, gi) => {
        if (g[0] > i) el.append(piece(text, i, g[0]));
        el.append(gapEl(it, gi, ar, changed));
        i = g[1];
      });
      if (i < text.length) el.append(piece(text, i, text.length));
    }
    fitWord(el, text);
  }
  function fitWord(el, text) {
    const n = text.length;
    let size = n <= 4 ? 128 : n <= 6 ? 112 : n <= 9 ? 96 : n <= 12 ? 84 : 72;
    el.style.fontSize = size + 'px';
    const room = 680, w = el.scrollWidth;
    if (w > room) { size = Math.floor(size * room / w); el.style.fontSize = size + 'px'; }
  }
  // The middle of the glowing hole of a gap (or of the word) in logical pixels.
  function gapPoint(gi) {
    const gap = gi == null ? null : $('word').querySelector('[data-g="' + gi + '"]');
    const el = (gap && (gap.querySelector('.hole.now') || gap)) || $('word');
    const r = el.getBoundingClientRect();
    if (!r.width) return { x: A.BOARD.x + A.BOARD.w / 2, y: A.BOARD.y + A.BOARD.h / 2 };
    return view.toLogical(r.left + r.width / 2, r.top + r.height / 2);
  }
  function shakeGap() {
    const el = $('word').querySelector('.gap.cur');
    if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 450);
  }

  /* ------------------------------------------------------------- typing */
  function flashKey(code, kind) { if (WG.KEYS[code]) lit[code] = { kind: kind, t: kind === 'bad' ? 0.4 : 0.22 }; }
  function typeKey(ev) {
    const it = WG.item(level), g = it ? it.g : 0;
    const target = it && it.state === 'type' ? gapPoint(g) : null;
    const n = WG.key(level, ev);
    if (n === 0) return;
    flashKey(ev.code, n > 0 ? 'good' : 'bad');
    handleEvents(ev, target);
  }
  function burst(x, y, colors, n) { fx.burst(x, y, { count: n || 18, colors: colors, speed: 320, life: 0.7, size: 8, gravity: 300 }); }
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 40, t: 0 });
    if (floats.length > 8) floats.shift();
  }
  function handleEvents(ev, target) {
    const it = WG.item(level);
    let changed = -1;
    for (const e of level.ev) {
      if (e.t === 'good') {
        J.pop(0.45);
        changed = it.gaps.findIndex(g => e.at >= g[0] && e.at < g[1]);
        const from = A.keyCenter(ev ? ev.code : 'Space') || { x: 640, y: 600 }, to = target || gapPoint(null);
        if (!calm()) flyers.push({ x0: from.x, y0: from.y - 10, x1: to.x, y1: to.y, t: 0, ch: it.text.slice(e.at, e.at + e.n) });
        if (flyers.length > 6) flyers.shift();
      } else if (e.t === 'gap') {
        if (it.state === 'type') J.chime(1);
      } else if (e.t === 'word') wordDone(e);
      else if (e.t === 'miss') {
        J.error(); shakeGap(); shake.add(2);
      } else if (e.t === 'hint') J.hover();
      else if (e.t === 'next') { renderWord(true); cardPop = 0; }
      else if (e.t === 'done') finishLevel();
    }
    level.ev.length = 0;
    if (changed >= 0 && it.state === 'type' && level.items[level.i] === it) renderWord(false, changed);
  }
  function wordDone(e) {
    renderWord(false);
    J.chime(2); J.coin(1);
    boardGlow = 1;
    const p = plots[e.i], c = gapPoint(null);
    if (!calm()) {
      burst(c.x, c.y, ['#ffd23f', '#5be38f', '#ffffff', '#ff7eb6'], 26);
      seeds.push({ x0: c.x, y0: c.y + 40, x1: p.x, y1: 412, t: 0, plot: p });
    } else { p.grow = true; p.k = 1; addBug(p); }
    if (e.done % 3 === 0 && e.done < level.total) float(1022, 340, PRAISE[(e.done / 3 - 1) % PRAISE.length], '#ffd23f', 54);
    if (coaching) { coaching = false; if (!save.coach) { save.coach = true; persist(); } }
  }
  function addBug(p) {
    if (bugs.length >= 7) return;
    const bee = bugs.length % 2 === 0;
    bugs.push({ bee: bee, cx: p.x, cy: 330, phase: Math.random() * 6, c: BUG_COLORS[bugs.length % 4], r: 50 + Math.random() * 40 });
  }

  // A result is saved the moment the level ends, before the celebration.
  function finishLevel() {
    const r = WG.result(level), stars = WG.stars(r);
    const nextWorld = cur.w + 1 < WG.WORLDS && !WG.worldOpen(save, lang, cur.w + 1) ? cur.w + 1 : -1;
    const rec = WG.record(save, lang, cur.w, cur.l, stars, r.time), got = WG.seedsFor(r, stars);
    save.seeds += got;
    persist();
    dda[lang].result(WG.outcome(r));
    result = { r: r, stars: stars, seeds: got, newBest: rec.newBest, newWorld: nextWorld >= 0 && WG.worldOpen(save, lang, nextWorld) ? nextWorld : -1 };
    ending = { t: 0.5 };
    J.levelUp();
    if (!calm()) for (let i = 0; i < 5; i++) burst(160 + i * 240, 160, ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], 24);
  }
  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function showResult() {
    ending = null; resultT = 0; resultLock = 0.8;
    const r = result;
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on'));
    $('resTitle').textContent = ['أحسنت!', 'رائع!', 'ممتاز!'][Math.max(0, r.stars - 1)];
    $('resTime').textContent = fmtTime(r.r.time);
    $('resMiss').textContent = String(r.r.errors);
    $('resSeeds').textContent = '+' + r.seeds;
    $('resBest').hidden = true;
    const last = cur.w === WG.WORLDS - 1 && cur.l === WG.LEVELS - 1;
    $('resNext').setAttribute('aria-label', last ? 'المراحل' : 'المرحلة التالية');
    say(starsText(r.stars));
    setScreen('result');
  }
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    for (let i = 0; i < r.stars; i++) if (at(0.25 + i * 0.35)) { $('resStars').children[i].classList.add('on'); J.star(i + 1); burst(560 + i * 80, 150, ['#ffd23f', '#ffffff']); }
    if (r.newBest && at(0.4 + r.stars * 0.35)) { $('resBest').hidden = false; J.chime(3); }
  }
  function next() {
    if (!result) return;
    J.select();
    if (cur.l < WG.LEVELS - 1) startLevel(cur.w, cur.l + 1);
    else if (cur.w < WG.WORLDS - 1 && WG.worldOpen(save, lang, cur.w + 1)) startLevel(cur.w + 1, 0);
    else toMap();
  }
  function again() { J.select(); startLevel(cur.w, cur.l); }

  /* -------------------------------------------------------------- garden */
  const items = [];
  function buildShop() {
    const box = $('shop');
    WG.SHOP.forEach(x => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'item'; b.dataset.id = x.id;
      const c = document.createElement('canvas'); c.width = 86; c.height = 80;
      A.icon(c, x.kind, x.id);
      const cost = document.createElement('span'); cost.className = 'cost';
      b.append(c, cost);
      on(b, () => buy(x, b));
      box.append(b); items.push({ x: x, el: b, cost: cost });
    });
  }
  const NAMES = { carrot: 'جزر', fence: 'سياج', tomato: 'طماطم', birdhouse: 'بيت العصفور', cactus: 'صبار', pond: 'بركة', pumpkin: 'يقطين',
    bench: 'مقعد', appletree: 'شجرة تفاح', fountain: 'نافورة', windmill: 'طاحونة هواء' };
  function refreshShop(fresh) {
    items.forEach(o => {
      const owned = save.owned.indexOf(o.x.id) >= 0;
      o.el.classList.toggle('owned', owned);
      o.el.classList.toggle('poor', !owned && save.seeds < o.x.cost);
      o.el.classList.toggle('fresh', o.x.id === fresh);
      o.cost.innerHTML = owned ? '<svg aria-hidden="true"><use href="#i-check"/></svg>' : '<svg aria-hidden="true"><use href="#i-seed"/></svg><b>' + o.x.cost + '</b>';
      o.el.setAttribute('aria-label', NAMES[o.x.id] + (owned ? ' ✓' : '، ' + o.x.cost + ' بذرة'));
    });
    chip('gardenSeeds', save.seeds);
    chip('gardenPlants', WG.total(save));
  }
  function toGarden() {
    gardenFrom = screen === 'map' ? 'map' : 'title';
    level = null; gardenLayer = null;
    refreshShop('');
    setScreen('garden');
    J.whoosh(0.4);
  }
  function leaveGarden() { J.back(); if (gardenFrom === 'map') toMap(); else toTitle(); }
  function buy(x, el) {
    if (save.owned.indexOf(x.id) >= 0) { J.tap(); return; }
    if (!WG.buy(save, x.id)) { J.error(); wiggle(el); return; }
    persist();
    J.coin(3); J.chime(2);
    gardenLayer = null;
    const p = x.kind === 'deco' ? DECO_AT[x.id] : { x: 640, y: 450 };
    if (!calm()) burst(p.x, p.y - 40, ['#ffd23f', '#5be38f', '#ff7eb6', '#ffffff'], 30);
    refreshShop(x.id);
    say(NAMES[x.id]);
  }
  // Where each decoration stands in the garden, and the plant beds: one plant per star.
  const DECO_AT = { windmill: { x: 1150, y: 352, s: 1 }, fountain: { x: 640, y: 372, s: 0.9 }, birdhouse: { x: 110, y: 420, s: 0.95 },
    fence: { x: 0, y: 0, s: 0 }, pond: { x: 175, y: 528, s: 0.95 }, bench: { x: 1105, y: 540, s: 0.9 } };
  function gardenSlots() {
    const out = [];
    for (let r = 0; r < 5; r++) for (let i = 0; i < 22; i++) {
      const x = 300 + i * 32 + (r % 2) * 16, y = 404 + r * 34;
      if (r < 1 && Math.abs(x - 640) < 70) continue;
      out.push({ x: x, y: y, s: 0.36 + r * 0.05 });
    }
    return out;
  }
  const SLOTS = gardenSlots();
  function bakeGarden() {
    const ps = pixelScale(), c = document.createElement('canvas');
    c.width = Math.ceil(W * ps); c.height = Math.ceil(H * ps);
    const g = c.getContext('2d');
    g.scale(ps, ps);
    g.drawImage(A.scene('garden', ps), 0, 0, W, H);
    // the beds, then a plant for every star earned (in both languages)
    A.rr(g, 270, 380, 760, 192, 40); g.fillStyle = '#8b5a2b'; g.fill(); g.lineWidth = 5; g.strokeStyle = A.INK; g.stroke();
    const kinds = WG.plantKinds(save), n = Math.min(SLOTS.length, WG.total(save)), r = seededRandom(7);
    for (let i = 0; i < n; i++) { const s = SLOTS[i]; A.plant(g, kinds[Math.floor(r() * kinds.length)], s.x, s.y + 8, s.s, 1); }
    for (let i = n; i < SLOTS.length; i += 3) A.mound(g, SLOTS[i].x, SLOTS[i].y + 8, false);
    if (save.owned.indexOf('fence') >= 0) { A.deco(g, 'fence', 360, 372, 1, 0); A.deco(g, 'fence', 920, 372, 1, 0); }
    gardenLayer = { c: c, ps: ps };
  }
  function seededRandom(n) { return () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }

  /* --------------------------------------------------------------- input */
  on($('btnAr'), () => pickLang('ar'));
  on($('btnEn'), () => pickLang('en'));
  on($('btnGarden'), () => { J.select(); toGarden(); });
  on($('mapGarden'), () => { J.select(); toGarden(); });
  on($('gardenBack'), leaveGarden);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), quit);
  on($('resNext'), () => { if (resultLock <= 0) next(); });
  on($('resAgain'), () => { if (resultLock <= 0) again(); });
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });
  canvas.addEventListener('pointerdown', () => focusGame());
  // Letters go straight to the engine on keydown (a slow frame never drops a letter).
  // Esc pauses (in update): P and M are letters here, so they never pause or mute.
  window.addEventListener('keydown', e => {
    if (!Kit.isGameKeyEvent(e) || screen !== 'play' || !level || ending) return;
    if (e.repeat || e.code === 'Escape') return;
    const ev = { key: e.key, code: e.code, shift: e.shiftKey };
    if (!WG.printable(ev)) return;
    e.preventDefault(); // ' and / open a quick-find bar in some browsers
    typeKey(ev);
  });
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) pickLang(lang); }
    else if (screen === 'map') { if (go) startNext(); else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'play') { if (K.pressed('Escape')) pause(true); }
    else if (screen === 'pause') { if (K.anyPressed(['Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); }
    else if (screen === 'garden') { if (K.pressed('Escape')) leaveGarden(); }
    else if (screen === 'result' && resultLock <= 0) {
      // R is free here: nobody is typing on the result card (and it waits a moment first).
      if (go) next(); else if (K.pressed('KeyR')) again();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }

  /* ----------------------------------------------------------------- loop */
  function decay(dt) {
    for (const k in lit) { lit[k].t -= dt; if (lit[k].t <= 0) delete lit[k]; }
    boardGlow = Math.max(0, boardGlow - dt * 1.4);
    cardPop = Math.min(1, cardPop + dt * 3.2);
    for (let i = flyers.length - 1; i >= 0; i--) { flyers[i].t += dt; if (flyers[i].t > 0.24) flyers.splice(i, 1); }
    for (let i = seeds.length - 1; i >= 0; i--) {
      const s = seeds[i];
      s.t += dt;
      if (s.t > 0.55) { seeds.splice(i, 1); s.plot.grow = true; J.pop(0.7); burst(s.x1, s.y1 - 10, ['#5be38f', '#ffd23f', '#ffffff'], 14); addBug(s.plot); }
    }
    for (const p of plots) if (p.grow && p.k < 1) p.k = Math.min(1, p.k + dt / 1.2);
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 30; if (f.t > 1.2) floats.splice(i, 1); }
    if (shownSeeds !== save.seeds && screen === 'play') { shownSeeds = save.seeds; chip('hudSeeds', save.seeds); }
  }
  function playStep(dt) {
    if (!ending) {
      WG.step(level, dt);
      if (level.ev.length) handleEvents(null, null);
    } else {
      ending.t -= dt;
      if (ending.t <= 0) showResult();
    }
  }
  function titleStep() {
    while (titleBugs.length < 5) titleBugs.push({ bee: titleBugs.length % 2 === 0, cx: 140 + titleBugs.length * 250, cy: 610 - (titleBugs.length % 2) * 40, phase: titleBugs.length * 1.7, c: BUG_COLORS[titleBugs.length % 4], r: 70 });
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play' && level) playStep(dt);
    else if (screen !== 'pause') {
      if (screen === 'title') titleStep();
      if (screen === 'result') resultStep(dt);
      if (resultLock > 0) resultLock -= dt;
    }
    if (screen !== 'pause') {
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 300) fx.list.splice(0, fx.list.length - 300);
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  function drawBug(g, b, t, dy) {
    const still = calm(), k = still ? b.phase : t * 0.9 + b.phase;
    const x = b.cx + Math.cos(k) * b.r, y = b.cy + (dy || 0) + Math.sin(k * 1.9) * 24, dir = Math.sin(k) > 0 ? 1 : -1;
    if (b.bee) A.bee(g, x, y, still ? 0 : t, dir, 1.1); else A.butterfly(g, x, y, still ? 0.1 : t, b.c, 1.1);
  }
  function drawFx(g) {
    fx.draw(g);
    for (const f of floats) {
      g.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.7) / 0.5);
      A.text(g, f.text, f.x, f.y, f.size * (calm() ? 1 : Math.min(1, 0.6 + f.t * 4)), f.color);
    }
    g.globalAlpha = 1;
  }
  function drawKeyboard(g) {
    const still = calm(), C = A.KB_CROP, kl = level.plan.lang;
    g.drawImage(A.keyboardBase(kl, pixelScale()), C.x, C.y, C.w, C.h);
    const it = WG.item(level), k = !ending && it && it.lit ? WG.need(level) : null;
    if (k) {
      A.keyLit(g, k.code, kl, 'glow', 1, time, still);
      if (k.shift) A.keyLit(g, WG.leftHand(k.code) ? 'ShiftRight' : 'ShiftLeft', kl, 'glow', 1, time, still);
    }
    for (const code in lit) if (!k || code !== k.code || lit[code].kind === 'bad') A.keyLit(g, code, kl, lit[code].kind, 1, time, still);
  }
  function drawPlay(g) {
    const still = calm(), ps = pixelScale(), it = WG.item(level);
    g.drawImage(A.scene('play', ps), 0, 0, W, H);
    A.driftClouds(g, time, still, 40);
    const playing = screen !== 'result';
    if (playing) A.board(g, boardGlow, ps);
    // the picture card pops in with every new word
    if (it && playing) {
      const K = A.CARD, s = still ? 1 : 1 - Math.pow(1 - cardPop, 3) * 0.6 + Math.sin(cardPop * Math.PI) * 0.08;
      const cx = 1022, cy = 196, img = A.card(it.pic, it.mod, ps);
      g.save(); g.translate(cx, cy); g.rotate(still ? 0.03 : 0.03 + Math.sin(time * 1.3) * 0.012); g.scale(s, s);
      g.drawImage(img, -(K.w + 16) / 2, -(K.h + 16) / 2, K.w + 16, K.h + 16);
      g.restore();
    }
    // the garden bed: a seed per word, a plant for every word spelled. On the result card
    // the keyboard goes and the bed slides down into the lawn, so every plant shows.
    const lift = playing ? 0 : still ? 1 : 1 - Math.pow(1 - Math.min(1, resultT / 0.6), 3), dy = lift * 190;
    A.bed(g, 400 + dy, ps);
    for (const p of plots) {
      A.mound(g, p.x, 426 + dy, !p.grow);
      if (p.grow) A.plant(g, p.kind, p.x, 424 + dy, 1, p.k, still ? 0 : Math.sin(time * 1.6 + p.phase) * 0.04);
    }
    for (const s of seeds) {
      const k = Math.min(1, s.t / 0.55), x = s.x0 + (s.x1 - s.x0) * k, y = s.y0 + (s.y1 - s.y0) * k - Math.sin(k * Math.PI) * 110;
      A.seed(g, x, y, k * 8);
    }
    for (const b of bugs) drawBug(g, b, time, dy);
    if (playing) drawKeyboard(g);
    for (const f of flyers) {
      const k = Math.min(1, f.t / 0.22), e = 1 - Math.pow(1 - k, 2);
      A.flyer(g, f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * 60, f.ch, level.plan.lang, 1.1 - k * 0.35);
    }
    drawFx(g);
  }
  const TITLE_PLANTS = ['tulip', 'sunflower', 'daisy', 'tulip', 'daisy', 'sunflower', 'tulip', 'daisy', 'tulip', 'sunflower', 'daisy', 'tulip'];
  function drawTitle(g) {
    const still = calm();
    g.drawImage(A.scene('title', pixelScale()), 0, 0, W, H);
    A.driftClouds(g, time, still, 60);
    for (let i = 0; i < TITLE_PLANTS.length; i++) {
      const x = 50 + i * 107, side = x < 260 || x > 1020;
      A.plant(g, TITLE_PLANTS[i], x, side ? 700 : 720, side ? 1.3 : 1, 1, still ? 0 : Math.sin(time * 1.4 + i) * 0.05);
    }
    for (const b of titleBugs) drawBug(g, b, time);
    drawFx(g);
  }
  function drawMap(g) {
    g.drawImage(A.scene('map', pixelScale()), 0, 0, W, H);
    A.driftClouds(g, time, calm(), 20);
    drawFx(g);
  }
  function drawGarden(g) {
    const still = calm(), ps = pixelScale();
    if (!gardenLayer || gardenLayer.ps !== ps) bakeGarden();
    g.drawImage(gardenLayer.c, 0, 0, W, H);
    const t = still ? 0.6 : time;
    for (const id of ['windmill', 'fountain', 'birdhouse', 'pond', 'bench']) if (save.owned.indexOf(id) >= 0) { const d = DECO_AT[id]; A.deco(g, id, d.x, d.y, d.s, t); }
    const n = Math.min(8, Math.floor(WG.total(save) / 6) + save.owned.length);
    for (let i = 0; i < n; i++) drawBug(g, { bee: i % 2 === 0, cx: 330 + (i * 97) % 640, cy: 330 + (i % 3) * 40, phase: i * 1.3, c: BUG_COLORS[i % 4], r: 60 + (i % 3) * 20 }, time);
    drawFx(g);
  }
  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const g = view.ctx;
    A.ps = pixelScale();
    g.save();
    g.translate(shake.x, shake.y);
    const base = screen === 'pause' ? pausedFrom : screen;
    if ((base === 'play' || base === 'result') && level) drawPlay(g);
    else if (base === 'map') drawMap(g);
    else if (base === 'garden') drawGarden(g);
    else drawTitle(g);
    g.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); gardenLayer = null; dirty = true; });
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px Fredoka', 'بتث'), document.fonts.load('700 40px Fredoka', 'Aa1')])
      .then(() => { A.reset(); gardenLayer = null; dirty = true; if (screen === 'play') renderWord(false); }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  window.__game = {
    get state() {
      const lv = level, it = lv && WG.item(lv), k = lv && !ending ? WG.need(lv) : null;
      return {
        screen: screen, paused: screen === 'pause', lang: lang, world: cur.w, level: cur.l,
        tier: lv ? lv.plan.tier : 0, mode: lv ? lv.plan.mode : '', t: lv ? Math.round(lv.t * 1000) / 1000 : 0,
        keys: lv ? lv.keys : 0, errors: lv ? lv.errors : 0, done: lv ? lv.done : 0, total: lv ? lv.total : 0, item: lv ? lv.i : -1,
        text: it ? it.text : '', pic: it ? it.pic : '', gaps: it ? it.gaps.map(g => [g[0], g[1]]) : [], pos: it ? it.pos : 0,
        missing: it && it.state === 'type' ? it.text.slice(it.pos, WG.gapEnd(it)) : '', complete: !!it && it.state === 'done',
        need: k ? k.code : '', shift: k ? !!k.shift : false, lit: !!(it && it.lit && k), wrong: it ? it.wrong : 0,
        wordText: $('word').textContent.replace(/‍/g, ''), holes: $('word').querySelectorAll('.hole').length,
        over: lv ? lv.over : false, ending: !!ending, stars: result ? result.stars : 0, seedsWon: result ? result.seeds : 0, newBest: result ? result.newBest : false,
        grown: plots.filter(p => p.grow).length, bugs: bugs.length, flyers: flyers.length, seeds: save.seeds, clock: Math.round(time * 100) / 100
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    engine: WG,
    // Where a logical point or an on-screen key is on the page, for tests that use the real mouse.
    point: page,
    keyPoint: code => { const c = A.keyCenter(code); return c ? page(c.x, c.y) : null; }
  };

  buildMap();
  buildShop();
  // M and P are letters children type here: mute is the button only and pause is Esc
  // or the button (as in «أصابع البرق»).
  Kit.muteButton({ key: false });
  Kit.lifecycle({ pause: () => pause(false), reset: () => { for (const k in lit) delete lit[k]; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();

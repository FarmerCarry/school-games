/* Seek and Zoom (ابحث وكبّر): screens, the mouse wheel, drags and clicks, the tile
 * cache that keeps the huge scenes fast on old PCs, hints, the coach, saves and sound.
 * engine.js places everything and does the camera maths; art.js draws.
 * This is the UI layer: it reads Kit.dda at every round start (thing size, look-alikes,
 * hint delay, speed of moving things, the time limit and whether wrong clicks in a row
 * cost seconds) and reports each finished or timed-out round back to it. */
(function () {
  'use strict';
  const SZ = window.SZ, A = SZ.art, J = Kit.juice, W = SZ.W, H = SZ.H;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  const INTRO_T = 2.6;           // s the list shows big before a round
  const PRAISE = ['رائع!', 'ممتاز!', 'أحسنت!', 'مذهل!'];

  /* --------------------------------------------------------------- state */
  let dirty = true, trayKey = '', time = 0;
  let screen = 'title', wi = 0, ri = 0, R = null, S = null, cam = null;
  let intro = null, celebrate = 0, result = null, resultT = 0, resultLock = 0, moves = 0;
  let floats = [], flyers = [], rings = [], shown = [], bumps = [], lastFind = -9, streak = 0, lastClick = null;
  let hint = { wait: 0, delay: 10, ready: false, on: 0, it: null, auto: false };
  let coach = { drag: false, zoom: false, t: 0, panned: 0, z0: 1, lockNote: -9 };
  let lastTick = -1, wheelSound = 0, tier = 1, lastSec = -1, idle = 0;
  const plays = {};
  const ptr = { x: W / 2, y: H / 2, known: false };
  const drag = { on: false, id: -1, x0: 0, y0: 0, x: 0, y: 0, moved: false, vx: 0, vy: 0, lt: 0 };
  const menu = { cam: { x: 1280, y: 720, z: 0.62 }, lensZ: 2.4, lens: { x: 1000, y: 330 }, R: null };
  const view = Kit.fit(canvas, W, H, { maxDpr: 1, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    dirty = true; trayKey = '';
  } });
  const fx = Kit.particles();

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('seek-zoom');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = SZ.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty for the whole game (Kit keeps it on this PC).
  const dda = Kit.dda('seek-zoom', { id: 'main' });

  /* --------------------------------------------------------------- tiles */
  // A scene is several screens big and made of hundreds of vector things. It is drawn
  // once into tiles at four zoom levels and the tiles are reused: a frame only copies
  // tiles. The coarsest level is drawn whole when a place opens and stands in while a
  // sharper tile is being drawn (a few per frame, nearest the middle first). Least
  // recently used tiles are dropped, so memory stays bounded.
  const LV = [0.5, 1, 2, 4], TS = [512, 256, 256, 256], CAP = [64, 56, 40, 36];
  const caches = {}, pools = { 512: [], 256: [] };
  function cacheOf(w) { return caches[w] || (caches[w] = LV.map(() => new Map())); }
  function recycle(c) { const p = pools[c.width]; if (p && p.length < 12) p.push(c); }
  function dropCaches(keep) {
    for (const k in caches) if (keep.indexOf(+k) < 0) { caches[k].forEach(m => m.forEach(recycle)); delete caches[k]; }
  }
  function resetTiles() { for (const k in caches) caches[k].forEach(m => { m.forEach(recycle); m.clear(); }); dirty = true; }
  function renderTile(w, li, i, j) {
    const L = LV[li], size = TS[li], span = size / L;
    let c = pools[size].pop();
    if (!c) { c = document.createElement('canvas'); c.width = size; c.height = size; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, size, size);
    g.setTransform(L, 0, 0, L, -i * size, -j * size);
    A.drawScene(g, SZ.scene(w), i * span, j * span, (i + 1) * span, (j + 1) * span);
    return c;
  }
  function tile(w, li, i, j, make) {
    const m = cacheOf(w)[li], key = j * 4096 + i;
    let c = m.get(key);
    if (c) { if (li) { m.delete(key); m.set(key, c); } return c; }
    if (!make) return null;
    c = renderTile(w, li, i, j);
    m.set(key, c);
    if (m.size > CAP[li]) { const old = m.keys().next().value; recycle(m.get(old)); m.delete(old); }
    return c;
  }
  function ensureBase(w) {
    const Sc = SZ.scene(w), span = TS[0] / LV[0];
    for (let j = 0; j * span < Sc.h; j++) for (let i = 0; i * span < Sc.w; i++) tile(w, 0, i, j, true);
  }
  const D = () => view.scale * view.dpr;
  // Copies the tiles of level li that cover the box of the view (device pixels, snapped so
  // neighbouring tiles meet exactly). make: draw missing tiles too.
  function blit(ctx, w, li, k, ox, oy, box, make) {
    const Sc = SZ.scene(w), span = TS[li] / LV[li];
    const i0 = Math.max(0, Math.floor(box[0] / span)), i1 = Math.min(Math.ceil(Sc.w / span) - 1, Math.floor(box[2] / span));
    const j0 = Math.max(0, Math.floor(box[1] / span)), j1 = Math.min(Math.ceil(Sc.h / span) - 1, Math.floor(box[3] / span));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const t = tile(w, li, i, j, make);
      if (!t) continue;
      const x0 = Math.round(i * span * k + ox), x1 = Math.round((i + 1) * span * k + ox), y0 = Math.round(j * span * k + oy), y1 = Math.round((j + 1) * span * k + oy);
      ctx.drawImage(t, x0, y0, x1 - x0, y1 - y0);
    }
  }
  // Draws place w as seen by camera c (x, y, z) inside the box of the screen sb (logical px).
  function drawScene(ctx, w, c, sb) {
    const Sc = SZ.scene(w), d = D(), k = c.z * d, ox = (W / 2 - c.x * c.z) * d, oy = (H / 2 - c.y * c.z) * d;
    sb = sb || [0, 0, W, H];
    const box = [c.x + (sb[0] - W / 2) / c.z, c.y + (sb[1] - H / 2) / c.z, c.x + (sb[2] - W / 2) / c.z, c.y + (sb[3] - H / 2) / c.z];
    const li = k <= 0.7 ? 0 : k <= 1.3 ? 1 : k <= 2.6 ? 2 : 3;
    let busy = false;
    if (li) {
      const span = TS[li] / LV[li], miss = [];
      const i0 = Math.max(0, Math.floor(box[0] / span)), i1 = Math.min(Math.ceil(Sc.w / span) - 1, Math.floor(box[2] / span));
      const j0 = Math.max(0, Math.floor(box[1] / span)), j1 = Math.min(Math.ceil(Sc.h / span) - 1, Math.floor(box[3] / span));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!tile(w, li, i, j, false)) miss.push([i, j, Math.hypot((i + 0.5) * span - c.x, (j + 0.5) * span - c.y)]);
      miss.sort((a, b) => a[2] - b[2]);
      const t0 = performance.now();
      let n = 0;
      for (; n < miss.length; n++) { if (n && performance.now() - t0 > 6) break; tile(w, li, miss[n][0], miss[n][1], true); }
      busy = n < miss.length;
    }
    if (!li || busy) blit(ctx, w, 0, k, ox, oy, box, true);
    if (li) blit(ctx, w, li, k, ox, oy, box, false);
    if (busy) dirty = true;
    // Past the scene's edges (only ever a sliver beside the HUD): the place's frame colour.
    const Wd = SZ.WORLDS[w], ex0 = Math.round(ox), ey0 = Math.round(oy), ex1 = Math.round(Sc.w * k + ox), ey1 = Math.round(Sc.h * k + oy), cw = canvas.width, ch = canvas.height;
    ctx.fillStyle = Wd.frame;
    if (ex0 > 0) ctx.fillRect(0, 0, ex0, ch);
    if (ex1 < cw) ctx.fillRect(ex1, 0, cw - ex1, ch);
    if (ey0 > 0) ctx.fillRect(0, 0, cw, ey0);
    if (ey1 < ch) ctx.fillRect(0, ey1, cw, ch - ey1);
  }

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', book: 'scrBook' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    drag.on = false;
    setCursor();
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function setCursor() { canvas.style.cursor = screen === 'play' ? (drag.on && drag.moved ? 'grabbing' : 'grab') : 'default'; }
  function chip(id, text) { $(id).querySelector('b').textContent = text; }

  function toTitle() {
    leaveRound();
    chip('titleStars', SZ.totalStars(save) + '/' + SZ.COUNT * 3);
    setScreen('title');
  }
  function play() {
    J.select();
    // A child who has never played goes straight into the first round.
    if (!SZ.totalStars(save)) startRound(0); else toMap();
  }
  function leaveRound() { R = null; intro = null; result = null; flyers = []; floats = []; rings = []; fx.clear(); }

  /* ---------------------------------------------------------------- map */
  const worldCards = [];
  function buildMap() {
    const box = $('worlds');
    SZ.WORLDS.forEach((Wd, w) => {
      const card = document.createElement('div');
      card.className = 'world';
      // Right to left like Arabic reading: the park is on the right.
      card.style.left = (1034 - w * 240) + 'px';
      card.style.setProperty('--wc', Wd.color);
      card.innerHTML = '<i class="num">' + (w + 1) + '</i><button type="button" class="sz-btn pic" aria-label="' + Wd.name + '"><canvas width="200" height="113"></canvas></button>' +
        '<b>' + Wd.name + '</b><span class="wstars"><svg aria-hidden="true"><use href="#i-star"/></svg><em>0</em></span><div class="rounds"></div>' +
        '<span class="lock"><svg aria-hidden="true"><use href="#i-lock"/></svg></span>';
      const rounds = card.querySelector('.rounds');
      for (let r = 0; r < SZ.PER; r++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sz-btn rnd';
        b.innerHTML = '<span class="n">' + (r + 1) + '</span><span class="st"><i></i><i></i><i></i></span>';
        on(b, () => pickRound(w * SZ.PER + r, b));
        rounds.appendChild(b);
      }
      on(card.querySelector('.pic'), () => pickWorld(w, card));
      box.appendChild(card); worldCards.push(card);
    });
  }
  let thumbsDrawn = false;
  function refreshMap() {
    if (!thumbsDrawn) { worldCards.forEach((c, w) => A.thumb(c.querySelector('canvas'), w)); thumbsDrawn = true; }
    const next = SZ.nextRound(save);
    worldCards.forEach((card, w) => {
      const open = SZ.worldOpen(save, w);
      card.classList.toggle('locked', !open);
      card.querySelector('em').textContent = SZ.worldStars(save, w) + '/' + SZ.PER * 3;
      card.querySelectorAll('.rnd').forEach((b, r) => {
        const i = w * SZ.PER + r, st = save.r[i][0], ok = SZ.isOpen(save, i);
        b.classList.toggle('locked', !ok); b.classList.toggle('next', i === next); b.classList.toggle('done', st > 0);
        b.querySelectorAll('.st i').forEach((s, k) => s.classList.toggle('on', k < st));
        b.setAttribute('aria-label', 'المرحلة ' + (r + 1) + (ok ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
      });
      card.querySelector('.pic').setAttribute('aria-label', SZ.WORLDS[w].name + (open ? '' : ' (مقفل)'));
    });
    chip('mapStars', SZ.totalStars(save) + '/' + SZ.COUNT * 3);
  }
  function toMap() { leaveRound(); refreshMap(); setScreen('map'); J.whoosh(0.4); }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickRound(i, el) {
    if (!SZ.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select(); startRound(i);
  }
  function pickWorld(w, el) {
    if (!SZ.worldOpen(save, w)) { J.error(); wiggle(el); return; }
    let i = w * SZ.PER;
    for (let r = 0; r < SZ.PER; r++) { const k = w * SZ.PER + r; if (SZ.isOpen(save, k)) i = k; if (SZ.isOpen(save, k) && !save.r[k][0]) { i = k; break; } }
    J.select(); startRound(i);
  }

  /* -------------------------------------------------------------- rounds */
  function startRound(i) {
    const w = Math.floor(i / SZ.PER), r = i % SZ.PER;
    // Difficulty is read at every round start and handed to the engine as plain numbers.
    tier = dda.tier;
    const p = { size: dda.value(1.2, 0.85), decoys: dda.pick([0, 1, 2, 3, 4]), speed: dda.value(0.75, 1.25), pen: tier >= 3 ? 5 : 0,
      timeK: dda.value(1.3, 0.85), seed: (plays[i] || 0) % 3 };
    plays[i] = (plays[i] || 0) + 1;
    if (w !== wi || !caches[w]) { dropCaches([0, w]); }
    wi = w; ri = r; S = SZ.scene(w);
    ensureBase(w);
    R = SZ.makeRound(w, r, p);
    R.moving = R.items.some(it => it.m);
    cam = SZ.camera(S, R);
    intro = { t: 0, out: false, o: 0 };
    celebrate = 0; result = null; moves = 0; lastFind = -9; streak = 0; lastClick = null; lastTick = -1;
    floats = []; flyers = []; rings = []; fx.clear();
    shown = R.list.map(() => 0); bumps = R.list.map(() => 0); trayKey = '';
    hint = { wait: 0, delay: dda.value(7, 20), ready: false, on: 0, it: null, auto: tier <= 2 };
    coach = { drag: !save.coach[0] && R.d.lock === 1, zoom: !save.coach[1] && !R.d.lock, t: 0, panned: 0, z0: cam.z, lockNote: -9 };
    drag.on = false;
    Kit.keys.reset();
    paintZoom();
    $('zoomBox').hidden = !!R.d.lock;
    $('btnHint').classList.remove('ready');
    setScreen('play');
    say(SZ.WORLDS[w].name + '، المرحلة ' + (r + 1));
    J.whoosh(0.5);
  }
  function endIntro() {
    if (!intro || intro.out) return;
    intro.out = true; intro.o = calm() ? 1 : 0;
    if (intro.o >= 1) intro = null;
    dirty = true;
  }
  function restart() { if (!R) return; J.select(); startRound(R.i); }
  function pause(own) {
    if (screen !== 'play') return;
    drag.on = false; cam.vx = cam.vy = 0;
    setScreen('pause');
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }

  /* ------------------------------------------------------------- clicks */
  const tmp = {};
  function screenOf(it, out) { const p = SZ.pos(it, R.t, tmp); return SZ.toScreen(cam, p.x, p.y, out || {}); }
  function overHud(x, y) {
    const T = trayGeo(R.list.length);
    return (y >= T.y && x >= T.x && x <= T.x + T.w) || (y < 66 && x > 540 && x < 740);
  }
  function float(x, y, text, color, size, t) { floats.push({ x, y, text, color, size: size || 34, t: 0, life: t || 1.2 }); if (floats.length > 10) floats.shift(); }
  function ring(x, y, color, r) { rings.push({ x, y, t: 0, color, r: r || 30 }); if (rings.length > 12) rings.shift(); }
  function doClick(x, y) {
    if (!R || screen !== 'play') return;
    if (intro) { endIntro(); return; }
    if (R.done || R.over || overHud(x, y)) return;
    // The second click of a double click on the same spot is not a second try.
    const now = time;
    if (lastClick && now - lastClick.t < 0.4 && Math.hypot(x - lastClick.x, y - lastClick.y) < 14 && lastClick.miss) return;
    const h = SZ.click(R, cam, x, y);
    lastClick = { t: now, x, y, miss: h.t === 'miss' || h.t === 'decoy' };
    hint.wait = 0;
    if (h.t === 'found') found(h);
    else if (h.t === 'miss' || h.t === 'decoy') {
      J.error();
      ring(x, y, '#ffffff', 26);
      if (h.it) { h.it.wob = 0.5; }
      if (h.pen) { J.back(); float(640, 92, '+' + h.pen, '#ff5d6c', 40, 1.4); }
      streak = 0;
    } else if (h.t === 'small' || h.t === 'closed') {
      J.tap();
      if (h.it && h.it.cv) h.it.wob = 0.5;
      floats.push({ x, y: y - 40, wheel: true, t: 0, life: 1.6 });
      if (floats.length > 10) floats.shift();
    }
  }
  function found(h) {
    const it = h.it, p = screenOf(it, {}), rs = it.r * cam.z;
    streak = time - lastFind < 4 ? streak + 1 : 1;
    lastFind = time;
    J.pop(0.6); J.streak(Math.min(8, R.found));
    fx.burst(p.x, p.y, { count: 22, colors: ['#ffd23f', '#ffffff', '#ff7eb6', '#4fd1ff'], speed: 320, life: 0.7, size: 8, gravity: 200 });
    ring(p.x, p.y, '#ffd23f', Math.max(30, rs * 1.6));
    flyers.push({ k: it.k, v: it.v, e: it.e, x: p.x, y: p.y, r: Math.max(14, rs), t: calm() ? 1 : 0, pop: 0 });
    if (streak >= 2) float(p.x, p.y - Math.max(40, rs * 1.4), PRAISE[Math.min(3, streak - 2)], '#ffd23f', 40);
    hint.on = 0; hint.wait = 0; hint.ready = false; $('btnHint').classList.remove('ready');
    say(SZ.label(it.k, it.v));
    if (R.done) { celebrate = 0; J.levelUp(); confetti(); }
  }
  function confetti() {
    if (calm()) return;
    for (let i = 0; i < 5; i++) fx.burst(160 + i * 240, 160, { count: 22, colors: ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], speed: 380, life: 1.1, size: 9, gravity: 420 });
  }

  /* ------------------------------------------------------------- result */
  function showResult() {
    const stars = SZ.stars(R), tenths = SZ.tenths(R), res = SZ.applyResult(save, R.i, stars, tenths);
    if (coach.panned > 100) save.coach[0] = 1;
    if (!R.d.lock && cam.z !== coach.z0) save.coach[1] = 1;
    persist();
    dda.result(SZ.outcome(R));
    result = { stars, tenths, res, timeUp: false, i: R.i };
    openResult();
  }
  function showTimeUp() {
    J.fail();
    dda.result(0.1);
    result = { stars: 0, tenths: SZ.tenths(R), res: null, timeUp: true, i: R.i };
    openResult();
  }
  const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); };
  function openResult() {
    resultT = 0; resultLock = 0.6;
    // Without the HUD the scene fills the screen behind the card.
    cam.an = false; cam.vx = cam.vy = 0; cam.tz = cam.z;
    SZ.clampCam(cam, { l: 0, r: 0, t: 0, b: 0 });
    const r = result, Wd = SZ.WORLDS[wi];
    $('resPlace').textContent = r.timeUp ? 'انتهى الوقت!' : Wd.name + ' · ' + (ri + 1);
    $('resStars').hidden = r.timeUp;
    $('resStars').querySelectorAll('svg').forEach(s => { s.classList.remove('on', 'pop'); });
    $('resTime').textContent = fmt(r.tenths / 10);
    $('resMiss').textContent = String(R.wrong);
    $('resFound').textContent = R.found + '/' + R.total;
    $('resFoundFact').hidden = !r.timeUp;
    $('resMissFact').hidden = r.timeUp;
    $('resBest').hidden = true;
    const newSticker = r.res && (r.res.first || r.res.shiny);
    $('resSticker').hidden = !newSticker;
    if (newSticker) {
      const c = $('resStickerArt'), g = c.getContext('2d'), f = R.d.f[0];
      g.clearRect(0, 0, c.width, c.height);
      A.sticker(g, f[0], f[1], 60, 60, 54, Wd.color, save.r[R.i][0] === 3, false);
      $('resStickerText').textContent = r.res.first ? 'ملصق جديد!' : 'ملصق لامع!';
    }
    const last = r.i + 1 >= SZ.COUNT;
    $('resNext').hidden = r.timeUp || last;
    $('resAgain').classList.toggle('sz-go', r.timeUp || last);
    $('resAgain').classList.toggle('ring', r.timeUp || last);
    $('resNext').setAttribute('aria-label', 'المرحلة التالية');
    say(r.timeUp ? 'انتهى الوقت' : Wd.name + '، ' + r.stars + ' نجوم');
    setScreen('result');
  }
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    if (resultLock > 0) resultLock -= dt;
    if (r.timeUp) return;
    const at = t => before < t && resultT >= t;
    for (let i = 0; i < r.stars; i++) {
      if (at(0.3 + i * 0.35)) {
        const s = $('resStars').children[i]; s.classList.add('on', 'pop'); J.star(i + 1);
        fx.burst(520 + i * 120, 190, { count: 18, colors: ['#ffd23f', '#ffffff'], speed: 300, life: 0.7, size: 8, gravity: 300 });
      }
    }
    if (r.res && r.res.best && at(0.4 + r.stars * 0.35)) { $('resBest').hidden = false; J.chime(3); confetti(); }
  }
  function resultNext() {
    if (!result || resultLock > 0) return;
    if (result.timeUp || result.i + 1 >= SZ.COUNT) { resultAgain(); return; }
    J.select(); startRound(result.i + 1);
  }
  function resultAgain() { if (result && resultLock <= 0) { J.select(); startRound(result.i); } }

  /* --------------------------------------------------------------- book */
  const stickerCanvases = [];
  function buildBook() {
    const box = $('stickers');
    SZ.WORLDS.forEach((Wd, w) => {
      const row = document.createElement('div');
      row.className = 'srow';
      row.innerHTML = '<b style="color:' + Wd.color + '">' + Wd.name + '</b>';
      for (let r = 0; r < SZ.PER; r++) { const c = document.createElement('canvas'); c.width = 100; c.height = 100; row.appendChild(c); stickerCanvases.push(c); }
      box.appendChild(row);
    });
  }
  function openBook() {
    J.select();
    stickerCanvases.forEach((c, i) => {
      const g = c.getContext('2d'), f = SZ.round(i).f[0], st = save.r[i][0];
      g.clearRect(0, 0, 100, 100);
      A.sticker(g, f[0], f[1], 50, 50, 44, SZ.WORLDS[Math.floor(i / SZ.PER)].color, st === 3, !st);
    });
    chip('bookCount', SZ.stickers(save) + '/' + SZ.COUNT);
    setScreen('book');
  }

  /* ------------------------------------------------------------- camera */
  function paintZoom() {
    if (!cam) return;
    const k = cam.zmax > cam.zmin ? (Math.log(cam.tz) - Math.log(cam.zmin)) / (Math.log(cam.zmax) - Math.log(cam.zmin)) : 0;
    $('zoomFill').style.height = Math.round(k * 100) + '%';
    $('btnIn').classList.toggle('off', cam.tz >= cam.zmax);
    $('btnOut').classList.toggle('off', cam.tz <= cam.zmin);
  }
  // The middle of the free part of the screen (beside the zoom column, above the list).
  const MID = { x: (SZ.PAD.l + W) / 2, y: (SZ.PAD.t + H - SZ.PAD.b) / 2 };
  function zoomBy(x, y, f) {
    if (!R || !cam) return false;
    if (R.d.lock) { lockNote(x, y); return false; }
    if (intro) endIntro();
    const ok = SZ.zoomAt(cam, x, y, f, calm());
    if (ok) { moves++; dirty = true; paintZoom(); }
    return ok;
  }
  function panBy(dx, dy) {
    if (!cam) return;
    if (intro) endIntro();
    if (SZ.pan(cam, dx, dy)) { coach.panned += Math.abs(dx) + Math.abs(dy); dirty = true; }
  }
  // In the first rounds the zoom is still locked: the wheel shows the dragging hand instead.
  function lockNote(x, y) {
    if (time - coach.lockNote < 2) return;
    coach.lockNote = time;
    floats.push({ x, y: y - 30, hand: true, t: 0, life: 1.8 });
  }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnBook'), openBook);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('bookBack'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMenu'), () => { J.back(); toMap(); });
  on($('btnIn'), () => { if (zoomBy(MID.x, MID.y, 1.45)) J.tap(); });
  on($('btnOut'), () => { if (zoomBy(MID.x, MID.y, 1 / 1.45)) J.tap(); });
  on($('btnHint'), () => showHint(true));
  on($('resNext'), resultNext);
  on($('resAgain'), resultAgain);
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });

  // The wheel zooms the game and never the page: not scrolling, not Ctrl+wheel browser zoom.
  window.addEventListener('wheel', e => {
    e.preventDefault();
    const p = view.toLogical(e.clientX, e.clientY);
    ptr.x = p.x; ptr.y = p.y; ptr.known = true;
    const f = SZ.wheelFactor(e.deltaY, e.deltaMode);
    if (screen === 'title') { menu.lensZ = SZ.clamp(menu.lensZ * f, 1.4, 4); dirty = true; return; }
    if (screen !== 'play' || !R) return;
    if (e.deltaX && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { panBy(-e.deltaX * (e.deltaMode === 1 ? 40 : 1), 0); return; }
    if (f !== 1 && zoomBy(p.x, p.y, f) && time - wheelSound > 0.09) { wheelSound = time; J.hover(); }
  }, { passive: false });

  canvas.addEventListener('pointerdown', e => {
    focusGame();
    const p = view.toLogical(e.clientX, e.clientY);
    ptr.x = p.x; ptr.y = p.y; ptr.known = true;
    if (e.button !== 0 || screen !== 'play' || !R) return;
    drag.on = true; drag.id = e.pointerId; drag.x0 = drag.x = p.x; drag.y0 = drag.y = p.y; drag.moved = false; drag.vx = drag.vy = 0; drag.lt = performance.now();
    cam.vx = cam.vy = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
  });
  window.addEventListener('pointermove', e => {
    const p = view.toLogical(e.clientX, e.clientY);
    ptr.x = p.x; ptr.y = p.y; ptr.known = true;
    if (screen === 'title') dirty = true;
    if (!drag.on) return;
    // A button let go where the page could not see it ends the drag here.
    if (e.buttons === 0) { endDrag(false); return; }
    const dx = p.x - drag.x, dy = p.y - drag.y, now = performance.now();
    drag.x = p.x; drag.y = p.y;
    if (!drag.moved) {
      if (Math.hypot(p.x - drag.x0, p.y - drag.y0) < 8) return;
      drag.moved = true; moves++; setCursor();
      panBy(p.x - drag.x0, p.y - drag.y0);
    } else panBy(dx, dy);
    const dt = Math.max(4, now - drag.lt) / 1000;
    drag.vx = drag.vx * 0.5 + (dx / dt) * 0.5; drag.vy = drag.vy * 0.5 + (dy / dt) * 0.5; drag.lt = now;
  });
  function endDrag(cancel) {
    if (!drag.on) return;
    drag.on = false;
    if (screen === 'play' && R) {
      if (drag.moved) {
        // A flick glides on a little (never with reduced motion, never after holding still).
        if (!calm() && performance.now() - drag.lt < 90) { cam.vx = SZ.clamp(drag.vx, -2400, 2400); cam.vy = SZ.clamp(drag.vy, -2400, 2400); }
      } else if (!cancel) doClick(drag.x0, drag.y0);
    }
    setCursor();
  }
  window.addEventListener('pointerup', () => endDrag(false));
  window.addEventListener('pointercancel', () => endDrag(true));

  const GO = ['Enter', 'NumpadEnter', 'Space'];
  function handleKeys(dt) {
    const K = Kit.keys, go = K.anyPressed(GO);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') { if (go) { J.select(); startRound(SZ.nextRound(save)); } else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'book') { if (go || K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result') {
      if (resultLock > 0) return;
      if (go) resultNext(); else if (K.pressed('KeyR')) resultAgain(); else if (K.pressed('Escape')) { J.back(); toMap(); }
    } else if (screen === 'play' && R) {
      if (K.anyPressed(['KeyP', 'Escape'])) { pause(true); return; }
      if (intro && go) endIntro();
      if (K.pressed('KeyH')) showHint(true);
      // Arrows (or WASD) move the view; + and − zoom around the middle.
      const mx = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
      const my = (K.anyDown(['ArrowDown', 'KeyS']) ? 1 : 0) - (K.anyDown(['ArrowUp', 'KeyW']) ? 1 : 0);
      if (mx || my) { const v = 620 * dt; if (!coach.keyPan) { coach.keyPan = true; moves++; } panBy(-mx * v, -my * v); }
      else coach.keyPan = false;
      const zi = K.anyDown(['Equal', 'NumpadAdd']), zo = K.anyDown(['Minus', 'NumpadSubtract']);
      if (zi !== zo) zoomBy(MID.x, MID.y, Math.exp((zi ? 1.7 : -1.7) * dt));
    }
  }

  /* -------------------------------------------------------------- hints */
  // After a wait without finding anything the magnifying glass glows; pressed (or by itself
  // for the youngest players) it points to the nearest thing still to find.
  function hintTarget() {
    let best = null, bd = Infinity;
    for (const it of R.items) {
      if (it.e < 0 || it.got) continue;
      const p = SZ.pos(it, R.t, tmp), d = Math.hypot(p.x - cam.x, p.y - cam.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function showHint(own) {
    if (!R || screen !== 'play' || R.done || R.over || intro) return;
    if (own && !hint.ready) { J.tap(); wiggle($('btnHint')); return; }
    hint.it = hintTarget();
    if (!hint.it) return;
    hint.on = 4.5; hint.ready = false; hint.wait = 0;
    $('btnHint').classList.remove('ready');
    J.chime(1);
  }
  function hintStep(dt) {
    if (hint.on > 0) { hint.on -= dt; if (hint.on <= 0 || !hint.it || hint.it.got) { hint.on = 0; hint.it = null; } return; }
    hint.wait += dt;
    if (!hint.ready && hint.wait >= hint.delay) { hint.ready = true; $('btnHint').classList.add('ready'); J.hover(); }
    if (hint.ready && hint.auto && hint.wait >= hint.delay + 4) showHint(false);
  }

  /* ---------------------------------------------------------------- loop */
  function decay(dt) {
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t > f.life) floats.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.6) rings.splice(i, 1); }
    for (let i = 0; i < bumps.length; i++) bumps[i] = Math.max(0, bumps[i] - dt * 3);
    if (R) for (const it of R.items) if (it.wob > 0) it.wob = Math.max(0, it.wob - dt);
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.pop += dt;
      if (f.pop < 0.18 && !calm()) continue;
      f.t += dt / 0.6;
      if (f.t >= 1) {
        flyers.splice(i, 1);
        shown[f.e] = Math.min(R ? R.list[f.e].n : 0, shown[f.e] + 1); bumps[f.e] = 1;
        if (R && shown[f.e] >= R.list[f.e].n) J.chime(2); else J.coin(1 + (shown[f.e] % 5));
      }
    }
  }
  function playStep(dt) {
    if (intro) {
      if (!intro.out) { intro.t += dt; if (intro.t >= INTRO_T) endIntro(); }
      else { intro.o += dt / 0.35; if (intro.o >= 1) intro = null; }
    }
    if (!intro || intro.out) SZ.tick(R, dt);
    if (SZ.stepCam(cam, dt, calm())) { paintZoom(); dirty = true; }
    if (!intro && !R.done && !R.over) hintStep(dt);
    coach.t += dt;
    if (coach.drag && coach.panned > 160) coach.drag = false;
    if (coach.zoom && cam.z > coach.z0 * 1.35) coach.zoom = false;
    // The last seconds of a timed round tick.
    if (R.limit && !R.done && !R.over) {
      const left = Math.ceil(SZ.left(R));
      if (left !== lastTick) { if (lastTick > 0 && left <= 3 && left >= 1) J.countdown(left); lastTick = left; }
    }
    if (R.done) { celebrate += dt; if (celebrate > 1.25 && !flyers.length) showResult(); }
    else if (R.over && R.timeUp) showTimeUp();
  }
  // Redraw every frame while something moves (the camera, moving things, effects, the
  // hint, the coach, the list's intro); a still view only needs its clock and the things'
  // gentle idle motion, so it is drawn every third frame (or once a second with reduced motion).
  function busy() {
    const sec = Math.floor(R.limit ? SZ.left(R) : R.t + R.pen);
    if (sec !== lastSec) { lastSec = sec; return true; }
    if (intro || R.done || hint.on > 0 || coach.drag || coach.zoom || R.moving || flyers.length || bumps.some(b => b > 0) || floats.length || rings.length || fx.list.length || R.items.some(it => it.wob > 0)) return true;
    return !calm() && ++idle % 3 === 0;
  }
  function menuStep(dt) {
    if (calm()) return;
    const c = menu.cam;
    c.x = 1280 + Math.sin(time * 0.045) * 240; c.y = 720 + Math.sin(time * 0.07) * 130;
    if (!ptr.known) { menu.lens.x = 1000 + Math.sin(time * 0.5) * 110; menu.lens.y = 330 + Math.sin(time * 0.8) * 50; }
  }
  function update(dt) {
    time += dt;
    handleKeys(dt);
    if (screen === 'play' && R) { playStep(dt); if (busy()) dirty = true; }
    else if (screen === 'title') { menuStep(dt); dirty = true; }
    else if (screen === 'result' && result) resultStep(dt);
    if (screen !== 'pause') {
      fx.update(dt); decay(dt);
      if (fx.list.length > 260) fx.list.splice(0, fx.list.length - 260);
      if (fx.list.length || floats.length) dirty = true;
    }
    Kit.keys.endFrame();
  }

  /* -------------------------------------------------------------- render */
  const CW = 118, CH = 96, GAP = 10;
  function trayGeo(n) {
    const w = n * CW + (n - 1) * GAP + 24, x = Math.round((W - w) / 2);
    return { x, y: H - CH - 30, w, h: CH + 24, cx: i => x + 12 + (n - 1 - i) * (CW + GAP) };
  }
  const tray = { c: null };
  function trayLayer() {
    const d = D(), n = R.list.length, T = trayGeo(n);
    const key = [d, wi, ri, shown.join(), bumps.map(b => b.toFixed(2)).join()].join('|');
    if (!tray.c) tray.c = document.createElement('canvas');
    if (key !== trayKey) {
      trayKey = key;
      const c = tray.c;
      c.width = Math.ceil((T.w + 40) * d); c.height = Math.ceil((T.h + 30) * d);
      const g = c.getContext('2d');
      g.setTransform(d, 0, 0, d, 20 * d, 20 * d);
      A.rr(g, 0, 0, T.w, T.h, 26); g.fillStyle = 'rgba(43,36,82,0.82)'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke();
      R.list.forEach((e, i) => A.card(g, { k: e.k, v: e.v, n: e.n, got: shown[i] }, T.cx(i) - T.x, 12, CW, CH, bumps[i], shown[i] >= e.n));
    }
    return tray.c;
  }
  function drawItems(ctx) {
    const d = D(), z = cam.z, still = calm();
    ctx.setTransform(z * d, 0, 0, z * d, (W / 2 - cam.x * z) * d, (H / 2 - cam.y * z) * d);
    const x0 = cam.x - W / 2 / z, x1 = cam.x + W / 2 / z, y0 = cam.y - H / 2 / z, y1 = cam.y + H / 2 / z;
    for (const it of R.items) {
      if (it.got && !it.cv) continue;
      const p = SZ.pos(it, R.t, tmp), m = it.r * 2;
      if (p.x + m < x0 || p.x - m > x1 || p.y + m < y0 || p.y - m > y1) continue;
      const wob = it.wob > 0 && !still ? Math.sin(it.wob * 40) * it.wob * 0.6 : 0;
      const wig = it.cv && !still && SZ.coverOpen(it, z) < 0.05 ? Math.max(0, Math.sin(time * 2.2 + it.id)) * Math.sin(time * 30) * 0.06 : 0;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(wob);
      A.item(ctx, it.got ? '' : it.k, it.v, 0, 0, it.r, time, { d: p.d, still, ph: it.id, cv: it.cv, open: SZ.coverOpen(it, z), wig: wig + wob });
      ctx.restore();
    }
  }
  function drawFx(ctx) {
    const still = calm();
    for (const r of rings) {
      const k = r.t / 0.6, rad = still ? r.r : r.r * (0.6 + k * 0.8);
      A.circ(ctx, r.x, r.y, rad); ctx.lineWidth = 5; ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.stroke(); ctx.globalAlpha = 1;
    }
    fx.draw(ctx);
    const T = trayGeo(R ? R.list.length : 1);
    for (const f of flyers) {
      const tx = T.cx(f.e) + CW / 2, ty = T.y + 12 + 38;
      if (f.pop < 0.18 && !still) { A.icon(ctx, f.k, f.v, f.x, f.y, f.r * (1 + Math.sin(f.pop / 0.18 * Math.PI) * 0.35)); continue; }
      const k = Math.min(1, f.t), e = 1 - Math.pow(1 - k, 2), x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 120;
      A.icon(ctx, f.k, f.v, x, y, f.r + (25 - f.r) * e);
    }
    for (const f of floats) {
      const a = Math.min(1, (f.life - f.t) / 0.4), up = still ? 0 : f.t * 30;
      ctx.globalAlpha = Math.max(0, a);
      if (f.wheel) { A.mouse(ctx, f.x, f.y - up + 20, 0.7, still ? 0 : Math.sin(f.t * 10), '#ffd23f'); A.text(ctx, 'كبّر!', f.x, f.y - up - 50, 30, '#ffffff'); }
      else if (f.hand) { A.hand(ctx, f.x + (still ? 0 : Math.sin(f.t * 6) * 30), f.y - up + 20, 1, 0); A.text(ctx, 'اسحب', f.x, f.y - up - 34, 30, '#ffffff'); }
      else A.text(ctx, f.text, f.x, f.y - up, f.size, f.color);
    }
    ctx.globalAlpha = 1;
  }
  // The hint: an arrow at the edge towards a thing off screen, or a ring around it.
  function drawHint(ctx) {
    if (!(hint.on > 0) || !hint.it) return;
    const still = calm(), p = screenOf(hint.it, {}), a = Math.min(1, hint.on / 0.5, (4.5 - hint.on) / 0.3);
    const L = SZ.PAD.l + 40, Rr = W - 50, T = SZ.PAD.t + 40, B = H - SZ.PAD.b - 40;
    ctx.globalAlpha = Math.max(0, a);
    if (p.x < L || p.x > Rr || p.y < T || p.y > B) {
      const cx = MID.x, cy = MID.y, dx = p.x - cx, dy = p.y - cy, s = Math.min(dx ? Math.abs(((dx > 0 ? Rr : L) - cx) / dx) : 9, dy ? Math.abs(((dy > 0 ? B : T) - cy) / dy) : 9);
      const ex = cx + dx * s, ey = cy + dy * s, ang = Math.atan2(dy, dx), bob = still ? 0 : Math.sin(time * 8) * 10;
      ctx.save(); ctx.translate(ex - Math.cos(ang) * bob, ey - Math.sin(ang) * bob); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-10, -30); ctx.lineTo(-10, -13); ctx.lineTo(-44, -13); ctx.lineTo(-44, 13); ctx.lineTo(-10, 13); ctx.lineTo(-10, 30); ctx.closePath();
      A.fill(ctx, '#ffd23f'); ctx.lineWidth = 6; ctx.strokeStyle = A.INK; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      A.glass(ctx, ex - Math.cos(ang) * 90, ey - Math.sin(ang) * 90, 1.4, 0);
    } else {
      const rad = Math.max(46, hint.it.r * cam.z * 1.9) + (still ? 0 : Math.sin(time * 7) * 6);
      A.circ(ctx, p.x, p.y, rad); A.st(ctx, 9, A.INK); A.st(ctx, 5, '#ffd23f');
      const small = hint.it.r * cam.z < SZ.MIN_R || (hint.it.cv && SZ.coverOpen(hint.it, cam.z) < SZ.OPEN_AT);
      if (small) { A.mouse(ctx, p.x + rad + 40, p.y, 0.8, still ? 0 : Math.sin(time * 8), '#ffd23f'); A.text(ctx, 'كبّر!', p.x + rad + 40, p.y - 76, 30, '#ffffff'); }
      else A.glass(ctx, p.x + rad * 0.75, p.y - rad * 0.75, 1.3, still ? 0 : Math.sin(time * 5) * 0.2);
    }
    ctx.globalAlpha = 1;
  }
  // The coach: a wordless hand that drags (first round) and the mouse wheel (first zoom).
  function drawCoach(ctx) {
    if (intro || R.done) return;
    const still = calm();
    if (coach.drag && coach.t > 1.2 && coach.panned < 160) {
      const k = still ? 0.5 : (coach.t * 0.7) % 1, x = MID.x + 120 - k * 240, y = MID.y + 40;
      ctx.globalAlpha = 0.95;
      A.rr(ctx, MID.x - 190, y - 120, 380, 190, 40); A.fill(ctx, 'rgba(43,36,82,0.55)');
      for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(MID.x + i * 160, y); ctx.lineTo(MID.x + i * 130, y - 22); ctx.lineTo(MID.x + i * 130, y + 22); ctx.closePath(); A.fs(ctx, '#ffd23f', 4); }
      A.hand(ctx, x, y, 1.4, 1);
      A.text(ctx, 'اسحب', MID.x, y - 86, 40, '#ffffff');
      ctx.globalAlpha = 1;
    }
    if (coach.zoom && coach.t > 0.8) {
      const bob = still ? 0 : Math.sin(time * 6) * 0.8, x = ptr.known && !drag.on ? Math.min(W - 90, Math.max(SZ.PAD.l + 90, ptr.x + 70)) : MID.x, y = ptr.known && !drag.on ? Math.min(H - SZ.PAD.b - 70, Math.max(150, ptr.y)) : MID.y;
      A.rr(ctx, x - 70, y - 120, 140, 170, 30); A.fill(ctx, 'rgba(43,36,82,0.6)');
      A.mouse(ctx, x, y + 6, 1, bob, '#ffd23f');
      A.text(ctx, 'كبّر', x, y - 92, 32, '#ffffff');
    }
  }
  function drawHud(ctx) {
    const T = trayGeo(R.list.length);
    // The list of things to find (cached; drawn again only when it changes).
    if (!intro || intro.out) {
      const k = intro ? intro.o : 1;
      ctx.globalAlpha = k;
      ctx.drawImage(trayLayer(), T.x - 20, T.y - 20 + (1 - k) * 40, (T.w + 40), (T.h + 30));
      ctx.globalAlpha = 1;
    }
    // The clock.
    const timed = !!R.limit, left = SZ.left(R), warn = timed && left <= 10 && !R.done;
    A.rr(ctx, 560, 10, 160, 52, 26); A.fs(ctx, warn ? '#ff5d6c' : 'rgba(255,255,255,0.94)', 4);
    A.clock(ctx, 592, 36, 17, timed ? left / R.limit : null, warn);
    A.text(ctx, fmt(timed ? Math.ceil(left) : R.t + R.pen), 662, 38, 32, warn ? '#ffffff' : A.INK, { stroke: false });
  }
  function drawIntro(ctx) {
    const n = R.list.length, cw = 150, w = n * cw + (n - 1) * 14 + 60, x = (W - w) / 2, y = 150, h = 300, still = calm();
    const k = intro.out ? 1 - intro.o : Math.min(1, intro.t / 0.25);
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    if (!still) { const s = 0.85 + 0.15 * k; ctx.translate(W / 2, y + h / 2); ctx.scale(s, s); ctx.translate(-W / 2, -(y + h / 2)); }
    A.rr(ctx, x, y, w, h, 40); A.fs(ctx, '#fff8e8', 7);
    // The place's name, and the round's number on a badge beside it.
    const name = SZ.WORLDS[wi].name;
    ctx.font = '700 28px Fredoka'; ctx.direction = 'rtl';
    const nw = ctx.measureText(name).width;
    ctx.direction = 'ltr';
    A.text(ctx, name, W / 2 + 22, y + 36, 28, SZ.WORLDS[wi].frame, { stroke: false });
    A.circ(ctx, W / 2 + 22 - nw / 2 - 28, y + 34, 19); A.fs(ctx, SZ.WORLDS[wi].color, 4);
    A.text(ctx, String(ri + 1), W / 2 + 22 - nw / 2 - 28, y + 36, 24, '#ffffff', { stroke: false });
    A.text(ctx, 'ابحث عن:', W / 2, y + 80, 44, '#ff9f1c');
    R.list.forEach((e, i) => {
      const cx = x + 30 + (n - 1 - i) * (cw + 14) + cw / 2;
      A.rr(ctx, cx - cw / 2, y + 112, cw, 160, 24); A.fs(ctx, '#ffffff', 4);
      A.icon(ctx, e.k, e.v, cx, y + 172, 40);
      const label = SZ.label(e.k, e.v), size = A.fit(ctx, label, cw - 14, 22, 15);
      A.text(ctx, size <= 15 ? SZ.noun(e.k) : label, cx, y + 244, size <= 15 ? A.fit(ctx, SZ.noun(e.k), cw - 14, 22, 13) : size, A.INK, { stroke: false });
      if (e.n > 1) { A.circ(ctx, cx - cw / 2 + 16, y + 128, 22); A.fs(ctx, '#ff5d9e', 4); A.text(ctx, String(e.n), cx - cw / 2 + 16, y + 130, 28, '#ffffff', { stroke: false }); }
    });
    if (R.limit) { A.clock(ctx, x + 44, y + 44, 24, 1, false); A.text(ctx, fmt(R.limit), x + 104, y + 46, 30, A.INK, { stroke: false }); }
    ctx.restore();
  }
  function drawLens(ctx) {
    const d = D(), c = menu.cam, L = ptr.known ? ptr : menu.lens, r = 118;
    const wpt = { x: c.x + (L.x - W / 2) / c.z, y: c.y + (L.y - H / 2) / c.z }, z = c.z * menu.lensZ;
    const lc = { x: wpt.x - (L.x - W / 2) / z, y: wpt.y - (L.y - H / 2) / z, z };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); ctx.arc(L.x * d, L.y * d, r * d, 0, Math.PI * 2); ctx.clip();
    drawScene(ctx, 0, lc, [L.x - r, L.y - r, L.x + r, L.y + r]);
    drawMenuItems(ctx, lc);
    ctx.restore();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(0.75);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r + 8, 0); ctx.lineTo(r + 96, 0); A.st(ctx, 34, A.INK); A.st(ctx, 24, '#c98a4a');
    ctx.restore();
    A.circ(ctx, L.x, L.y, r); A.st(ctx, 18, A.INK); A.st(ctx, 11, '#ffd23f');
    ctx.beginPath(); ctx.arc(L.x, L.y, r - 22, Math.PI * 1.1, Math.PI * 1.4); A.st(ctx, 7, 'rgba(255,255,255,0.8)');
  }
  function drawMenuItems(ctx, c) {
    const d = D();
    ctx.setTransform(c.z * d, 0, 0, c.z * d, (W / 2 - c.x * c.z) * d, (H / 2 - c.y * c.z) * d);
    for (const it of menu.R.items) A.item(ctx, it.k, it.v, it.x, it.y, it.r, time, { d: 1, still: calm(), ph: it.id });
  }
  function drawMenu(ctx) {
    const d = D();
    if (!menu.R) menu.R = SZ.makeRound(0, 0, { size: 1, decoys: 2 });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawScene(ctx, 0, menu.cam);
    drawMenuItems(ctx, menu.cam);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (screen === 'title') drawLens(ctx);
    else { ctx.fillStyle = 'rgba(30,24,70,0.45)'; ctx.fillRect(0, 0, W, H); }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    fx.draw(ctx);
  }
  function render() {
    if (!dirty) return;
    dirty = false;
    const ctx = view.ctx, d = D();
    if ((screen === 'play' || screen === 'pause' || screen === 'result') && R) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawScene(ctx, wi, cam);
      drawItems(ctx);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (screen === 'result') {
        ctx.fillStyle = 'rgba(30,24,70,0.4)'; ctx.fillRect(0, 0, W, H);
        fx.draw(ctx);
        return;
      }
      drawHint(ctx);
      drawCoach(ctx);
      drawHud(ctx);
      drawFx(ctx);
      if (intro) drawIntro(ctx);
    } else drawMenu(ctx);
  }

  /* ---------------------------------------------- the how-to pictures */
  function howTo() {
    const g1 = $('howWheel').getContext('2d'), g2 = $('howDrag').getContext('2d'), g3 = $('howClick').getContext('2d');
    [g1, g2, g3].forEach(g => g.clearRect(0, 0, 150, 110));
    A.mouse(g1, 75, 74, 0.95, 0.4, '#ffd23f');
    A.glass(g1, 122, 34, 0.75, 0);
    A.hand(g2, 80, 60, 1.25, 0);
    [[-1, 22], [1, 128]].forEach(a => { g2.beginPath(); g2.moveTo(a[1] + a[0] * 14, 60); g2.lineTo(a[1] - a[0] * 6, 44); g2.lineTo(a[1] - a[0] * 6, 76); g2.closePath(); g2.fillStyle = '#ffd23f'; g2.fill(); g2.lineWidth = 4; g2.strokeStyle = A.INK; g2.stroke(); });
    A.icon(g3, 'kite', 'red', 52, 50, 34);
    A.hand(g3, 98, 84, 1, 1);
  }

  canvas.addEventListener('contextrestored', () => { resetTiles(); thumbsDrawn = false; trayKey = ''; howTo(); });
  if (document.fonts && document.fonts.load) {
    // The list's words are drawn again once the font is there.
    document.fonts.load('700 40px Fredoka', 'ابحث 5').then(() => { trayKey = ''; dirty = true; }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
  window.__game = {
    get state() {
      const g = R;
      return {
        screen, world: wi, round: ri, index: g ? g.i : -1, tier, paused: screen === 'pause', intro: !!intro,
        cam: cam && g ? { x: r1(cam.x), y: r1(cam.y), z: r3(cam.z) } : null, tz: cam ? r3(cam.tz) : 0, zmin: g ? g.zmin : 0, zmax: g ? g.zmax : 0,
        locked: !!(g && g.d.lock), time: g ? r3(g.t) : 0, found: g ? g.found : 0, total: g ? g.total : 0, wrong: g ? g.wrong : 0, pen: g ? g.pen : 0,
        limit: g ? g.limit : 0, left: g ? r1(SZ.left(g)) : 0, done: !!(g && g.done), over: !!(g && g.over), timeUp: !!(g && g.timeUp), moves,
        hint: hint.on > 0, hintReady: hint.ready, coach: coach.drag ? 'drag' : coach.zoom ? 'zoom' : '', lensZ: r3(menu.lensZ),
        list: g ? g.list.map((e, i) => ({ k: e.k, v: e.v, n: e.n, got: e.got, shown: shown[i] })) : [],
        movers: g ? g.items.filter(it => it.m).map(it => { const p = SZ.pos(it, g.t, {}); return [r1(p.x), r1(p.y)]; }) : [],
        stars: result ? result.stars : 0, result: !!result && screen === 'result', best: !!(result && result.res && result.res.best)
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // Where a logical point is on the page, for tests that move the real mouse there.
    point: page,
    // Where a scene point is on the page right now, and the things (still) to find.
    world: (x, y) => { const s = SZ.toScreen(cam, x, y, {}); return page(s.x, s.y); },
    items: () => R ? R.items.map(it => { const p = SZ.pos(it, R.t, {}); return { id: it.id, k: it.k, v: it.v, e: it.e, got: it.got, x: r1(p.x), y: r1(p.y), r: it.r, cover: !!it.cv, need: r3(SZ.needZoom(it)), moving: !!it.m }; }) : []
  };

  buildMap();
  buildBook();
  howTo();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { drag.on = false; if (cam) cam.vx = cam.vy = 0; } });
  ensureBase(0);
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();

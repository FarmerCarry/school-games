/* Zooom +1 (زوووم +1): screens, input, saves, the shop, sounds, the HUD and play
 * statistics. engine.js runs the road; art.js draws it. This is the UI layer: it reads
 * Kit.dda at the start of every try (how many ducks and jelly cubes) and reports each
 * try back to it, and it reports every try as a round (Kit.stats).
 */
(function () {
  'use strict';
  var W = 1280, H = 720, M = Math;
  var J = Kit.juice, AU = Kit.audio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var dirty = true;
  var fit = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    dirty = true;
  } });
  var ctx = fit.ctx;

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('zoom-plus-one');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = ZP.loadSave(store.get('save', null));
  var saveTimer = 0;
  function persist() {
    saveTimer = 0;
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // How busy the road is (ducks, jelly cubes) follows how the tries go on this PC.
  var dda = Kit.dda('zoom-plus-one', { id: 'main', target: 0.7, start: 0.3 });
  function busy() { return dda.value(0.05, 0.95); }

  /* --------------------------------------------------------------- state */
  var screen = 'title', world = null, demo = null, time = 0, lastT = 0, roundOpen = false, spaceHeld = false;
  var floats = [], banner = null, bump = 0, squash = 0, flash = 0, clackAt = 0, combo = 0, idle = 0, shopFrom = 'title';
  var fx = Kit.particles(), shake = Kit.shake();
  var mouse = { down: false, x: 640, moved: false };
  var view = null;
  var SHOES = ['#ff4f6d', '#4fa8ff', '#3ddc84', '#ffe14f', '#b44dff', '#ff8a2e', '#ffffff'];
  var CHEERS = ['واااو!', 'سرعة جنونية!', 'صاروخ!', 'لا أحد يوقفك!', 'زوووم!', 'طيران!'];

  var SCREENS = { title: 'scrTitle', pause: 'scrPause', shop: 'scrShop' };
  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    mouse.down = false;
    Kit.keys.reset();
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function fmt(n) { return Kit.fmt(n); }
  // A number with a sign kept left-to-right inside Arabic text (canvas and DOM text).
  function ltr(t) { return '\u2066' + t + '\u2069'; }
  // Short numbers for the HUD: 12,345 then 1.2M style with Arabic-friendly suffixes.
  function big(n) {
    if (n < 1e6) return Kit.fmt(n);
    var units = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
    for (var i = 0; i < units.length; i++) if (n >= units[i][0]) return (M.floor(n / units[i][0] * 10) / 10) + units[i][1];
    return Kit.fmt(n);
  }

  /* ------------------------------------------------------------ the title */
  function canBuyShoes() {
    var c = ZP.price(save, 'shoes');
    return c > 0 && save.wins >= c;
  }
  function refreshShopBadge() {
    var can = canBuyShoes();
    ['btnShop', 'btnTitleShop', 'btnPauseShop'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.classList.toggle('can', can);
      var dot = el.querySelector('.dot');
      if (dot) dot.hidden = !can;
    });
  }
  function refreshTitle() {
    $('titleStage').querySelector('b').textContent = String(save.stage);
    $('titleWins').querySelector('b').textContent = big(save.wins);
    refreshShopBadge();
  }
  function endTry(code, val) {
    if (!roundOpen) return;
    roundOpen = false;
    Kit.stats.end(code, val);
  }
  function toTitle() {
    if (world) { endTry('quit'); world = null; }
    persist();
    refreshTitle();
    setScreen('title');
  }
  function play() {
    J.select();
    world = ZP.create(save, busy());
    if (view) view.hitAt = {};
    floats.length = 0; banner = null; fx.clear();
    startTry();
    refreshShopBadge();
    setScreen('play');
    showBanner('المرحلة ' + save.stage, '#fff', 1.4);
  }
  function startTry() {
    roundOpen = true;
    Kit.stats.round('st' + M.min(99, save.stage));
    Kit.track.tier(dda.tier);
    if (!save.coach) Kit.stats.tutorial('start');
    idle = 0;
  }

  /* --------------------------------------------------------------- pause */
  function pause() {
    if (screen !== 'play') return;
    persist();
    refreshShopBadge();
    J.back();
    setScreen('pause');
    say('استراحة');
  }
  function resume() {
    if (!world) { play(); return; }
    J.select();
    refreshShopBadge();
    setScreen('play');
  }
  function restart() {
    if (!world) { play(); return; }
    J.select();
    endTry('quit');
    ZP.retry(world, busy());
    if (view) view.hitAt = {};
    floats.length = 0; banner = null;
    startTry();
    refreshShopBadge();
    setScreen('play');
  }

  /* ---------------------------------------------------------------- shop */
  var runnerBtns = [];
  function buildShop() {
    var box = $('runners');
    ZP.SKINS.forEach(function (sk, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'runner';
      b.innerHTML = '<canvas width="184" height="208"></canvas><b>' + sk.name + '</b><span></span>';
      b.addEventListener('click', function (e) { e.stopPropagation(); buy('skin:' + i, b); });
      box.appendChild(b);
      runnerBtns.push(b);
    });
    paintRunners();
    on($('buyShoes'), function () { buy('shoes', $('buyShoes')); });
    on($('buyWinx'), function () { buy('winx', $('buyWinx')); });
    on($('btnRebirth'), rebirth);
  }
  function paintRunners() {
    runnerBtns.forEach(function (b, i) {
      var c = b.querySelector('canvas').getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 184, 208);
      ZP.drawRunner(c, ZP.SKINS[i].id, 92, 196, 150, { t: 0.3, run: 0, shoe: SHOES[save.shoes % SHOES.length] });
    });
  }
  function refreshShop() {
    $('shopWins').querySelector('b').textContent = big(save.wins);
    var s = $('buyShoes'), sc = ZP.price(save, 'shoes');
    s.querySelector('.ds').textContent = ltr('+' + fmt(ZP.shoesGain(save.shoes))) + ' ← ' + ltr('+' + fmt(ZP.shoesGain(save.shoes + 1))) + ' لكل خطوة';
    setPrice(s, sc, save.shoes >= ZP.SHOES_MAX);
    var x = $('buyWinx'), xc = ZP.price(save, 'winx'), wmax = !xc;
    x.querySelector('.ds').textContent = wmax ? ltr('×' + ZP.winMult(save)) + ' (الأقصى)' : ltr('×' + ZP.winMult(save)) + ' ← ' + ltr('×' + ZP.WINX[save.winx + 1]) + ' كؤوس';
    setPrice(x, xc, wmax);
    var r = $('btnRebirth'), can = ZP.canRebirth(save);
    r.querySelector('.ds').textContent = 'ابدأ من المرحلة 1 بسرعة ' + ltr('×' + (ZP.stepMult(save) + 1)) + ' لكل خطوة';
    r.querySelector('.pr').textContent = can ? 'جاهز!' : 'من المرحلة ' + ZP.REBIRTH_AT;
    r.classList.toggle('no', !can);
    runnerBtns.forEach(function (b, i) {
      var own = save.skins[i];
      b.classList.toggle('on', save.skin === i);
      b.classList.toggle('locked', !own);
      b.querySelector('span').textContent = own ? (save.skin === i ? '✔' : '') : fmt(ZP.SKINS[i].cost) + ' 🏆';
      b.setAttribute('aria-label', ZP.SKINS[i].name + (own ? '' : '، ' + ZP.SKINS[i].cost + ' كأس'));
      b.setAttribute('aria-pressed', String(save.skin === i));
    });
  }
  function setPrice(el, price, max) {
    var pr = el.querySelector('.pr');
    el.classList.toggle('max', !!max);
    el.classList.toggle('no', !max && save.wins < price);
    pr.textContent = max ? 'الأقصى' : fmt(price) + ' 🏆';
  }
  function openShop() {
    if (screen === 'play') { persist(); shopFrom = 'play'; }
    else if (screen === 'pause') shopFrom = 'pause';
    else shopFrom = 'title';
    J.select();
    refreshShop();
    setScreen('shop');
  }
  function closeShop() {
    J.back();
    if (shopFrom === 'title' || !world) { refreshTitle(); setScreen('title'); } else setScreen(shopFrom === 'pause' ? 'pause' : 'play');
  }
  function buy(item, el) {
    var wasSkin = save.skin;
    if (ZP.buy(save, item)) {
      if (/^skin/.test(item) && wasSkin === save.skin) J.tap();
      else { J.coin(5); fx.burst(640, 360, { count: 30, colors: ['#ffe14f', '#ff5fa2', '#4fd8ff'], speed: 380 }); }
      if (item === 'shoes') paintRunners();
      persist();
    } else {
      J.error();
      if (el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }
    }
    refreshShop();
    refreshShopBadge();
  }
  function rebirth() {
    if (!ZP.canRebirth(save)) { J.error(); var r = $('btnRebirth'); r.classList.remove('wiggle'); void r.offsetWidth; r.classList.add('wiggle'); return; }
    if (world) endTry('quit');
    ZP.rebirth(save);
    persist();
    J.levelUp(); J.chime(3);
    world = null;
    refreshShop();
    play();
    showBanner('انطلاقة جديدة!', '#ffe14f', 2.2, 'سرعة أكبر لكل خطوة!');
  }

  /* ---------------------------------------------------------------- input */
  function on(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(); if (e.detail > 0) el.blur(); }); }
  on($('btnPlay'), play);
  on($('btnTitleShop'), openShop);
  on($('btnPause'), pause);
  on($('btnShop'), openShop);
  on($('btnResume'), resume);
  on($('btnHome'), function () { J.back(); toTitle(); });
  on($('btnPauseShop'), openShop);
  on($('btnRestart'), restart);
  on($('shopBack'), closeShop);
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    var c = e.code;
    if (c === 'Space') spaceHeld = true;
    if (e.repeat) return;
    if (screen === 'play' && (c === 'KeyP' || c === 'Escape')) { e.preventDefault(); pause(); return; }
    if (screen === 'pause') {
      if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'Space') { e.preventDefault(); resume(); }
      else if (c === 'KeyR') restart();
      return;
    }
    if (screen === 'shop' && (c === 'Escape' || c === 'Enter')) { e.preventDefault(); closeShop(); return; }
    if (screen === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); play(); }
  });
  window.addEventListener('keyup', function (e) { if (e.code === 'Space') spaceHeld = false; });
  window.addEventListener('blur', function () { spaceHeld = false; });
  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || e.button !== 0) return;
    mouse.down = true; mouse.x = fit.toLogical(e.clientX, e.clientY).x; mouse.moved = true;
  });
  window.addEventListener('pointermove', function (e) {
    if (!mouse.down) return;
    mouse.x = fit.toLogical(e.clientX, e.clientY).x; mouse.moved = true;
  });
  window.addEventListener('pointerup', function () { mouse.down = false; });
  function readInput() {
    var k = Kit.keys;
    var inp = { run: k.anyDown(['ArrowUp', 'KeyW', 'Space']) || spaceHeld || mouse.down, dir: 0, lane: null };
    if (k.anyPressed(['ArrowLeft', 'KeyA'])) inp.dir -= 1;
    if (k.anyPressed(['ArrowRight', 'KeyD'])) inp.dir += 1;
    if (mouse.down && mouse.moved && view && world) {
      var z = world.z + 0.5, x0 = view.proj(0, 0, z).x, x1 = view.proj(1, 0, z).x;
      inp.lane = (mouse.x - x0) / M.max(1, x1 - x0);
      mouse.moved = false;
    }
    return inp;
  }

  /* -------------------------------------------------------- sounds and fx */
  function clack(gain) {
    var now = time;
    if (now - clackAt < 0.065) return;
    clackAt = now;
    combo = (combo + 1) % 10;
    var f = 330 * M.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21][combo] / 12);
    AU.tone({ freq: f, to: f * 1.4, type: 'triangle', dur: 0.05, vol: 0.11 });
    AU.noise({ dur: 0.025, vol: 0.08, filter: 4200 });
  }
  function float(text, x, y, color, size, vy) {
    if (floats.length > 40) floats.shift();
    floats.push({ text: text, x: x, y: y, color: color || '#fff', size: size || 34, vy: vy || -150, life: 1, max: 1, vx: (M.random() - 0.5) * 60 });
  }
  function showBanner(text, color, secs, sub) { banner = { text: text, sub: sub || '', color: color || '#fff', t: 0, max: secs || 1.6 }; }
  function runnerScreen() { var r = view && view.runnerAt; return r || { x: 640, y: 470, s: 120 }; }
  function handle(ev) {
    var r = runnerScreen();
    switch (ev.type) {
      case 'step':
        clack(ev.gain);
        bump = 1;
        float('+' + big(ev.gain), r.x + (M.random() - 0.5) * r.s * 1.8, r.y - r.s * (0.3 + M.random() * 0.3), ev.gain >= 100 ? '#ffe14f' : '#ffffff', 30 + M.min(18, M.log(1 + ev.gain) * 3));
        if (save.steps % 60 === 0) float(CHEERS[(save.steps / 60) % CHEERS.length], r.x, r.y - 60, '#ffe14f', 44, -90);
        if (!calm() && save.steps % 3 === 0) fx.burst(r.x, r.y + r.s * 0.9, { count: 3, colors: ['#fff', '#ffe14f'], speed: 160, life: 0.35, size: 6, gravity: 300 });
        break;
      case 'gold':
        J.coin(4); Kit.track.hit();
        float('+' + big(ev.gain) + ' ⚡', r.x, r.y - 30, '#ffe14f', 52, -120);
        fx.burst(r.x, r.y + r.s * 0.4, { count: 22, colors: ['#ffe14f', '#ffc928', '#fff'], speed: 320 });
        break;
      case 'turbo':
        J.chime(3); Kit.track.hit();
        showBanner('توربو ×2!', '#4fd8ff', 1.3);
        fx.burst(r.x, r.y + r.s * 0.4, { count: 30, colors: ['#ff5a5a', '#ffe14f', '#4fd8ff', '#b44dff'], speed: 360 });
        break;
      case 'chest':
        J.star(3); Kit.track.hit();
        float('+' + big(ev.wins) + ' 🏆', r.x, r.y - 40, '#ffc928', 56, -110);
        fx.burst(r.x, r.y + r.s * 0.4, { count: 30, colors: ['#ffc928', '#fff'], speed: 340 });
        refreshShopBadge();
        break;
      case 'bonk':
        if (view && ev.idx != null) view.hitAt[ev.idx] = time;
        J.impact(0.6); Kit.track.miss();
        AU.tone({ freq: 300, to: 170, type: 'sawtooth', dur: 0.2, vol: 0.12 }); // a rubber-duck honk
        shake.add(12); squash = -0.35;
        float(ev.kind === 'duck' ? 'كواك!' : 'بونك!', r.x, r.y - 50, '#ff5fa2', 58, -80);
        if (ev.lost) float('-' + big(ev.lost), r.x + 60, r.y, '#ff9aa8', 30);
        break;
      case 'launch':
        J.whoosh(1); J.jump(1);
        AU.tone({ freq: 180, to: 900, type: 'sine', dur: 0.35, vol: 0.16 });
        if (ev.ok) showBanner('زوووووم!', '#7dffb0', 1.1);
        Kit.stats.busy();
        break;
      case 'clear': {
        J.levelUp(); J.star(3);
        shake.add(8); flash = 1;
        endTry('win', ev.stage);
        dda.result(tryScore());
        if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
        world.busy = busy();
        showBanner('فوز!', '#ffe14f', 1.6, '+' + big(ev.wins) + ' 🏆');
        fx.burst(640, 260, { count: 70, colors: ['#ff5fa2', '#ffe14f', '#4fd8ff', '#7dffb0', '#b44dff'], speed: 520, life: 1.2 });
        persist();
        refreshShopBadge();
        say('فزت بالمرحلة ' + ev.stage);
        break;
      }
      case 'fall': {
        J.pop(1); J.fail();
        AU.tone({ freq: 620, to: 110, type: 'sine', dur: 0.4, vol: 0.18 }); // bloop
        endTry('lose', ev.stage);
        dda.result(tryScore());
        world.busy = busy();
        var sub = ev.stage >= 5 && canBuyShoes()
          ? 'اشترِ أحذية نطّاطة من المتجر! 👟'
          : ev.stage >= 5 && save.shoes < 2
            ? 'تحتاج ⚡ ' + big(ev.short) + ' أكثر — جرّب الأحذية في المتجر! 👟'
            : 'تحتاج ⚡ ' + big(ev.short) + ' أكثر — اجرِ مرة أخرى!';
        showBanner('بلوب!', '#ff9fd0', 1.8, sub);
        persist();
        refreshShopBadge();
        break;
      }
      case 'respawn':
        if (view) view.hitAt = {};
        startTry();
        break;
      case 'next':
        if (view) view.hitAt = {};
        startTry();
        showBanner('المرحلة ' + ev.stage, '#fff', 1.2);
        break;
    }
  }
  function tryScore() { var b = world.tryBonks; return b === 0 ? 1 : b === 1 ? 0.65 : b === 2 ? 0.35 : 0; }

  /* --------------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    if (screen === 'play' && world) {
      var inp = readInput();
      if (!inp.run && world.phase === 'run') idle += dt; else idle = 0;
      ZP.step(world, dt, inp);
      for (var i = 0; i < world.ev.length; i++) handle(world.ev[i]);
      world.ev.length = 0;
      saveTimer += dt;
      if (saveTimer > 6) persist();
      dirty = true;
    } else if (screen === 'title' && demo && !calm()) {
      // the title's attract run: no sound, no statistics
      ZP.step(demo, dt, { run: true, lane: 2 + M.round(M.sin(time * 0.7) * 1.4) });
      demo.ev.length = 0;
      if (demo.spec.n > 4 || demo.phase === 'fall') { demo.save.stage = 1; ZP.retry(demo); }
      if (demo.save.speed > 400) demo.save.speed = 25;
      dirty = true;
    }
    for (var f = floats.length - 1; f >= 0; f--) {
      var p = floats[f];
      p.life -= dt * 1.1; p.y += p.vy * dt; p.x += p.vx * dt; p.vy *= 0.97;
      if (p.life <= 0) floats.splice(f, 1);
    }
    if (banner) { banner.t += dt; if (banner.t > banner.max) banner = null; }
    bump = M.max(0, bump - dt * 6);
    squash += (0 - squash) * M.min(1, dt * 10);
    flash = M.max(0, flash - dt * 2);
    fx.update(dt); shake.update(dt);
    Kit.keys.endFrame();
  }

  /* ------------------------------------------------------------------ HUD */
  function text(str, x, y, size, color, align, rtl) {
    ctx.font = '700 ' + size + 'px Fredoka'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.lineJoin = 'round'; ctx.lineWidth = M.max(4, size * 0.16); ctx.strokeStyle = '#2a1d4e';
    ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.direction = 'ltr';
  }
  // A signed number followed by Arabic words, read right to left: "+30" then "لكل خطوة".
  // Drawn as two pieces so the sign stays in front of the number.
  function pair(num, words, x, y, size, color) {
    ctx.font = '700 ' + size + 'px Fredoka';
    var nw = ctx.measureText(num).width, gap = size * 0.3, ww = ctx.measureText(words).width;
    var right = x + (nw + gap + ww) / 2;
    text(num, right - nw / 2, y, size, color);
    text(words, right - nw - gap - ww / 2, y, size, color, 'center', true);
  }
  function panel(x, y, w, h, fill) {
    ZP.rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = fill || 'rgba(42,29,78,0.82)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  function drawHud() {
    var w = world, sp = w.spec;
    // speed
    var sc = 1 + bump * 0.12;
    panel(470, 12, 340, 84);
    ZP.bolt(ctx, 520, 54, 56);
    ctx.save(); ctx.translate(680, 50); ctx.scale(sc, sc);
    text(big(save.speed), 0, 0, 52, w.turbo > 0 ? '#4fd8ff' : '#ffe14f');
    ctx.restore();
    text('سرعة', 680, 84, 18, '#fff', 'center', true);
    var gain = ZP.stepGain(save) * (w.turbo > 0 ? 2 : 1);
    pair('+' + big(gain), 'لكل خطوة' + (w.turbo > 0 ? ' (توربو ' + M.ceil(w.turbo) + ')' : ''), 640, 116, 22, w.turbo > 0 ? '#4fd8ff' : '#fff');
    // trophies and stage
    panel(176, 18, 190, 58);
    ZP.trophy(ctx, 212, 47, 44);
    text(big(save.wins), 300, 48, 32, '#ffc928');
    panel(960, 18, 230, 58);
    text('المرحلة ' + sp.n, save.rebirths ? 1095 : 1075, 48, 30, '#fff', 'center', true);
    if (save.rebirths) text('★' + save.rebirths, 1000, 48, 24, '#ffe14f');
    // the need bar: how close the speed is to flying over the gap
    var need = sp.need, f = M.min(1, save.speed / need), ok = f >= 1;
    var bx = 340, by = 652, bw = 600, bh = 46;
    ZP.rrect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = 'rgba(42,29,78,0.85)'; ctx.fill();
    if (f > 0.02) { ZP.rrect(ctx, bx + 5, by + 5, M.max(bh - 10, (bw - 10) * f), bh - 10, (bh - 10) / 2); ctx.fillStyle = ok ? '#3ddc84' : '#ffe14f'; ctx.fill(); }
    ZP.rrect(ctx, bx, by, bw, bh, bh / 2); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
    text(ok ? 'جاهز للقفز! اجرِ إلى المنحدر' : 'للقفز تحتاج ⚡ ' + big(need), bx + bw / 2, by + bh / 2 + 1, 24, '#fff', 'center', true);
    // how far along the road
    var prog = M.max(0, M.min(1, w.z / (sp.rows + ZP.RAMP)));
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(bx + 20, by - 14, bw - 40, 5);
    ctx.fillStyle = '#fff'; ZP.rrect(ctx, bx + 20 + (bw - 40) * prog - 8, by - 20, 16, 16, 8); ctx.fill();
    // floats
    for (var i = 0; i < floats.length; i++) {
      var p = floats[i];
      ctx.globalAlpha = M.max(0, M.min(1, p.life * 1.6));
      text(p.text, p.x, p.y, p.size, p.color, 'center', /[؀-ۿ]/.test(p.text));
    }
    ctx.globalAlpha = 1;
    // the coach for a first-timer (and anyone standing still for a while)
    if ((!save.coach && w.steps < 8) || (idle > 4 && w.phase === 'run')) {
      var pulse = calm() ? 1 : 1 + M.sin(time * 6) * 0.05;
      ctx.save(); ctx.translate(640, 300); ctx.scale(pulse, pulse);
      panel(-340, -42, 680, 84, 'rgba(255,95,162,0.95)');
      text('اضغط مطولًا  ↑  أو  مسافة  أو الفأرة لتجري!', 0, 2, 30, '#fff', 'center', true);
      ctx.restore();
    }
    // banner
    if (banner) {
      var k = banner.t / banner.max, s = calm() ? 1 : k < 0.15 ? 0.4 + k / 0.15 * 0.7 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
      ctx.globalAlpha = k > 0.8 ? M.max(0, (1 - k) / 0.2) : 1;
      ctx.save(); ctx.translate(640, 230); ctx.scale(s, s);
      text(banner.text, 0, 0, 88, banner.color, 'center', true);
      if (banner.sub) text(banner.sub, 0, 74, 34, '#fff', 'center', /[\u0600-\u06ff]/.test(banner.sub));
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /* --------------------------------------------------------------- render */
  function render() {
    if (screen !== 'play' && !dirty) return; // a still menu keeps its last frame
    var w = screen === 'title' ? demo : world;
    var dt = M.min(0.1, M.max(0, time - lastT)); lastT = time;
    ctx.save();
    if (shake.power) ctx.translate(shake.x, shake.y);
    if (w) {
      view.render(w, { t: time, dt: dt, skin: ZP.SKINS[screen === 'title' ? save.skin : save.skin].id, need: w.spec.need, speed: w.save.speed, squash: squash, shoe: SHOES[save.shoes % SHOES.length] });
    } else {
      ctx.fillStyle = '#ffb8de'; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    fx.draw(ctx);
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
    if (world && screen !== 'title') drawHud();
    dirty = false;
  }

  /* ----------------------------------------------------- test and debug hook */
  var r3 = function (v) { return M.round(v * 1000) / 1000; };
  function snapshot() {
    var w = world;
    return {
      screen: screen, paused: screen === 'pause', stage: save.stage, speed: save.speed, wins: save.wins,
      shoes: save.shoes, winx: save.winx, rebirths: save.rebirths, skin: save.skin,
      phase: w ? w.phase : '', z: w ? r3(w.z) : 0, x: w ? r3(w.x) : 0, lane: w ? w.lane : 2, v: w ? r3(w.v) : 0,
      steps: w ? w.steps : 0, bonks: w ? w.bonks : 0, falls: w ? w.falls : 0, clears: w ? w.clears : 0, golds: w ? w.golds : 0,
      need: w ? w.spec.need : 0, rows: w ? w.spec.rows : 0, busy: w ? r3(w.busy) : 0, turbo: w ? r3(w.turbo) : 0,
      floats: floats.length, banner: banner ? banner.text : '', calm: calm()
    };
  }

  /* ----------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { mouse.down = false; spaceHeld = false; } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  window.addEventListener('pagehide', function () { persist(); });
  canvas.addEventListener('contextrestored', function () { if (view && view.rebuildGlyphs) view.rebuildGlyphs(); dirty = true; render(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { if (view && view.rebuildGlyphs) view.rebuildGlyphs(); dirty = true; paintRunners(); render(); }, function () { /* fallback fonts */ });
  }
  var loop = null;
  try {
    view = ZP.createView(ctx);
    view.calm = calm();
    demo = ZP.create(ZP.newSave(), 0.2);
    demo.save.speed = 25; demo.z = 9; demo.maxRow = 8;
    buildShop();
    refreshTitle();
    setScreen('title');
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      get view() { return view; },
      point: function (x, y) { var r = canvas.getBoundingClientRect(); return { x: r.left + x * fit.scale, y: r.top + y * fit.scale }; }
    };
    render();
    loop = Kit.loop(update, render);
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('scrError').hidden = false;
    Kit.fail(error);
  }
})();

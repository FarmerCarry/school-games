/* سباق التوربو — screens, save, stats. The sim stays in TK. */
(function () {
  'use strict';
  var D = window.TKD, TK = window.TK, AI = window.TKAI, R = window.TKR, A = window.TKA;
  var canvas = document.getElementById('game');
  var ui = document.getElementById('ui');
  var view = Kit.fit(canvas, 1280, 720, { onResize: placeUi });
  var ctx = view.ctx;
  canvas.addEventListener('contextrestored', function () { view.resize(); trackDirty = true; });
  function placeUi(v) {
    ui.style.left = v.canvas.style.left;
    ui.style.top = v.canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
  }
  placeUi(view);
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var store = Kit.store('turbo-karts');
  var saveUI = Kit.saveStatus({ retry: function () { persist(); } });
  var saveFailed = false;
  var ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];

  function fresh() {
    return {
      v: 1, coins: 0, open: 1, last: 0, kart: 0, paint: 0, sticker: 0, hat: 0, horn: 0, easy: -1,
      ownedK: [1, 1, 0, 0, 0, 0], ownedP: [1, 1, 0, 0, 0, 0, 0, 0],
      ownedS: [1, 0, 0, 0, 0], ownedH: [1, 0, 0, 0, 0, 0], ownedN: [1, 0, 0, 0, 0],
      cups: [0, 0], best: [0, 0, 0, 0, 0, 0, 0, 0], ghost: null
    };
  }
  function bits(src, n, free) {
    var o = [], i;
    for (i = 0; i < n; i++) o.push(src && src[i] ? 1 : 0);
    for (i = 0; i < free; i++) o[i] = 1;
    return o;
  }
  function load() {
    var s = fresh(), raw = store.get('save', null), i;
    if (!raw || typeof raw !== 'object') return s;
    s.coins = clamp(raw.coins | 0, 0, 99999);
    s.open = clamp(raw.open | 0, 1, 8);
    s.last = clamp(raw.last | 0, 0, s.open - 1);
    s.kart = clamp(raw.kart | 0, 0, 5);
    s.paint = clamp(raw.paint | 0, 0, 7);
    s.sticker = clamp(raw.sticker | 0, 0, 4);
    s.hat = clamp(raw.hat | 0, 0, 5);
    s.horn = clamp(raw.horn | 0, 0, 4);
    s.easy = raw.easy === 0 || raw.easy === 1 ? raw.easy : -1;
    s.ownedK = bits(raw.ownedK, 6, 2);
    s.ownedP = bits(raw.ownedP, 8, 2);
    s.ownedS = bits(raw.ownedS, 5, 1);
    s.ownedH = bits(raw.ownedH, 6, 1);
    s.ownedN = bits(raw.ownedN, 5, 1);
    s.cups = [clamp(raw.cups && raw.cups[0] | 0, 0, 3), clamp(raw.cups && raw.cups[1] | 0, 0, 3)];
    s.best = [];
    for (i = 0; i < 8; i++) s.best.push(clamp(raw.best && raw.best[i] | 0, 0, 600000));
    if (raw.ghost && raw.ghost.t >= 0 && raw.ghost.t < 8 && Array.isArray(raw.ghost.d) && raw.ghost.d.length >= 6 && raw.ghost.d.length < 2400) {
      s.ghost = { t: raw.ghost.t | 0, d: raw.ghost.d.map(function (n) { return n | 0; }) };
    }
    if (!s.ownedK[s.kart]) s.kart = 0;
    if (!s.ownedP[s.paint]) s.paint = 0;
    if (!s.ownedS[s.sticker]) s.sticker = 0;
    if (!s.ownedH[s.hat]) s.hat = 0;
    if (!s.ownedN[s.horn]) s.horn = 0;
    return s;
  }
  var save = load();
  function persist() {
    var ok = store.set('save', save) !== false;
    saveFailed = !ok;
    if (ok) saveUI.saved(); else saveUI.failed();
    return ok;
  }

  var dda = Kit.dda('turbo-karts', { id: 'race', target: 0.72, tiers: 5 });
  var state = 'title', mode = 'cpu', race = null, demo = null, reported = false;
  var countT = 0, countShown = -1, trackIndex = 0, cup = 0, cupRace = 0, cupPts = 0;
  var resultLock = 0, trackDirty = true, ghostRec = null, hazardAt = 0;
  var shake = Kit.shake();
  var PMAX = 360, parts = [], pHead = 0, pi;
  for (pi = 0; pi < PMAX; pi++) parts.push({ on: 0 });

  function easyOn() {
    if (save.easy === 1) return true;
    if (save.easy === 0) return false;
    var b = Kit.profile.band;
    return b === '6-7' || b === '8-9';
  }

  function show(name) {
    state = name;
    $('scrTitle').hidden = name !== 'title';
    $('scrTracks').hidden = name !== 'tracks';
    $('scrGarage').hidden = name !== 'garage';
    $('scrPause').hidden = name !== 'pause';
    $('scrResult').hidden = name !== 'result';
    $('bPause').hidden = name !== 'race' && name !== 'count';
    if (name === 'title') paintTitle();
    if (name === 'tracks') paintTracks();
    if (name === 'garage') paintGarage();
  }

  function burst(x, y, n, colors, speed) {
    if (Kit.motion.reduced()) return;
    var i, a, sp, q, c = colors || ['#ffe08a', '#fff', '#7ecbff'];
    for (i = 0; i < n && i < 40; i++) {
      q = parts[pHead]; pHead = (pHead + 1) % PMAX;
      a = Math.random() * 6.3; sp = (speed || 180) * (0.4 + Math.random() * 0.6);
      q.on = 1; q.x = x; q.y = y; q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp;
      q.life = 0.35 + Math.random() * 0.4; q.max = q.life;
      q.size = 3 + Math.random() * 4; q.color = c[(Math.random() * c.length) | 0]; q.g = 20;
    }
  }
  function drawParts(c) {
    var i, q, t;
    for (i = 0; i < PMAX; i++) {
      q = parts[i]; if (!q.on) continue;
      t = q.life / q.max;
      c.globalAlpha = Math.max(0, t);
      c.fillStyle = q.color;
      c.fillRect(q.x, q.y, q.size, q.size * 0.6);
    }
    c.globalAlpha = 1;
  }
  function stepParts(dt) {
    var i, q;
    for (i = 0; i < PMAX; i++) {
      q = parts[i]; if (!q.on) continue;
      q.life -= dt; if (q.life <= 0) { q.on = 0; continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    }
  }

  function roundId() {
    var n = trackIndex + 1;
    if (mode === 'pvp') return 'T' + n + ':pvp';
    if (mode === 'tt') return 'tt-T' + n;
    if (mode === 'cup') return 'c' + (cup + 1) + '-' + (cupRace + 1);
    return 'T' + n;
  }

  function begin(opts) {
    opts = opts || {};
    mode = opts.mode || 'cpu';
    trackIndex = clamp(opts.track == null ? save.last : opts.track | 0, 0, 7);
    if (trackIndex >= save.open && mode !== 'cup') trackIndex = 0;
    var humans = mode === 'pvp' ? 2 : 1;
    var cpus = mode === 'tt' ? 0 : mode === 'pvp' ? 4 : 5;
    var raceOpts = {
      track: trackIndex, humans: humans, cpus: cpus, phase: 'count',
      seed: (opts.seed >>> 0) || ((Math.random() * 1e9) >>> 0) || 1,
      body: save.kart, color: D.PAINTS[save.paint].color,
      name: 'أنت', items: mode !== 'tt', laps: 3
    };
    if (mode === 'cpu' || mode === 'cup' || mode === 'tt') {
      raceOpts.tier = dda.tier;
      raceOpts.tierMul = dda.value(0.86, 1);
      raceOpts.noise = dda.pick([6, 4, 2.5, 1, 0]);
      raceOpts.rubber = dda.pick([0.2, 0.15, 0.1, 0.06, 0.02]);
      raceOpts.agg = dda.pick([0.45, 0.58, 0.72, 0.86, 1]);
    }
    if (mode === 'tt' || mode === 'pvp') {
      raceOpts.tier = 3; raceOpts.tierMul = 1; raceOpts.noise = mode === 'tt' ? 0 : 4; raceOpts.rubber = 0;
    }
    race = TK.newRace(raceOpts);
    var k0 = race.karts[0];
    k0.sticker = D.STICKERS[save.sticker].id;
    k0.hat = D.HATS[save.hat].id;
    k0.color = D.PAINTS[save.paint].color;
    if (race.karts[1] && !race.karts[1].cpu) {
      race.karts[1].name = 'صديقك';
      race.karts[1].color = D.PAINTS[(save.paint + 1) % 8].color;
      race.karts[1].body = save.kart === 0 ? 1 : 0;
    }
    reported = false;
    countT = 3.25;
    countShown = -1;
    resultLock = 0;
    ghostRec = mode === 'tt' ? [] : null;
    hazardAt = 0;
    R.clearSkid();
    trackDirty = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    Kit.stats.round(roundId());
    show('count');
  }

  function finishRace() {
    if (!race || reported) return;
    reported = true;
    var k = race.karts[0], place = k.place, points = TK.PLACE[place - 1] || 3;
    var coins = 0, note = '', unlocked = '';
    if (mode === 'tt') {
      points = TK.ttPoints(race.track.par, Math.max(0.01, race.time));
      Kit.stats.end('end', points);
      var ms = (race.time * 100) | 0;
      if (!save.best[trackIndex] || ms < save.best[trackIndex]) {
        save.best[trackIndex] = ms;
        if (ghostRec && ghostRec.length > 8) save.ghost = { t: trackIndex, d: ghostRec.slice(0, 1800) };
        note = 'رقم قياسي جديد!';
      }
      coins = 8 + (k.turbos | 0) * 2;
    } else if (mode === 'pvp') {
      Kit.stats.end('end');
      points = 0;
      coins = 6;
    } else {
      Kit.stats.end(place <= 3 ? 'win' : 'lose', points);
      dda.result((7 - place) / 6);
      coins = [40, 30, 22, 16, 12, 8][place - 1] + (k.turbos | 0) * 2;
      if (place <= 3 && trackIndex + 1 === save.open && save.open < 8) {
        save.open++;
        unlocked = 'حلبة جديدة: ' + D.TRACKS[save.open - 1].name;
      }
      if (mode === 'cup') {
        cupPts += points;
        if (cupRace >= 3) {
          var trophy = cupPts >= 36 ? 3 : cupPts >= 28 ? 2 : cupPts >= 20 ? 1 : 0;
          if (trophy > save.cups[cup]) save.cups[cup] = trophy;
          var names = ['', 'برونزية', 'فضية', 'ذهبية'];
          if (trophy) note = 'كأس ' + names[trophy] + '!';
        }
      }
    }
    save.coins = clamp(save.coins + coins, 0, 99999);
    save.last = trackIndex;
    persist();
    if (!Kit.motion.reduced() && place === 1) burst(640, 360, 40, ['#ffe08a', '#ff5a7a', '#7ecbff', '#fff'], 260);
    A.item('finish');
    paintResult(place, points, coins, note, unlocked);
    resultLock = 0.45;
    show('result');
  }

  function paintResult(place, points, coins, note, unlocked) {
    var win = mode !== 'pvp' && mode !== 'tt' && place <= 3;
    $('resBanner').textContent = mode === 'pvp' ? 'انتهى السباق!' : mode === 'tt' ? 'انتهى الوقت!' : win ? 'أحسنت!' : 'حاول مرة أخرى';
    $('resPlace').textContent = mode === 'tt' ? clock(race.time) : ORD[place - 1];
    $('resPoints').textContent = mode === 'pvp' ? '' : 'النقاط ' + points;
    var stars = mode === 'tt' ? (points >= 110 ? 3 : points >= 90 ? 2 : 1) : place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
    $('resStars').textContent = stars ? '★★★'.slice(0, stars) : '';
    $('resCoins').setAttribute('dir', 'ltr');
    $('resCoins').textContent = coins ? '+' + coins : '';
    $('resNote').textContent = note || '';
    $('resUnlock').hidden = !unlocked;
    $('resUnlock').textContent = unlocked || '';
    var again = $('bAgain');
    again.textContent = mode === 'cup' && cupRace < 3 ? 'السباق التالي' : 'العب مجدداً';
    var rows = race.karts.slice().sort(function (a, b) { return a.place - b.place; }).map(function (k) {
      return '<div class="prow"><span>' + k.name + '</span><b dir="ltr">' + k.place + '</b><i style="background:' + k.color + '"></i></div>';
    }).join('');
    $('resList').innerHTML = rows;
  }

  function clock(t) {
    t = Math.max(0, t); var m = (t / 60) | 0, s = (t % 60) | 0;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function paintTitle() {
    $('tCoins').textContent = Kit.fmt(save.coins);
    $('tOpen').textContent = save.open + ' / 8';
    var cupTxt = ['—', 'برونز', 'فضة', 'ذهب'];
    $('tCups').textContent = cupTxt[save.cups[0]] + ' · ' + cupTxt[save.cups[1]];
    $('bEasy').textContent = easyOn() ? 'توجيه سهل: تشغيل' : 'توجيه سهل: إيقاف';
    $('bEasy').setAttribute('aria-pressed', easyOn() ? 'true' : 'false');
  }

  function paintTracks() {
    var pick = $('scrTracks').dataset.mode || 'cpu';
    $('tracksTitle').textContent = pick === 'tt' ? 'سباق الوقت' : pick === 'cup' ? 'اختر الكأس' : 'اختر الحلبة';
    $('cupRow').hidden = pick !== 'cup';
    $('trackGrid').hidden = pick === 'cup';
    var host = $('trackGrid');
    host.innerHTML = '';
    D.TRACKS.forEach(function (t, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tcard' + (i >= save.open ? ' locked' : '') + (t.cup ? ' space' : '');
      b.disabled = i >= save.open;
      var best = save.best[i] ? clock(save.best[i] / 100) : '—';
      b.innerHTML = '<b>' + t.name + '</b><small>' + (i >= save.open ? 'مقفل' : 'أفضل وقت ' + best) + '</small>';
      b.addEventListener('click', function () {
        if (i >= save.open) return;
        Kit.juice.select();
        if ($('scrTracks').dataset.mode === 'cup') return;
        mode = $('scrTracks').dataset.mode === 'tt' ? 'tt' : 'cpu';
        begin({ mode: mode, track: i });
      });
      host.appendChild(b);
    });
    var c0 = save.open > 0, c1 = save.open > 4;
    $('cup0').disabled = !c0;
    $('cup1').disabled = !c1;
    $('cup0').classList.toggle('locked', !c0);
    $('cup1').classList.toggle('locked', !c1);
  }

  function paintGarage() {
    $('gCoins').textContent = Kit.fmt(save.coins);
    var host = $('kartGrid');
    host.innerHTML = '';
    D.KARTS.forEach(function (kart, i) {
      var owned = !!save.ownedK[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'kcard' + (save.kart === i ? ' on' : '') + (owned ? '' : ' locked');
      b.innerHTML = '<canvas width="96" height="96"></canvas><b>' + kart.name + '</b><small>' + kart.blurb + '</small>' +
        bars(kart) + (owned ? '' : '<em>' + kart.price + '</em>');
      var cv = b.querySelector('canvas'), g = cv.getContext('2d');
      g.drawImage(R.sprite(D.PAINTS[save.paint].color, i), 0, 0);
      b.addEventListener('click', function () {
        if (!owned) {
          if (save.coins < kart.price) { Kit.juice.error(); return; }
          save.coins -= kart.price; save.ownedK[i] = 1; Kit.juice.coin(2);
        }
        save.kart = i; Kit.juice.select(); persist(); paintGarage();
      });
      host.appendChild(b);
    });
    swatches('paintRow', D.PAINTS, save.ownedP, save.paint, function (i) { save.paint = i; });
    swatches('stickerRow', D.STICKERS, save.ownedS, save.sticker, function (i) { save.sticker = i; });
    swatches('hatRow', D.HATS, save.ownedH, save.hat, function (i) { save.hat = i; });
    swatches('hornRow', D.HORNS, save.ownedN, save.horn, function (i) { save.horn = i; A.horn(D.HORNS[i].id); });
  }
  function bars(kart) {
    function row(v) {
      return '<b><u style="width:' + Math.round(Math.min(1, v) * 100) + '%"></u></b>';
    }
    return '<span class="stats">' + row(kart.speed / 1.12) + row(kart.grip / 1.25) + row(kart.accel / 1.25) + '</span>';
  }
  function swatches(id, list, owned, cur, pick) {
    var host = $(id);
    host.innerHTML = '';
    list.forEach(function (item, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw' + (cur === i ? ' on' : '');
      b.textContent = owned[i] ? item.name : item.name + ' · ' + item.price;
      if (item.color) b.style.background = item.color;
      b.addEventListener('click', function () {
        if (!owned[i]) {
          if (save.coins < item.price) { Kit.juice.error(); return; }
          save.coins -= item.price; owned[i] = 1; Kit.juice.coin(1);
        }
        pick(i); Kit.juice.select(); persist(); paintGarage();
      });
      host.appendChild(b);
    });
  }

  function pad(which) {
    var K = Kit.keys, pvp = mode === 'pvp';
    if (which === 0) {
      if (pvp) return { up: K.down('KeyW'), down: K.down('KeyS'), left: K.down('KeyA'), right: K.down('KeyD'), drift: K.down('Space'), use: K.pressed('KeyE') };
      return {
        up: K.down('KeyW') || K.down('ArrowUp'), down: K.down('KeyS') || K.down('ArrowDown'),
        left: K.down('KeyA') || K.down('ArrowLeft'), right: K.down('KeyD') || K.down('ArrowRight'),
        drift: K.down('Space') || K.down('Slash'),
        use: K.pressed('KeyE') || K.pressed('Period') || K.pressed('Enter')
      };
    }
    return {
      up: K.down('ArrowUp'), down: K.down('ArrowDown'), left: K.down('ArrowLeft'), right: K.down('ArrowRight'),
      drift: K.down('Slash'), use: K.pressed('Period') || K.pressed('Enter')
    };
  }
  function drive(k, keys) {
    var inp = k.inp || (k.inp = { th: 0, br: 0, st: 0, drift: 0, use: 0 });
    if (easyOn()) {
      var x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      var y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x || y) {
        var want = Math.atan2(y, x);
        inp.st = clamp(TK.wrap(want - k.ang) / 0.5, -1, 1);
        inp.th = 1; inp.br = 0;
      } else { inp.th = 0; inp.br = 0; inp.st = 0; }
    } else {
      inp.th = keys.up ? 1 : 0;
      inp.br = keys.down ? 1 : 0;
      inp.st = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    }
    inp.drift = keys.drift ? 1 : 0;
    inp.use = keys.use ? 1 : 0;
    return inp;
  }

  function consume(ev) {
    var i, e, solo = mode === 'cpu' || mode === 'cup' || mode === 'tt';
    for (i = 0; i < ev.length; i++) {
      e = ev[i];
      if (state !== 'race') continue;
      if (e.i === 0 || e.t === 'bump') {
        if (e.t === 'turbo') { A.turbo(e.level); shake.add(7 + e.level * 2); burst(race.karts[e.i].x, race.karts[e.i].y, 16, ['#7ecbff', '#ff9a1f', '#c86bff'], 220); A.horn(D.HORNS[save.horn].id); }
        else if (e.t === 'wall' && e.i === 0) { A.item('wall'); shake.add(5); }
        else if (e.t === 'bump' && (e.i === 0 || e.j === 0)) { A.item('bump'); shake.add(3); }
        else if (e.t === 'spin' && e.i === 0) A.item('spin');
        else if (e.t === 'item') A.item('box');
        else if (e.t === 'cookie' || e.t === 'pad') A.item('cookie');
        else if (e.t === 'hop' || e.t === 'ramp') A.item('hop');
        else if (e.t === 'shield' || e.t === 'block') A.item(e.t === 'block' ? 'block' : 'shield');
        else if (e.t === 'drop') A.item('drop');
        else if (e.t === 'rocket') A.item('rocket');
        else if (e.t === 'lap') A.item('lap');
        else if (e.t === 'confetti') burst(e.x, e.y, 28, ['#ffe08a', '#ff5a7a', '#7ecbff', '#fff', '#b6ff7a'], 240);
      }
      if (e.t === 'turbo' && e.i > 0) burst(race.karts[e.i].x, race.karts[e.i].y, 8, ['#ff9a1f', '#fff'], 160);
      if (!solo || e.i !== 0) continue;
      if (e.t === 'turbo') Kit.track.hit();
      if (e.t === 'wall' || e.t === 'spin') Kit.track.miss();
      if (e.t === 'rocket' && e.target === 0) { Kit.track.cue(); hazardAt = performance.now(); }
      if ((e.t === 'block' || e.t === 'hop') && hazardAt) { Kit.track.react(performance.now() - hazardAt); hazardAt = 0; }
    }
  }

  function humansDone() {
    var i, k, wait = false, any = false;
    for (i = 0; i < race.karts.length; i++) {
      k = race.karts[i];
      if (k.cpu) continue;
      if (k.finished) any = true; else wait = true;
    }
    if (!wait && any) return true;
    if (any && mode === 'pvp') {
      var first = 0;
      for (i = 0; i < race.karts.length; i++) if (!race.karts[i].cpu && race.karts[i].finished) first = Math.max(first, race.time - race.karts[i].finishT);
      if (first > 18) return true;
    }
    return mode !== 'pvp' && race.karts[0].finished;
  }

  function ghostAt(t) {
    var g = save.ghost;
    if (!g || g.t !== trackIndex || mode !== 'tt') return null;
    var d = g.d, n = (d.length / 3) | 0, f = t * 10;
    if (n < 2) return null;
    var i = Math.min(n - 2, Math.max(0, f | 0)), u = f - i;
    return {
      x: d[i * 3] + (d[(i + 1) * 3] - d[i * 3]) * u,
      y: d[i * 3 + 1] + (d[(i + 1) * 3 + 1] - d[i * 3 + 1]) * u,
      ang: d[i * 3 + 2] / 100,
      color: 'rgba(255,255,255,0.8)', body: save.kart, sticker: 'none', hat: 'none',
      boostT: 0, shield: 0, hopT: 0, finished: 0, drifting: 0, vl: 0
    };
  }

  function update(dt) {
    var K = Kit.keys;
    if (state === 'title' || state === 'tracks' || state === 'garage') {
      if (!demo) demo = TK.newRace({ track: (save.last) % 8, humans: 0, cpus: 6, tier: 3, phase: 'race', seed: 4, items: true });
      AI.inputs(demo);
      TK.step(demo, dt, AI.inputs(demo));
      R.skid(demo);
      if (demo.over) demo = null;
      if (state === 'title' && (K.pressed('Enter') || K.pressed('Space'))) { Kit.juice.select(); begin({ mode: 'cpu', track: Math.min(save.last, save.open - 1) }); }
      if (K.pressed('Escape') && state !== 'title') { Kit.juice.back(); show('title'); }
    } else if (state === 'count') {
      countT -= dt;
      var tick = countT > 2.2 ? 3 : countT > 1.2 ? 2 : countT > 0.25 ? 1 : 0;
      if (tick !== countShown) {
        countShown = tick;
        if (window.Kit.juice) Kit.juice.countdown(tick);
      }
      if (countT <= 0) {
        state = 'race';
        race.phase = 'race';
        show('race');
        race.karts.forEach(function (k) { k.vf = 70; });
        A.horn(D.HORNS[save.horn].id);
      }
      if (K.pressed('KeyP') || K.pressed('Escape')) pause();
    } else if (state === 'race') {
      var ins = AI.inputs(race);
      drive(race.karts[0], pad(0));
      if (mode === 'pvp') drive(race.karts[1], pad(1));
      ins[0] = race.karts[0].inp;
      race.karts[0].steer = ins[0].st;
      if (mode === 'pvp') { ins[1] = race.karts[1].inp; race.karts[1].steer = ins[1].st; }
      TK.step(race, dt, ins);
      R.skid(race);
      consume(race.ev);
      if (ghostRec && (race.time * 60 | 0) % 6 === 0) {
        var h = race.karts[0];
        ghostRec.push(h.x | 0, h.y | 0, (h.ang * 100) | 0);
      }
      var sliding = race.karts[0].drifting;
      A.engine(race.karts[0].vf > 40, race.karts[0].vf);
      A.drift(sliding);
      if (race.karts[0].drifting && Math.random() < 0.7) burst(race.karts[0].x, race.karts[0].y, 2, ['#ffe08a', '#fff', '#ff9a1f'], 80);
      if (humansDone()) finishRace();
      if (K.pressed('KeyP') || K.pressed('Escape')) pause();
    } else if (state === 'pause') {
      if (K.pressed('KeyP') || K.pressed('Escape')) resume();
      if (K.pressed('KeyR')) restart();
    } else if (state === 'result') {
      resultLock -= dt;
      if (resultLock <= 0 && (K.pressed('Enter') || K.pressed('Space') || K.pressed('KeyR'))) again();
      if (K.pressed('Escape')) { Kit.juice.back(); show('title'); }
    }
    shake.update(dt);
    if (state !== 'pause') stepParts(dt);
    K.endFrame();
  }

  function countLabel() {
    if (countT > 2.2) return '3';
    if (countT > 1.2) return '2';
    if (countT > 0.25) return '1';
    return 'انطلق!';
  }

  function render() {
    var shown = race && (state === 'race' || state === 'count' || state === 'pause' || state === 'result') ? race : demo;
    if (trackDirty && shown) { R.buildTrack(shown.track); trackDirty = false; }
    R.draw(ctx, {
      race: shown,
      shakeX: state === 'race' ? shake.x : 0,
      shakeY: state === 'race' ? shake.y : 0,
      count: state === 'count' ? countLabel() : null,
      play: state === 'race' || state === 'pause' || state === 'result',
      parts: drawParts,
      ghost: state === 'race' && mode === 'tt' ? ghostAt(race.time) : null
    });
  }

  function pause() {
    if (state !== 'race' && state !== 'count') return;
    show('pause');
  }
  function resume() {
    if (state !== 'pause') return;
    Kit.juice.select();
    show(race && race.phase === 'race' ? 'race' : 'count');
  }
  function restart() {
    Kit.juice.select();
    begin({ mode: mode, track: trackIndex, seed: ((Math.random() * 1e9) >>> 0) || 1 });
  }
  function again() {
    Kit.juice.select();
    if (mode === 'cup' && cupRace < 3 && reported) {
      cupRace++;
      begin({ mode: 'cup', track: cup * 4 + cupRace });
      return;
    }
    if (mode === 'cup' && cupRace >= 3) { show('title'); return; }
    begin({ mode: mode, track: trackIndex });
  }

  $('bPlay').addEventListener('click', function () { Kit.juice.select(); begin({ mode: 'cpu', track: Math.min(save.last, save.open - 1) }); });
  $('b2p').addEventListener('click', function () { Kit.juice.select(); begin({ mode: 'pvp', track: Math.min(save.last, save.open - 1) }); });
  $('bTT').addEventListener('click', function () { Kit.juice.select(); $('scrTracks').dataset.mode = 'tt'; show('tracks'); });
  $('bTracks').addEventListener('click', function () { Kit.juice.select(); $('scrTracks').dataset.mode = 'cpu'; show('tracks'); });
  $('bCup').addEventListener('click', function () { Kit.juice.select(); $('scrTracks').dataset.mode = 'cup'; show('tracks'); });
  $('bGarage').addEventListener('click', function () { Kit.juice.select(); show('garage'); });
  $('bEasy').addEventListener('click', function () {
    save.easy = easyOn() ? 0 : 1;
    Kit.juice.toggle(save.easy === 1);
    persist(); paintTitle();
  });
  function backTitle(id) { $(id).addEventListener('click', function () { Kit.juice.back(); show('title'); }); }
  backTitle('tracksBack'); backTitle('garageBack');
  $('cup0').addEventListener('click', function () { startCup(0); });
  $('cup1').addEventListener('click', function () { if (save.open > 4) startCup(1); });
  function startCup(i) {
    cup = i; cupRace = 0; cupPts = 0;
    Kit.juice.select();
    begin({ mode: 'cup', track: i * 4 });
  }
  $('bPause').addEventListener('click', function () { this.blur(); pause(); });
  $('bResume').addEventListener('click', function () { this.blur(); resume(); });
  $('bRestart').addEventListener('click', function () { this.blur(); restart(); });
  $('bMenu').addEventListener('click', function () { this.blur(); Kit.juice.back(); show('title'); });
  $('bAgain').addEventListener('click', function () { this.blur(); again(); });
  $('bResultMenu').addEventListener('click', function () { this.blur(); Kit.juice.back(); show('title'); });

  Kit.muteButton();
  show('title');
  Kit.loop(update, render);

  window.TKU = { easyOn: easyOn };
  window.__game = {
    get state() { return state; },
    get race() { return race; },
    get mode() { return mode; },
    get save() { return save; },
    start: function (o) { begin(o || {}); },
    endNow: function (place) {
      if (!race) return;
      if (race.phase !== 'race') { race.phase = 'race'; state = 'race'; }
      var p = clamp(place || 1, 1, race.karts.length);
      race.karts.forEach(function (k, i) { k.place = i === 0 ? p : (i < p ? i + 1 : i); k.finished = 1; });
      race.karts[0].place = p;
      finishRace();
    },
    skipIntro: function () {
      if (!race) return;
      countT = 0; countShown = 0;
      race.phase = 'race'; state = 'race'; show('race');
      race.karts.forEach(function (k) { k.vf = 100; });
    },
    placeStraight: function () {
      if (!race) return;
      var tr = race.track, bi = 0, best = 99, i, p, k = race.karts[0];
      for (i = 0; i < tr.curv.length; i++) if (tr.curv[i] < best) { best = tr.curv[i]; bi = i; }
      p = TK.pointAt(tr, tr.cum[bi] + 4);
      k.x = p.x; k.y = p.y; k.px = p.x; k.py = p.y;
      k.seg = p.seg; k.s = p.s; k.ang = Math.atan2(p.ty, p.tx);
      k.vf = 120; k.vl = 0; k.charge = 0; k.spinT = 0; k.hopT = 0; k.finished = 0;
    },
    info: function () {
      if (!race) return null;
      var k = race.karts[0];
      return { state: state, mode: mode, time: race.time, place: k.place, lap: k.lap, charge: k.charge, boost: k.boostT, item: k.item };
    }
  };

  Kit.lifecycle({ pause: function () { pause(); } });
  Kit.ready();
})();

/* Shortcut Factory (مصنع الاختصارات) — Cyber-Bot Cloner & Blaster Arcade.
 * Canvas 2D renderer using Kit.art sprites, Kit.juice discrete SFX, Kit.dda, Kit.stats & Kit.track. */
(function () {
  'use strict';

  const E = window.SFEngine, J = Kit.juice, W = E.W, H = E.H, INK = '#081026';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const reduced = () => Kit.motion.reduced();

  if (Kit.art && typeof Kit.art.init === 'function') {
    Kit.art.init({ canvas: canvas, mode: '2d', theme: 'neon' });
  }

  let dirty = true;
  const view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: v => {
      ui.style.left = canvas.style.left; ui.style.top = canvas.style.top;
      ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
    }
  });

  const fx = Kit.particles(), shake = Kit.shake();
  const store = Kit.store('shortcut-factory');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = E.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved(); return true;
  }
  const dda = Kit.dda('shortcut-factory', { id: 'main' });

  let screen = 'title', world = null, currentLevel = 0, demo = null, endingTimer = 0;
  let resultData = null, resultT = 0, appTime = 0, idleTime = 0, roundOpen = false;
  let dockRects = [], dockPress = {}, podShake = {};
  const held = {};
  let beams = [], flyers = [], floats = [];
  let clonerPulse = 0, turretPulse = 0, chronoWave = 0;

  /* ---- Bounded Static Kit.art Sprites ---- */
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function strokeInk(g, lw, col) {
    g.lineWidth = lw || 4; g.strokeStyle = col || INK;
    g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
  }

  function drawTxt(g, str, x, y, size, color, opts) {
    opts = opts || {};
    g.font = '700 ' + size + 'px Fredoka, sans-serif';
    g.textAlign = opts.align || 'center'; g.textBaseline = opts.base || 'middle';
    g.direction = /[؀-ۿ]/.test(str) ? 'rtl' : 'ltr';
    if (opts.stroke !== false) {
      g.lineJoin = 'round'; g.lineWidth = opts.stroke || Math.max(4, Math.round(size * 0.2));
      g.strokeStyle = opts.ink || INK; g.strokeText(str, x, y);
    }
    g.fillStyle = color || '#ffffff'; g.fillText(str, x, y);
  }

  const fallbackCache = new Map();
  function getSprite(key, w, h, drawFn) {
    if (Kit.art && typeof Kit.art.sprite === 'function') {
      const s = Kit.art.sprite(key, w, h, drawFn);
      if (s) return s.canvas || s;
    }
    let c = fallbackCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = w; c.height = h;
      drawFn(c.getContext('2d'), w, h); fallbackCache.set(key, c);
    }
    return c;
  }

  const getThemeObj = id => E.THEMES.find(t => t.id === id) || E.THEMES[0];
  const getArmorObj = id => E.ARMORS.find(a => a.id === id) || E.ARMORS[0];

  function paintHeroBot(g, kind, armorId) {
    const bot = E.BOTS[kind] || E.BOTS.laser, arm = getArmorObj(armorId);
    const bodyCol = arm.id === 'stealth' ? '#263238' : bot.color;
    const visorCol = arm.id === 'std' ? bot.color : arm.visor;
    g.save(); g.translate(56, 60);
    if (arm.crest === 'crown') {
      g.beginPath(); g.moveTo(-16, -38); g.lineTo(-20, -52); g.lineTo(-7, -44); g.lineTo(0, -55);
      g.lineTo(7, -44); g.lineTo(20, -52); g.lineTo(16, -38); g.closePath();
      g.fillStyle = '#ffd740'; g.fill(); strokeInk(g, 3.5);
    } else if (arm.crest === 'halo') {
      g.beginPath(); g.ellipse(0, -48, 22, 6, 0, 0, Math.PI * 2);
      g.strokeStyle = '#ff80ab'; g.lineWidth = 4; g.stroke();
    } else {
      g.beginPath(); g.moveTo(0, -36); g.lineTo(0, -49); strokeInk(g, 4, visorCol);
      g.beginPath(); g.arc(0, -51, 5, 0, Math.PI * 2); g.fillStyle = '#ffd740'; g.fill(); strokeInk(g, 3);
    }
    if (kind === 'laser') {
      rr(g, -34, -4, 12, 24, 5); g.fillStyle = '#ffd740'; g.fill(); strokeInk(g, 3.5);
      rr(g, 22, -4, 12, 24, 5); g.fillStyle = '#ffd740'; g.fill(); strokeInk(g, 3.5);
      rr(g, -23, -8, 46, 36, 12); g.fillStyle = bodyCol; g.fill(); strokeInk(g, 4);
      rr(g, -13, 0, 26, 18, 6); g.fillStyle = '#0d1b3e'; g.fill();
      g.beginPath(); g.arc(0, 9, 5, 0, Math.PI * 2); g.fillStyle = '#00e676'; g.fill();
      rr(g, -26, -38, 52, 32, 13); g.fillStyle = arm.trim; g.fill(); strokeInk(g, 4);
      rr(g, -19, -30, 38, 16, 7); g.fillStyle = '#09142e'; g.fill();
      rr(g, -14, -26, 10, 8, 3); g.fillStyle = visorCol; g.fill();
      rr(g, 4, -26, 10, 8, 3); g.fillStyle = visorCol; g.fill();
    } else if (kind === 'drone') {
      g.beginPath(); g.moveTo(-44, -6); g.lineTo(-18, -16); g.lineTo(-18, 10); g.closePath();
      g.moveTo(44, -6); g.lineTo(18, -16); g.lineTo(18, 10); g.closePath();
      g.fillStyle = arm.trim; g.fill(); strokeInk(g, 3.5);
      g.beginPath(); g.arc(0, -8, 25, 0, Math.PI * 2); g.fillStyle = bodyCol; g.fill(); strokeInk(g, 4);
      rr(g, -18, -20, 36, 16, 8); g.fillStyle = '#09142e'; g.fill();
      g.beginPath(); g.arc(-7, -12, 4.5, 0, Math.PI * 2); g.arc(7, -12, 4.5, 0, Math.PI * 2);
      g.fillStyle = visorCol; g.fill();
      rr(g, -12, 15, 24, 10, 5); g.fillStyle = '#ffd740'; g.fill(); strokeInk(g, 3);
    } else if (kind === 'tank') {
      rr(g, -34, 12, 68, 18, 8); g.fillStyle = '#37474f'; g.fill(); strokeInk(g, 4);
      rr(g, -28, -12, 56, 28, 10); g.fillStyle = bodyCol; g.fill(); strokeInk(g, 4);
      g.beginPath(); g.arc(0, -14, 22, Math.PI, 0); g.closePath();
      g.fillStyle = arm.trim; g.fill(); strokeInk(g, 4);
      rr(g, -16, -28, 32, 13, 6); g.fillStyle = '#09142e'; g.fill();
      rr(g, -11, -25, 22, 7, 3); g.fillStyle = visorCol; g.fill();
    } else {
      g.beginPath(); g.moveTo(0, -46); g.lineTo(14, -22); g.lineTo(-10, -22); g.closePath();
      g.fillStyle = '#00e5ff'; g.fill(); strokeInk(g, 3.5);
      rr(g, -28, -24, 56, 44, 18); g.fillStyle = bodyCol; g.fill(); strokeInk(g, 4);
      rr(g, -20, -16, 40, 16, 8); g.fillStyle = '#09142e'; g.fill();
      g.beginPath(); g.moveTo(-13, -10); g.lineTo(-4, -6); g.lineTo(-13, -4); g.closePath();
      g.moveTo(13, -10); g.lineTo(4, -6); g.lineTo(13, -4); g.closePath();
      g.fillStyle = visorCol; g.fill();
      rr(g, -16, 5, 32, 9, 4); g.fillStyle = arm.trim; g.fill(); strokeInk(g, 2.5);
    }
    g.restore();
  }

  const BOT_KEYS = {
    laser: { std: 'bot_laser_std', gold: 'bot_laser_gold', stealth: 'bot_laser_stealth', nova: 'bot_laser_nova' },
    drone: { std: 'bot_drone_std', gold: 'bot_drone_gold', stealth: 'bot_drone_stealth', nova: 'bot_drone_nova' },
    tank: { std: 'bot_tank_std', gold: 'bot_tank_gold', stealth: 'bot_tank_stealth', nova: 'bot_tank_nova' },
    shark: { std: 'bot_shark_std', gold: 'bot_shark_gold', stealth: 'bot_shark_stealth', nova: 'bot_shark_nova' }
  };
  function botSprite(kind, armorId) {
    const m = BOT_KEYS[kind] || BOT_KEYS.laser;
    return getSprite(m[armorId] || m.std, 112, 112, g => paintHeroBot(g, kind, armorId));
  }

  function virusSprite() {
    return getSprite('hazard_virus', 104, 104, g => {
      g.save(); g.translate(52, 52);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath(); g.moveTo(Math.cos(a - 0.2) * 24, Math.sin(a - 0.2) * 24);
        g.lineTo(Math.cos(a) * 42, Math.sin(a) * 42);
        g.lineTo(Math.cos(a + 0.2) * 24, Math.sin(a + 0.2) * 24); g.closePath();
        g.fillStyle = '#ffeb3b'; g.fill(); strokeInk(g, 3.5);
      }
      g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.fillStyle = '#ff1744'; g.fill(); strokeInk(g, 4.5);
      rr(g, -18, -12, 36, 18, 7); g.fillStyle = '#1a0510'; g.fill();
      g.strokeStyle = '#ffeb3b'; g.lineWidth = 3.5; g.beginPath();
      g.moveTo(-12, -8); g.lineTo(-4, 0); g.moveTo(-4, -8); g.lineTo(-12, 0);
      g.moveTo(4, -8); g.lineTo(12, 0); g.moveTo(12, -8); g.lineTo(4, 0); g.stroke();
      g.restore();
    });
  }

  function saboteurSprite() {
    return getSprite('hazard_saboteur', 110, 100, g => {
      g.save(); g.translate(55, 50);
      g.beginPath(); g.moveTo(-22, -16); g.lineTo(-34, -38); g.lineTo(-10, -24); g.closePath();
      g.moveTo(22, -16); g.lineTo(34, -38); g.lineTo(10, -24); g.closePath();
      g.fillStyle = '#ff1744'; g.fill(); strokeInk(g, 3.5);
      rr(g, -30, -24, 60, 46, 18); g.fillStyle = '#7c4dff'; g.fill(); strokeInk(g, 4);
      g.beginPath(); g.arc(0, -4, 14, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); strokeInk(g, 3.5);
      g.beginPath(); g.arc(2, -4, 6, 0, Math.PI * 2); g.fillStyle = '#ff1744'; g.fill();
      g.beginPath(); g.moveTo(-14, 14); g.quadraticCurveTo(0, 22, 14, 14); strokeInk(g, 3.5);
      g.restore();
    });
  }

  const POD_KEYS = { laser: 'pod_laser', drone: 'pod_drone', tank: 'pod_tank', shark: 'pod_shark' };
  function podSprite(kind) {
    const col = (E.BOTS[kind] || E.BOTS.laser).color;
    return getSprite(POD_KEYS[kind] || 'pod_laser', 260, 176, g => {
      // Rocket nose cone & side fins
      g.beginPath(); g.moveTo(96, 22); g.quadraticCurveTo(130, -2, 164, 22); g.closePath();
      g.fillStyle = col; g.fill(); strokeInk(g, 4);
      g.beginPath();
      g.moveTo(28, 102); g.lineTo(4, 150); g.lineTo(48, 142); g.closePath();
      g.moveTo(232, 102); g.lineTo(256, 150); g.lineTo(212, 142); g.closePath();
      g.fillStyle = col; g.fill(); strokeInk(g, 4);
      // Armored ship hull
      rr(g, 22, 20, 216, 128, 28); g.fillStyle = '#122459'; g.fill(); strokeInk(g, 5);
      rr(g, 32, 26, 196, 26, 12); g.fillStyle = col; g.fill(); strokeInk(g, 3);
      // Glowing interior bay
      rr(g, 34, 58, 192, 76, 18); g.fillStyle = '#07112b'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = col; g.stroke();
      rr(g, 64, 146, 40, 14, 5); g.fillStyle = '#546e7a'; g.fill(); strokeInk(g, 3);
      rr(g, 156, 146, 40, 14, 5); g.fillStyle = '#546e7a'; g.fill(); strokeInk(g, 3);
    });
  }

  function clonerSprite() {
    return getSprite('machine_cloner', 196, 250, g => {
      rr(g, 16, 196, 164, 40, 16); g.fillStyle = '#1e3575'; g.fill(); strokeInk(g, 5);
      rr(g, 28, 38, 140, 164, 24); g.fillStyle = 'rgba(0, 229, 255, 0.16)'; g.fill();
      g.lineWidth = 4.5; g.strokeStyle = '#00e5ff'; g.stroke();
      g.strokeStyle = 'rgba(0, 229, 255, 0.25)'; g.lineWidth = 2;
      for (let y = 64; y < 190; y += 26) { g.beginPath(); g.moveTo(36, y); g.lineTo(160, y); g.stroke(); }
      rr(g, 16, 14, 164, 34, 14); g.fillStyle = '#1e3575'; g.fill(); strokeInk(g, 5);
      rr(g, 44, 22, 108, 14, 7); g.fillStyle = '#00e5ff'; g.fill();
    });
  }

  function turretSprite() {
    return getSprite('machine_turret', 156, 180, g => {
      rr(g, 14, 126, 114, 40, 14); g.fillStyle = '#263238'; g.fill(); strokeInk(g, 4.5);
      rr(g, 74, 52, 68, 20, 8); g.fillStyle = '#ff1744'; g.fill(); strokeInk(g, 4);
      rr(g, 74, 82, 68, 20, 8); g.fillStyle = '#ff1744'; g.fill(); strokeInk(g, 4);
      g.beginPath(); g.arc(64, 82, 42, 0, Math.PI * 2); g.fillStyle = '#37474f'; g.fill(); strokeInk(g, 5);
      g.beginPath(); g.arc(64, 82, 19, 0, Math.PI * 2); g.fillStyle = '#ffd740'; g.fill(); strokeInk(g, 3.5);
    });
  }

  const BELT_KEYS = { cyan: 'belt_cyan', plasma: 'belt_plasma', solar: 'belt_solar', emerald: 'belt_emerald' };
  function beltSprite(themeId) {
    const th = getThemeObj(themeId);
    return getSprite(BELT_KEYS[themeId] || 'belt_cyan', 830, 56, g => {
      rr(g, 4, 6, 822, 44, 20); g.fillStyle = th.belt; g.fill(); strokeInk(g, 5);
      g.beginPath(); g.moveTo(20, 12); g.lineTo(810, 12); g.strokeStyle = th.glow; g.lineWidth = 3; g.stroke();
    });
  }

  /* ---- Screens, Map & Shop ---- */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', shop: 'scrShop', pause: 'scrPause', result: 'scrResult' };
  function setScreen(next) {
    screen = next;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = next !== 'play';
    dirty = true;
    if (next === 'play') { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  const announce = msg => { $('live').textContent = msg; };

  function updateHeaderChips() {
    const starsStr = E.totalStars(save) + '/' + (E.COUNT * 3);
    $('titleStars').querySelector('b').textContent = starsStr;
    $('titleCoins').querySelector('b').textContent = String(save.coins);
    $('mapCoins').querySelector('b').textContent = String(save.coins);
    $('mapStars').querySelector('b').textContent = starsStr;
    $('shopCoins').querySelector('b').textContent = String(save.coins);
    $('rushBest').textContent = 'أفضل نقاط: ' + (save.bestScore[12] || 0);
  }

  function toTitle() { world = null; roundOpen = false; updateHeaderChips(); setScreen('title'); }

  const mapCards = [];
  function buildMap() {
    const grid = $('tierGrid'); grid.innerHTML = '';
    E.TIERS.forEach(tier => {
      const row = document.createElement('div'); row.className = 'tier-row';
      const badge = document.createElement('div'); badge.className = 'tier-badge';
      badge.style.background = tier.color;
      badge.innerHTML = '<b>' + tier.name + '</b><span>' + tier.badge + '</span>';
      row.appendChild(badge);
      tier.missions.forEach(mi => {
        const m = E.MISSIONS[mi], card = document.createElement('button');
        card.type = 'button'; card.className = 'sf-btn mcard';
        const mainSc = E.SHORTCUTS[m.dock[0]];
        card.innerHTML =
          '<div class="mcard-top"><span class="mnum">' + (mi + 1) + '</span><span class="mtag">' + (mainSc ? mainSc.keys.join('+') : 'Ctrl+C') + '</span></div>' +
          '<b class="mtitle">' + m.title + '</b><div class="mst">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</div>';
        bindClick(card, () => { J.select(); startMission(mi, { showDemo: true }); });
        row.appendChild(card); mapCards[mi] = card;
      });
      grid.appendChild(row);
    });
  }

  function openMap() {
    world = null; roundOpen = false; updateHeaderChips();
    for (let i = 0; i < E.COUNT; i++) {
      const st = save.stars[i] || 0, card = mapCards[i];
      if (!card) continue;
      card.querySelectorAll('.mst svg').forEach((s, idx) => s.classList.toggle('on', idx < st));
      card.setAttribute('aria-label', 'المهمة ' + (i + 1) + ': ' + E.MISSIONS[i].title + '، ' + st + ' نجوم');
    }
    setScreen('map');
  }

  const shopTiles = [];
  function buildShop() {
    [['theme', E.THEMES, 'shopThemes'], ['armor', E.ARMORS, 'shopArmors']].forEach(([cat, list, boxId]) => {
      const box = $(boxId); box.innerHTML = '';
      list.forEach(item => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'sf-btn tile';
        btn.innerHTML = '<canvas width="112" height="112"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em></em></span>';
        bindClick(btn, () => {
          const res = E.buyItem(save, cat, item.id);
          if (res === 'poor') { J.error(); btn.classList.remove('wiggle'); void btn.offsetWidth; btn.classList.add('wiggle'); return; }
          persist(); if (res === 'bought') { J.coin(3); J.levelUp(); } else J.select();
          refreshShop();
        });
        box.appendChild(btn); shopTiles.push({ btn, cat, item, drawn: false });
      });
    });
  }

  function refreshShop() {
    updateHeaderChips();
    shopTiles.forEach(t => {
      const owned = (t.cat === 'armor' ? save.armors : save.themes).indexOf(t.item.id) >= 0;
      const active = save[t.cat] === t.item.id;
      t.btn.classList.toggle('owned', owned); t.btn.classList.toggle('on', active);
      t.btn.classList.toggle('poor', !owned && save.coins < t.item.price);
      t.btn.querySelector('em').textContent = active ? 'مُفعَّل ✓' : owned ? 'متاح ✓' : String(t.item.price);
      if (!t.drawn) {
        const g = t.btn.querySelector('canvas').getContext('2d');
        g.clearRect(0, 0, 112, 112);
        if (t.cat === 'armor') g.drawImage(botSprite('laser', t.item.id), 0, 0, 112, 112);
        else {
          rr(g, 10, 10, 92, 92, 20); g.fillStyle = t.item.bg2; g.fill(); strokeInk(g, 4, t.item.glow);
          rr(g, 18, 52, 76, 22, 10); g.fillStyle = t.item.belt; g.fill(); strokeInk(g, 3, t.item.glow);
          g.beginPath(); g.arc(56, 36, 12, 0, Math.PI * 2); g.fillStyle = t.item.accent; g.fill(); strokeInk(g, 3, '#ffffff');
        }
        t.drawn = true;
      }
    });
    const c = $('preview'), g = c.getContext('2d'), th = getThemeObj(save.theme);
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, th.bg1); grad.addColorStop(1, th.bg2);
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    rr(g, 20, 290, 280, 38, 16); g.fillStyle = th.belt; g.fill(); strokeInk(g, 4, th.glow);
    g.save(); g.translate(160, 210); g.scale(1.55, 1.55); g.drawImage(botSprite('laser', save.armor), -56, -56, 112, 112); g.restore();
    drawTxt(g, getArmorObj(save.armor).name, 160, 62, 24, '#ffd740');
    drawTxt(g, th.name, 160, 366, 22, th.glow);
  }

  /* ---- Mission Lifecycle ---- */
  function startMission(index, opts) {
    opts = opts || {};
    if (roundOpen && world) { Kit.stats.end('quit', world.score); roundOpen = false; }
    currentLevel = index;
    world = E.create(index, {
      seed: ((Date.now() ^ (index * 7919)) & 0x7fffffff) || 101,
      speedScale: dda.value(0.82, 1.25),
      virusScale: dda.value(0.75, 1.25),
      timeScale: dda.value(1.3, 0.9),
      saboteurEvery: Math.round(dda.value(18, 10))
    });
    demo = opts.showDemo && world.def.intro && world.def.intro.length ? { acts: world.def.intro.slice(), t: 0, dur: 1.15 } : null;
    endingTimer = 0; resultData = null; idleTime = 0;
    beams = []; flyers = []; floats = []; podShake = {}; dockPress = {};
    clonerPulse = 0; turretPulse = 0; chronoWave = 0;
    dockRects = computeDockRects(world);
    fx.clear(); Kit.keys.reset();

    const mid = world.id;
    Kit.stats.round(mid);
    roundOpen = true;
    drainEvents(world);
    announce('المهمة: ' + world.def.title);
    setScreen('play');
    J.select();
  }

  function closeDemo() { if (!demo) return; demo = null; idleTime = 0; dirty = true; J.tap(); }
  function pauseGame(own) { if (screen !== 'play') return; setScreen('pause'); if (own) J.tap(); }
  function resumeGame() { if (screen !== 'pause') return; J.select(); setScreen('play'); Kit.keys.reset(); }
  function restartMission() { roundOpen = false; startMission(currentLevel, { showDemo: false }); }
  function quitToMap() { if (roundOpen && world) { Kit.stats.end('quit', world.score); roundOpen = false; } J.tap(); openMap(); }

  function finishMission() {
    if (!world) return;
    const w = world, res = E.applyResult(save, w);
    persist(); dda.result(E.outcome(w));
    if (roundOpen) { Kit.stats.end(res.win ? 'win' : 'lose', w.score); roundOpen = false; }
    resultData = res; resultT = 0;
    $('resTitle').textContent = res.win ? (w.def.endless ? 'انتهى التحدي اللانهائي!' : 'اكتملت المهمة بنجاح!') : 'انتهى الوقت! حاول مجدداً';
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on', 'pop'));
    $('resCoins').textContent = '+' + res.coins;
    $('resBoxes').textContent = String(w.launchedCount);
    $('resScore').textContent = String(w.score);
    $('resBest').hidden = !res.best;
    const hasNext = res.win && !w.def.endless && w.index + 1 < E.COUNT;
    resultData.nextAction = hasNext ? 'next' : res.win ? 'map' : 'again';
    $('resNextText').textContent = hasNext ? 'المهمة التالية' : res.win ? 'قائمة المهمات' : 'أعد المحاولة';
    $('resEnterLabel').textContent = $('resNextText').textContent;
    setScreen('result');
  }

  /* ---- Events & SFX ---- */
  function addFloat(x, y, txt, color, size) {
    floats.push({ x, y, txt, color: color || '#ffffff', size: size || 30, t: 0 });
    if (floats.length > 14) floats.shift();
  }
  function addBeam(x0, y0, x1, y1, color) { beams.push({ x0, y0, x1, y1, color: color || '#00e5ff', t: 0, dur: 0.28 }); }
  function burstFx(x, y, count, cols) {
    if (!reduced()) fx.burst(x, y, { count: count || 18, colors: cols || ['#00e5ff', '#ffd740', '#00e676', '#ffffff'], speed: 310, life: 0.7, size: 7, gravity: 340 });
  }

  const WARN_AR = {
    select_first: 'حدد آلياً أولاً!', clip_empty: 'استنسخ آلياً بـ Ctrl+C أولاً!',
    nothing_to_zap: 'لا يوجد فيروس على الخط!', nothing_undo: 'لا توجد خطوة للتراجع!',
    nothing_redo: 'لا توجد خطوة للإعادة!', pod_full: 'السفن جاهزة للإقلاع!',
    fill_ships_first: 'املأ السفن بالآليين أولاً!', no_bots: 'انتظر وصول الآليين!'
  };

  function drainEvents(w) {
    for (let i = 0; i < w.events.length; i++) {
      const ev = w.events[i];
      if (ev.type === 'cue') Kit.track.cue();
      else if (ev.type === 'select' || ev.type === 'focus_pod') J.tap();
      else if (ev.type === 'selectAll') { Kit.track.hit(); J.select(); addFloat(590, 300, 'تحديد شامل! ⚡', '#ffd740', 34); }
      else if (ev.type === 'copy') {
        Kit.track.hit(); J.select(); clonerPulse = 1;
        ev.ids.forEach(id => { const f = E.findItem(w, id); if (f) addBeam(f.x, f.y, E.CLONER.x, E.CLONER.y, '#00e5ff'); });
        burstFx(E.CLONER.x, E.CLONER.y, 14, ['#00e5ff', '#ffffff']);
        addFloat(E.CLONER.x - 20, E.CLONER.y - 95, 'تم الاستنساخ! ⚡', '#00e5ff', 28);
      } else if (ev.type === 'cut') {
        Kit.track.hit(); J.pop(0.6); clonerPulse = 1;
        ev.items.forEach(it => { addBeam(it.x, it.y, E.CLONER.x, E.CLONER.y, '#ffd740'); burstFx(it.x, it.y, 12, ['#ffd740', '#00e5ff']); });
        addFloat(E.CLONER.x - 20, E.CLONER.y - 95, 'نقل نفاث! ✂️', '#ffd740', 28);
      } else if (ev.type === 'paste') {
        Kit.track.hit(); J.pop(0.85); clonerPulse = 1;
        ev.items.forEach((it, idx) => {
          flyers.push({ kind: it.kind, x0: E.CLONER.x, y0: E.CLONER.y, x1: it.x, y1: it.y, t: -idx * 0.05, dur: 0.24 });
          addBeam(E.CLONER.x, E.CLONER.y, it.x, it.y, '#00e676');
        });
      } else if (ev.type === 'delete') {
        if (ev.viruses > 0) Kit.track.hit();
        J.impact(0.75); turretPulse = 1; if (!reduced()) shake.add(5);
        ev.items.forEach(it => {
          addBeam(E.TURRET.x + 36, E.TURRET.y - 10, it.x, it.y, '#ff1744');
          burstFx(it.x, it.y, 24, ['#ff1744', '#ffd740', '#ff9100', '#ffffff']);
        });
        if (ev.viruses > 0) { J.coin(1); addFloat(ev.items[0].x, ev.items[0].y - 36, 'تدمير الفيروس! 💥', '#ffd740', 30); }
      } else if (ev.type === 'undo' || ev.type === 'redo') {
        Kit.track.hit(); chronoWave = 1;
        if (ev.bonk) { J.impact(0.85); J.coin(2); if (!reduced()) shake.add(6); addFloat(640, 230, 'إرجاع الزمن وطرد المخرب! ⏪', '#00e676', 36); }
        else { J.select(); addFloat(640, 260, ev.type === 'undo' ? 'إرجاع الزمن ⏪' : 'تقديم الزمن ⏩', '#00e5ff', 32); }
      } else if (ev.type === 'pod_launch') {
        J.coin(Math.min(4, ev.combo)); if (ev.combo >= 2) J.streak(Math.min(10, ev.combo));
        const bx = w.boxes[ev.boxIndex];
        if (bx) { burstFx(bx.x, bx.y + 50, 28); addFloat(bx.x, bx.y - 40, 'انطلاق السفينة! 🚀', '#00e676', 32); }
      } else if (ev.type === 'mega_ready') { J.levelUp(); addFloat(640, 250, 'اضغط Ctrl + S للإقلاع الشامل! 🔥', '#ffd740', 36); }
      else if (ev.type === 'mega_launch') { Kit.track.hit(); J.levelUp(); if (!reduced()) shake.add(8); addFloat(640, 240, 'إقلاع الأسطول الكبير! 🚀🔥', '#ffd740', 42); }
      else if (ev.type === 'save_boost') { Kit.track.hit(); J.select(); addFloat(640, 280, 'شحنة طاقة إضافية! +20 ⚡', '#00e676', 30); }
      else if (ev.type === 'saboteur_warn') addFloat(920, 120, 'تنبيه! روبوت مخرب يقترب!', '#ff4081', 28);
      else if (ev.type === 'saboteur_strike') { J.error(); if (!reduced()) shake.add(5); addFloat(w.boxes[ev.boxIndex].x, 96, 'تخريب! اضغط Ctrl+Z فوراً!', '#ff4081', 30); }
      else if (ev.type === 'mistake' || ev.type === 'virus_leak') {
        Kit.track.miss(); J.error(); if (ev.boxIndex != null) podShake[ev.boxIndex] = 0.45;
        const msg = ev.reason === 'virus_copy' || ev.reason === 'virus_cut' ? 'هذا فيروس! دمره بزر Delete!'
          : ev.type === 'virus_leak' ? 'تسلل فيروس! استخدم Delete!' : 'اختر السفينة المطابقة للآلي!';
        addFloat(590, 260, msg, '#ff4081', 30);
      } else if (ev.type === 'warn') { J.tap(); if (WARN_AR[ev.reason]) addFloat(590, 280, WARN_AR[ev.reason], '#ffd740', 28); }
      else if (ev.type === 'win') { J.levelUp(); endingTimer = 0.9; }
      else if (ev.type === 'timeup') { J.error(); endingTimer = 0.9; }
    }
    w.events.length = 0;
  }

  function execAction(actionObj) {
    if (!world || screen !== 'play' || endingTimer > 0) return;
    if (document.activeElement !== canvas) { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    idleTime = 0;
    const t = actionObj.type || actionObj.t;
    if (t && E.SHORTCUTS[t]) dockPress[t] = 0.22;
    E.act(world, actionObj); drainEvents(world); dirty = true;
  }

  /* ---- Input Wiring ---- */
  function bindClick(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); Kit.audio.unlock(); el.blur(); fn(e); });
  }
  bindClick($('btnPlay'), () => startMission(0, { showDemo: true }));
  bindClick($('btnLevels'), () => { J.select(); openMap(); });
  bindClick($('btnRush'), () => startMission(12, { showDemo: false }));
  bindClick($('btnShop'), () => { J.select(); refreshShop(); setScreen('shop'); });
  bindClick($('mapHome'), () => { J.tap(); toTitle(); });
  bindClick($('mapRush'), () => startMission(12, { showDemo: false }));
  bindClick($('shopBack'), () => { J.tap(); toTitle(); });
  bindClick($('btnPause'), () => pauseGame(true));
  bindClick($('btnResume'), resumeGame);
  bindClick($('btnRestart'), restartMission);
  bindClick($('btnMenu'), quitToMap);
  bindClick($('resNext'), () => {
    if (!resultData) return;
    if (resultData.nextAction === 'next') startMission(currentLevel + 1, { showDemo: true });
    else if (resultData.nextAction === 'again') startMission(currentLevel, { showDemo: false });
    else openMap();
  });
  bindClick($('resAgain'), () => startMission(currentLevel, { showDemo: false }));
  bindClick($('resMap'), openMap);

  const CTRL_MAP = { KeyC: 'copy', KeyV: 'paste', KeyX: 'cut', KeyZ: 'undo', KeyY: 'redo', KeyA: 'selectAll', KeyS: 'saveShip' };
  Kit.keys.captureTab(() => screen === 'play');

  window.addEventListener('keydown', e => {
    held[e.code] = true; dirty = true;
    if (e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const mapped = CTRL_MAP[e.code];
      if (!mapped) return;
      e.preventDefault();
      if (screen === 'play' && !e.repeat) {
        if (demo) closeDemo();
        execAction({ type: e.code === 'KeyZ' && e.shiftKey ? 'redo' : mapped });
      }
      return;
    }
    if (screen !== 'play' || !Kit.isGameKeyEvent(e)) return;
    const c = e.code;
    if (demo && (c === 'Enter' || c === 'NumpadEnter' || c === 'Space')) { e.preventDefault(); closeDemo(); return; }
    if (c === 'Delete' || c === 'Backspace') { e.preventDefault(); if (!e.repeat) execAction({ type: 'delete' }); }
    else if (c === 'Tab' || c === 'Space') { e.preventDefault(); if (!e.repeat) execAction({ type: 'select', dir: e.shiftKey ? -1 : 1 }); }
    else if (c === 'ArrowLeft') { e.preventDefault(); execAction({ type: 'select', dir: 1, add: e.shiftKey }); }
    else if (c === 'ArrowRight') { e.preventDefault(); execAction({ type: 'select', dir: -1, add: e.shiftKey }); }
    else if ((c === 'Enter' || c === 'NumpadEnter') && world && world.megaReady) { e.preventDefault(); execAction({ type: 'saveShip' }); }
  });
  window.addEventListener('keyup', e => { held[e.code] = false; dirty = true; });
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || screen !== 'play') return;
    Kit.audio.unlock();
    try { canvas.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    const p = view.toLogical(e.clientX, e.clientY);
    if (demo) { closeDemo(); return; }
    if (world && world.megaReady && p.y >= 244 && p.y <= 300 && p.x >= 380 && p.x <= 860) { execAction({ type: 'saveShip' }); return; }
    for (let i = 0; i < dockRects.length; i++) {
      const r = dockRects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { execAction({ type: r.id }); return; }
    }
    execAction({ type: 'click', x: p.x, y: p.y, add: e.shiftKey });
  });

  function pollMenuKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) startMission(0, { showDemo: true }); }
    else if (screen === 'map' || screen === 'shop') { if (K.pressed('Escape')) { J.tap(); toTitle(); } }
    else if (screen === 'play') { if (K.anyPressed(['KeyP', 'Escape'])) pauseGame(true); }
    else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resumeGame();
      else if (K.pressed('KeyR')) restartMission();
    } else if (screen === 'result' && resultData) {
      if (go) $('resNext').click(); else if (K.pressed('KeyR')) restartMission();
    }
  }

  /* ---- Loop & Rendering ---- */
  function update(dt) {
    pollMenuKeys();
    if (screen === 'pause') { Kit.keys.endFrame(); return; }
    appTime += dt;
    if (screen === 'play' && world) {
      if (demo) { demo.t += dt; if (demo.t >= demo.dur) closeDemo(); }
      else if (endingTimer > 0) { endingTimer -= dt; if (endingTimer <= 0) finishMission(); }
      else { idleTime += dt; E.step(world, dt); drainEvents(world); }
    } else if (screen === 'result' && resultData) {
      const prev = resultT; resultT += dt;
      for (let i = 0; i < resultData.stars; i++) {
        const th = 0.22 + i * 0.28;
        if (prev < th && resultT >= th) {
          const starEl = $('resStars').children[i];
          if (starEl) { starEl.classList.add('on', 'pop'); J.star(i + 1); }
        }
      }
    }
    for (let i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t >= beams[i].dur) beams.splice(i, 1); }
    for (let i = flyers.length - 1; i >= 0; i--) { flyers[i].t += dt; if (flyers[i].t >= flyers[i].dur) flyers.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= dt * 36; if (floats[i].t >= 1.15) floats.splice(i, 1); }
    for (const k in podShake) { podShake[k] -= dt; if (podShake[k] <= 0) delete podShake[k]; }
    for (const k in dockPress) { dockPress[k] -= dt; if (dockPress[k] <= 0) delete dockPress[k]; }
    clonerPulse = Math.max(0, clonerPulse - dt * 3);
    turretPulse = Math.max(0, turretPulse - dt * 3.5);
    chronoWave = Math.max(0, chronoWave - dt * 2.2);
    fx.update(dt); shake.update(dt);
    if (fx.list.length > 240) fx.list.splice(0, fx.list.length - 240);
    dirty = true; Kit.keys.endFrame();
  }

  function drawKeycap(ctx, cx, cy, label, w, h, active, glowCol) {
    const dy = active ? 4 : 0;
    rr(ctx, cx - w / 2, cy - h / 2 + 6, w, h, 12); ctx.fillStyle = INK; ctx.fill();
    rr(ctx, cx - w / 2, cy - h / 2 + dy, w, h, 12);
    ctx.fillStyle = active ? '#ffd740' : (glowCol || '#ffffff'); ctx.fill(); strokeInk(ctx, 3.5, INK);
    drawTxt(ctx, label, cx, cy + dy + 1, Math.min(24, Math.round(h * 0.48)), INK, { stroke: false });
  }

  function isKeyDown(k) {
    if (k === 'Ctrl') return !!(held.ControlLeft || held.ControlRight || held.MetaLeft || held.MetaRight);
    if (k === 'Delete') return !!(held.Delete || held.Backspace);
    if (k === 'Space') return !!held.Space;
    return !!held['Key' + k];
  }

  function computeDockRects(w) {
    if (!w) return [];
    const list = w.def.dock, n = list.length, cardW = n <= 3 ? 292 : 256, gap = 18;
    const startX = (W - (n * cardW + (n - 1) * gap)) / 2, out = [];
    for (let i = 0; i < n; i++) out.push({ id: list[i], x: startX + (n - 1 - i) * (cardW + gap), y: 580, w: cardW, h: 118 });
    return out;
  }

  function drawDock(ctx, w, coach) {
    dockRects = computeDockRects(w);
    const still = reduced(), pulse = still ? 0.6 : (Math.sin(appTime * 6) + 1) * 0.5;
    for (let i = 0; i < dockRects.length; i++) {
      const r = dockRects[i], sc = E.SHORTCUTS[r.id];
      const isCoach = coach && coach.act === r.id, pressed = dockPress[r.id] > 0, py = pressed ? 4 : 0;
      rr(ctx, r.x, r.y + 6, r.w, r.h, 22); ctx.fillStyle = INK; ctx.fill();
      rr(ctx, r.x, r.y + py, r.w, r.h, 22);
      ctx.fillStyle = isCoach ? '#1b3882' : '#10204d'; ctx.fill();
      strokeInk(ctx, isCoach ? 5 : 4, isCoach ? '#ffd740' : '#00e5ff');
      if (isCoach && !still) {
        ctx.save(); ctx.globalAlpha = 0.25 + pulse * 0.35;
        rr(ctx, r.x - 4, r.y - 4 + py, r.w + 8, r.h + 8, 26); strokeInk(ctx, 4, '#ffd740'); ctx.restore();
      }
      const keys = sc.keys, cy = r.y + 42 + py;
      if (keys.length === 1) {
        drawKeycap(ctx, r.x + r.w / 2, cy, keys[0], keys[0].length > 3 ? 116 : 88, 46, pressed || isKeyDown(keys[0]), isCoach ? '#fff59d' : '#ffffff');
      } else {
        const cx = r.x + r.w / 2;
        drawKeycap(ctx, cx - 50, cy, keys[0], 82, 46, pressed || isKeyDown(keys[0]), isCoach ? '#fff59d' : '#e0f7fa');
        drawTxt(ctx, '+', cx + 4, cy, 28, '#00e5ff');
        drawKeycap(ctx, cx + 52, cy, keys[1], 56, 46, pressed || isKeyDown(keys[1]), isCoach ? '#fff59d' : '#ffffff');
      }
      drawTxt(ctx, sc.badge, r.x + r.w / 2, r.y + 94 + py, 23, isCoach ? '#ffd740' : '#ffffff');
    }
  }

  function drawFactoryBg(ctx, th, withDock) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, th.bg1); grad.addColorStop(0.68, th.bg2); grad.addColorStop(1, '#070d24');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)'; ctx.lineWidth = 2;
    for (let x = 80; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x, withDock ? 565 : H); ctx.stroke(); }
    for (let y = 140; y < (withDock ? 565 : H); y += 110) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    if (withDock) {
      // Glowing energy conduits linking Holo-Cloner to Launch Bay
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.22)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(1138, 265); ctx.lineTo(1138, 156); ctx.lineTo(280, 156); ctx.stroke();
      ctx.fillStyle = 'rgba(7, 13, 36, 0.92)'; ctx.fillRect(0, 566, W, 154);
      ctx.beginPath(); ctx.moveTo(0, 566); ctx.lineTo(W, 566);
      ctx.strokeStyle = th.glow; ctx.lineWidth = 3.5; ctx.stroke();
    }
  }

  function drawPlayScene(ctx, w) {
    const th = getThemeObj(save.theme), still = reduced(), coach = E.hint(w);
    drawFactoryBg(ctx, th, true);

    if (chronoWave > 0 && !still) {
      ctx.save(); ctx.globalAlpha = chronoWave * 0.45;
      ctx.beginPath(); ctx.arc(640, 360, (1 - chronoWave) * 580 + 40, 0, Math.PI * 2);
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 10; ctx.stroke(); ctx.restore();
    }

    // 1. Drop-Ship Launch Pods
    for (let i = 0; i < w.boxes.length; i++) {
      const bx = w.boxes[i];
      const dx = podShake[i] > 0 && !still ? Math.sin(podShake[i] * 45) * 9 : 0;
      const dy = bx.launched && bx.launchT > 0 ? -Math.pow(1 - bx.launchT / 0.85, 2) * 280 : 0;
      ctx.save(); ctx.translate(bx.x + dx, bx.y + dy);
      if (w.activeBox === i && !bx.launched) { rr(ctx, -118, -74, 236, 158, 30); strokeInk(ctx, 4, '#ffd740'); }
      ctx.drawImage(podSprite(bx.kind), -130, -88, 260, 176);
      if (bx.launched) {
        ctx.fillStyle = '#ff9100'; gFlame(ctx, -44, 72); gFlame(ctx, 44, 72);
      }
      const validCount = bx.items.filter(it => it.kind === bx.kind && !it.glitched && !it.virus).length;
      drawTxt(ctx, (E.BOTS[bx.kind] || E.BOTS.laser).name + '  ' + validCount + '/' + bx.target, 0, -49, 19, '#ffffff');
      ctx.restore();

      // Empty docking slot rings inside bay
      for (let s = 0; s < bx.target; s++) {
        const sp = E.podSlot(bx, s, bx.target);
        ctx.beginPath(); ctx.arc(sp.x + dx, sp.y + dy, 22, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)'; ctx.lineWidth = 2.5; ctx.stroke();
      }
      for (let j = 0; j < bx.items.length; j++) {
        const it = bx.items[j], px = it.x + dx, py = it.y + dy;
        if (w.sel.indexOf(it.id) >= 0) {
          ctx.beginPath(); ctx.arc(px, py, 32, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 215, 64, 0.32)'; ctx.fill(); strokeInk(ctx, 3.5, '#ffd740');
        }
        ctx.drawImage(it.virus ? virusSprite() : botSprite(it.kind, save.armor), px - 34, py - 36, 68, 68);
        if (it.glitched) drawTxt(ctx, '⚡ خلل!', px, py - 24, 17, '#ff1744');
        else if (it.kind !== bx.kind) drawTxt(ctx, 'نقل Ctrl+X', px, py + 32, 15, '#ffd740');
      }
    }

    if (w.megaReady) {
      rr(ctx, 380, 246, 480, 50, 25); ctx.fillStyle = '#00e676'; ctx.fill(); strokeInk(ctx, 4.5, INK);
      drawTxt(ctx, 'الأسطول جاهز! اضغط Ctrl + S للإقلاع الشامل 🔥', 620, 271, 22, INK, { stroke: false });
    }

    // 2. Conveyor Belts & Cyber-Bots
    const bSpr = beltSprite(save.theme);
    for (let bi = 0; bi < w.belts.length; bi++) {
      const b = w.belts[bi];
      ctx.drawImage(bSpr, 180, b.y + 10, 830, 56);
      ctx.save(); rr(ctx, 196, b.y + 18, 798, 34, 14); ctx.clip();
      const shift = still ? 0 : ((w.offset % 48) + 48) % 48;
      ctx.fillStyle = 'rgba(0, 229, 255, 0.28)';
      for (let x = 196 - shift; x < 1020; x += 48) {
        ctx.beginPath(); ctx.moveTo(x + 18, b.y + 22); ctx.lineTo(x + 6, b.y + 35); ctx.lineTo(x + 18, b.y + 48);
        ctx.lineTo(x + 28, b.y + 48); ctx.lineTo(x + 16, b.y + 35); ctx.lineTo(x + 28, b.y + 22); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      rr(ctx, 976, b.y - 24, 34, 88, 12); ctx.fillStyle = '#1b3275'; ctx.fill(); strokeInk(ctx, 4, th.glow);
      rr(ctx, 180, b.y - 24, 34, 88, 12); ctx.fillStyle = '#1b3275'; ctx.fill(); strokeInk(ctx, 4, '#ff4081');

      for (let j = 0; j < b.items.length; j++) {
        const it = b.items[j];
        if (!E.isVisible(it.x)) continue;
        const isSel = w.sel.indexOf(it.id) >= 0;
        const isCoachBot = coach && coach.targetId === it.id && (w.def.tier === 0 || idleTime > 2.2);
        const by = b.y - 18 + (still ? 0 : Math.sin(appTime * 5 + it.id) * 3);
        if (isCoachBot && !isSel) {
          ctx.save(); ctx.setLineDash([10, 7]); ctx.beginPath(); ctx.arc(it.x, by, 48, 0, Math.PI * 2);
          strokeInk(ctx, 4, '#00e5ff'); ctx.restore();
        }
        if (isSel) {
          ctx.beginPath(); ctx.arc(it.x, by, 48, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 215, 64, 0.28)'; ctx.fill(); strokeInk(ctx, 4.5, '#ffd740');
        }
        ctx.drawImage(it.virus ? virusSprite() : botSprite(it.kind, save.armor), it.x - 50, by - 50, 100, 100);
      }
    }

    // 3. Laser Blaster Turret & Holo-Cloner Chamber
    ctx.save(); ctx.translate(E.TURRET.x, E.TURRET.y); ctx.scale(1 + turretPulse * 0.1, 1 + turretPulse * 0.1);
    ctx.drawImage(turretSprite(), -78, -90, 156, 180);
    drawTxt(ctx, 'مدفع الليزر', 0, 102, 20, '#ff4081'); ctx.restore();

    ctx.save(); ctx.translate(E.CLONER.x, E.CLONER.y); ctx.scale(1 + clonerPulse * 0.08, 1 + clonerPulse * 0.08);
    ctx.drawImage(clonerSprite(), -98, -125, 196, 250);
    if (w.clip && w.clip.items.length) {
      const hover = still ? 0 : Math.sin(appTime * 5) * 5;
      ctx.drawImage(botSprite(w.clip.items[0].kind, save.armor), -44, -44 + hover, 88, 88);
      if (w.clip.items.length > 1) drawTxt(ctx, '×' + w.clip.items.length, 38, -36, 24, '#ffd740');
      drawTxt(ctx, w.clip.cut ? 'نقل جاهز!' : 'نسخة جاهزة!', 0, 134, 20, '#00e676');
    } else {
      drawTxt(ctx, 'Ctrl + C', 0, 0, 22, 'rgba(0, 229, 255, 0.55)', { stroke: false });
      drawTxt(ctx, 'غرفة الاستنساخ', 0, 134, 20, '#00e5ff');
    }
    ctx.restore();

    if (w.saboteur.state !== 'away') {
      const sx = w.saboteur.x, sy = w.saboteur.y + (still ? 0 : Math.sin(appTime * 7) * 6);
      ctx.drawImage(saboteurSprite(), sx - 48, sy - 44, 96, 88);
      drawTxt(ctx, w.saboteur.state === 'warn' ? 'مخرب قادم!' : 'اضغط Ctrl+Z!', sx, sy - 52, 20, '#ff4081');
    }

    // 4. Beams & Flyers
    for (let i = 0; i < beams.length; i++) {
      const bm = beams[i];
      ctx.save(); ctx.globalAlpha = 1 - bm.t / bm.dur; ctx.lineCap = 'round';
      ctx.strokeStyle = bm.color; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0); ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    }
    for (let i = 0; i < flyers.length; i++) {
      const fl = flyers[i]; if (fl.t < 0) continue;
      const k = Math.min(1, fl.t / fl.dur);
      ctx.drawImage(botSprite(fl.kind, save.armor), fl.x0 + (fl.x1 - fl.x0) * k - 40, fl.y0 + (fl.y1 - fl.y0) * k - Math.sin(k * Math.PI) * 90 - 40, 80, 80);
    }

    // 5. Top HUD & Bottom Keycap Dock
    rr(ctx, 82, 10, 356, 48, 24); ctx.fillStyle = 'rgba(11, 19, 48, 0.9)'; ctx.fill(); strokeInk(ctx, 3.5, th.glow);
    drawTxt(ctx, w.def.endless ? 'التحدي اللانهائي' : 'مهمة ' + (w.index + 1) + ' · ' + w.def.title, 260, 34, 21, '#ffffff');

    rr(ctx, 452, 10, 340, 48, 24); ctx.fillStyle = 'rgba(11, 19, 48, 0.9)'; ctx.fill(); strokeInk(ctx, 3.5, '#00e676');
    drawTxt(ctx, (w.def.endless ? 'السفن: ' + w.launchedCount : 'السفن: ' + w.launchedCount + '/' + w.totalPods) + '  |  النقاط: ' + w.score, 622, 34, 21, '#ffd740');

    if (w.timeLimit > 0) {
      const secs = Math.ceil(w.timeLeft), low = secs <= 15;
      rr(ctx, 806, 10, 152, 48, 24); ctx.fillStyle = low ? '#b71c1c' : 'rgba(11, 19, 48, 0.9)'; ctx.fill();
      strokeInk(ctx, 3.5, low ? '#ffd740' : '#00e5ff'); drawTxt(ctx, 'الوقت ' + secs, 882, 34, 22, '#ffffff');
    }
    rr(ctx, 972, 10, 196, 48, 24); ctx.fillStyle = 'rgba(11, 19, 48, 0.9)'; ctx.fill(); strokeInk(ctx, 3.5, '#ffd740');
    drawTxt(ctx, 'العملات ' + save.coins, 1070, 34, 21, '#ffd740');

    drawDock(ctx, w, coach);
    fx.draw(ctx);
    for (let i = 0; i < floats.length; i++) {
      const fl = floats[i];
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, fl.t - 0.65) / 0.5);
      drawTxt(ctx, fl.txt, fl.x, fl.y, fl.size, fl.color); ctx.restore();
    }

    if (demo) {
      ctx.fillStyle = 'rgba(6, 12, 32, 0.68)'; ctx.fillRect(0, 0, W, H);
      rr(ctx, 350, 165, 580, 330, 32); ctx.fillStyle = '#13255c'; ctx.fill(); strokeInk(ctx, 6, '#00e5ff');
      const sc = E.SHORTCUTS[demo.acts[0]] || E.SHORTCUTS.copy, keys = sc.keys;
      drawTxt(ctx, 'قوة جديدة: ' + sc.name, 640, 224, 36, '#ffd740');
      if (keys.length === 1) drawKeycap(ctx, 640, 322, keys[0], 150, 74, demo.t > 0.35, '#00e5ff');
      else {
        drawKeycap(ctx, 560, 322, keys[0], 130, 74, demo.t > 0.25, '#ffd740');
        drawTxt(ctx, '+', 648, 322, 46, '#ffffff');
        drawKeycap(ctx, 728, 322, keys[1], 96, 74, demo.t > 0.45, '#00e5ff');
      }
      drawTxt(ctx, 'اضغط Enter أو انقر للانطلاق!', 640, 434, 24, '#b0e5ff');
    }
  }

  function gFlame(ctx, x, y) {
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x, y + 48); ctx.lineTo(x + 14, y); ctx.closePath(); ctx.fill();
  }

  function drawTitleBackdrop(ctx) {
    const th = getThemeObj(save.theme), still = reduced();
    drawFactoryBg(ctx, th, false);
    if (screen !== 'title') { ctx.fillStyle = 'rgba(6, 12, 32, 0.52)'; ctx.fillRect(0, 0, W, H); return; }
    ctx.drawImage(beltSprite(save.theme), 36, 616, 810, 56);
    const shift = still ? 0 : appTime * 68;
    for (let i = 0; i < 5; i++) {
      const kind = E.BOT_KINDS[i % E.BOT_KINDS.length];
      const x = 800 - (((i * 165 + shift) % 760) + 760) % 760;
      ctx.drawImage(botSprite(kind, save.armor), x - 48, 544 + (still ? 0 : Math.sin(appTime * 5 + i) * 4), 96, 96);
    }
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save(); ctx.translate(shake.x, shake.y);
    if ((screen === 'play' || screen === 'pause' || screen === 'result') && world) drawPlayScene(ctx, world);
    else drawTitleBackdrop(ctx);
    ctx.restore();
  }

  /* ---- Scenario & Debug Hook ---- */
  function toClientPoint(lx, ly) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + lx * view.scale, y: r.top + ly * view.scale };
  }
  const round1 = v => Math.round(v * 10) / 10;

  window.__game = {
    get state() {
      const w = world;
      return {
        screen, paused: screen === 'pause', level: currentLevel,
        id: w ? w.id : '', phase: w ? w.phase : '', demo: !!demo,
        time: w ? Math.round(w.time * 1000) / 1000 : 0,
        timeLimit: w ? w.timeLimit : 0, timeLeft: w ? round1(w.timeLeft) : 0,
        offset: w ? round1(w.offset) : 0, speed: w ? w.speed : 0,
        tier: dda.tier, score: w ? w.score : 0,
        sel: w ? w.sel.slice() : [],
        clip: w && w.clip ? { cut: w.clip.cut, kinds: w.clip.items.map(i => i.kind) } : null,
        undo: w ? w.undo.length : 0, redo: w ? w.redo.length : 0,
        megaReady: !!(w && w.megaReady),
        saboteur: w ? w.saboteur.state : '', bonks: w ? w.bonks : 0,
        launchedCount: w ? w.launchedCount : 0, totalPods: w ? w.totalPods : 0,
        particles: fx.list.length, shake: shake.power,
        focus: document.activeElement === canvas,
        scrollX: window.scrollX, scrollY: window.scrollY,
        belts: w ? w.belts.map(b => ({
          i: b.i,
          items: b.items.map(it => ({
            id: it.id, k: it.kind, kind: it.kind, b: !!it.virus, virus: !!it.virus,
            x: round1(it.x), y: round1(b.y - 18), visible: E.isVisible(it.x)
          }))
        })) : [],
        boxes: w ? w.boxes.map(bx => ({
          i: bx.i, kind: bx.kind, target: bx.target,
          items: bx.items.map(it => ({
            id: it.id, k: it.kind, kind: it.kind, glitched: !!it.glitched, virus: !!it.virus,
            x: round1(it.x), y: round1(it.y), visible: true
          })),
          ready: E.isPodReady(bx), launched: !!bx.launched
        })) : [],
        result: resultData && screen === 'result' ? { win: resultData.win, stars: resultData.stars, coins: resultData.coins, best: resultData.best } : null,
        coins: save.coins
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get hint() { return world ? E.hint(world) : null; },
    point: toClientPoint,
    toyPoint: id => {
      if (!world) return null;
      const f = E.findItem(world, id);
      return f ? toClientPoint(f.x, f.where === 'belt' ? f.y - 18 : f.y) : null;
    },
    boxPoint: idx => (world && world.boxes[idx] ? toClientPoint(world.boxes[idx].x, world.boxes[idx].y) : null),
    dockPoint: id => {
      const rects = dockRects.length ? dockRects : computeDockRects(world);
      const r = rects.find(d => d.id === id);
      return r ? toClientPoint(r.x + r.w / 2, r.y + r.h / 2) : null;
    }
  };

  buildMap(); buildShop();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pauseGame(false), reset: () => { for (const k in held) held[k] = false; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();

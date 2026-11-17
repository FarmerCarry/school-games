/* سلة الفواكه (Juicy Drop: Turbo Monster-Fruit Blaster) — Canvas Art, Juice SFX, HUD & Shop */
(function () {
  'use strict';

  const E = window.JDEngine, J = Kit.juice, W = E.W, H = E.H, TAU = Math.PI * 2, INK = '#1b1640';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  const clamp = Kit.clamp;

  Kit.art.init({ canvas: canvas, mode: '2d', theme: 'day' });

  let dirty = true;
  const view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: v => {
      ui.style.left = canvas.style.left;
      ui.style.top = canvas.style.top;
      ui.style.transform = 'scale(' + v.scale + ')';
      dirty = true;
    }
  });

  const fx = Kit.particles(), camShake = Kit.shake();
  const store = Kit.store('juicy-drop');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = E.loadSave(store.get('save', null));
  const dda = Kit.dda('juicy-drop', { id: 'main', start: 0.35 });

  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  function sfx(kind, a, b) {
    if (!J) return;
    if (typeof J[kind] === 'function') J[kind](a, b);
    else if (typeof J.pop === 'function') J.pop(0.4);
  }

  /* ---------------------------------------- Bounded Static Sprite Baking */
  const FRUIT_KEYS = E.FRUITS.map((_, i) => 'mf_' + i);
  const FRUIT_BLINK_KEYS = E.FRUITS.map((_, i) => 'mf_' + i + '_b');
  const RAINBOW_KEY = 'pf_rainbow', RAINBOW_BLINK_KEY = 'pf_rainbow_b';
  const CRATE_KEYS = { wood1: 'cr_wood_1', ice2: 'cr_ice_2', ice1: 'cr_ice_1' };
  const DROPPER_KEYS = ['dr_0', 'dr_1', 'dr_2', 'dr_3'];
  const BLINKS = Array.from({ length: 24 }, (_, i) => ({ t: 1.1 + (i % 7) * 0.45, on: false, active: false }));

  function stepBlinks(dt) {
    if (calm() || !Kit.art || typeof Kit.art.blink !== 'function') return;
    for (let i = 0; i < BLINKS.length; i++) {
      const b = BLINKS[i], r = Kit.art.blink(b, dt);
      b.active = typeof r === 'boolean' ? r : (typeof r === 'number' ? r > 0.45 : !!b.on);
    }
  }

  const blinkNow = seed => !calm() && !!BLINKS[((seed | 0) & 0x7fffffff) % BLINKS.length].active;

  function drawSpr(ctx, spr, x, y, w, h) {
    if (!spr) return;
    const img = spr.canvas || spr.el || spr.image || spr.img || spr.bitmap || spr;
    if (img && typeof img.width === 'number') ctx.drawImage(img, x, y, w, h);
    else if (typeof spr.draw === 'function') spr.draw(ctx, x + w / 2, y + h / 2, w, h);
  }

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function drawText(g, str, x, y, size, fill, opts) {
    opts = opts || {};
    const s = String(str);
    g.font = '700 ' + size + 'px Fredoka';
    g.textAlign = opts.align || 'center';
    g.textBaseline = opts.base || 'middle';
    g.direction = opts.dir || 'rtl';
    if (opts.stroke !== false) {
      g.lineJoin = 'round'; g.lineWidth = opts.lw || Math.max(4, size * 0.22);
      g.strokeStyle = opts.strokeColor || INK; g.strokeText(s, x, y);
    }
    g.fillStyle = fill || '#ffffff';
    g.fillText(s, x, y);
  }

  function drawFace(g, cx, cy, r, blink, tier) {
    const ex = r * 0.31, ey = cy - r * 0.06, er = Math.max(4, r * 0.2);
    for (let side = -1; side <= 1; side += 2) {
      const x = cx + side * ex, rad = (tier === 2 && side === 1) ? er * 1.22 : er;
      if (blink) {
        g.beginPath(); g.moveTo(x - rad, ey); g.quadraticCurveTo(x, ey + rad * 0.45, x + rad, ey);
        g.lineWidth = Math.max(2.5, r * 0.09); g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
      } else {
        g.beginPath(); g.arc(x, ey, rad, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
        g.lineWidth = Math.max(2, r * 0.075); g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.arc(x + side * rad * 0.14, ey + rad * 0.06, rad * 0.56, 0, TAU); g.fillStyle = INK; g.fill();
        g.beginPath(); g.arc(x - rad * 0.22, ey - rad * 0.26, Math.max(1.5, rad * 0.26), 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      }
      if (tier >= 4) {
        g.beginPath();
        g.moveTo(x - rad * 1.05, ey - rad * (side < 0 ? 1.25 : 0.95));
        g.lineTo(x + rad * 1.05, ey - rad * (side < 0 ? 0.95 : 1.25));
        g.lineWidth = Math.max(2.8, r * 0.1); g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
      }
    }
    const my = cy + r * 0.28, mw = r * 0.36;
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (tier === 0 || tier === 3) {
      g.beginPath(); g.arc(cx, my - r * 0.06, mw * 0.78, 0.15 * Math.PI, 0.85 * Math.PI);
      g.lineWidth = Math.max(2.6, r * 0.09); g.strokeStyle = INK; g.stroke();
    } else {
      g.beginPath(); g.moveTo(cx - mw, my - r * 0.04); g.quadraticCurveTo(cx, my + r * 0.36, cx + mw, my - r * 0.04);
      g.closePath(); g.fillStyle = INK; g.fill();
      g.beginPath(); g.arc(cx, my + r * 0.12, mw * 0.45, 0, Math.PI); g.fillStyle = '#ff5c8a'; g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(cx - mw * 0.55, my - r * 0.02); g.lineTo(cx - mw * 0.28, my + r * 0.1); g.lineTo(cx - mw * 0.05, my - r * 0.02); g.closePath(); g.fill();
      if (tier >= 6) {
        g.beginPath(); g.moveTo(cx + mw * 0.08, my - r * 0.02); g.lineTo(cx + mw * 0.32, my + r * 0.1); g.lineTo(cx + mw * 0.56, my - r * 0.02); g.closePath(); g.fill();
      }
    }
  }

  function getFruitSprite(tier, blink) {
    const key = blink ? FRUIT_BLINK_KEYS[tier] : FRUIT_KEYS[tier];
    const spec = E.FRUITS[tier], br = Math.max(42, spec.r), sz = Math.ceil(br * 2.55);
    const spr = Kit.art.sprite(key, sz, sz, g => {
      const cx = sz / 2, cy = sz / 2 + br * 0.06;
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (tier === 1) {
        g.beginPath(); g.moveTo(cx, cy - br * 0.88); g.lineTo(cx + br * 0.22, cy - br * 1.18);
        g.lineTo(cx + br * 0.04, cy - br * 1.18); g.lineTo(cx + br * 0.28, cy - br * 1.44);
        g.lineWidth = Math.max(4, br * 0.11); g.strokeStyle = '#ffe033'; g.stroke();
      } else if (tier === 2) {
        for (let k = -2; k <= 2; k++) {
          const a = -Math.PI / 2 + k * 0.34;
          g.beginPath();
          g.moveTo(cx + Math.cos(a - 0.16) * br * 0.88, cy + Math.sin(a - 0.16) * br * 0.88);
          g.lineTo(cx + Math.cos(a) * br * 1.24, cy + Math.sin(a) * br * 1.24);
          g.lineTo(cx + Math.cos(a + 0.16) * br * 0.88, cy + Math.sin(a + 0.16) * br * 0.88);
          g.closePath(); g.fillStyle = '#dce775'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
        }
      } else if (tier === 5 || tier === 4) {
        g.beginPath(); g.ellipse(cx + br * 0.18, cy - br * 1.02, br * 0.26, br * 0.13, 0.35, 0, TAU);
        g.fillStyle = '#4ade80'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      } else if (tier === 6 || tier === 8 || tier === 9) {
        g.beginPath();
        g.moveTo(cx - br * 0.34, cy - br * 0.84); g.lineTo(cx - br * 0.24, cy - br * 1.22);
        g.lineTo(cx - br * 0.08, cy - br * 0.96); g.lineTo(cx, cy - br * 1.3);
        g.lineTo(cx + br * 0.08, cy - br * 0.96); g.lineTo(cx + br * 0.24, cy - br * 1.22);
        g.lineTo(cx + br * 0.34, cy - br * 0.84);
        g.closePath(); g.fillStyle = tier === 8 ? '#00e5ff' : '#ffd23f'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      }

      const grad = g.createRadialGradient(cx - br * 0.32, cy - br * 0.35, br * 0.1, cx, cy, br);
      grad.addColorStop(0, spec.glow); grad.addColorStop(0.5, spec.color); grad.addColorStop(1, spec.shade);
      g.beginPath(); g.arc(cx, cy, br, 0, TAU); g.fillStyle = grad; g.fill();

      g.save();
      g.beginPath(); g.arc(cx, cy, br - 2, 0, TAU); g.clip();
      if (tier === 0 || tier === 4 || tier === 7) {
        g.fillStyle = spec.accent; g.fillRect(cx - br, cy - br * 0.56, br * 2, br * 0.24);
        g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(cx - br, cy - br * 0.56, br * 2, br * 0.24);
      } else if (tier === 8) {
        g.strokeStyle = 'rgba(230,81,0,0.38)'; g.lineWidth = 4;
        for (let d = -br * 1.5; d < br * 1.5; d += br * 0.42) {
          g.beginPath(); g.moveTo(cx + d, cy - br); g.lineTo(cx + d + br, cy + br);
          g.moveTo(cx + d + br, cy - br); g.lineTo(cx + d, cy + br); g.stroke();
        }
      } else if (tier === 9) {
        g.strokeStyle = '#114b2b'; g.lineWidth = br * 0.12;
        for (const ox of [-0.58, -0.2, 0.2, 0.58]) {
          g.beginPath(); g.moveTo(cx + br * ox, cy - br); g.quadraticCurveTo(cx + br * ox * 1.25, cy, cx + br * ox, cy + br); g.stroke();
        }
      }
      g.restore();

      g.beginPath(); g.arc(cx, cy, br, 0, TAU); g.lineWidth = Math.max(5, br * 0.11); g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.ellipse(cx - br * 0.36, cy - br * 0.4, br * 0.22, br * 0.11, -0.6, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.72)'; g.fill();
      drawFace(g, cx, cy, br, blink, tier);
    });
    return { spr: spr, sz: sz, br: br };
  }

  function getRainbowSprite(blink) {
    const key = blink ? RAINBOW_BLINK_KEY : RAINBOW_KEY, sz = 96, br = 36;
    const spr = Kit.art.sprite(key, sz, sz, g => {
      const cx = 48, cy = 48, cols = ['#ff3d6e', '#ff8f1f', '#ffe033', '#2ecc71', '#38bdf8', '#a855f7'];
      for (let i = 0; i < 6; i++) {
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, br, (i * TAU) / 6, ((i + 1) * TAU) / 6);
        g.closePath(); g.fillStyle = cols[i]; g.fill();
      }
      g.beginPath(); g.arc(cx, cy, br, 0, TAU); g.lineWidth = 5.5; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(cx, cy, br * 0.72, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill();
      drawFace(g, cx, cy, br, blink, 3);
    });
    return { spr: spr, sz: sz, br: br };
  }

  function getCrateSprite(kind, hp) {
    const key = kind === 'ice' ? (hp >= 2 ? CRATE_KEYS.ice2 : CRATE_KEYS.ice1) : CRATE_KEYS.wood1;
    return Kit.art.sprite(key, 84, 84, g => {
      rr(g, 8, 8, 68, 68, 16); g.fillStyle = kind === 'ice' ? '#38bdf8' : '#d97706'; g.fill();
      g.lineWidth = 5.5; g.strokeStyle = INK; g.stroke();
      rr(g, 16, 16, 52, 52, 10); g.fillStyle = kind === 'ice' ? '#bae6fd' : '#f59e0b'; g.fill();
      g.strokeStyle = kind === 'ice' ? '#0284c7' : '#92400e'; g.lineWidth = 5;
      g.beginPath();
      if (kind === 'ice' && hp === 1) { g.moveTo(20, 22); g.lineTo(42, 40); g.lineTo(34, 58); g.lineTo(62, 64); }
      else { g.moveTo(20, 20); g.lineTo(64, 64); g.moveTo(64, 20); g.lineTo(20, 64); }
      g.stroke();
      for (const [bx, by] of [[18, 18], [66, 18], [18, 66], [66, 66]]) {
        g.beginPath(); g.arc(bx, by, 4, 0, TAU); g.fillStyle = INK; g.fill();
      }
    });
  }

  function getDropperSprite(idx) {
    const key = DROPPER_KEYS[clamp(idx | 0, 0, 3)];
    return Kit.art.sprite(key, 128, 92, g => {
      const cx = 64, cy = 44;
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (idx === 1) {
        g.fillStyle = '#38bdf8'; g.strokeStyle = INK; g.lineWidth = 5;
        for (const [ox, oy, r] of [[-24, 6, 18], [24, 6, 18], [-10, -4, 20], [12, -4, 20], [0, 0, 22]]) {
          g.beginPath(); g.arc(cx + ox, cy + oy, r, 0, TAU); g.fill(); g.stroke();
        }
        for (const [ox, oy, r] of [[-24, 6, 15], [24, 6, 15], [-10, -4, 17], [12, -4, 17], [0, 0, 19]]) {
          g.beginPath(); g.arc(cx + ox, cy + oy, r, 0, TAU); g.fillStyle = '#e0f2fe'; g.fill();
        }
        g.beginPath(); g.moveTo(cx + 2, cy - 16); g.lineTo(cx - 8, cy + 2); g.lineTo(cx + 2, cy + 2); g.lineTo(cx - 4, cy + 16);
        g.strokeStyle = '#ffe033'; g.lineWidth = 4.5; g.stroke();
      } else if (idx === 2) {
        g.beginPath(); g.arc(cx, cy - 6, 22, Math.PI, 0); g.fillStyle = '#7dd3fc'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.ellipse(cx, cy + 4, 46, 14, 0, 0, TAU); g.fillStyle = '#a855f7'; g.fill(); g.stroke();
        for (const ox of [-26, 0, 26]) { g.beginPath(); g.arc(cx + ox, cy + 4, 5, 0, TAU); g.fillStyle = '#ffe033'; g.fill(); }
      } else if (idx === 3) {
        rr(g, cx - 22, cy - 22, 44, 46, 14); g.fillStyle = '#ff3d6e'; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
        rr(g, cx - 28, cy + 12, 56, 14, 7); g.fillStyle = '#ffe033'; g.fill(); g.stroke();
      } else {
        g.strokeStyle = '#94a3b8'; g.lineWidth = 8;
        g.beginPath(); g.moveTo(cx - 26, cy + 26); g.quadraticCurveTo(cx - 34, cy + 2, cx - 14, cy - 6); g.stroke();
        g.beginPath(); g.moveTo(cx + 26, cy + 26); g.quadraticCurveTo(cx + 34, cy + 2, cx + 14, cy - 6); g.stroke();
        rr(g, cx - 26, cy - 24, 52, 28, 12); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.arc(cx - 9, cy - 10, 4.5, 0, TAU); g.arc(cx + 9, cy - 10, 4.5, 0, TAU); g.fillStyle = '#38bdf8'; g.fill();
      }
    });
  }

  function drawMonsterFruit(ctx, tier, power, x, y, r, rot, sq, blink) {
    const info = power === 'rainbow' ? getRainbowSprite(blink) : getFruitSprite(tier, blink);
    const d = info.sz * (r / info.br);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (sq) ctx.scale(1 - sq * 0.65, 1 + sq);
    drawSpr(ctx, info.spr, -d / 2, -d / 2, d, d);
    ctx.restore();
  }

  /* ------------------------------------------------ Game State & Screens */
  let screen = 'title', shopOpen = false, curMode = 'classic', curDiff = 'mid';
  let world = null, roundOpen = false, menuTime = 0;
  let aimX = null, dropQueued = false, gadgetQueued = '', rings = [], floats = [], lastHudSig = '';

  function syncVisibility() {
    $('scrTitle').hidden = !(screen === 'title' && !shopOpen);
    $('scrShop').hidden = !shopOpen;
    $('scrPause').hidden = screen !== 'pause';
    $('scrEnd').hidden = !(screen === 'win' || screen === 'over');
    $('hud').hidden = screen !== 'play';
    dirty = true;
    if (screen === 'play') { try { canvas.focus({ preventScroll: true }); } catch (_) {} }
  }

  const say = msg => { $('live').textContent = msg; };
  function wiggle(el) {
    el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle');
    setTimeout(() => el.classList.remove('wiggle'), 380);
  }

  function refreshTitleUI() {
    $('titleCoins').querySelector('b').textContent = String(save.coins);
    $('titleBest').querySelector('b').textContent = String(save.best[curMode] || 0);
    document.querySelectorAll('.mode-card').forEach(b => b.classList.toggle('active', b.dataset.mode === curMode));
    document.querySelectorAll('.diff-pill').forEach(b => b.classList.toggle('active', b.dataset.diff === curDiff));
  }

  function closeOpenRound() {
    if (roundOpen && world) { Kit.stats.end('quit', world.score); roundOpen = false; }
  }

  function goTitle() {
    closeOpenRound(); shopOpen = false; screen = 'title'; refreshTitleUI(); syncVisibility();
  }

  function startRound(modeId, diffId) {
    closeOpenRound();
    if (modeId) curMode = modeId;
    if (diffId) curDiff = diffId;
    const seed = ((Date.now() & 0x7fffffff) ^ 0x5a3c91) >>> 0;
    world = E.create({ mode: curMode, diff: curDiff, dda: dda.value(0, 1), seed: seed || 2026 });
    roundOpen = true; shopOpen = false;
    aimX = null; dropQueued = false; gadgetQueued = '';
    rings = []; floats = []; lastHudSig = '';
    fx.clear(); Kit.keys.reset();

    const roundId = curMode + '_' + curDiff;
    Kit.stats.round(roundId);
    screen = 'play';
    syncGadgetHud(); syncVisibility();
    sfx('pop', 0.5); say(E.MODES[curMode].name);
  }

  function pauseGame(byUser) {
    if (screen !== 'play') return;
    aimX = null; dropQueued = false; gadgetQueued = '';
    screen = 'pause'; syncVisibility();
    if (byUser) sfx('tap');
  }

  function resumeGame() {
    if (screen !== 'pause') return;
    Kit.keys.reset(); screen = 'play'; syncVisibility(); sfx('pop', 0.45);
  }

  function restartGame() { sfx('pop', 0.5); startRound(curMode, curDiff); }

  function triggerGadget(kind, btnEl) {
    if (screen !== 'play' || !world || world.done) return;
    if (world.gadgets[kind] <= 0 || (kind === 'bomb' && !world.fruits.length && !world.crates.length)) {
      sfx('fail'); if (btnEl) wiggle(btnEl); return;
    }
    gadgetQueued = kind;
  }

  function syncGadgetHud() {
    if (!world) return;
    const sig = world.gadgets.bomb + ':' + world.gadgets.shake + ':' + world.gadgets.swap;
    if (sig === lastHudSig) return;
    lastHudSig = sig;
    $('cntBomb').textContent = String(world.gadgets.bomb);
    $('cntShake').textContent = String(world.gadgets.shake);
    $('cntSwap').textContent = String(world.gadgets.swap);
    $('btnBomb').classList.toggle('empty', world.gadgets.bomb <= 0);
    $('btnShake').classList.toggle('empty', world.gadgets.shake <= 0);
    $('btnSwap').classList.toggle('empty', world.gadgets.swap <= 0);
  }

  function finishRound(won) {
    if (!world) return;
    const coins = E.roundReward(world);
    const isBest = world.score > (save.best[world.mode] || 0) && world.score > 0;
    if (isBest) save.best[world.mode] = world.score;
    if (won && world.stars > (save.stars[world.mode] || 0)) save.stars[world.mode] = world.stars;
    if (coins > 0) save.coins += coins;
    if (isBest || coins > 0 || won) persist();

    if (roundOpen) {
      const endTag = won ? 'win' : (world.mode === 'classic' ? 'end' : 'lose');
      Kit.stats.end(endTag, world.score);
      dda.result(won ? 1 : (world.mode === 'classic' && world.score >= 350 ? 0.65 : 0.2));
      roundOpen = false;
    }

    if (won) {
      sfx('levelUp');
      for (let i = 0; i < Math.max(1, world.stars); i++) sfx('star', i + 1);
      if (coins > 0) sfx('coin', Math.min(4, coins));
    } else { sfx('fail'); if (coins > 0) sfx('coin', 2); }

    $('endBest').hidden = !isBest;
    $('endTitle').textContent = won
      ? (world.stars === 3 ? 'بطل التوربو الخارق!' : 'انتصار ساحق!')
      : (world.mode === 'rush' && !world.overTimer ? 'انتهى الوقت!' : (isBest ? 'رقم قياسي جديد!' : 'فاض الخلاط!'));
    $('endStars').hidden = !won || world.stars <= 0;
    $('endStars').querySelectorAll('svg').forEach((s, idx) => s.classList.toggle('on', idx < world.stars));
    $('endScore').querySelector('b').textContent = String(world.score);
    $('endMonsterTxt').textContent = E.FRUITS[world.highestTier].name;
    $('endCoins').querySelector('b').textContent = '+' + coins;

    screen = won ? 'win' : 'over';
    syncVisibility(); say($('endTitle').textContent);
  }

  /* --------------------------------------------------------- Shop UI */
  const shopButtons = { dropper: [], tank: [] };
  function initShop() {
    [['dropper', E.DROPPERS, 'shelfDroppers'], ['tank', E.TANKS, 'shelfTanks']].forEach(([kind, items, shelfId]) => {
      items.forEach((it, idx) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'jd-btn shop-tile';
        b.innerHTML = '<canvas width="96" height="96"></canvas><b>' + it.name + '</b><span class="tag"></span>';
        bindBtn(b, () => {
          const res = E.buyOrEquip(save, kind, idx);
          if (!res) { sfx('fail'); wiggle(b); return; }
          persist();
          if (res === 'bought') { sfx('coin', 3); sfx('levelUp'); } else sfx('pop', 0.45);
          renderShop();
        });
        $(shelfId).appendChild(b); shopButtons[kind].push(b);
      });
    });
  }

  function renderShop() {
    $('shopCoins').querySelector('b').textContent = String(save.coins);
    ['dropper', 'tank'].forEach(kind => {
      const list = kind === 'tank' ? E.TANKS : E.DROPPERS;
      const own = kind === 'tank' ? save.tanks : save.droppers;
      const cur = kind === 'tank' ? save.tank : save.dropper;
      shopButtons[kind].forEach((b, idx) => {
        const c = b.querySelector('canvas'), g = c.getContext('2d');
        g.clearRect(0, 0, 96, 96);
        if (kind === 'dropper') drawSpr(g, getDropperSprite(idx), 6, 14, 84, 62);
        else {
          rr(g, 18, 12, 60, 72, 14); g.fillStyle = 'rgba(15,23,42,0.75)'; g.fill();
          g.lineWidth = 6; g.strokeStyle = E.TANKS[idx].wall; g.stroke();
          drawMonsterFruit(g, (idx * 2 + 3) % 10, null, 48, 56, 20, 0, 0, false);
        }
        b.classList.toggle('own', !!own[idx]);
        b.classList.toggle('wear', cur === idx);
        b.querySelector('.tag').innerHTML = cur === idx ? 'مُجهّز' : own[idx] ? 'اختر' : ('<i class="coin"></i><span dir="ltr">' + list[idx].price + '</span>');
      });
    });
  }

  /* --------------------------------------------------- Events & Input */
  function addFloat(x, y, txt, color, size) {
    floats.push({ x: x, y: y, txt: txt, color: color || '#ffe033', size: size || 30, t: 0 });
    if (floats.length > 14) floats.shift();
  }

  function processEvents() {
    for (let i = 0; i < world.ev.length; i++) {
      const e = world.ev[i];
      if (e.t === 'drop') sfx('pop', 0.42);
      else if (e.t === 'land') sfx('impact', e.power * 0.35);
      else if (e.t === 'merge') {
        Kit.track.hit(); sfx('streak', Math.min(12, e.combo || 1));
        const sp = E.FRUITS[e.toTier];
        if (!calm()) {
          rings.push({ x: e.x, y: e.y, r: sp.r * 0.6, maxR: sp.r * 2.1, color: sp.color, t: 0 });
          fx.burst(e.x, e.y, { count: 14 + e.toTier * 2, colors: [sp.color, sp.glow, '#ffe033', '#ffffff'], speed: 280, life: 0.58, size: 7, gravity: 360 });
          camShake.add(Math.min(8, 2.2 + e.toTier * 0.55));
        }
        addFloat(e.x, e.y - 18, '+' + e.points, '#fff59d', 30);
        if (e.combo >= 2) addFloat(e.x, e.y - 52, 'دمج ×' + e.combo + '!', '#4ade80', 34);
        if (e.toTier === 9) { sfx('levelUp'); addFloat(e.x, e.y - 86, 'البطيخة الخارقة!', '#ffe033', 38); }
      } else if (e.t === 'mega_boom') {
        Kit.track.hit(); sfx('levelUp'); sfx('coin', 5);
        if (!calm()) {
          fx.burst(e.x, e.y, { count: 44, colors: ['#2ecc71', '#ffe033', '#ff3d6e', '#ffffff'], speed: 460, life: 0.95, size: 10, gravity: 340 });
          rings.push({ x: e.x, y: e.y, r: 40, maxR: 250, color: '#ffe033', t: 0 }); camShake.add(12);
        }
        addFloat(e.x, e.y - 30, 'انفجار خارق! +' + e.points, '#ffe033', 40);
      } else if (e.t === 'fever_start') {
        sfx('levelUp'); addFloat(E.CX, E.TOP_Y + 46, 'وضع الحماس! فاكهة القوس!', '#ffe033', 36);
      } else if (e.t === 'crate_smash') {
        sfx('impact', 0.85); sfx('coin', 1);
        if (!calm()) fx.burst(e.x, e.y, { count: 18, colors: ['#fbbf24', '#bae6fd', '#ffffff'], speed: 260, life: 0.55, size: 7, gravity: 340 });
        addFloat(e.x, e.y - 20, 'تحطّم! +' + e.points, '#fde047', 28);
      } else if (e.t === 'crate_hit') sfx('impact', 0.45);
      else if (e.t === 'bomb_pop' && !calm()) {
        fx.burst(e.x, e.y, { count: 14, colors: ['#ff3d6e', '#ffe033', '#ffffff'], speed: 250, life: 0.5, size: 7, gravity: 300 });
      } else if (e.t === 'gadget') {
        if (e.kind === 'bomb') { sfx('impact', 0.9); if (!calm()) camShake.add(9); addFloat(E.CX, E.TOP_Y + 52, 'قنبلة العصير!', '#ff3d6e', 34); }
        else if (e.kind === 'shake') { sfx('impact', 0.7); if (!calm()) camShake.add(10); addFloat(E.CX, E.TOP_Y + 52, 'زلزال السلة!', '#38bdf8', 34); }
        else if (e.kind === 'swap') sfx('pop', 0.65);
      } else if (e.t === 'overflow') { Kit.track.miss(); finishRound(false); break; }
      else if (e.t === 'win') { finishRound(true); break; }
      else if (e.t === 'time_up') { finishRound(false); break; }
    }
    world.ev.length = 0;
  }

  function bindBtn(el, fn) {
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => { e.stopPropagation(); Kit.audio.unlock(); el.blur(); fn(e); });
  }

  document.querySelectorAll('.mode-card').forEach(b => bindBtn(b, () => { curMode = b.dataset.mode; sfx('pop', 0.4); refreshTitleUI(); }));
  document.querySelectorAll('.diff-pill').forEach(b => bindBtn(b, () => { curDiff = b.dataset.diff; sfx('pop', 0.4); refreshTitleUI(); }));

  bindBtn($('btnPlay'), () => startRound(curMode, curDiff));
  bindBtn($('btnShop'), () => { sfx('pop', 0.45); shopOpen = true; renderShop(); syncVisibility(); });
  bindBtn($('btnShopClose'), () => { sfx('pop', 0.35); shopOpen = false; refreshTitleUI(); syncVisibility(); });
  bindBtn($('btnPause'), () => pauseGame(true));
  bindBtn($('btnResume'), resumeGame);
  bindBtn($('btnRestart'), restartGame);
  bindBtn($('btnPauseHome'), goTitle);
  bindBtn($('btnEndAgain'), restartGame);
  bindBtn($('btnEndHome'), goTitle);
  bindBtn($('btnBomb'), () => triggerGadget('bomb', $('btnBomb')));
  bindBtn($('btnShake'), () => triggerGadget('shake', $('btnShake')));
  bindBtn($('btnSwap'), () => triggerGadget('swap', $('btnSwap')));

  window.addEventListener('pointermove', e => {
    if (screen !== 'play' || !world || world.done) return;
    const p = view.toLogical(e.clientX, e.clientY);
    if (p.x >= world.jar.left - 65 && p.x <= world.jar.right + 65 && p.y >= 24 && p.y <= H - 12) aimX = p.x;
  });

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || screen !== 'play' || !world || world.done) return;
    Kit.audio.unlock();
    const p = view.toLogical(e.clientX, e.clientY);
    if (p.x >= world.jar.left - 50 && p.x <= world.jar.right + 50 && p.y >= 16 && p.y <= H - 10) {
      aimX = p.x; dropQueued = true;
    }
  });

  function handleKeys() {
    const K = Kit.keys;
    const onBtn = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (shopOpen) { if (K.pressed('Escape')) { shopOpen = false; refreshTitleUI(); syncVisibility(); } return; }
    if (screen === 'title') {
      if (!onBtn && K.anyPressed(['Enter', 'NumpadEnter', 'Space'])) startRound(curMode, curDiff);
    } else if (screen === 'play') {
      if (K.anyPressed(['Escape', 'KeyP'])) { pauseGame(true); return; }
      if (K.pressed('KeyR')) { restartGame(); return; }
      if (K.anyPressed(['Digit1', 'Numpad1'])) triggerGadget('bomb', $('btnBomb'));
      if (K.anyPressed(['Digit2', 'Numpad2'])) triggerGadget('shake', $('btnShake'));
      if (K.anyPressed(['Digit3', 'Numpad3'])) triggerGadget('swap', $('btnSwap'));
      if (!onBtn && (K.anyPressed(['Space', 'Enter', 'NumpadEnter', 'ArrowDown']) || K.anyDown(['Space']))) dropQueued = true;
    } else if (screen === 'pause') {
      if (!onBtn && K.anyPressed(['Escape', 'KeyP', 'Space', 'Enter', 'NumpadEnter'])) resumeGame();
      else if (K.pressed('KeyR')) restartGame();
    } else if (screen === 'win' || screen === 'over') {
      if (!onBtn && K.anyPressed(['Enter', 'NumpadEnter', 'Space', 'KeyR'])) restartGame();
      else if (K.pressed('Escape')) goTitle();
    }
  }

  function update(dt) {
    handleKeys();
    if (screen === 'pause') { Kit.keys.endFrame(); return; }
    stepBlinks(dt);

    if (screen === 'play' && world && !world.done) {
      const K = Kit.keys;
      const move = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
      if (move !== 0) aimX = null;
      E.step(world, dt, { x: aimX, move: move, drop: dropQueued, gadget: gadgetQueued });
      aimX = null; dropQueued = false; gadgetQueued = '';
      processEvents(); syncGadgetHud();
    } else menuTime += dt;

    fx.update(dt); camShake.update(dt);
    for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].t += dt) >= 0.36) rings.splice(i, 1);
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      if (!calm()) floats[i].y -= dt * 44;
      if (floats[i].t >= 1.05) floats.splice(i, 1);
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------- Arcade Rendering */
  function drawBackdrop(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1e295e'); sky.addColorStop(0.65, '#2b1f5c'); sky.addColorStop(1, '#151136');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(E.CX, 360); ctx.fillStyle = 'rgba(125,211,252,0.045)';
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.08) * 900, Math.sin(a - 0.08) * 900);
      ctx.lineTo(Math.cos(a + 0.08) * 900, Math.sin(a + 0.08) * 900);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#261e4b'; ctx.fillRect(0, E.FLOOR_Y + 14, W, H - E.FLOOR_Y - 14);
    ctx.strokeStyle = INK; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, E.FLOOR_Y + 14); ctx.lineTo(W, E.FLOOR_Y + 14); ctx.stroke();
  }

  function drawEvolutionWheel(ctx, w) {
    const cx = 186, cy = 408, ringR = 122;
    rr(ctx, 22, 98, 328, 578, 32);
    ctx.fillStyle = 'rgba(22, 18, 54, 0.88)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#38bdf8'; ctx.stroke();
    drawText(ctx, 'عجلة الوحوش', cx, 134, 28, '#ffe033');
    drawText(ctx, 'ادمج المتشابه للتطوّر!', cx, 168, 18, '#bae6fd', { stroke: false });

    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, TAU);
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(125,211,252,0.28)'; ctx.stroke();

    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 10;
      const fx0 = cx + Math.cos(a) * ringR, fy0 = cy + Math.sin(a) * ringR, rad = i === 9 ? 28 : 16 + i * 1.1;
      if (w.highestTier === i) {
        ctx.beginPath(); ctx.arc(fx0, fy0, rad + 7, 0, TAU);
        ctx.fillStyle = 'rgba(255,224,51,0.35)'; ctx.fill();
      }
      ctx.save();
      if (!w.seen[i]) ctx.globalAlpha = 0.45;
      drawMonsterFruit(ctx, i, null, fx0, fy0, rad, 0, 0, blinkNow(12 + i));
      ctx.restore();
    }
    drawMonsterFruit(ctx, w.highestTier, null, cx, cy - 6, 38, 0, 0, blinkNow(23));
    drawText(ctx, E.FRUITS[w.highestTier].name, cx, cy + 52, 19, '#ffffff');
    drawText(ctx, E.MODES[w.mode].name + ' • ' + E.DIFFS[w.diff].name, cx, 642, 21, '#7dd3fc', { stroke: false });
  }

  function drawRightHud(ctx, w) {
    // Score + Next Fruit card positioned cleanly below top-right mute button
    rr(ctx, 932, 68, 326, 132, 26);
    ctx.fillStyle = 'rgba(22, 18, 54, 0.9)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23f'; ctx.stroke();

    drawText(ctx, 'النقاط', 1152, 94, 21, '#fde047', { stroke: false });
    drawText(ctx, w.score, 1152, 134, 40, '#ffffff', { dir: 'ltr' });

    if (w.mode === 'rush') {
      const sec = Math.ceil(w.timeLeft);
      drawText(ctx, 'الوقت: ' + sec, 1152, 176, 22, sec <= 15 ? '#ff3d6e' : '#4ade80');
    } else if (w.mode === 'crates') {
      drawText(ctx, 'الصناديق: ' + w.crates.length + '/' + w.cratesTotal, 1152, 176, 21, '#38bdf8');
    } else {
      drawText(ctx, 'الأعلى: ' + Math.max(save.best.classic || 0, w.score), 1152, 176, 20, '#cbd5e1', { stroke: false });
    }

    ctx.beginPath(); ctx.arc(998, 144, 42, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#7dd3fc'; ctx.stroke();
    drawText(ctx, 'القادم', 998, 86, 19, '#7dd3fc', { stroke: false });
    drawMonsterFruit(ctx, w.nextTier, null, 998, 146, Math.min(31, E.FRUITS[w.nextTier].r + 5), 0, 0, blinkNow(22));

    // Fever Gauge card
    rr(ctx, 932, 212, 326, 126, 26);
    ctx.fillStyle = 'rgba(22, 18, 54, 0.9)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = w.feverActive ? '#ff3d6e' : '#a855f7'; ctx.stroke();

    drawText(ctx, w.feverActive ? 'وضع الحماس ×2!' : 'عداد الحماس', 1095, 240, 23, w.feverActive ? '#ffe033' : '#e9d5ff');
    rr(ctx, 956, 264, 278, 30, 15); ctx.fillStyle = '#0f172a'; ctx.fill();
    const fw = clamp(w.fever / 100, 0, 1) * 270;
    if (fw > 4) {
      rr(ctx, 960, 268, fw, 22, 11);
      const fg = ctx.createLinearGradient(960, 0, 1230, 0);
      fg.addColorStop(0, '#ff3d6e'); fg.addColorStop(0.5, '#ffe033'); fg.addColorStop(1, '#2ecc71');
      ctx.fillStyle = fg; ctx.fill();
    }
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; rr(ctx, 956, 264, 278, 30, 15); ctx.stroke();
    drawText(ctx, w.feverActive ? 'فاكهة القوس جاهزة!' : 'ادمج لإطلاق فاكهة القوس', 1095, 314, 17, '#cbd5e1', { stroke: false });
  }

  function drawTankAndWorld(ctx, w) {
    const tk = E.TANKS[save.tank] || E.TANKS[0];
    const jar = w.jar, jw = jar.right - jar.left, jh = jar.bottom - jar.top, t = w.time;

    ctx.save();
    if (w.shakeAnim > 0 && !calm()) {
      const p = w.shakeAnim / 0.55;
      ctx.translate(Math.sin(t * 55) * 11 * p, -Math.abs(Math.cos(t * 42)) * 7 * p);
    }

    rr(ctx, jar.left, jar.top, jw, jh, 24);
    ctx.fillStyle = 'rgba(14, 22, 56, 0.62)'; ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 3;
    for (let y = jar.top + 80; y < jar.bottom - 40; y += 85) {
      ctx.beginPath();
      ctx.moveTo(jar.left + 14, y); ctx.lineTo(jar.left + 36, y);
      ctx.moveTo(jar.right - 36, y); ctx.lineTo(jar.right - 14, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.setLineDash([12, 10]); ctx.lineWidth = w.warning ? 5 : 3;
    const warnBlink = w.warning && (calm() || Math.sin(t * 16) > -0.2);
    ctx.strokeStyle = warnBlink ? '#ff3d6e' : 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.moveTo(jar.left + 12, jar.top); ctx.lineTo(jar.right - 12, jar.top); ctx.stroke();
    ctx.restore();

    if (!w.done) {
      const aim = E.aimInfo(w);
      ctx.save();
      ctx.setLineDash([8, 9]); ctx.lineWidth = 4;
      ctx.strokeStyle = aim.willMerge ? '#4ade80' : 'rgba(255, 224, 51, 0.72)';
      ctx.beginPath(); ctx.moveTo(aim.x, aim.yStart); ctx.lineTo(aim.x, aim.yHit); ctx.stroke();
      ctx.restore();

      ctx.beginPath(); ctx.arc(aim.x, aim.yHit, 7, 0, TAU);
      ctx.fillStyle = aim.willMerge ? '#4ade80' : '#ffe033'; ctx.fill();

      if (aim.willMerge && (w.D.mergeHint || w.currentPower === 'rainbow')) {
        ctx.beginPath(); ctx.arc(aim.targetX, aim.targetY, aim.targetR + 8, 0, TAU);
        ctx.lineWidth = 5; ctx.strokeStyle = '#4ade80'; ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(jar.left + 10, E.CLOUD_Y - 22); ctx.lineTo(jar.right - 10, E.CLOUD_Y - 22); ctx.stroke();

      drawSpr(ctx, getDropperSprite(save.dropper), w.cloudX - 58, E.CLOUD_Y - 52, 116, 84);
      if (w.dropCd <= 0.06) {
        drawMonsterFruit(ctx, w.currentTier, w.currentPower, w.cloudX, E.CLOUD_Y + 20, E.dropRadius(w), 0, 0, blinkNow(0));
      }
    }

    for (let i = 0; i < w.crates.length; i++) {
      const cr = w.crates[i], sc = cr.hitAnim > 0 ? 1 + Math.sin(cr.hitAnim * 24) * 0.12 : 1, sz = cr.r * 2.25 * sc;
      drawSpr(ctx, getCrateSprite(cr.kind, cr.hp), cr.x - sz / 2, cr.y - sz / 2, sz, sz);
    }

    if (w.bumper) {
      ctx.beginPath(); ctx.arc(w.bumper.x, w.bumper.y, w.bumper.r, 0, TAU);
      ctx.fillStyle = '#ff3d6e'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(w.bumper.x, w.bumper.y, w.bumper.r * 0.48, 0, TAU);
      ctx.fillStyle = '#ffe033'; ctx.fill();
    }

    for (let i = 0; i < w.fruits.length; i++) {
      const f = w.fruits[i];
      drawMonsterFruit(ctx, f.tier, f.power, f.x, f.y, f.r, f.rot, calm() ? 0 : f.squash, blinkNow(f.id));
    }

    for (let i = 0; i < rings.length; i++) {
      const rg = rings[i], k = rg.t / 0.36;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r + (rg.maxR - rg.r) * k, 0, TAU);
      ctx.lineWidth = 7 * (1 - k) + 1; ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = rg.color; ctx.stroke(); ctx.globalAlpha = 1;
    }

    const rimCol = w.feverActive ? '#ffe033' : (warnBlink ? '#ff3d6e' : tk.wall);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(jar.left, jar.top - 6); ctx.lineTo(jar.left, jar.bottom - 20);
    ctx.quadraticCurveTo(jar.left, jar.bottom, jar.left + 20, jar.bottom);
    ctx.lineTo(jar.right - 20, jar.bottom);
    ctx.quadraticCurveTo(jar.right, jar.bottom, jar.right, jar.bottom - 20);
    ctx.lineTo(jar.right, jar.top - 6);
    ctx.lineWidth = 18; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 9; ctx.strokeStyle = rimCol; ctx.stroke();

    rr(ctx, jar.left + 12, jar.top + 16, 12, jh - 48, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();

    rr(ctx, jar.left - 18, jar.bottom + 2, jw + 36, 44, 18);
    ctx.fillStyle = '#334155'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    for (let b = 0; b < 3; b++) {
      ctx.beginPath(); ctx.arc(E.CX + (b - 1) * 46, jar.bottom + 24, 8, 0, TAU);
      ctx.fillStyle = w.feverActive ? '#ffe033' : (b === 1 ? '#4ade80' : tk.rim); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.restore();
  }

  function drawTitleScene(ctx) {
    drawBackdrop(ctx);
    const lineup = [
      { tier: 0, x: 56, r: 22 }, { tier: 2, x: 124, r: 30 }, { tier: 4, x: 204, r: 38 },
      { tier: 5, x: 1054, r: 38 }, { tier: 8, x: 1136, r: 48 }, { tier: 9, x: 1222, r: 58 }
    ];
    for (let i = 0; i < lineup.length; i++) {
      const m = lineup[i];
      const hop = calm() ? 0 : Math.abs(Math.sin(menuTime * 3 + i * 0.8)) * 10;
      drawMonsterFruit(ctx, m.tier, null, m.x, E.FLOOR_Y + 12 - m.r - hop, m.r, 0, 0, blinkNow(i + 1));
    }
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(camShake.x, camShake.y);

    if (world && screen !== 'title') {
      drawBackdrop(ctx);
      drawEvolutionWheel(ctx, world);
      drawRightHud(ctx, world);
      drawTankAndWorld(ctx, world);
      fx.draw(ctx);
      for (let i = 0; i < floats.length; i++) {
        const fl = floats[i];
        ctx.save();
        ctx.globalAlpha = clamp(1 - Math.max(0, fl.t - 0.6) / 0.45, 0, 1);
        drawText(ctx, fl.txt, fl.x, fl.y, fl.size, fl.color);
        ctx.restore();
      }
    } else drawTitleScene(ctx);
    ctx.restore();
  }

  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'سلة 5').then(() => { dirty = true; }, () => {});
  }

  const r2 = v => Math.round(v * 100) / 100;
  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen,
        paused: screen === 'pause',
        shopOpen: shopOpen,
        mode: w ? w.mode : curMode,
        diff: w ? w.diff : curDiff,
        time: w ? Math.round(w.time * 1000) / 1000 : 0,
        cloudX: w ? Math.round(w.cloudX * 10) / 10 : E.CX,
        drops: w ? w.drops : 0,
        score: w ? w.score : 0,
        fruits: w ? w.fruits.map(f => ({ x: r2(f.x), y: r2(f.y), r: f.r, tier: f.tier })) : [],
        merges: w ? w.merges : 0,
        combo: w ? w.combo : 0,
        fever: w ? Math.round(w.fever) : 0,
        feverActive: !!(w && w.feverActive),
        currentTier: w ? w.currentTier : 0,
        nextTier: w ? w.nextTier : 0,
        currentPower: w ? w.currentPower : null,
        crates: w ? w.crates.length : 0,
        timeLeft: w ? Math.ceil(w.timeLeft) : 0,
        gadgets: w ? { bomb: w.gadgets.bomb, shake: w.gadgets.shake, swap: w.gadgets.swap } : null,
        warning: !!(w && w.warning),
        done: !!(w && w.done),
        won: !!(w && w.won),
        over: !!(w && w.over),
        stars: w ? w.stars : 0,
        fx: fx.list ? fx.list.length : rings.length,
        shake: r2(Math.hypot(camShake.x || 0, camShake.y || 0))
      };
    },
    get world() { return world; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    point: (x, y) => {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + x * view.scale, y: r.top + y * view.scale };
    }
  };

  initShop();
  Kit.muteButton();
  Kit.lifecycle({
    pause: () => pauseGame(false),
    reset: () => { aimX = null; dropQueued = false; gadgetQueued = ''; }
  });
  goTitle();
  Kit.loop(update, render);
  Kit.ready();
})();

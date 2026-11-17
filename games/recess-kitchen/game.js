/*
 * مطبخ الفسحة (Recess Kitchen: Turbo Robo-Chef & Burger Cannon)
 * Canvas 2D rendering via Kit.art, discrete Kit.juice SFX, UI overlays, DDA & Telemetry.
 */
(function () {
  'use strict';

  var E = window.RKEngine, J = Kit.juice, A = Kit.art;
  var W = E.W, H = E.H, TILE = E.TILE, TAU = Math.PI * 2, INK = '#1b1640';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };

  A.init({ canvas: canvas, mode: '2d', theme: 'day' });

  var dirty = true;
  var view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: function (v) {
      ui.style.left = canvas.style.left;
      ui.style.top = canvas.style.top;
      ui.style.transform = 'scale(' + v.scale + ')';
      dirty = true;
    }
  });
  var ctx = view.ctx;

  var fx = Kit.particles(), camShake = Kit.shake();
  var store = Kit.store('recess-kitchen');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = E.loadSave(store.get('save', null));
  var dda = Kit.dda('recess-kitchen', { id: 'main', start: 0.35 });

  function persist() {
    if (store.set('save', save) === false) {
      saveStatus.failed();
      return false;
    }
    saveStatus.saved();
    return true;
  }

  function sfx(name, arg) {
    if (J && typeof J[name] === 'function') J[name](arg);
  }

  /* -------------------------------------- Bounded Static Sprite Library */
  var BLINK_SLOTS = [{}, {}, {}, {}, {}, {}];

  function rr(c, x, y, w, h, r) {
    A.round(c, x, y, w, h, r);
  }

  function strokeFill(c, fill, lw) {
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = lw || 3.5;
    c.strokeStyle = INK;
    c.lineJoin = 'round';
    c.stroke();
  }

  function drawText(c, txt, x, y, size, fill, align) {
    c.save();
    c.font = '800 ' + size + 'px Fredoka';
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    c.direction = 'rtl';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(3.5, size * 0.22);
    c.strokeStyle = INK;
    c.strokeText(txt, x, y);
    c.fillStyle = fill || '#ffffff';
    c.fillText(txt, x, y);
    c.restore();
  }

  function paintFoodArt(c, kind, s) {
    var cx = s / 2, cy = s / 2;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (kind === 'bun' || kind === 'bunCheese') {
      c.beginPath(); c.ellipse(cx, cy + 4, s * 0.36, s * 0.22, 0, 0, TAU);
      strokeFill(c, '#f4a261', 3);
      c.beginPath(); c.ellipse(cx, cy - 2, s * 0.34, s * 0.2, 0, Math.PI, TAU);
      strokeFill(c, '#f6bd60', 3);
      c.fillStyle = '#fff8eb';
      c.beginPath(); c.arc(cx - 6, cy - 8, 2, 0, TAU); c.arc(cx + 5, cy - 9, 2, 0, TAU); c.arc(cx, cy - 5, 2, 0, TAU); c.fill();
      if (kind === 'bunCheese') {
        c.beginPath(); c.moveTo(cx - 14, cy + 2); c.lineTo(cx + 14, cy + 2); c.lineTo(cx + 8, cy + 12); c.lineTo(cx - 10, cy + 10); c.closePath();
        strokeFill(c, '#ffd166', 2.5);
      }
    } else if (kind === 'meatRaw' || kind === 'meatCooked' || kind === 'meatCheese') {
      var mCol = kind === 'meatRaw' ? '#ef6351' : '#7f3718';
      c.beginPath(); c.ellipse(cx, cy + 2, s * 0.36, s * 0.23, 0, 0, TAU);
      strokeFill(c, mCol, 3);
      if (kind !== 'meatRaw') {
        c.strokeStyle = '#3d1706'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(cx - 9, cy - 4); c.lineTo(cx - 5, cy + 7); c.moveTo(cx + 3, cy - 5); c.lineTo(cx + 7, cy + 6); c.stroke();
      } else {
        c.strokeStyle = '#ffd6d0'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(cx - 7, cy); c.lineTo(cx + 6, cy + 3); c.stroke();
      }
      if (kind === 'meatCheese') {
        c.beginPath(); c.rect(cx - 11, cy - 7, 22, 11);
        strokeFill(c, '#ffd166', 2.5);
      }
    } else if (kind === 'cheese') {
      c.beginPath(); c.moveTo(cx - 16, cy + 10); c.lineTo(cx + 16, cy + 10); c.lineTo(cx + 6, cy - 13); c.lineTo(cx - 14, cy - 6); c.closePath();
      strokeFill(c, '#ffd166', 3);
      c.fillStyle = '#f59e0b';
      c.beginPath(); c.arc(cx - 4, cy + 3, 3, 0, TAU); c.arc(cx + 5, cy + 5, 2.2, 0, TAU); c.fill();
    } else if (kind === 'potatoRaw') {
      c.beginPath(); c.ellipse(cx, cy + 1, s * 0.33, s * 0.24, -0.25, 0, TAU);
      strokeFill(c, '#d4a373', 3);
      c.fillStyle = '#8d5b34';
      c.beginPath(); c.arc(cx - 6, cy - 2, 2, 0, TAU); c.arc(cx + 6, cy + 4, 2, 0, TAU); c.fill();
    } else if (kind === 'fries') {
      c.strokeStyle = INK; c.lineWidth = 2.5;
      var xs = [-10, -4, 2, 8];
      for (var fi = 0; fi < 4; fi++) {
        rr(c, cx + xs[fi] - 3, cy - 17 + (fi % 2) * 3, 6, 20, 2);
        strokeFill(c, '#ffd166', 2.5);
      }
      c.beginPath(); c.moveTo(cx - 15, cy - 2); c.lineTo(cx + 15, cy - 2); c.lineTo(cx + 12, cy + 16); c.lineTo(cx - 12, cy + 16); c.closePath();
      strokeFill(c, '#ef476f', 3);
      c.fillStyle = '#ffd166'; c.beginPath(); c.arc(cx, cy + 7, 4, 0, TAU); c.fill();
    } else if (kind === 'fruitRaw') {
      c.beginPath(); c.moveTo(cx, cy + 15); c.quadraticCurveTo(cx - 17, cy - 3, cx - 7, cy - 11); c.quadraticCurveTo(cx, cy - 14, cx + 7, cy - 11); c.quadraticCurveTo(cx + 17, cy - 3, cx, cy + 15);
      strokeFill(c, '#ff4d6d', 3);
      c.beginPath(); c.ellipse(cx, cy - 13, 9, 4, 0, 0, TAU);
      strokeFill(c, '#3ddc84', 2.5);
    } else if (kind === 'juice') {
      c.beginPath(); c.moveTo(cx + 3, cy - 20); c.lineTo(cx + 9, cy - 8); c.strokeStyle = '#00f5d4'; c.lineWidth = 4; c.stroke();
      c.beginPath(); c.moveTo(cx - 12, cy - 9); c.lineTo(cx + 12, cy - 9); c.lineTo(cx + 9, cy + 16); c.lineTo(cx - 9, cy + 16); c.closePath();
      strokeFill(c, '#ff5d8f', 3);
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(cx - 6, cy - 5, 4, 17);
    } else if (kind === 'dough' || kind === 'pizzaRaw') {
      c.beginPath(); c.arc(cx, cy + 1, s * 0.34, 0, TAU);
      strokeFill(c, '#fde68a', 3);
      if (kind === 'pizzaRaw') {
        c.beginPath(); c.arc(cx, cy + 1, s * 0.26, 0, TAU);
        strokeFill(c, '#ef476f', 2);
        c.fillStyle = '#ffd166';
        c.beginPath(); c.arc(cx - 5, cy - 2, 4, 0, TAU); c.arc(cx + 6, cy + 3, 4, 0, TAU); c.arc(cx - 1, cy + 6, 3.5, 0, TAU); c.fill();
      }
    } else if (kind === 'pizza') {
      c.beginPath(); c.arc(cx, cy + 1, s * 0.38, 0, TAU);
      strokeFill(c, '#f59e0b', 3);
      c.beginPath(); c.arc(cx, cy + 1, s * 0.29, 0, TAU);
      c.fillStyle = '#ffd166'; c.fill();
      c.fillStyle = '#d90429';
      c.beginPath(); c.arc(cx - 6, cy - 4, 4, 0, TAU); c.arc(cx + 6, cy - 2, 4, 0, TAU); c.arc(cx, cy + 7, 4, 0, TAU); c.fill();
    } else if (kind === 'burger' || kind === 'cheeseburger') {
      // Tray glow underneath finished dish
      c.beginPath(); c.ellipse(cx, cy + 12, s * 0.41, s * 0.16, 0, 0, TAU);
      strokeFill(c, '#ffffff', 2.8);
      c.beginPath(); c.ellipse(cx, cy + 8, s * 0.33, s * 0.13, 0, 0, TAU);
      strokeFill(c, '#e7984f', 2.6);
      c.beginPath(); c.ellipse(cx, cy + 2, s * 0.35, s * 0.14, 0, 0, TAU);
      strokeFill(c, '#7f3718', 2.6);
      if (kind === 'cheeseburger') {
        c.beginPath(); c.moveTo(cx - 15, cy - 2); c.lineTo(cx + 15, cy - 2); c.lineTo(cx + 4, cy + 7); c.lineTo(cx - 12, cy + 3); c.closePath();
        strokeFill(c, '#ffd166', 2.4);
      }
      c.beginPath(); c.ellipse(cx, cy - 4, s * 0.34, s * 0.18, 0, Math.PI, TAU);
      c.closePath();
      strokeFill(c, '#f6bd60', 2.8);
      c.fillStyle = '#fff8eb';
      c.beginPath(); c.arc(cx - 5, cy - 10, 1.8, 0, TAU); c.arc(cx + 5, cy - 10, 1.8, 0, TAU); c.arc(cx, cy - 12, 1.8, 0, TAU); c.fill();
    } else if (kind === 'burnt') {
      A.blob(c, cx, cy + 2, s * 0.3, 0.14, 1.2);
      strokeFill(c, '#334155', 3);
    }
  }

  function itemSprite(kind) {
    return A.sprite('it_' + kind, 52, 52, function (c, bw) {
      paintFoodArt(c, kind, bw);
    }, { pad: 4 });
  }

  function miniIconSprite(kind) {
    if (E.ITEMS[kind]) return itemSprite(kind);
    return A.sprite('ic_' + kind, 40, 40, function (c, bw, bh) {
      rr(c, 4, 4, bw - 8, bh - 8, 10);
      var col = kind === 'grill' ? '#f97316' : kind === 'fryer' ? '#eab308' : kind === 'blender' ? '#06b6d4' : '#8b5cf6';
      strokeFill(c, col, 3);
      c.fillStyle = '#fff';
      c.beginPath();
      if (kind === 'blender') { c.moveTo(20, 9); c.lineTo(28, 29); c.lineTo(12, 29); c.closePath(); c.fill(); }
      else if (kind === 'oven') { c.arc(20, 23, 9, Math.PI, TAU); c.fill(); }
      else { c.arc(20, 20, 8, 0, TAU); c.fill(); }
    }, { pad: 3 });
  }

  function stationSprite(st, worldIdx) {
    var key = 'st_' + st.type + (st.kind ? '_' + st.kind : '') + (st.dir ? '_' + st.dir : '') + (st.type === 'wall' ? '_w' + worldIdx : '');
    return A.sprite(key, TILE, TILE, function (c, bw, bh) {
      var wd = E.WORLDS[worldIdx] || E.WORLDS[0];
      if (st.type === 'wall') {
        rr(c, 3, 3, bw - 6, bh - 6, 14);
        strokeFill(c, A.shade(wd.color, -0.22), 3.5);
        rr(c, 10, 9, bw - 20, bh - 24, 10);
        c.fillStyle = wd.color; c.fill();
        A.gloss(c, 12, 10, bw - 24, 22);
        return;
      }

      // Base chunky block with front depth lip
      rr(c, 2, 6, bw - 4, bh - 8, 16);
      strokeFill(c, '#8d6e63', 3.5);

      if (st.type === 'counter') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#fff3d6', 3.5);
        rr(c, 12, 12, bw - 24, bh - 32, 10);
        c.strokeStyle = '#f3d5a5'; c.lineWidth = 2.5; c.stroke();
      } else if (st.type === 'belt') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#334155', 3.5);
        c.strokeStyle = '#38bdf8'; c.lineWidth = 4.5; c.lineCap = 'round'; c.lineJoin = 'round';
        for (var bi = -1; bi <= 1; bi++) {
          var bx = bw / 2 + bi * 18;
          c.beginPath();
          c.moveTo(bx - st.dir * 7, 22);
          c.lineTo(bx + st.dir * 7, 36);
          c.lineTo(bx - st.dir * 7, 50);
          c.stroke();
        }
      } else if (st.type === 'warp') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#3b0764', 3.5);
        c.beginPath(); c.arc(bw / 2, 36, 24, 0, TAU);
        strokeFill(c, '#a855f7', 3);
        c.beginPath(); c.arc(bw / 2, 36, 13, 0, TAU);
        c.fillStyle = '#00f5d4'; c.fill();
      } else if (st.type === 'crate') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#f6bd60', 3.5);
        rr(c, 9, 8, bw - 18, bh - 26, 11);
        strokeFill(c, '#fff8eb', 2.5);
        var fSpr = itemSprite(st.kind);
        A.blit(c, fSpr, bw / 2, 33, { sx: 0.92, sy: 0.92 });
        drawText(c, E.ITEMS[st.kind].name, bw / 2, bh - 13, 13, '#ffffff');
      } else if (st.type === 'grill') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#334155', 3.5);
        rr(c, 11, 10, bw - 22, bh - 30, 10);
        strokeFill(c, '#ea580c', 3);
        c.strokeStyle = '#cbd5e1'; c.lineWidth = 3.5;
        for (var gi = 0; gi < 4; gi++) {
          var gx = 20 + gi * 14;
          c.beginPath(); c.moveTo(gx, 13); c.lineTo(gx, bh - 23); c.stroke();
        }
        drawText(c, 'شواية', bw / 2, bh - 12, 13, '#ffd166');
      } else if (st.type === 'fryer') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#475569', 3.5);
        rr(c, 11, 10, bw - 22, bh - 30, 10);
        strokeFill(c, '#facc15', 3);
        c.fillStyle = '#fef08a';
        c.beginPath(); c.arc(28, 26, 5, 0, TAU); c.arc(48, 34, 6, 0, TAU); c.arc(36, 42, 4, 0, TAU); c.fill();
        drawText(c, 'مقلاة', bw / 2, bh - 12, 13, '#fef08a');
      } else if (st.type === 'blender') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#0284c7', 3.5);
        c.beginPath(); c.arc(bw / 2, 34, 21, 0, TAU);
        strokeFill(c, '#e0f2fe', 3);
        c.beginPath(); c.arc(bw / 2, 34, 12, 0, TAU);
        c.fillStyle = '#ff4d6d'; c.fill();
        drawText(c, 'خلاط', bw / 2, bh - 12, 13, '#ffffff');
      } else if (st.type === 'oven') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#7c2d12', 3.5);
        c.beginPath(); c.arc(bw / 2, 44, 24, Math.PI, TAU); c.closePath();
        strokeFill(c, '#ff9f1c', 3);
        drawText(c, 'فرن', bw / 2, bh - 12, 13, '#ffd166');
      } else if (st.type === 'cannon') {
        rr(c, 2, 2, bw - 4, bh - 10, 16);
        strokeFill(c, '#ef476f', 3.5);
        // Cannon barrel pointing up toward Serving Window
        rr(c, bw / 2 - 18, 4, 36, 40, 12);
        strokeFill(c, '#ffd166', 3.5);
        c.beginPath(); c.moveTo(bw / 2, 10); c.lineTo(bw / 2 - 9, 25); c.lineTo(bw / 2 + 9, 25); c.closePath();
        c.fillStyle = '#1b1640'; c.fill();
        drawText(c, 'أطلق!', bw / 2, bh - 15, 14, '#ffffff');
      } else if (st.type === 'trash') {
        rr(c, 2, 2, bw - 4, bh - 12, 16);
        strokeFill(c, '#10b981', 3.5);
        c.beginPath(); c.arc(bw / 2, 35, 18, 0, TAU);
        strokeFill(c, '#064e3b', 3);
        drawText(c, 'تدوير', bw / 2, bh - 12, 13, '#ffffff');
      }
    }, { pad: 4 });
  }

  function floorPadSprite(fp) {
    var key = 'fp_' + fp.type + '_' + fp.dir;
    return A.sprite(key, TILE, TILE, function (c, bw, bh) {
      if (fp.type === 'boost') {
        rr(c, 6, 6, bw - 12, bh - 12, 14);
        strokeFill(c, 'rgba(0, 245, 212, 0.35)', 2.5);
        c.strokeStyle = '#00bbf9'; c.lineWidth = 5; c.lineCap = 'round';
        for (var i = -1; i <= 1; i++) {
          var x = bw / 2 + i * 16;
          c.beginPath();
          c.moveTo(x - fp.dir * 7, 26);
          c.lineTo(x + fp.dir * 7, bh / 2);
          c.lineTo(x - fp.dir * 7, bh - 26);
          c.stroke();
        }
      } else {
        c.beginPath(); c.arc(bw / 2, bh / 2, 34, 0, TAU);
        strokeFill(c, '#bae6fd', 3);
        c.beginPath(); c.arc(bw / 2, bh / 2, 22, 0, TAU);
        strokeFill(c, '#38bdf8', 2.5);
      }
    }, { pad: 2 });
  }

  function customerSprite(custId, blink) {
    var bKey = blink ? '1' : '0';
    return A.sprite('cust_' + custId + '_' + bKey, 92, 92, function (c, bw, bh) {
      var cx = bw / 2, cy = bh / 2 + 6;
      if (custId === 'striker') {
        // Soccer Athlete
        c.beginPath(); c.arc(cx, cy, 30, 0, TAU);
        strokeFill(c, '#ffcfb3', 3.5);
        // Spiky hair + sporty headband
        c.beginPath(); c.moveTo(cx - 28, cy - 12); c.lineTo(cx - 18, cy - 36); c.lineTo(cx - 4, cy - 26); c.lineTo(cx + 8, cy - 38); c.lineTo(cx + 20, cy - 25); c.lineTo(cx + 30, cy - 12); c.closePath();
        strokeFill(c, '#1e293b', 3.5);
        rr(c, cx - 30, cy - 17, 60, 10, 5);
        strokeFill(c, '#38bdf8', 3);
      } else if (custId === 'robo') {
        // Hungry Friendly Robot
        c.beginPath(); c.moveTo(cx, cy - 42); c.lineTo(cx, cy - 28); c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
        c.beginPath(); c.arc(cx, cy - 44, 6, 0, TAU); strokeFill(c, '#00f5d4', 3);
        rr(c, cx - 30, cy - 28, 60, 56, 16);
        strokeFill(c, '#a855f7', 3.5);
        rr(c, cx - 22, cy - 18, 44, 24, 8);
        strokeFill(c, '#1e1b4b', 2.5);
      } else if (custId === 'dino') {
        // Cute Baby T-Rex
        for (var si = -1; si <= 1; si++) {
          c.beginPath(); c.moveTo(cx + si * 12 - 6, cy - 26); c.lineTo(cx + si * 12, cy - 40); c.lineTo(cx + si * 12 + 6, cy - 26); c.closePath();
          strokeFill(c, '#fb923c', 2.8);
        }
        c.beginPath(); c.arc(cx, cy, 31, 0, TAU);
        strokeFill(c, '#22c55e', 3.5);
      } else {
        // Recess Ninja
        c.beginPath(); c.arc(cx, cy, 30, 0, TAU);
        strokeFill(c, '#ef233c', 3.5);
        rr(c, cx - 24, cy - 14, 48, 18, 8);
        strokeFill(c, '#ffe5d9', 3);
        c.beginPath(); c.arc(cx, cy - 23, 5, 0, TAU);
        strokeFill(c, '#ffd166', 2.5);
      }

      // Expressive eyes & happy open mouth
      var ey = custId === 'ninja' ? cy - 5 : cy - 6;
      for (var side = -1; side <= 1; side += 2) {
        var ex = cx + side * 11;
        if (blink) {
          c.beginPath(); c.moveTo(ex - 5, ey); c.lineTo(ex + 5, ey);
          c.strokeStyle = custId === 'robo' ? '#00f5d4' : INK; c.lineWidth = 3.5; c.stroke();
        } else {
          c.beginPath(); c.arc(ex, ey, 5.5, 0, TAU);
          c.fillStyle = custId === 'robo' ? '#00f5d4' : '#ffffff'; c.fill();
          if (custId !== 'robo') {
            c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke();
            c.beginPath(); c.arc(ex + side, ey + 1, 2.8, 0, TAU); c.fillStyle = INK; c.fill();
          }
        }
      }
      if (custId !== 'ninja') {
        c.beginPath(); c.arc(cx, cy + 10, 9, 0, Math.PI); c.closePath();
        strokeFill(c, '#ef476f', 2.8);
      }
    }, { pad: 4 });
  }

  function chefSprite(apronIdx, hatIdx, pIdx) {
    var aCol = pIdx === 1 ? '#38bdf8' : E.APRONS[apronIdx].color;
    return A.sprite('chef_' + pIdx + '_' + apronIdx + '_' + hatIdx, 76, 84, function (c, bw, bh) {
      var cx = bw / 2, cy = bh / 2 + 8;
      // Apron body
      c.beginPath(); c.arc(cx, cy + 10, 24, 0, TAU);
      strokeFill(c, aCol, 3.5);
      // Cute hands
      c.beginPath(); c.arc(cx - 23, cy + 8, 7, 0, TAU); strokeFill(c, '#ffd6a5', 3);
      c.beginPath(); c.arc(cx + 23, cy + 8, 7, 0, TAU); strokeFill(c, '#ffd6a5', 3);
      // Head
      c.beginPath(); c.arc(cx, cy - 6, 20, 0, TAU);
      strokeFill(c, '#ffdbac', 3.5);
      // Eyes & grin
      c.fillStyle = INK;
      c.beginPath(); c.arc(cx - 7, cy - 6, 3.2, 0, TAU); c.arc(cx + 7, cy - 6, 3.2, 0, TAU); c.fill();
      c.beginPath(); c.arc(cx, cy + 1, 6, 0.15, Math.PI - 0.15); c.strokeStyle = INK; c.lineWidth = 2.8; c.stroke();

      // Hat
      if (hatIdx === 0) {
        c.beginPath(); c.arc(cx - 9, cy - 28, 10, 0, TAU); c.arc(cx + 9, cy - 28, 10, 0, TAU); c.arc(cx, cy - 32, 12, 0, TAU);
        strokeFill(c, '#ffffff', 3.2);
        rr(c, cx - 15, cy - 24, 30, 8, 4);
        strokeFill(c, '#ffd166', 2.8);
      } else if (hatIdx === 1) {
        // Pirate Hat
        c.beginPath(); c.moveTo(cx - 24, cy - 18); c.quadraticCurveTo(cx, cy - 42, cx + 24, cy - 18); c.closePath();
        strokeFill(c, '#1e293b', 3.2);
        c.beginPath(); c.arc(cx, cy - 26, 4.5, 0, TAU); c.fillStyle = '#ffd166'; c.fill();
      } else if (hatIdx === 2) {
        // Space Visor Helmet
        c.beginPath(); c.arc(cx, cy - 7, 23, Math.PI, TAU);
        strokeFill(c, 'rgba(56, 189, 248, 0.55)', 3.2);
        c.beginPath(); c.arc(cx, cy - 32, 4, 0, TAU); strokeFill(c, '#00f5d4', 2.5);
      } else {
        // Golden Crown
        c.beginPath(); c.moveTo(cx - 16, cy - 20); c.lineTo(cx - 18, cy - 36); c.lineTo(cx - 7, cy - 27);
        c.lineTo(cx, cy - 39); c.lineTo(cx + 7, cy - 27); c.lineTo(cx + 18, cy - 36); c.lineTo(cx + 16, cy - 20); c.closePath();
        strokeFill(c, '#ffd166', 3.2);
      }
    }, { pad: 4 });
  }

  function sousBotSprite() {
    return A.sprite('sous_bot', 68, 68, function (c, bw, bh) {
      var cx = bw / 2, cy = bh / 2 + 4;
      c.beginPath(); c.moveTo(cx, 8); c.lineTo(cx, 18); c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
      c.beginPath(); c.arc(cx, 7, 5, 0, TAU); strokeFill(c, '#00f5d4', 2.8);
      rr(c, cx - 20, 18, 40, 34, 12);
      strokeFill(c, '#38bdf8', 3.5);
      rr(c, cx - 14, 24, 28, 14, 6);
      strokeFill(c, '#0f172a', 2.5);
      c.fillStyle = '#00f5d4';
      c.beginPath(); c.arc(cx - 6, 31, 3, 0, TAU); c.arc(cx + 6, 31, 3, 0, TAU); c.fill();
    }, { pad: 4 });
  }

  function roomBackdrop(worldIdx) {
    return A.bake('room_' + worldIdx, W, H, function (c) {
      var wd = E.WORLDS[worldIdx] || E.WORLDS[0];
      var g = c.createLinearGradient(0, 0, 0, 196);
      g.addColorStop(0, A.shade(wd.color, -0.35));
      g.addColorStop(1, A.shade(wd.color, 0.18));
      c.fillStyle = g;
      c.fillRect(0, 0, W, 196);

      // Striped cafeteria awning at very top
      for (var i = 0; i < 20; i++) {
        c.fillStyle = i % 2 === 0 ? wd.color : '#fff8eb';
        c.fillRect(i * 64, 0, 64, 18);
      }
      c.fillStyle = INK;
      c.fillRect(0, 18, W, 4);

      // Serving Window sill
      c.fillStyle = '#5c3a21';
      c.fillRect(0, 178, W, 18);
      c.fillStyle = INK;
      c.fillRect(0, 176, W, 4);
      c.fillRect(0, 194, W, 4);

      // Outer floor margin
      c.fillStyle = '#251e4d';
      c.fillRect(0, 196, W, H - 196);

      // Checkerboard kitchen floor
      rr(c, E.GX - 6, E.GY - 6, E.COLS * TILE + 12, E.ROWS * TILE + 12, 20);
      strokeFill(c, INK, 4);
      for (var r = 0; r < E.ROWS; r++) {
        for (var col = 0; col < E.COLS; col++) {
          c.fillStyle = (r + col) % 2 === 0 ? wd.floorA : wd.floorB;
          c.fillRect(E.GX + col * TILE, E.GY + r * TILE, TILE, TILE);
        }
      }
    });
  }

  /* -------------------------------------------- State & UI Screens */
  var screen = 'title';
  var menuPlayers = 1;
  var world = E.create(0, { players: 1, difficulty: save.difficulty, dda: dda.level });
  var roundOpen = false;
  var act1Queued = false, act2Queued = false, dash1Queued = false, dash2Queued = false, botQueued = false;

  function syncTopCounters() {
    var starsStr = E.totalStars(save) + '/36';
    var coinsStr = Kit.fmt(save.coins);
    $('titleStars').querySelector('b').textContent = starsStr;
    $('titleCoins').querySelector('b').textContent = coinsStr;
    $('mapStars').querySelector('b').textContent = starsStr;
    $('shopCoins').querySelector('b').textContent = coinsStr;

    var pills = document.querySelectorAll('.diff-pill');
    for (var i = 0; i < pills.length; i++) {
      pills[i].classList.toggle('active', pills[i].getAttribute('data-diff') === save.difficulty);
    }
    $('mapModeTxt').textContent = menuPlayers === 2 ? 'لاعبان' : 'لاعب واحد';
  }

  function showScreen(next) {
    screen = next;
    $('scrTitle').hidden = next !== 'title';
    $('scrMap').hidden = next !== 'map';
    $('scrShop').hidden = next !== 'shop';
    $('scrPause').hidden = next !== 'pause';
    $('scrResult').hidden = next !== 'result';
    $('hud').hidden = next !== 'play';
    if (next === 'play') $('btnBot').hidden = world.players !== 1;
    syncTopCounters();
    dirty = true;
  }

  function beginTelemetryRound() {
    var roundId = (world.players === 2 ? 'rk_coop_' : 'rk_') + (world.levelIndex + 1);
    Kit.stats.round(roundId);
    roundOpen = true;
  }

  function closeTelemetryRound(outcome, includeScore) {
    if (!roundOpen) return;
    roundOpen = false;
    if (includeScore) Kit.stats.end(outcome, world.coins);
    else Kit.stats.end(outcome);
  }

  function startGame(lvIdx, players) {
    closeTelemetryRound('quit', world.players === 1);
    world = E.create(lvIdx, {
      players: players || 1,
      difficulty: save.difficulty,
      dda: dda.level
    });
    act1Queued = act2Queued = dash1Queued = dash2Queued = botQueued = false;
    fx.clear();
    Kit.keys.reset();
    beginTelemetryRound();
    showScreen('play');
    try { canvas.focus(); } catch (e) { /* ignore */ }
  }

  function pauseGame() {
    if (screen !== 'play') return;
    Kit.keys.reset();
    showScreen('pause');
  }

  function resumeGame() {
    if (screen !== 'pause') return;
    Kit.keys.reset();
    showScreen('play');
  }

  function restartGame() {
    startGame(world.levelIndex, world.players);
  }

  function buildMapUI() {
    var root = $('worlds');
    root.textContent = '';
    for (var wIdx = 0; wIdx < E.WORLDS.length; wIdx++) {
      var wd = E.WORLDS[wIdx];
      var box = document.createElement('div');
      box.className = 'world-box';
      var head = document.createElement('div');
      head.className = 'world-head';
      var titleSpan = document.createElement('span');
      var dot = document.createElement('i');
      dot.className = 'world-dot';
      dot.style.background = wd.color;
      titleSpan.appendChild(dot);
      titleSpan.appendChild(document.createTextNode((wIdx + 1) + '. ' + wd.name));
      head.appendChild(titleSpan);
      box.appendChild(head);

      var row = document.createElement('div');
      row.className = 'lv-row';
      for (var sub = 0; sub < 3; sub++) {
        (function (idx) {
          var lv = E.LEVELS[idx];
          var st = save.lv[idx];
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'lv-btn';
          var idSpan = document.createElement('span');
          idSpan.className = 'lv-id';
          idSpan.dir = 'ltr';
          idSpan.textContent = lv.id;
          var nmSpan = document.createElement('span');
          nmSpan.className = 'lv-name';
          nmSpan.textContent = lv.name;
          var stSpan = document.createElement('span');
          stSpan.className = 'lv-stars';
          for (var k = 0; k < 3; k++) {
            var sEl = document.createElement('span');
            if (k < st.s) sEl.className = 'lit';
            sEl.textContent = '★';
            stSpan.appendChild(sEl);
          }
          b.appendChild(idSpan);
          b.appendChild(nmSpan);
          b.appendChild(stSpan);
          b.addEventListener('click', function () {
            sfx('select');
            startGame(idx, menuPlayers);
          });
          row.appendChild(b);
        })(wIdx * 3 + sub);
      }
      box.appendChild(row);
      root.appendChild(box);
    }
  }

  function buildShopUI() {
    function fillShelf(elId, list, cat, ownedArr, equippedIdx) {
      var shelf = $(elId);
      shelf.textContent = '';
      for (var i = 0; i < list.length; i++) {
        (function (idx) {
          var item = list[idx];
          var owned = !!ownedArr[idx];
          var active = equippedIdx === idx;
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'tile' + (active ? ' active' : '');
          var sw = document.createElement('div');
          sw.className = 'tile-swatch';
          sw.style.background = item.color;
          var nm = document.createElement('div');
          nm.className = 'tile-name';
          nm.textContent = item.name;
          var tag = document.createElement('div');
          tag.className = 'tile-tag';
          tag.textContent = active ? 'مُجهّز ✓' : owned ? 'اختر' : item.cost + ' عملة';
          b.appendChild(sw);
          b.appendChild(nm);
          b.appendChild(tag);
          b.addEventListener('click', function () {
            var res = E.buyOrEquip(save, cat, idx);
            if (!res.ok) {
              sfx('error');
              return;
            }
            if (res.action === 'buy') {
              sfx('coin', 3);
              fx.burst(W / 2, H / 2, { count: 18, colors: ['#ffd166', '#3ddc84', '#38bdf8'] });
              camShake.add(4);
            } else {
              sfx('select');
            }
            persist();
            syncTopCounters();
            buildShopUI();
            dirty = true;
          });
          shelf.appendChild(b);
        })(i);
      }
    }
    fillShelf('shelfAprons', E.APRONS, 'apron', save.aprons, save.apron);
    fillShelf('shelfHats', E.HATS, 'hat', save.hats, save.hat);
  }

  function handleEvents(evList) {
    for (var i = 0; i < evList.length; i++) {
      var ev = evList[i];
      if (ev.t === 'pickup' || ev.t === 'place' || ev.t === 'putback' || ev.t === 'beltMove') {
        sfx('tap');
      } else if (ev.t === 'cookStart') {
        sfx('pop', 0.35);
      } else if (ev.t === 'cooked') {
        sfx('chime', 1);
        fx.burst(ev.x, ev.y - 20, { count: 8, colors: ['#ffd166', '#3ddc84'] });
        A.pop('جاهز! ✨', ev.x, ev.y - 34, { color: '#3ddc84', size: 22 });
      } else if (ev.t === 'combine') {
        sfx('pop', 0.8);
        fx.burst(ev.x, ev.y - 12, { count: 16, colors: ['#ffd166', '#38bdf8', '#ff4d6d', '#3ddc84'] });
        A.pop('دمج رائع!', ev.x, ev.y - 36, { color: '#ffd166', size: 24 });
      } else if (ev.t === 'warp') {
        sfx('whoosh', 0.7);
        fx.burst(ev.x, ev.y, { count: 14, colors: ['#a855f7', '#00f5d4', '#ffffff'] });
      } else if (ev.t === 'dash' || ev.t === 'botGo') {
        sfx('whoosh', 0.5);
        fx.burst(ev.x, ev.y + 10, { count: 8, colors: ['#38bdf8', '#ffffff'] });
      } else if (ev.t === 'botDrop' || ev.t === 'botRescue') {
        sfx('chime', 2);
        A.pop('تفضل يا شيف! 🤖', ev.x, ev.y - 36, { color: '#00f5d4', size: 22 });
      } else if (ev.t === 'serve') {
        Kit.track.hit();
        sfx('impact', 0.45);
        sfx('streak', Math.min(10, ev.streak));
        sfx('coin', Math.min(5, ev.mult + 1));
        fx.burst(330 + ev.slot * 310, 110, { count: 24, colors: ['#ffd166', '#3ddc84', '#38bdf8', '#ff4d6d'] });
        camShake.add(5);
        A.pop('+' + ev.coins + (ev.mult > 1 ? ' ×' + ev.mult : ''), 330 + ev.slot * 310, 128, { color: '#ffd166', size: 30 });
      } else if (ev.t === 'warn') {
        sfx('tap');
      } else if (ev.t === 'burn') {
        Kit.track.miss();
        sfx('error');
        fx.burst(ev.x, ev.y - 18, { count: 10, colors: ['#475569', '#94a3b8'] });
      } else if (ev.t === 'expire') {
        Kit.track.miss();
        sfx('error');
      } else if (ev.t === 'toss') {
        sfx('pop', 0.25);
      } else if (ev.t === 'hint') {
        sfx('error');
      } else if (ev.t === 'finish') {
        onRoundFinish();
      }
    }
  }

  function onRoundFinish() {
    var isNewBest = E.recordRound(save, world);
    persist();
    if (world.players === 1) {
      dda.result(Kit.clamp(world.stars / 3, 0, 1));
      closeTelemetryRound(world.stars >= 1 ? 'win' : 'lose', true);
    } else {
      closeTelemetryRound('end', false);
    }

    $('resBest').hidden = !isNewBest;
    $('resTitle').textContent = world.stars >= 2 ? 'أبدعت يا شيف!' : world.stars === 1 ? 'أحسنت!' : 'حاول مجدداً!';
    var svgs = $('resStars').querySelectorAll('svg');
    for (var i = 0; i < 3; i++) svgs[i].classList.toggle('on', i < world.stars);
    $('resServed').textContent = String(world.served);
    $('resStreak').textContent = '×' + Math.max(1, world.bestStreak >= 4 ? 3 : world.bestStreak >= 2 ? 2 : 1);
    $('resCoins').textContent = '+' + Kit.fmt(world.coins);

    if (world.stars >= 1) sfx('levelUp'); else sfx('back');
    showScreen('result');
  }

  /* -------------------------------------------- Button & Input Bindings */
  $('btnPlay').addEventListener('click', function () { sfx('select'); menuPlayers = 1; startGame(0, 1); });
  $('btnCoop').addEventListener('click', function () { sfx('select'); menuPlayers = 2; startGame(0, 2); });
  $('btnLevels').addEventListener('click', function () { sfx('select'); buildMapUI(); showScreen('map'); });
  $('btnShop').addEventListener('click', function () { sfx('select'); buildShopUI(); showScreen('shop'); });

  var diffBtns = document.querySelectorAll('.diff-pill');
  for (var di = 0; di < diffBtns.length; di++) {
    diffBtns[di].addEventListener('click', function () {
      var d = this.getAttribute('data-diff');
      if (E.DIFFICULTIES[d]) {
        save.difficulty = d;
        sfx('tap');
        persist();
        syncTopCounters();
      }
    });
  }

  $('mapHome').addEventListener('click', function () { sfx('back'); showScreen('title'); });
  $('mapMode').addEventListener('click', function () {
    menuPlayers = menuPlayers === 1 ? 2 : 1;
    sfx('tap');
    syncTopCounters();
  });
  $('shopBack').addEventListener('click', function () { sfx('back'); showScreen('title'); });

  $('btnPause').addEventListener('click', function () { sfx('tap'); pauseGame(); });
  $('btnBot').addEventListener('click', function () { botQueued = true; });
  $('btnResume').addEventListener('click', function () { sfx('select'); resumeGame(); });
  $('btnRestart').addEventListener('click', function () { sfx('select'); restartGame(); });
  $('btnMap').addEventListener('click', function () {
    sfx('back');
    closeTelemetryRound('quit', world.players === 1);
    buildMapUI();
    showScreen('map');
  });
  $('btnPauseHome').addEventListener('click', function () {
    sfx('back');
    closeTelemetryRound('quit', world.players === 1);
    showScreen('title');
  });

  $('resNext').addEventListener('click', function () {
    sfx('select');
    startGame((world.levelIndex + 1) % E.LEVELS.length, world.players);
  });
  $('resAgain').addEventListener('click', function () {
    sfx('select');
    startGame(world.levelIndex, world.players);
  });
  $('resMap').addEventListener('click', function () {
    sfx('select');
    buildMapUI();
    showScreen('map');
  });

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    var code = e.code;

    if (screen === 'title') {
      if (code === 'Enter') { sfx('select'); startGame(0, 1); }
      return;
    }
    if (screen === 'map' || screen === 'shop') {
      if (code === 'Escape') { sfx('back'); showScreen('title'); }
      return;
    }
    if (screen === 'pause') {
      if (code === 'Escape' || code === 'KeyP') { sfx('select'); resumeGame(); }
      else if (code === 'KeyR') { sfx('select'); restartGame(); }
      return;
    }
    if (screen === 'result') {
      if (code === 'Enter') { sfx('select'); startGame((world.levelIndex + 1) % E.LEVELS.length, world.players); }
      else if (code === 'KeyR') { sfx('select'); startGame(world.levelIndex, world.players); }
      else if (code === 'Escape') { sfx('back'); buildMapUI(); showScreen('map'); }
      return;
    }
    if (screen === 'play') {
      if (code === 'Escape' || code === 'KeyP') { sfx('tap'); pauseGame(); return; }
      if (code === 'KeyR') { sfx('select'); restartGame(); return; }
      if (world.players === 1) {
        if (code === 'Space' || code === 'Enter') act1Queued = true;
        else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyQ' || code === 'KeyE') dash1Queued = true;
        else if (code === 'KeyF') botQueued = true;
      } else {
        if (code === 'Space') act1Queued = true;
        else if (code === 'ShiftLeft' || code === 'KeyQ' || code === 'KeyE') dash1Queued = true;
        else if (code === 'Enter') act2Queued = true;
        else if (code === 'ShiftRight' || code === 'Slash') dash2Queued = true;
      }
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play') return;
    if (e.button === 2) {
      dash1Queued = true;
      return;
    }
    if (world.players === 1 && e.button === 0) {
      var pt = view.toLogical(e.clientX, e.clientY);
      if (pt.y >= E.GY - 24) {
        world.ev.length = 0;
        E.clickAt(world, 0, pt.x, pt.y);
        handleEvents(world.ev);
        dirty = true;
      }
    }
  });

  /* -------------------------------------------- Simulation & Render Loop */
  function readInputs() {
    var K = Kit.keys;
    if (world.players === 1) {
      var mx1 = (K.anyDown(['KeyD', 'ArrowRight']) ? 1 : 0) - (K.anyDown(['KeyA', 'ArrowLeft']) ? 1 : 0);
      var my1 = (K.anyDown(['KeyS', 'ArrowDown']) ? 1 : 0) - (K.anyDown(['KeyW', 'ArrowUp']) ? 1 : 0);
      var inp = { mx: mx1, my: my1, act: act1Queued, dash: dash1Queued, bot: botQueued };
      act1Queued = dash1Queued = botQueued = false;
      return [inp];
    }
    var p1x = (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0);
    var p1y = (K.down('KeyS') ? 1 : 0) - (K.down('KeyW') ? 1 : 0);
    var p2x = (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0);
    var p2y = (K.down('ArrowDown') ? 1 : 0) - (K.down('ArrowUp') ? 1 : 0);
    var pair = [
      { mx: p1x, my: p1y, act: act1Queued, dash: dash1Queued },
      { mx: p2x, my: p2y, act: act2Queued, dash: dash2Queued }
    ];
    act1Queued = act2Queued = dash1Queued = dash2Queued = botQueued = false;
    return pair;
  }

  function update(dt) {
    if (screen === 'play') {
      world.ev.length = 0;
      E.step(world, dt, readInputs());
      handleEvents(world.ev);
      if (world.sousBot) {
        var bBtn = $('btnBot');
        var cooling = world.sousBot.state !== 'ready';
        bBtn.classList.toggle('cooling', cooling);
        $('botLabel').textContent = cooling ? 'يشحن... ' + Math.ceil(world.sousBot.cd) : 'المساعد الآلي';
      }
      fx.update(dt);
      camShake.update(dt);
      A.pop.update(dt);
      dirty = true;
    } else if (screen !== 'pause') {
      if (fx.list.length > 0 || camShake.power > 0) {
        fx.update(dt);
        camShake.update(dt);
        dirty = true;
      }
      A.pop.update(dt);
    }
    Kit.keys.endFrame();
  }

  function drawServingWindow() {
    for (var i = 0; i < world.orders.length; i++) {
      var ord = world.orders[i];
      var sx = 330 + ord.slot * 310;
      var bob = calm() ? 0 : Math.sin(world.time * 4.2 + ord.slot * 1.7) * 4;
      var blink = !calm() && A.blink(BLINK_SLOTS[ord.slot]) > 0.5;

      // VIP golden halo
      if (ord.vip) {
        ctx.save();
        ctx.beginPath(); ctx.arc(sx - 66, 118 + bob, 44, 0, TAU);
        ctx.fillStyle = 'rgba(255, 209, 102, 0.38)'; ctx.fill();
        ctx.restore();
      }

      var cSpr = customerSprite(ord.customer, blink);
      A.blit(ctx, cSpr, sx - 66, 120 + bob);
      if (ord.vip) drawText(ctx, '👑 ×2', sx - 66, 68 + bob, 16, '#ffd166');

      // Visual Recipe Bubble right beside customer
      var bx = sx - 16, by = 34, bw = 166, bh = 128;
      ctx.save();
      rr(ctx, bx, by, bw, bh, 20);
      strokeFill(ctx, ord.vip ? '#fffbeb' : '#ffffff', 3.5);

      // Finished dish icon + Arabic name
      var dSpr = itemSprite(ord.dish);
      A.blit(ctx, dSpr, bx + bw - 34, by + 34, { sx: 0.95, sy: 0.95 });
      drawText(ctx, E.DISHES[ord.dish].name, bx + 66, by + 32, 16, '#ffffff');

      // 2-3 clear step icons equation bar
      rr(ctx, bx + 10, by + 62, bw - 20, 38, 12);
      ctx.fillStyle = '#f1f5f9'; ctx.fill();
      var steps = ord.steps;
      var stepStart = bx + bw / 2 - ((steps.length - 1) * 24);
      for (var si = 0; si < steps.length; si++) {
        var ic = miniIconSprite(steps[si]);
        var ix = stepStart + si * 48;
        A.blit(ctx, ic, ix, by + 81, { sx: 0.68, sy: 0.68 });
        if (si + 1 < steps.length) {
          var sym = (steps[si + 1] === 'blender' || steps[si + 1] === 'fryer' || steps[si + 1] === 'oven') ? '←' : '+';
          drawText(ctx, sym, ix + 24, by + 81, 15, '#ffd166');
        }
      }

      // Patience bar
      var patRatio = Kit.clamp(ord.patience / ord.maxPatience, 0, 1);
      rr(ctx, bx + 14, by + bh - 18, bw - 28, 10, 5);
      ctx.fillStyle = '#e2e8f0'; ctx.fill();
      rr(ctx, bx + 14, by + bh - 18, (bw - 28) * patRatio, 10, 5);
      ctx.fillStyle = patRatio > 0.5 ? '#22c55e' : patRatio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHudMeters() {
    // Left meter: Coins + 3-Star Goals + Fever Streak
    ctx.save();
    rr(ctx, 82, 12, 178, 72, 18);
    strokeFill(ctx, 'rgba(27, 22, 64, 0.85)', 3);
    drawText(ctx, 'العملات: ' + world.coins, 171, 34, 20, '#ffd166');
    var gMax = world.goals[2];
    var pRatio = Kit.clamp(world.coins / gMax, 0, 1);
    rr(ctx, 96, 54, 150, 14, 7);
    ctx.fillStyle = '#334155'; ctx.fill();
    rr(ctx, 96, 54, 150 * pRatio, 14, 7);
    ctx.fillStyle = '#3ddc84'; ctx.fill();
    for (var gi = 0; gi < 3; gi++) {
      var gx = 96 + 150 * (world.goals[gi] / gMax);
      drawText(ctx, '★', gx, 60, 15, world.coins >= world.goals[gi] ? '#ffd166' : '#94a3b8');
    }

    if (world.streak >= 2) {
      rr(ctx, 82, 92, 178, 40, 14);
      strokeFill(ctx, world.fever ? '#ff9f1c' : '#38bdf8', 3);
      drawText(ctx, world.fever ? 'حماس تيربو ×3 🔥' : 'سلسلة حماس ×2 ⚡', 171, 112, 17, '#ffffff');
    }

    // Right meter: Stage & Timer (left of mute button)
    rr(ctx, W - 216, 12, 152, 74, 18);
    strokeFill(ctx, 'rgba(27, 22, 64, 0.85)', 3);
    drawText(ctx, world.id + ' ' + E.WORLDS[world.world].name, W - 140, 32, 15, '#bae6fd');
    var secs = Math.ceil(world.timeLeft);
    drawText(ctx, '⏱ ' + secs, W - 140, 62, 26, secs <= 10 ? '#ff5d8f' : '#ffffff');
    ctx.restore();
  }

  function drawWorld() {
    var bg = roomBackdrop(world.world);
    if (bg.canvas) ctx.drawImage(bg.canvas, 0, 0, W, H);

    drawServingWindow();

    // Floor pads (boost & sousPad)
    for (var fi = 0; fi < world.floorPads.length; fi++) {
      var fp = world.floorPads[fi];
      A.blit(ctx, floorPadSprite(fp), fp.x, fp.y);
    }

    // Highlighted prompts for Chef 1 & Chef 2
    var prompts = [];
    for (var pi = 0; pi < world.chefs.length; pi++) {
      var pr = E.promptFor(world, pi);
      if (pr) prompts.push({ p: pr, ci: pi });
    }

    // Stations & placed/cooking items
    for (var i = 0; i < world.stations.length; i++) {
      var st = world.stations[i];
      var wob = (!calm() && st.wobble > 0) ? Math.sin(st.wobble * 28) * 0.12 : 0;
      A.blit(ctx, stationSprite(st, world.world), st.x, st.y, { rot: wob, sx: 1 + Math.abs(wob) * 0.4, sy: 1 - Math.abs(wob) * 0.3 });

      if (st.item) {
        A.blit(ctx, itemSprite(st.item.kind), st.x, st.y - 6);
      } else if (st.prep) {
        A.blit(ctx, itemSprite(st.prep), st.x, st.y - 4, { sx: 0.85, sy: 0.85 });
      } else if (st.cook && st.cook.state !== 'idle') {
        var ap = E.APPLIANCES[st.type], ck = st.cook;
        var showKind = ck.state === 'burnt' ? 'burnt' : ck.state === 'cooking' ? ap.inKind : ap.outKind;
        A.blit(ctx, itemSprite(showKind), st.x, st.y - 6);

        // Progress or warning badge above appliance
        if (ck.state === 'cooking') {
          rr(ctx, st.x - 28, st.y - 44, 56, 10, 5);
          strokeFill(ctx, '#1e293b', 2);
          rr(ctx, st.x - 26, st.y - 42, 52 * ck.prog, 6, 3);
          ctx.fillStyle = world.fever ? '#ffd166' : '#3ddc84';
          ctx.fill();
        } else if (ck.state === 'done') {
          drawText(ctx, 'جاهز ✓', st.x, st.y - 40, 15, '#3ddc84');
        } else if (ck.state === 'warning') {
          var pulse = calm() ? 1 : (1 + Math.sin(world.time * 16) * 0.12);
          ctx.save();
          ctx.translate(st.x, st.y - 42);
          ctx.scale(pulse, pulse);
          drawText(ctx, 'سريع! 🔥', 0, 0, 17, '#ff9f1c');
          ctx.restore();
        } else if (ck.state === 'burnt') {
          drawText(ctx, 'نظّف! 💨', st.x, st.y - 40, 16, '#cbd5e1');
        }
      }
    }

    // Glowing target ring + floating action pill
    for (var qi = 0; qi < prompts.length; qi++) {
      var pst = prompts[qi].p.station;
      var ringCol = prompts[qi].ci === 1 ? '#38bdf8' : '#ffd166';
      ctx.save();
      rr(ctx, pst.x - TILE / 2 - 2, pst.y - TILE / 2 - 2, TILE + 4, TILE + 4, 18);
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = ringCol;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, prompts[qi].p.label, pst.x, pst.y - 48, 16, ringCol);
    }

    // Mini Sous-Bot
    if (world.sousBot) {
      var bot = world.sousBot;
      A.shadow(ctx, bot.x - 26, bot.y - 26, 52, 52, 0.38);
      A.blit(ctx, sousBotSprite(), bot.x, bot.y - 4);
      if (bot.state === 'go' && bot.gift) {
        A.blit(ctx, itemSprite(bot.gift), bot.x, bot.y - 38, { sx: 0.78, sy: 0.78 });
      }
    }

    // Chefs
    for (var ci = 0; ci < world.chefs.length; ci++) {
      var ch = world.chefs[ci];
      var bobY = (!calm() && (ch.vx || ch.vy)) ? Math.sin(world.time * 18 + ci) * 3 : 0;
      A.shadow(ctx, ch.x - 28, ch.y - 26, 56, 54, 0.45);
      A.blit(ctx, chefSprite(save.apron, save.hat, ci), ch.x, ch.y - 10 + bobY);
      if (world.players === 2) {
        drawText(ctx, ci === 0 ? 'طاهي 1' : 'طاهي 2', ch.x, ch.y + 34, 14, ci === 0 ? '#ffd166' : '#38bdf8');
      }
      if (ch.held) {
        A.blit(ctx, itemSprite(ch.held.kind), ch.x + ch.faceX * 16, ch.y - 44 + bobY, { sx: 0.96, sy: 0.96 });
      }
    }

    // Flying Burger-Cannon shots!
    for (var si = 0; si < world.shots.length; si++) {
      var sh = world.shots[si];
      var u = Kit.clamp(sh.t / sh.dur, 0, 1);
      var sx = Kit.lerp(sh.x0, sh.x1, u);
      var sy = Kit.lerp(sh.y0, sh.y1, u) - Math.sin(u * Math.PI) * 90;
      var sc = 1 + Math.sin(u * Math.PI) * 0.45;
      A.blit(ctx, itemSprite(sh.dish), sx, sy, { sx: sc, sy: sc, rot: u * 0.6 });
    }

    // Non-silent friendly guidance bubbles + target station arrow!
    for (var hi = 0; hi < world.hints.length; hi++) {
      var h = world.hints[hi];
      var alpha = Kit.clamp(h.life / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (h.targetX != null && h.targetY != null) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 5;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(h.x, h.y + 16);
        ctx.lineTo(h.targetX, h.targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(h.targetX, h.targetY, 44, 0, TAU);
        ctx.stroke();
      }
      ctx.font = '800 18px Fredoka';
      var tw = Math.max(150, ctx.measureText(h.text).width + 32);
      var by = clampY(h.y);
      var bx = Kit.clamp(h.x, tw / 2 + 16, W - tw / 2 - 16);
      rr(ctx, bx - tw / 2, by - 22, tw, 44, 16);
      strokeFill(ctx, '#fff8eb', 3.5);
      drawText(ctx, h.text, bx, by, 18, '#ff9f1c');
      ctx.restore();
    }

    fx.draw(ctx);
    A.pop.draw(ctx);
    if (screen === 'play' || screen === 'pause' || screen === 'result') drawHudMeters();
  }

  function clampY(y) {
    return y < 44 ? 44 : y > H - 44 ? H - 44 : y;
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    if (!dirty && calm()) return;
    dirty = false;

    ctx.save();
    if (screen === 'play' && !calm()) ctx.translate(camShake.x, camShake.y);
    drawWorld();
    ctx.restore();
  }

  /* -------------------------------------------- Public Test & Scenario API */
  window.__game = {
    get state() {
      return {
        screen: screen,
        paused: screen === 'pause',
        id: world.id,
        levelIndex: world.levelIndex,
        difficulty: world.difficulty,
        players: world.players,
        time: world.time,
        timeLeft: world.timeLeft,
        atStart: world.atStart,
        served: world.served,
        coins: world.coins,
        score: world.score,
        streak: world.streak,
        fever: world.fever,
        stars: world.stars,
        goals: world.goals,
        chefs: world.chefs.map(function (c) {
          return { x: c.x, y: c.y, vx: c.vx, vy: c.vy, held: c.held, moved: c.moved, dashT: c.dashT };
        }),
        orders: world.orders.map(function (o) {
          return { id: o.id, slot: o.slot, dish: o.dish, customer: o.customer, vip: o.vip, patience: o.patience, maxPatience: o.maxPatience };
        }),
        hints: world.hints,
        sousBot: world.sousBot,
        fx: calm() ? 0 : fx.list.length,
        shake: calm() ? 0 : camShake.power
      };
    },
    get stations() {
      return world.stations;
    },
    get save() {
      return save;
    },
    point: function (lx, ly) {
      var r = canvas.getBoundingClientRect();
      return { x: r.left + lx * view.scale, y: r.top + ly * view.scale };
    }
  };

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () {
      if (screen === 'play') pauseGame();
    }
  });
  syncTopCounters();
  showScreen('title');
  A.loop(update, render);
  Kit.ready();
})();

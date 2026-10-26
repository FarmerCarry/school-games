/* جزيرة الفوضى — physics, islands, disasters and bots.
   Pure simulation: no DOM, no Kit, no drawing required to run. */
(function (CI) {
  'use strict';

  var W = CI.W = 1280, H = CI.H = 720;
  var PW = 32, PH = 48;
  var GRAV = 2100, JUMP = -700, ACC = 3200, MAX = 340;
  var INTER = 8 * 60, DANGER = 45 * 60, STAMP = 7 * 60;
  var TELL = 0.6;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }

  var TOP = 1, SOLID = 2, GROUND = 4, SPINE = 8;

  function plat(x, y, w, h, flags, extra) {
    var p = {
      x: x, y: y, w: w, h: h,
      one: !!(flags & TOP), solid: !!(flags & SOLID),
      ground: !!(flags & GROUND), spine: !!(flags & SPINE),
      vx: 0, minX: x, maxX: x, shake: 0, gone: 0
    };
    if (extra) {
      if (extra.vx) { p.vx = extra.vx; p.minX = extra.minX; p.maxX = extra.maxX; }
    }
    return p;
  }

  /* Hand-authored arenas. Every island has a spine stair the jump height can
     climb, and that stair stays above the highest jelly line (y = 320). */
  var ISLANDS = CI.ISLANDS = [
    { id: 'beach', name: 'قرية الشاطئ', sky: '#8fd6ff', ground: '#f6d38a', accent: '#ff8c42',
      plats: [
        plat(0, 640, 340, 90, GROUND),
        plat(450, 640, 830, 90, GROUND | SPINE),
        plat(470, 552, 280, 16, TOP | SPINE),
        plat(478, 464, 280, 16, TOP | SPINE),
        plat(466, 376, 290, 16, TOP | SPINE),
        plat(458, 288, 320, 16, TOP | SPINE),
        plat(36, 508, 140, 132, SOLID),
        plat(1100, 486, 150, 154, SOLID),
        plat(760, 508, 110, 14, TOP),
        plat(900, 400, 120, 14, TOP, { vx: 70, minX: 840, maxX: 1100 })
      ],
      spots: [80, 200, 300, 520, 700, 980, 1140] },
    { id: 'candy', name: 'مدينة الحلوى', sky: '#ffd0ef', ground: '#ff8ad4', accent: '#ff5d8f',
      plats: [
        plat(0, 640, 760, 90, GROUND | SPINE),
        plat(860, 640, 420, 90, GROUND),
        plat(520, 552, 260, 16, TOP | SPINE),
        plat(530, 464, 260, 16, TOP | SPINE),
        plat(512, 376, 270, 16, TOP | SPINE),
        plat(500, 288, 300, 16, TOP | SPINE),
        plat(40, 500, 150, 140, SOLID),
        plat(1040, 470, 170, 170, SOLID),
        plat(180, 500, 120, 14, TOP),
        plat(250, 390, 130, 14, TOP, { vx: -60, minX: 160, maxX: 420 })
      ],
      spots: [90, 220, 400, 640, 800, 980, 1120] },
    { id: 'toy', name: 'مصنع الألعاب', sky: '#d7e4ff', ground: '#5b8def', accent: '#ffd23f',
      plats: [
        plat(0, 640, 520, 90, GROUND | SPINE),
        plat(640, 640, 640, 90, GROUND),
        plat(180, 552, 270, 16, TOP | SPINE),
        plat(190, 464, 270, 16, TOP | SPINE),
        plat(170, 376, 280, 16, TOP | SPINE),
        plat(160, 288, 310, 16, TOP | SPINE),
        plat(700, 500, 160, 140, SOLID),
        plat(1040, 460, 150, 180, SOLID),
        plat(780, 390, 130, 14, TOP, { vx: 80, minX: 700, maxX: 1080 }),
        plat(430, 470, 120, 14, TOP, { vx: -50, minX: 360, maxX: 600 })
      ],
      spots: [60, 240, 400, 600, 780, 1000, 1160] },
    { id: 'snow', name: 'مخيم الثلج', sky: '#e7f6ff', ground: '#f4fbff', accent: '#7ec8ff',
      plats: [
        plat(0, 640, 400, 90, GROUND),
        plat(500, 640, 780, 90, GROUND | SPINE),
        plat(540, 552, 280, 16, TOP | SPINE),
        plat(548, 464, 280, 16, TOP | SPINE),
        plat(536, 376, 290, 16, TOP | SPINE),
        plat(524, 288, 320, 16, TOP | SPINE),
        plat(50, 512, 150, 128, SOLID),
        plat(1080, 490, 160, 150, SOLID),
        plat(860, 430, 140, 14, TOP, { vx: 55, minX: 800, maxX: 1040 })
      ],
      spots: [90, 250, 380, 620, 800, 1000, 1160] },
    { id: 'sky', name: 'قلعة السماء', sky: '#c9b6ff', ground: '#f7f4ff', accent: '#ffe66d',
      plats: [
        plat(180, 640, 940, 90, GROUND | SPINE),
        plat(360, 552, 280, 16, TOP | SPINE),
        plat(372, 464, 280, 16, TOP | SPINE),
        plat(350, 376, 300, 16, TOP | SPINE),
        plat(340, 270, 340, 16, TOP | SPINE),
        plat(860, 470, 180, 170, SOLID),
        plat(80, 500, 120, 14, TOP, { vx: 40, minX: 40, maxX: 240 }),
        plat(1040, 420, 130, 14, TOP, { vx: -65, minX: 980, maxX: 1160 })
      ],
      spots: [240, 400, 560, 720, 900, 1080, 300] }
  ];

  function byIsland(id) {
    if (typeof id === 'number') return ISLANDS[id] || ISLANDS[0];
    for (var i = 0; i < ISLANDS.length; i++) if (ISLANDS[i].id === id) return ISLANDS[i];
    return ISLANDS[0];
  }

  var NAMES = CI.NAMES = ['لولو', 'فلفل', 'دبدوب', 'نورة', 'كريم', 'سوسو', 'مازن'];
  var HATS = CI.HATS = ['cap', 'flower', 'prop', 'cone', 'star', 'bucket', 'crown'];
  var COLORS = CI.COLORS = ['#ff5d8f', '#ffb703', '#4cc9f0', '#7cf29a', '#c77dff', '#ff8c42', '#5ee0c5', '#ffe66d'];

  function topSpine(w) {
    var best = null;
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (!p.spine || p.gone || p.solid) continue;
      if (!best || p.y < best.y) best = p;
    }
    return best;
  }
  function spineGround(w) {
    var best = null;
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (!p.spine || !p.ground || p.gone) continue;
      if (!best || p.w > best.w) best = p;
    }
    return best;
  }
  function surfaceAt(plats, x) {
    var best = null;
    for (var i = 0; i < plats.length; i++) {
      var p = plats[i];
      if (p.gone) continue;
      if (x < p.x + 10 || x > p.x + p.w - 10) continue;
      if (!best || p.y > best.y) best = p;
    }
    return best;
  }

  function refugeFree(w, plat, x, r) {
    if (!plat) return true;
    var extra = { k: 'meteor', x: x, r: r };
    var any = false;
    for (var s = plat.x + 24; s <= plat.x + plat.w - 24; s += 16) {
      var clear = pointClear(w, s, extra);
      if (!clear) continue;
      any = true;
      for (var t = plat.x + 24; t <= plat.x + plat.w - 24; t += 16) {
        if (pointClear(w, t, extra)) continue;
        if (Math.abs(t - s) > 150) return false;
      }
    }
    return any;
  }

  function needsHeight(w) {
    return w.has('jelly') || w.has('sauce') || w.has('bowl');
  }

  /* Standing in a house's awning, not up on the roof. Meteors miss this spot. */
  function underRoof(w, a) {
    var cx = a.x + a.w / 2;
    var feet = a.y + a.h;
    for (var i = 0; i < w.plats.length; i++) {
      var h = w.plats[i];
      if (!h.solid || h.gone || h.h < 40) continue;
      if (feet < h.y + 8) continue;
      if (cx >= h.x - 52 && cx <= h.x + 14) return true;
      if (cx >= h.x + h.w - 14 && cx <= h.x + h.w + 52) return true;
    }
    return false;
  }

  function spawn(w, h) {
    if (h.tell == null) h.tell = 0;
    if ((h.k === 'meteor' || h.k === 'zap' || h.k === 'foot') && h.tell < TELL) h.tell = TELL;
    if (h.tell > 0) w.minTell = Math.min(w.minTell, h.tell);
    h.age = 0; h.live = 0; h.hit = 0;
    w.haz.push(h);
    if (w.haz.length > 28) w.haz.splice(0, w.haz.length - 28);
    return h;
  }

  function columnX(w, r) {
    var plat = topSpine(w);
    for (var t = 0; t < 12; t++) {
      var x = 80 + w.rnd() * (W - 160);
      if (refugeFree(w, plat, x, r)) return x;
    }
    return null;
  }

  function pop(w, a, why) {
    if (!a || a.mode !== 'run') return;
    a.mode = 'bubble';
    a.bub = 0;
    a.why = why || 'pop';
    a.dx = a.x; a.dy = a.y;
    a.vx = 0;
    a.vy = -40;
    a.ground = null;
    if (a.bot) w.roundPops++;
    w.ev.push({ t: 'pop', id: a.id, x: a.x, y: a.y, why: a.why });
    if (w.ev.length > 40) w.ev.shift();
  }

  /* ---------------------------------------------------------- disasters */
  function every(power, slow, fast) {
    return Math.max(fast, slow - (power - 1) * ((slow - fast) / 4));
  }

  var DIS = CI.DISASTERS = [
    { id: 'jelly', name: 'فيضان الجيلي', easy: 1, tip: 'اصعد فوق البيوت قبل أن يرتفع الجيلي',
      open: function (w) {
        w.waterTarget = 450 - (w.power - 1) * 32;
        w.waterY = 860;
      },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        var speed = (860 - w.waterTarget) / (w.power >= 4 ? 12 : 20);
        w.waterY = Math.max(w.waterTarget, w.waterY - speed * dt);
      },
      draw: function (ctx, w) {
        var y = w.phase === 'danger' ? w.waterY : (w.warn ? Math.min(760, w.waterTarget + 80) : 860);
        if (y >= 790) return;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        for (var b = 0; b < 6; b++) {
          var bx = (b * 210 + w.time * 28) % W;
          var by = y + 30 + (b % 3) * 18 + Math.sin(w.time * 3 + b) * 4;
          ctx.beginPath();
          ctx.arc(bx, by, 5 + (b % 3), 0, 7);
          ctx.fill();
        }
        var beans = ['#ffe14a', '#7cf29a', '#fff', '#4cc9f0'];
        for (var i = 0; i < 5; i++) {
          var fx = (i * 250 + 80 + Math.sin(w.time * 1.4 + i) * 14) % W;
          var fy = y + Math.sin(fx * 0.02) * 8 - 6;
          ctx.fillStyle = beans[i % 4];
          ctx.beginPath();
          ctx.ellipse(fx, fy, 11, 7, 0.4, 0, 7);
          ctx.fill();
        }
        ctx.restore();
      } },
    { id: 'meteor', name: 'نيازك المارشملو', easy: 1, tip: 'قف تحت سقف البيت: الظل على الأرض هو مكان السقوط',
      open: function (w) { w.timers.meteor = 0.45; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        w.timers.meteor -= dt;
        var n = 0;
        for (var i = 0; i < w.haz.length; i++) if (w.haz[i].k === 'meteor') n++;
        if (w.timers.meteor <= 0 && n < (w.power >= 4 ? 2 : 2)) {
          w.timers.meteor = every(w.power, 1.45, 0.85);
          var r = 42;
          var x = null;
          if (!w.meteorHome) {
            w.meteorHome = 1;
            var roof = topSpine(w);
            if (roof) {
              var mid = roof.x + roof.w * 0.5;
              var edge = roof.x + 40;
              if (Math.abs(edge - mid) > r + 24 && pointClear(w, edge)) x = mid;
            }
          }
          if (x == null) x = columnX(w, r);
          if (x != null) spawn(w, { k: 'meteor', x: x, y: 640, r: r, tell: Math.max(0.85, 1.25 - (w.power - 1) * 0.1) });
        }
      },
      draw: function (ctx, w) { drawKind(ctx, w, 'meteor'); } },
    { id: 'tornado', name: 'إعصار الفشار', tip: 'امسك الحافة عكس اتجاه السحب',
      open: function (w) {
        w.windMag = 240 + w.power * 28;
        spawn(w, { k: 'funnel', x: 180, y: 600, r: 62, vx: 90 + w.power * 16, tell: 0.8 });
      },
      update: function (w) {
        var f = null;
        for (var i = 0; i < w.haz.length; i++) if (w.haz[i].k === 'funnel') f = w.haz[i];
        if (f) { w.windMode = 'toward'; w.funnelX = f.x; w.windMag = 240 + w.power * 28; }
      },
      draw: function (ctx, w) { drawKind(ctx, w, 'funnel'); } },
    { id: 'sauce', name: 'أرض الصلصة', tip: 'الأرض ستحمر: ابقَ في الأعلى',
      open: function (w) { w.timers.sauce = Math.max(TELL, 2.05 - (w.power - 1) * 0.36); w.hot = false; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        if (!w.hot) { w.timers.sauce -= dt; if (w.timers.sauce <= 0) w.hot = true; }
      },
      draw: function (ctx, w) {
        var soon = w.has('sauce') && !w.hot && (w.warn || w.phase === 'danger');
        if (!soon && !w.hot) return;
        ctx.save();
        ctx.globalAlpha = w.hot ? 0.55 : 0.28 + Math.sin(w.time * 10) * 0.12;
        ctx.fillStyle = '#e23b2f';
        for (var i = 0; i < w.plats.length; i++) {
          var p = w.plats[i];
          if (p.ground && !p.gone) ctx.fillRect(p.x, p.y, p.w, 18);
        }
        ctx.restore();
      } },
    { id: 'bowl', name: 'انهيار كرات البولينغ', tip: 'اصعد: الكرات تمشي في الممر المضيء',
      open: function (w) { w.timers.bowl = Math.max(TELL, 1.05 - (w.power - 1) * 0.08); w.bowlSide = w.rnd() < 0.5 ? 1 : -1; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        w.timers.bowl -= dt;
        if (w.timers.bowl <= 0) {
          w.timers.bowl = every(w.power, 1.5, 0.72);
          var left = w.bowlSide > 0;
          var speed = 240 + w.power * 18;
          spawn(w, { k: 'bowl', x: left ? -180 : W + 180, y: 614, r: 24, vx: left ? speed : -speed, tell: 0.7 });
          if (w.power >= 3 && w.rnd() < 0.5) w.bowlSide *= -1;
        }
      },
      draw: function (ctx, w) {
        if (!w.has('bowl')) return;
        ctx.save();
        ctx.globalAlpha = w.phase === 'inter' ? 0.35 : 0.5;
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(0, 626, W, 10);
        ctx.restore();
        drawKind(ctx, w, 'bowl');
      } },
    { id: 'quake', name: 'بلاط الزلزال', tip: 'السطح سيسقط: انزل إلى الأرض المفتوحة بعيدًا عن البيوت',
      open: function (w) { w.timers.quake = 0.7; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        w.timers.quake -= dt;
        if (w.timers.quake <= 0) {
          w.timers.quake = every(w.power, 2.3, 1.15);
          var cands = [];
          for (var i = 0; i < w.plats.length; i++) {
            var p = w.plats[i];
            if (!p.spine && !p.gone && !p.shake) cands.push(p);
          }
          var picked = cands.length ? pick(w.rnd, cands) : null;
          if (!needsHeight(w) && !w.topShook) {
            var roof = topSpine(w);
            if (roof && !roof.ground && !roof.gone && !roof.shake) { picked = roof; w.topShook = 1; }
          }
          if (picked) {
            picked.shake = Math.max(TELL, 0.95 - (w.power - 1) * 0.08);
            w.minTell = Math.min(w.minTell, picked.shake);
          }
        }
        for (var j = 0; j < w.plats.length; j++) {
          var q = w.plats[j];
          if (q.shake > 0) {
            q.shake -= dt;
            q.ox = Math.sin(w.time * 46) * 3;
            if (q.shake <= 0) {
              q.gone = true; q.shake = 0;
              if (q.spine) {
                for (var ri = 0; ri < w.actors.length; ri++) {
                  var rider = w.actors[ri];
                  if (rider.mode === 'run' && rider.ground === q) pop(w, rider, 'quake');
                }
              }
            }
          }
        }
      },
      draw: function (ctx, w) {
        ctx.save();
        for (var i = 0; i < w.plats.length; i++) {
          var p = w.plats[i];
          if (p.shake > 0 && !p.gone) {
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#c47b4a';
            ctx.fillRect(p.x + (p.ox || 0), p.y - 6, p.w, 6);
          }
        }
        ctx.restore();
      } },
    { id: 'gum', name: 'ريح العلكة', tip: 'الخطوط تريك الاتجاه: امسك عكسها',
      open: function (w) { w.timers.gum = 0.4; w.gust = w.rnd() < 0.5 ? 1 : -1; w.windMag = 260 + w.power * 24; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        if (!w.windMode) { w.wind = w.gust * w.windMag; }
        w.timers.gum -= dt;
        if (w.timers.gum <= 0) {
          w.timers.gum = every(w.power, 2.4, 1.3);
          w.gust *= -1;
          w.wind = w.gust * w.windMag;
          var left = w.gust > 0;
          spawn(w, { k: 'gum', x: left ? -80 : W + 80, y: 618, r: 20, vx: w.gust * (240 + w.power * 12), tell: Math.max(TELL, 0.85) });
        }
      },
      draw: function (ctx, w) {
        var dir = w.windMode === 'toward' ? 0 : (w.wind || w.gust || 0);
        if (!dir && !w.has('gum')) return;
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#ff7ad9';
        ctx.lineWidth = 3;
        var sign = dir ? (dir > 0 ? 1 : -1) : 1;
        for (var i = 0; i < 8; i++) {
          var y = 80 + i * 70;
          var x = ((w.time * 180 * sign) + i * 160) % (W + 80) - 40;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 36 * sign, y);
          ctx.stroke();
        }
        ctx.restore();
        drawKind(ctx, w, 'gum');
      } },
    { id: 'snow', name: 'عاصفة كرات الثلج', tip: 'الكرة تدفعك فقط: لا تقف عند الحافة',
      open: function (w) { w.timers.snow = 0.5; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        w.timers.snow -= dt;
        if (w.timers.snow <= 0) {
          w.timers.snow = every(w.power, 0.85, 0.38);
          var left = w.rnd() < 0.5;
          var speed = 280 + w.power * 16;
          spawn(w, {
            k: 'snow', x: left ? -40 : W + 40,
            y: 560 + w.rnd() * 70, r: 14,
            vx: (left ? 1 : -1) * speed, vy: 40 + w.rnd() * 40, tell: 0.7
          });
        }
      },
      draw: function (ctx, w) { drawKind(ctx, w, 'snow'); } },
    { id: 'beach', name: 'كرة الشاطئ العملاقة', tip: 'انظر ظل الكرة وابعد عن مكان سقوطها',
      open: function (w) {
        spawn(w, { k: 'beach', x: 240 + w.rnd() * 360, y: 460, r: 50, vx: (w.rnd() < 0.5 ? -1 : 1) * (140 + w.power * 12), vy: 0, tell: 0.8 });
      },
      update: function () {},
      draw: function (ctx, w) { drawKind(ctx, w, 'beach'); } },
    { id: 'ice', name: 'أرض الجليد', tip: 'الأرض زلقة: امشِ بهدوء نحو الوسط',
      open: function (w) { w.timers.ice = Math.max(TELL, 1.25 - (w.power - 1) * 0.15); w.ice = false; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        if (!w.ice) { w.timers.ice -= dt; if (w.timers.ice <= 0) w.ice = true; }
        if (w.ice) {
          for (var i = 0; i < w.plats.length; i++) {
            var p = w.plats[i];
            if (p.vx) p.x += p.vx * dt * 0.8;
          }
        }
      },
      draw: function (ctx, w) {
        if (!w.ice && !(w.has('ice') && (w.warn || w.phase === 'danger'))) return;
        ctx.save();
        ctx.globalAlpha = w.ice ? 0.45 : 0.22;
        ctx.fillStyle = '#dff6ff';
        for (var i = 0; i < w.plats.length; i++) {
          var p = w.plats[i];
          if (!p.gone && (p.ground || p.one)) ctx.fillRect(p.x, p.y, p.w, 8);
        }
        ctx.restore();
      } },
    { id: 'spark', name: 'برق اللمعان', tip: 'الدائرة على الأرض تضرب بعد لحظة: اخرج منها',
      open: function (w) { w.timers.spark = 0.55; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        w.timers.spark -= dt;
        var n = 0;
        for (var i = 0; i < w.haz.length; i++) if (w.haz[i].k === 'zap') n++;
        if (w.timers.spark <= 0 && n < 2) {
          w.timers.spark = every(w.power, 1.55, 0.9);
          var r = 40;
          var x = columnX(w, r);
          if (x != null) spawn(w, { k: 'zap', x: x, y: 640, r: r, tell: Math.max(0.85, 1.3 - (w.power - 1) * 0.1) });
        }
      },
      draw: function (ctx, w) { drawKind(ctx, w, 'zap'); } },
    { id: 'stomp', name: 'دوسة الروبوت', tip: 'ظل القدم الكبير يظهر قبل الدوسة',
      open: function (w) { w.timers.foot = 0.7; },
      update: function (w, dt) {
        if (w.phase !== 'danger') return;
        w.timers.foot -= dt;
        var n = 0;
        for (var i = 0; i < w.haz.length; i++) if (w.haz[i].k === 'foot') n++;
        if (w.timers.foot <= 0 && n < 1) {
          w.timers.foot = every(w.power, 2.2, 1.25);
          var r = 68;
          var x = columnX(w, r);
          if (x != null) spawn(w, { k: 'foot', x: x, y: 180, r: r, tell: Math.max(0.9, 1.3 - (w.power - 1) * 0.1) });
        }
      },
      draw: function (ctx, w) { drawKind(ctx, w, 'foot'); } }
  ];

  function disaster(id) {
    for (var i = 0; i < DIS.length; i++) if (DIS[i].id === id) return DIS[i];
    return DIS[0];
  }
  CI.disaster = disaster;

  function drawKind(ctx, w, kind) {
    for (var i = 0; i < w.haz.length; i++) if (w.haz[i].k === kind) drawHaz(ctx, w, w.haz[i]);
  }

  function drawHaz(ctx, w, h) {
    ctx.save();
    if (h.k === 'meteor') {
      var grow = h.tell > 0 ? 1 - h.tell / 1.25 : 1;
      ctx.globalAlpha = 0.28 + grow * 0.45;
      ctx.fillStyle = '#5c3d32';
      ctx.beginPath();
      ctx.ellipse(h.x, 640, h.r * (0.3 + grow), 16, 0, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ff4fa3';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(h.x, 640, h.r * (0.25 + grow * 0.9), 10, 0, 0, 7);
      ctx.stroke();
      var my = h.tell > 0 ? 70 + h.tell * 280 : 250;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffd0ea';
      ctx.beginPath();
      ctx.ellipse(h.x, my + 28, 10, 26, 0, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff6fb';
      ctx.beginPath();
      ctx.arc(h.x, my, 36 + grow * 10, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ff8ec8';
      ctx.beginPath();
      ctx.arc(h.x - 10, my - 10, 12, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#2b2148';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(h.x, my, 36 + grow * 10, 0, 7);
      ctx.stroke();
      if (h.hit) {
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(h.x, 620, h.r * 0.7, 0, 7);
        ctx.fill();
      }
    } else if (h.k === 'funnel') {
      ctx.translate(h.x, h.y);
      ctx.rotate(w.time * 6);
      ctx.fillStyle = '#f4d35e';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -70);
      ctx.lineTo(34, 20);
      ctx.lineTo(-34, 20);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      for (var k = 0; k < 5; k++) ctx.fillRect(-4, -60 + k * 16, 8, 6);
    } else if (h.k === 'bowl') {
      ctx.fillStyle = '#35245f';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (h.k === 'gum') {
      ctx.globalAlpha = h.tell > 0 ? 0.45 : 0.95;
      ctx.fillStyle = '#ff7ad9';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, 7);
      ctx.fill();
    } else if (h.k === 'snow') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#b9e2ff';
      ctx.stroke();
    } else if (h.k === 'beach') {
      var fall = h.vy > 0 ? Math.min(1, (640 - h.y) / 280) : 0.2;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(h.x, 638, h.r * (1.1 - fall * 0.4), 10, 0, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#ff5d8f';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r - 4, 0.4, 2.2);
      ctx.stroke();
    } else if (h.k === 'zap') {
      var g = h.tell > 0 ? 1 - Math.min(1, h.tell / 1.2) : 1;
      ctx.globalAlpha = 0.35 + g * 0.45;
      ctx.strokeStyle = '#ffe66d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(h.x, 630, h.r * (0.4 + g * 0.7), 0, 7);
      ctx.stroke();
      if (h.hit) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#fff7c2';
        ctx.beginPath();
        ctx.moveTo(h.x, 40);
        ctx.lineTo(h.x - 16, 300);
        ctx.lineTo(h.x + 10, 300);
        ctx.lineTo(h.x - 6, 640);
        ctx.stroke();
      }
    } else if (h.k === 'foot') {
      var s = h.tell > 0 ? 0.25 + (1 - Math.min(1, h.tell / 1.1)) * 0.75 : 1;
      ctx.globalAlpha = 0.3 + s * 0.35;
      ctx.fillStyle = '#2b2148';
      ctx.beginPath();
      ctx.ellipse(h.x, 648, h.r * s, 16, 0, 0, 7);
      ctx.fill();
      if (h.tell < 0.45 || h.hit) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#d7deea';
        roundRect(ctx, h.x - h.r * 0.7, h.hit ? 430 : 80, h.r * 1.4, h.hit ? 220 : 80, 20);
        ctx.fill();
        ctx.fillStyle = '#c45c26';
        roundRect(ctx, h.x - h.r * 0.55, h.hit ? 600 : 140, h.r * 1.1, 40, 12);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* -------------------------------------------------------------- brains */
  function paceDir(a, w) {
    if (!a.ground) return a.id % 2 ? 1 : -1;
    var dir = Math.sin(w.time * 2.3 + a.id * 1.4) >= 0 ? 1 : -1;
    var cx = a.x + a.w / 2;
    if (cx < a.ground.x + 40) return 1;
    if (cx > a.ground.x + a.ground.w - 40) return -1;
    return dir;
  }

  function pickGoal(w) {
    if (w.has('ice') && !w.has('jelly') && !w.has('sauce') && !w.has('tornado')) return spineGround(w);
    if (needsHeight(w) || w.has('gum') || w.has('tornado') || w.has('snow')) return topSpine(w);
    if (w.has('quake')) return spineGround(w);
    return topSpine(w);
  }

  function roofSpot(w) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < w.plats.length; i++) {
      var h = w.plats[i];
      if (!h.solid || h.gone || h.h < 40) continue;
      var spots = [h.x - 28, h.x + h.w + 28];
      for (var s = 0; s < spots.length; s++) {
        var x = spots[s];
        if (x < 24 || x > W - 24) continue;
        var g = null;
        for (var p = 0; p < w.plats.length; p++) {
          var pl = w.plats[p];
          if (pl.gone || pl.solid || (!pl.ground && !pl.one)) continue;
          if (x < pl.x + 18 || x > pl.x + pl.w - 18) continue;
          if (pl.y < h.y + 8) continue;
          if (!g || pl.y > g.y) g = pl;
        }
        if (!g) continue;
        var d = (g.spine ? 0 : 800) + Math.abs(x - W * 0.5);
        if (d < bestD) { bestD = d; best = { x: x, plat: g }; }
      }
    }
    return best;
  }

  function sameFloor(a, spot) {
    var g = a.ground;
    if (!g || !spot) return false;
    if (g === spot.plat) return true;
    if (Math.abs(g.y - spot.plat.y) > 6) return false;
    var gap = Math.max(g.x, spot.plat.x) - Math.min(g.x + g.w, spot.plat.x + spot.plat.w);
    return gap < 28;
  }

  function nextPlat(a, w, goal) {
    var feet = a.y + a.h;
    var cx = a.x + a.w / 2;
    var above = null, toward = null, towardD = 1e9;
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (!p.spine || p.gone || p.solid) continue;
      if (p.y > feet - 10) continue;
      if (goal && p.y < goal.y - 2) continue;
      var overlap = cx > p.x - 18 && cx < p.x + p.w + 18;
      if (overlap) { if (!above || p.y > above.y) above = p; }
      else {
        var d = Math.abs((p.x + p.w / 2) - cx) + Math.abs(p.y - feet) * 0.5;
        if (d < towardD) { towardD = d; toward = p; }
      }
    }
    return above || toward;
  }

  function dodgeX(a, w) {
    var cx = a.x + a.w / 2;
    var cy = a.y + a.h / 2;
    var threat = null, best = 1e9;
    for (var i = 0; i < w.haz.length; i++) {
      var h = w.haz[i];
      var dx = Math.abs(h.x - cx);
      if (h.k === 'meteor' || h.k === 'zap' || h.k === 'foot') {
        var reach = h.r + 48;
        if (h.tell > 0.85 && h.k !== 'foot') continue;
        if (dx < reach && dx < best) { best = dx; threat = h; }
      } else if (h.k === 'beach' || h.k === 'funnel') {
        if (h.tell > 0.2 && h.age < 0.2) continue;
        var dy = Math.abs(h.y - cy);
        if (dx < h.r + 36 && dy < h.r + 70 && dx + dy < best) { best = dx + dy; threat = h; }
      }
    }
    if (!threat) return null;
    var plat = a.ground;
    var tx = cx + (cx < threat.x ? -1 : 1) * (threat.r + 56);
    if (plat) {
      var lo = plat.x + 24, hi = plat.x + plat.w - 24;
      var clamped = clamp(tx, lo, hi);
      if (Math.abs(clamped - threat.x) < threat.r + 8) {
        var alt = cx < threat.x ? hi : lo;
        if (Math.abs(alt - threat.x) > Math.abs(clamped - threat.x)) clamped = alt;
      }
      tx = clamped;
    }
    return tx;
  }

  function columnThreat(h) { return h.k === 'meteor' || h.k === 'zap' || h.k === 'foot'; }

  function pointClear(w, x, extra) {
    var list = w.haz;
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (!columnThreat(h)) continue;
      if (Math.abs(h.x - x) < h.r + 14) return false;
    }
    if (extra && columnThreat(extra) && Math.abs(extra.x - x) < extra.r + 14) return false;
    return true;
  }

  function safeX(w, plat, a) {
    var here = a.x + a.w / 2;
    if (pointClear(w, here)) return here;
    var best = here, bestD = 1e9;
    for (var x = plat.x + 28; x <= plat.x + plat.w - 28; x += 10) {
      if (!pointClear(w, x)) continue;
      var d = Math.abs(x - here);
      if (d < bestD) { bestD = d; best = x; }
    }
    return best;
  }

  function oracleInput(a, w) {
    var inp = { x: 0, y: 0, jump: false, down: false, drop: false, brace: false, emote: false };
    if (a.mode === 'cloud') {
      inp.x = Math.sin(w.time * 1.6 + a.id);
      inp.y = Math.cos(w.time * 1.15 + a.id) * 0.65;
      inp.drop = a.cd <= 0;
      return inp;
    }
    if (a.mode !== 'run') return inp;
    var cx = a.x + a.w / 2;
    var feet = a.y + a.h;
    var windy = w.has('tornado') || w.has('gum');
    var goal = pickGoal(w);
    if (w.has('quake') && !needsHeight(w) && a.ground && a.ground.one && !a.ground.ground) {
      inp.down = true;
      return inp;
    }
    if (a.ground && a.ground.shake > 0 && a.ground.one && !a.ground.ground) {
      inp.down = true;
      return inp;
    }
    if (w.has('meteor') && !needsHeight(w) && !w.has('quake') && !w.has('spark') && !w.has('stomp')) {
      var spot = roofSpot(w);
      if (spot && sameFloor(a, spot)) {
        inp.x = Math.abs(spot.x - cx) > 10 ? Math.sign(spot.x - cx) : 0;
        return inp;
      }
    }
    var onGoal = goal && feet <= goal.y + 14 && a.ground === goal;
    if (windy && onGoal) inp.brace = true;
    if (goal && !onGoal) {
      var next = nextPlat(a, w, goal);
      if (next) {
        var mid = next.x + next.w / 2;
        var overlap = cx > next.x + 6 && cx < next.x + next.w - 6;
        var dx = mid - cx;
        if (!overlap) inp.x = Math.sign(dx);
        else if (a.ground) { inp.jump = true; inp.x = Math.abs(dx) > 22 ? Math.sign(dx) : 0; }
        else inp.x = Math.abs(dx) > 16 ? Math.sign(dx) : 0;
      } else if (goal) {
        inp.x = Math.sign((goal.x + goal.w / 2) - cx) || 0;
      }
      return inp;
    }
    if (goal) {
      var tx = (w.ice && goal.ground) ? goal.x + goal.w / 2 : safeX(w, goal, a);
      var dx2 = tx - cx;
      if (w.ice) inp.x = clamp(dx2 / 70, -1, 1);
      else inp.x = Math.abs(dx2) > 12 ? Math.sign(dx2) : (a.bot ? paceDir(a, w) : 0);
    }
    if (windy) inp.brace = true;
    return inp;
  }

  /* Bots claim spaced spots so their sprites never pile onto one stair. */
  function slotFor(a, w) {
    if (!a.bot || a.mode !== 'run') return null;
    var rising = (w.phase === 'danger' || w.warn) && w.has('jelly');
    var burn = (w.phase === 'danger' || w.warn) && (w.has('sauce') || w.has('quake'));
    var list = [];
    function consider(p) {
      if (!p || p.gone || p.solid || (!p.one && !p.ground)) return;
      if (list.indexOf(p) >= 0) return;
      if (rising && p.y >= w.waterTarget - 2) return;
      if (burn && p.ground) return;
      list.push(p);
    }
    consider(pickGoal(w));
    var rest = w.plats.slice().sort(function (p, q) { return p.y - q.y; });
    for (var r = 0; r < rest.length; r++) consider(rest[r]);
    var slots = [];
    for (var s = 0; s < list.length; s++) {
      var p = list[s];
      var n = Math.max(1, Math.floor((p.w - 8) / 100));
      for (var k = 0; k < n; k++) slots.push({ plat: p, x: p.x + p.w * (k + 1) / (n + 1) });
    }
    if (!slots.length) return null;
    return slots[(a.botIndex || 0) % slots.length];
  }
  function steerTo(a, w, home) {
    var inp = { x: 0, y: 0, jump: false, down: false, drop: false, brace: false, emote: false };
    var cx = a.x + a.w * 0.5;
    var goal = home.plat;
    if (a.ground && a.ground.one && a.ground.y + 8 < goal.y) { inp.down = true; return inp; }
    var here = a.ground === goal;
    if (!here) {
      var next = nextPlat(a, w, goal);
      if (next) {
        var mid = next.x + next.w * 0.5;
        var overlap = cx > next.x + 6 && cx < next.x + next.w - 6;
        var dx = mid - cx;
        if (!overlap) inp.x = Math.sign(dx);
        else if (a.ground) { inp.jump = true; inp.x = Math.abs(dx) > 22 ? Math.sign(dx) : 0; }
        else inp.x = Math.abs(dx) > 16 ? Math.sign(dx) : 0;
      } else inp.x = Math.sign((goal.x + goal.w * 0.5) - cx) || 0;
      return inp;
    }
    var dx2 = home.x - cx;
    inp.x = Math.abs(dx2) > 18 ? Math.sign(dx2) : paceDir(a, w);
    return inp;
  }

  function botInput(a, w) {
    a.lag -= 1 / 60;
    if (a.lag <= 0 || !a.hold) {
      var dodge = a.mode === 'run' ? dodgeX(a, w) : null;
      var home = !dodge ? slotFor(a, w) : null;
      var thought = home ? steerTo(a, w, home) : oracleInput(a, w);
      if (dodge) thought.x = Math.sign(dodge - (a.x + a.w * 0.5)) || thought.x;
      var mistake = w.rnd() < (1 - a.skill) * 0.5;
      if (mistake) {
        if (thought.jump && w.rnd() < 0.75) thought.jump = false;
        if (thought.brace && w.rnd() < 0.7) thought.brace = false;
        var sky = w.has('meteor') || w.has('spark') || w.has('stomp');
        if (!sky && w.rnd() < 0.35) thought.x = thought.x ? -thought.x : (w.rnd() < 0.5 ? -1 : 1);
      }
      a.hold = thought;
      a.lag = (1 - a.skill) * 0.5 + 0.06;
    }
    var src = a.hold;
    var out = { x: src.x, y: src.y, jump: src.jump, down: !!src.down, drop: src.drop, brace: src.brace, emote: false };
    if (a.mode === 'cloud') {
      out.x = Math.sin(w.time * 1.5 + a.id);
      out.y = Math.cos(w.time * 1.05 + a.id) * 0.6;
      out.drop = a.cd <= 0;
      out.brace = false;
      return out;
    }
    if (a.mode === 'bubble') return out;
    if (a.ground && Math.abs(a.x - (a.px == null ? a.x : a.px)) < 0.5) {
      a.stuck = (a.stuck || 0) + 1 / 60;
      if (a.stuck > 0.28) {
        a.stuckDir = -(a.stuckDir || (a.id % 2 ? 1 : -1));
        out.x = a.stuckDir;
        if (a.stuck > 0.7) a.stuck = 0;
      }
    } else a.stuck = 0;
    a.px = a.x;
    if (out.brace && a.ground) out.x = paceDir(a, w);
    if (a.ground) {
      if (a.x < a.ground.x + 22) out.x = 1;
      else if (a.x + a.w > a.ground.x + a.ground.w - 22) out.x = -1;
    }
    if (a.x < 24) out.x = 1;
    if (a.x > W - a.w - 24) out.x = -1;
    if (w.phase === 'inter' && w.rnd() < 0.002) out.emote = true;
    return out;
  }

  /* --------------------------------------------------------------- body */
  function windAt(w, x) {
    if (w.phase !== 'danger') return 0;
    if (w.windMode === 'toward') return Math.sign((w.funnelX || 0) - x) * (w.windMag || 0);
    return w.wind || 0;
  }

  function movePlats(w, dt) {
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (p.gone || !p.vx) continue;
      var ox = p.x;
      p.x += p.vx * dt;
      if (p.x < p.minX || p.x > p.maxX) {
        p.vx *= -1;
        p.x = clamp(p.x, p.minX, p.maxX);
      }
      var dx = p.x - ox;
      if (!dx) continue;
      for (var j = 0; j < w.actors.length; j++) {
        var a = w.actors[j];
        if (a.ground === p && a.mode === 'run') a.x += dx;
      }
    }
  }

  function moveHaz(w, dt) {
    w.windMode = null;
    w.wind = 0;
    for (var i = w.haz.length - 1; i >= 0; i--) {
      var h = w.haz[i];
      h.age += dt;
      if (h.tell > 0) h.tell -= dt;
      if (h.k === 'meteor' || h.k === 'zap' || h.k === 'foot') {
        if (h.tell <= 0 && !h.hit) {
          h.hit = 1;
          h.live = 0.18;
          w.ev.push({ t: 'boom', k: h.k, x: h.x, y: h.k === 'foot' ? 620 : 630, p: h.k === 'meteor' ? 5 : 3 });
          if (w.ev.length > 40) w.ev.shift();
        }
        if (h.hit) {
          h.live -= dt;
          if (h.live <= 0) w.haz.splice(i, 1);
        }
        continue;
      }
      h.x += (h.vx || 0) * dt;
      h.y += (h.vy || 0) * dt;
      if (h.k === 'beach') {
        h.vy += 1000 * dt;
        var floor = 640 - h.r;
        if (h.y > floor) {
          h.y = floor;
          h.vy = -620;
          w.ev.push({ t: 'boom', k: 'beach', x: h.x, y: 640, p: 4 });
        }
        if (h.x < h.r + 24) { h.x = h.r + 24; h.vx = Math.abs(h.vx); }
        if (h.x > W - h.r - 24) { h.x = W - h.r - 24; h.vx = -Math.abs(h.vx); }
      } else if (h.k === 'funnel') {
        if (h.x < 150 || h.x > W - 150) h.vx *= -1;
        w.windMode = 'toward';
        w.funnelX = h.x;
      } else if (h.k === 'snow') {
        h.vy += 80 * dt;
        if (h.y > 660) w.haz.splice(i, 1);
      }
      if (h.k !== 'beach' && h.k !== 'funnel' && (h.x < -260 || h.x > W + 260)) w.haz.splice(i, 1);
    }
  }

  function dropItem(w, a) {
    if (w.items.length > 14) w.items.shift();
    var kind = (a.drops % 2) ? 'pad' : 'peel';
    w.items.push({ k: kind, x: a.x + a.w / 2, y: a.y + 16, vy: 80, life: 9, rest: 0 });
    a.drops++;
    a.cd = a.quick ? 4 : 6;
    w.ev.push({ t: 'drop', id: a.id, k: kind, x: a.x, y: a.y });
  }

  function stepItems(w, dt) {
    for (var i = w.items.length - 1; i >= 0; i--) {
      var it = w.items[i];
      it.life -= dt;
      if (it.life <= 0) { w.items.splice(i, 1); continue; }
      if (!it.rest) {
        it.vy += 1800 * dt;
        it.y += it.vy * dt;
        if (it.y > 628) { it.y = 628; it.rest = 1; it.vy = 0; }
      }
      for (var j = 0; j < w.actors.length; j++) {
        var a = w.actors[j];
        if (a.mode !== 'run') continue;
        var cx = a.x + a.w / 2;
        if (Math.abs(cx - it.x) < 28 && Math.abs(a.y + a.h - it.y) < 30) {
          if (it.k === 'peel') { a.vx += (a.vx >= 0 ? 1 : -1) * 260; a.slip = 0.45; }
          else if (a.vy >= 0) { a.vy = -860; a.ground = null; a.jumps++; }
        }
      }
    }
  }

  function hits(w, a) {
    if (w.phase !== 'danger' || a.mode !== 'run') return;
    if (a.y > 790) return pop(w, a, 'pit');
    if (w.hot && a.ground && a.ground.ground) return pop(w, a, 'sauce');
    if (w.waterY < 800 && a.y + a.h > w.waterY + 1) return pop(w, a, 'jelly');
    var cx = a.x + a.w / 2, cy = a.y + a.h / 2, feet = a.y + a.h;
    for (var i = 0; i < w.haz.length; i++) {
      var h = w.haz[i];
      if (h.k === 'meteor' && h.hit && h.live > 0 && Math.abs(cx - h.x) < h.r - 4 && !underRoof(w, a)) return pop(w, a, 'meteor');
      if ((h.k === 'zap' || h.k === 'foot') && h.hit && h.live > 0 && Math.abs(cx - h.x) < h.r - 6) return pop(w, a, 'sky');
      if (h.tell > 0 && h.k !== 'meteor' && h.k !== 'zap' && h.k !== 'foot') continue;
      if (h.k === 'bowl' && feet > 560 && Math.hypot(cx - h.x, feet - h.y) < h.r + 6) return pop(w, a, 'bowl');
      if (h.k === 'gum' && feet > 560 && Math.hypot(cx - h.x, cy - h.y) < h.r + 8) return pop(w, a, 'gum');
      if (h.k === 'funnel' && feet > 520 && Math.hypot(cx - h.x, cy - h.y) < h.r - 4) return pop(w, a, 'tornado');
      if (h.k === 'beach' && Math.hypot(cx - h.x, cy - h.y) < h.r + 2) return pop(w, a, 'beach');
      if (h.k === 'snow' && feet > 560 && !h.spent && Math.hypot(cx - h.x, cy - h.y) < h.r + 12) {
        a.vx += Math.sign(h.vx || 1) * (150 + w.power * 12);
        h.spent = 1;
      }
    }
  }

  function body(w, a, inp, dt) {
    if (a.mode === 'bubble') {
      a.bub += dt;
      a.y -= 78 * dt;
      a.sq = 1.15;
      var need = a.quick ? 0.16 : 0.42;
      if (a.bub >= need) {
        a.mode = 'cloud';
        a.y = clamp(a.y, 36, 120);
        a.vx = 0; a.vy = 0;
        a.cd = a.quick ? 0.4 : 1;
        w.ev.push({ t: 'cloud', id: a.id });
      }
      return;
    }
    if (a.mode === 'cloud') {
      var sp = 260;
      a.x = clamp(a.x + inp.x * sp * dt, 16, W - a.w - 16);
      a.y = clamp(a.y + inp.y * sp * dt, 28, 200);
      a.cd -= dt;
      if (inp.drop && a.cd <= 0) dropItem(w, a);
      a.sq += (1 - a.sq) * 0.2;
      return;
    }
    if (a.slip > 0) a.slip -= dt;
    var ice = !!(w.ice && a.ground && !inp.brace);
    var wind = windAt(w, a.x + a.w / 2);
    if (inp.brace && a.ground) wind = 0;
    var accel = ice ? 480 : ACC;
    if (a.slip > 0) accel = 260;
    if (inp.x) a.vx += inp.x * accel * dt;
    a.vx *= Math.exp(-(ice ? 1.1 : (inp.x ? 1.4 : 16)) * dt);
    if (wind) a.vx += wind * dt;
    var max = ice ? 420 : MAX;
    if (a.vx > max) a.vx = max;
    if (a.vx < -max) a.vx = -max;

    if (inp.jump) a.buf = 0.12;
    else a.buf = Math.max(0, a.buf - dt);
    if (a.ground) { a.coy = 0.12; a.air = 0; }
    else a.coy = Math.max(0, a.coy - dt);
    var doJump = a.buf > 0 && (a.coy > 0 || (a.dj && a.air < 1 && !a.ground));
    if (doJump) {
      if (!(a.coy > 0) && a.dj) a.air++;
      a.vy = JUMP;
      a.buf = 0; a.coy = 0; a.ground = null;
      a.jumps++;
      a.sq = 0.72;
      w.ev.push({ t: 'jump', id: a.id, x: a.x, y: a.y });
    }
    if (inp.down && !a.ground && a.vy > -80) a.vy = 980;
    if (inp.down && a.ground && a.ground.one && !a.ground.ground) {
      a.drop = 0.28;
      a.ground = null;
    }
    if (a.drop > 0) a.drop -= dt;
    a.vy += GRAV * dt;
    if (a.vy > 1100) a.vy = 1100;

    a.x += a.vx * dt;
    for (var i = 0; i < w.plats.length; i++) {
      var s = w.plats[i];
      if (s.gone || !s.solid) continue;
      if (a.x < s.x + s.w && a.x + a.w > s.x && a.y < s.y + s.h && a.y + a.h > s.y) {
        if (a.vx > 0) a.x = s.x - a.w;
        else a.x = s.x + s.w;
        a.vx = 0;
      }
    }
    if (a.x < 2) { a.x = 2; if (a.vx < 0) a.vx = 0; }
    if (a.x + a.w > W - 2) { a.x = W - 2 - a.w; if (a.vx > 0) a.vx = 0; }

    var prev = a.y;
    a.y += a.vy * dt;
    a.ground = null;
    for (var k = 0; k < w.plats.length; k++) {
      var p = w.plats[k];
      if (p.gone || !p.solid) continue;
      if (a.x < p.x + p.w && a.x + a.w > p.x && a.y < p.y + p.h && a.y + a.h > p.y) {
        if (a.vy >= 0) { a.y = p.y - a.h; a.vy = 0; a.ground = p; a.sq = 1.28; }
        else { a.y = p.y + p.h; a.vy = 0; }
      }
    }
    if (a.drop <= 0 && a.vy >= 0) {
      var feet = a.y + a.h, was = prev + a.h;
      for (var n = 0; n < w.plats.length; n++) {
        var o = w.plats[n];
        if (o.gone || o.solid || (!o.one && !o.ground)) continue;
        var overlapX = Math.min(a.x + a.w - 2, o.x + o.w) - Math.max(a.x + 2, o.x);
        if (overlapX < 8) continue;
        if (was <= o.y + 10 && feet >= o.y) {
          a.y = o.y - a.h;
          a.vy = 0;
          a.ground = o;
          a.sq = 1.22;
          break;
        }
      }
    }
    if (a.sq > 1) a.sq += (1 - a.sq) * 0.18;
    else a.sq += (1 - a.sq) * 0.2;
    if (Math.abs(a.vx) > 20 && a.ground) a.face = a.vx > 0 ? 1 : -1;
    if (a.bot && a.still > 0.35 && a.ground && a.mode === 'run') {
      var innerL = a.ground.x + 14, innerR = a.ground.x + a.ground.w - a.w - 14;
      if (innerR > innerL) {
        if (a.x < innerL) a.x += 90 * dt;
        else if (a.x > innerR) a.x -= 90 * dt;
        else a.x += Math.sin(w.time * 3 + a.id) * 70 * dt;
      }
    }
    trackStill(w, a, dt);
    hits(w, a);
  }

  function trackStill(w, a, dt) {
    if (!a.bot || w.phase !== 'danger' || a.mode === 'bubble') {
      a.still = 0; a.sx = a.x; a.sy = a.y; return;
    }
    if (Math.abs(a.x - a.sx) + Math.abs(a.y - a.sy) < 1.25) a.still += dt;
    else { a.still = 0; a.sx = a.x; a.sy = a.y; }
    if (a.still > w.maxStill) {
      w.maxStill = a.still;
      w.stillWho = a.id + ' ' + a.mode + ' ' + a.name + ' g=' + (a.ground ? 'y' : 'n') + ' x=' + Math.round(a.x) + ' y=' + Math.round(a.y);
    }
  }

  /* -------------------------------------------------------------- rounds */
  var EASY = ['jelly', 'meteor'];
  var ALL = DIS.map(function (d) { return d.id; });

  function shuffle(rnd, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  CI.plan = function (seed, hard) {
    var rnd = rng(seed);
    var easy = rnd() < 0.5 ? EASY[0] : EASY[1];
    var pool = shuffle(rnd, ALL.filter(function (id) { return id !== easy; }));
    var rounds = [];
    var used = [easy];
    for (var r = 0; r < 4; r++) {
      var id = r === 0 ? easy : pool[r - 1];
      if (used.indexOf(id) < 0) used.push(id);
      var power = hard ? 1 + r : [1, 2, 2, 3][r];
      var combo = hard ? r >= 1 : r >= 3;
      var id2 = null;
      if (combo) {
        for (var k = 0; k < pool.length; k++) {
          var cand = pool[(r + 3 + k) % pool.length];
          if (cand !== id && used.indexOf(cand) < 0) { id2 = cand; used.push(cand); break; }
        }
        if (!id2) {
          for (var k2 = 0; k2 < pool.length; k2++) {
            var alt = pool[(r + 5 + k2) % pool.length];
            if (alt !== id) { id2 = alt; break; }
          }
        }
      }
      rounds.push({ id: id, id2: id2, power: power });
    }
    return rounds;
  };

  CI.daily = function (n) {
    var rnd = rng(n || 1);
    return { island: ISLANDS[Math.floor(rnd() * ISLANDS.length)].id, seed: (n || 1) >>> 0 };
  };

  function clonePlats(list) {
    return list.map(function (p) {
      return {
        x: p.x, y: p.y, w: p.w, h: p.h, one: p.one, solid: p.solid,
        ground: p.ground, spine: p.spine, vx: p.vx, minX: p.minX, maxX: p.maxX,
        shake: 0, gone: 0, ox: 0
      };
    });
  }

  function place(w) {
    var island = w.island;
    var used = [];
    function take(x) {
      var s = surfaceAt(w.plats, x);
      if (!s) return null;
      return { x: clamp(x - PW / 2, s.x + 4, s.x + s.w - PW - 4), y: s.y - PH };
    }
    for (var i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      a.mode = 'run'; a.bub = 0; a.vx = 0; a.vy = 0; a.ground = null;
      a.drop = 0; a.air = 0; a.buf = 0; a.coy = 0; a.sq = 1; a.still = 0;
      var spot = null;
      if (!a.bot) {
        var g = spineGround(w);
        spot = { x: g.x + g.w * 0.55, y: g.y - PH };
      } else {
        var xs = island.spots;
        var x = xs[(a.botIndex + w.round) % xs.length];
        spot = take(x) || take(spineGround(w).x + 80 + a.botIndex * 30);
      }
      a.x = spot.x; a.y = spot.y;
      a.sx = a.x; a.sy = a.y; a.px = a.x;
      used.push(a);
    }
  }

  function beginRound(w) {
    var spec;
    if (w.script && w.script.length) spec = w.script[Math.min(w.round, w.script.length - 1)];
    else spec = w.plan[w.round];
    w.plats = clonePlats(w.island.plats);
    w.haz = [];
    w.items = [];
    w.hot = false; w.ice = false; w.wind = 0; w.windMag = 0; w.windMode = null;
    w.waterY = 900; w.waterTarget = 900; w.gust = 0;
    w.topShook = 0; w.meteorHome = 0;
    w.timers = {};
    w.power = spec.power;
    w.roundPops = 0;
    w.dis = [disaster(spec.id)];
    if (spec.id2) w.dis.push(disaster(spec.id2));
    w.has = function (id) {
      for (var i = 0; i < w.dis.length; i++) if (w.dis[i].id === id) return true;
      return false;
    };
    for (var d = 0; d < w.dis.length; d++) w.dis[d].open(w);
    w.phase = 'inter';
    w.frames = INTER;
    w.warn = false;
    w.siren = false;
    place(w);
    layStars(w);
    w.ev.push({ t: 'round', n: w.round, name: w.dis[0].name, name2: w.dis[1] ? w.dis[1].name : '', id: w.dis[0].id });
  }
  function layStars(w) {
    w.stars = [];
    var lows = [];
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (!p.solid && !p.gone && p.y >= 500) lows.push(p);
    }
    for (var s = 0; s < 3; s++) {
      var p = lows.length ? lows[s % lows.length] : null;
      if (!p) break;
      w.stars.push({ x: p.x + 40 + (s % 3) * Math.max(26, (p.w - 90) / 3), y: p.y - 24, n: 8 });
    }
  }
  function takeStars(w) {
    if (!w.stars) return;
    for (var i = w.stars.length - 1; i >= 0; i--) {
      var s = w.stars[i];
      if (w.waterY < s.y - 8) { w.stars.splice(i, 1); continue; }
      for (var a = 0; a < w.actors.length; a++) {
        var p = w.actors[a];
        if (p.mode !== 'run') continue;
        if (Math.abs(p.x + p.w / 2 - s.x) < 24 && Math.abs(p.y + p.h * 0.4 - s.y) < 40) {
          p.coins += s.n;
          w.ev.push({ t: 'coin', id: p.id, n: s.n, x: s.x, y: s.y, lived: true });
          if (w.ev.length > 40) w.ev.shift();
          w.stars.splice(i, 1);
          break;
        }
      }
    }
  }

  function award(w) {
    var humans = [];
    for (var i = 0; i < w.actors.length; i++) if (!w.actors[i].bot) humans.push(w.actors[i]);
    var any = false;
    for (var h = 0; h < humans.length; h++) if (humans[h].mode === 'run') any = true;
    for (var j = 0; j < w.actors.length; j++) {
      var a = w.actors[j];
      var lived = a.mode === 'run';
      if (lived) { a.rounds++; a.streak++; if (a.streak > a.best) a.best = a.streak; }
      else a.streak = 0;
      var pay = lived || (w.coop && !a.bot && any);
      if (pay) {
        var n = (lived ? 12 + w.round * 4 + Math.min(15, a.streak * 3) : 12 + w.round * 4);
        a.coins += n;
        w.coins += n;
        w.ev.push({ t: 'coin', id: a.id, n: n, x: a.x + a.w / 2, y: a.y, lived: lived });
      }
      if (lived) w.ev.push({ t: 'ok', id: a.id, x: a.x, y: a.y });
    }
    w.hot = false; w.ice = false; w.wind = 0; w.windMag = 0; w.windMode = null;
    w.waterY = 900; w.haz.length = 0;
  }

  function titles(w) {
    var bestJ = w.actors[0], bestD = w.actors[0], bestR = w.actors[0];
    for (var i = 1; i < w.actors.length; i++) {
      var a = w.actors[i];
      if (a.jumps > bestJ.jumps) bestJ = a;
      if (a.drops > bestD.drops) bestD = a;
      if (a.rounds > bestR.rounds || (a.rounds === bestR.rounds && a.coins > bestR.coins)) bestR = a;
    }
    w.titles = [
      { id: bestJ.id, title: 'أكثر قفزة' },
      { id: bestD.id, title: 'أفضل غيمة' },
      { id: bestR.id, title: 'الناجي' }
    ];
  }

  CI.create = function (o) {
    o = o || {};
    var island = byIsland(o.island == null ? 0 : o.island);
    var players = o.players == null ? 1 : o.players;
    var bots = o.bots == null ? (players <= 1 ? 7 : 6) : o.bots;
    var seed = o.seed == null ? 1 : o.seed;
    var w = {
      seed: seed >>> 0, rnd: rng(seed), island: island, players: players, bots: bots,
      hard: !!o.hard, coop: !!o.coop, attract: !!o.attract,
      script: o.script || null,
      plan: CI.plan(seed, !!o.hard),
      actors: [], haz: [], items: [], ev: [], plats: [],
      phase: 'inter', round: 0, frames: INTER, time: 0,
      power: 1, coins: 0, roundPops: 0, maxStill: 0, minTell: 99,
      waterY: 900, waterTarget: 900, hot: false, ice: false, wind: 0, windMag: 0, stars: [],
      dis: [], timers: {}, titles: [], pops: [],
      in: [{ x: 0, y: 0, jump: false, down: false, drop: false, brace: false, emote: false },
        { x: 0, y: 0, jump: false, down: false, drop: false, brace: false, emote: false }]
    };
    var skills = [0.42, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9];
    function add(bot, index) {
      var perks = (o.perks && o.perks[index]) || {};
      var a = {
        id: w.actors.length, slot: bot ? -1 : index, bot: bot, botIndex: index,
        oracle: !bot && !!o.oracle && index === 0,
        name: bot ? NAMES[index % NAMES.length] : (index === 0 ? 'أنت' : 'صديق'),
        color: bot ? COLORS[index % COLORS.length] : COLORS[(index === 0 ? 0 : 3)],
        hat: bot ? HATS[index % HATS.length] : 'none',
        skill: bot ? skills[index % skills.length] : 1,
        x: 0, y: 0, w: PW, h: PH, vx: 0, vy: 0, face: 1, sq: 1,
        mode: 'run', ground: null, jumps: 0, drops: 0, coins: 0, rounds: 0,
        streak: 0, best: 0, air: 0, buf: 0, coy: 0, drop: 0, bub: 0, cd: 6,
        dj: !bot && !!perks.dj, quick: !bot && !!perks.quick,
        lag: 0, hold: null, still: 0, stuck: 0, why: '', emote: '', emoteT: 0
      };
      w.actors.push(a);
    }
    for (var p = 0; p < players; p++) add(false, p);
    for (var b = 0; b < bots; b++) add(true, b);
    beginRound(w);
    return w;
  };

  CI.setInput = function (w, index, inp) { w.in[index] = inp; };

  function inputFor(w, a) {
    if (a.mode === 'bubble') return w.in[0];
    if (a.bot) return botInput(a, w);
    if (a.oracle) return oracleInput(a, w);
    return w.in[a.slot] || w.in[0];
  }

  function separateActors(w, dt) {
    var list = w.actors;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a.bot || a.mode !== 'run' || !a.ground) continue;
      for (var j = 0; j < i; j++) {
        var b = list[j];
        if (b.mode !== 'run') continue;
        if (Math.abs(a.y - b.y) > 28) continue;
        var dx = (a.x + a.w * 0.5) - (b.x + b.w * 0.5);
        if (Math.abs(dx) >= 100) continue;
        var dir = dx === 0 ? (a.id % 2 ? 1 : -1) : (dx > 0 ? 1 : -1);
        var push = dir * Math.min(220 * dt, (100 - Math.abs(dx)) * 0.55);
        var lo = a.ground.x + 4;
        var hi = a.ground.x + a.ground.w - a.w - 4;
        if (hi <= lo) continue;
        a.x = clamp(a.x + push, lo, hi);
      }
    }
  }

  CI.step = function (w, dt) {
    if (w.phase === 'podium') return;
    dt = dt || 1 / 60;
    w.time += dt;
    w.frames--;
    w.warn = w.phase === 'inter' && w.frames <= 3 * 60;
    if (w.warn && !w.siren) {
      w.siren = true;
      w.ev.push({ t: 'siren', name: w.dis[0].name, name2: w.dis[1] ? w.dis[1].name : '', id: w.dis[0].id });
    }
    if (w.phase === 'inter' || w.phase === 'danger') {
      for (var d = 0; d < w.dis.length; d++) w.dis[d].update(w, dt);
      movePlats(w, dt);
      moveHaz(w, dt);
      for (var i = 0; i < w.actors.length; i++) {
        var a = w.actors[i];
        if (a.emoteT > 0) a.emoteT -= dt;
        var inp = inputFor(w, a);
        if (inp && inp.emote && w.phase === 'inter') { a.emote = a.emote === 'dance' ? 'wave' : 'dance'; a.emoteT = 1.2; }
        body(w, a, inp || { x: 0, y: 0, jump: false, down: false, drop: false, brace: false }, dt);
      }
      separateActors(w, dt);
      stepItems(w, dt);
      if (w.phase === 'danger') takeStars(w);
    } else if (w.phase === 'stamp') {
      for (var s = 0; s < w.actors.length; s++) {
        var p = w.actors[s];
        if (p.mode === 'bubble' || p.mode === 'cloud') body(w, p, { x: Math.sin(w.time + p.id), y: 0, jump: false, down: false, drop: false, brace: false }, dt);
      }
    }
    if (w.frames <= 0) {
      if (w.phase === 'inter') { w.phase = 'danger'; w.frames = DANGER; }
      else if (w.phase === 'danger') {
        w.pops.push(w.roundPops);
        w.phase = 'stamp';
        w.frames = STAMP;
        award(w);
      } else if (w.phase === 'stamp') {
        w.round++;
        if (w.round >= 4) { w.phase = 'podium'; w.frames = 0; titles(w); }
        else beginRound(w);
      }
    }
  };

  CI.drawDisasters = function (ctx, w) {
    if (!w || !w.dis) return;
    for (var i = 0; i < w.dis.length; i++) w.dis[i].draw(ctx, w);
  };

  /* A jump chain from the spine floor to a platform above the max flood. */
  CI.safeChain = function (island) {
    var plats = island.plats.filter(function (p) { return p.spine && !p.solid; });
    var ground = null;
    for (var i = 0; i < plats.length; i++) if (plats[i].ground && (!ground || plats[i].w > ground.w)) ground = plats[i];
    if (!ground) return false;
    var seen = [ground];
    var guard = 0;
    while (guard++ < 12) {
      var cur = seen[seen.length - 1];
      if (cur.y <= 300) return true;
      var nxt = null;
      for (var j = 0; j < plats.length; j++) {
        var p = plats[j];
        if (seen.indexOf(p) >= 0) continue;
        var dy = cur.y - p.y;
        if (dy < 20 || dy > 110) continue;
        var overlap = Math.min(cur.x + cur.w, p.x + p.w) - Math.max(cur.x, p.x);
        if (overlap < 24) continue;
        if (!nxt || p.y > nxt.y) nxt = p;
      }
      if (!nxt) return false;
      seen.push(nxt);
    }
    return false;
  };
})(globalThis.CI = globalThis.CI || {});

/* Egg Rush (سباق البيض) levels: 5 worlds x 4 yards, and a two-player yard per world.
 * Pure data (loaded before engine.js; the Node test loads both). The yard is 1280x720
 * with the kid's house and home nest on the left. Angles are degrees: 0 looks right,
 * 90 down, 180 left, 270 up.
 *   g: sleeping guards [x, y, look, sweep, first sleep s, from tier, nest: 0 normal,
 *      1 golden, 2 giant golden, -1 none; nest distance]; each guard sits behind its nest.
 *   p: patrolling guards { at, path: [[x, y, look]...], tier }: they sleepwalk from stop
 *      to stop, then stir and look around at each stop.
 *   n: nests on their own [x, y, gold, from tier].
 *   obs: [kind, x, y, w, h] footprints that block walking and seeing.
 *   zones: [kind, x, y, w, h] water (slow), ice (slippery) or land (a dry island in the
 *      water); pads: lily pads [x, y, r].
 *   pace: seconds per egg at tier 1 pace (the par for the third star). */
(function () {
  'use strict';
  var ER = window.ER = window.ER || {};
  var KR = { hen: 28, duck: 28, penguin: 28, ostrich: 32, dino: 50 };
  var KIND = ['hen', 'duck', 'penguin', 'ostrich', 'dino'];
  function lv(w, goal, pace, s) {
    var L = { w: w, goal: goal, pace: pace, warnMul: s.warn || 1, obs: s.obs || [], zones: s.zones || [], pads: s.pads || [], deco: s.deco || [], guards: [], nests: [] };
    var r = KR[KIND[w]];
    (s.g || []).forEach(function (g) {
      L.guards.push({ at: [g[0], g[1]], look: g[2], sweep: g[3], sleep: g[4], tier: g[5] || 1 });
      if (g[6] !== -1) {
        var d = g[7] || r + 34, a = g[2] * Math.PI / 180;
        L.nests.push([Math.round(g[0] + Math.cos(a) * d), Math.round(g[1] + Math.sin(a) * d), g[6] || 0, g[5] || 1]);
      }
    });
    (s.p || []).forEach(function (p) { L.guards.push({ at: p.at, path: p.path, sleep: 0, sweep: p.sweep, tier: p.tier || 1 }); });
    (s.n || []).forEach(function (n) { L.nests.push(n); });
    return L;
  }
  ER.LEVELS = [
    /* ---------------- World 1: the meadow farm (hens, chicks) ---------------- */
    // One hen and a very long warning: freeze when her eye opens.
    lv(0, 3, 11.5, { warn: 1.6, g: [[808, 400, 180, 22, 3.2]],
      obs: [['hay', 470, 214, 116, 60], ['hay', 470, 572, 116, 60], ['barrel', 1072, 222, 56, 56], ['bush', 1040, 566, 100, 76], ['bush', 676, 120, 96, 62]] }),
    // Two hens taking turns.
    lv(0, 4, 10.5, { g: [[772, 238, 180, 24, 2.6], [912, 566, 195, 22, 6.4]],
      obs: [['hay', 478, 372, 120, 60], ['barrel', 1090, 372, 56, 56], ['bush', 300, 590, 100, 72], ['fence', 980, 150, 150, 14], ['bush', 640, 420, 84, 64]] }),
    // Three hens and a hedge to hide behind.
    lv(0, 5, 9, { g: [[660, 196, 172, 24, 2.4], [1010, 400, 180, 26, 5.2], [660, 614, 188, 24, 7.8], [1160, 200, 160, 20, 4, 4]],
      obs: [['bush', 430, 300, 86, 66], ['bush', 430, 444, 86, 66], ['fence', 830, 246, 14, 104], ['fence', 830, 452, 14, 104],
        ['hay', 250, 572, 104, 56], ['hay', 1100, 600, 116, 56]] }),
    // A golden egg behind the hen in the gap: worth 3, but you walk slower with it.
    lv(0, 6, 8.5, { g: [[560, 196, 180, 22, 3], [560, 612, 180, 22, 5.6], [920, 400, 180, 30, 4.2], [1168, 400, 180, 34, 6.6, 1, 1], [1150, 180, 200, 20, 2, 3]],
      obs: [['fence', 730, 96, 14, 196], ['fence', 730, 508, 14, 196], ['hay', 810, 196, 96, 56], ['hay', 810, 552, 96, 56], ['bush', 380, 372, 92, 64],
        ['barrel', 1060, 560, 56, 56]] }),

    /* ---------------- World 2: the duck pond (ducks, ducklings) ---------------- */
    // Shallow water slows you down; the lily pads do not.
    lv(1, 3, 15.5, { g: [[930, 392, 180, 24, 3.4]],
      zones: [['water', 420, 236, 360, 300]], pads: [[462, 392, 30], [528, 360, 30], [596, 398, 30], [664, 366, 30], [734, 396, 30]],
      obs: [['reeds', 600, 474, 64, 44], ['reeds', 480, 248, 60, 40], ['bush', 1060, 190, 96, 70], ['bush', 1080, 580, 96, 70], ['log', 860, 600, 110, 36]] }),
    // A river with a little bridge.
    lv(1, 4, 13.5, { g: [[922, 248, 190, 26, 2.8], [1010, 566, 170, 24, 6.2]],
      zones: [['water', 520, 96, 176, 252], ['water', 520, 424, 176, 280]], pads: [[560, 492, 28], [624, 548, 28], [566, 610, 28], [628, 668, 26], [568, 170, 28], [634, 230, 28]],
      obs: [['reeds', 708, 372, 46, 72], ['reeds', 466, 300, 46, 68], ['bush', 290, 590, 96, 70], ['log', 1080, 380, 116, 36]],
      deco: [['bridge', 608, 386]] }),
    // An island duck in the middle of the pond.
    lv(1, 5, 20, { g: [[660, 372, 180, 28, 2.6], [1062, 214, 196, 24, 5], [1062, 572, 164, 24, 7.4], [880, 640, 200, 20, 4, 4]],
      zones: [['water', 380, 150, 540, 440], ['land', 500, 280, 290, 180]],
      pads: [[420, 330, 28], [458, 404, 28], [430, 200, 26], [840, 330, 26], [430, 530, 26]],
      obs: [['reeds', 710, 280, 46, 50], ['reeds', 250, 180, 56, 46], ['bush', 1140, 380, 96, 70], ['reeds', 960, 400, 46, 60]] }),
    // A duck swims around the pond; a golden egg waits on the far bank.
    lv(1, 6, 12.5, { g: [[1050, 236, 180, 22, 3], [1050, 572, 180, 22, 6], [1176, 404, 180, 30, 4.6, 1, 1]],
      p: [{ at: [470, 176], path: [[470, 176, 45], [810, 176, 135], [810, 614, 225], [470, 614, 315]] }],
      n: [[640, 396, 0]],
      zones: [['water', 400, 120, 480, 556], ['land', 586, 350, 108, 92]], pads: [[460, 300, 30], [530, 380, 30], [600, 300, 30], [700, 470, 30], [780, 380, 30], [520, 520, 30]],
      obs: [['reeds', 610, 448, 60, 44], ['reeds', 660, 230, 60, 44], ['bush', 960, 380, 86, 66], ['log', 250, 600, 110, 36]] }),

    /* ---------------- World 3: the snowy farm (penguins, chicks) ---------------- */
    // Ice is slippery: you keep sliding after you let go.
    lv(2, 3, 10.5, { g: [[836, 400, 180, 22, 3.6]],
      zones: [['ice', 430, 300, 250, 200]],
      obs: [['snow', 480, 170, 110, 62], ['snow', 480, 570, 110, 62], ['snow', 1060, 230, 100, 60], ['iceblock', 1070, 560, 70, 64]] }),
    // Two penguins and two ice lanes.
    lv(2, 4, 11, { g: [[780, 222, 186, 24, 2.8], [980, 584, 174, 24, 6.2]],
      zones: [['ice', 380, 150, 220, 150], ['ice', 590, 420, 270, 170]],
      obs: [['snow', 430, 520, 96, 58], ['snow', 1090, 340, 100, 62], ['iceblock', 660, 330, 70, 62], ['snow', 300, 330, 90, 56]] }),
    // Three penguins round an ice rink.
    lv(2, 5, 11, { g: [[640, 160, 90, 30, 2.4], [1010, 380, 180, 26, 5], [640, 640, 270, 30, 7.6], [1170, 600, 200, 20, 4, 4]],
      zones: [['ice', 450, 260, 380, 240]],
      obs: [['snow', 290, 200, 86, 56], ['snow', 290, 520, 86, 56], ['snow', 880, 180, 96, 56], ['snow', 880, 560, 96, 56], ['iceblock', 600, 360, 64, 58]] }),
    // Sweeping penguins, ice and a golden egg.
    lv(2, 6, 9, { g: [[560, 206, 160, 34, 3], [560, 600, 200, 34, 5.8], [890, 400, 180, 40, 4.2], [1168, 404, 180, 30, 6.8, 1, 1], [1150, 170, 200, 20, 2, 3]],
      zones: [['ice', 640, 280, 196, 240], ['ice', 960, 120, 150, 110], ['ice', 960, 570, 150, 110], ['ice', 300, 340, 160, 120]],
      obs: [['iceblock', 750, 150, 70, 60], ['iceblock', 750, 590, 70, 60], ['snow', 380, 520, 96, 58], ['snow', 1060, 300, 80, 56]] }),

    /* ---------------- World 4: the desert oasis (ostriches) ---------------- */
    // An ostrich turns its long neck: hide behind the cactus.
    lv(3, 3, 10.5, { g: [[860, 400, 180, 46, 3.6]],
      obs: [['cactus', 560, 300, 44, 44], ['cactus', 610, 520, 44, 44], ['rock', 420, 420, 86, 56], ['rock', 720, 168, 96, 58], ['cactus', 1080, 230, 44, 44], ['rock', 1060, 560, 96, 60]] }),
    // Two ostriches at the oasis.
    lv(3, 4, 12, { g: [[790, 220, 182, 50, 2.8], [990, 584, 178, 50, 6.4]],
      zones: [['water', 560, 344, 200, 118]], pads: [],
      obs: [['palm', 528, 314, 34, 34], ['palm', 766, 450, 34, 34], ['cactus', 420, 200, 44, 44], ['cactus', 420, 560, 44, 44], ['rock', 1090, 360, 96, 60], ['cactus', 880, 400, 44, 44]] }),
    // A walking ostrich crosses the yard.
    lv(3, 5, 15, { g: [[1060, 400, 180, 50, 4.8]],
      p: [{ at: [640, 190], path: [[640, 190, 90], [640, 610, 270]], sweep: 46 }],
      n: [[760, 300, 0], [520, 520, 0, 3]],
      obs: [['rock', 420, 300, 90, 58], ['cactus', 760, 520, 44, 44], ['rock', 860, 180, 96, 58], ['cactus', 300, 580, 44, 44], ['cactus', 900, 600, 44, 44]] }),
    // Three ostriches and a golden egg.
    lv(3, 6, 9.5, { g: [[580, 200, 168, 48, 3], [580, 604, 192, 48, 6], [900, 400, 180, 50, 4.4], [1172, 404, 180, 40, 7, 1, 1]],
      obs: [['rock', 400, 380, 90, 58], ['cactus', 740, 260, 44, 44], ['cactus', 740, 500, 44, 44], ['rock', 1040, 180, 90, 56], ['rock', 1040, 580, 90, 56], ['palm', 860, 130, 34, 34]] }),

    /* ---------------- World 5: dino valley (a sleepwalking dino mum) ---------------- */
    // The dino mum sleepwalks round her nests and looks around at each stop.
    lv(4, 3, 13.5, { p: [{ at: [740, 230], path: [[740, 230, 40], [1100, 230, 140], [1100, 600, 220], [740, 600, 320]], sweep: 22 }],
      n: [[920, 340, 0], [920, 500, 0]],
      obs: [['fern', 520, 360, 90, 70], ['rock', 560, 160, 96, 58], ['rock', 560, 590, 96, 58], ['bones', 1170, 410, 60, 40]] }),
    // A walking mum and a dozing dad.
    lv(4, 4, 13, { g: [[1110, 400, 180, 24, 5]],
      p: [{ at: [640, 200], path: [[640, 200, 60], [880, 200, 120], [880, 600, 240], [640, 600, 300]], sweep: 20 }],
      n: [[760, 400, 0]],
      obs: [['fern', 470, 300, 84, 66], ['fern', 470, 470, 84, 66], ['rock', 980, 220, 90, 56], ['rock', 980, 560, 90, 56], ['bones', 300, 600, 60, 40]] }),
    // Two sleepwalkers and fences.
    lv(4, 5, 12.5, { p: [{ at: [560, 200], path: [[560, 200, 70], [560, 600, 290]], sweep: 30 },
      { at: [1010, 600], path: [[1010, 600, 250], [1010, 200, 110]], sweep: 30 }],
      g: [[1170, 400, 180, 20, 4, 4]],
      n: [[700, 400, 0], [880, 280, 0], [880, 540, 0]],
      obs: [['fence', 790, 96, 14, 150], ['fence', 790, 558, 14, 146], ['fern', 390, 380, 80, 62], ['rock', 700, 600, 86, 56], ['rock', 1130, 180, 90, 56]] }),
    // The giant golden egg: worth 5, but heavy.
    lv(4, 8, 11.5, { g: [[1170, 400, 180, 26, 6, 1, 2, 92]],
      p: [{ at: [700, 190], path: [[700, 190, 80], [900, 400, 180], [700, 610, 280], [520, 400, 0]], sweep: 26 }],
      n: [[700, 400, 0], [880, 200, 0], [880, 600, 0]],
      obs: [['fern', 360, 220, 84, 66], ['fern', 360, 520, 84, 66], ['rock', 1000, 280, 90, 56], ['rock', 1000, 520, 90, 56], ['bones', 600, 300, 56, 38], ['bones', 600, 480, 56, 38]] })
  ];

  // Two-player yards: the left half is mirrored onto the right (a 6th entry true means centred).
  ER.DUO = [
    { g: [[440, 200, 0, 30, 2.6], [470, 600, 330, 28, 5.4], { center: 1 }],
      obs: [['hay', 270, 300, 100, 56], ['barrel', 560, 380, 52, 52], ['bush', 270, 600, 90, 64]] },
    { zones: [['water', 500, 300, 280, 180, true]], pads: [[540, 390, 28, true], [610, 350, 28, true], [680, 420, 28, true], [740, 370, 28, true]],
      g: [[440, 200, 0, 30, 2.6], [470, 600, 330, 28, 5.4], { center: 1 }],
      obs: [['reeds', 300, 300, 50, 60], ['log', 260, 600, 100, 34]] },
    { zones: [['ice', 480, 300, 320, 180, true]],
      g: [[440, 200, 0, 30, 2.6], [470, 600, 330, 28, 5.4], { center: 1 }],
      obs: [['snow', 270, 300, 96, 58], ['iceblock', 600, 210, 80, 60, true]] },
    { g: [[440, 200, 0, 46, 2.6], [470, 600, 330, 46, 5.4], { center: 1 }],
      obs: [['cactus', 300, 320, 44, 44], ['rock', 560, 380, 70, 48], ['cactus', 280, 600, 44, 44]] },
    { g: [[440, 200, 0, 24, 2.6], [470, 600, 330, 24, 5.4]],
      p: { at: [640, 180], path: [[640, 180, 90], [640, 620, 270]], sweep: 40 },
      obs: [['fern', 270, 300, 84, 64], ['rock', 270, 600, 90, 56]] }
  ].map(function (d, b) {
    var r = KR[KIND[b]], out = { obs: d.obs || [], zones: d.zones || [], pads: d.pads || [], deco: [], guards: [], nests: [] };
    d.g.forEach(function (g) {
      if (g.center) {
        // A guard in the middle looking down at a shared nest, and a golden egg that
        // appears half way through the race.
        out.guards.push({ at: [640, 236], look: 90, sweep: 36, sleep: 4, center: true });
        out.nests.push([640, 236 + r + 34, 0, 1, 0, true]);
        return;
      }
      out.guards.push({ at: [g[0], g[1]], look: g[2], sweep: g[3], sleep: g[4], sleep2: g[4] + 1.7 });
      var a = g[2] * Math.PI / 180, dd = r + 34;
      out.nests.push([Math.round(g[0] + Math.cos(a) * dd), Math.round(g[1] + Math.sin(a) * dd), 0, 1]);
    });
    if (d.p) {
      out.guards.push({ at: d.p.at, path: d.p.path, sweep: d.p.sweep, sleep: 0, center: true });
      out.nests.push([640, 400, 0, 1, 0, true]);
    }
    out.nests.push([640, 560, 1, 1, 40, true]);
    return out;
  });
})();

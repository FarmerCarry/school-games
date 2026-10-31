/*
 * Castle Crash forts. Each one is a real little castle: side towers, a spine,
 * a shelf with Gloopies, and a cap. Coordinates are world pixels, y down,
 * ground top 640. No Kit and no randomness.
 */
(function (root) {
  'use strict';

  var G = 640, R = 20, U = 52;

  // The court (spine, shelf, cap, Gloopies) stands on the spine alone, and the
  // top of the keep stays open so a lob can reach it. Towers get battlements
  // and eaves; a low gate sits in front and never holds the shelf up.
  function castle(x, o) {
    o = o || {};
    var towers = o.towers || 4, spineN = o.spineN || 3, gap = o.gap || 140;
    var tMat = o.tower || 'wood', sMat = o.spineMat || 'wood', sh = o.shelf || sMat;
    var trim = tMat === 'wood' ? 'stone' : 'wood';
    var blocks = [], gloopies = [], i, mat;
    function B(m, cx, cy, w, h) { blocks.push({ mat: m, x: cx, y: cy, w: w, h: h, a: 0, wedge: 0 }); }
    for (i = 0; i < towers; i++) {
      B(tMat, x - gap, G - U / 2 - i * U, U, U);
      B(tMat, x + gap, G - U / 2 - i * U, U, U);
    }
    for (i = 0; i < spineN; i++) {
      mat = (o.soda === i) ? 'soda' : sMat;
      B(mat, x, G - U / 2 - i * U, U, U);
    }
    var shelfY = G - spineN * U - 14;
    B(sh, x, shelfY, Math.min(gap - 16, 160), 28);
    var shelfTop = shelfY - 14;
    var capMat = sMat === 'stone' ? 'wood' : sMat;
    B(capMat, x, shelfTop - U / 2, 46, U);
    gloopies.push(
      { x: x - 46, y: shelfTop - R, r: R },
      { x: x + 46, y: shelfTop - R, r: R },
      { x: x, y: shelfTop - U - R, r: R }
    );
    var towerTop = G - towers * U;
    B(tMat, x - gap, towerTop - 11, U + 20, 22);
    B(tMat, x + gap, towerTop - 11, U + 20, 22);
    // Eaves leave a hole over the keep. They rest on the battlements.
    var eave = Math.min(48, gap * 0.32);
    B(trim, x - gap + eave * 0.15, towerTop - 22 - 8, eave, 16);
    B(trim, x + gap - eave * 0.15, towerTop - 22 - 8, eave, 16);
    var post = Math.min(gap * 0.42, 72);
    B('wood', x - post, G - 26, 24, 52);
    B('wood', x + post, G - 26, 24, 52);
    B(trim, x, G - 61, post * 2 + 6, 18);
    if (o.fence) B('wood', x - gap * 0.62, G - 78, 22, 52);
    return { blocks: blocks, gloopies: gloopies };
  }

  // Ramp: short wood castles, then taller, then stone towers with an ice or
  // soda spine so a single good shot still brings the middle down.
  var SPEC = [
    // Wood Woods
    { towers: 4, spineN: 3, gap: 126 },
    { towers: 4, spineN: 3, gap: 134 },
    { towers: 4, spineN: 3, gap: 136 },
    { towers: 4, spineN: 3, gap: 140, fence: 1 },
    { towers: 4, spineN: 3, gap: 148 },
    { towers: 5, spineN: 3, gap: 150 },
    { towers: 5, spineN: 4, gap: 146 },
    { towers: 5, spineN: 4, gap: 154, fence: 1 },
    { towers: 4, spineN: 3, gap: 130, tower: 'stone', spineMat: 'ice', shelf: 'ice' },
    { towers: 4, spineN: 3, gap: 132, tower: 'stone', spineMat: 'ice', shelf: 'ice' },
    { towers: 4, spineN: 3, gap: 140, tower: 'stone', spineMat: 'ice', shelf: 'ice', fence: 1 },
    { towers: 4, spineN: 3, gap: 148, tower: 'ice', spineMat: 'ice', shelf: 'wood' },
    { towers: 5, spineN: 3, gap: 142, tower: 'stone', spineMat: 'ice', shelf: 'ice' },
    { towers: 5, spineN: 4, gap: 150, tower: 'stone', spineMat: 'ice', shelf: 'ice' },
    { towers: 5, spineN: 4, gap: 154, tower: 'stone', spineMat: 'wood', shelf: 'ice' },
    { towers: 5, spineN: 4, gap: 158, tower: 'stone', spineMat: 'ice', shelf: 'ice', fence: 1 },
    { towers: 4, spineN: 3, gap: 136, tower: 'stone', spineMat: 'wood', shelf: 'wood', soda: 1 },
    { towers: 4, spineN: 3, gap: 138, tower: 'stone', spineMat: 'stone', shelf: 'wood' },
    { towers: 4, spineN: 3, gap: 144, tower: 'stone', spineMat: 'wood', shelf: 'wood', soda: 1, fence: 1 },
    { towers: 4, spineN: 4, gap: 148, tower: 'stone', spineMat: 'wood', shelf: 'ice', soda: 2 },
    { towers: 5, spineN: 3, gap: 150, tower: 'stone', spineMat: 'stone', shelf: 'wood' },
    { towers: 5, spineN: 4, gap: 146, tower: 'stone', spineMat: 'wood', shelf: 'wood', soda: 1 },
    { towers: 5, spineN: 4, gap: 154, tower: 'stone', spineMat: 'stone', shelf: 'wood', fence: 1 },
    { towers: 5, spineN: 4, gap: 158, tower: 'stone', spineMat: 'wood', shelf: 'wood', soda: 2 }
  ];

  function allow(i) {
    var a = ['ball'];
    if (i >= 2) a.push('marble');
    if (i >= 4) a.push('bowl');
    if (i >= 9) a.push('ice');
    if (i >= 16) a.push('boom');
    return a;
  }

  var NAMES = ['غابة الخشب', 'قمم الجليد', 'صحراء الحجر'];
  var levels = [], i, w, lv, forts, s, spec;
  for (i = 0; i < 24; i++) {
    w = Math.floor(i / 8) + 1;
    lv = (i % 8) + 1;
    spec = SPEC[i];
    forts = [];
    for (s = 0; s < 3; s++) {
      forts.push(castle(660 + s * 18, {
        towers: spec.towers,
        spineN: spec.spineN,
        gap: spec.gap + s * 4,
        tower: spec.tower,
        spineMat: spec.spineMat,
        shelf: spec.shelf,
        soda: spec.soda,
        fence: spec.fence && s !== 1
      }));
    }
    levels.push({
      id: 'w' + w + '-' + lv, world: w, level: lv, name: NAMES[w - 1],
      ammo: 7, allow: allow(i), forts: forts
    });
  }

  root.CCL = { levels: levels, GROUND: G, allow: allow };
})(typeof window !== 'undefined' ? window : globalThis);

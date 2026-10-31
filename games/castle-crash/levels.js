/*
 * Castle Crash forts. Three worlds, eight levels, three forts each.
 * Coordinates are world pixels (y grows downward, ground top is 640).
 * No Kit and no randomness: every fort is the same every time.
 */
(function (root) {
  'use strict';

  function block(mat, x, y, w, h, a) {
    return { mat: mat, x: x, y: y, w: w, h: h, a: a || 0, wedge: 0 };
  }
  function wedge(mat, x, y, w, h) {
    return { mat: mat, x: x, y: y, w: w, h: h, a: 0, wedge: 1 };
  }
  function gloopy(x, y) { return { x: x, y: y, r: 18 }; }

  // A tower with the gloopy on top, open on the sling side.
  function totem(mat, x, n, h) {
    h = h || 46;
    var blocks = [], i;
    for (i = 0; i < n; i++) blocks.push(block(mat, x, 640 - h / 2 - i * h, h, h));
    var top = 640 - n * h - 18;
    return { blocks: blocks, gloopies: [gloopy(x, top)] };
  }
  // Posts stand on the ground. The lintel sits on the posts. The gloopy
  // stands in the doorway, clear of the lintel, so the fort can rest.
  function gate(mat, x) {
    var postH = 86, lintelH = 24;
    return {
      blocks: [
        block(mat, x - 78, 640 - postH / 2, 40, postH),
        block(mat, x + 78, 640 - postH / 2, 40, postH),
        block(mat, x, 640 - postH - lintelH / 2, 196, lintelH)
      ],
      gloopies: [gloopy(x, 622)]
    };
  }
  // A front block and a back wall, both on the ground. The gloopy stands between
  // them with a gap, so nothing starts on top of it.
  function shield(front, back, x) {
    return {
      blocks: [
        block(front, x - 56, 620, 52, 40),
        block(back, x + 70, 596, 40, 88)
      ],
      gloopies: [gloopy(x + 4, 622)]
    };
  }
  // Pillars on the ground, a plank on the pillars, two gloopies on the plank,
  // and a soda crate on the ground between the pillars.
  function sodas(x) {
    var postH = 70, plankH = 22;
    return {
      blocks: [
        block('stone', x - 86, 640 - postH / 2, 42, postH),
        block('stone', x + 86, 640 - postH / 2, 42, postH),
        block('soda', x, 617, 46, 46),
        block('wood', x, 640 - postH - plankH / 2, 214, plankH)
      ],
      gloopies: [
        gloopy(x - 40, 640 - postH - plankH - 18),
        gloopy(x + 40, 640 - postH - plankH - 18)
      ]
    };
  }
  // A low platform on the ground and two gloopies standing on it.
  function twins(mat, x) {
    return {
      blocks: [
        block(mat, x, 620, 180, 40),
        block(mat, x - 64, 566, 32, 68),
        block(mat, x + 64, 566, 32, 68)
      ],
      gloopies: [gloopy(x - 22, 582), gloopy(x + 22, 582)]
    };
  }

  var PLAN = [
    // Wood Woods. Ball, then marbles, then the bowling ball.
    ['totem', 'wood', 2], ['gate', 'wood'], ['totem', 'wood', 3],
    ['gate', 'wood'], ['shield', 'wood', 'wood'], ['totem', 'wood', 3],
    ['twins', 'wood'], ['gate', 'wood'], ['totem', 'wood', 2],
    ['shield', 'wood', 'wood'], ['totem', 'wood', 3], ['gate', 'wood'],
    ['twins', 'wood'], ['totem', 'wood', 2], ['gate', 'wood'],
    ['totem', 'wood', 4], ['shield', 'wood', 'wood'], ['twins', 'wood'],
    ['gate', 'wood'], ['totem', 'wood', 3], ['twins', 'wood'],
    ['shield', 'wood', 'wood'], ['totem', 'wood', 3], ['gate', 'wood'],
    // Ice Peaks.
    ['totem', 'ice', 2], ['gate', 'ice'], ['shield', 'ice', 'ice'],
    ['totem', 'ice', 3], ['gate', 'ice'], ['twins', 'ice'],
    ['totem', 'ice', 2], ['shield', 'ice', 'wood'], ['gate', 'ice'],
    ['totem', 'ice', 4], ['twins', 'ice'], ['gate', 'ice'],
    ['shield', 'ice', 'ice'], ['totem', 'ice', 3], ['twins', 'ice'],
    ['gate', 'ice'], ['totem', 'ice', 3], ['shield', 'ice', 'stone'],
    ['twins', 'ice'], ['gate', 'ice'], ['totem', 'ice', 4],
    ['totem', 'ice', 2], ['gate', 'ice'], ['twins', 'ice'],
    // Stone Desert, with soda-crate chains.
    ['gate', 'stone'], ['totem', 'stone', 2], ['sodas'],
    ['shield', 'stone', 'stone'], ['gate', 'stone'], ['sodas'],
    ['totem', 'stone', 2], ['twins', 'stone'], ['sodas'],
    ['gate', 'stone'], ['shield', 'wood', 'stone'], ['sodas'],
    ['totem', 'stone', 3], ['gate', 'stone'], ['twins', 'stone'],
    ['sodas'], ['shield', 'stone', 'stone'], ['gate', 'stone'],
    ['sodas'], ['totem', 'stone', 2], ['twins', 'stone'],
    ['gate', 'stone'], ['sodas'], ['totem', 'stone', 3]
  ];

  function build(kind, shift) {
    var mat = kind[1], n = kind[2], x = 690 + shift;
    if (kind[0] === 'totem') return totem(mat, x, n);
    if (kind[0] === 'gate') return gate(mat, x);
    if (kind[0] === 'shield') return shield(kind[1], kind[2], x);
    if (kind[0] === 'twins') return twins(mat, x);
    return sodas(x);
  }

  function allow(i) {
    var a = ['ball'];
    if (i >= 2) a.push('marble');
    if (i >= 4) a.push('bowl');
    if (i >= 9) a.push('ice');
    if (i >= 16) a.push('boom');
    return a;
  }

  var NAMES = ['غابة الخشب', 'قمم الجليد', 'صحراء الحجر'];
  var levels = [];
  var i, w, lv, forts, s;
  for (i = 0; i < 24; i++) {
    w = Math.floor(i / 8) + 1;
    lv = (i % 8) + 1;
    forts = [];
    for (s = 0; s < 3; s++) forts.push(build(PLAN[i * 3 + s], s * 70));
    levels.push({
      id: 'w' + w + '-' + lv, world: w, level: lv, name: NAMES[w - 1],
      ammo: 7, allow: allow(i), forts: forts
    });
  }

  root.CCL = { levels: levels, GROUND: 640, allow: allow };
})(typeof window !== 'undefined' ? window : globalThis);

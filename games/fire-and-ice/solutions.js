/*
 * Fire & Ice — bot solutions for every level (development/testing only).
 * Proves each level can be finished with all gems. See bot.js for commands.
 */
(function (root) {
  'use strict';
  var FI = root.FI || (root.FI = {});
  function mv(w, k) { for (var i = 0; i < w.movers.length; i++) if (w.movers[i].key === k) return w.movers[i]; }
  function at(k, ty) { return function (w) { var m = mv(w, k); return m.y === ty * 32 && !m.moving; }; }
  function atX(k, tx) { return function (w) { var m = mv(w, k); return m.x === tx * 32; }; }
  function cx(who, tx) { return function (w) { var p = w[who]; return Math.abs(p.x + p.w / 2 - (tx * 32 + 16)) < 6; }; }
  FI.solHelpers = { mv: mv, at: at, atX: atX, cx: cx };
  FI.SOLUTIONS = {
    1: [
      ['I', 'go', 5], ['I', 'jump', 8.5], ['I', 'go', 22], ['I', 'jump', 23], ['I', 'jump', 25.5], ['I', 'jump', 20],
      ['I', 'go', 16], ['I', 'jump', 12.5], ['I', 'go', 5], ['I', 'jump', 2], ['I', 'jump', 2], ['I', 'go', 18],
      ['F', 'jump', 16, { at: 12 }], ['F', 'go', 22], ['F', 'jump', 23], ['F', 'jump', 25.5], ['F', 'jump', 20],
      ['F', 'go', 11], ['F', 'jump', 6, { at: 10 }], ['F', 'go', 5], ['F', 'jump', 2], ['F', 'jump', 2], ['F', 'go', 16]
    ],
    2: [
      ['I', 'jump', 12], ['I', 'go', 11], ['F', 'jump', 15], ['F', 'go', 16],
      ['I', 'go', 1.5], ['I', 'jump', 2], ['I', 'jump', 2], ['I', 'jump', 2], ['I', 'jump', 16, { at: 11 }], ['I', 'go', 22],
      ['F', 'go', 25.5], ['F', 'jump', 25], ['F', 'jump', 25], ['F', 'jump', 25], ['F', 'jump', 11, { at: 15 }], ['F', 'go', 5]
    ],
    3: [
      ['F', 'jump', 3], ['I', 'go', 9], ['I', 'jump', 9], ['I', 'go', 7], ['F', 'go', 14], ['I', 'go', 20],
      ['I', 'jump', 23, { at: 20 }], ['I', 'go', 27], ['I', 'jump', 27], ['I', 'go', 24], ['I', 'jump', 21.5], ['F', 'go', 17], ['until', at('E', 9)], ['I', 'go', 24],
      ['F', 'jump', 23.5, { at: 20 }], ['F', 'go', 29], ['F', 'jump', 29], ['until', at('E', 16)], ['F', 'go', 24], ['F', 'jump', 21.5], ['I', 'go', 26], ['until', at('E', 9)],
      ['F', 'go', 20], ['F', 'jump', 16, { at: 19 }], ['F', 'go', 9], ['F', 'jump', 6, { at: 9 }], ['F', 'go', 3],
      ['I', 'jump', 19, { at: 24 }], ['I', 'go', 14], ['I', 'jump', 11, { at: 14 }], ['I', 'go', 9], ['I', 'jump', 6, { at: 9 }], ['I', 'go', 5]
    ],
    4: [
      ['par', [['I', 'go', 8]], [['F', 'go', 9]]],
      ['par', [['until', cx('ice', 12)], ['I', 'hop'], ['until', cx('ice', 20)], ['I', 'hop']],
              [['until', cx('fire', 16)], ['F', 'hop'], ['until', cx('fire', 22)], ['F', 'hop']]],
      ['until', atX('M', 22)], ['I', 'go', 25.5], ['F', 'go', 29], ['until', at('E', 9)],
      ['I', 'go', 30], ['until', at('E', 15)], ['F', 'go', 25.5], ['I', 'go', 27], ['until', at('E', 9)],
      ['F', 'go', 23], ['F', 'go', 19], ['F', 'jump', 16], ['F', 'go', 13], ['until', at('C', 9)],
      ['I', 'go', 20], ['I', 'go', 11], ['I', 'jump', 8, { at: 11 }], ['I', 'go', 5],
      ['F', 'go', 11], ['F', 'jump', 8, { at: 11 }], ['F', 'go', 3]
    ],
    5: [
      ['I', 'go', 5], ['I', 'jump', 5], ['F', 'go', 2], ['F', 'jump', 2], ['I', 'walk', 1, 70],
      ['I', 'jump', 9], ['I', 'jump', 11], ['F', 'go', 7], ['F', 'jump', 9], ['F', 'jump', 11],
      ['I', 'go', 15.2], ['I', 'go', 14], ['I', 'jump', 19, { at: 14.5 }], ['I', 'jump', 19],
      ['F', 'jump', 18, { at: 14.5 }], ['F', 'jump', 18],
      ['I', 'go', 23], ['I', 'walk', 1, 110], ['I', 'jump', 28], ['I', 'jump', 29.5], ['I', 'jump', 29.5],
      ['F', 'go', 25], ['F', 'go', 27], ['F', 'jump', 28], ['F', 'jump', 29.5], ['F', 'jump', 29.5],
      ['I', 'go', 23], ['I', 'go', 19], ['I', 'jump', 16], ['I', 'go', 15], ['until', at('P', 6)],
      ['F', 'go', 13], ['F', 'go', 10], ['F', 'jump', 7], ['F', 'go', 6], ['until', at('Q', 6)],
      ['I', 'go', 4], ['F', 'go', 2]
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);

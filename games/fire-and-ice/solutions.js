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
  function fanOn(tx, from, to) {
    return function (w) {
      for (var i = 0; i < w.fans.length; i++) {
        var f = w.fans[i];
        if (f.x === tx * 32) {
          if (!f.on) return false;
          if (from == null) return true;
          var ph = ((w.t + f.phase) % f.cycle + f.cycle) % f.cycle;
          return ph >= from && ph <= to;
        }
      }
      return false;
    };
  }
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
    ],
    6: [
      ['par', [['F', 'go', 6.6]], [['I', 'go', 5.4]]],
      ['par', [['until', cx('ice', 10)], ['I', 'hop']], [['until', cx('fire', 12)], ['F', 'hop']]],
      ['until', atX('M', 14)],
      ['par', [['F', 'go', 18.6]], [['I', 'go', 17.4]]],
      ['par', [['until', cx('ice', 22)], ['I', 'hop']], [['until', cx('fire', 24)], ['F', 'hop']]],
      ['until', atX('N', 26)],
      ['par', [['I', 'go', 32]], [['F', 'go', 30]]], ['I', 'jump', 32], ['I', 'jump', 32],
      ['F', 'go', 33], ['F', 'jump', 33], ['F', 'jump', 33],
      ['I', 'go', 28], ['I', 'go', 24],
      ['F', 'jump', 25, { at: 28 }], ['F', 'go', 22], ['until', atX('Q', 19)], ['F', 'go', 20], ['until', atX('Q', 14)],
      ['F', 'go', 12], ['F', 'go', 7], ['F', 'go', 10],
      ['I', 'go', 22], ['until', atX('Q', 19)], ['I', 'go', 20], ['until', atX('Q', 14)], ['I', 'jump', 9, { at: 13 }], ['I', 'go', 2],
      ['I', 'jump', 2], ['I', 'jump', 2], ['I', 'jump', 2],
      ['F', 'go', 2], ['F', 'jump', 2], ['F', 'jump', 2], ['F', 'jump', 2],
      ['I', 'go', 11], ['until', atX('U', 12)], ['I', 'jump', 13], ['until', atX('U', 15)], ['I', 'jump', 19], ['I', 'go', 23], ['I', 'jump', 27], ['I', 'go', 31],
      ['F', 'go', 11], ['F', 'go', 14], ['F', 'go', 17], ['until', atX('U', 12)], ['F', 'jump', 19], ['until', atX('V', 21)], ['F', 'jump', 22], ['until', atX('V', 24)], ['F', 'jump', 28], ['F', 'go', 33]
    ],
    7: [
      ['F', 'go', 25], ['F', 'go', 31], ['F', 'float', 32.5, 11], ['F', 'go', 27], ['F', 'go', 20],
      ['I', 'jump', 28.5, { at: 24 }], ['I', 'go', 31], ['I', 'float', 32.5, 11], ['I', 'go', 24], ['I', 'go', 20],
      ['I', 'go', 22], ['F', 'go', 19.6], ['F', 'float', 17.5, 5], ['F', 'go', 15], ['F', 'go', 6],
      ['I', 'go', 9], ['I', 'jump', 3, { at: 8 }], ['I', 'float', 2.5, 5], ['I', 'go', 5],
      ['F', 'jump', 20, { at: 16 }], ['F', 'jump', 25.5, { at: 21 }], ['F', 'go', 27],
      ['I', 'jump', 11.5, { at: 7 }], ['I', 'jump', 20, { at: 16 }], ['I', 'go', 29]
    ],
    8: [
      ['I', 'go', 20.5], ['F', 'go', 4], ['until', at('A', 15)],
      ['I', 'go', 22], ['F', 'go', 9], ['F', 'go', 14.5], ['I', 'go', 23], ['until', at('B', 15)], ['F', 'go', 13],
      ['I', 'go', 25], ['I', 'jump', 31, { at: 27 }], ['I', 'go', 32.5], ['F', 'go', 10], ['F', 'go', 12], ['until', at('C', 10)], ['I', 'go', 31],
      ['F', 'jump', 4, { at: 8 }], ['F', 'go', 2.5], ['I', 'go', 28], ['until', at('D', 10)], ['F', 'go', 4],
      ['I', 'jump', 22, { at: 26 }], ['I', 'go', 20.5], ['F', 'go', 5], ['F', 'go', 8], ['until', at('E', 5)], ['I', 'go', 22],
      ['F', 'jump', 14.5, { at: 10 }], ['I', 'go', 24], ['until', at('H', 5)],
      ['F', 'go', 12], ['F', 'jump', 4, { at: 8 }], ['F', 'go', 3],
      ['I', 'jump', 31, { at: 27 }], ['I', 'go', 32]
    ],
    9: [
      ['I', 'go', 3.2], ['I', 'go', 7], ['I', 'jump', 7], ['F', 'go', 9], ['F', 'jump', 9],
      ['I', 'go', 11], ['I', 'enter', 1],
      ['I', 'jump', 19.5, { at: 16 }], ['I', 'float', 19.7, 8], ['I', 'go', 15],
      ['I', 'jump', 20, { at: 17 }], ['I', 'float', 20, 8], ['I', 'go', 23], ['I', 'enter', 1],
      ['I', 'go', 29],
      ['F', 'go', 11], ['F', 'enter', 1],
      ['F', 'jump', 19.5, { at: 16 }], ['F', 'float', 19.5, 8], ['F', 'go', 16],
      ['F', 'jump', 20, { at: 17 }], ['F', 'float', 20, 8], ['F', 'go', 23], ['F', 'enter', 1],
      ['F', 'go', 32], ['F', 'go', 35], ['F', 'jump', 37], ['F', 'go', 37], ['until', at('C', 10)],
      ['I', 'go', 33], ['I', 'go', 36], ['I', 'enter', 1],
      ['F', 'enter', 1],
      ['I', 'go', 32], ['I', 'go', 37], ['until', at('D', 19)],
      ['F', 'jump', 31], ['F', 'go', 33], ['F', 'go', 36], ['F', 'enter', 1],
      ['I', 'enter', 1],
      ['F', 'jump', 5, { at: 9 }], ['F', 'go', 2],
      ['I', 'jump', 5, { at: 9 }], ['I', 'go', 5]
    ],
    10: [
      ['I', 'go', 1.5], ['I', 'enter', -1], ['I', 'go', 10], ['I', 'go', 3.9], ['I', 'go', 8], ['I', 'hop'],
      ['I', 'go', 10], ['I', 'jump', 10],
      ['F', 'go', 9], ['F', 'jump', 9], ['F', 'go', 2.5], ['F', 'enter', -1], ['F', 'go', 5], ['F', 'go', 8], ['F', 'hop'],
      ['par', [['I', 'go', 14]], [['F', 'go', 13.5]]],
      ['until', atX('M', 15)], ['par', [['I', 'go', 15]], [['F', 'go', 15]]],
      ['until', atX('M', 22)], ['I', 'walk', 1, 26], ['F', 'jump', 26.5], ['I', 'jump', 26.5],
      ['F', 'jump', 34.5, { at: 30 }], ['F', 'go', 35], ['F', 'walk', 1, 8], ['F', 'float', 36.5, 5], ['F', 'go', 34],
      ['I', 'jump', 34.5, { at: 30 }], ['I', 'go', 35], ['I', 'walk', 1, 8], ['I', 'float', 36.6, 5], ['I', 'go', 33],
      ['F', 'jump', 26.5, { at: 31 }], ['I', 'jump', 20.5, { at: 25 }], ['F', 'go', 20],
      ['I', 'jump', 14.5, { at: 19 }], ['F', 'jump', 14.5, { at: 19 }],
      ['I', 'go', 13], ['F', 'go', 7], ['I', 'go', 4], ['F', 'go', 2]
    ],
    11: [
      ['F', 'go', 7], ['F', 'go', 11], ['F', 'jump', 13.5], ['F', 'go', 13],
      ['I', 'jump', 5.5, { at: 1.5 }], ['I', 'float', 5.5, 14.3], ['I', 'float', 9.5, 14.3], ['I', 'go', 14],
      ['until', fanOn(17, 0, 0.6)], ['I', 'jump', 17.5], ['I', 'float', 17.5, 11.4], ['until', fanOn(21, 0.1, 0.9)], ['I', 'float', 21.5, 11.4], ['I', 'go', 25.5],
      ['F', 'go', 14], ['until', fanOn(17, 0, 0.6)], ['F', 'jump', 17.5], ['F', 'float', 17.5, 11.4], ['until', fanOn(21, 0.1, 0.9)], ['F', 'float', 21.5, 11.4], ['F', 'go', 25.5],
      ['I', 'go', 30], ['I', 'go', 34], ['I', 'jump', 38], ['until', function (w) { return w.levers[0].on; }],
      ['F', 'jump', 29.5, { at: 26 }], ['F', 'float', 29.5, 14.3], ['F', 'float', 33.5, 14.3], ['F', 'go', 37.5],
      ['I', 'go', 37.5], ['I', 'jump', 37.5], ['I', 'jump', 37.5], ['I', 'jump', 37.5], ['I', 'go', 34],
      ['F', 'jump', 37.5], ['F', 'jump', 37.5], ['F', 'jump', 37.5], ['F', 'go', 29], ['F', 'go', 31]
    ],
    12: [
      ['F', 'walk', -1, 170], ['F', 'go', 7], ['F', 'jump', 7], ['I', 'go', 7], ['I', 'jump', 2.5, { at: 6.5 }], ['I', 'jump', 7.5, { at: 3 }],
      ['par', [['I', 'go', 16.5]], [['F', 'go', 17]]], ['until', atX('M', 18)], ['par', [['I', 'go', 18.5]], [['F', 'go', 19.5]]],
      ['until', atX('M', 25)], ['par', [['I', 'go', 33.5]], [['F', 'go', 32]]], ['F', 'go', 37], ['until', at('E', 15)],
      ['I', 'go', 30], ['until', at('E', 20)], ['F', 'go', 33.5], ['I', 'go', 32], ['until', at('E', 15)],
      ['F', 'go', 29], ['F', 'go', 23], ['I', 'go', 26.5], ['F', 'go', 18], ['F', 'go', 12], ['F', 'jump', 9.5], ['F', 'go', 8],
      ['until', atX('P', 11)], ['I', 'go', 5],
      ['I', 'go', 4.5], ['I', 'walk', -1, 10], ['I', 'float', 2.5, 8.4], ['I', 'go', 5],
      ['F', 'go', 4.5], ['F', 'walk', -1, 10], ['F', 'float', 2.6, 8.4], ['F', 'go', 5],
      ['F', 'enter', 1], ['F', 'go', 35], ['until', at('B', 10)],
      ['I', 'go', 20], ['I', 'go', 27], ['I', 'jump', 34.5, { at: 29.9 }], ['I', 'go', 37], ['I', 'jump', 37], ['I', 'jump', 37],
      ['F', 'go', 37], ['F', 'jump', 37], ['F', 'jump', 37],
      ['par', [['I', 'go', 30]], [['F', 'go', 31]]], ['until', atX('Z', 26)], ['par', [['I', 'go', 27]], [['F', 'go', 28]]],
      ['until', atX('Z', 12)], ['I', 'go', 7], ['F', 'go', 4]
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);

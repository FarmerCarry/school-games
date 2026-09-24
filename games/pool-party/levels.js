/*
 * Pool Party — Trick Shot puzzles (original designs). Node-compatible.
 * Table play area: x 200..1080, y 176..616. Pockets: 0 TL, 1 TR, 2 BL, 3 BR, 4 top side, 5 bottom side.
 *   targets : balls that must all be potted
 *   avoid   : balls that must NOT be potted (usually the 8)
 *   pockets : if set, targets only count in these pockets
 *   shots   : how many shots you get
 *   eightLast: the 8 is a target but must be the last ball down
 */
(function (root) {
  'use strict';
  var LEVELS = [
    { name: 'First Shot', hint: 'Line up the guide with the pocket, pull back and let go!',
      cue: [470, 440], balls: [[1, 788, 534]], targets: [1], shots: 1 },
    { name: 'Side Swipe', hint: 'Cut the 2 into the side pocket.',
      cue: [430, 300], balls: [[2, 590, 540]], targets: [2], pockets: [5], shots: 1 },
    { name: 'Double Trouble', hint: 'Two balls, two shots. Sink them both!',
      cue: [640, 400], balls: [[3, 330, 262], [11, 948, 536]], targets: [3, 11], shots: 2 },
    { name: 'Combo Time', hint: 'Hit the 5 so it knocks the 4 into the corner.',
      cue: [640, 450], balls: [[4, 1010, 244], [5, 968, 286]], targets: [4], pockets: [1], shots: 1 },
    { name: 'Bank It!', hint: 'Bounce the 6 off a rail and into ANY pocket. Watch the bounce line!',
      cue: [560, 250], balls: [[6, 760, 520], [8, 920, 348]], targets: [6], avoid: [8], bank: true, shots: 1 },
    { name: 'Stop Right There', hint: 'Pot the 10 but don’t let the cue ball follow it in. Try back spin!',
      cue: [430, 250], balls: [[10, 850, 494]], targets: [10], pockets: [3], shots: 1, noFollow: true },
    { name: 'Two in One', hint: 'Pot BOTH balls with just ONE shot! Hit one, then bounce into the other.',
      cue: [640, 396], balls: [[7, 1051, 205], [9, 1051, 587]], targets: [7, 9], shots: 1 },
    { name: 'Kick Shot', hint: 'No straight path! Bounce the cue ball off a rail to reach the 15.',
      cue: [700, 300], balls: [[15, 300, 540], [8, 520, 420], [1, 470, 330], [2, 590, 520], [3, 400, 440]], targets: [15], avoid: [8], shots: 1 },
    { name: 'Clean Sweep', hint: 'Sink all four balls in five shots. Plan where the cue ball stops!',
      cue: [400, 396], balls: [[12, 300, 250], [13, 980, 250], [14, 640, 520], [3, 900, 520]], targets: [12, 13, 14, 3], shots: 5 },
    { name: 'Grand Finale', hint: 'Pot the 1, 2 and 3, then finish with the 8. Six shots!',
      cue: [360, 396], balls: [[1, 560, 300], [2, 760, 470], [3, 980, 300], [8, 880, 396]], targets: [1, 2, 3, 8], eightLast: true, shots: 6 }
  ];
  // Judge one finished shot of a trick level. prog = { shotsUsed } (already counts this shot).
  // Returns { status: 'win' | 'fail' | 'go', reason }
  LEVELS.judge = function (lv, prog, shot, st) {
    var i, remaining = 0;
    for (i = 0; i < shot.pots.length; i++) {
      var p = shot.pots[i];
      if (p.n === 0) return { status: 'fail', reason: 'Scratch! The cue ball went in.' };
      if (lv.avoid && lv.avoid.indexOf(p.n) >= 0) return { status: 'fail', reason: 'Oops! Not the ' + p.n + '-ball!' };
      if (lv.targets.indexOf(p.n) >= 0 && lv.pockets && lv.pockets.indexOf(p.pocket) < 0) return { status: 'fail', reason: 'Wrong pocket!' };
      if (lv.targets.indexOf(p.n) >= 0 && lv.bank && p.cush < 1) return { status: 'fail', reason: 'It has to bounce off a rail first!' };
    }
    for (i = 0; i < st.balls.length; i++) if (st.balls[i].on && lv.targets.indexOf(st.balls[i].n) >= 0) remaining++;
    if (lv.eightLast) {
      var eightDown = false;
      for (i = 0; i < st.balls.length; i++) if (st.balls[i].n === 8 && !st.balls[i].on) eightDown = true;
      if (eightDown && remaining > 0) return { status: 'fail', reason: 'The 8 has to go LAST!' };
    }
    if (remaining === 0) return { status: 'win' };
    if (prog.shotsUsed >= lv.shots) return { status: 'fail', reason: lv.shots === 1 ? 'So close! Try again.' : 'Out of shots!' };
    return { status: 'go' };
  };

  LEVELS.makeState = function (lv, P) {
    var list = [{ n: 0, x: lv.cue[0], y: lv.cue[1] }];
    for (var i = 0; i < lv.balls.length; i++) list.push({ n: lv.balls[i][0], x: lv.balls[i][1], y: lv.balls[i][2] });
    return P.fromLayout(list);
  };

  root.PoolLevels = LEVELS;
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);

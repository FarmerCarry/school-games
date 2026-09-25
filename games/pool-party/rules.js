/*
 * Pool Party — simplified 8-ball rules (original code). Node-compatible.
 *
 * match = { groups: [g0, g1] ('solid' | 'stripe' | null), turn: 0|1, isBreak: bool }
 */
(function (root) {
  'use strict';
  var P = root.PoolPhysics || (typeof require !== 'undefined' ? require('./physics.js') : null);
  var Rules = {};

  Rules.other = function (g) { return g === 'solid' ? 'stripe' : g === 'stripe' ? 'solid' : null; };

  Rules.remaining = function (st, group) {
    var c = 0;
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (b.on && P.groupOf(b.n) === group) c++;
    }
    return c;
  };

  // Ball numbers the shooter may legally hit first.
  Rules.targets = function (st, match, player) {
    var g = match.groups[player], out = [], i, b;
    if (match.isBreak) {
      for (i = 0; i < st.balls.length; i++) { b = st.balls[i]; if (b.on && b.n !== 0) out.push(b.n); }
      return out;
    }
    if (!g) {
      for (i = 0; i < st.balls.length; i++) { b = st.balls[i]; if (b.on && b.n !== 0 && b.n !== 8) out.push(b.n); }
      if (!out.length) out.push(8);
      return out;
    }
    for (i = 0; i < st.balls.length; i++) { b = st.balls[i]; if (b.on && P.groupOf(b.n) === g) out.push(b.n); }
    if (!out.length) out.push(8);
    return out;
  };

  // Judge a finished shot. `legal` = Rules.targets() taken BEFORE the shot.
  // Returns { foul, reason, assign, win, lose, keepTurn, ownPots, respot8 }
  Rules.judge = function (match, legal, shot) {
    var p = match.turn, g = match.groups[p];
    var res = { foul: false, reason: '', assign: null, win: false, lose: false, keepTurn: false, ownPots: 0, respot8: false };
    var pots = shot.pots, i, scratch = false, eight = false;
    for (i = 0; i < pots.length; i++) { if (pots[i].n === 0) scratch = true; if (pots[i].n === 8) eight = true; }
    if (shot.first < 0) { res.foul = true; res.reason = 'لم تلمس أي كرة!'; }
    else if (legal.indexOf(shot.first) < 0) {
      res.foul = true;
      res.reason = shot.first === 8 ? 'لمست الكرة 8 أولًا!' : 'لمست الكرة الخطأ أولًا!';
    }
    if (scratch) { res.foul = true; res.reason = 'سقطت الكرة البيضاء!'; }

    var onEight = legal.length === 1 && legal[0] === 8 && !match.isBreak;
    if (eight) {
      if (match.isBreak) { res.respot8 = true; }
      else if (onEight && !res.foul) { res.win = true; return res; }
      else { res.lose = true; res.reason = res.foul ? 'دخلت الكرة 8 مع خطأ!' : 'دخلت الكرة 8 قبل وقتها!'; return res; }
    }

    if (!res.foul && !g) {
      for (i = 0; i < pots.length; i++) {
        var gg = P.groupOf(pots[i].n);
        if (gg === 'solid' || gg === 'stripe') { res.assign = gg; g = gg; break; }
      }
    }
    for (i = 0; i < pots.length; i++) if (g && P.groupOf(pots[i].n) === g) res.ownPots++;
    if (match.isBreak && !res.foul) {
      for (i = 0; i < pots.length; i++) if (pots[i].n !== 0 && pots[i].n !== 8) { res.keepTurn = true; break; }
    } else if (!res.foul && res.ownPots > 0) res.keepTurn = true;
    return res;
  };

  root.PoolRules = Rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
})(typeof window !== 'undefined' ? window : globalThis);

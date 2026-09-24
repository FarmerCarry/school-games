/*
 * Fire & Ice — scripted "bot" that plays a level from a solution script.
 * Used by verify-levels.js (node) to prove every level can be finished,
 * and by window.__game.bot(n) for automated browser playtests.
 * Not loaded by the game itself.
 *
 * A solution is a list of commands run in order:
 *   ['I'|'F', 'go', tx]                      walk to the centre of tile column tx
 *   ['I'|'F', 'jump', tx, {delay, hold, at}] jump, steering toward tx (delay = frames before steering,
 *                                            at = run toward tx and take off when passing column `at`)
 *   ['I'|'F', 'walk', dir, frames]           hold a direction for n frames
 *   ['I'|'F', 'hop']                          jump straight up without steering
 *   ['wait', frames]
 *   ['until', function (w) { return bool }]
 *   ['par', [cmds...], [cmds...]]            run two lists at the same time
 */
(function (root) {
  'use strict';
  var FI = root.FI || (root.FI = {});
  var T = 32;

  function Runner(list) { this.list = list; this.i = 0; this.st = null; }
  Runner.prototype.done = function () { return this.i >= this.list.length; };

  // Returns input for this frame: {fire:{l,r,j}, ice:{l,r,j}}
  Runner.prototype.tick = function (w, out) {
    while (this.i < this.list.length) {
      var c = this.list[this.i];
      if (!this.st) this.st = { f: 0 };
      var st = this.st;
      var fin = runCmd(c, st, w, out);
      st.f++;
      if (fin) {
        if (c[0] === 'I' || c[0] === 'F') { var o = out[who(c)]; o.l = o.r = o.j = false; }
        this.i++; this.st = null; continue;
      }
      if (st.f > 1500) throw new Error('bot command timed out: ' + JSON.stringify(c.slice(0, 3)));
      return;
    }
  };

  function who(c) { return c[0] === 'I' ? 'ice' : 'fire'; }

  function runCmd(c, st, w, out) {
    var p, inp, d, cx, tgt;
    if (c[0] === 'wait') return st.f >= c[1];
    if (c[0] === 'until') return !!c[1](w);
    if (c[0] === 'par') {
      if (!st.a) { st.a = new Runner(c[1]); st.b = new Runner(c[2]); }
      st.a.tick(w, out); st.b.tick(w, out);
      return st.a.done() && st.b.done();
    }
    var k = who(c);
    p = w[k]; inp = out[k];
    cx = p.x + p.w / 2;
    if (c[1] === 'walk') {
      if (st.f >= c[3]) return true;
      if (c[2] > 0) inp.r = true; else inp.l = true;
      return false;
    }
    if (c[1] === 'hop') {
      if (st.f >= 1 && st.f < 40) inp.j = true;
      if (!p.grounded) st.left = true;
      return st.left && p.grounded && st.f > 4;
    }
    if (c[1] === 'go') {
      tgt = c[2] * T + T / 2;
      d = tgt - cx;
      if (Math.abs(d) <= 3 && Math.abs(p.vx) < 30 && p.grounded) return true;
      var sd = p.vx * p.vx / (2 * (p.grounded ? 3400 : 1200)) + 2;
      if (Math.abs(d) > sd || Math.sign(p.vx) !== Math.sign(d)) { if (d > 0) inp.r = true; else inp.l = true; }
      return false;
    }
    if (c[1] === 'jump') {
      var o = c[3] || {};
      tgt = c[2] * T + T / 2;
      d = tgt - cx;
      if (st.f === 0) { st.left = false; st.go = o.at != null; }
      if (st.go) {
        // run-up: walk toward target until passing the take-off column, then jump
        var at = o.at * T + T / 2;
        if ((d > 0 && cx >= at) || (d < 0 && cx <= at)) { st.go = false; st.f0 = st.f; }
        else { if (d > 0) inp.r = true; else inp.l = true; return false; }
      }
      var fj = st.f - (st.f0 || 0);
      var hold = o.hold == null ? 40 : o.hold;
      if (fj >= 1 && fj < hold + 1) inp.j = true;
      if (!p.grounded) st.left = true;
      if (fj >= 1 + (o.delay || 0) || (st.f0 && !o.delay)) {
        var sd2 = p.vx * p.vx / (2 * 1200) + 2;
        if (Math.abs(d) > 3 && (Math.abs(d) > sd2 || Math.sign(p.vx) !== Math.sign(d))) { if (d > 0) inp.r = true; else inp.l = true; }
      }
      if (st.left && p.grounded && fj > 4) {
        // settle on target
        return Math.abs(d) <= 4 || fj > 90;
      }
      if (fj > 200) return true;
      return false;
    }
    throw new Error('bad bot command ' + c);
  }

  FI.Runner = Runner;
  FI.botInput = function () { return { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }; };
})(typeof window !== 'undefined' ? window : globalThis);

/* Wacky Soccer — CPU brain. It only decides WHEN to press the team's one button.
 * Smart part: a short lookahead. It snapshots the world, simulates "press now"
 * and "wait" for ~0.6 s and keeps whichever sends the ball further toward the
 * other goal. skill 0..1 sets how often it looks ahead, how fast it reacts,
 * how picky it is, and how many silly random presses it makes. */
(function () {
  'use strict';
  var WS = window.WS = window.WS || {};

  function CPU(side, skill) {
    this.side = side; this.skill = skill;
    this.cool = 0.4; this.pending = -1; this.think = 0.2;
    this.snap = null; this.lastGain = 0;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  CPU.prototype.update = function (world, dt) {
    var sk = this.skill;
    this.cool -= dt; this.think -= dt;
    if (this.pending >= 0) {
      this.pending -= dt;
      if (this.pending < 0) { this.cool = lerp(0.45, 0.22, sk); return true; }
      return false;
    }
    if (this.cool > 0 || this.think > 0) return false;
    this.think = lerp(0.26, 0.07, sk) * (0.8 + Math.random() * 0.4);
    var want = this.decide(world);
    if (!want && Math.random() < (1 - sk) * 0.05) want = true;           // silly random press
    if (want && Math.random() < (1 - sk) * 0.3) { want = false; this.cool = 0.3; }       // missed chance
    if (want) this.pending = lerp(0.26, 0.0, sk) + Math.random() * lerp(0.12, 0.02, sk);
    return false;
  };

  CPU.prototype.mine = function (world) {
    var out = [];
    for (var i = 0; i < world.players.length; i++) if (world.players[i].side === this.side) out.push(world.players[i]);
    return out;
  };

  CPU.prototype.decide = function (world) {
    var sk = this.skill, me = this.mine(world), i, b;
    // get up when lying down
    for (i = 0; i < me.length; i++) if (me[i].lying() && me[i].lieT > lerp(1.0, 0.15, sk)) return true;
    // is any ball close enough to matter?
    var near = false, far = true;
    for (b = 0; b < world.balls.length; b++) {
      var ball = world.balls[b];
      for (i = 0; i < me.length; i++) {
        var d = Math.abs(ball.x - me[i].x);
        if (d < 300 * me[i].s + ball.r) near = true;
        if (d < 200) far = false;
      }
    }
    if (near) {
      if (Math.random() < sk * sk) {
        var gain = this.lookahead(world);
        this.lastGain = gain;
        return gain > lerp(160, 40, sk);
      }
      return this.heuristic(world, me);
    }
    // everyone far from the ball: hop toward it now and then
    if (far) {
      for (i = 0; i < me.length; i++) {
        var p = me[i], bb = world.nearestBall(p.x);
        if (p.idx === 0 && p.grounded() && p.idleT > lerp(1.4, 0.5, sk) && bb && Math.abs(bb.x - p.x) > 200) return true;
      }
    }
    return false;
  };

  CPU.prototype.heuristic = function (world, me) {
    for (var b = 0; b < world.balls.length; b++) {
      var ball = world.balls[b];
      for (var i = 0; i < me.length; i++) {
        var p = me[i], hip = p.pts.hip;
        var dx = (ball.x - hip.x) * p.dir, dy = ball.y - hip.y;
        if (dx > -10 && dx < p.legLen + ball.r + 30 && dy > -150 && dy < p.legLen + 20) return true;
      }
    }
    return false;
  };

  // value of the current (simulated) situation for this team
  CPU.prototype.value = function (world, x0, goal) {
    var v = 0, dir = this.side === 0 ? 1 : -1, ownX = this.side === 0 ? 0 : WS.W;
    if (goal === 1) return 5000;
    if (goal === -1) return -6000;
    for (var b = 0; b < world.balls.length; b++) {
      var ball = world.balls[b];
      v += (ball.x - x0[b]) * dir + ball.vx * dir * 0.25;
      var dOwn = Math.abs(ball.x - ownX);
      if (dOwn < 380) v -= (380 - dOwn) * 1.5;
    }
    return v;
  };

  CPU.prototype.simulate = function (world, press, T) {
    var dt = 1 / 60, n = Math.round(T / dt), x0 = [], b, i;
    for (b = 0; b < world.balls.length; b++) x0.push(world.balls[b].x);
    if (press) for (i = 0; i < world.players.length; i++) if (world.players[i].side === this.side) world.players[i].press();
    var goal = 0;
    for (var k = 0; k < n && !goal; k++) {
      world.step(dt);
      for (b = 0; b < world.balls.length; b++) {
        var s = WS.goalCheck(world.balls[b]);
        if (s >= 0) { goal = s === this.side ? 1 : -1; break; }
      }
    }
    return this.value(world, x0, goal);
  };

  CPU.prototype.lookahead = function (world) {
    this.snap = world.snapshot(this.snap);
    world.sim = true;
    var T = 0.65;
    var a = this.simulate(world, true, T);
    world.restore(this.snap);
    var bVal = this.simulate(world, false, T);
    world.restore(this.snap);
    world.sim = false;
    return a - bVal;
  };

  // which side scored with this ball: 0 = left team scored (ball in right goal), 1 = right team, -1 none
  WS.goalCheck = function (ball) {
    if (ball.y - ball.r * 0.3 < WS.BAR_Y) return -1;
    if (ball.x < WS.GOAL_D - 16 - ball.r * 0.2) return 1;
    if (ball.x > WS.W - WS.GOAL_D + 16 + ball.r * 0.2) return 0;
    return -1;
  };

  WS.CPU = CPU;
})();

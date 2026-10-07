/* Wacky Soccer — CPU brain. It only decides WHEN to press the team's one button.
 * Smart part: a short lookahead. It snapshots the world, simulates "press now"
 * and "wait" for ~0.6 s and keeps whichever sends the ball further toward the
 * other goal. The two branches run on two ticks in a row (both from the same
 * snapshot) so no single frame pays for the whole lookahead.
 * skill 0..1 sets how often it looks ahead, how fast it reacts,
 * how picky it is, and how many silly random presses it makes.
 * The CPU also adapts to how the other team plays (it hears every press, see notePress):
 * - a low-skill CPU only plays gently against a team that plays: once the ball has been low
 *   and right in front of the other team for QUIET_T seconds without them pressing, the CPU
 *   plays at SHARP skill until they press again (no free wins for not playing);
 * - a Normal or harder CPU plays MASH_UP sharper (up to MASH_MAX) against a team that
 *   presses about every half second or faster (button-mashing), so pressing at the right
 *   moment pays off. Easy lets mashers win. Numbers: BALANCE.md. */
(function () {
  'use strict';
  var WS = window.WS = window.WS || {};

  function CPU(side, skill) {
    this.side = side; this.skill = skill;
    this.cool = 0.4; this.pending = -1; this.think = 0.2;
    this.snap = null; this.now = null; this.half = null; this.pressVal = 0; this.lastGain = 0;
    this.quiet = 0;   // seconds with a ball in front of the other team since it last pressed
    this.since = 2;   // seconds since the other team last pressed
    this.gap = 2;     // running average of the other team's time between presses
    this.sk = skill;  // the skill used right now
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var QUIET_R = 150, QUIET_T = 2, SHARP = 0.85, MASH_GAP = 0.6, MASH_UP = 0.3, MASH_MIN = 0.4, MASH_MAX = 0.95;

  // The other team just pressed its button.
  CPU.prototype.notePress = function () {
    this.gap += (Math.min(this.since, 2) - this.gap) * 0.25;
    this.since = 0; this.quiet = 0;
  };

  // is a ball low and just in front of a player of the other team (so they could kick it)?
  CPU.prototype.ballNearThem = function (world) {
    for (var i = 0; i < world.players.length; i++) {
      var p = world.players[i];
      if (p.side === this.side) continue;
      for (var b = 0; b < world.balls.length; b++) {
        var ball = world.balls[b], dx = (ball.x - p.x) * p.dir;
        if (dx > -20 && dx < QUIET_R && ball.y > p.y - 150) return true;
      }
    }
    return false;
  };

  CPU.prototype.update = function (world, dt) {
    this.since += dt;
    if (this.ballNearThem(world)) this.quiet += dt;
    var sk = this.skill;
    if (this.quiet > QUIET_T) sk = Math.max(sk, SHARP);
    else if (this.gap < MASH_GAP && this.since < 1 && sk > MASH_MIN) sk = Math.min(MASH_MAX, sk + MASH_UP);
    this.sk = sk;
    this.cool -= dt; this.think -= dt;
    if (this.pending >= 0) {
      this.pending -= dt;
      if (this.pending < 0) { this.cool = lerp(0.85, 0.22, sk); return true; }
      return false;
    }
    var want;
    if (this.half === world) {
      // second half of the lookahead started on the previous tick
      var gain = this.lookaheadEnd(world);
      this.lastGain = gain;
      want = gain > lerp(160, 40, sk) || this.approach(world, this.mine(world));
    } else {
      this.half = null;   // a lookahead begun before a kickoff belongs to the old world
      if (this.cool > 0 || this.think > 0) return false;
      this.think = lerp(0.26, 0.07, sk) * (0.8 + Math.random() * 0.4);
      // low skill: sometimes the CPU daydreams for a moment
      if (Math.random() < (1 - sk) * (1 - sk) * 0.35) { this.cool = lerp(1.2, 0.3, sk) * (0.6 + Math.random() * 0.6); return false; }
      want = this.decide(world);
      if (this.half) return false;   // decide() started a lookahead: finish it next tick
    }
    if (!want && Math.random() < (1 - sk) * 0.05) want = true;           // silly random press
    if (want && Math.random() < (1 - sk) * 0.45) { want = false; this.cool = lerp(0.5, 0.2, sk); }   // missed chance
    if (want) this.pending = lerp(0.34, 0.0, sk) + Math.random() * lerp(0.16, 0.02, sk);
    return false;
  };

  CPU.prototype.mine = function (world) {
    var out = [];
    for (var i = 0; i < world.players.length; i++) if (world.players[i].side === this.side) out.push(world.players[i]);
    return out;
  };

  CPU.prototype.decide = function (world) {
    var sk = this.sk, me = this.mine(world), i, b;
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
      if (Math.random() < sk * sk) { this.lookaheadStart(world); return false; }
      return this.heuristic(world, me) || this.approach(world, me);
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

  // standing around near a ball nobody is kicking: hop toward it
  CPU.prototype.approach = function (world, me) {
    var sk = this.sk;
    for (var i = 0; i < me.length; i++) {
      var p = me[i], b = world.nearestBall(p.x);
      if (!b || !p.grounded() || p.lying() || p.idleT < lerp(1.3, 0.5, sk)) continue;
      var d = Math.abs(b.x - p.x);
      if (d > 70 && d < 330) return true;
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

  var LOOK_T = 0.65;
  // tick 1: remember the situation and score "press now"
  CPU.prototype.lookaheadStart = function (world) {
    this.snap = world.snapshot(this.snap);
    world.sim = true;
    this.pressVal = this.simulate(world, true, LOOK_T);
    world.restore(this.snap);
    world.sim = false;
    this.half = world;
  };
  // tick 2: score "wait" from the same remembered situation, then put the live match back
  CPU.prototype.lookaheadEnd = function (world) {
    this.now = world.snapshot(this.now);
    world.restore(this.snap);
    world.sim = true;
    var waitVal = this.simulate(world, false, LOOK_T);
    world.restore(this.now);
    world.sim = false;
    this.half = null;
    return this.pressVal - waitVal;
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

/* هجوم الروبوتات — one-shot cues. Pops are limited to one every 50 ms and change pitch with size. */
(function (A) {
  'use strict';

  var lastPop = 0, lastCoin = 0;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function J() { return window.Kit && Kit.juice; }

  A.pop = function (size) {
    var t = now();
    if (t - lastPop < 50) return;
    lastPop = t;
    var juice = J();
    if (juice) juice.pop(size == null ? 0.45 : size);
  };

  A.coin = function () {
    var t = now();
    if (t - lastCoin < 70) return;
    lastCoin = t;
    var juice = J();
    if (juice) juice.coin(1 + ((t / 70) | 0) % 4);
  };

  A.events = function (run) {
    if (!run) return;
    var juice = J();
    for (var i = 0; i < run.evN; i++) {
      var e = run.ev[i];
      if (e.k === 1) A.pop(e.a === 8 ? 0.95 : e.a === 7 ? 0.8 : e.a === 3 ? 0.65 : e.a === 6 ? 0.25 : 0.35 + (e.a % 4) * 0.08);
      else if (e.k === 2) A.coin();
      else if (e.k === 3 && juice) { if (e.a) juice.impact(0.7); else juice.pop(0.15); }
      else if (e.k === 4 && juice) juice.whoosh(0.8);
      else if (e.k === 5 && juice) juice.impact(0.35);
      else if (e.k === 6 && juice) juice.levelUp();
      else if (e.k === 9 && juice) juice.chime(2);
      else if (e.k === 10 && juice) juice.whoosh(0.55);
      else if (e.k === 11 && juice) juice.impact(e.a ? 0.9 : 0.5);
    }
  };

  A.ui = function (kind) {
    var juice = J();
    if (!juice) return;
    if (kind === 'go') juice.select();
    else if (kind === 'back') juice.back();
    else if (kind === 'win') juice.star(3);
    else if (kind === 'lose') juice.fail();
    else juice.tap();
  };
})(globalThis.RSAudio = globalThis.RSAudio || {});

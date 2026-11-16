/* Balloon Blast — one-shot cues only, through the shared juice kit. No music. */
(function (BBS) {
  'use strict';
  function J() { return window.Kit && Kit.juice; }
  BBS.tap = function () { var j = J(); if (j) j.tap(); };
  BBS.select = function () { var j = J(); if (j) j.select(); };
  BBS.back = function () { var j = J(); if (j) j.back(); };
  BBS.drop = function () { var j = J(); if (j) j.pop(0.35); };
  BBS.kick = function () { var j = J(); if (j) j.whoosh(0.7); };
  BBS.boom = function (n) {
    var j = J(); if (!j) return;
    j.whoosh(Math.min(1, 0.75 + (n || 1) * 0.05));
    j.pop(Math.min(1, 0.6 + (n || 1) * 0.08));
    if (n >= 3) j.streak(Math.min(6, n));
  };
  BBS.item = function () { var j = J(); if (j) j.coin(); };
  BBS.trap = function () { var j = J(); if (j) j.pop(0.8); };
  BBS.free = function () { var j = J(); if (j) j.chime(1); };
  BBS.pop = function () { var j = J(); if (j) j.star(2); };
  BBS.win = function () { var j = J(); if (j) j.levelUp(); };
  BBS.lose = function () { var j = J(); if (j) j.fail(); };
  BBS.pause = function (on) { var j = J(); if (j) j.toggle(!!on); };
})(globalThis.BBS = globalThis.BBS || {});

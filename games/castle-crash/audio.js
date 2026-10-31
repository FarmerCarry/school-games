/* Castle Crash one-shot sounds. Kit.juice only, no loops. */
(function (root) {
  'use strict';
  var J;
  function juice() { return J || (J = root.Kit && root.Kit.juice); }
  root.CCA = {
    pull: function () { var j = juice(); if (!j) return; j.whoosh(0.4); j.tap(); },
    fire: function (heavy) { var j = juice(); if (!j) return; j.whoosh(heavy ? 0.9 : 0.65); j.tap(); },
    hit: function (power) { var j = juice(); if (j) j.impact(Math.max(0.15, Math.min(1, power))); },
    crack: function () { var j = juice(); if (j) j.impact(0.2); },
    break: function (mat) {
      var j = juice(); if (!j) return;
      if (mat === 'ice') { j.chime(2); j.impact(0.28); }
      else if (mat === 'stone') { j.impact(0.9); j.land(0.75); }
      else { j.impact(0.42); j.pop(0.32); }
    },
    blast: function () { var j = juice(); if (!j) return; j.impact(1); j.pop(0.9); },
    boing: function () { var j = juice(); if (j) j.jump(0.7); },
    pop: function () { var j = juice(); if (!j) return; j.pop(0.85); j.coin(2); },
    tap: function () { var j = juice(); if (j) j.select(); },
    back: function () { var j = juice(); if (j) j.back(); },
    win: function () { var j = juice(); if (j) j.levelUp(); },
    lose: function () { var j = juice(); if (j) j.fail(); },
    star: function (n) { var j = juice(); if (j) j.star(n); },
    newAmmo: function () { var j = juice(); if (j) j.chime(3); }
  };
})(typeof window !== 'undefined' ? window : globalThis);

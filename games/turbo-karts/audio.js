/* سباق التوربو — one-shot sounds. Nothing loops, and nothing plays on the menus. */
(function () {
  'use strict';
  var lastEng = 0, lastHiss = 0;

  function tone(o) { if (window.Kit && Kit.audio) Kit.audio.tone(o); }
  function noise(o) { if (window.Kit && Kit.audio) Kit.audio.noise(o); }

  function engine(on, v) {
    if (!on) return;
    var now = performance.now();
    if (now - lastEng < 170) return;
    lastEng = now;
    tone({ freq: 78 + Math.min(160, v) * 0.55, to: 64, type: 'sawtooth', dur: 0.08, vol: 0.035 });
  }

  function drift(on) {
    if (!on) return;
    var now = performance.now();
    if (now - lastHiss < 420) return;
    lastHiss = now;
    noise({ dur: 0.42, vol: 0.06, filter: 2400, to: 700 });
  }

  function turbo(level) {
    if (window.Kit && Kit.juice) Kit.juice.whoosh(0.4 + level * 0.2);
    tone({ freq: 220, to: 660, type: 'triangle', dur: 0.22, vol: 0.08 });
  }

  function item(kind) {
    var J = window.Kit && Kit.juice;
    if (!J) return;
    if (kind === 'coin' || kind === 'cookie') J.coin(kind === 'cookie' ? 3 : 1);
    else if (kind === 'shield' || kind === 'block') J.chime(kind === 'block' ? 2 : 1);
    else if (kind === 'hop' || kind === 'ramp') J.jump(0.6);
    else if (kind === 'drop') J.pop(0.5);
    else if (kind === 'rocket') J.whoosh(0.8);
    else if (kind === 'bump' || kind === 'wall') J.impact(kind === 'wall' ? 0.45 : 0.3);
    else if (kind === 'spin') J.fail();
    else if (kind === 'lap') J.star(1);
    else if (kind === 'finish') J.levelUp();
    else if (kind === 'box') J.pop(0.8);
    else J.tap();
  }

  // Horns are a single cue, always under a second.
  function horn(id) {
    if (id === 'doot') {
      tone({ freq: 330, type: 'square', dur: 0.12, vol: 0.07 });
      tone({ freq: 247, type: 'square', dur: 0.18, vol: 0.06, delay: 0.13 });
    } else if (id === 'bell') {
      tone({ freq: 880, type: 'sine', dur: 0.28, vol: 0.07 });
      tone({ freq: 1320, type: 'sine', dur: 0.2, vol: 0.04, delay: 0.02 });
    } else if (id === 'whistle') {
      tone({ freq: 700, to: 1400, type: 'sine', dur: 0.16, vol: 0.06 });
      tone({ freq: 1400, to: 700, type: 'sine', dur: 0.16, vol: 0.05, delay: 0.16 });
    } else if (id === 'tune') {
      [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.06, delay: i * 0.11 }); });
    } else {
      tone({ freq: 520, type: 'square', dur: 0.09, vol: 0.07 });
      tone({ freq: 390, type: 'square', dur: 0.1, vol: 0.05, delay: 0.09 });
    }
  }

  window.TKA = { engine: engine, drift: drift, turbo: turbo, item: item, horn: horn };
})();

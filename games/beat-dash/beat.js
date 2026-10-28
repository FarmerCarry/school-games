/*
 * Beat Dash — the beat grid of a level (no drawing, no audio, nothing scheduled).
 * Every level has a tempo, a key and a chord progression (levels.js). The game clock
 * turns them into a visual pulse, and a jump, landing, pad or orb sounds a note of the
 * chord that is current at that moment: the player plays the notes, the game never does.
 * The same file runs in the browser (window.BD) and in Node.
 */
(function (root) {
  'use strict';
  var BD = root.BD || (root.BD = {});

  var SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };

  BD.mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  // def: { root (MIDI note), scale, prog (chord roots as scale degrees), intro (bars), chill }
  BD.makeSong = function (def, bpm) {
    return {
      bpm: bpm, root: def.root, scale: SCALES[def.scale] || SCALES.major, prog: def.prog,
      intro: def.intro == null ? 4 : def.intro, chill: !!def.chill, stepDur: 60 / bpm / 4
    };
  };

  // section for a bar: 0 intro, 1 verse, 2 drop (3 = second verse)
  function section(song, bar) {
    if (bar < song.intro) return 0;
    var b = (bar - song.intro) % 32;
    if (song.chill) return b < 16 ? 1 : 3;
    if (b < 8) return 1;
    if (b < 16) return 2;
    if (b < 24) return 3;
    return 2;
  }
  BD.songSection = section;

  // MIDI note `deg` scale steps above the root of the chord playing in `bar`
  // (deg 0, 2, 4 = the chord's root, third and fifth), `oct` octaves up.
  BD.chordNote = function (song, bar, deg, oct) {
    var n = song.prog.length, b = bar - (bar < song.intro ? 0 : song.intro);
    var d = song.prog[(b % n + n) % n] + deg, o = Math.floor(d / 7);
    return song.root + song.scale[((d % 7) + 7) % 7] + 12 * (o + (oct || 0));
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BD;
})(typeof window !== 'undefined' ? window : globalThis);

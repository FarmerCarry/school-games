/*
 * Air Hockey data: the CPU ladder and the unlockable skins. Pure data (no DOM, no Kit).
 * Skill ranges overlap a little: Kit.dda (in game.js) slides each opponent's skill
 * between lo and hi for the children on this PC.
 */
(function (root) {
  'use strict';
  var AHData = {
    // Matches are first to `goals`. Power-ups join from the second opponent on.
    LADDER: [
      { id: 'bubble', name: 'فُقاعة', color: '#ff7eb6', dark: '#c2407e', acc: 'bow', lo: 0.0, hi: 0.22, goals: 5, power: false },
      { id: 'kitty', name: 'بسبوس', color: '#ffa53a', dark: '#c46a0e', acc: 'ears', lo: 0.14, hi: 0.4, goals: 5, power: true },
      { id: 'robo', name: 'روبو', color: '#5fd4ff', dark: '#1c86b8', acc: 'antenna', lo: 0.32, hi: 0.6, goals: 7, power: true },
      { id: 'ninja', name: 'نينجا', color: '#8b6cff', dark: '#4a2fc0', acc: 'band', lo: 0.5, hi: 0.8, goals: 7, power: true },
      { id: 'king', name: 'الملك', color: '#ff4f5e', dark: '#b31f2e', acc: 'crown', lo: 0.68, hi: 1.0, goals: 7, power: true }
    ],
    DUO_GOALS: 5,
    // Skins unlock by the stars collected (never spent). `need` is the star count.
    MALLETS: [
      { id: 'sky', color: '#3fa9ff', dark: '#1b63c9', acc: '', need: 0 },
      { id: 'mint', color: '#3ee39a', dark: '#14a061', acc: 'ears', need: 3 },
      { id: 'bee', color: '#ffd23f', dark: '#c79400', acc: 'antenna', need: 6 },
      { id: 'lava', color: '#ff6b3d', dark: '#bb3412', acc: 'horns', need: 10 },
      { id: 'grape', color: '#b06cff', dark: '#6c2fc4', acc: 'halo', need: 15 },
      { id: 'gold', color: '#ffc94a', dark: '#b8860b', acc: 'crown', need: 21 }
    ],
    PUCKS: [
      { id: 'ice', color: '#f4fbff', glow: '#5ff2ff', need: 0 },
      { id: 'fire', color: '#ffb347', glow: '#ff5a1f', need: 4 },
      { id: 'candy', color: '#ffd1ea', glow: '#ff4fb4', need: 8 },
      { id: 'lime', color: '#eaffc2', glow: '#7dff3a', need: 12 },
      { id: 'rainbow', color: '#ffffff', glow: 'rainbow', need: 18 }
    ],
    TABLES: [
      { id: 'ice', top: '#dff5ff', top2: '#9fd8ff', line: '#ff4f7a', rim: '#2457d6', neon: '#58e8ff', body: '#1a2c6e', floor: '#2a1d5c', sky: '#3a2a86', need: 0 },
      { id: 'neon', top: '#2a1f5e', top2: '#120c38', line: '#ff4fd8', rim: '#16123a', neon: '#ff4fd8', body: '#0b0824', floor: '#120a2e', sky: '#1c0f46', need: 5 },
      { id: 'grass', top: '#8be86a', top2: '#46b84a', line: '#ffffff', rim: '#2f8f3a', neon: '#fff36b', body: '#5c3a1e', floor: '#2f5a2a', sky: '#4a8ad6', need: 9 },
      { id: 'candy', top: '#ffe0f0', top2: '#ffb3d9', line: '#9b5cff', rim: '#ff5aa8', neon: '#ffe14f', body: '#8a2d6a', floor: '#5a2a6e', sky: '#8a4fc0', need: 14 },
      { id: 'space', top: '#1b2350', top2: '#05081c', line: '#ffd84f', rim: '#30307a', neon: '#7dfcff', body: '#0a0b22', floor: '#05061a', sky: '#0b0b2e', need: 19 }
    ],
    // Stars for a win: 1, plus 1 for winning by 3 or more, plus 1 for letting in at most 1.
    stars: function (mine, theirs, target) {
      if (mine < target) return 0;
      return 1 + (mine - theirs >= 3 ? 1 : 0) + (theirs <= 1 ? 1 : 0);
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AHData;
  else root.AHData = AHData;
})(typeof window !== 'undefined' ? window : this);

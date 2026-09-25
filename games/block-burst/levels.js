/*
 * Block Burst — Adventure levels (20). Classic script: window.BB_LEVELS.
 * board: 8 rows. '.' empty, a-h coloured block, R/B/G/Y = block holding a gem
 *        (R ruby, B sapphire, G emerald, Y topaz).
 * gems: {kind: count} to collect   score: points to reach   moves: piece limit (0 = none)
 * diff: piece difficulty 0..1   help: chance of a line-completing piece   gemRate: chance a piece carries a needed gem
 * stars: [max pieces for 3 stars, max pieces for 2 stars]  (tuned with verify-levels.js)
 */
(function (root) {
  'use strict';
  var WORLDS = [
    { name: 'وادي الجواهر', color: '#3ddc84', dark: '#138a4c' },
    { name: 'كهف الكريستال', color: '#4fb8ff', dark: '#1b5fae' },
    { name: 'جزيرة الحلوى', color: '#ff6fb5', dark: '#b02a6e' },
    { name: 'قلعة النجوم', color: '#ffc21f', dark: '#b07800' }
  ];
  var L = [
    // ---------------------------------------------------------------- world 1
    { gems: { 1: 2 }, diff: 0, help: 0.8, gemRate: 0, stars: [5, 9], board: [
      '........',
      '........',
      '........',
      '........',
      '........',
      'aab..cRd',
      'aabR.c.d',
      '........'] },
    { score: 250, diff: 0, help: 0.7, stars: [14, 22], board: [
      '........',
      '........',
      '........',
      '...cc...',
      '..cddc..',
      '........',
      '........',
      '........'] },
    { gems: { 2: 3, 3: 2 }, diff: 0.05, help: 0.7, gemRate: 0.3, stars: [14, 26], board: [
      '...B....',
      '...a....',
      '...e....',
      'fGf.hGh.',
      '...b....',
      '...c....',
      '...B....',
      '........'] },
    { gems: { 4: 5 }, diff: 0.05, help: 0.65, gemRate: 0.45, stars: [16, 28], board: [
      '........',
      '.Y....Y.',
      '........',
      '........',
      '........',
      '.a....a.',
      '..aYYa..',
      '........'] },
    { score: 600, diff: 0.1, help: 0.65, stars: [26, 38], board: [
      'e......e',
      '.e....e.',
      '........',
      '........',
      '........',
      '........',
      '.e....e.',
      'e......e'] },
    // ---------------------------------------------------------------- world 2
    { gems: { 1: 3, 2: 3 }, diff: 0.1, help: 0.6, gemRate: 0.35, stars: [15, 28], board: [
      '........',
      '.RR.BB..',
      'aaaa.ddd',
      '........',
      '........',
      'fff.gggg',
      '.BB..R..',
      '........'] },
    { gems: { 3: 6 }, diff: 0.15, help: 0.6, gemRate: 0.4, stars: [16, 26], board: [
      'cc....cc',
      'cG....Gc',
      '........',
      '...GG...',
      '........',
      '........',
      'cG....Gc',
      'cc....cc'] },
    { score: 1000, diff: 0.15, help: 0.6, stars: [24, 36], board: [
      'hh....hh',
      'h......h',
      '..bbbb..',
      '..b..b..',
      '..b..b..',
      '..bbbb..',
      'h......h',
      'hh....hh'] },
    { gems: { 1: 3, 4: 3 }, diff: 0.15, help: 0.6, gemRate: 0.45, stars: [26, 42], board: [
      'R......Y',
      '.a....a.',
      '..a..a..',
      '...ab...',
      '...ba...',
      '..b..b..',
      '.b....b.',
      'Y......R'] },
    { gems: { 2: 5, 3: 5 }, score: 500, diff: 0.2, help: 0.55, gemRate: 0.4, stars: [22, 34], board: [
      '.gg..gg.',
      'gBBg.GGg',
      'g......g',
      'g......g',
      '.g....g.',
      '..g..g..',
      '...gg...',
      '........'] },
    // ---------------------------------------------------------------- world 3 (move limits)
    { gems: { 1: 4 }, moves: 22, diff: 0.2, help: 0.6, gemRate: 0.4, stars: [11, 16], board: [
      '........',
      '..dd.dd.',
      '.dRddRdd',
      '.ddddddd',
      '..ddddd.',
      '...ddd..',
      '....d...',
      '........'] },
    { score: 900, moves: 44, diff: 0.2, help: 0.55, stars: [26, 33], board: [
      'a.b.c.d.',
      '........',
      'e.f.g.h.',
      '........',
      'a.b.c.d.',
      '........',
      'e.f.g.h.',
      '........'] },
    { gems: { 2: 4, 4: 4 }, moves: 30, diff: 0.25, help: 0.55, gemRate: 0.45, stars: [17, 23], board: [
      'Bee..eeY',
      'e......e',
      '........',
      '...ff...',
      '...ff...',
      '........',
      'e......e',
      'Yee..eeB'] },
    { gems: { 3: 7 }, moves: 34, diff: 0.25, help: 0.55, gemRate: 0.45, stars: [19, 25], board: [
      'G.......',
      'aG......',
      'aaG.....',
      'aaaG....',
      '....G...',
      '.....Gcc',
      '......Gc',
      '.......G'] },
    { score: 1300, moves: 58, diff: 0.3, help: 0.58, stars: [28, 38], board: [
      '........',
      '.hhhhhh.',
      '.h....h.',
      '.h.gg.h.',
      '.h.gg.h.',
      '.h....h.',
      '.hhhhhh.',
      '........'] },
    // ---------------------------------------------------------------- world 4
    { gems: { 1: 3, 2: 2, 3: 2, 4: 2 }, moves: 50, diff: 0.3, help: 0.58, gemRate: 0.45, stars: [26, 36], board: [
      'R.....B.',
      '.b...b..',
      '..b.b...',
      '...Y....',
      '..b.b...',
      '.b...b..',
      'G.....R.',
      '........'] },
    { score: 1700, moves: 62, diff: 0.35, help: 0.58, stars: [31, 42], board: [
      'cc.cc.cc',
      'c......c',
      '........',
      'c..dd..c',
      'c..dd..c',
      '........',
      'c......c',
      'cc.cc.cc'] },
    { gems: { 4: 10 }, moves: 38, diff: 0.35, help: 0.5, gemRate: 0.5, stars: [24, 31], board: [
      '...Y....',
      '..aYa...',
      '.aaYaa..',
      'YYY.YYY.',
      '.aaYaa..',
      '..aYa...',
      '...Y....',
      '........'] },
    { gems: { 1: 6, 2: 6 }, score: 1200, moves: 54, diff: 0.4, help: 0.45, gemRate: 0.5, stars: [30, 38], board: [
      'hRh..hBh',
      'h.h..h.h',
      'hhh..hhh',
      '........',
      '........',
      'fff..fff',
      'fBf..fRf',
      'fff..fff'] },
    { gems: { 1: 4, 2: 4, 3: 4, 4: 4 }, score: 1700, moves: 72, diff: 0.42, help: 0.55, gemRate: 0.5, stars: [40, 54], board: [
      'Y......R',
      '.aa..bb.',
      '.aG..Bb.',
      '........',
      '........',
      '.cR..Yd.',
      '.cc..dd.',
      'B......G'] }
  ];
  L.forEach(function (lv, i) { lv.idx = i; lv.world = Math.floor(i / 5); });
  var api = { LEVELS: L, WORLDS: WORLDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BB_LEVELS = api;
})(typeof window !== 'undefined' ? window : this);

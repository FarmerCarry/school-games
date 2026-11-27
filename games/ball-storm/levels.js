/* Ball Storm (عاصفة الكرات): the 15 levels as little brick pictures. Pure data, no DOM.
 *
 * One character per brick cell (60x48 logical px). Each picture is centred on the
 * 20-column field and starts one row below the top wall.
 *   . empty          lowercase colour letter: jelly (1 hit)
 *   r o y g c b v p w k n = red orange yellow green cyan blue violet pink white ink brown
 *   UPPERCASE colour letter: tough jelly (2 hits)    & tough jelly (3 hits)
 *   # steel (never breaks)    t TNT jelly (pops its neighbours)
 *   * gem (drops a power-up)  3 gem that drops ×3   + gem that drops +10 balls
 *   x a ×2 ring (every ball that flies through it gets a copy)
 * speed: the level's ball speed factor. floor: 'perm' (a bubble floor that never pops),
 * a number of bounces, or 0. first: the power-up the first popped brick always drops.
 * par: seconds for the time star.
 */
(function (root) {
  'use strict';
  var BS = root.BS || (root.BS = {});
  BS.WORLDS = [
    { name: 'أرض الحلوى' },
    { name: 'الفضاء' },
    { name: 'أعماق البحر' }
  ];
  BS.LEVELS = [
    // ---------------------------------------------------------- world 1: candy land
    { name: 'ابتسامة', world: 0, speed: 0.82, floor: 'perm', first: 'x3', par: 60, rows: [
      '.yyyyyy.',
      'yykyykyy',
      'yyyyyyyy',
      'ykyyyyky',
      '.ykkkky.',
      '..y33y..'] },
    { name: 'آيس كريم', world: 0, speed: 0.86, floor: 5, first: 'x3', par: 70, rows: [
      '...pppp...',
      '.ppcpppyp.',
      'pyppcpppcp',
      'pppp++pppp',
      '.onononon.',
      '..nonono..',
      '...onon...'] },
    { name: 'حلوى ملفوفة', world: 0, speed: 0.93, floor: 0, first: 'plus', par: 80, rows: [
      'v...rRrrRr...v',
      'vv.rwrwrwrw.vv',
      'vvvrrr3rrrrvvv',
      'vv.rwrwrwrw.vv',
      'v...rRrrRr...v',
      '..............',
      '......x.......'] },
    { name: 'برغر عملاق', world: 0, speed: 1, floor: 0, first: 'plus', par: 95, rows: [
      '..oooooooo..',
      '.owoowoowoo.',
      'oooooooooooo',
      'gggggggggggg',
      'NNNtNNNNtNNN',
      'yyy*yyyy3yyy',
      '.oooooooooo.'] },
    { name: 'قطة الجيلي', world: 0, speed: 1, floor: 0, first: 'x3', par: 105, rows: [
      '..pp...x....pp..',
      '..pPp......pPp..',
      '..tppppppppppt..',
      '..ppgkppppgkpp..',
      'wwppppp33pppppww',
      'wwpppkppppkpppww',
      '...ppppkkpppp...',
      '....pppppppp....'] },
    // ---------------------------------------------------------------- world 2: space
    { name: 'صاروخ', world: 1, speed: 1.06, floor: 0, first: 'x3', par: 95, rows: [
      '*.....rr.....*',
      '.....rwwr.....',
      '....wwbbww....',
      '..x.wbBBbw....',
      '....wwbbww....',
      '...rwwwwwwr...',
      '..rr.wwww.rr..',
      '.....tyyt.....'] },
    { name: 'كوكب بحلقة', world: 1, speed: 1.08, floor: 0, first: 'x3', par: 110, rows: [
      '#.....oooo.....#',
      '....oyooooyo....',
      '..ccoooo3oooocc.',
      'CCCCCCCCCCCCCCCC',
      '..ccoooooooocc..',
      '....oyooooyo....',
      'x.....oooo......'] },
    { name: 'صحن طائر', world: 1, speed: 1.1, floor: 0, first: 'plus', par: 115, rows: [
      '......cccc......',
      '.....cgkkgc.....',
      '.....cggggc.....',
      '..wwwwwwwwwwww..',
      '#wwywwywwywwyww#',
      '..WWWW*tt*WWWW..',
      '................',
      '.......x........'] },
    { name: 'نجمة', world: 1, speed: 1.12, floor: 0, first: 'big', par: 120, rows: [
      '......yy......',
      '.....yYYy.....',
      'yyyyyy33yyyyyy',
      '.yyykyyyykyyy.',
      '..yyyykkyyyy..',
      '...yyyyyyyy...',
      '..yyyt..tyyy..',
      '.yYy......yYy.'] },
    { name: 'القمر الضاحك', world: 1, speed: 1.14, floor: 0, first: 'shield', par: 140, rows: [
      '....wwwwwwww....',
      '..wwWwwwwwwWww..',
      '.wwwkkwww*kkwww.',
      'wwWwwwwwwwwwwWww',
      'wwwkwwww3wwwkwww',
      'wwwwkkkkkkkkwwww',
      '.wwwwkrrrrkwwww.',
      '..&wwwwwwwwww&..'] },
    // ------------------------------------------------------------ world 3: the deep sea
    { name: 'سمكة', world: 2, speed: 1.16, floor: 0, first: 'big', par: 120, rows: [
      '*...oooooo..........',
      '..oooyooyooo....oo..',
      '.owkoooooooooo.ooo..',
      'oooooOOOOooooooooo..',
      '.ooooooooooooo.ooo..',
      '..oooyooyooo....oo..',
      '....oooooo......x...'] },
    { name: 'أخطبوط', world: 2, speed: 1.18, floor: 0, first: null, par: 130, rows: [
      '.....VVVVVV.....',
      '....vVvvvvVv....',
      '....vwkvvwkv....',
      '....vvv33vvv....',
      '....vvvrrvvv....',
      '..vv.vv..vv.vv..',
      '.v..v..vv..v..v.',
      't..v..v..v..v..t'] },
    { name: 'سلطعون', world: 2, speed: 1.2, floor: 0, first: null, par: 135, rows: [
      'RR..............RR',
      'RRR....*..*....RRR',
      '.RR..k......k..RR.',
      '..r..r......r..r..',
      '..rrrrrrrrrrrrrr..',
      '...rrrRR3RRrrrr...',
      '..r.r.r....r.r.r..',
      '.t..#...x....#..t.'] },
    { name: 'قنديل البحر', world: 2, speed: 1.22, floor: 0, first: 'shield', par: 140, rows: [
      '....pppppp....',
      '..ppPPPPPPpp..',
      '.ppwkpppppwkp.',
      'pppppp++pppppp',
      'p&ppppppppp&pp',
      '.c..c.cc.c..c.',
      '.c.c..cc..c.c.',
      'c..cx.cc..c..c'] },
    { name: 'الوجه العملاق', world: 2, speed: 1.25, floor: 0, first: 'x3', par: 170, rows: [
      '...gggggggggggggg...',
      '..gtttggggggggtttg..',
      '.ggwwkgggg*gggwwkgg.',
      '.GGGGGGGg33gGGGGGGG.',
      'ggkkkkkkkkkkkkkkkkgg',
      'ggkw#w#w#w#w#w#w#kgg',
      '..gkkkkkkkkkkkkkkg..',
      '.x.&gggggggggggg&.x.'] }
  ];
})(typeof window !== 'undefined' ? window : this);

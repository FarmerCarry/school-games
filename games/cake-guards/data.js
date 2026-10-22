/* Cake Guards: towers, jelly blobs, worlds and levels. Plain data, also loaded by Node tests. */
(function (CG) {
  'use strict';

  // Logical play area (Kit.fit scales it). The top band holds the HUD, the bottom band the tower bar.
  CG.W = 1280; CG.H = 720; CG.TOP = 60; CG.BAR = 628;
  CG.ROAD = 27;          // half the road width
  CG.PAD = 30;           // build pad radius
  CG.HEARTS = 20;        // slices of cake
  CG.BREAK = 9;          // seconds between waves before the next one starts by itself

  // Each tower has 3 levels. cost is the price of that level; dps tuning lives here only.
  // aim: 'first' = the blob furthest along the road, 'strong' = the toughest blob in range.
  CG.TOWERS = {
    pop: { name: 'قاذف الفشار', short: 'فشار', aim: 'first', color: '#ffcf33',
      tip: 'سريع ورخيص: يرمي حبات الفشار',
      lv: [{ cost: 50, range: 130, cd: 0.6, dmg: 2 }, { cost: 60, range: 135, cd: 0.42, dmg: 3 }, { cost: 110, range: 150, cd: 0.34, dmg: 5 }] },
    bubble: { name: 'نافخ الفقاعات', short: 'فقاعات', aim: 'first', color: '#6fd3ff',
      tip: 'فقاعاته تبطئ كل الهلام من حولها',
      lv: [{ cost: 70, range: 120, cd: 1.0, dmg: 2, slow: 0.45, slowT: 2, area: 45 }, { cost: 70, range: 130, cd: 0.85, dmg: 3, slow: 0.55, slowT: 2.5, area: 55 },
        { cost: 120, range: 140, cd: 0.75, dmg: 4, slow: 0.6, slowT: 2.5, area: 65, multi: 2 }] },
    cake: { name: 'مدفع الكب كيك', short: 'كب كيك', aim: 'first', color: '#ff7eb6',
      tip: 'يقذف كعكة تفرقع كل من حولها',
      lv: [{ cost: 110, range: 150, cd: 1.6, dmg: 6, splash: 60 }, { cost: 110, range: 155, cd: 1.5, dmg: 10, splash: 70 },
        { cost: 180, range: 165, cd: 1.35, dmg: 16, splash: 80 }] },
    cane: { name: 'عصا السكر', short: 'عصا السكر', aim: 'strong', color: '#ff5a6e',
      tip: 'بعيدة المدى وتخترق الدروع',
      lv: [{ cost: 140, range: 270, cd: 1.8, dmg: 16, pierce: true }, { cost: 130, range: 285, cd: 1.7, dmg: 26, pierce: true },
        { cost: 200, range: 300, cd: 1.5, dmg: 40, pierce: true }] }
  };
  CG.TOWER_ORDER = ['pop', 'bubble', 'cake', 'cane'];
  CG.SELL = 0.7;

  // Jelly blobs. speed in px/s, bite = cake slices eaten, armor is taken off each hit
  // (never below 1), split = blobs left behind when it pops.
  CG.ENEMIES = {
    g: { name: 'هلام صغير', hp: 6, speed: 62, reward: 3, bite: 1, r: 15, color: '#62d26f' },
    z: { name: 'هلام سريع', hp: 4, speed: 118, reward: 3, bite: 1, r: 13, color: '#ffd23f' },
    c: { name: 'هلام ضخم', hp: 32, speed: 40, reward: 8, bite: 2, r: 22, color: '#a77bff' },
    s: { name: 'هلام منقسم', hp: 16, speed: 56, reward: 4, bite: 1, r: 17, color: '#ff8ac8', split: ['m', 'm'] },
    m: { name: 'هلام صغنون', hp: 4, speed: 80, reward: 1, bite: 1, r: 10, color: '#ffb3dc' },
    a: { name: 'هلام مدرّع', hp: 18, speed: 50, reward: 7, bite: 1, r: 17, color: '#55a8ff', armor: 3 },
    k: { name: 'أمير الهلام', hp: 150, speed: 30, reward: 50, bite: 5, r: 30, color: '#ff9f43', boss: true },
    b: { name: 'ملك الهلام', hp: 420, speed: 26, reward: 90, bite: 8, r: 36, color: '#ff5d8f', armor: 1, boss: true }
  };

  // Ground, road and decoration colours of each world.
  CG.WORLDS = [
    { name: 'حديقة الحلوى', ground: '#8fd46a', ground2: '#7cc45a', road: '#f6d8a0', edge: '#d6a463', deco: ['#ff7eb6', '#ffd23f', '#fff'] },
    { name: 'وادي الشوكولاتة', ground: '#f0c27f', ground2: '#e3b06a', road: '#8c5a36', edge: '#5e3a20', deco: ['#fff3d6', '#ff7eb6', '#6fd3ff'] },
    { name: 'جبال الآيس كريم', ground: '#cfe9ff', ground2: '#b9dcfb', road: '#ffc2dc', edge: '#e88cb4', deco: ['#ffffff', '#a77bff', '#62d26f'] }
  ];

  // Roads are drawn on a grid: x = 40 + 80 i, y = 100 + 80 j (j 0..6). Every road ends at the cake.
  // A level with two roads sends its blobs down each in turn.
  // Waves: groups played one after another, 'g8' = 8 blobs of type g, '/0.6' = seconds between them.
  // towers: the towers this level offers; hp: toughness multiplier; coins: money at the start.
  CG.LEVELS = [
    { w: 0, coins: 120, hp: 1, towers: ['pop'], roads: [[[-1, 3], [5, 3], [5, 1], [10, 1], [10, 5], [14, 5]]],
      waves: ['g5', 'g8', 'g10/0.7', 'g8 g8/0.5'] },
    { w: 0, coins: 140, hp: 1, towers: ['pop', 'bubble'], roads: [[[-1, 1], [3, 1], [3, 5], [7, 5], [7, 2], [11, 2], [11, 4], [14, 4]]],
      waves: ['g8', 'z6', 'g10 z5', 'g12/0.6 z8/0.5', 'z14/0.4'] },
    { w: 0, coins: 170, hp: 1.1, towers: ['pop', 'bubble', 'cake'], roads: [[[-1, 5], [2, 5], [2, 1], [6, 1], [6, 4], [9, 4], [9, 1], [13, 1], [13, 4]]],
      waves: ['g10', 'c2/2 g6', 'g10 z8', 'c4/1.8 g10', 'z12/0.4 c3', 'g16/0.45 c5/1.5'] },
    { w: 0, coins: 190, hp: 1.2, towers: ['pop', 'bubble', 'cake'], roads: [[[-1, 2], [4, 2], [4, 5], [8, 5], [8, 1], [12, 1], [12, 5], [14, 5]]],
      waves: ['g14/0.6', 'z12/0.45', 'c5/1.5 g10', 'g12 z10 c4', 'c8/1.2', 'z16/0.35 c4', 'k1 g12/0.6'] },
    { w: 1, coins: 200, hp: 1.35, towers: ['pop', 'bubble', 'cake', 'cane'], roads: [[[-1, 6], [3, 6], [3, 3], [1, 3], [1, 0], [6, 0], [6, 6], [10, 6], [10, 2], [14, 2]]],
      waves: ['g14/0.6', 's5/1.4', 'z12 g12', 's8/1.1 c4', 'c6/1.3 z12/0.4', 's10/0.9 g12/0.5', 'c8 s8 z12/0.4'] },
    { w: 1, coins: 220, hp: 1.45, towers: ['pop', 'bubble', 'cake', 'cane'], roads: [[[-1, 0], [12, 0], [12, 2], [2, 2], [2, 4], [12, 4], [12, 6], [1, 6]]],
      waves: ['g16/0.55', 'z16/0.4', 's10/0.9', 'c10/1.1', 'g14 s8 z12', 'c8 s10', 'z20/0.3 c8/1.1', 's14/0.75 c8'] },
    { w: 1, coins: 260, hp: 1.45, towers: ['pop', 'bubble', 'cake', 'cane'], roads: [[[-1, 3], [3, 3], [3, 0], [7, 0], [7, 6], [11, 6], [11, 0], [14, 0], [14, 3]]],
      waves: ['g14 z10', 'a5/1.4', 'a8/1.1 g12', 's10 a6', 'c8 a8', 'z20/0.32 a8', 'a12/0.9 c6', 's12/0.75 a10/0.9'] },
    { w: 1, coins: 280, hp: 1.5, towers: ['pop', 'bubble', 'cake', 'cane'], roads: [[[-1, 1], [2, 1], [2, 5], [5, 5], [5, 1], [8, 1], [8, 5], [11, 5], [11, 1], [14, 1], [14, 4]]],
      waves: ['g18/0.5', 'a10/1', 's12/0.75', 'c10/0.9 z14/0.38', 'a12/0.85 s8', 'c12/0.85', 'z24/0.28 a10', 'b1 g12/0.6'] },
    { w: 2, coins: 300, hp: 1.55, towers: ['pop', 'bubble', 'cake', 'cane'], roads: [[[-1, 6], [4, 6], [4, 3], [1, 3], [1, 0], [9, 0], [9, 4], [7, 4], [7, 6], [13, 6], [13, 2]]],
      waves: ['g18/0.5 z12/0.38', 'a10/0.95', 's12/0.7', 'c10/0.95 a8', 'z26/0.27', 's14 c8', 'a16/0.75', 'c12/0.8 s12/0.7', 'z22/0.3 a12/0.8 c8'] },
    { w: 2, coins: 320, hp: 1.6, towers: ['pop', 'bubble', 'cake', 'cane'],
      roads: [[[-1, 1], [6, 1], [6, 3], [11, 3], [11, 5], [14, 5]], [[-1, 5], [6, 5], [6, 3], [11, 3], [11, 5], [14, 5]]],
      waves: ['g20/0.45', 'z20/0.32', 'a10/0.9', 's12/0.7', 'c12/0.8', 'a12 s10', 'z26/0.26 c10', 'a16/0.65', 'c14/0.7 s14/0.6'] },
    { w: 2, coins: 340, hp: 1.7, towers: ['pop', 'bubble', 'cake', 'cane'],
      roads: [[[-1, 0], [4, 0], [4, 6], [8, 6], [8, 2], [12, 2], [12, 5], [14, 5]], [[16, 0], [10, 0], [10, 2], [12, 2], [12, 5], [14, 5]]],
      waves: ['g20/0.42 z12/0.32', 'a12/0.8', 's14/0.6', 'c12/0.8 z16/0.3', 'a14/0.7 s12', 'c16/0.65', 'z30/0.24', 'a18/0.58 c10', 's16/0.55 a14/0.65', 'b1 c10/1'] },
    { w: 2, coins: 370, hp: 1.8, towers: ['pop', 'bubble', 'cake', 'cane'],
      roads: [[[-1, 0], [5, 0], [5, 3], [9, 3], [9, 0], [13, 0], [13, 6], [10, 6]], [[-1, 6], [5, 6], [5, 3], [9, 3], [9, 0], [13, 0], [13, 6], [10, 6]]],
      waves: ['g22/0.4', 'z22/0.28', 'a12/0.8', 's12/0.65', 'c14/0.7', 'a14 s12', 'z30/0.24 c10', 'a20/0.55', 'c18/0.6 s14/0.55', 'k2/5 a12', 'b2/8 c12/1'] }
  ];
  // Endless: the road of level 7 and waves made up as they come (CG.endlessWave in engine.js).
  CG.ENDLESS = { w: 1, coins: 260, hp: 1, towers: ['pop', 'bubble', 'cake', 'cane'], roads: CG.LEVELS[6].roads, endless: true };
  CG.ENDLESS_AFTER = 4; // finishing this many levels unlocks endless

  // Cake looks: unlocked by the stars collected in all levels.
  CG.CAKES = [
    { name: 'كعكة الفراولة', stars: 0, sponge: '#fff1d6', cream: '#ff9ec8', top: '#ff5a8a' },
    { name: 'كعكة الشوكولاتة', stars: 9, sponge: '#8c5a36', cream: '#f6e0c4', top: '#5e3a20' },
    { name: 'كعكة الليمون', stars: 18, sponge: '#fff7b0', cream: '#ffffff', top: '#ffd23f' },
    { name: 'كعكة قوس قزح', stars: 30, sponge: '#ffffff', cream: '#a77bff', top: '#6fd3ff', rainbow: true }
  ];
})(globalThis.CG = globalThis.CG || {});

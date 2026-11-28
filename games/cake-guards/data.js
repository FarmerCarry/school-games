/* Cake Guards — Active Frosting Cannon Defense: turrets, blaster, jelly blobs, 12 punchy stages. */
(function (CG) {
  'use strict';

  CG.W = 1280; CG.H = 720; CG.TOP = 60; CG.BAR = 628;
  CG.ROAD = 27;
  CG.PAD = 30;
  CG.HEARTS = 20;
  CG.INTRO = 1.5;   // Wave 1 spawns automatically in 1.5s!
  CG.BREAK = 2.5;   // Snappy 2.5s breather between waves.
  CG.SELL = 0.7;

  // Player's live cursor / Space frosting cannon!
  CG.BLASTER = { cd: 0.24, speed: 920, dmg: 3, splash: 48, knock: 28 };

  // 3 chunky 1-click turrets (keys 1 / 2 / 3): Rapid Popcorn, Slow Bubbles, Armor-Cracking Cupcake Splash.
  CG.TOWERS = {
    pop: {
      name: 'قاذف الفشار', short: 'فشار', aim: 'first', color: '#ffcf33',
      lv: [
        { cost: 50, range: 148, cd: 0.48, dmg: 2 },
        { cost: 60, range: 160, cd: 0.36, dmg: 4 },
        { cost: 100, range: 175, cd: 0.27, dmg: 6 }
      ]
    },
    bubble: {
      name: 'نافخ الفقاعات', short: 'فقاعات', aim: 'first', color: '#6fd3ff',
      lv: [
        { cost: 70, range: 138, cd: 0.85, dmg: 2, slow: 0.48, slowT: 2.2, area: 54 },
        { cost: 75, range: 150, cd: 0.72, dmg: 4, slow: 0.56, slowT: 2.6, area: 64 },
        { cost: 115, range: 162, cd: 0.62, dmg: 6, slow: 0.62, slowT: 2.8, area: 74, multi: 2 }
      ]
    },
    cake: {
      name: 'مدفع الكب كيك', short: 'كب كيك', aim: 'first', color: '#ff7eb6',
      lv: [
        { cost: 100, range: 175, cd: 1.25, dmg: 9, splash: 70, pierce: true },
        { cost: 110, range: 192, cd: 1.08, dmg: 15, splash: 82, pierce: true },
        { cost: 160, range: 210, cd: 0.92, dmg: 24, splash: 94, pierce: true }
      ]
    }
  };
  CG.TOWER_ORDER = ['pop', 'bubble', 'cake'];

  // Fast, expressive jelly blobs tuned for punchy 45-60s stages!
  CG.ENEMIES = {
    g: { name: 'هلام صغير', hp: 8, speed: 112, reward: 6, bite: 1, r: 15, color: '#62d26f' },
    z: { name: 'هلام سريع', hp: 6, speed: 168, reward: 6, bite: 1, r: 13, color: '#ffd23f' },
    c: { name: 'هلام ضخم', hp: 36, speed: 78, reward: 14, bite: 2, r: 22, color: '#a77bff' },
    s: { name: 'هلام منقسم', hp: 18, speed: 98, reward: 8, bite: 1, r: 17, color: '#ff8ac8', split: ['m', 'm'] },
    m: { name: 'هلام صغنون', hp: 4, speed: 132, reward: 2, bite: 1, r: 10, color: '#ffb3dc' },
    a: { name: 'هلام مدرّع', hp: 22, speed: 86, reward: 12, bite: 1, r: 17, color: '#55a8ff', armor: 2 },
    k: { name: 'أمير الهلام', hp: 155, speed: 56, reward: 60, bite: 5, r: 30, color: '#ff9f43', boss: true },
    b: { name: 'ملك الهلام', hp: 340, speed: 48, reward: 95, bite: 8, r: 36, color: '#ff5d8f', armor: 1, boss: true }
  };

  CG.WORLDS = [
    { name: 'حديقة الحلوى', ground: '#8fd46a', ground2: '#7cc45a', road: '#f6d8a0', edge: '#d6a463', deco: ['#ff7eb6', '#ffd23f', '#fff'] },
    { name: 'وادي الشوكولاتة', ground: '#f0c27f', ground2: '#e3b06a', road: '#8c5a36', edge: '#5e3a20', deco: ['#fff3d6', '#ff7eb6', '#6fd3ff'] },
    { name: 'جبال الآيس كريم', ground: '#cfe9ff', ground2: '#b9dcfb', road: '#ffc2dc', edge: '#e88cb4', deco: ['#ffffff', '#a77bff', '#62d26f'] }
  ];

  // 12 punchy 45-65s stages across 3 worlds (all 3 chunky turret cards available!).
  const ALL3 = ['pop', 'bubble', 'cake'];
  CG.LEVELS = [
    { w: 0, coins: 85, hp: 1, towers: ALL3, roads: [[[-1, 3], [5, 3], [5, 1], [10, 1], [10, 5], [14, 5]]],
      waves: ['g9/0.55', 'g11/0.45 z4/0.4', 'g12/0.38 z8/0.35'] },
    { w: 0, coins: 105, hp: 1.05, towers: ALL3, roads: [[[-1, 1], [3, 1], [3, 5], [7, 5], [7, 2], [11, 2], [11, 4], [14, 4]]],
      waves: ['g10/0.5', 'z9/0.42 g6/0.45', 'g12/0.4 z10/0.35', 'z14/0.3 c3/1.1'] },
    { w: 0, coins: 125, hp: 1.12, towers: ALL3, roads: [[[-1, 5], [2, 5], [2, 1], [6, 1], [6, 4], [9, 4], [9, 1], [13, 1], [13, 4]]],
      waves: ['g12/0.45', 'c3/1.2 g8/0.45', 'g12/0.4 z10/0.35', 'c5/1 g14/0.35'] },
    { w: 0, coins: 145, hp: 1.18, towers: ALL3, roads: [[[-1, 2], [4, 2], [4, 5], [8, 5], [8, 1], [12, 1], [12, 5], [14, 5]]],
      waves: ['g14/0.42', 'z12/0.35 c3/1', 'c5/0.95 g12/0.38', 'k1 g12/0.42 z6/0.35'] },
    { w: 1, coins: 165, hp: 1.26, towers: ALL3, roads: [[[-1, 6], [3, 6], [3, 3], [1, 3], [1, 0], [6, 0], [6, 6], [10, 6], [10, 2], [14, 2]]],
      waves: ['g14/0.4', 's6/0.85', 'z14/0.32 g10/0.4', 's8/0.75 c5/0.9', 'c7/0.85 s8/0.65'] },
    { w: 1, coins: 185, hp: 1.32, towers: ALL3, roads: [[[-1, 0], [12, 0], [12, 2], [2, 2], [2, 4], [12, 4], [12, 6], [1, 6]]],
      waves: ['g16/0.38', 'z16/0.3', 's10/0.65', 'c8/0.85 z12/0.3', 's12/0.55 c8/0.8'] },
    { w: 1, coins: 210, hp: 1.36, towers: ALL3, roads: [[[-1, 3], [3, 3], [3, 0], [7, 0], [7, 6], [11, 6], [11, 0], [14, 0], [14, 3]]],
      waves: ['g14/0.38 z10/0.3', 'a6/0.9', 'a8/0.8 g12/0.38', 's10/0.6 a6/0.8', 'a12/0.65 c7/0.8'] },
    { w: 1, coins: 230, hp: 1.4, towers: ALL3, roads: [[[-1, 1], [2, 1], [2, 5], [5, 5], [5, 1], [8, 1], [8, 5], [11, 5], [11, 1], [14, 1], [14, 4]]],
      waves: ['g16/0.38 z10/0.3', 'a9/0.75', 's10/0.6 c7/0.8', 'a11/0.65 z14/0.28', 'b1 g12/0.4 c4/0.9'] },
    { w: 2, coins: 255, hp: 1.45, towers: ALL3, roads: [[[-1, 6], [4, 6], [4, 3], [1, 3], [1, 0], [9, 0], [9, 4], [7, 4], [7, 6], [13, 6], [13, 2]]],
      waves: ['g16/0.36 z12/0.28', 'a10/0.72', 's12/0.55 c7/0.75', 'z22/0.24 a10/0.65', 'c10/0.65 s10/0.55 a8/0.65'] },
    { w: 2, coins: 275, hp: 1.5, towers: ALL3,
      roads: [[[-1, 1], [6, 1], [6, 3], [11, 3], [11, 5], [14, 5]], [[-1, 5], [6, 5], [6, 3], [11, 3], [11, 5], [14, 5]]],
      waves: ['g18/0.36', 'z18/0.28', 'a10/0.7 s8/0.55', 'c10/0.7 z18/0.26', 'a14/0.55 c10/0.65'] },
    { w: 2, coins: 295, hp: 1.56, towers: ALL3,
      roads: [[[-1, 0], [4, 0], [4, 6], [8, 6], [8, 2], [12, 2], [12, 5], [14, 5]], [[16, 0], [10, 0], [10, 2], [12, 2], [12, 5], [14, 5]]],
      waves: ['g18/0.35 z12/0.28', 'a11/0.65 s10/0.55', 'c12/0.65 z18/0.25', 'a15/0.55 s12/0.5', 'b1 c10/0.75 a8/0.6'] },
    { w: 2, coins: 325, hp: 1.62, towers: ALL3,
      roads: [[[-1, 0], [5, 0], [5, 3], [9, 3], [9, 0], [13, 0], [13, 6], [10, 6]], [[-1, 6], [5, 6], [5, 3], [9, 3], [9, 0], [13, 0], [13, 6], [10, 6]]],
      waves: ['g20/0.34 z14/0.26', 'a12/0.65 s10/0.55', 'c12/0.65 a12/0.6', 'z24/0.22 c12/0.6', 'k2/3.5 a12/0.55', 'b2/5 c10/0.7'] }
  ];
  CG.ENDLESS = { w: 1, coins: 210, hp: 1, towers: ALL3, roads: CG.LEVELS[6].roads, endless: true };
  CG.ENDLESS_AFTER = 2;

  CG.CAKES = [
    { name: 'كعكة الفراولة', stars: 0, sponge: '#fff1d6', cream: '#ff9ec8', top: '#ff5a8a' },
    { name: 'كعكة الشوكولاتة', stars: 9, sponge: '#8c5a36', cream: '#f6e0c4', top: '#5e3a20' },
    { name: 'كعكة الليمون', stars: 18, sponge: '#fff7b0', cream: '#ffffff', top: '#ffd23f' },
    { name: 'كعكة قوس قزح', stars: 30, sponge: '#ffffff', cream: '#a77bff', top: '#6fd3ff', rainbow: true }
  ];
})(globalThis.CG = globalThis.CG || {});

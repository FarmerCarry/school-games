/* Block World — data: blocks, items, procedural 16x16 pixel art, recipes, quests, skins. */
(function () {
  'use strict';
  var BW = window.BW = window.BW || {};

  BW.TS = 16;
  BW.W = 360;
  BW.H = 138;
  BW.SEA = 58;
  BW.FLOWER = 999;

  var B = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, TRUNK: 5, LEAVES: 6, LOG: 7, PLANKS: 8,
    COAL_ORE: 9, COPPER_ORE: 10, IRON_ORE: 11, GOLD_ORE: 12, DIAMOND_ORE: 13, BEDROCK: 14,
    TORCH: 15, TABLE: 16, FURNACE: 17, GLASS: 18, BRICKS: 19, STONE_BRICKS: 20,
    DOOR_B: 21, DOOR_T: 22, LADDER: 23, WATER: 24, SNOW_GRASS: 25, SNOW: 26, ICE: 27,
    PINE_LEAVES: 28, CACTUS: 29, TALLGRASS: 30, FLOWER_RED: 31, FLOWER_YELLOW: 32, FLOWER_BLUE: 33,
    SAPLING: 34, PUMPKIN: 35, JACK: 36, MUSHROOM: 37, CLAY: 38, LANTERN: 39,
    IRON_BLOCK: 40, GOLD_BLOCK: 41, DIAMOND_BLOCK: 42, COPPER_BLOCK: 43, SANDSTONE: 44, DEADBUSH: 45,
    TNT: 46, SPRING: 47, CHEST: 48, RUBY_ORE: 49,
    WOOL: 50, // 50..60
    VAULT_BRICK: 62, CRYSTAL: 63
  };

  var I = {
    STICK: 100, COAL: 101, COPPER_INGOT: 102, IRON_INGOT: 103, GOLD_INGOT: 104, DIAMOND: 105, DYE: 106,
    DOOR: 107, RUBY: 108, SLIME_GEL: 109,
    PICK_WOOD: 110, PICK_STONE: 111, PICK_IRON: 112, PICK_DIAMOND: 113,
    JET_BOOTS: 114, PICK_RUBY: 115
  };

  var WOOL_NAMES = ['أبيض', 'أحمر', 'برتقالي', 'أصفر', 'ليموني', 'أخضر', 'سماوي', 'أزرق', 'بنفسجي', 'وردي', 'أسود'];
  var WOOL_COLS = ['#f4f4f4', '#e8413c', '#f89632', '#ffd93d', '#8ae03a', '#2f9e44', '#28c4d8', '#3b6fe0', '#9b4fe2', '#ff8fc8', '#2d2d36'];
  BW.B = B; BW.I = I; BW.WOOL_NAMES = WOOL_NAMES; BW.WOOL_COLS = WOOL_COLS;

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  BW.mulberry = mulberry;

  // Compact block builder: flags string ('N'=non-solid, 'T'=transparent, 'S'=support, 'A'=attach,
  // 'R'=replace, 'C'=climb, 'L'=liquid, 'M'=animalSolid, 'E'=noEdge), ex = [tier, drop, light, dim]
  var BLOCKS = [];
  function b(id, name, hard, mat, cols, fl, ex) {
    fl = fl || ''; ex = ex || [];
    var solid = fl.indexOf('N') < 0;
    BLOCKS[id] = {
      id: id, name: name, solid: solid, opaque: fl.indexOf('T') < 0 ? solid : false,
      hard: hard, tier: ex[0] || 0, drop: ex[1] === undefined ? id : ex[1],
      light: ex[2] || 0, dim: ex[3] || 0, mat: mat || 'stone', cols: cols || ['#888'],
      support: fl.indexOf('S') >= 0, attach: fl.indexOf('A') >= 0, replace: fl.indexOf('R') >= 0,
      climb: fl.indexOf('C') >= 0, liquid: fl.indexOf('L') >= 0, animalSolid: fl.indexOf('M') >= 0,
      noEdge: fl.indexOf('E') >= 0
    };
  }

  b(B.AIR, 'هواء', 0, 'stone', ['#888'], 'NTR', [0, 0]);
  b(B.GRASS, 'عشب', 0.34, 'dirt', ['#5ce046', '#8a5a36'], '', [0, B.DIRT]);
  b(B.DIRT, 'تراب', 0.30, 'dirt', ['#8a5a36', '#6e4527']);
  b(B.STONE, 'حجر', 1.05, 'stone', ['#8e8e96', '#72727c']);
  b(B.SAND, 'رمل', 0.28, 'sand', ['#f3dc8c', '#dcc271']);
  b(B.TRUNK, 'جذع شجرة', 0.54, 'wood', ['#7a5230', '#553619'], 'NTE', [0, B.LOG]);
  b(B.LEAVES, 'أوراق شجر', 0.14, 'leaf', ['#3fb535', '#2a7a25', '#68db58'], 'NT', [0, 0, 0, 2]);
  b(B.LOG, 'خشب', 0.52, 'wood', ['#7a5230', '#553619']);
  b(B.PLANKS, 'ألواح خشب', 0.46, 'wood', ['#c8955a', '#8f6334']);
  b(B.COAL_ORE, 'خام الفحم', 1.25, 'stone', ['#8e8e96', '#26262c'], '', [1, I.COAL]);
  b(B.COPPER_ORE, 'خام النحاس', 1.35, 'stone', ['#8e8e96', '#eb7f3d'], '', [1]);
  b(B.IRON_ORE, 'خام الحديد', 1.55, 'stone', ['#8e8e96', '#ecd0b4'], '', [2]);
  b(B.GOLD_ORE, 'خام الذهب', 1.75, 'stone', ['#8e8e96', '#ffd63a'], '', [2]);
  b(B.DIAMOND_ORE, 'خام الألماس', 2.05, 'stone', ['#8e8e96', '#4ef6ec'], '', [3, I.DIAMOND, 5]);
  b(B.BEDROCK, 'صخر القاع', Infinity, 'stone', ['#2c2c34'], '', [99, 0]);
  b(B.TORCH, 'شعلة', 0.06, 'wood', ['#ffd23f', '#8a5f38'], 'NTA', [0, B.TORCH, 14]);
  b(B.TABLE, 'طاولة الصنع', 0.48, 'wood', ['#c8955a', '#6a4526']);
  b(B.FURNACE, 'فرن', 0.95, 'stone', ['#8e8e96', '#ff8a2a'], '', [0, B.FURNACE, 7]);
  b(B.GLASS, 'زجاج', 0.28, 'glass', ['#dff6ff', '#a8dcf0'], 'T');
  b(B.BRICKS, 'طوب أحمر', 0.95, 'stone', ['#c24b3c', '#ebdacc']);
  b(B.STONE_BRICKS, 'طوب حجري', 0.95, 'stone', ['#9a9aa4', '#6b6b75']);
  b(B.DOOR_B, 'باب', 0.45, 'wood', ['#b98549', '#6a4526'], 'NTSM', [0, I.DOOR]);
  b(B.DOOR_T, 'باب', 0.45, 'wood', ['#b98549', '#6a4526'], 'NTM', [0, 0]);
  b(B.LADDER, 'سُلّم', 0.28, 'wood', ['#c8955a'], 'NTCA');
  b(B.WATER, 'ماء', Infinity, 'water', ['#3b8fe8', '#8fd0ff'], 'NTLR', [99, 0]);
  b(B.SNOW_GRASS, 'عشب مثلج', 0.34, 'snow', ['#f4fbff', '#8a5a36'], '', [0, B.DIRT]);
  b(B.SNOW, 'ثلج', 0.24, 'snow', ['#f4fbff', '#cfe4f4']);
  b(B.ICE, 'جليد', 0.36, 'glass', ['#bfe9ff', '#8fd0f4'], 'T');
  b(B.PINE_LEAVES, 'أوراق الصنوبر', 0.14, 'leaf', ['#23753c', '#f4fbff'], 'NT', [0, 0, 0, 2]);
  b(B.CACTUS, 'صبّار', 0.30, 'leaf', ['#4cb83c', '#2f7a28'], 'NTSM');
  b(B.TALLGRASS, 'عشب طويل', 0.05, 'leaf', ['#5ce046'], 'NTSR', [0, 0]);
  b(B.FLOWER_RED, 'زهرة حمراء', 0.05, 'leaf', ['#ff4a4a', '#4fae33'], 'NTS');
  b(B.FLOWER_YELLOW, 'زهرة صفراء', 0.05, 'leaf', ['#ffe03a', '#4fae33'], 'NTS');
  b(B.FLOWER_BLUE, 'زهرة زرقاء', 0.05, 'leaf', ['#4a8cff', '#4fae33'], 'NTS');
  b(B.SAPLING, 'شتلة', 0.05, 'leaf', ['#4fbf40', '#7a5230'], 'NTS');
  b(B.PUMPKIN, 'يقطينة', 0.42, 'wood', ['#f28a1e', '#c9661a']);
  b(B.JACK, 'فانوس اليقطين', 0.42, 'wood', ['#f28a1e', '#ffe066'], '', [0, B.JACK, 13]);
  b(B.MUSHROOM, 'فطر مضيء', 0.08, 'leaf', ['#4ff0ff', '#b8fbff'], 'NTS', [0, B.MUSHROOM, 9]);
  b(B.CLAY, 'طين', 0.38, 'dirt', ['#9fa8c0', '#8a93ab']);
  b(B.LANTERN, 'فانوس', 0.42, 'glass', ['#ffe066', '#555'], 'T', [0, B.LANTERN, 15]);
  b(B.IRON_BLOCK, 'مكعب حديد', 1.25, 'metal', ['#e6e6ee', '#b8b8c4'], '', [1]);
  b(B.GOLD_BLOCK, 'مكعب ذهب', 1.25, 'metal', ['#ffd84a', '#e8a820'], '', [1]);
  b(B.DIAMOND_BLOCK, 'مكعب ألماس', 1.35, 'metal', ['#6ff5ee', '#2fc6c0'], '', [1, B.DIAMOND_BLOCK, 6]);
  b(B.COPPER_BLOCK, 'مكعب نحاس', 1.20, 'metal', ['#e8844a', '#b85a2a'], '', [1]);
  b(B.SANDSTONE, 'حجر رملي', 0.72, 'stone', ['#e2c47a', '#c8a85e']);
  b(B.DEADBUSH, 'شجيرة يابسة', 0.05, 'leaf', ['#a07840'], 'NTSR', [0, I.STICK]);
  b(B.TNT, 'متفجرات TNT', 0.25, 'wood', ['#e63946', '#fff8d6', '#ff9f1c']);
  b(B.SPRING, 'منصة قفز', 0.32, 'metal', ['#00f5d4', '#ffd60a', '#3a4466'], '', [0, B.SPRING, 5]);
  b(B.CHEST, 'صندوق الكنز', 0.40, 'wood', ['#d97706', '#ffd60a', '#92400e'], '', [0, 0, 9]);
  b(B.RUBY_ORE, 'خام الياقوت', 1.80, 'stone', ['#8e8e96', '#ff2a6d', '#ff8fa3'], '', [2, I.RUBY, 6]);
  for (var w = 0; w < 11; w++) b(B.WOOL + w, 'صوف ' + WOOL_NAMES[w], 0.32, 'wool', [WOOL_COLS[w]]);
  b(B.VAULT_BRICK, 'طوب غرفة الكنز', 1.10, 'stone', ['#43386b', '#2b224a', '#ffd60a'], '', [1]);
  b(B.CRYSTAL, 'بلورة الكهف', 0.28, 'glass', ['#3bf6ee', '#c77dff', '#ffffff'], 'NTS', [0, I.SLIME_GEL, 10]);

  for (var k = 0; k < 256; k++) if (!BLOCKS[k]) BLOCKS[k] = null;
  BW.BLOCKS = BLOCKS;

  var ITEMS = {};
  BLOCKS.forEach(function (bl) {
    if (bl && bl.id && bl.id !== B.DOOR_T && bl.id !== B.WATER && bl.id !== B.BEDROCK && bl.id !== B.TRUNK && bl.id !== B.CHEST) {
      ITEMS[bl.id] = { id: bl.id, name: bl.name, place: bl.id, max: 99 };
    }
  });
  ITEMS[B.DOOR_B] = { id: B.DOOR_B, name: 'باب', place: B.DOOR_B, max: 99 };
  function item(id, name, extra) { ITEMS[id] = Object.assign({ id: id, name: name, max: 99 }, extra || {}); }
  [[I.STICK, 'عصا'], [I.COAL, 'فحم'], [I.COPPER_INGOT, 'سبيكة نحاس'], [I.IRON_INGOT, 'سبيكة حديد'],
   [I.GOLD_INGOT, 'سبيكة ذهب'], [I.DIAMOND, 'ألماسة'], [I.DYE, 'صبغة قوس قزح'], [I.RUBY, 'ياقوتة متوهجة'],
   [I.SLIME_GEL, 'جل السلايم المشع']].forEach(function (a) { item(a[0], a[1]); });
  item(I.DOOR, 'باب خشبي', { place: B.DOOR_B });
  item(I.JET_BOOTS, 'حذاء القفز النفاث', { jet: true, max: 1 });
  [[I.PICK_WOOD, 'معول خشبي', 1, 2.4], [I.PICK_STONE, 'معول حجري', 2, 3.6], [I.PICK_IRON, 'معول حديدي', 3, 5.2],
   [I.PICK_DIAMOND, 'معول ألماسي', 4, 7.8], [I.PICK_RUBY, 'معول الياقوت الخارق', 5, 9.8]].forEach(function (p) {
    item(p[0], p[1], { tool: p[2], speed: p[3], max: 1 });
  });

  BW.ITEMS = ITEMS;
  BW.itemName = function (id) { return id === BW.FLOWER ? 'زهرة' : (ITEMS[id] && ITEMS[id].name) || (BLOCKS[id] && BLOCKS[id].name) || ''; };
  BW.maxStack = function (id) { return (ITEMS[id] && ITEMS[id].max) || 99; };

  // --------------------------------------------------- procedural 16x16 sprites
  var TEX = {}, WALL_TEX = {}, ICON_URL = {};
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w || 16; c.height = h || 16; return c; }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
    var g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
    var b2 = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
    return 'rgb(' + r + ',' + g + ',' + b2 + ')';
  }
  function fr(g, col) {
    if (col) g.fillStyle = col;
    for (var i = 2; i < arguments.length; i += 4) g.fillRect(arguments[i], arguments[i + 1], arguments[i + 2], arguments[i + 3]);
  }
  BW.shade = shade;
  BW.fr = fr;

  function noisy(ctx, base, spread, seed, x0, y0, w, h) {
    var rnd = mulberry(seed);
    x0 = x0 || 0; y0 = y0 || 0; w = w || 16; h = h || 16;
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) {
      fr(ctx, shade(base, 1 + (rnd() - 0.5) * spread), x, y, 1, 1);
    }
  }
  function px(ctx, col, pts) {
    ctx.fillStyle = col;
    for (var i = 0; i < pts.length; i += 2) ctx.fillRect(pts[i], pts[i + 1], 1, 1);
  }
  function ore(ctx, seed, col, hi, glow) {
    noisy(ctx, '#888994', 0.22, seed);
    var rnd = mulberry(seed + 77);
    for (var i = 0; i < 6; i++) {
      var x = 2 + Math.floor(rnd() * 11), y = 2 + Math.floor(rnd() * 11);
      if (glow) fr(ctx, glow, x - 1, y, 4, 2, x, y - 1, 2, 4);
      fr(ctx, col, x, y, 2, 2);
      if (rnd() > 0.35) ctx.fillRect(x + 1, y - 1, 2, 2);
      fr(ctx, hi, x, y, 1, 1);
    }
  }
  function paint(id, fn) {
    var c = mkCanvas(16, 16), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    fn(g);
    TEX[id] = c;
    if (BLOCKS[id] && BLOCKS[id].solid && BLOCKS[id].opaque) {
      var wc = mkCanvas(16, 16), wg = wc.getContext('2d');
      wg.drawImage(c, 0, 0);
      fr(wg, 'rgba(14,16,38,0.56)', 0, 0, 16, 16);
      WALL_TEX[id] = wc;
    }
  }

  paint(B.DIRT, function (g) {
    noisy(g, '#8a5a36', 0.25, 11);
    px(g, '#623d22', [3, 4, 11, 9, 6, 13, 13, 3]);
    px(g, '#a87650', [2, 10, 9, 3, 14, 12]);
  });
  paint(B.GRASS, function (g) {
    g.drawImage(TEX[B.DIRT], 0, 0);
    noisy(g, '#52cf3d', 0.20, 22, 0, 0, 16, 4);
    var oh = [5, 6, 5, 4, 5, 6, 5, 4, 6, 5, 4, 5, 6, 5, 4, 5];
    for (var x = 0; x < 16; x++) {
      fr(g, x % 2 ? '#4bc438' : '#63e04c', x, 3, 1, oh[x] - 3);
      fr(g, '#2d8022', x, oh[x], 1, 1);
    }
    fr(g, '#8ef573', 0, 0, 16, 1);
  });
  paint(B.SNOW_GRASS, function (g) {
    g.drawImage(TEX[B.DIRT], 0, 0);
    noisy(g, '#f0f8ff', 0.08, 25, 0, 0, 16, 5);
    var oh = [5, 6, 5, 4, 6, 5, 4, 5, 6, 5, 5, 4, 6, 5, 4, 5];
    for (var x = 0; x < 16; x++) { fr(g, '#e8f4ff', x, 4, 1, oh[x] - 3); fr(g, '#aac6de', x, oh[x], 1, 1); }
  });
  paint(B.SNOW, function (g) { noisy(g, '#f2f9ff', 0.09, 26); });
  paint(B.ICE, function (g) { noisy(g, '#a8defa', 0.12, 27); fr(g, 'rgba(255,255,255,0.6)', 2, 2, 5, 1, 3, 3, 3, 1, 9, 8, 5, 1, 6, 12, 6, 1); });
  paint(B.STONE, function (g) { noisy(g, '#888994', 0.22, 33); fr(g, '#686974', 2, 6, 5, 1, 9, 12, 5, 1); fr(g, '#a8a9b4', 3, 5, 4, 1, 8, 2, 5, 1); });
  paint(B.SAND, function (g) { noisy(g, '#f2dc8c', 0.14, 44); px(g, '#fff1b8', [2, 3, 9, 7, 13, 12, 5, 13]); });
  paint(B.SANDSTONE, function (g) { noisy(g, '#e2c478', 0.12, 440); fr(g, '#f4dea0', 0, 0, 16, 3); fr(g, '#be9d52', 0, 4, 16, 1, 0, 10, 16, 1); });
  paint(B.CLAY, function (g) { noisy(g, '#9fa8c0', 0.14, 38); });
  paint(B.BEDROCK, function (g) { noisy(g, '#2e2e38', 0.55, 99); });

  function paintLog(g) {
    for (var x = 0; x < 16; x++) for (var y = 0; y < 16; y++) {
      fr(g, shade((x < 2 || x > 13) ? '#4d3018' : '#7f5430', 1 + (((x * 7 + y * 3) % 5) - 2) * 0.05), x, y, 1, 1);
    }
    fr(g, '#5e3b1e', 5, 0, 1, 16, 10, 0, 1, 16);
  }
  paint(B.LOG, paintLog);
  paint(B.TRUNK, paintLog);

  paint(B.PLANKS, function (g) {
    noisy(g, '#c8955a', 0.12, 88);
    fr(g, '#8a5f32', 0, 3, 16, 1, 0, 7, 16, 1, 0, 11, 16, 1, 0, 15, 16, 1, 7, 0, 1, 4, 12, 4, 1, 4, 4, 8, 1, 4, 10, 12, 1, 4);
    fr(g, '#deb078', 0, 0, 16, 1, 0, 4, 16, 1, 0, 8, 16, 1, 0, 12, 16, 1);
  });
  paint(B.LEAVES, function (g) {
    var rnd = mulberry(66);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var r = rnd(); if (r >= 0.09) fr(g, r < 0.42 ? '#2e8828' : r < 0.78 ? '#45b83b' : '#6ae05a', x, y, 1, 1);
    }
  });
  paint(B.PINE_LEAVES, function (g) {
    var rnd = mulberry(280);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var r = rnd(); if (r >= 0.08) fr(g, y < 3 && r > 0.42 ? '#f4fbff' : r < 0.5 ? '#1d5c30' : '#2e8046', x, y, 1, 1);
    }
  });

  paint(B.COAL_ORE, function (g) { ore(g, 90, '#1f2028', '#4c4e5c'); });
  paint(B.COPPER_ORE, function (g) { ore(g, 100, '#e07236', '#ffb480'); });
  paint(B.IRON_ORE, function (g) { ore(g, 110, '#d8b498', '#fff2e4'); });
  paint(B.GOLD_ORE, function (g) { ore(g, 120, '#f5bc1e', '#fff59c', 'rgba(255,214,10,0.22)'); });
  paint(B.DIAMOND_ORE, function (g) { ore(g, 130, '#2be4dc', '#d2ffff', 'rgba(63,246,238,0.28)'); });
  paint(B.RUBY_ORE, function (g) { ore(g, 149, '#ff1f62', '#ffc2d4', 'rgba(255,42,109,0.30)'); });

  paint(B.BRICKS, function (g) {
    fr(g, '#e2d2c0', 0, 0, 16, 16);
    var rnd = mulberry(190);
    for (var row = 0; row < 4; row++) for (var bx = -4; bx < 16; bx += 8) {
      fr(g, shade('#c24b3c', 0.92 + rnd() * 0.18), bx + (row % 2) * 4 + 1, row * 4 + 1, 7, 3);
    }
  });
  paint(B.STONE_BRICKS, function (g) {
    noisy(g, '#9495a0', 0.14, 200);
    fr(g, '#585964', 0, 7, 16, 1, 0, 15, 16, 1, 7, 0, 1, 8, 15, 8, 1, 8);
    fr(g, '#b8b9c4', 0, 0, 7, 1, 8, 0, 8, 1, 0, 8, 15, 1);
  });
  paint(B.VAULT_BRICK, function (g) {
    noisy(g, '#3d3164', 0.16, 620);
    fr(g, '#21193b', 0, 7, 16, 1, 0, 15, 16, 1, 7, 0, 1, 8, 15, 8, 1, 8);
    fr(g, '#6c5aa6', 1, 1, 5, 1, 9, 9, 5, 1);
    fr(g, '#ffd60a', 3, 3, 2, 2, 11, 11, 2, 2);
  });
  paint(B.GLASS, function (g) {
    fr(g, 'rgba(190,238,255,0.28)', 1, 1, 14, 14);
    fr(g, '#9ad4ec', 0, 0, 16, 1, 0, 15, 16, 1, 0, 0, 1, 16, 15, 0, 1, 16);
    px(g, '#ffffff', [2, 2, 3, 2, 2, 3, 4, 4, 11, 11, 12, 12]);
  });
  paint(B.TABLE, function (g) {
    g.drawImage(TEX[B.PLANKS], 0, 0);
    fr(g, '#6b4222', 0, 0, 16, 4); fr(g, '#e0a868', 1, 1, 14, 2);
    fr(g, '#3c2412', 4, 1, 1, 2, 8, 1, 1, 2, 12, 1, 1, 2);
    fr(g, '#cfd6e6', 3, 7, 3, 5); fr(g, '#7a5230', 4, 11, 1, 3); fr(g, '#ffd60a', 10, 7, 3, 3);
  });
  paint(B.FURNACE, function (g) {
    g.drawImage(TEX[B.STONE_BRICKS], 0, 0);
    fr(g, '#24242c', 4, 4, 8, 9); fr(g, '#ff6d1f', 5, 8, 6, 4);
    fr(g, '#ffd84a', 6, 9, 4, 3); fr(g, '#ffffff', 7, 10, 2, 1);
  });
  paint(B.TORCH, function (g) {
    fr(g, '#7a5230', 7, 7, 2, 8); fr(g, '#ff8800', 6, 3, 4, 4);
    fr(g, '#ffe04a', 7, 2, 2, 4); fr(g, '#ffffff', 7, 4, 2, 1);
  });
  paint(B.LANTERN, function (g) {
    fr(g, '#3b3d4a', 7, 0, 2, 3, 4, 3, 8, 2, 4, 13, 8, 2, 4, 5, 1, 8, 11, 5, 1, 8);
    fr(g, '#ffbe2e', 5, 5, 6, 8); fr(g, '#fff5a8', 6, 6, 4, 6); fr(g, '#ffffff', 7, 8, 2, 2);
  });
  paint(B.LADDER, function (g) {
    fr(g, '#9a6836', 2, 0, 2, 16, 12, 0, 2, 16);
    for (var y = 2; y < 16; y += 4) fr(g, '#d29c60', 2, y, 12, 2);
  });
  paint(B.DOOR_T, function (g) {
    noisy(g, '#b98549', 0.1, 221);
    fr(g, '#6e4720', 0, 0, 16, 2, 0, 0, 2, 16, 14, 0, 2, 16);
    fr(g, '#bfe8ff', 4, 4, 3, 5, 9, 4, 3, 5);
  });
  paint(B.DOOR_B, function (g) {
    noisy(g, '#b98549', 0.1, 222);
    fr(g, '#6e4720', 0, 14, 16, 2, 0, 0, 2, 16, 14, 0, 2, 16);
    fr(g, '#ffd84a', 11, 2, 2, 2);
  });
  paint(B.WATER, function (g) {
    fr(g, 'rgba(42,136,236,0.72)', 0, 0, 16, 16);
    fr(g, 'rgba(170,228,255,0.65)', 0, 0, 16, 2, 3, 6, 5, 1, 9, 11, 5, 1);
  });
  paint(B.CACTUS, function (g) {
    for (var x = 2; x < 14; x++) fr(g, (x === 4 || x === 8 || x === 11) ? '#328228' : '#4cc03c', x, 0, 1, 16);
    px(g, '#e8f8c8', [1, 3, 14, 6, 1, 11, 14, 13]);
  });
  paint(B.TALLGRASS, function (g) {
    var cols = ['#3fa535', '#5ce046', '#7ef263'], hs = [6, 10, 8, 12, 7, 11, 9, 6];
    for (var i = 0; i < 8; i++) fr(g, cols[i % 3], 1 + i * 2, 16 - hs[i], 1, hs[i]);
  });
  function flower(col, center) {
    return function (g) {
      fr(g, '#3da832', 7, 8, 2, 8, 5, 11, 2, 2, 9, 10, 2, 2);
      fr(g, col, 5, 4, 6, 5, 6, 3, 4, 7); fr(g, center, 7, 5, 2, 3);
    };
  }
  paint(B.FLOWER_RED, flower('#ff4252', '#ffe04a'));
  paint(B.FLOWER_YELLOW, flower('#ffe03a', '#ff881e'));
  paint(B.FLOWER_BLUE, flower('#4a90ff', '#ffffff'));
  paint(B.DEADBUSH, function (g) { fr(g, '#8e6634', 7, 9, 2, 7, 4, 6, 3, 2, 9, 5, 3, 2, 2, 4, 2, 2, 12, 3, 2, 2); });
  paint(B.SAPLING, function (g) { fr(g, '#7a5230', 7, 10, 2, 6); fr(g, '#3da832', 4, 5, 8, 6, 5, 3, 6, 3); fr(g, '#7ef263', 6, 4, 3, 3); });
  paint(B.MUSHROOM, function (g) { fr(g, '#d8f8ff', 7, 10, 2, 6); fr(g, '#1fd8f0', 3, 6, 10, 4, 5, 4, 6, 2); px(g, '#ffffff', [5, 6, 9, 5, 11, 7, 6, 8]); });
  paint(B.PUMPKIN, function (g) { noisy(g, '#f0841e', 0.12, 350); fr(g, '#bf5c12', 4, 0, 1, 16, 8, 0, 1, 16, 12, 0, 1, 16); fr(g, '#4a8a2a', 7, 0, 2, 2); });
  paint(B.JACK, function (g) {
    g.drawImage(TEX[B.PUMPKIN], 0, 0);
    fr(g, '#ffe85a', 3, 4, 3, 3, 10, 4, 3, 3, 3, 10, 10, 3);
    fr(g, '#f0841e', 5, 10, 2, 1, 9, 10, 2, 1, 7, 12, 2, 1);
  });

  function shinyBlock(base, hi, dk) {
    return function (g) {
      fr(g, base, 0, 0, 16, 16);
      fr(g, hi, 0, 0, 16, 2, 0, 0, 2, 16, 3, 3, 4, 2, 3, 5, 2, 2);
      fr(g, dk, 0, 14, 16, 2, 14, 0, 2, 16);
    };
  }
  paint(B.COPPER_BLOCK, shinyBlock('#df783e', '#ffb07a', '#9e481c'));
  paint(B.IRON_BLOCK, shinyBlock('#dcdce6', '#ffffff', '#9c9caa'));
  paint(B.GOLD_BLOCK, shinyBlock('#f8c62c', '#fff49c', '#b8820c'));
  paint(B.DIAMOND_BLOCK, shinyBlock('#38ece4', '#d4ffff', '#169e98'));

  paint(B.TNT, function (g) {
    fr(g, '#d62828', 0, 0, 16, 16);
    fr(g, '#ff595e', 0, 0, 16, 2, 2, 2, 2, 12, 7, 2, 2, 12, 12, 2, 2, 12);
    fr(g, '#9b111e', 0, 14, 16, 2);
    fr(g, '#fff8e7', 0, 5, 16, 6);
    fr(g, '#1b1640', 2, 6, 3, 1, 3, 7, 1, 3, 6, 6, 1, 4, 7, 7, 1, 1, 8, 8, 1, 1, 9, 6, 1, 4, 11, 6, 3, 1, 12, 7, 1, 3);
  });
  paint(B.SPRING, function (g) {
    fr(g, '#2b3354', 0, 11, 16, 5); fr(g, '#536296', 1, 11, 14, 2);
    fr(g, '#ffd60a', 4, 6, 8, 2, 5, 9, 6, 2);
    fr(g, '#00f5d4', 1, 2, 14, 4); fr(g, '#b8fff4', 2, 2, 12, 1); fr(g, '#1b1640', 7, 3, 2, 2);
  });
  paint(B.CHEST, function (g) {
    fr(g, '#1b1640', 1, 2, 14, 14); fr(g, '#b45309', 2, 3, 12, 12);
    fr(g, '#d97706', 2, 3, 12, 5); fr(g, '#f59e0b', 3, 4, 10, 2);
    fr(g, '#451a03', 2, 8, 12, 1);
    fr(g, '#ffd60a', 2, 3, 2, 12, 12, 3, 2, 12, 6, 7, 4, 4);
    fr(g, '#ffffff', 7, 8, 2, 1);
  });
  paint(B.CRYSTAL, function (g) {
    fr(g, '#7b2cbf', 3, 9, 3, 7, 10, 8, 3, 8);
    fr(g, '#c77dff', 4, 7, 2, 7, 11, 6, 2, 8);
    fr(g, '#00bbf9', 6, 3, 4, 13); fr(g, '#72efdd', 7, 2, 2, 12);
    px(g, '#ffffff', [7, 2, 7, 3, 4, 7, 11, 6]);
  });

  for (var wi = 0; wi < 11; wi++) {
    (function (col, idx) {
      paint(B.WOOL + idx, function (g) {
        noisy(g, col, 0.15, 500 + idx);
        g.fillStyle = shade(col, 1.12);
        for (var y = 1; y < 16; y += 4) for (var x = (y % 8 ? 1 : 3); x < 15; x += 4) g.fillRect(x, y, 2, 2);
      });
    })(WOOL_COLS[wi], wi);
  }

  function paintItem(id, fn) { var c = mkCanvas(16, 16), g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(g); TEX[id] = c; }
  paintItem(I.STICK, function (g) { for (var i = 0; i < 11; i++) fr(g, i % 2 ? '#9a6b3b' : '#b8834d', 3 + i, 13 - i, 2, 2); });
  paintItem(I.COAL, function (g) { fr(g, '#22222a', 4, 4, 8, 9, 3, 6, 10, 6); fr(g, '#505262', 5, 5, 3, 2); });
  function ingot(base, hi, dk) { return function (g) { fr(g, dk, 2, 7, 12, 6); fr(g, base, 3, 5, 10, 6); fr(g, hi, 4, 5, 8, 2); }; }
  paintItem(I.COPPER_INGOT, ingot('#e07a3c', '#ffc08c', '#8e4418'));
  paintItem(I.IRON_INGOT, ingot('#dcdce6', '#ffffff', '#888896'));
  paintItem(I.GOLD_INGOT, ingot('#f8c62c', '#fff5a0', '#a87808'));
  paintItem(I.DIAMOND, function (g) { fr(g, '#18a8a4', 4, 5, 8, 8, 6, 3, 4, 11); fr(g, '#4ef6ec', 5, 5, 6, 6, 6, 4, 4, 8); fr(g, '#e0ffff', 6, 5, 2, 3); });
  paintItem(I.RUBY, function (g) { fr(g, '#a4133c', 4, 4, 8, 9, 5, 3, 6, 11); fr(g, '#ff2a6d', 5, 5, 6, 7); fr(g, '#ffc2d4', 6, 5, 2, 3); });
  paintItem(I.SLIME_GEL, function (g) { fr(g, '#00b4d8', 3, 5, 10, 9, 4, 4, 8, 10); fr(g, '#72efdd', 4, 6, 8, 7); fr(g, '#ffffff', 5, 6, 2, 2, 9, 8, 1, 1); });
  paintItem(I.DYE, function (g) {
    var cs = ['#ff4252', '#ff9632', '#ffe03a', '#4fd84c', '#3bb4ff', '#b060ff'];
    for (var i = 0; i < 6; i++) fr(g, cs[i], 3 + (i % 3) * 4, 4 + Math.floor(i / 3) * 5, 3, 4);
  });
  paintItem(I.DOOR, function (g) {
    fr(g, '#b98549', 4, 1, 8, 14); fr(g, '#6e4720', 4, 1, 8, 1, 4, 14, 8, 1, 4, 1, 1, 14, 11, 1, 1, 14);
    fr(g, '#bfe8ff', 6, 3, 4, 4); fr(g, '#ffd84a', 9, 9, 1, 2);
  });
  paintItem(I.JET_BOOTS, function (g) {
    fr(g, '#1b1640', 1, 4, 6, 9, 9, 4, 6, 9); fr(g, '#3a86ff', 2, 5, 4, 7, 10, 5, 4, 7);
    fr(g, '#00f5d4', 1, 9, 6, 3, 9, 9, 6, 3); fr(g, '#ff9f1c', 2, 13, 4, 2, 10, 13, 4, 2);
    fr(g, '#ffe66d', 3, 14, 2, 2, 11, 14, 2, 2);
  });
  function pickaxe(head, hi) {
    return function (g) {
      for (var i = 0; i < 10; i++) fr(g, i % 2 ? '#7a5230' : '#9e6d40', 2 + i, 13 - i, 2, 2);
      fr(g, head, 6, 1, 7, 2, 11, 2, 3, 3, 12, 5, 2, 4, 4, 2, 3, 2);
      fr(g, hi, 7, 1, 5, 1, 12, 3, 1, 4);
    };
  }
  paintItem(I.PICK_WOOD, pickaxe('#b8834d', '#e2b67c'));
  paintItem(I.PICK_STONE, pickaxe('#8e8f9a', '#c8c9d4'));
  paintItem(I.PICK_IRON, pickaxe('#d8d8e4', '#ffffff'));
  paintItem(I.PICK_DIAMOND, pickaxe('#2be4dc', '#d4ffff'));
  paintItem(I.PICK_RUBY, pickaxe('#ff1f62', '#ffc2d4'));

  var CRACKS = [];
  for (var st = 0; st < 8; st++) {
    var cc = mkCanvas(16, 16), cg = cc.getContext('2d'), r = mulberry(700);
    cg.fillStyle = 'rgba(15,12,28,0.72)';
    for (var br = 0; br < (st + 1) * 3; br++) {
      var cx = 8, cy = 8, a = r() * Math.PI * 2;
      for (var s = 0; s < 2 + st; s++) {
        cx += Math.cos(a) * 1.3; cy += Math.sin(a) * 1.3; a += (r() - 0.5) * 1.1;
        cg.fillRect(cx | 0, cy | 0, 1, 1);
      }
    }
    if (st >= 5) fr(cg, 'rgba(255,255,255,0.16)', 0, 0, 16, 16);
    CRACKS.push(cc);
  }
  BW.TEX = TEX; BW.WALL_TEX = WALL_TEX; BW.CRACKS = CRACKS;
  BW.iconURL = function (id) {
    if (!ICON_URL[id] && TEX[id]) ICON_URL[id] = TEX[id].toDataURL();
    return ICON_URL[id] || '';
  };

  // RECIPES[0] MUST stay 1 LOG -> 4 PLANKS (st: null) for quick-craft & double-click contracts!
  var RECIPES = [
    [B.PLANKS, 4, [[B.LOG, 1]]], [I.STICK, 4, [[B.PLANKS, 2]]], [B.TABLE, 1, [[B.PLANKS, 4]]],
    [B.TORCH, 4, [[I.COAL, 1], [I.STICK, 1]]], [B.TORCH, 2, [[B.LOG, 1], [I.STICK, 1]]],
    [B.TNT, 2, [[I.COAL, 1], [B.SAND, 2]]], [B.TNT, 3, [[I.SLIME_GEL, 1], [B.SAND, 1]]],
    [I.PICK_WOOD, 1, [[B.PLANKS, 3], [I.STICK, 2]], 'table'], [I.PICK_STONE, 1, [[B.STONE, 3], [I.STICK, 2]], 'table'],
    [I.PICK_IRON, 1, [[I.IRON_INGOT, 3], [I.STICK, 2]], 'table'], [I.PICK_DIAMOND, 1, [[I.DIAMOND, 3], [I.STICK, 2]], 'table'],
    [I.PICK_RUBY, 1, [[I.RUBY, 3], [I.STICK, 2]], 'table'],
    [B.SPRING, 2, [[I.SLIME_GEL, 1], [B.PLANKS, 2]], 'table'], [B.SPRING, 2, [[I.COPPER_INGOT, 1], [B.PLANKS, 2]], 'table'],
    [I.JET_BOOTS, 1, [[I.IRON_INGOT, 2], [I.SLIME_GEL, 2]], 'table'], [B.FURNACE, 1, [[B.STONE, 8]], 'table'],
    [B.LADDER, 4, [[I.STICK, 5]], 'table'], [I.DOOR, 1, [[B.PLANKS, 6]], 'table'],
    [B.STONE_BRICKS, 4, [[B.STONE, 4]], 'table'], [B.SANDSTONE, 2, [[B.SAND, 4]], 'table'],
    [B.LANTERN, 2, [[I.IRON_INGOT, 1], [B.TORCH, 1]], 'table'], [B.JACK, 1, [[B.PUMPKIN, 1], [B.TORCH, 1]]],
    [I.DYE, 3, [[BW.FLOWER, 1]]], [B.COPPER_BLOCK, 1, [[I.COPPER_INGOT, 4]], 'table'],
    [B.IRON_BLOCK, 1, [[I.IRON_INGOT, 4]], 'table'], [B.GOLD_BLOCK, 1, [[I.GOLD_INGOT, 4]], 'table'],
    [B.DIAMOND_BLOCK, 1, [[I.DIAMOND, 4]], 'table'],
    [I.COPPER_INGOT, 1, [[B.COPPER_ORE, 1], [I.COAL, 1]], 'furnace'], [I.IRON_INGOT, 1, [[B.IRON_ORE, 1], [I.COAL, 1]], 'furnace'],
    [I.GOLD_INGOT, 1, [[B.GOLD_ORE, 1], [I.COAL, 1]], 'furnace'], [B.GLASS, 2, [[B.SAND, 2], [I.COAL, 1]], 'furnace'],
    [B.BRICKS, 2, [[B.CLAY, 2], [I.COAL, 1]], 'furnace']
  ].map(function (a) { return { out: a[0], n: a[1], ing: a[2], st: a[3] || null, cat: '' }; });
  for (var cw = 1; cw < 11; cw++) RECIPES.push({ out: B.WOOL + cw, n: 1, ing: [[B.WOOL, 1], [I.DYE, 1]], st: null, cat: 'wool' });
  BW.RECIPES = RECIPES;

  function qMap(a) {
    var v = a[4];
    if (typeof v === 'string') v = function (s) { return s[a[4]] || 0; };
    else if (typeof v === 'number') {
      v = v < 0 ? function (s) { return s.placed[-a[4]] || 0; }
        : v >= 1000 ? function (s) { return s.craft[a[4] - 1000] || 0; }
        : function (s) { return s.got[a[4]] || 0; };
    }
    return { id: a[0], text: a[1], icon: a[2], need: a[3], val: v };
  }

  BW.QUESTS_SURVIVAL = [
    ['logs', 'اقطع شجرة واجمع 4 قطع خشب', B.LOG, 4, B.LOG],
    ['planks', 'اصنع ألواح خشب', B.PLANKS, 4, 1000 + B.PLANKS],
    ['table', 'اصنع طاولة الصنع', B.TABLE, 1, 1000 + B.TABLE],
    ['tableplace', 'ضع طاولة الصنع على الأرض', B.TABLE, 1, -B.TABLE],
    ['pickwood', 'اصنع معولًا خشبيًا', I.PICK_WOOD, 1, 1000 + I.PICK_WOOD],
    ['stone', 'احفر 12 مكعب حجر', B.STONE, 12, B.STONE],
    ['pickstone', 'اصنع معولًا حجريًا', I.PICK_STONE, 1, 1000 + I.PICK_STONE],
    ['coal', 'اعثر على 5 قطع فحم', I.COAL, 5, I.COAL],
    ['torch', 'اصنع شعلات مضيئة', B.TORCH, 4, 1000 + B.TORCH],
    ['torchplace', 'أضئ كهفًا بـ 4 شعلات', B.TORCH, 4, -B.TORCH],
    ['tntblast', 'فجّر متفجرات TNT في المنجم!', B.TNT, 1, 'blasts'],
    ['chest', 'افتح صندوق كنز تحت الأرض', B.CHEST, 1, 'chests'],
    ['spring', 'اقفز عاليًا على منصة قفز', B.SPRING, 1, 'bounces'],
    ['furnace', 'اصنع فرنًا لصهر المعادن', B.FURNACE, 1, 1000 + B.FURNACE],
    ['copper', 'اصهر سبيكة نحاس', I.COPPER_INGOT, 1, 1000 + I.COPPER_INGOT],
    ['iron', 'اصهر 3 سبائك حديد', I.IRON_INGOT, 3, 1000 + I.IRON_INGOT],
    ['pickiron', 'اصنع معولًا حديديًا', I.PICK_IRON, 1, 1000 + I.PICK_IRON],
    ['slime', 'اجمع جل السلايم أو البلور المشع', I.SLIME_GEL, 2, I.SLIME_GEL],
    ['jetboots', 'اصنع حذاء القفز النفاث!', I.JET_BOOTS, 1, 1000 + I.JET_BOOTS],
    ['pet', 'ربّت على حيوان أليف', B.WOOL, 1, function (s) { return (s.pets || 0) + (s.sheared || 0); }],
    ['build50', 'ابنِ بـ 40 مكعبًا', B.BRICKS, 40, 'placedTotal'],
    ['door', 'ضع بابًا لقاعدتك', I.DOOR, 1, -B.DOOR_B],
    ['ruby', 'اعثر على ياقوتة متوهجة', I.RUBY, 1, I.RUBY],
    ['diamond', 'اعثر على ألماسة!', I.DIAMOND, 1, I.DIAMOND],
    ['pickdiamond', 'اصنع معولًا ألماسيًا أو ياقوتيًا', I.PICK_DIAMOND, 1, function (s) { return (s.craft[I.PICK_DIAMOND] || 0) + (s.craft[I.PICK_RUBY] || 0); }],
    ['biomes', 'زُر المناطق الخمس كلها', B.CACTUS, 5, function (s) { return Object.keys(s.biomes || {}).length; }],
    ['bedrock', 'انزل إلى صخر القاع السحيق', B.BEDROCK, 1, function (s) { return s.maxDepth >= 130 ? 1 : 0; }]
  ].map(qMap);

  BW.QUESTS_CREATIVE = [
    ['c_fly', 'طِر في السماء (مرتان على مسافة)', B.GLASS, 1, 'flew'],
    ['c_50', 'ضع 50 مكعبًا', B.PLANKS, 50, 'placedTotal'],
    ['c_tnt', 'فجّر متفجرات TNT!', B.TNT, 1, 'blasts'],
    ['c_spring', 'جرّب منصة القفز الخارقة', B.SPRING, 1, 'bounces'],
    ['c_wool', 'ابنِ بـ 5 ألوان من الصوف', B.WOOL + 1, 5, function (s) { var n = 0; for (var i = 0; i < 11; i++) if (s.placed[B.WOOL + i]) n++; return n; }],
    ['c_light', 'أضئ بـ 10 شعلات أو فوانيس', B.LANTERN, 10, function (s) { return (s.placed[B.TORCH] || 0) + (s.placed[B.LANTERN] || 0) + (s.placed[B.JACK] || 0); }],
    ['c_200', 'ضع 200 مكعب', B.BRICKS, 200, 'placedTotal'],
    ['c_sky', 'ابنِ برجًا في السماء', B.GOLD_BLOCK, 1, function (s) { return s.highestPlace <= 24 ? 1 : 0; }],
    ['c_biomes', 'زُر المناطق الخمس كلها', B.CACTUS, 5, function (s) { return Object.keys(s.biomes || {}).length; }],
    ['c_500', 'البنّاء الأسطوري: 500 مكعب!', B.DIAMOND_BLOCK, 500, 'placedTotal']
  ].map(qMap);

  BW.SKINS = [
    ['المستكشف الشجاع', 0, '#4d2e16', '#f5c49c', '#29b6f6', '#283593'],
    ['خبير المتفجرات', 3, '#22222c', '#ecc096', '#e63946', '#2b2d42', '#ffd60a'],
    ['نينجا الكهوف', 7, '#191a24', '#f2c6a0', '#3a0ca3', '#141626', '#4cc9f0'],
    ['فارس الزمرد', 12, '#6a3818', '#e6b48a', '#2dc653', '#1b4332', '#b7e4c7'],
    ['رائد الفضاء النفاث', 18, '#ffd84a', '#f5c8a2', '#f8f9fa', '#3a86ff', '#00f5d4'],
    ['ملك الألماس والياقوت', 24, '#fff1a8', '#f5c8a2', '#38ece4', '#7209b7', 'crown']
  ].map(function (a) { return { name: a[0], stars: a[1], hair: a[2], skin: a[3], shirt: a[4], pants: a[5], hat: a[6] || null }; });
})();

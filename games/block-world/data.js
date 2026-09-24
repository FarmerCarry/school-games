/* Block World — data: blocks, items, procedural pixel textures, recipes, quests. */
(function () {
  'use strict';
  var BW = window.BW = window.BW || {};

  // ------------------------------------------------------------------ ids
  var B = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, TRUNK: 5, LEAVES: 6, LOG: 7, PLANKS: 8,
    COAL_ORE: 9, COPPER_ORE: 10, IRON_ORE: 11, GOLD_ORE: 12, DIAMOND_ORE: 13, BEDROCK: 14,
    TORCH: 15, TABLE: 16, FURNACE: 17, GLASS: 18, BRICKS: 19, STONE_BRICKS: 20,
    DOOR_B: 21, DOOR_T: 22, LADDER: 23, WATER: 24, SNOW_GRASS: 25, SNOW: 26, ICE: 27,
    PINE_LEAVES: 28, CACTUS: 29, TALLGRASS: 30, FLOWER_RED: 31, FLOWER_YELLOW: 32, FLOWER_BLUE: 33,
    SAPLING: 34, PUMPKIN: 35, JACK: 36, MUSHROOM: 37, CLAY: 38, LANTERN: 39,
    IRON_BLOCK: 40, GOLD_BLOCK: 41, DIAMOND_BLOCK: 42, COPPER_BLOCK: 43, SANDSTONE: 44, DEADBUSH: 45,
    WOOL: 50 // 50..60 = white, red, orange, yellow, lime, green, cyan, blue, purple, pink, black
  };
  var I = {
    STICK: 100, COAL: 101, COPPER_INGOT: 102, IRON_INGOT: 103, GOLD_INGOT: 104, DIAMOND: 105, DYE: 106,
    DOOR: 107, PICK_WOOD: 110, PICK_STONE: 111, PICK_IRON: 112, PICK_DIAMOND: 113
  };
  var WOOL_NAMES = ['White', 'Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Black'];
  var WOOL_COLS = ['#f4f4f4', '#e8413c', '#f89632', '#ffd93d', '#8ae03a', '#2f9e44', '#28c4d8', '#3b6fe0', '#9b4fe2', '#ff8fc8', '#2d2d36'];
  BW.B = B; BW.I = I; BW.WOOL_NAMES = WOOL_NAMES; BW.WOOL_COLS = WOOL_COLS;

  // --------------------------------------------------------- block table
  // solid: collides with player. opaque: blocks light. hard: seconds by hand.
  // tier: pickaxe tier needed (0 hand, 1 wood, 2 stone, 3 iron). mat: sound.
  // support: needs a solid block below. attach: needs any neighbour/wall.
  var BLOCKS = [];
  function def(id, o) {
    var d = {
      id: id, name: o.name, solid: o.solid !== false, opaque: o.opaque !== undefined ? o.opaque : o.solid !== false,
      hard: o.hard == null ? 1 : o.hard, tier: o.tier || 0, drop: o.drop === undefined ? id : o.drop,
      light: o.light || 0, mat: o.mat || 'stone', cols: o.cols || ['#888'], support: !!o.support, attach: !!o.attach,
      replace: !!o.replace, climb: !!o.climb, liquid: !!o.liquid, animalSolid: !!o.animalSolid, dim: o.dim || 0,
      noEdge: !!o.noEdge
    };
    BLOCKS[id] = d;
    return d;
  }
  def(B.AIR, { name: 'Air', solid: false, opaque: false, hard: 0, drop: 0, replace: true });
  def(B.GRASS, { name: 'Grass', hard: 0.5, drop: B.DIRT, mat: 'dirt', cols: ['#5cc23c', '#8a5a36'] });
  def(B.DIRT, { name: 'Dirt', hard: 0.45, mat: 'dirt', cols: ['#8a5a36', '#6e4527'] });
  def(B.STONE, { name: 'Stone', hard: 1.4, tier: 1, mat: 'stone', cols: ['#8e8e96', '#76767e'] });
  def(B.SAND, { name: 'Sand', hard: 0.4, mat: 'sand', cols: ['#f0d98c', '#dcc271'] });
  def(B.TRUNK, { name: 'Tree', solid: false, opaque: false, hard: 1.0, drop: B.LOG, mat: 'wood', cols: ['#7a5230', '#553619'], noEdge: true });
  def(B.LEAVES, { name: 'Leaves', solid: false, opaque: false, dim: 2, hard: 0.15, drop: 0, mat: 'leaf', cols: ['#3fa535', '#2a7a25', '#5fcf50'] });
  def(B.LOG, { name: 'Log', hard: 1.0, mat: 'wood', cols: ['#7a5230', '#553619'] });
  def(B.PLANKS, { name: 'Planks', hard: 0.9, mat: 'wood', cols: ['#c8955a', '#8f6334'] });
  def(B.COAL_ORE, { name: 'Coal Ore', hard: 1.7, tier: 1, drop: I.COAL, mat: 'stone', cols: ['#8e8e96', '#2a2a2e'] });
  def(B.COPPER_ORE, { name: 'Copper Ore', hard: 1.9, tier: 1, mat: 'stone', cols: ['#8e8e96', '#e07a3c'] });
  def(B.IRON_ORE, { name: 'Iron Ore', hard: 2.3, tier: 2, mat: 'stone', cols: ['#8e8e96', '#e8c4a8'] });
  def(B.GOLD_ORE, { name: 'Gold Ore', hard: 2.6, tier: 3, mat: 'stone', cols: ['#8e8e96', '#ffd23a'] });
  def(B.DIAMOND_ORE, { name: 'Diamond Ore', hard: 3.2, tier: 3, drop: I.DIAMOND, mat: 'stone', cols: ['#8e8e96', '#4ef0e6'] });
  def(B.BEDROCK, { name: 'Bedrock', hard: Infinity, tier: 99, drop: 0, mat: 'stone', cols: ['#333'] });
  def(B.TORCH, { name: 'Torch', solid: false, opaque: false, hard: 0.05, light: 14, mat: 'wood', attach: true, cols: ['#ffcc33', '#8a5f38'] });
  def(B.TABLE, { name: 'Crafting Table', hard: 0.9, mat: 'wood', cols: ['#c8955a', '#6a4526'] });
  def(B.FURNACE, { name: 'Furnace', hard: 1.6, tier: 1, light: 6, mat: 'stone', cols: ['#8e8e96', '#ff8a2a'] });
  def(B.GLASS, { name: 'Glass', opaque: false, hard: 0.4, mat: 'glass', cols: ['#dff6ff', '#a8dcf0'] });
  def(B.BRICKS, { name: 'Bricks', hard: 1.6, tier: 1, mat: 'stone', cols: ['#b8483a', '#e8d8c8'] });
  def(B.STONE_BRICKS, { name: 'Stone Bricks', hard: 1.6, tier: 1, mat: 'stone', cols: ['#9a9aa2', '#6b6b73'] });
  def(B.DOOR_B, { name: 'Door', solid: false, opaque: false, hard: 0.8, drop: I.DOOR, mat: 'wood', support: true, animalSolid: true, cols: ['#b98549', '#6a4526'] });
  def(B.DOOR_T, { name: 'Door', solid: false, opaque: false, hard: 0.8, drop: 0, mat: 'wood', animalSolid: true, cols: ['#b98549', '#6a4526'] });
  def(B.LADDER, { name: 'Ladder', solid: false, opaque: false, hard: 0.4, mat: 'wood', climb: true, attach: true, cols: ['#b98549'] });
  def(B.WATER, { name: 'Water', solid: false, opaque: false, hard: Infinity, tier: 99, drop: 0, liquid: true, replace: true, mat: 'water', cols: ['#3b8fe8', '#8fd0ff'] });
  def(B.SNOW_GRASS, { name: 'Snowy Grass', hard: 0.5, drop: B.DIRT, mat: 'snow', cols: ['#f4fbff', '#8a5a36'] });
  def(B.SNOW, { name: 'Snow', hard: 0.3, mat: 'snow', cols: ['#f4fbff', '#cfe4f4'] });
  def(B.ICE, { name: 'Ice', opaque: false, hard: 0.5, mat: 'glass', cols: ['#bfe9ff', '#8fd0f4'] });
  def(B.PINE_LEAVES, { name: 'Pine Leaves', solid: false, opaque: false, dim: 2, hard: 0.15, drop: 0, mat: 'leaf', cols: ['#23703a', '#f4fbff'] });
  def(B.CACTUS, { name: 'Cactus', solid: false, opaque: false, hard: 0.4, mat: 'leaf', support: true, animalSolid: true, cols: ['#4caf3c', '#2f7a28'] });
  def(B.TALLGRASS, { name: 'Tall Grass', solid: false, opaque: false, hard: 0.05, drop: 0, mat: 'leaf', support: true, replace: true, cols: ['#5cc23c'] });
  def(B.FLOWER_RED, { name: 'Red Flower', solid: false, opaque: false, hard: 0.05, mat: 'leaf', support: true, cols: ['#ff4a4a', '#4fae33'] });
  def(B.FLOWER_YELLOW, { name: 'Yellow Flower', solid: false, opaque: false, hard: 0.05, mat: 'leaf', support: true, cols: ['#ffe03a', '#4fae33'] });
  def(B.FLOWER_BLUE, { name: 'Blue Flower', solid: false, opaque: false, hard: 0.05, mat: 'leaf', support: true, cols: ['#4a8cff', '#4fae33'] });
  def(B.SAPLING, { name: 'Sapling', solid: false, opaque: false, hard: 0.05, mat: 'leaf', support: true, cols: ['#4fbf40', '#7a5230'] });
  def(B.PUMPKIN, { name: 'Pumpkin', hard: 0.6, mat: 'wood', cols: ['#f28a1e', '#c9661a'] });
  def(B.JACK, { name: 'Jack o\'Lantern', hard: 0.6, light: 13, mat: 'wood', cols: ['#f28a1e', '#ffe066'] });
  def(B.MUSHROOM, { name: 'Glow Mushroom', solid: false, opaque: false, hard: 0.1, light: 9, mat: 'leaf', support: true, cols: ['#4ff0ff', '#b8fbff'] });
  def(B.CLAY, { name: 'Clay', hard: 0.6, mat: 'dirt', cols: ['#9fa8c0', '#8a93ab'] });
  def(B.LANTERN, { name: 'Lantern', hard: 0.6, light: 15, opaque: false, mat: 'glass', cols: ['#ffe066', '#555'] });
  def(B.IRON_BLOCK, { name: 'Iron Block', hard: 2.5, tier: 1, mat: 'metal', cols: ['#e6e6ee', '#b8b8c4'] });
  def(B.GOLD_BLOCK, { name: 'Gold Block', hard: 2.5, tier: 1, mat: 'metal', cols: ['#ffd84a', '#e8a820'] });
  def(B.DIAMOND_BLOCK, { name: 'Diamond Block', hard: 2.5, tier: 1, mat: 'metal', cols: ['#6ff5ee', '#2fc6c0'] });
  def(B.COPPER_BLOCK, { name: 'Copper Block', hard: 2.5, tier: 1, mat: 'metal', cols: ['#e8844a', '#b85a2a'] });
  def(B.SANDSTONE, { name: 'Sandstone', hard: 1.0, tier: 1, mat: 'stone', cols: ['#e2c47a', '#c8a85e'] });
  def(B.DEADBUSH, { name: 'Dry Bush', solid: false, opaque: false, hard: 0.05, drop: I.STICK, mat: 'leaf', support: true, replace: true, cols: ['#a07840'] });
  for (var w = 0; w < 11; w++) def(B.WOOL + w, { name: WOOL_NAMES[w] + ' Wool', hard: 0.5, mat: 'wool', cols: [WOOL_COLS[w]] });
  for (var k = 0; k < 256; k++) if (!BLOCKS[k]) BLOCKS[k] = null;
  BW.BLOCKS = BLOCKS;

  // --------------------------------------------------------------- items
  var ITEMS = {};
  function item(id, o) { o.id = id; ITEMS[id] = o; return o; }
  BLOCKS.forEach(function (d) {
    if (!d || d.id === 0) return;
    item(d.id, { name: d.name, place: d.id, cols: d.cols });
  });
  // blocks that are never items
  [B.TRUNK, B.DOOR_B, B.DOOR_T, B.WATER, B.BEDROCK, B.GRASS, B.SNOW_GRASS, B.TALLGRASS, B.DEADBUSH].forEach(function (id) { delete ITEMS[id]; });
  item(I.STICK, { name: 'Stick', cols: ['#a07040'] });
  item(I.COAL, { name: 'Coal', cols: ['#2a2a2e'] });
  item(I.COPPER_INGOT, { name: 'Copper Bar', cols: ['#e8844a'] });
  item(I.IRON_INGOT, { name: 'Iron Bar', cols: ['#e6e6ee'] });
  item(I.GOLD_INGOT, { name: 'Gold Bar', cols: ['#ffd84a'] });
  item(I.DIAMOND, { name: 'Diamond', cols: ['#6ff5ee'] });
  item(I.DYE, { name: 'Rainbow Dye', cols: ['#ff5ab0', '#ffd93d', '#3b6fe0'] });
  item(I.DOOR, { name: 'Door', place: B.DOOR_B, cols: ['#b98549'] });
  item(I.PICK_WOOD, { name: 'Wooden Pickaxe', tool: 1, speed: 2, max: 1, cols: ['#c8955a'] });
  item(I.PICK_STONE, { name: 'Stone Pickaxe', tool: 2, speed: 3, max: 1, cols: ['#9a9aa2'] });
  item(I.PICK_IRON, { name: 'Iron Pickaxe', tool: 3, speed: 4.5, max: 1, cols: ['#e6e6ee'] });
  item(I.PICK_DIAMOND, { name: 'Diamond Pickaxe', tool: 4, speed: 7, max: 1, cols: ['#6ff5ee'] });
  BW.ITEMS = ITEMS;
  BW.WALL_NAMES = [null, 'dirt', 'stone', 'sandstone'];

  // ------------------------------------------------------------ recipes
  // st: null (hand), 'table', 'furnace'. FLOWER = any flower (-1).
  var FLOWER = -1;
  BW.FLOWER = FLOWER;
  var R = [];
  function rec(out, n, ing, st, cat) { R.push({ out: out, n: n, ing: ing, st: st || null, cat: cat || 'block' }); }
  rec(B.PLANKS, 4, [[B.LOG, 1]], null);
  rec(I.STICK, 4, [[B.PLANKS, 2]], null, 'item');
  rec(B.TABLE, 1, [[B.PLANKS, 4]], null);
  rec(B.TORCH, 4, [[I.STICK, 1], [I.COAL, 1]], null);
  rec(I.PICK_WOOD, 1, [[B.PLANKS, 3], [I.STICK, 2]], 'table', 'tool');
  rec(I.PICK_STONE, 1, [[B.STONE, 3], [I.STICK, 2]], 'table', 'tool');
  rec(B.FURNACE, 1, [[B.STONE, 8]], 'table');
  rec(I.COPPER_INGOT, 1, [[B.COPPER_ORE, 1]], 'furnace', 'item');
  rec(I.IRON_INGOT, 1, [[B.IRON_ORE, 1]], 'furnace', 'item');
  rec(I.GOLD_INGOT, 1, [[B.GOLD_ORE, 1]], 'furnace', 'item');
  rec(I.PICK_IRON, 1, [[I.IRON_INGOT, 3], [I.STICK, 2]], 'table', 'tool');
  rec(I.PICK_DIAMOND, 1, [[I.DIAMOND, 3], [I.STICK, 2]], 'table', 'tool');
  rec(B.GLASS, 1, [[B.SAND, 1]], 'furnace');
  rec(B.BRICKS, 1, [[B.CLAY, 1]], 'furnace');
  rec(B.STONE_BRICKS, 4, [[B.STONE, 4]], 'table');
  rec(I.DOOR, 1, [[B.PLANKS, 6]], 'table');
  rec(B.LADDER, 4, [[I.STICK, 5]], 'table');
  rec(B.LANTERN, 2, [[I.COPPER_INGOT, 1], [B.TORCH, 1]], 'table');
  rec(B.JACK, 1, [[B.PUMPKIN, 1], [B.TORCH, 1]], null);
  rec(I.DYE, 2, [[FLOWER, 1]], null, 'item');
  for (var c = 1; c < 11; c++) rec(B.WOOL + c, 1, [[B.WOOL, 1], [I.DYE, 1]], null, 'wool');
  rec(B.SANDSTONE, 2, [[B.SAND, 4]], 'table');
  rec(B.COPPER_BLOCK, 1, [[I.COPPER_INGOT, 4]], 'table');
  rec(B.IRON_BLOCK, 1, [[I.IRON_INGOT, 4]], 'table');
  rec(B.GOLD_BLOCK, 1, [[I.GOLD_INGOT, 4]], 'table');
  rec(B.DIAMOND_BLOCK, 1, [[I.DIAMOND, 4]], 'table');
  BW.RECIPES = R;

  // ------------------------------------------------------------- quests
  // Each: id, text, icon, need, val(stats) -> number
  function S(obj, id) { return (obj && obj[id]) || 0; }
  BW.QUESTS_SURVIVAL = [
    { id: 'logs', text: 'Chop a tree (hold click on it)', icon: B.LOG, need: 4, val: function (s) { return S(s.got, B.LOG); } },
    { id: 'planks', text: 'Craft Planks (press E)', icon: B.PLANKS, need: 4, val: function (s) { return S(s.craft, B.PLANKS); } },
    { id: 'table', text: 'Craft a Crafting Table', icon: B.TABLE, need: 1, val: function (s) { return S(s.craft, B.TABLE); } },
    { id: 'tableplace', text: 'Place your Crafting Table', icon: B.TABLE, need: 1, val: function (s) { return S(s.placed, B.TABLE); } },
    { id: 'pickwood', text: 'Craft a Wooden Pickaxe', icon: I.PICK_WOOD, need: 1, val: function (s) { return S(s.craft, I.PICK_WOOD); } },
    { id: 'stone', text: 'Dig down and mine Stone', icon: B.STONE, need: 10, val: function (s) { return S(s.got, B.STONE); } },
    { id: 'pickstone', text: 'Craft a Stone Pickaxe', icon: I.PICK_STONE, need: 1, val: function (s) { return S(s.craft, I.PICK_STONE); } },
    { id: 'coal', text: 'Find Coal', icon: I.COAL, need: 1, val: function (s) { return S(s.got, I.COAL); } },
    { id: 'torch', text: 'Craft Torches', icon: B.TORCH, need: 4, val: function (s) { return S(s.craft, B.TORCH); } },
    { id: 'torchplace', text: 'Light up a cave: place Torches', icon: B.TORCH, need: 5, val: function (s) { return S(s.placed, B.TORCH); } },
    { id: 'furnace', text: 'Build a Furnace', icon: B.FURNACE, need: 1, val: function (s) { return S(s.craft, B.FURNACE); } },
    { id: 'copper', text: 'Smelt a Copper Bar', icon: I.COPPER_INGOT, need: 1, val: function (s) { return S(s.craft, I.COPPER_INGOT); } },
    { id: 'iron', text: 'Smelt Iron Bars', icon: I.IRON_INGOT, need: 3, val: function (s) { return S(s.craft, I.IRON_INGOT); } },
    { id: 'pickiron', text: 'Craft an Iron Pickaxe', icon: I.PICK_IRON, need: 1, val: function (s) { return S(s.craft, I.PICK_IRON); } },
    { id: 'glass', text: 'Make Glass from Sand', icon: B.GLASS, need: 1, val: function (s) { return S(s.craft, B.GLASS); } },
    { id: 'shear', text: 'Get Wool from a Sheep (click it)', icon: B.WOOL, need: 1, val: function (s) { return s.sheared || 0; } },
    { id: 'dye', text: 'Paint Wool a color', icon: B.WOOL + 7, need: 1, val: function (s) { var n = 0; for (var i = 1; i < 11; i++) n += S(s.craft, B.WOOL + i); return n; } },
    { id: 'sapling', text: 'Plant a Sapling', icon: B.SAPLING, need: 1, val: function (s) { return S(s.placed, B.SAPLING); } },
    { id: 'door', text: 'Build a house with a Door', icon: I.DOOR, need: 1, val: function (s) { return S(s.placed, B.DOOR_B); } },
    { id: 'gold', text: 'Find Gold deep down', icon: B.GOLD_ORE, need: 1, val: function (s) { return S(s.got, B.GOLD_ORE); } },
    { id: 'diamond', text: 'Find a Diamond!', icon: I.DIAMOND, need: 1, val: function (s) { return S(s.got, I.DIAMOND); } },
    { id: 'pickdiamond', text: 'Craft a Diamond Pickaxe', icon: I.PICK_DIAMOND, need: 1, val: function (s) { return S(s.craft, I.PICK_DIAMOND); } },
    { id: 'explore', text: 'Visit the desert, snow & beach', icon: B.CACTUS, need: 3, val: function (s) { var v = s.biomes || {}; return (v.desert ? 1 : 0) + (v.snow ? 1 : 0) + (v.beach ? 1 : 0); } },
    { id: 'friends', text: 'Pet 5 animals (click them)', icon: B.FLOWER_RED, need: 5, val: function (s) { return s.pets || 0; } },
    { id: 'bedrock', text: 'Dig all the way to Bedrock', icon: B.BEDROCK, need: 1, val: function (s) { return (s.maxDepth || 0) >= 144 ? 1 : 0; } },
    { id: 'builder', text: 'Master builder: place 200 blocks', icon: B.BRICKS, need: 200, val: function (s) { return s.placedTotal || 0; } },
    { id: 'diamondblock', text: 'Craft a shiny Diamond Block', icon: B.DIAMOND_BLOCK, need: 1, val: function (s) { return S(s.craft, B.DIAMOND_BLOCK); } }
  ];
  BW.QUESTS_CREATIVE = [
    { id: 'c50', text: 'Place 50 blocks', icon: B.PLANKS, need: 50, val: function (s) { return s.placedTotal || 0; } },
    { id: 'cfly', text: 'Fly! (tap Space twice)', icon: B.GLASS, need: 1, val: function (s) { return s.flew ? 1 : 0; } },
    { id: 'cwool', text: 'Build with 6 wool colors', icon: B.WOOL + 1, need: 6, val: function (s) { var n = 0; for (var i = 0; i < 11; i++) if (S(s.placed, B.WOOL + i)) n++; return n; } },
    { id: 'cglass', text: 'Make a big window: 20 Glass', icon: B.GLASS, need: 20, val: function (s) { return S(s.placed, B.GLASS); } },
    { id: 'clamp', text: 'Light it up: 10 Lanterns', icon: B.LANTERN, need: 10, val: function (s) { return S(s.placed, B.LANTERN); } },
    { id: 'ctree', text: 'Plant a forest: 5 Saplings', icon: B.SAPLING, need: 5, val: function (s) { return S(s.placed, B.SAPLING); } },
    { id: 'csky', text: 'Build up to the clouds', icon: B.SNOW, need: 1, val: function (s) { return (s.highestPlace || 999) <= 14 ? 1 : 0; } },
    { id: 'cexplore', text: 'Visit all 5 lands', icon: B.CACTUS, need: 5, val: function (s) { var v = s.biomes || {}; var n = 0; for (var k in v) if (v[k]) n++; return n; } },
    { id: 'cpets', text: 'Pet 5 animals', icon: B.FLOWER_RED, need: 5, val: function (s) { return s.pets || 0; } },
    { id: 'c500', text: 'Mega builder: place 500 blocks', icon: B.GOLD_BLOCK, need: 500, val: function (s) { return s.placedTotal || 0; } }
  ];

  // --------------------------------------------------------------- skins
  BW.SKINS = [
    { name: 'Explorer', stars: 0, shirt: '#2fb5a8', pants: '#3b4a8c', hair: '#5a3418', skin: '#f2c49b', shoes: '#3a2a1a' },
    { name: 'Sunny', stars: 3, shirt: '#ffcf2e', pants: '#2f6fd6', hair: '#d9772b', skin: '#ffd8b0', shoes: '#c43d3d' },
    { name: 'Berry', stars: 8, shirt: '#b24de0', pants: '#2d2d4a', hair: '#1f1f2e', skin: '#c68a5e', shoes: '#ff6ab4' },
    { name: 'Robo', stars: 14, shirt: '#b9c3cf', pants: '#6b7888', hair: '#6b7888', skin: '#dfe6ee', shoes: '#39424e', robot: true },
    { name: 'Froggy', stars: 20, shirt: '#4cc94a', pants: '#2c8a3a', hair: '#4cc94a', skin: '#f2c49b', shoes: '#ffcc33', frog: true },
    { name: 'Golden', stars: 30, shirt: '#ffd23a', pants: '#e8a820', hair: '#fff08a', skin: '#ffe4c0', shoes: '#b87a10', gold: true }
  ];

  // ============================================================ textures
  function hex(h) { h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, f) { var c = hex(h); return 'rgb(' + Math.min(255, Math.round(c[0] * f)) + ',' + Math.min(255, Math.round(c[1] * f)) + ',' + Math.min(255, Math.round(c[2] * f)) + ')'; }
  BW.hex = hex; BW.shade = shade;
  var seed = 1234567;
  function r() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function ri(n) { return Math.floor(r() * n); }
  function pick(a) { return a[ri(a.length)]; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function P(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  function R4(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  function speckle(g, pal, x0, y0, w, h) { for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) P(g, x, y, pick(pal)); }
  function blobs(g, n, col, hi, sz) {
    for (var i = 0; i < n; i++) {
      var x = 1 + ri(13), y = 1 + ri(13);
      var s = sz || 2;
      R4(g, x, y, s, s, col);
      if (r() < 0.6) P(g, x + ri(s + 1), y - 1 + ri(2), col);
      if (hi) P(g, x, y, hi);
    }
  }
  var dirtPal = ['#8a5a36', '#7b4f2e', '#946340', '#86573a', '#7f5232'];
  var stonePal = ['#8e8e96', '#85858d', '#9a9aa2', '#8a8a92', '#93939b'];
  function dirt(g) { speckle(g, dirtPal, 0, 0, 16, 16); for (var i = 0; i < 6; i++) { var x = ri(15), y = ri(15); P(g, x, y, '#5f3b1f'); P(g, x + 1, y, '#6a4426'); } for (i = 0; i < 4; i++) P(g, ri(16), ri(16), '#a07048'); }
  function stone(g) {
    speckle(g, stonePal, 0, 0, 16, 16);
    for (var i = 0; i < 5; i++) { var x = ri(14), y = ri(14), l = 2 + ri(3); for (var k = 0; k < l; k++) { P(g, x, y, '#72727a'); x += ri(2); y += r() < 0.5 ? 1 : 0; } }
    for (i = 0; i < 6; i++) P(g, ri(16), ri(16), '#a8a8b0');
  }
  function sand(g) { speckle(g, ['#f0d98c', '#ecd483', '#f5e29c', '#e6cc7a', '#f2dd92'], 0, 0, 16, 16); for (var i = 0; i < 5; i++) P(g, ri(16), ri(16), '#d4b866'); for (i = 0; i < 4; i++) P(g, ri(16), ri(16), '#fff2c0'); }
  function bark(g, x0, w) {
    for (var x = x0; x < x0 + w; x++) {
      var base = (x - x0) % 3 === 0 ? '#5e3e20' : pick(['#7a5230', '#6f4a2a', '#83593a']);
      for (var y = 0; y < 16; y++) P(g, x, y, r() < 0.12 ? '#553619' : base);
    }
  }
  function planks(g) {
    speckle(g, ['#c8955a', '#c28f54', '#cd9b60'], 0, 0, 16, 16);
    for (var row = 0; row < 4; row++) {
      R4(g, 0, row * 4 + 3, 16, 1, '#8f6334');
      var cut = (row * 7 + 3) % 16; R4(g, cut, row * 4, 1, 3, '#9b6c3c');
      for (var k = 0; k < 3; k++) P(g, ri(16), row * 4 + ri(3), '#b8844a');
      P(g, (cut + 2) % 16, row * 4 + 1, '#6f4a2a');
    }
  }
  function ore(g, col, hi, dark, n) {
    stone(g);
    for (var i = 0; i < (n || 5); i++) {
      var x = 1 + ri(12), y = 1 + ri(12);
      R4(g, x, y, 2, 2, col); P(g, x + 2, y + 1, dark || col); P(g, x + 1, y + 2, dark || col); P(g, x, y, hi);
    }
  }
  function bricks(g, mortar, pal, dark) {
    R4(g, 0, 0, 16, 16, mortar);
    for (var row = 0; row < 4; row++) {
      var off = row % 2 ? 4 : 0;
      for (var bx = -8; bx < 16; bx += 8) {
        var x0 = bx + off, col = pick(pal);
        for (var y = row * 4; y < row * 4 + 3; y++) for (var x = Math.max(0, x0); x < Math.min(16, x0 + 7); x++) P(g, x, y, r() < 0.15 ? dark : col);
        if (x0 + 1 >= 0 && x0 + 1 < 16) P(g, x0 + 1, row * 4, shade(col, 1.15));
      }
    }
  }
  function metal(g, base, hi, dark) {
    R4(g, 0, 0, 16, 16, base);
    R4(g, 0, 0, 16, 1, hi); R4(g, 0, 0, 1, 16, hi); R4(g, 0, 15, 16, 1, dark); R4(g, 15, 0, 1, 16, dark);
    R4(g, 2, 2, 12, 12, shade(base, 0.95));
    for (var i = 0; i < 5; i++) P(g, 3 + i, 7 - i, hi);
    for (i = 0; i < 3; i++) P(g, 9 + i, 12 - i, hi);
    P(g, 2, 2, '#fff'); P(g, 13, 13, dark);
  }
  function wool(g, col) {
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var f = ((x + y * 3) % 5 === 0) ? 0.88 : ((x * 2 + y) % 7 === 0 ? 1.07 : 1);
      if (r() < 0.12) f *= 0.94;
      P(g, x, y, shade(col, f));
    }
  }
  function leaves(g, pal, holes, snow) {
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      if (r() < holes) continue;
      P(g, x, y, pick(pal));
    }
    for (var i = 0; i < 6; i++) { var x0 = ri(14), y0 = ri(14); P(g, x0, y0, shade(pal[0], 1.25)); P(g, x0 + 1, y0, shade(pal[0], 1.15)); }
    if (snow) for (i = 0; i < 10; i++) { P(g, ri(16), ri(6), '#f4fbff'); }
  }

  var TEX = [];
  function T(id, fn) { var c = canvas(16); var g = c.getContext('2d'); seed = 1000 + id * 7919; fn(g); TEX[id] = c; return c; }
  T(B.DIRT, dirt);
  T(B.GRASS, function (g) {
    dirt(g);
    var grassPal = ['#5cc23c', '#52b534', '#66cc44', '#4fae33'];
    for (var x = 0; x < 16; x++) {
      var d = 3 + ri(3);
      for (var y = 0; y < d; y++) P(g, x, y, y === d - 1 ? '#3f942a' : pick(grassPal));
      if (r() < 0.3) P(g, x, d, '#3f942a');
    }
    for (var i = 0; i < 4; i++) P(g, ri(16), ri(2), '#8ae060');
  });
  T(B.SNOW_GRASS, function (g) {
    dirt(g);
    for (var x = 0; x < 16; x++) {
      var d = 3 + ri(3);
      for (var y = 0; y < d; y++) P(g, x, y, y === d - 1 ? '#c6dcee' : pick(['#f4fbff', '#e8f4fc', '#ffffff']));
    }
  });
  T(B.STONE, stone);
  T(B.SAND, sand);
  T(B.TRUNK, function (g) { bark(g, 3, 10); R4(g, 3, 0, 1, 16, '#4a2f16'); R4(g, 12, 0, 1, 16, '#4a2f16'); });
  T(B.LOG, function (g) { bark(g, 0, 16); R4(g, 0, 0, 16, 1, '#4a2f16'); R4(g, 0, 15, 16, 1, '#4a2f16'); });
  T(B.LEAVES, function (g) { leaves(g, ['#3fa535', '#2f8f2b', '#4fbf40', '#37982f', '#46b03a'], 0.07); });
  T(B.PINE_LEAVES, function (g) { leaves(g, ['#23703a', '#1d6232', '#2a7f42', '#1f6a36'], 0.06, true); });
  T(B.PLANKS, planks);
  T(B.COAL_ORE, function (g) { ore(g, '#2a2a2e', '#55555e', '#1a1a1e', 6); });
  T(B.COPPER_ORE, function (g) { ore(g, '#e07a3c', '#ffc08a', '#a8521f', 5); });
  T(B.IRON_ORE, function (g) { ore(g, '#e2b89a', '#fff0e2', '#b88a6a', 5); });
  T(B.GOLD_ORE, function (g) { ore(g, '#ffd23a', '#fffbc0', '#d49a10', 5); });
  T(B.DIAMOND_ORE, function (g) { ore(g, '#3fe6dc', '#e8ffff', '#1a9fa0', 5); });
  T(B.BEDROCK, function (g) { speckle(g, ['#3a3a40', '#2a2a2e', '#55555c', '#1f1f24', '#46464c'], 0, 0, 16, 16); for (var i = 0; i < 6; i++) R4(g, ri(14), ri(14), 2, 2, '#18181c'); });
  T(B.TORCH, function (g) {
    R4(g, 7, 7, 2, 9, '#8a5f38'); R4(g, 7, 7, 1, 9, '#a87848');
    R4(g, 6, 3, 4, 4, '#ff9a1a'); R4(g, 7, 2, 2, 5, '#ffcc33'); R4(g, 7, 4, 2, 2, '#fff6b0'); P(g, 8, 1, '#ffcc33');
  });
  T(B.TABLE, function (g) {
    planks(g);
    R4(g, 0, 0, 16, 4, '#9b6c3c'); R4(g, 0, 0, 16, 1, '#d6a468');
    for (var x = 0; x < 16; x += 4) R4(g, x, 0, 1, 4, '#6a4526');
    R4(g, 0, 4, 16, 1, '#553619'); R4(g, 1, 5, 2, 11, '#6a4526'); R4(g, 13, 5, 2, 11, '#6a4526');
    R4(g, 4, 7, 3, 1, '#9a9aa2'); R4(g, 5, 7, 1, 5, '#6a4526'); // hammer
    R4(g, 9, 6, 1, 6, '#6a4526'); R4(g, 8, 6, 3, 2, '#c0c0c8'); // saw-ish
  });
  T(B.FURNACE, function (g) {
    bricks(g, '#5c5c64', ['#9a9aa2', '#8e8e96', '#a4a4ac'], '#7a7a82');
    R4(g, 3, 7, 10, 7, '#2a2a2e'); R4(g, 4, 10, 8, 4, '#ff7a1a'); R4(g, 5, 11, 6, 3, '#ffcc33'); R4(g, 6, 12, 4, 2, '#fff2a0');
    R4(g, 3, 6, 10, 1, '#55555c');
  });
  T(B.GLASS, function (g) {
    R4(g, 0, 0, 16, 16, 'rgba(200,240,255,0.22)');
    R4(g, 0, 0, 16, 1, '#e8fbff'); R4(g, 0, 15, 16, 1, '#a8d8ea'); R4(g, 0, 0, 1, 16, '#e8fbff'); R4(g, 15, 0, 1, 16, '#a8d8ea');
    for (var i = 0; i < 4; i++) { P(g, 3 + i, 6 - i, 'rgba(255,255,255,0.85)'); P(g, 4 + i, 6 - i, 'rgba(255,255,255,0.5)'); }
    for (i = 0; i < 3; i++) P(g, 9 + i, 12 - i, 'rgba(255,255,255,0.7)');
  });
  T(B.BRICKS, function (g) { bricks(g, '#e0d0bc', ['#b8483a', '#c4543f', '#a8402f', '#bd4c3c'], '#963628'); });
  T(B.STONE_BRICKS, function (g) { bricks(g, '#6b6b73', ['#9a9aa2', '#a2a2aa', '#94949c'], '#86868e'); });
  function doorTex(g, top) {
    R4(g, 1, 0, 14, 16, '#b98549');
    for (var x = 1; x < 15; x += 3) R4(g, x, 0, 1, 16, '#9b6c3c');
    R4(g, 1, 0, 1, 16, '#6a4526'); R4(g, 14, 0, 1, 16, '#6a4526');
    if (top) { R4(g, 1, 0, 14, 1, '#6a4526'); R4(g, 4, 3, 8, 7, '#6a4526'); R4(g, 5, 4, 6, 5, '#bfe9ff'); R4(g, 5, 4, 2, 2, '#ffffff'); R4(g, 7, 4, 1, 5, '#6a4526'); R4(g, 5, 6, 6, 1, '#6a4526'); }
    else { R4(g, 11, 5, 2, 2, '#ffd23a'); P(g, 11, 5, '#fff08a'); R4(g, 4, 9, 8, 5, '#a87848'); R4(g, 4, 9, 8, 1, '#6a4526'); }
  }
  T(B.DOOR_B, function (g) { doorTex(g, false); });
  T(B.DOOR_T, function (g) { doorTex(g, true); });
  T(B.LADDER, function (g) {
    R4(g, 2, 0, 2, 16, '#8a5f38'); R4(g, 12, 0, 2, 16, '#8a5f38'); R4(g, 2, 0, 1, 16, '#a87848'); R4(g, 12, 0, 1, 16, '#a87848');
    for (var y = 1; y < 16; y += 4) { R4(g, 4, y, 8, 2, '#b98549'); R4(g, 4, y + 1, 8, 1, '#8a5f38'); }
  });
  T(B.WATER, function (g) { R4(g, 0, 0, 16, 16, 'rgba(48,130,230,0.62)'); for (var i = 0; i < 5; i++) R4(g, ri(12), ri(16), 3 + ri(3), 1, 'rgba(160,215,255,0.35)'); });
  T(B.SNOW, function (g) { speckle(g, ['#f4fbff', '#eef7fd', '#ffffff', '#e4f0fa'], 0, 0, 16, 16); for (var i = 0; i < 5; i++) P(g, ri(16), ri(16), '#cfe2f2'); });
  T(B.ICE, function (g) {
    R4(g, 0, 0, 16, 16, 'rgba(170,225,255,0.75)');
    for (var i = 0; i < 5; i++) { P(g, 3 + i, 7 - i, 'rgba(255,255,255,0.9)'); }
    for (i = 0; i < 4; i++) P(g, 9 + i, 13 - i, 'rgba(255,255,255,0.7)');
    R4(g, 0, 0, 16, 1, 'rgba(255,255,255,0.6)');
  });
  T(B.CACTUS, function (g) {
    R4(g, 3, 0, 10, 16, '#4caf3c');
    for (var x = 4; x < 13; x += 3) R4(g, x, 0, 1, 16, '#3a9230');
    R4(g, 3, 0, 1, 16, '#2f7a28'); R4(g, 12, 0, 1, 16, '#2f7a28');
    for (var i = 0; i < 6; i++) { var y = 1 + ri(14); P(g, r() < 0.5 ? 2 : 13, y, '#f4f0c0'); }
    R4(g, 5, 0, 1, 16, '#62c552');
  });
  T(B.TALLGRASS, function (g) {
    var cols = ['#5cc23c', '#4fae33', '#6fd24a'];
    [[2, 9], [4, 6], [6, 10], [8, 4], [10, 8], [12, 5], [14, 9]].forEach(function (b) { R4(g, b[0], 16 - (16 - b[1]), 1, 16 - b[1], pick(cols)); P(g, b[0], b[1], '#8ae060'); });
  });
  function flower(g, petal, mid) {
    R4(g, 7, 7, 2, 9, '#3f942a'); R4(g, 4, 11, 3, 2, '#4fae33'); R4(g, 9, 9, 3, 2, '#4fae33');
    R4(g, 5, 3, 6, 4, petal); R4(g, 6, 2, 4, 6, petal); R4(g, 7, 4, 2, 2, mid); P(g, 6, 3, shade(petal, 1.3));
  }
  T(B.FLOWER_RED, function (g) { flower(g, '#ff4a4a', '#ffe03a'); });
  T(B.FLOWER_YELLOW, function (g) { flower(g, '#ffe03a', '#ff9a1a'); });
  T(B.FLOWER_BLUE, function (g) { flower(g, '#4a8cff', '#ffffff'); });
  T(B.SAPLING, function (g) {
    R4(g, 7, 8, 2, 8, '#7a5230');
    R4(g, 3, 5, 5, 4, '#4fbf40'); R4(g, 8, 3, 5, 4, '#3fa535'); R4(g, 6, 1, 4, 4, '#5fcf50'); P(g, 7, 2, '#8ae060');
  });
  function pumpkin(g) {
    R4(g, 1, 3, 14, 13, '#f28a1e');
    for (var x = 1; x < 15; x += 4) R4(g, x, 3, 1, 13, '#c9661a');
    R4(g, 1, 3, 14, 1, '#ffa94a'); R4(g, 1, 15, 14, 1, '#b85a14');
    R4(g, 7, 0, 2, 4, '#5a8a2a'); R4(g, 9, 1, 3, 1, '#4fae33');
  }
  T(B.PUMPKIN, pumpkin);
  T(B.JACK, function (g) {
    pumpkin(g);
    R4(g, 3, 6, 3, 3, '#ffe066'); R4(g, 10, 6, 3, 3, '#ffe066'); P(g, 4, 7, '#fff8c0'); P(g, 11, 7, '#fff8c0');
    R4(g, 4, 11, 8, 2, '#ffe066'); R4(g, 5, 13, 2, 1, '#ffe066'); R4(g, 9, 13, 2, 1, '#ffe066'); P(g, 6, 11, '#f28a1e'); P(g, 9, 11, '#f28a1e');
  });
  T(B.MUSHROOM, function (g) {
    R4(g, 6, 9, 4, 7, '#d8fbff'); R4(g, 7, 9, 1, 7, '#ffffff');
    R4(g, 2, 5, 12, 4, '#2fd8f0'); R4(g, 4, 3, 8, 2, '#2fd8f0'); R4(g, 3, 4, 10, 1, '#4ff0ff');
    P(g, 5, 5, '#e8ffff'); P(g, 9, 4, '#e8ffff'); P(g, 11, 6, '#e8ffff'); P(g, 7, 6, '#b8fbff');
  });
  T(B.CLAY, function (g) { speckle(g, ['#9fa8c0', '#a6afc6', '#98a1b9', '#a2abc2'], 0, 0, 16, 16); for (var i = 0; i < 4; i++) R4(g, ri(13), ri(15), 3, 1, '#8a93ab'); });
  T(B.LANTERN, function (g) {
    R4(g, 3, 2, 10, 13, '#3a3a42'); R4(g, 4, 3, 8, 11, '#ffe066'); R4(g, 5, 4, 6, 9, '#fff4b0'); R4(g, 6, 6, 4, 5, '#ffffff');
    R4(g, 3, 7, 10, 1, '#3a3a42'); R4(g, 7, 3, 2, 11, '#3a3a42');
    R4(g, 5, 0, 6, 2, '#55555c'); R4(g, 2, 14, 12, 2, '#55555c');
  });
  T(B.IRON_BLOCK, function (g) { metal(g, '#dcdce6', '#ffffff', '#9a9aa8'); });
  T(B.GOLD_BLOCK, function (g) { metal(g, '#ffd23a', '#fff6b0', '#c8900f'); });
  T(B.DIAMOND_BLOCK, function (g) { metal(g, '#5ff0e8', '#e8ffff', '#1fa8a4'); });
  T(B.COPPER_BLOCK, function (g) { metal(g, '#e8844a', '#ffc8a0', '#a8521f'); });
  T(B.SANDSTONE, function (g) {
    for (var y = 0; y < 16; y++) { var band = [0, 1, 5, 6, 11, 12].indexOf(y) >= 0; for (var x = 0; x < 16; x++) P(g, x, y, band ? pick(['#c8a85e', '#d0b066']) : pick(['#e2c47a', '#dcbe74', '#e8cc84'])); }
    R4(g, 0, 15, 16, 1, '#b8984e');
  });
  T(B.DEADBUSH, function (g) {
    var c = '#a07840';
    R4(g, 7, 9, 2, 7, c); R4(g, 4, 6, 1, 5, c); P(g, 5, 11, c); P(g, 6, 12, c); R4(g, 11, 5, 1, 5, c); P(g, 10, 10, c); P(g, 9, 11, c);
    P(g, 3, 5, c); P(g, 12, 4, c); R4(g, 8, 4, 1, 5, '#8a6434');
  });
  for (w = 0; w < 11; w++) (function (w) { T(B.WOOL + w, function (g) { wool(g, WOOL_COLS[w]); }); })(w);

  // Item-only icons
  function IT(id, fn) { var c = canvas(16); var g = c.getContext('2d'); seed = 5000 + id * 131; fn(g); TEX[id] = c; }
  IT(I.STICK, function (g) { for (var i = 0; i < 11; i++) { R4(g, 3 + i, 13 - i, 2, 2, '#8a5f38'); P(g, 3 + i, 13 - i, '#b88a58'); } });
  IT(I.COAL, function (g) { R4(g, 3, 4, 10, 9, '#2a2a2e'); R4(g, 4, 3, 7, 11, '#2a2a2e'); R4(g, 2, 6, 12, 5, '#2a2a2e'); R4(g, 5, 5, 3, 2, '#55555e'); P(g, 9, 9, '#44444c'); P(g, 5, 5, '#77777f'); });
  function ingot(g, c, hi, dark) {
    R4(g, 2, 6, 12, 6, c); R4(g, 4, 4, 10, 2, hi); R4(g, 2, 12, 12, 1, dark); R4(g, 13, 5, 1, 7, dark);
    R4(g, 4, 7, 6, 1, hi); P(g, 4, 4, '#fff');
  }
  IT(I.COPPER_INGOT, function (g) { ingot(g, '#e07a3c', '#ffb07a', '#a8521f'); });
  IT(I.IRON_INGOT, function (g) { ingot(g, '#d6d6e0', '#ffffff', '#8e8e9a'); });
  IT(I.GOLD_INGOT, function (g) { ingot(g, '#ffd23a', '#fff6b0', '#c8900f'); });
  IT(I.DIAMOND, function (g) {
    R4(g, 4, 3, 8, 2, '#8ff8f2'); R4(g, 2, 5, 12, 3, '#3fe6dc'); R4(g, 4, 8, 8, 2, '#2fc6c0'); R4(g, 6, 10, 4, 2, '#1fa8a4'); R4(g, 7, 12, 2, 1, '#1a8f8c');
    P(g, 5, 4, '#ffffff'); P(g, 4, 5, '#e8ffff'); R4(g, 7, 5, 1, 4, '#b8fffb');
  });
  IT(I.DYE, function (g) {
    var cols = ['#ff4a4a', '#ff9a1a', '#ffe03a', '#6fd24a', '#3b8fe8', '#9b4fe2'];
    R4(g, 5, 1, 6, 2, '#b8b8c4'); R4(g, 4, 3, 8, 12, '#ffffff'); R4(g, 3, 5, 10, 9, '#ffffff');
    for (var i = 0; i < 6; i++) R4(g, 4, 4 + i * 2 - (i === 0 ? 0 : 0), 8, 2, cols[i]);
    R4(g, 3, 6, 1, 7, cols[2]); R4(g, 12, 6, 1, 7, cols[3]); P(g, 5, 5, '#fff');
  });
  IT(I.DOOR, function (g) { g.drawImage(TEX[B.DOOR_T], 0, 0, 16, 16, 3, 0, 10, 8); g.drawImage(TEX[B.DOOR_B], 0, 0, 16, 16, 3, 8, 10, 8); });
  function pick_(g, head, hi, dark) {
    for (var i = 0; i < 10; i++) { R4(g, 3 + i, 13 - i, 2, 2, '#7a5230'); P(g, 3 + i, 13 - i, '#a87848'); }
    // head: arc from (1,4) to (12,15)? use a curved band
    var pts = [[2, 5], [3, 4], [4, 3], [5, 2], [6, 2], [7, 1], [8, 1], [9, 1], [10, 2], [11, 2], [12, 3], [13, 4], [13, 5], [14, 6], [14, 7], [14, 8], [15, 9]];
    pts.forEach(function (p, k) { R4(g, p[0], p[1], 2, 2, k % 5 === 0 ? dark : head); P(g, p[0], p[1], hi); });
    R4(g, 9, 4, 3, 3, dark);
  }
  IT(I.PICK_WOOD, function (g) { pick_(g, '#c8955a', '#e8b878', '#8f6334'); });
  IT(I.PICK_STONE, function (g) { pick_(g, '#9a9aa2', '#c8c8d0', '#6b6b73'); });
  IT(I.PICK_IRON, function (g) { pick_(g, '#e6e6ee', '#ffffff', '#9a9aa8'); });
  IT(I.PICK_DIAMOND, function (g) { pick_(g, '#4ef0e6', '#e8ffff', '#1fa8a4'); });
  BW.TEX = TEX;

  // Wall textures (1 dirt, 2 stone, 3 sandstone): darkened variants.
  BW.WALL_TEX = [null];
  [B.DIRT, B.STONE, B.SANDSTONE].forEach(function (src) {
    var c = canvas(16); var g = c.getContext('2d');
    g.drawImage(TEX[src], 0, 0);
    g.fillStyle = 'rgba(20,14,30,0.55)'; g.fillRect(0, 0, 16, 16);
    BW.WALL_TEX.push(c);
  });

  // Crack overlays (8 stages).
  BW.CRACKS = [];
  (function () {
    seed = 999;
    var segs = [];
    for (var s = 0; s < 6; s++) {
      var x = 8, y = 8, a = s * Math.PI / 3 + r() * 0.6;
      for (var k = 0; k < 9; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 1.2; y += Math.sin(a) * 1.2; segs.push([Math.round(x), Math.round(y), k]); }
    }
    for (var st = 0; st < 8; st++) {
      var c = canvas(16), g = c.getContext('2d');
      var lim = 1 + st;
      segs.forEach(function (p) { if (p[2] <= lim && p[0] >= 0 && p[0] < 16 && p[1] >= 0 && p[1] < 16) { P(g, p[0], p[1], 'rgba(20,10,5,0.85)'); if (st > 4 && p[2] % 2) P(g, p[0] + 1, p[1], 'rgba(20,10,5,0.5)'); } });
      BW.CRACKS.push(c);
    }
  })();

  // Icon data-URLs for the DOM inventory (32px, crisp).
  var iconCache = {};
  BW.iconURL = function (id) {
    if (iconCache[id]) return iconCache[id];
    var c = canvas(32), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (TEX[id]) g.drawImage(TEX[id], 0, 0, 32, 32);
    try { iconCache[id] = c.toDataURL(); } catch (e) { iconCache[id] = ''; }
    return iconCache[id];
  };
  BW.itemName = function (id) { if (id === FLOWER) return 'Any Flower'; var it = ITEMS[id]; return it ? it.name : '?'; };
  BW.maxStack = function (id) { var it = ITEMS[id]; return it && it.max ? it.max : 99; };
})();

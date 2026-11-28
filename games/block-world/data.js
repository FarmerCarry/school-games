/* Block World — TNT Mine Dash (عالم المكعبات)
 * Pure constants, tile definitions, upgrade tiers, and save schema.
 * Runs in both browser and Node unit tests (zero DOM, zero Kit calls). */
(function (root) {
  'use strict';

  var TS = 44; // Big chunky 44px voxel tiles (2x+ more readable on 1366x768 school PCs!)
  var W = 64;
  var H = 46;
  var SAVE_VERSION = 2;

  var T = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    COAL: 4,
    GOLD: 5,
    RUBY: 6,
    DIAMOND: 7,
    OBSIDIAN: 8,
    TNT_BARREL: 9,
    BRICK: 10,
    BEDROCK: 11,
    CRYSTAL_BLK: 12
  };

  // Block properties: hp (drill resistance), gems (drop value), solid, color palette.
  var BLOCKS = {};
  BLOCKS[T.AIR]         = { id: 0,  name: 'هواء',     solid: false, hp: 0,   gems: 0,  col: null };
  BLOCKS[T.GRASS]       = { id: 1,  name: 'عشب',      solid: true,  hp: 0.22, gems: 1,  col: '#8a5a36', top: '#4fd957', hi: '#82f57a', lo: '#6b4225' };
  BLOCKS[T.DIRT]        = { id: 2,  name: 'تراب',     solid: true,  hp: 0.20, gems: 1,  col: '#8a5a36', hi: '#a87248', lo: '#663e22' };
  BLOCKS[T.STONE]       = { id: 3,  name: 'صخر',      solid: true,  hp: 0.38, gems: 2,  col: '#58607a', hi: '#747ea0', lo: '#3d4358' };
  BLOCKS[T.COAL]        = { id: 4,  name: 'فحم',      solid: true,  hp: 0.34, gems: 5,  col: '#4a5168', hi: '#666f8c', lo: '#2f3445', ore: '#222633', shine: '#606b85' };
  BLOCKS[T.GOLD]        = { id: 5,  name: 'ذهب',      solid: true,  hp: 0.42, gems: 12, col: '#5a5f78', hi: '#747a99', lo: '#3f4359', ore: '#ffd238', shine: '#fff6a6' };
  BLOCKS[T.RUBY]        = { id: 6,  name: 'ياقوت',    solid: true,  hp: 0.50, gems: 22, col: '#4a476b', hi: '#635f8c', lo: '#312e4a', ore: '#ff3b73', shine: '#ffb8cd' };
  BLOCKS[T.DIAMOND]     = { id: 7,  name: 'ألماس',    solid: true,  hp: 0.56, gems: 35, col: '#3b4a6e', hi: '#526694', lo: '#25304a', ore: '#38f6ee', shine: '#d4ffff' };
  BLOCKS[T.OBSIDIAN]    = { id: 8,  name: 'بازلت',    solid: true,  hp: 0.85, gems: 18, col: '#312345', hi: '#4a3666', lo: '#1d142b', ore: '#a35cff', shine: '#dfc2ff' };
  BLOCKS[T.TNT_BARREL]  = { id: 9,  name: 'TNT',      solid: true,  hp: 0.14, gems: 4,  col: '#e63946', hi: '#ff6b78', lo: '#a61c28', tnt: true };
  BLOCKS[T.BRICK]       = { id: 10, name: 'طوب ذهبي', solid: true,  hp: 0.45, gems: 10, col: '#c9862c', hi: '#f0b14d', lo: '#8c5514' };
  BLOCKS[T.BEDROCK]     = { id: 11, name: 'قاع صلب',  solid: true,  hp: 999,  gems: 0,  col: '#1d1c2e', hi: '#2e2c45', lo: '#11101c', unbreakable: true };
  BLOCKS[T.CRYSTAL_BLK] = { id: 12, name: 'كريستال',  solid: true,  hp: 0.32, gems: 15, col: '#28c4d9', hi: '#78f5ff', lo: '#158399' };

  var RELICS = [
    { id: 0, name: 'التاج الذهبي',   col: '#ffd633', glow: '#fff4a3', icon: '👑', value: 120 },
    { id: 1, name: 'جوهرة الكريستال', col: '#38f6ee', glow: '#c8ffff', icon: '💎', value: 160 },
    { id: 2, name: 'نجمة البركان',   col: '#ff5286', glow: '#ffc2d6', icon: '🌟', value: 220 }
  ];

  // 4 tactile upgrades shown directly on Result Card (skybound-golf DNA!).
  var UPGRADES = [
    { id: 'tnt',     name: 'قنبلة عملاقة', icon: '💣', desc: 'حفرة أكبر + TNT أسرع', max: 4, costs: [0, 80, 200, 420] },
    { id: 'drill',   name: 'حفار خارق',    icon: '⛏️', desc: 'حفر أسرع بمرتين',      max: 4, costs: [0, 70, 180, 380] },
    { id: 'magnet',  name: 'مغناطيس الكنز', icon: '🧲', desc: 'جذب أوسع + جواهر أكثر', max: 4, costs: [0, 65, 170, 360] },
    { id: 'jetpack', name: 'نفاثة صاروخية', icon: '🚀', desc: 'طيران أقوى وأسرع',      max: 4, costs: [0, 75, 190, 400] }
  ];

  // Free Sandbox quick-place palette (4 fun blocks, zero 36-slot backpack!)
  var SANDBOX_PALETTE = [
    { id: T.DIRT, name: 'تراب' },
    { id: T.BRICK, name: 'طوب ذهبي' },
    { id: T.CRYSTAL_BLK, name: 'كريستال' },
    { id: T.TNT_BARREL, name: 'TNT' }
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function freshSave() {
    return {
      v: SAVE_VERSION,
      gems: 0,
      bestScore: 0,
      bestTime: 0,
      wins: 0,
      totalStars: 0,
      runs: 0,
      freeMode: false,
      upgrades: { tnt: 1, drill: 1, magnet: 1, jetpack: 1 }
    };
  }

  function loadSave(raw) {
    var base = freshSave();
    if (!raw || typeof raw !== 'object') return base;
    // Gracefully carry over stars from legacy v1 meta if present, otherwise load v2!
    if (raw.v !== SAVE_VERSION) {
      if (typeof raw.totalStars === 'number' && isFinite(raw.totalStars) && raw.totalStars > 0) {
        base.totalStars = Math.min(999, Math.max(0, raw.totalStars | 0));
      }
      return base;
    }
    base.gems = Math.max(0, raw.gems | 0);
    base.bestScore = Math.max(0, raw.bestScore | 0);
    base.bestTime = Math.max(0, Number(raw.bestTime) || 0);
    base.wins = Math.max(0, raw.wins | 0);
    base.totalStars = Math.max(0, raw.totalStars | 0);
    base.runs = Math.max(0, raw.runs | 0);
    base.freeMode = !!raw.freeMode;
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      for (var i = 0; i < UPGRADES.length; i++) {
        var u = UPGRADES[i];
        base.upgrades[u.id] = clamp((raw.upgrades[u.id] | 0) || 1, 1, u.max);
      }
    }
    return base;
  }

  function upgradeCost(save, id) {
    var def = null;
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) { def = UPGRADES[i]; break; }
    if (!def) return Infinity;
    var lv = clamp((save.upgrades[id] | 0) || 1, 1, def.max);
    return lv >= def.max ? Infinity : def.costs[lv];
  }

  function buyUpgrade(save, id) {
    var cost = upgradeCost(save, id);
    if (!isFinite(cost) || save.gems < cost) return false;
    save.gems -= cost;
    save.upgrades[id] = ((save.upgrades[id] | 0) || 1) + 1;
    return true;
  }

  function statsForUpgrades(up) {
    up = up || { tnt: 1, drill: 1, magnet: 1, jetpack: 1 };
    var tLv = clamp(up.tnt || 1, 1, 4);
    var dLv = clamp(up.drill || 1, 1, 4);
    var mLv = clamp(up.magnet || 1, 1, 4);
    var jLv = clamp(up.jetpack || 1, 1, 4);
    return {
      tntRadius: tLv === 1 ? 1.65 : tLv === 2 ? 2.15 : tLv === 3 ? 2.65 : 3.2, // 3x3 -> 4x4 -> 5x5 -> 6x6!
      tntMax: 2 + tLv,
      tntReload: Math.max(1.0, 2.25 - (tLv - 1) * 0.38),
      drillPower: 1.0 + (dLv - 1) * 0.65,
      magnetRadius: 2.6 + (mLv - 1) * 1.35,
      gemBonus: 1 + (mLv - 1) * 0.25,
      moveSpeed: 6.4 + (jLv - 1) * 0.85,
      jetAccel: 26.0 + (jLv - 1) * 4.5,
      jetFuelMax: 1.85 + (jLv - 1) * 0.65
    };
  }

  function computeStars(won, timeLeft, gemsRun, score) {
    if (!won) return 0;
    if ((timeLeft >= 30 && gemsRun >= 260) || score >= 850) return 3;
    if (timeLeft >= 16 || gemsRun >= 160 || score >= 520) return 2;
    return 1;
  }

  root.BW = {
    TS: TS,
    W: W,
    H: H,
    SAVE_VERSION: SAVE_VERSION,
    T: T,
    BLOCKS: BLOCKS,
    RELICS: RELICS,
    UPGRADES: UPGRADES,
    SANDBOX_PALETTE: SANDBOX_PALETTE,
    clamp: clamp,
    freshSave: freshSave,
    loadSave: loadSave,
    upgradeCost: upgradeCost,
    buyUpgrade: buyUpgrade,
    statsForUpgrades: statsForUpgrades,
    computeStars: computeStars
  };
})(typeof window !== 'undefined' ? window : globalThis);

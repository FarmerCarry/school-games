/* Magic Crayon 3D (القلم السحري) — Pure deterministic 2D rigid-body physics,
 * 21 handcrafted levels across 3 themed worlds with verified reference solutions,
 * truck skins, and v3 save helpers.
 * Zero DOM, zero Kit, zero Math.random(). UMD export for browser & Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MagicCrayon = factory();
}(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  var WORLD_W = 24;
  var WORLD_H = 13.5;
  var BASE_GRAVITY = -22;
  var SUBSTEPS = 4;

  // Crayon types
  var CRAYON_BRIDGE = 0;
  var CRAYON_BOOST = 1;
  var CRAYON_BOUNCE = 2;

  var CRAYONS = [
    { id: 0, key: '1', name: 'جسر', color: '#22b8ff', hex: 0x22b8ff, accent: 0x9ce4ff },
    { id: 1, key: '2', name: 'تيربو', color: '#ff7b1a', hex: 0xff7b1a, accent: 0xffe047 },
    { id: 2, key: '3', name: 'نابض', color: '#2de380', hex: 0x2de380, accent: 0xd9ff70 }
  ];

  // Monster truck constants
  var WHEEL_X = 0.62;
  var WHEEL_Y = -0.34;
  var WHEEL_R = 0.44;
  var ROOF_Y = 0.28;
  var ROOF_R = 0.42;
  var STROKE_R = 0.16;
  var MIN_SEG_LEN = 0.28;
  var TRUCK_MASS = 1.0;
  var TRUCK_INERTIA = 0.42;

  var WORLDS = [
    { id: 0, name: 'مكتب الكراسة', en: 'Notebook Desk', theme: 'desk', color: '#2fb6ec', gravityMul: 1.0 },
    { id: 1, name: 'غرفة المكعبات', en: 'Playroom Blocks', theme: 'playroom', color: '#ff6b9d', gravityMul: 1.0 },
    { id: 2, name: 'ملصق الفضاء', en: 'Space Poster', theme: 'space', color: '#7b5cff', gravityMul: 0.72 }
  ];

  var SKINS = [
    { id: 0, name: 'البركان الأحمر', body: 0xff3b4e, trim: 0xffd23f, rim: 0xffd23f, cab: 0xff5c6c, accessory: 'antenna', needStars: 0 },
    { id: 1, name: 'القرش الأزرق', body: 0x1e96fc, trim: 0xffffff, rim: 0x7ae7ff, cab: 0x3db2ff, accessory: 'fin', needStars: 3 },
    { id: 2, name: 'النمر الذهبي', body: 0xffb703, trim: 0xff5400, rim: 0xfff3b0, cab: 0xffca3a, accessory: 'lights', needStars: 8 },
    { id: 3, name: 'التنين الأخضر', body: 0x38d353, trim: 0xffe14d, rim: 0x9ef01a, cab: 0x57e36b, accessory: 'spikes', needStars: 15 },
    { id: 4, name: 'الحلوى الوردية', body: 0xff5ca8, trim: 0x48f0e7, rim: 0xffe66d, cab: 0xff85c0, accessory: 'star', needStars: 24 },
    { id: 5, name: 'صاروخ المجرّة', body: 0x7b4dff, trim: 0x2df5ff, rim: 0xff6ad5, cab: 0x9970ff, accessory: 'rocket', needStars: 36 }
  ];

  /* ---------------------------------------------------------------- helpers */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist2(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
  function dist(x1, y1, x2, y2) { return Math.sqrt(dist2(x1, y1, x2, y2)); }

  function strokeLength(pts) {
    var total = 0;
    for (var i = 1; i < pts.length; i++) {
      total += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    }
    return total;
  }

  /* --------------------------------------------------------------- 21 levels
   * Every level sits cleanly in x ∈ [0..24], y ∈ [0..13.5] (+y is UP).
   * Platforms: { x, y, w, h, color? } where (x, y) is bottom-left.
   * Hazards:   { x, y, w, h } — cartoon danger pads/lava blocks.
   * Bumpers:   { x, y, r } — springy star bumpers.
   * Crates:    { x, y } — 0.72x0.72 smashable wooden toy boxes (center x, bottom y).
   * Stars:     [[x, y], [x, y], [x, y]] — 3 golden stars per level.
   * Solution:  [{ type, pts: [[x, y], ...] }, ...] — verified by Node unit tests! */
  var LEVELS = [
    /* ===================== WORLD 1: مكتب الكراسة (Notebook Desk) ===================== */
    {
      id: '1-1', world: 0, stage: 1, name: 'الجسر الأول',
      recCrayon: 0, inkBudget: 12,
      start: [2.5, 5.8], goal: [20.8, 5.0],
      platforms: [
        { x: 0.6, y: 0, w: 6.6, h: 5.0, style: 'book' },
        { x: 14.8, y: 0, w: 8.6, h: 5.0, style: 'book' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 17.6, y: 5.0 }],
      stars: [[9.0, 5.9], [11.2, 5.9], [13.4, 5.9]],
      solution: [
        { type: 0, pts: [[6.8, 4.95], [10.8, 4.95], [15.2, 4.95]] }
      ]
    },
    {
      id: '1-2', world: 0, stage: 2, name: 'تلّة المسطرة',
      recCrayon: 0, inkBudget: 14,
      start: [2.4, 4.2], goal: [21.0, 6.8],
      platforms: [
        { x: 0.5, y: 0, w: 6.5, h: 3.4, style: 'ruler' },
        { x: 15.6, y: 0, w: 7.9, h: 6.8, style: 'book' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 18.2, y: 6.8 }],
      stars: [[9.0, 5.2], [11.6, 6.1], [14.2, 7.1]],
      solution: [
        { type: 0, pts: [[6.6, 3.35], [11.2, 5.1], [16.0, 6.8]] }
      ]
    },
    {
      id: '1-3', world: 0, stage: 3, name: 'جسور الممحاة',
      recCrayon: 0, inkBudget: 14,
      start: [2.2, 6.8], goal: [21.2, 4.8],
      platforms: [
        { x: 0.4, y: 0, w: 4.8, h: 6.0, style: 'book' },
        { x: 10.2, y: 0, w: 3.6, h: 5.4, style: 'eraser' },
        { x: 18.4, y: 0, w: 5.2, h: 4.8, style: 'book' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 12.0, y: 5.4 }],
      stars: [[7.6, 6.7], [12.0, 6.6], [16.0, 6.0]],
      solution: [
        { type: 0, pts: [[4.9, 5.95], [7.6, 5.75], [10.4, 5.4]] },
        { type: 0, pts: [[13.6, 5.35], [16.0, 5.1], [18.7, 4.8]] }
      ]
    },
    {
      id: '1-4', world: 0, stage: 4, name: 'انطلاقة التيربو!',
      recCrayon: 1, inkBudget: 14,
      start: [2.2, 5.2], goal: [21.2, 4.8],
      platforms: [
        { x: 0.4, y: 0, w: 7.4, h: 4.4, style: 'book' },
        { x: 16.6, y: 0, w: 7.0, h: 4.8, style: 'ruler' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 18.8, y: 4.8 }],
      stars: [[10.5, 6.9], [12.8, 7.2], [15.0, 6.7]],
      solution: [
        { type: 1, pts: [[4.6, 4.45], [7.8, 4.6], [10.4, 5.8]] }
      ]
    },
    {
      id: '1-5', world: 0, stage: 5, name: 'جدار الممحاة',
      recCrayon: 1, inkBudget: 15,
      start: [2.2, 4.2], goal: [21.2, 4.2],
      platforms: [
        { x: 0.4, y: 0, w: 8.2, h: 3.4, style: 'book' },
        { x: 11.4, y: 0, w: 2.0, h: 6.4, style: 'eraser' },
        { x: 16.0, y: 0, w: 7.6, h: 4.2, style: 'book' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 18.4, y: 4.2 }],
      stars: [[10.0, 7.6], [12.4, 8.2], [14.8, 7.4]],
      solution: [
        { type: 1, pts: [[4.8, 3.45], [8.0, 4.6], [10.4, 6.2]] }
      ]
    },
    {
      id: '1-6', world: 0, stage: 6, name: 'قلم النابض!',
      recCrayon: 2, inkBudget: 14,
      start: [2.2, 4.0], goal: [20.6, 7.4],
      platforms: [
        { x: 0.4, y: 0, w: 10.2, h: 3.2, style: 'ruler' },
        { x: 13.3, y: 0, w: 10.3, h: 7.4, style: 'book' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 16.8, y: 7.4 }],
      stars: [[10.0, 7.2], [11.8, 8.6], [14.8, 8.5]],
      solution: [
        { type: 2, pts: [[8.8, 3.35], [11.0, 3.35]] }
      ]
    },
    {
      id: '1-7', world: 0, stage: 7, name: 'بطولة المكتب',
      recCrayon: 0, inkBudget: 20,
      start: [2.0, 4.4], goal: [21.4, 7.4],
      platforms: [
        { x: 0.4, y: 0, w: 4.8, h: 3.6, style: 'book' },
        { x: 9.6, y: 0, w: 4.8, h: 3.6, style: 'ruler' },
        { x: 17.4, y: 0, w: 6.2, h: 7.4, style: 'book' }
      ],
      hazards: [{ x: 5.4, y: 0, w: 4.0, h: 1.2 }],
      bumpers: [],
      crates: [{ x: 19.2, y: 7.4 }],
      stars: [[7.4, 4.7], [14.8, 8.2], [17.0, 8.8]],
      solution: [
        { type: 0, pts: [[4.9, 3.6], [7.4, 3.6], [9.9, 3.6]] },
        { type: 2, pts: [[12.6, 3.75], [14.8, 3.75]] }
      ]
    },

    /* ===================== WORLD 2: غرفة المكعبات (Playroom Blocks) ===================== */
    {
      id: '2-1', world: 1, stage: 1, name: 'قوس المكعبات',
      recCrayon: 0, inkBudget: 14,
      start: [2.2, 5.2], goal: [21.2, 4.4],
      platforms: [
        { x: 0.4, y: 0, w: 5.6, h: 4.4, style: 'blockA' },
        { x: 8.6, y: 7.6, w: 5.4, h: 5.9, style: 'blockB' },
        { x: 16.0, y: 0, w: 7.6, h: 4.4, style: 'blockC' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 18.4, y: 4.4 }],
      stars: [[8.8, 5.4], [11.4, 5.4], [14.0, 5.4]],
      solution: [
        { type: 0, pts: [[5.7, 4.4], [11.0, 4.4], [16.3, 4.4]] }
      ]
    },
    {
      id: '2-2', world: 1, stage: 2, name: 'برج النوابض',
      recCrayon: 2, inkBudget: 16,
      start: [2.0, 3.2], goal: [21.0, 8.8],
      platforms: [
        { x: 0.4, y: 0, w: 6.4, h: 2.4, style: 'blockA' },
        { x: 9.2, y: 0, w: 5.2, h: 5.6, style: 'blockB' },
        { x: 16.8, y: 0, w: 6.8, h: 8.8, style: 'blockC' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 18.8, y: 8.8 }],
      stars: [[7.8, 7.2], [11.4, 6.8], [15.4, 10.6]],
      solution: [
        { type: 2, pts: [[4.4, 2.55], [7.0, 2.55]] },
        { type: 2, pts: [[12.4, 5.75], [14.8, 5.75]] }
      ]
    },
    {
      id: '2-3', world: 1, stage: 3, name: 'حفرة الحمم اللعبة',
      recCrayon: 1, inkBudget: 15,
      start: [2.2, 4.6], goal: [21.2, 4.4],
      platforms: [
        { x: 0.4, y: 0, w: 6.6, h: 3.8, style: 'blockC' },
        { x: 16.4, y: 0, w: 7.2, h: 4.4, style: 'blockA' }
      ],
      hazards: [{ x: 7.0, y: 0, w: 9.4, h: 1.5 }],
      bumpers: [],
      crates: [{ x: 18.6, y: 4.4 }],
      stars: [[10.0, 6.7], [12.4, 7.1], [14.8, 6.5]],
      solution: [
        { type: 1, pts: [[4.2, 3.85], [7.0, 4.2], [9.8, 5.6]] }
      ]
    },
    {
      id: '2-4', world: 1, stage: 4, name: 'وادي الأفعوانية',
      recCrayon: 1, inkBudget: 18,
      start: [2.2, 9.0], goal: [21.2, 7.0],
      platforms: [
        { x: 0.4, y: 0, w: 4.4, h: 8.2, style: 'blockB' },
        { x: 17.6, y: 0, w: 6.0, h: 7.0, style: 'blockA' }
      ],
      hazards: [{ x: 4.8, y: 0, w: 12.8, h: 1.2 }],
      bumpers: [],
      crates: [{ x: 19.2, y: 7.0 }],
      stars: [[8.2, 5.8], [11.6, 5.0], [15.4, 6.8]],
      solution: [
        { type: 0, pts: [[4.5, 8.15], [7.4, 5.4], [10.4, 4.2]] },
        { type: 1, pts: [[10.0, 4.2], [13.8, 5.0], [18.0, 7.0]] }
      ]
    },
    {
      id: '2-5', world: 1, stage: 5, name: 'المرتدّ العجيب',
      recCrayon: 0, inkBudget: 16,
      start: [2.2, 5.4], goal: [21.2, 6.2],
      platforms: [
        { x: 0.4, y: 0, w: 5.8, h: 4.6, style: 'blockA' },
        { x: 17.2, y: 0, w: 6.4, h: 6.2, style: 'blockC' }
      ],
      hazards: [{ x: 6.2, y: 0, w: 11.0, h: 1.2 }],
      bumpers: [{ x: 11.4, y: 3.8, r: 0.9 }],
      crates: [{ x: 19.2, y: 6.2 }],
      stars: [[8.8, 5.4], [11.6, 6.8], [15.0, 7.8]],
      solution: [
        { type: 0, pts: [[5.8, 4.6], [8.8, 4.5], [10.6, 4.3]] }
      ]
    },
    {
      id: '2-6', world: 1, stage: 6, name: 'النفق السريع',
      recCrayon: 1, inkBudget: 17,
      start: [2.0, 4.2], goal: [21.2, 7.6],
      platforms: [
        { x: 0.4, y: 0, w: 13.8, h: 3.4, style: 'blockB' },
        { x: 5.2, y: 6.4, w: 6.4, h: 7.1, style: 'blockC' },
        { x: 17.6, y: 0, w: 6.0, h: 7.6, style: 'blockA' }
      ],
      hazards: [{ x: 14.2, y: 0, w: 3.4, h: 1.3 }],
      bumpers: [],
      crates: [{ x: 19.2, y: 7.6 }],
      stars: [[8.8, 4.5], [14.8, 7.6], [16.8, 8.8]],
      solution: [
        { type: 1, pts: [[5.4, 3.52], [11.4, 3.52]] },
        { type: 2, pts: [[12.2, 3.55], [14.4, 3.55]] }
      ]
    },
    {
      id: '2-7', world: 1, stage: 7, name: 'استعراض المكعبات',
      recCrayon: 1, inkBudget: 22,
      start: [1.8, 4.6], goal: [21.4, 7.4],
      platforms: [
        { x: 0.4, y: 0, w: 4.4, h: 3.8, style: 'blockA' },
        { x: 9.2, y: 0, w: 4.2, h: 4.2, style: 'blockB' },
        { x: 10.2, y: 7.4, w: 3.0, h: 6.1, style: 'blockC' },
        { x: 17.8, y: 0, w: 5.8, h: 7.4, style: 'blockA' }
      ],
      hazards: [
        { x: 4.8, y: 0, w: 4.4, h: 1.3 },
        { x: 13.4, y: 0, w: 4.4, h: 1.3 }
      ],
      bumpers: [],
      crates: [{ x: 19.4, y: 7.4 }],
      stars: [[7.0, 4.9], [11.4, 5.2], [16.2, 9.2]],
      solution: [
        { type: 0, pts: [[4.5, 3.8], [7.0, 4.0], [9.5, 4.2]] },
        { type: 2, pts: [[12.4, 4.35], [14.8, 4.35]] }
      ]
    },

    /* ===================== WORLD 3: ملصق الفضاء (Space Poster — Low Gravity!) ===================== */
    {
      id: '3-1', world: 2, stage: 1, name: 'قفزة القمر',
      recCrayon: 1, inkBudget: 14,
      start: [2.2, 5.2], goal: [21.0, 5.6],
      platforms: [
        { x: 0.4, y: 0, w: 6.4, h: 4.4, style: 'moon' },
        { x: 15.8, y: 0, w: 7.8, h: 5.6, style: 'moon' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 18.2, y: 5.6 }],
      stars: [[9.6, 6.8], [12.0, 7.2], [14.4, 7.0]],
      solution: [
        { type: 1, pts: [[4.8, 4.45], [7.4, 5.2], [9.4, 6.1]] }
      ]
    },
    {
      id: '3-2', world: 2, stage: 2, name: 'نيازك السماء',
      recCrayon: 0, inkBudget: 16,
      start: [2.0, 6.0], goal: [21.2, 6.2],
      platforms: [
        { x: 0.4, y: 3.4, w: 4.6, h: 1.8, style: 'ship' },
        { x: 9.8, y: 4.0, w: 3.8, h: 1.6, style: 'moon' },
        { x: 18.0, y: 4.4, w: 5.6, h: 1.8, style: 'ship' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 11.6, y: 5.6 }],
      stars: [[7.4, 6.4], [11.6, 6.7], [15.8, 6.9]],
      solution: [
        { type: 0, pts: [[4.7, 5.15], [7.4, 5.4], [10.1, 5.55]] },
        { type: 0, pts: [[13.3, 5.55], [15.8, 5.9], [18.3, 6.15]] }
      ]
    },
    {
      id: '3-3', world: 2, stage: 3, name: 'مذنب التيربو',
      recCrayon: 1, inkBudget: 16,
      start: [2.0, 4.8], goal: [21.2, 5.2],
      platforms: [
        { x: 0.4, y: 0, w: 6.2, h: 4.0, style: 'ship' },
        { x: 17.8, y: 0, w: 5.8, h: 5.2, style: 'moon' }
      ],
      hazards: [{ x: 6.6, y: 0, w: 11.2, h: 1.3 }],
      bumpers: [],
      crates: [{ x: 19.4, y: 5.2 }],
      stars: [[10.6, 8.2], [13.2, 8.8], [15.8, 8.0]],
      solution: [
        { type: 1, pts: [[3.8, 4.05], [6.8, 4.9], [9.4, 6.6]] }
      ]
    },
    {
      id: '3-4', world: 2, stage: 4, name: 'فوّهة القمر',
      recCrayon: 2, inkBudget: 16,
      start: [2.0, 8.2], goal: [21.0, 8.4],
      platforms: [
        { x: 0.4, y: 0, w: 4.8, h: 7.4, style: 'moon' },
        { x: 6.6, y: 0, w: 8.6, h: 2.8, style: 'moon' },
        { x: 17.2, y: 0, w: 6.4, h: 8.4, style: 'ship' }
      ],
      hazards: [], bumpers: [],
      crates: [{ x: 19.0, y: 8.4 }],
      stars: [[7.9, 7.1], [12.6, 8.1], [15.5, 10.1]],
      solution: [
        { type: 0, pts: [[4.9, 7.35], [7.2, 4.2], [9.8, 2.85]] },
        { type: 2, pts: [[11.0, 2.95], [14.4, 2.95]] }
      ]
    },
    {
      id: '3-5', world: 2, stage: 5, name: 'القمر الصناعي',
      recCrayon: 2, inkBudget: 18,
      start: [2.0, 4.6], goal: [21.2, 6.6],
      platforms: [
        { x: 0.4, y: 0, w: 10.6, h: 3.8, style: 'ship' },
        { x: 4.8, y: 6.8, w: 5.0, h: 6.7, style: 'ship' },
        { x: 13.4, y: 0, w: 1.6, h: 5.2, style: 'moon' },
        { x: 17.4, y: 0, w: 6.2, h: 6.6, style: 'moon' }
      ],
      hazards: [{ x: 13.5, y: 5.2, w: 1.4, h: 0.9 }],
      bumpers: [],
      crates: [{ x: 19.4, y: 6.6 }],
      stars: [[7.2, 4.8], [14.4, 10.6], [16.8, 10.4]],
      solution: [
        { type: 2, pts: [[9.4, 3.95], [11.8, 3.95]] }
      ]
    },
    {
      id: '3-6', world: 2, stage: 6, name: 'المدار المزدوج',
      recCrayon: 2, inkBudget: 18,
      start: [1.8, 3.8], goal: [21.2, 8.8],
      platforms: [
        { x: 0.4, y: 1.4, w: 4.6, h: 1.6, style: 'ship' },
        { x: 9.0, y: 4.4, w: 4.8, h: 1.6, style: 'moon' },
        { x: 17.4, y: 7.2, w: 6.2, h: 1.6, style: 'ship' }
      ],
      hazards: [{ x: 4.8, y: 0, w: 13.0, h: 1.1 }],
      bumpers: [],
      crates: [{ x: 19.2, y: 8.8 }],
      stars: [[6.8, 9.8], [11.4, 7.6], [15.4, 11.4]],
      solution: [
        { type: 2, pts: [[3.2, 3.15], [5.6, 3.15]] },
        { type: 2, pts: [[11.4, 6.15], [14.0, 6.15]] }
      ]
    },
    {
      id: '3-7', world: 2, stage: 7, name: 'بطل المجرّة!',
      recCrayon: 1, inkBudget: 24,
      start: [1.8, 5.2], goal: [21.4, 8.0],
      platforms: [
        { x: 0.4, y: 2.8, w: 4.2, h: 1.6, style: 'ship' },
        { x: 9.6, y: 4.2, w: 5.0, h: 1.6, style: 'moon' },
        { x: 18.2, y: 6.4, w: 5.4, h: 1.6, style: 'ship' }
      ],
      hazards: [
        { x: 4.8, y: 0, w: 13.4, h: 1.2 },
        { x: 15.6, y: 1.2, w: 1.3, h: 3.4 }
      ],
      bumpers: [{ x: 7.0, y: 2.6, r: 0.8 }],
      crates: [{ x: 11.4, y: 5.8 }, { x: 19.6, y: 8.0 }],
      stars: [[7.2, 5.8], [11.4, 6.8], [16.4, 12.2]],
      solution: [
        { type: 0, pts: [[4.3, 4.35], [6.8, 4.9], [9.9, 5.75]] },
        { type: 2, pts: [[12.6, 5.95], [14.8, 5.95]] }
      ]
    }
  ];

  /* --------------------------------------------------------------- save v3 */
  function defaultSave() {
    var stars = [];
    for (var i = 0; i < LEVELS.length; i++) stars.push(0);
    return { v: 3, stars: stars, skin: 0, coins: 0, bestLevel: 0 };
  }

  function loadSave(raw) {
    var base = defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== 3) return base;
    if (Array.isArray(raw.stars)) {
      for (var i = 0; i < base.stars.length; i++) {
        var s = raw.stars[i] | 0;
        base.stars[i] = clamp(s, 0, 3);
      }
    }
    base.skin = clamp(raw.skin | 0, 0, SKINS.length - 1);
    base.coins = Math.max(0, raw.coins | 0);
    base.bestLevel = clamp(raw.bestLevel | 0, 0, LEVELS.length - 1);
    if (!isSkinUnlocked(base, base.skin)) base.skin = 0;
    return base;
  }

  function totalStars(save) {
    var sum = 0;
    for (var i = 0; i < save.stars.length; i++) sum += save.stars[i] | 0;
    return sum;
  }

  function isSkinUnlocked(save, skinIdx) {
    var sk = SKINS[skinIdx];
    return !!sk && totalStars(save) >= sk.needStars;
  }

  function isLevelOpen(save, levelIdx) {
    if (levelIdx <= 0) return true;
    if (levelIdx >= LEVELS.length) return false;
    // Sequential unlock: previous level cleared, OR world start unlocked by total stars
    if ((save.stars[levelIdx - 1] | 0) > 0) return true;
    var lv = LEVELS[levelIdx];
    if (lv.stage === 1 && lv.world === 1 && totalStars(save) >= 5) return true;
    if (lv.stage === 1 && lv.world === 2 && totalStars(save) >= 12) return true;
    return false;
  }

  function nextUnfinishedLevel(save) {
    for (var i = 0; i < LEVELS.length; i++) {
      if ((save.stars[i] | 0) === 0 && isLevelOpen(save, i)) return i;
    }
    return 0;
  }

  /* ------------------------------------------------------------- simulation */
  function makeTruck(start) {
    return {
      x: start[0],
      y: start[1],
      vx: 0,
      vy: 0,
      angle: 0,
      angVel: 0,
      wheelSpin: 0,
      rearComp: 0,
      frontComp: 0,
      grounded: false,
      coyote: 0,
      boostTimer: 0,
      bounceCd: 0,
      boostSfxCd: 0,
      bumperCd: 0,
      stallTimer: 0,
      antennaAngle: 0,
      antennaVel: 0
    };
  }

  function createWorld(levelIdx, opts) {
    opts = opts || {};
    var idx = clamp(levelIdx | 0, 0, LEVELS.length - 1);
    var lv = LEVELS[idx];
    var theme = WORLDS[lv.world];
    var inkMul = typeof opts.inkMul === 'number' && opts.inkMul > 0 ? opts.inkMul : 1.0;
    var gravityScale = typeof opts.gravityScale === 'number' && opts.gravityScale > 0 ? opts.gravityScale : 1.0;
    var tractionBonus = typeof opts.tractionBonus === 'number' && opts.tractionBonus > 0 ? opts.tractionBonus : 1.0;

    var stars = lv.stars.map(function (s, i) {
      return { id: i, x: s[0], y: s[1], collected: false };
    });
    var crates = (lv.crates || []).map(function (c, i) {
      return { id: i, x: c.x, y: c.y, w: 0.72, h: 0.72, smashed: false };
    });

    return {
      levelIdx: idx,
      level: lv,
      worldIdx: lv.world,
      id: lv.id,
      gravity: BASE_GRAVITY * theme.gravityMul * gravityScale,
      tractionBonus: tractionBonus,
      inkBudget: Math.round(lv.inkBudget * inkMul * 10) / 10,
      inkUsed: 0,
      crayonType: lv.recCrayon || 0,
      strokes: [],
      activeStroke: null,
      truck: makeTruck(lv.start),
      stars: stars,
      starsCollected: 0,
      crates: crates,
      cratesSmashed: 0,
      rolling: false,
      won: false,
      crashed: false,
      crashTimer: 0,
      crashes: 0,
      time: 0,
      runTime: 0,
      strokesDrawn: 0,
      events: []
    };
  }

  function resetTruck(world, keepStrokes) {
    world.truck = makeTruck(world.level.start);
    world.rolling = false;
    world.won = false;
    world.crashed = false;
    world.crashTimer = 0;
    world.runTime = 0;
    world.starsCollected = 0;
    for (var i = 0; i < world.stars.length; i++) world.stars[i].collected = false;
    world.cratesSmashed = 0;
    for (var j = 0; j < world.crates.length; j++) world.crates[j].smashed = false;
    if (!keepStrokes) {
      world.strokes = [];
      world.activeStroke = null;
      world.inkUsed = 0;
      world.strokesDrawn = 0;
    }
    world.events.push({ type: 'reset' });
  }

  function setCrayon(world, type) {
    var t = clamp(type | 0, 0, CRAYONS.length - 1);
    world.crayonType = t;
    return t;
  }

  function clampPoint(x, y) {
    return [clamp(x, 0.2, WORLD_W - 0.2), clamp(y, 0.2, WORLD_H - 0.2)];
  }

  function insideTruckBody(world, x, y) {
    var t = world.truck;
    return dist2(x, y, t.x, t.y + 0.05) < 0.42 * 0.42;
  }

  function beginStroke(world, type, x, y) {
    if (world.won || world.crashed) return false;
    var rem = world.inkBudget - world.inkUsed;
    if (rem <= 0.15) return false;
    var p = clampPoint(x, y);
    if (insideTruckBody(world, p[0], p[1])) return false;
    var ct = type == null ? world.crayonType : clamp(type | 0, 0, CRAYONS.length - 1);
    world.activeStroke = {
      id: ++world.strokesDrawn,
      type: ct,
      pts: [p],
      len: 0
    };
    return true;
  }

  function extendStroke(world, x, y) {
    var st = world.activeStroke;
    if (!st) return false;
    var p = clampPoint(x, y);
    var last = st.pts[st.pts.length - 1];
    var d = dist(last[0], last[1], p[0], p[1]);
    if (d < MIN_SEG_LEN) return false;

    var rem = world.inkBudget - world.inkUsed;
    if (rem <= 0.05) return false;

    // Subdivide long fast mouse drags into even smooth segments
    var step = 0.48;
    var steps = Math.max(1, Math.ceil(d / step));
    var added = false;
    for (var s = 1; s <= steps; s++) {
      rem = world.inkBudget - world.inkUsed;
      if (rem <= 0.05) break;
      var frac = s / steps;
      var nx = last[0] + (p[0] - last[0]) * frac;
      var ny = last[1] + (p[1] - last[1]) * frac;
      if (insideTruckBody(world, nx, ny)) break;
      var prev = st.pts[st.pts.length - 1];
      var seg = dist(prev[0], prev[1], nx, ny);
      if (seg < 0.12) continue;
      if (seg > rem) {
        var r = rem / seg;
        nx = prev[0] + (nx - prev[0]) * r;
        ny = prev[1] + (ny - prev[1]) * r;
        seg = rem;
      }
      st.pts.push([nx, ny]);
      st.len += seg;
      world.inkUsed = Math.min(world.inkBudget, world.inkUsed + seg);
      added = true;
    }
    return added;
  }

  function endStroke(world) {
    var st = world.activeStroke;
    world.activeStroke = null;
    if (!st) return null;
    if (st.pts.length < 2 || st.len < 0.22) {
      // Refund negligible accidental tap
      world.inkUsed = Math.max(0, world.inkUsed - st.len);
      return null;
    }
    world.strokes.push(st);
    world.events.push({ type: 'stroke', crayon: st.type, len: st.len });
    return st;
  }

  function addStroke(world, type, pts) {
    if (!pts || pts.length < 2) return null;
    if (!beginStroke(world, type, pts[0][0], pts[0][1])) return null;
    for (var i = 1; i < pts.length; i++) extendStroke(world, pts[i][0], pts[i][1]);
    return endStroke(world);
  }

  function undoStroke(world) {
    if (world.activeStroke) {
      world.inkUsed = Math.max(0, world.inkUsed - world.activeStroke.len);
      world.activeStroke = null;
      return true;
    }
    if (!world.strokes.length) return false;
    var removed = world.strokes.pop();
    world.inkUsed = Math.max(0, world.inkUsed - removed.len);
    world.events.push({ type: 'undo' });
    return true;
  }

  function launch(world) {
    if (world.won) return false;
    if (world.crashed) {
      resetTruck(world, true);
    }
    if (world.rolling) return false;
    if (world.activeStroke) endStroke(world);
    world.rolling = true;
    world.truck.vx = Math.max(world.truck.vx, 2.2);
    world.events.push({ type: 'launch' });
    return true;
  }

  /* --------------------------------------------------- collision primitives */
  // Returns { hit, cx, cy, nx, ny, pen } or null
  function circleVsBox(px, py, r, bx, by, bw, bh) {
    var x1 = bx + bw, y1 = by + bh;
    var cx = clamp(px, bx, x1);
    var cy = clamp(py, by, y1);
    var dx = px - cx, dy = py - cy;
    var d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 1e-9) {
      var d = Math.sqrt(d2);
      return { cx: cx, cy: cy, nx: dx / d, ny: dy / d, pen: r - d };
    }
    // Center inside box: push along minimum penetration axis
    var left = px - bx, right = x1 - px, bottom = py - by, top = y1 - py;
    var m = Math.min(left, right, bottom, top);
    if (m === top) return { cx: px, cy: y1, nx: 0, ny: 1, pen: r + top };
    if (m === bottom) return { cx: px, cy: by, nx: 0, ny: -1, pen: r + bottom };
    if (m === left) return { cx: bx, cy: py, nx: -1, ny: 0, pen: r + left };
    return { cx: x1, cy: py, nx: 1, ny: 0, pen: r + right };
  }

  function circleVsSegment(px, py, r, x0, y0, x1, y1, segR) {
    var sx = x1 - x0, sy = y1 - y0;
    var len2 = sx * sx + sy * sy;
    var t = len2 > 1e-9 ? clamp(((px - x0) * sx + (py - y0) * sy) / len2, 0, 1) : 0;
    var cx = x0 + sx * t;
    var cy = y0 + sy * t;
    var dx = px - cx, dy = py - cy;
    var sumR = r + segR;
    var d2 = dx * dx + dy * dy;
    if (d2 >= sumR * sumR) return null;
    if (d2 > 1e-9) {
      var d = Math.sqrt(d2);
      return { cx: cx, cy: cy, nx: dx / d, ny: dy / d, pen: sumR - d };
    }
    return { cx: cx, cy: cy, nx: 0, ny: 1, pen: sumR };
  }

  function allStrokes(world) {
    if (world.activeStroke && world.activeStroke.pts.length >= 2) {
      return world.strokes.concat([world.activeStroke]);
    }
    return world.strokes;
  }

  /* --------------------------------------------------------------- physics */
  function step(world, dt) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    world.time += dt;

    var tr = world.truck;

    // Update springy antenna physics even while waiting (cute idle life!)
    var targetAnt = clamp(-tr.vx * 0.05, -0.55, 0.55);
    tr.antennaVel += ((targetAnt - tr.antennaAngle) * 45 - tr.antennaVel * 5.2) * dt;
    tr.antennaAngle = clamp(tr.antennaAngle + tr.antennaVel * dt, -0.85, 0.85);

    if (world.won) {
      // Celebratory roll-to-stop past the checkered flag
      tr.vx *= Math.pow(0.08, dt);
      tr.vy = Math.max(0, tr.vy * Math.pow(0.1, dt));
      tr.x = clamp(tr.x + tr.vx * dt, 0.5, WORLD_W - 0.6);
      tr.angle *= Math.pow(0.02, dt);
      tr.wheelSpin -= tr.vx * dt / WHEEL_R;
      return;
    }

    if (world.crashed) {
      world.crashTimer += dt;
      if (world.crashTimer >= 0.85) {
        resetTruck(world, true);
      }
      return;
    }

    if (!world.rolling) return;

    world.runTime += dt;
    var subDt = dt / SUBSTEPS;
    var lv = world.level;
    var strokes = allStrokes(world);

    for (var s = 0; s < SUBSTEPS; s++) {
      if (world.won || world.crashed) break;

      if (tr.boostTimer > 0) tr.boostTimer = Math.max(0, tr.boostTimer - subDt);
      if (tr.bounceCd > 0) tr.bounceCd = Math.max(0, tr.bounceCd - subDt);
      if (tr.boostSfxCd > 0) tr.boostSfxCd = Math.max(0, tr.boostSfxCd - subDt);
      if (tr.bumperCd > 0) tr.bumperCd = Math.max(0, tr.bumperCd - subDt);

      // Gravity + subtle air drag
      tr.vy += world.gravity * subDt;
      tr.vx *= (1 - 0.14 * subDt);
      tr.vy *= (1 - 0.06 * subDt);

      // Integrate chassis
      tr.x += tr.vx * subDt;
      tr.y += tr.vy * subDt;
      tr.angle += tr.angVel * subDt;

      // Soft uprighting torque & pitch bounds so truck never gets stuck flipped
      var uprightK = tr.grounded ? 5.5 : 14.0;
      var dampK = tr.grounded ? 6.5 : 5.0;
      tr.angVel += (-tr.angle * uprightK - tr.angVel * dampK) * subDt;
      if (tr.angle > 0.92) { tr.angle = 0.92; if (tr.angVel > 0) tr.angVel = 0; }
      if (tr.angle < -0.92) { tr.angle = -0.92; if (tr.angVel < 0) tr.angVel = 0; }

      // Left world boundary guard
      if (tr.x < 0.75) { tr.x = 0.75; if (tr.vx < 0) tr.vx = -tr.vx * 0.3; }
      // Ceiling world guard
      if (tr.y > WORLD_H - 0.65) { tr.y = WORLD_H - 0.65; if (tr.vy > 0) tr.vy = 0; }

      var cos = Math.cos(tr.angle), sin = Math.sin(tr.angle);
      var anyGround = false;
      var bestSurface = -1; // -1 none, 0 bridge/plat, 1 boost, 2 bounce
      var gnx = 0, gny = 1;
      var bounceContact = null;
      var boostContact = null;
      var maxRearPen = 0, maxFrontPen = 0;

      // Resolve rear wheel, front wheel, and roof bumper
      var parts = [
        { lx: -WHEEL_X, ly: WHEEL_Y, r: WHEEL_R, wheel: 0 },
        { lx: WHEEL_X, ly: WHEEL_Y, r: WHEEL_R, wheel: 1 },
        { lx: 0, ly: ROOF_Y, r: ROOF_R, wheel: -1 }
      ];

      for (var pIdx = 0; pIdx < parts.length; pIdx++) {
        var part = parts[pIdx];
        // Recompute current world position of this collider after prior corrections
        cos = Math.cos(tr.angle); sin = Math.sin(tr.angle);
        var wx = tr.x + part.lx * cos - part.ly * sin;
        var wy = tr.y + part.lx * sin + part.ly * cos;

        // Collect deepest contact for this collider across platforms & strokes
        var best = null;
        var bestType = 0;

        for (var pi = 0; pi < lv.platforms.length; pi++) {
          var pl = lv.platforms[pi];
          var hit = circleVsBox(wx, wy, part.r, pl.x, pl.y, pl.w, pl.h);
          if (hit && (!best || hit.pen > best.pen)) {
            best = hit; bestType = 0;
          }
        }

        for (var si = 0; si < strokes.length; si++) {
          var st = strokes[si];
          var pts = st.pts;
          for (var ki = 1; ki < pts.length; ki++) {
            var sh = circleVsSegment(wx, wy, part.r, pts[ki - 1][0], pts[ki - 1][1], pts[ki][0], pts[ki][1], STROKE_R);
            if (sh && (!best || sh.pen > best.pen)) {
              best = sh; bestType = st.type;
            }
          }
        }

        if (best) {
          // Position projection out of collider
          var push = best.pen * 0.78;
          tr.x += best.nx * push;
          tr.y += best.ny * push;

          // Impulse response at contact point
          var rx = best.cx - tr.x;
          var ry = best.cy - tr.y;
          var vpx = tr.vx - tr.angVel * ry;
          var vpy = tr.vy + tr.angVel * rx;
          var vn = vpx * best.nx + vpy * best.ny;

          if (vn < 0) {
            var rn = rx * best.ny - ry * best.nx;
            var invMass = 1 / TRUCK_MASS + (rn * rn) / TRUCK_INERTIA;
            var rest = bestType === CRAYON_BOUNCE ? 0.35 : 0.06;
            var jN = -(1 + rest) * vn / invMass;
            tr.vx += jN * best.nx / TRUCK_MASS;
            tr.vy += jN * best.ny / TRUCK_MASS;
            tr.angVel += (rn * jN * 0.58) / TRUCK_INERTIA;

            if (part.wheel >= 0 && vn < -5.5 && !tr.grounded) {
              world.events.push({ type: 'land', power: clamp(-vn / 14, 0.2, 1), x: best.cx, y: best.cy });
            }
          }

          if (part.wheel === 0 && best.pen > maxRearPen) maxRearPen = best.pen;
          if (part.wheel === 1 && best.pen > maxFrontPen) maxFrontPen = best.pen;

          if (part.wheel >= 0 && best.ny > 0.22) {
            anyGround = true;
            if (bestType > bestSurface) {
              bestSurface = bestType;
              gnx = best.nx; gny = best.ny;
            } else if (bestSurface < 0) {
              bestSurface = bestType;
              gnx = best.nx; gny = best.ny;
            }
            if (bestType === CRAYON_BOUNCE) bounceContact = best;
            if (bestType === CRAYON_BOOST) boostContact = best;
          }
        }
      }

      // Smooth visual suspension compression
      tr.rearComp += (clamp(maxRearPen * 1.6, 0, 0.22) - tr.rearComp) * 0.35;
      tr.frontComp += (clamp(maxFrontPen * 1.6, 0, 0.22) - tr.frontComp) * 0.35;

      if (anyGround) {
        tr.grounded = true;
        tr.coyote = 0.08;
      } else {
        tr.coyote = Math.max(0, tr.coyote - subDt);
        tr.grounded = false;
      }

      // Special crayon effects & monster-truck motor drive
      if (bounceContact && tr.bounceCd <= 0) {
        var lx = clamp(bounceContact.nx * 0.55 + 0.36, 0.22, 0.65);
        var ly = Math.max(0.76, bounceContact.ny);
        var lLen = Math.sqrt(lx * lx + ly * ly) || 1;
        lx /= lLen; ly /= lLen;
        var launchSpd = 15.2;
        tr.vx = Math.max(tr.vx * 0.6 + lx * 6.8, 6.8);
        tr.vy = Math.max(tr.vy * 0.25, ly * launchSpd);
        tr.angVel = Math.max(tr.angVel, 0.8);
        tr.bounceCd = 0.24;
        tr.grounded = false;
        tr.coyote = 0;
        world.events.push({ type: 'bounce', x: bounceContact.cx, y: bounceContact.cy });
      } else if (anyGround || tr.coyote > 0) {
        // Rightward tangent along surface
        var tx = gny, ty = -gnx;
        if (tx < 0) { tx = -tx; ty = -ty; }
        var tLen = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= tLen; ty /= tLen;

        if (boostContact) {
          tr.boostTimer = Math.max(tr.boostTimer, 0.42);
          if (tr.boostSfxCd <= 0) {
            tr.boostSfxCd = 0.24;
            world.events.push({ type: 'boost', x: boostContact.cx, y: boostContact.cy });
          }
        }

        var isBoosting = !!boostContact || tr.boostTimer > 0;
        var targetSpeed = (isBoosting ? 12.8 : 6.7) * world.tractionBonus;
        var accel = (boostContact ? 42 : isBoosting ? 24 : 21) * world.tractionBonus;

        var vt = tr.vx * tx + tr.vy * ty;
        var dv = targetSpeed - vt;
        if (dv > 0) {
          var stepDv = Math.min(dv, accel * subDt);
          tr.vx += tx * stepDv;
          tr.vy += ty * stepDv;
        } else if (!isBoosting && vt > targetSpeed + 1.8) {
          // Gentle coasting deceleration back toward cruise speed
          var brake = Math.min(vt - targetSpeed, 6.0 * subDt);
          tr.vx -= tx * brake;
          tr.vy -= ty * brake;
        }

        // Gently align truck pitch with slope when grounded
        var slopeAng = clamp(Math.atan2(ty, tx), -0.82, 0.82);
        tr.angVel += (slopeAng - tr.angle) * 14 * subDt;
      }

      // Spin monster truck wheels
      var driveSpd = anyGround ? Math.max(tr.vx, 2.0) : Math.max(tr.vx * 0.7, 1.5);
      tr.wheelSpin -= (driveSpd * subDt) / WHEEL_R;

      // Check bouncy star bumpers
      for (var bi = 0; bi < (lv.bumpers || []).length; bi++) {
        var bp = lv.bumpers[bi];
        var bdx = tr.x - bp.x, bdy = tr.y - bp.y;
        var minD = bp.r + 0.78;
        var bd2 = bdx * bdx + bdy * bdy;
        if (bd2 < minD * minD) {
          var bd = Math.sqrt(bd2) || 0.001;
          var bnx = bdx / bd, bny = bdy / bd;
          tr.x = bp.x + bnx * minD;
          tr.y = bp.y + bny * minD;
          if (tr.bumperCd <= 0) {
            tr.vx = Math.max(5.8, bnx * 7.5 + 4.4);
            tr.vy = Math.max(10.8, bny * 11.4 + 3.2);
            tr.bumperCd = 0.22;
            world.events.push({ type: 'bumper', x: bp.x, y: bp.y, idx: bi });
          }
        }
      }

      // Check smashable wooden toy crates
      for (var ci = 0; ci < world.crates.length; ci++) {
        var cr = world.crates[ci];
        if (cr.smashed) continue;
        var ccx = cr.x, ccy = cr.y + cr.h * 0.5;
        if (dist2(tr.x, tr.y, ccx, ccy) < 1.15 * 1.15) {
          cr.smashed = true;
          world.cratesSmashed++;
          world.events.push({ type: 'crate', x: ccx, y: ccy, id: cr.id });
        }
      }

      // Check collectible stars (generous kid-friendly radius!)
      for (var ti = 0; ti < world.stars.length; ti++) {
        var star = world.stars[ti];
        if (star.collected) continue;
        if (dist2(tr.x, tr.y, star.x, star.y) < 1.42 * 1.42) {
          star.collected = true;
          world.starsCollected++;
          world.events.push({ type: 'star', x: star.x, y: star.y, count: world.starsCollected, id: star.id });
        }
      }

      // Check checkered flag goal!
      var gx = lv.goal[0], gy = lv.goal[1] + 0.9;
      if (Math.abs(tr.x - gx) < 1.35 && Math.abs(tr.y - gy) < 1.65) {
        world.won = true;
        var earned = Math.max(1, world.starsCollected);
        world.events.push({ type: 'win', stars: earned, x: gx, y: gy });
        break;
      }

      // Check cartoon hazards
      for (var hi = 0; hi < (lv.hazards || []).length; hi++) {
        var hz = lv.hazards[hi];
        var hHit = circleVsBox(tr.x, tr.y - 0.15, 0.62, hz.x, hz.y, hz.w, hz.h);
        if (hHit) {
          world.crashed = true;
          world.crashes++;
          world.crashTimer = 0;
          world.events.push({ type: 'crash', reason: 'hazard', x: tr.x, y: tr.y });
          break;
        }
      }
      if (world.crashed) break;

      // Check fall out of bounds (bottom or far right past flag)
      if (tr.y < -1.4 || tr.x > WORLD_W + 1.5) {
        world.crashed = true;
        world.crashes++;
        world.crashTimer = 0;
        world.events.push({ type: 'crash', reason: 'fall', x: tr.x, y: Math.max(0.2, tr.y) });
        break;
      }
    }

    // Detect stall (truck trapped in a pocket for > 2.8s)
    if (world.rolling && !world.won && !world.crashed) {
      var spd2 = tr.vx * tr.vx + tr.vy * tr.vy;
      if (spd2 < 0.18) {
        tr.stallTimer += dt;
        if (tr.stallTimer > 2.8) {
          world.crashed = true;
          world.crashes++;
          world.crashTimer = 0;
          world.events.push({ type: 'crash', reason: 'stall', x: tr.x, y: tr.y });
        }
      } else {
        tr.stallTimer = Math.max(0, tr.stallTimer - dt * 2);
      }
    }
  }

  function consumeEvents(world) {
    if (!world.events.length) return [];
    var out = world.events;
    world.events = [];
    return out;
  }

  function starsForWin(world) {
    return world.won ? Math.max(1, world.starsCollected) : 0;
  }

  return {
    WORLD_W: WORLD_W,
    WORLD_H: WORLD_H,
    CRAYON_BRIDGE: CRAYON_BRIDGE,
    CRAYON_BOOST: CRAYON_BOOST,
    CRAYON_BOUNCE: CRAYON_BOUNCE,
    CRAYONS: CRAYONS,
    WORLDS: WORLDS,
    SKINS: SKINS,
    LEVELS: LEVELS,
    WHEEL_X: WHEEL_X,
    WHEEL_Y: WHEEL_Y,
    WHEEL_R: WHEEL_R,
    STROKE_R: STROKE_R,
    defaultSave: defaultSave,
    loadSave: loadSave,
    totalStars: totalStars,
    isSkinUnlocked: isSkinUnlocked,
    isLevelOpen: isLevelOpen,
    nextUnfinishedLevel: nextUnfinishedLevel,
    createWorld: createWorld,
    resetTruck: resetTruck,
    setCrayon: setCrayon,
    beginStroke: beginStroke,
    extendStroke: extendStroke,
    endStroke: endStroke,
    addStroke: addStroke,
    undoStroke: undoStroke,
    launch: launch,
    step: step,
    consumeEvents: consumeEvents,
    starsForWin: starsForWin,
    strokeLength: strokeLength
  };
}));

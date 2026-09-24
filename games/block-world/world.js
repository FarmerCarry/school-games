/* Block World — world: seeded generation, tile lighting, water, compact save encoding. */
(function () {
  'use strict';
  var BW = window.BW;
  var B = BW.B, BLOCKS = BW.BLOCKS;
  var W = 500, H = 150, SEA = 69;
  BW.W = W; BW.H = H; BW.SEA = SEA;
  var BIOMES = ['ocean', 'beach', 'forest', 'plains', 'desert', 'snow'];
  BW.BIOMES = BIOMES;
  var BIOME_LABEL = { ocean: 'Ocean', beach: 'Sunny Beach', forest: 'Green Forest', plains: 'Flower Meadow', desert: 'Dusty Desert', snow: 'Snowy Peaks' };
  BW.BIOME_LABEL = BIOME_LABEL;

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  BW.mulberry = mulberry;
  function hash2(seed, x, y) {
    var h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  function sm(t) { return t * t * (3 - 2 * t); }
  function noise1(seed, x) { var i = Math.floor(x), f = x - i; return hash2(seed, i, 0) + (hash2(seed, i + 1, 0) - hash2(seed, i, 0)) * sm(f); }
  function noise2(seed, x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
    var a = hash2(seed, ix, iy), b = hash2(seed, ix + 1, iy), c = hash2(seed, ix, iy + 1), d = hash2(seed, ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm2(seed, x, y) { return noise2(seed, x, y) * 0.6 + noise2(seed + 17, x * 2.1, y * 2.1) * 0.3 + noise2(seed + 31, x * 4.3, y * 4.3) * 0.1; }

  function World(seed) {
    this.seed = seed >>> 0;
    this.tiles = new Uint8Array(W * H);
    this.walls = new Uint8Array(W * H);
    this.sky = new Uint8Array(W * H);
    this.blk = new Uint8Array(W * H);
    this.biome = new Uint8Array(W);
    this.surf = new Int16Array(W);
    this.onChange = null; // function(x, y)
    this.waterActive = [];
    this.waterSet = new Uint8Array(W * H);
  }
  BW.World = World;
  var P = World.prototype;
  P.get = function (x, y) { if (x < 0 || x >= W || y < 0) return 0; if (y >= H) return B.BEDROCK; return this.tiles[y * W + x]; };
  P.wall = function (x, y) { if (x < 0 || x >= W || y < 0 || y >= H) return 0; return this.walls[y * W + x]; };
  P.solid = function (x, y) { if (x < 0 || x >= W) return true; if (y < 0) return false; if (y >= H) return true; var d = BLOCKS[this.tiles[y * W + x]]; return d.solid; };
  P.biomeAt = function (x) { x = Math.max(0, Math.min(W - 1, Math.floor(x))); return BIOMES[this.biome[x]]; };

  // ------------------------------------------------------------ generation
  P.generate = function () {
    var seed = this.seed, rnd = mulberry(seed), t = this.tiles, wl = this.walls, self = this;
    function set(x, y, id) { if (x >= 0 && x < W && y >= 0 && y < H) t[y * W + x] = id; }
    function get(x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? t[y * W + x] : B.BEDROCK; }
    // biome segments
    var segs = [];
    var bag = ['desert', 'snow', 'plains', 'forest'];
    function nextType(prev) { var choices = bag.filter(function (b) { return b !== prev; }); var c = choices[Math.floor(rnd() * choices.length)]; return c; }
    var cx0 = 250 - 30 - Math.floor(rnd() * 10), cx1 = 250 + 30 + Math.floor(rnd() * 10);
    segs.push({ a: cx0, b: cx1, type: 'forest' });
    var x = cx0, prev = 'forest', usedL = [];
    var order = rnd() < 0.5 ? ['desert', 'snow'] : ['snow', 'desert'];
    // left side
    var first = true;
    while (x > 40) {
      var wdt = 55 + Math.floor(rnd() * 35);
      var type = first ? (rnd() < 0.5 ? 'plains' : order[0]) : nextType(prev);
      if (!first && usedL.indexOf(order[0]) < 0 && type !== order[0] && prev !== order[0] && x - wdt < 110) type = order[0];
      first = false;
      segs.unshift({ a: Math.max(38, x - wdt), b: x, type: type }); usedL.push(type); prev = type; x -= wdt;
    }
    segs[0].a = 38;
    x = cx1; prev = 'forest'; first = true; var usedR = [];
    while (x < 460) {
      wdt = 55 + Math.floor(rnd() * 35);
      type = first ? (rnd() < 0.5 ? 'plains' : order[1]) : nextType(prev);
      if (!first && usedR.indexOf(order[1]) < 0 && type !== order[1] && prev !== order[1] && x + wdt > 390) type = order[1];
      first = false;
      segs.push({ a: x, b: Math.min(462, x + wdt), type: type }); usedR.push(type); prev = type; x += wdt;
    }
    segs[segs.length - 1].b = 462;
    function biomeOf(x) {
      if (x < 24 || x >= 476) return 'ocean';
      if (x < 38 || x >= 462) return 'beach';
      for (var i = 0; i < segs.length; i++) if (x >= segs[i].a && x < segs[i].b) return segs[i].type;
      return 'forest';
    }
    var AMP = { forest: 1, plains: 0.45, desert: 0.7, snow: 1.6, beach: 0.1, ocean: 0.1 };
    var amp = new Float32Array(W);
    for (x = 0; x < W; x++) { var bt = biomeOf(x); this.biome[x] = BIOMES.indexOf(bt); amp[x] = AMP[bt]; }
    // smooth amplitude
    var amp2 = new Float32Array(W);
    for (x = 0; x < W; x++) { var s = 0, n = 0; for (var k = -8; k <= 8; k++) { var xx = x + k; if (xx >= 0 && xx < W) { s += amp[xx]; n++; } } amp2[x] = s / n; }
    for (x = 0; x < W; x++) {
      var h = 61 + (noise1(seed + 3, x * 0.025) - 0.5) * 22 * amp2[x] + (noise1(seed + 5, x * 0.09) - 0.5) * 5 * amp2[x] + (noise1(seed + 7, x * 0.3) - 0.5) * 1.2;
      // coasts
      var edge = Math.min(x, W - 1 - x);
      if (edge < 44) { var tt = sm(Math.max(0, Math.min(1, (44 - edge) / 26))); h = h + (SEA - 1 - h) * Math.min(1, tt * 1.6); if (edge < 26) h = SEA - 1 + (26 - edge) * 0.55; }
      this.surf[x] = Math.round(Math.max(30, Math.min(84, h)));
    }
    // flatten spawn
    for (x = 244; x <= 256; x++) this.surf[x] = Math.round(this.surf[x] * 0.5 + this.surf[250] * 0.5);
    // columns
    for (x = 0; x < W; x++) {
      var sf = this.surf[x], bio = biomeOf(x);
      var dirtD = 3 + Math.floor(noise1(seed + 11, x * 0.2) * 4);
      for (var y = 0; y < H; y++) {
        var id = 0, wall = 0;
        if (y >= sf) {
          var d = y - sf;
          if (bio === 'desert') {
            id = d < dirtD + 2 ? B.SAND : d < dirtD + 9 ? B.SANDSTONE : B.STONE;
            wall = d < 2 ? 0 : d < dirtD + 9 ? 3 : 2;
          } else if (bio === 'beach' || bio === 'ocean') {
            id = d < 4 ? B.SAND : d < 4 + dirtD ? B.DIRT : B.STONE;
            wall = d < 2 ? 0 : d < 4 + dirtD ? 1 : 2;
          } else {
            id = d === 0 ? (bio === 'snow' ? B.SNOW_GRASS : B.GRASS) : d < dirtD ? B.DIRT : B.STONE;
            if (bio === 'snow' && d > 0 && d < 3 && rnd() < 0.5) id = B.SNOW;
            wall = d < 2 ? 0 : d < dirtD ? 1 : 2;
          }
          if (y >= H - 1) id = B.BEDROCK;
          else if (y >= H - 4 && rnd() < (y - (H - 5)) / 4) id = B.BEDROCK;
        }
        t[y * W + x] = id; wl[y * W + x] = wall;
      }
    }
    // caves: ridged noise tunnels + caverns
    for (x = 0; x < W; x++) {
      var sfc = this.surf[x], edgeD = Math.min(x, W - 1 - x);
      for (y = sfc + 7; y < H - 2; y++) {
        if (edgeD < 48 && y < SEA + 12) continue;
        var depth = (y - sfc) / 80;
        var n1 = fbm2(seed + 101, x * 0.045, y * 0.075);
        var tunnel = Math.abs(n1 - 0.5) < 0.028 + Math.min(0.03, depth * 0.03);
        var n2 = fbm2(seed + 202, x * 0.03, y * 0.05);
        var cavern = y > 88 && n2 > 0.7 - Math.min(0.06, (y - 88) * 0.002);
        if ((tunnel || cavern) && t[y * W + x] !== B.BEDROCK) t[y * W + x] = 0;
      }
    }
    // worms (some start at the surface)
    for (var wi = 0; wi < 34; wi++) {
      var surfaceStart = wi < 7;
      var wx = 60 + rnd() * (W - 120), wy;
      if (surfaceStart) { if (Math.abs(wx - 250) < 25) wx += 40; wy = this.surf[Math.floor(wx)] - 1; } else wy = 80 + rnd() * 60;
      var ang = surfaceStart ? Math.PI / 2 + (rnd() - 0.5) * 1.2 : rnd() * Math.PI * 2;
      var len = 50 + rnd() * 110, rad = surfaceStart ? 1.3 : 1.2 + rnd() * 1.4;
      for (var st = 0; st < len; st++) {
        ang += (rnd() - 0.5) * 0.5;
        if (surfaceStart && st < 25) ang = ang * 0.8 + (Math.PI / 2) * 0.2;
        wx += Math.cos(ang); wy += Math.sin(ang) * 0.8;
        if (wy > H - 6) { wy = H - 6; ang = -ang; }
        var rr = rad + Math.sin(st * 0.2) * 0.4;
        for (var oy = -3; oy <= 3; oy++) for (var ox = -3; ox <= 3; ox++) {
          if (ox * ox + oy * oy > rr * rr) continue;
          var tx = Math.round(wx + ox), ty = Math.round(wy + oy);
          if (tx < 45 || tx > W - 46 || ty < 5 || ty >= H - 3) continue;
          if (get(tx, ty) !== B.BEDROCK) set(tx, ty, 0);
        }
      }
    }
    // ores
    function vein(id, count, size, y0, y1) {
      for (var i = 0; i < count; i++) {
        var vx = Math.floor(rnd() * W), vy = Math.floor(y0 + rnd() * (y1 - y0));
        var n = size[0] + Math.floor(rnd() * (size[1] - size[0] + 1));
        for (var k = 0; k < n; k++) {
          var cur = get(vx, vy);
          if (cur === B.STONE || cur === B.SANDSTONE || (id === B.CLAY && cur === B.DIRT) || (id === B.COAL_ORE && cur === B.DIRT && rnd() < 0.3)) set(vx, vy, id);
          var dir = Math.floor(rnd() * 4); vx += dir === 0 ? 1 : dir === 1 ? -1 : 0; vy += dir === 2 ? 1 : dir === 3 ? -1 : 0;
        }
      }
    }
    vein(B.COAL_ORE, 200, [4, 9], 60, 140);
    vein(B.COPPER_ORE, 130, [3, 7], 72, 142);
    vein(B.IRON_ORE, 100, [3, 6], 86, 146);
    vein(B.GOLD_ORE, 50, [3, 5], 106, 147);
    vein(B.DIAMOND_ORE, 30, [2, 4], 124, 148);
    vein(B.CLAY, 40, [5, 10], 55, 80);
    // surface grass fix where caves exposed dirt to sky: turn top dirt into grass
    for (x = 0; x < W; x++) {
      for (y = 0; y < H; y++) {
        var id2 = t[y * W + x];
        if (id2 === 0) continue;
        if (id2 === B.DIRT && y <= this.surf[x] + 2) { var bb = biomeOf(x); if (bb === 'forest' || bb === 'plains') t[y * W + x] = B.GRASS; else if (bb === 'snow') t[y * W + x] = B.SNOW_GRASS; }
        break;
      }
    }
    // water in oceans / low beaches
    for (x = 0; x < W; x++) {
      var ed = Math.min(x, W - 1 - x);
      if (ed > 60) continue;
      for (y = SEA; y < H; y++) { if (t[y * W + x] !== 0) break; t[y * W + x] = B.WATER; }
    }
    // vegetation
    var lastTree = -10;
    for (x = 2; x < W - 2; x++) {
      var sy = -1;
      for (y = 0; y < H; y++) if (t[y * W + x] !== 0) { sy = y; break; }
      if (sy < 1) continue;
      var top = t[sy * W + x], bio2 = biomeOf(x);
      var nearSpawn = Math.abs(x - 250) <= 3;
      if (top === B.GRASS) {
        var treeGap = bio2 === 'forest' ? 3 + Math.floor(rnd() * 4) : 10 + Math.floor(rnd() * 16);
        if (!nearSpawn && x - lastTree >= treeGap && rnd() < (bio2 === 'forest' ? 0.75 : 0.35)) { this.oakTree(x, sy - 1, rnd); lastTree = x; continue; }
        var rv = rnd();
        if (rv < (bio2 === 'plains' ? 0.22 : 0.1)) set(x, sy - 1, [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE][Math.floor(rnd() * 3)]);
        else if (rv < 0.5) set(x, sy - 1, B.TALLGRASS);
        else if (rv < 0.52 && bio2 === 'plains') set(x, sy - 1, B.PUMPKIN);
      } else if (top === B.SNOW_GRASS) {
        if (!nearSpawn && x - lastTree >= 4 + Math.floor(rnd() * 5) && rnd() < 0.6) { this.pineTree(x, sy - 1, rnd); lastTree = x; }
      } else if (top === B.SAND && bio2 === 'desert') {
        if (x - lastTree >= 7 && rnd() < 0.18) { var ch = 2 + Math.floor(rnd() * 3); for (var c = 1; c <= ch; c++) set(x, sy - c, B.CACTUS); lastTree = x; }
        else if (rnd() < 0.08) set(x, sy - 1, B.DEADBUSH);
      } else if (top === B.SAND && bio2 === 'beach' && sy < SEA && rnd() < 0.05) set(x, sy - 1, B.DEADBUSH);
    }
    // glow mushrooms on cave floors
    for (x = 0; x < W; x++) for (y = 92; y < H - 2; y++) {
      if (t[y * W + x] === 0 && BLOCKS[t[(y + 1) * W + x]].solid && t[(y + 1) * W + x] !== B.BEDROCK && rnd() < 0.05) t[y * W + x] = B.MUSHROOM;
    }
    this.computeLight();
  };
  P.oakTree = function (x, y, rnd) {
    var h = 4 + Math.floor(rnd() * 4), t = this.tiles;
    for (var i = 0; i < h; i++) if (y - i >= 0) t[(y - i) * W + x] = B.TRUNK;
    var cy = y - h + 1, rad = 2.2 + rnd() * 0.8;
    for (var oy = -3; oy <= 2; oy++) for (var ox = -3; ox <= 3; ox++) {
      var d = ox * ox + (oy + 0.5) * (oy + 0.5) * 1.3;
      if (d > rad * rad + rnd() * 1.5) continue;
      var tx = x + ox, ty = cy + oy;
      if (tx < 0 || tx >= W || ty < 0) continue;
      if (t[ty * W + tx] === 0) t[ty * W + tx] = B.LEAVES;
    }
  };
  P.pineTree = function (x, y, rnd) {
    var h = 5 + Math.floor(rnd() * 4), t = this.tiles;
    for (var i = 0; i < h; i++) if (y - i >= 0) t[(y - i) * W + x] = B.TRUNK;
    var top = y - h;
    for (var row = 0; row < h; row++) {
      var wdt = row === 0 ? 0 : Math.min(3, Math.floor((row + 1) / 2));
      if (row > h - 3) wdt = Math.max(1, wdt - 1);
      var ty = top + row;
      if (ty < 0) continue;
      for (var ox = -wdt; ox <= wdt; ox++) { var tx = x + ox; if (tx >= 0 && tx < W && t[ty * W + tx] === 0) t[ty * W + tx] = B.PINE_LEAVES; }
    }
    if (top - 1 >= 0 && t[(top - 1) * W + x] === 0) t[(top - 1) * W + x] = B.PINE_LEAVES;
  };

  // --------------------------------------------------------------- lighting
  // sky[] and blk[] hold 0..15. Light entering a tile loses 1 (air), dim+1 (leaves) or 4 (opaque).
  var Q = new Int32Array(W * H * 2);
  function cost(id) { var d = BLOCKS[id]; return d.opaque ? 4 : 1 + d.dim; }
  P.computeLight = function () { this.relight(0, W - 1); };
  P.relight = function (x0, x1) {
    x0 = Math.max(0, x0); x1 = Math.min(W - 1, x1);
    var t = this.tiles, sky = this.sky, blk = this.blk, x, y, i;
    // sky columns + reset
    for (x = x0; x <= x1; x++) {
      var s = 15;
      for (y = 0; y < H; y++) {
        i = y * W + x;
        var id = t[i], d = BLOCKS[id];
        if (s > 0) { if (d.opaque) s = 0; else if (d.dim) s = Math.max(0, s - d.dim); }
        sky[i] = s;
        blk[i] = d.light;
      }
    }
    this._bfs(sky, x0, x1);
    this._bfs(blk, x0, x1);
  };
  P._bfs = function (L, x0, x1) {
    var t = this.tiles, head = 0, tail = 0, x, y, i;
    for (x = x0 - 1; x <= x1 + 1; x++) {
      if (x < 0 || x >= W) continue;
      for (y = 0; y < H; y++) { i = y * W + x; if (L[i] > 1) Q[tail++] = i; }
    }
    while (head < tail) {
      i = Q[head++];
      var v = L[i];
      if (v <= 1) continue;
      x = i % W; y = (i - x) / W;
      for (var k = 0; k < 4; k++) {
        var nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < x0 || nx > x1 || ny < 0 || ny >= H) continue;
        var j = ny * W + nx, nv = v - cost(t[j]);
        if (nv > L[j]) { L[j] = nv; if (nv > 1 && tail < Q.length) Q[tail++] = j; }
      }
    }
  };

  // ------------------------------------------------------------- mutation
  P.set = function (x, y, id, noLight) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    var i = y * W + x, old = this.tiles[i];
    if (old === id) return;
    this.tiles[i] = id;
    var od = BLOCKS[old], nd = BLOCKS[id];
    if (!noLight && (od.opaque !== nd.opaque || od.light !== nd.light || od.dim !== nd.dim)) this.relight(x - 16, x + 16);
    this.wakeWater(x, y);
    if (this.onChange) this.onChange(x, y);
  };
  P.wakeWater = function (x, y) {
    for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
      var tx = x + ox, ty = y + oy;
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
      var i = ty * W + tx;
      if (this.tiles[i] === B.WATER && !this.waterSet[i]) { this.waterSet[i] = 1; this.waterActive.push(i); }
    }
  };
  // Simple mass-conserving water: falls down, spreads sideways under pressure or over edges.
  P.stepWater = function (rnd) {
    var list = this.waterActive;
    if (!list.length) return;
    var n = Math.min(list.length, 160);
    var batch = list.splice(0, n);
    var t = this.tiles;
    for (var k = 0; k < batch.length; k++) {
      var i = batch[k];
      this.waterSet[i] = 0;
      if (t[i] !== B.WATER) continue;
      var x = i % W, y = (i - x) / W;
      if (y + 1 < H && isOpen(t[i + W])) { this.move(i, i + W); continue; }
      var dir = rnd() < 0.5 ? 1 : -1, moved = false;
      for (var tr = 0; tr < 2 && !moved; tr++, dir = -dir) {
        var nx = x + dir;
        if (nx < 0 || nx >= W) continue;
        var j = i + dir;
        if (!isOpen(t[j])) continue;
        var belowOpen = y + 1 < H && isOpen(t[j + W]);
        var pressure = y > 0 && t[i - W] === B.WATER;
        if (belowOpen || pressure) { this.move(i, j); moved = true; }
      }
    }
  };
  function isOpen(id) { return id === 0 || id === B.TALLGRASS || id === B.DEADBUSH; }
  P.move = function (i, j) {
    var x = i % W, y = (i - x) / W, x2 = j % W, y2 = (j - x2) / W;
    this.tiles[i] = 0; this.tiles[j] = B.WATER;
    this.wakeWater(x, y); this.wakeWater(x2, y2);
    if (this.onChange) { this.onChange(x, y); this.onChange(x2, y2); }
  };

  // --------------------------------------------------------------- saving
  function rle(arr) {
    var out = [], i = 0, n = arr.length;
    while (i < n) {
      var v = arr[i], c = 1;
      while (i + c < n && arr[i + c] === v && c < 255) c++;
      out.push(v, c); i += c;
    }
    var s = '';
    for (var k = 0; k < out.length; k += 8192) s += String.fromCharCode.apply(null, out.slice(k, k + 8192));
    return btoa(s);
  }
  function unrle(b64, len) {
    var s = atob(b64), arr = new Uint8Array(len), p = 0;
    for (var k = 0; k + 1 < s.length; k += 2) {
      var v = s.charCodeAt(k), c = s.charCodeAt(k + 1);
      for (var j = 0; j < c && p < len; j++) arr[p++] = v;
    }
    return arr;
  }
  BW.rle = rle; BW.unrle = unrle;
  P.serialize = function () {
    return { seed: this.seed, t: rle(this.tiles), w: rle(this.walls), b: rle(this.biome), s: Array.prototype.slice.call(this.surf) };
  };
  World.load = function (o) {
    var w = new World(o.seed);
    w.tiles = unrle(o.t, W * H);
    w.walls = unrle(o.w, W * H);
    w.biome = unrle(o.b, W);
    for (var x = 0; x < W; x++) w.surf[x] = (o.s && o.s[x]) || 60;
    for (var i = 0; i < w.tiles.length; i++) if (!BLOCKS[w.tiles[i]]) w.tiles[i] = 0;
    w.computeLight();
    return w;
  };
})();

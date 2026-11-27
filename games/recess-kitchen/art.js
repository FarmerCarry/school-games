/* Recess Kitchen (مطبخ الفسحة) — Three.js isometric 3D school canteen renderer.
 * Merged static kitchen geometry per level, chunky expressive chefs with 6 hats/aprons,
 * crisp 3D toy food models, animated chop/stove/juicer/conveyor props, instanced blob
 * shadows & particles, and software-WebGL fence pacing. */
(function () {
  'use strict';

  var TILE = 1.32;

  var THEMES = {
    school: {
      sky: 0xffe4a8, fog: 0xffebc0,
      floorA: 0xfff8e7, floorB: 0xd9f3e6, rim: 0xf4c87a,
      wall: 0xfff3d4, wainscot: 0x4ecdc4, trim: 0xd68c45,
      cab: 0x49c6bc, cabDark: 0x34a89f, wood: 0xebb067, woodRim: 0xc9843b,
      awnA: 0xff5a5f, awnB: 0xfff8eb
    },
    bistro: {
      sky: 0xffd7b0, fog: 0xffe4c8,
      floorA: 0xfff7e8, floorB: 0xffe1c6, rim: 0xeba96a,
      wall: 0xfff1dc, wainscot: 0xff8a5b, trim: 0xc87439,
      cab: 0xff8454, cabDark: 0xe06238, wood: 0xf2bf77, woodRim: 0xd19042,
      awnA: 0xffbe0b, awnB: 0xff5a5f
    },
    mega: {
      sky: 0xc9f0ff, fog: 0xdff6ff,
      floorA: 0xfffaf0, floorB: 0xe0edff, rim: 0x8cc7ff,
      wall: 0xf4f9ff, wainscot: 0x6a67f5, trim: 0x4d4ac9,
      cab: 0x6c68f2, cabDark: 0x514dd1, wood: 0xeeb062, woodRim: 0xc98438,
      awnA: 0xff4d88, awnB: 0xffde59
    }
  };

  var CRATE_COLORS = {
    crate_bun: 0xffc845,
    crate_patty: 0xff6b6b,
    crate_cheese: 0xffd93d,
    crate_lettuce: 0x52d165,
    crate_tomato: 0xff4d5a,
    crate_potato: 0xeb9b46,
    crate_dough: 0xf4a261,
    crate_fruit: 0xff5ca8
  };

  function createView(canvas) {
    var T = window.THREE;
    var E = window.RecessEngine;
    if (!T) throw new Error('three.js unavailable');

    var wgl = Kit.webgl.createRenderer(canvas);
    var software = wgl.software, renderer = wgl.renderer;

    var scene = new T.Scene();
    var bgColor = new T.Color(THEMES.school.sky);
    scene.background = bgColor;
    scene.fog = new T.Fog(THEMES.school.fog, 32, 74);

    var camera = new T.PerspectiveCamera(31, 16 / 9, 0.5, 130);
    var camBase = new T.Vector3(0, 14.5, 16.0);
    var camLook = new T.Vector3(0, 0.35, 0.55);
    camera.position.copy(camBase);
    camera.lookAt(camLook);

    // Bright warm sunlit kitchen lighting
    var hemi = new T.HemisphereLight(0xfffdf2, 0xb88b68, 1.32);
    var sun = new T.DirectionalLight(0xfff5db, 1.65);
    sun.position.set(10, 22, 13);
    var fill = new T.DirectionalLight(0xd9f4ff, 0.48);
    fill.position.set(-12, 11, -6);
    scene.add(hemi, sun, fill);

    // Reusable scratch math objects (zero per-frame allocations)
    var C = new T.Color(), M4 = new T.Matrix4(), Q = new T.Quaternion(), EU = new T.Euler();
    var V1 = new T.Vector3(), S1 = new T.Vector3();

    var MAT_LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_GLOW = new T.MeshBasicMaterial({ vertexColors: true });
    var matCache = {};
    function mat(hex, basic) {
      var key = (basic ? 'b_' : 'l_') + hex;
      if (!matCache[key]) {
        matCache[key] = basic
          ? new T.MeshBasicMaterial({ color: hex })
          : new T.MeshLambertMaterial({ color: hex });
      }
      return matCache[key];
    }

    // Shared primitive geometries
    var G_BOX = new T.BoxGeometry(1, 1, 1);
    var G_CYL = new T.CylinderGeometry(0.5, 0.5, 1, 10);
    var G_CYL_TAPER = new T.CylinderGeometry(0.56, 0.38, 1, 10);
    var G_SPH = new T.SphereGeometry(0.5, 10, 8);
    var G_CONE = new T.ConeGeometry(0.5, 1, 8);
    var G_TORUS = new T.TorusGeometry(0.5, 0.11, 6, 16);
    var G_RING = new T.RingGeometry(0.38, 0.52, 20);
    var G_DISC = new T.CircleGeometry(0.5, 14);
    G_DISC.rotateX(-Math.PI / 2);
    G_RING.rotateX(-Math.PI / 2);

    function toWorldX(gx) { return (gx - E.COLS * 0.5) * TILE; }
    function toWorldZ(gy) { return (gy - E.ROWS * 0.5) * TILE; }

    /* ---------------------------------------------------- merged box builder */
    // boxes: [cx, y0, cz, w, h, d, hex, glowFlag]
    function buildBoxes(boxes) {
      var lit = [], glow = [];
      for (var i = 0; i < boxes.length; i++) (boxes[i][7] ? glow : lit).push(boxes[i]);
      var all = lit.concat(glow);
      var n = all.length * 36;
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
      var o = 0, r = 0, g = 0, b = 0;
      function v(x, y, z, nx, ny, nz) {
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        col[o] = r; col[o + 1] = g; col[o + 2] = b;
        o += 3;
      }
      function quad(a, bb, c, d, nx, ny, nz) {
        v(a[0], a[1], a[2], nx, ny, nz); v(bb[0], bb[1], bb[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz);
        v(a[0], a[1], a[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz); v(d[0], d[1], d[2], nx, ny, nz);
      }
      for (i = 0; i < all.length; i++) {
        var bx = all[i];
        var x0 = bx[0] - bx[3] * 0.5, x1 = bx[0] + bx[3] * 0.5;
        var y0 = bx[1], y1 = bx[1] + bx[4];
        var z0 = bx[2] - bx[5] * 0.5, z1 = bx[2] + bx[5] * 0.5;
        C.setHex(bx[6]); r = C.r; g = C.g; b = C.b;
        quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0);
        quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0);
        quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0);
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0);
        quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1);
        quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1);
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      var split = lit.length * 36;
      geo.addGroup(0, split, 0);
      geo.addGroup(split, n - split, 1);
      geo.computeBoundingSphere();
      return geo;
    }

    /* ---------------------------------------------------- 3D toy food builder */
    function mkMesh(geo, hex, sx, sy, sz, px, py, pz, rx, ry, rz, basic) {
      var m = new T.Mesh(geo, mat(hex, basic));
      m.scale.set(sx, sy, sz);
      if (px || py || pz) m.position.set(px || 0, py || 0, pz || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      return m;
    }

    function addPlateBase(g) {
      g.add(mkMesh(G_CYL, 0xffffff, 0.78, 0.08, 0.78, 0, 0.04, 0));
      g.add(mkMesh(G_CYL, 0x52d6cb, 0.62, 0.03, 0.62, 0, 0.085, 0));
      g.add(mkMesh(G_CYL, 0xf7fbfb, 0.54, 0.025, 0.54, 0, 0.095, 0));
    }

    function addBurgerLayers(g, parts, yOff) {
      var hasBun = parts.indexOf('bun') !== -1;
      var hasPatty = parts.indexOf('cooked_patty') !== -1;
      var hasCheese = parts.indexOf('cheese') !== -1;
      var y = yOff;
      if (hasBun) {
        g.add(mkMesh(G_CYL, 0xe89c3c, 0.54, 0.13, 0.54, 0, y + 0.065, 0));
        y += 0.13;
      }
      if (hasPatty) {
        g.add(mkMesh(G_CYL, 0x7a381e, 0.56, 0.14, 0.56, 0, y + 0.07, 0));
        y += 0.13;
      }
      if (hasCheese) {
        g.add(mkMesh(G_BOX, 0xffd428, 0.56, 0.055, 0.56, 0, y + 0.03, 0, 0, 0.45, 0));
        y += 0.055;
      }
      if (hasBun) {
        // Crispy green garnish peek when complete burger/cheeseburger
        if (hasPatty) {
          g.add(mkMesh(G_CYL, 0x4cd957, 0.58, 0.05, 0.58, 0, y + 0.02, 0));
          y += 0.045;
        }
        g.add(mkMesh(G_SPH, 0xf5ab42, 0.56, 0.34, 0.56, 0, y + 0.07, 0));
        // Tiny sesame seeds
        g.add(mkMesh(G_BOX, 0xfff5cc, 0.07, 0.03, 0.04, -0.1, y + 0.22, 0.08));
        g.add(mkMesh(G_BOX, 0xfff5cc, 0.07, 0.03, 0.04, 0.11, y + 0.21, -0.05));
        g.add(mkMesh(G_BOX, 0xfff5cc, 0.07, 0.03, 0.04, 0.0, y + 0.23, -0.12));
      }
    }

    function addSaladLayers(g, parts, yOff) {
      var hasLet = parts.indexOf('chopped_lettuce') !== -1;
      var hasTom = parts.indexOf('chopped_tomato') !== -1;
      if (hasLet) {
        g.add(mkMesh(G_SPH, 0x4cd957, 0.32, 0.22, 0.32, -0.11, yOff + 0.12, 0.06));
        g.add(mkMesh(G_SPH, 0x6ae868, 0.30, 0.22, 0.30, 0.12, yOff + 0.13, -0.05));
        g.add(mkMesh(G_SPH, 0x35bd47, 0.28, 0.20, 0.28, 0.0, yOff + 0.14, 0.10));
      }
      if (hasTom) {
        var ty = hasLet ? yOff + 0.23 : yOff + 0.11;
        g.add(mkMesh(G_BOX, 0xff404e, 0.14, 0.12, 0.14, -0.09, ty, 0.05, 0.2, 0.4, 0));
        g.add(mkMesh(G_BOX, 0xff5460, 0.14, 0.12, 0.14, 0.10, ty, -0.04, 0, 0.8, 0.2));
        g.add(mkMesh(G_BOX, 0xff3040, 0.13, 0.11, 0.13, 0.01, ty + 0.03, -0.11));
      }
    }

    function addFriesModel(g, yOff) {
      // Classic red canteen fry cup + fan of golden fries
      g.add(mkMesh(G_BOX, 0xffd447, 0.09, 0.44, 0.09, -0.14, yOff + 0.34, 0.02, 0, 0, 0.16));
      g.add(mkMesh(G_BOX, 0xffe066, 0.09, 0.50, 0.09, -0.05, yOff + 0.38, -0.03, 0.06, 0, 0.05));
      g.add(mkMesh(G_BOX, 0xffc933, 0.09, 0.48, 0.09, 0.05, yOff + 0.37, 0.04, -0.05, 0, -0.06));
      g.add(mkMesh(G_BOX, 0xffd447, 0.09, 0.42, 0.09, 0.14, yOff + 0.33, -0.02, 0, 0, -0.16));
      g.add(mkMesh(G_CYL_TAPER, 0xff4052, 0.46, 0.36, 0.36, 0, yOff + 0.19, 0));
      g.add(mkMesh(G_BOX, 0xffe066, 0.18, 0.14, 0.37, 0, yOff + 0.19, 0));
    }

    function addPizzaModel(g, yOff) {
      // Crispy golden pizza wedge with pepperoni
      g.add(mkMesh(G_CONE, 0xf2a649, 0.58, 0.12, 0.58, 0, yOff + 0.07, 0));
      g.add(mkMesh(G_CYL, 0xffcf40, 0.56, 0.09, 0.56, 0, yOff + 0.09, 0));
      g.add(mkMesh(G_CYL, 0xe84a3c, 0.48, 0.03, 0.48, 0, yOff + 0.14, 0));
      g.add(mkMesh(G_CYL, 0xffe169, 0.44, 0.035, 0.44, 0, yOff + 0.155, 0));
      g.add(mkMesh(G_CYL, 0xd93030, 0.13, 0.04, 0.13, -0.10, yOff + 0.17, 0.07));
      g.add(mkMesh(G_CYL, 0xd93030, 0.13, 0.04, 0.13, 0.11, yOff + 0.17, -0.05));
      g.add(mkMesh(G_CYL, 0xd93030, 0.12, 0.04, 0.12, -0.02, yOff + 0.17, -0.12));
    }

    function addJuiceModel(g, yOff) {
      // Tall frosty orange-berry canteen juice cup with striped straw
      g.add(mkMesh(G_CYL_TAPER, 0xff842b, 0.38, 0.50, 0.38, 0, yOff + 0.25, 0));
      g.add(mkMesh(G_CYL, 0xffe599, 0.41, 0.07, 0.41, 0, yOff + 0.50, 0));
      g.add(mkMesh(G_CYL, 0xff4d79, 0.06, 0.36, 0.06, 0.07, yOff + 0.64, 0, 0, 0, -0.22));
      g.add(mkMesh(G_CYL, 0xffffff, 0.07, 0.08, 0.07, 0.09, yOff + 0.70, 0, 0, 0, -0.22));
      g.add(mkMesh(G_CYL, 0xffc933, 0.18, 0.05, 0.18, -0.14, yOff + 0.53, 0.06, 0.6, 0, 0.5));
    }

    function buildFoodKey(item) {
      if (!item) return '';
      if (item.kind === 'plate') return 'plate:' + item.parts.join(',');
      return item.kind;
    }

    function buildFoodGroup(item) {
      var g = new T.Group();
      if (!item) return g;
      var k = item.kind;
      if (k === 'plate') {
        addPlateBase(g);
        var p = item.parts;
        if (p.length === 1 && p[0] === 'fries') addFriesModel(g, 0.10);
        else if (p.length === 1 && p[0] === 'pizza') addPizzaModel(g, 0.10);
        else if (p.length === 1 && p[0] === 'juice') addJuiceModel(g, 0.10);
        else if (p.indexOf('chopped_lettuce') !== -1 || p.indexOf('chopped_tomato') !== -1) addSaladLayers(g, p, 0.08);
        else if (p.length > 0) addBurgerLayers(g, p, 0.10);
        return g;
      }
      if (k === 'bun') {
        addBurgerLayers(g, ['bun'], 0);
      } else if (k === 'patty') {
        g.add(mkMesh(G_CYL, 0xe87373, 0.52, 0.15, 0.52, 0, 0.08, 0));
      } else if (k === 'cooked_patty') {
        g.add(mkMesh(G_CYL, 0x7a381e, 0.54, 0.15, 0.54, 0, 0.08, 0));
        g.add(mkMesh(G_BOX, 0x471e0d, 0.36, 0.03, 0.06, 0, 0.16, -0.08));
        g.add(mkMesh(G_BOX, 0x471e0d, 0.36, 0.03, 0.06, 0, 0.16, 0.08));
      } else if (k === 'cheese') {
        g.add(mkMesh(G_BOX, 0xffd428, 0.50, 0.09, 0.50, 0, 0.05, 0, 0, 0.35, 0));
      } else if (k === 'lettuce') {
        g.add(mkMesh(G_SPH, 0x49cf54, 0.50, 0.44, 0.50, 0, 0.22, 0));
        g.add(mkMesh(G_SPH, 0x73eb72, 0.30, 0.28, 0.30, 0.12, 0.28, 0.08));
      } else if (k === 'chopped_lettuce') {
        addSaladLayers(g, ['chopped_lettuce'], 0);
      } else if (k === 'tomato') {
        g.add(mkMesh(G_SPH, 0xff3b47, 0.44, 0.38, 0.44, 0, 0.19, 0));
        g.add(mkMesh(G_CYL, 0x3ac449, 0.14, 0.09, 0.14, 0, 0.38, 0));
      } else if (k === 'chopped_tomato') {
        addSaladLayers(g, ['chopped_tomato'], 0);
      } else if (k === 'potato') {
        g.add(mkMesh(G_SPH, 0xd49650, 0.48, 0.34, 0.36, 0, 0.17, 0, 0, 0.3, 0));
      } else if (k === 'chopped_potato') {
        g.add(mkMesh(G_BOX, 0xffe48f, 0.10, 0.10, 0.42, -0.12, 0.06, 0, 0, 0.15, 0));
        g.add(mkMesh(G_BOX, 0xf7d26c, 0.10, 0.10, 0.44, 0.0, 0.09, 0.03, 0, -0.1, 0));
        g.add(mkMesh(G_BOX, 0xffe48f, 0.10, 0.10, 0.40, 0.12, 0.06, -0.02, 0, 0.2, 0));
      } else if (k === 'dough') {
        g.add(mkMesh(G_CYL, 0xfae0b4, 0.56, 0.14, 0.56, 0, 0.07, 0));
        g.add(mkMesh(G_CYL, 0xe84a3c, 0.36, 0.04, 0.36, 0, 0.15, 0));
      } else if (k === 'fruit') {
        g.add(mkMesh(G_SPH, 0xff8c24, 0.32, 0.32, 0.32, -0.12, 0.16, 0.06));
        g.add(mkMesh(G_SPH, 0xff426b, 0.28, 0.32, 0.28, 0.13, 0.16, -0.05));
        g.add(mkMesh(G_CYL, 0x44c752, 0.10, 0.08, 0.10, -0.12, 0.32, 0.06));
      } else if (k === 'fries') {
        addFriesModel(g, 0);
      } else if (k === 'pizza') {
        addPizzaModel(g, 0);
      } else if (k === 'juice') {
        addJuiceModel(g, 0);
      } else if (k === 'burnt') {
        g.add(mkMesh(G_CYL, 0x2d2a30, 0.50, 0.16, 0.50, 0, 0.08, 0));
        g.add(mkMesh(G_SPH, 0x45414a, 0.22, 0.22, 0.22, 0.08, 0.22, 0));
        g.add(mkMesh(G_SPH, 0x5c5763, 0.16, 0.16, 0.16, -0.10, 0.32, 0.05));
      }
      return g;
    }

    // Slot wrapper that only rebuilds its 3D food mesh when item key changes
    function createFoodSlot() {
      var holder = new T.Group();
      var slot = { group: holder, key: '', child: null };
      slot.set = function (item) {
        var k = buildFoodKey(item);
        if (k === slot.key) return;
        slot.key = k;
        if (slot.child) { holder.remove(slot.child); slot.child = null; }
        if (item) {
          slot.child = buildFoodGroup(item);
          holder.add(slot.child);
        }
      };
      return slot;
    }

    /* ---------------------------------------------------- chunky 3D chefs */
    function buildHatMesh(hatIdx) {
      var g = new T.Group();
      if (hatIdx === 1) {
        // Bandana
        g.add(mkMesh(G_CYL, 0xff4757, 0.72, 0.18, 0.72, 0, 0.05, 0));
        g.add(mkMesh(G_BOX, 0xff4757, 0.16, 0.10, 0.30, -0.14, 0.05, -0.38, 0.2, 0.35, 0));
        g.add(mkMesh(G_BOX, 0xff4757, 0.14, 0.10, 0.28, 0.12, 0.05, -0.38, 0.2, -0.35, 0));
        g.add(mkMesh(G_BOX, 0xffe066, 0.22, 0.11, 0.08, 0, 0.06, 0.35));
      } else if (hatIdx === 2) {
        // Striped Bistro Cap
        g.add(mkMesh(G_CYL, 0x2ec4b6, 0.72, 0.22, 0.72, 0, 0.10, 0));
        g.add(mkMesh(G_CYL, 0xffffff, 0.74, 0.08, 0.74, 0, 0.06, 0));
        g.add(mkMesh(G_BOX, 0x264653, 0.56, 0.06, 0.32, 0, 0.01, 0.36));
      } else if (hatIdx === 3) {
        // Strawberry Beret
        g.add(mkMesh(G_SPH, 0xff4d6d, 0.80, 0.34, 0.80, 0, 0.14, -0.02));
        g.add(mkMesh(G_CYL, 0x44cf54, 0.12, 0.18, 0.12, 0, 0.34, 0));
        g.add(mkMesh(G_BOX, 0x5be368, 0.26, 0.06, 0.12, 0.12, 0.32, 0, 0, 0.3, -0.25));
      } else if (hatIdx === 4) {
        // Star Baker Hat
        g.add(mkMesh(G_CYL, 0x4361ee, 0.64, 0.34, 0.64, 0, 0.15, 0));
        g.add(mkMesh(G_SPH, 0x4cc9f0, 0.74, 0.42, 0.74, 0, 0.36, 0));
        g.add(mkMesh(G_BOX, 0xffd428, 0.24, 0.24, 0.12, 0, 0.20, 0.32, 0, 0, 0.78));
      } else if (hatIdx === 5) {
        // Golden Chef Crown
        g.add(mkMesh(G_CYL, 0xffcf2e, 0.68, 0.28, 0.68, 0, 0.14, 0));
        for (var k = 0; k < 5; k++) {
          var a = (k / 5) * Math.PI * 2;
          g.add(mkMesh(G_CONE, 0xffe066, 0.20, 0.24, 0.20, Math.sin(a) * 0.26, 0.34, Math.cos(a) * 0.26));
        }
        g.add(mkMesh(G_SPH, 0xff3b5c, 0.14, 0.14, 0.14, 0, 0.15, 0.34));
      } else {
        // Classic Tall Puffy White Chef Toque!
        g.add(mkMesh(G_CYL, 0xf8f8f5, 0.64, 0.32, 0.64, 0, 0.14, 0));
        g.add(mkMesh(G_CYL, 0xff5a5f, 0.66, 0.09, 0.66, 0, 0.05, 0));
        g.add(mkMesh(G_SPH, 0xffffff, 0.56, 0.42, 0.56, 0, 0.40, 0));
        g.add(mkMesh(G_SPH, 0xffffff, 0.44, 0.36, 0.44, -0.22, 0.36, 0.06));
        g.add(mkMesh(G_SPH, 0xffffff, 0.44, 0.36, 0.44, 0.22, 0.36, 0.06));
        g.add(mkMesh(G_SPH, 0xffffff, 0.42, 0.34, 0.42, 0, 0.37, -0.18));
      }
      return g;
    }

    function createChefMesh(index) {
      var root = new T.Group();
      var bodyGroup = new T.Group();
      root.add(bodyGroup);

      // Ground player ring (Gold for P1, Aqua for P2)
      var ringColor = index === 0 ? 0xffb703 : 0x2ec4b6;
      var ring = new T.Mesh(G_RING, mat(ringColor, true));
      ring.position.y = 0.03;
      ring.scale.set(1.15, 1.15, 1.15);
      root.add(ring);

      // Feet
      var footL = mkMesh(G_SPH, 0x3b261c, 0.22, 0.16, 0.30, -0.17, 0.09, 0.04);
      var footR = mkMesh(G_SPH, 0x3b261c, 0.22, 0.16, 0.30, 0.17, 0.09, 0.04);
      bodyGroup.add(footL, footR);

      // Chunky chef coat torso + swappable apron
      var coat = mkMesh(G_CYL, 0xffffff, 0.62, 0.58, 0.56, 0, 0.44, 0);
      var apronMat = new T.MeshLambertMaterial({ color: E.APRONS[0].color });
      var trimMat = new T.MeshLambertMaterial({ color: E.APRONS[0].trim });
      var apron = new T.Mesh(G_BOX, apronMat);
      apron.scale.set(0.46, 0.50, 0.14);
      apron.position.set(0, 0.42, 0.25);
      var pocket = new T.Mesh(G_BOX, trimMat);
      pocket.scale.set(0.32, 0.16, 0.06);
      pocket.position.set(0, 0.33, 0.32);
      bodyGroup.add(coat, apron, pocket);

      // Stubby arms (pivoted at shoulder)
      var armL = new T.Group();
      armL.position.set(-0.36, 0.58, 0);
      armL.add(mkMesh(G_CYL, 0xffffff, 0.18, 0.34, 0.18, 0, -0.14, 0));
      armL.add(mkMesh(G_SPH, 0xffd7b0, 0.18, 0.18, 0.18, 0, -0.32, 0));

      var armR = new T.Group();
      armR.position.set(0.36, 0.58, 0);
      armR.add(mkMesh(G_CYL, 0xffffff, 0.18, 0.34, 0.18, 0, -0.14, 0));
      armR.add(mkMesh(G_SPH, 0xffd7b0, 0.18, 0.18, 0.18, 0, -0.32, 0));
      bodyGroup.add(armL, armR);

      // Cute Big Head
      var head = new T.Group();
      head.position.set(0, 0.98, 0);
      var skinHex = index === 0 ? 0xffd9b5 : 0xf4c298;
      var hairHex = index === 0 ? 0x5c3621 : 0x2f2538;
      head.add(mkMesh(G_SPH, skinHex, 0.72, 0.68, 0.68, 0, 0, 0));
      head.add(mkMesh(G_SPH, skinHex, 0.18, 0.18, 0.14, -0.35, -0.02, 0));
      head.add(mkMesh(G_SPH, skinHex, 0.18, 0.18, 0.14, 0.35, -0.02, 0));
      // Hair fringe
      head.add(mkMesh(G_SPH, hairHex, 0.70, 0.34, 0.66, 0, 0.18, -0.05));
      // Big glossy dark eyes + white catchlight sparkle
      head.add(mkMesh(G_SPH, 0x241715, 0.14, 0.16, 0.10, -0.14, 0.02, 0.30));
      head.add(mkMesh(G_SPH, 0x241715, 0.14, 0.16, 0.10, 0.14, 0.02, 0.30));
      head.add(mkMesh(G_SPH, 0xffffff, 0.05, 0.05, 0.04, -0.12, 0.06, 0.35, 0, 0, 0, true));
      head.add(mkMesh(G_SPH, 0xffffff, 0.05, 0.05, 0.04, 0.16, 0.06, 0.35, 0, 0, 0, true));
      // Rosy cheeks + cheerful smile
      head.add(mkMesh(G_SPH, 0xff8088, 0.14, 0.08, 0.06, -0.23, -0.06, 0.27));
      head.add(mkMesh(G_SPH, 0xff8088, 0.14, 0.08, 0.06, 0.23, -0.06, 0.27));
      head.add(mkMesh(G_BOX, 0xc93b4b, 0.18, 0.06, 0.06, 0, -0.11, 0.31));

      var hatHolder = new T.Group();
      hatHolder.position.set(0, 0.27, 0);
      head.add(hatHolder);
      bodyGroup.add(head);

      // Held food slot visibly carried right in front of the chef!
      var holdSlot = createFoodSlot();
      holdSlot.group.position.set(0, 0.56, 0.56);
      holdSlot.group.scale.set(1.08, 1.08, 1.08);
      bodyGroup.add(holdSlot.group);

      var obj = {
        root: root,
        body: bodyGroup,
        footL: footL,
        footR: footR,
        armL: armL,
        armR: armR,
        head: head,
        hatHolder: hatHolder,
        holdSlot: holdSlot,
        apronMat: apronMat,
        trimMat: trimMat,
        apronIdx: -1,
        hatIdx: -1,
        hatMesh: null,
        angle: 0
      };

      obj.setAppearance = function (apronIdx, hatIdx) {
        if (apronIdx !== obj.apronIdx) {
          obj.apronIdx = apronIdx;
          var ap = E.APRONS[apronIdx] || E.APRONS[0];
          apronMat.color.setHex(ap.color);
          trimMat.color.setHex(ap.trim);
        }
        if (hatIdx !== obj.hatIdx) {
          obj.hatIdx = hatIdx;
          if (obj.hatMesh) hatHolder.remove(obj.hatMesh);
          obj.hatMesh = buildHatMesh(hatIdx);
          hatHolder.add(obj.hatMesh);
        }
      };

      obj.setAppearance(index === 0 ? 0 : 4, index === 0 ? 0 : 1);
      return obj;
    }

    var chefMeshes = [createChefMesh(0), createChefMesh(1)];
    scene.add(chefMeshes[0].root, chefMeshes[1].root);

    /* ---------------------------------------------------- target highlight & hint arrow */
    function createTargetFrame(hex) {
      var g = new T.Group();
      var s = TILE * 0.52;
      var thick = 0.075;
      var m = mat(hex, true);
      var edges = [
        [0, 0, -s, s * 2 + thick, thick, thick],
        [0, 0, s, s * 2 + thick, thick, thick],
        [-s, 0, 0, thick, thick, s * 2 + thick],
        [s, 0, 0, thick, thick, s * 2 + thick]
      ];
      for (var i = 0; i < edges.length; i++) {
        var e = edges[i];
        var mesh = new T.Mesh(G_BOX, m);
        mesh.position.set(e[0], 0, e[2]);
        mesh.scale.set(e[3], e[4], e[5]);
        g.add(mesh);
      }
      g.visible = false;
      return g;
    }
    var targetFrames = [createTargetFrame(0xffe047), createTargetFrame(0x3af0df)];
    scene.add(targetFrames[0], targetFrames[1]);

    // Bouncy golden ghost hint arrow for first-10s onboarding
    var hintArrow = new T.Group();
    hintArrow.add(mkMesh(G_CYL, 0xffe047, 0.22, 0.42, 0.22, 0, 0.42, 0, 0, 0, 0, true));
    hintArrow.add(mkMesh(G_CONE, 0xff9f1c, 0.50, 0.36, 0.50, 0, 0.12, 0, Math.PI, 0, 0, true));
    hintArrow.visible = false;
    scene.add(hintArrow);

    /* ---------------------------------------------------- station progress bar pool */
    var MAX_BARS = 10;
    var barPool = [];
    for (var bi = 0; bi < MAX_BARS; bi++) {
      var bg = new T.Group();
      var frame = mkMesh(G_BOX, 0x261d1b, 0.96, 0.18, 0.08, 0, 0, 0, 0, 0, 0, true);
      var back = mkMesh(G_BOX, 0x453935, 0.88, 0.11, 0.09, 0, 0, 0.01, 0, 0, 0, true);
      var fillMat = new T.MeshBasicMaterial({ color: 0x3ddc84 });
      var fillMesh = new T.Mesh(G_BOX, fillMat);
      fillMesh.position.set(0, 0, 0.02);
      fillMesh.scale.set(0.86, 0.11, 0.09);
      // Warning exclamation badge above stove when nearing burn
      var warn = new T.Group();
      warn.position.set(0, 0.40, 0);
      warn.add(mkMesh(G_SPH, 0xff3b47, 0.38, 0.38, 0.14, 0, 0, 0, 0, 0, 0, true));
      warn.add(mkMesh(G_BOX, 0xffffff, 0.07, 0.16, 0.16, 0, 0.04, 0.02, 0, 0, 0, true));
      warn.add(mkMesh(G_BOX, 0xffffff, 0.07, 0.06, 0.16, 0, -0.10, 0.02, 0, 0, 0, true));
      warn.visible = false;
      bg.add(frame, back, fillMesh, warn);
      bg.visible = false;
      scene.add(bg);
      barPool.push({ group: bg, fill: fillMesh, fillMat: fillMat, warn: warn });
    }

    /* ---------------------------------------------------- instanced blob shadows & particles */
    var MAX_SHADOWS = 24;
    var shadowMat = new T.MeshBasicMaterial({ color: 0x2a1a12, transparent: true, opacity: 0.26, depthWrite: false });
    var shadows = new T.InstancedMesh(G_DISC, shadowMat, MAX_SHADOWS);
    shadows.count = 0;
    shadows.frustumCulled = false;
    scene.add(shadows);

    var MAX_PART = 160;
    var partInst = new T.InstancedMesh(G_BOX, new T.MeshBasicMaterial({ color: 0xffffff }), MAX_PART);
    partInst.count = 0;
    partInst.frustumCulled = false;
    scene.add(partInst);

    var parts = [];
    for (var pi = 0; pi < MAX_PART; pi++) {
      parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, size: 0.15, color: 0xffffff, rise: false });
    }
    var partCursor = 0;

    function burst(gx, gy, opts) {
      if (view.calm) return;
      opts = opts || {};
      var wx = toWorldX(gx), wz = toWorldZ(gy);
      var wy = opts.y != null ? opts.y : 1.05;
      var count = Math.min(opts.count || 10, 40);
      var colors = opts.colors || [0xffffff];
      var speed = opts.speed != null ? opts.speed : 3.2;
      var up = opts.up != null ? opts.up : 3.4;
      var life = opts.life != null ? opts.life : 0.55;
      var size = opts.size != null ? opts.size : 0.16;
      var g = opts.g != null ? opts.g : 9.0;
      for (var i = 0; i < count; i++) {
        var pt = parts[partCursor];
        partCursor = (partCursor + 1) % MAX_PART;
        var a = Math.random() * Math.PI * 2;
        var sp = speed * (0.35 + Math.random() * 0.75);
        pt.x = wx + (Math.random() - 0.5) * (opts.spread || 0.35);
        pt.y = wy + (Math.random() - 0.5) * 0.15;
        pt.z = wz + (Math.random() - 0.5) * (opts.spread || 0.35);
        pt.vx = Math.cos(a) * sp;
        pt.vz = Math.sin(a) * sp;
        pt.vy = up * (0.5 + Math.random() * 0.65);
        pt.g = g;
        pt.life = life * (0.7 + Math.random() * 0.45);
        pt.max = pt.life;
        pt.size = size * (0.7 + Math.random() * 0.55);
        pt.color = colors[i % colors.length];
      }
    }

    function setInst(inst, idx, x, y, z, sx, sy, sz, rx, ry, rz) {
      V1.set(x, y, z);
      EU.set(rx || 0, ry || 0, rz || 0);
      Q.setFromEuler(EU);
      S1.set(sx, sy, sz);
      M4.compose(V1, Q, S1);
      inst.setMatrixAt(idx, M4);
    }

    /* ---------------------------------------------------- dynamic level kitchen group */
    var levelGroup = new T.Group();
    scene.add(levelGroup);
    var builtLevelKey = '';
    var staticMesh = null;
    var stationVisuals = [];
    var steamAccum = 0;

    function clearLevelVisuals() {
      while (levelGroup.children.length) levelGroup.remove(levelGroup.children[0]);
      if (staticMesh) { staticMesh.geometry.dispose(); staticMesh = null; }
      stationVisuals = [];
    }

    function buildLevel(state) {
      clearLevelVisuals();
      var th = THEMES[state.theme] || THEMES.school;
      bgColor.setHex(th.sky);
      scene.fog.color.setHex(th.fog);

      var b = [];
      var W = E.COLS * TILE;
      var D = E.ROWS * TILE;
      var halfW = W * 0.5;
      var halfD = D * 0.5;

      // Outer sunlit kitchen diorama pedestal (strictly top at y = -0.09, zero overlap with floor!)
      b.push([0, -0.84, 0.15, W + 2.5, 0.75, D + 2.3, th.rim]);
      b.push([0, -0.96, 0.15, W + 2.75, 0.12, D + 2.55, th.woodRim]);

      // Checkered ceramic floor tiles (strict top at y = 0.00)
      for (var r = 0; r < E.ROWS; r++) {
        for (var c = 0; c < E.COLS; c++) {
          var fx = toWorldX(c + 0.5);
          var fz = toWorldZ(r + 0.5);
          b.push([fx, -0.09, fz, TILE, 0.09, TILE, (r + c) % 2 === 0 ? th.floorA : th.floorB]);
        }
      }

      // Sunlit back canteen wall behind row 0
      var wallZ = -halfD - 0.55;
      b.push([0, -0.09, wallZ, W + 2.2, 1.59, 0.65, th.wainscot]);
      b.push([0, 1.5, wallZ, W + 2.2, 2.35, 0.65, th.wall]);
      b.push([0, 1.46, wallZ + 0.34, W + 2.2, 0.14, 0.12, th.trim]);

      // Festive pastel bunting flags across the upper wall
      var flagCols = [0xff5a5f, 0xffd447, 0x38d975, 0x3ec6ff, 0xff70a6];
      for (var fi = 0; fi < 15; fi++) {
        var ffx = -halfW + 0.4 + fi * ((W - 0.8) / 14);
        var sag = Math.sin((fi / 14) * Math.PI) * 0.22;
        b.push([ffx, 3.24 - sag, wallZ + 0.40, 0.34, 0.24, 0.05, flagCols[fi % flagCols.length]]);
      }

      // Sunny canteen windows on left & right of back wall (glow sky!)
      var winXs = [-halfW + 2.6, halfW - 2.6];
      for (var wi = 0; wi < winXs.length; wi++) {
        var wx = winXs[wi];
        b.push([wx, 2.02, wallZ + 0.34, 2.55, 1.38, 0.08, 0xffffff]);
        b.push([wx, 2.12, wallZ + 0.37, 2.30, 1.18, 0.06, 0x87e4ff, 1]);
        b.push([wx, 2.12, wallZ + 0.41, 0.10, 1.18, 0.06, 0xffffff]);
        b.push([wx, 2.68, wallZ + 0.41, 2.30, 0.10, 0.06, 0xffffff]);
        // Cute windowsill planter
        b.push([wx, 1.88, wallZ + 0.48, 2.65, 0.16, 0.28, th.wood]);
        b.push([wx - 0.65, 2.04, wallZ + 0.48, 0.36, 0.24, 0.22, 0xe07a5f]);
        b.push([wx - 0.65, 2.28, wallZ + 0.48, 0.44, 0.26, 0.26, 0x4cd957]);
      }

      // Canteen menu chalkboard centered above serve window
      b.push([0, 1.92, wallZ + 0.35, 3.15, 1.45, 0.10, th.woodRim]);
      b.push([0, 2.02, wallZ + 0.39, 2.90, 1.25, 0.06, 0x263830]);
      b.push([-0.75, 2.86, wallZ + 0.43, 0.95, 0.12, 0.04, 0xffe066, 1]);
      b.push([0.45, 2.86, wallZ + 0.43, 1.05, 0.12, 0.04, 0xff8fab, 1]);
      b.push([-0.35, 2.52, wallZ + 0.43, 1.75, 0.10, 0.04, 0xffffff, 1]);
      b.push([-0.15, 2.24, wallZ + 0.43, 1.40, 0.10, 0.04, 0x80ffdb, 1]);

      // Striped awning over the top edge of the back wall
      var stripes = 14;
      var sw = (W + 2.2) / stripes;
      for (var si = 0; si < stripes; si++) {
        var sx = -((W + 2.2) * 0.5) + (si + 0.5) * sw;
        b.push([sx, 3.72, wallZ + 0.62, sw - 0.02, 0.26, 1.05, si % 2 === 0 ? th.awnA : th.awnB]);
        b.push([sx, 3.46, wallZ + 1.08, sw - 0.02, 0.26, 0.14, si % 2 === 0 ? th.awnA : th.awnB]);
      }

      // Side low decorative walls framing the canteen
      b.push([-halfW - 0.65, 0, 0, 0.55, 1.45, D + 1.1, th.wainscot]);
      b.push([-halfW - 0.65, 1.45, 0, 0.62, 0.16, D + 1.2, th.wood]);
      b.push([halfW + 0.65, 0, 0, 0.55, 1.45, D + 1.1, th.wainscot]);
      b.push([halfW + 0.65, 1.45, 0, 0.62, 0.16, D + 1.2, th.wood]);

      // Build every station into static geometry + dynamic prop slots
      for (var i = 0; i < state.stations.length; i++) {
        var st = state.stations[i];
        var cx = toWorldX(st.x);
        var cz = toWorldZ(st.y);
        var isFront = st.r === E.ROWS - 1;
        var baseH = isFront ? 0.56 : 0.78;
        var topY = baseH + 0.14;
        var vis = {
          st: st,
          cx: cx,
          cz: cz,
          topY: topY,
          foodSlot: null,
          knife: null,
          pitcher: null,
          lid: null,
          bell: null,
          convSlot: null,
          crateProp: null,
          burnerGlow: null
        };

        if (st.kind === 'trash') {
          // Cute kitchen pedal bin
          b.push([cx, 0, cz, TILE * 0.74, 0.68, TILE * 0.74, 0x5c6b73]);
          b.push([cx, 0.04, cz + TILE * 0.37, 0.36, 0.08, 0.14, 0xd9e2ec]);
          b.push([cx, 0.68, cz, TILE * 0.80, 0.08, TILE * 0.80, 0x3b4852]);
          var lidGroup = new T.Group();
          lidGroup.position.set(cx, 0.76, cz - TILE * 0.36);
          lidGroup.add(mkMesh(G_BOX, 0x7a8d99, TILE * 0.76, 0.09, TILE * 0.76, 0, 0.04, TILE * 0.36));
          lidGroup.add(mkMesh(G_BOX, 0xffd166, 0.24, 0.07, 0.10, 0, 0.11, TILE * 0.36));
          levelGroup.add(lidGroup);
          vis.lid = lidGroup;
        } else if (st.kind === 'serve') {
          // Serving pass-through counter with conveyor belt & shiny bell
          b.push([cx, 0, cz, TILE * 0.96, baseH, TILE * 0.96, 0xff9f1c]);
          b.push([cx, baseH, cz, TILE * 1.0, 0.14, TILE * 1.0, 0x3a3f4b]);
          // Conveyor stripes
          b.push([cx, topY, cz - 0.28, TILE * 0.84, 0.03, 0.14, 0xffe066, 1]);
          b.push([cx, topY, cz + 0.04, TILE * 0.84, 0.03, 0.14, 0xffe066, 1]);
          b.push([cx, topY, cz + 0.34, TILE * 0.84, 0.03, 0.14, 0xffe066, 1]);
          // Pass-through golden side posts
          b.push([cx - TILE * 0.44, topY, cz - TILE * 0.35, 0.14, 1.05, 0.14, 0xffcf40]);
          b.push([cx + TILE * 0.44, topY, cz - TILE * 0.35, 0.14, 1.05, 0.14, 0xffcf40]);
          b.push([cx, topY + 1.05, cz - TILE * 0.35, TILE * 1.02, 0.18, 0.22, 0xff5a5f]);

          // Shiny brass service bell
          var bell = new T.Group();
          bell.position.set(cx + 0.36, topY + 0.03, cz + 0.34);
          bell.add(mkMesh(G_CYL, 0x3b261c, 0.24, 0.04, 0.24, 0, 0.02, 0));
          bell.add(mkMesh(G_SPH, 0xffd428, 0.20, 0.18, 0.20, 0, 0.08, 0));
          bell.add(mkMesh(G_CYL, 0xfff5cc, 0.06, 0.07, 0.06, 0, 0.18, 0));
          levelGroup.add(bell);
          vis.bell = bell;

          var convSlot = createFoodSlot();
          convSlot.group.position.set(cx, topY + 0.05, cz + 0.2);
          levelGroup.add(convSlot.group);
          vis.convSlot = convSlot;
        } else if (st.kind === 'stove') {
          // Sizzling school grill / stove
          b.push([cx, 0, cz, TILE * 0.96, baseH, TILE * 0.96, 0x4a5568]);
          b.push([cx, 0.14, cz + TILE * 0.48, TILE * 0.72, 0.42, 0.06, 0x2d3748]);
          b.push([cx - 0.24, baseH - 0.12, cz + TILE * 0.49, 0.10, 0.10, 0.06, 0xff5a5f]);
          b.push([cx + 0.24, baseH - 0.12, cz + TILE * 0.49, 0.10, 0.10, 0.06, 0xffd428]);
          b.push([cx, baseH, cz, TILE * 0.98, 0.14, TILE * 0.98, 0x2d3748]);
          // Cast iron skillet pan on top
          b.push([cx, topY, cz, 0.82, 0.08, 0.82, 0x1a202c]);
          b.push([cx + 0.44, topY + 0.04, cz + 0.20, 0.28, 0.06, 0.10, 0xff5a5f]);

          var burner = mkMesh(G_RING, 0xff7b29, 0.82, 0.82, 0.82, cx, topY + 0.09, cz, 0, 0, 0, true);
          levelGroup.add(burner);
          vis.burnerGlow = burner;

          vis.foodSlot = createFoodSlot();
          vis.foodSlot.group.position.set(cx, topY + 0.09, cz);
          levelGroup.add(vis.foodSlot.group);
        } else if (st.kind === 'chop') {
          // Maple chopping board station
          b.push([cx, 0, cz, TILE * 0.96, baseH, TILE * 0.96, th.cab]);
          b.push([cx, baseH, cz, TILE * 1.0, 0.14, TILE * 1.0, th.wood]);
          // Thick light maple board on top
          b.push([cx, topY, cz, TILE * 0.76, 0.09, TILE * 0.68, 0xfff0cc]);
          b.push([cx, topY + 0.01, cz - 0.30, 0.24, 0.07, 0.06, 0xd49650]);

          // Animated chunky toy knife
          var knife = new T.Group();
          knife.position.set(cx + 0.34, topY + 0.12, cz);
          knife.add(mkMesh(G_BOX, 0xdbe7f0, 0.10, 0.18, 0.42, 0, 0.04, -0.08));
          knife.add(mkMesh(G_BOX, 0xff5a5f, 0.11, 0.11, 0.24, 0, 0.05, 0.22));
          levelGroup.add(knife);
          vis.knife = knife;

          vis.foodSlot = createFoodSlot();
          vis.foodSlot.group.position.set(cx - 0.04, topY + 0.10, cz);
          levelGroup.add(vis.foodSlot.group);
        } else if (st.kind === 'juicer') {
          // Cheerful pastel fruit blender station
          b.push([cx, 0, cz, TILE * 0.96, baseH, TILE * 0.96, 0x3ec6ff]);
          b.push([cx, baseH, cz, TILE * 1.0, 0.14, TILE * 1.0, 0xffffff]);
          // Blender motor base
          b.push([cx, topY, cz, 0.56, 0.24, 0.56, 0xff5ca8]);
          b.push([cx, topY + 0.08, cz + 0.29, 0.18, 0.10, 0.05, 0xffe066, 1]);

          var pitcher = new T.Group();
          pitcher.position.set(cx, topY + 0.24, cz);
          pitcher.add(mkMesh(G_CYL_TAPER, 0xd9f7ff, 0.46, 0.48, 0.46, 0, 0.24, 0));
          pitcher.add(mkMesh(G_CYL, 0xff5ca8, 0.50, 0.08, 0.50, 0, 0.50, 0));
          levelGroup.add(pitcher);
          vis.pitcher = pitcher;

          vis.foodSlot = createFoodSlot();
          vis.foodSlot.group.position.set(cx, topY + 0.24, cz);
          levelGroup.add(vis.foodSlot.group);
        } else if (st.kind === 'plates') {
          // Gleaming plate stack station
          b.push([cx, 0, cz, TILE * 0.96, baseH, TILE * 0.96, th.cabDark]);
          b.push([cx, baseH, cz, TILE * 1.0, 0.14, TILE * 1.0, th.wood]);
          var stack = new T.Group();
          stack.position.set(cx, topY, cz);
          for (var ps = 0; ps < 4; ps++) {
            stack.add(mkMesh(G_CYL, 0xffffff, 0.74, 0.06, 0.74, 0, 0.03 + ps * 0.08, 0));
            stack.add(mkMesh(G_CYL, 0x4ecdc4, 0.58, 0.025, 0.58, 0, 0.065 + ps * 0.08, 0));
          }
          levelGroup.add(stack);
        } else if (st.provides) {
          // Color-coded ingredient crate with chunky 3D ingredient display right on top!
          var cc = CRATE_COLORS[st.kind] || 0xf4a261;
          b.push([cx, 0, cz, TILE * 0.94, baseH, TILE * 0.94, 0xd99b56]);
          b.push([cx, 0.10, cz, TILE * 0.98, 0.14, TILE * 0.98, cc]);
          b.push([cx, baseH - 0.16, cz, TILE * 0.98, 0.14, TILE * 0.98, cc]);
          b.push([cx, baseH, cz, TILE * 0.98, 0.14, TILE * 0.98, 0xf2c179]);
          // Colored inner tray
          b.push([cx, topY, cz, TILE * 0.74, 0.05, TILE * 0.74, cc]);

          var crateProp = buildFoodGroup({ kind: st.provides });
          crateProp.position.set(cx, topY + 0.07, cz);
          crateProp.scale.set(1.16, 1.16, 1.16);
          levelGroup.add(crateProp);
          vis.crateProp = crateProp;

          vis.foodSlot = createFoodSlot();
          vis.foodSlot.group.position.set(cx, topY + 0.42, cz);
          levelGroup.add(vis.foodSlot.group);
        } else {
          // Glossy pastel-and-wood prep counter
          b.push([cx, 0, cz, TILE * 0.96, baseH, TILE * 0.96, th.cab]);
          if (!isFront) {
            b.push([cx, 0.16, cz + TILE * 0.48, TILE * 0.74, baseH - 0.30, 0.04, th.cabDark]);
            b.push([cx, baseH * 0.55, cz + TILE * 0.50, 0.24, 0.06, 0.05, 0xfff3d4]);
          }
          b.push([cx, baseH, cz, TILE * 1.0, 0.14, TILE * 1.0, th.wood]);
          b.push([cx, baseH - 0.02, cz, TILE * 1.02, 0.04, TILE * 1.02, th.woodRim]);

          vis.foodSlot = createFoodSlot();
          vis.foodSlot.group.position.set(cx, topY + 0.01, cz);
          levelGroup.add(vis.foodSlot.group);
        }

        stationVisuals.push(vis);
      }

      var geo = buildBoxes(b);
      staticMesh = new T.Mesh(geo, [MAT_LIT, MAT_GLOW]);
      levelGroup.add(staticMesh);
    }

    /* ---------------------------------------------------- shake & sync */
    var shakePower = 0;
    function addShake(p) {
      if (!view.calm) shakePower = Math.max(shakePower, p);
    }

    function sync(state, opt) {
      if (!state) return;
      opt = opt || {};
      var dt = opt.dt || 0;
      var t = opt.t || 0;

      var levelKey = state.id + ':' + state.theme + ':' + (state.demo ? 'd' : 'p');
      if (levelKey !== builtLevelKey) {
        builtLevelKey = levelKey;
        buildLevel(state);
      }

      // Camera framing + gentle shake
      var aspect = camera.aspect || (16 / 9);
      var zoomFix = aspect < 1.55 ? (1.55 / Math.max(0.95, aspect)) : 1;
      var titleSway = opt.mode === 'title' && !view.calm ? Math.sin(t * 0.45) * 0.85 : 0;
      var sx = 0, sy = 0;
      if (shakePower > 0.005) {
        shakePower = Math.max(0, shakePower - dt * 3.8);
        sx = (Math.random() - 0.5) * 0.45 * shakePower;
        sy = (Math.random() - 0.5) * 0.30 * shakePower;
      }
      camera.position.set(camBase.x + titleSway + sx, camBase.y * zoomFix + sy, camBase.z * zoomFix);
      camera.lookAt(camLook);

      // Update chefs
      var shIdx = 0;
      for (var ci = 0; ci < 2; ci++) {
        var cm = chefMeshes[ci];
        var ch = state.chefs[ci];
        if (!ch) {
          cm.root.visible = false;
          targetFrames[ci].visible = false;
          continue;
        }
        cm.root.visible = true;
        cm.setAppearance(ch.apron, ch.hat);

        var wx = toWorldX(ch.x);
        var wz = toWorldZ(ch.y);
        cm.root.position.set(wx, 0, wz);

        // Smooth facing rotation toward (fx, fy)
        var targetAng = Math.atan2(ch.fx, ch.fy);
        var diff = targetAng - cm.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cm.angle += opt.snap ? diff : diff * Math.min(1, dt * 18);
        cm.body.rotation.y = cm.angle;

        var moving = Math.hypot(ch.vx, ch.vy) > 0.25;
        var bob = moving ? Math.abs(Math.sin(ch.walkPhase)) * 0.14 : Math.sin(t * 3.2 + ci * 2) * 0.03;
        var waddle = moving ? Math.sin(ch.walkPhase) * 0.11 : 0;
        var sq = ch.squash || 1;
        var invSq = 1 / Math.sqrt(Math.max(0.6, sq));
        cm.body.position.y = bob;
        cm.body.rotation.z = waddle;
        cm.body.scale.set(invSq, sq, invSq);

        // Feet alternating walk cycle
        var stride = moving ? Math.sin(ch.walkPhase) * 0.22 : 0;
        cm.footL.position.z = 0.04 + stride;
        cm.footR.position.z = 0.04 - stride;
        cm.footL.position.y = 0.09 + Math.max(0, stride * 0.35);
        cm.footR.position.y = 0.09 + Math.max(0, -stride * 0.35);

        // Arms raise forward when holding food!
        if (ch.holding) {
          cm.armL.rotation.x = -1.25;
          cm.armR.rotation.x = -1.25;
        } else {
          cm.armL.rotation.x = moving ? -stride * 1.4 : Math.sin(t * 2.5 + ci) * 0.08;
          cm.armR.rotation.x = moving ? stride * 1.4 : -Math.sin(t * 2.5 + ci) * 0.08;
        }
        cm.holdSlot.set(ch.holding);

        // Blob shadow under chef
        if (shIdx < MAX_SHADOWS) {
          setInst(shadows, shIdx++, wx, 0.02, wz, 0.92, 1, 0.92, 0, 0, 0);
        }

        // Station highlight frame
        var tf = targetFrames[ci];
        if (opt.mode === 'play' && ch.targetId >= 0 && ch.targetId < stationVisuals.length) {
          var sv = stationVisuals[ch.targetId];
          tf.visible = true;
          var pScale = 1 + Math.sin(t * 8) * 0.035;
          tf.position.set(sv.cx, sv.topY + 0.06, sv.cz);
          tf.scale.set(pScale, 1, pScale);
        } else {
          tf.visible = false;
        }
      }

      // Update station props, animations, and 3D progress bars
      steamAccum += dt;
      var doSteam = steamAccum >= 0.16;
      if (doSteam) steamAccum = 0;

      var barIdx = 0;
      for (var si = 0; si < stationVisuals.length; si++) {
        var sv2 = stationVisuals[si];
        var st = sv2.st;

        if (sv2.foodSlot) {
          sv2.foodSlot.set(st.item);
          if (st.pulseT > 0) {
            var ps = 1 + Math.sin((st.pulseT / 0.22) * Math.PI) * 0.22;
            sv2.foodSlot.group.scale.set(ps, ps, ps);
          } else {
            sv2.foodSlot.group.scale.set(1, 1, 1);
          }
        }

        if (sv2.crateProp) {
          var cp = 1.16 + (st.pulseT > 0 ? Math.sin((st.pulseT / 0.22) * Math.PI) * 0.24 : 0);
          sv2.crateProp.scale.set(cp, cp, cp);
          sv2.crateProp.rotation.y = Math.sin(t * 1.8 + si) * 0.18;
        }

        if (sv2.knife) {
          if (st.active) {
            sv2.knife.position.y = sv2.topY + 0.16 + Math.abs(Math.sin(t * 24)) * 0.26;
            sv2.knife.rotation.x = Math.sin(t * 24) * 0.35;
            if (doSteam && !view.calm) {
              var col = st.item && st.item.kind === 'tomato' ? 0xff4d5a : st.item && st.item.kind === 'potato' ? 0xffe48f : 0x52d165;
              burst(st.x, st.y, { count: 2, colors: [col, 0xffffff], y: sv2.topY + 0.22, speed: 1.6, up: 2.2, life: 0.3, size: 0.11, g: 8 });
            }
          } else {
            sv2.knife.position.y = sv2.topY + 0.11;
            sv2.knife.rotation.x = 0;
          }
        }

        if (sv2.burnerGlow) {
          var cooking = st.item && (st.active || st.item.kind !== 'burnt');
          sv2.burnerGlow.visible = !!cooking;
          if (cooking) {
            var bp = 0.78 + Math.sin(t * (st.warning ? 18 : 8)) * 0.08;
            sv2.burnerGlow.scale.set(bp, bp, bp);
            if (doSteam && !view.calm) {
              var puffCol = st.warning ? [0xff7b29, 0x6b6470] : [0xffffff, 0xfff5db];
              burst(st.x, st.y, { count: st.warning ? 2 : 1, colors: puffCol, y: sv2.topY + 0.25, speed: 0.65, up: 2.1, life: 0.6, size: st.warning ? 0.18 : 0.15, g: -1.4, spread: 0.25 });
            }
          }
        }

        if (sv2.pitcher) {
          if (st.active) {
            sv2.pitcher.rotation.y = t * 14;
            sv2.pitcher.position.x = sv2.cx + Math.sin(t * 36) * 0.04;
            if (doSteam && !view.calm) {
              burst(st.x, st.y, { count: 2, colors: [0xff842b, 0xff4d79, 0xffe066], y: sv2.topY + 0.72, speed: 1.4, up: 2.4, life: 0.32, size: 0.11, g: 7 });
            }
          } else {
            sv2.pitcher.rotation.y = 0;
            sv2.pitcher.position.x = sv2.cx;
          }
          // Hide pitcher glass once finished cup is ready to grab so the juice cup shines clearly
          sv2.pitcher.visible = !(st.item && st.item.kind === 'juice' && !st.active);
        }

        if (sv2.lid) {
          sv2.lid.rotation.x = st.lidT > 0 ? -Math.sin((st.lidT / 0.45) * Math.PI) * 1.35 : 0;
        }

        if (sv2.bell && st.conveyorT > 0) {
          sv2.bell.position.y = sv2.topY + 0.03 + Math.sin((st.conveyorT / 0.85) * Math.PI * 3) * 0.08;
        } else if (sv2.bell) {
          sv2.bell.position.y = sv2.topY + 0.03;
        }

        if (sv2.convSlot) {
          if (st.conveyorItem && st.conveyorT > 0) {
            var u = 1 - st.conveyorT / 0.85;
            sv2.convSlot.set({ kind: 'plate', parts: E.RECIPES[st.conveyorItem] ? E.RECIPES[st.conveyorItem].parts : [] });
            sv2.convSlot.group.visible = true;
            sv2.convSlot.group.position.set(sv2.cx, sv2.topY + 0.06, sv2.cz + 0.25 - u * 1.15);
          } else {
            sv2.convSlot.group.visible = false;
          }
        }

        // Floating 3D progress bar above active chop / stove / juicer / burning stove
        var showBar = false, barVal = 0, barHex = 0x3ddc84, showWarn = false;
        if (st.active && (st.kind === 'chop' || st.kind === 'stove' || st.kind === 'juicer')) {
          showBar = true;
          barVal = Math.max(0.05, Math.min(1, st.progress));
          barHex = st.kind === 'juicer' ? 0xff70a6 : 0x3ddc84;
        } else if (st.kind === 'stove' && st.item && !st.active && st.item.kind !== 'burnt') {
          showBar = true;
          barVal = Math.max(0.05, Math.min(1, 1 - st.burnProgress));
          barHex = st.warning ? (Math.sin(t * 20) > 0 ? 0xff3b47 : 0xffbe0b) : 0xffcf2e;
          showWarn = st.warning;
        }
        if (showBar && barIdx < MAX_BARS) {
          var bpObj = barPool[barIdx++];
          bpObj.group.visible = true;
          bpObj.group.position.set(sv2.cx, sv2.topY + 0.96, sv2.cz);
          bpObj.group.lookAt(camera.position);
          var wFill = 0.86 * barVal;
          bpObj.fill.scale.x = wFill;
          bpObj.fill.position.x = -(0.86 - wFill) * 0.5;
          bpObj.fillMat.color.setHex(barHex);
          bpObj.warn.visible = showWarn;
          if (showWarn) bpObj.warn.position.y = 0.36 + Math.abs(Math.sin(t * 14)) * 0.14;
        }
      }
      for (; barIdx < MAX_BARS; barIdx++) barPool[barIdx].group.visible = false;

      // Ghost hint arrow above suggested station
      if (opt.hintStation && opt.mode === 'play') {
        hintArrow.visible = true;
        var hcx = toWorldX(opt.hintStation.x), hcz = toWorldZ(opt.hintStation.y);
        hintArrow.position.set(hcx, 1.55 + Math.sin(t * 6.5) * 0.22, hcz);
        hintArrow.rotation.y = t * 2.5;
      } else {
        hintArrow.visible = false;
      }

      // Finalize shadows
      shadows.count = shIdx;
      shadows.instanceMatrix.needsUpdate = true;

      // Step & render instanced particles
      var ptIdx = 0;
      for (var p = 0; p < MAX_PART; p++) {
        var pt = parts[p];
        if (pt.life <= 0) continue;
        pt.life -= dt;
        if (pt.life <= 0) continue;
        pt.vy -= pt.g * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        var s = pt.size * Math.max(0.08, pt.life / pt.max);
        setInst(partInst, ptIdx, pt.x, pt.y, pt.z, s, s, s, t * 4 + p, t * 3, 0);
        partInst.setColorAt(ptIdx, C.setHex(pt.color));
        ptIdx++;
      }
      partInst.count = ptIdx;
      partInst.instanceMatrix.needsUpdate = true;
      if (partInst.instanceColor) partInst.instanceColor.needsUpdate = true;
    }

    /* ---------------------------------------------------- software WebGL pacing */
    var pace = Kit.webgl.pacer(renderer, { software: software });

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      calm: false,
      software: software,
      burst: burst,
      shake: addShake,
      sync: sync,
      mayDraw: pace.mayDraw,
      render: function () {
        renderer.render(scene, camera);
        pace.markDrawn();
      },
      resize: function (w, h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      },
      prepare: function (done) {
        try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
        done();
      },
      whenDrawn: pace.whenDrawn,
      dispose: function () { pace.dispose(); clearLevelVisuals(); renderer.dispose(); }
    };

    return view;
  }

  window.RecessArt = { createView: createView };
})();

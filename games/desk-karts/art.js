/* Desk Karts 3D (سباق المكاتب) — Three.js 3D sunlit school-desk renderer.
 * Merged static desk/track/stationery geometry, procedural desk-mat textures,
 * 4 chunky 3D toy kart bodies with spinning/turning wheels & bobbing helmets,
 * drift sparks, turbo flames, shield bubble, pooled InstancedMesh coins/shadows/particles,
 * elevated overhead chase camera (1P) & framing zoom camera (2P), and software WebGL pacing. */
(function () {
  'use strict';

  function createView(canvas) {
    var T = window.THREE;
    var E = window.DeskKartsEngine;
    if (!T) throw new Error('three.js unavailable');

    var wgl = Kit.webgl.createRenderer(canvas, { srgb: true, softRatio: 1, max: 1.75, antialias: true });
    var software = wgl.software, renderer = wgl.renderer;

    var scene = new T.Scene();
    var skyColor = new T.Color(0x9bdcff);
    scene.background = skyColor;
    scene.fog = new T.Fog(0xd8f0ff, 145, 340);

    var camera = new T.PerspectiveCamera(60, 16 / 9, 0.5, 360);
    var camera2 = new T.PerspectiveCamera(66, 8 / 9, 0.5, 360);
    camera.position.set(0, 6.2, 12);
    camera.lookAt(0, 1.5, 0);

    // Bright sunny classroom lighting (warm sunlight + sky hemisphere + warm bounce fill)
    var hemi = new T.HemisphereLight(0xfffdf0, 0xa8c8dc, 1.48);
    var sun = new T.DirectionalLight(0xfff5db, 1.85);
    sun.position.set(28, 56, 34);
    var fill = new T.DirectionalLight(0xffe9c7, 0.95);
    fill.position.set(-34, 28, -26);
    scene.add(hemi, sun, fill);

    // Reusable scratch math objects (zero per-frame GC allocations)
    var C = new T.Color();
    var M4 = new T.Matrix4();
    var Q = new T.Quaternion();
    var EU = new T.Euler();
    var V1 = new T.Vector3();
    var S1 = new T.Vector3();

    var MAT_LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_GLOW = new T.MeshBasicMaterial({ vertexColors: true });
    var MAT_INK = new T.MeshPhongMaterial({ color: 0x2c1d6b, specular: 0x99aaff, shininess: 95 });
    var MAT_INK_HILITE = new T.MeshBasicMaterial({ color: 0xd9e8ff });

    /* ---------------------------------------------------- Oriented Box Mesh Merger */
    // Adds oriented boxes into dynamic arrays for single-draw static geometry.
    // Box item: [cx, cy, cz, w, h, d, ry, rz, hex, glow]
    function buildOrientedBoxes(items) {
      var lit = [], glow = [];
      for (var i = 0; i < items.length; i++) (items[i][9] ? glow : lit).push(items[i]);
      var all = lit.concat(glow);
      var vertCount = all.length * 36;
      var pos = new Float32Array(vertCount * 3);
      var nor = new Float32Array(vertCount * 3);
      var col = new Float32Array(vertCount * 3);
      var o = 0;

      // Unit box face templates: 6 faces * 4 corners + normal
      var faces = [
        { n: [ 1,  0,  0], v: [[ 0.5, -0.5,  0.5], [ 0.5, -0.5, -0.5], [ 0.5,  0.5, -0.5], [ 0.5,  0.5,  0.5]] },
        { n: [-1,  0,  0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5,  0.5], [-0.5,  0.5,  0.5], [-0.5,  0.5, -0.5]] },
        { n: [ 0,  1,  0], v: [[-0.5,  0.5,  0.5], [ 0.5,  0.5,  0.5], [ 0.5,  0.5, -0.5], [-0.5,  0.5, -0.5]] },
        { n: [ 0, -1,  0], v: [[-0.5, -0.5, -0.5], [ 0.5, -0.5, -0.5], [ 0.5, -0.5,  0.5], [-0.5, -0.5,  0.5]] },
        { n: [ 0,  0,  1], v: [[-0.5, -0.5,  0.5], [ 0.5, -0.5,  0.5], [ 0.5,  0.5,  0.5], [-0.5,  0.5,  0.5]] },
        { n: [ 0,  0, -1], v: [[ 0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5,  0.5, -0.5], [ 0.5,  0.5, -0.5]] }
      ];
      var idx6 = [0, 1, 2, 0, 2, 3];

      for (i = 0; i < all.length; i++) {
        var b = all[i];
        var cx = b[0], cy = b[1], cz = b[2];
        var w = b[3], h = b[4], d = b[5];
        var ry = b[6] || 0, rz = b[7] || 0;
        C.setHex(b[8]);
        var cr = C.r, cg = C.g, cb = C.b;
        var cyc = Math.cos(ry), cys = Math.sin(ry);
        var czc = Math.cos(rz), czs = Math.sin(rz);

        for (var f = 0; f < 6; f++) {
          var fc = faces[f];
          // Rotate normal by rz then ry
          var nx0 = fc.n[0] * czc - fc.n[1] * czs;
          var ny0 = fc.n[0] * czs + fc.n[1] * czc;
          var nz0 = fc.n[2];
          var nx = nx0 * cyc + nz0 * cys;
          var ny = ny0;
          var nz = -nx0 * cys + nz0 * cyc;

          for (var k = 0; k < 6; k++) {
            var pt = fc.v[idx6[k]];
            var lx = pt[0] * w, ly = pt[1] * h, lz = pt[2] * d;
            var rx = lx * czc - ly * czs;
            var ry2 = lx * czs + ly * czc;
            var px = rx * cyc + lz * cys + cx;
            var py = ry2 + cy;
            var pz = -rx * cys + lz * cyc + cz;
            pos[o] = px; pos[o + 1] = py; pos[o + 2] = pz;
            nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
            col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
            o += 3;
          }
        }
      }

      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      var split = lit.length * 36;
      geo.addGroup(0, split, 0);
      geo.addGroup(split, vertCount - split, 1);
      geo.computeBoundingSphere();
      return geo;
    }

    /* ---------------------------------------------------- Procedural Desk Texture */
    function makeDeskTexture(L) {
      var c = document.createElement('canvas');
      c.width = 512;
      c.height = 512;
      var ctx = c.getContext('2d');

      // Warm woodgrain desk background
      C.setHex(L.deskColor);
      ctx.fillStyle = '#' + C.getHexString();
      ctx.fillRect(0, 0, 512, 512);

      // Subtle wood plank seams & warm streaks
      for (var y = 0; y < 512; y += 64) {
        ctx.fillStyle = 'rgba(70, 35, 10, 0.10)';
        ctx.fillRect(0, y, 512, 3);
        ctx.fillStyle = 'rgba(255, 240, 210, 0.10)';
        ctx.fillRect(0, y + 3, 512, 5);
      }
      for (var i = 0; i < 42; i++) {
        var gy = ((i * 37) % 512);
        ctx.fillStyle = i % 2 ? 'rgba(90, 45, 12, 0.07)' : 'rgba(255, 244, 215, 0.08)';
        ctx.fillRect(0, gy, 512, 4 + (i % 5));
      }

      // Centered school desk mat / giant notebook sheet
      var mx = 42, my = 54, mw = 428, mh = 404;
      ctx.fillStyle = 'rgba(40, 22, 8, 0.22)';
      ctx.fillRect(mx + 7, my + 9, mw, mh);

      C.setHex(L.matColor);
      ctx.fillStyle = '#' + C.getHexString();
      ctx.fillRect(mx, my, mw, mh);

      // Mat border & grid / notebook lines by theme
      ctx.strokeStyle = (L.theme === 'math' || L.theme === 'library') ? 'rgba(72, 138, 220, 0.32)' : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.6;
      var step = L.theme === 'math' ? 20 : 28;
      for (var gx = mx + step; gx < mx + mw; gx += step) {
        ctx.beginPath(); ctx.moveTo(gx, my); ctx.lineTo(gx, my + mh); ctx.stroke();
      }
      for (var gy2 = my + step; gy2 < my + mh; gy2 += step) {
        ctx.beginPath(); ctx.moveTo(mx, gy2); ctx.lineTo(mx + mw, gy2); ctx.stroke();
      }
      if (L.theme === 'math') {
        // Red notebook margin line + classic notebook binder holes
        ctx.strokeStyle = 'rgba(255, 86, 86, 0.52)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(mx + 44, my); ctx.lineTo(mx + 44, my + mh); ctx.stroke();
        ctx.fillStyle = 'rgba(130, 90, 48, 0.35)';
        for (var bh = 0; bh < 3; bh++) {
          ctx.beginPath(); ctx.arc(mx + 22, my + 82 + bh * 120, 7, 0, 6.283); ctx.fill();
        }
      }
      // Crisp mat frame border
      ctx.strokeStyle = L.theme === 'principal' ? '#ffd54f' : 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 4;
      ctx.strokeRect(mx + 6, my + 6, mw - 12, mh - 12);

      var tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace || tex.colorSpace;
      tex.anisotropy = software ? 2 : 4;
      return tex;
    }

    /* ---------------------------------------------------- Sunlit Classroom Diorama */
    function mkTex(w, h, fn) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      fn(c.getContext('2d'));
      var tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace || tex.colorSpace;
      return tex;
    }

    var QUESTION_TEX = mkTex(128, 128, function (g) {
      var gr = g.createLinearGradient(0, 0, 128, 128);
      gr.addColorStop(0, '#ffe85c'); gr.addColorStop(0.55, '#ffb703'); gr.addColorStop(1, '#f48c06');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#fff9db'; g.lineWidth = 8; g.strokeRect(8, 8, 112, 112);
      g.strokeStyle = '#7c3a00'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
      g.font = '800 84px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#222842'; g.strokeText('?', 64, 68);
      g.fillStyle = '#fff'; g.fillText('?', 64, 68);
    });

    var CHALK_TEX = mkTex(512, 256, function (g) {
      var bg = g.createLinearGradient(0, 0, 0, 256);
      bg.addColorStop(0, '#235e46'); bg.addColorStop(1, '#184231');
      g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
      g.font = '700 42px Fredoka, sans-serif'; g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,.78)'; g.fillText('2 + 3 = 5', 120, 96);
      g.fillStyle = 'rgba(255,232,120,.82)'; g.fillText('★  ★  ★', 265, 198);
      g.fillStyle = 'rgba(138,224,255,.78)'; g.fillText('A + B', 392, 96);
      g.strokeStyle = 'rgba(255,240,180,.58)'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(258, 102, 58, 30, 0, 0, 6.283); g.stroke();
    });

    var roomPaperPlanes = [];
    (function buildClassroomPanorama() {
      var rb = [], W = 0xfff8e2, WN = 0xd99e5b, TR = 0xfffdf5, SK = 0x7fd4ff;
      var BC = [0xff5252, 0x2979ff, 0x2ecc71, 0xffca28, 0x9b51ff, 0xff7043];
      function P(x, y, z, w, h, d, c, gl, rz) { rb.push([x, y, z, w, h, d, 0, rz || 0, c, gl || 0]); }

      // 4 sunlit classroom walls + warm wood wainscot + cream molding
      [[0, -112, 260, 4], [0, 112, 260, 4], [-126, 0, 4, 228], [126, 0, 4, 228]].forEach(function (a) {
        P(a[0], 20, a[1], a[2], 82, a[3], W);
        P(a[0], -8, a[1], a[2] === 4 ? 4.8 : a[2], 22, a[3] === 4 ? 4.8 : a[3], WN);
        P(a[0], 3.2, a[1], a[2] === 4 ? 5.6 : a[2], 2.2, a[3] === 4 ? 5.6 : a[3], TR);
      });

      // Panoramic sunlit classroom windows with clouds & green trees on all 4 walls
      [[-82,-109,44,30,0],[82,-109,44,30,0],[-123,-44,54,32,1],[-123,44,54,32,1],[123,-44,54,32,1],[123,44,54,32,1],[-62,109,52,30,0],[62,109,52,30,0]].forEach(function (u) {
        var x = u[0], z = u[1], w = u[2], h = u[3], az = u[4], ox = az ? (x < 0 ? 0.5 : -0.5) : 0, oz = az ? 0 : (z < 0 ? 0.5 : -0.5);
        P(x, 25, z, az ? 1.6 : w, h, az ? w : 1.6, SK, 1);
        P(x + ox - (az ? 0 : w * 0.2), 25 + h * 0.16, z + oz - (az ? w * 0.18 : 0), az ? 0.9 : w * 0.34, h * 0.16, az ? w * 0.34 : 0.9, 0xffffff, 1);
        P(x + ox + (az ? 0 : w * 0.22), 25 + h * 0.26, z + oz + (az ? w * 0.2 : 0), az ? 0.9 : w * 0.26, h * 0.13, az ? w * 0.26 : 0.9, 0xffffff, 1);
        P(x + ox, 25 - h * 0.34, z + oz, az ? 0.9 : w * 0.92, h * 0.28, az ? w * 0.92 : 0.9, 0x45c466, 1);
        P(x, 25 + h * 0.5, z, az ? 2.6 : w + 2.4, 2.4, az ? w + 2.4 : 2.6, TR);
        P(x, 25 - h * 0.5, z, az ? 3.2 : w + 3.4, 2.8, az ? w + 3.4 : 3.2, TR);
        P(x, 25, z, az ? 2.2 : w, 1.5, az ? w : 2.2, TR);
        P(x, 25, z, az ? 2.2 : 1.5, h, az ? 1.5 : 2.2, TR);
      });

      // North chalkboard oak frame & ledge
      P(0, 24, -109.2, 74, 34, 2, 0xb8753a); P(0, 7.2, -107.6, 76, 2.2, 4.2, 0xc98648);
      P(-14, 8.8, -106.8, 5, 1, 1.2, 0xffffff); P(-4, 8.8, -106.8, 4.5, 1, 1.2, 0xffe066);

      // Colorful pennant bunting
      for (var i = 0; i < 14; i++) {
        var px = -104 + i * 16, y = 47 - Math.sin((i / 13) * Math.PI) * 5.5, t = i % 2 ? 0.12 : -0.12;
        P(px, y, -108, 6.2, 7.2, 0.8, BC[i % 5], 1, t); P(px, y, 108, 6.2, 7.2, 0.8, BC[(i + 2) % 5], 1, t);
      }

      // South bookshelf + East/West cork bulletin boards
      P(0, 18, 108.5, 42, 36, 6, 0xb5763e);
      for (var sh = 0; sh < 3; sh++) {
        var sy = 6 + sh * 11; P(0, sy, 106.5, 40, 1.4, 5, WN);
        for (var bk = 0; bk < 8; bk++) P(-16 + bk * 4.5, sy + 4.4, 106.8, 3.4, 6.8 + (bk % 3) * 1.1, 4.2, BC[(bk + sh * 2) % 6]);
      }
      for (var s = -1; s <= 1; s += 2) {
        var bx = s * 123.5;
        P(bx, 22, 0, 2.2, 24, 30, 0xb8753a); P(bx - s * 0.8, 22, 0, 1.2, 21, 27, 0xdba05c);
        P(bx - s * 1.4, 25, -7, 0.6, 8, 7, 0xfff48f, 1); P(bx - s * 1.4, 24, 5, 0.6, 9, 8, 0x9be7ff, 1); P(bx - s * 1.4, 15, -1, 0.6, 7, 9, 0xffa8c8, 1);
      }

      scene.add(new T.Mesh(buildOrientedBoxes(rb), [MAT_LIT, MAT_GLOW]));
      var cb = new T.Mesh(new T.PlaneGeometry(70, 30), new T.MeshBasicMaterial({ map: CHALK_TEX }));
      cb.position.set(0, 24, -108); scene.add(cb);
    })();

    /* ---------------------------------------------------- 3D Track Ribbon Mesh */
    function buildTrackRibbon(L) {
      var S = L.samples;
      var N = S.length;
      var hw = L.hw;
      // 7 lateral strips per segment: left curb, left edge line, road left, center dash, road right, right edge line, right curb
      var strips = [
        [-hw - 0.15, -hw + 0.55, 'curb'],
        [-hw + 0.55, -hw + 0.82, 'edge'],
        [-hw + 0.82, -0.22,      'road'],
        [-0.22,       0.22,      'dash'],
        [ 0.22,       hw - 0.82, 'road'],
        [ hw - 0.82,  hw - 0.55, 'edge'],
        [ hw - 0.55,  hw + 0.15, 'curb']
      ];
      var quadCount = N * strips.length;
      var pos = new Float32Array(quadCount * 18);
      var nor = new Float32Array(quadCount * 18);
      var col = new Float32Array(quadCount * 18);
      var o = 0;

      var cRoadA = new T.Color(L.roadColor).multiplyScalar(0.84);
      var cRoadB = cRoadA.clone().multiplyScalar(0.94);
      var cCurbA = new T.Color(L.curbA);
      var cCurbB = new T.Color(L.curbB);
      var cWhite = new T.Color(0xffffff);
      var cDark = new T.Color(0x222638);
      var cDash = new T.Color(0xfff59d);

      function pushQuad(ax, az, bx, bz, cx, cz, dx, dz, y, colorObj) {
        var r = colorObj.r, g = colorObj.g, b = colorObj.b;
        var pts = [ax, y, az, bx, y, bz, cx, y, cz, ax, y, az, cx, y, cz, dx, y, dz];
        for (var p = 0; p < 18; p += 3) {
          pos[o] = pts[p]; pos[o + 1] = pts[p + 1]; pos[o + 2] = pts[p + 2];
          nor[o] = 0; nor[o + 1] = 1; nor[o + 2] = 0;
          col[o] = r; col[o + 1] = g; col[o + 2] = b;
          o += 3;
        }
      }

      for (var i = 0; i < N; i++) {
        var a = S[i], b = S[(i + 1) % N];
        var isStartBand = (i === 0 || i === 1 || i === N - 1);
        var curbCol = (Math.floor(i / 2) % 2 === 0) ? cCurbA : cCurbB;
        var roadCol = (Math.floor(i / 4) % 2 === 0) ? cRoadA : cRoadB;
        var dashOn = (Math.floor(i / 2) % 2 === 0);

        for (var st = 0; st < strips.length; st++) {
          var l0 = strips[st][0], l1 = strips[st][1], kind = strips[st][2];
          var cc = roadCol;
          var y = 0.055;
          if (kind === 'curb') { cc = curbCol; y = 0.07; }
          else if (kind === 'edge') { cc = cWhite; y = 0.065; }
          else if (kind === 'dash') { cc = dashOn ? cDash : roadCol; y = 0.062; }

          if (isStartBand && kind !== 'curb') {
            var checker = ((i + st) % 2 === 0);
            cc = checker ? cWhite : cDark;
            y = 0.078;
          }

          var ax = a.x + a.nx * l0, az = a.z + a.nz * l0;
          var bx = a.x + a.nx * l1, bz = a.z + a.nz * l1;
          var cx = b.x + b.nx * l1, cz = b.z + b.nz * l1;
          var dx = b.x + b.nx * l0, dz = b.z + b.nz * l0;
          pushQuad(ax, az, bx, bz, cx, cz, dx, dz, y, cc);
        }
      }

      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      return new T.Mesh(geo, MAT_LIT);
    }

    /* ---------------------------------------------------- Stationery Barriers & Giant Props */
    function isClearOfTrack(L, x, z, pad) {
      var minD = L.hw + pad;
      var minD2 = minD * minD;
      for (var i = 0; i < L.samples.length; i += 2) {
        var dx = x - L.samples[i].x, dz = z - L.samples[i].z;
        if (dx * dx + dz * dz < minD2) return false;
      }
      return true;
    }

    function addPencilBarrier(boxes, cx, cz, ry, len, isRuler) {
      if (isRuler) {
        // Warm wooden ruler with crisp millimeter ticks
        boxes.push([cx, 0.42, cz, len, 0.84, 0.92, ry, 0, 0xe8b566, 0]);
        boxes.push([cx, 0.86, cz, len * 0.96, 0.08, 0.14, ry, 0, 0x8f5928, 0]);
        var cosR = Math.cos(ry), sinR = Math.sin(ry);
        for (var t = -len * 0.4; t <= len * 0.4 + 0.01; t += len * 0.2) {
          boxes.push([cx + cosR * t, 0.87, cz - sinR * t, 0.14, 0.06, 0.48, ry, 0, 0x4b2f18, 0]);
        }
      } else {
        // Classic chunky yellow #2 pencil with pink eraser, silver band & sharpened graphite tip
        var bodyLen = len * 0.72;
        var cosP = Math.cos(ry), sinP = Math.sin(ry);
        boxes.push([cx, 0.46, cz, bodyLen, 0.90, 0.90, ry, 0, 0xffca28, 0]);
        boxes.push([cx, 0.92, cz, bodyLen * 0.98, 0.08, 0.36, ry, 0, 0xffe066, 0]);
        // Silver ferrule + pink eraser at tail (-x in local)
        var tail = -(bodyLen * 0.5 + len * 0.06);
        boxes.push([cx + cosP * tail, 0.46, cz - sinP * tail, len * 0.11, 0.92, 0.92, ry, 0, 0xd4dbe6, 0]);
        var erPos = -(bodyLen * 0.5 + len * 0.17);
        boxes.push([cx + cosP * erPos, 0.46, cz - sinP * erPos, len * 0.14, 0.88, 0.88, ry, 0, 0xff7ea6, 0]);
        // Sharpened wood cone + dark graphite tip at nose (+x in local)
        var woodPos = bodyLen * 0.5 + len * 0.08;
        boxes.push([cx + cosP * woodPos, 0.46, cz - sinP * woodPos, len * 0.16, 0.64, 0.64, ry, 0, 0xf2cfa0, 0]);
        var tipPos = bodyLen * 0.5 + len * 0.19;
        boxes.push([cx + cosP * tipPos, 0.46, cz - sinP * tipPos, len * 0.10, 0.34, 0.34, ry, 0, 0x2c3040, 0]);
      }
    }

    function addGiantProps(boxes, L) {
      // 1) Checkered Start/Finish Gantry at s = 0
      var sp0 = L.samples[0];
      var ry0 = -Math.atan2(sp0.tz, sp0.tx);
      var span = L.hw + 1.55;
      var lx = sp0.x - sp0.nx * span, lz = sp0.z - sp0.nz * span;
      var rx = sp0.x + sp0.nx * span, rz = sp0.z + sp0.nz * span;
      // Standing giant pencil pillars left & right
      var pColors = [0xff5252, 0x22a7ff];
      var pillars = [[lx, lz, pColors[0]], [rx, rz, pColors[1]]];
      for (var p = 0; p < 2; p++) {
        var px = pillars[p][0], pz = pillars[p][1], pc = pillars[p][2];
        boxes.push([px, 0.35, pz, 1.9, 0.7, 1.9, ry0, 0, 0x3b425c, 0]);
        boxes.push([px, 5.2, pz, 1.35, 9.0, 1.35, ry0, 0, pc, 0]);
        boxes.push([px, 10.0, pz, 1.42, 0.65, 1.42, ry0, 0, 0xd8dfe8, 0]);
        boxes.push([px, 10.65, pz, 1.32, 0.75, 1.32, ry0, 0, 0xff85ad, 0]);
      }
      // Overhead checkered beam raised high so low chase camera sweeps cleanly underneath!
      var innerSpan = span - 0.85;
      var tiles = 10;
      var tileW = (innerSpan * 2) / tiles;
      for (var ti = 0; ti < tiles; ti++) {
        var off = -innerSpan + (ti + 0.5) * tileW;
        var tx = sp0.x + sp0.nx * off, tz = sp0.z + sp0.nz * off;
        boxes.push([tx, 9.48, tz, 1.38, 0.56, tileW * 0.99, ry0, 0, ti % 2 === 0 ? 0xffffff : 0x1e2235, 0]);
        boxes.push([tx, 8.92, tz, 1.38, 0.56, tileW * 0.99, ry0, 0, ti % 2 === 1 ? 0xffffff : 0x1e2235, 0]);
      }
      boxes.push([sp0.x, 9.84, sp0.z, 1.50, 0.18, innerSpan * 2 + 0.2, ry0, 0, 0xffca28, 0]);
      boxes.push([sp0.x, 8.56, sp0.z, 1.50, 0.18, innerSpan * 2 + 0.2, ry0, 0, 0xffca28, 0]);
      // Glowing green start lamps on gantry
      for (var li = -1; li <= 1; li++) {
        var lx2 = sp0.x + sp0.nx * (li * 2.2), lz2 = sp0.z + sp0.nz * (li * 2.2);
        boxes.push([lx2, 10.25, lz2, 0.85, 0.65, 0.85, ry0, 0, 0x22283d, 0]);
        boxes.push([lx2, 10.25, lz2, 0.96, 0.42, 0.55, ry0, 0, 0x38ff7a, 1]);
      }

      // 2) Stacked Textbooks Jump Ramps along L.ramps
      var bookPal = [0xff5252, 0x2979ff, 0x2ecc71, 0xff9f1c];
      for (var r = 0; r < L.ramps.length; r++) {
        var rm = L.ramps[r];
        var ryR = -rm.ang;
        var bw = rm.halfW * 1.9;
        var colCover = bookPal[(r + L.index) % bookPal.length];
        // Stepped wedge stacked books forming a super readable ramp!
        boxes.push([rm.x - rm.tx * 1.3, 0.22, rm.z - rm.tz * 1.3, 1.8, 0.36, bw, ryR, 0.16, colCover, 0]);
        boxes.push([rm.x,               0.52, rm.z,               2.6, 0.48, bw, ryR, 0.20, 0xfff8e6, 0]);
        boxes.push([rm.x + rm.tx * 1.2, 0.86, rm.z + rm.tz * 1.2, 2.2, 0.62, bw * 0.96, ryR, 0.20, colCover, 0]);
        // Bright glowing gold chevron bars on ramp face
        boxes.push([rm.x,               0.82, rm.z,               0.55, 0.10, bw * 0.72, ryR, 0.20, 0xffe600, 1]);
        boxes.push([rm.x + rm.tx * 1.3, 1.24, rm.z + rm.tz * 1.3, 0.55, 0.10, bw * 0.72, ryR, 0.20, 0xffe600, 1]);
      }

      // 3) Giant Stationery Props around desk perimeter & safe infield islands (0=books,1=cup,2=tape,3=crayons,4=notes)
      var cands = [[0,4,0],[-16,4,1],[18,4,2],[0,-2,3],[-58,-26,1],[58,-26,0],[-58,28,2],[58,28,3],[0,-42,0],[-32,-40,4],[32,-40,1],[-56,2,4],[60,2,4],[0,44,3],[-34,42,0],[36,42,2],[-72,-50,0],[72,-50,1],[-74,48,1],[74,48,0],[0,-56,1]];
      for (var c = 0; c < cands.length; c++) {
        var x = cands[c][0], z = cands[c][1], knd = cands[c][2];
        if (!isClearOfTrack(L, x, z, 5.2)) continue;
        if (knd === 1) {
          var cupCol = L.theme === 'principal' ? 0xffc400 : (L.theme === 'art' ? 0xff5a7c : 0x29b6f6);
          boxes.push([x, 3.2, z, 6.2, 6.4, 6.2, 0.25, 0, cupCol, 0], [x, 3.4, z, 6.45, 1.3, 6.45, 0.25, 0, 0xffffff, 0], [x, 6.3, z, 5.4, 0.4, 5.4, 0.25, 0, 0x263147, 0],
            [x - 1.2, 8.6, z - 0.8, 1, 7.6, 1, 0.1, 0.18, 0xffca28, 0], [x - 1.8, 12.6, z - 0.8, 0.7, 1.4, 0.7, 0.1, 0.18, 0xf2cfa0, 0],
            [x + 1.1, 8.2, z + 0.9, 1, 7.2, 1, 0.3, -0.22, 0xff4252, 0], [x + 0.2, 8.8, z - 1.2, 1, 8, 1, -0.2, 0.08, 0x28d96c, 0]);
        } else if (knd === 0) {
          boxes.push([x, 1.2, z, 11, 2.4, 8.2, 0.18, 0, 0x3b82f6, 0], [x + 0.3, 1.2, z, 10.2, 1.9, 7.7, 0.18, 0, 0xfff8e6, 0],
            [x - 0.4, 3.4, z + 0.2, 9.6, 2, 7.4, -0.14, 0, 0xff5252, 0], [x - 0.1, 3.4, z + 0.2, 8.8, 1.5, 6.9, -0.14, 0, 0xfffaf0, 0],
            [x + 0.2, 5.1, z - 0.2, 8.2, 1.5, 6.2, 0.32, 0, 0x2ecc71, 0]);
        } else if (knd === 2) {
          for (var s = 0; s < 12; s++) {
            var a = (s / 12) * Math.PI * 2;
            boxes.push([x + Math.cos(a) * 3.4, 1.5, z + Math.sin(a) * 3.4, 1.7, 3, 2.25, -a, 0, 0xfff1c9, 0], [x + Math.cos(a) * 2.25, 1.5, z + Math.sin(a) * 2.25, 0.72, 3.12, 1.55, -a, 0, 0xc87d3b, 0]);
          }
        } else if (knd === 3) {
          var cHex = [0xff4252, 0xff9f1c, 0x28d96c, 0x22a7ff, 0x9b51ff], sc2 = Math.sin(0.12), cc2 = Math.cos(0.12);
          for (var cr = 0; cr < 5; cr++) {
            var ox = (cr - 2) * 1.48, bx = x + ox * cc2, bz = z - ox * sc2;
            boxes.push([bx, 0.65, bz, 1.15, 1.15, 6.8, 0.12, 0, cHex[cr], 0], [bx, 0.68, bz, 1.24, 1.22, 2.4, 0.12, 0, 0x22283c, 0], [bx + sc2 * 3.9, 0.62, bz + cc2 * 3.9, 0.68, 0.68, 1.25, 0.12, 0, cHex[cr], 0]);
          }
        } else {
          boxes.push([x, 0.65, z, 6.8, 1.3, 6.8, 0.22, 0, 0xfff059, 0], [x + 0.4, 1.45, z - 0.2, 6.6, 0.35, 6.6, 0.32, 0, 0xff80ab, 0], [x - 0.8, 1.72, z + 0.6, 3.8, 0.22, 1.2, 0.7, 0, 0xdce4f0, 0]);
        }
      }

      // Principal's desk golden trophy in the north backdrop
      if (L.theme === 'principal' && isClearOfTrack(L, 0, -40, 4.5)) {
        boxes.push([0, 1.0, -40, 5.4, 2.0, 5.4, 0, 0, 0x3b2416, 0]);
        boxes.push([0, 3.2, -40, 2.0, 2.6, 2.0, 0, 0, 0xffca28, 0]);
        boxes.push([0, 6.2, -40, 5.2, 3.8, 5.2, 0, 0, 0xffd54f, 0]);
        boxes.push([-3.4, 6.2, -40, 1.6, 2.6, 1.0, 0, 0, 0xffb300, 0]);
        boxes.push([ 3.4, 6.2, -40, 1.6, 2.6, 1.0, 0, 0, 0xffb300, 0]);
      }
    }

    function buildTrackStaticMesh(L) {
      var boxes = [];
      var S = L.samples;
      var N = S.length;
      var step = 5; // Place pencil/ruler barrier every 5 spline samples (~5.5..6.8 units)
      for (var i = 0; i < N; i += step) {
        var a = S[i];
        var b = S[(i + step) % N];
        var mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
        var dx = b.x - a.x, dz = b.z - a.z;
        var segLen = Math.hypot(dx, dz);
        var ry = -Math.atan2(dz, dx);
        var nx = -dz / (segLen || 1), nz = dx / (segLen || 1);
        var isRuler = ((i / step) % 3 === 1);

        // Outer & inner barriers at ±(hw + 0.72)
        var wallOff = L.hw + 0.72;
        var ox = mx + nx * wallOff, oz = mz + nz * wallOff;
        var ix = mx - nx * wallOff, iz = mz - nz * wallOff;
        // Adjust inner/outer segment length slightly for curvature so barriers stay tight without overlaps
        addPencilBarrier(boxes, ox, oz, ry, segLen * 0.94, isRuler);
        addPencilBarrier(boxes, ix, iz, ry, segLen * 0.90, !isRuler);
      }
      addGiantProps(boxes, L);
      return new T.Mesh(buildOrientedBoxes(boxes), [MAT_LIT, MAT_GLOW]);
    }

    /* ---------------------------------------------------- Dynamic World Containers */
    var trackGroup = new T.Group();
    scene.add(trackGroup);
    var deskTex = null;
    var activeTrackIdx = -1;

    var eraserMeshes = [];
    var boostMeshes = [];
    var boxMeshes = [];
    var inkPool = [];

    // Shared geometries for dynamic props
    var GEO_WHEEL = new T.CylinderGeometry(0.46, 0.46, 0.36, 12);
    GEO_WHEEL.rotateX(Math.PI * 0.5);
    var GEO_HUB = new T.CylinderGeometry(0.24, 0.24, 0.39, 8);
    GEO_HUB.rotateX(Math.PI * 0.5);
    var GEO_HELMET = new T.SphereGeometry(0.56, 12, 10);
    var GEO_EYE = new T.SphereGeometry(0.11, 8, 6);
    var GEO_PUPIL = new T.SphereGeometry(0.06, 6, 6);
    var GEO_FLAME = new T.ConeGeometry(0.32, 1.35, 8);
    GEO_FLAME.rotateZ(Math.PI * 0.5);
    var GEO_SHIELD = new T.SphereGeometry(1.78, 14, 10);
    var GEO_COIN = new T.CylinderGeometry(0.62, 0.62, 0.20, 10);
    GEO_COIN.rotateX(Math.PI * 0.5);
    var GEO_SHADOW = new T.CircleGeometry(1, 14);
    GEO_SHADOW.rotateX(-Math.PI * 0.5);
    var GEO_PART = new T.BoxGeometry(1, 1, 1);
    var GEO_BOX = new T.BoxGeometry(1.45, 1.45, 1.45);
    var GEO_INK_MAIN = new T.CylinderGeometry(1.0, 1.05, 0.06, 14);
    var GEO_INK_DROP = new T.CylinderGeometry(0.42, 0.44, 0.055, 10);

    // Pooled InstancedMeshes: Coins, Blob Shadows, Particles
    var MAX_COINS = 40;
    var coinMat = new T.MeshLambertMaterial({ color: 0xffd52b, emissive: 0x553b00 });
    var coinInst = new T.InstancedMesh(GEO_COIN, coinMat, MAX_COINS);
    coinInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    coinInst.frustumCulled = false;
    scene.add(coinInst);

    var MAX_SHADOWS = 72;
    var shadowMat = new T.MeshBasicMaterial({ color: 0x161c2e, transparent: true, opacity: 0.32, depthWrite: false });
    var shadowInst = new T.InstancedMesh(GEO_SHADOW, shadowMat, MAX_SHADOWS);
    shadowInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    shadowInst.frustumCulled = false;
    scene.add(shadowInst);

    var MAX_PARTS = 180;
    var partMat = new T.MeshBasicMaterial({ color: 0xffffff });
    var partInst = new T.InstancedMesh(GEO_PART, partMat, MAX_PARTS);
    partInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    partInst.frustumCulled = false;
    scene.add(partInst);

    var parts = [];
    for (var pi = 0; pi < MAX_PARTS; pi++) {
      parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 14, size: 0.3, color: 0xffffff });
    }
    var partCursor = 0;

    function spawnPart(x, y, z, vx, vy, vz, color, size, life, g) {
      if (view.calm) return;
      var p = parts[partCursor];
      partCursor = (partCursor + 1) % MAX_PARTS;
      p.x = x; p.y = y; p.z = z;
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.color = color;
      p.size = size || 0.28;
      p.life = life || 0.45;
      p.max = p.life;
      p.g = g == null ? 14 : g;
    }

    function burst(x, y, z, count, colors, speed, up, size, life) {
      if (view.calm) return;
      for (var i = 0; i < count; i++) {
        var a = (i / Math.max(1, count)) * Math.PI * 2 + (i * 0.73);
        var sp = speed * (0.45 + ((i * 37) % 10) / 14);
        var col = colors[i % colors.length];
        spawnPart(
          x, y, z,
          Math.cos(a) * sp,
          up * (0.65 + ((i * 23) % 10) / 15),
          Math.sin(a) * sp,
          col,
          size * (0.75 + ((i * 19) % 10) / 20),
          life * (0.75 + ((i * 13) % 10) / 20),
          16
        );
      }
    }

    // Ink pool (pre-created glossy ink puddles so dropped ink costs zero allocations)
    var MAX_INKS = 18;
    for (var ik = 0; ik < MAX_INKS; ik++) {
      var ig = new T.Group();
      var im = new T.Mesh(GEO_INK_MAIN, MAT_INK);
      var id1 = new T.Mesh(GEO_INK_DROP, MAT_INK); id1.position.set(0.85, 0, 0.55);
      var id2 = new T.Mesh(GEO_INK_DROP, MAT_INK); id2.position.set(-0.78, 0, -0.62); id2.scale.set(0.8, 1, 0.8);
      var ih = new T.Mesh(GEO_INK_DROP, MAT_INK_HILITE); ih.position.set(-0.32, 0.035, -0.25); ih.scale.set(0.45, 0.5, 0.32);
      ig.add(im, id1, id2, ih);
      ig.visible = false;
      scene.add(ig);
      inkPool.push(ig);
    }

    // Pooled Homing Paper-Plane Missiles & Bouncing Eraser Shells (zero per-frame allocs!)
    var MAX_PROJ = 10;
    var planePool = [], shellPool = [];
    var MAT_PAPER = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a2038 });
    var MAT_PLANE_ACC = new T.MeshBasicMaterial({ color: 0xff3d7f });
    var MAT_SHELL_CY = new T.MeshBasicMaterial({ color: 0x29e3ff });
    var MAT_SHELL_PK = new T.MeshLambertMaterial({ color: 0xff5a9c, emissive: 0x451228 });
    var GEO_PLANE_BODY = new T.ConeGeometry(0.45, 2.2, 4);
    GEO_PLANE_BODY.rotateZ(-Math.PI * 0.5);
    var GEO_PLANE_WING = new T.BoxGeometry(1.4, 0.08, 2.1);
    var GEO_PLANE_FIN = new T.BoxGeometry(0.9, 0.52, 0.1);
    var GEO_SHELL_CORE = new T.CylinderGeometry(0.9, 0.9, 0.52, 12);
    var GEO_SHELL_RING = new T.TorusGeometry(0.94, 0.14, 6, 14);
    GEO_SHELL_RING.rotateX(Math.PI * 0.5);
    for (var pj = 0; pj < MAX_PROJ; pj++) {
      var pg = new T.Group();
      var pb = new T.Mesh(GEO_PLANE_BODY, MAT_PAPER);
      var pw = new T.Mesh(GEO_PLANE_WING, MAT_PAPER); pw.position.set(-0.25, 0.02, 0);
      var ps = new T.Mesh(new T.BoxGeometry(0.42, 0.11, 2.16), MAT_PLANE_ACC); ps.position.set(-0.25, 0.04, 0);
      var pf = new T.Mesh(GEO_PLANE_FIN, MAT_PLANE_ACC); pf.position.set(-0.45, -0.18, 0);
      pg.add(pb, pw, ps, pf);
      pg.visible = false;
      scene.add(pg);
      planePool.push(pg);

      var sg = new T.Group();
      var sc = new T.Mesh(GEO_SHELL_CORE, MAT_SHELL_PK);
      var sr = new T.Mesh(GEO_SHELL_RING, MAT_SHELL_CY);
      var sb = new T.Mesh(new T.BoxGeometry(1.15, 0.58, 0.42), MAT_SHELL_CY);
      sg.add(sc, sr, sb);
      sg.visible = false;
      scene.add(sg);
      shellPool.push(sg);
    }

    // 3 cheerful ambient Origami Paper Airplanes soaring gracefully overhead in the sunlit classroom!
    for (var ap = 0; ap < 3; ap++) {
      var apG = new T.Group();
      var apBody = new T.Mesh(GEO_PLANE_BODY, MAT_PAPER);
      var apWing = new T.Mesh(GEO_PLANE_WING, MAT_PAPER); apWing.position.set(-0.25, 0.02, 0);
      var apStripe = new T.Mesh(new T.BoxGeometry(0.42, 0.11, 2.16), ap === 0 ? MAT_PLANE_ACC : MAT_SHELL_CY);
      apStripe.position.set(-0.25, 0.04, 0);
      apG.add(apBody, apWing, apStripe);
      apG.scale.setScalar(2.4);
      scene.add(apG);
      roomPaperPlanes.push({ g: apG, rx: 56 + ap * 14, rz: 40 + ap * 11, y: 20 + ap * 4.5, spd: 0.22 + ap * 0.07, ph: ap * 2.1 });
    }

    function makeEraserMesh() {
      var g = new T.Group();
      var pinkMat = new T.MeshLambertMaterial({ color: 0xff77a9 });
      var blueMat = new T.MeshLambertMaterial({ color: 0x3ba7ff });
      var whiteMat = new T.MeshLambertMaterial({ color: 0xffffff });
      var pink = new T.Mesh(new T.BoxGeometry(2.5, 1.35, 1.75), pinkMat);
      pink.position.y = 0.68;
      var sleeve = new T.Mesh(new T.BoxGeometry(1.15, 1.42, 1.84), blueMat);
      sleeve.position.set(-0.48, 0.70, 0);
      var stripe = new T.Mesh(new T.BoxGeometry(0.24, 1.46, 1.88), whiteMat);
      stripe.position.set(-0.48, 0.71, 0);
      g.add(pink, sleeve, stripe);
      return g;
    }

    function makeBoostPadMesh() {
      var g = new T.Group();
      var baseMat = new T.MeshBasicMaterial({ color: 0x16294a });
      var chevMat = new T.MeshBasicMaterial({ color: 0xffe433 });
      var glowMat = new T.MeshBasicMaterial({ color: 0x3ef7ff });
      var base = new T.Mesh(new T.BoxGeometry(5.4, 0.07, 4.0), baseMat);
      base.position.y = 0.09;
      var railL = new T.Mesh(new T.BoxGeometry(5.5, 0.12, 0.24), glowMat); railL.position.set(0, 0.11, -1.92);
      var railR = railL.clone(); railR.position.z = 1.92;
      g.add(base, railL, railR);
      var chevrons = [];
      for (var i = 0; i < 3; i++) {
        var cx = -1.55 + i * 1.55;
        var a1 = new T.Mesh(new T.BoxGeometry(0.45, 0.1, 1.78), i === 2 ? glowMat : chevMat);
        a1.position.set(cx, 0.115, -0.62); a1.rotation.y = 0.52;
        var a2 = new T.Mesh(new T.BoxGeometry(0.45, 0.1, 1.78), i === 2 ? glowMat : chevMat);
        a2.position.set(cx, 0.115, 0.62); a2.rotation.y = -0.52;
        g.add(a1, a2);
        chevrons.push(a1, a2);
      }
      g.userData.chevrons = chevrons;
      return g;
    }

    var ITEM_BOX_MAT = new T.MeshLambertMaterial({ map: QUESTION_TEX, emissive: 0x3b2400 });
    function makeItemBoxMesh() {
      var g = new T.Group();
      var cube = new T.Mesh(GEO_BOX, ITEM_BOX_MAT);
      g.add(cube);
      return g;
    }

    function clearTrackMeshes() {
      while (trackGroup.children.length) {
        var ch = trackGroup.children[0];
        trackGroup.remove(ch);
        if (ch.geometry && ch.geometry !== GEO_BOX) ch.geometry.dispose();
        if (ch.material && ch.material !== MAT_LIT && ch.material !== MAT_GLOW && !Array.isArray(ch.material)) {
          if (ch.material.map) ch.material.map.dispose();
          ch.material.dispose();
        }
      }
      eraserMeshes.length = 0;
      boostMeshes.length = 0;
      boxMeshes.length = 0;
      if (deskTex) { deskTex.dispose(); deskTex = null; }
    }

    function loadTrack(L) {
      if (activeTrackIdx === L.index) return;
      activeTrackIdx = L.index;
      clearTrackMeshes();

      skyColor.setHex(L.skyColor);
      scene.background = skyColor;
      scene.fog.color.setHex(0xd8f0ff);

      // Giant sunlit desk top with procedural wood + desk mat texture
      deskTex = makeDeskTexture(L);
      var deskGeo = new T.BoxGeometry(168, 4.2, 128);
      var deskTopMat = new T.MeshLambertMaterial({ map: deskTex });
      var deskSideMat = new T.MeshLambertMaterial({ color: new T.Color(L.deskColor).multiplyScalar(0.76) });
      var deskMesh = new T.Mesh(deskGeo, [deskSideMat, deskSideMat, deskTopMat, deskSideMat, deskSideMat, deskSideMat]);
      deskMesh.position.set(0, -2.1, 0);
      trackGroup.add(deskMesh);

      // Floor below the giant desk (gives thrilling height illusion!)
      var floorGeo = new T.PlaneGeometry(360, 320);
      floorGeo.rotateX(-Math.PI * 0.5);
      var floorMesh = new T.Mesh(floorGeo, new T.MeshLambertMaterial({ color: 0x7db9db }));
      floorMesh.position.y = -18;
      trackGroup.add(floorMesh);

      // Track ribbon & merged stationery barriers/props
      trackGroup.add(buildTrackRibbon(L));
      trackGroup.add(buildTrackStaticMesh(L));

      // Interactive boosts, erasers & mystery boxes
      for (var i = 0; i < L.boosts.length; i++) {
        var bp = L.boosts[i];
        var bm = makeBoostPadMesh();
        bm.position.set(bp.x, 0, bp.z);
        bm.rotation.y = -bp.ang;
        trackGroup.add(bm);
        boostMeshes.push(bm);
      }
      for (i = 0; i < L.erasers.length; i++) {
        var er = L.erasers[i];
        var em = makeEraserMesh();
        em.position.set(er.x, 0, er.z);
        em.rotation.y = -er.ang;
        trackGroup.add(em);
        eraserMeshes.push(em);
      }
      for (i = 0; i < L.itemSpawns.length; i++) {
        var ib = L.itemSpawns[i];
        var ibm = makeItemBoxMesh();
        ibm.position.set(ib.x, 1.3, ib.z);
        trackGroup.add(ibm);
        boxMeshes.push(ibm);
      }
    }

    /* ---------------------------------------------------- Cute 3D Toy Karts */
    var kartRigs = [];
    var MAT_TIRE = new T.MeshLambertMaterial({ color: 0x222636 });
    var MAT_CHROME = new T.MeshLambertMaterial({ color: 0xdce5f2 });
    var MAT_VISOR = new T.MeshLambertMaterial({ color: 0x1e253b });
    var MAT_EYE_W = new T.MeshBasicMaterial({ color: 0xffffff });
    var MAT_PUPIL = new T.MeshBasicMaterial({ color: 0x151a2e });
    var MAT_FLAME_OUT = new T.MeshBasicMaterial({ color: 0xff6b22 });
    var MAT_FLAME_IN = new T.MeshBasicMaterial({ color: 0xfff059 });
    var MAT_SHIELD_BUBBLE = new T.MeshBasicMaterial({ color: 0x3ef29c, transparent: true, opacity: 0.34, depthWrite: false });

    function buildKartRig(k) {
      var root = new T.Group();
      var chassis = new T.Group();
      root.add(chassis);

      var bodyMat = new T.MeshLambertMaterial({ color: k.color });
      var trimMat = new T.MeshLambertMaterial({ color: k.trim });
      var helmMat = new T.MeshLambertMaterial({ color: k.helmet });
      var skinMat = new T.MeshLambertMaterial({ color: 0xffd1a8 });

      // Chassis faces +X locally (matches world angle ang = 0 -> +X!)
      if (k.body === 1) {
        // Pencil Rocket: sleek pointed nose & twin rocket pods
        var core1 = new T.Mesh(new T.BoxGeometry(2.65, 0.72, 1.48), bodyMat);
        core1.position.set(0.05, 0.62, 0);
        var nose1 = new T.Mesh(new T.BoxGeometry(0.95, 0.56, 1.05), trimMat);
        nose1.position.set(1.48, 0.56, 0);
        var podL = new T.Mesh(new T.BoxGeometry(1.3, 0.55, 0.45), trimMat);
        podL.position.set(-0.75, 0.78, -0.82);
        var podR = podL.clone(); podR.position.z = 0.82;
        chassis.add(core1, nose1, podL, podR);
      } else if (k.body === 2) {
        // Mini School Bus: chunky tall cute bus body + bright windows
        var bus = new T.Mesh(new T.BoxGeometry(2.75, 1.12, 1.72), bodyMat);
        bus.position.set(0, 0.84, 0);
        var wind = new T.Mesh(new T.BoxGeometry(0.32, 0.52, 1.48), new T.MeshBasicMaterial({ color: 0xbef0ff }));
        wind.position.set(1.28, 1.08, 0);
        var roof = new T.Mesh(new T.BoxGeometry(2.2, 0.16, 1.44), trimMat);
        roof.position.set(-0.1, 1.46, 0);
        chassis.add(bus, wind, roof);
      } else if (k.body === 3) {
        // Turbo Buggy: wide frame + roll cage + raised big wing
        var b3 = new T.Mesh(new T.BoxGeometry(2.55, 0.64, 1.65), bodyMat);
        b3.position.set(0.05, 0.58, 0);
        var hood3 = new T.Mesh(new T.BoxGeometry(1.05, 0.42, 1.25), trimMat);
        hood3.position.set(1.22, 0.66, 0);
        var wing3 = new T.Mesh(new T.BoxGeometry(0.55, 0.14, 1.98), trimMat);
        wing3.position.set(-1.18, 1.42, 0);
        var stL = new T.Mesh(new T.BoxGeometry(0.16, 0.62, 0.14), MAT_CHROME);
        stL.position.set(-1.12, 1.08, -0.58);
        var stR = stL.clone(); stR.position.z = 0.58;
        chassis.add(b3, hood3, wing3, stL, stR);
      } else {
        // Classic Eraser Racer: friendly chunky toy kart with side pods & rear wing
        var base0 = new T.Mesh(new T.BoxGeometry(2.65, 0.66, 1.64), bodyMat);
        base0.position.set(0, 0.60, 0);
        var bumper0 = new T.Mesh(new T.BoxGeometry(0.42, 0.42, 1.84), trimMat);
        bumper0.position.set(1.36, 0.48, 0);
        var stripe0 = new T.Mesh(new T.BoxGeometry(2.45, 0.12, 0.46), trimMat);
        stripe0.position.set(0.08, 0.96, 0);
        var wing0 = new T.Mesh(new T.BoxGeometry(0.48, 0.16, 1.78), trimMat);
        wing0.position.set(-1.20, 1.24, 0);
        var postL = new T.Mesh(new T.BoxGeometry(0.16, 0.42, 0.16), MAT_CHROME);
        postL.position.set(-1.15, 0.98, -0.56);
        var postR = postL.clone(); postR.position.z = 0.56;
        chassis.add(base0, bumper0, stripe0, wing0, postL, postR);
      }

      // Twin chrome exhausts
      var exL = new T.Mesh(new T.BoxGeometry(0.56, 0.24, 0.24), MAT_CHROME);
      exL.position.set(-1.42, 0.64, -0.44);
      var exR = exL.clone(); exR.position.z = 0.44;
      chassis.add(exL, exR);

      // Headlights
      var hlMat = new T.MeshBasicMaterial({ color: 0xfff8c4 });
      var hlL = new T.Mesh(new T.BoxGeometry(0.14, 0.22, 0.30), hlMat);
      hlL.position.set(1.38, 0.68, -0.52);
      var hlR = hlL.clone(); hlR.position.z = 0.52;
      chassis.add(hlL, hlR);

      // Cute Driver with bobbing oversized helmet + big cartoon eyes!
      var driver = new T.Group();
      driver.position.set(-0.12, k.body === 2 ? 1.54 : 1.04, 0);
      var torso = new T.Mesh(new T.BoxGeometry(0.62, 0.52, 0.72), trimMat);
      torso.position.y = 0.16;
      var head = new T.Mesh(GEO_HELMET, helmMat);
      head.position.y = 0.66;
      var visor = new T.Mesh(new T.BoxGeometry(0.38, 0.28, 0.76), MAT_VISOR);
      visor.position.set(0.36, 0.64, 0);
      // Big expressive cartoon eyes looking forward!
      var eyeL = new T.Mesh(GEO_EYE, MAT_EYE_W); eyeL.position.set(0.54, 0.66, -0.18);
      var eyeR = new T.Mesh(GEO_EYE, MAT_EYE_W); eyeR.position.set(0.54, 0.66,  0.18);
      var pupL = new T.Mesh(GEO_PUPIL, MAT_PUPIL); pupL.position.set(0.62, 0.66, -0.18);
      var pupR = new T.Mesh(GEO_PUPIL, MAT_PUPIL); pupR.position.set(0.62, 0.66,  0.18);
      var hStripe = new T.Mesh(new T.BoxGeometry(0.95, 0.18, 0.22), bodyMat);
      hStripe.position.set(-0.04, 1.14, 0);
      driver.add(torso, head, visor, eyeL, eyeR, pupL, pupR, hStripe);
      chassis.add(driver);

      // 4 Spinning chunky wheels (front wheels inside steer pivots)
      var wheels = [];
      var frontPivots = [];
      var wheelPos = [
        { x:  0.92, z: -0.98, front: true },
        { x:  0.92, z:  0.98, front: true },
        { x: -0.92, z: -1.04, front: false },
        { x: -0.92, z:  1.04, front: false }
      ];
      for (var w = 0; w < 4; w++) {
        var wp = wheelPos[w];
        var piv = new T.Group();
        piv.position.set(wp.x, 0.46, wp.z);
        var wGroup = new T.Group();
        var tire = new T.Mesh(GEO_WHEEL, MAT_TIRE);
        var hub = new T.Mesh(GEO_HUB, trimMat);
        wGroup.add(tire, hub);
        piv.add(wGroup);
        root.add(piv);
        wheels.push(wGroup);
        if (wp.front) frontPivots.push(piv);
      }

      // Turbo Exhaust Flame (scales up during boost!)
      var flame = new T.Group();
      flame.position.set(-1.95, 0.66, 0);
      var fOut = new T.Mesh(GEO_FLAME, MAT_FLAME_OUT);
      var fIn = new T.Mesh(GEO_FLAME, MAT_FLAME_IN);
      fIn.scale.set(0.65, 0.6, 0.6);
      flame.add(fOut, fIn);
      flame.visible = false;
      chassis.add(flame);

      // Shield Bubble
      var shield = new T.Mesh(GEO_SHIELD, MAT_SHIELD_BUBBLE);
      shield.position.y = 0.95;
      shield.visible = false;
      root.add(shield);

      // Floating Held Item Badge behind spoiler
      var itemBadge = new T.Mesh(new T.OctahedronGeometry(0.36, 0), new T.MeshBasicMaterial({ color: 0xff5a36 }));
      itemBadge.position.set(-1.3, 1.95, 0);
      itemBadge.visible = false;
      root.add(itemBadge);

      scene.add(root);
      return {
        root: root,
        chassis: chassis,
        driver: driver,
        wheels: wheels,
        frontPivots: frontPivots,
        flame: flame,
        shield: shield,
        itemBadge: itemBadge,
        body: k.body,
        color: k.color,
        trim: k.trim
      };
    }

    function ensureKarts(karts) {
      for (var i = 0; i < karts.length; i++) {
        var k = karts[i];
        var rig = kartRigs[i];
        if (!rig || rig.body !== k.body || rig.color !== k.color) {
          if (rig) scene.remove(rig.root);
          kartRigs[i] = buildKartRig(k);
        }
      }
    }

    /* ---------------------------------------------------- Low Chase Cameras & Shake */
    var camPos = [new T.Vector3(0, 6.2, 12), new T.Vector3(0, 6.2, 12)];
    var camLook = [new T.Vector3(0, 1.5, 0), new T.Vector3(0, 1.5, 0)];
    var camYaw = [0, 0];
    var camFov = [60, 66];
    var lastAspect = [0, 0], lastFov = [0, 0];
    var isSplit = false, viewW = 1280, viewH = 720;
    var shaker = Kit.shake({ decay: 3.4 });

    function addShake(p) {
      if (!view.calm) shaker.add(p);
    }

    function syncCamProj(cam, idx, aspect) {
      var fov = camFov[idx];
      if (Math.abs(lastAspect[idx] - aspect) > 1e-4 || Math.abs(lastFov[idx] - fov) > 0.05) {
        cam.aspect = aspect;
        cam.fov = fov;
        cam.updateProjectionMatrix();
        lastAspect[idx] = aspect;
        lastFov[idx] = fov;
      }
    }

    function updateChaseCam(idx, w, pk, dt, snapCam, splitMode, isTitle) {
      var spCam = E.sampleAt(w.L, pk.s + 5.5);
      var trackAng = Math.atan2(spCam.tz, spCam.tx);
      var desiredYaw = pk.ang + E.wrapAngle(trackAng - pk.ang) * 0.30;
      if (snapCam) camYaw[idx] = desiredYaw;
      else camYaw[idx] = E.wrapAngle(camYaw[idx] + E.wrapAngle(desiredYaw - camYaw[idx]) * E.clamp(dt * 6.5, 0, 1));

      var boostKick = pk.boostT > 0 ? 1.4 : 0;
      var backDist = (splitMode ? 9.8 : isTitle ? 10.6 : 9.4) + boostKick;
      var camHeight = (splitMode ? 6.3 : isTitle ? 6.1 : 6.0) + pk.y * 0.48;
      var ahead = isTitle ? 10.4 : 9.2;

      var tx = pk.x - Math.cos(camYaw[idx]) * backDist;
      var ty = camHeight;
      var tz = pk.z - Math.sin(camYaw[idx]) * backDist;
      var lx = pk.x + Math.cos(camYaw[idx]) * ahead;
      var ly = (isTitle ? 0.65 : 1.6) + pk.y * 0.32;
      var lz = pk.z + Math.sin(camYaw[idx]) * ahead;

      if (snapCam) {
        camPos[idx].set(tx, ty, tz);
        camLook[idx].set(lx, ly, lz);
      } else {
        var sm = E.clamp(dt * 9.5, 0, 1);
        camPos[idx].x = E.lerp(camPos[idx].x, tx, sm);
        camPos[idx].y = E.lerp(camPos[idx].y, ty, sm);
        camPos[idx].z = E.lerp(camPos[idx].z, tz, sm);
        camLook[idx].x = E.lerp(camLook[idx].x, lx, sm);
        camLook[idx].y = E.lerp(camLook[idx].y, ly, sm);
        camLook[idx].z = E.lerp(camLook[idx].z, lz, sm);
      }

      var baseFov = splitMode ? 66 : 60;
      var speedBonus = pk.boostT > 0 ? 12 : E.clamp((pk.speed - 18) * 0.36, 0, 5);
      var wantFov = baseFov + speedBonus;
      camFov[idx] = snapCam ? wantFov : E.lerp(camFov[idx], wantFov, E.clamp(dt * 7.5, 0, 1));
    }

    function setInst(inst, idx, x, y, z, sx, sy, sz, rx, ry, rz) {
      V1.set(x, y, z);
      EU.set(rx, ry, rz);
      Q.setFromEuler(EU);
      S1.set(sx, sy, sz);
      M4.compose(V1, Q, S1);
      inst.setMatrixAt(idx, M4);
    }

    /* ---------------------------------------------------- Per-Frame Sync */
    function sync(w, dt, snapCam, isTitleDemo) {
      loadTrack(w.L);
      ensureKarts(w.karts);

      var t = w.worldTime;
      var shIdx = 0;

      // 0) Glide overhead ambient classroom origami paper airplanes!
      for (var api = 0; api < roomPaperPlanes.length; api++) {
        var rp2 = roomPaperPlanes[api], aa = t * rp2.spd + rp2.ph;
        var ax = Math.cos(aa) * rp2.rx, az = Math.sin(aa) * rp2.rz;
        var dx2 = -Math.sin(aa) * rp2.rx, dz2 = Math.cos(aa) * rp2.rz;
        rp2.g.position.set(ax, rp2.y + Math.sin(t * 1.8 + rp2.ph) * 1.4, az);
        rp2.g.rotation.set(0.14, -Math.atan2(dz2, dx2), Math.sin(t * 2.2 + rp2.ph) * 0.12);
      }

      // 1) Update bouncy erasers
      for (var i = 0; i < w.erasers.length && i < eraserMeshes.length; i++) {
        var er = w.erasers[i], em = eraserMeshes[i];
        var sq = er.squash;
        em.scale.set(1 + sq * 0.28, 1 - sq * 0.34, 1 + sq * 0.28);
      }

      // 2) Pulse boost chevron pads
      for (i = 0; i < boostMeshes.length; i++) {
        var pulse = 1 + Math.sin(t * 9 + i) * 0.05;
        boostMeshes[i].scale.set(pulse, 1, 1);
      }

      // 3) Spin floating pickup boxes + shadows
      for (i = 0; i < w.itemBoxes.length && i < boxMeshes.length; i++) {
        var ib = w.itemBoxes[i], bm = boxMeshes[i];
        bm.visible = ib.active;
        if (ib.active) {
          bm.position.y = 1.25 + Math.sin(t * 3.8 + i * 0.9) * 0.25;
          bm.rotation.y = t * 2.1 + i;
          bm.rotation.x = Math.sin(t * 1.9 + i) * 0.28;
          if (shIdx < MAX_SHADOWS) {
            setInst(shadowInst, shIdx++, ib.x, 0.09, ib.z, 0.95, 1, 0.95, 0, 0, 0);
          }
        }
      }

      // 4) Sync spinning gold coins (1 InstancedMesh draw, shrunk upload!)
      var cnIdx = 0;
      for (i = 0; i < w.coins.length && cnIdx < MAX_COINS; i++) {
        var cn = w.coins[i];
        if (!cn.active) continue;
        setInst(coinInst, cnIdx++, cn.x, 1.05 + Math.sin(t * 4.5 + i) * 0.18, cn.z, 1, 1, 1, 0, t * 3.2 + i * 0.5, 0);
        if (shIdx < MAX_SHADOWS) {
          setInst(shadowInst, shIdx++, cn.x, 0.09, cn.z, 0.55, 1, 0.55, 0, 0, 0);
        }
      }
      Kit.webgl.shrinkCount(coinInst, cnIdx);

      // 5) Sync glossy ink puddles (static + player-dropped)
      for (i = 0; i < MAX_INKS; i++) {
        var ig = inkPool[i];
        if (i < w.inks.length) {
          var ik = w.inks[i];
          ig.visible = true;
          ig.position.set(ik.x, 0.075, ik.z);
          var sc = ik.r * (ik.temp && ik.life < 1.2 ? Math.max(0.1, ik.life / 1.2) : 1.0);
          ig.scale.set(sc, 1, sc);
        } else {
          ig.visible = false;
        }
      }

      // 5b) Sync Homing Paper-Plane Missiles & Bouncing Eraser Shells
      var plCount = 0, shCount = 0;
      var projs = w.projectiles || [];
      for (i = 0; i < projs.length; i++) {
        var pr = projs[i];
        if (pr.kind === 'plane' && plCount < MAX_PROJ) {
          var pm = planePool[plCount++];
          pm.visible = true;
          pm.position.set(pr.x, pr.y + Math.sin(t * 14 + pr.id) * 0.14, pr.z);
          pm.rotation.set(Math.sin(t * 10 + pr.id) * 0.18, -pr.ang, 0);
          if (shIdx < MAX_SHADOWS) setInst(shadowInst, shIdx++, pr.x, 0.1, pr.z, 0.85, 1, 0.65, 0, -pr.ang, 0);
          if (!view.calm && Math.sin(t * 50 + i) > 0) {
            spawnPart(pr.x, pr.y, pr.z, -pr.vx * 0.12, 1.0, -pr.vz * 0.12, 0xff5fa2, 0.24, 0.26, 3);
          }
        } else if (pr.kind === 'shell' && shCount < MAX_PROJ) {
          var sm = shellPool[shCount++];
          sm.visible = true;
          sm.position.set(pr.x, pr.y, pr.z);
          sm.rotation.set(0, t * 14 + pr.id, 0);
          if (shIdx < MAX_SHADOWS) setInst(shadowInst, shIdx++, pr.x, 0.1, pr.z, 0.95, 1, 0.95, 0, 0, 0);
          if (!view.calm && Math.sin(t * 50 + i) > 0) {
            spawnPart(pr.x, pr.y + 0.1, pr.z, -pr.vx * 0.1, 1.4, -pr.vz * 0.1, 0x29e3ff, 0.22, 0.22, 6);
          }
        }
      }
      for (i = plCount; i < MAX_PROJ; i++) planePool[i].visible = false;
      for (i = shCount; i < MAX_PROJ; i++) shellPool[i].visible = false;

      // 6) Sync all 4 toy karts + drift sparks + turbo flames + shadows
      for (i = 0; i < w.karts.length; i++) {
        var k = w.karts[i];
        var rig = kartRigs[i];
        rig.root.position.set(k.x, k.y, k.z);

        // Visual slip yaw during drift + spin-out rotation on ink hit
        var slipYaw = k.drifting ? -k.driftDir * 0.36 : 0;
        var spinYaw = k.spinT > 0 ? k.spinT * Math.PI * 6 : 0;
        rig.root.rotation.y = -k.ang + slipYaw + spinYaw;

        // Jump pitch + cornering body roll + engine idle bounce
        var pitch = k.airborne ? E.clamp(k.vy * 0.045, -0.35, 0.42) : (k.boostT > 0 ? 0.06 : 0);
        var roll = -k.steerVis * 0.14 - (k.drifting ? k.driftDir * 0.08 : 0);
        var bob = Math.sin(t * (k.speed > 2 ? 22 : 7) + i * 1.4) * (k.speed > 2 ? 0.045 : 0.025);
        rig.chassis.position.y = bob;
        rig.chassis.rotation.z = pitch;
        rig.chassis.rotation.x = roll;

        // Bobbing driver helmet leans playfully into turns
        rig.driver.rotation.x = -k.steerVis * 0.24;
        rig.driver.position.y = (k.body === 2 ? 1.54 : 1.04) + Math.abs(bob) * 1.4;

        // Spinning & steering wheels
        for (var wi = 0; wi < 4; wi++) rig.wheels[wi].rotation.z = -k.wheelSpin;
        for (wi = 0; wi < rig.frontPivots.length; wi++) rig.frontPivots[wi].rotation.y = -k.steerVis * 0.42;

        // Turbo flame
        if (k.boostT > 0) {
          rig.flame.visible = true;
          var fs = 0.85 + Math.sin(t * 48 + i) * 0.35;
          rig.flame.scale.set(fs * 1.35, 0.8 + fs * 0.25, 0.8 + fs * 0.25);
          if (!view.calm && Math.sin(t * 60 + i) > 0.2) {
            spawnPart(
              k.x - Math.cos(k.ang) * 1.8, k.y + 0.55, k.z - Math.sin(k.ang) * 1.8,
              -Math.cos(k.ang) * 5, 1.5, -Math.sin(k.ang) * 5,
              0xffb703, 0.26, 0.26, 4
            );
          }
        } else {
          rig.flame.visible = false;
        }

        // Drift sparks from rear tires!
        if (k.drifting && !view.calm && k.speed > 11) {
          var sparkCol = k.driftStage === 2 ? 0xffd600 : (k.driftStage === 1 ? 0x38d9ff : 0xffffff);
          var rx = k.x - Math.cos(k.ang) * 1.2 + Math.sin(k.ang) * (k.driftDir * 0.8);
          var rz = k.z - Math.sin(k.ang) * 1.2 - Math.cos(k.ang) * (k.driftDir * 0.8);
          spawnPart(
            rx, k.y + 0.25, rz,
            -Math.cos(k.ang) * 4 + (Math.sin(t * 37 + i) * 3.5),
            2.6 + (k.driftStage * 1.4),
            -Math.sin(k.ang) * 4 + (Math.cos(t * 31 + i) * 3.5),
            sparkCol, 0.22 + k.driftStage * 0.08, 0.28, 12
          );
        }

        // Shield dome
        rig.shield.visible = k.shieldT > 0;
        if (k.shieldT > 0) {
          var spu = 1 + Math.sin(t * 14) * 0.05;
          rig.shield.scale.set(spu, spu, spu);
          rig.shield.rotation.y = t * 2.5;
        }

        // Held item indicator floating above rear
        if (k.item && E.ITEMS[k.item]) {
          rig.itemBadge.visible = true;
          rig.itemBadge.material.color.setHex(E.ITEMS[k.item].color);
          rig.itemBadge.position.y = 2.0 + Math.sin(t * 6 + i) * 0.16;
          rig.itemBadge.rotation.y = t * 3.5;
        } else {
          rig.itemBadge.visible = false;
        }

        // Kart blob shadow (shrinks cleanly while jumping over textbook ramps!)
        if (shIdx < MAX_SHADOWS) {
          var shScale = Math.max(0.55, 1.55 - k.y * 0.16);
          setInst(shadowInst, shIdx++, k.x, 0.095, k.z, shScale * 1.15, 1, shScale * 0.88, 0, -k.ang, 0);
        }
      }

      Kit.webgl.shrinkCount(shadowInst, shIdx);

      // 7) Step & draw pooled 3D particles (skip upload when 0 live!)
      var ptIdx = 0;
      for (i = 0; i < MAX_PARTS; i++) {
        var pt = parts[i];
        if (pt.life <= 0) continue;
        pt.life -= dt;
        if (pt.life <= 0) continue;
        pt.vy -= pt.g * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        if (pt.y < 0.08) { pt.y = 0.08; pt.vy *= -0.35; }
        var ps = pt.size * Math.max(0.08, pt.life / pt.max);
        setInst(partInst, ptIdx, pt.x, pt.y, pt.z, ps, ps, ps, t * 6 + i, t * 5, 0);
        partInst.setColorAt(ptIdx, C.setHex(pt.color));
        ptIdx++;
      }
      Kit.webgl.shrinkCount(partInst, ptIdx);
      if (ptIdx > 0 && partInst.instanceColor) Kit.webgl.uploadRange(partInst.instanceColor, ptIdx * 3);

      // 8) Exhilarating Low Chase Camera (1P & true 2P split-screen chase — zero inverted steering!)
      shaker.update(dt);
      isSplit = !isTitleDemo && !!w.duo;
      if (isTitleDemo) {
        updateChaseCam(0, w, w.karts[0], dt, snapCam, false, true);
      } else if (isSplit) {
        updateChaseCam(0, w, w.karts[0], dt, snapCam, true, false);
        updateChaseCam(1, w, w.karts[1], dt, snapCam, true, false);
      } else {
        updateChaseCam(0, w, w.karts[0], dt, snapCam, false, false);
      }

      var sx = (!view.calm && shaker.power > 0.005) ? shaker.x * 0.42 : 0;
      var sy = (!view.calm && shaker.power > 0.005) ? shaker.y * 0.36 : 0;
      camera.position.set(camPos[0].x + sx, camPos[0].y + sy, camPos[0].z);
      camera.lookAt(camLook[0].x, camLook[0].y, camLook[0].z);
      if (!view.calm && shaker.rot) camera.rotation.z += shaker.rot * 1.4;

      if (isSplit) {
        camera2.position.set(camPos[1].x + sx, camPos[1].y + sy, camPos[1].z);
        camera2.lookAt(camLook[1].x, camLook[1].y, camLook[1].z);
        if (!view.calm && shaker.rot) camera2.rotation.z += shaker.rot * 1.4;
      }
    }

    /* ---------------------------------------------------- Software WebGL Fence Pacing */
    var pace = Kit.webgl.pacer(renderer, { software: software });

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      software: software,
      calm: false,
      burst: burst,
      shake: addShake,
      sync: sync,
      loadTrack: loadTrack,
      mayDraw: pace.mayDraw,
      camInfo: function () {
        return { fov: Math.round(camFov[0] * 10) / 10, height: Math.round(camPos[0].y * 10) / 10, split: isSplit };
      },
      render: function () {
        if (!isSplit) {
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, viewW, viewH);
          syncCamProj(camera, 0, viewW / Math.max(1, viewH));
          renderer.render(scene, camera);
        } else {
          var hw = Math.floor(viewW / 2);
          renderer.setScissorTest(true);
          renderer.setViewport(0, 0, hw, viewH);
          renderer.setScissor(0, 0, hw, viewH);
          syncCamProj(camera, 0, hw / Math.max(1, viewH));
          renderer.render(scene, camera);
          renderer.setViewport(hw, 0, viewW - hw, viewH);
          renderer.setScissor(hw, 0, viewW - hw, viewH);
          syncCamProj(camera2, 1, (viewW - hw) / Math.max(1, viewH));
          renderer.render(scene, camera2);
          renderer.setScissorTest(false);
        }
        pace.markDrawn();
      },
      resize: function (w, h) {
        viewW = Math.max(1, w);
        viewH = Math.max(1, h);
        renderer.setSize(viewW, viewH, false);
        lastAspect[0] = 0;
        lastAspect[1] = 0;
      },
      prepare: function (done) { if (done) done(); },
      whenDrawn: pace.whenDrawn,
      dispose: function () {
        pace.dispose();
        clearTrackMeshes();
        renderer.dispose();
      }
    };

    return view;
  }

  window.DeskKartsArt = { createView: createView };
})();

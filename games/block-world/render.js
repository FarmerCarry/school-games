/* Block World — TNT Mine Dash (عالم المكعبات)
 * High-craft 44px stylized voxel Canvas2D renderer: layered sunny sky & mountain horizon,
 * wooden mine-shaft arch & lantern, glowing runic escape portal, multi-variant textured
 * beveled tiles & sparkling ores, atmospheric cavern backdrop, headlamp beam, and juicy FX! */
(function () {
  'use strict';
  var BW = window.BW;
  var TS = BW.TS, T = BW.T, BLOCKS = BW.BLOCKS;

  BW.createRenderer = function (canvas, ctx) {
    var VW = 1280, VH = 720;
    var camX = 32 * TS - VW / 2, camY = 9 * TS - VH / 2;
    var rings = [];
    var floats = [];

    function tileHash(x, y) {
      var n = (x * 374761393 + y * 668265263) | 0;
      n = ((n ^ (n >>> 13)) * 1274126177) | 0;
      return ((n ^ (n >>> 16)) >>> 0);
    }

    // Pre-bake 3 subtle texture variants per solid tile at 44x44 (fast <8ms boot, zero per-frame churn).
    var sprites = {};
    function bakeTiles() {
      for (var idStr in BLOCKS) {
        var b = BLOCKS[idStr];
        if (!b.solid) continue;
        sprites[b.id] = [];
        var variants = (b.tnt || b.id === T.BEDROCK) ? 1 : 3;
        for (var v = 0; v < variants; v++) {
          var c = document.createElement('canvas');
          c.width = c.height = TS;
          var g = c.getContext('2d');
          var seed = (b.id * 97 + v * 31) | 0;
          var nextR = function () {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
          };

          // Base fill + subtle vertical shading gradient
          var grd = g.createLinearGradient(0, 0, 0, TS);
          grd.addColorStop(0, b.col);
          grd.addColorStop(1, b.lo || b.col);
          g.fillStyle = grd;
          g.fillRect(0, 0, TS, TS);

          // Material-specific rich voxel surface texture
          if (b.id === T.DIRT || b.id === T.GRASS) {
            // Stratified earth clumps & tiny pebbles
            for (var p = 0; p < 7; p++) {
              g.fillStyle = p % 2 === 0 ? 'rgba(255,220,175,0.14)' : 'rgba(38,20,10,0.22)';
              var px = 5 + Math.floor(nextR() * (TS - 16));
              var py = (b.top ? 15 : 5) + Math.floor(nextR() * (TS - (b.top ? 22 : 14)));
              var pw = 5 + Math.floor(nextR() * 8);
              var ph = 3 + Math.floor(nextR() * 4);
              g.fillRect(px, py, pw, ph);
            }
          } else if (b.id === T.BRICK) {
            // Gilded temple vault masonry seams
            g.fillStyle = 'rgba(65,35,6,0.42)';
            g.fillRect(0, 21, TS, 3);
            g.fillRect(v % 2 === 0 ? 20 : 14, 0, 3, 21);
            g.fillRect(v % 2 === 0 ? 34 : 28, 24, 3, 20);
            g.fillStyle = 'rgba(255,244,180,0.34)';
            g.fillRect(3, 3, TS - 6, 4);
            g.fillRect(3, 25, TS - 6, 3);
          } else if (b.id === T.CRYSTAL_BLK) {
            // Faceted glowing aqua crystal planes
            g.fillStyle = 'rgba(220,255,255,0.28)';
            g.beginPath(); g.moveTo(4, 4); g.lineTo(28, 4); g.lineTo(14, 24); g.lineTo(4, 18); g.closePath(); g.fill();
            g.fillStyle = 'rgba(10,70,92,0.28)';
            g.beginPath(); g.moveTo(40, 40); g.lineTo(16, 40); g.lineTo(28, 20); g.lineTo(40, 26); g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.68)';
            g.fillRect(8, 8, 6, 3); g.fillRect(28, 16, 4, 4);
          } else if (!b.tnt) {
            // Layered slate & rock facets for stone/ores/obsidian/bedrock
            for (var s = 0; s < 5; s++) {
              g.fillStyle = s % 2 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(12,14,28,0.24)';
              var sx = 4 + Math.floor(nextR() * (TS - 18));
              var sy = 5 + Math.floor(nextR() * (TS - 15));
              g.fillRect(sx, sy, 8 + Math.floor(nextR() * 10), 4 + Math.floor(nextR() * 4));
            }
          }

          // Crisp chunky top/left bevel highlight & bottom/right shadow
          g.fillStyle = b.hi || 'rgba(255,255,255,0.22)';
          g.globalAlpha = 0.55;
          g.fillRect(2, 2, TS - 4, 4);
          g.fillRect(2, 2, 3, TS - 4);
          g.globalAlpha = 1;
          g.fillStyle = 'rgba(16,12,34,0.34)';
          g.fillRect(2, TS - 5, TS - 4, 4);
          g.fillRect(TS - 4, 2, 3, TS - 4);

          // Lush multi-tuft Grass turf overhang
          if (b.top) {
            g.fillStyle = b.top;
            g.fillRect(0, 0, TS, 12);
            g.fillStyle = b.hi;
            g.fillRect(0, 0, TS, 5);
            g.fillStyle = '#258f38';
            var drips = v === 0 ? [4, 15, 28, 37] : v === 1 ? [2, 13, 24, 35] : [6, 18, 30];
            for (var di = 0; di < drips.length; di++) {
              var dh = 4 + ((di + v) % 3) * 3;
              g.fillRect(drips[di], 11, 6, dh);
            }
            // Tiny joyful grass shine / blossom speck
            if (v === 2) {
              g.fillStyle = '#fff59d';
              g.fillRect(14, 3, 4, 4);
            }
          }

          // Faceted Ore Gem Clusters embedded in rock
          if (b.ore) {
            var spots = v === 0
              ? [[10, 11, 10, 9], [25, 22, 11, 10], [11, 29, 8, 7]]
              : v === 1
                ? [[24, 9, 11, 10], [9, 21, 10, 10], [26, 30, 8, 7]]
                : [[12, 10, 9, 9], [28, 15, 9, 9], [18, 26, 11, 10]];
            for (var oi = 0; oi < spots.length; oi++) {
              var sp = spots[oi];
              // Dark rock socket
              g.fillStyle = 'rgba(18,14,38,0.6)';
              g.fillRect(sp[0] - 2, sp[1] - 1, sp[2] + 4, sp[3] + 3);
              // Ore body
              g.fillStyle = b.ore;
              g.fillRect(sp[0], sp[1], sp[2], sp[3]);
              // Facet glint
              g.fillStyle = b.shine || '#fff';
              g.fillRect(sp[0] + 1, sp[1] + 1, Math.max(3, Math.floor(sp[2] * 0.42)), Math.max(3, Math.floor(sp[3] * 0.38)));
            }
          }

          // Detailed Wooden TNT Crate
          if (b.tnt) {
            g.fillStyle = '#991b22';
            g.fillRect(2, 2, TS - 4, TS - 4);
            // Vertical red planks
            for (var pl = 0; pl < 4; pl++) {
              g.fillStyle = pl % 2 === 0 ? '#ef3e4a' : '#d92638';
              g.fillRect(4 + pl * 9, 4, 8, TS - 8);
            }
            // Wooden top/bottom frame straps + rivets
            g.fillStyle = '#5c2d16';
            g.fillRect(2, 2, TS - 4, 7);
            g.fillRect(2, TS - 9, TS - 4, 7);
            g.fillStyle = '#ffd238';
            g.fillRect(5, 4, 3, 3); g.fillRect(TS - 8, 4, 3, 3);
            g.fillRect(5, TS - 7, 3, 3); g.fillRect(TS - 8, TS - 7, 3, 3);
            // White label band
            g.fillStyle = '#fff9ec';
            g.fillRect(3, 14, TS - 6, 16);
            g.fillStyle = '#1b1640';
            g.font = '800 13px Fredoka, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('TNT', TS / 2, TS / 2 + 1);
          }

          // Crisp dark outline (softer on dirt/stone so ground feels organic, bold on TNT/bricks)
          g.strokeStyle = b.tnt || b.id === T.BRICK ? 'rgba(22,18,46,0.75)' : 'rgba(22,18,46,0.34)';
          g.lineWidth = b.tnt ? 2.5 : 1.5;
          g.strokeRect(0.75, 0.75, TS - 1.5, TS - 1.5);
          sprites[b.id].push(c);
        }
      }
    }
    bakeTiles();

    // Pre-bake 3 seamless underground cavern wall tile patterns (88x88) for lush depth!
    var cavePatterns = [];
    (function () {
      var themes = [
        { bg: '#2c1f24', brick: '#39282e', dark: '#21161a', speck: 'rgba(255,210,150,0.08)' },
        { bg: '#1a2040', brick: '#242d57', dark: '#121630', speck: 'rgba(110,240,255,0.11)' },
        { bg: '#231336', brick: '#331c4d', dark: '#170b26', speck: 'rgba(255,110,160,0.11)' }
      ];
      for (var i = 0; i < themes.length; i++) {
        var th = themes[i];
        var cv = document.createElement('canvas');
        cv.width = cv.height = 88;
        var g = cv.getContext('2d');
        g.fillStyle = th.bg;
        g.fillRect(0, 0, 88, 88);
        // Subtle recessed cavern stones
        var rects = [[4, 4, 38, 18], [46, 4, 38, 18], [0, 26, 20, 18], [24, 26, 40, 18], [68, 26, 20, 18], [6, 48, 36, 18], [46, 48, 36, 18], [0, 70, 28, 16], [32, 70, 34, 16], [70, 70, 18, 16]];
        for (var r = 0; r < rects.length; r++) {
          var rc = rects[r];
          g.fillStyle = r % 3 === 0 ? th.dark : th.brick;
          g.beginPath(); g.roundRect(rc[0], rc[1], rc[2], rc[3], 4); g.fill();
        }
        g.fillStyle = th.speck;
        g.fillRect(14, 10, 4, 4); g.fillRect(58, 54, 4, 4); g.fillRect(36, 32, 3, 3);
        cavePatterns.push(ctx.createPattern(cv, 'repeat'));
      }
    })();

    // Cached glowing radial headlamp & sun halos
    var glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 420;
    (function () {
      var gg = glowCanvas.getContext('2d');
      var gr = gg.createRadialGradient(210, 210, 16, 210, 210, 210);
      gr.addColorStop(0, 'rgba(255,248,205,0.34)');
      gr.addColorStop(0.45, 'rgba(255,215,130,0.14)');
      gr.addColorStop(1, 'rgba(255,200,100,0)');
      gg.fillStyle = gr;
      gg.fillRect(0, 0, 420, 420);
    })();

    var skyGrad = ctx.createLinearGradient(0, 0, 0, 240);
    skyGrad.addColorStop(0, '#278eff');
    skyGrad.addColorStop(0.58, '#68d5ff');
    skyGrad.addColorStop(1, '#d2f7ff');

    function addRing(wx, wy, maxR, col) {
      rings.push({ x: wx, y: wy, r: 0.3, maxR: maxR, life: 0.36, max: 0.36, col: col || '#ffae33' });
    }
    function addFloat(wx, wy, text, col) {
      floats.push({ x: wx, y: wy, text: text, col: col || '#ffe853', life: 0.85, max: 0.85 });
      if (floats.length > 24) floats.shift();
    }
    function updateFx(dt) {
      for (var i = rings.length - 1; i >= 0; i--) {
        var r = rings[i];
        r.life -= dt;
        if (r.life <= 0) rings.splice(i, 1);
        else r.r = r.maxR * (1 - r.life / r.max);
      }
      for (var j = floats.length - 1; j >= 0; j--) {
        var f = floats[j];
        f.life -= dt;
        f.y -= dt * 1.4;
        if (f.life <= 0) floats.splice(j, 1);
      }
    }
    function clearFx() { rings.length = 0; floats.length = 0; }
    function hasFx() { return rings.length > 0 || floats.length > 0; }

    function drawCloud(x, y, s) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      // Soft sky-blue cloud belly
      ctx.fillStyle = 'rgba(180,228,255,0.75)';
      ctx.beginPath();
      ctx.roundRect(-54, 4, 108, 22, 11);
      ctx.fill();
      // Puffy crisp voxel-style white lobes
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.roundRect(-52, -2, 104, 22, 11);
      ctx.roundRect(-34, -18, 44, 24, 12);
      ctx.roundRect(2, -12, 34, 20, 10);
      ctx.fill();
      ctx.restore();
    }

    function drawSky(ox, oy, surfPx, t) {
      var skyH = Math.min(VH, surfPx + 4);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, VW, skyH);

      // Radiant warm sun positioned cleanly in right-side open sky (clear of timer & pause/mute!)
      var sunX = 1005 - ox * 0.04;
      var sunY = Math.min(skyH - 42, 62 - oy * 0.08);
      if (sunY > -40) {
        ctx.save();
        ctx.translate(sunX, sunY);
        // Rotating soft rays
        ctx.fillStyle = 'rgba(255,244,160,0.22)';
        for (var ri = 0; ri < 8; ri++) {
          ctx.save();
          ctx.rotate(t * 0.16 + (ri * Math.PI) / 4);
          ctx.beginPath();
          ctx.moveTo(-8, -32); ctx.lineTo(8, -32); ctx.lineTo(0, -58); ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(255,235,120,0.26)';
        ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff9c4';
        ctx.beginPath(); ctx.arc(-6, -6, 13, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Layered drifting puffy clouds
      var drift = (t * 9) % (VW + 260);
      drawCloud(((170 - ox * 0.12 + drift * 0.45) % (VW + 220)) - 90, 62 - oy * 0.08, 0.92);
      drawCloud(((530 - ox * 0.14 + drift * 0.3) % (VW + 220)) - 90, 44 - oy * 0.08, 0.78);
      drawCloud(((850 - ox * 0.1 + drift * 0.38) % (VW + 220)) - 90, 56 - oy * 0.08, 0.85);

      // Distant parallax turquoise mountains
      ctx.fillStyle = '#5bb8e8';
      ctx.beginPath();
      ctx.moveTo(0, surfPx);
      var mOff = -(ox * 0.12) % 320;
      for (var mx = mOff - 320; mx < VW + 320; mx += 320) {
        ctx.lineTo(mx + 80, surfPx - 68);
        ctx.lineTo(mx + 160, surfPx - 24);
        ctx.lineTo(mx + 245, surfPx - 82);
        ctx.lineTo(mx + 320, surfPx);
      }
      ctx.lineTo(VW, surfPx);
      ctx.closePath();
      ctx.fill();

      // Closer rolling emerald meadow hills
      ctx.fillStyle = '#47b864';
      ctx.beginPath();
      ctx.moveTo(0, surfPx);
      var hOff = -(ox * 0.24) % 260;
      for (var hx = hOff - 260; hx < VW + 260; hx += 260) {
        ctx.quadraticCurveTo(hx + 65, surfPx - 42, hx + 130, surfPx - 14);
        ctx.quadraticCurveTo(hx + 195, surfPx - 36, hx + 260, surfPx);
      }
      ctx.lineTo(VW, surfPx);
      ctx.closePath();
      ctx.fill();

      // Cute stylized pine trees dotted along the distant hills
      var treeOff = -(ox * 0.35) % 220;
      for (var tx = treeOff; tx < VW + 120; tx += 220) {
        var ty = surfPx;
        ctx.fillStyle = '#5c3820';
        ctx.fillRect(tx - 4, ty - 14, 8, 14);
        ctx.fillStyle = '#257d46';
        ctx.beginPath(); ctx.moveTo(tx - 16, ty - 12); ctx.lineTo(tx, ty - 42); ctx.lineTo(tx + 16, ty - 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#33a35a';
        ctx.beginPath(); ctx.moveTo(tx - 12, ty - 24); ctx.lineTo(tx, ty - 48); ctx.lineTo(tx + 12, ty - 24); ctx.closePath(); ctx.fill();
      }
    }

    function drawMineShaftDecor(world, t) {
      var sx = Math.floor(world.W / 2);
      var leftX = (sx - 1) * TS;
      var rightX = (sx + 2) * TS;
      var topY = 4 * TS;

      // Wooden timber entrance arch straddling the mine shaft (y = 4)
      ctx.save();
      ctx.strokeStyle = '#1b1640';
      ctx.lineWidth = 3;
      // Left & right support posts
      ctx.fillStyle = '#7a4924';
      ctx.fillRect(leftX - 10, topY - 46, 12, 48);
      ctx.strokeRect(leftX - 10, topY - 46, 12, 48);
      ctx.fillRect(rightX - 2, topY - 46, 12, 48);
      ctx.strokeRect(rightX - 2, topY - 46, 12, 48);
      // Crossbeam
      ctx.fillStyle = '#995e30';
      ctx.beginPath(); ctx.roundRect(leftX - 18, topY - 56, (rightX - leftX) + 36, 15, 5); ctx.fill(); ctx.stroke();
      // Hanging warm mine lantern on right post
      var sway = Math.sin(t * 2.5) * 2;
      var lx = leftX + 12 + sway, ly = topY - 30;
      ctx.fillStyle = 'rgba(255,220,100,0.28)';
      ctx.beginPath(); ctx.arc(lx, ly + 4, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd633';
      ctx.fillRect(lx - 5, ly - 3, 10, 12);
      ctx.strokeRect(lx - 5, ly - 3, 10, 12);

      // Decorative wooden ladder down the shaft wall (rows 4..9)
      var ladX = leftX + 8;
      ctx.fillStyle = 'rgba(138,85,42,0.72)';
      ctx.fillRect(ladX, topY, 5, 6 * TS);
      ctx.fillRect(ladX + 20, topY, 5, 6 * TS);
      for (var ry = topY + 10; ry < topY + 6 * TS; ry += 18) {
        ctx.fillRect(ladX + 4, ry, 17, 4);
      }
      ctx.restore();
    }

    function drawRelicIcon(rel, t) {
      var id = rel.id;
      ctx.strokeStyle = '#1b1640';
      ctx.lineWidth = 3.2;
      if (id === 0) {
        // Royal Golden Crown
        ctx.fillStyle = '#ffd633';
        ctx.beginPath();
        ctx.moveTo(-18, 12); ctx.lineTo(-20, -10); ctx.lineTo(-8, 0); ctx.lineTo(0, -16);
        ctx.lineTo(8, 0); ctx.lineTo(20, -10); ctx.lineTo(18, 12); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff3b73';
        ctx.beginPath(); ctx.arc(0, 4, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff9c4';
        ctx.fillRect(-14, 7, 28, 3);
      } else if (id === 1) {
        // Faceted Crystal Diamond
        ctx.fillStyle = '#38f6ee';
        ctx.beginPath();
        ctx.moveTo(0, -21); ctx.lineTo(18, -4); ctx.lineTo(0, 21); ctx.lineTo(-18, -4); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8ffff';
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(9, -4); ctx.lineTo(0, 2); ctx.lineTo(-9, -4); ctx.closePath(); ctx.fill();
      } else {
        // Radiant Ruby Star
        ctx.fillStyle = '#ff5286';
        ctx.beginPath();
        for (var k = 0; k < 10; k++) {
          var a = -Math.PI / 2 + (k * Math.PI) / 5;
          var r = k % 2 === 0 ? 21 : 9.5;
          var sx = Math.cos(a) * r, sy = Math.sin(a) * r;
          if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe5f0';
        ctx.beginPath(); ctx.arc(-4, -4, 4.5, 0, Math.PI * 2); ctx.fill();
      }
      // Orbiting sparkle dots
      for (var sp = 0; sp < 2; sp++) {
        var ang = t * 3.2 + sp * Math.PI;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(Math.cos(ang) * 26, Math.sin(ang) * 18, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    function draw(world, opts) {
      opts = opts || {};
      var dt = opts.dt || 0.016;
      var t = opts.t || 0;
      var shake = opts.shake || { x: 0, y: 0 };
      var particles = opts.particles;
      var p = world.p;

      // IMPORTANT: runtime-cleanup.test.mjs hooks clearRect on canvas#game to count paints!
      ctx.clearRect(0, 0, VW, VH);

      var targetCamX, targetCamY;
      if (opts.titleMode) {
        // Scenic fixed framing on title so sunny sky, mine shaft, portal, relics & hovering miner ALL shine!
        targetCamX = BW.clamp(32.5 * TS - VW / 2, 0, world.W * TS - VW);
        targetCamY = 20;
      } else {
        targetCamX = BW.clamp(p.x * TS - VW / 2, 0, world.W * TS - VW);
        targetCamY = BW.clamp(p.y * TS - VH / 2, 0, world.H * TS - VH);
      }

      if (opts.snap) { camX = targetCamX; camY = targetCamY; }
      else {
        var k = 1 - Math.exp(-dt * 10);
        camX += (targetCamX - camX) * k;
        camY += (targetCamY - camY) * k;
      }

      var ox = Math.round(camX - shake.x);
      var oy = Math.round(camY - shake.y);

      // 1. Rich layered sky + distant mountains + trees
      var surfPx = 4 * TS - oy;
      if (surfPx > 0) drawSky(ox, oy, surfPx, t);

      // 2. Textured atmospheric cavern backdrop (strictly clipped below grass horizon!)
      var caveTop = Math.max(0, surfPx);
      if (caveTop < VH) {
        var depthFrac = BW.clamp(p.y / world.H, 0, 1);
        var patIdx = depthFrac > 0.65 ? 2 : depthFrac > 0.35 ? 1 : 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, caveTop, VW, VH - caveTop);
        ctx.clip();
        ctx.translate(-ox % 88, -oy % 88);
        ctx.fillStyle = cavePatterns[patIdx];
        ctx.fillRect((ox % 88) - 88, caveTop + (oy % 88) - 88, VW + 176, VH - caveTop + 176);
        ctx.restore();
      }

      ctx.save();
      ctx.translate(-ox, -oy);

      // Surface mine-shaft wooden arch & ladder (drawn behind miner!)
      drawMineShaftDecor(world, t);

      // 3. Draw visible textured voxel tiles!
      var x0 = Math.max(0, Math.floor(ox / TS));
      var x1 = Math.min(world.W - 1, Math.ceil((ox + VW) / TS));
      var y0 = Math.max(0, Math.floor(oy / TS));
      var y1 = Math.min(world.H - 1, Math.ceil((oy + VH) / TS));

      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var id = world.tiles[y * world.W + x];
          if (id === T.AIR) continue;
          var list = sprites[id];
          if (list) {
            var sp = list.length > 1 ? list[tileHash(x, y) % list.length] : list[0];
            ctx.drawImage(sp, x * TS, y * TS);
            // Subtle sunlit edge highlight when block faces open cavern air above
            if (y > 4 && world.tiles[(y - 1) * world.W + x] === T.AIR) {
              ctx.fillStyle = 'rgba(255,248,215,0.22)';
              ctx.fillRect(x * TS + 2, y * TS, TS - 4, 3);
            }
            // Subtle animated ore sparkle glint on gold/diamond/ruby
            if (id === T.GOLD || id === T.DIAMOND || id === T.RUBY) {
              var tw = Math.sin(t * 4.2 + x * 1.7 + y * 2.3);
              if (tw > 0.86) {
                var gx = x * TS + 12 + ((x * 7 + y * 3) % 20);
                var gy = y * TS + 12 + ((x * 5 + y * 11) % 20);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(gx - 3, gy - 1, 7, 2);
                ctx.fillRect(gx - 1, gy - 3, 2, 7);
              }
            }
          }
          // Crisp crack overlay while Auto-Drilling!
          var dmg = world.dmg[y * world.W + x];
          if (dmg > 0.04) {
            ctx.strokeStyle = '#1b1640';
            ctx.lineWidth = 3;
            var px = x * TS, py = y * TS;
            ctx.beginPath();
            ctx.moveTo(px + 10, py + 10);
            ctx.lineTo(px + 22, py + 22);
            if (dmg > 0.35) { ctx.lineTo(px + 34, py + 14); ctx.moveTo(px + 22, py + 22); ctx.lineTo(px + 14, py + 36); }
            if (dmg > 0.65) { ctx.moveTo(px + 22, py + 22); ctx.lineTo(px + 36, py + 34); }
            ctx.stroke();
          }
        }
      }

      // Cute surface grass tufts along grass surface (y=4)
      if (y0 <= 4 && y1 >= 3) {
        for (var gx2 = x0; gx2 <= x1; gx2++) {
          if (world.tiles[4 * world.W + gx2] !== T.GRASS || world.tiles[3 * world.W + gx2] !== T.AIR) continue;
          var h = tileHash(gx2, 4);
          if (h % 3 !== 0) continue;
          var bx = gx2 * TS + 8 + (h % 20), by = 4 * TS;
          ctx.fillStyle = '#3ed654';
          ctx.fillRect(bx, by - 6, 3, 6);
          ctx.fillRect(bx + 5, by - 9, 3, 9);
          ctx.fillRect(bx + 10, by - 5, 3, 5);
          if (h % 9 === 0) {
            ctx.fillStyle = h % 2 === 0 ? '#ff7eb6' : '#ffe457';
            ctx.fillRect(bx + 4, by - 12, 5, 4);
          }
        }
      }

      // 4. Glowing Stylized Runic Escape Portals (offset clear of top-center timer!)
      for (var pi = 0; pi < world.portals.length; pi++) {
        var pt = world.portals[pi];
        var ppx = pt.x * TS, ppy = pt.y * TS;
        var pulse = 1 + Math.sin(t * 6) * 0.08;
        ctx.save();
        ctx.translate(ppx, ppy);
        // Outer magical aura
        ctx.fillStyle = pt.active ? 'rgba(64,245,168,0.34)' : 'rgba(130,170,255,0.22)';
        ctx.beginPath(); ctx.arc(0, 6, (pt.active ? 58 : 40) * pulse, 0, Math.PI * 2); ctx.fill();
        // Stone pedestal base resting cleanly on grass
        ctx.fillStyle = '#5d6485';
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.roundRect(-36, 34, 72, 13, 5); ctx.fill(); ctx.stroke();
        // Ornate rune arch frame
        ctx.fillStyle = pt.active ? '#1fc488' : '#4e567d';
        ctx.beginPath(); ctx.roundRect(-29, -30, 58, 68, [26, 26, 6, 6]); ctx.fill(); ctx.stroke();
        // Golden arch trim
        ctx.strokeStyle = pt.active ? '#b5ffe2' : '#ffd238';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(-23, -24, 46, 56, [20, 20, 4, 4]); ctx.stroke();
        // Inner swirling portal vortex
        ctx.fillStyle = pt.active ? '#8affdc' : '#2a2f52';
        ctx.beginPath(); ctx.roundRect(-17, -18, 34, 48, [15, 15, 3, 3]); ctx.fill();
        ctx.strokeStyle = pt.active ? '#ffffff' : 'rgba(120,210,255,0.5)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 6, 9 + Math.sin(t * 7) * 2, t * 3, t * 3 + Math.PI * 1.4);
        ctx.stroke();
        // 3 Relic Socket Gems along the arch crest!
        for (var rk = 0; rk < 3; rk++) {
          var lit = world.relicsGot > rk;
          ctx.fillStyle = lit ? '#ffd633' : '#262b47';
          ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc((rk - 1) * 14, -30, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        if (pt.active) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 4;
          ctx.font = '800 18px Fredoka, sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeText('✨ خروج!', 0, -45);
          ctx.fillText('✨ خروج!', 0, -45);
        }
        ctx.restore();
      }

      // 5. The 3 Glowing Iconic Relics!
      for (var ri = 0; ri < world.relics.length; ri++) {
        var rel = world.relics[ri];
        if (rel.got) continue;
        var rx = rel.x * TS, ry = rel.y * TS + Math.sin(t * 5 + ri) * 6;
        ctx.save();
        ctx.translate(rx, ry);
        // Soft pulsing magic halo
        ctx.fillStyle = rel.glow;
        ctx.globalAlpha = 0.28 + Math.sin(t * 6 + ri) * 0.1;
        ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        drawRelicIcon(rel, t + ri);
        ctx.restore();
      }

      // 6. Magnetized Sparkling Gems!
      for (var di = 0; di < world.drops.length; di++) {
        var d = world.drops[di];
        var dx = d.x * TS, dy = d.y * TS + Math.sin(t * 8 + d.id) * 3;
        ctx.fillStyle = d.col;
        ctx.strokeStyle = '#1b1640';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 11); ctx.lineTo(dx + 9, dy); ctx.lineTo(dx, dy + 11); ctx.lineTo(dx - 9, dy); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(dx - 3, dy - 5, 3, 4);
      }

      // 7. Bouncy Crystal Slimes!
      for (var si = 0; si < world.slimes.length; si++) {
        var sl = world.slimes[si];
        if (!sl.alive) continue;
        var slx = sl.x * TS, sly = sl.y * TS;
        var sq = sl.vy < -1 ? 1.15 : 0.94;
        ctx.save();
        ctx.translate(slx, sly);
        ctx.scale(2 - sq, sq);
        ctx.fillStyle = sl.col;
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-18, -16, 36, 30, 12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.roundRect(-13, -12, 14, 6, 3); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-10, -6, 7, 8); ctx.fillRect(3, -6, 7, 8);
        ctx.fillStyle = '#1b1640';
        ctx.fillRect(-8, -4, 4, 5); ctx.fillRect(5, -4, 4, 5);
        ctx.restore();
      }

      // 8. Active Flashing TNT Bombs with Fuse Ring!
      for (var ti = 0; ti < world.tnts.length; ti++) {
        var b = world.tnts[ti];
        var bx = b.x * TS, by = b.y * TS;
        var frac = BW.clamp(b.fuse / b.maxFuse, 0, 1);
        var flash = Math.floor(t * 18) % 2 === 0;
        var sc = 1 + (1 - frac) * 0.25;
        ctx.save();
        ctx.translate(bx, by);
        ctx.strokeStyle = 'rgba(255,100,60,0.48)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, b.radius * TS * (0.4 + 0.6 * (1 - frac)), 0, Math.PI * 2); ctx.stroke();
        ctx.scale(sc, sc);
        ctx.fillStyle = flash ? '#fff2a8' : '#e63946';
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.roundRect(-18, -18, 36, 36, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-16, -6, 32, 12);
        ctx.fillStyle = '#1b1640';
        ctx.font = '800 12px Fredoka, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('TNT', 0, 1);
        ctx.restore();
      }

      // 9. Warm Headlamp Glow + Directional Light Cone + Cute Chunky Jetpack Miner!
      var px = p.x * TS, py = p.y * TS;
      ctx.drawImage(glowCanvas, px - 210, py - 210);
      // Soft headlamp cone beam
      ctx.save();
      ctx.translate(px + p.face * 12, py - 20);
      ctx.fillStyle = 'rgba(255,248,196,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, -4); ctx.lineTo(p.face * 128, -36); ctx.lineTo(p.face * 128, 36); ctx.lineTo(0, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      var blink = p.invuln > 0 && Math.floor(t * 16) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(px, py);
        // Subtle ground shadow
        if (p.ground) {
          ctx.fillStyle = 'rgba(12,10,28,0.34)';
          ctx.beginPath(); ctx.ellipse(0, 19, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
        }
        // Jetpack flame!
        if (p.jetting || opts.titleMode) {
          var fl = 14 + Math.sin(t * 42) * 6;
          ctx.fillStyle = '#ff6b2b';
          ctx.beginPath(); ctx.moveTo(-p.face * 14 - 7, 10); ctx.lineTo(-p.face * 14 + 7, 10); ctx.lineTo(-p.face * 14, 16 + fl); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff380';
          ctx.beginPath(); ctx.moveTo(-p.face * 14 - 3.5, 10); ctx.lineTo(-p.face * 14 + 3.5, 10); ctx.lineTo(-p.face * 14, 12 + fl * 0.62); ctx.closePath(); ctx.fill();
        }
        // Metallic Jetpack canister on back
        ctx.fillStyle = '#ff9f1c';
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-p.face * 17 - 5, -9, 11, 21, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe082';
        ctx.fillRect(-p.face * 17 - 3, -6, 3, 12);
        // Body + bright overalls strap
        ctx.fillStyle = '#1ecbe1';
        ctx.beginPath(); ctx.roundRect(-12, -4, 24, 22, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd238';
        ctx.fillRect(-10, 8, 20, 4);
        // Head + Cheery Mining Helmet + Glowing Headlamp
        ctx.fillStyle = '#f8caa2';
        ctx.beginPath(); ctx.roundRect(-14, -24, 28, 22, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd238';
        ctx.beginPath(); ctx.roundRect(-16, -29, 32, 12, [7, 7, 3, 3]); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff9c4';
        ctx.beginPath(); ctx.roundRect(p.face > 0 ? 7 : -16, -26, 9, 7, 3); ctx.fill(); ctx.stroke();
        // Expressive eye + rosy cheek
        ctx.fillStyle = '#1b1640';
        ctx.fillRect(p.face > 0 ? 4 : -9, -15, 5, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.face > 0 ? 6 : -7, -14, 2, 2);
        ctx.fillStyle = 'rgba(255,110,130,0.45)';
        ctx.fillRect(p.face > 0 ? 0 : -5, -9, 4, 3);
        // Spinning Spiral Auto-Drill Cone!
        ctx.save();
        ctx.translate(p.face * 15, 4);
        var jiggle = p.drilling ? Math.sin(p.drillAnim) * 3 : 0;
        ctx.translate(jiggle, 0);
        ctx.fillStyle = '#38f6ee';
        ctx.beginPath();
        ctx.moveTo(0, -9); ctx.lineTo(p.face * 20, 0); ctx.lineTo(0, 9); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.face * 5, -5); ctx.lineTo(p.face * 9, 4); ctx.stroke();
        ctx.restore();
        ctx.restore();
      }

      // 10. TNT Shockwave Rings, Particles & Floating Score Popups
      for (var rIdx = 0; rIdx < rings.length; rIdx++) {
        var rg = rings[rIdx];
        ctx.save();
        ctx.globalAlpha = BW.clamp(rg.life / rg.max, 0, 1);
        ctx.strokeStyle = rg.col;
        ctx.lineWidth = 8 * (rg.life / rg.max);
        ctx.beginPath(); ctx.arc(rg.x * TS, rg.y * TS, rg.r * TS, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (particles) particles.draw(ctx);

      ctx.font = '700 24px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      for (var fIdx = 0; fIdx < floats.length; fIdx++) {
        var fl2 = floats[fIdx];
        ctx.save();
        ctx.globalAlpha = BW.clamp(fl2.life / fl2.max, 0, 1);
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 5;
        ctx.strokeText(fl2.text, fl2.x * TS, fl2.y * TS);
        ctx.fillStyle = fl2.col;
        ctx.fillText(fl2.text, fl2.x * TS, fl2.y * TS);
        ctx.restore();
      }

      ctx.restore();

      // 11. Screen-Space Bright Directional Edge Arrow pointing to nearest Relic or Escape Portal!
      if (!opts.hideArrows) {
        var target = BW.activeTarget(world);
        if (target) {
          var sxT = target.x * TS - ox, syT = target.y * TS - oy;
          var onScreen = sxT > 56 && sxT < VW - 56 && syT > 84 && syT < VH - 84;
          if (!onScreen) {
            var ang = Math.atan2(syT - VH / 2, sxT - VW / 2);
            var ex = BW.clamp(VW / 2 + Math.cos(ang) * 560, 74, VW - 74);
            var ey = BW.clamp(VH / 2 + Math.sin(ang) * 280, 108, VH - 96);
            var bounce = Math.sin(t * 7) * 5;
            ctx.save();
            ctx.translate(ex + Math.cos(ang) * bounce, ey + Math.sin(ang) * bounce);
            ctx.fillStyle = target.col;
            ctx.strokeStyle = '#1b1640';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.save();
            ctx.rotate(ang);
            ctx.fillStyle = '#1b1640';
            ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-6, -11); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill();
            ctx.restore();
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 4;
            ctx.font = '700 17px Fredoka, sans-serif';
            ctx.textAlign = 'center';
            var label = target.kind === 'portal' ? 'خروج ' + target.dist + 'م' : target.dist + 'م';
            ctx.strokeText(label, 0, 46);
            ctx.fillText(label, 0, 46);
            ctx.restore();
          }
        }
      }
    }

    return {
      draw: draw,
      addRing: addRing,
      addFloat: addFloat,
      updateFx: updateFx,
      clearFx: clearFx,
      hasFx: hasFx,
      screenToWorld: function (lx, ly) { return { x: (lx + camX) / TS, y: (ly + camY) / TS }; }
    };
  };
})();

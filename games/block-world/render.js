/* Block World — TNT Mine Dash (عالم المكعبات)
 * Crisp, readable 44px chunky voxel Canvas2D renderer with pre-baked tile sprites,
 * headlamp cave lighting, animated Auto-Drill + Jetpack miner, pulsing TNT rings,
 * glowing Relics, directional screen-edge guide arrows, and juicy explosion shockwaves! */
(function () {
  'use strict';
  var BW = window.BW;
  var TS = BW.TS, T = BW.T, BLOCKS = BW.BLOCKS;

  BW.createRenderer = function (canvas, ctx) {
    var VW = 1280, VH = 720;
    var camX = 32 * TS - VW / 2, camY = 9 * TS - VH / 2;
    var rings = []; // Expanding TNT shockwaves
    var floats = []; // Floating "+12" / "أثر!" popups

    // Pre-bake 13 chunky 44x44 offscreen voxel tiles in <4ms (zero per-frame gradient churn!).
    var sprites = {};
    function bakeTiles() {
      for (var idStr in BLOCKS) {
        var b = BLOCKS[idStr];
        if (!b.solid) continue;
        var c = document.createElement('canvas');
        c.width = c.height = TS;
        var g = c.getContext('2d');
        g.fillStyle = b.col;
        g.fillRect(0, 0, TS, TS);
        // Chunky bevel highlight & shadow
        g.fillStyle = b.hi || 'rgba(255,255,255,0.2)';
        g.fillRect(0, 0, TS, 5);
        g.fillRect(0, 0, 5, TS);
        g.fillStyle = b.lo || 'rgba(0,0,0,0.28)';
        g.fillRect(0, TS - 6, TS, 6);
        g.fillRect(TS - 5, 0, 5, TS);
        // Grass top turf
        if (b.top) {
          g.fillStyle = b.top;
          g.fillRect(0, 0, TS, 12);
          g.fillStyle = b.hi;
          g.fillRect(0, 0, TS, 5);
          g.fillStyle = '#2ea33a';
          g.fillRect(6, 12, 8, 5);
          g.fillRect(24, 12, 10, 4);
        }
        // Embedded bright ore gems
        if (b.ore) {
          g.fillStyle = b.ore;
          g.fillRect(9, 10, 10, 10);
          g.fillRect(25, 22, 11, 10);
          g.fillRect(12, 29, 7, 7);
          g.fillStyle = b.shine || '#fff';
          g.fillRect(10, 11, 4, 4);
          g.fillRect(26, 23, 4, 4);
        }
        // Buried TNT barrel!
        if (b.tnt) {
          g.fillStyle = '#ffffff';
          g.fillRect(3, 14, TS - 6, 16);
          g.fillStyle = '#1b1640';
          g.font = '700 13px Fredoka, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('TNT', TS / 2, TS / 2 + 1);
        }
        // Crisp toy-ink border
        g.strokeStyle = 'rgba(22,18,46,0.55)';
        g.lineWidth = 2;
        g.strokeRect(1, 1, TS - 2, TS - 2);
        sprites[b.id] = c;
      }
    }
    bakeTiles();

    // Cached glowing radial headlamp overlay (reused, zero per-frame createRadialGradient!).
    var glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 360;
    (function () {
      var gg = glowCanvas.getContext('2d');
      var gr = gg.createRadialGradient(180, 180, 18, 180, 180, 180);
      gr.addColorStop(0, 'rgba(255,244,196,0.28)');
      gr.addColorStop(0.5, 'rgba(255,210,120,0.10)');
      gr.addColorStop(1, 'rgba(255,200,100,0)');
      gg.fillStyle = gr;
      gg.fillRect(0, 0, 360, 360);
    })();

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

    function draw(world, opts) {
      opts = opts || {};
      var dt = opts.dt || 0.016;
      var t = opts.t || 0;
      var shake = opts.shake || { x: 0, y: 0 };
      var particles = opts.particles;
      var p = world.p;

      // IMPORTANT: runtime-cleanup.test.mjs hooks clearRect on canvas#game to count paints!
      ctx.clearRect(0, 0, VW, VH);

      // Smooth camera centered tightly on the miner!
      var targetCamX = BW.clamp(p.x * TS - VW / 2, 0, world.W * TS - VW);
      var targetCamY = BW.clamp(p.y * TS - VH / 2, 0, world.H * TS - VH);
      if (opts.snap) { camX = targetCamX; camY = targetCamY; }
      else {
        var k = 1 - Math.exp(-dt * 10);
        camX += (targetCamX - camX) * k;
        camY += (targetCamY - camY) * k;
      }

      var ox = Math.round(camX - shake.x);
      var oy = Math.round(camY - shake.y);

      // Background sky & rich layered underground cavern wall backdrop!
      var surfPx = 4 * TS - oy;
      if (surfPx > 0) {
        ctx.fillStyle = '#5ac8ff';
        ctx.fillRect(0, 0, VW, Math.min(VH, surfPx));
        // Cheerful blocky sun & fluffy clouds
        ctx.fillStyle = '#ffe457';
        ctx.fillRect(980 - ox * 0.1, 34 - oy * 0.1, 68, 68);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(180 - ox * 0.15, 58 - oy * 0.1, 120, 32);
        ctx.fillRect(620 - ox * 0.15, 42 - oy * 0.1, 140, 34);
      }
      var caveTop = Math.max(0, surfPx);
      if (caveTop < VH) {
        var depthFrac = BW.clamp(p.y / world.H, 0, 1);
        ctx.fillStyle = depthFrac > 0.65 ? '#1b1129' : depthFrac > 0.35 ? '#191c38' : '#2b2024';
        ctx.fillRect(0, caveTop, VW, VH - caveTop);
      }

      ctx.save();
      ctx.translate(-ox, -oy);

      // Draw visible voxel tiles!
      var x0 = Math.max(0, Math.floor(ox / TS));
      var x1 = Math.min(world.W - 1, Math.ceil((ox + VW) / TS));
      var y0 = Math.max(0, Math.floor(oy / TS));
      var y1 = Math.min(world.H - 1, Math.ceil((oy + VH) / TS));

      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var id = world.tiles[y * world.W + x];
          if (id === T.AIR) continue;
          var sp = sprites[id];
          if (sp) ctx.drawImage(sp, x * TS, y * TS);
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

      // Draw Escape Portals (glowing swirling voxel arches!).
      for (var pi = 0; pi < world.portals.length; pi++) {
        var pt = world.portals[pi];
        var ppx = pt.x * TS, ppy = pt.y * TS;
        var pulse = 1 + Math.sin(t * 7) * 0.1;
        ctx.save();
        ctx.translate(ppx, ppy);
        ctx.fillStyle = pt.active ? 'rgba(77,245,156,0.28)' : 'rgba(255,214,51,0.16)';
        ctx.beginPath(); ctx.arc(0, 0, (pt.active ? 52 : 34) * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pt.active ? '#2ee89e' : '#6c7399';
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(-24, -34, 48, 56, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = pt.active ? '#d4fff0' : '#3d4260';
        ctx.beginPath(); ctx.roundRect(-14, -24, 28, 36, 8); ctx.fill();
        if (pt.active) {
          ctx.fillStyle = '#fff';
          ctx.font = '700 18px Fredoka, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✨ خروج!', 0, -44);
        }
        ctx.restore();
      }

      // Draw the 3 Glowing Relics!
      for (var ri = 0; ri < world.relics.length; ri++) {
        var rel = world.relics[ri];
        if (rel.got) continue;
        var rx = rel.x * TS, ry = rel.y * TS + Math.sin(t * 5 + ri) * 6;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.fillStyle = rel.glow;
        ctx.globalAlpha = 0.28 + Math.sin(t * 6) * 0.1;
        ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // Sparkling diamond pedestal halo
        ctx.fillStyle = rel.col;
        ctx.strokeStyle = '#1b1640';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, -22); ctx.lineTo(20, 0); ctx.lineTo(0, 22); ctx.lineTo(-20, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-5, -6, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Draw Magnetized Gems!
      for (var di = 0; di < world.drops.length; di++) {
        var d = world.drops[di];
        var dx = d.x * TS, dy = d.y * TS + Math.sin(t * 8 + d.id) * 3;
        ctx.fillStyle = d.col;
        ctx.strokeStyle = '#1b1640';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 10); ctx.lineTo(dx + 9, dy); ctx.lineTo(dx, dy + 10); ctx.lineTo(dx - 9, dy); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }

      // Draw Bouncy Crystal Slimes!
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
        ctx.beginPath(); ctx.roundRect(-18, -16, 36, 30, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-10, -8, 7, 8); ctx.fillRect(3, -8, 7, 8);
        ctx.fillStyle = '#1b1640';
        ctx.fillRect(-8, -6, 4, 5); ctx.fillRect(5, -6, 4, 5);
        ctx.restore();
      }

      // Draw Active Flashing TNT Bombs with Fuse Ring!
      for (var ti = 0; ti < world.tnts.length; ti++) {
        var b = world.tnts[ti];
        var bx = b.x * TS, by = b.y * TS;
        var frac = BW.clamp(b.fuse / b.maxFuse, 0, 1);
        var flash = Math.floor(t * 18) % 2 === 0;
        var sc = 1 + (1 - frac) * 0.25;
        ctx.save();
        ctx.translate(bx, by);
        // Blast radius preview circle
        ctx.strokeStyle = 'rgba(255,100,60,0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, b.radius * TS * (0.4 + 0.6 * (1 - frac)), 0, Math.PI * 2); ctx.stroke();
        ctx.scale(sc, sc);
        ctx.fillStyle = flash ? '#fff2a8' : '#e63946';
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.roundRect(-18, -18, 36, 36, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-16, -6, 32, 12);
        ctx.fillStyle = '#1b1640';
        ctx.font = '700 12px Fredoka, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('TNT', 0, 1);
        ctx.restore();
      }

      // Draw Warm Headlamp Glow + Chunky Voxel Hero with Jetpack & Spinning Auto-Drill!
      var px = p.x * TS, py = p.y * TS;
      ctx.drawImage(glowCanvas, px - 180, py - 180);

      var blink = p.invuln > 0 && Math.floor(t * 16) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(px, py);
        // Jetpack flame!
        if (p.jetting) {
          var fl = 14 + Math.sin(t * 45) * 6;
          ctx.fillStyle = '#ff6b2b';
          ctx.beginPath(); ctx.moveTo(-p.face * 13 - 6, 8); ctx.lineTo(-p.face * 13 + 6, 8); ctx.lineTo(-p.face * 13, 14 + fl); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff380';
          ctx.beginPath(); ctx.moveTo(-p.face * 13 - 3, 8); ctx.lineTo(-p.face * 13 + 3, 8); ctx.lineTo(-p.face * 13, 10 + fl * 0.6); ctx.closePath(); ctx.fill();
        }
        // Jetpack canister on back
        ctx.fillStyle = '#ff9f1c';
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-p.face * 17 - 4, -8, 10, 20, 4); ctx.fill(); ctx.stroke();
        // Body
        ctx.fillStyle = '#22b8cf';
        ctx.beginPath(); ctx.roundRect(-12, -4, 24, 22, 5); ctx.fill(); ctx.stroke();
        // Head + Mining Helmet + Headlamp
        ctx.fillStyle = '#f6c59c';
        ctx.beginPath(); ctx.roundRect(-14, -24, 28, 22, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd238';
        ctx.beginPath(); ctx.roundRect(-16, -28, 32, 11, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff9c4';
        ctx.fillRect(p.face > 0 ? 8 : -16, -25, 8, 6);
        // Eye
        ctx.fillStyle = '#1b1640';
        ctx.fillRect(p.face > 0 ? 4 : -9, -15, 5, 6);
        // Spinning Auto-Drill Cone!
        ctx.save();
        ctx.translate(p.face * 16, 4);
        var jiggle = p.drilling ? Math.sin(p.drillAnim) * 3 : 0;
        ctx.translate(jiggle, 0);
        ctx.fillStyle = '#38f6ee';
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(p.face * 18, 0); ctx.lineTo(0, 8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.restore();
      }

      // Draw TNT Shockwave Rings, Kit.particles & Floating Score Popups!
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
        var fl = floats[fIdx];
        ctx.save();
        ctx.globalAlpha = BW.clamp(fl.life / fl.max, 0, 1);
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 5;
        ctx.strokeText(fl.text, fl.x * TS, fl.y * TS);
        ctx.fillStyle = fl.col;
        ctx.fillText(fl.text, fl.x * TS, fl.y * TS);
        ctx.restore();
      }

      ctx.restore();

      // Screen-Space Bright Directional Edge Arrow pointing to nearest Relic or Escape Portal!
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

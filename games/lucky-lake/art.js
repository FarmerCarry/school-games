/* Procedural lake, anglers and fish. Sprites are painted once. */
(function () {
  'use strict';
  var PAL = [
    { sky0: '#7ad4ff', sky1: '#fff3c4', hill: '#67c05a', hill2: '#2f8a48', water: '#1b93d6', deep: '#0b5f9c', sand: '#efd09a', grass: '#3e9a46', ripple: '#e7f8ff', wood: '#8d5a32', accent: '#ff5d7a' },
    { sky0: '#59c4ff', sky1: '#ffe6b0', hill: '#d2b07a', hill2: '#8d7344', water: '#1478c6', deep: '#0a4e88', sand: '#e7c98e', grass: '#d7b56e', ripple: '#e9f7ff', wood: '#7a4b28', accent: '#ffb703' },
    { sky0: '#5ee4ff', sky1: '#fff6d2', hill: '#2aa89a', hill2: '#14756c', water: '#12a3b0', deep: '#085e6c', sand: '#f2dcb8', grass: '#1f9a8c', ripple: '#e6fff8', wood: '#e07a5f', accent: '#ff6b9a' },
    { sky0: '#d5eeff', sky1: '#ffffff', hill: '#eef6ff', hill2: '#c5d9ec', water: '#8ec6e6', deep: '#3d82ac', sand: '#f5fbff', grass: '#e7f3ff', ripple: '#ffffff', wood: '#d5e6f4', accent: '#9fdfff' },
    { sky0: '#3c365c', sky1: '#e39a62', hill: '#1c332c', hill2: '#12241e', water: '#1b5148', deep: '#0c2822', sand: '#3e4032', grass: '#243628', ripple: '#a9c2ae', wood: '#3a2a20', accent: '#e7c25a' },
    { sky0: '#ff7a3a', sky1: '#ffd0a6', hill: '#6e3030', hill2: '#3c1818', water: '#d4532a', deep: '#7a2216', sand: '#8a4030', grass: '#5c2820', ripple: '#ffd2a4', wood: '#4a241c', accent: '#ffd24a' },
    { sky0: '#8d7cff', sky1: '#f4e8ff', hill: '#ffffff', hill2: '#e6e0ff', water: '#8ec8ff', deep: '#4a78c4', sand: '#f4f0ff', grass: '#ffffff', ripple: '#ffffff', wood: '#ddd6ff', accent: '#ffe56a' }
  ];
  var cache = {};

  function shade(hex, t) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (12 - r) * t);
    g = Math.round(g + (20 - g) * t);
    b = Math.round(b + (52 - b) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function palette(spot, night) {
    var src = PAL[spot] || PAL[0];
    if (night < 0.08) return src;
    var key = spot + ':' + (night > 0.55 ? 1 : 0);
    if (cache[key]) return cache[key];
    var out = {};
    for (var k in src) out[k] = night > 0.55 ? shade(src[k], 0.55) : src[k];
    if (night > 0.55) { out.ripple = '#9ecfff'; out.accent = '#ffe08a'; }
    cache[key] = out;
    return out;
  }

  function paintFish(ctx, fish, w, h, sil) {
    if (fish.id === 49) return paintBoot(ctx, w, h, sil);
    if (fish.id === 50) return paintDuck(ctx, w, h, sil);
    if (fish.id === 51) return paintBottle(ctx, w, h, sil);
    if (fish.id === 52) return paintChest(ctx, w, h, sil);
    var body = sil ? '#1b2436' : fish.body;
    var belly = sil ? '#1b2436' : fish.belly;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w * 0.56, h * 0.55);
    var s = h * 0.32;
    ctx.fillStyle = body;
    ctx.beginPath();
    if (fish.tail === 1) {
      ctx.moveTo(-s * 0.65, 0); ctx.lineTo(-s * 1.75, -s * 0.72); ctx.lineTo(-s * 1.2, 0); ctx.lineTo(-s * 1.75, s * 0.72);
    } else if (fish.tail === 2) {
      ctx.ellipse(-s * 1.2, 0, s * 0.48, s * 0.58, 0, 0, 6.3);
    } else {
      ctx.moveTo(-s * 0.5, 0); ctx.lineTo(-s * 1.6, -s * 0.66); ctx.lineTo(-s * 1.6, s * 0.66);
    }
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(fish.boss ? s * 0.05 : 0, 0, s * (fish.boss ? 1.4 : 1.12), s * (fish.boss ? 0.78 : 0.58), 0, 0, 6.3);
    ctx.fill();
    if (!sil) {
      ctx.fillStyle = belly;
      ctx.beginPath();
      ctx.ellipse(s * 0.12, s * 0.16, s * 0.7, s * 0.3, 0, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = body;
      if (fish.pat === 1) {
        for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-s * 0.35 + i * s * 0.4, -s * 0.02, s * 0.13, 0, 6.3); ctx.fill(); }
      } else if (fish.pat === 0) {
        ctx.globalAlpha = 0.35;
        for (var k = 0; k < 3; k++) ctx.fillRect(-s * 0.45 + k * s * 0.42, -s * 0.55, s * 0.1, s * 1.1);
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.moveTo(-s * 0.05, -s * 0.42); ctx.lineTo(s * 0.2, -s * 1.05); ctx.lineTo(s * 0.5, -s * 0.32);
      ctx.fill();
      if (fish.boss) {
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, -s * 0.7); ctx.lineTo(0, -s * 1.35); ctx.lineTo(s * 0.25, -s * 0.7);
        ctx.fill();
      }
      if (fish.id === 54) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(s * 0.9, s * 0.05); ctx.lineTo(s * 1.25, -s * 0.15); ctx.lineTo(s * 1.15, s * 0.2); ctx.fill();
      }
      if (fish.id === 58) {
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.5); ctx.lineTo(s * 0.45, -s * 1.2); ctx.lineTo(s * 0.7, -s * 0.45); ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s * 0.62, -s * 0.08, s * 0.22, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#243044';
      ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.06, s * 0.1, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(20,30,40,0.7)';
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath(); ctx.arc(s * 0.35, s * 0.08, s * 0.2, 0.15, 1.3); ctx.stroke();
    }
    ctx.restore();
  }
  function paintBoot(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#6b4a34';
    ctx.beginPath();
    ctx.roundRect(w * 0.22, h * 0.28, w * 0.28, h * 0.48, 8);
    ctx.roundRect(w * 0.22, h * 0.55, w * 0.55, h * 0.22, 8);
    ctx.fill();
  }
  function paintDuck(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#ffd23a';
    ctx.beginPath(); ctx.ellipse(w * 0.48, h * 0.58, w * 0.28, h * 0.22, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.68, h * 0.38, h * 0.18, 0, 6.3); ctx.fill();
    if (!sil) {
      ctx.fillStyle = '#ff8a1a';
      ctx.beginPath(); ctx.moveTo(w * 0.78, h * 0.38); ctx.lineTo(w * 0.96, h * 0.42); ctx.lineTo(w * 0.78, h * 0.48); ctx.fill();
      ctx.fillStyle = '#243044';
      ctx.beginPath(); ctx.arc(w * 0.74, h * 0.34, 3, 0, 6.3); ctx.fill();
    }
  }
  function paintBottle(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#8fd4ff';
    ctx.beginPath(); ctx.roundRect(w * 0.38, h * 0.22, w * 0.24, h * 0.58, 8); ctx.fill();
    ctx.fillStyle = sil ? '#1b2436' : '#c48a4a';
    ctx.fillRect(w * 0.42, h * 0.14, w * 0.16, h * 0.12);
  }
  function paintChest(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#e2b04a';
    ctx.beginPath(); ctx.roundRect(w * 0.18, h * 0.34, w * 0.64, h * 0.4, 8); ctx.fill();
    if (!sil) { ctx.fillStyle = '#fff3c4'; ctx.fillRect(w * 0.46, h * 0.46, w * 0.08, h * 0.14); }
  }

  function sprite(fish, big) {
    var key = fish.id + (big ? 'b' : 's');
    var c = cache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = big ? 180 : 96;
    c.height = big ? 100 : 56;
    paintFish(c.getContext('2d'), fish, c.width, c.height, false);
    cache[key] = c;
    return c;
  }
  function silhouette(fish) {
    var key = 'sil' + fish.id;
    var c = cache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = 96; c.height = 56;
    paintFish(c.getContext('2d'), fish, 96, 56, true);
    cache[key] = c;
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function backdrop(ctx, spot, t, night) {
    var pal = palette(spot, night);
    var g = ctx.createLinearGradient(0, 0, 0, 280);
    g.addColorStop(0, pal.sky0); g.addColorStop(1, pal.sky1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 300);
    ctx.fillStyle = night > 0.55 ? '#f4f7ff' : '#ffe56a';
    ctx.beginPath(); ctx.arc(night > 0.55 ? 180 : 1040, 78, night > 0.55 ? 28 : 36, 0, 6.3); ctx.fill();
    ctx.fillStyle = pal.hill2;
    ctx.beginPath(); ctx.moveTo(0, 300);
    for (var x = 0; x <= 1280; x += 48) ctx.lineTo(x, 168 + Math.sin(x * 0.008 + 1) * 26);
    ctx.lineTo(1280, 300); ctx.fill();
    ctx.fillStyle = pal.hill;
    ctx.beginPath(); ctx.moveTo(0, 300);
    for (var x2 = 0; x2 <= 1280; x2 += 48) ctx.lineTo(x2, 210 + Math.sin(x2 * 0.01 + t * 0.05) * 18);
    ctx.lineTo(1280, 300); ctx.fill();
    return pal;
  }

  function water(ctx, pal, y, t, deepX) {
    ctx.fillStyle = pal.water;
    ctx.fillRect(0, y, 1280, 720 - y);
    ctx.fillStyle = pal.deep;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(deepX, y, 1280 - deepX, 720 - y);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = pal.ripple;
    ctx.lineWidth = 2;
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      var yy = y + 24 + i * 36;
      for (var x = 0; x <= 1280; x += 28) {
        var dy = Math.sin(x * 0.02 + t * 1.6 + i) * 3.2;
        if (x === 0) ctx.moveTo(x, yy + dy); else ctx.lineTo(x, yy + dy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, y, 1280, 4);
  }

  function props(ctx, spot, pal, t, y) {
    if (spot === 0) {
      ctx.fillStyle = '#2f8a48';
      for (var i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.ellipse(430 + i * 70, y + 8, 16, 8, 0, 0, 6.3); ctx.fill();
      }
    } else if (spot === 1 || spot === 2) {
      ctx.fillStyle = pal.wood;
      for (var p = 0; p < 6; p++) ctx.fillRect(360 + p * 140, y - 8, 16, 70);
      ctx.fillRect(300, y - 18, 900, 16);
    } else if (spot === 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(300, y - 8, 980, 28);
      ctx.fillStyle = pal.deep;
      ctx.beginPath(); ctx.ellipse(760, y + 36, 120, 28, 0, 0, 6.3); ctx.fill();
    } else if (spot === 4) {
      ctx.fillStyle = '#14241e';
      for (var m = 0; m < 4; m++) {
        ctx.beginPath(); ctx.moveTo(980 + m * 40, y); ctx.lineTo(1000 + m * 40, y - 90); ctx.lineTo(1020 + m * 40, y); ctx.fill();
      }
    } else if (spot === 5) {
      ctx.fillStyle = '#3c1818';
      ctx.beginPath(); ctx.moveTo(980, y); ctx.lineTo(1100, 80); ctx.lineTo(1220, y); ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.globalAlpha = 0.8 + Math.sin(t * 4) * 0.2;
      ctx.beginPath(); ctx.moveTo(1060, 120); ctx.lineTo(1100, 70); ctx.lineTo(1140, 130); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (spot === 6) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (var c = 0; c < 4; c++) {
        var cx = 420 + c * 180 + Math.sin(t + c) * 8;
        ctx.beginPath(); ctx.ellipse(cx, y - 30, 50, 18, 0, 0, 6.3); ctx.fill();
      }
    }
  }

  function angler(ctx, x, y, face, shirt, t, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    ctx.fillStyle = '#243044';
    ctx.fillRect(-16, -8, 10, 26); ctx.fillRect(6, -8, 10, 26);
    ctx.fillStyle = shirt;
    roundRect(ctx, -18, -48, 36, 42, 10); ctx.fill();
    ctx.fillStyle = '#ffd0b0';
    ctx.beginPath(); ctx.arc(0, -64, 16, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-18, -78, 36, 10);
    ctx.fillStyle = '#243044';
    ctx.fillRect(-4, -70, 3, 3); ctx.fillRect(6, -70, 3, 3);
    ctx.strokeStyle = '#243044'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(2, -62, 6, 0.2, 1.1); ctx.stroke();
    ctx.strokeStyle = shirt; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(10, -40); ctx.lineTo(28 + lean * 10, -70 - lean * 16); ctx.stroke();
    ctx.restore();
    return { x: x + face * (28 + lean * 10), y: y - 70 - lean * 16 };
  }

  function bobber(ctx, x, y) {
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(x, y, 9, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#243044';
    ctx.fillRect(x - 1, y - 16, 2, 10);
  }

  function line(ctx, x1, y1, x2, y2, wobble) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 30 + wobble, x2, y2);
    ctx.stroke();
  }

  function meter(ctx, x, y, power) {
    ctx.fillStyle = 'rgba(8,24,40,0.75)';
    roundRect(ctx, x, y, 26, 150, 10); ctx.fill();
    var sweet0 = y + 150 - 150 * 0.93;
    var sweet1 = y + 150 - 150 * 0.78;
    ctx.fillStyle = 'rgba(255, 210, 60, 0.9)';
    ctx.fillRect(x + 4, sweet0, 18, sweet1 - sweet0);
    ctx.fillStyle = '#7ee0ff';
    var h = 146 * power;
    ctx.fillRect(x + 4, y + 148 - h, 18, h);
  }

  function reel(ctx, x, y, h, a) {
    ctx.fillStyle = 'rgba(8, 20, 36, 0.82)';
    roundRect(ctx, x, y, 86, h, 18); ctx.fill();
    var top = y + 16, track = h - 32;
    var zy = top + track - (a.zoneY || 0) * track;
    var zh = (a.zoneH || 0.2) * track * 2;
    ctx.fillStyle = a.inside ? '#b8ffcf' : '#3ddc84';
    roundRect(ctx, x + 18, zy - zh / 2, 50, zh, 10); ctx.fill();
    if (a.fish) {
      var fy = top + track - a.fish.y * track;
      if (a.fish.tell) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = '700 28px Fredoka';
        ctx.textAlign = 'center'; ctx.direction = 'ltr';
        ctx.fillText('!', x + 43, fy - 16);
      }
      ctx.drawImage(sprite(a.fish, false), x + 14, fy - 18, 58, 34);
    }
    var cx = x + 43, cy = y + h + 28;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.3); ctx.stroke();
    ctx.strokeStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + (a.prog || 0) * 6.28); ctx.stroke();
  }

  function blit(ctx, fish, x, y, sc, t) {
    var img = sprite(fish, sc > 1.4);
    var w = img.width * sc, h = img.height * sc;
    var squash = 1;
    if (fish.boss || fish.rare >= 4) squash = 1 + Math.sin(t * 8) * 0.04;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, 1 / squash);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    if (fish.rb) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = ['#ff5d7a', '#ffd24a', '#7dffb2', '#7ec8ff', '#d9a6ff'][Math.floor(t * 6) % 5];
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.34, h * 0.28, 0, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (fish.glow) {
      ctx.globalAlpha = 0.35 + Math.sin(t * 5) * 0.15;
      ctx.fillStyle = '#fff6b0';
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, h * 0.4, 0, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function gull(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-6, -8, 8, 7, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#243044'; ctx.lineWidth = 2;
    var flap = Math.sin(t * 10) * 8;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-22, flap); ctx.moveTo(4, 0); ctx.lineTo(22, -flap); ctx.stroke();
    ctx.fillStyle = '#ff8a1a';
    ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(16, -6); ctx.lineTo(8, -4); ctx.fill();
    ctx.restore();
  }

  function label(ctx, text, x, y, size, color) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '700 ' + size + 'px Fredoka';
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, x, y);
  }

  window.LLArt = {
    palette: palette, backdrop: backdrop, water: water, props: props, angler: angler,
    bobber: bobber, line: line, meter: meter, reel: reel, blit: blit, gull: gull,
    label: label, sprite: sprite, silhouette: silhouette, paintFish: paintFish
  };
})();

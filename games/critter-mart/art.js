/* Critter Mart — everything drawn in code: items, icons, critters. */
(function () {
  'use strict';
  var CM = window.CM = window.CM || {};
  var A = CM.art = {};
  var TAU = Math.PI * 2;
  var OUT = '#4a2e1f';

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function fs(c, fill, stroke, lw) {
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 3; c.stroke(); }
  }
  A.rr = rr; A.ell = ell; A.circ = circ; A.fs = fs; A.OUT = OUT;

  function makeCanvas(w, h) { var cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  A.makeCanvas = makeCanvas;

  /* ------------------------------------------------------------ items */
  var ITEM_DRAW = {
    banana: function (c) {
      for (var i = 0; i < 3; i++) {
        c.save(); c.translate(30 + i * 2, 38); c.rotate(-0.55 + i * 0.5);
        c.beginPath(); c.moveTo(-2, -25);
        c.bezierCurveTo(22, -14, 20, 16, -6, 24);
        c.bezierCurveTo(9, 10, 9, -10, -2, -25);
        c.closePath(); fs(c, i === 1 ? '#ffe14a' : '#ffd23a', OUT, 3);
        c.beginPath(); c.moveTo(3, -16); c.bezierCurveTo(13, -6, 12, 8, 2, 16);
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2.5; c.stroke();
        circ(c, -2, -24, 3); fs(c, '#6b4a2a');
        circ(c, -5, 23, 2.5); fs(c, '#6b4a2a');
        c.restore();
      }
    },
    corn: function (c) {
      ell(c, 32, 28, 12, 23); fs(c, '#ffd23f', OUT, 3);
      c.fillStyle = '#fff09a';
      for (var r = 0; r < 7; r++) for (var k = -1; k <= 1; k++) { circ(c, 32 + k * 6 + (r % 2) * 2 - 1, 12 + r * 5.5, 2.2); c.fill(); }
      c.beginPath(); c.moveTo(32, 58); c.quadraticCurveTo(10, 50, 12, 22); c.quadraticCurveTo(22, 40, 34, 44); c.closePath(); fs(c, '#63c54a', OUT, 3);
      c.beginPath(); c.moveTo(32, 58); c.quadraticCurveTo(54, 50, 52, 24); c.quadraticCurveTo(42, 40, 30, 44); c.closePath(); fs(c, '#4fae3a', OUT, 3);
    },
    egg: function (c) {
      c.beginPath(); c.moveTo(32, 8); c.bezierCurveTo(50, 8, 52, 40, 50, 44); c.bezierCurveTo(47, 58, 17, 58, 14, 44); c.bezierCurveTo(12, 40, 14, 8, 32, 8); c.closePath();
      fs(c, '#fff4e0', OUT, 3);
      ell(c, 38, 44, 9, 7, -0.4); c.fillStyle = 'rgba(230,190,140,0.35)'; c.fill();
      ell(c, 25, 22, 4, 7, 0.3); c.fillStyle = '#ffffff'; c.fill();
    },
    milk: function (c) {
      rr(c, 24, 4, 16, 10, 3); fs(c, '#3d8bfd', OUT, 3);
      c.beginPath(); c.moveTo(25, 14); c.lineTo(39, 14); c.lineTo(46, 26); c.lineTo(46, 56); c.quadraticCurveTo(46, 60, 42, 60); c.lineTo(22, 60); c.quadraticCurveTo(18, 60, 18, 56); c.lineTo(18, 26); c.closePath();
      fs(c, '#fbfdff', OUT, 3);
      rr(c, 18, 32, 28, 16, 2); fs(c, '#6fb1ff');
      c.beginPath(); c.moveTo(32, 34); c.quadraticCurveTo(38, 42, 32, 45); c.quadraticCurveTo(26, 42, 32, 34); fs(c, '#ffffff');
      rr(c, 22, 20, 4, 30, 2); c.fillStyle = 'rgba(255,255,255,0.9)'; c.fill();
    },
    apple: function (c) {
      c.beginPath(); c.moveTo(32, 18); c.bezierCurveTo(44, 8, 60, 18, 54, 38); c.bezierCurveTo(50, 54, 40, 60, 32, 55); c.bezierCurveTo(24, 60, 14, 54, 10, 38); c.bezierCurveTo(4, 18, 20, 8, 32, 18); c.closePath();
      fs(c, '#ff4b4b', OUT, 3);
      c.beginPath(); c.moveTo(32, 18); c.quadraticCurveTo(33, 10, 37, 5); c.strokeStyle = '#6b4a2a'; c.lineWidth = 4; c.stroke();
      c.beginPath(); c.moveTo(35, 10); c.quadraticCurveTo(46, 2, 52, 9); c.quadraticCurveTo(44, 16, 35, 10); fs(c, '#5cc44a', OUT, 2);
      ell(c, 21, 28, 4, 7, 0.4); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
    },
    pumpkin: function (c) {
      ell(c, 16, 38, 11, 16); fs(c, '#ff8a1c', OUT, 3);
      ell(c, 48, 38, 11, 16); fs(c, '#ff8a1c', OUT, 3);
      ell(c, 24, 38, 12, 18); fs(c, '#ff9a2e', OUT, 3);
      ell(c, 40, 38, 12, 18); fs(c, '#ff9a2e', OUT, 3);
      ell(c, 32, 38, 10, 19); fs(c, '#ffab45', OUT, 3);
      rr(c, 29, 12, 7, 11, 2); fs(c, '#5a8a2a', OUT, 2.5);
      ell(c, 28, 30, 3, 6, 0.2); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fill();
    },
    juice: function (c) {
      c.beginPath(); c.moveTo(16, 16); c.lineTo(48, 16); c.lineTo(43, 58); c.lineTo(21, 58); c.closePath(); fs(c, '#eaf7ff', OUT, 3);
      c.beginPath(); c.moveTo(18.5, 26); c.lineTo(45.5, 26); c.lineTo(42, 55); c.lineTo(22, 55); c.closePath(); fs(c, '#ffd84a');
      c.beginPath(); c.moveTo(36, 30); c.lineTo(46, 2); c.strokeStyle = OUT; c.lineWidth = 7; c.stroke();
      c.strokeStyle = '#ff5d8f'; c.lineWidth = 4; c.stroke();
      circ(c, 18, 17, 8); fs(c, '#fff6b0', OUT, 2.5); circ(c, 18, 17, 3); fs(c, '#e8c860');
      rr(c, 22, 30, 4, 20, 2); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
    },
    popcorn: function (c) {
      var puffs = [[20, 20], [32, 14], [44, 20], [26, 26], [38, 26], [15, 28], [49, 28], [32, 22]];
      for (var i = 0; i < puffs.length; i++) { circ(c, puffs[i][0], puffs[i][1], 7.5); fs(c, i % 3 === 0 ? '#fff3c4' : '#fffdf5', OUT, 2.5); }
      c.beginPath(); c.moveTo(12, 28); c.lineTo(52, 28); c.lineTo(46, 60); c.lineTo(18, 60); c.closePath(); fs(c, '#ffffff', OUT, 3);
      c.save(); c.clip();
      c.fillStyle = '#ff4d5e';
      for (var s = 0; s < 3; s++) { c.beginPath(); c.moveTo(14 + s * 14, 28); c.lineTo(21 + s * 14, 28); c.lineTo(20 + s * 12, 60); c.lineTo(15 + s * 12, 60); c.closePath(); c.fill(); }
      c.restore();
      c.beginPath(); c.moveTo(12, 28); c.lineTo(52, 28); c.lineTo(46, 60); c.lineTo(18, 60); c.closePath(); fs(c, null, OUT, 3);
    },
    icecream: function (c) {
      c.beginPath(); c.moveTo(18, 30); c.lineTo(46, 30); c.lineTo(32, 62); c.closePath(); fs(c, '#f0b467', OUT, 3);
      c.save(); c.clip(); c.strokeStyle = '#c98a3e'; c.lineWidth = 2;
      for (var i = -2; i < 5; i++) { c.beginPath(); c.moveTo(14 + i * 8, 28); c.lineTo(34 + i * 8, 64); c.stroke(); c.beginPath(); c.moveTo(50 - i * 8, 28); c.lineTo(30 - i * 8, 64); c.stroke(); }
      c.restore();
      c.beginPath(); c.moveTo(14, 30); c.arc(32, 24, 18, Math.PI * 0.95, Math.PI * 0.05);
      c.lineTo(50, 30); c.quadraticCurveTo(46, 38, 42, 32); c.quadraticCurveTo(38, 40, 33, 33); c.quadraticCurveTo(27, 40, 23, 32); c.quadraticCurveTo(18, 37, 14, 30); c.closePath();
      fs(c, '#ff8fbf', OUT, 3);
      ell(c, 25, 17, 4, 5, -0.5); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
      circ(c, 34, 6, 5); fs(c, '#e8203a', OUT, 2.5);
      c.fillStyle = '#ffe14a'; c.fillRect(38, 20, 3, 3); c.fillStyle = '#6fd3ff'; c.fillRect(24, 26, 3, 3); c.fillStyle = '#7be07b'; c.fillRect(42, 26, 3, 3);
    },
    pie: function (c) {
      ell(c, 32, 42, 28, 15); fs(c, '#c9ccd6', OUT, 3);
      ell(c, 32, 37, 25, 13); fs(c, '#f2b458', OUT, 3);
      c.save(); ell(c, 32, 37, 22, 11); c.clip();
      c.fillStyle = '#d9434b'; c.fillRect(8, 24, 50, 30);
      c.strokeStyle = '#f7c46e'; c.lineWidth = 4.5;
      for (var i = -3; i <= 3; i++) {
        c.beginPath(); c.moveTo(32 + i * 8 - 10, 24); c.lineTo(32 + i * 8 + 10, 52); c.stroke();
        c.beginPath(); c.moveTo(32 + i * 8 + 10, 24); c.lineTo(32 + i * 8 - 10, 52); c.stroke();
      }
      c.restore();
      ell(c, 32, 37, 22, 11); fs(c, null, '#c9822c', 2);
      ell(c, 22, 31, 5, 2.5, -0.2); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    }
  };

  var itemCache = {};
  A.itemCanvas = function (type) {
    if (!itemCache[type]) {
      var cv = makeCanvas(96, 96), c = cv.getContext('2d');
      c.scale(1.5, 1.5); c.lineJoin = 'round'; c.lineCap = 'round';
      if (ITEM_DRAW[type]) ITEM_DRAW[type](c);
      itemCache[type] = cv;
    }
    return itemCache[type];
  };
  // Draw an item centred at x, bottom at y (so it "stands" on things).
  A.item = function (c, type, x, y, size) {
    var cv = A.itemCanvas(type);
    c.drawImage(cv, x - size / 2, y - size, size, size);
  };
  A.itemC = function (c, type, x, y, size) {
    var cv = A.itemCanvas(type);
    c.drawImage(cv, x - size / 2, y - size / 2, size, size);
  };

  /* ------------------------------------------------------------ coins */
  var coinCv = null;
  A.coinCanvas = function () {
    if (!coinCv) {
      coinCv = makeCanvas(64, 64);
      var c = coinCv.getContext('2d');
      circ(c, 32, 32, 28); fs(c, '#e59a00', '#8a5200', 3);
      circ(c, 30, 30, 24); fs(c, '#ffd23f');
      circ(c, 30, 30, 18); fs(c, null, '#f0ae10', 3);
      star(c, 30, 30, 5, 10, 4.5); fs(c, '#fff3a0', '#d08a00', 2);
      ell(c, 20, 20, 5, 3, -0.7); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
    }
    return coinCv;
  };
  A.coin = function (c, x, y, r) { c.drawImage(A.coinCanvas(), x - r, y - r, r * 2, r * 2); };

  function star(c, x, y, n, r1, r2) {
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 === 0 ? r1 : r2, a = -Math.PI / 2 + i * Math.PI / n;
      if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }
  A.star = star;

  // A stack of flat coins (side view) — for money piles.
  A.coinStack = function (c, x, y, n) {
    for (var i = 0; i < n; i++) {
      var yy = y - i * 4.5;
      ell(c, x, yy + 2, 13, 6); fs(c, '#c98200', '#7a4a00', 1.5);
      ell(c, x, yy, 13, 6); fs(c, '#ffd23f', '#a86a00', 1.5);
    }
    if (n > 0) { ell(c, x, y - (n - 1) * 4.5, 7, 3); c.fillStyle = '#fff3a0'; c.fill(); }
  };

  /* ------------------------------------------------------------ icons */
  var ICON_DRAW = {
    shoe: function (c) {
      c.beginPath(); c.moveTo(10, 40); c.lineTo(12, 22); c.quadraticCurveTo(22, 18, 28, 24); c.lineTo(34, 32); c.quadraticCurveTo(52, 34, 56, 44); c.lineTo(56, 48); c.lineTo(10, 48); c.closePath();
      fs(c, '#ff4d5e', OUT, 3);
      rr(c, 8, 46, 50, 8, 4); fs(c, '#ffffff', OUT, 3);
      c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(22, 30); c.lineTo(28, 28); c.moveTo(25, 35); c.lineTo(31, 33); c.stroke();
      c.strokeStyle = '#5ad1ff'; c.lineWidth = 3; c.beginPath(); c.moveTo(2, 26); c.lineTo(8, 26); c.moveTo(0, 34); c.lineTo(7, 34); c.moveTo(3, 42); c.lineTo(7, 42); c.stroke();
    },
    stack: function (c) {
      A.item(c, 'corn', 32, 64, 28); A.item(c, 'banana', 32, 46, 28); A.item(c, 'egg', 32, 28, 26);
    },
    sprout: function (c) {
      ell(c, 32, 52, 22, 8); fs(c, '#9b6b43', OUT, 3);
      c.beginPath(); c.moveTo(32, 50); c.lineTo(32, 26); c.strokeStyle = '#3f9a2f'; c.lineWidth = 5; c.stroke();
      c.beginPath(); c.moveTo(32, 30); c.quadraticCurveTo(12, 30, 12, 14); c.quadraticCurveTo(30, 12, 32, 30); fs(c, '#6cd35a', OUT, 3);
      c.beginPath(); c.moveTo(32, 26); c.quadraticCurveTo(54, 24, 54, 8); c.quadraticCurveTo(34, 8, 32, 26); fs(c, '#6cd35a', OUT, 3);
      star(c, 50, 36, 4, 7, 2.5); fs(c, '#fff27a');
    },
    tag: function (c) {
      c.beginPath(); c.moveTo(8, 30); c.lineTo(26, 10); c.lineTo(56, 10); c.lineTo(56, 50); c.lineTo(26, 50); c.closePath(); fs(c, '#ffcf3f', OUT, 3);
      circ(c, 22, 30, 4); fs(c, '#fff', OUT, 2);
      A.coin(c, 41, 30, 11);
    },
    star: function (c) {
      star(c, 32, 34, 5, 26, 12); fs(c, '#ffd23f', OUT, 3);
      ell(c, 32, 36, 4, 5); c.fillStyle = OUT; circ(c, 26, 32, 2.5); c.fill(); circ(c, 38, 32, 2.5); c.fill();
      c.beginPath(); c.arc(32, 37, 5, 0.2, Math.PI - 0.2); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    },
    helper: function (c) { A.head(c, 'frog', 32, 40, 1.1, { hat: 'straw' }); },
    cashier: function (c) { A.head(c, 'cat', 32, 40, 1.1, { hat: 'visor' }); },
    farmer: function (c) { A.head(c, 'frog', 32, 40, 1.1, { hat: 'straw' }); },
    expand: function (c) {
      rr(c, 14, 14, 36, 36, 6); fs(c, '#fff6e0', OUT, 3);
      c.strokeStyle = '#1fb5a8'; c.lineWidth = 5; c.lineCap = 'round';
      var d = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (var i = 0; i < 4; i++) {
        var x = 32 + d[i][0] * 8, y = 32 + d[i][1] * 8, X = 32 + d[i][0] * 24, Y = 32 + d[i][1] * 24;
        c.beginPath(); c.moveTo(x, y); c.lineTo(X, Y); c.moveTo(X, Y); c.lineTo(X - d[i][0] * 9, Y); c.moveTo(X, Y); c.lineTo(X, Y - d[i][1] * 9); c.stroke();
      }
    },
    desk: function (c) {
      rr(c, 12, 10, 40, 48, 5); fs(c, '#c98a4b', OUT, 3);
      rr(c, 17, 16, 30, 36, 3); fs(c, '#fffaf0');
      rr(c, 24, 6, 16, 8, 3); fs(c, '#9aa3b5', OUT, 2);
      c.beginPath(); c.moveTo(32, 20); c.lineTo(42, 32); c.lineTo(36, 32); c.lineTo(36, 46); c.lineTo(28, 46); c.lineTo(28, 32); c.lineTo(22, 32); c.closePath(); fs(c, '#3ddc84', OUT, 2.5);
    },
    plants: function (c) {
      c.beginPath(); c.moveTo(18, 38); c.lineTo(46, 38); c.lineTo(42, 58); c.lineTo(22, 58); c.closePath(); fs(c, '#e2724a', OUT, 3);
      circ(c, 24, 28, 10); fs(c, '#4fbf45', OUT, 3); circ(c, 40, 28, 10); fs(c, '#4fbf45', OUT, 3); circ(c, 32, 18, 11); fs(c, '#62d257', OUT, 3);
      circ(c, 30, 14, 3); fs(c, '#ff8fbf');
    },
    rug: function (c) {
      rr(c, 6, 18, 52, 30, 6); fs(c, '#6c63ff', OUT, 3);
      rr(c, 12, 23, 40, 20, 4); fs(c, '#ffcf3f');
      circ(c, 32, 33, 6); fs(c, '#ff5d8f');
    },
    balloons: function (c) {
      var b = [[20, 24, '#ff4d5e'], [44, 22, '#3d8bfd'], [32, 16, '#ffd23f']];
      for (var i = 0; i < 3; i++) {
        c.beginPath(); c.moveTo(b[i][0], b[i][1] + 12); c.quadraticCurveTo(32, 46, 32, 60); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
        ell(c, b[i][0], b[i][1], 10, 12); fs(c, b[i][2], OUT, 3);
        ell(c, b[i][0] - 3, b[i][1] - 4, 2.5, 4, 0.4); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
      }
    },
    fountain: function (c) {
      ell(c, 32, 48, 26, 10); fs(c, '#b8c2d6', OUT, 3);
      ell(c, 32, 46, 20, 6); fs(c, '#5ad1ff');
      rr(c, 28, 26, 8, 20, 3); fs(c, '#d7deea', OUT, 2.5);
      c.strokeStyle = '#5ad1ff'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(32, 26); c.quadraticCurveTo(20, 6, 12, 40); c.stroke();
      c.beginPath(); c.moveTo(32, 26); c.quadraticCurveTo(44, 6, 52, 40); c.stroke();
    },
    statue: function (c) {
      rr(c, 16, 48, 32, 12, 3); fs(c, '#c9ccd6', OUT, 3);
      A.head(c, 'raccoon', 32, 38, 1.0, { gold: true, hat: 'crown' });
    },
    register: function (c) {
      rr(c, 10, 30, 44, 26, 5); fs(c, '#5b6dcd', OUT, 3);
      rr(c, 16, 12, 32, 20, 4); fs(c, '#3f4ea8', OUT, 3);
      rr(c, 20, 16, 24, 10, 2); fs(c, '#9ff7d6');
      c.fillStyle = '#fff'; for (var i = 0; i < 3; i++) { c.fillRect(17 + i * 11, 37, 7, 5); c.fillRect(17 + i * 11, 45, 7, 5); }
    },
    coop: function (c) { A.head(c, 'chicken', 32, 42, 1.1, {}); },
    pen: function (c) { A.head(c, 'cow', 32, 40, 1.05, {}); },
    trash: function (c) {
      c.beginPath(); c.moveTo(16, 22); c.lineTo(48, 22); c.lineTo(44, 58); c.lineTo(20, 58); c.closePath(); fs(c, '#7fbf6a', OUT, 3);
      rr(c, 12, 14, 40, 9, 4); fs(c, '#9bd88a', OUT, 3);
    },
    lock: function (c) {
      c.beginPath(); c.arc(32, 26, 11, Math.PI, 0); c.strokeStyle = OUT; c.lineWidth = 9; c.stroke(); c.strokeStyle = '#c9ccd6'; c.lineWidth = 5; c.stroke();
      rr(c, 16, 26, 32, 26, 6); fs(c, '#ffcf3f', OUT, 3); circ(c, 32, 38, 4); fs(c, OUT);
    }
  };
  var iconCache = {};
  A.iconCanvas = function (name) {
    if (!iconCache[name]) {
      var cv = makeCanvas(96, 96), c = cv.getContext('2d');
      c.scale(1.5, 1.5); c.lineJoin = 'round'; c.lineCap = 'round';
      if (ITEM_DRAW[name]) ITEM_DRAW[name](c);
      else if (ICON_DRAW[name]) ICON_DRAW[name](c);
      iconCache[name] = cv;
    }
    return iconCache[name];
  };
  A.icon = function (c, name, x, y, size) { c.drawImage(A.iconCanvas(name), x - size / 2, y - size / 2, size, size); };
  A.iconURL = function (name) { try { return A.iconCanvas(name).toDataURL(); } catch (e) { return ''; } };

  /* ---------------------------------------------------------- critters */
  var SP = A.SPECIES = {
    raccoon: { body: '#9ea3b5', belly: '#eef0f5', dark: '#4b4f63', ear: 'raccoon', face: 'raccoon', tail: 'raccoon' },
    bunny: { body: '#fbf6f0', belly: '#ffffff', dark: '#f4a6b8', ear: 'long', face: 'bunny', alt: ['#e8c39e', '#d9d4e8'] },
    pig: { body: '#ffb6c8', belly: '#ffd3de', dark: '#e0708f', ear: 'pig', face: 'pig', tail: 'curl' },
    bear: { body: '#b27a4c', belly: '#ecc99d', dark: '#6b4428', ear: 'round', face: 'bear', alt: ['#8a5a3a', '#e3b87a'] },
    cat: { body: '#ffa94d', belly: '#fff1dc', dark: '#d9731a', ear: 'cat', face: 'cat', tail: 'cat', alt: ['#a9a9bd', '#5b5b6b', '#fff5ea'] },
    duck: { body: '#ffe14d', belly: '#fff4b0', dark: '#ff9f1c', ear: 'tuft', face: 'duck' },
    sheep: { body: '#fffdf5', belly: '#ffffff', dark: '#6d5a4d', ear: 'sheep', face: 'sheep', wool: true },
    fox: { body: '#ff8a3d', belly: '#fff5ea', dark: '#4a2a18', ear: 'fox', face: 'fox', tail: 'fox' },
    mouse: { body: '#c9c9d8', belly: '#f0f0f7', dark: '#ff9eb5', ear: 'mouse', face: 'mouse', tail: 'mouse', alt: ['#d8b99a'] },
    frog: { body: '#76cc5a', belly: '#d6f5b0', dark: '#3f8f33', ear: 'frog', face: 'frog' },
    chicken: { body: '#ffffff', belly: '#fff', dark: '#ff4d4d', ear: 'comb', face: 'chicken' },
    cow: { body: '#ffffff', belly: '#fff', dark: '#3a3a44', ear: 'cow', face: 'cow' }
  };

  // Head only (used for icons + the full critter). Centre of head at (x, y).
  A.head = function (c, sp, x, y, s, o) {
    o = o || {};
    var d = SP[sp] || SP.bunny;
    var body = o.gold ? '#ffcf3f' : (o.color || d.body);
    var dark = o.gold ? '#d99a00' : d.dark;
    var look = o.look || 0, back = !!o.back;
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineJoin = 'round'; c.lineCap = 'round';
    var r = 19;
    // ears behind
    switch (d.ear) {
      case 'raccoon':
        c.beginPath(); c.moveTo(-17, -6); c.lineTo(-15, -24); c.lineTo(-4, -16); c.closePath(); fs(c, body, OUT, 3);
        c.beginPath(); c.moveTo(17, -6); c.lineTo(15, -24); c.lineTo(4, -16); c.closePath(); fs(c, body, OUT, 3);
        c.beginPath(); c.moveTo(-14, -10); c.lineTo(-13, -19); c.lineTo(-8, -15); c.closePath(); fs(c, dark);
        c.beginPath(); c.moveTo(14, -10); c.lineTo(13, -19); c.lineTo(8, -15); c.closePath(); fs(c, dark);
        break;
      case 'long':
        ell(c, -8, -30, 6.5, 17, -0.18); fs(c, body, OUT, 3); ell(c, 8, -30, 6.5, 17, 0.18); fs(c, body, OUT, 3);
        if (!back) { ell(c, -8, -29, 3, 12, -0.18); fs(c, '#ffb7c9'); ell(c, 8, -29, 3, 12, 0.18); fs(c, '#ffb7c9'); }
        break;
      case 'pig':
        c.beginPath(); c.moveTo(-16, -8); c.lineTo(-17, -24); c.lineTo(-5, -17); c.closePath(); fs(c, body, OUT, 3);
        c.beginPath(); c.moveTo(16, -8); c.lineTo(17, -24); c.lineTo(5, -17); c.closePath(); fs(c, body, OUT, 3);
        break;
      case 'round':
        circ(c, -14, -15, 7.5); fs(c, body, OUT, 3); circ(c, 14, -15, 7.5); fs(c, body, OUT, 3);
        circ(c, -14, -15, 3.5); fs(c, d.belly); circ(c, 14, -15, 3.5); fs(c, d.belly);
        break;
      case 'cat': case 'fox':
        c.beginPath(); c.moveTo(-18, -4); c.lineTo(-14, -27); c.lineTo(-3, -16); c.closePath(); fs(c, body, OUT, 3);
        c.beginPath(); c.moveTo(18, -4); c.lineTo(14, -27); c.lineTo(3, -16); c.closePath(); fs(c, body, OUT, 3);
        if (d.ear === 'fox') {
          c.beginPath(); c.moveTo(-15.5, -21); c.lineTo(-14, -27); c.lineTo(-10, -22); c.closePath(); fs(c, dark);
          c.beginPath(); c.moveTo(15.5, -21); c.lineTo(14, -27); c.lineTo(10, -22); c.closePath(); fs(c, dark);
        } else {
          c.beginPath(); c.moveTo(-14, -11); c.lineTo(-13, -21); c.lineTo(-8, -15); c.closePath(); fs(c, '#ffb7c9');
          c.beginPath(); c.moveTo(14, -11); c.lineTo(13, -21); c.lineTo(8, -15); c.closePath(); fs(c, '#ffb7c9');
        }
        break;
      case 'mouse':
        circ(c, -16, -14, 11); fs(c, body, OUT, 3); circ(c, 16, -14, 11); fs(c, body, OUT, 3);
        circ(c, -16, -14, 6.5); fs(c, '#ffb7c9'); circ(c, 16, -14, 6.5); fs(c, '#ffb7c9');
        break;
      case 'sheep':
        ell(c, -20, -3, 8, 4.5, 0.4); fs(c, '#f2d6c4', OUT, 2.5); ell(c, 20, -3, 8, 4.5, -0.4); fs(c, '#f2d6c4', OUT, 2.5);
        break;
      case 'cow':
        ell(c, -21, -6, 8, 4.5, 0.3); fs(c, body, OUT, 2.5); ell(c, 21, -6, 8, 4.5, -0.3); fs(c, body, OUT, 2.5);
        c.beginPath(); c.moveTo(-10, -15); c.quadraticCurveTo(-14, -26, -8, -28); c.lineTo(-6, -16); fs(c, '#fff3d6', OUT, 2.5);
        c.beginPath(); c.moveTo(10, -15); c.quadraticCurveTo(14, -26, 8, -28); c.lineTo(6, -16); fs(c, '#fff3d6', OUT, 2.5);
        break;
      case 'frog':
        break;
    }
    // head
    if (d.wool) {
      for (var i = 0; i < 9; i++) { var a = i / 9 * TAU; circ(c, Math.cos(a) * 16, Math.sin(a) * 15, 8); fs(c, body, OUT, 3); }
      circ(c, 0, 0, 17); fs(c, body);
      if (!back) { ell(c, 0, 4, 12, 12); fs(c, '#f2d6c4', OUT, 2.5); circ(c, 0, -12, 8); fs(c, body); }
    } else if (d.face === 'frog') {
      ell(c, 0, 2, 21, 17); fs(c, body, OUT, 3);
    } else if (d.face === 'chicken') {
      circ(c, -4, -21, 5); fs(c, '#ff4d4d', OUT, 2.5); circ(c, 3, -22, 6); fs(c, '#ff4d4d', OUT, 2.5);
      circ(c, 0, 0, r); fs(c, body, OUT, 3);
    } else {
      circ(c, 0, 0, r); fs(c, body, OUT, 3);
    }
    if (d.face === 'cow' && !back) { ell(c, 8, -6, 6, 5, 0.3); fs(c, '#3a3a44'); }
    if (d.ear === 'tuft') {
      c.beginPath(); c.moveTo(-2, -18); c.quadraticCurveTo(-6, -30, 2, -28); c.moveTo(1, -18); c.quadraticCurveTo(4, -30, 9, -24); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    }
    if (!back) face(c, d, look, o, body, dark);
    else if (d.face === 'raccoon') { c.beginPath(); c.moveTo(-8, 6); c.lineTo(8, 6); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 6; c.stroke(); }
    if (o.hat && o.hat !== 'none') hat(c, o.hat, back);
    c.restore();
  };

  function eyes(c, lx, y, gap, size, blink) {
    for (var s = -1; s <= 1; s += 2) {
      if (blink) { c.beginPath(); c.moveTo(lx + s * gap - 3, y); c.lineTo(lx + s * gap + 3, y); c.strokeStyle = '#222'; c.lineWidth = 2.5; c.stroke(); continue; }
      ell(c, lx + s * gap, y, size * 0.8, size); fs(c, '#231a1a');
      circ(c, lx + s * gap + 1.2, y - size * 0.4, size * 0.38); fs(c, '#ffffff');
    }
  }

  function face(c, d, look, o, body, dark) {
    var lx = look * 4, blink = !!o.blink;
    var mood = o.mood == null ? 1 : o.mood;
    switch (d.face) {
      case 'raccoon':
        ell(c, lx - 7.5, -2, 8, 6.5, 0.15); fs(c, dark); ell(c, lx + 7.5, -2, 8, 6.5, -0.15); fs(c, dark);
        c.beginPath(); c.moveTo(lx - 13, -10); c.quadraticCurveTo(lx - 7, -13, lx - 2, -9); c.moveTo(lx + 13, -10); c.quadraticCurveTo(lx + 7, -13, lx + 2, -9);
        c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.stroke();
        eyes(c, lx, -2, 7.5, 3.8, blink);
        ell(c, lx * 1.2, 7, 9, 6.5); fs(c, d.belly);
        ell(c, lx * 1.3, 3.5, 3.5, 2.5); fs(c, '#231a1a');
        break;
      case 'bunny':
        eyes(c, lx, -2, 7, 3.6, blink);
        c.beginPath(); c.moveTo(lx - 2.5, 4); c.lineTo(lx + 2.5, 4); c.lineTo(lx, 7); c.closePath(); fs(c, '#ff8fb0');
        c.fillStyle = '#fff'; c.fillRect(lx - 2.5, 9, 5, 4); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(lx - 2.5, 9, 5, 4);
        break;
      case 'pig':
        eyes(c, lx, -4, 8, 3.4, blink);
        ell(c, lx * 1.3, 5, 8, 6); fs(c, '#ff9bb3', OUT, 2.5);
        ell(c, lx * 1.3 - 3, 5, 1.5, 2.5); fs(c, '#a0405a'); ell(c, lx * 1.3 + 3, 5, 1.5, 2.5); fs(c, '#a0405a');
        break;
      case 'bear':
        eyes(c, lx, -4, 7.5, 3.4, blink);
        ell(c, lx * 1.2, 6, 8.5, 6.5); fs(c, d.belly);
        ell(c, lx * 1.3, 3.5, 3.5, 2.5); fs(c, '#231a1a');
        break;
      case 'cat':
        eyes(c, lx, -3, 7.5, 3.6, blink);
        c.beginPath(); c.moveTo(lx - 2.5, 3); c.lineTo(lx + 2.5, 3); c.lineTo(lx, 5.5); c.closePath(); fs(c, '#ff8fb0');
        c.strokeStyle = 'rgba(60,40,30,0.6)'; c.lineWidth = 1.5; c.beginPath();
        c.moveTo(lx - 6, 6); c.lineTo(lx - 16, 4); c.moveTo(lx - 6, 8); c.lineTo(lx - 16, 9); c.moveTo(lx + 6, 6); c.lineTo(lx + 16, 4); c.moveTo(lx + 6, 8); c.lineTo(lx + 16, 9); c.stroke();
        break;
      case 'duck':
        eyes(c, lx, -4, 7.5, 3.4, blink);
        ell(c, lx * 1.3, 5, 10, 5); fs(c, '#ff9f1c', OUT, 2.5);
        c.beginPath(); c.moveTo(lx * 1.3 - 8, 5); c.lineTo(lx * 1.3 + 8, 5); c.strokeStyle = '#c96d00'; c.lineWidth = 1.5; c.stroke();
        break;
      case 'sheep':
        eyes(c, lx, 1, 5.5, 3, blink);
        ell(c, lx, 8, 3, 2); fs(c, '#a0685a');
        break;
      case 'fox':
        c.beginPath(); c.moveTo(lx - 17, 2); c.quadraticCurveTo(lx - 8, 16, lx, 12); c.quadraticCurveTo(lx + 8, 16, lx + 17, 2); c.quadraticCurveTo(lx, 6, lx - 17, 2); fs(c, d.belly);
        eyes(c, lx, -4, 7.5, 3.4, blink);
        ell(c, lx * 1.3, 6, 3.2, 2.4); fs(c, '#231a1a');
        break;
      case 'mouse':
        eyes(c, lx, -2, 6.5, 3.4, blink);
        circ(c, lx * 1.3, 6, 3); fs(c, '#ff8fb0');
        c.strokeStyle = 'rgba(60,40,30,0.5)'; c.lineWidth = 1.2; c.beginPath();
        c.moveTo(lx - 4, 7); c.lineTo(lx - 14, 5); c.moveTo(lx + 4, 7); c.lineTo(lx + 14, 5); c.stroke();
        break;
      case 'frog':
        circ(c, lx - 9, -14, 7.5); fs(c, body, OUT, 3); circ(c, lx + 9, -14, 7.5); fs(c, body, OUT, 3);
        if (blink) { c.beginPath(); c.moveTo(lx - 12, -14); c.lineTo(lx - 6, -14); c.moveTo(lx + 6, -14); c.lineTo(lx + 12, -14); c.strokeStyle = '#222'; c.lineWidth = 2.5; c.stroke(); }
        else { circ(c, lx - 9, -14, 3.5); fs(c, '#231a1a'); circ(c, lx + 9, -14, 3.5); fs(c, '#231a1a'); circ(c, lx - 8, -15.5, 1.3); fs(c, '#fff'); circ(c, lx + 10, -15.5, 1.3); fs(c, '#fff'); }
        break;
      case 'chicken':
        eyes(c, lx, -4, 7, 3.2, blink);
        c.beginPath(); c.moveTo(lx - 5, 2); c.lineTo(lx + 5, 2); c.lineTo(lx, 9); c.closePath(); fs(c, '#ffb020', OUT, 2);
        ell(c, lx, 11, 2.5, 4); fs(c, '#ff4d4d');
        break;
      case 'cow':
        eyes(c, lx, -5, 8, 3.4, blink);
        ell(c, lx, 8, 13, 8); fs(c, '#ffb6c8', OUT, 2.5);
        ell(c, lx - 4, 8, 1.8, 2.5); fs(c, '#a0405a'); ell(c, lx + 4, 8, 1.8, 2.5); fs(c, '#a0405a');
        break;
    }
    // cheeks + mouth
    if (d.face !== 'sheep' && d.face !== 'cow') {
      ell(c, lx - 12, 5, 4, 2.5); c.fillStyle = 'rgba(255,110,140,0.45)'; c.fill();
      ell(c, lx + 12, 5, 4, 2.5); c.fill();
    }
    if (d.face !== 'duck' && d.face !== 'chicken' && d.face !== 'pig' && d.face !== 'cow') {
      var my = d.face === 'frog' ? 4 : (d.face === 'sheep' ? 11 : 10);
      c.beginPath();
      if (mood > 0.5) { c.arc(lx * 1.2, my - 2, d.face === 'frog' ? 9 : 3.5, 0.25, Math.PI - 0.25); }
      else if (mood > 0.15) { c.moveTo(lx - 3, my); c.lineTo(lx + 3, my); }
      else { c.arc(lx * 1.2, my + 3, 3.5, Math.PI + 0.35, -0.35); }
      c.strokeStyle = '#3a2218'; c.lineWidth = 2; c.stroke();
    }
  }

  function hat(c, h, back) {
    switch (h) {
      case 'cap':
        c.beginPath(); c.arc(0, -8, 17, Math.PI, 0); c.closePath(); fs(c, '#ff4d5e', OUT, 3);
        if (!back) { ell(c, 0, -8, 21, 5); fs(c, '#e02e45', OUT, 3); }
        circ(c, 0, -25, 3); fs(c, '#ffd23f', OUT, 2);
        break;
      case 'visor':
        rr(c, -17, -14, 34, 7, 3); fs(c, '#1fb5a8', OUT, 2.5);
        if (!back) { ell(c, 0, -8, 18, 5); fs(c, '#17998e', OUT, 2.5); }
        break;
      case 'flower':
        for (var i = 0; i < 5; i++) { var a = i / 5 * TAU; circ(c, 11 + Math.cos(a) * 5.5, -15 + Math.sin(a) * 5.5, 4.5); fs(c, '#ff8fbf', OUT, 2); }
        circ(c, 11, -15, 3.5); fs(c, '#ffd23f', OUT, 2);
        break;
      case 'chef':
        rr(c, -12, -24, 24, 14, 3); fs(c, '#ffffff', OUT, 3);
        circ(c, -9, -28, 8); fs(c, '#fff', OUT, 3); circ(c, 9, -28, 8); fs(c, '#fff', OUT, 3); circ(c, 0, -33, 9); fs(c, '#fff', OUT, 3);
        c.fillStyle = '#fff'; c.fillRect(-10, -28, 20, 12);
        break;
      case 'straw':
        ell(c, 0, -12, 28, 8); fs(c, '#f5d36b', OUT, 3);
        c.beginPath(); c.arc(0, -13, 13, Math.PI, 0); c.closePath(); fs(c, '#f5d36b', OUT, 3);
        rr(c, -13, -17, 26, 4, 1); fs(c, '#ff5d5d');
        break;
      case 'party':
        c.beginPath(); c.moveTo(-11, -14); c.lineTo(0, -44); c.lineTo(11, -14); c.closePath(); fs(c, '#6c63ff', OUT, 3);
        c.save(); c.clip(); c.fillStyle = '#ffd23f'; for (var k = 0; k < 3; k++) c.fillRect(-12, -36 + k * 9, 24, 3.5); c.restore();
        circ(c, 0, -45, 4.5); fs(c, '#ff5d8f', OUT, 2);
        break;
      case 'crown':
        c.beginPath(); c.moveTo(-14, -12); c.lineTo(-15, -30); c.lineTo(-7, -21); c.lineTo(0, -33); c.lineTo(7, -21); c.lineTo(15, -30); c.lineTo(14, -12); c.closePath();
        fs(c, '#ffd23f', OUT, 3);
        circ(c, 0, -17, 3); fs(c, '#ff4d5e'); circ(c, -8, -16, 2.2); fs(c, '#3d8bfd'); circ(c, 8, -16, 2.2); fs(c, '#3ddc84');
        break;
    }
  }
  A.hat = hat;

  // Full critter. o: {sp, x, y (feet), s, phase, moving, look(-1..1), back, color, hat, apron, overalls, basket:[items], mood, t, blink, carryArms}
  A.critter = function (c, o) {
    var d = SP[o.sp] || SP.bunny;
    var s = o.s || 1, ph = o.phase || 0, mv = o.moving;
    var body = o.gold ? '#ffcf3f' : (o.color || d.body);
    var t = o.t || 0;
    var bob = mv ? Math.abs(Math.sin(ph)) * 4 : Math.sin(t * 2.2) * 0.8;
    var sq = mv ? 1 + Math.sin(ph * 2) * 0.05 : 1 + Math.sin(t * 3) * 0.02;
    sq *= (o.squash || 1);
    var sx = 1 / Math.sqrt(sq);
    var look = o.look || 0, back = !!o.back;
    c.save(); c.translate(o.x, o.y); c.scale(s, s);
    c.lineJoin = 'round'; c.lineCap = 'round';
    // shadow
    ell(c, 0, 0, 18, 6); c.fillStyle = 'rgba(40,30,20,0.22)'; c.fill();
    c.translate(0, -bob);
    c.scale(sx, sq);
    // tail behind (front-facing)
    if (!back) tail(c, d, body, t, look);
    // feet
    var f1 = mv ? Math.max(0, Math.sin(ph)) * 5 : 0, f2 = mv ? Math.max(0, -Math.sin(ph)) * 5 : 0;
    var footC = d.face === 'duck' || d.face === 'chicken' ? '#ff9f1c' : (d.face === 'frog' ? body : shade(body, -18));
    ell(c, -8, -3 - f1 + bob, 7, 4.5); fs(c, footC, OUT, 2.5);
    ell(c, 8, -3 - f2 + bob, 7, 4.5); fs(c, footC, OUT, 2.5);
    // body
    ell(c, 0, -22, 16, 17); fs(c, body, OUT, 3);
    if (d.wool) { for (var i = 0; i < 7; i++) { var a = Math.PI * 0.1 + i / 6 * Math.PI * 0.8; circ(c, Math.cos(a) * 14 * (i % 2 ? 1 : -1), -30 + Math.sin(a) * 12, 6); fs(c, body); } }
    if (!back) {
      ell(c, 0, -18, 10, 10); fs(c, d.belly);
      if (o.overalls) {
        rr(c, -11, -26, 22, 20, 5); fs(c, o.overalls, OUT, 2.5);
        c.beginPath(); c.moveTo(-8, -26); c.lineTo(-10, -36); c.moveTo(8, -26); c.lineTo(10, -36); c.strokeStyle = o.overalls; c.lineWidth = 4; c.stroke();
        circ(c, -7, -24, 1.8); fs(c, '#ffd23f'); circ(c, 7, -24, 1.8); fs(c, '#ffd23f');
      }
      if (o.apron) {
        c.beginPath(); c.moveTo(-10, -30); c.lineTo(10, -30); c.lineTo(12, -8); c.quadraticCurveTo(0, -4, -12, -8); c.closePath(); fs(c, o.apron, OUT, 2.5);
        c.beginPath(); c.moveTo(-8, -30); c.lineTo(-7, -38); c.moveTo(8, -30); c.lineTo(7, -38); c.strokeStyle = o.apron; c.lineWidth = 3.5; c.stroke();
        rr(c, -6, -21, 12, 8, 2); fs(c, o.pocket || '#ffd23f', OUT, 1.5);
      }
    } else if (o.apron || o.overalls) {
      c.beginPath(); c.moveTo(-12, -24); c.lineTo(12, -24); c.strokeStyle = o.apron || o.overalls; c.lineWidth = 3.5; c.stroke();
    }
    // arms
    var sw = mv ? Math.sin(ph) * 4 : 0;
    if (o.carryArms) {
      ell(c, -15, -34, 5, 7, 0.4); fs(c, body, OUT, 2.5); ell(c, 15, -34, 5, 7, -0.4); fs(c, body, OUT, 2.5);
    } else {
      ell(c, -16, -21 + sw, 5, 7, 0.3); fs(c, body, OUT, 2.5); ell(c, 16, -21 - sw, 5, 7, -0.3); fs(c, body, OUT, 2.5);
    }
    if (back) tail(c, d, body, t, look);
    // basket
    if (o.basket && !back) {
      var bk = o.basket;
      for (var j = 0; j < bk.length && j < 4; j++) A.item(c, bk[j], -7 + (j % 2) * 12 - (j > 1 ? 4 : 0), -18 - (j > 1 ? 3 : 0), 17);
      c.beginPath(); c.moveTo(-14, -20); c.lineTo(14, -20); c.lineTo(11, -8); c.lineTo(-11, -8); c.closePath(); fs(c, '#d9a066', OUT, 2.5);
      c.beginPath(); c.moveTo(-12, -15); c.lineTo(12, -15); c.strokeStyle = '#b07840'; c.lineWidth = 1.5; c.stroke();
    }
    // head
    A.head(c, o.sp, 0, -50, 1, { color: o.color, look: look, back: back, hat: o.hat, gold: o.gold, blink: o.blink, mood: o.mood });
    if (o.bow && !back) { var bx = 12, by = -66; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 7, by - 5); c.lineTo(bx - 7, by + 5); c.closePath(); c.moveTo(bx, by); c.lineTo(bx + 7, by - 5); c.lineTo(bx + 7, by + 5); c.closePath(); fs(c, o.bow, OUT, 2); circ(c, bx, by, 2.5); fs(c, o.bow, OUT, 1.5); }
    if (o.glasses && !back) {
      var gx = look * 4; c.strokeStyle = '#231a1a'; c.lineWidth = 2;
      circ(c, gx - 7.5, -52, 5.5); c.stroke(); circ(c, gx + 7.5, -52, 5.5); c.stroke(); c.beginPath(); c.moveTo(gx - 2, -52); c.lineTo(gx + 2, -52); c.stroke();
    }
    c.restore();
  };

  function tail(c, d, body, t, look) {
    var w = Math.sin(t * 4) * 0.15;
    switch (d.tail) {
      case 'raccoon':
        c.save(); c.translate(-12 + look * 3, -14); c.rotate(-0.9 + w);
        ell(c, -12, 0, 15, 8); fs(c, body, OUT, 3);
        c.save(); ell(c, -12, 0, 15, 8); c.clip(); c.fillStyle = '#4b4f63';
        for (var i = 0; i < 3; i++) c.fillRect(-24 + i * 9, -9, 4.5, 18); c.restore();
        ell(c, -12, 0, 15, 8); fs(c, null, OUT, 3);
        c.restore(); break;
      case 'fox':
        c.save(); c.translate(-12, -14); c.rotate(-0.8 + w);
        ell(c, -13, 0, 16, 8.5); fs(c, body, OUT, 3);
        c.save(); ell(c, -13, 0, 16, 8.5); c.clip(); c.fillStyle = '#fff5ea'; c.fillRect(-32, -10, 10, 20); c.restore();
        ell(c, -13, 0, 16, 8.5); fs(c, null, OUT, 3);
        c.restore(); break;
      case 'cat':
        c.beginPath(); c.moveTo(-12, -12); c.quadraticCurveTo(-30, -14 + w * 20, -26, -34); c.strokeStyle = OUT; c.lineWidth = 8; c.stroke(); c.strokeStyle = body; c.lineWidth = 4.5; c.stroke(); break;
      case 'mouse':
        c.beginPath(); c.moveTo(-12, -10); c.quadraticCurveTo(-30, -6, -28, -24 + w * 20); c.strokeStyle = '#ff9eb5'; c.lineWidth = 3; c.stroke(); break;
      case 'curl':
        c.beginPath(); c.arc(-17, -16, 4, 0, Math.PI * 1.6); c.strokeStyle = '#e0708f'; c.lineWidth = 2.5; c.stroke(); break;
    }
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  A.shade = shade;
})();

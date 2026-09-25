/* Pizza Empire — all art drawn in code (canvas). Defines window.PZArt. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var OL = '#3b2314';
  var A = {};

  /* ------------------------------------------------------------ helpers */
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
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
  function fs(c, fill, stroke, lw) {
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = lw || 4; c.strokeStyle = stroke; c.stroke(); }
  }
  function star(c, x, y, r1, r2, n, rot) {
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = (rot || -Math.PI / 2) + i * Math.PI / n;
      var r = i % 2 ? r2 : r1;
      c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  A.circ = circ; A.ell = ell; A.rr = rr; A.fs = fs; A.star = star; A.rng = rng;

  function miniPizza(c, x, y, r) {
    circ(c, x, y, r); fs(c, '#e59a3c', OL, Math.max(2, r * 0.18));
    circ(c, x, y, r * 0.72); fs(c, '#ffd766');
    c.fillStyle = '#d63a2a';
    circ(c, x - r * 0.3, y - r * 0.2, r * 0.18); c.fill();
    circ(c, x + r * 0.28, y - r * 0.05, r * 0.18); c.fill();
    circ(c, x - r * 0.02, y + r * 0.34, r * 0.18); c.fill();
  }
  function slice(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.55);
    c.lineTo(x - s * 0.48, y - s * 0.3);
    c.quadraticCurveTo(x, y - s * 0.52, x + s * 0.48, y - s * 0.3);
    c.closePath();
    fs(c, '#ffd766', OL, s * 0.09);
    c.beginPath();
    c.moveTo(x - s * 0.5, y - s * 0.3);
    c.quadraticCurveTo(x, y - s * 0.56, x + s * 0.5, y - s * 0.3);
    c.lineWidth = s * 0.16; c.strokeStyle = '#e59a3c'; c.lineCap = 'round'; c.stroke();
    c.fillStyle = '#d63a2a';
    circ(c, x - s * 0.12, y - s * 0.08, s * 0.09); c.fill();
    circ(c, x + s * 0.13, y - s * 0.04, s * 0.08); c.fill();
    circ(c, x, y + s * 0.22, s * 0.07); c.fill();
  }
  A.miniPizza = miniPizza; A.slice = slice;

  /* ---------------------------------------------------- building icons */
  // Each draws inside a 100x100 box centred on 0,0. t = time (s) for animation.
  var ICON = [];

  ICON[0] = function (c, t, v) { // chef
    v = v || 0;
    var skins = ['#ffcf9e', '#e7a978', '#c3875a', '#8d5a3b'];
    var scarf = ['#e8413a', '#2f8fe8', '#3cb44b', '#ff9f1a'];
    // scarf
    c.beginPath(); c.moveTo(-18, 26); c.lineTo(18, 26); c.lineTo(0, 44); c.closePath(); fs(c, scarf[v % 4], OL, 3.5);
    // face
    circ(c, 0, 6, 24); fs(c, skins[v % 4], OL, 4);
    // hat
    rr(c, -20, -24, 40, 14, 4); fs(c, '#fff', OL, 3.5);
    circ(c, -15, -30, 13); fs(c, '#fff', OL, 3.5);
    circ(c, 15, -30, 13); fs(c, '#fff', OL, 3.5);
    circ(c, 0, -36, 16); fs(c, '#fff', OL, 3.5);
    c.fillStyle = '#fff'; c.fillRect(-17, -28, 34, 16);
    // eyes
    c.fillStyle = OL; circ(c, -8, 2, 3.6); c.fill(); circ(c, 8, 2, 3.6); c.fill();
    c.fillStyle = '#fff'; circ(c, -7, 1, 1.2); c.fill(); circ(c, 9, 1, 1.2); c.fill();
    c.fillStyle = 'rgba(255,110,110,0.45)'; circ(c, -15, 11, 4.5); c.fill(); circ(c, 15, 11, 4.5); c.fill();
    // mustache
    if (v % 2 === 0) {
      c.fillStyle = '#5a321a';
      ell(c, -7, 13, 8, 4, 0.25); c.fill(); ell(c, 7, 13, 8, 4, -0.25); c.fill();
      c.beginPath(); c.arc(0, 19, 5, 0.2 * Math.PI, 0.8 * Math.PI); c.lineWidth = 3; c.strokeStyle = OL; c.stroke();
    } else {
      c.beginPath(); c.arc(0, 12, 7, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = 3.5; c.strokeStyle = OL; c.lineCap = 'round'; c.stroke();
    }
  };

  ICON[1] = function (c, t) { // brick oven
    t = t || 0;
    rr(c, -44, 12, 88, 30, 5); fs(c, '#b8492f', OL, 4);
    c.beginPath(); c.moveTo(-40, 14); c.arc(0, 14, 40, Math.PI, 0); c.closePath(); fs(c, '#d9663f', OL, 4);
    // bricks
    c.strokeStyle = 'rgba(90,30,10,0.35)'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 14, 28, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    c.beginPath(); c.arc(0, 14, 16, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-44 + i * 30 + 14, 12); c.lineTo(-44 + i * 30 + 14, 27); c.stroke(); }
    c.beginPath(); c.moveTo(-44, 27); c.lineTo(44, 27); c.stroke();
    // chimney
    rr(c, 12, -40, 13, 22, 2); fs(c, '#a33e27', OL, 3.5);
    // mouth
    c.beginPath(); c.moveTo(-19, 22); c.lineTo(-19, 8); c.arc(0, 8, 19, Math.PI, 0); c.lineTo(19, 22); c.closePath(); fs(c, '#2a1208', OL, 3.5);
    // fire
    var f = Math.sin(t * 13) * 2.5;
    c.beginPath(); c.moveTo(-14, 22); c.quadraticCurveTo(-12, 6 + f, -6, 10); c.quadraticCurveTo(-2, -4 - f, 3, 9); c.quadraticCurveTo(8, 2 + f, 14, 22); c.closePath();
    fs(c, '#ff8a1f');
    c.beginPath(); c.moveTo(-8, 22); c.quadraticCurveTo(-4, 10 - f, 0, 14); c.quadraticCurveTo(5, 8 + f, 8, 22); c.closePath();
    fs(c, '#ffe14d');
    // smoke
    c.fillStyle = 'rgba(255,255,255,0.75)';
    var sy = (t * 18) % 16;
    circ(c, 19, -46 - sy, 5 + sy * 0.2); c.fill();
  };

  ICON[2] = function (c, t) { // scooter
    t = t || 0;
    var wr = t * 8;
    function wheel(x) {
      circ(c, x, 27, 13); fs(c, '#2d2d3a', OL, 3);
      circ(c, x, 27, 5.5); fs(c, '#cfd6e6');
      c.strokeStyle = '#cfd6e6'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + Math.cos(wr) * 9, 27 + Math.sin(wr) * 9); c.lineTo(x - Math.cos(wr) * 9, 27 - Math.sin(wr) * 9); c.stroke();
    }
    // pizza box
    rr(c, -44, -30, 34, 30, 4); fs(c, '#f4c77b', OL, 3.5);
    c.strokeStyle = 'rgba(120,70,20,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-44, -22); c.lineTo(-10, -22); c.stroke();
    miniPizza(c, -27, -10, 7);
    // body
    c.beginPath();
    c.moveTo(-34, 6); c.lineTo(14, 6); c.lineTo(26, -14); c.lineTo(34, -14); c.lineTo(30, 20); c.lineTo(-30, 22); c.closePath();
    fs(c, '#ff4d4d', OL, 4);
    rr(c, -24, -2, 26, 9, 4); fs(c, '#3a2c3f', OL, 3);
    // handlebar
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(29, -14); c.lineTo(22, -28); c.lineWidth = 5; c.strokeStyle = OL; c.stroke();
    c.beginPath(); c.moveTo(16, -30); c.lineTo(28, -28); c.lineWidth = 6; c.strokeStyle = '#3a2c3f'; c.stroke();
    circ(c, 36, -6, 5); fs(c, '#ffe14d', OL, 2.5);
    wheel(-24); wheel(24);
  };

  ICON[3] = function (c, t) { // food truck
    t = t || 0;
    rr(c, -48, -24, 70, 48, 7); fs(c, '#4fc3f7', OL, 4);
    rr(c, 18, -8, 30, 32, 7); fs(c, '#29a3db', OL, 4);
    rr(c, 26, -3, 15, 12, 3); fs(c, '#e3f7ff', OL, 2.5);
    // serving window + awning
    rr(c, -40, -12, 44, 20, 3); fs(c, '#fff5d6', OL, 3);
    for (var i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#fff' : '#ff4d4d';
      c.fillRect(-44 + i * 8.6, -22, 8.6, 9);
    }
    c.strokeStyle = OL; c.lineWidth = 3; c.strokeRect(-44, -22, 52, 9);
    miniPizza(c, -18, -1, 7);
    // roof slice sign
    slice(c, -14, -36, 24);
    // wheels
    var wr = t * 8;
    [-28, 30].forEach(function (x) {
      circ(c, x, 27, 11); fs(c, '#2d2d3a', OL, 3);
      circ(c, x, 27, 4.5); fs(c, '#cfd6e6');
      c.strokeStyle = '#cfd6e6'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + Math.cos(wr) * 8, 27 + Math.sin(wr) * 8); c.lineTo(x - Math.cos(wr) * 8, 27 - Math.sin(wr) * 8); c.stroke();
    });
  };

  ICON[4] = function (c) { // pizzeria
    rr(c, -40, -22, 80, 64, 4); fs(c, '#fff1dc', OL, 4);
    rr(c, -45, -30, 90, 11, 3); fs(c, '#b5462a', OL, 3.5);
    // awning
    for (var i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fff' : '#e8413a';
      c.fillRect(-40 + i * 10, -19, 10, 11);
      circ(c, -35 + i * 10, -8, 5); c.fill();
    }
    c.strokeStyle = OL; c.lineWidth = 3; c.beginPath(); c.moveTo(-40, -19); c.lineTo(40, -19); c.stroke();
    rr(c, -9, 8, 18, 34, 3); fs(c, '#8b5a2b', OL, 3);
    circ(c, 5, 26, 1.8); fs(c, '#ffd23f');
    rr(c, -34, 6, 18, 16, 3); fs(c, '#9fe3ff', OL, 3);
    rr(c, 16, 6, 18, 16, 3); fs(c, '#9fe3ff', OL, 3);
    miniPizza(c, 0, -40, 12);
  };

  ICON[5] = function (c, t) { // factory
    t = t || 0;
    // smoke
    c.fillStyle = 'rgba(255,255,255,0.85)';
    var s = (t * 14) % 14;
    circ(c, 32, -48 - s, 6 + s * 0.3); c.fill();
    circ(c, 40, -58 - s, 5 + s * 0.25); c.fill();
    rr(c, 24, -46, 14, 44, 2); fs(c, '#c0504d', OL, 3.5);
    c.fillStyle = '#fff'; c.fillRect(24, -38, 14, 5);
    c.beginPath();
    c.moveTo(-44, 40); c.lineTo(-44, -8); c.lineTo(-30, -22); c.lineTo(-30, -8); c.lineTo(-16, -22); c.lineTo(-16, -8); c.lineTo(-2, -22); c.lineTo(-2, -8); c.lineTo(44, -8); c.lineTo(44, 40); c.closePath();
    fs(c, '#8ea6c8', OL, 4);
    c.fillStyle = '#ffe98a';
    for (var i = 0; i < 3; i++) { rr(c, -38 + i * 12, 2, 8, 8, 2); fs(c, '#ffe98a', OL, 2); }
    rr(c, 20, 18, 16, 22, 2); fs(c, '#5c6f8f', OL, 3);
    // spinning pizza gear
    c.save(); c.translate(0, 22); c.rotate(t * 2);
    star(c, 0, 0, 15, 11, 8); fs(c, '#6f86a8', OL, 3);
    c.restore();
    miniPizza(c, 0, 22, 9);
  };

  ICON[6] = function (c, t) { // airship
    t = t || 0;
    c.strokeStyle = OL; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(-10, 10); c.lineTo(-8, 22); c.moveTo(10, 10); c.lineTo(8, 22); c.stroke();
    rr(c, -15, 20, 30, 12, 4); fs(c, '#8b5a2b', OL, 3);
    c.fillStyle = '#9fe3ff'; c.fillRect(-10, 23, 6, 5); c.fillRect(-2, 23, 6, 5); c.fillRect(6, 23, 5, 5);
    // fins
    c.beginPath(); c.moveTo(-34, -8); c.lineTo(-48, -26); c.lineTo(-40, -8); c.closePath(); fs(c, '#e0602a', OL, 3);
    c.beginPath(); c.moveTo(-34, -8); c.lineTo(-48, 10); c.lineTo(-40, -8); c.closePath(); fs(c, '#e0602a', OL, 3);
    ell(c, 0, -8, 44, 22); fs(c, '#ff8a3d', OL, 4);
    ell(c, 4, -16, 30, 7); fs(c, 'rgba(255,255,255,0.35)');
    c.strokeStyle = 'rgba(160,60,10,0.4)'; c.lineWidth = 2.5;
    ell(c, 0, -8, 44, 10); c.stroke();
    slice(c, 8, -8, 20);
    // propeller
    var p = Math.abs(Math.sin(t * 20)) * 9 + 2;
    ell(c, -47, -8, 3, p); fs(c, '#cfd6e6', OL, 2);
  };

  ICON[7] = function (c, t) { // moon base
    t = t || 0;
    circ(c, 0, 12, 38); fs(c, '#ece6cc', OL, 4);
    c.fillStyle = 'rgba(150,140,110,0.45)';
    circ(c, -16, 20, 8); c.fill(); circ(c, 14, 30, 6); c.fill(); circ(c, 18, 8, 4.5); c.fill(); circ(c, -24, 2, 4); c.fill();
    // dome
    c.beginPath(); c.moveTo(-20, -22); c.arc(0, -22, 20, Math.PI, 0); c.closePath(); fs(c, 'rgba(170,230,255,0.85)', OL, 3.5);
    miniPizza(c, 0, -30, 8);
    ell(c, -8, -32, 3, 6, 0.5); fs(c, 'rgba(255,255,255,0.8)');
    // antenna
    c.strokeStyle = OL; c.lineWidth = 3; c.beginPath(); c.moveTo(24, -24); c.lineTo(32, -44); c.stroke();
    circ(c, 32, -46, 4); fs(c, Math.sin(t * 6) > 0 ? '#ff4d4d' : '#ffb3b3', OL, 2);
    c.beginPath(); c.moveTo(18, -22); c.lineTo(30, -22); c.lineTo(24, -28); c.closePath(); fs(c, '#cfd6e6', OL, 2.5);
  };

  ICON[8] = function (c, t) { // portal
    t = t || 0;
    var cols = ['#7b2ff7', '#2fd8f7', '#f72fb3', '#7b2ff7', '#2fd8f7'];
    for (var k = 0; k < 5; k++) {
      circ(c, 0, 0, 44 - k * 8); fs(c, cols[k], k === 0 ? OL : null, 4);
    }
    c.save(); c.rotate(t * 2.5);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3; c.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      c.beginPath(); c.arc(0, 0, 30, i * TAU / 4, i * TAU / 4 + 1); c.stroke();
    }
    c.restore();
    circ(c, 0, 0, 12); fs(c, '#1b0b3a');
    c.save(); c.rotate(Math.sin(t * 2) * 0.3); slice(c, 0, 0, 22); c.restore();
  };

  ICON[9] = function (c, t) { // galaxy
    t = t || 0;
    circ(c, 0, 0, 45); fs(c, '#1d1446', OL, 4);
    c.save(); c.rotate(t * 0.6);
    for (var arm = 0; arm < 2; arm++) {
      for (var i = 0; i < 12; i++) {
        var a = arm * Math.PI + i * 0.42;
        var r = 8 + i * 2.9;
        c.fillStyle = i % 3 === 0 ? '#d63a2a' : i % 3 === 1 ? '#ffd766' : '#b58cff';
        circ(c, Math.cos(a) * r, Math.sin(a) * r, 4.2 - i * 0.18); c.fill();
      }
    }
    c.restore();
    circ(c, 0, 0, 11); fs(c, '#ffd766', '#e59a3c', 4);
    c.fillStyle = '#d63a2a'; circ(c, -3, -2, 2.6); c.fill(); circ(c, 4, 3, 2.3); c.fill();
    c.fillStyle = '#fff';
    star(c, -28, -24, 5, 2, 4); c.fill(); star(c, 30, 20, 4, 1.6, 4); c.fill();
  };

  A.icon = function (c, i, x, y, size, t, v) {
    c.save(); c.translate(x, y); c.scale(size / 100, size / 100);
    c.lineJoin = 'round'; c.lineCap = 'round';
    ICON[i](c, t || 0, v);
    c.restore();
  };

  /* ------------------------------------------------------ upgrade icons */
  var TIER_BG = [['#ffcf8a', '#e0913a'], ['#dfe7f2', '#9eb0c9'], ['#ffe98a', '#e3b21a'], ['#ff9fb4', '#d9365e'], ['#b7f4ff', '#3cb6e0']];
  var JAR = ['#e0402a', '#ffd766', '#c6d24a', '#3aa845', '#ff5a2a', '#dfe3ea', '#ffe14d', '#7b2ff7', '#ff5fa2'];

  function hand(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s / 100, s / 100);
    rr(c, -8, -44, 16, 44, 8); fs(c, '#fff', OL, 4);
    rr(c, -24, -12, 48, 46, 16); fs(c, '#fff', OL, 4);
    c.strokeStyle = OL; c.lineWidth = 3;
    c.beginPath(); c.moveTo(8, -8); c.lineTo(8, 8); c.moveTo(-8, -6); c.lineTo(-8, 8); c.stroke();
    rr(c, -20, 30, 40, 12, 4); fs(c, '#ff4d4d', OL, 3);
    c.restore();
  }
  function trophy(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.scale(s / 100, s / 100);
    col = col || '#ffc928';
    c.lineWidth = 6; c.strokeStyle = OL;
    c.beginPath(); c.arc(-30, -12, 12, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(30, -12, 12, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.beginPath(); c.moveTo(-30, -30); c.lineTo(30, -30); c.lineTo(24, 4); c.quadraticCurveTo(0, 22, -24, 4); c.closePath(); fs(c, col, OL, 4);
    rr(c, -6, 12, 12, 16, 2); fs(c, col, OL, 3.5);
    rr(c, -22, 26, 44, 12, 4); fs(c, '#8b5a2b', OL, 3.5);
    star(c, 0, -12, 10, 4.5, 5); fs(c, '#fff8d0');
    c.restore();
  }
  function jar(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.scale(s / 100, s / 100);
    rr(c, -26, -20, 52, 58, 14); fs(c, 'rgba(230,248,255,0.9)', OL, 4);
    rr(c, -21, -4, 42, 37, 10); fs(c, col);
    rr(c, -22, -36, 44, 16, 5); fs(c, '#b5462a', OL, 4);
    rr(c, -14, 4, 28, 16, 3); fs(c, '#fff8e6', OL, 2.5);
    ell(c, -14, -8, 4, 10, 0.2); fs(c, 'rgba(255,255,255,0.8)');
    c.restore();
  }
  A.trophy = trophy; A.hand = hand;

  // Draws an upgrade icon into a 100x100 box at 0..size.
  A.upgradeIcon = function (c, u, size) {
    var s = size;
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    var bg;
    if (u.kind === 'b') bg = TIER_BG[u.tier];
    else if (u.kind === 'click' || u.kind === 'pct') bg = ['#c7f0ff', '#4fa3ff'];
    else if (u.kind === 'flav') bg = ['#ffe3c4', '#ff9d5c'];
    else if (u.kind === 'gold') bg = ['#fff2a8', '#f5b700'];
    else bg = ['#e5d4ff', '#9b6bff'];
    var g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    rr(c, s * 0.04, s * 0.04, s * 0.92, s * 0.92, s * 0.2); fs(c, g, OL, s * 0.05);
    if (u.kind === 'b') {
      A.icon(c, u.b, s * 0.5, s * 0.5, s * 0.74, 0, 0);
      for (var i = 0; i <= u.tier; i++) {
        star(c, s * (0.2 + i * 0.13), s * 0.82, s * 0.085, s * 0.04, 5); fs(c, '#fff3a0', OL, s * 0.025);
      }
    } else if (u.kind === 'click' || u.kind === 'pct') {
      hand(c, s * 0.5, s * 0.55, s * 0.62);
      if (u.kind === 'pct') { star(c, s * 0.76, s * 0.26, s * 0.14, s * 0.06, 5); fs(c, '#ffe14d', OL, s * 0.03); }
      for (var j = 0; j < Math.min(u.tier + 1, 4); j++) {
        c.fillStyle = '#fff'; circ(c, s * 0.2, s * (0.24 + j * 0.13), s * 0.04); c.fill();
      }
    } else if (u.kind === 'flav') {
      jar(c, s * 0.5, s * 0.54, s * 0.72, JAR[u.tier % JAR.length]);
    } else if (u.kind === 'gold') {
      A.goldenPizza(c, s * 0.5, s * 0.5, s * 0.3, 0);
      star(c, s * 0.78, s * 0.22, s * 0.1, s * 0.04, 4); fs(c, '#fff');
    } else {
      trophy(c, s * 0.5, s * 0.52, s * 0.7, '#ffc928');
    }
    c.restore();
  };

  /* ----------------------------------------------------------- pizzas */
  // Topping positions: deterministic, avoiding the face (eyes & mouth).
  function spots(seed, n, R, minD, face) {
    var r = rng(seed), out = [], tries = 0;
    while (out.length < n && tries < 2000) {
      tries++;
      var a = r() * TAU, d = Math.sqrt(r()) * R * 0.68;
      var x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (face) {
        if (Math.hypot(x + R * 0.3, y + R * 0.12) < R * 0.27) continue;
        if (Math.hypot(x - R * 0.3, y + R * 0.12) < R * 0.27) continue;
        if (Math.abs(x) < R * 0.3 && y > R * 0.05 && y < R * 0.42) continue;
      }
      var ok = true;
      for (var i = 0; i < out.length; i++) if (Math.hypot(out[i].x - x, out[i].y - y) < minD) { ok = false; break; }
      if (!ok) continue;
      out.push({ x: x, y: y, a: r() * TAU, k: r() });
    }
    return out;
  }

  // Draw a pizza of radius R centred at 0,0 (no face).
  A.pizza = function (c, skin, R, face) {
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    // crust
    var g = c.createRadialGradient(0, -R * 0.2, R * 0.5, 0, 0, R);
    g.addColorStop(0, skin.crust); g.addColorStop(0.85, skin.crust); g.addColorStop(1, shade(skin.crust, -0.25));
    circ(c, 0, 0, R); fs(c, g, OL, Math.max(2, R * 0.035));
    // crust bumps
    c.fillStyle = shade(skin.crust, 0.22);
    for (var i = 0; i < 22; i++) {
      var a = i * TAU / 22;
      ell(c, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, R * 0.06, R * 0.028, a + Math.PI / 2); c.fill();
    }
    // sauce
    circ(c, 0, 0, R * 0.83); fs(c, skin.sauce);
    // cheese blob
    c.beginPath();
    for (var k = 0; k <= 60; k++) {
      var b = k * TAU / 60;
      var rr2 = R * (0.76 + 0.035 * Math.sin(b * 7) + 0.02 * Math.sin(b * 11 + 1));
      c.lineTo(Math.cos(b) * rr2, Math.sin(b) * rr2);
    }
    c.closePath(); fs(c, skin.cheese);
    if (skin.top === 'rainbow') {
      var cols = ['#ff5a5f', '#ffb13b', '#ffe14d', '#5fd35f', '#4fa3ff', '#b36bff'];
      for (var q = 0; q < 6; q++) {
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R * 0.76, q * TAU / 6, (q + 1) * TAU / 6); c.closePath();
        c.fillStyle = cols[q]; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
      }
    }
    // cheese highlights
    c.fillStyle = 'rgba(255,255,255,0.28)';
    var hs = spots(99, 7, R, R * 0.2, false);
    hs.forEach(function (p) { ell(c, p.x, p.y, R * 0.09, R * 0.05, p.a); c.fill(); });
    // slice lines
    c.strokeStyle = 'rgba(80,40,10,0.18)'; c.lineWidth = Math.max(1.5, R * 0.018);
    for (var s = 0; s < 4; s++) {
      var an = s * Math.PI / 4 + Math.PI / 8;
      c.beginPath(); c.moveTo(Math.cos(an) * R * 0.8, Math.sin(an) * R * 0.8); c.lineTo(-Math.cos(an) * R * 0.8, -Math.sin(an) * R * 0.8); c.stroke();
    }
    toppings(c, skin, R, face);
    c.restore();
  };

  function toppings(c, skin, R, face) {
    var lw = Math.max(1.5, R * 0.018);
    var P;
    switch (skin.top) {
      case 'basil':
        P = spots(11, 11, R, R * 0.2, face);
        P.forEach(function (p, i) {
          if (i % 2 === 0) {
            circ(c, p.x, p.y, R * 0.1); fs(c, '#e0402a', '#a8231d', lw);
            circ(c, p.x, p.y, R * 0.055); fs(c, '#ff7a5c');
          } else {
            ell(c, p.x, p.y, R * 0.08, R * 0.04, p.a); fs(c, '#3aa845', '#1f6b2a', lw);
          }
        });
        break;
      case 'pepperoni':
        P = spots(22, 12, R, R * 0.2, face);
        P.forEach(function (p) {
          circ(c, p.x, p.y, R * 0.1); fs(c, '#c7302a', '#8f1c16', lw);
          c.fillStyle = '#a8231d'; circ(c, p.x + R * 0.03, p.y + R * 0.02, R * 0.018); c.fill(); circ(c, p.x - R * 0.03, p.y - R * 0.01, R * 0.015); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.35)'; ell(c, p.x - R * 0.03, p.y - R * 0.04, R * 0.03, R * 0.015, -0.6); c.fill();
        });
        break;
      case 'veggie':
        P = spots(33, 14, R, R * 0.17, face);
        P.forEach(function (p, i) {
          var m = i % 4;
          if (m === 0) { circ(c, p.x, p.y, R * 0.07); c.lineWidth = R * 0.03; c.strokeStyle = '#2f9a3d'; c.stroke(); }
          else if (m === 1) { circ(c, p.x, p.y, R * 0.045); c.lineWidth = R * 0.025; c.strokeStyle = '#2b2b2b'; c.stroke(); }
          else if (m === 2) {
            c.beginPath(); c.arc(p.x, p.y, R * 0.07, Math.PI, 0); c.closePath(); fs(c, '#d9b48a', '#8b5a2b', lw);
            rr(c, p.x - R * 0.025, p.y, R * 0.05, R * 0.06, R * 0.01); fs(c, '#f0dcc0', '#8b5a2b', lw);
          } else { c.beginPath(); c.arc(p.x, p.y, R * 0.07, p.a, p.a + 2.4); c.lineWidth = R * 0.025; c.strokeStyle = '#8e3fb0'; c.stroke(); }
        });
        break;
      case 'pineapple':
        P = spots(44, 13, R, R * 0.18, face);
        P.forEach(function (p, i) {
          c.save(); c.translate(p.x, p.y); c.rotate(p.a);
          if (i % 2 === 0) { c.beginPath(); c.moveTo(-R * 0.07, -R * 0.04); c.lineTo(R * 0.07, -R * 0.04); c.lineTo(R * 0.04, R * 0.05); c.lineTo(-R * 0.04, R * 0.05); c.closePath(); fs(c, '#ffd43b', '#c79a00', lw); }
          else { rr(c, -R * 0.06, -R * 0.05, R * 0.12, R * 0.1, R * 0.02); fs(c, '#ff8fa3', '#c9506a', lw); }
          c.restore();
        });
        break;
      case 'cheese':
        P = spots(55, 16, R, R * 0.14, face);
        var cc = ['#fff4c2', '#ffc93c', '#ffe9a0', '#f7b733'];
        P.forEach(function (p, i) { ell(c, p.x, p.y, R * 0.08, R * 0.055, p.a); fs(c, cc[i % 4]); });
        break;
      case 'sprinkles':
        P = spots(66, 26, R, R * 0.1, face);
        var sc = ['#ff5fa2', '#4fc3f7', '#ffd43b', '#7ee081', '#ffffff'];
        P.forEach(function (p, i) {
          c.save(); c.translate(p.x, p.y); c.rotate(p.a);
          rr(c, -R * 0.045, -R * 0.014, R * 0.09, R * 0.028, R * 0.014); fs(c, sc[i % 5]);
          c.restore();
        });
        break;
      case 'rainbow':
        P = spots(77, 14, R, R * 0.16, face);
        var rc = ['#ff5a5f', '#ffb13b', '#ffe14d', '#5fd35f', '#4fa3ff', '#b36bff'];
        P.forEach(function (p, i) { circ(c, p.x, p.y, R * 0.055); fs(c, rc[i % 6], '#fff', lw); });
        break;
      case 'gold':
        P = spots(88, 11, R, R * 0.2, face);
        P.forEach(function (p) {
          circ(c, p.x, p.y, R * 0.09); fs(c, '#ffd700', '#b8860b', lw);
          star(c, p.x, p.y, R * 0.05, R * 0.02, 4); fs(c, '#fff8c0');
        });
        break;
      case 'stars':
        P = spots(99, 14, R, R * 0.16, face);
        P.forEach(function (p, i) {
          star(c, p.x, p.y, R * (i % 3 ? 0.06 : 0.09), R * (i % 3 ? 0.025 : 0.04), 5, p.a); fs(c, i % 2 ? '#fff' : '#ffe14d');
        });
        break;
      case 'melon':
        P = spots(111, 16, R, R * 0.15, face);
        P.forEach(function (p) {
          c.save(); c.translate(p.x, p.y); c.rotate(p.a);
          ell(c, 0, 0, R * 0.035, R * 0.022); fs(c, '#2b2b2b');
          c.restore();
        });
        break;
    }
  }

  // Draw the pizza face at 0,0 for radius R. look: {x,y} unit offset; mood: 0 normal, 1 happy squint, 2 wow
  A.face = function (c, R, lx, ly, blink, mood) {
    var ex = R * 0.3, ey = -R * 0.12;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // blush
    c.fillStyle = 'rgba(255,90,110,0.35)';
    ell(c, -R * 0.46, R * 0.1, R * 0.1, R * 0.06); c.fill();
    ell(c, R * 0.46, R * 0.1, R * 0.1, R * 0.06); c.fill();
    var lw = R * 0.035;
    if (mood === 1) {
      c.strokeStyle = OL; c.lineWidth = lw * 1.3;
      [-1, 1].forEach(function (sd) {
        c.beginPath(); c.moveTo(sd * ex - R * 0.1, ey + R * 0.03); c.lineTo(sd * ex, ey - R * 0.06); c.lineTo(sd * ex + R * 0.1, ey + R * 0.03); c.stroke();
      });
    } else if (blink) {
      c.strokeStyle = OL; c.lineWidth = lw * 1.3;
      [-1, 1].forEach(function (sd) { c.beginPath(); c.moveTo(sd * ex - R * 0.1, ey); c.quadraticCurveTo(sd * ex, ey + R * 0.06, sd * ex + R * 0.1, ey); c.stroke(); });
    } else {
      var big = mood === 2 ? 1.12 : 1;
      [-1, 1].forEach(function (sd) {
        ell(c, sd * ex, ey, R * 0.14 * big, R * 0.17 * big); fs(c, '#fff', OL, lw);
        var px = sd * ex + lx * R * 0.05, py = ey + ly * R * 0.06;
        circ(c, px, py, R * 0.085 * big); fs(c, '#2b1a10');
        c.fillStyle = '#fff'; circ(c, px - R * 0.03, py - R * 0.035, R * 0.03); c.fill();
        circ(c, px + R * 0.03, py + R * 0.03, R * 0.013); c.fill();
      });
    }
    // mouth
    if (mood === 1 || mood === 2) {
      c.beginPath(); c.moveTo(-R * 0.16, R * 0.16); c.quadraticCurveTo(0, R * 0.46, R * 0.16, R * 0.16); c.closePath();
      fs(c, '#6b1d14', OL, lw);
      c.save(); c.clip();
      ell(c, 0, R * 0.34, R * 0.1, R * 0.07); fs(c, '#ff6b81');
      c.restore();
    } else {
      c.beginPath(); c.moveTo(-R * 0.14, R * 0.18); c.quadraticCurveTo(0, R * 0.34, R * 0.14, R * 0.18);
      c.lineWidth = lw * 1.2; c.strokeStyle = OL; c.stroke();
    }
    c.restore();
  };

  A.goldenPizza = function (c, x, y, R, t) {
    c.save(); c.translate(x, y);
    var g = c.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.6);
    g.addColorStop(0, 'rgba(255,230,90,0.7)'); g.addColorStop(1, 'rgba(255,230,90,0)');
    circ(c, 0, 0, R * 1.6); c.fillStyle = g; c.fill();
    c.rotate(t * 0.8);
    circ(c, 0, 0, R); fs(c, '#f5b700', OL, Math.max(2, R * 0.08));
    circ(c, 0, 0, R * 0.78); fs(c, '#ffe14d');
    c.fillStyle = '#ffb300';
    for (var i = 0; i < 5; i++) { var a = i * TAU / 5; circ(c, Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, R * 0.14); c.fill(); }
    star(c, 0, 0, R * 0.32, R * 0.14, 5); fs(c, '#fffbe0');
    c.restore();
  };

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function f(v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }
  A.shade = shade;

  /* ------------------------------------------------------ scene pieces */
  // Full-body chef behind the counter. x,y = feet-ish anchor (counter line), s = scale (1 = 100px tall).
  A.sceneChef = function (c, x, y, s, t, v) {
    var skins = ['#ffcf9e', '#e7a978', '#c3875a', '#8d5a3b'];
    var scarf = ['#e8413a', '#2f8fe8', '#3cb44b', '#ff9f1a'];
    var ph = v * 1.7;
    var toss = Math.max(0, Math.sin(t * 3 + ph)) * 26;
    var bob = Math.sin(t * 6 + ph) * 1.5;
    c.save(); c.translate(x, y + bob); c.scale(s, s);
    c.lineJoin = 'round'; c.lineCap = 'round';
    // body (coat)
    rr(c, -26, -40, 52, 60, 18); fs(c, '#ffffff', OL, 3.5);
    c.fillStyle = '#d7dbe6'; circ(c, 0, -22, 2.5); c.fill(); circ(c, 0, -10, 2.5); c.fill();
    c.beginPath(); c.moveTo(-12, -40); c.lineTo(12, -40); c.lineTo(0, -28); c.closePath(); fs(c, scarf[v % 4], OL, 3);
    // arms up
    var hy = -78 - toss * 0.25;
    c.strokeStyle = OL; c.lineWidth = 13;
    c.beginPath(); c.moveTo(-20, -30); c.lineTo(-24, hy); c.stroke();
    c.beginPath(); c.moveTo(20, -30); c.lineTo(24, hy); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 7.5;
    c.beginPath(); c.moveTo(-20, -30); c.lineTo(-24, hy + 6); c.stroke();
    c.beginPath(); c.moveTo(20, -30); c.lineTo(24, hy + 6); c.stroke();
    circ(c, -24, hy, 6); fs(c, skins[v % 4], OL, 2.5);
    circ(c, 24, hy, 6); fs(c, skins[v % 4], OL, 2.5);
    // head
    circ(c, 0, -56, 17); fs(c, skins[v % 4], OL, 3.5);
    c.fillStyle = OL; circ(c, -6, -58, 2.6); c.fill(); circ(c, 6, -58, 2.6); c.fill();
    c.fillStyle = 'rgba(255,110,110,0.45)'; circ(c, -11, -51, 3.5); c.fill(); circ(c, 11, -51, 3.5); c.fill();
    if (v % 2 === 0) { c.fillStyle = '#5a321a'; ell(c, -5, -50, 6, 3, 0.25); c.fill(); ell(c, 5, -50, 6, 3, -0.25); c.fill(); }
    else { c.beginPath(); c.arc(0, -52, 5, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = 2.5; c.strokeStyle = OL; c.stroke(); }
    // hat
    rr(c, -14, -78, 28, 10, 3); fs(c, '#fff', OL, 3);
    circ(c, -10, -82, 9); fs(c, '#fff', OL, 3); circ(c, 10, -82, 9); fs(c, '#fff', OL, 3); circ(c, 0, -87, 11); fs(c, '#fff', OL, 3);
    c.fillStyle = '#fff'; c.fillRect(-12, -84, 24, 12);
    // dough
    var dy = hy - 8 - toss;
    var flip = Math.abs(Math.cos(t * 5 + ph));
    ell(c, 0, dy, 26, 4 + flip * 7); fs(c, '#f6dca0', OL, 3);
    ell(c, 0, dy, 17, 2 + flip * 4); fs(c, '#e8413a');
    c.restore();
  };

  window.PZArt = A;
})();

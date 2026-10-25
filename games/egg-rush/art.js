/* Procedural pets, guardians and the strip world. Sprites are painted once. */
(function (ER) {
  'use strict';
  const A = ER.art = {};
  const TILE = 48;
  const INK = '#2a2348';
  const PAL = ['#7dce6a', '#ffe08a', '#e7f6ff', '#f0c56b', '#ffd0e4', '#d7f3ff', '#3a2d6b'];
  const PAL2 = ['#63b84a', '#f2c14e', '#c5e4f6', '#e0a84a', '#ff8fbe', '#b9e4ff', '#2a2154'];
  const RCOL = ['#fff6d8', '#fff6d8', '#7ec8ff', '#d28bff', '#ffd23f', '#ff6d8f'];
  const COAT = ['#ffe14a', '#fff', '#f7b6d2', '#f4efe4', '#8fde6a', '#d08a4a', '#7dcea0', '#ffb703', '#5ec8e6', '#ff6b6b', '#c9a0ff', '#4dabf7', '#2c3558', '#8ecae6', '#c68642', '#ff8a3d', '#d7c4a8', '#e0b07a', '#e6b15a', '#8dcea8', '#e85d4c', '#f6d27a', '#90be6d', '#c4a484', '#ff8fab', '#fff', '#ffd0e0', '#ff5d8f', '#ffd6f5', '#9dffc8', '#8ecae6', '#f0c6ff', '#ffd23f', '#ffd7b5', '#b8f2a0', '#ffb3d9', '#d5d3f0', '#ff6b4a', '#9a96d4', '#b6ff9a', '#7ec8ff', '#fff'];
  const cache = new Map();
  const parts = [];
  let floaters = [];
  A.hudCoin = { x: 1100, y: 40 };
  A.hudCoin2 = { x: 920, y: 40 };
  A.titleDemo = false;
  A.grabPop = 0;
  A.party = null;
  A.homeGlow = 0;
  A.hopPad = -1;
  A.look = { shirt: '#3d7dff', hat: 0 };
  let hop = null;
  let sceneTime = 0;
  let wink = 1;

  function rng(n) { n = (n * 1103515245 + 12345) >>> 0; return (n % 1000) / 1000; }
  function X(c, x) { return (x - c.x) * TILE * c.z; }
  function Y(c, y) { return (y - c.y) * TILE * c.z; }
  A.worldPoint = function (cam, px, py) { return { x: cam.x + px / (TILE * cam.z), y: cam.y + py / (TILE * cam.z) }; };

  function eggPath(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(x, y - ry);
    ctx.bezierCurveTo(x + rx, y - ry, x + rx * 0.92, y + ry * 0.55, x, y + ry);
    ctx.bezierCurveTo(x - rx * 0.92, y + ry * 0.55, x - rx, y - ry, x, y - ry);
  }
  function eye(ctx, x, y, open, look) {
    const lw = ctx.lineWidth;
    const base = open > 1 ? 1 : open < 0 ? 0 : open;
    const o = base * wink;
    const h = o > 0.15 ? 1.6 + o * 4.6 : 1.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y, 5.2, h, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    if (o > 0.4) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + (look || 0), y + 0.4, 2.15, 0, 7); ctx.fill(); }
    ctx.lineWidth = lw;
  }
  function ink(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
  function blob(ctx, x, y, rx, ry, col, rot) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  function poly(ctx, pts, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function face(ctx, y, gap) {
    eye(ctx, -(gap || 6), y, 1, 1); eye(ctx, gap || 6, y, 1, 1);
    ctx.fillStyle = 'rgba(255,110,130,0.45)';
    ctx.beginPath(); ctx.arc(-11, y + 4, 3, 0, 7); ctx.arc(11, y + 4, 3, 0, 7); ctx.fill();
    ink(ctx, 2); ctx.beginPath(); ctx.arc(0, y + 3, 4.5, 0.25, Math.PI - 0.25); ctx.stroke();
  }
  function feet(ctx, y) {
    ink(ctx, 3);
    ctx.beginPath();
    ctx.moveTo(-6, y); ctx.lineTo(-9, y + 8); ctx.lineTo(-2, y + 8);
    ctx.moveTo(6, y); ctx.lineTo(9, y + 8); ctx.lineTo(2, y + 8);
    ctx.stroke();
  }
  function wing(ctx, x, y, col) { blob(ctx, x, y, 7, 5, col, -0.5); }

  function animal(ctx, id, gold) {
    const coat = gold ? '#ffd23f' : COAT[id] || '#fff';
    const alt = gold ? '#fff3a8' : '#fff';
    ink(ctx, 3);
    ctx.fillStyle = 'rgba(40,30,60,0.16)';
    ctx.beginPath(); ctx.ellipse(0, 22, 16, 5, 0, 0, 7); ctx.fill();
    const k = id % 42;
    if (k === 0) { blob(ctx, 0, 4, 14, 12, coat); poly(ctx, [-4, -8, 0, -18, 4, -8], '#ff5a3c'); wing(ctx, -12, 4, alt); poly(ctx, [8, 2, 16, 5, 8, 8], '#ff8a3d'); face(ctx, -2, 5); feet(ctx, 12); }
    else if (k === 1) { blob(ctx, 0, 4, 15, 11, coat); poly(ctx, [8, 2, 20, 6, 8, 10], '#ffb703'); wing(ctx, -12, 2, '#ffe08a'); face(ctx, -1, 5); feet(ctx, 12); }
    else if (k === 2) { blob(ctx, -8, -16, 5, 14, coat); blob(ctx, 8, -16, 5, 14, coat); blob(ctx, 0, 6, 13, 12, coat); blob(ctx, -14, 10, 5, 4, alt); face(ctx, 2, 5); feet(ctx, 14); }
    else if (k === 3) { blob(ctx, -8, 2, 8, 8, coat); blob(ctx, 8, 0, 8, 8, coat); blob(ctx, 0, 8, 10, 9, coat); blob(ctx, 0, -6, 8, 7, '#f7d7c4'); face(ctx, -6, 4); feet(ctx, 14); }
    else if (k === 4) { blob(ctx, 0, 8, 16, 10, coat); blob(ctx, -8, -6, 7, 7, alt); blob(ctx, 8, -6, 7, 7, alt); eye(ctx, -8, -6, 1, 0); eye(ctx, 8, -6, 1, 0); ink(ctx, 2); ctx.beginPath(); ctx.arc(0, 8, 7, 0.2, Math.PI - 0.2); ctx.stroke(); }
    else if (k === 5) { blob(ctx, 0, 6, 14, 12, coat); ctx.fillStyle = '#8a5a32'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-12 + i * 4, 0); ctx.lineTo(-10 + i * 4, -12); ctx.lineTo(-6 + i * 4, 0); ctx.fill(); } face(ctx, 4, 5); feet(ctx, 14); }
    else if (k === 6) { blob(ctx, 0, 4, 16, 12, '#6fbf73'); blob(ctx, 0, 2, 12, 9, coat); blob(ctx, 12, 6, 6, 5, '#7dcea0'); face(ctx, 4, 3); }
    else if (k === 7) { poly(ctx, [0, -16, 4, -4, 16, -2, 6, 6, 10, 18, 0, 10, -10, 18, -6, 6, -16, -2, -4, -4], coat); face(ctx, 0, 4); }
    else if (k === 8) { blob(ctx, 0, 4, 18, 9, coat, -0.2); poly(ctx, [-16, 2, -26, -4, -26, 10], coat); poly(ctx, [2, -4, 8, -14, 10, -2], alt); face(ctx, 2, 5); }
    else if (k === 9) { blob(ctx, 0, 2, 14, 12, coat); poly(ctx, [6, 0, 18, 4, 6, 8], '#ffb703'); wing(ctx, -12, 2, '#ff8a3d'); poly(ctx, [-4, -12, 0, -4, 6, -12], coat); face(ctx, -1, 5); feet(ctx, 12); }
    else if (k === 10) { blob(ctx, 0, -2, 12, 10, coat); ink(ctx, 3); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-10 + i * 5, 6); ctx.quadraticCurveTo(-16 + i * 8, 16, -8 + i * 4, 20); ctx.stroke(); } face(ctx, -4, 4); }
    else if (k === 11) { blob(ctx, 2, 4, 16, 10, coat); poly(ctx, [-14, 4, -26, -4, -26, 12], coat); poly(ctx, [4, -4, 10, -12, 8, -2], alt); face(ctx, 2, 4); }
    else if (k === 12) { blob(ctx, 0, 2, 13, 16, '#2c3558'); blob(ctx, 0, 6, 8, 11, alt); poly(ctx, [0, 2, 10, 6, 0, 9], '#ffb703'); face(ctx, -4, 4); feet(ctx, 16); }
    else if (k === 13) { blob(ctx, 0, 6, 18, 10, coat); poly(ctx, [-8, 8, -18, 14, -6, 14], coat); blob(ctx, 12, 2, 6, 5, coat); face(ctx, 0, 4); }
    else if (k === 14) { blob(ctx, -8, -10, 5, 5, coat); blob(ctx, 8, -10, 5, 5, coat); blob(ctx, 0, 6, 15, 13, coat); blob(ctx, 0, 8, 7, 5, '#f3d2b5'); face(ctx, 2, 5); feet(ctx, 16); }
    else if (k === 15) { poly(ctx, [-6, -6, -14, -20, -2, -8], coat); poly(ctx, [6, -6, 14, -20, 2, -8], coat); blob(ctx, 0, 6, 13, 11, coat); poly(ctx, [8, 4, 18, 8, 8, 12], alt); blob(ctx, -16, 8, 7, 5, coat); face(ctx, 1, 5); feet(ctx, 14); }
    else if (k === 16) { poly(ctx, [-8, -8, -12, -18, -2, -10], coat); poly(ctx, [8, -8, 12, -18, 2, -10], coat); blob(ctx, 0, 4, 14, 14, coat); blob(ctx, -6, 0, 6, 6, alt); blob(ctx, 6, 0, 6, 6, alt); eye(ctx, -6, 0, 1, 0); eye(ctx, 6, 0, 1, 0); poly(ctx, [-2, 6, 0, 10, 2, 6], '#ffb703'); }
    else if (k === 17) { ink(ctx, 3); ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-16, -18); ctx.lineTo(-6, -12); ctx.moveTo(8, -8); ctx.lineTo(16, -18); ctx.lineTo(6, -12); ctx.stroke(); blob(ctx, 0, 6, 14, 12, coat); blob(ctx, 0, 8, 5, 3, '#e76f51'); face(ctx, 0, 5); feet(ctx, 15); }
    else if (k === 18) { blob(ctx, -4, -2, 8, 7, coat); blob(ctx, 6, -6, 9, 8, coat); blob(ctx, 0, 10, 16, 8, coat); blob(ctx, 16, -2, 6, 5, coat); face(ctx, -8, 3); feet(ctx, 16); }
    else if (k === 19) { ink(ctx, 4); ctx.strokeStyle = coat; ctx.beginPath(); ctx.arc(-4, 8, 8, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(6, 4, 6, 0, 7); ctx.stroke(); blob(ctx, 12, -2, 5, 4, coat); ink(ctx, 2); ctx.strokeStyle = '#e76f51'; ctx.beginPath(); ctx.moveTo(16, -2); ctx.lineTo(22, -6); ctx.moveTo(16, -2); ctx.lineTo(22, 2); ctx.stroke(); eye(ctx, 12, -3, 1, 1); }
    else if (k === 20) { blob(ctx, 0, 6, 12, 8, coat); poly(ctx, [-12, 4, -22, -2, -22, 8], coat); poly(ctx, [12, 4, 22, -2, 22, 8], coat); ink(ctx, 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -8, 4, -18); ctx.stroke(); face(ctx, 4, 4); }
    else if (k === 21) { blob(ctx, -9, -8, 8, 12, coat, -0.4); blob(ctx, 9, -8, 8, 12, coat, 0.4); blob(ctx, 0, 8, 11, 10, coat); face(ctx, 4, 4); feet(ctx, 15); }
    else if (k === 22) { blob(ctx, 2, 6, 16, 7, coat); poly(ctx, [-14, 6, -26, 2, -24, 12], coat); ink(ctx, 3); ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(-8, 16); ctx.moveTo(4, 10); ctx.lineTo(2, 16); ctx.stroke(); face(ctx, 2, 4); }
    else if (k === 23) { blob(ctx, 0, 2, 12, 11, coat); wing(ctx, -14, 0, '#c4a484'); wing(ctx, 12, -2, '#c4a484'); poly(ctx, [4, 0, 16, 3, 4, 7], '#ffb703'); face(ctx, -2, 4); feet(ctx, 12); }
    else if (k === 24) { blob(ctx, 0, 4, 16, 16, coat); blob(ctx, 0, 4, 6, 6, '#fff8e8'); ctx.fillStyle = '#ff8fab'; ctx.fillRect(-14, -2, 10, 5); face(ctx, 8, 0); }
    else if (k === 25) { blob(ctx, 0, 8, 14, 8, coat); blob(ctx, 0, -4, 12, 8, alt); face(ctx, -4, 4); }
    else if (k === 26) { poly(ctx, [-14, 6, 14, 6, 10, 20, -10, 20], '#ff8a3d'); blob(ctx, 0, -2, 14, 10, coat); ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(0, -8, 4, 0, 7); ctx.fill(); face(ctx, 0, 4); }
    else if (k === 27) { ink(ctx, 4); ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 22); ctx.stroke(); blob(ctx, 0, -2, 14, 14, coat); ink(ctx, 2); ctx.beginPath(); ctx.arc(0, -2, 8, 0, 5); ctx.stroke(); face(ctx, -2, 4); }
    else if (k === 28) { ink(ctx, 4); ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 22); ctx.stroke(); blob(ctx, -6, 0, 10, 10, coat); blob(ctx, 7, -2, 9, 9, '#fff'); blob(ctx, 0, -8, 8, 8, '#ffd6f5'); face(ctx, -2, 3); }
    else if (k === 29) { ctx.globalAlpha = 0.9; blob(ctx, 0, 4, 14, 14, coat); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-4, -2, 4, 6, -0.4, 0, 7); ctx.fill(); face(ctx, 2, 4); }
    else if (k === 30) { blob(ctx, 0, 4, 12, 10, coat); poly(ctx, [6, 2, 16, 5, 6, 8], '#ffb703'); wing(ctx, -10, 3, alt); poly(ctx, [-8, 6, -18, 2, -16, 10], coat); face(ctx, 0, 4); feet(ctx, 12); }
    else if (k === 31) { blob(ctx, -10, -4, 10, 7, coat, -0.4); blob(ctx, 10, -4, 10, 7, '#f0c6ff', 0.4); blob(ctx, -8, 8, 8, 6, coat, 0.3); blob(ctx, 8, 8, 8, 6, '#f0c6ff', -0.3); ink(ctx, 3); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 14); ctx.stroke(); face(ctx, -2, 2); }
    else if (k === 32) { blob(ctx, 0, 4, 12, 12, coat); ctx.fillStyle = INK; ctx.fillRect(-12, -2, 24, 3); ctx.fillRect(-12, 6, 24, 3); wing(ctx, -12, -2, 'rgba(255,255,255,0.8)'); face(ctx, -4, 4); }
    else if (k === 33) { poly(ctx, [-8, -4, -14, -18, -2, -8], coat); poly(ctx, [8, -4, 14, -18, 2, -8], coat); blob(ctx, 0, 6, 13, 12, coat); ink(ctx, 2); ctx.beginPath(); ctx.moveTo(-16, 4); ctx.quadraticCurveTo(-24, 0, -18, 12); ctx.stroke(); ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(10, 4); ctx.lineTo(20, 2); ctx.moveTo(10, 7); ctx.lineTo(20, 8); ctx.stroke(); face(ctx, 2, 4); feet(ctx, 14); }
    else if (k === 34) { blob(ctx, 0, 6, 14, 10, coat); wing(ctx, -16, -2, '#8dcea8'); wing(ctx, 14, -4, '#8dcea8'); poly(ctx, [-4, -8, 0, -18, 4, -8], coat); poly(ctx, [-12, 10, -22, 16, -10, 16], coat); face(ctx, 2, 4); }
    else if (k === 35) { ink(ctx, 5); const cols = ['#ff5a6a', '#ffb703', '#ffe14a', '#7dce6a', '#7ec8ff', '#c9a0ff']; for (let i = 0; i < 6; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(0, 16, 20 - i * 2.2, Math.PI, 0); ctx.stroke(); } blob(ctx, -18, 14, 6, 4, '#fff'); blob(ctx, 18, 14, 6, 4, '#fff'); face(ctx, 4, 3); }
    else if (k === 36) { ink(ctx, 3); ctx.fillStyle = coat; ctx.fillRect(-12, -2, 24, 18); ctx.strokeRect(-12, -2, 24, 18); blob(ctx, 0, -10, 10, 9, alt); ctx.fillStyle = '#7ec8ff'; ctx.fillRect(-6, -12, 12, 5); ink(ctx, 3); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -26); ctx.stroke(); ctx.fillStyle = '#ff5a6a'; ctx.beginPath(); ctx.arc(0, -28, 3, 0, 7); ctx.fill(); feet(ctx, 16); }
    else if (k === 37) { poly(ctx, [0, -20, 10, 0, -10, 0], '#ff6b4a'); ctx.fillStyle = coat; ctx.fillRect(-8, 0, 16, 16); ctx.strokeRect(-8, 0, 16, 16); poly(ctx, [-8, 8, -16, 16, -8, 16], coat); poly(ctx, [8, 8, 16, 16, 8, 16], coat); poly(ctx, [-4, 16, 0, 24, 4, 16], '#ffb703'); face(ctx, 6, 3); }
    else if (k === 38) { poly(ctx, [-8, 10, -4, -8, 6, -12, 14, 0, 8, 14, -2, 16], coat); blob(ctx, 2, 2, 4, 3, '#6b5a8a'); poly(ctx, [-14, 8, -22, 4, -18, 14], '#ffb703'); face(ctx, 2, 3); }
    else if (k === 39) { blob(ctx, 0, -2, 14, 13, coat); blob(ctx, -5, -2, 4, 6, '#2a2348'); blob(ctx, 6, -2, 4, 6, '#2a2348'); ink(ctx, 3); ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(-8, -24); ctx.moveTo(6, -14); ctx.lineTo(10, -24); ctx.stroke(); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(-8, -26, 2.5, 0, 7); ctx.arc(10, -26, 2.5, 0, 7); ctx.fill(); ink(ctx, 2); ctx.beginPath(); ctx.arc(0, 6, 4, 0.2, Math.PI - 0.2); ctx.stroke(); }
    else if (k === 40) { blob(ctx, 0, 2, 14, 14, coat); ink(ctx, 3); ctx.beginPath(); ctx.ellipse(0, 2, 20, 6, -0.3, 0, 7); ctx.stroke(); face(ctx, 2, 4); }
    else { blob(ctx, 0, -4, 12, 12, alt); ctx.fillStyle = '#7ec8ff'; ctx.beginPath(); ctx.ellipse(0, -2, 8, 6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = coat; ctx.fillRect(-10, 8, 20, 12); ctx.strokeRect(-10, 8, 20, 12); ctx.fillStyle = '#d7d5f0'; ctx.fillRect(8, 4, 6, 10); feet(ctx, 18); }
    if (gold) { ctx.fillStyle = '#fff'; poly(ctx, [-7, -18, 0, -28, 7, -18], '#ffd23f'); }
  }

  A.sprite = function (b, s, v) {
    const k = b + ':' + s + ':' + v;
    let c = cache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    const giant = v === 1 || v === 3;
    c.width = c.height = giant ? 128 : 96;
    const g = c.getContext('2d');
    g.save();
    g.translate(c.width / 2, c.height / 2 + 2);
    g.scale((giant ? 1.18 : 1) * (c.width / 96), (giant ? 1.18 : 1) * (c.width / 96));
    animal(g, (b * 6 + s) % 42, v === 2 || v === 3);
    g.restore();
    cache.set(k, c);
    return c;
  };

  function pushPart(p) { if (parts.length < 150) parts.push(p); }
  A.burst = function (x, y, n, colors, speed) {
    if (A.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (speed || 2.2) * (0.45 + Math.random());
      pushPart({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 0.45 + Math.random() * 0.25, max: 0.7, size: 0.08 + Math.random() * 0.08, color: colors[i % colors.length], g: 5 });
    }
  };
  A.confetti = function (x, y, n) {
    if (A.reduced) return;
    const colors = ['#ff5a8a', '#ffd23f', '#7ec8ff', '#fff', '#9dff8a', '#ff8a3d', '#c9a0ff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 1.5 + Math.random() * 2.8;
      pushPart({ kind: 'bit', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.6, g: 6.5, life: 0.85, max: 0.85, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, size: 0.14, color: colors[i % colors.length] });
    }
  };
  A.coins = function (x, y, n) {
    if (A.reduced) return;
    for (let i = 0; i < n; i++) pushPart({ kind: 'coin', x: x + (Math.random() - 0.5) * 0.3, y: y, vx: (Math.random() - 0.5) * 2.4, vy: -3.2 - Math.random() * 1.8, g: 9, life: 0.95, max: 0.95, size: 0.16, color: '#ffd23f' });
  };
  A.flyCoins = function (x, y, n, who) {
    if (A.reduced) {
      for (let i = 0; i < Math.min(4, n); i++) pushPart({ kind: 'coin', x: x + (i - 1) * 0.18, y: y, vx: (i - 1.5) * 0.7, vy: -1.4, g: 7, life: 0.4, max: 0.4, size: 0.16, color: '#ffd23f' });
      return;
    }
    for (let i = 0; i < n; i++) {
      const life = 0.62 + i * 0.045;
      pushPart({ kind: 'fly', x: x + (Math.random() - 0.5) * 0.25, y: y, life: life, max: life, to: who || 0 });
    }
  };
  A.sparkle = function (x, y, n) {
    if (A.reduced) return;
    const cols = ['#fff', '#ffd23f', '#fff6c2', '#ff8ad8', '#7ec8ff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 0.5 + Math.random() * 1.8;
      pushPart({ kind: 'star', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, g: 1.4, life: 0.75, max: 0.75, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, size: 0.14, color: cols[i % cols.length] });
    }
  };
  let reveal = null;
  A.revealPet = function (b, s, v, x, y, name, life) {
    const L = life > 0 ? life : 2.3;
    reveal = { b: b, s: s, v: v, x: x, y: y, name: name || '', life: L, max: L };
  };
  A.hopToPen = function (job) {
    hop = { b: job.b, s: job.s, v: job.v, pad: job.pad, x0: job.x, y0: job.y, x1: job.tx, y1: job.ty, life: 1.05, max: 1.05 };
    A.hopPad = job.pad;
  };
  A.crack = function (x, y, species) {
    if (A.reduced) return;
    const col = RCOL[species] || '#fff6d8';
    for (const side of [-1, 1]) pushPart({ kind: 'half', x: x, y: y, vx: side * 2.1, vy: -2.8, g: 8, life: 0.85, max: 0.85, rot: 0, vr: side * 6, side: side, color: col });
    A.confetti(x, y, 8);
    A.sparkle(x, y - 0.3, 4);
    pushPart({ kind: 'ring', x: x, y: y, life: 0.45, max: 0.45, size: 0.12, grow: 4.2, color: '#fff' });
    pushPart({ kind: 'ring', x: x, y: y, life: 0.55, max: 0.55, size: 0.2, grow: 2.4, color: '#ffd23f' });
  };
  A.float = function (x, y, text, color, size) {
    floaters.push({ x: x, y: y, text: text, color: color || '#fff', life: size ? 1.2 : 0.8, size: size || 0 });
    if (floaters.length > 24) floaters.shift();
  };
  A.tick = function (w, dt) {
    if (reveal) { reveal.life -= dt; if (reveal.life <= 0) reveal = null; }
    if (A.grabPop > 0) A.grabPop = Math.max(0, A.grabPop - dt);
    if (A.homeGlow > 0) A.homeGlow = Math.max(0, A.homeGlow - dt);
    if (hop) {
      hop.life -= dt;
      if (hop.life <= 0) { A.sparkle(hop.x1, hop.y1 - 0.3, 6); hop = null; A.hopPad = -1; }
    }
    if (A.party) { A.party.life -= dt; if (A.party.life <= 0) A.party = null; }
    if (!A.reduced && w && w.mode === '1p') {
      const p = w.players[0];
      if (p && p.egg && Math.random() < 0.55 && parts.length < 140) {
        parts.push({ x: p.x, y: p.y - 1.1, vx: (Math.random() - 0.5) * 0.35, vy: -0.7, life: 0.35, max: 0.35, size: 0.1, color: RCOL[p.egg.species] || '#fff', g: 0 });
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'fly' && A.onArrive) A.onArrive(p.to || 0);
        parts.splice(i, 1); continue;
      }
      if (p.kind === 'fly') continue;
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.rot != null) p.rot += (p.vr || 0) * dt;
      if (p.grow) p.size += p.grow * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].life -= dt; floaters[i].y -= dt * 0.8; if (floaters[i].life <= 0) floaters.splice(i, 1); }
  };
  A.clearFx = function () { parts.length = 0; floaters = []; reveal = null; hop = null; A.hopPad = -1; A.grabPop = 0; A.homeGlow = 0; A.party = null; };

  function drawFloats(ctx, cam) {
    const z = cam.z;
    for (const f of floaters) {
      const size = f.size || 22 * z;
      ctx.font = '700 ' + size + 'px Fredoka';
      const half = ctx.measureText(f.text).width / 2 + 8;
      const pad = size * 0.62;
      let x = X(cam, f.x), y = Y(cam, f.y);
      x = Math.max(half, Math.min(1280 - half, x));
      y = Math.max(90 + pad, Math.min(632 - pad, y));
      ctx.globalAlpha = Math.max(0, f.life);
      label(ctx, f.text, x, y, size, f.color, /[ء-ي]/.test(f.text));
    }
    ctx.globalAlpha = 1;
  }
  function label(ctx, text, x, y, size, color, rtl) {
    ctx.save();
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + size + 'px Fredoka';
    ctx.lineWidth = Math.max(4, size * 0.22); ctx.strokeStyle = INK; ctx.fillStyle = color || '#fff';
    ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
    ctx.restore();
  }
  function sign(ctx, text, x, y, size) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.font = '700 ' + size + 'px Fredoka';
    const tw = ctx.measureText(text).width;
    const h = size * 1.42;
    const w = tw + size * 1.15;
    const left = x - w / 2, top = y - h / 2, r = h / 2;
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.arc(left + w - r, top + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(left + r, top + h);
    ctx.arc(left + r, top + r, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    ctx.fillStyle = '#fff8e8';
    ctx.fill();
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + size * 0.06);
    ctx.restore();
  }
  function badge(ctx, x, y, text, fill, size) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, size * 0.62, 0, 7); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    label(ctx, text, x, y + 1, size, fill, false);
  }

  function tuft(ctx, x, y, z, col) {
    const sway = A.reduced ? 0 : Math.sin(sceneTime * 1.4 + x * 0.02) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.strokeStyle = col; ctx.lineWidth = 3.2 * z; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-8 * z, -18 * z);
    ctx.moveTo(0, 0); ctx.lineTo(0, -22 * z);
    ctx.moveTo(0, 0); ctx.lineTo(9 * z, -16 * z);
    ctx.stroke();
    ctx.restore();
  }
  function flower(ctx, x, y, z, col) {
    const sway = A.reduced ? 0 : Math.sin(sceneTime * 1.5 + x * 0.015) * 0.1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.strokeStyle = '#2f7a32'; ctx.lineWidth = 3 * z; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16 * z); ctx.stroke();
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.28 - 1.2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 7 * z, -18 * z + Math.sin(a) * 7 * z, 4.4 * z, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#fff3a0'; ink(ctx, 2);
    ctx.beginPath(); ctx.arc(0, -18 * z, 3.2 * z, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function bush(ctx, x, y, z, petal) {
    ctx.fillStyle = 'rgba(40,30,60,0.16)';
    ctx.beginPath(); ctx.ellipse(x, y + 6 * z, 18 * z, 6 * z, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f8f3e';
    ctx.beginPath(); ctx.arc(x - 10 * z, y, 14 * z, 0, 7); ctx.arc(x + 11 * z, y + 2 * z, 13 * z, 0, 7); ctx.arc(x, y - 10 * z, 15 * z, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    flower(ctx, x + 2 * z, y - 6 * z, z * 0.7, petal || '#ffe14a');
  }
  function trunk(ctx, x, y, z, h) {
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(x - 4 * z, y - h * 0.2, 8 * z, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x - 4 * z, y - h * 0.2, 8 * z, h);
  }
  function decoAt(ctx, cam, bio, x, y, h) {
    const z = cam.z, px = X(cam, x), py = Y(cam, y);
    ctx.fillStyle = 'rgba(40,30,60,0.16)';
    ctx.beginPath(); ctx.ellipse(px, py + 4 * z, 12 * z, 4 * z, 0, 0, 7); ctx.fill();
    if (bio <= 0) {
      if (h > 0.93) { trunk(ctx, px, py, z, 28 * z); ctx.fillStyle = '#3e9a45'; ctx.beginPath(); ctx.arc(px, py - 26 * z, 24 * z, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#6ed15a'; ctx.beginPath(); ctx.arc(px - 6 * z, py - 30 * z, 8 * z, 0, 7); ctx.fill(); }
      else if (h > 0.82) bush(ctx, px, py, z, h > 0.88 ? '#ff8fab' : '#ffe14a');
      else flower(ctx, px, py, z, h > 0.72 ? '#ff8fab' : h > 0.62 ? '#ffe14a' : '#fff');
    } else if (bio === 1) {
      if (h > 0.9) {
        ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 4 * z;
        ctx.beginPath(); ctx.moveTo(px, py + 8 * z); ctx.quadraticCurveTo(px + 8 * z, py - 8 * z, px + 4 * z, py - 28 * z); ctx.stroke();
        ctx.fillStyle = '#3e9a45';
        ctx.beginPath(); ctx.ellipse(px + 4 * z, py - 30 * z, 16 * z, 6 * z, -0.4, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px - 6 * z, py - 24 * z, 12 * z, 5 * z, 0.6, 0, 7); ctx.fill();
      } else if (h > 0.8) { ctx.fillStyle = '#f4d7a2'; ctx.beginPath(); ctx.ellipse(px, py, 7 * z, 4 * z, 0.4, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(px, py, 6 * z, 3 * z, 0, 0, Math.PI); ctx.stroke(); }
    } else if (bio === 2) {
      if (h > 0.88) { trunk(ctx, px, py, z, 8 * z); ctx.fillStyle = '#2f6b4f'; poly(ctx, [px, py - 28 * z, px + 14 * z, py - 4 * z, px - 14 * z, py - 4 * z], '#2f6b4f'); poly(ctx, [px, py - 38 * z, px + 10 * z, py - 16 * z, px - 10 * z, py - 16 * z], '#3e8a64'); }
      else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 5 * z, 0, 7); ctx.fill(); }
    } else if (bio === 3) {
      if (h > 0.9) { ctx.fillStyle = '#3e9a45'; ctx.fillRect(px - 3 * z, py - 18 * z, 6 * z, 22 * z); ctx.fillRect(px - 10 * z, py - 14 * z, 8 * z, 4 * z); ctx.strokeStyle = INK; ctx.strokeRect(px - 3 * z, py - 18 * z, 6 * z, 22 * z); }
      else { ctx.fillStyle = '#d7b56a'; ctx.beginPath(); ctx.ellipse(px, py, 10 * z, 6 * z, 0, 0, 7); ctx.fill(); ctx.stroke(); }
    } else if (bio === 4) {
      ctx.fillStyle = h > 0.85 ? '#ff5d8f' : '#ffd23f';
      ctx.beginPath(); ctx.arc(px, py - 8 * z, 7 * z, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 10 * z); ctx.stroke();
    } else if (bio === 5) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(px, py, 16 * z, 8 * z, 0, 0, 7); ctx.ellipse(px - 10 * z, py + 2 * z, 10 * z, 7 * z, 0, 0, 7); ctx.ellipse(px + 12 * z, py + 2 * z, 11 * z, 7 * z, 0, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = h > 0.8 ? '#6a5acd' : '#c9c4ef';
      ctx.beginPath(); ctx.ellipse(px, py, 12 * z, 7 * z, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(px - 3 * z, py - 1 * z, 3 * z, 0, 7); ctx.fill();
    }
  }
  function scatter(ctx, w, cam) {
    const z = cam.z, x0 = (cam.x | 0) - 1, x1 = (cam.x + 1280 / (TILE * z) | 0) + 2;
    const y0 = Math.max(0, (cam.y | 0) - 1), y1 = Math.min(14, (cam.y + 720 / (TILE * z) | 0) + 2);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (Math.abs(ty - 8) < 1.45) continue;
        if (w.mode === '1p' && tx < 12.6 && ty > 4 && ty < 12.2) continue;
        const edge = ty <= 1 || ty >= 13;
        const h = rng(tx * 19 + ty * 47 + 9);
        if (h < (edge ? 0.46 : 0.64)) continue;
        const bio = w.mode === '2p' ? (tx < 22 ? 0 : tx < 36 ? 1 : 2) : ER.biomeAt(tx + 0.2);
        const px = tx + 0.2 + rng(tx * 3 + ty) * 0.7, py = ty + 0.25 + rng(tx + ty * 5) * 0.6;
        let near = false;
        for (let i = 0; i < w.nests.length; i++) {
          const n = w.nests[i];
          if (Math.abs(n.x - px) < 1.35 && Math.abs(n.y - py) < 1.2) { near = true; break; }
        }
        if (!near) decoAt(ctx, cam, bio < 0 ? 0 : bio, px, py, h);
      }
    }
  }
  function fence(ctx, cam, x0, x1, y, gap0, gap1) {
    const z = cam.z;
    ctx.lineCap = 'round';
    for (let x = x0; x <= x1 + 0.01; x += 1.15) {
      if (gap0 != null && x > gap0 - 0.15 && x < gap1 + 0.15) continue;
      const px = X(cam, x), py = Y(cam, y);
      ctx.fillStyle = '#e7c49a';
      ctx.fillRect(px - 4 * z, py - 16 * z, 8 * z, 30 * z);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(px - 4 * z, py - 16 * z, 8 * z, 30 * z);
    }
    ctx.strokeStyle = '#c9854a'; ctx.lineWidth = 4 * z;
    for (const dy of [-0.22, 0.12]) {
      ctx.beginPath();
      let on = false;
      for (let x = x0; x <= x1; x += 0.2) {
        if (gap0 != null && x > gap0 && x < gap1) { on = false; continue; }
        const px = X(cam, x), py = Y(cam, y + dy);
        if (!on) { ctx.moveTo(px, py); on = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  function road(ctx, cam) {
    const z = cam.z, x0 = cam.x - 1, x1 = cam.x + 1280 / (TILE * z) + 1;
    ctx.beginPath();
    for (let x = x0, i = 0; x <= x1; x += 0.45, i++) {
      const y = 8.25 + Math.sin(x * 0.45) * 0.35;
      const px = X(cam, x), py = Y(cam, y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#d7b56a'; ctx.lineWidth = 46 * z; ctx.stroke();
    ctx.strokeStyle = '#f0d7a2'; ctx.lineWidth = 30 * z; ctx.stroke();
  }
  function straw(ctx, x, y, z) {
    ctx.fillStyle = '#e6b14e';
    ctx.beginPath(); ctx.ellipse(x, y, 30 * z, 14 * z, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a56b3c'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#f8e2a4'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(x, y, 22 * z, 8 * z, i * 0.35, 0.2, Math.PI - 0.2); ctx.stroke(); }
  }
  function home(ctx, w, cam, time) {
    const z = cam.z;
    const accent = ['#ff8a3d', '#ff5a8a', '#7c6cff', '#ffd23f'][w.baseTheme] || '#ff8a3d';
    if (cam.x < 18) {
      const gx = X(cam, 4.6), gy = Y(cam, 4.2);
      const yard = ctx.createRadialGradient(gx, gy, 10, gx, gy, 340 * z);
      yard.addColorStop(0, 'rgba(255, 236, 170, 0.45)');
      yard.addColorStop(1, 'rgba(255, 236, 170, 0)');
      ctx.fillStyle = yard;
      ctx.fillRect(X(cam, 0), Y(cam, 0), ER.BASE * TILE * z, ER.H * TILE * z);
    }
    const pens = w.pens || 4;
    const cols = Math.min(8, pens), rows = Math.ceil(pens / 8);
    const penX0 = 0.45, penX1 = 1.15 + (cols - 1) * 1.42 + 0.95;
    const penY0 = 1.15, penY1 = 2.35 + (rows - 1) * 2.15 + 1.05;
    ctx.fillStyle = '#f6e2a4';
    ctx.beginPath(); ctx.ellipse(X(cam, (penX0 + penX1) / 2), Y(cam, (penY0 + penY1) / 2), (penX1 - penX0) * TILE * z * 0.48, (penY1 - penY0) * TILE * z * 0.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e6c078'; ctx.lineWidth = 6 * z; ctx.stroke();
    fence(ctx, cam, penX0, penX1, penY0, penX0 + 1.3, penX0 + 2.5);
    fence(ctx, cam, penX0, penX1, penY1, null, null);
    ink(ctx, 3);
    ctx.beginPath();
    ctx.moveTo(X(cam, penX0), Y(cam, penY0)); ctx.lineTo(X(cam, penX0), Y(cam, penY1));
    ctx.moveTo(X(cam, penX1), Y(cam, penY0)); ctx.lineTo(X(cam, penX1), Y(cam, penY1));
    ctx.stroke();
    const penSignX = penX1 + 1.35;
    if (penSignX < 10.3) {
      const sx = X(cam, penSignX), sy = Y(cam, (penY0 + penY1) / 2);
      ctx.fillStyle = '#c9854a';
      ctx.fillRect(sx - 4 * z, sy + 10 * z, 8 * z, 28 * z);
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.strokeRect(sx - 4 * z, sy + 10 * z, 8 * z, 28 * z);
      sign(ctx, 'الحظيرة', sx, sy, 16 * z);
    } else sign(ctx, 'الحظيرة', X(cam, (penX0 + penX1) / 2), Y(cam, penY1 + 0.85), 16 * z);
    fence(ctx, cam, 0.4, 11.3, 0.55, null, null);
    fence(ctx, cam, 0.4, 11.3, 14.35, null, null);
    ctx.strokeStyle = '#c9854a'; ctx.lineWidth = 5 * z; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(cam, 11.05), Y(cam, 0.7)); ctx.lineTo(X(cam, 11.05), Y(cam, 6.9));
    ctx.moveTo(X(cam, 11.05), Y(cam, 9.5)); ctx.lineTo(X(cam, 11.05), Y(cam, 14.2));
    ctx.moveTo(X(cam, 11.35), Y(cam, 0.7)); ctx.lineTo(X(cam, 11.35), Y(cam, 6.9));
    ctx.moveTo(X(cam, 11.35), Y(cam, 9.5)); ctx.lineTo(X(cam, 11.35), Y(cam, 14.2));
    ctx.stroke();
    ctx.fillStyle = '#e7c49a';
    ctx.fillRect(X(cam, 11.05) - 5 * z, Y(cam, 6.9) - 8 * z, 10 * z, 18 * z);
    ctx.fillRect(X(cam, 11.05) - 5 * z, Y(cam, 9.5) - 8 * z, 10 * z, 18 * z);
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.strokeRect(X(cam, 11.05) - 5 * z, Y(cam, 6.9) - 8 * z, 10 * z, 18 * z);
    ctx.strokeRect(X(cam, 11.05) - 5 * z, Y(cam, 9.5) - 8 * z, 10 * z, 18 * z);
    flower(ctx, X(cam, 0.85), Y(cam, 13.55), z * 0.7, '#ff8fab');
    flower(ctx, X(cam, 1.4), Y(cam, 13.35), z * 0.55, '#ffe14a');
    flower(ctx, X(cam, 10.5), Y(cam, 13.5), z * 0.65, '#fff');
    flower(ctx, X(cam, 10.9), Y(cam, 1.2), z * 0.6, '#ff8fab');

    const hx = X(cam, 8.6), hy = Y(cam, 11.15);
    ctx.fillStyle = 'rgba(40,30,60,0.15)';
    ctx.beginPath(); ctx.ellipse(hx, hy + 18 * z, 34 * z, 8 * z, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6e8';
    ctx.fillRect(hx - 26 * z, hy - 8 * z, 52 * z, 36 * z);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(hx - 26 * z, hy - 8 * z, 52 * z, 36 * z);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(hx - 34 * z, hy - 6 * z); ctx.lineTo(hx, hy - 32 * z); ctx.lineTo(hx + 34 * z, hy - 6 * z); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(hx - 8 * z, hy + 4 * z, 16 * z, 24 * z);
    ctx.fillStyle = '#9ad7ff'; ctx.fillRect(hx + 12 * z, hy, 12 * z, 12 * z); ctx.strokeRect(hx + 12 * z, hy, 12 * z, 12 * z);
    if (A.homeGlow > 0) {
      const g = Math.min(1, A.homeGlow);
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.55 * g;
      ctx.fillStyle = '#ffe14a';
      ctx.fillRect(hx + 13 * z, hy + z, 10 * z, 10 * z);
      const glow = ctx.createRadialGradient(hx, hy - 10 * z, 8 * z, hx, hy, 120 * z);
      glow.addColorStop(0, 'rgba(255, 214, 110, ' + (0.7 * g).toFixed(2) + ')');
      glow.addColorStop(1, 'rgba(255, 214, 110, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(hx, hy - 8 * z, 120 * z, 0, 7); ctx.fill();
      ctx.restore();
    }
    const homeSignY = hy - 46 * z;
    ctx.fillStyle = '#c9854a';
    ctx.fillRect(hx - 4 * z, homeSignY + 8 * z, 8 * z, 22 * z);
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.strokeRect(hx - 4 * z, homeSignY + 8 * z, 8 * z, 22 * z);
    sign(ctx, 'البيت', hx, homeSignY, 17 * z);

    if (w.shop) {
      const x = X(cam, w.shop.x), y = Y(cam, w.shop.y);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? accent : '#fff'; ctx.fillRect(x - 32 * z + i * 13 * z, y - 36 * z, 13 * z, 16 * z); }
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x - 32 * z, y - 36 * z, 65 * z, 16 * z);
      ctx.fillStyle = '#c9854a'; ctx.fillRect(x - 28 * z, y - 18 * z, 56 * z, 28 * z); ctx.strokeRect(x - 28 * z, y - 18 * z, 56 * z, 28 * z);
      sign(ctx, 'المتجر', x + 78 * z, y - 22 * z, 15 * z);
    }
    for (let i = 0; i < w.mills.length; i++) {
      const m = w.mills[i], on = (m.mult === 1) || (m.mult === 2 && w.millLv >= 2) || (m.mult === 5 && w.millLv >= 3);
      const x = X(cam, m.x), y = Y(cam, m.y);
      ctx.fillStyle = '#e7c49a'; ctx.fillRect(x - 30 * z, y - 8 * z, 60 * z, 18 * z); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x - 30 * z, y - 8 * z, 60 * z, 18 * z);
      ctx.fillStyle = on ? '#6c8cff' : '#b9b4c9';
      ctx.beginPath(); ctx.arc(x, y - 2 * z, 12 * z, 0, 7); ctx.fill(); ctx.stroke();
      const spin = A.reduced ? 0 : time * (on ? 3 : 0);
      ctx.save(); ctx.translate(x, y - 2 * z); ctx.rotate(spin);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10 * z, 0); ctx.lineTo(10 * z, 0); ctx.moveTo(0, -10 * z); ctx.lineTo(0, 10 * z); ctx.stroke();
      ctx.restore();
      label(ctx, on ? '×' + m.mult : 'مقفل', x, y + 16 * z, 14 * z, '#fff', false);
    }
    w.incs.forEach((inc, i) => {
      const x = X(cam, 2.2 + i * 2.3), y = Y(cam, 8.6);
      const idle = A.reduced ? 0 : Math.sin(time * 2.4 + i) * 4 * z;
      straw(ctx, x, y + 8 * z, z);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.moveTo(x - 24 * z, y - 6 * z); ctx.lineTo(x, y - 28 * z); ctx.lineTo(x + 24 * z, y - 6 * z); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath(); ctx.arc(x, y - 10 * z + idle, 24 * z, 0, 7); ctx.fill();
      ctx.restore();
      if (inc) {
        const left = Math.max(0, (inc.end - w.now) / 1000), total = ER.hatchDur(inc.s, w.hatchLv);
        const u = 1 - Math.min(1, left / Math.max(0.2, total));
        ctx.save();
        ctx.translate(x, y - 4 * z + idle);
        const wob = A.reduced ? u * 0.04 : Math.sin(time * (4 + u * 20)) * u * (0.16 + u * 0.55);
        const squash = 1 + (A.reduced ? 0 : Math.sin(time * (8 + u * 14)) * u * 0.14);
        ctx.rotate(wob);
        ctx.scale(squash, 1 / squash);
        drawEgg(ctx, 0, 0, inc.s, 0, (0.95 + u * 0.4) * z);
        if (u > 0.3) {
          ink(ctx, 2);
          ctx.beginPath(); ctx.moveTo(0, -12 * z); ctx.lineTo(-5 * z, -2 * z); ctx.lineTo(4 * z, 8 * z); ctx.stroke();
          if (u > 0.65) { ctx.beginPath(); ctx.moveTo(-8 * z, -4 * z); ctx.lineTo(-2 * z, 2 * z); ctx.lineTo(-7 * z, 10 * z); ctx.stroke(); }
        }
        ctx.restore();
      } else label(ctx, 'العش', x, y - 18 * z, 14 * z, '#fff', true);
    });
    for (let i = 0; i < w.pens; i++) {
      const pad = w.pads[i];
      const x = X(cam, pad.x), y = Y(cam, pad.y);
      const pulse = 0.9 + (A.reduced ? 0 : Math.sin(time * 3 + i) * 0.1);
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(x, y + 4 * z, 28 * z * pulse, 14 * z * pulse, 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff8e4';
      ctx.beginPath(); ctx.ellipse(x, y + 6 * z, 20 * z, 11 * z, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#e6b14e'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      const pet = A.hopPad === i ? null : w.pets.find(p => p.pad === i);
      if (pet) {
        const phase = A.reduced ? 0 : Math.sin(time * 3.15 + i * 1.7);
        const hop = Math.abs(phase) * 13 * z;
        const stretch = 1 + (A.reduced ? 0 : (Math.abs(phase) - 0.35) * 0.2);
        const giant = pet.v === 1 || pet.v === 3;
        const sc = z * (giant ? 1.55 : 1.34);
        ctx.save();
        ctx.translate(x, y - 8 * z - hop);
        ctx.scale(sc / stretch, sc * stretch);
        animal(ctx, (pet.b * 6 + pet.s) % 42, pet.v === 2 || pet.v === 3);
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(x, y - 2 * z, 7 * z, 0, 7); ctx.fill();
        ctx.strokeStyle = '#c48a12'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (pad.pile >= 1) {
        const n = Math.min(5, Math.floor(pad.pile / 4) + 1);
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 16 * z, y - 6 * z - k * 5 * z, 6 * z, 0, 7); ctx.fill();
          ctx.strokeStyle = '#c48a12'; ctx.lineWidth = 2; ctx.stroke();
        }
        label(ctx, ER.fmt(pad.pile), x, y + 20 * z, 15 * z, '#fff', false);
      }
    }
  }

  function ground(ctx, w, cam, time) {
    const z = cam.z;
    ctx.fillStyle = PAL[0];
    ctx.fillRect(0, 0, 1280, 720);
    const span = 1280 / (TILE * z);
    if (w.mode === '1p') {
      for (let i = 0; i < 7; i++) {
        const x = ER.BASE + i * ER.BW;
        if (x > cam.x + span + 2 || x + ER.BW < cam.x - 2) continue;
        ctx.fillStyle = PAL[i];
        ctx.fillRect(X(cam, x), Y(cam, 0), ER.BW * TILE * z + 2, ER.H * TILE * z);
        if (i === 2) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(X(cam, x), Y(cam, 0), ER.BW * TILE * z, ER.H * TILE * z); }
      }
      for (let i = 0; i < 7; i++) {
        const edge = ER.BASE + i * ER.BW;
        if (edge < cam.x - 2 || edge > cam.x + span + 2) continue;
        ctx.fillStyle = PAL[i];
        for (let k = 0; k < 8; k++) {
          ctx.beginPath(); ctx.arc(X(cam, edge), Y(cam, k * 1.9 + 0.8), 26 * z, 0, 7); ctx.fill();
        }
      }
      const shore = ER.BASE + ER.BW;
      if (shore < cam.x + span + 1 && shore + ER.BW > cam.x - 1) {
        const x0 = shore, x1 = x0 + ER.BW;
        const wave = A.reduced ? 0 : time;
        ctx.fillStyle = '#7ecbff';
        ctx.beginPath();
        ctx.moveTo(X(cam, x0), Y(cam, 15));
        for (let x = x0; x <= x1; x += 0.6) ctx.lineTo(X(cam, x), Y(cam, 12.15 + Math.sin(x * 1.2 + wave) * 0.22));
        ctx.lineTo(X(cam, x1), Y(cam, 15));
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(X(cam, x0), Y(cam, 12.15), ER.BW * TILE * z, 3 * z);
      }
    } else {
      ctx.fillStyle = PAL[1]; ctx.fillRect(X(cam, 22), Y(cam, 0), 16 * TILE * z, ER.H * TILE * z);
      ctx.fillStyle = PAL[2]; ctx.fillRect(X(cam, 36), Y(cam, 0), 20 * TILE * z, ER.H * TILE * z);
      ctx.fillStyle = 'rgba(255,244,180,0.28)';
      ctx.fillRect(X(cam, 0), Y(cam, 0), w.safeL * TILE * z, ER.H * TILE * z);
      ctx.fillRect(X(cam, w.safeR), Y(cam, 0), (w.w - w.safeR) * TILE * z, ER.H * TILE * z);
    }
    road(ctx, cam);
    mottled(ctx, cam);
    scatter(ctx, w, cam);
    lane(ctx, cam);
    landmarks(ctx, cam);
    critters(ctx, cam, time);
  }
  function mottled(ctx, cam) {
    const z = cam.z;
    const x0 = (cam.x | 0) - 1, x1 = (cam.x + 1280 / (TILE * z) | 0) + 1;
    const y0 = Math.max(0, (cam.y | 0) - 1), y1 = Math.min(14, (cam.y + 720 / (TILE * z) | 0) + 1);
    for (let tx = x0; tx <= x1; tx += 2) {
      for (let ty = y0; ty <= y1; ty += 2) {
        const h = rng(tx * 9 + ty * 21 + 4);
        const bio = ER.biomeAt(tx + 0.4);
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = bio === 1 ? '#f8d48a' : bio === 2 ? '#ffffff' : bio === 3 ? '#e7b45a' : bio < 0 || bio === 0 ? (h > 0.5 ? '#9be07a' : '#62b44a') : PAL2[bio] || '#fff';
        ctx.beginPath();
        ctx.ellipse(X(cam, tx + 0.6), Y(cam, ty + 0.5), (22 + h * 18) * z, (12 + h * 8) * z, 0, 0, 7);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function lane(ctx, cam) {
    const z = cam.z, cols = ['#ff5a8a', '#ffe14a', '#fff', '#c9a0ff', '#7ec8ff'];
    const x0 = cam.x - 1, x1 = cam.x + 1280 / (TILE * z) + 1;
    for (let x = (x0 * 2 | 0) / 2; x < x1; x += 2.65) {
      if (x > 1.5 && x < 11.5) continue;
      const cluster = rng((x * 10 | 0) + 3);
      if (cluster < 0.22) continue;
      const y = 8.25 + Math.sin(x * 0.45) * 0.35;
      const side = (x * 2 | 0) % 2 ? 1 : -1;
      const off = 1.55;
      if ((x * 3 | 0) % 3 === 0) tuft(ctx, X(cam, x), Y(cam, y + side * off), z * 0.9, '#2f8a3a');
      else flower(ctx, X(cam, x), Y(cam, y + side * off), z * 0.75, cols[(x * 2 | 0) % 5]);
      if (cluster > 0.72) flower(ctx, X(cam, x + 0.5), Y(cam, y + side * (off + 0.2)), z * 0.6, cols[(x * 5 | 0) % 5]);
    }
  }
  function critters(ctx, cam, time) {
    if (A.reduced) return;
    const z = cam.z;
    const span = 1280 / (TILE * z);
    for (let i = 0; i < 3; i++) {
      const x = cam.x + 1.2 + ((i * 5.1 + time * 0.45) % Math.max(4, span - 2.4));
      const y = cam.y + 0.55 + i * 0.85 + Math.sin(time * 1.2 + i * 2) * 0.2;
      if (y > 6.4 && y < 10.2) continue;
      const px = X(cam, x), py = Y(cam, y);
      const flap = Math.abs(Math.sin(time * 9 + i)) * 3 * z;
      ctx.fillStyle = i === 1 ? '#ffb3d4' : '#fff';
      ctx.beginPath();
      ctx.ellipse(px - 4 * z, py, 5 * z, 2.2 * z + flap * 0.2, -0.6, 0, 7);
      ctx.ellipse(px + 4 * z, py, 5 * z, 2.2 * z + flap * 0.2, 0.6, 0, 7);
      ctx.fill();
    }
  }
  const MARKS = [[16.4, 3.3, 'tree'], [20.8, 12.5, 'tree'], [26.4, 3.1, 'bush'], [27.2, 12.7, 'tree'], [32.6, 12.3, 'bush'], [39.2, 3.5, 'palm'], [44.5, 12.2, 'palm'], [49.6, 3.6, 'palm'], [54.8, 11.8, 'rock'], [60.4, 3.4, 'pine'], [65.5, 12.4, 'pine'], [71.2, 3.8, 'pine'], [76.4, 11.6, 'rock'], [82.2, 3.5, 'cactus'], [88.4, 12.2, 'cactus'], [95, 4, 'rock'], [101, 11.7, 'cactus'], [106, 3.4, 'pop'], [112, 12.3, 'pop'], [118, 3.8, 'pop'], [124, 11.5, 'pop'], [130, 4, 'cloud'], [136, 12, 'cloud'], [144, 3.6, 'cloud'], [154, 4.2, 'crater'], [162, 12.2, 'crater']];
  function landmarks(ctx, cam) {
    const z = cam.z, left = cam.x - 2, right = cam.x + 1280 / (TILE * z) + 2;
    for (const m of MARKS) {
      if (m[0] < left || m[0] > right) continue;
      const px = X(cam, m[0]), py = Y(cam, m[1]);
      if (m[2] === 'tree') { trunk(ctx, px, py, z, 34 * z); ctx.fillStyle = '#3e9a45'; ctx.beginPath(); ctx.arc(px, py - 32 * z, 28 * z, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
      else if (m[2] === 'bush') bush(ctx, px, py, z * 1.35, '#ff8fab');
      else if (m[2] === 'palm') {
        ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 6 * z; ctx.beginPath(); ctx.moveTo(px, py + 10 * z); ctx.quadraticCurveTo(px + 10 * z, py - 10 * z, px + 4 * z, py - 42 * z); ctx.stroke();
        ctx.fillStyle = '#3e9a45';
        ctx.beginPath(); ctx.ellipse(px + 4 * z, py - 44 * z, 26 * z, 8 * z, -0.5, 0, 7); ctx.ellipse(px - 10 * z, py - 36 * z, 18 * z, 6 * z, 0.7, 0, 7); ctx.ellipse(px + 16 * z, py - 34 * z, 16 * z, 6 * z, -0.8, 0, 7); ctx.fill();
      } else if (m[2] === 'pine') {
        ctx.fillStyle = '#2f6b4f'; poly(ctx, [px, py - 48 * z, px + 20 * z, py - 8 * z, px - 20 * z, py - 8 * z], '#2f6b4f'); poly(ctx, [px, py - 64 * z, px + 14 * z, py - 28 * z, px - 14 * z, py - 28 * z], '#3e8a64'); trunk(ctx, px, py, z, 12 * z);
      } else if (m[2] === 'cactus') {
        ctx.fillStyle = '#3e9a45'; ctx.fillRect(px - 6 * z, py - 36 * z, 12 * z, 40 * z); ctx.fillRect(px - 22 * z, py - 24 * z, 16 * z, 8 * z); ctx.fillRect(px + 6 * z, py - 18 * z, 16 * z, 8 * z); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(px - 6 * z, py - 36 * z, 12 * z, 40 * z);
      } else if (m[2] === 'rock') {
        ctx.fillStyle = '#c4b49a'; poly(ctx, [px - 16 * z, py + 6 * z, px - 8 * z, py - 14 * z, px + 10 * z, py - 8 * z, px + 16 * z, py + 8 * z], '#d9c7a4');
      } else if (m[2] === 'pop') {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * z; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 28 * z); ctx.stroke();
        ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(px, py - 36 * z, 12 * z, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      } else if (m[2] === 'cloud') {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(px, py, 28 * z, 14 * z, 0, 0, 7); ctx.ellipse(px - 16 * z, py + 4 * z, 16 * z, 10 * z, 0, 0, 7); ctx.ellipse(px + 18 * z, py + 4 * z, 18 * z, 11 * z, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#d5e8f5'; ctx.stroke();
      } else {
        ctx.fillStyle = '#6a5acd'; ctx.beginPath(); ctx.ellipse(px, py, 22 * z, 12 * z, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(px - 6 * z, py - 2 * z, 5 * z, 0, 7); ctx.fill();
      }
    }
  }

  function drawEgg(ctx, x, y, species, bob, sc) {
    const col = RCOL[species] || '#fff';
    const s = sc || 1;
    ctx.save();
    ctx.translate(x, y + Math.sin(bob || 0) * 3 * s);
    ctx.scale(s, s);
    ctx.fillStyle = '#fffdf6'; ink(ctx, 3);
    eggPath(ctx, 0, 0, 12, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-2, 2, 4.2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-3, -5, 4, 3.5, 5.4); ctx.stroke();
    ctx.restore();
  }

  function guard(ctx, g, t) {
    ctx.save();
    const chase = g.state === 'chase', stir = g.state === 'stir', sleep = g.state === 'sleep';
    ctx.translate(0, g.air ? -16 : 0);
    ctx.scale(1.22, 1.22);
    if (sleep) ctx.translate(0, 7);
    if (chase) ctx.translate(0, -Math.abs(Math.sin(t * 14)) * 4);
    if (stir) {
      const hop = Math.abs(Math.sin(t * 14)) * 6;
      const sq = 1 + Math.sin(t * 14) * 0.1;
      ctx.translate(0, -hop);
      ctx.scale((1 / sq) * 1.12, sq * 1.12);
    }
    const wide = 0.9 + Math.sin(t * 16) * 0.1;
    ink(ctx, 4);
    const k = g.kind;
    if (k === 'hen') {
      blob(ctx, 0, 4, 18, 14, '#fff');
      poly(ctx, [-5, -10, 0, -22, 6, -10], '#ff5a3c');
      poly(ctx, [10, 0, 22, 4, 10, 8], '#ffb703');
      wing(ctx, -12, 4, '#f4efe4');
    } else if (k === 'crab') {
      blob(ctx, 0, 4, 16, 12, '#ff6b4a');
      ink(ctx, 4); ctx.beginPath(); ctx.arc(-18, 0, 6, 0, 7); ctx.arc(18, 0, 6, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(-12, 18); ctx.moveTo(0, 14); ctx.lineTo(0, 20); ctx.moveTo(8, 12); ctx.lineTo(12, 18); ctx.stroke();
    } else if (k === 'penguin') {
      blob(ctx, 0, 2, 14, 18, '#2a2348'); blob(ctx, 0, 6, 8, 12, '#fff');
      poly(ctx, [0, 2, 10, 7, 0, 10], '#ffb703');
    } else if (k === 'camel') {
      blob(ctx, 0, 8, 22, 11, '#e6b15a'); blob(ctx, -6, -2, 8, 7, '#e6b15a'); blob(ctx, 8, -6, 10, 8, '#e6b15a');
    } else if (k === 'salamander') {
      blob(ctx, 2, 4, 22, 9, '#ff8fab'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-8, 2, 3, 0, 7); ctx.arc(2, 4, 2.4, 0, 7); ctx.arc(8, 1, 2, 0, 7); ctx.fill();
    } else if (k === 'owl') {
      ctx.save(); ctx.rotate(g.spin && g.state === 'watch' ? (g.ang + Math.PI) * 0.15 : 0);
      blob(ctx, 0, 2, 16, 16, '#d7c4a8'); blob(ctx, -6, 0, 6, 6, '#fff'); blob(ctx, 6, 0, 6, 6, '#fff');
      const o = sleep ? 0 : stir ? wide : 1;
      eye(ctx, -6, 0, o, 0); eye(ctx, 6, 0, o, 0);
      poly(ctx, [-2, 6, 0, 10, 2, 6], '#ffb703');
      ctx.restore();
    } else {
      ctx.fillStyle = '#e4e2f4'; ctx.beginPath(); ctx.arc(0, 2, 16, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8d89c9'; ctx.fillRect(-6, -22, 4, 10); ctx.fillRect(2, -22, 4, 10);
      ctx.fillStyle = '#ff5a6a'; ctx.beginPath(); ctx.arc(-4, -22, 3, 0, 7); ctx.arc(4, -22, 3, 0, 7); ctx.fill();
      ctx.fillStyle = sleep ? '#9aa' : '#7ec8ff'; ctx.fillRect(-8, -2, 16, 6); ctx.strokeRect(-8, -2, 16, 6);
    }
    if (k !== 'owl') {
      const o = sleep ? 0 : stir ? wide : 1;
      eye(ctx, -6, -2, o, chase ? g.facing * 2 : 1);
      eye(ctx, 6, -2, o, chase ? g.facing * 2 : 1);
      if (stir) {
        ctx.fillStyle = 'rgba(255,120,140,0.6)';
        ctx.beginPath(); ctx.arc(-11, 4, 3.4, 0, 7); ctx.arc(11, 4, 3.4, 0, 7); ctx.fill();
      }
      if (chase) {
        ink(ctx, 3); ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-3, -6); ctx.moveTo(12, -10); ctx.lineTo(3, -6); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawParts(ctx, cam) {
    const z = cam.z;
    for (const p of parts) {
      if (p.kind === 'fly') continue;
      const a = Math.max(0, p.life / (p.max || 0.7));
      ctx.globalAlpha = a;
      const px = X(cam, p.x), py = Y(cam, p.y);
      if (p.kind === 'bit') {
        ctx.save(); ctx.translate(px, py); ctx.rotate(p.rot || 0); ctx.fillStyle = p.color; ctx.fillRect(-6 * z, -3.5 * z, 12 * z, 7 * z); ctx.restore();
      } else if (p.kind === 'coin') {
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(px, py, 8 * z, 0, 7); ctx.fill();
        ctx.strokeStyle = '#c48a12'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff6c2'; ctx.fillRect(px - 1.2 * z, py - 4 * z, 2.4 * z, 8 * z);
      } else if (p.kind === 'half') {
        ctx.save(); ctx.translate(px, py); ctx.rotate(p.rot || 0); ctx.scale(z, z);
        ctx.fillStyle = '#fffdf6'; ink(ctx, 3);
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.bezierCurveTo(p.side * 13, -16, p.side * 11, 8, 0, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.side * 4, 0, 4, 0, 7); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, py, Math.max(4, p.size * TILE * z), 0, 7); ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        const r = Math.max(5, (p.size || 0.14) * TILE * z);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2 - Math.PI / 2;
          const rr = i % 2 ? r * 0.38 : r;
          if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(px, py, Math.max(2, p.size * TILE * z), 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawReveal(ctx, cam) {
    if (!reveal) return;
    const u = 1 - reveal.life / reveal.max;
    const pop = u < 0.2 ? Math.sin(u / 0.2 * Math.PI / 2) : 1;
    let x = X(cam, reveal.x);
    let y = Y(cam, reveal.y) - 36;
    x = Math.max(200, Math.min(1080, x));
    y = Math.max(190, Math.min(520, y));
    if (x < 460 || x > 820) x = x * 0.34 + 640 * 0.66;
    if (y < 240 || y > 480) y = y * 0.5 + 360 * 0.5;
    const fade = reveal.life < 0.28 ? reveal.life / 0.28 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#fff8e8';
    ctx.beginPath(); ctx.arc(0, 8, 92 * Math.max(0.2, pop), 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 6;
    ctx.stroke();
    if (!A.reduced && u > 0.12 && u < 0.85) {
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + sceneTime * 1.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 108, Math.sin(a) * 78, 5, 0, 7);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(42,35,72,0.16)';
    ctx.beginPath(); ctx.ellipse(0, 40, 30 * pop, 9 * pop, 0, 0, 7); ctx.fill();
    const air = A.reduced ? 0 : Math.sin(sceneTime * 8);
    const hop = Math.abs(air) * 18 * pop;
    const tall = 1 + (A.reduced ? 0 : (Math.abs(air) - 0.35) * 0.16);
    ctx.save();
    ctx.translate(0, 8 - hop);
    ctx.scale(2.15 * pop / Math.max(0.7, Math.sqrt(tall)), 2.15 * pop * Math.sqrt(Math.max(0.7, tall)));
    wink = A.reduced ? 1 : (sceneTime % 2.4 < 0.12 ? 0.06 : 1);
    animal(ctx, (reveal.b * 6 + reveal.s) % 42, reveal.v === 2 || reveal.v === 3);
    wink = 1;
    ctx.restore();
    if (reveal.name) {
      const np = u < 0.22 ? Math.sin((u / 0.22) * Math.PI / 2) : 1;
      ctx.save();
      ctx.translate(0, 124);
      ctx.scale(Math.max(0.2, np), Math.max(0.2, np));
      ctx.font = '700 34px Fredoka';
      ctx.direction = 'rtl';
      const tw = ctx.measureText(reveal.name).width;
      const bw = Math.min(560, tw + 36), bh = 52;
      ctx.fillStyle = '#fff8e8';
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 18); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
      label(ctx, reveal.name, 0, 2, 32, '#ff8a3d', true);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTitleDemo(ctx) {
    if (!A.titleDemo) return;
    const t = A.reduced ? 1.2 : (sceneTime % 5);
    ctx.save();
    ctx.fillStyle = 'rgba(255,248,232,0.94)';
    ctx.beginPath(); ctx.roundRect(80, 548, 1120, 154, 24); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#8fd46a';
    ctx.fillRect(108, 640, 1064, 46);
    ctx.fillStyle = '#e7c49a';
    ctx.fillRect(200, 654, 860, 12);
    const hx = 250, hy = 636;
    ctx.fillStyle = '#fff6e8'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.fillRect(hx - 30, hy - 18, 60, 36); ctx.strokeRect(hx - 30, hy - 18, 60, 36);
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.moveTo(hx - 38, hy - 16); ctx.lineTo(hx, hy - 48); ctx.lineTo(hx + 38, hy - 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    const nx = 980, ny = 652;
    ctx.fillStyle = '#e6b14e';
    ctx.beginPath(); ctx.ellipse(nx, ny, 30, 12, 0, 0, 7); ctx.fill();
    ctx.stroke();
    let kx = 360, eggOn = false, showPet = false;
    if (t < 1.7) kx = 340 + (t / 1.7) * 580;
    else if (t < 2.05) { kx = 920; eggOn = true; }
    else if (t < 3.7) { kx = 920 - ((t - 2.05) / 1.65) * 580; eggOn = true; }
    else { kx = 340; showPet = true; }
    if (!showPet) drawEgg(ctx, eggOn ? kx : nx, eggOn ? 592 : ny - 20, 2, sceneTime * 4, eggOn ? 1.05 : 1.15);
    else {
      const u = Math.min(1, (t - 3.7) / 0.28);
      ctx.save();
      ctx.translate(nx, ny - 36);
      ctx.scale(1.45 * (0.35 + 0.65 * u), 1.45 * (0.35 + 0.65 * u));
      animal(ctx, 2, false);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(kx, 624);
    ctx.scale(t >= 2.05 && t < 3.7 ? -1.25 : 1.25, 1.25);
    drawKid(ctx, '#3d7dff', A.reduced ? 0 : Math.sin(sceneTime * 12) * 0.7);
    ctx.restore();
    ctx.restore();
  }

  function drawFly(ctx, cam) {
    for (const p of parts) {
      if (p.kind !== 'fly') continue;
      const dest = p.to ? (A.hudCoin2 || A.hudCoin) : A.hudCoin;
      if (!dest) continue;
      const u = 1 - p.life / (p.max || 0.7);
      const e = u * u * (3 - 2 * u);
      const sx = X(cam, p.x), sy = Y(cam, p.y);
      const x = sx + (dest.x - sx) * e;
      const y = sy + (dest.y - sy) * e - Math.sin(Math.PI * u) * 64;
      const r = 10 * (1 - e * 0.28);
      ctx.globalAlpha = u > 0.9 ? (1 - u) / 0.1 : 1;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2a2348'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#fff6c2';
      ctx.fillRect(x - 1.4, y - r * 0.48, 2.8, r * 0.96);
    }
    ctx.globalAlpha = 1;
  }

  function drawHat(ctx, id) {
    if (!id) return;
    ink(ctx, 3);
    if (id === 1) {
      ctx.fillStyle = '#ff5a6a';
      ctx.beginPath(); ctx.ellipse(0, -27, 14, 5.5, 0, Math.PI, 0, true); ctx.fill(); ctx.stroke();
      ctx.fillRect(0, -28, 16, 4); ctx.strokeRect(0, -28, 16, 4);
    } else if (id === 2) {
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.ellipse(0, -30, 18, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.ellipse(0, -34, 8, 5, 0, Math.PI, 0, true); ctx.fill(); ctx.stroke();
    } else if (id === 3) {
      ctx.fillStyle = '#7ec8ff';
      ctx.beginPath(); ctx.ellipse(0, -28, 14, 8, 0, Math.PI, 0, true); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-12, -30, 24, 5); ctx.strokeRect(-12, -30, 24, 5);
    } else if (id === 4) {
      ctx.fillStyle = '#ff5a8a';
      ctx.beginPath(); ctx.arc(0, -30, 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(-7, -24, 4, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(7, -24, 4, 0, 7); ctx.fill(); ctx.stroke();
    } else if (id === 5) {
      ctx.fillStyle = '#ff8ad8';
      ctx.beginPath(); ctx.ellipse(-8, -28, 7, 5, -0.6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(8, -28, 7, 5, 0.6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, -28, 3.5, 0, 7); ctx.fill(); ctx.stroke();
    } else {
      poly(ctx, [0, -42, 4, -32, 14, -32, 6, -24, 9, -14, 0, -20, -9, -14, -6, -24, -14, -32, -4, -32], '#ffd23f');
    }
  }
  function drawKid(ctx, shirt, swing, hat) {
    function limb(x0, y0, x1, y1, col) {
      ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
    }
    limb(-2, 0, -8 - swing * 9, 10, '#ffd7b5');
    limb(-5, 10, -7 - swing * 11, 24, '#ffd7b5');
    limb(5, 10, 7 + swing * 11, 24, '#ffd7b5');
    ctx.fillStyle = '#ff5a6a'; ink(ctx, 3);
    ctx.beginPath(); ctx.ellipse(-7 - swing * 11, 25, 6.5, 3.4, swing * 0.2, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(7 + swing * 11, 25, 6.5, 3.4, -swing * 0.2, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shirt; ink(ctx, 4);
    ctx.beginPath(); ctx.ellipse(0, 2, 14, 13, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#243056'; ctx.beginPath(); ctx.ellipse(0, 11, 12, 6, 0, 0, 7); ctx.fill();
    limb(2, 0, 10 + swing * 9, 11, '#ffd7b5');
    ctx.fillStyle = '#ffd7b5'; ink(ctx, 4);
    ctx.beginPath(); ctx.arc(0, -16, 13, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a3a22';
    ctx.beginPath(); ctx.arc(0, -18, 13, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-2, -28 - swing, 5, 6, -0.2, 0, 7); ctx.fill(); ctx.stroke();
    eye(ctx, -5, -16, 1, 1.4); eye(ctx, 5, -16, 1, 1.4);
    ctx.fillStyle = 'rgba(255,110,130,0.5)';
    ctx.beginPath(); ctx.arc(-8, -12, 2.6, 0, 7); ctx.arc(8, -12, 2.6, 0, 7); ctx.fill();
    ink(ctx, 2); ctx.beginPath(); ctx.arc(0, -12, 5, 0.25, Math.PI - 0.25); ctx.stroke();
    drawHat(ctx, hat || 0);
  }

  A.draw = function (ctx, w, cam, time, zoom) {
    sceneTime = time || 0;
    ctx.save();
    ctx.clearRect(0, 0, 1280, 720);
    ground(ctx, w, cam, time);
    if (zoom > 1) {
      const p = w.players[0];
      const sx = X(cam, p.x), sy = Y(cam, p.y);
      ctx.translate(sx, sy); ctx.scale(zoom, zoom); ctx.translate(-sx, -sy);
    }
    const z = cam.z;
    if (w.mode === '1p') {
      home(ctx, w, cam, time);
      for (let i = 1; i < 7; i++) {
        const gx = ER.BASE + i * ER.BW;
        if (gx < cam.x - 2 || gx > cam.x + 1280 / (TILE * z) + 2) continue;
        const open = ER.speedOf(w.speedXP) + 1e-6 >= ER.GATES[i];
        const x = X(cam, gx), top = Y(cam, 4.6), bot = Y(cam, 12.4);
        ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 8 * z; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 16 * z, bot); ctx.lineTo(x - 16 * z, top);
        ctx.moveTo(x + 16 * z, bot); ctx.lineTo(x + 16 * z, top);
        ctx.moveTo(x - 16 * z, top); ctx.quadraticCurveTo(x, top - 26 * z, x + 16 * z, top);
        ctx.stroke();
        if (!open) {
          ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 8 * z;
          ctx.beginPath(); ctx.moveTo(x - 16 * z, Y(cam, 8.1)); ctx.lineTo(x + 16 * z, Y(cam, 8.1)); ctx.stroke();
        } else if (A.party && A.party.biome === i && A.party.life > 0 && !A.reduced) {
          const cols = ['#ff5a8a', '#ffd23f', '#7ec8ff', '#fff'];
          for (let k = 0; k < 4; k++) {
            const fy = top + 20 * z + k * 28 * z;
            const wave = Math.sin(sceneTime * 6 + k) * 6 * z;
            ctx.fillStyle = cols[k];
            ctx.beginPath();
            ctx.moveTo(x - 14 * z, fy);
            ctx.lineTo(x + 18 * z + wave, fy + 8 * z);
            ctx.lineTo(x - 14 * z, fy + 16 * z);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
          }
        }
        ctx.fillStyle = '#fff8e8'; ink(ctx, 3);
        const bw = 108 * z, bh = 32 * z, by = top - 8 * z;
        ctx.fillRect(x - bw / 2, by - bh, bw, bh); ctx.strokeRect(x - bw / 2, by - bh, bw, bh);
        label(ctx, open ? ER.BIOMES[i].name : 'تحتاج سرعة ' + ER.GATES[i], x, by - bh / 2, 15 * z, open ? '#2a7a38' : '#8a3b12', true);
      }
    }
    for (const pud of w.puddles) {
      ctx.fillStyle = 'rgba(255,70,40,0.5)';
      ctx.beginPath(); ctx.ellipse(X(cam, pud.x), Y(cam, pud.y), 18 * z, 10 * z, 0, 0, 7); ctx.fill();
    }
    for (const g of w.guards) {
      if (g.state === 'watch' || g.state === 'chase' || g.state === 'stir') {
        ctx.save();
        ctx.translate(X(cam, g.x), Y(cam, g.y));
        ctx.rotate(g.ang);
        const watch = g.state === 'watch', chase = g.state === 'chase';
        ctx.fillStyle = chase ? 'rgba(255,40,60,0.28)' : watch ? 'rgba(255,60,80,0.32)' : 'rgba(255,190,40,0.16)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, g.cone * TILE * z, -g.sweep / 2, g.sweep / 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = chase ? 'rgba(255,80,90,0.95)' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
      }
      if (g.state === 'stir' || g.state === 'chase' || g.state === 'watch') {
        const pulse = (g.state === 'chase' ? 30 : 24) + Math.sin(time * (g.state === 'chase' ? 14 : 8)) * 4;
        ctx.strokeStyle = g.state === 'chase' ? '#ff2d4a' : g.state === 'watch' ? '#ff5a6a' : '#ffcf33';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(X(cam, g.x), Y(cam, g.y), pulse * z, 0, 7); ctx.stroke();
      }
    }
    for (const n of w.nests) {
      if (!n.egg) continue;
      const x = X(cam, n.x), y = Y(cam, n.y);
      const bob = A.reduced ? 0 : Math.sin(time * 2.5 + n.id) * 5 * z;
      const ey = y - 8 * z + bob;
      straw(ctx, x, y + 8 * z, z * 0.85);
      const glow = 0.9 + Math.sin(time * 3.2 + n.id) * 0.1;
      ctx.globalAlpha = 0.38; ctx.fillStyle = RCOL[n.species] || '#fff';
      ctx.beginPath(); ctx.arc(x, ey, 26 * z * glow, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      drawEgg(ctx, x, ey, n.species, time * 3 + n.id, (n.daily ? 1.2 : 1.05) * z);
      if (n.daily) label(ctx, 'اليوم', x, y - 40 * z, 15 * z, '#ffd23f', true);
      label(ctx, ER.petRate(n.biome, n.species, 0) + '/ث', x, y + 22 * z, 14 * z, '#fff', false);
    }
    for (const f of w.flights) drawEgg(ctx, X(cam, f.x), Y(cam, f.y), f.species, time * 4, z);
    for (const it of w.items) {
      ctx.save(); ctx.translate(X(cam, it.x), Y(cam, it.y)); ctx.scale(z, z);
      if (it.kind === 'peel') { ctx.fillStyle = '#ffe14a'; ink(ctx, 3); ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0.5, 0, 7); ctx.fill(); ctx.stroke(); }
      else { drawEgg(ctx, 0, 0, 0, 0, 0.75); }
      ctx.restore();
    }
    for (const g of w.guards) {
      const gx = X(cam, g.x), gy = Y(cam, g.y);
      if (g.state === 'chase') {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3 * z;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(gx - g.facing * (18 + i * 8) * z, gy + (-8 + i * 7) * z);
          ctx.lineTo(gx - g.facing * (32 + i * 10) * z, gy + (-8 + i * 7) * z);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(40,30,60,0.2)';
      ctx.beginPath(); ctx.ellipse(gx, gy + 16 * z, 16 * z, 5 * z, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(gx, gy); ctx.scale((g.facing || 1) * z, z);
      if (g.state === 'slip') ctx.rotate(0.8);
      guard(ctx, g, time);
      ctx.restore();
      if (g.state === 'sleep') {
        const bob = Math.sin(time * 3 + g.x) * 4;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(gx + 8 * z, gy - 36 * z + bob, 16 * z, 0, 7); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        label(ctx, 'Z', gx + 2 * z, gy - 28 * z + bob, 14 * z, '#9ecbff', false);
        label(ctx, 'z', gx + 16 * z, gy - 46 * z + bob, 20 * z, '#d7e8ff', false);
      } else if (g.state === 'stir' || g.state === 'chase') {
        const alert = g.state === 'stir';
        const bounce = Math.abs(Math.sin(time * (alert ? 8 : 11))) * (alert ? 10 : 6) * z;
        const size = (alert ? 30 : 32) * z * (1 + Math.sin(time * (alert ? 12 : 14)) * 0.12);
        badge(ctx, gx, gy - (alert ? 50 : 52) * z - bounce, '!', alert ? '#ffcf33' : '#ff2d4a', size);
      }
    }
    if (w.fox) {
      const x = X(cam, w.fox.x), y = Y(cam, w.fox.y);
      ctx.save(); ctx.translate(x, y); ctx.scale(z, z);
      blob(ctx, 0, 0, 16, 9, '#ff8a3d'); poly(ctx, [6, -4, 14, -16, 2, -2], '#ff8a3d'); poly(ctx, [-4, -4, -12, -16, 0, -2], '#ff8a3d');
      eye(ctx, -4, -1, 1, 1); eye(ctx, 4, -1, 1, 1);
      ctx.restore();
      label(ctx, 'ثعلب!', x, y - 28 * z, 16 * z, '#fff', true);
    }
    if (w.stolen) {
      const d = ER.denPos(w);
      ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.ellipse(X(cam, d.x), Y(cam, d.y), 18 * z, 12 * z, 0, 0, 7); ctx.fill();
      label(ctx, 'وكر', X(cam, d.x), Y(cam, d.y) - 18 * z, 16 * z, '#fff', true);
    }
    const carrier = w.mode === '1p' ? w.players[0] : null;
    if (carrier && carrier.egg && carrier.x > ER.SAFE) {
      const tx = 9.2, ty = 9.4;
      const dx = tx - carrier.x, dy = ty - carrier.y, dist = Math.hypot(dx, dy) || 1;
      if (dist > 1.3) {
        const reach = Math.min(dist - 0.3, 5.2);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,248,232,0.92)';
        ctx.lineWidth = 6 * z;
        ctx.setLineDash([12 * z, 14 * z]);
        ctx.lineDashOffset = A.reduced ? 0 : -sceneTime * 48;
        ctx.beginPath();
        ctx.moveTo(X(cam, carrier.x), Y(cam, carrier.y));
        ctx.lineTo(X(cam, carrier.x + dx / dist * reach), Y(cam, carrier.y + dy / dist * reach));
        ctx.stroke();
        ctx.setLineDash([]);
        for (let k = 1; k <= 4; k++) {
          const d = k * 1.2;
          if (d > reach) break;
          const bob = A.reduced ? 0 : Math.sin(sceneTime * 5 - k) * 3;
          ctx.globalAlpha = 0.9 - k * 0.12;
          ctx.fillStyle = '#fffdf6';
          ctx.beginPath();
          ctx.arc(X(cam, carrier.x + dx / dist * d), Y(cam, carrier.y + dy / dist * d) + bob, (8 - k) * z, 0, 7);
          ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.restore();
      }
    }
    w.players.forEach((p, i) => {
      const moving = Math.hypot(p.vx, p.vy) > 0.4;
      const cheering = i === 0 && A.grabPop > 0 && !A.reduced;
      const gu = cheering ? 1 - A.grabPop / 0.42 : 0;
      const swing = cheering ? 1.15 : moving ? Math.sin(p.step * 1.15) : Math.sin(time * 2 + i) * 0.08;
      const hop = (w.mode === '1p' && ER.biomeAt(p.x) === 6) ? Math.abs(Math.sin(time * 8)) * 10 : (moving ? Math.abs(Math.sin(p.step * 1.15)) * 4 : 0);
      const lift = cheering ? Math.sin(gu * Math.PI) * 12 : 0;
      const squash = (moving && !A.reduced ? 1 + Math.sin(p.step * 2.3) * 0.07 : 1) * (cheering ? 1 + Math.sin(gu * Math.PI) * 0.16 : 1);
      const x = X(cam, p.x), y = Y(cam, p.y) - hop * z - lift;
      ctx.save();
      ctx.globalAlpha = p.immune > 0 ? 0.55 + 0.45 * Math.sin(time * 24) : 1;
      ctx.translate(x, y); ctx.scale(z * 1.18, z * 1.18);
      ctx.fillStyle = 'rgba(40,30,60,0.14)';
      ctx.beginPath(); ctx.ellipse(0, 20, 18, 6.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(42,35,72,0.38)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 20, 18, 6.5, 0, 0, 7); ctx.stroke();
      ctx.scale(p.facing || 1, 1);
      ctx.scale(1 / squash, squash);
      const shirt = i === 1 ? '#ff8a2a' : (A.look && A.look.shirt) || '#3d7dff';
      const hat = i === 0 && !(w.rebirths > 0) ? ((A.look && A.look.hat) || 0) : 0;
      drawKid(ctx, shirt, swing, hat);
      if (w.rebirths > 0 && i === 0) { ctx.fillStyle = '#ffd23f'; ink(ctx, 3); poly(ctx, [-8, -30, 0, -40, 8, -30], '#ffd23f'); }
      if (p.bubble) { ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 28, 0, 7); ctx.stroke(); }
      ctx.restore();
      if (p.egg) {
        const popping = i === 0 && A.grabPop > 0;
        const u = popping ? 1 - A.grabPop / 0.42 : 1;
        const eggSc = popping ? 1 + Math.sin(u * Math.PI) * 0.35 - (1 - u) * 0.4 : 1;
        const gy = y - 48 * z - (popping ? Math.sin(u * Math.PI) * 18 : 0);
        const pulse = 1 + Math.sin(time * 6) * 0.08;
        const col = RCOL[p.egg.species] || '#fff6d8';
        ctx.save();
        ctx.globalAlpha = 0.32; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, gy, 28 * z * pulse * eggSc, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.arc(x, gy, 46 * z * pulse, 0, 7); ctx.fill();
        ctx.restore();
        drawEgg(ctx, x, gy, p.egg.species, time * 6, 1.05 * z * eggSc);
      }
      if (w.mode === '2p') label(ctx, i === 0 ? '1' : '2', x, y - 58 * z, 16 * z, '#fff', false);
    });
    if (hop) {
      const u = 1 - hop.life / hop.max;
      const hx = hop.x0 + (hop.x1 - hop.x0) * u;
      const hy = hop.y0 + (hop.y1 - hop.y0) * u - Math.sin(Math.PI * u) * 1.55;
      const sc = z * ((hop.v === 1 || hop.v === 3) ? 1.5 : 1.32);
      ctx.save();
      ctx.translate(X(cam, hx), Y(cam, hy));
      ctx.scale(sc, sc * (1 + Math.sin(Math.PI * u) * 0.12));
      animal(ctx, (hop.b * 6 + hop.s) % 42, hop.v === 2 || hop.v === 3);
      ctx.restore();
    }
    drawParts(ctx, cam);
    ctx.globalAlpha = 1;
    const near = w.players[0];
    if (near) {
      let best = null, bd = 2.4;
      for (const n of w.nests) if (n.egg) {
        const d = Math.hypot(n.x - near.x, n.y - near.y);
        if (d < bd) { bd = d; best = n; }
      }
      if (best) label(ctx, 'عملاق 1/8 · ذهبي 1/30', X(cam, best.x), Y(cam, best.y) + 40 * z, 14 * z, '#fff', true);
    }
    ctx.restore();
    drawFloats(ctx, cam);
    drawFly(ctx, cam);
    drawReveal(ctx, cam);
    drawTitleDemo(ctx);
  };
})(globalThis.EggRush = globalThis.EggRush || {});

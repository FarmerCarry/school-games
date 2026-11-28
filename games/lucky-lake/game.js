/* Lucky Lake: 5 scenic biomes, 33 species, 4 junk, 1-click/Enter/Space launch, dual controls, S++ juice/hitstop & debounced saves. */
(() => {
  'use strict';
  const LL = window.LL, J = Kit.juice, O = Object.assign, W = 1280, H = 720, M = Math, PI = M.PI, TAU = PI * 2, sin = M.sin, cos = M.cos, min = M.min, max = M.max, INK = '#1c2250', P1 = '#ff9a1f', P2 = '#e05cff', SS = 2;
  const $ = id => document.getElementById(id), tx = (id, v) => { $(id).textContent = String(v); }, hid = (id, v) => { $(id).hidden = !!v; };
  const cl = (el, k, v) => (typeof el === 'string' ? $(el) : el).classList.toggle(k, v), gc = c => c.getContext('2d'), qs = (el, s) => el.querySelector(s), calm = () => Kit.motion.reduced();
  let cache = {}, bgs = {};
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = max(1, M.ceil(w)); c.height = max(1, M.ceil(h)); return c; };
  const di = (g, i, x, y, w, h) => w != null ? g.drawImage(i, x, y, w, h) : g.drawImage(i, x, y);
  const fr = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); }, sv = (g, fn) => { g.save(); fn(); g.restore(); };
  const T = (g, x, y, s, fn) => sv(g, () => { g.translate(x, y); if (s !== 1) g.scale(s, s); fn(); });
  const sk = (g, lw = 4, c = INK) => { g.lineWidth = lw; g.strokeStyle = c; g.lineJoin = g.lineCap = 'round'; g.stroke(); };
  const fs = (g, c, lw, sc) => { if (c) { g.fillStyle = c; g.fill(); } if (lw) sk(g, lw, sc); };
  const C = (g, x, y, r, c, lw, sc, a = 0, b = TAU) => { g.beginPath(); g.arc(x, y, r, a, b); fs(g, c, lw, sc); };
  const E = (g, x, y, rx, ry, c, lw, sc) => { g.beginPath(); g.ellipse(x, y, max(.1, rx), max(.1, ry), 0, 0, TAU); fs(g, c, lw, sc); };
  const R = (g, x, y, w, h, r, c, lw, sc) => { r = min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); fs(g, c, lw, sc); };
  const P = (g, a, c, lw, sc, op) => { g.beginPath(); for (let i = 0; i < a.length; i += 2) g[i ? 'lineTo' : 'moveTo'](a[i], a[i + 1]); if (!op) g.closePath(); fs(g, c, lw, sc); };
  const Q = (g, a, c, lw, sc, op) => { g.beginPath(); g.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 4) g.quadraticCurveTo(a[i], a[i + 1], a[i + 2], a[i + 3]); if (!op) g.closePath(); fs(g, c, lw, sc); };
  const stp = (g, x, y, r1, r2, c, lw, rot = 0) => { const a = []; for (let i = 0; i < 10; i++) { const t = rot - PI / 2 + i * PI / 5, d = i & 1 ? r2 : r1; a.push(x + cos(t) * d, y + sin(t) * d); } P(g, a, c, lw); };
  const al = (h, a) => { h = h.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const vg = (g, s, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); s.forEach((c, i) => gr.addColorStop(i / (s.length - 1), c)); return gr; };
  const rng = n => () => ((n = (n * 16807) % 2147483647) - 1) / 2147483646;
  const sp = (k, w, h, fn) => cache[k] || (cache[k] = (() => { const c = cv(w * SS, h * SS), g = gc(c); g.scale(SS, SS); fn(g); return c; })());
  const eye = (g, x, y, r, lk = 1) => { C(g, x, y, r, '#fff', max(1.6, r * .28)); C(g, x + r * .22 * lk, y + r * .08, r * .55, INK); };
  const ct = (g, s, x, y, sz, col = '#fff', lw, a = 'center') => { g.font = `700 ${sz}px Fredoka`; g.textAlign = a; g.textBaseline = 'middle'; g.direction = /[\u0600-\u06FF]/.test(s) ? 'rtl' : 'ltr'; if (lw !== 0) { g.lineJoin = 'round'; g.lineWidth = lw || max(4, sz * .2); g.strokeStyle = INK; g.strokeText(s, x, y); } g.fillStyle = col; g.fillText(s, x, y); g.direction = 'ltr'; };

  const HR = { fish: .44, long: .27, round: .66, flat: .6, whisker: .36, sail: .38, eel: .2, puffer: .78, angler: .7 }, SPEC = { crab: 1, turtle: 1, jelly: 1, star: 1, puffer: 1, angler: 1 };
  const bpath = (g, L, h) => { g.beginPath(); g.moveTo(-.42 * L, -h * .34); g.quadraticCurveTo(-.26 * L, -h, .02 * L, -h); g.bezierCurveTo(.32 * L, -h, .5 * L, -h * .55, .5 * L, 0); g.bezierCurveTo(.5 * L, h * .6, .28 * L, h, 0, h); g.quadraticCurveTo(-.26 * L, h * .96, -.42 * L, h * .34); g.closePath(); };
  function drawBody(g, s, L) {
    const k = s.kind, h = L * HR[k] / 2, c = s.c, lw = max(2.4, L * .04), r = rng(s.i * 31 + 7), p = s.pat;
    Q(g, k === 'sail' ? [-.3 * L, -h * .7, -.25 * L, -h * 3, .1 * L, -h * 2.2, .2 * L, -h * 1.2, .18 * L, -h * .8] : [-.2 * L, -h * .85, -.12 * L, -h * 1.6, .12 * L, -h * .9], c[2], lw);
    Q(g, [-.24 * L, h * .8, -.2 * L, h * 1.4, -.04 * L, h * .9], c[2], lw);
    bpath(g, L, h); fs(g, c[0]);
    sv(g, () => {
      bpath(g, L, h); g.clip(); E(g, .05 * L, h * .95, L * .52, h * .75, c[1]);
      if (p === 'stripes') for (let i = 0; i < 3; i++) E(g, (-.18 + i * .17) * L, 0, L * .045, h * 1.1, al(c[2], .45));
      else if (p === 'spots') for (let i = 0; i < 6; i++) C(g, (-.3 + r() * .58) * L, (-.65 + r() * .8) * h, L * .032, s.id === 'char' ? '#fff0dc' : al(c[2], .75));
      else if (p === 'band' || p === 'trout') Q(g, [-.45 * L, -h * .05, .1 * L, -h * .32, .44 * L, -h * .08, .1 * L, h * .15, -.45 * L, h * .15], p === 'trout' ? 'rgba(255,110,150,.65)' : al(c[2], .8));
      else if (p === 'scales') for (let i = 0; i < 5; i++) C(g, (-.26 + i * .13) * L, (i & 1 ? .25 : -.25) * h, L * .05, 0, 2, 'rgba(255,255,255,.55)', -1.2, 1.2);
      else if (p === 'koi') { E(g, .16 * L, -h * .45, L * .15, h * .5, '#ff6a3d'); E(g, -.18 * L, -h * .2, L * .12, h * .45, '#ff6a3d'); }
      else if (p === 'clown') for (let i = 0; i < 3; i++) E(g, (.2 - i * .26) * L, 0, L * .055, h * 1.05, '#fff', 2.5);
      else if (p === 'plates' || p === 'gems') for (let i = 0; i < 5; i++) { const x = (-.28 + i * .14) * L; P(g, [x, -h * .8, x + L * .05, -h * .55, x, -h * .3, x - L * .05, -h * .55], p === 'plates' ? '#f4f7ff' : 'rgba(255,255,255,.38)'); }
      else if (p === 'rainbow') ['#ff5d6c', '#ff9f43', '#ffd23f', '#5be38f', '#4fd1ff', '#b48cff'].forEach((col, j) => fr(g, col, -.5 * L, -h + j * h / 3, L, h / 3 + .5));
    });
    bpath(g, L, h); sk(g, lw); eye(g, .3 * L, -h * .22, max(4.5, L * .08)); C(g, .42 * L, h * .18, max(2.4, L * .04), 0, 2, INK, .25, PI - .6);
    if (k === 'whisker') Q(g, [.46 * L, h * .05, .62 * L, h * .3, .58 * L, h * .9], 0, lw * .7, INK, 1);
    if (s.legend) { const x = .16 * L, y = -h * 1.02, w = L * .11; P(g, [x - w, y, x - w, y - w * 1.1, x - w * .5, y - w * .55, x, y - w * 1.35, x + w * .5, y - w * .55, x + w, y - w * 1.1, x + w, y], '#ffe14d', lw * .7); }
  }
  function drawSpec(g, s, L) {
    const c = s.c, lw = max(2.6, L * .045), k = s.kind;
    if (k === 'crab') { [-1, 1].forEach(d => { P(g, [d * L * .16, L * .08, d * L * .4, L * .22], 0, lw, c[2], 1); C(g, d * L * .35, -L * .24, L * .11, c[0], lw); }); E(g, 0, L * .04, L * .27, L * .18, c[0], lw); [-1, 1].forEach(d => eye(g, d * L * .1, -L * .18, L * .07, d)); }
    else if (k === 'turtle') { E(g, -.24 * L, .15 * L, L * .14, L * .06, '#a8e07a', lw); E(g, .18 * L, .17 * L, L * .15, L * .06, '#a8e07a', lw); C(g, L * .38, -L * .02, L * .12, '#a8e07a', lw); eye(g, L * .42, -L * .06, L * .05); Q(g, [-L * .36, L * .1, -L * .36, -L * .3, 0, -L * .3, L * .34, -L * .3, L * .32, L * .1], c[0], lw); R(g, -L * .38, L * .06, L * .72, L * .08, L * .04, '#ffe9a0', lw); }
    else if (k === 'jelly') { for (let i = 0; i < 4; i++) { const x = (-.21 + i * .14) * L; Q(g, [x, L * .05, x + L * .08, L * .26, x, L * .45], 0, lw, c[2], 1); } Q(g, [-L * .34, L * .08, -L * .36, -L * .42, 0, -L * .42, L * .36, -L * .42, L * .34, L * .08, 0, L * .15, -L * .34, L * .08], al(c[0], .9), lw); [-1, 1].forEach(d => eye(g, d * L * .1, -L * .1, L * .06)); }
    else if (k === 'star') { stp(g, 0, 0, L * .46, L * .2, c[0], lw); eye(g, -L * .08, -L * .04, L * .06); eye(g, L * .08, -L * .04, L * .06); }
    else if (k === 'puffer') { const r0 = L * .38; stp(g, 0, 0, r0 * 1.24, r0 * .92, '#fff3c4', lw * .6); C(g, 0, 0, r0, c[0], lw); E(g, 0, r0 * .48, r0 * .75, r0 * .35, c[1]); eye(g, r0 * .35, -r0 * .25, r0 * .25); }
    else { const q0 = L * .36; Q(g, [q0 * .1, -q0 * .9, q0 * .6, -q0 * 1.7, q0 * 1.3, -q0 * 1.1], 0, lw, INK, 1); C(g, q0 * 1.3, -q0 * 1.05, q0 * .22, '#ffe14d', lw); E(g, 0, 0, q0 * 1.05, q0 * .9, c[0], lw); eye(g, q0 * .45, -q0 * .28, q0 * .24); }
  }
  const fsp = s => {
    const L = s.len, h = L * (HR[s.kind] || .6), w = L * 1.5, hh = max(h * 3.4, L * 1.05);
    return { body: sp('fb' + s.i, w, hh, g => { g.translate(w * .45, hh / 2); SPEC[s.kind] ? drawSpec(g, s, L) : drawBody(g, s, L); }), tail: SPEC[s.kind] ? null : sp('ft' + s.i, L * .4, hh, g => { g.translate(L * .3, hh / 2); const th = L * HR[s.kind] / 2, ln = L * (s.kind === 'eel' ? .14 : .23), s2 = th * 1.25; Q(g, [ln * .12, -th * .34, -ln * .5, -s2 * .6, -ln, -s2, -ln * .6, 0, -ln, s2, -ln * .5, s2 * .6, ln * .12, th * .34], s.c[2], max(2.4, L * .04)); }), w, hh, L };
  };
  const sil = s => cache['si' + s.i] || (cache['si' + s.i] = (() => { const f = fsp(s), c = cv(f.body.width, f.body.height), g = gc(c); di(g, f.body, 0, 0); if (f.tail) di(g, f.tail, (f.w * .45 - s.len * .72) * SS, 0); g.globalCompositeOperation = 'source-in'; fr(g, '#28305e', 0, 0, c.width, c.height); return c; })());
  const glow = col => sp('gl' + col, 128, 128, g => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, al(col, .75)); gr.addColorStop(.4, al(col, .25)); gr.addColorStop(1, al(col, 0)); fr(g, gr, 0, 0, 128, 128); });
  const species = (g, s, x, y, dir, k, t = 0, st = 0, ph = 0, fast = 0, rot = 0, si = 0, wg = 1) => sv(g, () => {
    const f = fsp(s), L = s.len; g.translate(x, y); g.scale((dir < 0 ? -1 : 1) * k, k); if (rot) g.rotate(rot);
    if (si) return di(g, sil(s), -f.w * .45, -f.hh / 2, f.w, f.hh);
    const wag = st ? 0 : wg;
    if (SPEC[s.kind]) { const sq = st ? 0 : sin(t * 5 + ph) * .05 * wag; g.scale(1 - sq * .5, 1 + sq); di(g, f.body, -f.w * .45, -f.hh / 2, f.w, f.hh); }
    else { const a = sin(t * (7 + fast * 8) + ph) * .32 * wag; sv(g, () => { g.translate(-L * .42, 0); g.rotate(a); di(g, f.tail, -L * .3, -f.hh / 2, L * .4, f.hh); }); g.rotate(-a * .12); di(g, f.body, -f.w * .45, -f.hh / 2, f.w, f.hh); }
  });
  const junkIcon = (g, k, x, y, sc) => T(g, x, y, sc, () => {
    if (k === 'boot') { P(g, [-26, -34, 4, -34, 6, 2, 36, 4, 40, 26, -28, 26], '#9a6234', 4); R(g, -30, 20, 72, 10, 5, '#5a3a20', 4); }
    else if (k === 'duck') { E(g, 0, 10, 34, 20, '#ffd23f', 4); C(g, 16, -16, 18, '#ffd23f', 4); Q(g, [30, -18, 46, -14, 30, -8], '#ff8a1f', 3.5); eye(g, 20, -22, 6); }
    else if (k === 'teapot') { Q(g, [26, -4, 44, -10, 46, -26], 0, 8, '#5aa9ff', 1); C(g, -30, 0, 14, 0, 8, '#5aa9ff', PI * .5, PI * 1.5); E(g, 0, 2, 32, 26, '#5aa9ff', 4); R(g, -16, -30, 32, 8, 4, '#3d86e0', 3.5); }
    else { P(g, [-36, -8, -30, -38, 30, -38, 36, -8], '#a8672d', 4); R(g, -38, -10, 76, 40, 6, '#b9763a', 4); fr(g, '#ffd23f', -38, -2, 76, 6); }
  });

  const SC = [
    [['#42b5ff', '#9ee4ff', '#fff4d8'], ['#5ee0d8', '#259fb8', '#115472'], '#ddb572', '#b3864b', '#38b85a', '#7fd15d'],
    [['#4eb8ff', '#a8e6ff', '#f3fcff'], ['#6ad0f6', '#2a88ca', '#13487d'], '#a2abb6', '#7b8491', '#45be68', '#74ca6d'],
    [['#33acff', '#9adfff', '#e6f9ff'], ['#45d8ff', '#1390d8', '#094a96'], '#f6d993', '#d8b263', '#39cc86', '#2a88db'],
    [['#7ec8ff', '#cbeaff', '#f5fbff'], ['#82d6f2', '#3489bf', '#174474'], '#8f9cae', '#687488', '#52b4a4', '#c2daf2'],
    [['#100b3b', '#2d2274', '#5641a8'], ['#4746ba', '#231f85', '#0d0940'], '#3d2f7a', '#271c58', '#3df5c8', '#2c226d']
  ];
  const wa = a => `rgba(255,255,255,${a})`, ka = a => al(INK, a);
  const pine = (g, x, y, s, col, sn) => T(g, x, y, s, () => { E(g, 0, 2, 18, 5, ka(.18)); fr(g, '#7c4e24', -4, -16, 8, 18); P(g, [0, -62, 23, -14, -23, -14], col, 3, ka(.35)); P(g, [0, -62, 10, -14, -23, -14], wa(.12)); if (sn) P(g, [0, -62, 10, -42, -10, -42], '#fff'); });
  const mush = (g, x, y, s, col) => T(g, x, y, s, () => { E(g, 0, 2, 18, 5, ka(.28)); R(g, -5, -26, 10, 28, 4, '#efe6ff', 3); C(g, 0, -24, 22, col, 3, INK, PI, 0); C(g, -7, -34, 4, wa(.6)); });
  const tree = (g, x, y, s = 1) => T(g, x, y, s, () => { E(g, 0, 3, 20, 6, ka(.18)); R(g, -5, -26, 10, 28, 3, '#7d4d24', 2.5, ka(.45)); C(g, -11, -34, 17, '#369e46', 2.5, ka(.38)); C(g, 11, -33, 16, '#369e46', 2.5, ka(.38)); C(g, 0, -46, 21, '#4ac455', 2.5, ka(.38)); C(g, -6, -52, 11, '#7ce374'); });
  const reed = (g, x, y, h) => T(g, x, y, 1, () => { Q(g, [0, 0, -5, -h * .5, -8, -h], 0, 3.5, '#3b9b49', 1); Q(g, [4, 0, 8, -h * .6, 12, -h * .85], 0, 3, '#52b859', 1); P(g, [2, 0, 2, -h * .9], 0, 3, '#338840', 1); E(g, 2, -h * .78, 4, 10, '#7c4824', 2, ka(.5)); });
  const weed = (g, x, y, h, col, lw, b) => { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + b, y - h * .35, x - b, y - h * .65, x + b * .5, y - h); sk(g, lw + 4); sk(g, lw, col); };
  function bg(i, p0) {
    const key = i + ':' + p0; if (bgs[key]) return bgs[key];
    const c = cv(W * p0, H * p0), g = gc(c), S = SC[i], P0 = LL.PLACES[i], top = P0.surface, bed = P0.bed, r = rng(17 + i * 101); let k;
    g.scale(p0, p0); fr(g, vg(g, S[0], 0, top), 0, 0, W, top + 4);
    if (P0.night) { for (k = 0; k < 28; k++) C(g, r() * W, r() * (top - 32), 1.4 + r() * 1.4, '#fff'); di(g, glow('#fff6c8'), 940, 8, 140, 140); C(g, 1010, 78, 38, '#fff6c8', 3.5, ka(.35)); }
    else { di(g, glow('#fff099'), 1016, -6, 156, 156); C(g, 1094, 72, 34, vg(g, ['#fff7b8', '#ffd23f'], 38, 106), 3.5, ka(.28)); }
    if (i === 0) {
      P(g, [0, top - 34, 210, top - 88, 500, top - 44, 820, top - 82, 1140, top - 46, W, top - 70, W, top, 0, top], 'rgba(116,198,157,.48)');
      P(g, [0, top - 24, 260, top - 66, 590, top - 24, 965, top - 68, 1065, top - 64, W, top - 22, W, top, 0, top], vg(g, ['#a6e872', '#52ba55'], top - 70, top));
      T(g, 972, top - 60, 1, () => {
        E(g, 35, 4, 44, 9, ka(.22)); R(g, 48, -66, 12, 26, 3, '#c8604a', 3);
        R(g, 0, -42, 70, 44, 5, vg(g, ['#fff7e0', '#ebd4a2'], -42, 2), 3.5);
        P(g, [-9, -39, 35, -74, 79, -39], vg(g, ['#ff7a5c', '#db4b3b'], -74, -39), 3.5);
        R(g, 11, -25, 18, 27, 8, '#9b5c2c', 3); C(g, 24, -11, 2.2, '#ffd23f');
        R(g, 38, -29, 20, 18, 4, '#ffe885', 3); P(g, [48, -29, 48, -11], 0, 2, INK, 1); P(g, [38, -20, 58, -20], 0, 2, INK, 1);
        E(g, 6, 2, 12, 6, '#58c057'); E(g, 66, 1, 13, 6, '#4cb24e');
      });
      [[396, 45, 1.05], [1148, 43, .95], [1236, 27, .85]].forEach(a => tree(g, a[0], top - a[1], a[2]));
      [[350, 42], [895, 34], [1104, 38]].forEach(a => reed(g, a[0], top + 2, a[1]));
    } else if (i === 1) {
      P(g, [0, top - 42, 340, top - 98, 760, top - 42, 1100, top - 90, W, top - 50, W, top, 0, top], 'rgba(105,190,145,.45)');
      P(g, [0, top - 28, 420, top - 82, 860, top - 25, W, top - 70, W, top, 0, top], vg(g, ['#8ee07e', '#43a858'], top - 84, top));
      for (k = 0; k < 6; k++) pine(g, 425 + k * 145, top - 14, 1, k & 1 ? '#2c9350' : '#3dad5d');
    } else if (i === 2) {
      fr(g, vg(g, ['#3aa2f0', '#2178cc'], top - 34, top + 4), 0, top - 34, W, 40);
      P(g, [1116, top - 34, 1184, top - 34, 1170, top - 19, 1130, top - 19], '#ff6b5a', 3); P(g, [1152, top - 82, 1178, top - 42, 1152, top - 42], '#fff', 3);
    } else if (i === 3) {
      P(g, [280, top - 10, 480, top - 160, 680, top - 65, 860, top - 170, 1060, top - 55, W, top - 120, W, top, 280, top], vg(g, ['#eef7ff', S[5]], top - 170, top), 3.5, ka(.25));
      for (k = 0; k < 5; k++) pine(g, 400 + k * 180, top - 10, .88, '#368a84', 1);
    } else {
      P(g, [0, top - 30, 460, top - 82, 900, top - 24, W, top - 70, W, top, 0, top], vg(g, ['#463694', S[5]], top - 82, top));
      for (k = 0; k < 5; k++) mush(g, 440 + k * 170, top - 14, .85, k & 1 ? '#ff5df0' : '#3df5ff');
    }
    fr(g, vg(g, S[1], top, bed), 0, top, W, H - top);
    for (k = 0; k < 4; k++) { P(g, [410 + k * 230, top, 480 + k * 230, top, 585 + k * 230, bed - 34, 465 + k * 230, bed - 34], wa(.07)); weed(g, 415 + k * 235, bed + 6, 86, al(S[4], .42), 6, 16); }
    P(g, [0, top + 160, 290, bed - 32, 640, bed - 18, 960, bed - 28, W, bed - 16, W, H, 0, H], vg(g, [S[2], S[3]], bed - 40, H), 5);
    P(g, [285, bed - 26, 640, bed - 12, 960, bed - 22, W, bed - 10], 0, 5, wa(.22), 1);
    for (k = 0; k < 14; k++) E(g, 280 + r() * 960, bed - 4 + r() * 34, 8 + r() * 12, 4 + r() * 4, k & 1 ? al(S[3], .65) : wa(.28));
    if (i === 4) [480, 880, 1180].forEach((cx, j) => P(g, [cx - 12, bed + 10, cx, bed - 38, cx + 12, bed + 10], ['#3df5ff', '#ff5df0', '#b48cff'][j], 3));
    P(g, [0, top - 30, 155, top - 16, 165, top + 45, 0, top + 250], vg(g, i === 2 ? ['#fae2a2', '#dfb86a'] : i === 3 ? ['#fff', '#cce3f6'] : i === 4 ? ['#4c3ca0', '#2a1f66'] : ['#8de068', '#4cb852'], top - 30, top + 250), 5);
    if (i < 2) [[28, -12, '#ff6fa5'], [68, -2, '#ffd23f'], [104, -8, '#fff']].forEach(a => C(g, a[0], top + a[1], 4.5, a[2], 2, ka(.4)));
    if (i === 2) { Q(g, [40, top - 30, 30, top - 110, 70, top - 180], 0, 14, '#b5793f', 1); for (k = 0; k < 4; k++) { const a = -2.5 + k * .65; Q(g, [70, top - 180, 70 + cos(a) * 50, top - 200 + sin(a) * 30, 70 + cos(a) * 85, top - 170 + sin(a + .4) * 40], 0, 10, '#3fbf5a', 1); } }
    else if (i === 4) mush(g, 52, top - 26, 1.2, '#3df5ff');
    const dy = top - 30;
    if (i !== 3) {
      const pcol = i === 4 ? '#5a4a9a' : '#855329', dcol = i === 4 ? '#7c6bc4' : '#d2914d';
      P(g, [152, dy + 42, 300, dy + 128, 300, dy + 144, 152, dy + 58], i === 4 ? '#4a3b82' : '#6f421f', 3);
      [150, 226, 302].forEach(px => { R(g, px - 9, dy, 18, bed - dy, 6, pcol, 4); fr(g, wa(.16), px - 5, dy + 14, 4, top - dy - 14); fr(g, ka(.24), px - 7, top, 14, bed - top - 4); E(g, px, top + 2, 16, 4.5, wa(.45)); });
      R(g, 110, dy - 8, 218, 24, 6, dcol, 4.5); fr(g, wa(.3), 116, dy - 4, 206, 5);
      for (k = 148; k < 318; k += 32) P(g, [k, dy - 6, k, dy + 14], 0, 2.5, ka(.38), 1);
      R(g, 308, dy - 22, 16, 18, 4, pcol, 3.5);
      if (i === 4) R(g, 288, dy - 66, 24, 28, 6, '#ffe14d', 4);
    } else { R(g, 160, dy - 2, 70, 12, 5, '#c98a4a', 4); R(g, 248, dy + 2, 30, 28, 6, '#5aa9ff', 4); }
    return (bgs[key] = c);
  }
  const iceSp = () => sp('ice', W, 70, g => { const hs = LL.PLACES[3].holes; P(g, [130, 12, W + 10, 10, W + 10, 50, 130, 46], '#dff5ff'); g.globalCompositeOperation = 'destination-out'; hs.forEach(x => E(g, x, 28, 52, 16, '#000')); g.globalCompositeOperation = 'source-over'; P(g, [130, 12, W + 10, 10, W + 10, 50, 130, 46], 0, 4); hs.forEach(x => E(g, x, 28, 52, 16, 0, 4)); });
  const front = (g, i, t, st) => {
    const P0 = LL.PLACES[i], S = SC[i], top = P0.surface, amp = i === 2 ? 5 : 2.5, ph = st ? 0 : t * 2, pts = [];
    [[356, 106], [1072, 112], [1192, 92]].forEach(([wx, wh], k) => weed(g, wx, P0.bed + 8, wh, S[4], 7.5, 11 + (st ? 0 : sin(t * 1.4 + k * 2) * 13)));
    for (let x = 0; x <= W; x += 40) pts.push(x, top + sin(x * .03 + ph) * amp);
    P(g, pts.concat([W, top + 12, 0, top + 12]), P0.night ? 'rgba(160,150,255,.45)' : wa(.52)); P(g, pts, 0, 3, P0.night ? '#c8beff' : '#fff', 1);
    for (let k = 0; k < 5; k++) fr(g, wa(.38), 370 + k * 195 + (st ? 0 : sin(t * 1.3 + k * 2) * 18), top + 16 + (k & 1) * 10, 44 - k * 3, 4);
    if (i === 0) [500, 865, 1205].forEach((lx, k) => { const x = lx + (st ? 0 : sin(t * .8 + k) * 4); E(g, x, top + 3, 33, 9, '#3fbc54', 3); if (k === 1) { C(g, x - 6, top - 5, 7, '#ff7ec6', 2.5); C(g, x - 6, top - 6, 3, '#ffe57f'); } });
    if (P0.holes) di(g, iceSp(), 0, top - 24, W, 70);
  };
  const badge = (g, x, y, s, col, r) => { C(g, x, y, r, col, 3.5); ct(g, s, x, y + 1, r * 1.35, '#fff', 4); };
  const coin = (g, x, y, r) => { C(g, x, y, r, '#ffd23f', max(2, r * .22)); C(g, x, y, r * .6, 0, max(1.5, r * .14), '#e0a400'); };
  const drawBk = (g, i, p0, t, st) => {
    const P0 = LL.PLACES[i]; di(g, bg(i, p0), 0, 0, W, H);
    for (let k = 0; k < 3; k++) T(g, ((st ? 0 : t) * (7 + k * 3) + k * 460 + i * 130 + 80) % (W + 300) - 150, 46 + k * 30, 1 - k * .12, () => {
      const col = P0.night ? 'rgba(120,110,200,.42)' : wa(.92);
      E(g, 0, 5, 44, 16, P0.night ? 'rgba(90,80,165,.35)' : 'rgba(180,224,250,.55)');
      C(g, -22, 2, 17, col); C(g, 22, 3, 15, col); C(g, 0, -6, 22, col);
    });
    if (i === 0 && !st) for (let k = 0; k < 2; k++) { const ph = (t * .38 + k * .5) % 1; C(g, 1026 + sin(ph * 4) * 6, P0.surface - 130 - ph * 26, 4 + ph * 6, wa((.55 * (1 - ph)).toFixed(2))); }
    if (P0.current && !st) for (let k = 0; k < 5; k++) { const sx = (t * (65 + k * 8) + k * 230) % (W + 200) - 100, sy = P0.surface + 70 + (k * 71) % (P0.bed - P0.surface - 110); Q(g, [sx, sy, sx + 30, sy - 5, sx + 60, sy], 0, 3, wa(.35), 1); }
  };
  const drawPlr = (g, w, p, col, m, ca, t, st) => {
    const i = p.i, sp0 = i ? { x: 1132, y: w.P.surface - 10, sit: 1 } : { x: 224, y: w.P.surface - 38, sit: 0 }, d = p.side, top = w.P.surface, hop = m === 'happy' && !st ? M.abs(sin(t * 9)) * 14 : 0;
    if (i) T(g, 1150, top + 6, 1, () => { P(g, [-110, -26, 110, -26, 95, 22, -95, 22], '#ff7a5a', 5); fr(g, '#fff', -104, -16, 208, 7); });
    const hx = sp0.x + d * 28, hy = sp0.y - 60 - hop; let tx0 = p.rod.x, ty = p.rod.y - hop, bend = 0;
    if (ca > 0) { const a = -d * sin(ca * PI) * 1.1, dx = tx0 - hx, dy = ty - hy; tx0 = hx + dx * cos(a) - dy * sin(a); ty = hy + dx * sin(a) + dy * cos(a); }
    if (p.state === 'reel') { bend = .7 + (st ? 0 : .3 * sin(t * 9)); tx0 += (p.hook.x - tx0) * .1 * bend; ty += 26 * bend; } else if (p.state === 'bite' && !st) ty += sin(t * 40) * 3;
    if (!sp0.sit) E(g, sp0.x, sp0.y + 1, 24, 6, 'rgba(28,34,80,.24)');
    T(g, sp0.x, sp0.y - hop, 1, () => {
      const hy0 = -110, eo = m === 'bite' ? 1.35 : 1, mx = d * 8, my = hy0 + 13;
      if (!sp0.sit) { R(g, -15, -28, 12, 28, 5, col.pants, 4); R(g, 3, -28, 12, 28, 5, col.pants, 4); }
      g.rotate((p.state === 'reel' ? -1 : 0) * .2 * d); R(g, -23, -80, 46, 55, 17, col.shirt, 4.5); R(g, -18, -75, 14, 24, 7, 'rgba(255,255,255,.22)'); R(g, -23, -49, 46, 23, 10, col.pants, 4); C(g, d * 2, hy0, 29, '#ffd2a8', 4.5);
      E(g, d * 2 - 14, hy0 + 7, 5.5, 3.5, 'rgba(255,105,130,.38)'); E(g, d * 2 + 16, hy0 + 7, 5.5, 3.5, 'rgba(255,105,130,.38)');
      [-1, 1].forEach(k => { const ex = d * 8 + k * 10.5; m === 'happy' ? C(g, ex, hy0, 6, 0, 3.5, INK, PI * 1.1, PI * 1.9) : (E(g, ex, hy0 - 2, 6 * eo, 7.5 * eo, '#fff', 3), C(g, ex + d * 2, hy0 - 2, 3.5 * eo, INK), C(g, ex + d * 2 - 1.5, hy0 - 4.5, 1.5, '#fff')); });
      m === 'bite' ? E(g, mx, my, 5, 6, '#7a1f3d', 3) : C(g, mx, my + (m === 'sad' ? 6 : -2), 6, 0, 3.2, INK, m === 'sad' ? PI * 1.15 : .3, m === 'sad' ? PI * 1.85 : PI - .3);
      E(g, d * 2, hy0 - 19, 40, 10.5, col.hat, 4); Q(g, [d * 2 - 26, hy0 - 19, d * 2 - 25, hy0 - 48, d * 2, hy0 - 48, d * 2 + 25, hy0 - 48, d * 2 + 26, hy0 - 19], col.hat, 4); R(g, d * 2 - 26, hy0 - 24, 52, 7, 3, col.band, 3);
    });
    Q(g, [hx, hy, (hx + tx0) / 2 - (ty - hy) * .12 * bend, (hy + ty) / 2 + M.abs(tx0 - hx) * .25 * bend, tx0, ty], 0, 9, INK, 1); sk(g, 4.5, i ? '#ff7ae0' : '#c98a4a'); C(g, hx, hy, 8, '#ffd2a8', 3.5);
    const ln = (x1, y1, x2, y2, sag) => { sag ? Q(g, [x1, y1, (x1 + x2) / 2, max(y1, y2) + sag, x2, y2], 0, 2, '#fff', 1) : P(g, [x1, y1, x2, y2], 0, 2, '#fff', 1); sk(g, 1, al(INK, .5)); };
    const bob = (x, y, k = 1) => T(g, x, y, k, () => { P(g, [0, -10, 0, -20], 0, 3, INK, 1); C(g, 0, 0, 10, '#fff', 3.5); C(g, 0, 0, 10, '#ff4d4d', 3.5, INK, PI, 0); });
    const s = p.state;
    if (s === 'reel') w.P.holes ? (ln(tx0, ty, p.hook.x, top, 0), ln(p.hook.x, top, p.hook.x, p.hook.y, 0)) : ln(tx0, ty, p.hook.x, p.hook.y, 0);
    else if (s === 'ready' || s === 'land') { ln(tx0, ty, tx0, ty + 34, 0); bob(tx0, ty + 40, .8); }
    else if (s === 'cast' || s === 'back') { ln(tx0, ty, p.bob.x, p.bob.y, 20); bob(p.bob.x, p.bob.y); }
    else { const by = s === 'bite' ? top + 12 + (st ? 0 : sin(t * 30) * 2) : top - 2 + p.dip * 7; ln(tx0, ty, p.bob.x, by - 10, 30); bob(p.bob.x, by); }
  };
  const drawMk = (g, x, y, ch, k = 1) => T(g, x, y, k, () => ch === '!' ? (stp(g, 0, 0, 38, 24, '#ffd23f', 5, .1), ct(g, '!', 0, 3, 48, '#ff4d4d', 8)) : (R(g, -20, -22, 40, 40, 14, '#fff', 4), ct(g, ch, 0, -1, 30, '#4f7bff', 0)));
  const drawTh = (c, i) => sv(gc(c), () => { const g = gc(c), s = max(c.width / 800, c.height / 450), P0 = LL.PLACES[i]; g.clearRect(0, 0, c.width, c.height); g.scale(s, s); g.translate(-300, -110); di(g, bg(i, 1), 0, 0); front(g, i, 0, 1); [0, 1, 2].forEach(q => species(g, LL.SPECIES[P0.species[q]], 560 + q * 150, P0.surface + (P0.bed - P0.surface) * (.5 + q * .12), q & 1 ? -1 : 1, 1.1, 0, 1)); });
  const drawCa = (c, kind, sId, t, st) => { const g = gc(c), w = c.width, h = c.height; g.clearRect(0, 0, w, h); if (kind === 'junk') return junkIcon(g, sId, w / 2, h / 2 + 6, min(w / 120, h / 100)); const s = LL.SPECIES[sId], k2 = min(w / (s.len * 1.45), h / (s.len * (SPEC[s.kind] ? 1.05 : .95))); if (s.glow || s.rarity === 3) { g.globalAlpha = .7; di(g, glow(s.glow || '#ffe14d'), w * .05, -h * .1, w * .9, h * 1.2); g.globalAlpha = 1; } species(g, s, w / 2, h / 2, -1, k2, t, st, 0, 0, 0, 0, .6); };
  const drawRi = (c, kind) => T(gc(c), 0, 0, c.width / 120, () => { const g = gc(c); g.clearRect(0, 0, 120, 120); if (kind === 'zone') { R(g, 38, 10, 44, 100, 16, '#2a8fd0', 4); R(g, 42, 40, 36, 56, 12, '#5be38f', 4); } else if (kind === 'reel') { C(g, 60, 62, 38, '#c9d6e8', 5); C(g, 60, 62, 24, '#ff9a1f', 4); P(g, [60, 62, 98, 30], 0, 8, '#4a3a5a', 1); } else if (kind === 'lure') { E(g, 60, 58, 22, 32, '#ff5d9e', 4); eye(g, 60, 44, 7); } else { R(g, 22, 64, 76, 44, 10, '#9aa3c7', 4); Q(g, [44, 66, 40, 22, 70, 20], 0, 12, '#ff8fb0', 1); } });
  const drawBook = (g, save) => {
    fr(g, 'rgba(16,20,50,.55)', 0, 0, W, H); R(g, 40, 96, 1200, 610, 34, '#fff8e8', 6);
    for (let i = 0; i < 6; i++) {
      const y = 150 + i * 92, list = i < 5 ? LL.PLACES[i].species : LL.JUNK_IDS;
      R(g, 1100, y - 40, 120, 80, 18, i < 5 ? SC[i][1][1] : '#b9763a', 4);
      i < 5 ? ct(g, String(i + 1), 1160, y + 2, 40, '#fff', 7) : junkIcon(g, 'chest', 1160, y + 4, .55);
      list.forEach((it, k) => {
        const x = 1012 - k * 140; R(g, x - 64, y - 42, 128, 84, 16, i < 5 ? '#fff' : '#fff1d6', 3.5, al(INK, .45));
        if (i < 5) { const s = LL.SPECIES[it], best = save.book[s.id] || 0; species(g, s, x + 4, y - 8, -1, min(1, 100 / (s.len * 1.3), 60 / (s.len * (SPEC[s.kind] ? .9 : .6))), 0, 1, 0, 0, 0, !best); ct(g, best ? LL.weightText(best) + ' كغ' : '؟', x, y + 28, 19, best ? INK : '#9aa3c7', 0); }
        else { const n = save.junk[it] || 0; g.globalAlpha = n ? 1 : .25; junkIcon(g, it, x, y - 4, .62); g.globalAlpha = 1; ct(g, n ? '×' + n : '؟', x, y + 28, 20, n ? INK : '#9aa3c7', 0); }
      });
    }
  };

  const canvas = $('game'), ui = $('ui'), ghostEl = $('ghost'); let dirty = 1;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => { ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = `scale(${v.scale})`; dirty = 1; } });
  const fx = Kit.particles(), shake = Kit.shake(), ps = () => min(2, max(.5, M.round(view.scale * view.dpr * 4) / 4));
  const bu = (x, y, colors, count = 20, speed = 300, gravity = 300, o) => fx.burst(x, y, O({ count, colors, speed, life: .8, size: 8, gravity }, o));
  const GO = ['Space', 'Enter', 'NumpadEnter'], PRAISE = ['رائع!', 'ممتاز!', 'مذهل!'];
  const COLS = [{ hat: '#ffd23f', band: '#ff5d6c', shirt: '#ff7a3d', pants: '#3f6fd8' }, { hat: '#ff7ae0', band: '#fff', shirt: '#9b5cff', pants: '#2a3a7a' }];

  const store = Kit.store('lucky-lake'), saveStatus = Kit.saveStatus({ retry: persistNow }), dda = Kit.dda('lucky-lake', { id: 'solo' });
  let save = LL.loadSave(store.get('save', null)), saveDirty = 0, saveT = 0;
  function persistNow() { clearTimeout(saveT); saveT = saveDirty = 0; if (store.set('save', save) === false) { saveStatus.failed(); return false; } saveStatus.saved(); return true; }
  const schedSave = () => { saveDirty = 1; clearTimeout(saveT); saveT = setTimeout(persistNow, 350); }, flushSave = () => saveDirty && persistNow();

  let screen = 'title', mode = 'solo', world = null, place = 0, time = 0;
  const menuW = LL.create({ place: 0, seed: 11 });
  let trip = { open: false, catches: [], coins: 0, before: 0, newPlace: -1 }, card = null, resData = null, resT = 0, resLock = 0, duo = null, duoEnd = null, banner = null;
  const ptr = { x: 640, y: 360, known: 0, down: 0, moved: 0 }, coach = { idle: 0, next: 1.4, target: 0 };
  let pressQ = 0, keyLock = 0, rings = [], floats = [], flyers = [], flights = [null, null], castAnim = [0, 0], mood = [{ m: '', t: 0 }, { m: '', t: 0 }];
  let goalBump = [0, 0, 0], coinBump = 0, scoreBump = [0, 0], coinShown = save.coins, pendGoals = [], timers = [];
  const focusGame = () => { try { canvas.focus({ preventScroll: true }); } catch {} }, chip = (id, n) => { qs($(id), 'b').textContent = String(n); };
  const solo = () => mode === 'solo', sy = () => world.P.surface, bkText = () => `${LL.speciesCount(save)}/${LL.SPECIES.length}`;

  const SCR = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', book: 'scrBook', rods: 'scrRods', duoEnd: 'scrDuoEnd' };
  const paintOv = () => { hid('scrCatch', !(screen === 'play' && card && card.open)); hid('scrDuo', !(screen === 'play' && !solo() && duo && duo.phase === 'intro')); };
  function setScreen(name) { screen = name; for (const k in SCR) hid(SCR[k], k !== name); hid('hud', name !== 'play'); hid('btnBasket', !solo()); stopG(); paintOv(); dirty = 1; if (name === 'play') focusGame(); }
  const toTitle = () => { world = null; mode = 'solo'; chip('titleFish', bkText()); setScreen('title'); };
  const play = () => { J.select(); startSolo(LL.nextPlace(save)); }, backTitle = () => { J.back(); toTitle(); };
  const progText = (pi, unl) => { const st = LL.stars(save, pi); return unl >= 0 ? `✨ فُتح ${LL.PLACES[unl].name} · الكتاب ${bkText()}` : pi < 4 && !LL.isOpen(save, pi + 1) ? `★ ${st}/3 · بقي ${2 - st === 1 ? 'نجمة' : 'نجمتان'} لـ ${LL.PLACES[pi + 1].name} · ${bkText()}` : `★ ${st}/3 · الكتاب ${bkText()}`; };
  const wig = el => { el.classList.remove('wig'); void el.offsetWidth; el.classList.add('wig'); setTimeout(() => el.classList.remove('wig'), 450); };

  const cards = []; let thumbsOk = 0;
  function toMap() {
    if (!cards.length) LL.PLACES.forEach((P0, i) => {
      const b = document.createElement('button'); b.className = 'b place'; b.style.left = (1000 - i * 236) + 'px';
      b.innerHTML = `<i class="num">${i + 1}</i><canvas width="392" height="300"></canvas><b>${P0.name}</b><span class="st"><span>★</span><span>★</span><span>★</span></span><span class="lock">🔒</span><span class="need">★ 2</span>`;
      on(b, () => LL.isOpen(save, i) ? (J.select(), startSolo(i)) : (J.error(), wig(b))); $('places').appendChild(b); cards.push(b);
    });
    world = null; mode = 'solo'; if (!thumbsOk) { cards.forEach((b, i) => drawTh(qs(b, 'canvas'), i)); thumbsOk = 1; }
    const next = LL.nextPlace(save);
    cards.forEach((b, i) => { const open = LL.isOpen(save, i), st = LL.stars(save, i); cl(b, 'locked', !open); cl(b, 'next', open && i === next); b.querySelectorAll('.st span').forEach((s, k) => cl(s, 'on', k < st)); });
    chip('mapCoins', save.coins); setScreen('map'); J.whoosh(.4);
  }

  function resetPlay() { fx.clear(); Kit.hitstop.reset(); rings = []; floats = []; flyers = []; flights = [null, null]; castAnim = [0, 0]; mood = [{ m: '', t: 0 }, { m: '', t: 0 }]; goalBump = [0, 0, 0]; scoreBump = [0, 0]; pendGoals = []; pressQ = ptr.down = 0; coinShown = save.coins; timers = []; Kit.keys.reset(); }
  function startSolo(i) {
    place = i; mode = 'solo';
    world = LL.create({ place: i, tier: dda.tier, rods: save.rods, seed: (M.random() * 2147483647) | 0, boost: save.places[i].g[1] ? '' : LL.PLACES[i].goals.sp });
    trip = { open: true, catches: [], coins: 0, before: LL.stars(save, i), newPlace: -1 }; card = resData = banner = duo = null; resetPlay();
    coach.idle = 0; coach.next = save.coach ? 5 : 1.4;
    Kit.stats.round('place' + (i + 1)); if (!save.coach) Kit.stats.tutorial('start');
    tx('basketNum', 0); setScreen('play'); J.whoosh(.5);
  }
  function endTrip() { if (!trip.open) return; trip.open = false; flushSave(); Kit.stats.end('end', trip.catches.length); if (card) closeCard(1); }
  const restart = () => { J.select(); solo() ? (endTrip(), startSolo(place)) : startDuo(); };
  function pause(own) { if (screen !== 'play') return; ptr.down = 0; flushSave(); tx('btnMenu', solo() ? '🗺' : '🏠'); setScreen('pause'); if (own) J.back(); }
  const resume = () => screen === 'pause' && (J.select(), setScreen('play'), Kit.keys.reset());

  function openCard(c, res) {
    card = { c, res, t: 0, open: true };
    const jk = c.junk, s = jk ? null : LL.SPECIES[c.sp], nm = jk ? LL.JUNK[c.id].name : s.name;
    tx('catchName', nm); tx('catchWeight', LL.weightText(c.w10) + ' كغ');
    tx('catchStars', jk ? '' : '★'.repeat(s.rarity)); hid('catchStars', jk);
    tx('catchCoins', '+' + c.coins); hid('catchNew', !res.newSpecies); hid('catchBest', !res.best);
    tx('catchProg', progText(place, res.unlocked)); cl('catchProg', 'done', res.unlocked >= 0 || LL.stars(save, place) >= 3);
    $('catchCard').style.background = jk ? '#fff3dc' : s.legend ? '#fff4b8' : s.rarity === 3 ? '#f4ecff' : '';
    drawCardArt(); tx('live', nm); paintOv();
  }
  const drawCardArt = () => card && drawCa($('catchArt'), card.c.junk ? 'junk' : 'fish', card.c.junk ? card.c.id : card.c.sp, time, calm());
  function closeCard(quiet) {
    if (!card) return; const c = card.c; card = null; paintOv(); stopG(); flushSave();
    if (quiet) { coinShown = save.coins; return; }
    J.tap(); const n = min(10, max(1, M.ceil(c.coins / 4)));
    for (let i = 0; i < n; i++) flyers.push({ x: 640 + (M.random() - .5) * 120, y: 300 + (M.random() - .5) * 60, t: -i * .06, v: c.coins / n });
    pendGoals.forEach((k, i) => timers.push({ t: .25 + i * .35, fn: () => { goalBump[k] = 1; J.star(min(3, i + 1)); bu(340 + (2 - k) * 210 + 12, 22, ['#ffd23f', '#fff', '#ff9a1f']); } }));
    if (pendGoals.length && trip.newPlace >= 0 && !banner) { const np = trip.newPlace; timers.push({ t: .3 + pendGoals.length * .35, fn: () => { banner = { t: 0, place: np }; J.levelUp(); confetti(); } }); }
    pendGoals = []; coach.idle = 0;
  }
  const confetti = () => !calm() && [0, 1, 2, 3, 4].forEach(i => bu(160 + i * 240, 140, ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#fff'], 16, 380, 420, { life: 1.1, size: 9 }));

  function showResult() {
    resData = { stars: LL.stars(save, place), before: trip.before, catches: trip.catches.slice(), coins: trip.coins, newPlace: trip.newPlace };
    resT = 0; resLock = .45; tx('resPlace', LL.PLACES[place].name);
    $('resStars').querySelectorAll('span').forEach((s, i) => cl(s, 'on', i < resData.before));
    tx('resCoins', '+' + resData.coins); tx('resCount', resData.catches.length);
    tx('resProg', progText(place, resData.newPlace)); cl('resProg', 'done', resData.newPlace >= 0 || resData.stars >= 3);
    hid('resNewPlace', 1); hid('resAgain', resData.newPlace < 0);
    const g = gc($('resCatches')), list = resData.catches, n = min(list.length, 8); g.clearRect(0, 0, 600, 112);
    if (!list.length) species(g, LL.SPECIES[LL.PLACES[place].species[0]], 300, 52, -1, 1.05, 0, 1, 0, 0, 0, 1);
    else { const more = list.length > n ? 1 : 0, x0 = 300 + (n + more - 1) * 37; for (let i = 0; i < n; i++) { const it = list[i], x = x0 - i * 74; it.junk ? junkIcon(g, it.id, x, 46, .54) : species(g, LL.SPECIES[it.sp], x, 42, -1, min(1, 70 / (LL.SPECIES[it.sp].len * 1.25)), 0, 1); ct(g, LL.weightText(it.w10), x, 92, 18, INK, 0); } if (more) ct(g, '+' + (list.length - n), x0 - n * 74, 48, 28, INK, 0); }
    setScreen('result');
  }
  const resNext = () => resData && (J.select(), startSolo(resData.newPlace >= 0 ? resData.newPlace : place));

  const RLBL = { zone: 'منطقة أكبر', reel: 'بكرة قوية', lure: 'طُعم لامع', bait: 'دودة شهية' }, tiles = {};
  function refreshRods() {
    if (!tiles.zone) LL.RODS.forEach(k => {
      const b = document.createElement('button'); b.className = 'b tile';
      b.innerHTML = `<canvas width="300" height="300"></canvas><b>${RLBL[k]}</b><span class="pips"><i></i><i></i><i></i></span><span class="pr"><i class="cn"></i><em></em></span>`;
      drawRi(qs(b, 'canvas'), k);
      on(b, () => { if (!LL.rodCost(save, k)) { J.tap(); return wig(b); } if (!LL.buy(save, k)) { J.error(); return wig(b); } persistNow(); J.coin(3); J.levelUp(); refreshRods(); });
      $('tiles').appendChild(b); tiles[k] = b;
    });
    LL.RODS.forEach(k => { const b = tiles[k], lv = save.rods[k], cost = LL.rodCost(save, k); b.querySelectorAll('.pips i').forEach((p, i) => cl(p, 'on', i < lv)); cl(b, 'max', !cost); cl(b, 'poor', !!cost && save.coins < cost); qs(b, 'em').textContent = cost ? String(cost) : '✓'; });
    chip('rodsCoins', save.coins);
  }

  function startDuo() { J.select(); mode = 'duo'; world = LL.create({ place: 0, duo: true, seed: (M.random() * 2147483647) | 0 }); duo = { phase: 'intro', t: 0, ready: [0, 0], count: 0, over: 0 }; duoEnd = card = null; trip.open = false; resetPlay(); Kit.stats.round('duo'); cl('duoP1', 'ready', false); cl('duoP2', 'ready', false); setScreen('play'); }
  const duoReady = i => duo && duo.phase === 'intro' && !duo.ready[i] && (duo.ready[i] = 1, J.select(), cl(i ? 'duoP2' : 'duoP1', 'ready', true), duo.ready[0] && duo.ready[1] && duoCount());
  const duoCount = () => duo && duo.phase === 'intro' && (duo.phase = 'count', duo.t = 0, duo.count = 3, J.countdown(3), paintOv(), focusGame());
  function finishDuo() {
    if (!duo || duo.over) return; duo.over = 1; const win = LL.duoWinner(world); Kit.stats.end('end'); duoEnd = { win, t: 0 };
    tx('duoWinner', win ? `فاز اللاعب ${win}!` : 'تعادل!'); $('duoWinner').style.color = win === 1 ? '#e07800' : win === 2 ? '#b23fe0' : INK;
    const g = gc($('duoCatches')); g.clearRect(0, 0, 640, 210);
    world.players.forEach((p, i) => {
      const x0 = i ? 340 : 20, col = i ? P2 : P1, w2 = win === i + 1;
      R(g, x0, 6, 280, 196, 26, w2 ? '#fff4b8' : '#f4f6ff', 5, col); badge(g, x0 + 32, 38, String(i + 1), col, 22);
      if (w2) stp(g, x0 + 248, 38, 22, 10, '#ffd23f', 4); ct(g, LL.weightText(p.total) + ' كغ', x0 + 140, 40, 34, INK, 0);
      p.catches.filter(k => !k.junk).sort((a, b) => b.w10 - a.w10).slice(0, 8).forEach((k, j) => { const s = LL.SPECIES[k.sp]; species(g, s, x0 + 46 + (j % 4) * 62, 100 + M.floor(j / 4) * 62, 1, min(.8, 54 / (s.len * 1.3)), 0, 1); });
    });
    J.levelUp(); confetti(); setScreen('duoEnd');
  }

  function on(el, fn) { (typeof el === 'string' ? $(el) : el).addEventListener('click', e => { e.stopPropagation(); Kit.audio.unlock(); if (e.detail > 0) { e.currentTarget.blur(); focusGame(); } fn(e); }); }
  const rb = fn => () => resLock <= 0 && fn(), db = fn => () => duoEnd && duoEnd.t > .5 && fn();
  [['btnPlay', play], ['btnMap', toMap], ['btnBook', () => { J.select(); chip('bookCount', bkText()); setScreen('book'); }], ['btnDuo', startDuo], ['btnRods', () => { J.select(); refreshRods(); setScreen('rods'); }], ['mapHome', backTitle], ['bookBack', backTitle], ['rodsBack', backTitle], ['btnPause', () => pause(1)], ['btnBasket', () => solo() && world && (J.select(), endTrip(), showResult())], ['btnResume', resume], ['btnRestart', restart], ['btnMenu', () => { J.back(); solo() ? (endTrip(), showResult()) : (Kit.stats.end('quit'), duo = null, toTitle()); }], ['catchOk', () => card && card.t >= .35 && closeCard(0)], ['resNext', rb(resNext)], ['resAgain', rb(() => resData && (J.select(), startSolo(place)))], ['resMap', rb(() => { J.back(); toMap(); })], ['duoGo', duoCount], ['duoAgain', db(startDuo)], ['duoHome', db(backTitle)]].forEach(([k, f]) => on(k, f));
  $('scrCatch').addEventListener('click', e => { e.stopPropagation(); if (card && card.t >= .45) closeCard(0); });
  const setPtr = e => { const p = view.toLogical(e.clientX, e.clientY); ptr.x = p.x; ptr.y = p.y; ptr.known = ptr.moved = 1; };
  window.addEventListener('pointermove', e => { setPtr(e); if (screen === 'play') coach.idle = 0; });
  canvas.addEventListener('pointerdown', e => { focusGame(); if (e.button !== 0) return; setPtr(e); if (screen === 'play' && solo() && world && !card) { pressQ = ptr.down = 1; coach.idle = 0; } });
  window.addEventListener('pointerup', () => { ptr.down = 0; }); window.addEventListener('pagehide', flushSave);

  const kdir = (K, l, r, u, d) => ({ mx: (K.anyDown(r) ? 1 : 0) - (K.anyDown(l) ? 1 : 0), my: (K.anyDown(d) ? 1 : 0) - (K.anyDown(u) ? 1 : 0) });
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(GO), esc = K.pressed('Escape'); keyLock = 0;
    if (screen === 'title' || screen === 'map') { if (go) play(); else if (esc && screen === 'map') backTitle(); }
    else if (screen === 'book' || screen === 'rods') { if (go || esc) backTitle(); }
    else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) { pause(1); keyLock = 1; }
      else if (card) { if (go && card.t >= .35) closeCard(0); keyLock = 1; }
      else if (!solo() && duo && duo.phase === 'intro') { if (K.pressed('Space')) duoReady(0); if (K.anyPressed(['Enter', 'NumpadEnter'])) duoReady(1); keyLock = 1; }
    } else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', ...GO])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resLock <= 0) { if (go) resNext(); else if (K.pressed('KeyR')) { J.select(); startSolo(place); } else if (esc) { J.back(); toMap(); } }
    else if (screen === 'duoEnd' && duoEnd && duoEnd.t > .5) { if (go || K.pressed('KeyR')) startDuo(); else if (esc) backTitle(); }
  }
  function inputs() {
    const K = Kit.keys;
    if (!solo()) return !duo || duo.phase !== 'go' || keyLock ? [{}, {}] : [O(kdir(K, ['KeyA'], ['KeyD'], ['KeyW'], ['KeyS']), { press: K.pressed('Space'), hold: K.down('Space') }), O(kdir(K, ['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']), { press: K.anyPressed(['Enter', 'NumpadEnter']), hold: K.anyDown(['Enter', 'NumpadEnter']) })];
    if (card || keyLock) { pressQ = 0; return [{}]; }
    const inp = kdir(K, ['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD'], ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']);
    inp.press = !!pressQ || K.anyPressed(GO); inp.hold = !!ptr.down || K.anyDown(GO);
    if (ptr.moved && ptr.known && !inp.mx && !inp.my) { inp.ax = ptr.x; inp.ay = ptr.y; }
    if (inp.press || inp.mx || inp.my || inp.ax != null) coach.idle = 0;
    pressQ = 0; return [inp];
  }

  const rip = (x, y, k, col = '255,255,255') => { rings.push({ x, y, t: 0, life: .7 + k * .4, r: 14 + 40 * k, col }); if (rings.length > 24) rings.shift(); };
  const spl = (x, r, n, col) => { rip(x, sy(), r, col); bu(x, sy(), ['#fff', '#bff4ff', '#7fe3ff'], n, 260, 700, { life: .6, size: 7, angle: -PI / 2, spread: 1.6 }); };
  const ft = (x, y, text, color = '#fff', size = 32) => { floats.push({ x, y, text, color, size, t: 0 }); if (floats.length > 12) floats.shift(); };
  const miss = (o = 0) => solo() && (dda.result(o), Kit.track.miss());
  function handleEvents() {
    for (const e of world.ev) {
      const p = e.p != null ? world.players[e.p] : null, t = e.t;
      if (t === 'cast') { J.whoosh(.55); castAnim[e.p] = 1; if (solo()) world.tier = dda.tier; }
      else if (t === 'splash') { J.pop(.4); spl(e.x, .8, 10); }
      else if (t === 'sunk') bu(e.x, e.y, ['#fff'], 5, 60, -120, { size: 5 });
      else if (t === 'notice') J.hover();
      else if (t === 'nibble') { J.pop(.95); rip(e.x, sy(), .25); }
      else if (t === 'bite') { J.impact(.6); J.pop(.15); shake.add(3.5); spl(e.x, 1, 9, '255,230,90'); mood[e.p] = { m: 'bite', t: 1.5 }; if (solo()) Kit.track.cue(); }
      else if (t === 'spook') { J.back(); ft(p.bob.x, sy() - 60, 'انتظر !'); miss(); }
      else if (t === 'late') { J.error(); mood[e.p] = { m: 'sad', t: 1 }; if (!e.junk) { ft(e.x, e.y - 40, 'فاتتك!'); miss(); } }
      else if (t === 'hooked') { J.select(); J.impact(.35); shake.add(4); spl(e.x, .9, 12); mood[e.p] = { m: '', t: 0 }; }
      else if (t === 'landed') {
        const c = e.c, sx = p.hook.x, rare = !c.junk && LL.SPECIES[c.sp].rarity === 3, leg = !c.junk && LL.SPECIES[c.sp].legend;
        J.impact(leg ? .9 : rare ? .65 : .4); shake.add(leg ? 10 : rare ? 7 : 5);
        if (rare || leg) { Kit.hitstop(leg ? .065 : .048); bu(sx, sy(), ['#ffd23f', '#fff', '#ff9a1f'], leg ? 34 : 22, 340, 480, { life: .9, size: 9 }); }
        spl(sx, rare ? 1.4 : 1.15, rare ? 28 : 20); flights[e.p] = { c, x: sx, y: sy(), t: 0 }; mood[e.p] = { m: 'happy', t: 1.4 };
        if (!solo()) { J.coin(3); scoreBump[e.p] = 1; ft(e.p ? 1060 : 220, sy() - 180, c.junk ? '0 كغ' : '+' + LL.weightText(c.w10) + ' كغ', e.p ? '#f3c4ff' : '#ffd8a8', 34); }
        else {
          if (!c.junk) { dda.result(1); Kit.track.hit(); }
          const res = LL.applyCatch(save, place, c); trip.catches.push(c); trip.coins += c.coins; if (res.unlocked >= 0) trip.newPlace = res.unlocked;
          pendGoals = pendGoals.concat(res.goals); if (!c.junk && !save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
          schedSave(); tx('basketNum', trip.catches.length);
          if (p.streak >= 2 && (p.streak <= 3 || p.streak % 5 === 0)) { ft(640, 170, PRAISE[p.streak >= 5 ? 2 : p.streak >= 3 ? 1 : 0], '#ffd23f', 48); J.streak(p.streak); }
          if (res.newSpecies && !c.junk) J.chime(min(3, LL.SPECIES[c.sp].rarity));
          card = { pending: true, c, res, t: 0 };
        }
      } else if (t === 'escape') { J.back(); spl(e.x, .7, 8); mood[e.p] = { m: 'sad', t: 1.2 }; ft(e.x, sy() - 50, e.junk ? 'أفلتت!' : 'هربت!'); if (!e.junk) miss(LL.outcome('escape', e.peak)); }
      else if (t === 'back') J.whoosh(.2);
      else if (t === 'timeup') finishDuo();
    }
    world.ev.length = 0;
  }

  const ghost = { on: false, t: 0, dur: 2, sx: 0, sy: 0, get: null, bite: 0 };
  const startG = (sx, sy0, get, dur, bite) => { O(ghost, { on: true, t: 0, dur, sx, sy: sy0, get, bite: !!bite }); hid('ghost', 0); };
  function stopG() { ghost.on = false; hid('ghost', 1); coach.target = 0; }
  function coachStep(dt) {
    const p = world.players[0]; if (ghost.on && ghost.bite && p.state !== 'bite') stopG();
    if (card || ghost.on) return;
    if (p.state === 'bite' && !save.coach) return startG(p.bob.x + 80, sy() + 60, () => ({ x: p.bob.x, y: sy() - 6 }), 1.8, 1);
    if (p.state !== 'ready') { coach.idle = 0; return; }
    if ((coach.idle += dt) < coach.next) return;
    let best = null, sc = -1e9;
    world.fish.forEach(f => { if (f.state === 'swim' && f.x >= p.x0 + 20 && f.x <= p.x1 - 20) { const v = (LL.spOf(f).id === world.P.goals.sp && !save.places[place].g[1] ? 400 : 0) - M.abs(f.x - 760) * .5; if (v > sc) { sc = v; best = f; } } });
    coach.idle = 0; coach.next = best ? 6 : 1; if (!best) return;
    coach.target = best.id; startG(330, 140, () => { const f = world && LL.fishById(world, best.id); return f && f.state === 'swim' ? { x: LL.mouth(f).x + f.dir * 30, y: LL.mouth(f).y } : null; }, 2.3, 0);
  }

  function update(dt) {
    time += dt; handleKeys();
    if (screen === 'play' && world) {
      if (!Kit.hitstop.tick(dt)) {
        if (!solo()) { duo.t += dt; if (duo.phase === 'intro' && duo.t > 12) duoCount(); else if (duo.phase === 'count') { const n = 3 - M.floor(duo.t); if (n !== duo.count) { duo.count = n; J.countdown(max(0, n)); } if (duo.t >= 3) { duo.phase = 'go'; duo.t = 0; } } if (duo.phase !== 'go') world.left = 120 + dt; }
        if (!world.over) LL.step(world, dt, inputs());
        handleEvents();
        if (solo()) { coachStep(dt); if (card && card.pending && world.players[0].state !== 'land') { card.pending = false; openCard(card.c, card.res); } if (card && card.open && (card.t += dt) > 9) closeCard(0); }
      }
    } else if (screen !== 'pause') {
      LL.step(menuW, dt); menuW.ev.length = 0;
      if (screen === 'result') { const r = resData, b = resT; resT += dt; for (let i = r.before; i < r.stars; i++) { const t = .28 + (i - r.before) * .35; if (b < t && resT >= t) { $('resStars').children[i].classList.add('on'); J.star(i + 1); bu(520 + i * 120, 170, ['#ffd23f', '#fff'], 18); } } const nt = .35 + max(0, r.stars - r.before) * .35; if (r.newPlace >= 0 && b < nt && resT >= nt) { hid('resNewPlace', 0); J.levelUp(); confetti(); } }
      if (screen === 'duoEnd' && duoEnd) duoEnd.t += dt;
      if (resLock > 0) resLock -= dt;
    }
    if (screen !== 'pause') {
      if (ghost.on) { const p = ghost.get(); if (!p || (ghost.t += dt) > ghost.dur) stopG(); else { const k = calm() ? 1 : min(1, ghost.t / .9), e = k * (2 - k); ghostEl.style.transform = `translate(${(ghost.sx + (p.x - ghost.sx) * e - 28).toFixed(1)}px,${(ghost.sy + (p.y - ghost.sy) * e - 8).toFixed(1)}px)`; } }
      fx.update(dt); shake.update(dt);
      rings = rings.filter(r => (r.t += dt) <= r.life); floats = floats.filter(f => { f.t += dt; f.y -= dt * 40; return f.t <= 1.3; });
      for (let i = 0; i < 2; i++) { castAnim[i] = max(0, castAnim[i] - dt * 3); scoreBump[i] = max(0, scoreBump[i] - dt * 3); if (mood[i].t > 0 && (mood[i].t -= dt) <= 0) mood[i].m = ''; if (flights[i] && (flights[i].t += dt) > .9) flights[i] = null; }
      for (let k = 0; k < 3; k++) goalBump[k] = max(0, goalBump[k] - dt * 2.5);
      coinBump = max(0, coinBump - dt * 4);
      for (let i = flyers.length - 1; i >= 0; i--) if ((flyers[i].t += dt * 1.6) >= 1) { coinShown = min(save.coins, coinShown + flyers[i].v); coinBump = 1; J.coin(1 + (flyers.length % 5)); flyers.splice(i, 1); }
      if (!flyers.length && !card) coinShown = save.coins;
      for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) { const fn = timers.splice(i, 1)[0].fn; if (screen === 'play' && solo()) fn(); }
      if (banner && (banner.t += dt) > 3.2) banner = null;
      if (fx.list.length > 260) fx.list.splice(0, fx.list.length - 260);
    }
    ptr.moved = 0; Kit.keys.endFrame();
  }

  const BAR = [{ x: 66, y: 262, h: 390, w: 62 }, { x: 1214, y: 262, h: 390, w: 62 }];
  function drawWorld(ctx, w, menu) {
    const P0 = w.P, st = calm(), top = P0.surface;
    drawBk(ctx, w.place, ps(), time, st);
    w.junk.forEach(j => j.kind && !j.taken && junkIcon(ctx, j.kind, j.x, j.y - (j.float ? 8 : 18) + (st ? 0 : sin(time * 2 + j.x) * (j.float ? 4 : 1.5)), j.float ? .62 : .72));
    const tgt = coach.target && ghost.on ? LL.fishById(w, coach.target) : null;
    if (tgt) { const r = LL.spOf(tgt).len * tgt.size * .75; E(ctx, tgt.x, tgt.y, r, r * .7, 0, 6, 'rgba(255,214,60,.9)'); }
    w.fish.forEach(f => {
      const s = LL.spOf(f), k = f.size, fast = f.state === 'flee' || f.state === 'hooked' ? 1 : f.state === 'approach' ? .5 : 0;
      if (s.glow || s.rarity === 3) { const gs = s.len * k * 1.7; ctx.globalAlpha = (P0.night ? .75 : .5) * (st ? .8 : .65 + .35 * sin(time * 3 + f.ph)); di(ctx, glow(s.glow || '#fff'), f.x - gs / 2, f.y - gs / 2, gs, gs); ctx.globalAlpha = 1; }
      species(ctx, s, f.x, f.y, f.dir, k, time, st, f.ph, fast, f.state === 'hooked' ? sin(time * 14) * .25 : f.wig ? sin(time * 22) * .2 * f.wig : 0);
    });
    w.players.forEach(p => { if ('sink,wait,bite'.includes(p.state)) { P(ctx, [p.bob.x, top + 6, p.hook.x, p.hook.y - 8], 0, 1.6, 'rgba(255,255,255,.7)', 1); sv(ctx, () => { ctx.translate(p.hook.x, p.hook.y - 10); ctx.rotate(st ? 0 : sin(time * 6) * .18); P(ctx, [0, 0, 0, 14], 0, 4, INK, 1); C(ctx, -6, 14, 6, 0, 4, INK, 0, PI); Q(ctx, [-2, 8, 8, 16, 4, 24], 0, 6, '#ff8fb0', 1); }); } });
    front(ctx, w.place, time, st);
    w.players.forEach(p => drawPlr(ctx, w, p, COLS[p.i], mood[p.i].m || (p.state === 'bite' ? 'bite' : ''), castAnim[p.i], time, st));
    w.fish.forEach(f => f.state === 'notice' && drawMk(ctx, f.x, f.y - LL.spOf(f).len * f.size * .45 - 30, '؟', .9));
    w.players.forEach(p => {
      const f = p.fish && LL.fishById(w, p.fish), col = p.i ? P2 : P1, lbl = solo() ? '' : String(p.i + 1);
      if (p.state === 'bite') { const k = 1 + (st ? 0 : max(0, .3 - p.t) * 2 + sin(time * 14) * .05); drawMk(ctx, p.bob.x, top - 74, '!', k); if (!solo()) badge(ctx, p.bob.x + (p.i ? -44 : 44) * k, top - 108, lbl, col, 18 * k); }
      else if (f && f.state === 'nibble' && solo() && (w.tier <= 2 || !save.coach)) { R(ctx, p.bob.x - 36, top - 78, 72, 40, 20, '#fff', 4); for (let k = 0; k < 3; k++) C(ctx, p.bob.x - 16 + k * 16, top - 58, 5.5, '#4f7bff'); }
      if (!menu && !card && screen === 'play' && (solo() || (duo && duo.phase === 'go'))) {
        const atp = LL.aimTarget(w, p), faint = p.state === 'wait' && M.hypot(atp.x - p.hook.x, atp.y - p.hook.y) > 50;
        if (p.state === 'ready' || faint) sv(ctx, () => {
          const arc = LL.arcHeight(atp.x - p.rod.x), shf = st ? 0 : (time * 1.6) % 1; ctx.globalAlpha = faint ? .45 : 1;
          for (let k = 0; k < 10; k++) { const q = LL.arcPoint(p.rod, atp, top, arc, min(1, (k + shf) / 10)); C(ctx, q.x, q.y, 5, '#fff', 2.5, col); }
          for (let y = top + 18; y < atp.y - 20; y += 24) C(ctx, atp.x, y, 3, 'rgba(255,255,255,.85)');
          C(ctx, atp.x, atp.y, 24 + (st ? 0 : sin(time * 5) * 3), 0, 5, col); C(ctx, atp.x, atp.y, 7, col, 2.5); if (lbl) badge(ctx, atp.x + 30, atp.y - 30, lbl, col, 15);
        });
      }
      if (p.state === 'reel' && p.reel) {
        const b = solo() ? BAR[0] : BAR[p.i], r = p.reel, s = f ? LL.spOf(f) : null, jk = r.junk && p.junk ? p.junk.kind : (r.junk ? 'boot' : ''), fy = b.y + b.h * (1 - r.f), wob = st ? 0 : sin(time * 16) * 3, mx = b.x + (p.i ? -1 : 1) * (b.w / 2 + 30), mh = (b.h - 4) * r.meter;
        R(ctx, b.x - b.w / 2 - 8, b.y - 8, b.w + 16, b.h + 16, 22, col, 5); R(ctx, b.x - b.w / 2, b.y, b.w, b.h, 16, vg(ctx, ['#7fe3ff', '#163f80'], b.y, b.y + b.h), 4);
        R(ctx, b.x - b.w / 2 + 4, b.y + b.h * (1 - r.z - r.h), b.w - 8, b.h * r.h, 12, r.inZone ? 'rgba(120,255,160,.95)' : 'rgba(91,227,143,.75)', 4, r.inZone ? '#fff' : INK);
        jk ? junkIcon(ctx, jk, b.x + wob, fy + 6, .5) : species(ctx, s, b.x + wob, fy, sin(time * 3) > 0 ? 1 : -1, min(.9, (b.w + 10) / (s.len * 1.25)), time, st, 0, 1);
        R(ctx, mx - 16, b.y - 5, 32, b.h + 10, 14, '#fff', 4.5); R(ctx, mx - 11, b.y + b.h - 2 - mh, 22, max(6, mh), 9, r.meter > .66 ? '#5be38f' : r.meter > .33 ? '#ffd23f' : '#ff7a5a');
        stp(ctx, mx, b.y - 22, 16, 7, r.meter > .98 ? '#ffd23f' : '#fff', 3.5); if (lbl) badge(ctx, b.x, b.y + b.h + 34, lbl, col, 20);
        if (solo() && w.tier <= 2) { const zc = r.z + r.h / 2, ax = b.x + 125, ay = b.y + b.h * (1 - zc), dr = r.f > zc + .04 ? 1 : r.f < zc - .04 && !r.inZone ? -1 : 0; if (dr) sv(ctx, () => { ctx.translate(ax, ay - dr * 36); ctx.scale(.9, dr * .9); P(ctx, [0, -24, 20, 0, 8, 0, 8, 22, -8, 22, -8, 0, -20, 0], dr > 0 ? '#5be38f' : '#fff', 4); }); }
      }
    });
    flights.forEach((fl, i) => { if (!fl) return; const k = min(1, fl.t / .8), sx = i ? 1092 : 236, x = fl.x + (sx - fl.x) * k, y = fl.y + (top - 120 - fl.y) * k - sin(k * PI) * 150; fl.c.junk ? junkIcon(ctx, fl.c.id, x, y, .8) : species(ctx, LL.SPECIES[fl.c.sp], x, y, i ? 1 : -1, 1, time, st, 0, 1, st ? 0 : k * TAU); });
    fx.draw(ctx);
    rings.forEach(r => { const k = r.t / r.life, rad = st ? r.r * .8 : r.r * (.3 + k); E(ctx, r.x, r.y, rad, rad * .28, 0, 4, `rgba(${r.col},${(1 - k).toFixed(2)})`); });
    floats.forEach(f => { ctx.globalAlpha = max(0, 1 - max(0, f.t - .8) / .5); ct(ctx, f.text, f.x, f.y, f.size, f.color); });
    ctx.globalAlpha = 1;
  }
  function drawHud(ctx) {
    if (solo()) {
      const P0 = LL.PLACES[place], G = P0.goals, st0 = save.places[place], s = LL.byId[G.sp], p0 = world.players[0];
      for (let k = 0; k < 3; k++) T(ctx, 435 + (2 - k) * 212, 42, 1 + (goalBump[k] || 0) * .25, () => {
        const done = st0.g[k];
        R(ctx, -96, -24, 192, 56, 28, 'rgba(28,34,80,.28)');
        R(ctx, -96, -28, 192, 56, 28, done ? '#fff3b8' : 'rgba(255,255,255,.94)', 4);
        if (k === 0) { species(ctx, LL.SPECIES[P0.species[0]], 52, 0, -1, .76, 0, 1); ct(ctx, `صيد ${min(st0.n, G.n)}/${G.n}`, -24, 1, 22, INK, 0); }
        else if (k === 1) { species(ctx, s, 54, 0, -1, min(.68, 62 / (s.len * 1.25)), 0, 1, 0, 0, 0, !save.book[s.id]); ct(ctx, s.name, -34, 1, s.name.length > 9 ? 16 : 19, INK, 0); }
        else { ct(ctx, `وزن ${LL.weightText(G.w).replace('.0', '')} كغ`, 0, 1, 22, INK, 0); }
        stp(ctx, -84, -20, 16, 7.5, done ? '#ffd23f' : '#d6dbee', 3.5);
      });
      if (!card && p0.casts === 0 && p0.state === 'ready') { const by = P0.surface - 52 + (calm() ? 0 : sin(time * 4) * 3); R(ctx, 515, by - 22, 250, 44, 22, 'rgba(28,34,80,.82)', 3.5, '#fff'); ct(ctx, 'اضغط في الماء للرمي!', 640, by + 1, 21, '#ffd23f', 0); }
      T(ctx, 1212, 42, 1 + coinBump * .2, () => { const t = String(M.round(coinShown)), w = 70 + t.length * 16; R(ctx, -w, -26, w, 52, 26, 'rgba(28,34,80,.82)', 4, '#fff'); coin(ctx, -w + 28, 0, 16); ct(ctx, t, -w + 52, 2, 28, '#fff', 0, 'left'); });
      flyers.forEach(f => { if (f.t >= 0) { const k = f.t, e = 1 - (1 - k) * (1 - k); coin(ctx, f.x + (1160 - f.x) * e, f.y + (42 - f.y) * e - sin(k * PI) * 80, 14); } });
      if (banner) { R(ctx, 400, 250, 480, 100, 50, '#ff5d9e', 6); ct(ctx, 'مكان جديد!', 700, 302, 48); badge(ctx, 470, 300, String(banner.place + 1), '#4fd1ff', 30); }
    } else if (duo) {
      const left = M.ceil(world.left), red = left <= 10 && duo.phase === 'go';
      R(ctx, 572, 12, 136, 64, 32, red ? '#ff5d6c' : '#fff', 5); ct(ctx, `${M.floor(left / 60)}:${left % 60 < 10 ? '0' : ''}${left % 60}`, 640, 46, 40, red ? '#fff' : INK, 0);
      world.players.forEach((p, i) => { const col = i ? P2 : P1; R(ctx, i ? 720 : 360, 14, 200, 60, 30, 'rgba(255,255,255,.94)', 5, col); badge(ctx, i ? 746 : 386, 44, String(i + 1), col, 22); ct(ctx, LL.weightText(p.total) + ' كغ', i ? 836 : 476, 46, 30, INK, 0); });
      if (duo.phase === 'count') { const n = max(0, 3 - M.floor(duo.t)); ct(ctx, n ? String(n) : 'انطلق!', 640, 330, 130, '#ffd23f', 16); }
    }
  }
  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = 0; const ctx = view.ctx; ctx.save(); ctx.translate(shake.x, shake.y);
    if ((screen === 'play' || screen === 'pause') && world) { drawWorld(ctx, world); drawHud(ctx); if (card && card.open && screen === 'play') drawCardArt(); }
    else if ((screen === 'result' || screen === 'duoEnd') && world) { drawWorld(ctx, world); fr(ctx, 'rgba(28,34,80,.35)', 0, 0, W, H); fx.draw(ctx); }
    else { drawWorld(ctx, menuW, 1); if (screen === 'book') drawBook(ctx, save); else if (screen === 'map' || screen === 'rods') fr(ctx, 'rgba(16,30,70,.35)', 0, 0, W, H); }
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => { cache = {}; bgs = {}; thumbsOk = 0; dirty = 1; });
  const r1 = v => M.round(v * 10) / 10, pSt = p => !p ? null : { state: p.state, casts: p.casts, aim: { x: r1(p.aim.x), y: r1(p.aim.y) }, hook: { x: r1(p.hook.x), y: r1(p.hook.y) }, fish: p.fish, catches: p.catches.length, total: p.total, reel: p.reel ? { z: r1(p.reel.z * 100) / 100, h: p.reel.h, f: r1(p.reel.f * 100) / 100, meter: r1(p.reel.meter * 100) / 100, inZone: p.reel.inZone } : null };
  window.__game = {
    get state() { const w = world; return { screen, mode, paused: screen === 'pause', place, tier: w ? w.tier : 0, time: w ? M.round(w.t * 1e3) / 1e3 : 0, card: !!(card && card.open), p1: w ? pSt(w.players[0]) : null, p2: w ? pSt(w.players[1]) : null, fish: w ? w.fish.map(f => ({ id: f.id, sp: LL.SPECIES[f.sp].id, x: r1(f.x), y: r1(f.y), state: f.state })) : [], trip: trip.catches.length, tripOpen: trip.open, coins: save.coins, left: w && w.duo ? M.round(w.left * 100) / 100 : 0, duo: duo ? duo.phase : '', winner: duoEnd ? duoEnd.win : -1, ghost: ghost.on, shake: shake.power, result: !!resData && screen === 'result' }; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    point: (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; }
  };

  Kit.muteButton();
  Kit.lifecycle({ pause: () => { flushSave(); pause(0); }, reset: () => { ptr.down = pressQ = 0; } });
  toTitle(); Kit.loop(update, render); Kit.ready();
})();

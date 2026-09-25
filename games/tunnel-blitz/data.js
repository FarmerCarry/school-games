/* Tunnel Blitz — content tables (zones, ships, tunnel styles, missions) and ship art. */
(function () {
  'use strict';
  var TB = window.TB = {};

  // One entry per zone. After zone 8 the list loops with higher speed.
  // col = main neon, alt = second neon (bars / spirals), bg = far background, N = tunnel sides.
  TB.ZDEF = [
    { name: 'الاندفاع السماوي', col: [25, 235, 255],  alt: [60, 130, 255],  bg: [4, 14, 34],  N: 6,  key: 0 },
    { name: 'المتاهة الوردية', col: [255, 70, 230],  alt: [160, 90, 255],  bg: [28, 4, 36],  N: 8,  key: 3 },
    { name: 'البرق الأخضر', col: [150, 255, 60],  alt: [30, 230, 160],  bg: [6, 26, 10], N: 12, key: 5 },
    { name: 'العاصفة الشمسية', col: [255, 160, 40],  alt: [255, 80, 60],   bg: [34, 13, 3],  N: 6,  key: -2 },
    { name: 'الدوامة البنفسجية', col: [175, 125, 255], alt: [255, 100, 215], bg: [15, 7, 40],  N: 10, key: 2 },
    { name: 'اندفاع الياقوت', col: [255, 70, 120],  alt: [255, 180, 50],  bg: [36, 5, 18],  N: 7,  key: 7 },
    { name: 'آلة النعناع', col: [60, 255, 195],  alt: [70, 175, 255],  bg: [3, 28, 24],  N: 16, key: 4 },
    { name: 'قوس قزح الخارق', col: [255, 255, 255], alt: [255, 225, 60],  bg: [18, 11, 38], N: 8,  key: 0, rainbow: true }
  ];

  // Ship skins. shape picks the drawing function below.
  TB.SHIPS = [
    { id: 'blitz',  name: 'البرق',          price: 0,    shape: 'dart',   body: '#ffffff', trim: '#19e6ff', dark: '#0d3b66', flame: ['#ffffff', '#19e6ff'] },
    { id: 'bubble', name: 'الفقاعة',        price: 80,   shape: 'pod',    body: '#ff7ad9', trim: '#ffffff', dark: '#6b1457', flame: ['#ffffff', '#ff5ad0'] },
    { id: 'manta',  name: 'جناح البحر',     price: 180,  shape: 'manta',  body: '#3a6bff', trim: '#8ff4ff', dark: '#10205e', flame: ['#e8fdff', '#39b8ff'] },
    { id: 'bee',    name: 'النحلة الطنانة', price: 300,  shape: 'bee',    body: '#ffd23f', trim: '#2a2230', dark: '#2a2230', flame: ['#fffbe0', '#ffb81a'] },
    { id: 'saucer', name: 'الصحن الفضائي',  price: 450,  shape: 'saucer', body: '#aab6d6', trim: '#7dff3a', dark: '#39425e', flame: ['#f2ffe0', '#7dff3a'] },
    { id: 'rocket', name: 'الصاروخ الأحمر', price: 650,  shape: 'rocket', body: '#ff4a4a', trim: '#ffffff', dark: '#6b0f16', flame: ['#fff6c0', '#ff7a1f'] },
    { id: 'shark',  name: 'قرش السماء',     price: 900,  shape: 'shark',  body: '#5aa9d6', trim: '#ffffff', dark: '#1d4a66', flame: ['#e8fdff', '#5ad6ff'] },
    { id: 'star',   name: 'النجمة السعيدة', price: 1200, shape: 'star',   body: '#ffdd33', trim: '#ff8a00', dark: '#8a4a00', flame: ['#ffffff', '#ffdd33'] },
    { id: 'prism',  name: 'قوس قزح',        price: 1700, shape: 'dart',   body: '#ffffff', trim: '#ffffff', dark: '#222244', flame: ['#ffffff', '#ff5ad0'], rainbow: true },
    { id: 'gold',   name: 'الجناح الذهبي',  price: 2500, shape: 'wing',   body: '#ffcf3f', trim: '#fff6c0', dark: '#7a4a00', flame: ['#ffffff', '#ffcf3f'] }
  ];

  TB.TUNNELS = [
    { id: 'grid',    name: 'شبكة النيون',     price: 0 },
    { id: 'stripes', name: 'خطوط السرعة',     price: 120 },
    { id: 'stars',   name: 'غبار النجوم',     price: 280 },
    { id: 'checker', name: 'المربعات',        price: 500 },
    { id: 'rainbow', name: 'حلقات قوس قزح',   price: 800 },
    { id: 'pulse',   name: 'نبض الإيقاع',     price: 1200 },
    { id: 'lava',    name: 'مصباح الحمم',     price: 1600 },
    { id: 'zebra',   name: 'الحمار الوحشي',   price: 2000 },
    { id: 'candy',   name: 'دوامة الحلوى',    price: 2600 },
    { id: 'galaxy',  name: 'المجرة',          price: 3500 }
  ];

  // Missions are done in order; the first three unfinished ones are active.
  // t: dist (m in one run), zone (reach), orbsRun, closeRun, combo (CLOSE! streak),
  //    shield (grab in one run), runs (total), orbsTotal, closeTotal
  TB.MISSIONS = [
    { t: 'dist', n: 200, r: 15 },
    { t: 'orbsRun', n: 8, r: 15 },
    { t: 'closeRun', n: 2, r: 20 },
    { t: 'zone', n: 2, r: 25 },
    { t: 'runs', n: 3, r: 20 },
    { t: 'dist', n: 500, r: 30 },
    { t: 'combo', n: 3, r: 30 },
    { t: 'orbsRun', n: 20, r: 30 },
    { t: 'zone', n: 3, r: 40 },
    { t: 'shield', n: 1, r: 30 },
    { t: 'dist', n: 900, r: 50 },
    { t: 'closeRun', n: 8, r: 50 },
    { t: 'orbsTotal', n: 300, r: 60 },
    { t: 'zone', n: 4, r: 70 },
    { t: 'runs', n: 15, r: 50 },
    { t: 'orbsRun', n: 40, r: 70 },
    { t: 'dist', n: 1500, r: 90 },
    { t: 'combo', n: 5, r: 90 },
    { t: 'zone', n: 5, r: 110 },
    { t: 'closeTotal', n: 100, r: 100 },
    { t: 'dist', n: 2200, r: 150 },
    { t: 'zone', n: 6, r: 150 },
    { t: 'orbsRun', n: 70, r: 150 },
    { t: 'closeRun', n: 20, r: 150 },
    { t: 'zone', n: 7, r: 200 },
    { t: 'orbsTotal', n: 2000, r: 200 },
    { t: 'dist', n: 3200, r: 250 },
    { t: 'zone', n: 8, r: 300 },
    { t: 'combo', n: 10, r: 300 },
    { t: 'zone', n: 9, r: 500 }
  ];

  // Mission descriptions (Arabic). Numbers stay as Western digits.
  function num(n) { return n.toLocaleString('en-US'); }
  // Arabic counted nouns: 1 -> singular + "واحدة", 2 -> dual (no digit), 3-10 -> plural, 11+ -> singular.
  // forms = [one, two, few, many]
  TB.count = function (n, forms) {
    if (n === 1) return forms[0];
    if (n === 2) return forms[1];
    var r = n % 100;
    return num(n) + ' ' + (r >= 3 && r <= 10 ? forms[2] : forms[3]);
  };
  var ORBS = ['كرة ضوء واحدة', 'كرتَي ضوء', 'كرات ضوء', 'كرة ضوء'];
  var TIMES = ['مرة واحدة', 'مرتين', 'مرات', 'مرة'];
  var RUNS = ['جولة واحدة', 'جولتين', 'جولات', 'جولة'];
  TB.ORB_FORMS = ORBS;
  TB.missionText = function (m) {
    switch (m.t) {
      case 'dist': return 'اقطع ' + num(m.n) + ' م في جولة واحدة';
      case 'zone': return 'صِل إلى المنطقة ' + m.n;
      case 'orbsRun': return 'اجمع ' + TB.count(m.n, ORBS) + ' في جولة واحدة';
      case 'closeRun': return 'مُرّ على الحافة ' + TB.count(m.n, TIMES) + ' في جولة واحدة';
      case 'combo': return 'مُرّ على الحافة ' + TB.count(m.n, TIMES) + ' متتالية';
      case 'shield': return 'التقط فقاعة الدرع';
      case 'runs': return 'العب ' + TB.count(m.n, RUNS);
      case 'orbsTotal': return 'اجمع ' + TB.count(m.n, ORBS) + ' بالمجموع';
      case 'closeTotal': return 'مُرّ على الحافة ' + TB.count(m.n, TIMES) + ' بالمجموع';
    }
    return '';
  };

  /* ------------------------------------------------------------ ship art */
  // Draws a ship centred on (0,0), nose pointing up (-y), about 2 units wide.
  // Caller sets the transform (translate/rotate/scale). t = time in seconds.
  function hsl(h, s, l) { return 'hsl(' + (h % 360) + ',' + s + '%,' + l + '%)'; }

  function bodyFill(g, skin, t) {
    if (!skin.rainbow) return skin.body;
    var gr = g.createLinearGradient(-1, -1, 1, 1);
    var h = t * 120;
    gr.addColorStop(0, hsl(h, 100, 65));
    gr.addColorStop(0.33, hsl(h + 90, 100, 65));
    gr.addColorStop(0.66, hsl(h + 180, 100, 65));
    gr.addColorStop(1, hsl(h + 270, 100, 65));
    return gr;
  }

  function glass(g, x, y, rx, ry) {
    g.fillStyle = '#152044';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160, 235, 255, 0.85)';
    g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.3, -0.4, 0, Math.PI * 2); g.fill();
  }

  function flame(g, x, y, w, len, skin, t) {
    var f = len * (0.85 + 0.3 * Math.abs(Math.sin(t * 37 + x * 9)));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = skin.rainbow ? hsl(t * 200, 100, 60) : skin.flame[1];
    g.globalAlpha = 0.75;
    g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y + f * 2, x + w, y); g.fill();
    g.fillStyle = skin.flame[0];
    g.globalAlpha = 0.95;
    g.beginPath(); g.moveTo(x - w * 0.5, y); g.quadraticCurveTo(x, y + f * 1.1, x + w * 0.5, y); g.fill();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  var SHAPES = {
    dart: function (g, s, t, fl) {
      flame(g, -0.32, 0.42, 0.16, fl, s, t); flame(g, 0.32, 0.42, 0.16, fl, s, t);
      g.beginPath();
      g.moveTo(0, -1.08); g.lineTo(0.3, -0.25); g.lineTo(1.02, 0.42); g.lineTo(0.96, 0.62); g.lineTo(0.32, 0.44);
      g.lineTo(0, 0.58); g.lineTo(-0.32, 0.44); g.lineTo(-0.96, 0.62); g.lineTo(-1.02, 0.42); g.lineTo(-0.3, -0.25); g.closePath();
      g.fillStyle = bodyFill(g, s, t); g.fill();
      g.lineWidth = 0.1; g.strokeStyle = s.dark; g.lineJoin = 'round'; g.stroke();
      g.strokeStyle = s.rainbow ? '#ffffff' : s.trim; g.lineWidth = 0.13; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0.38, 0.06); g.lineTo(0.86, 0.46); g.moveTo(-0.38, 0.06); g.lineTo(-0.86, 0.46); g.stroke();
      glass(g, 0, -0.2, 0.19, 0.36);
    },
    pod: function (g, s, t, fl) {
      flame(g, 0, 0.58, 0.26, fl, s, t);
      g.fillStyle = s.trim; g.strokeStyle = s.dark; g.lineWidth = 0.09;
      g.beginPath(); g.ellipse(-0.78, 0.25, 0.28, 0.16, -0.5, 0, 6.29); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(0.78, 0.25, 0.28, 0.16, 0.5, 0, 6.29); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 0, 0.74, 0, 6.29); g.fillStyle = bodyFill(g, s, t); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath(); g.ellipse(-0.3, -0.35, 0.22, 0.12, -0.6, 0, 6.29); g.fill();
      glass(g, 0, -0.08, 0.44, 0.28);
      g.strokeStyle = s.dark; g.lineWidth = 0.07;
      g.beginPath(); g.moveTo(0, -0.72); g.lineTo(0.12, -1.0); g.stroke();
      g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(0.12, -1.02, 0.1, 0, 6.29); g.fill();
    },
    manta: function (g, s, t, fl) {
      flame(g, 0, 0.42, 0.2, fl, s, t);
      var flap = Math.sin(t * 6) * 0.08;
      g.beginPath();
      g.moveTo(0, -0.72);
      g.quadraticCurveTo(0.62, -0.55, 1.18, 0.3 + flap);
      g.quadraticCurveTo(0.62, 0.18, 0.26, 0.5);
      g.lineTo(0, 0.38); g.lineTo(-0.26, 0.5);
      g.quadraticCurveTo(-0.62, 0.18, -1.18, 0.3 + flap);
      g.quadraticCurveTo(-0.62, -0.55, 0, -0.72);
      g.fillStyle = bodyFill(g, s, t); g.fill();
      g.strokeStyle = s.dark; g.lineWidth = 0.09; g.stroke();
      g.strokeStyle = s.trim; g.lineWidth = 0.1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0.4); g.quadraticCurveTo(0.08, 0.75, -0.05, 1.0); g.stroke();
      g.fillStyle = s.trim;
      g.beginPath(); g.arc(0.5, -0.05, 0.1, 0, 6.29); g.arc(-0.5, -0.05, 0.1, 0, 6.29); g.fill();
      glass(g, 0, -0.25, 0.16, 0.26);
    },
    bee: function (g, s, t, fl) {
      flame(g, 0, 0.66, 0.18, fl, s, t);
      var fw = 0.55 + 0.45 * Math.abs(Math.sin(t * 38));
      g.fillStyle = 'rgba(220, 245, 255, 0.75)'; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.05;
      g.beginPath(); g.ellipse(-0.6, -0.3, 0.5, 0.26 * fw, -0.5, 0, 6.29); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(0.6, -0.3, 0.5, 0.26 * fw, 0.5, 0, 6.29); g.fill(); g.stroke();
      g.save();
      g.beginPath(); g.ellipse(0, 0.05, 0.56, 0.7, 0, 0, 6.29);
      g.fillStyle = s.body; g.fill();
      g.clip();
      g.fillStyle = s.trim;
      g.fillRect(-1, -0.18, 2, 0.18); g.fillRect(-1, 0.2, 2, 0.18);
      g.restore();
      g.strokeStyle = s.dark; g.lineWidth = 0.09;
      g.beginPath(); g.ellipse(0, 0.05, 0.56, 0.7, 0, 0, 6.29); g.stroke();
      g.lineWidth = 0.06;
      g.beginPath(); g.moveTo(-0.15, -0.6); g.quadraticCurveTo(-0.3, -0.9, -0.42, -0.98); g.moveTo(0.15, -0.6); g.quadraticCurveTo(0.3, -0.9, 0.42, -0.98); g.stroke();
      g.fillStyle = s.dark;
      g.beginPath(); g.arc(-0.42, -0.98, 0.08, 0, 6.29); g.arc(0.42, -0.98, 0.08, 0, 6.29); g.fill();
    },
    saucer: function (g, s, t, fl) {
      flame(g, 0, 0.32, 0.3, fl * 0.7, s, t);
      g.fillStyle = 'rgba(150, 230, 255, 0.35)'; g.strokeStyle = 'rgba(200,245,255,0.9)'; g.lineWidth = 0.06;
      g.beginPath(); g.arc(0, -0.12, 0.48, Math.PI, 0); g.fill();
      // alien pal
      g.fillStyle = '#7dff3a';
      g.beginPath(); g.ellipse(0, -0.2, 0.26, 0.24, 0, 0, 6.29); g.fill();
      g.fillStyle = '#10200a';
      var blink = (t % 3) > 2.85 ? 0.2 : 1;
      g.beginPath(); g.ellipse(-0.1, -0.24, 0.06, 0.08 * blink, 0, 0, 6.29); g.ellipse(0.1, -0.24, 0.06, 0.08 * blink, 0, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(200,245,255,0.9)';
      g.beginPath(); g.arc(0, -0.12, 0.48, Math.PI, 0); g.stroke();
      g.beginPath(); g.ellipse(0, 0.02, 1.02, 0.34, 0, 0, 6.29);
      g.fillStyle = bodyFill(g, s, t); g.fill();
      g.strokeStyle = s.dark; g.lineWidth = 0.09; g.stroke();
      g.fillStyle = s.dark; g.beginPath(); g.ellipse(0, 0.12, 0.8, 0.12, 0, 0, 6.29); g.fill();
      for (var i = 0; i < 5; i++) {
        var on = Math.floor(t * 6 + i) % 2 === 0;
        g.fillStyle = on ? s.trim : '#ffe14a';
        g.beginPath(); g.arc(-0.64 + i * 0.32, 0.12, 0.08, 0, 6.29); g.fill();
      }
    },
    rocket: function (g, s, t, fl) {
      flame(g, 0, 0.5, 0.26, fl * 1.2, s, t);
      g.fillStyle = s.trim; g.strokeStyle = s.dark; g.lineWidth = 0.08;
      g.beginPath(); g.moveTo(-0.35, 0.05); g.lineTo(-0.78, 0.55); g.lineTo(-0.35, 0.42); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0.35, 0.05); g.lineTo(0.78, 0.55); g.lineTo(0.35, 0.42); g.closePath(); g.fill(); g.stroke();
      g.beginPath();
      g.moveTo(0, -1.08); g.quadraticCurveTo(0.56, -0.62, 0.42, 0.5); g.lineTo(-0.42, 0.5); g.quadraticCurveTo(-0.56, -0.62, 0, -1.08);
      g.fillStyle = bodyFill(g, s, t); g.fill(); g.stroke();
      g.fillStyle = s.trim;
      g.beginPath(); g.moveTo(0, -1.08); g.quadraticCurveTo(0.3, -0.85, 0.36, -0.66); g.lineTo(-0.36, -0.66); g.quadraticCurveTo(-0.3, -0.85, 0, -1.08); g.fill();
      g.beginPath(); g.arc(0, -0.18, 0.24, 0, 6.29); g.fillStyle = s.trim; g.fill();
      glass(g, 0, -0.18, 0.17, 0.17);
      g.fillStyle = s.dark; g.fillRect(-0.3, 0.36, 0.6, 0.14);
    },
    shark: function (g, s, t, fl) {
      flame(g, 0, 0.45, 0.22, fl, s, t);
      g.fillStyle = s.body; g.strokeStyle = s.dark; g.lineWidth = 0.08;
      g.beginPath(); g.moveTo(-0.5, 0.15); g.lineTo(-1.05, 0.5); g.lineTo(-0.45, 0.38); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0.5, 0.15); g.lineTo(1.05, 0.5); g.lineTo(0.45, 0.38); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-0.14, -0.2); g.quadraticCurveTo(0.02, -0.7, 0.05, -1.1); g.quadraticCurveTo(0.2, -0.6, 0.2, -0.2); g.closePath();
      g.fill(); g.stroke();
      g.beginPath(); g.ellipse(0, 0.1, 0.66, 0.42, 0, 0, 6.29); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.ellipse(0, 0.1, 0.66, 0.42, 0, 0, 6.29); g.clip();
      g.fillStyle = s.trim; g.beginPath(); g.ellipse(0, 0.42, 0.62, 0.3, 0, 0, 6.29); g.fill(); g.restore();
      g.strokeStyle = s.dark; g.lineWidth = 0.05;
      g.beginPath(); g.moveTo(-0.5, 0.05); g.lineTo(-0.44, 0.2); g.moveTo(-0.42, 0.0); g.lineTo(-0.36, 0.15); g.moveTo(0.5, 0.05); g.lineTo(0.44, 0.2); g.moveTo(0.42, 0.0); g.lineTo(0.36, 0.15); g.stroke();
    },
    star: function (g, s, t, fl) {
      flame(g, 0, 0.5, 0.24, fl, s, t);
      var r1 = 1.0, r2 = 0.48, a0 = -Math.PI / 2 + Math.sin(t * 3) * 0.12;
      g.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 ? r2 : r1, a = a0 + i * Math.PI / 5;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = s.body; g.fill();
      g.strokeStyle = s.trim; g.lineWidth = 0.12; g.lineJoin = 'round'; g.stroke();
      var blink = (t % 2.6) > 2.45 ? 0.15 : 1;
      g.fillStyle = '#3a2000';
      g.beginPath(); g.ellipse(-0.17, -0.06, 0.07, 0.12 * blink, 0, 0, 6.29); g.ellipse(0.17, -0.06, 0.07, 0.12 * blink, 0, 0, 6.29); g.fill();
      g.strokeStyle = '#3a2000'; g.lineWidth = 0.06; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0.08, 0.14, 0.3, Math.PI - 0.3); g.stroke();
      g.fillStyle = 'rgba(255, 110, 110, 0.6)';
      g.beginPath(); g.arc(-0.3, 0.1, 0.07, 0, 6.29); g.arc(0.3, 0.1, 0.07, 0, 6.29); g.fill();
    },
    wing: function (g, s, t, fl) {
      flame(g, -0.2, 0.5, 0.14, fl, s, t); flame(g, 0.2, 0.5, 0.14, fl, s, t);
      g.beginPath();
      g.moveTo(0, -1.12); g.lineTo(0.2, -0.42); g.lineTo(1.12, 0.22); g.lineTo(1.1, 0.42); g.lineTo(0.3, 0.3); g.lineTo(0.42, 0.62);
      g.lineTo(0, 0.52); g.lineTo(-0.42, 0.62); g.lineTo(-0.3, 0.3); g.lineTo(-1.1, 0.42); g.lineTo(-1.12, 0.22); g.lineTo(-0.2, -0.42); g.closePath();
      var gr = g.createLinearGradient(0, -1, 0, 0.6);
      gr.addColorStop(0, '#fff6c0'); gr.addColorStop(0.5, s.body); gr.addColorStop(1, '#e08a00');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = s.dark; g.lineWidth = 0.08; g.lineJoin = 'round'; g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.07;
      g.beginPath(); g.moveTo(0.3, -0.1); g.lineTo(1.0, 0.3); g.moveTo(-0.3, -0.1); g.lineTo(-1.0, 0.3); g.stroke();
      glass(g, 0, -0.3, 0.14, 0.3);
      // sparkle
      var sp = (t * 1.3) % 1;
      if (sp < 0.3) {
        var k = Math.sin(sp / 0.3 * Math.PI) * 0.22;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(0.7, 0.05 - k); g.lineTo(0.74, 0.05); g.lineTo(0.7, 0.05 + k); g.lineTo(0.66, 0.05); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(0.7 - k, 0.05); g.lineTo(0.7, 0.09); g.lineTo(0.7 + k, 0.05); g.lineTo(0.7, 0.01); g.closePath(); g.fill();
      }
    }
  };

  TB.drawShip = function (g, skin, t, flameLen) {
    (SHAPES[skin.shape] || SHAPES.dart)(g, skin, t, flameLen == null ? 0.35 : flameLen);
  };
})();

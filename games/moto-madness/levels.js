/*
 * Moto Madness — the 20 hand-built levels (4 worlds x 5).
 * Each level is drawn by a "pen" walking right: flat, hill, kicker, pit, loop, ...
 * (see Builder in engine.js). stars: [3-star time, 2-star time] in seconds.
 */
(function (root) {
  'use strict';
  var MM = root.MM = root.MM || {};

  MM.WORLDS = [
    { id: 'grass', name: 'المروج الخضراء', color: '#43c451' },
    { id: 'desert', name: 'الصحراء', color: '#ffa733' },
    { id: 'winter', name: 'بلاد الثلج', color: '#59c8ff' },
    { id: 'factory', name: 'مصنع الليل', color: '#a45cff' }
  ];

  MM.LEVELS = [
    /* ------------------------------------------------------------ GRASSLAND */
    { name: 'أول جولة', theme: 'grass', seed: 1, stars: [23, 35], build: function (b) {
      b.flat(220).sign('اضغط ↑ لتنطلق!', 160).flat(620)
        .hill(600, 60).flat(300)
        .sign('← أو → لإمالة الدراجة').flat(300)
        .hill(700, 120).flat(300)
        .bumps(3, 240, 24).flat(400)
        .checkpoint().flat(160)
        .sign('اقفز! واضغط ← في الهواء لتتشقلب').flat(420)
        .kicker(220, 80).flat(900)
        .to(500, 130).flat(300).crates([2, 1]).flat(260)
        .to(600, -130).flat(500)
        .hill(800, 150).flat(400)
        .checkpoint().flat(300)
        .sign('قفزة كبيرة! جرّب شقلبة خلفية').flat(300)
        .ramp(260, 70).landing(760, 260).flat(500)
        .bumps(4, 220, 28).flat(400)
        .kicker(220, 80).flat(700)
        .crates([3]).flat(300)
        .hill(900, 170).flat(400);
    } },
    { name: 'تلال القفز', theme: 'grass', seed: 2, stars: [28, 41], build: function (b) {
      b.flat(700).hill(800, 150).flat(400)
        .sign('اقفز فوق الأشواك!').flat(300)
        .kicker(220, 85).pit(240, 170).flat(500)
        .hill(600, 100).hill(600, 140).flat(500)
        .checkpoint().flat(100)
        .to(500, 120).flat(400).ramp(240, 80).landing(800, 300).flat(400)
        .logs(3, 150).flat(400)
        .kicker(240, 100).pit(300, 200).flat(500)
        .checkpoint().flat(100)
        .bumps(4, 220, 32).flat(300)
        .hill(1000, 240).flat(500)
        .crates([3, 2, 1]).flat(300)
        .to(400, 100).flat(300).ramp(200, 60).landing(700, 260).flat(500)
        .kicker(240, 90).pit(280, 200).flat(500)
        .hill(700, 120).flat(400);
    } },
    { name: 'مرج الفطر', theme: 'grass', seed: 3, stars: [29, 42], build: function (b) {
      b.flat(600).sign('انطّ على الفطر!').flat(300)
        .mushroom(1100).flat(160).slope(40, 220).flat(900)
        .to(500, -220).flat(500)
        .mushroom(1150).flat(60).pit(300, 200).flat(700)
        .checkpoint().flat(100)
        .hill(700, 120).flat(500).kicker(200, 80).flat(700)
        .mushroom(1250).flat(200).slope(40, 320).flat(900).crates([2, 1]).flat(200)
        .landing(900, 320).flat(500)
        .checkpoint().flat(200)
        .mushroom(1100).flat(900)
        .mushroom(1200).flat(60).pit(320, 220).flat(700)
        .hill(800, 150).flat(500)
        .kicker(220, 90).pit(260, 180).flat(600)
        .mushroom(1250).flat(900).crates([3, 2, 1]).flat(300);
    } },
    { name: 'حديقة الميزان', theme: 'grass', seed: 4, stars: [26, 38], build: function (b) {
      b.flat(600).sign('اعبر فوق الميزان الخشبي').flat(300)
        .seesaw(360).flat(600)
        .hill(600, 110).flat(400)
        .logs(4, 140).flat(400)
        .checkpoint().flat(100)
        .seesaw(400).flat(500)
        .kicker(220, 90).pit(260, 180).flat(500)
        .seesaw(380).flat(500)
        .to(500, 150).flat(400).ramp(260, 90).landing(900, 400).flat(500)
        .checkpoint().flat(200)
        .crates([4, 3, 2, 1]).flat(300)
        .bumps(3, 260, 40).flat(400)
        .seesaw(420).flat(400)
        .mushroom(1150).flat(150).slope(40, 260).flat(900)
        .landing(700, 260).flat(500)
        .logs(3, 160).flat(300)
        .seesaw(400).flat(500);
    } },
    { name: 'بحيرة اللفّات', theme: 'grass', seed: 5, stars: [27, 40], build: function (b) {
      b.flat(500).sign('تيربو! ثم لفّة كاملة!').flat(300)
        .boost(220).loop(170).flat(400)
        .hill(800, 160).flat(500)
        .kicker(240, 100).pit(320, 200).flat(500)
        .checkpoint().flat(200)
        .to(600, 200).flat(500)
        .ramp(280, 100).landing(1000, 480).flat(500)
        .logs(3, 160).flat(400)
        .checkpoint().flat(200)
        .seesaw(380).flat(500)
        .boost(220).loop(180).flat(300)
        .mushroom(1200).flat(150).slope(40, 300).flat(900).crates([2, 2]).flat(300)
        .landing(900, 300).flat(500)
        .boost(220).kicker(240, 100).pit(500, 240).flat(600)
        .hill(900, 200).flat(400);
    } },

    /* --------------------------------------------------------------- DESERT */
    { name: 'سباق الكثبان', theme: 'desert', seed: 6, stars: [33, 48], build: function (b) {
      b.flat(700).sign('كثبان كبيرة = قفزات عالية!').flat(200)
        .hill(900, 200).flat(200).hill(1000, 260).flat(500)
        .to(500, 150).flat(400).ramp(260, 90).landing(1100, 480).flat(500)
        .checkpoint().flat(100)
        .hill(800, 180).hill(800, 220).flat(500)
        .kicker(240, 100).pit(320, 200).flat(500)
        .bumps(4, 260, 40).flat(400)
        .checkpoint().flat(100)
        .to(700, 260).flat(400).ramp(300, 110).landing(1200, 560).flat(500)
        .hill(1000, 280).flat(500)
        .crates([3, 2, 1]).flat(400)
        .hill(900, 220).hill(900, 260).flat(500)
        .kicker(240, 100).pit(340, 200).flat(600);
    } },
    { name: 'قفزة الوادي', theme: 'desert', seed: 7, stars: [28, 41], build: function (b) {
      b.flat(700)
        .kicker(220, 90).pit(260, 220).flat(600)
        .to(500, 180).flat(500)
        .ramp(220, 70).pit(360, 300, -100).flat(700)
        .checkpoint().flat(100)
        .bumps(3, 240, 36).flat(300)
        .to(180, 70).flat(300).to(180, 70).flat(300).to(180, 70).flat(500)
        .ramp(260, 90).landing(1000, 480).flat(500)
        .checkpoint().flat(200)
        .kicker(240, 100).pit(340, 240).flat(600)
        .kicker(240, 100).pit(340, 240).flat(600)
        .mushroom(1200).flat(200).slope(40, 300).flat(900)
        .landing(800, 300).flat(500)
        .checkpoint().flat(200)
        .to(600, 200).flat(400).ramp(260, 100).pit(340, 320, -120).flat(600)
        .crates([3, 3]).flat(400);
    } },
    { name: 'الصخور المتدحرجة', theme: 'desert', seed: 8, stars: [23, 34], build: function (b) {
      b.flat(600).to(700, 250).flat(300)
        .sign('أوه لا… أسرع أسرع!').flat(300)
        .boulder(560, 420)
        .landing(1600, 700).flat(700)
        .kicker(220, 90).pit(260, 200).flat(500)
        .hill(500, 80).flat(300)
        .to(1200, -350).flat(400)
        .boulderStop().flat(400)
        .checkpoint().flat(200)
        .hill(700, 140).flat(500)
        .to(600, 300).flat(400)
        .checkpoint().flat(200)
        .boulder(600, 450)
        .landing(1400, 600).flat(300)
        .bumps(3, 240, 40).flat(200)
        .to(1000, -250).flat(400)
        .boulderStop().flat(400)
        .crates([3, 2, 1]).flat(500)
        .kicker(240, 100).pit(320, 220).flat(600);
    } },
    { name: 'الجسر المتهاوي', theme: 'desert', seed: 9, stars: [22, 34], build: function (b) {
      b.flat(600).sign('لا تتوقف! الجسر يسقط!').flat(300)
        .bridge(520, 7).flat(600)
        .hill(700, 140).flat(500)
        .kicker(220, 90).pit(280, 200).flat(500)
        .checkpoint().flat(200)
        .bridge(700, 9).flat(500)
        .to(500, 150).flat(300)
        .bridge(600, 8).flat(500)
        .checkpoint().flat(200)
        .ramp(260, 90).landing(1000, 400).flat(500)
        .bridge(800, 10).flat(500)
        .mushroom(1150).flat(150).slope(40, 260).flat(900)
        .landing(800, 260).flat(500)
        .bridge(600, 8).flat(300).bridge(600, 8).flat(600);
    } },
    { name: 'لفّة العقرب', theme: 'desert', seed: 10, stars: [24, 36], build: function (b) {
      b.flat(600).hill(800, 160).flat(400)
        .boost(220).loop(180).flat(400)
        .seesaw(400).flat(500)
        .checkpoint().flat(200)
        .bridge(600, 8).flat(500)
        .mushroom(1200).flat(200).slope(40, 320).flat(1000)
        .kicker(240, 100).pit(340, 200).flat(500)
        .landing(900, 320).flat(500)
        .checkpoint().flat(200)
        .boost(220).kicker(240, 100).pit(600, 240).flat(600)
        .hill(900, 220).flat(500)
        .boost(220).loop(170).flat(400)
        .crates([4, 3, 2, 1]).flat(400)
        .seesaw(420).flat(600);
    } },

    /* --------------------------------------------------------------- WINTER */
    { name: 'يوم الثلج', theme: 'winter', seed: 11, stars: [25, 37], build: function (b) {
      b.flat(600).sign('انتبه! الجليد زلق!').flat(300)
        .ice(600).hill(700, 120).flat(500)
        .kicker(220, 90).pit(260, 200).flat(500)
        .ice(400).to(600, 180).flat(500)
        .checkpoint().flat(200)
        .ramp(260, 90).landing(1000, 420).flat(500)
        .ice(300).hill(600, 100).ice(300)
        .bumps(3, 260, 40).flat(400)
        .checkpoint().flat(200)
        .seesaw(380).flat(500)
        .mushroom(1150).flat(150).slope(40, 260).flat(600).ice(400)
        .landing(900, 300).flat(500)
        .crates([3, 2, 1]).flat(400)
        .ice(500).kicker(240, 100).pit(320, 220).flat(600);
    } },
    { name: 'الشلال المتجمد', theme: 'winter', seed: 12, stars: [24, 35], build: function (b) {
      b.flat(700)
        .ramp(220, 60).drop(160).flat(700)
        .ramp(220, 60).drop(200).flat(700)
        .kicker(240, 100).pit(320, 220).flat(600)
        .checkpoint().flat(200)
        .to(800, 300).flat(400)
        .ramp(280, 100).landing(1200, 600).flat(500)
        .ice(500).flat(300)
        .checkpoint().flat(200)
        .to(190, 80).flat(300).to(190, 80).flat(300).to(190, 80).flat(500)
        .ramp(240, 70).drop(260).flat(1300)
        .kicker(240, 100).pit(360, 220, -120).flat(600)
        .bridge(600, 8).flat(500)
        .ramp(240, 70).drop(200).flat(600);
    } },
    { name: 'مصعد الجليد', theme: 'winter', seed: 13, stars: [32, 47], build: function (b) {
      b.flat(600).sign('قف على المصعد! ↓ للفرامل').flat(500)
        .lift(300, 300).flat(700)
        .landing(700, 200).flat(300)
        .checkpoint().flat(100)
        .sign('قف على المنصة لتعبر!').flat(300)
        .ferry(760, 300).flat(600)
        .checkpoint().flat(200)
        .hill(700, 140).flat(500)
        .lift(300, 340).flat(600)
        .kicker(240, 100).pit(320, 240).flat(500)
        .landing(800, 300).flat(500)
        .checkpoint().flat(200)
        .ferry(860, 300).flat(500)
        .ice(400).flat(200).mushroom(1150).flat(200).slope(40, 250).flat(900)
        .landing(800, 250).flat(500);
    } },
    { name: 'انهيار ثلجي!', theme: 'winter', seed: 14, stars: [20, 31], build: function (b) {
      b.flat(600).to(800, 320).flat(300)
        .sign('كرة ثلج! لا تتوقف!').flat(300)
        .boulder(560, 460, 70)
        .landing(1700, 760).flat(700)
        .kicker(220, 90).pit(260, 200).flat(400)
        .hill(500, 90).flat(200)
        .to(1300, -380).flat(300)
        .boulderStop().flat(400)
        .checkpoint().flat(200)
        .ice(400).to(700, 320).flat(300)
        .checkpoint().flat(200)
        .boulder(540, 480, 70)
        .landing(1500, 700).flat(400)
        .bridge(520, 7).flat(300)
        .to(1100, -300).flat(300)
        .boulderStop().flat(400)
        .crates([3, 2, 1]).flat(500)
        .kicker(240, 100).pit(320, 220).flat(600);
    } },
    { name: 'قمة اللفّتين', theme: 'winter', seed: 15, stars: [28, 41], build: function (b) {
      b.flat(600).hill(800, 150).flat(400)
        .boost(220).loop(170).flat(100).boost(220).loop(180).flat(400)
        .checkpoint().flat(200)
        .ice(400).flat(200).kicker(240, 100).pit(320, 220).flat(500)
        .to(700, 250).flat(400)
        .ramp(280, 100).landing(1200, 560).flat(500)
        .checkpoint().flat(200)
        .seesaw(400).flat(500)
        .lift(300, 300).flat(600)
        .bridge(600, 8).flat(500)
        .landing(900, 300).flat(500)
        .boost(220).loop(190).flat(400)
        .crates([4, 3, 2, 1]).flat(500);
    } },

    /* -------------------------------------------------------- NIGHT FACTORY */
    { name: 'جولة الليل', theme: 'factory', seed: 16, stars: [23, 34], build: function (b) {
      b.flat(600).sign('منصات التيربو = سرعة خارقة!').flat(300)
        .boost(220).kicker(240, 100).pit(560, 240).flat(600)
        .crates([3, 2, 1]).flat(300)
        .hill(700, 140).flat(500)
        .checkpoint().flat(200)
        .boost(220).ramp(260, 90).landing(1400, 560).flat(500)
        .to(190, 80).flat(300).to(190, 80).flat(600)
        .kicker(240, 100).pit(320, 200).flat(500)
        .checkpoint().flat(200)
        .boost(220).loop(180).flat(300)
        .crates([2, 2, 2]).flat(300)
        .landing(900, 260).flat(500)
        .boost(220).kicker(260, 110).pit(640, 260).flat(600)
        .hill(800, 160).flat(500);
    } },
    { name: 'ساحة المكابس', theme: 'factory', seed: 17, stars: [30, 43], build: function (b) {
      b.flat(600).sign('قف على المكبس! ↓ للفرامل').flat(400)
        .lift(300, 320).flat(700)
        .landing(700, 240).flat(300)
        .checkpoint().flat(100)
        .ferry(760, 300).flat(500)
        .checkpoint().flat(200)
        .kicker(240, 100).pit(320, 220).flat(500)
        .lift(300, 360).flat(500)
        .ferry(860, 300).flat(500)
        .landing(900, 300).flat(500)
        .checkpoint().flat(200)
        .boost(220).loop(180).flat(400)
        .seesaw(400).flat(500)
        .crates([3, 2, 1]).flat(400);
    } },
    { name: 'حُفر الشرر', theme: 'factory', seed: 18, stars: [24, 35], build: function (b) {
      b.flat(600)
        .kicker(220, 90).pit(280, 220).flat(500)
        .kicker(220, 90).pit(280, 220).flat(500)
        .seesaw(400).flat(500)
        .checkpoint().flat(200)
        .mushroom(1150).flat(60).pit(320, 220).flat(600)
        .boost(220).kicker(260, 100).pit(560, 240).flat(600)
        .seesaw(420).flat(400)
        .checkpoint().flat(200)
        .to(600, 200).flat(300).boost(220).ramp(260, 90).pit(500, 300, -200).flat(1400)
        .kicker(240, 100).pit(320, 220).flat(500)
        .mushroom(1200).flat(150).slope(40, 300).flat(900)
        .landing(900, 300).flat(500)
        .seesaw(400).flat(600);
    } },
    { name: 'محطّم الصناديق', theme: 'factory', seed: 19, stars: [18, 28], build: function (b) {
      b.flat(600).sign('حطّم الصناديق!').flat(200)
        .crates([4, 3, 2, 1]).flat(300)
        .bridge(600, 8).flat(400)
        .crates([3, 3, 3]).flat(300)
        .to(600, 240).flat(400)
        .checkpoint().flat(200)
        .boulder(600, 460, 62)
        .landing(1500, 620).flat(300)
        .crates([2, 2]).flat(200)
        .to(900, -220).flat(300)
        .boulderStop().flat(400)
        .checkpoint().flat(200)
        .bridge(700, 9).flat(500)
        .boost(220).kicker(260, 110).pit(600, 260).flat(600)
        .crates([5, 4, 3, 2, 1]).flat(400)
        .hill(800, 160).flat(500)
        .crates([3, 2, 1]).flat(300).crates([3, 2, 1]).flat(400);
    } },
    { name: 'جنون الدراجات', theme: 'factory', seed: 20, stars: [34, 49], build: function (b) {
      b.flat(600).sign('التحدي الأكبر!').flat(300)
        .boost(220).loop(180).flat(400)
        .kicker(240, 100).pit(320, 220).flat(500)
        .seesaw(400).flat(500)
        .checkpoint().flat(200)
        .bridge(700, 9).flat(500)
        .mushroom(1200).flat(150).slope(40, 300).flat(700)
        .lift(300, 300).flat(600)
        .landing(900, 500).flat(500)
        .checkpoint().flat(200)
        .to(600, 240).flat(700)
        .boulder(600, 480, 64)
        .landing(1500, 620).flat(400)
        .kicker(240, 100).pit(300, 200).flat(200)
        .to(900, -200).flat(300)
        .boulderStop().flat(300)
        .checkpoint().flat(200)
        .ferry(760, 300).flat(500)
        .boost(220).kicker(260, 110).pit(640, 260).flat(600)
        .boost(220).loop(190).flat(400)
        .crates([5, 4, 3, 2, 1]).flat(500);
    } }
  ];
})(typeof window !== 'undefined' ? window : globalThis);

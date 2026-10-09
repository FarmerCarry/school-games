/*
 * Sneaky Levels — worlds, levels and trap scripts.
 * Maps are painted with a tiny builder: room() gives a 32x18 box with the
 * ceiling in rows 0-2 and the floor in rows 13-17; f() fills a rectangle
 * (inclusive) with a map character, s() sets one tile. See engine.js legend.
 * A hint is a string, or a list of { before: column, text } entries picked by
 * where the player last died (the last entry has no `before`).
 */
(function (root) {
  'use strict';

  function room(ceil, floor) {
    ceil = ceil == null ? 3 : ceil; floor = floor == null ? 13 : floor;
    var g = [];
    for (var y = 0; y < 18; y++) {
      var r = [];
      for (var x = 0; x < 32; x++) r.push((y < ceil || y >= floor || x === 0 || x === 31) ? '#' : ' ');
      g.push(r);
    }
    var b = {
      f: function (x0, y0, x1, y1, ch) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g[y][x] = ch; return b; },
      s: function (x, y, ch) { g[y][x] = ch; return b; },
      done: function () { return g.map(function (r) { return r.join(''); }); }
    };
    return b;
  }
  // Common: a spike pit from col x0..x1 (rows 13-16 opened, spikes on row 16).
  function pit(b, x0, x1, noSpikes) {
    b.f(x0, 13, x1, 16, ' ');
    if (!noSpikes) b.f(x0, 16, x1, 16, '^');
    return b;
  }
  // A bottomless hole from col x0..x1.
  function hole(b, x0, x1) { return b.f(x0, 13, x1, 17, ' '); }
  // Moves a standing door to (tx, ty) without doorTo's giggle (a shuffle makes many moves).
  function slide(L, d, tx, ty, speed, then) {
    d.m = { tx: tx * L.T, ty: ty * L.T - 20, speed: speed * L.T, delay: 0, then: then || null };
  }
  // Doors d (at column xa) and e (at xb) on row 12 trade places in s seconds:
  // d hops over the top, e slides along the floor.
  function swapDoors(L, d, e, xa, xb, s) {
    var n = Math.abs(xb - xa), h = 2 * Math.sqrt(n * n / 4 + 9) / s;
    slide(L, e, xa, 12, n / s);
    slide(L, d, (xa + xb) / 2, 9, h, function () { slide(L, d, xb, 12, h); });
    L.sfx('whoosh');
  }
  // A spiky block in a wall flies across the room (and stays off screen). In flight
  // only its spikes are solid to you: a player who lands on it falls through, and
  // is not carried away.
  function shoot(L, ch, dx, speed) { L.g(ch).setFake().move(dx, 0, speed, 0.3); L.sfx('buzz'); }
  // Where a group's first tile is now, in tiles.
  function gx(L, g) { return g.tiles[0].x + g.ox / L.T; }

  var WORLDS = [
    { name: 'عالم البرتقال', theme: 'sun', bg: '#ffa41b', bg2: '#ffb443', ink: '#1c1226', ink2: '#3a2a44', accent: '#ffffff' },
    { name: 'عالم البحر', theme: 'sea', bg: '#3fe0c5', bg2: '#5deacf', ink: '#0f2350', ink2: '#26407a', accent: '#ffffff' },
    { name: 'عالم الحلوى', theme: 'candy', bg: '#ff8fc7', bg2: '#ffa6d3', ink: '#3b1a5c', ink2: '#5a3480', accent: '#ffffff' },
    { name: 'عالم الغابة', theme: 'forest', bg: '#c6f25a', bg2: '#d4f77c', ink: '#13402a', ink2: '#2a5e40', accent: '#ffffff' },
    { name: 'عالم الفضاء', theme: 'space', bg: '#9d8cff', bg2: '#ae9fff', ink: '#1b1446', ink2: '#382d70', accent: '#ffffff' }
  ];

  var L = [];

  /* ======================= WORLD 1 — orange ======================= */

  // 1-1: a spike pops up right before the door.
  L.push({
    name: 'مجرد ممر', hint: 'عندما يظهر الشوك، اقفز فوقه!',
    msg: 'مرحلة سهلة جدًا... أليس كذلك؟',
    map: room().s(2, 12, 'P').s(21, 12, '1').s(27, 12, 'D').done(),
    script: function (L) { L.onX(18.6, function () { L.sp(1).pop(); }); }
  });

  // 1-2: the floor is shy.
  L.push({
    name: 'الأرض خجولة', hint: 'اقفز فوق الجزء الخجول من الأرض.',
    map: room().f(13, 13, 15, 17, 'a').s(2, 12, 'P').s(27, 12, 'D').done(),
    script: function (L) {
      L.when(function () { return L.on('a'); }, function () { L.g('a').drop(0.05); });
    }
  });

  // 1-3: the door runs away, spikes pop on the way.
  L.push({
    name: 'الباب الهارب', hint: 'الباب يهرب إلى اليمين. انتبه للأشواك في الطريق!',
    map: room().s(2, 12, 'P').s(19, 12, 'D').f(23, 12, 24, 12, '1').done(),
    script: function (L) {
      L.onX(15, function () { L.doorTo(L.door, 28, 12, 14); L.msg('باي باي!'); });
      L.onX(21, function () { L.sp(1).pop(); });
    }
  });

  // 1-4: the ceiling is tired and sits down.
  L.push({
    name: 'السقف المتعب', hint: 'ادخل تحت السقف ثم ارجع بسرعة! بعدها اقفز فوقه.',
    map: room().f(1, 3, 30, 4, '#').f(12, 3, 17, 4, 'a').s(2, 12, 'P').s(27, 12, 'D').done(),
    script: function (L) {
      L.when(L.zone(12, 0, 18, 20), function () { L.g('a').drop(0.18, true); });
    }
  });

  // 1-5: a completely normal level. Really.
  L.push({
    name: 'مرحلة عادية جدًا', hint: 'لا يوجد فخ. حقًا!',
    msg: 'هذه مرحلة عادية تمامًا. ثق بي!',
    winMsg: 'رأيت؟ لم يكن هناك أي فخ!',
    map: (function () {
      var b = room();
      pit(b, 10, 21);
      b.f(13, 13, 14, 16, '#').f(18, 13, 19, 16, '#');
      return b.s(2, 12, 'P').s(27, 12, 'D').done();
    })()
  });

  // 1-6: a crumbling bridge, then a surprise spike.
  L.push({
    name: 'الجسر المنهار', hint: 'لا تتوقف على الجسر! وبعده اقفز فورًا.',
    map: (function () {
      var b = room();
      pit(b, 7, 23);
      b.f(7, 13, 23, 13, 'a');
      return b.s(2, 12, 'P').s(27, 12, '1').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      L.g('a').crumble(0.1);
      L.onX(24, function () { L.sp(1).pop(); });
    }
  });

  /* ======================= WORLD 2 — teal ======================= */

  // 2-1: the spring is a trap; the wall's bottom is fake.
  L.push({
    name: 'النطّاطة', hint: 'لا تلمس النطّاطة! أسفل الجدار ليس حقيقيًا...',
    map: (function () {
      var b = room();
      b.f(1, 3, 30, 4, '#').f(8, 5, 20, 5, '1');
      b.f(17, 5, 18, 12, '#').f(17, 12, 18, 12, '=');
      return b.s(13, 12, 'J').s(3, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      L.when(function () { return L.world.p.vy < -1000; }, function () { L.sp(1).pop(); });
    }
  });

  // 2-2: the closest door is a fake.
  L.push({
    name: 'الباب المزيف', hint: 'الباب القريب مزيف! اقفز فوقه واصعد الدرج.',
    map: (function () {
      var b = room();
      b.f(16, 11, 17, 12, '#').f(20, 9, 21, 12, '#').f(24, 7, 30, 12, '#');
      return b.s(2, 12, 'P').s(11, 12, 'E').s(28, 6, 'D').done();
    })()
  });

  // 2-3: fake floor, invisible bridge.
  L.push({
    name: 'الجسر الخفي', hint: 'ثق بالبريق! الجسر مخفي... وحافة الأرض مزيفة.',
    msg: 'لا يوجد جسر؟ هممم...',
    map: (function () {
      var b = room();
      pit(b, 9, 22);
      b.f(9, 13, 10, 13, '=').f(11, 13, 20, 13, '!');
      return b.s(2, 12, 'P').s(27, 12, 'D').done();
    })()
  });

  // 2-4: controls flip on the pillars.
  L.push({
    name: 'عكس التحكم', hint: 'عندما ينعكس التحكم، توقف وانتظر قليلًا.',
    map: (function () {
      var b = room();
      pit(b, 9, 24);
      b.f(12, 13, 13, 16, '#').f(16, 13, 18, 16, '#').f(22, 13, 23, 16, '#');
      return b.s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      L.when(function () { return L.grounded() && L.px() >= 12 && L.px() < 14; }, function () { L.reverse(2.5); });
      L.when(function () { return L.grounded() && L.px() >= 22 && L.px() < 24; }, function () { L.reverse(2.5); });
    }
  });

  // 2-5: the platform runs away when you jump.
  L.push({
    name: 'المنصة الخجولة', hint: 'اخدع المنصة بقفزة صغيرة أولًا، وانتظر عودتها!',
    map: (function () {
      var b = room();
      pit(b, 10, 18);
      b.f(13, 13, 15, 13, 'a');
      return b.s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      L.when(function () { return L.air() && L.px() >= 7.5 && L.px() < 12; }, function () {
        var a = L.g('a');
        a.move(3, 0, 18, 0, function () { a.move(-3, 0, 6, 1.1, function () { L.msg('عدتُ!'); }); });
        L.msg('هيهي!');
      });
    }
  });

  // 2-6: gravity flip.
  L.push({
    name: 'انقلاب', hint: 'امشِ على السقف! وعندما يظهر الشوك اقفز.',
    map: (function () {
      var b = room();
      b.f(8, 12, 23, 12, '^').f(6, 10, 6, 12, 'G').f(24, 3, 24, 5, 'G').f(15, 3, 16, 3, '1');
      return b.s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      L.when(function () { return L.world.gs < 0 && L.px() >= 12.6; }, function () { L.sp(1).pop(); });
    }
  });

  /* ======================= WORLD 3 — pink ======================= */

  // 3-1: a hungry saw chases you.
  L.push({
    name: 'المنشار الجائع', hint: 'لا تتوقف! المنشار أبطأ منك.',
    map: (function () {
      var b = room();
      b.f(11, 11, 11, 12, '#');
      pit(b, 16, 18);
      b.f(22, 11, 23, 12, '#');
      return b.s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      var s = L.saw({ x: -1, y: 9, mode: 'chase', speed: 5.6, active: false });
      L.onX(5, function () { L.wake(s); L.msg('هل سمعت شيئًا؟'); });
    }
  });

  // 3-2: the elevator goes all the way up. Jump off in time!
  L.push({
    name: 'المصعد', hint: 'اقفز من المصعد إلى الرف قبل أن يصل إلى الأشواك.',
    map: (function () {
      var b = room();
      b.f(24, 6, 30, 12, '#').f(20, 12, 22, 12, 'a').f(19, 3, 23, 3, 'v');
      return b.s(3, 12, 'P').s(28, 5, 'D').done();
    })(),
    script: function (L) {
      // The elevator rides up into the spikes, then comes back down (with a
      // warning shake) so a missed jump never leaves the player stuck below.
      var a = L.g('a');
      var arm = function () {
        L.when(function () { return L.on('a'); }, function () {
          L.sfx('elevator');
          a.move(0, -9, 3, 0.25, function () { a.move(0, 9, 4, 0.9, arm); });
        });
      };
      arm();
    }
  });

  // 3-3: blocks rain from the ceiling. Don't run into the last one!
  L.push({
    name: 'مطر الطوب', hint: 'بعد الطوبة الرابعة، توقف وانتظر الأخيرة ثم اقفز فوقها.',
    map: (function () {
      var b = room();
      b.f(7, 3, 8, 4, 'a').f(11, 3, 12, 4, 'b').f(15, 3, 16, 4, 'c').f(19, 3, 20, 4, 'd').f(25, 3, 26, 4, 'e');
      return b.s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      [['a', 6.5], ['b', 10.5], ['c', 14.5], ['d', 18.5], ['e', 21.6]].forEach(function (q) {
        L.onX(q[1], function () { L.g(q[0]).drop(0.12, true); });
      });
    }
  });

  // 3-4: pistons — the last one is lazy... until you walk under it.
  L.push({
    name: 'المكابس', hint: 'المكبس الأخير يسقط عندما تقترب منه. اقترب ببطء، ثم مُرّ تحته وهو يرتفع!',
    map: (function () {
      var b = room();
      b.f(8, 3, 9, 6, 'a').f(14, 3, 15, 6, 'b').f(21, 3, 22, 6, 'c');
      return b.s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      function cyc(ch, first) {
        var g = L.g(ch);
        var go = function () {
          g.move(0, 6, 16, 0.4, function () {
            L.sfx('slam'); L.shake(5);
            g.move(0, -6, 5, 0.3, function () { L.after(0.9, go); });
          });
        };
        L.after(first, go);
      }
      cyc('a', 0.6); cyc('b', 1.5);
      var c = L.g('c');
      var arm = function () {
        L.when(L.zone(19.2, 0, 23.6, 20), function () {
          c.move(0, 6, 24, 0.04, function () {
            L.sfx('slam'); L.shake(6);
            c.move(0, -6, 3, 0.8, arm);
          });
        });
      };
      arm();
    }
  });

  // 3-5: the shy door flies up — but only watches your feet.
  L.push({
    name: 'الباب الخجول', hint: 'الباب يطير عندما تمشي... لكن ماذا لو قفزت؟',
    map: room().s(2, 12, 'P').s(26, 12, 'D').s(23, 12, '1').done(),
    script: function (L) {
      var d = L.door, up = false, first = true;
      L.world.ticks.push(function () {
        var want = L.grounded() && L.px() > 19;
        if (want && !up) {
          up = true; L.doorTo(d, 26, 6, 14);
          if (first) { first = false; L.sp(1).pop(0.1); L.msg('لا تنظر إليّ!'); }
        } else if (!want && up) { up = false; L.doorTo(d, 26, 12, 22); }
      });
    }
  });

  // 3-6: everything at once.
  L.push({
    name: 'الفوضى', hint: 'اركض على الجسر، ثم الحق بالباب واقفز فوق الأشواك.',
    map: (function () {
      var b = room();
      hole(b, 7, 14);
      b.f(7, 13, 14, 13, 'a').f(18, 3, 19, 4, 'b');
      return b.s(2, 12, 'P').s(24, 12, 'D').s(27, 12, '1').done();
    })(),
    script: function (L) {
      L.g('a').crumble(0.12);
      var s = L.saw({ x: -1, y: 8, mode: 'chase', speed: 4.6, active: false });
      L.onX(4, function () { L.wake(s); });
      L.onX(17.3, function () { L.g('b').drop(0.1, true); });
      L.onX(21, function () { L.doorTo(L.door, 29, 12, 12); });
      L.onX(24.6, function () { L.sp(1).pop(); });
    }
  });

  /* ======================= WORLD 4 — lime ======================= */

  // 4-1: three doors, one is real. Look behind you!
  L.push({
    name: 'لا تثق بأحد', hint: 'هل نظرت خلفك؟',
    msg: 'ثلاثة أبواب... واحد فقط حقيقي!',
    map: room().s(1, 12, 'D').s(5, 12, 'P').s(10, 12, '1').s(14, 12, 'E').s(20, 12, '2').s(26, 12, 'E').done(),
    script: function (L) {
      L.onX(8.2, function () { L.sp(1).pop(); });
      L.onX(18.2, function () { L.sp(2).pop(); });
    }
  });

  // 4-2: ceiling walk with patrolling saws.
  L.push({
    name: 'المنشاران', hint: 'على السقف: اقفز فوق المنشار عندما يقترب.',
    map: (function () {
      var b = room();
      b.f(9, 12, 22, 12, '^').f(7, 10, 7, 12, 'G').f(25, 3, 25, 5, 'G');
      return b.s(2, 12, 'P').s(30, 12, 'D').done();
    })(),
    script: function (L) {
      L.saw({ x: 10, y: 3.6, mode: 'path', speed: 3, path: [[10, 3.6], [22, 3.6]], r: 26 });
      L.saw({ x: 27, y: 12.4, mode: 'path', speed: 2.2, path: [[27, 12.4], [29.2, 12.4]], r: 22 });
    }
  });

  // 4-3: gravity flips on its own.
  L.push({
    name: 'الجاذبية المجنونة', hint: 'الجاذبية تنقلب وحدها! قف عند حافة الأشواك وانتظر الانقلاب، ثم تحرك.',
    msg: 'انتبه... الغرفة تنقلب!',
    map: (function () {
      var b = room();
      b.f(13, 12, 19, 12, '^').f(4, 3, 11, 3, 'v').f(21, 3, 27, 3, 'v');
      return b.s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      L.every(2.4, function () { L.flip(); }, 2.4);
      L.world.flipWarn = 2.4;
    }
  });

  // 4-4: the floor follows you — keep running!
  L.push({
    name: 'الأرض تنهار', hint: 'لا تتوقف أبدًا! اقفز فوق الأشواك الصغيرة.',
    map: (function () {
      var b = room();
      hole(b, 5, 28);
      b.f(5, 13, 28, 13, 'a').s(12, 12, '^').s(21, 12, '^');
      return b.s(2, 12, 'P').s(30, 12, 'D').done();
    })(),
    script: function (L) {
      L.g('a').crumble(0.16);
      var s = L.saw({ x: -1, y: 9, mode: 'chase', speed: 4.4, active: false });
      L.onX(3.5, function () { L.wake(s); });
    }
  });

  // 4-5: the door goes back to the start.
  L.push({
    name: 'العودة',
    // Deaths left of column 11 are on the shy floor; later ones are about the door.
    hint: [{ before: 11, text: 'انتبه للأرض الخجولة في البداية: اقفز فوقها!' }, { text: 'الباب عاد إلى البداية! ارجع واقفز فوق الأشواك.' }],
    map: (function () {
      var b = room();
      b.f(8, 13, 9, 17, 'b');
      return b.s(2, 12, 'P').s(28, 12, 'D').s(19, 12, '1').s(12, 12, '2').done();
    })(),
    script: function (L) {
      L.when(function () { return L.on('b'); }, function () { L.g('b').drop(0.05); });
      L.onX(25.5, function () {
        var d = L.door;
        L.doorTo(d, 28, 5, 22, 0, function () {
          L.doorTo(d, 2, 5, 24, 0, function () { L.doorTo(d, 2, 12, 16); });
        });
        L.msg('نسيت شيئًا؟');
        L.sp(1).pop(0.2); L.sp(2).pop(0.2);
        L.g('b').hide();
        var s = L.saw({ x: 32, y: 8, mode: 'chase', speed: 3.6, active: false });
        L.after(0.7, function () { L.wake(s); });
      });
    }
  });

  // 4-6: the sneaky king — a bit of everything.
  L.push({
    name: 'الملك الماكر', hint: 'الباب الأول مزيف، النطّاطة فخ، الجسر ينهار، والتحكم ينعكس!',
    msg: 'المرحلة الأخيرة... أو هكذا تظن!',
    map: (function () {
      var b = room();
      b.f(1, 3, 30, 4, '#').f(10, 5, 15, 5, 'v');
      hole(b, 15, 20);
      b.f(15, 13, 20, 13, 'a');
      return b.s(2, 12, 'P').s(7, 12, 'E').s(12, 12, 'J').s(25, 12, '1').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      L.g('a').crumble(0.12);
      L.when(function () { return L.grounded() && L.px() >= 21 && L.px() < 23.5; }, function () { L.reverse(1.6); });
      L.onX(23.5, function () { L.sp(1).pop(); });
      L.onX(24.5, function () { L.doorTo(L.door, 30, 12, 10); L.msg('امسكني!'); });
    }
  });

  /* ======================= WORLD 5 — space ======================= */

  // 5-1: no way across... until you stand still at the edge for a moment.
  L.push({
    name: 'الصبر', hint: 'أحيانًا يكون الحل ألا تفعل شيئًا! قف عند الحافة ولا تتحرك.',
    msg: 'لا يوجد طريق... استسلم!',
    map: (function () {
      var b = room();
      pit(b, 8, 24);
      b.f(8, 13, 24, 13, 'a');
      return b.s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      var a = L.g('a'), still = 0;
      a.active = false;
      L.world.ticks.push(function () {
        if (a.active) return;
        // standing still near the edge for 1.5 s (90 steps) brings the bridge
        still = L.grounded() && Math.abs(L.world.p.vx) < 20 && L.px() > 5 ? still + 1 : 0;
        if (still > 90) { a.show(); L.world.reveal(a); L.msg('حسنًا... هذا جسر لصبرك!'); }
      });
    }
  });

  // 5-2: the shell game — two fake doors drop in and shuffle with the real one.
  L.push({
    name: 'لعبة الأبواب', hint: 'راقب الباب الحقيقي ولا ترمش! ثم اقفز فوق الأبواب المزيفة.',
    msg: 'باب واحد فقط؟ سهل!',
    map: room().s(2, 12, 'P').s(11, 12, 'E').s(16, 12, 'D').s(21, 12, 'E').done(),
    script: function (L) {
      var X = [11, 16, 21], at = [L.fakes[0], L.door, L.fakes[1]];
      var dropped = false;
      L.fakes.forEach(function (d) { d.y = -3 * L.T; }); // waiting above the screen
      L.onX(5, function () {
        dropped = true;
        L.msg('ثلاثة أبواب! أين الحقيقي؟');
        slide(L, L.fakes[0], 11, 12, 24); slide(L, L.fakes[1], 21, 12, 24);
      });
      // the shuffle waits for the 2.2 s level title card, so no swap hides behind it
      L.when(function () { return dropped && L.t() > 2.2; }, function () {
        [[1, 2], [0, 1], [2, 0], [1, 2], [0, 2]].forEach(function (q, k) {
          L.after(0.8 + k * 0.75, function () {
            var d = at[q[0]];
            swapDoors(L, d, at[q[1]], X[q[0]], X[q[1]], 0.6);
            at[q[0]] = at[q[1]]; at[q[1]] = d;
          });
        });
        L.after(4.6, function () { L.msg('اختر!'); });
      });
    }
  });

  // 5-3: moon gravity — a full jump floats you up into the ceiling spikes.
  L.push({
    name: 'القمر', hint: 'على القمر القفزة عالية جدًا! اضغط القفز ضغطة قصيرة.',
    map: (function () {
      var b = room();
      pit(b, 6, 7);
      b.f(12, 3, 30, 6, '#').f(14, 7, 18, 7, 'v').f(20, 7, 26, 7, 'v');
      pit(b, 15, 17); pit(b, 21, 25);
      return b.s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      L.onX(11, function () { L.gravity(0.4); L.msg('أهلًا بك على القمر!'); L.sfx('moon'); });
    }
  });

  // 5-4: the walls shoot spiky blocks — jump the low ones, stay down for the high one.
  // Then the door runs back to the start, and the left wall shoots too.
  L.push({
    name: 'الشوك الطائر', hint: 'المنخفضة: اقفز. العالية: لا تقفز! والباب يهرب... فارجع واقفز فوق الأخيرة.',
    msg: 'ما هذا الصوت في الجدار؟',
    map: room().s(30, 12, 'a').s(29, 12, '<').s(30, 11, 'b').s(29, 11, '<').s(1, 12, 'c').s(2, 12, '>')
      .s(4, 12, 'P').s(28, 12, 'D').done(),
    script: function (L) {
      var a = L.g('a'), b = L.g('b');
      L.onX(7, function () { shoot(L, 'a', -33, 10); });
      // each block waits until the one before has gone past you
      L.when(function () { return gx(L, a) < L.px() - 1 && L.px() >= 10; }, function () { shoot(L, 'b', -33, 10); });
      L.when(function () { return gx(L, b) < L.px() - 1 && L.px() >= 20; }, function () {
        var d = L.door;
        L.doorTo(d, 28, 5, 18, 0, function () { L.doorTo(d, 6, 5, 18, 0, function () { L.doorTo(d, 6, 12, 18); }); });
        L.msg('إلى البداية!');
        L.after(0.8, function () { shoot(L, 'c', 33, 12); });
      });
    }
  });

  // 5-5: the floor hates waiting — stand still and the spikes come out.
  L.push({
    name: 'لا تقف!', hint: 'لا تقف أبدًا! وأنت تنتظر المنصة أو المكبس، اقفز في مكانك.',
    msg: 'تعلّمت الصبر؟ انسَه! هنا لا تقف أبدًا!',
    map: (function () {
      var b = room();
      pit(b, 10, 19);
      b.f(17, 13, 19, 13, 'a').f(23, 3, 24, 8, 'b').f(5, 12, 9, 12, '1').f(20, 12, 22, 12, '1').f(25, 12, 27, 12, '1');
      return b.s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      var a = L.g('a'), b = L.g('b'), sp = L.sp(1), still = 0;
      // only standing over a spike strip counts (a spike's sharp part is 24 px wide)
      var onStrip = function () { return sp.list.some(function (s) { return Math.abs(L.px() * L.T - s.x - 20) < 25; }); };
      L.world.ticks.push(function () {
        still = L.grounded() && !L.on('a') && Math.abs(L.world.p.vx) < 30 && onStrip() ? still + 1 : 0;
        if (still > 55) sp.pop();
        else if (still > 12) sp.list.forEach(function (s) { s.target = 0.4; s.speed = 3; }); // a warning peek
        else if (!still && sp.list[0].target) sp.hide();
      });
      var ride = function () { a.move(-7, 0, 3, 1, function () { a.move(7, 0, 3, 1, ride); }); };
      L.onX(5, ride);
      var slam = function () {
        b.move(0, 4, 14, 1.2, function () {
          L.sfx('slam'); L.shake(5);
          b.move(0, -4, 4, 1.4, slam);
        });
      };
      slam();
    }
  });

  // 5-6: the sneaky king returns — a bit of everything from space.
  L.push({
    name: 'عودة الملك الماكر',
    // Deaths left of column 17 are on the shy floor or the moon pit; later ones are at the doors.
    hint: [{ before: 17, text: 'الأرض خجولة في البداية، وعلى القمر اضغط القفز ضغطة قصيرة.' }, { text: 'البابان يتبادلان مكانيهما! راقب الحقيقي، واقفز فوق الشوكة الطائرة.' }],
    msg: 'لقد عدت! هذه المرة لن تنجو!',
    winMsg: 'مستحيل! هزمتني مرة أخرى!',
    map: (function () {
      var b = room();
      b.f(4, 13, 5, 17, 'b').f(9, 3, 30, 6, '#').f(11, 7, 16, 7, 'v');
      pit(b, 12, 15);
      return b.s(30, 12, 'a').s(29, 12, '<').s(2, 12, 'P').s(21, 12, 'E').s(26, 12, 'D').done();
    })(),
    script: function (L) {
      L.when(function () { return L.on('b'); }, function () { L.g('b').drop(0.05); });
      L.onX(8, function () { L.gravity(0.4); L.msg('القمر مرة أخرى!'); L.sfx('moon'); });
      L.onX(19, function () {
        swapDoors(L, L.door, L.fakes[0], 26, 21, 0.7);
        shoot(L, 'a', -33, 12);
        L.msg('هيهي! أين الباب الآن؟');
      });
    }
  });

  // Title-screen demo: a little bot falls for the traps, then wins.
  var DEMO = {
    name: 'demo',
    map: room(4, 13).s(3, 12, 'P').s(13, 12, '1').s(20, 12, 'D').s(24, 12, '2').done(),
    script: function (L) {
      L.onX(10.9, function () { L.sp(1).pop(); });
      L.onX(16.5, function () { L.doorTo(L.door, 28, 12, 14); });
      L.onX(21.6, function () { L.sp(2).pop(); });
    },
    bots: ['R400', 'R63 RJ20 R400', 'R63 RJ20 R78 RJ20 R400']
  };

  root.TrollLevels = { WORLDS: WORLDS, LEVELS: L, PER_WORLD: 6, DEMO: DEMO };
})(typeof window !== 'undefined' ? window : globalThis);

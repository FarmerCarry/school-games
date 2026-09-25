/* Critter Mart (سوق الحيوانات) — world layout, items, unlocks and upgrades (plain data). */
(function () {
  'use strict';
  var CM = window.CM = window.CM || {};

  CM.W = 2600;
  CM.H = 2140;
  CM.HALL = { x0: 800, x1: 1720, y0: 860, y1: 1760 };
  CM.WING = { x0: 1720, x1: 2440, y0: 860, y1: 1760 };
  CM.DOOR = { x0: 1180, x1: 1320 };          // front + back door gap (x range)
  CM.WDOOR = { y0: 1060, y1: 1240 };         // west door gap (y range)
  CM.EGAP = { y0: 960, y1: 1600 };           // opening into the east wing
  CM.YARD_Y = 1760;                          // front yard starts here
  CM.WALK_Y = 1920;                          // sidewalk top
  CM.ROAD_Y = 1990;                          // road top
  CM.CUST_Y = 1955;                          // customers walk along here
  CM.START = { x: 700, y: 1150 };

  CM.ITEMS = {
    banana:   { name: 'موز', al: 'الموز', price: 5,  raw: true },
    corn:     { name: 'ذرة', al: 'الذرة', price: 7,  raw: true },
    egg:      { name: 'بيض', al: 'البيض', price: 10,  raw: true },
    milk:     { name: 'حليب', al: 'الحليب', price: 14,  raw: true },
    apple:    { name: 'تفاح', al: 'التفاح', price: 16,  raw: true },
    pumpkin:  { name: 'يقطين', al: 'اليقطين', price: 28, raw: true },
    juice:    { name: 'عصير موز', al: 'عصير الموز', price: 24 },
    popcorn:  { name: 'فشار', al: 'الفشار', price: 28 },
    icecream: { name: 'آيس كريم', al: 'الآيس كريم', price: 45 },
    pie:      { name: 'فطيرة تفاح', al: 'فطيرة التفاح', price: 55 }
  };

  function field(id, name, cost, req, item, x, y, grow, extra) {
    var d = { id: id, name: name, cost: cost, req: req, kind: 'field', item: item, x: x, y: y,
      cols: 3, rows: 2, sx: 100, sy: 95, grow: grow };
    if (extra) for (var k in extra) d[k] = extra[k];
    return d;
  }
  function shelf(id, name, cost, req, item, x, y, fridge) {
    return { id: id, name: name, cost: cost, req: req, kind: 'shelf', item: item, x: x, y: y, fridge: !!fridge };
  }
  function machine(id, name, cost, req, input, output, x, y, time, color) {
    return { id: id, name: name, cost: cost, req: req, kind: 'machine', input: input, output: output,
      x: x, y: y, time: time, color: color };
  }

  // Order matters only for tie-breaking; "req" drives what shows up next.
  CM.UNLOCKS = [
    field('bananaField', 'حقل الموز', 0, [], 'banana', 560, 1010, 4.5),
    shelf('bananaShelf', 'رف الموز', 0, [], 'banana', 1020, 1000),
    { id: 'register1', name: 'صندوق الدفع', cost: 0, req: [], kind: 'register', x: 1540, y: 1490,
      cashier: { x: 1540, y: 1434 }, service: { x: 1540, y: 1556 }, pile: { x: 1662, y: 1440 },
      queue: [[1540, 1556], [1540, 1614], [1540, 1672], [1476, 1716], [1414, 1716], [1356, 1716]] },
    { id: 'trash', name: 'سلة المهملات', cost: 0, req: [], kind: 'trash', x: 852, y: 1320 },

    field('cornField', 'حقل الذرة', 15, [], 'corn', 560, 1320, 5.5),
    shelf('cornShelf', 'رف الذرة', 25, ['cornField'], 'corn', 1480, 1000),
    { id: 'desk', name: 'لوحة التطوير', cost: 30, req: ['cornShelf'], kind: 'desk', x: 1646, y: 918 },
    { id: 'coop', name: 'قن الدجاج', cost: 50, req: ['cornShelf'], kind: 'coop', item: 'egg', x: 980, y: 590, grow: 5 },
    shelf('eggShelf', 'رف البيض', 65, ['coop'], 'egg', 1020, 1170),
    field('bananaField2', 'موز أكثر!', 50, ['desk'], 'banana', 250, 1010, 4.5),
    { id: 'plants', name: 'نباتات الزينة', cost: 50, req: ['eggShelf'], kind: 'decor', decor: 'plants', x: 1250, y: 1500, bonus: 0.04 },
    { id: 'cashier', name: 'وظّف كاشير', cost: 90, req: ['eggShelf'], kind: 'hire', role: 'cashier', reg: 'register1', x: 1664, y: 1600 },
    { id: 'expand', name: 'وسّع المتجر!', cost: 140, req: ['cashier'], kind: 'expand', x: 1664, y: 1230 },
    machine('juicer', 'آلة العصير', 180, ['expand'], 'banana', 'juice', 1900, 1010, 2.6, '#ffc93c'),
    shelf('juiceShelf', 'رف العصير', 150, ['juicer'], 'juice', 2250, 1010, true),
    { id: 'cow', name: 'حظيرة البقرة', cost: 240, req: ['juiceShelf'], kind: 'pen', item: 'milk', x: 1560, y: 590, grow: 7 },
    shelf('milkShelf', 'ثلاجة الحليب', 220, ['cow'], 'milk', 1480, 1170, true),
    { id: 'rug', name: 'سجادة مريحة', cost: 150, req: ['plants', 'milkShelf'], kind: 'decor', decor: 'rug', x: 1250, y: 1500, bonus: 0.05 },
    { id: 'farmer1', name: 'وظّف مزارعًا', cost: 350, req: ['juiceShelf'], kind: 'hire', role: 'farmer', x: 700, y: 1560 },
    machine('popper', 'آلة الفشار', 350, ['milkShelf'], 'corn', 'popcorn', 1900, 1190, 3, '#ff5d73'),
    shelf('popcornShelf', 'رف الفشار', 300, ['popper'], 'popcorn', 2250, 1190),
    field('cornField2', 'ذرة أكثر!', 300, ['popcornShelf'], 'corn', 250, 1320, 5.5),
    { id: 'orchard', name: 'بستان التفاح', cost: 500, req: ['popcornShelf'], kind: 'orchard', item: 'apple',
      x: 520, y: 560, cols: 3, rows: 2, sx: 165, sy: 150, grow: 7.5 },
    shelf('appleShelf', 'رف التفاح', 450, ['orchard'], 'apple', 1020, 1340),
    { id: 'balloons', name: 'قوس البالونات', cost: 400, req: ['rug', 'appleShelf'], kind: 'decor', decor: 'balloons', x: 1250, y: 1500, bonus: 0.06 },
    machine('creamer', 'آلة الآيس كريم', 750, ['appleShelf'], 'milk', 'icecream', 1900, 1370, 3.2, '#ff9ecb'),
    shelf('iceShelf', 'ثلاجة الآيس كريم', 650, ['creamer'], 'icecream', 2250, 1370, true),
    { id: 'register2', name: 'صندوق دفع ثانٍ', cost: 1000, req: ['iceShelf'], kind: 'register', x: 960, y: 1490, helper: true,
      cashier: { x: 960, y: 1434 }, service: { x: 960, y: 1556 }, pile: { x: 842, y: 1440 },
      queue: [[960, 1556], [960, 1614], [960, 1672], [1024, 1716], [1086, 1716], [1146, 1716]] },
    { id: 'farmer2', name: 'وظّف مزارعًا', cost: 1100, req: ['iceShelf', 'farmer1'], kind: 'hire', role: 'farmer', x: 700, y: 1560 },
    field('pumpkinPatch', 'حقل اليقطين', 1400, ['register2'], 'pumpkin', 400, 1600, 8, { sx: 110, sy: 90 }),
    shelf('pumpkinShelf', 'رف اليقطين', 1300, ['pumpkinPatch'], 'pumpkin', 1480, 1340),
    machine('oven', 'فرن الفطائر', 1900, ['pumpkinShelf'], 'apple', 'pie', 1900, 1550, 3.6, '#ff8c42'),
    shelf('pieShelf', 'رف الفطائر', 1700, ['oven'], 'pie', 2250, 1550),
    { id: 'fountain', name: 'نافورة', cost: 2000, req: ['pieShelf'], kind: 'decor', decor: 'fountain', x: 2000, y: 1845, bonus: 0.08 },
    { id: 'farmer3', name: 'وظّف مزارعًا', cost: 2400, req: ['pieShelf', 'farmer2'], kind: 'hire', role: 'farmer', x: 700, y: 1560 },
    { id: 'statue', name: 'الراكون الذهبي', cost: 6000, req: ['fountain', 'farmer3'], kind: 'decor', decor: 'statue', x: 960, y: 1845, bonus: 0.1, final: true }
  ];

  CM.UPGRADES = [
    { id: 'speed', name: 'حذاء الصاروخ', desc: 'امشِ أسرع', icon: 'shoe', costs: [30, 80, 200, 500, 1200] },
    { id: 'carry', name: 'كومة عالية', desc: 'احمل غرضين إضافيين', icon: 'stack', costs: [40, 100, 250, 600, 1400, 3000] },
    { id: 'grow', name: 'تربة خارقة', desc: 'مزروعات وآلات أسرع', icon: 'sprout', costs: [50, 150, 400, 1000, 2400] },
    { id: 'price', name: 'أسعار فاخرة', desc: 'عملات أكثر بـ 20% لكل غرض', icon: 'tag', costs: [80, 250, 700, 1800, 4000] },
    { id: 'fame', name: 'شهرة السوق', desc: 'زبائن أكثر', icon: 'star', costs: [120, 350, 1000, 2600] },
    { id: 'helper', name: 'تدريب المساعدين', desc: 'مساعدون أسرع وأقوى', icon: 'helper', costs: [300, 800, 2000, 4500], needs: 'cashier' }
  ];

  CM.HATS = [
    { id: 'none', name: 'بلا قبعة', lvl: 1 },
    { id: 'cap', name: 'كاب', lvl: 2 },
    { id: 'flower', name: 'وردة', lvl: 3 },
    { id: 'chef', name: 'طاهٍ', lvl: 5 },
    { id: 'straw', name: 'قش', lvl: 7 },
    { id: 'party', name: 'حفلة', lvl: 9 },
    { id: 'crown', name: 'تاج', lvl: 11 }
  ];

  // Which species shop at your mart, unlocked by mart level.
  CM.CUSTOMERS = [
    { sp: 'bunny', lvl: 1 }, { sp: 'pig', lvl: 1 }, { sp: 'bear', lvl: 1 },
    { sp: 'duck', lvl: 2 }, { sp: 'cat', lvl: 3 }, { sp: 'sheep', lvl: 4 },
    { sp: 'mouse', lvl: 5 }, { sp: 'fox', lvl: 6 }
  ];
})();

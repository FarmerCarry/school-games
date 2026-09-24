/* Critter Mart — world layout, items, unlocks and upgrades (plain data). */
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
    banana:   { name: 'Bananas',      price: 3,  raw: true },
    corn:     { name: 'Corn',         price: 4,  raw: true },
    egg:      { name: 'Eggs',         price: 6,  raw: true },
    milk:     { name: 'Milk',         price: 8,  raw: true },
    apple:    { name: 'Apples',       price: 9,  raw: true },
    pumpkin:  { name: 'Pumpkins',     price: 16, raw: true },
    juice:    { name: 'Banana Juice', price: 13 },
    popcorn:  { name: 'Popcorn',      price: 15 },
    icecream: { name: 'Ice Cream',    price: 26 },
    pie:      { name: 'Apple Pie',    price: 30 }
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
    field('bananaField', 'Banana Field', 0, [], 'banana', 560, 1010, 4.5),
    shelf('bananaShelf', 'Banana Shelf', 0, [], 'banana', 1020, 1000),
    { id: 'register1', name: 'Checkout', cost: 0, req: [], kind: 'register', x: 1540, y: 1490,
      cashier: { x: 1540, y: 1434 }, service: { x: 1540, y: 1556 }, pile: { x: 1662, y: 1440 },
      queue: [[1540, 1556], [1540, 1614], [1540, 1672], [1476, 1716], [1414, 1716], [1356, 1716]] },
    { id: 'trash', name: 'Trash Bin', cost: 0, req: [], kind: 'trash', x: 852, y: 1320 },

    field('cornField', 'Corn Field', 15, [], 'corn', 560, 1320, 5.5),
    shelf('cornShelf', 'Corn Shelf', 25, ['cornField'], 'corn', 1480, 1000),
    { id: 'desk', name: 'Upgrade Board', cost: 40, req: ['cornShelf'], kind: 'desk', x: 1646, y: 918 },
    { id: 'coop', name: 'Chicken Coop', cost: 70, req: ['cornShelf'], kind: 'coop', item: 'egg', x: 980, y: 590, grow: 6 },
    shelf('eggShelf', 'Egg Shelf', 90, ['coop'], 'egg', 1020, 1170),
    field('bananaField2', 'More Bananas', 60, ['desk'], 'banana', 250, 1010, 4.5),
    { id: 'plants', name: 'Potted Plants', cost: 50, req: ['eggShelf'], kind: 'decor', decor: 'plants', x: 1250, y: 1500, bonus: 0.04 },
    { id: 'cashier', name: 'Hire a Cashier', cost: 150, req: ['eggShelf'], kind: 'hire', role: 'cashier', reg: 'register1', x: 1664, y: 1600 },
    { id: 'expand', name: 'Bigger Store!', cost: 220, req: ['cashier'], kind: 'expand', x: 1664, y: 1230 },
    machine('juicer', 'Juice Maker', 250, ['expand'], 'banana', 'juice', 1900, 1010, 2.6, '#ffc93c'),
    shelf('juiceShelf', 'Juice Shelf', 220, ['juicer'], 'juice', 2250, 1010, true),
    { id: 'cow', name: 'Cow Pen', cost: 350, req: ['juiceShelf'], kind: 'pen', item: 'milk', x: 1560, y: 590, grow: 7 },
    shelf('milkShelf', 'Milk Fridge', 320, ['cow'], 'milk', 1480, 1170, true),
    { id: 'rug', name: 'Comfy Rug', cost: 200, req: ['plants', 'milkShelf'], kind: 'decor', decor: 'rug', x: 1250, y: 1500, bonus: 0.05 },
    { id: 'farmer1', name: 'Hire a Farmer', cost: 600, req: ['juiceShelf'], kind: 'hire', role: 'farmer', x: 700, y: 1560 },
    machine('popper', 'Popcorn Popper', 500, ['milkShelf'], 'corn', 'popcorn', 1900, 1190, 3, '#ff5d73'),
    shelf('popcornShelf', 'Popcorn Shelf', 450, ['popper'], 'popcorn', 2250, 1190),
    field('cornField2', 'More Corn', 450, ['popcornShelf'], 'corn', 250, 1320, 5.5),
    { id: 'orchard', name: 'Apple Orchard', cost: 800, req: ['popcornShelf'], kind: 'orchard', item: 'apple',
      x: 520, y: 560, cols: 3, rows: 2, sx: 165, sy: 150, grow: 7.5 },
    shelf('appleShelf', 'Apple Shelf', 700, ['orchard'], 'apple', 1020, 1340),
    { id: 'balloons', name: 'Balloon Arch', cost: 600, req: ['rug', 'appleShelf'], kind: 'decor', decor: 'balloons', x: 1250, y: 1500, bonus: 0.06 },
    machine('creamer', 'Ice Cream Maker', 1200, ['appleShelf'], 'milk', 'icecream', 1900, 1370, 3.2, '#ff9ecb'),
    shelf('iceShelf', 'Ice Cream Freezer', 1000, ['creamer'], 'icecream', 2250, 1370, true),
    { id: 'register2', name: 'Second Checkout', cost: 1500, req: ['iceShelf'], kind: 'register', x: 960, y: 1490, helper: true,
      cashier: { x: 960, y: 1434 }, service: { x: 960, y: 1556 }, pile: { x: 842, y: 1440 },
      queue: [[960, 1556], [960, 1614], [960, 1672], [1024, 1716], [1086, 1716], [1146, 1716]] },
    { id: 'farmer2', name: 'Hire a Farmer', cost: 1800, req: ['iceShelf', 'farmer1'], kind: 'hire', role: 'farmer', x: 700, y: 1560 },
    field('pumpkinPatch', 'Pumpkin Patch', 2200, ['register2'], 'pumpkin', 400, 1600, 8, { sx: 110, sy: 90 }),
    shelf('pumpkinShelf', 'Pumpkin Shelf', 2000, ['pumpkinPatch'], 'pumpkin', 1480, 1340),
    machine('oven', 'Pie Oven', 3000, ['pumpkinShelf'], 'apple', 'pie', 1900, 1550, 3.6, '#ff8c42'),
    shelf('pieShelf', 'Pie Shelf', 2600, ['oven'], 'pie', 2250, 1550),
    { id: 'fountain', name: 'Fountain', cost: 3000, req: ['pieShelf'], kind: 'decor', decor: 'fountain', x: 2000, y: 1845, bonus: 0.08 },
    { id: 'farmer3', name: 'Hire a Farmer', cost: 4000, req: ['pieShelf', 'farmer2'], kind: 'hire', role: 'farmer', x: 700, y: 1560 },
    { id: 'statue', name: 'Golden Raccoon', cost: 10000, req: ['fountain', 'farmer3'], kind: 'decor', decor: 'statue', x: 960, y: 1845, bonus: 0.1, final: true }
  ];

  CM.UPGRADES = [
    { id: 'speed', name: 'Zoomy Shoes', desc: 'Walk faster', icon: 'shoe', costs: [30, 90, 250, 700, 1800] },
    { id: 'carry', name: 'Tall Stack', desc: 'Carry +2 items', icon: 'stack', costs: [40, 120, 320, 850, 2000, 4200] },
    { id: 'grow', name: 'Super Soil', desc: 'Crops & machines faster', icon: 'sprout', costs: [60, 180, 500, 1300, 3200] },
    { id: 'price', name: 'Fancy Prices', desc: '+20% coins per item', icon: 'tag', costs: [100, 350, 1000, 2600, 6000] },
    { id: 'fame', name: 'Mart Fame', desc: 'More customers', icon: 'star', costs: [150, 500, 1500, 4000] },
    { id: 'helper', name: 'Helper Training', desc: 'Helpers faster & stronger', icon: 'helper', costs: [400, 1200, 3000, 7000], needs: 'cashier' }
  ];

  CM.HATS = [
    { id: 'none', name: 'No hat', lvl: 1 },
    { id: 'cap', name: 'Cap', lvl: 2 },
    { id: 'flower', name: 'Flower', lvl: 3 },
    { id: 'chef', name: 'Chef', lvl: 5 },
    { id: 'straw', name: 'Straw', lvl: 7 },
    { id: 'party', name: 'Party', lvl: 9 },
    { id: 'crown', name: 'Crown', lvl: 11 }
  ];

  // Which species shop at your mart, unlocked by mart level.
  CM.CUSTOMERS = [
    { sp: 'bunny', lvl: 1 }, { sp: 'pig', lvl: 1 }, { sp: 'bear', lvl: 1 },
    { sp: 'duck', lvl: 2 }, { sp: 'cat', lvl: 3 }, { sp: 'sheep', lvl: 4 },
    { sp: 'mouse', lvl: 5 }, { sp: 'fox', lvl: 6 }
  ];
})();

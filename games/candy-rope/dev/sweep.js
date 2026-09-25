// dev: node dev/sweep.js <level> '<plan json with F for swept frame>' from to step
var Sim = require('../sim.js'), L = require('../levels.js');
var lv = L[+process.argv[2] - 1], tpl = process.argv[3];
for (var f = +process.argv[4]; f <= +process.argv[5]; f += +(process.argv[6] || 5)) {
  var plan = JSON.parse(tpl.replace(/F/g, f));
  var w = Sim.create(lv, { visual: false }), k = 0, ev = [], pathPts = [];
  while (w.frame < 900 && w.state === 'play') {
    while (k < plan.length && plan[k][0] <= w.frame) { Sim.act(w, plan[k].slice(1)); k++; }
    Sim.step(w);
    w.events.forEach(function (e) { if (e.type !== 'cut') ev.push(e.type[0] + e.type[1] + '@' + Math.round(e.x) + ',' + Math.round(e.y)); });
    w.events.length = 0;
    if (w.frame % 15 === 0 && k >= plan.length) pathPts.push(Math.round(w.candy.x) + ',' + Math.round(w.candy.y));
  }
  console.log('F=' + f + ' ' + w.state + ' ' + w.starsGot + '* near ' + Math.round(w.nearest) + ' | ' + ev.join(' ') + ' | ' + pathPts.slice(0, 14).join(' '));
}

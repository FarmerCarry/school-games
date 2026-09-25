// dev: node dev/trace.js <level 1-based> '[[frame,"cut","p0"],...]'  -> prints candy path every 10 frames
var Sim = require('../sim.js'), L = require('../levels.js');
var lv = L[+process.argv[2] - 1], plan = JSON.parse(process.argv[3] || '[]');
var w = Sim.create(lv, { visual: false }), k = 0, out = [];
while (w.frame < 900 && w.state === 'play') {
  while (k < plan.length && plan[k][0] <= w.frame) { Sim.act(w, plan[k].slice(1)); out.push('ACT ' + plan[k].join(' ')); k++; }
  Sim.step(w);
  w.events.forEach(function (e) { if (e.type !== 'cut') out.push('  ev ' + e.type + ' @' + w.frame + ' ' + Math.round(e.x) + ',' + Math.round(e.y)); });
  w.events.length = 0;
  if (w.frame % 10 === 0) out.push(w.frame + ': ' + Math.round(w.candy.x) + ',' + Math.round(w.candy.y) + (w.candy.bubble ? ' B' : ''));
}
out.push('END ' + w.state + ' ' + w.reason + ' stars ' + w.starsGot + ' frame ' + w.frame);
console.log(out.join('\n'));

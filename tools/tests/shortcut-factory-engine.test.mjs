// Shortcut Factory engine (games/shortcut-factory/engine.js): the levels, selection, the
// copy machine (clipboard), undo/redo, orders, the gremlin, the hint planner, stars and
// saves. Every level is played to the end with only the shortcuts it has taught.
// Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/shortcut-factory/engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const SF = sandbox.window.SF;
const plain = v => JSON.parse(JSON.stringify(v));
const DT = 1 / 60;

function run(w, seconds) { for (let i = 0; i < Math.round(seconds / DT); i++) SF.step(w, DT); }
// Arrays made inside the engine's sandbox are copied into this realm before comparing.
const kinds = (w, c) => [...(typeof c === 'number' ? w.cons[c] : c).items].filter(Boolean).map(id => (w.toys[id].b ? '!' : '') + w.toys[id].k);
const boxes = w => [...w.cons].filter(c => c.type === 'box');
const beltToy = (w, kind) => { for (const c of w.cons) if (c.type === 'belt') for (const id of c.items) if (id && w.toys[id].k === kind && !w.toys[id].b) return id; return 0; };
// The floor as kinds per container (ids left out), to compare states.
const floor = w => [...w.cons].map(c => kinds(w, c).join(' '));
const ids = w => plain(w.cons.map(c => c.items));
function click(w, id) { const f = SF.find(w, id); return SF.act(w, { t: 'click', x: f.x, y: f.y }); }
function clickBox(w, con) { return SF.act(w, { t: 'click', x: w.cons[con].x, y: SF.BOX.y + 170 }); }

// Plays a level by its own coach (SF.hint), with real clicks for the clicks (hit-tested at
// the toys' moving positions) and the shortcuts for the rest; pace: seconds between steps.
function solve(li, { seed = 5, pace = 1, opts = {} } = {}) {
  const w = SF.create(li, Object.assign({ seed, speed: 30, gremlinEvery: 18 }, opts));
  const used = {}, results = [];
  for (let n = 0; n < 900 && (w.phase === 'play' || w.phase === 'stamp'); n++) {
    const h = SF.hint(w);
    if (!h) { run(w, 0.25); continue; }
    let a;
    if (h.act === 'select') {
      const f = SF.find(w, h.toy);
      // A toy in the tunnel comes out again: wait for it.
      if (w.cons[f.con].type === 'belt' && !SF.visible(f.x)) { run(w, 0.2); continue; }
      a = { t: 'click', x: f.x, y: f.y };
    } else if (h.act === 'place') a = { t: 'click', x: w.cons[h.con].x, y: SF.BOX.y + 170 };
    else a = { t: h.act === 'gremlin' ? 'undo' : h.act };
    used[h.act] = (used[h.act] || 0) + 1;
    const r = SF.act(w, a);
    results.push(r);
    assert.equal(r, 'ok', `level ${w.def.id}: ${JSON.stringify(h)} -> ${r}`);
    run(w, pace);
  }
  return { w, used, results };
}

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(SF && SF.create && SF.act && SF.step && SF.hint, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('five worlds of six levels; every order, toy and lesson is well formed', () => {
  assert.equal(SF.WORLDS.length, 5);
  assert.equal(SF.LEVELS.length, 30);
  assert.equal(SF.COUNT, 30);
  const taught = new Set();
  for (const L of SF.LEVELS) {
    assert.equal(L.id, (L.world + 1) + '-' + (L.n + 1));
    assert.ok(L.belts.length >= 1 && L.belts.length <= 2, L.id + ' belts');
    assert.ok(L.boxes.length >= 1 && L.boxes.length <= 3, L.id + ' boxes');
    for (const b of L.boxes) {
      const order = SF.bag(b[0]), inside = SF.list(b[1]);
      assert.ok(Object.keys(order).length >= 1 && Object.keys(order).every(k => SF.KINDS.includes(k)), L.id + ' order ' + b[0]);
      assert.ok(Object.values(order).reduce((a, n) => a + n, 0) <= SF.BOX.cap, L.id + ' order fits a box');
      assert.ok(inside.every(t => SF.KINDS.includes(t.k)) && inside.length <= SF.BOX.cap, L.id + ' box ' + b[1]);
      assert.ok(SF.orderText(order).length > 0 && /[؀-ۿ]/.test(SF.orderText(order)));
    }
    for (const q of L.queue) assert.ok(Object.keys(SF.bag(q)).every(k => SF.KINDS.includes(k)), L.id + ' queue ' + q);
    for (const s of L.belts) assert.ok(SF.list(s).every(t => SF.KINDS.includes(t.k)) && SF.list(s).length <= 7, L.id + ' belt ' + s);
    for (const a of L.teach) { assert.ok(SF.ACTS[a], L.id + ' teaches ' + a); assert.ok(!taught.has(a), a + ' is taught once'); taught.add(a); }
    for (const a of taught) assert.ok(L.tools[a], L.id + ' keeps ' + a);
    assert.equal(L.stamp, L.i >= 2, L.id + ': from 1-3 on every day ends with Ctrl+S');
  }
  // Every keyboard shortcut on the actions card is taught, one lesson per level, in order.
  for (const a of SF.CARD) assert.ok(a === 'ship' || a === 'select' || taught.has(a), a + ' is taught');
  assert.deepEqual([...SF.LEVELS[0].teach], ['copy', 'paste']);
  assert.deepEqual(plain(SF.WORLDS.map(w => w.acts[0])), ['copy', 'cut', 'del', 'undo', 'multi']);
  assert.equal(SF.say('duck', 1), 'بطة'); assert.equal(SF.say('duck', 2), 'بطتان'); assert.equal(SF.say('duck', 3), '3 بطات');
  assert.equal(SF.orderText({ car: 1, ball: 1 }), 'كرة وسيارة');
  // Shortcuts are matched by the physical key, never by the typed character.
  assert.deepEqual([...SF.ACTS.copy.codes], ['ControlLeft', 'KeyC']);
  for (const a in SF.ACTS) for (const c of SF.ACTS[a].codes) assert.doesNotMatch(c, /KeyW|KeyT|KeyN|KeyP|KeyR|F5/, a + ' never uses a browser shortcut');
});

test('every level can be finished with only the shortcuts it has taught, and uses its new one', () => {
  for (let li = 0; li < SF.COUNT; li++) {
    const { w, used } = solve(li);
    const L = w.def;
    assert.equal(w.phase, 'done', L.id + ' finished');
    assert.equal(w.done, w.total, L.id + ' every box shipped');
    assert.equal(SF.stars(w), 3, L.id + ' a clean quick day earns 3 stars');
    for (const a in used) assert.ok(a === 'select' || L.tools[a], `${L.id} uses ${a} before it is taught`);
    for (const a of L.teach) if (['copy', 'paste', 'cut', 'del', 'undo', 'redo', 'save', 'gremlin'].includes(a)) assert.ok(used[a], `${L.id} uses the ${a} it teaches`);
    if (L.stamp) assert.equal(used.save, 1, L.id + ' ends with one Ctrl+S'); else assert.ok(!used.save);
    if (!L.tools.del) assert.ok(!used.del, L.id + ' never deletes before Delete is taught');
  }
});

test('timed days can be finished at a slow child\'s pace, and the clock ends a day that is too slow', () => {
  for (const L of SF.LEVELS.filter(L => L.time)) {
    const { w } = solve(L.i, { pace: 2.6 });
    assert.equal(w.phase, 'done', L.id + ' finishes at 2.6 s a step');
    assert.ok(w.left > 0);
  }
  const w = SF.create(5, { seed: 1, timeScale: 1 });
  assert.equal(w.limit, 150);
  run(w, 151);
  assert.equal(w.phase, 'fail');
  assert.ok(w.ev.some(e => e.t === 'timeup'));
  assert.equal(SF.stars(w), 0);
  assert.equal(SF.outcome(w), 0);
  // The difficulty knobs are bounded.
  const easy = SF.create(5, { timeScale: 1.45, parScale: 1.6, speed: 10 }), hard = SF.create(5, { timeScale: 0.1, speed: -5 });
  assert.equal(easy.limit, Math.round(150 * 1.45));
  assert.equal(hard.limit, 75, 'never less than half the clock');
  assert.equal(hard.speed, 0);
});

test('level 1-1 by hand: click the duck, Ctrl+C, Ctrl+V twice, Enter', () => {
  const w = SF.create(0, { seed: 2 });
  const duck = beltToy(w, 'duck'), box = boxes(w)[0].i;
  assert.equal(w.place, box, 'the box is where a paste goes at the start');
  assert.equal(SF.act(w, { t: 'paste' }), 'empty', 'nothing to paste yet');
  assert.equal(SF.act(w, { t: 'copy' }), 'nothing', 'nothing selected yet');
  assert.equal(click(w, duck), 'ok');
  assert.deepEqual([...w.sel], [duck]);
  assert.equal(w.place, box, 'picking a toy on a belt keeps the box as the place to paste');
  assert.equal(SF.act(w, { t: 'copy' }), 'ok');
  assert.deepEqual(plain(w.clip), { cut: false, items: [{ k: 'duck', b: false }] });
  assert.equal(w.undo.length, 0, 'copying changes nothing that needs undoing');
  assert.equal(SF.act(w, { t: 'ship' }), 'wrong');
  assert.equal(w.mistakes, 0, 'sending an empty box is not a mistake');
  SF.act(w, { t: 'paste' }); SF.act(w, { t: 'paste' });
  assert.deepEqual(kinds(w, box), ['duck', 'duck']);
  assert.equal(kinds(w, 0).length, 1, 'the duck on the belt is still there');
  assert.ok(SF.ready(w, w.cons[box]));
  assert.equal(SF.act(w, { t: 'ship' }), 'ok');
  run(w, 1);
  assert.equal(w.phase, 'done', 'the first level has no stamp yet');
  assert.equal(SF.stars(w), 3);
});

test('undo and redo: paste, cut, delete and the gremlin each come back exactly', () => {
  const w = SF.create(12, { seed: 3 });   // 3-1: a box with broken ducks, Delete is taught
  const box = boxes(w)[0].i, start = floor(w), startIds = ids(w);
  assert.equal(SF.act(w, { t: 'undo' }), 'nothing');
  assert.equal(SF.act(w, { t: 'redo' }), 'nothing');
  // delete a broken duck
  const broken = w.cons[box].items.find(id => w.toys[id].b);
  click(w, broken);
  assert.equal(SF.act(w, { t: 'del' }), 'ok');
  assert.deepEqual(kinds(w, box), ['duck', 'duck', '!duck']);
  const afterDel = floor(w);
  // cut a good duck: it leaves the box and goes to the copy machine
  const good = w.cons[box].items[0];
  click(w, good);
  assert.equal(SF.act(w, { t: 'cut' }), 'ok');
  assert.deepEqual(plain(w.clip), { cut: true, items: [{ k: 'duck', b: false }] });
  assert.equal(w.toys[good], undefined);
  const afterCut = floor(w);
  // paste it back (the place is still this box)
  assert.equal(SF.act(w, { t: 'paste' }), 'ok');
  const pasted = w.sel[0];
  assert.equal(w.toys[pasted].k, 'duck');
  assert.equal(w.undo.length, 3);
  // Undo the paste, the cut, the delete, in that order.
  assert.equal(SF.act(w, { t: 'undo' }), 'ok');
  assert.deepEqual(floor(w), afterCut); assert.equal(w.toys[pasted], undefined);
  assert.equal(SF.act(w, { t: 'undo' }), 'ok');
  assert.deepEqual(floor(w), afterDel); assert.ok(w.toys[good], 'the cut duck is back');
  assert.equal(w.cons[box].items[0], good, 'in its own place');
  assert.deepEqual([...w.sel], [good], 'and picked, so it shows');
  assert.deepEqual(plain(w.clip), { cut: true, items: [{ k: 'duck', b: false }] }, 'undo never empties the copy machine');
  assert.equal(SF.act(w, { t: 'undo' }), 'ok');
  assert.deepEqual(floor(w), start); assert.deepEqual(ids(w), startIds, 'the very same toys');
  assert.equal(SF.act(w, { t: 'undo' }), 'nothing');
  // Redo all three, then the paste's toy has its own id again.
  assert.equal(w.redo.length, 3);
  SF.act(w, { t: 'redo' }); assert.deepEqual(floor(w), afterDel);
  SF.act(w, { t: 'redo' }); assert.deepEqual(floor(w), afterCut);
  SF.act(w, { t: 'redo' }); assert.ok(w.toys[pasted], 'redo brings back the pasted toy itself');
  assert.equal(SF.act(w, { t: 'redo' }), 'nothing');
  // A new change forgets what could be redone.
  SF.act(w, { t: 'undo' });
  assert.equal(w.redo.length, 1);
  click(w, w.cons[box].items[0]); SF.act(w, { t: 'copy' });
  assert.equal(w.redo.length, 1, 'copying is not a change');
  SF.act(w, { t: 'paste' });
  assert.equal(w.redo.length, 0, 'a paste is');
  // Shipping is for good: it clears the history.
  const b = w.cons[box];
  while (SF.need(w, b).extra.length) { click(w, SF.need(w, b).extra[0]); SF.act(w, { t: 'del' }); }
  while (!SF.ready(w, b)) { click(w, b.items[0]); SF.act(w, { t: 'copy' }); SF.act(w, { t: 'paste' }); }
  assert.ok(w.undo.length > 0);
  assert.equal(SF.act(w, { t: 'ship' }), 'ok');
  assert.equal(w.undo.length, 0); assert.equal(w.redo.length, 0);
  assert.equal(SF.act(w, { t: 'undo' }), 'nothing', 'a shipped box never comes back');
});

test('undo after copy undoes the last change, not the copy; Ctrl+A copies a whole belt at once', () => {
  const w = SF.create(25, { seed: 4 });   // 5-2: rocket, teddy and duck on the belt, three boxes want all three
  const belt = w.cons[0], [b1, b2, b3] = boxes(w).map(c => c.i);
  click(w, beltToy(w, 'teddy'));
  assert.equal(SF.act(w, { t: 'all' }), 'ok');
  assert.equal(w.sel.length, 3, 'all toys of the belt');
  assert.equal(w.place, b1, 'Ctrl+A on a belt keeps the place to paste');
  SF.act(w, { t: 'copy' });
  // The copy machine keeps the belt's reading order: right to left.
  const order = SF.ordered(w, belt).map(id => w.toys[id].k);
  assert.deepEqual(plain(w.clip.items.map(t => t.k)), plain(order));
  SF.act(w, { t: 'paste' });
  assert.ok(SF.ready(w, w.cons[b1]), 'one paste fills the first box');
  clickBox(w, b2); SF.act(w, { t: 'paste' });
  clickBox(w, b3); SF.act(w, { t: 'copy' });
  assert.equal(w.clip.items.length, 3, 'a copy with nothing picked keeps the copy machine as it was');
  SF.act(w, { t: 'paste' });
  assert.ok([b1, b2, b3].every(b => SF.ready(w, w.cons[b])));
  SF.act(w, { t: 'undo' });
  assert.equal(w.cons[b3].items.length, 0, 'undo takes the last paste back');
  SF.act(w, { t: 'redo' });
  // Ctrl+A in a box picks that box's toys, and it becomes the place to paste.
  SF.act(w, { t: 'pick', con: b2, toy: 0 });
  SF.act(w, { t: 'all' });
  assert.deepEqual([...w.sel].sort(), [...w.cons[b2].items].sort());
  for (let i = 0; i < 3; i++) assert.equal(SF.act(w, { t: 'ship' }), 'ok');
  run(w, 1.2);
  assert.equal(w.phase, 'stamp');
  assert.equal(SF.act(w, { t: 'save' }), 'ok');
  assert.equal(w.phase, 'done');
});

test('Shift+click picks many toys; a second Shift+click drops one; a plain click picks one', () => {
  const w = SF.create(24, { seed: 4 });   // 5-1: three boxes want a car and a ball
  const car = beltToy(w, 'car'), ball = beltToy(w, 'ball'), duck = beltToy(w, 'duck');
  click(w, car);
  const f = SF.find(w, ball);
  SF.act(w, { t: 'click', x: f.x, y: f.y, add: true });
  const g = SF.find(w, duck);
  SF.act(w, { t: 'click', x: g.x, y: g.y, add: true });
  assert.equal(w.sel.length, 3);
  SF.act(w, { t: 'click', x: SF.find(w, duck).x, y: SF.find(w, duck).y, add: true });
  assert.deepEqual([...w.sel].sort(), [car, ball].sort());
  SF.act(w, { t: 'copy' });
  for (const b of boxes(w)) { clickBox(w, b.i); assert.equal(SF.act(w, { t: 'paste' }), 'ok'); assert.ok(SF.ready(w, b)); }
  // An empty spot of a belt drops the selection, and a Ctrl+V still goes to a box.
  const toyXs = [...w.cons[0].items].filter(Boolean).map(id => SF.find(w, id).x);
  const gap = [...Array(80).keys()].map(i => 220 + i * 10).find(x => toyXs.every(t => Math.abs(t - x) > 70));
  SF.act(w, { t: 'click', x: gap, y: w.cons[0].y + 40 });
  assert.equal(w.sel.length, 0);
  assert.equal(w.cons[w.place].type, 'box', 'a belt is never the place to paste');
  click(w, car);
  assert.deepEqual([...w.sel], [car]);
  // A full box takes no more.
  const box = boxes(w)[0];
  clickBox(w, box.i); SF.act(w, { t: 'copy' });
  for (let i = 0; i < 4; i++) SF.act(w, { t: 'paste' });
  assert.equal(box.items.length, 6);
  assert.equal(SF.act(w, { t: 'paste' }), 'full');
});

test('Tab and the arrow keys move the selection; Shift+arrow grows it', () => {
  const w = SF.create(7, { seed: 6 });   // 2-2: a long belt and one box
  const order = SF.ordered(w, w.cons[0]).filter(id => SF.visible(SF.find(w, id).x));
  SF.act(w, { t: 'tab' });
  assert.deepEqual([...w.sel], [order[0]], 'the first Tab picks the rightmost toy');
  SF.act(w, { t: 'tab' });
  assert.deepEqual([...w.sel], [order[1]], 'the next one to its left');
  for (let i = 0; i < 12; i++) SF.act(w, { t: 'tab' });
  assert.equal(w.sel.length, 1, 'Tab always picks one toy');
  // arrows on the belt
  SF.act(w, { t: 'pick', con: 0, toy: order[2] });
  const x = SF.find(w, order[2]).x;
  SF.act(w, { t: 'move', dir: 'left' });
  assert.ok(SF.find(w, w.sel[0]).x < x, '← picks the toy on the left');
  SF.act(w, { t: 'move', dir: 'right' });
  assert.deepEqual([...w.sel], [order[2]], '→ goes back');
  SF.act(w, { t: 'move', dir: 'left', add: true });
  assert.equal(w.sel.length, 2, 'Shift+← adds the next toy');
  SF.act(w, { t: 'move', dir: 'down' });
  const box = boxes(w)[0];
  assert.equal(w.cur, box.i, '↓ goes down into the box row');
  assert.equal(w.place, box.i);
  assert.equal(SF.act(w, { t: 'move', dir: 'down' }), 'nothing', 'nothing is below the boxes');
  SF.act(w, { t: 'move', dir: 'up' });
  assert.equal(w.cons[w.cur].type, 'belt');
  // Solve the level picking every toy with Tab instead of the mouse.
  const v = SF.create(7, { seed: 6 });
  for (let n = 0; n < 300 && v.phase !== 'done'; n++) {
    const h = SF.hint(v);
    if (!h) { run(v, 0.25); continue; }
    if (h.act === 'select') {
      let tries = 0;
      while (!(v.sel.length === 1 && v.sel[0] === h.toy) && tries++ < 20) SF.act(v, { t: 'tab' });
      if (tries > 20) { run(v, 0.3); continue; }
    } else SF.act(v, { t: h.act === 'place' ? 'pick' : h.act, con: h.con, toy: 0 });
    run(v, 0.5);
  }
  assert.equal(v.phase, 'done', '2-2 with Tab');
});

test('orders: broken toys and extra toys are never right; Enter sends the box that is ready', () => {
  const w = SF.create(2, { seed: 7 });   // 1-3: car*3, then teddy*2
  const c = boxes(w)[0];
  assert.deepEqual(plain(SF.need(w, c)), { ok: false, missing: { car: 3 }, extra: [] });
  click(w, beltToy(w, 'car')); SF.act(w, { t: 'copy' });
  for (let i = 0; i < 4; i++) SF.act(w, { t: 'paste' });
  const n = SF.need(w, c);
  assert.equal(n.ok, false); assert.equal(n.extra.length, 1, 'one car too many');
  assert.equal(SF.act(w, { t: 'ship' }), 'wrong');
  assert.equal(w.mistakes, 1, 'a box with the wrong toys is a mistake');
  assert.ok(w.ev.some(e => e.t === 'wrong' && e.con === c.i));
  SF.act(w, { t: 'undo' });
  assert.ok(SF.ready(w, c));
  // A broken copy is broken too.
  w.clip = { cut: false, items: [{ k: 'car', b: true }] };
  SF.act(w, { t: 'paste' });
  assert.equal(SF.need(w, c).extra.length, 1);
  SF.act(w, { t: 'undo' });
  assert.equal(SF.act(w, { t: 'ship' }), 'ok');
  assert.equal(c.ship > 0, true);
  assert.equal(SF.act(w, { t: 'click', x: c.x, y: SF.BOX.y + 170 }), 'none', 'a box on its way is not there to click');
  run(w, 1);
  assert.equal(c.ship, 0); assert.ok(!c.gone);
  assert.deepEqual({ ...c.order }, { teddy: 2 }, 'the next order comes in the same box');
  assert.equal(c.items.length, 0);
  assert.equal(w.done, 1); assert.equal(w.total, 2);
  // Two boxes: Enter sends the ready one even when the other one is picked.
  const v = SF.create(1, { seed: 7 });   // 1-2: car+ball and ball*2
  const [a, b] = boxes(v);
  click(v, beltToy(v, 'ball')); SF.act(v, { t: 'copy' });
  clickBox(v, b.i); SF.act(v, { t: 'paste' }); SF.act(v, { t: 'paste' });
  clickBox(v, a.i);
  assert.equal(SF.act(v, { t: 'ship' }), 'ok');
  assert.ok(b.ship > 0 && !(a.ship > 0));
});

test('stars: a wrong box or a slow day costs a star each; timed days count the time left', () => {
  const quick = solve(1).w;
  assert.equal(SF.stars(quick), 3);
  const slow = solve(1, { pace: 8 }).w;
  assert.ok(slow.t > slow.par);
  assert.equal(SF.stars(slow), 2);
  const oops = SF.create(0, { seed: 1 });
  click(oops, beltToy(oops, 'duck')); SF.act(oops, { t: 'copy' }); SF.act(oops, { t: 'paste' });
  SF.act(oops, { t: 'ship' });
  SF.act(oops, { t: 'paste' }); SF.act(oops, { t: 'ship' }); run(oops, 1);
  assert.equal(oops.mistakes, 1); assert.equal(SF.stars(oops), 2);
  oops.t = oops.par + 1; assert.equal(SF.stars(oops), 1, 'never fewer than one for a finished day');
  const timed = solve(5, { pace: 1 }).w;
  assert.ok(timed.left > timed.limit * 0.3); assert.equal(SF.stars(timed), 3);
  timed.left = timed.limit * 0.2; assert.equal(SF.stars(timed), 2);
  assert.deepEqual([1, 2, 3].map(s => [0, 0.55, 0.8, 1][s]), [0.55, 0.8, 1]);
  assert.equal(SF.outcome(quick), 1);
  assert.equal(SF.coins(quick), quick.done * 2 + quick.bonus + 6);
});

test('the gremlin messes a box when his time comes; one Ctrl+Z undoes it and bonks him', () => {
  const w = SF.create(18, { seed: 9, gremlinEvery: 10 });   // 4-1: he first comes after 8 s
  const [a, b] = boxes(w);
  click(w, beltToy(w, 'duck')); SF.act(w, { t: 'copy' }); SF.act(w, { t: 'paste' });
  clickBox(w, b.i); SF.act(w, { t: 'paste' });
  const before = floor(w), beforeIds = ids(w);
  run(w, 7.5);
  assert.equal(w.g.phase, 'away', 'he waits 8 s');
  for (let i = 0; i < 120 && w.g.phase !== 'come'; i++) SF.step(w, DT);
  assert.equal(w.g.phase, 'come', 'he is on his way');
  run(w, 1.4);
  assert.deepEqual(floor(w), before, 'nothing happens before he gets there');
  for (let i = 0; i < 60 && w.g.phase !== 'mess'; i++) SF.step(w, DT);
  assert.equal(w.g.phase, 'mess');
  assert.notDeepEqual(floor(w), before, 'he changed a box');
  assert.equal(w.undo[w.undo.length - 1].label, 'gremlin');
  assert.equal(SF.hint(w).act, 'gremlin', 'the coach says Ctrl+Z');
  assert.equal(SF.act(w, { t: 'undo' }), 'ok');
  assert.deepEqual(floor(w), before); assert.deepEqual(ids(w), beforeIds, 'exactly as before');
  assert.equal(w.g.phase, 'flee'); assert.equal(w.bonks, 1);
  assert.ok(w.bonus >= 2, 'a bonk is worth coins');
  run(w, 2);
  assert.equal(w.g.phase, 'away');
  // Ctrl+Y does his mess again; another Ctrl+Z fixes it (no second bonk: he is gone).
  SF.act(w, { t: 'redo' });
  assert.notDeepEqual(floor(w), before);
  SF.act(w, { t: 'undo' });
  assert.deepEqual(floor(w), before);
  assert.equal(w.bonks, 1);
  // The same seed makes the same mess.
  const messOf = seed => { const v = SF.create(22, { seed, gremlinEvery: 8 }); run(v, 9); return floor(v); };
  assert.deepEqual(messOf(11), messOf(11));
  // He keeps away from a finished day and from boxes on their way out.
  const done = solve(18).w;
  const g = done.g.phase;
  run(done, 30);
  assert.equal(done.g.phase, g === 'away' ? 'away' : done.g.phase);
});

test('preset histories: the gremlin\'s mess waits on Ctrl+Z, undone work waits on Ctrl+Y', () => {
  const w = SF.create(13, { seed: 1 });   // 3-2
  const [a, b] = boxes(w);
  assert.deepEqual(kinds(w, a.i), ['ball', '!car', 'robot']);
  assert.deepEqual(kinds(w, b.i), ['teddy']);
  assert.equal(w.g.phase, 'mess', 'he is still there, laughing');
  SF.act(w, { t: 'undo' });
  assert.deepEqual(kinds(w, a.i), ['ball', 'ball', 'car']);
  assert.deepEqual(kinds(w, b.i), ['teddy', 'teddy']);
  assert.equal(w.bonks, 1);
  assert.ok(SF.ready(w, a) && SF.ready(w, b));
  const two = SF.create(16, { seed: 1 });   // 3-5: two messes, two Ctrl+Z
  SF.act(two, { t: 'undo' });
  assert.ok(!SF.ready(two, boxes(two)[0]));
  SF.act(two, { t: 'undo' });
  assert.ok(boxes(two).every(c => SF.ready(two, c)));
  const r = SF.create(19, { seed: 1 });   // 4-2: three robots were undone
  const box = boxes(r)[0];
  assert.equal(box.items.length, 0); assert.equal(r.redo.length, 3);
  assert.equal(beltToy(r, 'robot'), 0, 'no robot to copy: only Ctrl+Y brings them back');
  for (let i = 1; i <= 3; i++) { assert.equal(SF.hint(r).act, 'redo'); SF.act(r, { t: 'redo' }); assert.deepEqual(kinds(r, box.i), new Array(i).fill('robot')); }
  assert.ok(SF.ready(r, box));
  const r2 = SF.create(21, { seed: 1 });   // 4-4: redo twice, not three times
  const b2 = boxes(r2)[0];
  SF.act(r2, { t: 'redo' }); SF.act(r2, { t: 'redo' });
  assert.ok(SF.ready(r2, b2));
  assert.equal(SF.hint(r2).act, 'ship', 'the third redo is the gremlin\'s: the coach does not ask for it');
  SF.act(r2, { t: 'redo' });
  assert.ok(!SF.ready(r2, b2));
  assert.equal(SF.hint(r2).act, 'gremlin', 'Ctrl+Z, against the gremlin');
  SF.act(r2, { t: 'undo' });
  assert.ok(SF.ready(r2, b2));
});

test('the stamp: Ctrl+S only ends the day once every box is out', () => {
  const w = SF.create(2, { seed: 3 });
  assert.equal(SF.act(w, { t: 'save' }), 'early');
  assert.ok(w.ev.some(e => e.t === 'saved'));
  assert.equal(w.phase, 'play');
  const { w: v } = solve(2);
  assert.equal(v.phase, 'done');
  assert.equal(SF.act(v, { t: 'save' }), 'over', 'nothing happens after the day is done');
});

test('hit testing follows the moving belts; toys in the tunnel cannot be clicked', () => {
  const w = SF.create(7, { seed: 2, speed: 40 });
  for (let k = 0; k < 40; k++) {
    for (const id of w.cons[0].items.filter(Boolean)) {
      const f = SF.find(w, id), h = SF.hit(w, f.x, f.y);
      if (SF.visible(f.x)) assert.deepEqual(plain(h), { con: 0, toy: id });
      else assert.notEqual(h && h.toy, id);
    }
    run(w, 0.5);
  }
  for (const c of boxes(w)) c.items.forEach((id, i) => { const p = SF.boxSpot(c, i); assert.deepEqual(plain(SF.hit(w, p.x, p.y)), { con: c.i, toy: id }); });
  assert.equal(SF.hit(w, 640, 710), null, 'the desk is not the floor');
});

test('saves: old, broken and hand-edited saves load as playable ones', () => {
  const fresh = SF.freshSave();
  for (const raw of [null, undefined, 'x', 7, [], [1, 2], {}, { v: 2, stars: [3, 3] }, { stars: [3] }]) assert.deepEqual(plain(SF.loadSave(raw)), plain(fresh));
  const s = SF.loadSave({ v: 1, stars: [3, 2, '3', 4, -1, 1.5, null, 1], best: [12, 40, 9, 9, 9, 9, 9, 0, 77], coins: -5, hats: ['cap', 'nope', 7], colors: 'sky', hat: 'crown', color: 'night', music: true });
  assert.deepEqual(plain(s.stars.slice(0, 9)), [3, 2, 0, 0, 0, 0, 0, 1, 0]);
  assert.equal(s.stars.length, 30);
  assert.deepEqual(plain(s.best.slice(0, 9)), [12, 40, 0, 0, 0, 0, 0, 0, 0], 'a best time needs a star');
  assert.equal(s.coins, 0);
  assert.deepEqual(plain(s.hats), ['none', 'cap']);
  assert.deepEqual(plain(s.colors), ['sun']);
  assert.equal(s.hat, 'none', 'a hat that is not owned is not worn');
  assert.equal(s.color, 'sun');
  assert.equal('music' in s, false);
  assert.equal(SF.loadSave({ v: 1, coins: 1e12 }).coins, 0);
  assert.equal(SF.loadSave({ v: 1, coins: 55, hats: ['none', 'prop'], hat: 'prop' }).hat, 'prop');
  assert.equal(SF.loadSave(JSON.parse(JSON.stringify(s))).stars[1], 2, 'a save survives a round trip');
});

test('results: stars only go up, the best time only down, the next level opens, coins add up', () => {
  const s = SF.freshSave();
  assert.ok(SF.isOpen(s, 0) && !SF.isOpen(s, 1) && !SF.isOpen(s, 30) && !SF.isOpen(s, -1));
  assert.equal(SF.nextLevel(s), 0);
  const w = solve(0, { pace: 10 }).w;
  const r = SF.applyResult(s, w);
  assert.equal(r.stars, 2); assert.equal(r.before, 0); assert.equal(r.best, true); assert.equal(r.unlocked, 1);
  assert.equal(s.stars[0], 2); assert.ok(SF.isOpen(s, 1)); assert.equal(SF.nextLevel(s), 1);
  assert.equal(s.coins, r.coins); assert.ok(r.coins > 0);
  assert.equal(s.best[0], r.time);
  const fast = solve(0).w, r2 = SF.applyResult(s, fast);
  assert.equal(r2.stars, 3); assert.equal(r2.before, 2); assert.equal(r2.best, true); assert.equal(r2.unlocked, -1);
  assert.ok(s.best[0] <= r.time);
  const slowAgain = solve(0, { pace: 10 }).w, r3 = SF.applyResult(s, slowAgain);
  assert.equal(r3.best, false); assert.equal(s.stars[0], 3, 'a worse day never takes stars away');
  const failed = SF.create(5, { seed: 1 }); run(failed, 200);
  const before = s.stars[5], r4 = SF.applyResult(s, failed);
  assert.equal(r4.stars, 0); assert.equal(s.stars[5], before); assert.equal(r4.coins, failed.done);
  assert.equal(SF.totalStars(s), 3); assert.equal(SF.worldStars(s, 0), 3);
  // The shop: too poor, bought (and worn), worn again.
  s.coins = 20;
  assert.equal(SF.buy(s, 'hat', 'hard'), 'poor'); assert.equal(s.coins, 20);
  assert.equal(SF.buy(s, 'hat', 'cap'), 'bought'); assert.equal(s.coins, 5); assert.equal(s.hat, 'cap');
  assert.equal(SF.buy(s, 'hat', 'none'), 'wear'); assert.equal(s.hat, 'none');
  assert.equal(SF.buy(s, 'hat', 'cap'), 'wear'); assert.equal(s.coins, 5, 'owned things are free');
  assert.equal(SF.buy(s, 'color', 'mint'), 'poor');
  assert.equal(SF.buy(s, 'color', 'sun'), 'wear');
  assert.equal(SF.buy(s, 'hat', 'unicorn'), 'poor');
  assert.deepEqual(plain(SF.loadSave(plain(s))), plain(s));
});

// Station rules, damaged saves, and registration for أكاديمية الفأرة واللوحة.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(repo, 'games/mouse-keyboard-academy');

function loadRules() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'rules.js'), 'utf8'), sandbox, { filename: 'rules.js' });
  return sandbox.window.MKA;
}

const MKA = loadRules();

function solveMaze() {
  // Right along the first corridor, down and left through flag 2, down and right
  // through flag 3, then down to the door. One wrong wall bump is included.
  const moves = []
    .concat(Array(7).fill('ArrowRight'))
    .concat(['ArrowUp', 'ArrowDown', 'ArrowDown'])
    .concat(Array(7).fill('ArrowLeft'))
    .concat(['ArrowDown', 'ArrowDown'])
    .concat(Array(7).fill('ArrowRight'))
    .concat(['ArrowDown', 'ArrowDown']);
  let state = MKA.mazeStart();
  const seen = [];
  for (const code of moves) {
    const before = state.flags;
    state = MKA.mazeStep(state, code);
    if (state.flags > before) seen.push(state.flags);
  }
  return { state, seen };
}

function runJump(presses) {
  let world = MKA.jumpStart();
  const plan = presses.slice();
  for (let i = 0; i < 1200 && !world.done; i++) {
    const input = plan.length && i === plan[0].at ? plan.shift().input : {};
    world = MKA.jumpStep(world, 1 / 60, input);
  }
  return world;
}

test('eight stations unlock one by one and a few successes finish each one', () => {
  assert.equal(MKA.STATIONS.length, 8);
  assert.deepEqual(Array.from(MKA.STATIONS, station => station.id),
    ['move', 'click', 'double', 'drag', 'scroll', 'arrows', 'jump', 'letters']);
  let save = MKA.freshSave();
  assert.equal(MKA.isOpen(save, 'move'), true);
  assert.equal(MKA.isOpen(save, 'click'), false);
  assert.equal(MKA.stickerCount(save), 0);
  for (const station of MKA.STATIONS) {
    let progress = 0;
    let complete = false;
    for (let n = 0; n < station.goal; n++) {
      const step = MKA.noteSuccess(progress, station.goal);
      progress = step.progress;
      complete = step.complete;
      if (n < station.goal - 1) assert.equal(complete, false, station.id);
    }
    assert.equal(progress, station.goal);
    assert.equal(complete, true);
    assert.equal(MKA.isOpen(save, station.id), true);
    save = MKA.markDone(save, station.id);
    assert.equal(save.done[station.id], true);
  }
  assert.equal(MKA.allDone(save), true);
  assert.equal(MKA.stickerCount(save), 8);
  assert.equal(save.unlocked, 9);
  const again = MKA.markDone(save, 'move');
  assert.equal(again.unlocked, 9);
  assert.equal(MKA.markDone(save, 'nope').done.nope, undefined);
});

test('a station stays locked until the previous sticker is earned', () => {
  let save = MKA.freshSave();
  save = MKA.markDone(save, 'move');
  assert.equal(MKA.isOpen(save, 'click'), true);
  assert.equal(MKA.isOpen(save, 'double'), false);
  assert.equal(save.done.click, undefined);
  const jumped = MKA.jumpTo(save, 'letters');
  assert.equal(jumped.done.letters, undefined);
  assert.equal(jumped.done.move, true);
  assert.equal(MKA.isOpen(jumped, 'letters'), true);
  assert.equal(MKA.isOpen(jumped, 'scroll'), true);
  assert.equal(MKA.jumpTo(save, 'missing').unlocked, save.unlocked);
});

test('damaged saves load as a playable academy', () => {
  const fresh = MKA.freshSave();
  for (const junk of [null, undefined, '', 'nope', 4, [], { done: [] }, { done: 'x' }]) {
    assert.deepEqual(MKA.loadSave(junk), fresh);
  }
  const messy = MKA.loadSave({
    v: 'old',
    done: { move: 'yes', nope: true, click: true, double: 1, drag: false },
    unlocked: 'lots',
    name: '  سلام\u0000عليكم   جدا جدا جدا  ',
    extra: { steal: true }
  });
  assert.equal(messy.done.move, undefined);
  assert.equal(messy.done.click, true);
  assert.equal(messy.done.nope, undefined);
  assert.equal(messy.done.double, undefined);
  assert.equal(messy.unlocked, 3);
  assert.equal(messy.name.length <= 16, true);
  assert.equal(messy.name.includes('\u0000'), false);
  assert.equal(Object.hasOwn(messy, 'extra'), false);
  const numbered = MKA.loadSave({ unlocked: '4', done: { letters: true }, name: 'ل' });
  assert.equal(numbered.unlocked, 9);
  assert.equal(numbered.name, 'ل');
  assert.equal(MKA.loadSave({ unlocked: 0 }).unlocked, 1);
  assert.equal(MKA.loadSave({ unlocked: 1.5 }).unlocked, 1);
  assert.equal(MKA.loadSave({ unlocked: 99, done: {} }).unlocked, 9);
});

test('home row is Arabic 101 and the grip lesson is not a ninth station', () => {
  assert.equal(MKA.STATIONS.length, 8);
  assert.deepEqual(Array.from(MKA.HOME_LEFT, code => MKA.AR[code]), ['ش', 'س', 'ي', 'ب']);
  assert.deepEqual(Array.from(MKA.HOME_LEFT, code => MKA.EN[code]), ['A', 'S', 'D', 'F']);
  assert.deepEqual(Array.from(MKA.HOME_RIGHT, code => MKA.AR[code]), ['ت', 'ن', 'م', 'ك']);
  assert.deepEqual(Array.from(MKA.HOME_RIGHT, code => MKA.EN[code]), ['J', 'K', 'L', ';']);
  assert.deepEqual(Array.from(MKA.KEY_ROWS[1]).slice(0, 4), Array.from(MKA.HOME_LEFT));
  assert.deepEqual(Array.from(MKA.KEY_ROWS[1]).slice(6, 10), Array.from(MKA.HOME_RIGHT));
  assert.equal(MKA.FINGER_OF.KeyF, 'index');
  assert.equal(MKA.FINGER_OF.KeyJ, 'index');
  const fresh = MKA.freshSave();
  assert.equal(fresh.grip, false);
  assert.equal(MKA.gripNeeded(fresh), true);
  assert.equal(MKA.gripNeeded(null), false);
  const learned = MKA.markGrip(fresh);
  assert.equal(learned.grip, true);
  assert.equal(MKA.gripNeeded(learned), false);
  const kept = MKA.markDone(learned, 'move');
  assert.equal(kept.grip, true);
  assert.equal(kept.done.move, true);
  assert.equal(MKA.gripNeeded(MKA.loadSave({ unlocked: 2 })), false);
  assert.equal(MKA.gripNeeded(MKA.loadSave({ done: { move: true } })), false);
  assert.equal(MKA.loadSave({ grip: 'yes' }).grip, false);
  assert.equal(MKA.loadSave({ grip: true }).grip, true);
  assert.equal(MKA.bumpPress(0, 'KeyA').hit, false);
  assert.equal(MKA.bumpPress(0, 'KeyA').done, false);
  const left = MKA.bumpPress(0, 'KeyF');
  assert.equal(left.bits, 1);
  assert.equal(left.done, false);
  assert.equal(left.hit, true);
  const again = MKA.bumpPress(left.bits, 'KeyF');
  assert.equal(again.bits, 1);
  assert.equal(again.done, false);
  const both = MKA.bumpPress(left.bits, 'KeyJ');
  assert.equal(both.bits, 3);
  assert.equal(both.done, true);
  assert.equal(both.hit, true);
});

test('names keep one character and drop control characters', () => {
  const named = value => { const result = MKA.acceptName(value); return { ok: result.ok, name: result.name }; };
  assert.deepEqual(named('   '), { ok: false, name: '' });
  assert.deepEqual(named(' ل '), { ok: true, name: 'ل' });
  assert.equal(MKA.acceptName('أبجد هوز حطي كلمن سعفص').name.length, 16);
  assert.equal(MKA.cleanName('a\nb'), 'ab');
});

test('double-click accepts a generous window and a slow second press starts over', () => {
  const first = MKA.doubleClick(null, 1000, MKA.DOUBLE_MS);
  assert.equal(first.opened, false);
  const opened = MKA.doubleClick(first.time, 1000 + MKA.DOUBLE_MS, MKA.DOUBLE_MS);
  assert.equal(opened.opened, true);
  assert.equal(opened.time, null);
  const late = MKA.doubleClick(1000, 1000 + MKA.DOUBLE_MS + 1, MKA.DOUBLE_MS);
  assert.equal(late.opened, false);
  assert.equal(late.time, 1801);
  assert.equal(MKA.hintDue(4999), false);
  assert.equal(MKA.hintDue(5000), true);
});

test('letter keys follow event.code and hint when the layout is English', () => {
  assert.deepEqual(Array.from(MKA.LETTERS), ['KeyH', 'KeyF', 'KeyJ', 'KeyL']);
  assert.deepEqual(Array.from(MKA.LETTERS, code => MKA.AR[code]), ['ا', 'ب', 'ت', 'م']);
  for (const code of MKA.LETTERS) {
    assert.ok(MKA.KEY_ROWS.some(row => row.includes(code)), code);
    assert.equal(typeof MKA.EN[code], 'string');
  }
  assert.equal(MKA.acceptKey('KeyH', 'KeyH'), true);
  assert.equal(MKA.acceptKey('KeyH', 'KeyG'), false);
  assert.equal(MKA.languageHint('KeyH', 'ا'), '');
  assert.equal(MKA.languageHint('KeyH', 'أ'), '');
  assert.match(MKA.languageHint('KeyH', 'h'), /الإنجليزية/);
  assert.match(MKA.languageHint('KeyH', 'H'), /الإنجليزية/);
  assert.equal(MKA.languageHint('KeyH', 'Unidentified'), '');
  assert.equal(MKA.languageHint('KeyH', ''), '');
  assert.equal(MKA.languageHint('Nope', 'h'), '');
});

test('the first try is the largest and the most patient', () => {
  assert.equal(MKA.starRadius(-1), MKA.starRadius(0));
  assert.ok(MKA.starRadius(0) > MKA.starRadius(1));
  assert.ok(MKA.starRadius(1) > MKA.starRadius(3));
  assert.equal(MKA.starRadius(20), 80);
  assert.ok(MKA.doubleWindow(0) > MKA.doubleWindow(1));
  assert.equal(MKA.doubleWindow(1) > MKA.DOUBLE_MS, true);
  assert.equal(MKA.doubleWindow(2), MKA.DOUBLE_MS);
  assert.equal(MKA.doubleWindow(8), MKA.DOUBLE_MS);
});

test('drops, scrolling, and balloons stay forgiving', () => {
  const animal = { x: 400, y: 200, w: 160, h: 140 };
  assert.equal(MKA.dropHits(480, 270, animal), true);
  assert.equal(MKA.dropHits(400 - MKA.DROP_SLOP, 200, animal), true);
  assert.equal(MKA.dropHits(10, 10, animal), false);
  assert.equal(MKA.dropHits(NaN, 10, animal), false);
  assert.equal(MKA.friendReached(0, 400, 500, 80), false);
  assert.equal(MKA.friendReached(0, 400, 360, 80), true);
  assert.equal(MKA.friendReached(900, 400, 100, 80), true);
  assert.equal(MKA.balloonScale(0), 1);
  assert.ok(MKA.balloonScale(4) < MKA.balloonScale(1));
  assert.equal(MKA.balloonScale(20), 0.48);
});

test('the maze needs the three flags and only arrow keys move', () => {
  const start = MKA.mazeStart();
  assert.equal(MKA.mazeHint(start), 'ArrowRight');
  const bumped = MKA.mazeStep(start, 'ArrowUp');
  assert.deepEqual(bumped, start);
  assert.equal(MKA.mazeStep(start, 'KeyD').x, start.x);
  const solved = solveMaze();
  assert.deepEqual(solved.seen, [1, 2, 3]);
  assert.equal(solved.state.done, true);
  const blocked = MKA.mazeStep({ x: 1, y: 1, flags: 0, done: false }, 'ArrowRight');
  assert.equal(blocked.flags, 1);
  const custom = { x: 0, y: 1, flags: 0, done: false };
  assert.equal(MKA.mazeStep(custom, 'ArrowUp').y, 1);
});

test('jumping never fails: a bush waits, Space clears it, Enter opens only the door', () => {
  const waiting = runJump([]);
  assert.equal(waiting.phase, 'wait');
  assert.equal(waiting.jumps, 0);
  assert.equal(waiting.done, false);
  const early = runJump([{ at: 0, input: { space: true } }]);
  assert.ok(early.jumps >= 1, 'an early Space still clears the first bush');
  assert.equal(early.done, false);
  let world = MKA.jumpStart();
  for (let bush = 0; bush < 3; bush++) {
    for (let i = 0; i < 400 && world.phase !== 'wait'; i++) world = MKA.jumpStep(world, 1 / 60, {});
    assert.equal(world.phase, 'wait');
    assert.equal(world.jumps, bush);
    world = MKA.jumpStep(world, 1 / 60, { space: true });
    assert.equal(world.jumps, bush + 1);
    for (let i = 0; i < 80 && world.phase === 'hop'; i++) world = MKA.jumpStep(world, 1 / 60, { spaceHeld: true });
  }
  for (let i = 0; i < 400 && world.phase !== 'door'; i++) world = MKA.jumpStep(world, 1 / 60, {});
  assert.equal(world.phase, 'door');
  const tooSoon = MKA.jumpStep(MKA.jumpStart(), 1 / 60, { enter: true });
  assert.equal(tooSoon.done, false);
  assert.equal(tooSoon.note, 'later');
  const finished = MKA.jumpStep(world, 1 / 60, { enter: true });
  assert.equal(finished.done, true);
  assert.equal(finished.note, '');
});

test('the academy is registered, cached, and free of network calls', () => {
  const catalog = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), catalog);
  const games = catalog.window.GAMES;
  const entry = games.find(game => game.slug === 'mouse-keyboard-academy');
  assert.ok(entry, 'catalog entry');
  assert.equal(entry.starter, true);
  assert.equal(games.filter(game => game.starter).length, 1);
  assert.equal(entry.title, 'أكاديمية الفأرة واللوحة');
  assert.equal(entry.inputStyle, 'mixed');
  assert.equal(entry.players, '1');
  assert.ok(Array.isArray(entry.controls) && entry.controls.length >= 4);
  for (const file of ['index.html', 'style.css', 'game.js', 'rules.js', 'thumb.svg']) {
    assert.equal(fs.existsSync(path.join(dir, file)), true, file);
  }
  const thumb = fs.readFileSync(path.join(dir, 'thumb.svg'), 'utf8');
  assert.match(thumb, /viewBox="0 0 400 400"/);
  assert.equal(/<image|href="http/.test(thumb), false);
  assert.ok(thumb.length < 30000);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /lang="ar"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /shared\/kit\.js/);
  assert.match(html, /shared\/game\.css/);
  assert.equal(/https?:\/\//.test(html + fs.readFileSync(path.join(dir, 'game.js'), 'utf8') + fs.readFileSync(path.join(dir, 'rules.js'), 'utf8')), false);
  assert.match(fs.readFileSync(path.join(dir, 'game.js'), 'utf8'), /Kit\.stats\.round\(/);
  assert.match(fs.readFileSync(path.join(dir, 'game.js'), 'utf8'), /Kit\.stats\.end\(/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'rules.js'), 'utf8'), /Kit\.stats/);
  assert.match(fs.readFileSync(path.join(repo, 'sw.js'), 'utf8'), /games\/mouse-keyboard-academy\/index\.html/);
  const budgets = JSON.parse(fs.readFileSync(path.join(repo, 'tools/asset-budgets.json'), 'utf8'));
  assert.equal(typeof budgets.gameHtmlBytes['mouse-keyboard-academy'], 'number');
  const teacherJs = fs.readFileSync(path.join(repo, 'js/teacher.js'), 'utf8');
  assert.match(teacherJs, /mouse-keyboard-academy/);
  const teacher = fs.readFileSync(path.join(repo, 'teacher.html'), 'utf8');
  for (const id of MKA.STATIONS.map(station => station.id)) {
    assert.match(teacher, new RegExp('station=' + id));
  }
  assert.match(teacher, /id="academyReset"/);
  assert.match(fs.readFileSync(path.join(repo, 'js/site.js'), 'utf8'), /class="starter"/);
  assert.match(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), /أكاديمية الفأرة واللوحة/);
});

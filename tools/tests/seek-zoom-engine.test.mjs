// Seek and Zoom engine (games/seek-zoom/engine.js): the scenes, every round's things to
// find at every difficulty, the fixed full-scene camera, the movable magnifying glass lens,
// the wheel, clicks, stars and saves. Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/seek-zoom/engine.js'), 'utf8');
const load = () => { const sandbox = { window: {} }; vm.runInNewContext(source, sandbox); return sandbox.window.SZ; };
const SZ = load();
const plain = v => JSON.parse(JSON.stringify(v));
const W = SZ.W, H = SZ.H;
const ARABIC = /^[؀-ۿ ]+$/;
// What Kit.dda can hand the engine (game.js: size 1.2..0.85, 0..4 look-alikes, speed
// 0.75..1.25, a penalty from tier 3, the time factor 1.3..0.85, three arrangements).
const PARAMS = [];
for (const size of [1.2, 1, 0.85]) for (const decoys of [0, 2, 4]) for (const seed of [0, 1, 2]) PARAMS.push({ size, decoys, seed, speed: size > 1 ? 0.75 : 1.25, pen: size < 1 ? 5 : 0, timeK: size > 1 ? 1.3 : 0.85 });
const ROUNDS = [];
for (let w = 0; w < SZ.WORLDS.length; w++) for (let r = 0; r < SZ.PER; r++) ROUNDS.push([w, r]);

// The furthest a click can reach a thing (at any zoom), and where it can be.
const maxHit = it => Math.max(it.r * 1.7, it.cv ? it.cv.r * 1.5 : 0);
function gap(a, b) {
  const ax = a.m ? a.m.ax : 0, ay = a.m ? a.m.ay : 0, bx = b.m ? b.m.ax : 0, by = b.m ? b.m.ay : 0;
  return Math.hypot(Math.max(0, Math.abs(a.x - b.x) - ax - bx), Math.max(0, Math.abs(a.y - b.y) - ay - by));
}
function zoneShapes(Wd, names) { return names.split(' ').flatMap(n => Wd.zones[n] || []); }
// A magnifying glass on round R over screen point (sx, sy) at zoom z.
function lensAt(R, sx, sy, z) {
  const lens = SZ.lens(R);
  lens.on = true;
  SZ.moveLens(lens, sx, sy);
  lens.z = lens.tz = z;
  return lens;
}

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(SZ && SZ.makeRound && SZ.camera && SZ.lens && SZ.lensCam && SZ.hit, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|performance\./);
});

test('every scene is the same every time, busy, and every filler thing has a box to be drawn in', () => {
  const again = load();
  for (let w = 0; w < SZ.WORLDS.length; w++) {
    const S = SZ.scene(w), Wd = SZ.WORLDS[w];
    assert.deepEqual(plain(S), plain(again.scene(w)), Wd.id + ' is deterministic');
    assert.ok(S.objs.length >= 170, `${Wd.id} is busy: ${S.objs.length} things`);
    for (const o of S.objs) {
      const B = SZ.FB[o.k];
      assert.ok(B, `${Wd.id}: ${o.k} has a box`);
      assert.deepEqual(plain(o.b), [Math.round(o.x + B[0] * o.s), Math.round(o.y + B[1] * o.s), Math.round(o.x + B[2] * o.s), Math.round(o.y + B[3] * o.s)]);
      assert.ok(o.x >= -50 && o.x <= S.w + 50 && o.y >= -10 && o.y <= S.h + 10, `${Wd.id}: ${o.k} at ${o.x},${o.y} is in the scene`);
    }
    // Back to front: flat things, then standing things by their feet, then overhead.
    for (let i = 1; i < S.objs.length; i++) {
      const a = S.objs[i - 1], b = S.objs[i];
      assert.ok(a.l < b.l || (a.l === b.l && a.y <= b.y), 'painter order');
    }
    // Every scene is 16:9 and at least 2x screen size, filling the fixed view edge to edge.
    assert.ok(S.w >= 2 * W && S.h >= 2 * H);
    assert.equal(S.w / W, S.h / H, `${Wd.id} matches the 16:9 screen`);
  }
});

test('every thing to find has an Arabic name, and every round lists things its place has', () => {
  for (const [k, K] of Object.entries(SZ.KINDS)) {
    for (const v of K.v) assert.match(SZ.label(k, v), ARABIC, `${k} ${v}`);
    assert.ok(K.r > 10 && K.r < 40);
  }
  for (const [w, r] of ROUNDS) {
    const Wd = SZ.WORLDS[w], d = Wd.rounds[r];
    assert.ok(d.f.length >= 3 && d.f.length <= 6, `${Wd.id} ${r}: 3 to 6 things`);
    for (const [k, v, n] of d.f) {
      assert.ok(Wd.home[k], `${Wd.id} has ${k}`);
      assert.ok(SZ.KINDS[k].v.includes(v), `${k} comes in ${v}`);
      assert.ok(n >= 1 && n <= 3);
    }
    assert.equal(new Set(d.f.map(f => f[0] + f[1])).size, d.f.length, 'no thing twice on a list');
  }
  assert.equal(SZ.label('cat', 'sleep'), 'قطّ نائم');
  assert.equal(SZ.label('duck', 'yellow'), 'بطّة صفراء');
  assert.equal(SZ.label('balloon', 'red'), 'بالون أحمر');
});

test('the teaching ramp: big things on the full fixed scene first, then magnifying glass needed, moving things, covers, timed rounds', () => {
  const R = (w, r) => SZ.makeRound(w, r, { size: 1, decoys: 1 });
  assert.deepEqual([R(0, 0).zmin, R(0, 1).zmin, R(1, 0).zmin], [0.5, 0.5, 0.4], 'every round starts showing the entire scene');
  for (const [w, r] of ROUNDS) assert.ok(R(w, r).zmax > R(w, r).zmin, 'the magnifying glass is available in every round');
  for (const p of PARAMS) {
    for (const r of [0, 1]) {
      const E = SZ.makeRound(0, r, p);
      assert.ok(E.items.filter(i => i.e >= 0).every(i => SZ.needZoom(i) <= E.zmin), 'the first two rounds can be clicked directly on the full scene');
    }
    const Z = SZ.makeRound(0, 2, p);
    assert.ok(Z.items.filter(i => i.e >= 0).every(i => SZ.needZoom(i) > Z.zmin), 'the third round needs the magnifying glass for every thing, even at the biggest size');
  }
  assert.ok(R(0, 0).items.filter(i => i.e >= 0).every(i => i.r * R(0, 0).zmin >= SZ.MIN_R * 1.5), 'the first things are big on the full scene');
  const need = w => { let n = 0, s = 0; for (let r = 0; r < SZ.PER; r++) for (const it of R(w, r).items) if (it.e >= 0) { s += SZ.needZoom(it); n++; } return s / n; };
  assert.ok(need(1) > need(0) && need(2) > need(1), 'things get smaller');
  assert.ok(R(2, 0).items.some(i => i.e >= 0 && i.m), 'the beach has moving things');
  assert.ok(R(3, 0).items.some(i => i.e >= 0 && i.cv), 'the toy room hides things in boxes');
  assert.ok(R(4, 0).limit > 0, 'the space station is timed');
  for (const [w, r] of ROUNDS.slice(0, 20)) assert.equal(R(w, r).limit, 0, 'only the last place is timed');
});

test('every round at every difficulty: each thing exists, in its zone, inside the scene, clear of the HUD, apart from all others', () => {
  for (const [w, r] of ROUNDS) {
    const Wd = SZ.WORLDS[w], S = SZ.scene(w);
    for (const p of PARAMS) {
      const R = SZ.makeRound(w, r, p), cam = SZ.camera(S, R), label = `${Wd.id} round ${r + 1} ${JSON.stringify(p)}`;
      assert.equal(R.failed, 0, label + ': every thing was placed');
      assert.equal(R.list.length, R.d.f.length);
      R.list.forEach((e, i) => assert.equal(R.items.filter(it => it.e === i).length, e.n, `${label}: ${e.n} × ${e.k}`));
      assert.equal(R.total, R.list.reduce((a, e) => a + e.n, 0));
      for (const it of R.items) {
        const shapes = zoneShapes(Wd, it.cv ? Wd.coverZone : Wd.home[it.k]), big = Math.max(it.r, it.cv ? it.cv.r : 0);
        const ex = big * 1.25 + (it.m ? it.m.ax : 0), ey = big * 1.25 + (it.m ? it.m.ay : 0);
        assert.ok(shapes.some(s => SZ.inShape(s, it.x, it.y, ex, ey)), `${label}: ${it.k || 'cover'} at ${it.x},${it.y} is in its zone`);
        assert.ok(it.x - ex >= 0 && it.x + ex <= S.w && it.y - ey >= 0 && it.y + ey <= S.h, label + ': inside the scene');
        const cs = SZ.toScreen(cam, it.x, it.y);
        assert.equal(SZ.inHud(cs.x, cs.y, ex * cam.z, ey * cam.z, R.list.length), false, `${label}: ${it.k || 'cover'} stays clear of the HUD`);
        if (it.e < 0 && it.k) assert.ok(!R.list.some(e => e.k === it.k && e.v === it.v), label + ': a look-alike is never a thing on the list');
      }
      for (const t of R.items) {
        if (t.e < 0) continue;
        for (const o of R.items) {
          if (o === t) continue;
          assert.ok(gap(t, o) >= maxHit(t) + maxHit(o), `${label}: ${t.k}#${t.id} and ${o.k || 'cover'}#${o.id} do not overlap (${gap(t, o).toFixed(1)})`);
        }
      }
    }
  }
});

test('every thing to find can be seen big enough under the magnifying glass on the fixed scene and picked cleanly', () => {
  for (const [w, r] of ROUNDS) {
    const S = SZ.scene(w);
    for (const p of [PARAMS[0], PARAMS[PARAMS.length - 1]]) {
      const R = SZ.makeRound(w, r, p), cam = SZ.camera(S, R);
      assert.deepEqual(plain(SZ.toScreen(cam, 0, 0)), { x: 0, y: 0 });
      assert.deepEqual(plain(SZ.toScreen(cam, S.w, S.h)), { x: W, y: H });
      for (const it of R.items) {
        if (it.e < 0) continue;
        const need = SZ.needZoom(it), label = `${SZ.WORLDS[w].id} ${r + 1}: ${it.k}`;
        assert.ok(need <= R.zmax - 0.1, `${label} needs zoom ${need.toFixed(2)} of ${R.zmax}`);
        assert.ok(it.r * R.zmax >= SZ.MIN_R * 1.4, `${label} is at least ${SZ.MIN_R * 1.4}px at the top zoom`);
        if (it.cv) assert.ok(it.cv.zo >= R.zmin, label + ': its cover is shut at the start');
        for (let t = 0; t < 4; t++) {
          const pos = SZ.pos(it, t * 3), s = SZ.toScreen(cam, pos.x, pos.y);
          assert.equal(SZ.inHud(s.x, s.y, 4, 4, R.list.length), false, label + ' stays clear of the HUD while moving');
        }
        // Centering the magnifying glass over it on the fixed scene finds that very thing.
        const pos = SZ.pos(it, 0), s = SZ.toScreen(cam, pos.x, pos.y);
        const z = Math.min(R.zmax, Math.max(need + 0.05, R.zmin * 1.6)), lens = lensAt(R, s.x, s.y, z);
        const h = SZ.hit(R, cam, s.x, s.y, lens);
        assert.equal(h.it, it, label + ': the click through the lens picks it');
        assert.equal(h.t, 'found', label);
        if (need <= R.zmin) assert.equal(SZ.hit(R, cam, s.x, s.y, null).t, 'found', label + ': also clickable without the lens');
      }
    }
  }
});

test('rounds are the same for the same difficulty and arrangement, and the arrangements differ', () => {
  const again = load();
  for (const [w, r] of ROUNDS) {
    const a = SZ.makeRound(w, r, PARAMS[4]), b = again.makeRound(w, r, PARAMS[4]);
    assert.deepEqual(plain(a.items), plain(b.items));
    const c = SZ.makeRound(w, r, { ...PARAMS[4], seed: (PARAMS[4].seed + 1) % 3 });
    assert.notDeepEqual(a.items.map(i => [i.x, i.y]), c.items.map(i => [i.x, i.y]), 'another arrangement');
  }
  // Odd difficulty values are clamped, never break a round.
  const odd = SZ.makeRound(1, 2, { size: 'big', decoys: 99, speed: -3, seed: 1e9, timeK: NaN });
  assert.equal(odd.failed, 0);
});

test('the world camera stays fixed showing the full scene; the magnifying glass stays always visible (even at zoom 0), moves, and zooms eased or at once', () => {
  for (let w = 0; w < SZ.WORLDS.length; w++) {
    const S = SZ.scene(w), R = SZ.makeRound(w, 0, {}), cam = SZ.camera(S, R);
    assert.equal(cam.x, S.w / 2); assert.equal(cam.y, S.h / 2); assert.equal(cam.z, R.zmin);
    assert.deepEqual(plain(SZ.toScreen(cam, 0, 0)), { x: 0, y: 0 });
    assert.deepEqual(plain(SZ.toScreen(cam, S.w, S.h)), { x: W, y: H });
  }
  const S = SZ.scene(1), R = SZ.makeRound(1, 0, {}), cam = SZ.camera(S, R);
  for (const still of [true, false]) {
    const lens = SZ.lens(R);
    assert.equal(lens.on, true, 'the magnifying glass starts visible');
    assert.equal(lens.z, R.zmin);
    assert.equal(SZ.zoomLens(lens, 0.8, still), false, 'zooming out when already at 0 does nothing');
    assert.equal(lens.on, true, 'and never hides the lens');
    SZ.moveLens(lens, 812, 290);
    const before = SZ.toWorld(cam, 812, 290);
    assert.equal(SZ.zoomLens(lens, 2.5, still), true);
    assert.equal(lens.on, true);
    if (!still) {
      SZ.stepLens(lens, 1 / 60, false);
      assert.ok(lens.z > R.zmin && lens.z < lens.tz, 'eases over several frames');
    }
    for (let i = 0; i < 90; i++) {
      SZ.stepLens(lens, 1 / 60, still);
      const lc = SZ.lensCam(cam, lens), now = SZ.toWorld(lc, 812, 290);
      assert.ok(Math.abs(now.x - before.x) < 1e-6 && Math.abs(now.y - before.y) < 1e-6, `frame ${i}: the scene point under the lens center stays put`);
    }
    assert.ok(Math.abs(lens.z - R.zmin * 2.5) < 1e-9);
    assert.equal(SZ.stepLens(lens, 1 / 60, still), false, 'the zoom finished');
    // Zooming all the way back out to zmin (eased or instant) keeps lens.on === true.
    assert.equal(SZ.zoomLens(lens, 0.05, still), true);
    for (let i = 0; i < 120; i++) SZ.stepLens(lens, 1 / 60, still);
    assert.equal(lens.z, R.zmin);
    assert.equal(lens.on, true, 'the magnifying glass stays visible at zoom 0');
  }
  const lens = SZ.lens(R);
  for (let i = 0; i < 40; i++) SZ.zoomLens(lens, 1.5, true);
  assert.equal(lens.z, R.zmax, 'never past the top zoom');
  assert.equal(SZ.zoomLens(lens, 1.5, true), false, 'no change at the top');
  for (let i = 0; i < 40; i++) SZ.zoomLens(lens, 0.5, true);
  assert.equal(lens.z, R.zmin, 'never below the whole scene');
  assert.equal(lens.on, true, 'zooming all the way out keeps the magnifying glass visible');
  // Moving clamps to the screen and reports whether it moved.
  assert.equal(SZ.moveLens(lens, -500, 9999), true);
  assert.deepEqual([lens.x, lens.y], [24, H - 24]);
  assert.equal(SZ.moveLens(lens, -100, 9000), false);
  assert.equal(SZ.inLens(null, 24, H - 24), false);
  assert.equal(SZ.inLens(lens, 24 + SZ.LENS_R - 1, H - 24), true);
  assert.equal(SZ.inLens(lens, 24 + SZ.LENS_R + 1, H - 24), false);
});

test('the wheel: pixels, lines and pages; tiny trackpad steps and huge notches; up zooms in', () => {
  const notch = SZ.wheelFactor(-100, 0);
  assert.ok(notch > 1.2 && notch < 1.3, 'a notch up zooms in by about 1.25');
  assert.ok(Math.abs(SZ.wheelFactor(100, 0) * notch - 1) < 1e-12, 'a notch down undoes it');
  const lines = SZ.wheelFactor(-3, 1);
  assert.ok(lines > 1.2 && lines < 1.35, 'three lines are about one notch');
  assert.ok(SZ.wheelFactor(-1, 2) <= Math.exp(240 * 0.0022) + 1e-12, 'a page is capped');
  const pad = SZ.wheelFactor(-4, 0);
  assert.ok(pad > 1 && pad < 1.01, 'a trackpad step is a tiny zoom');
  assert.ok(Math.abs(SZ.wheelFactor(-5000, 0) - SZ.wheelFactor(-240, 0)) < 1e-12 && SZ.wheelFactor(-5000, 0) < 1.75, 'a huge notch is capped');
  assert.equal(SZ.wheelFactor(NaN, 0), 1);
  assert.equal(SZ.wheelFactor(0, 0), 1);
  // Many small steps add up to the same zoom as one big one.
  let f = 1; for (let i = 0; i < 25; i++) f *= SZ.wheelFactor(-4, 0);
  assert.ok(Math.abs(f - notch) < 1e-9);
});

test('clicks: found through the lens, already found, too small outside or without the lens, a shut cover, a look-alike, empty ground', () => {
  const S = SZ.scene(3), R = SZ.makeRound(3, 0, { size: 1, decoys: 2 }), cam = SZ.camera(S, R);
  const t = R.items.find(i => i.e >= 0 && !i.cv), cov = R.items.find(i => i.e >= 0 && i.cv), dec = R.items.find(i => i.e < 0 && i.k && !i.cv);
  const ts = SZ.toScreen(cam, t.x, t.y), cs = SZ.toScreen(cam, cov.x, cov.y), ds = SZ.toScreen(cam, dec.x, dec.y);
  assert.ok(t.r * R.zmin < SZ.MIN_R);
  assert.equal(SZ.click(R, cam, ts.x, ts.y, null).t, 'small', 'too small to pick without the lens');
  assert.equal(R.wrong, 0, 'a zoom hint is not a wrong click');
  // A lens far away does not magnify t.
  const farLens = lensAt(R, ts.x > 640 ? 150 : 1130, ts.y, SZ.needZoom(t) + 0.2);
  assert.equal(SZ.click(R, cam, ts.x, ts.y, farLens).t, 'small', 'outside the lens circle stays unmagnified');
  // Magnifying t with the lens finds it.
  const tLens = lensAt(R, ts.x, ts.y, SZ.needZoom(t) + 0.05);
  const h = SZ.click(R, cam, ts.x, ts.y, tLens);
  assert.equal(h.t, 'found'); assert.equal(R.found, 1); assert.equal(R.list[t.e].got, 1); assert.equal(t.got, true);
  assert.equal(SZ.click(R, cam, ts.x, ts.y, tLens).t, 'again');
  assert.equal(R.found, 1);
  // Covered item: shut at low lens zoom, open once magnified past zo.
  assert.equal(SZ.click(R, cam, cs.x, cs.y, lensAt(R, cs.x, cs.y, cov.cv.zo - 0.05)).t, 'closed');
  const openLens = lensAt(R, cs.x, cs.y, SZ.needZoom(cov) + 0.02);
  assert.ok(SZ.coverOpen(cov, openLens.z) >= SZ.OPEN_AT);
  assert.equal(SZ.click(R, cam, cs.x, cs.y, openLens).t, 'found');
  assert.equal(SZ.click(R, cam, ds.x, ds.y, lensAt(R, ds.x, ds.y, 2)).t, 'decoy');
  assert.equal(R.wrong, 1);
  // Empty ground: a point far from everything.
  let miss = null;
  for (let x = 120; x < 1200 && !miss; x += 37) for (let y = 90; y < 560 && !miss; y += 41) if (SZ.hit(R, cam, x, y, null).t === 'miss') miss = [x, y];
  assert.ok(miss);
  assert.equal(SZ.click(R, cam, miss[0], miss[1], null).t, 'miss');
  assert.equal(R.wrong, 2);
  assert.equal(R.found, 2, 'wrong clicks never find anything');
});

test('the round: the clock, wrong clicks in a row cost seconds only when the penalty is on, time-up, stars', () => {
  const S = SZ.scene(4), R = SZ.makeRound(4, 0, { pen: 5, timeK: 1 });
  assert.equal(R.limit, 120);
  const cam = SZ.camera(S, R);
  let miss = null;
  for (let x = 120; x < 1200 && !miss; x += 37) for (let y = 90; y < 560 && !miss; y += 41) if (SZ.hit(R, cam, x, y, null).t === 'miss') miss = [x, y];
  SZ.click(R, cam, ...miss); SZ.click(R, cam, ...miss);
  assert.equal(R.pen, 0);
  const third = SZ.click(R, cam, ...miss);
  assert.equal(third.pen, 5); assert.equal(R.pen, 5); assert.equal(R.row, 0);
  for (let i = 0; i < 60 * 30; i++) SZ.tick(R, 1 / 60);
  assert.ok(Math.abs(SZ.left(R) - (120 - 30 - 5)) < 1e-6);
  for (let i = 0; i < 60 * 100 && !R.over; i++) SZ.tick(R, 1 / 60);
  assert.equal(R.timeUp, true); assert.equal(R.over, true); assert.equal(SZ.stars(R), 0);
  assert.equal(SZ.click(R, cam, ...miss).t, 'over', 'nothing counts after the end');
  assert.equal(SZ.outcome(R), 0.1);
  // Without the penalty, wrong clicks only count.
  const Q = SZ.makeRound(1, 0, { pen: 0 }), qc = SZ.camera(SZ.scene(1), Q);
  let m2 = null;
  for (let x = 120; x < 1200 && !m2; x += 37) for (let y = 90; y < 560 && !m2; y += 41) if (SZ.hit(Q, qc, x, y, null).t === 'miss') m2 = [x, y];
  for (let i = 0; i < 6; i++) SZ.click(Q, qc, ...m2);
  assert.equal(Q.pen, 0); assert.equal(Q.wrong, 6);
  // Stars: finishing, the round's time, few wrong clicks.
  const star = (t, wrong) => { const X = SZ.makeRound(1, 0, {}); X.done = true; X.t = t; X.wrong = wrong; return SZ.stars(X); };
  assert.equal(star(10, 0), 3); assert.equal(star(10, SZ.WRONG_OK), 3); assert.equal(star(10, SZ.WRONG_OK + 1), 2);
  assert.equal(star(61, 0), 2); assert.equal(star(61, 9), 1);
  const X = SZ.makeRound(1, 0, {});
  assert.equal(SZ.stars(X), 0, 'no stars before the end');
  // Finding everything on the fixed scene ends the round.
  const F = SZ.makeRound(0, 0, { size: 1 }), fc = SZ.camera(SZ.scene(0), F);
  for (const it of F.items.filter(i => i.e >= 0)) { const s = SZ.toScreen(fc, it.x, it.y); assert.equal(SZ.click(F, fc, s.x, s.y, null).t, 'found'); }
  assert.equal(F.done, true); assert.equal(F.found, F.total);
  SZ.tick(F, 5);
  assert.equal(F.t, 0, 'the clock stops at the end');
});

test('moving things follow their path; covers open with the zoom', () => {
  const R = SZ.makeRound(2, 0, { speed: 1 });
  const it = R.items.find(i => i.m);
  const a = SZ.pos(it, 0), b = SZ.pos(it, 1.5);
  assert.notDeepEqual([a.x, a.y], [b.x, b.y], 'it moves');
  for (let t = 0; t < 30; t += 0.7) {
    const p = SZ.pos(it, t);
    assert.ok(Math.abs(p.x - it.x) <= it.m.ax + 1e-9 && Math.abs(p.y - it.y) <= it.m.ay + 1e-9, 'within its path');
  }
  const still = R.items.find(i => !i.m);
  assert.deepEqual([SZ.pos(still, 9).x, SZ.pos(still, 9).y], [still.x, still.y]);
  const C = SZ.makeRound(3, 1, {}), cv = C.items.find(i => i.cv);
  assert.equal(SZ.coverOpen(cv, C.zmin), 0);
  assert.equal(SZ.coverOpen(cv, cv.cv.zo), 0);
  assert.ok(SZ.coverOpen(cv, cv.cv.zo + 0.35) > 1 - 1e-9);
  assert.ok(cv.cv.r >= cv.r, 'a cover is at least as big as what it hides');
});

test('saves: fresh, old and broken saves load as playable ones; rounds open one by one; best times', () => {
  const fresh = SZ.freshSave();
  assert.equal(fresh.r.length, SZ.COUNT);
  for (const raw of [null, undefined, 'x', 7, [], [1, 2], {}, { v: 2, r: [[3, 10]] }, { v: '1' }, { v: 1, r: 'abc' }, { v: 1, r: [[9, 1], ['a', 2], null, [2, -5], [3, 1e9]], coach: 'yes' }]) {
    const s = SZ.loadSave(raw);
    assert.equal(s.r.length, SZ.COUNT, JSON.stringify(raw));
    for (const e of s.r) assert.ok([0, 1, 2, 3].includes(e[0]) && Number.isInteger(e[1]) && e[1] >= 0 && e[1] <= 99999);
    assert.deepEqual(plain(s.coach), [0, 0]);
    assert.equal(SZ.nextRound(s), 0, 'the first round is the one to play');
  }
  const kept = SZ.loadSave({ v: 1, r: [[3, 250], [1, 0], [2, 99], [0, 40], 'x'], coach: [1, 0], extra: { music: true } });
  assert.deepEqual(plain(kept.r.slice(0, 5)), [[3, 250], [1, 0], [2, 99], [0, 0], [0, 0]]);
  assert.deepEqual(plain(kept.coach), [1, 0]);
  assert.equal(kept.music, undefined);
  assert.equal(SZ.loadSave({ v: 1, r: [[3, 250]], music: false }).music, undefined, 'an old music key is ignored');
  // Unlocking.
  const s = SZ.freshSave();
  assert.ok(SZ.isOpen(s, 0)); assert.ok(!SZ.isOpen(s, 1)); assert.ok(!SZ.isOpen(s, -1)); assert.ok(!SZ.isOpen(s, SZ.COUNT));
  assert.equal(SZ.nextRound(s), 0);
  let res = SZ.applyResult(s, 0, 2, 400);
  assert.deepEqual(plain(res), { first: true, best: false, shiny: false, unlocked: 1 });
  assert.ok(SZ.isOpen(s, 1)); assert.equal(SZ.nextRound(s), 1);
  res = SZ.applyResult(s, 0, 1, 300);
  assert.equal(res.first, false); assert.equal(res.best, true, 'a faster time is a new best'); assert.equal(res.unlocked, -1);
  assert.deepEqual(plain(s.r[0]), [2, 300], 'keeps the most stars and the best time');
  res = SZ.applyResult(s, 0, 3, 500);
  assert.equal(res.best, true); assert.equal(res.shiny, true); assert.deepEqual(plain(s.r[0]), [3, 300]);
  res = SZ.applyResult(s, 0, 3, 600);
  assert.equal(res.best, false); assert.equal(res.shiny, false);
  assert.equal(SZ.totalStars(s), 3); assert.equal(SZ.stickers(s), 1);
  assert.ok(SZ.worldOpen(s, 0)); assert.ok(!SZ.worldOpen(s, 1));
  for (let i = 0; i < SZ.PER; i++) SZ.applyResult(s, i, 1, 999);
  assert.ok(SZ.worldOpen(s, 1), 'finishing a place opens the next one');
  for (let i = 0; i < SZ.COUNT; i++) SZ.applyResult(s, i, 1, 999);
  assert.equal(SZ.nextRound(s), SZ.COUNT - 1, 'all done: the last round');
  assert.equal(SZ.applyResult(s, SZ.COUNT - 1, 2, 10).unlocked, -1);
});

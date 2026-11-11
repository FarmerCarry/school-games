// Seek and Zoom engine (games/seek-zoom/engine.js): the scenes, every round's things to
// find at every difficulty, the camera (zoom around the pointer, pan, clamp, glide), the
// wheel, clicks, stars and saves. Node only, no browser.
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
const W = SZ.W, H = SZ.H, P = SZ.PAD;
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
// A camera on round R at zoom z looking at scene point (x, y) (clamped like the game's).
function look(S, R, x, y, z) {
  const cam = SZ.camera(S, R);
  cam.z = cam.tz = z; cam.x = x; cam.y = y;
  return SZ.clampCam(cam);
}

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(SZ && SZ.makeRound && SZ.camera && SZ.hit, 'loads with only { window: {} }');
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
    // The scene is a whole number of screens wider than the view at the lowest zoom.
    assert.ok(S.w >= 2 * W && S.h >= 2 * H);
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

test('the teaching ramp: drag only, then zoom, tiny things, moving things, covers that open when zooming, timed rounds', () => {
  const R = (w, r) => SZ.makeRound(w, r, { size: 1, decoys: 1 });
  assert.deepEqual([R(0, 0).zmin, R(0, 0).zmax, R(0, 1).zmax], [1, 1, 1], 'the first two rounds only need dragging');
  assert.ok(R(0, 2).zmax > R(0, 2).zmin, 'then the zoom opens');
  for (const p of PARAMS) {
    const Z = SZ.makeRound(0, 2, p);
    assert.ok(Z.items.filter(i => i.e >= 0).every(i => SZ.needZoom(i) > Z.zmin), 'the first zoom round needs the wheel for every thing, even at the biggest size');
  }
  assert.ok(R(0, 0).items.filter(i => i.e >= 0).every(i => i.r >= SZ.MIN_R * 2), 'the first things are big');
  const need = w => { let n = 0, s = 0; for (let r = 0; r < SZ.PER; r++) for (const it of R(w, r).items) if (it.e >= 0) { s += SZ.needZoom(it); n++; } return s / n; };
  assert.ok(need(1) > need(0) && need(2) > need(1), 'things get smaller');
  assert.ok(R(2, 0).items.some(i => i.e >= 0 && i.m), 'the beach has moving things');
  assert.ok(R(3, 0).items.some(i => i.e >= 0 && i.cv), 'the toy room hides things in boxes');
  assert.ok(R(4, 0).limit > 0, 'the space station is timed');
  for (const [w, r] of ROUNDS.slice(0, 20)) assert.equal(R(w, r).limit, 0, 'only the last place is timed');
});

test('every round at every difficulty: each thing exists, in its zone, inside the scene, apart from all others', () => {
  for (const [w, r] of ROUNDS) {
    const Wd = SZ.WORLDS[w], S = SZ.scene(w);
    for (const p of PARAMS) {
      const R = SZ.makeRound(w, r, p), label = `${Wd.id} round ${r + 1} ${JSON.stringify(p)}`;
      assert.equal(R.failed, 0, label + ': every thing was placed');
      assert.equal(R.list.length, R.d.f.length);
      R.list.forEach((e, i) => assert.equal(R.items.filter(it => it.e === i).length, e.n, `${label}: ${e.n} × ${e.k}`));
      assert.equal(R.total, R.list.reduce((a, e) => a + e.n, 0));
      for (const it of R.items) {
        const shapes = zoneShapes(Wd, it.cv ? Wd.coverZone : Wd.home[it.k]), big = Math.max(it.r, it.cv ? it.cv.r : 0);
        const ex = big * 1.25 + (it.m ? it.m.ax : 0), ey = big * 1.25 + (it.m ? it.m.ay : 0);
        assert.ok(shapes.some(s => SZ.inShape(s, it.x, it.y, ex, ey)), `${label}: ${it.k || 'cover'} at ${it.x},${it.y} is in its zone`);
        assert.ok(it.x - ex >= 0 && it.x + ex <= S.w && it.y - ey >= 0 && it.y + ey <= S.h, label + ': inside the scene');
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

test('every thing to find can be seen big enough within the zoom range, and reached clear of the HUD', () => {
  for (const [w, r] of ROUNDS) {
    const S = SZ.scene(w);
    for (const p of [PARAMS[0], PARAMS[PARAMS.length - 1]]) {
      const R = SZ.makeRound(w, r, p);
      for (const it of R.items) {
        if (it.e < 0) continue;
        const need = SZ.needZoom(it), label = `${SZ.WORLDS[w].id} ${r + 1}: ${it.k}`;
        assert.ok(need <= R.zmax - 0.1, `${label} needs zoom ${need.toFixed(2)} of ${R.zmax}`);
        assert.ok(it.r * R.zmax >= SZ.MIN_R * 1.4, `${label} is at least ${SZ.MIN_R * 1.4}px at the top zoom`);
        if (it.cv) assert.ok(it.cv.zo >= R.zmin, label + ': its cover is shut at the start');
        // Some camera in the range shows it whole in the free middle of the screen.
        let ok = false;
        for (let z = Math.max(need, R.zmin); z <= R.zmax + 1e-9 && !ok; z += 0.05) {
          for (let t = 0; t < 4 && !ok; t++) {
            const pos = SZ.pos(it, t * 3), cam = look(S, R, pos.x, pos.y, z), s = SZ.toScreen(cam, pos.x, pos.y), rr = Math.max(it.r, it.cv ? it.cv.r : 0) * 1.3 * z;
            ok = s.x - rr >= P.l && s.x + rr <= W - P.r - 20 && s.y - rr >= P.t && s.y + rr <= H - P.b;
          }
        }
        assert.ok(ok, label + ' can be brought clear of the HUD');
        // A click on it there finds that very thing.
        const pos = SZ.pos(it, 0), z = Math.min(R.zmax, Math.max(need + 0.05, R.zmin)), cam = look(S, R, pos.x, pos.y, z), s = SZ.toScreen(cam, pos.x, pos.y);
        const h = SZ.hit(R, cam, s.x, s.y);
        assert.equal(h.it, it, label + ': the click picks it');
        assert.equal(h.t, 'found', label);
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

test('zooming keeps the scene point under the pointer still, eased or at once, and stays in range', () => {
  const S = SZ.scene(1), R = SZ.makeRound(1, 0, {});
  for (const still of [true, false]) {
    const cam = look(S, R, 1600, 900, 1);
    const sx = 812, sy = 290, before = SZ.toWorld(cam, sx, sy);
    assert.equal(SZ.zoomAt(cam, sx, sy, 1.6, still), true);
    for (let i = 0; i < 90; i++) {
      SZ.stepCam(cam, 1 / 60, still);
      const now = SZ.toWorld(cam, sx, sy);
      assert.ok(Math.abs(now.x - before.x) < 1e-6 && Math.abs(now.y - before.y) < 1e-6, `frame ${i}: the point stays under the pointer`);
    }
    assert.equal(cam.z, 1.6);
    assert.equal(cam.an, false, 'the zoom finished');
    // Zooming out eases back, around another point.
    const p2 = SZ.toWorld(cam, 400, 500);
    SZ.zoomAt(cam, 400, 500, 1 / 1.25, still);
    if (!still) { SZ.stepCam(cam, 1 / 60, false); assert.ok(cam.z > 1.28 && cam.z < 1.6, 'eases over several frames'); }
    for (let i = 0; i < 90; i++) SZ.stepCam(cam, 1 / 60, still);
    assert.ok(Math.abs(cam.z - 1.28) < 1e-9);
    const q = SZ.toWorld(cam, 400, 500);
    assert.ok(Math.abs(q.x - p2.x) < 1e-6 && Math.abs(q.y - p2.y) < 1e-6);
  }
  const cam = look(S, R, 1600, 900, 1);
  for (let i = 0; i < 40; i++) { SZ.zoomAt(cam, 640, 360, 1.5, true); }
  assert.equal(cam.z, R.zmax, 'never past the top zoom');
  for (let i = 0; i < 40; i++) { SZ.zoomAt(cam, 640, 360, 0.5, true); }
  assert.equal(cam.z, R.zmin, 'never below the whole scene');
  assert.equal(SZ.zoomAt(cam, 640, 360, 0.5, true), false, 'no change at the end of the range');
  // A locked round never zooms.
  const L = SZ.makeRound(0, 0, {}), lc = SZ.camera(SZ.scene(0), L);
  assert.equal(SZ.zoomAt(lc, 640, 360, 2, true), false);
  assert.equal(lc.z, 1);
});

test('panning follows the drag and is clamped to the scene (plus room for the HUD); a flick glides and stops', () => {
  const S = SZ.scene(2), R = SZ.makeRound(2, 0, {});
  const cam = look(S, R, 1600, 900, 1.5);
  SZ.pan(cam, -150, 60);
  assert.ok(Math.abs(cam.x - (1600 + 100)) < 1e-9 && Math.abs(cam.y - (900 - 40)) < 1e-9, 'the scene moves with the pointer');
  for (const z of [R.zmin, 0.7, 1.3, R.zmax]) {
    const c = look(S, R, 1600, 900, z);
    for (const [dx, dy] of [[1e5, 0], [-1e5, 0], [0, 1e5], [0, -1e5], [1e5, 1e5], [-1e5, -1e5]]) {
      SZ.pan(c, dx, dy);
      const tl = SZ.toScreen(c, 0, 0), br = SZ.toScreen(c, S.w, S.h);
      assert.ok(tl.x <= P.l + 1e-6 && tl.y <= P.t + 1e-6 && br.x >= W - P.r - 1e-6 && br.y >= H - P.b - 1e-6, `z ${z}: the view stays on the scene`);
      assert.ok(tl.x >= P.l - 1e-6 || tl.x <= 0 + 1e-6, 'no more than the HUD room past the edge');
    }
  }
  // At the lowest zoom the whole scene fits with the HUD's room.
  const c = look(S, R, 0, 0, R.zmin), tl = SZ.toScreen(c, 0, 0);
  assert.ok(Math.abs(tl.x - P.l) < 1e-6 && Math.abs(tl.y - P.t) < 1e-6);
  // Without the HUD (the result screen) the scene fills the whole screen.
  SZ.clampCam(c, { l: 0, r: 0, t: 0, b: 0 });
  const t2 = SZ.toScreen(c, 0, 0), b2 = SZ.toScreen(c, S.w, S.h);
  assert.ok(t2.x <= 1e-6 && t2.y <= 1e-6 && b2.x >= W - 1e-6 && b2.y >= H - 1e-6);
  // A flick glides, slows down and stops; with reduced motion it stops at once.
  const g = look(S, R, 1600, 900, 1);
  g.vx = 900; g.vy = -300;
  const x0 = g.x;
  let n = 0;
  while ((g.vx || g.vy) && n < 600) { SZ.stepCam(g, 1 / 60, false); n++; }
  assert.ok(n > 20 && n < 200, `glides for ${n} frames`);
  assert.ok(g.x < x0 - 80, 'the view moved the way of the flick');
  const s = look(S, R, 1600, 900, 1);
  s.vx = 900; SZ.stepCam(s, 1 / 60, true);
  assert.equal(s.x, 1600); assert.equal(s.vx, 0);
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

test('clicks: found, already found, too small (zoom!), a shut cover (zoom!), a look-alike, empty ground', () => {
  const S = SZ.scene(3), R = SZ.makeRound(3, 0, { size: 1, decoys: 2 });
  const t = R.items.find(i => i.e >= 0 && !i.cv), cov = R.items.find(i => i.e >= 0 && i.cv), dec = R.items.find(i => i.e < 0 && i.k && !i.cv);
  const at = (it, z) => { const cam = look(S, R, it.x, it.y, z); return [cam, SZ.toScreen(cam, it.x, it.y)]; };
  let [cam, s] = at(t, R.zmin);
  assert.ok(t.r * R.zmin < SZ.MIN_R);
  assert.equal(SZ.click(R, cam, s.x, s.y).t, 'small', 'too small to pick yet');
  assert.equal(R.wrong, 0, 'a zoom hint is not a wrong click');
  [cam, s] = at(t, SZ.needZoom(t) + 0.05);
  const h = SZ.click(R, cam, s.x, s.y);
  assert.equal(h.t, 'found'); assert.equal(R.found, 1); assert.equal(R.list[t.e].got, 1); assert.equal(t.got, true);
  assert.equal(SZ.click(R, cam, s.x, s.y).t, 'again');
  assert.equal(R.found, 1);
  [cam, s] = at(cov, cov.cv.zo - 0.05);
  assert.equal(SZ.click(R, cam, s.x, s.y).t, 'closed');
  [cam, s] = at(cov, SZ.needZoom(cov) + 0.02);
  assert.ok(SZ.coverOpen(cov, cam.z) >= SZ.OPEN_AT);
  assert.equal(SZ.click(R, cam, s.x, s.y).t, 'found');
  [cam, s] = at(dec, 2);
  assert.equal(SZ.click(R, cam, s.x, s.y).t, 'decoy');
  assert.equal(R.wrong, 1);
  // Empty ground: a point far from everything.
  cam = look(S, R, 1600, 900, 2);
  let miss = null;
  for (let x = 120; x < 1200 && !miss; x += 37) for (let y = 90; y < 590 && !miss; y += 41) if (SZ.hit(R, cam, x, y).t === 'miss') miss = [x, y];
  assert.ok(miss);
  assert.equal(SZ.click(R, cam, miss[0], miss[1]).t, 'miss');
  assert.equal(R.wrong, 2);
  assert.equal(R.found, 2, 'wrong clicks never find anything');
});

test('the round: the clock, wrong clicks in a row cost seconds only when the penalty is on, time-up, stars', () => {
  const S = SZ.scene(4), R = SZ.makeRound(4, 0, { pen: 5, timeK: 1 });
  assert.equal(R.limit, 120);
  const cam = look(S, R, 1600, 900, 2);
  let miss = null;
  for (let x = 120; x < 1200 && !miss; x += 37) for (let y = 90; y < 590 && !miss; y += 41) if (SZ.hit(R, cam, x, y).t === 'miss') miss = [x, y];
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
  const Q = SZ.makeRound(1, 0, { pen: 0 }), qc = look(SZ.scene(1), Q, 1600, 900, 2);
  let m2 = null;
  for (let x = 120; x < 1200 && !m2; x += 37) for (let y = 90; y < 590 && !m2; y += 41) if (SZ.hit(Q, qc, x, y).t === 'miss') m2 = [x, y];
  for (let i = 0; i < 6; i++) SZ.click(Q, qc, ...m2);
  assert.equal(Q.pen, 0); assert.equal(Q.wrong, 6);
  // Stars: finishing, the round's time, few wrong clicks.
  const star = (t, wrong) => { const X = SZ.makeRound(1, 0, {}); X.done = true; X.t = t; X.wrong = wrong; return SZ.stars(X); };
  assert.equal(star(10, 0), 3); assert.equal(star(10, SZ.WRONG_OK), 3); assert.equal(star(10, SZ.WRONG_OK + 1), 2);
  assert.equal(star(61, 0), 2); assert.equal(star(61, 9), 1);
  const X = SZ.makeRound(1, 0, {});
  assert.equal(SZ.stars(X), 0, 'no stars before the end');
  // Finding everything ends the round.
  const F = SZ.makeRound(0, 0, { size: 1 }), fc = SZ.camera(SZ.scene(0), F);
  for (const it of F.items.filter(i => i.e >= 0)) { fc.x = it.x; fc.y = it.y; SZ.clampCam(fc); const s = SZ.toScreen(fc, it.x, it.y); assert.equal(SZ.click(F, fc, s.x, s.y).t, 'found'); }
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

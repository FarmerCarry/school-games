import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() {
  const context = vm.createContext({ window: {} });
  for (const file of ['data.js', 'engine.js', 'ai.js']) {
    vm.runInContext(readFileSync(path.join(repo, 'games/turbo-karts', file), 'utf8'), context, { filename: file });
  }
  return context.window;
}
const { TK, TKD, TKAI } = load();
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

function drive(race, frames, inputFn) {
  for (let i = 0; i < frames && !race.over; i++) TK.step(race, 1 / 60, inputFn(race));
  return race;
}

test('every track is a closed loop with ordered gates, and only the bridge crosses itself', () => {
  assert.equal(TKD.TRACKS.length, 8);
  for (const track of TKD.TRACKS) {
    assert.ok(track.pts.length >= 32, track.name);
    assert.ok(track.total > 1500, track.name);
    const lens = [];
    for (let i = 0; i < track.pts.length; i++) {
      const a = track.pts[i], b = track.pts[(i + 1) % track.pts.length];
      lens.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    const mid = lens.slice().sort((a, b) => a - b)[(lens.length / 2) | 0];
    assert.ok(Math.max(...lens) < mid * 4, track.name + ' closes without a jump');
    for (let i = 0; i < track.cps.length - 1; i++) assert.ok(track.cps[i].s < track.cps[i + 1].s, track.name);
    const edge = track.width / 2;
    for (const p of track.pts) {
      assert.ok(p.x - edge > -2 && p.x + edge < 1282 && p.y - edge > -2 && p.y + edge < 722, track.name);
    }
    const hits = TK.intersections(track);
    if (track.bridge) {
      assert.ok(hits.length >= 1 && hits.length <= 3, track.name + ' ' + hits.length);
      const half = track.pts.length / 2;
      assert.ok(hits.every(([a, b]) => (a < half) !== (b < half)), 'the only crossing is the bridge');
    } else {
      assert.equal(hits.length, 0, track.name);
    }
  }
});

test('driving a lap backwards, or jumping from the first gate to the last, never counts', () => {
  for (let i = 0; i < TKD.TRACKS.length; i++) {
    const race = TK.newRace({ track: i, humans: 1, cpus: 0, phase: 'race', seed: 1, items: false });
    const k = race.karts[0];
    k.vf = -90;
    drive(race, 70 * 60, () => {
      const p = TK.pointAt(race.track, k.s + 40);
      const want = Math.atan2(p.ty, p.tx);
      return [{ th: 0, br: 1, st: Math.max(-1, Math.min(1, wrap(want - k.ang) / 0.4)), drift: 0, use: 0 }];
    });
    assert.equal(k.lap, 0, TKD.TRACKS[i].name + ' backwards');
  }
  const race = TK.newRace({ track: 0, humans: 1, cpus: 0, phase: 'race', seed: 1, items: false });
  const k = race.karts[0];
  for (let i = 0; i < 2400 && k.next < 2 && k.lap === 0; i++) {
    const aim = TK.pointAt(race.track, k.s + 90);
    const want = Math.atan2(aim.y - k.y, aim.x - k.x);
    TK.step(race, 1 / 60, [{ th: 1, br: 0, st: Math.max(-1, Math.min(1, wrap(want - k.ang) / 0.45)), drift: 0, use: 0 }]);
  }
  assert.equal(k.lap, 0);
  assert.ok(k.next >= 2, 'reached the first gate');
  const last = race.track.cps.length - 1;
  const before = TK.pointAt(race.track, race.track.cps[last].s - 28);
  k.x = before.x; k.y = before.y; k.px = before.x; k.py = before.y;
  k.ang = Math.atan2(before.ty, before.tx); k.vf = 150; k.seg = before.seg; k.s = before.s;
  drive(race, 40, () => [{ th: 1, br: 0, st: 0, drift: 0, use: 0 }]);
  const fin = TK.pointAt(race.track, race.track.total - 24);
  k.x = fin.x; k.y = fin.y; k.px = fin.x; k.py = fin.y;
  k.ang = Math.atan2(fin.ty, fin.tx); k.vf = 150; k.seg = fin.seg; k.s = fin.s;
  drive(race, 50, () => [{ th: 1, br: 0, st: 0, drift: 0, use: 0 }]);
  assert.equal(k.lap, 0, 'a cut to the finish is not a lap');
});

test('the same seed and inputs replay exactly, and first place never rolls a rocket', () => {
  const snap = seed => {
    const race = TK.newRace({ track: 2, tier: 4, humans: 0, cpus: 6, phase: 'race', seed, items: true });
    drive(race, 360, () => TKAI.inputs(race));
    return race.karts.map(k => [k.x.toFixed(3), k.y.toFixed(3), k.lap, k.item, k.s.toFixed(2)]);
  };
  assert.deepEqual(snap(9), snap(9));
  assert.notDeepEqual(snap(9), snap(10));
  const rng = TK.makeRng(1);
  let first = 0, second = 0, last = 0;
  for (let i = 0; i < 4000; i++) {
    if (TK.rollItem(1, rng) === 'rocket') first++;
    if (TK.rollItem(2, rng) === 'rocket') second++;
    if (TK.rollItem(6, rng) === 'rocket') last++;
  }
  assert.equal(first, 0);
  assert.ok(last > second && second > 0);
});

test('a clean tier-5 lap stays at least 20s, and every bot race finishes inside a minute and a bit', () => {
  for (let i = 0; i < TKD.TRACKS.length; i++) {
    const race = TK.newRace({
      track: i, tier: 5, noise: 0, rubber: 0, humans: 0, cpus: 1,
      phase: 'race', seed: 1, items: true, refSpeed: TK.VBASE * 1.06
    });
    drive(race, 80 * 60, () => TKAI.inputs(race));
    const laps = race.karts[0].lapT;
    assert.ok(laps.length >= 1, TKD.TRACKS[i].name);
    assert.ok(Math.min(...laps) >= 20, TKD.TRACKS[i].name + ' ' + laps.map(n => n.toFixed(2)).join(','));
  }
  for (let i = 0; i < TKD.TRACKS.length; i++) {
    for (const tier of [1, 3, 5]) {
      const race = TK.newRace({ track: i, tier, humans: 0, cpus: 6, phase: 'race', seed: 1, items: true });
      drive(race, 140 * 60, () => TKAI.inputs(race));
      const times = race.karts.map(k => k.finishT);
      assert.ok(race.over, `T${i + 1} tier ${tier} did not finish`);
      for (const t of times) {
        assert.ok(t >= 60 && t <= 130, `T${i + 1} tier ${tier} finished at ${t.toFixed(1)}`);
      }
    }
  }
});

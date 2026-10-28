// The rollups of the facts (server/rollups.mjs) on the Node driver: for a simulated school
// day in Asia/Riyadh and for Europe/London's 25-hour day (25 October 2026), every r_*
// table and every r_stat metric equals a JavaScript oracle computed from the same fact
// rows; a diff re-roll after late data leaves the tables as a fresh roll would (r_stat
// keeps the rows that lost their facts, at zero); a full re-roll rebuilds them exactly;
// the KPIs read the same numbers from the facts before the roll; and the rows a roll reads
// stay small on a busy day (docs/RESEARCH_TELEMETRY_SPEC.md, §D.2, §D.3, §D.7, §H.5).
import assert from 'node:assert/strict';
import { test } from 'node:test';

// sqlite-d1.mjs hides node:sqlite's ExperimentalWarning before it loads node:sqlite.
const { openDatabase, d1LimitError } = await import('../../server/sqlite-d1.mjs');
const { openStore } = await import('../../server/store.mjs');
const { ROLLUPS, BUCKETS, METRICS, rollStatements } = await import('../../server/rollups.mjs');
const { validateBatch, CODES, ERRORS, SOURCES } = await import('../../server/schema.mjs');
const { dayBounds } = await import('../../server/clock.mjs');

const DAY_MS = 86400000;
const GAMES = ['road-hopper', 'maze-dash', 'bubble-bop', 'tic-tac-toe', 'air-hockey', 'tank-splat'];
const LEVELS = { 'road-hopper': ['L1', 'L2', 'L3'], 'maze-dash': ['L1', 'L2'], 'bubble-bop': ['w1-1', 'w1-2'], 'tic-tac-toe': ['local', 'cpu'],
  'air-hockey': ['duo', 'solo'], 'tank-splat': ['endless'] };
const BANDS = ['6-7', '8-9', '10-11', ''];

// mulberry32: small, fast and the same everywhere.
function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)), chance: p => next() < p, pick: list => list[Math.floor(next() * list.length)],
    hex: n => Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join('') };
}

// Sessions of one local day, as batches with their receipt times: students on PCs (some on
// two, some linked through an older code), guests, v2 sessions, sessions that start just
// before and after midnight, two-player rounds, unended rounds and unclosed visits,
// tutorials, hearts, timers and removed profiles. Each session's events are sent in 1 to 3
// batches, so a round's start and end can be in different batches.
function schoolDay({ day, zone, sessions = 120, seed = 7 }) {
  const r = random(seed), { lo, hi } = dayBounds(zone, day), batches = [];
  const pcs = Array.from({ length: 6 }, () => r.hex(12)), students = Array.from({ length: 40 }, () => ({ u: r.hex(12), a: r.pick(BANDS.slice(0, 3)),
    pc: r.pick(pcs), age: r.int(0, 90) }));
  let seq = 0;
  for (let i = 0; i < sessions; i++) {
    const kind = i % 10 === 0 ? 'v2' : i % 10 === 1 ? 'guest' : 'student', st = r.pick(students);
    // Mostly school hours; the first sessions sit on the day's edges (one starts just after it).
    const start = i === 2 ? lo + 30 : i === 3 ? hi - 600 : i === 4 ? hi + 600 : lo + 3 * 3600 + r.int(0, 9 * 3600);
    const s = r.hex(12), u = kind === 'student' ? st.u : '', p = kind === 'v2' ? '' : i % 7 === 0 ? pcs[5] : st.pc;
    // A student's band changes now and then (the child picks another), so a day can have two.
    const a = kind === 'student' && !r.chance(0.2) ? st.a : r.pick(BANDS);
    const ev = [];
    let t = 0;
    const v3 = kind !== 'v2';
    if (v3) ev.push(['ss', 0, r.chance(0.15) ? 1 : 0, kind === 'guest' ? -1 : st.age, kind === 'guest' ? -1 : r.int(-1, 10), kind === 'guest' ? 0 : r.int(1, 9),
      p === pcs[5] ? 24 : r.int(1, 20), r.chance(0.3) ? 1 : 0]);
    else ev.push(['ss', 0, r.chance(0.2) ? 1 : 0, r.int(0, 3), r.int(0, 4), r.int(0, 9)]);
    if (v3 && u && r.chance(0.15)) ev.push(['cd', 0, r.pick(students).u]);
    if (v3 && r.chance(0.1)) ev.push(['pr', 0, r.pick(students).u]);
    if (v3 && r.chance(0.2)) ev.push(['ct', 1, 's', 20]);
    const visits = r.int(1, 4);
    for (let n = 1; n <= visits; n++) {
      const slug = r.pick(GAMES), open = !(n === visits && r.chance(0.25));
      t += r.int(2, 40);
      if (v3) ev.push(['go', t, n, slug, r.pick(SOURCES), r.int(0, 15), r.chance(0.2) ? 1 : 0]);
      else ev.push(['go', t, slug, r.pick(SOURCES), r.int(0, 4)]);
      if (r.chance(0.8)) ev.push(v3 ? ['ld', t + 1, n, slug, r.int(300, 3000)] : ['ld', t + 1, slug, r.int(300, 3000)]);
      if (r.chance(0.05)) ev.push(v3 ? ['er', t + 1, n, slug, r.pick(ERRORS)] : ['er', t + 1, slug, r.pick(ERRORS)]);
      if (v3 && r.chance(0.3)) ev.push(['tu', t + 1, n, slug, 's']);
      let engaged = 0;
      const rounds = r.int(0, 6);
      for (let k = 1; k <= rounds; k++) {
        const id = r.pick(LEVELS[slug]), tier = slug === 'road-hopper' || slug === 'bubble-bop' ? r.int(1, 5) : 0;
        t += r.int(1, 10);
        ev.push(v3 ? ['rs', t, n, k, slug, id, tier, r.int(0, 12)] : ['rs', t, slug, id, tier, r.int(0, 12)]);
        // Some rounds never end.
        if (k === rounds && r.chance(0.2)) break;
        const ms = r.int(5000, 90000), code = r.pick(CODES), score = r.chance(0.2) ? -1 : r.int(0, 500), hits = r.int(0, 30);
        const rt = Array.from({ length: 6 }, () => r.int(0, 8));
        t += Math.ceil(ms / 1000);
        engaged += ms;
        const x = r.chance(0.6) ? [ms + r.int(0, 3000), r.int(0, 200), r.int(0, 5), r.int(0, 3), r.int(0, 50000), r.int(0, 40), r.int(-1, 1000)] : null;
        ev.push(v3 ? ['re', t, n, k, slug, code, id, ms, score, tier, hits, r.int(0, 20), rt, x] : ['re', t, slug, code, id, ms, score, tier, hits, r.int(0, 20), rt]);
        if (v3 && k === 1 && r.chance(0.3)) ev.push(['tu', t, n, slug, 'd']);
        if (v3 && r.chance(0.1)) ev.push(['fv', t, n, slug, r.chance(0.7) ? 1 : 0]);
        if (r.chance(0.1)) ev.push(['lv', t, r.int(2, 20)]);
      }
      t += r.int(1, 30);
      if (open) {
        const il = Array.from({ length: 6 }, () => r.int(0, 50)), f = Array.from({ length: 4 }, () => r.int(0, 4000));
        ev.push(v3 ? ['gx', t, n, slug, engaged + r.int(0, 20000), il, f] : ['gx', t, slug, engaged + r.int(0, 20000), il, f]);
      } else if (v3) ev.push(['gp', t, n, slug, engaged]);
    }
    if (v3 && r.chance(0.2)) ev.push(['ct', t, 'e', 0]);
    if (r.chance(0.7)) ev.push(v3 ? ['se', t + 5, r.int(0, 600000), r.pick(['u', 'p', 'h', 'i'])] : ['se', t + 5, r.int(0, 600000)]);
    // 1 to 3 batches, sent 5 to 60 s after their last event.
    const cuts = [...new Set([ev.length, ...Array.from({ length: r.int(0, 2) }, () => r.int(1, ev.length))])].sort((x, y) => x - y);
    let from = 0;
    for (const cut of cuts) {
      const part = ev.slice(from, cut);
      from = cut;
      if (!part.length) continue;
      const maxT = Math.max(...part.map(e => e[1])), at = (start + maxT + r.int(5, 60)) * 1000;
      // Two builds of the portal, so a PC's last session decides its build.
      const body = { v: v3 ? 3 : 2, b: r.hex(16), s, k: i % 3 ? 'src' : '5c18c6d2d1c052ad', m: r.chance(0.2) ? 'app' : 'web', a,
        d: [r.pick([2, 4, 8]), r.pick([2, 4, 8]), r.pick([1366, 1920])], ev: part };
      if (v3) Object.assign(body, { u, p, z: zone, w: Math.round(at / 1000) - start });
      batches.push({ body, at });
    }
  }
  return batches.sort((x, y) => x.at - y.at);
}

async function ingestAll(store, batches) {
  for (const { body, at } of batches) {
    const valid = validateBatch(body);
    assert.ok(valid && valid.dropped === 0, JSON.stringify(body).slice(0, 200));
    await store.ingest(valid, at);
  }
}

/* -------------------------------------------------------------- the oracle */
// The rollups of one local day, computed in JavaScript from every fact row (no SQL beyond
// SELECT *), with the spec's definitions.
async function oracle(db, zone, day) {
  const all = async table => (await db.prepare(`SELECT * FROM ${table}`).all()).results;
  const { lo, hi, o1, ch, o2 } = dayBounds(zone, day);
  const sessions = (await all('st_sessions')).filter(s => s.start_s >= lo && s.start_s < hi);
  const ids = new Set(sessions.map(s => s.id)), by = rows => { const m = new Map(); for (const row of rows) (m.get(row.sid) || m.set(row.sid, []).get(row.sid)).push(row); return m; };
  const visits = by((await all('st_visits')).filter(v => ids.has(v.sid))), rounds = by((await all('st_rounds')).filter(x => ids.has(x.sid)));
  const marks = by((await all('st_marks')).filter(m => ids.has(m.sid)));
  const aliases = new Map((await all('aliases')).map(x => [x.u_old, x.u_new]));
  const firstPlay = new Map((await all('st_student_games')).map(g => [g.u + ' ' + g.slug, g.first_s]));
  const canon = u => aliases.get(u) ?? u;
  const local = x => new Date((x + (x >= ch ? o2 : o1) * 60) * 1000);
  const hour = x => String(local(x).getUTCHours()).padStart(2, '0'), weekday = x => String(local(x).getUTCDay());
  const bucket = (x, bounds, scale = 1) => String(bounds.filter(b => x >= b * scale).at(-1) ?? bounds[0]);
  const first = list => list.slice().sort((x, y) => x.start_s - y.start_s || x.id - y.id)[0];
  const nn = x => x ?? 0;
  const out = Object.fromEntries(Object.keys(ROLLUPS).map(table => [table, new Map()]));
  // A group's row: its key, every sum at 0, and the sets behind its distinct counts.
  const row = (table, key) => {
    const map = out[table], id = JSON.stringify(key);
    if (!map.has(id)) {
      const { key: keys, text = [], sums } = ROLLUPS[table], g = { sets: {} };
      keys.forEach(([c], i) => { g[c] = key[i]; });
      for (const c of text) g[c] = '';
      for (const c of sums) g[c] = 0;
      map.set(id, g);
    }
    return map.get(id);
  };
  const distinct = (g, name, value) => { if (value === undefined || value === null) return; (g.sets[name] ||= new Set()).add(value); };
  const student = s => s.u !== '' ? canon(s.u) : undefined;
  const add = (g, values) => { for (const [c, v] of Object.entries(values)) g[c] += nn(v); };
  // The largest and smallest known value of a group (0 when there is none).
  const keep = (g, c, v, pick) => {
    if (v === null || v === undefined) return;
    g[c] = g.sets['has ' + c] ? pick(g[c], v) : v;
    g.sets['has ' + c] = true;
  };
  const most = (g, c, v) => keep(g, c, v, Math.max), least = (g, c, v) => keep(g, c, v, Math.min);
  const codes = x => Object.fromEntries(CODES.map(c => [c, x.code === c ? 1 : 0]));
  const sumOf = (list, f) => list.reduce((n, x) => n + nn(f(x)), 0);
  const replayBucket = x => x === null ? -1 : x < 3 ? x : x < 5 ? 3 : x < 10 ? 4 : 5;
  const series = (prefix, n) => Array.from({ length: n }, (_, i) => prefix + i);
  const IL = series('il', 6), F = series('f', 4), RT = series('rt', 6);
  const tier0 = x => x.tier0 > 0 ? { tier_sum: x.tier0, tier_n: 1 } : {};
  const dda = x => x.dda !== null && x.dda >= 0 ? { dda_sum: x.dda, dda_n: 1 } : {};
  const score = x => x.score !== null ? { score_sum: x.score, score_n: 1 } : {};
  const skill = x => ({ ...codes(x), ms: x.ms, wall_ms: x.wall_ms, win_ms: x.code === 'w' ? x.ms : 0, hits: x.hits, misses: x.misses, rt_sum: x.rt_sum,
    rt_n: x.rt_n, ...score(x), ...tier0(x), ...dda(x), inputs: x.inputs });

  for (const s of sessions) {
    const vs = (visits.get(s.id) || []).sort((x, y) => x.n - y.n), rs = (rounds.get(s.id) || []).sort((x, y) => x.n - y.n || x.k - y.k);
    const ks = marks.get(s.id) || [], c = student(s), engaged = sumOf(vs, v => v.engaged_ms);
    // r_day
    let g = row('r_day', [day, s.a]);
    add(g, { sessions: 1, web: s.m === 'web', app: s.m === 'app', session_starts: s.level0 !== null, new_profiles: s.is_new, guests: s.level0 === 0,
      guest_sessions: s.wire === 3 && s.u === '', v2_sessions: s.wire === 2, clock_r: s.clock === 'r',
      ...Object.fromEntries([0, 1, 2, 3].map(i => ['profile_age' + i, s.age_b === i])), ...Object.fromEntries([0, 1, 2, 3, 4].map(i => ['since_last' + i, s.since_b === i])),
      ...Object.fromEntries(['u', 'p', 'h', 'i'].map(w => ['why_' + w, s.why === w])),
      engaged_ms: engaged, opens: vs.filter(v => v.t_open !== null).length, errors: vs.filter(v => v.err !== null).length,
      linked_ms: s.u !== '' ? engaged : 0, unclosed: vs.filter(v => v.closed === 0).length,
      starts: rs.filter(x => x.t0 !== null).length, ends: rs.filter(x => x.code !== null).length, unended: rs.filter(x => x.code === null).length,
      duo: sumOf(rs, x => x.duo), level_ups: ks.filter(k => k.kind === 'lv').length, hearts_on: ks.filter(k => k.kind === 'fv' && k.x === '1').length,
      hearts_off: ks.filter(k => k.kind === 'fv' && k.x === '0').length, timer_sessions: ks.some(k => k.kind === 'ct' && k.x.startsWith('s:')) });
    distinct(g, 'students', c);
    if (s.is_new === 1) distinct(g, 'new_students', c);
    // r_device_day
    g = row('r_device_day', [day, s.a, s.cores, s.mem, s.screen]);
    add(g, { sessions: 1 });
    for (const v of vs) add(g, { ...Object.fromEntries([...F, ...IL].map(col => [col, v[col]])), loads: v.load_ms !== null, load_ms: v.load_ms });
    // r_pc_day
    g = row('r_pc_day', [day, s.p]);
    const lastT = s.se_t ?? Math.max(vs.length ? Math.max(...vs.map(v => Math.max(nn(v.t_open), nn(v.t_close)))) : 0,
      rs.length ? Math.max(...rs.map(x => Math.max(nn(x.t0), nn(x.t)))) : 0);
    add(g, { sessions: 1, guests: s.wire === 3 && s.u === '', new_profiles: s.is_new, busy_s: lastT, engaged_ms: engaged,
      opens: vs.filter(v => v.t_open !== null).length, loads: vs.filter(v => v.load_ms !== null).length, load_ms: sumOf(vs, v => v.load_ms),
      errors: vs.filter(v => v.err !== null).length, quits: rs.filter(x => x.code === 'q').length,
      ...Object.fromEntries([...F, ...IL].map(col => [col, sumOf(vs, v => v[col])])) });
    distinct(g, 'students', c);
    most(g, 'np_max', s.np);
    for (const v of vs) most(g, 'load_max', v.load_ms);
    least(g, 'first_s', s.start_s);
    most(g, 'last_s', s.start_s);
    most(g, 'wire', s.wire);
    (g.sets.sessions ||= []).push(s);
    // per game, per level, per source
    for (const v of vs) {
      g = row('r_game_day', [day, s.a, v.slug]);
      add(g, { opens: v.t_open !== null, closes: v.closed, engaged_ms: v.engaged_ms, ...Object.fromEntries([...F, ...IL].map(col => [col, v[col]])),
        loads: v.load_ms !== null, load_ms: v.load_ms, ...Object.fromEntries(ERRORS.map(e => ['error_' + e, v.err === e])),
        ...Object.fromEntries(SOURCES.map(src => ['src_' + src, v.src === src])), ...Object.fromEntries([0, 1, 2, 3, 4].map(i => ['plays' + i, v.plays_b === i])),
        fav_opens: v.fav === 1 });
      distinct(g, 'sessions', s.id);
      distinct(g, 'students', c);
      if (v.src !== null) {
        const src = row('r_source_day', [day, s.a, v.src]);
        add(src, { opens: 1 });
        distinct(src, 'sessions', s.id);
      }
    }
    for (const x of rs) {
      g = row('r_game_day', [day, s.a, x.slug]);
      add(g, { starts: x.t0 !== null, ends: x.code !== null, ...codes(x), ...tier0(x), hits: x.hits, misses: x.misses,
        ...Object.fromEntries(RT.map(col => [col, x[col]])), ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => ['replay' + i, replayBucket(x.replay) === i])),
        inputs: x.inputs, idle: x.idle, pauses: x.pauses, rt_sum: x.rt_sum, rt_n: x.rt_n, ...dda(x), ...score(x), unended: x.code === null, duo: x.duo });
      g.sets.wall = (g.sets.wall || 0) + nn(x.wall_ms);
      most(g, 'score_max', x.score);
      g = row('r_level_day', [day, s.a, x.slug, x.id]);
      add(g, { starts: x.t0 !== null, ends: x.code !== null, ...codes(x), ms: x.ms, ...tier0(x), unended: x.code === null, hits: x.hits, misses: x.misses,
        ...score(x), wall_ms: x.wall_ms, ...dda(x) });
      distinct(g, 'sessions', s.id);
      distinct(g, 'students', c);
      most(g, 'score_max', x.score);
    }
    for (const k of ks.filter(m => m.kind === 'fv' || m.kind === 'tu')) {
      const v = vs.find(x => x.n === k.n);
      g = row('r_game_day', [day, s.a, v.slug]);
      add(g, { hearts_on: k.kind === 'fv' && k.x === '1', hearts_off: k.kind === 'fv' && k.x === '0', tu_start: k.kind === 'tu' && k.x === 's',
        tu_done: k.kind === 'tu' && k.x === 'd' });
    }
    // per student (raw code)
    if (s.u !== '') {
      g = row('r_student_day', [day, s.u]);
      (g.sets.sessions ||= []).push(s);
      add(g, { sessions: 1, engaged_ms: engaged, opens: vs.filter(v => v.t_open !== null).length, rounds: rs.filter(x => x.code !== null).length,
        ...Object.fromEntries(CODES.map(code => [code, rs.filter(x => x.code === code).length])), hits: sumOf(rs, x => x.hits), misses: sumOf(rs, x => x.misses),
        rt_sum: sumOf(rs, x => x.rt_sum), rt_n: sumOf(rs, x => x.rt_n), level_ups: ks.filter(k => k.kind === 'lv').length });
      for (const v of vs) distinct(g, 'games', v.slug);
      if (s.p !== '') distinct(g, 'pcs', s.p);
      least(g, 'first_s', s.start_s);
      most(g, 'last_s', s.start_s);
      for (const v of vs) {
        g = row('r_student_game', [day, v.slug, s.u]);
        (g.sets.sessions ||= []).push(s);
        add(g, { opens: v.t_open !== null, engaged_ms: v.engaged_ms });
      }
      for (const x of rs) {
        g = row('r_student_game', [day, x.slug, s.u]);
        add(g, { rounds: x.code !== null, ...codes(x), hits: x.hits, misses: x.misses, rt_sum: x.rt_sum, rt_n: x.rt_n, ...score(x), ...dda(x), ...tier0(x) });
        most(g, 'score_max', x.score);
        least(g, 'first_attempt', x.attempt);
        most(g, 'last_attempt', x.attempt);
      }
      for (const k of ks.filter(m => m.kind === 'fv')) add(row('r_student_game', [day, vs.find(x => x.n === k.n).slug, s.u]), { hearts: k.x === '1' ? 1 : -1 });
    }

    // r_stat
    const stat = (metric, slug, k1, k2, values) => {
      const st = row('r_stat', [day, s.a, metric, slug, k1, k2]);
      add(st, values);
      distinct(st, 'students', c);
      return st;
    };
    for (const v of vs) if (v.t_open !== null) stat('hour', '', hour(s.start_s + v.t_open), weekday(s.start_s + v.t_open), { n: 1, ms: v.engaged_ms });
    for (const x of rs) if (x.t0 !== null) stat('rhour', '', hour(s.start_s + x.t0), weekday(s.start_s + x.t0),
      { n: 1, w: x.code === 'w', l: x.code === 'l', q: x.code === 'q', hits: x.hits, misses: x.misses, rt_sum: x.rt_sum, rt_n: x.rt_n });
    stat('sesslen', '', bucket(engaged, BUCKETS.sesslen, 60000), s.wire === 2 ? 'u' : s.u === '' ? 'g' : 's', { n: 1, ms: engaged });
    const opened = new Set(vs.filter(v => v.t_open !== null).map(v => v.slug)).size;
    if (opened) stat('games', '', opened >= 8 ? '8' : opened >= 6 ? '6' : String(opened), '', { n: 1 });
    for (const v of vs) {
      const ended = rs.some(x => x.n === v.n && x.code !== null);
      stat('visitlen', v.slug, bucket(v.engaged_ms, BUCKETS.visitlen, 1000), ended ? '1' : '0', { n: 1, ms: v.engaged_ms });
      const before = vs.find(x => x.n === v.n - 1), gap = before && before.t_close !== null && v.t_open !== null;
      stat('flow', before ? before.slug : '', v.slug, '', { n: 1, gap_sum: gap ? Math.max(v.t_open - before.t_close, 0) : 0, gap_n: gap ? 1 : 0 });
      if (!vs.some(x => x.n === v.n + 1)) stat('flow', v.slug, '', '', { n: 1 });
      const tu = x => ks.some(k => k.kind === 'tu' && k.n === v.n && k.x === x);
      const firstEnded = rs.filter(x => x.n === v.n && x.code !== null).sort((x, y) => x.k - y.k)[0];
      stat('tutorial', v.slug, tu('d') ? 'done' : tu('s') ? 'start' : 'none', firstEnded ? firstEnded.code : '', { n: 1 });
    }
    for (const x of rs) {
      const ended = x.code !== null;
      if (s.u !== '' && x.duo === 0 && ended && x.attempt !== null) {
        stat('attempt', x.slug, bucket(x.attempt, BUCKETS.attempt), '', { n: 1, ...skill(x) });
        const since = firstPlay.get(s.u + ' ' + x.slug);
        if (since !== undefined) stat('tenure', x.slug, String(Math.min(Math.floor(Math.max(s.start_s + (x.t0 ?? x.t) - since, 0) / 604800), 13)), '', { n: 1, ...skill(x) });
      }
      if (ended && x.duo === 0) {
        const next = rs.find(y => y.n === x.n && y.k === x.k + 1);
        const k2 = next ? (next.id === x.id ? 'same' : 'level') : vs.some(v => v.n > x.n) ? 'game' : 'stop';
        const gap = next && next.t0 !== null;
        stat('persist', x.slug, x.code, k2, { n: 1, gap_sum: gap ? Math.max(next.t0 - x.t, 0) : 0, gap_n: gap ? 1 : 0 });
        stat('fatigue', x.slug, bucket(x.t0 ?? x.t, BUCKETS.fatigue, 60), '', { n: 1, w: x.code === 'w', l: x.code === 'l', q: x.code === 'q', hits: x.hits,
          misses: x.misses, rt_sum: x.rt_sum, rt_n: x.rt_n, inputs: x.inputs, ms: x.ms });
        const later = rs.some(y => y.n === x.n && y.k > x.k);
        if (x.code === 'q' || !later) {
          const earlier = rs.filter(y => y.n === x.n && y.k < x.k), wall = Math.max(0, ...earlier.filter(y => y.code !== 'l').map(y => y.k));
          stat('qrun', x.slug, String(Math.min(earlier.filter(y => y.code === 'l' && y.k > wall).length, 5)), x.code === 'q' ? 'q' : 'x', { n: 1 });
        }
      }
      if (ended && x.tier0 > 0) stat('tier', x.slug, String(x.tier0), '', { n: 1, w: x.code === 'w', l: x.code === 'l', q: x.code === 'q', ms: x.ms,
        win_ms: x.code === 'w' ? x.ms : 0 });
    }
  }
  // daymin: one row per canonical student, its band from its first session that day.
  const byStudent = new Map();
  for (const s of sessions.filter(x => x.u !== '')) (byStudent.get(canon(s.u)) || byStudent.set(canon(s.u), []).get(canon(s.u))).push(s);
  for (const list of byStudent.values()) {
    const m = sumOf(list, s => sumOf(visits.get(s.id) || [], v => v.engaged_ms));
    const st = row('r_stat', [day, first(list).a, 'daymin', '', bucket(m, BUCKETS.daymin, 60000), '']);
    add(st, { n: 1, students: 1, ms: m });
  }
  // The distinct counts, text columns and rounded seconds.
  for (const [table, map] of Object.entries(out)) {
    for (const g of map.values()) {
      for (const name of ['students', 'new_students', 'games', 'pcs']) if (g.sets[name] && name in g && !(table === 'r_stat' && name === 'students' && g.metric === 'daymin')) g[name] = g.sets[name].size;
      if (table === 'r_game_day' || table === 'r_level_day' || table === 'r_source_day') g.sessions = g.sets.sessions ? g.sets.sessions.size : g.sessions;
      if (table === 'r_game_day') g.wall_s = Math.round((g.sets.wall || 0) / 1000);
      if (table === 'r_student_day' || table === 'r_student_game') g.a = first(g.sets.sessions || []).a;
      if (table === 'r_pc_day') g.k = g.sets.sessions.slice().sort((x, y) => y.start_s - x.start_s || y.id - x.id)[0].k;
      delete g.sets;
    }
  }
  return Object.fromEntries(Object.entries(out).map(([table, map]) => [table, sortRows(table, [...map.values()])]));
}
const sortRows = (table, rows) => rows.sort((x, y) => {
  for (const [c] of ROLLUPS[table].key) if (x[c] !== y[c]) return x[c] < y[c] ? -1 : 1;
  return 0;
});
async function rolled(db, day) {
  const out = {};
  for (const table of Object.keys(ROLLUPS)) out[table] = sortRows(table, (await db.prepare(`SELECT * FROM ${table} WHERE day = ?1`).bind(day).all()).results);
  return out;
}
// A store whose school zone the owner set before `day`, and whose facts start on it.
async function storeFor(zone, day) {
  const db = openDatabase(':memory:'), { lo } = dayBounds(zone, day);
  await openStore(db).updateSettings({ tz: zone }, (lo - DAY_MS / 1000) * 1000);
  await db.prepare("UPDATE settings SET value = ?1 WHERE key = 'facts_since'").bind(day).run();
  return { db, store: openStore(db) };
}
// Every metric and table has rows, so the comparison covers them all.
function covers(rows) {
  for (const [table, list] of Object.entries(rows)) assert.ok(list.length > 0, table + ' has rows');
  assert.deepEqual(new Set(rows.r_stat.map(r => r.metric)), new Set(METRICS));
  // Every sum of every table is used somewhere (but the ones these games never send).
  for (const [table, { sums }] of Object.entries(ROLLUPS)) {
    const unused = sums.filter(c => rows[table].every(r => r[c] === 0));
    assert.deepEqual(unused.filter(c => !['error_l', 'error_t', 'error_x', 'src_starter', 'np_max', 'score_max'].includes(c) || table === 'r_pc_day' && c === 'np_max'), [],
      table + ': no column without data');
  }
}

for (const { zone, day, label } of [{ zone: 'Asia/Riyadh', day: '2026-10-20', label: 'a school day in Riyadh' },
  { zone: 'Europe/London', day: '2026-10-25', label: 'London\'s 25-hour day' }]) {
  test(`every rollup equals the JavaScript oracle over the same facts: ${label}`, async () => {
    const { db, store } = await storeFor(zone, day), { lo, hi } = dayBounds(zone, day);
    const batches = schoolDay({ day, zone });
    await ingestAll(store, batches);
    // The KPIs from the facts, before the roll.
    const query = { from: day, to: day, band: null }, at = (hi + 2 * 3600) * 1000;
    const before = await store.kpis(query, at);
    assert.deepEqual(await store.rollupStep(at), { rolled: day, kind: 'first', voted: null, purged: null });
    const expected = await oracle(db, zone, day), got = await rolled(db, day);
    covers(expected);
    for (const table of Object.keys(ROLLUPS)) assert.deepEqual(got[table], expected[table], table);
    // The KPIs read the same numbers from the rollups.
    assert.deepEqual({ ...await store.kpis(query, at), clock: null }, { ...before, clock: null });
    assert.ok(before.totals.sessions > 100 && before.totals.students.active > 20);
    if (zone === 'Europe/London') assert.equal(hi - lo, 25 * 3600, 'a day of 25 hours');

    // Late data: a visit closes and grows, rounds end and get a next one, a new session.
    const sessions = (await db.prepare('SELECT s, u, p, a, start_s FROM st_sessions WHERE wire = 3 AND u <> \'\' AND start_s >= ?1 AND start_s < ?2 ORDER BY id').bind(lo, hi).all()).results;
    const open = (await db.prepare('SELECT s.s, s.u, s.p, s.a, s.start_s, v.n, v.slug FROM st_visits v JOIN st_sessions s ON s.id = v.sid ' +
      'WHERE v.closed = 0 AND s.wire = 3 AND s.start_s >= ?1 AND s.start_s < ?2 ORDER BY s.id LIMIT 3').bind(lo, hi).all()).results;
    assert.ok(open.length === 3 && sessions.length > 10);
    const late = (at - 600000) / 1000, z6 = [0, 0, 0, 0, 0, 0];
    const send = (s, ev) => store.ingest(validateBatch({ v: 3, b: 'f'.repeat(16), s: s.s, k: 'src', m: 'web', a: s.a, d: [4, 4, 1920], u: s.u, p: s.p, z: zone,
      w: late - s.start_s, ev }), late * 1000);
    for (const v of open) {
      await send(v, [['rs', 4000, v.n, 90, v.slug, 'L1', 1, 0], ['re', 4100, v.n, 90, v.slug, 'l', 'L1', 50000, 5, 1, 1, 1, z6, null],
        ['rs', 4110, v.n, 91, v.slug, 'L1', 1, 1], ['re', 4200, v.n, 91, v.slug, 'w', 'L1', 50000, 5, 1, 1, 1, z6, null],
        ['gx', 4300, v.n, v.slug, 3600000, z6, [1, 0, 0, 0]], ['go', 4310, 50, 'maze-dash', 'catalog', 0, 0]]);
    }
    await send({ ...sessions[0], s: 'feedfeedfeed', start_s: lo + 7200 }, [['ss', 0, 0, 3, 1, 2, 4, 0], ['go', 1, 1, 'road-hopper', 'catalog', 0, 0]]);
    assert.deepEqual((await db.prepare('SELECT dirty FROM roll_days').all()).results, [{ dirty: 1 }]);
    // At most once an hour: an hour after the roll, the diff re-roll.
    assert.equal((await store.rollupStep(at + 1800000)).rolled, null);
    assert.deepEqual(await store.rollupStep(at + 3700000), { rolled: day, kind: 'diff', voted: null, purged: null });
    const after = await oracle(db, zone, day), diffed = await rolled(db, day);
    for (const table of Object.keys(ROLLUPS)) {
      assert.deepEqual(table === 'r_stat' ? diffed[table].filter(r => r.n > 0) : diffed[table], after[table], 'after the diff: ' + table);
    }
    const zeros = diffed.r_stat.filter(r => r.n === 0);
    assert.ok(zeros.length > 0 && zeros.every(r => ROLLUPS.r_stat.sums.every(c => r[c] === 0)), 'rows that lost their facts are zero');
    // A full re-roll (a recount) rebuilds the day exactly.
    await db.prepare('UPDATE roll_days SET dirty = 2').run();
    await db.prepare("UPDATE settings SET value = '1' WHERE key = 'rebuild'").run();
    assert.equal((await openStore(db).rollupStep(at + 3800000)).kind, 'full');
    assert.deepEqual(await rolled(db, day), after);
  });
}

test('a roll reads only the facts of its day, by index: on a busy day (500 sessions) those ranges hold well under 100,000 rows', async () => {
  const zone = 'Asia/Riyadh', day = '2026-10-20', { db, store } = await storeFor(zone, day), { lo, hi } = dayBounds(zone, day);
  await ingestAll(store, schoolDay({ day, zone, sessions: 500, seed: 11 }));
  const count = async text => (await db.prepare(text).bind(lo, hi).first()).n;
  const inDay = 'SELECT id FROM st_sessions WHERE start_s >= ?1 AND start_s < ?2';
  const rows = await count('SELECT COUNT(*) AS n FROM st_sessions WHERE start_s >= ?1 AND start_s < ?2') +
    await count(`SELECT COUNT(*) AS n FROM st_visits WHERE sid IN (${inDay})`) + await count(`SELECT COUNT(*) AS n FROM st_rounds WHERE sid IN (${inDay})`) +
    await count(`SELECT COUNT(*) AS n FROM st_marks WHERE sid IN (${inDay})`);
  assert.ok(rows > 3000 && rows < 100000, rows + ' fact rows in the day');
  // Every statement of a roll finds them through the start index and the primary keys.
  const seen = new Map(), batch = db.batch.bind(db);
  db.batch = async statements => { for (const st of statements) seen.set(st.sql, st.params); return batch(statements); };
  await store.rollupStep((hi + 7200) * 1000);
  await db.prepare('UPDATE roll_days SET dirty = 1, rolled_s = 0').run();
  await store.rollupStep((hi + 3 * 3600) * 1000);
  db.batch = batch;
  let checked = 0;
  for (const [text, params] of seen) {
    if (!/^(?:INSERT INTO r_|DELETE FROM r_)/.test(text)) continue;
    checked++;
    const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN ' + text).all(...params).map(step => step.detail);
    for (const step of plan) assert.doesNotMatch(step, /^SCAN (?:st_|r_)/, text.slice(0, 80) + '\n' + plan.join('\n'));
  }
  assert.equal(checked, Object.keys(ROLLUPS).length * 2, 'the first roll and the diff of every table');
});

test('the driver refuses what D1 refuses (a sixth compound term, a 33rd function argument, a 101st parameter), and every roll statement fits', async () => {
  const db = openDatabase(':memory:');
  const terms = n => Array.from({ length: n }, (_, i) => 'SELECT ' + i + ' AS x').join(' UNION ALL ');
  assert.equal((await db.prepare(terms(5)).all()).results.length, 5);
  await assert.rejects(db.prepare(terms(6)).all(), /too many terms in compound SELECT/);
  // Nested compounds are counted one by one, as SQLite does.
  assert.equal((await db.prepare(`SELECT * FROM (${terms(5)}) UNION ALL SELECT * FROM (${terms(5)})`).all()).results.length, 10);
  const list = n => Array.from({ length: n }, (_, i) => String(i)).join(', ');
  assert.equal((await db.prepare(`SELECT json_array(${list(32)}) AS a`).first('a')).split(',').length, 32);
  await assert.rejects(db.prepare(`SELECT json_array(${list(33)}) AS a`).all(), /too many arguments on function json_array/);
  await assert.rejects(db.prepare("SELECT printf('%s', " + list(32) + ') AS a').all(), /too many arguments on function printf/);
  // An IN list, a column list and a VALUES row are no function calls; text in quotes is no SQL.
  assert.equal((await db.prepare(`SELECT 1 AS a WHERE 5 IN (${list(40)}) AND 'json_array(${list(40)})' <> ''`).first('a')), 1);
  await assert.rejects(db.prepare('SELECT ?101 AS a').bind(...Array(101).fill(1)).all(), /too many SQL variables/);
  for (const table of Object.keys(ROLLUPS)) {
    for (const [kind, text] of Object.entries(rollStatements(table))) assert.equal(d1LimitError(text), null, table + ' ' + kind);
  }
  db.close();
});

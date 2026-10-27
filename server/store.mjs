// Storage for the ingest server over a D1-style async SQL driver (Cloudflare D1 on
// Workers, sqlite-d1.mjs on Node), schema 4 (docs/RESEARCH_TELEMETRY_SPEC.md, "Storage on
// D1"). An accepted batch is stored as row-level facts: its play session (st_sessions),
// game visits (st_visits), rounds (st_rounds) and marks (st_marks), and the student, PC
// and attempt counters behind them. Each table takes one INSERT ... ON CONFLICT DO UPDATE
// whose rows are one JSON parameter, all in one transaction, so a request costs O(rows),
// never one statement per event. Every write of a v3 batch is idempotent (first-known
// values with COALESCE, running totals with MAX, natural keys with INSERT OR IGNORE), so a
// batch delivered twice changes nothing; v2 batches are numbered by the server and
// de-duplicated through `batches`. The 5-minute cron rolls the facts of one of the
// school's local days at a time into small per-day rollups (rollups.mjs); the KPIs read
// them, the facts of the days not rolled yet, and the daily aggregates of milestone 2
// (agg_*), which are frozen: read for the days before the update and never written.
// Nothing is suppressed: every group is shown with its numbers. Rows hold only validated
// contract values, pseudonymous codes, counts and times counted from the session's start
// (start_s: the receipt time minus the PC's own elapsed seconds): no column for an IP, a
// header, a name or anything a child types. `live` keeps the last receipt minute and open
// game per session while it is in the five-minute window. The daily purge keeps the
// facts RETENTION_DAYS (or the owner's choice) and the rollups at least 800 days.
import { CODES, ERRORS, SOURCES, WIRES } from './schema.mjs';
import { dayBounds, localDay, localParts, offsetMin, offsetsBetween, weekStartOf } from './clock.mjs';
import { F, IL, PLAYS, PROFILE_AGE, REPLAY, ROLLUPS, ROLLUP_TABLES, RT, SINCE_LAST, TABLES, rollStatements, rollupSelect, spanScope }
  from './rollups.mjs';

export { ROLLUPS, TABLES };
// Nothing is suppressed: a group of one session is shown with its numbers.
export const MIN_SESSIONS = 0;
export const LIVE_WINDOW_MIN = 5;
export const DEDUP_DAYS = 30;
export const USAGE_DAYS = 60;
// The facts are kept this many days unless the owner chooses otherwise; the rollups at
// least ROLLUP_DAYS.
export const RETENTION_DAYS = 400;
export const ROLLUP_DAYS = 800;
export const SCHEMA_VERSION = 4;
// The free plan's daily limits (rows read and written, reset at 00:00 UTC) and size.
export const LIMITS = { reads: 5000000, writes: 100000, bytes: 500000000 };
// The guards (§D.8): above these, exports and then admin reads answer 429, admin actions
// that write answer 429, re-rolls wait for the next UTC day, and the daily purge trims the
// oldest round details.
export const GUARDS = { exportReads: 3500000, adminReads: 4200000, adminWrites: 90000, rollWrites: 80000, rollReads: 3000000,
  rebuildReads: 2000000, bytes: 425000000 };
const DAY_MS = 86400000;
const DAY_S = 86400;
const MINUTE_MS = 60000;
// The instance reads the settings again when its copy is older than this.
const SETTINGS_MS = 5 * MINUTE_MS;
const CLOSED_KEEP_MS = 3600000;
const KEPT_CAP = 16;
// Kept KPI rows stay well under D1's 2 MB limit for a value.
const KEPT_MAX = 1000000;
// X-Batch-Every: the seconds a PC waits between batches, by today's rows written.
const BATCH_EVERY = [[60000, 60], [80000, 180], [Infinity, 300]];
const BANDS = [['6-7', '6-7'], ['8-9', '8-9'], ['10-11', '10-11'], ['', 'unknown']];
const DEVICES = [['cores', 'cores'], ['mem', 'memory'], ['screen', 'screen']];
// A local two-player round (the same rule as TWO_PLAYER in js/teacher.js).
const DUO = /(?:^|:)(?:duo|local|pvp)$/;
// A diff re-roll looks this many local days back: late data reaches no older day (a
// session is at most 7 days long and a PC keeps a batch at most 7 days).
const LATE_DAYS = 16;
// The school's zone is locked once this many PCs seen in the last 14 days report it.
const LOCK_PCS = 3;
const VOTE_DAYS = 14;
// The storage guard removes the round details of this many of the oldest days at a time.
const TRIM_DAYS = 30;
const AGGREGATES = Object.keys(TABLES);
const TEXT_KEYS = new Set(['slug', 'id', 'src']);

export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (day, n) => utcDay(Date.parse(day + 'T00:00:00Z') + n * DAY_MS);
// The number of parameters a statement has (its highest ?N): exactly that many are bound.
const SLOTS = new Map();
function slots(text) {
  let n = SLOTS.get(text);
  if (n === undefined) {
    n = 0;
    for (const [, i] of text.matchAll(/\?(\d+)/g)) n = Math.max(n, Number(i));
    if (SLOTS.size > 512) SLOTS.clear();
    SLOTS.set(text, n);
  }
  return n;
}

const keyList = key => ['day', 'a', ...key].join(', ');
// Schema 3 (milestone 2): the target of the milestone-1 upgrade and of schema 1 and 2.
const SCHEMA_3 = [
  'CREATE TABLE IF NOT EXISTS batches (b TEXT PRIMARY KEY, day TEXT NOT NULL) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS seen (day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, s TEXT NOT NULL, ' +
    'PRIMARY KEY (day, kind, key, s)) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS live (s TEXT PRIMARY KEY, slug TEXT NOT NULL, seen_minute INTEGER NOT NULL) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS kpi_cache (key TEXT PRIMARY KEY, made TEXT NOT NULL, rows TEXT NOT NULL) STRICT, WITHOUT ROWID',
  ...Object.entries(TABLES).map(([table, { key, sums }]) => `CREATE TABLE IF NOT EXISTS ${table} (day TEXT NOT NULL, a TEXT NOT NULL, ` +
    key.map(c => `${c} ${TEXT_KEYS.has(c) ? 'TEXT' : 'INTEGER'} NOT NULL, `).join('') +
    sums.map(c => `${c} INTEGER NOT NULL DEFAULT 0, `).join('') + `PRIMARY KEY (${keyList(key)})) STRICT, WITHOUT ROWID`)
];
// Schema 4: settings and bookkeeping, the facts, and the rollups (§D.2, exactly).
const FACTS = [
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, reads INTEGER NOT NULL DEFAULT 0, writes INTEGER NOT NULL DEFAULT 0, ' +
    'rebuild_reads INTEGER NOT NULL DEFAULT 0, export_reads INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS roll_days (day TEXT PRIMARY KEY, dirty INTEGER NOT NULL, rolled_s INTEGER NOT NULL) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS st_pcs (p TEXT PRIMARY KEY, first_s INTEGER NOT NULL, last_s INTEGER NOT NULL, z TEXT NOT NULL, ' +
    'cores INTEGER NOT NULL, mem INTEGER NOT NULL, screen INTEGER NOT NULL, k TEXT NOT NULL) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS st_students (u TEXT PRIMARY KEY, label TEXT NOT NULL, first_s INTEGER NOT NULL, last_s INTEGER NOT NULL, ' +
    'band_first TEXT NOT NULL, band_last TEXT NOT NULL, age_days_first INTEGER, removed_s INTEGER) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS st_student_pcs (u TEXT NOT NULL, p TEXT NOT NULL, first_s INTEGER NOT NULL, ' +
    'PRIMARY KEY (u, p)) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS st_student_games (u TEXT NOT NULL, slug TEXT NOT NULL, rounds INTEGER NOT NULL, first_s INTEGER NOT NULL, ' +
    'PRIMARY KEY (u, slug)) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS st_sessions (id INTEGER PRIMARY KEY, s TEXT NOT NULL UNIQUE, u TEXT NOT NULL, p TEXT NOT NULL, ' +
    'wire INTEGER NOT NULL, a TEXT NOT NULL, k TEXT NOT NULL, m TEXT NOT NULL, cores INTEGER NOT NULL, mem INTEGER NOT NULL, ' +
    'screen INTEGER NOT NULL, start_s INTEGER NOT NULL, clock TEXT NOT NULL, z TEXT NOT NULL, is_new INTEGER, age_days INTEGER, ' +
    'since_days INTEGER, age_b INTEGER, since_b INTEGER, level0 INTEGER, np INTEGER, cls INTEGER, se_t INTEGER, se_ms INTEGER, ' +
    'why TEXT, vn INTEGER NOT NULL DEFAULT 0, open_n INTEGER, open_slug TEXT, open_k INTEGER, last_k INTEGER NOT NULL DEFAULT 0) STRICT',
  'CREATE INDEX IF NOT EXISTS st_sessions_time ON st_sessions (start_s, u)',
  'CREATE INDEX IF NOT EXISTS st_sessions_student ON st_sessions (u, start_s)',
  'CREATE TABLE IF NOT EXISTS st_visits (sid INTEGER NOT NULL, n INTEGER NOT NULL, slug TEXT NOT NULL, t_open INTEGER, ' +
    't_close INTEGER, src TEXT, plays INTEGER, plays_b INTEGER, fav INTEGER, load_ms INTEGER, err TEXT, ' +
    'engaged_ms INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0, ' +
    [...IL, ...F].map(c => c + ' INTEGER, ').join('') + 'PRIMARY KEY (sid, n)) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS st_rounds (sid INTEGER NOT NULL, n INTEGER NOT NULL, k INTEGER NOT NULL, slug TEXT NOT NULL, ' +
    'id TEXT NOT NULL, t0 INTEGER, tier0 INTEGER, replay INTEGER, t INTEGER, code TEXT, ms INTEGER, score INTEGER, tier INTEGER, ' +
    'hits INTEGER, misses INTEGER, ' + RT.map(c => c + ' INTEGER, ').join('') + 'wall_ms INTEGER, inputs INTEGER, idle INTEGER, ' +
    'pauses INTEGER, rt_sum INTEGER, rt_n INTEGER, dda INTEGER, duo INTEGER NOT NULL, attempt INTEGER, ' +
    'PRIMARY KEY (sid, n, k)) STRICT, WITHOUT ROWID',
  // x: lv level | fv '1'/'0' | tu 's'/'d' | ct what || ':' || minutes | pr code | cd old code
  'CREATE TABLE IF NOT EXISTS st_marks (sid INTEGER NOT NULL, kind TEXT NOT NULL, t INTEGER NOT NULL, n INTEGER NOT NULL, ' +
    'x TEXT NOT NULL, PRIMARY KEY (sid, kind, t, n, x)) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS aliases (u_old TEXT PRIMARY KEY, u_new TEXT NOT NULL, s INTEGER NOT NULL, how TEXT NOT NULL) STRICT, WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS cards (code TEXT PRIMARY KEY, set_no INTEGER NOT NULL, a TEXT NOT NULL, made_day TEXT NOT NULL) STRICT, WITHOUT ROWID'
];
const LIVE_4 = 'CREATE TABLE IF NOT EXISTS live (s TEXT PRIMARY KEY, slug TEXT NOT NULL, seen_minute INTEGER NOT NULL, ' +
  "u TEXT NOT NULL DEFAULT '', p TEXT NOT NULL DEFAULT '', wire INTEGER NOT NULL DEFAULT 2) STRICT, WITHOUT ROWID";
const ROLLUP_SCHEMA = Object.entries(ROLLUPS).flatMap(([table, { key, text = [], sums, index }]) => [
  `CREATE TABLE IF NOT EXISTS ${table} (` + key.map(([c, type]) => `${c} ${type} NOT NULL, `).join('') +
    text.map(c => `${c} TEXT NOT NULL DEFAULT '', `).join('') + sums.map(c => `${c} INTEGER NOT NULL DEFAULT 0, `).join('') +
    `PRIMARY KEY (${key.map(([c]) => c).join(', ')})) STRICT, WITHOUT ROWID`,
  ...(index ? [`CREATE INDEX IF NOT EXISTS ${index[0]} ON ${table} (${index[1].join(', ')})`] : [])
]);
const SCHEMA_4 = [...FACTS, ...ROLLUP_SCHEMA];
// The settings of a new schema 4 (TEXT values): the school's zone is unknown until a PC or
// the dashboard reports one; facts_since is the first day of the facts and legacy_until
// the last day of the frozen aggregates ('' when there are none). Two keys are the cron's
// bookkeeping: rebuild is '1' while days may wait for a full re-roll, and trimmed_size the
// database size when the storage guard last removed round details.
const SETTINGS_INIT = 'INSERT OR IGNORE INTO settings (key, value) VALUES ' +
  "('tz', 'UTC'), ('tz_source', 'none'), ('tz_epoch', '0'), ('week_start', 'mon'), ('week_source', 'auto'), ('keep_days', ''), " +
  "('facts_since', ?1), ('legacy_until', ?2), ('v3_since', ''), ('rv', '1'), ('rolled_through', ''), ('trimmed_before', ''), " +
  "('rebuild', ''), ('trimmed_size', '')";
const META = 'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT, WITHOUT ROWID';
const setVersion = version => `INSERT INTO meta (key, value) VALUES ('schema', ${version}) ` +
  'ON CONFLICT (key) DO UPDATE SET value = excluded.value';
// The first statement of an instance, and the settings refresh: the schema version with
// the settings and today's usage. Before schema 4 it fails (there is no settings table).
const PROBE = "SELECT (SELECT value FROM meta WHERE key = 'schema') AS schema, " +
  '(SELECT json_group_object(key, value) FROM settings) AS settings, ' +
  '(SELECT json_array(reads, writes, rebuild_reads, export_reads, size) FROM usage WHERE day = ?1) AS usage';

// The first schema (one table per event kind) is folded into the aggregates on upgrade.
// For each aggregate: [FROM clause, its day/band/key expressions, the sums it adds].
const isCode = Object.fromEntries(CODES.map(c => [c, `code = '${c}'`]));
const flags = (columns, column) => Object.fromEntries(columns.map((c, i) => [c, `${column} = ${i}`]));
const tier = { tier_sum: 'CASE WHEN tier > 0 THEN tier ELSE 0 END', tier_n: 'tier > 0' };
const same = columns => Object.fromEntries(columns.map(c => [c, c]));
const device = 'e JOIN session_days d ON d.s = e.s AND d.day = e.day';
const deviceKeys = { day: 'e.day', a: 'e.a', cores: 'd.cores', mem: 'd.mem', screen: 'd.screen' };
const LEGACY = {
  agg_days: [
    ['session_days', {}, { sessions: '1', web: "m = 'web'", app: "m = 'app'" }],
    ['ev_gx', {}, { engaged_ms: 'ms' }], ['ev_go', {}, { opens: '1' }], ['ev_rs', {}, { starts: '1' }],
    ['ev_re', {}, { ends: '1' }], ['ev_lv', {}, { level_ups: '1' }], ['ev_er', {}, { errors: '1' }],
    ['ev_ss', {}, { session_starts: '1', new_profiles: 'new_profile', guests: 'level = 0',
      ...flags(PROFILE_AGE, 'profile_age'), ...flags(SINCE_LAST, 'since_last') }]
  ],
  agg_games: [
    ['session_games', {}, { sessions: '1' }],
    ['ev_go', {}, { opens: '1', ...Object.fromEntries(SOURCES.map(src => ['src_' + src, `src = '${src}'`])), ...flags(PLAYS, 'plays') }],
    ['ev_gx', {}, { closes: '1', engaged_ms: 'ms', ...same([...IL, ...F]) }],
    ['ev_rs', {}, { starts: '1', ...tier,
      ...flags(REPLAY, 'CASE WHEN replay < 3 THEN replay WHEN replay < 5 THEN 3 WHEN replay < 10 THEN 4 ELSE 5 END') }],
    ['ev_re', {}, { ends: '1', ...isCode, ...same(['hits', 'misses', ...RT]) }],
    ['ev_ld', {}, { loads: '1', load_ms: 'ms' }],
    ['ev_er', {}, Object.fromEntries(ERRORS.map(kind => ['error_' + kind, `kind = '${kind}'`]))]
  ],
  agg_levels: [
    ['session_levels', {}, { sessions: '1' }],
    ['ev_rs', {}, { starts: '1', ...tier }],
    ['ev_re', {}, { ends: '1', ...isCode, ms: 'ms' }]
  ],
  agg_sources: [
    ['(SELECT day, a, src, COUNT(DISTINCT s) AS n, COUNT(*) AS opens FROM ev_go GROUP BY day, a, src)', {}, { sessions: 'n', opens: 'opens' }]
  ],
  agg_devices: [
    ['session_days', {}, { sessions: '1' }],
    ['ev_gx ' + device, deviceKeys, Object.fromEntries([...F, ...IL].map(c => [c, 'e.' + c]))],
    ['ev_ld ' + device, deviceKeys, { loads: '1', load_ms: 'e.ms' }]
  ]
};
const LEGACY_TABLES = ['session_days', 'session_games', 'session_levels', 'ev_ss', 'ev_go', 'ev_ld', 'ev_er', 'ev_rs', 'ev_re', 'ev_gx', 'ev_lv', 'ev_se'];
// Today's and yesterday's sessions, as seen by the last receipt day in the old tables.
const LEGACY_SEEN = "(SELECT date(MAX(day), '-1 day') FROM session_days)";

function legacyUpgrade() {
  const sql = Object.entries(LEGACY).map(([table, sources]) => {
    const { key, sums } = TABLES[table], columns = ['day', 'a', ...key];
    const parts = sources.map(([from, keys, values]) => 'SELECT ' +
      columns.map(c => `${keys[c] || c} AS ${c}`).concat(sums.map(c => `${values[c] || 0} AS ${c}`)).join(', ') + ' FROM ' + from);
    return `INSERT INTO ${table} (${[...columns, ...sums].join(', ')}) SELECT ${columns.join(', ')}, ` +
      sums.map(c => `SUM(${c})`).join(', ') + ` FROM (${parts.join(' UNION ALL ')}) GROUP BY ${columns.join(', ')}`;
  });
  sql.push(`INSERT OR IGNORE INTO seen (day, kind, key, s) SELECT day, 'd', '', s FROM session_days WHERE day >= ${LEGACY_SEEN} ` +
    `UNION SELECT day, 'g', slug, s FROM session_games WHERE day >= ${LEGACY_SEEN} ` +
    `UNION SELECT day, 'l', slug || ' ' || id, s FROM session_levels WHERE day >= ${LEGACY_SEEN} ` +
    `UNION SELECT day, 's', src, s FROM ev_go WHERE day >= ${LEGACY_SEEN}`);
  sql.push(...LEGACY_TABLES.map(table => `DROP TABLE ${table}`), 'DROP INDEX IF EXISTS batches_day',
    // The first server refuses a database whose user_version is newer than its own (1).
    'PRAGMA user_version = 3');
  return sql;
}

/* ------------------------------------------------------------ the writes */
// v2 buckets, kept for v3 so the milestone-2 numbers stay exact: profile age 0 new (or a
// guest), 1 1-6 days, 2 7-29, 3 30+; days since the last play 0 same day, 1 one, 2 2-6, 3 7+,
// 4 first time; plays before 0, 1, 2-4, 5-9, 10+.
const ageBucket = days => days < 1 ? 0 : days < 7 ? 1 : days < 30 ? 2 : 3;
const sinceBucket = days => days < 0 ? 4 : days < 1 ? 0 : days < 2 ? 1 : days < 7 ? 2 : 3;
const playsBucket = n => n < 2 ? n : n < 5 ? 2 : n < 10 ? 3 : 4;
const SESSION = ['s', 'u', 'p', 'wire', 'a', 'k', 'm', 'cores', 'mem', 'screen', 'start_s', 'clock', 'z', 'is_new', 'age_days',
  'since_days', 'age_b', 'since_b', 'level0', 'np', 'cls', 'se_t', 'se_ms', 'why', 'vn', 'open_n', 'open_slug', 'open_k', 'last_k'];
const FIRST_KNOWN = ['is_new', 'age_days', 'since_days', 'age_b', 'since_b', 'level0', 'np', 'cls', 'se_t', 'se_ms', 'why'];
const NUMBERING = ['vn', 'open_n', 'open_slug', 'open_k', 'last_k'];
const VISIT = ['n', 'slug', 't_open', 't_close', 'src', 'plays', 'plays_b', 'fav', 'load_ms', 'err', 'engaged_ms', 'closed', ...IL, ...F];
const ROUND = ['n', 'k', 'slug', 'id', 't0', 'tier0', 'replay', 't', 'code', 'ms', 'score', 'tier', 'hits', 'misses', ...RT,
  'wall_ms', 'inputs', 'idle', 'pauses', 'rt_sum', 'rt_n', 'dda', 'duo', 'attempt'];
const EXTRA = ['wall_ms', 'inputs', 'idle', 'pauses', 'rt_sum', 'rt_n', 'dda'];
// An update that would leave the row as it is writes nothing (D1 bills every row written).
const unchanged = set => `(${set.map(([c]) => c).join(', ')}) IS NOT (${set.map(([, e]) => e).join(', ')})`;
const assign = set => set.map(([c, e]) => `${c} = ${e}`).join(', ');
const first = c => [c, `COALESCE(${c}, excluded.${c})`];
const most = c => [c, `MAX(${c}, excluded.${c})`];

// W2: the session, first. ss and se fields keep their first known value; a v2 batch also
// writes the server's numbering state. ?30 is 0 for a v3 batch without ss or se, so that a
// later batch of the session writes no session row.
function sessionUpsert(v2) {
  const set = [...FIRST_KNOWN.map(first), ...(v2 ? NUMBERING.map(c => [c, `excluded.${c}`]) : [])];
  return `INSERT INTO st_sessions (${SESSION.join(', ')}) VALUES (${SESSION.map((_, i) => '?' + (i + 1)).join(', ')}) ` +
    `ON CONFLICT (s) DO UPDATE SET ${assign(set)} WHERE ?${SESSION.length + 1} AND ${unchanged(set)}`;
}
const SESSION_V3 = sessionUpsert(false), SESSION_V2 = sessionUpsert(true);
// The facts of session ?1 from a JSON array of rows (?2, each in `columns` order).
const SID = '(SELECT id FROM st_sessions WHERE s = ?1)';
function factUpsert(table, key, columns, set) {
  return `INSERT INTO ${table} (sid, ${columns.join(', ')}) SELECT ${SID}, ${columns.map((_, i) => `value ->> ${i}`).join(', ')} ` +
    `FROM json_each(?2) WHERE true ON CONFLICT (${key}) DO UPDATE SET ${assign(set)} WHERE ${unchanged(set)}`;
}
// W5: game visits; first known values, and the running engaged time and closed flag.
const VISITS = factUpsert('st_visits', 'sid, n', VISIT,
  [...VISIT.filter(c => !['n', 'slug', 'engaged_ms', 'closed'].includes(c)).map(first), most('engaged_ms'), most('closed')]);
// W6: rounds; rs and re of one (n, k) are one row, and the attempt number is kept once given.
const ROUNDS = factUpsert('st_rounds', 'sid, n, k', ROUND, ROUND.filter(c => !['n', 'k', 'slug', 'id', 'duo'].includes(c)).map(first));
// W8: marks (lv fv tu ct pr cd), on their natural key.
const MARKS = `INSERT OR IGNORE INTO st_marks (sid, kind, t, n, x) SELECT ${SID}, value ->> 0, value ->> 1, value ->> 2, value ->> 3 FROM json_each(?2)`;
// Times on the facts come from the session's stored start, never from this batch's
// estimate, so a repeat (whose estimate moves with its receipt time) writes the same values.
const START = 'SELECT start_s FROM st_sessions WHERE s = ?1';
// W1: the PC; its zone, device buckets and build come from its newest session.
const newer = c => [c, `CASE WHEN excluded.last_s >= last_s THEN excluded.${c} ELSE ${c} END`];
const PC_SET = [['first_s', 'MIN(first_s, excluded.first_s)'], ['last_s', 'MAX(last_s, excluded.last_s)'],
  ['z', "CASE WHEN excluded.last_s >= last_s AND excluded.z <> '' THEN excluded.z ELSE z END"], ...['cores', 'mem', 'screen', 'k'].map(newer)];
const PC = `INSERT INTO st_pcs (p, first_s, last_s, z, cores, mem, screen, k) SELECT ?2, start_s, start_s, ?3, ?4, ?5, ?6, ?7 ` +
  `FROM st_sessions WHERE s = ?1 ON CONFLICT (p) DO UPDATE SET ${assign(PC_SET)} WHERE ${unchanged(PC_SET)}`;
// W3: the student. The label is the code's first 4 characters in capitals, unless a stored
// code already starts with them (then 6, 8 or all 12); a card code is always all 5. It is
// never changed. band_first and age_days_first come from the earliest session, band_last
// from the latest.
const prefix = n => `WHEN NOT EXISTS (SELECT 1 FROM st_students WHERE u >= substr(?2, 1, ${n}) AND u < substr(?2, 1, ${n}) || 'g') ` +
  `THEN upper(substr(?2, 1, ${n}))`;
const earlier = c => [c, `CASE WHEN excluded.first_s < first_s THEN excluded.${c} ELSE ${c} END`];
const STUDENT_SET = [...['band_first', 'age_days_first'].map(earlier), ['band_last', 'CASE WHEN excluded.last_s >= last_s THEN excluded.band_last ELSE band_last END'],
  ['first_s', 'MIN(first_s, excluded.first_s)'], ['last_s', 'MAX(last_s, excluded.last_s)']];
const STUDENT = `INSERT INTO st_students (u, label, first_s, last_s, band_first, band_last, age_days_first) ` +
  `SELECT ?2, CASE WHEN length(?2) = 5 THEN upper(?2) ${[4, 6, 8].map(prefix).join(' ')} ELSE upper(?2) END, ` +
  `start_s, start_s, ?3, ?3, ?4 FROM st_sessions WHERE s = ?1 ` +
  `ON CONFLICT (u) DO UPDATE SET ${assign(STUDENT_SET)} WHERE ${unchanged(STUDENT_SET)}`;
// W4: the PCs a student played on.
const STUDENT_PC = 'INSERT OR IGNORE INTO st_student_pcs (u, p, first_s) SELECT ?2, ?3, start_s FROM st_sessions WHERE s = ?1';
// W7: the student's rounds ended per game, which numbers their attempts ([slug, total, t]).
const GAMES_SET = [['rounds', 'MAX(rounds, excluded.rounds)'], ['first_s', 'MIN(first_s, excluded.first_s)']];
const STUDENT_GAMES = `INSERT INTO st_student_games (u, slug, rounds, first_s) SELECT ?2, value ->> 0, value ->> 1, (${START}) + (value ->> 2) ` +
  `FROM json_each(?3) WHERE true ON CONFLICT (u, slug) DO UPDATE SET ${assign(GAMES_SET)} WHERE ${unchanged(GAMES_SET)}`;
// W9: profiles removed on this PC ([code, t]); the first removal is kept.
const REMOVED = `UPDATE st_students SET removed_s = (${START}) + (SELECT value ->> 1 FROM json_each(?2) WHERE value ->> 0 = st_students.u LIMIT 1) ` +
  'WHERE removed_s IS NULL AND u IN (SELECT value ->> 0 FROM json_each(?2))';
// W10: older codes of this student (?2), linked to its canonical code, one hop deep: links
// to an old code move to the canonical one, and a link that would form a cycle is refused.
const CANONICAL = 'COALESCE((SELECT u_new FROM aliases WHERE u_old = ?2), ?2)';
const ALIAS_HOP = `UPDATE aliases SET u_new = ${CANONICAL} WHERE u_new IN (SELECT value FROM json_each(?3) WHERE value <> ${CANONICAL})`;
const ALIAS = `INSERT INTO aliases (u_old, u_new, s, how) SELECT value, ${CANONICAL}, (${START}), 'pc' FROM json_each(?3) ` +
  `WHERE value <> ?2 AND value <> ${CANONICAL} ON CONFLICT (u_old) DO NOTHING`;
// W11: a rolled day that late data reaches is rolled again.
const LATE = 'UPDATE roll_days SET dirty = 1 WHERE day IN (SELECT value FROM json_each(?1)) AND dirty = 0';
// W12 and every other change of the school's zone: the zone ?1 from source ?2 (week start
// ?3, used while the week start is automatic), allowed while the current source is one of
// ?4 (such as ',none,dashboard,'). A new zone marks every rolled day since facts_since
// (and not trimmed) for a full rebuild, and bumps tz_epoch and rv; the same zone from
// another source only changes the source. ?5, when not '', is v3_since (the first v3
// batch). SQLite reads each scalar subquery once, at its first use: the WHERE clause of the
// first row it changes, so before any row changes.
const SETTING = key => `(SELECT value FROM settings WHERE key = '${key}')`;
const ALLOWED = `?1 <> '' AND instr(?4, ',' || ${SETTING('tz_source')} || ',') > 0`;
const MOVED = `${ALLOWED} AND ${SETTING('tz')} <> ?1`;
const ZONE_DIRTY = "UPDATE roll_days SET dirty = 2 WHERE day >= (SELECT MAX(value) FROM settings WHERE key IN ('facts_since', 'trimmed_before')) " +
  `AND ${MOVED}`;
const ZONE = "UPDATE settings SET value = CASE key WHEN 'tz' THEN ?1 WHEN 'tz_source' THEN ?2 WHEN 'week_start' THEN ?3 WHEN 'v3_since' THEN ?5 " +
  "WHEN 'rebuild' THEN '1' ELSE CAST(CAST(value AS INTEGER) + 1 AS TEXT) END WHERE CASE key " +
  `WHEN 'tz_source' THEN ${ALLOWED} AND value <> ?2 WHEN 'week_start' THEN ${MOVED} AND ${SETTING('week_source')} = 'auto' AND value <> ?3 ` +
  `WHEN 'v3_since' THEN value = '' AND ?5 <> '' WHEN 'tz' THEN ${MOVED} WHEN 'tz_epoch' THEN ${MOVED} WHEN 'rv' THEN ${MOVED} ` +
  `WHEN 'rebuild' THEN ${MOVED} ELSE 0 END`;
// Who may set the zone: a PC (W12) or the dashboard's guess while nothing better is known;
// the nightly vote also while it is the PCs' provisional choice; the owner always.
const BY_PC = ',none,dashboard,', BY_VOTE = ',none,dashboard,pc,', BY_OWNER = ',none,dashboard,pc,pcs,owner,';
const ADD_BATCH = 'INSERT INTO batches (b, day) VALUES (?1, ?2)';
const ADD_EMPTY_BATCH = 'INSERT OR IGNORE INTO batches (b, day) VALUES (?1, ?2) RETURNING b';
const DUPLICATE = /UNIQUE constraint failed: batches\.b\b/;
// W13. ?4 is 1 when the batch decides the open game (?2). Otherwise the game stays open
// unless ?5 names it (closed), or the session had left the live window (?6) and was forgotten.
const LIVE = 'INSERT INTO live (s, slug, seen_minute, u, p, wire) VALUES (?1, ?2, ?3, ?7, ?8, ?9) ON CONFLICT (s) DO UPDATE SET ' +
  'seen_minute = excluded.seen_minute, slug = CASE WHEN ?4 THEN excluded.slug WHEN seen_minute <= ?6 THEN \'\' ' +
  "WHEN instr(?5, ' ' || slug || ' ') THEN '' ELSE slug END";
// W14. Rows that have left the window (?1 is the current minute - LIVE_WINDOW_MIN) are
// dead: LIVE forgets them anyway. Every sweep deletes them.
const LIVE_SWEEP = 'DELETE FROM live WHERE seen_minute <= ?1';
const LIVE_COUNT = 'SELECT slug, COUNT(*) AS n FROM live WHERE seen_minute > ?1 GROUP BY slug';
// W15: this instance's D1 usage of a UTC day.
const USAGE = 'INSERT INTO usage (day, reads, writes, rebuild_reads, export_reads, size) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
  'ON CONFLICT (day) DO UPDATE SET reads = reads + excluded.reads, writes = writes + excluded.writes, ' +
  'rebuild_reads = rebuild_reads + excluded.rebuild_reads, export_reads = export_reads + excluded.export_reads, ' +
  'size = CASE WHEN excluded.size > 0 THEN excluded.size ELSE size END';
// R1: the session's state (the v2 numbering, with the id of its open round) and which of
// the batch's rounds (?2, [[n, k], ...]) had already ended. R2: a student's rounds ended
// per game, for attempt numbers.
const STATE = 'SELECT s.id, s.start_s, s.vn, s.open_n, s.open_slug, s.open_k, s.last_k, r.id AS open_id, ' +
  '(SELECT json_group_array(json_array(e.n, e.k)) FROM st_rounds e WHERE e.sid = s.id AND e.code IS NOT NULL ' +
  'AND (e.n, e.k) IN (SELECT value ->> 0, value ->> 1 FROM json_each(?2))) AS ended ' +
  'FROM st_sessions s LEFT JOIN st_rounds r ON r.sid = s.id AND r.n = s.open_n AND r.k = s.open_k WHERE s.s = ?1';
const ATTEMPTS = 'SELECT slug, rounds FROM st_student_games WHERE u = ?1 AND slug IN (SELECT value FROM json_each(?2))';

// The facts of one batch, folded per visit (n) and round (n, k). v3 batches carry their
// own numbers; for v2 the server numbers them from the session's state, in event order: go
// opens visit ++vn; ld, er, gx, rs and re of a game that is not the open one open an
// orphan visit; rs is round ++last_k; re ends the open round when its id matches, else it
// is round ++last_k; gx closes the visit.
function fold(wire, envelope, events, state) {
  const visits = new Map(), rounds = new Map(), marks = new Map(), removed = [], linked = [];
  let ss = null, se = null, maxT = 0;
  const visitRow = (n, slug) => visits.get(n) || visits.set(n, {
    n, slug, t_open: null, t_close: null, src: null, plays: null, plays_b: null, fav: null, load_ms: null, err: null,
    engaged_ms: 0, closed: 0, il: null, f: null
  }).get(n);
  const roundRow = (n, k, slug, id) => {
    const key = n + ' ' + k;
    return rounds.get(key) || rounds.set(key, { n, k, slug, id, t0: null, tier0: null, replay: null, t: null, code: null, ms: null,
      score: null, tier: null, hits: null, misses: null, rt: null, x: null, order: Infinity }).get(key);
  };
  const mark = (kind, t, n, x) => marks.set([kind, t, n, x].join(' '), [kind, t, n, x]);
  const set = (row, field, value) => { if (row[field] === null) row[field] = value; };
  const st = state || { vn: 0, open_n: null, open_slug: null, open_k: null, last_k: 0, open_id: null };
  // v2: the visit of an event's game, opening an orphan visit when it is not the open one.
  const open = slug => {
    if (st.open_n === null || st.open_slug !== slug) Object.assign(st, { open_n: ++st.vn, open_slug: slug, open_k: null, last_k: 0, open_id: null });
    return st.open_n;
  };
  const start = (v, t, tierAt, replay) => { set(v, 't0', t); set(v, 'tier0', tierAt); set(v, 'replay', replay); };
  const end = (r, t, code, ms, score, tierAt, hits, misses, rt, x, order) => {
    if (r.code !== null) return;
    Object.assign(r, { t, code, ms, score: score === -1 ? null : score, tier: tierAt, hits, misses, rt, x, order });
  };
  const close = (v, t, ms, il, f) => {
    set(v, 't_close', t);
    v.engaged_ms = Math.max(v.engaged_ms, ms);
    v.closed = 1;
    if (v.il === null) { v.il = il; v.f = f; }
  };
  events.forEach((ev, order) => {
    maxT = Math.max(maxT, ev[1]);
    if (wire === 3) {
      switch (ev[0]) {
        case 'ss': ss ||= { is_new: ev[2], age_days: ev[3], since_days: ev[4], age_b: ageBucket(ev[3]), since_b: sinceBucket(ev[4]),
          level0: ev[5], np: ev[6], cls: ev[7] }; break;
        case 'go': {
          const v = visitRow(ev[2], ev[3]);
          if (v.t_open === null) Object.assign(v, { t_open: ev[1], src: ev[4], plays: ev[5], plays_b: playsBucket(ev[5]), fav: ev[6] });
          break;
        }
        case 'ld': set(visitRow(ev[2], ev[3]), 'load_ms', ev[4]); break;
        case 'er': set(visitRow(ev[2], ev[3]), 'err', ev[4]); break;
        case 'rs': visitRow(ev[2], ev[4]); start(roundRow(ev[2], ev[3], ev[4], ev[5]), ev[1], ev[6], ev[7]); break;
        case 're': visitRow(ev[2], ev[4]);
          end(roundRow(ev[2], ev[3], ev[4], ev[6]), ev[1], ev[5], ev[7], ev[8], ev[9], ev[10], ev[11], ev[12], ev[13], order); break;
        case 'gp': { const v = visitRow(ev[2], ev[3]); v.engaged_ms = Math.max(v.engaged_ms, ev[4]); break; }
        case 'gx': close(visitRow(ev[2], ev[3]), ev[1], ev[4], ev[5], ev[6]); break;
        case 'tu': visitRow(ev[2], ev[3]); mark('tu', ev[1], ev[2], ev[4]); break;
        case 'fv': visitRow(ev[2], ev[3]); mark('fv', ev[1], ev[2], String(ev[4])); break;
        case 'ct': mark('ct', ev[1], 0, ev[2] + ':' + ev[3]); break;
        case 'lv': mark('lv', ev[1], 0, String(ev[2])); break;
        case 'pr': mark('pr', ev[1], 0, ev[2]); removed.push([ev[2], ev[1]]); break;
        // An older code of this student; nothing for a guest or for the code itself.
        case 'cd': if (envelope.u && ev[2] !== envelope.u) { mark('cd', ev[1], 0, ev[2]); linked.push(ev[2]); } break;
        case 'se': se ||= { se_t: ev[1], se_ms: ev[2], why: ev[3] }; break;
      }
      return;
    }
    switch (ev[0]) {
      case 'ss': ss ||= { is_new: ev[2], age_days: null, since_days: null, age_b: ev[3], since_b: ev[4], level0: ev[5], np: null, cls: null }; break;
      case 'go': {
        Object.assign(st, { open_n: ++st.vn, open_slug: ev[2], open_k: null, last_k: 0, open_id: null });
        Object.assign(visitRow(st.open_n, ev[2]), { t_open: ev[1], src: ev[3], plays_b: ev[4] });
        break;
      }
      case 'ld': set(visitRow(open(ev[2]), ev[2]), 'load_ms', ev[3]); break;
      case 'er': set(visitRow(open(ev[2]), ev[2]), 'err', ev[3]); break;
      case 'rs': {
        const n = open(ev[2]);
        visitRow(n, ev[2]);
        Object.assign(st, { open_k: ++st.last_k, open_id: ev[3] });
        start(roundRow(n, st.open_k, ev[2], ev[3]), ev[1], ev[4], ev[5]);
        break;
      }
      case 're': {
        const n = open(ev[2]);
        visitRow(n, ev[2]);
        const k = st.open_k !== null && st.open_id === ev[4] ? st.open_k : ++st.last_k;
        Object.assign(st, { open_k: null, open_id: null });
        end(roundRow(n, k, ev[2], ev[4]), ev[1], ev[3], ev[5], ev[6], ev[7], ev[8], ev[9], ev[10], null, order);
        break;
      }
      case 'gx': {
        close(visitRow(open(ev[2]), ev[2]), ev[1], ev[3], ev[4], ev[5]);
        Object.assign(st, { open_n: null, open_slug: null, open_k: null, open_id: null });
        break;
      }
      case 'lv': mark('lv', ev[1], 0, String(ev[2])); break;
      case 'se': se ||= { se_t: ev[1], se_ms: ev[2], why: null }; break;
    }
  });
  return { visits: [...visits.values()], rounds: [...rounds.values()], marks: [...marks.values()], removed, linked, ss, se, maxT, state: st };
}

// The session's start in seconds and how it is known (§C.2): from the PC's elapsed
// seconds w ('w'), or estimated from the receipt time R ('r').
function sessionStart(R, w, maxT) {
  if (w !== null) {
    const start = R - Math.max(w, maxT);
    if (start <= R && start >= R - 8 * DAY_S) return [start, 'w'];
  }
  return [R - maxT - 10, 'r'];
}

// Which game a session has open after this batch: decided by its last go or se, or,
// when it has neither, the game open before unless one of its gx closed that game.
function openGame(events, wire) {
  const at = wire === 3 ? 3 : 2;
  let known = false, slug = '';
  const closed = new Set();
  for (const event of events) {
    if (event[0] === 'go') {
      known = true;
      slug = event[at];
    } else if (event[0] === 'se') {
      known = true;
      slug = '';
    } else if (event[0] === 'gx') {
      if (!known) closed.add(event[at]);
      else if (slug === event[at]) slug = '';
    }
  }
  return { known, slug, closed: ' ' + [...closed].join(' ') + ' ' };
}

/* -------------------------------------------------- rolls and the purge */
// A roll of one day, per rollup (rollups.mjs; DAY_SCOPE's parameters: the day, its UTC
// bounds and its offsets).
const ROLL = Object.fromEntries(ROLLUP_TABLES.map(table => [table, rollStatements(table)]));
// What the 5-minute cron reads first: the settings and today's usage (as PROBE), the day
// after rolled_through when it already has a row (another instance rolled it), the oldest
// day waiting for a diff re-roll (dirty 1, rolled before ?3, local days from ?2 on), the
// newest day waiting for a full one (dirty 2; looked for only while the rebuild flag is not
// ''), the oldest rolled day, and the zone most PCs seen since ?4 report, with their number.
const PLAN = "SELECT (SELECT value FROM meta WHERE key = 'schema') AS schema, " +
  '(SELECT json_group_object(key, value) FROM settings) AS settings, ' +
  '(SELECT json_array(reads, writes, rebuild_reads, export_reads, size) FROM usage WHERE day = ?1) AS usage, ' +
  `(SELECT day FROM roll_days WHERE day = MAX(${SETTING('facts_since')}, IFNULL(date(${SETTING('rolled_through')}, '+1 day'), ''))) AS taken, ` +
  '(SELECT day FROM roll_days WHERE day >= ?2 AND dirty = 1 AND rolled_s < ?3 ORDER BY day LIMIT 1) AS diff, ' +
  `CASE WHEN IFNULL(${SETTING('rebuild')}, '1') <> '' THEN (SELECT day FROM roll_days WHERE day >= ` +
  "(SELECT MAX(value) FROM settings WHERE key IN ('facts_since', 'trimmed_before')) AND dirty = 2 ORDER BY day DESC LIMIT 1) END AS full, " +
  '(SELECT MIN(day) FROM roll_days) AS oldest, ' +
  "(SELECT json_array(z, n) FROM (SELECT z, COUNT(*) AS n FROM st_pcs WHERE last_s >= ?4 AND z <> '' GROUP BY z ORDER BY 2 DESC, z LIMIT 1)) AS vote";
const ROLL_DAY = 'INSERT INTO roll_days (day, dirty, rolled_s) VALUES (?1, 0, ?2) ON CONFLICT (day) DO UPDATE SET dirty = 0, rolled_s = excluded.rolled_s';
// After a roll: rv goes up (every kept KPI part is then out of date) and, after a first
// roll, rolled_through moves to its day.
const ROLLED = "UPDATE settings SET value = CASE key WHEN 'rv' THEN CAST(CAST(value AS INTEGER) + 1 AS TEXT) ELSE ?1 END " +
  "WHERE key = 'rv' OR key = 'rolled_through' AND ?1 <> '' AND value < ?1";
const KEPT_CLEAN = `DELETE FROM kpi_cache WHERE made <> ${SETTING('rv')}`;
// No day waits for a full re-roll any more (checked when written, so a zone change that
// came in between keeps the flag).
const REBUILT = "INSERT INTO settings (key, value) SELECT 'rebuild', '' WHERE NOT EXISTS (SELECT 1 FROM roll_days WHERE dirty = 2) " +
  'ON CONFLICT (key) DO UPDATE SET value = excluded.value';
// The daily purge: the facts of sessions that started before ?1 (UTC seconds), the
// students and PCs last seen before it with their rows, and the cutoffs in the settings.
const EXPIRED = 'SELECT id FROM st_sessions WHERE start_s < ?1', GONE = 'SELECT u FROM st_students WHERE last_s < ?1';
const PURGE_FACTS = [`DELETE FROM st_rounds WHERE sid IN (${EXPIRED})`, `DELETE FROM st_visits WHERE sid IN (${EXPIRED})`,
  `DELETE FROM st_marks WHERE sid IN (${EXPIRED})`, 'DELETE FROM st_sessions WHERE start_s < ?1',
  `DELETE FROM st_student_pcs WHERE u IN (${GONE})`, `DELETE FROM st_student_games WHERE u IN (${GONE})`,
  `DELETE FROM aliases WHERE u_old IN (${GONE}) OR u_new IN (${GONE})`, 'DELETE FROM st_students WHERE last_s < ?1',
  'DELETE FROM st_pcs WHERE last_s < ?1'];
// facts_since moves to the facts' cutoff ?1, legacy_until goes once every frozen day is
// before ?2, and rv goes up.
const PURGED = "UPDATE settings SET value = CASE key WHEN 'facts_since' THEN ?1 WHEN 'legacy_until' THEN '' " +
  "ELSE CAST(CAST(value AS INTEGER) + 1 AS TEXT) END WHERE CASE key WHEN 'facts_since' THEN value < ?1 " +
  "WHEN 'legacy_until' THEN value <> '' AND value < ?2 WHEN 'rv' THEN 1 ELSE 0 END";
const OLDEST_START = 'SELECT MIN(start_s) AS first FROM st_sessions';
const TRIMMED = "INSERT INTO settings (key, value) VALUES ('trimmed_before', ?1), ('trimmed_size', ?2) " +
  'ON CONFLICT (key) DO UPDATE SET value = excluded.value';

/* ------------------------------------------------------------ settings */
// GET /v1/admin/settings: the settings and today's usage (as PROBE), the latest size, the
// zones the PCs seen since ?2 report, the PCs known and seen since ?2, and the rolled days
// since facts_since waiting for a re-roll, for a full one, and clean.
const SETTINGS_READ = "SELECT (SELECT value FROM meta WHERE key = 'schema') AS schema, (SELECT json_group_object(key, value) FROM settings) AS settings, " +
  '(SELECT json_array(reads, writes, rebuild_reads, export_reads, size) FROM usage WHERE day = ?1) AS usage, ' +
  '(SELECT size FROM usage WHERE size > 0 ORDER BY day DESC LIMIT 1) AS size, ' +
  "(SELECT json_group_array(json_array(z, n)) FROM (SELECT z, COUNT(*) AS n FROM st_pcs WHERE last_s >= ?2 AND z <> '' GROUP BY z ORDER BY 2 DESC, z)) AS detected, " +
  '(SELECT json_array(COUNT(*), TOTAL(last_s >= ?2)) FROM st_pcs) AS pcs, ' +
  `(SELECT json_array(TOTAL(dirty > 0), TOTAL(dirty = 2), TOTAL(dirty = 0)) FROM roll_days WHERE day >= ${SETTING('facts_since')}) AS rebuild`;
const WEEK_START = "UPDATE settings SET value = CASE key WHEN 'week_start' THEN ?1 ELSE 'owner' END WHERE key IN ('week_start', 'week_source')";
const KEEP_DAYS = "UPDATE settings SET value = ?1 WHERE key = 'keep_days'";

/* ------------------------------------------------------------ the KPIs */
// The KPI groups: their key fields and the sums they read, from the frozen aggregates (the
// days up to legacy_until; a sum milestone 2 did not have is 0 there), from the rollups
// (the rolled days) and from the rollups' SELECT over the days not rolled yet. A day row
// also says where it came from (part: 0 the frozen aggregates, 1 the facts), because the
// data-quality shares read the facts only. Rows are arrays: the key fields, then the sums,
// whose indexes are AT[group][column].
const KPI = {
  days: { table: 'agg_days', rollup: 'r_day', keys: ['day', 'a', 'part'],
    sums: [...TABLES.agg_days.sums, 'guest_sessions', 'v2_sessions', 'linked_ms', 'clock_r', 'unclosed', 'why_i'] },
  games: { table: 'agg_games', rollup: 'r_game_day', keys: ['a', 'slug'],
    sums: [...TABLES.agg_games.sums, 'hearts_on', 'hearts_off', 'tu_start', 'tu_done', 'wall_s', 'inputs', 'score_sum', 'score_n', 'unended', 'duo'] },
  levels: { table: 'agg_levels', rollup: 'r_level_day', keys: ['slug', 'id'], sums: [...TABLES.agg_levels.sums, 'students', 'score_sum', 'score_n', 'unended'] },
  sources: { table: 'agg_sources', rollup: 'r_source_day', keys: ['src'], sums: TABLES.agg_sources.sums },
  devices: { table: 'agg_devices', rollup: 'r_device_day', keys: ['cores', 'mem', 'screen'], sums: TABLES.agg_devices.sums }
};
const GROUPS = Object.keys(KPI);
const AT = Object.fromEntries(GROUPS.map(name => [name, Object.fromEntries(KPI[name].sums.map((c, i) => [c, i]))]));
const D = AT.days, G = AT.games, L = AT.levels, S = AT.sources, V = AT.devices;
// A group over the frozen days ?1..?2 (only on a database milestone 2 used) and the rolled
// days ?4..?5, band ?3 (null for every band, '' for the unknown band).
function closedGroup(name, legacy) {
  const { table, rollup, keys, sums } = KPI[name], frozen = new Set(TABLES[table].sums);
  const part = (from, days, mark) => `SELECT ${keys.map(c => c === 'part' ? `${mark} AS part` : c).join(', ')}, ` +
    sums.map(c => from === table && !frozen.has(c) ? `0 AS ${c}` : c).join(', ') + ` FROM ${from} WHERE day BETWEEN ${days} AND (?3 IS NULL OR a = ?3)`;
  const parts = [...(legacy ? [part(table, '?1 AND ?2', 0)] : []), part(rollup, '?4 AND ?5', 1)];
  return `SELECT ${keys.join(', ')}, ${sums.map(c => `TOTAL(${c})`).join(', ')} FROM (${parts.join(' UNION ALL ')}) GROUP BY ${keys.join(', ')}`;
}
const CLOSED_GROUPS = [false, true].map(legacy => GROUPS.map(name => closedGroup(name, legacy)));
// The same group over the days not rolled yet, from the facts: the UTC seconds [?1, ?2), band ?3.
const openGroup = (name, scope) => `SELECT ${KPI[name].keys.map(c => c === 'part' ? '1 AS part' : c).join(', ')}, ` +
  `${KPI[name].sums.map(c => `TOTAL(${c})`).join(', ')} FROM (${rollupSelect(KPI[name].rollup, scope)}) WHERE ?3 IS NULL OR a = ?3 ` +
  `GROUP BY ${KPI[name].keys.map((_, i) => i + 1).join(', ')}`;
// Per raw student code: its bands (each after ':', so that the unknown band '' is one too),
// games, first play and profile start (UTC seconds: the first session's start less the
// profile's age then; without a student row, the code's first session in the range). Over
// the rolled days ?1..?2, or the facts of [?1, ?2); band ?3.
const firsts = 'COALESCE(t.first_s, x.first) AS first, COALESCE(t.first_s - IFNULL(t.age_days_first, 0) * 86400, x.first) AS made';
const CLOSED_STUDENTS = `SELECT x.u, x.bands, y.games, ${firsts} FROM (SELECT u, group_concat(DISTINCT ':' || a) AS bands, MIN(first_s) AS first ` +
  'FROM r_student_day WHERE day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR a = ?3) GROUP BY u) x LEFT JOIN (SELECT u, group_concat(DISTINCT slug) AS games ' +
  'FROM r_student_game WHERE day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR a = ?3) GROUP BY u) y ON y.u = x.u LEFT JOIN st_students t ON t.u = x.u';
const OPEN_STUDENTS = `SELECT x.u, x.bands, x.games, ${firsts} FROM (SELECT s.u, group_concat(DISTINCT ':' || s.a) AS bands, MIN(s.start_s) AS first, ` +
  '(SELECT group_concat(DISTINCT v.slug) FROM st_sessions o JOIN st_visits v ON v.sid = o.id WHERE o.u = s.u AND o.start_s >= ?1 AND o.start_s < ?2 ' +
  "AND (?3 IS NULL OR o.a = ?3)) AS games FROM st_sessions s WHERE s.start_s >= ?1 AND s.start_s < ?2 AND s.u <> '' AND (?3 IS NULL OR s.a = ?3) " +
  'GROUP BY s.u) x LEFT JOIN st_students t ON t.u = x.u';
// The rest, as JSON: distinct students per day; the minutes of every student-day (by
// canonical code) as counts per tenth of a minute, with their number and sum; the engaged
// ms per day by kind of session (s a student, g a guest, u v2); and per PC (any band)
// whether it reached 24 profiles, or seemed to forget its profiles on a day (3 or more new
// profiles, in at least half of its sessions).
const extras = (studentDays, kinds, pcs) => `WITH sd AS MATERIALIZED (${studentDays}) SELECT ` +
  '(SELECT json_group_array(json_array(day, n)) FROM (SELECT day, COUNT(*) AS n FROM sd GROUP BY day)) AS students, ' +
  '(SELECT json_group_array(json_array(t, n)) FROM (SELECT CAST(round(m / 6000.0) AS INTEGER) AS t, COUNT(*) AS n FROM sd GROUP BY 1)) AS minutes, ' +
  '(SELECT json_array(COUNT(*), TOTAL(m)) FROM sd) AS dose, ' +
  `(SELECT json_group_array(json_array(day, k2, ms)) FROM (${kinds})) AS kinds, ` +
  `(SELECT json_group_array(json_array(p, full, forgets)) FROM (${pcs})) AS pcs`;
const KIND = "CASE WHEN s.wire = 2 THEN 'u' WHEN s.u = '' THEN 'g' ELSE 's' END";
const CLOSED_EXTRAS = extras(
  'SELECT COALESCE(al.u_new, d.u) AS c, d.day AS day, TOTAL(d.engaged_ms) AS m FROM r_student_day d LEFT JOIN aliases al ON al.u_old = d.u ' +
  'WHERE d.day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR d.a = ?3) GROUP BY 1, 2',
  "SELECT day, k2, TOTAL(ms) AS ms FROM r_stat WHERE metric = 'sesslen' AND slug = '' AND day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR a = ?3) GROUP BY day, k2",
  "SELECT p, MAX(np_max >= 24) AS full, MAX(new_profiles >= 3 AND new_profiles * 2 >= sessions) AS forgets FROM r_pc_day WHERE day BETWEEN ?1 AND ?2 AND p <> '' GROUP BY p");
const openExtras = scope => extras(
  `SELECT COALESCE(al.u_new, s.u) AS c, ${scope.day} AS day, TOTAL(v.engaged_ms) AS m FROM st_sessions s LEFT JOIN aliases al ON al.u_old = s.u ` +
  "LEFT JOIN st_visits v ON v.sid = s.id WHERE s.start_s >= ?1 AND s.start_s < ?2 AND s.u <> '' AND (?3 IS NULL OR s.a = ?3) GROUP BY 1, 2",
  `SELECT ${scope.day} AS day, ${KIND} AS k2, TOTAL(v.engaged_ms) AS ms FROM st_sessions s LEFT JOIN st_visits v ON v.sid = s.id ` +
  'WHERE s.start_s >= ?1 AND s.start_s < ?2 AND (?3 IS NULL OR s.a = ?3) GROUP BY 1, 2',
  `SELECT p, MAX(full) AS full, MAX(forgets) AS forgets FROM (SELECT s.p AS p, ${scope.day} AS day, MAX(s.np) >= 24 AS full, ` +
  "TOTAL(s.is_new) >= 3 AND TOTAL(s.is_new) * 2 >= COUNT(*) AS forgets FROM st_sessions s WHERE s.start_s >= ?1 AND s.start_s < ?2 AND s.p <> '' " +
  'GROUP BY 1, 2) GROUP BY p');
// The kept parts of a KPI answer (?1, ?2) and every link between codes, with the first
// play and profile start of both codes.
const KEPT_LOOKUP = 'SELECT key, rows FROM kpi_cache WHERE key IN (?1, ?2) UNION ALL ' +
  "SELECT '', json_group_array(json_array(a.u_old, a.u_new, o.first_s, o.first_s - IFNULL(o.age_days_first, 0) * 86400, " +
  'n.first_s, n.first_s - IFNULL(n.age_days_first, 0) * 86400)) FROM aliases a LEFT JOIN st_students o ON o.u = a.u_old LEFT JOIN st_students n ON n.u = a.u_new';
// Keeps parts ([[key, rows], ...] in ?2) made with rv ?1.
const KEPT_PUT = 'INSERT INTO kpi_cache (key, made, rows) SELECT value ->> 0, ?1, value ->> 1 FROM json_each(?2) WHERE true ' +
  'ON CONFLICT (key) DO UPDATE SET made = excluded.made, rows = excluded.rows';
// Live sessions: how many, distinct students (by canonical code), guests, v2 sessions and PCs.
const LIVE_TOTAL = "SELECT COUNT(*) AS sessions, COUNT(DISTINCT CASE WHEN l.u <> '' THEN COALESCE(al.u_new, l.u) END) AS students, " +
  "TOTAL(l.wire = 3 AND l.u = '') AS guests, TOTAL(l.wire = 2) AS unknown, COUNT(DISTINCT NULLIF(l.p, '')) AS pcs " +
  'FROM live l LEFT JOIN aliases al ON al.u_old = l.u WHERE l.seen_minute > ?1';

const round = (x, digits) => { const f = 10 ** digits; return Math.round(x * f) / f; };
const ratio = (a, b) => b ? round(a / b, 4) : null;
const mean = (sum, n, digits) => n ? round(sum / n, digits) : null;
const minutes = ms => round(ms / 60000, 1);
const natural = (a, b) => a < b ? -1 : a > b ? 1 : 0;
// The same order as localeCompare(b, 'en', { numeric: true }), without a new collator per call.
const numeric = new Intl.Collator('en', { numeric: true }).compare;
const byLevel = (a, b) => natural(a.slug, b.slug) || numeric(a.id, b.id) || natural(a.id, b.id);
// Every group is shown: its key fields, its distinct sessions and its numbers.
const group = (key, sessions, build) => ({ ...key, sessions, ...build() });

// KPI rows are arrays: `keys` key fields, then the sums. sumRows adds up the rows of each
// group (the same group can come from the frozen aggregates, the rollups and the facts)
// into { key, v }, v being the sums as an array indexed through AT; the rows are never changed.
function sumRows(rows, keys) {
  const map = new Map();
  for (const row of rows) {
    const id = keys === 1 ? row[0] : row.slice(0, keys).join(' '), entry = map.get(id);
    if (!entry) map.set(id, { key: row.slice(0, keys), v: row.slice(keys) });
    else for (let i = keys; i < row.length; i++) entry.v[i - keys] += row[i];
  }
  return map;
}
const sumInto = (map, id, v) => {
  const into = map.get(id);
  if (!into) map.set(id, v.slice());
  else for (let i = 0; i < v.length; i++) into[i] += v[i];
};
const vector = (v, at, columns) => columns.map(c => v[at[c]]);
const frames = (v, at) => {
  const counts = vector(v, at, F), all = counts.reduce((a, b) => a + b, 0);
  return { counts, smoothShare: ratio(counts[0], all), stallShare: ratio(counts[3], all) };
};
const codes = (v, at) => Object.fromEntries(CODES.map(c => [c, v[at[c]]]));
// KPI rows as arrays: D1's batch() answers objects, whose values keep the column order.
const arrays = result => result.results.map(row => Object.values(row));
const csv = text => text ? text.split(',') : [];
// Quantiles of the minutes per student-day from the counts of each tenth of a minute (so
// exact to the answer's one decimal): linear between the two nearest ranks, as R and
// NumPy do by default.
function quantiles(counts, n, sum) {
  if (!n) return { p25: null, median: null, p75: null, mean: null };
  const sorted = [...counts].sort((x, y) => x[0] - y[0]);
  const at = rank => {
    let seen = 0;
    for (const [tenth, count] of sorted) if (rank < (seen += count)) return tenth;
    return sorted[sorted.length - 1][0];
  };
  const q = p => {
    const h = (n - 1) * p, below = Math.floor(h), a = at(below), b = at(Math.min(below + 1, n - 1));
    return round((a + (h - below) * (b - a)) / 10, 1);
  };
  return { p25: q(0.25), median: q(0.5), p75: q(0.75), mean: round(sum / n / 60000, 1) };
}
const EMPTY_PART = { days: [], games: [], levels: [], sources: [], devices: [], students: [],
  extras: { students: [], minutes: [], dose: [0, 0], kinds: [], pcs: [] } };

// Options: retentionDays (the facts' default retention; the owner's keep_days setting
// wins), openCacheMs (how long the KPIs of the days not rolled yet are kept and shared
// between instances, per slot of that length; 0 computes them on every request, as the
// Node host does) and guards (the thresholds of GUARDS, for tests). The store's work is all
// in SQL on db; JavaScript folds one batch's events and assembles small answers.
export function openStore(db, { retentionDays = RETENTION_DAYS, openCacheMs = 0, guards = {} } = {}) {
  let ready = null, sweptMinute = -1, conf = null;
  const sql = text => db.prepare(text);
  // A statement with exactly as many values as it has parameters.
  const bound = (text, values) => sql(text).bind(...values.slice(0, slots(text)));
  const limits = { ...GUARDS, ...guards };

  /* ---------------------------------------------- usage and settings */
  // D1 usage of this instance, per UTC day, until it is flushed (at most once a minute).
  // Reads of re-rolls also count as rebuild reads.
  const pending = new Map();
  let flushedMinute = -1;
  function meter(results, now, rebuild = false) {
    const day = utcDay(now);
    let c = pending.get(day);
    if (!c) pending.set(day, c = { reads: 0, writes: 0, rebuild: 0, export: 0, size: 0 });
    for (const { meta = {} } of results) {
      c.reads += meta.rows_read || 0;
      c.writes += meta.rows_written || 0;
      if (rebuild) c.rebuild += meta.rows_read || 0;
      if (meta.size_after > 0) c.size = meta.size_after;
    }
  }
  // The settings, today's usage and when they were read, from a PROBE row.
  function remember(row, now) {
    const s = JSON.parse(row.settings || '{}'), u = row.usage ? JSON.parse(row.usage) : [0, 0, 0, 0, 0];
    conf = {
      at: now, tz: s.tz || 'UTC', tzSource: s.tz_source || 'none', tzEpoch: s.tz_epoch || '0', factsSince: s.facts_since || '',
      legacyUntil: s.legacy_until || '', v3Since: s.v3_since || '', rolledThrough: s.rolled_through || '', rv: s.rv || '1',
      weekStart: s.week_start || 'mon', weekSource: s.week_source || 'auto', keepDays: Number(s.keep_days) || 0,
      trimmedBefore: s.trimmed_before || '', trimmedSize: Number(s.trimmed_size) || 0, rebuild: s.rebuild ?? '1',
      usage: { day: utcDay(now), reads: u[0], writes: u[1], rebuild: u[2], export: u[3], size: u[4] }
    };
  }
  // One db.batch: the settings are read again first when the copy is old (unless the
  // statements read them themselves: fresh), this instance's usage is flushed last when a
  // minute has passed, and every result's meta is metered. Answers the results of `statements`.
  async function run(statements, now, { rebuild = false, fresh = false } = {}) {
    const refresh = !fresh && (!conf || now - conf.at >= SETTINGS_MS), minute = Math.floor(now / MINUTE_MS);
    const list = refresh ? [sql(PROBE).bind(utcDay(now)), ...statements] : [...statements];
    let flush = null;
    if (minute !== flushedMinute && pending.size) {
      const [day, c] = pending.entries().next().value;
      if (c.reads || c.writes || c.rebuild || c.export) {
        flush = { day, c };
        pending.delete(day);
        list.push(sql(USAGE).bind(day, c.reads, c.writes, c.rebuild, c.export, c.size));
      } else pending.delete(day);
    }
    let results;
    try {
      results = await db.batch(list);
    } catch (error) {
      // Nothing was written: the counts wait for the next flush.
      if (flush) for (const [k, n] of Object.entries(flush.c)) addPending(flush.day, k, n);
      throw error;
    }
    if (refresh) remember(results[0].results[0], now);
    if (flush) {
      flushedMinute = minute;
      if (conf && conf.usage.day === flush.day) for (const key of ['reads', 'writes', 'rebuild', 'export']) conf.usage[key] += flush.c[key];
    }
    meter(results, now, rebuild);
    return results.slice(refresh ? 1 : 0, flush ? -1 : undefined);
  }
  function addPending(day, key, n) {
    const c = pending.get(day) || pending.set(day, { reads: 0, writes: 0, rebuild: 0, export: 0, size: 0 }).get(day);
    c[key] = key === 'size' ? c.size || n : c[key] + n;
  }
  // Today's (UTC) usage of every instance, as far as this one knows: rows read, written and
  // read by re-rolls, and the latest database size.
  function usageToday(now) {
    const day = utcDay(now), known = conf && conf.usage.day === day ? conf.usage : null, mine = pending.get(day);
    const sum = key => (known ? known[key] : 0) + (mine ? mine[key] : 0);
    return { day, reads: sum('reads'), writes: sum('writes'), rebuild: sum('rebuild'), export: sum('export'),
      size: mine?.size || known?.size || 0 };
  }
  const writesToday = now => usageToday(now).writes;

  /* ----------------------------------------------------------- schema */
  // Creates or upgrades the tables, one version step per call: 'migrated' when this call
  // changed the schema (a Worker then answers 503 and does nothing else in that request),
  // 'ready' when it is current. A newer schema is refused.
  async function init(now) {
    // Before the settings are known, so these batches are metered here.
    const batch = async statements => { const results = await db.batch(statements); meter(results, now); return results; };
    try {
      const [probe] = await batch([sql(PROBE).bind(utcDay(now))]);
      const row = probe.results[0];
      if (row.schema === SCHEMA_VERSION) { remember(row, now); return 'ready'; }
    } catch { /* before schema 4: the full check follows */ }
    const [, meta] = await batch([sql(META), sql("SELECT value FROM meta WHERE key = 'schema'")]);
    const version = meta.results[0]?.value ?? 0;
    if (version > SCHEMA_VERSION) throw new Error(`database schema ${version} is newer than this server (${SCHEMA_VERSION})`);
    if (version === SCHEMA_VERSION) {
      const [probe] = await batch([sql(PROBE).bind(utcDay(now))]);
      remember(probe.results[0], now);
      return 'ready';
    }
    let steps;
    if (version === 3) {
      // Milestone 2: the facts and rollups next to the frozen aggregates; seen goes, live gains codes.
      steps = [...SCHEMA_4, 'DROP TABLE IF EXISTS seen', 'DROP TABLE IF EXISTS live', LIVE_4, [SETTINGS_INIT, utcDay(now), utcDay(now)], setVersion(4)];
    } else if (version > 0 || (await batch([sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ev_go'")]))[0].results.length) {
      // Schema 1 or 2, or the first server's tables: schema 3 first, schema 4 on the next call.
      steps = [...SCHEMA_3, ...(version ? [] : legacyUpgrade()), setVersion(3)];
    } else {
      // A new database: schema 4 directly, without the aggregates.
      steps = [SCHEMA_3[0], SCHEMA_3[3], ...SCHEMA_4, LIVE_4, [SETTINGS_INIT, utcDay(now), ''], setVersion(4)];
    }
    await batch(steps.map(step => Array.isArray(step) ? sql(step[0]).bind(...step.slice(1)) : sql(step)));
    return 'migrated';
  }
  // Runs init once per instance while the schema is current; after a migrating call the
  // next call checks again. A failure is retried on the next call.
  function setup(now = Date.now()) {
    ready ||= init(now).then(state => { if (state === 'migrated') ready = null; return state; },
      error => { ready = null; throw error; });
    return ready;
  }
  // For callers that are not a Worker request (the Node host, tools, tests): every step.
  async function ensure(now) {
    for (let i = 0; i < 4; i++) if (await setup(now) === 'ready') return;
    throw new Error('the database did not reach schema ' + SCHEMA_VERSION);
  }

  /* ----------------------------------------------------------- ingest */
  // Stores one validated batch (schema.mjs validateBatch). False when it is a v2 batch
  // whose id was already received; a repeated v3 batch changes nothing and is true.
  async function ingest({ wire, envelope, events }, now) {
    await ensure(now);
    const R = Math.floor(now / 1000), minute = Math.floor(now / MINUTE_MS), { b, s, a, u, p, z, d } = envelope;
    if (!events.length) {
      if (wire === 3) return true;
      const [added] = await run([sql(ADD_EMPTY_BATCH).bind(b, utcDay(now))], now);
      return added.results.length > 0;
    }
    // Pre-read: the session's state for v2 (always) and for v3 when its rounds end for a
    // student (attempt numbers) or its start is not known from w; a student's attempt counters.
    const ends = events.some(ev => ev[0] === 're');
    const ended = wire === 3 ? events.filter(ev => ev[0] === 're').map(ev => [ev[2], ev[3]]) : [];
    const needState = wire === 2 || (ends && u !== '') || envelope.w === null;
    const slugs = wire === 3 && u && ends ? [...new Set(events.filter(ev => ev[0] === 're').map(ev => ev[4]))] : [];
    const reads = [];
    if (needState) reads.push(sql(STATE).bind(s, JSON.stringify(ended)));
    if (slugs.length) reads.push(sql(ATTEMPTS).bind(u, JSON.stringify(slugs)));
    let state = null, done = new Set(), counters = new Map();
    if (reads.length) {
      const results = await run(reads, now);
      const row = needState ? results[0].results[0] : null;
      if (row) {
        state = { vn: row.vn, open_n: row.open_n, open_slug: row.open_slug, open_k: row.open_k, last_k: row.last_k, open_id: row.open_id ?? null };
        done = new Set(JSON.parse(row.ended || '[]').map(([n, k]) => n + ' ' + k));
      }
      if (slugs.length) for (const r of results[results.length - 1].results) counters.set(r.slug, r.rounds);
      if (row) state.start = row.start_s;
    }
    const f = fold(wire, envelope, events, wire === 2 ? state : null);
    const [estimate, clock] = sessionStart(R, wire === 3 ? envelope.w : null, f.maxT);
    const start = state?.start ?? estimate;

    // Attempt numbers: the rounds of this batch that end for the first time, in batch order, per game.
    const totals = new Map();
    if (wire === 3 && u) {
      for (const r of f.rounds.filter(r => r.code !== null && !done.has(r.n + ' ' + r.k)).sort((x, y) => x.order - y.order)) {
        const total = (totals.get(r.slug)?.[0] ?? counters.get(r.slug) ?? 0) + 1;
        r.attempt = total;
        totals.set(r.slug, [total, totals.get(r.slug)?.[1] ?? r.t]);
      }
    }

    const ss = f.ss || {}, se = f.se || {}, st = f.state;
    const v2 = wire === 2, sessionRow = [s, u, p, wire, a, envelope.k, envelope.m, d[0], d[1], d[2], start, clock, z,
      ...FIRST_KNOWN.map(c => ss[c] ?? se[c] ?? null),
      v2 ? st.vn : 0, v2 ? st.open_n : null, v2 ? st.open_slug : null, v2 ? st.open_k : null, v2 ? st.last_k : 0];
    const statements = [];
    if (v2) statements.push(sql(ADD_BATCH).bind(b, utcDay(now)));
    statements.push(sql(v2 ? SESSION_V2 : SESSION_V3).bind(...sessionRow, v2 || f.ss || f.se ? 1 : 0));
    if (f.ss && p) statements.push(sql(PC).bind(s, p, z, d[0], d[1], d[2], envelope.k));
    if (f.ss && u) statements.push(sql(STUDENT).bind(s, u, a, f.ss.age_days));
    if (f.ss && u && p) statements.push(sql(STUDENT_PC).bind(s, u, p));
    if (f.visits.length) {
      statements.push(sql(VISITS).bind(s, JSON.stringify(f.visits.map(v => [v.n, v.slug, v.t_open, v.t_close, v.src, v.plays, v.plays_b,
        v.fav, v.load_ms, v.err, v.engaged_ms, v.closed, ...(v.il || IL.map(() => null)), ...(v.f || F.map(() => null))]))));
    }
    if (f.rounds.length) {
      statements.push(sql(ROUNDS).bind(s, JSON.stringify(f.rounds.map(r => [r.n, r.k, r.slug, r.id, r.t0, r.tier0, r.replay, r.t, r.code,
        r.ms, r.score, r.tier, r.hits, r.misses, ...(r.rt || RT.map(() => null)), ...(r.x || EXTRA.map(() => null)),
        DUO.test(r.id) ? 1 : 0, r.attempt ?? null]))));
    }
    if (totals.size) statements.push(sql(STUDENT_GAMES).bind(s, u, JSON.stringify([...totals].map(([slug, [total, t]]) => [slug, total, t]))));
    if (f.marks.length) statements.push(sql(MARKS).bind(s, JSON.stringify(f.marks)));
    if (f.removed.length) statements.push(sql(REMOVED).bind(s, JSON.stringify(f.removed)));
    if (f.linked.length) {
      const olds = JSON.stringify([...new Set(f.linked)]);
      statements.push(sql(ALIAS_HOP).bind(s, u, olds), sql(ALIAS).bind(s, u, olds));
    }
    // Late data for a day that may be rolled already: any day before today, whatever this
    // instance last read of rolled_through (another one may have rolled it since); the
    // statement only changes a rolled day. A v3 start estimate can be a second off, so both
    // days around it count.
    const local = localDay(conf.tz, now);
    const days = [...new Set([start - 5, start + 5].map(x => localDay(conf.tz, x * 1000)))].filter(day => day < local);
    if (days.length) statements.push(sql(LATE).bind(JSON.stringify(days)));
    const v3Since = wire === 3 && !conf.v3Since ? utcDay(now) : '';
    const zone = wire === 3 && z && (conf.tzSource === 'none' || conf.tzSource === 'dashboard') ? z : '';
    const zoneChange = [zone, 'pc', zone ? weekStartOf(zone) : 'mon', BY_PC, v3Since];
    if (zone && zone !== conf.tz) statements.push(bound(ZONE_DIRTY, zoneChange));
    if (zone || v3Since) statements.push(bound(ZONE, zoneChange));
    const open = openGame(events, wire), sweep = minute !== sweptMinute;
    statements.push(sql(LIVE).bind(s, open.known ? open.slug : '', minute, open.known ? 1 : 0, open.closed, minute - LIVE_WINDOW_MIN, u, p, wire));
    if (sweep) statements.push(sql(LIVE_SWEEP).bind(minute - LIVE_WINDOW_MIN));
    try {
      await run(statements, now);
    } catch (error) {
      if (v2 && DUPLICATE.test(error && error.message)) return false;
      throw error;
    }
    if (sweep) sweptMinute = minute;
    // Another instance or the owner may have set the zone first: the next request reads the settings again.
    if (zone || v3Since) conf.at = -Infinity;
    return true;
  }

  // The seconds the PCs should wait between batches (X-Batch-Every), by today's rows written.
  const batchEvery = now => BATCH_EVERY.find(([limit]) => writesToday(now) <= limit)[1];
  // The school's local day now.
  const today = now => localDay(conf?.tz || 'UTC', now);
  // What every admin answer says about the school's clock.
  const clock = now => ({ tz: conf.tz, source: conf.tzSource, offsetMin: offsetMin(conf.tz, now), today: localDay(conf.tz, now) });
  const hhmm = ({ hour, minute }) => String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  // The facts' retention in days: the owner's choice, or the host's.
  const keepDays = () => conf.keepDays || retentionDays;

  // The read and write guards (§D.8): null, or { error: 'reads' | 'writes', until } for a
  // 429, until being when the free allowance starts again (the next 00:00 UTC, on the
  // school's clock). kind: 'read' (an admin read other than live and settings), 'export'
  // (an export page) or 'write' (an admin action that writes). Ingest is never refused. The
  // day's usage is read again first when this instance's copy is old.
  async function guard(kind, now = Date.now()) {
    await ensure(now);
    if (now - conf.at >= SETTINGS_MS) await run([], now);
    const used = usageToday(now);
    const over = kind === 'write' ? used.writes > limits.adminWrites : used.reads > (kind === 'export' ? limits.exportReads : limits.adminReads);
    return over ? { error: kind === 'write' ? 'writes' : 'reads', until: hhmm(localParts(conf.tz, (Math.floor(now / DAY_MS) + 1) * DAY_MS)) } : null;
  }

  // The 5-minute cron (on Node, a timer): the live rows that left the window, and at most one
  // day of rollups (§D.7), the first of: the first roll of the oldest local day not rolled
  // yet (before today; yesterday from 01:00 at the school); a full re-roll of the newest day
  // that waits for one (after a change of zone); a diff re-roll of the oldest day that late
  // data reached, at most once an hour per day. Re-rolls wait for the next UTC day while
  // today's reads or writes are high; a first roll always runs, and only one instance can
  // make it. After the first roll of yesterday the PCs vote for the school's zone. With no
  // roll to make, rollups past their retention are deleted. Answers what it did:
  // { rolled: day, kind: 'first' | 'full' | 'diff' | 'raced', voted: { tz, pcs }, purged: day }.
  async function rollupStep(now = Date.now()) {
    await ensure(now);
    const R = Math.floor(now / 1000), minute = Math.floor(now / MINUTE_MS);
    const [plan] = await run([bound(PLAN, [utcDay(now), addDays(today(now), -LATE_DAYS), R - 3600, R - VOTE_DAYS * DAY_S])], now, { fresh: true });
    const row = plan.results[0];
    remember(row, now);
    const { tz, rolledThrough, factsSince } = conf, local = today(now), yesterday = addDays(local, -1), used = usageToday(now);
    const capped = used.rebuild > limits.rebuildReads || used.reads > limits.rollReads || used.writes > limits.rollWrites;
    const next = rolledThrough && addDays(rolledThrough, 1) > factsSince ? addDays(rolledThrough, 1) : factsSince;
    const done = { rolled: null, kind: null, voted: null, purged: null }, statements = [];
    if (row.taken) {
      // Another instance rolled that day and moved rolled_through on; this instance's copy was old.
      statements.push(sql(ROLLED).bind(next), sql(KEPT_CLEAN));
    } else if (next && next < local && (next < yesterday || localParts(tz, now).hour >= 1)) {
      Object.assign(done, { rolled: next, kind: 'first' });
    } else if (!capped && row.full) {
      Object.assign(done, { rolled: row.full, kind: 'full' });
    } else if (!capped && row.diff) {
      Object.assign(done, { rolled: row.diff, kind: 'diff' });
    }
    if (done.rolled) {
      const { lo, hi, o1, ch, o2 } = dayBounds(tz, done.rolled), values = [done.rolled, lo, hi, ch, o1 * 60, o2 * 60];
      for (const table of ROLLUP_TABLES) {
        if (done.kind === 'full') statements.push(sql(ROLL[table].clear).bind(done.rolled));
        statements.push(bound(done.kind === 'diff' ? ROLL[table].diff : ROLL[table].insert, values));
      }
      statements.push(sql(ROLL_DAY).bind(done.rolled, R), sql(ROLLED).bind(done.kind === 'first' ? done.rolled : ''));
      // The vote, once a day: the zone most PCs report, locked once LOCK_PCS of them report it.
      const vote = row.vote ? JSON.parse(row.vote) : null;
      if (done.kind === 'first' && done.rolled === yesterday && vote && BY_VOTE.includes(',' + conf.tzSource + ',')) {
        const change = [vote[0], vote[1] >= LOCK_PCS ? 'pcs' : 'pc', weekStartOf(vote[0]), BY_VOTE, ''];
        statements.push(bound(ZONE_DIRTY, change), bound(ZONE, change));
        done.voted = { tz: vote[0], pcs: vote[1] };
      }
      statements.push(sql(KEPT_CLEAN));
    } else if (!row.taken) {
      const cutoff = localDay(tz, now - Math.max(ROLLUP_DAYS, keepDays()) * DAY_MS);
      if (row.oldest && row.oldest < cutoff) {
        statements.push(...ROLLUP_TABLES.map(table => sql(`DELETE FROM ${table} WHERE day < ?1`).bind(cutoff)),
          sql('DELETE FROM roll_days WHERE day < ?1').bind(cutoff), sql(ROLLED).bind(''), sql(KEPT_CLEAN));
        done.purged = cutoff;
      } else if (row.full === null && conf.rebuild !== '') {
        statements.push(sql(REBUILT));
      }
    }
    if (minute !== sweptMinute) statements.push(sql(LIVE_SWEEP).bind(minute - LIVE_WINDOW_MIN));
    try {
      if (statements.length) await run(statements, now, { rebuild: done.kind === 'full' || done.kind === 'diff', fresh: true });
    } catch (error) {
      // The same first roll by another instance at the same moment: that one counts.
      if (done.kind === 'first' && /UNIQUE constraint failed/.test(error && error.message)) return { ...done, rolled: null, kind: 'raced' };
      throw error;
    }
    sweptMinute = minute;
    if (statements.length > 1) conf.at = -Infinity;
    return done;
  }

  // The daily purge (§D.11): the facts of the sessions that started before the school's
  // local day `keep` days ago (keep_days, or RETENTION_DAYS), the students and PCs last
  // seen before it with their rows; the frozen aggregate days older than `keep` (UTC
  // receipt days); batch ids after 30 days, usage counts after 60, kept KPI parts of an
  // older rollup version, and live rows out of the window. facts_since moves to the cutoff.
  // Then the storage guard: above GUARDS.bytes, the round details of the oldest 30 days of
  // facts go (their rollups stay), at most once until the database grows again. The
  // rollups past their own retention are deleted by the 5-minute cron when it has no roll
  // to make, which keeps this within its statement limit.
  async function purge(now) {
    await ensure(now);
    const { tz } = conf, keep = keepDays(), legacy = conf.legacyUntil !== '';
    const cutoff = localDay(tz, now - keep * DAY_MS), lo = dayBounds(tz, cutoff).lo, legacyCutoff = utcDay(now - keep * DAY_MS);
    const results = await run([
      ...PURGE_FACTS.map(text => sql(text).bind(lo)),
      ...(legacy ? AGGREGATES.map(table => sql(`DELETE FROM ${table} WHERE day < ?1`).bind(legacyCutoff)) : []),
      sql('DELETE FROM batches WHERE day < ?1').bind(utcDay(now - DEDUP_DAYS * DAY_MS)),
      sql('DELETE FROM usage WHERE day < ?1').bind(utcDay(now - USAGE_DAYS * DAY_MS)),
      sql(LIVE_SWEEP).bind(Math.floor(now / MINUTE_MS) - LIVE_WINDOW_MIN),
      sql(PURGED).bind(cutoff, legacyCutoff), sql(KEPT_CLEAN), sql(OLDEST_START)
    ], now);
    kept.clear();
    const changes = results.map(result => result.meta.changes), n = PURGE_FACTS.length, frozen = legacy ? AGGREGATES.length : 0;
    const out = { cutoff, legacyCutoff, sessions: changes[3], rounds: changes[0], students: changes[7], pcs: changes[8],
      rows: changes.slice(n, n + frozen).reduce((x, y) => x + y, 0), batches: changes[n + frozen], trimmed: null };
    const size = Math.max(0, ...results.map(result => result.meta.size_after || 0)) || usageToday(now).size;
    const first = results[results.length - 1].results[0]?.first;
    if (size > limits.bytes && size > conf.trimmedSize && first != null) {
      const start = Math.max(first, conf.trimmedBefore ? dayBounds(tz, conf.trimmedBefore).lo : 0);
      const before = localDay(tz, (start + TRIM_DAYS * DAY_S) * 1000);
      const [trim] = await run([sql(PURGE_FACTS[0]).bind(dayBounds(tz, before).lo), sql(TRIMMED).bind(before, String(size))], now);
      out.trimmed = { before, rounds: trim.meta.changes };
    }
    conf.at = -Infinity;
    return out;
  }

  /* ------------------------------------------------------------ the KPIs */
  // Parts of KPI answers kept in this instance, besides kpi_cache (which every instance
  // shares): closed parts for an hour, open parts until their slot ends.
  const kept = new Map();
  const keptPart = (key, now) => { const entry = key && kept.get(key); return entry && entry.until > now ? entry.part : null; };
  function keepPart(key, part, until, now) {
    for (const [old, entry] of kept) if (old === key || entry.until <= now) kept.delete(old);
    kept.set(key, { part, until });
    while (kept.size > KEPT_CAP) kept.delete(kept.keys().next().value);
  }
  const extrasOf = row => Object.fromEntries(Object.keys(EMPTY_PART.extras).map(key => [key, JSON.parse(row[key])]));
  // The parts of a KPI answer for days from..to and band, with the links between codes:
  // the closed part (the frozen days up to legacy_until and the rolled days up to
  // rolled_through, kept per rollup version rv) and the open part (the days after them,
  // from the facts with the rollups' own SELECT; kept per slot of openCacheMs).
  async function kpiParts(from, to, band, now) {
    const { tz, rv, legacyUntil, factsSince, rolledThrough } = conf;
    const legacy = legacyUntil && from <= legacyUntil ? [from, legacyUntil < to ? legacyUntil : to] : null;
    const rolled = rolledThrough && from <= rolledThrough ? [from, rolledThrough < to ? rolledThrough : to] : null;
    const start = [from, factsSince, rolledThrough ? addDays(rolledThrough, 1) : ''].reduce((x, y) => x > y ? x : y);
    const open = start <= to ? [start, to] : null;
    const closedKey = legacy || rolled ? JSON.stringify(['kpis', from, to, band, rv]) : null;
    const slot = openCacheMs > 0 ? Math.floor(now / openCacheMs) : -1;
    const openKey = open && slot >= 0 ? JSON.stringify(['kpis', from, to, band, rv, slot]) : null;
    let closed = keptPart(closedKey, now), recent = keptPart(openKey, now), aliases = [];
    const [lookup] = await run([sql(KEPT_LOOKUP).bind(closed ? '' : closedKey || '', recent ? '' : openKey || '')], now);
    for (const { key, rows } of lookup.results) {
      if (key === '') aliases = JSON.parse(rows);
      else if (key === closedKey) keepPart(key, closed = JSON.parse(rows), now + CLOSED_KEEP_MS, now);
      else if (key === openKey) keepPart(key, recent = JSON.parse(rows), (slot + 1) * openCacheMs, now);
    }
    // Statements for each part that is not kept; an empty range is '1'..'0'.
    const none = ['1', '0'], work = [], makeClosed = !!closedKey && !closed, makeOpen = !!open && !recent;
    if (makeClosed) {
      const values = [...(legacy || none), band, ...(rolled || none)];
      work.push(...CLOSED_GROUPS[legacyUntil ? 1 : 0].map(text => sql(text).bind(...values)));
      if (rolled) work.push(sql(CLOSED_STUDENTS).bind(...rolled, band), sql(CLOSED_EXTRAS).bind(...rolled, band));
    }
    if (makeOpen) {
      const bounds = [dayBounds(tz, open[0]).lo, dayBounds(tz, open[1]).hi], scope = spanScope(offsetsBetween(tz, ...bounds));
      work.push(...GROUPS.map(name => sql(openGroup(name, scope)).bind(...bounds, band)), sql(OPEN_STUDENTS).bind(...bounds, band),
        sql(openExtras(scope)).bind(...bounds, band));
    }
    const results = work.length ? await run(work, now) : [];
    const take = (list, students) => ({ ...Object.fromEntries(GROUPS.map((name, i) => [name, arrays(list[i])])),
      students: students ? list[GROUPS.length].results.map(row => Object.values(row)) : [],
      extras: students ? extrasOf(list[GROUPS.length + 1].results[0]) : EMPTY_PART.extras });
    const puts = [];
    if (makeClosed) {
      closed = take(results, !!rolled);
      keepPart(closedKey, closed, now + CLOSED_KEEP_MS, now);
      puts.push([closedKey, closed]);
    }
    if (makeOpen) {
      recent = take(results.slice(makeClosed ? GROUPS.length + (rolled ? 2 : 0) : 0), true);
      if (openKey) {
        keepPart(openKey, recent, (slot + 1) * openCacheMs, now);
        puts.push([openKey, recent]);
      }
    }
    // Parts that cannot be kept only cost a read later.
    const rows = [];
    let size = 0;
    for (const [key, part] of puts) {
      const text = JSON.stringify(part);
      if ((size += text.length) <= KEPT_MAX) rows.push([key, text]);
    }
    if (rows.length) await run([sql(KEPT_PUT).bind(rv, JSON.stringify(rows))], now).catch(() => {});
    return { parts: [closed, recent].filter(Boolean), aliases };
  }

  // Engagement KPIs for days from..to (YYYY-MM-DD, inclusive): the frozen UTC receipt days
  // before the update and the school's local days after it, every group with its numbers.
  // band: null for every band, '' for the unknown band. The shape is documented in
  // server/README.md; the fields of milestone 2 keep their meaning.
  async function kpis({ from, to, band = null }, now = Date.now()) {
    await ensure(now);
    const { parts, aliases } = await kpiParts(from, to, band, now);
    const all = name => parts.flatMap(part => part[name]);
    const [dayRows, gameRows, levelRows, sourceRows, deviceRows] = GROUPS.map(all);

    // The day totals, per day and per band; and the facts' own, for the data-quality shares.
    const total = KPI.days.sums.map(() => 0), facts = KPI.days.sums.map(() => 0), byDay = new Map(), byBand = new Map();
    let unknownBand = 0;
    for (const row of dayRows) {
      const v = row.slice(3);
      sumInto(byDay, row[0], v);
      sumInto(byBand, row[1], v);
      for (let i = 0; i < v.length; i++) total[i] += v[i];
      if (row[2] !== 1) continue;
      for (let i = 0; i < v.length; i++) facts[i] += v[i];
      if (row[1] === '') unknownBand += v[D.sessions];
    }

    // Students by canonical code (an older code counts as the code it is linked to): new
    // (the profile was made in the range), known before (first seen in the range, made
    // before it) or returning (seen before the range).
    const canonical = new Map(aliases.map(([u, to]) => [u, to])), students = new Map();
    for (const [u, bands, games, first, made] of all('students')) {
      const c = canonical.get(u) || u, s = students.get(c) || students.set(c, { bands: new Set(), games: new Set(), first, made }).get(c);
      for (const a of csv(bands)) s.bands.add(a.slice(1));
      for (const slug of csv(games)) s.games.add(slug);
      s.first = Math.min(s.first, first);
      s.made = Math.min(s.made, made);
    }
    for (const [, to, ...known] of aliases) {
      const s = students.get(to);
      if (s) for (const [first, made] of [known.slice(0, 2), known.slice(2)]) if (first !== null) { s.first = Math.min(s.first, first); s.made = Math.min(s.made, made); }
    }
    const lo = dayBounds(conf.tz, from).lo, bandStudents = new Map(), gameStudents = new Map();
    let fresh = 0, returning = 0, knownBefore = 0;
    for (const s of students.values()) {
      if (s.first < lo) returning++;
      else if (s.made >= lo) fresh++;
      else knownBefore++;
      for (const a of s.bands) bandStudents.set(a, (bandStudents.get(a) || 0) + 1);
      for (const slug of s.games) gameStudents.set(slug, (gameStudents.get(slug) || 0) + 1);
    }
    // Students per day, minutes per student-day, minutes by kind of session, and PCs.
    const perDay = new Map(), guestPerDay = new Map(), tenths = new Map(), kinds = { s: 0, g: 0, u: 0 }, pcs = new Map();
    let studentDays = 0, studentMs = 0;
    for (const { extras } of parts) {
      for (const [day, n] of extras.students) perDay.set(day, (perDay.get(day) || 0) + n);
      for (const [tenth, n] of extras.minutes) tenths.set(tenth, (tenths.get(tenth) || 0) + n);
      studentDays += extras.dose[0];
      studentMs += extras.dose[1];
      for (const [day, kind, ms] of extras.kinds) {
        kinds[kind] += ms;
        if (kind === 'g') guestPerDay.set(day, (guestPerDay.get(day) || 0) + ms);
      }
      for (const [p, full, forgets] of extras.pcs) {
        const flags = pcs.get(p) || pcs.set(p, { full: false, forgets: false }).get(p);
        flags.full ||= !!full;
        flags.forgets ||= !!forgets;
      }
    }

    const sessions = total[D.sessions];
    const totals = group({}, sessions, () => ({
      engagedMinutes: minutes(total[D.engaged_ms]), avgEngagedMinutesPerSession: mean(total[D.engaged_ms] / 60000, sessions, 2),
      gameOpens: total[D.opens], roundsStarted: total[D.starts], roundsEnded: total[D.ends], levelUps: total[D.level_ups],
      errors: total[D.errors],
      players: {
        sessionStarts: total[D.session_starts], newProfiles: total[D.new_profiles], guests: total[D.guests],
        profileAge: vector(total, D, PROFILE_AGE), daysSinceLast: vector(total, D, SINCE_LAST)
      },
      students: { active: students.size, new: fresh, returning, knownBefore, guestSessions: facts[D.guest_sessions],
        guestMinutes: minutes(kinds.g), minutesPerStudentDay: quantiles(tenths, studentDays, studentMs) }
    }));
    // A frozen day of milestone 2 did not tell students apart.
    const unknown = day => conf.legacyUntil !== '' && day <= conf.legacyUntil && day < conf.factsSince;
    const daily = [];
    for (let t = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z'); t <= end; t += DAY_MS) {
      const day = utcDay(t), v = byDay.get(day);
      daily.push(group({ day }, v ? v[D.sessions] : 0, () => ({ engagedMinutes: minutes(v ? v[D.engaged_ms] : 0), opens: v ? v[D.opens] : 0,
        students: unknown(day) ? null : perDay.get(day) || 0, guestMinutes: unknown(day) ? null : minutes(guestPerDay.get(day) || 0) })));
    }
    const modes = ['web', 'app'].filter(mode => total[D[mode]] > 0).map(mode => group({ mode }, total[D[mode]], () => ({})));

    // Per band and game, and per game over the selected bands.
    const bandGames = sumRows(gameRows, 2), bySlug = new Map();
    for (const { key: [, slug], v } of bandGames.values()) sumInto(bySlug, slug, v);
    const games = [...bySlug.keys()].sort(natural).map(slug => {
      const g = bySlug.get(slug), c = codes(g, G), starts = g[G.starts], closes = g[G.closes];
      const hits = g[G.hits], misses = g[G.misses], loads = g[G.loads];
      return group({ slug }, g[G.sessions], () => ({
        opens: g[G.opens], closes,
        engagedMinutes: minutes(g[G.engaged_ms]), avgEngagedSecPerOpen: mean(g[G.engaged_ms] / 1000, closes, 1),
        rounds: { starts, ends: g[G.ends], codes: c },
        completionRate: ratio(c.w, starts), winRate: ratio(c.w, c.w + c.l), dropOffRate: ratio(c.q, starts),
        avgTier: mean(g[G.tier_sum], g[G.tier_n], 2),
        hits, misses, accuracy: ratio(hits, hits + misses),
        rt: vector(g, G, RT), il: vector(g, G, IL), frames: frames(g, G),
        loads, avgLoadMs: loads ? Math.round(g[G.load_ms] / loads) : null,
        errors: Object.fromEntries(ERRORS.map(kind => [kind, g[G['error_' + kind]]])),
        sources: Object.fromEntries(SOURCES.filter(src => g[G['src_' + src]]).map(src => [src, g[G['src_' + src]]])),
        replay: { replayIndex: vector(g, G, REPLAY), playsBefore: vector(g, G, PLAYS) },
        students: gameStudents.get(slug) || 0, hearts: { on: g[G.hearts_on], off: g[G.hearts_off] },
        tutorials: { start: g[G.tu_start], done: g[G.tu_done] }, wallMinutes: minutes(g[G.wall_s] * 1000),
        actionsPerMinute: mean(g[G.inputs], g[G.wall_s] / 60, 1), avgScore: mean(g[G.score_sum], g[G.score_n], 1),
        unended: g[G.unended], duoRounds: g[G.duo]
      }));
    });

    // Per level (slug, round id): the funnel and where children stop.
    const levels = [...sumRows(levelRows, 2).values()].map(({ key: [slug, id], v }) => ({ slug, id, v })).sort(byLevel)
      .map(({ slug, id, v }) => {
        const c = codes(v, L), starts = v[L.starts], ends = v[L.ends];
        return group({ slug, id }, v[L.sessions], () => ({
          starts, ends, codes: c,
          completionRate: ratio(c.w, starts), winRate: ratio(c.w, c.w + c.l), dropOffRate: ratio(c.q, starts),
          avgMs: ends ? Math.round(v[L.ms] / ends) : null, avgTier: mean(v[L.tier_sum], v[L.tier_n], 2),
          students: v[L.students], avgScore: mean(v[L.score_sum], v[L.score_n], 1), unended: v[L.unended]
        }));
      });

    // Per age band: preferences (share of the band's opens per game), difficulty and time.
    const perBand = new Map();
    for (const { key: [a, slug], v } of bandGames.values()) (perBand.get(a) || perBand.set(a, []).get(a)).push({ slug, v });
    const bands = BANDS.filter(([a]) => byBand.has(a)).map(([a, name]) => {
      const b = byBand.get(a), opens = b[D.opens];
      return group({ band: name }, b[D.sessions], () => ({
        opens, engagedMinutes: minutes(b[D.engaged_ms]),
        games: (perBand.get(a) || []).sort((x, y) => natural(x.slug, y.slug)).map(({ slug, v }) => group({ slug }, v[G.sessions], () => ({
          opens: v[G.opens], share: ratio(v[G.opens], opens), avgTier: mean(v[G.tier_sum], v[G.tier_n], 2),
          completionRate: ratio(v[G.w], v[G.starts]),
          winRate: ratio(v[G.w], v[G.w] + v[G.l]), dropOffRate: ratio(v[G.q], v[G.starts]), engagedMinutes: minutes(v[G.engaged_ms]),
          starts: v[G.starts]
        }))),
        students: bandStudents.get(a) || 0
      }));
    });

    // Launch sources over all games, in the contract's order.
    const bySource = sumRows(sourceRows, 1);
    const sources = SOURCES.filter(src => bySource.has(src)).map(src => {
      const { v } = bySource.get(src);
      return group({ src }, v[S.sessions], () => ({ opens: v[S.opens] }));
    });

    // Coarse device buckets against smoothness, input latency and load time.
    const devices = {};
    DEVICES.forEach(([, name], i) => {
      const byValue = new Map();
      for (const row of deviceRows) sumInto(byValue, row[i], row.slice(3));
      devices[name] = [...byValue.keys()].sort((x, y) => x - y).map(value => {
        const v = byValue.get(value), loads = v[V.loads];
        return group({ value }, v[V.sessions], () => ({
          frames: frames(v, V), il: vector(v, V, IL), avgLoadMs: loads ? Math.round(v[V.load_ms] / loads) : null
        }));
      });
    });

    // How far the numbers can be trusted (the days of the facts only).
    const flagged = flag => [...pcs.values()].filter(p => p[flag]).length;
    const quality = {
      linkedShare: ratio(facts[D.linked_ms], facts[D.engaged_ms]), v2Share: ratio(kinds.u, kinds.s + kinds.g + kinds.u),
      clockEstimatedShare: ratio(facts[D.clock_r], facts[D.sessions]), unclosedVisits: facts[D.unclosed],
      unknownBandShare: ratio(unknownBand, facts[D.sessions]), idleHandovers: facts[D.why_i], pcsNew: pcs.size,
      oldVersionSessionShare: ratio(facts[D.v2_sessions], facts[D.sessions]), profilesFullPcs: flagged('full'), forgetfulPcs: flagged('forgets')
    };

    return {
      v: 1, range: { from, to, days: daily.length, band: band === null ? 'all' : band || 'unknown', legacyUntil: conf.legacyUntil, factsSince: conf.factsSince },
      minSessions: MIN_SESSIONS, clock: clock(now), totals, daily, games, levels, bands, sources, devices, modes, quality
    };
  }

  // Deletes the live rows that have left the window, and flushes this instance's usage.
  // Batches and live queries delete them as they come; the Node host also calls this every
  // minute, so a live row is gone within 10 minutes when no request comes at all (on
  // Cloudflare the 5-minute cron's rollupStep sweeps).
  async function sweep(now) {
    await ensure(now);
    const [result] = await run([sql(LIVE_SWEEP).bind(Math.floor(now / MINUTE_MS) - LIVE_WINDOW_MIN)], now);
    return result.meta.changes;
  }

  // Sessions whose last batch arrived in this minute or the four before: how many, the
  // students (by canonical code), guests and v2 sessions among them, their PCs, and the
  // games they have open.
  async function live(now) {
    await ensure(now);
    const minute = Math.floor(now / MINUTE_MS), since = minute - LIVE_WINDOW_MIN;
    const statements = [sql(LIVE_COUNT).bind(since), sql(LIVE_TOTAL).bind(since)];
    if (minute !== sweptMinute) { sweptMinute = minute; statements.push(sql(LIVE_SWEEP).bind(since)); }
    const [{ results }, { results: [sum] }] = await run(statements, now);
    const open = results.filter(row => row.slug).sort((x, y) => natural(x.slug, y.slug));
    return {
      v: 1, windowSec: LIVE_WINDOW_MIN * 60, minSessions: MIN_SESSIONS, total: { sessions: sum.sessions },
      students: sum.students, guests: sum.guests, unknown: sum.unknown, pcs: sum.pcs,
      games: open.map(row => ({ slug: row.slug, sessions: row.n })), clock: clock(now)
    };
  }

  // GET /v1/admin/settings: the school's clock (and the zones the PCs report), retention,
  // storage, today's usage, the re-rolls waiting, and the PCs on wire version 3.
  async function settings(now = Date.now()) {
    await ensure(now);
    const [read] = await run([sql(SETTINGS_READ).bind(utcDay(now), Math.floor(now / 1000) - VOTE_DAYS * DAY_S)], now, { fresh: true });
    const row = read.results[0];
    remember(row, now);
    const used = usageToday(now), keep = keepDays(), [known, seen] = JSON.parse(row.pcs), [pending, full, clean] = JSON.parse(row.rebuild);
    return {
      v: 1,
      clock: { ...clock(now), now: hhmm(localParts(conf.tz, now)), weekStart: conf.weekStart, weekSource: conf.weekSource,
        detected: JSON.parse(row.detected).map(([tz, pcs]) => ({ tz, pcs })), factsSince: conf.factsSince, legacyUntil: conf.legacyUntil,
        v3Since: conf.v3Since },
      keep: { days: keep, source: conf.keepDays ? 'owner' : 'env', rollupDays: Math.max(ROLLUP_DAYS, keep) },
      storage: { bytes: used.size || row.size || 0, limit: LIMITS.bytes, guardAt: limits.bytes, trimmedBefore: conf.trimmedBefore },
      usage: { day: used.day, reads: used.reads, writes: used.writes, readsLimit: LIMITS.reads, writesLimit: LIMITS.writes, batchEvery: batchEvery(now) },
      rebuild: { pending, full, done: clean }, accepts: WIRES, pcs: { new: known, seen14d: seen }
    };
  }

  // POST /v1/admin/settings, validated by the handler: tz (with source 'dashboard', the
  // signed-in browser's zone, which counts only while no PC or owner has set one; without
  // it, the owner's choice, which nothing changes automatically), weekStart ('sun' | 'mon')
  // and keepDays (400 or 760). Answers the settings, or { error: 'storage' } when keeping
  // more days would grow the database past the storage guard.
  async function updateSettings({ tz, source, weekStart, keepDays: days }, now = Date.now()) {
    const current = await settings(now), statements = [];
    if (tz !== undefined) {
      const change = source === 'dashboard' ? [tz, 'dashboard', weekStartOf(tz), BY_PC, ''] : [tz, 'owner', weekStartOf(tz), BY_OWNER, ''];
      statements.push(bound(ZONE_DIRTY, change), bound(ZONE, change));
    }
    if (weekStart !== undefined) statements.push(sql(WEEK_START).bind(weekStart));
    if (days !== undefined) {
      // The facts grow about in proportion to the days kept.
      if (days > current.keep.days && current.storage.bytes * days / current.keep.days > limits.bytes) return { error: 'storage' };
      statements.push(sql(KEEP_DAYS).bind(String(days)));
    }
    if (!statements.length) return current;
    await run(statements, now);
    return settings(now);
  }

  return { db, setup, ingest, batchEvery, today, guard, rollupStep, purge, sweep, kpis, live, settings, updateSettings, close: () => db.close?.() };
}

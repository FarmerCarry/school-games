// Storage for the ingest server over a D1-style async SQL driver (Cloudflare D1 on
// Workers, sqlite-d1.mjs on Node), schema 4 (docs/RESEARCH_TELEMETRY_SPEC.md, "Storage on
// D1"). An accepted batch is stored as row-level facts: its play session (st_sessions),
// game visits (st_visits), rounds (st_rounds) and marks (st_marks), and the student, PC
// and attempt counters behind them. Each table takes one INSERT ... ON CONFLICT DO UPDATE
// whose rows are one JSON parameter, all in one transaction, so a request costs O(rows),
// never one statement per event. Every write of a v3 batch is idempotent (first-known
// values with COALESCE, running totals with MAX, natural keys with INSERT OR IGNORE), so a
// batch delivered twice changes nothing; v2 batches are numbered by the server and
// de-duplicated through `batches`. The daily aggregates of milestone 2 (agg_*) are frozen:
// they are read for the days before the update and never written. Rows hold only
// validated contract values, pseudonymous codes, counts and times counted from the
// session's start (start_s: the receipt time minus the PC's own elapsed seconds): no
// column for an IP, a header, a name or anything a child types. `live` keeps the last
// receipt minute and open game per session while it is in the five-minute window.
import { CODES, ERRORS, SOURCES } from './schema.mjs';
import { dayBounds, localDay, offsetsBetween } from './clock.mjs';

export const MIN_SESSIONS = 3;
export const LIVE_WINDOW_MIN = 5;
export const DEDUP_DAYS = 30;
export const USAGE_DAYS = 60;
export const SCHEMA_VERSION = 4;
const DAY_MS = 86400000;
const DAY_S = 86400;
const MINUTE_MS = 60000;
// The instance reads the settings again when its copy is older than this.
const SETTINGS_MS = 5 * MINUTE_MS;
const CLOSED_KEEP_MS = 3600000;
const CLOSED_CAP = 16;
// Kept KPI rows stay well under D1's 2 MB limit for a value.
const KEPT_MAX = 1000000;
// X-Batch-Every: the seconds a PC waits between batches, by today's rows written.
const BATCH_EVERY = [[60000, 60], [80000, 180], [Infinity, 300]];
const BANDS = [['6-7', '6-7'], ['8-9', '8-9'], ['10-11', '10-11'], ['', 'unknown']];
const DEVICES = [['cores', 'cores'], ['mem', 'memory'], ['screen', 'screen']];
// A local two-player round (the same rule as TWO_PLAYER in js/teacher.js).
const DUO = /(?:^|:)(?:duo|local|pvp)$/;

const series = (prefix, n) => Array.from({ length: n }, (_, i) => prefix + i);
const RT = series('rt', 6), IL = series('il', 6), F = series('f', 4);
const PROFILE_AGE = series('profile_age', 4), SINCE_LAST = series('since_last', 5);
const REPLAY = series('replay', 6), PLAYS = series('plays', 5);
const ERROR_COLUMNS = ERRORS.map(kind => 'error_' + kind), SOURCE_COLUMNS = SOURCES.map(src => 'src_' + src);

// The frozen daily aggregates of milestone 2: every table is keyed by (day, a, ...key) and
// holds whole-number sums; sessions is the number of distinct sessions in the group that day.
export const TABLES = {
  agg_days: { key: [], sums: ['sessions', 'web', 'app', 'engaged_ms', 'opens', 'starts', 'ends', 'level_ups', 'errors',
    'session_starts', 'new_profiles', 'guests', ...PROFILE_AGE, ...SINCE_LAST] },
  agg_games: { key: ['slug'], sums: ['sessions', 'opens', 'closes', 'engaged_ms', 'starts', 'ends', ...CODES,
    'tier_sum', 'tier_n', 'hits', 'misses', ...RT, ...IL, ...F, 'loads', 'load_ms', ...ERROR_COLUMNS, ...SOURCE_COLUMNS,
    ...REPLAY, ...PLAYS] },
  agg_levels: { key: ['slug', 'id'], sums: ['sessions', 'starts', 'ends', ...CODES, 'ms', 'tier_sum', 'tier_n'] },
  agg_sources: { key: ['src'], sums: ['sessions', 'opens'] },
  agg_devices: { key: ['cores', 'mem', 'screen'], sums: ['sessions', ...F, ...IL, 'loads', 'load_ms'] }
};
const AGGREGATES = Object.keys(TABLES);
const TEXT_KEYS = new Set(['slug', 'id', 'src']);

// The per-day rollups of the facts, keyed by the school's local day: key columns with
// their types, TEXT columns that are not keys, and whole-number sums (all INTEGER NOT NULL
// DEFAULT 0). They are built from the facts by the 5-minute cron; per-student rollups are
// keyed by the raw code, and links are applied when they are read.
const TEXT = 'TEXT', INT = 'INTEGER';
export const ROLLUPS = {
  r_day: { key: [['day', TEXT], ['a', TEXT]], sums: [...TABLES.agg_days.sums, 'students', 'new_students', 'guest_sessions',
    'v2_sessions', 'linked_ms', 'clock_r', 'unclosed', 'unended', 'duo', 'hearts_on', 'hearts_off', 'timer_sessions',
    'why_u', 'why_p', 'why_h', 'why_i'] },
  r_game_day: { key: [['day', TEXT], ['a', TEXT], ['slug', TEXT]], sums: [...TABLES.agg_games.sums, 'students', 'wall_s',
    'inputs', 'idle', 'pauses', 'rt_sum', 'rt_n', 'dda_sum', 'dda_n', 'score_sum', 'score_n', 'score_max', 'unended', 'duo',
    'hearts_on', 'hearts_off', 'tu_start', 'tu_done', 'fav_opens'] },
  r_level_day: { key: [['day', TEXT], ['a', TEXT], ['slug', TEXT], ['id', TEXT]], sums: [...TABLES.agg_levels.sums, 'students',
    'unended', 'hits', 'misses', 'score_sum', 'score_n', 'score_max', 'wall_ms', 'dda_sum', 'dda_n'] },
  r_source_day: { key: [['day', TEXT], ['a', TEXT], ['src', TEXT]], sums: ['sessions', 'opens'] },
  r_device_day: { key: [['day', TEXT], ['a', TEXT], ['cores', INT], ['mem', INT], ['screen', INT]], sums: TABLES.agg_devices.sums },
  r_student_day: { key: [['day', TEXT], ['u', TEXT]], text: ['a'], sums: ['sessions', 'engaged_ms', 'opens', 'games', 'rounds',
    ...CODES, 'hits', 'misses', 'rt_sum', 'rt_n', 'level_ups', 'first_s', 'last_s', 'pcs'], index: ['r_student_day_u', ['u', 'day']] },
  r_student_game: { key: [['day', TEXT], ['slug', TEXT], ['u', TEXT]], text: ['a'], sums: ['opens', 'engaged_ms', 'rounds', ...CODES,
    'hits', 'misses', 'rt_sum', 'rt_n', 'score_sum', 'score_n', 'score_max', 'dda_sum', 'dda_n', 'tier_sum', 'tier_n', 'hearts',
    'first_attempt', 'last_attempt'], index: ['r_student_game_u', ['u', 'day']] },
  r_pc_day: { key: [['day', TEXT], ['p', TEXT]], text: ['k'], sums: ['sessions', 'students', 'guests', 'engaged_ms', 'opens', 'loads',
    'load_ms', 'load_max', 'errors', 'quits', ...F, ...IL, 'np_max', 'new_profiles', 'busy_s', 'first_s', 'last_s', 'wire'] },
  r_stat: { key: [['day', TEXT], ['a', TEXT], ['metric', TEXT], ['slug', TEXT], ['k1', TEXT], ['k2', TEXT]], sums: ['n', 'students',
    ...CODES, 'ms', 'wall_ms', 'win_ms', 'hits', 'misses', 'rt_sum', 'rt_n', 'score_sum', 'score_n', 'tier_sum', 'tier_n', 'dda_sum',
    'dda_n', 'inputs', 'gap_sum', 'gap_n'], index: ['r_stat_metric', ['metric', 'slug', 'day']] }
};

export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

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
// the last day of the frozen aggregates ('' when there are none).
const SETTINGS_INIT = 'INSERT OR IGNORE INTO settings (key, value) VALUES ' +
  "('tz', 'UTC'), ('tz_source', 'none'), ('tz_epoch', '0'), ('week_start', 'mon'), ('week_source', 'auto'), ('keep_days', ''), " +
  "('facts_since', ?1), ('legacy_until', ?2), ('v3_since', ''), ('rv', '1'), ('rolled_through', ''), ('trimmed_before', '')";
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
// W12: the first v3 batch with a zone sets the school's zone while no PC or owner has set
// it ('none' or 'dashboard'); a change of zone also marks every rolled day for a full
// rebuild and bumps tz_epoch and rv. The first v3 batch also sets v3_since. (SQLite
// reads each scalar subquery once, before it changes a row.)
const SETTING = key => `(SELECT value FROM settings WHERE key = '${key}')`;
const ZONE_CHANGE = `?1 <> '' AND ${SETTING('tz_source')} IN ('none', 'dashboard') AND ${SETTING('tz')} <> ?1`;
const ZONE_DIRTY = `UPDATE roll_days SET dirty = 2 WHERE day >= ${SETTING('facts_since')} AND ${ZONE_CHANGE}`;
const ZONE = "UPDATE settings SET value = CASE key WHEN 'tz' THEN ?1 WHEN 'tz_source' THEN 'pc' WHEN 'v3_since' THEN ?2 " +
  "ELSE CAST(CAST(value AS INTEGER) + 1 AS TEXT) END WHERE key IN ('rv', 'tz', 'tz_epoch', 'tz_source', 'v3_since') AND CASE key " +
  "WHEN 'v3_since' THEN value = '' AND ?2 <> '' WHEN 'tz_source' THEN ?1 <> '' AND value IN ('none', 'dashboard') " +
  `ELSE ${ZONE_CHANGE} END`;
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
const KEPT_GET = 'SELECT rows FROM kpi_cache WHERE key = ?1';
const KEPT_PUT = 'INSERT INTO kpi_cache (key, made, rows) VALUES (?1, ?2, ?3) ' +
  'ON CONFLICT (key) DO UPDATE SET made = excluded.made, rows = excluded.rows';

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

/* ---------------------------------------------- the KPIs of milestone 2 */
// The KPI queries, one per aggregate table: the group's key fields, then its sums over the
// days ?1..?2 and the band ?3 (null for every band, '' for the unknown band). Rows are
// arrays, and the index of each sum is AT[table][column].
const WHERE = 'day BETWEEN ?1 AND ?2 AND (?3 IS NULL OR a = ?3)';
const KPI_GROUPS = { agg_days: ['day', 'a'], agg_games: ['a', 'slug'], agg_levels: ['slug', 'id'], agg_sources: ['src'],
  agg_devices: ['cores', 'mem', 'screen'] };
const KPI = Object.entries(KPI_GROUPS).map(([table, keys]) => `SELECT ${keys.join(', ')}, ` +
  TABLES[table].sums.map(c => `TOTAL(${c}) AS ${c}`).join(', ') + ` FROM ${table} WHERE ${WHERE} GROUP BY ${keys.join(', ')}`);
const AT = Object.fromEntries(Object.entries(TABLES).map(([table, { sums }]) => [table, Object.fromEntries(sums.map((c, i) => [c, i]))]));
const D = AT.agg_days, G = AT.agg_games, L = AT.agg_levels, S = AT.agg_sources, V = AT.agg_devices;

// The same rows from the facts of the sessions that started in the UTC seconds [?1, ?2)
// (band ?3): each milestone-2 column defined over the facts, so that v2 batches give the
// numbers milestone 2 gave. For each aggregate: [the facts read, key expressions, the sums
// they add]; a session counts on the local day it started.
const OVER = {
  s: 'st_sessions s',
  v: 'st_sessions s JOIN st_visits v ON v.sid = s.id',
  src: 'st_sessions s JOIN st_visits v ON v.sid = s.id AND v.src IS NOT NULL',
  r: 'st_sessions s JOIN st_rounds r ON r.sid = s.id',
  lv: "st_sessions s JOIN st_marks k ON k.sid = s.id AND k.kind = 'lv'"
};
const each = (columns, expr) => Object.fromEntries(columns.map((c, i) => [c, expr(c, i)]));
const outcomes = each(CODES, c => `SUM(r.code = '${c}')`);
const rounds = { starts: 'SUM(r.t0 IS NOT NULL)', ends: 'SUM(r.code IS NOT NULL)' };
const tiers = { tier_sum: 'TOTAL(CASE WHEN r.tier0 > 0 THEN r.tier0 END)', tier_n: 'SUM(r.tier0 > 0)' };
const replay = 'CASE WHEN r.replay IS NULL THEN -1 WHEN r.replay < 3 THEN r.replay WHEN r.replay < 5 THEN 3 WHEN r.replay < 10 THEN 4 ELSE 5 END';
const health = { ...each([...F, ...IL], c => `TOTAL(v.${c})`), loads: 'SUM(v.load_ms IS NOT NULL)', load_ms: 'TOTAL(v.load_ms)' };
const TWINS = {
  agg_days: [
    ['s', {}, { sessions: 'COUNT(*)', web: "SUM(s.m = 'web')", app: "SUM(s.m = 'app')", session_starts: 'SUM(s.level0 IS NOT NULL)',
      new_profiles: 'TOTAL(s.is_new)', guests: 'SUM(s.level0 = 0)', ...each(PROFILE_AGE, (c, i) => `SUM(s.age_b = ${i})`),
      ...each(SINCE_LAST, (c, i) => `SUM(s.since_b = ${i})`) }],
    ['v', {}, { engaged_ms: 'TOTAL(v.engaged_ms)', opens: 'SUM(v.t_open IS NOT NULL)', errors: 'SUM(v.err IS NOT NULL)' }],
    ['r', {}, rounds],
    ['lv', {}, { level_ups: 'COUNT(*)' }]
  ],
  agg_games: [
    ['v', { slug: 'v.slug' }, { sessions: 'COUNT(DISTINCT v.sid)', opens: 'SUM(v.t_open IS NOT NULL)', closes: 'TOTAL(v.closed)',
      engaged_ms: 'TOTAL(v.engaged_ms)', ...health, ...Object.fromEntries(ERRORS.map(kind => ['error_' + kind, `SUM(v.err = '${kind}')`])),
      ...Object.fromEntries(SOURCES.map(src => ['src_' + src, `SUM(v.src = '${src}')`])), ...each(PLAYS, (c, i) => `SUM(v.plays_b = ${i})`) }],
    ['r', { slug: 'r.slug' }, { ...rounds, ...outcomes, ...tiers, hits: 'TOTAL(r.hits)', misses: 'TOTAL(r.misses)',
      ...each(RT, c => `TOTAL(r.${c})`), ...each(REPLAY, (c, i) => `SUM(${replay} = ${i})`) }]
  ],
  agg_levels: [['r', { slug: 'r.slug', id: 'r.id' }, { sessions: 'COUNT(DISTINCT r.sid)', ...rounds, ...outcomes, ms: 'TOTAL(r.ms)', ...tiers }]],
  agg_sources: [['src', { src: 'v.src' }, { sessions: 'COUNT(DISTINCT v.sid)', opens: 'COUNT(*)' }]],
  agg_devices: [['s', {}, { sessions: 'COUNT(*)' }], ['v', {}, health]]
};
const KEYS = { a: 's.a', cores: 's.cores', mem: 's.mem', screen: 's.screen' };
function twin(table, day) {
  const keys = KPI_GROUPS[table], { sums } = TABLES[table];
  const parts = TWINS[table].map(([over, exprs, values]) => `SELECT ${keys.map(c => `${c === 'day' ? day : exprs[c] || KEYS[c]} AS ${c}`).join(', ')}, ` +
    sums.map(c => `${values[c] || 0} AS ${c}`).join(', ') + ` FROM ${OVER[over]} ` +
    `WHERE s.start_s >= ?1 AND s.start_s < ?2 AND (?3 IS NULL OR s.a = ?3) GROUP BY ${keys.map((_, i) => i + 1).join(', ')}`);
  return `SELECT ${keys.join(', ')}, ${sums.map(c => `TOTAL(${c}) AS ${c}`).join(', ')} FROM (${parts.join(' UNION ALL ')}) GROUP BY ${keys.join(', ')}`;
}
const TWIN = Object.fromEntries(AGGREGATES.filter(table => table !== 'agg_days').map(table => [table, twin(table)]));
// The local day of s.start_s, with the zone's offsets over the range written in (they are
// numbers computed here, so the text is safe and the statement is compiled once per range shape).
function dayOf({ o, changes }) {
  const offset = changes.length ? 'CASE ' + changes.slice().reverse().map(([ch, after]) => `WHEN s.start_s >= ${ch} THEN ${after * 60}`).join(' ') +
    ` ELSE ${o * 60} END` : String(o * 60);
  return `date(s.start_s + ${offset}, 'unixepoch')`;
}

// A group with fewer than MIN_SESSIONS distinct sessions is reported only as suppressed.
// An empty group (no rows) reveals nothing and keeps its zeros; a group with rows is
// never shown with fewer than MIN_SESSIONS sessions, even 0.
const hidden = (n, present) => n < MIN_SESSIONS && (n > 0 || present);
const group = (key, sessions, present, build) =>
  hidden(sessions, present) ? { ...key, suppressed: true } : { ...key, sessions, ...build() };
const round = (x, digits) => { const f = 10 ** digits; return Math.round(x * f) / f; };
const ratio = (a, b) => b ? round(a / b, 4) : null;
const mean = (sum, n, digits) => n ? round(sum / n, digits) : null;
const minutes = ms => round(ms / 60000, 1);
const natural = (a, b) => a < b ? -1 : a > b ? 1 : 0;
// The same order as localeCompare(b, 'en', { numeric: true }), without a new collator per call.
const numeric = new Intl.Collator('en', { numeric: true }).compare;
const byLevel = (a, b) => natural(a.slug, b.slug) || numeric(a.id, b.id) || natural(a.id, b.id);

// KPI rows are arrays: `keys` key fields, then the sums. sumRows adds up the rows of each
// group (the same group can come from the frozen aggregates and the facts) into
// { key, v }, v being the sums as an array indexed through AT; the rows are never changed.
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

// Options: retentionDays. The store's work is all in SQL on db; JavaScript folds one batch's
// events and assembles small answers.
export function openStore(db, { retentionDays = 180 } = {}) {
  let ready = null, sweptMinute = -1, conf = null;
  const sql = text => db.prepare(text);

  /* ---------------------------------------------- usage and settings */
  // D1 usage of this instance, per UTC day, until it is flushed (at most once a minute).
  const pending = new Map();
  let flushedMinute = -1;
  function meter(results, now) {
    const day = utcDay(now);
    let c = pending.get(day);
    if (!c) pending.set(day, c = { reads: 0, writes: 0, rebuild: 0, export: 0, size: 0 });
    for (const { meta = {} } of results) {
      c.reads += meta.rows_read || 0;
      c.writes += meta.rows_written || 0;
      if (meta.size_after > 0) c.size = meta.size_after;
    }
  }
  // The settings, today's usage and when they were read, from a PROBE row.
  function remember(row, now) {
    const s = JSON.parse(row.settings || '{}'), u = row.usage ? JSON.parse(row.usage) : [0, 0, 0, 0, 0];
    conf = {
      at: now, tz: s.tz || 'UTC', tzSource: s.tz_source || 'none', factsSince: s.facts_since || '', legacyUntil: s.legacy_until || '',
      v3Since: s.v3_since || '', rolledThrough: s.rolled_through || '', rv: s.rv || '1',
      usage: { day: utcDay(now), reads: u[0], writes: u[1], rebuild: u[2], export: u[3], size: u[4] }
    };
  }
  // One db.batch: the settings are read again first when the copy is old, this instance's
  // usage is flushed last when a minute has passed, and every result's meta is metered.
  // Answers the results of `statements`.
  async function run(statements, now) {
    const refresh = !conf || now - conf.at >= SETTINGS_MS, minute = Math.floor(now / MINUTE_MS);
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
      if (conf && conf.usage.day === flush.day) { conf.usage.reads += flush.c.reads; conf.usage.writes += flush.c.writes; }
    }
    meter(results, now);
    return results.slice(refresh ? 1 : 0, flush ? -1 : undefined);
  }
  function addPending(day, key, n) {
    const c = pending.get(day) || pending.set(day, { reads: 0, writes: 0, rebuild: 0, export: 0, size: 0 }).get(day);
    c[key] = key === 'size' ? c.size || n : c[key] + n;
  }
  // Today's rows written by every instance, as far as this one knows.
  function writesToday(now) {
    const day = utcDay(now);
    return (conf && conf.usage.day === day ? conf.usage.writes : 0) + (pending.get(day)?.writes || 0);
  }

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
    // Late data for a day already rolled (a v3 start estimate can be a second off, so both
    // days around it are marked).
    if (conf.rolledThrough) {
      const days = [...new Set([start - 5, start + 5].map(x => localDay(conf.tz, x * 1000)))].filter(day => day <= conf.rolledThrough);
      if (days.length) statements.push(sql(LATE).bind(JSON.stringify(days)));
    }
    const v3Since = wire === 3 && !conf.v3Since ? utcDay(now) : '';
    const zone = wire === 3 && z && (conf.tzSource === 'none' || conf.tzSource === 'dashboard') ? z : '';
    if (zone && zone !== conf.tz) statements.push(sql(ZONE_DIRTY).bind(zone));
    if (zone || v3Since) statements.push(sql(ZONE).bind(zone, v3Since));
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

  // Deletes the frozen aggregate days older than the retention period, batch ids older than
  // 30 days, usage rows older than 60 days, live rows out of the window and the kept KPI rows.
  async function purge(now) {
    await ensure(now);
    const cutoff = utcDay(now - retentionDays * DAY_MS), legacy = conf.legacyUntil !== '';
    const results = await run([
      ...(legacy ? AGGREGATES.map(table => sql(`DELETE FROM ${table} WHERE day < ?1`).bind(cutoff)) : []),
      sql('DELETE FROM batches WHERE day < ?1').bind(utcDay(now - DEDUP_DAYS * DAY_MS)),
      sql('DELETE FROM usage WHERE day < ?1').bind(utcDay(now - USAGE_DAYS * DAY_MS)),
      sql(LIVE_SWEEP).bind(Math.floor(now / MINUTE_MS) - LIVE_WINDOW_MIN),
      sql('DELETE FROM kpi_cache')
    ], now);
    closedDays.clear();
    const changes = results.map(result => result.meta.changes), n = legacy ? AGGREGATES.length : 0;
    return { cutoff, rows: changes.slice(0, n).reduce((x, y) => x + y, 0), batches: changes[n] };
  }

  // The KPI rows (arrays, see KPI) for days from..to. Days up to legacy_until come from the
  // frozen aggregates; they never change, so they are read once per period and kept in the
  // kpi_cache table until the next daily purge (shared by every instance: Cloudflare may
  // answer each dashboard refresh from a new one) and in this instance's memory for an
  // hour. Days from facts_since come from the facts, by the school's local day.
  const closedDays = new Map();
  async function legacyRows(from, end, band, now) {
    const key = JSON.stringify(['legacy', from, end, band]);
    let entry = closedDays.get(key);
    if (entry && entry.until > now) return entry.rows;
    const [kept] = await run([sql(KEPT_GET).bind(key)], now);
    const text = kept.results[0]?.rows ?? null;
    entry = { rows: text === null ? (await run(KPI.map(q => sql(q).bind(from, end, band)), now)).map(arrays) : JSON.parse(text),
      until: now + CLOSED_KEEP_MS };
    if (text === null) {
      // A copy that cannot be kept only costs a read later.
      const json = JSON.stringify(entry.rows);
      if (json.length <= KEPT_MAX) await run([sql(KEPT_PUT).bind(key, 'legacy', json)], now).catch(() => {});
    }
    for (const [old, other] of closedDays) if (old === key || other.until <= now) closedDays.delete(old);
    closedDays.set(key, entry);
    while (closedDays.size > CLOSED_CAP) closedDays.delete(closedDays.keys().next().value);
    return entry.rows;
  }
  async function factRows(from, to, band, now) {
    const lo = dayBounds(conf.tz, from).lo, hi = dayBounds(conf.tz, to).hi;
    const queries = [twin('agg_days', dayOf(offsetsBetween(conf.tz, lo, hi))), ...AGGREGATES.slice(1).map(table => TWIN[table])];
    return (await run(queries.map(q => sql(q).bind(lo, hi, band)), now)).map(arrays);
  }
  async function kpiRows(from, to, band, now) {
    const parts = [];
    if (conf.legacyUntil && from <= conf.legacyUntil) parts.push(await legacyRows(from, to < conf.legacyUntil ? to : conf.legacyUntil, band, now));
    const since = conf.factsSince > from ? conf.factsSince : from;
    if (since <= to) parts.push(await factRows(since, to, band, now));
    return AGGREGATES.map((_, i) => parts.flatMap(part => part[i]));
  }

  // Engagement KPIs for days from..to (YYYY-MM-DD, inclusive): the frozen UTC receipt days
  // before the update and the school's local days after it. band: null for every band, ''
  // for the unknown band. The shape is documented in server/README.md.
  async function kpis({ from, to, band = null }, now = Date.now()) {
    await ensure(now);
    const [dayRows, gameRows, levelRows, sourceRows, deviceRows] = await kpiRows(from, to, band, now);

    // The day totals, per day and per band.
    const total = TABLES.agg_days.sums.map(() => 0), byDay = new Map(), byBand = new Map();
    for (const row of dayRows) {
      const v = row.slice(2);
      sumInto(byDay, row[0], v);
      sumInto(byBand, row[1], v);
      for (let i = 0; i < v.length; i++) total[i] += v[i];
    }
    const sessions = total[D.sessions];
    const totals = group({}, sessions, dayRows.length > 0, () => ({
      engagedMinutes: minutes(total[D.engaged_ms]), avgEngagedMinutesPerSession: mean(total[D.engaged_ms] / 60000, sessions, 2),
      gameOpens: total[D.opens], roundsStarted: total[D.starts], roundsEnded: total[D.ends], levelUps: total[D.level_ups],
      errors: total[D.errors],
      players: {
        sessionStarts: total[D.session_starts], newProfiles: total[D.new_profiles], guests: total[D.guests],
        profileAge: vector(total, D, PROFILE_AGE), daysSinceLast: vector(total, D, SINCE_LAST)
      }
    }));
    const daily = [];
    for (let t = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z'); t <= end; t += DAY_MS) {
      const day = utcDay(t), v = byDay.get(day);
      daily.push(group({ day }, v ? v[D.sessions] : 0, !!v, () => ({ engagedMinutes: minutes(v ? v[D.engaged_ms] : 0), opens: v ? v[D.opens] : 0 })));
    }
    const modes = ['web', 'app'].filter(mode => total[D[mode]] > 0).map(mode => group({ mode }, total[D[mode]], true, () => ({})));

    // Per band and game, and per game over the selected bands.
    const bandGames = sumRows(gameRows, 2), bySlug = new Map();
    for (const { key: [, slug], v } of bandGames.values()) sumInto(bySlug, slug, v);
    const games = [...bySlug.keys()].sort(natural).map(slug => {
      const g = bySlug.get(slug), c = codes(g, G), starts = g[G.starts], closes = g[G.closes];
      const hits = g[G.hits], misses = g[G.misses], loads = g[G.loads];
      return group({ slug }, g[G.sessions], true, () => ({
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
        replay: { replayIndex: vector(g, G, REPLAY), playsBefore: vector(g, G, PLAYS) }
      }));
    });

    // Per level (slug, round id): the funnel and where children stop.
    const levels = [...sumRows(levelRows, 2).values()].map(({ key: [slug, id], v }) => ({ slug, id, v })).sort(byLevel)
      .map(({ slug, id, v }) => {
        const c = codes(v, L), starts = v[L.starts], ends = v[L.ends];
        return group({ slug, id }, v[L.sessions], true, () => ({
          starts, ends, codes: c,
          completionRate: ratio(c.w, starts), winRate: ratio(c.w, c.w + c.l), dropOffRate: ratio(c.q, starts),
          avgMs: ends ? Math.round(v[L.ms] / ends) : null, avgTier: mean(v[L.tier_sum], v[L.tier_n], 2)
        }));
      });

    // Per age band: preferences (share of the band's opens per game), difficulty and time.
    const perBand = new Map();
    for (const { key: [a, slug], v } of bandGames.values()) (perBand.get(a) || perBand.set(a, []).get(a)).push({ slug, v });
    const bands = BANDS.filter(([a]) => byBand.has(a)).map(([a, name]) => {
      const b = byBand.get(a), opens = b[D.opens];
      return group({ band: name }, b[D.sessions], true, () => ({
        opens, engagedMinutes: minutes(b[D.engaged_ms]),
        games: (perBand.get(a) || []).sort((x, y) => natural(x.slug, y.slug)).map(({ slug, v }) => group({ slug }, v[G.sessions], true, () => ({
          opens: v[G.opens], share: ratio(v[G.opens], opens), avgTier: mean(v[G.tier_sum], v[G.tier_n], 2),
          completionRate: ratio(v[G.w], v[G.starts]),
          winRate: ratio(v[G.w], v[G.w] + v[G.l]), dropOffRate: ratio(v[G.q], v[G.starts]), engagedMinutes: minutes(v[G.engaged_ms]),
          starts: v[G.starts]
        })))
      }));
    });

    // Launch sources over all games, in the contract's order.
    const bySource = sumRows(sourceRows, 1);
    const sources = SOURCES.filter(src => bySource.has(src)).map(src => {
      const { v } = bySource.get(src);
      return group({ src }, v[S.sessions], true, () => ({ opens: v[S.opens] }));
    });

    // Coarse device buckets against smoothness, input latency and load time.
    const devices = {};
    DEVICES.forEach(([, name], i) => {
      const byValue = new Map();
      for (const row of deviceRows) sumInto(byValue, row[i], row.slice(3));
      devices[name] = [...byValue.keys()].sort((x, y) => x - y).map(value => {
        const v = byValue.get(value), loads = v[V.loads];
        return group({ value }, v[V.sessions], true, () => ({
          frames: frames(v, V), il: vector(v, V, IL), avgLoadMs: loads ? Math.round(v[V.load_ms] / loads) : null
        }));
      });
    });

    return {
      v: 1, range: { from, to, days: daily.length, band: band === null ? 'all' : band || 'unknown' },
      minSessions: MIN_SESSIONS, totals, daily, games, levels, bands, sources, devices, modes
    };
  }

  // Deletes the live rows that have left the window, and flushes this instance's usage.
  // Batches and live queries delete them as they come; the hosts also call this every few
  // minutes (the Worker's 5-minute cron, a timer on Node), so a live row is gone within 10
  // minutes when no request comes at all.
  async function sweep(now) {
    await ensure(now);
    const [result] = await run([sql(LIVE_SWEEP).bind(Math.floor(now / MINUTE_MS) - LIVE_WINDOW_MIN)], now);
    return result.meta.changes;
  }

  // Sessions whose last batch arrived in this minute or the four before, and their open games.
  async function live(now) {
    await ensure(now);
    const minute = Math.floor(now / MINUTE_MS), statements = [sql(LIVE_COUNT).bind(minute - LIVE_WINDOW_MIN)];
    if (minute !== sweptMinute) { sweptMinute = minute; statements.push(sql(LIVE_SWEEP).bind(minute - LIVE_WINDOW_MIN)); }
    const [{ results }] = await run(statements, now);
    const open = results.filter(row => row.slug).sort((x, y) => natural(x.slug, y.slug));
    return {
      v: 1, windowSec: LIVE_WINDOW_MIN * 60, minSessions: MIN_SESSIONS,
      total: group({}, results.reduce((n, row) => n + row.n, 0), false, () => ({})),
      games: open.map(row => group({ slug: row.slug }, row.n, true, () => ({})))
    };
  }

  return { db, setup, ingest, batchEvery, today, purge, sweep, kpis, live, close: () => db.close?.() };
}

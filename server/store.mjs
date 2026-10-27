// SQLite storage for the ingest server: one table per event kind, one row per
// session and receipt day for the envelope's coarse buckets, the batch ids used
// for de-duplication, and two derived tables that make the small-group gates
// cheap (which sessions touched a game or a level on a day). Rows hold only
// validated contract fields plus the receipt day and hour; there is no column
// for an IP, a header or a timestamp.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CODES, ERRORS, SOURCES } from './schema.mjs';

export const MIN_SESSIONS = 3;
export const LIVE_WINDOW_MS = 5 * 60000;
export const DEDUP_DAYS = 30;
export const SCHEMA_VERSION = 1;
const DAY_MS = 86400000;
const LIVE_CAP = 100000;
const BANDS = [['6-7', '6-7'], ['8-9', '8-9'], ['10-11', '10-11'], ['', 'unknown']];
const DEVICES = [['cores', 'cores'], ['mem', 'memory'], ['screen', 'screen']];

const series = (prefix, n) => Array.from({ length: n }, (_, i) => prefix + i);
// Event columns after s, day, hour, a and t, in the order of the cleaned event.
export const COLUMNS = {
  ss: ['new_profile', 'profile_age', 'since_last', 'level'],
  go: ['slug', 'src', 'plays'],
  ld: ['slug', 'ms'],
  er: ['slug', 'kind'],
  rs: ['slug', 'id', 'tier', 'replay'],
  re: ['slug', 'code', 'id', 'ms', 'score', 'tier', 'hits', 'misses', ...series('rt', 6)],
  gx: ['slug', 'ms', ...series('il', 6), ...series('f', 4)],
  lv: ['level'],
  se: ['ms']
};
const TEXT = new Set(['slug', 'src', 'kind', 'id', 'code']);

export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

function schemaSql() {
  const sql = [
    'CREATE TABLE IF NOT EXISTS batches (b TEXT PRIMARY KEY, day TEXT NOT NULL) STRICT, WITHOUT ROWID',
    'CREATE INDEX IF NOT EXISTS batches_day ON batches (day)',
    'CREATE TABLE IF NOT EXISTS session_days (s TEXT NOT NULL, day TEXT NOT NULL, hour INTEGER NOT NULL, ' +
      'a TEXT NOT NULL, m TEXT NOT NULL, k TEXT NOT NULL, cores INTEGER NOT NULL, mem INTEGER NOT NULL, ' +
      'screen INTEGER NOT NULL, PRIMARY KEY (s, day)) STRICT, WITHOUT ROWID',
    'CREATE INDEX IF NOT EXISTS session_days_day ON session_days (day)',
    'CREATE TABLE IF NOT EXISTS session_games (day TEXT NOT NULL, slug TEXT NOT NULL, s TEXT NOT NULL, ' +
      'a TEXT NOT NULL, PRIMARY KEY (day, slug, s)) STRICT, WITHOUT ROWID',
    'CREATE TABLE IF NOT EXISTS session_levels (day TEXT NOT NULL, slug TEXT NOT NULL, id TEXT NOT NULL, ' +
      's TEXT NOT NULL, a TEXT NOT NULL, PRIMARY KEY (day, slug, id, s)) STRICT, WITHOUT ROWID'
  ];
  for (const [kind, columns] of Object.entries(COLUMNS)) {
    const defs = columns.map(c => `${c} ${TEXT.has(c) ? 'TEXT' : 'INTEGER'} NOT NULL`).join(', ');
    sql.push(`CREATE TABLE IF NOT EXISTS ev_${kind} (s TEXT NOT NULL, day TEXT NOT NULL, hour INTEGER NOT NULL, ` +
      `a TEXT NOT NULL, t INTEGER NOT NULL, ${defs}) STRICT`);
    sql.push(`CREATE INDEX IF NOT EXISTS ev_${kind}_day ON ev_${kind} (day)`);
  }
  return sql.join(';\n');
}

// A group with fewer than MIN_SESSIONS distinct sessions is reported only as suppressed.
// An empty group (0) reveals nothing and keeps its zeros.
const hidden = n => n > 0 && n < MIN_SESSIONS;
const group = (key, sessions, build) => hidden(sessions) ? { ...key, suppressed: true } : { ...key, sessions, ...build() };
const round = (x, digits) => { const f = 10 ** digits; return Math.round(x * f) / f; };
const ratio = (a, b) => b ? round(a / b, 4) : null;
const minutes = ms => round(ms / 60000, 1);
const buckets = (row, prefix, n) => series(prefix, n).map(c => row ? row[c] || 0 : 0);
const frames = row => {
  const counts = buckets(row, 'f', 4), total = counts.reduce((a, b) => a + b, 0);
  return { counts, smoothShare: ratio(counts[0], total), stallShare: ratio(counts[3], total) };
};
const byKey = (rows, key) => new Map(rows.map(r => [key(r), r]));
const histogram = (rows, n) => { const out = new Array(n).fill(0); for (const r of rows) out[r.k] = r.n; return out; };
const codes = row => Object.fromEntries(CODES.map(c => [c, row ? row[c] || 0 : 0]));
const natural = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const byLevel = (a, b) => natural(a.slug, b.slug) || a.id.localeCompare(b.id, 'en', { numeric: true }) || natural(a.id, b.id);

// The day filter, and the band filter when $band is not null ('' is the unknown band).
const W = (p = '') => `${p}day BETWEEN $from AND $to AND ($band IS NULL OR ${p}a = $band)`;
const DAY_TABLES = ['session_days', 'session_games', 'session_levels', ...Object.keys(COLUMNS).map(kind => 'ev_' + kind)];
const sums = (prefix, n, table = '') => series(prefix, n).map(c => `SUM(${table}${c}) AS ${c}`).join(', ');
const CODE_SUMS = CODES.map(c => `SUM(code = '${c}') AS ${c}`).join(', ');
// replayIndex 0, 1, 2, 3-4, 5-9, 10+
const REPLAY_BUCKET = 'CASE WHEN replay < 3 THEN replay WHEN replay < 5 THEN 3 WHEN replay < 10 THEN 4 ELSE 5 END';

// Sessions seen in the last five minutes, in memory only, with the game each has open.
class LiveSessions {
  constructor() { this.sessions = new Map(); }
  record(s, events, now) {
    if (!events.length) return;
    let game = this.sessions.get(s)?.game || '';
    for (const e of events) {
      if (e[0] === 'go') game = e[2];
      else if (e[0] === 'se' || (e[0] === 'gx' && e[2] === game)) game = '';
    }
    // Re-inserting keeps the map ordered by the last receipt, oldest first.
    this.sessions.delete(s);
    this.sessions.set(s, { at: now, game });
    this.prune(now);
  }
  prune(now) {
    for (const [s, entry] of this.sessions) {
      if (now - entry.at < LIVE_WINDOW_MS && this.sessions.size <= LIVE_CAP) break;
      this.sessions.delete(s);
    }
  }
  snapshot(now) {
    this.prune(now);
    const games = new Map();
    for (const { game } of this.sessions.values()) if (game) games.set(game, (games.get(game) || 0) + 1);
    return {
      v: 1, windowSec: LIVE_WINDOW_MS / 1000, minSessions: MIN_SESSIONS,
      total: group({}, this.sessions.size, () => ({})),
      games: [...games].sort((a, b) => natural(a[0], b[0])).map(([slug, n]) => group({ slug }, n, () => ({})))
    };
  }
}

export function openStore(file, { retentionDays = 180 } = {}) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error(`database schema ${version} is newer than this server (${SCHEMA_VERSION})`);
  }
  db.exec('PRAGMA busy_timeout = 5000');
  // Deleted rows are overwritten, and purges give the space back to the file.
  if (version === 0) db.exec('PRAGMA auto_vacuum = INCREMENTAL');
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA secure_delete = ON');
  db.exec(schemaSql());
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  const live = new LiveSessions();
  const statements = new Map();
  const prepared = sql => statements.get(sql) || statements.set(sql, db.prepare(sql)).get(sql);
  const insertBatchId = prepared('INSERT OR IGNORE INTO batches (b, day) VALUES (?, ?)');
  const insertSessionDay = prepared('INSERT OR IGNORE INTO session_days (s, day, hour, a, m, k, cores, mem, screen) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertSessionGame = prepared('INSERT OR IGNORE INTO session_games (day, slug, s, a) VALUES (?, ?, ?, ?)');
  const insertSessionLevel = prepared('INSERT OR IGNORE INTO session_levels (day, slug, id, s, a) VALUES (?, ?, ?, ?, ?)');
  const insertEvent = Object.fromEntries(Object.entries(COLUMNS).map(([kind, columns]) => [kind,
    prepared(`INSERT INTO ev_${kind} (s, day, hour, a, t, ${columns.join(', ')}) ` +
      `VALUES (${new Array(columns.length + 5).fill('?').join(', ')})`)]));

  function transaction(work) {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* SQLite already rolled back */ }
      throw error;
    }
  }

  // Stores one validated batch in one transaction. False when the batch id was seen.
  function insertBatch({ envelope, events }, now) {
    const day = utcDay(now), hour = new Date(now).getUTCHours(), { b, s, a } = envelope;
    const stored = transaction(() => {
      if (!insertBatchId.run(b, day).changes) return false;
      if (events.length) insertSessionDay.run(s, day, hour, a, envelope.m, envelope.k, ...envelope.d);
      const games = new Set(), levels = new Set();
      for (const event of events) {
        insertEvent[event[0]].run(s, day, hour, a, ...event.slice(1).flat());
        const [kind, , slug] = event;
        if (kind === 'ss' || kind === 'lv' || kind === 'se') continue;
        if (!games.has(slug)) { games.add(slug); insertSessionGame.run(day, slug, s, a); }
        const id = kind === 'rs' ? event[3] : kind === 're' ? event[4] : null;
        if (id !== null && !levels.has(slug + '\n' + id)) { levels.add(slug + '\n' + id); insertSessionLevel.run(day, slug, id, s, a); }
      }
      return true;
    });
    if (stored) live.record(s, events, now);
    return stored;
  }

  // Deletes rows older than the retention period and batch ids older than 30 days.
  function purge(now) {
    const cutoff = utcDay(now - retentionDays * DAY_MS), dedupCutoff = utcDay(now - DEDUP_DAYS * DAY_MS);
    const result = transaction(() => {
      let rows = 0;
      for (const table of DAY_TABLES) rows += prepared(`DELETE FROM ${table} WHERE day < ?`).run(cutoff).changes;
      return { cutoff, rows, batches: prepared('DELETE FROM batches WHERE day < ?').run(dedupCutoff).changes };
    });
    // Write the zeroed pages back and empty the write-ahead log, so purged rows leave the files.
    db.exec('PRAGMA incremental_vacuum; PRAGMA wal_checkpoint(TRUNCATE)');
    return result;
  }

  // Engagement KPIs for receipt days from..to (YYYY-MM-DD, inclusive). band: null for
  // every band, '' for the unknown band. The shape is documented in server/README.md.
  function kpis({ from, to, band = null }) {
    const params = { from, to, band };
    const all = sql => prepared(sql).all(params);
    const get = sql => prepared(sql).get(params);
    const grouped = (sql, key = r => r.slug) => byKey(all(sql), key);
    const multi = (sql, key = r => r.slug) => {
      const map = new Map();
      for (const row of all(sql)) { const k = key(row); if (!map.has(k)) map.set(k, []); map.get(k).push(row); }
      return map;
    };

    const sessions = get(`SELECT COUNT(DISTINCT s) AS n FROM session_days WHERE ${W()}`).n;
    const engagedMs = get(`SELECT COALESCE(SUM(ms), 0) AS ms FROM ev_gx WHERE ${W()}`).ms;
    const count = kind => get(`SELECT COUNT(*) AS n FROM ev_${kind} WHERE ${W()}`).n;
    const totals = group({}, sessions, () => {
      const ss = get(`SELECT COUNT(*) AS n, COALESCE(SUM(new_profile), 0) AS fresh, ` +
        `COALESCE(SUM(level = 0), 0) AS guests FROM ev_ss WHERE ${W()}`);
      return {
        engagedMinutes: minutes(engagedMs),
        avgEngagedMinutesPerSession: sessions ? round(engagedMs / 60000 / sessions, 2) : null,
        gameOpens: count('go'), roundsStarted: count('rs'), roundsEnded: count('re'),
        levelUps: count('lv'), errors: count('er'),
        players: {
          sessionStarts: ss.n, newProfiles: ss.fresh, guests: ss.guests,
          profileAge: histogram(all(`SELECT profile_age AS k, COUNT(*) AS n FROM ev_ss WHERE ${W()} GROUP BY k`), 4),
          daysSinceLast: histogram(all(`SELECT since_last AS k, COUNT(*) AS n FROM ev_ss WHERE ${W()} GROUP BY k`), 5)
        }
      };
    });

    // Per game.
    const gameGate = grouped(`SELECT slug, COUNT(DISTINCT s) AS n FROM session_games WHERE ${W()} GROUP BY slug`);
    const opens = grouped(`SELECT slug, COUNT(*) AS n FROM ev_go WHERE ${W()} GROUP BY slug`);
    const sources = multi(`SELECT slug, src, COUNT(*) AS n FROM ev_go WHERE ${W()} GROUP BY slug, src`);
    const plays = multi(`SELECT slug, plays AS k, COUNT(*) AS n FROM ev_go WHERE ${W()} GROUP BY slug, k`);
    const loads = grouped(`SELECT slug, COUNT(*) AS n, AVG(ms) AS ms FROM ev_ld WHERE ${W()} GROUP BY slug`);
    const errors = multi(`SELECT slug, kind, COUNT(*) AS n FROM ev_er WHERE ${W()} GROUP BY slug, kind`);
    const starts = grouped(`SELECT slug, COUNT(*) AS n, AVG(CASE WHEN tier > 0 THEN tier END) AS tier ` +
      `FROM ev_rs WHERE ${W()} GROUP BY slug`);
    const replays = multi(`SELECT slug, ${REPLAY_BUCKET} AS k, COUNT(*) AS n FROM ev_rs WHERE ${W()} GROUP BY slug, k`);
    const ends = grouped(`SELECT slug, COUNT(*) AS n, ${CODE_SUMS}, SUM(hits) AS hits, SUM(misses) AS misses, ` +
      `${sums('rt', 6)} FROM ev_re WHERE ${W()} GROUP BY slug`);
    const closes = grouped(`SELECT slug, COUNT(*) AS n, SUM(ms) AS ms, ${sums('il', 6)}, ${sums('f', 4)} ` +
      `FROM ev_gx WHERE ${W()} GROUP BY slug`);
    const games = [...gameGate.keys()].sort(natural).map(slug => group({ slug }, gameGate.get(slug).n, () => {
      const start = starts.get(slug), end = ends.get(slug), close = closes.get(slug), load = loads.get(slug);
      const n = start?.n || 0, c = codes(end), hits = end?.hits || 0, misses = end?.misses || 0;
      const closed = close?.n || 0, ms = close?.ms || 0;
      const errorRows = errors.get(slug) || [];
      return {
        opens: opens.get(slug)?.n || 0, closes: closed,
        engagedMinutes: minutes(ms), avgEngagedSecPerOpen: closed ? round(ms / 1000 / closed, 1) : null,
        rounds: { starts: n, ends: end?.n || 0, codes: c },
        completionRate: ratio(c.w, n), winRate: ratio(c.w, c.w + c.l), dropOffRate: ratio(c.q, n),
        avgTier: start?.tier == null ? null : round(start.tier, 2),
        hits, misses, accuracy: ratio(hits, hits + misses),
        rt: buckets(end, 'rt', 6), il: buckets(close, 'il', 6), frames: frames(close),
        loads: load?.n || 0, avgLoadMs: load ? Math.round(load.ms) : null,
        errors: Object.fromEntries(ERRORS.map(k => [k, errorRows.find(r => r.kind === k)?.n || 0])),
        sources: Object.fromEntries((sources.get(slug) || []).sort((a, b) => SOURCES.indexOf(a.src) - SOURCES.indexOf(b.src))
          .map(r => [r.src, r.n])),
        replay: { replayIndex: histogram(replays.get(slug) || [], 6), playsBefore: histogram(plays.get(slug) || [], 5) }
      };
    }));

    // Per level (slug, round id): the funnel and where children stop.
    const levelKey = r => r.slug + '\n' + r.id;
    const levelGate = all(`SELECT slug, id, COUNT(DISTINCT s) AS n FROM session_levels WHERE ${W()} GROUP BY slug, id`);
    const levelStarts = grouped(`SELECT slug, id, COUNT(*) AS n, AVG(CASE WHEN tier > 0 THEN tier END) AS tier ` +
      `FROM ev_rs WHERE ${W()} GROUP BY slug, id`, levelKey);
    const levelEnds = grouped(`SELECT slug, id, COUNT(*) AS n, ${CODE_SUMS}, AVG(ms) AS ms ` +
      `FROM ev_re WHERE ${W()} GROUP BY slug, id`, levelKey);
    const levels = levelGate.sort(byLevel).map(row => group({ slug: row.slug, id: row.id }, row.n, () => {
      const start = levelStarts.get(levelKey(row)), end = levelEnds.get(levelKey(row));
      const n = start?.n || 0, c = codes(end);
      return {
        starts: n, ends: end?.n || 0, codes: c,
        completionRate: ratio(c.w, n), winRate: ratio(c.w, c.w + c.l), dropOffRate: ratio(c.q, n),
        avgMs: end ? Math.round(end.ms) : null, avgTier: start?.tier == null ? null : round(start.tier, 2)
      };
    }));

    // Per age band: preferences (share of the band's opens per game), tier and completion.
    const bandKey = r => r.a + '\n' + r.slug;
    const bandGate = grouped(`SELECT a, COUNT(DISTINCT s) AS n FROM session_days WHERE ${W()} GROUP BY a`, r => r.a);
    const bandOpens = grouped(`SELECT a, COUNT(*) AS n FROM ev_go WHERE ${W()} GROUP BY a`, r => r.a);
    const bandEngaged = grouped(`SELECT a, SUM(ms) AS ms FROM ev_gx WHERE ${W()} GROUP BY a`, r => r.a);
    const bandGameGate = all(`SELECT a, slug, COUNT(DISTINCT s) AS n FROM session_games WHERE ${W()} GROUP BY a, slug`);
    const bandGameOpens = grouped(`SELECT a, slug, COUNT(*) AS n FROM ev_go WHERE ${W()} GROUP BY a, slug`, bandKey);
    const bandGameStarts = grouped(`SELECT a, slug, COUNT(*) AS n, AVG(CASE WHEN tier > 0 THEN tier END) AS tier ` +
      `FROM ev_rs WHERE ${W()} GROUP BY a, slug`, bandKey);
    const bandGameWins = grouped(`SELECT a, slug, SUM(code = 'w') AS w FROM ev_re WHERE ${W()} GROUP BY a, slug`, bandKey);
    const bands = BANDS.filter(([a]) => bandGate.has(a)).map(([a, name]) => group({ band: name }, bandGate.get(a).n, () => {
      const total = bandOpens.get(a)?.n || 0;
      return {
        opens: total, engagedMinutes: minutes(bandEngaged.get(a)?.ms || 0),
        games: bandGameGate.filter(r => r.a === a).sort((x, y) => natural(x.slug, y.slug)).map(r => group({ slug: r.slug }, r.n, () => {
          const n = bandGameOpens.get(bandKey(r))?.n || 0, start = bandGameStarts.get(bandKey(r));
          return {
            opens: n, share: ratio(n, total),
            avgTier: start?.tier == null ? null : round(start.tier, 2),
            completionRate: ratio(bandGameWins.get(bandKey(r))?.w || 0, start?.n || 0)
          };
        }))
      };
    }));

    // Launch sources over all games.
    const sourceRows = grouped(`SELECT src, COUNT(*) AS n, COUNT(DISTINCT s) AS sessions FROM ev_go WHERE ${W()} GROUP BY src`, r => r.src);
    const launch = SOURCES.filter(src => sourceRows.has(src)).map(src =>
      group({ src }, sourceRows.get(src).sessions, () => ({ opens: sourceRows.get(src).n })));

    // Coarse device buckets against smoothness, input latency and load time.
    const devices = {};
    for (const [column, name] of DEVICES) {
      const gate = grouped(`SELECT ${column} AS v, COUNT(DISTINCT s) AS n FROM session_days WHERE ${W()} GROUP BY v`, r => r.v);
      const join = `JOIN session_days d ON d.s = e.s AND d.day = e.day WHERE ${W('e.')}`;
      const close = grouped(`SELECT d.${column} AS v, ${sums('f', 4, 'e.')}, ${sums('il', 6, 'e.')} FROM ev_gx e ${join} GROUP BY v`, r => r.v);
      const load = grouped(`SELECT d.${column} AS v, AVG(e.ms) AS ms FROM ev_ld e ${join} GROUP BY v`, r => r.v);
      devices[name] = [...gate.keys()].sort((a, b) => a - b).map(value => group({ value }, gate.get(value).n, () => ({
        frames: frames(close.get(value)), il: buckets(close.get(value), 'il', 6),
        avgLoadMs: load.has(value) ? Math.round(load.get(value).ms) : null
      })));
    }

    const modeRows = grouped(`SELECT m, COUNT(DISTINCT s) AS n FROM session_days WHERE ${W()} GROUP BY m`, r => r.m);
    const modes = ['web', 'app'].filter(m => modeRows.has(m)).map(mode => group({ mode }, modeRows.get(mode).n, () => ({})));

    // Every day of the range, oldest first.
    const daySessions = grouped(`SELECT day, COUNT(DISTINCT s) AS n FROM session_days WHERE ${W()} GROUP BY day`, r => r.day);
    const dayEngaged = grouped(`SELECT day, SUM(ms) AS ms FROM ev_gx WHERE ${W()} GROUP BY day`, r => r.day);
    const dayOpens = grouped(`SELECT day, COUNT(*) AS n FROM ev_go WHERE ${W()} GROUP BY day`, r => r.day);
    const daily = [];
    for (let t = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z'); t <= end; t += DAY_MS) {
      const day = utcDay(t);
      daily.push(group({ day }, daySessions.get(day)?.n || 0, () => ({
        engagedMinutes: minutes(dayEngaged.get(day)?.ms || 0), opens: dayOpens.get(day)?.n || 0
      })));
    }

    return {
      v: 1, range: { from, to, days: daily.length, band: band === null ? 'all' : band || 'unknown' },
      minSessions: MIN_SESSIONS, totals, daily, games, levels, bands, sources: launch, devices, modes
    };
  }

  return {
    db, insertBatch, purge, kpis,
    live: now => live.snapshot(now),
    close: () => db.close()
  };
}

// A Cloudflare D1-style database over node:sqlite, for the Node host and the tests:
// db.prepare(sql).bind(...values).all() / .first(column) / .run() / .raw(), db.batch([...])
// (one transaction: all or nothing) and db.exec(sql), with D1's results
// ({ success, meta, results }) and D1's value rules: every number, and a boolean (1/0),
// binds as REAL, as on D1 (a STRICT INTEGER column still stores a whole number as an
// integer); undefined, BigInt and objects are refused. A query is one statement (D1 would
// run them all and answer with the last; node:sqlite would run only the first). Statements
// are compiled when they first run and cached.
// meta.rows_written bills what D1 bills: every row changed by an INSERT, UPDATE, DELETE or
// upsert counts once for the table and once for each of its secondary indexes (an upper
// bound: an UPDATE that leaves an indexed column alone writes no index entry); the index
// count of a table is read from the schema once and kept until a statement changes the
// schema. meta.size_after is the database size (page_count x page_size). meta.rows_read
// is only the rows returned, since node:sqlite cannot count the rows SQLite scanned; the
// tests check read costs through query plans instead.
import fs from 'node:fs';
import path from 'node:path';
import { hideSqliteWarning } from './warnings.mjs';

// Before node:sqlite loads, so its one ExperimentalWarning stays hidden.
hideSqliteWarning();
const { DatabaseSync } = await import('node:sqlite');

const CACHE = 256;
// The table a write statement changes, after any leading comments.
const TARGET = /^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["`[]?(\w+)/i;
const DDL = /^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*(?:CREATE|DROP|ALTER)\b/i;

function d1Error(error) {
  return error instanceof Error && error.message.startsWith('D1_') ? error
    : new Error('D1_ERROR: ' + (error && error.message), { cause: error });
}

// node:sqlite binds a JS number as REAL, like D1.
function bindable(value, index) {
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError(`D1_TYPE_ERROR: Type '${typeof value}' not supported for value '${String(value)}' at position ${index + 1}`);
}

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...values) {
    return new Statement(this.db, this.sql, values.map(bindable));
  }
  async all() {
    return this.db.execute(this);
  }
  async run() {
    return this.db.execute(this);
  }
  async first(column) {
    const row = this.db.execute(this).results[0] ?? null;
    if (column === undefined || row === null) return column === undefined ? row : null;
    if (!Object.hasOwn(row, column)) throw new Error('D1_COLUMN_NOTFOUND: Column not found (' + column + ')');
    return row[column];
  }
  async raw({ columnNames = false } = {}) {
    const { results, columns } = this.db.execute(this, true);
    return columnNames ? [columns, ...results] : results;
  }
}

class Database {
  constructor(sqlite) {
    this.sqlite = sqlite;
    this.compiled = new Map();
    this.totalChanges = sqlite.prepare('SELECT total_changes() AS n, last_insert_rowid() AS id');
    this.size = sqlite.prepare('SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()');
    this.tableSql = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?");
    this.indexList = sqlite.prepare('SELECT origin FROM pragma_index_list(?)');
    this.indexes = new Map();
  }
  // 1 + the secondary indexes of a table: the entries one changed row writes. The primary
  // key of a WITHOUT ROWID table is the table itself; a UNIQUE constraint is an index.
  entries(table) {
    let n = this.indexes.get(table);
    if (n === undefined) {
      const sql = this.tableSql.get(table)?.sql || '';
      const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(sql);
      n = 1 + this.indexList.all(table).filter(index => !(withoutRowid && index.origin === 'pk')).length;
      this.indexes.set(table, n);
    }
    return n;
  }
  prepare(sql) {
    if (typeof sql !== 'string') throw new TypeError('D1_TYPE_ERROR: the query must be a string');
    return new Statement(this, sql);
  }
  compile(sql) {
    let entry = this.compiled.get(sql);
    if (!entry) {
      const statement = this.sqlite.prepare(sql);
      // What follows the first statement, without comments, must be empty.
      if (/\S/.test(sql.slice(statement.sourceSQL.length).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ''))) {
        throw new Error('D1_ERROR: one statement per query (use batch() for several)');
      }
      const target = TARGET.exec(sql);
      entry = { statement, rows: statement.columns().length > 0, target: target ? target[1] : null, ddl: DDL.test(sql) };
      if (this.compiled.size >= CACHE) this.compiled.delete(this.compiled.keys().next().value);
      this.compiled.set(sql, entry);
    }
    return entry;
  }
  // Runs one statement synchronously and answers like D1: rows as plain objects, or as
  // arrays of values (with the column names) for raw().
  execute(statement, arrays = false) {
    const started = performance.now();
    let results = [], changes, lastRowId, columns = [], written = 0, size;
    try {
      const { statement: compiled, rows, target, ddl } = this.compile(statement.sql);
      if (rows) {
        const before = this.totalChanges.get();
        if (arrays) {
          compiled.setReturnArrays(true);
          try { results = compiled.all(...statement.params); } finally { compiled.setReturnArrays(false); }
          columns = compiled.columns().map(c => c.name);
        } else {
          results = compiled.all(...statement.params).map(row => ({ ...row }));
        }
        const after = this.totalChanges.get();
        changes = after.n - before.n;
        lastRowId = after.id;
      } else {
        const info = compiled.run(...statement.params);
        changes = Number(info.changes);
        lastRowId = Number(info.lastInsertRowid);
      }
      if (ddl) this.indexes.clear();
      written = changes && target ? changes * this.entries(target) : changes;
      size = this.size.get().size;
    } catch (error) {
      throw d1Error(error);
    }
    return {
      success: true, results, columns,
      meta: {
        served_by: 'sqlite-d1', duration: performance.now() - started, changes, last_row_id: lastRowId,
        changed_db: changes > 0, size_after: size, rows_read: results.length, rows_written: written
      }
    };
  }
  // Every statement in one transaction; the first failure rolls them all back.
  async batch(statements) {
    if (!Array.isArray(statements) || !statements.every(s => s instanceof Statement && s.db === this)) {
      throw new TypeError('D1_TYPE_ERROR: batch() takes an array of statements from this database');
    }
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement => {
        const { columns: _columns, ...result } = this.execute(statement);
        return result;
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      try { this.sqlite.exec('ROLLBACK'); } catch { /* SQLite already rolled back */ }
      throw d1Error(error);
    }
  }
  async exec(sql) {
    const started = performance.now();
    this.indexes.clear();
    try { this.sqlite.exec(sql); } catch (error) { throw d1Error(error); }
    return { count: sql.split(';').filter(part => part.trim()).length, duration: performance.now() - started };
  }
  // Not part of D1: write deleted pages back and empty the write-ahead log, so purged
  // rows leave the files (secure_delete has already overwritten them).
  compact() {
    this.sqlite.exec('PRAGMA incremental_vacuum; PRAGMA wal_checkpoint(TRUNCATE)');
  }
  close() {
    this.compiled.clear();
    this.sqlite.close();
  }
}

// Opens (and creates, with its folder) an SQLite file, or ':memory:'.
export function openDatabase(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new DatabaseSync(file);
  try {
    sqlite.exec('PRAGMA busy_timeout = 5000');
    // A new file gives the space of purged rows back to the file system.
    if (sqlite.prepare('PRAGMA page_count').get().page_count === 0) sqlite.exec('PRAGMA auto_vacuum = INCREMENTAL');
    // Deleted rows are overwritten, not just unlinked.
    sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA secure_delete = ON');
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return new Database(sqlite);
}

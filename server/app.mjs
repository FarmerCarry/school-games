// HTTP front of the ingest server: routing, CORS, the per-IP token bucket, body
// limits and admin authentication. No IP, header or request body is ever stored
// or logged; the IP is only a key of the in-memory token bucket.
import http from 'node:http';
import crypto from 'node:crypto';
import { validateBatch } from './schema.mjs';
import { openStore, utcDay } from './store.mjs';

export const MAX_BODY = 64 * 1024;
export const MAX_RANGE_DAYS = 366;
const DAY_MS = 86400000;
const PURGE_EVERY_MS = 24 * 3600000;
const BUCKET_CAP = 100000;
const DRAIN_LIMIT = 1024 * 1024;
// The band query value and the stored band ('' is unknown).
const KPI_BANDS = { all: null, '6-7': '6-7', '8-9': '8-9', '10-11': '10-11', unknown: '' };

class HttpError extends Error {
  constructor(status, message, headers = {}) { super(message); this.status = status; this.headers = headers; }
}

const digest = value => crypto.createHash('sha256').update(value).digest();

// Token bucket per client: RATE_PER_MIN tokens, refilled continuously. Returns
// the seconds to wait, or 0 when the request may go ahead. 0 per minute turns it off.
function rateLimiter(perMin, now) {
  const buckets = new Map();
  let swept = now();
  const refill = (bucket, t) => Math.min(perMin, bucket.tokens + Math.max(0, t - bucket.at) * perMin / 60000);
  return key => {
    if (!perMin) return 0;
    const t = now();
    if (t - swept >= 60000 || buckets.size >= BUCKET_CAP) {
      // A full bucket is the same as no bucket.
      for (const [k, bucket] of buckets) if (refill(bucket, t) >= perMin) buckets.delete(k);
      if (buckets.size >= BUCKET_CAP) buckets.clear();
      swept = t;
    }
    const bucket = buckets.get(key) || { tokens: perMin, at: t };
    bucket.tokens = refill(bucket, t);
    bucket.at = t;
    buckets.set(key, bucket);
    if (bucket.tokens < 1) return Math.max(1, Math.ceil((1 - bucket.tokens) * 60 / perMin));
    bucket.tokens -= 1;
    return 0;
  };
}

// The client address: the socket's, or with TRUST_PROXY=n the address the n-th
// trusted proxy from the server appended to X-Forwarded-For.
function clientKey(req, hops) {
  if (hops > 0) {
    const list = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (list.length >= hops) return list[list.length - hops];
  }
  return req.socket.remoteAddress || '';
}

// Past the limit the rest of the body is read and thrown away, so that closing
// the socket cannot reset the connection before the client reads the 413. A
// client that sends DRAIN_LIMIT more is disconnected (as is one slower than
// the request timeout).
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, done = false;
    const finish = (fn, value) => { if (!done) { done = true; fn(value); } };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit + DRAIN_LIMIT) req.destroy();
      else if (size > limit) finish(reject, new HttpError(413, 'too large'));
      else if (!done) chunks.push(chunk);
    });
    req.on('end', () => finish(resolve, Buffer.concat(chunks)));
    req.on('error', error => finish(reject, error));
    if (Number(req.headers['content-length']) > limit) finish(reject, new HttpError(413, 'too large'));
  });
}

const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + 'T00:00:00Z')) && utcDay(Date.parse(v + 'T00:00:00Z')) === v;

// from/to default to the 30 days ending today (UTC).
function kpiParams(query, now) {
  const to = query.get('to') ?? utcDay(now);
  if (!validDay(to)) throw new HttpError(400, 'to');
  const from = query.get('from') ?? utcDay(Date.parse(to + 'T00:00:00Z') - 29 * DAY_MS);
  if (!validDay(from) || from > to) throw new HttpError(400, 'from');
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS + 1 > MAX_RANGE_DAYS) throw new HttpError(400, 'range');
  const band = query.get('band') ?? 'all';
  if (!Object.hasOwn(KPI_BANDS, band)) throw new HttpError(400, 'band');
  return { from, to, band: KPI_BANDS[band] };
}

export function createApp(options = {}) {
  const config = {
    dbPath: ':memory:', allowedOrigins: [], adminToken: '', retentionDays: 180, ratePerMin: 1200,
    trustProxy: 0, now: Date.now, log: () => {}, ...options
  };
  const { now, log } = config;
  const store = config.store || openStore(config.dbPath, { retentionDays: config.retentionDays });
  const origins = new Set(config.allowedOrigins);
  const token = config.adminToken ? digest(config.adminToken) : null;
  const limit = rateLimiter(config.ratePerMin, now);
  let timer = null, closing = null;

  const authorized = req => {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
    return !!match && crypto.timingSafeEqual(digest(match[1]), token);
  };

  async function batch(req) {
    const origin = req.headers.origin;
    // Browsers always send Origin; a page from another site must not add rows.
    if (origin !== undefined && !origins.has(origin)) throw new HttpError(403, 'origin');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'text/plain' && type !== 'application/json') throw new HttpError(415, 'content type');
    const raw = await readBody(req, MAX_BODY);
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'json'); }
    const valid = validateBatch(body);
    if (!valid) throw new HttpError(400, 'envelope');
    // A repeated batch id is answered like a new one, so the client drops it.
    store.insertBatch(valid, now());
  }

  function admin(req, kind, query) {
    if (!token) throw new HttpError(404, 'not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method', { Allow: 'GET, HEAD, OPTIONS' });
    if (!authorized(req)) throw new HttpError(401, 'unauthorized', { 'WWW-Authenticate': 'Bearer realm="telemetry"' });
    return kind === 'kpis' ? store.kpis(kpiParams(query, now())) : store.live(now());
  }

  async function handle(req, res) {
    const headers = { Vary: 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origins.has(origin)) {
      // Retry-After is not a CORS-safelisted response header, so the page could not read it otherwise.
      Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Retry-After' });
    }
    const send = (status, body, extra = {}) => {
      if (body === undefined) { res.writeHead(status, { ...headers, ...extra }); res.end(); return; }
      const text = JSON.stringify(body);
      res.writeHead(status, { ...headers, ...extra, 'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(text) });
      res.end(text);
    };
    try {
      const wait = limit(clientKey(req, config.trustProxy));
      if (wait) throw new HttpError(429, 'rate limited', { 'Retry-After': String(wait) });
      const q = req.url.indexOf('?');
      const pathname = q < 0 ? req.url : req.url.slice(0, q);
      const query = new URLSearchParams(q < 0 ? '' : req.url.slice(q + 1));
      if (req.method === 'OPTIONS') {
        if (headers['Access-Control-Allow-Origin']) {
          Object.assign(headers, { 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' });
        }
        send(204);
      } else if (pathname === '/v1/batch') {
        if (req.method !== 'POST') throw new HttpError(405, 'method', { Allow: 'POST, OPTIONS' });
        await batch(req);
        send(204);
      } else if (pathname === '/v1/health') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method', { Allow: 'GET, HEAD, OPTIONS' });
        send(200, { ok: true });
      } else if (pathname === '/v1/admin/kpis' || pathname === '/v1/admin/live') {
        send(200, admin(req, pathname.slice(10), query));
      } else {
        throw new HttpError(404, 'not found');
      }
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof HttpError) {
        send(error.status, { error: error.message }, error.headers);
      } else if (error && error.code === 'ECONNRESET') {
        // The client went away or was too slow (Node has answered 408): nothing failed here.
        res.destroy();
      } else {
        log('telemetry: request failed: ' + (error && error.message));
        send(500, { error: 'server' });
      }
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;

  function purge() {
    try {
      const result = store.purge(now());
      if (result.rows || result.batches) log(`telemetry: purged ${result.rows} rows before ${result.cutoff} and ${result.batches} old batch ids`);
      return result;
    } catch (error) {
      log('telemetry: purge failed: ' + error.message);
      return null;
    }
  }

  return {
    server, store, purge,
    // Purges once, then every 24 hours, and starts listening. Resolves to the address.
    listen(port = 0, host) {
      purge();
      clearInterval(timer);
      timer = setInterval(purge, PURGE_EVERY_MS);
      timer.unref();
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
      });
    },
    // Stops listening and closes the database (unless it was passed in). Safe to repeat.
    close() {
      clearInterval(timer);
      closing ||= new Promise(resolve => {
        server.close(() => { if (!options.store) store.close(); resolve(); });
        server.closeAllConnections();
      });
      return closing;
    }
  };
}

// Cloudflare Workers entry of the ingest server: the shared handler (handler.mjs) and
// store (store.mjs) on the D1 database bound as env.DB, the dashboard from the static
// assets bound as env.ASSETS, and the daily purge from the cron trigger (wrangler.json).
// Settings come from env: ALLOWED_ORIGINS and RETENTION_DAYS (plain variables),
// ADMIN_TOKEN (a secret: the dashboard password) and the optional RATE_PER_MIN.
// Nothing about a request is logged; the client address (CF-Connecting-IP) only keys the
// soft in-memory rate limit of this instance.
import { createHandler, isAdminToken, parseOrigins } from './handler.mjs';
import { openStore } from './store.mjs';

const whole = (raw, fallback, min, max) =>
  /^\d+$/.test(String(raw ?? '')) && Number(raw) >= min && Number(raw) <= max ? Number(raw) : fallback;

const missingDatabase = {
  prepare() { throw new Error('the D1 binding DB is missing (wrangler.json, d1_databases)'); },
  batch() { return Promise.reject(new Error('the D1 binding DB is missing (wrangler.json, d1_databases)')); }
};

// One store and handler per database binding and settings, kept for the life of the
// instance (so the rate limit and the schema check carry over between requests).
const instances = new WeakMap();
function instance(env) {
  const db = env.DB || missingDatabase;
  const settings = [env.ALLOWED_ORIGINS, env.ADMIN_TOKEN, env.RETENTION_DAYS, env.RATE_PER_MIN].join('\n');
  const cached = instances.get(db);
  if (cached && cached.settings === settings && cached.assets === env.ASSETS) return cached;
  const store = openStore(db, { retentionDays: whole(env.RETENTION_DAYS, 180, 1, 36500) });
  const handle = createHandler({
    store,
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS).origins,
    // Without a valid password the admin endpoints answer 404, and the dashboard says
    // that the password was not set.
    adminToken: isAdminToken(env.ADMIN_TOKEN) ? env.ADMIN_TOKEN : '',
    ratePerMin: whole(env.RATE_PER_MIN, 1200, 0, 1e9),
    // Internal errors only (a message, never the request).
    log: message => console.error(message),
    assets: env.ASSETS ? request => env.ASSETS.fetch(request) : null
  });
  const entry = { settings, assets: env.ASSETS, store, handle };
  instances.set(db, entry);
  return entry;
}

export default {
  async fetch(request, env) {
    return instance(env).handle(request, request.headers.get('CF-Connecting-IP') || '');
  },
  // The daily cron: aggregate days past RETENTION_DAYS, batch ids past 30 days, seen
  // rows past yesterday and live rows past 10 minutes are deleted.
  async scheduled(controller, env) {
    await instance(env).store.purge(Date.now());
  }
};

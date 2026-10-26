# Telemetry ingest server

A small HTTPS service that receives **anonymous** play telemetry from the portal's
telemetry sink (`js/telemetry.js`, see [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md),
"Telemetry sink" and "Ingest server"), stores it in one SQLite file and answers
engagement KPIs for the insights dashboard (milestone 2).

* Node 22.13 or newer (where `node:sqlite` needs no flag), **no dependencies**
  (`node:http`, `node:sqlite`, `node:crypto`), no `npm install`.
* Deployed separately from GitHub Pages: a container, a small VM, or any Node host.
* The portal sends nothing unless the fast build is given an ingest URL, so the site
  works exactly as before without this server.

| File | What it does |
|---|---|
| `main.mjs` | Reads the environment, opens the database, starts listening, purges daily. |
| `app.mjs` | HTTP routing, CORS, per-client rate limit, body limits, admin authentication. |
| `schema.mjs` | Strict validation of the envelope and every event kind; cleans and clamps. |
| `store.mjs` | SQLite tables, one transaction per batch, de-duplication, retention, KPI and live queries. |
| `warnings.mjs` | Hides Node 22's one `node:sqlite` ExperimentalWarning (and nothing else). |
| `simulate.mjs` | Deterministic synthetic sessions for dashboard development. |
| `fixtures/sample-batch.json` | A valid envelope with every event kind (shared with the portal's tests). |
| `Dockerfile` | A minimal `node:22-alpine` image. |
| `package.json` | Only the Node version and `npm start`, for hosts that look for one. No dependencies. |

## Before you turn it on

The players are **children aged 6 to 11**. Even anonymous usage statistics about
children need the school's or district's **privacy review** and a **notice to
parents** before collection starts, under the rules that apply to you: for example
**COPPA** and **FERPA** in the United States, the **GDPR** with its rules for children's
data (often called GDPR-K) in the European Union, and the **UK GDPR with the Age
Appropriate Design Code** (Children's Code) in the United Kingdom. Give the reviewers
the "Privacy design" section below and the event list in `docs/ARCHITECTURE.md`. Keep
the server switched off (build without `SG_TELEMETRY_URL`) until the review is done,
and record who operates the server, where it runs and how long data is kept.

Even with the server on, a PC sends nothing while a teacher has stopped statistics on
it (the teacher page), and browsers that send Global Privacy Control never send anything.

## Privacy design

Privacy is built into what can be stored, not only into what the portal chooses to send.

* **No personal data.** The contract has no field for a name, typed text, error text,
  a PC label, a profile key, an avatar, a user-agent or a GPU string. The server
  validates every field against closed lists and patterns (`schema.mjs`) and drops
  anything else: unknown envelope fields are ignored, an event with an extra or a
  malformed field is dropped whole, and round ids that could be typed text (three
  digits in a row, spaces, more than 24 characters) are refused.
* **No persistent identifiers.** The session id is random per portal session and never
  stored on the PC; the batch id is random per batch and kept only 30 days for
  de-duplication. Neither can link sessions of the same child.
* **No IP addresses and no headers are stored or logged.** The client address is only a
  key of the in-memory rate limiter and is forgotten within about a minute. Requests
  are not logged; request bodies are never logged. The only log lines are start-up,
  purge counts and internal error messages.
* **No wall-clock times from the client.** Events carry seconds since the session
  started; the server stamps only the UTC **day** and **hour** of receipt. The "live"
  view keeps the last receipt time per session **in memory only**, for 5 minutes.
* **Coarse buckets.** Devices are reported as cores (1, 2, 4, 8, 16), memory in GB
  (0, 1, 2, 4, 8) and screen width (1366, 1600, 1920, 2560); age as a band (6-7, 8-9,
  10-11 or unknown); profile age, days since last play and plays before as buckets;
  reaction times, input latency and frame times as fixed histograms.
* **Small-group suppression.** Every KPI group (a game, a level, an age band, a device
  bucket, a day, a launch source, live counts) with fewer than **3 distinct sessions**
  is returned as `{ ..., "suppressed": true }` with no numbers. Lists are sorted by
  their key, never by a hidden number. Suppression does not stop an administrator from
  subtracting narrower queries from wider ones; the admin token is for the people who
  operate the service, not for publishing raw results.
* **Retention.** Rows older than `RETENTION_DAYS` (default 180) are deleted when the
  server starts and every 24 hours. SQLite's `secure_delete` overwrites deleted rows,
  and the write-ahead log is truncated after each purge.

## Quick start

```sh
ADMIN_TOKEN=$(openssl rand -hex 24) node server/main.mjs
# telemetry: listening on port 8787; 0 allowed origin(s), admin on, ...
curl -s localhost:8787/v1/health                    # {"ok":true}
node server/simulate.mjs --sessions 200             # synthetic sessions (today)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" localhost:8787/v1/admin/kpis
```

The default database is `server/data/telemetry.db` (ignored by Git).

## Configuration

All settings are environment variables.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | TCP port. `0` picks a free one (printed at start). |
| `HOST` | all interfaces | Bind address. Use `127.0.0.1` behind a reverse proxy on the same machine. |
| `DB_PATH` | `server/data/telemetry.db` | SQLite file (created with its folder). Also writes `-wal` and `-shm` files next to it. |
| `ALLOWED_ORIGINS` | none | Comma-separated origins of the portal, e.g. `https://name.github.io` (an origin has no path and no trailing slash, even when the site lives at `/school-games/`). Browser requests from any other origin get no CORS header and `POST /v1/batch` answers `403`. The literal `null` (pages from `file:` or sandboxed frames) is accepted only if listed; the portal never sends from `file:`. |
| `ADMIN_TOKEN` | none | Bearer token for `/v1/admin/*`, at least 16 characters (use `openssl rand -hex 24`). Unset: the admin endpoints answer `404`. |
| `RETENTION_DAYS` | `180` | Days of data to keep (at least 1). |
| `RATE_PER_MIN` | `1200` | Requests per minute per client address (token bucket, bursts up to the same number). Generous because a whole school lab shares one NAT address. `0` turns the limit off. |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the server. With `1`, the client address for the rate limit is the last `X-Forwarded-For` entry (the one your proxy wrote); with `0` it is the socket address, so all traffic through a proxy shares one bucket. |

The server refuses to start on a malformed origin, a short admin token or a bad number.

## Deploying

The server speaks plain HTTP. **Always run it behind a TLS reverse proxy**: the portal
only sends to `https://` URLs, and GitHub Pages is served over HTTPS. Configure the proxy
**not to log client IP addresses**, and keep request bodies out of its logs.

### Docker

```sh
docker build -t school-games-telemetry server/
docker run -d --name sg-telemetry --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v sg-telemetry:/data \
  -e ALLOWED_ORIGINS=https://name.github.io -e TRUST_PROXY=1 \
  -e ADMIN_TOKEN="$(cat /etc/sg-telemetry/admin-token)" \
  school-games-telemetry
```

The image runs as the unprivileged `node` user, stores the database in the `/data`
volume and has a health check on `/v1/health`.

### A small VM with systemd

Copy the `server/` folder to `/opt/sg-telemetry` and install Node 22.13 or newer (for
example from nodejs.org or NodeSource). Then `/etc/systemd/system/sg-telemetry.service`:

```ini
[Unit]
Description=School games telemetry ingest
After=network-online.target

[Service]
ExecStart=/usr/bin/node /opt/sg-telemetry/main.mjs
Environment=HOST=127.0.0.1 PORT=8787 TRUST_PROXY=1 DB_PATH=/var/lib/sg-telemetry/telemetry.db
Environment=ALLOWED_ORIGINS=https://name.github.io
# ADMIN_TOKEN=... (chmod 600)
EnvironmentFile=/etc/sg-telemetry.env
DynamicUser=yes
StateDirectory=sg-telemetry
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`systemctl enable --now sg-telemetry`. The journal receives only the server's own
lines, which never contain addresses.

**Caddy** (automatic HTTPS; Caddy writes no access log unless you add a `log` directive):

```
telemetry.example.org {
	request_body {
		max_size 64KB
	}
	reverse_proxy 127.0.0.1:8787
}
```

**nginx:**

```nginx
server {
    listen 443 ssl;
    server_name telemetry.example.org;
    ssl_certificate     /etc/letsencrypt/live/telemetry.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/telemetry.example.org/privkey.pem;
    access_log off;                 # never log children's IP addresses
    error_log /var/log/nginx/telemetry.error.log crit;  # lower levels include the client address
    client_max_body_size 64k;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header X-Forwarded-For $remote_addr;  # replaces any client-supplied value
    }
}
```

### Any other Node host

Any platform that runs `node main.mjs` (or `npm start` in `server/`, whose
`package.json` declares the Node version) with Node 22.13+, gives it a persistent disk
for `DB_PATH` and terminates TLS works (one instance: SQLite is a single file). Check
that the platform's request logs can be configured without client IPs, or turned off.

## Pointing the portal at the server

The source tree never contains a URL. The fast build (`tools/build.mjs`) reads the
**`SG_TELEMETRY_URL`** environment variable and injects it into the portal as
`window.SG_TELEMETRY.url`; the portal's sink (`js/telemetry.js`) is the only code that
uses it. It must start with `https://`. Use the batch endpoint, for example
`https://telemetry.example.org/v1/batch`.

* **GitHub Pages:** in the repository, *Settings → Secrets and variables → Actions →
  Variables → New repository variable*, name `SG_TELEMETRY_URL`. The Pages workflow
  passes it to the build; delete the variable and rebuild to switch telemetry off.
* **A local build:** `SG_TELEMETRY_URL=https://telemetry.example.org/v1/batch node tools/build.mjs`.
* Add the site's origin (e.g. `https://name.github.io`) to `ALLOWED_ORIGINS`.

## API

Every response has `Vary: Origin`, `Cache-Control: no-store` and, for an origin in
`ALLOWED_ORIGINS`, `Access-Control-Allow-Origin: <that origin>`. Credentials are never
allowed. Error bodies are `{"error": "<short reason>"}` and never echo the request.
Every request (including `OPTIONS` and health checks) takes a token from the client's
rate-limit bucket; an empty bucket answers `429` with `Retry-After` in seconds.

### `POST /v1/batch`

The body is the telemetry envelope as JSON, sent as `text/plain` (a CORS "simple
request" without a preflight, also what `navigator.sendBeacon` sends) or
`application/json`. See `fixtures/sample-batch.json` and `docs/ARCHITECTURE.md`.

| Status | When |
|---|---|
| `204` | Stored, or a batch id already received (repeats are answered the same, so the client drops them). Unknown event kinds and malformed events are dropped silently; the rest of the batch is kept. |
| `400` | Not JSON, or an invalid envelope: `v` is not `2`; `b` is not 16 lowercase hex; `s` is not 12 lowercase hex; `k` is not `src` or 6–40 lowercase hex; `m` is not `web`/`app`; `a` is not `6-7`/`8-9`/`10-11`/`''`; `d` is not `[cores, memoryGB, screenWidth]` from the bucket lists; `ev` is not an array of at most 200 entries. |
| `403` | The request has an `Origin` header that is not in `ALLOWED_ORIGINS`. Requests without `Origin` (tools, `simulate.mjs`) are accepted. |
| `413` | The body is over 64 KB (65,536 bytes). |
| `415` | Another content type. |
| `429` | Rate limited. |

Event validation (exact length; every field must pass):

| Event | Fields after the kind |
|---|---|
| `ss` | `t`, isNew `0`/`1`, profile age `0`–`3`, days since last `0`–`4`, level ≥ 0 |
| `go` | `t`, slug, source (`featured catalog recent favorites category quick search related surprise reload history direct starter`), plays before `0`–`4` |
| `ld` | `t`, slug, load ms |
| `er` | `t`, slug, kind `t`/`x`/`l` |
| `rs` | `t`, slug, round id, tier `0`–`9`, replay index |
| `re` | `t`, slug, code `w`/`l`/`d`/`e`/`q`, round id, ms, score (`-1` or ≥ 0), tier `0`–`9`, hits, misses, `rt[6]` |
| `gx` | `t`, slug, engaged ms, `il[6]`, `f[4]` |
| `lv` | `t`, level ≥ 1 |
| `se` | `t`, engaged ms |

Slugs match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (at most 40 characters); round ids match
`^[A-Za-z][A-Za-z0-9_:.-]{0,23}$` without three digits in a row. Neither may be a
built-in object key such as `constructor`. Enumerations, flags, buckets and tiers must
be exact integers. Measured numbers (`t`, ms, counts, scores, levels, histogram
entries) must be finite and not negative; they are rounded and clamped to: `t` 7 days
in seconds, level 999, load 120,000 ms, replay index 9,999, round 3 h, score 10⁹,
hits/misses/`rt`/`il` entries 100,000, each frame bucket 10⁷, game visit 6 h, session 24 h.

### `OPTIONS *`

`204`. For an allowed origin also `Access-Control-Allow-Methods: GET, HEAD, POST,
OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization` and
`Access-Control-Max-Age: 86400` (the dashboard's admin calls need the preflight).

### `GET /v1/health`

`200 {"ok": true}`.

### Admin endpoints

`GET /v1/admin/kpis` and `GET /v1/admin/live` need `Authorization: Bearer $ADMIN_TOKEN`
(compared in constant time). Without a valid token: `401` with
`WWW-Authenticate: Bearer`. With `ADMIN_TOKEN` unset: `404`.

#### `GET /v1/admin/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD&band=6-7`

Receipt days `from`..`to` (UTC, inclusive, at most 366 days; default: the 30 days
ending today). `band` is `all` (default), `6-7`, `8-9`, `10-11` or `unknown`.
Invalid parameters: `400`.

Conventions:

* A **group** is an object with its key fields and `sessions`, the number of distinct
  sessions in it (for games this is the brief's "unique sessions"). A group with 1 or
  2 sessions is only `{ <key fields>, "suppressed": true }`; a group with 0 sessions
  keeps its zeros. Check `suppressed` before reading numbers.
* Rates and shares are 0..1 with 4 decimals and `null` when the denominator is 0.
  Minutes have 1 decimal (`avgEngagedMinutesPerSession` 2), seconds 1, tiers 2,
  milliseconds are whole.
* Days are receipt days: a batch kept offline and delivered later counts on the day it
  arrived. Engaged time comes from game-close (`gx`) events; a visit that never closed
  adds rounds but no engaged time.
* Histograms: `rt` reaction time `<300, <500, <800, <1200, <2000, ≥2000` ms; `il` input
  latency `<8, <16, <33, <50, <100, ≥100` ms; frames `smooth ≤20, ok ≤34, choppy ≤250,
  stall >250` ms; `replayIndex` `0, 1, 2, 3–4, 5–9, 10+` prior starts of the same round
  in the session; `playsBefore` `0, 1, 2–4, 5–9, 10+` visits before; `profileAge` new,
  1–6, 7–29, 30+ days; `daysSinceLast` same day, 1, 2–6, 7+, first time.
* Round codes: `w` win, `l` loss, `d` draw, `e` neutral end (endless runs, two-player
  modes), `q` quit. Endless games end with `e`, so their completion rate is 0 and
  their win rate `null`: read `rounds.codes` and `dropOffRate` for them.

```jsonc
{
  "v": 1,
  "range": { "from": "2026-10-01", "to": "2026-10-26", "days": 26, "band": "all" },  // band: all | 6-7 | 8-9 | 10-11 | unknown
  "minSessions": 3,
  "totals": {                                  // or { "suppressed": true }
    "sessions": 2560,                          // distinct sessions with a stored event
    "engagedMinutes": 22692.6,                 // sum of gx engaged ms
    "avgEngagedMinutesPerSession": 8.86,
    "gameOpens": 6419, "roundsStarted": 27938, "roundsEnded": 27938, "levelUps": 2580, "errors": 147,
    "players": {                               // from session-start events
      "sessionStarts": 2560, "newProfiles": 283, "guests": 531,   // guests: level 0
      "profileAge": [814, 554, 577, 615],
      "daysSinceLast": [432, 439, 462, 413, 814]
    }
  },
  "daily": [                                   // every day of the range, oldest first
    { "day": "2026-10-23", "sessions": 120, "engagedMinutes": 1117.5, "opens": 320 },
    { "day": "2026-10-24", "suppressed": true }
  ],
  "games": [                                   // sorted by slug
    {
      "slug": "bubble-bop", "sessions": 469,
      "opens": 493, "closes": 493, "engagedMinutes": 766.7,
      "avgEngagedSecPerOpen": 93.3,            // engaged seconds per closed visit
      "rounds": { "starts": 2073, "ends": 2073, "codes": { "w": 1596, "l": 243, "d": 0, "e": 0, "q": 234 } },
      "completionRate": 0.7699,                // wins / starts
      "winRate": 0.8679,                       // wins / (wins + losses)
      "dropOffRate": 0.1129,                   // quits / starts
      "avgTier": 2.78,                         // mean start tier of rounds with DDA (tier > 0), else null
      "hits": 27759, "misses": 11294, "accuracy": 0.7108,          // hits / (hits + misses)
      "rt": [5560, 8057, 6990, 4109, 2033, 1010],
      "il": [18098, 12339, 5194, 1811, 1047, 564],
      "frames": { "counts": [2374001, 232663, 58174, 3136], "smoothShare": 0.8898, "stallShare": 0.0012 },
      "loads": 481, "avgLoadMs": 940,
      "errors": { "t": 5, "x": 4, "l": 3 },    // timeout, script error, load error
      "sources": { "featured": 40, "catalog": 73, "starter": 283 },  // opens per launch source (non-zero only)
      "replay": { "replayIndex": [1632, 327, 76, 35, 3, 0], "playsBefore": [379, 26, 27, 32, 29] }
    },
    { "slug": "tank-splat", "suppressed": true }
  ],
  "levels": [                                  // per (slug, round id), sorted by slug then id (L2 before L10)
    { "slug": "air-hockey", "id": "L1", "sessions": 126, "starts": 248, "ends": 248,
      "codes": { "w": 111, "l": 107, "d": 0, "e": 0, "q": 30 },
      "completionRate": 0.4476, "winRate": 0.5092, "dropOffRate": 0.121, "avgMs": 78585, "avgTier": null },
    { "slug": "air-hockey", "id": "L9", "suppressed": true }
  ],
  "bands": [                                   // 6-7, 8-9, 10-11, unknown (those with sessions)
    { "band": "6-7", "sessions": 739, "opens": 1825, "engagedMinutes": 5120.4,
      "games": [                               // age-band preferences, sorted by slug
        { "slug": "bubble-bop", "sessions": 136, "opens": 143,
          "share": 0.0784,                     // this game's share of the band's opens
          "avgTier": 1.48, "completionRate": 0.6432 },
        { "slug": "dino-3d", "suppressed": true }
      ] },
    { "band": "unknown", "suppressed": true }
  ],
  "sources": [                                 // launch sources over all games, in the contract's order
    { "src": "featured", "sessions": 1013, "opens": 1242 },
    { "src": "history", "suppressed": true }
  ],
  "devices": {                                 // each dimension separately, sorted by value
    "cores":  [ { "value": 2, "sessions": 617,
                  "frames": { "counts": [15436271, 2715746, 676173, 35793], "smoothShare": 0.8183, "stallShare": 0.0019 },
                  "il": [75877, 88713, 50563, 20262, 12608, 5099], "avgLoadMs": 1757 } ],
    "memory": [ { "value": 0, "suppressed": true } ],
    "screen": [ ... ]
  },
  "modes": [ { "mode": "web", "sessions": 2180 }, { "mode": "app", "sessions": 380 } ]  // app = installed PWA
}
```

#### `GET /v1/admin/live`

Sessions whose last batch arrived in the last 5 minutes, and the game each one has open
(opened with `go` and not yet closed with `gx`; `se` closes everything). Kept in memory:
it starts empty after a restart, and a batch delivered late from a PC's offline queue
counts as a sign of life when it arrives.

```json
{ "v": 1, "windowSec": 300, "minSessions": 3,
  "total": { "sessions": 80 },
  "games": [ { "slug": "dino-3d", "sessions": 3 }, { "slug": "block-burst", "suppressed": true } ] }
```

## Operations

* **Backup.** The database is one file plus its write-ahead log. Take a consistent copy
  while the server runs with SQLite's `VACUUM INTO`, for example nightly from cron:
  `sqlite3 /var/lib/sg-telemetry/telemetry.db "VACUUM INTO '/backups/telemetry-$(date +%F).db'"`,
  or without the `sqlite3` tool:
  `node --no-warnings -e "new (require('node:sqlite').DatabaseSync)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\")" telemetry.db backup.db`.
  Keep backups no longer than `RETENTION_DAYS` (they are copies of the same data) and
  encrypt them at rest. To restore, stop the server and replace the file (delete stale
  `-wal`/`-shm` files).
* **Retention.** Rows are deleted by receipt day when the server starts and every
  24 hours; batch ids after 30 days. Lowering `RETENTION_DAYS` takes effect at the next
  start. To erase everything, stop the server and delete the database files.
* **Monitoring.** `GET /v1/health`. The process exits when it cannot start (port in
  use, unreadable database), so the supervisor (Docker, systemd) reports or restarts it.
* **Upgrades.** The schema version is stored in SQLite's `user_version`; a server
  refuses a database newer than itself.
* **Size.** About 3.5 KB per session (about 40 rows with indexes), so 1,000 sessions a
  day kept for 180 days is about 0.6 GB. A KPI query over 28 days with 2,500 sessions
  (110,000 rows) takes 0.3–0.5 s on a busy 4-CPU machine; the time grows with the rows
  in the range, so a dashboard should cache results rather than poll the KPIs.

### Storage

`batches (b, day)` for de-duplication; `session_days (s, day, hour, a, m, k, cores, mem,
screen)` with the envelope's buckets for each session and receipt day; `session_games
(day, slug, s, a)` and `session_levels (day, slug, id, s, a)`, derived at insert so the
small-group gates count distinct sessions cheaply; and one table per event kind, `ev_ss`, `ev_go`, `ev_ld`, `ev_er`, `ev_rs`, `ev_re`, `ev_gx`, `ev_lv`,
`ev_se`, each with `s, day, hour, a, t` and the event's fields (histograms as numbered
columns, e.g. `rt0`..`rt5`). There are no other columns.

## Development

* Tests: `node --test --test-reporter=spec tools/tests/telemetry-server.test.mjs`
  (in-process server on port 0, temporary database, injected clock; about 2 s).
* Synthetic data for the dashboard: `node server/simulate.mjs --url http://127.0.0.1:8787`
  posts deterministic sessions (same `--seed`, same batch ids, so a repeat adds nothing);
  `node server/simulate.mjs --db server/data/dev.db --days 28` writes four weeks of
  history straight into a file. Every generated batch passes `schema.mjs`.

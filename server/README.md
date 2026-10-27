# Play statistics server and insights dashboard

This folder is a small service that receives play statistics **without names** from the
games portal (the portal's telemetry sink, `js/telemetry.js`; see
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md), "Telemetry sink", "Milestone 2" and
"Milestone 2.5"), keeps them row by row under random codes (one per child's profile,
one per PC), and shows them on the insights dashboard at its own address.

It runs in one of two places, with the same code:

* **Cloudflare (recommended):** a free Cloudflare Worker with a free D1 database. One
  button sets it up; nothing to install, nothing to keep running.
* **Your own computer or server (Node):** `node main.mjs` with one SQLite file. See
  [Self-hosting on Node](#self-hosting-on-node).

The portal sends nothing until its fast build is given this server's address, so the
site works exactly as before without it.

## Turn on data collection (about 5 minutes, no code)

You need: an email address, your GitHub account (the one that holds the games site), and
a web browser. Everything below is free.

1. **Click this button:**

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/FarmerCarry/school-games/tree/main/server)

2. **Sign up or sign in to Cloudflare.** If you have no Cloudflare account, choose
   *Sign up*, type your email address and a password of your choice, and open the
   confirmation email Cloudflare sends you. The free plan is all you need: if Cloudflare
   offers a paid plan, skip it.
3. **Connect GitHub when Cloudflare asks.** Click *Connect GitHub* (or *GitHub*), sign in
   to GitHub if asked, and allow Cloudflare. The button makes a **copy of this server in
   your own GitHub account** (a new repository, usually named `school-games-telemetry`),
   and Cloudflare runs that copy. This is normal and expected.
4. **Keep the suggested names.** Leave the project name `school-games-telemetry` and the
   database name `school-games-telemetry` as they are.
5. **Type a dashboard password** in the box named **`ADMIN_TOKEN`**. Make one up: **at
   least 16 English letters or digits, with no spaces** (for example
   `GreenTiger42Window7Lamp`, but make up your own). **Write it down on paper now.**
   You type it to open the dashboard, and Cloudflare keeps it secret: it cannot show it
   to you again later (you can only replace it, see below). If you see no box with that
   name, go on without it and add the password afterwards (see *Changing or setting the
   password later* below).
6. **Press *Create and deploy*** (it may just say *Deploy*).
7. **Wait** one to three minutes, until Cloudflare says the deployment succeeded. If
   Cloudflare first asks you to choose a *workers.dev* name (a subdomain), type a short
   name in English letters, for example your school's name: it becomes part of the address.
8. **Copy the address** it shows. It looks like
   `https://school-games-telemetry.<your-name>.workers.dev`. Send that address to the
   developer (an email or a chat message is fine). The developer then switches the games
   site on, and children's PCs start sending statistics (without names).
9. **Open that address** in your browser to see the dashboard, and sign in with the
   password from step 5. Until children play, there is nothing to show; add `/?demo` to
   the address to see the dashboard with made-up sample data.

**It is free for a school.** Cloudflare's free plan allows 100,000 requests to the
server per day (a PC sends one about every game played; 120 play sessions send about
300; the server's own clean-up every 5 minutes adds about 300), and its free D1 database
allows 500 MB per database, 5 million rows read and 100,000 rows written per day. A
busy school (500 play sessions a day) writes about a third of the daily allowance and
keeps about 220 MB after a year. The server counts its own use, and when a day's writes
run high it asks the PCs to send less often (the `X-Batch-Every` answer header).
If a limit were ever reached, the server stops answering until midnight UTC: nothing is
charged (the free plan has no bill), and the PCs keep their statistics for up to 7 days
and send them later.

**Changing or setting the password later:** on [dash.cloudflare.com](https://dash.cloudflare.com),
open *Workers & Pages*, then `school-games-telemetry`, then *Settings*, then *Variables and
Secrets*. Edit `ADMIN_TOKEN` (or add it, type *Secret*), type the new password and press
*Deploy*. A password shorter than 16 characters, or one with a space, does not count:
the dashboard then says that the password was not set (the statistics are still
collected), and you set a longer one here.

## Before you turn it on

The players are **children aged 6 to 11**. No names are collected, but each child's play
is kept under a random code, so these records are **pseudonymous personal data** under
GDPR-style rules (the GDPR, the UK GDPR and its Children's Code; COPPA and FERPA notions
in the United States): tell parents before collection starts, give your privacy
reviewers the section "What is collected and kept" below, and check whether publishing
research from it needs consent or an ethics review. A PC sends nothing while a teacher
has stopped statistics on it (the teacher page), and browsers that send Global Privacy
Control never send anything.

## Files

| File | What it does |
|---|---|
| `worker.mjs` | Cloudflare entry: `fetch` (the handler on the D1 database `env.DB`, the dashboard from `env.ASSETS`) and `scheduled` (the daily purge, and the sweep of the live rows every 5 minutes). |
| `wrangler.json` | The Worker's settings: D1 binding `DB`, static assets `./dashboard`, two crons (the daily purge, and every 5 minutes the sweep of the live rows), `ALLOWED_ORIGINS` and `RETENTION_DAYS`, request logs (observability) off. |
| `package.json`, `package-lock.json` | Wrangler 4.149.0 for deploying (a development tool only), the plain-English descriptions the Deploy button shows, `npm start` for Node. |
| `.dev.vars.example` | Tells the Deploy button to ask for the `ADMIN_TOKEN` secret (empty on purpose). |
| `handler.mjs` | The HTTP rules as a Fetch-API handler, shared by both hosts: routes, CORS, the soft rate limit, body limits, admin password, status codes. |
| `store.mjs` | The facts (sessions, game visits, rounds, marks, students, PCs) over a D1-style SQL driver; creates and upgrades its tables itself, one version step at a time; KPIs, live sessions, retention, the usage meter. |
| `schema.mjs` | Validation of the envelope (wire versions 2 and 3) and every event kind; cleans and clamps. |
| `clock.mjs` | The school's clock: UTC offsets, local days and the exact bounds of a local day in an IANA zone, from `Intl` alone. |
| `sqlite-d1.mjs` | A D1-style driver over Node's built-in `node:sqlite`, for the Node host and the tests. |
| `app.mjs`, `main.mjs` | The Node host: `node:http` in front of the handler, settings from the environment, a purge every 24 hours. |
| `static.mjs` | The Node host's static file server for `dashboard/`, with the headers of `dashboard/_headers`. |
| `dashboard/` | The insights dashboard (static files), served at `/` by both hosts. `_headers` gives every page a strict Content-Security-Policy. |
| `warnings.mjs` | Hides Node 22's one `node:sqlite` ExperimentalWarning (and nothing else). |
| `simulate.mjs` | Deterministic synthetic sessions for dashboard development and tests. |
| `fixtures/sample-batch.json`, `fixtures/sample-batch-v3.json` | A valid v2 and a valid v3 envelope, each with every event kind of its version (shared with the portal's tests). |
| `Dockerfile` | A minimal `node:22-alpine` image of the Node host. |

The folder is self-contained (it imports nothing from outside it), because the Deploy
button copies only this folder into a new repository.

## What is collected and kept

What can be stored is decided here, not only by what the portal chooses to send.

* **No names, nothing a child types.** The contract has no field for a name, typed
  text, error text, a PC label, a profile key, an avatar or colour, a user-agent or a
  GPU string. The server validates every field against closed lists and patterns
  (`schema.mjs`) and drops anything else: unknown envelope fields are ignored, an event
  with an extra or a malformed field is dropped whole, and round ids that could be typed
  text (three digits in a row, spaces, more than 24 characters) are refused.
* **Random codes, so pseudonymous.** A batch of wire version 3 carries a random code for
  the child's profile (`u`: 12 lowercase hex, or a player card's `c` and 4 hex) and one
  for the PC (`p`: 12 hex), made on the PC and never derived from anything about the
  child, and the PC's zone name (such as `Asia/Riyadh`). A value of any other form is
  stored as unknown (`''`), never as sent. Guests send no code. Because the codes keep
  one child's play together over time, these records are pseudonymous personal data.
* **Play is kept row by row.** Each play session, game visit, round and mark (a level-up,
  a heart, a tutorial step, the classroom timer, a removed profile, an older code of the
  same child) is a row of the facts, with the session's code and PC code. A student row
  holds the code, a label (its first 4 to 12 characters, as the dashboard shows it), the
  age band, the first and last play and the profile's age in days. Older v2 batches are
  stored the same way, with no codes.
* **No IP addresses and no headers are stored or logged.** The client address
  (`CF-Connecting-IP` on Cloudflare, the socket address or a trusted `X-Forwarded-For`
  hop on Node) is only a key of the in-memory rate limiter and is forgotten once its
  bucket has refilled. Requests and request bodies are never logged. On Cloudflare,
  Workers observability (stored request logs, which would hold IP addresses) is
  **off** in `wrangler.json`; keep it off. The only log lines are start-up and purge
  counts (Node) and internal error messages.
* **No wall-clock times from the client.** Events carry seconds since the session
  started, and a v3 batch the seconds from the session's start to its sending (`w`).
  The server dates the session by its own clock at receipt minus `w` (for v2: minus the
  batch's last event time and 10 seconds), so a PC whose clock is wrong still dates its
  play correctly; days and hours follow the school's zone.
* **Coarse buckets.** Devices are reported as cores (1, 2, 4, 8, 16), memory in GB
  (0, 1, 2, 4, 8) and screen width (1366, 1600, 1920, 2560); age as a band (6-7, 8-9,
  10-11 or unknown); reaction times, input latency and frame times as fixed histograms.
* **Small groups in the KPI answers.** `/v1/admin/kpis` and `/v1/admin/live` still report
  a group with fewer than **3 distinct sessions** as `{ ..., "suppressed": true }`.
* **Retention.** The daily purge (Cloudflare: a cron at 03:23 UTC; Node: at start and
  every 24 hours) deletes the frozen daily totals of milestone 2 older than
  `RETENTION_DAYS` (default 180), batch ids after 30 days and the server's usage counts
  after 60 days; live rows go by a sweep every 5 minutes (Node: every minute). The facts
  are not purged by this version yet. On Node, SQLite's `secure_delete` overwrites
  deleted rows and the write-ahead log is truncated after each purge.

## Self-hosting on Node

Node 22.13 or newer (where `node:sqlite` needs no flag); no `npm install` and no
runtime dependencies.

```sh
export ADMIN_TOKEN=$(openssl rand -hex 24)
node server/main.mjs &
# telemetry: listening on port 8787; 0 allowed origin(s), admin on, ...
curl -s localhost:8787/v1/health                    # {"ok":true,"accepts":[2,3],"schema":4}
node server/simulate.mjs --sessions 200             # synthetic sessions (today)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" localhost:8787/v1/admin/kpis
# the dashboard: http://localhost:8787/
```

The default database is `server/data/telemetry.db` (ignored by Git).

### Configuration

All settings are environment variables.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | TCP port. `0` picks a free one (printed at start). |
| `HOST` | all interfaces | Bind address. Use `127.0.0.1` behind a reverse proxy on the same machine. |
| `DB_PATH` | `server/data/telemetry.db` | SQLite file (created with its folder). Also writes `-wal` and `-shm` files next to it. |
| `ALLOWED_ORIGINS` | none | Comma-separated origins of the portal, e.g. `https://name.github.io` (an origin has no path and no trailing slash, even when the site lives at `/school-games/`). Browser requests from any other origin get no CORS header and `POST /v1/batch` answers `403`. The literal `null` (pages from `file:` or sandboxed frames) is accepted only if listed; the portal never sends from `file:`. |
| `ADMIN_TOKEN` | none | The dashboard password: the bearer token for `/v1/admin/*`, at least 16 printable ASCII characters without spaces (use `openssl rand -hex 24`). Unset: the admin endpoints answer `404`. |
| `RETENTION_DAYS` | `180` | Days of data to keep (1 to 36,500). |
| `RATE_PER_MIN` | `1200` | Requests per minute per client address (token bucket, bursts up to the same number). Generous because a whole school lab shares one NAT address. `0` turns the limit off. |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the server. With `1`, the client address for the rate limit is the last `X-Forwarded-For` entry (the one your proxy wrote); with `0` it is the socket address, so all traffic through a proxy shares one bucket. |

The server refuses to start on a malformed origin, a short admin token, a bad number,
or a database written by a newer version of the server.

On Cloudflare the same settings are `ALLOWED_ORIGINS` and `RETENTION_DAYS` (plain
variables in `wrangler.json`, default `https://farmercarry.github.io` and `180`),
`ADMIN_TOKEN` (a secret; an invalid one turns the admin endpoints off rather than
stopping the Worker) and the optional `RATE_PER_MIN` (the limit is per Worker
instance, so it is soft).

### Deploying

The Node host speaks plain HTTP. **Always run it behind a TLS reverse proxy**: the
portal only sends to `https://` URLs, and GitHub Pages is served over HTTPS. Configure
the proxy **not to log client IP addresses**, and keep request bodies out of its logs.

**Docker:**

```sh
docker build -t school-games-telemetry server/
docker run -d --name sg-telemetry --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v sg-telemetry:/data \
  -e ALLOWED_ORIGINS=https://name.github.io -e TRUST_PROXY=1 \
  -e ADMIN_TOKEN="$(cat /etc/sg-telemetry/admin-token)" \
  school-games-telemetry
```

The image runs as the unprivileged `node` user, stores the database in the `/data`
volume, serves the dashboard and has a health check on `/v1/health`.

**A small VM with systemd:** copy the `server/` folder to `/opt/sg-telemetry` and
install Node 22.13 or newer (for example from nodejs.org or NodeSource). Then
`/etc/systemd/system/sg-telemetry.service`:

```ini
[Unit]
Description=School games telemetry ingest
After=network-online.target

[Service]
ExecStart=/usr/bin/node /opt/sg-telemetry/main.mjs
Environment=HOST=127.0.0.1 PORT=8787 TRUST_PROXY=1 DB_PATH=/var/lib/sg-telemetry/telemetry.db
Environment=ALLOWED_ORIGINS=https://name.github.io
# The admin token, as the line ADMIN_TOKEN=... in a file only root can read (chmod 600).
# The leading "-" lets the service start without the file (admin endpoints off).
EnvironmentFile=-/etc/sg-telemetry.env
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

**Any other Node host** that runs `node main.mjs` (or `npm start` in `server/`) with Node
22.13+, gives it a persistent disk for `DB_PATH` and terminates TLS works (one instance:
SQLite is a single file). Check that the platform's request logs can be configured
without client IPs, or turned off.

## Pointing the portal at the server

The source tree never contains a URL. The fast build (`tools/build.mjs`) reads the
**`SG_TELEMETRY_URL`** environment variable and injects it into the portal as
`window.SG_TELEMETRY.url`; the portal's sink (`js/telemetry.js`) is the only code that
uses it. It must start with `https://` and name the batch endpoint: the Worker's
address plus `/v1/batch`, for example
`https://school-games-telemetry.name.workers.dev/v1/batch`.

* **This project:** `.github/workflows/build.yml` names the school's Worker,
  `https://school-games-telemetry.services-agreement137.workers.dev/v1/batch`; a `SG_TELEMETRY_URL`
  repository variable overrides it, and removing the address from the workflow switches
  the portal off.
* **GitHub Pages in general:** in the repository, *Settings → Secrets and variables →
  Actions → Variables → New repository variable*, name `SG_TELEMETRY_URL`; delete it and
  rebuild to switch telemetry off.
* **A local build:** `SG_TELEMETRY_URL=https://telemetry.example.org/v1/batch node tools/build.mjs`.
* `ALLOWED_ORIGINS` must list the site's origin (on Cloudflare it already lists
  `https://farmercarry.github.io`).

## API

Every API response (paths under `/v1/`) has `Vary: Origin`, `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff` and, for an origin in `ALLOWED_ORIGINS`,
`Access-Control-Allow-Origin: <that origin>` and `Access-Control-Expose-Headers:
Retry-After, X-Batch-Every`. Credentials are never allowed. Error bodies are `{"error": "<short
reason>"}` and never echo the request. Every request that reaches the server (including
`OPTIONS`, health checks and, on Node, dashboard files) takes a token from the client's
rate-limit bucket; an empty bucket answers `429` with `Retry-After` in seconds.

### `GET /` and other paths outside `/v1/`

The dashboard's static files from `dashboard/` (`GET` and `HEAD` only; anything else,
and missing files, are `404`). On Cloudflare, Workers static assets serve them; on Node,
`static.mjs` serves only regular files inside the folder (no dot files, no `_headers`,
no path outside it). Both send the headers in `dashboard/_headers`: a
Content-Security-Policy (`default-src 'self'`; scripts also from
`https://farmercarry.github.io` for the live game names), `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store` for the page.

### `POST /v1/batch`

The body is the telemetry envelope as JSON, sent as `text/plain` (a CORS "simple
request" without a preflight) or `application/json`. Wire version 2 (`"v": 2`, the
portal until milestone 2.5) and version 3 (`"v": 3`) are both accepted, version 2
indefinitely (queues of up to 7 days, cached portals). See
`fixtures/sample-batch.json`, `fixtures/sample-batch-v3.json`, `docs/ARCHITECTURE.md`
and `docs/RESEARCH_TELEMETRY_SPEC.md` ("Wire format v3").

| Status | When |
|---|---|
| `204` | Stored, or already stored: a repeated v2 batch id is answered the same, and a v3 batch delivered again changes nothing, so the client drops it. Unknown event kinds and malformed events are dropped silently; the rest of the batch is kept. The header `X-Batch-Every` gives the seconds the PC should wait between batches: `60` while the day's rows written are at most 60,000, `180` up to 80,000, `300` above. |
| `400` | Not JSON, or an invalid envelope: `v` is not `2` or `3`; `b` is not 16 lowercase hex; `s` is not 12 lowercase hex; `k` is not `src` or exactly 16 lowercase hex; `m` is not `web`/`app`; `a` is not `6-7`/`8-9`/`10-11`/`''`; `d` is not `[cores, memoryGB, screenWidth]` from the bucket lists; `ev` is not an array of at most 200 entries. |
| `403` | The request has an `Origin` header that is not in `ALLOWED_ORIGINS`. Requests without `Origin` (tools, `simulate.mjs`) are accepted. |
| `413` | The body is over 64 KB (65,536 bytes), declared or streamed. |
| `415` | Another content type. |
| `429` | Rate limited. |
| `503` | `{"error": "updating"}` with `Retry-After: 2`: this request created or upgraded the database (one version step) and did nothing else. The portal sends the batch again. Only on Cloudflare: the Node host upgrades at start. |

The fields version 3 adds to the envelope are lenient, because the portal drops a batch
for good on any `4xx`: a malformed value is stored as unknown and the batch is kept.

| Field | Accepted | Otherwise |
|---|---|---|
| `u` | a student code: 12 lowercase hex, or `c` and 4 lowercase hex (a player card); `''` for a guest | `''` |
| `p` | a PC code: 12 lowercase hex, or `''` | `''` |
| `z` | an IANA zone this server knows (or `UTC`), at most 40 characters | `''` |
| `w` | a whole number of seconds from 0 to 691,200 (8 days): the session's age when the batch was sent | `null` (the session is dated from the receipt time) |

Event validation (exact length; every field must pass):

| Event | v2 fields after the kind | v3 fields after the kind |
|---|---|---|
| `ss` | `t`, isNew `0`/`1`, profile age `0`–`3`, days since last `0`–`4`, level ≥ 0 | `t`, isNew, profile age in days and days since the last play (`-1`–`36500`), level, profiles on the PC (≤ 99), classroom mode `0`/`1` |
| `go` | `t`, slug, source (`featured catalog recent favorites category quick search related surprise reload history direct starter`), plays before `0`–`4` | `t`, visit `n` (`1`–`9999`), slug, source, plays before (≤ 10⁶), favourite `0`/`1` |
| `ld` | `t`, slug, load ms | `t`, `n`, slug, load ms |
| `er` | `t`, slug, kind `t`/`x`/`l` | `t`, `n`, slug, kind |
| `rs` | `t`, slug, round id, tier `0`–`9`, replay index | `t`, `n`, round `k` (`1`–`99999`), slug, round id, tier, replay index |
| `re` | `t`, slug, code `w`/`l`/`d`/`e`/`q`, round id, ms, score (`-1` or ≥ 0), tier `0`–`9`, hits, misses, `rt[6]` | `t`, `n`, `k`, slug, then as v2, then `x`: `null` or `[wallMs, inputs, idleLapses, pauses, rtSumMs, rtN, ddaPermille]` (lenient: anything else is `null` and the round is kept) |
| `gp` | | `t`, `n`, slug, engaged ms so far |
| `gx` | `t`, slug, engaged ms, `il[6]`, `f[4]` | `t`, `n`, slug, engaged ms, `il[6]`, `f[4]` |
| `tu` | | `t`, `n`, slug, tutorial step `s`/`d` |
| `fv` | | `t`, `n`, slug, heart on `1` or off `0` |
| `ct` | | `t`, classroom timer `s`/`c`/`e`, minutes (≤ 120) |
| `lv` | `t`, level ≥ 1 | the same |
| `pr` | | `t`, the code of a profile removed on this PC |
| `cd` | | `t`, an older code of this student (linked to `u`) |
| `se` | `t`, engaged ms | `t`, engaged ms, why the session ended `u`/`p`/`h`/`i` |

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
`Access-Control-Max-Age: 86400`.

### `GET /v1/health`

`200 {"ok": true, "accepts": [2, 3], "schema": 4}`: the wire versions this server takes
and its database schema. It never touches the database, so it is the check to make
before a portal that sends version 3 is published.

### Admin endpoints

`GET /v1/admin/kpis` and `GET /v1/admin/live` need `Authorization: Bearer <ADMIN_TOKEN>`
(compared in constant time). Without a valid token: `401` with
`WWW-Authenticate: Bearer`. With no valid `ADMIN_TOKEN` set: `404
{"error": "admin password not set"}` (the dashboard shows this as "the password was
not set"). The request that upgrades the database answers `503` as for batches.

#### `GET /v1/admin/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD&band=6-7`

Days `from`..`to` (inclusive, at most 366 days; default: the 30 days ending today on the
school's clock). Days up to the update to schema 4 (`legacy_until`) are the frozen UTC
receipt days of milestone 2; days from `facts_since` on are the school's local days. On
the one day both cover, both add up. `band` is `all` (default), `6-7`, `8-9`, `10-11`
or `unknown`. Invalid parameters: `400`.

Conventions:

* A **group** is an object with its key fields and `sessions`, the number of distinct
  sessions in it (for games this is the brief's "unique sessions"). A group with 1 or
  2 sessions is only `{ <key fields>, "suppressed": true }`; a group with 0 sessions
  and nothing stored keeps its zeros. Check `suppressed` before reading numbers.
* **A session counts once, on the day it started** (on the school's clock), with
  everything it did; a range's sessions are the sum of its days' sessions.
* Rates and shares are 0..1 with 4 decimals and `null` when the denominator is 0.
  Minutes have 1 decimal (`avgEngagedMinutesPerSession` 2), seconds 1, tiers 2,
  milliseconds are whole.
* A batch kept offline and delivered later counts on the day it was played. Engaged
  time is each game visit's: from its close (`gx`) and, for v3, also from the running
  time (`gp`) of a visit that never closed.
* Histograms: `rt` reaction time `<300, <500, <800, <1200, <2000, ≥2000` ms; `il` input
  latency `<8, <16, <33, <50, <100, ≥100` ms; frames `smooth ≤20, ok ≤34, choppy ≤250,
  stall >250` ms; `replayIndex` `0, 1, 2, 3–4, 5–9, 10+` prior starts of the same round
  in the session; `playsBefore` `0, 1, 2–4, 5–9, 10+` visits before; `profileAge` new,
  1–6, 7–29, 30+ days; `daysSinceLast` same day, 1, 2–6, 7+, first time.
* Round codes: `w` win, `l` loss, `d` draw, `e` neutral end (endless runs, two-player
  modes), `q` quit. Endless games end with `e`, so their completion rate is 0 and
  their win rate `null`: read `rounds.codes` and `dropOffRate` for them.
* A device bucket and an age band count a session under its first batch's.

```jsonc
{
  "v": 1,
  "range": { "from": "2026-10-01", "to": "2026-10-26", "days": 26, "band": "all" },  // band: all | 6-7 | 8-9 | 10-11 | unknown
  "minSessions": 3,
  "totals": {                                  // or { "suppressed": true }
    "sessions": 2560,                          // distinct sessions with a stored event, per day
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
          "avgTier": 1.48, "completionRate": 0.6432,
          "winRate": 0.8411, "dropOffRate": 0.1203, "engagedMinutes": 210.4, "starts": 812 },  // added in milestone 2
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

Sessions whose last batch arrived in the current minute or the four before it (300 s
at minute resolution), and the game each one has open (opened with `go` and not yet
closed with `gx`; `se` closes everything; a session forgotten after 5 quiet minutes has
nothing open). A batch delivered late from a PC's offline queue counts as a sign of
life when it arrives; a repeated batch does not.

```json
{ "v": 1, "windowSec": 300, "minSessions": 3,
  "total": { "sessions": 80 },
  "games": [ { "slug": "dino-3d", "sessions": 3 }, { "slug": "block-burst", "suppressed": true } ] }
```

## Operations

* **Backup.** Cloudflare: D1 can restore the database to any minute of the last 7 days
  on the free plan (*Time Travel*). Node: the
  database is one file plus its write-ahead log; take a consistent copy while the server
  runs with SQLite's `VACUUM INTO`, for example nightly from cron:
  `sqlite3 /var/lib/sg-telemetry/telemetry.db "VACUUM INTO '/backups/telemetry-$(date +%F).db'"`,
  or without the `sqlite3` tool:
  `node --no-warnings -e "new (require('node:sqlite').DatabaseSync)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\")" telemetry.db backup.db`.
  Keep backups no longer than `RETENTION_DAYS` (they are copies of the same data) and
  encrypt them at rest. To restore, stop the server and replace the file (delete stale
  `-wal`/`-shm` files).
* **Retention.** The frozen daily totals of milestone 2 are deleted by receipt day by
  the daily purge; batch ids after 30 days, the usage counts after 60 days, the kept KPI
  rows (`kpi_cache`) at every daily purge, and live rows once they leave the 5-minute
  window (by the next batch or live query, and by a sweep every 5 minutes on Cloudflare
  and every minute on Node, so within 10 minutes even with no traffic). The facts are
  not purged by this version yet. Lowering `RETENTION_DAYS` takes effect at the next
  purge (Node: the next start). To erase everything on Node, stop the server and
  delete the database files; on Cloudflare, delete the Worker and its D1 database
  `school-games-telemetry` in the Cloudflare dashboard.
* **Monitoring.** `GET /v1/health`. The Node process exits when it cannot start (port in
  use, unreadable database), so the supervisor (Docker, systemd) reports or restarts it.
  On Cloudflare, the Worker's *Metrics* tab shows requests and errors without logs.
* **Upgrades.** The store creates and upgrades its tables itself (`CREATE TABLE IF NOT
  EXISTS`, the schema version in the `meta` table), so a deploy has no migration step.
  It goes one version step per request: on Cloudflare the first request after a deploy
  that needs a step does only that step and is answered `503` with `Retry-After: 2` (a
  daily or 5-minute cron that meets it does nothing else either); the Node host takes
  every step at start. Schema 3 (milestone 2) becomes schema 4 in one step: the facts,
  settings and rollup tables are added, `seen` is dropped, `live` is made again with the
  codes, and the daily totals stay, read only, for the days up to the update. A database
  of the first server (one table per event kind) is folded into the daily totals first
  (schema 3, with its `user_version` raised so the first server refuses it) and becomes
  schema 4 on the next request. A server refuses a database newer than itself; a server
  older than schema 4 refuses a database it has upgraded, so going back means D1 *Time
  Travel* (7 days) to just before the deploy, then deploying the older server.
* **Size and cost.** Measured on the Node driver, which bills a written row once for its
  table and once for each secondary index, as D1 does: the first v3 batch of a session
  writes 12 rows (its session row is 4: the row, `UNIQUE (s)` and two indexes), a later
  batch 5, a batch of 200 events one row per visit and round plus 2; a v2 batch about
  13. A batch takes at most 20 statements, and the request that upgrades the database
  at most 45 (D1 allows 50 per request). For a busy school (500 play sessions a day,
  9.2 batches each at the 60 s interval) see `docs/RESEARCH_TELEMETRY_SPEC.md`, "Budget
  math": about 33,000 rows written a day in the first year and about 220 MB after it.

### Storage

Schema 4 (`docs/RESEARCH_TELEMETRY_SPEC.md`, "Storage on D1", has the exact columns):

| Tables | What they hold |
|---|---|
| `st_sessions` | One row per play session: its codes (`u`, `p`, `''` when unknown), wire version, band, build, mode, device buckets, start (`start_s`, with `clock` `w` from the PC's elapsed seconds or `r` estimated from the receipt time), the PC's zone, the session start's fields (exact profile age, days since last play, level, profiles on the PC, classroom mode, and the v2 buckets), how it ended, and the server's numbering state for v2. Indexed by start and by student. |
| `st_visits`, `st_rounds`, `st_marks` | Game visits `(session, n)`, rounds `(session, n, k)` with their outcome, tier, score, hits, misses, reaction times and extras, the two-player flag and the student's attempt number, and marks (level-ups, hearts, tutorial steps, classroom timer, removed profiles, older codes). |
| `st_students`, `st_pcs`, `st_student_pcs`, `st_student_games`, `aliases`, `cards` | Per student code: label, first and last play, bands, profile age; per PC code: first and last play, zone, buckets, build; who played on which PC; rounds ended per student and game (for attempt numbers); links from older codes to a student's code, one hop deep; player cards. |
| `settings`, `usage`, `roll_days` | The school's zone and where it came from, the week start, `facts_since`, `legacy_until`, `v3_since` and the rollup version; D1 rows read and written per UTC day (each instance adds its counts once a minute); which local days are rolled up. |
| `r_day`, `r_game_day`, `r_level_day`, `r_source_day`, `r_device_day`, `r_student_day`, `r_student_game`, `r_pc_day`, `r_stat` | Per-day rollups of the facts by the school's local day. |
| `live`, `batches`, `kpi_cache`, `meta` | Sessions in the 5-minute live window (with codes and wire version); v2 batch ids for de-duplication; kept KPI rows of the frozen days; the schema version. |
| `agg_days`, `agg_games`, `agg_levels`, `agg_sources`, `agg_devices` | Only on a database milestone 2 used: its daily totals per UTC receipt day, frozen. |

Every table but `st_sessions` is `STRICT, WITHOUT ROWID`. The only indexes beyond the
primary keys are `st_sessions_time`, `st_sessions_student`, `r_student_day_u`,
`r_student_game_u` and `r_stat_metric`. There are no other columns.

## Development

* Tests: `node --test --test-reporter=spec tools/tests/telemetry-server.test.mjs
  tools/tests/telemetry-worker.test.mjs tools/tests/telemetry-facts.test.mjs
  tools/tests/telemetry-clock.test.mjs` (the Node host on port 0 with a temporary
  database; the Worker entry with real `Request`s on the Node driver; the facts on the
  store; the school's clock; and comparisons with milestone 2's store and the first
  server's store from Git, skipped when those commits are not checked out).
* The Workers runtime on your machine (no Cloudflare account needed): `npm install` in
  `server/`, put `ADMIN_TOKEN=...` in `server/.dev.vars` (ignored by Git), then
  `npx wrangler dev` (local D1 in `.wrangler/`). Add `--test-scheduled` and open
  `/__scheduled` to run the daily purge, or `/__scheduled?cron=*/5+*+*+*+*` for the
  sweep of the live rows. `npx wrangler deploy --dry-run --outdir /tmp/out`
  bundles without deploying.
* Synthetic data for the dashboard: `node server/simulate.mjs --url http://127.0.0.1:8787`
  posts deterministic sessions (same `--seed`, same batch ids, so a repeat adds nothing);
  `node server/simulate.mjs --db server/data/dev.db --days 28` writes four weeks of
  history straight into a Node database file. Every generated batch passes `schema.mjs`.

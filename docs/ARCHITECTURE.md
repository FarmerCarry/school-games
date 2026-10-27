# Platform architecture (re-platform, milestone 1)

This is the contract for the re-platformed portal. It sits on top of the rules in
[`GAME_SPEC.md`](GAME_SPEC.md), [`PLAY_STATS.md`](PLAY_STATS.md) and
[`PERFORMANCE.md`](PERFORMANCE.md); where they disagree, this file wins and they are
updated to match.

## Decisions (made with the product owner)

| Question | Decision |
|---|---|
| Existing 34 games | **Kept.** They move onto the new shared runtime in waves; nothing that works is thrown away. |
| Telemetry destination | **A central, anonymous HTTPS ingest server** (`server/`), fed by the portal. Off unless a build is configured with an ingest URL. |
| Edutainment titles | Mouse & Keyboard Academy is **replaced** by a new HID-onboarding game for 6-year-olds. Lightning Fingers becomes an arcade game (milestone 2). |
| Milestone 1 | Shared runtime (juice SFX, DDA, profiles/XP, telemetry v2) + ingest server + zero background music + age bands + the onboarding game. |

## Audience and pillars

* **Ages 6–11**, on old Windows school PCs with a mouse and keyboard and slow hard disks.
  Pure entertainment: arcade, action and hyper-casual loops. No edutainment.
* **Every game scales.** A 6-year-old novice and an 11-year-old expert must both find
  the right challenge: tiered complexity per game plus dynamic difficulty (DDA).
* **Zero background music.** Only tactile, procedural SFX (see below).
* **Lightweight.** No audio files, no fetched assets, one file per game in the fast
  build, procedural canvas/SVG/three.js art, offline cache.

## Zero-BGM policy (hard rule)

No game, menu, pause screen, result screen or portal page may play background music:
no music loops, sequencers, step schedulers, melody/arpeggio beds, ambient music
drones or "menu jingles" that repeat. Allowed:

* **One-shot SFX** caused by the player or by a game event (a jump, a pop, a goal).
* **Short one-shot cues** of at most ~2 s: win/lose/level-up/reward fanfares.
* **Action-tied continuous sounds** whose level follows the player's own input and
  that fall silent when the input stops (an engine while the throttle is held, a
  rolling ball, wind while steering). They must be silent on title, pause and result
  screens.

Rhythm-style games keep their beat as a **visual** pulse driven by the game clock,
and may quantise the pitch of player-triggered SFX to a scale (the player "plays" the
notes); they never schedule notes on their own.

No music toggles, no `music` save keys, no "الموسيقى" buttons. Old saves that carry
a `music` key are simply ignored.

Also allowed: **game-state warning cues during play** (a low-health heartbeat, a gust
warning) and a vehicle's own motion sound while it moves under the player's control;
both stop on title, pause and result screens.

Guard: `tools/tests/zero-bgm.test.mjs` (browser suite) counts every
`AudioScheduledSourceNode.start()`, `AudioBufferSourceNode.start()` and
`HTMLMediaElement.play()` call and taps the peak level sent to the speakers, for every
catalog game, during idle windows on the title screen and the pause screen (4 s of game
time, after a 2 s tail). Any start in a window, or any output above −60 dBFS, fails.

## Runtime layers

```
games/<slug>/            game code (UI layer calls Kit.stats / Kit.track / Kit.dda)
shared/juice.js          Kit.juice  — procedural SFX engine (opt-in; portal + games)
shared/kit.js            Kit        — lifecycle, input, audio graph, stats v1, and v2:
                                      Kit.profile, Kit.track, Kit.dda, sg:telemetry
js/profiles.js           SGProfiles — anonymous picture profiles, age band, XP/levels
js/telemetry.js          SGTelemetry — the ONLY network sender: batches to the ingest URL
js/stats.js              SGStats    — local play statistics v1 (unchanged format)
js/site.js               portal shell, iframe host, routes, classroom tools
server/                  ingest + query service (Node ≥ 22, zero dependencies)
```

Games never touch storage outside `Kit.store`, never use the network, and talk to
the portal only through `postMessage` via Kit. The portal owns profiles, XP,
statistics and the network.

### Byte policy

Kit is inlined into every game page, so every minified byte in `shared/kit.js` costs
~34 bytes of offline cache.

* `shared/kit.js` v2 additions (profile + track + dda + sg:telemetry) together:
  **about 2,600 minified bytes** (measured with the build's esbuild options; 2,682 with the
  reviewed fixes). Further growth needs a budget decision: every byte costs ~34 bytes of
  offline cache.
* `shared/juice.js`: **≤ 4,500 minified bytes**, loaded only by pages that use it
  (`<script src="../../shared/juice.js">` after `kit.js`; the portal loads
  `shared/juice.js` before `js/site.js`).
* Per-game budgets in `tools/asset-budgets.json` are reviewed numbers: when a change
  legitimately grows a page, raise its budget to the new size plus a small margin and
  record it in `docs/PERFORMANCE.md`. Removing the academy (~171 KB) and the music
  engines pays for most of the Kit growth.

## Kit v2 (shared/kit.js)

All v2 code obeys the existing Kit test harness (`tools/tests/shared-kit.test.mjs`):
nothing posted at load or inside `Kit.ready()`, no new timers, no body elements at
load, every browser global guarded, every promise caught, nothing posted when
standalone. **`sg:stats` version 1 is frozen byte-for-byte.**

### Portal → game: new `sg:preferences` fields (transient, never persisted by Kit)

| Field | Type | Meaning |
|---|---|---|
| `band` | `'6-7' \| '8-9' \| '10-11' \| ''` | Age band of the current player (`''` = unknown). |
| `player` | string matching `/^(p[0-9a-z]{1,8})?$/` | Local profile slot key, `''` for a guest. Only used to keep DDA state per child on this PC. Never sent to the server. |
| `telemetry` | boolean | `true` only when the portal's telemetry sink is active. Kit collects v2 extras and posts `sg:telemetry` only while it is `true`. |

### `Kit.profile`

```js
Kit.profile.band      // '' until the portal says otherwise
Kit.profile.player    // ''
Kit.profile.onChange(fn)  // fn({band, player}); returns an unsubscribe function
```

### `Kit.dda(slug, opts)` — dynamic difficulty adjustment

A small controller that keeps the child near a target success rate (flow channel).

```js
var dda = Kit.dda('road-hopper', { id: 'main', target: 0.72, tiers: 5 });
dda.level            // 0..1, read at round start (never cache across rounds)
dda.tier             // 1..tiers
dda.value(easy, hard)        // lerp(easy, hard, level)
dda.pick([t1, t2, t3, t4, t5]) // the entry for the current tier
dda.result(outcome)  // true/false, or a number 0..1 (e.g. accuracy, share of goal)
dda.reset()
```

* **Seed** (no saved state for this player): band `6-7` → 0.12, `8-9` → 0.38,
  `10-11` → 0.60, unknown → 0.35; `opts.start` overrides.
* **Update:** `n` = results so far; `step = clamp(0.18 / sqrt(1 + n / 2), 0.03, 0.18)`;
  `level += step * (outcome - target)`. **Mercy rule:** from the second outcome in a row
  below 0.3, each one drops an extra `step`. **Hot streak:** from the third outcome in a
  row at or above 0.9, each one adds an extra `step / 2`. Clamp to 0..1.
  `tier = 1 + floor(level * tiers * 0.9999)`.
* **Storage:** `Kit.store(slug)` key `dda` →
  `{ <player, or '_' + band for a guest>: { <id>: [level rounded to 3 decimals, n] } }`;
  at most 16 players kept (the least recently saved is dropped). A change of player
  (or, for a guest, of band) reloads the state. A player with no results yet follows
  the current band's seed.
* Every read of the controller (`level`, `tier`, `value`, `pick`) reports the tier to
  `Kit.track.tier()`.
* DDA lives in the UI layer (`game.js`): engines and level files stay pure and take
  difficulty as parameters (their Node verifiers load a stub Kit).

### `Kit.track` — telemetry v2 extras

`hit`, `miss`, `cue` and `react` are no-ops unless embedded, ready and `telemetry` is
`true`. `tier` is state and is kept at any time (a game reads its tier before the
round starts, possibly before the preferences arrive).

```js
Kit.track.hit()      // a successful action in the open round (accuracy numerator)
Kit.track.miss()     // a failed/missed action
Kit.track.cue()      // a stimulus just appeared: the next pointerdown, or keydown that
                     // Kit.keys accepts (not Ctrl/Alt/Meta, IME, Tab, keys on focused
                     // controls), records a reaction time
Kit.track.react(ms)  // an explicit reaction time
Kit.track.tier(n)    // current difficulty tier 0..9 (0 = no DDA); Kit.dda calls this
```

Automatic: **input latency** — in Kit's existing keydown/pointerdown capture listeners,
`performance.now() - event.timeStamp` (0–1000 ms, key repeats skipped) goes into a
histogram.

Buckets (fixed, upper bounds in ms, last bucket open):
* reaction time `rt[6]`: `<300, <500, <800, <1200, <2000, ≥2000`
* input latency `il[6]`: `<8, <16, <33, <50, <100, ≥100`

### Game → portal: `sg:telemetry` version 2

Posted from the same `sendStats()` call sites as `sg:stats` (round, end, suspend,
pagehide, the existing 10 s tick), immediately after the `sg:stats` message, from the
same deltas, only when `telemetry` is `true` and something changed. At most 64 events
per message.

```js
{ type: 'sg:telemetry', version: 2,
  e: 41250,                 // engaged ms since the previous message (same as v1)
  f: [1830, 412, 37, 1],    // frame buckets (same as v1)
  il: [120, 30, 4, 0, 0, 0],// input-latency histogram since the previous message
  ev: [
    ['rs', 'L3', 2],        // round start: id, tier
    ['re', 'w', 'L3', 52000, 140, 2, 18, 3, [4, 9, 3, 1, 0, 0]]
    // round end: code (w l d e q), id, engaged ms, score (-1 = none), tier at end,
    //            hits, misses, reaction-time histogram
  ] }
```

Round ids follow the v1 rules (`^[A-Za-z][A-Za-z0-9_:.-]{0,23}$`, no three digits in
a row, never typed text). A `round()` while a round is open ends it with code `q`, and so
does a round still open when the game page is unloaded (not kept in the back-forward
cache); `sg:stats` v1 is unchanged and the portal records its own quit from `o`/`om`.

## Juice (shared/juice.js)

`Kit.juice` when Kit is present (games), `window.Juice` otherwise (portal). Built on
the Kit audio graph when present (`Kit.audio.unlock/ctx/master/muted`); in the portal
it creates its own lazily-unlocked `AudioContext` and reads `sg:site:muted` and the
stored classroom preset `sg:site:classroom` at every sound (plus `Juice.setQuiet(bool)`). Never plays before a user gesture. Respects mute in every call.

Engine: a juice bus → `DynamicsCompressor` (limiter) → master; cached noise buffers;
a cap of 14 simultaneous sounds (one sound may use several oscillators; new
low-priority sounds are skipped when full, UI and reward cues always play);
the same sound within 25 ms is dropped (no flams when a child mashes); ±2 % random
pitch variation so repeats never sound machine-gunned.

```js
J.tap()            J.select()        J.back()          J.toggle(on)     J.error()
J.hover()          // very soft; the portal does not use it by default
J.streak(n)        // pitch-shifted pluck climbing a pentatonic ladder with the combo
J.impact(power)    // 0..1: transient click + noise burst + pitched thump
J.chime(level)     // 1..3: inharmonic bell partials, sparkle at higher levels
J.coin(n)          J.pop(size)       J.whoosh(speed)   J.jump(h)        J.land(power)
J.star(i)          // 1..3 ascending star award
J.levelUp()        // rising flourish + chime, ≤ 1.2 s, one-shot
J.fail()           // gentle, never harsh
J.countdown(i)
```

Every sound is a one-shot under 1.5 s. Juice never loops and has no music API.

## Portal

### Profiles and age bands (js/profiles.js → `window.SGProfiles`)

* **Anonymous picture profiles:** an animal (12 choices) and a colour (8). **No names,
  no typed text.** Up to 12 profiles per browser.
* **Age band** chosen with three big number cards: `6–7`, `8–9`, `10–11`.
  The classroom panel offers a class default band used for guests.
* **Never blocking:** home renders as before; a "who's playing?" strip of big round
  avatars sits at the top of home, and the topbar shows the current player (or guest)
  with level and an XP bar. One click picks a player; a guest plays immediately.
* The current player lives in `sessionStorage` (`sg:site:player`), so a closed tab or
  the classroom "hand over the device" button returns to guest.
* Storage `sg:site:profiles`:
  `{ v: 1, seq, list: [{ k: 'p1', a: animal, c: colour, b: band, xp, lv, d0: day created,
  dl: last day played, g: { <slug>: visits } }] }` (days are local day numbers).
* **XP** comes from the v1 `sg:stats` round events the portal already receives
  (so it works with telemetry off): win +10, draw +6, loss +4 (at most 40 XP of
  losses per game per tab session), endless end +5 (+1 per 30 s of round time, up to
  +5 more), quit 0; plus +1 per full 60 s of engaged time in a visit.
  Level `L → L+1` needs `30 + 15·(L−1)` XP. Level-ups play `Juice.levelUp()`, show a
  toast and a burst (reduced-motion aware) and are counted for telemetry.
* The portal sends `band`, `player` and `telemetry` with every `sg:preferences`.

### Telemetry sink (js/telemetry.js → `window.SGTelemetry`)

The **only** file in the repository allowed to use `fetch` (never `sendBeacon`). The static
network bans (`tools/check-all.mjs`, `tools/tests/play-stats-rules.test.mjs`) carve
out exactly this path.

**Active only when all of these hold**, otherwise it is inert (sends nothing, queues
nothing, and the portal sends `telemetry: false`):
* `window.SG_TELEMETRY.url` is set (the fast build injects it from the
  `SG_TELEMETRY_URL` environment variable; the source tree never contains a URL) and
  starts with `https://`;
* the page is not `file:` (the downloaded folder never sends);
* the page is not served from `localhost`/`127.0.0.1`/`[::1]` unless
  `SG_TELEMETRY.allowLocal` is `true` (keeps every existing test and local preview
  network-free);
* `navigator.globalPrivacyControl` is not `true`;
* the teacher has not stopped statistics (`sg:site:statsmeta.off`), nor turned off
  sharing (`sg:site:statsmeta.tm === false`).

**Privacy rules (enforced in the sink and again on the server):** no names, no typed
text, no error text, no PC label, no profile key or avatar, no wall-clock timestamps
(times are seconds since the session started; the server stamps the receipt day and
hour), no persistent identifiers (the session id is random per portal session, is
never reused, and is kept on the PC only inside batches still waiting to be sent), no user-agent or GPU strings (coarse device buckets only), no IP
storage on the server.

**Envelope** (POST body, `Content-Type: text/plain`, JSON):

```js
{ v: 2,
  b: '9f3c0a17b2e44d10',   // batch id, 16 hex (server de-duplicates)
  s: '5d02be9a41c7',       // session id, 12 hex, random per portal session
  k: '5c18c6d2d1c052ad',   // build version ('src' outside the fast build)
  m: 'web',                // 'web' | 'app' (installed PWA)
  a: '6-7',                // age band of the session's player, '' if unknown
  d: [4, 4, 1920],         // device buckets: cores (1,2,4,8,16), memory GB (0,1,2,4,8), screen width (1366,1600,1920,2560)
  ev: [ ... ] }            // at most 200 events, at most 32 KB per batch
```

A new session (new `s`) starts at page load and whenever the player changes.

**Events** (`t` = whole seconds since the session started):

| Event | Shape |
|---|---|
| session start | `['ss', t, isNewProfile 0/1, profileAgeBucket, daysSinceLastBucket, level]` — profile age `0` new, `1` 1–6 days, `2` 7–29, `3` 30+; days since last play `0` same day, `1` 1, `2` 2–6, `3` 7+, `4` first time; level 0 for a guest |
| game open | `['go', t, slug, src, playsBeforeBucket]` — `src` from the v1 launch sources plus `starter`; plays before `0`, `1`, `2` (2–4), `3` (5–9), `4` (10+) for this player |
| game ready | `['ld', t, slug, loadMs]` |
| game failed | `['er', t, slug, kind]` — `t` timeout, `x` script error, `l` load error |
| round start | `['rs', t, slug, id, tier, replayIndex]` — prior starts of this slug+id in this session |
| round end | `['re', t, slug, code, id, ms, score, tier, hits, misses, rt[6]]` |
| game close | `['gx', t, slug, engagedMs, il[6], f[4]]` |
| level up | `['lv', t, level]` |
| session end | `['se', t, engagedMs]` (best effort, via a keepalive `fetch`) |

**Delivery:** events batch in memory; a batch is sent when a game closes, after 20 s
with pending events, and when the page is hidden, always by `fetch` without credentials
(`credentials: 'omit'`: no cookie ever goes, so never by `sendBeacon`), with `keepalive`
while the keepalive bodies in flight fit in 60 KB (the rest wait in the queue). Unsent
batches are kept in `localStorage` `sg:site:tm:q:<hash of the ingest URL>`, so another
copy of the site on the same origin with another URL never sends them (at most 128 KB,
at most 7 days old, oldest dropped first); stopping statistics or turning sharing off
drops every `sg:site:tm:q` queue. Failures back off 20 → 40 → 80 → 160 → 300 s. A 2xx drops the batch;
a 4xx other than 429 drops it as malformed; 429, 5xx and network errors retry.
Teacher "clear" removes the `sg:site:tm:` queues too (not the sharing note
`sg:site:tm:on`). All storage calls are wrapped; no
`console`; never `clear()`.

## Ingest server (server/)

Node ≥ 22, no dependencies (`node:http`, `node:sqlite`). Deployed separately from
GitHub Pages (any small VM or container; see `server/README.md`).

* `POST /v1/batch` → `204`. Validates the envelope and every event against the rules
  above (unknown event kinds and malformed events are dropped; an invalid envelope is
  `400`; a body over 64 KB is `413`). De-duplicates on `b`. Stamps `day` (UTC date)
  and `hour` (UTC hour) at receipt. Stores no IP and no headers. A per-IP token
  bucket in memory only (generous: school NAT puts a whole lab behind one IP) answers
  `429`.
* CORS: `Access-Control-Allow-Origin` echoes an origin from `ALLOWED_ORIGINS`
  (comma-separated); no credentials; `OPTIONS` handled.
* `GET /v1/health` → `{ ok: true }`.
* `GET /v1/admin/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD[&band=6-7]` and
  `GET /v1/admin/live` with `Authorization: Bearer $ADMIN_TOKEN`: engagement KPIs
  (sessions, engaged minutes, per-game opens, completion/drop-off/win rates, per-level
  funnels, tier and accuracy, reaction-time and input-latency histograms, frame
  smoothness, load times, age-band preferences, replay distributions, level-ups) and
  live sessions in the last 5 minutes. Groups smaller than 3 sessions are suppressed.
* Retention: rows older than `RETENTION_DAYS` (default 180) are deleted daily.
* Configuration by environment: `PORT` (0–65535), `HOST`, `DB_PATH`, `ALLOWED_ORIGINS`,
  `ADMIN_TOKEN` (at least 16 printable ASCII characters), `RETENTION_DAYS` (1–36500),
  `RATE_PER_MIN`, `TRUST_PROXY` (which `X-Forwarded-For` hop is the client, for the
  in-memory rate limit only). Requires Node 22.13 or newer.
* Other status codes: `403` for an `Origin` not in the allowlist, `415` for a body that
  is not `text/plain` or `application/json`. Responses to allowed origins expose
  `Retry-After`. `SG_TELEMETRY_URL` is the full `…/v1/batch` endpoint.

Milestone 2 builds the insights dashboard on these query endpoints.

## The onboarding game: «فقاعات بوب» (`bubble-bop`)

The new «ابدأ من هنا» starter title, for a 6-year-old who has never used a mouse or a
keyboard. A real arcade game, not a lesson: no text to read, no fail state, no timer
in the first worlds. Bop is a round, glowing friend that floats with the mouse pointer.

* **Worlds** (each 3 short levels + an endless "party" mode, stars 1–3, stickers and
  hats for Bop as rewards):
  1. **Touch** — bubbles drift up; touching one with Bop pops it (no click needed).
     Teaches cursor tracking.
  2. **Tap** — balloons; a click while over (or near) one pops it.
  3. **Jump** — press the long Space bar so a frog jumps and catches flies.
  4. **Catch** — ← → move a basket to catch falling fruit.
  5. **Party** — all of the above mixed.
* **Forgiving input:** hit areas larger than the art, a gentle magnet (aim assist)
  that pulls targets towards Bop, generous timing windows, mashing never punished,
  stray keys ignored.
* **High-contrast affordances:** thick dark outlines, bright fills, a pulsing ring on
  the next target, an on-screen key that lights up with the real key, a wordless
  ghost hand that shows the motion after a few idle seconds and repeats.
* **DDA** drives size, speed, count and magnet strength; older or skilled children
  reach faster waves, gold bubbles and combo chains in party mode.
* **Juice** on everything: streak pitch ladder, impact transients, reward chimes,
  particles, squash and stretch, screen shake (reduced-motion aware).
* Optional first-time picture cards for holding the mouse and finding the keys reuse
  the academy's approved grip pictures.

## Milestone 2: the Cloudflare host and the insights dashboard

Decisions (with the product owner): the data is collected on a **free Cloudflare
account** the owner creates with one "Deploy to Cloudflare" button; the school has
approved collection, so the fast build is pointed at it as soon as it exists; the
next feature is the **insights dashboard**. The owner is not technical: everything
they do is a click or a copy-paste, described step by step in plain words.

### One server core, two hosts

The same code runs on Cloudflare Workers (the default) and on Node (self-hosting):

```
server/schema.mjs        envelope and event validation (unchanged)
server/store.mjs         daily aggregates over a D1-style async SQL driver; KPIs; live; purge
server/handler.mjs       HTTP rules as a Fetch-API handler: routes, CORS, auth, limits, statuses
server/worker.mjs        Cloudflare entry: export default { fetch, scheduled } on env.DB (D1)
server/sqlite-d1.mjs     a D1-style driver over node:sqlite for Node and the tests
server/app.mjs, main.mjs Node entry (node:http -> handler), unchanged options and behaviour
server/static.mjs        the Node host's static files for dashboard/, with dashboard/_headers
server/dashboard/        the dashboard: static files served at / by both hosts
server/wrangler.json     Worker config; server/package.json pins wrangler; .dev.vars.example
```

* **Daily aggregates, not raw events.** Cloudflare's free D1 allows about 100,000 rows
  written and 5,000,000 rows read per day, and a Worker gets 10 ms of CPU per request.
  So an accepted batch adds to running daily totals (per UTC day and age band: per game,
  per level, per launch source, per device bucket, replay buckets, player buckets,
  daily totals) with one `INSERT ... ON CONFLICT DO UPDATE` per table (its rows as one
  JSON parameter), all in one D1 batch (one transaction: a failure keeps nothing, so the
  PC's retry counts in full), and the KPIs are `SUM ... GROUP BY` over those small
  tables. The work per request stays O(groups), never O(events). A batch writes about
  11 rows on average (95% of batches 19 or fewer) and reads about 16.
* **Small groups stay hidden.** Each aggregate row carries `sessions`: the number of
  distinct sessions that day, counted through a small `seen(day, kind, key, s)` table
  (the additions check it with `NOT EXISTS`, then `INSERT OR IGNORE` adds the batch's
  groups, in the batch's transaction) that keeps only the last 2 days. A range's
  sessions are the sum of its days' counts (a session crossing midnight counts twice; it
  is rare). Groups below 3 sessions are suppressed exactly as before.
* **Live.** A `live(s, slug, seen_minute)` row per session (one write per batch),
  deleted once it leaves the live window (the current minute and the four before): by
  the next batch or live query, and by a 5-minute cron (Node: a timer) when no request
  comes, so it is gone within 10 minutes. It is the only fine-grained time kept, and
  only briefly.
* **Closed days are kept.** Only today's rows change, so the KPI rows of the days
  before yesterday are read from the aggregates once per period and day and kept in a
  `kpi_cache` table until the next daily purge (shared by every instance: Cloudflare may
  answer each refresh from a new one) and in memory for an hour: a dashboard refresh
  reads two days of rows.
* **Schema in code.** The store creates and upgrades its tables itself on first use
  (`CREATE TABLE IF NOT EXISTS`, a `meta` schema version), so a deploy has no separate
  migration step that could fail. A milestone-1 Node database is folded into the
  aggregates on first use and its event tables are dropped.
* **The KPI and live JSON keep their documented shapes** (server/README.md). Additions
  only: `bands[].games[]` gains `winRate`, `dropOffRate` and `engagedMinutes`.
* **Cloudflare specifics:** D1 binding `DB` with no `database_id` (Wrangler provisions it
  on the first deploy); `ADMIN_TOKEN` is a secret the Deploy button asks for (from
  `.dev.vars.example`, with a plain description in `package.json` `cloudflare.bindings`;
  without a valid one the admin endpoints answer `404 {"error":"admin password not set"}`);
  `ALLOWED_ORIGINS` (default `https://farmercarry.github.io`) and `RETENTION_DAYS` are
  plain vars; a daily cron purges old rows and a 5-minute cron deletes stale live rows;
  Workers observability stays **off** (its request logs would hold IP addresses); the
  client key for the soft rate limit is `CF-Connecting-IP`, in memory only. Wrangler is pinned (4.149.0) in
  `server/package.json`; the deploy command is `wrangler deploy`.
* `SG_TELEMETRY_URL` becomes the Worker's `https://…workers.dev/v1/batch`, committed in
  `.github/workflows/build.yml` once the owner reports the address.

### The insights dashboard (server/dashboard/)

Served at `/` of the server, so it lives next to the data, outside the children's site
(no bytes added to any child's page). Plain HTML/CSS/JS, no external libraries; charts
are inline SVG following the dataviz method (validated palette, light and dark, one
axis per chart, table view, hover tooltips). Arabic and English with a toggle
(Arabic right to left; the browser language picks the default).

* **Sign in** with the dashboard password (`ADMIN_TOKEN`), kept in that browser until
  "sign out". A wrong password says so plainly.
* **Filters** in one row: period (today, 7, 30, 90 days) and age band (all, 6–7, 8–9,
  10–11). The KPIs reload on a change and every 5 minutes; "playing now" every 30 s.
* **Sections, in plain words:** headline numbers (play sessions, total play time,
  minutes per session, games opened, playing now); daily activity; favourite games;
  favourites by age; where children get stuck (levels most often left unfinished);
  difficulty check per game and age (too hard / about right / too easy, from win and
  quit rates, with icon and label); coming back (games children return to); PC health
  (smoothness, loading time, input delay, errors, by game and by PC type).
* **Insights first:** up to five short sentences at the top, generated by
  `server/dashboard/insights.js` (pure, unit-tested), e.g. «Children aged 6–7 leave
  Fire & Ice level 3 unfinished in 64% of tries.» Only groups of 3 or more sessions
  are ever described; hidden groups say "fewer than 3 children: hidden for privacy".
* **Game names** come from the live portal's `js/catalog.js` (loaded as a script from
  the site address); the slug is shown if it cannot load.
* **Demo mode** (`/?demo`) shows bundled sample data, so the dashboard can be seen
  before any child plays.

## Milestones

| Milestone | Scope |
|---|---|
| **M1** | Kit v2 (profile, track, dda, sg:telemetry), `shared/juice.js`, portal profiles/age bands/XP, telemetry sink, ingest server with KPI queries, zero-BGM sweep + guard, `bubble-bop` replaces the academy, DDA reference integrations. |
| **M2** | Cloudflare host (one-click deploy, daily aggregates on free D1), the insights dashboard, telemetry switched on. |
| M3 | DDA and tiered complexity across the whole catalog; juice retrofits; per-game mastery, daily quests and collections; portal shell visual refresh; Lightning Fingers → arcade letter-blaster. |
| M4 | New high-replayability titles on the runtime; rendering upgrades for the 3D titles. |
| M5 | Server-side insight jobs (drop-off alerts, difficulty tuning reports) and A/B tuning of DDA targets. |

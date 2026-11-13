# Anonymous play statistics

The portal can send **anonymous play statistics** to the school's own statistics server, so
the school can see which games children enjoy, where games are too hard or too easy, and how
well the school PCs run them. The contract is [`ARCHITECTURE.md`](ARCHITECTURE.md), "Play
statistics"; this page describes the sender (`js/telemetry.js`, `window.SGTelemetry`), what
Kit collects in the games, the exact wire format and how to turn it on. The server is a
Cloudflare Worker in a separate repository (`school-games-telemetry`).

The site has **no accounts, no profiles, no names and no ages**: children open a game and
play, and several children share each PC. The statistics say what was played on a PC, never
who played it.

It is **off by default**. The source tree never contains an address, and a build without
`SG_TELEMETRY_URL` (or a downloaded folder, or the page served from this computer) sends
nothing at all.

## When it sends

`js/telemetry.js` is the **only** file of the site that may use the network (see "Checks").
It is active only when all of these hold:

* `window.SG_TELEMETRY.url` is an `https://` address (the fast build writes it from
  `SG_TELEMETRY_URL`; see "Turning it on");
* the page is not a downloaded folder (`file:`): the offline ZIP never sends;
* the page is not served from this computer (`localhost`, `127.0.0.1`, `[::1]`), so local
  previews and every test stay network-free; a test can opt in with
  `SG_TELEMETRY.allowLocal = true`, which no build ever writes;
* the browser does not send **Global Privacy Control** (`navigator.globalPrivacyControl`);
* no teacher stopped statistics or sharing on this PC with an earlier version of the site
  (`sg:site:statsmeta` with `off`, or `tm: false`): that choice still holds.

Otherwise the sender is **inert**: no requests, no timers, nothing written to storage, and
the portal tells games `telemetry: false` in `sg:preferences`, so Kit posts no statistics.

## What it sends

One batch is a JSON POST body (`Content-Type: text/plain`, so no CORS preflight), wire
version 3:

```js
{ v: 3, b: '9f3c0a17b2e44d10',   // batch id, 16 random hex
  s: '5d02be9a41c7',             // session id, 12 random hex: one per portal page load
  k: '5c18c6d2d1c052ad',         // build version (window.SG_OFFLINE_VERSION), 'src' outside the fast build
  m: 'web',                      // 'app' when installed (display-mode: standalone)
  d: [4, 4, 1920],               // cores 1|2|4|8|16, memory GB 0|1|2|4|8, screen width 1366|1600|1920|2560
  p: '8c21d0e94a6f',             // this PC's random code, '' when storage refused it
  z: 'Asia/Riyadh',              // the PC's time zone name (Intl), '' if unknown
  ev: [ ... ],                   // 1 to 200 events, at most 32 KB per batch as sealed
  w: 64 }                        // whole seconds from the session's start to this send (written last)
```

Device numbers are rounded **down** to those buckets (a value below the smallest bucket, or
unknown, gives the smallest). A session starts when the portal page loads and ends when it is
unloaded. Times (`t`) are whole seconds since the session started. **No clock time is sent:**
the server dates a batch as its own receipt time minus `w`. `w` comes from
`performance.now()` when the session began on this page (a corrected Windows clock does not
move it), else, for a batch reloaded from the queue, from the session's queued start; it is
never less than the batch's last `t`, at most 691,200 (8 days), and computed at send time, so a
retry carries a larger `w`.

Every game visit is numbered in its session (`n`, from 1; the order of visits gives the game
before and after), and every round in its visit (`k`, from 1): a round's end takes the number
of the open round with the same id, else a new one.

| Event | Shape | Notes |
|---|---|---|
| session start | `['ss', t]` | Always the session's first event. |
| game open | `['go', t, n, slug, src, 0, fav]` | `src`, how it was opened: `featured` (a 🔥 tile in the full list), `catalog`, `recent` («تابع اللعب»), `favorites`, `category`, `quick` (a quick filter), `search` (a search result, or Enter on a single result), `related` («ألعاب أخرى ستحبها»), `surprise` (the 🎲 button), `starter` (the «ابدأ من هنا» card), `reload`, `direct` (a page opened on a game) or `history` (back, forward or a typed address). The `0` keeps the event's shape: builds with player profiles put a child's earlier visits there, and there are no players now. `fav` 1 when the game is hearted (`sg:site:favs`) as it opens. |
| game ready | `['ld', t, n, slug, loadMs]` | Frame created to its first `sg:ready`; only a visit's first frame, and only if the page stayed visible. |
| game failed | `['er', t, n, slug, kind]` | `x` script error, `t` 20-second load timeout, `l` the page failed to load. Never the error text. |
| round start | `['rs', t, n, k, slug, id, tier, attempt]` | `id` the game's own round id (a level, mode or arena, e.g. `w3L2`, `endless`, `cpu-easy`, `duo`); `tier` the difficulty tier 0–9 (0: no `Kit.dda`); `attempt` the earlier starts of this game and id in this session. |
| round end | `['re', t, n, k, slug, code, id, ms, score, tier, hits, misses, rt[6], x]` | `code` `w` win, `l` lose, `d` draw, `e` an end with no winner (endless runs, two children on one PC), `q` quit (left, restarted or the page went away); `ms` the round's engaged time; `score` −1 for none; reaction-time histogram (< 300, < 500, < 800, < 1200, < 2000, ≥ 2000 ms). `x`: `[wallMs, inputs, idleLapses, pauses, rtSumMs, rtN, ddaPermille]` (below), or `null`. |
| engaged so far | `['gp', t, n, slug, engagedMs]` | The engaged time of a game still open, added when a batch is sealed, only if it grew and its session has other events waiting. |
| game close | `['gx', t, n, slug, engagedMs, il[6], f[4]]` | Engaged time, input-latency histogram (< 8, < 16, < 33, < 50, < 100, ≥ 100 ms) and frame smoothness (≤ 20 ms, ≤ 34 ms, ≤ 250 ms, slower) of the whole visit. |
| tutorial | `['tu', t, n, slug, step]` | `s` a game's first-time help started, `d` it was finished; at most once per visit and step. |
| heart | `['fv', t, n, slug, on]` | The heart button pressed in this visit: 1 hearted, 0 not any more. |
| session end | `['se', t, engagedMs, 'u']` | The page was unloaded (best effort, by a keepalive `fetch`), after its open game closed. |

The round counters `x`: wall time from the round's start to its end; key presses and clicks
in the round; idle lapses (a key press or click after the 20 s engaged window lapsed); pauses
(blur, hidden page, fullscreen exit, the portal's pause, Shift+Tab; one per stop of play);
the sum and number of the reaction times in `rt`; and the difficulty level of the last
`Kit.dda` read in thousandths (−1: none).

Round events come only from `sg:telemetry` version 2 of the **current game frame**, or of a
frame removed less than 2 seconds ago (its last message). Every field is checked: ids
(`^[A-Za-z][A-Za-z0-9_:.-]{0,23}$`, never three digits in a row, never a prototype name such as
`constructor`), codes, tiers 0–9, histograms of exactly 6 or 4 numbers ≥ 0, scores −1 or ≥ 0,
and the arity. A malformed event is dropped whole; numbers are rounded and clamped to the
server's limits. Malformed counters give `x: null` and the round is kept. Messages from any
other window are ignored.

### Never sent

Builds with player profiles (before November 2026) also sent per-child and age fields. None
of them exists any more:

* in the envelope: `u` (a profile's random code) and `a` (the age band 6-7, 8-9, 10-11);
* in `ss`: whether the profile was new, the profile's age in days, the days since its last
  play, its level (XP), the number of profiles on the PC and classroom mode;
* in `go`: the profile's earlier visits to the game (always `0` now);
* the events `lv` (level up), `ct` (classroom timer), `pr` (profile removed) and `cd` (an
  older code of a child);
* the session-end reasons `h`, `i` and `p` (hand-over and player change): a session ends only
  when its page goes (`u`).

Never sent either: names, anything typed (search text, typed words), error text, the PC's
label, the user agent, GPU or browser strings, a date or a time of day, or the local
storage of the games. The server stores no IP address. The PC code makes the statistics of
one PC hang together over time; it says nothing about which child played.

## Kit (in every game)

Kit counts and posts only while the portal says the sender is on (`sg:preferences`
`telemetry: true`), after `Kit.ready()` and only while embedded. Until the portal says, it
keeps at most 400 waiting events in memory; told `false`, it drops them and counts nothing.
It stores nothing and never uses the network. Its one 10 s timer runs only while the sender
is on.

```js
Kit.stats.round('L3')        // a round starts (a new one while one is open quits the open one)
Kit.stats.end('win', score)  // 'win', 'lose', 'draw', 'end' (no winner) or 'quit'; score optional
Kit.stats.tutorial('start')  // or 'done': a first-time coach started or was finished
Kit.stats.busy()             // the child watches play without input (keeps the engaged window open)
Kit.stats.frame(ms)          // a frame time, for games that run their own loop instead of Kit.loop
Kit.track.hit()              // a success in the open round
Kit.track.miss()             // a mistake or something missed
Kit.track.cue()              // something to press just appeared: the next accepted key or click is a reaction time
Kit.track.react(ms)          // an explicit reaction time
Kit.track.tier(n)            // the difficulty tier 0..9; every Kit.dda read reports its own
```

`sg:telemetry` (game → portal), at most 64 events per message, on every round start and end,
every pause, pagehide and the 10 s tick when something changed:

```js
{ type: 'sg:telemetry', version: 2,
  e: 41250,                  // engaged ms since the previous message
  f: [1830, 412, 37, 1],     // frame buckets
  il: [120, 30, 4, 0, 0, 0], // input-latency histogram
  ev: [['rs', 'L3', 2],
       ['rx', 52300, 41, 1, 0, 9150, 17, 640],  // the counters, right before each end
       ['re', 'w', 'L3', 52000, 140, 2, 18, 3, [4, 9, 3, 1, 0, 0]],
       ['tu', 's']] }
```

Engaged time: a key press or click starts or extends a 20 s window; mouse moves, the wheel and
`Kit.stats.busy()` only extend an open one; every pause and pagehide cuts it. Frames count only
while engaged in a round. A round still open when the game page goes away (not kept in the
back-forward cache) ends as a quit.

Games call these in their UI layer only, never in engine, level or simulation files, and
report what the game naturally has: every game reports its rounds; the score, hits, misses,
cues and tutorials where it has them (the table in [`ARCHITECTURE.md`](ARCHITECTURE.md),
"Play statistics"). Demo, attract and replay modes never report.

## Delivery

* Events wait in memory. A batch goes **when a game closes**, **60 seconds after the first
  waiting event** (one timer, only while something waits), and **when the page is hidden or
  unloads**. A 2xx answer may carry **`X-Batch-Every`**: a whole number of seconds from 20 to
  600 that replaces the 60 for later timed sends. Anything else in the header is ignored; a
  2xx without it goes back to 60.
* Every send is `fetch(url, { method: 'POST', credentials: 'omit', mode: 'cors', keepalive })`,
  **never with cookies** (which is why the sender does not use `navigator.sendBeacon`).
  Normal sends go one at a time, oldest first.
* The browser refuses keepalive bodies beyond 64 KB in flight together, so the sender keeps its
  own within **60 KB**. A hidden or unloading page hands `fetch` what waits at once, oldest
  first, while it fits; the rest stays in the queue.
* A **2xx** removes the batch. A **4xx other than 429** removes it as malformed. **429, 5xx
  and network errors** keep it and back off **20, 40, 80, 160, then 300 s**. A request with no
  answer after a minute no longer holds the queue back: its batch goes again (the server keeps
  it once). While the server is failing, or the PC is offline, a hidden page sends nothing.
* Unsent batches wait in `localStorage` **`sg:site:tm:anon:<hash>`** (an array of
  `{ t, w0, e }`: when the batch's first event was recorded, its session's start, and the
  envelope), oldest first, **at most 128 KB** and **7 days**. `<hash>` is a 32-bit hash of the
  full address, so another copy of the site on the same origin built with another address
  never sends, or drops, this one's batches.
* **The PC code** lives in `sg:site:rid` as `{ v: 1, pc }` (12 random hex, made and written
  only by an active sender). Builds with player profiles also kept a code per profile there:
  an active sender drops them and keeps the PC's code. If storage refuses the write, batches
  carry `p: ''`.
* **Older queues:** builds with player profiles queued their batches, which hold children's
  codes and ages, in `sg:site:tm:q:<hash>` and `sg:site:tm:q3:<hash>`, beside a sharing note
  `sg:site:tm:on`. This build never sends them: an active sender removes them at load.
* Every storage call is guarded, nothing is logged, every promise is caught, and no call into
  the sender throws. The browser itself prints «Failed to load resource» in the developer
  console when the server answers with an error; the site's own code never logs.

## Turning it on

The server must accept wire version 3 without the per-child fields: check that
`GET /v1/health` answers `"accepts":[2,3]` (for example `{"ok":true,"accepts":[2,3],"schema":4}`)
before publishing. The workflow builds with the school's Worker address by default, and its
deploy job asks that server's `/v1/health` and stops before publishing while `accepts` lacks 3.

1. Deploy the statistics server, with its allowed origins set to the portal's origin (for
   example `https://name.github.io`).
2. In the GitHub repository: **Settings → Secrets and variables → Actions → Variables → New
   repository variable**, name **`SG_TELEMETRY_URL`**, value the full address, for example
   `https://telemetry.example.org/v1/batch`. It is a variable, not a secret: the address ends
   up in the public page anyway. Without it the workflow uses the school's Worker,
   `https://school-games-telemetry.services-agreement137.workers.dev/v1/batch`.
3. Run the workflow (or push to `main`). `.github/workflows/build.yml` passes the address only
   to its "Build the fast site" steps; the build log then says
   `telemetry: the portal sends anonymous play statistics to <host>`.

A local fast build: `SG_TELEMETRY_URL=https://telemetry.example.org/v1/batch node tools/build.mjs`.
The build accepts only an `https://` address of at most 200 characters made of URL characters
(no quotes, spaces, backslashes, `<` or `>`), without a user name or password, and stops with
an error otherwise. It writes `window.SG_TELEMETRY={url:"…"};` in front of the portal's
inlined `js/telemetry.js` and nowhere else: not into the games, `sw.js`, or a `--kill-sw`
build. Unset or empty, the build output is exactly what it was before. The offline ZIP holds
the same portal, which never sends from a folder.

To turn it off, remove the `SG_TELEMETRY_URL` lines from `.github/workflows/build.yml` (an
empty repository variable falls back to the school's Worker) and rebuild. On one PC, Global
Privacy Control in the browser turns it off.

## Checking that it works

* The built `_site/index.html` contains `window.SG_TELEMETRY={url:` exactly once.
* On the published site, in the browser's developer tools: `SGTelemetry.active()` is `true`;
  `localStorage['sg:site:rid']` holds `{"v":1,"pc":"…"}`; the Network tab shows a `POST` to the
  address (type `fetch`, without a `Cookie` header) about 60 seconds after load or when a game
  closes, answered with `204`; its body has `"v":3`, `p`, `z` and `w`, and no `a` or `u`.

## Checks

* `tools/tests/telemetry-client.test.mjs` (browser): real rounds of tic-tac-toe, the starter
  card, a heart and the Surprise button reach a stand-in server with the exact envelope and
  events, and nothing about any child (an earlier build's PC label, profile, codes and queues
  are never sent and are removed; the PC keeps its code); every gate (no address, `http://`, a
  quote, this computer without `allowLocal`, Global Privacy Control, a teacher's earlier stop)
  sends and stores nothing and games get `telemetry: false`; back-off 20, 40, 80, 160, 300 s
  with a fake clock; 400 and 429; a request never answered goes again after a minute; the
  queue across a reload, its 128 KB and 7-day rules; keepalive sends on a hidden page and at
  unload with no cookie, the 60 KB budget, offline; two copies of the site on one origin; every
  launch source; field-by-field checks of `sg:telemetry` and late frames; load failures; the
  60-second timer and `X-Batch-Every`; `w` for retries, split and queued batches. With
  `SG_SERVER_SCHEMA` naming the server's `schema.mjs` (with `clock.mjs` beside it), every batch
  also passes the server's own validator whole.
* `tools/tests/telemetry-catalog.test.mjs` (browser): each of the catalog's games, opened in
  the portal with the sender on and played briefly through its gameplay scenario, reports its
  visit and at least one round; without an address the same play sends nothing.
* `tools/tests/shared-kit.test.mjs`: Kit posts nothing and starts no timer unless the portal
  says the sender is on; engaged windows, frames, input latency, rounds, quits, hits, misses,
  reaction times, the counters, tutorials, the 64-event split and the 400-event cap.
* `tools/tests/build-safety.test.mjs`: the address reaches the portal only, bad addresses are
  refused before any output changes, and an unset or empty variable changes nothing.
* `tools/tests/telemetry-rules.test.mjs` and `tools/check-all.mjs` share
  `tools/lib/network-rules.mjs`: `fetch()` is allowed in exactly `js/telemetry.js` (and, in
  the fast build, only in the portal's exact inlined copy of it); every other network API,
  `sendBeacon` included, stays banned there, and the same calls anywhere else fail. The rules
  test also checks that every catalog game reports its rounds, that engine files never report,
  that round ids are never typed text, and that the sender's code has nothing about profiles,
  ages or classrooms.

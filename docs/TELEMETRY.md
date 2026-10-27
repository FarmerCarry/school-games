# Anonymous telemetry (the portal's sink)

The portal can send **anonymous** play events to a central ingest server, so the people
who run the site can see which games children enjoy, where they get stuck, whether the
difficulty fits each age band and how well the school PCs run the games. The contract is
[`ARCHITECTURE.md`](ARCHITECTURE.md), "Telemetry sink" and "Ingest server"; this page
describes the client side (`js/telemetry.js`, `window.SGTelemetry`) and how to turn it
on. The server and its deployment are in [`server/README.md`](../server/README.md).

It is **off by default**. The source tree never contains an address, and a build without
`SG_TELEMETRY_URL` sends nothing at all. The local play statistics teachers see
([`PLAY_STATS.md`](PLAY_STATS.md)) are separate: they always stay on each PC.

## Before you turn it on

The players are **children aged 6 to 11**. Even anonymous usage data about children needs
the school's or district's **privacy review** and a **notice to parents** before
collection starts, under the rules that apply to you: for example **COPPA** (and FERPA for
school records) in the United States, the **GDPR** with its rules for children's data
(often called **GDPR-K**) in the European Union, and the **UK GDPR with the Age
Appropriate Design Code** in the United Kingdom. Give the reviewers this page, the event
list in `ARCHITECTURE.md` and the "Privacy design" section of `server/README.md`. Keep
`SG_TELEMETRY_URL` unset until the review is done, and record who runs the server, where
it runs and how long it keeps data.

## When it sends

`js/telemetry.js` is the **only** file of the site that may use the network (see
"Checks" below). It is active only when all of these hold:

* `window.SG_TELEMETRY.url` is an `https://` address (the fast build writes it from
  `SG_TELEMETRY_URL`; see "Turning it on");
* the page is not a downloaded folder (`file:`): the offline ZIP never sends;
* the page is not served from this computer (`localhost`, `127.0.0.1`, `[::1]`), so local
  previews and every test stay network-free; a test can opt in with
  `SG_TELEMETRY.allowLocal = true`, which no build ever writes;
* the browser does not send **Global Privacy Control** (`navigator.globalPrivacyControl`);
* the teacher has not stopped statistics on this PC (`sg:site:statsmeta.off`) and sharing
  is not turned off (`sg:site:statsmeta.tm === false`; the teacher-page switch for it comes
  in milestone 2). These two are read again before every event and every send.

Otherwise the sink is **inert**: no requests, no timers, nothing written to storage (it
only removes a sharing note, `sg:site:tm:on`, left by an earlier build that shared), and
the portal tells games `telemetry: false` in `sg:preferences`, so Kit does not even
collect the extras (`Kit.track`) or post `sg:telemetry`. When the teacher stops statistics
in another tab, the open game is told `telemetry: false` at once and everything still
waiting is dropped.

## What it sends

One batch is a JSON POST body (`Content-Type: text/plain`, so no CORS preflight):

```js
{ v: 2, b: '9f3c0a17b2e44d10',   // batch id, 16 random hex (the server de-duplicates on it)
  s: '5d02be9a41c7',             // session id, 12 random hex, never reused (stored only inside unsent batches)
  k: '5c18c6d2d1c052ad',         // build version (window.SG_OFFLINE_VERSION), 'src' outside the fast build
  m: 'web',                      // 'app' when installed (display-mode: standalone)
  a: '8-9',                      // age band of the session's player, '' if unknown
  d: [4, 4, 1920],               // cores 1|2|4|8|16, memory GB 0|1|2|4|8, screen width 1366|1600|1920|2560
  ev: [ ... ] }                  // 1 to 200 events, at most 32 KB per batch
```

Device numbers are rounded **down** to those buckets (a value below the smallest bucket,
or unknown, gives the smallest). A session starts when the portal page loads and whenever
the player changes (a new profile, another avatar, a guest after «سلّم الجهاز»). Times
(`t`) are whole seconds since the session started.

| Event | Shape | Notes |
|---|---|---|
| session start | `['ss', t, isNew, profileAge, sinceLast, level]` | `isNew` 1 when the player was just made on this page. Profile age `0` new, `1` 1–6 days, `2` 7–29, `3` 30+. Days since the last play `0` same day, `1` one, `2` 2–6, `3` 7+, `4` first time (no game played yet, even if the profile was made on an earlier day). A guest is `['ss', 0, 0, 0, 4, 0]`. |
| game open | `['go', t, slug, src, playsBefore]` | `src`: the v1 launch sources of `PLAY_STATS.md` (featured, catalog, recent, favorites, category, quick, search, related, surprise, reload, history, direct) plus `starter` for the «ابدأ من هنا» card. Plays of this game before, for this player: `0`, `1`, `2` (2–4), `3` (5–9), `4` (10+); always `0` for a guest. |
| game ready | `['ld', t, slug, loadMs]` | Frame created to its first `sg:ready`; only a visit's first frame, and only if the page stayed visible (as in v1). |
| game failed | `['er', t, slug, kind]` | `x` script error, `t` 20-second load timeout, `l` the page failed to load. Never the error text. |
| round start | `['rs', t, slug, id, tier, replayIndex]` | From the game's `sg:telemetry`. `replayIndex`: earlier starts of this slug and id in this session. |
| round end | `['re', t, slug, code, id, ms, score, tier, hits, misses, rt[6]]` | `code` w l d e q; `score` −1 for none; reaction-time histogram (< 300, < 500, < 800, < 1200, < 2000, ≥ 2000 ms). |
| game close | `['gx', t, slug, engagedMs, il[6], f[4]]` | Engaged time, input-latency histogram (< 8, < 16, < 33, < 50, < 100, ≥ 100 ms) and frame buckets of the whole visit. Waits for the removed frame's own last message (1 s at most, and never past the next game's `go`). |
| level up | `['lv', t, level]` | `SGProfiles.onLevel`, the current player only. |
| session end | `['se', t, engagedMs]` | After the session's games have closed, so it is always its session's last event. Best effort when the page unloads (by a keepalive `fetch`). |

Round events come only from `sg:telemetry` version 2 of the **current game frame**, or
of a frame removed less than 2 seconds ago (its last message), as for `sg:stats` v1.
Every field is checked: codes, ids (`^[A-Za-z][A-Za-z0-9_:.-]{0,23}$`, never three digits
in a row, never a prototype name such as `constructor`), tiers 0–9, histograms of exactly
6 or 4 numbers ≥ 0, scores −1 or ≥ 0, and the arity. A malformed event is dropped whole;
numbers are rounded and clamped to the server's limits. Messages from any other window
are ignored.

**Never sent:** names, anything typed (search text, typing-test words), error text, the
PC's id or label, the profile key, avatar or colour, the user agent, GPU or browser
strings, wall-clock dates or times, IP-derived data, and the local day records.

## Delivery

* Events wait in memory. A batch goes **when a game closes**, **20 seconds after the first
  waiting event** (one timer, only while something waits), and **when the page is hidden
  or unloads**. Every send is `fetch(url, { method: 'POST', credentials: 'omit', mode:
  'cors', keepalive })`, **never with cookies**: a cookie the browser keeps for the ingest
  host (a district sign-in on the same site, a load balancer's stickiness cookie that
  would link the session ids) never goes with a batch. That is why the sink does not use
  `navigator.sendBeacon`, which always sends them. Normal sends go one at a time, oldest
  first.
* `keepalive` lets a request outlive its page, but the browser refuses keepalive bodies
  beyond 64 KB in flight together, so the sink keeps its own within **60 KB** (a normal
  send that does not fit goes without `keepalive`). A hidden or unloading page hands
  `fetch` what waits at once, oldest first, while it fits: the first batch that does not
  fit and every later one stay in the queue, and so does the batch of a normal send still
  on its way. A batch handed over this way is not kept.
* A **2xx** removes the batch. A **4xx other than 429** removes it as malformed (it would
  never be accepted). **429, 5xx and network errors** keep it and back off **20, 40, 80,
  160, then 300 s**. A request with no answer at all after a minute no longer holds the
  queue back: its batch goes again (the server keeps it once). While the server is
  failing, or the PC is offline (`navigator.onLine === false`), a hidden page sends
  nothing and the queue keeps everything for later.
* Unsent batches wait in `localStorage` **`sg:site:tm:q:<hash>`** (an array of `{ t, e }`:
  when the batch's first event was recorded, and the envelope), oldest first, **at most
  128 KB** (the oldest go first) and **7 days**. They survive a reload or a restart of the
  PC and go out from the next portal page. Two portal tabs may send the same queued batch;
  the server keeps it once (`b`).
* `<hash>` is a short hash of the full ingest address (a 32-bit string hash, in base 36),
  so each address has its own queue: another copy of the site on the same origin (for
  example `name.github.io/school-games` and `name.github.io/school-games-test`) built with
  another `SG_TELEMETRY_URL` never sends, or drops, this one's batches.
* While the sink shares, it notes the server's host in **`sg:site:tm:on`**, so the teacher
  page can say «المشاركة المجهولة مفعّلة على هذا الجهاز … إلى <host>».
* Stopping statistics or turning sharing off drops every queue on this origin (another
  copy's too), the note and every waiting event. The teacher page's **clear** removes every
  `sg:site:tm:` key except the note `sg:site:tm:on` (this PC still shares), and a portal
  page that is still open drops whatever it recorded before the clear
  (`statsmeta.clearedAt`).
* Every storage call is guarded (with blocked storage the queue lives in memory for that
  page), nothing is logged, every promise is caught, and no call into the sink throws.

The browser itself prints «Failed to load resource: the server responded with a status
of 5xx» in the developer console when the ingest server answers with an error; the site's
own code never logs.

## Turning it on

1. Deploy the ingest server behind HTTPS (`server/README.md`), with `ALLOWED_ORIGINS` set to
   the portal's origin (for example `https://name.github.io`).
2. In the GitHub repository: **Settings → Secrets and variables → Actions → Variables →
   New repository variable**, name **`SG_TELEMETRY_URL`**, value the full ingest address,
   for example `https://telemetry.example.org/v1/batch`. It is a variable, not a secret:
   the address ends up in the public page anyway.
3. Run the workflow (or push to `main`). `.github/workflows/build.yml` passes the variable
   only to its "Build the fast site" steps; the build log then says
   `telemetry: the portal sends anonymous events to telemetry.example.org`.

A local fast build: `SG_TELEMETRY_URL=https://telemetry.example.org/v1/batch node tools/build.mjs`.
The build accepts only an `https://` address of at most 200 characters made of URL
characters (no quotes, spaces, backslashes, `<` or `>`), without a user name or password,
and stops with an error otherwise. It writes `window.SG_TELEMETRY={url:"…"};` in front of
the portal's inlined `js/telemetry.js` and nowhere else: not into `teacher.html`, the
games, `sw.js`, or a `--kill-sw` build. Unset or empty, the build output is exactly what it
was before. The offline ZIP holds the same portal, which never sends from a folder.

To turn it off again, delete the variable and rebuild. A teacher can stop it on one PC by
stopping statistics on the teacher page.

## Checking that it works

* The built `_site/index.html` contains `window.SG_TELEMETRY={url:` exactly once.
* On the published site, in the browser's developer tools: `SGTelemetry.active()` is
  `true`; the Network tab shows a `POST` to the address (type `fetch`, without a `Cookie`
  header) about 20 seconds after load or when a game closes, answered with `204`; no
  `sg:site:tm:q:` key is left in `localStorage` once batches are delivered.
* The teacher page (🏫 → 📊) shows the line that sharing is on, with the server's host.
* On the server: `GET /v1/health`, then `GET /v1/admin/live` with the admin token.

## Checks

* `tools/tests/telemetry-client.test.mjs` (browser): real rounds of tic-tac-toe and the
  starter card reach a stand-in ingest server with the exact envelope and events, and with
  nothing that could name a child or a PC; every batch it sends passes the server's own
  `validateBatch` (`server/schema.mjs`) whole, with no event dropped or changed (before the
  server is in the checkout, point `SG_SERVER_SCHEMA` at a copy of that file; without
  either, only that check is skipped and the test says so); every gate (no address,
  `http://`, a quote, this computer without `allowLocal`, Global Privacy Control,
  statistics stopped, sharing off) sends and stores nothing and games get
  `telemetry: false`; back-off 20, 40, 80, 160, 300 s with a fake clock, for 5xx and for
  no answer at all; 400 and 429; a request that is never answered goes again after a minute;
  the queue across a reload, its 128 KB, 7-day and clear rules; keepalive sends on a
  hidden page and at unload, with no cookie of the ingest host on either path (the
  unloading page's request is seen by an interception for the whole browser), the 60 KB
  keepalive budget beside a send still on its way, and offline; two copies of the site on
  one origin with two addresses, each sending only its own queue, and a stop dropping
  both; a new session per player with the old one ending after its game; a returning
  player's buckets, and a profile that has never played as a first time; field-by-field
  checks of `sg:telemetry` and late frames; load failures; a stop from another tab.
* `tools/tests/build-safety.test.mjs`: the address reaches the portal only, bad addresses
  are refused before any output changes, and an unset or empty variable changes nothing.
* `tools/tests/play-stats-rules.test.mjs` and `tools/check-all.mjs` share
  `tools/lib/network-rules.mjs`: `fetch()` is allowed in exactly `js/telemetry.js` (and,
  in the fast build, only in the portal's exact inlined copy of it); every other network
  API, `sendBeacon` included, stays banned there, and the same calls anywhere else fail.
* `tools/tests/teacher-page.test.mjs`: the note, the sharing line, and clear removing
  the `sg:site:tm:` queue while the note and the sharing line stay.

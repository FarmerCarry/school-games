# Play telemetry (no names)

The portal can send play events **without names (pseudonymous)** to the school's own
ingest server, so the school can see which games children enjoy, how each child's play
and skill develop over the year, where they get stuck, whether the difficulty fits each
age band, and how well the school PCs run the games. The contract is
[`ARCHITECTURE.md`](ARCHITECTURE.md), "Telemetry sink" and "Ingest server", and wire
version 3 is pinned in [`RESEARCH_TELEMETRY_SPEC.md`](RESEARCH_TELEMETRY_SPEC.md) §B; this
page describes the client side (`js/telemetry.js`, `window.SGTelemetry`) and how to turn
it on. The server, its dashboard and its deployment are in
[`server/README.md`](../server/README.md).

It is **off by default**. The source tree never contains an address, and a build without
`SG_TELEMETRY_URL` sends nothing at all. The local play statistics teachers see
([`PLAY_STATS.md`](PLAY_STATS.md)) are separate: they always stay on each PC.

## Before you turn it on

The players are **children aged 6 to 11**. No names are sent, but each child who picks an
animal gets a random code, so the server keeps a record of that child's play over time:
under GDPR-style rules (the GDPR, the UK GDPR and its Children's Code; FERPA and COPPA
notions in the United States) this is **pseudonymous personal data**, not anonymous data.
Tell parents before collection starts, record who runs the server, where it runs and how
long it keeps data (400 days by default), and before publishing research from it, check
whether you need consent or an ethics review. Give your reviewers this page and the
"What is collected and kept" section of `server/README.md`.

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
  is not turned off (`sg:site:statsmeta.tm === false`). These two are read again before
  every event and every send.

Otherwise the sink is **inert**: no requests, no timers, nothing written to storage (it
makes no code, and only removes the notes `sg:site:tm:on` and `sg:site:tm:dx` left by an
earlier build that shared, so the teacher page neither says that this PC shares nor tests
a server it no longer sends to), and the portal tells games `telemetry: false` in `sg:preferences`, so Kit
does not even collect the extras (`Kit.track`, the round counters) or post
`sg:telemetry`. When the teacher stops statistics in another tab, the open game is told
`telemetry: false` at once and everything still waiting is dropped.

## The codes: `sg:site:rid`

```js
{ v: 1, pc: '8c21d0e94a6f',              // this PC's code
  k: { p1: '3f9a0c51e2b7', p4: 'b81e4c07d2a9' }, // a code per profile key (the key itself is never sent)
  l: { p4: '1b2c3d4e5f60' },             // a profile's older code, waiting to be linked (below)
  g: { p4: 'b81e4c07d2a9' } }            // the code a teacher gave a profile, from another PC (below)
```

* Every code is **12 random lowercase hex** (`crypto.getRandomValues`). It is never
  derived from the profile's key, animal or colour, and the PC code is never the teacher
  page's statistics id (`statsmeta.pc.id`), which exports pair with the typed PC label.
* Only an **active** sink makes or writes codes, and it reads the key again before each
  write. A profile gets its code at the start of its first session; a profile made before
  milestone 2.5 gets one on its first session after it. The profile records themselves
  (`sg:site:profiles`) never hold a code, because a portal from before 2.5 rebuilds them
  from the fields it knows.
* When a profile is gone from the PC, the next session start (or the change itself)
  removes its code and sends `['pr', t, code]` once: the child's play on this PC stops
  there, which the server treats as censoring, not as dropping out. A code a teacher gave
  the profile (`g[key]` equals `k[key]`) is removed without a `pr`, with its `l` and `g`:
  the child goes on playing with it on the other PC.
* If storage refuses the write (blocked or full), the session sends `u: ''` and `p: ''`:
  the sink never invents codes that would live only in one page and count as new students
  and PCs. Anything malformed in the key is dropped; a damaged key is rewritten as
  `{ v: 1, pc: '', k: {}, l: {}, g: {} }` (and filled), only by an active sink.
* The key lies outside `sg:site:stats:` and `sg:site:tm:`, so the teacher page's
  **clear** and the **stop** keep it: what was sent stays on the server anyway, and a
  child's long-term record must not break because a teacher cleared a PC.
* **The same child on two PCs.** The teacher page shows each profile's code with a check
  character, for example `3F9A-0C51-E2B7-5`, and offers «الطفل نفسه على جهاز آخر»: the
  teacher types the code the other PC's teacher page shows for that child. The profile
  then takes that code (`k`, also noted in `g`), and its own code, if it had one, waits in
  `l`. At that profile's next session start the sink sends `['cd', t, olderCode]` right
  after `ss`; the server then links the older code to the new one, so the child's earlier
  play on this PC joins the same student ([`PLAY_STATS.md`](PLAY_STATS.md), section 3).
  `l[key]` stays until a batch that holds the `cd` is delivered (the server's 204), so a batch lost
  on the way (a PC switched off before the batch was queued, the queue's limits) never loses
  the link: the next page sends it again (at most once per page; the server keeps one link).
  A code in `g` came from another PC, so a second transfer that corrects a wrong one never
  puts it in `l`: it is another child's history.

## What it sends

One batch is a JSON POST body (`Content-Type: text/plain`, so no CORS preflight):

```js
{ v: 3, b: '9f3c0a17b2e44d10',   // batch id, 16 random hex
  s: '5d02be9a41c7',             // session id, 12 random hex, never reused (stored only inside unsent batches)
  k: '5c18c6d2d1c052ad',         // build version (window.SG_OFFLINE_VERSION), 'src' outside the fast build
  m: 'web',                      // 'app' when installed (display-mode: standalone)
  a: '8-9',                      // age band of the session's player, '' if unknown
  d: [4, 4, 1920],               // cores 1|2|4|8|16, memory GB 0|1|2|4|8, screen width 1366|1600|1920|2560
  u: '3f9a0c51e2b7',             // the player's code, '' for a guest (or when storage refused it)
  p: '8c21d0e94a6f',             // this PC's code, '' when storage refused it
  z: 'Asia/Riyadh',              // the PC's time zone name (Intl), '' if unknown
  ev: [ ... ],                   // 1 to 200 events, at most 32 KB per batch as sealed
  w: 64 }                        // whole seconds from the session's start to this send (written last)
```

Device numbers are rounded **down** to those buckets (a value below the smallest bucket,
or unknown, gives the smallest). A session starts when the portal page loads and whenever
the player changes (a new profile, another avatar, a guest after «سلّم الجهاز» or the
20-minute idle hand-over). Times (`t`) are whole seconds since the session started.

**No clock time is sent.** `w` is what lets the server date a batch: it computes the
session's start as its own receipt time minus `w`, so a PC whose clock is wrong by hours
or years still dates its play correctly, and a batch held offline for days lands on the
day it was played. The sink keeps, for each session, `t0 = performance.now()` and
`w0 = Date.now()` from its start. At each send, `w` comes from `performance.now() − t0`
when the session began on this page (`performance.now()` does not jump when Windows
corrects the clock), and otherwise, for a batch reloaded from the queue, from
`Date.now() − w0`; it is never less than the batch's last `t` and at most 691,200
(8 days). It is computed at send time, so a retry of the same batch carries a larger `w`,
and every batch split from one session dates the same start. `w0` stays in the queue and
is never sent.

Every game visit is numbered in its session (`n`, from 1), and every round in its visit
(`k`, from 1): a round's end takes the number of the open round with the same id, else a
new one. The server joins a visit's and a round's events by these numbers, also across
batches.

| Event | Shape | Notes |
|---|---|---|
| session start | `['ss', t, isNew, ageDays, sinceDays, level, np, cls]` | `isNew` 1 when the player was just made on this page. `ageDays`: the profile's age in whole days (−1 for a guest). `sinceDays`: days since the profile's last play (−1 for a guest, a new profile, or one that has never played). `level` 0 for a guest. `np`: profiles on this PC (at most 24). `cls`: classroom mode on (`sg:site:classroom`). A guest on a PC without profiles is `['ss', 0, 0, -1, -1, 0, 0, 0]`. |
| older code | `['cd', t, olderCode]` | Right after `ss`, when a teacher gave this profile another PC's code (above): once per page until a batch that holds it is delivered. |
| profile removed | `['pr', t, code]` | Once per profile gone from this PC. |
| game open | `['go', t, n, slug, src, playsBefore, fav]` | `src`: the v1 launch sources of `PLAY_STATS.md` (featured, catalog, recent, favorites, category, quick, search, related, surprise, reload, history, direct) plus `starter` for the «ابدأ من هنا» card. `playsBefore`: this player's earlier visits to this game (`SGProfiles` visits), 0 for a guest. `fav` 1 when the game is hearted (`sg:site:favs`) as it opens. |
| game ready | `['ld', t, n, slug, loadMs]` | Frame created to its first `sg:ready`; only a visit's first frame, and only if the page stayed visible (as in v1). |
| game failed | `['er', t, n, slug, kind]` | `x` script error, `t` 20-second load timeout, `l` the page failed to load. Never the error text. |
| round start | `['rs', t, n, k, slug, id, tier, replayIndex]` | From the game's `sg:telemetry`. `replayIndex`: earlier starts of this slug and id in this session. |
| round end | `['re', t, n, k, slug, code, id, ms, score, tier, hits, misses, rt[6], x]` | `code` w l d e q; `score` −1 for none; reaction-time histogram (< 300, < 500, < 800, < 1200, < 2000, ≥ 2000 ms). `x`: Kit's round counters `[wallMs, inputs, idleLapses, pauses, rtSumMs, rtN, ddaPermille]` (`ARCHITECTURE.md`, "Kit v2"), or `null` from a game page built before milestone 2.5. |
| engaged so far | `['gp', t, n, slug, engagedMs]` | The engaged time of a game still open (or still closing), added when a batch is sealed, only if it grew since its last `gp` or `gx` and its session has other events waiting: it never causes a batch of its own. A visit that never closes keeps its minutes. |
| game close | `['gx', t, n, slug, engagedMs, il[6], f[4]]` | Engaged time, input-latency histogram (< 8, < 16, < 33, < 50, < 100, ≥ 100 ms) and frame buckets of the whole visit. Waits for the removed frame's own last message (1 s at most, and never past the next game's `go`). |
| tutorial | `['tu', t, n, slug, step]` | `s` the first-time help started, `d` it was done: from the game's `sg:stats` v1 (`['t', 'start']`, `['t', 'done']`), at most once per visit and step. |
| heart | `['fv', t, n, slug, on]` | The heart button pressed in this visit: 1 hearted, 0 not any more. |
| classroom timer | `['ct', t, what, minutes]` | `s` started (with its minutes), `c` cancelled, `e` ran out (minutes 0). |
| level up | `['lv', t, level]` | `SGProfiles.onLevel`, the current player only. |
| session end | `['se', t, engagedMs, why]` | After the session's games have closed, so it is always its session's last event. `why`: `h` the hand-over button, `i` the idle hand-over, `p` any other player change, `u` the page was unloaded (best effort, by a keepalive `fetch`). |

Round events come only from `sg:telemetry` version 2 of the **current game frame**, or
of a frame removed less than 2 seconds ago (its last message), as for `sg:stats` v1, and
tutorial steps from that frame's `sg:stats` v1. Every field is checked: codes, ids
(`^[A-Za-z][A-Za-z0-9_:.-]{0,23}$`, never three digits in a row, never a prototype name
such as `constructor`), tiers 0–9, histograms of exactly 6 or 4 numbers ≥ 0, scores −1 or
≥ 0, the counters (8 entries, the DDA level −1 to 1000), and the arity. A malformed event
is dropped whole; numbers are rounded and clamped to the server's limits. Malformed
counters give `x: null` and the round is kept. Kit posts at most 64 events per message, so
a round's counters (`rx`) may come one message before its end; they wait on the visit.
Messages from any other window are ignored.

**Never sent:** names, anything typed (search text, typing-test words), error text, the
PC's label or the teacher page's statistics id, the profile key, avatar or colour, the
user agent, GPU or browser strings, a date or a time of day, IP-derived data, and the
local day records. The server stores no IP address.

## Delivery

* Events wait in memory. A batch goes **when a game closes**, **60 seconds after the first
  waiting event** (one timer, only while something waits), and **when the page is hidden
  or unloads**. The server's 204 may carry **`X-Batch-Every`**: a whole number of seconds from
  20 to 600 that replaces the 60 for later timed sends (the server asks for fewer requests
  when its free daily write allowance runs low). Anything else in the header is ignored; a
  204 without it goes back to 60. The value lives only in the page's memory.
* Every send is `fetch(url, { method: 'POST', credentials: 'omit', mode: 'cors',
  keepalive })`, **never with cookies**: a cookie the browser keeps for the ingest host (a
  district sign-in on the same site, a load balancer's stickiness cookie that would link
  the session ids) never goes with a batch. That is why the sink does not use
  `navigator.sendBeacon`, which always sends them. Normal sends go one at a time, oldest
  first.
* `keepalive` lets a request outlive its page, but the browser refuses keepalive bodies
  beyond 64 KB in flight together, so the sink keeps its own within **60 KB** (a normal
  send that does not fit goes without `keepalive`). A hidden or unloading page hands
  `fetch` what waits at once, oldest first, while it fits, past what this page has in
  flight (so hiding and showing the page again never sends a batch twice in a row); the
  first batch that does not fit and every later one wait for the next send.
* **Every request has a minute** to be answered, its body read to the end included (the
  teacher's test: 20 s). Without an answer by then it is aborted and counts as no answer:
  a school filter or proxy that takes the connection and never answers is noted and backed
  off exactly like one that drops it, so the teacher page turns red within about a minute
  or two of play. A page that goes away never aborts its own requests: a `keepalive`
  request outlives it.
* **Every batch stays in the queue until the server's own answer delivers it**, also a
  batch a hidden or unloading page handed to `fetch`: a page that goes away before the
  answer leaves the batch to the next portal page, which sends it again, and marks it
  `h: 1` (handed over as the page went), so the teacher page does not count it as never
  sent. The server keeps a batch once (it de-duplicates v2 batch ids, and every write of a
  v3 batch is idempotent): a batch delivered twice is never counted twice in the KPIs.
  Nor does a batch sent again bring back a student the school forgot on the dashboard:
  for 8 days the server drops (and answers 204 to) every batch of a forgotten code whose
  session started before the forget, so the PC lets it go, and stores no mark of any
  session that names that code; a later session of that code is new play and is kept.
  Sending a batch again is not quite free, though: the server's live table counts the
  session of a batch received now as playing now, so the dashboard's «live» panel shows
  that session, its student and PC for up to 5 minutes, and a batch for a day already
  rolled marks that day for a re-roll (more D1 writes, within the cron's write guard).
  Since the last batch of every portal page goes as the page closes, this happens about
  once per PC per day, when the first page of the next day sends it again. Before this
  rule an unloading page removed what it handed over at once; on a network that drops
  requests without an answer (a school filter that blocks the server), the first short
  page that closed emptied the queue for good (28 and 29 October 2026).
* Only the server's own answers count, because a school filter or a captive portal can
  answer itself, even with a 200 or a 403: **204** (and nothing redirected) delivers the
  batch and removes it. The server's JSON error, `{ "error": "…" }`, to a **4xx other than
  429** removes it as malformed (it would never be accepted; the server accepts malformed
  optional fields rather than refuse a whole batch). Its JSON error to a **429 or 5xx**,
  any other answer and **no answer** keep the batch and back off **20, 40, 80, 160, then
  300 s** (batches that fail together, as a hidden page's do, count once). While the server
  is failing, or the PC is offline (`navigator.onLine === false`), a hidden page sends
  nothing and the queue keeps everything for later. A request that gets no answer while
  the PC is offline (the cable out, the Wi-Fi down) is noted as `offline`, not `network`,
  so the teacher page blames neither the school's filter nor the server.
* Unsent batches wait in `localStorage` **`sg:site:tm:q4:<hash>`** (an array of
  `{ t, w0, e }`, plus `h: 1` once a closing page handed it over: when the batch's first
  event was recorded, its session's start, and the envelope), oldest first, **at most
  128 KB** (the oldest go first) and **7 days**. 128 KB is a few hours of play, not a week:
  a busy PC (two-minute game visits of five rounds each, one after the other) fills it in
  about three and a half hours, so a PC whose server is blocked starts dropping its oldest
  play on the first day; the delivery record says when it last did. The batches survive a
  reload or a restart of the PC and go out from the next portal page. Two portal tabs may
  send the same queued batch; the server keeps it once. A teacher's clear
  (`statsmeta.clearedAt`) drops what was recorded before it. A clear dated after the PC's
  clock (it ran fast at the clear, and was set right since) is dated back once, in
  `statsmeta`, to the page's start or to the oldest batch waiting, whichever is older: the
  clear emptied the queue, so what waits came after it, and so did the page's play (a page
  open at the clear saw it within a minute, while its clock still ran ahead). Left as it
  was, it would hold back every batch until the clock passed it, then drop the play
  recorded in between.
* Older builds' batches move in: builds before wire version 3 queue in
  **`sg:site:tm:q:<hash>`** (`{ t, e }` with `v: 2`), and the first v3 build (before 31
  October 2026) in **`sg:site:tm:q3:<hash>`**. Such a tab may still be open on the PC after
  the update (an open tab keeps its page until it is reloaded): the first rewrites its key
  with its own wire version only, and the second, each time it is hidden, removes from its
  key every batch it hands to `fetch` without waiting for an answer, so on a blocked
  network it would empty a queue it shared with this build. So this build never writes
  either key: whenever a portal page reads its queue it moves their batches into its own
  (oldest first, each once) and removes those keys. They are sent exactly as they were
  queued; the server accepts wire version 2 indefinitely. The teacher page only reads
  those keys: moved by it, their batches would wait for a portal page of this build, while
  the older tab, which reads only its own key, stopped sending them. The next change of
  this kind takes `q5:`.
* `<hash>` is a short hash of the full ingest address (a 32-bit string hash, in base 36),
  so each address has its own queue: another copy of the site on the same origin (for
  example `name.github.io/school-games` and `name.github.io/school-games-test`) built with
  another `SG_TELEMETRY_URL` never sends, or drops, this one's batches. Both copies share
  `sg:site:rid`, so they send the same codes.
* While the sink shares, it notes the server's host in **`sg:site:tm:on`**, so the teacher
  page can say «مشاركة إحصاءات اللعب مفعّلة على هذا الجهاز … إلى <host>», and whether its
  batches arrive in **`sg:site:tm:dx`**:

  ```js
  { v: 1, u: 'https://…/v1/batch', // the address this record belongs to (another address starts again)
    ok: 1761720300000,              // when a batch was last delivered (the PC's clock; 0: never)
    f: 1761631500000,               // when the first failure since then came (0: none)
    k: 'network',                   // the latest failure: 'network' (no answer within a minute,
                                    // or not the server's), 'offline' (no answer while
                                    // navigator.onLine is false), 'server' (its 429 or 5xx)
                                    // or 'refused' (its 4xx: the batch is gone)
    at: 1761720240000,              // when that failure came
    x: 1761719000000 }              // when play no closing page handed over was last dropped
                                    // for the 128 KB or the 7 days (0: never); a delivery
                                    // does not clear it
  ```

  The sink writes it as it starts (only to set `u`), at every answer (a delivery sets
  `ok` and clears the failure, a failure keeps the first `f`) and when the queue drops a
  batch for room (then `x` is now) or age (`x` is when the batch turned 7 days old). A
  batch marked `h: 1` is dropped without touching `x`: a closing page handed it to
  `fetch`, so the server almost always has it, and only the answer never reached a page
  (counted, it would make every PC's teacher page say that play was dropped after any
  break of a week, such as the school holidays). It holds no play, so the teacher page's
  clear keeps it.
* **Check mode** (the teacher page): `teacher.html` loads `js/telemetry.js` under
  `<meta name="sg-telemetry" content="check">`. There the sink never starts a session,
  records an event, makes a code or listens to the page, and it writes nothing until the
  teacher acts (only a clear ahead of the clock is dated back, as the portal does; older
  builds' keys it only reads). `window.SGTelemetry`
  has only `active()` (always `false`), `status()` (why this page cannot send: `folder`,
  `gpc`, `local`, `none` for no address, `off` or `tm` from the teacher's settings; the
  host; the record, `x` included; the waiting batches `n`, older builds' keys included,
  with the oldest one's time `t`; and `o`, when the oldest batch that no closing page
  handed over was queued, 0 for none)
  and `check(cb)`, the teacher's «اختبر الاتصال الآن»: a `GET` of `/v1/health` beside the
  address (`new URL('health', url)`; the server answers it without its database, and only
  `200` with `"ok":true` and `3` in `accepts` counts), then this build's waiting batches one at a
  time, oldest first, while the server takes them, for a minute in all and 20 s per
  request, each answer read to its end within that time. Every answer to a batch goes into
  the record. Health alone ends a failure only when the test tried no batch and nothing
  waits, older builds' batches included: a filter may let the health check through and
  still stop the batches, so then the failure keeps the time it began, and the result says
  `reached: true` with the batches' failure (the page then asks IT to allow the address
  fully, with sending data). A batch the server refuses (its JSON error to a 4xx other
  than 429: a client and a server whose versions do not match) is dropped, as the portal
  drops it, and the next one goes. The result is then `refused`, never `ok`, and the
  record ends with the refusal. When some batches are refused and others delivered, the
  record notes the delivery and still ends with the refusal, and the result is `refused`
  with `sent` the delivered ones: the page says that the server does not take this
  version's data, and how many batches arrived. A failure of another kind after a refusal
  ends the test and is its result, as without one.
  The result's `n` counts what still waits, older builds' batches included: when only
  those wait, the test sends nothing after health (their tab sends them) and says that
  they still wait. A health that fails is noted as a
  failure that keeps its start, and a server that does not take wire version 3 as the
  server's problem (nothing was sent). With `navigator.onLine === false` the test answers
  `{ k: 'offline', reached: false, sent: 0, n }` at once, without a request and without
  writing the record. The fast build gives the teacher page no address
  (`SG_TELEMETRY` goes to the portal only), so it uses `u` from the record the portal
  wrote, read again at each call (a teacher who opens this page first, then the portal,
  needs no reload); without one there is nothing to test.
  On a downloaded folder (`file:`) it is `folder`. Like the portal, it sends without
  cookies, and the request is the same `fetch` in the same file.
* Stopping statistics or turning sharing off drops every queue on this origin (another
  copy's too), both notes and every waiting event; the codes stay. The teacher page's
  **clear** removes every `sg:site:tm:` key except the notes `sg:site:tm:on` and
  `sg:site:tm:dx` (this PC still shares), and a portal page that is still open drops
  whatever it recorded before the clear (`statsmeta.clearedAt`). Neither touches the
  server: to delete a child's data there, the school uses the child's code on the dashboard.
* Every storage call is guarded (with blocked storage the queue lives in memory for that
  page, and sessions have no codes), nothing is logged, every promise is caught, and no
  call into the sink throws.

The browser itself prints «Failed to load resource: the server responded with a status
of 5xx» (or `net::ERR_FAILED` when nothing answers) in the developer console when the
ingest server answers with an error; the site's own code never logs.

**The school's web filter must allow the server's host** (for this project's site,
`school-games-telemetry.services-agreement137.workers.dev`), for `GET` and `POST` over
HTTPS from the PCs. A filter that blocks it usually drops the request or answers with its
own page, which the browser cannot read across origins, or holds the connection open:
the PCs keep their batches (at most 128 KB each, a few hours of busy play, and 7 days)
and the teacher page says «لا تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات منذ …», names the
host and asks for it to be allowed, and that play is dropped once the PC's queue is full.

## Turning it on

Wire version 3 needs a server that accepts it: deploy the server first and check that
`GET /v1/health` answers `"accepts":[2,3]` before publishing a portal that sends v3. An
older server answers v3 with 400, and the sink would drop those batches for good. The
workflow builds with the school's Worker address by default, so the push to `main` that
brings the v3 portal publishes it at once (and open tabs take it on their next load). Its
deploy job therefore first asks that server's `/v1/health` and stops before publishing
while `accepts` lacks 3: deploy the server, then run the workflow again.

1. Deploy the server (`server/README.md`: the one-click free Cloudflare setup, or Node behind
   HTTPS), with `ALLOWED_ORIGINS` set to the portal's origin (for example
   `https://name.github.io`; the Cloudflare setup already has `https://farmercarry.github.io`).
2. In the GitHub repository: **Settings → Secrets and variables → Actions → Variables →
   New repository variable**, name **`SG_TELEMETRY_URL`**, value the full ingest address,
   for example `https://telemetry.example.org/v1/batch`. It is a variable, not a secret:
   the address ends up in the public page anyway.
3. Run the workflow (or push to `main`). `.github/workflows/build.yml` passes the variable
   only to its "Build the fast site" steps; the build log then says
   `telemetry: the portal sends play events without names to telemetry.example.org`.

A local fast build: `SG_TELEMETRY_URL=https://telemetry.example.org/v1/batch node tools/build.mjs`.
The build accepts only an `https://` address of at most 200 characters made of URL
characters (no quotes, spaces, backslashes, `<` or `>`), without a user name or password,
and stops with an error otherwise. It writes `window.SG_TELEMETRY={url:"…"};` in front of
the portal's inlined `js/telemetry.js` and nowhere else: not into `teacher.html` (which
inlines the same sink in check mode and takes the address from the portal's record), the
games, `sw.js`, or a `--kill-sw` build. Unset or empty, the build output is exactly what it
was before. The offline ZIP holds the same portal, which never sends from a folder.

To turn it off again, delete the variable and rebuild. A teacher can stop it on one PC by
stopping statistics on the teacher page.

## Checking that it works

* The built `_site/index.html` contains `window.SG_TELEMETRY={url:` exactly once.
* On the published site, in the browser's developer tools: `SGTelemetry.active()` is
  `true`; `localStorage['sg:site:rid']` holds this PC's code (and one per profile that has
  played); the Network tab shows a `POST` to the address (type `fetch`, without a `Cookie`
  header) about 60 seconds after load or when a game closes, answered with `204`; its body
  has `"v":3`, `u`, `p`, `z` and `w`; no `sg:site:tm:q4:` (or older `sg:site:tm:q3:` or
  `sg:site:tm:q:`) key is left in `localStorage` once batches are delivered.
* **On each school PC, the teacher page** (🏫 → 📊) shows the box «الإرسال إلى لوحة
  المؤشرات في المدرسة»: the line that sharing is on, with the server's host; in green
  «✓ تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات.» or in red since when they do not, with
  the reason in plain words, or in grey «لم يتأكد وصول …» when batches no closing page
  sent have waited more than 15 minutes since the last delivery; the last delivery («آخر
  وصول إلى لوحة المؤشرات»), what waits («ينتظر الإرسال») and, in the 7 days after unsent
  play was dropped for room or age, when («حُذف قبل أن يصل»). Its button **اختبر الاتصال الآن** asks the server now and sends
  what waits: «✓ يصل هذا الجهاز إلى خادم الإحصاءات …» with the number of batches sent, or
  «✗ تعذّر الوصول إلى خادم الإحصاءات من هذا الجهاز …» with the address to give the school's
  IT (or, on a PC with no connection at all, «✗ هذا الجهاز غير متصل بالإنترنت الآن. …»,
  and nothing for IT). Open the page on the PC the children use, in the same browser, from the website (a
  downloaded folder says that it never sends). Its «الرموز في لوحة المؤشرات» section
  shows this PC's code. In the developer tools, `SGTelemetry.status()` answers the same
  on the portal and on the teacher page.
* On the server: `GET /v1/health`, then `GET /v1/admin/live` and `GET /v1/admin/students`
  with the admin token.

## Checks

* `tools/tests/telemetry-client.test.mjs` (browser): real rounds of tic-tac-toe and the
  starter card reach a stand-in ingest server with the exact v3 envelope and events
  (visit and round numbers, Kit's round counters, exact profile ages and plays), and with
  nothing that could name a child or a PC (the teacher page's PC id `pcwxyz`, the label,
  the profile key, picture and colour, the user agent, dates and times); every batch it
  sends passes the server's own `validateBatch` (`server/schema.mjs`, which imports
  `server/clock.mjs`) whole, with no event dropped or changed and no optional field
  blanked (before the server is in the checkout, point `SG_SERVER_SCHEMA` at a copy of
  `schema.mjs` with `clock.mjs` beside it; without either, only that check is skipped and
  the test says so); every gate (no address, `http://`, a quote, this computer without
  `allowLocal`, Global Privacy Control, statistics stopped, sharing off) sends and stores
  nothing, makes no code, and games get `telemetry: false`; a code per profile, stable
  across sessions and reloads, none for a guest, one per PC, removed profiles told once,
  a damaged `sg:site:rid` repaired, and no codes when storage refuses them; a teacher's
  transfer giving the new code and one `cd` per page until it is delivered, a lost batch
  naming it again, a given code removed without `pr`; `w` for retries, split batches, reloaded and
  older queue entries; the 60-second timer and `X-Batch-Every`; tutorials, hearts, the
  classroom timer, `gp`, `np`, `cls` and every `se.why`; back-off 20, 40, 80, 160, 300 s
  with a fake clock, for 5xx and for no answer at all; 400 and 429; a request that is never
  answered is aborted after a minute, noted as a network failure (since its first time)
  and backed off; a send that fails while `navigator.onLine` is false noted as `offline`,
  still since the first failure, and the teacher's test then answering `offline` without
  a request or a write; the queue across a reload, its 128 KB, 7-day and clear rules (a clear
  dated after the PC's clock holds nothing back, and one dated ahead by a fast clock that
  is set right later never drops the play recorded until the clock passes it; a clear
  drops the open page's earlier events even after `status()`), the record of play dropped
  for room or age, never of batches a closing page handed over (after the holidays), and
  v2 entries sent unchanged; keepalive sends on a hidden page and at unload, with no cookie of the ingest
  host on either path (the unloading page's request is seen by an interception for the
  whole browser), every batch kept until its answer, the 60 KB keepalive budget beside a
  send still on its way, and offline; the incident of 28 October (a failed batch, then a
  1.5 s page that closes on a network that fails: nothing is lost, the batches are marked
  as handed over, and the next page sends it all, oldest first); only the server's 204 delivering and only its JSON 4xx dropping (a
  filter's 200 and 403 pages and a non-JSON 400 keep and back off), and the delivery record
  after each kind of answer; check mode on the teacher page (no session, no write, no
  request until the test; health, then the waiting batches; health answered but the
  batches failing, which keeps when the failure began; a filter's page, a server without
  wire version 3, stopped statistics; the portal's address read again after the teacher
  page opened first; answers whose body never ends cut off after 20 s); two copies of the
  site on one origin with two addresses, each sending only its own queue, and a stop
  dropping both; a tab of a pre-v3 build and one of the first v3 build (whose hidden page
  empties its key) never dropping this build's batches; the teacher page beside both
  builds' keys, which its status counts and its test counts as still waiting but only
  reads, sending this build's batch alone; with only an older build's batches waiting and
  a failure recorded, a test that asks health alone and keeps the failure; a test whose
  batch the server refuses, alone and before a delivered one, which answers `refused` and
  ends the record with the refusal; the first v3
  build's own `js/telemetry.js` (from `git show b713f12`; a checkout without that history
  skips it) in a tab beside the teacher page, which still sends its batch itself; a new
  session per player with
  the old one ending after its game; field-by-field checks of `sg:telemetry` and late
  frames; load failures; a stop from another tab that keeps the codes.
* `tools/tests/telemetry-e2e.test.mjs` (browser and the real Node server): three sessions
  of one profile are one student in `/v1/admin/students` with the minutes it played, the
  facts hold its codes and the zone name, dated from `w`, and the database holds nothing
  that could name a child or a PC; on two simulated PCs a teacher's transfer through the
  teacher page makes one student of both codes, with all three sessions; and with the
  school's filter blocking the server, a played round and a short second page lose
  nothing, the teacher page names the host to allow, and once it is allowed its test
  delivers everything that waited: the server has both sessions and the minutes.
* `tools/tests/build-safety.test.mjs`: the address reaches the portal only, bad addresses
  are refused before any output changes, and an unset or empty variable changes nothing;
  the same for `SG_SITE_URL`, the published site's address, which reaches the teacher page
  only.
* `tools/tests/play-stats-rules.test.mjs` and `tools/check-all.mjs` share
  `tools/lib/network-rules.mjs`: `fetch()` is allowed in exactly `js/telemetry.js` (and,
  in the fast build, only in the exact inlined copy of it in the portal and the teacher
  page); every other network
  API, `sendBeacon` included, stays banned there, and the same calls anywhere else fail.
* `tools/tests/teacher-page.test.mjs`: the note, the sharing line, the codes panel and the
  transfer (check character, refusals, `k`, `l` and `g`, a correction that links no given
  code, disabled while sharing is off), clear
  removing the `sg:site:tm:` queue while both notes, the codes and the sharing line stay;
  every message of the delivery box and of its test, word for word (the storage limit,
  grey for batches waiting unsent for long, the line for play dropped, health answered
  with the batches failing, a PC with no connection at all, which names neither the
  filter nor IT); the box on a blocked PC (red, since when, the host), its
  test failing with the address for IT and then sending both waiting batches, oldest
  first, and its result going when the box turns red later; and a downloaded folder's
  page naming the website its build was given (`SG_SITE_URL`), or, without one, the
  school's games website.

# Platform architecture (re-platform, milestone 1)

This is the contract for the re-platformed portal. It sits on top of the rules in
[`GAME_SPEC.md`](GAME_SPEC.md), [`PLAY_STATS.md`](PLAY_STATS.md) and
[`PERFORMANCE.md`](PERFORMANCE.md); where they disagree, this file wins and they are
updated to match.

## Decisions (made with the product owner)

| Question | Decision |
|---|---|
| Existing 34 games | **Kept.** They move onto the new shared runtime in waves; nothing that works is thrown away. |
| Telemetry destination | **A central HTTPS ingest server, without names (pseudonymous)** (`server/`), fed by the portal. Off unless a build is configured with an ingest URL. |
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
js/profiles.js           SGProfiles — picture profiles without names, age band, XP/levels
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
  at most 24 players kept, a full PC (the least recently saved is dropped; game pages
  built before milestone 2.5 still keep 16). A change of player
  (or, for a guest, of band) reloads the state. A player with no results yet follows
  the current band's seed.
* Every read of the controller (`level`, `tier`, `value`, `pick`) reports the tier to
  `Kit.track.tier()`, and the level (in thousandths) for the next `rx`.
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

**Round counters `rx` (milestone 2.5).** Immediately before every `re`, in the same `ev`
list, Kit pushes one more kind. `sg:telemetry` stays **version 2**: a portal from before
2.5 accepts only `rs` of length 3 and `re` of length 9, so it ignores `rx`, and a new
portal with an old game page gets no `rx` and stores `x: null`. Because of the 64-event
split, `rx` and its `re` may arrive in two messages.

```js
['rx', wallMs, inputs, idleLapses, pauses, rtSumMs, rtN, ddaPermille]
// e.g. ['rx', 99000, 6, 2, 3, 650, 2, 600], then ['re', 'w', 'L3', …]
```

| Counter | Counted | Rule |
|---|---|---|
| `wallMs` | the round's start to its end | elapsed milliseconds (`performance.now()`), engaged or not; never a time of day |
| `inputs` | every key press and click Kit sees in the round | key repeats excluded |
| `idleLapses` | a key press or click in the round after its 20 s engaged window lapsed | mouse moves, the wheel and `busy()` never count; after a pause the window is cut, so the press that resumes play is not a lapse |
| `pauses` | every Kit pause in the round (blur, hidden page, fullscreen exit, `sg:pause`, Shift+Tab) | one blur can arrive with a hidden page, which counts twice |
| `rtSumMs`, `rtN` | the same reaction times as the `re` histogram | for the exact mean |
| `ddaPermille` | `round(level × 1000)` of the last `Kit.dda` read of any controller in the page | −1 before the first read; sticky across rounds |

Everything except `ddaPermille` restarts at each round start. The first four are plain
counts kept at any time and posted only while `telemetry` is `true`; reaction times are
counted only while it is `true`, as for the histogram. Kit adds no timer and posts nothing
new: `rx` rides on the existing messages. The counters cost 195 minified bytes per game
page (about 6.6 KB of offline cache over the 34 game pages).

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

* **Picture profiles without names:** an animal (12 choices) and a colour (8). **No names,
  no typed text.** Up to 24 profiles per browser (about 20 children share a lab PC).
  A profile's random code for the school's dashboard is kept by the telemetry sink in
  `sg:site:rid` ("Telemetry sink"), never on the profile record.
* **Age band** chosen with three big number cards: `6–7`, `8–9`, `10–11`.
  The classroom panel offers a class default band used for guests.
* **Never blocking:** home renders as before; a "who's playing?" strip of big round
  avatars sits at the top of home, and the topbar shows the current player (or guest)
  with level and an XP bar. One click picks a player; a guest plays immediately.
* The current player lives in `sessionStorage` (`sg:site:player`), so a closed tab or
  the classroom "hand over the device" button returns to guest.
* **Idle hand-over** (`js/site.js`): a tab left open would give the next class the last
  child's profile. After **20 minutes** with no key press, click or wheel on the portal and
  no `sg:stats` with engaged time (`e > 0`) from the open game, the player becomes a guest;
  an open game goes back to home, where the "who's playing?" strip has focus. A classroom
  timer that is still running is kept; the hand-over overlay of one that ran out is
  cleared. The check runs on the classroom timer's 1-second tick, also when no timer is set.
* Storage `sg:site:profiles`, the first 12 profiles:
  `{ v: 1, seq, list: [{ k: 'p1', a: animal, c: colour, b: band, xp, lv, d0: day created,
  dl: last day played, g: { <slug>: visits } }] }` (days are local day numbers).
  Profiles 13 to 24 are in `sg:site:profiles:more` = `{ v: 1, list: [...same records...] }`,
  removed while there are 12 or fewer. The split keeps old tabs safe: a portal from before
  milestone 2.5 keeps the first 12 records of `sg:site:profiles` and saves the result
  back, so a key holding 24 would lose 13 to 24 to any old tab or offline copy still open
  on the PC. With at most 12 there it drops nothing, and it can add a profile only while
  that key has room; the new code refills it to 12 on its next load. `load()` reads both
  keys (the first key first, a key in both counts once, `seq` the highest key ever seen);
  `save()` writes the first key, then `:more`, so a profile moving up after a removal is
  never missing from both keys for a tab that reads in between.
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
out exactly this path. It sends **wire version 3** (milestone 2.5,
`docs/RESEARCH_TELEMETRY_SPEC.md` §B); the client details are in `docs/TELEMETRY.md`.

**Active only when all of these hold**, otherwise it is inert (sends nothing, queues
nothing, makes no code, and the portal sends `telemetry: false`):
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

**Privacy rules (enforced in the sink and again on the server):** the data is **without
names (pseudonymous)**. No names, no typed text, no error text, no PC label or teacher-page
PC id, no profile key, avatar or colour, no user-agent or GPU strings (coarse device
buckets only), no IP storage on the server, and **no wall-clock time**: times are seconds
since the session started, and the envelope's `w` (seconds from the session's start to the
send) lets the server date the session by its own clock. What is sent: a random session id
per portal session; a **random code per profile and one per PC** (12 hex each, in
`localStorage` `sg:site:rid`, made and written only while the sink is active, never derived
from anything, kept by the teacher's clear and stop), so the school's server can follow one
child's play over time without knowing who the child is; and the PC's **time zone name**,
from which the server picks the school's clock. Under GDPR-style rules the codes make this
pseudonymous personal data: parents should be told, and research publication may need
consent or an ethics review.

**Envelope** (POST body, `Content-Type: text/plain`, JSON):

```js
{ v: 3,
  b: '9f3c0a17b2e44d10',   // batch id, 16 hex
  s: '5d02be9a41c7',       // session id, 12 hex, random per portal session
  k: '5c18c6d2d1c052ad',   // build version ('src' outside the fast build)
  m: 'web',                // 'web' | 'app' (installed PWA)
  a: '6-7',                // age band of the session's player, '' if unknown
  d: [4, 4, 1920],         // device buckets: cores (1,2,4,8,16), memory GB (0,1,2,4,8), screen width (1366,1600,1920,2560)
  u: '3f9a0c51e2b7',       // the player's code, '' for a guest or when storage refused it
  p: '8c21d0e94a6f',       // this PC's code, '' when storage refused it
  z: 'Asia/Riyadh',        // the PC's IANA zone, '' if unknown
  ev: [ ... ],             // at most 200 events, at most 32 KB per batch as sealed
  w: 64 }                  // whole seconds from the session's start to this send (0..691200), written last
```

The server validates `u`, `p`, `z` and `w` leniently (a malformed one becomes `''` or
`null` and the batch is kept), because the sink drops a batch for good on any 4xx. `w`
comes from `performance.now()` for a session begun on this page, else from the queue
entry's `w0` (`Date.now()` at the session's start, never sent), and is at least the batch's
last `t`. A new session (new `s`) starts at page load and whenever the player changes.

**Events** (`t` = whole seconds since the session started; `n` the visit in its session,
`k` the round in its visit, both from 1):

| Event | Shape |
|---|---|
| session start | `['ss', t, isNew 0/1, ageDays, sinceDays, level, np, cls]` — whole days, −1 for a guest (days since also −1 for a new profile or one that never played); `np` profiles on this PC; `cls` classroom mode |
| older code | `['cd', t, olderCode]` — once, right after `ss`, when a teacher gave this profile another PC's code (the server links the older code to `u`) |
| profile removed | `['pr', t, code]` — once per profile gone from this PC (censoring, not drop-out) |
| game open | `['go', t, n, slug, src, playsBefore, fav]` — `src` from the v1 launch sources plus `starter`; the player's exact visits before; `fav` the game is hearted |
| game ready | `['ld', t, n, slug, loadMs]` |
| game failed | `['er', t, n, slug, kind]` — `t` timeout, `x` script error, `l` load error |
| round start | `['rs', t, n, k, slug, id, tier, replayIndex]` — prior starts of this slug+id in this session |
| round end | `['re', t, n, k, slug, code, id, ms, score, tier, hits, misses, rt[6], x]` — `x` Kit's `rx` counters (`[wallMs, inputs, idleLapses, pauses, rtSumMs, rtN, ddaPermille]`) or `null` |
| engaged so far | `['gp', t, n, slug, engagedMs]` — an open visit's engaged time, added when a batch is sealed beside other events, never alone |
| game close | `['gx', t, n, slug, engagedMs, il[6], f[4]]` |
| tutorial | `['tu', t, n, slug, 's' \| 'd']` — from the game's `sg:stats` v1 `['t', 'start' \| 'done']`, once per visit and step |
| heart | `['fv', t, n, slug, on]` |
| classroom timer | `['ct', t, 's' \| 'c' \| 'e', minutes]` — started (minutes), cancelled, ran out |
| level up | `['lv', t, level]` |
| session end | `['se', t, engagedMs, why]` — `h` hand-over button, `i` idle hand-over, `p` other player change, `u` unload (best effort, via a keepalive `fetch`) |

`site.js` calls the hooks `why(code)` (`h` and `i` only, just before it changes the
player), `fav(slug, on)` and `timer(what, minutes)` next to its own handlers; like every
hook they do nothing while the sink is inert. A teacher's "same child as on another PC"
on the teacher page (`js/teacher.js`, `docs/PLAY_STATS.md` section 3) writes `k[key]` and
the older code in `l[key]`; the sink sends that `cd` at the profile's next session start
and deletes `l[key]`. The check character the teacher page shows (Luhn mod 16) is never
sent.

**Delivery:** events batch in memory; a batch is sent when a game closes, 60 s after the
first waiting event (or as often as the server's last `X-Batch-Every` asked, 20 to 600 s),
and when the page is hidden, always by `fetch` without credentials
(`credentials: 'omit'`: no cookie ever goes, so never by `sendBeacon`), with `keepalive`
while the keepalive bodies in flight fit in 60 KB (the rest wait in the queue). Unsent
batches are kept as `{ t, w0, e }` in `localStorage` `sg:site:tm:q:<hash of the ingest
URL>`, so another copy of the site on the same origin with another URL never sends them (at
most 128 KB, at most 7 days old, oldest dropped first); entries of wire version 2 queued by
an older build are still sent, unchanged. Stopping statistics or turning sharing off drops
every `sg:site:tm:q` queue. Failures back off 20 → 40 → 80 → 160 → 300 s. A 2xx drops the
batch; a 4xx other than 429 drops it as malformed; 429, 5xx and network errors retry.
Teacher "clear" removes the `sg:site:tm:` queues too (not the sharing note
`sg:site:tm:on`, and not `sg:site:rid`). All storage calls are wrapped; no `console`; never
`clear()`.

## Ingest server (server/)

One Fetch-API core on two hosts: a Cloudflare Worker with D1 (the school's, deployed
from a copy of `server/`), or Node ≥ 22 with no dependencies (`node:http`,
`node:sqlite`) on any small VM or container. Deployed separately from GitHub Pages; see
`server/README.md`.

* `POST /v1/batch` → `204`. Validates the envelope and every event against the rules
  above (unknown event kinds and malformed events are dropped; an invalid envelope is
  `400`; a body over 64 KB is `413`). Wire versions 2 and 3 are accepted (milestone 2.5
  below). Stores no IP and no headers. A per-IP token bucket in memory only (generous:
  school NAT puts a whole lab behind one IP) answers `429`.
* CORS: `Access-Control-Allow-Origin` echoes an origin from `ALLOWED_ORIGINS`
  (comma-separated); no credentials; `OPTIONS` handled.
* `GET /v1/health` → `{ ok: true, accepts: [2, 3], schema: 4 }`, without the database.
* `GET /v1/admin/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD[&band=6-7]`, `GET /v1/admin/live`
  and `GET`/`POST /v1/admin/settings` with `Authorization: Bearer $ADMIN_TOKEN`:
  engagement KPIs (sessions, students, engaged minutes, minutes per student-day,
  per-game opens, completion/drop-off/win rates, per-level funnels, tier and accuracy,
  reaction-time and input-latency histograms, frame smoothness, load times, age-band
  preferences, replay distributions, level-ups, data quality), live sessions, students,
  guests and PCs in the last 5 minutes, and the school's clock and retention. Every
  group is shown, however small.
* The research reads, with the same token (milestone 2.5 below): `students`, `student?u`,
  `game?slug`, `stats?metrics`, `cohorts` and `pcs`, and `export?file` (one page of a
  research CSV file, its next page's cursor in `X-Next`); and the owner's actions,
  `POST forget {u}`, `POST link {u, to}`, `DELETE link?u` and `POST rebuild {}`. Each route takes only its methods (`405` with `Allow` otherwise);
  bodies are JSON of at most 4 KB. Admin reads but live and settings answer `429` once
  the day's D1 reads near the free limit (export pages earlier), and the actions once
  the day's writes do.
* Retention: play facts older than `RETENTION_DAYS` (default 400) or the owner's choice
  are deleted daily; the daily rollups are kept 800 days.
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
  only: `bands[].games[]` gains `winRate`, `dropOffRate`, `engagedMinutes` and `starts`.
* **Cloudflare specifics:** D1 binding `DB` with no `database_id` (Wrangler provisions it
  on the first deploy); `ADMIN_TOKEN` is a secret the Deploy button asks for (from
  `.dev.vars.example`, with a plain description in `package.json` `cloudflare.bindings`;
  without a valid one the admin endpoints answer `404 {"error":"admin password not set"}`);
  `ALLOWED_ORIGINS` (default `https://farmercarry.github.io`) and `RETENTION_DAYS` are
  plain vars; a daily cron purges old rows and a 5-minute cron deletes stale live rows;
  Workers observability stays **off** (its request logs would hold IP addresses); the
  client key for the soft rate limit is `CF-Connecting-IP`, in memory only. Wrangler is pinned (4.149.0) in
  `server/package.json`; the deploy command is `wrangler deploy`.
* `SG_TELEMETRY_URL` is the Worker's `https://school-games-telemetry.services-agreement137.workers.dev/v1/batch`,
  committed in `.github/workflows/build.yml` (a `SG_TELEMETRY_URL` repository variable
  overrides it).

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
  Fire & Ice level 3 unfinished in 64% of tries.» Milestone 2 described only groups of
  3 or more sessions; since milestone 2.5 nothing is hidden: every group is described
  with its numbers, even one child, and a number based on fewer than 5 children or 20
  tries carries a "based on 2 children" chip (a difficulty verdict on 10 to 19 tries is
  an early sign).
* **Game names** are bundled with the dashboard (`server/dashboard/names.js`, written
  from `js/catalog.js` by `make-names.mjs`; a test fails while it is out of date); the
  slug is shown only for a game it does not know. No script from another site runs on
  the dashboard (`script-src 'self'`): it could read the stored password.
* **Demo mode** (`/?demo`) shows bundled sample data, so the dashboard can be seen
  before any child plays: since milestone 2.5 the real server's own answers over a
  simulated school (`server/dashboard/demo/`, written by `make-demo.mjs`).
* **Milestone 2.5** adds the tabs (Overview, Students and a student's page, Games and a
  game's page, Habits, Learning & difficulty, PCs, Data & settings), the school's clock,
  and the research download: every row of a period as CSV files in one ZIP, with the
  data dictionary (`server/dashboard/dictionary.js`, the same columns as
  `server/export.mjs`), README, SPSS labels and an R loader (`server/dashboard/README.md`;
  the columns and validity notes are `docs/RESEARCH_DATA.md`).

## Milestone 2.5: research telemetry

The binding spec is `docs/RESEARCH_TELEMETRY_SPEC.md`. Decisions (with the product owner):

1. No names, nothing a child types, no avatar or colour, no PC label, no user agent, no
   IP. Random codes per profile and per PC are allowed, so the data is pseudonymous.
2. No suppression: every number is shown, even for one child; small samples carry a
   truthful chip instead of being hidden.
3. Days, hours and weekdays follow the school's own clock, found from the PCs' zones; the
   owner can change it with one click.
4. Count per student (a profile's code), not per PC. Guests count in totals, never as
   students.
5. Row-level facts are the source of truth; small per-day rollups are built from them for
   the dashboard. Milestone 2's daily totals are frozen, not dropped.
6. Wire format v3 is additive: Kit stays on `sg:telemetry` version 2 (it adds the kind
   `rx`), `sg:stats` v1 is unchanged, and the server accepts v2 indefinitely.
7. No wall-clock time is sent: `w` is the seconds from the session's start to the send.
8. Facts are kept 400 days by default, rollups 800.
9. The server ships first; the portal sends v3 only once `/v1/health` on the deployed
   server answers `"accepts": [2, 3]`.
10. The owner's answers to the spec's open questions: the 20-minute idle hand-over ships
    on, a PC keeps up to 24 profiles, and there are no player cards (a student code is
    always a profile's 12 hex digits; a child on two PCs is joined by the teacher page's
    code transfer or by the owner's link on the dashboard).

The server:

* **Schema 4** (`server/store.mjs`): the facts `st_sessions`, `st_visits`, `st_rounds`,
  `st_marks`, the student and PC tables, `aliases`, `settings`, `usage`,
  `roll_days` and the rollup tables `r_*`; a new database gets them directly, and a
  milestone-2 database gains them next to its frozen `agg_*` totals. The upgrade goes
  one version step per invocation; on Cloudflare that request is answered `503` with
  `Retry-After: 2` and does nothing else (at most 45 statements).
* **Ingest** writes each batch's facts with one upsert per table (rows as JSON), at most
  20 statements per request. A v3 batch is idempotent (first known values, running
  maxima, natural keys), so it needs no batch id; v2 batches keep their de-duplication
  and are numbered into visits and rounds by the server. Rounds a student ends are
  numbered as attempts per game. A session is dated by the server's receipt time minus
  the PC's elapsed seconds and counts on the school's local day it started
  (`server/clock.mjs` turns zones into offsets and day bounds for SQL).
* **The school's zone** starts unknown (UTC), may take the signed-in dashboard's zone, is
  set by the first v3 batch with a valid zone, then by the PCs' nightly vote (locked at
  three PCs), unless the owner chose it; a change marks rolled days for a rebuild.
* **The usage meter** adds up D1's rows read and written per instance and writes them
  once a minute, first in a batch (so what that batch reads of the day's usage holds
  them), and every cron run writes its own at its end; from today's writes the server
  answers `X-Batch-Every` (60, 180 or 300 seconds) so the PCs send less often near the
  free limit. The same counts hold back rebuilds, re-rolls and catch-up deletions to
  what leaves 40,000 rows for the rest of a school day under 85,000 and, above 4.2
  million reads, make admin reads answer `429` until the next UTC day.
* **Rollups** (`server/rollups.mjs`): nine `r_*` tables (days, games, levels, sources,
  devices, students, students per game, PCs, and `r_stat`'s fourteen research metrics),
  each defined by one SQL `SELECT` over the sessions of a span of local days. The same
  text rolls a day (INSERT), rebuilds it (DELETE then INSERT), rolls it again after late
  data or for a recount (an upsert that writes only changed rows, then deletes the rows
  left without facts) and answers for the days not rolled yet. `store.rollupStep`, on
  the 5-minute cron (a timer on Node), does at most one day per run, never today:
  yesterday's first roll from 01:00 at the school, then rebuilds after a zone change,
  then re-rolls after late data (at most hourly), then recounts; with nothing to roll it
  catches up on deletions a bounded step at a time. After yesterday's roll the PCs
  vote for the zone; three PCs on the top zone lock it. A test checks every table and
  metric against a JavaScript oracle over the same facts.
* **KPIs** read the frozen `agg_*` days, the rolled days and the facts of the days not
  rolled yet, and add them up. They keep milestone 2's shape with nothing suppressed
  (`minSessions` 0) and add student counts by canonical code, data quality and the
  school's clock. The part of an answer from closed days is kept in `kpi_cache` per
  rollup version (`rv`, raised by every roll and purge, and by a forget or a change of
  links) and shared by every instance. A
  test locks the answers equal to milestone 2's store from Git, with its privacy floor
  set to 0, on the same v2 batches, open, rolled or both.
* **Retention** (daily purge): facts after 400 days (`RETENTION_DAYS`, or the owner's 760),
  600 sessions a run (the 5-minute cron catches up after a shorter retention), with the
  students and PCs last seen before then; frozen days on the same rule, a week a night;
  above 425 MB the round rows of the oldest 30 days, 800 sessions a cron run.
  `facts_since` moves with the facts.
* **Research reads** (`server/admin.mjs`): the students (each canonical code with its
  days, minutes, rounds, games, PCs, links and 13 weeks of minutes), one student's page
  (days, hours, games, weeks per game, the 600 latest rounds and 100 latest sessions,
  what follows a loss), one game's page (bands, days, `r_stat` rows, tries before the
  first win, paired first and last thirds, flows in and out), the `r_stat` metrics,
  retention cohorts by the week a profile started, and the PCs with their flags. Like
  the KPIs they read the rolled days from the rollups and the open days from the facts
  through the rollups' own `SELECT`, keep the closed part per `rv`, and stay within 20
  statements; large answers (the students, the metrics) go from SQL to the reply as
  JSON text, so that a Worker stays within its 10 ms of CPU.
* **The research export** (`server/export.mjs`): eight files (students, sessions,
  visits, rounds, events, student-days, daily games with milestone 2's frozen days, PCs)
  with pinned columns; every CSV line is built in SQL from validated tokens, so no value
  needs quoting, and pages follow a key (400 sessions, or 2,500 lines, joined into one string by SQL) so each row is
  read once. The dashboard adds the headers and zips the files.
* **The owner's actions**: forgetting a student deletes the facts and per-student rows
  of the student's codes (the school-wide counts keep them until a recount); a link
  makes an older code count as a newer one, history included, one hop deep; a recount
  marks every rolled day for a diff re-roll by the cron.
* **The simulated school** (`server/simulate.mjs`): 600 children in 24 classes on 30 PCs
  in Asia/Riyadh, mostly wire v3 with some v2, sending at the sink's real cadence; with
  `--db` it writes weeks of history and rolls them up with the real `rollupStep`. The
  tests measure statements, rows written and CPU on it.
* **Updating** copies `server/` into the owner's Worker repository (all but its
  `wrangler.json`, where only `RETENTION_DAYS` changes); going back after schema 4 means
  a fixed redeploy or a D1 Time Travel restore (7 days) and milestone 2's server.

## Milestones

| Milestone | Scope |
|---|---|
| **M1** | Kit v2 (profile, track, dda, sg:telemetry), `shared/juice.js`, portal profiles/age bands/XP, telemetry sink, ingest server with KPI queries, zero-BGM sweep + guard, `bubble-bop` replaces the academy, DDA reference integrations. |
| **M2** | Cloudflare host (one-click deploy, daily aggregates on free D1), the insights dashboard, telemetry switched on. |
| M2.5 | Research telemetry: wire v3 with pseudonymous student and PC codes, row-level facts and rollups on schema 4, the school's clock, no suppression, per-student and learning views, research export. The server (schema 4, ingest, rollups, the research API and export, the simulated school) ships first; the dashboard and the portal's v3 follow. |
| M3 | DDA and tiered complexity across the whole catalog; juice retrofits; per-game mastery, daily quests and collections; portal shell visual refresh; Lightning Fingers → arcade letter-blaster. |
| M4 | New high-replayability titles on the runtime; rendering upgrades for the 3D titles. |
| M5 | Server-side insight jobs (drop-off alerts, difficulty tuning reports) and A/B tuning of DDA targets. |

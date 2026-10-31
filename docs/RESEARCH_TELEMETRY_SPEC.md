# Milestone 2.5: research telemetry. Binding spec

Status: binding. It is based on the winning design (Design 1, "facts plus rebuilt rollups"), adds every graft the judges listed, and fixes every error they verified. Where this spec and an earlier design disagree, this spec wins. Words in capitals (MUST, MUST NOT, MAY) are requirements.

Live server: `https://school-games-telemetry.services-agreement137.workers.dev`. It is deployed from the owner's repo `FarmerCarry/school-games-telemetry`, which holds a byte copy of `server/` plus its own `wrangler.json`.

---

## 0. How to read this spec

### 0.1 Owners (three engineers, disjoint files)

| Tag | Owner | Files they own (and only they edit) |
|---|---|---|
| **[C]** | Client | `js/telemetry.js`, `js/profiles.js`, `js/site.js` (the hooks, the idle hand-over and the bigger who strip; no other engineer touches it), `js/teacher.js`, `shared/kit.js`, any `games/*` file (none is needed), `tools/asset-budgets.json`, `docs/TELEMETRY.md`, `docs/PLAY_STATS.md`, `docs/PERFORMANCE.md`, the sections "Kit v2", "Profiles and age bands" and "Telemetry sink" of `docs/ARCHITECTURE.md`, and the tests `telemetry-client`, `shared-kit`, `portal-profiles`, `teacher-page`, `telemetry-e2e`, `asset-budgets`, `play-stats-rules`, `build-safety` |
| **[S]** | Server | `server/*.mjs` (with new `server/clock.mjs` and `server/export.mjs`), `server/wrangler.json`, `server/package.json`, `server/fixtures/*`, `server/README.md`, the sections "Ingest server", "Milestones" and the new "Milestone 2.5" of `docs/ARCHITECTURE.md`, and the tests `telemetry-server`, `telemetry-worker`, plus the new `telemetry-clock` and `telemetry-facts` |
| **[D]** | Dashboard | `server/dashboard/*` (with the new `demo/` folder), the new `docs/RESEARCH_DATA.md`, and the tests `dashboard`, `dashboard-insights`, plus the new `dashboard-research` |

The interfaces between owners are pinned here: the wire format (§B) between C and S, and the admin API and export lines (§F.4, §F.6) between S and D. A cross-owner test that imports another owner's module is allowed, but only to compare against this spec. The [D] test compares `dictionary.js` with the `COLUMNS` of `server/export.mjs`, and the [C] test validates batches with `server/schema.mjs`.

### 0.2 Platform limits (Cloudflare free plan)

`developers.cloudflare.com` was not reachable from this sandbox (the proxy refused the connection). These numbers are the ones the judges checked against Cloudflare's limits, pricing and changelog pages. Re-check them once before deploying.

| Limit | Value | What the design does about it |
|---|---|---|
| Worker requests | 100,000/day; static assets are free | The API needs about 7,000 a day (§D.9) |
| CPU per invocation (HTTP and cron) | 10 ms; waiting on D1 is not counted | All heavy work is SQL inside D1, and JavaScript never loops over fact rows |
| D1 queries per invocation | 50 | Batch ≤ 20, admin ≤ 20, cron ≤ 35, the migrating invocation ≤ 45 (§D.10) |
| D1 size | 500 MB per database | ≈ 220 MB after year 1, ≈ 310 MB steady; the storage guard starts at 425 MB |
| D1 rows read / written | 5,000,000 / 100,000 per day, reset 00:00 UTC; every index entry written is a row written | Few indexes; a usage meter and guards (§D.8) |
| Enforcement | **Since 2026-09-01, every free-plan D1 query fails once a daily limit is passed, until 00:00 UTC.** This stops ingest and the dashboard alike. | Reads and writes are guarded, and the server tells PCs to batch less often when writes are high |
| Cron triggers | 5 per account | The two existing crons are kept (`23 3 * * *`, `*/5 * * * *`) |
| D1 Time Travel | 7 days | This is the only rollback once schema 4 is written (§H.4) |

### 0.3 Measured traffic (this replaces every earlier estimate)

The batch rate earlier designs used (2.5 or 3.25 per session) came from `simulate.mjs`, which sends one batch per game close. The real sink sends more. `rec()` arms a timer when an event starts waiting, and Kit posts `sg:telemetry` at every round start and end. I ran the sink's cadence over `simulate.mjs`'s session shapes (14 days, 500 sessions per weekday, 5,332 sessions; the script is `scratchpad/design-lead/cadence.mjs`):

| Batch timer | Batches per session | Batches per busy day (500 sessions) |
|---|---|---|
| 20 s (today's sink) | **13.7** | 6,840 |
| 30 s | 12.3 | 6,150 |
| **60 s (v3 default)** | **9.2** | **4,600** |
| 120 s | 6.3 | 3,125 |

The same run gives 2.52 game visits, 11.07 rounds and 32 events per session. Rows per fact (measured on SQLite with the §D.2 schema, `scratchpad/design-lead/size.mjs`, packed): round 69 B, visit 67 B, session 192 B including its 3 indexes. With fragmentation this spec budgets **80 B per round, 75 B per visit and 210 B per session**.

**Step 0 (before sizing anything final, [S] with whoever has Cloudflare access):** run these queries in the D1 console (Cloudflare → Storage & databases → D1 → `school-games-telemetry` → Console):
`SELECT day, COUNT(*) FROM batches GROUP BY day ORDER BY day DESC LIMIT 14;` and `SELECT day, SUM(sessions) FROM agg_days GROUP BY day ORDER BY day DESC LIMIT 14;`
Record the batches-per-session ratio in `server/README.md`. If it is above 16, raise the default batch timer in §B.6 to 90 s.

---

## 1. Decisions (locked)

1. No names, nothing a child types, no avatar or colour, no PC label text, no user agent, no IP. Pseudonymous random codes are allowed.
2. No suppression: every number is shown, even for one child. Small samples carry a truthful chip instead of being hidden.
3. Days, hours and weekdays follow the school's own clock, chosen automatically. The owner can change it with one click.
4. Count per **student** (a profile's code), not per PC. Guests are counted in totals, never as students.
5. Facts are the source of truth: row-level `st_sessions`, `st_visits`, `st_rounds` and `st_marks`. Small per-day rollups (`r_*`) are built from the facts and are what the dashboard reads. The M2 tables `agg_*` are **frozen, not dropped**: they stay as the read-only source of the days before the update and age out through retention.
6. The wire format v3 is additive. Kit stays on `sg:telemetry` **version 2** and only adds the kind `rx`. `sg:stats` v1 stays byte-for-byte frozen. The server accepts v2 indefinitely.
7. No wall-clock time is sent. The new envelope field `w` is the number of seconds from the session start to the send.
8. Retention: 400 days of facts by default (a school year plus the summer), 800 days of rollups. One click changes it.
9. Ship order: the server (and the dashboard) first, then the client, and only after `/v1/health` on the owner's deployment answers `"accepts":[2,3]`.

---

## A. Identity

### A.1 Student code `u` and PC code `p`: `localStorage['sg:site:rid']` [C]

```json
{ "v": 1, "pc": "8c21d0e94a6f",
  "k": { "p1": "3f9a0c51e2b7", "p4": "b81e4c07d2a9" },
  "l": { "p4": "1b2c3d4e5f60" },
  "g": { "p4": "b81e4c07d2a9" } }
```

* **Owner.** `js/telemetry.js` creates and maintains this key. `js/teacher.js` may read it, and may write `k`, `l` and `g` only on an explicit teacher action (§A.8). `js/profiles.js` does not change its stored format: the code is never put on the profile record, because a pre-v3 `profiles.js` `clean()` rebuilds records from known fields and would strip it (verified error in Designs 2 and 3).
* **`pc`**: 12 lowercase hex characters, made with the existing `hex(12)` (`crypto.getRandomValues`) the first time an active sink writes the key. It is never the teacher page's `statsmeta.pc.id` (the locked client test asserts that `pcwxyz` never appears in a batch, and that id is paired with the typed PC label in teacher exports).
* **`k`**: profile key (`/^p[0-9a-z]{1,8}$/`) to code: 12 lowercase hex. There are at most 64 entries. A code is never derived from the key, the animal, the colour or anything else.
* **`l`**: pending links, profile key to the old code. These are written by the teacher-page transfer and consumed by the sink (§A.8).
* **`g`**: profile key to the code a teacher gave it through the transfer (§A.8). While `g[key] === k[key]`, the profile's code is another PC's.
* **Written only while the sink is active** (`ready && live()`), and re-read from storage before each write. This keeps the rule "an inert sink writes nothing". If the write fails (blocked or full storage), the sink sends `u: ''` and `p: ''` for that page: it never invents memory-only codes, which would create fake students and PCs.
* **Lifecycle:**
  * The code for the current profile is created in `begin()` when it is missing. Profiles made before v3 get one on their first v3 session.
  * `begin()` prunes entries (`k`, `l` and `g`) whose key is no longer in `SGProfiles.list()`, and records `['pr', t, u]` for each code made on this PC (the profile was removed: censoring, not drop-out). A code a teacher gave (`g[key] === k[key]`) goes without a `pr`: the child plays on with it on the other PC. A pending `l` of a removed profile goes with it, without a `pr`; the owner link (§A.9) can still join it.
  * `changed()` does the same when it sees a key disappear.
  * The key sits outside `sg:site:stats:` and `sg:site:tm:`, so the teacher's **clear** (`clearStats()` in `js/teacher.js`) and the **stop** path in `live()` both keep it. A teacher's clear must not break a child's long-term record: the server keeps its copy anyway.
* **Validation on read:** `v === 1`; `pc` is 12 hex or missing; every value in `k`, `l` and `g` matches `U_RE = /^[0-9a-f]{12}$/`. Anything else is dropped. A damaged key is rewritten as `{v:1, pc:'', k:{}, l:{}, g:{}}`, but only by an active sink.

### A.2 Guests

A guest sends `u: ''`. Guest sessions keep the class default band (`SGProfiles.band()`), count in every total, in PC health and in "Playing now", and are never counted as students. Guest sessions are never linked to each other.

### A.3 Session boundaries and the reason a session ended

`changed()` already starts a new session (new `s`) whenever the player key changes. v3 records why the session ended, in `se.why`:

| `why` | Set by |
|---|---|
| `h` | the hand-over button: `site.js` `#sessionEnd` handler calls `tm('why','h')` just before `prof('select','')` |
| `i` | the idle hand-over (§A.4): `tm('why','i')`, then `prof('select','')` |
| `p` | any other player change (the who strip, a profile made or removed); this is the default inside `changed()` |
| `u` | `pagehide` (the page was unloaded) |

`SGTelemetry.why(code)` accepts `h` and `i` only, and sets `sess.why` for the session that is about to end.

### A.4 Idle hand-over (20 minutes) [C, `js/site.js`]

The problem: `sg:site:player` lives in sessionStorage. While a tab stays open, the next class plays on the previous child's profile.

* `site.js` keeps `lastActive = performance.now()`. It is updated by capture listeners on `document` (`pointerdown`, `keydown`, `wheel`) and in `onGameMessage` for every `sg:stats` message from the current frame whose `e > 0`.
* `idleCheck()` runs at the top of the existing 1-second interval. It is called **before** `tickSession()`'s `if (!sessionDeadline) return;` (verified error in Design 1). The interval stays `setInterval(tickSession, 1000)`; `tickSession()` calls `idleCheck()` on its first line.
* The rule: when `prof('player') !== ''` and `performance.now() − lastActive ≥ 20 × 60000`, it does `tm('why','i')`, `prof('select','')` and `whoFocus = true`. If the classroom timer's hand-over overlay is showing (`sessionExpired`), it calls `clearSession()`; a timer that is still running is left alone. It runs `go('#/')` when a game is open, and resets `lastActive`.
* This needs the owner's yes (open question 1). Until the owner answers, it ships **on** at 20 minutes.

### A.5 Profiles per PC: 12 to 24, without breaking old tabs [C, `js/profiles.js`]

About 20 children share each lab PC, so a 12-profile cap pushes most of them into guest play.

* `MAX` becomes **24**. The `site.js` who strip already wraps (`.who-row` is a flex row). The "+" button stays while `list.length < MAX`.
* **Compatibility fix (new; not in any design).** The current `clean()` keeps only the first `MAX` records, and `load()` saves the result back. So any pre-update portal tab or offline copy still running on the PC would delete profiles 13 to 24 the next time it loads. The fix:
  * `sg:site:profiles` keeps **at most 12** records plus `seq`, in exactly today's format.
  * Records 13 to 24 go to a new key, `sg:site:profiles:more` = `{ "v": 1, "list": [ ...same record shape... ] }`.
  * `load()` reads both keys, cleans the concatenation (main first) with `MAX` 24, de-duplicates keys, and sets `seq = max(main.seq, highest key of both)`.
  * `save()` writes `:more` first (removing it when empty), then the main key.
  * The `storage` listener also reacts to `:more`.
  * An old `clean()` sees at most 12 records and drops nothing. An old tab can only create a profile while the main list has fewer than 12; the new code keeps the main key full whenever there are 12 or more.
* `Kit.dda`'s player store goes from 16 to 28 keys: a full PC's 24 profiles plus the at most 4 guest keys `_`, `_6-7`, `_8-9` and `_10-11` (`keys.length > 28` in `save()`). Old game pages still trim to 16, which only drops the DDA level of the least recently used players.
* `ss.np` (§B.3) reports the profile count, so the dashboard can flag "Profiles full" PCs.

### A.6 Labels on the dashboard

* The server stores `st_students.label` when it first sees a code. The label is the code's first 4 characters in upper case, unless another stored code already starts with those 4; then it uses 6, then 8, then 12.
* A label is always a prefix of the code, so a teacher can find it. Labels never change once given.
* The check is a primary-key range query on `u` (§D.4, W3).
* Shown as **"Student 7F3A"** / **«الطالب 7F3A»**, with the code wrapped in LRI/PDI isolates.

### A.7 PC code `p`: what it enables

* Health per physical PC: smoothness, input delay, load time, failures.
* The PC as a control variable in analysis (`(1|pc)`).
* Students per PC and PCs per student.
* "Profiles full" and "forgets profiles" flags. A PC that forgets its profiles shows many new profiles per session, or PC codes that live for one day (lab images that reset every night).
* The automatic school zone (§C).
* "N PCs on the new version".

### A.8 Cross-PC link: teacher-page code transfer, retroactive through `cd` [C]

* **Codes panel** on the teacher page (read-only), under "Codes on the school dashboard":
  * This PC's code, as `8C21-D0E9-4A6F`.
  * For each profile: its animal and colour ring, then `3F9A-0C51-E2B7-C` (the 12 hex in groups of 4 plus one check character), then "on the dashboard: Student 3F9A…".
  * A profile with no code yet shows "made the next time this child plays".
  * `teacher.js` does not load `profiles.js` (the teacher page has 5.5 KB of byte budget left). It parses `sg:site:profiles` and `:more` itself and keeps its own copies of the `ANIMALS` and `COLORS` arrays. A test asserts that they equal `SGProfiles.ANIMALS` and `SGProfiles.COLORS`.
* **Check character**: Luhn mod 16 over the 12 hex digits. Working from the rightmost digit, the factors alternate 2, 1, 2, …; each addend is `floor(f·v/16) + (f·v % 16)`; `check = (16 − sum % 16) % 16`, written as hex. It is only displayed and validated; it is never sent.
* **Action "Same child as on another PC"** (one per profile; disabled with a note while sharing is off on this PC):
  * The teacher types the 13-character code shown for that child on the other PC (case-insensitive; dashes and spaces are ignored).
  * Refused for: wrong length, a wrong check character ("one character is wrong; check the code"), or the profile's own code.
  * On success: `rid.k[key] = newCode` and `rid.g[key] = newCode`; `rid.l[key] = oldCode` when this profile had a code, no pending link is already there (keep the oldest pending link), and the old code is not one a teacher gave before (`g[key] !== oldCode`). A given code is never put in `l`, so correcting a wrong transfer never merges the wrongly given child.
  * Confirmation: «من اللعبة القادمة يُحسب لعب هذا الطفل مع رمزه على الجهاز الآخر، ويُضم إليه ما لعبه هنا من قبل.» ("From the next game, this child's play counts with their code on the other PC, and what they played here before is added to it.")
* **What the sink does with it**: at `begin()` for a profile with `rid.l[key]`, it records `['cd', t, oldCode]` right after `ss`, at most once per page. `l[key]` stays until a batch holding that `cd` is delivered, by the server's own 204 (the answer to `done()`, also for a hidden page's own send while the page is still open, or to the teacher page's connection test), so a lost batch never loses the link.
* **What the server does with it**: it writes `aliases(u_old = oldCode, u_new = envelope.u, how = 'pc')`, so the earlier history merges retroactively (§D.6).

### A.9 Owner link in the dashboard (for children who already have two codes) [S, D]

`POST /v1/admin/link {u, to}` writes `aliases(u_old = u, u_new = canonical(to), how = 'owner')`. `DELETE /v1/admin/link?u=` removes it. Chains are always kept one hop deep: on every insert the server rewrites `UPDATE aliases SET u_new = :new WHERE u_new = :old`. It refuses a link that would form a cycle.

### A.10 Player cards: dropped

The owner decided against player cards, for good. Nothing of them is built or kept: a student code is always a profile's 12 hex digits (`U_RE` above), there is no `cards` table and no `/v1/admin/cards` route, and `kind` is always `profile`. A child who plays on two PCs is joined by the teacher-page transfer (§A.8) or the owner link (§A.9).

Dropped by the owner (open question 4: no): the card codes (`c` plus 4 hex digits, and their five-character labels), the picture grid and the 🎴 label, the `cards` table, `GET` and `POST /v1/admin/cards`, the printed sheets, and the card-first eviction. Earlier mentions of them in this spec are gone; this section is the record.

### A.11 Deleting a student on the server [S]

`POST /v1/admin/forget {u}` removes:

* the student's group: the canonical code and every code aliased to it;
* their `st_sessions` (with their visits, rounds and marks), `st_students`, `st_student_pcs`, `st_student_games`, `aliases`, `r_student_day` and `r_student_game` rows.

It keeps one thing for 8 days: the group's codes with the time of the forget, in the setting `forgotten` (JSON `{code: forget_s}`), written in the same request as the deletes. While a code is there, a batch of that code whose session started at or before the forget is answered 204 and stored nowhere, and no `pr` or `cd` mark of any session that names the code is stored while the code has no `st_students` row. That keeps a PC that sends a forgotten child's waiting batch again from bringing the child back. A later session of the code is new play and is kept. It makes the row again, so from then on a removal of the profile or a link to the code is stored (a removal from before the forget that a PC sends again is older than that play, so the student is not shown as removed). The 5-minute cron removes entries 8 days old; the dashboard neither shows nor sets the key.

School-wide rollups (`r_day`, `r_game_day`, `r_stat`, …) keep the play already counted, and the confirmation says so truthfully. A later "Recount all days" or zone change recomputes them without that student. The teacher page's clear and stop never touch the server, and the teacher-page wording says so (§G).

---

## B. Wire format v3

### B.1 Envelope

The POST body is still `text/plain` JSON: at most 64 KB on the wire, at most 32 KB and 200 events per batch as sealed. The order of fields in the JSON does not matter; the sink writes `w` last.

| Field | Type and limit | Meaning | Server validation (`schema.mjs`) |
|---|---|---|---|
| `v` | `3` | wire version | `2` → the v2 path, unchanged; `3` → the v3 path; anything else → 400 |
| `b s k m a d ev` | as v2 | batch id, session id, build, mode, band, device buckets, events | **strict**, exactly as v2 (400 on error) |
| `u` | string | student code; `''` for a guest or when storage is blocked | `U_RE` or `''`; anything else becomes `''` (lenient) |
| `p` | string | PC code | 12 lowercase hex or `''`; anything else becomes `''` |
| `z` | string ≤ 40 | the PC's IANA zone, `Intl.DateTimeFormat().resolvedOptions().timeZone` | `/^[A-Za-z]+(?:[\/_+-][A-Za-z0-9]+){0,4}$/`, not a prototype name, and accepted by `Intl.DateTimeFormat` (a cached `Set` of `Intl.supportedValuesOf('timeZone')` plus `UTC`); anything else becomes `''` |
| `w` | integer 0..691200 | whole seconds from the session's start to the moment this request is handed to `fetch` | an integer in range; anything else becomes `null` (the server then uses its estimate; `clock = 'r'`) |

Example:

```json
{"v":3,"b":"9f3c0a17b2e44d10","s":"5d02be9a41c7","k":"5c18c6d2d1c052ad","m":"web","a":"8-9","d":[4,4,1920],
 "u":"3f9a0c51e2b7","p":"8c21d0e94a6f","z":"Asia/Riyadh","ev":[["ss",0,0,41,2,7,19,0],["go",3,1,"road-hopper","catalog",12,1]],"w":64}
```

The lenient optional fields follow a graft: the sink treats every 4xx as final, so a client bug in an optional field must never make the server reject (and so lose) a whole batch. `validateBatch()` returns `{ wire: 2|3, envelope: {b,s,k,m,a,d,u,p,z,w}, events, dropped }`. For v2, `u = p = z = ''` and `w = null`.

### B.2 `w`: session age at send time [C]

* `begin()` sets `sess.w0 = Date.now()` and `sess.t0 = performance.now()` (as today).
* Every queue entry becomes `{ t, w0, e }`: `w0` is the session's `w0`, and it is never sent.
* In `post(x)`:
  * If `x.e.s` is a session begun on **this page** (a map `mine[s] = t0`), then `w = floor((performance.now() − mine[s]) / 1000)`. `performance.now()` is immune to Windows clock corrections, as the classroom timer in `site.js` already relies on.
  * Otherwise (a batch reloaded from the queue), `w = floor((Date.now() − x.w0) / 1000)`.
  * Then `w = min(max(w, maxT(x.e.ev)), 691200)`. A NaN, or an entry without `w0` (queued by an older build), gives `maxT`.
* `w` is computed at send time, so a retry of the same `b` carries a newer `w`. Every envelope split from one session shares that session's `w0` and `t0`, so split batches date correctly (this fixes the verified error in Design 2's `o`).
* The JSON sent is `str(Object.assign({}, x.e, { w: w }))` for v3 entries. v2 entries go out unchanged.

### B.3 Events (v3)

`t` is whole seconds since the session started (as today, at most 604800). `n` is the visit number in the session (1..9999), from `sess.vn`, which `open()` increments. `k` is the round number in the visit (1..99999). Every event has **exactly** the fields listed; a malformed event is dropped whole, except `re.x` (below).

| Kind | Fields after the kind, in order | Validators | New relative to v2 |
|---|---|---|---|
| `ss` | `t, isNew, ageDays, sinceDays, level, np, cls` | `whole(0,1)`, `whole(-1,36500)`, `whole(-1,36500)`, `measure(999)`, `measure(99)`, `whole(0,1)` | exact profile age in days (−1 for a guest; the client clamps to ≥ 0 for profiles); days since the last play (−1 for a guest, a new profile, or one that never played); `np` = profiles on this PC; `cls` = classroom mode (`localStorage['sg:site:classroom'] === 'true'`) |
| `go` | `t, n, slug, src, playsBefore, fav` | `whole(1,9999)`, slug, `oneOf(SOURCES)`, `measure(1e6)`, `whole(0,1)` | `n`; the exact number of visits before (`p.visits(slug)`, 0 for a guest); `fav` = the slug is in `localStorage['sg:site:favs']` at open |
| `ld` | `t, n, slug, loadMs` | `measure(120000)` | `n` |
| `er` | `t, n, slug, kind` | `oneOf(['t','x','l'])` | `n` |
| `rs` | `t, n, k, slug, id, tier, replay` | `whole(1,99999)`, id, `whole(0,9)`, `measure(9999)` | `n`, `k` |
| `re` | `t, n, k, slug, code, id, ms, score, tier, hits, misses, rt, x` | as v2, plus `x` | `n`, `k`, `x` = `[wallMs, inputs, idleLapses, pauses, rtSumMs, rtN, ddaPermille]` or `null` |
| `gp` | `t, n, slug, engagedMs` | `measure(6·3600000)` | **new**: running engaged time of an open visit |
| `gx` | `t, n, slug, engagedMs, il[6], f[4]` | as v2 | `n` |
| `tu` | `t, n, slug, step` | `oneOf(['s','d'])` | **new**: tutorial start or done |
| `fv` | `t, n, slug, on` | `whole(0,1)` | **new**: the heart button pressed in this visit |
| `ct` | `t, what, minutes` | `oneOf(['s','c','e'])`, `measure(120)` | **new**: the teacher timer started (with minutes), cancelled, or ran out (minutes 0) |
| `lv` | `t, level` | `measure(999, 1)` | unchanged |
| `pr` | `t, code` | `U_RE` | **new**: a profile was removed on this PC |
| `cd` | `t, oldCode` | `U_RE`; ingest ignores it when equal to the envelope's `u` or when `u = ''` | **new**: link the old code to this session's `u` |
| `se` | `t, engagedMs, why` | `measure(864e5)`, `oneOf(['u','p','h','i'])` | `why` |

**`re.x`** (lenient): `null`, or exactly 7 entries validated as `[measure(108e5), measure(1e5), measure(1e4), measure(1e4), measure(1e9), measure(1e5), whole(-1,1000)]`. If any entry fails, `x` becomes `null` and the round is kept. `x` is `null` when the game page was built with an older Kit.

The server's own flags, computed at ingest:
* `duo = 1` when the round id matches `/(?:^|:)(?:duo|local|pvp)$/` (the same as `TWO_PLAYER` in `teacher.js`).
* The v2 buckets are kept for v3: `age_b`, `since_b` and `plays_b` follow the v2 rules, so the M2 KPI columns stay exact.

### B.4 Kit → portal (`shared/kit.js`) [C]

`sg:telemetry` stays **version 2**. Kit adds one kind:

`['rx', wallMs, inputs, idleLapses, pauses, rtSumMs, rtN, ddaPermille]`, pushed into `tev` by `mark(code)` **immediately before** each `re` (only when `code != null`, `telemetry` is on and the game has not failed).

| Counter | Where | Rule |
|---|---|---|
| `r0` | `mark()` for a round start | `r0` = the clock reading of the `tally()` just before; wall time = that reading at the end `− r0`, so it always covers the round's engaged time |
| `ri` inputs | `input(e)` | `if (roundId && !e.repeat) ri++` (key presses and clicks Kit already sees) |
| `rd` idle lapses | `engage(extendOnly)` | `if (!extendOnly && roundId && until && t >= until) rd++` (a key press or click after the 20 s window lapsed, inside an open round; after a pause `until = 0`, so it is not counted) |
| `rp` pauses | `suspend()` | `if (roundId && until !== 0) rp++` (one per stop of play: a blur and the hidden page after it, or Kit's own fullscreen exit and the portal's `sg:pause`, count once; a pause before any input in the round still counts) |
| `rsum`, `rn` | the cue branch of `input()` and in `Kit.track.react(ms)` | add the measured ms; `rn++` (next to `put(rt, …)`) |
| `dl` | `read()` in `Kit.dda` | `dl = Math.round(l * 1000)`; −1 until the first read; sticky (the DDA level of the last read before the round ended) |

Everything except `dl` resets at a round start. Budget: at most **350 minified bytes** (about 12 KB of precache over 34 pages). No timers, nothing posted at load, nothing posted standalone. `sg:stats` v1 stays byte-identical.

**Tutorials need no Kit change.** `telemetry.js` `msg()` also reads `sg:stats` **v1** messages from the current frame (or one gone under 2 s ago, with the same frame matching as for `sg:telemetry`): entries `['t','start']` and `['t','done']` in `d.r` become `['tu', t, n, slug, 's'|'d']`, at most once per visit and step (a bitmask on the visit). The 25 games that call `Kit.stats.tutorial` only use `start` and `done`. Other steps are ignored.

**Compatibility, both ways:**
* An old portal tab with a new game page: the current `round()` accepts only `rs` of length 3 and `re` of length 9, so `rx` is ignored.
* A new portal with an old game page: no `rx` arrives, so `re.x = null`.
* Mixed versions therefore never lose engaged time, frames or input latency (the error found in Designs 2 and 3, which bumped Kit to version 3).

### B.5 What the 34 games supply, with no per-game change

| Data | Games | Source |
|---|---|---|
| level id, outcome w/l/d/e/q, engaged ms, replay, wall time, inputs, idle lapses, pauses | all 34 (connect-four and tic-tac-toe through `shared/board-game.js`) | `Kit.stats.round/end`, Kit `rx` |
| score | 28; not block-world, connect-four, critter-mart, pizza-clicker, tank-splat, tic-tac-toe | `Kit.stats.end(result, score)` |
| tutorial start/done | the 25 that call `Kit.stats.tutorial` | `sg:stats` v1 `['t', …]` |
| tier, hits/misses (accuracy), RT histogram plus exact mean, DDA level | 3: bubble-bop, dino-3d, road-hopper | `Kit.dda`, `Kit.track` |
| frames (smoothness) | 31; not connect-four, tic-tac-toe, typing-test (`NO_FRAMES`) | Kit |
| load, failures, input latency | all 34 | portal plus Kit |
| local two-player rounds | air-hockey, hoop-heads, wacky-soccer, sumo-bonk, pool-party, fire-and-ice, connect-four, tic-tac-toe (ids matching `TWO_PLAYER`) | server flag `duo` |

M3 (DDA and `Kit.track` across the catalogue) adds accuracy, reaction time and DDA level to more games with no wire change.

### B.6 Sink behaviour changes (`js/telemetry.js`) [C]

1. **Envelope**: `envelope(s)` returns `{v:3, b, s, k, m, a, d, u: s.u, p: s.p, z: zone(), ev: []}`. `s.u` and `s.p` are fixed in `begin()`.
2. **Visit and round counters**:
   * `open()` sets `game.n = ++sess.vn`.
   * In `round()`: an `rs` gives `k = ++v.k` and `v.open = {k, id}`. An `re` reuses `v.open.k` when `v.open.id === id`, else takes `k = ++v.k`; then `v.open = null`.
   * An `rx` (8 entries, validated with `count()`; `dda` is −1..1000) sets `v.rx`, and the next `re` of that visit takes it as `x` and clears it. `rx` and `re` may arrive in two messages because of the 64-event split in `sendStats()`.
   * The replay index is kept exactly as today (`s.n[key]`).
3. **`gp`**: `seal()` first appends `['gp', sec(s), v.n, v.g, min(v.e, 216e5)]` for the open visit and every visit still closing, if its `v.e` changed since its last `gp` or `gx` **and** its session has other pending events. It never causes a batch of its own.
4. **Batch timer**: `rec()` arms `arm(every * 1000)` with **`every = 60`** (was 20 s). On the server's 204, `done()` reads the `X-Batch-Every` header. An integer 20..600 sets `every`; anything else is ignored. A missing header resets `every` to 60. `every` lives only in memory.
5. **Queue**: v3 batches queue under their own key, `sg:site:tm:q3:<hash>`, which no older build reads or writes (a pre-v3 tab still open on the PC rewrites `sg:site:tm:q:<hash>` with its own wire version only). `load()` moves the old key's entries in (oldest first, de-duplicated by `b`) and removes that key; it is never written. `load()` keeps entries with `e.v === 2 || e.v === 3`. Entries are `{t, w0, e}`. Everything else about the queue is unchanged (128 KB, 7 days, the clear, the address hash). A later wire version takes `q4` and moves `q3`'s entries the same way. *Since 31 October 2026* the queue is `sg:site:tm:q4:<hash>` (still wire version 3): that build keeps every batch until the server's 204, while a hidden page of the first v3 build removed what it handed over at once, so a tab of it still open would empty a shared `q3`. `load()` moves both `q:` and `q3:` in the same way; entries may carry `h: 1` (handed over by a closing page). The next key is `q5`.
6. **New hooks** on `window.SGTelemetry`, all through `hook()` (so they do nothing when inert):

   | Hook | Called by `site.js` |
   |---|---|
   | `why(code)` | §A.3 |
   | `fav(slug, on)` | the `#favBtn` handler, after `toggleFav` |
   | `timer(what, minutes)` | `#sessionStart` → `('s', minutes)`, `#sessionStop` → `('c', 0)`, the expiry in `tickSession` → `('e', 0)` |
7. **`ss`**: `ageDays = p ? max(0, today − p.d0) : −1`; `sinceDays = p && p.played && !isNew ? max(0, today − p.dl) : −1`; `np = (prof('list') || []).length`; `cls` as in §B.3.
8. **`rid`** handling as in §A.1, and `cd` as in §A.8.
9. **Header comment**: rewrite "Anonymous telemetry sink" to say what is sent (random codes per profile and per PC, the PC's zone name, seconds since the session started) and what is never sent (the existing list).

### B.7 v2 compatibility [S]

* v2 is accepted indefinitely (queues of up to 7 days, cached old portals, PWAs). `/v1/health` answers `{"ok":true,"accepts":[2,3],"schema":4}`.
* A v2 batch is stored in the **same facts**, with `u = ''`, `p = ''`, `z = ''`, `wire = 2`, `clock = 'r'`. Its visit and round numbers are assigned by the server from the session's numbering state (§D.4, v2 path). Its `ss`, `go` and so on are stored with their buckets (`age_b`, `since_b`, `plays_b`), and the exact columns are NULL.
* De-duplication for v2 uses the existing `batches` table: a repeated `b` fails the whole transaction. v3 does **not** use `batches`: every v3 write is idempotent (§D.5).

### B.8 Fixtures [S]

* New `server/fixtures/sample-batch-v3.json`: one batch with every v3 kind, including `x: null` and a full `x`.
* `sample-batch.json` (v2) stays.
* The [C] test `telemetry-client` validates every real batch with `server/schema.mjs` (v3), and requires `dropped === 0`.

---

## C. Time: the school's clock, with no configuration

### C.1 `server/clock.mjs` (new, pure, tested in Node) [S]

* `offsetMin(zone, ms)` returns the UTC offset in minutes at that instant. It uses one cached `Intl.DateTimeFormat('en-US', {timeZone, hourCycle:'h23', year,month,day,hour,minute,second})` per zone, plus a cache of offsets per 15-minute slot.
* `localDay(zone, ms)` returns `'YYYY-MM-DD'`.
* `localParts(zone, ms)` returns `{day, hour, minute, weekday}` (weekday 0 = Sunday).
* `dayBounds(zone, day)` returns `{lo, hi, o1, ch, o2}`: UTC seconds `[lo, hi)` of that local day, the offset in minutes before `ch`, and `o2` from `ch` on (`ch = hi` and `o2 = o1` on a normal day). DST days of 23 or 25 hours are exact.
* `weekStartOf(zone)` returns `'sun'` for `Asia/Riyadh`, `Asia/Kuwait`, `Asia/Bahrain`, `Asia/Qatar`, `Asia/Baghdad`, `Asia/Amman`, `Asia/Muscat`, `Asia/Aden`, `Asia/Damascus`, `Asia/Jerusalem`, `Asia/Gaza`, `Asia/Hebron`, `Africa/Cairo`, `Africa/Tripoli`, `Africa/Algiers`, and `'mon'` otherwise.
* `isZone(z)`.

SQL never applies zone rules row by row. JavaScript computes the bounds and offsets and binds them; SQL uses `start_s + t + (CASE WHEN start_s + t >= ?ch THEN ?o2 ELSE ?o1 END) * 60`.

### C.2 Session start

* For v3, R is the receipt time in seconds: `start_s = R − w`, with `clock = 'w'`.
* For v2, or a v3 batch whose `w` is null: `start_s = R − maxT(batch) − 10`, with `clock = 'r'`.
* Sanity rule: if `w < maxT`, use `maxT`. If `start_s > R` or `start_s < R − 8·86400`, use the `'r'` estimate.
* The **first batch of a session to arrive** sets `start_s`, and it is never updated (`INSERT`; the conflict branch leaves `start_s` alone).
* Only differences in the PC's own clock are used, so a PC whose clock is wrong by hours or years still dates its play correctly.
* A batch held offline for 3 days lands on the day it was played.
* A session first stored starts no earlier than the start of `facts_since`'s local day: a tab open across the deploy is counted from the deploy day, which is rolled and shown.

### C.3 The school zone (`settings`)

| `tz_source` | Meaning | How it is set |
|---|---|---|
| `none` | nothing known; `tz = 'UTC'` | the initial state |
| `dashboard` | the signed-in dashboard browser's zone | the dashboard posts `POST /v1/admin/settings {tz, source:'dashboard'}` after sign-in while the source is `none` or `dashboard` |
| `pc` | provisional, from the PCs | the first v3 batch with a valid `z` while the source is `none` or `dashboard` (write W12); afterwards the nightly vote |
| `pcs` | locked, from the PCs | the nightly vote finds ≥ 3 distinct PCs (seen in the last 14 days) on the top zone; no automatic change after this |
| `owner` | the owner's one click | `POST /v1/admin/settings {tz}`; never changed automatically |

* **The nightly vote** runs in `rollupStep` after yesterday is rolled: `SELECT z, COUNT(*) FROM st_pcs WHERE last_s >= ? AND z <> '' GROUP BY z ORDER BY 2 DESC, z LIMIT 1`.
* **A zone change** (from any source) does three things: it bumps `settings.tz_epoch`, sets `dirty = 2` (full rebuild) on every `roll_days` row since `facts_since`, and bumps `rv`. Facts never change. The cron rebuilds newest first under the read guard (§D.7), and the dashboard shows "Moving past days to the new clock: 60 of 200 days done".
* **The week start**: `settings.week_start` is `weekStartOf(tz)` while `week_source = 'auto'`. One click sets `owner`. A change of the week start bumps `rv` and clears the kept parts, so kept cohorts and weekly minutes follow the new weeks.
* **UTC's names**: `UTC`, `Etc/UTC`, `Etc/GMT`, `GMT` and the other names of UTC are stored as `UTC` (from a PC's `z` and from `POST /v1/admin/settings`).

### C.4 What follows the school clock

* A session's **day** is the local day of `start_s`. The whole session counts on the day it started; the M2 "crosses midnight counts twice" quirk is gone.
* A visit's **hour** is the local hour of `start_s + t_open`; a round's hour is the local hour of `start_s + t0`.
* The **weekday** comes from the local day.
* **"Today"** is `localDay(tz, now)`. Every admin answer carries `clock: {tz, source, offsetMin, today}`. `kpiParams()` defaults to the 30 local days ending today. The dashboard stops using `utcToday()`.
* Purge cutoffs and "this school year" (from the latest 1 August, local) use local days.

### C.5 Days before the update

`agg_*` rows are UTC **receipt** days without student data. They are read for days ≤ `settings.legacy_until` (the UTC day of the v4 deploy). The rollups `r_*` hold local days ≥ `settings.facts_since`. On the one overlap day both add up; this is documented as a "mixed day". The dashboard note says: "Before 28 Oct 2026, days followed world time (UTC) and students were not told apart."

---

## D. Storage on D1 (schema version 4) [S]

### D.1 Kept as they are

* `meta (key, value INTEGER)`: `schema` = 4.
* `batches (b, day)`: v2 de-duplication only, kept 30 days.
* `kpi_cache (key, made, rows)`: `made` now holds the `rv` the rows were made with.
* `agg_days`, `agg_games`, `agg_levels`, `agg_sources`, `agg_devices`: frozen, read only for legacy days, purged by retention.

`seen` is dropped in the migration (it only ever held two days). `live` is recreated with two more columns.

### D.2 New tables (exact DDL)

```sql
-- settings (TEXT values) and bookkeeping
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID;
  -- tz, tz_source, tz_epoch, week_start, week_source, keep_days ('' = env default), facts_since, legacy_until,
  -- v3_since, rv, rolled_through, trimmed_before, trimmed_size, trim_to (the storage guard's end), rebuild
CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY /* UTC */, reads INTEGER NOT NULL DEFAULT 0,
  writes INTEGER NOT NULL DEFAULT 0, rebuild_reads INTEGER NOT NULL DEFAULT 0, export_reads INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS roll_days (day TEXT PRIMARY KEY /* local */, dirty INTEGER NOT NULL /* 0 clean, 1 diff, 2 full, 3 recount */,
  rolled_s INTEGER NOT NULL, rows INTEGER NOT NULL DEFAULT 0 /* rows its rollups took */) STRICT, WITHOUT ROWID;

-- facts (pseudonymous, row level)
CREATE TABLE IF NOT EXISTS st_pcs (p TEXT PRIMARY KEY, first_s INTEGER NOT NULL, last_s INTEGER NOT NULL, z TEXT NOT NULL,
  cores INTEGER NOT NULL, mem INTEGER NOT NULL, screen INTEGER NOT NULL, k TEXT NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS st_students (u TEXT PRIMARY KEY, label TEXT NOT NULL, first_s INTEGER NOT NULL, last_s INTEGER NOT NULL,
  band_first TEXT NOT NULL, band_last TEXT NOT NULL, age_days_first INTEGER, removed_s INTEGER) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS st_student_pcs (u TEXT NOT NULL, p TEXT NOT NULL, first_s INTEGER NOT NULL,
  PRIMARY KEY (u, p)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS st_student_games (u TEXT NOT NULL, slug TEXT NOT NULL, rounds INTEGER NOT NULL, first_s INTEGER NOT NULL,
  PRIMARY KEY (u, slug)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS st_sessions (
  id INTEGER PRIMARY KEY, s TEXT NOT NULL UNIQUE, u TEXT NOT NULL, p TEXT NOT NULL, wire INTEGER NOT NULL,
  a TEXT NOT NULL, k TEXT NOT NULL, m TEXT NOT NULL, cores INTEGER NOT NULL, mem INTEGER NOT NULL, screen INTEGER NOT NULL,
  start_s INTEGER NOT NULL, clock TEXT NOT NULL, z TEXT NOT NULL,
  is_new INTEGER, age_days INTEGER, since_days INTEGER, age_b INTEGER, since_b INTEGER, level0 INTEGER, np INTEGER, cls INTEGER,
  se_t INTEGER, se_ms INTEGER, why TEXT,
  vn INTEGER NOT NULL DEFAULT 0, open_n INTEGER, open_slug TEXT, open_k INTEGER, last_k INTEGER NOT NULL DEFAULT 0  -- v2 numbering
) STRICT;
CREATE INDEX IF NOT EXISTS st_sessions_time ON st_sessions (start_s, u);
CREATE INDEX IF NOT EXISTS st_sessions_student ON st_sessions (u, start_s);
CREATE TABLE IF NOT EXISTS st_visits (sid INTEGER NOT NULL, n INTEGER NOT NULL, slug TEXT NOT NULL,
  t_open INTEGER, t_close INTEGER, src TEXT, plays INTEGER, plays_b INTEGER, fav INTEGER, load_ms INTEGER, err TEXT,
  engaged_ms INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0,
  il0 INTEGER, il1 INTEGER, il2 INTEGER, il3 INTEGER, il4 INTEGER, il5 INTEGER, f0 INTEGER, f1 INTEGER, f2 INTEGER, f3 INTEGER,
  PRIMARY KEY (sid, n)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS st_rounds (sid INTEGER NOT NULL, n INTEGER NOT NULL, k INTEGER NOT NULL, slug TEXT NOT NULL, id TEXT NOT NULL,
  t0 INTEGER, tier0 INTEGER, replay INTEGER,                              -- from rs
  t INTEGER, code TEXT, ms INTEGER, score INTEGER, tier INTEGER, hits INTEGER, misses INTEGER,
  rt0 INTEGER, rt1 INTEGER, rt2 INTEGER, rt3 INTEGER, rt4 INTEGER, rt5 INTEGER,  -- from re (code NULL = started, never ended)
  wall_ms INTEGER, inputs INTEGER, idle INTEGER, pauses INTEGER, rt_sum INTEGER, rt_n INTEGER, dda INTEGER,  -- re.x
  duo INTEGER NOT NULL, attempt INTEGER,
  PRIMARY KEY (sid, n, k)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS st_marks (sid INTEGER NOT NULL, kind TEXT NOT NULL /* lv fv tu ct pr cd */, t INTEGER NOT NULL,
  n INTEGER NOT NULL /* 0 when none */, x TEXT NOT NULL, PRIMARY KEY (sid, kind, t, n, x)) STRICT, WITHOUT ROWID;
  -- x: lv level | fv '1'/'0' | tu 's'/'d' | ct what||':'||minutes | pr code | cd old code
CREATE TABLE IF NOT EXISTS aliases (u_old TEXT PRIMARY KEY, u_new TEXT NOT NULL, s INTEGER NOT NULL,
  how TEXT NOT NULL /* pc | owner */) STRICT, WITHOUT ROWID;
-- live, recreated with codes
CREATE TABLE IF NOT EXISTS live (s TEXT PRIMARY KEY, slug TEXT NOT NULL, seen_minute INTEGER NOT NULL,
  u TEXT NOT NULL DEFAULT '', p TEXT NOT NULL DEFAULT '', wire INTEGER NOT NULL DEFAULT 2) STRICT, WITHOUT ROWID;
```

**Rollups.** These are keyed by the local `day`. Every sum is `INTEGER NOT NULL DEFAULT 0`, and every table is `STRICT, WITHOUT ROWID`. They are generated from a `ROLLUPS` table in `store.mjs`, in the same way `TABLES` generates the `agg_*` tables today.

| Table | Primary key | Sums |
|---|---|---|
| `r_day` | `(day, a)` | every `agg_days` sum (sessions, web, app, engaged_ms, opens, starts, ends, level_ups, errors, session_starts, new_profiles, guests, profile_age0..3, since_last0..4), plus students, new_students, guest_sessions (v3 with `u=''`), v2_sessions, linked_ms (engaged ms of sessions with `u≠''`), clock_r, unclosed (visits never closed), unended (rounds never ended), duo, hearts_on, hearts_off, timer_sessions, why_u, why_p, why_h, why_i |
| `r_game_day` | `(day, a, slug)` | every `agg_games` sum, plus students, wall_s, inputs, idle, pauses, rt_sum, rt_n, dda_sum, dda_n, score_sum, score_n, score_max, unended, duo, hearts_on, hearts_off, tu_start, tu_done, fav_opens |
| `r_level_day` | `(day, a, slug, id)` | every `agg_levels` sum, plus students, unended, hits, misses, score_sum, score_n, score_max, wall_ms, dda_sum, dda_n |
| `r_source_day` | `(day, a, src)` | sessions, opens |
| `r_device_day` | `(day, a, cores, mem, screen)` | every `agg_devices` sum |
| `r_student_day` | `(day, u)`, plus `INDEX r_student_day_u (u, day)` | `a TEXT` (band of the day's first session), sessions, engaged_ms, opens, games, rounds, w, l, d, e, q, hits, misses, rt_sum, rt_n, level_ups, first_s, last_s, pcs |
| `r_student_game` | `(day, slug, u)`, plus `INDEX r_student_game_u (u, day)` | `a TEXT`, opens, engaged_ms, rounds, w, l, d, e, q, hits, misses, rt_sum, rt_n, score_sum, score_n, score_max, dda_sum, dda_n, tier_sum, tier_n, hearts (net), first_attempt, last_attempt |
| `r_pc_day` | `(day, p)` (`p = ''` covers v2 and unknown PCs) | sessions, students, guests, engaged_ms, opens, loads, load_ms, load_max, errors, quits, f0..f3, il0..il5, np_max, new_profiles, busy_s, first_s, last_s, `k TEXT`, wire |
| `r_stat` | `(day, a, metric, slug, k1, k2)` (no secondary index: reads seek by day and band) | n, students, w, l, d, e, q, ms, wall_ms, win_ms, hits, misses, rt_sum, rt_n, score_sum, score_n, tier_sum, tier_n, dda_sum, dda_n, inputs, gap_sum, gap_n |

`r_student_day` and `r_student_game` are keyed by the **raw** code. Links are applied when they are read, so a new link never forces a rebuild. Distinct-student counts inside `r_day`, `r_game_day`, `r_level_day`, `r_pc_day` and `r_stat` use the canonical code (`COALESCE(al.u_new, s.u)` through `LEFT JOIN aliases al ON al.u_old = s.u`), as of the day's latest roll.

**`r_stat` metrics** (pinned; `a` is the session's band; `k1` and `k2` are TEXT):

| metric | slug | k1 | k2 | n | other sums | rows used |
|---|---|---|---|---|---|---|
| `hour` | `''` | local hour `00`..`23` of the visit open | weekday `0`..`6` (0 = Sunday) | visits opened | ms (engaged), students | all visits |
| `rhour` | `''` | local hour of the round start | weekday | rounds | w, l, q, hits, misses, rt_sum, rt_n | rounds with `t0` |
| `sesslen` | `''` | engaged minutes bucket `0 1 2 5 10 15 20 30 45 60` (lower bounds) | `s` student, `g` guest, `u` v2 | sessions | ms | sessions |
| `daymin` | `''` | minutes per student-day `0 5 10 15 20 30 45 60 90` | `''` | student-days (canonical) | ms | `u≠''` |
| `games` | `''` | games opened per session `1 2 3 4 5 6 8` (6 = 6–7, 8 = 8+) | `''` | sessions | | sessions |
| `visitlen` | slug | engaged seconds `0 10 30 60 120 300 600 1200` | `1` with an ended round, `0` without | visits | ms | visits |
| `flow` | from slug (`''` = session start) | to slug (`''` = session end) | `''` | transitions | gap_sum, gap_n (seconds from the previous close to the next open) | consecutive visits |
| `attempt` | slug | the student's attempt at the game: `1 2 3 4 6 11 21 51 101` (1, 2, 3, 4–5, 6–10, 11–20, 21–50, 51–100, 101+) | `''` | rounds ended | w, l, d, e, q, ms, wall_ms, win_ms, hits, misses, rt_sum, rt_n, score_sum, score_n, tier_sum, tier_n (tier > 0), dda_sum, dda_n (dda ≥ 0), inputs | `u≠''`, `duo = 0`, attempt not null |
| `tenure` | slug | weeks since the student's first play of the game, `0`..`12`, then `13` = 13+ (from `st_student_games.first_s`) | `''` | rounds ended | as `attempt` | as `attempt` |
| `persist` | slug | the round's code `w l d e q` | next: `same` (the next round of the visit has the same id), `level` (another id), `game` (no next round in the visit, but a later visit in the session), `stop` (none) | rounds | gap_sum, gap_n (seconds from this end to the next start, for `same` and `level`) | `duo = 0` |
| `fatigue` | slug | minutes since the session start at the round start, `0 5 10 15 20 30 45` | `''` | rounds ended | w, l, q, hits, misses, rt_sum, rt_n, inputs, ms | `duo = 0` |
| `qrun` | slug | losses in a row just before, `0`..`4`, `5` = 5+ | `q` the round was a quit, `x` it was the visit's last round and it was not a quit | rounds | | `duo = 0` |
| `tier` | slug | tier at start `1`..`9` | `''` | rounds ended | w, l, q, ms, win_ms | `tier0 > 0` |
| `tutorial` | slug | the visit's tutorial state: `none`, `start`, `done` | the code of the visit's first ended round (`''` when none) | visits | | the 25 tutorial games |

### D.3 Rollup semantics ("SQL twins")

* For each rollup, one `SELECT … GROUP BY` over the facts of one local day `[lo, hi)` is the **only** definition of that rollup. It is used three ways:
  * as `INSERT INTO r_x SELECT …` on the day's first roll;
  * as `INSERT … SELECT … ON CONFLICT (pk) DO UPDATE SET c = excluded.c, … WHERE (c, …) IS NOT (excluded.c, …)` for a "diff" re-roll, which writes only rows that changed;
  * as a plain `SELECT` for the open days (days not yet rolled: today, and yesterday before 01:00) in `kpis()`, `students` and `live`.
* A "full" re-roll (after a zone change, a forget, or a recount) first runs `DELETE FROM r_x WHERE day = ?`.
* Column meanings must equal the M2 meanings for v2 data:
  * `sessions` counts distinct sessions of that local day in the group.
  * `starts` counts rounds with `t0` (an `rs` was seen); `ends` counts rounds with `code`.
  * `tier_sum` and `tier_n` come from `tier0 > 0`.
  * `replay0..5` and `plays0..4` use the v2 buckets.
  * `engaged_ms` is Σ `st_visits.engaged_ms`. For v3 this includes the `gp` minutes of visits that never closed (an improvement, documented).
  * A device bucket counts a session under its first batch's buckets.

Example (the `persist` metric; a self-join on the primary key, no window function):

```sql
INSERT INTO r_stat (day, a, metric, slug, k1, k2, n, gap_sum, gap_n)
SELECT ?1, s.a, 'persist', r.slug, r.code,
  CASE WHEN nx.k IS NOT NULL THEN CASE WHEN nx.id = r.id THEN 'same' ELSE 'level' END
       WHEN EXISTS (SELECT 1 FROM st_visits v2 WHERE v2.sid = r.sid AND v2.n > r.n) THEN 'game' ELSE 'stop' END,
  COUNT(*), TOTAL(CASE WHEN nx.t0 IS NOT NULL THEN max(nx.t0 - r.t, 0) END), COUNT(nx.t0)
FROM st_sessions s JOIN st_rounds r ON r.sid = s.id
LEFT JOIN st_rounds nx ON nx.sid = r.sid AND nx.n = r.n AND nx.k = r.k + 1
WHERE s.start_s >= ?2 AND s.start_s < ?3 AND r.code IS NOT NULL AND r.duo = 0
GROUP BY s.a, r.slug, r.code, 6;
```

### D.4 Ingest (`store.ingest(valid, now)`)

**JavaScript work is O(events).** It parses ≤ 32 KB, validates ≤ 200 events, folds events per visit and round into JSON parameter arrays (one row per `(n)` and per `(n, k)`), and computes `start_s` and the local day of the start with one cached `Intl` call. The target is under 2 ms of CPU in Node for a 200-event batch.

**Pre-read** (one `db.batch` of at most 2 read-only statements, only when needed):
* **R1** session state: `SELECT id, start_s, vn, open_n, open_slug, open_k, last_k FROM st_sessions WHERE s = ?`. For v2 this is always needed. For v3 it is needed when the batch has a `re` (with the ended keys of the batch: `SELECT n, k FROM st_rounds WHERE sid = ? AND code IS NOT NULL AND (n, k) IN (SELECT value->>0, value->>1 FROM json_each(?))`, as a second result).
* **R2** attempt counters: `SELECT slug, rounds FROM st_student_games WHERE u = ? AND slug IN (SELECT value FROM json_each(?))`, only when `u ≠ ''` and the batch ends a round.

**Attempt numbers (v3, `u ≠ ''`).**
* A round of this batch is **fresh** when R1 did not show it as already ended.
* Fresh ended rounds of a slug, in batch order, get `attempt = rounds(u, slug) + 1, + 2, …`.
* W7 writes `rounds = MAX(rounds, newTotal)`, and the round upsert keeps `attempt = COALESCE(attempt, excluded.attempt)`.
* A duplicate delivery therefore computes the same numbers and changes nothing. Two **different** batches of the same code and game racing on two PCs (possible only after a link) can share a number; this is documented.
* Attempts are per raw code and in receipt order. Per PC that is play order, because the queue sends oldest first, one at a time.

**Write batch** (one `db.batch`, one transaction). A statement is included only when it applies.

| # | Statement | When |
|---|---|---|
| W0 | `INSERT INTO batches (b, day)` (a duplicate fails the transaction, as today) | v2 only |
| W1 | `st_pcs` upsert: `first_s = MIN`, `last_s = MAX`, `z`, buckets and `k` from the newer batch | `ss` in the batch and `p ≠ ''` |
| W2 | `st_sessions` upsert `ON CONFLICT (s) DO UPDATE SET` `ss` fields with `COALESCE`, `se_t`, `se_ms` and `why` with `COALESCE` (v2 also: the numbering state) `WHERE` the batch has `ss` or `se`, or is v2 | always; a no-op update writes 0 rows |
| W3 | `st_students` upsert: label rule §A.6 (`CASE WHEN NOT EXISTS (SELECT 1 FROM st_students WHERE u >= ?p4 AND u < ?p4 || 'g') …`), `first_s = MIN`, `last_s = MAX`, `band_last` from the newer one, `age_days_first` from the first | `ss` and `u ≠ ''` |
| W4 | `INSERT OR IGNORE INTO st_student_pcs` | `ss`, `u ≠ ''`, `p ≠ ''` |
| W5 | `st_visits` upsert from `json_each`. `COALESCE` for `t_open`, `src`, `plays`, `plays_b`, `fav`, `load_ms`, `err`, `t_close`, `il*` and `f*`. `MAX` for `engaged_ms` and `closed`. `slug` from any event of the visit. | events with `n` |
| W6 | `st_rounds` upsert from `json_each`. `COALESCE` for every `rs` field and every `re` field, and for `attempt`; `duo` from the id. `rs` and `re` of the same `(n, k)` in one batch are one row. | `rs` and `re` |
| W7 | `st_student_games` upsert: `rounds = MAX(rounds, excluded.rounds)`, `first_s = MIN` | fresh ended rounds, `u ≠ ''` |
| W8 | `INSERT OR IGNORE INTO st_marks` from `json_each` (`lv fv tu ct pr cd`) | those events |
| W9 | `UPDATE st_students SET removed_s = r.t FROM (… MAX(t) per code …) r WHERE u = r.u AND (removed_s IS NULL OR removed_s < r.t)`: the latest removal is kept. Answers and the export show a student removed only while `removed_s >= last_s` of the code (or of its linked codes), so later play on another PC clears it | `pr` |
| W10 | `aliases` insert plus the one-hop rewrite (§A.9), `how = 'pc'`; a new link bumps `rv` (folded into the zone statement, so the batch stays within 20 statements) | `cd` with `oldCode ≠ u` and `u ≠ ''` |
| W11 | `UPDATE roll_days SET dirty = 1 WHERE day = ? AND dirty = 0` | the session's local day ≤ `rolled_through` (late data) |
| W12 | settings: `tz` = `z` and `tz_source = 'pc'` while the source is `none` or `dashboard`; also `v3_since` on the first v3 batch | rare |
| W13 | `live` upsert (as today, plus `u`, `p`, `wire`) | always |
| W14 | `LIVE_SWEEP` | once per minute per instance |
| W15 | `usage` flush (§D.8) | once per minute per instance |

* The session id is `(SELECT id FROM st_sessions WHERE s = ?)` inside W5 to W8, so W2 runs first.
* The instance caches `settings` (`tz`, `tz_source`, `rolled_through`, `rv`, the guards) and reads them again when they are more than 5 minutes old (one statement, prepended).
* Limits: **at most 20 prepared statements per batch request**, including the pre-read and a settings refresh. A typical later batch is 4 to 6 statements.

**v2 path.** JavaScript walks the events in order with the R1 state:
* `go`: `n = ++vn`, `open_n = n`, `open_slug = slug`, `last_k = 0`, `open_k = null`.
* `ld`, `er`, `gx`, `rs` and `re` of a slug that is not the open one: they open an orphan visit (`n = ++vn`).
* `rs`: `k = ++last_k`, `open_k = k`.
* `re`: `k = open_k ?? ++last_k`, then `open_k = null`.
* `lv` becomes a mark.

W2 writes the new state. Two v2 batches of one session processed concurrently (parallel keepalive sends at `pagehide`) can mis-number; the `COALESCE` upserts then merge them. This is documented for legacy v2 only.

### D.5 Idempotency (v3)

A v3 batch delivered twice, in sequence or at the same moment on two instances, MUST leave every table byte-identical to one delivery, apart from `live.seen_minute` and `usage`. This is what lets v3 skip `batches`, which saves 2 writes per batch. The rules: `COALESCE` for first-known values, `MAX` for running totals, `INSERT OR IGNORE` on natural keys, and `MAX(rounds, …)` for attempt counters. A test locks it (§H.5).

### D.6 Reading with links

Per-student endpoints and exports map every code to its canonical code: `COALESCE(al.u_new, x.u)` with `LEFT JOIN aliases al ON al.u_old = x.u`. Distinct counts over a range come from `r_student_day` (closed days) plus the facts (open days) by canonical code. Exports carry both `student` (the raw code) and `student_linked` (the canonical code).

### D.7 Roll scheduling (`store.rollupStep(now)`, on the 5-minute cron; Node: every 5 minutes)

Each run does at most **one** day, in this order:

1. **First roll.** The oldest local day `D` with `D < today`, `D ≥ facts_since`, no `roll_days` row, and (for `D = yesterday`) local time ≥ 01:00. It runs a plain INSERT, then upserts `roll_days (D, 0, now)`.
2. **Full re-roll.** A `roll_days` row with `dirty = 2`, newest first, under the read cap.
3. **Diff re-roll.** A `roll_days` row with `dirty = 1` and `rolled_s < now − 3600` (debounce: at most once an hour per day), oldest first.
4. **Recount.** The owner's "Recount all days" marks `dirty = 3`; those days are re-rolled newest first as a diff, after every `dirty = 2` day.

After a roll it sets `rolled_through` (the newest `D` such that every day from `facts_since` to `D` has a row), increments `settings.rv`, and deletes `kpi_cache` rows whose `made ≠ rv`. The vote (§C.3) runs after the day's first roll of yesterday.

**Read cap:** rolls 2 to 4 are skipped for the rest of the UTC day once `usage.rebuild_reads > 2,000,000` or `usage.reads > 3,000,000`. Roll 1 always runs.

**Write budget:** rolls 2 to 4, and the deletions the cron catches up on (§D.11), start only while today's writes, plus the work's estimate (from `roll_days.rows`, twice that for a full re-roll, 15,000 before it is known), plus a reserve of 40,000 for the rest of the day's batches, roll and purge, stay at or under 85,000. Otherwise they wait, if need be for the next UTC day.

A roll is one `db.batch` of about 24 statements: the 9 rollup tables and 14 `r_stat` metrics, the `roll_days` upsert and the settings update. The cron invocation is at most 35 statements with the sweep and the settings read. Cron CPU is statement building only, under 1 ms.

### D.8 Usage meter and guards

* **Meter.** Every D1 result's `meta.rows_read`, `meta.rows_written` and `meta.size_after` are summed per instance. They are flushed at most once a minute with W15: `INSERT INTO usage (day, reads, writes, size) VALUES (?, ?, ?, ?) ON CONFLICT (day) DO UPDATE SET reads = reads + excluded.reads, writes = writes + excluded.writes, size = excluded.size`. Rebuild and export reads also add to `rebuild_reads` and `export_reads`. The meter flushes first in an invocation that flushes, and the cron flushes its own count at the end of its run, so the cron's writes are counted. Counts can be lost when an instance dies, so the dashboard says "about".
* **Write guard**, sent in the `X-Batch-Every` header of every `204` (exposed through CORS, next to `Retry-After`): `60` while today's writes are ≤ 60,000; `180` up to 80,000; `300` above. Rolls 2 to 4 follow the write budget of §D.7 instead of a fixed pause. Above 90,000, admin POST actions (link, forget, recount) answer `429 {"error":"writes"}`.
* **Read guard:**
  * Export pages answer `429 {"error":"reads"}` once today's reads exceed 3,500,000.
  * Every admin read except `live` and `settings` answers that way above 4,200,000.
  * The dashboard says: "Today's free reading allowance is nearly used; this continues after 03:00 (school time)". The time shown is the next 00:00 UTC in the school zone.
  * Ingest is never refused by our guards.
* **Storage guard** (daily purge): when `size > 425,000,000` bytes, set `settings.trim_to` to the end of the oldest 30 days of facts and delete their `st_rounds` 800 sessions a run (the cron catches up), moving `settings.trimmed_before` as it goes. Rollups stay, so charts keep working. The Data tab says "Round-by-round details before … were removed to stay inside the free 500 MB; download the research files each term."

### D.9 Budget math (busy school: 500 sessions/day, 4,600 batches at 60 s, 2.52 visits and 11.07 rounds per session)

**Rows written per day:**

| What | Rows | How |
|---|---|---|
| `st_sessions` | 2,500 | an insert is 1 row + `UNIQUE(s)` + 2 indexes = 4, plus `se` ≈ 1 |
| `st_visits` | 4,600 | about 1 visit touched per batch |
| `st_rounds` | 8,300 | about 1.5 writes per round (`rs` and `re` often in two batches) |
| `st_student_games` | 2,400 | batches that end a round, students only |
| `st_marks` | 1,500 | `lv`, `tu`, `fv`, `ct`; about 3 per session |
| `live` (upsert + sweep) | 5,100 | 1 per batch + 1 per session |
| `st_pcs`, `st_students`, `st_student_pcs` | 900 | per session |
| `usage`, `settings`, `kpi_cache`, `roll_days` | 900 | |
| **Ingest subtotal** | **≈ 26,200** | |
| First roll of the day (≈ 5,000 rollup rows + ≈ 1,400 index entries) | 6,400 | |
| Diff re-rolls (late batches) | ≈ 500 | |
| **Year 1** | **≈ 33,100 (33%)** | |
| + facts purged after 400 days | + 9,800 | |
| **Year 2** | **≈ 42,900 (43%)** | |
| + rollups purged after 800 days | + 6,400 | |
| **Year 3 on** | **≈ 49,300 (49%)** | |

During the rollout, while PCs still send v2 at 20 s (6,840 batches/day), ingest is ≈ 39,000 a day, plus 6,840 batch-id deletions 30 days later: about 46%, and it falls as PCs update. For comparison, the M2 store writes about 7 to 10.5 rows per batch, so at the real 20 s cadence it would already use roughly 48,000–72,000 rows a day at this school size. v4 is cheaper per batch than the system running now. If a school is twice as busy, `X-Batch-Every` 180 s cuts about 4,000 a day, and Settings offers the shorter rollup retention.

**Rows read per day** (D1 counts index and table rows; the estimates below include about ×1.5):

| What | Rows |
|---|---|
| Ingest (upsert reads and the pre-read) | ≈ 50,000 |
| First roll of one busy day | ≈ 150,000 |
| Overview, 90 days, first open (closed part cached per `rv`) | ≈ 100,000 |
| Open-day part (today) every 10 minutes while a dashboard is open all day | ≤ 500,000 |
| Students tab, 90 days | ≈ 190,000 |
| Learning tab (all games, 90 days) | ≈ 135,000 |
| Habits tab | ≈ 30,000 |
| 10 game deep dives | ≈ 100,000 |
| **Typical day** | **≈ 0.6–1.2 M (12–24%)** |
| A full school-year research export (on top) | ≈ 2.1–2.6 M |
| Zone change or recount (rebuild cap) | ≤ 2 M a day |

**Storage:**

| | Year 1 | Steady (400 days of facts, 800 days of rollups) |
|---|---|---|
| Facts: rounds 1.22 M × 80 B = 98 MB; visits 277 k × 75 B = 21 MB; sessions 110 k × 210 B = 23 MB; marks ≈ 9 MB | 151 MB | ≈ 165 MB |
| Rollups (≈ 300 KB per school day) | 66 MB | ≈ 145 MB |
| Frozen `agg_*`, `batches`, `kpi_cache` and the rest | ≈ 5 MB | ≈ 3 MB |
| **Total** | **≈ 222 MB (44%)** | **≈ 313 MB (63%)** |

The storage guard starts at 425 MB.

**Measured after the milestone 2.5 review** (`server/README.md` "Free-plan arithmetic" holds the numbers, and they replace the estimates above where they differ): the rollups take about **0.55 MB per school day** of 471 sessions, not 0.3 MB (`r_stat` alone is about 0.33 MB: some 4,500 rows of 23 sums), so a busy school nears the storage guard in its third year (about 285 MB of rollups and 135 MB of facts), where the guard keeps it under 500 MB. The first roll of a school day writes about **8,000 rows**. Export pages are 2,500 lines, so a school year's export is about 700 pages.

**Requests:** 4,600 batches + 289 crons + about 1,500 dashboard calls + at most 300 export pages ≈ 6,700 a day (7%).

**CPU per invocation** (Node proxies in tests):

| Invocation | CPU |
|---|---|
| Ingest | ≤ 2 ms |
| Admin endpoints (SQL `GROUP BY`; JavaScript assembles at most about 8,000 small rows) | ≤ 5 ms |
| Export page (≤ 2,500 SQL-built lines, one string SQL joins) | ≤ 3 ms |
| Cron | ≤ 1 ms |

### D.10 Statements per invocation (tests lock these)

| Invocation | Max prepared statements |
|---|---|
| The invocation that creates or upgrades the schema (does nothing else; §H.1) | 45 |
| A v3 or v2 batch request | 20 |
| An admin request | 20 |
| The 5-minute cron (sweep + one roll) | 35 |
| The daily purge | 25 |

### D.11 Purge (daily cron `23 3 * * *`; Node at start and every 24 hours)

* **Cutoffs:**
  * `keep = settings.keep_days || env RETENTION_DAYS` (default 400).
  * Facts older than `localDay(now − keep)`: `st_rounds`, `st_visits` and `st_marks` of the oldest 600 sessions before the cutoff a run, then those sessions (the cron catches up within the write budget of §D.7, so a shorter retention never deletes a year in one run).
  * `st_students`, `st_pcs` and their `st_student_*` rows and aliases at the **rollups'** cutoff (`max(800, keep)` days), not the facts': the rollups still name them, so old periods answer the same after the facts go.
  * Rollups older than `max(800, keep)` days.
  * Legacy `agg_*` days older than `keep`.
  * `batches` older than 30 days, `usage` older than 60, `kpi_cache` whose `made ≠ rv`, and `live` out of its window.
* Then the storage guard.
* `wrangler.json` `RETENTION_DAYS` goes from `"180"` to `"400"` here **and** in the owner's repo. `settings.keep_days` (one click: 1 school year = 400, 2 school years = 760, allowed only when the storage estimate fits) overrides the environment.

---

## E. Metric catalogue

"Carried by" names the wire field each metric comes from. Each metric is available per band and for all bands. A **chip** marks a number based on fewer than 5 students or fewer than 20 tries; nothing is hidden.

| # | Metric | Computation | Carried by | Research question |
|---|---|---|---|---|
| 1 | Active students | distinct canonical `u ≠ ''` over the range | envelope `u` | How many children play? |
| 2 | Guest share, linked share | guest minutes ÷ all minutes; `linked_ms ÷ engaged_ms`; per PC | envelope `u = ''` | How complete per-student data is; profile uptake |
| 3 | Play sessions | rows of `st_sessions` per local day | envelope `s`, `ss` | Use frequency |
| 4 | **Minutes per student per day** | Σ visit `engaged_ms` per (canonical u, day): median, p25, p75, mean; the `daymin` histogram | `gx.engagedMs`, `gp.engagedMs` | Daily dose, by age |
| 5 | **Minutes per student per week** | the same per school week (`week_start`) | as 4 | Weekly dose; long-play wellbeing |
| 6 | Days active per student per week | `r_student_day` rows per week | as 4 | Habit and regularity |
| 7 | Open time and attention density | `gx.t − go.t`; engaged ÷ open | `go.t`, `gx.t`, `gx.engagedMs` | Active play compared with idle time |
| 8 | **Session length distribution** | `sesslen` (student, guest, v2) | Σ visits per session | Natural sitting length; the timer's effect |
| 9 | Games per session; exploration | `games`; distinct games per student per week | `go` | Exploring compared with sticking to one game |
| 10 | **Favourite games** (school, band, student) | minutes, opens, students; the share of the band's students who played a game on 2 or more days; top 3 per student | `go`, `gx`, `u` | What children like, by age |
| 11 | **Favourite categories and input styles** | minutes by `cats`, `inputStyle` and `players` from `js/catalog.js` (a game with 2 categories counts in both) | `go.slug` + catalogue | Genre preference by age |
| 12 | Hearts | net `fv` on − off per game, band and student | `fv.on` | Stated compared with revealed preference |
| 13 | Launch sources | share of `go.src` | `go.src` | How children find games |
| 14 | Choice time | `go.t` − the previous `gx.t` (or `ss.t`) | `go.t`, `gx.t` | Choice overload on the home screen |
| 15 | **New / returning / known-before** | profile start day = local day(`first_s`) − `age_days_first`; new in a week when the start day is in it | `u`, `ss.ageDays` | Uptake compared with return |
| 16 | **Retention cohorts** | cohort = start week (only from `v3_since`); % active in weeks +1…+12 | `r_student_day`, `st_students` | Does play last through the year, and for whom? |
| 17 | Churn and censoring | last seen 14+ days ago; `pr` = removed (censored) | `pr.code` | Who stops, and when |
| 18 | **When they play** | weekday × local hour heatmap (minutes, visits, students per occurrence) | `go.t` + `start_s` + zone | Timetable, breaks, after school |
| 19 | Performance by hour | win rate, accuracy, RT by the round's local hour (`rhour`) | `rs.t`, `re.*` | Morning compared with afternoon |
| 20 | **Level funnel and drop-off** | starts, ends, wins and unended per level in level order; distinct students reaching each level | `rs`, `re.code`, `re.id` | Where difficulty jumps |
| 21 | Exit level | the last round before a `gx` (or an unended one) | `re` + `gx` order | Where children leave a game |
| 22 | Win / loss / draw / end / quit | shares per game × band × tier | `re.code` | Outcome balance |
| 23 | Difficulty verdict | existing `insights.js` rules: 20+ tries = verdict; 10–19 = "early sign"; under 10 = "not enough tries yet", with the numbers shown | `re.code` | Too hard or too easy for each age? |
| 24 | **Tries before the first win** | per (canonical u, slug, id): rounds until the first `w`; median and p75 by band (on demand, on the game page) | `re.code`, `(n, k)` order | Mastery speed per level |
| 25 | **DDA trajectory** | mean DDA level ‰ and tier by attempt bucket and by week; a per-student step line | `re.x[6]`, `rs.tier`, `re.tier` | Does difficulty settle? Where does each age settle? |
| 26 | **Learning curve by practice** | win rate, accuracy `hits/(hits+misses)`, mean RT `rtSum/rtN`, score, time to win (`win_ms/w`), by attempt bucket | `re.*`, `re.x[4..5]`, attempt | Does practice improve skill? |
| 27 | **Skill over weeks, paired** | the same measures for students active in both the first and last third of the period (same-student change), next to naive weekly means and the `tenure` curve | `r_student_game` | Real growth, without mixing in new players |
| 28 | **Persistence after failure** | after `l` or `q`: P(same level), P(other level), P(other game), P(stop); median gap before a retry | `re` order, `rs.t` | Grit compared with frustration, by age and game |
| 29 | Losses before quitting | the `qrun` distribution | `re` order | Tolerance of failure |
| 30 | **Tiredness within a session** | win rate, accuracy, RT and inputs/min by minutes since the session started | `rs.t` | Attention decline; best session length |
| 31 | **Game-to-game flows** | top edges, entry games and exit games (`flow`) | `go.n` order | What leads to what |
| 32 | Replays | replay index distribution | `rs.replay` | Repetition as liking or as mastery |
| 33 | Action intensity | inputs per engaged minute; idle lapses and pauses per round | `re.x[1..3]`, `re.ms` | Activity level, motor skill, distraction |
| 34 | Bounces | visits under 30 s engaged with no ended round (`visitlen`) | `gx`, `re` | First-impression failures |
| 35 | Tutorial use and effect | share of visits with start/done; first-round outcome by tutorial state (correlational) | `tu.step` | Does the first-time help work? |
| 36 | Classroom effects | session length with the timer, without it, and at the timer's end; classroom mode | `ct`, `ss.cls` | Effect of classroom management |
| 37 | Hand-over practice | `se.why` shares; idle hand-overs | `se.why` | Data quality; classroom routine |
| 38 | Profile uptake and PC sharing | new profiles per week; profiles per PC (`np`); students per PC; PCs per student | `ss.isNew`, `ss.np`, `p` | Shared-device use |
| 39 | Level-ups | `lv` per student per week | `lv.level` | Progression pace |
| 40 | **PC health** | smooth and stall share (`f`), slow-input share (`il` ≥ 50 ms), load ms, failures; per PC and per device bucket | `gx.f`, `gx.il`, `ld`, `er`, `p`, `d` | Which PCs to fix; the PC as a control variable |
| 41 | Two-player share | `duo` rounds ÷ rounds (excluded from skill measures) | `re.id` | Social play |
| 42 | **Data quality** | linked share, v2 share, `clock = 'r'` share, unclosed visits, unknown band, idle hand-overs, PCs on the new version, "profiles full" PCs (`np` ≥ 24), "forgets profiles" PCs (≥ 3 new profiles per session on a day, or PC codes alive for 1 day) | all | How far each number can be trusted |

**Validity notes.** These go in the tooltips, in `README.txt` of the export and in `docs/RESEARCH_DATA.md`:

1. Engaged time counts key presses and clicks within 20-second windows, so watching without touching (a turn-based wait) is undercounted.
2. In the 3 DDA games, the win rate is held near 72% by design. Use the DDA level and tier, not the win rate, as the skill measure there.
3. A score means something different in each game (`scores.js`). Compare scores within a game only.
4. Children choose their games, so comparisons between games are confounded by who chooses them.
5. The band is picked by the child when the profile is made, and it does not move up a year. Use `band_first` as the cohort.
6. Two-player rounds are excluded from per-student skill measures.
7. Identity errors happen: a child on another child's profile (an open tab, reduced by the idle hand-over), a deleted and re-made profile, a child on two PCs without a link, a PC that forgets its profiles. Guests are never attributed.
8. Data is missing not at random: PCs where teachers stopped statistics, browsers with Global Privacy Control, the offline ZIP (never sends), and old builds (v2, "student unknown").
9. `attempt` is the order the server received a code's rounds of a game; per PC that is play order. Numbering restarts for a new code unless the codes were linked before that play. Re-rank by time in analysis if needed.
10. Times are the session start (the server clock minus the PC's elapsed seconds) plus seconds into the session. `clock_source = r` rows are estimated from the receipt time.
11. Days before `facts_since` are UTC receipt days with totals only.
12. Use the paired growth comparisons; naive weekly means mix new and practised players.
13. Small numbers carry a chip. Read them as early signs, not findings.

---

## F. Dashboard (`server/dashboard/`) [D]

The dashboard stays bilingual (Arabic RTL and English), plain classic scripts, CSP `script-src 'self'` (unchanged `_headers`), inline-SVG charts and the existing dataviz method: thin marks, one axis per chart (two measures means two charts), a hairline grid, tooltips on hover and on keyboard focus, a table twin for every chart, mirroring in RTL, Western digits.

### F.1 Files

| File | Role |
|---|---|
| `app.js` | The shell: sign-in, hash router, tab bar, filter row, `request()`, timers, the Overview. Its `utcToday()` and `range()` use `clock.today` from the server. `hiddenNote()` is removed. |
| `students.js`, `games.js`, `habits.js`, `learning.js`, `pcs.js`, `data.js` | One file per tab, each a `'self'` script registering `window.SGTabs.<name>`. |
| `charts.js` | The existing types plus `heatmap(host, opts)` (cells with a tooltip, arrow-key focus, a legend with min and max), `columns(host, opts)` (histograms and weekly columns), `multiples(host, panels, opts)` (small multiples with a shared scale), `sparkline(host, values)` (table cells) and `calendarStrip(host, days)`. |
| `research.js` (new, pure, no DOM, no clock, `module.exports` in Node like `insights.js`) | Quantiles from histograms, category sums, cohort maths, paired growth, persistence shares, attempt and tenure curves, the small-sample rule, the label helper, the research insight sentences. |
| `insights.js` | `T.MIN_SESSIONS` and the 1–2-session defence in `shown()` are removed; `shown()` only checks `suppressed !== true`, for old answers. New `researchInsights(data, options)` (≤ 5 sentences) for the Habits and Learning tabs. |
| `i18n.js` | Copy (§G). |
| `names.js` | `make-names.mjs` also writes `window.SG_GAME_INFO = { slug: { cats:[…], players: n, input:'pointer' } }` and `window.SG_CATEGORIES = { id: ['تحديات', 'Challenges'] }` (English labels from a table in `make-names.mjs`). `SG_GAME_NAMES` stays. |
| `scores.js` | Hand-written: score meaning per game, in English and Arabic, for the 28 games that pass a score (for example typing-test = words per minute, candy-rope = stars, snake-arena = length). A test checks the 28 slugs. |
| `dictionary.js` | The data dictionary: per file, its columns `[name, type, unit, values, meaning_en, meaning_ar, source, available_for]`. The column order MUST equal `COLUMNS` in `server/export.mjs`. It also renders `docs/RESEARCH_DATA.md` (`node server/dashboard/dictionary.js --md`). |
| `zip.js` | Copied from `js/teacher.js` `zip()` and `crc32()`, because `server/` must stay self-contained. It adds a streaming CRC, `CompressionStream('deflate-raw')` when available (store-only otherwise), and files assembled as Blob parts page by page (never one giant string). |
| `demo/` | Replaces `demo.json` (§F.7). |

### F.2 Shell, routes, filters

* **Tabs, as hash routes**:

  | Route | English | Arabic |
  |---|---|---|
  | `#/overview` (default) | Overview | نظرة عامة |
  | `#/students` (with `#/student/<u>`) | Students | الطلاب |
  | `#/games` (with `#/game/<slug>`) | Games | الألعاب |
  | `#/habits` | Habits | عادات اللعب |
  | `#/learning` | Learning & difficulty | التعلّم والصعوبة |
  | `#/pcs` | PCs | الأجهزة |
  | `#/data` | Data & settings | البيانات والإعدادات |

  Each tab loads its endpoint only when it is opened, and keeps the existing `keepFocus` behaviour.
* **Filter row**:
  * Period: Today, 7, 30 and 90 days, This school year (from 1 August, local), and Custom (two date inputs, at most 366 days).
  * Age: All, 6–7, 8–9, 10–11, Not set.
  * A game picker on the Games and Learning tabs, and a code search (4 to 13 characters) on the Students tab.
  * The tab and period are remembered in guarded `localStorage`.
* **Clock line** in the header: «Days and hours follow the school's clock: Asia/Riyadh (UTC+3, now 10:42), from 12 PCs. [Change]». Change opens a list of the zones the PCs report (with PC counts) plus this browser's zone, then a full `Intl.supportedValuesOf('timeZone')` select. One click posts `POST /v1/admin/settings {tz}`.
* **After sign-in**, when `clock.source === 'none'`: post `{tz: <browser zone>, source: 'dashboard'}` once.
* **Refresh**: only the Overview tiles (5 minutes) and "Playing now" (30 s) refresh themselves. The other tabs refresh when opened or on Refresh.

### F.3 Tabs

**Overview** (today's page, extended):

1. **What stands out**: the existing `insights()`, ≤ 5 sentences, with no "hidden" logic.
2. **Tiles**: Students who played · Play time · Minutes per student per day (median) · Play sessions · New students · Playing now ("14 children: 11 students, 3 guests, on 12 PCs").
3. **Data-quality strip**: "82% of play time is linked to a student." When the guest share is high, it turns into advice: "Ask children to tap their animal so their progress counts." It also shows "12 PCs on the new version; 18% of today's sessions still come from PCs on the old version (they update when someone accepts the offline update)". Total PC counts are not claimed, because old PCs send no PC code.
4. **Daily activity**: students per day and minutes per day, as two line charts.
5. **When they play**: a weekday × hour heatmap of minutes (the tooltip shows minutes, visits and average students). The rows start on `week_start`.
6. Favourite games and favourite categories (bar lists).
7. **Favourites by age**: the existing small multiples, with a minutes/opens switch.
8. **Where children get stuck** and **Difficulty check**: existing, with no hidden cells; 10–19 tries show "early sign".
9. **Coming back**: existing, plus new and returning students per week (a 2-part stack, §F.5 colours).
10. PC health summary, linking to the PCs tab.

**Students:**

* The minutes-per-student-per-week histogram and the active-days-per-week histogram.
* The cohort triangle (heatmap with a % in each cell).
* The table, sortable, 50 per page, with no medals or ranks: Student · Age · Days played · Sessions · Minutes · Minutes/day · Favourite game · Games tried · Won (of finished) · Last played · Weekly minutes (sparkline, the last 13 weeks) · PCs · 🔗 linked.
* The footnote: "A child who plays on two PCs appears as two students unless a teacher gives both profiles the same code, or you link them on the student's page."

**Student page** (`#/student/<u>`):

* **Header**: «Student 7F3A · 8–9 · first played 3 Sep · 14 days · 6 h 10 min · 2 PCs». Buttons:
  * **Link to another code**: a searchable list; confirm twice.
  * **Download this student's data (CSV)**.
  * **Forget this student**: asks twice; the text says school totals keep the play already counted.
* **Charts**:
  * minutes per week (columns), a calendar strip, and an hour-of-day columns chart;
  * games by minutes (bar list; the tooltip shows rounds, win rate, best score, hearts);
  * "Getting better?": small multiples for the top 3 games, one measure each (accuracy, score, time to win or win rate, by week and by attempt), with one plain sentence each;
  * the DDA level by attempt (step line) for DDA games;
  * "After a loss": this student's same / level / game / stop stack next to the school's;
  * recent sessions: day, school time, PC, minutes, games in order, rounds, wins, how it ended.

**Games** (a list of cards, then `#/game/<slug>`):

1. Tiles: students, minutes, opens, minutes per visit, came back another day, hearts, bounce rate.
2. Who plays it: students and minutes by age (small multiples), and a time-of-day mini heatmap.
3. Level by level: the funnel (horizontal bars in level order, using `insights.js` `levelLabel`), outcomes per level (stacked bar), unended rounds, and tries before the first win (median and p75).
4. Difficulty: the verdict per age; win rate by tier (columns); DDA level by attempt per age (multiples). Only the 3 DDA games have it; the others say "this game does not adapt yet".
5. Getting better: the attempt curve and the tenure curve per age; paired before → after per age (dumbbell); the measure switch shows only measures the game reports (`games.csv` flags).
6. After a loss and after a win: same / level / game / stop stacks, with the median retry gap.
7. Tiredness: win rate and accuracy by minutes into the session (two charts).
8. Where they come from and where they go next (top 5 each), and launch sources.
9. Score distribution (columns), with the game's score meaning.
10. On the school PCs: smoothness, loading, slow responses, failures.

**Habits**: the full-size heatmap; session length (student and guest), minutes per student-day and games per session histograms; new compared with returning; retention cohorts; top 10 game-to-game flows (bars "Road Hopper → Dino 3D", no sankey); launch sources; session end reasons; classroom timer effect; guest share per week.

**Learning & difficulty** (a game picker, or "all measured games"):

* skill growth by age (paired);
* the difficulty grid;
* DDA convergence;
* school-wide tiredness;
* persistence by game (bar list of retry-after-loss share);
* the hardest levels by tries before the first win;
* reaction-time histograms by age;
* `researchInsights()` sentences.

The tab notes plainly: "Accuracy and reaction time are measured in 3 games so far", and "Charts include play up to last night."

**PCs**:

* The per-PC table: label (the first 4 characters of the code in upper case), last seen, sessions, students, guest share, smooth %, loading s, slow responses %, failures, profiles used (max `np`), build. Flags with an icon and a label: Profiles full, Forgets profiles, Choppy, Old version.
* The existing "by PC type" health.
* Students per PC (bars).
* "How to find a PC: open the teacher page on that PC to see its code."

**Data & settings**:

* **Research files** (§F.6), with the cost estimate and a resume option.
* **The data dictionary** as a table.
* **Settings**:
  * School clock: detected zones with PC counts, one click.
  * Week starts on: Sunday or Monday.
  * Keep data: 1 school year / 2 school years.
  * "Recount all days" (marks every day for a full rebuild; asks twice; shows progress).
* **Meters**:
  * "Free plan today: about 34% of writes, 9% of reads"; "Database: 82 MB of 500 MB".
  * `trimmed_before` when set.
  * The data-quality panel in full (metric 42).

### F.4 Admin API [S implements, D consumes]

* **Auth**: Bearer `ADMIN_TOKEN` (unchanged). JSON answers carry `v: 1`. Every answer carries `clock: {tz, source, offsetMin, today}`.
* **Bodies**: POST and DELETE bodies are JSON of at most 4 KB with `Content-Type: application/json`. There is no cookie, so cross-site request forgery is not possible.
* **`admin()`** becomes a router. It allows `POST` and `DELETE` only on the routes listed with them. `405 Allow` lists the methods of each route.
* **Errors**: `400` for bad parameters, `429 {"error":"reads"|"writes", "until":"03:00"}` from the guards, `503 {"error":"updating"}` plus `Retry-After: 2` from the migrating invocation.

| Endpoint | Answer |
|---|---|
| `GET /v1/admin/kpis?from&to[&band]` | The M2 shape, unchanged (`server/README.md`), with these changes: `minSessions: 0`; no group is ever `suppressed`; `range` adds `legacyUntil` and `factsSince`; `totals.students = {active, new, returning, knownBefore, guestSessions, guestMinutes, minutesPerStudentDay: {p25, median, p75, mean}}`; `daily[].students` and `daily[].guestMinutes`; `games[]` adds `students, hearts:{on,off}, tutorials:{start,done}, wallMinutes, actionsPerMinute, avgScore, unended, duoRounds`; `levels[]` adds `students` (each day's distinct students summed over the range: student-days, not distinct students; the game page's `firstWin` counts each child once), `avgScore, unended`; `bands[]` adds `students`; `quality: {linkedShare, v2Share, clockEstimatedShare, unclosedVisits, unknownBandShare, idleHandovers, pcsNew, oldVersionSessionShare, profilesFullPcs, forgetfulPcs}`. Quantiles are computed in SQL. |
| `GET /v1/admin/live` | `{v, windowSec: 300, minSessions: 0, total: {sessions}, students, guests, unknown, pcs, games: [{slug, sessions}]}` |
| `GET /v1/admin/settings` | `{v, clock: {tz, source, offsetMin, today, now: 'HH:MM', weekStart, weekSource, detected: [{tz, pcs}], factsSince, legacyUntil, v3Since}, keep: {days, source: 'env'\|'owner', rollupDays}, storage: {bytes, limit: 500000000, guardAt: 425000000, trimmedBefore}, usage: {day, reads, writes, readsLimit: 5000000, writesLimit: 100000, batchEvery}, rebuild: {pending, full, done}, accepts: [2, 3], pcs: {new, seen14d}}` |
| `POST /v1/admin/settings` | Body `{tz?, source?: 'dashboard', weekStart?: 'sun'\|'mon', keepDays?: 400\|760}`, then the GET answer. `tz` without `source` is an owner choice. `source: 'dashboard'` is ignored unless the current source is `none` or `dashboard`. |
| `GET /v1/admin/students?from&to[&band][&after]` | `{v, range, students: [{u, label, kind: 'profile', linked: [u…], band, bandFirst, firstDay, lastDay, days, sessions, minutes, rounds, w, l, q, games, top: [slug, slug, slug], pcs, knownBefore, removed, weekly: [13 numbers]}], next?}`: canonical students by code, with today taken from the facts, in pages of at most 1.5 MB (D1 refuses a value over 2 MB): `next` is the last code of a page with more after it, and `&after=<next>` asks for the next page; the dashboard joins every page. |
| `GET /v1/admin/student?u&from&to` | `{v, student: {u, label, kind, band, bandFirst, firstDay, lastDay, profileMadeDay, knownBefore, pcs: [label…], linked: [u…]}, days: [{day, sessions, minutes, opens, rounds, w, l, q}], hours: [24 numbers], games: [{slug, minutes, rounds, w, l, d, e, q, hits, misses, rtMean, bestScore, avgScore, ddaMean, hearts}], weekly: [{week, slug, rounds, w, l, hits, misses, rtSum, rtN, scoreSum, scoreN, ddaSum, ddaN}], rounds: [≤ 600 most recent: {day, time, slug, id, code, ms, score, tier, dda, hits, misses, rtMean, attempt, minIntoSession}], sessions: [≤ 100: {day, time, pc, minutes, games: [slug…], rounds, wins, why}], persist: {same, level, game, stop}}` |
| `GET /v1/admin/game?slug&from&to[&band]` | `{v, slug, range, bands: [{band, students, minutes, opens}], daily: [{day, students, minutes, opens}], stats: {columns, rows}` (the `r_stat` rows of that slug), `firstWin: [{id, students, median, p75, never}], paired: {columns, rows: [[u, a, part 0\|1, rounds, w, l, hits, misses, rtSum, rtN, scoreSum, scoreN, ddaSum, ddaN]]}, flowsIn: [{from, n}], flowsOut: [{to, n}]}` |
| `GET /v1/admin/stats?from&to&metrics=a,b,…[&band][&slug]` | `{v, range, columns: ['a','metric','slug','k1','k2','n','students',…], rows: [[…]]}`: `r_stat` grouped over the range (closed days only); `metrics` is a subset of §D.2; `columns` holds the keys and only the sums the asked metrics have (rows whose sums are all 0 are left out) |
| `GET /v1/admin/cohorts?from&to[&band]` | `{v, weekStart, cohorts: [{week, size, active: [n0, n1, …, n12]}]}` (from `v3_since` on) |
| `GET /v1/admin/pcs?from&to` | `{v, pcs: [{p, label, firstDay, lastDay, days, sessions, students, guests, minutes, smoothShare, stallShare, avgLoadMs, slowInputShare, errors, npMax, newProfiles, z, build, flags: ['full'\|'forgets'\|'choppy'\|'old']}]}` |
| `GET /v1/admin/export?file&from&to[&after]` | §F.6 |
| `POST /v1/admin/forget` | Body `{u}`, answer `{removed: {codes, sessions, visits, rounds, marks}}` |
| `POST /v1/admin/link`, `DELETE /v1/admin/link?u=` | Body `{u, to}`, answer `{ok, u, to}`; `{ok}` |
| `POST /v1/admin/rebuild` | Body `{}`, answer `{pending}` |
| `GET /v1/health` | `{ok: true, accepts: [2, 3], schema: 4}` (it does not touch D1) |

* **Caching**:
  * Closed-day parts are kept in `kpi_cache` under `JSON.stringify([endpoint, params…, rv])`, and in instance memory for an hour.
  * Open-day parts are cached under the same key plus the 10-minute slot.
  * A cached entry must be ≤ 1 MB, otherwise it is not cached.
  * Every endpoint is ≤ 20 statements.
* **CPU**: JavaScript assembles at most about 8,000 rows; anything larger is aggregated in SQL first.

### F.5 Colours

* `--s1` (won, and every single-series chart), `--s2` (lost) and `--s3` (left unfinished) **keep their meanings** (the `style.css` header). Age bands are never mapped to s1–s3, which was a verified error in Designs 1 and 3.
* Band comparisons are **small multiples** in one hue (`--s1`) with a shared y scale: panels 6–7, 8–9, 10–11, and "Not set" only when it has data.
* New tokens:
  * `--q1..--q5`: a sequential blue ramp for heatmaps, cohorts and the calendar.
  * `--o1..--o4`: an ordinal blue ramp for ordered stacks (same → level → game → stop; returning and new).
  * Both are defined for light and dark and validated with the dataviz `validate_palette.js` (`--mode dark`, `--ordinal`), as the existing header requires.
  * Empty cells use `--track`.
* Colour is never the only carrier of meaning: there are always labels or a legend plus a table twin.
* **Small sample**: a chip "based on 2 children" / «بناءً على طفلين» (Arabic number agreement through `I.arWord`), and `--ink-2` for that mark's label.

### F.6 Research export

* **The request**: `GET /v1/admin/export?file=<name>&from&to[&after]` answers `200 text/csv; charset=utf-8`. The body is up to 2,500 lines (sessions: 400) **without a header**, one string SQL joins. Headers: `X-Next: <cursor>` (absent on the last page) and `X-Rows: <n>`.
* **How lines are built**: each line is built in SQL (`col || ',' || …`) and read with `.raw()`; JavaScript only joins the lines.
* **No quoting needed**: every value is a validated token (slugs, round ids, hex codes, band labels, numbers, ISO dates, `HH:MM:SS`), so a value never contains a comma, a quote or a newline. A test asserts this.
* **Cursors**: `start_s.sid` for files built from sessions (pages of 400 sessions); `u` for students; `day.a.slug` for daily_games; `p` for pcs.
* **The read guard** applies to each page.

The dashboard builds `school-games-data_<from>_<to>.zip`:

* It fetches the pages and writes the header from `dictionary.js`.
* Files are UTF-8 with a BOM, ISO dates, school-clock times, `.` as the decimal mark, and empty for missing (−1 never appears).
* `rounds.csv` becomes `rounds-YYYY-MM.csv` when the period has more than 500,000 rounds (Excel stops at 1,048,576 rows).
* Before starting it shows the cost: «About 2.4 million rows: about 48% of today's free reading allowance».
* It shows a progress bar.
* If the guard stops it, the page saves its cursors (guarded `localStorage`) and offers "continue tomorrow".
* In demo mode it uses `demo/export-*.csv`.

| File | One row per | Columns (pinned order; the same as `server/export.mjs` `COLUMNS`) |
|---|---|---|
| `students.csv` (server) | student code | student, student_label, student_linked, kind, band_first, band_last, profile_made_day, first_day, last_day, days_active, sessions, minutes, rounds, wins, losses, quits, games_tried, favourite_game, pcs, known_before, removed_day |
| `sessions.csv` (server) | session | session, student, student_linked, pc, kind (student\|guest\|unknown), wire_version, band, day, weekday (1 = Sunday … 7), start_time, minute_of_day, start_utc, clock_source, mode, build, cores, memory_gb, screen, classroom_mode, profiles_on_pc, new_profile, profile_age_days, days_since_last, profile_age_bucket, days_since_last_bucket, level_start, level_ups, games_opened, rounds, engaged_s, end_t_s, end_reason, timer_minutes, timer_ended |
| `visits.csv` (server) | game visit | session, visit, student, student_linked, band, day, open_time, open_s, close_s, open_seconds, engaged_s, game, source, plays_before, plays_before_bucket, favourite_at_open, load_ms, error, rounds_started, rounds_ended, tutorial, hearts_on, hearts_off, il_lt8, il_lt16, il_lt33, il_lt50, il_lt100, il_ge100, frames_smooth, frames_ok, frames_choppy, frames_stall, closed, previous_game, next_game |
| `rounds.csv` (server) | round | session, visit, round, student, student_linked, pc, band, day, weekday, time, start_s, minutes_into_session, game, level, outcome (win\|loss\|draw\|end\|quit\|empty = unfinished), previous_outcome, two_player, attempt, replay_in_session, engaged_ms, wall_ms, score, tier_start, tier_end, dda_level, hits, misses, accuracy, rt_lt300, rt_lt500, rt_lt800, rt_lt1200, rt_lt2000, rt_ge2000, rt_mean_ms, rt_n, inputs, inputs_per_min, idle_lapses, pauses |
| `events.csv` (server) | mark | session, student, student_linked, day, time, t_s, kind (level_up\|heart_on\|heart_off\|tutorial_start\|tutorial_done\|timer_start\|timer_cancel\|timer_end\|profile_removed\|linked), game, value |
| `student_days.csv` (server) | student × day | student, student_linked, day, weekday, band, sessions, minutes, opens, games, rounds, wins, losses, draws, ends, quits, hits, misses, rt_mean_ms, level_ups, first_time, last_time, pcs |
| `daily_games.csv` (server) | day × band × game, **including the legacy days** | day, clock (school\|utc), band, game, sessions, students, opens, minutes, starts, ends, wins, losses, draws, ends_neutral, quits, hearts_on, hearts_off, avg_tier, accuracy |
| `pcs.csv` (server) | PC | pc, pc_label, first_day, last_day, days, time_zone, build, cores, memory_gb, screen, sessions, students, guest_share, minutes, smooth_share, stall_share, avg_load_ms, slow_input_share, failures, profiles_max, new_profiles |
| `games.csv` (browser) | game | game, name_ar, name_en, categories, players, input_style, has_levels, dda, reports_hits, reports_reaction, reports_score, score_meaning_en, score_meaning_ar, tutorial |
| `dictionary.csv` (browser) | column | file, column, type, unit, values, meaning_en, meaning_ar, source (wire event.field), available_for (all games \| DDA games \| games with a score \| tutorial games) |
| `README.txt` (browser, Arabic and English) | | what the data is; identifiers (codes, labels, links, guests); time base and zone; the cutover day; the validity notes (§E); the version history; import tips (Excel; SPSS `GET DATA /TYPE=TXT /ENCODING='UTF8'`; R `read.csv(f, fileEncoding = "UTF-8-BOM")`); example models (R `lme4::glmer(win ~ log(attempt) * band + (1 + log(attempt) \| student_linked) + (1 \| pc) + (1 \| game), family = binomial)`; SPSS `MIXED`); and a care note: "These are pseudonymous records of individual children. Keep them like other school records, and check your rules on research with children before publishing." |
| `labels.sps`, `load.R` (browser) | | SPSS VARIABLE and VALUE LABELS, and an R loader with factor levels, generated from `dictionary.js` |

### F.7 Demo

* `server/simulate.mjs` v3 [S] writes v3 batches at the sink's real cadence: a send 60 s after the first waiting event, plus one at every game close.
* It simulates:
  * 600 persistent students (with band, skill and taste) on 30 PCs, in `Asia/Riyadh`;
  * a Sunday–Thursday 07:30–13:30 timetable with lab slots, 20% guests and a v2 minority;
  * duo rounds, the 3 DDA games, and skill rising with log(attempt), differently by band;
  * tiredness after 20 minutes, persistence that differs by game, tutorials, hearts and timers;
  * 5% of students on 2 PCs (half of them linked through `cd`), one PC that forgets its profiles, and late offline batches.
* `--db` history mode runs the real `rollupStep` for each day.
* `make-demo.mjs` [D] writes the `demo/` folder with the server's own answers:
  * `kpis-<1|7|30|90>-<all|6-7|8-9|10-11>.json`, `live.json`, `settings.json`;
  * `students-<period>.json`, `stats-<period>.json`, `cohorts-90.json`, `pcs-30.json`;
  * 3 `student-<u>.json` and 6 `game-<slug>.json` files;
  * `export-<file>.csv` samples.
* Everything is fetched lazily and totals ≤ 3 MB. Demo mode never contacts the server.

---

## G. Removing the strict tone (truthful copy)

**`i18n.js`, both languages:**

| Key | Now | New |
|---|---|---|
| `footer` | "Groups with fewer than 3 children are always hidden for privacy…" | EN: "No names are collected. Each child who picks an animal appears here under a code such as Student 7F3A; guests are counted together. A child who plays on two PCs appears as two students unless a teacher gives both profiles the same code or you link them." / AR: «لا تُجمع الأسماء. يظهر كل طفل يختار حيوانه برمز مثل «الطالب 7F3A»، ويُحسب لعب الضيوف معًا. الطفل الذي يلعب على جهازين يظهر طالبين، إلا إذا أعطى المعلم الملفين الرمز نفسه أو ربطتهما هنا.» |
| `utcNote` → `clockNote(zone, offset, source)` | "Days follow world time (UTC)…" | EN: "Days and hours follow the school's clock: Asia/Riyadh (UTC+3), as your PCs report it. Change" / AR: «الأيام والساعات بحسب ساعة المدرسة: Asia/Riyadh ‏(UTC+3) كما تذكرها أجهزة المدرسة. تغيير». With `source: 'none'`: "Waiting for a PC to report the school's clock; world time (UTC) until then." |
| `hiddenShort`, `hiddenTile`, `hiddenDays`, `hiddenPrivacy`, `moreHidden`, `hiddenHint`, `verdict.hidden`, `verdictLong.hidden` | "… hidden for privacy" | **Deleted**, together with `app.js` `hiddenNote()` and the browser-side hiding of 1–2-session days |
| new `smallSample(n)` | | "Based on 2 children so far" / «بناءً على طفلين حتى الآن» |
| `verdict.few` and the new `earlySign` | "Not enough tries" | "Not enough tries yet (fewer than 10)" / «المحاولات قليلة حتى الآن»; "Early sign (10–19 tries)" / «علامة مبكرة» |
| `remember` | (kept) | adds: "This page shows each child's play under a code. On a shared PC, sign out when you finish." |
| new `qualityLine(p)`, `guestAdvice`, `pcsUpdated(n, share)`, `twoPcsNote`, `lateNote`, `cutoverNote(day)`, `nightlyNote`, `profilesFull`, `forgetsProfiles`, `freePlan(w, r)`, `storageLine(mb)`, `exportCost(rows, pct)`, `forgetConfirm`, `linkConfirm`, `rebuildProgress(done, all)` | | friendly, specific, truthful |
| section intros | | "Your school's play at a glance", "How each child is doing", "What makes games stick", "When and how long they play", "Are they getting better?", "How the school PCs run the games", "Take the data with you" |

Insights may be warm ("Road Hopper is the 8–9 year olds' favourite this week"). Comparisons are worded as associations, never as causes. No sentence names a child for doing badly.

**Teacher page (`js/teacher.js`, Arabic):**
* `shareMsg`: «مشاركة إحصاءات اللعب مفعّلة على هذا الجهاز: تُرسل بلا أسماء، ويظهر كل طفل برمز عشوائي، إلى <host>.» ("Sharing play statistics is on for this PC: they are sent without names, and each child appears under a random code, to <host>.") The word «المجهولة» ("anonymous") goes, because it is no longer true.
* Next to clear, add: «ما أُرسل إلى خادم المدرسة يبقى هناك؛ لحذف بيانات طفل استخدم رمزه في لوحة المؤشرات.» ("What was sent to the school's server stays there; to delete a child's data, use their code on the dashboard.")

**Docs:** "anonymous" becomes "**without names (pseudonymous)**" in `docs/TELEMETRY.md` (the title becomes "Play telemetry (no names)"), `docs/ARCHITECTURE.md`, `server/README.md` ("Privacy design" becomes "What is collected and kept") and `js/telemetry.js`'s header. Each says once, plainly:
* the codes make this pseudonymous personal data under GDPR-style rules;
* parents should be told;
* research publication may need consent or an ethics review.

The "Before you turn it on" text shrinks to one paragraph. There are no other warnings on the dashboard.

---

## H. Migration, rollout, tests, docs

### H.1 Server migration (`store.mjs`, `SCHEMA_VERSION` 3 → 4)

* `init()` migrates **one version step per invocation**. A schema-3 database runs one `db.batch` of about 32 statements:
  * the `CREATE TABLE` and `CREATE INDEX IF NOT EXISTS` statements of §D.2;
  * `DROP TABLE IF EXISTS seen`;
  * `DROP TABLE IF EXISTS live`, then the new `live`;
  * `INSERT OR IGNORE INTO settings` with `tz = 'UTC'`, `tz_source = 'none'`, `week_start = 'mon'`, `week_source = 'auto'`, `keep_days = ''`, `facts_since = localDay('UTC', now)`, `legacy_until = utcDay(now)`, `rv = '1'`, `rolled_through = ''`;
  * `SET_VERSION 4`.
* With init's own 3 statements, that is ≤ 45.
* A fresh database creates the v4 set directly. It creates no `agg_*` and no `seen`, and sets `legacy_until = ''`; `kpis()` then skips the legacy part.
* A first-store (M1, `ev_go`) database first takes the existing v3 upgrade, and v4 on the next invocation.
* `setup()` returns `'migrated'` from the invocation that changed the schema. `handler.mjs` then answers that request with `503 {"error":"updating"}` and `Retry-After: 2`, for `/v1/batch` and `/v1/admin/*`. The sink retries a 503. A keepalive beacon that hits that single request is lost; this is documented.
* `/v1/health` never touches D1.
* The Node host (`app.mjs`) calls `setup()` at start, so its requests never see a 503.
* `agg_*` stays (frozen). ALTER is never used. Rollback is in §H.4.

### H.2 Ship order

| Step | Owner | What |
|---|---|---|
| 0 | S | Measure the live batch rate (§0.3) |
| 1 | S | The server PR (§D, the §F.4 endpoints, `simulate.mjs` v3, fixtures, `wrangler.json` `RETENTION_DAYS "400"`, README, tests). On its own it already works with the **M2 dashboard**: the answers are additive, nothing is suppressed, and the old dashboard's 1–2-session defence still hides some days until step 2. |
| 2 | D | The dashboard PR (retone and clock first, then the tabs, export and demo). It may land with step 1 in one deploy. |
| 3 | S | **Deploy**: copy `server/` byte for byte into `FarmerCarry/school-games-telemetry`, except that repo's own `wrangler.json`, where only `RETENTION_DAYS` changes to `"400"`. Cloudflare deploys on push. **Check:** `/v1/health` = `accepts [2,3]`, schema 4; a real v2 batch answers 204 (after one possible 503); `/?demo`; after sign-in the legacy days and new "student unknown" sessions show every number; the next 5-minute cron runs without errors; the Settings meters move. Watch one school day. |
| 4 | C | The client PR: `kit.js` `rx` and the dda cap; `profiles.js` 24 with `:more`; `site.js` hooks and idle hand-over; `telemetry.js` v3; `teacher.js` codes, transfer and copy; budgets; docs. **Publish only after step 3's check.** If v3 reaches PCs first, the M2 server answers 400 and the sink drops those batches for good. The workflow's deploy job enforces it: it stops before publishing while the server's `/v1/health` `accepts` lacks 3. |
| 5 | S, D | After two weeks: the v2 share, linked share and data-quality panel; the zone source is `pcs`. |

### H.3 Byte budgets [C]

| What | Now | Change |
|---|---|---|
| `portalBytes` | 392,143 of 394,000 (1,857 B headroom) | grows about 2.6–3.2 KB (`telemetry.js` +2.0, `profiles.js` +0.3, `site.js` +0.5); the new limit is the measured size rounded up to the next 1,000 plus 1,000 (expected 397,000) |
| Games | min headroom 1,007 B (rail-rush 141,993 of 143,000); also under 1.3 KB: tank-splat 1,032, block-world 1,097, cake-guards 1,134, paint-grab 1,138, troll-level 1,142, beat-dash 1,181, drift-king 1,201, swing-hook 1,230 | Kit +≤ 350 B; any game left with under 1,000 B of headroom gets the next 1,000 B (the existing rule) |
| `precacheBytes` | 5,290,000 (about 5,276,735 used) | about +16 KB; new limit measured + 1,000 (expected 5,295,000–5,305,000) |
| `teacherBytes` | 90,422 of 96,000 | +≤ 1.8 KB |

Every change is recorded in `docs/PERFORMANCE.md`. The dashboard is outside the children's site.

### H.4 Rollback

An older server refuses a schema-4 database. A roll back therefore means either redeploying v4 with a fix, or a D1 Time Travel restore (7 days, free) followed by redeploying M2. Because `agg_*` are kept frozen, a restore to just before the deploy is a clean M2 state. PCs queue for up to 7 days meanwhile. Time Travel plus the M2 server is safe only **before** step 4 (the v3 portal) is published: the M2 server answers v3 batches with 400, which the sink treats as final. After step 4, redeploy v4 with a fix instead. Say this in `server/README.md` "Updating the server".

### H.5 Tests (each owner adds or changes their own)

**[S] `telemetry-server.test.mjs`**:
* The v3 fixture is accepted and every fact row is stored exactly as expected.
* v2 is still accepted: `sample-batch.json` maps to visits and rounds across batches, with server numbering.
* Invalid v3: the core fields give 400; malformed optional fields are stored as `''` or null with a 204.
* **Idempotency**: the same v3 batch twice, in sequence and concurrently, leaves every table identical. A v2 repeat answers 204 and is stored once.
* Rows written (with the new shim): the first v3 batch of a session ≤ 14; a later batch ≤ 8; a 200-event batch ≤ 40.
* "Never stored": a per-table column whitelist (`u`, `p` and `z` allowed); the sentinels (names, labels, `مختبر سارة`, profile key `"p1"`, emoji, colours, UA, IP) never appear; the index list is exactly the 5 named indexes.
* KPIs exact for a hand-built dataset with **no suppression** (a 1-session group shows numbers; `minSessions` 0); defaults are the school's 30 local days.
* `live`: students, guests, unknown, pcs.
* Retention: `keep_days`, env, 800-day rollups, 30-day batch ids.
* The store creates schema 4, upgrades 3 → 4, and refuses 5.
* **Clock**: `w` dating; a batch held 3 days lands on the play day; v2 gives `'r'`; Asia/Riyadh at 21:30 UTC is the next local day; Europe/London across 25 Oct 2026 (a 25-hour day) has exact bounds.
* **Zone states**: none → dashboard → pc → pcs (locked at 3 PCs); an owner choice is never changed; a change marks days full-dirty.
* Attempt numbering across batches, sessions and PCs, unchanged by duplicates.
* **The rollups equal a JavaScript oracle** over the same facts, for every `r_*` table and every `r_stat` metric, on a simulated day.
* **The KPI lock**: the same v2 batches through the M2 store (`git show 743e5ec:server/store.mjs` and `schema.mjs`, skipped without history) and through v4 with the zone UTC give identical numbers for every group M2 shows. Groups M2 suppressed now have numbers. Only the documented additions differ.
* forget, link and unlink (one hop, cycles refused), `POST settings` validation and auth.
* Export: every row exactly once across pages, the field count equals `COLUMNS`, no value contains `,`, `"` or a newline, and the read guard answers 429.
* The storage guard trims the oldest rounds (with a test threshold).

**[S] `telemetry-worker.test.mjs`**:
* Statement limits per §D.10:
  * the first request after a 3 → 4 upgrade migrates with ≤ 45 statements and answers 503 with `Retry-After`; the same holds on a fresh database;
  * the next request ingests with ≤ 20;
  * a wide 200-event batch ≤ 20;
  * admin endpoints ≤ 20;
  * the cron ≤ 35.
* `wrangler.json`: `RETENTION_DAYS` is `"400"`, the crons are unchanged, observability is off.
* The 5-minute cron rolls yesterday once after local 01:00, whichever instance runs it; dirty days at most once an hour; the read cap is respected.
* Closed parts come from `kpi_cache` across instances and are invalidated by `rv`.
* The midnight test becomes "a session counts once, on the local day it started".
* `X-Batch-Every` gives 60, 180 and 300 at the thresholds, and is exposed through CORS.
* The usage meter sums `meta` and flushes once a minute.
* The first-store comparisons are replaced by the M2 KPI lock. The first-store upgrade test now goes v1 → v3 → v4 over two invocations.

**[S] `server/sqlite-d1.mjs`**:
* `rows_written` becomes changes × (1 + the number of secondary indexes of the target table): an upper bound from `sqlite_master`, cached per table, for INSERT, UPDATE, DELETE and UPSERT.
* `size_after` becomes `page_count × page_size`.
* `rows_read` stays the rows returned. Read budgets are tested through **query plans**: every rollup and admin query uses `SEARCH` on the fact and rollup tables, never `SCAN` (except `settings`, `aliases`, `roll_days` and `usage`). On a simulated busy day, the count of rows in the ranges a rebuild touches must be ≤ 100,000.
* A test file `tools/tests/telemetry-clock.test.mjs` covers `clock.mjs`.

**[C] `telemetry-client.test.mjs`**:
* The envelope has `u`, `p`, `z` and `w`.
* `u` is stable for a profile across reloads and sessions, differs between profiles, is `''` for a guest, and is never the profile key.
* `p` is stable. **Nothing is written to `sg:site:rid` while the sink is inert (every gate).** Blocked storage gives `u = p = ''`.
* `w`: a retry has the same `b` and a larger `w`; `w ≥ max t`; split envelopes of one session date the same start; a reloaded queue uses `w0`.
* Queued v2 entries are still sent as v2.
* `rx` is merged into the next `re` even when split across messages; an old-Kit `re` gives `x: null`.
* `tu` comes from `sg:stats` v1 `start`/`done`, once per visit; `gp` is added at seal and never alone.
* `fv`, `ct`, `pr`, `cd`; `se.why` is `u`, `p`, `h` or `i`; `ss` has `np` and `cls`.
* The 60 s timer; `X-Batch-Every` is honoured (20..600) and ignored otherwise.
* Every batch passes `validateBatch` v3 with `dropped === 0`.
* The **existing sentinels and the "no dates or times" checks still hold** (`pcwxyz`, `"p1"`, the label, emoji, colours, `Mozilla`, …).

**[C] `shared-kit.test.mjs`**:
* `rx` comes right before every `re`, only while telemetry is on; the counters follow §B.4 (key repeats excluded, idle lapses only after 20 s, pauses, RT sum and count, DDA ‰ sticky); they reset at a round start.
* `sg:telemetry` stays version 2; `sg:stats` v1 is byte-identical; no new timers; nothing posted at load.
* `Kit.dda` keeps 28 keys: 24 profiles and the guests' 4 band keys.

**[C] `portal-profiles.test.mjs`**:
* 24 profiles, using `sg:site:profiles:more`.
* **The M2 `js/profiles.js` (from Git) running on the same storage never drops a profile.**
* The idle hand-over after 20 minutes with a fake clock (the player becomes a guest; `why = 'i'`); the hand-over button gives `'h'`; the strip wraps at 24 with no horizontal scroll at 360 px.

**[C] `teacher-page.test.mjs`**:
* The codes panel (animal, ring, the code with its check character; the PC code; "no code yet").
* The transfer: check-character validation, refusing the profile's own code, writing `rid.k` and `rid.l`, disabled while sharing is off.
* Clear keeps `sg:site:rid`.
* The new share line; the copied `ANIMALS` and `COLORS` equal `SGProfiles`.

**[C] `telemetry-e2e.test.mjs`**: the real portal sends v3 to the Node server, and the student appears in `/v1/admin/students` with the right minutes. A code transfer between two simulated PCs merges history through `cd`.

**[C] `asset-budgets`, `play-stats-rules`, `build-safety`**: the new limits; `fetch` still only in `js/telemetry.js`.

**[D] `dashboard-insights.test.mjs`**:
* The suppression tests are replaced by "every group is described, even one child, with the small-sample flag".
* No string in either language contains "hidden for privacy" or «حفاظًا على الخصوصية».
* The new insight kinds and `researchInsights()`; both languages.
* Every `demo/*.json` is the server's own answer.

**[D] `dashboard-research.test.mjs`** (new): `research.js` (quantiles, cohorts, paired growth, categories, persistence shares, small-sample rule, labels); `dictionary.js` columns equal `server/export.mjs` `COLUMNS`; `scores.js` covers the 28 score games; `names.js` has `SG_GAME_INFO` and `SG_CATEGORIES` for every catalogue game.

**[D] `dashboard.test.mjs`** (Chromium, CSP):
* Every tab and route renders from the demo, in Arabic and English, RTL, at 360 px, with table twins, keyboard focus, and contrast for the new ramps.
* The zone-change POST; the student page; the link and forget confirmations.
* The export ZIP in demo mode: file names, BOM, the header row equals the dictionary, Arabic names in `games.csv`, row counts.
* The hidden-group tests are removed.

### H.6 Docs

| Owner | Doc and change |
|---|---|
| C | `docs/TELEMETRY.md`: the v3 wire format, `sg:site:rid`, the timer and `X-Batch-Every`, `w`, a one-paragraph "Before you turn it on", and the checks |
| C | `docs/ARCHITECTURE.md`, sections "Kit v2" (`rx`, the dda cap), "Profiles and age bands" (24, `:more`) and "Telemetry sink" (privacy rules rewritten: pseudonymous codes, no wall-clock time, the zone name; the v3 envelope and events; delivery) |
| C | `docs/PLAY_STATS.md` (the teacher codes panel and transfer) and `docs/PERFORMANCE.md` (bytes) |
| S | `server/README.md`: "What is collected and kept", API, storage, free-plan arithmetic with §D.9 and the measured batch rate, operations, "Updating the server" (the copy rule, `RETENTION_DAYS`, the check, rollback) |
| S | `docs/ARCHITECTURE.md`: "Ingest server", a new "Milestone 2.5: research telemetry" with the §1 decisions, and a "Milestones" row |
| D | `server/dashboard/README.md` (tabs, files, export) and the new `docs/RESEARCH_DATA.md` (generated from `dictionary.js`: dictionary, methods, validity notes) |

### H.7 Risks

| Risk | Mitigation |
|---|---|
| **Legal and ethics**: per-child records over time are pseudonymous personal data (GDPR, UK GDPR and children's codes; FERPA and COPPA notions in the US) | No names; erasure (§A.11); retention; truthful docs. The owner tells parents, and gets consent or an ethics review before publishing (open question 3) |
| One dashboard password now opens per-child histories and exports | Advice: a strong password, signing out on shared PCs, replacing it if exposed, treating ZIPs as school records |
| Free-plan enforcement stops every query until 00:00 UTC | Write and read guards, `X-Batch-Every`, the rebuild cap, PC queues of 7 days and 128 KB |
| 10 ms CPU (error 1102) | SQL aggregation, SQL-built export lines, row caps per endpoint, Node CPU proxies in tests |
| Release order: client v3 before the server means 400s and lost batches | Server first; the `/v1/health` gate in §H.2 step 3 |
| Old portal tabs with 24 profiles | The `:more` key (§A.5) and the M2 `profiles.js` compatibility test |
| Owner repo drift (its own `wrangler.json`; a partial copy breaks the dashboard) | Copy the whole folder except `wrangler.json`; the step 3 checklist |
| Identity validity (open tabs, re-made profiles, two PCs, forgetful lab PCs, guests) | Idle hand-over, code transfer, owner link, the data-quality panel, honest copy |
| Measurement validity (DDA, scores, selection, band, duo, engaged-time definition) | Validity notes in the tooltips, the README and `RESEARCH_DATA.md`; paired growth |
| Missing data not at random | v2 share, linked share, coverage per PC on the dashboard |
| A zone change or recount after months of data takes days under the cap | Early automatic lock; a progress banner; facts never change |
| A school twice as busy, or year 3 at about 49% of writes | `X-Batch-Every` 180 s, shorter rollup retention, the paid plan stated plainly |
| Storage above 425 MB drops the oldest round details | The banner advises a research download each term |
| Excel's row limit | Rounds split by month; R or SPSS for the full table |
| Public ingest: forged batches with invented codes (an old risk, now more visible) | The Origin check stops browsers only; documented; forget and recount exist |
| Children's experience changes (idle hand-over, 24 animals) | The owner's yes (open questions 1 and 2); player cards: the owner's no (open question 4, §A.10) |
| Per-student pages misused to rank children | No ranks or medals; neutral, supportive copy; no negative sentences about one child |

---

## Appendix: traceability (judges' grafts and verified errors)

| Item | Where |
|---|---|
| Raise `MAX` (24) and the `Kit.dda` cap; `ss.np`; a "Profiles full" flag | §A.5, §B.3, §E 42, §F.3 PCs |
| The teacher transfer (`cd`, `aliases`) plus the owner link; player cards dropped by the owner | §A.8–A.10, §D.2 |
| Relative time `w` (the page's `performance.now()`, the queue's `w0`, clamps); no `c`/`w` wall clock | §B.2, §C.2 |
| s1–s3 keep their meanings; band comparisons as small multiples; validated ramps | §F.5 |
| Paired same-student growth; small-sample chips, never hidden | §E 27, §F.3, §F.5 |
| Data-quality signals ("forgets profiles", "PCs on the new version" stated truthfully, guest advice) | §E 42, §F.3 |
| Finer persistence classes with the retry gap | §D.2 `persist` |
| Usage meter feeding the guards | §D.8 |
| Tutorials from `sg:stats` v1 (`s`/`d`); Kit adds `rx` only | §B.4 |
| `live` gets students, guests and PCs; the dashboard zone before any v3 PC; week start from the school zone | §C.3, §F.4 |
| Export extras (`previous_outcome`, `events.csv`, `daily_games.csv` with legacy days, `load.R`, demo export) | §F.6 |
| `X-Batch-Every` exposed through CORS | §B.6, §D.8 |
| Migration statements counted and isolated (migrate, then 503) | §D.10, §H.1 |
| Measured batch rate (13.7 at 20 s; 60 s default; 31 games with frames; 28 with a score) | §0.3, §B.5 |
| Lenient optional fields | §B.1 |
| Debounced re-rolls; `rv` for caches | §D.7 |
| Shim bills index writes and reports size; plan-based read tests | §H.5 |
| `clock.mjs` | §C.1 |
| KPI lock against the M2 store | §H.5 |
| Errors fixed: the `tickSession` early return (§A.4); `st_sessions` v2 numbering columns (§D.2); profile-record `u` stripped by old `clean()` (§A.1); Kit version bump dropping telemetry (§B.4); `pcwxyz` sentinel (§A.1); the `o`/`s.at` split error (§B.2); split headroom numbers (§H.3); `splat-strike` has a score (§B.5); "only delays data" (§0.2); `meta` INTEGER values (settings is a TEXT table, §D.2); the link hint that could never fire (replaced by real links, §A.8–A.9); the first-request statement count (§H.1) | as noted |
| New error found here: an old `profiles.js` would delete profiles 13–24 | §A.5 |

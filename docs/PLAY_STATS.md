# Play statistics (local only)

Teachers want to know which games children choose, how long they really play, where
they stop, and whether the school PCs run the games smoothly. This feature counts that
**on each PC only**. Nothing is sent over the network: there is no server, no upload,
no cookie and no third-party script. The numbers stay in the browser's `localStorage`
on that PC until a teacher exports or clears them.

Never recorded: names, anything a child types (typing-test words, search text, class
codes, Snake Arena's player name), free-text error messages, screenshots, mouse paths
or key sequences. Several children share one PC and two-player modes mix players, so
the numbers describe **games on a PC**. With fixed seating a PC can stand for one child,
so exports leave out anything finer than a day (their hours table has no dates and lists
a game's hour only when it was played then on at least 3 days, and not on every day the
game was played), and the PC label must not be a name.

## How it fits together

```
game page (iframe)                    portal (index.html)                  teacher.html
shared/kit.js                         js/stats.js + js/site.js             js/teacher.js
  counts engaged time, frame  ──sg:stats──▶  validates and cleans; adds      reads day records, shows
  smoothness, round events    postMessage    opens, sessions, load time,     answers in Arabic, exports
  (no storage, no network)                   launch source, settings;   ──▶  one Excel workbook and one
                                             merges small deltas into        JSON file, opens other PCs'
                                             one record per local day        JSON files to view together
```

* Games talk to the portal only through the existing `postMessage` channel. A game
  opened on its own counts but never sends.
* The portal owns the storage. Games never write statistics themselves.
* The teacher page is a separate, precached page, so children's pages barely grow.

## 1. Game side: `Kit.stats` (shared/kit.js)

| Call | When |
|---|---|
| `Kit.stats.round(id)` | A level, round, run or match starts: first play, retry, restart, next level. Free-play games call `round('main')` when play starts. |
| `Kit.stats.end(result, score)` | The open round ends. `result` is `'win'`, `'lose'`, `'draw'` or `'end'`. `score` is optional, a finite number ≥ 0 (for example metres). |
| `Kit.stats.tutorial(step)` | `'start'` when a first-time tutorial or coach is shown, `'done'` when the child completes it. Kit sends each step at most once per page load. |
| `Kit.stats.busy()` | At passive moments the child is watching (a golf ball in flight, a CPU pool shot): at launch and on events like a bounce, never per frame, at most about once per second. It extends engaged time that is already running. |
| `Kit.stats.frame(ms)` | Only in games with their own `requestAnimationFrame` loop (neon-slope, road-hopper): once per rendered frame of real play, with the raw frame time. |

Rules for games:

* **Ids** come from the game's own list and **start with a letter**: `'L3'`, `'w1-4'`,
  `'cpu-easy'`, `'duo'`, `'arena2'`, `'endless'`, `'main'`. Never `'1-4'` (Excel turns it
  into a date) or `'2p'`. Never put typed text, names or codes in an id; typing-test challenge
  tests use the plain id `'code'`. The portal drops ids that do not match
  `^[A-Za-z][A-Za-z0-9_:.-]{0,23}$` or that contain three digits in a row.
* **One round is one try the child would call a try.** Automatic respawns inside a level
  (troll-level, swing-hook checkpoints, moto-madness crashes) are not new rounds; a game
  that restarts the level after each death (beat-dash attempts) may report each attempt.
* **Results:** single-player levels and matches report `'win'` or `'lose'` (or `'draw'`).
  Endless runs report `'end'` with a score; so does a merge-2048 board when it fills up.
  A 2048 board has no winner: it is kept between visits, and the goal tile is a moment
  inside the round, not its end. **Two-player modes on one PC** (`'duo'`, `'local'`,
  `'pvp'`, or a level id ending in `:duo`, `:local` or `:pvp`, such as fire-and-ice's
  co-op `'L4:duo'`) report only `'end'` or `'draw'`, never a winner; the teacher page
  relies on these ids.
* Calling `round()` while a round is open records the open one as a **quit**. A round
  still open when the child leaves is a quit too. `end()` with no open round is ignored.
* Never report demo or attract modes, solution replays, bot-only matches, balance
  simulations or headless test runs.
* **Calls belong in the UI layer** (`game.js`, `main.js`, `ui.js`, `shared/board-game.js`):
  never in engine, physics, rules, simulation or level files that Node verifiers and
  regression tests load with a stub Kit, and never in functions those tests call
  directly (see `tools/tests/play-stats-rules.test.mjs`).

### What Kit measures by itself

* **Engaged time.** A key press (`keydown`) or a mouse button (`pointerdown`) starts
  or extends a 20-second window. Mouse moves (`pointermove`), the wheel and
  `Kit.stats.busy()` only extend a window while the game is *armed*. A pause of any
  kind (blur, hidden page, portal pause, Shift+Tab to the portal) cuts the window at
  once and disarms the game; only a key press or a click arms it again. So a mouse
  passing over a paused game counts nothing. Overlapping windows merge.
* **Frame smoothness.** In `Kit.loop` (and `Kit.stats.frame`), a frame counts only
  while the game is engaged, armed and a round is open. Its raw time goes into one of
  four buckets: smooth ≤ 20 ms, ok ≤ 34 ms, choppy ≤ 250 ms, stall > 250 ms. The first
  frame after the loop starts or the page becomes visible is skipped. Cost per frame:
  a subtraction, a few comparisons and an increment. Games with no steady drawing loop
  while playing (connect-four and tic-tac-toe move pieces with CSS; typing-test redraws
  on key presses and runs `requestAnimationFrame` only for short bursts of effects)
  count no frames: counting those bursts would judge the effects, not the PC. The
  teacher page lists them in `NO_FRAMES` (js/teacher.js), and the rules test keeps that
  list equal to the games that call neither `Kit.loop` nor `Kit.stats.frame`.
* **Mute toggles** (the in-game sound button or M).
* **Round time**: the engaged milliseconds inside each round.

The clock is `window.performance.now()` when present, else `Date.now()`; never a bare
global (the Kit unit tests run without `performance`).

### When Kit sends

Only when embedded in the portal, and only when something changed:

* at every `round()` and `end()`;
* when the game is paused for any reason, and on `pagehide`;
* every 10 seconds while there is unsent data, from one `setTimeout` chain started the
  first time `Kit.ready()` runs (later `Kit.ready()` calls do not start another) and
  stopped once the game has failed;
* at once when 32 events are waiting.

Kit never posts at load, never inside `Kit.ready()` itself, never adds fields to
`sg:ready`, and never posts from its error handlers.

**Size budget:** the Kit side adds at most about 900 minified bytes to every game. Kit
does not clean ids or clamp numbers; it sends `String(id).slice(0, 24)` and the first
letter of the result, and the portal does the checking.

### Message `sg:stats`, version 1

```js
{
  type: 'sg:stats', version: 1,
  e: 41250,                // engaged milliseconds since the previous message
  f: [1830, 412, 37, 1],   // frame buckets since the previous message: smooth, ok, choppy, stall
  m: 0,                    // mute toggles since the previous message
  r: [                     // round events since the previous message, oldest first
    ['s', 'L3'],           //   round L3 started
    ['l', 'L3', 18400],    //   lost after 18.4 s engaged in the round
    ['s', 'L3'],
    ['w', 'L3', 22100, 950], // won after 22.1 s, score 950
    ['t', 'done']          //   tutorial step ('start' or 'done')
  ],
  o: 'L4',                 // the round open right now, or ''
  om: 3200                 // engaged ms so far in that open round (0 when none)
}
```

Codes: `s` start, `w` win, `l` lose, `d` draw, `e` neutral end, `q` quit (a new `round()`
replaced an open round), `t` tutorial.

`om` was added within version 1. The portal keeps the latest `om` of each frame so that a
round the child leaves open still files its time (see Sessions); a message without `om`
counts as 0.

## 2. Portal side: the recorder (js/stats.js, called from js/site.js)

The recorder is about 6 KB minified; the portal's current size and limit are in docs/PERFORMANCE.md.

### Sessions

* A session **opens** when the portal navigates to a game's play page. A re-render of
  the same page is not a new open.
* A session is a **sequence of frames**. Restart, Retry and a same-page re-render replace
  the frame but keep the session: the replaced frame's last known open round (`o`)
  becomes a quit unless its own late message already closed it. The quit files the
  engaged ms that frame last reported for the round (`om`), which is then forgotten.
* A session **closes** when the child leaves the play page, switches games, or the
  portal unloads (`pagehide` that is not `persisted`). Hiding the page (another tab,
  minimised window, locked screen, the teacher page) and a `persisted` pagehide only
  write; the session stays open.
* **Late messages.** When a frame is removed, the portal keeps
  `{ window, session }` for 2 seconds. During that time it accepts `sg:stats` (and only
  `sg:stats`) from that window and credits it to that session, never to the current
  game. The closing session is settled (length bucket, open round counted as a quit) at
  the first such message, after 1 second, or at portal `pagehide`, whichever is first.
* **Length.** A closed session that reached `sg:ready` and had no failure lands in one
  bucket by engaged time: under 1 minute, 1–5, 5–15, 15 or more. Sessions that never
  reached `sg:ready` count as *never started*, kept apart from the buckets.
* **Failures.** `sg:error` counts an error and a 20-second timeout counts a timeout
  (no text is stored). Neither closes the session; Retry continues it.
* **Unclosed sessions.** The open session is mirrored in `sg:site:stats:live`, with its
  open round and that round's `om`. If the portal finds one on load (the PC was switched
  off, the tab was killed), it closes it from the stored values first; the open round
  becomes a quit with that time.

### Other measures

* **Launch source**, from a capture-phase click listener (it runs before the play-page
  early return in `watchTiles`), stored as `{ slug, source, time }` and used only if the
  slug matches and it is under 1 second old: `featured` (🔥 tile), `catalog` (other home
  tiles), `recent`, `favorites`, `category`, `quick`, `search` (results or a one-result
  submit), `related` (play page), `surprise`. Without a tag: `reload` (first render of a
  reloaded page), `history` (back/forward after the first render) or `direct`.
* **Load time** from creating the iframe to its **first** `sg:ready`, only for the first
  frame of a session and only if the page stayed visible meanwhile (otherwise it is
  counted as *skipped*).
* **Settings:** calm (classroom) mode switched on, portal fullscreen entered, in-game
  mute toggles. **Hearted:** whether the game is in the ❤ list when the day is written.
* **Ids** are re-checked as described above; numbers are clamped (engaged time at most
  120 000 ms per message, each frame bucket at most 20 000 per message, round time at most
  3 hours, score at most 1 000 000 000). Unknown codes and fields are ignored.

### Writing

The portal keeps **deltas** in memory, each filed under the local date and hour when it
was recorded (a session's length bucket goes to the day it opened). A write is
`getItem` → parse and check → add the deltas → `setItem` → forget the deltas, so two
portal tabs add up instead of overwriting each other. Writes happen when a session
closes, on `pagehide`, about 1 second after a message arrives while the page is hidden,
and otherwise at most once a minute while something changed. Before each write and on
`storage` events the portal reads `sg:site:statsmeta`: if collection is off it drops its
deltas and records nothing; deltas recorded before `clearedAt` are dropped.

Limits: the newest 120 day records are kept (by key name, not by the clock); all stats
keys together stay under 300 KB (oldest days go first); one day's record stays under
16 KB (extra level ids fold into `'_other'`). If a write fails with a full storage, the
oldest day is removed and the write is tried once more; otherwise statistics are simply
not kept. Old days are therefore removed **when the space fills or after 120 days,
whichever comes first**. A busy computer-lab PC writes about 4–6 KB a day, so it may keep
only 2–3 months. When a day is removed for space (the 300 KB cap or a full storage), not
by the 120-record limit, the portal writes the newest such date into `sg:site:statsmeta`
as `pruned`, so the teacher page can warn that days were lost.

**Statistics must never be the reason a game save fails.** Every storage call is in
`try`/`catch`, nothing is logged, and `localStorage.clear()` is never used.

### Storage format, version 1

| Key | Value |
|---|---|
| `sg:site:stats:d:YYYY-MM-DD` | one day record (local date) |
| `sg:site:stats:live` | the open session, for closing it after a crash |
| `sg:site:statsmeta` | `{ pc: { id, label }, off, offSince, clearedAt, since, lastExport, pruned }` |

`pc.id` is `'pc'` plus 4 random lower-case letters from `crypto.getRandomValues`, made
on the first write. `pc.label` is set on the teacher page: at most 16 characters, no
leading `= + - @`, no control characters.

```js
// sg:site:stats:d:2026-10-08
{
  v: 1, d: '2026-10-08',
  s: { calm: 1, fs: 3, mute: 2 },         // settings actions this day
  g: {
    'candy-rope': {
      o: 4,                  // opens
      e: 1260431,            // engaged milliseconds
      hh: { '9': 840212, '10': 420219 },   // engaged ms by local hour (non-zero hours only)
      b: [1, 1, 2, 0],       // closed sessions by engaged length: <1 min, 1–5, 5–15, 15+
      ns: 0,                 // sessions that never started (no sg:ready)
      src: { recent: 2, category: 1, direct: 1 },   // launch sources (non-zero only)
      l: [4, 5230, 2100],    // first loads: count, sum ms, max ms
      ls: 0,                 // loads skipped (page hidden while loading)
      x: 0, t: 0,            // game errors, load timeouts
      f: [8120, 960, 44, 2], // frames: smooth, ok, choppy, stall
      tu: [1, 1],            // tutorial shown, done
      fav: 1,                // in the ❤ list when last written
      lv: {
        'L3': [5, 1, 3, 0, 0, 1, 96200, 950, 950, 1, 2, 1]
        // starts, wins, losses, draws, ends, quits, engaged ms,
        // score sum, score max, scored rounds, visits, gave up
      }
    }
  }
}
```

Records written before October 2026 may also hold `lb` (first-load buckets). It is no
longer recorded; the portal keeps it as it is and the teacher page ignores it.

**Visits and gave up** are derived by the portal from the event stream in each session:
a *visit* is a start whose previous round in the session had a different id (or the
first start); a level was *given up* when its last outcome was a loss or a quit at the
moment the child moved to another id, left the game, or the session closed.

## 3. Teacher page (teacher.html)

Opened from **🏫 إعدادات الصف → 📊 إحصاءات هذا الجهاز** in a new tab, so a running game
is not interrupted. It works offline, from a downloaded folder and with storage blocked
(it says so). It is not password-protected: stopping and clearing ask the teacher to
type a word first. It shows where its numbers come from (the web copy or a downloaded
folder: each keeps its own statistics) and the date data starts.

Arabic, right to left, Western digits. Fixed note at the top: **«الأرقام لكل جهاز وليست
لكل طالب، ولا تُرسل إلى أي مكان.»** Period: اليوم، هذا الأسبوع، آخر 30 يومًا، الكل.

1. Four answer cards: **أكثر الألعاب لعبًا** (by sessions of at least a minute, with
   minutes beside it), **كم يلعبون** (actual play time and average session),
   **متى يلعبون** (bars by hour), **أين يتوقفون** (the levels children give up on most).
   A session's time is written before its length (a hidden page writes, the session
   stays open), so a game with play time today on this PC but no closed session yet, for
   example when 📊 is opened while a child is still playing, gets the note «مرة لعب ما
   زالت مفتوحة، وتظهر هنا بعد إغلاق اللعبة» instead of «no game was played a minute»,
   and its row says «ما زالت مفتوحة». Rows of other days or other PCs' files with time
   and no session (a failed load, a session closed by another page or begun before a
   clear) will never close, so they get no note. The average session uses only game-day
   rows that have closed sessions. Times under 60 seconds read «أقل من دقيقة», never
   «دقيقة واحدة».
2. A table per game with at most six columns: وقت اللعب الفعلي، مرات اللعب، خرجوا
   بسرعة، أيام اللعب، ❤، and a link to that game's levels. أيام اللعب counts distinct
   dates, so with several PCs together it never exceeds the days in the period; the cell
   then also says on how many PCs («على 3 أجهزة»).
3. **أين يتوقفون**: for each game, its 3 *winnable* levels with the highest
   *gave up ÷ visits* among levels with at least 5 visits. Levels are compared only
   within the same game; there is no absolute "hard" threshold. In one view (period and
   PCs), a level is **winnable** when it was won or lost and never ended neutrally
   (`'end'`), or when it was only started and left (no `'end'`, no `'draw'`) and its id
   has the shape of such a level of the same game, digits aside (`'L#'`, `'w#-#'`,
   `'stage#'`). Two-player ids (`duo`, `local`, `pvp`, or ending in `:duo`, `:local`,
   `:pvp`) and `'_other'` never are. So win-or-quit games such as troll-level,
   moto-madness and swing-hook (a death respawns inside the level) show the levels
   children abandon, while free play, endless runs (block-burst `'classic'`, maze-dash
   and swing-hook `'endless'`, even beside won levels), merge-2048 boards and two-player
   modes never appear. A winnable level shows its **win share** as
   «فازوا في N من M محاولات», where tries M = wins + losses + draws + quits, only when
   M ≥ 5. Other ids with scores show the average and best score instead. In the levels
   tables the gave-up figure appears only for winnable levels; others show «—». Ids are
   labelled «المرحلة أو الوضع», since many are modes, difficulties or board sizes.
4. Collapsed sections: **حالة الجهاز** (one verdict per game, سلس / مقبول / بطيء, from
   frames and load times, shown as "—" under 600 counted frames, and as «لا تُقاس» with
   a note under the table for the games that count no frames; errors; this PC's
   cores, memory, screen and graphics chip, shown but never exported), **كيف يصلون إلى
   الألعاب**, **الإعدادات**, **الشرح الأول** ("first-time tutorial shown / completed on
   this PC").
5. Actions: name this PC, **تصدير ملف Excel**, **تصدير JSON**, **فتح ملفات من أجهزة أخرى**
   (view several PCs together; nothing is saved), stop or resume collecting (type
   «أوقف»), clear this PC's statistics (type «امسح»; removes only keys that start with
   `sg:site:stats:`, never the id, label or stop setting). While collection is stopped,
   the 🏫 strip shows «الإحصاءات متوقفة».
   **An export counts only once its file is saved** (`lastExport`, which the reminder
   uses, is the moment the file was made). Where the browser offers pages a save dialog
   (`showSaveFilePicker`: Edge and Chrome, and only in a secure context, which includes
   https, `localhost` and `file://` pages but not plain http from another computer), the
   page writes the file itself: closing the dialog or a failed write records nothing and
   says the file was not saved. Chromium reports a dialog blocked by a school policy
   (`AllowFileSelectionDialogs`) exactly like a cancel (`AbortError`), so the message
   after a closed dialog has a «تنزيل الملف بدلًا من ذلك» button. That button, other
   browsers and any other refusal of the dialog download the file instead, and the page
   asks whether it was saved; only «نعم، حُفظ الملف» records the export, since a page
   cannot see whether a download's own Save As window was cancelled. Export clicks are
   ignored while a save dialog is open (the browser refuses a second one), and the status
   names the file as the teacher saved it.
6. A reminder to export when (a) the stats keys use more than about 75 % of the 300 KB
   cap and nothing was exported in the last 7 days (a full PC stays full after an
   export, so the reminder would otherwise never go away), (b) the portal removed a day
   for space (`pruned`) that the last export did not cover completely (`pruned` is on or
   after the date of `lastExport`, or there was no export), or (c) the oldest day not
   yet exported is more than 100 days old. The text says that old days are removed when
   the space fills or after 120 days, whichever comes first, and that a busy computer-lab
   PC may keep only 2–3 months. Clearing also removes `pruned`.

### Words used on the page

| Key | Arabic label | Meaning shown to teachers |
|---|---|---|
| seconds | وقت اللعب الفعلي | يُحسب فقط عندما يستخدم الطفل الفأرة أو لوحة المفاتيح |
| sessions | مرات اللعب | مرات فتح اللعبة واللعب فيها دقيقة أو أكثر |
| short_sessions | خرجوا بسرعة | مرات خرج فيها الطفل قبل دقيقة |
| days | أيام اللعب | أيام لُعبت فيها اللعبة على هذا الجهاز (عند عرض عدة أجهزة يُحسب كل يوم مرة واحدة) |
| gave_up | توقفوا عند هذه المرحلة | خسروا أو تركوا المرحلة ثم انتقلوا إلى غيرها (فقط في المراحل التي يُفاز فيها أو يُخسر) |
| smooth verdict | سلس / مقبول / بطيء | سرعة الرسم وزمن التحميل على هذا الجهاز |

## 4. Exports (format `sg-play-stats`, version 1)

Every export contains **all stored days**, not just the period on screen. Rows carry
`exported_at` (local ISO time) and `day_complete` (0 for today). Columns are fixed
English names; Arabic appears only in values (`game_name`, `pc_label`) and on the
read-me sheet. Columns are never renamed; new ones are only appended. All numbers are
additive (sums and counts, no averages), so they add up correctly in Excel pivots.

| Table | Columns |
|---|---|
| days | pc, pc_label, copy, date, seconds, sessions, short_sessions, calm_on, fullscreen, mute_toggles, day_complete, exported_at |
| games | pc, pc_label, copy, date, game, game_name, opens, sessions, short_sessions, sessions_1_5, sessions_5_15, sessions_15_plus, never_started, seconds, hearted, rounds, wins, losses, draws, ends, quits, tutorial_shown, tutorial_done, loads, load_ms_sum, load_ms_max, loads_skipped, errors, timeouts, frames_smooth, frames_ok, frames_choppy, frames_stall, from_featured, from_catalog, from_recent, from_favorites, from_category, from_quick, from_search, from_related, from_surprise, from_reload, from_history, from_direct, day_complete, exported_at |
| levels | pc, pc_label, copy, date, game, game_name, level, starts, visits, gave_up, wins, losses, draws, ends, quits, seconds, score_sum, score_count, score_max, day_complete, exported_at |
| hours | pc, pc_label, copy, game, game_name, hour, seconds, days, exported_at (summed over all exported days: no dates; only rows with `days` ≥ 3 and below the game's number of exported days with play) |

`copy` is `web` or `folder`. `sessions` counts sessions of at least a minute;
`short_sessions` those under a minute. `seconds` is rounded from milliseconds per row.
`levels.gave_up` is the raw count for every id; it means something only for levels that
can be won or lost (section 3).

**Hours and privacy.** An `hours` row is exported only when that game was played in that
hour on at least 3 of the exported days, and not on every exported day the game was
played (for example a weekly lab lesson at the same hour); other rows are left out. So no
row, read beside the dated `games` table, gives the hour of a single date. This is a
limit, not a guarantee: the table still shows when games are usually played, and with
fixed seating someone comparing seconds closely might narrow things down, so keep the
files like other class records. A first export or one soon after a clear may have no
`hours` rows. The page's own hours chart still uses all local days. The read-me sheet
says so.

* **Excel workbook** `play-stats_<pc>_<YYYY-MM-DD>.xlsx`: one file per click, written by a
  small built-in ZIP writer (no library). Sheets `اقرأني` (an Arabic explanation of every
  column), `days`, `games`, `levels`, `hours`, each an Excel table with the same name,
  right to left; numbers are numbers, ids and labels are text. It opens on any Windows
  locale without separator or encoding problems. An Excel table needs one data row, so
  a table with no rows keeps one blank row; the read-me sheet tells the Power Query step
  to drop rows where `pc` is empty. The read-me also says how long a PC keeps its days,
  that they live in one browser profile (another browser, a roaming or temporary
  profile, or cleared site data starts from zero), why some hours are missing and how
  to combine files (newest export per `pc` and `date`; for `hours`, per PC).
* **JSON** `play-stats_<pc>_<YYYY-MM-DD>.json`:
  `{ format: 'sg-play-stats', v: 1, pc: { id, label, copy }, exported_at, tables: { days: [...], games: [...], levels: [...], hours: [...] } }`,
  each table an array of flat objects with the columns above.

**Combining** (on the teacher page and in Excel): for each `(pc, date)` use only the rows
from the export with the newest `exported_at`; for `hours`, use each PC's newest export.
Never add two exports of the same PC and day. The local PC counts as one more source,
keyed by its id. The page lists each PC's first and last day and flags files that share
an id but not a label.

### Known limits

* A round the child leaves through the game's own pause menu stays open until the next
  round starts or the child leaves the game, so a little menu time is added to that
  round's time (it is still counted as a quit).
* A round left open files the engaged time its game last reported (`om`). The game's
  own last message on removal usually brings it up to date; if that message is lost (a
  crash), up to about 10 seconds of the round's end can be missing.
* Some games show their first-time coach again after a reload until it is completed, so
  "tutorial shown" can be higher than the number of children who saw it.
* Numbers come from one browser profile on one PC. Clearing site data, a roaming or
  temporary school profile, or a different browser starts from zero.

## 5. Step 2 with Microsoft 365 (later)

Step 1's files are the input; they do not need to change.

* **No code, no network from the site:** each week, on each PC, open 📊 → تصدير ملف Excel
  and save into one shared OneDrive or SharePoint folder (Edge and Chrome open a save
  dialog, which starts in the folder used last time; in other browsers turn on "Ask where
  to save each file" and answer «نعم» once the file is saved). One Excel workbook or
  Power BI report reads the folder (Get Data → From SharePoint Folder → combine the
  `days`, `games`, `levels`, `hours` tables), drops rows where `pc` is empty (the blank
  row of an empty table), keeps the newest `exported_at` per `pc` and `date`, and
  refreshes in one click.
* **Automatic collection** would need a Power Automate flow with an HTTP trigger (a
  premium licence) or an Azure Function, plus the school web filter allowing it. Any
  upload would send this same JSON **from teacher.html only**, so games and the portal
  stay free of network calls.

## 6. Tests

* `tools/tests/shared-kit.test.mjs`: Kit.stats in the vm sandbox with an injected
  `window.performance`; the existing exact-message checks stay, now with `om`.
* `tools/tests/portal-stats.test.mjs`: the recorder with stand-in game pages and a fake
  clock: sessions, late messages from removed frames, restart, failure, launch sources,
  hidden pages, delta merging across two tabs, clear and stop, blocked storage, the time
  of rounds left open (`om`), and `pruned`.
* `tools/tests/teacher-page.test.mjs`: the page with seeded records, the workbook and JSON
  exports (saved through a stand-in save dialog; a closed dialog, a failed write and an
  unconfirmed download count nothing; the download offered after a closed dialog; one
  dialog at a time; a renamed file), combining, clear and stop, blocked storage, winnable
  levels (id shapes, block-burst `'classic'`, fire-and-ice `'L4:duo'`, merge-2048 boards),
  the export reminder, the hours rule and games still open.
* `tools/tests/merge-progress.test.mjs`: a merge-2048 board is one round; the goal tile
  reports nothing and a full board reports `'end'` with the score.
* `tools/tests/play-stats-rules.test.mjs` (node only): no network APIs in Kit, portal,
  teacher page or games; no `Kit.stats` in engine or simulation files; every game calls
  `Kit.stats.round` and `Kit.stats.end` (the games come from `js/catalog.js` and the
  `games/` folders, so a new game is checked without editing the test; a game allowed
  not to report must be listed there with its reason); the teacher page's `NO_FRAMES`
  lists exactly the games without `Kit.loop` or `Kit.stats.frame`; literal ids follow
  the id rule.
* The build, offline, budget and downloaded-folder tests include `teacher.html`.

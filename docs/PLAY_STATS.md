# Play statistics (local only)

Teachers want to know which games children choose, how long they really play, where
they get stuck, and whether the school PCs run the games smoothly. This feature counts
that **on each PC only**. Nothing is sent over the network: there is no server, no
upload, no cookie and no third-party script. The numbers stay in the browser's
`localStorage` on that PC until a teacher exports them or clears them.

What is never recorded: names, anything a child types (typing-test words, search text,
class codes, Snake Arena's player name), free-text error messages, screenshots, mouse
paths or key sequences. Several children share one PC and two-player modes mix players,
so the numbers describe **games on a PC**, never individual children.

## How it fits together

```
game page (iframe)                    portal (index.html)                  teacher.html
shared/kit.js                         js/stats.js + js/site.js             js/teacher.js
  counts engaged time, frame  ──sg:stats──▶  validates, adds the open,       reads the day records,
  smoothness, rounds, mute    postMessage    load time, launch source,  ──▶  shows tables, exports CSV
  (no storage, no network)                   quick quits, settings;          and JSON, imports other
                                             writes one small record         PCs' JSON files to view
                                             per local day                   them together
```

* Games only talk to the portal through the existing `postMessage` channel, which the
  portal already validates (the message must come from the current game iframe).
  Outside the portal (a game opened on its own), statistics are counted but never sent.
* The portal owns the storage. Games never write statistics themselves.
* The teacher page is a separate, precached page, so children's pages do not grow.

## 1. Game side: `Kit.stats` (shared/kit.js)

Games call these at a handful of moments per round. They never throw, never return a
value the game depends on, never write storage, and do nothing costly.

| Call | When |
|---|---|
| `Kit.stats.round(id)` | A level, round, run or match starts (first play, retry, restart, next level). |
| `Kit.stats.end(result, score)` | The open round ends. `result` is `'win'`, `'lose'`, `'draw'` or `'end'` (an endless run or a round with no winner). `score` is optional: a finite number ≥ 0, such as distance in metres. |
| `Kit.stats.tutorial(step)` | `'start'` when a first-time tutorial or coach is shown, `'done'` when the child completes it. |
| `Kit.stats.frame(ms)` | Only for games that run their own `requestAnimationFrame` loop instead of `Kit.loop` (neon-slope, road-hopper): one call per rendered frame with the raw frame time. |

Rules for games:

* `id` is a short level id from the game's own list, for example `'L3'`, `'1-4'`,
  `'cpu-easy'`, `'2p'`, `'arena2'`, `'endless'`. Kit keeps `[A-Za-z0-9_:.-]`, at most 24
  characters; an empty id becomes `'main'`. Never put typed text, names or codes in it.
* Calling `round()` while a round is open records the open one as a **quit**. A round
  still open when the child leaves is recorded as a quit by the portal.
* `end()` with no open round is ignored, so calling it twice is harmless.
* Never report demo or attract modes, solution replays, bot-only matches, balance
  simulations or headless test harness runs.
* Two-player and CPU modes are part of the id (`'2p'`, `'cpu-hard'`); players are never
  identified.
* Never call these per frame (except `frame`), and never from a loop that runs while
  paused.

### What Kit measures by itself

* **Engaged time**: each input (key down, mouse button, mouse move) makes the next
  20 seconds count as engaged. Overlapping windows merge. A pause (blur, hidden tab,
  portal pause, Shift+Tab to the portal) or a hidden page cuts the window immediately.
  So time on a paused or abandoned screen is not counted, but a child watching a
  shot roll for a few seconds is.
* **Frame smoothness**: inside `Kit.loop` (or `Kit.stats.frame`), each rendered frame's
  raw time goes into one of four buckets, counted only while engaged and visible:
  smooth ≤ 20 ms, ok ≤ 34 ms, choppy ≤ 250 ms, stall > 250 ms. The first frame after
  the loop starts or the page becomes visible is skipped. The per-frame cost is a
  subtraction, two comparisons and an increment.
* **Mute toggles**: each time a child toggles sound in a game (button or M key).
* **Round time**: the engaged time inside each round.

### When Kit sends

Kit posts one message to the portal (only when embedded) when something changed:

* every 30 seconds, from a `setTimeout` chain started by `Kit.ready()` (the first one
  30 s later; nothing is posted inside `Kit.ready()` itself);
* when a round ends;
* when the game is paused for any reason (blur, hidden, portal pause, Shift+Tab);
* on `pagehide`.

Kit never posts at load, never adds fields to `sg:ready`, and never posts from its error
handlers. These keep the existing message tests exact.

### Message `sg:stats`, version 1

```js
{
  type: 'sg:stats', version: 1,
  e: 41250,                 // engaged milliseconds since the previous message
  f: [1830, 412, 37, 1],    // frame buckets since the previous message: smooth, ok, choppy, stall
  m: 0,                     // mute toggles since the previous message
  r: [                      // round events since the previous message, oldest first, at most 40
    ['s', 'L3', 0],         //   start of round L3
    ['l', 'L3', 18400],     //   lost L3 after 18.4 s engaged
    ['s', 'L3', 0],
    ['w', 'L3', 22100, 950],//   won L3 after 22.1 s engaged, score 950
    ['t', 'done', 0]        //   tutorial step ('start' or 'done' in the id slot)
  ],
  o: 'L4'                   // id of the round open right now, or ''
}
```

Event codes: `s` start, `w` win, `l` lose, `d` draw, `e` neutral end, `q` quit (replaced
by a new `round()`), `t` tutorial. When more than 40 events pile up, the oldest are
dropped (their counts are lost, which is fine for a classroom).

## 2. Portal side: the recorder (js/stats.js, used by js/site.js)

The portal turns sessions and messages into one record per local day. Records live in
memory and are written to `localStorage` only:

* when a game session closes,
* on `pagehide` and when the page becomes hidden,
* and at most once every 60 seconds while a game is open and something changed.

Each write is one `setItem` of today's record (usually 1–5 KB). On the first write after
the page loads, records older than **120 days** are removed. Every storage access is
wrapped in `try`/`catch`; if storage is blocked or full, statistics are simply not kept
(no warning to children, no console errors). The portal never calls
`localStorage.clear()`.

**Sessions.** A session opens when the portal really navigates to a game's play page
(not a re-render of the same page). Restart and Retry keep the same session. A session
closes when the child leaves the play page, switches games, the game fails, or the page
is hidden or unloaded. At close, the session's engaged time decides its length bucket
and whether it was a **quick quit** (under 60 s engaged), and a round still open (`o`)
counts as a quit.

**Launch source.** Where the child opened the game from: `featured` (🔥 tile on the
home grid), `catalog` (other home tiles), `recent` (Continue playing), `favorites`,
`category`, `quick` (quick filters), `search`, `related` (Other games on the play page),
`surprise`, or `direct` (address, reload, back/forward).

**Load time.** From the moment the portal creates the game iframe to the **first**
`sg:ready` from it. A 20-second timeout or an `sg:error` counts as a load failure or an
error (the error text is not stored).

**Settings.** Calm (classroom) mode switched on, portal fullscreen entered, and in-game
mute toggles (from `m`).

**Stop collecting.** If `sg:site:stats-off` is `true` (set from the teacher page), the
portal records nothing.

### Storage format, version 1

One key per local day (built from the PC's local date, not UTC):
`sg:site:stats:YYYY-MM-DD`.

```js
{
  v: 1, d: '2026-10-08',
  h: [0, 0, 0, 0, 0, 0, 0, 0, 312, 840, 95, ...],  // 24 numbers: engaged seconds per local hour
  s: { calm: 1, fs: 3, mute: 2 },                   // settings actions this day
  g: {
    'candy-rope': {
      o: 4,              // opens
      e: 1260,           // engaged seconds
      q: 1,              // quick quits (session under 60 s engaged)
      b: [1, 1, 2, 0],   // sessions by engaged length: <1 min, 1–5, 5–15, ≥15
      src: { recent: 2, category: 1, direct: 1 },   // launch sources (only non-zero keys)
      l: [4, 5230, 2100],                // load times: count, sum ms, max ms
      lb: [2, 2, 0, 0, 0],               // load buckets: <1 s, <2 s, <4 s, <8 s, ≥8 s
      x: 0,              // game errors
      t: 0,              // load timeouts
      f: [8120, 960, 44, 2],            // frame buckets: smooth, ok, choppy, stall
      tu: [1, 1],        // tutorial: started, done
      lv: {              // per level id (at most 60 ids per game per day; more go to '_other')
        'L3': [5, 1, 3, 0, 0, 1, 96, 950, 950]
        // starts, wins, losses, draws, neutral ends, quits, engaged seconds, score sum, score max
      }
    }
  }
}
```

Every number is a finite integer ≥ 0. The recorder clamps what it receives: engaged
time at most 120 000 ms per message, each frame bucket at most 20 000 per message,
round time at most 3 hours, score at most 1 000 000 000, and re-cleans every id.

Other keys: `sg:site:stats-pc` holds `{ id, label }` (a random 6-character id made by
the teacher page, and an optional label such as "جهاز 7"), and `sg:site:stats-off`.

## 3. Teacher page (teacher.html)

Opened from **🏫 إعدادات الصف → 📊 إحصاءات هذا الجهاز** (a new tab, so a running game is
not interrupted). It is not password-protected; it shows counts only. It works offline,
from a downloaded folder, and with storage blocked (it then says so).

It shows, for a chosen period (today, last 7 days, last 30 days, everything):

* totals: play time, sessions, games played, the most played game;
* a table per game: opens, minutes, average session, quick-quit share, days played,
  rounds and win share, smoothness (share of smooth frames), average load time, errors;
* hard levels: levels with at least 5 attempts and a win share under 35 %, or many
  quits;
* tutorial completion per game;
* how children reached games (launch sources), play time by hour, settings use;
* this PC: its label, processor cores, memory, screen size, graphics chip (shown on the
  page only, not exported).

Actions: name this PC, export CSV (games and levels), export JSON, open several JSON
exports from other PCs to view them combined (nothing is saved), stop or resume
collecting, and clear this PC's statistics (only the `sg:site:stats` keys).

### CSV export (for Excel)

UTF-8 with a byte-order mark, CRLF line ends, comma separated, Western digits, one row
per day and game (`games.csv`) and one per day, game and level (`levels.csv`):

* `games.csv`: `pc, pc_label, date, game, game_name, opens, minutes, quick_quits,
  sessions_lt1, sessions_1_5, sessions_5_15, sessions_ge15, rounds, wins, losses, draws,
  quits, tutorial_started, tutorial_done, load_avg_ms, loads, errors, timeouts,
  frames_smooth, frames_ok, frames_choppy, frames_stall, from_featured, from_catalog,
  from_recent, from_favorites, from_category, from_quick, from_search, from_related,
  from_surprise, from_direct`
* `levels.csv`: `pc, pc_label, date, game, game_name, level, starts, wins, losses,
  draws, ends, quits, minutes, score_avg, score_max`

These long tables combine directly in Excel (Get Data → From Folder) when several PCs'
exports are saved in one OneDrive or SharePoint folder.

### JSON export

`{ format: 'sg-play-stats', v: 1, pc: { id, label }, exported: '<ISO time>', days: [<day records>] }`.
The teacher page can open several of these at once and add them up for viewing.

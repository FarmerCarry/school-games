# Platform architecture

This is the contract for the portal and the shared runtime. It sits on top of the rules in
[`GAME_SPEC.md`](GAME_SPEC.md) and [`PERFORMANCE.md`](PERFORMANCE.md); where they disagree,
this file wins and they are updated to match.

## Decisions (made with the product owner)

| Question | Decision |
|---|---|
| Play tracking | **Anonymous play statistics only** ("Play statistics" below): the fast build may send what is played on each PC, never who plays it, to the school's own statistics server, and only when the build is given its address (`SG_TELEMETRY_URL`). No names, accounts, profiles or ages; no local play statistics or teacher statistics page; no third-party analytics. Nothing else on the site uses the network. |
| Players | **No profiles.** No "who's playing", guests, age bands or XP: children open a game and play. Each game's progress and difficulty belong to the PC. |
| Classroom settings | **None.** No classroom panel, quiet/effects preset, session timer or hand-over. The topbar 🔊 button mutes the portal and the games. |
| Difficulty | Every game scales: tiered complexity per game plus dynamic difficulty (`Kit.dda`) that adapts to how the children play on that PC. |

## Audience and pillars

* **Ages 6–11**, on old Windows school PCs with a mouse and keyboard and slow hard disks.
  Pure entertainment: arcade, action and hyper-casual loops. No edutainment.
* **Every game scales.** A 6-year-old novice and an 11-year-old expert must both find
  the right challenge: tiered complexity per game plus dynamic difficulty (DDA).
* **Zero background music.** Only tactile, procedural SFX (see below).
* **Lightweight.** No audio files, no fetched assets, one file per game in the fast
  build, procedural canvas/SVG/three.js art, offline cache.
* **Private by construction.** There is nothing to identify a child: no names, accounts,
  profiles or ages. Beyond each game's own progress and difficulty in that browser, the only
  record of play is the anonymous statistics a fast build with an address sends to the
  school's own server; a source tree, a build without an address and a downloaded folder
  send nothing at all.

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
games/<slug>/            game code (the UI layer calls Kit.dda, Kit.stats, Kit.track; engines stay pure)
shared/juice.js          Kit.juice  — procedural SFX engine (opt-in; portal + games)
shared/kit.js            Kit        — lifecycle, input, audio graph, saving, scaling, Kit.dda,
                                      play statistics (Kit.stats, Kit.track, sg:telemetry)
js/catalog.js            the games, categories and site name
js/telemetry.js          SGTelemetry — the ONLY network sender: anonymous play statistics
                                      to the school's server, off without an address
js/site.js               portal shell, iframe host, routes, favourites and recent games
js/offline.js            the fast build's offline cache controller
```

Games never touch storage outside `Kit.store`, never use the network, and talk to
the portal only through `postMessage` via Kit.

### Byte policy

Kit is inlined into every game page, so every minified byte in `shared/kit.js` costs
~38 bytes of offline cache.

* The play statistics in `shared/kit.js` (`Kit.stats`, `Kit.track`, `sg:telemetry`):
  **about 2,060 minified bytes** (measured with the build's esbuild options), about 90 KB of
  offline cache over the 44 game pages. Further growth needs a budget decision.
* `shared/juice.js`: **≤ 4,500 minified bytes**, loaded only by pages that use it
  (`<script src="../../shared/juice.js">` after `kit.js`; the portal loads
  `shared/juice.js` before `js/site.js`).
* Per-game budgets in `tools/asset-budgets.json` are reviewed numbers: when a change
  legitimately grows a page, raise its budget to the new size plus a small margin and
  record it in `docs/PERFORMANCE.md`.

## Kit (shared/kit.js)

Kit posts nothing at load and adds no timers; only while the portal says its statistics
sender is on does it post `sg:telemetry` and run one 10 s timer. Its messages with the portal:

| Direction | Message | Meaning |
|---|---|---|
| game → portal | `{ type: 'sg:ready', version: 1 }` | `Kit.ready()`: the game initialised and can be shown. |
| game → portal | `{ type: 'sg:warn', version: 1, message }` | One stray error after ready (at most once per 10 s). |
| game → portal | `{ type: 'sg:error', version: 1, message }` | `Kit.fail()` or a failed start: the portal offers Retry. |
| game → portal | `'sg:focus-portal'` | Shift+Tab from the game surface: keyboard focus goes back to the portal. |
| game → portal | `{ type: 'sg:telemetry', version: 2, e, f, il, ev }` | Anonymous play statistics ([`TELEMETRY.md`](TELEMETRY.md), "Kit"): engaged ms, frames, input latency, round events. Only after ready, while embedded and told `telemetry: true`. |
| portal → game | `{ type: 'sg:request-ready' }` | Repeat `sg:ready` if the game is already ready. |
| portal → game | `{ type: 'sg:pause', reason }` | Pause now (portal fullscreen exit and similar). |
| portal → game | `{ type: 'sg:preferences', telemetry, quiet?, motionPreference? }` | The portal's mute and motion settings, for file:// pages that cannot read the portal's storage, and whether its statistics sender is on (`telemetry`, a boolean; never stored by Kit). |

Messages are accepted only from the parent window; on http(s) they are posted to the
page's own origin.

### `Kit.dda(slug, opts)` — dynamic difficulty adjustment

A small controller that keeps the players near a target success rate (flow channel).

```js
var dda = Kit.dda('road-hopper', { id: 'main', target: 0.72, tiers: 5 });
dda.level            // 0..1, read at round start
dda.tier             // 1..tiers
dda.value(easy, hard)        // lerp(easy, hard, level)
dda.pick([t1, t2, t3, t4, t5]) // the entry for the current tier
dda.result(outcome)  // true/false, or a number 0..1 (e.g. accuracy, share of goal)
dda.reset()
```

* **Start** (no saved results on this PC): 0.35; `opts.start` overrides.
* **Update:** `n` = results so far; `step = clamp(0.18 / sqrt(1 + n / 2), 0.03, 0.18)`;
  `level += step * (outcome - target)`. **Mercy rule:** from the second outcome in a row
  below 0.3, each one drops an extra `step`. **Hot streak:** from the third outcome in a
  row at or above 0.9, each one adds an extra `step / 2`. Clamp to 0..1.
  `tier = 1 + floor(level * tiers * 0.9999)`.
* **Storage:** `Kit.store(slug)` key `dda` → `{ <id>: [level rounded to 3 decimals, n] }`
  for the PC. Saves from when the site had player profiles nested this by player
  (`{ <player>: { <id>: [level, n] } }`); the newest player's level for each id carries
  over and the first save writes the new shape.
* DDA lives in the UI layer (`game.js`): engines and level files stay pure and take
  difficulty as parameters (their Node verifiers load a stub Kit).

## Juice (shared/juice.js)

`Kit.juice` when Kit is present (games), `window.Juice` otherwise (portal). Built on
the Kit audio graph when present (`Kit.audio.unlock/ctx/master/muted`); in the portal
it creates its own lazily-unlocked `AudioContext` and reads `sg:site:muted` at every
sound (plus `Juice.setQuiet(bool)`). Never plays before a user gesture. Respects mute in every call.

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

The home page shows the starter game (Bubble Bop), the recently played games, favourites,
category chips, quick filters and search. A game opens in an iframe with fullscreen,
restart and favourite buttons, and its controls and tips beside it. The topbar 🔊 button
saves `sg:site:muted` (which Kit and Juice read) and tells the open game at once. The
reduced-motion choice `sg:site:motion` is shared with the games through `Kit.motion`.
The portal stores only favourites, recent games and these two preferences, and, while its
statistics sender is active, this PC's random code (`sg:site:rid`) and the batches still to
send (`sg:site:tm:anon:<hash>`).

## Play statistics

The owner's decision: keep anonymous play statistics, with no student accounts and no age
ranges. The full contract is [`TELEMETRY.md`](TELEMETRY.md).

* **Who:** nobody. There are no accounts, profiles, names or ages, and several children share
  each PC. A session is one portal page load; a random PC code ties the sessions of one PC
  together. Never a field about a child: no student code, age band, profile age, days since
  the last play, new-profile flag, level or XP, classroom mode or classroom timer.
* **What:** the build, the device's rough size (cores, memory, screen width), the time zone
  name; each game visit (the game, how it was opened, load time, engaged time, frame
  smoothness, input latency, load errors, hearts, tutorial start and end; the order of visits
  gives the game before and after); each round (the game's round id, outcome, score, attempt
  number, difficulty tier and level, hits and misses, reaction times, inputs, idle lapses,
  pauses, engaged and wall time).
* **Where to:** only the school's own statistics server, and only when the fast build is
  given its address (`SG_TELEMETRY_URL`, set by `.github/workflows/build.yml`). The source
  tree, a build without the address, a downloaded folder, this computer and a browser with
  Global Privacy Control send nothing. `js/telemetry.js` is the only file allowed to use the
  network, and only `fetch()` without cookies (`tools/lib/network-rules.mjs`).
* **Games:** every catalog game reports its rounds through `Kit.stats` in its UI layer, and
  the score, hits, misses, cues and first-time tutorial where it has them; engines, levels
  and simulations never report, and demos, attract modes, replays and bots never report:

| Reports | Games |
|---|---|
| rounds, outcome and score | all 44 (connect-four and tic-tac-toe through `shared/board-game.js`); no score: block-world, critter-mart, pizza-clicker, tank-splat, the board games and two-player rounds |
| hits and misses | bubble-bop, chaos-island, dino-3d, egg-rush, key-runner, keyboard-obby, lucky-lake, math-gates, road-hopper, seek-zoom, shortcut-factory, steady-hand, typing-test, word-garden |
| reaction times (`Kit.track.cue` / `react`) | bubble-bop, chaos-island, dino-3d, key-runner, keyboard-obby, lucky-lake, road-hopper, shortcut-factory, typing-test, word-garden |
| difficulty tier and level | every game that uses `Kit.dda` (reported by Kit at each read) |
| tutorial start and done | the games with a first-time coach |

## The onboarding game: «فقاعات بوب» (`bubble-bop`)

The new «ابدأ من هنا» starter title, for a 6-year-old who has never used a mouse or a
keyboard. A real arcade game, not a lesson: no text to read, no fail state, no timer
in the first worlds. Bop is a round, glowing friend that floats with the mouse pointer.

* **Worlds** (each 3 short levels + a 60-second "party" round, stars 1–3, colours and
  hats for Bop as rewards):
  1. **Touch** — bubbles drift up; touching one with Bop pops it (no click needed).
     Teaches cursor tracking.
  2. **Tap** — balloons; a click while over (or near) one pops it.
  3. **Jump** — press the long Space bar so a frog jumps and catches flies.
  4. **Catch** — ← → move a basket to catch falling fruit.
  5. **Party** — the four above mixed.
  6. **Drag** — carry baby turtles to the pool of their colour.
  7. **Double-click** — wake sleeping clams to find pearls.
  8. **Hold** — hold the button (or Space) to blow a bubble that fills a ring.
  9. **Arrows** — steer a submarine to starfish with all four arrows.
  10. **Letters** — press the key a balloon carries; an on-screen copy of the school
      keyboard always shows it, glowing.
  11. **Grand party** — worlds 6–10 mixed.
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
* Optional first-time picture cards show how to hold the mouse and where the keys are.


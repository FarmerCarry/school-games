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
| Difficulty | Every game scales from a gentle start to real challenge via tiered levels or endless ramps, and 33 of the 58 games also adapt dynamically (`Kit.dda`) to how children play on that PC. |

## Audience and pillars

* **Ages 5–11**, on old Windows school PCs with a mouse and keyboard and slow hard disks.
  Fun first: arcade, action, hyper-casual and playful skill games (typing, keyboard
  shortcuts, spelling and quick math built as fast arcade loops rather than worksheets).
* **Every game scales.** A 5-year-old novice and an 11-year-old expert must both find
  the right challenge: tiered complexity per game, plus dynamic difficulty (DDA) where
  adaptive pacing helps.
* **Zero background music.** Only tactile, procedural SFX (see below).
* **Lightweight.** No audio files, no fetched assets, one file per game in the fast
  build (with `three.min.js` and `shared/{artkit,juice,webgl}.js` cached once as shared files),
  procedural canvas/SVG/three.js art, offline cache.
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
shared/juice.js          Kit.juice  — procedural SFX engine (opt-in; portal + games; one shared file, not inlined)
shared/artkit.js         Kit.art    — opt-in 2D drawing kit (one shared file, not inlined)
shared/webgl.js          Kit.webgl  — opt-in WebGL guardrails for 3D games (one shared file, not inlined)
shared/kit.js            Kit        — lifecycle, input, audio graph, saving, scaling, Kit.dda,
                                      Kit.gfx, play statistics (Kit.stats, Kit.track, sg:telemetry)
js/catalog.js            the 58 games, categories and site name (clean English titles in `en`; no search `tags`)
js/telemetry.js          SGTelemetry — the ONLY network sender: anonymous play statistics
                                      to the school's server, off without an address
js/site.js               portal shell, iframe host, routes, favourites and recent games
js/offline.js            the fast build's offline cache controller and «new version» button
```

Games never touch storage outside `Kit.store`, never use the network, and talk to
the portal only through `postMessage` via Kit.

### Byte policy

Kit is inlined into every game page, so every minified byte in `shared/kit.js` costs
58 bytes of offline cache.

* The play statistics in `shared/kit.js` (`Kit.stats`, `Kit.track`, `sg:telemetry`):
  **about 2,060 minified bytes** (measured with the build's esbuild options), about 119 KB of
  offline cache over the 58 game pages. Further growth needs a budget decision.
* `shared/juice.js`: **≤ 4,600 minified bytes**, one external file cached once with
  `?v=<hash>` (not inlined; loaded by the portal before `js/site.js` and by 34 games
  after `kit.js`).
* `shared/webgl.js`: **≤ 7,500 minified bytes**, one external file cached once with
  `?v=<hash>` (not inlined; loaded by 3D Three.js games after `kit.js`).
* `shared/artkit.js`: **≤ 13,000 minified bytes**, one external file cached once with
  `?v=<hash>`. It is not inlined, so a byte there is paid once per PC, not once per game.
  Eight games load it: Beat Dash (`beat-dash`), Block World (`block-world`), Cake Guards
  (`cake-guards`), Lucky Lake (`lucky-lake`), Math Gates (`math-gates`), Splat Catapult
  (`splat-catapult`), Paint Tanks (`tank-splat`) and Sneaky Levels (`troll-level`).
  `tools/artkit-demo.html` is a review page and is not shipped.
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
| game → portal | `{ type: 'sg:round', version: 1, phase, result }` | `Kit.stats.round()` (`phase: 'start'`) and `Kit.stats.end()` (`phase: 'end'`, `result` the result's first letter: `w`, `l`, `d`, `e`, `q`). Only after ready and while embedded, whether or not statistics are on: the portal offers a "play next" game between rounds, and its «new version» button only while no round is open. |
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

### `Kit.gfx(slug, opts)` — light graphics for weak PCs

Rail Rush, Neon Slope, Road Hopper and Moto Madness turn on lighter graphics by themselves on
a PC that can't keep them smooth (some lab PCs of the same model run them at about 30 fps
while others hold 60).

```js
var gfx = Kit.gfx('road-hopper', { apply: function (light, why) { /* fewer pixels, no shadows */ } });
gfx.light            // read while building the renderer (antialias: !gfx.light ...)
gfx.set(false)       // the child's choice; kept for this game
```

* **Switch:** during engaged round play (the frames `Kit.stats.frame` and `Kit.loop` count),
  more than 15 percent of frames over 20 ms in two 120-frame windows in a row; stalls over
  250 ms are left out. A PC holding 60 fps never switches. It only switches once per page.
* **Storage:** `sg:<slug>:gfx` is `"light"` or `"full"`; `sg:site:gfx-light` makes the
  other heavy games on that PC start light too. A short notice offers the way back
  (`"full"`, never overruled for that game).
* `?lq` forces light, `?hq` forces full; automated browsers never switch unless `?gfxauto`.
* What light means is the game's: no antialiasing (from the next start), a 0.75 pixel ratio
  (Moto Madness: a 0.8 M pixel canvas instead of 1.8 M), no shadows in Road Hopper, no
  star field in Neon Slope.

### `Kit.webgl` (`shared/webgl.js`) — school-PC WebGL guardrails

Classic zero-dependency IIFE loaded after `shared/kit.js` by 3D Three.js games (kept
external with `?v=<hash>` in the fast build). Nothing runs at load.

* `Kit.webgl.probe(force?)` / `Kit.webgl.isSoftware(glOrRenderer?)`: cached software-GPU
  detection checking `RENDERER` and `WEBGL_debug_renderer_info` (`swiftshader`, `llvmpipe`,
  `softpipe`, `software`, `microsoft basic render`, `basic render`, `warp`, `mesa`) and
  releasing the throwaway probe context with `WEBGL_lose_context`.
* `Kit.webgl.pixelRatio(opts?)` / `Kit.webgl.createRenderer(canvas, opts?)`: clamps DPR
  for hardware (default max `1.5`), software GPUs (`0.75`), `Kit.gfx` light mode, or low
  mode (`0.5`), disabling MSAA on software/light renderers.
* `Kit.webgl.pacer(rendererOrGl, opts?)` / `Kit.webgl.whenDrawn(rendererOrGl, done, limit?)`:
  WebGL2 `fenceSync` + `getSyncParameter`/`clientWaitSync` frame pacing (with `gl.finish()`
  WebGL1 fallback) so software renderers never starve input or portal readiness.
* `Kit.webgl.watchContext(canvas, opts?)`: wires `webglcontextlost` (`preventDefault()`)
  and `webglcontextrestored`, toggling an optional notice element and firing callbacks.
* `Kit.webgl.showNoGL(opts?)`: reveals `#nogl` or creates an RTL Arabic fallback panel.
* `Kit.webgl.boot(fn, opts?)`: deferred 3D initialization via `requestAnimationFrame(() => setTimeout(fn, 0))`
  plus a fallback timer (`80 ms`) so background tabs and stubbed-rAF checks still boot.

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
category chips and quick filters (there is no search box: children rarely used it, and
old `#/search/…` links open the home page). Featured games (catalog `hot: <rank>`, chosen
from the play statistics as the games children stay with longest) lead the list. A game
opens in an iframe with fullscreen, restart and favourite buttons, and its controls and tips
beside it. When a round ends (`sg:round`), a small "play next" card in the stage's corner
offers one featured game that shares categories with this one; it hides when the next round
starts, and ✕ hides it for the rest of the visit. The topbar 🔊 button
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
| rounds, outcome and score | all 58 (connect-four and tic-tac-toe through `shared/board-game.js`); no score: block-world, critter-mart, pizza-clicker, tank-splat, the board games and two-player rounds |
| hits and misses | air-hockey, ball-storm, balloon-blast, bonk-garden, bubble-bop, chaos-island, cloud-hop, desk-karts, dino-3d, egg-rush, frog-pinball, hoop-heads, juicy-drop, key-runner, keyboard-obby, lucky-lake, magic-crayon, math-gates, recess-kitchen, road-hopper, robo-swarm, sandwich-tower, seek-zoom, shortcut-factory, skybound-golf, splat-catapult, steady-hand, toy-castle, typing-test, word-garden, zoom-plus-one |
| reaction times (`Kit.track.cue` / `react`) | ball-storm, bonk-garden, bubble-bop, chaos-island, cloud-hop, dino-3d, frog-pinball, key-runner, keyboard-obby, math-gates, road-hopper, shortcut-factory, skybound-golf, typing-test, word-garden |
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


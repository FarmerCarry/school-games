# Game spec (the rules every game follows)

Players are **children aged 6–11** (1st to 5th grade) on **old Windows school PCs with a mouse
and keyboard**, at school, as a reward. A 6-year-old who has barely used a mouse and an 11-year-old
expert play the same games, so every game scales (see "Kit v2 for game authors"). Every game is
**original and written from scratch** for this site: no copied code or art, no ads, no network
calls, no links to other sites. The platform contract is [`ARCHITECTURE.md`](ARCHITECTURE.md);
where the two disagree, it wins.

**Board games:** Connect 4 (`connect-four`) and tic-tac-toe (`tic-tac-toe`) offer
two players taking turns on the same PC and a computer opponent. Both modes must
work offline and from `file://`, without player names, accounts, or a game server.

The aim is **fun**: the kind of game a child picks on Poki or CrazyGames and asks for
"one more round". These are not educational games: arcade, action and hyper-casual loops.

## 🌐 Language: ARABIC (required)

The whole site is in **Arabic**. This was a late change, so **if a game you're working on
still has English text, converting it to Arabic is part of your job.**

- **Every piece of text the player sees is in Arabic**: the title/logo, buttons, how-to-play,
  HUD labels, popups ("ممتاز!", "رائع!"), level and world names, shop and skin names, mission
  text, achievements, bot/character names (fun, kid-friendly names that work in Arabic),
  pause and game-over screens, and the thumbnail logo text if it has any.
  Use simple, energetic Modern Standard Arabic that a child understands instantly. The youngest
  players barely read: keep words few and short, and show the action with pictures and keycaps.
- **Game title**: use the Arabic `title` from this game's entry in `js/catalog.js`.
- **Numbers** use Western digits 0–9 (scores, timers, levels): "النقاط: 120".
- **Key names** on keycaps: arrows ← → ↑ ↓ and letters (W, A, S, D, P, M, R…) stay as printed
  on the keyboard. Space = "مسافة", Enter = "Enter", Esc = "Esc", Shift = "Shift", Tab = "Tab".
  Mouse = "الفأرة", click = "انقر", drag = "اسحب". Wrap a group of keycaps in `<span dir="ltr">`
  so "← →" keeps its order.
- `<html lang="ar" dir="rtl">`. DOM panels and menus flow right-to-left, and text is right-aligned
  or centered.
- **Font**: CSS uses `var(--sg-font)`, and canvas uses `'700 40px Fredoka'` (or 500). The shared
  `Fredoka` family in `shared/game.css` automatically draws Arabic letters with a rounded Arabic
  font (Baloo Bhaijaan 2). Never draw Arabic with a font that has no Arabic glyphs. For canvas,
  wait for `document.fonts.load('700 40px Fredoka', 'ب')` or simply redraw every frame.
- **Canvas text**: set `ctx.direction = 'rtl'` when drawing Arabic. With `dir="rtl"`, the default
  `textAlign` of `'start'` means right-aligned, so **always set `textAlign` explicitly**
  (`'center'`, `'left'` or `'right'`). Never draw Arabic one letter at a time (it breaks the letter
  joining) and never use letter-spacing on Arabic.
- **Game worlds are NOT mirrored**: → still moves right, and courses, tables and mazes stay as
  designed. Only text and menu layout go right-to-left.
- **Check screenshots**: letters must be joined (not separated or reversed) and mixed Arabic with
  numbers must read correctly.

## Folder layout

```
games/<slug>/
  index.html     the game (required)
  thumb.svg      400×400 tile art for the home page (required)
  *.js / *.css   any other files the game needs (optional, keep them in this folder)
```

A game may only use files from its own folder plus these shared ones:

| Path (from the game folder)          | What it is                                                    |
|-------------------------------------|---------------------------------------------------------------|
| `../../shared/kit.js`               | helpers: sound, saving, keys, mouse, canvas scaling, loop, particles, local play statistics, profile, difficulty (`Kit.dda`), telemetry extras (`Kit.track`) |
| `../../shared/juice.js`             | optional procedural sound effects (`Kit.juice`); load it after `kit.js` |
| `../../shared/game.css`             | base page styles, the Fredoka font, overlay/panel/button/keycap classes |
| `../../lib/three/three.min.js`      | three.js r159 (classic script, gives `window.THREE`) for 3D games |

The two board games also share `board-rules.js`, `board-game.js` and `board-game.css`
from `shared/`. These are classic scripts/styles inlined by the fast build and are
not loaded by other games.

## Hard rules

1. **Classic scripts only.** No `type="module"`, no `import`, no `fetch()`/XHR of local files.
   The whole site has to work when someone double-clicks `index.html` from a folder (`file://`).
   Put level data in JS files or inline.
2. **Nothing external.** No CDNs, web fonts from the internet, online or third-party analytics,
   iframes or links out. **Games never use the network.** A game passes counts to the portal only
   through Kit (`Kit.stats`, `Kit.track`; see "Play statistics" below) and never adds another
   reporting channel; only the portal's `js/telemetry.js` may send anything, anonymously and only
   when a build is configured for it.
   All art is drawn in code (canvas, SVG, CSS, three.js geometry). Sound is synthesized with
   WebAudio (`Kit.juice`, `Kit.sfx` / `Kit.audio.tone` / `Kit.audio.noise`, or your own synth code).
3. **Kid-safe.** Cartoon only: no blood, gore, realistic guns, scary horror, bad words, romance or chat.
   Shooter games (the teacher asked for one) use chunky, colourful **toy paint/foam/water blasters**:
   hits make paint splats, a defeated character pops into paint/confetti and respawns.
   "Defeat" means splats, poofs, confetti and bonks. Characters are cute or silly.
4. **Fills the frame.** The page is shown in an iframe of about 1100×620, and fullscreen at
   1920×1080. Use a fixed logical resolution (16:9 is best, e.g. 1280×720) scaled to fit with
   letterboxing (`Kit.fit`), or a layout that adapts. No page scrollbars. Handle `resize`.
5. **Mouse and keyboard.** Arrow keys and Space must never scroll the page (`Kit.keys` handles
   this). Clicking anywhere in the game gives it keyboard focus. Two-player games share one
   keyboard: player 1 on **WASD** (plus nearby keys like Q/E/F/G/Space), player 2 on
   **arrow keys** (plus nearby keys like / . , Enter or the numpad), so four hands fit.
6. **Standard flow:**
   - **Title screen**: big logo/title, a big **Play** button (Enter/Space also starts), a short
     "How to play" with keycaps (`.sg-key`), and the best score or progress.
   - **In game**: score/HUD, **P or Esc pauses** (with Resume / Restart buttons), a **mute**
     button (`Kit.muteButton()`, which also binds M, unless your game needs M for something else).
   - **Game over / level complete**: result, "New best!" celebration, **Play again** (Enter/Space
     or R) and back to the menu. Getting back into the action takes one keypress.
   - Pause automatically when the tab is hidden (`Kit.loop` does this).
7. **Save progress** with `Kit.store('<slug>')`: best scores, unlocked levels, coins, upgrades,
   skins. Wrap everything so a missing localStorage never breaks the game (Kit does this).
8. **Fast.** Loads in about a second. Aim for a smooth 60 fps on an ordinary school PC with
   integrated graphics. No huge textures and no unbounded arrays; reuse objects and cap particles.
   With three.js, cap `devicePixelRatio` at 1.5 and keep draw calls low.
9. **Fast-build friendly.** Load your files with plain `<script src="…"></script>` and
   `<link rel="stylesheet" href="…">` tags (no extra attributes) — `tools/build.mjs` inlines
   them into one file per game. Don't read canvases back with `toDataURL`/`getImageData` in
   loops or every frame (each read waits for the graphics card); make images once and reuse them.
10. **No console errors** at any point: loading, playing, pausing, dying, restarting,
   resizing or reloading.
11. **Zero background music.** No game, menu, pause screen, result screen or portal page may play
   background music: no music loops, sequencers, step schedulers, melody/arpeggio beds, ambient
   music drones or "menu jingles" that repeat. Allowed:
   - **One-shot SFX** caused by the player or by a game event (a jump, a pop, a goal).
   - **Short one-shot cues** of at most ~2 s: win/lose/level-up/reward fanfares.
   - **Action-tied continuous sounds** whose level follows the player's own input and that fall
     silent when the input stops (an engine while the throttle is held, a rolling ball, wind
     while steering). They must be silent on title, pause and result screens.

   Rhythm-style games keep their beat as a **visual** pulse driven by the game clock, and may
   quantise the pitch of player-triggered SFX to a scale (the player "plays" the notes); they
   never schedule notes on their own. No music toggles, no `music` save keys, no "الموسيقى"
   buttons. Old saves that carry a `music` key are simply ignored. Guard:
   `tools/tests/zero-bgm.test.mjs` (browser suite) counts every `AudioScheduledSourceNode.start()`
   call in every catalog game during idle windows on the title screen and the pause screen; any
   start in those windows fails.

The board games use a compact DOM board and a two-choice mode menu in place of
rule 6's arcade title screen. In local two-player mode, players share the same mouse
or keyboard and take turns, so rule 5 does not require separate controls. Show whose
turn it is, stop moves after a win or draw, and alternate the starter on rematches.
Board columns stay physically left-to-right even when surrounding controls are RTL.
The interface updates on moves and mode changes rather than a continuous render loop.
Cancel pending computer moves when leaving or restarting a round.

## What makes it fun (the quality bar)

- **Juice**: screen shake, particles, squash-and-stretch, bouncy UI, satisfying sounds for every
  action, combo popups, a big celebration on a new best.
- **Instant start**: no long tutorial. The first 10 seconds teach by doing: an easy start,
  then ramping difficulty.
- **Hooks**: coins, stars, unlockable skins or levels, a best score to beat, "so close!" moments.
- **Bright, bold, readable** art with strong silhouettes and saturated colors. Big readable
  text (Fredoka font from `shared/game.css`).
- **Fair**: forgiving hitboxes, quick restarts, no unfair deaths.
- **Controls that feel tight and responsive**: coyote time and jump buffering for platformers,
  easing on cameras.

## thumb.svg

400×400 `viewBox`, a bold, colorful scene or character that tells you what the game is at a
glance (like Poki tiles). It must look great at 180 px. It may include the game's name as a
chunky logo. Self-contained: no external refs, no embedded bitmaps, under about 25 KB.

## Testing

Register the existing semantic pause function with `Kit.lifecycle({ pause: pauseGame })`.
It must be safe to call repeatedly, freeze active gameplay and show an explicit Resume
choice. Use the optional `reset` callback for game-specific held mouse or movement
state. Shared lifecycle handling covers blur, hidden tabs, portal escape and classroom
pause requests. Do not resume automatically when focus returns.

Call `Kit.ready()` only at the end of successful initialization. The portal waits for
this signal instead of assuming that an iframe load means the game works. Shared
startup error handling reports failures; it must not manufacture a ready signal.

Use `Kit.motion.reduced()` for custom camera shake or decorative motion. The shared
shake, particles, CSS and mute control already honor preferences and accessibility.
The shared CSS cuts every animation to 0.01 ms under reduced motion, so an element
that is visible only during an animation ending at opacity 0 disappears at once.
Give such pop-ups and toasts a reduced-motion style that keeps them readable, and
remove them with a timer rather than `animationend`.
When a game is paused or hidden, keep its last frame instead of redrawing an unchanged
scene every frame; redraw on resize, canvas restoration, late fonts and resume.
The portal's classroom preset temporarily overrides sound and effects without
writing each game's personal preferences; disabling it restores those preferences.
Handle `Kit.store(...).set(...) === false`; `Kit.saveStatus({ retry: saveGame })` provides
a consistent Arabic warning and retry button. Clear it only after all pending writes
succeed. Preserve existing saved progress when a write or reset fails.

Add each new game to `tools/game-scenarios.mjs` with real start/input/pause/restart
assertions. A clean console alone is not proof of working gameplay. The input check
must watch something only the player's input causes: if the watched state also
changes without input (a clock, a snake that keeps going, a push from a computer
player), give the scenario an `inputSeen` condition. `node tools/test-scenarios.mjs <slug>`
checks that the input check fails when the input does nothing. Keep pure engine and
saved-state regression tests alongside those browser scenarios.

`node tools/playtest.mjs <slug>` opens the game in headless Chromium, runs a scripted list of
clicks and key presses, saves screenshots and reports console errors (see the header of
`tools/playtest.mjs`). Look at the screenshots to check what the game actually looks like.

## Play statistics (Kit.stats)

Teachers see local statistics for each PC: which games children choose, how long they
really play, where they stop, and how smoothly games run. Kit measures engaged time,
frame smoothness and mute toggles by itself and posts small counts to the portal, which
stores them on that PC. A game sends nothing over the network and stores nothing for
statistics. The contract is `docs/PLAY_STATS.md`; in short, each game reports its rounds:

- `Kit.stats.round(id)` when a level, round, run or match starts (first play, retry,
  restart, next level). Free-play games call `Kit.stats.round('main')` when play starts.
  A new `round()` while one is open counts the open round as a quit.
- `Kit.stats.end(result, score)` when it ends: `'win'`, `'lose'`, `'draw'` or `'end'`, with an
  optional score ≥ 0 (any round may carry one: distance, stars, points; endless runs end
  with `'end'` and a score). Two-player modes on one PC (`'duo'`, `'local'`, `'pvp'`) report
  only `'end'` or `'draw'`. Automatic respawns inside a level are not new rounds.
- `Kit.stats.tutorial('start')` / `('done')` for a first-time tutorial or coach,
  `Kit.stats.busy()` at passive moments the child watches (at most about once per
  second, never per frame), and `Kit.stats.frame(ms)` only in games with their own
  `requestAnimationFrame` loop. A game that uses neither `Kit.loop` nor
  `Kit.stats.frame` (no steady drawing loop while playing) belongs in `NO_FRAMES` in
  `js/teacher.js`, so the teacher page says its smoothness is not measured.

Ids come from the game's own list and start with a letter (`'L3'`, `'w1-4'`, `'cpu-easy'`,
`'endless'`). Never put typed text, names or codes in an id. Never report demo or attract
modes, replays, bot-only matches or test runs. Put the calls in the UI layer (`game.js`,
`main.js`, `ui.js`, `shared/board-game.js`), never in engine, physics, rules, simulation or
level files, or in functions that Node tests load or call with a stub Kit.

## Kit v2 for game authors

The portal tells each game who is playing (an anonymous profile slot and an age band) and
whether anonymous telemetry is on; the contract is "Kit v2" in
[`ARCHITECTURE.md`](ARCHITECTURE.md). Everything below is safe standalone, before
`Kit.ready()` and with odd arguments, and follows the `Kit.stats` rules above: UI layer
only, never in engine, level or simulation files, never for demo or attract modes.

**Difficulty: `Kit.dda(slug, opts)`.** Create one controller per game (or per mode that
needs its own difficulty) once, in the UI layer. Read it at **every round start, before
`Kit.stats.round(id)`**, and pass the difficulty into the engine as parameters; engines and
level files stay pure (their Node verifiers load a stub Kit without `dda`).

```js
var dda = Kit.dda('road-hopper', { id: 'main', target: 0.72, tiers: 5 }); // the defaults
function startRound() {
  engine.start({
    speed: dda.value(120, 260),              // lerp(easy, hard, dda.level), level 0..1
    lanes: dda.pick([3, 4, 4, 5, 6])         // one entry per tier, dda.tier 1..tiers
  });
  Kit.stats.round('endless');
}
function roundOver(won, accuracy) {
  dda.result(won);                           // true/false, or a number 0..1 such as accuracy
  Kit.stats.end(won ? 'win' : 'lose');
}
```

* Never cache `level` or `tier` across rounds: a new player can take over between rounds,
  and Kit then loads that player's own state. One `result()` per try.
* A new player starts by age band (6–7 → 0.12, 8–9 → 0.38, 10–11 → 0.60, unknown 0.35;
  `opts.start` overrides). Kit keeps the child near `target` success, eases off after two
  poor tries in a row and speeds up after three great ones. Tiers are at most 9.
* Use `pick()` for tiered complexity (which mechanics, obstacle kinds or combos exist) and
  `value()` for continuous knobs (speed, size, spawn rate, aim assist). Kit saves the state
  in `Kit.store(slug)` under `dda`; a game never writes that key.
* `Kit.profile.band` / `.player` / `.onChange(fn)` are there for rare needs (a gentler
  first-time coach for 6–7). Never show, store or report the player key.

**Telemetry extras: `Kit.track`.** No-ops unless the portal has telemetry on. One call per
action, never per frame:

* `Kit.track.hit()` / `Kit.track.miss()` for each successful / failed action in the open
  round (a bubble popped, a fly missed), for accuracy.
* `Kit.track.cue()` when a target appears that the child should react to; Kit times the next
  key press or click. `Kit.track.react(ms)` reports a reaction time the game timed itself.
* Reading `dda.tier` reports the tier (`Kit.track.tier(n)` is only for games with their own
  tiers). Kit measures input latency by itself.

**Sound effects: `Kit.juice`.** Load `<script src="../../shared/juice.js"></script>` after
`kit.js`. Every call is a one-shot under 1.5 s, silent while muted, in classroom mode or
before the first key press or click, so it is safe to call on every event (mashing is
fine: repeats within 25 ms are dropped and at most 14 voices sound at once):
`tap()`, `select()`, `back()`, `toggle(on)`, `error()`, `hover()`, `streak(combo)`,
`impact(power 0..1)`, `chime(1..3)`, `coin(n)`, `pop(size 0..1)`, `whoosh(speed 0..1)`,
`jump(h 0..1)`, `land(power 0..1)`, `star(1..3)`, `levelUp()`, `fail()`, `countdown(3, 2, 1, 0)`.
It has no music API (rule 11).

**Network.** Games still never use the network: no `fetch`, beacons, sockets or remote
addresses. Kit only posts `sg:stats` and `sg:telemetry` to the portal, and only the
portal's `js/telemetry.js` may send anything on, anonymously and only when the build is
configured with an ingest address.

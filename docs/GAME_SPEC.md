# Game spec (the rules every game follows)

Players are **4th and 5th graders (ages 9–11)** on **Windows PCs with a mouse and keyboard**,
at school, as a reward. Every game is **original and written from scratch** for this site:
no copied code or art, no ads, no network calls, no links to other sites.

**Board games:** Connect 4 (`connect-four`) and tic-tac-toe (`tic-tac-toe`) offer
two players taking turns on the same PC and a computer opponent. Both modes must
work offline and from `file://`, without player names, accounts, or a game server.

The aim is **fun**: the kind of game a 10-year-old picks on Poki or CrazyGames and asks for
"one more round". These are not educational games.

## 🌐 Language: ARABIC (required)

The whole site is in **Arabic**. This was a late change, so **if a game you're working on
still has English text, converting it to Arabic is part of your job.**

- **Every piece of text the player sees is in Arabic**: the title/logo, buttons, how-to-play,
  HUD labels, popups ("ممتاز!", "رائع!"), level and world names, shop and skin names, mission
  text, achievements, bot/character names (fun, kid-friendly names that work in Arabic),
  pause and game-over screens, and the thumbnail logo text if it has any.
  Use simple, energetic Modern Standard Arabic that a 10-year-old understands instantly.
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
| `../../shared/kit.js`               | helpers: sound, saving, keys, mouse, canvas scaling, loop, particles |
| `../../shared/game.css`             | base page styles, the Fredoka font, overlay/panel/button/keycap classes |
| `../../lib/three/three.min.js`      | three.js r159 (classic script, gives `window.THREE`) for 3D games |

The two board games also share `board-rules.js`, `board-game.js` and `board-game.css`
from `shared/`. These are classic scripts/styles inlined by the fast build and are
not loaded by other games.

## Hard rules

1. **Classic scripts only.** No `type="module"`, no `import`, no `fetch()`/XHR of local files.
   The whole site has to work when someone double-clicks `index.html` from a folder (`file://`).
   Put level data in JS files or inline.
2. **Nothing external.** No CDNs, web fonts from the internet, analytics, iframes or links out.
   All art is drawn in code (canvas, SVG, CSS, three.js geometry). Sound is synthesized with
   WebAudio (`Kit.sfx` / `Kit.audio.tone` / `Kit.audio.noise`, or your own synth code).
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
assertions. A clean console alone is not proof of working gameplay. Keep pure engine
and saved-state regression tests alongside those browser scenarios.

`node tools/playtest.mjs <slug>` opens the game in headless Chromium, runs a scripted list of
clicks and key presses, saves screenshots and reports console errors (see the header of
`tools/playtest.mjs`). Look at the screenshots to check what the game actually looks like.

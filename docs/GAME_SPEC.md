# Game spec (the rules every game follows)

Players are **4th and 5th graders (ages 9–11)** on **Windows PCs with a mouse and keyboard**,
at school, as a reward. Every game is **original and written from scratch** for this site:
no copied code or art, no ads, no network calls, no links to other sites.

The aim is **fun**: the kind of game a 10-year-old picks on Poki or CrazyGames and asks for
"one more round". These are not educational games.

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

## Hard rules

1. **Classic scripts only.** No `type="module"`, no `import`, no `fetch()`/XHR of local files.
   The whole site has to work when someone double-clicks `index.html` from a folder (`file://`).
   Put level data in JS files or inline.
2. **Nothing external.** No CDNs, web fonts from the internet, analytics, iframes or links out.
   All art is drawn in code (canvas, SVG, CSS, three.js geometry). Sound is synthesized with
   WebAudio (`Kit.sfx` / `Kit.audio.tone` / `Kit.audio.noise`, or your own synth code).
3. **Kid-safe.** Cartoon only: no blood, gore, guns, scary horror, bad words, romance or chat.
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
9. **No console errors** at any point: loading, playing, pausing, dying, restarting,
   resizing or reloading.

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

`node tools/playtest.mjs <slug>` opens the game in headless Chromium, runs a scripted list of
clicks and key presses, saves screenshots and reports console errors (see the header of
`tools/playtest.mjs`). Look at the screenshots to check what the game actually looks like.

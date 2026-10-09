# Performance guardrails

Run `npm run build`, then `npm run perf:assets`. The budget check measures the
actual optimized files in `_site`; it does not build or change them. To retain
the measurements, run:

```sh
npm run perf:assets -- --report artifacts/asset-budgets.json
```

Use `--root <directory>` to check another build output and `--config <file>` to
test a proposed budget file. Relative paths resolve from the repository root.
The JSON report includes each measurement's files, current bytes, limit, pass
status, and all failures. Missing measurements have `bytes: null` rather than
an invented zero; newly added assets without a limit have `limitBytes: null`
and fail coverage. In GitHub Actions, `provenance` records the commit SHA,
repository, run ID, and run attempt from the runner environment so the artifact
can be matched to a deployment. Local reports are labeled `environment: local`.
Invalid inputs and exceeded limits exit nonzero.

## What the limits cover

All limits in `tools/asset-budgets.json` are **uncompressed on-disk bytes**.
They are deterministic for a given build. They are not gzip/Brotli transfer
sizes, JavaScript execution time, or a browser's total network traffic.

- Portal: the single built `index.html`, including inlined thumbnails, styles,
  catalog, and scripts.
- Teacher page: the single built `teacher.html` (play statistics), including its
  inlined catalog, styles and script. It is precached but only teachers open it.
- Games: each built `games/<slug>/index.html`, including its inlined code and
  styles. The source catalog is checked every run, including hidden entries.
  Added games need an explicit limit; missing games and obsolete limits fail.
- Shared library: `lib/three/three.min.js`, counted once in its own measurement.
- Fonts: each shipped WOFF/WOFF2/TTF/OTF/EOT file has an explicit limit. Added or
  removed fonts require a matching budget update. License text is not a font.
- Offline precache: the sum of every unique file named in the generated
  service worker's `FILES` manifest, including icons and the web manifest.
  The checker parses its JSON declaration without executing the service worker,
  rejects malformed/unsafe paths, and requires the portal, games, shared library,
  and fonts to remain in that manifest. Files must exist inside the output root;
  symlinks and non-file assets fail.

The offline total is the whole installation footprint, **not the initial page
payload**. A visit loads a particular page and its dependencies; the worker
separately fills the offline cache. Unchanged files may be reused on updates.
Files outside `FILES` (such as licenses, the worker itself, and build metadata)
are not included in the precache total. Source thumbnails remain editable SVGs;
the optimized release embeds them in the portal and omits redundant separate
copies. This guard checks size and coverage; the offline tests still
verify worker behavior and content integrity.

## Initial baseline and headroom

The game, library, and font limits were calibrated from the minified build of
commit `4b07e0c` on 2026-10-05. Game limits use that size plus 12%, rounded up to
the next 1,000 bytes. The portal and offline limits were explicitly tightened
after the cleanup below, rather than automatically regenerated. The portal has
about 9% headroom; the other limits retain about 12–14%. Exact bytes can differ
slightly between Windows and Linux builds.

| Measurement | Observed bytes | Limit bytes |
| --- | ---: | ---: |
| Portal after cleanup | 329,101 | 360,000 |
| three.js | 667,803 | 750,000 |
| Baloo Arabic 500 | 22,324 | 25,000 |
| Baloo Arabic 700 | 22,276 | 25,000 |
| Fredoka Latin 500 | 16,248 | 18,500 |
| Fredoka Latin 700 | 15,900 | 18,000 |
| Offline precache after cleanup, 42 files | 4,446,236 | 5,000,000 |

There are 31 independently budgeted games. These limits give small features room
while catching large unreviewed growth. They are not updated automatically and
do not claim that every smaller increase is harmless.

## Cleanup decisions

The fresh homepage now creates 31 catalog cards instead of 108 repeated cards.
A returning player can see up to six additional recent games, and the play page
offers at most six related games instead of the other 30. A regular CSS grid
replaces the mosaic placement solver. Category and favorites routes retain
stable keyboard order, while the search input keeps focus during filtering.

Rail Rush, Critter Mart, Wacky Soccer, and Block World retain their last paused
scene after effects settle, then redraw on resize/state changes, canvas restoration, late fonts, and resume.
Block World saves once when an active game is hidden. Critter Mart retains its
three-second checkpoint interval and resets that interval after a successful
critical save, avoiding a second immediate checkpoint. Tests verify redraw and
save counts; these are not claims about school-PC frame rates.

The thumbnail encoder preserves SVG text and significant whitespace while using
less percent-encoding. Pixel comparisons cover all 31 images. The uncompressed
portal decreases from 367,646 to 329,101 bytes (about 10%); compressed transfer
savings are smaller. Removing separate thumbnail copies reduces the release
artifact size, not the offline precache size, since they were never precached.

Keep the single-file game and portal packaging unless repeated measurements on
representative hardware justify changing it. External thumbnails and shared
helpers trade fewer repeated bytes for more file requests. Preserve relative
paths, atomic verified offline updates, and downloaded-folder use when evaluating
that tradeoff. The source-independent tests run once in CI; browser gameplay
tests still run against both source and optimized output.

### Local comparison, 5 October 2026

Seven alternating pairs of fresh Edge 154 contexts at 1280×900, localhost,
without CPU/network throttling and with service workers blocked, produced these
medians. Readiness is fonts ready plus two animation frames; it does not wait
for every offscreen thumbnail. Physical disk caches were not cleared.

| Portal measure | Main `4b07e0c` | Cleanup |
| --- | ---: | ---: |
| Fresh catalog cards | 108 | 31 |
| DOM elements | 1,185 | 365 |
| Script work | 15.3 ms | 4.8 ms |
| Layout work | 96.1 ms | 63.4 ms |
| Fonts + two frames ready | 321.4 ms | 272.1 ms |
| Load event | 148.6 ms | 185.5 ms |

The cleanup does less page work; these mixed timing results do not establish
an overall load-time improvement or predict classroom performance.

Packaging alternatives were tested separately in five rotating runs per
profile with gzip, default hardware rendering, and both local and simulated
1 Mbps / 75 ms latency / 4× CPU slowdown. External thumbnails improved the
throttled complete-gallery median from 2,016 to 1,680 ms, but local loading
changed from 263 to 283 ms and cold homepage requests increased from 6 to 37.
External shared kit/CSS saved about 398 KB across the offline cache and reduced
throttled second-game loading from 257 to 221 ms, while first-game loading rose
from 497 to 563 ms with three requests instead of one. All candidates worked
offline and from downloaded folders. These tradeoffs do not justify changing
the one-file default without representative classroom measurements.

## Reviewed classroom and Golf additions, 5 October 2026

The combined classroom reliability and Golf changes retain the 31-card portal,
six recent games, six recommendations, single-file packaging, and 42-file offline
cache. These are intentional feature costs relative to cleanup `cb8a46e`, measured
with the same Windows minified build and gzip settings:

| File | Cleanup bytes | Combined bytes | Cleanup gzip | Combined gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Connect Four | 35,512 | 42,613 | 12,149 | 13,894 | 43,000 |
| Tic Tac Toe | 35,490 | 42,591 | 12,149 | 13,877 | 43,000 |
| Skybound Golf | 62,059 | 70,662 | 23,154 | 25,641 | 71,000 |

Each board's 7,101-byte increase is fully accounted for by shared lifecycle,
readiness, motion and save-status code (+3,814), shared accessibility styles
(+1,033), compact-board layout styles (+2,267), and board-controller changes
(-13). Each dependency remains inlined once. Golf adds the same shared code and
styles, visible putting feedback, a bounded scenery cache, durable completed-shot
rewards, and canvas recovery. Its compressed increase is 2,487 bytes.

Only these three limits change, rounded up to the next 1,000 bytes. The portal
remains below its unchanged 360,000-byte limit at 346,446 bytes (72,627 gzip),
and the offline cache remains below its unchanged 5,000,000-byte limit at
4,624,891 bytes. No new production dependency, request, font, or precached file
is introduced. Repeated shared code across separate game pages is the existing
downloadable single-file tradeoff; this update does not duplicate dependencies
within a page or change that packaging decision.

## Game audit fixes, 7 October 2026

A per-game audit for 10–11 year olds on slow-disk, UHD 630 school PCs led to
reviewed fixes in 13 games. Most of them cost nothing per frame, and several
remove work: Splat Strike, Neon Slope, Swing Hook, Drift King, Sumo Bonk and
Tank Splat now keep their last paused frame instead of redrawing it, like the
games listed above; Fire & Ice no longer creates a new glow canvas on almost
every frame of a button press; Rail Rush compiles its shaders at boot instead of
in the middle of a run. Measured with the Linux minified build:

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Connect Four | 42,443 | 50,522 | 13,739 | 16,317 | 52,000 |
| Tic Tac Toe | 42,421 | 50,500 | 13,714 | 16,296 | 52,000 |

Each board's 8,079-byte increase buys the features the audit found missing: easy
and medium computer levels (the old computer was unbeatable for children), a
session score and saved wins per level, win/draw sounds and confetti, a landing
preview, and larger boards with static gradient materials. The limit is rounded
up to the next 1,000 bytes plus one, because Windows builds differ slightly.

Every game also grows by 563 bytes: the shared save warning now folds into a
corner badge that keeps Retry, so a PC whose storage is blocked is not covered
for the whole session. The other changed games stay inside their unchanged
limits (Tank Splat is closest, at 106,858 of 110,000). The portal is 348,269
bytes and the offline cache 4,666,890 bytes, both under unchanged limits. No
production dependency, request, font or precached file is added.

The second batch fixed the other 17 games the same way. It also removes work:
Blob Battle draws pellets from a pre-shrunk sprite sheet instead of thousands
of arc paths, Wacky Soccer caches its crowd and limits the hard CPU's lookahead,
Block World and Block Burst no longer stall startup on a GPU read-back, Road
Hopper renders character thumbnails in small idle steps before the screen
opens, then frees their WebGL context, and Air
Hockey, Hoop Heads, Candy Rope, Sneaky Levels, Road Hopper, Snake Arena, Blob
Battle and Pizza Empire keep their last paused frame. Two limits change:

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Skybound Golf | 70,849 | 78,259 | 25,468 | 27,976 | 80,000 |
| Candy Rope | 100,468 | 107,191 | 33,325 | 35,798 | 109,000 |

Golf's growth pays for a hit button that strikes on press, star pickups for
coins along the flight, a ball-style shop for players who maxed every upgrade,
a sky that rises into space, and record celebrations. Candy Rope's pays for
hints that show when to cut, adjusted to the player's own timing. The other 15
games stay inside their unchanged limits.

A third pass, on 8 October, worked through the reviewers' remaining notes on
both batches and changed 30 games (Fire & Ice needed nothing). It removes more
per-frame work: Beat Dash, Block Burst, Paint Grab, Maze Dash, Merge 2048, Moto
Madness and Pool Party now keep their last paused frame, Swing Hook's kept
frame is complete, and Moto Madness skips a far-hill fill hidden behind the
near hills. Games that cache painted canvases (Moto Madness, Wacky Soccer,
Block Burst, Paint Grab, Maze Dash, Sneaky Levels and others) repaint them
after a GPU reset instead of staying blank. The slowest browser tests got
faster: Sumo Bonk's regression test by about 10 times and Tunnel Blitz's by
about 6. The changed games grew by 636 bytes on average (19,093 in total). One
limit changes:

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sneaky Levels | 101,529 | 102,589 | 34,290 | 34,718 | 104,000 |

Sneaky Levels' growth repaints the themed floor top under a trap block once
the block moves away, paints the canvas edge the baked level does not reach,
restores the baked level after a GPU reset, and keeps the save warning clear
of the hint bar and pause button; it had only 411 bytes left under the old
limit. The other games stay inside their unchanged limits, and the offline
cache is 4,727,825 of 5,000,000 bytes.

## Local play statistics, 8 October 2026

Teachers asked which games children choose, how long they really play, where they
stop, and how smoothly the school PCs run each game. The answer is counted on each
PC only (`docs/PLAY_STATS.md`): nothing is sent over the network. The costs:

* **Every game** gains the shared `Kit.stats` counter (+876 bytes of Kit, including
  the open round's time `om` in each message) and its own few calls (+56 to +332
  bytes): about 1 KB per game in total. Per frame it
  adds a subtraction, a few comparisons and an increment, and only while a child
  is actually playing. It writes nothing: games post a small message to the portal
  at most every 10 seconds and when a round starts or ends.
* **The portal** grows by 6,412 bytes (the recorder) to 354,681 of 360,000. It
  writes one small day record (usually 1–5 KB; 4–6 KB on a busy computer-lab PC) when
  a game closes, when the page is hidden, and otherwise at most once a minute while
  something changed. All stats keys stay under 300 KB and 120 days, whichever comes
  first, so they never crowd out game saves; a busy lab PC may therefore keep only
  2–3 months, and the teacher page warns before and after days are removed for space.
* **The teacher page** is one new precached file, 82,405 bytes (26,892 gzip), with
  its own limit of 87,000. Children's pages do not load it.
* The offline cache grows from 4,727,825 to 4,849,157 of 5,000,000 bytes.

Nine games had less than 1,000 bytes left after this, so their limits rise to the
next 1,000 bytes plus one, as before:

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paint Grab | 105,908 | 106,974 | 37,048 | 37,590 | 108,000 |
| Connect Four | 50,716 | 51,728 | 16,370 | 16,930 | 53,000 |
| Tic Tac Toe | 50,694 | 51,706 | 16,347 | 16,902 | 53,000 |
| Skybound Golf | 78,700 | 79,703 | 28,139 | 28,678 | 81,000 |
| Candy Rope | 107,559 | 108,622 | 35,925 | 36,508 | 110,000 |
| Sneaky Levels | 102,589 | 103,608 | 34,718 | 35,277 | 105,000 |
| Merge 2048 | 76,510 | 77,467 | 25,978 | 26,480 | 79,000 |
| Lightning Fingers | 101,354 | 102,356 | 35,210 | 35,756 | 104,000 |
| Tank Splat | 108,017 | 109,092 | 36,241 | 36,892 | 111,000 |

The other 22 games and the portal stay inside their unchanged limits. No request,
font, library or third-party code is added.

## Rebuilt Skybound Golf, 9 October 2026

ضربة إلى الفضاء was rewritten from scratch with new art and game feel: a swing
gauge drawn around the golfer, rockets and timed super bounces in flight, five
worlds with parallax backdrops, boost rings, balloons, props and an altitude
goal. Everything is still drawn live on one canvas with no images and no cached
bitmaps. It loads the same files as before: `physics.js`, `art.js`, `game.js`
and `style.css`, plus the shared Kit and styles.

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Skybound Golf | 79,703 | 108,880 | 28,678 | 37,600 | 112,000 |

The new page sits in the middle of the other games (about 50 to 230 KB). Its
thumbnail is smaller (5,958 instead of 7,369 bytes), so the portal shrinks from
354,681 to 353,215 of 360,000 bytes. The offline cache grows from 4,849,792 to 4,877,642
of 5,000,000 bytes. In headless software rendering at 1280 × 720 a frame's
draw, including rasterization, takes about 7.5 to 9 ms (median) during a flight.

## CI, review, and deployed performance

The build workflow runs this check immediately after building, on pull requests
and main. A failed check blocks this workflow's deployment. The
`asset-performance-budgets` artifact is uploaded whenever a report exists,
including on budget failures, so reviewers can compare current bytes and limits.
Pages must use **GitHub Actions** as its publishing source for this workflow to
gate publication; a separate legacy branch-based Pages deployment can publish
independently of these checks.

When a check fails, inspect the changed assets first: unexpected inlining,
duplicate dependencies, font variants, or unoptimized content can explain growth.
For an intentional addition, propose the smallest justified limit change with
the before/after report, user benefit, and loading/offline cost in the PR.
New games and fonts need explicit entries and an offline-total review. Removing
assets should remove their entries. Never raise every limit just to make CI pass.

This workflow cannot detect live timing regressions, CDN/cache behavior, or slow
frames on school PCs. Browser timing measurements complement byte budgets and
should compare the same routes, cold/warm cache state, viewport, hardware, and
build across runs. Headless Chromium often uses software rendering; its frame
rate is **not school-PC FPS**. Confirm rendering improvements on representative
school hardware, and keep the existing gameplay, browser, and offline checks.

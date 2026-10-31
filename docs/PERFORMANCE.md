# Performance evidence and measurement

The retained changes reduce portal bytes and repeated Hoop Heads drawing preparation, and let a returning player explicitly adopt a verified offline update between games. They preserve single-file release pages, local fonts, relative paths and the downloadable offline ZIP. No classroom FPS or physical hard-disk speedup is established.

## Accepted and reverted experiments

| Experiment | Decision and evidence | Cost or limit |
| --- | --- | --- |
| Thumbnail SVG encoding | Keep bounded markup whitespace compaction and UTF-8 encoding with script/URI delimiters escaped. All 31 original/optimized thumbnails match every RGBA channel after fonts load; safety edge cases pass. Isolated portal savings: 21,045 raw, 1,685 local gzip and 1,454 Brotli bytes. | Source artwork and geometry are unchanged. No timing speedup was proved in this phase. |
| Hoop Heads drawing preparation | Keep stable vector paths and measured text-fit sizes. Thirty equivalent warm scene draws remove 82 path-building calls per frame (8.69% of those calls) and six text measurements. All 32 representative RGBA comparisons match, including all eight skins, three scales and shop previews. | +576 raw / +265 gzip / +221 Brotli bytes. At most 44 Path2D objects containing 96 geometry commands, plus 32 fit entries; no added raster surfaces. Native path bytes are browser-managed. This does not establish less GPU painting or higher FPS. |
| Splat Strike deferred startup | Revert completely. Twenty counterbalanced real-portal observations and five direct samples per build showed no useful/playable/input gain beyond observed variation. Earlier load/game-to-portal `Kit.ready` handshake moved work later. | Required shader compile and first draws remain synchronous as before. The rejected +1,154-byte candidate is absent. |
| Completed offline updates | Keep Arabic availability and explicit tab-local refresh after verified readiness. First install, incomplete/failed installs, offline consent, independent tabs, actual paused/menu/handoff sessions and a game opening during awaited verification are covered. | +1,908 raw / +501 gzip / +453 Brotli portal bytes. A game-only deployment downloads its changed game plus the portal carrying the new build identity. A page open before this feature needs ordinary navigation/reload to acquire the controller. |

Hoop's gradients, rotating seams, fixed highlight, animated faces/limbs/flames and score effects remain live. Caches have bounded eviction and clear for late fonts/context restoration; same-key background resize reuse remains unchanged. Offline identity is derived from canonical pre-metadata bytes, then the final portal bytes are hashed into the worker manifest; there is no clock, recursive hash or cache-clear update strategy.

## Final release bytes

Original product commit: `ba0bee64b5f47bd999f49e71545cc0d27380d891`.

| Asset | Original | Final | Change |
| --- | ---: | ---: | ---: |
| Portal raw | 354,734 | 335,597 | -19,137 (-5.39%) |
| Portal local gzip, level 6 | 76,796 | 75,612 | -1,184 |
| Portal local Brotli, quality 11 | 61,286 | 60,285 | -1,001 |
| Hoop Heads raw | 145,295 | 145,871 | +576 |
| Offline precache raw total | 4,864,759 | 4,846,198 | -18,561 |

These are disk bytes and local compression estimates, not CDN transfer measurements. Existing asset budgets stay unchanged. All games, fonts and libraries other than Hoop are byte-identical to the frozen original release. The final portal includes both thumbnail savings and update UI costs.

## Reproduce a matched measurement

Install locked development tools with `npm ci` and install Playwright Chromium with `npm run browsers:install`, or use an installed Edge via `PLAYWRIGHT_CHANNEL=msedge`. Development tools are not runtime dependencies of the website.

Build the original commit in a separate clean checkout with its locked dependencies and preserve that output. During this investigation the original clean source archive, working-file SHA256 manifest and all 50 built file hashes were frozen under `.work/performance/baseline-source.zip`, `baseline-freeze.json` and `baseline-site/`. These local evidence artifacts are ignored by Git. Preserve the checkout's line-ending policy and build environment for byte-exact reproduction; every runtime report also records its actual measured asset hashes.

Run both builds with the **same current harness** from this checkout. Example in PowerShell, with the original build already frozen:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
node tools/build.mjs --out .work/performance/final-site
node tools/asset-budgets.mjs --root .work/performance/final-site --report .work/performance/final-assets.json
$env:SG_ROOT='.work/performance/baseline-site'
node tools/perf.mjs --samples 5 --seconds 8 --json .work/performance/final-baseline.json portal hoop-heads splat-strike
$env:SG_ROOT='.work/performance/final-site'
node tools/perf.mjs --samples 5 --seconds 8 --json .work/performance/final-candidate.json portal hoop-heads splat-strike
node tools/perf-compare.mjs .work/performance/final-baseline.json .work/performance/final-candidate.json --json .work/performance/final-comparison.json
```

One browser runs serially; keep other browser/rendering/CPU verification out of the timed window. The local profile is headless Edge 155.0.4283.45 on Windows, ANGLE/SwiftShader, 1280×720, DPR 1, no CPU/network throttle or synthetic latency. Each target/repetition has a fresh context; the second visit retains HTTP cache (`max-age=600`) but resets local/session storage. Service workers are blocked and contamination is checked. This warm profile does not measure service-worker/offline startup. Target order rotates each repetition. Normal game randomness is retained and contributes variation.

`--latency` is synthetic HTTP delay, never a HDD simulation. `--native-gpu --headed` removes software overrides for experiments on actual school hardware; compare that separate profile only with itself. Native local measurements are still needed before making hardware FPS/storage claims.

The default CLI includes the portal and every catalog game. DOM-led routes are supported: `typing-test`, `connect-four` and `tic-tac-toe` use real words/chooser controls and normal typing/board moves, rather than a hidden results canvas.

## Meaning of each timing

- `loadMs`/`dclMs`: navigation/parser milestones; neither proves readiness.
- `firstUsefulMs`: local fonts loaded and visible title/catalog/content over two animation-frame opportunities. Portal artwork in the viewport must finish `decode()` and reach opacity 1, including its ancestors. Typing requires populated visible words; boards require their visible mode chooser. This is a paint-opportunity proxy, not pixel measurement. Separate settled screenshots verify appearance.
- `readyForStartMs`: useful screen plus initialized game/board state and enabled primary control. Direct pages do not use the portal's `Kit.ready` message as proof of playability.
- `startRequestedMs`: in-page timestamp just before the normal UI Start sequence, without a post-load settling delay.
- `playableMs`: normal Start, natural intro/countdown and two consecutive active-state opportunities. The portal has no playable game and records null.
- `inputResponsiveMs`: the normal scenario has observed input changing gameplay, or real portal search produced matching tiles. The observer latches this independently of scripted input/wait duration.
- `scriptToInputMs`: cumulative CDP script duration sampled after the scenario's input assertion; it can extend beyond the latched response timestamp.
- Activity intervals: repeated real input or scrolling after responsiveness. Idle/countdown/recovery gaps are excluded. Recoveries are reported; script duration is unavailable after a reload. JS heap is separate from native vector/GPU storage.

The real portal iframe stays hidden/inert until `sg:ready`, then fades in. Direct-page title timing alone cannot establish a website-user gain. The reverted Splat experiment additionally measured the actual catalog launch, opacity-1 wrapper, enabled Start, natural countdown and responsive movement.

`readiness-v2` fixes the earlier observer's hidden-first-canvas selection and portal-opacity gap. Earlier phase reports remain historical evidence; they must **not** be compared with v2 reports. Both original and final builds must be rerun after any tool, scenario, launcher, input helper, browser or configuration change.

## Interpretation and CI

Reports retain every raw sample, asset SHA256/bytes, commit/dirty state, lockfile hash, tool/scenario/input/launcher hashes, browser/OS/CPU/graphics and configuration. Summaries give median, min/max, p10/p90 and median absolute deviation. The comparator requires at least five equivalent samples, matching profiles, no failed input/runtime rows and no SW/DPR contamination. It recomputes summaries from raw rows.

A timing claim must exceed both runs' p10–p90 spread, an unchanged-control drift bound when supplied, and a 1 ms floor, with the same direction in at least 80% of repetition pairs. This is an evidence rule, not a confidence interval. If a material flag needs investigation, repeat the unchanged product under the same profile once; preserve the original flagged result and all interrupted reports. Never retrofit an old control to a new hash or chase a better score. Readiness regressions cannot be offset by an earlier load event.

CI retains its required source/built/gameplay/offline/Windows and raw-byte budget checks. A separate **informational** software-rendered step measures five samples of portal, Hoop and Splat with five-second activity windows, bounded to eight minutes, and uploads `runtime-performance.json` with the commit in its artifact name. Measurement failure is visible in the step/partial report but does not replace functional gates or block a verified build on a noisy timing threshold. CI's Linux/Chromium profile is separate from local Windows/Edge; reports from different profiles are not comparable.

Final local verification includes the full shared/source/browser/gameplay/scenario/board/smoke suites, corresponding built checks, default-CLI DOM route coverage, all 39 asset limits, full seeded Block Burst balance, verified offline updates and Windows Edge source/extracted-ZIP use under Arabic/space paths. Detailed local commands, logs, medians and spreads are retained in `.work/performance/phase6-brief.md`; the review handoff records their final status.

## Matched final timing result

Fresh original and final builds were each measured five times per route under the same readiness-v2 Windows/Edge profile above (15 rows/build; cold and HTTP-warm visits, eight-second activity). All 68 compared timing rows are within observed noise or inconsistent: **no supported timing gain, no supported timing regression**, no errors, recovery reloads or warnings. No additional unchanged control was needed, and no old control was reused. The retained performance claims are exact bytes and drawing-preparation work.

Values are milliseconds, median [p10–p90], original → final:

| Route/profile | Useful screen | Natural playable | Responsive input |
| --- | --- | --- | --- |
| portal cold | 1011.2 [988.0–3063.4] → 981.3 [965.5–3068.8] | — | 1049.2 [1029.0–3120.6] → 1018.1 [1001.7–3115.3] |
| portal warm | 733.8 [721.9–918.8] → 857.5 [759.0–983.3] | — | 774.6 [755.1–952.1] → 891.1 [794.8–1019.2] |
| hoop-heads cold | 179.1 [159.7–289.3] → 159.3 [146.8–431.0] | 2456.1 [2401.6–2624.2] → 2414.4 [2361.1–2745.0] | 2503.6 [2471.4–2662.9] → 2461.2 [2435.7–2798.2] |
| hoop-heads warm | 38.8 [30.6–56.1] → 54.8 [40.4–81.5] | 2245.1 [2237.0–2256.7] → 2248.6 [2231.4–2320.0] | 2312.2 [2294.6–2328.8] → 2303.8 [2282.4–2365.7] |
| splat-strike cold | 821.2 [724.1–855.4] → 772.7 [747.2–849.7] | 4091.5 [3960.4–4125.0] → 4016.7 [3987.8–4098.4] | 4113.2 [3980.8–4190.9] → 4047.9 [4039.8–4130.3] |
| splat-strike warm | 760.2 [726.1–811.7] → 757.3 [668.7–796.2] | 4019.7 [3978.2–4067.6] → 4015.7 [3912.9–4065.7] | 4061.6 [4010.2–4101.9] → 4059.2 [3953.7–4093.5] |

| Route | Active p95 interval, original → final |
| --- | --- |
| portal | 8.4 [8.4–8.4] → 8.4 [8.4–8.4] |
| hoop-heads | 33.4 [28.4–33.4] → 25.1 [25.1–33.4] |
| splat-strike | 25.1 [25.1–30.0] → 25.1 [25.0–25.1] |

The first cold portal useful-screen observation was about 4.4 seconds in each run; it remains in the distributions. The full raw JSON retains every sample, median/min/max/p10/p90/MAD and profile hash. No trimming, setting change or earlier-load credit was used. Local reports: `phase6-baseline.json`, `phase6-candidate.json`, `phase6-comparison.json` under ignored `.work/performance/`.

Final validation passed: 138 shared checks, 362 source and 362 built browser tests, all 31 games in both smoke runs, source/built scenario and board suites, strict 20-level/200-run-per-policy balance, 44 offline functional checks, 14 Windows source and 14 extracted-ZIP classroom cases, and all 39 asset limits. The sole initial shared-suite failure was an outdated worker-only FILES-equality assertion; the corrected test now verifies that only the embedded portal identity changes while inventory, non-portal hashes, canonical portal bytes and final served hashes remain correct. The affected shared suite then passed 138/138. No production or measurement-profile fix was needed after the final timing freeze.

## Historical guardrails and measurements

The sections below preserve earlier measurement baselines and experiments. Their
figures describe the commits, platforms and release states named in each section;
they are not current combined-release totals or additional cumulative speedups.
Use a fresh build and asset-budget report for the current checkout.

### Performance guardrails

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

The teachers' offline download, `school-games-offline.zip` (README, “Running it
without the internet”), is outside `FILES` too: children's PCs never fetch it and
it does not count toward the precache total. It has no limit of its own because
the precache limit already bounds it: it holds the precached files plus `sw.js`
and three license texts, and each file is deflated only when that makes it
smaller. When added it was 1,672,696 bytes for 47 files of 4,873,082 bytes.

## Initial baseline and headroom

The game, library, and font limits were calibrated from the minified build of
commit `4b07e0c` on 2026-10-05. Game limits use that size plus 12%, rounded up to
the next 1,000 bytes. The portal and offline limits were explicitly tightened
after the cleanup below, rather than automatically regenerated. At calibration the
portal had about 9% headroom and the other limits about 12–14%; later additions
used most of it (see “Headroom on 9 October 2026” below). Exact bytes can differ
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

## Sneaky Levels space world, 9 October 2026

Sneaky Levels gains a fifth world, عالم الفضاء, with six new levels (25–30): a
bridge that appears only when the player stands still, a shell game with three
doors, moon gravity where a full jump floats up into the ceiling spikes, spiky
blocks fired from the walls, a floor that grows spikes under a player who stops,
and a final level that mixes them. It also adds a space backdrop, an astronaut
character for all 90 stars, a moon-gravity label and sound, and a save fix so a
player who already won level 24 continues into level 25. Measured with the Linux
minified build:

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sneaky Levels | 103,608 | 109,997 | 35,277 | 37,135 | 111,000 |

The growth is mostly the six level maps and scripts, their Arabic messages and
hints, and their recorded solutions. Per frame the new levels cost what the old
ones do: the backdrop is baked once per level, and the scripted traps are a few
comparisons. The limit is the next 1,000 bytes plus one, as before. No request,
font, library or precached file is added; the offline cache grows from 4,849,792
to 4,856,181 of 5,000,000 bytes.

## Headroom on 9 October 2026

After the play statistics, the Sneaky Levels space world, the offline ZIP and the
other fixes of 8–9 October, all 39 measurements pass, but most limits are close.
20 of the 31 games, the portal, the teacher page and the offline cache have less
than 5% left (`npm run perf:assets` on main, Linux build):

| Measurement | Bytes | Limit | Left | Left % |
| --- | ---: | ---: | ---: | ---: |
| troll-level | 109,997 | 111,000 | 1,003 | 0.9% |
| teacher | 86,177 | 87,000 | 823 | 0.9% |
| paint-grab | 106,974 | 108,000 | 1,026 | 0.9% |
| candy-rope | 108,622 | 110,000 | 1,378 | 1.3% |
| portal | 354,681 | 360,000 | 5,319 | 1.5% |
| typing-test | 102,356 | 104,000 | 1,644 | 1.6% |
| skybound-golf | 79,703 | 81,000 | 1,297 | 1.6% |
| tank-splat | 109,092 | 111,000 | 1,908 | 1.7% |
| merge-2048 | 77,438 | 79,000 | 1,562 | 2.0% |
| maze-dash | 112,588 | 115,000 | 2,412 | 2.1% |
| snake-arena | 95,813 | 98,000 | 2,187 | 2.2% |
| connect-four | 51,728 | 53,000 | 1,272 | 2.4% |
| tic-tac-toe | 51,706 | 53,000 | 1,294 | 2.4% |
| offline-precache | 4,859,293 | 5,000,000 | 140,707 | 2.8% |
| block-burst | 113,446 | 117,000 | 3,554 | 3.0% |
| blob-battle | 102,716 | 106,000 | 3,284 | 3.1% |
| swing-hook | 108,467 | 112,000 | 3,533 | 3.2% |
| air-hockey | 112,314 | 116,000 | 3,686 | 3.2% |
| drift-king | 108,750 | 113,000 | 4,250 | 3.8% |
| fire-and-ice | 120,945 | 126,000 | 5,055 | 4.0% |
| road-hopper | 111,927 | 117,000 | 5,073 | 4.3% |
| tunnel-blitz | 97,320 | 102,000 | 4,680 | 4.6% |
| neon-slope | 123,902 | 130,000 | 6,098 | 4.7% |

A small change to one of these files may now need its limit raised (to the next
1,000 bytes plus one, as above). Do that knowingly: each raise makes the first load
on a slow school disk a little slower, and the offline cache has about 140 KB left
for the whole site, so a new game or font would need room made elsewhere first.
Earlier sections keep the sizes measured when each change landed.

## Rebuilt Skybound Golf, 9 October 2026

ضربة إلى الفضاء was rewritten from scratch with new art and game feel: a swing
gauge drawn around the golfer, rockets and timed super bounces in flight, five
worlds with parallax backdrops, boost rings, balloons, props and an altitude
goal. Everything is still drawn live on one canvas with no images and no cached
bitmaps. It loads the same files as before: `physics.js`, `art.js`, `game.js`
and `style.css`, plus the shared Kit and styles.

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Skybound Golf | 79,703 | 110,614 | 28,678 | 38,186 | 112,000 |

The new page sits in the middle of the other games (about 50 to 230 KB). Its
thumbnail is smaller (5,958 instead of 7,369 bytes), so the portal shrinks from
354,681 to 353,215 of 360,000 bytes. Measured against main after the headroom
review above, the offline cache grows by 29,584 bytes, from 4,859,293 to 4,888,877
of 5,000,000, which leaves 111,123 bytes (2.2%) for the whole site. In headless
software rendering at 1280 × 720 a frame's draw, including rasterization, takes
about 7.5 to 9 ms (median) during a flight.

## CI, review, and deployed performance

### Dino 3D addition — 13 October 2026

Measured on Windows with the same pinned build dependencies. The before column
is a fresh build of `ba0bee64b5f47bd999f49e71545cc0d27380d891`, not the older
9 October figures above. Local checkout line endings can make these totals
slightly different from the Linux CI build.

| Measurement | Before (bytes) | After (bytes) | Limit (bytes) |
| --- | ---: | ---: | ---: |
| Portal | 354,734 | 358,987 | 360,000 (unchanged) |
| Teacher | 86,313 | 87,098 | 88,000 (was 87,000) |
| Dino 3D built HTML | — | 50,277 | 55,000 (new) |
| Shared Three.js | 667,803 | 667,803 | 750,000 (unchanged) |
| Offline precache | 4,864,759 | 4,920,074 | 5,000,000 (unchanged) |

The new game reuses the existing Three.js and fonts. Original merged voxel
geometry, instanced scenery, pooled obstacles and synthesized sound add no
model, texture, music, or font downloads. The portal includes the thumbnail;
both the portal and teacher page include the new catalog entry. Only the
teacher allowance rises, by 1,000 bytes, because its catalog grows by 785 bytes.
All 40 asset measurements pass and offline headroom is 79,926 bytes.

A representative running scene uses 26–28 draw calls, roughly 14,100 triangles,
and no textures. A synthetic recycling check of 200 batches of eight alternating
cacti/birds settles at 26 geometries; the bird-heavy reduced-detail scene uses
51 draw calls. Pixel ratio is capped at 1.5 (1 in reduced-detail mode), particles
are bounded, and paused scenes redraw only when dirty. These resource counts
are not a school-PC frame-rate benchmark.

A local desktop-GPU run measured JavaScript heap after explicit garbage
collection at 5.31 MB after 30 seconds and 5.36 MB after 60 seconds, across 18
restarts through the game controls. This short observation is consistent with
the scene resources settling; it is not a classroom-hardware memory guarantee.

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

## Cake Guards, 20 October 2026

حرّاس الكعكة (tower defense) is the 33rd game. It draws on one 2D canvas, keeps each
level's ground, decorations and roads in one cached map bitmap (redrawn only for a new
level, a new pixel scale or a restored canvas) and the bitten cake in one small cached
bitmap, so a frame draws only what moves. Towers find their targets in one pass over
the blobs, and blobs remember which road segment they are on.

| Measurement | Bytes | Limit |
| --- | ---: | ---: |
| Cake Guards | 81,029 | 84,000 |
| Teacher page (one more catalog entry) | 88,038 | 89,000 (was 88,000) |
| Portal (thumbnail and catalog entry) | 345,149 | 360,000 |
| Offline precache, 45 files | 5,015,674 | 5,100,000 (was 5,000,000) |

The game is below the middle of the other games (about 50 to 230 KB), but the offline
cache had only 73,229 bytes left, so its limit was raised knowingly by 100,000 bytes
(2%). That keeps about the same headroom as before (84,326 bytes, 1.7%) for the next
change; another game will again need room made or a decision like this one.

## Mouse & Keyboard Academy, 25 October 2026

The grip lesson is five picture screens for children who are not reading yet. The drawn glove was replaced with illustrations for the non-reader grip lesson: five WebP pictures at 720×540 (a left-button mouse, a right-button mouse, the two bump keys, a slouch, and sitting up straight). The three hand pictures have no faces. The slide screen reuses the left-button picture. Each grip screen uses that picture's own sky color, and the picture edges fade about 6% so the rectangle blends into the stage. The page itself got smaller because the hand-drawn SVG markup came out.

| Measurement | Bytes | Limit |
| --- | ---: | ---: |
| Mouse & Keyboard Academy | 75,001 | 82,000 (was 77,000; before that 84,000, 81,000, and originally 56,000) |
| Offline precache, 51 files | 5,203,540 | 5,210,000 (was 5,135,000; before that 5,130,000 and 5,100,000) |
| Five grip illustrations | 95,930 | — |

The pictures add 95,930 bytes. The minified page is 75,001 bytes, down from 79,930 when the pictures were still drawn in SVG, so it still fits the 82,000 page limit with 6,999 bytes left. The precache grew from 5,112,539 to 5,203,540, which is why its limit moved up by 75,000 bytes. 6,460 bytes remain under the precache limit. The build copies each game's WebP and AVIF files into the offline cache.


The academy was retired in milestone 1 (see below); two of its pictures moved to Bubble Bop.

## Re-platform milestone 1, 27 October 2026

Milestone 1 ([`ARCHITECTURE.md`](ARCHITECTURE.md)) changes the bytes of every page:

* **Kit v2** (`Kit.profile`, `Kit.track`, `Kit.dda`, the `sg:telemetry` message) adds
  2,682 minified bytes to `shared/kit.js` (14,501 → 17,183 with the build's esbuild
  options), which every game page inlines.
* **Zero background music** deletes the music engines of 14 games. Beat Dash, Moto
  Madness, Neon Slope, Rail Rush, Splat Strike, Swing Hook and Tunnel Blitz are smaller
  than before even with Kit v2; Critter Mart grew by only 1,169 bytes.
* **Bubble Bop** replaces Mouse & Keyboard Academy: a 113,629-byte page plus two of the
  academy's WebP pictures (40,920 bytes) instead of a 75,001-byte page and five pictures
  (95,930 bytes).
* **Road Hopper and Dino 3D** carry the first Kit.dda tier tables (Road Hopper also moves
  its lane generator into `endless.js`).
* **The portal** gains `shared/juice.js` (4,467 minified bytes), picture profiles with
  age bands and XP (`js/profiles.js` and its styles) and the telemetry sink
  (`js/telemetry.js`, 7,956 minified bytes, inert unless the build sets
  `SG_TELEMETRY_URL`).

| Measurement | Before bytes | After bytes | Before limit | New limit |
| --- | ---: | ---: | ---: | ---: |
| Portal | 350,663 | 392,040 | 360,000 | 394,000 |
| Teacher page | 91,926 | 90,422 | 96,000 | 96,000 |
| Offline precache | 5,203,540 | 5,276,735 | 5,210,000 | 5,290,000 |

Every game page whose limit moves is listed below. Pages that grew past their limit,
or kept less than 1,000 bytes, get the next 1,000 bytes plus one, as before. The 14
music-free games get the same rule applied to their new, smaller size, so the bytes
the music removal saved cannot quietly come back.

| Game | Before bytes | After bytes | Before limit | New limit |
| --- | ---: | ---: | ---: | ---: |
| air-hockey | 112,346 | 115,028 | 116,000 | 117,000 |
| beat-dash | 118,368 | 112,819 | 125,000 | 114,000 |
| blob-battle | 102,758 | 105,440 | 106,000 | 107,000 |
| block-burst | 113,519 | 114,019 | 117,000 | 116,000 |
| block-world | 155,642 | 157,903 | 164,000 | 159,000 |
| bubble-bop | — | 113,629 | — | 115,000 |
| cake-guards | 81,184 | 83,866 | 84,000 | 85,000 |
| candy-rope | 108,648 | 111,330 | 110,000 | 113,000 |
| connect-four | 51,974 | 54,656 | 53,000 | 56,000 |
| critter-mart | 160,158 | 161,327 | 172,000 | 163,000 |
| dino-3d | 53,957 | 58,377 | 55,000 | 60,000 |
| drift-king | 108,726 | 108,799 | 113,000 | 110,000 |
| fire-and-ice | 121,154 | 122,680 | 126,000 | 124,000 |
| maze-dash | 113,005 | 115,687 | 115,000 | 117,000 |
| merge-2048 | 77,701 | 80,383 | 79,000 | 82,000 |
| moto-madness | 132,201 | 132,009 | 140,000 | 134,000 |
| neon-slope | 123,876 | 122,006 | 130,000 | 124,000 |
| paint-grab | 107,180 | 109,862 | 108,000 | 111,000 |
| rail-rush | 142,960 | 141,993 | 152,000 | 143,000 |
| road-hopper | 111,802 | 116,398 | 117,000 | 118,000 |
| skybound-golf | 111,014 | 113,696 | 112,000 | 115,000 |
| snake-arena | 95,813 | 98,495 | 98,000 | 100,000 |
| splat-strike | 231,318 | 230,659 | 251,000 | 232,000 |
| sumo-bonk | 120,773 | 121,318 | 127,000 | 123,000 |
| swing-hook | 108,146 | 107,770 | 112,000 | 109,000 |
| tank-splat | 109,286 | 111,968 | 111,000 | 113,000 |
| tic-tac-toe | 51,952 | 54,634 | 53,000 | 56,000 |
| troll-level | 110,163 | 110,858 | 111,000 | 112,000 |
| tunnel-blitz | 97,382 | 95,320 | 102,000 | 97,000 |
| typing-test | 102,644 | 105,326 | 104,000 | 107,000 |

The portal grows by 41,377 bytes (11.8%). Most of it is the profile picker and its
styles; the juice engine and the sink are about 12 KB together. It is still one file.
Thumbnails remain the largest part of the portal (about 256 KB). The offline cache
grows by 73,195 bytes (1.4%). No request, font, library or third-party code is added
to any child's page, and with `SG_TELEMETRY_URL` unset the built site makes no network
request at all.

## Research telemetry, Kit and profiles (milestone 2.5), 27 October 2026

The first client step of milestone 2.5 (`docs/RESEARCH_TELEMETRY_SPEC.md`, steps C1
and C2) changes three files. Measured with the Linux minified build:

* **Kit** gains the round counters `rx` (wall time, inputs, idle lapses, pauses, the
  reaction-time sum and count, and the DDA level) and keeps the DDA level of 24 players
  instead of 16: +195 minified bytes per game page, under the 350 the spec allows. It adds
  no timer and no message; per input it adds one comparison and an increment.
* **The portal** grows by 868 bytes, to 392,908 of 394,000: 24 profiles per PC split over
  two storage keys so that an old portal tab cannot drop profiles 13 to 24
  (`js/profiles.js`, +396 minified bytes), and in `js/site.js` the 20-minute idle
  hand-over and the calls for the new telemetry hooks (+472). The limit is unchanged.
* The offline cache grows from 5,276,735 to 5,284,233 of 5,290,000 bytes (unchanged).

Seven game pages kept less than 1,000 bytes, so their limits rise to the measured size
rounded up to the next 1,000 bytes plus 1,000, as before:

| Game | Before bytes | After bytes | Before limit | New limit |
| --- | ---: | ---: | ---: | ---: |
| beat-dash | 112,819 | 113,014 | 114,000 | 115,000 |
| block-world | 157,903 | 158,098 | 159,000 | 160,000 |
| cake-guards | 83,866 | 84,061 | 85,000 | 86,000 |
| paint-grab | 109,862 | 110,057 | 111,000 | 112,000 |
| rail-rush | 141,993 | 142,188 | 143,000 | 144,000 |
| tank-splat | 111,968 | 112,163 | 113,000 | 114,000 |
| troll-level | 110,858 | 111,053 | 112,000 | 113,000 |

The other 27 games grow by the same 195 bytes inside their unchanged limits (drift-king
is now closest, with 1,006 bytes left). No request, font, library or precached file is
added. The rest of the client step (the v3 sink in `js/telemetry.js` and the teacher
page's codes panel) is measured below.

## Research telemetry, the v3 sink and the teacher page's codes (milestone 2.5), 28 October 2026

The second client step of milestone 2.5 (steps C3 and C4) changes no game page and no
shared script; Kit is as above. Measured with the Linux minified build:

* **The portal** grows by 2,626 bytes, from 392,908 to 395,534: `js/telemetry.js` sends
  wire version 3 (+2,623 minified bytes): the random codes in `sg:site:rid`, the pending
  links, `w` at each send, the visit and round numbers, Kit's round counters, tutorials,
  `gp`, hearts, the classroom timer, the session-end reason and `X-Batch-Every`. The spec
  expected about +2.0 KB for the sink. Its new storage reads are small and rare: a session
  start reads `sg:site:classroom` and reads (and, when a code is made or changes, writes)
  `sg:site:rid`; a game open reads `sg:site:favs`; and each `sg:stats` message of the open
  game now reads the teacher's settings, as each `sg:telemetry` message already did.
* **The teacher page** grows by 6,215 bytes, from 90,422 to 96,637: the dashboard codes
  panel with its Luhn mod 16 check character, its own copies of the portal's 12 animals
  and 8 ring colours, the parsing of `sg:site:rid` and both profile keys, "the same child
  as on another PC" with its five refusals, and the new copy (about +5.0 KB of minified
  script, most of it Arabic text at two bytes a character, and about +1.2 KB of markup and
  styles). The spec estimated at most 1.8 KB; the copy was shortened once, and going
  further would drop the explanations a teacher needs to type a code from another PC.
* The offline cache grows by 8,841 bytes, from 5,284,233 to 5,293,074 (the portal and
  the teacher page, each cached once, and the worker's list).

All three limits follow the rule above: the measured size rounded up to the next 1,000
bytes plus 1,000.

| Measurement | Before bytes | After bytes | Before limit | New limit |
| --- | ---: | ---: | ---: | ---: |
| Portal | 392,908 | 395,534 | 394,000 | 397,000 |
| Teacher page | 90,422 | 96,637 | 96,000 | 98,000 |
| Offline precache | 5,284,233 | 5,293,074 | 5,290,000 | 5,295,000 |

No game limit changes (drift-king keeps 1,006 bytes and swing-hook 1,035). No request,
font, library or third-party code is added to any child's page; with `SG_TELEMETRY_URL`
unset the built site still makes no network request at all.

## Milestone 2.5 review fixes on the client, 28 October 2026

The review of the integrated milestone 2.5 client changed the telemetry sink, the teacher
page's transfer and Kit. Measured with the Linux minified build, against the integrated
head before the fixes:

* **The portal** grows by 668 bytes, from 395,534 to 396,202 (`js/telemetry.js`): +322 for
  the wire-v3 queue under its own key, `sg:site:tm:q3:<hash>`, with the older build's
  batches moved over from `sg:site:tm:q:<hash>` (a pre-v3 tab still open on the PC
  rewrites that key with v2 entries only); +346 for the transfer's given codes (`g`), no
  `pr` for a given code, and the older code kept in `l` until a batch naming it is
  delivered. The added work is one more `getItem` of a key that is normally absent at each
  queue read, and one `sg:site:rid` write when a batch holding a `cd` is delivered.
* **The teacher page** grows by 35 bytes, to 96,672 of 98,000 (the transfer notes the
  code it gives and never links a given one).
* **Kit** grows by 17 minified bytes per game page: a pause counts only while play runs
  (+7), and a round's wall time comes from the same clock reading as its engaged time
  (+10). The DDA store keeps 28 players, a full PC's 24 profiles and the guests of each
  band, for no bytes.
* The offline cache grows by 1,281 bytes, from 5,293,074 to 5,294,355.

The portal, the offline cache and drift-king kept less than 1,000 bytes, so their limits
follow the rule above: the measured size rounded up to the next 1,000 bytes plus 1,000.

| Measurement | Before bytes | After bytes | Before limit | New limit |
| --- | ---: | ---: | ---: | ---: |
| Portal | 395,534 | 396,202 | 397,000 | 398,000 |
| drift-king | 108,994 | 109,011 | 110,000 | 111,000 |
| Offline precache | 5,293,074 | 5,294,355 | 5,295,000 | 5,296,000 |

No other limit changes (swing-hook keeps 1,018 bytes, the teacher page 1,328). No
request, font, library or third-party code is added to any child's page.

### Combining research telemetry with the runtime-warning fix

Merging main's "Keep a ready game up after a stray runtime error" (#70) into research
telemetry adds both Kit changes to every game page. Each change fit its own limits;
together they leave ten game pages under 1,000 bytes of headroom and put the offline
cache 10,831 bytes over its limit (5,306,831 of 5,296,000). Those limits follow the rule
above: the measured size rounded up to the next 1,000 bytes plus 1,000.

| Measurement | Bytes | Before limit | New limit |
| --- | ---: | ---: | ---: |
| blob-battle | 106,012 | 107,000 | 108,000 |
| bubble-bop | 114,201 | 115,000 | 116,000 |
| connect-four | 55,228 | 56,000 | 57,000 |
| fire-and-ice | 123,252 | 124,000 | 125,000 |
| maze-dash | 116,259 | 117,000 | 118,000 |
| skybound-golf | 114,268 | 115,000 | 116,000 |
| snake-arena | 99,067 | 100,000 | 101,000 |
| splat-strike | 231,231 | 232,000 | 233,000 |
| swing-hook | 108,342 | 109,000 | 110,000 |
| tic-tac-toe | 55,206 | 56,000 | 57,000 |
| Offline precache | 5,306,831 | 5,296,000 | 5,308,000 |

No other limit changes, and nothing is added to any page beyond the two Kit changes.

## Sneaky Levels worlds 6–12, 31 October 2026

المراحل الماكرة gains worlds 6–12 (levels 31–100): ice, keys, boxes, portals, music
blocks, ghosts, and the Sneaky King. Each world is its own script, inlined into the
one game file like the rest of the game. Nothing new is fetched at runtime, and a
frame still draws the baked backdrop plus the traps that move. The game still plays
no background music. Measured with the Linux minified build, against current main
(111,430 bytes, gzip 38,236):

| File | Before bytes | After bytes | Before gzip | After gzip | New limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sneaky Levels | 111,430 | 254,052 | 38,236 | 86,271 | 254,500 (was 113,000) |
| Offline precache, 48 files | 5,307,062 | 5,449,684 |  |  | 5,450,000 (was 5,308,000) |

The game file grew by 142,622 bytes. 139,699 of that is the seven minified world
scripts (levels, Arabic hints, recorded solutions, and each world's mechanic).
The rest, 2,923 bytes, is the shared plug-in hooks and the scrolling 100-level
select.

The same 142,622 bytes are the whole precache growth: the built game file is the
only cached file that changed. No other budget changed.

Both new limits are the measured size rounded up, Sneaky Levels to the next 500
bytes and the precache to the next 1,000. That leaves 448 bytes (0.18%) and 316
bytes (0.006%). A small text edit can exceed either limit.

## Castle Crash, 31 October 2026

تحطيم القلعة (Castle Crash) is a fixed 1280×720 slingshot destruction game: a
compact rigid-body solver, three worlds of forts, and a same-keyboard fort duel.
Art is procedural canvas. Sounds are one-shot `Kit.juice` cues. The page plays
no background music. Measured with the Linux minified build:

| Measurement | After bytes | Previous limit | New limit |
| --- | ---: | ---: | ---: |
| Castle Crash | 85,520 | — | 88,000 |
| Portal (thumbnail and catalog entry) | 399,510 | 398,000 | 402,000 |
| Teacher page | 97,744 | 98,000 | 98,000 |
| Offline precache, 49 files | 5,539,117 | 5,450,000 | 5,550,000 |

The game file is 85,520 bytes, 2,480 under its 88,000 limit. The portal limit
moves from 398,000 to 402,000 (2,490 bytes of headroom). The teacher page stays
inside 98,000. The offline cache limit moves from 5,450,000 to 5,550,000
(10,883 bytes of headroom). A headless playtest during a shot measured about
60 fps.

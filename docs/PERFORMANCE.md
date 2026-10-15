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

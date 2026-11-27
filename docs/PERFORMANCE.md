# Performance architecture, budgets, and measurement

This document tracks the fast-build packaging architecture, the raw-byte budgets enforced by `npm run perf:assets`, and how to reproduce matched timing measurements on school hardware or local browsers. No classroom FPS or physical hard-disk speedup is claimed without native-hardware measurements.

## Current 58-game baseline (November 2026)

Measured from `npm run build` with the production statistics endpoint (`SG_TELEMETRY_URL`):

| Measurement | Observed bytes | Limit bytes | Notes |
| --- | ---: | ---: | --- |
| Portal (`index.html`) | 508,607 | 514,000 | Single file with inlined CSS, JS, catalog (58 games, no dead `tags`), and 58 optimized SVG thumbnails; `shared/juice.js` kept external |
| `lib/three/three.min.js` | 667,803 | 750,000 | External r159 UMD bundle, cached once for all 18 3D games |
| `shared/artkit.js` | 12,171 | 13,000 | External `?v=<hash>` 2D art kit, cached once (8 games) |
| `shared/juice.js` | 4,433 | 4,600 | External `?v=<hash>` procedural SFX engine, cached once (portal + 34 games) |
| `shared/webgl.js` | 6,591 | 7,500 | External `?v=<hash>` school-PC WebGL guardrails, cached once (18 3D games) |
| Baloo Bhaijaan 2 Arabic 500 | 22,324 | 25,000 | Local WOFF2 subset |
| Baloo Bhaijaan 2 Arabic 700 | 22,276 | 25,000 | Local WOFF2 subset |
| Fredoka Latin 500 | 16,248 | 18,500 | Local WOFF2 subset |
| Fredoka Latin 700 | 15,900 | 18,000 | Local WOFF2 subset |
| 58 built games (`games/<slug>/index.html`) | 72,002 – 245,008 | per-game | One file per game (game CSS/JS + `kit.js` + `game.css` minified & inlined) |
| Offline precache (`sw.js` `FILES`, 74 files) | 8,003,514 | 8,120,000 | Full offline install footprint (uncompressed on-disk bytes) |
| Offline ZIP (`school-games-offline.zip`, 79 files) | 2,817,718 | — | Outside `FILES` (never precached); packs precached files + `sw.js` + `version.json` + 3 licenses |

Exact byte counts can vary by a few hundred bytes between Windows (CRLF) and Linux (LF) checkouts. Budgets carry deliberate review headroom and are never updated automatically.

## Packaging and retained optimizations

- **Single-file portal and games:** `tools/build.mjs` minifies and inlines each game's own CSS/JS along with `shared/kit.js` and `shared/game.css` so slow school hard disks issue one HTML read per game.
- **External cached shared libraries:** `lib/three/three.min.js`, `shared/artkit.js`, `shared/juice.js`, and `shared/webgl.js` stay external (with `?v=<8-hex>` content hashes on the three `shared/` libraries) so they are downloaded and cached once instead of duplicated across dozens of HTML files. Externalizing `shared/juice.js` alone saved ~140 KB across the offline cache (portal + 34 games).
- **SVG thumbnail compaction:** `tools/lib/svg-data-uri.mjs` compacts markup whitespace and uses minimal UTF-8 percent-encoding while preserving exact RGBA pixels (`tools/tests/asset-optimization.test.mjs`). Source thumbnails remain editable SVGs and are omitted as separate files in `_site`.
- **Clean catalog and dead-code pruning:** `js/catalog.js` keeps clean English titles in `en` (used by the play-statistics dashboard) without search-era `tags` or SEO suffixes (-6.2 KB off the portal). Unused portal helpers/CSS, dead `Kit.sfx` presets, and unused `Kit.art` exports (`three`, `texture`, `ease`, `tween`, `ramp`) were removed while keeping all privacy/DDA migration guards intact.
- **Adaptive light graphics (`shared/gfx.js`):** Rail Rush, Neon Slope, Road Hopper, and Moto Madness automatically switch to light graphics (0.75× DPR, no antialiasing on next start, reduced scene extras) after two consecutive 2-second windows where >15% of engaged round frames exceed 20 ms, remembering the setting in `sg:site:gfx-light` with an inline button to restore full graphics.
- **School-PC WebGL guardrails (`shared/webgl.js`):** Shared software-renderer detection (`SwiftShader`, `llvmpipe`, `Microsoft Basic Render Driver`, `WARP`, `Mesa`), DPR clamping, WebGL2 `fenceSync` menu pacing (with `gl.finish()` fallback), `webglcontextlost`/`webglcontextrestored` handling, `#nogl` Arabic fallback, and deferred 3D boot (`rAF` + `setTimeout(0)` with fallback timer).
- **Paused-scene idle and verified offline updates:** Heavy games stop redrawing once paused effects settle. The service worker verifies SHA-256 hashes on write, performs quick label checks on routine visits so slow disks are not re-read, bypasses stale school proxies via `version.json` + `sw.js?v=<hash>`, and never reloads an active game mid-round (offering an explicit «نسخة جديدة» button between rounds).
- **Reverted experiments:** Deferred startup for Splat Strike was reverted after counterbalanced measurements showed no timing gain beyond noise. Externalizing thumbnails and `shared/kit.js` remains rejected for the default single-file build because it multiplies cold file reads on slow HDDs.

## Asset budget guardrails (`npm run perf:assets`)

Run `npm run build`, then `npm run perf:assets`. The budget checker (`tools/asset-budgets.mjs`) measures the built files in `_site` without modifying them:

```sh
npm run perf:assets -- --report artifacts/asset-budgets.json
```

Options: `--root <directory>`, `--config <file>`, `--report <file>`. All limits in `tools/asset-budgets.json` are **uncompressed on-disk bytes**:

- **Portal (`portalBytes`):** built `index.html`.
- **Games (`gameHtmlBytes`):** every catalog slug (including hidden entries) must have an explicit limit; missing games or obsolete limits fail.
- **Shared libraries (`threeBytes`, `artBytes`, `juiceBytes`, `webglBytes`):** counted once each and required in `sw.js` `FILES`.
- **Fonts (`fontBytes`):** every shipped WOFF/WOFF2/TTF/OTF/EOT file has an explicit limit (license files are excluded).
- **Offline precache (`precacheBytes`):** sum of every unique file listed in `sw.js`'s `FILES` JSON declaration (parsed statically as JSON without executing the service worker; symlinks and path traversals fail). This is the total offline cache footprint, **not** an initial page load.

## Reproducing matched timing measurements

Install locked dev dependencies (`npm ci`) and Chromium (`npm run browsers:install`), or set `PLAYWRIGHT_CHANNEL=msedge`. Freeze a baseline build and measure both baseline and candidate with the **same current harness**:

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

For real hardware measurements on the school's weakest Windows PC, drop software-renderer overrides and run headed (keeping window focus, since games pause on blur):

```sh
npm run perf -- --native-gpu --headed --seconds 30 rail-rush splat-strike --json report.json
```

Never compare reports across different OS/browser/renderer profiles (for example, Linux CI SwiftShader vs local Windows Edge).

### Meaning of each timing metric

- `loadMs` / `dclMs`: navigation and parser milestones; neither proves readiness.
- `firstUsefulMs`: local fonts loaded and visible title/catalog content painted over two animation frames (including decoded viewport thumbnails at opacity 1 on the portal).
- `readyForStartMs`: useful screen plus initialized game state and enabled primary start control.
- `playableMs`: normal Start click, natural intro/countdown, and two consecutive active-state frames.
- `inputResponsiveMs`: real scenario input observed changing game state.
- `scriptToInputMs`: cumulative CDP script duration sampled after input assertion.
- Active intervals: frame intervals during repeated real input after responsiveness (idle/countdown/recovery gaps excluded).

### Interpretation and CI

`tools/perf-compare.mjs` requires at least 5 equivalent samples, matching profiles, zero failed rows, and no SW/DPR contamination. A timing claim must exceed both runs' p10–p90 spread and a 1 ms floor with the same direction in ≥80% of repetition pairs.

CI enforces deterministic asset budgets (`npm run perf:assets`) as a required gate and runs `npm run perf` in a separate **informational** parallel job (`continue-on-error: true`, not gating deployment) uploading `runtime-performance.json`.

## Condensed milestone history

| Date | Milestone | Portal (raw B) | Precache (raw B / files) | Key change |
| --- | --- | ---: | ---: | --- |
| Oct 2026 | Initial 31-game baseline & portal cleanup | 329,101 | 4,446,236 (42) | Fixed grid, SVG URI compaction, paused-scene idle, offline ZIP |
| Nov 2026 | 52-game expansion & 13-game Three.js rebuild | 480,969 | 7,511,668 (66) | Merged vertex-colored 3D geometry, `InstancedMesh` pooling, `artkit.js` externalized |
| 26 Nov 2026 | Zooom +1 (53 games) & `Kit.gfx` light graphics | 485,836 | 7,611,859 (67) | Adaptive 0.75× light mode for 4 heavy runners/racers |
| 27 Nov 2026 | 5 new 2D arcade games (58 games) | 519,163 | 8,207,856 (72) | Added `sandwich-tower`, `bonk-garden`, `cloud-hop`, `ball-storm`, `frog-pinball` |
| 27 Nov 2026 | Portal/shared/3D cleanup & `juice.js`/`webgl.js` externalized | 508,607 | 8,003,514 (74) | Removed `catalog.js` `tags`/SEO `en`, pruned dead portal/Kit/artkit code, externalized `juice.js` & new `webgl.js`, refactored 18 3D games onto `Kit.webgl` (-10.6 KB portal, -204.3 KB precache) |

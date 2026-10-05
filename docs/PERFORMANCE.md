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
Files outside `FILES` (such as licenses, the worker itself, build metadata, and
separate thumbnail copies already inlined into the portal) are not included in
the precache total. This guard checks size and coverage; the offline tests still
verify worker behavior and content integrity.

## Initial baseline and headroom

The initial limits were calibrated from the minified build of commit `4b07e0c`
on 2026-10-05. Game limits are the observed size plus 12%, rounded up to the next
1,000 bytes. The other limits use round values with about 12–14% headroom:

| Measurement | Observed bytes | Limit bytes |
| --- | ---: | ---: |
| Portal | 367,646 | 415,000 |
| three.js | 667,803 | 750,000 |
| Baloo Arabic 500 | 22,324 | 25,000 |
| Baloo Arabic 700 | 22,276 | 25,000 |
| Fredoka Latin 500 | 16,248 | 18,500 |
| Fredoka Latin 700 | 15,900 | 18,000 |
| Offline precache, 42 files | 4,483,644 | 5,100,000 |

There are 31 independently budgeted games. These limits give small features room
while catching large unreviewed growth. They are not updated automatically and
do not claim that every smaller increase is harmless.

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

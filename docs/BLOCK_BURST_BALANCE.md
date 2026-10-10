# Block Burst balance verification

The verifier uses two policies: a search bot (`smart`) and a deliberately noisy
policy (`kid`). These are simulations, not measured student success rates.
Required win rates remain 97% and 70%, respectively. Classroom playtesting is still
needed to assess learning, enjoyment and difficulty for the intended ages.

## Reproducible runs

Game randomness and policy randomness now use independent seeded generators.
Search clones copy generator state without consuming the live game's future deals.
The original Mulberry32 output sequence is unchanged. Thresholds use exact rates,
not rounded percentages.

```sh
# All levels, 200 attempts per policy; balance thresholds fail by default.
node games/block-burst/verify-levels.js 200

# JSON includes failed seeds, failure reasons, score shortfalls and missing gems.
ONLY=20 node games/block-burst/verify-levels.js 200 --report-balance --json

# Replay one failed game/policy seed exactly.
ONLY=20 node games/block-burst/verify-levels.js 1 --bot=kid --seed=19007 --report-balance --json
```

The default first seed for level N is `7 + (N - 1) * 1000`, then 13 is added for
each attempt. A separate holdout used the same sequence offset by 100,000.
Each reported sample below contains 200 attempts per policy and level. Baselines
use the corrected verifier with the original level data, making before/after
comparisons use the same game and policy seeds.

## Changes and measured results

All boards, gem/score goals, piece difficulty and three/two-star targets are
unchanged. Extra bombs address space failures; extra moves address failures with
a final gem still outstanding. The existing power-up display shows the available
bomb count. Saved games preserve spent inventory rather than granting supplies
again. Classic mode and unspecified levels still start with one bomb.

| Level | Change | Smart before → after | Noisy before → after | Noisy holdout after |
| --- | --- | --- | --- | --- |
| 11 | Move limit 22 → 26 | 97% → 98.5% | 83% → 85.5% | 83.5% |
| 12 | Starting bombs 1 → 2 | 100% → 100% | 78.5% → 87.5% | 85% |
| 13 | Move limit 30 → 42 | 96% → 100% | 84% → 94% | 89.5% |
| 14 | Move limit 34 → 40 | 95.5% → 99.5% | 91.5% → 95.5% | 96% |
| 15 | Starting bombs 1 → 2 | 100% → 100% | 64.5% → 80% | 83.5% |
| 16 | Starting bombs 1 → 2; move limit 54 → 64 | 96% → 98% | 59% → 79.5% | 76% |
| 17 | Starting bombs 1 → 2 | 100% → 100% | 64% → 77% | 78% |
| 20 | Starting bombs 1 → 3 | 100% → 100% | 45% → 74% | 81.5% |

The 20-level run verified the other 12 levels above both thresholds. It exposed
move-limit warnings in levels 13 and 14; targeted runs with their final budgets
then cleared those warnings. Independent smart-policy holdouts on all changed
move limits produced 99% (L11), 97% (L13), 98.5% (L14) and 98.5% (L16).

Rates near a threshold can differ across seed samples. Failure reports and replay
commands are retained so future tuning can investigate specific bottlenecks
without weakening the gates or treating these policies as real children.

## Regression coverage

CI runs the full `node games/block-burst/verify-levels.js` (about 4 minutes)
whenever a pull request or push changes `games/block-burst/` or the build
workflow; other changes run only the quick level-1 check in
`tools/tests/level-verifiers.test.mjs`.

`tools/tests/balance-replay.test.mjs` verifies seeded sequence compatibility,
independent search branches, deterministic policies, replayable failed seeds and
saved rescue inventory. It also covers Air Hockey's stationary fire-power launch,
velocity direction/cap and paused clock.

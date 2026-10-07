# Wacky Soccer difficulty balance

These numbers come from simulated players, not from children. They show whether
the rules reward the behaviour we want. Classroom playtesting is still needed to
judge how difficult and how fun the levels feel for 10–11 year olds.

## What sets the difficulty

- `WS.DIFFS` and `WS.CUPS` in `data.js` give each CPU a skill from 0 to 1. Skill
  sets how fast the CPU reacts, how often it runs its lookahead, how picky it is
  and how many mistakes it makes (`ai.js`).
- `WS.cpuPower(skill)` in `data.js` sets the CPU's kick power to
  0.6 + 0.4 × skill (Easy 0.68, Normal 0.82, Hard 0.94). `kickoff()` in `game.js`
  and `balance-sim.js` both use it.
- The CPU hears every press of the other team (`CPU.notePress`) and adapts:
  - **Standing still.** Once the ball has been low and right in front of the
    other team for 2 s in total without a press, the CPU plays at skill 0.85
    until they press again. A player who never presses can no longer win on
    rebounds and CPU own goals.
  - **Button-mashing.** If the other team's average time between presses is
    under 0.6 s and they pressed in the last second, a CPU with skill above 0.4
    plays 0.3 sharper, up to 0.95. Easy and the first two bronze rounds let
    mashers win.
- In `physics.js`, a press opens a 0.2 s kick window. During it, a touch with
  either leg or foot kicks the ball forward. Head and body only bounce it.

## Measuring

```sh
# 60 matches per cell, first to 5, the three quick-match levels
node games/wacky-soccer/balance-sim.js --n 60 --seed 9000 --pol idle,mash,kid,timed,smart
# the four bronze-cup rounds (first to 3)
node games/wacky-soccer/balance-sim.js --n 60 --seed 9000 --cup bronze --pol mash,kid,timed
```

Match *i* of a cell always uses the same seed, so policies and code versions
play paired matches. One match changes the whole run, so cells still differ by
about ±6 points at N = 60. Compare at N ≥ 60, and check a second seed before
trusting a difference under 10 points. `--from`/`--n` run a slice of a cell, so
cells can run in parallel. `--json` prints totals.

Simulated players:

- **idle** never presses.
- **mash** presses every 0.25–0.6 s.
- **kid** presses when the ball is about to reach a foot. It is slow, misses 30%
  of chances and rests 0.45 s between presses.
- **timed** is a faster, more accurate kid.
- **smart** is timed, plus a hop toward a ball a few steps away (like the CPU's
  own approach rule). It is the closest to a careful real player.

None of these players jumps to block a shot.

## Targets (from the audit) and results

Targets:

- Easy: a player who never presses wins 30% or less.
- Normal: a masher wins 40–60%.
- Hard: a masher wins 15–30%.
- Normal and Hard: mashing beats pressing at the right moment by 10 points or less.

Win rate of the simulated human, before this pass (commit 6c13f92) → after.
These are 120 matches per cell: seeds 9000 and 5000, 60 matches each.

| Level | idle | mash | kid | timed | smart | mash − kid | mash − timed |
|---|---:|---:|---:|---:|---:|---:|---:|
| Easy (0.2) | 49% → 15% | 80% → 76% | 63% → 77% | 71% → 81% | 84% → 85% | 17 → -1 | 9 → -5 |
| Normal (0.55) | 19% → 5% | 73% → 44% | 42% → 43% | 47% → 43% | 68% → 78% | 31 → 1 | 26 → 1 |
| Hard (0.85) | 2% → 6% | 32% → 19% | 5% → 11% | 13% → 13% | 19% → 38% | 27 → 8 | 19 → 6 |

| Bronze round (skill) | idle | mash | kid | timed | smart |
|---|---:|---:|---:|---:|---:|
| 1 (0.15 → 0.1) | 59% → 24% | 73% → 78% | 68% → 73% | 67% → 66% | 78% → 83% |
| 2 (0.3 → 0.25) | 47% → 23% | 68% → 73% | 59% → 62% | 54% → 71% | 76% → 83% |
| 3 (0.45 → 0.42) | 36% → 16% | 66% → 63% | 51% → 52% | 49% → 63% | 73% → 77% |
| 4 (0.58 → 0.58) | 19% → 12% | 72% → 39% | 41% → 47% | 51% → 51% | 60% → 69% |

Each seed on its own (before → after):

| Seed | Level | idle | mash | kid | timed | smart |
|---|---|---:|---:|---:|---:|---:|
| 9000 | Easy | 50% → 15% | 80% → 85% | 62% → 75% | 70% → 90% | 83% → 82% |
| 9000 | Normal | 22% → 7% | 73% → 47% | 48% → 38% | 45% → 43% | 70% → 82% |
| 9000 | Hard | 3% → 8% | 33% → 22% | 2% → 10% | 10% → 17% | 20% → 42% |
| 5000 | Easy | 48% → 15% | 80% → 67% | 63% → 78% | 72% → 72% | 85% → 88% |
| 5000 | Normal | 17% → 3% | 73% → 42% | 35% → 47% | 48% → 42% | 67% → 75% |
| 5000 | Hard | 0% → 3% | 30% → 17% | 8% → 12% | 17% → 10% | 18% → 33% |

In the real page, a player who never presses won 3 of 20 Easy matches after this
pass. The review measured 10 of 20 before. Both runs used `__game.step` and were
not seeded.

## Why the old balance failed

- **Idle wins came from rebounds and own goals, not from CPU mistakes.** In 12
  seeded idle-versus-Easy matches, 76 of 88 goals came off a body or head
  touch, not a kick. Removing the Easy CPU's daydreams and missed chances alone
  left idle at 54–63% (N = 24). Letting the CPU play at high skill against a
  team that stands still dropped it to 4–15%.
- **Mashing turned the whole body into a kicker.** Any touch during the kick
  window counted as a kick, and a masher's window is open about half of the
  time.
- **The Hard CPU out-shot players who wait.** Its lookahead assumes the other
  team does not press. Against a player who waits for the ball, that is right.
  In 16 seeded Hard matches (with the leg-and-foot kick window), the CPU scored
  2.1 direct-kick goals per match against the timed bot but 0.8 against the
  masher, whose random hops block shots.

## Tried and rejected

These used the same seeds, with N = 60, and were tested on top of the
standing-still rule.

- **The lookahead assumes the other team presses** (the review's suggestion a).
  Tried as one press at the midpoint of the "wait" branch, at a random moment in
  the "wait" branch, and at the midpoint of both branches. None helped
  consistently: Hard mash stayed 27–38%, kid 5–12% and timed 12–17%, and the
  Normal gaps were 15–35.
- **"Tired legs"** (a press within 0.5 s of the last one jumps at 55%). Mashing
  got stronger: 95% / 83% / 40%.
- **"Fresh kick"** (a press within 0.5 s of the last one kicks at 70%). Timing
  players gained nothing.
- **Kick window for the kick leg and foot only.** Worse for kid on Normal (33%).
- **Lower kick power for skill ≤ 0.43**, min(0.6 + 0.4s, 0.45 + 0.75s). Easy got
  worse for mash (72%), kid (62%) and timed (68%).
- **"Ball within 150 px either side" as the standing-still test.** It also
  caught timing players waiting for a ball, 3–11% of their time. "Low and within
  150 px in front" covers 93–96% of an idle player's time and 0–1% of a timing
  bot's.
- **Normal at skill 0.5** (seed 9000): mash 55%, kid 43%, timed 53%. The kid gap
  of 12 was wider, so Normal stays at 0.55.

## Known limits and follow-up

- One cell per seed still misses a target: Hard mash − kid is 12 for seed 9000
  (5 for seed 5000, 8 pooled).
- Normal kid moved 48% → 38% for seed 9000 but 35% → 47% for seed 5000 (42% →
  43% pooled). Sloppy presses no longer turn into kicks off the head or body.
  Watch this in a playtest.
- Silver and gold cups were not re-measured. Their CPUs also get the mash rule,
  capped at 0.95.
- **Follow-up:** run a classroom playtest of Easy, Normal and the bronze cup with
  real players. Check that children who press when the ball arrives, and who hop
  toward it, feel the game is fair. Then decide whether a visible cue is needed,
  for example a "perfect kick" effect, so that the reward for timing is something
  players can see.

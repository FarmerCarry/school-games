# ألعاب الفسحة (Recess Arcade) 🎮

A light, ad-free games website **in Arabic** for 4th and 5th graders: a small Poki-style portal
with original browser games, all written from scratch for this site. The site and all of its
games are in Arabic, laid out right-to-left.

- **No ads, no email/password accounts, no chat, no analytics, no links to other sites.**
- Every game, sound, font and picture lives in this repo. All games run locally in the browser.
- **Made for Windows PCs with a mouse and keyboard.**
- Scores and progress are saved in each browser (localStorage) only.

## The games (31)

| Game | English name | Players | Type |
|---|---|---|---|
| أربعة على التوالي | Connect 4 | 1-2 | ألغاز، لاعبان على نفس الجهاز |
| إكس أو | Tic-tac-toe | 1-2 | ألغاز، لاعبان على نفس الجهاز |
| أصابع البرق | Lightning Fingers (typing test, English + Arabic) | 1 | تحديات |
| ضربة الطلاء | Splat Strike (3D paint-blaster arena vs bots) | 1 | تصويب، تحدي الروبوتات |
| عدّاء السكة | Rail Rush | 1 | جري |
| منحدر النيون | Neon Slope | 1 | جري، أركيد |
| نفق السرعة | Tunnel Blitz | 1 | جري، أركيد |
| قفزة الإيقاع | Beat Dash | 1 | جري، أركيد |
| الخطّاف الطائر | Swing Hook | 1 | أركيد |
| جنون الدراجات | Moto Madness | 1 | سباقات |
| ملك الانزلاق | Drift King | 1 | سباقات |
| النار والجليد | Fire & Ice | 1-2 | لاعبان، ألغاز |
| دبابات الألوان | Paint Tanks | 1-3 | لاعبان، تحدي الروبوتات |
| مصارعة السومو | Sumo Bonk | 1-2 | لاعبان، رياضة |
| هوكي الهواء | Air Hockey | 1-2 | لاعبان، رياضة |
| سلة الرؤوس الكبيرة | Hoop Heads | 1-2 | رياضة، لاعبان |
| كرة القدم المجنونة | Wacky Soccer | 1-2 | رياضة، لاعبان |
| حفلة البلياردو | Pool Party | 1-2 | رياضة |
| ضربة إلى الفضاء | Skybound Golf | 1 | رياضة، أركيد |
| سوق الحيوانات | Critter Mart | 1 | بناء وإدارة |
| إمبراطورية البيتزا | Pizza Empire | 1 | بناء وإدارة |
| عالم المكعبات | Block World | 1 | بناء وإدارة، أركيد |
| انفجار المكعبات | Block Burst | 1 | ألغاز |
| دمج 2048 | 2048 | 1 | ألغاز |
| حبل الحلوى | Munch Rope | 1 | ألغاز |
| اندفاع المتاهة | Maze Dash | 1 | أركيد |
| عبور الطريق | Road Hopper | 1 | أركيد |
| المراحل الماكرة | Sneaky Levels | 1 | أركيد |
| معركة الهلام | Blob Battle | 1 | تحدي الروبوتات |
| لوّن الأرض | Paint Grab | 1 | تحدي الروبوتات |
| ساحة الثعابين | Snake Arena | 1 | تحدي الروبوتات، أركيد |

The original arcade games save best scores and unlocks in the browser, and have a title screen, P/Esc pause and a 🔊 mute button. The two board games use a compact board with local two-player and computer modes.

### Connect 4 and tic-tac-toe

Choose **لاعبان على نفس الجهاز** to take turns with a classmate using the same mouse
or keyboard, or **العب ضد الكمبيوتر** to play alone. No names, accounts, or game server
are needed. **Both modes work without an internet connection.**

Player one uses X in tic-tac-toe and yellow in Connect 4; player two uses O and red.
The board shows whose turn it is, highlights winning moves, and detects draws.
Choose **العب مرة أخرى** after a round; the starting player alternates between rounds.
The fast build bundles each game into one HTML file, with the existing shared fonts,
and the offline cache updates the games on the next site visit.

**ضربة إلى الفضاء (Skybound Golf)** is a one-button distance golf game. Time a swing with
Space or a click, bounce across the course, and earn coins for power, bounce and flight upgrades.
Reach a green for a putting challenge and bonus coins. Best distance and upgrades save locally.

**أصابع البرق (typing test)** works like Monkeytype: time (15/30/60 s), words (10/25/50) or
sentences, in English or Arabic, with the same WPM/accuracy formulas. For a class race, click
**تحدٍّ للصف**, pick a test and write the 4-digit code on the board; every student who enters that
code gets exactly the same words. Tab starts a new test.

**ضربة الطلاء (shooter)** is a first-person arena game in the style of Krunker / Shell Shockers,
made school-friendly: toy paint blasters, cute round "splat buddies", and paint splats instead of
anything violent. Free-for-all or 5 v 5 teams against bots (easy / normal / hard) on three maps,
with coins to unlock colours and hats. Click the game to capture the mouse; Esc gives it back
and pauses.

## Putting it online (GitHub Pages, free)

1. Push the changes to `main`.
2. **If the repository is private:** on GitHub's free plan, Pages only works for public
   repositories. Open **Settings** → **General**, scroll to the bottom (**Danger Zone**) →
   **Change visibility** → **Public**. The repo contains only the games (no passwords, no
   student data), so this is safe. (With a paid GitHub plan you can skip this step.)
3. On GitHub, open the repo → **Settings** → **Pages**.
4. Under **Build and deployment**, **GitHub Actions** is the recommended **Source**.
   An existing site publishing from the `main` branch's **/(root)** folder also works
   without changing its settings, with the update limitation explained below.
5. Open **Actions** → **Build fast site**. A push to `main` starts it automatically;
   after changing the Pages setting, you can also select **Run workflow** on `main`.
6. When the deployment succeeds, share `https://<your-username>.github.io/school-games/`
   with your class. Students do not need GitHub accounts. Every later push to `main`
   runs the checks and deploys the tested fast version.

### The fast version (recommended for PCs with slow hard disks)

The GitHub Actions workflow tests pull requests and builds the faster copy into `_site/`.
This workflow deploys only a tested `main` build; pull requests validate changes without
publishing them. It deploys that folder directly with GitHub's Pages artifact and deployment actions
(see `.github/workflows/build.yml` and `tools/build.mjs`). It looks and plays exactly
the same, but:

- each game is **one file** instead of 10–13, and the home page is one file with all pictures
  built in, so a slow hard disk has far fewer files to read;
- after the first visit, every PC keeps the whole site in an **offline cache**: games open
  without asking the server, still work if the internet drops, and after an update each PC
  downloads only the files that changed;
- it can be **installed as an app** (the install icon in Chrome/Edge's address bar).

For updates that publish only after checks pass, use **Settings → Pages → Source:
GitHub Actions**. Keep editing `main` as usual (for example `js/catalog.js`); the fast
copy deploys after the regression, smoke, and offline checks pass. With this publishing
source, failed checks leave the previous deployment online.

An existing **Deploy from a branch → main → /(root)** site is also compatible because
this workflow deploys from `main`. However, GitHub's separate built-in Pages workflow
can publish the ordinary source version immediately after a push, even if these checks
later fail. Selecting **GitHub Actions** as the source removes that independent publish
path. The workflow checks the current Pages setting without changing it; other source
branches or folders are rejected. No `gh-pages` branch or personal access token is needed.

To return to the ordinary source version, first open **Actions → Build fast site** and
choose **Disable workflow** from its menu, then set Pages to **Deploy from a branch →
main → /(root)**. Disabling the workflow prevents a later fast build from replacing it.
The `sw.js` file in `main` is an "off switch": PCs remove the offline cache on their next
visit and use the normal site again.

If the school web filter blocks it, ask IT to allow that address. The site contains no ads.

### Running it without the internet

Download the repo (**Code → Download ZIP**), unzip it, and double-click `index.html`.
Everything works straight from the folder. You can also put the folder on a shared drive.

## Managing games

The home page puts recent games and favorites first. The extra filters show short
rounds, one-button games, or games for friends. `roundMinutes` in the catalog is an
estimate for choosing a game, not a time limit; `inputStyle` describes its controls.
Returning from a game restores the originating tile and browsing position.

The classroom controls offer quiet sound, reduced effects, and an optional session
timer. The quiet/effects preset is temporary and preserves each game's personal
preferences. When time expires, the game pauses behind a handoff prompt; it is not closed
or reset. Resume is explicit. Games also pause when focus leaves their playing
window, including Shift+Tab back to the portal and leaving fullscreen.

The fast site's footer shows whether every file is verified for offline use.
“جاهز دون إنترنت” means the active version is complete; an incomplete installation
or cleared cache offers Retry. Keep the first visit open until it is ready. A
downloaded folder instead reports that it is running locally.

Critter Mart and Pizza Empire show a persistent warning if saving is blocked or
storage is full. Retry keeps the current session and clears the warning only after
the pending data is saved. Block World's final celebration survives a reload until
the player acknowledges it.

Everything the home page shows comes from **`js/catalog.js`**:

- **Hide a game:** add `hidden: true` to its entry.
- **Feature a game** first in the catalog: set `hot: true`.
- **Rename the site:** change `name` in `window.SITE` (currently "ألعاب الفسحة").

## For developers

```
index.html, css/, js/     the portal (plain HTML/CSS/JS, no build step)
js/catalog.js             list of games, categories and site name
games/<slug>/             one folder per game (index.html + thumb.svg + its own files)
shared/kit.js             tiny helper library all games use (sound, saving, input, scaling)
shared/game.css           shared game page styles + the Fredoka font
lib/three/                three.js r159 (MIT) for the 3D games
docs/GAME_SPEC.md         the rules every game follows
tools/playtest.mjs        headless Chromium playtest harness (Playwright)
tools/build.mjs           builds the fast version (one file per game + offline cache)
```

Use Node.js 22 or newer (the CI workflow uses Node 22), then install the pinned
development tools and Chromium once:

```
npm ci
npm run browsers:install          # downloads Playwright's Chromium
# Linux machines missing browser libraries: npx playwright install --with-deps --no-shell chromium
```

Preview locally over HTTP with any static server, for example `python3 -m http.server 8000`.
Test a game automatically with `node tools/playtest.mjs <slug>`. Failed browser actions,
evaluations, page errors, or missing assets return a nonzero exit status.
If Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its absolute
executable path instead of downloading another browser (for example `/usr/bin/chromium`).
`PLAYWRIGHT_EXECUTABLE_PATH` is also supported. Tests use the full Chromium browser in
headless mode through the shared launcher; the install command includes that browser.

Performance and the fast build:

```
npm test                        # deterministic bug regressions and browser checks
npm run test:unit                # the regression files under tools/tests/
npm run test:shared              # source-independent rules, build safety and tool fixtures
npm run test:browser             # gameplay and portal checks for the selected SG_ROOT
npm run test:tooling             # server, report and audio-probe helper checks
npm run test:scenarios           # prove broken Start/Pause handlers fail the gameplay checks
npm run test:classroom           # downloaded folder, Arabic/spaced paths and denied storage
npm run test:regressions         # additional gameplay and portal keyboard checks
npm run check                   # smoke-test all source games
npm run build                   # fast build into _site/ (the Pages artifact)
npm run perf:assets              # enforce raw, compressed and offline-cache asset budgets
SG_ROOT=_site npm run test:browser # run gameplay/portal regressions against optimized games
SG_ROOT=_site npm run check      # smoke-test all optimized games
npm run test:offline             # cache installation, offline games, updates, and kill switch
npm run test:board-games         # local turns, computer opponents, rematches and controls
SG_ROOT=_site npm run test:board-games # same flows in the single-file fast build
node tools/perf.mjs [slug]       # files, load/script time, stutters, memory, saves per page
```

The offline tests use disposable working copies, so their simulated updates leave the
checkout and existing `_site/` output intact. The browser regression suite uses isolated
profiles and test saves; it does not overwrite your normal browser progress.
Smoke runs keep per-game screenshots and a `report.json` in a separate temporary directory.
Failures print diagnostics immediately, including the browser action that failed.
Set `SG_ARTIFACT_DIR` to retain smoke screenshots, failure DOM and the summary at a
known path. CI uploads source/built diagnostics even on failure. Every catalog game
has a scenario in `tools/game-scenarios.mjs` that starts it through visible controls,
checks meaningful input, verifies pause, and restarts a round or resumes a persistent
world. The Windows Edge job checks downloaded source and fast builds, including
denied browser storage, and must pass before deployment.

For real hardware measurements, run on the school's weakest supported Windows PC:

```
npm run perf -- --native-gpu --headed --seconds 30 rail-rush splat-strike --json report.json
```

This mode records the actual renderer, cold/warm browser startup and frame/memory
measurements during active gameplay. Use repeated runs on the same hardware to set
budgets; headless software-renderer CI timings are not school-PC performance claims.
The headed run must retain focus while measuring because games now pause on blur.

CI runs source-independent rules, asset-optimizer/budget tests, build-safety checks and
harness fixtures once. It runs gameplay, portal, smoke and board-game browser checks
against both source and the optimized build, then checks offline installation and updates.
`npm test` still runs the complete regression set for the selected root. The suite selector
discovers every `tools/tests/*.test.mjs` file; new tests default to both source/build passes.
Only tests explicitly listed as source-independent in `tools/test-suite.mjs` run once.
The shared suite includes browser-based harness fixtures, so it also needs Chromium.

`node tools/audio-probe.mjs <slug>` records game sound. Custom `--actions` files or
`--actions-json` lists support `wait`, `click`, `move`, `press`, `hold`, `drag`, `eval`
and nested `repeat`/`do`, using the playtest action format. `hold` accepts `ms`, while
`move` and `drag` accept `steps`. Other playtest actions (such as `clickSel`, `holdMany`,
`assert`, `shot` and `reload`) are rejected before the browser opens, including inside
repeat blocks. Invalid values and unknown action fields also fail with a nonzero status.

The builder accepts new or empty output directories and recognized generated builds.
It refuses source directories, Git metadata, symlinks, tracked files, and unrelated files
added to an output directory. Custom output uses `node tools/build.mjs --out <directory>`.
Builds are staged before replacement, so a failed build preserves the previous output.
The generated ownership marker is excluded from the offline cache.

Regression tests cover storage exhaustion and failed-save recovery, inventory conservation
across reloads, pending completion screens, actual browser Back cache restoration, native
keyboard controls, and game rules. Additive save fields remain compatible with older saves.

If you add or remove games or cached assets, regenerate the committed emergency switch
so its legacy-cache cleanup knows the current file paths:

```
node tools/build.mjs --out .work/kill-switch --kill-sw
cp .work/kill-switch/sw.js sw.js
```

Level-specific verifiers live beside their games. Swing Hook exits nonzero for unsolved
levels or failed solution replays. Block Burst's default check also fails its statistical
balance thresholds:

```
node games/swing-hook/verify-levels.js
node games/block-burst/verify-levels.js
node games/block-burst/verify-levels.js --report-balance
```

The last command reports balance thresholds as warnings while still failing invalid boards
and levels with no successful smart-bot runs. The existing levels currently have balance
warnings; report mode is useful for inspecting them without treating those warnings as
proof a level is impossible.

Block Burst's policies now have independent seeded randomness, and search clones
preserve the simulated random state. Use `--json` for failed seeds and remaining
goals; replay one noisy-policy attempt with:

```
ONLY=20 node games/block-burst/verify-levels.js 1 --bot=kid --seed=19007 --report-balance --json
```

The `kid` label is a noisy simulation policy, not a measurement of children. See
[`docs/BLOCK_BURST_BALANCE.md`](docs/BLOCK_BURST_BALANCE.md) for changes, samples and
independent holdouts. Actual student playtests remain necessary for difficulty feel.

## Credits and licenses

- Games, art, sounds and site: original work made for this project.
- [three.js](https://threejs.org) r159, MIT license (`lib/three/LICENSE`).
- Fredoka font (Latin) and Baloo Bhaijaan 2 font (Arabic), SIL Open Font License
  (`shared/fonts/LICENSE-*.txt`).

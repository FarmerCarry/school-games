# ألعاب الفسحة (Recess Arcade) 🎮

A light, ad-free games website **in Arabic** for 4th and 5th graders: a small Poki-style portal
with original browser games, all written from scratch for this site. The site and all of its
games are in Arabic, laid out right-to-left.

- **No ads, no email/password accounts, no chat, no online tracking or third-party analytics, no links to other sites.**
  Play statistics are counted on each PC only and are never sent anywhere (see
  [Play statistics](#play-statistics-local-only)).
- Every game, sound, font and picture lives in this repo. All games run locally in the browser.
- **Made for Windows PCs with a mouse and keyboard.**
- Scores, progress and the anonymous play statistics are saved in each browser (localStorage) only.

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
downloaded folder instead reports that it is running locally. Each file's bytes are
hashed when it is cached; later visits only confirm that every verified file is
still there, so slow disks are not re-read on every visit. Retry hashes them again.

Critter Mart and Pizza Empire show a persistent warning if saving is blocked or
storage is full. Retry keeps the current session and clears the warning only after
the pending data is saved. Block World's final celebration survives a reload until
the player acknowledges it.

### Play statistics (local only)

Each PC counts which games children open, how long they really play (only while they
use the mouse or keyboard), where they stop in a game, and whether the games run
smoothly on that PC. The numbers stay in that browser's storage. There is no server,
no upload and no tracking script. Names, typed text and class codes are never recorded.
The numbers describe **a PC, not a child**: several children share a PC, and
two-player modes mix players.

- **Open:** 🏫 إعدادات الصف → 📊 إحصاءات هذا الجهاز (or open `teacher.html`). It opens
  in a new tab, so a running game is not interrupted. It works offline and from a
  downloaded folder. The web copy and a downloaded folder keep separate statistics, so
  open the page the same way the children open the games.
- **Read:** choose a period (اليوم، هذا الأسبوع، آخر 30 يومًا، الكل). Four cards answer
  which games they play most, how long, at what time and where they stop. A table lists
  each game. Device status, how children reach the games, settings and first-time
  tutorials are in folded sections below. «Where they stop» lists only levels that can be
  won or lost, with «فازوا في N من M محاولات» (tries include leaving the level); free play,
  endless runs, 2048 boards and two-player modes are left out, and runs and boards show
  their average and best score in the levels table instead. A game still open on this PC
  today shows its time with the note «مرة لعب ما زالت مفتوحة» until it is closed.
- **Name the PC:** type a short label such as «جهاز 7». Never type a child's name.
- **Export to Excel:** press **تصدير ملف Excel**. Each click saves one workbook,
  `play-stats_<pc>_<date>.xlsx`, with every stored day: an Arabic read-me sheet (اقرأني)
  and the tables `days`, `games`, `levels` and `hours`. **تصدير JSON** saves the same
  data as a `.json` file. Edge and Chrome open a save dialog: choose the folder (for
  example the shared OneDrive folder) and save. Closing the dialog saves nothing, and
  the page says so. In other browsers, or when the page is opened over plain `http://`
  from another computer, the file is downloaded and the page asks «هل حُفظ؟»: press
  **نعم، حُفظ الملف** only once the file is saved. An export counts (and the reminder
  below goes away) only when the file is saved. Export every week: old days are removed when the statistics
  space (300 KB) fills or after 120 days, whichever comes first, and a busy computer-lab
  PC may keep only 2–3 months. The page shows a reminder when the space is more than
  three-quarters full and nothing was exported for a week, when days were removed for
  space before they were exported, or when the oldest day not yet exported is more than
  100 days old. For privacy the `hours` table has no dates and lists a game's hour only
  when it was played then on at least 3 days, and not on every day the game was played.
  It still shows when games are usually played, so keep the files like class records.
- **Combine PCs:** press **فتح ملفات من أجهزة أخرى** and choose the JSON files from other
  PCs to see them together. Nothing from those files is saved. In Excel, put the
  workbooks in one folder and use **Data → Get Data → From Folder**. Drop rows where `pc`
  is empty (an empty table keeps one blank row). For each `pc` and `date`, keep only the
  rows from the file with the newest `exported_at`; never add two exports of the same PC
  and day.
- **Stop or clear:** stop collecting (type «أوقف» to confirm) or clear this PC's
  statistics (type «امسح»). Clearing never removes game progress, the PC name or the
  stop setting. Clearing the browser's site data also deletes the statistics.

The page has no password. A child who opens it could stop or clear the statistics,
so both actions need a typed word. The formats are in [`docs/PLAY_STATS.md`](docs/PLAY_STATS.md).

Everything the home page shows comes from **`js/catalog.js`**:

- **Hide a game:** add `hidden: true` to its entry.
- **Feature a game** first in the catalog: set `hot: true`.
- **Rename the site:** change `name` in `window.SITE` (currently "ألعاب الفسحة").

## For developers

```
index.html, css/, js/     the portal (plain HTML/CSS/JS, no build step)
js/catalog.js             list of games, categories and site name
js/stats.js               the portal's local play-statistics recorder
teacher.html              teacher page: this PC's play statistics and Excel/JSON exports
css/teacher.css, js/teacher.js   its styles and script (pure parts in window.SGTeacher)
games/<slug>/             one folder per game (index.html + thumb.svg + its own files)
shared/kit.js             tiny helper library all games use (sound, saving, input, scaling, play statistics)
shared/game.css           shared game page styles + the Fredoka font
lib/three/                three.js r159 (MIT) for the 3D games
docs/GAME_SPEC.md         the rules every game follows
docs/PLAY_STATS.md        play statistics: what is counted, storage and export formats
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
npm run test:classroom           # downloaded folder, Arabic/spaced paths, denied storage, teacher page
npm run test:regressions         # additional gameplay and portal keyboard checks
npm run check                   # smoke-test all source games
npm run build                   # fast build into _site/ (the Pages artifact)
npm run perf:assets              # enforce raw-byte page, font, library and offline-cache budgets
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

CI runs source rules and level verifiers, asset-optimizer/budget tests, build-safety checks,
offline controller/worker unit checks and harness fixtures once. It runs gameplay, portal, smoke and board-game browser checks
against both source and the optimized build, then checks offline installation and updates.
`npm test` still runs the complete regression set for the selected root. The suite selector
discovers every `tools/tests/*.test.mjs` file; new tests default to both source/build passes.
Only tests explicitly listed as source-independent in `tools/test-suite.mjs` run once.
The shared suite includes browser-based harness fixtures, so it also needs Chromium.
`test:browser` passes `--browser-only` to the extra gameplay regression runner because
its source engine checks already run in the shared suite. Running `test:regressions`
directly still covers both its source engine and browser checks; `--unit-only` remains
available for its source engine checks without a browser.

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

# ألعاب الفسحة (Recess Arcade) 🎮

A light, ad-free games website **in Arabic** for 4th and 5th graders: a small Poki-style portal
with original browser games, all written from scratch for this site. The site and all of its
games are in Arabic, laid out right-to-left.

- **No ads, no accounts, no chat, no tracking, no links to other sites.**
- **Nothing loads from the internet.** Every game, sound, font and picture lives in this repo.
- **Made for Windows PCs with a mouse and keyboard.**
- Scores and progress are saved in each browser (localStorage) only.

## The games (28)

| Game | English name | Players | Type |
|---|---|---|---|
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

Every game saves best scores and unlocks in the browser, and has a title screen, P/Esc pause and a 🔊 mute button.

**أصابع البرق (typing test)** works like Monkeytype: time (15/30/60 s), words (10/25/50) or
sentences, in English or Arabic, with the same WPM/accuracy formulas. For a class race, click
**تحدٍّ للصف**, pick a test and write the 4-digit code on the board; every student who enters that
code gets exactly the same words. Tab starts a new test.

**ضربة الطلاء (shooter)** is a first-person arena game in the style of Krunker / Shell Shockers,
made school-friendly: toy paint blasters, cute round "splat buddies", and paint splats instead of
anything violent. Free-for-all or 5 v 5 teams against bots (easy / normal / hard) on three maps,
with coins to unlock colours and hats. Click the game to capture the mouse; Esc gives it back
and pauses.

## Putting it online (GitHub Pages)

1. Open the repository's **Settings > Pages**. Under **Build and deployment**, set
   **Source** to **GitHub Actions**. This is a one-time setting; the workflow publishes
   the tested fast build directly.
2. Merge this branch into `main`.
3. Open **Actions > Build fast site** to follow the checks and deployment. You can
   also select **Run workflow** on `main` after changing the Pages setting.
4. After a successful deployment, the site is live at
   `https://<your-username>.github.io/school-games/`. Share that link with your class.

Pages is available for public repositories on GitHub Free and for private repositories
on eligible paid plans. See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Pull requests run the same checks without publishing. Pushes to `main` and manual runs
on `main` publish only after source tests, built-site tests and offline tests pass
(`.github/workflows/build.yml`). A failed check leaves the previous deployment online.
Keep editing `main` as usual, including `js/catalog.js` when hiding or featuring games.
In branch protection, require **Test source and fast build** before merging.

### The fast version (for PCs with slow hard disks)

`tools/build.mjs` creates `_site/`, the version the workflow tests and deploys.
It preserves the games' Arabic interface, artwork and gameplay:

- each game's scripts and styles are folded into one HTML file, and the portal's
  pictures are embedded; fonts and Three.js stay shared to avoid duplication;
- after the first visit, each PC keeps the site in an **offline cache**: games open
  without contacting the server, work when the connection drops, and updates download
  only changed files;
- it can be **installed as an app** from Chrome or Edge's address bar.

The build is designed to reduce asset requests and disk reads. School-HDD loading gains
have not been measured yet. Compare cold and cached visits on a representative school PC
with fixed settings, and record time until playable, request count, frame times and input
response. Clearing the browser cache does not reproduce a genuinely cold disk.
Compare settled title and gameplay screenshots too, and check Arabic readability and
gameplay manually before accepting a performance change.

The builder also supports `node tools/build.mjs --kill-sw` for a cache-removal release.
Its worker removes existing registrations and caches; the offline suite tests this switch.
The source `sw.js` provides the same off switch when serving the unbuilt site.

If the school web filter blocks the site, ask IT to allow its address. The games contain
no ads and make no outside requests.

### Running it without the internet

Download the repo (**Code → Download ZIP**), unzip it, and double-click `index.html`.
Everything works straight from the folder. You can also put the folder on a shared drive.

## Managing games

Everything the home page shows comes from **`js/catalog.js`**:

- **Hide a game:** add `hidden: true` to its entry.
- **Feature a game** in the "🔥 Hot right now" row: set `hot: true`.
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

The site itself runs as plain HTML/CSS/JS. Node 22, esbuild and Playwright are development
tools; they are not included in the published games.

Install the pinned dependencies and Chromium once:

```sh
npm ci
npx playwright install --no-shell chromium
```

The checks use full Chromium's headless mode to match the desktop browser's renderer.
On Linux, use `npx playwright install --with-deps --no-shell chromium` to install Chromium's
system dependencies as well. If Chromium is already installed in a managed environment, set
`PLAYWRIGHT_EXECUTABLE_PATH` to its executable instead of downloading another browser.

Preview locally over HTTP with any static server, for example `npx serve .`.
Test one source game with `node tools/playtest.mjs <slug>`.

Run the release checks locally:

```sh
npm run test:tooling             # build and browser-harness helper tests
npm run check                    # smoke-test every source game
npm run test:regressions          # focused gameplay and portal assertions
npm run build                    # fast build into _site/
SG_ROOT=_site npm run check
SG_ROOT=_site npm run test:regressions
npm run test:offline              # install, offline use, updates, stale files, kill switch
```

For the two `SG_ROOT` commands in Windows PowerShell:

```powershell
$env:SG_ROOT = '_site'
npm run check
npm run test:regressions
Remove-Item Env:SG_ROOT
```

The offline tests use temporary copies so the verified `_site/` output remains unchanged.
Use `node tools/perf.mjs [slug]` to inspect requests, load/script time, stutters, memory
and save activity. Browser checks catch specific regressions; they do not measure
school-HDD performance or judge how enjoyable a game feels.

## Credits and licenses

- Games, art, sounds and site: original work made for this project.
- [three.js](https://threejs.org) r159, MIT license (`lib/three/LICENSE`).
- Fredoka font (Latin) and Baloo Bhaijaan 2 font (Arabic), SIL Open Font License
  (`shared/fonts/LICENSE-*.txt`).

# ألعاب الفسحة (Recess Arcade) 🎮

A light, ad-free games website **in Arabic** for 4th and 5th graders: a small Poki-style portal
with original browser games, all written from scratch for this site. The site and all of its
games are in Arabic, laid out right-to-left.

- **No ads, no accounts, no chat, no tracking, no links to other sites.**
- **Nothing loads from the internet.** Every game, sound, font and picture lives in this repo.
- **Made for Windows PCs with a mouse and keyboard.**
- Scores and progress are saved in each browser (localStorage) only.

## The games (26)

| Game | English name | Players | Type |
|---|---|---|---|
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

## Putting it online (GitHub Pages, free)

1. Merge this branch into `main`.
2. On GitHub, open the repo → **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then branch **`main`** and
   folder **`/ (root)`**, and click **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/school-games/`.
   Share that link with your class.

If the school web filter blocks it, ask IT to allow that address. The site contains no ads and
makes no outside requests, so it's an easy one to approve.

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
```

Preview locally over http with any static server, for example `npx serve .`.
Test a game automatically with `node tools/playtest.mjs <slug>`.

## Credits and licenses

- Games, art, sounds and site: original work made for this project.
- [three.js](https://threejs.org) r159, MIT license (`lib/three/LICENSE`).
- Fredoka font (Latin) and Baloo Bhaijaan 2 font (Arabic), SIL Open Font License
  (`shared/fonts/LICENSE-*.txt`).

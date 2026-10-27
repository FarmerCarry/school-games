# Insights dashboard

Static files served at `/` of the ingest server (Cloudflare Worker or Node), next to the
data and outside the children's site. No build, no libraries, no inline script: the
page runs under `default-src 'self'; script-src 'self'; …`.

| File | What it does |
|---|---|
| `index.html` | The page shell. |
| `app.js` | The shell: sign in, the hash router and tab bar, the filter row, loading (`request()`, demo mode), timers, the school's clock line, and the Overview. |
| `students.js`, `games.js`, `habits.js`, `learning.js`, `pcs.js`, `data.js` | One tab each (`window.SGTabs.<name> = { load, render }`); `students.js` also draws a student's page and `games.js` a game's page. |
| `insights.js` | Pure rules (no DOM): rankings, the difficulty check, the small-sample flag, the insight sentences and the research sentences in both languages, number formats. `window.SGInsights`; Node loads it as a plain script. |
| `research.js` | Pure maths (no DOM, no clock): weeks on the school's first weekday, r_stat sums and measures, quantiles from histograms, cohorts, paired same-student growth, persistence, categories, labels and the code search. `window.SGResearch`. |
| `charts.js` | Inline-SVG line charts (also step lines), bar lists, columns (histograms, weekly and stacked columns), small multiples on one scale, sparklines, dumbbells and stacked rows; HTML heatmaps and calendar strips; the tooltip and the table twin. |
| `i18n.js` | Every word of the page in Arabic and English. |
| `style.css` | Light and dark colour roles (validated dataviz palette, the sequential `--q1..--q5` and ordinal `--o1..--o4` ramps), layout down to 360 px. |
| `names.js` | Every game's Arabic and English name, categories, players and input style from `js/catalog.js`, and the category names. |
| `scores.js` | What the score means in each of the 28 games that pass one (hand-written). |
| `demo/` | `/?demo`: one answer per endpoint and filter, in the admin API's shapes, fetched lazily. |
| `make-demo.mjs` | Rebuilds the sample data from the real Node server. It still writes the milestone-2 `demo.json`; until it writes `demo/` from the server's new endpoints, `demo/` holds hand-made answers in the same shapes. Not deployed (`.assetsignore`). |
| `make-names.mjs` | Rebuilds `names.js` after a game is added or renamed: `node server/dashboard/make-names.mjs`. Not deployed. |

* **Pages** (hash routes): `#/overview` (the default), `#/students` and `#/student/<code>`,
  `#/games` and `#/game/<slug>`, `#/habits`, `#/learning`, `#/pcs`, `#/data`. Each page
  asks for its endpoints only when it is opened (and on Refresh); the last tab and period
  are remembered in this browser.
* **Filters:** the period (today, 7, 30 or 90 days, this school year from 1 August, or two
  dates at most 366 days apart), the age group (with "Not set"), the game on the Learning
  tab and a game's page, and a code search (4 to 13 letters and digits) on the Students tab.
* **Password:** the `ADMIN_TOKEN` of the server, kept in that browser's `localStorage`
  (`sg:dash:token`) until "Sign out". 401 says the password is wrong, 404 explains how to
  set it (an endpoint an older server lacks says the server needs updating instead), a
  network error says the server cannot be reached.
* **Refresh:** the Overview's numbers every 5 minutes and "playing now" every 30 seconds,
  both paused while the tab is hidden. An unchanged answer keeps the page.
* **Days** follow the school's clock that every admin answer carries (`clock.today` is
  "today"); after sign-in, while the server knows no zone, the page offers this browser's
  zone once (`POST /v1/admin/settings {tz, source: 'dashboard'}`), and the clock line's
  Change sends the owner's choice. Charts built from `/v1/admin/stats` include play up to
  last night.
* **Nothing is hidden:** every group is shown with its numbers, even one child. A number
  based on fewer than 5 children or 20 tries carries a "based on 2 children" chip; a
  difficulty verdict on 10 to 19 tries is an early sign. Children appear only under their
  code ("Student 7F3A"); there are no names, ranks or medals.
* **Game names** come from `names.js` (bundled, same origin), written from the games
  site's `js/catalog.js` by `make-names.mjs`; only a game added after the server was last
  deployed shows its slug. No script from another site runs on the page (the CSP's
  `script-src` is `'self'`): it could read the stored password.
* **Development:** `?api=http://127.0.0.1:8787` points the page at another server, only
  while the page itself is opened from `localhost` (the password never leaves for a
  crafted link). The rules and thresholds are documented at the top of `insights.js` and
  `research.js`.
* **Tests:** `node --test tools/tests/dashboard-insights.test.mjs` and
  `tools/tests/dashboard-research.test.mjs` (Node), and `tools/tests/dashboard.test.mjs`
  (Chromium, under the CSP, against the real Node server; endpoints that server does not
  have yet are answered from `demo/`).

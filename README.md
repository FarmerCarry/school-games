# ألعاب الفسحة (Recess Arcade) 🎮

A light, ad-free games website **in Arabic** for children aged 5–11: a small Poki-style portal
with original browser games, all written from scratch for this site. The site and all of its
games are in Arabic, laid out right-to-left. The games scale from a 5-year-old who has never
held a mouse to an 11-year-old expert (27 of the 52 games—including Bubble Bop, Road Hopper,
Dino 3D, Beat Dash, Math Gates, Word Garden, Shortcut Factory, Robo Swarm and Balloon Blast—adapt
their difficulty dynamically via `Kit.dda` to how children play on each PC), and none of them
plays background music.

- **No ads, no accounts, no profiles, no names, no ages, no chat, no third-party analytics, no links to other sites.**
  Children open a game and play; nothing they type is ever sent.
- Every game, sound, font and picture lives in this repo, and all games run locally in the browser.
  The only network use is **anonymous play statistics** (see [Privacy](#privacy)).
- **Made for Windows PCs with a mouse and keyboard.**
- Scores, progress and each game's difficulty are saved in each browser (localStorage).

## Privacy

The published fast version sends **anonymous play statistics** to the school's own statistics
server: which games are played on each PC, how they were opened, how long and how smoothly
they run, and how each round went (level, win or loss, score, hits and misses, reaction
times). There are no accounts, profiles, names or ages, so nothing says which child played;
a random code per PC and per page load ties the numbers together. Nothing typed, no error
text, no dates or times of day and no cookies are sent.

Only `js/telemetry.js` sends, and only when the fast build is given the server's address
(`SG_TELEMETRY_URL`, set in `.github/workflows/build.yml`). The source files, a build without
the address, the offline ZIP run from a folder and a browser with Global Privacy Control send
nothing. Details, the exact fields and how to turn it off: [`docs/TELEMETRY.md`](docs/TELEMETRY.md).

## The games (52)

| Game | English name | Players | Type |
|---|---|---|---|
| فقاعات بوب | Bubble Bop (first game for new mouse users) | 1 | نقطة البداية، أركيد |
| ابحث وكبّر | Seek & Zoom (hidden objects: movable magnifying glass, mouse wheel, click) | 1 | ألغاز |
| سلك الشرارة | Steady Hand (guide a spark along wires with the mouse) | 1 | تحديات، أركيد |
| أربعة على التوالي | Connect 4 | 1-2 | ألغاز، لاعبان على نفس الجهاز |
| إكس أو | Tic-tac-toe | 1-2 | ألغاز، لاعبان على نفس الجهاز |
| أصابع البرق | Lightning Fingers (typing game with lightning clouds and a speed test, Arabic + English) | 1 | تحديات، أركيد |
| عدّاء المفاتيح | Key Runner (find the keys on the school keyboard) | 1-2 | تحديات، لاعبان |
| مغامرة الكيبورد | Keyboard Obby (hop across a giant 3D school keyboard) | 1 | تحديات، أركيد |
| حديقة الكلمات | Word Garden (type the missing letter, Arabic + English) | 1 | ألغاز، تحديات |
| مصنع الاختصارات | Shortcut Factory (Ctrl+C, V, X, Z and other shortcuts) | 1 | ألغاز، تحديات |
| ضربة الطلاء | Splat Strike (3D paint-blaster arena vs bots) | 1 | تصويب، تحدي الروبوتات |
| مقلاع الألوان | Splat Catapult (slingshot paint forts + 2-player duel) | 1-2 | تصويب، ألغاز، لاعبان |
| عدّاء السكة | Rail Rush | 1 | جري |
| الديناصور ثلاثي الأبعاد | Dino 3D (smooth low-poly 3D dinosaur journey) | 1 | جري، أركيد |
| بوابات الحساب | Math Gates (three-lane crowd runner for practising math) | 1 | جري، ألغاز |
| منحدر النيون | Neon Slope | 1 | جري، أركيد |
| نفق السرعة | Tunnel Blitz | 1 | جري، أركيد |
| قفزة الإيقاع | Beat Dash | 1 | جري، أركيد |
| الخطّاف الطائر | Swing Hook | 1 | أركيد |
| جنون الدراجات | Moto Madness | 1 | سباقات |
| ملك الانزلاق | Drift King | 1 | سباقات |
| سباق المكاتب | Desk Karts (3D Micro Machines-style school-desk toy kart racing) | 1-2 | سباقات، لاعبان، أركيد |
| النار والجليد | Fire & Ice (2.5D Three.js temple co-op puzzle platformer across 15 levels) | 1-2 | لاعبان، ألغاز |
| هجوم الروبوتات | Robo Swarm | 1-2 | تصويب، تحدي الروبوتات، لاعبان |
| معركة البالونات | Balloon Blast | 1-2 | تحدي الروبوتات، لاعبان |
| دبابات الألوان | Paint Tanks | 1-3 | لاعبان، تحدي الروبوتات |
| مصارعة السومو | Sumo Bonk | 1-2 | لاعبان، رياضة |
| هوكي الهواء | Air Hockey (3D neon table) | 1-2 | لاعبان، رياضة |
| سلة الرؤوس الكبيرة | Hoop Heads | 1-2 | رياضة، لاعبان |
| كرة القدم المجنونة | Wacky Soccer | 1-2 | رياضة، لاعبان |
| حفلة البلياردو | Pool Party | 1-2 | رياضة، لاعبان |
| ضربة إلى الفضاء | Skybound Golf | 1 | رياضة، أركيد |
| سوق الحيوانات | Critter Mart | 1 | بناء وإدارة |
| إمبراطورية البيتزا | Pizza Empire | 1 | بناء وإدارة |
| مطبخ الفسحة | Recess Kitchen (3D isometric co-op school canteen rush) | 1-2 | لاعبان، أركيد، بناء وإدارة |
| سباق البيض | Egg Rush (3D school sports-day egg-and-spoon race) | 1-2 | لاعبان، جري، أركيد |
| بحيرة الحظ | Lucky Lake (fishing) | 1-2 | لاعبان، أركيد |
| عالم المكعبات | Block World | 1 | بناء وإدارة، أركيد |
| حرّاس الكعكة | Cake Guards (tower defense) | 1 | استراتيجية |
| قلعة الألعاب | Toy Castle (3D tabletop toy-brick castle tug-of-war + 2-player battle) | 1-2 | استراتيجية، لاعبان، تحدي الروبوتات |
| انفجار المكعبات | Block Burst | 1 | ألغاز |
| دمج 2048 | 2048 | 1 | ألغاز |
| سلّة الفواكه | Juicy Drop (2.5D 3D-fruit merge jar) | 1 | ألغاز، أركيد، تحديات |
| جزيرة الفوضى | Chaos Island (3D tropical island disaster survival) | 1-2 | لاعبان، أركيد |
| حبل الحلوى | Munch Rope | 1 | ألغاز |
| القلم السحري | Magic Crayon (2.5D 3D toy diorama: draw crayon bridges, boost & bounce tracks for a monster truck) | 1 | ألغاز، أركيد |
| اندفاع المتاهة | Maze Dash | 1 | أركيد |
| عبور الطريق | Road Hopper | 1 | أركيد |
| المراحل الماكرة | Sneaky Levels | 1 | أركيد |
| معركة الهلام | Blob Battle | 1 | تحدي الروبوتات |
| لوّن الأرض | Paint Grab | 1 | تحدي الروبوتات |
| ساحة الثعابين | Snake Arena | 1 | تحدي الروبوتات، أركيد |

The original arcade games save best scores and unlocks in the browser, and have a title screen, P/Esc pause and a 🔊 mute button. The two board games use a compact board with local two-player and computer modes.

**معركة البالونات (Balloon Blast)** is a water-balloon maze. Drop a balloon, step away, and the splash pops crates and traps a rival in a bubble. Play against three computers, with a friend on the same keyboard, or through three adventure worlds. Stars and coins open more critters. Rounds are reported with the site's anonymous play statistics, the same way as every other game.

**هجوم الروبوتات (Robo Swarm)** is a recess-sized survivors game. You only move: the foam blaster fires by itself at the nearest wind-up robot. Popped robots drop bolts, and every level pauses for a choice of three upgrade cards (up to a rubber-duck tornado or a paint cannon). Survive four minutes to pop the King Robot, or pick a quick run when recess is short. Two players share one keyboard. Coins buy a heart, a little speed, or a card reroll, and beating a map opens the next arena. Rounds are reported with the site's anonymous play statistics, the same way as every other game.

**فقاعات بوب (Bubble Bop)** is the «ابدأ من هنا» starter game for a 6-year-old who has never used a mouse or keyboard. It is a real arcade game with no words to read, no way to lose and no timer in its levels. Bop, a round glowing friend, floats with the mouse pointer. Eleven worlds teach one input each through play. The first five: touch bubbles with Bop to pop them (no click needed), click on or near balloons, press the long Space bar so a frog catches fireflies, move a basket under falling fruit with ← → (or A/D), and a party world that mixes these four. The next six: drag baby turtles to the pool of their colour, double-click sleeping clams to find pearls, press and hold the button (or Space) to blow a bubble until it fills a ring, steer a submarine to starfish with all four arrows (or WASD), press the letter a balloon carries, and a grand party world that mixes these five. The letter world draws an on-screen keyboard like the school's own (Latin letter top-left, Arabic letter bottom-right, F and J bumps); keys are found by their place, so either input language works, and the key to press always glows. It starts with F and J, then the home row and the rows above and below. Each world has three short levels (one to three stars) and a 60-second party round with combos, gold targets and a best score; the map shows worlds 1–5 and 6–11 on two pages turned with big arrows. Hit areas are bigger than the pictures, targets drift towards Bop, mashing and stray keys never cost anything, and an on-screen mouse, Space bar, arrow keys and keyboard light up with the real ones. A wordless hand shows the move after a few idle seconds and repeats while the child waits. Difficulty follows the child (Kit.dda): a 6–7-year-old starts with huge, slow targets, a generous double-click gap and hold window and turtles that can also be carried with two clicks, a 10–11-year-old with a brisk challenge, and each world adapts to how the last level went. Stars (up to 99) unlock colours and hats for Bop. Two optional picture cards show how to hold the mouse and where the keys are. P or Esc pauses. Progress stays in this browser, and saves from the five-world version keep all their stars.

**الديناصور ثلاثي الأبعاد (Dino 3D)** is a smooth low-poly 3D journey runner: a cute little dinosaur
runs home to reunite with its dino family across five distinct worlds (Golden Desert, Lush Jungle,
Snowy Peaks, Volcano Valley and the Royal Family Nest), three stages each, plus an Endless Run mode
with optional four-digit course codes. Space/↑/W or click jumps (with coyote time, jump buffering,
variable hop height and bouncy mushroom double-bounces), ↓/S ducks under swooping pterosaurs and low
arches (or fast-falls in midair), and →/D/Shift unleashes a glowing sonic-ring Roar that smashes
crates, cracked boulders and obstacles into confetti. Levels award 1–3 stars and eggs unlock 6
smooth dino colours and 6 cute 3D hats. P/Esc pauses, `Kit.dda` adapts obstacle cadence, and
software WebGL automatically drops MSAA, scales to 0.75× and fence-paces menus.

**عدّاء المفاتيح (Key Runner)** teaches where every key is. A little runner hops across giant
keycap stones printed like the school's Dell Arabic keyboard (Latin letter top-left, Arabic letter
bottom-right); pressing the key on the next stone makes it hop and adds +1 speed. An on-screen
keyboard always shows the key to press, glowing. Seven worlds go Space and arrows, F and J, the
home row, the top row, the bottom row, numbers, then all keys with short Arabic words. A slow
child never falls: the runner waits at the edge. Keys are read by their place, so it works with
either input language. Two players race on split lanes, one on the left half of the keyboard and
one on the right. Esc pauses, because P is a letter here.

**سباق البيض (Egg Rush)** is a 3D school sports-day egg-and-spoon race built with Three.js. Chunky
cartoon runners sprint down colourful tracks holding a spoon with a wobbling egg: lean with ← → / A D
to balance the egg, hold ↑ / W to run faster (which makes it wobble more), and jump over hurdles,
puddles, sprinklers, rolling balls and crossing chickens with Space. Dropping the egg pops it into a
comic splat and respawns you at the last checkpoint. Nine tracks across three worlds (schoolyard, farm
and beach/snow), golden eggs, runner and egg skins, `Kit.dda` tuning, and 2-player local racing.

**بحيرة الحظ (Lucky Lake)** is a fishing game where the fish are visible under the water. Aim with
the mouse (or the arrows) and click or press Space to cast, wait for the «!» bite, then hold to
keep the fish inside the reel bar's green zone. Five places from the village pond to a magic night
lagoon each have three picture goals (stars); there are 33 species and funny junk, a fish book and
rod upgrades. Two players fish against the clock from a dock and a boat (Space and Enter).

**جزيرة الفوضى (Chaos Island)** is a 3D tropical-island disaster-survival party game built with Three.js. Viewed from an angled elevated 3D camera that frames the whole floating island for 1–2 players at once, each round announces one of six telegraphed disasters with a big picture banner: meteor showers (pulsing red target rings), rising lava floods (climb crates, rope bridge, bamboo hut or lighthouse), a swirling tornado (duck into the central stone shelter or run opposite), lightning storms, giant rolling coconuts, and earthquake magma cracks. Platforming includes coyote time, jump buffering, drop-through bridges, a bouncy tiki drum, and playful bumping. Survive a 5-round match for 1–3 stars and coins (standing still never earns stars), test your stamina in endless survival mode, and unlock character colours and 3D hats. P1 moves with WASD + W/Space jump, P2 with the arrow keys (in solo play either arrows or WASD + Space work), and `Kit.dda` adapts solo disaster intensity.

**حرّاس الكعكة (Cake Guards)** is a tower defense game played with the mouse. Jelly blobs march
along candy roads towards a birthday cake; click a round pad beside the road to build a popcorn
popper, bubble blower, cupcake cannon or candy-cane zapper, and click a tower to upgrade or sell
it. Twelve levels in three worlds add new towers and blobs (fast, big, splitting, armoured and a
jelly king), and each level gives up to three stars for the cake that is left. Finishing four
levels opens an endless mode, and stars unlock new cakes. Keys: 1–4 choose a tower, Space starts
the next wave, F plays faster, U/X upgrade or sell, P/Esc pauses. `node games/cake-guards/verify.js`
checks that every level can be won and is lost when nothing is built.

### Connect 4 and tic-tac-toe

Choose **لاعبان على نفس الجهاز** to take turns with a classmate using the same mouse
or keyboard, or **العب ضد الكمبيوتر** to play alone. No names, accounts, or game server
are needed. **Both modes work without an internet connection.**

Player one uses X in tic-tac-toe and yellow in Connect 4; player two uses O and red.
The board shows whose turn it is, highlights winning moves, and detects draws.
Choose **العب مرة أخرى** after a round; the starting player alternates between rounds.
The fast build bundles each game into one HTML file, with the existing shared fonts,
and the offline cache updates the games on the next site visit.

**حفلة البلياردو (Pool Party)** includes 12 trick-shot puzzles alongside local two-player and
computer matches. The final two puzzles ask you to pot a ball and leave the cue-ball centre
inside a marked circle: practise backspin to draw it back, or topspin to follow through.
Existing puzzle stars and unlocks carry over, and the galaxy table still unlocks at 30 stars.

**ضربة إلى الفضاء (Skybound Golf)** is a 3D one-button arcade golf launcher in three.js. Press
Space or click once to lock the launch angle on the glowing arc, press again to hit the golden
power sweet-spot, then hold in mid-air to fire the rocket boost (or tap near the ground / press ↓
for a super-bounce dive). Rocket seamlessly from the sunny tee meadow through fluffy clouds,
hot-air balloons, biplanes, blimps, stratosphere aurora, and outer space filled with bouncy UFOs,
satellites, asteroids, ringed planets, and Moon/Mars milestones. Earn coins for Club Power, Rocket
Fuel, Bounciness, and Coin Magnet/Lucky Boosts upgrades plus five unlockable 3D golf balls.

**أصابع البرق (Lightning Fingers)** is a typing game for children. Pick «عربي» or «English», then type
the word on a cloud before it reaches the little town: the first letter picks the cloud, the next
key always glows on an on-screen copy of the school keyboard (Latin and Arabic legends), and a
finished word is zapped by a friendly lightning bolt into a rainbow. A wrong key only shakes the
cloud (no Backspace needed); hamza forms are accepted, the B key's «لا» counts, and keys still
count when the PC's input language is the other one. Five worlds per language (letters; 3-letter,
4-letter and longer words; short phrases), four levels each with 1–3 stars; speed is shown as an
animal from a snail to a rocket. «اختبار السرعة» is a 30 s or 60 s test with Monkeytype's WPM and
accuracy formulas, a personal best and a history chart. For a class race, click **تحدٍّ للصف** →
«للمعلم: رمز جديد», pick a test and write the 4-digit code on the board; every student who types
that code gets exactly the same words.

**مغامرة الكيبورد (Keyboard Obby)** is a 3D obby on a giant copy of the school's Dell Arabic
keyboard, floating over a jelly sea. Press the glowing key and Zarroor (زرّور), a little keycap with
feet, hops onto it (keys are matched by position, so either input language works); a wrong key only
makes him wobble. Crumbling and sinking keys, bumper bars and slowly rising jelly add pressure, but a
fall just bounces him back to the last checkpoint, and after three falls in one place the hazards
ease off. Five worlds (home row, top row, bottom row, digits, whole keyboard with words) and 29
levels in «عربي» or «English»; a small keyboard at the bottom always lights the next key. Coins
buy colours and hats.

**حديقة الكلمات (Word Garden)** is a spelling game: a picture and its word with a glowing gap; type
the missing letter and a flower grows in the garden. The school keyboard is always on screen and the
right key lights up after a short wait (at once after two wrong tries). Five worlds per language
(«عربي» or «English») go from the first or last letter to middle letters, two letters, whole words
and two-word phrases; for the youngest tiers hamza forms, ة/ه and ى/ي count as the same letter, and
the B key's «لا» counts. Seeds buy plants and decorations for the garden screen.

**مصنع الاختصارات (Shortcut Factory)** is a 3D toy factory in Three.js that teaches real computer
keyboard shortcuts. Toys ride a conveyor belt beneath a friendly robot arm toward delivery boxes with
picture orders: click or use arrows to select a toy, then press real `Ctrl+C` (copy to hologram
clipboard), `Ctrl+V` (paste onto the belt), `Ctrl+X` (cut), `Delete` (recycle broken toys),
`Ctrl+Z` / `Ctrl+Y` (undo/redo and foil the cheeky gremlin), `Ctrl+A` (select all), and `Ctrl+S`
(seal a finished box). Twelve levels across three factory halls introduce one shortcut at a time with
a glowing on-screen keyboard and ghost hand hint, plus an endless Rush mode, robot-arm skins, and
`Kit.dda` pacing. Shortcuts work by physical key position (Arabic/English layouts) and never use
browser-reserved keys such as Ctrl+W.

**ابحث وكبّر (Seek & Zoom)** is a hidden-object game with an always-visible movable magnifying glass
over a fixed full-screen world. Five busy scenes drawn in code (park, market, beach, toy room, space
station) list things to find as pictures with short words: move the magnifying glass to inspect,
scroll the wheel to magnify under the pointer, and click to find. The first rounds have large targets
on the full scene, later ones tiny things in crowds, moving animals, and toy boxes and hatches that
open inside the lens; the space station has timed rounds. The wheel never scrolls or zooms the page;
+ / − and arrow keys work too, a lightbulb button gives instant hints, and stickers go into a sticker book.

**سلك الشرارة (Steady Hand)** trains careful mouse control: press on a glowing spark and drag it
along neon wire tracks to light a lamp. Touching the edge gives a funny "bzzt" and sends it back to
the last lantern (never game over); letting go, leaving the window or pausing just drops it safely,
and a fast flick cannot jump through a wall. Ten worlds of six levels (60 tracks): gentle curves,
zigzags (and levels where the spark follows the mouse without pressing), sliding gates and turning
bars, doors that open with a click or Space and stretches where the button must be held, a tower
finale, then five expansion worlds adding variable-width corridors, patrolling shock orbs,
switch-opened energy barriers (permanent and timed), a laboratory mashup, and a galaxy finale.
Coins buy spark colours and trails.

**بوابات الحساب (Math Gates)** is a three-lane crowd runner for practising math. A crowd of candy
runners runs by itself; ← → or A / D (or the mouse) change lane. Rows of three gates (+ − × ÷, later
two-step gates) change the crowd's number, which is always shown, and exactly one gate is best;
question rows like «7 + 5 = ?» have three answer gates, and a wrong answer shows the right one. At
the finish the crowd meets a rival crowd in a number battle, then climbs a bonus staircase for
coins. Five worlds: + and − to 20, to 100, multiplication, division, and everything mixed; results
are always whole numbers and the difficulty follows the PC's results like the other games.

**ضربة الطلاء (shooter)** is a first-person arena game in the style of Krunker / Shell Shockers,
made school-friendly: toy paint blasters, cute round "splat buddies", and paint splats instead of
anything violent. Free-for-all or 5 v 5 teams against bots (easy / normal / hard) on three maps,
with coins to unlock colours and hats. Click the game to capture the mouse; Esc gives it back
and pauses.

**مقلاع الألوان (Splat Catapult)** is a physics slingshot game. Pull back a water-paint balloon with
the mouse (or aim with the arrows and hold Space) to topple cardboard, wood and stone forts and
splat the cheeky paint-gremlins inside; click or press Space in mid-air to trigger special trick
balloons (three-way split, heavy drop, bouncy rubber and rainbow splash). Four worlds of four levels
scale trajectory guide length and fort sturdiness to the PC (`Kit.dda`), and two classmates can take
turns in a hotseat fort duel on the same PC. Coins buy balloon skins and slingshot frames.

**مطبخ الفسحة (Recess Kitchen)** is a sunlit 3D isometric cooperative school-canteen rush for one or
two players. Picture order tickets line the top bar (burgers, cheeseburgers, fresh salads, crispy
fries, pizza slices and fruit juice): grab ingredients from crates, chop on animated cutting boards,
sizzle on stoves with a forgiving burn-warning grace window, blend fresh fruit juice, assemble onto
plates and serve through the conveyor window in combo streaks. Nine handcrafted kitchens across three
canteens plus Endless Rush can be played solo (arrows/WASD + Space/E + Shift/Q dash, paced by
`Kit.dda`) or by two chefs sharing one keyboard (WASD + Space/E + Q and Arrows + Enter/. + /). Stars
and coins unlock colorful aprons and chef hats.

**سباق المكاتب (Desk Karts)** is a sunlit 3D three.js Micro Machines-style toy kart racer across giant
school desks. Race chunky toy karts with spinning wheels, bobbing helmets, Blue/Gold drift mini-turbos
and exhaust flames around yellow pencil and wooden ruler barriers, stacked textbook jump ramps, bouncy
pink erasers, glossy ink-spill puddles and golden boost pads across six 3-lap circuits in two cups
(Math Desk, Art Table, Science Bench, Library Stack, Geometry Loop, Principal's Mega Desk). Solo play
uses an elevated overhead chase camera (`↑↓←→` / `WASD` + `Space`/`Shift` drift & items) against
`Kit.dda`-tuned CPU racers; local 2P shares one keyboard (`WASD` + `Space` vs Arrows + `Enter`/`/`)
with a smooth framing zoom camera and automatic catch-up warp. Stars and coins unlock 4 kart bodies
and 6 vibrant paints.

**قلعة الألعاب (Toy Castle)** is a 3D three.js tabletop toy-diorama tug-of-war battle game. Two
colourful plastic-brick castles face each other across Playroom Carpet, Block Castle, and Space Desk
arenas while energy refills automatically: summon Foam Knights, Toy Blasters, Wind-Up Dino Tanks and
towering Mega Mechs with `1–4` (or `Q/W/E/R` or clicks), and aim each castle's top-mounted Cork Cannon
with the mouse or `A`/`D` + `Space` to bonk rival squads and pop floating parachute energy crates.
Nine short campaign battles across three worlds feature crowned bosses, 1–3 stars, coins, unlockable
castle paints & roof toppers and `Kit.dda` scaling, plus symmetric two-player local battles on one
keyboard (`1–4`/`Q–R`, `A`/`D`, `S`/`Space` vs `7–0`/`U–P`, `←`/`→`, `↓`/`Enter`).

**القلم السحري (Magic Crayon)** is a 2.5D three.js physics puzzle set inside sunny toy dioramas.
Draw chunky 3D waxy crayon tubes with the mouse — Bridge (`1`), Turbo Boost (`2`), and Spring
Bounce (`3`) — then press `Space` to launch a smiling 3D toy monster truck over gaps, ramps, crates,
bumpers and hazards to grab three spinning stars and reach the waving checkered flag. Undo (`Z` or
right-click) and instant restart (`R`) support experimenting across 21 handcrafted levels in three
themed worlds (Notebook Desk, Playroom Blocks and low-gravity Space Poster), with adaptive ink and
gravity assist (`Kit.dda`) and six unlockable 3D monster truck skins.

**سلّة الفواكه (Juicy Drop)** is a 2.5D Suika-style physics merge puzzle rendered in Three.js inside a
sunny kitchen scene. Move the cute smiling cloud with the mouse or ← → and click or press Space to
drop glossy 3D fruits with faces into a glass jar: matching fruits pop together into the next bigger
fruit all the way to the giant watermelon, while merge combos earn lightning charges (`S`) that pop
the smallest fruits to free space. Includes next-fruit preview, fruit-wheel guide, unlockable jar
skins, best-score celebration, and `Kit.dda` pacing.

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

- each game is **one file** instead of 6–13 (with `three.min.js` and `shared/artkit.js` shared
  once across the games that use them), and the home page is one file with all pictures built in,
  so a slow hard disk has far fewer files to read;
- after the first visit, every PC keeps the whole site in an **offline cache**: games open
  without asking the server, still work if the internet drops, and after an update each PC
  downloads only the files that changed;
- it can be **installed as an app** (the install icon in Chrome/Edge's address bar);
- it is also published as **one ZIP** for PCs without internet (see
  [Running it without the internet](#running-it-without-the-internet)).

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

Download the fast version as one ZIP file (under 3 MB):
**<https://farmercarry.github.io/school-games/school-games-offline.zip>**
(a copy of the site published from your own account has it at
`https://<your-username>.github.io/school-games/school-games-offline.zip`).

1. Right-click the downloaded file → **Extract All…** (Arabic Windows: **استخراج الكل…**) →
   **Extract**. Do not open `index.html` from inside the ZIP window: Windows then opens
   that one file on its own, and the games cannot load.
2. Windows extracts into a new folder named after the file, `school-games-offline`, and
   opens it. Inside it, open the `school-games` folder and double-click `index.html`.

Everything works straight from the `school-games` folder, without internet or installation.
You can copy that folder to other PCs, a USB stick or a shared drive.

**Updating:** the folder never updates itself. For new games and fixes, delete the old ZIP
and the old `school-games-offline` folder, then download and extract the ZIP again as above,
so the games are back in the same place. (If the old ZIP is still there, the new download
and its folder get ` (1)` added to their names.) Replace any copies of the `school-games`
folder on other PCs, USB sticks or shared drives with the new one too.
Saved progress stays, because the browser keeps it, not the folder.
The ZIP is part of the fast version, so it is there only while GitHub Pages publishes it.

For developers, GitHub's **Code → Download ZIP** gives the editable source instead. It also
runs from a folder, but each game loads several separate files (slower on slow hard
disks), and it includes the development tools and documentation.

## Managing games

The home page puts recent games and favorites first. The extra filters show short
rounds, one-button games, or games for friends. `roundMinutes` in the catalog is an
estimate for choosing a game, not a time limit; `inputStyle` describes its controls.
Returning from a game restores the originating tile and browsing position.

The topbar 🔊 button mutes the portal and the games. Games pause when focus leaves their
playing window, including Shift+Tab back to the portal and leaving fullscreen; Resume is
explicit.

The fast site's footer shows whether every file is verified for offline use.
“جاهز دون إنترنت” means the active version is complete; an incomplete installation
or cleared cache offers Retry. Keep the first visit open until it is ready. A
downloaded folder instead reports that it is running locally. Each file's bytes are
hashed when it is cached; later visits only confirm that every verified file is
still there, so slow disks are not re-read on every visit. Retry hashes them again.

When a newer complete version is cached, tabs on the games list reload into it automatically; running or paused games and game menus keep
their session uninterrupted, then reload automatically as soon as the player returns to
the games list. Before reloading, the controller verifies cache completeness again and
defers if a game opened during that check. It also works offline. The first installation
never triggers an update reload. A game-only update includes the changed game and the
portal's new build identity.

A game is never reloaded by itself. Between rounds (after a round ends, on the game's own
menus, or in a game that has no rounds) the game bar under it shows a yellow
«✨ نسخة جديدة! اضغط للتحديث 🔄» button; it hides again as soon as a round starts. A tap
reloads the page, which opens the same game again in the new version. Games tell the
portal when a round starts and ends through `Kit.stats.round` / `Kit.stats.end`.

Lab PCs often keep one tab open all day, and a cache between the school and the site can
keep handing out an old `sw.js`. So while the portal is visible it asks for the newest
version every 10 minutes (and on focus, at most every 2): the offline worker fetches the
site's own `version.json`, written by the build, past every cache. When it differs from
the PC's version the browser checks `sw.js`; if that still brings nothing new, the worker
is fetched again at `sw.js?v=<version>`, an address no cache can hold yet, and the PC keeps
that address. Nothing is sent, and no other server is asked.

See [Performance evidence and measurement](docs/PERFORMANCE.md) for retained/reverted
experiments, exact byte costs, reproducible measurement commands and timing limits.

Critter Mart and Pizza Empire show a persistent warning if saving is blocked or
storage is full. Retry keeps the current session and clears the warning only after
the pending data is saved. Block World's final celebration survives a reload until
the player acknowledges it.

### Sound

There is no background music anywhere: no menu or game music, loops or jingles. Every
sound is a short effect made in code when something happens (a pop, a jump, a reward),
from the shared juice engine (`shared/juice.js`) or the game's own synthesizer. The 🔊
button mutes everything. `tools/tests/zero-bgm.test.mjs` checks every game's title and pause
screens for silence.

Everything the home page shows comes from **`js/catalog.js`**:

- **Hide a game:** add `hidden: true` to its entry.
- **Feature a game** first in the catalog: set `hot: true`.
- **Rename the site:** change `name` in `window.SITE` (currently "ألعاب الفسحة").

## For developers

```
index.html, css/, js/     the portal (plain HTML/CSS/JS, no build step)
js/catalog.js             list of games, categories and site name
js/offline.js             the fast build's offline cache controller (footer status, update prompt)
js/telemetry.js           the only network sender: anonymous play statistics to the school's server (off without an address)
games/<slug>/             one folder per game (index.html + thumb.svg + its own files)
shared/kit.js             tiny helper library all games use (sound, saving, input, scaling, lifecycle,
                          difficulty control Kit.dda, play statistics Kit.stats and Kit.track)
shared/juice.js           procedural sound effects (Kit.juice in games, Juice in the portal)
shared/artkit.js          2D cartoon drawing kit (Kit.art; kept as one shared file in the fast build)
shared/game.css           shared game page styles + the Fredoka font
lib/three/                three.js r159 (MIT) for the 3D games
docs/ARCHITECTURE.md      the platform contract: runtime, Kit, the portal, sound, difficulty
docs/GAME_SPEC.md         the rules every game follows
docs/PERFORMANCE.md       size limits per game, slow-disk rules and how the fast build is measured
docs/TELEMETRY.md         the anonymous play statistics: when they are sent, the exact fields, turning them on or off
tools/playtest.mjs        headless Chromium playtest harness (Playwright)
tools/build.mjs           builds the fast version (one file per game + offline cache + offline ZIP)
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
npm run test:tooling             # test server, report and audio-probe helper checks
npm run test:scenarios           # prove inert Start/Pause buttons or input fail the gameplay checks
npm run test:classroom           # downloaded folder, Arabic/spaced paths, denied storage
npm run test:regressions         # additional gameplay and portal keyboard checks
npm run check                   # smoke-test all source games
npm run build                   # fast build into _site/ (the Pages artifact, with the offline ZIP)
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
world. The Windows Edge job checks the downloaded source and the offline ZIP of the
fast build, unzipped with PowerShell, including denied browser storage, and must pass
before deployment.

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
The generated ownership marker and the offline ZIP are excluded from the offline cache.
The ZIP (`tools/lib/zip.mjs`, no library) holds every other built file except `.nojekyll`
inside one `school-games/` folder, with fixed dates, so unchanged builds give the same bytes.

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
balance thresholds. On every change CI runs the Sneaky Levels, Maze Dash, Fire & Ice,
Skybound Golf and Cake Guards verifiers, and Swing Hook and Block Burst on one level
(`tools/tests/level-verifiers.test.mjs`). Block Burst's full balance check (about 4
minutes) runs on every push to `main`, and on pull requests that change `games/block-burst/`
or the workflow:

```
node games/swing-hook/verify-levels.js
node games/block-burst/verify-levels.js
node games/cake-guards/verify.js
node games/block-burst/verify-levels.js --report-balance
```

The last command reports balance thresholds as warnings while still failing invalid boards
and levels with no successful smart-bot runs. All current levels pass the default check;
report mode is useful while changing levels, to see every threshold without treating a
warning as proof that a level is impossible.

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

- Games, art, sounds and site: original work made for this project. أصابع البرق computes
  its speed-test results with the same published rules as Monkeytype (WPM and accuracy),
  so students' scores are comparable; the code is our own.
- [three.js](https://threejs.org) r159, MIT license (`lib/three/LICENSE`).
- Fredoka font (Latin) and Baloo Bhaijaan 2 font (Arabic), SIL Open Font License
  (`shared/fonts/LICENSE-*.txt`).

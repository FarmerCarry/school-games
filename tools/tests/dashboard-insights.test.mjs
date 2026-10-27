// The dashboard's insight rules (server/dashboard/insights.js): thresholds, ranking,
// suppressed groups never described, both languages, empty data; and demo.json keeps
// the server's KPI and live shapes. Pure Node: insights.js and i18n.js are plain
// browser scripts, loaded here in a vm context with a stand-in window.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboard = path.join(repo, 'server/dashboard');

// In this realm (so arrays compare with deepStrictEqual), with `window` as a parameter.
function loadScripts(...files) {
  const window = {};
  for (const file of files) {
    vm.runInThisContext('(function (window) {' + fs.readFileSync(path.join(dashboard, file), 'utf8') + '\n})', { filename: file })(window);
  }
  return window;
}
const I = loadScripts('insights.js').SGInsights;
const TEXT = loadScripts('insights.js', 'i18n.js').SGDashText;

const ARABIC = /[؀-ۿ]/;
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
const LATIN_WORD = /[A-Za-z]{2,}/;
const strip = text => text.replace(/[⁦-⁩]/g, '');

// ---- a small hand-made KPI answer in the documented shape ------------------------
const codes = (w, l, q, d = 0, e = 0) => ({ w, l, d, e, q });
function game(slug, { opens = 40, sessions = 30, starts = 100, c = codes(60, 30, 10), smooth = 0.9, loadMs = 900, il = [80, 10, 5, 3, 1, 1],
  errors = { t: 0, x: 0, l: 0 }, playsBefore = [20, 5, 5, 5, 5] } = {}) {
  const wl = c.w + c.l;
  return {
    slug, sessions, opens, closes: opens, engagedMinutes: opens * 2, avgEngagedSecPerOpen: 120,
    rounds: { starts, ends: starts, codes: c },
    completionRate: starts ? Math.round(c.w / starts * 1e4) / 1e4 : null, winRate: wl ? Math.round(c.w / wl * 1e4) / 1e4 : null,
    dropOffRate: starts ? Math.round(c.q / starts * 1e4) / 1e4 : null, avgTier: null, hits: 0, misses: 0, accuracy: null,
    rt: [0, 0, 0, 0, 0, 0], il, frames: { counts: [smooth * 1000, (1 - smooth) * 1000, 0, 0], smoothShare: smooth, stallShare: 0 },
    loads: opens, avgLoadMs: loadMs, errors, sources: { catalog: opens }, replay: { replayIndex: [starts, 0, 0, 0, 0, 0], playsBefore }
  };
}
function level(slug, id, starts, quits, sessions = 10) {
  return { slug, id, sessions, starts, ends: starts, codes: codes(starts - quits, 0, quits), completionRate: (starts - quits) / starts,
    winRate: 1, dropOffRate: Math.round(quits / starts * 1e4) / 1e4, avgMs: 30000, avgTier: null };
}
function sample(overrides = {}) {
  const games = [
    game('alpha', { opens: 120, sessions: 80, c: codes(30, 60, 10) }),                       // win 33 %: too hard
    game('bravo', { opens: 90, sessions: 60, c: codes(95, 2, 3), playsBefore: [10, 20, 20, 20, 20] }), // too easy, comes back 89 %
    game('charlie', { opens: 60, sessions: 40, c: codes(0, 0, 10, 0, 90) }),                 // endless: no winner
    game('delta', { opens: 60, sessions: 45, smooth: 0.7, loadMs: 4200, errors: { t: 4, x: 0, l: 0 } }), // PC problems
    { slug: 'secret', suppressed: true }
  ];
  return {
    v: 1, range: { from: '2026-10-01', to: '2026-10-21', days: 21, band: 'all' }, minSessions: 3,
    totals: { sessions: 300, engagedMinutes: 2000, avgEngagedMinutesPerSession: 6.67, gameOpens: 330, roundsStarted: 400, roundsEnded: 400,
      levelUps: 10, errors: 4, players: { sessionStarts: 300, newProfiles: 10, guests: 20, profileAge: [1, 1, 1, 1], daysSinceLast: [1, 1, 1, 1, 1] } },
    daily: Array.from({ length: 21 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, sessions: i < 14 ? 10 : 15, engagedMinutes: 50, opens: 12 })),
    games,
    levels: [
      level('alpha', 'L2', 40, 16), level('alpha', 'L10', 40, 16), level('bravo', 'L1', 50, 20), level('delta', 'L3', 19, 15),
      level('charlie', 'endless', 100, 10), { slug: 'secret', id: 'L1', suppressed: true }
    ],
    bands: [
      { band: '6-7', sessions: 100, opens: 120, engagedMinutes: 700, games: [
        { slug: 'alpha', sessions: 30, opens: 40, share: 0.3333, avgTier: null, completionRate: 0.1, winRate: 0.12, dropOffRate: 0.2 },
        { slug: 'bravo', sessions: 20, opens: 30, share: 0.25, avgTier: null, completionRate: 0.9, winRate: 0.93, dropOffRate: 0.03 },
        { slug: 'secret', suppressed: true }
      ] },
      { band: '8-9', suppressed: true },
      { band: '10-11', sessions: 90, opens: 100, engagedMinutes: 600, games: [
        { slug: 'bravo', sessions: 40, opens: 50, share: 0.5, avgTier: null, completionRate: 0.97, winRate: 0.99, dropOffRate: 0.01 },
        { slug: 'delta', sessions: 2 }
      ] }
    ],
    sources: [{ src: 'catalog', sessions: 300, opens: 330 }],
    devices: {
      cores: [{ value: 1, suppressed: true }, { value: 2, sessions: 50, frames: { counts: [70, 30, 0, 0], smoothShare: 0.7, stallShare: 0 }, il: [1, 0, 0, 0, 0, 0], avgLoadMs: 2000 },
        { value: 8, sessions: 80, frames: { counts: [92, 8, 0, 0], smoothShare: 0.92, stallShare: 0 }, il: [1, 0, 0, 0, 0, 0], avgLoadMs: 900 }],
      memory: [], screen: []
    },
    modes: [{ mode: 'web', sessions: 300 }],
    ...overrides
  };
}
const NAMES = { alpha: 'Alpha Run', bravo: 'Bravo Hop', charlie: 'Charlie Dash', delta: 'Delta Drive', secret: 'Secret Game' };
const AR_NAMES = { alpha: 'جري ألفا', bravo: 'قفز برافو', charlie: 'اندفاع تشارلي', delta: 'قيادة دلتا', secret: 'لعبة سرية' };
const opts = lang => ({ lang, name: slug => (lang === 'ar' ? AR_NAMES : NAMES)[slug] || slug, today: '2026-10-21' });

test('the difficulty verdict follows the documented thresholds', () => {
  assert.deepEqual({ ...I.T }, {
    MIN_SESSIONS: 3, MIN_TRIES: 20, MIN_SESSIONS_NO_TRIES: 5, HARD_WIN: 0.4, HARD_QUIT: 0.3, EASY_WIN: 0.9, EASY_QUIT: 0.1,
    HARD_COMPLETION: 0.3, EASY_COMPLETION: 0.85, STUCK_MIN_TRIES: 20, STUCK_RATE: 0.25, RETURN_MIN_OPENS: 20, RETURN_RATE: 0.5,
    FAIL_MIN_OPENS: 20, FAIL_RATE: 0.03, SLOW_LOAD_MS: 3000, SLOW_LOAD_MIN: 10, CHOPPY_SMOOTH: 0.8, SLOW_INPUT: 0.1,
    DEVICE_MIN_SESSIONS: 10, DEVICE_GAP: 0.05, TREND_DAYS: 7, TREND_MIN: 20, TREND_CHANGE: 0.1
  });
  const v = cell => I.verdict({ tries: 20, sessions: 10, winnable: true, ...cell }).code;
  assert.equal(v({ tries: 19, winRate: 0.1, dropOffRate: 0.5 }), 'few', 'fewer than 20 tries: no verdict');
  assert.equal(v({ winRate: 0.39, dropOffRate: 0 }), 'hard');
  assert.equal(v({ winRate: 0.40, dropOffRate: 0.29 }), 'right');
  assert.equal(v({ winRate: 0.70, dropOffRate: 0.30 }), 'hard', '30 % left unfinished is too hard');
  assert.equal(v({ winRate: 0.90, dropOffRate: 0.09 }), 'easy');
  assert.equal(v({ winRate: 0.90, dropOffRate: 0.10 }), 'right');
  assert.equal(v({ winRate: 0.89, dropOffRate: 0 }), 'right');
  assert.equal(v({ winRate: null, dropOffRate: 0.31 }), 'hard', 'every finished round was a quit');
  assert.equal(I.verdict({ tries: 30, winnable: true, winRate: null, dropOffRate: 0.31 }).basis, 'quit');
  assert.equal(v({ winRate: null, dropOffRate: 0.1 }), 'none');
  assert.equal(v({ winnable: false, winRate: null, dropOffRate: 0.9 }), 'none', 'endless and two-player games are not rated');
  assert.equal(I.verdict({ suppressed: true }).code, 'hidden');
  assert.equal(I.verdict(null).code, 'missing');
  // An older server: only the completion rate for an age group, and no tries.
  const c = cell => I.verdict({ tries: null, winnable: true, ...cell }).code;
  assert.equal(c({ sessions: 4, completionRate: 0.1 }), 'few', 'fewer than 5 play sessions when tries are unknown');
  assert.equal(c({ sessions: 5, completionRate: 0.29 }), 'hard');
  assert.equal(c({ sessions: 5, completionRate: 0.30 }), 'right');
  assert.equal(c({ sessions: 5, completionRate: 0.85 }), 'easy');
  assert.equal(I.verdict({ tries: null, sessions: 9, winnable: true, completionRate: 0.5 }).basis, 'completion');
});

test('rankings are deterministic: a number first, then the slug and the id', () => {
  const stuck = I.stuckLevels(sample()).rows.map(l => l.slug + ' ' + l.id);
  // 40 % for three levels: more quits first, then by slug and natural level order; delta L3 has 19 tries.
  assert.deepEqual(stuck, ['bravo L1', 'alpha L2', 'alpha L10', 'charlie endless']);
  assert.equal(I.stuckLevels(sample()).hidden, 1);
  const shuffled = sample({ games: sample().games.slice().reverse(), levels: sample().levels.slice().reverse() });
  assert.deepEqual(I.stuckLevels(shuffled).rows, I.stuckLevels(sample()).rows);
  // charlie and delta both have 60 opens: more play sessions first.
  assert.deepEqual(I.favourites(shuffled).rows.map(g => g.slug), ['alpha', 'bravo', 'delta', 'charlie']);
  assert.deepEqual(I.favourites(shuffled).rows.map(g => g.slug), I.favourites(sample()).rows.map(g => g.slug));
  const tie = sample({ games: [game('zulu', { opens: 50, sessions: 10 }), game('yankee', { opens: 50, sessions: 10 }), game('xray', { opens: 50, sessions: 12 })] });
  assert.deepEqual(I.favourites(tie).rows.map(g => g.slug), ['xray', 'yankee', 'zulu']);
  assert.deepEqual(I.returning(sample(), 20).rows[0].slug, 'bravo');
  assert.equal(Math.round(I.returning(sample(), 20).rows[0].share * 100), 89);
  // The grid puts problems first: too hard, then too easy, then the rest.
  const grid = I.difficultyGrid(sample());
  assert.deepEqual(grid.rows.map(r => [r.slug, r.verdict.code]), [['alpha', 'hard'], ['bravo', 'easy'], ['delta', 'right'], ['charlie', 'none']]);
  assert.deepEqual(grid.rows[0].cells, {
    '6-7': I.verdict({ tries: null, sessions: 30, winRate: 0.12, dropOffRate: 0.2, completionRate: 0.1, winnable: true }),
    '8-9': { code: 'hidden' }, '10-11': { code: 'missing' }
  });
  assert.equal(grid.rows[1].cells['10-11'].code, 'easy');
  assert.equal(grid.rows[2].cells['10-11'].code, 'hidden', 'a 2-session group without "suppressed" is still never judged');
});

test('a suppressed group is never described, ranked or counted', () => {
  // Even a malformed answer that carries numbers next to "suppressed" changes nothing.
  const leaky = sample();
  leaky.games[4] = { slug: 'secret', suppressed: true, opens: 9999, sessions: 2, rounds: { starts: 999, codes: codes(0, 999, 0) }, winRate: 0, dropOffRate: 0.9 };
  leaky.levels[5] = { slug: 'secret', id: 'L1', suppressed: true, starts: 999, codes: codes(0, 0, 999), dropOffRate: 1 };
  leaky.bands[1] = { band: '8-9', suppressed: true, games: [{ slug: 'alpha', sessions: 50, opens: 50, share: 1, winRate: 0, dropOffRate: 1 }] };
  leaky.devices.cores[0] = { value: 1, suppressed: true, sessions: 2, frames: { smoothShare: 0.1 } };
  for (const lang of ['en', 'ar']) {
    const all = I.insights(leaky, opts(lang)).map(s => strip(s.text)).join('\n');
    assert.ok(all.length > 0);
    for (const word of ['Secret Game', 'لعبة سرية', 'secret', '9999', '999', '8–9', '1 core', 'نواة واحدة']) assert.ok(!all.includes(word), lang + ' mentions ' + word + ':\n' + all);
  }
  assert.ok(!I.favourites(leaky).rows.some(g => g.slug === 'secret'));
  assert.equal(I.favourites(leaky).hidden, 1);
  assert.ok(!I.stuckLevels(leaky).rows.some(l => l.slug === 'secret'));
  assert.ok(!I.difficultyGrid(leaky).rows.some(r => r.slug === 'secret'));
  assert.equal(I.difficultyGrid(leaky).rows.find(r => r.slug === 'alpha').cells['8-9'].code, 'hidden');
  assert.deepEqual(I.favouritesByBand(leaky)[1], { band: '8-9', hidden: true, rows: [], hiddenGames: 0, more: 0 });
  assert.ok(!I.returning(leaky).rows.some(r => r.slug === 'secret'));
  assert.equal(I.returning(leaky).opens, 210, 'hidden games add nothing to the overall share');
  assert.deepEqual(I.pcHealth(leaky).devices.cores[0], { value: 1, hidden: true });
  assert.ok(!I.pcHealth(leaky).rows.some(r => r.slug === 'secret'));
  // A hidden day stops the trend sentence rather than being read as zero.
  const days = sample();
  days.daily[16] = { day: days.daily[16].day, suppressed: true };
  assert.ok(!I.insights(days, opts('en')).some(s => s.kind === 'trend'));
  assert.ok(I.insights(sample(), { ...opts('en') }).length <= 5);
  // Totals hidden: one sentence, about privacy only.
  for (const lang of ['en', 'ar']) {
    const hidden = I.insights(sample({ totals: { suppressed: true } }), opts(lang));
    assert.equal(hidden.length, 1);
    assert.equal(hidden[0].kind, 'hidden');
    assert.match(hidden[0].text, lang === 'ar' ? /أقل من 3 أطفال/ : /Fewer than 3 children/);
  }
});

test('the sentences: at most five, one kind at a time, in the documented order', () => {
  const en = I.insights(sample(), opts('en'));
  assert.deepEqual(en.map(s => s.kind), ['stuck', 'hard', 'favourite', 'health', 'returning']);
  assert.equal(en[0].text, 'Children leave Bravo Hop level 1 unfinished in 40% of tries (20 of 50).');
  assert.equal(en[1].text, 'Alpha Run looks too hard for children aged 6–7: they win 12% of the rounds they finish and leave 20% of their rounds unfinished.');
  assert.equal(en[2].text, 'Alpha Run is the most opened game: 120 opens, 36% of all game opens.');
  assert.equal(en[3].text, 'Delta Drive failed to start 4 times (7 in every 100 opens).');
  assert.equal(en[4].text, 'Children come back to Bravo Hop the most: 89% of its opens are by children who played it before.');
  assert.deepEqual(I.insights(sample(), opts('en')), en, 'the same input gives the same sentences');
  // Without the first kinds, the later ones (trend, too easy, each age group's favourite) come in.
  const quiet = sample({ levels: [] });
  quiet.games[0] = game('alpha', { opens: 120, sessions: 80 });
  quiet.bands[0].games[0] = { ...quiet.bands[0].games[0], winRate: 0.7, dropOffRate: 0.1 };
  const kinds = I.insights(quiet, opts('en')).map(s => s.kind);
  assert.deepEqual(kinds, ['favourite', 'health', 'returning', 'trend', 'easy']);
  const trend = I.insights(quiet, opts('en')).find(s => s.kind === 'trend');
  // Today (21 October) is left out: 14-20 October against 7-13 October.
  assert.equal(trend.text, 'Play sessions went up 43% in the last 7 full days compared with the 7 days before (100 against 70).');
  // The band filter: sentences speak of that age group.
  const band = sample({ range: { ...sample().range, band: '10-11' } });
  const banded = I.insights(band, opts('en'));
  assert.ok(banded.some(s => s.text.startsWith('Children aged 10–11 leave')), banded.map(s => s.text).join('\n'));
  assert.ok(banded.some(s => s.text.includes('most opened game for children aged 10–11')));
});

test('both languages: Arabic sentences are Arabic with Western digits, English ones are English', () => {
  const en = I.insights(sample(), opts('en')), ar = I.insights(sample(), opts('ar'));
  assert.equal(en.length, ar.length);
  assert.deepEqual(en.map(s => s.kind + s.key), ar.map(s => s.kind + s.key), 'the same findings in both languages');
  for (const s of en) assert.ok(!ARABIC.test(s.text), s.text);
  for (const s of ar) {
    assert.ok(ARABIC.test(s.text), s.text);
    assert.ok(!LATIN_WORD.test(strip(s.text)), 'no English words: ' + s.text);
    assert.ok(!ARABIC_INDIC_DIGITS.test(s.text), 'Western digits: ' + s.text);
    assert.match(s.text, /«⁨[^»]+⁩»/, 'a game name in guillemets, isolated');
  }
  assert.equal(strip(ar[0].text), 'يترك الأطفال المرحلة 1 من «قفز برافو» دون إكمال في 40% من المحاولات (20 من أصل 50).');
  assert.equal(strip(ar[1].text), 'تبدو لعبة «جري ألفا» صعبة جدًا على الأطفال بعمر 6–7 سنوات: يفوزون في 12% من الجولات التي يُنهونها، ويتركون 20% من جولاتهم دون إكمال.');
  assert.ok(ar[1].text.includes('⁦6–7⁩ سنوات'), 'the age range keeps its order inside Arabic text');
  assert.equal(strip(ar[3].text), 'تعذّر تشغيل «قيادة دلتا» 4 مرات (7 من كل 100 مرة فتح).');
  // Labels and Arabic counting.
  assert.equal(I.bandLabel('10-11', 'ar'), '⁦10–11⁩ سنة');
  assert.equal(I.bandLabel('8-9', 'en'), '8–9');
  assert.equal(I.levelLabel('w1-2', 'en'), 'world 1, level 2');
  assert.equal(I.levelLabel('L3', 'ar'), 'المرحلة 3');
  assert.equal(I.levelLabel('s4', 'en'), '4×4 board');
  assert.equal(I.levelLabel('cpu-hard', 'en'), 'round “cpu-hard”');
  assert.deepEqual([1, 2, 3, 10, 11, 100, 103, 2.5].map(n => I.arWord(n, ['a', 'b', 'c', 'd'])), ['a', 'b', 'c', 'c', 'd', 'd', 'c', 'd']);
  assert.deepEqual(I.duration(15215.8, 'ar'), { value: '254', unit: 'ساعة', text: '254 ساعة' });
  assert.deepEqual(I.duration(270, 'ar'), { value: '4.5', unit: 'ساعة', text: '4.5 ساعة' });
  assert.deepEqual(I.duration(5, 'ar').unit, 'دقائق');
  assert.deepEqual(I.duration(8.16, 'en'), { value: '8.2', unit: 'minutes', text: '8.2 minutes' });
  assert.deepEqual([0, 0.004, 0.5, 0.996, 1, null].map(I.pct), ['0%', '<1%', '50%', '>99%', '100%', '–']);
  assert.equal(I.int(1234567), '1,234,567');
  // Game names from the site's catalog.
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), { window });
  const bySlug = new Map(window.GAMES.map(g => [g.slug, g]));
  assert.equal(I.catalogName(bySlug.get('bubble-bop'), 'en'), 'Bubble Bop');
  assert.equal(I.catalogName(bySlug.get('dino-3d'), 'en'), 'Dino 3D');
  assert.equal(I.catalogName(bySlug.get('connect-four'), 'en'), 'Connect 4');
  assert.equal(I.catalogName(bySlug.get('fire-and-ice'), 'en'), 'Fire & Ice');
  assert.equal(I.catalogName(bySlug.get('merge-2048'), 'en'), '2048');
  assert.equal(I.catalogName(bySlug.get('bubble-bop'), 'ar'), 'فقاعات بوب');
  assert.equal(I.catalogName(undefined, 'en'), '');
  for (const g of window.GAMES) assert.ok(I.catalogName(g, 'en') && I.catalogName(g, 'ar'), g.slug);
});

test('the dashboard words exist in both languages', () => {
  const shape = value => typeof value === 'function' ? 'function' : Array.isArray(value) ? 'array' + value.length
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, shape(value[k])])) : typeof value;
  const keys = obj => Object.keys(obj).sort();
  assert.deepEqual(keys(TEXT.ar), keys(TEXT.en));
  for (const key of keys(TEXT.en)) {
    if (['games', 'levels', 'pcTypes'].includes(key)) continue; // counted nouns differ by language
    assert.deepEqual(shape(TEXT.ar[key]), shape(TEXT.en[key]), key);
  }
  for (const [key, value] of Object.entries(TEXT.ar)) {
    if (typeof value === 'string' && !['otherLang'].includes(key)) assert.ok(ARABIC.test(value), 'Arabic text for ' + key);
  }
  for (const lang of ['en', 'ar']) {
    const text = TEXT[lang];
    for (const k of [1, 2, 3, 11]) {
      for (const what of ['games', 'levels', 'pcTypes']) assert.match(text.moreHidden(k, text[what]), lang === 'ar' ? /أقل من 3 أطفال/ : /fewer than 3 children/);
    }
    assert.match(text.hiddenPrivacy, lang === 'ar' ? /أقل من 3 أطفال/ : /fewer than 3 children — hidden for privacy/);
    assert.equal(text.errNotSetSteps.length, 5);
  }
  assert.equal(TEXT.en.moreHidden(1, TEXT.en.games), '1 more game: fewer than 3 children — hidden for privacy.');
  assert.equal(TEXT.ar.moreHidden(2, TEXT.ar.pcTypes), 'نوعا جهاز آخران: أقل من 3 أطفال في كل منهما — مخفيان حفاظًا على الخصوصية.');
});

test('empty and missing data never throw', () => {
  for (const lang of ['en', 'ar']) {
    const none = I.insights(sample({ totals: { sessions: 0, engagedMinutes: 0, avgEngagedMinutesPerSession: null, gameOpens: 0 },
      games: [], levels: [], bands: [], daily: [] }), opts(lang));
    assert.equal(none.length, 1);
    assert.equal(none[0].kind, 'empty');
    assert.match(none[0].text, lang === 'ar' ? /لم يُسجَّل/ : /No play has been recorded/);
  }
  assert.deepEqual(I.insights(null, opts('en')), []);
  assert.deepEqual(I.insights({}, opts('en')), []);
  const bare = { totals: { sessions: 5, gameOpens: 0 } };
  assert.deepEqual(I.insights(bare, opts('en')).map(s => s.kind), ['quiet']);
  for (const fn of [I.favourites, I.favouritesByBand, I.stuckLevels, I.difficultyGrid, I.returning, I.pcHealth]) {
    assert.doesNotThrow(() => fn(bare));
    assert.doesNotThrow(() => fn(null));
  }
  assert.deepEqual(I.pcHealth(null).overall, { smooth: null, loadMs: null, slowInput: null, fails: null, failRate: null });
});

// ---- the real server: simulated sessions in a temporary database ----------------------
let dir, app, base, serverKpis = {}, serverLive;
const TOKEN = 'insights-test-token-0123456789';
const PERIODS = [1, 7, 30, 90], BANDS = ['all', '6-7', '8-9', '10-11'];
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dashboard-insights-'));
  const db = path.join(dir, 'kpi.db');
  const sim = spawnSync(process.execPath, [path.join(repo, 'server/simulate.mjs'), '--db', db, '--days', '21', '--sessions', '40', '--seed', '11'], { encoding: 'utf8' });
  assert.equal(sim.status, 0, sim.stderr);
  const { hideSqliteWarning } = await import('../../server/warnings.mjs');
  hideSqliteWarning();
  const { createApp } = await import('../../server/app.mjs');
  app = createApp({ dbPath: db, adminToken: TOKEN });
  base = 'http://127.0.0.1:' + (await app.listen(0, '127.0.0.1')).port;
  const get = async route => {
    const res = await fetch(base + route, { headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal(res.status, 200, route);
    return res.json();
  };
  const today = new Date().toISOString().slice(0, 10);
  for (const period of PERIODS) {
    const from = new Date(Date.parse(today) - (period - 1) * 86400000).toISOString().slice(0, 10);
    for (const band of BANDS) serverKpis[period + '|' + band] = await get(`/v1/admin/kpis?from=${from}&to=${today}` + (band === 'all' ? '' : '&band=' + band));
  }
  serverLive = await get('/v1/admin/live');
});
after(async () => {
  await app?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('on real server answers: at most five sentences, deterministic, only about groups that are shown', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), { window });
  const catalog = new Map(window.GAMES.map(g => [g.slug, g]));
  for (const [key, kpis] of Object.entries(serverKpis)) {
    const hidden = (kpis.games || []).filter(g => g.suppressed).map(g => g.slug);
    for (const lang of ['en', 'ar']) {
      const name = slug => I.catalogName(catalog.get(slug), lang) || slug;
      const list = I.insights(kpis, { lang, name, today: kpis.range.to });
      assert.ok(list.length >= 1 && list.length <= 5, key + ' ' + lang + ': ' + list.length);
      assert.deepEqual(I.insights(kpis, { lang, name, today: kpis.range.to }), list);
      const text = list.map(s => s.text).join('\n');
      for (const slug of hidden) {
        // A hidden game is named in no sentence (its name might be part of another's, so check the whole name in guillemets/at start).
        const shownNames = (kpis.games || []).filter(g => !g.suppressed).map(g => name(g.slug));
        if (!shownNames.some(n => n.includes(name(slug)))) assert.ok(!text.includes(name(slug)), key + ' names hidden ' + slug);
      }
      if (lang === 'ar') assert.ok(!ARABIC_INDIC_DIGITS.test(text));
    }
    const grid = I.difficultyGrid(kpis);
    assert.deepEqual(grid.rows.map(r => r.slug).sort(), kpis.games.filter(g => !g.suppressed).map(g => g.slug).sort());
    for (const r of grid.rows) {
      const g = kpis.games.find(x => x.slug === r.slug);
      assert.equal(r.tries, g.rounds.starts);
      if (r.verdict.code === 'hard' || r.verdict.code === 'easy' || r.verdict.code === 'right') assert.ok(g.rounds.starts >= I.T.MIN_TRIES);
    }
    for (const l of I.stuckLevels(kpis).rows) assert.ok(l.starts >= I.T.STUCK_MIN_TRIES);
  }
});

// Every key path of a value, arrays collapsed to [] ("games[].rounds.codes.w").
function paths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) { out.add(prefix + '[]'); for (const v of value) paths(v, prefix + '[]', out); }
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // Launch sources are only the non-zero ones, so their names are not part of the shape.
      const p = prefix ? prefix + '.' + (prefix.endsWith('sources') ? '*' : k) : k;
      out.add(p);
      paths(v, p, out);
    }
  }
  return out;
}

test('demo.json holds the server\'s own KPI and live answers for every filter', () => {
  const demo = JSON.parse(fs.readFileSync(path.join(dashboard, 'demo.json'), 'utf8'));
  assert.equal(demo.sample, true);
  assert.deepEqual(Object.keys(demo.kpis).sort(), Object.keys(serverKpis).sort());
  const known = new Set();
  for (const k of Object.values(serverKpis)) paths(k, '', known);
  for (const [key, kpis] of Object.entries(demo.kpis)) {
    const [period, band] = key.split('|');
    assert.equal(kpis.v, 1);
    assert.equal(kpis.range.days, Number(period), key);
    assert.equal(kpis.range.band, band, key);
    assert.deepEqual(Object.keys(kpis).sort(), Object.keys(serverKpis[key]).sort(), key + ': the same top-level fields');
    // Fields the server may add later are fine; a field the server does not have is not.
    for (const p of paths(kpis)) if (!p.endsWith('suppressed')) assert.ok(known.has(p), key + ': unknown field ' + p);
    assert.ok(kpis.totals.sessions > 0, key);
  }
  // The live view is in memory, so this database-filled server has none: its documented shape instead.
  assert.deepEqual(Object.keys(demo.live).sort(), Object.keys(serverLive).sort());
  const live = new Set(['v', 'windowSec', 'minSessions', 'total', 'total.sessions', 'total.suppressed', 'games', 'games[]',
    'games[].slug', 'games[].sessions', 'games[].suppressed']);
  for (const p of paths(demo.live)) assert.ok(live.has(p), 'live: ' + p);
  assert.ok(demo.live.total.sessions > 0);
});

// The dashboard's research maths (server/dashboard/research.js): weeks, quantiles from
// histograms, category sums, cohorts, paired same-student growth, persistence shares, the
// small-sample rule, labels, the code search and the teacher page's check character; the
// research sentences of insights.js in both languages; the game facts the tabs need
// (names.js: categories, players, input and what each game's code reports for every
// catalog game; scores.js: what the score means in each of the 28 score games); and the
// research download: dictionary.js (its columns equal server/export.mjs COLUMNS, and
// docs/RESEARCH_DATA.md is its own output), zip.js and export.js. Pure Node: the
// dashboard files are plain browser scripts, loaded in a vm context.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { COLUMNS } from '../../server/export.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dashboard = path.join(repo, 'server/dashboard');
function loadScripts(...files) {
  const window = {};
  for (const file of files) {
    vm.runInThisContext('(function (window) {' + fs.readFileSync(path.join(dashboard, file), 'utf8') + '\n})', { filename: file })(window);
  }
  return window;
}
const R = loadScripts('research.js').SGResearch;
const I = loadScripts('insights.js').SGInsights;
// The games site's catalog, in this realm too (so its arrays compare with deepStrictEqual).
const site = {};
vm.runInThisContext('(function (window) {' + fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8') + '\n})', { filename: 'catalog.js' })(site);
const strip = text => text.replace(/[⁦-⁩]/g, '');
const ARABIC = /[؀-ۿ]/, ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/, LATIN_WORD = /[A-Za-z]{2,}/;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' ≈ ' + b);

const STAT_COLUMNS = ['a', 'metric', 'slug', 'k1', 'k2', 'n', 'students', 'w', 'l', 'd', 'e', 'q', 'ms', 'wall_ms', 'win_ms', 'hits', 'misses',
  'rt_sum', 'rt_n', 'score_sum', 'score_n', 'tier_sum', 'tier_n', 'dda_sum', 'dda_n', 'inputs', 'gap_sum', 'gap_n'];
// One r_stat row from its named sums (the rest 0).
const row = (a, metric, slug, k1, k2, sums = {}) => STAT_COLUMNS.map(c => ({ a, metric, slug, k1, k2 })[c] ?? sums[c] ?? 0);
const stats = rows => ({ columns: STAT_COLUMNS, rows });

test('days and weeks follow the school\'s first weekday', () => {
  // 27 Oct 2026 is a Tuesday.
  assert.equal(R.weekdayOf('2026-10-27'), 2);
  assert.equal(R.weekOf('2026-10-27', 'sun'), '2026-10-25');
  assert.equal(R.weekOf('2026-10-27', 'mon'), '2026-10-26');
  assert.equal(R.weekOf('2026-10-25', 'sun'), '2026-10-25', 'a Sunday starts its own week');
  assert.equal(R.weekOf('2026-10-25', 'mon'), '2026-10-19');
  assert.deepEqual(R.weekdays('sun'), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(R.weekdays('mon'), [1, 2, 3, 4, 5, 6, 0]);
  // 1-30 Oct 2026: 30 days from a Thursday; Thursday, Friday and Saturday occur 5 times.
  assert.deepEqual(R.weekdayCounts('2026-10-01', '2026-10-30'), [4, 4, 4, 4, 5, 5, 4]);
  assert.deepEqual(R.weekdayCounts('2026-10-02', '2026-10-01'), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(R.weeksEnding('2026-10-27', 3, 'sun'), ['2026-10-11', '2026-10-18', '2026-10-25']);
  assert.equal(R.schoolYearStart('2026-10-27'), '2026-08-01');
  assert.equal(R.schoolYearStart('2027-03-05'), '2026-08-01');
  assert.equal(R.schoolYearStart('2026-08-01'), '2026-08-01');
  assert.equal(R.daysBetween('2026-10-01', '2026-10-27'), 26);
  assert.equal(R.shift('2026-12-31', 1), '2027-01-01');
});

test('the small-sample rule is the one insights.js uses: fewer than 5 students or 20 tries', () => {
  assert.deepEqual({ ...R.SMALL }, { students: I.T.SMALL_STUDENTS, tries: I.T.SMALL_TRIES });
  for (const [s, n] of [[4, 100], [5, 19], [5, 20], [null, null], [null, 5], [1, null], [0, 0]]) assert.equal(R.small(s, n), I.small(s, n), s + ' ' + n);
  assert.equal(R.small(4, null), true);
  assert.equal(R.small(5, null), false);
  assert.equal(R.small(null, 19), true);
});

test('student labels and the code search', () => {
  assert.equal(R.studentLabel({ u: '3f9a0c51e2b7', label: '3F9A' }, 'en'), 'Student ⁦3F9A⁩');
  assert.equal(R.studentLabel({ u: '3f9a0c51e2b7', label: '3F9A' }, 'ar'), 'الطالب ⁦3F9A⁩');
  assert.equal(R.studentLabel({ u: '3f9a0c51e2b7', label: '3F9A', kind: 'card' }, 'en'), 'Student ⁦3F9A⁩', 'there are no player cards: kind changes nothing');
  assert.equal(R.studentLabel({ u: 'ab12cd34ef56' }, 'en'), 'Student ⁦AB12⁩', 'no label: the first 4 characters');
  // As the teacher page shows a code: 12 hex in groups of 4 and a check character.
  assert.equal(R.codeQuery('3F9A-0C51-E2B7-C'), '3f9a0c51e2b7');
  assert.equal(R.codeQuery(' 3f9a 0c51 '), '3f9a0c51');
  assert.equal(R.codeQuery('3F9'), null, 'at least 4 characters');
  assert.equal(R.codeQuery('3F9A0C51E2B7CC'), null, 'at most 13');
  assert.equal(R.codeQuery('3F9A;'), null);
  const list = [{ u: '3f9a0c51e2b7', label: '3F9A', linked: ['77aa00000000'] }, { u: '3f9b11112222', label: '3F9B', linked: [] }, { u: 'c7f3a0000001', label: 'C7F3' }];
  assert.deepEqual(R.findStudents(list, '3F9A').map(s => s.u), ['3f9a0c51e2b7']);
  assert.deepEqual(R.findStudents(list, '3f9a-0c51-e2b7-x').map(s => s.u), ['3f9a0c51e2b7'], 'the check character is not part of the code');
  assert.deepEqual(R.findStudents(list, '77aa').map(s => s.u), ['3f9a0c51e2b7'], 'a linked code finds its student');
  assert.deepEqual(R.findStudents(list, 'c7f3').map(s => s.u), ['c7f3a0000001']);
  assert.deepEqual(R.findStudents(list, 'ab'), []);
  // The check character (Luhn mod 16, docs/RESEARCH_TELEMETRY_SPEC.md §A.8), worked by hand
  // for 3f9a0c51e2b7: the addends from the right are 14 11 4 14 2 5 9 0 5 9 15 3 = 91, and
  // (16 − 91 % 16) % 16 = 5.
  assert.equal(R.checkChar('3f9a0c51e2b7'), '5');
  assert.equal(R.checkChar('000000000000'), '0');
  assert.equal(R.checkChar('3F9A'), null);
  assert.deepEqual(R.fullCode('3F9A-0C51-E2B7-5'), { code: '3f9a0c51e2b7' });
  assert.deepEqual(R.fullCode(' 3f9a 0c51 e2b7 '), { code: '3f9a0c51e2b7' }, 'without the check character');
  assert.deepEqual(R.fullCode('3F9A-0C51-E2B7-C'), { wrong: true });
  assert.deepEqual(R.fullCode('٣F9A-٠C51-E2B٧-٥'), { code: '3f9a0c51e2b7' }, 'Arabic digits count as digits');
  assert.equal(R.codeQuery('٣f٩a'), '3f9a');
  assert.equal(R.fullCode('3F9A-0C51'), null, 'not a whole code');
  assert.equal(R.fullCode('3F9A-0C51-E2B7-55'), null);
  // Any one wrong digit changes the check character.
  const code = '3f9a0c51e2b7', check = R.checkChar(code);
  for (let i = 0; i < 12; i++) {
    for (const d of '0123456789abcdef') if (d !== code[i]) assert.notEqual(R.checkChar(code.slice(0, i) + d + code.slice(i + 1)), check, i + ' ' + d);
  }
});

test('r_stat rows: sums per band and game, and measures that are null without their denominator', () => {
  const rows = R.statRows(stats([
    row('6-7', 'attempt', 'road-hopper', '1', '', { n: 10, students: 4, w: 3, l: 5, hits: 30, misses: 10, rt_sum: 4000, rt_n: 8, score_sum: 900, score_n: 9 }),
    row('8-9', 'attempt', 'road-hopper', '1', '', { n: 6, students: 3, w: 4, l: 1, hits: 18, misses: 2, rt_sum: 2400, rt_n: 6 }),
    row('8-9', 'attempt', 'road-hopper', '2', '', { n: 4, students: 2, w: 1, l: 1, dda_sum: 1600, dda_n: 4 }),
    row('8-9', 'attempt', 'dino-3d', '1', '', { n: 5, students: 5, e: 5, score_sum: 50, score_n: 5 })
  ]));
  assert.equal(rows.length, 4);
  assert.equal(rows[0].a, '6-7');
  assert.equal(R.pick(rows, 'attempt', { band: '8-9' }).length, 3);
  assert.equal(R.pick(rows, 'attempt', { band: 'all', slug: 'road-hopper' }).length, 3);
  const all = R.total(R.pick(rows, 'attempt', { slug: 'road-hopper' }));
  assert.deepEqual([all.n, all.w, all.l, all.hits, all.misses], [20, 8, 7, 48, 12]);
  assert.deepEqual(R.measure(all, 'winRate'), { value: 8 / 15, n: 15 });
  assert.deepEqual(R.measure(all, 'accuracy'), { value: 0.8, n: 60 });
  assert.equal(R.measure(all, 'reaction').value, 6400 / 14);
  assert.equal(R.measure(all, 'dda').value, 400);
  assert.deepEqual(R.measure(R.total([]), 'winRate'), { value: null, n: 0 }, 'no rounds won or lost: no win rate, not 0');
  assert.deepEqual(R.measuresOf(R.pick(rows, 'attempt', { slug: 'road-hopper' })), ['accuracy', 'reaction', 'winRate', 'score', 'dda']);
  assert.deepEqual(R.measuresOf(R.pick(rows, 'attempt', { slug: 'dino-3d' })), ['score'], 'an endless run reports only its score');
  // A curve over attempt buckets, in bucket order, all ages summed.
  const curve = R.curve(rows, 'attempt', 'winRate', { slug: 'road-hopper' });
  assert.deepEqual(curve.map(p => [p.k, p.n, p.rounds]), [[1, 13, 13], [2, 2, 2]]);
  close(curve[0].value, 7 / 13);
  const byBand = R.curvesByBand(rows, 'attempt', 'accuracy', { slug: 'road-hopper' });
  assert.deepEqual(Object.keys(byBand), ['6-7', '8-9']);
  assert.equal(byBand['6-7'][0].value, 0.75);
  assert.equal(byBand['8-9'][1].value, null, 'attempt 2 of 8-9 counted no hits');
  // Missing numeric columns read as 0; text columns as ''.
  const short = R.statRows({ columns: ['metric', 'k1', 'n'], rows: [['games', '1', 3], 'not a row'] });
  assert.deepEqual([short.length, short[0].w, short[0].slug], [1, 0, '']);
  // The server stores an age group never set as '': here it is 'unknown', as in its other answers.
  const unset = R.statRows(stats([row('', 'attempt', 'road-hopper', '1', '', { n: 2, w: 1, l: 1 })]));
  assert.equal(unset[0].a, 'unknown');
  assert.deepEqual(Object.keys(R.curvesByBand(unset, 'attempt', 'winRate')), ['unknown']);
  assert.deepEqual(R.statRows(null), []);
});

test('bucket labels and quantiles from a histogram', () => {
  assert.deepEqual(R.BUCKETS.attempt.map(k => R.bucketLabel('attempt', k)), ['1', '2', '3', '4–5', '6–10', '11–20', '21–50', '51–100', '101+']);
  assert.deepEqual(R.BUCKETS.games.map(k => R.bucketLabel('games', k)), ['1', '2', '3', '4', '5', '6–7', '8+']);
  assert.equal(R.bucketLabel('sesslen', 5), '5–10', 'minutes: from 5 up to 10');
  assert.equal(R.bucketLabel('tenure', 13), '13+');
  const hist = R.histogram(R.statRows(stats([row('6-7', 'sesslen', '', '0', 's', { n: 10 }), row('8-9', 'sesslen', '', '5', 's', { n: 10 }),
    row('8-9', 'sesslen', '', '10', 'g', { n: 20 })])), 'sesslen');
  assert.deepEqual(hist.map(b => b.n), [10, 0, 0, 10, 20, 0, 0, 0, 0, 0]);
  // 40 sessions: the 20th falls at the end of the 5-10 bucket.
  assert.deepEqual(R.quantile(hist, 0.5), { value: 10, open: false });
  assert.deepEqual(R.quantile(hist, 0.25), { value: 1, open: false }, 'linear inside 0-1');
  close(R.quantile(hist, 0.75).value, 12.5);
  // The last bucket has no end: a quantile there is "60 or more".
  assert.deepEqual(R.quantile([{ k: 30, n: 1 }, { k: 60, n: 3 }], 0.5), { value: 60, open: true });
  assert.equal(R.quantile([{ k: 0, n: 0 }], 0.5), null);
  assert.deepEqual(R.bucketize([0, 9.9, 10, 45, 500, null], [0, 10, 20, 45]).map(b => b.n), [2, 1, 0, 2]);
});

test('when they play: weekday x hour, averaged over the days of the period', () => {
  const rows = R.statRows(stats([
    row('6-7', 'hour', '', '10', '0', { n: 4, ms: 600000, students: 6 }),
    row('8-9', 'hour', '', '10', '0', { n: 2, ms: 300000, students: 2 }),
    row('8-9', 'hour', '', '14', '3', { n: 1, ms: 60000, students: 1 })
  ]));
  // 4-17 Oct 2026: two Sundays, two Wednesdays.
  const grid = R.weekHours(rows, { from: '2026-10-04', to: '2026-10-17', weekStart: 'sun' });
  assert.deepEqual(grid.map(r => r.weekday), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(grid[0].cells[10], { hour: 10, minutes: 15, visits: 6, students: 8, occurrences: 2, perDay: 4 });
  assert.equal(grid[3].cells[14].minutes, 1);
  assert.equal(grid[1].cells[10].visits, 0);
  assert.deepEqual(R.weekHours(rows, { from: '2026-10-04', to: '2026-10-17', weekStart: 'mon' }).map(r => r.weekday), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(R.activeHours(grid), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(R.activeHours(grid, 10, 12), [10, 11, 12, 13, 14], 'widened to the play outside');
});

test('persistence after a loss: same level, another level, another game, stop, and the retry gap', () => {
  const rows = R.statRows(stats([
    row('6-7', 'persist', 'road-hopper', 'l', 'same', { n: 6, gap_sum: 60, gap_n: 6 }),
    row('6-7', 'persist', 'road-hopper', 'l', 'level', { n: 2, gap_sum: 40, gap_n: 2 }),
    row('8-9', 'persist', 'road-hopper', 'q', 'game', { n: 1 }),
    row('8-9', 'persist', 'road-hopper', 'q', 'stop', { n: 1 }),
    row('8-9', 'persist', 'road-hopper', 'w', 'same', { n: 50 }),
    row('8-9', 'persist', 'candy-rope', 'l', 'same', { n: 1 }),
    row('8-9', 'persist', 'candy-rope', 'l', 'stop', { n: 3 })
  ]));
  const p = R.persist(rows, { slug: 'road-hopper' });
  assert.deepEqual(p.counts, { same: 6, level: 2, game: 1, stop: 1 }, 'wins are not losses');
  assert.deepEqual(p.shares, { same: 0.6, level: 0.2, game: 0.1, stop: 0.1 });
  assert.equal(p.retryGap, 100 / 8, 'the mean seconds before the retry, same or another level');
  assert.equal(R.persist(rows, { slug: 'road-hopper', codes: ['w'] }).shares.same, 1);
  assert.deepEqual(R.retryByGame(rows).map(g => [g.slug, g.share, g.n]), [['road-hopper', 0.6, 10], ['candy-rope', 0.25, 4]]);
  assert.deepEqual(R.persistShares({ same: 1, level: 1, game: 0, stop: 2 }), { shares: { same: 0.25, level: 0.25, game: 0, stop: 0.5 }, n: 4 });
  assert.deepEqual(R.persistShares({}).shares, { same: null, level: null, game: null, stop: null });
  // Game-to-game moves, '' being a session's start or end.
  const flows = R.statRows(stats([row('6-7', 'flow', 'road-hopper', 'dino-3d', '', { n: 5, gap_sum: 50, gap_n: 5 }),
    row('8-9', 'flow', 'road-hopper', 'dino-3d', '', { n: 3, gap_sum: 30, gap_n: 3 }), row('8-9', 'flow', '', 'road-hopper', '', { n: 9 }),
    row('8-9', 'flow', 'dino-3d', '', '', { n: 7 })]));
  assert.deepEqual(R.flows(flows), [{ from: '', to: 'road-hopper', n: 9, gap: null }, { from: 'road-hopper', to: 'dino-3d', n: 8, gap: 10 }, { from: 'dino-3d', to: '', n: 7, gap: null }]);
  assert.deepEqual(R.flows(flows, { games: true }).map(e => e.n), [8], 'only game to game');
});

test('students: new and returning per week, minutes per student-week, days per week', () => {
  // weekly: the 13 weeks ending with the week of 27 Oct (Sunday weeks): index 10 is 11 Oct, 11 is 18 Oct, 12 is 25 Oct.
  const weekly = (w10, w11, w12) => Array(10).fill(0).concat([w10, w11, w12]);
  const students = [
    { u: 'a', firstDay: '2026-10-13', knownBefore: false, days: 4, weekly: weekly(30, 20, 0) },   // new in the week of 11 Oct
    { u: 'b', firstDay: '2026-09-01', knownBefore: false, days: 3, weekly: weekly(10, 0, 5) },
    { u: 'c', firstDay: '2026-10-20', knownBefore: true, days: 1, weekly: weekly(0, 7, 0) }      // known before: never new
  ];
  assert.deepEqual(R.newReturning(students, { from: '2026-10-01', to: '2026-10-27', weekStart: 'sun' }), [
    { week: '2026-09-27', new: 0, returning: 0 }, { week: '2026-10-04', new: 0, returning: 0 },
    { week: '2026-10-11', new: 1, returning: 1 }, { week: '2026-10-18', new: 0, returning: 2 }, { week: '2026-10-25', new: 0, returning: 1 }
  ], 'the weeks that overlap the period');
  assert.deepEqual(R.studentWeeks(students, { from: '2026-10-12', to: '2026-10-27', weekStart: 'sun' }).sort((x, y) => x - y), [5, 7, 10, 20, 30]);
  assert.deepEqual(R.daysPerWeek(students), [2, 1.5, 1]);
  assert.deepEqual(R.weeklyMinutes([{ day: '2026-10-13', minutes: 5 }, { day: '2026-10-15', minutes: 7 }, { day: '2026-10-27', minutes: 1 }],
    { from: '2026-10-11', to: '2026-10-27', weekStart: 'sun' }), [{ week: '2026-10-11', minutes: 12 }, { week: '2026-10-18', minutes: 0 }, { week: '2026-10-25', minutes: 1 }]);
  assert.equal(R.winShare({ w: 3, l: 1 }), 0.75);
  assert.equal(R.winShare({ w: 0, l: 0 }), null);
});

test('cohorts: the share of each start week active later, and null for a week not reached yet', () => {
  const grid = R.cohortGrid({ weekStart: 'sun', cohorts: [{ week: '2026-10-18', size: 4, active: [4, 1] }, { week: '2026-10-11', size: 0, active: [0] }] });
  assert.deepEqual(grid.map(c => c.week), ['2026-10-11', '2026-10-18'], 'oldest first');
  assert.deepEqual(grid[1].cells.slice(0, 3), [{ n: 4, share: 1 }, { n: 1, share: 0.25 }, null]);
  assert.equal(grid[0].cells[0].share, null, 'an empty cohort has no share');
  assert.deepEqual(R.cohortGrid(null), []);
});

test('paired growth: the same children in the first and the last third, each child weighing the same', () => {
  const answer = { columns: ['u', 'a', 'part', 'rounds', 'w', 'l', 'hits', 'misses', 'rtSum', 'rtN', 'scoreSum', 'scoreN', 'ddaSum', 'ddaN'], rows: [
    ['a', '6-7', 0, 10, 2, 8, 10, 10, 8000, 10, 0, 0, 0, 0], ['a', '6-7', 1, 4, 3, 1, 9, 1, 2000, 4, 0, 0, 0, 0],
    ['b', '8-9', 0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], ['b', '8-9', 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['c', '8-9', 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0],                                      // no last third: not paired
    ['d', '6-7', 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ['d', '6-7', 1, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]  // no win rate at first
  ] };
  const win = R.paired(answer, 'winRate');
  assert.deepEqual(Object.keys(win).sort(), ['6-7', '8-9', 'all']);
  assert.equal(win.all.students, 2, 'only children with the measure in both thirds');
  close(win.all.before, (0.2 + 0.5) / 2);
  close(win.all.after, (0.75 + 1) / 2);
  assert.equal(win.all.better, 2);
  assert.equal(win['6-7'].small, true);
  const rt = R.paired(answer, 'reaction');
  assert.deepEqual([rt.all.students, rt.all.before, rt.all.after, rt.all.better], [1, 800, 500, 1], 'a faster reaction is better');
  assert.deepEqual(R.paired({ rows: [] }, 'winRate'), {});
  // The server pairs a child's thirds within one age group: a child whose group changed
  // counts in each group, and an age group never set is 'unknown'.
  const moved = R.paired({ columns: answer.columns, rows: [['e', '6-7', 0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], ['e', '6-7', 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['e', '', 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0], ['e', '', 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]] }, 'winRate');
  assert.deepEqual([moved['6-7'].after, moved.unknown.before, moved.unknown.after, moved.all.students], [1, 0, 0.5, 2]);
  // Without columns the rows follow the documented order.
  assert.equal(R.paired({ rows: answer.rows }, 'accuracy').all.after, 0.9);
});

test('first wins, categories and the school PCs', () => {
  assert.deepEqual(R.hardestLevels([{ id: 'L2', students: 10, median: 3, p75: 5, never: 2 }, { id: 'L10', students: 3, median: 3, p75: 8, never: 0 },
    { id: 'L1', students: 20, median: 1, p75: 1, never: 0 }, { id: 'L3', students: 4, median: null, p75: null, never: 4 }]).map(f => [f.id, f.small]),
  [['L10', true], ['L2', false], ['L1', false], ['L3', true]]);
  const info = { a: { cats: ['arcade', 'running'] }, b: { cats: ['puzzle'] }, c: { cats: [] } };
  assert.deepEqual(R.categories([{ slug: 'a', engagedMinutes: 10, opens: 2 }, { slug: 'b', engagedMinutes: 30, opens: 1 }, { slug: 'c', engagedMinutes: 1, opens: 1 },
    { slug: 'd', suppressed: true }], info), [
    { id: 'puzzle', minutes: 30, opens: 1, games: 1 }, { id: 'arcade', minutes: 10, opens: 2, games: 1 }, { id: 'running', minutes: 10, opens: 2, games: 1 },
    { id: '', minutes: 1, opens: 1, games: 1 }], 'a game in two categories counts in both');
  const pcs = R.pcRows({ pcs: [{ p: '8c21d0e94a6f', label: '8C21', sessions: 10, guests: 4, flags: [] }, { p: '0b11aa22cc33', label: '0B11', sessions: 5, guests: 0, flags: ['old', 'nonsense'] }] });
  assert.deepEqual(pcs.map(p => [p.label, p.flags, p.guestShare]), [['0B11', ['old'], 0], ['8C21', [], 0.4]], 'PCs with a flag first');
});

test('the research sentences: at most five, in both languages, associations with their sample sizes', () => {
  const facts = {
    growth: [{ slug: 'bubble-bop', measure: 'accuracy', band: '8-9', students: 12, before: 0.62, after: 0.71 },
      { slug: 'bubble-bop', measure: 'accuracy', band: '6-7', students: 3, before: 0.5, after: 0.7 },
      { slug: 'road-hopper', measure: 'winRate', band: '6-7', students: 20, before: 0.7, after: 0.71 }],
    persist: [{ slug: 'road-hopper', share: 0.64, n: 80 }, { slug: 'dino-3d', share: 0.3, n: 50 }, { slug: 'candy-rope', share: 0.9, n: 3 }],
    tired: { early: { value: 0.61, n: 100 }, late: { value: 0.52, n: 60 } },
    session: { median: 8.2, open: false, n: 300 },
    peak: { weekday: 0, hour: 10, share: 0.09 }
  };
  const names = { 'bubble-bop': ['فقاعات بوب', 'Bubble Bop'], 'road-hopper': ['عبور الطريق', 'Road Hopper'] };
  const opts = lang => ({ lang, name: slug => (names[slug] || [slug, slug])[lang === 'ar' ? 0 : 1], weekday: d => lang === 'ar' ? ['الأحد'][d] : ['Sunday'][d] });
  const en = I.researchInsights(facts, opts('en')), ar = I.researchInsights(facts, opts('ar'));
  assert.deepEqual(en.map(s => s.kind), ['growth', 'persist', 'tired', 'session', 'peak']);
  assert.deepEqual(ar.map(s => s.kind + s.key), en.map(s => s.kind + s.key));
  assert.equal(en[0].text, 'Children aged 8–9 who played Bubble Bop at the start and the end of this period hit 71% of their targets lately, from 62% at first (12 children).',
    'the group with the most children; a 1-point change is not growth');
  assert.equal(en[1].text, 'After losing or leaving a round of Road Hopper, children try the same level again 64% of the time, more than in any other game.',
    'a game with 3 tries is not compared');
  assert.equal(en[2].text, 'Children win 52% of their rounds after 20 minutes of play, against 61% in the first 10 minutes of a session.');
  assert.equal(en[3].text, 'Half of the students\' play sessions last 8 minutes or less.');
  assert.equal(en[4].text, 'The busiest time is Sunday at 10:00, with 9% of the play time.');
  assert.equal(strip(ar[0].text), 'الأطفال بعمر 8–9 سنوات الذين لعبوا «فقاعات بوب» في بداية الفترة ونهايتها أصابوا 71% من أهدافهم في آخرها، مقابل 62% في أولها (12 طفلًا).');
  assert.equal(strip(ar[3].text), 'تنتهي نصف جلسات لعب الطلاب خلال 8 دقائق أو أقل.');
  for (const s of ar) {
    assert.ok(ARABIC.test(s.text) && !ARABIC_INDIC_DIGITS.test(s.text), s.text);
    assert.ok(!LATIN_WORD.test(strip(s.text)), 'no English words: ' + s.text);
  }
  for (const s of en) assert.ok(!ARABIC.test(s.text), s.text);
  assert.equal(en[0].students, 12);
  assert.equal(en[0].small, false);
  // A sentence on a small group carries the flag; nothing to say is said plainly.
  const smallGroup = I.researchInsights({ growth: [facts.growth[1]] }, opts('en'));
  assert.deepEqual([smallGroup[0].students, smallGroup[0].small], [3, true]);
  assert.deepEqual(I.researchInsights({}, opts('en')).map(s => s.kind), ['quiet']);
  assert.deepEqual(I.researchInsights(null, opts('ar')).map(s => s.kind), ['quiet']);
  // A small change in tiredness is no finding.
  assert.ok(!I.researchInsights({ tired: { early: { value: 0.6, n: 100 }, late: { value: 0.58, n: 100 } } }, opts('en')).some(s => s.kind === 'tired'));
});

test('names.js carries every catalog game\'s categories, players and input, and every category\'s names', () => {
  const w = loadScripts('names.js');
  assert.deepEqual(Object.keys(w.SG_GAME_INFO).sort(), site.GAMES.map(g => g.slug).sort());
  for (const g of site.GAMES) {
    const info = w.SG_GAME_INFO[g.slug];
    assert.deepEqual(info.cats, g.cats, g.slug);
    assert.equal(info.players, Math.max(...g.players.split('-').map(Number)), g.slug);
    assert.equal(info.input, g.inputStyle, g.slug);
    for (const c of info.cats) assert.ok(Object.hasOwn(w.SG_CATEGORIES, c), g.slug + ': ' + c);
    for (const flag of ['dda', 'track', 'tutorial']) assert.ok(info[flag] === 0 || info[flag] === 1, g.slug + ' ' + flag);
  }
  // What the games' own code reports (docs/RESEARCH_TELEMETRY_SPEC.md §B.5): 3 games adapt
  // their difficulty and count hits and reaction times, 25 show a tutorial.
  const flagged = flag => Object.keys(w.SG_GAME_INFO).filter(slug => w.SG_GAME_INFO[slug][flag]).sort();
  assert.deepEqual(flagged('dda'), ['bubble-bop', 'dino-3d', 'road-hopper']);
  assert.deepEqual(flagged('track'), ['bubble-bop', 'dino-3d', 'road-hopper']);
  assert.equal(flagged('tutorial').length, 25);
  assert.deepEqual(Object.keys(w.SG_CATEGORIES), site.CATEGORIES.map(c => c.id));
  for (const c of site.CATEGORIES) {
    const [ar, en] = w.SG_CATEGORIES[c.id];
    assert.equal(ar, c.label);
    assert.ok(en && !ARABIC.test(en), c.id);
  }
});

test('scores.js says what the score means in exactly the 28 games that pass one', () => {
  const scores = loadScripts('scores.js').SG_SCORES;
  // The games' own code: a Kit.stats.end(result, score) call with a second argument
  // (a comma at the call's own depth, so a condition in parentheses counts as one argument).
  const twoArguments = text => {
    for (let at = text.indexOf('stats.end('); at >= 0; at = text.indexOf('stats.end(', at + 1)) {
      for (let i = at + 10, depth = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') { if (!depth) break; depth--; } else if (ch === ',' && !depth) return true;
      }
    }
    return false;
  };
  const passes = slug => {
    const dir = path.join(repo, 'games', slug);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter(f => /\.js$/.test(f) && !/\.min\.js$/.test(f)) : [];
    return files.some(f => twoArguments(fs.readFileSync(path.join(dir, f), 'utf8')));
  };
  const scoring = site.GAMES.map(g => g.slug).filter(passes).sort();
  assert.equal(scoring.length, 28);
  assert.deepEqual(Object.keys(scores).sort(), scoring);
  assert.deepEqual(site.GAMES.map(g => g.slug).filter(s => !scoring.includes(s)).sort(),
    ['block-world', 'connect-four', 'critter-mart', 'pizza-clicker', 'tank-splat', 'tic-tac-toe']);
  for (const [slug, [ar, en]] of Object.entries(scores)) {
    assert.ok(ARABIC.test(ar) && !LATIN_WORD.test(ar), slug + ': ' + ar);
    assert.ok(en && !ARABIC.test(en) && /^[a-z]/.test(en), slug + ': ' + en);
  }
});

// ---- the research download ----------------------------------------------------------------------
const W = loadScripts('dictionary.js', 'zip.js', 'export.js', 'names.js', 'scores.js');
const D = W.SGDictionary, Z = W.SGZip, E = W.SGExport;
// The entries of a ZIP: { name: { data (Buffer), method } }, each checked against its CRC and size.
function unzip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let end = buffer.length - 22;
  while (view.getUint32(end, true) !== 0x06054b50) end--;
  const out = {};
  for (let i = 0, p = view.getUint32(end + 16, true); i < view.getUint16(end + 10, true); i++) {
    const method = view.getUint16(p + 10, true), crc = view.getUint32(p + 16, true), packed = view.getUint32(p + 20, true), size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true), at = view.getUint32(p + 42, true), name = buffer.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    assert.equal(view.getUint32(at, true), 0x04034b50, name + ': local header');
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true), raw = buffer.subarray(start, start + packed);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    assert.equal(data.length, size, name + ': size');
    assert.equal(zlib.crc32(data), crc, name + ': CRC');
    out[name] = { data, method };
    p += 46 + nameLength;
  }
  return out;
}

test('dictionary.js lists exactly the columns of server/export.mjs, each with both meanings', () => {
  assert.deepEqual(D.SERVER_FILES, Object.keys(COLUMNS), 'the server\'s files, in the order of the download');
  for (const [file, columns] of Object.entries(COLUMNS)) {
    assert.deepEqual(D.columns(file), columns, file);
    assert.equal(D.header(file), columns.join(','), file);
  }
  const TYPES = ['code', 'text', 'category', 'integer', 'decimal', 'flag', 'date', 'time', 'datetime'];
  for (const f of D.FILES) {
    assert.equal(new Set(D.columns(f.file)).size, f.columns.length, f.file + ': no column twice');
    assert.ok(f.one[0] && ARABIC.test(f.one[1]), f.file);
    for (const col of f.columns) {
      const [name, type, unit, values, en, ar, source, available] = col;
      assert.equal(col.length, 8, f.file + '.' + name);
      assert.match(name, /^[a-z][a-z0-9_]*$/, f.file);
      assert.ok(TYPES.includes(type), f.file + '.' + name + ': ' + type);
      assert.equal(typeof unit, 'string');
      assert.equal(typeof values, 'string');
      assert.ok(en && !ARABIC.test(en), f.file + '.' + name + ': ' + en);
      assert.ok(ARABIC.test(ar) && !ARABIC_INDIC_DIGITS.test(ar), f.file + '.' + name + ': ' + ar);
      assert.ok(source, f.file + '.' + name);
      assert.ok(D.AVAILABLE.includes(available), f.file + '.' + name + ': ' + available);
      if (type === 'flag') assert.equal(values, '0, 1', f.file + '.' + name);
    }
  }
  assert.deepEqual(D.columns('games'), ['game', 'name_ar', 'name_en', 'categories', 'players', 'input_style', 'has_levels', 'dda', 'reports_hits',
    'reports_reaction', 'reports_score', 'score_meaning_en', 'score_meaning_ar', 'tutorial']);
  assert.deepEqual(D.columns('dictionary'), ['file', 'column', 'type', 'unit', 'values', 'meaning_en', 'meaning_ar', 'source', 'available_for']);
  assert.equal(D.NOTES.length, 13);
  for (const [en, ar] of D.NOTES) assert.ok(en && !ARABIC.test(en) && ARABIC.test(ar));
});

test('docs/RESEARCH_DATA.md is the dictionary\'s own output (rebuild: node server/dashboard/dictionary.js --md > docs/RESEARCH_DATA.md)', () => {
  assert.equal(fs.readFileSync(path.join(repo, 'docs/RESEARCH_DATA.md'), 'utf8'), D.markdown());
  for (const f of D.FILES) assert.ok(D.markdown().includes('### `' + f.file + '.csv`'), f.file);
});

test('the browser\'s files: games.csv, dictionary.csv, README.txt in both languages, labels.sps and load.R', () => {
  const parse = text => text.trim().split('\n').map(line => {
    const cells = [];
    for (let i = 0, cur = '', quoted = false; i <= line.length; i++) {
      const ch = line[i];
      if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
      else if (ch === '"') quoted = true;
      else if (ch === ',' || ch === undefined) { cells.push(cur); cur = ''; } else cur += ch;
    }
    return cells;
  });
  const games = parse(D.gamesCsv({ games: W.SG_GAME_NAMES, about: W.SG_GAME_INFO, scores: W.SG_SCORES, levels: { 'road-hopper': 4, 'dino-3d': 1 } }));
  assert.deepEqual(games[0], D.columns('games'));
  assert.equal(games.length, 1 + site.GAMES.length);
  const of = slug => Object.fromEntries(D.columns('games').map((c, i) => [c, games.find(r => r[0] === slug)[i]]));
  const hopper = of('road-hopper');
  assert.equal(hopper.name_en, 'Road Hopper');
  assert.ok(ARABIC.test(hopper.name_ar));
  assert.deepEqual([hopper.has_levels, hopper.dda, hopper.reports_hits, hopper.reports_reaction, hopper.reports_score, hopper.tutorial], ['1', '1', '1', '1', '1', '1']);
  assert.equal(of('dino-3d').has_levels, '0');
  assert.equal(of('tic-tac-toe').has_levels, '', 'not played in the period');
  assert.deepEqual([of('tic-tac-toe').reports_score, of('tic-tac-toe').score_meaning_en], ['0', '']);
  assert.equal(of('beat-dash').score_meaning_en, W.SG_SCORES['beat-dash'][1], 'a meaning with a comma, quoted');
  const dictionary = parse(D.dictionaryCsv());
  assert.deepEqual(dictionary[0], D.columns('dictionary'));
  assert.equal(dictionary.length - 1, D.FILES.reduce((n, f) => n + f.columns.length, 0));
  assert.ok(dictionary.every(r => r.length === 9));

  const files = [{ name: 'students.csv', rows: 3 }, { name: 'rounds-2026-09.csv', rows: 1 }, { name: 'rounds-2026-10.csv', rows: 12 }];
  const readme = D.readme({ from: '2026-09-01', to: '2026-10-27', tz: 'Asia/Riyadh', exported: '2026-10-27 10:40', files, factsSince: '2026-09-02',
    legacyUntil: '2026-09-02', v3Since: '2026-09-10', part: 2, stopped: { file: 'events' } });
  for (const text of ['2026-09-01', 'Asia/Riyadh', 'students.csv: 3 rows, one per student code', 'rounds-2026-09.csv: 1 row, one per round', 'part 2',
    'stopped early, in events.csv', 'Up to 2026-09-02', 'From 2026-09-10', 'GET DATA /TYPE=TXT /ENCODING=\'UTF8\'', 'fileEncoding = "UTF-8-BOM"',
    'lme4::glmer(win ~ log(attempt) * band + (1 + log(attempt) | student_linked) + (1 | pc) + (1 | game)', 'MIXED',
    'pseudonymous records of individual children', 'students.csv: 3 صفوف', 'rounds-2026-09.csv: صف واحد', 'rounds-2026-10.csv: 12 صفًّا']) {
    assert.ok(readme.includes(text), text);
  }
  for (const [en, ar] of D.NOTES) assert.ok(readme.includes(en) && readme.includes(ar));
  assert.doesNotMatch(readme, /card/i, 'there are no player cards');
  const names = files.map(f => f.name).concat(['games.csv', 'dictionary.csv']);
  const sps = D.spss(names);
  for (const name of names) {
    const block = sps.slice(sps.indexOf("/FILE='" + name + "'"));
    const variables = /\/VARIABLES=([^\n]*)\./.exec(block)[1].split(' ');
    assert.equal(variables.length / 2, D.columns(name.replace(/\.csv$/, '').replace(/-\d{4}-\d\d$/, '')).length, name);
  }
  assert.match(sps, /VALUE LABELS [^.]*outcome 'win' 'win' 'loss' 'loss'/);
  const r = D.rLoader(names);
  assert.match(r, /rounds <- read_sg\(c\("rounds-2026-09\.csv", "rounds-2026-10\.csv"\)/, 'the months of rounds as one table');
  assert.match(r, /students\$band_first <- factor\(students\$band_first, levels = c\("6-7", "8-9", "10-11"\)\)/);
  assert.doesNotMatch(r, /sessions <-/, 'only the files of the download');
});

test('zip.js: deflated and stored entries any unzip tool reads, with streaming CRCs', async () => {
  assert.equal(Z.crc32(Buffer.from('hello world')), zlib.crc32('hello world'));
  assert.equal(Z.crc32(Buffer.from(' world'), Z.crc32(Buffer.from('hello'))), zlib.crc32('hello world'), 'the CRC goes on from the bytes before');
  const big = new Blob(['﻿a,b\n', ...Array.from({ length: 4000 }, (_, i) => i + ',' + 'x'.repeat(i % 40) + '\n')]);
  const blob = await Z.zip([{ name: 'rounds.csv', blob: big }, { name: 'اقرأني.txt', blob: 'نص قصير' }, { name: 'empty.csv', blob: '' }], { when: new Date(2026, 9, 27, 10, 40) });
  assert.equal(blob.type, 'application/zip');
  const files = unzip(Buffer.from(await blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files), ['rounds.csv', 'اقرأني.txt', 'empty.csv']);
  assert.equal(files['rounds.csv'].method, 8, 'deflated');
  // (Blob.text() would drop the byte-order mark: compare the bytes.)
  assert.equal(files['rounds.csv'].data.toString('utf8'), Buffer.from(await big.arrayBuffer()).toString('utf8'));
  assert.equal(files['اقرأني.txt'].data.toString('utf8'), 'نص قصير');
  assert.equal(files['اقرأني.txt'].method, 0, 'a short file that deflating does not shrink is stored');
  const stored = unzip(Buffer.from(await (await Z.zip([{ name: 'a.csv', blob: big }], { store: true })).arrayBuffer()));
  assert.equal(stored['a.csv'].method, 0);
  assert.equal(stored['a.csv'].data.length, big.size);
});

test('export.js: every page once, a header from the dictionary, rounds by month, and part 2 after the reading guard', async () => {
  // A server of three pages of rounds over two months and one page of everything else; the
  // reading guard answers the second page of events.
  const line = (file, i, day = '2026-10-0' + (1 + (i % 5))) => D.columns(file).map(c => c === 'day' ? day : c === 'session' ? 's' + i : '').join(',');
  const pages = {
    rounds: [[0, 1, 2].map(i => line('rounds', i, '2026-09-30')).join('\n') + '\n', [3, 4].map(i => line('rounds', i)).join('\n') + '\n', line('rounds', 5) + '\n'],
    events: [line('events', 0) + '\n', line('events', 1) + '\n']
  };
  const asked = [];
  const page = guard => (file, after) => {
    asked.push(file + ':' + after);
    const list = pages[file] || [line(file, 0) + '\n'], k = after ? Number(after) : 0;
    if (guard && file === 'events' && k === 1) return Promise.reject({ kind: 'busy', status: 429, body: { error: 'reads', until: '03:00' } });
    return Promise.resolve({ text: list[k], next: k + 1 < list.length ? String(k + 1) : null });
  };
  const progress = [];
  const job = E.job({ from: '2026-09-01', to: '2026-10-27', page: page(true), split: 4, onProgress: p => progress.push(p) });
  assert.equal(await job.run(), 'stopped');
  assert.deepEqual(job.stopped, { file: 'events', after: '1', until: '03:00' });
  assert.deepEqual(asked, ['students:null', 'sessions:null', 'visits:null', 'rounds:null', 'rounds:1', 'rounds:2', 'events:null', 'events:1']);
  assert.equal(progress.at(-1).lines, 1 + 1 + 1 + 6 + 1);
  const one = await job.zip({ games: { games: W.SG_GAME_NAMES, about: W.SG_GAME_INFO, scores: W.SG_SCORES }, readme: { from: '2026-09-01', to: '2026-10-27' } }, new Date(2026, 9, 27));
  assert.equal(one.name, 'school-games-data_2026-09-01_2026-10-27.zip');
  const files = unzip(Buffer.from(await one.blob.arrayBuffer()));
  // 6 rounds pass the split of 4 in this test: one file per month.
  assert.deepEqual(Object.keys(files), ['students.csv', 'sessions.csv', 'visits.csv', 'rounds-2026-09.csv', 'rounds-2026-10.csv', 'events.csv', 'games.csv',
    'dictionary.csv', 'README.txt', 'labels.sps', 'load.R']);
  const text = name => files[name].data.toString('utf8');
  for (const name of ['students.csv', 'rounds-2026-09.csv', 'events.csv', 'games.csv', 'dictionary.csv', 'README.txt']) assert.ok(text(name).startsWith('﻿'), name + ': BOM');
  assert.equal(text('rounds-2026-09.csv'), '﻿' + D.header('rounds') + '\n' + pages.rounds[0]);
  assert.equal(text('rounds-2026-10.csv').split('\n').length - 2, 3);
  assert.equal(text('events.csv'), '﻿' + D.header('events') + '\n' + pages.events[0], 'the rows before the guard');
  assert.match(text('README.txt'), /stopped early, in events\.csv/);
  assert.match(text('README.txt'), /rounds-2026-10\.csv: 3 rows/);
  // Part 2 goes on from the cursor and holds only what part 1 did not.
  asked.length = 0;
  const two = E.job({ from: '2026-09-01', to: '2026-10-27', page: page(false), part: 2, file: job.stopped.file, after: job.stopped.after });
  assert.equal(await two.run(), 'done');
  assert.deepEqual(asked, ['events:1', 'student_days:null', 'daily_games:null', 'pcs:null']);
  const second = await two.zip({}, new Date(2026, 9, 28));
  assert.equal(second.name, 'school-games-data_2026-09-01_2026-10-27_part2.zip');
  const rest = unzip(Buffer.from(await second.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(rest).filter(n => n.endsWith('.csv')), ['events.csv', 'student_days.csv', 'daily_games.csv', 'pcs.csv', 'games.csv', 'dictionary.csv']);
  assert.equal(rest['events.csv'].data.toString('utf8'), '﻿' + D.header('events') + '\n' + pages.events[1]);
  assert.match(rest['README.txt'].data.toString('utf8'), /This is part 2 of the download/);
  // Without the split, one rounds.csv in the server's order.
  const whole = E.job({ from: '2026-09-01', to: '2026-10-27', page: page(false) });
  assert.equal(await whole.run(), 'done');
  const all = (await whole.entries({})).find(e => e.name === 'rounds.csv');
  assert.equal(Buffer.from(await all.blob.arrayBuffer()).toString('utf8'), '﻿' + D.header('rounds') + '\n' + pages.rounds.join(''));
  assert.equal(all.rows, 6);
  // A network failure keeps the rows: run() again asks for the same page.
  let fail = true;
  const flaky = E.job({ from: '2026-09-01', to: '2026-10-27', page: (file, after) => file === 'visits' && fail ? (fail = false, Promise.reject({ kind: 'network' })) : page(false)(file, after) });
  await assert.rejects(flaky.run(), f => f.kind === 'network');
  assert.equal(await flaky.run(), 'done');
  assert.equal((await flaky.entries({})).find(e => e.name === 'students.csv').rows, 1, 'nothing fetched twice');
  // The cost before starting, from the period's KPIs.
  const est = E.estimate({ totals: { sessions: 100, gameOpens: 250, roundsStarted: 1100, roundsEnded: 1000, levelUps: 40, students: { active: 30, guestSessions: 20 } },
    games: [{ slug: 'a', hearts: { on: 5, off: 1 }, tutorials: { start: 10, done: 4 } }], quality: { pcsNew: 12 } }, { reads: 3499000, readsLimit: 5000000 }, 30);
  assert.equal(est.lines, 30 + 100 + 250 + 1100 + 60 + 80 + 30 + 12);
  assert.equal(est.rows, Math.round(est.lines * 1.25));
  assert.equal(est.share, est.rows / 5000000);
  assert.equal(est.stops, true, 'today’s reads so far plus these pass the export guard');
  assert.equal(E.estimate({ totals: { sessions: 100 } }, { reads: 0 }, 1).stops, false);
});

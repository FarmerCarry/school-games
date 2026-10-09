/*
 * Teacher page (teacher.html): this PC's local play statistics, in Arabic.
 * Plain script (no modules, no network) so it also works from a downloaded
 * folder (file://). The contract is docs/PLAY_STATS.md, sections 3 and 4:
 *
 *   - read the day records the portal keeps in localStorage
 *     (sg:site:stats:d:YYYY-MM-DD) and its settings (sg:site:statsmeta),
 *     checking every value and ignoring anything foreign or broken;
 *   - show the answers for a period, the per-game table and collapsed details;
 *   - export ALL stored days as one Excel workbook (a small built-in ZIP
 *     writer, no library) or one JSON file, format sg-play-stats v1;
 *   - open JSON exports from other PCs to view them together (nothing saved).
 *
 * The pure parts hang off window.SGTeacher so tools/tests can run them in Node.
 * Only init() touches the DOM, and it runs only when there is a document.
 * Numbers are always Western digits (0-9).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------- format */
  var FORMAT = 'sg-play-stats';
  var PREFIX = 'sg:site:stats:';            // every key "clear" may remove
  var META_KEY = 'sg:site:statsmeta';       // id, label and stop setting: never cleared
  var DAY_KEY = /^sg:site:stats:d:(\d{4}-\d{2}-\d{2})$/;
  var SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var LEVEL = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
  var PC_ID = /^pc[a-z]{4,8}$/;            // the portal makes 'pc' + 4 letters
  var MAX = 1e12;                           // ceiling for any stored number
  var CAP = 307200;                         // the portal keeps all stats keys under 300 KB
  var HOUR_DAYS = 3;                        // an hours row is exported only for 3 days or more
  var TWO_PLAYER = /(?:^|:)(?:duo|local|pvp)$/; // two-player modes on one PC (no winner): 'duo', 'L4:duo'
  var SOURCES = ['featured', 'catalog', 'recent', 'favorites', 'category', 'quick', 'search', 'related',
    'surprise', 'reload', 'history', 'direct'];
  var BASE = ['pc', 'pc_label', 'copy'];
  // Fixed English column names: never renamed, new ones only appended.
  var COLUMNS = {
    days: BASE.concat(['date', 'seconds', 'sessions', 'short_sessions', 'calm_on', 'fullscreen', 'mute_toggles',
      'day_complete', 'exported_at']),
    games: BASE.concat(['date', 'game', 'game_name', 'opens', 'sessions', 'short_sessions', 'sessions_1_5',
      'sessions_5_15', 'sessions_15_plus', 'never_started', 'seconds', 'hearted', 'rounds', 'wins', 'losses',
      'draws', 'ends', 'quits', 'tutorial_shown', 'tutorial_done', 'loads', 'load_ms_sum', 'load_ms_max',
      'loads_skipped', 'errors', 'timeouts', 'frames_smooth', 'frames_ok', 'frames_choppy', 'frames_stall'],
      SOURCES.map(function (s) { return 'from_' + s; }), ['day_complete', 'exported_at']),
    levels: BASE.concat(['date', 'game', 'game_name', 'level', 'starts', 'visits', 'gave_up', 'wins', 'losses',
      'draws', 'ends', 'quits', 'seconds', 'score_sum', 'score_count', 'score_max', 'day_complete', 'exported_at']),
    hours: BASE.concat(['game', 'game_name', 'hour', 'seconds', 'days', 'exported_at'])
  };
  var TABLES = ['days', 'games', 'levels', 'hours'];
  var TEXT = { pc: 1, pc_label: 1, copy: 1, date: 1, game: 1, game_name: 1, level: 1, exported_at: 1 };

  /* ------------------------------------------------------------ strings */
  var SOURCE_NAMES = {
    featured: 'بطاقات 🔥 الأكثر حماسًا', catalog: 'قائمة الألعاب في الرئيسية', recent: 'تابع اللعب',
    favorites: 'الألعاب المفضلة ❤', category: 'أقسام الألعاب', quick: 'اختيار طريقة اللعب', search: 'البحث',
    related: 'ألعاب أخرى ستحبها', surprise: 'زر فاجئني 🎲', reload: 'تحديث الصفحة',
    history: 'زرّا الرجوع والتقدم في المتصفح', direct: 'رابط مباشر'
  };
  var VERDICTS = { smooth: 'سلس', ok: 'مقبول', slow: 'بطيء', unmeasured: 'لا تُقاس' };
  // Games with no steady drawing loop while playing (board games move pieces with
  // CSS, typing-test redraws on key presses) count no frames, since only Kit.loop and
  // Kit.stats.frame count them: the device status says so instead of «—».
  // tools/tests/play-stats-rules.test.mjs keeps this list equal to those games.
  var NO_FRAMES = ['connect-four', 'tic-tac-toe', 'typing-test'];
  var MINUTES = ['دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'];
  var HOURS = ['ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة'];
  var TIMES = ['مرة واحدة', 'مرتان', 'مرات', 'مرة'];
  var DAYS = ['يوم واحد', 'يومان', 'أيام', 'يومًا'];
  var VISITS = ['زيارة واحدة', 'زيارتان', 'زيارات', 'زيارة'];
  var PCS = ['جهاز واحد', 'جهازان', 'أجهزة', 'جهازًا'];
  var ON_PCS = ['جهاز واحد', 'جهازين', 'أجهزة', 'جهازًا'];
  var TRIES = ['محاولة واحدة', 'محاولتين', 'محاولات', 'محاولة'];
  // How long a PC keeps its days (js/stats.js prune()): on the page and the read-me sheet.
  var KEEP = 'تُحذف الأيام القديمة عندما تمتلئ مساحة الإحصاءات أو بعد 120 يومًا، أيهما أسبق، ' +
    'وقد لا يحفظ جهاز في مختبر حاسوب مزدحم إلا شهرين أو ثلاثة.';
  var OPEN_NOTE = 'مرة لعب ما زالت مفتوحة، وتظهر هنا بعد إغلاق اللعبة.';
  var FILES = ['ملف واحد', 'ملفين', 'ملفات', 'ملفًا'];

  // The read-me sheet explains every exported column. Shared columns are written
  // once here; a table can override a column whose meaning differs there.
  var HELP = {
    pc: 'معرّف الجهاز: الحرفان pc وبعدهما أحرف عشوائية. لا يدل على أي طالب.',
    pc_label: 'اسم الجهاز الذي كتبه المعلم في صفحة الإحصاءات (مثل: جهاز 7).',
    copy: 'نسخة الموقع: web للموقع على الإنترنت، وfolder لمجلد منزَّل. يحفظ الموقع والمجلد المنزَّل إحصاءاتٍ منفصلة.',
    date: 'اليوم حسب ساعة الجهاز، نصًّا بالشكل YYYY-MM-DD.',
    seconds: 'وقت اللعب الفعلي بالثواني: يُحسب فقط عندما يستخدم الطفل الفأرة أو لوحة المفاتيح.',
    sessions: 'مرات اللعب: مرات فتح اللعبة واللعب فيها دقيقة أو أكثر.',
    short_sessions: 'خرجوا بسرعة: مرات خرج فيها الطفل قبل دقيقة.',
    calm_on: 'مرات تشغيل وضع الصف.',
    fullscreen: 'مرات الدخول إلى ملء الشاشة في الموقع.',
    mute_toggles: 'مرات كتم الصوت أو تشغيله داخل الألعاب.',
    day_complete: '1 إذا انتهى اليوم قبل التصدير، و0 لليوم الحالي (قد تزيد أرقامه في تصدير لاحق).',
    exported_at: 'وقت التصدير حسب ساعة الجهاز. عند الدمج تُستخدم صفوف التصدير الأحدث.',
    game: 'المعرّف الثابت للعبة. استخدمه في الجداول المحورية لأن الاسم قد يتغير.',
    game_name: 'اسم اللعبة بالعربية.',
    opens: 'مرات فتح صفحة اللعبة.',
    sessions_1_5: 'مرات لعب من دقيقة إلى 5 دقائق.',
    sessions_5_15: 'مرات لعب من 5 إلى 15 دقيقة.',
    sessions_15_plus: 'مرات لعب 15 دقيقة أو أكثر.',
    never_started: 'مرات فُتحت فيها اللعبة ولم يكتمل تحميلها.',
    hearted: '1 إذا كانت اللعبة في قائمة ❤ عند آخر حفظ لهذا اليوم.',
    rounds: 'الجولات أو المراحل التي بدأت.',
    wins: 'جولات انتهت بالفوز.',
    losses: 'جولات انتهت بالخسارة.',
    draws: 'جولات انتهت بالتعادل.',
    ends: 'جولات انتهت بلا فائز (لعب بلا نهاية، أو لاعبان على الجهاز نفسه).',
    quits: 'جولات تُركت قبل نهايتها.',
    tutorial_shown: 'مرات ظهور الشرح الأول على هذا الجهاز.',
    tutorial_done: 'مرات إكمال الشرح الأول على هذا الجهاز.',
    loads: 'مرات التحميل الأول المقيسة.',
    load_ms_sum: 'مجموع أزمنة التحميل بالملّي ثانية. المتوسط = load_ms_sum ÷ loads.',
    load_ms_max: 'أطول زمن تحميل بالملّي ثانية.',
    loads_skipped: 'مرات تحميل لم تُقس لأن الصفحة كانت مخفية.',
    errors: 'أخطاء أوقفت اللعبة.',
    timeouts: 'مرات لم تُحمَّل فيها اللعبة خلال 20 ثانية.',
    frames_smooth: 'إطارات رُسمت في 20 ملّي ثانية أو أقل (سلسة). تبقى أعمدة frames_ صفرًا في الألعاب التي لا ترسم حركة مستمرة: ' +
      NO_FRAMES.join('، ') + '.',
    frames_ok: 'إطارات رُسمت في أكثر من 20 حتى 34 ملّي ثانية (مقبولة).',
    frames_choppy: 'إطارات رُسمت في أكثر من 34 حتى 250 ملّي ثانية (متقطعة).',
    frames_stall: 'إطارات استغرقت أكثر من 250 ملّي ثانية (توقف).',
    level: 'معرّف المرحلة أو الوضع في اللعبة (مثل L3). القيمة _other تجمع المراحل الزائدة.',
    starts: 'مرات بدء هذه المرحلة.',
    visits: 'زيارات المرحلة: بدء بعد مرحلة أخرى، أو أول بدء في مرة اللعب.',
    gave_up: 'توقفوا عند هذه المرحلة: خسروا أو تركوا المرحلة ثم انتقلوا إلى غيرها. له معنى فقط في المراحل التي يُفاز فيها أو يُخسر، ' +
      'لا في اللعب الحر أو اللعب بلا نهاية أو لعب طفلين على جهاز واحد.',
    score_sum: 'مجموع النتائج (مثل الأمتار أو النقاط).',
    score_count: 'الجولات التي لها نتيجة. متوسط النتيجة = score_sum ÷ score_count.',
    score_max: 'أفضل نتيجة.',
    hour: 'الساعة من 0 إلى 23 حسب ساعة الجهاز (9 تعني من 9:00 إلى 9:59).'
  };
  SOURCES.forEach(function (s) { HELP['from_' + s] = 'مرات فتح اللعبة من: ' + SOURCE_NAMES[s] + '.'; });
  var HELP_IN = {
    days: { seconds: 'وقت اللعب الفعلي بالثواني في كل الألعاب: يُحسب فقط عندما يستخدم الطفل الفأرة أو لوحة المفاتيح.' },
    levels: { seconds: 'وقت اللعب الفعلي بالثواني داخل هذه المرحلة.' },
    hours: {
      seconds: 'وقت اللعب الفعلي بالثواني في هذه الساعة، مجموعًا على كل الأيام في الملف.',
      days: 'الأيام التي لُعبت فيها اللعبة في هذه الساعة: 3 أو أكثر دائمًا، وأقل من كل الأيام التي لُعبت فيها اللعبة في الملف. ' +
        'ولا تُصدَّر الساعات الأخرى.'
    }
  };
  var TABLE_HELP = {
    days: 'صف لكل يوم.',
    games: 'صف لكل لعبة في كل يوم.',
    levels: 'صف لكل مرحلة من لعبة في كل يوم.',
    hours: 'صف لكل لعبة وساعة لُعبت فيها في 3 أيام أو أكثر، لا في كل أيامها، مجموعًا على كل الأيام في الملف (بلا تاريخ).'
  };

  /* ------------------------------------------------------ small helpers */
  function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  // Any count or millisecond total: a finite number ≥ 0, otherwise ignored (0).
  function num(v) { return typeof v === 'number' && v >= 0 && v <= MAX ? v : 0; }
  function list(v, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(Array.isArray(v) ? num(v[i]) : 0);
    return out;
  }
  function secs(ms) { return Math.round(ms / 1000); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = parseKey(s);
    return dateKey(d) === s;
  }
  function addDays(s, n) { var d = parseKey(s); d.setDate(d.getDate() + n); return dateKey(d); }
  function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 864e5); }
  // Local ISO time with its offset, e.g. 2026-10-08T10:30:00+03:00.
  function localIso(d) {
    var off = -d.getTimezoneOffset(), sign = off < 0 ? '-' : '+';
    off = Math.abs(off);
    return dateKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
      sign + pad(Math.floor(off / 60)) + ':' + pad(off % 60);
  }
  function isoTime(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(s) &&
      isFinite(Date.parse(s));
  }
  function time(v) {
    if (typeof v === 'number' && v > 0 && isFinite(v)) return v;
    var t = typeof v === 'string' ? Date.parse(v) : NaN;
    return isFinite(t) ? t : 0;
  }
  function levelId(id) { return id === '_other' || (LEVEL.test(id) && !/\d{3}/.test(id)); }
  function copyOf(v) { return v === 'web' || v === 'folder' ? v : ''; }
  // Drop control and direction-formatting characters from text shown or exported.
  function plain(v, max) {
    if (typeof v !== 'string') return '';
    return Array.from(v.replace(/[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩﻿]/g, '').trim())
      .slice(0, max).join('').trim();
  }
  // PC label: at most 16 characters, no leading = + - @ (spreadsheet formulas),
  // no control characters.
  function cleanLabel(v) {
    var s = plain(v, 200);
    while (/^[=+\-@\s]/.test(s)) s = s.slice(1);
    return Array.from(s).slice(0, 16).join('').trim();
  }
  function esc(s) {
    return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  // Arabic counted nouns: forms for 1, 2, 3–10 and 11 or more.
  function count(n, forms) {
    n = Math.round(n);
    if (n === 1) return forms[0];
    if (n === 2) return forms[1];
    return fmt(n) + ' ' + (n >= 3 && n <= 10 ? forms[2] : forms[3]);
  }
  // Under a minute is always «أقل من دقيقة», never «دقيقة واحدة», so it matches «خرجوا بسرعة».
  function duration(sec) {
    if (sec <= 0) return '0';
    if (sec < 60) return 'أقل من دقيقة';
    var m = Math.round(sec / 60);
    if (m < 60) return count(m, MINUTES);
    var h = Math.floor(m / 60);
    m %= 60;
    return count(h, HOURS) + (m ? ' و' + count(m, MINUTES) : '');
  }
  function names(games) {
    var map = {};
    (Array.isArray(games) ? games : []).forEach(function (g) {
      if (g && typeof g.slug === 'string' && typeof g.title === 'string') map[g.slug] = g.title;
    });
    return map;
  }
  function gameName(map, slug) { return map && own(map, slug) ? map[slug] : slug; }

  /* ------------------------------------------------------ reading storage */
  // One stored day record, checked field by field. A record from another
  // version, for another date or with the wrong shape is ignored; so are game
  // slugs, level ids and numbers that do not follow the storage format.
  function parseDay(date, text) {
    var r;
    try { r = JSON.parse(text); } catch (e) { return null; }
    if (!obj(r) || r.v !== 1 || r.d !== date || !validDate(date)) return null;
    var s = obj(r.s) ? r.s : {};
    var day = { d: date, s: { calm: num(s.calm), fs: num(s.fs), mute: num(s.mute) }, g: {} };
    var games = obj(r.g) ? r.g : {};
    Object.keys(games).forEach(function (slug) {
      var g = games[slug], hh = {}, src = {}, lv = {};
      if (!SLUG.test(slug) || slug.length > 40 || !obj(g)) return;
      if (obj(g.hh)) Object.keys(g.hh).forEach(function (h) {
        if (/^(?:1?\d|2[0-3])$/.test(h) && num(g.hh[h]) > 0) hh[h] = num(g.hh[h]);
      });
      if (obj(g.src)) SOURCES.forEach(function (k) { if (own(g.src, k) && num(g.src[k]) > 0) src[k] = num(g.src[k]); });
      if (obj(g.lv)) Object.keys(g.lv).forEach(function (id) {
        if (levelId(id) && Array.isArray(g.lv[id])) lv[id] = list(g.lv[id], 12);
      });
      day.g[slug] = {
        o: num(g.o), e: num(g.e), hh: hh, b: list(g.b, 4), ns: num(g.ns), src: src, l: list(g.l, 3),
        ls: num(g.ls), x: num(g.x), t: num(g.t), f: list(g.f, 4), tu: list(g.tu, 2),
        fav: g.fav === 1 || g.fav === true ? 1 : 0, lv: lv
      };
    });
    return day;
  }

  function parseMeta(text) {
    var raw = null;
    try { raw = JSON.parse(text); } catch (e) { /* missing or broken: start again */ }
    if (!obj(raw)) raw = {};
    var pc = obj(raw.pc) ? raw.pc : {};
    return {
      raw: raw,
      id: typeof pc.id === 'string' && PC_ID.test(pc.id) ? pc.id : '',
      label: cleanLabel(pc.label),
      off: raw.off === true || raw.off === 1,
      offSince: time(raw.offSince),
      clearedAt: time(raw.clearedAt),
      since: validDate(raw.since) ? raw.since : time(raw.since) ? dateKey(new Date(time(raw.since))) : '',
      lastExport: time(raw.lastExport),
      pruned: validDate(raw.pruned) ? raw.pruned : ''   // the newest day the portal removed for space
    };
  }

  // Reads every stats key. Throws when storage is blocked; callers catch it.
  // bytes: the size of all stats keys, counted as the portal counts its 300 KB cap.
  function readStore(ls) {
    var keys = [], days = [], bytes = 0;
    for (var i = 0; i < ls.length; i++) {
      var key = ls.key(i);
      if (typeof key !== 'string') continue;
      if (key.indexOf('sg:site:stats') === 0) bytes += key.length + String(ls.getItem(key)).length;
      if (DAY_KEY.test(key)) keys.push(key);
    }
    keys.sort().forEach(function (key) {
      var day = parseDay(DAY_KEY.exec(key)[1], ls.getItem(key));
      if (day) days.push(day);
    });
    return { days: days, meta: parseMeta(ls.getItem(META_KEY)), bytes: bytes };
  }

  // Removes only keys that start with sg:site:stats: (never sg:site:statsmeta).
  function clearStats(ls) {
    var keys = [];
    for (var i = 0; i < ls.length; i++) {
      var key = ls.key(i);
      if (typeof key === 'string' && key.indexOf(PREFIX) === 0) keys.push(key);
    }
    keys.forEach(function (key) { ls.removeItem(key); });
    return keys.length;
  }

  /* ------------------------------------------------------------- tables */
  function row(table, common, values) {
    var r = {};
    COLUMNS[table].forEach(function (c) { r[c] = own(values, c) ? values[c] : own(common, c) ? common[c] : 0; });
    return r;
  }

  // The four export tables (format sg-play-stats v1) from the stored days.
  // info: { pc, label, copy, exportedAt, today, names }.
  function tables(days, info) {
    var t = { days: [], games: [], levels: [], hours: [] }, hours = {}, played = Object.create(null);
    var common = { pc: info.pc, pc_label: info.label, copy: info.copy, exported_at: info.exportedAt };
    days.slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }).forEach(function (rec) {
      var done = rec.d < info.today ? 1 : 0, ms = 0, sessions = 0, short = 0;
      Object.keys(rec.g).sort().forEach(function (slug) {
        var g = rec.g[slug], name = gameName(info.names, slug), sums = [0, 0, 0, 0, 0, 0];
        ms += g.e;
        sessions += g.b[1] + g.b[2] + g.b[3];
        short += g.b[0];
        Object.keys(g.lv).sort().forEach(function (id) {
          var a = g.lv[id];
          for (var i = 0; i < 6; i++) sums[i] += a[i];
          t.levels.push(row('levels', common, {
            date: rec.d, game: slug, game_name: name, level: id, starts: a[0], visits: a[10], gave_up: a[11],
            wins: a[1], losses: a[2], draws: a[3], ends: a[4], quits: a[5], seconds: secs(a[6]),
            score_sum: a[7], score_count: a[9], score_max: a[8], day_complete: done
          }));
        });
        Object.keys(g.hh).forEach(function (h) {
          var key = slug + ' ' + pad(+h), x = hours[key] || (hours[key] = { game: slug, hour: +h, ms: 0, days: 0 });
          x.ms += g.hh[h];
          x.days++;
        });
        if (Object.keys(g.hh).length) played[slug] = (played[slug] || 0) + 1;
        var v = {
          date: rec.d, game: slug, game_name: name, opens: g.o, sessions: g.b[1] + g.b[2] + g.b[3],
          short_sessions: g.b[0], sessions_1_5: g.b[1], sessions_5_15: g.b[2], sessions_15_plus: g.b[3],
          never_started: g.ns, seconds: secs(g.e), hearted: g.fav, rounds: sums[0], wins: sums[1],
          losses: sums[2], draws: sums[3], ends: sums[4], quits: sums[5], tutorial_shown: g.tu[0],
          tutorial_done: g.tu[1], loads: g.l[0], load_ms_sum: g.l[1], load_ms_max: g.l[2], loads_skipped: g.ls,
          errors: g.x, timeouts: g.t, frames_smooth: g.f[0], frames_ok: g.f[1], frames_choppy: g.f[2],
          frames_stall: g.f[3], day_complete: done
        };
        SOURCES.forEach(function (s) { v['from_' + s] = g.src[s] || 0; });
        t.games.push(row('games', common, v));
      });
      t.days.push(row('days', common, {
        date: rec.d, seconds: secs(ms), sessions: sessions, short_sessions: short, calm_on: rec.s.calm,
        fullscreen: rec.s.fs, mute_toggles: rec.s.mute, day_complete: done
      }));
    });
    // A game and hour is left out when played on fewer than 3 days, or on every day
    // the game was played (a weekly lesson, say): with the dated games table either
    // would give the hour of a date, so who played in which lesson on a PC with
    // fixed seating.
    Object.keys(hours).sort().forEach(function (key) {
      var x = hours[key];
      if (x.days < HOUR_DAYS || x.days >= played[x.game]) return;
      t.hours.push(row('hours', common, {
        game: x.game, game_name: gameName(info.names, x.game), hour: x.hour, seconds: secs(x.ms), days: x.days
      }));
    });
    return t;
  }

  function exportJson(t, info) {
    return { format: FORMAT, v: 1, pc: { id: info.pc, label: info.label, copy: info.copy }, exported_at: info.exportedAt,
      tables: { days: t.days, games: t.games, levels: t.levels, hours: t.hours } };
  }

  /* --------------------------------------------- other PCs' JSON exports */
  function cleanRow(table, r, file, map) {
    if (!obj(r) || typeof r.pc !== 'string' || !PC_ID.test(r.pc)) return null;
    if (table !== 'hours' && !validDate(r.date)) return null;
    if (table !== 'days' && !(typeof r.game === 'string' && SLUG.test(r.game) && r.game.length <= 40)) return null;
    if (table === 'levels' && !(typeof r.level === 'string' && levelId(r.level))) return null;
    if (table === 'hours' && !(typeof r.hour === 'number' && r.hour >= 0 && r.hour <= 23 && r.hour % 1 === 0)) return null;
    var out = {};
    COLUMNS[table].forEach(function (c) {
      if (c === 'pc_label') out[c] = cleanLabel(r[c]);
      else if (c === 'copy') out[c] = copyOf(r[c]);
      else if (c === 'game_name') out[c] = own(map, r.game) ? map[r.game] : plain(r[c], 60) || r.game;
      else if (c === 'exported_at') out[c] = isoTime(r[c]) ? r[c] : file.exported_at;
      else if (TEXT[c]) out[c] = r[c];
      else out[c] = num(r[c]);
    });
    return out;
  }

  // One opened file. Anything that is not an sg-play-stats v1 export returns null;
  // rows that break the format are skipped. Nothing here is ever stored.
  function readImport(text, map) {
    var j;
    try { j = JSON.parse(text); } catch (e) { return null; }
    if (!obj(j) || j.format !== FORMAT || j.v !== 1 || !obj(j.pc) || !obj(j.tables)) return null;
    if (typeof j.pc.id !== 'string' || !PC_ID.test(j.pc.id) || !isoTime(j.exported_at)) return null;
    var file = { pc: { id: j.pc.id, label: cleanLabel(j.pc.label), copy: copyOf(j.pc.copy) }, exported_at: j.exported_at,
      tables: {} };
    TABLES.forEach(function (table) {
      var rows = Array.isArray(j.tables[table]) ? j.tables[table] : [];
      file.tables[table] = [];
      for (var i = 0; i < rows.length && i < 200000; i++) {
        var r = cleanRow(table, rows[i], file, map || {});
        if (r) file.tables[table].push(r);
      }
    });
    return file;
  }

  // Combine rule: for each (pc, date) use only the rows of the source with the
  // newest exported_at; for hours, each PC's newest source. Sources are this PC
  // (exported "now") and the opened files. Never adds two exports of one day.
  function combine(sources) {
    var stamp = sources.map(function (s) { return Date.parse(s.exported_at) || 0; });
    var best = {}, newest = {}, labels = {};
    var out = { days: [], games: [], levels: [], hours: [] };
    function claim(map, key, i) { if (!own(map, key) || stamp[i] > stamp[map[key]]) map[key] = i; }
    sources.forEach(function (s, i) {
      var pcs = {};
      pcs[s.pc.id] = 1;
      ['days', 'games', 'levels'].forEach(function (table) {
        s.tables[table].forEach(function (r) { pcs[r.pc] = 1; claim(best, r.pc + '|' + r.date, i); });
      });
      s.tables.hours.forEach(function (r) { pcs[r.pc] = 1; });
      Object.keys(pcs).forEach(function (pc) { claim(newest, pc, i); });
      if (!own(labels, s.pc.id)) labels[s.pc.id] = [];
      if (labels[s.pc.id].indexOf(s.pc.label) < 0) labels[s.pc.id].push(s.pc.label);
    });
    sources.forEach(function (s, i) {
      ['days', 'games', 'levels'].forEach(function (table) {
        s.tables[table].forEach(function (r) { if (best[r.pc + '|' + r.date] === i) out[table].push(r); });
      });
      s.tables.hours.forEach(function (r) { if (newest[r.pc] === i) out.hours.push(r); });
    });
    // Each PC's first and last day, and ids that came with more than one label.
    var pcs = {};
    out.days.concat(out.games, out.levels).forEach(function (r) {
      var p = pcs[r.pc] || (pcs[r.pc] = { pc: r.pc, first: r.date, last: r.date, dates: {} });
      if (r.date < p.first) p.first = r.date;
      if (r.date > p.last) p.last = r.date;
      p.dates[r.date] = 1;
    });
    var coverage = Object.keys(pcs).sort().map(function (pc) {
      var p = pcs[pc], s = sources[newest[pc]];
      return { pc: pc, label: s.pc.id === pc ? s.pc.label : '', first: p.first, last: p.last,
        days: Object.keys(p.dates).length, exportedAt: s.exported_at, local: !!s.local,
        labels: own(labels, pc) ? labels[pc].slice() : [], conflict: own(labels, pc) && labels[pc].length > 1 };
    });
    return { tables: out, pcs: coverage };
  }

  /* ---------------------------------------------------------- summaries */
  // Period choices; the school week starts on Sunday.
  function periodRange(key, today) {
    if (key === 'today') return { from: today, to: today };
    if (key === 'week') return { from: addDays(today, -parseKey(today).getDay()), to: today };
    if (key === 'month') return { from: addDays(today, -29), to: today };
    return { from: '', to: '' };
  }

  // closedSeconds: play time of the game rows that have closed sessions, so the
  // average session leaves out a session that is still open (its time is written
  // before its length is). days: distinct dates, even when several PCs are combined.
  // live: { pc, date } of this PC today, when its own records are in the view.
  function summary(t, from, to, live) {
    var keep = function (r) { return (!from || r.date >= from) && (!to || r.date <= to); };
    var games = Object.create(null), s = { seconds: 0, closedSeconds: 0, sessions: 0, short: 0, calm: 0, fs: 0, mute: 0,
      src: {}, pcs: {}, games: [] };
    SOURCES.forEach(function (k) { s.src[k] = 0; });
    function game(r) {
      return games[r.game] || (games[r.game] = { game: r.game, name: r.game_name, seconds: 0, closedSeconds: 0, sessions: 0,
        short: 0, opens: 0, days: 0, dates: Object.create(null), pcs: Object.create(null), live: 0, ns: 0, errors: 0, timeouts: 0,
        loads: 0, loadSum: 0, loadMax: 0, f: [0, 0, 0, 0], tu: [0, 0], favDate: Object.create(null), fav: Object.create(null),
        levels: Object.create(null) });
    }
    t.days.filter(keep).forEach(function (r) {
      s.calm += r.calm_on; s.fs += r.fullscreen; s.mute += r.mute_toggles; s.pcs[r.pc] = 1;
    });
    t.games.filter(keep).forEach(function (r) {
      var g = game(r);
      s.pcs[r.pc] = 1;
      g.seconds += r.seconds; g.sessions += r.sessions; g.short += r.short_sessions; g.opens += r.opens;
      if (r.sessions + r.short_sessions > 0) g.closedSeconds += r.seconds;
      if (live && r.pc === live.pc && r.date === live.date && r.seconds > 0) g.live = 1;
      g.dates[r.date] = 1; g.pcs[r.pc] = 1;
      g.ns += r.never_started; g.errors += r.errors; g.timeouts += r.timeouts;
      g.loads += r.loads; g.loadSum += r.load_ms_sum; g.loadMax = Math.max(g.loadMax, r.load_ms_max);
      g.f[0] += r.frames_smooth; g.f[1] += r.frames_ok; g.f[2] += r.frames_choppy; g.f[3] += r.frames_stall;
      g.tu[0] += r.tutorial_shown; g.tu[1] += r.tutorial_done;
      // ❤ follows each PC's latest day in the period.
      if (!(r.pc in g.favDate) || r.date >= g.favDate[r.pc]) { g.favDate[r.pc] = r.date; g.fav[r.pc] = r.hearted ? 1 : 0; }
      SOURCES.forEach(function (k) { s.src[k] += r['from_' + k]; });
    });
    t.levels.filter(keep).forEach(function (r) {
      var g = game(r), l = g.levels[r.level] || (g.levels[r.level] = { level: r.level, starts: 0, visits: 0, gaveUp: 0,
        wins: 0, losses: 0, draws: 0, ends: 0, quits: 0, seconds: 0, scoreSum: 0, scoreCount: 0, scoreMax: 0 });
      l.starts += r.starts; l.visits += r.visits; l.gaveUp += r.gave_up; l.wins += r.wins; l.losses += r.losses;
      l.draws += r.draws; l.ends += r.ends; l.quits += r.quits; l.seconds += r.seconds;
      l.scoreSum += r.score_sum; l.scoreCount += r.score_count; l.scoreMax = Math.max(l.scoreMax, r.score_max);
    });
    s.games = Object.keys(games).map(function (k) {
      var g = games[k];
      g.hearted = Object.keys(g.fav).filter(function (pc) { return g.fav[pc]; }).length;
      g.levels = markWinnable(Object.keys(g.levels).sort().map(function (id) { return g.levels[id]; }));
      g.days = Object.keys(g.dates).length;
      g.pcs = Object.keys(g.pcs).length;
      // Play time today on this PC but no closed session in the view: a session is
      // still open. Other rows with time and no session (a failed load, a session
      // closed by another page or begun before a clear) will never close: no note.
      g.open = !!g.live && g.sessions + g.short === 0;
      s.seconds += g.seconds; s.closedSeconds += g.closedSeconds; s.sessions += g.sessions; s.short += g.short;
      return g;
    }).sort(function (a, b) {
      return b.sessions - a.sessions || b.seconds - a.seconds || (a.game < b.game ? -1 : 1);
    });
    s.pcs = Object.keys(s.pcs).length;
    return s;
  }

  // Marks the levels of ONE game (in one view) that children can win or lose
  // (l.winnable): a level that was won or lost and never ended without a winner,
  // or a level that was only left (no neutral end, no draw) whose id has the
  // shape of such a level, digits aside ('L#', 'w#-#', 'stage#'). So win-or-quit
  // games such as troll-level, where a death respawns inside the level, show the
  // levels children abandon, while a 'classic', 'endless', 'main' or 'run' left
  // beside won levels does not. Free play, endless runs, merge-2048 boards and
  // two-player modes ('duo', 'L4:duo') end without a winner ('end' or 'draw'),
  // so leaving them is not giving up; the folded '_other' row is many levels.
  function markWinnable(levels) {
    var shape = function (id) { return id.replace(/[0-9]+/g, '#'); };
    var decided = function (l) { return l.wins + l.losses > 0 && !l.ends && !TWO_PLAYER.test(l.level); };
    var shapes = Object.create(null);
    levels.forEach(function (l) { if (decided(l)) shapes[shape(l.level)] = 1; });
    levels.forEach(function (l) {
      l.winnable = l.level !== '_other' && !TWO_PLAYER.test(l.level) &&
        (decided(l) || !!shapes[shape(l.level)] && !l.ends && !l.draws);
    });
    return levels;
  }

  // Where they stop: within ONE game, the 3 levels with the highest gave up ÷
  // visits among winnable levels with at least 5 visits. No absolute threshold.
  function stuck(levels) {
    return levels.filter(function (l) {
      return l.winnable && l.visits >= 5 && l.gaveUp > 0;
    }).sort(function (a, b) {
      return b.gaveUp / b.visits - a.gaveUp / a.visits || b.visits - a.visits || (a.level < b.level ? -1 : 1);
    }).slice(0, 3);
  }

  // Winnable levels: wins out of tries (wins + losses + draws + quits), with at
  // least 5 tries, so a level children leave counts against it. Other levels with
  // scores (endless runs, merge-2048 boards) show the average and best score.
  function levelResult(l) {
    var tries = l.wins + l.losses + l.draws + l.quits;
    if (l.winnable) return tries >= 5 ? { win: l.wins / tries, wins: l.wins, tries: tries } : null;
    return l.scoreCount ? { avg: l.scoreSum / l.scoreCount, best: l.scoreMax } : null;
  }

  // One verdict per game from frame times and load times. Below 600 counted
  // frames there is too little to judge, so no verdict ('').
  function verdict(f, loads, loadSum) {
    var n = f[0] + f[1] + f[2] + f[3];
    if (n < 600) return '';
    var slow = (f[2] + f[3]) / n, avg = loads ? loadSum / loads : 0;
    if (slow > 0.1 || f[3] / n > 0.01 || avg >= 8000) return 'slow';
    if (f[0] / n >= 0.8 && slow <= 0.03 && avg < 4000) return 'smooth';
    return 'ok';
  }

  // Play seconds by hour: from this PC's day records (any period) ...
  function hoursFromDays(days, from, to) {
    var out = [];
    for (var h = 0; h < 24; h++) out.push(0);
    days.forEach(function (rec) {
      if ((from && rec.d < from) || (to && rec.d > to)) return;
      Object.keys(rec.g).forEach(function (slug) {
        var hh = rec.g[slug].hh;
        Object.keys(hh).forEach(function (k) { out[+k] += hh[k] / 1000; });
      });
    });
    return out;
  }
  // ... or from exported hours rows, which have no dates (all days in the files).
  function hoursFromRows(rows) {
    var out = [];
    for (var h = 0; h < 24; h++) out.push(0);
    rows.forEach(function (r) { out[r.hour] += r.seconds; });
    return out;
  }

  // The oldest stored day that no export has covered completely yet.
  function oldestUnexported(days, lastExport) {
    var from = lastExport ? dateKey(new Date(lastExport)) : '';
    for (var i = 0; i < days.length; i++) if (days[i].d >= from) return days[i].d;
    return '';
  }

  // Why the page asks the teacher to export now, or null. The portal removes the
  // oldest days when the stats keys pass 300 KB or there are more than 120 days:
  //   pruned: the newest day it removed for space, when the last export did not
  //           cover that day completely (or there was no export);
  //   used:   the share of the 300 KB in use, when it is over 75 % and nothing was
  //           exported in the last 7 days (a full PC stays full after an export);
  //   age:    days since the oldest day not exported yet, when over 100.
  function reminder(days, meta, bytes, today) {
    var since = meta.lastExport ? dateKey(new Date(meta.lastExport)) : '';
    var oldest = oldestUnexported(days, meta.lastExport), age = oldest ? daysBetween(oldest, today) : 0;
    var r = { pruned: meta.pruned && meta.pruned >= since ? meta.pruned : '',
      used: bytes > 0.75 * CAP && (!since || daysBetween(since, today) >= 7) ? bytes / CAP : 0,
      oldest: age > 100 ? oldest : '', age: age > 100 ? age : 0 };
    return r.pruned || r.used || r.age ? r : null;
  }

  /* --------------------------------------------------------- xlsx writer */
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';

  function utf8(s) { return new TextEncoder().encode(s); }
  function colName(i) {
    var s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }
  // Numbers stay numbers; ids, labels and dates are inline strings, so Excel
  // never turns them into dates or formulas on any Windows locale.
  function cell(ref, v, style) {
    var s = style ? ' s="' + style + '"' : '';
    if (typeof v === 'number') return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    v = String(v);
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t' + (/^\s|\s$/.test(v) ? ' xml:space="preserve"' : '') + '>' +
      esc(v) + '</t></is></c>';
  }
  function worksheet(sheet, first) {
    var rows = sheet.rows, cols = sheet.widths.length, height = Math.max(rows.length, 2);
    var x = [XML + '<worksheet xmlns="' + NS + '" xmlns:r="' + REL + '"><dimension ref="A1:' + colName(cols - 1) + height +
      '"/><sheetViews><sheetView rightToLeft="1"' + (first ? ' tabSelected="1"' : '') + ' workbookViewId="0">' +
      (sheet.table ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') +
      '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>'];
    sheet.widths.forEach(function (w, i) {
      x.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>');
    });
    x.push('</cols><sheetData>');
    rows.forEach(function (r, i) {
      x.push('<row r="' + (i + 1) + '">');
      r.forEach(function (v, j) { if (v !== null) x.push(cell(colName(j) + (i + 1), v, sheet.style ? sheet.style(i, j) : 0)); });
      x.push('</row>');
    });
    x.push('</sheetData>' + (sheet.table ? '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' : '') + '</worksheet>');
    return x.join('');
  }
  // An Excel table over the header and data rows. A table needs one data row,
  // so an empty table keeps one blank row.
  function tableXml(id, name, columns, rowCount) {
    var ref = 'A1:' + colName(columns.length - 1) + (Math.max(rowCount, 1) + 1);
    return XML + '<table xmlns="' + NS + '" id="' + id + '" name="' + name + '" displayName="' + name + '" ref="' + ref +
      '" totalsRowShown="0"><autoFilter ref="' + ref + '"/><tableColumns count="' + columns.length + '">' +
      columns.map(function (c, i) { return '<tableColumn id="' + (i + 1) + '" name="' + esc(c) + '"/>'; }).join('') +
      '</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" ' +
      'showRowStripes="1" showColumnStripes="0"/></table>';
  }
  // The Arabic read-me sheet: what the file is, how to combine files, and a
  // line for every column of every table.
  function readme(info) {
    var rows = [
      ['إحصاءات اللعب في ألعاب الفسحة', null],
      ['الجهاز', info.pc + (info.label ? ' (' + info.label + ')' : '')],
      ['وقت التصدير', info.exportedAt],
      ['ملاحظة', 'الأرقام لكل جهاز وليست لكل طالب، ولم تُرسل إلى أي مكان.'],
      ['ما في الملف', 'كل الأيام المحفوظة على هذا الجهاز وقت التصدير، لا الفترة المعروضة في الصفحة فقط.'],
      ['مدة الحفظ', KEEP + ' لذلك صدّر الملف كل أسبوع.'],
      ['مكان الحفظ', 'تُحفظ الأرقام في ملف تعريف واحد للمتصفح على هذا الجهاز. وتبدأ من الصفر في متصفح آخر، أو مع ملف تعريف مدرسي ' +
        'متجوّل أو مؤقت يُمسح عند الخروج، أو بعد مسح بيانات المواقع في المتصفح.'],
      ['الخصوصية', 'لا يحتوي الملف على أسماء ولا على أي نص كتبه الأطفال. جدول hours بلا تواريخ، وفيه فقط الساعة التي لُعبت فيها ' +
        'اللعبة في 3 أيام أو أكثر، ولكن ليس في كل الأيام التي لُعبت فيها اللعبة في الملف. لذلك لا يدل صف وحده على ساعة يوم معيّن. ' +
        'ومع ذلك يبيّن الجدول الساعات المعتادة للعب، فاحفظ الملف كما تحفظ سجلات الصف.'],
      ['الدمج', 'عند جمع ملفات عدة أجهزة: لكل جهاز (pc) ويوم (date) استخدم صفوف الملف الذي فيه أحدث exported_at فقط، ' +
        'ولا تجمع ملفين من الجهاز نفسه لليوم نفسه. في جدول hours استخدم أحدث ملف لكل جهاز.'],
      ['المتوسطات', 'كل الأرقام مجاميع وأعداد يمكن جمعها. احسب المتوسط بقسمة المجموع على العدد، ' +
        'مثل load_ms_sum ÷ loads أو score_sum ÷ score_count.'],
      ['الجداول الفارغة', 'يحتاج جدول Excel إلى صف بيانات واحد على الأقل، لذلك يبقى في الجدول الذي لا بيانات فيه صف فارغ. ' +
        'عند جمع الملفات في Power Query احذف الصفوف التي يكون فيها pc فارغًا.'],
      [null, null]
    ];
    var headings = [0];
    TABLES.forEach(function (table) {
      headings.push(rows.length);
      rows.push(['الجدول ' + table, TABLE_HELP[table]]);
      COLUMNS[table].forEach(function (c) {
        rows.push([c, HELP_IN[table] && own(HELP_IN[table], c) ? HELP_IN[table][c] : HELP[c]]);
      });
      rows.push([null, null]);
    });
    return { rows: rows, headings: headings };
  }
  function widths(columns, rows) {
    return columns.map(function (c, j) {
      var w = c.length;
      for (var i = 0; i < rows.length && i < 500; i++) w = Math.max(w, String(rows[i][j]).length);
      return Math.min(40, w + 3);
    });
  }

  // The workbook: sheets اقرأني, days, games, levels, hours (each data sheet an
  // Excel table of the same name), right to left.
  function xlsx(t, info, when) {
    var help = readme(info);
    var sheets = [{ name: 'اقرأني', rows: help.rows, widths: [24, 110],
      style: function (i, j) { return help.headings.indexOf(i) >= 0 ? 2 : j ? 1 : 0; } }];
    TABLES.forEach(function (table) {
      var data = t[table].map(function (r) { return COLUMNS[table].map(function (c) { return r[c]; }); });
      sheets.push({ name: table, table: table, rows: [COLUMNS[table]].concat(data), widths: widths(COLUMNS[table], data) });
    });
    var files = [], types = [], wbRels = [];
    sheets.forEach(function (sheet, i) {
      var n = i + 1;
      files.push({ name: 'xl/worksheets/sheet' + n + '.xml', text: worksheet(sheet, i === 0) });
      types.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="' + CT + 'worksheet+xml"/>');
      wbRels.push('<Relationship Id="rId' + n + '" Type="' + REL + '/worksheet" Target="worksheets/sheet' + n + '.xml"/>');
      if (!sheet.table) return;
      files.push({ name: 'xl/worksheets/_rels/sheet' + n + '.xml.rels', text: XML + '<Relationships xmlns="' + PKG +
        '"><Relationship Id="rId1" Type="' + REL + '/table" Target="../tables/table' + i + '.xml"/></Relationships>' });
      files.push({ name: 'xl/tables/table' + i + '.xml', text: tableXml(i, sheet.table, COLUMNS[sheet.table], sheet.rows.length - 1) });
      types.push('<Override PartName="/xl/tables/table' + i + '.xml" ContentType="' + CT + 'table+xml"/>');
    });
    wbRels.push('<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + REL + '/styles" Target="styles.xml"/>');
    files.unshift(
      { name: '[Content_Types].xml', text: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="' + CT + 'sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="' + CT + 'styles+xml"/>' + types.join('') + '</Types>' },
      { name: '_rels/.rels', text: XML + '<Relationships xmlns="' + PKG + '"><Relationship Id="rId1" Type="' + REL +
        '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: XML + '<workbook xmlns="' + NS + '" xmlns:r="' + REL + '"><bookViews>' +
        '<workbookView activeTab="0"/></bookViews><sheets>' + sheets.map(function (sheet, i) {
          return '<sheet name="' + esc(sheet.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: XML + '<Relationships xmlns="' + PKG + '">' + wbRels.join('') + '</Relationships>' },
      { name: 'xl/styles.xml', text: XML + '<styleSheet xmlns="' + NS + '"><fonts count="2"><font><sz val="11"/>' +
        '<name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts><fills count="2"><fill>' +
        '<patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" ' +
        'fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" ' +
        'borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
        '<alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" ' +
        'applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>' }
    );
    return zip(files.map(function (f) { return { name: f.name, data: utf8(f.text) }; }), when);
  }

  /* ---------------------------------------------------------- ZIP writer */
  var crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    var crc = -1;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
  }
  // A plain ZIP with stored (uncompressed) entries: local headers, the central
  // directory and its end record. Enough for .xlsx and quick to check.
  function zip(files, when) {
    var d = when && when.getFullYear() >= 1980 ? when : new Date(1980, 0, 1);
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var items = files.map(function (f) { return { name: utf8(f.name), data: f.data, crc: crc32(f.data), offset: 0 }; });
    var size = 22;
    items.forEach(function (it) { size += 76 + 2 * it.name.length + it.data.length; });
    var out = new Uint8Array(size), view = new DataView(out.buffer), pos = 0;
    function u16(v) { view.setUint16(pos, v, true); pos += 2; }
    function u32(v) { view.setUint32(pos, v, true); pos += 4; }
    function bytes(b) { out.set(b, pos); pos += b.length; }
    function header(it, central) {
      u32(central ? 0x02014b50 : 0x04034b50);
      if (central) u16(20);                     // made by: version 2.0
      u16(20); u16(0x0800); u16(0);             // version needed, UTF-8 names, stored
      u16(dosTime); u16(dosDate); u32(it.crc); u32(it.data.length); u32(it.data.length);
      u16(it.name.length); u16(0);              // name length, no extra field
      if (central) { u16(0); u16(0); u16(0); u32(0); u32(it.offset); }
      bytes(it.name);
    }
    items.forEach(function (it) { it.offset = pos; header(it, false); bytes(it.data); });
    var start = pos;
    items.forEach(function (it) { header(it, true); });
    var length = pos - start;
    u32(0x06054b50); u16(0); u16(0); u16(items.length); u16(items.length); u32(length); u32(start); u16(0);
    return out;
  }

  var api = {
    FORMAT: FORMAT, PREFIX: PREFIX, META_KEY: META_KEY, COLUMNS: COLUMNS, SOURCES: SOURCES,
    parseDay: parseDay, parseMeta: parseMeta, readStore: readStore, clearStats: clearStats, cleanLabel: cleanLabel,
    tables: tables, exportJson: exportJson, readImport: readImport, combine: combine, periodRange: periodRange,
    summary: summary, markWinnable: markWinnable, stuck: stuck, levelResult: levelResult, verdict: verdict,
    hoursFromDays: hoursFromDays, hoursFromRows: hoursFromRows, oldestUnexported: oldestUnexported, reminder: reminder,
    NO_FRAMES: NO_FRAMES, duration: duration, xlsx: xlsx, zip: zip, crc32: crc32, localIso: localIso, dateKey: dateKey, addDays: addDays, names: names
  };
  window.SGTeacher = api;
  if (typeof document !== 'undefined' && document.getElementById('teacherApp')) init();

  /* ================================================================ page */
  function init() {
    var $ = function (id) { return document.getElementById(id); };
    var NAMES = names(window.GAMES);
    var COPY = location.protocol === 'file:' ? 'folder' : 'web';
    var XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var state = { ok: false, days: [], meta: parseMeta(null), bytes: 0, files: [], ignored: [] };
    var store = null, refresh = 0, pending = null;

    function load() {
      try {
        store = window.localStorage;
        var r = readStore(store);
        state.ok = true; state.days = r.days; state.meta = r.meta; state.bytes = r.bytes;
      } catch (e) {
        state.ok = false; state.days = []; state.meta = parseMeta(null); state.bytes = 0;
      }
    }
    function newId() {
      var a = new Uint8Array(4), id = 'pc';
      window.crypto.getRandomValues(a);
      for (var i = 0; i < 4; i++) id += String.fromCharCode(97 + a[i] % 26);
      return id;
    }
    // Read-modify-write of the settings key, keeping fields the portal owns.
    // Any write from this page also makes the PC id if there is none yet.
    function updateMeta(change) {
      var meta = parseMeta(store.getItem(META_KEY)), raw = meta.raw;
      if (!obj(raw.pc)) raw.pc = {};
      if (!meta.id) raw.pc.id = newId();
      change(raw);
      store.setItem(META_KEY, JSON.stringify(raw));
      return raw.pc.id;
    }
    function localInfo(now) {
      return { pc: state.meta.id, label: state.meta.label, copy: COPY, exportedAt: localIso(now), today: dateKey(now), names: NAMES };
    }
    function bdi(s, ltr) { return '<bdi' + (ltr ? ' dir="ltr"' : '') + '>' + esc(s) + '</bdi>'; }
    function showDate(key) { return key ? bdi(+key.slice(8, 10) + '/' + +key.slice(5, 7) + '/' + key.slice(0, 4), true) : '—'; }
    // An id such as cpu-easy stays on one line (it would break at the hyphen, right to left).
    function levelName(id) { return id === '_other' ? 'مراحل أخرى' : '<bdi dir="ltr" class="id">' + esc(id) + '</bdi>'; }
    function empty(text) { return '<p class="empty">' + text + '</p>'; }
    function pct(x) { return Math.round(x * 100) + '%'; }
    function say(id, text, bad) { $(id).textContent = text; $(id).classList.toggle('bad', !!bad); }

    /* ------------------------------------------------------- the view */
    function view(now) {
      var info = localInfo(now), local = state.ok ? tables(state.days, info) : null;
      if (!state.files.length) return { tables: local || tables([], info), combined: null };
      var sources = state.files.slice();
      if (local && state.days.length) {
        sources.unshift({ pc: { id: info.pc, label: info.label, copy: COPY }, exported_at: info.exportedAt, tables: local, local: true });
      }
      var c = combine(sources);
      return { tables: c.tables, combined: c };
    }

    function render() {
      var now = new Date(), today = dateKey(now), v = view(now);
      var period = (document.querySelector('input[name="period"]:checked') || {}).value || 'week';
      var range = periodRange(period, today);
      var s = summary(v.tables, range.from, range.to, state.ok ? { pc: state.meta.id, date: today } : null);
      var hours = v.combined ? hoursFromRows(v.tables.hours) : hoursFromDays(state.days, range.from, range.to);
      $('range').innerHTML = range.from ? 'من ' + showDate(range.from) + ' إلى ' + showDate(range.to) : 'كل الأيام المحفوظة';
      renderNotices(today, v.combined);
      renderSource();
      renderCards(s, hours, !!v.combined);
      renderGames(s);
      renderStuck(s);
      renderLevels(s);
      renderDevice(s);
      renderSources(s);
      renderSettings(s);
      renderTutorials(s);
      renderActions();
    }

    function renderNotices(today, combined) {
      $('storageMsg').hidden = state.ok;
      $('stoppedMsg').hidden = !(state.ok && state.meta.off);
      var r = state.ok ? reminder(state.days, state.meta, state.bytes, today) : null, why = [];
      $('reminder').hidden = !r;
      if (r) {
        if (r.pruned) why.push('امتلأت مساحة الإحصاءات على هذا الجهاز، فحُذفت أيام قديمة لم تُصدَّر، آخرها ' + showDate(r.pruned) + '.');
        else if (r.used) why.push('مساحة الإحصاءات على هذا الجهاز ممتلئة بنسبة ' + pct(Math.min(r.used, 1)) + '.');
        if (r.age) why.push('أقدم يوم لم يُصدَّر بعد هو ' + showDate(r.oldest) + ' (قبل ' + count(r.age, DAYS) + ').');
        $('reminder').innerHTML = 'تذكير: ' + why.join(' ') + ' صدّر ملف Excel الآن. ' + KEEP;
      }
      var box = $('combined'), html = '';
      if (combined) {
        html += '<p><strong>عرض عدة أجهزة معًا: ' + count(combined.pcs.length, PCS) + '.</strong> لا يُحفظ شيء من هذه الملفات، ' +
          'ولكل جهاز ويوم تُستخدم أحدث نسخة مصدَّرة فقط.</p><div class="scroll"><table class="pcs"><thead><tr><th scope="col">الجهاز</th>' +
          '<th scope="col">أول يوم</th><th scope="col">آخر يوم</th><th scope="col">الأيام</th><th scope="col">آخر تصدير</th></tr></thead><tbody>';
        combined.pcs.forEach(function (p) {
          html += '<tr data-pc="' + esc(p.pc) + '"' + (p.conflict ? ' class="conflict"' : '') + '><td>' +
            (p.label ? bdi(p.label) + ' ' : '') + bdi(p.pc, true) + (p.local ? ' (هذا الجهاز)' : '') +
            (p.conflict ? '<br><span class="warn">⚠ المعرّف نفسه بأسماء مختلفة: ' + p.labels.map(function (l) {
              return '«' + (l ? bdi(l) : 'بلا اسم') + '»';
            }).join('، ') + '</span>' : '') + '</td><td>' + showDate(p.first) + '</td><td>' + showDate(p.last) + '</td><td>' +
            p.days + '</td><td>' + (p.local ? 'الآن' : showDate(p.exportedAt.slice(0, 10))) + '</td></tr>';
        });
        html += '</tbody></table></div><button type="button" class="btn" id="backLocal">العودة إلى هذا الجهاز وحده</button>';
      }
      if (state.ignored.length) {
        var n = state.ignored.length;
        html += '<p class="warn" id="ignoredFiles">لم نستطع قراءة ' + count(n, FILES) +
          (n === 1 ? ' لأنه ليس ملف إحصاءات صالحًا: ' : n === 2 ? ' لأنهما ليسا ملفَّي إحصاءات صالحَين: ' : ' لأنها ليست ملفات إحصاءات صالحة: ') +
          state.ignored.map(function (n) { return bdi(n); }).join('، ') + '</p>';
      }
      box.innerHTML = html;
      box.hidden = !html;
    }

    function renderSource() {
      var dir = location.pathname.replace(/[^/]*$/, ''), where;
      try { dir = decodeURIComponent(dir); } catch (e) { /* keep it encoded */ }
      where = COPY === 'folder' ? 'الأرقام من مجلد منزَّل على هذا الجهاز: ' + bdi(dir, true)
        : 'الأرقام من نسخة الموقع على الإنترنت: ' + bdi(location.origin + dir, true);
      var since = state.days.length ? state.days[0].d : state.meta.since;
      var html = '<span>' + where + '. يحفظ الموقع على الإنترنت والمجلد المنزَّل إحصاءاتٍ منفصلة، فافتح هذه الصفحة بالطريقة نفسها التي يفتح بها الأطفال الألعاب.</span>';
      if (state.ok) {
        html += '<span>' + (since ? 'البيانات منذ ' + showDate(since) : 'لا توجد بيانات بعد') +
          (state.days.length ? ' · الأيام المحفوظة: ' + state.days.length : '') + '</span>' +
          '<span>اسم الجهاز: ' + (state.meta.label ? bdi(state.meta.label) : 'بلا اسم') +
          (state.meta.id ? ' · المعرّف: ' + bdi(state.meta.id, true) : '') + '</span>';
      }
      $('source').innerHTML = html;
      $('source').setAttribute('data-copy', COPY);
    }

    function renderCards(s, hours, combined) {
      // A game with play time but no closed session yet (the teacher opened 📊 while
      // it is still open) gets a note instead of «no game was played a minute».
      var top = s.games.filter(function (g) { return g.sessions > 0; }).slice(0, 5);
      var open = s.games.some(function (g) { return g.open; }) ? '<p class="hint open-note">' + OPEN_NOTE + '</p>' : '';
      $('cardTop').innerHTML = (top.length ? '<ol>' + top.map(function (g) {
        return '<li data-game="' + esc(g.game) + '"><span class="name">' + esc(g.name) + '</span> <span class="num">' +
          count(g.sessions, TIMES) + ' · ' + duration(g.seconds) + '</span></li>';
      }).join('') + '</ol>' : open ? '' : empty('لم تُلعب أي لعبة دقيقة أو أكثر في هذه الفترة.')) + open;

      // The average leaves out play time that has no closed session yet.
      var closed = s.sessions + s.short;
      $('cardTime').innerHTML = s.seconds > 0 || closed ? '<p class="big" data-seconds="' + s.seconds + '">' + duration(s.seconds) + '</p>' +
        '<p>وقت اللعب الفعلي</p><p>متوسط مرة اللعب: <strong>' + (closed ? duration(s.closedSeconds / closed) : '—') + '</strong></p>' +
        '<p>مرات اللعب: <strong>' + fmt(s.sessions) + '</strong> · خرجوا بسرعة: <strong>' + fmt(s.short) + '</strong></p>' +
        (closed ? '' : open) : empty('لا يوجد لعب في هذه الفترة.');

      var first = 24, last = -1, max = 0, html = '';
      hours.forEach(function (v, h) { if (v > 0) { first = Math.min(first, h); last = h; max = Math.max(max, v); } });
      for (var h = first; h <= last; h++) {
        html += '<div class="hour" title="من ' + h + ':00 إلى ' + h + ':59: ' + duration(hours[h]) + '" data-hour="' + h +
          '"><span class="bar" style="height:' + Math.max(2, Math.round(hours[h] / max * 100)) + '%"></span><span class="hl">' + h + '</span></div>';
      }
      $('cardHours').innerHTML = last < 0 ? empty('لا يوجد لعب في هذه الفترة.') :
        '<div class="hours" role="img" aria-label="أكثر ساعة لعبًا تبدأ ' + hours.indexOf(max) + ':00">' + html + '</div>' +
        '<p class="hint">وقت اللعب الفعلي حسب الساعة' + (combined ? '. عند عرض عدة أجهزة تشمل الساعات كل الأيام في الملفات، ' +
          'وفيها فقط الساعات التي لُعبت فيها كل لعبة في 3 أيام أو أكثر، لا في كل أيامها.' : '.') + '</p>';

      var items = [];
      s.games.forEach(function (g) {
        var l = stuck(g.levels)[0];
        if (l && items.length < 3) {
          items.push('<li data-game="' + esc(g.game) + '" data-level="' + esc(l.level) + '"><span class="name">' + esc(g.name) +
            '</span>: المرحلة أو الوضع ' + levelName(l.level) + ' — توقفوا عندها ' + fmt(l.gaveUp) + ' من ' + count(l.visits, VISITS) + '</li>');
        }
      });
      $('cardStuck').innerHTML = items.length ? '<ul>' + items.join('') + '</ul><a href="#stuckSection">التفاصيل</a>'
        : empty('لا توجد بعد مرحلة زارها الأطفال 5 مرات أو أكثر وتوقفوا عندها.');
    }

    function renderGames(s) {
      if (!s.games.length) { $('gameTable').innerHTML = empty('لا يوجد لعب في هذه الفترة.'); return; }
      var html = '<div class="scroll"><table class="games"><thead><tr><th scope="col">اللعبة</th><th scope="col">وقت اللعب الفعلي</th>' +
        '<th scope="col">مرات اللعب</th><th scope="col">خرجوا بسرعة</th><th scope="col">أيام اللعب</th><th scope="col">❤</th></tr></thead><tbody>';
      // Several PCs together: a date counts once, and the cell says on how many PCs.
      s.games.forEach(function (g) {
        var heart = g.hearted ? (s.pcs > 1 ? '❤ ' + g.hearted : '❤') : '';
        html += '<tr data-game="' + esc(g.game) + '" data-seconds="' + g.seconds + '" data-sessions="' + g.sessions + '" data-short="' +
          g.short + '" data-days="' + g.days + '" data-pcs="' + g.pcs + '"><th scope="row">' + (g.levels.length ? '<a href="#lv-' +
          esc(g.game) + '" data-open="lv-' + esc(g.game) + '" title="مراحل هذه اللعبة أو أوضاعها">' + esc(g.name) + '</a>' : esc(g.name)) +
          '</th><td>' + duration(g.seconds) + '</td><td>' + fmt(g.sessions) +
          (g.open ? '<span class="small open-note" title="' + OPEN_NOTE + '">ما زالت مفتوحة</span>' : '') + '</td><td>' +
          fmt(g.short) + '</td><td>' + fmt(g.days) + (s.pcs > 1 ? '<span class="small">على ' + count(g.pcs, ON_PCS) + '</span>' : '') +
          '</td><td class="heart">' + heart + '</td></tr>';
      });
      $('gameTable').innerHTML = html + '</tbody></table></div><p class="hint">اضغط اسم اللعبة لترى مراحلها أو أوضاعها.</p>';
    }

    function resultText(l) {
      var r = levelResult(l);
      if (!r) return '—';
      return r.avg !== undefined ? 'متوسط النتيجة ' + fmt(r.avg) + ' · أفضل نتيجة ' + fmt(r.best)
        : 'فازوا في ' + fmt(r.wins) + ' من ' + count(r.tries, TRIES);
    }

    function renderStuck(s) {
      var html = '';
      s.games.forEach(function (g) {
        var top = stuck(g.levels);
        if (!top.length) return;
        html += '<div class="stuck" data-game="' + esc(g.game) + '"><h3>' + esc(g.name) + '</h3><ol>';
        top.forEach(function (l) {
          html += '<li data-level="' + esc(l.level) + '" data-gave-up="' + l.gaveUp + '" data-visits="' + l.visits + '">المرحلة أو الوضع ' +
            levelName(l.level) + ': توقفوا عندها ' + fmt(l.gaveUp) + ' من ' + count(l.visits, VISITS) +
            '<span class="meter"><span style="width:' + pct(l.gaveUp / l.visits) + '"></span></span>' +
            (levelResult(l) ? '<span class="small">' + resultText(l) + '</span>' : '') + '</li>';
        });
        html += '</ol></div>';
      });
      $('stuck').innerHTML = html || empty('لا توجد بعد مراحل زارها الأطفال 5 مرات أو أكثر وتوقفوا عندها.');
    }

    function renderLevels(s) {
      var open = {}, html = '';
      Array.prototype.forEach.call(document.querySelectorAll('#levels details[open]'), function (d) { open[d.id] = 1; });
      s.games.forEach(function (g) {
        if (!g.levels.length) return;
        html += '<details id="lv-' + esc(g.game) + '"' + (open['lv-' + g.game] ? ' open' : '') + '><summary>' + esc(g.name) + ' (' +
          g.levels.length + ')</summary><div class="scroll"><table><thead><tr><th scope="col">المرحلة أو الوضع</th><th scope="col">مرات البدء</th>' +
          '<th scope="col">الزيارات</th><th scope="col">توقفوا عند هذه المرحلة</th><th scope="col">الفوز أو النتيجة</th>' +
          '<th scope="col">وقت اللعب الفعلي</th></tr></thead><tbody>';
        // Giving up means something only where children can win or lose.
        g.levels.forEach(function (l) {
          html += '<tr data-level="' + esc(l.level) + '" data-winnable="' + (l.winnable ? 1 : 0) + '"><th scope="row">' + levelName(l.level) +
            '</th><td>' + fmt(l.starts) + '</td><td>' + fmt(l.visits) + '</td><td>' + (l.winnable ? fmt(l.gaveUp) : '—') + '</td><td>' +
            resultText(l) + '</td><td>' + duration(l.seconds) + '</td></tr>';
        });
        html += '</tbody></table></div></details>';
      });
      $('levels').innerHTML = html || empty('لم تسجّل الألعاب مراحل في هذه الفترة.');
    }

    function renderDevice(s) {
      var unmeasured = [];
      var rows = s.games.map(function (g) {
        var v = NO_FRAMES.indexOf(g.game) < 0 ? verdict(g.f, g.loads, g.loadSum) || 'none' : 'unmeasured';
        if (v === 'unmeasured') unmeasured.push('«' + esc(g.name) + '»');
        return '<tr data-game="' + esc(g.game) + '" data-verdict="' + v + '"><th scope="row">' + esc(g.name) + '</th><td class="v-' +
          v + '">' + (VERDICTS[v] || '—') + '</td><td>' + (g.loads ? (g.loadSum / g.loads / 1000).toFixed(1) + ' ث' : '—') +
          '</td><td>' + (g.loads ? (g.loadMax / 1000).toFixed(1) + ' ث' : '—') + '</td><td>' + fmt(g.ns) + '</td><td>' +
          fmt(g.errors + g.timeouts) + '</td></tr>';
      });
      $('device').innerHTML = rows.length ? '<div class="scroll"><table><thead><tr><th scope="col">اللعبة</th><th scope="col">الحالة</th>' +
        '<th scope="col">متوسط التحميل</th><th scope="col">أطول تحميل</th><th scope="col">لم تبدأ</th>' +
        '<th scope="col" title="أخطاء أوقفت اللعبة ومرات لم تُحمَّل خلال 20 ثانية">أخطاء</th></tr></thead><tbody>' + rows.join('') +
        '</tbody></table></div>' + (unmeasured.length ? '<p class="hint" id="unmeasured">«لا تُقاس»: ' + unmeasured.join('، ') +
        ' لا ترسم حركة مستمرة أثناء اللعب، فلا تُقاس فيها سرعة الرسم. زمن التحميل والأخطاء تُحسب لها كغيرها.</p>' : '')
        : empty('لا يوجد لعب في هذه الفترة.');
    }

    function renderBars(entries, label) {
      var max = 0;
      entries.forEach(function (e) { max = Math.max(max, e[1]); });
      if (!max) return empty('لا توجد أرقام في هذه الفترة.');
      return '<ul class="bars">' + entries.filter(function (e) { return e[1] > 0; }).map(function (e) {
        return '<li data-key="' + e[0] + '"><span class="label">' + label(e[0]) + '</span><span class="meter"><span style="width:' +
          pct(e[1] / max) + '"></span></span><span class="num">' + fmt(e[1]) + '</span></li>';
      }).join('') + '</ul>';
    }
    function renderSources(s) {
      var entries = SOURCES.map(function (k) { return [k, s.src[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      $('sources').innerHTML = renderBars(entries, function (k) { return SOURCE_NAMES[k]; });
    }
    function renderSettings(s) {
      var labels = { calm: 'تشغيل وضع الصف', fs: 'الدخول إلى ملء الشاشة', mute: 'كتم الصوت أو تشغيله داخل الألعاب' };
      $('settings').innerHTML = renderBars([['calm', s.calm], ['fs', s.fs], ['mute', s.mute]], function (k) { return labels[k]; });
    }
    function renderTutorials(s) {
      var rows = s.games.filter(function (g) { return g.tu[0] || g.tu[1]; });
      $('tutorials').innerHTML = rows.length ? '<div class="scroll"><table><thead><tr><th scope="col">اللعبة</th><th scope="col">ظهر الشرح الأول</th>' +
        '<th scope="col">اكتمل</th></tr></thead><tbody>' + rows.map(function (g) {
          return '<tr data-game="' + esc(g.game) + '"><th scope="row">' + esc(g.name) + '</th><td>' + fmt(g.tu[0]) + '</td><td>' +
            fmt(g.tu[1]) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : empty('لم يظهر شرح أول في هذه الفترة.');
    }

    // This PC's hardware: shown on the page only, never stored or exported.
    function renderHardware() {
      var gpu = '';
      try {
        var gl = document.createElement('canvas').getContext('webgl');
        if (gl) {
          var ext = gl.getExtension('WEBGL_debug_renderer_info');
          gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
          var lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        }
      } catch (e) { gpu = ''; }
      var cores = navigator.hardwareConcurrency, memory = navigator.deviceMemory;
      $('hardware').innerHTML = '<h3>هذا الجهاز</h3><dl class="facts"><dt>أنوية المعالج</dt><dd>' + (cores ? fmt(cores) : 'غير معروف') +
        '</dd><dt>الذاكرة</dt><dd>' + (memory ? 'حوالي ' + memory + ' غيغابايت' + (memory >= 8 ? ' أو أكثر' : '') : 'غير معروفة') +
        '</dd><dt>الشاشة</dt><dd>' + bdi(screen.width + '×' + screen.height, true) + '</dd><dt>شريحة الرسوم</dt><dd>' +
        (gpu ? bdi(plain(gpu, 120), true) : 'غير معروفة') + '</dd></dl><p class="hint">تظهر هذه المعلومات هنا فقط، ولا تدخل في ملفات التصدير.</p>';
    }

    function renderActions() {
      var ok = state.ok;
      ['pcLabel', 'saveLabel', 'exportXlsx', 'exportJson', 'stopBtn', 'resumeBtn', 'clearBtn'].forEach(function (id) { $(id).disabled = !ok; });
      if (document.activeElement !== $('pcLabel')) $('pcLabel').value = state.meta.label;
      $('stopBtn').hidden = state.meta.off;
      $('resumeBtn').hidden = !state.meta.off;
      if (state.meta.off) $('stopConfirm').hidden = true;
      $('stopState').innerHTML = !ok ? '' : state.meta.off ? 'جمع الإحصاءات متوقف على هذا الجهاز' +
        (state.meta.offSince ? ' منذ ' + showDate(dateKey(new Date(state.meta.offSince))) : '') + '.'
        : 'يجمع هذا الجهاز الإحصاءات الآن.';
      $('lastExport').innerHTML = !ok ? '' : state.meta.lastExport ? 'آخر تصدير: ' + showDate(dateKey(new Date(state.meta.lastExport))) + '.'
        : 'لم يُصدَّر شيء من هذا الجهاز بعد.';
      $('clearText').textContent = 'ستُحذف كل الأيام المحفوظة على هذا الجهاز (' + count(state.days.length, DAYS) + '). صدّر ملف Excel ' +
        'أولًا إن أردت الاحتفاظ بها. يبقى اسم الجهاز ومعرّفه وإعداد الإيقاف. اكتب «امسح» للتأكيد:';
    }

    /* ---------------------------------------------------------- actions */
    function write(statusId, change, done) {
      try { updateMeta(change); say(statusId, done); }
      catch (e) { say(statusId, 'تعذّر الحفظ في هذا المتصفح.', true); }
      load();
      render();
    }

    function download(name, bytes, type) {
      var url = URL.createObjectURL(new Blob([bytes], { type: type })), a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.hidden = true;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    }

    // An export counts (lastExport, which quiets the reminder) only once its file
    // is saved. Edge and Chrome show their save dialog (showSaveFilePicker, offered
    // only in a secure context: https, localhost or a file:// page), so a cancelled
    // dialog saves and counts nothing. Without that dialog (other browsers, plain
    // http from another computer) or when the browser refuses it, the file is
    // downloaded and the teacher confirms that it was saved.
    function counted(when, text) {
      try { updateMeta(function (raw) { raw.lastExport = when; }); } catch (e) { /* the file is saved all the same */ }
      say('exportStatus', text);
      load();
      render();
    }
    function asking(job) { pending = job; $('exportAsk').hidden = !job; }

    // Every export holds all stored days, not just the period on screen.
    function exportAs(kind) {
      if (!state.ok) return;
      var now = new Date(), id = state.meta.id;
      if (!id) {
        try { id = updateMeta(function () {}); } catch (e) { id = newId(); }
        load();
      }
      var info = localInfo(now), accept = {};
      info.pc = id;
      var t = tables(state.days, info), name = 'play-stats_' + id + '_' + info.today + '.' + kind;
      var type = kind === 'xlsx' ? XLSX_TYPE : 'application/json';
      var bytes = kind === 'xlsx' ? xlsx(t, info, now) : utf8(JSON.stringify(exportJson(t, info)));
      var what = name + ' (' + count(state.days.length, DAYS) + ')';
      accept[type] = ['.' + kind];
      asking(null);
      say('exportStatus', '');
      if (typeof window.showSaveFilePicker !== 'function') { fallback(); return; }
      window.showSaveFilePicker({ suggestedName: name, id: 'play-stats', types: [{ description: kind === 'xlsx' ? 'Excel' : 'JSON', accept: accept }] })
        .then(function (file) {
          return file.createWritable().then(function (out) {
            return out.write(bytes).then(function () { return out.close(); });
          }).then(function () { counted(now.getTime(), 'حُفظ الملف ' + what + '.'); }, function () {
            say('exportStatus', 'تعذّر حفظ الملف ' + name + ' في المكان المختار، فلم يُسجَّل التصدير. جرّب مرة أخرى أو اختر مجلدًا آخر.', true);
          });
        }, function (e) {
          if (e && e.name === 'AbortError') say('exportStatus', 'لم يُحفظ الملف لأن نافذة الحفظ أُغلقت، فلم يُسجَّل التصدير.', true);
          else fallback();
        });
      function fallback() {
        download(name, bytes, type);
        say('exportStatus', 'بدأ تنزيل الملف ' + what + '.');
        asking({ when: now.getTime(), what: what });
      }
    }

    function openFiles(chosen) {
      var files = Array.prototype.slice.call(chosen, 0, 100), waiting = files.length, found = [], ignored = [];
      if (!waiting) return;
      files.forEach(function (file, i) {
        if (file.size > 20 * 1048576) { ignored.push(file.name); finish(); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var src = readImport(String(reader.result), NAMES);
          if (src) found[i] = src; else ignored.push(file.name);
          finish();
        };
        reader.onerror = function () { ignored.push(file.name); finish(); };
        reader.readAsText(file);
      });
      function finish() {
        if (--waiting) return;
        found.forEach(function (src) {
          if (src && !state.files.some(function (f) { return f.pc.id === src.pc.id && f.exported_at === src.exported_at; })) state.files.push(src);
        });
        state.ignored = ignored;
        $('files').value = '';
        render();
        if (state.files.length) $('combined').scrollIntoView({ block: 'start' });
      }
    }

    // A typed word confirms stopping and clearing. Hamza forms, tatweel and
    // quotes are ignored; the typed text is compared, never kept.
    function same(a, b) {
      var n = function (s) { return String(s).replace(/[«»"'\sـً-ْ]/g, '').replace(/[أإآ]/g, 'ا'); };
      return n(a) === n(b);
    }
    function confirmWith(form, word, statusId, action) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = form.querySelector('input');
        if (!same(input.value, word)) { say(statusId, 'الكلمة غير صحيحة. اكتب «' + word + '» كما هي.', true); input.focus(); return; }
        input.value = '';
        form.hidden = true;
        action();
      });
      form.querySelector('[data-cancel]').addEventListener('click', function () {
        form.querySelector('input').value = '';
        form.hidden = true;
        say(statusId, '');
      });
    }
    function ask(form) {
      form.hidden = false;
      form.querySelector('input').focus();
    }

    /* ----------------------------------------------------------- wiring */
    $('saveLabel').addEventListener('click', function () {
      var label = cleanLabel($('pcLabel').value);
      $('pcLabel').blur();
      write('labelStatus', function (raw) { raw.pc.label = label; }, label ? 'حُفظ الاسم: «' + label + '».' : 'حُذف اسم الجهاز.');
    });
    $('pcLabel').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('saveLabel').click(); });
    $('exportXlsx').addEventListener('click', function () { exportAs('xlsx'); });
    $('exportJson').addEventListener('click', function () { exportAs('json'); });
    $('exportYes').addEventListener('click', function () {
      var job = pending;
      asking(null);
      if (job) counted(job.when, 'سُجّل تصدير الملف ' + job.what + '.');
    });
    $('exportNo').addEventListener('click', function () {
      asking(null);
      say('exportStatus', 'لم يُسجَّل التصدير. صدّر الملف مرة أخرى واحفظه.', true);
    });
    $('openFiles').addEventListener('click', function () { $('files').click(); });
    $('files').addEventListener('change', function () { openFiles($('files').files || []); });
    $('stopBtn').addEventListener('click', function () { say('stopStatus', ''); ask($('stopConfirm')); });
    confirmWith($('stopConfirm'), 'أوقف', 'stopStatus', function () {
      write('stopStatus', function (raw) { raw.off = true; raw.offSince = Date.now(); }, 'توقف جمع الإحصاءات على هذا الجهاز.');
    });
    $('resumeBtn').addEventListener('click', function () {
      write('stopStatus', function (raw) { raw.off = false; delete raw.offSince; }, 'عاد جمع الإحصاءات على هذا الجهاز.');
    });
    $('clearBtn').addEventListener('click', function () { say('clearStatus', ''); ask($('clearConfirm')); });
    confirmWith($('clearConfirm'), 'امسح', 'clearStatus', function () {
      // Save the moment first: the portal drops anything it recorded before it,
      // even if it writes between the two steps. Its next record sets a new start date.
      try {
        updateMeta(function (raw) { raw.clearedAt = Date.now(); delete raw.since; delete raw.pruned; });
        clearStats(store);
        say('clearStatus', 'مُسحت إحصاءات هذا الجهاز.');
      } catch (e) { say('clearStatus', 'تعذّر الحفظ في هذا المتصفح.', true); }
      load();
      render();
    });
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('[data-open]') : null;
      if (link && $(link.getAttribute('data-open'))) $(link.getAttribute('data-open')).open = true;
      if (e.target.id === 'backLocal') { state.files = []; state.ignored = []; render(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="period"]'), function (input) {
      input.addEventListener('change', render);
    });
    $('deviceSection').addEventListener('toggle', function () {
      if ($('deviceSection').open && !$('hardware').innerHTML) renderHardware();
    });
    // The portal writes while children play in another tab: follow it.
    window.addEventListener('storage', function (e) {
      if (e.key !== null && e.key.indexOf('sg:site:stats') !== 0) return;
      clearTimeout(refresh);
      refresh = setTimeout(function () { load(); render(); }, 500);
    });

    // A page restored from the back/forward cache missed storage events.
    window.addEventListener('pageshow', function (e) { if (e.persisted) { load(); render(); } });

    load();
    render();
  }
})();

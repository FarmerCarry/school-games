/*
 * أصابع البرق (Lightning Fingers) — a Monkeytype-style typing test in English and Arabic.
 *
 * How it works (short version):
 *   - Input: one window keydown listener reads e.key. A key may insert several characters at once
 *     (the Arabic لا key: e.key "لا", or — as Chrome on Windows does — keydown "Unidentified" followed
 *     by two keypress events ل + ا, handled as ONE keystroke). No hidden <input> is needed.
 *   - Words: every word is a flex item; its letters are plain INLINE spans (so Arabic letters stay
 *     joined while each one gets its own colour). A keystroke only touches the affected span.
 *     Ligatures (one glyph for two letters, e.g. لا) are split with zero-width joiners whenever the
 *     two letters must look different (see "ligatures" below).
 *   - Caret: a separate absolutely-positioned bar inside #words, placed from ONE Range rect of the
 *     next letter per keystroke (RTL: right edge of the next letter; LTR: left edge).
 *   - Lines: #words is translated up one line at a time so the active word stays on line 2.
 *   - Stats: TTEngine (engine.js) ports Monkeytype's formulas. Challenge codes seed a PRNG.
 */
(function () {
  'use strict';

  var E = window.TTEngine;
  var KB = window.TTKeyboard;
  var store = Kit.store('typing-test');
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;

  /* ------------------------------------------------------------ settings */
  var S = (function () {
    var d = { lang: 'en', mode: 'time', amt: { time: 30, words: 25, sentences: 3 }, lenient: true, kbd: false, sound: false, theme: 'dark' };
    var s = store.get('settings', null);
    if (s && typeof s === 'object') {
      if (s.lang === 'ar' || s.lang === 'en') d.lang = s.lang;
      if (E.MODES.indexOf(s.mode) >= 0) d.mode = s.mode;
      if (s.amt && typeof s.amt === 'object') E.MODES.forEach(function (m) { if (E.AMOUNTS[m].indexOf(s.amt[m]) >= 0) d.amt[m] = s.amt[m]; });
      if (typeof s.lenient === 'boolean') d.lenient = s.lenient;
      d.kbd = !!s.kbd;
      d.sound = !!s.sound;
      if (s.theme === 'light') d.theme = 'light';
    }
    return d;
  })();
  function saveSettings() { store.set('settings', S); }

  /* ---------------------------------------------------------------- text */
  // English is wrapped in a Unicode isolate so "English · 10 كلمات" keeps its order inside Arabic text.
  var LANG_NAME = { en: '\u2066English\u2069', ar: 'العربية' };
  function amtText(mode, amt) {
    if (mode === 'time') return amt + ' ثانية';
    if (mode === 'words') return amt + (amt <= 10 ? ' كلمات' : ' كلمة');
    return amt + ' جمل';
  }
  var MODE_ICON = { time: '⏱️', words: '🔤', sentences: '📜' };
  function typeText(o) { return LANG_NAME[o.lang] + ' · ' + MODE_ICON[o.mode] + ' ' + amtText(o.mode, o.amt); }
  function lenText(l) { return l ? 'تساهل في الهمزات ✓' : 'بدون تساهل'; }
  // Speed as an Arabic unit ("words per minute"), like km/h; 'wpm' stays only as a small tag on results.
  var UNIT = 'كلمة/د';
  function speedHtml(v) { return '<span dir="rtl">' + Math.round(v) + ' ' + UNIT + '</span>'; }
  function lastResultsText(n) {
    if (n === 1) return 'آخر نتيجة';
    if (n === 2) return 'آخر نتيجتين';
    if (n <= 10) return 'آخر ' + n + ' نتائج';
    return 'آخر ' + n + ' نتيجة';
  }

  /* ------------------------------------------------------------- elements */
  var testView = $('testView'), resView = $('resView');
  var wordsEl = $('words'), clipEl = $('clip'), wordsBox = $('wordsBox');
  var liveEl = $('live'), timerEl = $('timer'), liveWpmEl = $('liveWpm');
  var kbdEl = $('kbd'), warnEl = $('warn'), capsEl = $('caps'), unfocusEl = $('unfocus'), hintEl = $('hint');
  var caret = document.createElement('div');
  caret.id = 'caret';
  var rng = document.createRange();

  /* ---------------------------------------------------------------- state */
  var T = null;            // the current test
  var screen = 'test';     // 'test' | 'results'
  var modal = null;        // id of the open modal
  var lastResult = null;
  var finishedAt = 0;
  var tickTimer = 0;
  var lineH = 40, caretH = 30, caretW = 3;
  var clockSkew = 0;       // test hook: typeText(str, ms) advances a virtual clock
  function now() { return performance.now() + clockSkew; }
  function randomSeed() { return (Math.floor(Math.random() * 4294967296) >>> 0); } // seed choice only; generation is PRNG

  /* ------------------------------------------------------- start a test */
  // opts: { code } challenge | { repeat: true } same words | { seed } fixed seed | {} fresh words
  function newTest(opts) {
    opts = opts || {};
    clearTimeout(tickTimer);
    var cfg;
    if (opts.code) {
      var c = E.parseCode(opts.code);
      if (!c) return false;
      cfg = { lang: c.lang, mode: c.mode, amt: c.amt, lenient: true, seed: c.seed, code: c.code, pick: c.pick };
    } else if (opts.repeat && T) {
      cfg = { lang: T.lang, mode: T.mode, amt: T.amt, lenient: T.lenient, seed: T.seed, code: T.code, pick: T.pick };
    } else {
      cfg = { lang: S.lang, mode: S.mode, amt: S.amt[S.mode], lenient: S.lenient, seed: opts.seed != null ? (opts.seed >>> 0) : randomSeed(), code: null, pick: null };
    }
    T = {
      lang: cfg.lang, mode: cfg.mode, amt: cfg.amt, lenient: cfg.lenient, seed: cfg.seed, code: cfg.code, pick: cfg.pick,
      gen: E.generator(cfg.lang, cfg.mode, cfg.amt, cfg.seed, cfg.pick),
      words: [], els: [], hist: [], cur: 0, input: '',
      phase: 'ready', start: 0, corr: 0, inc: 0, keys: [], errs: [], wpmHist: [], liveWpm: 0, scroll: 0
    };
    body.classList.remove('typing');
    body.classList.toggle('challenge', !!T.code);
    $('bar').title = T.code ? 'أنت في تحدي الصف: اخرج منه أولًا بزر ✕' : '';
    if (T.lang !== 'en') capsEl.hidden = true; // Caps Lock only matters for English
    hintEl.hidden = false;
    hideWarn(true);
    showScreen('test');
    render();
    updateBar();
    updateLive();
    updateChallengeTag();
    updateFoot();
    return true;
  }
  // Tab: a fresh test, or the same challenge again while in a class challenge.
  function quickRestart() {
    if (T && T.code) newTest({ repeat: true });
    else newTest();
  }

  function render() {
    var ar = T.lang === 'ar';
    testView.classList.toggle('ar', ar);
    testView.classList.toggle('en', !ar);
    wordsEl.setAttribute('dir', ar ? 'rtl' : 'ltr');
    wordsEl.setAttribute('lang', T.lang);
    liveEl.setAttribute('dir', ar ? 'rtl' : 'ltr');
    wordsEl.classList.add('noanim');
    wordsEl.textContent = '';
    wordsEl.style.transform = 'translateY(0px)';
    appendWords(T.gen.take(T.gen.finite ? 1000 : 100));
    wordsEl.appendChild(caret);
    caret.className = 'blink';
    measure();
    placeCaret();
    void wordsEl.offsetWidth; // commit the jump before transitions come back
    wordsEl.classList.remove('noanim');
    if (S.kbd) { KB.build(kbdEl, T.lang); updateKbd(); }
  }
  function appendWords(list) {
    var frag = document.createDocumentFragment(), ar = T.lang === 'ar';
    for (var i = 0; i < list.length; i++) {
      var w = list[i], el = document.createElement('div');
      el.className = 'w';
      for (var j = 0; j < w.length; j++) {
        var s = document.createElement('span');
        s.ch = w[j];
        s.textContent = w[j];
        el.appendChild(s);
      }
      if (ar) for (var k = 0; k < w.length; k++) paintLetter(el, k);
      T.words.push(w);
      T.els.push(el);
      frag.appendChild(el);
    }
    wordsEl.appendChild(frag);
  }
  function measure() {
    var el = T && T.els[0];
    if (!el) return;
    lineH = el.offsetHeight || lineH;
    caretH = caret.offsetHeight || caretH;
    caretW = caret.offsetWidth || caretW;
  }

  /* ----------------------------------------------------------- ligatures */
  // The font draws some Arabic letter pairs as ONE glyph: لا (ل + ا/أ/إ/آ) and, in this font, a final
  // ي/ى/ئ after letters like ب ت ن ف ك (في, بني, على…). Such a glyph takes the colour of its first
  // letter and the second letter's span gets a zero-width box, so a half-typed pair looked fully
  // typed, a wrong second letter never turned red and the caret could not stand between the two.
  // A zero-width joiner (ZWJ) on both sides of the span boundary keeps the letters joined but
  // stops the ligature, and each letter then gets its own colour and its own box for the caret:
  //   - لا keeps its ligature while both letters look the same (untyped, or both typed right/wrong,
  //     like the brief allows) and is split while they differ, or when both are extra letters (so the
  //     caret moves on every extra letter). Its width changes by ~1 px: the line never re-flows mid-word.
  //   - every other joined pair is always split, so the optional ligatures (في, بي…) are simply
  //     never used in the typing area; all other words render exactly as without the joiners.
  // English has the same problem with Fredoka's fi/fl/ll/tt ligatures: style.css turns them off.
  var ZWJ = '\u200D';
  var AR_JOIN_NEXT = 'ئبتثجحخسشصضطظعغفقكلمنهىي';   // letters that connect to the following letter
  var AR_JOIN_PREV = AR_JOIN_NEXT + 'آأؤإاةدذرزو';   // letters that connect to the letter before them
  var ALEFS = 'اأإآ';
  // Must spans i and i+1 of a word be drawn apart?
  function splitAt(el, i) {
    var ns = el.childNodes, a = ns[i], b = ns[i + 1];
    if (!a || !b || AR_JOIN_NEXT.indexOf(a.ch) < 0 || AR_JOIN_PREV.indexOf(b.ch) < 0) return false;
    if (a.ch === 'ل' && ALEFS.indexOf(b.ch) >= 0) return a.className !== b.className || a.className === 'x';
    return true;
  }
  function paintLetter(el, i) {
    var sp = el.childNodes[i];
    if (!sp || sp.ch == null) return;
    var t = (i > 0 && splitAt(el, i - 1) ? ZWJ : '') + sp.ch + (splitAt(el, i) ? ZWJ : '');
    if (sp.textContent !== t) sp.textContent = t;
  }
  // After span i changed (its colour, or it was added/removed): at most 3 spans, usually no DOM write.
  function syncLig(el, i) {
    if (T.lang !== 'ar') return;
    paintLetter(el, i - 1); paintLetter(el, i); paintLetter(el, i + 1);
  }

  /* ----------------------------------------------------------- the caret */
  // One Range rect per call. Also scrolls lines so the active word stays on the 2nd line.
  function placeCaret() {
    var el = T.els[T.cur];
    if (!el) return;
    var n = el.childNodes.length, pos = T.input.length, rtl = T.lang === 'ar', r, x;
    if (pos < n) {
      rng.selectNodeContents(el.childNodes[pos]);
      r = rng.getBoundingClientRect();
      x = rtl ? r.right : r.left;
    } else {
      rng.selectNodeContents(el.childNodes[n - 1]);
      r = rng.getBoundingClientRect();
      x = rtl ? r.left : r.right;
    }
    var base = wordsEl.getBoundingClientRect();
    var top = el.offsetTop;
    if (top - T.scroll > lineH * 1.5) {
      T.scroll = lineAbove(T.cur, top);
      wordsEl.style.transform = 'translateY(' + (-T.scroll) + 'px)';
    }
    var cx = x - base.left - caretW / 2, cy = top + (lineH - caretH) / 2;
    caret.style.transform = 'translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px)';
  }
  // Top of the line just above word i (exact, from the words' own offsets; no rounding drift).
  function lineAbove(i, top) {
    for (var j = i - 1; j >= 0; j--) { var t = T.els[j].offsetTop; if (t < top - 1) return t; }
    return Math.max(0, top - lineH);
  }
  // After a resize or the web font arriving: lines re-flow, so re-measure everything.
  function relayout() {
    if (screen === 'results' && lastResult) { drawChart(lastResult); }
    drawSpark();
    if (!T || screen !== 'test') return;
    wordsEl.classList.add('noanim');
    measure();
    var el = T.els[T.cur], top = el ? el.offsetTop : 0;
    T.scroll = top >= lineH * 0.5 ? lineAbove(T.cur, top) : 0;
    wordsEl.style.transform = 'translateY(' + (-T.scroll) + 'px)';
    placeCaret();
    void wordsEl.offsetWidth;
    wordsEl.classList.remove('noanim');
  }

  /* -------------------------------------------------------------- typing */
  function secIndex(t) {
    var s = Math.max(0, Math.floor((t - T.start) / 1000));
    if (T.mode === 'time') s = Math.min(s, T.amt - 1);
    return s;
  }
  // Typed with the other keyboard language? In an Arabic test the English layout gives Latin letters,
  // and on the letter keys و ز ك ط ج د ذ ظ it gives , . ; ' [ ] ` / (only a slip if a letter is expected).
  var AR_KEYS_ON_EN = ",.;'[]`/";
  function wrongScript(c, expected) {
    if (T.lang !== 'ar') return E.isArabicChar(c);
    if (E.isLatinLetter(c)) return true;
    return AR_KEYS_ON_EN.indexOf(c) >= 0 && !!expected && /[\u0621-\u064A]/.test(expected);
  }

  // k = the text of ONE keystroke (1 char, or 2 for the لا key). Returns true if anything was typed.
  // quiet = no sound (the 2nd character of a key that arrived as two keypress events).
  function typeKey(k, quiet) {
    if (!T || T.phase === 'done' || screen !== 'test') return false;
    k = E.cleanKey(k);
    var expect = T.words[T.cur][T.input.length];
    for (var i = 0; i < k.length; i++) if (wrongScript(k[i], i ? null : expect)) { langWarn(); return false; }
    if (!warnEl.hidden) hideWarn();
    var t = now();
    if (T.phase === 'ready') startTest(t);
    else if (T.mode === 'time' && t - T.start >= T.amt * 1000) { finish(); return false; }
    var typed = false, wrong = false;
    for (var j = 0; j < k.length && T.phase === 'running'; j++) {
      var r = insertChar(k[j], t);
      if (r !== 0) typed = true;
      if (r < 0) wrong = true;
    }
    if (!typed) return false;
    if (T.phase === 'running') { placeCaret(); updateKbd(); }
    if (!quiet) sound(wrong ? 'err' : 'key');
    return true;
  }
  // 1 = correct, -1 = wrong, 0 = ignored
  function insertChar(c, t) {
    var w = T.words[T.cur], pos = T.input.length;
    if (pos >= w.length + E.MAX_EXTRA) return 0;
    var ok = pos < w.length && E.charEq(c, w[pos], T.lenient);
    T.input += c;
    var sec = secIndex(t);
    T.keys[sec] = (T.keys[sec] || 0) + 1;
    if (ok) T.corr++;
    else { T.inc++; T.errs[sec] = (T.errs[sec] || 0) + 1; }
    var el = T.els[T.cur];
    if (pos < w.length) el.childNodes[pos].className = ok ? 'c' : 'i';
    else {
      var s = document.createElement('span');
      s.className = 'x';
      s.ch = c;
      s.textContent = c;
      el.appendChild(s);
    }
    syncLig(el, pos);
    // words / sentences: typing the last word exactly ends the test (no space needed)
    if (T.gen.finite && T.cur === T.words.length - 1 && E.wordEq(T.input, w, T.lenient)) finish(t);
    return ok ? 1 : -1;
  }
  function space() {
    if (!T || T.phase !== 'running' || T.input === '') return 0; // like Monkeytype: no skipping empty words
    var t = now();
    if (T.mode === 'time' && t - T.start >= T.amt * 1000) { finish(); return 0; }
    var w = T.words[T.cur], ok = E.wordEq(T.input, w, T.lenient);
    var sec = secIndex(t);
    T.keys[sec] = (T.keys[sec] || 0) + 1;
    if (ok) T.corr++;
    else { T.inc++; T.errs[sec] = (T.errs[sec] || 0) + 1; T.els[T.cur].classList.add('err'); }
    T.hist[T.cur] = T.input;
    if (T.gen.finite && T.cur === T.words.length - 1) { finish(t); return ok ? 1 : -1; }
    T.cur++;
    T.input = '';
    if (!T.gen.finite && T.words.length - T.cur < 40) appendWords(T.gen.take(60));
    placeCaret();
    updateKbd();
    updateLive();
    return ok ? 1 : -1;
  }
  // Backspace edits the current word. At the start of a word it goes back into the previous word
  // ONLY if that word has a mistake (Monkeytype rule). whole = Ctrl+Backspace (delete the word).
  function backspace(whole) {
    if (!T || T.phase !== 'running') return false;
    // time is up but the 1 s timer has not fired yet: end the test, don't edit the result
    if (T.mode === 'time' && now() - T.start >= T.amt * 1000) { finish(T.start + T.amt * 1000); return false; }
    var el = T.els[T.cur], w = T.words[T.cur];
    if (T.input.length === 0) {
      if (T.cur === 0) return false;
      var pi = T.cur - 1;
      if (E.wordEq(T.hist[pi], T.words[pi], T.lenient)) return false;
      if (T.els[pi].offsetTop < T.scroll - 1) return false; // that line already scrolled away
      T.cur = pi;
      T.input = T.hist[pi];
      T.hist.length = pi;
      el = T.els[pi];
      w = T.words[pi];
      el.classList.remove('err');
      updateLive();
      if (!whole) { placeCaret(); updateKbd(); return true; }
    }
    if (whole) {
      for (var i = 0; i < Math.min(T.input.length, w.length); i++) el.childNodes[i].className = '';
      while (el.childNodes.length > w.length) el.removeChild(el.lastChild);
      if (T.lang === 'ar') for (var j = 0; j < w.length; j++) paintLetter(el, j);
      T.input = '';
    } else {
      var p = T.input.length - 1;
      if (p >= w.length) el.removeChild(el.lastChild);
      else el.childNodes[p].className = '';
      syncLig(el, p);
      T.input = T.input.slice(0, -1);
    }
    placeCaret();
    updateKbd();
    return true;
  }

  /* --------------------------------------------------------------- timer */
  function startTest(t) {
    T.phase = 'running';
    T.start = t;
    caret.className = '';
    body.classList.add('typing');
    hintEl.hidden = true;
    mouse.x = -1;
    exitKbnav();
    tickTimer = setTimeout(tick, 1000);
    updateLive();
  }
  function currentHist() { var h = T.hist.slice(0, T.cur); h.push(T.input); return h; }
  function tick() {
    clearTimeout(tickTimer);
    if (!T || T.phase !== 'running') return;
    var el = (now() - T.start) / 1000;
    var n = Math.floor(el + 1e-6);
    var upto = T.mode === 'time' ? Math.min(n, T.amt) : n;
    if (upto > T.wpmHist.length) {
      var cc = E.countChars(currentHist(), T.words, T.mode, T.lenient);
      for (var s = T.wpmHist.length + 1; s <= upto; s++) T.wpmHist[s - 1] = E.wpmRaw(cc, s).wpm;
      T.liveWpm = T.wpmHist[upto - 1];
    }
    if (T.mode === 'time' && el >= T.amt - 1e-3) { finish(T.start + T.amt * 1000); return; }
    updateLive();
    tickTimer = setTimeout(tick, Math.max(4, T.start + (n + 1) * 1000 - now() + 1));
  }
  function updateLive() {
    if (!T) return;
    var running = T.phase === 'running';
    var txt;
    if (T.mode === 'time') {
      var left = running ? Math.max(0, T.amt - Math.floor((now() - T.start) / 1000 + 1e-6)) : T.amt;
      txt = String(left);
    } else txt = T.cur + '/' + T.words.length;
    timerEl.textContent = txt;
    timerEl.className = running ? '' : 'dim';
    liveWpmEl.textContent = running && T.wpmHist.length ? Math.round(T.liveWpm) + ' ' + UNIT : '';
  }

  /* -------------------------------------------------------------- finish */
  function finish(tEnd) {
    if (!T || T.phase !== 'running') return;
    clearTimeout(tickTimer);
    T.phase = 'done';
    if (tEnd == null) tEnd = now();
    var secs = T.mode === 'time' ? T.amt : (tEnd - T.start) / 1000;
    var R = E.results({
      hist: currentHist(), words: T.words, mode: T.mode, lenient: T.lenient, seconds: secs,
      correctKeys: T.corr, incorrectKeys: T.inc, keys: T.keys, errs: T.errs, wpmHist: T.wpmHist
    });
    R.lang = T.lang; R.mode = T.mode; R.amt = T.amt; R.lenient = T.lenient; R.code = T.code; R.seed = T.seed;
    R.t = Date.now();
    R.valid = R.acc >= 75 && R.wpm > 0;
    record(R);
    lastResult = R;
    finishedAt = performance.now();
    body.classList.remove('typing');
    KB.show('', false);
    showResults(R);
  }
  function pbKey(o) { return o.lang + '|' + o.mode + '|' + o.amt + '|' + (o.lenient ? 'l' : 's'); }
  function getPbs() { var p = store.get('pbs', {}); return p && typeof p === 'object' ? p : {}; }
  function getHist() { var h = store.get('hist', []); return Array.isArray(h) ? h : []; }
  // Every finished test goes into the history (so beginners see their progress too); only results
  // with at least 75% accuracy can be personal bests. Low-accuracy entries are flagged v:0.
  function record(R) {
    var pbs = getPbs(), key = pbKey(R), old = pbs[key];
    R.prevPb = old && typeof old.wpm === 'number' ? old.wpm : null;
    R.isPb = false;
    if (R.valid && (R.prevPb == null || R.wpm > R.prevPb)) {
      pbs[key] = { wpm: R.wpm, acc: R.acc, raw: R.raw, cons: R.consistency, t: R.t };
      store.set('pbs', pbs);
      R.isPb = true;
    }
    var h = getHist();
    var e = { t: R.t, lang: R.lang, mode: R.mode, amt: R.amt, len: R.lenient ? 1 : 0, wpm: R.wpm, raw: R.raw, acc: R.acc, cons: R.consistency };
    if (!R.valid) e.v = 0;
    if (R.code) e.code = R.code;
    h.push(e);
    while (h.length > 30) h.shift();
    store.set('hist', h);
  }

  /* ------------------------------------------------------------- results */
  function showScreen(s) {
    screen = s;
    body.classList.toggle('results', s === 'results');
    testView.hidden = s !== 'test';
    resView.hidden = s !== 'results';
  }
  function showResults(R) {
    showScreen('results');
    var wpmEl = $('rWpm'), accEl = $('rAcc');
    wpmEl.textContent = Math.round(R.wpm);
    wpmEl.title = R.wpm.toFixed(2) + ' كلمة في الدقيقة';
    accEl.textContent = Math.floor(R.acc) + '%';
    accEl.title = R.acc.toFixed(2) + '% — ' + R.correctKeys + ' ضغطة صحيحة و' + R.incorrectKeys + ' خاطئة';
    [wpmEl, accEl].forEach(function (n) { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); });
    $('rType').innerHTML = typeText(R) + '<br><small style="color:var(--sub)">' + lenText(R.lenient) + '</small>';
    $('rRaw').textContent = Math.round(R.raw);
    $('rRaw').title = R.raw.toFixed(2);
    var cs = $('rChars').querySelectorAll('b');
    for (var ci = 0; ci < 4; ci++) cs[ci].textContent = R.chars[ci];
    $('rCons').textContent = Math.round(R.consistency) + '%';
    $('rCons').title = R.consistency.toFixed(2) + '%';
    $('rTime').textContent = Math.round(R.seconds) + ' ث';
    $('rTime').title = R.seconds.toFixed(2) + ' ثانية';

    var shown = Math.round(R.wpm), b = E.badge(shown);
    var nextTxt = b.next ? 'باقي ' + speedHtml(b.next.min - shown) + ' لتصبح ' + b.next.icon + ' ' + b.next.name : 'أنت في القمة! 🌟';
    $('rBadge').innerHTML = '<span class="be">' + b.cur.icon + '</span><div><b>' + b.cur.name + '</b><small>' + nextTxt + '</small></div>';

    var pb = $('rPb');
    pb.className = 'pb';
    if (!R.valid) {
      pb.innerHTML = R.acc < 75 ?
        '<span class="warn">⚠️ الدقة أقل من 75%، لذلك لا تُحسب رقمًا قياسيًا.<br>الدقة أولًا ثم السرعة!</span>' :
        '<span class="warn">⚠️ لم تكتب أي كلمة صحيحة، لذلك لا تُحسب رقمًا قياسيًا.</span>';
    } else if (R.isPb && R.prevPb != null) {
      pb.className = 'pb new';
      // equal after rounding? then show the decimals so the kid sees it really went up
      var was = Math.round(R.prevPb) === shown ? R.prevPb.toFixed(2) + ' ← ' + R.wpm.toFixed(2) : Math.round(R.prevPb);
      pb.innerHTML = '🎉 رقم قياسي جديد! <small dir="auto">&nbsp;(كان ' + was + ')</small>';
    } else if (R.isPb) {
      pb.innerHTML = '🎯 أول نتيجة لك في هذا النوع من الاختبارات.<br>حاول أن تتغلّب عليها!';
    } else {
      var gap = Math.round(R.prevPb) - shown;
      pb.innerHTML = '🏅 رقمك القياسي هنا:&nbsp;<b style="color:var(--main)">' + speedHtml(R.prevPb) + '</b>' +
        (gap > 0 ? '<br>باقي ' + gap + ' فقط لتتغلّب عليه!' : '<br>قريب جدًا من رقمك القياسي!');
    }

    $('rCode').hidden = !R.code;
    $('rCodeNum').textContent = R.code || '';
    $('bNextLbl').textContent = R.code ? '🔁 أعد التحدي' : 'اختبار جديد';
    $('bRepeat').hidden = !!R.code;
    $('bLeave').hidden = !R.code;
    drawChart(R);
    updateFoot();
    // Sounds are OFF by default (like Monkeytype), and that includes the fanfare: a lab of 25 PCs
    // must stay quiet unless the kids turned sounds on. The confetti always plays.
    if (R.isPb && R.prevPb != null) { confetti(); if (S.sound) fanfare(); }
    else if (S.sound) doneChime();
  }

  /* --------------------------------------------------------------- chart */
  function remPx() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }
  function cssVar(n) { return getComputedStyle(body).getPropertyValue(n).trim(); }
  function prepCanvas(cv) {
    var w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return null;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function niceMax(v) {
    var steps = [20, 40, 60, 80, 100, 120, 160, 200, 240, 300, 400, 500, 600, 800]; // all divisible by 4
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 200) * 200;
  }
  function maxOf(a) { var m = 0; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  function drawChart(R) {
    var c = prepCanvas($('chart'));
    if (!c) return;
    var ctx = c.ctx, rem = remPx(), ch = R.chart, n = ch.x.length;
    var main = cssVar('--main'), sub = cssVar('--sub'), err = cssVar('--err'), line = cssVar('--line');
    var maxY = niceMax(Math.max(10, maxOf(ch.wpm), maxOf(ch.raw)));
    var maxE = Math.max(1, maxOf(ch.err));
    var padL = 2.5 * rem, padR = 1.9 * rem, padT = 0.7 * rem, padB = 1.65 * rem;
    var gw = c.w - padL - padR, gh = c.h - padT - padB;
    var x0 = ch.x[0], x1 = ch.x[n - 1];
    var X = function (x) { return n < 2 ? padL + gw / 2 : padL + (x - x0) / (x1 - x0) * gw; };
    var Y = function (v) { return padT + gh - v / maxY * gh; };
    var YE = function (v) { return padT + gh - v / maxE * gh; };
    ctx.font = '500 ' + (0.85 * rem) + 'px Fredoka, sans-serif';
    ctx.direction = 'ltr';
    ctx.textBaseline = 'middle';
    // grid + left axis (wpm)
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = Math.round(Y(maxY * g / 4)) + 0.5;
      ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + gw, gy); ctx.stroke();
      ctx.fillStyle = sub; ctx.textAlign = 'right';
      ctx.fillText(String(maxY * g / 4), padL - 0.4 * rem, gy);
    }
    // right axis (errors)
    ctx.fillStyle = err; ctx.textAlign = 'left';
    ctx.fillText(String(maxE), padL + gw + 0.4 * rem, YE(maxE));
    ctx.fillText('0', padL + gw + 0.4 * rem, YE(0));
    // x labels (seconds)
    ctx.fillStyle = sub; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var every = Math.max(1, Math.ceil(n / 10));
    for (var i = 0; i < n; i++) {
      if (i % every !== 0 && i !== n - 1) continue;
      if (i !== n - 1 && n - 1 - i < every * 0.6) continue;
      var lx = ch.x[i];
      ctx.fillText(String(Math.round(lx * 10) / 10), X(lx), padT + gh + 0.35 * rem);
    }
    function path(vals) {
      ctx.beginPath();
      for (var k = 0; k < n; k++) { var px = X(ch.x[k]), py = Y(vals[k]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // raw (burst per second)
    path(ch.raw); ctx.strokeStyle = sub; ctx.lineWidth = 2; ctx.stroke();
    // wpm with a soft fill
    path(ch.wpm);
    if (n > 1) {
      ctx.lineTo(X(x1), Y(0)); ctx.lineTo(X(x0), Y(0)); ctx.closePath();
      var grad = ctx.createLinearGradient(0, padT, 0, padT + gh);
      grad.addColorStop(0, hexA(main, 0.28)); grad.addColorStop(1, hexA(main, 0));
      ctx.fillStyle = grad; ctx.fill();
      path(ch.wpm);
    }
    ctx.strokeStyle = main; ctx.lineWidth = 3; ctx.stroke();
    for (var p = 0; p < n; p++) { ctx.fillStyle = main; ctx.beginPath(); ctx.arc(X(ch.x[p]), Y(ch.wpm[p]), n > 40 ? 1.5 : 2.5, 0, 6.2832); ctx.fill(); }
    // errors: red dots on the right-hand scale (bigger dot = more mistakes in that second)
    ctx.fillStyle = err;
    for (var q = 0; q < n; q++) {
      if (!ch.err[q]) continue;
      var rr = (0.22 + 0.12 * Math.min(1, ch.err[q] / maxE)) * rem;
      ctx.beginPath(); ctx.arc(X(ch.x[q]), YE(ch.err[q]), rr, 0, 6.2832); ctx.fill();
    }
  }
  function hexA(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
    if (!m) return 'rgba(255,196,0,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }

  /* ---------------------------------------------------- progress (footer) */
  function drawLine(cv, vals, opts) {
    var c = prepCanvas(cv);
    if (!c || !vals.length) return;
    var ctx = c.ctx, main = cssVar('--main'), sub = cssVar('--sub'), rem = remPx();
    var padL = opts.axis ? 2.5 * rem : 3, padR = 6, padT = 6, padB = opts.axis ? 1.2 * rem : 4;
    var gw = c.w - padL - padR, gh = c.h - padT - padB;
    var maxY = opts.axis ? niceMax(Math.max(10, maxOf(vals))) : Math.max(5, maxOf(vals)) * 1.1;
    var X = function (i) { return vals.length < 2 ? padL + gw / 2 : padL + i / (vals.length - 1) * gw; };
    var Y = function (v) { return padT + gh - v / maxY * gh; };
    if (opts.axis) {
      ctx.font = '500 ' + (0.85 * rem) + 'px Fredoka, sans-serif';
      ctx.direction = 'ltr'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      for (var g = 0; g <= 4; g++) {
        var gy = Math.round(Y(maxY * g / 4)) + 0.5;
        ctx.strokeStyle = cssVar('--line'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + gw, gy); ctx.stroke();
        ctx.fillStyle = sub; ctx.fillText(String(maxY * g / 4), padL - 0.35 * rem, gy);
      }
    }
    if (opts.pb != null) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = sub; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, Y(opts.pb)); ctx.lineTo(padL + gw, Y(opts.pb)); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    for (var i = 0; i < vals.length; i++) { if (i) ctx.lineTo(X(i), Y(vals[i])); else ctx.moveTo(X(i), Y(vals[i])); }
    ctx.strokeStyle = main; ctx.lineWidth = opts.axis ? 3 : 2; ctx.lineJoin = 'round'; ctx.stroke();
    // dots: low-accuracy results (opts.low[i]) are drawn hollow and grey
    for (var j = 0; j < vals.length; j++) {
      if (!opts.axis && j !== vals.length - 1) continue;
      var low = opts.low && opts.low[j], rad = opts.axis ? 3.5 : 3;
      ctx.beginPath(); ctx.arc(X(j), Y(vals[j]), rad, 0, 6.2832);
      if (low) { ctx.fillStyle = cssVar('--bg2'); ctx.fill(); ctx.strokeStyle = sub; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = main; ctx.fill(); }
    }
  }
  function wpms(h) { return h.map(function (e) { return e.wpm; }); }
  function lows(h) { return h.map(function (e) { return e.v === 0; }); }
  function drawSpark() {
    var h = getHist();
    if (h.length) drawLine($('spark'), wpms(h), { low: lows(h) });
  }
  function updateFoot() {
    var h = getHist(), txt = $('progTxt'), spark = $('spark');
    spark.style.display = h.length ? '' : 'none';
    if (!h.length) { txt.textContent = '📈 تقدّمك: لا نتائج بعد، ابدأ الكتابة!'; return; }
    var pb = T ? getPbs()[pbKey(T)] : null, last = h[h.length - 1];
    txt.textContent = '📈 تقدّمك · آخر نتيجة ' + Math.round(last.wpm) +
      (last.v === 0 ? ' (الدقة ' + Math.floor(last.acc) + '%)' : '') + (pb ? ' · رقمك القياسي هنا ' + Math.round(pb.wpm) : '');
    drawSpark();
  }

  /* ------------------------------------------------------- settings bar */
  function updateBar() {
    var shown = T || { lang: S.lang, mode: S.mode, amt: S.amt[S.mode], lenient: S.lenient };
    each('#gLang .opt', function (b) { b.classList.toggle('on', b.getAttribute('data-lang') === shown.lang); });
    each('#gMode .opt', function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === shown.mode); });
    var g = $('gAmt');
    if (g.getAttribute('data-mode') !== shown.mode) {
      g.setAttribute('data-mode', shown.mode);
      g.innerHTML = E.AMOUNTS[shown.mode].map(function (a) { return '<button type="button" class="opt" data-amt="' + a + '">' + a + '</button>'; }).join('');
    }
    each('#gAmt .opt', function (b) { b.classList.toggle('on', +b.getAttribute('data-amt') === shown.amt); });
    $('bLenient').classList.toggle('on', !!shown.lenient);
    $('bKbd').classList.toggle('on', S.kbd);
    $('bKbd').setAttribute('aria-pressed', String(S.kbd));
    $('bSound').classList.toggle('on', S.sound);
    $('bSound').title = S.sound ? 'أصوات المفاتيح: تعمل (اضغط لإيقافها)' : 'أصوات المفاتيح: متوقفة (اضغط لتشغيلها)';
    $('bSoundLbl').textContent = S.sound ? 'أصوات المفاتيح ✓' : 'أصوات المفاتيح';
    $('bSound').setAttribute('aria-pressed', String(S.sound));
    $('bTheme').textContent = S.theme === 'dark' ? '🌙' : '☀️';
  }
  function each(sel, fn) { var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) fn(l[i]); }
  // During a class challenge the settings bar is locked: a click explains how to leave the challenge
  // (the ✕ on the challenge chip) instead of silently dropping the code and changing the settings.
  function barLocked() {
    if (!T || !T.code) return false;
    showBanner('🏆 أنت في تحدي الصف! لتغيير الإعدادات اخرج منه أولًا بزر ✕');
    var c = $('chTag'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
    return true;
  }
  function updateChallengeTag() {
    var on = !!(T && T.code);
    $('chTag').hidden = !on;
    $('tabHint').textContent = on ? 'أعد التحدي' : 'اختبار جديد';
    if (on) { $('chCode').textContent = T.code; $('chDesc').textContent = typeText(T); }
  }
  function applyTheme() {
    body.classList.toggle('t-dark', S.theme === 'dark');
    body.classList.toggle('t-light', S.theme !== 'dark');
  }
  function setKbd(on) {
    S.kbd = on;
    kbdEl.hidden = !on;
    if (on && T) { KB.build(kbdEl, T.lang); updateKbd(); }
    relayout();
  }
  function updateKbd() {
    if (!S.kbd || !T) return;
    if (T.phase === 'done') { KB.show('', false); return; }
    var w = T.words[T.cur], inp = T.input, bad = inp.length > w.length;
    for (var i = 0; !bad && i < inp.length; i++) if (!E.charEq(inp[i], w[i], T.lenient)) bad = true;
    var next = bad ? '' : (inp.length < w.length ? w.slice(inp.length) : (T.gen.finite && T.cur === T.words.length - 1 ? '' : ' '));
    KB.show(next, bad);
  }

  /* --------------------------------------------------- language warning */
  var warnTimer = 0;
  function langWarn() {
    var keys = '<span dir="ltr"><span class="sg-key">Alt</span> + <span class="sg-key">Shift</span></span>';
    showBanner('⌨️ ' + (T.lang === 'ar' ? 'لوحة المفاتيح بالإنجليزية!' : 'لوحة المفاتيح بالعربية!') + ' اضغط ' + keys + ' للتبديل');
    if (S.sound) sound('err');
  }
  // The banner sits on the live row: while it shows, body.warnOn hides the start hint under it
  // (a longer banner, e.g. the challenge lock, would otherwise cover part of the hint).
  function showBanner(html) {
    body.classList.add('warnOn');
    if (warnEl.hidden) { warnEl.innerHTML = html; warnEl.hidden = false; warnEl.classList.remove('again'); }
    else { warnEl.innerHTML = html; warnEl.classList.remove('again'); void warnEl.offsetWidth; warnEl.classList.add('again'); }
    clearTimeout(warnTimer);
    warnTimer = setTimeout(hideWarn, 3500);
  }
  function hideWarn() { clearTimeout(warnTimer); warnEl.hidden = true; body.classList.remove('warnOn'); }

  /* --------------------------------------------------------------- focus */
  var blurTimer = 0;
  function setUnfocused(on) {
    unfocusEl.hidden = !on;
    wordsBox.classList.toggle('blurred', on);
    if (on) body.classList.remove('typing');
  }
  window.addEventListener('blur', function () {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(function () { setUnfocused(true); }, 250);
  });
  window.addEventListener('focus', function () { clearTimeout(blurTimer); setUnfocused(false); });
  unfocusEl.addEventListener('pointerdown', function () { setUnfocused(false); });

  /* ------------------------------------------ keyboard navigation (Esc) */
  var kbnav = false;
  function navButtons() {
    var l = [].slice.call(document.querySelectorAll('#top button, #bar button')).filter(function (b) { return b.offsetParent; });
    return l.map(function (b) { var r = b.getBoundingClientRect(); return { b: b, row: Math.round(r.top / 20), x: r.left, cx: r.left + r.width / 2 }; })
      .sort(function (a, b) { return a.row - b.row || a.x - b.x; });
  }
  function enterKbnav() {
    kbnav = true;
    body.classList.add('kbnav');
    var b = document.querySelector('#bar .opt.on') || document.querySelector('#bar .opt');
    if (b) b.focus();
  }
  function exitKbnav() {
    if (!kbnav) return;
    kbnav = false;
    body.classList.remove('kbnav');
    var a = document.activeElement;
    if (a && a.blur && a !== body) a.blur();
  }
  function navKey(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      var l = navButtons(), a = document.activeElement, i = -1;
      for (var j = 0; j < l.length; j++) if (l[j].b === a) i = j;
      if (i < 0) { if (l[0]) l[0].b.focus(); return true; }
      var t = null;
      if (k === 'ArrowLeft') t = l[(i - 1 + l.length) % l.length];
      else if (k === 'ArrowRight') t = l[(i + 1) % l.length];
      else {
        var row = l[i].row, best = null, bd = 1e9;
        var rows = l.map(function (o) { return o.row; }).filter(function (r, x, arr) { return arr.indexOf(r) === x; });
        var ri = rows.indexOf(row) + (k === 'ArrowDown' ? 1 : -1);
        if (ri >= 0 && ri < rows.length) l.forEach(function (o) { if (o.row === rows[ri] && Math.abs(o.cx - l[i].cx) < bd) { bd = Math.abs(o.cx - l[i].cx); best = o; } });
        t = best;
      }
      if (t) t.b.focus();
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      var f = document.activeElement;
      if (f && f.tagName === 'BUTTON') {
        var sel = f.id ? '#' + f.id : null, attr = ['data-lang', 'data-mode', 'data-amt'].filter(function (x) { return f.hasAttribute(x); })[0];
        var val = attr ? f.getAttribute(attr) : null;
        f.click();
        // the click may rebuild buttons: put the focus back on the same choice
        var again = sel ? document.querySelector(sel) : document.querySelector('[' + attr + '="' + val + '"]');
        if (again && kbnav) again.focus();
      }
      return true;
    }
    return false;
  }

  /* ----------------------------------------------------------- keyboard */
  var mouse = { x: -1, y: -1 };
  // One physical keystroke. On Windows the Arabic لا key arrives as keydown "Unidentified" followed by
  // TWO keypress events (ل then ا); both belong to this stroke (one sound, same rules as the keydown).
  var stroke = { swallow: false, sounded: false, lamAlef: false };
  // Arabic (101) keys that type ل + an alef in one stroke: physical key (+ Shift) -> text.
  var LAM_ALEF_KEY = { KeyB: 'لا', ShiftKeyB: 'لآ', ShiftKeyG: 'لأ', ShiftKeyT: 'لإ' };
  function isText(k) {
    if (k.length === 1) return k.charCodeAt(0) >= 32;
    return k.length <= 4 && /^[؀-ۿﭐ-ﻼ]+$/.test(k);
  }
  function onControl(target) {
    return Kit.keys.isNativeTarget(target);
  }
  // Caps Lock warning (English tests only): follows the real state on every key, Caps Lock included.
  function updateCaps(e) {
    if (!T || T.lang !== 'en' || screen !== 'test' || !e.getModifierState) return;
    var on = e.getModifierState('CapsLock');
    if (capsEl.hidden === on) capsEl.hidden = !on;
  }
  window.addEventListener('keyup', updateCaps, true);
  Kit.keys.captureTab(function () { return !modal && !kbnav && screen === 'test'; });
  function onKey(e) {
    var k = e.key;
    if (k == null) return;
    if (Kit.keys.isNativeTarget(e.target)) {
      if (k === 'Escape' && modal) { modalKey(e); return; }
      if (k !== 'Escape' || !Kit.keys.acceptsEvent(e)) {
        if (kbnav) navKey(e);
        return;
      }
    }
    if (k === 'Tab' && !Kit.keys.acceptsEvent(e)) return;
    stroke = { swallow: true, sounded: false, lamAlef: false };
    Kit.audio.unlock();
    updateCaps(e);
    if (modal) { modalKey(e); return; }
    if (e.isComposing || k === 'Process' || k === 'Dead') return;
    // Only the typing surface owns the restart shortcut. Shift+Tab and Tab
    // on menus/results retain normal browser focus traversal, including out
    // of the iframe. Esc also exposes the settings navigation below.
    if (k === 'Tab') {
      if (screen === 'test' && !kbnav && !onControl(e.target) &&
          !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!e.repeat) quickRestart();
      }
      return;
    }
    if (!unfocusEl.hidden) {
      setUnfocused(false);
      if (isText(k) || k === 'Backspace' || k === 'Enter') e.preventDefault();
      return;
    }
    if (screen === 'results') {
      if (k === 'Enter') {
        e.preventDefault();
        if (!e.repeat && performance.now() - finishedAt > 300) quickRestart();
      } else if (k === 'Escape') { e.preventDefault(); quickRestart(); }
      else if (isText(k) || k === 'Backspace') e.preventDefault();
      return;
    }
    if (k === 'Escape') {
      e.preventDefault();
      if (T.phase === 'running') newTest({ repeat: true }); // abandon: same words, settings bar back
      else if (kbnav) exitKbnav();
      else enterKbnav();
      return;
    }
    if (kbnav && navKey(e)) return;
    if (k === 'Backspace') {
      e.preventDefault();
      if (backspace(e.ctrlKey || e.altKey || e.metaKey)) sound('back');
      return;
    }
    if ((e.ctrlKey && !e.altKey) || e.metaKey) return;   // browser shortcuts (Ctrl+R, Ctrl+Shift+I …)
    if (e.altKey && !e.ctrlKey) return;                   // Alt / Alt+Shift (switching keyboard language)
    if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      exitKbnav();
      var r = space();
      if (r) sound(r > 0 ? 'space' : 'err');
      return;
    }
    if (k === 'Enter') { e.preventDefault(); return; }
    if (k === 'Unidentified' || k === '') { stroke.swallow = false; return; } // text follows as keypress
    if (!isText(k)) return;
    e.preventDefault();
    exitKbnav();
    typeKey(k);
  }
  window.addEventListener('keydown', onKey, true);
  // Fallback for keys whose keydown had no usable e.key (see "stroke" above).
  window.addEventListener('keypress', function (e) {
    if (e.defaultPrevented) return;
    if (onControl(e.target)) return;
    var k = e.key, lamAlef = false;
    if (!k || !isText(k)) {
      k = e.charCode >= 32 ? String.fromCharCode(e.charCode) : '';
      // Some systems deliver the whole لا key as ONE keypress: its key is '' and charCode holds only
      // the ل. Work out which alef from the physical key (Windows "Arabic (101)"). An unknown key
      // keeps the old behaviour (just the ل), so a system that sends the alef separately still works.
      var guess = k === 'ل' && e.key === '' && !stroke.sounded ? LAM_ALEF_KEY[(e.shiftKey ? 'Shift' : '') + e.code] : null;
      if (guess) { k = guess; lamAlef = true; }
    }
    if (!k || k === ' ' || !isText(k)) return;
    if ((e.ctrlKey && !e.altKey) || e.metaKey || (e.altKey && !e.ctrlKey)) return;
    e.preventDefault();
    if (stroke.swallow || modal || screen !== 'test' || !unfocusEl.hidden) return;
    // …and if that system then sends the alef as a keypress of its own, it is already typed
    if (stroke.lamAlef && ALEFS.indexOf(k) >= 0) { stroke.lamAlef = false; return; }
    stroke.lamAlef = lamAlef;
    exitKbnav();
    typeKey(k, stroke.sounded);
    stroke.sounded = true;
  }, true);

  window.addEventListener('mousemove', function (e) {
    if (!body.classList.contains('typing')) return;
    if (mouse.x < 0) { mouse.x = e.clientX; mouse.y = e.clientY; return; }
    if (Math.abs(e.clientX - mouse.x) + Math.abs(e.clientY - mouse.y) > 14) body.classList.remove('typing');
  });
  // Mouse clicks must not leave a button focused (Space/Enter would press it again).
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && e.detail > 0) setTimeout(function () { if (document.activeElement === b) b.blur(); }, 0);
  });
  $('stage').addEventListener('pointerdown', function () { exitKbnav(); });

  /* ------------------------------------------------------------- buttons */
  $('gLang').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang]'); if (!b || barLocked()) return;
    S.lang = b.getAttribute('data-lang'); saveSettings(); newTest();
  });
  $('gMode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b || barLocked()) return;
    S.mode = b.getAttribute('data-mode'); saveSettings(); newTest();
  });
  $('gAmt').addEventListener('click', function (e) {
    var b = e.target.closest('[data-amt]'); if (!b || barLocked()) return;
    S.amt[S.mode] = +b.getAttribute('data-amt'); saveSettings(); newTest();
  });
  $('bLenient').addEventListener('click', function () {
    if (barLocked()) return;
    S.lenient = !(T ? T.lenient : S.lenient);
    saveSettings(); newTest();
  });
  $('bKbd').addEventListener('click', function () { setKbd(!S.kbd); saveSettings(); updateBar(); });
  $('bSound').addEventListener('click', function () {
    S.sound = !S.sound; saveSettings(); updateBar();
    Kit.audio.unlock();
    if (S.sound) setTimeout(function () { sound('key'); }, 30);
  });
  $('bTheme').addEventListener('click', function () {
    S.theme = S.theme === 'dark' ? 'light' : 'dark'; saveSettings(); applyTheme(); updateBar();
    relayout();
    if (modal === 'mProg') renderProgress();
  });
  $('chExit').addEventListener('click', function () { newTest(); });
  $('bNext').addEventListener('click', function () { quickRestart(); });
  $('bRepeat').addEventListener('click', function () { newTest({ repeat: true }); });
  $('bLeave').addEventListener('click', function () { newTest(); });
  $('bTeacher').addEventListener('click', function () { openModal('mTeacher'); teacherPick(); });
  $('bCode').addEventListener('click', function () { openModal('mCode'); codeReset(); });
  $('bProg').addEventListener('click', function () { openModal('mProg'); renderProgress(); });
  $('progMini').addEventListener('click', function () { openModal('mProg'); renderProgress(); });

  /* -------------------------------------------------------------- modals */
  function openModal(id) {
    closeModal();
    if (T && T.phase === 'running') newTest({ repeat: true });
    exitKbnav();
    modal = id;
    $(id).hidden = false;
    body.classList.remove('typing');
    // Start before the modal's controls so Tab reaches its close button,
    // while typing a challenge code followed by Enter keeps its shortcut.
    $(id).setAttribute('tabindex', '-1');
    $(id).focus();
  }
  function closeModal() {
    if (!modal) return;
    $(modal).hidden = true;
    modal = null;
  }
  each('.modal', function (m) {
    m.addEventListener('pointerdown', function (e) { if (e.target === m) closeModal(); });
    var x = m.querySelector('[data-close]');
    if (x) x.addEventListener('click', closeModal);
  });
  function digitOf(e) {
    var k = e.key;
    if (/^[0-9]$/.test(k)) return k;
    if (/^[٠-٩]$/.test(k)) return String(k.charCodeAt(0) - 0x660);
    if (/^[۰-۹]$/.test(k)) return String(k.charCodeAt(0) - 0x6F0);
    if (/^(Digit|Numpad)[0-9]$/.test(e.code || '') && !e.shiftKey) return e.code.slice(-1);
    return null;
  }
  function modalKey(e) {
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (k === 'Tab') return;
    if (onControl(e.target) && (k === 'Enter' || k === ' ' || k === 'Spacebar')) {
      e.stopPropagation();
      return;
    }
    if (k === ' ') { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var d = digitOf(e);
    if (modal === 'mTeacher') {
      if (!$('tPick').hidden && d && d !== '0') { e.preventDefault(); teacherShow(+d); }
      else if (!$('tShow').hidden && k === 'Enter') { e.preventDefault(); $('tPlay').click(); }
    } else if (modal === 'mCode') {
      if (d) { e.preventDefault(); codeDigit(d); }
      else if (k === 'Backspace') { e.preventDefault(); codeBack(); }
      else if (k === 'Enter') { e.preventDefault(); codeGo(); }
      else if (isText(k)) e.preventDefault();
    }
  }

  // Teacher: pick a preset -> a code in huge digits.
  var tPreset = 0, tCode = '';
  (function buildPresets() {
    var html = '';
    for (var p = 1; p <= 9; p++) {
      var o = E.PRESETS[p];
      html += '<button type="button" class="preset" data-p="' + p + '"><span class="n">' + p + '</span><span><b>' + LANG_NAME[o.lang] +
        '</b><small>' + MODE_ICON[o.mode] + ' ' + amtText(o.mode, o.amt) + '</small></span></button>';
    }
    $('presets').innerHTML = html;
    $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) teacherShow(+b.getAttribute('data-p')); });
  })();
  function teacherPick() { $('tPick').hidden = false; $('tShow').hidden = true; }
  function teacherShow(p) {
    tPreset = p;
    var num, tries = 0;
    do { num = Math.floor(Math.random() * 1000); } while (E.makeCode(p, num) === tCode && ++tries < 5);
    tCode = E.makeCode(p, num);
    $('tCode').textContent = tCode;
    $('tDesc').textContent = typeText(E.PRESETS[p]) + ' · تساهل في الهمزات';
    $('tPick').hidden = true; $('tShow').hidden = false;
  }
  $('tAgain').addEventListener('click', function () { teacherShow(tPreset); });
  $('tBack').addEventListener('click', teacherPick);
  $('tPlay').addEventListener('click', function () { closeModal(); newTest({ code: tCode }); });

  // Student: type the 4-digit code.
  var cBuf = '';
  (function buildPad() {
    var keys = ['1', '2', '3', '4', '5', '⌫', '6', '7', '8', '9', '0'];
    $('cPad').innerHTML = keys.map(function (k) { return '<button type="button" data-k="' + k + '">' + k + '</button>'; }).join('');
    $('cPad').addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]'); if (!b) return;
      var k = b.getAttribute('data-k');
      if (k === '⌫') codeBack(); else codeDigit(k);
    });
  })();
  function codeReset() { cBuf = ''; codeRender(); }
  function codeDigit(d) { if (cBuf.length < 4) cBuf += d; codeRender(); if (cBuf.length === 4 && !E.parseCode(cBuf)) shakeDigits(); }
  function codeBack() { cBuf = cBuf.slice(0, -1); codeRender(); }
  function codeGo() {
    var c = E.parseCode(cBuf);
    if (!c) { shakeDigits(); return; }
    closeModal();
    newTest({ code: c.code });
  }
  function shakeDigits() { var d = $('cDigits'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); }
  function codeRender() {
    var spans = $('cDigits').children;
    for (var i = 0; i < 4; i++) { spans[i].textContent = cBuf[i] || ''; spans[i].className = i === cBuf.length ? 'cur' : ''; }
    var desc = $('cDesc'), c = cBuf.length === 4 ? E.parseCode(cBuf) : null;
    desc.className = 'cdesc';
    if (cBuf.length < 4) desc.textContent = cBuf.length ? 'أكمل الأرقام الأربعة…' : 'اكتب الأرقام الأربعة التي كتبها المعلم';
    else if (c) desc.textContent = '✓ ' + typeText(c);
    else { desc.textContent = 'رمز غير صحيح: يبدأ الرمز برقم من 1 إلى 9'; desc.className = 'cdesc bad'; }
    $('cGo').disabled = !c;
  }
  $('cGo').addEventListener('click', codeGo);

  // Progress: chart of the last 30 results + personal bests + history.
  function fmtDate(t) {
    var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function renderProgress() {
    var h = getHist(), pbs = getPbs();
    var keys = Object.keys(pbs).sort(function (a, b) { return pbs[b].wpm - pbs[a].wpm; });
    var best = keys.length ? pbs[keys[0]].wpm : null;
    var anyLow = h.some(function (e) { return e.v === 0; });
    var okW = wpms(h.filter(function (e) { return e.v !== 0; }));
    $('progSub').textContent = h.length ? lastResultsText(h.length) + ' (السرعة بالكلمة في الدقيقة). الخط المتقطع = أفضل نتيجة.' +
      (anyLow ? ' النقطة الفارغة = دقة أقل من 75%.' : '') : 'لا نتائج بعد. أنهِ اختبارًا لترى تقدّمك هنا!';
    var cv = $('progChart');
    var c = prepCanvas(cv);
    if (h.length) drawLine(cv, wpms(h), { axis: true, low: lows(h), pb: okW.length ? maxOf(okW) : null });
    else if (c) c.ctx.clearRect(0, 0, c.w, c.h);
    $('pbList').innerHTML = keys.length ? keys.map(function (k) {
      var p = k.split('|'), o = { lang: p[0], mode: p[1], amt: +p[2] };
      return '<div class="row"><span class="t">' + typeText(o) + (p[3] === 's' ? ' · بدون تساهل' : '') + '</span><span class="v">' +
        speedHtml(pbs[k].wpm) + '</span><span class="d">' + Math.floor(pbs[k].acc) + '%</span></div>';
    }).join('') : '<div class="empty">لا أرقام قياسية بعد.</div>';
    $('histList').innerHTML = h.length ? h.slice().reverse().map(function (e) {
      var low = e.v === 0;
      return '<div class="row' + (low ? ' low' : '') + '"' + (low ? ' title="الدقة أقل من 75%: لا تُحسب رقمًا قياسيًا"' : '') + '><span class="d" dir="ltr">' + fmtDate(e.t) + '</span><span class="t">' + typeText(e) + (e.code ? ' · 🏆 <b dir="ltr">' + e.code + '</b>' : '') +
        '</span><span class="v">' + speedHtml(e.wpm) + '</span><span class="d">' + (low ? '⚠️ ' : '') + Math.floor(e.acc) + '%</span></div>';
    }).join('') : '<div class="empty">—</div>';
    if (best == null) best = 0;
    var r = $('pReset');
    r.classList.remove('armed');
    r.textContent = '🗑️ امسح نتائجي';
  }
  var resetTimer = 0;
  $('pReset').addEventListener('click', function () {
    var r = $('pReset');
    if (!r.classList.contains('armed')) {
      r.classList.add('armed'); r.textContent = 'متأكد؟ اضغط مرة أخرى للمسح';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () { r.classList.remove('armed'); r.textContent = '🗑️ امسح نتائجي'; }, 3000);
      return;
    }
    store.remove('pbs'); store.remove('hist');
    renderProgress(); updateFoot();
  });

  /* -------------------------------------------------------------- sounds */
  // Soft, short tones only (no noise, no square waves). At most one sound per keystroke.
  function sound(kind) {
    if (!S.sound) return;
    var A = Kit.audio;
    if (!A.ctx || A.muted) return;
    if (kind === 'key') {
      A.tone({ freq: 1500 + Math.random() * 260, to: 1100, type: 'sine', dur: 0.035, vol: 0.1, attack: 0.002 });
      A.tone({ freq: 240, to: 150, type: 'triangle', dur: 0.045, vol: 0.14, attack: 0.002 });
    } else if (kind === 'space') {
      A.tone({ freq: 1150, to: 850, type: 'sine', dur: 0.04, vol: 0.09, attack: 0.002 });
      A.tone({ freq: 180, to: 110, type: 'triangle', dur: 0.06, vol: 0.16, attack: 0.002 });
    } else if (kind === 'back') {
      A.tone({ freq: 900, to: 700, type: 'sine', dur: 0.03, vol: 0.07, attack: 0.002 });
    } else if (kind === 'err') {
      A.tone({ freq: 150, to: 85, type: 'sine', dur: 0.12, vol: 0.32, attack: 0.004 });
      A.tone({ freq: 310, to: 170, type: 'triangle', dur: 0.06, vol: 0.06, attack: 0.003 });
    }
  }
  function fanfare() {
    var A = Kit.audio;
    if (!A.ctx || A.muted) return;
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      A.tone({ freq: f, type: 'triangle', dur: 0.24, vol: 0.13, delay: i * 0.09, attack: 0.01 });
      A.tone({ freq: f * 2, type: 'sine', dur: 0.16, vol: 0.03, delay: i * 0.09, attack: 0.01 });
    });
    A.tone({ freq: 1318.5, type: 'sine', dur: 0.6, vol: 0.08, delay: 0.38, attack: 0.02 });
    A.tone({ freq: 1567.98, type: 'sine', dur: 0.6, vol: 0.05, delay: 0.42, attack: 0.02 });
  }
  function doneChime() {
    var A = Kit.audio;
    if (!A.ctx || A.muted) return;
    A.tone({ freq: 880, type: 'sine', dur: 0.18, vol: 0.08, attack: 0.008 });
    A.tone({ freq: 1318.5, type: 'sine', dur: 0.3, vol: 0.06, delay: 0.1, attack: 0.01 });
  }

  /* ------------------------------------------------------------ confetti */
  var fx = { cv: $('fx'), ctx: null, parts: [], raf: 0, last: 0, until: 0, dpr: 1 };
  // (Re)size the confetti canvas to the window; also called per frame, so a resize or fullscreen
  // switch during the celebration doesn't leave smeared trails.
  function fxSize() {
    var cv = fx.cv, W = Math.round(window.innerWidth * fx.dpr), H = Math.round(window.innerHeight * fx.dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; fx.ctx.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0); }
  }
  function confetti() {
    var cv = fx.cv, W = window.innerWidth, H = window.innerHeight;
    fx.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.style.display = 'block';
    fx.ctx = cv.getContext('2d');
    cv.width = 0; fxSize();
    var cols = ['#ffc400', '#ff5d6c', '#4ed98a', '#5fb0ff', '#b98bff', '#ffffff', '#ff9f43'];
    fx.parts = [];
    for (var i = 0; i < 170; i++) {
      var side = i % 3; // 0 = rain from the top, 1/2 = cannons from the bottom corners
      var p = { c: cols[i % cols.length], w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12 };
      if (side === 0) { p.x = Math.random() * W; p.y = -20 - Math.random() * H * 0.4; p.vx = (Math.random() - 0.5) * 120; p.vy = 60 + Math.random() * 160; }
      else {
        // cannons from the bottom corners, aimed up and inwards
        var a = (side === 1 ? -1.1 : -Math.PI + 1.1) + (Math.random() - 0.5) * 0.5;
        var sp = H * (1.1 + Math.random() * 0.8);
        p.x = side === 1 ? -10 : W + 10; p.y = H * 0.9;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      }
      fx.parts.push(p);
    }
    fx.last = performance.now();
    fx.until = fx.last + 4200;
    cancelAnimationFrame(fx.raf);
    fx.raf = requestAnimationFrame(fxFrame);
  }
  function fxFrame(t) {
    var dt = Math.min(0.05, (t - fx.last) / 1000), W = window.innerWidth, H = window.innerHeight, ctx = fx.ctx, alive = 0;
    fx.last = t;
    fxSize();
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < fx.parts.length; i++) {
      var p = fx.parts[i];
      if (p.y > H + 30) continue;
      alive++;
      p.vy += 520 * dt; p.vx *= (1 - 1.2 * dt); p.vy *= (1 - 0.9 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 1.7)), p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + 1);
      ctx.restore();
    }
    if (alive && t < fx.until) fx.raf = requestAnimationFrame(fxFrame);
    else { ctx.clearRect(0, 0, W, H); fx.cv.style.display = 'none'; fx.parts = []; }
  }

  /* ---------------------------------------------------------------- boot */
  applyTheme();
  kbdEl.hidden = !S.kbd;
  Kit.muteButton({ key: false }); // M must stay typable
  newTest();
  window.addEventListener('resize', relayout);
  try {
    if (document.fonts) {
      document.fonts.load('500 32px Fredoka', 'aب').then(relayout, function () {});
      document.fonts.ready.then(relayout);
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', relayout);
    }
  } catch (e) { /* ignore */ }
  setTimeout(function () { if (!document.hasFocus()) setUnfocused(true); }, 600);

  /* ------------------------------------------------- automated test hooks */
  window.__game = {
    state: function () {
      return {
        screen: screen, modal: modal, phase: T.phase, lang: T.lang, mode: T.mode, amt: T.amt, lenient: T.lenient,
        code: T.code, seed: T.seed, cur: T.cur, input: T.input, hist: T.hist.slice(), scroll: T.scroll, lineH: lineH,
        wordCount: T.words.length, correctKeys: T.corr, incorrectKeys: T.inc, liveWpm: T.liveWpm,
        warn: !warnEl.hidden, unfocused: !unfocusEl.hidden, typing: body.classList.contains('typing'), settings: JSON.parse(JSON.stringify(S))
      };
    },
    // start({ lang, mode, amt, lenient, seed }) or start({ code: '5372' })
    start: function (o) {
      o = o || {};
      if (o.code) { newTest({ code: o.code }); return this.state(); }
      if (o.lang) S.lang = o.lang;
      if (o.mode) S.mode = o.mode;
      if (o.amt) S.amt[S.mode] = o.amt;
      if (typeof o.lenient === 'boolean') S.lenient = o.lenient;
      saveSettings(); updateBar();
      newTest({ seed: o.seed });
      return this.state();
    },
    // Types through the same code path as real keys. ' ' = space, '\b' = Backspace, '\x7f' = Ctrl+Backspace.
    // msPerChar advances a virtual clock between keystrokes (for deterministic wpm tests).
    typeText: function (str, msPerChar) {
      var keys = Array.isArray(str) ? str : String(str).split('');
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === '\b') backspace(false);
        else if (k === '\x7f') backspace(true);
        else if (k === ' ') space();
        else typeKey(k);
        if (msPerChar) { clockSkew += msPerChar; if (T.phase === 'running') tick(); }
      }
      return this.state();
    },
    finish: function () { finish(); return lastResult; },
    results: function () { return lastResult; },
    challenge: function (code) { return newTest({ code: code }); },
    setSeed: function (seed) { newTest({ seed: seed }); return T.seed; },
    words: function (n) { return T.words.slice(0, n || 50); },
    caret: function () {
      var cr = caret.getBoundingClientRect(), el = T.els[T.cur], n = el.childNodes[T.input.length];
      var lr = n ? n.getBoundingClientRect() : null;
      return { caret: { x: cr.left, y: cr.top, w: cr.width, h: cr.height }, next: lr ? { left: lr.left, right: lr.right, top: lr.top } : null, clip: clipEl.getBoundingClientRect().toJSON() };
    },
    engine: E,
    store: { pbs: getPbs, hist: getHist }
  };
})();

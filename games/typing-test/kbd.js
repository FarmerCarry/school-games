/*
 * أصابع البرق — on-screen keyboard helper.
 * Shows US QWERTY or Windows "Arabic (101)" and lights up the next key (plus the Shift key of
 * the other hand when needed). Keys are tinted by the finger that should press them.
 * Exposed as window.TTKeyboard = { build(el, lang), show(next, needBackspace) }.
 */
(function () {
  'use strict';

  var ROWS = [
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
    ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
    ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
    ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
    ['Space']
  ];
  var WIDE = { Backspace: 2, Tab: 1.5, Backslash: 1.5, CapsLock: 1.8, Enter: 2.2, ShiftLeft: 2.3, ShiftRight: 2.7, Space: 6.5 };
  var SPECIAL = { Backspace: '⌫', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', Space: 'مسافة' };
  // Finger for each column (touch typing): 0/7 pinky, 1/6 ring, 2/5 middle, 3/4 index.
  var FINGER = {
    Backquote: 0, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 3, Digit6: 4, Digit7: 4, Digit8: 5, Digit9: 6, Digit0: 7, Minus: 7, Equal: 7,
    KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3, KeyT: 3, KeyY: 4, KeyU: 4, KeyI: 5, KeyO: 6, KeyP: 7, BracketLeft: 7, BracketRight: 7, Backslash: 7,
    KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 3, KeyH: 4, KeyJ: 4, KeyK: 5, KeyL: 6, Semicolon: 7, Quote: 7,
    KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3, KeyB: 3, KeyN: 4, KeyM: 4, Comma: 5, Period: 6, Slash: 7
  };

  // [normal, with Shift]
  var EN = {
    Backquote: ['`', '~'], Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'],
    Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'], Minus: ['-', '_'], Equal: ['=', '+'],
    BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ['\'', '"'],
    Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?']
  };
  'qwertyuiopasdfghjklzxcvbnm'.split('').forEach(function (c) { EN['Key' + c.toUpperCase()] = [c, c.toUpperCase()]; });

  // Windows "Arabic (101)".
  var AR = {
    Backquote: ['ذ', 'ّ'], Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'],
    Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', ')'], Digit0: ['0', '('], Minus: ['-', '_'], Equal: ['=', '+'],
    KeyQ: ['ض', 'َ'], KeyW: ['ص', 'ً'], KeyE: ['ث', 'ُ'], KeyR: ['ق', 'ٌ'], KeyT: ['ف', 'لإ'], KeyY: ['غ', 'إ'], KeyU: ['ع', '‘'],
    KeyI: ['ه', '÷'], KeyO: ['خ', '×'], KeyP: ['ح', '؛'], BracketLeft: ['ج', '<'], BracketRight: ['د', '>'], Backslash: ['\\', '|'],
    KeyA: ['ش', 'ِ'], KeyS: ['س', 'ٍ'], KeyD: ['ي', ']'], KeyF: ['ب', '['], KeyG: ['ل', 'لأ'], KeyH: ['ا', 'أ'], KeyJ: ['ت', 'ـ'],
    KeyK: ['ن', '،'], KeyL: ['م', '/'], Semicolon: ['ك', ':'], Quote: ['ط', '"'],
    KeyZ: ['ئ', '~'], KeyX: ['ء', 'ْ'], KeyC: ['ؤ', '}'], KeyV: ['ر', '{'], KeyB: ['لا', 'لآ'], KeyN: ['ى', 'آ'], KeyM: ['ة', '’'],
    Comma: ['و', ','], Period: ['ز', '.'], Slash: ['ظ', '؟']
  };
  var LATIN = {};
  'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').forEach(function (c) { LATIN['Key' + c] = c; });

  var TASHKEEL = /[ً-ْـ]/;
  // Shift characters drawn on the Arabic keycaps besides the Arabic ones: the punctuation the
  // Arabic sentences use (. on ز and ! on 1), so a lit key always shows what it will type.
  var AR_PUNCT = '.!';
  var root = null, keyEls = {}, lookup = {}, lit = [];

  function build(el, lang) {
    root = el;
    keyEls = {}; lookup = {}; lit = [];
    var map = lang === 'ar' ? AR : EN;
    Object.keys(map).forEach(function (code) {
      var p = map[code];
      if (!(p[0] in lookup)) lookup[p[0]] = { code: code, shift: false };
      if (!(p[1] in lookup)) lookup[p[1]] = { code: code, shift: true };
    });
    lookup[' '] = { code: 'Space', shift: false };
    var html = '';
    ROWS.forEach(function (row) {
      html += '<div class="kr">';
      row.forEach(function (code) {
        var w = WIDE[code] || 1;
        var f = FINGER[code];
        var cls = 'k' + (f != null ? ' f' + f : ' fx') + (code === 'KeyF' || code === 'KeyJ' ? ' home' : '');
        var inner;
        if (SPECIAL[code]) inner = '<b class="sp">' + SPECIAL[code] + '</b>';
        else {
          var p = map[code];
          if (lang === 'ar') {
            var up = (p[1] && !TASHKEEL.test(p[1]) && (/[؀-ۿ]/.test(p[1]) || AR_PUNCT.indexOf(p[1]) >= 0)) ? p[1] : '';
            inner = '<b class="m" dir="rtl">' + p[0] + '</b>' + (up ? '<i class="up" dir="rtl">' + up + '</i>' : '') +
              (LATIN[code] ? '<i class="lat">' + LATIN[code] + '</i>' : '');
          } else {
            var isLetter = /^[a-z]$/.test(p[0]);
            inner = '<b class="m">' + (isLetter ? p[1] : p[0]) + '</b>' + (!isLetter ? '<i class="up">' + p[1] + '</i>' : '');
          }
        }
        html += '<span class="' + cls + '" data-code="' + code + '" style="--w:' + w + '">' + inner + '</span>';
      });
      html += '</div>';
    });
    el.innerHTML = html;
    el.setAttribute('dir', 'ltr');
    var ks = el.querySelectorAll('.k');
    for (var i = 0; i < ks.length; i++) keyEls[ks[i].getAttribute('data-code')] = ks[i];
  }

  function clear() {
    for (var i = 0; i < lit.length; i++) lit[i].classList.remove('on', 'shift', 'fix', 'sh');
    lit = [];
  }
  function light(code, cls) {
    var k = keyEls[code];
    if (!k) return;
    k.classList.add(cls);
    lit.push(k);
  }

  // next: the text still to type in the current word (or ' ' for the space bar).
  function show(next, needBackspace) {
    if (!root) return;
    clear();
    if (needBackspace) { light('Backspace', 'fix'); return; }
    if (!next) return;
    var hit = lookup[next.slice(0, 2)] && next.length >= 2 && next.slice(0, 2).length === 2 ? lookup[next.slice(0, 2)] : null;
    if (!hit) hit = lookup[next[0]];
    if (!hit) return;
    light(hit.code, 'on');
    if (hit.shift) {
      if (keyEls[hit.code]) keyEls[hit.code].classList.add('sh'); // style.css enlarges the Shift character
      var f = FINGER[hit.code];
      light(f != null && f <= 3 ? 'ShiftRight' : 'ShiftLeft', 'shift');
    }
  }

  window.TTKeyboard = { build: build, show: show, lookup: function (c) { return lookup[c] || null; } };
})();

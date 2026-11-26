/*
 * Kit.gfx — light graphics for heavy games on PCs that can't keep them smooth.
 * Load ../../shared/gfx.js right after ../../shared/kit.js (only the games that use it).
 *
 *   var gfx = Kit.gfx('rail-rush', { apply: function (light, why) { ... } });
 *   gfx.light       read while building the renderer (no antialiasing, fewer pixels...)
 *   gfx.set(light)  the child's choice, kept for this game
 *
 * It turns on by itself when engaged round play (the frames Kit.stats.frame and Kit.loop
 * count) is not smooth: more than 15 percent of frames over 20 ms in two 120-frame windows
 * in a row; stalls over 250 ms are left out. A PC that keeps 60 fps never switches. Then
 * apply(true, 'auto') changes what can change during play, 'sg:<slug>:gfx' remembers it
 * for the next start, 'sg:site:gfx-light' makes the other heavy games on this PC start
 * light too, and a short notice offers the way back ('full', never overruled for that game).
 * ?lq forces light, ?hq forces full; automated browsers never switch unless ?gfxauto.
 */
(function () {
  'use strict';
  var Kit = window.Kit, doc = document;
  if (!Kit) return;
  var WINDOW = 120, SLOW_MS = 20, SLOW_SHARE = 0.15, notice = null;

  Kit.gfx = function (slug, opts) {
    opts = opts || {};
    var own = Kit.store(slug), site = Kit.store('site'), q = '', nav = window.navigator || {};
    try { q = window.location.search || ''; } catch (e) { /* ignore */ }
    var forced = /[?&]lq\b/.test(q) ? 'light' : /[?&]hq\b/.test(q) ? 'full' : null;
    var saved = own.get('gfx', null);
    if (saved !== 'light' && saved !== 'full') saved = null;
    var g = { light: forced ? forced === 'light' : saved ? saved === 'light' : site.get('gfx-light', false) === true };
    var n = 0, slow = 0, bad = 0;
    function change(light, why) {
      Kit._frame = null;
      if (g.light === light) return;
      g.light = light;
      try { if (opts.apply) opts.apply(light, why); } catch (e) { /* the game keeps its graphics */ }
    }
    g.set = function (light) {
      light = !!light;
      own.set('gfx', light ? 'light' : 'full');
      if (notice) notice.hidden = true;
      change(light, 'child');
    };
    var auto = !forced && saved !== 'full' && !g.light && (!nav.webdriver || /[?&]gfxauto\b/.test(q));
    Kit._frame = !auto ? null : function (ms) {
      if (ms > 250) return; // a stall (loading, a hidden tab) says nothing about the graphics
      n++;
      if (ms > SLOW_MS) slow++;
      if (n < WINDOW) return;
      bad = slow > WINDOW * SLOW_SHARE ? bad + 1 : 0;
      n = slow = 0;
      if (bad < 2) return;
      own.set('gfx', 'light');
      site.set('gfx-light', true);
      change(true, 'auto');
      showNotice(g);
    };
    return g;
  };

  var CSS = '.sg-gfx-notice{position:fixed;inset-inline:12px;bottom:12px;z-index:999;width:fit-content;' +
    'max-width:calc(100vw - 24px);margin-inline:auto;padding:8px 14px;border:2px solid #7fd4ff;border-radius:12px;' +
    'background:#10142bee;color:#fff;direction:rtl;font-size:17px;box-shadow:0 4px 18px #0008;display:flex;gap:10px;' +
    'align-items:center;font-family:inherit}.sg-gfx-notice[hidden]{display:none}' +
    '.sg-gfx-notice button{font:inherit;font-size:15px;font-weight:700;color:#06243a;background:#7fd4ff;border:0;' +
    'border-radius:8px;padding:5px 10px;cursor:pointer}.sg-gfx-notice button:focus-visible{outline:3px solid #fff;outline-offset:3px}';
  function showNotice(g) {
    if (!doc.body) return;
    if (!notice) {
      var style = doc.createElement('style');
      style.textContent = CSS;
      if (doc.head) doc.head.appendChild(style);
      notice = doc.createElement('div');
      notice.className = 'sg-gfx-notice';
      notice.setAttribute('role', 'status');
      var text = doc.createElement('span'), back = doc.createElement('button');
      text.textContent = '🪶 شغّلنا الرسوم الخفيفة لتصبح اللعبة أسرع وأنعم';
      back.type = 'button';
      back.textContent = 'الرسوم الكاملة';
      back.title = 'ارجع إلى الرسوم الكاملة في هذه اللعبة';
      back.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      back.addEventListener('click', function (e) { e.stopPropagation(); g.set(false); if (e.detail > 0) back.blur(); });
      notice.appendChild(text); notice.appendChild(back);
      doc.body.appendChild(notice);
    }
    notice.hidden = false;
    setTimeout(function () { notice.hidden = true; }, 7000);
  }
})();

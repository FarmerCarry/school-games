/*
 * The Data & settings tab (#/data): the server's settings (the school's clock, the
 * first day of the week, how long data is kept, a full recount) and its meters (the
 * free plan's daily allowance, the database size) with the data-quality panel. Data:
 * GET and POST /v1/admin/settings, POST /v1/admin/rebuild, /v1/admin/kpis (quality).
 * A recount asks twice. The sample data never changes anything.
 */
(function () {
  'use strict';
  var tabs = window.SGTabs = window.SGTabs || {};

  tabs.data = {
    load: function (ctx) {
      var settings = ctx.demo() ? ctx.get('settings', {}) : ctx.request('/v1/admin/settings');
      return Promise.all([settings, ctx.part(ctx.get('kpis', {}))]).then(function (x) {
        ctx.state.settings = x[0];
        return { settings: x[0], kpis: x[1] };
      });
    },
    render: function (ctx, view, data) {
      var T = ctx.t(), h = ctx.h;
      ctx.section(view, 'data-intro', T.tabs.data, T.introData);
      settings(ctx, view, data.settings);
      meters(ctx, view, data.settings);
      quality(ctx, view, data.kpis);
    }
  };

  function settings(ctx, parent, s) {
    var T = ctx.t(), h = ctx.h, I = ctx.I;
    var sec = ctx.section(parent, 'settings', T.settingsTitle);
    var grid = h('div', { class: 'settings' }, sec);
    // The school's clock: the zones the PCs report, one click.
    var clock = h('div', { class: 'card setting', id: 'setting-clock' }, grid);
    var c = s.clock || {};
    h('p', null, clock, T.clockNow(c.tz || 'UTC', T.clockSource[c.source] || ''));
    if (ctx.demo()) ctx.note(clock, T.demoAction);
    else ctx.zonePicker(clock, 'settingsClock', null);
    // The first day of the week (rows of the heatmaps, weekly charts).
    var week = h('div', { class: 'card setting', id: 'setting-week' }, grid);
    h('h3', { class: 'card-title', id: 'weekStartLabel' }, week, T.weekStartTitle);
    h('p', { class: 'note' }, week, c.weekSource === 'owner' ? T.weekChosen : T.weekAuto);
    choiceRow(ctx, week, 'weekStart', [{ value: 'sun', text: T.sunday }, { value: 'mon', text: T.monday }], c.weekStart, function (v) {
      return { weekStart: v };
    }, 'weekStartLabel');
    // How long the play records are kept.
    var keep = h('div', { class: 'card setting', id: 'setting-keep' }, grid);
    h('h3', { class: 'card-title', id: 'keepLabel' }, keep, T.keepTitle);
    var k = s.keep || {};
    h('p', { class: 'note' }, keep, T.keepNow(I.int(k.days || 400), I.int(k.rollupDays || 800)));
    choiceRow(ctx, keep, 'keepDays', [{ value: 400, text: T.keepOne }, { value: 760, text: T.keepTwo }], k.days, function (v) {
      return { keepDays: v };
    }, 'keepLabel');
    // Recount all days (asks twice; shows the progress).
    var rebuild = h('div', { class: 'card setting', id: 'setting-rebuild' }, grid);
    h('h3', { class: 'card-title' }, rebuild, T.rebuildTitle);
    h('p', { class: 'note' }, rebuild, T.rebuildIntro);
    var rb = s.rebuild || {};
    if (Number(rb.pending) > 0) h('p', { class: 'clock-note', role: 'status' }, rebuild, T.rebuildProgress(Number(rb.done) || 0, (Number(rb.done) || 0) + Number(rb.pending)));
    if (ctx.demo()) { ctx.note(rebuild, T.demoAction); return; }
    var go = h('button', { type: 'button', class: 'btn-quiet', id: 'rebuildBtn', 'data-focus': 'rebuild' }, rebuild, T.rebuildAction);
    var step = h('div', { class: 'link-step' }, rebuild);
    go.addEventListener('click', function () {
      step.textContent = '';
      h('p', { class: 'warn' }, step, T.rebuildSure);
      var yes = h('button', { type: 'button', class: 'btn-quiet btn-danger', id: 'rebuildYes', 'data-focus': 'rebuild:yes' }, step, T.rebuildDo);
      h('button', { type: 'button', class: 'btn-link', 'data-focus': 'rebuild:no' }, step, T.cancel).addEventListener('click', function () { step.textContent = ''; go.focus(); });
      yes.addEventListener('click', function () {
        yes.disabled = true;
        ctx.request('/v1/admin/rebuild', 'POST', {}).then(function (res) {
          step.textContent = '';
          ctx.note(step, T.rebuildStarted(Number(res && res.pending) || 0), 'done');
          ctx.loadSettings();
        }, function (f) { yes.disabled = false; ctx.note(step, ctx.failureText(f), 'field-error'); });
      });
      yes.focus();
    });
  }
  // A one-click setting: POST /v1/admin/settings with the chosen value.
  function choiceRow(ctx, parent, id, items, current, body, labelId) {
    var h = ctx.h, T = ctx.t();
    var group = h('div', { class: 'seg', role: 'group', 'aria-labelledby': labelId }, parent);
    items.forEach(function (item) {
      var b = h('button', { type: 'button', 'aria-pressed': String(item.value === current), 'data-value': String(item.value), 'data-focus': 'set:' + id + ':' + item.value,
        disabled: ctx.demo() ? true : null }, group, item.text);
      b.addEventListener('click', function () { if (item.value !== current) ctx.postSettings(body(item.value), T.settingSaved); });
    });
  }

  function meters(ctx, parent, s) {
    var T = ctx.t(), h = ctx.h, I = ctx.I;
    var sec = ctx.section(parent, 'meters', T.metersTitle);
    var box = h('div', { class: 'tiles tiles-small' }, sec);
    var u = s.usage || {}, st = s.storage || {};
    var w = u.writesLimit ? (u.writes || 0) / u.writesLimit : null, r = u.readsLimit ? (u.reads || 0) / u.readsLimit : null;
    ctx.tile(box, 'writes', T.writesToday, w == null ? '—' : I.pct(w), '', T.writesHint(I.int(u.writes || 0), I.int(u.writesLimit || 0)), w);
    ctx.tile(box, 'reads', T.readsToday, r == null ? '—' : I.pct(r), '', T.readsHint(I.int(u.reads || 0), I.int(u.readsLimit || 0)), r);
    var mb = st.bytes != null ? st.bytes / 1e6 : null;
    ctx.tile(box, 'storage', T.databaseSize, mb == null ? '—' : I.int(mb), mb == null ? '' : T.mb, T.storageLine(I.int(mb || 0), I.int((st.limit || 5e8) / 1e6)), mb);
    ctx.tile(box, 'batchEvery', T.batchEvery, u.batchEvery ? I.int(u.batchEvery) : '—', u.batchEvery ? T.secondsUnit : '', T.batchEveryHint, u.batchEvery || null);
    if (w != null && r != null) ctx.note(sec, T.freePlan(I.pct(w), I.pct(r)));
    if (st.trimmedBefore) ctx.note(sec, T.trimmedNote(ctx.dayText(st.trimmedBefore, { day: 'numeric', month: 'short', year: 'numeric' })));
    var pcs = s.pcs || {};
    if (ctx.has(pcs.new)) ctx.note(sec, T.pcsSeen(pcs.new, pcs.seen14d || 0));
  }

  // Data quality (how far each number can be trusted), from the KPIs of the period.
  function quality(ctx, parent, k) {
    var T = ctx.t(), h = ctx.h, I = ctx.I, C = ctx.C;
    var sec = ctx.section(parent, 'data-quality', T.qualityTitle, T.qualityIntro);
    var box = h('div', { class: 'card', id: 'quality-card' }, sec);
    if (ctx.failed(k) || !k.quality) { ctx.missing(box, ctx.failed(k) ? k : null); return; }
    var q = k.quality;
    var rows = [
      [T.q.linkedShare, I.pct(q.linkedShare), T.qHint.linkedShare],
      [T.q.v2Share, I.pct(q.v2Share), T.qHint.v2Share],
      [T.q.clockEstimatedShare, I.pct(q.clockEstimatedShare), T.qHint.clockEstimatedShare],
      [T.q.unclosedVisits, I.int(q.unclosedVisits), T.qHint.unclosedVisits],
      [T.q.unknownBandShare, I.pct(q.unknownBandShare), T.qHint.unknownBandShare],
      [T.q.idleHandovers, I.int(q.idleHandovers), T.qHint.idleHandovers],
      [T.q.pcsNew, I.int(q.pcsNew), T.qHint.pcsNew],
      [T.q.oldVersionSessionShare, I.pct(q.oldVersionSessionShare), T.qHint.oldVersionSessionShare],
      [T.q.profilesFullPcs, I.int(q.profilesFullPcs), T.qHint.profilesFullPcs],
      [T.q.forgetfulPcs, I.int(q.forgetfulPcs), T.qHint.forgetfulPcs]
    ];
    C.table(box, T.qualityTitle, [{ label: T.measure }, { label: T.value, num: true }, { label: T.whatItMeans }], rows);
    ctx.note(box, T.lateNote);
  }
}());

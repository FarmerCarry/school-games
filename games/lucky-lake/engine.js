/* Lucky Lake pure simulation engine (zero DOM/Kit/timers/Math.random). */
(() => {
  'use strict';
  const LL = window.LL = window.LL || {}, M = Math, abs = M.abs, min = M.min, max = M.max, flr = M.floor, rnd = M.round;
  Object.assign(LL, { W: 1280, H: 720, TIERS: 5, DUO_SECONDS: 120, DUO_TIER: 2, OVERTIME: 12, AIM_SPEED: 430, ZONE_V: .96, TUNE: {}, HARDER: {}, byId: {}, JUNK: {}, RODS: ['zone', 'reel', 'lure', 'bait'], ROD_MAX: 3, JUNK_IDS: ['boot', 'duck', 'teapot', 'chest'], ROD: [{ x: 330, y: 66 }, { x: 990, y: 92 }], ROD_COST: { zone: [25, 60, 120], reel: [25, 60, 120], lure: [40, 90, 160], bait: [30, 70, 130] } });
  'bite:-1:1.4,1.1,.85,.6,.4;nibMin:1:0,0,1,1,1;nibMax:1:1,2,2,3,3;zone:-1:.44,.37,.31,.27,.24;snap:-1:12,9,7,5.5,4.5;dart:1:.5,.7,.9,1.1,1.3;rest:-1:1.6,1.3,1.05,.85,.7;fill:-1:.5,.42,.36,.32,.3;drain:1:.1,.15,.2,.24,.28;meter0:-1:.45,.4,.35,.3,.28;reach:-1:300,270,240,210,185;eager:-1:1.6,1.25,1,.85,.7;swim:1:.8,.9,1,1.1,1.2;current:1:5,8,11,14,17'
    .split(';').forEach(s => { const [k, d, v] = s.split(':'); LL.HARDER[k] = +d; LL.TUNE[k] = v.split(',').map(Number); });
  LL.PULL = [[.07, 1.4, 2.4, .14, 0], [.22, 1, 1.8, .3, 0], [.36, .6, 1.2, .42, .12], [.5, .4, .85, .52, .25], [.56, .32, .7, .56, .3]].map(([v, a, b, jump, dash]) => ({ v, rest: [a, b], jump, dash }));

  const KM = { f: 'fish', r: 'round', w: 'whisker', l: 'long', c: 'crab', t: 'flat', p: 'puffer', u: 'turtle', s: 'sail', e: 'eel', j: 'jelly', a: 'star', n: 'angler' };
  const PM = { o: 'spots', s: 'stripes', b: 'band', c: 'scales', k: 'koi', t: 'trout', p: 'plates', n: 'clown', g: 'gems', r: 'rainbow', '': '' };
  LL.SPECIES = (
    'pebble|سمكة الحصى|0|1|1|4|48|f|7fb2ec,eaf5ff,4f7fd0|o|.05|.55|70|1;sunny|سمكة الشمس|0|1|2|7|54|r|ffbf2e,fff3b0,ff7a1a|s|.1|.6|55|1;tilapia|البلطي الضاحك|0|1|4|14|66|f|86d66f,ecffd8,3f9a4f|s|.3|.8|50|1;redfin|زعنفة حمراء|0|1|3|10|60|f|c6d4ea,fff,ff4d4d|b|.15|.6|65|2;catfish|أبو شنب|0|2|10|32|96|w|7a74a8,ddd8f6,524c86|o|.78|1|38|2;carp|الشبوط الكسول|0|2|15|42|104|f|eea93c,fff0c2,c97b1c|c|.5|.95|34|2;koi|كوي المرقّط|0|3|10|26|84|f|fff,fff,ff5a3c|k|.2|.7|46|3;' +
    'dace|سهم الماء|1|1|2|6|58|l|bccde0,f4f9ff,5f86c8|b|.05|.5|100|2;perch|الفرخ المخطط|1|1|3|12|62|f|a8d85e,fff3c4,ff7a2e|s|.2|.7|75|2;trout|السلمون المرقّط|1|1|5|20|74|f|a4be6c,ffe6ec,e0668e|t|.3|.8|80|2;salmon|السلمون القافز|1|2|20|50|100|f|f4907f,ffe6df,cf5a5a|o|.2|.75|85|3;pike|رمح النهر|1|2|20|60|118|l|62ae5c,eef8cc,3f7a3a|o|.4|.85|70|3;sturgeon|الحفش العجوز|1|3|50|120|140|l|8e9fb6,e6ecf4,5d6d86|p|.8|1|40|3;' +
    'sardine|السردين اللامع|2|1|1|3|46|l|72acff,f2f7ff,3f74d6|b|.05|.45|110|2;clown|سمكة المهرج|2|1|1|4|48|r|ff8a2a,ffd1a1,1c2250|n|.3|.8|60|2;crab|السلطعون العنيد|2|1|4|20|64|c|ff5a4a,ffb3a8,c93a2e||1|1|42|2;bream|الدنيس الفضي|2|1|6|24|78|t|c9d6e8,fff,ffcc33|s|.3|.85|70|2;puffer|المنفوخ|2|2|5|16|62|p|ffe066,fff7d1,e0a800|o|.2|.7|40|2;turtle|السلحفاة الطيبة|2|3|60|200|124|u|58c66f,e8f5c8,2f8a4a||.25|.75|36|3;tuna|التونة السريعة|2|3|80|240|150|f|3363bb,eaf1ff,ffd23f|b|.35|.9|120|3;' +
    'smelt|سمكة الثلج|3|1|1|3|44|l|c2eaff,fff,6fb8e6|b|.05|.5|85|1;whitefish|السمكة البيضاء|3|1|5|20|72|f|e8eff8,fff,93a9c4|c|.3|.8|55|2;char|الشار القطبي|3|1|8|30|80|f|62809f,ff8a5a,ff9a6b|o|.3|.85|60|2;grayling|ذات الشراع|3|2|5|20|76|s|9099bf,f0f2ff,b45bd6|o|.2|.7|65|3;burbot|سمكة الشتاء|3|2|10|40|108|e|a2915e,f0e6c6,6f6240|o|.8|1|35|2;icepike|الرمح الجليدي|3|3|30|90|126|l|82cbe9,f2fbff,3f8fb8|o|.4|.9|75|3;' +
    'glowfin|زعنفة النور|4|1|2|6|52|f|3df5ff,d4feff,ff5df0|b|.05|.6|75|2|3df5ff;jelly|قنديل القمر|4|1|1|5|54|j|ff9cf0,ffe6fb,c45bff||.1|.7|22|1|ff9cf0;star|نجمة البحيرة|4|1|2|6|52|a|ffd23f,fff3b0,ff9a1f||1|1|16|1|ffd23f;crystal|سمكة الكريستال|4|2|5|20|74|t|b98cff,f1e6ff,7a4dff|g|.3|.8|60|3|c8a2ff;lantern|أبو فانوس|4|2|10|30|86|n|4a50a0,9aa0e6,ffe14d|o|.7|1|30|2|ffe14d;rainbow|سمكة قوس قزح|4|3|10|30|84|f|ff6b7a,fff,4fd1ff|r|.2|.75|70|3|fff;golden|السمكة الذهبية|4|3|30|70|96|f|ffd23f,fff6c2,ffa21a|c|.3|.8|60|4|ffd23f'
  ).split(';').map((l, i) => {
    const r = l.split('|'), kind = KM[r[7]];
    return LL.byId[r[0]] = { i, id: r[0], name: r[1], place: +r[2], rarity: +r[3], min: +r[4], max: +r[5], len: +r[6], kind, c: r[8].split(',').map(h => '#' + h), pat: PM[r[9]], d0: +r[10], d1: +r[11], speed: +r[12], pull: +r[13], glow: r[14] ? '#' + r[14] : '', legend: r[0] === 'golden', move: kind === 'crab' || kind === 'star' ? 'bed' : kind === 'jelly' ? 'drift' : 'swim' };
  });
  [['boot', 'حذاء قديم', 6, 18, 1, 1], ['teapot', 'إبريق شاي', 5, 12, 3, 3], ['chest', 'صندوق كنز!', 30, 60, 25, 45], ['duck', 'بطة مطاطية', 1, 3, 2, 2, 1]]
    .forEach(([id, name, mn, mx, c0, c1, fl]) => { LL.JUNK[id] = { id, name, min: mn, max: mx, coins: [c0, c1], float: !!fl }; });
  LL.PLACES = [
    ['pond', 'بركة القرية', 236, 676, 7, 0, null, 0, [[760, 652], [1120, 234, 1]], [5, 'catfish', 20]],
    ['river', 'النهر', 226, 680, 7, 1, null, 0, [[640, 656], [1010, 658]], [6, 'pike', 30]],
    ['sea', 'الشاطئ', 222, 684, 8, 0, null, 0, [[900, 660], [560, 222, 1]], [6, 'puffer', 20]],
    ['ice', 'البحيرة المتجمدة', 232, 680, 7, 0, [520, 800, 1080], 0, [[800, 656], [1080, 660]], [6, 'grayling', 25]],
    ['lagoon', 'البحيرة السحرية', 236, 676, 7, 0, null, 1, [[700, 652], [1040, 654]], [6, 'golden', 25]]
  ].map(([id, name, surface, bed, fishN, current, holes, night, jk, [n, sp, w]]) => ({ id, name, surface, bed, x0: 330, x1: 1250, aim: [380, 1215], fishN, current, holes, night: !!night, junk: jk.map(([x, y, f]) => ({ x, y, float: !!f })), goals: { n, sp, w }, species: [] }));
  LL.SPECIES.forEach(s => LL.PLACES[s.place].species.push(s.i));

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, knob = (w, k) => LL.TUNE[k][w.tier - 1], bet = (w, a, b) => a + w.rand() * (b - a), ev = (w, t, o) => w.ev.push(Object.assign({ t }, o));
  const spOf = f => LL.SPECIES[f.sp], byId = (w, id) => w.fish.find(f => f.id === id) || null, topM = s => s.kind === 'crab' || s.kind === 'star' || s.kind === 'jelly';
  const mouth = f => { const s = spOf(f), L = s.len * f.size; return topM(s) ? { x: f.x, y: f.y - L * .22 } : { x: f.x + f.dir * L * .46, y: f.y + L * .04 }; };
  const depthY = (w, s, d) => s.move === 'bed' ? w.P.bed - 18 - s.len * .18 : w.P.surface + 44 + (w.P.bed - w.P.surface - 92) * d;
  Object.assign(LL, { clamp, knob, spOf, fishById: byId, mouth, weightText: v => (v / 10).toFixed(1), arcHeight: dx => 36 + abs(dx) * .08, arcPoint: (f, t, s, a, k) => ({ x: f.x + (t.x - f.x) * k, y: f.y + (s - f.y) * k - a * 4 * k * (1 - k) }), depthOf: (w, s, d) => depthY(w, s, s.d0 + (s.d1 - s.d0) * clamp(d, 0, 1)) });
  LL.rng = seed => { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = M.imul(a ^ a >>> 15, 1 | a); t = (t + M.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  LL.rodMods = (r = {}) => { const lv = k => clamp((r || {})[k] | 0, 0, 3); return { zone: 1 + .12 * lv('zone'), fill: 1 + .2 * lv('reel'), drain: 1 - .12 * lv('reel'), lure: lv('lure'), bait: 1 + .18 * lv('bait') }; };
  LL.rodCost = (s, k) => { const l = s.rods[k] | 0; return l >= 3 ? 0 : LL.ROD_COST[k][l]; };
  LL.buy = (s, k) => { const c = LL.rodCost(s, k); if (!c || s.coins < c) return false; s.coins -= c; s.rods[k]++; return true; };

  LL.create = (o = {}) => {
    const pi = clamp(o.place | 0, 0, 4), P = LL.PLACES[pi], tn = rnd(Number(o.duo ? 2 : o.tier));
    const w = { place: pi, P, duo: !!o.duo, tier: tn >= 1 && tn <= 5 ? tn : 1, mods: LL.rodMods(o.duo ? null : o.rods), rand: LL.rng(o.seed == null ? 1 : o.seed), t: 0, fish: [], junk: [], players: [], ev: [], next: 1, want: o.fishN != null ? o.fishN : P.fishN + (o.duo ? 3 : 0), spawnT: 1, boost: o.boost || '', left: o.duo ? 120 : 0, over: false, overtime: 0, landed: 0 };
    for (let i = 0; i < (w.duo ? 2 : 1); i++) {
      const rod = LL.ROD[i], b = w.duo ? (i ? [420, 1040] : [380, 1010]) : P.aim;
      w.players.push({ i, rod: { ...rod }, side: i ? -1 : 1, x0: b[0], x1: b[1], aim: { x: w.duo ? (i ? 820 : 600) : 640, y: P.surface + (P.bed - P.surface) * .42 }, state: 'ready', t: 0, dur: 0, from: { ...rod }, to: { x: 0, y: 0 }, bob: { ...rod }, hook: { ...rod }, fish: 0, junk: null, reel: null, biteT: 0, calm: 0, snag: 0, recast: false, dip: 0, casts: 0, catches: [], total: 0, last: null, streak: 0 });
    }
    if (o.junk !== false) P.junk.forEach(s => { const j = { x: s.x, y: s.y, float: !!s.float, kind: '', wait: 0, t: 0 }; fillJunk(w, j); w.junk.push(j); });
    for (let i = 0; i < w.want; i++) spawn(w, 1);
    return w;
  };
  LL.target = (w, p, x, y) => { const P = w.P; x = clamp(x, p.x0, p.x1); if (P.holes) x = P.holes.reduce((a, b) => abs(b - x) < abs(a - x) ? b : a); return { x, y: clamp(y, P.surface + 40, P.bed - 28) }; };
  LL.aimTarget = (w, p) => LL.target(w, p, p.aim.x, p.aim.y);
  LL.spawnFish = (w, sp, x, y, dir) => {
    const s = LL.SPECIES[sp], P = w.P, w10 = rnd(s.min + (s.max - s.min) * M.pow(w.rand(), 1.7)), by = y != null ? y : depthY(w, s, bet(w, s.d0, s.d1));
    const f = { id: w.next++, sp, x: x != null ? x : bet(w, P.x0 + 40, P.x1 - 40), y: by, by, tby: by, dir: dir || (w.rand() < .5 ? -1 : 1), v: s.speed * bet(w, .85, 1.15), ph: w.rand() * 6.283, t: 0, amp: s.move === 'swim' ? bet(w, 4, 10) : 0, state: 'swim', st: 0, nib: 0, p: -1, cool: 0, turn: bet(w, 2, 7), walk: 0, leave: w.rand() < .3, w10, size: .85 + .38 * (w10 - s.min) / max(1, s.max - s.min), wig: 0 };
    w.fish.push(f); return f;
  };
  function spawn(w, any) {
    const list = w.P.species; let tot = 0;
    const wt = list.map(si => { const s = LL.SPECIES[si]; let k = [0, 10, 4, 1.3][s.rarity] * (s.legend ? .4 : 1) * (s.rarity >= 2 ? 1 + .55 * w.mods.lure : 1) * (w.boost === s.id ? 2.5 : 1); w.fish.forEach(f => { if (f.sp === si) k *= .6; }); tot += k; return k; });
    let r = w.rand() * tot, sp = list[list.length - 1]; for (let i = 0; i < list.length; i++) if ((r -= wt[i]) <= 0) { sp = list[i]; break; }
    const fl = w.rand() < .5, f = LL.spawnFish(w, sp, any ? null : fl ? w.P.x0 - 70 : 1350, null, any ? 0 : fl ? 1 : -1);
    if (!any) f.leave = false; ev(w, 'spawn', { id: f.id }); return f;
  }
  function release(w, f, flee, cool) { const p = f.p >= 0 ? w.players[f.p] : null; if (p && p.fish === f.id) p.fish = 0; f.p = -1; f.cool = cool; if (flee) { f.state = 'flee'; f.st = 1.3; if (p) f.dir = f.x < p.hook.x ? -1 : 1; f.wig = 1; } else f.state = 'swim'; }
  function stick(f, p, dt) { const s = spOf(f), L = s.len * f.size, m = topM(s), hk = p.hook, tx = m ? hk.x : hk.x - f.dir * L * .46, ty = m ? hk.y + L * .22 : hk.y - L * .04, dx = tx - f.x, dy = ty - f.y, d = M.hypot(dx, dy), st = max(60, s.speed * 1.4) * dt; if (d <= st || d < .5) { f.x = tx; f.y = ty; return 1; } f.x += dx / d * st; f.y += dy / d * st; return 0; }
  function updFish(w, f, dt) {
    const s = spOf(f), P = w.P; let p = f.p >= 0 ? w.players[f.p] : null;
    f.t += dt; if (f.cool > 0) f.cool -= dt; if (f.wig > 0) f.wig = max(0, f.wig - dt * .8);
    if (p && (p.fish !== f.id || !'wait,bite,reel'.includes(p.state))) { if (f.state !== 'hooked') release(w, f, 0, 2); p = null; }
    const st = f.state;
    if (st === 'swim') {
      const k = knob(w, 'swim');
      if (s.move === 'bed') { if ((f.walk -= dt) <= -1.2) f.walk = bet(w, 1.2, 3.4); if (f.walk > 0) f.x += f.dir * f.v * .7 * k * dt; f.y = f.by; }
      else { f.x += f.dir * f.v * k * dt; f.by += (f.tby - f.by) * min(1, dt * .7); f.y = f.by + M.sin(f.t * (s.move === 'drift' ? .9 : 1.6) + f.ph) * (s.move === 'drift' ? 22 : f.amp); }
      if ((f.turn -= dt) <= 0) { f.turn = bet(w, 3, 9); if (w.rand() < .3 && f.x > P.x0 && f.x < P.x1) f.dir = -f.dir; if (s.move !== 'bed') f.tby = clamp(f.by + (w.rand() - .5) * 70, depthY(w, s, s.d0), depthY(w, s, s.d1)); }
      if ((f.x < P.x0 - 50 && f.dir < 0) || (f.x > P.x1 + 40 && f.dir > 0)) { if (f.leave) f.gone = true; else { f.dir = -f.dir; f.leave = w.rand() < .3; } }
    } else if (st === 'notice') { f.dir = p.hook.x >= f.x ? 1 : -1; if ((f.st -= dt) <= 0) { f.state = 'approach'; f.st = 6; } }
    else if (st === 'approach') { f.dir = p.hook.x >= f.x ? 1 : -1; if (stick(f, p, dt)) { f.state = 'nibble'; f.st = bet(w, .55, 1.05); f.nib = knob(w, 'nibMin') + flr(w.rand() * (knob(w, 'nibMax') - knob(w, 'nibMin') + 1)); ev(w, 'arrive', { p: p.i, id: f.id }); } else if ((f.st -= dt) <= 0) release(w, f, 0, 4); }
    else if (st === 'nibble') { stick(f, p, dt); if ((f.st -= dt) <= 0) { if (f.nib > 0) { f.nib--; f.st = bet(w, .75, 1.3); p.dip = 1; ev(w, 'nibble', { p: p.i, id: f.id, x: p.bob.x, y: p.bob.y }); } else { f.state = 'bite'; p.state = 'bite'; p.biteT = knob(w, 'bite'); p.t = 0; ev(w, 'bite', { p: p.i, id: f.id, x: p.bob.x, y: p.bob.y, junk: false }); } } }
    else if (st === 'bite') stick(f, p, dt);
    else if (st === 'flee') { f.x += f.dir * max(90, s.speed * 2) * dt; f.y += M.sin(f.t * 18) * 30 * dt * f.wig; if ((f.st -= dt) <= 0) { f.state = 'swim'; f.leave = true; f.by = f.y; f.tby = clamp(f.y, depthY(w, s, s.d0), depthY(w, s, s.d1)); } if (f.x < -120 || f.x > 1400) f.gone = true; }
  }
  const fillJunk = (w, j) => { if (j.float && w.P.holes) { j.kind = ''; return; } const o = j.float ? ['duck'] : w.P.night ? ['boot', 'teapot', 'chest', 'chest'] : ['boot', 'teapot', 'boot', 'teapot', 'chest']; j.kind = o[flr(w.rand() * o.length)]; j.t = w.rand() * 6; };
  const cast = (w, p) => { const to = LL.aimTarget(w, p), dx = to.x - p.rod.x; Object.assign(p, { state: 'cast', t: 0, recast: false, from: { ...p.rod }, to, dur: .36 + M.hypot(dx, w.P.surface - p.rod.y) / 2100, arc: LL.arcHeight(dx), snag: 0, fish: 0, junk: null }); p.casts++; ev(w, 'cast', { p: p.i, x: to.x, y: to.y }); };
  const reelBack = (w, p, rc) => { Object.assign(p, { state: 'back', t: 0, recast: !!rc, from: { ...p.hook } }); const f = p.fish && byId(w, p.fish); if (f) release(w, f, 0, 3); p.fish = 0; p.junk = null; ev(w, 'back', { p: p.i }); };
  const lose = (w, p) => { const f = p.fish ? byId(w, p.fish) : null; if (f) { f.state = 'swim'; release(w, f, 1, 8); } else if (p.junk) p.junk.taken = false; p.streak = 0; ev(w, 'escape', { p: p.i, junk: !f, sp: f ? f.sp : -1, x: f ? f.x : p.hook.x, y: f ? f.y : p.hook.y, peak: p.reel.peak }); Object.assign(p, { state: 'lost', t: 0, fish: 0, junk: null }); };
  function updPlayer(w, p, dt, inp) {
    inp = inp || {}; const P = w.P, hk = p.hook, bb = p.bob, am = p.aim;
    if (inp.ax != null && inp.ay != null) { am.x = clamp(inp.ax, p.x0, p.x1); am.y = clamp(inp.ay, P.surface + 40, P.bed - 28); }
    else if (inp.mx || inp.my) { am.x = clamp(am.x + (inp.mx || 0) * 430 * dt, p.x0, p.x1); am.y = clamp(am.y + (inp.my || 0) * 344 * dt, P.surface + 40, P.bed - 28); }
    if (p.calm > 0) p.calm -= dt; p.dip = max(0, p.dip - dt * 3.2); p.t += dt;
    if (inp.press) {
      const f = p.fish ? byId(w, p.fish) : null;
      if (p.state === 'ready') { if (!(w.duo && w.left <= 0)) cast(w, p); }
      else if (p.state === 'wait') { if (f && f.state === 'nibble') { release(w, f, 1, 5); p.calm = 1; ev(w, 'spook', { p: p.i, id: f.id, x: f.x, y: f.y }); } else reelBack(w, p, !(w.duo && w.left <= 0)); }
      else if (p.state === 'bite') {
        const r0 = bet(w, .72, .92); p.state = 'reel'; p.t = 0;
        p.reel = { h: clamp(knob(w, 'zone') * w.mods.zone, .1, .62), z: 0, zv: 0, f: r0, ft: r0, fv: 0, rest: .4, meter: knob(w, 'meter0'), pull: f ? LL.PULL[spOf(f).pull] : LL.PULL[0], dash: 0, peak: 0, junk: !f, inZone: false, hold: false };
        if (f) { f.state = 'hooked'; f.st = 0; f.hx = f.x; f.hy = f.y; } else p.junk.taken = true;
        ev(w, 'hooked', { p: p.i, id: f ? f.id : 0, junk: !f, x: bb.x, y: bb.y });
      }
    }
    const st = p.state;
    if (st === 'cast') { const k = min(1, p.t / p.dur), a = LL.arcPoint(p.from, p.to, P.surface, p.arc, k); bb.x = hk.x = a.x; bb.y = hk.y = a.y; if (k >= 1) { p.state = 'sink'; p.t = 0; bb.y = hk.y = P.surface; ev(w, 'splash', { p: p.i, x: bb.x, y: P.surface }); } }
    else if (st === 'sink') { if ((hk.y += 470 * dt) >= p.to.y) { hk.y = p.to.y; p.state = 'wait'; p.t = 0; ev(w, 'sunk', { p: p.i, x: hk.x, y: hk.y }); } }
    else if (st === 'wait' || st === 'bite') {
      if (P.current) bb.x = hk.x = min(P.x1 - 20, hk.x + knob(w, 'current') * dt);
      if (st === 'bite') { if ((p.biteT -= dt) <= 0) { const f = p.fish ? byId(w, p.fish) : null; if (f) release(w, f, 1, 6); Object.assign(p, { junk: null, state: 'wait', t: 0, calm: .8, snag: 0, fish: 0 }); ev(w, 'late', { p: p.i, id: f ? f.id : 0, junk: !f, x: f ? f.x : hk.x, y: f ? f.y : hk.y }); } }
      else if (!p.fish && p.calm <= 0 && !(w.duo && w.left <= 0)) {
        const j = w.junk.find(u => u.kind && !u.taken && abs(u.x - hk.x) < 74 && abs(u.y - hk.y) < (u.float ? 110 : 74));
        if (j) { if ((p.snag += dt) > 1.5) { Object.assign(p, { snag: 0, junk: j, state: 'bite', biteT: knob(w, 'bite') + .6, t: 0 }); ev(w, 'bite', { p: p.i, id: 0, x: bb.x, y: bb.y, junk: true, kind: j.kind }); } }
        else {
          p.snag = 0; const R = knob(w, 'reach') * w.mods.bait; let best = null, near = 1e9;
          w.fish.forEach(f => { if (f.state !== 'swim' || f.cool > 0 || f.gone || f.x < P.x0 - 10 || f.x > 1260) return; const m = mouth(f), dx = abs(m.x - hk.x), dy = abs(m.y - hk.y); if (dx <= R && dy <= R * .5 && dx + dy * 1.5 < near) { near = dx + dy * 1.5; best = f; } });
          if (best && w.rand() < knob(w, 'eager') * w.mods.bait * (spOf(best).legend ? .5 : spOf(best).rarity === 3 ? .8 : 1) * dt) { best.state = 'notice'; best.st = .6; best.p = p.i; p.fish = best.id; ev(w, 'notice', { p: p.i, id: best.id, x: best.x, y: best.y }); }
        }
      }
    } else if (st === 'reel') {
      const r = p.reel, pull = r.pull; r.hold = !!inp.hold;
      r.zv += ((inp.hold ? .96 : -.96) - r.zv) * min(1, knob(w, 'snap') * dt);
      r.z = clamp(r.z + r.zv * dt, 0, 1 - r.h); if (r.z <= 0) r.zv = max(0, r.zv); if (r.z >= 1 - r.h) r.zv = min(0, r.zv);
      const lo = min(.9, r.h + .06), hi = .97;
      if (r.rest > 0) { r.rest -= dt; r.fv = 0; }
      else {
        const v = pull.v * (r.junk ? 1 : knob(w, 'dart')) * (r.dash ? 1.6 : 1), d = r.ft - r.f, step = v * dt; r.fv = d > 0 ? v : -v;
        if (abs(d) <= step) { r.f = r.ft; r.dash = 0; r.rest = bet(w, pull.rest[0], pull.rest[1]) * (r.junk ? 1 : knob(w, 'rest')); const j = pull.jump * bet(w, .5, 1); r.ft = clamp(r.f + (w.rand() < .5 ? -j : j), lo, hi); if (abs(r.ft - r.f) < j * .5) r.ft = clamp(r.f + (r.ft > (lo + hi) / 2 ? -j : j), lo, hi); if (w.rand() < pull.dash) r.dash = 1; }
        else r.f += d > 0 ? step : -step;
      }
      r.f = clamp(r.f, lo - .001, hi); r.inZone = r.f >= r.z - .025 && r.f <= r.z + r.h + .025;
      r.meter = clamp(r.meter + (r.inZone ? knob(w, 'fill') * w.mods.fill : -knob(w, 'drain') * w.mods.drain) * dt, 0, 1);
      if (r.meter > r.peak) r.peak = r.meter;
      if (r.meter >= 1) {
        const f = p.fish ? byId(w, p.fish) : null; let c;
        if (f) { const s = spOf(f); c = { junk: false, sp: f.sp, id: s.id, w10: f.w10, coins: [0, 3, 8, 20][s.rarity] + (s.legend ? 60 : 0) + flr(f.w10 / 10), place: w.place }; f.gone = true; }
        else { const J = LL.JUNK[p.junk.kind]; c = { junk: true, sp: -1, id: J.id, w10: rnd(bet(w, J.min, J.max)), coins: J.coins[0] + flr(w.rand() * (J.coins[1] - J.coins[0] + 1)), place: w.place }; Object.assign(p.junk, { kind: '', taken: false, wait: bet(w, 22, 40) }); }
        p.catches.push(c); if (!c.junk) p.total += c.w10; Object.assign(p, { last: c, state: 'land', t: 0, fish: 0, junk: null }); p.streak++; w.landed++; ev(w, 'landed', { p: p.i, c, peak: r.peak });
      } else if (r.meter <= 0) lose(w, p);
      else {
        const ff = p.fish ? byId(w, p.fish) : null, m = r.meter, hx = ff ? ff.hx : hk.x, hy = ff ? ff.hy : hk.y;
        const gx = P.holes ? hx : hx + (p.rod.x + p.side * 150 - hx) * M.pow(m, 1.25), gy = hy + (P.surface + 30 - hy) * M.pow(m, 1.1);
        if (ff) { ff.x = gx + M.sin(w.t * 9) * 10.8 * (1 - m * .6); ff.y = gy + M.cos(w.t * 7) * 8; ff.dir = p.side * (M.sin(w.t * 2.3) > -.3 ? -1 : 1); }
        hk.x = ff ? mouth(ff).x : gx; hk.y = ff ? mouth(ff).y : gy; bb.x = hk.x; bb.y = P.surface;
      }
    } else if (st === 'land') { if (p.t >= .9) { p.state = 'ready'; p.t = 0; p.reel = null; } }
    else if (st === 'lost') { if (p.t >= .5) { reelBack(w, p, 0); p.reel = null; } }
    else if (st === 'back') { const b = min(1, p.t / .32); bb.x = hk.x = p.from.x + (p.rod.x - p.from.x) * b; bb.y = hk.y = p.from.y + (p.rod.y - p.from.y) * b; if (b >= 1) { if (p.recast) cast(w, p); else { p.state = 'ready'; p.t = 0; } } }
    else { hk.x = bb.x = p.rod.x; hk.y = bb.y = p.rod.y; }
  }

  LL.step = (w, dt, inputs) => {
    if (w.over) return w; w.t += dt;
    if (w.duo && (w.left = max(0, w.left - dt)) <= 0) {
      w.overtime += dt; let r = 0;
      w.players.forEach(p => { if (p.state === 'bite' || ('wait,sink,cast'.includes(p.state) && !p.ended)) { p.ended = true; reelBack(w, p, 0); } if (p.state === 'reel') r = 1; });
      if (!r || w.overtime >= 12) { w.players.forEach(p => { if (p.state === 'reel') lose(w, p); }); w.over = true; ev(w, 'timeup'); return w; }
    }
    w.players.forEach((p, i) => updPlayer(w, p, dt, inputs && inputs[i]));
    w.fish.forEach(f => updFish(w, f, dt)); w.fish = w.fish.filter(f => !f.gone);
    w.junk.forEach(j => { j.t += dt; if (!j.kind && j.wait > 0 && (j.wait -= dt) <= 0) fillJunk(w, j); });
    if ((w.spawnT -= dt) <= 0 && w.fish.length < w.want) { spawn(w, 0); w.spawnT = bet(w, 1.2, 2.6); }
    return w;
  };
  LL.duoWinner = w => { const a = w.players[0].total, b = w.players[1] ? w.players[1].total : 0; return a === b ? 0 : a > b ? 1 : 2; };
  LL.outcome = (k, pk) => k === 'landed' ? 1 : k === 'escape' ? rnd((.15 + .25 * clamp(pk || 0, 0, 1)) * 1e3) / 1e3 : 0;
  LL.freshSave = () => ({ v: 2, coins: 0, caught: 0, book: {}, junk: {}, places: [0, 1, 2, 3, 4].map(() => ({ n: 0, g: [0, 0, 0] })), rods: { zone: 0, reel: 0, lure: 0, bait: 0 }, coach: false });
  const isInt = (v, lo, hi) => typeof v === 'number' && flr(v) === v && v >= lo && v <= hi, isObj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  LL.loadSave = raw => {
    const s = LL.freshSave(), r = isObj(raw); if (!r || r.v !== 2) return s;
    s.coins = isInt(r.coins, 0, 9999999) ? r.coins : 0; s.caught = isInt(r.caught, 0, 9999999) ? r.caught : 0;
    const bk = isObj(r.book) || {}, jk = isObj(r.junk) || {}, pls = Array.isArray(r.places) ? r.places : [], rds = isObj(r.rods) || {};
    LL.SPECIES.forEach(sp => { if (isInt(bk[sp.id], 1, 99999)) s.book[sp.id] = bk[sp.id]; });
    LL.JUNK_IDS.forEach(id => { if (isInt(jk[id], 1, 99999)) s.junk[id] = jk[id]; });
    for (let i = 0; i < 5; i++) { const pl = isObj(pls[i]); if (!pl) continue; s.places[i].n = isInt(pl.n, 0, 99999) ? pl.n : 0; if (Array.isArray(pl.g)) for (let k = 0; k < 3; k++) s.places[i].g[k] = pl.g[k] === 1 ? 1 : 0; }
    LL.RODS.forEach(k => { s.rods[k] = isInt(rds[k], 0, 3) ? rds[k] : 0; }); s.coach = r.coach === true; return s;
  };
  LL.stars = (s, p) => s.places[p].g[0] + s.places[p].g[1] + s.places[p].g[2];
  LL.totalStars = s => [0, 1, 2, 3, 4].reduce((a, i) => a + LL.stars(s, i), 0);
  LL.isOpen = (s, p) => p === 0 || (p > 0 && p < 5 && (LL.stars(s, p - 1) >= 2 || s.places[p].n > 0));
  LL.speciesCount = s => Object.keys(s.book).filter(k => s.book[k] > 0).length;
  LL.nextPlace = s => { let t = 0, i; for (i = 0; i < 5; i++) if (LL.isOpen(s, i)) t = i; for (i = t; i >= 0; i--) if (LL.stars(s, i) < 3) return i; return t; };
  LL.applyCatch = (s, p, c) => {
    const out = { newSpecies: false, best: false, goals: [], unlocked: -1, coins: c.coins };
    s.coins = min(9999999, s.coins + c.coins);
    if (c.junk) { s.junk[c.id] = min(99999, (s.junk[c.id] || 0) + 1); return out; }
    const prev = s.book[c.id] || 0, pl = s.places[p], G = LL.PLACES[p].goals, was = p < 4 && LL.isOpen(s, p + 1);
    if (!prev) out.newSpecies = true; else if (c.w10 > prev) out.best = true;
    if (c.w10 > prev) s.book[c.id] = min(99999, c.w10);
    s.caught = min(9999999, s.caught + 1); pl.n = min(99999, pl.n + 1);
    [pl.n >= G.n, c.id === G.sp, c.w10 >= G.w].forEach((ok, k) => { if (!pl.g[k] && ok) { pl.g[k] = 1; out.goals.push(k); } });
    if (p < 4 && !was && LL.isOpen(s, p + 1)) out.unlocked = p + 1;
    return out;
  };
})();

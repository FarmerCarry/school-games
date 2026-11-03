import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1, drawLast = false) => {
          for (let i = 0; i < n; i++) { update(1 / 60); if (!drawLast || i === n - 1) render(0); }
        };
        window.simGame = n => { for (let i = 0; i < n; i++) update(1 / 60); };
        return { stop() {} };
      };
    } });
  });
  await page.goto(`${server.origin}/games/chaos-island/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  await page.evaluate(() => {
    window.ends = []; window.rounds = [];
    const end = Kit.stats.end, round = Kit.stats.round;
    Kit.stats.end = function () { ends.push([...arguments]); return end.apply(this, arguments); };
    Kit.stats.round = function () { rounds.push([...arguments]); return round.apply(this, arguments); };
    window.park = function (actor) {
      const w = window.__game.world;
      let top = null;
      for (const p of w.plats) if (p.spine && !p.solid && !p.ground && !p.gone && (!top || p.y < top.y)) top = p;
      const hazards = w.haz.filter(h => h.k === 'meteor' || h.k === 'zap' || h.k === 'foot');
      const clear = px => hazards.every(h => Math.abs(h.x - px) > h.r + 18);
      let x = top.x + top.w / 2;
      if (!clear(x)) {
        for (let px = top.x + 24; px < top.x + top.w - 24; px += 8) if (clear(px)) { x = px; break; }
      }
      actor.mode = 'run';
      actor.x = x - actor.w / 2;
      actor.y = top.y - actor.h;
      actor.vx = 0; actor.vy = 0;
      actor.ground = top;
    };
  });
  return page;
}

test('the title demo reports nothing and writes nothing', async t => {
  const page = await game(t);
  await page.evaluate(() => stepGame(240));
  assert.deepEqual(await page.evaluate(() => [rounds, ends, Object.keys(localStorage).filter(k => k.startsWith('sg:chaos-island:'))]), [[], [], []]);
  assert.equal(await page.evaluate(() => __game.mode), 'title');
});

test('a save comes back, a corrupt save becomes a fresh island, and a full disk can retry', async t => {
  const page = await game(t);
  const data = await page.evaluate(() => {
    const save = __game.save;
    save.coins = 40;
    __game.persist();
    return JSON.parse(localStorage.getItem('sg:chaos-island:data'));
  });
  assert.equal(data.coins, 40);
  assert.equal(data.v, 1);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.equal(await page.locator('#t-coins').textContent(), '40');
  await clickControl(page, '#btnShop');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('#shopGrid .item')].find(el => el.querySelector('b').textContent === 'قبعة');
    card.querySelector('button').click();
  });
  const bought = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:chaos-island:data')));
  assert.equal(bought.coins, 20);
  assert.deepEqual(bought.hats, ['cap']);
  assert.equal(bought.hat, 'cap');
  await page.evaluate(() => localStorage.setItem('sg:chaos-island:data', '{"v":1,"coins":"nope"}'));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.equal(await page.locator('#t-coins').textContent(), '0');
  assert.equal(await page.evaluate(() => __game.save.hats.length), 0);

  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith('sg:chaos-island:')) throw new DOMException('full', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
    __game.save.coins = 50;
    __game.persist();
  });
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.equal(await page.evaluate(() => __game.save.coins), 50);
});

test('pause freezes the round and draws again only after a resize', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.draws = 0;
    const ctx = document.getElementById('cv').getContext('2d'), draw = ctx.drawImage;
    ctx.drawImage = function (img) {
      if (img && img.width === 1280) window.draws++;
      return draw.apply(this, arguments);
    };
  });
  await clickControl(page, '#btnPlay');
  const intro = await page.evaluate(() => { stepGame(20); return { joke: document.getElementById('siren-joke').textContent, hidden: document.getElementById('siren').hidden }; });
  assert.equal(intro.hidden, false, 'the disaster intro is on screen');
  assert.ok(intro.joke && intro.joke.length > 4, 'the intro has a funny line');
  assert.equal(await page.evaluate(() => __game.world.players), 1);
  assert.equal(await page.evaluate(() => __game.world.actors.filter(a => a.bot).length), 7);
  await page.evaluate(() => stepGame(20));
  const frame = await page.evaluate(() => __game.world.frames);
  await clickControl(page, '#btnPause');
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  const held = await page.evaluate(() => { stepGame(8); const a = draws; const f = __game.world.frames; stepGame(40); return [f, __game.world.frames, a, draws]; });
  assert.equal(held[0], frame);
  assert.equal(held[1], frame);
  assert.equal(held[3], held[2], 'a paused scene is not redrawn');
  await page.setViewportSize({ width: 1100, height: 620 });
  const redrawn = await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    const a = draws; stepGame(6); return draws - a;
  });
  assert.equal(redrawn, 1);
  await clickControl(page, '#btnResume');
  assert.equal(await page.evaluate(() => { const a = __game.world.frames; stepGame(3); return __game.world.frames < a; }), true);
});

test('two players keep separate keys, a popped kid becomes a cloud, and results stay end or draw', async t => {
  const page = await game(t);
  await clickControl(page, '#btnTwo');
  await clickControl(page, '#btnStart');
  assert.equal(await page.evaluate(() => __game.world.players), 2);
  assert.equal(await page.evaluate(() => __game.world.actors.filter(a => a.bot).length), 6);
  const moved = await page.evaluate(() => {
    const a = __game.world.actors.filter(p => !p.bot);
    const start = [a[0].x, a[1].x];
    return { start };
  });
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => stepGame(25));
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  const later = await page.evaluate(() => __game.world.actors.filter(p => !p.bot).map(p => p.x));
  assert.ok(later[0] > moved.start[0] + 4, 'player 1 walks right with D');
  assert.ok(later[1] < moved.start[1] - 4, 'player 2 walks left with ArrowLeft');

  await page.evaluate(() => {
    const p = __game.player;
    p.y = 820; p.vy = 0;
    stepGame(520);
  });
  assert.equal(await page.evaluate(() => __game.player.mode), 'cloud');
  await page.evaluate(() => stepGame(70));
  await page.keyboard.down('KeyE');
  await page.evaluate(() => stepGame(8));
  await page.keyboard.up('KeyE');
  assert.ok(await page.evaluate(() => __game.player.drops >= 1), 'the cloud drops an item');

  await page.evaluate(() => {
    while (__game.mode === 'play' && __game.world.phase !== 'podium') {
      const humans = __game.world.actors.filter(a => !a.bot);
      humans.forEach(park);
      simGame(1);
    }
  });
  assert.equal(await page.evaluate(() => __game.mode), 'result');
  assert.equal(await page.evaluate(() => ends[0][0]), 'draw');
  assert.equal(await page.evaluate(() => rounds[0][0]), 'match');
  assert.equal(await page.evaluate(() => ends.some(e => e[0] === 'win' || e[0] === 'lose')), false);
});

test('the coin count keeps its number and stays clear of mute and pause', async t => {
  const page = await game(t);
  await clickControl(page, '#btnPlay');
  await page.evaluate(() => { __game.save.coins = 128; stepGame(1); });
  const sizes = [[1024, 576], [1100, 620], [1920, 1080]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const box = await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      stepGame(1);
      const r = el => {
        const b = el.getBoundingClientRect();
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
      };
      return {
        coins: r(document.getElementById('hud-coins')),
        num: r(document.getElementById('hud-coin-n')),
        mute: r(document.querySelector('.sg-mute')),
        pause: r(document.getElementById('btnPause')),
        text: document.getElementById('hud-coin-n').textContent,
        hard: document.getElementById('hud-coins').classList.contains('hard'),
        vw: innerWidth
      };
    });
    const label = width + 'x' + height;
    const clearOf = (a, b) => {
      const vert = a.top < b.bottom && a.bottom > b.top;
      const horiz = a.left < b.right && a.right > b.left;
      if (vert && horiz) return 0;
      if (!vert) return 99;
      return a.left >= b.right ? a.left - b.right : b.left - a.right;
    };
    assert.equal(box.text, '128', label + ' shows the coin number');
    assert.ok(box.num.width > 10 && box.num.height > 10, label + ' number is on screen');
    assert.ok(box.num.left >= -1 && box.num.right <= box.vw + 1, label + ' number stays inside the window');
    assert.ok(clearOf(box.coins, box.mute) >= 8, label + ' coins meet the mute button ' + JSON.stringify(box));
    assert.ok(clearOf(box.num, box.mute) >= 8, label + ' number meets the mute button');
    assert.ok(clearOf(box.coins, box.pause) >= 8, label + ' coins meet pause ' + JSON.stringify(box));
  }
});

test('one player can win, restart counts a new round, and leaving early ends the match', async t => {
  const page = await game(t);
  await clickControl(page, '#btnPlay');
  await page.evaluate(() => {
    while (__game.mode === 'play') { park(__game.player); simGame(1); }
  });
  assert.equal(await page.evaluate(() => ends.at(-1)[0]), 'win');
  assert.ok(await page.evaluate(() => __game.save.coins) >= 20, 'a full survival pays for a hat');
  const podium = await page.evaluate(() => {
    const pods = [...document.querySelectorAll('#podium .pod')];
    const height = el => el ? el.getBoundingClientRect().height : 0;
    return {
      line: __game.hudLine(),
      title: document.getElementById('r-title').textContent,
      nudge: document.getElementById('r-nudge').textContent,
      nudgeOn: !document.getElementById('r-nudge').hidden,
      classes: pods.map(el => el.className),
      steps: pods.map(el => height(el.querySelector('.step'))),
      canvases: pods.map(el => !!el.querySelector('canvas')),
      scores: pods.map(el => el.querySelector('b').textContent)
    };
  });
  assert.equal(podium.line.includes('6/5'), false, podium.line);
  assert.equal(podium.line.includes('انتهت الجولات'), true, podium.line);
  assert.equal(podium.title.includes('6/5'), false);
  assert.equal(podium.nudgeOn, true);
  assert.equal(podium.nudge, 'قبعة جديدة!');
  assert.deepEqual(podium.classes, ['pod p2', 'pod p1', 'pod p3']);
  assert.ok(podium.steps[1] > podium.steps[0] && podium.steps[0] > podium.steps[2], 'first place is the tall middle step');
  assert.deepEqual(podium.canvases, [true, true, true]);
  assert.ok(podium.scores.every(s => /^\d\/4$/.test(s)), podium.scores.join(','));
  const gap = await page.evaluate(() => {
    const score = document.querySelector('#podium .pod.p3 b').getBoundingClientRect();
    const line = document.getElementById('r-titles').getBoundingClientRect();
    return line.top - score.bottom;
  });
  assert.ok(gap >= 8, 'the stats line clears 3rd place by ' + gap);
  await page.evaluate(() => document.getElementById('r-nudge').click());
  assert.equal(await page.evaluate(() => __game.mode), 'shop');
  await page.evaluate(() => document.getElementById('btnShopBack').click());
  assert.equal(await page.evaluate(() => __game.mode), 'title');
  await clickControl(page, '#btnPlay');
  assert.equal(await page.evaluate(() => __game.matches), 2);
  assert.equal(await page.evaluate(() => rounds.length), 2);
  await clickControl(page, '#btnPause');
  await clickControl(page, '#btnMenu');
  assert.equal(await page.evaluate(() => ends.at(-1)[0]), 'end');
  assert.equal(await page.evaluate(() => __game.mode), 'title');
});

test('the intro card keeps one countdown clear of the stair, and a survival throws coins', async t => {
  const page = await game(t);
  await clickControl(page, '#btnPlay');
  const intro = await page.evaluate(() => {
    while (__game.world.phase === 'inter' && Math.ceil(__game.world.frames / 60) > 4) simGame(1);
    stepGame(1);
    const card = document.getElementById('siren');
    const count = document.getElementById('siren-count');
    const fours = [...document.querySelectorAll('#ui *')].filter(el => el.children.length === 0 && el.textContent.trim() === '4').map(el => el.id);
    const canvas = document.getElementById('cv').getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const scale = canvas.width / 1280;
    const heads = canvas.top + (288 - 72) * scale;
    const bg = getComputedStyle(card).backgroundColor;
    return {
      hidden: card.hidden,
      joke: document.getElementById('siren-joke').textContent,
      tip: document.getElementById('siren-tip').textContent,
      count: count.textContent,
      jokePx: parseFloat(getComputedStyle(document.getElementById('siren-joke')).fontSize),
      tipPx: parseFloat(getComputedStyle(document.getElementById('siren-tip')).fontSize),
      countPx: parseFloat(getComputedStyle(count).fontSize),
      fours,
      bg,
      clear: box.bottom < heads - 2,
      bottom: box.bottom,
      heads
    };
  });
  assert.equal(intro.hidden, false);
  assert.ok(intro.joke.length > 4);
  assert.ok(intro.tip.length > 4);
  assert.equal(intro.count, '4');
  assert.ok(intro.jokePx >= 27, 'joke is ' + intro.jokePx);
  assert.ok(intro.tipPx >= 21, 'tip is ' + intro.tipPx);
  assert.ok(intro.countPx >= 72, 'countdown is ' + intro.countPx);
  assert.deepEqual(intro.fours, ['siren-count']);
  assert.equal(intro.bg === 'rgba(0, 0, 0, 0)', false, intro.bg);
  assert.equal(intro.clear, true, 'card bottom ' + intro.bottom + ' heads ' + intro.heads);

  const flown = await page.evaluate(() => {
    let stamps = 0;
    let seen = false;
    while (__game.mode === 'play' && stamps < 2) {
      const phase = __game.world.phase;
      if (phase === 'stamp') {
        if (!seen) { stamps++; seen = true; }
      } else seen = false;
      if (stamps >= 2) break;
      park(__game.player);
      simGame(1);
    }
    const held = __game.world.frames;
    simGame(5);
    const streak = document.getElementById('streak');
    return {
      flies: document.getElementById('flies').childElementCount,
      streak: streak.hidden ? '' : streak.textContent,
      shown: document.getElementById('hud-coin-n').textContent,
      bank: __game.save.coins,
      phase: __game.world.phase,
      held: held === __game.world.frames
    };
  });
  assert.equal(flown.phase, 'stamp');
  assert.equal(flown.held, true, 'a survival holds the round for a beat');
  assert.ok(flown.flies >= 3, 'coins leave the survivor ' + flown.flies);
  assert.equal(flown.streak, 'رائع!');
  assert.ok(Number(flown.shown) < flown.bank, 'the counter waits for the coins to land ' + flown.shown + '/' + flown.bank);
});

const VIEWPORTS = [[1024, 576], [1280, 720], [1366, 768], [1920, 1080], [1280, 600]];

async function sweep(page, selectors, label) {
  const failures = [];
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    const report = await page.evaluate(({ selectors, width, height }) => {
      window.dispatchEvent(new Event('resize'));
      const box = el => {
        const b = el.getBoundingClientRect();
        return { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
      };
      const inside = (b, w, h) => b.top >= -0.5 && b.left >= -0.5 && b.bottom <= h + 0.5 && b.right <= w + 0.5 && b.width > 8 && b.height > 8;
      const contained = (inner, outer) => inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5 && inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
      const exposed = el => {
        if (getComputedStyle(el).pointerEvents === 'none') return true;
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return !!hit && (hit === el || el.contains(hit));
      };
      return selectors.map(sel => {
        const el = document.querySelector(sel);
        if (!el || el.hidden) return { sel, missing: true };
        const b = box(el);
        const panel = el.closest('.panel');
        const pb = panel ? box(panel) : null;
        return {
          sel,
          b,
          inside: inside(b, width, height),
          inPanel: pb ? contained(b, pb) : true,
          exposed: exposed(el),
          scroll: panel ? panel.scrollHeight - panel.clientHeight : 0
        };
      });
    }, { selectors, width, height });
    const tag = label + ' ' + width + 'x' + height;
    for (const row of report) {
      if (row.missing) failures.push(tag + ' missing ' + row.sel);
      else if (!row.inside) failures.push(tag + ' clips ' + row.sel + ' ' + JSON.stringify(row.b));
      else if (!row.inPanel) failures.push(tag + ' outside card ' + row.sel);
      else if (!row.exposed) failures.push(tag + ' covered ' + row.sel);
      else if (row.scroll > 1 && label === 'podium') failures.push(tag + ' card scrolls by ' + row.scroll);
    }
  }
  assert.deepEqual(failures, []);
}

test('the end card and the other overlays stay fully on screen', async t => {
  const page = await game(t);
  await clickControl(page, '#btnShop');
  await sweep(page, ['#scr-shop .panel', '#btnShopBack'], 'shop');
  await page.setViewportSize({ width: 1280, height: 600 });
  await clickControl(page, '#btnShopBack');
  assert.equal(await page.evaluate(() => __game.mode), 'title');

  await clickControl(page, '#btnPlay');
  await page.evaluate(() => {
    while (__game.world.phase === 'inter' && Math.ceil(__game.world.frames / 60) > 4) simGame(1);
    stepGame(1);
  });
  await sweep(page, ['#siren'], 'intro');

  await page.evaluate(() => {
    while (!document.getElementById('siren').hidden && __game.mode === 'play') simGame(1);
  });
  await clickControl(page, '#btnPause');
  await sweep(page, ['#scr-pause .panel', '#btnResume', '#btnRestart', '#btnMenu'], 'pause');
  await clickControl(page, '#btnResume');

  await page.evaluate(() => {
    while (__game.mode === 'play') { park(__game.player); simGame(1); }
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  const podium = await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    const again = getComputedStyle(document.getElementById('btnAgain'));
    const title = getComputedStyle(document.getElementById('r-title'));
    const menu = getComputedStyle(document.getElementById('btnResultMenu'));
    const first = document.querySelector('#podium .pod.p1 canvas');
    const third = document.querySelector('#podium .pod.p3 canvas');
    const score = document.querySelector('#podium .pod.p3 b').getBoundingClientRect();
    const line = document.getElementById('r-titles').getBoundingClientRect();
    return {
      banner: !document.getElementById('banner').hidden,
      again: parseFloat(again.fontSize),
      title: parseFloat(title.fontSize),
      menu: parseFloat(menu.fontSize),
      againH: document.getElementById('btnAgain').getBoundingClientRect().height,
      titleH: document.getElementById('r-title').getBoundingClientRect().height,
      hop: first ? getComputedStyle(first).animationName : '',
      plant: third ? getComputedStyle(third).animationName : '',
      motion: document.documentElement.getAttribute('data-sg-motion'),
      gap: line.top - score.bottom
    };
  });
  assert.equal(podium.banner, true, 'a first survival shows the record line');
  assert.ok(podium.again > podium.title, 'play again ' + podium.again + ' title ' + podium.title);
  assert.ok(podium.again > podium.menu, 'play again is bigger than the menu button');
  assert.ok(podium.againH > podium.titleH, 'the play-again button is taller than the title');
  assert.ok(podium.gap >= 8, 'the stats line clears 3rd place by ' + podium.gap);
  if (podium.motion !== 'reduce') {
    assert.equal(podium.hop, 'winhop');
    assert.equal(podium.plant, 'plant');
  }
  await sweep(page, ['#scr-result .panel', '#btnAgain', '#btnResultMenu', '#r-titles', '#scr-result .lead'], 'podium');
});

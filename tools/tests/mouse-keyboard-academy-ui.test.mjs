// Browser checks for أكاديمية الفأرة واللوحة: damaged saves, stations, and no page scroll.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

async function openGame(t, { init, query = '', reduced = false, viewport } = {}) {
  const context = await browser.newContext({
    viewport: viewport || { width: 1280, height: 720 },
    reducedMotion: reduced ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  if (init) await page.addInitScript(init);
  await page.goto(`${server.origin}/games/mouse-keyboard-academy/${query}`);
  await page.waitForFunction(() => window.__game && window.__game.screen);
  return page;
}

function learnedGrip() {
  localStorage.setItem('sg:mouse-keyboard-academy:save', JSON.stringify({ v: 1, done: {}, unlocked: 1, name: '', grip: true }));
}

test('a damaged save opens the grip lesson, and the map can start after it', async t => {
  const damaged = await openGame(t, { init: () => localStorage.setItem('sg:mouse-keyboard-academy:save', '{not json') });
  assert.equal(await damaged.evaluate(() => __game.screen), 'grip');
  assert.equal(await damaged.evaluate(() => __game.save.unlocked), 1);
  assert.match(await damaged.locator('#prompt').innerText(), /أمسك/);
  await damaged.locator('#btnMap').click();
  assert.equal(await damaged.evaluate(() => __game.screen), 'map');
  assert.equal(await damaged.locator('#btnStart').textContent(), 'ابدأ');
  assert.match(await damaged.locator('#btnGrip').textContent(), /كيف أمسك/);

  const kept = await openGame(t, { init: () => localStorage.setItem('sg:mouse-keyboard-academy:save', JSON.stringify({
    v: 1, done: { move: true, nope: true }, unlocked: 2, name: 'ل'
  })) });
  const state = await kept.evaluate(() => ({ unlocked: __game.save.unlocked, move: __game.save.done.move === true, nope: __game.save.done.nope, name: __game.save.name }));
  assert.deepEqual(state, { unlocked: 2, move: true, nope: undefined, name: 'ل' });
  assert.equal(await kept.locator('.station[data-station="click"]').isEnabled(), true);
  assert.equal(await kept.locator('.station[data-station="double"]').isDisabled(), true);
});

test('a new student replaces progress only after the save succeeds', async t => {
  const page = await openGame(t, { init: () => localStorage.setItem('sg:mouse-keyboard-academy:save', JSON.stringify({
    v: 1, done: { move: true }, unlocked: 2, name: 'ل'
  })) });
  await page.locator('#btnNew').click();
  await page.locator('#btnYesReset').click();
  assert.equal(await page.evaluate(() => __game.save.unlocked), 1);
  assert.equal(await page.evaluate(() => __game.save.done.move), undefined);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:mouse-keyboard-academy:save')?.includes('"move":true')), false);
});

test('teacher station links open that station without marking it done', async t => {
  const page = await openGame(t, { query: '?station=double' });
  assert.equal(await page.evaluate(() => __game.screen), 'play');
  assert.equal(await page.evaluate(() => __game.station), 'double');
  assert.equal(await page.evaluate(() => __game.progress), 0);
  assert.equal(await page.evaluate(() => __game.save.done.double), undefined);
  assert.equal(await page.evaluate(() => __game.save.unlocked >= 3), true);
  const chest = page.locator('#chest');
  await chest.dblclick();
  await page.waitForFunction(() => __game.progress === 1);
  assert.equal(await page.evaluate(() => __game.screen), 'play');
});

test('arrows move the character and a letter key follows event.code', async t => {
  const arrows = await openGame(t, { query: '?station=arrows' });
  const before = await arrows.evaluate(() => document.querySelector('.mcell.player')?.getAttribute('data-x'));
  await arrows.keyboard.press('ArrowRight');
  const after = await arrows.evaluate(() => document.querySelector('.mcell.player')?.getAttribute('data-x'));
  assert.notEqual(after, before);
  assert.equal(await arrows.evaluate(() => __game.progress), 0);

  const letters = await openGame(t, { query: '?station=letters' });
  await letters.keyboard.press('a');
  assert.equal(await letters.evaluate(() => __game.progress), 0);
  await letters.keyboard.press('h');
  assert.equal(await letters.evaluate(() => __game.progress), 1);
  assert.match(await letters.locator('#langHint').textContent(), /الإنجليزية/);
  assert.equal(await letters.locator('#langHint').isVisible(), true);
});

test('drag, scroll, and a short window do not scroll the page', async t => {
  const drag = await openGame(t, { query: '?station=drag' });
  const fruit = await drag.locator('#fruit').boundingBox();
  const zone = await drag.locator('#zone').boundingBox();
  await drag.mouse.move(fruit.x + fruit.width / 2, fruit.y + fruit.height / 2);
  await drag.mouse.down();
  await drag.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 8 });
  await drag.mouse.up();
  assert.equal(await drag.evaluate(() => __game.progress), 1);

  const scroll = await openGame(t, { query: '?station=scroll', viewport: { width: 1100, height: 620 } });
  await scroll.waitForFunction(() => {
    const scroller = document.getElementById('scroller');
    return scroller && scroller.clientHeight > 80 && __game.progress === 0;
  });
  const pageScroll = await scroll.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.ok(pageScroll.sh <= pageScroll.ch + 1, `page height ${pageScroll.sh} > ${pageScroll.ch}`);
  assert.ok(pageScroll.sw <= pageScroll.cw + 1, `page width ${pageScroll.sw} > ${pageScroll.cw}`);
  await scroll.evaluate(() => {
    const scroller = document.getElementById('scroller');
    scroller.scrollTop = scroller.scrollHeight;
  });
  await scroll.waitForFunction(() => __game.progress === 3 || __game.screen === 'celebrate');
});

test('a miss wiggles the star and التالي opens the next lesson', async t => {
  const page = await openGame(t, { init: learnedGrip });
  await page.locator('#btnStart').click();
  await page.waitForFunction(() => __game.screen === 'play' && __game.station === 'move' && !document.getElementById('ghost').hidden);
  const box = await page.locator('#field').boundingBox();
  await page.mouse.click(box.x + 24, box.y + 28);
  await page.waitForFunction(() => document.querySelector('#field .star.nudge'));
  for (let i = 0; i < 4; i++) {
    await page.waitForFunction(() => __game.screen === 'celebrate' || document.querySelector('#field .star'));
    if (await page.evaluate(() => __game.screen === 'celebrate')) break;
    const point = await page.evaluate(() => __game.starPoint());
    await page.mouse.move(point.x, point.y, { steps: 8 });
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => __game.screen === 'celebrate');
  assert.match(await page.locator('#btnNext').innerText(), /التالي/);
  await page.locator('#btnNext').click();
  await page.waitForFunction(() => __game.screen === 'play' && __game.station === 'click' && __game.progress === 0);
});

test('how to hold the mouse and keyboard comes before the lessons', async t => {
  const page = await openGame(t, { viewport: { width: 1100, height: 620 } });
  async function fits(selector) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box, selector);
    assert.ok(box.y >= -1 && box.y + box.height <= 621, `${selector} y ${box.y} h ${box.height}`);
    assert.ok(box.x >= -1 && box.x + box.width <= 1101, `${selector} x ${box.x} w ${box.width}`);
  }
  async function pageFits() {
    const scroll = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }));
    assert.ok(scroll.sh <= scroll.ch + 1, `page height ${scroll.sh} > ${scroll.ch}`);
    assert.ok(scroll.sw <= scroll.cw + 1, `page width ${scroll.sw} > ${scroll.cw}`);
  }
  assert.equal(await page.evaluate(() => __game.screen), 'grip');
  assert.match(await page.locator('#prompt').innerText(), /أمسك/);
  assert.ok((await page.locator('.prompt-text').innerText()).trim().split(/\s+/).length <= 2);
  assert.equal(await page.locator('.grip-note').count(), 0);
  await pageFits();
  await fits('#prompt');
  await fits('[data-grip="left"]');
  await fits('.replay');
  assert.equal(await page.locator('#btnGripNext').isHidden(), true);
  await page.locator('[data-grip="left"]').click();
  await page.waitForFunction(() => !document.getElementById('btnGripNext').hidden);
  assert.match(await page.locator('#btnGripNext').innerText(), /التالي/);
  assert.match(await page.locator('#toast').innerText(), /أحسنت/);
  await fits('#btnGripNext');
  await page.locator('#btnGripNext').click();

  assert.match(await page.locator('#prompt').innerText(), /انقر/);
  await page.locator('[data-grip="right"]').click();
  await page.waitForFunction(() => !document.getElementById('btnGripNext').hidden);
  await page.locator('#btnGripNext').click();

  assert.match(await page.locator('#prompt').innerText(), /حرّك/);
  const star = await page.locator('[data-grip="star"]').boundingBox();
  await page.mouse.move(star.x + star.width / 2, star.y + star.height / 2);
  await page.waitForFunction(() => !document.getElementById('btnGripNext').hidden);
  await page.locator('#btnGripNext').click();

  assert.match(await page.locator('#prompt').innerText(), /اضغط/);
  const keys = await page.evaluate(() => document.querySelector('.grip-stage').textContent);
  assert.ok(keys.includes('ب') && keys.includes('ت'));
  assert.equal(keys.includes('ش'), false);
  await page.keyboard.press('q');
  assert.equal(await page.locator('#btnGripNext').isHidden(), true);
  await page.locator('.bump[data-code="KeyJ"]').click();
  await page.waitForFunction(() => !document.getElementById('btnGripNext').hidden);
  await pageFits();
  await page.locator('#btnGripNext').click();

  assert.match(await page.locator('#prompt').innerText(), /اجلس/);
  assert.equal(await page.locator('#btnGripNext').isHidden(), false);
  await page.locator('[data-sit="kid"]').click();
  assert.equal(await page.evaluate(() => document.querySelector('.child').classList.contains('sat')), true);
  await pageFits();
  await fits('[data-sit="kid"]');
  await page.locator('#btnGripNext').click();
  await page.waitForFunction(() => __game.screen === 'play' && __game.station === 'move');
  assert.equal(await page.evaluate(() => __game.save.grip), true);
  assert.equal(await page.evaluate(() => __game.save.done.move), undefined);

  await page.locator('#btnMap').click();
  assert.equal(await page.locator('#btnStart').textContent(), 'ابدأ');
  await page.locator('#btnGrip').click();
  assert.equal(await page.evaluate(() => __game.screen), 'grip');
  assert.match(await page.locator('#prompt').innerText(), /أمسك/);
  await page.locator('#btnMap').click();
  assert.equal(await page.evaluate(() => __game.save.grip), true);
  assert.equal(await page.evaluate(() => __game.screen), 'map');
});

test('grip cards fit the classroom sizes without overlapping', async t => {
  const sizes = [[1024, 576], [1280, 800], [1366, 768]];
  function intersects(a, b) {
    return a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
  }
  async function inside(page, selector, width, height) {
    const box = await page.locator(selector).first().boundingBox();
    assert.ok(box, selector);
    assert.ok(box.y >= -1 && box.x >= -1 && box.y + box.height <= height + 1 && box.x + box.width <= width + 1,
      `${width}x${height} ${selector} at ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    return box;
  }
  async function pageFits(page) {
    const scroll = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }));
    assert.ok(scroll.sh <= scroll.ch + 1, `page height ${scroll.sh} > ${scroll.ch}`);
    assert.ok(scroll.sw <= scroll.cw + 1, `page width ${scroll.sw} > ${scroll.cw}`);
  }
  async function words(page) {
    const text = (await page.locator('.prompt-text').innerText()).trim();
    assert.ok(text.split(/\s+/).length <= 2, text);
    const picture = ((await page.locator('.grip-stage').innerText()) || '').replace(/\s/g, '');
    assert.ok(picture.length <= 3, picture);
  }
  for (const [width, height] of sizes) {
    const page = await openGame(t, { viewport: { width, height }, reduced: true });
    await pageFits(page);
    await words(page);
    await inside(page, '#prompt', width, height);
    await inside(page, '.grip-stage', width, height);
    const replay = await inside(page, '.replay', width, height);
    const left = await inside(page, '[data-grip="left"]', width, height);
    assert.equal(intersects(replay, left), false, `${width}x${height} replay covers the mouse`);
    assert.equal(await page.locator('.grip-note').count(), 0);
    await page.locator('[data-grip="left"]').click();
    const next = await inside(page, '#btnGripNext', width, height);
    assert.equal(intersects(next, left), false, `${width}x${height} next covers the mouse`);
    await pageFits(page);
    await page.locator('#btnGripNext').click();
    await inside(page, '[data-grip="right"]', width, height);
    await page.locator('[data-grip="right"]').click();
    await page.locator('#btnGripNext').click();
    await pageFits(page);
    const star = await inside(page, '[data-grip="star"]', width, height);
    const wrist = await page.evaluate(() => {
      const glide = document.querySelector('.glide');
      const rest = document.querySelector('.wrist');
      return !!glide && !!rest && !glide.contains(rest);
    });
    assert.equal(wrist, true, `${width}x${height} wrist stays put while the mouse glides`);
    await page.locator('[data-grip="star"]').click();
    await inside(page, '#btnGripNext', width, height);
    assert.equal(intersects(star, replay), false);
    await page.locator('#btnGripNext').click();
    await pageFits(page);
    await words(page);
    for (const key of ['KeyF', 'KeyJ']) {
      const button = await inside(page, `.bump[data-code="${key}"]`, width, height);
      assert.equal(intersects(replay, button), false, `${width}x${height} replay covers ${key}`);
    }
    await page.locator('.bump[data-code="KeyF"]').click();
    await inside(page, '#btnGripNext', width, height);
    await page.locator('#btnGripNext').click();
    await pageFits(page);
    await inside(page, '[data-sit="kid"]', width, height);
    await inside(page, '#btnGripNext', width, height);
    const poses = await page.evaluate(() => {
      const kid = document.querySelector('.child');
      const slouch = getComputedStyle(kid).transform;
      kid.classList.add('sat');
      const tall = getComputedStyle(kid).transform;
      kid.classList.remove('sat');
      return slouch !== 'none' && slouch !== tall;
    });
    assert.equal(poses, true, `${width}x${height} sitting up changes the pose`);
    await words(page);
    assert.equal(await page.locator('#btnTeacher').click().then(() => page.locator('.panel').innerText()).then(text => /لليد اليسرى/.test(text)), true);
  }
});

test('reduced motion still shows the station prompt', async t => {
  const page = await openGame(t, { reduced: true, init: learnedGrip });
  await page.locator('#btnStart').click();
  await page.waitForFunction(() => __game.screen === 'play');
  assert.match(await page.locator('#prompt').innerText(), /حرّك الفأرة/);
  assert.equal(await page.locator('#prompt').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-sg-motion')), 'reduce');
});

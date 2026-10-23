import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import { svgDataUri } from '../lib/svg-data-uri.mjs';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('SVG URI insertion cannot escape an img attribute or inline JSON script', async t => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><style><![CDATA[/* </script><!-- <script> " & */]]></style><rect width="40" height="40" fill="#ff00ff"/><text x="0" y="20">ألعاب &amp; " # % ?</text></svg>`;
  const uri = svgDataUri(svg);
  const browser = await launchChromium(); t.after(() => browser.close());
  const page = await browser.newPage();
  const table = JSON.stringify({ sample: uri }).replace(/<\//g, '<\\/');
  await page.setContent('<!doctype html><meta charset="utf-8"><script>window.thumbs=' + table + ';window.prefixReached=true;</script><script>window.afterReached=true;</script><div id="images"></div>');
  const result = await page.evaluate(async uri => {
    const box = document.getElementById('images'); box.innerHTML = '<img src="' + thumbs.sample + '">';
    await box.firstElementChild.decode();
    return { prefixReached, afterReached, same: thumbs.sample === uri, count: box.childElementCount, tag: box.firstElementChild.tagName, loaded: box.firstElementChild.naturalWidth };
  }, uri);
  assert.deepEqual(result, { prefixReached: true, afterReached: true, same: true, count: 1, tag: 'IMG', loaded: 40 });
});

test('every optimized thumbnail renders exactly the same pixels as its editable source', async t => {
  const thumbnails = fs.readdirSync(path.join(repo, 'games')).flatMap(slug => {
    const file = path.join(repo, 'games', slug, 'thumb.svg');
    if (!fs.existsSync(file)) return [];
    const source = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    const optimized = svgDataUri(source);
    assert.equal(svgDataUri(source.replace(/\n/g, '\r\n')), optimized, slug + ': CRLF encoding differs');
    return [{ slug, original: 'data:image/svg+xml;base64,' + Buffer.from(source).toString('base64'),
      windows: 'data:image/svg+xml;base64,' + Buffer.from(source.replace(/\n/g, '\r\n')).toString('base64'), optimized }];
  });
  const catalog = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), catalog);
  assert.deepEqual(thumbnails.map(thumb => thumb.slug).sort(), Array.from(catalog.window.GAMES, game => game.slug).sort(), 'every catalog thumbnail is covered');
  // A static font fixture avoids the live portal concurrently rasterizing its
  // lazy thumbnails/animations while the exact artwork comparisons run.
  const server = await startTestServer(repo, { pages: { '/artwork-fonts': '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/shared/game.css"><p style="font:700 32px Fredoka">ألعاب A</p>' } });
  t.after(() => server.close());
  const browser = await launchChromium();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(server.origin + '/artwork-fonts');
  await page.evaluate(async () => { await document.fonts.load('500 32px Fredoka', 'ألعاب A'); await document.fonts.load('700 32px Fredoka', 'ألعاب A'); await document.fonts.ready; });
  const comparison = await page.evaluate(async thumbnails => {
    async function pixels(src) {
      // Match the portal's actual double-quoted HTML src insertion path.
      const box = document.createElement('div'); box.innerHTML = '<img src="' + src + '">';
      const image = box.firstElementChild;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 400;
      canvas.getContext('2d').drawImage(image, 0, 0, 400, 400);
      return { png: canvas.toDataURL(), rgba: canvas.getContext('2d').getImageData(0, 0, 400, 400).data };
    }
    const differences = [], pngOnlyDifferences = [];
    const unequalPixels = (left, right) => left.rgba.some((channel, index) => channel !== right.rgba[index]);
    for (const { slug, original, windows, optimized } of thumbnails) {
      const expected = await pixels(original);
      const actual = await pixels(optimized), crlf = await pixels(windows);
      const changed = unequalPixels(expected, actual), windowsChanged = unequalPixels(expected, crlf);
      if (changed || windowsChanged) differences.push({ slug, changed, windowsChanged, original: expected.png, optimized: actual.png, windows: crlf.png });
      else if (expected.png !== actual.png || expected.png !== crlf.png) pngOnlyDifferences.push(slug);
    }
    return { differences, pngOnlyDifferences, count: thumbnails.length, fonts: document.fonts.status };
  }, thumbnails);
  const evidence = path.join(repo, '.work/performance/asset-pixel-differences');
  fs.mkdirSync(evidence, { recursive: true });
  for (const difference of comparison.differences) for (const variant of ['original', 'optimized', 'windows']) {
    fs.writeFileSync(path.join(evidence, difference.slug + '-' + variant + '.png'), Buffer.from(difference[variant].split(',')[1], 'base64'));
  }
  const differences = comparison.differences.map(({ slug, changed, windowsChanged }) => ({ slug, changed, windowsChanged }));
  fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ ...comparison, differences }, null, 2) + '\n');
  // Compare every RGBA channel exactly. PNG container/compressor differences
  // are recorded separately and must not be mistaken for different pixels.
  assert.deepEqual(differences, []);
});

function buildFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-artwork-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  for (const file of ['tools/build.mjs', 'tools/check-all.mjs', 'tools/lib/svg-data-uri.mjs', 'tools/lib/zip.mjs']) write(file, fs.readFileSync(path.join(repo, file)));
  write('index.html', '<!doctype html><body><script src="js/catalog.js"></script><script src="js/site.js"></script></body>');
  write('js/catalog.js', 'window.GAMES=[{slug:"demo"}];');
  write('js/site.js', 'window.ready=true;');
  write('teacher.html', '<!doctype html><body><main id="teacherApp"></main><script src="js/catalog.js"></script><script src="js/teacher.js"></script></body>');
  write('js/teacher.js', 'window.SGTeacher={};');
  write('games/demo/index.html', '<!doctype html><body>Demo</body>');
  write('games/demo/thumb.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect fill="#ff00ff" width="400" height="400"/></svg>');
  write('shared/fonts/LICENSE-Test.txt', 'Test font license');
  write('tools/playtest.mjs', 'console.log(JSON.stringify({ok:true,pageErrors:[],consoleErrors:[],externalRequests:[],failedRequests:[],harnessErrors:[],notes:[]}));');
  const built = spawnSync(process.execPath, ['tools/build.mjs', '--no-minify'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(built.status, 0, built.stderr);
  return { root, write, portal: fs.readFileSync(path.join(root, '_site/index.html'), 'utf8') };
}

function checkFixture(f) {
  return spawnSync(process.execPath, ['tools/check-all.mjs'], {
    cwd: f.root, encoding: 'utf8', timeout: 30000, env: { ...process.env, SG_ROOT: '_site' }
  });
}

test('release smoke rejects missing, changed and unknown embedded thumbnails', t => {
  const f = buildFixture(t);
  const good = JSON.parse(f.portal.match(/window\.SG_THUMBS=(\{[^\r\n]*\});/)[1]);
  for (const [table, message] of [
    [{}, /missing embedded thumbnail/],
    [{ demo: good.demo.replace('%23ff00ff', '%23000000') }, /does not match its source/],
    [{ ...good, unknown: good.demo }, /has no catalog entry/]
  ]) {
    f.write('_site/index.html', f.portal.replace(/window\.SG_THUMBS=(\{[^\r\n]*\});/, 'window.SG_THUMBS=' + JSON.stringify(table) + ';'));
    const checked = checkFixture(f);
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, message);
  }
});

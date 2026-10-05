import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { svgDataUri } from '../lib/svg-data-uri.mjs';
import { launchChromium } from '../browser.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('SVG URLs preserve quoted text, entities, CDATA, Arabic and significant whitespace', async t => {
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<!-- removed comment -->
<g font-family="'Segoe UI', Arial" data-label='a "quoted" value'>
<text xml:space="preserve" x="4" y="40">  "ألعاب"   A &amp; B &lt; C &quot;D&quot; &apos;E&apos; % #
	<tspan> more  text </tspan></text>
<style><![CDATA[text { font-family: "Arial"; } /* <fake attr="unchanged"> */]]></style>
</g></svg>`;
  const uri = svgDataUri(svg);
  assert.equal(svgDataUri(svg.replace(/\n/g, '\r\n')), uri);
  assert.equal(svgDataUri(svg.replace(/\n/g, '\r')), uri);
  assert.doesNotMatch(uri, /["<>\r\n\t]/);
  assert.ok(uri.length < ('data:image/svg+xml,' + encodeURIComponent(svg)).length);
  const browser = await launchChromium();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await page.evaluate(({ original, optimized }) => {
    function normalized(source) {
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error(doc.querySelector('parsererror').textContent);
      const comments = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
      const remove = [];
      while (comments.nextNode()) remove.push(comments.currentNode);
      remove.forEach(node => node.remove());
      return new XMLSerializer().serializeToString(doc.documentElement);
    }
    return { original: normalized(original), optimized: normalized(decodeURIComponent(optimized.split(',').slice(1).join(','))) };
  }, { original: svg, optimized: uri });
  assert.equal(result.optimized, result.original);
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
  assert.ok(thumbnails.length > 0);
  const browser = await launchChromium();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const differences = await page.evaluate(async thumbnails => {
    async function pixels(src) {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 400;
      canvas.getContext('2d').drawImage(image, 0, 0, 400, 400);
      return canvas.toDataURL();
    }
    const differences = [];
    for (const { slug, original, windows, optimized } of thumbnails) {
      const expected = await pixels(original);
      if (expected !== await pixels(optimized) || expected !== await pixels(windows)) differences.push(slug);
    }
    return differences;
  }, thumbnails);
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
  for (const file of ['tools/build.mjs', 'tools/check-all.mjs', 'tools/lib/svg-data-uri.mjs']) write(file, fs.readFileSync(path.join(repo, file)));
  write('index.html', '<!doctype html><body><script src="js/catalog.js"></script><script src="js/site.js"></script></body>');
  write('js/catalog.js', 'window.GAMES=[{slug:"demo"}];');
  write('js/site.js', 'window.ready=true;');
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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Windows-1252 bytes that are not the same character in Latin-1.
const CP1252 = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
  [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
  [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
  [0x017E, 0x9E], [0x0178, 0x9F]
]);
const FROM_CP1252 = new Map([...CP1252].map(([code, byte]) => [byte, code]));

function cp1252Bytes(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code <= 0x7F || (code >= 0xA0 && code <= 0xFF)) bytes.push(code);
    else if (CP1252.has(code)) bytes.push(CP1252.get(code));
    else return null;
  }
  return Buffer.from(bytes);
}

function asCp1252(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCodePoint(FROM_CP1252.get(byte) ?? byte);
  return text;
}

// UTF-8 read as Latin-1/Windows-1252, or UTF-8 with the high bit stripped
// (that is how «سباق البيض» became 3('B 'D(J6).
export function hasLatin1Mojibake(text) {
  const bytes = cp1252Bytes(text);
  if (bytes) {
    try {
      const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (repaired !== text && /[\u0600-\u06FF]/.test(repaired)) return true;
    } catch { /* the bytes are not a UTF-8 sequence */ }
  }
  // Continuation bytes of Arabic UTF-8, high bit cleared, C0 controls bumped into letters.
  return !/[\u0600-\u06FF]/.test(text) && /['()][A-Za-z0-9'()]{2,}/.test(text);
}

test('every game thumbnail is UTF-8 and free of Latin-1 mojibake', () => {
  assert.equal(hasLatin1Mojibake(asCp1252(Buffer.from('سباق البيض', 'utf8'))), true);
  assert.equal(hasLatin1Mojibake("3('B 'D(J6"), true);
  assert.equal(hasLatin1Mojibake('سباق البيض'), false);
  assert.equal(hasLatin1Mojibake('+8%'), false);

  const slugs = fs.readdirSync(path.join(repo, 'games')).filter(slug => fs.existsSync(path.join(repo, 'games', slug, 'thumb.svg')));
  assert.ok(slugs.length >= 30);
  for (const slug of slugs) {
    const file = path.join(repo, 'games', slug, 'thumb.svg');
    const bytes = fs.readFileSync(file);
    let svg;
    try { svg = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { assert.fail(slug + '/thumb.svg is not valid UTF-8'); }
    assert.equal(svg.includes('\uFFFD'), false, slug);
    const texts = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map(match => match[1].replace(/<[^>]+>/g, ''));
    for (const text of texts) assert.equal(hasLatin1Mojibake(text), false, slug + ' text ' + JSON.stringify(text));
  }

  const egg = fs.readFileSync(path.join(repo, 'games/egg-rush/thumb.svg'), 'utf8');
  assert.match(egg, /سباق البيض/);
  assert.match(egg, /direction="rtl"/);
  assert.match(egg, /Fredoka/);
});

// Remove only formatting whitespace outside content/preserved XML contexts.
// Geometry and quoted attribute values are never rewritten. Keeping this here
// also gives the build and release-smoke check the same deterministic encoder.
const TOKENS = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
const CONTENT = new Set(['text', 'tspan', 'textpath', 'style', 'script', 'title', 'desc', 'foreignobject']);
function compactMarkup(svg) {
  // XML normalizes literal CRLF/CR before parsing; normalize checkout endings.
  svg = svg.replace(/\r\n?/g, '\n');
  if (/<!DOCTYPE/i.test(svg)) return svg; // Leave complex declarations intact.
  const preserved = [];
  let result = '', cursor = 0;
  const appendText = text => { if (preserved.at(-1) || !/^[ \t\n\r]*$/.test(text)) result += text; };
  for (const match of svg.matchAll(TOKENS)) {
    appendText(svg.slice(cursor, match.index));
    let token = match[0];
    cursor = match.index + token.length;
    if (token.startsWith('<!--') || /^<\?xml\s/i.test(token)) continue;
    if (/^<\//.test(token)) preserved.pop();
    else if (/^<[A-Za-z_]/.test(token)) {
      const name = token.match(/^<([\w:.-]+)/)[1].split(':').at(-1).toLowerCase();
      const keep = !!preserved.at(-1) || CONTENT.has(name) || /\bxml:space\s*=\s*(['"])preserve\1/.test(token);
      if (!/\/\s*>$/.test(token)) preserved.push(keep);
      token = token.replace(/"[^"]*"|'[^']*'|[ \t\n\r]+/g, part => /^[ \t\n\r]+$/.test(part) ? ' ' : part).replace(/ +(\/?>)$/, '$1');
    }
    result += token;
  }
  appendText(svg.slice(cursor));
  return result.trim();
}

// Single-quoted XML attributes need no escaping in double-quoted img src.
export function svgDataUri(svg) {
  const compact = compactMarkup(svg).replace(TOKENS, token => {
    if (token.startsWith('<!--') || /^<\?xml\s/i.test(token)) return '';
    if (!/^<[A-Za-z_]/.test(token)) return token;
    return token.replace(/'[^']*'|"([^"]*)"/g, (quoted, value) =>
      value !== undefined && !value.includes("'") ? "'" + value + "'" : quoted);
  }).trim();
  // Keep URL/HTML/script delimiters and stripped controls encoded. Ordinary
  // Unicode glyphs can stay UTF-8 in the portal, instead of tripling each byte.
  // Text whitespace and JavaScript line separators must survive every parser.
  return 'data:image/svg+xml,' + compact.replace(/[%#?"&<>\x00-\x1F\x7F\u2028\u2029]/gu, c => encodeURIComponent(c));
}

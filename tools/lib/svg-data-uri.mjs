// Keep SVG geometry, text and whitespace intact. Single-quoted XML attributes
// need no escaping inside the portal's double-quoted img src attributes.
export function svgDataUri(svg) {
  // XML normalizes literal CRLF/CR to LF before parsing; do the same so Git's
  // checkout line endings do not add URL escapes or change the built artwork.
  const compact = svg.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g, token => {
    if (token.startsWith('<!--') || /^<\?xml\s/i.test(token)) return '';
    if (!/^<[A-Za-z_]/.test(token)) return token;
    return token.replace(/'[^']*'|"([^"]*)"/g, (quoted, value) =>
      value !== undefined && !value.includes("'") ? "'" + value + "'" : quoted);
  }).trim();
  // Encode URL delimiters, HTML delimiters and characters URL parsers strip.
  // In particular, whitespace in text/xml:space and Arabic glyphs must survive.
  return 'data:image/svg+xml,' + compact.replace(/[%#"&<>\t\r\n]|[^\x00-\x7F]/gu, c => encodeURIComponent(c));
}

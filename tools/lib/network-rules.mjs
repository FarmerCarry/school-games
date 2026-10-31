// The site's network rule (docs/ARCHITECTURE.md "Telemetry sink"): nothing uses the
// network except the portal's anonymous telemetry sink, js/telemetry.js, which may call
// fetch() and nothing else (not sendBeacon, which always sends the ingest host's
// cookies). tools/check-all.mjs and tools/tests/play-stats-rules.test.mjs both use
// these, so the carve-out is the same exact path everywhere.
export const SENDER = 'js/telemetry.js';
export const NETWORK = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bRTCPeerConnection\b/, 'RTCPeerConnection'],
  [/\bimportScripts\s*\(/, 'importScripts()'],
  [/\.src\s*=\s*['"`]https?:/, 'an external image or script address (a beacon)'],
  [/\b(?:src|href|action)\s*=\s*["']https?:\/\//, 'an external address']
];
const SENDER_MAY = new Set(['fetch()']);

// The names of the network APIs `text` uses. `file` is its path in the site ('/'
// separators); only exactly js/telemetry.js may use fetch().
export function networkUse(file, text) {
  return NETWORK.filter(([pattern, name]) => pattern.test(text) && !(file === SENDER && SENDER_MAY.has(name))).map(([, name]) => name);
}

// The fast build inlines the sender into the portal (tools/build.mjs). `copies` are the
// sender as the build may inline it. Returns the page without that one exact copy, and
// the copy, so the rest of the page is checked like any other file and the copy like
// the sender. A copy that differs from js/telemetry.js in any byte is not split off.
export function splitSender(html, copies) {
  for (const copy of copies) {
    const at = copy ? html.indexOf(copy) : -1;
    if (at >= 0 && html.indexOf(copy, at + 1) < 0) return { rest: html.slice(0, at) + html.slice(at + copy.length), sender: copy };
  }
  return { rest: html, sender: '' };
}

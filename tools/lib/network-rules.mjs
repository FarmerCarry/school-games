// The site's network rule: nothing on the site uses the network. Games, the shared
// scripts and the portal run from a folder or the offline cache and never send anything.
// tools/check-all.mjs checks every page and script against these.
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
// The names of the network APIs `text` uses.
export function networkUse(text) {
  return NETWORK.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
}

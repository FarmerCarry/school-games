#!/usr/bin/env node
/*
 * Measures what a game actually sounds like while it is played (headless Chromium).
 *
 *   node tools/audio-probe.mjs <slug> [--actions file.json | --actions-json '<json>'] [--wav out.wav]
 *
 * Taps everything the game sends to the speakers and reports, per second of play:
 *   rms / peak       loudness (peak >= 0.99 means clipping / distortion)
 *   hiss             share of energy above 4 kHz (constant hiss or harsh buzz shows up here)
 *   noisy            spectral flatness 0..1 (near 1 = static/rushing noise, near 0 = musical tones)
 *   floor            the quietest level heard during play: a high floor = a sound that never stops
 *   nodes            live audio sources (growing without end = a sound leak)
 * and flags: CLIPPING, CONSTANT HISS, LOUD, NEVER QUIET, NODE LEAK.
 * --wav also writes the recording so a person can listen to it.
 * Actions use the same format as tools/playtest.mjs (a default play script is used if omitted).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;

const argv = process.argv.slice(2);
const slug = argv[0];
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
let actions = [
  { wait: 1500 }, { click: [640, 360] }, { press: 'Enter' }, { press: 'Space' }, { wait: 1500 },
  { repeat: 8, do: [{ hold: 'ArrowRight', ms: 500 }, { press: 'ArrowUp' }, { hold: 'ArrowLeft', ms: 500 }, { press: 'Space' }, { move: [400, 300] }, { click: [700, 420] }, { wait: 300 }] },
  { wait: 2000 }
];
if (opt('--actions')) actions = JSON.parse(fs.readFileSync(opt('--actions'), 'utf8'));
if (opt('--actions-json')) actions = JSON.parse(opt('--actions-json'));
const wavOut = opt('--wav');
if (!slug) { console.error('usage: node tools/audio-probe.mjs <slug> [--actions f.json] [--wav out.wav]'); process.exit(2); }

const { origin, close: closeServer } = await startTestServer(ROOT);

// Injected before the game: route everything that reaches ctx.destination through a recorder.
const INIT = () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  window.__probe = { chunks: [], sources: 0, maxSources: 0, sr: 0, t0: 0 };
  const P = window.__probe;
  const realConnect = AudioNode.prototype.connect;
  const taps = new WeakMap();
  function tapFor(ctx) {
    if (taps.has(ctx)) return taps.get(ctx);
    const tap = ctx.createGain();
    const rec = ctx.createScriptProcessor(4096, 1, 1);
    P.sr = ctx.sampleRate;
    rec.onaudioprocess = ev => {
      const d = ev.inputBuffer.getChannelData(0);
      P.chunks.push(Array.from(d));
      if (P.chunks.length > 2400) P.chunks.shift();
      ev.outputBuffer.getChannelData(0).fill(0);
    };
    realConnect.call(tap, ctx.destination);
    realConnect.call(tap, rec);
    realConnect.call(rec, ctx.destination);
    taps.set(ctx, tap);
    return tap;
  }
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target && target === this.context.destination) return realConnect.call(this, tapFor(this.context), ...rest);
    return realConnect.call(this, target, ...rest);
  };
  for (const Ctor of [window.AudioBufferSourceNode, window.OscillatorNode]) {
    if (!Ctor) continue;
    const start = Ctor.prototype.start;
    Ctor.prototype.start = function (...a) {
      P.sources++; P.maxSources = Math.max(P.maxSources, P.sources);
      this.addEventListener('ended', () => { P.sources--; });
      return start.apply(this, a);
    };
  }
};

const browser = await launchChromium({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(INIT);
const errors = [];
page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('requestfailed', r => errors.push(r.url() + ' :: ' + r.failure()?.errorText));
page.on('response', r => { if (r.status() >= 400) errors.push(r.url() + ' :: HTTP ' + r.status()); });
await page.goto(`${origin}/games/${slug}/index.html`, { waitUntil: 'load' });
const key = k => (k === 'Space' || k === ' ') ? ' ' : k;
const nodeSamples = [];
async function run(list) {
  for (const a of list) {
    if (a.wait != null) await page.waitForTimeout(a.wait);
    else if (a.click) await page.mouse.click(a.click[0], a.click[1]);
    else if (a.move) await page.mouse.move(a.move[0], a.move[1], { steps: 4 });
    else if (a.press) await page.keyboard.press(key(a.press));
    else if (a.hold) { await page.keyboard.down(key(a.hold)); await page.waitForTimeout(a.ms || 300); await page.keyboard.up(key(a.hold)); }
    else if (a.drag) { await page.mouse.move(...a.drag[0]); await page.mouse.down(); await page.mouse.move(...a.drag[1], { steps: 15 }); await page.mouse.up(); }
    else if (a.eval) await page.evaluate(a.eval);
    else if (a.repeat) for (let i = 0; i < a.repeat; i++) await run(a.do || []);
    nodeSamples.push(await page.evaluate(() => window.__probe ? window.__probe.sources : 0));
  }
}
await run(actions);
const data = await page.evaluate(() => window.__probe ? { chunks: window.__probe.chunks, sr: window.__probe.sr, maxSources: window.__probe.maxSources, sources: window.__probe.sources } : null);
await browser.close();
await closeServer();
process.exitCode = errors.length ? 1 : 0;

if (!data || !data.chunks.length) { console.log(`${slug}: no audio recorded (the game never produced sound)${errors.length ? '; errors: ' + errors.join(' | ') : ''}`); process.exit(errors.length ? 1 : 0); }
const sr = data.sr;
const all = new Float32Array(data.chunks.reduce((a, c) => a + c.length, 0));
let o = 0; for (const c of data.chunks) { all.set(c, o); o += c.length; }

// Per-second stats. "hiss" = energy of a first-difference (high-pass ~ above 4 kHz) vs total.
const secs = [];
for (let s = 0; s + sr <= all.length; s += sr) {
  let sum = 0, peak = 0, dsum = 0, prev = all[s];
  for (let i = s; i < s + sr; i++) {
    const v = all[i]; sum += v * v; peak = Math.max(peak, Math.abs(v));
    const d = v - prev; dsum += d * d; prev = v;
  }
  const rms = Math.sqrt(sum / sr);
  // For white noise diff-energy ~ 2x signal energy; for a 1 kHz tone ~ 0.04x.
  const hiss = sum > 1e-9 ? dsum / sum / 2 : 0;
  secs.push({ rms, peak, hiss });
}
// Spectral flatness (geometric / arithmetic mean of the power spectrum) of 4096-sample windows.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function flatness(s0) {
  const N = 4096, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = all[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  fft(re, im);
  let lg = 0, ar = 0, n = 0;
  const lo = Math.floor(80 * N / sr), hi = Math.floor(8000 * N / sr);
  for (let k = lo; k < hi; k++) { const p = re[k] * re[k] + im[k] * im[k] + 1e-12; lg += Math.log(p); ar += p; n++; }
  return Math.exp(lg / n) / (ar / n);
}
// Only windows where something is audible count (silence would score as "noise").
function winRms(s0) { let q = 0; for (let i = s0; i < s0 + 4096; i++) q += all[i] * all[i]; return Math.sqrt(q / 4096); }
secs.forEach((x, i) => { let f = 0, c = 0; for (let s0 = i * sr; s0 + 4096 <= (i + 1) * sr; s0 += 4096) { if (winRms(s0) < 0.003) continue; f += flatness(s0); c++; } x.noisy = c ? f / c : 0; });

// Quietest 100 ms window per second -> noise floor
let floor = Infinity;
const win = Math.floor(sr / 10);
for (let s = sr * 2; s + win <= all.length; s += win) {   // skip the first 2 s (title screen)
  let sum = 0; for (let i = s; i < s + win; i++) sum += all[i] * all[i];
  floor = Math.min(floor, Math.sqrt(sum / win));
}
const db = x => x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf';
const flags = [];
const clip = secs.filter(x => x.peak >= 0.99).length;
if (clip) flags.push(`CLIPPING in ${clip}s`);
const loud = secs.filter(x => x.rms > 0.35).length;
if (loud) flags.push(`LOUD in ${loud}s`);
const hissy = secs.filter(x => x.rms > 0.01 && x.hiss > 0.35).length;
if (hissy > secs.length * 0.4) flags.push(`CONSTANT HISS (${hissy}/${secs.length}s)`);
const noisySecs = secs.filter(x => x.rms > 0.005 && x.noisy > 0.25).length;
if (noisySecs > secs.length * 0.4) flags.push(`STATIC/RUSHING NOISE (${noisySecs}/${secs.length}s)`);
if (floor > 0.02) flags.push(`NEVER QUIET (floor ${db(floor)} dB)`);
const tail = nodeSamples.slice(-5);
if (data.sources > 120 || (tail.length > 3 && tail.every((v, i) => i === 0 || v >= tail[i - 1]) && tail[tail.length - 1] > 80)) flags.push(`NODE LEAK? (${data.sources} live sources)`);

console.log(`== ${slug}: ${secs.length}s recorded, floor ${db(floor)} dB, max live sources ${data.maxSources}${errors.length ? ', page errors: ' + errors.join(' | ') : ''}`);
console.log('   sec   rms(dB)  peak   hiss  noisy');
secs.forEach((x, i) => console.log(`   ${String(i).padStart(3)}  ${db(x.rms).padStart(7)}  ${x.peak.toFixed(2)}  ${x.hiss.toFixed(2)}  ${x.noisy.toFixed(2)}`));
console.log(flags.length ? '   FLAGS: ' + flags.join(', ') : '   no flags');

if (wavOut) {
  const n = all.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(all[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(wavOut, buf);
  console.log('   wrote ' + wavOut);
}

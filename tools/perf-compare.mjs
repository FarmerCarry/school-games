#!/usr/bin/env node
// Compare like-for-like reports; timing is evidence, not a universal CI pass gate.
// node tools/perf-compare.mjs baseline.json candidate.json --json comparison.json
// Add --noise baseline-control.json to include drift from a repeated unchanged run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { summarize } from './perf.mjs';

function profile(report) {
  const configKeys = ['samples', 'seconds', 'latency', 'graphics', 'headed', 'viewport', 'deviceScaleFactor', 'serviceWorkers', 'cacheControl', 'storage', 'cpuThrottle', 'networkThrottle', 'order', 'scenarioVersion', 'scenarioSha256', 'browserToolSha256', 'inputToolSha256', 'toolSha256', 'targets'];
  const environmentKeys = ['browserVersion', 'channel', 'renderer', 'node', 'platform', 'release', 'arch', 'cpu', 'logicalCpus'];
  return { config: Object.fromEntries(configKeys.map(key => [key, report.config?.[key]])),
    environment: Object.fromEntries(environmentKeys.map(key => [key, report.environment?.[key]])) };
}
const digest = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

export function compareReports(baseline, candidate, control = null) {
  for (const report of [baseline, candidate]) {
    if (report.format !== 2 || !report.config || !report.environment || !Array.isArray(report.samples) || !Array.isArray(report.summary)) throw new Error('Expected format-2 performance report');
    if (report.samples.some(sample => sample.error || sample.errors?.length)) throw new Error('A run has failed samples/runtime errors; fix them before comparing');
    for (const target of report.config.targets) {
      const samples = report.samples.filter(sample => sample.target === target);
      if (samples.length < 5) throw new Error(target + ': at least five equivalent samples are required');
      if (samples.length !== report.config.samples) throw new Error(target + ': incomplete sample count');
      if (new Set(samples.map(sample => sample.repetition)).size !== samples.length) throw new Error(target + ': duplicate repetitions');
      if (samples.some(sample => sample.cold.dpr !== report.config.deviceScaleFactor || sample.warm.dpr !== report.config.deviceScaleFactor || sample.cold.controlledByServiceWorker || sample.warm.controlledByServiceWorker || sample.cold.fromServiceWorker || sample.warm.fromServiceWorker)) throw new Error(target + ': DPR or service-worker profile differs');
    }
  }
  const baselineProfile = profile(baseline), candidateProfile = profile(candidate);
  if (JSON.stringify(baselineProfile) !== JSON.stringify(candidateProfile)) throw new Error('Measurements have different browser/environment/scenario profiles; rerun under matched conditions');
  const profileDigest = digest(baselineProfile);
  if (control && (control.format !== 1 || control.profileDigest !== profileDigest || !Array.isArray(control.timings))) throw new Error('Noise control does not match the measurement profile');
  const timings = [];
  // Recompute from raw samples so stale/edited summaries cannot invent a gain.
  const leftSummary = summarize(baseline.samples, baseline.config.targets);
  const rightSummary = summarize(candidate.samples, candidate.config.targets);
  for (const left of leftSummary) {
    const right = rightSummary.find(row => row.target === left.target);
    if (!right) throw new Error('Candidate lacks target: ' + left.target);
    for (const section of ['cold', 'warm', 'activity']) {
      for (const [metric, before] of Object.entries(left[section])) {
        if (!metric.endsWith('Ms')) continue;
        const after = right[section][metric];
        if (before === null && after === null) continue; // Portal has no playable game.
        if (!before || !after || before.n < 5 || after.n < 5) throw new Error(`${left.target}.${section}.${metric}: insufficient finite samples`);
        const deltaMs = after.median - before.median;
        const measuredSpreadMs = Math.max(before.p90 - before.p10, after.p90 - after.p10, 1);
        const oldControl = control?.timings.find(row => row.target === left.target && row.section === section && row.metric === metric);
        const noiseMs = Math.max(measuredSpreadMs, oldControl?.controlNoiseMs || 0);
        const leftSamples = baseline.samples.filter(sample => sample.target === left.target);
        const rightSamples = candidate.samples.filter(sample => sample.target === left.target);
        const pairs = leftSamples.flatMap(sample => {
          const matched = rightSamples.find(other => other.repetition === sample.repetition);
          return matched ? [matched[section][metric] - sample[section][metric]] : [];
        });
        const needed = Math.ceil(pairs.length * 0.8);
        const consistentlyFaster = pairs.filter(delta => delta < 0).length >= needed;
        const consistentlySlower = pairs.filter(delta => delta > 0).length >= needed;
        timings.push({ target: left.target, section, metric, baseline: before, candidate: after,
          deltaMs: +deltaMs.toFixed(3), noiseMs: +noiseMs.toFixed(3),
          controlNoiseMs: +Math.max(measuredSpreadMs, Math.abs(deltaMs)).toFixed(3), pairs: pairs.length,
          outcome: deltaMs < -noiseMs && consistentlyFaster ? 'improvement beyond observed spread' : deltaMs > noiseMs && consistentlySlower ? 'regression beyond observed spread' : 'within observed noise or inconsistent' });
      }
    }
  }
  const assets = baseline.build.assets.map(before => {
    const after = candidate.build.assets.find(asset => asset.file === before.file);
    if (!after) throw new Error('Candidate lacks asset: ' + before.file);
    return { file: before.file, baselineBytes: before.bytes, candidateBytes: after.bytes, deltaBytes: after.bytes - before.bytes,
      baselineGzipBytes: before.localGzipBytes, candidateGzipBytes: after.localGzipBytes,
      baselineBrotliBytes: before.localBrotliBytes, candidateBrotliBytes: after.localBrotliBytes };
  });
  return { format: 1, profileDigest, profile: baselineProfile,
    baseline: { commit: baseline.build.commit, root: baseline.build.root }, candidate: { commit: candidate.build.commit, root: candidate.build.root },
    criteria: 'At least five samples per target with the same profile. A timing gain/regression must exceed both runs\u2019 p10\u2013p90 spread (and unchanged-control drift when supplied), with the same direction in at least 80% of paired repetitions. A 1 ms resolution floor prevents sub-ms claims. This is an evidence rule, not a confidence interval or classroom FPS claim.',
    timings, assets,
    warnings: baseline.samples.some(sample => sample.activity.restarts) || candidate.samples.some(sample => sample.activity.restarts) ? ['Recovery/reloads occurred; inspect scenarios before making an active-rendering claim.'] : [],
    hasTimingGain: timings.some(metric => metric.outcome.startsWith('improvement')),
    hasTimingRegression: timings.some(metric => metric.outcome.startsWith('regression')),
    hasByteSavings: assets.some(asset => asset.deltaBytes < 0) };
}

function main(argv) {
  const [before, after, ...args] = argv;
  if (!before || !after || before.startsWith('--') || after.startsWith('--')) throw new Error('Usage: node tools/perf-compare.mjs baseline.json candidate.json [--json comparison.json] [--noise baseline-control.json]');
  let output, control;
  for (let i = 0; i < args.length; i++) {
    if (!['--json', '--noise'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid comparison option: ' + args[i]);
    const flag = args[i], value = args[++i];
    if (flag === '--json') output = value; else control = JSON.parse(fs.readFileSync(value));
  }
  const comparison = compareReports(JSON.parse(fs.readFileSync(before)), JSON.parse(fs.readFileSync(after)), control);
  for (const row of comparison.timings.filter(row => ['firstUsefulMs', 'playableMs', 'inputResponsiveMs', 'p95FrameMs'].includes(row.metric))) {
    console.log(`${row.target} ${row.section}.${row.metric}: ${row.baseline.median} -> ${row.candidate.median} ms; delta ${row.deltaMs}, observed noise ${row.noiseMs}; ${row.outcome}`);
  }
  for (const asset of comparison.assets.filter(asset => asset.deltaBytes)) console.log(`${asset.file}: ${asset.baselineBytes} -> ${asset.candidateBytes} bytes (${asset.deltaBytes})`);
  if (output) { const absolute = path.resolve(output); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, JSON.stringify(comparison, null, 2) + '\n'); }
  console.log('Comparable reports. Keep/revert still requires visual/gameplay/offline checks and no material regression.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { testHoop, testHoopRewards } from './regressions-hoop.mjs';
import { testMass, testSnake } from './regressions-mass.mjs';
import { testNativeControls, testPortalKeyboard, testTypingTab, testGameTab } from './regressions-keyboard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SG_ROOT ? path.resolve(REPO, process.env.SG_ROOT) : REPO;
const unitOnly = process.argv.includes('--unit-only');
const browserOnly = process.argv.includes('--browser-only');
if (unitOnly && browserOnly) throw new Error('Choose either --unit-only or --browser-only');
console.log(`Gameplay regressions (${path.relative(REPO, ROOT) || 'source'})`);
if (!browserOnly) {
  console.log('  ✓ Hoop Heads engine:', await testHoop({ root: REPO }));
  console.log('  ✓ Snake/Blob invariants:', await testMass({ root: REPO }));
}
if (!unitOnly) {
  const server = await startTestServer(ROOT);
  const browser = await launchChromium();
  try {
    await testNativeControls({ browser, origin: server.origin, repo: REPO });
    await testPortalKeyboard({ browser, origin: server.origin });
    await testTypingTab({ browser, origin: server.origin });
    await testGameTab({ browser, origin: server.origin });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      console.log('  ✓ Hoop Heads saved rewards:', await testHoopRewards({ page, baseURL: server.origin + '/' }));
    } finally { await context.close(); }
    const snakeContext = await browser.newContext();
    try {
      const page = await snakeContext.newPage();
      console.log('  ✓ Snake Arena peak persistence:', await testSnake({ page, origin: server.origin }));
    } finally { await snakeContext.close(); }
  } finally { await browser.close(); await server.close(); }
}
console.log('All gameplay regressions passed.');

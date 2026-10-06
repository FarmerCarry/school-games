#!/usr/bin/env node
// Mutation checks: a loaded page is not enough. The smoke scenario must reject
// a Start or Pause button whose real handler has stopped working.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { runScenario } from './game-scenarios.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.SG_ROOT ? path.resolve(repo,process.env.SG_ROOT) : repo;
const {origin,close} = await startTestServer(root);
let browser;
try {
  browser = await launchChromium();
  for (const [selector,expected] of [[null,null],['#btnPlay',/Start must reach gameplay/],['#btnPause',/Pause must open/]]) {
    const context = await browser.newContext({viewport:{width:1280,height:720}});
    const page = await context.newPage();
    try {
      await page.goto(origin + '/games/merge-2048/');
      await page.waitForFunction(() => !!window.__game);
      if (selector) await page.evaluate(selector => {
        const button = document.querySelector(selector);
        button.replaceWith(button.cloneNode(true)); // Appearance remains, handler is gone.
      },selector);
      if (expected) await assert.rejects(() => runScenario(page,'merge-2048'),expected);
      else assert.equal((await runScenario(page,'merge-2048')).checks.length,4);
      console.log('✓ gameplay scenario ' + (selector ? `rejects inert ${selector}` : 'accepts working controls'));
    } finally { await context.close(); }
  }
} finally { if (browser) await browser.close(); await close(); }

#!/usr/bin/env node
// Mutation checks: a loaded page is not enough. The smoke scenario must reject
// a Start or Pause button whose real handler has stopped working, and an input
// check must fail when the player does nothing.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { prepareScenario, runScenario, scenarios } from './game-scenarios.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.SG_ROOT ? path.resolve(repo,process.env.SG_ROOT) : repo;
// An input that does nothing must fail each game's input check. Each such case waits
// out the full 7 s input bound, so all 31 would add about 5 minutes. CI checks a
// sample, once, against the source (the scenario definitions are the same for the
// fast build): the eight games whose players move or act by themselves, then one game
// for each other kind of input check: a held key among computer players, an
// auto-runner's jump, pointer, drag, typing, DOM button and board move. Name games,
// or "all", to check others:  node tools/test-scenarios.mjs drift-king
const sample = [
  'paint-grab', 'snake-arena', 'moto-madness', 'sumo-bonk', 'hoop-heads', 'wacky-soccer', 'blob-battle', 'drift-king',
  'tank-splat', 'beat-dash', 'air-hockey', 'block-burst', 'typing-test', 'skybound-golf', 'connect-four'
];
const named = process.argv.slice(2);
const inertInput = named.includes('all') ? Object.keys(scenarios) : named.length ? named : process.env.SG_ROOT ? [] : sample;
for (const slug of inertInput) assert.ok(scenarios[slug], `No gameplay scenario for ${slug}`);
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
  for (const slug of inertInput) {
    const context = await browser.newContext({viewport:{width:1280,height:720}});
    const page = await context.newPage();
    const scenario = scenarios[slug];
    scenarios[slug] = {...scenario, input: async () => {}, heldKey: undefined};
    try {
      await prepareScenario(page,slug);
      await page.goto(origin + `/games/${slug}/`);
      await assert.rejects(() => runScenario(page,slug),/primary input must change gameplay/);
      console.log(`✓ ${slug} scenario rejects an input that does nothing`);
    } finally { scenarios[slug] = scenario; await context.close(); }
  }
} finally { if (browser) await browser.close(); await close(); }

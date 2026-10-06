import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { testHoop } from '../regressions-hoop.mjs';
import { testMass } from '../regressions-mass.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('Hoop Heads engine preserves match, overtime and tournament invariants', () => testHoop({ root }));
test('Snake and Blob simulations preserve mass and score invariants', () => testMass({ root }));

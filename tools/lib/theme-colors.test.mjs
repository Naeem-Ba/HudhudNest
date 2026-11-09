// Colour-system guard. Run by `npm run test:tools` (and therefore CI).
// 1) every token pair that components rely on meets WCAG 2.2 AA in light AND dark;
// 2) no var(--x) points at a token that does not exist;
// 3) hard-coded colour literals may not grow (tools/theme-colors-baseline.json only ever goes down).
// Docs and how to add a colour: docs/design/color-system.md
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseTokens, contrast, undefinedVars, hardcodedColorCounts, SRC } from './theme-colors.mjs';

const { light, dark } = parseTokens();
const SURFACES = ['--surface', '--page-bg', '--gray-100', '--bg-secondary'];

/** [foreground, background(s), minimum ratio, why] */
const PAIRS = [
  ...['--text-primary', '--text-secondary', '--text-tertiary', '--text-muted', '--text-placeholder', '--text-strong',
      '--primary-text', '--gold-text', '--link', '--success-text', '--danger-text', '--warning-text', '--info-text']
    .map(t => [t, SURFACES, 4.5, 'text on neutral surfaces']),
  ['--success-text', ['--success-bg'], 4.5, 'status text on its tint'],
  ['--danger-text', ['--error-bg'], 4.5, 'status text on its tint'],
  ['--warning-text', ['--warning-bg'], 4.5, 'status text on its tint'],
  ['--info-text', ['--info-bg'], 4.5, 'status text on its tint'],
  ['--badge-rent-text', ['--badge-rent-bg'], 4.5, 'rent badge'],
  ['--badge-sale-text', ['--badge-sale-bg'], 4.5, 'sale badge'],
  ['--badge-featured-text', ['--badge-featured-bg'], 4.5, 'featured badge'],
  ['--text-on-primary', ['--primary'], 4.5, 'text on gold buttons'],
  ['--text-on-accent', ['--accent'], 4.5, 'text on accent'],
  ['#ffffff', ['--danger-solid', '--success-solid', '--warning-solid', '--neutral-solid'], 4.5, 'white on solid status buttons'],
  ['--inverse-text', ['--inverse-bg'], 4.5, 'selected chips / strong buttons'],
  ['--tooltip-text', ['--tooltip-bg'], 4.5, 'tooltip'],
  ['--text-on-navy', ['--navy'], 4.5, 'text on navy'],
  ['--text-on-navy-muted', ['--navy'], 4.5, 'secondary text on navy'],
  // WCAG 1.4.11 non-text contrast (3:1)
  ['--input-border', ['--surface', '--input-bg'], 3, 'input boundary'],
  ['--focus-ring', SURFACES, 3, 'focus ring'],
  ['--focus-border', ['--surface'], 3, 'focus border'],
  ['--success-icon', ['--surface'], 3, 'status icon'],
  ['--error-icon', ['--surface'], 3, 'status icon'],
  ['--warning-icon', ['--surface'], 3, 'status icon'],
  ['--info-icon', ['--surface'], 3, 'status icon'],
];

for (const [name, vars] of [['light', light], ['dark', dark]]) {
  test(`token contrast contract (${name})`, () => {
    const failures = [];
    for (const [fg, bgs, min, why] of PAIRS) {
      for (const bg of bgs) {
        const ratio = contrast(vars, fg, bg);
        if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min} (${why})`);
      }
    }
    assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
  });
}

test('every semantic token is defined for both themes', () => {
  for (const t of ['--text-primary', '--text-muted', '--text-placeholder', '--link', '--success-text', '--danger-text',
    '--warning-text', '--info-text', '--input-border', '--focus-ring', '--card-bg', '--surface-elevated', '--modal-bg',
    '--table-header-bg', '--skeleton-base', '--tooltip-bg', '--dropdown-bg', '--divider', '--border-subtle']) {
    assert.ok(light[t] !== undefined, `${t} missing in light`);
    assert.ok(dark[t] !== undefined, `${t} missing in dark`);
  }
});

test('no var(--x) refers to an undefined token', () => {
  assert.deepEqual(undefinedVars(), [], 'undefined CSS custom properties (they fall back to a light-only hex in dark mode)');
});

test('hard-coded colour literals do not grow', () => {
  const baselineFile = path.resolve(SRC, '../tools/theme-colors-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const now = hardcodedColorCounts();
  const grew = Object.entries(now).filter(([f, n]) => n > (baseline[f] ?? 0)).map(([f, n]) => `${f}: ${baseline[f] ?? 0} -> ${n}`);
  assert.deepEqual(grew, [], `New hard-coded colours. Use a semantic token from src/styles/_tokens.scss (docs/design/color-system.md). If it is a genuine brand colour, add a token, not a literal.\n${grew.join('\n')}`);
});

// Rewrites tools/theme-colors-baseline.json from the current tree. Only run after REMOVING literals.
import fs from 'node:fs';
import path from 'node:path';
import { hardcodedColorCounts } from './lib/theme-colors.mjs';
const out = path.resolve(import.meta.dirname, 'theme-colors-baseline.json');
const now = Object.fromEntries(Object.entries(hardcodedColorCounts()).sort());
fs.writeFileSync(out, JSON.stringify(now, null, 2) + '\n');
console.log(`baseline: ${Object.keys(now).length} files, ${Object.values(now).reduce((a, b) => a + b, 0)} literals`);

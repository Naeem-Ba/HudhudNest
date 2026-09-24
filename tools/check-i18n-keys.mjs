// Fails when the code uses a translation key that public/i18n/en.json does not define, or when
// ar/en/de do not have the same keys. Without it a wrong key only shows up as raw text on screen
// (SHORTSTAY.STATUS.* instead of SHORTSTAY.BOOKINGS.STATUS.*, audit 2026-09-23).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findKeyLiterals, flattenKeys, missingKeys, parityGaps } from './lib/i18n-keys.mjs';

const root = process.cwd();
const languages = ['ar', 'en', 'de'];

const keysByLanguage = Object.fromEntries(
  languages.map((language) => [
    language,
    flattenKeys(JSON.parse(readFileSync(join(root, 'public', 'i18n', `${language}.json`), 'utf8')))
  ])
);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const usedBy = new Map();
for (const file of sourceFiles(join(root, 'src'))) {
  for (const key of findKeyLiterals(readFileSync(file, 'utf8'))) {
    if (!usedBy.has(key)) usedBy.set(key, relative(root, file));
  }
}

let failed = false;
for (const key of missingKeys([...usedBy.keys()], keysByLanguage.en)) {
  console.error(`[check-i18n] missing key ${key} (used in ${usedBy.get(key)})`);
  failed = true;
}
for (const gap of parityGaps(keysByLanguage)) {
  console.error(`[check-i18n] ${gap.missing.length} key(s) in ${gap.from}.json missing from ${gap.to}.json: ${gap.missing.slice(0, 10).join(', ')}`);
  failed = true;
}

if (failed) process.exit(1);
console.log(`[check-i18n] ${usedBy.size} keys used in code, all defined; ${languages.join('/')} in parity.`);

// Prints how complete public/i18n/<lang>.json is against en.json (see tools/lib/i18n-coverage.mjs for what
// "translated" means). Usage: node tools/i18n-coverage.mjs [tr|de|ar ...]   (default: tr). Exit 1 on any problem in tr.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TR_OTHER_SCRIPT, TR_SAME_AS_ENGLISH, measureCoverage } from './lib/i18n-coverage.mjs';

const root = process.cwd();
const load = (language) => JSON.parse(readFileSync(join(root, 'public', 'i18n', `${language}.json`), 'utf8'));
const languages = process.argv.slice(2).length ? process.argv.slice(2) : ['tr'];
const english = load('en');
let failed = false;

for (const language of languages) {
  const report = measureCoverage(english, load(language), {
    script: language === 'ar' ? 'arabic' : 'latin',
    allowSameAsEnglish: language === 'tr' ? TR_SAME_AS_ENGLISH : undefined,
    allowOtherScript: language === 'tr' ? TR_OTHER_SCRIPT : undefined
  });
  const problems = report.missing.length + report.empty.length + report.placeholderMismatch.length + report.wrongScript.length + report.suspects.length + report.extra.length;
  console.log(`[i18n-coverage] ${language}: ${report.translated}/${report.total} keys translated (${report.percentTranslated}%), ${report.present} present (${report.percentPresent}%), ${report.allowedSame.length} same-as-English by design, ${problems} problem(s)`);
  for (const [label, list] of [['missing', report.missing], ['extra', report.extra], ['empty', report.empty], ['placeholder mismatch', report.placeholderMismatch], ['wrong script', report.wrongScript], ['copy of English text', report.suspects]]) {
    if (list.length) console.error(`  ${label}: ${list.slice(0, 12).join(', ')}${list.length > 12 ? ` … (+${list.length - 12})` : ''}`);
  }
  // Only Turkish is held to the strict measure here; de/ar are printed for comparison (their own gate is check:i18n).
  if (language === 'tr') failed ||= problems > 0;
}
process.exit(failed ? 1 : 0);

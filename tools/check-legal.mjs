// Production gate for the legal pages (npm run check:legal). Fails while anything a launch needs is missing:
//   - a mandatory operator field in src/app/features/legal/controller-identity.ts (legal name, form, representative,
//     street, postal code) is still null: the Impressum and the privacy notice would be incomplete;
//   - the publication/effective date of the privacy policy or the terms is still null (consent-versions.ts);
//   - a legal text has a placeholder, an unknown {{TOKEN}}, or invented company/register wording;
//   - the Impressum page still contains a "[TODO" marker.
// Deliberately NOT part of build:staging or build:ci: Staging and previews keep building while these are open.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DOCS,
  LANGUAGES,
  fabricatedEntityHints,
  loadLegal,
  missingOperatorFieldsFromSource,
  missingPublicationDates,
  placeholders,
  unknownTokens
} from './lib/legal-content.mjs';

const root = process.cwd();
const problems = [];

const identity = readFileSync(join(root, 'src/app/features/legal/controller-identity.ts'), 'utf8');
for (const field of missingOperatorFieldsFromSource(identity)) {
  problems.push(`operator identity: ${field} is not provided (controller-identity.ts)`);
}

const versions = readFileSync(join(root, 'src/app/core/models/consent-versions.ts'), 'utf8');
for (const item of missingPublicationDates(versions)) {
  problems.push(`publication date missing: ${item} (consent-versions.ts)`);
}

for (const lang of LANGUAGES) {
  for (const doc of DOCS) {
    const text = loadLegal(root, lang, doc);
    for (const p of placeholders(text)) problems.push(`${lang}/${doc}: placeholder at ${p}`);
    for (const t of unknownTokens(text)) problems.push(`${lang}/${doc}: unknown token ${t}`);
    for (const f of fabricatedEntityHints(text)) problems.push(`${lang}/${doc}: company/register wording at ${f}`);
  }
}

const impressum = readFileSync(join(root, 'src/app/features/marketing/pages/impressum.page.ts'), 'utf8');
if (/\[TODO/.test(impressum)) problems.push('impressum.page.ts: [TODO marker left');

if (problems.length > 0) {
  for (const p of problems) console.error(`[check:legal] ${p}`);
  console.error(`[check:legal] ${problems.length} open item(s). The legal pages are not ready for a production launch.`);
  process.exit(1);
}
console.log('[check:legal] operator identity complete, dates set, no placeholders or unknown tokens.');

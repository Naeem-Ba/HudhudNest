// Verifies the four language versions of each legal document stay structurally identical
// (same sections, same blocks/bullets per section, same links) so a translation can never
// silently drop a clause or a cross-reference. Run: node scripts/check-legal-parity.mjs
import { readFileSync } from 'node:fs';

const langs = ['ar', 'en', 'de', 'tr'];
const docs = ['privacy', 'terms'];
const shape = d => d.sections.map(s => s.blocks.map(b => (b.ul ? `ul${b.ul.length}` : 'p')).join(','));
const links = d => JSON.stringify(d).match(/\]\((\/[^)]*|mailto:[^)]*)\)/g) ?? [];
let failed = false;

for (const doc of docs) {
  const data = Object.fromEntries(
    langs.map(l => [l, JSON.parse(readFileSync(`public/i18n/legal/${l}/${doc}.json`, 'utf8'))])
  );
  const ref = JSON.stringify(shape(data.en));
  const refLinks = JSON.stringify(links(data.en));
  for (const l of langs) {
    const d = data[l];
    const problems = [];
    if (!d.title || !d.metaDescription) problems.push('missing title/metaDescription');
    if (JSON.stringify(shape(d)) !== ref) problems.push('section/block structure differs from en');
    if (JSON.stringify(links(d)) !== refLinks) problems.push('links differ from en');
    if (JSON.stringify(d).match(/\bTODO\b|LEGAL REVIEW/)) problems.push('contains placeholder text');
    // A translation not yet reviewed by a lawyer carries a visible reviewNotice; it is tracked, not a failure.
    const pending = d.reviewNotice ? ' (legal review pending: reviewNotice shown to readers)' : '';
    console.log(`${l}/${doc}: ${d.sections.length} sections ${problems.length ? 'FAIL ' + problems.join('; ') : 'OK'}${pending}`);
    failed ||= problems.length > 0;
  }
}
process.exit(failed ? 1 : 0);

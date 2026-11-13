// Content rules for the legal texts (privacy, terms) in every language. Structural parity (sections, bullets, links)
// is checked by scripts/check-legal-parity.mjs; this file checks what a reader would see.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DOCS,
  LANGUAGES,
  arabicOutsideBrand,
  fabricatedEntityHints,
  loadLegal,
  missingOperatorFieldsFromSource,
  missingPublicationDates,
  placeholders,
  strings,
  unknownTokens
} from './legal-content.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('every language has both documents, with the same number of sections', () => {
  for (const doc of DOCS) {
    const counts = LANGUAGES.map(lang => loadLegal(root, lang, doc).sections.length);
    assert.equal(new Set(counts).size, 1, `${doc}: ${counts.join('/')}`);
  }
  assert.equal(loadLegal(root, 'en', 'privacy').sections.length, 25);
  assert.equal(loadLegal(root, 'en', 'terms').sections.length, 29);
});

test('no placeholder, TODO or "not decided yet" wording in any legal text', () => {
  for (const lang of LANGUAGES) for (const doc of DOCS) assert.deepEqual(placeholders(loadLegal(root, lang, doc)), [], `${lang}/${doc}`);
});

test('every {{TOKEN}} is one the controller identity fills, and the identity fields reach the texts through tokens', () => {
  for (const lang of LANGUAGES) {
    for (const doc of DOCS) {
      const text = loadLegal(root, lang, doc);
      assert.deepEqual(unknownTokens(text), [], `${lang}/${doc}`);
      const all = strings(text).map(([, s]) => s).join('\n');
      for (const token of ['{{CONTROLLER_NAME}}', '{{CORRESPONDENCE_ADDRESS}}', '{{PRIVACY_EMAIL}}', '{{LEGAL_EMAIL}}']) {
        assert.ok(all.includes(token), `${lang}/${doc} lacks ${token}`);
      }
      assert.ok(!/@hudhudnest\.com/.test(all), `${lang}/${doc}: write e-mail addresses as tokens, not literally`);
    }
  }
});

test('no Arabic script in the German, English or Turkish texts except the brand', () => {
  for (const lang of ['en', 'de', 'tr']) for (const doc of DOCS) assert.deepEqual(arabicOutsideBrand(loadLegal(root, lang, doc)), [], `${lang}/${doc}`);
});

test('no invented company form, register or tax number in any legal text', () => {
  for (const lang of LANGUAGES) for (const doc of DOCS) assert.deepEqual(fabricatedEntityHints(loadLegal(root, lang, doc)), [], `${lang}/${doc}`);
  assert.deepEqual(fabricatedEntityHints({ p: 'HudhudNest GmbH, HRB 12345' }).length, 1);
});

test('the privacy policy names the newsletter, the double opt-in and the right to object in every language', () => {
  const needles = {
    ar: ['القائمة البريدية', 'التأكيد المزدوج', 'حق الاعتراض'],
    en: ['newsletter', 'Double opt-in', 'Right to object'],
    de: ['Newsletter', 'Double-Opt-in', 'Widerspruchsrecht'],
    tr: ['Bülten', 'Çift onay', 'İtiraz hakkı']
  };
  for (const lang of LANGUAGES) {
    const all = strings(loadLegal(root, lang, 'privacy')).map(([, s]) => s).join('\n');
    for (const needle of needles[lang]) assert.ok(all.includes(needle), `${lang}: "${needle}" missing`);
  }
});

test('the operator identity has no invented values: the unknown legal fields are null until the owner gives them', () => {
  const source = read('src/app/features/legal/controller-identity.ts');
  assert.match(source, /displayName: 'HudhudNest \(هدهد نيست\)'/);
  assert.match(source, /privacy: 'privacy@hudhudnest\.com'/);
  // While these are open the production gate (check:legal) must fail; this pins the reader below to the real file.
  assert.deepEqual(missingOperatorFieldsFromSource(source), ['operatorLegalName', 'legalForm', 'authorisedRepresentative', 'streetAddress', 'postalCode']);
  assert.deepEqual(missingOperatorFieldsFromSource("\n  operatorLegalName: 'X',\n  legalForm: 'Y',\n  authorisedRepresentative: 'Z',\n  streetAddress: 'S',\n  postalCode: '1'\n"), []);
});

test('publication dates are never guessed: null until published, and the gate reports them', () => {
  const source = read('src/app/core/models/consent-versions.ts');
  assert.equal(missingPublicationDates(source).length, 4);
  assert.deepEqual(
    missingPublicationDates("PRIVACY_POLICY_META: X = {\n publishedDate: '2026-12-01',\n effectiveDate: '2026-12-15',\n}\nTERMS_OF_SERVICE_META: X = {\n publishedDate: '2026-12-01',\n effectiveDate: '2026-12-15',\n}"),
    []
  );
});

test('/datenschutz and /imprint answer with a real 301 above the SPA catch-all', () => {
  const lines = read('public/_redirects').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const index = rule => lines.findIndex(l => l.trim().startsWith(rule));
  const catchAll = lines.findIndex(l => l.startsWith('/*'));
  assert.match(lines[index('/datenschutz ')], /\/privacy-policy\?lang=de\s+301!/);
  assert.match(lines[index('/imprint ')], /\/impressum\s+301!/);
  assert.ok(index('/datenschutz ') < catchAll && index('/imprint ') < catchAll);
});

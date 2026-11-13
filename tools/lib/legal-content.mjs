// Content rules for the legal texts and the operator identity, shared by tools/check-legal.mjs (the production gate)
// and tools/lib/legal-content.test.mjs (run with every test:tools). Pure functions over file contents.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LANGUAGES = ['ar', 'en', 'de', 'tr'];
export const DOCS = ['privacy', 'terms'];
/** The {{TOKENS}} that features/legal/controller-identity.ts can fill (legalTokens). */
export const KNOWN_TOKENS = new Set([
  'CONTROLLER_NAME',
  'CORRESPONDENCE_ADDRESS',
  'WEBSITE',
  'SUPPORT_EMAIL',
  'PRIVACY_EMAIL',
  'LEGAL_EMAIL',
  'SECURITY_EMAIL'
]);
/** Operator fields an Impressum and Art. 13(1)(a) GDPR need (MANDATORY_OPERATOR_FIELDS in controller-identity.ts). */
export const MANDATORY_OPERATOR_FIELDS = ['operatorLegalName', 'legalForm', 'authorisedRepresentative', 'streetAddress', 'postalCode'];

export function loadLegal(root, lang, doc) {
  return JSON.parse(readFileSync(join(root, 'public', 'i18n', 'legal', lang, `${doc}.json`), 'utf8'));
}

/** Every string of a document, with a readable path. */
export function strings(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

export function unknownTokens(doc) {
  const found = [];
  for (const [path, text] of strings(doc)) {
    for (const match of text.matchAll(/\{\{\s*([A-Za-z_]+)\s*\}\}/g)) {
      if (!KNOWN_TOKENS.has(match[1])) found.push(`${path}: ${match[0]}`);
    }
  }
  return found;
}

/** Placeholder markers that must never reach a reader. */
export function placeholders(doc) {
  return strings(doc)
    .filter(([, text]) => /\[TODO|\bTODO\b|TBD|lorem ipsum|XXX|لم نحدد بعد|noch nicht festgelegt|not yet determined/i.test(text))
    .map(([path]) => path);
}

/** Arabic script outside the Arabic file, except the brand written in Arabic (هدهد نيست). */
export function arabicOutsideBrand(doc) {
  return strings(doc)
    .filter(([, text]) => /[؀-ۿ]/.test(text.replaceAll('هدهد نيست', '')))
    .map(([path]) => path);
}

/**
 * Wording that would invent a legal entity or registration the owner never gave: a company form, a register or tax
 * number pattern. The operator's real identity comes only from controller-identity.ts via tokens.
 */
export function fabricatedEntityHints(doc) {
  const pattern = /\b(GmbH|UG \(haftungsbeschränkt\)|LLC|Ltd\.?|S\.A\.R\.L|A\.Ş\.|HRB\s?\d|HRA\s?\d|DE\d{9}|USt-IdNr\.?:\s*\S)/;
  return strings(doc)
    .filter(([, text]) => pattern.test(text))
    .map(([path]) => path);
}

/** Reads the TypeScript identity object loosely: which mandatory fields are still `null` or empty. */
export function missingOperatorFieldsFromSource(source) {
  return MANDATORY_OPERATOR_FIELDS.filter(field => {
    const match = source.match(new RegExp(`\\n\\s*${field}:\\s*([^,\\n]+)`));
    if (!match) return true;
    const value = match[1].trim();
    return value === 'null' || /^(['"])\s*\1$/.test(value);
  });
}

/** Which publication dates in consent-versions.ts are still null. */
export function missingPublicationDates(source) {
  const missing = [];
  for (const name of ['PRIVACY_POLICY_META', 'TERMS_OF_SERVICE_META']) {
    const block = source.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\}`));
    if (!block) {
      missing.push(`${name}: not found`);
      continue;
    }
    for (const field of ['publishedDate', 'effectiveDate']) {
      const value = block[1].match(new RegExp(`${field}:\\s*([^,\\n]+)`))?.[1]?.trim();
      if (!value || value === 'null' || !/^'\d{4}-\d{2}-\d{2}'$/.test(value)) missing.push(`${name}.${field}`);
    }
  }
  return missing;
}

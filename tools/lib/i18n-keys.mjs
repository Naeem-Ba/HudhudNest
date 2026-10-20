// Pure helpers for tools/check-i18n-keys.mjs (kept separate so they can be unit-tested).

/** Flattens a translation object to its leaf keys ("A.B.C"). */
export function flattenKeys(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === 'object' ? flattenKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  );
}

// 'SECTION.KEY' literals in quotes or backticks. A literal ending in '_' or '.' is the static
// half of a key built at runtime (e.g. `STATUS_${value}`) and cannot be checked statically.
const KEY_LITERAL = /['"`]([A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+)['"`]/g;

/** Translation-key literals used in one source file. */
export function findKeyLiterals(source) {
  return [...source.matchAll(KEY_LITERAL)].map((match) => match[1]).filter((key) => !key.endsWith('_'));
}

/** Keys that are neither a leaf nor a section (a section is passed whole to some components). */
export function missingKeys(usedKeys, availableKeys) {
  const available = new Set(availableKeys);
  const sections = new Set(
    availableKeys.flatMap((key) => key.split('.').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('.')))
  );
  return [...new Set(usedKeys)].filter((key) => !available.has(key) && !sections.has(key)).sort();
}

/** For each pair of languages, the keys the first has and the second lacks. */
export function parityGaps(keysByLanguage) {
  const gaps = [];
  for (const [language, keys] of Object.entries(keysByLanguage)) {
    for (const [other, otherKeys] of Object.entries(keysByLanguage)) {
      if (language === other) continue;
      const otherSet = new Set(otherKeys);
      const missing = keys.filter((key) => !otherSet.has(key));
      if (missing.length) gaps.push({ from: language, to: other, missing });
    }
  }
  return gaps;
}

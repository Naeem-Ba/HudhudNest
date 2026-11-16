// How complete a translation file is, measured honestly. Key presence alone proves little (a key can hold
// the English text, an empty string, a different {{placeholder}}, or text in another script), so the report
// separates four things for a language file measured against en.json:
//   present      the key exists and holds a non-empty string
//   translated   present, placeholders equal to English, not a copy of the English text (unless the value is a
//                brand, unit, number or separator that is the same in every language: UNTRANSLATED_ALLOWLIST)
//   problems     missing keys, empty values, placeholder mismatches, text in the wrong script
//   suspects     copies of the English text that are not on the allowlist
// Pure functions: tools/i18n-coverage.mjs does the I/O and tools/lib/tr-translation.test.mjs pins the rules.

/** Leaf entries ("A.B.C" -> value) of a translation object. */
export function flattenEntries(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === 'object' ? flattenEntries(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
  );
}

export function placeholders(text) {
  return (String(text).match(/\{\{[^}]*\}\}/g) ?? []).map((p) => p.replace(/\s+/g, '')).sort().join('|');
}

const ARABIC_SCRIPT = /[؀-ۿ]/;
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;

/**
 * @param {Record<string, unknown>} reference en.json
 * @param {Record<string, unknown>} candidate the language measured
 * @param {{ script: 'latin' | 'arabic', allowSameAsEnglish?: ReadonlySet<string>, allowOtherScript?: ReadonlySet<string> }} options
 */
export function measureCoverage(reference, candidate, options) {
  const ref = new Map(flattenEntries(reference));
  const got = new Map(flattenEntries(candidate));
  const allowSame = options.allowSameAsEnglish ?? new Set();
  const allowScript = options.allowOtherScript ?? new Set();

  const report = {
    total: ref.size,
    present: 0,
    translated: 0,
    missing: [],
    extra: [],
    empty: [],
    placeholderMismatch: [],
    wrongScript: [],
    suspects: [],
    allowedSame: []
  };

  for (const [key, english] of ref) {
    const value = got.get(key);
    if (value === undefined) {
      report.missing.push(key);
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) {
      report.empty.push(key);
      continue;
    }
    report.present += 1;

    let ok = true;
    if (placeholders(english) !== placeholders(value)) {
      report.placeholderMismatch.push(key);
      ok = false;
    }
    if (options.script === 'latin' && ARABIC_SCRIPT.test(value) && !allowScript.has(key)) {
      report.wrongScript.push(key);
      ok = false;
    }
    if (options.script === 'arabic' && !ARABIC_SCRIPT.test(value) && LATIN_LETTER.test(value) && !allowScript.has(key)) {
      report.wrongScript.push(key);
      ok = false;
    }
    if (value === english && /[A-Za-z]{3}/.test(english)) {
      if (allowSame.has(key)) {
        report.allowedSame.push(key);
      } else {
        report.suspects.push(key);
        ok = false;
      }
    }
    if (ok) report.translated += 1;
  }

  for (const key of got.keys()) if (!ref.has(key)) report.extra.push(key);
  report.percentTranslated = report.total ? Math.round((report.translated / report.total) * 10000) / 100 : 0;
  report.percentPresent = report.total ? Math.round((report.present / report.total) * 10000) / 100 : 0;
  return report;
}

/** Values that legitimately equal the English text in Turkish: brand names, units, separators, numbers, loanwords. */
export const TR_SAME_AS_ENGLISH = new Set([
  'COMMON.area_unit',
  'AUTH.CHANNELS.NAMES.Telegram',
  'AUTH.CHANNELS.NAMES.WhatsApp',
  'PROPERTY_LIST.KM',
  'OFFICES.NEAR.RADIUS_KM',
  'OFFICE_STATS.CHANNEL.WHATSAPP',
  'OFFICE_STATS.CHANNEL.FACEBOOK',
  'OFFICE_STATS.CHANNEL.INSTAGRAM',
  'OFFICE_STATS.CHANNEL.TELEGRAM',
  'OFFICE_STATS.CHANNEL.X',
  'OFFICE_STATS.CHANNEL.LINKEDIN',
  'OFFICE_STATS.CHANNEL.YOUTUBE',
  'OFFICE_STATS.CHANNEL.TIKTOK',
  'OFFICE_PROFILE.NETWORK.WHATSAPP',
  'OFFICE_PROFILE.NETWORK.FACEBOOK',
  'OFFICE_PROFILE.NETWORK.INSTAGRAM',
  'OFFICE_PROFILE.NETWORK.TELEGRAM',
  'OFFICE_PROFILE.NETWORK.X',
  'OFFICE_PROFILE.NETWORK.LINKEDIN',
  'OFFICE_PROFILE.NETWORK.YOUTUBE',
  'OFFICE_PROFILE.NETWORK.TIKTOK',
  'SHARE.FACEBOOK',
  'SHARE.WHATSAPP',
  'SHARE.TELEGRAM',
  'SHARE.INSTAGRAM',
  'ADMIN_USERS.PLAN',
  'PAYMENTS.SUBSCRIPTION.PLAN',
  'ENUM.STADT.HAMA',
  'ENUM.STADT.TARTUS',
  'LANDING.FORM.CITIES.HAMA',
  'LANDING.FORM.CITIES.TARTUS',
  'PRICING.PREMIUM.NAME',
  'ADMIN_REPORTS.PRIORITY.Normal',
  'property_detail.Unit_of_measurement',
  'CHECKOUT.USD',
  // "3+": a number and a sign, the same in every language.
  'SHORTSTAY.LIST.BEDROOMS_AT_LEAST'
]);

/** Turkish values that are deliberately in another script. None at the moment (the landing language chip row was removed). */
export const TR_OTHER_SCRIPT = new Set([]);

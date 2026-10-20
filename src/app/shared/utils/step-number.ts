import { LangCode } from '../../core/services/language.service';

/** Section step number in the digits of the UI language ("١" in Arabic, "1" in English/German). */
export function formatStepNumber(n: number, lang: LangCode): string {
  // Explicit numbering system: plain 'ar' resolves to Western digits in some ICU/CLDR versions.
  const locale = lang === 'ar' ? 'ar-u-nu-arab' : lang;
  return new Intl.NumberFormat(locale).format(n);
}

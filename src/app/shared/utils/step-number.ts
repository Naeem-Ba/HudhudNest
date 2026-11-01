import { LangCode } from '../../core/services/language.service';

/** Section step number, in Latin digits in every language (same digits as prices and dates). */
export function formatStepNumber(n: number, lang: LangCode): string {
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : lang;
  return new Intl.NumberFormat(locale).format(n);
}

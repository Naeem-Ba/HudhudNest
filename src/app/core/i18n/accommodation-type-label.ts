import { TranslateService } from '@ngx-translate/core';

/**
 * The label to show for a short-stay accommodation type. The API sends a stable code ("chalet"); it is
 * translated through SHORTSTAY.TYPE.<code> so the name follows the app language in all four languages.
 * A type an admin added (no key) shows the best stored name, never the raw code.
 */
export function accommodationTypeLabel(
  translate: Pick<TranslateService, 'instant' | 'currentLang'>,
  type: { code?: string | null; nameAr?: string | null; nameEn?: string | null }
): string {
  const code = (type.code ?? '').trim();
  if (code) {
    const path = `SHORTSTAY.TYPE.${code}`;
    const translated = translate.instant(path);
    if (typeof translated === 'string' && translated && translated !== path) return translated;
  }
  const fallback = translate.currentLang === 'ar' ? type.nameAr || type.nameEn : type.nameEn || type.nameAr;
  return fallback || code;
}

import { DatePipe, registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import localeDe from '@angular/common/locales/de';
import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from '../../core/services/language.service';

// The app never registered locale data, so every `| date` printed en-US ("Nov 1, 2026, 4:36 PM") in
// the Arabic and German UI (QA Phase 16, P16-D05). English (en-US) is built into Angular.
registerLocaleData(localeAr, 'ar');
registerLocaleData(localeDe, 'de');

const LOCALE_BY_LANG: Record<string, string> = { ar: 'ar', de: 'de', en: 'en-US' };

/**
 * `date` in the language on screen, re-evaluated when the language changes (the page is not reloaded
 * on a language switch, so a pure pipe built once with a fixed LOCALE_ID would keep the old one).
 * Same arguments as Angular's DatePipe.
 */
@Pipe({ name: 'localDate', standalone: true, pure: false })
export class LocalizedDatePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);
  private readonly pipes = new Map<string, DatePipe>();

  transform(value: Date | string | number | null | undefined, format?: string, timezone?: string): string | null {
    const locale = LOCALE_BY_LANG[this.languageService.getCurrent()] ?? 'en-US';
    let pipe = this.pipes.get(locale);
    if (!pipe) {
      pipe = new DatePipe(locale);
      this.pipes.set(locale, pipe);
    }
    return pipe.transform(value, format, timezone);
  }
}

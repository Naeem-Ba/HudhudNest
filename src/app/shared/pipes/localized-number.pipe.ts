import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from '../../core/services/language.service';
import { numberLocaleFor } from '../../core/i18n/supported-preferences';

const DIGITS_INFO = /^(\d+)?\.?(\d+)?-?(\d+)?$/;

/**
 * `number` in the language on screen ("1.234,5" in German, "1,234.5" in English, Latin digits in
 * Arabic), re-evaluated when the language changes. Accepts the same `digitsInfo` string as Angular's
 * DecimalPipe ("minInt.minFrac-maxFrac").
 */
@Pipe({ name: 'localNumber', standalone: true, pure: false })
export class LocalizedNumberPipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(value: number | string | null | undefined, digitsInfo?: string): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const number = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(number)) {
      return null;
    }

    const options: Intl.NumberFormatOptions = {};
    if (digitsInfo) {
      const match = DIGITS_INFO.exec(digitsInfo);
      if (match) {
        if (match[1]) options.minimumIntegerDigits = Number(match[1]);
        if (match[2]) options.minimumFractionDigits = Number(match[2]);
        if (match[3]) options.maximumFractionDigits = Number(match[3]);
      }
    }
    if (options.minimumFractionDigits !== undefined && options.maximumFractionDigits === undefined) {
      options.maximumFractionDigits = Math.max(options.minimumFractionDigits, 3);
    }

    return new Intl.NumberFormat(numberLocaleFor(this.languageService.getCurrent()), options).format(number);
  }
}

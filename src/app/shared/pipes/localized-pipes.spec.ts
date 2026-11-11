import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { LanguageService } from '../../core/services/language.service';
import { LocalizedDatePipe } from './localized-date.pipe';
import { LocalizedNumberPipe } from './localized-number.pipe';

describe('localized pipes (QA Phase 16, D05)', () => {
  let current = 'en';

  beforeEach(() => {
    current = 'en';
    TestBed.configureTestingModule({
      providers: [
        { provide: LanguageService, useValue: { getCurrent: () => current } },
        { provide: TranslateService, useValue: {} }
      ]
    });
  });

  describe('localDate', () => {
    const date = new Date(2026, 10, 1, 16, 36);

    it('prints the date in the language on screen and follows a language switch', () => {
      const pipe = TestBed.runInInjectionContext(() => new LocalizedDatePipe());

      expect(pipe.transform(date, 'longDate')).toBe('November 1, 2026');

      current = 'de';
      expect(pipe.transform(date, 'longDate')).toBe('1. November 2026');

      current = 'tr';
      expect(pipe.transform(date, 'longDate')).toBe('1 Kasım 2026');

      current = 'ar';
      const arabic = pipe.transform(date, 'longDate') ?? '';
      expect(arabic).toContain('نوفمبر');
      expect(arabic).not.toMatch(/November/);
    });

    it('returns null for an empty value, like the Angular pipe', () => {
      const pipe = TestBed.runInInjectionContext(() => new LocalizedDatePipe());

      expect(pipe.transform(null)).toBeNull();
      expect(pipe.transform(undefined)).toBeNull();
    });
  });

  describe('localNumber', () => {
    it('groups and separates by language and keeps Latin digits in Arabic', () => {
      const pipe = TestBed.runInInjectionContext(() => new LocalizedNumberPipe());

      expect(pipe.transform(1234567.5, '1.0-1')).toBe('1,234,567.5');

      current = 'de';
      expect(pipe.transform(1234567.5, '1.0-1')).toBe('1.234.567,5');

      current = 'tr';
      expect(pipe.transform(1234567.5, '1.0-1')).toBe('1.234.567,5');

      current = 'ar';
      expect(pipe.transform(1234567)).toMatch(/^[0-9,٬.]+$/);
      expect(pipe.transform(1234567)).not.toMatch(/[٠-٩]/);
    });

    it('honours min/max fraction digits and returns null for nothing or NaN', () => {
      const pipe = TestBed.runInInjectionContext(() => new LocalizedNumberPipe());

      expect(pipe.transform(5, '1.2-2')).toBe('5.00');
      expect(pipe.transform('7.256', '1.0-2')).toBe('7.26');
      expect(pipe.transform(null)).toBeNull();
      expect(pipe.transform('abc')).toBeNull();
    });
  });
});

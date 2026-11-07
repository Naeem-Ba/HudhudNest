import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';

import { getFriendlyApiErrorMessage, isInOtherScript } from './api-error.interceptor';

// instant() echoes "KEY|param=value" so the assertions can see which key/params were chosen.
const translate = {
  instant: (key: string, params?: Record<string, string>) =>
    params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}` : key
} as unknown as TranslateService;

const fail = (status: number, body: unknown) => new HttpErrorResponse({ status, error: body });

// The script check reads <html lang>; other specs switch it, so every test here starts from "unknown".
beforeEach(() => { document.documentElement.lang = ''; });

describe('getFriendlyApiErrorMessage — shows the real reason, not the generic title', () => {
  it('ASP.NET 400 problem+json "field is required" names the field instead of the generic title', () => {
    const message = getFriendlyApiErrorMessage(fail(400, {
      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: { CurrencyCode: ['The CurrencyCode field is required.'] }
    }), translate);

    expect(message).toBe('API_ERRORS.FIELD_REQUIRED|field=Currency code');
  });

  it('ASP.NET JSON-conversion errors are rewritten, never shown as the raw technical sentence', () => {
    const message = getFriendlyApiErrorMessage(fail(400, {
      title: 'One or more validation errors occurred.',
      errors: {
        '$.capacity': ['The JSON value could not be converted to System.Int32. Path: $.capacity | LineNumber: 0 | BytePositionInLine: 120.']
      }
    }), translate);

    expect(message).toBe('API_ERRORS.FIELD_INVALID|field=Capacity');
    expect(message).not.toContain('System.Int32');
  });

  it('a 422 app validation error shows its field messages instead of "Validation Error"', () => {
    const message = getFriendlyApiErrorMessage(fail(422, {
      title: 'Validation Error',
      errors: { Title: ['عنوان الإعلان مطلوب.'], DefaultBasePricePerNight: ['السعر يجب أن يكون أكبر من صفر.'] }
    }), translate);

    expect(message).toBe('عنوان الإعلان مطلوب. السعر يجب أن يكون أكبر من صفر.');
  });

  it('a domain "message" still wins over everything else', () => {
    const message = getFriendlyApiErrorMessage(fail(409, {
      title: 'Conflict', message: 'خطتكم الحالية تسمح بـ 3 إعلانات.', errors: { X: ['ignored'] }
    }), translate);

    expect(message).toBe('خطتكم الحالية تسمح بـ 3 إعلانات.');
  });

  it('de-duplicates and caps the field messages at three', () => {
    const message = getFriendlyApiErrorMessage(fail(422, {
      title: 'Validation Error',
      errors: { A: ['one', 'one'], B: ['two'], C: ['three'], D: ['four'] }
    }), translate);

    expect(message).toBe('one two three');
  });

  it('falls back to detail/title, then to the status-based message', () => {
    expect(getFriendlyApiErrorMessage(fail(400, { title: 'Bad Request' }), translate)).toBe('Bad Request');
    expect(getFriendlyApiErrorMessage(fail(400, { detail: 'Malformed body', title: 'Bad Request' }), translate)).toBe('Malformed body');
    expect(getFriendlyApiErrorMessage(fail(400, null), translate)).toBe('API_ERRORS.BAD_REQUEST');
    expect(getFriendlyApiErrorMessage(fail(500, null), translate)).toBe('API_ERRORS.SERVER');
  });
});

describe('getFriendlyApiErrorMessage — a 5xx is never shown as the server wrote it', () => {
  // The API answers every unhandled exception with this English sentence (ExceptionHandlingMiddleware).
  const GENERIC_500 = { title: 'Internal Server Error', status: 500, message: 'An unexpected error occurred. Please try again later.' };

  it('replaces the generic English 500 body with the translated server-error text', () => {
    const message = getFriendlyApiErrorMessage(fail(500, GENERIC_500), translate);

    expect(message).toBe('API_ERRORS.SERVER');
    expect(message).not.toContain('unexpected');
  });

  it('does the same for 502/503 and for a title-only or string body', () => {
    expect(getFriendlyApiErrorMessage(fail(503, { title: 'Rate limiter backend is unavailable.', status: 503 }), translate)).toBe('API_ERRORS.SERVER');
    expect(getFriendlyApiErrorMessage(fail(502, 'Bad gateway'), translate)).toBe('API_ERRORS.SERVER');
  });

  it('still shows the message of a 4xx, which is written for the person', () => {
    expect(getFriendlyApiErrorMessage(fail(409, { message: 'Email already registered.' }), translate)).toBe('Email already registered.');
  });
});

describe('getFriendlyApiErrorMessage — a 429 is never shown as the limiter wrote it', () => {
  // RedisRateLimitingMiddleware: problem+json whose title/detail are English.
  const REDIS_429 = {
    type: 'https://httpstatuses.com/429',
    title: 'Too many requests.',
    status: 429,
    detail: 'The request rate limit has been exceeded.',
    policy: 'data-export',
    retryAfterSeconds: 80000
  };

  it('replaces the limiter\'s English title/detail with the translated limit text', () => {
    const message = getFriendlyApiErrorMessage(fail(429, REDIS_429), translate);

    expect(message).toBe('API_ERRORS.RATE_LIMITED');
    expect(message).not.toContain('rate limit');
  });

  it('an empty 429 (the in-memory limiter) gets the same translated text', () => {
    expect(getFriendlyApiErrorMessage(fail(429, null), translate)).toBe('API_ERRORS.RATE_LIMITED');
  });

  it('a 429 that carries a domain message (written for the person) keeps it', () => {
    const message = getFriendlyApiErrorMessage(
      fail(429, { code: 'EMAIL_CONFIRMATION_LIMIT_REACHED', message: 'وصلت إلى الحد اليومي.' }),
      translate
    );

    expect(message).toBe('وصلت إلى الحد اليومي.');
  });
});

describe('getFriendlyApiErrorMessage — agency eligibility codes are translated, not echoed in Arabic', () => {
  [
    'AGENCY_ACCOUNT_NOT_VERIFIED',
    'AGENCY_PAID_PLAN_REQUIRED',
    'AGENCY_PLAN_EXPIRED',
    'AGENCY_FREE_PLAN_NOT_ALLOWED',
    'PAID_PLAN_ACTIVE'
  ].forEach(code => {
    it(`${code} maps to its own API_ERRORS key whatever Arabic message the server sent`, () => {
      const message = getFriendlyApiErrorMessage(
        fail(403, { title: 'Forbidden', status: 403, message: 'رسالة عربية من الخادم', code }),
        translate
      );

      expect(message).toBe(`API_ERRORS.${code}`);
    });
  });

  it('an unknown 403 code keeps showing the server message', () => {
    const message = getFriendlyApiErrorMessage(
      fail(403, { message: 'Only the agency owner can invite members.', code: 'SOMETHING_ELSE' }),
      translate
    );

    expect(message).toBe('Only the agency owner can invite members.');
  });
});


describe('getFriendlyApiErrorMessage — search validation sentences are translated, not echoed (P7-D06)', () => {
  const cases: [string, string][] = [
    ['MinPrice must be less than or equal to MaxPrice.', 'API_ERRORS.FILTER_PRICE_RANGE'],
    ['MinRooms must be less than or equal to MaxRooms.', 'API_ERRORS.FILTER_ROOMS_RANGE'],
    ['MinArea must be less than or equal to MaxArea.', 'API_ERRORS.FILTER_AREA_RANGE'],
    ['Page is beyond the first 10000 results; narrow the search instead.', 'API_ERRORS.FILTER_PAGE_TOO_DEEP'],
    ['SearchTerm contains characters that are not allowed.', 'API_ERRORS.FILTER_TEXT_NOT_ALLOWED'],
    ['City contains characters that are not allowed.', 'API_ERRORS.FILTER_TEXT_NOT_ALLOWED'],
    ['SortBy=Price requires ListingType ForSale or ForRent.', 'API_ERRORS.FILTER_SORT_PRICE_NEEDS_TYPE'],
    ['Latitude is required.', 'API_ERRORS.GEO_COORDS_REQUIRED'],
    ['Longitude must be between -180 and 180.', 'API_ERRORS.GEO_COORDS_INVALID']
  ];

  cases.forEach(([english, key]) => {
    it(`"${english}" -> ${key}`, () => {
      const message = getFriendlyApiErrorMessage(fail(422, { title: 'Validation Error', errors: { Filter: [english] } }), translate);

      expect(message).toBe(key);
    });
  });

  it('a validation sentence it does not know passes through unchanged', () => {
    const message = getFriendlyApiErrorMessage(fail(422, { title: 'Validation Error', errors: { Title: ['عنوان الإعلان مطلوب.'] } }), translate);

    expect(message).toBe('عنوان الإعلان مطلوب.');
  });
});

describe('getFriendlyApiErrorMessage — a message in another script is replaced (QA Phase 16, D04)', () => {
  let originalLang: string;

  beforeEach(() => {
    originalLang = document.documentElement.lang;
  });

  afterEach(() => {
    document.documentElement.lang = originalLang;
  });

  it('isInOtherScript: Arabic text on an English or German page, Latin-only text on an Arabic page', () => {
    expect(isInOtherScript('خطتكم الحالية تسمح بـ 3 إعلانات.', 'en')).toBeTrue();
    expect(isInOtherScript('خطتكم الحالية تسمح بـ 3 إعلانات.', 'de')).toBeTrue();
    expect(isInOtherScript('You have reached the limit.', 'ar')).toBeTrue();
    expect(isInOtherScript('You have reached the limit.', 'en')).toBeFalse();
    expect(isInOtherScript('خطتكم الحالية تسمح بـ 3 إعلانات.', 'ar')).toBeFalse();
    expect(isInOtherScript('Ihr Limit ist erreicht.', 'de')).toBeFalse();
    expect(isInOtherScript('OK', 'ar')).toBeFalse();
    // English on a German page is recognised by its words; German and short Latin text are left alone.
    expect(isInOtherScript('You can only delete your own reviews.', 'de')).toBeTrue();
    expect(isInOtherScript('This listing is not available.', 'de')).toBeTrue();
    expect(isInOtherScript('Sie können nur Ihre eigenen Bewertungen löschen.', 'de')).toBeFalse();
    expect(isInOtherScript('Reference ABC-123', 'de')).toBeFalse();
    expect(isInOtherScript('anything', null)).toBeFalse();
  });

  it('an Arabic-only server message on a German page becomes the translated text of the status', () => {
    document.documentElement.lang = 'de';

    const message = getFriendlyApiErrorMessage(fail(409, { message: 'خطتكم الحالية تسمح بـ 3 إعلانات.' }), translate);

    expect(message).toBe('API_ERRORS.CONFLICT');
  });

  it('an English server message on an Arabic page becomes the translated text of the status', () => {
    document.documentElement.lang = 'ar';

    const message = getFriendlyApiErrorMessage(fail(403, { message: 'You can only delete your own reviews.' }), translate);

    expect(message).toBe('API_ERRORS.FORBIDDEN');
  });

  it('a message in the page script is shown as is', () => {
    document.documentElement.lang = 'ar';

    expect(getFriendlyApiErrorMessage(fail(409, { message: 'خطتكم الحالية تسمح بـ 3 إعلانات.' }), translate))
      .toBe('خطتكم الحالية تسمح بـ 3 إعلانات.');
  });

  it('the new stable codes win over the message', () => {
    expect(getFriendlyApiErrorMessage(fail(409, { message: 'x', code: 'CONCURRENCY_CONFLICT' }), translate))
      .toBe('API_ERRORS.CONCURRENCY_CONFLICT');
    expect(getFriendlyApiErrorMessage(fail(403, { message: 'x', code: 'CSRF_VALIDATION_FAILED' }), translate))
      .toBe('API_ERRORS.CSRF_VALIDATION_FAILED');
    expect(getFriendlyApiErrorMessage(fail(409, { message: 'x', code: 'LISTING_QUOTA_REACHED' }), translate))
      .toBe('API_ERRORS.LISTING_QUOTA_REACHED');
  });
});

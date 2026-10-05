import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';

import { getFriendlyApiErrorMessage } from './api-error.interceptor';

// instant() echoes "KEY|param=value" so the assertions can see which key/params were chosen.
const translate = {
  instant: (key: string, params?: Record<string, string>) =>
    params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}` : key
} as unknown as TranslateService;

const fail = (status: number, body: unknown) => new HttpErrorResponse({ status, error: body });

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

describe('getFriendlyApiErrorMessage — agency eligibility codes are translated, not echoed in Arabic', () => {
  [
    'AGENCY_ACCOUNT_NOT_VERIFIED',
    'AGENCY_PAID_PLAN_REQUIRED',
    'AGENCY_FREE_PLAN_NOT_ALLOWED'
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

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

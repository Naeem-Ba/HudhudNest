import { HttpErrorResponse } from '@angular/common/http';

import { isServerFailure } from './server-failure';

describe('isServerFailure', () => {
  it('is true for every 5xx, including the API generic 500 body', () => {
    expect(isServerFailure({ status: 500, error: { message: 'An unexpected error occurred. Please try again later.' } })).toBeTrue();
    expect(isServerFailure({ status: 503 })).toBeTrue();
    expect(isServerFailure(new HttpErrorResponse({ status: 502 }))).toBeTrue();
  });

  it('is false for what the person can fix or the network dropping', () => {
    for (const status of [0, 400, 401, 403, 404, 409, 422, 429]) {
      expect(isServerFailure({ status })).withContext(String(status)).toBeFalse();
    }
  });

  it('is false for things that are not HTTP errors', () => {
    expect(isServerFailure(undefined)).toBeFalse();
    expect(isServerFailure(null)).toBeFalse();
    expect(isServerFailure('500')).toBeFalse();
    expect(isServerFailure({ status: '500' })).toBeFalse();
    expect(isServerFailure(new Error('boom'))).toBeFalse();
  });
});

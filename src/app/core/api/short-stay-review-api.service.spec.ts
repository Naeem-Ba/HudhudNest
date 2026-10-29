import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { ShortStayReviewApiService } from './short-stay-review-api.service';
import { apiErrorText } from './api-error-text';
import { HttpErrorResponse } from '@angular/common/http';

describe('ShortStayReviewApiService', () => {
  let service: ShortStayReviewApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ShortStayReviewApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the booking, the rating and a trimmed comment', () => {
    service.create({ bookingId: 'b1', rating: 4, comment: '  great stay ' }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/short-stay/reviews'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ bookingId: 'b1', rating: 4, comment: 'great stay' });
    req.flush({});
  });

  it('sends a null comment when none was written', () => {
    service.create({ bookingId: 'b1', rating: 5, comment: '   ' }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/short-stay/reviews'));
    expect(req.request.body.comment).toBeNull();
    req.flush({});
  });
});

describe('apiErrorText', () => {
  it('returns the Arabic sentence of a 400/409/422 body', () => {
    const err = new HttpErrorResponse({ status: 400, error: { message: ' لا يمكن التقييم بعد ' } });
    expect(apiErrorText(err)).toBe('لا يمكن التقييم بعد');
  });

  it('accepts a plain string body and the Message casing', () => {
    expect(apiErrorText(new HttpErrorResponse({ status: 409, error: 'متقاطع' }))).toBe('متقاطع');
    expect(apiErrorText(new HttpErrorResponse({ status: 409, error: { Message: 'x' } }))).toBe('x');
  });

  it('never shows a 5xx body, and returns null when there is no message', () => {
    expect(apiErrorText(new HttpErrorResponse({ status: 500, error: { message: 'An unexpected error' } }))).toBeNull();
    expect(apiErrorText(new HttpErrorResponse({ status: 400, error: {} }))).toBeNull();
    expect(apiErrorText(null)).toBeNull();
  });
});

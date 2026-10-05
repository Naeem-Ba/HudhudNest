import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { PlansApiService } from './plans-api.service';

describe('PlansApiService.selectPlan', () => {
  let service: PlansApiService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiBaseUrl}/users/me/plan`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PlansApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('الخطة المجانية (204 بلا جسم) ⇐ activated', () => {
    let result: unknown;
    service.selectPlan('free').subscribe(r => (result = r));

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tier: 'free' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(result).toEqual({ status: 'activated', tier: 'free', requestId: null });
  });

  it('الخطة المدفوعة (202 + status=pending) ⇐ pending مع رقم الطلب، لا activated', () => {
    let result: unknown;
    service.selectPlan('premium').subscribe(r => (result = r));

    httpMock
      .expectOne(url)
      .flush({ requestId: 'r-1', tier: 'premium', status: 'pending' }, { status: 202, statusText: 'Accepted' });

    expect(result).toEqual({ status: 'pending', tier: 'premium', requestId: 'r-1' });
  });
});

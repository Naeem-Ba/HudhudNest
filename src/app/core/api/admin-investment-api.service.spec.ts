import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AdminInvestmentApiService } from './admin-investment-api.service';

describe('AdminInvestmentApiService (QA phase 10 additions)', () => {
  let service: AdminInvestmentApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminInvestmentApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('resumes a suspended project with a POST and no body', () => {
    service.resume('p1').subscribe();
    const req = http.expectOne(r => r.url.endsWith('/admin/investments/projects/p1/resume'));
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('sends the raised amount to the progress endpoint', () => {
    service.updateProgress('p1', 2500).subscribe();
    const req = http.expectOne(r => r.url.endsWith('/admin/investments/projects/p1/progress'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ raisedAmount: 2500 });
    req.flush(null);
  });

  it('reads the interested people of a project', () => {
    service.getInterests('p1').subscribe(list => expect(list.length).toBe(1));
    const req = http.expectOne(r => r.url.endsWith('/admin/investments/projects/p1/interests'));
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'i1', userId: 'u1', userName: 'Sami', email: 'a@b.c', phoneNumber: null, status: 'Active', createdAt: '', updatedAt: '' }]);
  });
});

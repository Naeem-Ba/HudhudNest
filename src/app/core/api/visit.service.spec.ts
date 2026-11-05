// Launch audit A2-001: the API's VisitDto names the requester `requesterId`; the app read
// `visitorId`, so a visitor never saw "Cancel" or the reschedule answer buttons.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { VisitDto } from '../models/visit.model';
import { VisitService } from './visit.service';

describe('VisitService — API contract', () => {
  let service: VisitService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(VisitService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps the API field requesterId to visitorId', () => {
    let visits: VisitDto[] = [];
    service.getMyVisits().subscribe(v => (visits = v));

    const req = httpMock.expectOne(r => r.url === `${environment.apiBaseUrl}/visits/mine`);
    // Exactly the keys GET /api/Visits/mine returned in the audit (no visitorId).
    req.flush([{
      id: 'v-1', propertyId: 'p-1', propertyTitle: 'شقة', requesterId: 'u-visitor', requesterName: 'Qa',
      ownerId: 'u-owner', visitorName: 'Qa', visitorPhone: '+963944000000', visitorNote: null,
      proposedAt: '2026-11-03T10:00:00Z', status: 'RescheduleProposed', createdAt: '2026-10-30T10:00:00Z'
    }]);

    expect(visits.length).toBe(1);
    expect(visits[0].visitorId).toBe('u-visitor');
    expect(visits[0].ownerId).toBe('u-owner');
  });

  it('still reads visitorId when an older API sends it', () => {
    let visits: VisitDto[] = [];
    service.getMyVisits().subscribe(v => (visits = v));

    httpMock.expectOne(r => r.url === `${environment.apiBaseUrl}/visits/mine`)
      .flush([{ id: 'v-2', propertyId: 'p-1', visitorId: 'u-old', visitorName: 'Qa', visitorPhone: 'x', proposedAt: 'x', status: 'Pending' }]);

    expect(visits[0].visitorId).toBe('u-old');
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { MyListingReportsPage } from './my-listing-reports.page';
import { ListingReportsService } from '../../core/api/listing-reports.service';
import { MyListingReportDto } from '../../core/models/listing-report.model';
import { ToastService } from '../../shared/services/toast.service';

function report(id: string, status: MyListingReportDto['status'], extra: Partial<MyListingReportDto> = {}): MyListingReportDto {
  return {
    id, referenceNumber: 'RPT-' + id, propertyId: 'p-' + id, listingTitle: 'Title ' + id, reason: 'Fraud', details: null,
    status, outcome: null, infoRequest: status === 'NeedsYourInfo' ? 'Please send a photo' : null,
    createdAt: '2026-10-30T10:00:00Z', updatedAt: '2026-10-30T10:00:00Z', closedAt: null, timeline: [], ...extra
  } as MyListingReportDto;
}

describe('MyListingReportsPage', () => {
  let api: jasmine.SpyObj<ListingReportsService>;
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error']);

  function create(id: string | null) {
    TestBed.configureTestingModule({
      imports: [MyListingReportsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ListingReportsService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } }
      ]
    });
    const fixture = TestBed.createComponent(MyListingReportsPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('ListingReportsService', ['mine', 'get', 'respond']);
    api.mine.and.returnValue(of({ items: [report('a', 'InReview'), report('b', 'NeedsYourInfo')], total: 2, page: 1, pageSize: 10 } as never));
    toast.success.calls.reset();
    toast.error.calls.reset();
  });

  it('puts the reports that wait for an answer first and says how many there are', () => {
    const c = create(null).componentInstance;
    expect(c.reports().map(r => r.id)).toEqual(['b', 'a']);
    expect(c.waitingCount()).toBe(1);
  });

  it('a notification opens its own report first, even when it is not on the first page', () => {
    api.get.and.returnValue(of(report('z', 'NeedsYourInfo')));
    const c = create('z').componentInstance;
    expect(api.get).toHaveBeenCalledWith('z');
    expect(c.reports()[0].id).toBe('z');
    expect(c.reports().length).toBe(3);
  });

  it('an unknown or foreign report id is ignored and the list still loads', () => {
    api.get.and.returnValue(throwError(() => ({ status: 404 })));
    const c = create('nope').componentInstance;
    expect(c.failed()).toBeFalse();
    expect(c.reports().length).toBe(2);
  });

  it('sends the answer and shows the updated report', () => {
    const updated = report('b', 'InReview');
    api.respond.and.returnValue(of(updated));
    const c = create(null).componentInstance;
    c.setAnswer('b', '  here is the photo ');
    c.send(c.reports().find(r => r.id === 'b')!);
    expect(api.respond).toHaveBeenCalledWith('b', 'here is the photo');
    expect(c.reports().find(r => r.id === 'b')!.status).toBe('InReview');
    expect(c.waitingCount()).toBe(0);
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not send an empty answer', () => {
    const c = create(null).componentInstance;
    c.setAnswer('b', '   ');
    c.send(c.reports()[0]);
    expect(api.respond).not.toHaveBeenCalled();
  });
});

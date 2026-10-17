import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AdminServicesPage } from './admin-services.page';
import { AdminServiceRequestsService } from '../../core/api/admin-service-requests.service';
import { ServiceStatsDto, ServiceStatsRowDto } from '../../core/models/admin-service-requests.model';

function row(overrides: Partial<ServiceStatsRowDto>): ServiceStatsRowDto {
  return {
    key: 'k', requested: 0, open: 0, completed: 0, notCompleted: 0, rejected: 0, cancelled: 0, disputed: 0,
    ratingCount: 0, closed: 0, completionRate: null, ...overrides
  };
}

const stats: ServiceStatsDto = {
  totals: row({ key: 'all', requested: 7, open: 1, completed: 3, notCompleted: 2, rejected: 1, closed: 6, completionRate: 0.5, disputed: 1, averageRating: 4.5, ratingCount: 2 }),
  byCategory: [row({ key: 'Cleaning', requested: 7, completed: 3 })],
  byOffering: [
    row({ key: 'o-unused', id: 'o-unused', label: 'Unused', subLabel: 'Legal', isActive: true, requested: 0 }),
    row({ key: 'o-hot', id: 'o-hot', label: 'Deep clean', subLabel: 'Cleaning', isActive: true, requested: 5, completed: 3, notCompleted: 2, closed: 5, completionRate: 0.6 }),
    row({ key: 'o-off', id: 'o-off', label: 'Old', subLabel: 'Cleaning', isActive: false, requested: 2 })
  ],
  byProvider: [row({ key: 'p1', id: 'p1', label: 'Clean Co', requested: 7 })],
  providerReasons: [{ reason: 'PriceNotAgreed', count: 2 }, { reason: 'CustomerUnreachable', count: 1 }],
  requesterReasons: [{ reason: 'PriceTooHigh', count: 1 }]
};

describe('AdminServicesPage', () => {
  let api: jasmine.SpyObj<AdminServiceRequestsService>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function create(query: Record<string, string> = {}) {
    params = new BehaviorSubject(convertToParamMap(query));
    TestBed.configureTestingModule({
      imports: [AdminServicesPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminServiceRequestsService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParamMap: params.asObservable() } }
      ]
    });
    const fixture = TestBed.createComponent(AdminServicesPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminServiceRequestsService', ['stats', 'search']);
    api.stats.and.returnValue(of(stats));
    api.search.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 20 }));
  });

  it('opens on the overview and loads the statistics, not the list', () => {
    const page = create().componentInstance;

    expect(page.tab()).toBe('overview');
    expect(api.stats).toHaveBeenCalledOnceWith(null, null);
    expect(api.search).not.toHaveBeenCalled();
  });

  it('ranks the most requested service first and sinks the ones nobody asked for', () => {
    const page = create().componentInstance;

    expect(page.rows().map(r => r.key)).toEqual(['o-hot', 'o-off', 'o-unused']);
  });

  it('counts active services that were never requested, ignoring inactive ones', () => {
    expect(create().componentInstance.neverRequested()).toBe(1);
  });

  it('shows the totals and both reason lists', () => {
    const el: HTMLElement = create().nativeElement;

    expect(el.querySelectorAll('.kpi').length).toBe(11);
    expect(el.querySelectorAll('.bars li').length).toBe(3);
    expect(el.textContent).toContain('50%');
  });

  it('formats a missing rate as a dash rather than 0%', () => {
    const page = create().componentInstance;

    expect(page.percent(null)).toBe('—');
    expect(page.percent(0)).toBe('0%');
    expect(page.percent(0.666)).toBe('67%');
  });

  it('scales a reason bar against the largest count', () => {
    const page = create().componentInstance;

    expect(page.barWidth(stats.providerReasons[0], stats.providerReasons)).toBe(100);
    expect(page.barWidth(stats.providerReasons[1], stats.providerReasons)).toBe(50);
  });

  it('sends the date range, the whole last day included', () => {
    const page = create().componentInstance;
    api.stats.calls.reset();
    page.from = '2026-10-01';
    page.to = '2026-10-31';

    page.applyRange();

    expect(api.stats).toHaveBeenCalledOnceWith('2026-10-01', '2026-10-31T23:59:59');
  });

  it('clicking a service opens the requests tab narrowed to it, keeping the date range', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    page.from = '2026-10-01';

    page.openRow(stats.byOffering[1]);

    expect(navigate).toHaveBeenCalledOnceWith([], { queryParams: { tab: 'requests', offeringId: 'o-hot', from: '2026-10-01' } });
  });

  it('clicking a category or a provider narrows by that instead', () => {
    const page = create().componentInstance;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    page.selectBreakdown('category');
    page.openRow(stats.byCategory[0]);
    expect(navigate.calls.mostRecent().args[1]).toEqual({ queryParams: { tab: 'requests', category: 'Cleaning' } });

    page.selectBreakdown('provider');
    page.openRow(stats.byProvider[0]);
    expect(navigate.calls.mostRecent().args[1]).toEqual({ queryParams: { tab: 'requests', providerId: 'p1' } });
  });

  it('loads the requests tab with the filters from the address', () => {
    const page = create({ tab: 'requests', status: 'NotCompleted', offeringId: 'o1', needsAttention: 'true', to: '2026-10-31T23:59:59' }).componentInstance;

    expect(page.tab()).toBe('requests');
    expect(api.stats).not.toHaveBeenCalled();
    expect(api.search).toHaveBeenCalledWith(jasmine.objectContaining({
      status: 'NotCompleted', offeringId: 'o1', needsAttention: true, to: '2026-10-31T23:59:59', page: 1, pageSize: 20
    }));
  });

  it('lists requests with their attention flag and links to the detail', () => {
    api.search.and.returnValue(of({
      total: 1, page: 1, pageSize: 20,
      items: [{
        id: 'r1', requestNumber: 'SR-1', propertyId: 'p', propertyTitle: 'Flat', requesterName: 'Me', serviceProviderId: 's',
        serviceProviderName: 'Clean Co', serviceOfferingId: 'o', serviceOfferingTitle: 'Deep clean', category: 'Cleaning',
        status: 'NotCompleted', outcomeReason: 'PriceNotAgreed', requesterReason: 'PriceTooHigh', needsAttention: true,
        createdAt: '2026-10-10T09:00:00Z'
      }]
    }));
    const el: HTMLElement = create({ tab: 'requests' }).nativeElement;

    expect(el.querySelector('a.row[href="/admin/services/r1"]')).not.toBeNull();
    expect(el.querySelector('.chip--warn')).not.toBeNull();
    expect(el.textContent).toContain('SERVICE_OUTCOME.PROVIDER.PriceNotAgreed');
    expect(el.textContent).toContain('SERVICE_OUTCOME.REQUESTER.PriceTooHigh');
  });

  it('shows an error with a retry when the statistics fail to load', () => {
    api.stats.and.returnValue(throwError(() => new Error('boom')));
    const el: HTMLElement = create().nativeElement;

    expect(el.querySelector('.state.error')).not.toBeNull();
  });
  it('shows inquiries, conversion and expiry on the overview, and who stayed silent', () => {
    api.stats.and.returnValue(of({
      ...stats,
      totals: { ...stats.totals, inquiries: 20, conversionRate: 0.35, expired: 4 },
      expiryReasons: [{ reason: 'Provider', count: 3 }, { reason: 'Requester', count: 1 }]
    }));
    const el: HTMLElement = create().nativeElement;

    expect(el.textContent).toContain('ADMIN_SERVICES.K_INQUIRIES');
    expect(el.textContent).toContain('35%');
    expect(el.textContent).toContain('ADMIN_SERVICES.EXPIRY.Provider');
    expect(el.textContent).toContain('ADMIN_SERVICES.EXPIRY.Requester');
  });

  it('passes the confirmation filter to the list: confirmed requests, unconfirmed inquiries, or both', () => {
    create({ tab: 'requests', confirmed: 'false' });
    expect(api.search.calls.mostRecent().args[0].confirmed).toBeFalse();

    TestBed.resetTestingModule();
    create({ tab: 'requests', confirmed: 'true' });
    expect(api.search.calls.mostRecent().args[0].confirmed).toBeTrue();

    TestBed.resetTestingModule();
    create({ tab: 'requests' });
    expect(api.search.calls.mostRecent().args[0].confirmed).toBeNull();
  });
});

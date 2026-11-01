import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AdminGrowthApiService, GrowthOverview } from '../../core/api/growth-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { AdminGrowthPage, normalizeTag } from './admin-growth.page';

const overview: GrowthOverview = {
  fromUtc: '2026-10-03T00:00:00Z', toUtc: '2026-11-02T00:00:00Z',
  totals: { newAccounts: 12, listingsPublished: 4, searchRequests: 3, savedSearches: 2, favorites: 9, contacts: 5, proposals: 1, referralsQualified: 0, activeUsers: 7 },
  funnel: { registered: 12, activated: 6, published: 3, contacted: 2 },
  days: [
    { day: '2026-10-31', newAccounts: 5, listingsPublished: 1, searchRequests: 0, savedSearches: 0, favorites: 2, contacts: 1, activeUsers: 3 },
    { day: '2026-11-01', newAccounts: 7, listingsPublished: 3, searchRequests: 3, savedSearches: 2, favorites: 7, contacts: 4, activeUsers: 4 }
  ],
  campaigns: [{ source: 'facebook', medium: 'social', campaign: 'launch', registered: 4, activated: 2, published: 1, contacted: 1 }],
  retention: [{ days: 1, cohort: 10, retained: 4 }, { days: 7, cohort: 6, retained: 2 }, { days: 30, cohort: 0, retained: 0 }],
  activityDataSince: '2026-10-20T10:00:00Z',
  untaggedRegistrations: 3
};

describe('AdminGrowthPage', () => {
  let api: jasmine.SpyObj<AdminGrowthApiService>;

  function create(response = of(overview)) {
    api = jasmine.createSpyObj<AdminGrowthApiService>('AdminGrowthApiService', ['overview']);
    api.overview.and.returnValue(response);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: AdminGrowthApiService, useValue: api },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) }
      ]
    });
    const fixture = TestBed.createComponent(AdminGrowthPage);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the default window and shows tiles, funnel, retention and campaigns', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(api.overview).toHaveBeenCalledWith(null, null);
    expect(el.querySelectorAll('[data-testid="growth-tiles"] li').length).toBe(9);
    expect(el.querySelector('[data-testid="growth-funnel"]')?.textContent).toContain('50%');
    const retention = el.querySelector('[data-testid="growth-retention"]')?.textContent ?? '';
    expect(retention).toContain('40%');
    expect(retention).toContain('—'); // an empty cohort is not shown as 0 %
    expect(el.querySelectorAll('[data-testid="growth-campaigns"] tbody tr').length).toBe(1);
    expect(el.querySelector('[data-testid="growth-days"] tbody tr td')?.textContent).toContain('2026-11-01');
  });

  it('sends an inclusive "to" day as the start of the next day', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    page.from = '2026-10-01';
    page.to = '2026-10-31';
    page.load();
    expect(api.overview).toHaveBeenCalledWith('2026-10-01T00:00:00Z', '2026-11-01T00:00:00.000Z');
  });

  it('shows an error line when loading fails', () => {
    const fixture = create(throwError(() => new Error('x')));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('builds a UTM link only from valid tags', () => {
    const page = create().componentInstance;
    page.source = 'Facebook';
    expect(page.link()).toBe('');
    page.campaign = 'Launch 2026';
    page.path = '/auth/register';
    expect(page.link()).toMatch(/\/auth\/register\?utm_source=facebook&utm_campaign=launch-2026$/);
    page.medium = 'e/mail';
    expect(page.invalidTag()).toBeTrue();
    expect(page.link()).toBe('');
    expect(normalizeTag('  Spring Ads ')).toBe('spring-ads');
  });
});

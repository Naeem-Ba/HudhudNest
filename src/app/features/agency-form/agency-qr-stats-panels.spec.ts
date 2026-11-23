import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AgencyQrPanelComponent } from './agency-qr-panel.component';
import { AgencyStatsPanelComponent } from './agency-stats-panel.component';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { Agency, AgencyStats } from '../../core/models/agency.model';
import { LanguageService } from '../../core/services/language.service';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { ToastService } from '../../shared/services/toast.service';

const AGENCY: Agency = {
  id: 'agency-1', name: 'مكتب الياسمين', slug: 'yasmin', countryCode: 'SY', ownerUserId: 'owner-1', isActive: true,
  memberCount: 1, createdAt: '2026-01-01T00:00:00Z', members: []
};

function stats(partial: Partial<AgencyStats> = {}): AgencyStats {
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: `2026-11-1${i}`, profileViews: i, qrScans: i === 6 ? 4 : 0, contactClicks: 0, listingClicks: 0, shares: 0
  }));
  return {
    days: 7, from: '2026-11-10', to: '2026-11-16',
    totals: { profileViews: 21, qrScans: 4, contactClicks: 3, listingClicks: 2, shares: 1 },
    uniqueVisitors: 15,
    contacts: [{ channel: 'Phone', count: 3 }], shares: [{ channel: 'CopyLink', count: 1 }],
    viewSources: [{ source: 'Qr', count: 12 }, { source: 'Direct', count: 9 }],
    daily, ...partial
  };
}

describe('Agency QR and statistics panels', () => {
  let api: jasmine.SpyObj<AgenciesApiService>;

  function setup() {
    TestBed.configureTestingModule({
      imports: [AgencyQrPanelComponent, AgencyStatsPanelComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AgenciesApiService, useValue: api },
        {
          provide: PropertyShareUrlService,
          useValue: {
            getSiteOrigin: () => 'https://hudhudnest.com',
            getOfficeQrUrl: (code: string | null) => (code ? `https://hudhudnest.com/o/${code}` : null)
          }
        },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar', currentLang$: of('ar') } }
      ]
    });
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AgenciesApiService', ['getQrCode', 'getStats']);
  });

  describe('QR panel', () => {
    it('shows the permanent short link and draws its code', () => {
      api.getQrCode.and.returnValue(of({ code: 'ab23cd45' }));
      setup();
      const fixture = TestBed.createComponent(AgencyQrPanelComponent);
      fixture.componentInstance.agency = AGENCY;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(api.getQrCode).toHaveBeenCalledWith('agency-1');
      expect(el.querySelector('[data-testid="qr-url"]')!.textContent).toBe('https://hudhudnest.com/o/ab23cd45');
      expect(el.querySelector('[data-testid="qr-svg"] path')!.getAttribute('d')).toMatch(/^M/);
    });

    it('names the files after the slug and code, never the Arabic name', () => {
      api.getQrCode.and.returnValue(of({ code: 'ab23cd45' }));
      setup();
      const fixture = TestBed.createComponent(AgencyQrPanelComponent);
      fixture.componentInstance.agency = AGENCY;
      fixture.detectChanges();
      expect(fixture.componentInstance.fileName('png')).toBe('hudhudnest-office-yasmin-ab23cd45.png');
    });

    it('says so when the code cannot be loaded, and draws nothing', () => {
      api.getQrCode.and.returnValue(throwError(() => ({ status: 500 })));
      setup();
      const fixture = TestBed.createComponent(AgencyQrPanelComponent);
      fixture.componentInstance.agency = AGENCY;
      fixture.detectChanges();
      expect(fixture.componentInstance.failed()).toBeTrue();
      expect(fixture.nativeElement.querySelector('[data-testid="qr-svg"]')).toBeNull();
    });
  });

  describe('statistics panel', () => {
    it('loads the last 30 days first, then the chosen range', () => {
      api.getStats.and.returnValue(of(stats()));
      setup();
      const fixture = TestBed.createComponent(AgencyStatsPanelComponent);
      fixture.componentInstance.agency = AGENCY;
      fixture.detectChanges();
      expect(api.getStats).toHaveBeenCalledWith('agency-1', 30);
      fixture.componentInstance.setDays(7);
      expect(api.getStats).toHaveBeenCalledWith('agency-1', 7);
      fixture.componentInstance.setDays(365);
      expect(api.getStats).toHaveBeenCalledTimes(2);
    });

    it('shows the server numbers as tiles and a bar per day', () => {
      api.getStats.and.returnValue(of(stats()));
      setup();
      const fixture = TestBed.createComponent(AgencyStatsPanelComponent);
      fixture.componentInstance.agency = AGENCY;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-testid="tile-profileViews"]')!.textContent).toContain('21');
      expect(el.querySelector('[data-testid="tile-uniqueVisitors"]')!.textContent).toContain('15');
      expect(el.querySelector('[data-testid="tile-qrScans"]')!.textContent).toContain('4');
      expect(el.querySelectorAll('.stats__bar').length).toBe(7);
      // The busiest day (6 views + 4 scans) is the full height.
      expect(fixture.componentInstance.barHeight(10)).toBe(100);
    });

    it('says there is no activity yet instead of drawing an empty chart', () => {
      api.getStats.and.returnValue(of(stats({
        totals: { profileViews: 0, qrScans: 0, contactClicks: 0, listingClicks: 0, shares: 0 },
        uniqueVisitors: 0, contacts: [], shares: [], viewSources: []
      })));
      setup();
      const fixture = TestBed.createComponent(AgencyStatsPanelComponent);
      fixture.componentInstance.agency = AGENCY;
      fixture.detectChanges();
      expect(fixture.componentInstance.isEmpty()).toBeTrue();
      expect(fixture.nativeElement.querySelector('[data-testid="stats-chart"]')).toBeNull();
    });

    it('shows an error, not zeros, when the statistics fail to load', () => {
      api.getStats.and.returnValue(throwError(() => ({ status: 500 })));
      setup();
      const fixture = TestBed.createComponent(AgencyStatsPanelComponent);
      fixture.componentInstance.agency = AGENCY;
      fixture.detectChanges();
      expect(fixture.componentInstance.failed()).toBeTrue();
      expect(fixture.nativeElement.querySelector('[data-testid="tile-profileViews"]')).toBeNull();
    });
  });
});

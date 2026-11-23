// The office's valuation inbox: requests near the office, a one-time answer of one price in one market currency,
// and the customer's contact only once the customer shared it.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { ValuationOfficeInboxPage, inboxTabOf } from './valuation-office-inbox.page';
import { ValuationApiService } from '../../core/api/valuation-api.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { ValuationOfficeInvitation } from '../../core/models/valuation.model';
import { LanguageService } from '../../core/services/language.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { ToastService } from '../../shared/services/toast.service';

describe('ValuationOfficeInboxPage', () => {
  let api: jasmine.SpyObj<ValuationApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  const open: ValuationOfficeInvitation = {
    invitationId: 'inv-1', inquiryId: 'inq-1', matchLevel: 'Neighborhood', invitationStatus: 'Sent',
    sentAt: '2026-03-01T12:00:00Z', respondedAt: null, canRespond: true, governorateId: 1, districtId: 10,
    neighborhoodId: 100, propertyTypeId: 2, area: 120, rooms: 3, requestType: 'ForSale',
    inquiryExpiresAt: '2026-03-02T12:00:00Z', myEstimatedPrice: null, myCurrencyCode: null, myNotes: null,
    customerContactPhone: null, customerContactEmail: null
  };
  const answered: ValuationOfficeInvitation = {
    ...open, invitationId: 'inv-2', invitationStatus: 'Responded', canRespond: false, myEstimatedPrice: 88000,
    myCurrencyCode: 'USD', myNotes: 'حسب الإكساء', customerContactPhone: '+963991112233'
  };

  const missed: ValuationOfficeInvitation = { ...open, invitationId: 'inv-3', canRespond: false };

  function create(preferred: string | null = 'SYP', invitationId: string | null = null): ComponentFixture<ValuationOfficeInboxPage> {
    const params = new BehaviorSubject(convertToParamMap(invitationId ? { invitationId } : {}));
    api = jasmine.createSpyObj('ValuationApiService', ['getMyOfficeInvitations', 'respond']);
    toast = jasmine.createSpyObj('ToastService', ['show']);
    const lookups = jasmine.createSpyObj('LookupsApiService', ['getGovernorates', 'getDistricts', 'getNeighborhoods', 'getPropertyTypeCatalog']);
    lookups.getGovernorates.and.returnValue(of([{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }]));
    lookups.getDistricts.and.returnValue(of([{ id: 10, nameAr: 'المزة', nameEn: 'Mezzeh' }]));
    lookups.getNeighborhoods.and.returnValue(of([{ id: 100, nameAr: 'فيلات غربية', nameEn: 'West Villas' }]));
    lookups.getPropertyTypeCatalog.and.returnValue(of([{ id: 2, code: 'apartment', nameAr: 'شقة', nameEn: 'Apartment' }]));

    TestBed.configureTestingModule({
      imports: [ValuationOfficeInboxPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ValuationApiService, useValue: api },
        { provide: LookupsApiService, useValue: lookups },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar' } },
        { provide: PreferencesService, useValue: { currency: preferred } },
        { provide: PageMetaService, useValue: { noindex: jasmine.createSpy('noindex') } },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { paramMap: params } }
      ]
    });
    return TestBed.createComponent(ValuationOfficeInboxPage);
  }

  it('sorts each request into waiting, answered or missed', () => {
    expect(inboxTabOf(open)).toBe('open');
    expect(inboxTabOf(answered)).toBe('answered');
    expect(inboxTabOf(missed)).toBe('missed');
  });

  it('opens on the waiting tab with counts per tab, each request linking to its own page', () => {
    const fixture = create();
    api.getMyOfficeInvitations.and.returnValue(of([open, answered, missed]));
    fixture.detectChanges();

    const page = fixture.componentInstance;
    expect(page.counts()).toEqual({ open: 1, answered: 1, missed: 1 });
    const el = fixture.nativeElement as HTMLElement;
    let rows = el.querySelectorAll('[data-testid="office-request"]');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute('href')).toBe('/my-agency/valuations/inv-1');
    expect(rows[0].textContent).toContain('فيلات غربية، المزة، دمشق');
    expect(rows[0].textContent).toContain('شقة');

    page.selectTab('answered');
    fixture.detectChanges();
    rows = el.querySelectorAll('[data-testid="office-request"]');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute('href')).toBe('/my-agency/valuations/inv-2');

    page.selectTab('missed');
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="office-request"]').length).toBe(1);
  });

  it('an open request page shows the details and the answer form', () => {
    const fixture = create('SYP', 'inv-1');
    api.getMyOfficeInvitations.and.returnValue(of([open, answered]));
    fixture.detectChanges();

    const detail = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="office-request-detail"]')!;
    expect(detail.textContent).toContain('فيلات غربية، المزة، دمشق');
    expect(detail.querySelector('form')).not.toBeNull();
  });

  it('an answered request page shows what the office said and the contact the customer shared, without a form', () => {
    const fixture = create('SYP', 'inv-2');
    api.getMyOfficeInvitations.and.returnValue(of([open, answered]));
    fixture.detectChanges();

    const detail = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="office-request-detail"]')!;
    expect(detail.querySelector('form')).toBeNull();
    expect(detail.textContent).toContain('حسب الإكساء');
    expect(detail.querySelector('a[href="tel:+963991112233"]')).not.toBeNull();
  });

  it('a request that is not in this office\'s inbox says so', () => {
    const fixture = create('SYP', 'other');
    api.getMyOfficeInvitations.and.returnValue(of([open]));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('VALUATION.OFFICE_INBOX.NOT_FOUND');
  });

  it('starts the currency at the person\'s market currency, and cannot send without a price', () => {
    const fixture = create('SYP');
    api.getMyOfficeInvitations.and.returnValue(of([open]));
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.draft(open).currency).toBe('SYP');
    expect(page.canSubmit(open)).toBeFalse();
    page.draft(open).price = ValuationOfficeInboxPage.MAX_PRICE + 1;
    expect(page.canSubmit(open)).toBeFalse();
    page.draft(open).price = 450_000_000;
    expect(page.canSubmit(open)).toBeTrue();
  });

  it('sends one price in one currency with the note, then reloads the inbox', () => {
    const fixture = create();
    api.getMyOfficeInvitations.and.returnValue(of([open]));
    api.respond.and.returnValue(of(undefined));
    fixture.detectChanges();
    const page = fixture.componentInstance;

    Object.assign(page.draft(open), { price: 95000, currency: 'USD', notes: 'رأي أولي' });
    page.submit(open);

    expect(api.respond).toHaveBeenCalledWith('inv-1', { estimatedPrice: 95000, currencyCode: 'USD', notes: 'رأي أولي' });
    expect(api.getMyOfficeInvitations).toHaveBeenCalledTimes(2);
    expect(toast.show).toHaveBeenCalledWith(jasmine.any(String), 'success');
  });

  it('a request that closed meanwhile (409) says so and reloads', () => {
    const fixture = create();
    api.getMyOfficeInvitations.and.returnValue(of([open]));
    api.respond.and.returnValue(throwError(() => ({ status: 409 })));
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.draft(open).price = 95000;
    page.submit(open);

    expect(toast.show).toHaveBeenCalledWith('VALUATION.OFFICE_INBOX.CLOSED', 'error');
    expect(api.getMyOfficeInvitations).toHaveBeenCalledTimes(2);
    expect(page.submitting()).toBeNull();
  });

  it('someone without an office (404) is told the page is for office members', () => {
    const fixture = create();
    api.getMyOfficeInvitations.and.returnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('no-agency');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('VALUATION.OFFICE_INBOX.NO_AGENCY');
  });

  it('an empty tab says so', () => {
    const fixture = create();
    api.getMyOfficeInvitations.and.returnValue(of([]));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="office-tab-empty"]')).not.toBeNull();
  });
});

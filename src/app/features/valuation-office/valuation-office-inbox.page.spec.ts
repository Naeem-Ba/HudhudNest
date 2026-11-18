// The office's valuation inbox: requests near the office, a one-time answer of one price in one market currency,
// and the customer's contact only once the customer shared it.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ValuationOfficeInboxPage } from './valuation-office-inbox.page';
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

  function create(preferred: string | null = 'SYP'): ComponentFixture<ValuationOfficeInboxPage> {
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
        { provide: ToastService, useValue: toast }
      ]
    });
    return TestBed.createComponent(ValuationOfficeInboxPage);
  }

  it('lists the requests with their place in words, and a form only where the office can still answer', () => {
    const fixture = create();
    api.getMyOfficeInvitations.and.returnValue(of([open, answered]));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('[data-testid="office-request"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('فيلات غربية، المزة، دمشق');
    expect(rows[0].textContent).toContain('شقة');
    expect(rows[0].querySelector('form')).not.toBeNull();
    expect(rows[1].querySelector('form')).toBeNull();
    // The answered one shows what this office said and the contact the customer shared.
    expect(rows[1].textContent).toContain('حسب الإكساء');
    expect(rows[1].querySelector('a[href="tel:+963991112233"]')).not.toBeNull();
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

  it('an empty inbox says so', () => {
    const fixture = create();
    api.getMyOfficeInvitations.and.returnValue(of([]));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="office-inbox-empty"]')).not.toBeNull();
  });
});

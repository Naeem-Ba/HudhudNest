import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';

import { ServiceProviderJoinPage } from './service-provider-join.page';
import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import { ProviderApplicationsService } from '../../core/api/provider-applications.service';
import { ServiceProviderService } from '../../core/api/service-provider.service';
import { AuthService } from '../../core/auth/auth.service';
import { ServiceProviderApplicationDto } from '../../core/models/provider-onboarding.model';

function application(overrides: Partial<ServiceProviderApplicationDto> = {}): ServiceProviderApplicationDto {
  return {
    id: 'a1', referenceNumber: 'SPA-000001', applicantType: 'Individual', displayName: 'Cleaner Co',
    contactName: 'Sami', contactEmail: 's@example.com', contactPhone: null,
    requestedCategories: ['Cleaning'], requestedGovernorateIds: [1], experience: '5 years',
    companyName: null, licenseNumber: null, status: 'Pending', infoRequest: null, decisionReason: null,
    serviceProviderId: null, createdAt: '2026-10-14T10:00:00Z', updatedAt: '2026-10-14T10:00:00Z',
    timeline: [
      { id: 'e1', type: 'ApplicationSubmitted', note: null, isInternal: false, createdAt: '2026-10-14T10:00:00Z' },
      { id: 'e2', type: 'Note', note: 'internal only', isInternal: true, createdAt: '2026-10-14T11:00:00Z' }
    ],
    ...overrides
  };
}

describe('ServiceProviderJoinPage', () => {
  let loggedIn: BehaviorSubject<boolean>;
  let api: jasmine.SpyObj<ProviderApplicationsService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [ServiceProviderJoinPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn$: loggedIn } },
        { provide: ProviderApplicationsService, useValue: api },
        { provide: ServiceProviderService, useValue: { getMine: () => of(null) } },
        { provide: GovernorateDirectory, useValue: {
          ensureLoaded: () => undefined, items: () => [{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }],
          label: (g: { nameEn: string }) => g.nameEn, names: (ids: number[]) => ids.join(',') } }
      ]
    });
    const fixture = TestBed.createComponent(ServiceProviderJoinPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    loggedIn = new BehaviorSubject<boolean>(true);
    api = jasmine.createSpyObj('ProviderApplicationsService', ['getMine', 'submit', 'respond', 'withdraw']);
    api.getMine.and.returnValue(of([]));
  });

  it('sends an anonymous visitor to sign in and back, without loading anything or showing the form', () => {
    loggedIn.next(false);
    const fixture = create();
    const el: HTMLElement = fixture.nativeElement;

    expect(api.getMine).not.toHaveBeenCalled();
    expect(el.querySelector('form')).toBeNull();
    const signIn = el.querySelector('a[href^="/login"]') as HTMLAnchorElement;
    expect(signIn.getAttribute('href')).toContain('returnUrl=%2Fservices%2Fjoin');
  });

  it('shows the form for a signed-in user with no application and blocks an empty submit', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();

    page.submit();

    expect(api.submit).not.toHaveBeenCalled();
    expect(Object.keys(page.errors())).toEqual(jasmine.arrayContaining(
      ['displayName', 'contactName', 'contact', 'categories', 'governorates', 'experience', 'terms']));
  });

  it('submits only the applicant fields and then shows the reference number', () => {
    const saved = application();
    api.submit.and.returnValue(of(saved));
    const fixture = create();
    const page = fixture.componentInstance;

    page.patch({
      displayName: ' Cleaner Co ', contactName: 'Sami', contactEmail: 's@example.com',
      categories: ['Cleaning'], governorateIds: [1], experience: '5 years', termsAccepted: true
    });
    page.submit();
    fixture.detectChanges();

    const body = api.submit.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
    expect(body['displayName']).toBe('Cleaner Co');
    expect(body['termsAccepted']).toBeTrue();
    expect(Object.keys(body)).not.toContain('status');
    expect(Object.keys(body)).not.toContain('applicantUserId');
    expect(fixture.nativeElement.textContent).toContain('SPA-000001');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('requires a company name for a company and a message when answering an info request', () => {
    api.getMine.and.returnValue(of([application({ status: 'NeedsInfo', infoRequest: 'Send your licence number' })]));
    const fixture = create();
    const page = fixture.componentInstance;

    expect(fixture.nativeElement.textContent).toContain('Send your licence number');
    page.startRespond();
    page.patch({ applicantType: 'Company', companyName: '' });
    page.submit();

    expect(page.errors()['companyName']).toBeDefined();
    expect(page.errors()['message']).toBeDefined();
    expect(page.errors()['terms']).toBeUndefined();
    expect(api.respond).not.toHaveBeenCalled();
  });

  it('never renders internal notes of the history', () => {
    api.getMine.and.returnValue(of([application()]));
    const fixture = create();

    expect(fixture.nativeElement.textContent).not.toContain('internal only');
    expect(fixture.componentInstance.timeline().length).toBe(1);
  });

  it('offers a new application after a rejection and keeps the old one in the list', () => {
    api.getMine.and.returnValue(of([
      application({ id: 'new', status: 'Rejected', decisionReason: 'Incomplete', createdAt: '2026-10-14T12:00:00Z' }),
      application({ id: 'old', referenceNumber: 'SPA-000000', status: 'Withdrawn' })
    ]));
    const fixture = create();
    const page = fixture.componentInstance;

    expect(page.canApplyAgain()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Incomplete');
    expect(page.history().map(a => a.id)).toEqual(['old']);
  });
});

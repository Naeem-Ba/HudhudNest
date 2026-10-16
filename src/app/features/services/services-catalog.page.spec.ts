import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { ServicesCatalogPage } from './services-catalog.page';
import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { AuthService } from '../../core/auth/auth.service';
import { ServiceCategory, ServiceOfferingDto } from '../../core/models/service.model';

function offering(id: string, category: ServiceCategory): ServiceOfferingDto {
  return {
    id, category, serviceProviderId: 'p1', serviceProviderDisplayName: 'Provider',
    serviceProviderVerificationLevel: 'ServiceVerified', title: `Offering ${id}`,
    isActive: true, createdAt: '2026-10-07T00:00:00Z'
  };
}

describe('ServicesCatalogPage', () => {
  let getByCategory: jasmine.Spy;
  let getAvailability: jasmine.Spy;

  function create() {
    TestBed.configureTestingModule({
      imports: [ServicesCatalogPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ServiceOfferingService, useValue: { getByCategory, getAvailability } },
        { provide: GovernorateDirectory, useValue: { ensureLoaded: () => undefined, names: (ids: number[]) => ids.join(','), items: () => [] } },
        { provide: AuthService, useValue: { isLoggedIn$: new BehaviorSubject(false) } }
      ]
    });
    const fixture = TestBed.createComponent(ServicesCatalogPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    getByCategory = jasmine.createSpy('getByCategory');
    getAvailability = jasmine.createSpy('getAvailability').and.returnValue(of([]));
  });

  it('loads the Verification offerings on open and renders them', () => {
    getByCategory.and.returnValue(of([offering('a', 'Verification')]));
    const fixture = create();

    expect(getByCategory).toHaveBeenCalledOnceWith('Verification');
    expect(fixture.nativeElement.querySelectorAll('.offering-card').length).toBe(1);
  });

  it('shows the empty state when a category has no offerings', () => {
    getByCategory.and.returnValue(of([]));
    const fixture = create();

    expect(fixture.nativeElement.querySelector('.offering-card')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('SERVICES_CATALOG.EMPTY');
  });

  it('shows an error with retry when loading fails', () => {
    getByCategory.and.returnValue(throwError(() => new Error('boom')));
    const fixture = create();

    expect(fixture.componentInstance.error()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('SERVICES_CATALOG.LOAD_ERROR');
  });

  it('caches a category it already loaded', () => {
    getByCategory.and.callFake((c: ServiceCategory) => of([offering(c, c)]));
    const page = create().componentInstance;

    page.selectCategory('Legal');
    page.selectCategory('Verification');

    expect(getByCategory.calls.allArgs()).toEqual([['Verification'], ['Legal']]);
    expect(page.offerings()[0].category).toBe('Verification');
  });

  it('ignores a late response for a category the user already left', () => {
    const verification = new Subject<ServiceOfferingDto[]>();
    getByCategory.and.callFake((c: ServiceCategory) =>
      c === 'Verification' ? verification : of([offering('l', 'Legal')]));
    const page = create().componentInstance;

    page.selectCategory('Legal');
    verification.next([offering('v', 'Verification')]);

    expect(page.selectedCategory()).toBe('Legal');
    expect(page.offerings().map(o => o.id)).toEqual(['l']);
    expect(page.loading()).toBeFalse();
  });

  it('shows how many bookable offerings each category has and the dedicated join path', () => {
    getByCategory.and.returnValue(of([]));
    getAvailability.and.returnValue(of([
      { category: 'Verification', offeringCount: 2 },
      { category: 'Legal', offeringCount: 0 }
    ]));
    const fixture = create();
    fixture.detectChanges();

    const pills = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.filters .pill-count'))
      .map(el => el.textContent?.trim());
    expect(pills).toEqual(['2', '0']);
    expect(fixture.nativeElement.querySelector('a[href="/services/join"]')).not.toBeNull();
  });

  it('lists the governorates an offering covers', () => {
    getByCategory.and.returnValue(of([{ ...offering('a', 'Verification'), providerCoverageGovernorateIds: [1, 2] }]));
    const fixture = create();

    expect(fixture.nativeElement.querySelector('.offering-card').textContent).toContain('1,2');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { ExpatJourneyPage } from './expat-journey.page';

describe('ExpatJourneyPage', () => {
  function create(availability = of([
    { category: 'PropertyManagement', offeringCount: 2 },
    { category: 'Legal', offeringCount: 0 },
    { category: 'Inspection', offeringCount: 1 }
  ] as never)) {
    const api = jasmine.createSpyObj<ServiceOfferingService>('ServiceOfferingService', ['getAvailability']);
    api.getAvailability.and.returnValue(availability);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: ServiceOfferingService, useValue: api }]
    });
    const fixture = TestBed.createComponent(ExpatJourneyPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the steps of the chosen goal and only services that have a provider', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="xp-steps"]')).toBeNull();

    (el.querySelector('[data-testid="xp-goal-own"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const links = Array.from(el.querySelectorAll('[data-testid="xp-services"] a')).map(a => a.getAttribute('href'));
    expect(links).toEqual(['/services?category=PropertyManagement', '/services?category=Inspection']);
    expect(el.querySelectorAll('[data-testid="xp-steps"] li').length).toBe(3);
  });

  it('offers no service when availability cannot be loaded', () => {
    const fixture = create(throwError(() => new Error('down')));
    fixture.componentInstance.goal.set('find');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="xp-no-services"]')).not.toBeNull();
  });
});

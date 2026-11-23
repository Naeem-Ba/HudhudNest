import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Agency } from '../../core/models/agency.model';
import { Property } from '../../core/models/property.model';
import { ToastService } from '../../shared/services/toast.service';
import { ListingStatusPanelComponent } from './listing-status-panel.component';

describe('ListingStatusPanelComponent (listing status control, 2026-11-18)', () => {
  let me: string | null;
  let agencies: jasmine.SpyObj<AgenciesApiService>;
  let api: jasmine.SpyObj<PropertyApiService>;

  const listing = (over: Partial<Property> = {}): Property =>
    ({ id: 'p1', ownerId: 'agent', isPublished: true, status: 'Available', listingType: 'ForSale', agencyId: 'office', ...over } as Property);

  const office = (over: Partial<Agency> = {}): Agency =>
    ({ id: 'office', ownerUserId: 'boss', members: [{ userId: 'agent', displayName: 'A', isOwner: false }], ...over } as Agency);

  function render(p: Property) {
    const fixture = TestBed.createComponent(ListingStatusPanelComponent);
    fixture.componentRef.setInput('property', p);
    fixture.detectChanges();
    return fixture;
  }

  const options = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('option')).map(o => (o as HTMLOptionElement).value);

  beforeEach(() => {
    me = 'agent';
    agencies = jasmine.createSpyObj<AgenciesApiService>('AgenciesApiService', ['getMine']);
    api = jasmine.createSpyObj<PropertyApiService>('PropertyApiService', ['updateStatus']);
    api.updateStatus.and.returnValue(of({}));

    TestBed.configureTestingModule({
      imports: [ListingStatusPanelComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: { getCurrentUserId: () => me } },
        { provide: AgenciesApiService, useValue: agencies },
        { provide: PropertyApiService, useValue: api },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['show']) }
      ]
    });
  });

  it('shows the publisher the statuses that fit a listing for sale, without asking for the office', () => {
    const el = render(listing()).nativeElement as HTMLElement;

    expect(options(el)).toEqual(['Available', 'Reserved', 'Sold', 'Archived']);
    expect(agencies.getMine).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="listing-status-office-hint"]')).toBeNull();
  });

  it('offers Rented, not Sold, on a listing for rent', () => {
    const el = render(listing({ listingType: 'ForRent' })).nativeElement as HTMLElement;

    expect(options(el)).toEqual(['Available', 'Reserved', 'Rented', 'Archived']);
  });

  it('shows the office owner the panel with a hint when the publisher is a member', () => {
    me = 'boss';
    agencies.getMine.and.returnValue(of(office()));

    const fixture = render(listing());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="listing-status-panel"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="listing-status-office-hint"]')).not.toBeNull();
  });

  it('hides the panel from the office owner when the publisher left the office', () => {
    me = 'boss';
    agencies.getMine.and.returnValue(of(office({ members: [] })));

    const fixture = render(listing());
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="listing-status-panel"]')).toBeNull();
  });

  it('hides the panel from another office owner and from a visitor', () => {
    me = 'boss';
    agencies.getMine.and.returnValue(of(office({ id: 'other-office' })));
    let fixture = render(listing());
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="listing-status-panel"]')).toBeNull();

    me = null;
    fixture = render(listing());
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="listing-status-panel"]')).toBeNull();
  });

  it('hides the panel when the agency lookup fails', () => {
    me = 'boss';
    agencies.getMine.and.returnValue(throwError(() => new Error('offline')));

    const fixture = render(listing());
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="listing-status-panel"]')).toBeNull();
  });

  it('saves Reserved without a confirmation and reports it', () => {
    const fixture = render(listing());
    const emitted: string[] = [];
    fixture.componentInstance.statusChanged.subscribe(s => emitted.push(s));
    const select = (fixture.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement;

    select.value = 'Reserved';
    select.dispatchEvent(new Event('change'));

    expect(api.updateStatus).toHaveBeenCalledOnceWith('p1', 'Reserved');
    expect(emitted).toEqual(['Reserved']);
  });

  it('asks before Sold and does nothing when declined', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    const fixture = render(listing());
    const select = (fixture.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement;

    select.value = 'Sold';
    select.dispatchEvent(new Event('change'));

    expect(api.updateStatus).not.toHaveBeenCalled();
    expect(select.value).toBe('Available');
  });

  it('is not shown on a draft', () => {
    const el = render(listing({ isPublished: false })).nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="listing-status-panel"]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { SavedSearchApiService } from '../../core/api/saved-search-api.service';
import { SavedSearch } from '../../core/models/saved-search.model';
import { ToastService } from '../../shared/services/toast.service';
import { SavedSearchesPage } from './saved-searches.page';

const search = (over: Partial<SavedSearch> = {}): SavedSearch => ({
  id: 's1', name: 'Mezzeh', governorateId: 1, districtId: 4, listingType: 'ForRent', propertyTypeId: 2,
  minPrice: 100, maxPrice: 400, currencyCode: 'USD', createdAt: '2026-10-01T00:00:00Z',
  frequency: 'Instant', isPaused: false, notifiedCount: 3, lastNotifiedAt: '2026-10-30T10:00:00Z', ...over
});

describe('SavedSearchesPage (growth engine P3)', () => {
  let api: jasmine.SpyObj<SavedSearchApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<SavedSearchApiService>('SavedSearchApiService', ['getMine', 'create', 'update', 'pause', 'resume', 'remove']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SavedSearchApiService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
  });

  it('sends the unchanged location and type with the edited criteria', () => {
    api.getMine.and.returnValue(of([search()]));
    api.update.and.returnValue(of(void 0));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.startEdit(page.searches()[0]);
    page.draft.frequency = 'Daily';
    page.draft.minRooms = 2;
    page.draft.hasElevator = true;
    page.saveEdit(page.searches()[0]);

    const [id, payload] = api.update.calls.mostRecent().args;
    expect(id).toBe('s1');
    expect(payload.GovernorateId).toBe(1);
    expect(payload.DistrictId).toBe(4);
    expect(payload.PropertyTypeId).toBe(2);
    expect(payload.ListingType).toBe('ForRent');
    expect(payload.Frequency).toBe('Daily');
    expect(payload.MinRooms).toBe(2);
    expect(payload.HasElevator).toBeTrue();
    expect(payload.HasBalcony).toBeNull();
    expect(page.searches()[0].frequency).toBe('Daily');
    expect(page.editingId()).toBeNull();
  });

  it('drops the currency when no price bound is left', () => {
    api.getMine.and.returnValue(of([search()]));
    api.update.and.returnValue(of(void 0));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.startEdit(page.searches()[0]);
    page.draft.minPrice = null;
    page.draft.maxPrice = null;
    page.saveEdit(page.searches()[0]);

    expect(api.update.calls.mostRecent().args[1].CurrencyCode).toBeNull();
  });

  it('pauses and resumes', () => {
    api.getMine.and.returnValue(of([search()]));
    api.pause.and.returnValue(of(void 0));
    api.resume.and.returnValue(of(void 0));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.togglePause(page.searches()[0]);
    expect(api.pause).toHaveBeenCalledWith('s1');
    expect(page.searches()[0].isPaused).toBeTrue();

    page.togglePause(page.searches()[0]);
    expect(api.resume).toHaveBeenCalledWith('s1');
    expect(page.searches()[0].isPaused).toBeFalse();
  });

  it('keeps the state and shows an error when the update fails', () => {
    api.getMine.and.returnValue(of([search()]));
    api.pause.and.returnValue(throwError(() => new Error('x')));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.togglePause(page.searches()[0]);
    expect(page.searches()[0].isPaused).toBeFalse();
    expect(toast.error).toHaveBeenCalled();
  });

  it('shows the delivery log and frequency', () => {
    api.getMine.and.returnValue(of([search({ frequency: 'Daily', isPaused: true })]));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('SAVED_SEARCHES.FREQ_DAILY');
    expect(text).toContain('SAVED_SEARCHES.STATUS_PAUSED');
    expect(text).toContain('SAVED_SEARCHES.LAST_ALERT');
    expect(text).toContain('SAVED_SEARCHES.RESUME');
  });
});

import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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

  it('keeps the floor when another criterion is edited (PUT replaces everything), including the ground floor', () => {
    api.getMine.and.returnValue(of([search({ floorFrom: 0, floorTo: 0 })]));
    api.update.and.returnValue(of(void 0));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.startEdit(page.searches()[0]);
    page.draft.minRooms = 3;
    page.saveEdit(page.searches()[0]);

    const payload = api.update.calls.mostRecent().args[1];
    expect(payload.FloorFrom).toBe(0);
    expect(payload.FloorTo).toBe(0);
  });

  it('sends null floors for a search without a floor', () => {
    api.getMine.and.returnValue(of([search()]));
    api.update.and.returnValue(of(void 0));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.startEdit(page.searches()[0]);
    page.saveEdit(page.searches()[0]);

    const payload = api.update.calls.mostRecent().args[1];
    expect(payload.FloorFrom).toBeNull();
    expect(payload.FloorTo).toBeNull();
  });

  it('re-runs the search with its floor range, and with floor 0', () => {
    api.getMine.and.returnValue(of([search({ floorFrom: 2, floorTo: 4 }), search({ id: 's2', floorFrom: 0, floorTo: 0 }), search({ id: 's3' })]));
    const fixture = TestBed.createComponent(SavedSearchesPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);

    page.runSearch(page.searches()[0]);
    expect(navigate.calls.mostRecent().args[1]?.queryParams).toEqual(jasmine.objectContaining({ floorFrom: '2', floorTo: '4' }));

    page.runSearch(page.searches()[1]);
    expect(navigate.calls.mostRecent().args[1]?.queryParams).toEqual(jasmine.objectContaining({ floorFrom: '0', floorTo: '0' }));

    page.runSearch(page.searches()[2]);
    const params = navigate.calls.mostRecent().args[1]?.queryParams as Record<string, string>;
    expect(params['floorFrom']).toBeUndefined();
    expect(params['floorTo']).toBeUndefined();
  });

  it('describes the floor in the summary: one floor, ground floor, open range', () => {
    api.getMine.and.returnValue(of([]));
    const page = TestBed.createComponent(SavedSearchesPage).componentInstance;

    expect(page.summary(search({ floorFrom: 3, floorTo: 3 }))).toContain('PROPERTY_LIST.FLOOR_FILTER.TITLE: 3');
    expect(page.summary(search({ floorFrom: 0, floorTo: 0 }))).toContain('PROPERTY_LIST.FLOOR_FILTER.GROUND');
    expect(page.summary(search({ floorFrom: 2, floorTo: null }))).toContain('2 – …');
    expect(page.summary(search())).not.toContain('FLOOR_FILTER');
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

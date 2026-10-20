// =====================================================================
// FavoritesApiService — the one shared "is this property a favorite?" state.
// Every heart reads it, so these tests pin the rules the hearts depend on: the set follows the
// signed-in user, add/remove are idempotent from the user's point of view (409/404 mean "already
// in the wanted state"), and those two expected failures never raise the generic error toast.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { FavoritesApiService } from './favorites-api.service';

describe('FavoritesApiService', () => {
  const url = (path: string) => `${environment.apiUrl}${path}`;

  let httpMock: HttpTestingController;
  let user$: BehaviorSubject<{ id: string } | null>;

  function create(initialUser: { id: string } | null): FavoritesApiService {
    user$ = new BehaviorSubject<{ id: string } | null>(initialUser);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser$: user$.asObservable() } }
      ]
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(FavoritesApiService);
  }

  const flushFavorites = (ids: string[]) =>
    httpMock.expectOne(url('/favorites')).flush(ids.map(propertyId => ({ propertyId })));

  afterEach(() => httpMock.verify());

  it('✅ loads the favorite ids as soon as a user is signed in', () => {
    const service = create({ id: 'u1' });
    expect(service.loadState()).toBe('loading');

    flushFavorites(['a', 'b']);

    expect(service.loadState()).toBe('ready');
    expect(service.isFavorite('a')).toBeTrue();
    expect(service.isFavorite('c')).toBeFalse();
  });

  it('✅ makes no request while nobody is signed in', () => {
    const service = create(null);

    expect(service.loadState()).toBe('idle');
    httpMock.expectNone(url('/favorites'));
  });

  it('✅ forgets the favorites on logout and loads the next user\'s own', () => {
    const service = create({ id: 'u1' });
    flushFavorites(['a']);

    user$.next(null);
    expect(service.favoriteIds().size).toBe(0);
    expect(service.loadState()).toBe('idle');

    user$.next({ id: 'u2' });
    flushFavorites(['z']);
    expect(service.isFavorite('a')).toBeFalse();
    expect(service.isFavorite('z')).toBeTrue();
  });

  it('✅ does not reload when the same user is re-announced (token refresh, guard navigation)', () => {
    create({ id: 'u1' });
    flushFavorites([]);

    user$.next({ id: 'u1' });

    httpMock.expectNone(url('/favorites'));
  });

  it('✅ a failed load can be retried', () => {
    const service = create({ id: 'u1' });
    httpMock.expectOne(url('/favorites')).flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.loadState()).toBe('failed');

    service.loadFavoriteIds();
    flushFavorites(['a']);

    expect(service.loadState()).toBe('ready');
    expect(service.isFavorite('a')).toBeTrue();
  });

  it('✅ add: POSTs, then the id is a favorite; the request opts out of the generic error toast', () => {
    const service = create({ id: 'u1' });
    flushFavorites([]);

    service.add('p1').subscribe();
    const req = httpMock.expectOne(url('/favorites/p1'));
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
    req.flush({}, { status: 201, statusText: 'Created' });

    expect(service.isFavorite('p1')).toBeTrue();
  });

  it('✅ add: 409 (already a favorite) counts as success — the detail page used to fail here', () => {
    const service = create({ id: 'u1' });
    flushFavorites([]);
    let failed = false;

    service.add('p1').subscribe({ error: () => (failed = true) });
    httpMock.expectOne(url('/favorites/p1')).flush({}, { status: 409, statusText: 'Conflict' });

    expect(failed).toBeFalse();
    expect(service.isFavorite('p1')).toBeTrue();
  });

  it('✅ add: any other failure is an error and the id is not added', () => {
    const service = create({ id: 'u1' });
    flushFavorites([]);
    let failed = false;

    service.add('p1').subscribe({ error: () => (failed = true) });
    httpMock.expectOne(url('/favorites/p1')).flush({}, { status: 500, statusText: 'Server Error' });

    expect(failed).toBeTrue();
    expect(service.isFavorite('p1')).toBeFalse();
  });

  it('✅ remove: DELETE removes the id; 404 (not a favorite) counts as success', () => {
    const service = create({ id: 'u1' });
    flushFavorites(['p1', 'p2']);

    service.remove('p1').subscribe();
    const req = httpMock.expectOne(url('/favorites/p1'));
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(service.isFavorite('p1')).toBeFalse();

    let failed = false;
    service.remove('p2').subscribe({ error: () => (failed = true) });
    httpMock.expectOne(url('/favorites/p2')).flush({}, { status: 404, statusText: 'Not Found' });
    expect(failed).toBeFalse();
    expect(service.isFavorite('p2')).toBeFalse();
  });

  it('✅ toggleFavorite adds a non-favorite and removes a favorite, emitting the new state', () => {
    const service = create({ id: 'u1' });
    flushFavorites(['p1']);
    const states: boolean[] = [];

    service.toggleFavorite('p1').subscribe(s => states.push(s));
    httpMock.expectOne(url('/favorites/p1')).flush(null, { status: 204, statusText: 'No Content' });
    service.toggleFavorite('p2').subscribe(s => states.push(s));
    httpMock.expectOne(url('/favorites/p2')).flush({}, { status: 201, statusText: 'Created' });

    expect(states).toEqual([false, true]);
  });

  it('✅ GET /favorites (e.g. from the favorites page) refreshes the shared set too', () => {
    const service = create({ id: 'u1' });
    flushFavorites(['a']);

    service.getFavorites().subscribe();
    flushFavorites(['a', 'b']);

    expect(service.isFavorite('b')).toBeTrue();
  });
});

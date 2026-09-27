import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ProfileService } from './profile.service';

describe('ProfileService — loadFailed$', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;
  let failed: boolean | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
    service.loadFailed$.subscribe(v => (failed = v));
  });

  afterEach(() => httpMock.verify());

  it('✅ يبدأ false، يصبح true عند فشل /users/me، ويعود false عند نجاح لاحق', () => {
    expect(failed).toBeFalse();

    service.getMe().subscribe({ error: () => undefined });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(failed).toBeTrue();

    service.refresh().subscribe();
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1', email: 'a@example.com' });
    expect(failed).toBeFalse();
  });

  it('✅ clearCache (تسجيل الخروج) يعيد الحالة إلى false', () => {
    service.getMe().subscribe({ error: () => undefined });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({}, { status: 500, statusText: 'Server Error' });

    service.clearCache();

    expect(failed).toBeFalse();
  });
});

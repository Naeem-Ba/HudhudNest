import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { NotificationPreferences } from '../../core/api/notification-preferences-api.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { NotificationSettingsCardComponent } from './notification-settings-card.component';

describe('NotificationSettingsCardComponent', () => {
  const url = `${environment.apiUrl}/notifications/preferences`;
  const base: NotificationPreferences = {
    mutedCategories: [],
    pushMutedCategories: [],
    pushPreview: 'Generic',
    quietStartMinute: null,
    quietEndMinute: null,
    timeZoneId: null,
    categories: [{ id: 'listings', mutable: true }, { id: 'account', mutable: false }]
  };
  let httpMock: HttpTestingController;

  function create(signedIn: boolean) {
    TestBed.configureTestingModule({
      imports: [NotificationSettingsCardComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PreferencesService, useValue: { isSignedIn: signedIn } }
      ]
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(NotificationSettingsCardComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('shows nothing and calls nothing for a signed-out visitor', () => {
    const fixture = create(false);
    httpMock.expectNone(url);
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('offers no switch for mandatory categories', () => {
    const fixture = create(true);
    httpMock.expectOne(url).flush(base);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#ns-app-listings')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#ns-app-account')).toBeNull();
  });

  it('switching a category off sends it in the muted list and takes the answer from the server', () => {
    const fixture = create(true);
    httpMock.expectOne(url).flush(base);
    fixture.detectChanges();

    const box: HTMLInputElement = fixture.nativeElement.querySelector('#ns-app-listings');
    box.checked = false;
    box.dispatchEvent(new Event('change'));

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mutedCategories: ['listings'] });
    req.flush({ ...base, mutedCategories: ['listings'] });
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('#ns-push-listings') as HTMLInputElement).disabled).toBeTrue();
  });

  it('turning quiet hours on sends a default window and the device time zone', () => {
    const fixture = create(true);
    httpMock.expectOne(url).flush(base);
    fixture.detectChanges();

    const box: HTMLInputElement = fixture.nativeElement.querySelector('.ns__check input');
    box.checked = true;
    box.dispatchEvent(new Event('change'));

    const body = httpMock.expectOne(url).request.body;
    expect(body.quietHoursEnabled).toBeTrue();
    expect(body.quietStartMinute).toBe(1320);
    expect(body.quietEndMinute).toBe(420);
    expect(typeof body.timeZoneId === 'string' || body.timeZoneId === undefined).toBeTrue();
  });

  it('re-reads the saved state when a save fails', () => {
    const fixture = create(true);
    httpMock.expectOne(url).flush(base);
    fixture.detectChanges();

    const box: HTMLInputElement = fixture.nativeElement.querySelector('#ns-app-listings');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    httpMock.expectOne(r => r.method === 'PUT').flush({}, { status: 500, statusText: 'x' });
    httpMock.expectOne(r => r.method === 'GET').flush(base);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('#ns-app-listings') as HTMLInputElement).checked).toBeTrue();
  });
});

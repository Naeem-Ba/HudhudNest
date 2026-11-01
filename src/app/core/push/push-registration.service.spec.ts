import { HttpContext } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { BackendApiService } from '../api/backend-api.service';
import { AuthService } from '../auth/auth.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { PushNativeGateway } from './push-native.gateway';
import { PushRegistrationService } from './push-registration.service';

describe('PushRegistrationService', () => {
  let api: jasmine.SpyObj<BackendApiService>;
  let native: jasmine.SpyObj<PushNativeGateway>;
  let loggedIn: BehaviorSubject<boolean>;
  let tapped: ((data: Record<string, string>) => void) | undefined;
  let refreshed: ((token: string) => void) | undefined;
  let router: jasmine.SpyObj<Router>;

  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    api = jasmine.createSpyObj<BackendApiService>('BackendApiService', ['post']);
    api.post.and.returnValue(of(void 0));
    native = jasmine.createSpyObj<PushNativeGateway>('PushNativeGateway', [
      'isNativePlatform', 'platform', 'checkPermission', 'requestPermission', 'ensureAndroidChannel', 'getToken',
      'deleteToken', 'onTokenRefresh', 'onNotificationTapped'
    ]);
    native.checkPermission.and.resolveTo('granted');
    native.ensureAndroidChannel.and.resolveTo();
    native.isNativePlatform.and.returnValue(true);
    native.platform.and.returnValue('android');
    native.requestPermission.and.resolveTo(true);
    native.getToken.and.resolveTo('fcm-token-1');
    native.deleteToken.and.resolveTo();
    native.onTokenRefresh.and.callFake(async cb => { refreshed = cb; });
    native.onNotificationTapped.and.callFake(async cb => { tapped = cb; });
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl', 'navigate']);
    router.navigate.and.resolveTo(true);
    loggedIn = new BehaviorSubject<boolean>(false);

    TestBed.configureTestingModule({
      providers: [
        { provide: BackendApiService, useValue: api },
        { provide: PushNativeGateway, useValue: native },
        { provide: AuthService, useValue: { isLoggedIn$: loggedIn.asObservable() } },
        { provide: Router, useValue: router },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    });
  });

  it('does nothing on the web', async () => {
    native.isNativePlatform.and.returnValue(false);
    const service = TestBed.inject(PushRegistrationService);

    service.start();
    loggedIn.next(true);
    await flush();

    expect(native.checkPermission).not.toHaveBeenCalled();
    expect(native.requestPermission).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('registers the FCM token with its platform once the user is signed in', async () => {
    TestBed.inject(PushRegistrationService).start();

    loggedIn.next(true);
    await flush();

    expect(api.post).toHaveBeenCalledWith(
      '/devices/push-token',
      { token: 'fcm-token-1', platform: 'android' },
      jasmine.objectContaining({ context: jasmine.any(HttpContext) })
    );
    // Push is a convenience: a failing registration never toasts "server error" on app open.
    const options = api.post.calls.mostRecent().args[2] as { context: HttpContext };
    expect(options.context.get(SKIP_ERROR_TOAST)).toBeTrue();
  });

  it('creates the Android channel before it asks Firebase for the token', async () => {
    const order: string[] = [];
    native.ensureAndroidChannel.and.callFake(async () => { order.push('channel'); });
    native.getToken.and.callFake(async () => { order.push('token'); return 'fcm-token-1'; });
    TestBed.inject(PushRegistrationService).start();

    loggedIn.next(true);
    await flush();

    expect(order).toEqual(['channel', 'token']);
  });

  it('still registers when creating the channel fails', async () => {
    native.ensureAndroidChannel.and.rejectWith(new Error('no channel'));
    TestBed.inject(PushRegistrationService).start();

    loggedIn.next(true);
    await flush();

    expect(api.post).toHaveBeenCalledWith('/devices/push-token', { token: 'fcm-token-1', platform: 'android' }, jasmine.anything());
  });

  it('never shows the system dialog at sign-in: not yet asked means the person is offered a button instead', async () => {
    native.checkPermission.and.resolveTo('prompt');
    const service = TestBed.inject(PushRegistrationService);
    service.start();

    loggedIn.next(true);
    await flush();

    expect(native.requestPermission).not.toHaveBeenCalled();
    expect(native.getToken).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(service.permission()).toBe('prompt');
  });

  it('enable() shows the system dialog and registers the device when the person agrees', async () => {
    native.checkPermission.and.resolveTo('prompt');
    const service = TestBed.inject(PushRegistrationService);
    service.start();
    loggedIn.next(true);
    await flush();

    const granted = await service.enable();

    expect(granted).toBeTrue();
    expect(native.requestPermission).toHaveBeenCalledTimes(1);
    expect(service.permission()).toBe('granted');
    expect(api.post).toHaveBeenCalledWith('/devices/push-token', { token: 'fcm-token-1', platform: 'android' }, jasmine.anything());
  });

  it('enable() registers nothing and remembers the refusal when the person says no', async () => {
    native.checkPermission.and.resolveTo('prompt');
    native.requestPermission.and.resolveTo(false);
    const service = TestBed.inject(PushRegistrationService);
    service.start();
    loggedIn.next(true);
    await flush();

    const granted = await service.enable();

    expect(granted).toBeFalse();
    expect(service.permission()).toBe('denied');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('enable() does nothing on the web', async () => {
    native.isNativePlatform.and.returnValue(false);
    const service = TestBed.inject(PushRegistrationService);

    expect(await service.enable()).toBeFalse();
    expect(native.requestPermission).not.toHaveBeenCalled();
    expect(service.permission()).toBe('unknown');
  });

  it('registers nothing when notifications are refused in the system settings', async () => {
    native.checkPermission.and.resolveTo('denied');
    TestBed.inject(PushRegistrationService).start();

    loggedIn.next(true);
    await flush();

    expect(native.getToken).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('re-sends a rotated token', async () => {
    TestBed.inject(PushRegistrationService).start();
    loggedIn.next(true);
    await flush();

    refreshed?.('fcm-token-2');
    await flush();

    expect(api.post).toHaveBeenCalledWith(
      '/devices/push-token',
      { token: 'fcm-token-2', platform: 'android' },
      jasmine.objectContaining({ context: jasmine.any(HttpContext) })
    );
  });

  it('opens the notifications page when a push without a target is tapped', async () => {
    TestBed.inject(PushRegistrationService).start();
    loggedIn.next(true);
    await flush();

    tapped?.({});

    expect(router.navigate).toHaveBeenCalledWith(['/notifications']);
  });

  it('opens the screen the push is about when the server sent a target', async () => {
    TestBed.inject(PushRegistrationService).start();
    loggedIn.next(true);
    await flush();
    const propertyId = '3f2b8c1e-9d4a-4c55-8f0a-1b2c3d4e5f60';

    tapped?.({ type: 'NewMessage', targetKind: 'messages', propertyId, relatedEntityId: '11111111-2222-4333-8444-555555555555' });

    expect(router.navigate).toHaveBeenCalledWith(['/messages', propertyId]);
  });

  it('never builds a route from an id that is not a GUID', async () => {
    TestBed.inject(PushRegistrationService).start();
    loggedIn.next(true);
    await flush();

    tapped?.({ type: 'NewMessage', targetKind: 'messages', propertyId: '../admin/users' });

    expect(router.navigate).toHaveBeenCalledWith(['/messages']);
  });

  it('revokes the token on the server and on the device at sign-out', async () => {
    const service = TestBed.inject(PushRegistrationService);
    service.start();
    loggedIn.next(true);
    await flush();
    api.post.calls.reset();

    await new Promise<void>(resolve => service.revoke().subscribe({ complete: resolve }));

    expect(api.post).toHaveBeenCalledWith(
      '/devices/push-token/revoke',
      { token: 'fcm-token-1' },
      jasmine.objectContaining({ context: jasmine.any(HttpContext) })
    );
    expect(native.deleteToken).toHaveBeenCalled();
  });

  it('never blocks sign-out when the revoke call fails', async () => {
    const service = TestBed.inject(PushRegistrationService);
    service.start();
    loggedIn.next(true);
    await flush();
    api.post.and.returnValue(throwError(() => new Error('offline')));
    let completed = false;

    await new Promise<void>(resolve => service.revoke().subscribe({ complete: () => { completed = true; resolve(); } }));

    expect(completed).toBeTrue();
  });

  it('does not call the API on revoke when nothing was registered', async () => {
    const service = TestBed.inject(PushRegistrationService);

    await new Promise<void>(resolve => service.revoke().subscribe({ complete: resolve }));

    expect(api.post).not.toHaveBeenCalled();
  });
});

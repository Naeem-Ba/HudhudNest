import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import { BackendApiService } from '../api/backend-api.service';
import { ProfileService, UserProfile } from '../api/profile.service';
import { AuthService } from '../auth/auth.service';
import { LanguageService } from './language.service';
import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  let api: jasmine.SpyObj<BackendApiService>;
  let profiles: BehaviorSubject<UserProfile | null>;
  let users: BehaviorSubject<{ id: string } | null>;
  let profileService: { profile$: Observable<UserProfile | null>; refresh: jasmine.Spy };
  let language: LanguageService;
  let service: PreferencesService;

  const accountProfile = (over: Partial<UserProfile> = {}): UserProfile => ({
    Id: 'u1',
    PreferredLanguage: 'en',
    PreferredCurrency: 'EUR',
    HasChosenLanguage: false,
    HasChosenCurrency: false,
    ...over
  });

  beforeEach(() => {
    ['lang', 'lang_auto', 'currency', 'prefs:u1', 'prefs:u2'].forEach(k => localStorage.removeItem(k));

    api = jasmine.createSpyObj<BackendApiService>('BackendApiService', ['put', 'post', 'get']);
    api.put.and.returnValue(of(void 0));
    profiles = new BehaviorSubject<UserProfile | null>(null);
    users = new BehaviorSubject<{ id: string } | null>(null);
    profileService = { profile$: profiles.asObservable(), refresh: jasmine.createSpy('refresh').and.returnValue(of(accountProfile())) };

    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['addLangs', 'use', 'setFallbackLang', 'setDefaultLang']);
    spyOnProperty(navigator, 'languages', 'get').and.returnValue(['en-US']);

    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: translate },
        { provide: BackendApiService, useValue: api },
        { provide: ProfileService, useValue: profileService },
        { provide: AuthService, useValue: { currentUser$: users.asObservable() } }
      ]
    });

    language = TestBed.inject(LanguageService);
    service = TestBed.inject(PreferencesService);
    service.start();
  });

  afterEach(() => {
    ['lang', 'lang_auto', 'currency', 'prefs:u1', 'prefs:u2'].forEach(k => localStorage.removeItem(k));
  });

  function signIn(id: string, profile: UserProfile): void {
    users.next({ id });
    profiles.next(profile);
  }

  it('applies the account language after sign-in, without writing the device-wide key', () => {
    signIn('u1', accountProfile({ PreferredLanguage: 'de', HasChosenLanguage: true }));

    expect(language.getCurrent()).toBe('de');
    expect(localStorage.getItem('lang')).toBeNull();
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('applies an Arabic account language and flips the page to RTL', () => {
    signIn('u1', accountProfile({ PreferredLanguage: 'ar', HasChosenLanguage: true }));

    expect(language.getCurrent()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('does not treat the server default as a choice: uploads what this device already chose instead', () => {
    language.use('de', 'user');

    signIn('u1', accountProfile({ PreferredLanguage: 'en', HasChosenLanguage: false }));

    expect(api.put).toHaveBeenCalledWith('/users/me/preferences', { preferredLanguage: 'de' });
    expect(language.getCurrent()).toBe('de');
  });

  it('uploads nothing and keeps the device language when neither side has chosen', () => {
    signIn('u1', accountProfile());

    expect(api.put).not.toHaveBeenCalled();
  });

  it('keeps language and currency independent: a currency change does not touch the language', () => {
    signIn('u1', accountProfile({ PreferredLanguage: 'de', HasChosenLanguage: true }));

    service.setCurrency('USD').subscribe();

    expect(api.put).toHaveBeenCalledWith('/users/me/preferences', { preferredCurrency: 'USD' });
    expect(language.getCurrent()).toBe('de');
    expect(service.currency).toBe('USD');
  });

  it('keeps currency unchanged when the language changes', () => {
    signIn('u1', accountProfile({ PreferredCurrency: 'SYP', HasChosenCurrency: true }));

    service.setLanguage('ar').subscribe();

    expect(api.put).toHaveBeenCalledWith('/users/me/preferences', { preferredLanguage: 'ar' });
    expect(service.currency).toBe('SYP');
  });

  it('saves first and applies on success when signed in', () => {
    signIn('u1', accountProfile({ PreferredLanguage: 'ar', HasChosenLanguage: true }));

    service.setLanguage('de').subscribe();

    expect(api.put).toHaveBeenCalledWith('/users/me/preferences', { preferredLanguage: 'de' });
    expect(language.getCurrent()).toBe('de');
    expect(service.saveState()).toBe('idle');
  });

  it('keeps the old language, reports the error and says it failed when the save fails', () => {
    signIn('u1', accountProfile({ PreferredLanguage: 'ar', HasChosenLanguage: true }));
    api.put.and.returnValue(throwError(() => new Error('offline')));
    let failed = false;

    service.setLanguage('de').subscribe({ error: () => (failed = true) });

    expect(failed).toBeTrue();
    expect(language.getCurrent()).toBe('ar');
    expect(service.saveState()).toBe('error');
  });

  it('keeps the old currency when the save fails', () => {
    signIn('u1', accountProfile({ PreferredCurrency: 'EUR', HasChosenCurrency: true }));
    api.put.and.returnValue(throwError(() => new Error('offline')));

    service.setCurrency('USD').subscribe({ error: () => undefined });

    expect(service.currency).toBe('EUR');
  });

  it('as a guest, remembers the choice on this device only and calls no API', () => {
    service.setLanguage('de').subscribe();
    service.setCurrency('TRY').subscribe();

    expect(api.put).not.toHaveBeenCalled();
    expect(localStorage.getItem('lang')).toBe('de');
    expect(localStorage.getItem('currency')).toBe('TRY');
  });

  it('puts the guest language and currency back on sign-out, so an account never leaks into the next visitor', () => {
    localStorage.setItem('lang', 'ar');
    localStorage.setItem('currency', 'SYP');
    language.restoreGuestLanguage();
    signIn('u1', accountProfile({ PreferredLanguage: 'de', PreferredCurrency: 'USD', HasChosenLanguage: true, HasChosenCurrency: true }));
    expect(language.getCurrent()).toBe('de');
    expect(service.currency).toBe('USD');

    users.next(null);
    profiles.next(null);

    expect(language.getCurrent()).toBe('ar');
    expect(service.currency).toBe('SYP');
    expect(localStorage.getItem('lang')).toBe('ar');
  });

  it('gives a second account on the same device its own values, not the first account\'s', () => {
    signIn('u1', accountProfile({ PreferredLanguage: 'de', PreferredCurrency: 'USD', HasChosenLanguage: true, HasChosenCurrency: true }));
    users.next(null);
    profiles.next(null);

    signIn('u2', { ...accountProfile({ PreferredLanguage: 'ar', PreferredCurrency: 'SYP', HasChosenLanguage: true, HasChosenCurrency: true }), Id: 'u2' });

    expect(language.getCurrent()).toBe('ar');
    expect(service.currency).toBe('SYP');
  });

  it('shows an account\'s cached language at once on reload, before /users/me answers', () => {
    localStorage.setItem('prefs:u1', JSON.stringify({ lang: 'de', currency: 'USD' }));

    users.next({ id: 'u1' });

    expect(language.getCurrent()).toBe('de');
    expect(service.currency).toBe('USD');
  });

  it('ignores an unsupported cached value', () => {
    localStorage.setItem('prefs:u1', JSON.stringify({ lang: 'xx', currency: 'ZZZ' }));

    users.next({ id: 'u1' });

    expect(service.currency).toBeNull();
  });
});

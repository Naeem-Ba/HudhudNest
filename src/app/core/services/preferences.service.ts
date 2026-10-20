import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, of, switchMap, tap } from 'rxjs';

import { BackendApiService } from '../api/backend-api.service';
import { ProfileService, UserProfile } from '../api/profile.service';
import { AuthService } from '../auth/auth.service';
import { toSupportedLanguage } from '../i18n/first-visit-language';
import { CurrencyCode, toSupportedCurrency } from '../i18n/supported-preferences';
import { LangCode, LanguageService } from './language.service';

const GUEST_CURRENCY_KEY = 'currency';
const ACCOUNT_CACHE_PREFIX = 'prefs:';

interface CachedAccountPreferences {
  lang?: LangCode;
  currency?: CurrencyCode;
}

export type PreferencesSaveState = 'idle' | 'saving' | 'error';

/**
 * One owner for "which language and which display currency does this person want".
 *
 *  - Signed in: the account on the server is the truth (UserAccount.PreferredLanguage/-Currency,
 *    PUT /users/me/preferences). It is applied after /users/me loads and follows the person to every
 *    device. A change is saved FIRST and applied on success, so the screen never claims a choice the
 *    server does not have; a failed save is reported and the old value stays.
 *  - Never chosen on the account (HasChosen* false -- the server default is not a choice): the choice
 *    this device already made is uploaded once instead of being overwritten by the default.
 *  - Signed out: the device-wide keys (LanguageService `lang`, `currency` here) apply. An account's
 *    values are shown with LanguageService persistence 'account', which never touches those keys, and
 *    are cached per user id (only to avoid a flash of the wrong language on reload), so one account
 *    can never leak its language or currency to another account or to the guest on the same device.
 *
 * Language and currency are independent: neither setter touches the other.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly api = inject(BackendApiService);
  private readonly profileService = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly languageService = inject(LanguageService);

  private readonly currencySubject = new BehaviorSubject<CurrencyCode | null>(this.readGuestCurrency());
  /** The chosen display currency, or null when none was ever chosen (prices then stay in their own currency). */
  readonly currency$ = this.currencySubject.asObservable();

  readonly saveState = signal<PreferencesSaveState>('idle');

  private activeUserId: string | null = null;
  private started = false;

  /** Idempotent. Called once from the app root. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    // The token names the user synchronously, before /users/me answers: apply the cached values now.
    this.auth.currentUser$.subscribe(user => this.onSessionUser(user?.id ? String(user.id) : null));

    this.profileService.profile$.subscribe(profile => {
      if (profile) {
        this.reconcile(profile);
      }
    });
  }

  get currency(): CurrencyCode | null {
    return this.currencySubject.value;
  }

  get isSignedIn(): boolean {
    return this.activeUserId !== null;
  }

  setLanguage(lang: LangCode): Observable<void> {
    if (!this.activeUserId) {
      this.languageService.use(lang, 'user');
      return of(void 0);
    }

    const userId = this.activeUserId;
    return this.save({ preferredLanguage: lang }).pipe(
      tap(() => {
        this.languageService.use(lang, 'account');
        this.remember(userId, { lang });
      })
    );
  }

  setCurrency(currency: CurrencyCode): Observable<void> {
    if (!this.activeUserId) {
      this.writeGuestCurrency(currency);
      this.currencySubject.next(currency);
      return of(void 0);
    }

    const userId = this.activeUserId;
    return this.save({ preferredCurrency: currency }).pipe(
      tap(() => {
        this.currencySubject.next(currency);
        this.remember(userId, { currency });
      })
    );
  }

  private save(body: { preferredLanguage?: string; preferredCurrency?: string }): Observable<void> {
    this.saveState.set('saving');

    return this.api.put<void>('/users/me/preferences', body).pipe(
      // Keep profile$ (HasChosen*) in step with the server; the reconcile it triggers is idempotent.
      switchMap(() => this.profileService.refresh()),
      tap({
        next: () => this.saveState.set('idle'),
        error: () => this.saveState.set('error')
      }),
      switchMap(() => of(void 0))
    );
  }

  private onSessionUser(userId: string | null): void {
    if (userId === this.activeUserId) {
      return;
    }

    const wasSignedIn = this.activeUserId !== null;
    this.activeUserId = userId;

    if (userId) {
      const cached = this.readCache(userId);
      if (cached.lang) {
        this.languageService.use(cached.lang, 'account');
      }
      this.currencySubject.next(cached.currency ?? null);
      return;
    }

    if (wasSignedIn) {
      // Signed out: the device goes back to its own (guest) language and currency.
      this.languageService.restoreGuestLanguage();
      this.currencySubject.next(this.readGuestCurrency());
    }
  }

  private reconcile(profile: UserProfile): void {
    const userId = String(profile.Id ?? profile.id ?? '');
    if (!userId || userId !== this.activeUserId) {
      return;
    }

    const serverLang = toSupportedLanguage(profile.PreferredLanguage);
    const serverCurrency = toSupportedCurrency(profile.PreferredCurrency);
    const cache: CachedAccountPreferences = {};
    const upload: { preferredLanguage?: string; preferredCurrency?: string } = {};

    if (profile.HasChosenLanguage && serverLang) {
      this.languageService.use(serverLang, 'account');
      cache.lang = serverLang;
    } else if (this.languageService.hasStoredPreference()) {
      upload.preferredLanguage = this.languageService.getCurrent();
    }

    if (profile.HasChosenCurrency && serverCurrency) {
      this.currencySubject.next(serverCurrency);
      cache.currency = serverCurrency;
    } else {
      const guest = this.readGuestCurrency();
      if (guest) {
        upload.preferredCurrency = guest;
      } else {
        this.currencySubject.next(null);
      }
    }

    this.remember(userId, cache);

    if (upload.preferredLanguage || upload.preferredCurrency) {
      // Once: after it succeeds the account has chosen values and this branch is not taken again.
      // A failure (offline) is silent here -- the device keeps showing its own choice and retries
      // on the next profile load.
      this.api.put<void>('/users/me/preferences', upload)
        .pipe(switchMap(() => this.profileService.refresh()))
        .subscribe({ error: () => undefined });
    }
  }

  private readGuestCurrency(): CurrencyCode | null {
    try {
      return toSupportedCurrency(localStorage.getItem(GUEST_CURRENCY_KEY));
    } catch {
      return null;
    }
  }

  private writeGuestCurrency(currency: CurrencyCode): void {
    try {
      localStorage.setItem(GUEST_CURRENCY_KEY, currency);
    } catch {
      // Storage unavailable: the choice holds for this session only.
    }
  }

  private readCache(userId: string): CachedAccountPreferences {
    try {
      const raw = localStorage.getItem(ACCOUNT_CACHE_PREFIX + userId);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as { lang?: string; currency?: string };
      return {
        lang: toSupportedLanguage(parsed.lang) ?? undefined,
        currency: toSupportedCurrency(parsed.currency) ?? undefined
      };
    } catch {
      return {};
    }
  }

  private remember(userId: string, patch: CachedAccountPreferences): void {
    try {
      const next = { ...this.readCache(userId), ...patch };
      localStorage.setItem(ACCOUNT_CACHE_PREFIX + userId, JSON.stringify(next));
    } catch {
      // Cache is only an optimisation.
    }
  }
}

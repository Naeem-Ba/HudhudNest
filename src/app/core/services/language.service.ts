import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { pickDeviceLanguage } from '../i18n/first-visit-language';
import { safeGetItem, safeRemoveItem, safeSetItem } from './safe-storage';

export type LangCode = 'en' | 'ar' | 'de' | 'tr';

/**
 * How a language change is remembered:
 *  - 'user'      the visitor chose it (language selector): stored under `lang`, overrides everything, forever;
 *  - 'auto'      detected for a first-time visitor (country / device): stored under `lang_auto` so the next
 *                visit does not repeat the lookup, but a later explicit choice still replaces it;
 *  - 'ephemeral' applied for this page load only (the device-language baseline while the country is looked up);
 *  - 'account'   the signed-in account's own language (PreferencesService): shown, but NEVER written to the
 *                device-wide keys above, so it cannot leak to the next visitor or account on this device.
 */
export type LangPersistence = 'user' | 'auto' | 'ephemeral' | 'account';

const USER_LANG_KEY = 'lang';
const AUTO_LANG_KEY = 'lang_auto';

interface LanguageOption {
  code: LangCode;
  label: string;
  dir: 'rtl' | 'ltr';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly languages: readonly LanguageOption[] = [
    { code: 'ar', label: 'العربية', dir: 'rtl' },
    { code: 'en', label: 'English', dir: 'ltr' },
    { code: 'de', label: 'Deutsch', dir: 'ltr' },
    { code: 'tr', label: 'Türkçe', dir: 'ltr' }
  ];

  private readonly langSubject = new BehaviorSubject<LangCode>('ar');
  readonly currentLang$ = this.langSubject.asObservable();

  private currentLang: LangCode = 'ar';

  constructor(private readonly translate: TranslateService) {
    this.translate.addLangs(this.languages.map(language => language.code));
    this.setFallbackLanguage('ar');
    this.init();
  }

  use(lang: LangCode, persistence: LangPersistence = 'user'): void {
    const normalizedLang = this.isSupported(lang) ? lang : 'ar';
    const dir = this.languages.find(item => item.code === normalizedLang)?.dir ?? 'rtl';

    this.currentLang = normalizedLang;
    this.langSubject.next(normalizedLang);

    this.translate.use(normalizedLang);

    if (persistence === 'user') {
      safeSetItem(USER_LANG_KEY, normalizedLang);
      safeRemoveItem(AUTO_LANG_KEY);
    } else if (persistence === 'auto') {
      safeSetItem(AUTO_LANG_KEY, normalizedLang);
    }

    document.documentElement.dir = dir;
    document.documentElement.lang = normalizedLang;
    document.body.classList.toggle('rtl', dir === 'rtl');
    document.body.classList.toggle('ltr', dir === 'ltr');
  }

  getCurrent(): LangCode {
    return this.currentLang;
  }

  getLanguages(): readonly LanguageOption[] {
    return this.languages;
  }

  /**
   * Back to what this device would show with nobody signed in: the visitor's own choice, else an earlier
   * automatic detection, else the device language. Called on sign-out so an account's language never
   * outlives its session.
   */
  restoreGuestLanguage(): void {
    this.init();
  }

  /** True only when the visitor picked a language themselves (not an earlier automatic detection). */
  hasUserChoice(): boolean {
    return this.readStored()?.persistence === 'user';
  }

  /** True when the visitor (or an earlier visit's detection) already settled on a language. */
  hasStoredPreference(): boolean {
    return this.readStored() !== null;
  }

  /** The browser/device language tags in preference order, e.g. ["ar-SY", "en-US"]. */
  getDeviceLanguages(): readonly string[] {
    if (typeof navigator === 'undefined') {
      return [];
    }

    return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
  }

  private init(): void {
    const stored = this.readStored();

    if (stored) {
      this.use(stored.lang, stored.persistence);
      return;
    }

    // First visit: show the device's own language right away. The country-based decision
    // (see resolveInitialLanguage in app.config.ts) replaces it before the first render when it differs.
    this.use(pickDeviceLanguage(this.getDeviceLanguages()) ?? 'ar', 'ephemeral');
  }

  private readStored(): { lang: LangCode; persistence: 'user' | 'auto' } | null {
    const userLang = safeGetItem(USER_LANG_KEY);
    if (this.isSupported(userLang)) {
      return { lang: userLang, persistence: 'user' };
    }

    const autoLang = safeGetItem(AUTO_LANG_KEY);
    if (this.isSupported(autoLang)) {
      return { lang: autoLang, persistence: 'auto' };
    }

    return null;
  }

  private isSupported(lang: string | null | undefined): lang is LangCode {
    return lang === 'ar' || lang === 'en' || lang === 'de' || lang === 'tr';
  }

  private setFallbackLanguage(lang: LangCode): void {
    const translateWithFallback = this.translate as TranslateService & {
      setFallbackLang?: (lang: string) => void;
      setDefaultLang?: (lang: string) => void;
    };

    if (typeof translateWithFallback.setFallbackLang === 'function') {
      translateWithFallback.setFallbackLang(lang);
      return;
    }

    translateWithFallback.setDefaultLang?.(lang);
  }
}

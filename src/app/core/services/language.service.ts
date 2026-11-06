import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

export type LangCode = 'en' | 'ar' | 'de';

/**
 * How a language change is remembered:
 *  - 'user'      the visitor chose it (language selector): stored under `lang`, overrides everything, forever;
 *  - 'ephemeral' applied for this page load only (the Arabic default, or a shared link's ?lang=);
 *  - 'account'   the signed-in account's own language (PreferencesService): shown, but NEVER written to the
 *                device-wide keys above, so it cannot leak to the next visitor or account on this device.
 */
export type LangPersistence = 'user' | 'ephemeral' | 'account';

const USER_LANG_KEY = 'lang';
/**
 * Earlier builds stored a country/device-detected language here. Arabic is now the default for everyone
 * who has not picked a language, so this key is no longer read; it is removed on start-up.
 */
const LEGACY_AUTO_LANG_KEY = 'lang_auto';
/** What a visitor sees until they pick a language themselves. */
export const DEFAULT_LANG: LangCode = 'ar';

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
    { code: 'de', label: 'Deutsch', dir: 'ltr' }
  ];

  private readonly langSubject = new BehaviorSubject<LangCode>('ar');
  readonly currentLang$ = this.langSubject.asObservable();

  private currentLang: LangCode = 'ar';

  constructor(private readonly translate: TranslateService) {
    this.translate.addLangs(this.languages.map(language => language.code));
    this.setFallbackLanguage(DEFAULT_LANG);
    this.init();
  }

  use(lang: LangCode, persistence: LangPersistence = 'user'): void {
    const normalizedLang = this.isSupported(lang) ? lang : 'ar';
    const dir = this.languages.find(item => item.code === normalizedLang)?.dir ?? 'rtl';

    this.currentLang = normalizedLang;
    this.langSubject.next(normalizedLang);

    this.translate.use(normalizedLang);

    if (persistence === 'user') {
      localStorage.setItem(USER_LANG_KEY, normalizedLang);
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
   * Back to what this device would show with nobody signed in: the visitor's own choice, else Arabic.
   * Called on sign-out so an account's language never
   * outlives its session.
   */
  restoreGuestLanguage(): void {
    this.init();
  }

  /** True only when the visitor picked a language themselves. */
  hasUserChoice(): boolean {
    return this.readStored() !== null;
  }

  /** Same as {@link hasUserChoice}: the only language this device remembers is the visitor's own choice. */
  hasStoredPreference(): boolean {
    return this.hasUserChoice();
  }

  private init(): void {
    this.forgetLegacyAutoLanguage();
    const stored = this.readStored();

    // Nobody picked a language on this device: Arabic, whatever the browser, device or country says.
    this.use(stored ?? DEFAULT_LANG, stored ? 'user' : 'ephemeral');
  }

  private readStored(): LangCode | null {
    const userLang = localStorage.getItem(USER_LANG_KEY);
    return this.isSupported(userLang) ? userLang : null;
  }

  private forgetLegacyAutoLanguage(): void {
    try {
      localStorage.removeItem(LEGACY_AUTO_LANG_KEY);
    } catch {
      /* storage unavailable (private mode): nothing to clean */
    }
  }

  private isSupported(lang: string | null | undefined): lang is LangCode {
    return lang === 'ar' || lang === 'en' || lang === 'de';
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

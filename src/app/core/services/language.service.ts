import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

export type LangCode = 'en' | 'ar' | 'de';

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
    this.setFallbackLanguage('ar');
    this.init();
  }

  use(lang: LangCode): void {
    const normalizedLang = this.isSupported(lang) ? lang : 'ar';
    const language = this.languages.find(item => item.code === normalizedLang) ?? this.languages[0];

    this.currentLang = normalizedLang;
    this.langSubject.next(normalizedLang);

    this.translate.use(normalizedLang);
    localStorage.setItem('lang', normalizedLang);

    document.documentElement.dir = language.dir;
    document.documentElement.lang = normalizedLang;
    document.body.classList.toggle('rtl', language.dir === 'rtl');
    document.body.classList.toggle('ltr', language.dir === 'ltr');
  }

  getCurrent(): LangCode {
    return this.currentLang;
  }

  getLanguages(): readonly LanguageOption[] {
    return this.languages;
  }

  private init(): void {
    const savedLang = localStorage.getItem('lang') as LangCode | null;
    const browserLang = this.translate.getBrowserLang() as LangCode | undefined;
    const initialLang = this.isSupported(savedLang) ? savedLang : this.isSupported(browserLang) ? browserLang : 'ar';

    this.use(initialLang);
  }

  private isSupported(lang: string | null | undefined): lang is LangCode {
    return lang === 'ar' || lang === 'en' || lang === 'de';
  }

  private setFallbackLanguage(lang: LangCode): void {
    const translateAny = this.translate as any;

    if (typeof translateAny.setFallbackLang === 'function') {
      translateAny.setFallbackLang(lang);
      return;
    }

    if (typeof translateAny.setDefaultLang === 'function') {
      translateAny.setDefaultLang(lang);
    }
  }
}

import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

export type LangCode = 'en' | 'ar' | 'de';

@Injectable({ providedIn: 'root' })
export class LanguageService {

  // مصدر واحد للحقيقة (Single Source of Truth)
  private readonly languages = [
    { code: 'en', label: 'English', dir: 'ltr' },
    { code: 'ar', label: 'العربية', dir: 'rtl' },
    { code: 'de', label: 'Deutsch', dir: 'ltr' }
  ] as const;

  // سنضيف هذا الـ Subject لمراقبة تغيير اللغة
  private langSubject = new BehaviorSubject<LangCode>('ar');
  currentLang$ = this.langSubject.asObservable();

  private currentLang: LangCode = 'ar';

  constructor(private translate: TranslateService) {
    this.init();
  }

  /** تهيئة اللغة عند تشغيل التطبيق */
  private init() {
    const saved = localStorage.getItem('lang') as LangCode | null;
    const lang = saved ?? 'en';
    this.use(lang);
  }

  /** تغيير اللغة */
  use(lang: LangCode) {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('lang', lang);

    // ضبط اتجاه الصفحة (مهم جدًا للعربية)
    const dir = this.languages.find(l => l.code === lang)?.dir ?? 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }

  /** اللغة الحالية */
  getCurrent(): LangCode {
    return this.langSubject.value;
  }

  /** جميع اللغات المدعومة */
  getLanguages() {
    return this.languages;
  }
}
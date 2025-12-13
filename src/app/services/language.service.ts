import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class LanguageService {

  defaultLang = 'ar';
  supported = ['en', 'ar', 'de'];

  constructor(private translate: TranslateService) {

    this.translate.addLangs(this.supported);
    this.translate.setDefaultLang(this.defaultLang);

    const saved = localStorage.getItem('lang');
    const browserLang = this.translate.getBrowserLang();

    const langToUse =
      saved ||
      (browserLang && this.supported.includes(browserLang) ? browserLang : this.defaultLang);

    this.use(langToUse);
  }

  use(lang: string) {
    if (!this.supported.includes(lang)) lang = this.defaultLang;

    this.translate.use(lang);
    localStorage.setItem('lang', lang);

    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }

  getCurrent() {
    return this.translate.currentLang || this.defaultLang;
  }
}
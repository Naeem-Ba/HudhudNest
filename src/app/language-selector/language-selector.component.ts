import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService, LangCode } from '../core/services/language.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="lang-selector">
      <h3>{{ 'COMMON.CHANGE_LANGUAGE' | translate }}</h3>

      <!--
        توليد أزرار اللغات ديناميكيًا
        بدون تكرار وبدون hardcode
      -->
      <button
        *ngFor="let lang of languages"
        (click)="changeLanguage(lang.code)"
        [disabled]="isCurrent(lang.code)"
      >
        {{ lang.label }}
      </button>
    </div>
  `,
  styles: [`
    .lang-selector {
      padding: 1rem;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    button {
      padding: 0.4rem 0.8rem;
      cursor: pointer;
    }

    button[disabled] {
      opacity: 0.6;
      cursor: default;
    }
  `]
})
export class LanguageSelectorComponent {

  /**
   * قائمة اللغات
   * يتم تهيئتها داخل constructor
   * لأن service لا يكون متاحًا قبل ذلك
   */
  languages: readonly {
    code: LangCode;
    label: string;
    dir: 'ltr' | 'rtl';
  }[];

  constructor(private langService: LanguageService) {
    // تهيئة اللغات بعد حقن الخدمة
    this.languages = this.langService.getLanguages();
  }

  /** تغيير اللغة */
  changeLanguage(code: LangCode): void {
    this.langService.use(code);
  }

  /** التحقق من اللغة الحالية */
  isCurrent(code: LangCode): boolean {
    return this.langService.getCurrent() === code;
  }
}
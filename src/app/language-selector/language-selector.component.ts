import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService } from '../services/language.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="lang-selector">
      <h3>{{ 'COMMON.CHANGE_LANGUAGE' | translate }}</h3>
      <button (click)="setLang('en')" [disabled]="isCurrent('en')">EN</button>
      <button (click)="setLang('ar')" [disabled]="isCurrent('ar')">AR</button>
    </div>
  `,
  styles: [`
    .lang-selector { padding: 1rem; }
    button { margin-right: 0.5rem; }
  `]
})
export class LanguageSelectorComponent {
  constructor(private lang: LanguageService) {}

  setLang(l: string) { this.lang.use(l); }
  isCurrent(l: string) { return this.lang.getCurrent() === l; }
}

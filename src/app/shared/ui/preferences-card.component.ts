import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { CurrencyCode, SUPPORTED_CURRENCIES, toSupportedCurrency } from '../../core/i18n/supported-preferences';
import { LangCode, LanguageService } from '../../core/services/language.service';
import { PreferencesService } from '../../core/services/preferences.service';

/**
 * Language and display-currency pickers. Works signed in (saved to the account, follows the person
 * to every device) and signed out (saved on this device). The two selects are independent: changing
 * one never touches the other.
 */
@Component({
  selector: 'app-preferences-card',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="prefs" aria-labelledby="prefs-title">
      <h3 id="prefs-title">{{ 'PREFERENCES.TITLE' | translate }}</h3>
      <p class="prefs__hint">{{ 'PREFERENCES.DESC' | translate }}</p>

      <div class="prefs__field">
        <label for="prefs-language">{{ 'PREFERENCES.LANGUAGE_LABEL' | translate }}</label>
        <select
          id="prefs-language"
          [value]="currentLang()"
          [disabled]="preferences.saveState() === 'saving'"
          (change)="onLanguage($any($event.target).value)">
          @for (language of languages; track language.code) {
            <option [value]="language.code" [selected]="language.code === currentLang()">{{ language.label }}</option>
          }
        </select>
      </div>

      <div class="prefs__field">
        <label for="prefs-currency">{{ 'PREFERENCES.CURRENCY_LABEL' | translate }}</label>
        <select
          id="prefs-currency"
          [value]="currency() ?? ''"
          [disabled]="preferences.saveState() === 'saving'"
          (change)="onCurrency($any($event.target).value)">
          @if (!currency()) {
            <option value="" selected>{{ 'PREFERENCES.CURRENCY_NONE' | translate }}</option>
          }
          @for (code of currencies; track code) {
            <option [value]="code" [selected]="code === currency()">{{ currencyLabel(code) }}</option>
          }
        </select>
        <p class="prefs__hint">{{ 'PREFERENCES.PRICES_NOTE' | translate }}</p>
      </div>

      <p class="prefs__hint">{{ 'PREFERENCES.NOTIFICATIONS_NOTE' | translate }}</p>
      @if (!preferences.isSignedIn) {
        <p class="prefs__hint">{{ 'PREFERENCES.GUEST_NOTE' | translate }}</p>
      }

      <p class="prefs__status" role="status" aria-live="polite">
        @switch (status()) {
          @case ('saving') { {{ 'PREFERENCES.SAVING' | translate }} }
          @case ('saved') { {{ 'PREFERENCES.SAVED' | translate }} }
          @case ('failed') { <span class="prefs__error">{{ 'PREFERENCES.SAVE_FAILED' | translate }}</span> }
        }
      </p>
    </section>
  `,
  styles: [`
    .prefs { display: grid; gap: 0.75rem; padding: 1rem 0; }
    .prefs h3 { margin: 0; }
    .prefs__field { display: grid; gap: 0.35rem; }
    .prefs select { padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid var(--border-color, #cfcfcf); background: var(--surface, #fff); color: inherit; font: inherit; min-height: 44px; }
    .prefs__hint { margin: 0; font-size: 0.85rem; opacity: 0.75; }
    .prefs__status { margin: 0; min-height: 1.2em; font-size: 0.9rem; }
    .prefs__error { color: var(--danger, #b3261e); }
  `]
})
export class PreferencesCardComponent {
  protected readonly preferences = inject(PreferencesService);
  private readonly languageService = inject(LanguageService);

  protected readonly languages = this.languageService.getLanguages();
  protected readonly currencies = SUPPORTED_CURRENCIES;

  protected readonly currentLang = toSignal(this.languageService.currentLang$, { initialValue: this.languageService.getCurrent() });
  protected readonly currency = toSignal(this.preferences.currency$, { initialValue: this.preferences.currency });
  protected readonly status = signal<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  private readonly displayNames = computed(() => {
    try {
      return new Intl.DisplayNames([this.currentLang()], { type: 'currency' });
    } catch {
      return null;
    }
  });

  /** "Euro (EUR)": the code is always shown, so two currencies that share a symbol ($, kr) never look alike. */
  protected currencyLabel(code: CurrencyCode): string {
    const name = this.displayNames()?.of(code);
    return name && name !== code ? `${name} (${code})` : code;
  }

  protected onLanguage(value: string): void {
    const lang = value as LangCode;
    if (lang === this.languageService.getCurrent()) {
      return;
    }
    this.status.set('saving');
    this.preferences.setLanguage(lang).subscribe({
      next: () => this.status.set('saved'),
      error: () => {
        this.status.set('failed');
        // The select shows what is actually in force: put it back.
        this.currentLangRefresh();
      }
    });
  }

  protected onCurrency(value: string): void {
    const code = toSupportedCurrency(value);
    if (!code || code === this.preferences.currency) {
      return;
    }
    this.status.set('saving');
    this.preferences.setCurrency(code).subscribe({
      next: () => this.status.set('saved'),
      error: () => {
        this.status.set('failed');
        const el = document.getElementById('prefs-currency') as HTMLSelectElement | null;
        if (el) {
          el.value = this.preferences.currency ?? '';
        }
      }
    });
  }

  private currentLangRefresh(): void {
    const el = document.getElementById('prefs-language') as HTMLSelectElement | null;
    if (el) {
      el.value = this.languageService.getCurrent();
    }
  }
}

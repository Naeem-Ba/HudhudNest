import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

/**
 * The one required, never-pre-checked "I agree to the Terms of Use and acknowledge that I have
 * read the Privacy Policy" checkbox shared by every registration form (email, phone, and the
 * combined login/register page). Added for docs/privacy/privacy-gaps.md (P1): none of the
 * registration forms had any consent checkbox at all before this — a user could create an
 * account without ever being shown a link to either document.
 *
 * The sentence is localized (CONSENT.* keys in ar/en/de.json) and split into LEAD / link /
 * MIDDLE / link / TRAIL so each language keeps its own word order (German puts the verb after
 * the first link) while both links stay real, keyboard-reachable anchors.
 *
 * This is the required legal consent only. Marketing consent, if it is ever added, must be a
 * separate, optional control — never folded into this one.
 *
 * Deliberately a plain [checked]/(checkedChange) pair rather than a ControlValueAccessor:
 * the three host forms have unrelated FormGroup shapes, and this keeps wiring it into each
 * of them a one-line addition instead of a form-schema change.
 */
@Component({
  selector: 'app-consent-checkbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslateModule],
  template: `
    <label class="consent-checkbox">
      <input
        type="checkbox"
        class="consent-checkbox__input"
        [checked]="checked"
        (change)="onToggle($event)"
        [attr.aria-required]="true"
      />
      <span class="consent-checkbox__label">
        {{ 'CONSENT.LEAD' | translate }}
        <a routerLink="/terms-of-service" target="_blank" rel="noopener">{{ 'CONSENT.TERMS' | translate }}<span class="consent-checkbox__sr"> {{ 'CONSENT.OPENS_NEW_TAB' | translate }}</span></a>
        {{ 'CONSENT.MIDDLE' | translate }}
        <a routerLink="/privacy-policy" target="_blank" rel="noopener">{{ 'CONSENT.PRIVACY' | translate }}<span class="consent-checkbox__sr"> {{ 'CONSENT.OPENS_NEW_TAB' | translate }}</span></a>{{ 'CONSENT.TRAIL' | translate }}
      </span>
    </label>
  `,
  styles: [`
    .consent-checkbox {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      cursor: pointer;
      font-size: var(--text-sm, 0.875rem);
      color: var(--gray-600, #4b5563);
      line-height: 1.6;
      /* A finger needs a 44px row, and the box itself must not be a 17px speck (WCAG 2.5.8 / Apple HIG). */
      min-height: 44px;
      padding-block: 0.25rem;
    }

    .consent-checkbox__input {
      margin-top: 0.1rem;
      flex-shrink: 0;
      width: 1.5rem;
      height: 1.5rem;
      cursor: pointer;
    }

    .consent-checkbox__input:focus-visible,
    .consent-checkbox__label a:focus-visible {
      outline: 2px solid var(--primary, #D6A84F);
      outline-offset: 2px;
      border-radius: 2px;
    }

    .consent-checkbox__label a {
      color: var(--primary-text, #8a6414);
      font-weight: 600;
      text-decoration: underline;
    }

    .consent-checkbox__sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `]
})
export class ConsentCheckboxComponent {
  @Input() checked = false;
  @Output() checkedChange = new EventEmitter<boolean>();

  onToggle(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.checked = value;
    this.checkedChange.emit(value);
  }
}

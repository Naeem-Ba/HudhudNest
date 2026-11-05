import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import {
  PASSWORD_POLICY_RULES,
  PASSWORD_POLICY_RULES_WITH_PERSONAL,
  PasswordPersonalContext,
  getPasswordPolicyViolations
} from '../../core/auth/password-policy';

/**
 * The live checklist under a "new password" field: one line per server rule, ticked as the person
 * types. It replaces the old strength meter, whose labels were hard-coded Arabic (English and German
 * visitors read Arabic rule names) and which did not know the server's rules.
 *
 * `personal` adds "does not contain your name, e-mail or phone number" for forms that know who is
 * registering. The rule list never shows a rule the form cannot check.
 */
@Component({
  selector: 'app-password-rules',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    <ul class="password-rules" aria-live="polite" [attr.id]="listId">
      @for (rule of rules; track rule) {
        <li [class.is-met]="isMet(rule)">
          <span class="mark" aria-hidden="true">{{ isMet(rule) ? '✓' : '•' }}</span>
          <span>{{ 'AUTH.PASSWORD_RULES.' + rule | translate }}</span>
          <span class="visually-hidden">{{ (isMet(rule) ? 'AUTH.PASSWORD_RULE_MET' : 'AUTH.PASSWORD_RULE_UNMET') | translate }}</span>
        </li>
      }
    </ul>
  `,
  styles: [`
    .password-rules {
      list-style: none;
      margin: .5rem 0 0;
      padding: 0;
      display: grid;
      gap: .2rem;
      font-size: var(--text-xs, .75rem);
      color: var(--gray-500, #64748b);
    }

    .password-rules li {
      display: flex;
      align-items: center;
      gap: .4rem;
    }

    .password-rules .mark {
      flex: 0 0 auto;
      width: 1em;
      text-align: center;
    }

    .password-rules li.is-met {
      color: var(--success-text);
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `]
})
export class PasswordRulesComponent {
  @Input() password = '';
  @Input() context: PasswordPersonalContext | null = null;
  /** Include the "no personal details" rule. */
  @Input() personal = false;
  @Input() listId: string | null = null;

  get rules(): readonly string[] {
    return this.personal ? PASSWORD_POLICY_RULES_WITH_PERSONAL : PASSWORD_POLICY_RULES;
  }

  /** An empty field has met nothing: the "no violations" answer for '' is only PASSWORD_REQUIRED. */
  isMet(rule: string): boolean {
    if (!this.password) {
      return false;
    }

    return !getPasswordPolicyViolations(this.password, this.context).includes(rule);
  }
}

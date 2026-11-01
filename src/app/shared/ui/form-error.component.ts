import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AbstractControl } from '@angular/forms';

@Component({
  selector: 'app-form-error',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="form-error" *ngIf="shouldShow()">
      <span aria-hidden="true">⚠️</span>
      {{ getMessage() }}
    </p>
  `,
  styles: [`
    .form-error {
      display: flex;
      align-items: center;
      gap: .35rem;
      margin: .35rem 0 0;
      color: var(--danger);
      font-size: .875rem;
      line-height: 1.45;
    }
  `]
})
export class FormErrorComponent {
  private readonly translate = inject(TranslateService);

  @Input() control: AbstractControl | null | undefined;
  @Input() submitted = false;
  @Input() messages: Record<string, string> = {};

  shouldShow(): boolean {
    return !!this.control && this.control.invalid && (this.control.touched || this.control.dirty || this.submitted);
  }

  getMessage(): string {
    const errors = this.control?.errors ?? {};
    const firstKey = Object.keys(errors)[0];

    if (!firstKey) {
      return this.translate.instant('VALIDATION.INVALID');
    }

    if (this.messages[firstKey]) {
      return this.messages[firstKey];
    }

    switch (firstKey) {
      case 'required':
        return this.translate.instant('VALIDATION.REQUIRED');
      case 'email':
        return this.translate.instant('VALIDATION.EMAIL');
      case 'minlength': {
        const n = errors['minlength']?.requiredLength;
        return n ? this.translate.instant('VALIDATION.MIN_LENGTH', { n }) : this.translate.instant('VALIDATION.TOO_SHORT');
      }
      case 'maxlength': {
        const n = errors['maxlength']?.requiredLength;
        return n ? this.translate.instant('VALIDATION.MAX_LENGTH', { n }) : this.translate.instant('VALIDATION.TOO_LONG');
      }
      case 'min':
        return this.translate.instant('VALIDATION.MIN_VALUE', { n: errors['min']?.min });
      case 'max':
        return this.translate.instant('VALIDATION.MAX_VALUE', { n: errors['max']?.max });
      case 'pattern':
        return this.translate.instant('VALIDATION.PATTERN');
      default:
        return this.translate.instant('VALIDATION.INVALID');
    }
  }
}

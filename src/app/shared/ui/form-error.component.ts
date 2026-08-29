import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
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
      return 'القيمة غير صحيحة.';
    }

    if (this.messages[firstKey]) {
      return this.messages[firstKey];
    }

    if (firstKey === 'required') {
      return 'هذا الحقل مطلوب.';
    }

    if (firstKey === 'email') {
      return 'البريد الإلكتروني غير صحيح.';
    }

    if (firstKey === 'minlength') {
      const requiredLength = errors['minlength']?.requiredLength;
      return requiredLength ? `يجب إدخال ${requiredLength} أحرف على الأقل.` : 'القيمة قصيرة جدًا.';
    }

    if (firstKey === 'maxlength') {
      const requiredLength = errors['maxlength']?.requiredLength;
      return requiredLength ? `يجب ألا تتجاوز القيمة ${requiredLength} حرفًا.` : 'القيمة طويلة جدًا.';
    }

    if (firstKey === 'min') {
      return `يجب أن تكون القيمة أكبر من أو تساوي ${errors['min']?.min}.`;
    }

    if (firstKey === 'max') {
      return `يجب أن تكون القيمة أقل من أو تساوي ${errors['max']?.max}.`;
    }

    if (firstKey === 'pattern') {
      return 'الصيغة غير صحيحة.';
    }

    return 'القيمة غير صحيحة.';
  }
}

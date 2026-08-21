import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PasswordValidatorService, PasswordRequirements } from '../../core/services/password-validator.service';

/**
 * مكون عرض قوة كلمة المرور ومتطلباتها
 * يساعد المستخدم على فهم ما يحتاجه لكلمة مرور قوية
 */
@Component({
  selector: 'app-password-strength-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="password-strength-container" *ngIf="password">
      <!-- شريط القوة -->
      <div class="strength-bar-wrapper">
        <div class="strength-bar" [ngClass]="strengthClass" [style.width.%]="strengthScore"></div>
      </div>
      <div class="strength-label" [ngClass]="strengthClass">
        {{ strengthLabel }}
      </div>

      <!-- قائمة المتطلبات -->
      <div class="requirements-list">
        <div class="requirement" [class.met]="requirements.minLength">
          <span class="requirement-icon">
            {{ requirements.minLength ? '✓' : '○' }}
          </span>
          <span class="requirement-text">الحد الأدنى 8 أحرف</span>
        </div>

        <div class="requirement" [class.met]="requirements.hasUppercase">
          <span class="requirement-icon">
            {{ requirements.hasUppercase ? '✓' : '○' }}
          </span>
          <span class="requirement-text">حرف كبير (A-Z)</span>
        </div>

        <div class="requirement" [class.met]="requirements.hasLowercase">
          <span class="requirement-icon">
            {{ requirements.hasLowercase ? '✓' : '○' }}
          </span>
          <span class="requirement-text">حرف صغير (a-z)</span>
        </div>

        <div class="requirement" [class.met]="requirements.hasNumber">
          <span class="requirement-icon">
            {{ requirements.hasNumber ? '✓' : '○' }}
          </span>
          <span class="requirement-text">رقم (0-9)</span>
        </div>

        <div class="requirement" [class.met]="requirements.hasSpecialChar">
          <span class="requirement-icon">
            {{ requirements.hasSpecialChar ? '✓' : '○' }}
          </span>
          <span class="requirement-text">حرف خاص (!@#$%)</span>
        </div>
      </div>

      <!-- الأخطاء (إن وجدت) -->
      <div class="error-messages" *ngIf="!isValid">
        <div class="error-item" *ngFor="let error of errors">
          <span class="error-icon">⚠️</span>
          <span class="error-text">{{ error }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .password-strength-container {
      margin-top: 12px;
      padding: 12px;
      background: var(--bg-secondary, #f9f9f9);
      border-radius: 6px;
      border: 1px solid var(--border-color, #e0e0e0);
    }

    .strength-bar-wrapper {
      width: 100%;
      height: 6px;
      background: var(--bg-light, #e0e0e0);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .strength-bar {
      height: 100%;
      transition: all 0.3s ease;
      border-radius: 3px;
    }

    .strength-bar.weak {
      background: var(--danger, #dc3545);
      width: 25%;
    }

    .strength-bar.fair {
      background: var(--warning, #ffc107);
      width: 50%;
    }

    .strength-bar.good {
      background: var(--info, #17a2b8);
      width: 75%;
    }

    .strength-bar.strong {
      background: var(--success, #28a745);
      width: 100%;
    }

    .strength-label {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .strength-label.weak {
      color: var(--danger, #dc3545);
    }

    .strength-label.fair {
      color: var(--warning, #ffc107);
    }

    .strength-label.good {
      color: var(--info, #17a2b8);
    }

    .strength-label.strong {
      color: var(--success, #28a745);
    }

    .requirements-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
    }

    .requirement {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-muted, #666);
      transition: color 0.2s ease;
    }

    .requirement.met {
      color: var(--success, #28a745);
      font-weight: 500;
    }

    .requirement-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      font-size: 14px;
      font-weight: bold;
    }

    .requirement.met .requirement-icon {
      color: var(--success, #28a745);
    }

    .requirement:not(.met) .requirement-icon {
      color: var(--text-muted, #999);
    }

    .error-messages {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 8px;
      border-top: 1px solid var(--border-color, #e0e0e0);
    }

    .error-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--danger, #dc3545);
    }

    .error-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      font-size: 12px;
    }

    .error-text {
      flex: 1;
    }
  `]
})
export class PasswordStrengthIndicatorComponent implements OnChanges {
  @Input() password: string = '';

  requirements: PasswordRequirements = {
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecialChar: false
  };

  errors: string[] = [];
  isValid = false;
  strengthScore = 0;
  strengthLabel: 'ضعيفة جداً' | 'ضعيفة' | 'متوسطة' | 'قوية' = 'ضعيفة جداً';

  constructor(private passwordValidator: PasswordValidatorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['password']) {
      this.updateValidation();
    }
  }

  private updateValidation(): void {
    if (!this.password) {
      this.strengthScore = 0;
      this.strengthLabel = 'ضعيفة جداً';
      return;
    }

    const result = this.passwordValidator.validate(this.password);
    this.requirements = result.requirements;
    this.errors = result.errors;
    this.isValid = result.isValid;
    this.strengthScore = this.passwordValidator.getStrengthScore(this.password);

    // تعيين الملصق بناءً على النسبة
    if (this.strengthScore <= 25) {
      this.strengthLabel = 'ضعيفة جداً';
    } else if (this.strengthScore <= 50) {
      this.strengthLabel = 'ضعيفة';
    } else if (this.strengthScore <= 75) {
      this.strengthLabel = 'متوسطة';
    } else {
      this.strengthLabel = 'قوية';
    }
  }

  get strengthClass(): string {
    if (this.strengthScore <= 25) return 'weak';
    if (this.strengthScore <= 50) return 'weak';
    if (this.strengthScore <= 75) return 'fair';
    return 'strong';
  }
}

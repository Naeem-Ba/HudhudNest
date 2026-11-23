import { Injectable } from '@angular/core';

import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_CHARACTERS } from '../auth/password-policy';

/**
 * متطلبات كلمة المرور الموحدة بين الأمام والخلف
 */
export interface PasswordRequirements {
  minLength: boolean;        // الحد الأدنى 8 أحرف
  hasUppercase: boolean;     // حرف كبير واحد على الأقل
  hasLowercase: boolean;     // حرف صغير واحد على الأقل
  hasNumber: boolean;        // رقم واحد على الأقل
  hasSpecialChar: boolean;   // حرف خاص واحد على الأقل
}

/**
 * نتيجة التحقق من كلمة المرور
 */
export interface PasswordValidationResult {
  isValid: boolean;
  requirements: PasswordRequirements;
  errors: string[];
}

/**
 * خدمة التحقق من قوة كلمة المرور
 * تطبق نفس المتطلبات على جانب الأمام والخلف للحصول على تجربة موحدة
 */
@Injectable({ providedIn: 'root' })
export class PasswordValidatorService {
  // Both from password-policy.ts, which mirrors the server's PasswordPolicy. The old local regex also accepted '"',
  // which the server does not count as special, so the indicator could tick a rule the server then rejected.
  private readonly MIN_LENGTH = PASSWORD_MIN_LENGTH;
  private readonly SPECIAL_CHARS = { test: (p: string) => [...p].some(c => PASSWORD_SPECIAL_CHARACTERS.includes(c)) };

  /**
   * التحقق من قوة كلمة المرور
   */
  validate(password: string): PasswordValidationResult {
    const requirements = this.checkRequirements(password);
    const errors = this.generateErrorMessages(requirements);
    const isValid = Object.values(requirements).every(v => v === true);

    return {
      isValid,
      requirements,
      errors
    };
  }

  /**
   * التحقق من كل متطلب بشكل منفصل
   */
  private checkRequirements(password: string): PasswordRequirements {
    return {
      minLength: password.length >= this.MIN_LENGTH,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: this.SPECIAL_CHARS.test(password)
    };
  }

  /**
   * توليد رسائل الخطأ بناءً على المتطلبات غير المستوفاة
   */
  private generateErrorMessages(requirements: PasswordRequirements): string[] {
    const errors: string[] = [];

    if (!requirements.minLength) {
      errors.push('يجب أن تكون كلمة المرور 8 أحرف على الأقل');
    }

    if (!requirements.hasUppercase) {
      errors.push('يجب أن تحتوي على حرف كبير واحد (A-Z)');
    }

    if (!requirements.hasLowercase) {
      errors.push('يجب أن تحتوي على حرف صغير واحد (a-z)');
    }

    if (!requirements.hasNumber) {
      errors.push('يجب أن تحتوي على رقم واحد (0-9)');
    }

    if (!requirements.hasSpecialChar) {
      errors.push('يجب أن تحتوي على حرف خاص (!@#$%^&*)');
    }

    return errors;
  }

  /**
   * فحص ما إذا كانت كلمة المرور قوية (جميع المتطلبات مستوفاة)
   */
  isStrong(password: string): boolean {
    return this.validate(password).isValid;
  }

  /**
   * الحصول على رسالة بسيطة عن قوة كلمة المرور
   */
  getStrengthLabel(password: string): 'weak' | 'fair' | 'good' | 'strong' {
    const result = this.validate(password);

    if (!result.isValid) {
      return 'weak';
    }

    // جميع المتطلبات مستوفاة = قوية جداً
    return 'strong';
  }

  /**
   * الحصول على نسبة قوة كلمة المرور (0-100)
   */
  getStrengthScore(password: string): number {
    const requirements = this.checkRequirements(password);
    const met = Object.values(requirements).filter(v => v === true).length;
    return (met / Object.keys(requirements).length) * 100;
  }

  /**
   * الحصول على ملخص سريع للمتطلبات غير المستوفاة
   */
  getMissingRequirements(password: string): string[] {
    const requirements = this.checkRequirements(password);
    const missing: string[] = [];

    if (!requirements.minLength) missing.push('الحد الأدنى');
    if (!requirements.hasUppercase) missing.push('حرف كبير');
    if (!requirements.hasLowercase) missing.push('حرف صغير');
    if (!requirements.hasNumber) missing.push('رقم');
    if (!requirements.hasSpecialChar) missing.push('حرف خاص');

    return missing;
  }
}

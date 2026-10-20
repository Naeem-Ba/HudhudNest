import { FormControl } from '@angular/forms';

import {
  getPasswordPolicyViolations,
  passwordPolicyValidator,
  PASSWORD_ERROR_CODES,
  PASSWORD_POLICY_RULES
} from './password-policy';

/**
 * هذه القواعد نسخة من قواعد الخادم، ووظيفة هذه الاختبارات أن تُبقيهما متطابقتين.
 * الأمثلة مأخوذة من تعليقات PasswordSecurityService نفسها: ما تقول إنه يجب أن يُرفَض،
 * وما تقول صراحةً إنه يجب أن يمرّ.
 */
describe('passwordPolicy', () => {
  it('يقبل كلمة مرور تستوفي كل القواعد', () => {
    expect(getPasswordPolicyViolations('MyPassword123!')).toEqual([]);
  });

  it('يرفض ما دون ثمانية محارف', () => {
    expect(getPasswordPolicyViolations('Ab1!x')).toContain(PASSWORD_ERROR_CODES.tooShort);
  });

  it('يطلب حرفاً كبيراً وصغيراً ورقماً ورمزاً', () => {
    expect(getPasswordPolicyViolations('mypassword1!')).toContain(PASSWORD_ERROR_CODES.noUppercase);
    expect(getPasswordPolicyViolations('MYPASSWORD1!')).toContain(PASSWORD_ERROR_CODES.noLowercase);
    expect(getPasswordPolicyViolations('MyPasswordX!')).toContain(PASSWORD_ERROR_CODES.noDigit);
    expect(getPasswordPolicyViolations('MyPassword123')).toContain(PASSWORD_ERROR_CODES.noSpecial);
  });

  it('يرفض كلمة شائعة مزيّنة بأرقام ورموز', () => {
    // القصّ يجري في مرور واحد من الطرفين: لو جرى على مرحلتين لبقي "Password1"
    // ولما طابق القائمة، وهو الخطأ الذي يحذّر منه تعليق الخادم.
    expect(getPasswordPolicyViolations('Password1!')).toContain(PASSWORD_ERROR_CODES.commonWord);
    expect(getPasswordPolicyViolations('Qwerty123!')).toContain(PASSWORD_ERROR_CODES.commonWord);
  });

  it('لا يعاقب كلمة شائعة مسبوقة بكلمة حقيقية', () => {
    expect(getPasswordPolicyViolations('MyPassword123!')).not.toContain(PASSWORD_ERROR_CODES.commonWord);
    expect(getPasswordPolicyViolations('SecurePass123!')).not.toContain(PASSWORD_ERROR_CODES.commonWord);
  });

  it('يرفض أكثر من أربعة محارف متتالية أو مكرّرة، ويتسامح مع أربعة', () => {
    expect(getPasswordPolicyViolations('Ab123456!')).toContain(PASSWORD_ERROR_CODES.longRun);
    expect(getPasswordPolicyViolations('Abaaaaa1!')).toContain(PASSWORD_ERROR_CODES.longRun);

    // "1234" أربعة فقط -- عتبة الخادم فوق طول سنة أو لاحقة رقمية قصيرة.
    expect(getPasswordPolicyViolations('Xk1234tq!')).not.toContain(PASSWORD_ERROR_CODES.longRun);
  });

  it('يترك الحقل الفارغ لـ Validators.required بدل إظهار سببين لعلّة واحدة', () => {
    const validator = passwordPolicyValidator();

    expect(validator(new FormControl(''))).toBeNull();
    expect(validator(new FormControl('MyPassword123!'))).toBeNull();
  });

  it('يُبلّغ عن المخالفات تحت المفتاح passwordPolicy', () => {
    const errors = passwordPolicyValidator()(new FormControl('short'));

    expect(errors?.['passwordPolicy'].violations).toContain(PASSWORD_ERROR_CODES.tooShort);
  });

  /**
   * حارس الانحراف: كل كود يمكن أن يخرج من الفحص المحلي يجب أن يكون له سطر في القائمة
   * المعروضة، وإلّا رُفِضت كلمة المرور لسببٍ لا يراه المستخدم في أي مكان.
   */
  it('يعرض سطراً لكل قاعدة يمكن أن تُخالَف محلياً', () => {
    const localCodes = Object.values(PASSWORD_ERROR_CODES).filter(
      code => code !== PASSWORD_ERROR_CODES.required && code !== PASSWORD_ERROR_CODES.breached
    );

    expect(PASSWORD_POLICY_RULES.slice().sort()).toEqual(localCodes.slice().sort());
  });
});

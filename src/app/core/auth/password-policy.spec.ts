import { FormControl } from '@angular/forms';

import {
  getPasswordPolicyViolations,
  passwordPolicyValidator,
  PASSWORD_ERROR_CODES,
  PASSWORD_POLICY_RULES,
  PASSWORD_POLICY_RULES_WITH_PERSONAL
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

    // personalInfo is listed only on forms that know who is registering (PASSWORD_POLICY_RULES_WITH_PERSONAL).
    expect(PASSWORD_POLICY_RULES_WITH_PERSONAL.slice().sort()).toEqual(localCodes.slice().sort());
    expect(PASSWORD_POLICY_RULES).not.toContain(PASSWORD_ERROR_CODES.personalInfo);
  });
});


/**
 * "The password must not contain who you are". The same vectors as the server's
 * PasswordPersonalInformationTests: the two implementations must agree, and the server is the reference.
 */
describe('passwordPolicy — personal information (mirror of the server tests)', () => {
  const holder = {
    firstName: 'Mohammad',
    lastName: 'Al-Khatib',
    email: 'm.alkhatib@example.com',
    phoneNumber: '+963944123456'
  };
  const personal = (password: string, context = holder): boolean =>
    getPasswordPolicyViolations(password, context).includes(PASSWORD_ERROR_CODES.personalInfo);

  [
    'Mohammad#2024x',
    'MOHAMMAD!secure9',
    'M0hammad!Secure',
    'Khatib#Strong9',
    'Alkhatib!2025x',
    'Abc!944123Zq',
    'Zz9!٩٤٤١٢٣Qq'
  ].forEach(password =>
    it(`rejects ${password}`, () => expect(personal(password)).toBeTrue())
  );

  ['Tr!ckyHorse1x', 'Abc!9441x2Z', 'Mo#hammZ9xKq', 'Alpha#Mango91x'].forEach(password =>
    it(`accepts ${password}`, () => expect(personal(password)).toBeFalse())
  );

  it('matches an Arabic name ignoring diacritics and alef forms', () => {
    const context = { firstName: 'أحمد', lastName: 'الخطيب' };
    expect(personal('احمد#Abc12xZ', context as typeof holder)).toBeTrue();
    expect(personal('Qw!الخَطِيب9xk', context as typeof holder)).toBeTrue();
  });

  it('matches an accented name without the accent', () => {
    expect(personal('JOSE#Fox91zz', { firstName: 'José' } as typeof holder)).toBeTrue();
  });

  it('a three-letter name only counts when it is the whole password', () => {
    const context = { firstName: 'Ali' } as typeof holder;
    expect(personal('Ali@2468@2468', context)).toBeTrue();
    expect(personal('Channali#Fox91', context)).toBeFalse();
    expect(personal('Ali#Fox91zzKl', context)).toBeFalse();
  });

  it('checks nothing personal without a context', () => {
    expect(getPasswordPolicyViolations('Mohammad#2024x')).toEqual([]);
  });

  it('lists every broken rule at once (the checklist shows them all), basics included', () => {
    const codes = getPasswordPolicyViolations('mohammad', holder);
    expect(codes).toContain(PASSWORD_ERROR_CODES.noUppercase);
    expect(codes).toContain(PASSWORD_ERROR_CODES.personalInfo);
  });
});

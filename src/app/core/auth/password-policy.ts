import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * مرآة لقواعد كلمة المرور في الخادم
 * (HudhudNestApi.Application/Auth/Services/PasswordSecurityService.cs).
 *
 * سبب وجود هذا الملف: كان نموذج التسجيل يكتفي بـ minLength(8)، بينما يفرض الخادم ثماني
 * قواعد. فيمرّ النموذج، ويُرسَل الطلب، ثم يردّ الخادم برفضٍ بالإنجليزية — والمستخدم لا
 * يعرف ما هو المطلوب أصلاً. هذه القواعد تُعرَض الآن قبل الإرسال وبلغة المستخدم.
 *
 * القاعدة الوحيدة التي لا يمكن تكرارها هنا هي فحص التسريبات (Have I Been Pwned): يحتاج
 * شبكة، ولا يجوز إرسال كلمة مرور المستخدم إلى طرف ثالث من المتصفّح. تبقى مسؤولية الخادم،
 * ويُترجَم رفضها عبر PASSWORD_BREACHED في password-errors.ts.
 *
 * **أي تعديل في قواعد الخادم يجب أن ينعكس هنا**، وإلّا عاد الخلل نفسه: نموذجٌ يقول «صالح»
 * وخادمٌ يقول «مرفوض».
 */

/** نفس PasswordErrorCodes في الخادم. */
export const PASSWORD_ERROR_CODES = {
  required: 'PASSWORD_REQUIRED',
  tooShort: 'PASSWORD_TOO_SHORT',
  noUppercase: 'PASSWORD_NO_UPPERCASE',
  noLowercase: 'PASSWORD_NO_LOWERCASE',
  noDigit: 'PASSWORD_NO_DIGIT',
  noSpecial: 'PASSWORD_NO_SPECIAL',
  commonWord: 'PASSWORD_COMMON_WORD',
  longRun: 'PASSWORD_LONG_RUN',
  breached: 'PASSWORD_BREACHED'
} as const;

export const PASSWORD_MIN_LENGTH = 8;

/** نفس SpecialCharacters حرفاً بحرف. */
export const PASSWORD_SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`";

/** نفس MaximumRunLength: يُرفَض ما زاد على أربعة متتالية. */
const MAXIMUM_RUN_LENGTH = 4;

/** نفس CommonBaseWords. */
const COMMON_BASE_WORDS = new Set([
  'password', 'passwort', 'passw0rd', 'pass', 'qwerty', 'qwertz', 'azerty',
  'asdfgh', 'zxcvbn', 'qazwsx', 'welcome', 'admin', 'administrator', 'root',
  'login', 'letmein', 'changeme', 'secret', 'default', 'guest', 'test',
  'monkey', 'dragon', 'sunshine', 'princess', 'shadow', 'master', 'superman',
  'batman', 'football', 'baseball', 'iloveyou', 'trustno', 'whatever',
  'freedom', 'starwars', 'computer', 'internet', 'abcdef', 'abc'
]);

/** نفس DecorationCharacters: الأرقام والرموز تُقتطع من الطرفين معاً في مرور واحد. */
const DECORATION_CHARACTERS = new Set(
  ('0123456789' + PASSWORD_SPECIAL_CHARACTERS).split('')
);

function trimDecoration(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && DECORATION_CHARACTERS.has(value.charAt(start))) {
    start++;
  }

  while (end > start && DECORATION_CHARACTERS.has(value.charAt(end - 1))) {
    end--;
  }

  return value.slice(start, end);
}

/**
 * أكثر من MAXIMUM_RUN_LENGTH محرفاً متتالياً تصاعدياً ("123456") أو تنازلياً ("54321")
 * أو مكرَّراً ("aaaaa"). نفس الخوارزمية في الخادم، بفارق أن المقارنة هنا على رموز UTF-16.
 */
function hasLongRun(password: string): boolean {
  let ascending = 1;
  let descending = 1;
  let repeating = 1;

  for (let i = 1; i < password.length; i++) {
    const delta = password.charCodeAt(i) - password.charCodeAt(i - 1);

    ascending = delta === 1 ? ascending + 1 : 1;
    descending = delta === -1 ? descending + 1 : 1;
    repeating = delta === 0 ? repeating + 1 : 1;

    if (
      ascending > MAXIMUM_RUN_LENGTH ||
      descending > MAXIMUM_RUN_LENGTH ||
      repeating > MAXIMUM_RUN_LENGTH
    ) {
      return true;
    }
  }

  return false;
}

/**
 * أكواد القواعد التي تخالفها كلمة المرور، بالترتيب نفسه الذي تُعرَض به القائمة.
 * قائمة فارغة تعني أن كل ما يمكن فحصه محلياً قد نجح — ويبقى فحص التسريبات على الخادم.
 */
export function getPasswordPolicyViolations(password: string): string[] {
  const violations: string[] = [];

  if (!password) {
    return [PASSWORD_ERROR_CODES.required];
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    violations.push(PASSWORD_ERROR_CODES.tooShort);
  }

  if (!/\p{Lu}/u.test(password)) {
    violations.push(PASSWORD_ERROR_CODES.noUppercase);
  }

  if (!/\p{Ll}/u.test(password)) {
    violations.push(PASSWORD_ERROR_CODES.noLowercase);
  }

  if (!/\p{Nd}/u.test(password)) {
    violations.push(PASSWORD_ERROR_CODES.noDigit);
  }

  if (![...password].some(character => PASSWORD_SPECIAL_CHARACTERS.includes(character))) {
    violations.push(PASSWORD_ERROR_CODES.noSpecial);
  }

  if (COMMON_BASE_WORDS.has(trimDecoration(password).toLowerCase())) {
    violations.push(PASSWORD_ERROR_CODES.commonWord);
  }

  if (hasLongRun(password)) {
    violations.push(PASSWORD_ERROR_CODES.longRun);
  }

  return violations;
}

/**
 * القواعد المعروضة في القائمة تحت الحقل، بترتيب ثابت لا يقفز مع كل ضغطة مفتاح.
 * `required` ليس منها: غيابُ كلمة مرور يعالجه Validators.required.
 */
export const PASSWORD_POLICY_RULES: readonly string[] = [
  PASSWORD_ERROR_CODES.tooShort,
  PASSWORD_ERROR_CODES.noUppercase,
  PASSWORD_ERROR_CODES.noLowercase,
  PASSWORD_ERROR_CODES.noDigit,
  PASSWORD_ERROR_CODES.noSpecial,
  PASSWORD_ERROR_CODES.commonWord,
  PASSWORD_ERROR_CODES.longRun
];

/**
 * مُحقِّق Angular يضع الأكواد المخالفة تحت المفتاح `passwordPolicy`.
 * حقل فارغ يُترك لـ Validators.required كي لا تظهر رسالتان لسبب واحد.
 */
export function passwordPolicyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;

    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }

    const violations = getPasswordPolicyViolations(value);

    return violations.length > 0 ? { passwordPolicy: { violations } } : null;
  };
}

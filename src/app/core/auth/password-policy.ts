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
  breached: 'PASSWORD_BREACHED',
  /** The password contains the holder's name, the name part of their e-mail, or part of their phone number. */
  personalInfo: 'PASSWORD_CONTAINS_PERSONAL_INFO'
} as const;

/**
 * What the password is compared against. Only values the person has actually typed (or the server
 * reliably knows) belong here. There is no date of birth in the account model, so none is checked.
 */
export interface PasswordPersonalContext {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}

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

/** A name or e-mail part shorter than this is never searched for inside a password. */
const MIN_EMBEDDED_TOKEN_LENGTH = 4;

/** A token of exactly this length ("Ali") only counts when it is the whole password once digits/symbols are trimmed. */
const MIN_CORE_TOKEN_LENGTH = 3;

/** Shortest run of digits from a phone number that is refused inside a password. */
const PHONE_DIGIT_WINDOW = 6;

/**
 * Lower case, accents and Arabic diacritics removed, alef/hamza/ya/ta-marbuta variants unified,
 * Arabic-Indic digits turned into ASCII digits. Mirror of PasswordPolicy.Fold on the server.
 */
export function foldForComparison(value: string): string {
  let out = '';

  for (const original of value.normalize('NFKD')) {
    if (/[\p{Mn}\p{Me}\p{Cf}]/u.test(original)) {
      continue;
    }

    let ch = original.toLowerCase();

    switch (ch) {
      case '\u0640': // tatweel
        continue;
      case '\u0623': case '\u0625': case '\u0622': case '\u0671':
        ch = '\u0627';
        break;
      case '\u0649': case '\u0626':
        ch = '\u064A';
        break;
      case '\u0624':
        ch = '\u0648';
        break;
      case '\u0629':
        ch = '\u0647';
        break;
      default:
        if (ch >= '\u0660' && ch <= '\u0669') {
          ch = String.fromCharCode(48 + ch.charCodeAt(0) - 0x0660);
        } else if (ch >= '\u06F0' && ch <= '\u06F9') {
          ch = String.fromCharCode(48 + ch.charCodeAt(0) - 0x06F0);
        }
    }

    out += ch;
  }

  return out;
}

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's'
};

function deleet(folded: string): string {
  return [...folded].map(ch => LEET[ch] ?? ch).join('');
}

function collectWords(value: string | null | undefined, into: Set<string>): void {
  if (!value?.trim()) {
    return;
  }

  let current = '';
  const flush = (): void => {
    if (current.length >= MIN_CORE_TOKEN_LENGTH) {
      into.add(current);
    }
    current = '';
  };

  for (const ch of foldForComparison(value)) {
    if (/\p{L}/u.test(ch)) {
      current += ch;
    } else {
      flush();
    }
  }

  flush();
}

function collectTextTokens(context: PasswordPersonalContext): Set<string> {
  const tokens = new Set<string>();

  collectWords(context.firstName, tokens);
  collectWords(context.lastName, tokens);

  if (context.email?.trim()) {
    const at = context.email.indexOf('@');
    const local = at > 0 ? context.email.slice(0, at) : context.email;

    collectWords(local, tokens);

    const joined = [...foldForComparison(local)].filter(ch => /\p{L}/u.test(ch)).join('');
    if (joined.length >= MIN_EMBEDDED_TOKEN_LENGTH) {
      tokens.add(joined);
    }
  }

  return tokens;
}

function containsPhoneDigits(foldedPassword: string, phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber?.trim()) {
    return false;
  }

  const phoneDigits = foldForComparison(phoneNumber).replace(/\D/g, '');
  if (phoneDigits.length < PHONE_DIGIT_WINDOW) {
    return false;
  }

  for (const run of foldedPassword.match(/[0-9]{6,}/g) ?? []) {
    for (let i = 0; i + PHONE_DIGIT_WINDOW <= run.length; i++) {
      if (phoneDigits.includes(run.slice(i, i + PHONE_DIGIT_WINDOW))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * True when the password contains the person's own name, the name part of their e-mail address, or a
 * run of their phone number. Not a naive substring test (see PasswordPolicy.ContainsPersonalInformation on
 * the server, which is the reference): both sides are folded, look-alike swaps (0->o, 1->i, 3->e, 4->a,
 * 5->s, 7->t, @->a, $->s) are undone, a three-letter name only counts as the whole password, and shorter
 * fragments are ignored so unrelated passwords are not rejected.
 */
export function containsPersonalInformation(
  password: string,
  context: PasswordPersonalContext | null | undefined
): boolean {
  if (!context || !password) {
    return false;
  }

  const folded = foldForComparison(password);
  const deleeted = deleet(folded);

  for (const token of collectTextTokens(context)) {
    if (token.length >= MIN_EMBEDDED_TOKEN_LENGTH) {
      if (folded.includes(token) || deleeted.includes(token)) {
        return true;
      }
    } else if (token.length === MIN_CORE_TOKEN_LENGTH) {
      if (trimDecoration(folded) === token || trimDecoration(deleeted) === token) {
        return true;
      }
    }
  }

  return containsPhoneDigits(folded, context.phoneNumber);
}

/**
 * أكواد القواعد التي تخالفها كلمة المرور، بالترتيب نفسه الذي تُعرَض به القائمة.
 * قائمة فارغة تعني أن كل ما يمكن فحصه محلياً قد نجح — ويبقى فحص التسريبات على الخادم.
 */
export function getPasswordPolicyViolations(
  password: string,
  context?: PasswordPersonalContext | null
): string[] {
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

  if (containsPersonalInformation(password, context)) {
    violations.push(PASSWORD_ERROR_CODES.personalInfo);
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
 * The same list plus "no name / e-mail / phone digits", for the forms that know who is registering.
 * Forms with nothing to compare against (reset by phone, where the name is not on the page) use
 * PASSWORD_POLICY_RULES, so they never show a rule they cannot check.
 */
export const PASSWORD_POLICY_RULES_WITH_PERSONAL: readonly string[] = [
  ...PASSWORD_POLICY_RULES,
  PASSWORD_ERROR_CODES.personalInfo
];

/**
 * مُحقِّق Angular يضع الأكواد المخالفة تحت المفتاح `passwordPolicy`.
 * حقل فارغ يُترك لـ Validators.required كي لا تظهر رسالتان لسبب واحد.
 */
export function passwordPolicyValidator(
  contextProvider?: () => PasswordPersonalContext | null | undefined
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;

    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }

    const violations = getPasswordPolicyViolations(value, contextProvider?.());

    return violations.length > 0 ? { passwordPolicy: { violations } } : null;
  };
}

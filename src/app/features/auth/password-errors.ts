import { TranslateService } from '@ngx-translate/core';

import { PASSWORD_ERROR_CODES } from '../../core/auth/password-policy';

/**
 * تعيين أكواد رفض كلمة المرور (PasswordErrorCodes في الخادم) إلى مفاتيح الترجمة.
 * نفس نمط ERROR_CODE_TO_KEY في phone-auth-errors.ts.
 */
export const PASSWORD_CODE_TO_KEY: Record<string, string> = {
  [PASSWORD_ERROR_CODES.required]: 'AUTH.ERRORS.PASSWORD_REQUIRED',
  [PASSWORD_ERROR_CODES.tooShort]: 'AUTH.ERRORS.PASSWORD_MIN',
  [PASSWORD_ERROR_CODES.noUppercase]: 'AUTH.ERRORS.PASSWORD_NO_UPPERCASE',
  [PASSWORD_ERROR_CODES.noLowercase]: 'AUTH.ERRORS.PASSWORD_NO_LOWERCASE',
  [PASSWORD_ERROR_CODES.noDigit]: 'AUTH.ERRORS.PASSWORD_NO_DIGIT',
  [PASSWORD_ERROR_CODES.noSpecial]: 'AUTH.ERRORS.PASSWORD_NO_SPECIAL',
  [PASSWORD_ERROR_CODES.commonWord]: 'AUTH.ERRORS.PASSWORD_COMMON_WORD',
  [PASSWORD_ERROR_CODES.longRun]: 'AUTH.ERRORS.PASSWORD_LONG_RUN',
  [PASSWORD_ERROR_CODES.breached]: 'AUTH.ERRORS.PASSWORD_BREACHED',
  [PASSWORD_ERROR_CODES.personalInfo]: 'AUTH.ERRORS.PASSWORD_PERSONAL_INFO'
};

/** ترجمة كود واحد، مع الرجوع إلى رسالة الخادم إن كان الكود مجهولاً. */
export function translatePasswordErrorCode(
  translate: TranslateService,
  code: string | null | undefined,
  serverMessage?: string
): string | null {
  if (code && PASSWORD_CODE_TO_KEY[code]) {
    return translate.instant(PASSWORD_CODE_TO_KEY[code]);
  }

  return serverMessage?.trim() || null;
}

interface ValidationProblem {
  errors?: Record<string, string[]>;
  errorCodes?: Record<string, string[]>;
}

/**
 * مفاتيح قاموس أخطاء 422 تأتي بأسماء الخصائص كما هي في C#‏ ("Password")، لأن
 * PropertyNamingPolicy لا يمسّ مفاتيح القواميس. البحث هنا غير حسّاس لحالة الأحرف كي
 * لا ينكسر العرض لو غُيّرت تلك السياسة يوماً.
 */
function readField(
  bag: Record<string, string[]> | undefined,
  field: string
): string[] {
  if (!bag) {
    return [];
  }

  const key = Object.keys(bag).find(
    candidate => candidate.toLowerCase() === field.toLowerCase()
  );

  return key ? bag[key] ?? [] : [];
}

/**
 * يستخرج أسباب رفض كلمة المرور من استجابة 422 ويُعيدها مترجَمة.
 *
 * هذا هو نصف الإصلاح الذي يخصّ فحص التسريبات: لا يمكن للمتصفّح تكرار ذلك الفحص، فيصل
 * الرفض من الخادم — وكان يصل جملةً إنجليزية تُعرَض كما هي لمستخدمٍ عربي أو ألماني.
 * الكود PASSWORD_BREACHED هو ما يُترجَم الآن؛ ونصّ الخادم يبقى احتياطاً لعميلٍ لا يعرف
 * الكود، وهو ما يجعل الإضافة غير كاسرة.
 *
 * قائمة فارغة تعني أن 422 لم تكن بسبب كلمة المرور، فيتولّى المتصل رسالته العامّة.
 */
export function getPasswordRejectionMessages(
  translate: TranslateService,
  httpError: unknown
): string[] {
  const response = httpError as { error?: ValidationProblem } | undefined;
  const problem = response?.error;

  if (!problem || typeof problem !== 'object') {
    return [];
  }

  const messages = readField(problem.errors, 'Password');
  const codes = readField(problem.errorCodes, 'Password');

  // الرسائل والأكواد متوازية فهرساً بفهرس؛ الخادم يبنيهما من التسلسل نفسه.
  const reasons = (codes.length > 0 ? codes : messages).map((_, index) =>
    translatePasswordErrorCode(translate, codes[index], messages[index])
  );

  return reasons.filter((reason): reason is string => !!reason);
}

/** The sentences for a list of violated rules (client-side check), in the order of the checklist. */
export function translatePasswordViolations(translate: TranslateService, codes: readonly string[]): string[] {
  return codes
    .map(code => translatePasswordErrorCode(translate, code))
    .filter((message): message is string => !!message);
}

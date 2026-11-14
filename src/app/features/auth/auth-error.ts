import { AbstractControl } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

import { isInOtherScript, knownValidationMessageKey } from '../../core/interceptors/api-error.interceptor';
import { PASSWORD_CODE_TO_KEY } from './password-errors';
import { PHONE_ERROR_CODE_TO_KEY } from './phone-auth-errors';

/**
 * ONE place that turns a failed sign-in / sign-up / reset request into what the person should read and
 * where. Before this each page re-implemented the same ladder (server error, taken e-mail, password
 * reasons, backend text, generic) slightly differently, and a page that forgot a rung printed the
 * API's English sentence or one generic line for every cause.
 *
 * Inputs are the API's existing contracts, nothing new: `code` / `errorCode` on 4xx bodies,
 * `errors` + `errorCodes` on 422 (and the phone endpoints' 400 for a rejected password), HTTP status.
 * The API's English `message` is never shown: every cause has a translated sentence.
 */
export type AuthField =
  | 'email' | 'password' | 'newPassword' | 'currentPassword' | 'confirmPassword'
  | 'firstName' | 'lastName' | 'phone' | 'code' | 'consent';

export type AuthErrorKind =
  | 'network' | 'timeout' | 'rate_limited' | 'server' | 'validation'
  | 'conflict' | 'credentials' | 'forbidden' | 'unknown';

export interface AuthFieldError {
  field: AuthField;
  message: string;
  code?: string;
}

export interface ResolvedAuthError {
  kind: AuthErrorKind;
  /** The sentence for the form as a whole (not tied to one field), or null when only fields failed. */
  message: string | null;
  fields: AuthFieldError[];
  /** The server's stable code, when it sent one. */
  code?: string;
  /** Seconds from Retry-After on a 429, when sent. */
  retryAfterSeconds?: number;
}

export interface AuthErrorOptions {
  /** Which field the "Password" key of a 422 belongs to (a reset form calls it newPassword). */
  passwordField?: AuthField;
  /** Translation key used when nothing more specific is known. */
  fallbackKey?: string;
  /** Translation key for a 401 (wrong credentials). */
  credentialsKey?: string;
  /** A bare 409 means "this e-mail already has an account" (registration only). */
  conflictMeansEmailTaken?: boolean;
  /**
   * For a 4xx nothing above recognised, show the sentence the API wrote. Only for endpoints that already
   * receive the UI language (registration), so the sentence is in the person's language; every other page
   * keeps the translated generic text.
   */
  allowServerMessage?: boolean;
}

/** Which field a code belongs to, when it belongs to one. */
const FIELD_OF_CODE: Record<string, AuthField> = {
  PasswordMismatch: 'currentPassword',
  'INVALID_CURRENT_PASSWORD': 'currentPassword',
  EMAIL_ALREADY_REGISTERED: 'email',
  EMAIL_REQUIRED: 'email',
  EMAIL_INVALID: 'email',
  EMAIL_TOO_LONG: 'email',
  EMAIL_HAS_WHITESPACE: 'email',
  FIRST_NAME_REQUIRED: 'firstName',
  FIRST_NAME_TOO_LONG: 'firstName',
  LAST_NAME_REQUIRED: 'lastName',
  LAST_NAME_TOO_LONG: 'lastName',
  PHONE_ALREADY_REGISTERED: 'phone',
  PHONE_NUMBER_ALREADY_IN_USE: 'phone',
  PHONE_NUMBER_INVALID: 'phone',
  PHONE_COUNTRY_NOT_SUPPORTED: 'phone',
  OTP_INVALID: 'code',
  OTP_WRONG: 'code',
  OTP_EXPIRED: 'code',
  OTP_ALREADY_USED: 'code',
  OTP_RATE_LIMITED: 'code',
  PASSWORD_RESET_INVALID: 'code',
  PASSWORD_RESET_EXPIRED: 'code',
  PASSWORD_RESET_ALREADY_USED: 'code',
  CONSENT_REQUIRED: 'consent'
};

/** Codes added for the sign-up forms (API: AuthValidationCodes) that have no older table to live in. */
const FORM_CODE_TO_KEY: Record<string, string> = {
  PasswordMismatch: 'AUTH.ERRORS.CURRENT_PASSWORD_WRONG',
  'INVALID_CURRENT_PASSWORD': 'AUTH.ERRORS.CURRENT_PASSWORD_WRONG',
  EMAIL_ALREADY_REGISTERED: 'AUTH.ERRORS.EMAIL_ALREADY_EXISTS',
  EMAIL_REQUIRED: 'AUTH.ERRORS.EMAIL_REQUIRED',
  EMAIL_INVALID: 'AUTH.ERRORS.INVALID_EMAIL',
  EMAIL_TOO_LONG: 'AUTH.ERRORS.EMAIL_TOO_LONG',
  EMAIL_HAS_WHITESPACE: 'AUTH.ERRORS.EMAIL_NO_SPACES',
  FIRST_NAME_REQUIRED: 'AUTH.ERRORS.FIRST_NAME_REQUIRED',
  FIRST_NAME_TOO_LONG: 'AUTH.ERRORS.NAME_TOO_LONG',
  LAST_NAME_REQUIRED: 'AUTH.ERRORS.LAST_NAME_REQUIRED',
  LAST_NAME_TOO_LONG: 'AUTH.ERRORS.NAME_TOO_LONG',
  CONSENT_REQUIRED: 'AUTH.ERRORS.CONSENT_REQUIRED',
  SESSION_EXPIRED: 'AUTH.ERRORS.SESSION_EXPIRED'
};

/** Body keys of a 422 / ModelState dictionary (C# property names, any casing) -> field. */
const FIELD_OF_KEY: Record<string, AuthField> = {
  email: 'email',
  'password': 'password',
  'newpassword': 'newPassword',
  'currentpassword': 'currentPassword',
  'confirmpassword': 'confirmPassword',
  firstname: 'firstName',
  lastname: 'lastName',
  phonenumber: 'phone',
  phone: 'phone',
  code: 'code'
};

interface ErrorBody {
  code?: unknown;
  Code?: unknown;
  errorCode?: unknown;
  errors?: unknown;
  errorCodes?: unknown;
}

function translateCode(translate: TranslateService, code: string): string | null {
  const key = FORM_CODE_TO_KEY[code] ?? PHONE_ERROR_CODE_TO_KEY[code] ?? PASSWORD_CODE_TO_KEY[code];
  return key ? translate.instant(key) : null;
}

function readBody(error: unknown): ErrorBody | null {
  const body = (error as { error?: unknown } | null | undefined)?.error;
  return body && typeof body === 'object' ? (body as ErrorBody) : null;
}

function readCode(body: ErrorBody | null): string | undefined {
  const value = body?.code ?? body?.Code ?? body?.errorCode;
  return typeof value === 'string' && value ? value : undefined;
}

function isTimeout(error: unknown): boolean {
  return (error as { name?: unknown } | null | undefined)?.name === 'TimeoutError';
}

function readRetryAfter(error: unknown): number | undefined {
  const headers = (error as { headers?: { get?: (name: string) => string | null } } | null | undefined)?.headers;
  const raw = headers?.get?.('Retry-After');
  const seconds = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function fieldFor(key: string, options: AuthErrorOptions): AuthField | null {
  const field = FIELD_OF_KEY[key.replace(/^\$\.?/, '').toLowerCase()];
  if (!field) {
    return null;
  }
  return field === 'password' && options.passwordField ? options.passwordField : field;
}

/**
 * Field-level failures out of `errors` / `errorCodes`. Both shapes exist: a dictionary keyed by the C#
 * property name (422, phone 400) and, for the e-mail reset / change-password endpoints, two parallel lists
 * that only ever describe the password.
 */
function readFieldErrors(
  translate: TranslateService,
  body: ErrorBody | null,
  options: AuthErrorOptions
): AuthFieldError[] {
  const result: AuthFieldError[] = [];
  const errors = body?.errors;
  const codes = body?.errorCodes;

  const add = (field: AuthField | null, code: string | undefined, message: string | undefined): void => {
    const known = code ? translateCode(translate, code) : null;
    const knownFromMessage = !known && message ? knownValidationMessageKey(message) : null;
    const text = known ?? (knownFromMessage ? translate.instant(knownFromMessage) : null);

    if (!text) {
      return;
    }

    const target = field ?? (code ? FIELD_OF_CODE[code] : undefined) ?? null;
    if (target && !result.some(item => item.field === target && item.message === text)) {
      result.push({ field: target, message: text, code });
    } else if (!target && !result.some(item => item.message === text)) {
      result.push({ field: options.passwordField ?? 'password', message: text, code });
    }
  };

  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    const messageBag = errors as Record<string, unknown>;
    const codeBag = (codes && typeof codes === 'object' && !Array.isArray(codes) ? codes : {}) as Record<string, unknown>;

    for (const [key, value] of Object.entries(messageBag)) {
      const messages = Array.isArray(value) ? value.map(String) : [String(value)];
      const keyCodes = Object.entries(codeBag).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1];
      const codeList = Array.isArray(keyCodes) ? keyCodes.map(String) : [];

      messages.forEach((message, index) => add(fieldFor(key, options), codeList[index] || undefined, message));
    }
  } else if (Array.isArray(errors) || Array.isArray(codes)) {
    const codeList = Array.isArray(codes) ? codes.map(String) : [];
    const messageList = Array.isArray(errors) ? errors.map(String) : [];
    const length = Math.max(codeList.length, messageList.length);

    for (let index = 0; index < length; index++) {
      const code = codeList[index];
      // Identity's own codes ("InvalidToken", "PasswordRequiresUpper") are not part of the contract.
      add(code?.startsWith('PASSWORD_') ? (options.passwordField ?? 'password') : null, code, messageList[index]);
    }
  }

  return result;
}

export function resolveAuthError(
  translate: TranslateService,
  error: unknown,
  options: AuthErrorOptions = {}
): ResolvedAuthError {
  const t = (key: string): string => translate.instant(key);
  const status = (error as { status?: unknown } | null | undefined)?.status;
  const body = readBody(error);
  const code = readCode(body);

  if (isTimeout(error)) {
    return { kind: 'timeout', message: t('AUTH.ERRORS.TIMEOUT'), fields: [] };
  }

  if (status === 0) {
    return { kind: 'network', message: t('AUTH.ERRORS.NETWORK_ERROR'), fields: [] };
  }

  if (typeof status === 'number' && status >= 500) {
    return { kind: 'server', message: t('AUTH.ERRORS.SERVER_ERROR'), fields: [], code };
  }

  // Reasons the API attached to named fields win over the one summary code that travels with them
  // (a rejected phone-registration password carries PASSWORD_POLICY_FAILED *and* the exact rules).
  const fields = status === 429 ? [] : readFieldErrors(translate, body, options);
  if (fields.length > 0) {
    return { kind: 'validation', message: null, fields, code };
  }

  // A specific code beats the generic text of its status (a phone OTP 429 says "too many codes").
  if (code) {
    const text = translateCode(translate, code);
    if (text) {
      const field = FIELD_OF_CODE[code];
      return {
        kind: status === 429 ? 'rate_limited' : status === 409 ? 'conflict' : 'validation',
        message: field ? null : text,
        fields: field ? [{ field, message: text, code }] : [],
        code,
        retryAfterSeconds: readRetryAfter(error)
      };
    }
  }

  if (status === 429) {
    return {
      kind: 'rate_limited',
      message: t('AUTH.ERRORS.RATE_LIMITED'),
      fields: [],
      code,
      retryAfterSeconds: readRetryAfter(error)
    };
  }

  if (status === 409 && options.conflictMeansEmailTaken) {
    const text = t('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    return {
      kind: 'conflict',
      message: null,
      fields: [{ field: 'email', message: text, code: 'EMAIL_ALREADY_REGISTERED' }],
      code: 'EMAIL_ALREADY_REGISTERED'
    };
  }

  if (options.allowServerMessage && typeof status === 'number' && status >= 400 && status < 500 && status !== 401 && status !== 403) {
    const own = (body as { message?: unknown } | null)?.message;
    const listed = body?.errors && typeof body.errors === 'object'
      ? Object.values(body.errors as Record<string, unknown>).flat().map(String).filter(Boolean)
      : [];
    const text = typeof own === 'string' && own.trim() ? own.trim() : listed.join(' ');
    // The API writes some sentences in one fixed language. A reader on a page in another language gets the
    // translated fallback below instead of a sentence they cannot read.
    if (text && !isInOtherScript(text)) {
      return { kind: 'validation', message: text, fields: [], code };
    }
  }

  if (status === 401) {
    return {
      kind: 'credentials',
      message: t(options.credentialsKey ?? 'AUTH.ERRORS.INVALID_CREDENTIALS'),
      fields: [],
      code
    };
  }

  if (status === 403) {
    return { kind: 'forbidden', message: t('API_ERRORS.FORBIDDEN'), fields: [], code };
  }

  return { kind: 'unknown', message: t(options.fallbackKey ?? 'AUTH.ERRORS.GENERIC'), fields: [], code };
}

/**
 * Puts each field-level failure on its own control (so the sentence appears next to the field and goes
 * away the moment the person edits it: Angular drops a manually set error on the next value change) and
 * returns the sentences that belong to no control on this page, for the form-level area.
 */
export function applyAuthFieldErrors(
  resolved: ResolvedAuthError,
  controls: Partial<Record<AuthField, AbstractControl | null | undefined>>
): string[] {
  const leftovers: string[] = resolved.message ? [resolved.message] : [];

  for (const item of resolved.fields) {
    const control = controls[item.field];

    if (control) {
      control.setErrors({ server: item.message });
      control.markAsTouched();
    } else if (!leftovers.includes(item.message)) {
      leftovers.push(item.message);
    }
  }

  return leftovers;
}

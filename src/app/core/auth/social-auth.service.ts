// =====================================================================
// [FIX-1 / 🔴 حرج] Google One Tap لا يظهر دائماً (cooldown، حظر كوكيز
// الطرف الثالث، وضع التصفح الخفي...). الكود القديم كان يستدعي
// prompt() بدون callback إشعار، فإذا لم تظهر النافذة، لا observer.next
// ولا observer.error يُستدعيان أبداً — الـ Observable يُعلَّق للأبد
// و loading تبقى true إلى ما لا نهاية في login.component.ts.
//
// الحل المزدوج:
//   (أ) تمرير callback حقيقي لـ prompt() يتحقق من
//       isNotDisplayed()/isSkippedMoment()/isDismissedMoment()
//       ويُطلق observer.error فوراً بدل الصمت.
//   (ب) شبكة أمان إضافية: timeout صريح على مستوى الـ Observable
//       نفسه (60 ثانية) يغطي أي حالة لم يُغطّها (أ) — مثل تعليق
//       شبكي داخل استدعاء الـ Backend نفسه.
//
// [FIX-2 / 🟡 متوسط] كل رسائل الخطأ كانت نصوصاً إنجليزية مثبّتة خارج
// نظام ngx-translate بالكامل (نفس نمط الخطأ المتكرر في هذا المشروع:
// home.component.html للأرقام، الآن هنا لرسائل الخطأ). تم حقن
// TranslateService واستبدال كل نص حرفي بمفتاح ترجمة عبر translate.instant().
// أضف مفاتيح AUTH.ERRORS الجديدة الموضحة في تعليق النهاية إلى
// ar.json/en.json/de.json.
// =====================================================================
import { Injectable } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';
import { AuthTokenResponse } from '../models/auth.model';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            cancel_on_tap_outside?: boolean;
            ux_mode?: 'popup' | 'redirect';
          }) => void;
          /* [FIX-1] النوع الآن يعكس شكل الإشعار الحقيقي بدل unknown */
          prompt: (
            callback?: (notification: GoogleOneTapNotification) => void
          ) => void;
        };
      };
    };

    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => void;

        signIn: () => Promise<{
          authorization?: {
            id_token?: string;
            code?: string;
          };
          user?: {
            name?: {
              firstName?: string;
              lastName?: string;
            };
            email?: string;
          };
        }>;
      };
    };
  }
}

/* [FIX-1] شكل إشعار Google One Tap الفعلي (موثّق في Google Identity Services API) */
interface GoogleOneTapNotification {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
}

type BrowserCrypto = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
};

/** مهلة أمان قصوى لكامل تدفق تسجيل الدخول الاجتماعي (SDK + Backend) */
const SOCIAL_LOGIN_TIMEOUT_MS = 60_000;

@Injectable({
  providedIn: 'root'
})
export class SocialAuthService {
  private googleScriptPromise?: Promise<void>;
  private appleScriptPromise?: Promise<void>;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly translate: TranslateService
  ) {}

  get isGoogleAvailable(): boolean {
    return Boolean(environment.googleClientId?.trim());
  }

  get isAppleAvailable(): boolean {
    return Boolean(environment.appleClientId?.trim());
  }

  loginWithGoogle(): Observable<AuthTokenResponse> {
    const raw$ = new Observable<AuthTokenResponse>(observer => {
      let backendSubscription: Subscription | undefined;

      if (!this.isGoogleAvailable) {
        observer.error(new Error(this.t('AUTH.ERRORS.GOOGLE_NOT_CONFIGURED')));
        return undefined;
      }

      this.loadGoogleScript()
        .then(() => {
          if (!window.google?.accounts?.id) {
            throw new Error(this.t('AUTH.ERRORS.GOOGLE_SDK_UNAVAILABLE'));
          }

          window.google.accounts.id.initialize({
            client_id: environment.googleClientId,
            ux_mode: 'popup',
            cancel_on_tap_outside: true,
            callback: response => {
              const idToken = response.credential;

              if (!idToken) {
                observer.error(new Error(this.t('AUTH.ERRORS.GOOGLE_NO_TOKEN')));
                return;
              }

              backendSubscription = this.authApi.loginWithGoogle({ idToken }).subscribe({
                next: tokenResponse => {
                  observer.next(tokenResponse);
                  observer.complete();
                },
                error: error => observer.error(error)
              });
            }
          });

          /* [FIX-1 - أ] callback إشعار حقيقي بدل استدعاء أعمى بلا متابعة */
          window.google!.accounts.id.prompt(notification => {
            const notDisplayed = notification?.isNotDisplayed?.() ?? false;
            const skipped = notification?.isSkippedMoment?.() ?? false;
            const dismissed = notification?.isDismissedMoment?.() ?? false;

            if (notDisplayed || skipped || dismissed) {
              observer.error(new Error(this.t('AUTH.ERRORS.GOOGLE_NOT_DISPLAYED')));
            }
            /* إذا ظهرت النافذة فعلياً، لا شيء يُفعل هنا — ننتظر
               callback الخاص بـ initialize() أعلاه ليصل بالـ credential */
          });
        })
        .catch(error => observer.error(error));

      return () => {
        backendSubscription?.unsubscribe();
      };
    });

    /* [FIX-1 - ب] شبكة أمان: حتى لو فشل (أ) لأي سبب غير متوقع (تعليق
       شبكي حقيقي، أو SDK لا يستدعي أي callback إطلاقاً)، لا يبقى
       المستخدم بزر "جاري التحميل" معلّق للأبد */
    return raw$.pipe(
      timeout({
        each: SOCIAL_LOGIN_TIMEOUT_MS,
        with: () => {
          throw new Error(this.t('AUTH.ERRORS.SOCIAL_TIMEOUT'));
        }
      })
    );
  }

  loginWithApple(): Observable<AuthTokenResponse> {
    const raw$ = new Observable<AuthTokenResponse>(observer => {
      let backendSubscription: Subscription | undefined;

      if (!this.isAppleAvailable) {
        observer.error(new Error(this.t('AUTH.ERRORS.APPLE_NOT_CONFIGURED')));
        return undefined;
      }

      this.loadAppleScript()
        .then(() => {
          if (!window.AppleID?.auth) {
            throw new Error(this.t('AUTH.ERRORS.APPLE_SDK_UNAVAILABLE'));
          }

          const redirectUri =
            environment.appleRedirectUri?.trim() ||
            `${window.location.origin}/auth/apple/callback`;

          // ⚠️ ملاحظة معلّقة [🟠]: يُولَّد nonce هنا لكنه لا يُرسَل
          // ضمن الطلب لـ authApi.loginWithApple أدناه. لم يُعدَّل هذا
          // بعد بانتظار تأكيدك ما إذا كان الـ Backend يتحقق منه.
          window.AppleID.auth.init({
            clientId: environment.appleClientId,
            scope: 'name email',
            redirectURI: redirectUri,
            state: this.createRandomValue(),
            nonce: this.createRandomValue(),
            usePopup: true
          });

          return window.AppleID.auth.signIn();
        })
        .then(response => {
          const identityToken = response.authorization?.id_token;
          const authorizationCode = response.authorization?.code ?? null;
          const firstName = response.user?.name?.firstName ?? null;
          const lastName = response.user?.name?.lastName ?? null;

          if (!identityToken) {
            throw new Error(this.t('AUTH.ERRORS.APPLE_NO_TOKEN'));
          }

          backendSubscription = this.authApi.loginWithApple({
            identityToken,
            authorizationCode,
            firstName,
            lastName
          }).subscribe({
            next: tokenResponse => {
              observer.next(tokenResponse);
              observer.complete();
            },
            error: error => observer.error(error)
          });
        })
        .catch(error => observer.error(error));

      return () => {
        backendSubscription?.unsubscribe();
      };
    });

    /* [FIX-1 - ب] نفس شبكة الأمان تُطبَّق على Apple أيضاً — signIn()
       الخاص بأبل يمكن أن يُرفَض بصمت في بعض حالات popup blocking */
    return raw$.pipe(
      timeout({
        each: SOCIAL_LOGIN_TIMEOUT_MS,
        with: () => {
          throw new Error(this.t('AUTH.ERRORS.SOCIAL_TIMEOUT'));
        }
      })
    );
  }

  getSocialErrorMessage(error: unknown): string {
    const typedError = error as {
      error?: {
        message?: string;
        detail?: string;
        title?: string;
        errors?: Record<string, string[]>;
      } | string;
      message?: string;
      status?: number;
    };

    if (typeof typedError.error === 'string' && typedError.error.trim()) {
      return typedError.error;
    }

    if (typeof typedError.error === 'object') {
      if (typedError.error?.message) {
        return typedError.error.message;
      }

      if (typedError.error?.detail) {
        return typedError.error.detail;
      }

      if (typedError.error?.title) {
        return typedError.error.title;
      }

      if (typedError.error?.errors) {
        const messages = Object.values(typedError.error.errors).flat();

        if (messages.length > 0) {
          return messages.join(' ');
        }
      }
    }

    /* [FIX-2] رسائل Error المُنشأة داخل هذه الخدمة أصبحت الآن مترجمة
       أصلاً عبر this.t(...) عند إنشائها، لذا typedError.message هنا
       سيكون نصاً مترجَماً فعلياً، لا إنجليزياً مثبّتاً */
    if (typedError.message) {
      return typedError.message;
    }

    /* [FIX-2] الحالات الاحتياطية أدناه كانت نصوصاً إنجليزية مثبّتة — أصبحت مفاتيح ترجمة */
    if (typedError.status === 400) {
      return this.t('AUTH.ERRORS.SOCIAL_REQUEST_REJECTED');
    }

    if (typedError.status === 401) {
      return this.t('AUTH.ERRORS.SOCIAL_TOKEN_REJECTED');
    }

    if (typedError.status === 500) {
      return this.t('AUTH.ERRORS.SOCIAL_SERVER_ERROR');
    }

    return this.t('AUTH.ERRORS.SOCIAL_GENERIC_FAILED');
  }

  private loadGoogleScript(): Promise<void> {
    if (this.googleScriptPromise) {
      return this.googleScriptPromise;
    }

    this.googleScriptPromise = this.loadScript(
      'google-identity-services',
      'https://accounts.google.com/gsi/client'
    );

    return this.googleScriptPromise;
  }

  private loadAppleScript(): Promise<void> {
    if (this.appleScriptPromise) {
      return this.appleScriptPromise;
    }

    this.appleScriptPromise = this.loadScript(
      'apple-sign-in',
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
    );

    return this.appleScriptPromise;
  }

  private loadScript(id: string, src: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const existingScript = document.getElementById(id) as HTMLScriptElement | null;

      if (existingScript) {
        if (existingScript.dataset['loaded'] === 'true') {
          resolve();
          return;
        }

        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener(
          'error',
          () => reject(new Error(`Failed to load script: ${src}`)),
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        script.dataset['loaded'] = 'true';
        resolve();
      };

      script.onerror = () => {
        reject(new Error(`Failed to load script: ${src}`));
      };

      document.head.appendChild(script);
    });
  }

  private createRandomValue(): string {
    const webCrypto = (globalThis as unknown as { crypto?: BrowserCrypto }).crypto;

    if (webCrypto?.randomUUID) {
      return webCrypto.randomUUID();
    }

    if (webCrypto?.getRandomValues) {
      const array = new Uint32Array(4);
      webCrypto.getRandomValues(array);

      return Array.from(array)
        .map(value => value.toString(16).padStart(8, '0'))
        .join('');
    }

    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }

  /** [FIX-2] اختصار داخلي لقراءة الترجمة الفورية */
  private t(key: string): string {
    return this.translate.instant(key);
  }
}


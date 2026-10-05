// =====================================================================
// [FIX-1 / 🔴 حرج، تاريخي — استُبدلت آلية (أ) لاحقاً بـ BUG-21 أدناه]
// Google One Tap لا يظهر دائماً (cooldown، حظر كوكيز الطرف الثالث، وضع
// التصفح الخفي...). الكود القديم كان يستدعي prompt() بدون callback
// إشعار، فإذا لم تظهر النافذة، لا observer.next ولا observer.error
// يُستدعيان أبداً — الـ Observable يُعلَّق للأبد و loading تبقى true
// إلى ما لا نهاية في login.component.ts.
//
// الحل المزدوج وقتها:
//   (أ) [مُستبدَل بالكامل بـ BUG-21] تمرير callback إشعار حقيقي لـ
//       prompt() يتحقق من isNotDisplayed()/isSkippedMoment()/
//       isDismissedMoment() ويُطلق observer.error فوراً بدل الصمت —
//       هذا عالج التعليق الصامت، لكن prompt() نفسه تبيّن لاحقاً (BUG-21)
//       أنه غير موثوق بنيوياً كآلية استجابة وحيدة لنقرة زر صريحة.
//   (ب) [لا يزال سارياً] شبكة أمان إضافية: timeout صريح على مستوى
//       الـ Observable نفسه (60 ثانية) يغطي أي حالة غير متوقعة — مثل
//       تعليق شبكي داخل استدعاء الـ Backend نفسه.
//
// [FIX-2 / 🟡 متوسط] كل رسائل الخطأ كانت نصوصاً إنجليزية مثبّتة خارج
// نظام ngx-translate بالكامل (نفس نمط الخطأ المتكرر في هذا المشروع:
// home.component.html للأرقام، الآن هنا لرسائل الخطأ). تم حقن
// TranslateService واستبدال كل نص حرفي بمفتاح ترجمة عبر translate.instant().
// أضف مفاتيح AUTH.ERRORS الجديدة الموضحة في تعليق النهاية إلى
// ar.json/en.json/de.json.
//
// [BUG-21 / 🔴 حرج، 2026-08-31] استبدال prompt() (One Tap) بزر
// renderButton() مخفي + نقرة برمجية — التشخيص الفعلي (استُنسخ حياً على
// hudhudnest.com، لا افتراضاً):
//   - Chrome (v151+) يُصدر تحذيراً صريحاً في الـ console: "one of the
//     Google One Tap prompt UI status methods... may stop functioning
//     when FedCM becomes mandatory".
//   - استدعاء prompt() فعلياً أعاد notification بـ isSkippedMoment=true
//     وgetSkippedReason()='unknown_reason' — أو عَلَّق حتى مهلة 60 ثانية
//     بلا أي notification إطلاقاً — وسجّل الـ console أخطاء FedCM حقيقية:
//     "NotAllowedError: Only one navigator.credentials.get request may
//     be outstanding at one time" و"AbortError: signal is aborted
//     without reason".
//   - توثيق Google الرسمي (developers.google.com/identity/gsi/web/guides
//     /display-button) يقول صراحة: prompt() هو "a second alternative"
//     للـ One Tap التلقائي، وليس مُصمَّماً كآلية الاستجابة الوحيدة لنقرة
//     زر صريحة — renderButton() هو المسار الموثوق.
//
// الحل: زر Google حقيقي (renderButton) يُنشَأ ويُهيَّأ خارج الشاشة
// (position:fixed أعلى اليسار السالب) بمجرد إنشاء هذه الخدمة (تحميل
// مسبق يقضي على فجوة تحميل السكربت غير المتزامنة قبل أي نقرة حقيقية)،
// وزر الواجهة المخصَّص (نفس الشكل الحالي، لا تغيير بصري) يستدعي click()
// على الزر المخفي **ضمن نفس دورة معالجة نقرة المستخدم الحقيقية
// المتزامنة** بدل انتظار prompt(). تحقّق فعلي حي: نقرة موثوقة حقيقية
// (لا اختبار برمجي بحت) على زر مخصَّص أطلقت click() على الزر المخفي
// وأعادت credential (JWT ID token حقيقي) عبر نفس callback الموجود أصلاً
// في initialize() — بلا أي تغيير على شكل الاستجابة أو عقد الـ Backend.
// =====================================================================
import { Injectable } from '@angular/core';
import { Observable, Subscriber, Subscription } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn, ErrorCode as GoogleNativeErrorCode } from '@capawesome/capacitor-google-sign-in';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';

import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';
import { isGoogleSignInUnsupportedOrigin } from './google-signin-origin';
import { isServerFailure } from '../api/server-failure';
import { AuthTokenResponse } from '../models/auth.model';

// =====================================================================
// [BUG-17] المسار الأصلي (native) — Google تحظر صراحةً تدفقات OAuth
// الخاصة بها (SDK الويب أعلاه، ux_mode: 'popup') داخل WKWebView/WebView
// مضمّن، لذا لا يعمل هذا الكود إطلاقاً داخل تطبيق Capacitor (iOS/Android).
// الحل: عند Capacitor.isNativePlatform()، نستدعي مكوّناً أصلياً حقيقياً
// (@capawesome/capacitor-google-sign-in، @capacitor-community/apple-sign-in)
// بدل SDK الويب، ثم نمرّر idToken/identityToken الناتج لنفس
// authApi.loginWithGoogle()/loginWithApple() الموجودين أصلاً — الباك اند
// لا يتغيّر، فهو يتحقق من التوكن بصرف النظر عن مصدره. مسار الويب أعلاه
// (وكل منطق [FIX-1]/[FIX-2]) بقي كما هو تماماً، بلا حذف أو تعديل.
// =====================================================================

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
          /* [BUG-21] الزر الموثوق الحقيقي — يُنشأ مخفياً، النقرة عليه
             تُطلَق برمجياً من داخل معالج نقرة المستخدم الحقيقية */
          renderButton: (
            parent: HTMLElement,
            options?: { type?: 'standard' | 'icon'; theme?: string; size?: string }
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

  /* [BUG-21] حالة الزر المخفي — تُهيَّأ مرة واحدة فقط لكل جلسة صفحة */
  private googleButtonPromise?: Promise<HTMLElement>;
  private googleInitialized = false;
  /* المستدعي (observer) النشط حالياً — initialize() يُستدعى مرة واحدة
     فقط، فكل نقرة تُسجِّل نفسها هنا قبل استدعاء click() على الزر المخفي */
  private activeGoogleCredentialHandler?: (idToken: string | undefined) => void;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly translate: TranslateService
  ) {
    /* [BUG-21] تحميل مسبق استباقي: يبدأ تحميل سكربت GSI وتجهيز الزر
       المخفي فور إنشاء الخدمة (عادة عند فتح صفحة الدخول)، بدل الانتظار
       حتى أول نقرة. الهدف: بحلول لحظة نقرة المستخدم الحقيقية، يكون كل
       شيء جاهزاً بالفعل فتُنفَّذ click() ضمن microtask متزامنة مع النقرة
       (لا فجوة شبكية بعد النقرة) — هذا بالضبط ما أثبت الاختبار الحي أنه
       يحافظ على "user activation" اللازم لعمل الزر المخفي بشكل موثوق. */
    if (this.isGoogleAvailable) {
      void this.ensureGoogleButtonReady().catch(() => {
        /* فشل التحميل المسبق ليس خطأً يستحق الإزعاج الآن — سيُعاد
           المحاولة (وتُبلَّغ كخطأ حقيقي) عند أول نقرة فعلية */
      });
    }
  }

  get isGoogleAvailable(): boolean {
    return (
      Boolean(environment.googleClientId?.trim()) &&
      !isGoogleSignInUnsupportedOrigin(typeof window === 'undefined' ? null : window.location.hostname)
    );
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

      /* [BUG-17] مسار أصلي بديل بالكامل عن مسار الويب أدناه (بما فيه زر
         BUG-21 المخفي) — انظر تعليق الرأس. يُعيَّن backendSubscription عبر
         callback لأن الفرع الأصلي غير متزامن (Promise) بينما مسار الويب
         أدناه يستخدم إغلاقاً (closure) مباشراً على نفس المتغيّر. نفس نمط
         الفرع المبكر في loginWithApple() أدناه بالضبط. */
      if (Capacitor.isNativePlatform()) {
        this.loginWithGoogleNative(observer, sub => {
          backendSubscription = sub;
        });

        return () => backendSubscription?.unsubscribe();
      }

      /* [BUG-21] هذا الاستدعاء يُسجَّل كمعالج الاعتماد النشط الوحيد —
         initialize() نفسه يُستدعى مرة واحدة فقط (انظر ensureGoogleButtonReady)
         ويوجّه كل credential يصل لأحدث معالج مسجَّل هنا */
      this.activeGoogleCredentialHandler = idToken => {
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
      };

      this.ensureGoogleButtonReady()
        .then(buttonEl => {
          /* [BUG-21] النقرة البرمجية هنا تقع ضمن سلسلة .then() متزامنة
             (microtask) بدل استدعاء fetch/script.onload جديد — إن كان
             الزر مُجهَّزاً مسبقاً (الحالة الشائعة، بفضل التحميل الاستباقي
             في المُنشئ)، تُنفَّذ هذه دون أي فجوة شبكية بعد نقرة المستخدم */
          buttonEl.click();
        })
        .catch(error => observer.error(error));

      return () => {
        backendSubscription?.unsubscribe();
        this.activeGoogleCredentialHandler = undefined;
      };
    });

    /* [FIX-1 - ب] شبكة أمان: حتى لو فشل ما سبق لأي سبب غير متوقع (تعليق
       شبكي حقيقي، أو الزر المخفي لا يستدعي أي callback إطلاقاً)، لا يبقى
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

  /**
   * [BUG-21] يجهّز زر Google الحقيقي (renderButton) خارج الشاشة، مرة
   * واحدة لكل جلسة صفحة، ويُعيد العنصر القابل للنقر بداخله. مُخزَّن
   * (cached) عبر googleButtonPromise حتى لا يُعاد التهيئة (initialize()
   * يُصدر تحذيراً من Google نفسها إن استُدعي أكثر من مرة).
   */
  private ensureGoogleButtonReady(): Promise<HTMLElement> {
    if (this.googleButtonPromise) {
      return this.googleButtonPromise;
    }

    this.googleButtonPromise = this.loadGoogleScript().then(() => {
      if (!window.google?.accounts?.id) {
        throw new Error(this.t('AUTH.ERRORS.GOOGLE_SDK_UNAVAILABLE'));
      }

      if (!this.googleInitialized) {
        window.google.accounts.id.initialize({
          client_id: environment.googleClientId,
          ux_mode: 'popup',
          callback: response => {
            this.activeGoogleCredentialHandler?.(response.credential);
          }
        });
        this.googleInitialized = true;
      }

      const container = document.createElement('div');
      container.id = 'google-signin-hidden-button';
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      window.google.accounts.id.renderButton(container, { type: 'standard' });

      return this.waitForClickableElement(container);
    });

    return this.googleButtonPromise;
  }

  /** [BUG-21] renderButton() يُنشئ iframe داخلياً بعد لحظات — ننتظره بحد أقصى معقول بدل الفشل الفوري */
  private waitForClickableElement(container: HTMLElement): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 8000;

      const poll = (): void => {
        const clickable =
          container.querySelector<HTMLElement>('div[role="button"]') ??
          container.querySelector<HTMLElement>('iframe');

        if (clickable) {
          resolve(clickable);
          return;
        }

        if (Date.now() > deadline) {
          reject(new Error(this.t('AUTH.ERRORS.GOOGLE_SDK_UNAVAILABLE')));
          return;
        }

        setTimeout(poll, 150);
      };

      poll();
    });
  }

  loginWithApple(): Observable<AuthTokenResponse> {
    const raw$ = new Observable<AuthTokenResponse>(observer => {
      let backendSubscription: Subscription | undefined;

      if (!this.isAppleAvailable) {
        observer.error(new Error(this.t('AUTH.ERRORS.APPLE_NOT_CONFIGURED')));
        return undefined;
      }

      /* [BUG-17] مسار أصلي — انظر تعليق رأس الملف. Apple تفرض فعلياً
         "Sign in with Apple" الأصلي (ASAuthorizationAppleIDProvider) لأي
         زر دخول داخل تطبيق iOS، بصرف النظر عن WebView. */
      if (Capacitor.isNativePlatform()) {
        this.loginWithAppleNative(observer, sub => {
          backendSubscription = sub;
        });

        return () => backendSubscription?.unsubscribe();
      }

      this.loadAppleScript()
        .then(() => {
          if (!window.AppleID?.auth) {
            throw new Error(this.t('AUTH.ERRORS.APPLE_SDK_UNAVAILABLE'));
          }

          const redirectUri =
            environment.appleRedirectUri?.trim() ||
            `${window.location.origin}/auth/apple/callback`;

          // ✅ B-16 (RELEASE-BLOCKERS-AR.md): the raw nonce must be captured here, once,
          // because AppleID.auth.signIn()'s response never echoes it back — the only trace
          // of it afterwards is the (hashed) "nonce" claim inside the returned identity
          // token. The same raw value goes to Apple via init() and to our own backend below,
          // so AppleTokenVerifier can hash it the same way and compare.
          const nonce = this.createRandomValue();

          window.AppleID.auth.init({
            clientId: environment.appleClientId,
            scope: 'name email',
            redirectURI: redirectUri,
            state: this.createRandomValue(),
            nonce,
            usePopup: true
          });

          return window.AppleID.auth.signIn().then(response => ({ response, nonce }));
        })
        .then(({ response, nonce }) => {
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
            lastName,
            nonce
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

    // خطأ الخادم (5xx): جسمه "An unexpected error occurred..." بالإنجليزية دائماً، فيُترجَم بدل أن يُعرض.
    if (isServerFailure(error)) {
      return this.t('AUTH.ERRORS.SOCIAL_SERVER_ERROR');
    }

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

    return this.t('AUTH.ERRORS.SOCIAL_GENERIC_FAILED');
  }

  /* [BUG-17] مسار Google الأصلي. لا نافذة منبثقة، لا SDK ويب — استدعاء
     مباشر لمكوّن Capacitor أصلي حقيقي (Credential Manager على Android،
     Google Sign-In SDK على iOS). يتطلب "web client ID" (وليس Android/iOS
     Client ID) حتى على الأجهزة الأصلية — انظر environment.googleClientId. */
  private loginWithGoogleNative(
    observer: Subscriber<AuthTokenResponse>,
    setBackendSubscription: (sub: Subscription) => void
  ): void {
    GoogleSignIn.initialize({ clientId: environment.googleClientId })
      .then(() => GoogleSignIn.signIn())
      .then(result => {
        if (!result.idToken) {
          observer.error(new Error(this.t('AUTH.ERRORS.GOOGLE_NO_TOKEN')));
          return;
        }

        const sub = this.authApi.loginWithGoogle({ idToken: result.idToken }).subscribe({
          next: tokenResponse => {
            observer.next(tokenResponse);
            observer.complete();
          },
          error: error => observer.error(error)
        });

        setBackendSubscription(sub);
      })
      .catch((error: unknown) => {
        observer.error(new Error(this.mapGoogleNativeError(error)));
      });
  }

  /** [BUG-17] يترجم ErrorCode المكتوب لمكوّن Google الأصلي إلى مفتاح ترجمة */
  private mapGoogleNativeError(error: unknown): string {
    const code = (error as { code?: string } | undefined)?.code;

    if (code === GoogleNativeErrorCode.SignInCanceled) {
      return this.t('AUTH.ERRORS.GOOGLE_SIGNIN_CANCELED');
    }

    if (code === GoogleNativeErrorCode.NoCredentialAvailable) {
      return this.t('AUTH.ERRORS.GOOGLE_NO_ACCOUNT');
    }

    return this.t('AUTH.ERRORS.GOOGLE_SDK_UNAVAILABLE');
  }

  /* [BUG-17] مسار Apple الأصلي — ASAuthorizationAppleIDProvider عبر
     الإضافة. نفس منطق nonce/B-16 الموجود في المسار الويب أعلاه بالضبط:
     القيمة الخام تُلتقط مرة واحدة هنا وتُرسَل للباك اند ليقارنها بعد تجزئتها،
     لأن authorize() لا يُعيد الـ nonce الخام أبداً في استجابته. */
  private loginWithAppleNative(
    observer: Subscriber<AuthTokenResponse>,
    setBackendSubscription: (sub: Subscription) => void
  ): void {
    const redirectUri =
      environment.appleRedirectUri?.trim() ||
      `${window.location.origin}/auth/apple/callback`;
    const nonce = this.createRandomValue();

    SignInWithApple.authorize({
      clientId: environment.appleClientId,
      redirectURI: redirectUri,
      scopes: 'name email',
      state: this.createRandomValue(),
      nonce
    })
      .then(({ response }) => {
        const identityToken = response.identityToken;

        if (!identityToken) {
          observer.error(new Error(this.t('AUTH.ERRORS.APPLE_NO_TOKEN')));
          return;
        }

        const sub = this.authApi.loginWithApple({
          identityToken,
          authorizationCode: response.authorizationCode ?? null,
          firstName: response.givenName ?? null,
          lastName: response.familyName ?? null,
          nonce
        }).subscribe({
          next: tokenResponse => {
            observer.next(tokenResponse);
            observer.complete();
          },
          error: error => observer.error(error)
        });

        setBackendSubscription(sub);
      })
      .catch(() => {
        observer.error(new Error(this.t('AUTH.ERRORS.APPLE_SDK_UNAVAILABLE')));
      });
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


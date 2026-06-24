import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokenResponse } from './token-storage.service';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }): void;
          prompt(callback?: (notification: {
            isNotDisplayed(): boolean;
            isSkippedMoment(): boolean;
          }) => void): void;
          cancel(): void;
        };
      };
    };
    AppleID?: {
      auth: {
        init(config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup?: boolean;
        }): void;
        signIn(): Promise<{
          authorization: { code: string; id_token: string };
          user?: { name?: { firstName?: string; lastName?: string }; email?: string };
        }>;
      };
    };
  }
}

@Injectable({ providedIn: 'root' })
export class SocialAuthService {
  private readonly http = inject(HttpClient);
  private googleLoaded = false;
  private appleLoaded = false;

  get isGoogleAvailable(): boolean {
    return !!environment.googleClientId;
  }

  get isAppleAvailable(): boolean {
    return !!environment.appleClientId && !!environment.appleRedirectUri;
  }

  loginWithGoogle(): Observable<AuthTokenResponse> {
    return from(this.loadScript('google', 'https://accounts.google.com/gsi/client')).pipe(
      switchMap(() => this.googlePrompt()),
      switchMap(idToken => this.http.post<AuthTokenResponse>(
        `${environment.apiUrl}/auth/social/google`,
        { idToken }
      ))
    );
  }

  loginWithApple(): Observable<AuthTokenResponse> {
    return from(this.loadScript(
      'apple',
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
    )).pipe(
      switchMap(() => this.appleSignIn()),
      switchMap(payload => this.http.post<AuthTokenResponse>(
        `${environment.apiUrl}/auth/social/apple`,
        payload
      ))
    );
  }

  private googlePrompt(): Observable<string> {
    return new Observable<string>(observer => {
      window.google!.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: response => {
          observer.next(response.credential);
          observer.complete();
        }
      });

      window.google!.accounts.id.prompt(notification => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          observer.error(new Error('GOOGLE_POPUP_CLOSED'));
        }
      });

      return () => window.google?.accounts.id.cancel();
    });
  }

  private appleSignIn(): Observable<{
    identityToken: string;
    authorizationCode: string;
    firstName?: string;
    lastName?: string;
  }> {
    return new Observable(observer => {
      window.AppleID!.auth.init({
        clientId: environment.appleClientId,
        scope: 'name email',
        redirectURI: environment.appleRedirectUri,
        usePopup: true
      });

      window.AppleID!.auth.signIn()
        .then(response => {
          observer.next({
            identityToken: response.authorization.id_token,
            authorizationCode: response.authorization.code,
            firstName: response.user?.name?.firstName,
            lastName: response.user?.name?.lastName
          });
          observer.complete();
        })
        .catch(error => observer.error(
          new Error(error?.error === 'popup_closed_by_user' ? 'APPLE_POPUP_CLOSED' : 'APPLE_ERROR')
        ));
    });
  }

  private loadScript(id: 'google' | 'apple', src: string): Promise<void> {
    const loaded = id === 'google' ? this.googleLoaded : this.appleLoaded;
    if (loaded) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (id === 'google') {
          this.googleLoaded = true;
        } else {
          this.appleLoaded = true;
        }
        resolve();
      };
      script.onerror = () => reject(new Error(`${id.toUpperCase()}_SCRIPT_LOAD_FAILED`));
      document.head.appendChild(script);
    });
  }

  getSocialErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const map: Record<string, string> = {
      GOOGLE_POPUP_CLOSED: 'تم إغلاق نافذة Google. حاول مرة أخرى.',
      GOOGLE_SCRIPT_LOAD_FAILED: 'تعذر الاتصال بـ Google. تحقق من اتصالك.',
      APPLE_POPUP_CLOSED: 'تم إغلاق نافذة Apple. حاول مرة أخرى.',
      APPLE_SCRIPT_LOAD_FAILED: 'تعذر الاتصال بـ Apple.',
      APPLE_ERROR: 'حدث خطأ في تسجيل الدخول بـ Apple.'
    };

    return map[message] ?? 'حدث خطأ في التسجيل الاجتماعي. حاول لاحقاً.';
  }
}

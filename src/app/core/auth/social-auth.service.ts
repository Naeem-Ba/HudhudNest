import { Injectable } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

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
          prompt: (callback?: (notification: unknown) => void) => void;
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


@Injectable({
  providedIn: 'root'
})
export class SocialAuthService {
  private googleScriptPromise?: Promise<void>;
  private appleScriptPromise?: Promise<void>;

  constructor(private readonly authApi: AuthApiService) {}

  get isGoogleAvailable(): boolean {
    return Boolean(environment.googleClientId?.trim());
  }

  get isAppleAvailable(): boolean {
    return Boolean(environment.appleClientId?.trim());
  }

  loginWithGoogle(): Observable<AuthTokenResponse> {
    return new Observable<AuthTokenResponse>(observer => {
      let backendSubscription: Subscription | undefined;

      if (!this.isGoogleAvailable) {
        observer.error(new Error('Google Client ID is not configured.'));
        return undefined;
      }

      this.loadGoogleScript()
        .then(() => {
          if (!window.google?.accounts?.id) {
            throw new Error('Google Identity Services is not available.');
          }

          window.google.accounts.id.initialize({
            client_id: environment.googleClientId,
            ux_mode: 'popup',
            cancel_on_tap_outside: true,
            callback: response => {
              const idToken = response.credential;

              if (!idToken) {
                observer.error(new Error('Google did not return an ID token.'));
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

          window.google.accounts.id.prompt();
        })
        .catch(error => observer.error(error));

      return () => {
        backendSubscription?.unsubscribe();
      };
    });
  }

  loginWithApple(): Observable<AuthTokenResponse> {
    return new Observable<AuthTokenResponse>(observer => {
      let backendSubscription: Subscription | undefined;

      if (!this.isAppleAvailable) {
        observer.error(new Error('Apple Client ID is not configured.'));
        return undefined;
      }

      this.loadAppleScript()
        .then(() => {
          if (!window.AppleID?.auth) {
            throw new Error('Apple Sign In is not available.');
          }

          const redirectUri =
            environment.appleRedirectUri?.trim() ||
            `${window.location.origin}/auth/apple/callback`;

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
            throw new Error('Apple did not return an identity token.');
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

    if (typedError.message) {
      return typedError.message;
    }

    if (typedError.status === 400) {
      return 'Social login request was rejected by the server.';
    }

    if (typedError.status === 401) {
      return 'Social login token was rejected by the server.';
    }

    if (typedError.status === 500) {
      return 'Server error while processing social login.';
    }

    return 'Social login failed. Please try again.';
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

}
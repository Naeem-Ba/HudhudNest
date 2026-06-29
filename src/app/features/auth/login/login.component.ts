import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SocialAuthService } from '../../../core/auth/social-auth.service';
import { AuthTokenResponse, TokenStorageService } from '../../../core/services/token-storage.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

interface LoginFormModel {
  Email: string;
  Password: string;
}

interface RegisterFormModel {
  FirstName: string;
  LastName: string;
  Email: string;
  Password: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, ImageFallbackDirective],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginData: LoginFormModel = {
    Email: '',
    Password: ''
  };

registerData: RegisterFormModel = {
  FirstName: '',
  LastName: '',
  Email: '',
  Password: ''
};

  showRegister = false;
  message = '';
  success = false;
  showPass = false;
  showPassReg = false;
  loading = false;
  submitted = false;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthService,
    private readonly socialAuth: SocialAuthService,
    private readonly tokenStorage: TokenStorageService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly translate: TranslateService,
    private readonly toast: ToastService
  ) {}

  get googleAvailable(): boolean {
    return this.socialAuth.isGoogleAvailable;
  }

  get appleAvailable(): boolean {
    return this.socialAuth.isAppleAvailable;
  }

  onLogin(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    if (form.invalid || this.loading) {
      this.setError(this.t('AUTH.ERRORS.FIX_FIELDS'));
      return;
    }

    this.loading = true;
    this.message = '';

    const request = {
      email: this.loginData.Email.trim().toLowerCase(),
      password: this.loginData.Password
    };

    this.authApi.login(request).subscribe({
      next: () => {
        this.refreshAuthState();
        this.completeLoginSuccess();
      },
      error: () => {
        this.loading = false;
        this.setError(this.t('AUTH.ERRORS.INVALID_CREDENTIALS'));
      }
    });
  }

  onGoogleLogin(): void {
    if (this.loading || !this.googleAvailable) {
      return;
    }

    this.loading = true;
    this.message = '';

    this.socialAuth.loginWithGoogle().subscribe({
      next: response => this.completeSocialLogin(response),
      error: error => {
        this.loading = false;
        this.setError(this.socialAuth.getSocialErrorMessage(error));
      }
    });
  }

  onAppleLogin(): void {
    if (this.loading || !this.appleAvailable) {
      return;
    }

    this.loading = true;
    this.message = '';

    this.socialAuth.loginWithApple().subscribe({
      next: response => this.completeSocialLogin(response),
      error: error => {
        this.loading = false;
        this.setError(this.socialAuth.getSocialErrorMessage(error));
      }
    });
  }

  onRegister(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    if (form.invalid || this.loading) {
      this.setError(this.t('AUTH.ERRORS.FIX_FIELDS'));
      return;
    }

    this.loading = true;
    this.message = '';

    const firstName = this.registerData.FirstName.trim();
    const lastName = this.registerData.LastName.trim();
    const email = this.registerData.Email.trim().toLowerCase();
    const password = this.registerData.Password;

    const validationMessage = this.validateRegisterForm(firstName, lastName, email, password);
    if (validationMessage) {
      this.loading = false;
      this.setError(validationMessage);
      return;
    }

    this.authApi.register({ firstName, lastName, email, password }).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.message = this.t('AUTH.REGISTER_SUCCESS');
        this.toast.success(this.message);
        this.showRegister = false;
        this.submitted = false;

        this.loginData.Email = email;
        this.loginData.Password = '';
        this.registerData = {
  FirstName: '',
  LastName: '',
  Email: '',
  Password: ''
};
      },
      error: error => {
        this.loading = false;
        this.setError(this.getRegisterErrorMessage(error));
      }
    });
  }

  toggleRegister(): void {
    this.showRegister = !this.showRegister;
    this.message = '';
    this.success = false;
    this.submitted = false;
  }

  private completeSocialLogin(response: AuthTokenResponse): void {
    this.tokenStorage.storeTokens(response, false);
    this.refreshAuthState();
    this.completeLoginSuccess();
  }

  private completeLoginSuccess(): void {
    this.loading = false;
    this.success = true;
    this.message = this.t('AUTH.LOGIN_SUCCESS');
    this.toast.success(this.message);

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/home';
    void this.router.navigateByUrl(returnUrl);
  }

  private refreshAuthState(): void {
    const authState = this.authState as unknown as {
      restoreSession?: () => void;
      validateSession?: () => void;
    };

    authState.restoreSession?.();
    authState.validateSession?.();
  }

  private validateRegisterForm(firstName: string, lastName: string, email: string, password: string): string | null {
    if (!firstName || !lastName) {
      return this.t('AUTH.ERRORS.FULL_NAME_REQUIRED');
    }

    if (!email) {
      return this.t('AUTH.ERRORS.EMAIL_REQUIRED');
    }

    if (/\s/.test(email)) {
      return this.t('AUTH.ERRORS.EMAIL_NO_SPACES');
    }

    if (!this.isValidEmail(email)) {
      return this.t('AUTH.ERRORS.INVALID_EMAIL');
    }

    if (!password) {
      return this.t('AUTH.ERRORS.PASSWORD_REQUIRED');
    }

    if (password.length < 8) {
      return this.t('AUTH.ERRORS.PASSWORD_MIN');
    }

    return null;
  }

  private setError(message: string): void {
    this.loading = false;
    this.success = false;
    this.message = message;
    this.toast.error(message);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private getRegisterErrorMessage(error: unknown): string {
    const response = error as {
      error?: {
        message?: string;
        errors?: Record<string, string[]>;
      };
    };

    const backendMessage = response.error?.message;
    if (backendMessage) {
      return backendMessage;
    }

    const backendErrors = response.error?.errors;
    if (backendErrors) {
      const messages = Object.values(backendErrors).flat();
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }

    return this.t('AUTH.ERRORS.REGISTER_FAILED');
  }

  private t(key: string): string {
    return this.translate.instant(key);
  }
}
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../core/services/auth-api.service';

interface LoginFormModel {
  Email: string;
  Password: string;
}

interface RegisterFormModel {
  Name?: string;
  Email: string;
  Password: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginData: LoginFormModel = {
    Email: '',
    Password: ''
  };

  registerData: RegisterFormModel = {
    Name: '',
    Email: '',
    Password: ''
  };

  showRegister = false;
  message = '';
  success = false;
  showPass = false;
  showPassReg = false;
  loading = false;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {}

  onLogin(): void {
    if (this.loading) {
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
        this.success = true;
        this.message = 'Login erfolgreich!';

        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/home';

        setTimeout(() => {
          this.router.navigateByUrl(returnUrl);
        }, 300);
      },
      error: () => {
        this.loading = false;
        this.success = false;
        this.message = 'E-Mail oder Passwort ist falsch.';
      }
    });
  }

  onRegister(): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.message = '';

    const fullName = (this.registerData.Name ?? '').trim();
    const email = this.registerData.Email.trim().toLowerCase();
    const password = this.registerData.Password;

    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const validationMessage = this.validateRegisterForm(firstName, lastName, email, password);
    if (validationMessage) {
      this.loading = false;
      this.success = false;
      this.message = validationMessage;
      return;
    }

    const request = {
      firstName,
      lastName,
      email,
      password
    };

    this.authApi.register(request).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.message = 'Registrierung erfolgreich! Bitte einloggen.';
        this.showRegister = false;

        this.loginData.Email = email;
        this.loginData.Password = '';
        this.registerData.Password = '';
      },
      error: (error) => {
        this.loading = false;
        this.success = false;
        this.message = this.getRegisterErrorMessage(error);
      }
    });
  }

  toggleRegister(): void {
    this.showRegister = !this.showRegister;
    this.message = '';
    this.success = false;
  }

  private validateRegisterForm(
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ): string | null {
    if (!firstName || !lastName) {
      return 'Bitte geben Sie Ihren vollständigen Namen ein.';
    }

    if (!email) {
      return 'Bitte geben Sie Ihre E-Mail-Adresse ein.';
    }

    if (/\s/.test(email)) {
      return 'Die E-Mail-Adresse darf keine Leerzeichen enthalten.';
    }

    if (!this.isValidEmail(email)) {
      return 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
    }

    if (!password) {
      return 'Bitte geben Sie ein Passwort ein.';
    }

    if (password.length < 8) {
      return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
    }

    return null;
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

    return 'Fehler bei der Registrierung. Bitte prüfen Sie Ihre Eingaben.';
  }
}
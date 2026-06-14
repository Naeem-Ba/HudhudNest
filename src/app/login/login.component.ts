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
      email: this.loginData.Email,
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
  const nameParts = fullName.split(/\s+/).filter(Boolean);

  const firstName = nameParts[0] || 'User';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  const request = {
    firstName,
    lastName,
    email: this.registerData.Email,
    password: this.registerData.Password
  };

  this.authApi.register(request).subscribe({
    next: () => {
      this.loading = false;
      this.success = true;
      this.message = 'Registrierung erfolgreich! Bitte einloggen.';
      this.showRegister = false;
    },
    error: () => {
      this.loading = false;
      this.success = false;
      this.message = 'Fehler bei der Registrierung.';
    }
  });
}

  toggleRegister(): void {
    this.showRegister = !this.showRegister;
    this.message = '';
    this.success = false;
  }
}
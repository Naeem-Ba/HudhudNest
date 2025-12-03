import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BenutzerService, Benutzer } from '../services/benutzer.service';
import { AuthService} from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['login.component.scss']
})
export class LoginComponent {
  loginData: Benutzer = { Email: '', PasswordHash: '' };
  registerData: Benutzer = { Name: '', Email: '', PasswordHash: '' };
  showRegister = false;
  message = '';
  showPass = false;
  showPassReg = false;
  success = false;

  constructor(private benutzerService: BenutzerService, private router: Router,private authService: AuthService) {}

  onLogin() {
  this.benutzerService.login(this.loginData).subscribe({
    next: (userData) => {
      this.success = true;
      this.message = 'Login erfolgreich!';
      this.authService.login(userData);

      // 🔥 بعد نجاح تسجيل الدخول
      setTimeout(() => this.router.navigate(['/home']), 800);
    },
    error: (err) => {
      this.success = false;
      this.message = 'E-Mail oder Passwort ist falsch.';
    }
  });
  }

  onRegister() {
    this.benutzerService.register(this.registerData).subscribe({
      next: (user) => {
        this.success = true;
        this.message = 'Registrierung erfolgreich! Bitte einloggen.';
        this.showRegister = false;
      },
      error: (err) => {
        this.success = false;
        this.message = 'Fehler bei der Registrierung.';
      }
    });
  }

  toggleRegister() {
    this.showRegister = !this.showRegister;
    this.message = '';
  }
}

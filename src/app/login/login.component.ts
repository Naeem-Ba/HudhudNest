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
  templateUrl: './login.component.html'
})
export class LoginComponent {
  loginData: Benutzer = { Email: '', PasswordHash: '' };
  registerData: Benutzer = { Name: '', Email: '', PasswordHash: '' };
  showRegister = false;
  message = '';

  constructor(private benutzerService: BenutzerService, private router: Router,private authService: AuthService) {}

  onLogin() {
  this.benutzerService.login(this.loginData).subscribe({
    next: (userData) => {
      this.message = 'Login erfolgreich!';
      localStorage.setItem('loggedUser', JSON.stringify(userData));

      // 🔥 بعد نجاح تسجيل الدخول
      this.authService.login(userData);
      this.router.navigate(['/home']);
    },
    error: (err) => {
      this.message = 'Fehler beim Login.';
      console.error('Fehler beim Login:', err);
    }
  });
  }

  onRegister() {
    this.benutzerService.register(this.registerData).subscribe({
      next: (user) => {
        this.message = 'Registrierung erfolgreich! Du kannst dich jetzt einloggen.';
        this.showRegister = false;
      },
      error: (err) => {
        this.message = 'Fehler bei der Registrierung.';
        console.error(err);
      }
    });
  }

  toggleRegister() {
    this.showRegister = !this.showRegister;
    this.message = '';
  }
}

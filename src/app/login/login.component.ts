import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BenutzerService, Benutzer } from '../services/benutzer.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginData: Benutzer = { Email: '', Password: '' };
  registerData: Benutzer = { Name: '', Email: '', Password: '' };
  showRegister = false;
  message = '';
  success = false;
  showPass = false;
  showPassReg = false;

  constructor(
    private benutzerService: BenutzerService,
    private authService: AuthService,
    private router: Router
  ) {}

  onLogin() {
    this.benutzerService.login(this.loginData).subscribe({
      next: () => {
        this.success = true;
        this.message = 'Login erfolgreich!';

        setTimeout(() => {
          this.router.navigate(['/home']);
        }, 600);
      },
      error: () => {
        this.success = false;
        this.message = 'E-Mail oder Passwort ist falsch.';
      }
    });
  }

  onRegister() {
    this.benutzerService.register(this.registerData).subscribe({
      next: () => {
        this.success = true;
        this.message = 'Registrierung erfolgreich! Bitte einloggen.';
        this.showRegister = false;
      },
      error: () => {
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

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BenutzerService, Benutzer } from '../services/benutzer.service';

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

  constructor(private benutzerService: BenutzerService) {}

  onLogin() {
    console.log('Registrierungsdaten:', this.registerData);
    this.benutzerService.login(this.loginData).subscribe({
      next: (user) => {
        this.message = `Willkommen, ${user.Name || user.Email}!`;
        localStorage.setItem('loggedUser', JSON.stringify(user));
        this.showRegister = false;
      console.log('Registrierung erfolgreich:', user);
      },
      error: (err) => {
        this.message = 'Falsche E-Mail oder Passwort.';
        console.error(err);
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

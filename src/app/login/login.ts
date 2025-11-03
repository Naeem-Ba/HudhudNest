import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule,CommonModule],
  templateUrl: './login.html'
})
export class Login {
  email = '';
  password = '';
  isLoggedIn = false;

  login() {
    if (this.email && this.password) {
      this.isLoggedIn = true;
    }
  }
}

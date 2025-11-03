import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink], 
  templateUrl: './login.component.html'
})
export class LoginComponent {
  loginData = { email: '', password: '' };
  registerData = { name: '', email: '', password: '' };
  showRegister = false;

  onLogin() {
    console.log('Login:', this.loginData);
    // هنا يمكنك استدعاء API لتسجيل الدخول
  }

  toggleRegister() {
    this.showRegister = !this.showRegister;
  }

  onRegister() {
    console.log('Register:', this.registerData);
    // هنا يمكنك استدعاء API لتسجيل المستخدم الجديد
  }
}

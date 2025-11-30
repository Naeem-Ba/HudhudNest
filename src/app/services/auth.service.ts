import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.loggedIn.asObservable();

  constructor() {
     // تحقق عند تشغيل التطبيق إن كان هناك مستخدم محفوظ
    this.loggedIn.next(this.isLoggedIn());
  }

  isLoggedIn(): boolean {
  const user = localStorage.getItem('loggedUser');
  return user !== null && user !== 'undefined' && user.trim() !== '' && user !== 'null';

}


  login(userData: any) {
    localStorage.setItem('loggedUser', JSON.stringify(userData));
    this.loggedIn.next(true);
  }

  logout() {
    localStorage.removeItem('loggedUser');
    this.loggedIn.next(false);
  }
}

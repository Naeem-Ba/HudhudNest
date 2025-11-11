import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.loggedIn.asObservable();

  constructor() {
    // عند تشغيل التطبيق، تحقق إن كان هناك مستخدم فعلي (token صالح)
    this.loggedIn.next(this.isLoggedIn());
  }

  isLoggedIn(): boolean {
  const token = localStorage.getItem('token');
  // تحقق أن التوكن صالح مثلاً بفك JWT أو التأكد من تاريخه
  return !!token && token !== 'undefined' && token.trim() !== '' && token !== 'null';

}


  login(userData: any) {
    // في وقت تسجيل الدخول، خزّن token حقيقي أو بيانات المستخدم
    localStorage.setItem('token', userData.token || 'demo-token'); 
    localStorage.setItem('loggedUser', JSON.stringify(userData));
    this.loggedIn.next(true);
  }

  logout() {
    localStorage.removeItem('loggedUser');
    localStorage.removeItem('token');
    localStorage.clear();
    this.loggedIn.next(false);
  }
}

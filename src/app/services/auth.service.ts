import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AuthService {

  // ❗ نبدأ دائماً بـ false
  private loggedIn = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.loggedIn.asObservable();

  private currentUserSubject = new BehaviorSubject<any>(null);
  currentUser$ = this.currentUserSubject.asObservable();

    // لمعرفة ما إذا كان المستخدم Admin
  isAdmin$ = this.currentUser$.pipe(
    map(user => user?.Role === 'Admin')
  );

 constructor(private http: HttpClient) {
    this.validateSession(); // استدعاء واحد فقط
  }

    /**
   * يتحقق من الجلسة عبر السيرفر
   */
  validateSession(): void {
    const token = localStorage.getItem('token');

    if (!token || token === 'undefined') {
      this.logout();
      return;
    }

    this.http.get<any>('https://localhost:7136/api/auth/me')
      .subscribe({
        next: user => {
          this.currentUserSubject.next(user);
          this.loggedIn.next(true);
        },
        error: () => {
          this.logout(); // token غير صالح
        }
      });
  }

  /**
   * عند تسجيل الدخول
   */
  login(res: any): void {
    localStorage.setItem('token', res.token);
    localStorage.setItem('loggedUser', JSON.stringify(res.user));

    this.currentUserSubject.next(res.user);
    this.loggedIn.next(true);
  }

  /**
   * تسجيل الخروج
   */
  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('loggedUser');

    this.currentUserSubject.next(null);
    this.loggedIn.next(false);
  }
  updateCurrentUser(user: any) {
  this.currentUserSubject.next(user);
  localStorage.setItem('loggedUser', JSON.stringify(user));
}
}


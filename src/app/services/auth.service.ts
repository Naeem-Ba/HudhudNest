import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private loggedIn = new BehaviorSubject<boolean>(this.hasToken());
  isLoggedIn$ = this.loggedIn.asObservable();

  private currentUserSubject = new BehaviorSubject<any>(this.loadUser());
  currentUser$ = this.currentUserSubject.asObservable();

  constructor() {}

  private hasToken(): boolean {
    const token = localStorage.getItem('token');
    return token !== null && token.trim() !== '' && token !== 'undefined';
  }

  private loadUser() {
    const u = localStorage.getItem('loggedUser');
    try { return u ? JSON.parse(u) : null; }
    catch { return null; }
  }

  login(res: any) {
    localStorage.setItem('token', res.token);
    localStorage.setItem('loggedUser', JSON.stringify(res.user));

    this.currentUserSubject.next(res.user);
    this.loggedIn.next(true);
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('loggedUser');

    this.currentUserSubject.next(null);
    this.loggedIn.next(false);
  }

  // لمعرفة ما إذا كان المستخدم Admin
  isAdmin$ = this.currentUser$.pipe(
    map(user => user?.role === 'Admin')
  );
}

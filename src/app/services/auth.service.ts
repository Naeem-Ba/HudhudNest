import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.loggedIn.asObservable();
  

  private currentUserSubject = new BehaviorSubject<any>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  private normalize(user: any) {
  if (!user) return null;
  return {
    // تأكد من قراءة أي شكل قد يرد من الـ API
    email: user.email || user.Email || '',
    role: user.role || user.Role || '',
    imageUrl: user.imageUrl || user.ImageUrl || '',
    // وأنقل أي خصائص أخرى تريدها هنا
    ...user
  };
}


  constructor() {
     const userStr = localStorage.getItem('loggedUser');
  if (userStr) {
    try {
      const parsed = JSON.parse(userStr);
      const normalized = this.normalize(parsed);
      this.currentUserSubject.next(normalized);
      this.loggedIn.next(true);
    } catch (e) {
      console.error('خطأ في قراءة loggedUser من localStorage', e);
    }
  }
  }

  isLoggedIn(): boolean {
     return this.loggedIn.value;
  //const user = localStorage.getItem('loggedUser');
  //return user !== null && user !== 'undefined' && user.trim() !== '' && user !== 'null';

}


  login(userData: any) {
    const normalized = this.normalize(userData);
    localStorage.setItem('loggedUser', JSON.stringify(normalized));
    this.currentUserSubject.next(normalized);
    this.loggedIn.next(true);
  }

  logout() {
    localStorage.removeItem('loggedUser');
    this.currentUserSubject.next(null);
    this.loggedIn.next(false);
  }

  isAdmin$ = this.currentUser$.pipe(
  map(u => u?.role === 'Admin')
);


}

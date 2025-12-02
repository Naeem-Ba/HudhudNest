import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.loggedIn.asObservable();

  constructor() {
     const user = localStorage.getItem('loggedUser');
    this.loggedIn.next(!!user);
  }

  isLoggedIn(): boolean {
     return this.loggedIn.value;
  //const user = localStorage.getItem('loggedUser');
  //return user !== null && user !== 'undefined' && user.trim() !== '' && user !== 'null';

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

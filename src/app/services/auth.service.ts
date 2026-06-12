import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly loggedIn = new BehaviorSubject<boolean>(false);
  readonly isLoggedIn$ = this.loggedIn.asObservable();

  private readonly currentUserSubject = new BehaviorSubject<any>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();

  readonly isAdmin$ = this.currentUser$.pipe(
    map(user => {
      const roles = user?.roles ?? user?.Roles ?? [];
      return Array.isArray(roles) && roles.includes('Admin');
    })
  );

  constructor() {
    this.validateSession();
  }

  validateSession(): void {
    const token = this.getAccessToken();

    if (!token || token === 'undefined' || token === 'null') {
      this.clearSession();
      return;
    }

    const payload = this.decodeJwt(token);

    if (!payload) {
      this.clearSession();
      return;
    }

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      this.clearSession();
      return;
    }

    const roles = this.extractRoles(payload);

    const user = {
      id: payload.sub ?? payload.nameid ?? payload.userId ?? payload.UserId ?? '',
      Id: payload.sub ?? payload.nameid ?? payload.userId ?? payload.UserId ?? '',
      email: payload.email ?? '',
      Email: payload.email ?? '',
      displayName: payload.name ?? payload.unique_name ?? payload.email ?? '',
      DisplayName: payload.name ?? payload.unique_name ?? payload.email ?? '',
      roles,
      Roles: roles
    };

    this.currentUserSubject.next(user);
    this.loggedIn.next(true);
    sessionStorage.setItem('loggedUser', JSON.stringify(user));
  }

  login(res: any): void {
    const accessToken = res?.accessToken ?? res?.AccessToken ?? res?.token ?? res?.Token;
    const refreshToken = res?.refreshToken ?? res?.RefreshToken ?? '';

    if (accessToken) {
      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('token', accessToken);
      localStorage.setItem('token', accessToken);
    }

    if (refreshToken) {
      sessionStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('refreshToken', refreshToken);
    }

    this.validateSession();
  }

  restoreSession(): void {
    this.validateSession();
  }

  logout(): void {
    this.clearSession();
  }

  updateCurrentUser(user: any): void {
    this.currentUserSubject.next(user);
    sessionStorage.setItem('loggedUser', JSON.stringify(user));
    localStorage.setItem('loggedUser', JSON.stringify(user));
  }

  getAccessToken(): string | null {
    return (
      sessionStorage.getItem('accessToken') ||
      sessionStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('token')
    );
  }

  private clearSession(): void {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('loggedUser');

    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('loggedUser');

    this.currentUserSubject.next(null);
    this.loggedIn.next(false);
  }

  private decodeJwt(token: string): any | null {
    try {
      const payload = token.split('.')[1];

      if (!payload) {
        return null;
      }

      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map(char => '%' + ('00' + char.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private extractRoles(payload: any): string[] {
    const roleClaim =
      payload.role ??
      payload.roles ??
      payload.Roles ??
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];

    if (!roleClaim) {
      return [];
    }

    return Array.isArray(roleClaim) ? roleClaim : [roleClaim];
  }
}

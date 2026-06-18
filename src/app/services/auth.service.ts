// =====================================================================
// ✅ FIX #1b – auth.service.ts
// المشكلة: AuthService يخزّن التوكنات مباشرة في localStorage/sessionStorage
//           بالتوازي مع TokenStorageService مما يسبب تكراراً وتناقضاً
// الحل: AuthService يستخدم TokenStorageService حصراً
// =====================================================================
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { TokenStorageService } from '../core/services/token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {

  // ✅ استخدام inject() الحديث بدلاً من constructor
  private readonly tokenStorage = inject(TokenStorageService);

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

  /**
   * ✅ يتحقق من صلاحية التوكن الموجود في الذاكرة
   * يُستدعى عند بدء التطبيق أو عند الوصول لصفحة محمية
   */
  validateSession(): void {
    // ✅ قراءة من TokenStorageService (في الذاكرة) فقط
    const token = this.tokenStorage.getAccessToken();

    if (!token || token === 'undefined' || token === 'null') {
      this.clearSession();
      return;
    }

    const payload = this.decodeJwt(token);

    if (!payload) {
      this.clearSession();
      return;
    }

    // ✅ التحقق من انتهاء صلاحية التوكن
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
  }

  /**
   * ✅ تسجيل الدخول – يُخزِّن التوكنات عبر TokenStorageService فقط
   */
  login(res: any): void {
    const accessToken = res?.accessToken ?? res?.AccessToken ?? res?.token ?? res?.Token;
    const refreshToken = res?.refreshToken ?? res?.RefreshToken ?? '';

    if (accessToken) {
      // ✅ TokenStorageService يخزّن في الذاكرة فقط
      this.tokenStorage.storeTokens({ accessToken, refreshToken });
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
    // ✅ لا localStorage لبيانات المستخدم – في الذاكرة فقط
  }

  /**
   * ✅ قراءة التوكن من TokenStorageService (الذاكرة) فقط
   */
  getAccessToken(): string | null {
    return this.tokenStorage.getAccessToken();
  }

  /**
   * ✅ مسح الجلسة – يمسح الذاكرة عبر TokenStorageService
   */
  private clearSession(): void {
    this.tokenStorage.clear();
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

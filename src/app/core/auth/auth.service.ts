import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, catchError, map, Observable, of, tap } from 'rxjs';

import { AuthApiService } from './auth-api.service';
import { CsrfTokenService } from '../services/csrf-token.service';
import { ProfileService } from '../api/profile.service';
import { ServiceProviderService } from '../api/service-provider.service';
import { TokenStorageService } from '../services/token-storage.service';
export interface AuthenticatedUser {
  id: string;
  Id: string;
  email: string;
  Email: string;
  displayName: string;
  DisplayName: string;
  roles: string[];
  Roles: string[];
  ImageUrl?: string | null;
  imageUrl?: string | null;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly authApi = inject(AuthApiService);
  private readonly csrfTokenService = inject(CsrfTokenService);
  private readonly profileService = inject(ProfileService);
  private readonly serviceProviderService = inject(ServiceProviderService);

  private readonly loggedIn = new BehaviorSubject<boolean>(false);
  readonly isLoggedIn$ = this.loggedIn.asObservable();

  private readonly currentUserSubject = new BehaviorSubject<AuthenticatedUser | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();

  readonly isAdmin$ = this.currentUser$.pipe(
    map(user => user?.roles?.includes('Admin') ?? false)
  );

  constructor() {
    this.validateSession();
  }

  get currentUserSnapshot(): AuthenticatedUser | null {
    return this.currentUserSubject.value;
  }

  getCurrentUserId(): string | null {
    const user = this.currentUserSnapshot;
    return user?.id || user?.Id || null;
  }

  /**
   * Rebuilds the in-memory user state from the current access token.
   * Important: when the access token is missing/expired, we do not clear the
   * refresh token here. The app initializer/interceptor may still use it to
   * recover the session safely.
   */
  validateSession(): void {
    const token = this.tokenStorage.getAccessToken();

    if (!token || token === 'undefined' || token === 'null') {
      this.setAnonymousState();
      return;
    }

    const payload = this.decodeJwt(token);

    if (!payload) {
      this.tokenStorage.setAccessToken(null);
      this.setAnonymousState();
      return;
    }

    const expiresAtSeconds = this.readNumericClaim(payload, 'exp');
    if (expiresAtSeconds !== null && Date.now() >= expiresAtSeconds * 1000) {
      this.tokenStorage.setAccessToken(null);
      this.setAnonymousState();
      return;
    }

    const roles = this.extractRoles(payload);
    const id = String(payload.sub ?? payload.nameid ?? payload.userId ?? payload.UserId ?? '');
    const email = String(payload.email ?? '');
    // ⚠️ "name"/"unique_name" بالتوكن هو Identity UserName (عادةً نفس البريد)،
    // وليس حقل "الاسم المعروض" (DisplayName) القابل للتعديل من صفحة البروفايل.
    // هذه قيمة مؤقتة فورية فقط، تُستبدَل بالقيمة الحقيقية بمجرد وصول
    // hydrateProfile() أدناه — راجع تعليقها لتفاصيل الخلل الذي يُصلحه.
    const displayName = String(payload.name ?? payload.unique_name ?? payload.email ?? '');

    this.currentUserSubject.next({
      id,
      Id: id,
      email,
      Email: email,
      displayName,
      DisplayName: displayName,
      roles,
      Roles: roles
    });
    this.loggedIn.next(true);

    this.hydrateProfile();
  }

  /**
   * ✅ إصلاح: DisplayName وصورة البروفايل (ImageUrl) هما حقلا عمل يُعدَّلان من
   * صفحة البروفايل، لكن validateSession() أعلاه تبنيهما فقط من claims التوكن —
   * الذي لا يحمل رابط صورة إطلاقاً، ويحمل لـ"الاسم" قيمة Identity UserName لا
   * DisplayName الفعلي. النتيجة: حفظ الصورة/الاسم المعروض من صفحة البروفايل
   * كان يظهر فورًا (لأن ProfileComponent.syncAuthStateFromProfile تستدعي
   * updateCurrentUser() مباشرة)، لكنه يرتدّ للقيم القديمة فور أي إعادة تحميل
   * للصفحة أو تجديد جلسة، لأن validateSession() تُعاد من الصفر من التوكن فقط
   * في كل مرة. نجلب هنا القيم الصحيحة من GET /users/me (نفس نداء
   * ProfileComponent.fetchProfile) وندمجها في الحالة المشتركة كي يستفيد كل
   * مستهلكي currentUser$ (شريط التنقل مثلاً) لا صفحة البروفايل وحدها.
   * فشل الجلب متسامَح معه بالكامل — إثراء اختياري لا يجب أن يعطّل تسجيل الدخول.
   */
  private hydrateProfile(): void {
    this.profileService
      .getMe()
      .pipe(catchError(() => of(null)))
      .subscribe(profile => {
        if (!profile) {
          return;
        }

        this.updateCurrentUser({
          DisplayName: profile.DisplayName,
          displayName: profile.DisplayName,
          ImageUrl: profile.ImageUrl ?? null,
          imageUrl: profile.ImageUrl ?? null
        });
      });
  }

  /**
   * Stores the access token from a login/refresh response, then rebuilds auth state.
   * RELEASE-BLOCKERS-AR.md B-13: no refresh token to read here any more — it never appears
   * in the response body, only in the HttpOnly cookie.
   */
  login(response: unknown): void {
    const res = (response ?? {}) as Record<string, unknown>;
    const accessToken = res['accessToken'] ?? res['AccessToken'] ?? res['token'] ?? res['Token'];

    if (typeof accessToken === 'string' && accessToken.trim()) {
      this.tokenStorage.storeTokens({ accessToken });
    }

    this.validateSession();
  }

  restoreSession(): void {
    this.validateSession();
  }

  /**
   * Performs a real logout: backend refresh-token invalidation + local cleanup.
   * Callers subscribe because this is an HTTP operation.
   */
  logout(): Observable<void> {
    return this.authApi.logout().pipe(
      tap(() => this.clearSession())
    );
  }

  /** Local-only cleanup for cases where the backend account/session is already gone. */
  logoutLocal(): void {
    this.clearSession();
  }

  updateCurrentUser(user: Partial<AuthenticatedUser> | null): void {
    if (!user) {
      this.setAnonymousState();
      return;
    }

    const current = this.currentUserSubject.value;
    const id = String(user.id ?? user.Id ?? current?.id ?? '');
    const email = String(user.email ?? user.Email ?? current?.email ?? '');
    const displayName = String(
      user.displayName ?? user.DisplayName ?? current?.displayName ?? email
    );
    const extractedRoles = this.extractRoles(user);
    const roles = extractedRoles.length > 0 ? extractedRoles : (current?.roles ?? []);

    this.currentUserSubject.next({
      ...(current ?? {}),
      ...user,
      id,
      Id: id,
      email,
      Email: email,
      displayName,
      DisplayName: displayName,
      roles,
      Roles: roles
    });
    this.loggedIn.next(true);
  }

  getAccessToken(): string | null {
    return this.tokenStorage.getAccessToken();
  }

  private clearSession(): void {
    this.tokenStorage.clear();
    // RELEASE-BLOCKERS-AR.md B-20: prevent a stale CSRF token from a previous session
    // being reused after logout.
    this.csrfTokenService.clear();
    // Account deletion (Phase 5) and plain logout both end up here: without this, the
    // just-ended session's name/email/avatar stays in ProfileService's shared profile$
    // BehaviorSubject in memory and could still render to a component that reads it before
    // the next full page reload.
    this.profileService.clearCache();
    // نفس السبب بالضبط — لا نريد لحالة "مزوّد خدمة" من الجلسة المنتهية أن تُصوَّر لحساب
    // مختلف قد يسجّل دخوله بعدها في نفس تبويب المتصفح قبل إعادة تحميل كاملة للصفحة.
    this.serviceProviderService.clearCache();
    this.setAnonymousState();
  }

  private setAnonymousState(): void {
    this.currentUserSubject.next(null);
    this.loggedIn.next(false);
  }

  private decodeJwt(token: string): Record<string, unknown> | null {
    try {
      const payload = token.split('.')[1];

      if (!payload) {
        return null;
      }

      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map(char => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
          .join('')
      );

      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Reads a numeric JWT claim safely.
   * JWT payload is decoded as unknown values, so arithmetic is only allowed after validation.
   */
  private readNumericClaim(source: Record<string, unknown>, claimName: string): number | null {
    const rawValue = source[claimName];
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);

    return Number.isFinite(numericValue) ? numericValue : null;
  }
  private extractRoles(source: Record<string, unknown>): string[] {
    const roleClaim =
      source['role'] ??
      source['roles'] ??
      source['Role'] ??
      source['Roles'] ??
      source['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];

    if (!roleClaim) {
      return [];
    }

    return Array.isArray(roleClaim) ? roleClaim.map(String) : [String(roleClaim)];
  }
}
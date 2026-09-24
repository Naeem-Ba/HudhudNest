import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, catchError, combineLatest, map, Observable, of, Subject, tap, throwError } from 'rxjs';

import { AuthApiService } from './auth-api.service';
import { CsrfTokenService } from '../services/csrf-token.service';
import { ProfileService } from '../api/profile.service';
import { ServiceProviderService } from '../api/service-provider.service';
import { TokenStorageService } from '../services/token-storage.service';

/**
 * حالات الجلسة الصريحة — إضافية فوق isLoggedIn$/currentUser$ الحاليين، وليست
 * بديلاً عنهما (كل المستهلكين الحاليين — الـ guards، navbar، إلخ — يستمرون
 * بلا أي تغيير). الهدف: تمييز "لا تزال الجلسة تُستعاد/تُجدَّد" و"جلسة انتهت
 * فعلاً" عن boolean واحد لا يفرّق بين "مجهول تأكيدياً" و"جارٍ التحقق"،
 * تماماً كما وُثِّق في قسم "التفريق بين حالات Authentication" من خطة
 * المرحلة الأولى. sessionExpired ليست حالة مستقرة — هي حدث لحظي (Subject)
 * يُطلَق فقط عند انتهاء جلسة كانت موجودة فعلاً على صفحة تتطلّب تسجيل دخول
 * (راجع notifySessionExpired ومستدعيها في refresh-auth.interceptor.ts)،
 * ثم تستقر الحالة على 'anonymous' كالمعتاد.
 */
export type AuthStatus = 'anonymous' | 'authenticated' | 'sessionRefreshing';

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

  /** انظر تعليق AuthStatus أعلاه. true فقط أثناء عملية /auth/refresh فعلية. */
  private readonly refreshingSession = new BehaviorSubject<boolean>(false);

  /**
   * حدث لحظي (وليس حالة مستقرة) — راجع تعليق AuthStatus. 'revoked' يعني تم
   * كشف إعادة استخدام refresh token (كل الجلسات أُلغيت لأسباب أمنية)؛
   * 'expired' يغطي كل حالة انتهاء أخرى (بما فيها تعارض تجديد متزامن نادر).
   * AppComponent هو المشترك الوحيد حالياً — يعرض رسالة toast مترجَمة مطابقة.
   */
  private readonly sessionExpiredEvent = new Subject<'expired' | 'revoked'>();
  readonly sessionExpired$ = this.sessionExpiredEvent.asObservable();

  readonly authStatus$: Observable<AuthStatus> = combineLatest([
    this.isLoggedIn$,
    this.refreshingSession.asObservable()
  ]).pipe(
    map(([loggedIn, refreshing]) => {
      if (refreshing) {
        return 'sessionRefreshing';
      }
      return loggedIn ? 'authenticated' : 'anonymous';
    })
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
    const id = String(payload['sub'] ?? payload['nameid'] ?? payload['userId'] ?? payload['UserId'] ?? '');
    const email = String(payload['email'] ?? '');
    // ⚠️ "name"/"unique_name" بالتوكن هو Identity UserName (عادةً نفس البريد)،
    // وليس حقل "الاسم المعروض" (DisplayName) القابل للتعديل من صفحة البروفايل.
    // هذه قيمة مؤقتة فورية فقط، تُستبدَل بالقيمة الحقيقية بمجرد وصول
    // hydrateProfile() أدناه — راجع تعليقها لتفاصيل الخلل الذي يُصلحه.
    const displayName = String(payload['name'] ?? payload['unique_name'] ?? payload['email'] ?? '');

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
   *
   * Phase 1 (Authentication & Session) fix: local cleanup used to run only in the success
   * path (tap), so a failed API call (e.g. an access token that had just expired — POST
   * /auth/logout requires [Authorize] and is deliberately excluded from the auto-refresh
   * interceptor to avoid a refresh-then-logout loop) left the in-memory token/profile/CSRF
   * state untouched even though the caller (navbar) navigates away regardless of outcome,
   * as if logout had silently no-op'd for anything still reading that state client-side
   * before the next full reload. Local state now always clears, matching what the user
   * asked for regardless of whether the server call itself succeeded.
   */
  logout(): Observable<void> {
    return this.authApi.logout().pipe(
      tap(() => this.clearSession()),
      catchError(error => {
        this.clearSession();
        return throwError(() => error);
      })
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

  /**
   * يُستدعى من app.config.ts (restoreSession عند إقلاع التطبيق) ومن
   * refresh-auth.interceptor.ts (قبل محاولة /auth/refresh) كي يعكس authStatus$
   * الحالة الفعلية 'sessionRefreshing' بدل أن يظهر المستخدم 'anonymous' مؤقتاً
   * أثناء عملية شبكة لا تزال جارية فعلاً.
   */
  beginSessionRefresh(): void {
    this.refreshingSession.next(true);
  }

  /** يُستدعى دائماً بعد انتهاء محاولة التجديد (نجاحاً أو فشلاً) — راجع beginSessionRefresh. */
  endSessionRefresh(): void {
    this.refreshingSession.next(false);
  }

  /**
   * يُطلَق فقط عند انتهاء جلسة كانت قائمة فعلاً على صفحة تتطلّب تسجيل دخول —
   * وليس لكل 401 عابر. راجع currentRouteRequiresAuth في refresh-auth.interceptor.ts،
   * وهو المستدعي الوحيد لهذه الدالة.
   */
  notifySessionExpired(reason: 'expired' | 'revoked' = 'expired'): void {
    this.refreshingSession.next(false);
    this.sessionExpiredEvent.next(reason);
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
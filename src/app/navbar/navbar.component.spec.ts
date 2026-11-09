// =====================================================================
// NavbarComponent — Phase 6: avatar/identifier in the account menu and the
// "Administration" group (collapsible, route-aware, role-gated).
// =====================================================================
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';

import { NavbarComponent, navNeedsMenuButton } from './navbar.component';
import { AuthService, AuthenticatedUser } from '../core/auth/auth.service';
import { LoginMethod } from '../core/auth/login-identifier';
import { ProfileService, UserProfile } from '../core/api/profile.service';
import { AgenciesApiService } from '../core/api/agencies-api.service';
import { Agency } from '../core/models/agency.model';
import { ServiceProviderService } from '../core/api/service-provider.service';
import { NotificationsApiService } from '../core/api/notifications-api.service';
import { LanguageService } from '../core/services/language.service';
import { PreferencesService } from '../core/services/preferences.service';
import { PushRegistrationService } from '../core/push/push-registration.service';
import { UrlService } from '../core/services/url.service';
import { Capacitor } from '@capacitor/core';

@Component({ standalone: true, template: '' })
class BlankPage {}

class AuthStub {
  readonly currentUserSubject = new BehaviorSubject<AuthenticatedUser | null>(null);
  readonly loggedInSubject = new BehaviorSubject<boolean>(false);
  readonly currentUser$ = this.currentUserSubject.asObservable();
  readonly isLoggedIn$ = this.loggedInSubject.asObservable();
  readonly isAdminSubject = new BehaviorSubject<boolean>(false);
  readonly isAdmin$ = this.isAdminSubject.asObservable();
  loginMethod: LoginMethod | null = null;
  logout = jasmine.createSpy('logout').and.returnValue(of(void 0));

  signIn(user: Partial<AuthenticatedUser>, admin = false): void {
    this.isAdminSubject.next(admin);
    this.currentUserSubject.next({
      id: 'u1', Id: 'u1', email: '', Email: '', displayName: '', DisplayName: '',
      roles: [], Roles: [], ...user
    } as AuthenticatedUser);
    this.loggedInSubject.next(true);
  }
}

class ProfileStub {
  readonly profileSubject = new BehaviorSubject<UserProfile | null>(null);
  readonly loadFailedSubject = new BehaviorSubject<boolean>(false);
  readonly profile$ = this.profileSubject.asObservable();
  readonly loadFailed$ = this.loadFailedSubject.asObservable();
  refresh = jasmine.createSpy('refresh').and.returnValue(of(null));
  getMe = jasmine.createSpy('getMe').and.returnValue(of(null));
}

describe('NavbarComponent (Phase 6)', () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let auth: AuthStub;
  let profile: ProfileStub;
  let providerRefresh: jasmine.Spy;
  let router: Router;
  let myAgency: Agency | null;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    myAgency = null;
    auth = new AuthStub();
    profile = new ProfileStub();
    providerRefresh = jasmine.createSpy('refresh').and.returnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [NavbarComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([
          { path: 'admin/users', component: BlankPage },
          { path: 'admin/users/:id', component: BlankPage },
          { path: 'my-listings', component: BlankPage },
          { path: '**', component: BlankPage }
        ]),
        { provide: AuthService, useValue: auth },
        { provide: ProfileService, useValue: profile },
        { provide: AgenciesApiService, useValue: { getMine: () => of(myAgency) } },
        {
          provide: ServiceProviderService,
          useValue: { myProvider$: of(null), refresh: providerRefresh }
        },
        { provide: NotificationsApiService, useValue: { unreadCount: signal(0) } },
        { provide: LanguageService, useValue: { currentLang$: of('ar'), use: () => undefined } },
        { provide: PreferencesService, useValue: { setLanguage: () => of(void 0) } },
        { provide: PushRegistrationService, useValue: { revoke: () => of(void 0) } },
        {
          provide: UrlService,
          useValue: { buildWithCacheBuster: (p?: string) => (p ? `${p}?t=1` : null) }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
  });

  function openAccountMenu(): void {
    (el().querySelector('.account__trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  // ────────────── الصورة الشخصية ──────────────

  it('✅ صورة موجودة ⇒ تظهر في الزر وفي رأس القائمة، بلا "?" إطلاقاً', () => {
    auth.signIn({ email: 'owner@example.com', ImageUrl: 'https://cdn.example.com/me.png' });
    profile.profileSubject.next({ Email: 'owner@example.com', DisplayName: 'Owner', ImageUrl: 'https://cdn.example.com/me.png' });
    fixture.detectChanges();
    openAccountMenu();

    const images = Array.from(el().querySelectorAll<HTMLImageElement>('img.account__avatar'));
    expect(images.length).toBe(3); // trigger + account-menu header + drawer header
    images.forEach(img => expect(img.getAttribute('src')).toBe('https://cdn.example.com/me.png?t=1'));
    expect(el().querySelector('.account__user-info img')?.getAttribute('alt')).toBe('NAVBAR.PROFILE_PHOTO');
    expect(el().textContent).not.toContain('?');
  });

  it('✅ قبل وصول الملف الشخصي ⇒ دائرة محايدة (pending) لا حرف ولا "?"', () => {
    auth.signIn({ email: 'owner@example.com' });
    fixture.detectChanges();

    const avatar = el().querySelector('.account__trigger .account__avatar');
    expect(avatar?.classList).toContain('account__avatar--pending');
    expect(avatar?.textContent?.trim()).toBe('');
  });

  it('✅ لا صورة ⇒ الحرف الأول من الاسم', () => {
    auth.signIn({ email: 'owner@example.com', ImageUrl: null });
    profile.profileSubject.next({ Email: 'owner@example.com', DisplayName: 'Naeem', ImageUrl: '' });
    fixture.detectChanges();

    expect(el().querySelector('.account__trigger .account__avatar--letter')?.textContent?.trim()).toBe('N');
  });

  it('✅ حساب هاتف بلا اسم ولا صورة ⇒ الصورة الافتراضية الموجودة، لا "?"', () => {
    auth.signIn({ email: '', ImageUrl: null });
    profile.profileSubject.next({ Email: '', Phone: '+4915112345678', DisplayName: '', ImageUrl: '' });
    fixture.detectChanges();

    const avatar = el().querySelector('.account__trigger .account__avatar') as HTMLImageElement;
    expect(avatar.classList).toContain('account__avatar--generic');
    expect(avatar.getAttribute('src')).toBe('/images/default-avatar.svg');
  });

  it('✅ رابط صورة مكسور ⇒ يتراجع للحرف', () => {
    auth.signIn({ email: 'owner@example.com', ImageUrl: 'https://cdn.example.com/gone.png' });
    profile.profileSubject.next({ Email: 'owner@example.com', DisplayName: 'Owner', ImageUrl: 'https://cdn.example.com/gone.png' });
    fixture.detectChanges();

    el().querySelector('.account__trigger img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(el().querySelector('.account__trigger .account__avatar--letter')?.textContent?.trim()).toBe('O');
  });

  it('✅ فشل تحميل الملف ⇒ لا يبقى على pending بل يعرض الحرف', () => {
    auth.signIn({ email: 'owner@example.com' });
    profile.loadFailedSubject.next(true);
    fixture.detectChanges();

    expect(el().querySelector('.account__trigger .account__avatar--letter')?.textContent?.trim()).toBe('O');
  });

  it('✅ صورة جديدة (بعد الرفع من صفحة الملف) تحلّ محل القديمة فوراً', () => {
    auth.signIn({ email: 'owner@example.com', ImageUrl: 'https://cdn.example.com/old.png' });
    fixture.detectChanges();
    auth.signIn({ email: 'owner@example.com', ImageUrl: 'https://cdn.example.com/new.png' });
    fixture.detectChanges();

    expect(el().querySelector('.account__trigger img')?.getAttribute('src')).toBe('https://cdn.example.com/new.png?t=1');
  });

  // ────────────── البريد / الهاتف ──────────────

  it('✅ دخول بالبريد ⇒ البريد وحده بجانب الصورة', () => {
    auth.loginMethod = 'email';
    auth.signIn({ email: 'owner@example.com' });
    profile.profileSubject.next({ Email: 'owner@example.com', Phone: '+4915112345678' });
    fixture.detectChanges();
    openAccountMenu();

    const text = el().querySelector('.account__email')?.textContent ?? '';
    expect(text).toContain('owner@example.com');
    expect(text).not.toContain('+4915112345678');
  });

  it('✅ دخول بالهاتف ⇒ الرقم وحده (باتجاه LTR) بجانب الصورة', () => {
    auth.loginMethod = 'phone';
    auth.signIn({ email: 'secondary@example.com' });
    profile.profileSubject.next({ Email: 'secondary@example.com', Phone: '+4915112345678' });
    fixture.detectChanges();
    openAccountMenu();

    const identifier = el().querySelector('.account__email') as HTMLElement;
    expect(identifier.textContent).toContain('+4915112345678');
    expect(identifier.textContent).not.toContain('secondary@example.com');
    expect(identifier.getAttribute('dir')).toBe('ltr');
  });

  // ────────────── قسم الإدارة ──────────────

  it('✅ مستخدم عادي ⇒ قسم الإدارة بأدواته، دون أدوات المشرف', () => {
    auth.signIn({ email: 'owner@example.com' });
    fixture.detectChanges();
    openAccountMenu();

    const group = el().querySelector('#account-management-group') as HTMLElement;
    const hrefs = Array.from(group.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/my-listings');
    expect(hrefs).toContain('/short-stay/manage');
    expect(hrefs.some(h => h?.startsWith('/admin'))).toBeFalse();
    // Admin links are no longer in the top bar either.
    expect(el().querySelector('.navbar__nav a[href^="/admin"]')).toBeNull();
  });

  describe('«مكتبي العقاري» يظهر فقط لمن لديه خطة مدفوعة سارية', () => {
    function managementHrefs(planFields: Partial<UserProfile>): (string | null)[] {
      auth.signIn({ email: 'owner@example.com' });
      profile.profileSubject.next({ Id: 'u1', ...planFields } as UserProfile);
      fixture.detectChanges();
      openAccountMenu();
      return Array.from(el().querySelectorAll('#account-management-group a')).map(a => a.getAttribute('href'));
    }

    it('بلا خطة ⇒ لا رابط', () => {
      expect(managementHrefs({})).not.toContain('/my-agency');
    });

    it('خطة مجانية ⇒ لا رابط', () => {
      expect(managementHrefs({ PlanTier: 'free', PlanStatus: 'Active' })).not.toContain('/my-agency');
    });

    it('خطة مدفوعة منتهية أو ملغاة ⇒ لا رابط', () => {
      expect(managementHrefs({ PlanTier: 'pro', PlanStatus: 'Expired' })).not.toContain('/my-agency');
    });

    const expiredDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

    it('خطة منتهية منذ أقل من 30 يومًا ⇒ الرابط ظاهر لصاحب المكتب أو عضوه', () => {
      myAgency = { ownerPlanStatus: 'Expired', ownerPlanExpiresAt: expiredDaysAgo(5) } as Agency;
      expect(managementHrefs({ PlanTier: 'free', PlanStatus: 'Expired' })).toContain('/my-agency');
    });

    it('خطة منتهية منذ أكثر من 30 يومًا ⇒ لا رابط', () => {
      myAgency = { ownerPlanStatus: 'Expired', ownerPlanExpiresAt: expiredDaysAgo(31) } as Agency;
      expect(managementHrefs({ PlanTier: 'free', PlanStatus: 'Expired' })).not.toContain('/my-agency');
    });

    it('خطة مدفوعة سارية ⇒ الرابط ظاهر', () => {
      expect(managementHrefs({ PlanTier: 'pro', PlanStatus: 'Active' })).toContain('/my-agency');
    });
  });

  it('✅ Admin ⇒ أدوات المشرف داخل قسم الإدارة (بما فيها اقتراحات المواقع)', () => {
    auth.signIn({ email: 'admin@example.com' }, true);
    fixture.detectChanges();
    openAccountMenu();

    const hrefs = Array.from(el().querySelectorAll('#account-management-group a')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(jasmine.arrayContaining([
      '/admin/messages', '/admin/users', '/admin/investments',
      '/admin/location-suggestions', '/admin/marketing', '/admin/app-updates',
      '/admin/social-distribution', '/admin/audit-logs'
    ]));
  });

  it('✅ الفتح والإغلاق في مكانه: aria-expanded يتبدّل، القائمة تبقى مفتوحة، بلا تنقّل', () => {
    auth.signIn({ email: 'owner@example.com' });
    fixture.detectChanges();
    openAccountMenu();
    const navigate = spyOn(router, 'navigateByUrl').and.callThrough();

    const toggle = el().querySelector('.account__group-toggle') as HTMLButtonElement;
    const group = el().querySelector('#account-management-group') as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('account-management-group');
    expect(group.hidden).toBeTrue();

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(group.hidden).toBeFalse();
    expect(el().querySelector('.account__dropdown')).not.toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('✅ رابط مباشر لأداة إدارة (/admin/users/:id) ⇒ القسم مفتوح والعنصر نشط', fakeAsync(() => {
    auth.signIn({ email: 'admin@example.com' }, true);
    void router.navigateByUrl('/admin/users/42');
    tick();
    fixture.detectChanges();
    openAccountMenu();
    tick(); // routerLinkActive applies its class in a microtask
    fixture.detectChanges();

    const toggle = el().querySelector('.account__group-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.classList).toContain('group-toggle--current');

    const active = el().querySelector('#account-management-group .account__item--active') as HTMLElement;
    expect(active.getAttribute('href')).toBe('/admin/users');
    expect(active.getAttribute('aria-current')).toBe('page');
  }));

  it('✅ صفحة خارج الإدارة ⇒ القسم مغلق افتراضياً ولا علامة "القسم الحالي"', fakeAsync(() => {
    auth.signIn({ email: 'owner@example.com' });
    void router.navigateByUrl('/favorites');
    tick();
    fixture.detectChanges();
    openAccountMenu();

    const toggle = el().querySelector('.account__group-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.classList).not.toContain('group-toggle--current');
  }));

  // ────────────── الطلبات ──────────────

  it('✅ الـ Navbar لا يجلب /users/me بنفسه، و ServiceProviders/me مرة واحدة لكل حساب', () => {
    auth.signIn({ email: 'owner@example.com' });
    auth.signIn({ email: 'owner@example.com', ImageUrl: 'https://cdn.example.com/me.png' }); // hydrate merge
    auth.signIn({ email: 'owner@example.com', ImageUrl: 'https://cdn.example.com/me.png' }); // guard re-validate
    fixture.detectChanges();

    expect(profile.refresh).not.toHaveBeenCalled();
    expect(profile.getMe).not.toHaveBeenCalled();
    expect(providerRefresh).toHaveBeenCalledTimes(1);
  });
  // ────────────── تنزيل التطبيق ──────────────

  it('✅ الويب ⇒ رابط «تنزيل التطبيق» في الشريط وفي القائمة الجانبية، رابط عادي إلى الصفحة الثابتة /download', () => {
    const links = Array.from(el().querySelectorAll('a[href="/download"]'));
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(el().querySelector('.navbar__nav a[href="/download"]')).not.toBeNull();
    expect(links.every(link => !link.hasAttribute('ng-reflect-router-link'))).toBeTrue();
  });

  it('✅ الرابط متاح بلا تسجيل دخول وللمشرف أيضًا', () => {
    expect(el().querySelector('a[href="/download"]')).not.toBeNull();
    auth.signIn({ email: 'admin@example.com' }, true);
    fixture.detectChanges();
    expect(el().querySelector('a[href="/download"]')).not.toBeNull();
  });

  it('✅ داخل التطبيق المثبّت (Capacitor) ⇒ لا رابط تنزيل', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
    expect(el().querySelector('a[href="/download"]')).toBeNull();
  });

  // ────────────── Phase 15: قائمة الجوال وملاءمة الروابط ──────────────

  describe('menu button vs link row (P15-D01)', () => {
    // brand 134 + links 1023 + buttons 228 + 2 gaps of 20 = 1425px needed.
    const english = { brand: 134, nav: 1023, actions: 228, menuButtonExtra: 0, gap: 20 };

    it('✅ تتسع الروابط تمامًا ⇒ تبقى ظاهرة؛ بكسل أقل ⇒ زر القائمة', () => {
      expect(navNeedsMenuButton({ ...english, available: 1425 })).toBeFalse();
      expect(navNeedsMenuButton({ ...english, available: 1424 })).toBeTrue();
    });

    it('✅ اللغة تغيّر القرار: الألمانية (روابط أعرض) تحتاج مساحة أكبر من العربية على العرض نفسه', () => {
      const room = 1500;
      expect(navNeedsMenuButton({ brand: 134, nav: 895, actions: 282, menuButtonExtra: 0, gap: 20, available: room })).toBeFalse();
      expect(navNeedsMenuButton({ brand: 134, nav: 1085, actions: 259, menuButtonExtra: 0, gap: 20, available: room })).toBeTrue();
    });

    it('✅ الجواب لا يتأثر بوجود زر القائمة نفسه (لا تذبذب بين الحالتين)', () => {
      const available = 1500;
      const withoutButton = navNeedsMenuButton({ ...english, available });
      const withButton = navNeedsMenuButton({ ...english, actions: english.actions + 52, menuButtonExtra: 52, available });
      expect(withButton).toBe(withoutButton);
    });
  });

  describe('mobile drawer (P15-D05)', () => {
    const drawer = () => el().querySelector<HTMLElement>('#mobile-navigation-drawer')!;

    // The drawer is `visibility: hidden` for the first frame of its transition, and a hidden element refuses
    // focus; CSS time does not advance in fakeAsync, so the transition is switched off here.
    let noTransitions: HTMLStyleElement;
    beforeEach(() => {
      noTransitions = document.createElement('style');
      noTransitions.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(noTransitions);
    });
    afterEach(() => noTransitions.remove());

    function openDrawer(): void {
      (el().querySelector('.mobile-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('✅ للدرج زر إغلاق داخله، باسم مترجم، ويُغلق الدرج عند الضغط عليه', () => {
      openDrawer();
      const close = drawer().querySelector<HTMLButtonElement>('.mobile-drawer__close')!;

      expect(close).not.toBeNull();
      expect(close.getAttribute('aria-label')).toBe('NAVBAR.CLOSE_MENU');
      expect(drawer().classList).toContain('mobile-drawer--open');

      close.click();
      fixture.detectChanges();

      expect(drawer().classList).not.toContain('mobile-drawer--open');
    });

    it('✅ الدرج حوار مشروط (dialog + aria-modal) باسم مترجم، لا عربي ثابت', () => {
      expect(drawer().getAttribute('role')).toBe('dialog');
      expect(drawer().getAttribute('aria-modal')).toBe('true');
      expect(el().querySelector('nav.navbar__nav')?.getAttribute('aria-label')).toBe('NAVBAR.MAIN_NAV');
    });

    it('✅ عند الفتح ينتقل التركيز إلى زر الإغلاق، وعند الإغلاق يعود إلى زر القائمة', fakeAsync(() => {
      document.body.appendChild(fixture.nativeElement);
      openDrawer();
      tick(100);

      expect(document.activeElement).toBe(drawer().querySelector('.mobile-drawer__close'));

      (drawer().querySelector('.mobile-drawer__close') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(document.activeElement).toBe(el().querySelector('.mobile-toggle'));
      fixture.nativeElement.remove();
    }));

    it('✅ Tab من آخر عنصر يعود إلى أول عنصر، وShift+Tab من الأول يذهب إلى الأخير (حبس التركيز)', fakeAsync(() => {
      document.body.appendChild(fixture.nativeElement);
      openDrawer();
      tick(100);
      const focusable = Array.from(drawer().querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
        .filter(node => node.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      last.focus();
      const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
      drawer().dispatchEvent(forward);
      expect(forward.defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(first);

      const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true });
      drawer().dispatchEvent(backward);
      expect(backward.defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(last);
      fixture.nativeElement.remove();
    }));
  });
});

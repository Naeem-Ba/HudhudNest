import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, debounceTime, distinctUntilChanged, filter, fromEvent, map } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { AuthService, AuthenticatedUser } from '../core/auth/auth.service';
import { LoginIdentifier, resolveLoginIdentifier } from '../core/auth/login-identifier';
import { LanguageService } from '../core/services/language.service';
import { UrlService } from '../core/services/url.service';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';
import { OverlayBackHandlerService } from '../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../core/services/scroll-lock.service';
import { ThemeService } from '../core/services/theme.service';
import { NotificationsApiService } from '../core/api/notifications-api.service';
import { ProfileService, UserProfile, isEligibleForListing } from '../core/api/profile.service';
import { ServiceProviderService } from '../core/api/service-provider.service';

type AppLang = 'ar' | 'en' | 'de';

/**
 * pending — signed in, profile not loaded yet: a neutral circle instead of a letter
 *           that the real photo would replace a moment later (no "?" flash).
 * image   — the account's profile photo.
 * initial — no photo (or it failed to load): first letter of the name / e-mail.
 * generic — no photo and nothing to take a letter from (phone-only account without a
 *           name): the existing default-avatar illustration, never a "?".
 */
type AvatarState = 'pending' | 'image' | 'initial' | 'generic';

/**
 * Routes that belong to the "Administration" group of the account menu / drawer — used to
 * open the group automatically (and mark it) whenever the current URL is one of its tools,
 * including deep links and back/forward. Prefix match, so /admin/users/:id or
 * /properties/edit/:id (edited from "My listings") count too.
 */
const MANAGEMENT_ROUTE_PREFIXES = [
  '/my-listings',
  '/properties/edit',
  '/short-stay/manage',
  '/provider',
  '/analytics',
  '/admin'
];

@Component({
  selector: 'app-navbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    TranslateModule,
    ImageFallbackDirective
  ],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  /** يطابق $bp-tablet في _breakpoints.scss — نقطة الكسر التي يختفي عندها
   *  .mobile-toggle ويظهر .navbar__nav الثابت (navbar.component.scss). */
  private static readonly DESKTOP_BREAKPOINT_PX = 980;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly lang = inject(LanguageService);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly urlService = inject(UrlService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly overlayBackHandler = inject(OverlayBackHandlerService);
  private readonly scrollLock = inject(ScrollLockService);
  readonly themeService = inject(ThemeService);
  // ✅ إضافة: جرس الإشعارات — العداد جاهز أصلاً بالخدمة (unreadCount signal
  // محدَّث لحظيًا عبر SignalR)، كان ينقصه فقط رابط بالواجهة يعرضه.
  readonly notificationsApi = inject(NotificationsApiService);
  private readonly profileService = inject(ProfileService);
  private readonly serviceProviderService = inject(ServiceProviderService);

  @ViewChild('accountRef')
  private accountRef?: ElementRef<HTMLElement>;

  @ViewChild('langRef')
  private langRef?: ElementRef<HTMLElement>;

  @ViewChild('mobileDrawerRef')
  private mobileDrawerRef?: ElementRef<HTMLElement>;

  @ViewChild('mobileToggleRef')
  private mobileToggleRef?: ElementRef<HTMLElement>;

  readonly isLoggedIn$: Observable<boolean> = this.auth.isLoggedIn$;
  readonly isAdmin$: Observable<boolean> = this.auth.isAdmin$;

  /**
   * "Add property" stays hidden for a brand-new account until it has confirmed a way to
   * be reached AND picked a plan — mirrors CreatePropertyCommandHandler's gates exactly
   * (isEligibleForListing), so the link never promises something the backend will then
   * 403 on. Reappears the moment both are satisfied — see listing-eligibility.guard.ts
   * for the route-level version of the same check.
   */
  readonly canAddProperty$: Observable<boolean> = combineLatest([
    this.isLoggedIn$,
    this.profileService.profile$
  ]).pipe(map(([loggedIn, profile]) => loggedIn && isEligibleForListing(profile)));

  /**
   * "لوحة مزوّد الخدمة" — تظهر فقط لحساب لديه ملف ServiceProvider فعلي (ليس دور Identity؛
   * انظر provider-guard.ts لنفس التفرقة). myProvider$ يبدأ undefined (لم يُحمَّل بعد)
   * فيُقرأ كـ false هنا حتى يصل refresh() أدناه (مستدعى مرة واحدة لكل حساب مسجَّل دخوله
   * في ngOnInit).
   */
  readonly isProvider$: Observable<boolean> = combineLatest([
    this.isLoggedIn$,
    this.serviceProviderService.myProvider$
  ]).pipe(map(([loggedIn, provider]) => loggedIn && !!provider));

  dropdownOpen = false;
  langMenuOpen = false;
  mobileMenuOpen = false;

  currentLang: AppLang = 'ar';

  avatarState: AvatarState = 'pending';
  avatarInitial = '';
  loginIdentifier: LoginIdentifier | null = null;
  profileImageUrl = '';

  /** The "Administration" group — shared by the account menu and the mobile drawer. */
  managementOpen = false;
  /** Current URL is one of the group's tools (drives auto-open and the group marker). */
  managementRouteActive = false;

  /** Raw (un-busted) URL behind profileImageUrl, and whether that exact URL failed. */
  private rawImageUrl: string | null = null;
  private imageFailed = false;

  ngOnInit(): void {
    const unregisterBackHandler = this.overlayBackHandler.register(() => {
      if (!this.mobileMenuOpen) {
        return false;
      }

      this.closeMobileMenu();
      return true;
    });

    this.destroyRef.onDestroy(unregisterBackHandler);

    // شبكة أمان: أي تنقّل (بما فيه إعادة توجيه من Guard، أو زر رجوع
    // المتصفح) يغلق الـ Drawer ويرفع قفل التمرير، حتى لو لم يمرّ عبر رابط
    // داخل القائمة نفسها (كل روابط الـ Drawer تستدعي closeMobileMenu()
    // أصلاً — هذا يغطي الحالات التي لا تمر من هناك).
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.mobileMenuOpen) {
          this.closeMobileMenu();
        }
      });

    // شبكة أمان أخيرة: لو انهدم المكوّن (نادر جدًا — الـ Navbar جزء من
    // App Shell الدائم) وكان الـ Drawer مفتوحًا، لا يجب أن يبقى قفل
    // التمرير عالقًا على التطبيق بأكمله.
    this.destroyRef.onDestroy(() => {
      this.scrollLock.forceUnlockIfHeldBy(this.mobileMenuOpen);
    });

    // Edge case: تدوير جهاز قابل للطي (أو تكبير نافذة على لابتوب) أثناء فتح
    // الـ Drawer قد يعبر بالعرض فوق نقطة الكسر فيتحوّل .navbar__nav من
    // Overlay إلى شريط ثابت مرئي — لو بقي القفل قائمًا هنا فسيمنع تمرير
    // الصفحة فعليًا رغم عدم وجود Overlay يبرر ذلك. debounceTime لتفادي
    // إغلاق/فتح متكرر أثناء السحب المستمر لحواف نافذة المتصفح.
    fromEvent(window, 'resize')
      .pipe(debounceTime(150), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.mobileMenuOpen && window.innerWidth > NavbarComponent.DESKTOP_BREAKPOINT_PX) {
          this.closeMobileMenu();
        }
      });

    this.lang.currentLang$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(rawLang => {
        this.applyLang(this.normalizeLang(rawLang));
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => this.syncManagementWithRoute(event.urlAfterRedirects));
    this.syncManagementWithRoute(this.router.url);

    // Avatar + login identifier. AuthService.validateSession() already fetches
    // GET /users/me (hydrateProfile → profile$) on sign-in, reload and every guarded
    // navigation; the navbar used to fire its own profileService.refresh() on top of that
    // for every currentUser$ emission — two extra /users/me per page load and per guarded
    // navigation. It now only reads the shared state.
    combineLatest([
      this.auth.currentUser$,
      this.profileService.profile$,
      this.profileService.loadFailed$
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([user, profile, profileFailed]) => {
        if (!user) {
          this.resetUserUI();
        } else {
          this.applyUserUI(user, profile, profileFailed);
        }

        this.cd.markForCheck();
      });

    // isProvider$ — once per signed-in account, not on every currentUser$ emission
    // (refresh() resets myProvider$ to "unknown" first, so re-running it on each
    // navigation also made the provider link blink out and back).
    // 204 for non-providers is normal, not an error (see ServiceProviderService.getMine);
    // a real network failure just leaves the link hidden.
    this.auth.currentUser$
      .pipe(
        map(user => user?.id || null),
        distinctUntilChanged(),
        filter((id): id is string => !!id),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.serviceProviderService.refresh().subscribe({ error: () => undefined });
      });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    this.handleClickOutside(event);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeAllMenus();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
    this.langMenuOpen = false;
    this.cd.markForCheck();
  }

  toggleLangMenu(event: Event): void {
    event.stopPropagation();
    this.langMenuOpen = !this.langMenuOpen;
    this.dropdownOpen = false;
    this.cd.markForCheck();
  }

  toggleMobileMenu(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen = false;
    this.langMenuOpen = false;
    this.setMobileMenuOpen(!this.mobileMenuOpen);
  }

  changeLang(lang: AppLang): void {
    this.langMenuOpen = false;
    this.dropdownOpen = false;
    this.setMobileMenuOpen(false);

    this.applyLang(lang);
    this.lang.use(lang);

    this.cd.markForCheck();
  }

  closeAccountMenu(): void {
    this.dropdownOpen = false;
    this.cd.markForCheck();
  }

  closeMobileMenu(): void {
    this.setMobileMenuOpen(false);
  }

  /**
   * نقطة وحيدة تُحدِّث `mobileMenuOpen` وتقفل/تفكّ قفل تمرير الصفحة الخلفية
   * معًا — أي كود آخر يغيّر `mobileMenuOpen` مباشرة سيُفلت القفل عن التزامنه
   * مع حالة الـ Drawer الفعلية (Phase 15: لا تُغيّر حالة scroll lock من أكثر
   * من مكان). idempotent: استدعاؤها بنفس القيمة الحالية لا يزيد/ينقص العداد.
   */
  private setMobileMenuOpen(open: boolean): void {
    if (this.mobileMenuOpen === open) {
      return;
    }

    this.mobileMenuOpen = open;

    if (open) {
      this.scrollLock.lock();
    } else {
      this.scrollLock.unlock();
    }

    this.cd.markForCheck();
  }

  logout(): void {
    this.closeAllMenus();

    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/home'),
      error: () => void this.router.navigateByUrl('/home')
    });
  }

  /** The photo URL exists but does not load (deleted, blocked, offline): stop using it. */
  useFallbackImage(): void {
    if (this.avatarState !== 'image') {
      return;
    }

    this.imageFailed = true;
    this.avatarState = this.avatarInitial ? 'initial' : 'generic';
    this.cd.markForCheck();
  }

  /** Opens/closes the group in place — no navigation, and the menu itself stays open. */
  toggleManagement(event: Event): void {
    event.stopPropagation();
    this.managementOpen = !this.managementOpen;
    this.cd.markForCheck();
  }

  private syncManagementWithRoute(url: string): void {
    const path = url.split(/[?#]/)[0] ?? '';
    this.managementRouteActive = MANAGEMENT_ROUTE_PREFIXES.some(
      prefix => path === prefix || path.startsWith(`${prefix}/`)
    );

    // Open (never force-close): the active tool must be visible when the menu is opened,
    // but a group the user opened by hand stays open while they move elsewhere.
    if (this.managementRouteActive) {
      this.managementOpen = true;
    }

    this.cd.markForCheck();
  }

  private applyUserUI(
    user: AuthenticatedUser,
    profile: UserProfile | null,
    profileFailed: boolean
  ): void {
    this.loginIdentifier = resolveLoginIdentifier(
      this.auth.loginMethod,
      profile?.Email || user.email,
      profile?.Phone
    );

    const name = (profile?.DisplayName ?? '').trim();
    const initialSource = name && /\p{L}/u.test(name.charAt(0))
      ? name
      : (this.loginIdentifier?.kind === 'email' ? this.loginIdentifier.value : '');
    this.avatarInitial = initialSource ? initialSource.charAt(0).toUpperCase() : '';

    // currentUser carries the freshest photo (hydrateProfile merges it in, and the
    // profile page pushes a new upload straight into it); profile$ covers the moment
    // before that merge. undefined = not known yet, ''/null = the account has none.
    const known = user.ImageUrl !== undefined || user.imageUrl !== undefined || !!profile;
    const raw = (user.ImageUrl ?? user.imageUrl ?? profile?.ImageUrl ?? '').trim() || null;

    if (raw !== this.rawImageUrl) {
      this.rawImageUrl = raw;
      this.imageFailed = false;
      // Busted once per distinct URL, not on every emission (which re-downloaded the
      // same photo each time currentUser$ emitted).
      this.profileImageUrl = this.urlService.buildWithCacheBuster(raw ?? undefined) ?? '';
    }

    if (this.profileImageUrl && !this.imageFailed) {
      this.avatarState = 'image';
    } else if (!known && !profileFailed) {
      this.avatarState = 'pending';
    } else {
      this.avatarState = this.avatarInitial ? 'initial' : 'generic';
    }
  }

  private normalizeLang(raw: string | null | undefined): AppLang {
    const code = (raw ?? 'ar')
      .toLowerCase()
      .split(/[-_]/)[0];

    if (code === 'en') {
      return 'en';
    }

    if (code === 'de') {
      return 'de';
    }

    return 'ar';
  }

  private applyLang(lang: AppLang): void {
    this.currentLang = lang;

    const htmlTag = document.documentElement;
    htmlTag.dir = lang === 'ar' ? 'rtl' : 'ltr';
    htmlTag.lang = lang;

    this.cd.markForCheck();
  }

  private handleClickOutside(event: MouseEvent): void {
    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    if (
      this.accountRef &&
      !this.accountRef.nativeElement.contains(target)
    ) {
      this.dropdownOpen = false;
    }

    if (
      this.langRef &&
      !this.langRef.nativeElement.contains(target)
    ) {
      this.langMenuOpen = false;
    }

    const insideDrawer =
      this.mobileDrawerRef?.nativeElement.contains(target) ?? false;

    const insideToggle =
      this.mobileToggleRef?.nativeElement.contains(target) ?? false;

    if (!insideDrawer && !insideToggle) {
      this.setMobileMenuOpen(false);
    }

    this.cd.markForCheck();
  }

  private closeAllMenus(): void {
    this.dropdownOpen = false;
    this.langMenuOpen = false;
    this.setMobileMenuOpen(false);
  }

  private resetUserUI(): void {
    this.avatarState = 'pending';
    this.avatarInitial = '';
    this.loginIdentifier = null;
    this.profileImageUrl = '';
    this.rawImageUrl = null;
    this.imageFailed = false;
  }
}

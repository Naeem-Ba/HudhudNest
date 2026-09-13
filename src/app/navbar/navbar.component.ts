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
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, debounceTime, filter, fromEvent, map } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { AuthService } from '../core/auth/auth.service';
import { LanguageService } from '../core/services/language.service';
import { UrlService } from '../core/services/url.service';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';
import { OverlayBackHandlerService } from '../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../core/services/scroll-lock.service';
import { ThemeService } from '../core/services/theme.service';
import { NotificationsApiService } from '../core/api/notifications-api.service';
import { ProfileService, isEligibleForListing } from '../core/api/profile.service';
import { ServiceProviderService } from '../core/api/service-provider.service';

type AppLang = 'ar' | 'en' | 'de';

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
   * فيُقرأ كـ false هنا حتى يصل refresh() أدناه (مستدعى من نفس مكان profileService.refresh()
   * في الاشتراك على currentUser$ تحت).
   */
  readonly isProvider$: Observable<boolean> = combineLatest([
    this.isLoggedIn$,
    this.serviceProviderService.myProvider$
  ]).pipe(map(([loggedIn, provider]) => loggedIn && !!provider));

  dropdownOpen = false;
  langMenuOpen = false;
  mobileMenuOpen = false;

  currentLang: AppLang = 'ar';

  avatarLetter = '?';
  userEmail = '';
  profileImageUrl = '/images/default-avatar.svg';
  hasCustomImage = false;

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

    this.auth.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(user => {
        if (!user) {
          this.resetUserUI();
          this.cd.markForCheck();
          return;
        }

        this.userEmail = user.Email ?? user.email ?? '';
        this.avatarLetter = this.userEmail
          ? this.userEmail.charAt(0).toUpperCase()
          : '?';

        // Populates profile$ (EmailConfirmed/PhoneConfirmed/PlanTier) for canAddProperty$
        // above. Errors are swallowed here on purpose: a failed profile fetch should not
        // break the rest of the navbar, and canAddProperty$ simply stays false (link
        // hidden) until the next successful refresh — the safe default either way.
        this.profileService.refresh().subscribe({ error: () => undefined });

        // نفس المنطق لـ isProvider$ أعلاه — 204 لغير المزوّدين طبيعي وليس خطأً (انظر
        // ServiceProviderService.getMine)، فلا حاجة لأي معالجة هنا غير الكتم البسيط لخطأ
        // شبكة فعلي محتمل.
        this.serviceProviderService.refresh().subscribe({ error: () => undefined });

        const imageUrl = this.urlService.buildWithCacheBuster(user.ImageUrl);

        if (imageUrl) {
          this.profileImageUrl = imageUrl;
          this.hasCustomImage = true;
        } else {
          this.profileImageUrl = '/images/default-avatar.svg';
          this.hasCustomImage = false;
        }

        this.cd.markForCheck();
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

  useFallbackImage(): void {
    this.profileImageUrl = '/images/default-avatar.svg';
    this.hasCustomImage = false;
    this.cd.markForCheck();
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
    this.userEmail = '';
    this.avatarLetter = '?';
    this.profileImageUrl = '/images/default-avatar.svg';
    this.hasCustomImage = false;
  }
}

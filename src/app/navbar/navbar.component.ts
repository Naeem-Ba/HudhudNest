// =====================================================================
// ✅ FIX #3 – navbar.component.ts
// المشكلة: subscription اللغة (currentLang$) لا يُلغى في ngOnDestroy
//           مما يُسبّب Memory Leak
// الحل: إدارة جميع الاشتراكات بـ Subscription مركزية واحدة
// =====================================================================
import {
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, Subscription } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { UrlService } from '../services/core/url.service';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  // ✅ FIX #15: إضافة OnPush لتحسين الأداء
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
export class NavbarComponent implements OnInit, OnDestroy {

  /* ===== Services ===== */
  private readonly auth       = inject(AuthService);
  private readonly router     = inject(Router);
  private readonly lang       = inject(LanguageService);
  private readonly cd         = inject(ChangeDetectorRef);
  private readonly urlService = inject(UrlService);

  /* ===== Observables ===== */
  readonly isLoggedIn$: Observable<boolean> = this.auth.isLoggedIn$;
  readonly isAdmin$: Observable<boolean>    = this.auth.isAdmin$;

  /* ===== UI State ===== */
  dropdownOpen   = false;
  langMenuOpen   = false;
  mobileMenuOpen = false;
  currentLang    = 'ar';

  /* ===== User UI ===== */
  avatarLetter     = '?';
  userEmail        = '';
  profileImageUrl  = '/images/default-avatar.svg';
  hasCustomImage   = false;

  /* ===== FIX #3: Subscription مركزية لإلغاء كل الاشتراكات ===== */
  private readonly subs = new Subscription();

  private readonly boundClickOutside = (event: MouseEvent) =>
    this.handleClickOutside(event);

  /* ============================= */

  ngOnInit(): void {
    /* 🔤 FIX #3: إضافة subscription اللغة إلى subs */
    this.subs.add(
      this.lang.currentLang$.subscribe(lang => {
        this.currentLang = lang;
        this.cd.markForCheck(); // ✅ لازم مع OnPush
      })
    );

    /* 👤 subscription المستخدم */
    this.subs.add(
      this.auth.currentUser$.subscribe(user => {
        if (!user) {
          this.resetUserUI();
          this.cd.markForCheck();
          return;
        }

        this.userEmail    = user.Email ?? user.email ?? '';
        this.avatarLetter = this.userEmail
          ? this.userEmail.charAt(0).toUpperCase()
          : '?';

        const imageUrl = this.urlService.buildWithCacheBuster(user.ImageUrl);

        if (imageUrl) {
          this.profileImageUrl = imageUrl;
          this.hasCustomImage  = true;
        } else {
          this.profileImageUrl = '/images/default-avatar.svg';
          this.hasCustomImage  = false;
        }

        this.cd.markForCheck(); // ✅ لازم مع OnPush
      })
    );

    document.addEventListener('click', this.boundClickOutside);
  }

  ngOnDestroy(): void {
    /* ✅ FIX #3: يُلغي جميع الاشتراكات دفعة واحدة */
    this.subs.unsubscribe();
    document.removeEventListener('click', this.boundClickOutside);
  }

  /* ===== UI Helpers ===== */

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
    this.langMenuOpen = false;
  }

  toggleLangMenu(event: Event): void {
    event.stopPropagation();
    this.langMenuOpen  = !this.langMenuOpen;
    this.dropdownOpen  = false;
  }

  changeLang(lang: 'ar' | 'en' | 'de'): void {
    this.lang.use(lang);
    this.currentLang = lang;

    const htmlTag = document.documentElement;
    htmlTag.dir  = lang === 'ar' ? 'rtl' : 'ltr';
    htmlTag.lang = lang;

    this.langMenuOpen   = false;
    this.mobileMenuOpen = false;
    this.cd.markForCheck();
  }

  logout(): void {
    this.auth.logout();
    this.dropdownOpen = false;
    this.router.navigate(['/home']);
  }

  useFallbackImage(): void {
    this.profileImageUrl = '/images/default-avatar.svg';
    this.hasCustomImage  = false;
  }

  toggleMobileMenu(event: Event): void {
    event.stopPropagation();
    this.mobileMenuOpen = !this.mobileMenuOpen;
    this.dropdownOpen   = false;
    this.langMenuOpen   = false;
  }

  handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.account'))       this.dropdownOpen   = false;
    if (!target.closest('.lang-dropdown')) this.langMenuOpen   = false;
    if (!target.closest('.nav-links') && !target.closest('.mobile-menu-btn')) {
      this.mobileMenuOpen = false;
    }
    this.cd.markForCheck();
  }

  private resetUserUI(): void {
    this.userEmail       = '';
    this.avatarLetter    = '?';
    this.profileImageUrl = '/images/default-avatar.svg';
    this.hasCustomImage  = false;
  }
}

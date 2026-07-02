import {
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  HostListener,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, Subscription } from 'rxjs';

import { AuthService } from '../core/auth/auth.service';
import { LanguageService } from '../core/services/language.service';
import { UrlService } from '../core/services/url.service';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';
import { TranslateModule } from '@ngx-translate/core';

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
export class NavbarComponent implements OnInit, OnDestroy {

  /* ===== Services ===== */
  private readonly auth       = inject(AuthService);
  private readonly router     = inject(Router);
  private readonly lang       = inject(LanguageService);
  private readonly cd         = inject(ChangeDetectorRef);
  private readonly urlService = inject(UrlService);

  /* ===== [FIX-C] مراجع العناصر الحقيقية بدل مطابقة أصناف CSS نصياً ===== */
  @ViewChild('accountRef')       private accountRef?: ElementRef<HTMLElement>;
  @ViewChild('langRef')          private langRef?: ElementRef<HTMLElement>;
  @ViewChild('mobileDrawerRef')  private mobileDrawerRef?: ElementRef<HTMLElement>;
  @ViewChild('mobileToggleRef')  private mobileToggleRef?: ElementRef<HTMLElement>;

  /* ===== Observables ===== */
  readonly isLoggedIn$: Observable<boolean> = this.auth.isLoggedIn$;
  readonly isAdmin$: Observable<boolean>    = this.auth.isAdmin$;

  /* ===== UI State ===== */
  dropdownOpen   = false;
  langMenuOpen   = false;
  mobileMenuOpen = false;
  currentLang: AppLang = 'ar';

  /* ===== User UI ===== */
  avatarLetter     = '?';
  userEmail        = '';
  profileImageUrl  = '/images/default-avatar.svg';
  hasCustomImage   = false;

  private readonly subs = new Subscription();

  /* ============================= */

  ngOnInit(): void {
    /* 🔤 [FIX-A] كل لغة قادمة من الـ service تمر عبر applyLang() المركزية،
       سواء عند أول تحميل أو عند أي تغيير لاحق — وليس فقط عند ضغط المستخدم */
    this.subs.add(
      this.lang.currentLang$.subscribe(rawLang => {
        this.applyLang(this.normalizeLang(rawLang));
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

        this.cd.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /* ===== [FIX-C] الإغلاق عند الضغط خارج القوائم — مربوط بدورة حياة المكوّن ===== */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    this.handleClickOutside(event);
  }

  /* ===== Language helpers ===== */

  /** [FIX-B] يضمن أن أي صيغة قادمة من الـ service (مثل en-US) تتحول لأحد القيم المدعومة فقط */
  private normalizeLang(raw: string | null | undefined): AppLang {
    const code = (raw ?? 'ar').toLowerCase().split(/[-_]/)[0];
    if (code === 'en') return 'en';
    if (code === 'de') return 'de';
    return 'ar';
  }

  /** [FIX-A] نقطة مركزية واحدة تُطبّق اللغة على الحالة وعلى <html> معاً */
  private applyLang(lang: AppLang): void {
    this.currentLang = lang;

    const htmlTag = document.documentElement;
    htmlTag.dir  = lang === 'ar' ? 'rtl' : 'ltr';
    htmlTag.lang = lang;

    this.cd.markForCheck();
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

  changeLang(lang: AppLang): void {
    this.lang.use(lang);
    this.applyLang(lang);

    /* [FIX-D] إغلاق صريح لكل القوائم بعد تغيير اللغة */
    this.langMenuOpen   = false;
    this.mobileMenuOpen = false;
    this.cd.markForCheck();
  }

  logout(): void {
    this.dropdownOpen   = false;
    this.mobileMenuOpen = false;

    // Invalidate the backend refresh token before leaving the authenticated UI.
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/home'),
      error: () => void this.router.navigateByUrl('/home')
    });
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

  /* [FIX-C] الآن يعتمد على احتواء عنصر DOM حقيقي بدل اسم صنف CSS نصي */
  private handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node;

    if (this.accountRef && !this.accountRef.nativeElement.contains(target)) {
      this.dropdownOpen = false;
    }

    if (this.langRef && !this.langRef.nativeElement.contains(target)) {
      this.langMenuOpen = false;
    }

    const insideDrawer  = this.mobileDrawerRef?.nativeElement.contains(target) ?? false;
    const insideToggle  = this.mobileToggleRef?.nativeElement.contains(target) ?? false;
    if (!insideDrawer && !insideToggle) {
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

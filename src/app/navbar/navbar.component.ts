import {
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Observable, Subscription } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { UrlService } from '../services/core/url.service';

import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    TranslateModule
  ],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {

  /* ===== Services (inject الحديث) ===== */
  private auth = inject(AuthService);
  private router = inject(Router);
  private lang = inject(LanguageService);
  private cd = inject(ChangeDetectorRef);
  private urlService = inject(UrlService);

  /* ===== Observables ===== */
  isLoggedIn$: Observable<boolean> = this.auth.isLoggedIn$;
  isAdmin$: Observable<boolean> = this.auth.isAdmin$;

  /* ===== UI State ===== */
  dropdownOpen = false;
  langMenuOpen = false;
  mobileMenuOpen = false;
  currentLang = 'ar';

  /* ===== User UI ===== */
  avatarLetter = '?';
  userEmail = '';
  profileImageUrl = 'assets/default-avatar.png';
  hasCustomImage = false;

  private userSub!: Subscription;

  /* ============================= */

  ngOnInit(): void {

    /* 🔤 اللغة */
    this.lang.currentLang$.subscribe(lang => {
      this.currentLang = lang;
    });

    /* 👤 المستخدم */
    this.userSub = this.auth.currentUser$.subscribe(user => {

      if (!user) {
        this.resetUserUI();
        return;
      }

      this.userEmail = user.Email ?? '';
      this.avatarLetter = this.userEmail
        ? this.userEmail.charAt(0).toUpperCase()
        : '?';

      /* ✅ هنا الاستخدام الصحيح لـ UrlService */
      const imageUrl = this.urlService.buildWithCacheBuster(user.ImageUrl);

      if (imageUrl) {
        this.profileImageUrl = imageUrl;
        this.hasCustomImage = true;
      } else {
        this.profileImageUrl = 'assets/default-avatar.png';
        this.hasCustomImage = false;
      }
    });

    document.addEventListener('click', this.handleClickOutside.bind(this));
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.handleClickOutside.bind(this));
    if (this.userSub) this.userSub.unsubscribe();
  }

  /* ===== UI Helpers ===== */

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
    this.langMenuOpen = false;
  }

  toggleLangMenu(event: Event): void {
    event.stopPropagation();
    this.langMenuOpen = !this.langMenuOpen;
    this.dropdownOpen = false;
  }

  changeLang(lang: 'ar' | 'en' | 'de'): void {
    this.lang.use(lang);
    this.currentLang = lang;
    this.langMenuOpen = false;
    this.cd.detectChanges();
  }

  logout(): void {
    this.auth.logout();
    this.dropdownOpen = false;
    this.router.navigate(['/home']);
  }

  useFallbackImage(): void {
    this.profileImageUrl = 'assets/default-avatar.png';
    this.hasCustomImage = false;
  }

  private resetUserUI(): void {
    this.userEmail = '';
    this.avatarLetter = '?';
    this.profileImageUrl = 'assets/default-avatar.png';
    this.hasCustomImage = false;
  }

  handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (!target.closest('.account')) {
      this.dropdownOpen = false;
    }
    if (!target.closest('.lang-dropdown')) {
      this.langMenuOpen = false;
    }
    if (!target.closest('.nav-links') && !target.closest('.mobile-menu-btn')) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileMenu(event: Event): void {
    event.stopPropagation();
    this.mobileMenuOpen = !this.mobileMenuOpen;
    this.dropdownOpen = false;
    this.langMenuOpen = false;
  }
}

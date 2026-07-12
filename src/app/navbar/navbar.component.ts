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
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { AuthService } from '../core/auth/auth.service';
import { LanguageService } from '../core/services/language.service';
import { UrlService } from '../core/services/url.service';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';
import { OverlayBackHandlerService } from '../core/services/overlay-back-handler.service';

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
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly lang = inject(LanguageService);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly urlService = inject(UrlService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly overlayBackHandler = inject(OverlayBackHandlerService);

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
    this.mobileMenuOpen = !this.mobileMenuOpen;
    this.dropdownOpen = false;
    this.langMenuOpen = false;
    this.cd.markForCheck();
  }

  changeLang(lang: AppLang): void {
    this.langMenuOpen = false;
    this.dropdownOpen = false;
    this.mobileMenuOpen = false;

    this.applyLang(lang);
    this.lang.use(lang);

    this.cd.markForCheck();
  }

  closeAccountMenu(): void {
    this.dropdownOpen = false;
    this.cd.markForCheck();
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
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
      this.mobileMenuOpen = false;
    }

    this.cd.markForCheck();
  }

  private closeAllMenus(): void {
    this.dropdownOpen = false;
    this.langMenuOpen = false;
    this.mobileMenuOpen = false;
    this.cd.markForCheck();
  }

  private resetUserUI(): void {
    this.userEmail = '';
    this.avatarLetter = '?';
    this.profileImageUrl = '/images/default-avatar.svg';
    this.hasCustomImage = false;
  }
}

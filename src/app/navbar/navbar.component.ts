import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, Subscription } from 'rxjs';
import { LanguageService } from '../services/language.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {

  isLoggedIn$: Observable<boolean>;
  isAdmin$: Observable<boolean>;

  dropdownOpen = false;
  langMenuOpen = false;

  currentLang = 'ar';

  avatarLetter = '?';
  userEmail = '';
  profileImageUrl = 'assets/default-avatar.png';
  hasCustomImage = false;

  private userSub!: Subscription;

  constructor(
    private auth: AuthService,
    private router: Router,
    private lang: LanguageService,
    private cd: ChangeDetectorRef 
  ) {
    // لا نقرأ localStorage هنا — نستخدم الـ Observables من الـ Service
    this.isLoggedIn$ = this.auth.isLoggedIn$;
    this.isAdmin$ = this.auth.isAdmin$;
  }

  toggleLangMenu() {
  this.langMenuOpen = !this.langMenuOpen;
}
changeLang(lang: 'ar' | 'en' | 'de') {
  this.lang.use(lang);
  this.currentLang = lang;
  this.langMenuOpen = false;
  this.cd.detectChanges();  //  ⭐ يجبر Angular على إعادة التحديث
}

  ngOnInit() {
    
    this.currentLang = this.lang.getCurrent();
    // اشترك لتحديث واجهة المستخدم تلقائياً عند تغير المستخدم
    this.userSub = this.auth.currentUser$.subscribe(user => {
      if (user) {
        this.userEmail = user.email || '';
        this.avatarLetter = this.userEmail ? this.userEmail.charAt(0).toUpperCase() : '?';
        if (user.imageUrl && user.imageUrl.trim() !== '') {
          this.profileImageUrl = user.imageUrl;
          this.hasCustomImage = true;
        } else {
          this.profileImageUrl = 'assets/default-avatar.png';
          this.hasCustomImage = false;
        }
      } else {
        // تم تسجيل الخروج أو لا يوجد مستخدم
        this.userEmail = '';
        this.avatarLetter = '?';
        this.profileImageUrl = 'assets/default-avatar.png';
        this.hasCustomImage = false;
      }
    });

    document.addEventListener('click', this.handleClickOutside.bind(this));
  }

  ngOnDestroy() {
    document.removeEventListener('click', this.handleClickOutside.bind(this));
    if (this.userSub) this.userSub.unsubscribe();
  }

  useFallbackImage() {
    this.profileImageUrl = 'assets/default-avatar.png';
    this.hasCustomImage = false;
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/home']);
  }

  handleClickOutside(event: any) {
    const clickedInside = event.target.closest('.account');
    if (!clickedInside) {
      this.dropdownOpen = false;
    }
  }
}

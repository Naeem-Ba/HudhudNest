import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, Subscription } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive,TranslateModule],
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

  readonly baseUrl = 'https://localhost:7136';

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

  ngOnInit() {
    
   // 1. مراقبة اللغة بشكل تلقائي
   this.lang.currentLang$.subscribe(l => {
    this.currentLang = l;
   });

   // 2. مراقبة المستخدم وتحديث الصورة/الحرف
   this.userSub = this.auth.currentUser$.subscribe(user => {
    if (user) {
      this.userEmail = user.Email || '';
      // استخراج الحرف الأول بأمان
      this.avatarLetter = this.userEmail ? this.userEmail.charAt(0).toUpperCase() : '?';

       // معالجة رابط الصورة القادم من السيرفر
        const imgPath = user.ImageUrl || user.imageUrl;
        if (imgPath && imgPath.length > 5) {
          // دمج رابط السيرفر مع مسار الصورة مع إضافة timestamp لمنع الكاش
          this.profileImageUrl = `${this.baseUrl}${imgPath.startsWith('/') ? '' : '/'}${imgPath}?t=${new Date().getTime()}`;
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

  toggleLangMenu(event: Event) {
    event.stopPropagation();
    this.langMenuOpen = !this.langMenuOpen;
    this.dropdownOpen = false; // إغلاق قائمة الحساب إذا كانت مفتوحة
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
    this.langMenuOpen = false; // إغلاق قائمة اللغة إذا كانت مفتوحة
  }
  changeLang(lang: 'ar' | 'en' | 'de') {
    this.lang.use(lang);
   this.currentLang = lang;
   this.cd.detectChanges();  //  ⭐ يجبر Angular على إعادة التحديث
   this.langMenuOpen = false;
}


  ngOnDestroy() {
    document.removeEventListener('click', this.handleClickOutside.bind(this));
    if (this.userSub) this.userSub.unsubscribe();
  }

  useFallbackImage() {
    this.profileImageUrl = 'assets/default-avatar.png';
    this.hasCustomImage = false;
  }

  logout() {
    this.auth.logout();
    this.dropdownOpen = false;
    this.router.navigate(['/home']);
  }

 // منطق الإغلاق عند الضغط خارج العنصر
  handleClickOutside(event: any) {
    // إغلاق المنسدلات إذا تم الضغط بعيداً عن عناصرها
    if (!event.target.closest('.account')) {
      this.dropdownOpen = false;
    }
    if (!event.target.closest('.lang-dropdown')) {
      this.langMenuOpen = false;
    }
  }
  
}

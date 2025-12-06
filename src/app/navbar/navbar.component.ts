import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, Subscription } from 'rxjs';

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
  avatarLetter = '?';
  userEmail = '';
  hasCustomImage = false;
  profileImageUrl = 'assets/default-avatar.png';

  private userSub!: Subscription;

  constructor(private auth: AuthService, private router: Router) {
    // لا نقرأ localStorage هنا — نستخدم الـ Observables من الـ Service
    this.isLoggedIn$ = this.auth.isLoggedIn$;
    this.isAdmin$ = this.auth.isAdmin$;
  }

  ngOnInit() {
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

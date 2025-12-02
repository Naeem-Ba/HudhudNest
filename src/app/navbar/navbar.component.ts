import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']

})
export class NavbarComponent {
  isLoggedIn$: Observable<boolean>;
  dropdownOpen = false;
  avatarLetter = '?';
  userEmail = '';
  hasCustomImage = false;

  profileImageUrl = 'assets/default-avatar.png';

  constructor(private auth: AuthService, private router: Router) {
    this.isLoggedIn$ = this.auth.isLoggedIn$;

    const user = JSON.parse(localStorage.getItem('loggedUser') || 'null');
    if (user) {
      this.userEmail = user.email || user.Email;
      this.avatarLetter = this.userEmail?.charAt(0)?.toUpperCase() || '?';

       if  (user.imageUrl && user.imageUrl.trim() !== '') {
      this.profileImageUrl = user.imageUrl;
      this.hasCustomImage = true;
    }
    }
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

  ngOnInit() {
  document.addEventListener('click', this.handleClickOutside.bind(this));
}

ngOnDestroy() {
  document.removeEventListener('click', this.handleClickOutside.bind(this));
}

handleClickOutside(event: any) {
  const clickedInside = event.target.closest('.account');
  if (!clickedInside) {
    this.dropdownOpen = false;
  }
}

}

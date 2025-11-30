import { Component } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { Observable, filter } from 'rxjs';
import { NavbarComponent } from './navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, RouterLinkActive, NavbarComponent],
  template: `
    <router-outlet></router-outlet>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  isLoggedIn$: Observable<boolean>;
  showAddButton: boolean = false;

  constructor(private authService: AuthService, private router: Router) {
    this.isLoggedIn$ = this.authService.isLoggedIn$;

    // نراقب تغيّر المسار لتحديد ظهور زر الإضافة
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // زر الإضافة يظهر فقط في صفحة /wohnungen
      this.showAddButton = event.urlAfterRedirects.startsWith('/wohnungen');
    });
    if (!this.authService.isLoggedIn()) {
    this.router.navigate(['/login']);
  }
  }

  onLogout() {
    this.authService.logout();
    this.router.navigate(['/home']);
  }
}

import { Component } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { Observable, filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, RouterLinkActive],
  template: `
    <header>
      <h1>🏠 Immobilien App</h1>
      <nav>
        <a routerLink="" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Start</a> |
        <a routerLink="wohnungen" routerLinkActive="active">Wohnungen</a> |
        <a *ngIf="showAddButton && (isLoggedIn$ | async)" routerLink="wohnung-add" routerLinkActive="active">➕ Neue Wohnung hinzufügen</a> |
        <a *ngIf="!(isLoggedIn$ | async)" routerLink="login">Login</a>
        <a *ngIf="isLoggedIn$ | async" (click)="onLogout()" style="cursor:pointer">Abmelden</a>
      </nav>
    </header>

    <hr />

    <main>
      <router-outlet></router-outlet>
    </main>
  `
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

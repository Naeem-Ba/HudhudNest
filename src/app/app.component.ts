import { Component } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/auth/auth.service';
import { Observable, filter } from 'rxjs';
import { ToastContainerComponent } from './shared/ui/toast-container.component';
import { LanguageService } from './core/services/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ToastContainerComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  isLoggedIn$: Observable<boolean>;
  showAddButton = false;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly languageService: LanguageService
  ) {
    this.isLoggedIn$ = this.authService.isLoggedIn$;

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.showAddButton = event.urlAfterRedirects.startsWith('/wohnungen');
      });
  }
}

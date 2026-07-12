import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Observable, filter } from 'rxjs';

import { AuthService } from './core/auth/auth.service';
import { LanguageService } from './core/services/language.service';
import { ToastContainerComponent } from './shared/ui/toast-container.component';
import { NativeBackButtonService } from './core/services/native-back-button.service';

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
  readonly isLoggedIn$: Observable<boolean>;
  showAddButton = false;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly languageService: LanguageService,
    nativeBackButton: NativeBackButtonService
  ) {
    this.isLoggedIn$ = this.authService.isLoggedIn$;
    this.languageService.getCurrent();
    nativeBackButton.initialize();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.showAddButton = event.urlAfterRedirects.startsWith('/wohnungen');
      });
  }
}

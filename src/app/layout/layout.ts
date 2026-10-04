import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { PendingDeletionBannerComponent } from '../shared/ui/pending-deletion-banner.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, PendingDeletionBannerComponent],
  template: `
    <app-navbar></app-navbar>
    <app-pending-deletion-banner></app-pending-deletion-banner>
    <main class="page-container">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    .page-container {
      padding: 20px;
    }
  `]
})
export class LayoutComponent {}

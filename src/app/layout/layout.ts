import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <app-navbar></app-navbar>
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

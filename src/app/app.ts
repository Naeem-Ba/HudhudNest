import { Component } from '@angular/core';
import { RouterOutlet, RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterModule],
  template: `
    <h1>Immobilien App</h1>
    <nav>
      <a routerLink="">Start</a> |
      <a routerLink="wohnungen">Wohnungen</a> |
      <a routerLink="login">Login</a>
    </nav>
    <hr />
    <router-outlet></router-outlet>
  `
})
export class AppComponent {}

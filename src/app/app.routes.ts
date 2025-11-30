import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout';
import { HomeComponent } from './home/home.component';
import { WohnungenComponent } from './wohnungen/wohnungen.component';
import { WohnungDetailComponent } from './wohnung-detail/wohnung-detail.component';
import { LoginComponent } from './login/login.component';
import { AuthGuard } from './services/auth-guard';
import { NavbarComponent } from './navbar/navbar.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'wohnungen', component: WohnungenComponent },
      { path: 'wohnungen/:id', component: WohnungDetailComponent },

      {
        path: 'wohnung-add',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./wohnung-add/wohnung-add.component')
            .then(m => m.WohnungAddComponent)
      },
    ]
  },

  { path: 'login', component: LoginComponent },

  { path: '**', redirectTo: 'home' },
];


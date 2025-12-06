import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout';
import { HomeComponent } from './home/home.component';
import { WohnungenComponent } from './wohnungen/wohnungen.component';
import { WohnungDetailComponent } from './wohnung-detail/wohnung-detail.component';
import { LoginComponent } from './login/login.component';
import {KontaktComponent} from './kontakt/kontakt.component';
import { AuthGuard } from './services/auth-guard';
import { AdminMessagesComponent } from './admin/messages/messages.component';
import { NavbarComponent } from './navbar/navbar.component';
import { AdminGuard } from './services/admin-guard';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'wohnungen', component: WohnungenComponent },
      { path: 'wohnungen/:id', component: WohnungDetailComponent },
      { path: 'kontakt', component: KontaktComponent },

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
{
  path: 'admin/messages',
  component: AdminMessagesComponent,
  canActivate: [AdminGuard]
},
{
  path: 'admin/messages/:id',
  loadComponent: () =>
    import('./admin/message-details/message-details.component')
      .then(m => m.MessageDetailComponent),
  canActivate: [AdminGuard]
},
  { path: '**', redirectTo: 'home' },
];


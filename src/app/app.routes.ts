import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout';
import { HomeComponent } from './home/home.component';
import { WohnungenComponent } from './wohnungen/wohnungen.component';
import { WohnungDetailComponent } from './wohnung-detail/wohnung-detail.component';
import { KontaktComponent } from './kontakt/kontakt.component';
import { AuthGuard } from './services/auth-guard';
import { AdminMessagesComponent } from './admin/messages/messages.component';
import { AdminGuard } from './services/admin-guard';
import { LoginComponent } from './login/login.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },

      { path: 'home', component: HomeComponent },
      { path: 'kontakt', component: KontaktComponent },

      // Legacy property routes - kept temporarily.
      { path: 'wohnungen', component: WohnungenComponent },
      { path: 'wohnungen/:id', component: WohnungDetailComponent },

      {
        path: 'wohnung-add',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./wohnung-add/wohnung-add.component')
            .then(m => m.WohnungAddComponent)
      },

      {
        path: 'wohnungen/edit/:id',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./wohnung-add/wohnung-add.component')
            .then(m => m.WohnungAddComponent)
      },

      {
        path: 'meine-anzeigen',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./meine-anzeigen/meine-anzeigen.component')
            .then(m => m.MeineAnzeigenComponent)
      }
    ]
  },

  // Auth routes
  {
  path: 'auth/login',
  component: LoginComponent
},
  {
    path: 'auth/send-otp',
    loadComponent: () =>
      import('./features/auth/send-otp/send-otp.page').then(m => m.SendOtpPage)
  },
  {
    path: 'auth/verify-otp',
    loadComponent: () =>
      import('./features/auth/verify-otp/verify-otp.page').then(m => m.VerifyOtpPage)
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register.page').then(m => m.RegisterPage)
  },
  {
    path: 'auth/forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.page').then(m => m.ForgotPasswordPage)
  },
  {
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.page').then(m => m.ResetPasswordPage)
  },

  // Legacy login route
  { path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },

  // Profile
  {
    path: 'profile',
    loadComponent: () =>
      import('./profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [AuthGuard]
  },

  // New property routes
  {
    path: 'properties',
    loadComponent: () =>
      import('./features/properties/property-list/property-list.page').then(m => m.PropertyListPage)
  },
  {
    path: 'properties-new',
    redirectTo: 'properties',
    pathMatch: 'full'
  },

  // Favorites / notifications
  {
    path: 'favorites',
    loadComponent: () =>
      import('./features/favorites/favorites.page').then(m => m.FavoritesPage)
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notifications.page').then(m => m.NotificationsPage)
  },

  // Admin
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

  {
    path: 'language',
    loadComponent: () =>
      import('./language-selector/language-selector.component')
        .then(m => m.LanguageSelectorComponent)
  },
  {
    path: 'offline',
    loadComponent: () =>
      import('./features/offline/offline.page').then(m => m.OfflinePage)
  },

  { path: '**', redirectTo: 'home' }
];
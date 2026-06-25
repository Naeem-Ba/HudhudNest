import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout';
import { HomeComponent } from './features/home/home.component';
import { AuthGuard } from './services/auth-guard';
import { AdminMessagesComponent } from './admin/messages/messages.component';
import { AdminGuard } from './services/admin-guard';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', component: HomeComponent },

      {
        path: 'wohnungen',
        loadComponent: () =>
          import('./features/properties/property-list/property-list.page')
            .then(m => m.PropertyListPage)
      },
      {
        path: 'wohnungen/:id',
        loadComponent: () =>
          import('./features/property-detail/property-detail.page')
            .then(m => m.PropertyDetailPage)
      },
      {
        path: 'properties',
        loadComponent: () =>
          import('./features/properties/property-list/property-list.page')
            .then(m => m.PropertyListPage)
      },
      {
        path: 'properties/:id',
        loadComponent: () =>
          import('./features/property-detail/property-detail.page')
            .then(m => m.PropertyDetailPage)
      },
      {
        path: 'kontakt',
        loadComponent: () =>
          import('./features/contact/contact.component')
            .then(m => m.KontaktComponent)
      },
      {
        path: 'my-listings',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/my-listings/my-listings.page')
            .then(m => m.MyListingsPage)
      },
      {
        path: 'property-form',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/property-form/property-form.page')
            .then(m => m.PropertyFormPage)
      },
      {
        path: 'properties/edit/:id',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/property-form/property-form.page')
            .then(m => m.PropertyFormPage)
      },
      {
        path: 'favorites',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/favorites/favorites.page')
            .then(m => m.FavoritesPage)
      },
      {
        path: 'notifications',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/notifications/notifications.page')
            .then(m => m.NotificationsPage)
      },
      {
        path: 'offline',
        loadComponent: () =>
          import('./features/offline/offline.page')
            .then(m => m.OfflinePage)
      }
    ]
  },

  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component')
        .then(m => m.LoginComponent)
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login/login.component')
        .then(m => m.LoginComponent)
  },
  {
    path: 'profile',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./profile/profile.component')
        .then(m => m.ProfileComponent)
  },

  {
    path: 'admin/messages',
    component: AdminMessagesComponent,
    canActivate: [AdminGuard]
  },
  {
    path: 'admin/messages/:id',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./admin/message-details/message-details.component')
        .then(m => m.MessageDetailComponent)
  },

  {
    path: 'language',
    loadComponent: () =>
      import('./language-selector/language-selector.component')
        .then(m => m.LanguageSelectorComponent)
  },

  {
    path: 'auth/send-otp',
    loadComponent: () =>
      import('./features/auth/send-otp/send-otp.page')
        .then(m => m.SendOtpPage)
  },
  {
    path: 'auth/verify-otp',
    loadComponent: () =>
      import('./features/auth/verify-otp/verify-otp.page')
        .then(m => m.VerifyOtpPage)
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register.page')
        .then(m => m.RegisterPage)
  },
  {
    path: 'auth/forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.page')
        .then(m => m.ForgotPasswordPage)
  },
  {
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.page')
        .then(m => m.ResetPasswordPage)
  },

  { path: '**', redirectTo: 'home' }
];

import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout';
import { HomeComponent } from './features/home/home.component';
import { AuthGuard } from './core/guards/auth-guard';
import { AdminMessagesComponent } from './admin/messages/messages.component';
import { AdminGuard } from './core/guards/admin-guard';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', component: HomeComponent },

       {
    path: 'landing',
    loadComponent: () =>
      import('./features/landing/landing-page.component')
        .then(m => m.LandingPageComponent),
    title: 'منصة عقارية رقمية في سوريا'
  },

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
        // Phase-0, Task 3.
        path: 'saved-searches',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/saved-searches/saved-searches.page')
            .then(m => m.SavedSearchesPage)
      },
      {
        path: 'notifications',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/notifications/notifications.page')
            .then(m => m.NotificationsPage)
      },
      {
        path: 'visits',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/visits/visits.page')
            .then(m => m.VisitsPage)
      },
      {
        // الصفحة الشخصية العامة لأي حساب (بائع/مستأجر) — صورة، تاريخ الانضمام،
        // عدد الشقق المُباعة/المؤجَّرة، إعلاناته النشطة، وتقييم متعدد المحاور.
        path: 'users/:id',
        loadComponent: () =>
          import('./features/user-profile/user-profile.page')
            .then(m => m.UserProfilePage)
      },
      {
        path: 'reviews',
        loadComponent: () =>
          import('./features/reviews/reviews.page')
            .then(m => m.ReviewsPage)
      },
      {
        path: 'reviews/:propertyId',
        loadComponent: () =>
          import('./features/reviews/reviews.page')
            .then(m => m.ReviewsPage)
      },
      {
        path: 'analytics',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/analytics/analytics.page')
            .then(m => m.AnalyticsPage)
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
    path: 'admin/users',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./admin/users/admin-users.page')
        .then(m => m.AdminUsersPage)
  },

  {
    // Admin moderation queue for user-typed district/neighborhood names —
    // see LocationSuggestion.cs (backend) / property-form.page.ts (frontend
    // entry point that creates these).
    path: 'admin/location-suggestions',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./admin/location-suggestions/location-suggestions.page')
        .then(m => m.AdminLocationSuggestionsPage)
  },

  {
    path: 'messages/:propertyId',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/messages/property-messages.page')
        .then(m => m.PropertyMessagesPage)
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
  // ✅ إضافة: صفحة تفعيل البريد الإلكتروني الثانوي — تكمل تدفق
  // PhoneAuthController.AddEmail/VerifyEmail الذي كان بلا واجهة استهلاك.
  // [AllowAnonymous] بالباك اند لنفس السبب: لا حارس هنا.
  {
    path: 'auth/verify-email',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email.page')
        .then(m => m.VerifyEmailPage)
  },
  {
    path: 'auth/phone-register',
    loadComponent: () =>
      import('./features/auth/phone-register/phone-register.page')
        .then(m => m.PhoneRegisterPage)
  },
  {
    path: 'auth/phone-password-reset',
    loadComponent: () =>
      import('./features/auth/phone-password-reset/phone-password-reset.page')
        .then(m => m.PhonePasswordResetPage)
  },
  {
    path: 'profile/phone-reverify',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/auth/phone-reverify/phone-reverify.page')
        .then(m => m.PhoneReverifyPage)
  },
  {
    path: 'profile/phone-change',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/auth/phone-change/phone-change.page')
        .then(m => m.PhoneChangePage)
  },

  { path: '**', redirectTo: 'home' }
];

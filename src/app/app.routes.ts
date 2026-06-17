// =====================================================================
// ✅ FIX #11+12 – app.routes.ts
// المشكلة #11: 'wohnungen/edit/:id' يأتي بعد 'wohnungen/:id'
//              فيطابق Angular المسار الخاطئ (التفاصيل بدل التعديل)
// المشكلة #12: بعض المكوّنات مُحمَّلة مباشرة (Eager) بدل Lazy Loading
// الحل: ترتيب المسارات الثابتة قبل الديناميكية + Lazy Loading للجميع
// =====================================================================
import { Routes } from '@angular/router';
import { AuthGuard } from './services/auth-guard';
import { AdminGuard } from './services/admin-guard';

export const routes: Routes = [
  // ─────────────────────────────────────────────
  // Layout الرئيسي (يحتوي Navbar + Footer)
  // ─────────────────────────────────────────────
  {
    path: '',
    loadComponent: () => import('./layout/layout').then(m => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },

      // ✅ FIX #12: Lazy Loading لجميع صفحات Layout
      {
        path: 'home',
        loadComponent: () =>
          import('./home/home.component').then(m => m.HomeComponent)
      },
      {
        path: 'kontakt',
        loadComponent: () =>
          import('./kontakt/kontakt.component').then(m => m.KontaktComponent)
      },

      // Legacy property routes
      {
        path: 'wohnungen',
        loadComponent: () =>
          import('./wohnungen/wohnungen.component').then(m => m.WohnungenComponent)
      },

      // ✅ FIX #11: مسار التعديل يجب أن يأتي قبل مسار التفاصيل (:id)
      //             لأن Angular يُطابق المسارات بالترتيب
      {
        path: 'wohnungen/edit/:id',          // ← ثابت: يجب أن يكون أولاً
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./wohnung-add/wohnung-add.component')
            .then(m => m.WohnungAddComponent)
      },

      {
        path: 'wohnungen/:id',               // ← ديناميكي: يأتي بعد الثابت
        loadComponent: () =>
          import('./wohnung-detail/wohnung-detail.component')
            .then(m => m.WohnungDetailComponent)
      },

      {
        path: 'wohnung-add',
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

  // ─────────────────────────────────────────────
  // Auth Routes (بدون Layout)
  // ─────────────────────────────────────────────
  {
    path: 'auth/login',
    // ✅ FIX #12: Lazy Loading بدل Eager
    loadComponent: () =>
      import('./login/login.component').then(m => m.LoginComponent)
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
      import('./features/auth/forgot-password/forgot-password.page')
        .then(m => m.ForgotPasswordPage)
  },
  {
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.page')
        .then(m => m.ResetPasswordPage)
  },

  // Legacy login redirect
  { path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },

  // ─────────────────────────────────────────────
  // صفحات المستخدم
  // ─────────────────────────────────────────────
  {
    path: 'profile',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./profile/profile.component').then(m => m.ProfileComponent)
  },

  // ─────────────────────────────────────────────
  // صفحات العقارات الجديدة
  // ─────────────────────────────────────────────
  {
    path: 'properties',
    loadComponent: () =>
      import('./features/properties/property-list/property-list.page')
        .then(m => m.PropertyListPage)
  },
  {
    path: 'properties-new',
    redirectTo: 'properties',
    pathMatch: 'full'
  },

  // ─────────────────────────────────────────────
  // المفضلة والإشعارات
  // ─────────────────────────────────────────────
  {
    path: 'favorites',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/favorites/favorites.page').then(m => m.FavoritesPage)
  },
  {
    path: 'notifications',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/notifications/notifications.page')
        .then(m => m.NotificationsPage)
  },

  // ─────────────────────────────────────────────
  // Admin
  // ─────────────────────────────────────────────
  {
    path: 'admin/messages',
    canActivate: [AdminGuard],
    // ✅ FIX #12: Lazy Loading بدل Eager
    loadComponent: () =>
      import('./admin/messages/messages.component')
        .then(m => m.AdminMessagesComponent)
  },
  {
    path: 'admin/messages/:id',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./admin/message-details/message-details.component')
        .then(m => m.MessageDetailComponent)
  },

  // ─────────────────────────────────────────────
  // متفرقات
  // ─────────────────────────────────────────────
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

  // Wildcard
  { path: '**', redirectTo: 'home' }
];

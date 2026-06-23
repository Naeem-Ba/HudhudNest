// =====================================================================
// ✅ FIX — app.routes.ts
//
// الإصلاحات:
//   1. حذف auth/send-otp المكررة (كانت موجودة مرتين)
//   2. حذف auth/verify-otp المكررة (كانت موجودة مرتين)
//   3. نقل { path: '**' } إلى آخر القائمة
//      (كانت في المنتصف تُخفي كل route بعدها)
//
// المسار: src/app/app.routes.ts
// =====================================================================

import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout';
import { HomeComponent } from './features/home/home.component';
import { WohnungenComponent } from './features/properties/property-list/property-list.page';
import { WohnungDetailComponent } from './features/property-detail/property-detail.page';
import { LoginComponent } from './login/login.component';
import { KontaktComponent } from './kontakt/kontakt.component';
import { AuthGuard } from './services/auth-guard';
import { AdminMessagesComponent } from './admin/messages/messages.component';
import { AdminGuard } from './services/admin-guard';

export const routes: Routes = [

  // ─── Layout الرئيسي (يحتوي Navbar + RouterOutlet) ─────────────────────
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },

      // ✅ الصفحات العامة
      { path: 'home',          component: HomeComponent },
      { path: 'wohnungen',     component: WohnungenComponent },
      { path: 'wohnungen/:id', component: WohnungDetailComponent },
      { path: 'kontakt',       component: KontaktComponent },

      // ✅ صفحات تحتاج تسجيل دخول (Lazy)
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
}
    ]
  },

  // ─── صفحات خارج الـ Layout ──────────────────────────────────────────────
  {
    path: 'profile',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./profile/profile.component')
        .then(m => m.ProfileComponent)
  },

  { path: 'login', component: LoginComponent },

  // ─── Admin ──────────────────────────────────────────────────────────────
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

  // ─── Utility ────────────────────────────────────────────────────────────
  {
    path: 'language',
    loadComponent: () =>
      import('./language-selector/language-selector.component')
        .then(m => m.LanguageSelectorComponent)
  },

  // ─── Auth Features ──────────────────────────────────────────────────────
  {
    path: 'auth/send-otp',                                      // ✅ مرة واحدة فقط
    loadComponent: () =>
      import('./features/auth/send-otp/send-otp.page')
        .then(m => m.SendOtpPage)
  },
  {
    path: 'auth/verify-otp',                                    // ✅ مرة واحدة فقط
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

  // ─── Features ───────────────────────────────────────────────────────────
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
    path: 'favorites',
    loadComponent: () =>
      import('./features/favorites/favorites.page')
        .then(m => m.FavoritesPage)
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notifications.page')
        .then(m => m.NotificationsPage)
  },
  {
    path: 'offline',
    loadComponent: () =>
      import('./features/offline/offline.page')
        .then(m => m.OfflinePage)
  },

  // ─── Wildcard — يجب أن يكون دائماً في النهاية ──────────────────────────
  { path: '**', redirectTo: 'home' }                            // ✅ في النهاية
];
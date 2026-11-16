import { Routes } from '@angular/router';

/**
 * Public marketing pages, all lazy and all inside the marketing shell (own header/footer, no app navbar).
 * `landing` is the home page; the German path names are the ones the site is shared under.
 */
export const MARKETING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/marketing-shell.component').then(m => m.MarketingShellComponent),
    children: [
      { path: 'landing', loadComponent: () => import('./home/landing-home.component').then(m => m.LandingHomeComponent) },
      { path: 'ueber-uns', loadComponent: () => import('./pages/about.page').then(m => m.AboutPage) },
      { path: 'fuer-anbieter', loadComponent: () => import('./pages/providers.page').then(m => m.ProvidersPage) },
      { path: 'impressum', loadComponent: () => import('./pages/impressum.page').then(m => m.ImpressumPage) },
      // One privacy policy, in four languages: the German address opens it in German (Netlify 301s it as well).
      { path: 'datenschutz', redirectTo: '/privacy-policy?lang=de', pathMatch: 'full' }
    ]
  }
];

// ─────────────────────────────────────────────────────────
// landing.routes.ts
// إضافة صفحة الهبوط إلى Angular Routing
// ─────────────────────────────────────────────────────────
import { Routes } from '@angular/router';

export const LANDING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./landing-page.component')
        .then(m => m.LandingPageComponent),
    title: 'PropertyApp – منصة عقارية رقمية في سوريا',
    data: {
      meta: {
        description:
          'ابحث عن شقق وعقارات للبيع والإيجار في سوريا. منصة رقمية منظمة مع صور واضحة وتواصل مباشر مع المالك.',
        keywords:
          'عقارات سوريا, شقق للإيجار, عقارات للبيع, شقق دمشق, شقق حلب, منصة عقارية سوريا',
      },
    },
  },
];

// ─────────────────────────────────────────────────────────
// كيفية الدمج في app.routes.ts الرئيسي:
// ─────────────────────────────────────────────────────────
//
// import { Routes } from '@angular/router';
//
// export const routes: Routes = [
//   {
//     path: '',
//     loadChildren: () =>
//       import('./features/landing/landing.routes')
//         .then(m => m.LANDING_ROUTES),
//   },
//   // باقي المسارات...
// ];

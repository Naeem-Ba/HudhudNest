import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout';
import { AuthGuard } from './core/guards/auth-guard';
import { ListingEligibilityGuard } from './core/guards/listing-eligibility.guard';
import { AdminMessagesComponent } from './admin/messages/messages.component';
import { AdminGuard } from './core/guards/admin-guard';
import { ProviderGuard } from './core/guards/provider-guard';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        // Session audit (2026-10): HomeComponent was the one route in this entire file still
        // eagerly imported (a direct `component:` reference at the top of the file) instead of
        // loadComponent() like every other route here -- despite being the busiest route in the
        // app ('/' redirects straight to it), which meant it paid for itself in the INITIAL
        // bundle rather than its own lazy chunk. That's most of why the initial bundle exceeded
        // angular.json's 600kB budget warning.
        path: 'home',
        loadComponent: () =>
          import('./features/home/home.component')
            .then(m => m.HomeComponent)
      },

      // /wohnungen duplicated /properties (same component, two URLs for identical content --
      // a duplicate-content SEO problem). /properties is canonical (it's what
      // PropertyShareUrlService/MetaService/the social-crawler edge function already build), so
      // /wohnungen now redirects instead of loading its own copy.
      { path: 'wohnungen', redirectTo: 'properties', pathMatch: 'full' },
      { path: 'wohnungen/:id', redirectTo: 'properties/:id' },
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
      // Short-Stay Accommodation — backend-first PR's frontend follow-up. MVP: single-unit
      // booking flow only (see the plan's decision on hotel/multi-room-type UX being deferred).
      // Static/sub-segments (bookings, manage, manage/new, manage/:id) MUST be declared before
      // the trailing 'short-stay/:id' catch-all-by-param route below, or the router would try
      // to match e.g. 'bookings' as a listing id instead.
      {
        path: 'short-stay/bookings',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/short-stay/short-stay-bookings/short-stay-bookings.page')
            .then(m => m.ShortStayBookingsPage)
      },
      {
        path: 'short-stay/manage',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/short-stay/my-short-stay-listings/my-short-stay-listings.page')
            .then(m => m.MyShortStayListingsPage)
      },
      {
        path: 'short-stay/manage/new',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/short-stay/short-stay-listing-form/short-stay-listing-form.page')
            .then(m => m.ShortStayListingFormPage)
      },
      {
        path: 'short-stay/manage/:id',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/short-stay/short-stay-listing-form/short-stay-listing-form.page')
            .then(m => m.ShortStayListingFormPage)
      },
      {
        path: 'short-stay',
        loadComponent: () =>
          import('./features/short-stay/short-stay-list/short-stay-list.page')
            .then(m => m.ShortStayListPage)
      },
      {
        path: 'short-stay/:id',
        loadComponent: () =>
          import('./features/short-stay/short-stay-detail/short-stay-detail.page')
            .then(m => m.ShortStayDetailPage)
      },
      // Investment Discovery Portal (Phase 1) — discovery/analysis + watchlist + Expression of
      // Interest only, no payment/investment flow. 'watchlist' must be declared before the
      // trailing 'investments/:id' catch-all-by-param route, same reasoning as short-stay above.
      {
        path: 'investments/watchlist',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/investments/investment-watchlist/investment-watchlist.page')
            .then(m => m.InvestmentWatchlistPage)
      },
      {
        // "خدمات هدهد نيست" — public catalog of service offerings; requests are still made
        // from a property page (ServiceRequest needs a propertyId).
        path: 'services',
        loadComponent: () =>
          import('./features/services/services-catalog.page')
            .then(m => m.ServicesCatalogPage)
      },
      {
        // "انضم كمزوّد خدمة" — public landing; the form needs a signed-in account (the page
        // sends anonymous visitors to log in and back). Replaces /kontakt?intent=service-provider,
        // which stays working and now points here.
        path: 'services/join',
        loadComponent: () =>
          import('./features/provider-onboarding/service-provider-join.page')
            .then(m => m.ServiceProviderJoinPage)
      },
      {
        path: 'investments',
        loadComponent: () =>
          import('./features/investments/investment-list/investment-list.page')
            .then(m => m.InvestmentListPage)
      },
      {
        path: 'investments/:id',
        loadComponent: () =>
          import('./features/investments/investment-details/investment-details.page')
            .then(m => m.InvestmentDetailsPage)
      },
      {
        path: 'kontakt',
        loadComponent: () =>
          import('./features/contact/contact.component')
            .then(m => m.KontaktComponent)
      },
      {
        // Valuation module (Stage 7) — anonymous by design, same reasoning as kontakt above:
        // ValuationInquiry.RequesterId is nullable for a guest visitor on the backend, so this
        // route carries no AuthGuard.
        path: 'valuation',
        loadComponent: () =>
          import('./features/valuation-request/valuation-request.page')
            .then(m => m.ValuationRequestPage)
      },
      {
        path: 'my-listings',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/my-listings/my-listings.page')
            .then(m => m.MyListingsPage)
      },
      {
        // مكتبي العقاري — إنشاء أو تعديل (نفس الصفحة تخدم الحالتين، انظر
        // agency-form.page.ts's doc comment). أول route لـ AgenciesController
        // في الفرونت‌إند بأكمله.
        path: 'my-agency',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/agency-form/agency-form.page')
            .then(m => m.AgencyFormPage)
      },
      {
        // الصفحة العامة للمكتب بالرابط القصير (/F-AGY-05/) — مجهولة عمدًا، مثل
        // GET /api/Agencies/{slug} بالباك اند.
        path: 'agencies/:slug',
        loadComponent: () =>
          import('./features/agency-public/agency-public.page')
            .then(m => m.AgencyPublicPage)
      },
      {
        // Create only. ListingEligibilityGuard runs after AuthGuard (so an anonymous
        // visitor hits the login redirect first) and is NOT applied to the edit route
        // below — editing an already-owned listing isn't "publishing new".
        path: 'property-form',
        canActivate: [AuthGuard, ListingEligibilityGuard],
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
        // بلاغاتي: البلاغات التي أرسلها المستخدم وحالتها العامة (لا يرى ملاحظات الإدارة).
        path: 'my-reports',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/listing-reports/my-listing-reports.page')
            .then(m => m.MyListingReportsPage)
      },
      {
        // The same page, opened on one report (a notification about it): that report is shown first
        // and, when the team asked a question, the answer box is focused.
        path: 'my-reports/:id',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/listing-reports/my-listing-reports.page')
            .then(m => m.MyListingReportsPage)
      },
      {
        // Growth engine P2: property search requests (buyer/renter side).
        path: 'search-requests',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/search-requests/my-search-requests.page')
            .then(m => m.MySearchRequestsPage)
      },
      {
        // Growth engine P2: anonymous request board (advertiser side).
        path: 'search-requests/board',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/search-requests/search-request-board.page')
            .then(m => m.SearchRequestBoardPage)
      },
      {
        path: 'search-requests/for-listing/:propertyId',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/search-requests/search-request-board.page')
            .then(m => m.SearchRequestBoardPage)
      },
      {
        // Phase-0, Task 3.
        path: 'referrals',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/referrals/referrals.page')
            .then(m => m.ReferralsPage)
      },
      {
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
      // المراسلة داخل الـ Layout كي تبقى شريط التنقل ظاهرًا (كانت صفحة المحادثة خارجه
      // فلا يستطيع المستخدم الخروج منها إلا بزر الرجوع).
      // صندوق الوارد: كل محادثات المستخدم عبر كل العقارات (GET /api/Messages/conversations).
      {
        path: 'messages',
        pathMatch: 'full',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/messages/messages-inbox.page')
            .then(m => m.MessagesInboxPage)
      },
      {
        path: 'messages/:propertyId',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/messages/property-messages.page')
            .then(m => m.PropertyMessagesPage)
      },
      {
        // HudhudNest Services Marketplace — "my requests" list. Browsing/creating a
        // request happens from the property-detail page's CTA, not a separate
        // /services landing page in this vertical slice (see the session's final
        // report for what's deferred).
        path: 'my-services',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/services/my-service-requests.page')
            .then(m => m.MyServiceRequestsPage)
      },
      // لوحة تحكم مزوّد الخدمة — الصندوق الوارد + تفاصيل الطلب + الملف الشخصي. ProviderGuard
      // (لا AuthGuard وحده) لأن الوصول هنا يتطلب ملف ServiceProvider فعلياً، لا مجرد تسجيل
      // دخول فقط.
      {
        path: 'provider/requests',
        canActivate: [ProviderGuard],
        loadComponent: () =>
          import('./features/provider/provider-inbox.page')
            .then(m => m.ProviderInboxPage)
      },
      {
        path: 'provider/requests/:id',
        canActivate: [ProviderGuard],
        loadComponent: () =>
          import('./features/provider/provider-request-detail.page')
            .then(m => m.ProviderRequestDetailPage)
      },
      {
        // عروض المزوّد نفسه: إنشاء/تعديل/تفعيل ضمن الفئات المعتمدة فقط.
        path: 'provider/offerings',
        canActivate: [ProviderGuard],
        loadComponent: () =>
          import('./features/provider/provider-offerings.page')
            .then(m => m.ProviderOfferingsPage)
      },
      {
        path: 'provider/profile',
        canActivate: [ProviderGuard],
        loadComponent: () =>
          import('./features/provider/provider-profile.page')
            .then(m => m.ProviderProfilePage)
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
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.page')
            .then(m => m.SettingsPage)
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
        // Growth engine P11: guided start for Syrians abroad (only services that real providers offer).
        path: 'expats',
        loadComponent: () =>
          import('./features/expats/expat-journey.page')
            .then(m => m.ExpatJourneyPage)
      },
      {
        // Growth engine P8: browse listings on a map (server-side clusters).
        path: 'map',
        loadComponent: () =>
          import('./features/property-map/property-map.page')
            .then(m => m.PropertyMapPage)
      },
      {
        // Growth engine P6: public asking-price ranges per area (never a valuation).
        path: 'price-estimate',
        loadComponent: () =>
          import('./features/price-estimate/price-estimate.page')
            .then(m => m.PriceEstimatePage)
      },
      {
        // Public pricing page - Basic / Premium / Elite agency plans.
        path: 'pricing',
        loadComponent: () =>
          import('./features/pricing/pricing.page')
            .then(m => m.PricingPage)
      },
      {
        // BUG-17: صفحتا سياسة الخصوصية وشروط الاستخدام — مطلوبتان لإكمال شاشة
        // موافقة Google OAuth (aqar-tech) وأي مراجعة مستقبلية من Apple.
        path: 'privacy-policy',
        data: { doc: 'privacy' },
        loadComponent: () =>
          import('./features/legal/legal-document.page')
            .then(m => m.LegalDocumentPage)
      },
      {
        path: 'terms-of-service',
        data: { doc: 'terms' },
        loadComponent: () =>
          import('./features/legal/legal-document.page')
            .then(m => m.LegalDocumentPage)
      },
      {
        // Phase 5 (Account Deletion) — public, no AuthGuard: Google Play/Apple App
        // Store both require a web path to account deletion reachable without
        // installing the app. See account-deletion.page.ts's doc comment.
        path: 'account-deletion',
        loadComponent: () =>
          import('./features/legal/account-deletion.page')
            .then(m => m.AccountDeletionPage)
      },
      {
        // AdminGuard has redirected here since it was written (admin-guard.ts:26)
        // without this route ever being registered, so the '**' wildcard silently
        // bounced non-admins to /home. Registering it makes the refusal visible.
        path: 'not-authorized',
        loadComponent: () =>
          import('./features/not-authorized/not-authorized.page')
            .then(m => m.NotAuthorizedPage)
      },
      {
        // The '**' wildcard at the bottom of this file redirects here instead of to 'home' --
        // see not-found.page.ts's doc comment for why a redirect-to-a-real-page beats silently
        // rendering the homepage for a dead link (soft-404 avoidance).
        path: 'not-found',
        loadComponent: () =>
          import('./features/not-found/not-found.page')
            .then(m => m.NotFoundPage)
      },
      {
        // One-off listing fees: :kind is 'extension' or 'featured'.
        // Authenticated because both endpoints behind it are owner-only — an anonymous
        // visitor reaching this page could only ever be shown a 401.
        path: 'checkout/:kind/:propertyId',
        canActivate: [AuthGuard],
        loadComponent: () =>
          import('./features/checkout/checkout.page')
            .then(m => m.CheckoutPage)
      },
      // Account settings and the admin pages render inside the layout too, so they keep the
      // navbar (account menu + its "Administration" group) — before, opening any of them
      // left no navigation on screen at all. Paths and guards are unchanged.
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
        path: 'admin/growth',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/growth/admin-growth.page')
            .then(m => m.AdminGrowthPage)
      },
      {
        path: 'admin/referrals',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/referrals/admin-referrals.page')
            .then(m => m.AdminReferralsPage)
      },
      {
        path: 'admin/users',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/users/admin-users.page')
            .then(m => m.AdminUsersPage)
      },
      {
        // تفاصيل مستخدم واحد — الأدوار، الخطة والاشتراك (تفعيل/تمديد/إلغاء إداري).
        path: 'admin/users/:id',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/user-detail/admin-user-detail.page')
            .then(m => m.AdminUserDetailPage)
      },
      {
        // "مساحة المستخدم" — كل إعلاناته، مع تمييز/تمديد إداري (يعمل حتى على الخطة المجانية).
        path: 'admin/users/:id/properties',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/user-properties/admin-user-properties.page')
            .then(m => m.AdminUserPropertiesPage)
      },

      {
        // إدارة الخدمات: أي خدمة مفعّلة ومطلوبة، كم مرة، هل أُنجزت ولماذا لا. Role Admin على الخادم لكل نقطة.
        path: 'admin/services',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/services/admin-services.page')
            .then(m => m.AdminServicesPage)
      },
      {
        path: 'admin/services/:id',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/services/admin-service-request-detail.page')
            .then(m => m.AdminServiceRequestDetailPage)
      },

      {
        // إدارة البلاغات عن الإعلانات. Role Admin على الخادم لكل نقطة.
        path: 'admin/listing-reports',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/listing-reports/admin-listing-reports.page')
            .then(m => m.AdminListingReportsPage)
      },
      {
        path: 'admin/listing-reports/:id',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/listing-reports/admin-listing-report-detail.page')
            .then(m => m.AdminListingReportDetailPage)
      },

      {
        // إدارة الإقامات القصيرة: بحث، وإيقاف إعلان بسبب إلزامي (يراه المالك) واستعادته. Role Admin على الخادم لكل نقطة.
        path: 'admin/short-stay',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/short-stay/admin-short-stay.page')
            .then(m => m.AdminShortStayPage)
      },
      {
        // إدارة مزوّدي الخدمات: طلبات الانضمام ثم المزوّدون المعتمدون. Role Admin على الخادم لكل نقطة.
        path: 'admin/service-providers',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/service-providers/admin-service-providers.page')
            .then(m => m.AdminServiceProvidersPage)
      },
      {
        path: 'admin/service-providers/applications/:id',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/service-providers/admin-service-provider-application.page')
            .then(m => m.AdminServiceProviderApplicationPage)
      },
      {
        path: 'admin/service-providers/:id',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/service-providers/admin-service-provider-detail.page')
            .then(m => m.AdminServiceProviderDetailPage)
      },

      {
        // طلبات الخطط المدفوعة وتمييز الإعلانات بانتظار تأكيد الدفع — لا تفعيل تلقائي.
        path: 'admin/payment-requests',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/payment-requests/payment-requests.page')
            .then(m => m.AdminPaymentRequestsPage)
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

      // Admin Investment Portal (Phase 2) — backend: AdminInvestmentsController,
      // [Authorize(Roles = "Admin")] on every action; AdminGuard here is a UX
      // convenience, the server remains the real boundary. 'new' is registered
      // before ':id' so it is never swallowed by the id-matching route.
      {
        path: 'admin/investments',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./features/investments/admin/admin-investment-list/admin-investment-list.page')
            .then(m => m.AdminInvestmentListPage)
      },
      {
        path: 'admin/investments/new',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./features/investments/admin/admin-investment-form/admin-investment-form.page')
            .then(m => m.AdminInvestmentFormPage)
      },
      {
        path: 'admin/investments/:id',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./features/investments/admin/admin-investment-detail/admin-investment-detail.page')
            .then(m => m.AdminInvestmentDetailPage)
      },

      // لوحة تحكم التسويق: العروض ("أول 100 مكتب")، العملاء المحتملون، ونتائج
      // استبيان الاستعداد للدفع من صفحة الهبوط. LeadsController/OffersController/
      // SurveysController — [Authorize(Roles = "Admin")] على كل نقطة إدارية.
      {
        path: 'admin/marketing',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/marketing/admin-marketing.page')
            .then(m => m.AdminMarketingPage)
      },

      // App Update Management (Phase 3 — admin dashboard): إدارة إصدارات التطبيق لكل
      // منصة. AdminAppReleasesController — [Authorize(Roles = "Admin")] على كل نقطة.
      {
        path: 'admin/app-updates',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/app-updates/admin-app-updates.page')
            .then(m => m.AdminAppUpdatesPage)
      },

      // سجل التدقيق (المرحلة 14، D06): قراءة فقط. AdminAuditLogsController — Admin على الصنف.
      {
        path: 'admin/audit-logs',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/audit-logs/admin-audit-logs.page')
            .then(m => m.AdminAuditLogsPage)
      },

      // إدارة النشر التلقائي على وسائل التواصل الاجتماعي — نطاق تشغيلي أساسي (قنوات،
      // حسابات + ربط/فصل بيانات الاعتماد، ملخص لوحة التحكم، منشورات للعرض فقط).
      // SocialDistributionController — [Authorize(Roles = "Admin")] على كل نقطة.
      {
        path: 'admin/social-distribution',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./admin/social-distribution/admin-social-distribution.page')
            .then(m => m.AdminSocialDistributionPage)
      }
    ]
  },

  {
    // Marketing landing page: deliberately a top-level route (a sibling of LayoutComponent, like
    // /login) so the main Navbar is not rendered here. Nothing else changes: the Navbar and every
    // other page keep using LayoutComponent. The page brings its own slim brand strip and footer.
    path: 'landing',
    loadComponent: () =>
      import('./features/landing/landing-page.component')
        .then(m => m.LandingPageComponent)
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
    path: 'language',
    loadComponent: () =>
      import('./language-selector/language-selector.component')
        .then(m => m.LanguageSelectorComponent)
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

  { path: '**', redirectTo: 'not-found' }
];

// =============================================================
// src/app/features/property-detail/property-detail.page.ts
//
// صفحة تفاصيل العقار (حلّت محل المكوّن القديم).
//
// التحسينات:
//   ✅ PropertyApiService
//   ✅ ReviewService مربوط (GET + POST reviews)
//   ✅ VisitService مربوط (POST visit request)
//   ✅ Signals + OnPush
//   ✅ takeUntilDestroyed لمنع Memory Leaks
//   ✅ inject() الحديث
//   ✅ TranslateService
//   ✅ RTL-aware gallery navigation
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, map } from 'rxjs';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/api/property-api.service';
import { ReviewService } from '../../core/api/review.service';
import { VisitService } from '../../core/api/visit.service';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { ServiceRequestService } from '../../core/api/service-request.service';
import { MessagesApiService } from '../../core/api/messages-api.service';
import { ProfileService, PublicUserProfile } from '../../core/api/profile.service';
import { UserProfileApiService } from '../../core/api/user-profile-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Property, PropertyImage } from '../../core/models/property.model';
import { isValidCoordinates } from '../../core/models/property-location';
import { MapPickerComponent } from '../../map-picker/map-picker.component';
import { LangCode } from '../../core/services/language.service';
import { ListingTranslationService } from '../../core/api/listing-translation.service';
import { ListingTranslationController } from './listing-translation.controller';
import { TranslationNoticeComponent } from './translation-notice.component';
import { PriceHistoryComponent } from './price-history.component';
import { getGallerySwipeNavigation } from './gallery-swipe';
import { REVIEW_COMMENT_MAX_LENGTH, ReviewDto, validateCreateReview } from '../../core/models/review.model';
import { CreateVisitRequest, validateCreateVisit } from '../../core/models/visit.model';
import { SERVICE_CATEGORIES, ServiceCategory, ServiceOfferingDto, ServiceRequestDto, ServiceRequestIntent, validateCreateServiceRequest } from '../../core/models/service.model';
import { ServiceConversationActivity, ServiceConversationComponent } from '../services/service-conversation.component';
import { ServiceCategoryAvailabilityDto } from '../../core/models/provider-onboarding.model';
import { validateMessageContent } from '../../core/models/message.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FavoriteToggleButtonComponent } from '../../shared/ui/favorite-toggle-button.component';
import { PropertyShareButtonComponent } from '../../shared/ui/property-share-button.component';
import { mergeViewCount } from '../../shared/utils/view-count';
import { ListingViewCountComponent } from '../../shared/ui/listing-view-count.component';
import { ListingViewTrackingService } from '../../core/listing-views/listing-view-tracking.service';
import { ReportListingButtonComponent } from '../../shared/ui/report-listing-button.component';
import { PRINT_QUERY_PARAM, PropertyPrintService } from '../../core/print/property-print.service';
import { ToastService } from '../../shared/services/toast.service';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';
import { PropertyMetaService } from '../../core/sharing/property-meta.service';
import { PropertyAttributionTrackingService } from '../../core/sharing/property-attribution-tracking.service';
import { UrlService } from '../../core/services/url.service';
import { PropertyStructuredDataService } from '../../core/sharing/property-structured-data.service';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { isGuid } from '../../shared/utils/guid';
import { formatListingPrice } from '../../shared/utils/listing-price';
import { listingLifecycle, listingStatusTagKey } from '../../shared/utils/listing-status';
import { StructuredDataService, BREADCRUMB_JSON_LD_ID } from '../../core/services/structured-data.service';
import { AmenityLabelPipe } from '../../pipes/amenity-label.pipe';
import { AdSlotComponent } from '../../core/ads/ad-slot.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';
import { listSeparator } from '../../core/i18n/ui-language';

const LISTING_JSON_LD_ID = 'ld-real-estate-listing';

/** عروض النسخ المصغّرة المطلوبة من Cloudinary للصورة الرئيسية (srcset). */
const GALLERY_IMAGE_WIDTHS = [480, 768, 1024, 1440, 1920] as const;
const GALLERY_THUMB_WIDTH = 160;
const LIGHTBOX_IMAGE_WIDTH = 2048;

@Component({
  selector: 'app-property-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe, LocalizedNumberPipe,
    AdSlotComponent,
    PriceHistoryComponent,
    AmenityLabelPipe,
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    MapPickerComponent,
    ServiceConversationComponent,
    ImageFallbackDirective,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    FavoriteToggleButtonComponent,
    PropertyShareButtonComponent,
    ListingViewCountComponent,
    ReportListingButtonComponent,
    TranslationNoticeComponent
  ],
  templateUrl: './property-detail.page.html',
  styleUrls: ['./property-detail.page.scss']
})
export class PropertyDetailPage implements OnInit {
  @ViewChild('lightboxClose') private lightboxClose?: ElementRef<HTMLButtonElement>;

  /** The total from the last POST .../views, when it is newer than the one in the loaded listing. */
  readonly liveViewCount = signal<number | null>(null);

  /** The number to show: the loaded listing's, or the newer total the server returned when the view was recorded. */
  viewCountOf(p: Property): number | null {
    return mergeViewCount(p.viewCount, this.liveViewCount());
  }

  // ── Listing status (QA Phase 7, P7-D08) ───────────────────────────────
  /** i18n key of the tag shown for a reserved, sold, rented or archived listing; null for a normal one. */
  readonly statusTagKey = (p: Property): string | null => listingStatusTagKey(p);

  statusBadgeClass(p: Property): string {
    return `badge--${listingLifecycle(p)}`;
  }

  /** The sentence explaining a reserved or concluded listing to the visitor. */
  statusNoticeKey(p: Property): string | null {
    switch (listingLifecycle(p)) {
      case 'reserved': return 'LISTING_STATUS.RESERVED_NOTICE';
      case 'sold': return 'LISTING_STATUS.SOLD_NOTICE';
      case 'rented': return 'LISTING_STATUS.RENTED_NOTICE';
      default: return null;
    }
  }

  // ── DI ────────────────────────────────────────────────────────────────
  private readonly propertyApi  = inject(PropertyApiService);
  private readonly reviewService = inject(ReviewService);
  private readonly visitService  = inject(VisitService);
  private readonly serviceOfferingApi = inject(ServiceOfferingService);
  private readonly serviceRequestApi  = inject(ServiceRequestService);
  private readonly messagesApi   = inject(MessagesApiService);
  private readonly profileApi    = inject(ProfileService);
  private readonly userProfileApi = inject(UserProfileApiService);
  private readonly router        = inject(Router);
  private readonly authService   = inject(AuthService);
  private readonly route         = inject(ActivatedRoute);
  private readonly translate     = inject(TranslateService);
  private readonly toast         = inject(ToastService);
  private readonly destroyRef    = inject(DestroyRef);
  private readonly fb            = inject(FormBuilder);
  private readonly overlayBackHandler = inject(OverlayBackHandlerService);
  private readonly scrollLock = inject(ScrollLockService);
  private readonly propertyMeta = inject(PropertyMetaService);
  private readonly attributionTracking = inject(PropertyAttributionTrackingService);
  private readonly listingViews = inject(ListingViewTrackingService);
  private readonly urlService = inject(UrlService);
  private readonly propertyStructuredData = inject(PropertyStructuredDataService);
  private readonly structuredData = inject(StructuredDataService);
  private readonly shareUrl = inject(PropertyShareUrlService);
  private readonly printer = inject(PropertyPrintService);

  // Automatic translation of title/description into the active language. Purely additive: the listing
  // renders from the original text first, and this only swaps text in when a stored translation exists.
  readonly translation = new ListingTranslationController(inject(ListingTranslationService));

  /** Title to show: the translation when it is ready and the visitor has not asked for the original. */
  displayTitle(p: Property): string {
    return (!this.translation.showOriginal() && this.translation.title()) || p.title;
  }

  displayDescription(p: Property): string {
    return (!this.translation.showOriginal() && this.translation.description()) || p.description || '';
  }

  // ── State Signals ─────────────────────────────────────────────────────
  readonly property       = signal<Property | null>(null);
  readonly reviews        = signal<ReviewDto[]>([]);
  readonly loading        = signal(true);
  readonly loadingReviews = signal(false);
  readonly error          = signal('');
  readonly currentIndex   = signal(0);
  readonly modalOpen      = signal(false);
  readonly currentLang    = signal<LangCode>('ar');
  readonly validLocation  = computed(() => {
    const property = this.property();
    return property && isValidCoordinates(property.latitude, property.longitude)
      ? { lat: property.latitude as number, lng: property.longitude as number }
      : null;
  });
  readonly showVisitForm  = signal(false);
  readonly showReviewForm = signal(false);
  readonly showMessageForm = signal(false);
  /** بعد إرسال رسالة بنجاح: يعرض تأكيدًا ورابط المحادثة بدل إغلاق البطاقة بصمت. */
  readonly messageSent = signal(false);
  readonly isLoggedIn     = computed(() => !!this.authService.getAccessToken());

  // ── Computed ──────────────────────────────────────────────────────────
  readonly images = computed(() =>
    this.property()?.images?.filter(img => !!img.url) ?? []
  );
  readonly hasImages = computed(() => this.images().length > 0);
  readonly currentImageUrl = computed(() =>
    this.images()[this.currentIndex()]?.url ?? '/images/no-image.svg'
  );
  // نسخ بحجم العرض من Cloudinary (c_limit: تصغير فقط مع الحفاظ على نسبة الأبعاد)
  // بدل تحميل الأصل (قد يكون 4000px وعدة ميغابايت) في إطار عرضه ~400px.
  // روابط غير Cloudinary تُعاد كما هي.
  readonly currentImageDisplayUrl = computed(() =>
    this.urlService.buildResponsiveUrl(this.currentImageUrl(), 1440) ?? this.currentImageUrl()
  );
  readonly currentImageSrcSet = computed(() =>
    this.urlService.buildResponsiveSrcSet(this.currentImageUrl(), GALLERY_IMAGE_WIDTHS)
  );
  readonly currentImageLightboxUrl = computed(() =>
    this.urlService.buildResponsiveUrl(this.currentImageUrl(), LIGHTBOX_IMAGE_WIDTH) ?? this.currentImageUrl()
  );
  readonly currentImageAlt = computed(() =>
    this.images()[this.currentIndex()]?.altText ?? this.property()?.title ?? ''
  );
  readonly isRTL = computed(() =>
    this.currentLang() === 'ar' || document.documentElement.dir === 'rtl'
  );
  readonly averageRating = computed(() => {
    const all = this.reviews();
    if (!all.length) return null;
    return (all.reduce((sum, r) => sum + r.rating, 0) / all.length).toFixed(1);
  });

  // ── Visit Form (Reactive) ─────────────────────────────────────────────
  // ✅ إصلاح: كان proposedAt حقل واحد <input type="datetime-local"> يجمع
  // التاريخ والوقت معًا — غير واضح للمستخدم (وترتيب عرض التاريخ يعتمد على
  // لغة المتصفح، شهر/يوم/سنة عند متصفح إنكليزي). فُصل إلى visitDate
  // (تاريخ فقط) و visitTime (وقت فقط) بمربعين منفصلين، ويُجمَّعان في
  // submitVisit() فقط عند الإرسال الفعلي للـ API.
  readonly visitForm = this.fb.group({
    visitDate:    ['', Validators.required],
    visitTime:    ['', Validators.required],
    visitorName:  ['', [Validators.required, Validators.maxLength(150)]],
    visitorPhone: ['+963', [Validators.required, Validators.pattern(/^\+[0-9]{7,15}$/)]],
    visitorNote:  ['', Validators.maxLength(500)]
  });

  /** أقل تاريخ مسموح باختياره لحقل [min] — اليوم (منعًا لاختيار تاريخ ماضٍ من التقويم نفسه). */
  readonly minVisitDateAttr = new Date().toISOString().slice(0, 10);

  /**
   * ✅ إصلاح تفاعلية: FormControl.value ليس Signal، فقراءته مباشرة داخل
   * computed() لا يُعيد حسابها تلقائيًا عند تغيّر الحقل. لذلك نُزامن القيمة
   * بإشارة صريحة عبر valueChanges (مسجَّلة في ngOnInit)، ثم نبني المعاينة
   * فوقها.
   *
   * معاينة نصية بصيغة يوم/شهر/سنة صريحة (بغض النظر عن لغة/محرك المتصفح) —
   * لأن عرض <input type="date"> نفسه يتبع لغة نظام تشغيل المستخدم ولا يمكن
   * فرض صيغة عرض عليه من الكود، فهذه المعاينة تحت الحقل هي الضمانة الحقيقية
   * لصيغة يوم/شهر/سنة التي طلبها المستخدم.
   */
  readonly visitDateSignal = signal('');

  readonly visitDatePreview = computed(() => {
    const raw = this.visitDateSignal();
    if (!raw) return '';
    const d = new Date(raw + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  });

  // ── Review Form (Reactive) ────────────────────────────────────────────
  readonly reviewForm = this.fb.group({
    rating:  [5, [Validators.required, Validators.min(1), Validators.max(5)]],
    comment: ['', Validators.maxLength(REVIEW_COMMENT_MAX_LENGTH)]
  });

  readonly savingVisit  = signal(false);
  readonly savingReview = signal(false);
  readonly savingMessage = signal(false);
  messageDraft = '';
  readonly messageMaxLength = 3000;

  // ── Service request (Services Marketplace) ───────────────────────────────
  // The panel offers every category that has at least one bookable offering, then the offerings
  // of the chosen category for THIS property's governorate. Opening it (or arriving with
  // ?service=<Category>, e.g. from "My services") only shows the form: nothing is created until
  // the owner presses submit. Data loads lazily the first time the panel opens.
  readonly showServiceForm = signal(false);
  readonly serviceAvailability = signal<ServiceCategoryAvailabilityDto[]>([]);
  readonly serviceCategory = signal<ServiceCategory | null>(null);
  readonly serviceOfferings = signal<ServiceOfferingDto[]>([]);
  readonly selectedOfferingId = signal<string | null>(null);
  readonly loadingServiceCategories = signal(false);
  readonly loadingServiceOfferings = signal(false);
  readonly serviceLoadFailed = signal(false);
  readonly savingServiceRequest = signal(false);
  /** The request just created: its response carries the provider's contact (shown once, on request). */
  readonly createdServiceRequest = signal<ServiceRequestDto | null>(null);
  readonly availableServiceCategories = computed(() =>
    this.serviceAvailability().filter(item => item.offeringCount > 0).map(item => item.category));
  readonly selectedOffering = computed(() =>
    this.serviceOfferings().find(offering => offering.id === this.selectedOfferingId()) ?? null);
  private servicePreselect: ServiceCategory | null = null;
  serviceRequestNote = '';
  readonly serviceRequestNoteMaxLength = 1000;

  /**
   * ✅ إضافة: اسم المستخدم الحالي لعرضه كسطر توضيحي فوق نموذج مراسلة المالك
   * ("سيتم الإرسال باسم: ..."). لم يُضَف كحقل نصي قابل للتعديل داخل هذا
   * النموذج تحديدًا لأن MessagesController لا يقبل اسمًا حرًّا أصلًا — هوية
   * المُرسِل تُحدَّد من رمز الدخول (senderId) لا من نص يكتبه المستخدم، فأي
   * حقل "قابل للتعديل" هنا سيكون شكليًا فقط ولن يغيّر شيئًا فعليًا عند
   * الإرسال. راجع التقرير المرفق مع هذا التعديل لتفاصيل هذا القيد.
   */
  // ملاحظة: دالة عادية لا computed() — authService.currentUserSnapshot ليست
  // Signal (BehaviorSubject عادي)، فقراءتها داخل computed() تُحسَب مرة واحدة
  // فقط ولا تتجدد لاحقًا. دالة عادية تُستدعى من القالب تُعطي قيمة دقيقة
  // دائمًا (كلفة الاستدعاء المتكرر مقبولة، الصفحة تستخدم OnPush أصلًا).
  currentUserDisplayName(): string {
    return this.authService.currentUserSnapshot?.displayName ?? '';
  }

  readonly isOwner = computed(() =>
    !!this.property()?.ownerId &&
    this.property()?.ownerId === this.authService.getCurrentUserId()
  );

  /**
   * Phase-0, Task 2 — 30-day staleness banner + "still available?" button.
   * Staleness is measured from LastConfirmedAvailableAt if the owner has ever
   * confirmed it, otherwise falls back to UpdatedAt (the property's own last
   * edit), otherwise CreatedAt. This mirrors the backend's intent: a listing
   * nobody has touched or confirmed in 30+ days is more likely stale/unavailable.
   */
  private static readonly STALE_AFTER_DAYS = 30;

  readonly lastFreshnessSignalAt = computed(() => {
    const p = this.property();
    if (!p) return null;
    return p.lastConfirmedAvailableAt ?? p.updatedAt ?? p.createdAt ?? null;
  });

  readonly daysSinceFreshnessSignal = computed(() => {
    const raw = this.lastFreshnessSignalAt();
    if (!raw) return null;

    const then = new Date(raw).getTime();
    if (!Number.isFinite(then)) return null;

    return Math.floor((Date.now() - then) / 86_400_000);
  });

  readonly isStale = computed(() => {
    const days = this.daysSinceFreshnessSignal();
    return days !== null && days >= PropertyDetailPage.STALE_AFTER_DAYS;
  });

  readonly confirmingAvailability = signal(false);

  /**
   * ✅ إضافة: يستهلك GET /api/users/{id} — كان غير مستخدَم إطلاقاً، فكانت
   * الصفحة تكتفي بمقارنة ownerId فقط دون عرض أي معلومات عامة عن المالك.
   */
  readonly ownerProfile = signal<PublicUserProfile | null>(null);
  readonly ownerProfileLoading = signal(false);

  readonly fallbackImage = '/images/no-image.svg';

  // ── Drag/Swipe state ──────────────────────────────────────────────────
  private pointerStart?: { id: number; x: number; y: number };
  private suppressGalleryClickUntil = 0;
  private modalReturnFocus?: HTMLElement;

  ngOnInit(): void {
    this.currentLang.set((this.translate.currentLang || 'ar') as LangCode);
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        this.currentLang.set(event.lang as LangCode);
        const current = this.property();
        if (current) this.translation.start(current.id, this.currentLang());
      });
    this.destroyRef.onDestroy(() => this.translation.reset());

    // paramMap (not a one-time snapshot): this component instance is reused by the router when
    // only :id changes (Back/Forward between two listings, an in-app link to another one), so
    // a snapshot read would keep showing the previous listing — or its error state.
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.loadForId(params.get('id') ?? ''));

    // ✅ إضافة: زر الرجوع (Android hardware back) يُغلق معرض الصور بدل ما يخرج
    // من الصفحة كاملةً — نفس النمط المستخدم بقائمة الموبايل بالـ navbar.
    const unregisterBackHandler = this.overlayBackHandler.register(() => {
      if (!this.modalOpen()) {
        return false;
      }

      this.closeModal();
      return true;
    });

    this.destroyRef.onDestroy(unregisterBackHandler);

    // نفس منطق قفل التمرير المستخدم بـ Drawer الـ navbar وفلاتر قائمة
    // العقارات: المعرض Overlay كامل الشاشة، فلا يجب أن تتمرّر الصفحة خلفه.
    this.destroyRef.onDestroy(() => {
      this.scrollLock.forceUnlockIfHeldBy(this.modalOpen());
    });

    // Structured data (JSON-LD) must not leak into whatever page is visited next — removed on
    // leaving this page the same way PropertyMetaService's tags are left stale deliberately
    // (they get overwritten by the next page's own call) while these must be fully removed
    // instead, since there is no "neutral" RealEstateListing to fall back to.
    this.destroyRef.onDestroy(() => this.removeStructuredData());

    // Canonical is the one tag from PropertyMetaService.applyTo that does NOT get a free pass
    // from "the next page's own call overwrites it" (session audit, 2026-10) — most pages don't
    // set a canonical of their own at all, so without this a page left stays pointed at a
    // property the visitor already navigated away from. See PropertyMetaService.clear's doc
    // comment for why title/OG are deliberately left out of this.
    this.destroyRef.onDestroy(() => this.propertyMeta.clear());

    // ✅ إصلاح: مزامنة معاينة التاريخ (dd/mm/yyyy) — راجع تعليق visitDateSignal أعلاه.
    this.visitForm.controls.visitDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.visitDateSignal.set(value ?? ''));
  }

  /**
   * ✅ إضافة: تعبئة اسم مقدّم الطلب تلقائيًا من حساب المستخدم المسجَّل دخوله
   * (قابل للتعديل يدويًا بعدها) — بدل حقل فارغ يُجبر المستخدم على كتابة
   * اسمه من الصفر في كل مرة رغم أنه مسجَّل دخول أصلاً. لا نستبدل قيمة كتبها
   * المستخدم مسبقًا (نتحقق أنها لا تزال فارغة أولاً).
   */
  private prefillVisitorNameIfEmpty(): void {
    const nameControl = this.visitForm.controls.visitorName;
    if (!nameControl.value) {
      const displayName = this.authService.currentUserSnapshot?.displayName ?? '';
      if (displayName) {
        nameControl.setValue(displayName);
      }
    }
  }

  /**
   * ✅ إصلاح: فتح نموذج طلب الزيارة كان لا يُصاحَب بأي تمرير للصفحة —
   * على الجوال خصوصًا، النموذج يظهر أسفل الشاشة الحالية دون أن ينتبه
   * المستخدم لوجوده أصلاً، فيبدو وكأن الزر "لا يعمل".
   */
  toggleVisitForm(): void {
    const opening = !this.showVisitForm();
    this.showVisitForm.set(opening);

    if (opening) {
      this.prefillVisitorNameIfEmpty();
      this.scrollToElement('visit-form-section');
    }
  }

  toggleMessageForm(): void {
    const opening = !this.showMessageForm();
    this.showMessageForm.set(opening);

    if (opening) {
      this.messageSent.set(false);
      this.scrollToElement('message-form-section');
    }
  }

  /**
   * "My services → choose a property" arrives here as ?service=<Category>. It only opens the form
   * with that category selected (signed-in users); no request exists until the owner submits.
   */
  private openServiceFormFromQuery(): void {
    const raw = this.route.snapshot.queryParamMap.get('service');
    const category = SERVICE_CATEGORIES.find(item => item === raw) ?? null;
    if (!category || !this.isLoggedIn()) return;

    this.servicePreselect = category;
    this.createdServiceRequest.set(null);
    this.showServiceForm.set(true);
    this.loadServiceCategoriesIfNeeded();
    if (this.serviceAvailability().length > 0) this.selectServiceCategory(category);
    this.scrollToElement('service-form-section');
  }

  toggleServiceForm(): void {
    const opening = !this.showServiceForm();
    this.showServiceForm.set(opening);
    if (opening) this.createdServiceRequest.set(null);

    if (opening) {
      this.loadServiceCategoriesIfNeeded();
      this.scrollToElement('service-form-section');
    }
  }

  private loadServiceCategoriesIfNeeded(): void {
    if (this.serviceAvailability().length > 0 || this.loadingServiceCategories()) {
      return;
    }

    this.loadingServiceCategories.set(true);
    this.serviceLoadFailed.set(false);
    this.serviceOfferingApi.getAvailability()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.serviceAvailability.set(items);
          this.loadingServiceCategories.set(false);
          const available = this.availableServiceCategories();
          const wanted = this.servicePreselect && available.includes(this.servicePreselect)
            ? this.servicePreselect
            : (available.includes('Verification') ? 'Verification' : available[0] ?? null);
          this.servicePreselect = null;
          if (wanted) this.selectServiceCategory(wanted);
        },
        error: () => {
          this.serviceLoadFailed.set(true);
          this.loadingServiceCategories.set(false);
        }
      });
  }

  selectServiceCategory(category: ServiceCategory): void {
    this.serviceCategory.set(category);
    this.serviceOfferings.set([]);
    this.selectedOfferingId.set(null);
    this.serviceLoadFailed.set(false);
    this.loadingServiceOfferings.set(true);

    // Providers that do not cover this property's governorate are left out by the server.
    this.serviceOfferingApi.getByCategory(category, this.property()?.governorateId ?? null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: offerings => {
          // A slow answer for a category the owner already left must not replace the current one.
          if (this.serviceCategory() !== category) return;
          this.serviceOfferings.set(offerings);
          this.selectedOfferingId.set(offerings.length === 1 ? offerings[0]!.id : null);
          this.loadingServiceOfferings.set(false);
        },
        error: () => {
          if (this.serviceCategory() !== category) return;
          this.serviceLoadFailed.set(true);
          this.loadingServiceOfferings.set(false);
        }
      });
  }

  private scrollToElement(elementId: string): void {
    // setTimeout(0): الفتح عبر *ngIf يحتاج دورة عرض واحدة على الأقل قبل أن
    // يظهر العنصر فعليًا في الـ DOM — بدونه scrollIntoView يُنفَّذ قبل وجود
    // العنصر أصلًا فلا يفعل شيئًا.
    setTimeout(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  // ✅ إضافة: تنقّل بلوحة المفاتيح داخل عارض الصور (Escape / الأسهم) —
  // يحترم اتجاه RTL مثل بقية دوال التنقّل بالمعرض.
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.modalOpen()) {
      this.closeModal();
    }
  }

  @HostListener('document:keydown.arrowleft')
  onArrowLeftKey(): void {
    if (!this.modalOpen()) return;
    this.isRTL() ? this.next() : this.prev();
  }

  @HostListener('document:keydown.arrowright')
  onArrowRightKey(): void {
    if (!this.modalOpen()) return;
    this.isRTL() ? this.prev() : this.next();
  }

  // ── Data Loading ──────────────────────────────────────────────────────
  private currentId = '';
  private propertySub?: Subscription;
  private reviewsSub?: Subscription;

  /** Retry button — re-runs only the data load (ngOnInit must not run twice: it registers handlers). */
  retry(): void {
    this.loadForId(this.currentId);
  }

  private loadForId(id: string): void {
    this.currentId = id;
    this.propertySub?.unsubscribe();
    this.reviewsSub?.unsubscribe();

    // Clear the previous listing's state so nothing stale shows while (or after failing) to load.
    this.showServiceForm.set(false);
    this.serviceCategory.set(null);
    this.serviceOfferings.set([]);
    this.selectedOfferingId.set(null);
    this.property.set(null);
    this.translation.reset();
    this.reviews.set([]);
    this.error.set('');
    this.currentIndex.set(0);

    if (!id) {
      this.error.set('PROPERTY_DETAIL.NO_ID');
      this.loading.set(false);
      this.removeStructuredData();
      this.propertyMeta.markNotFound();
      return;
    }

    // A malformed id can never name a listing: the API answers it with 401/404 from a route
    // fallthrough, which used to surface as a retryable "could not load" error for anonymous visitors.
    if (!isGuid(id)) {
      this.loading.set(false);
      this.removeStructuredData();
      this.propertyMeta.markNotFound();
      return;
    }

    this.loadProperty(id);
    this.loadReviews(id);
  }

  private loadProperty(id: string): void {
    this.loading.set(true);
    this.liveViewCount.set(null);
    this.propertySub = this.propertyApi
      .getProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.property.set(data);
          this.currentIndex.set(0);
          this.loading.set(false);
          this.openServiceFormFromQuery();
          this.loadOwnerProfile(data.ownerId);
          // Social Sharing & Distribution (section 6) — dynamic <title>/OG/Twitter/canonical
          // tags for this specific listing. See PropertyMetaService's doc comment for why this
          // alone does not yet cover crawlers that don't execute JavaScript.
          this.propertyMeta.applyTo(data);
          this.applyStructuredData(data);
          // UTM / Attribution (Phase 2) — a real page view, never fired merely because the
          // Share button was tapped. Deduplicated per property per page session internally
          // (see PropertyAttributionTrackingService.trackView).
          this.attributionTracking.trackView(data.id);
          this.recordView(data.id);
          this.printFromQueryOnce(data);
          // After everything the visitor needs is on screen; a failure here changes nothing above.
          this.translation.start(data.id, this.currentLang());
        },
        error: (err: unknown) => {
          // A definitive 404 means the listing doesn't exist / isn't public: show the "not
          // found" state (error stays empty), not a retryable load failure.
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.property.set(null);
            this.removeStructuredData();
            this.propertyMeta.markNotFound();
          } else {
            this.error.set('PROPERTY_DETAIL.LOAD_ERROR');
          }
          this.loading.set(false);
        }
      });
  }

  /**
   * View counter: the listing page is on screen, so tell the server once. The cached detail
   * response can be older than the latest views, so the answer (the server's total) replaces the
   * number shown; a failure leaves the number from the listing and is otherwise invisible.
   */
  private recordView(propertyId: string): void {
    this.listingViews
      .record('property', propertyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result && this.property()?.id === propertyId) {
          this.liveViewCount.set(result.viewCount);
        }
      });
  }

  /** JSON-LD (schema.org RealEstateListing + BreadcrumbList) for this listing — same
   *  public-shareable gate as PropertyMetaService.applyTo (no-ops otherwise). */
  private applyStructuredData(property: Property): void {
    const listing = this.propertyStructuredData.buildListing(property);
    if (!listing) {
      this.removeStructuredData();
      return;
    }
    this.structuredData.setJsonLd(LISTING_JSON_LD_ID, listing);

    const siteOrigin = this.shareUrl.getSiteOrigin();
    this.structuredData.setJsonLd(
      BREADCRUMB_JSON_LD_ID,
      this.structuredData.buildBreadcrumbList([
        { name: 'الرئيسية', url: `${siteOrigin}/` },
        { name: 'العقارات', url: `${siteOrigin}/properties` },
        { name: property.title?.trim() || 'تفاصيل العقار', url: `${siteOrigin}/properties/${property.id}` }
      ])
    );
  }

  private removeStructuredData(): void {
    this.structuredData.removeJsonLd(LISTING_JSON_LD_ID);
    this.structuredData.removeJsonLd(BREADCRUMB_JSON_LD_ID);
  }

  /**
   * GET /api/users/{id} — لا داعي لجلبها لصاحب الإعلان نفسه (يرى بياناته
   * أصلاً)، ولا إن كان العقار بلا ownerId لأي سبب.
   *
   * ✅ إصلاح: GET /api/users/{id} يتطلب تسجيل دخول بالتصميم (راجع
   * PublicEndpointPolicyTests.cs — غير مُدرَج ضمن ApprovedAnonymousEndpoints
   * عمداً)، فكانت بطاقة المالك لا تظهر إطلاقاً لزائر غير مسجَّل دخول. بدل
   * توسيع سطح الوصول المجهول (قرار معماري يتطلب مراجعة صريحة)، نستخدم بدلاً
   * منه GET /api/users/{id}/profile الموجودة أصلاً والمُعتمدة كـ AllowAnonymous
   * (UsersController.GetProfile — "Public seller profile") فقط لزائر غير
   * مسجَّل دخول؛ نفس مسار الملف الشخصي العام الذي تستهلكه UserProfilePage.
   * لا رقم هاتف في تلك الاستجابة أصلاً (تصميم الباك اند)، فيبقى الهاتف
   * ظاهراً فقط للمستخدم المسجَّل دخوله تماماً كما كان.
   */
  private loadOwnerProfile(ownerId: string | undefined): void {
    if (!ownerId || ownerId === this.authService.getCurrentUserId()) {
      return;
    }

    this.ownerProfileLoading.set(true);

    const request$ = this.isLoggedIn()
      ? this.profileApi.getPublicProfile(ownerId)
      : this.userProfileApi.getProfile(ownerId).pipe(
          map((p): PublicUserProfile => ({
            id: p.id,
            displayName: p.displayName,
            profileImageUrl: p.profileImageUrl,
            phoneNumber: null,
            roles: p.isAgent ? ['Agent'] : []
          }))
        );

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          this.ownerProfile.set(profile);
          this.ownerProfileLoading.set(false);
        },
        error: () => this.ownerProfileLoading.set(false)
      });
  }

  private loadReviews(propertyId: string): void {
    this.loadingReviews.set(true);
    this.reviewsSub = this.reviewService
      .getPropertyReviews(propertyId, 1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.reviews.set(data);
          this.loadingReviews.set(false);
        },
        error: () => this.loadingReviews.set(false)
      });
  }

  // ── Gallery ───────────────────────────────────────────────────────────
  prev(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
    }
  }

  next(): void {
    if (this.currentIndex() < this.images().length - 1) {
      this.currentIndex.update(i => i + 1);
    }
  }

  openModal(): void {
    if (!this.hasImages()) return;
    this.modalReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
    this.modalOpen.set(true);
    this.scrollLock.lock();
    setTimeout(() => this.lightboxClose?.nativeElement.focus(), 0);
  }

  closeModal(): void {
    if (!this.modalOpen()) return;

    this.modalOpen.set(false);
    this.scrollLock.unlock();
    this.modalReturnFocus?.focus();
    this.modalReturnFocus = undefined;
  }

  onGalleryPointerDown(event: PointerEvent): void {
    this.suppressGalleryClickUntil = 0;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return;

    this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few embedded browser implementations.
    }
  }

  onGalleryPointerUp(event: PointerEvent): void {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (!start || start.id !== event.pointerId) return;

    const navigation = getGallerySwipeNavigation(
      event.clientX - start.x,
      event.clientY - start.y,
      this.isRTL()
    );
    if (!navigation) return;

    this.suppressGalleryClickUntil = Date.now() + 500;
    if (navigation === 'next') this.next();
    else this.prev();
  }

  onGalleryPointerCancel(): void {
    this.pointerStart = undefined;
  }

  onGalleryClick(event: MouseEvent): void {
    if (Date.now() < this.suppressGalleryClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.openModal();
  }

  onLightboxKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') this.trapLightboxFocus(event);
  }

  private trapLightboxFocus(event: KeyboardEvent): void {
    const lightbox = event.currentTarget as HTMLElement;
    const focusable = Array.from(lightbox.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ));
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ── Availability confirmation (Phase-0, Task 2) ──────────────────────
  /**
   * PATCH /properties/{id}/confirm-availability. Owner-only (see isOwner);
   * updates LastConfirmedAvailableAt locally on success so the staleness
   * banner disappears immediately without a full reload.
   */
  confirmStillAvailable(): void {
    const property = this.property();
    if (!property?.id || this.confirmingAvailability()) return;

    this.confirmingAvailability.set(true);

    this.propertyApi
      .confirmAvailability(property.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.property.update(current =>
            current ? { ...current, lastConfirmedAvailableAt: new Date().toISOString() } : current
          );
          this.toast.success(this.translate.instant('PROPERTY_DETAIL.CONFIRM_AVAILABILITY_SUCCESS'));
          this.confirmingAvailability.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('PROPERTY_DETAIL.CONFIRM_AVAILABILITY_ERROR'));
          this.confirmingAvailability.set(false);
        }
      });
  }

  // ── Visit ─────────────────────────────────────────────────────────────
  submitVisit(): void {
    // ✅ إصلاح: كان هذا الحارس (visitForm.invalid) يوقف الإرسال بصمت تامة —
    // لا Toast ولا أي رسالة تشرح للمستخدم لماذا لم يحدث شيء عند الضغط على
    // "إرسال" (وهذا على الأرجح بالضبط ما وُصِف بأن "الطلب لا يُرسَل"). الآن
    // نميّز الحقول غير الصالحة (markAllAsTouched تُظهر رسائل الخطأ تحت كل
    // حقل عبر القالب) ونعرض Toast صريحًا بدل الإرجاع الصامت.
    if (this.visitForm.invalid) {
      this.visitForm.markAllAsTouched();
      this.toast.show(this.translate.instant('VISIT.FORM_INVALID'), 'error');
      return;
    }

    if (!this.property()) return;

    const raw = this.visitForm.getRawValue();
    // ✅ إصلاح: دمج حقلي التاريخ والوقت المنفصلين (visitDate + visitTime)
    // في لحظة إرسال الطلب فقط — الـ API لا يزال يتوقع ISO 8601 واحد.
    const proposedAt = new Date(`${raw.visitDate}T${raw.visitTime}:00`);

    const request: CreateVisitRequest = {
      propertyId:   this.property()!.id,
      proposedAt:   proposedAt.toISOString(),
      visitorName:  raw.visitorName!.trim(),
      visitorPhone: raw.visitorPhone!.trim(),
      visitorNote:  raw.visitorNote ?? null
    };

    const validationError = validateCreateVisit(request);
    if (validationError) {
      this.toast.show(this.translate.instant(validationError), 'error');
      return;
    }

    this.savingVisit.set(true);
    this.visitService
      .requestVisit(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.show(this.translate.instant('VISIT.SUCCESS'), 'success');
          this.showVisitForm.set(false);
          this.visitForm.reset();
          this.savingVisit.set(false);
          // UTM / Attribution (Phase 2) — the closest equivalent this product has to a "Lead"
          // (property_lead_created in the feature spec); see PropertyAttributionTrackingService.
          this.attributionTracking.trackLead(request.propertyId);
        },
        error: () => {
          this.toast.show(this.translate.instant('VISIT.ERROR'), 'error');
          this.savingVisit.set(false);
        }
      });
  }

  // ── Service request ────────────────────────────────────────────────────
  closeServiceForm(): void {
    this.showServiceForm.set(false);
    this.createdServiceRequest.set(null);
  }

  /**
   * Both buttons open the same in-app conversation: "ask more" and "request the service" differ only in the
   * intent that is recorded for the statistics. It becomes a real request when the customer confirms it.
   */
  submitServiceRequest(intent: ServiceRequestIntent = 'Request'): void {
    const property = this.property();
    const offering = this.selectedOffering();
    if (!property || !offering) return;

    const payload = {
      propertyId: property.id,
      serviceOfferingId: offering.id,
      requesterNote: this.serviceRequestNote.trim() || null,
      intent
    };

    const validationError = validateCreateServiceRequest(payload);
    if (validationError) {
      this.toast.show(this.translate.instant(validationError), 'error');
      return;
    }

    this.savingServiceRequest.set(true);
    this.serviceRequestApi.create(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.toast.show(this.translate.instant('SERVICE_REQUEST.SUCCESS'), 'success');
          this.createdServiceRequest.set(created);
          this.serviceRequestNote = '';
          this.savingServiceRequest.set(false);
        },
        error: () => {
          this.toast.show(this.translate.instant('SERVICE_REQUEST.ERROR'), 'error');
          this.savingServiceRequest.set(false);
        }
      });
  }

  /** The embedded thread reports its size so the confirm button appears after the first message. */
  onCreatedActivity(activity: ServiceConversationActivity): void {
    this.createdServiceRequest.update(created => created && created.id === activity.requestId
      ? { ...created, messageCount: activity.messageCount, unreadMessageCount: activity.unreadMessageCount, lastMessageAt: activity.lastMessageAt }
      : created);
  }

  onCreatedConfirmed(updated: ServiceRequestDto): void {
    this.createdServiceRequest.update(created => ({
      ...updated,
      messageCount: updated.messageCount ?? created?.messageCount,
      unreadMessageCount: updated.unreadMessageCount ?? created?.unreadMessageCount,
      lastMessageAt: updated.lastMessageAt ?? created?.lastMessageAt
    }));
  }

  // ── Message Owner (يستخدم MessagesController — كان بدون أي واجهة إطلاقاً) ──
  sendMessage(): void {
    const property = this.property();
    if (!property?.id) return;

    const validationError = validateMessageContent(this.messageDraft);
    if (validationError) {
      this.toast.show(this.translate.instant(validationError), 'error');
      return;
    }

    this.savingMessage.set(true);

    this.messagesApi
      .sendMessage({ propertyId: property.id, receiverId: null, content: this.messageDraft })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.show(this.translate.instant('MESSAGES.SEND_SUCCESS'), 'success');
          this.messageSent.set(true);
          this.messageDraft = '';
          this.savingMessage.set(false);
          // UTM / Attribution (Phase 2) — "contact" half of the Facebook → Property → Visit →
          // Contact funnel (section 13).
          this.attributionTracking.trackMessageSent(property.id);
        },
        error: err => {
          const backendMessage = err?.error?.message as string | undefined;
          this.toast.show(backendMessage || this.translate.instant('MESSAGES.SEND_ERROR'), 'error');
          this.savingMessage.set(false);
        }
      });
  }

  // ── UTM / Attribution (Phase 2): the owner's `tel:` link is a plain anchor — this only
  // records that it was tapped, it never intercepts/prevents the actual `tel:` navigation. ──
  onOwnerPhoneClick(): void {
    const property = this.property();
    if (property?.id) {
      this.attributionTracking.trackPhoneClick(property.id);
    }
  }

  // ── Review ────────────────────────────────────────────────────────────
  submitReview(): void {
    if (this.reviewForm.invalid || !this.property()) return;

    const raw = this.reviewForm.getRawValue();
    const request = {
      propertyId: this.property()!.id,
      rating: raw.rating!,
      comment: raw.comment?.trim() || null
    };

    const validationError = validateCreateReview(request);
    if (validationError) {
      this.toast.show(this.translate.instant(validationError), 'error');
      return;
    }

    this.savingReview.set(true);

    this.reviewService
      .addReview(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: review => {
          this.reviews.update(prev => [review, ...prev]);
          this.toast.show(this.translate.instant('REVIEW.SUCCESS'), 'success');
          this.showReviewForm.set(false);
          this.reviewForm.reset({ rating: 5 });
          this.savingReview.set(false);
        },
        error: err => {
          // تقييم العقار يتطلب زيارة مكتملة — الخادم يشرح السبب في body.message؛
          // نعرضه بدل رسالة عامة كانت تُشعر المستخدم بأن "التقييم لا يعمل".
          const backendMessage = err?.error?.message as string | undefined;
          this.toast.show(backendMessage || this.translate.instant('REVIEW.ERROR'), 'error');
          this.savingReview.set(false);
        }
      });
  }

  /** The native app opens `<public url>?print=1` in the system browser to print (a WebView cannot print
   *  an iframe); the listing is then printed once it has loaded. */
  private printRequested = false;
  private printFromQueryOnce(data: Property): void {
    if (this.printRequested || this.route.snapshot.queryParamMap.get(PRINT_QUERY_PARAM) !== '1') return;
    this.printRequested = true;
    void this.printer.print(data);
  }

  // ── Price Helpers ─────────────────────────────────────────────────────
  formatPrice(value: number | null | undefined): string {
    return formatListingPrice(value, this.property()?.currencyCode);
  }

  locationSeparator(): string {
    return listSeparator();
  }

  safe(value: unknown, fallback = '—'): string {
    const text = value == null ? '' : String(value).trim();
    return text || fallback;
  }

  thumbnailUrl(url: string | null | undefined): string {
    return this.urlService.buildResponsiveUrl(url, GALLERY_THUMB_WIDTH) ?? '/images/no-image.svg';
  }

  thumbnailAlt(img: PropertyImage, index: number): string {
    const descriptive = img.altText?.trim() || this.property()?.title?.trim();
    return descriptive
      ? this.translate.instant('PROPERTY_DETAIL.IMAGE_ALT', { title: descriptive, n: index + 1 })
      : this.translate.instant('PROPERTY_DETAIL.IMAGE_N', { n: index + 1 });
  }

  /** رانج النجوم 1-5 للعرض */
  readonly starsRange = [1, 2, 3, 4, 5];

  isRentListing(): boolean {
    const lt = this.property()?.listingType;
    return lt === 'ForRent' || lt === 'ForRentAndSale';
  }

  isSaleListing(): boolean {
    const lt = this.property()?.listingType;
    return lt === 'ForSale' || lt === 'ForRentAndSale';
  }
}

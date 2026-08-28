// =============================================================
// src/app/features/property-detail/property-detail.page.ts
//
// بديل عن: wohnung-detail/wohnung-detail.component.ts
//
// التحسينات:
//   ✅ PropertyApiService بدل WohnungenService
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
  HostListener,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { AuthService } from '../../core/auth/auth.service';
import { Property } from '../../core/models/property.model';
import { REVIEW_COMMENT_MAX_LENGTH, ReviewDto, validateCreateReview } from '../../core/models/review.model';
import { CreateVisitRequest, validateCreateVisit } from '../../core/models/visit.model';
import { ServiceOfferingDto, validateCreateServiceRequest } from '../../core/models/service.model';
import { validateMessageContent } from '../../core/models/message.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FavoriteToggleButtonComponent } from '../../shared/ui/favorite-toggle-button.component';
import { ToastService } from '../../shared/services/toast.service';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';

@Component({
  selector: 'app-property-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    ImageFallbackDirective,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    FavoriteToggleButtonComponent
  ],
  templateUrl: './property-detail.page.html',
  styleUrls: ['./property-detail.page.scss']
})
export class PropertyDetailPage implements OnInit {

  // ── DI ────────────────────────────────────────────────────────────────
  private readonly propertyApi  = inject(PropertyApiService);
  private readonly reviewService = inject(ReviewService);
  private readonly visitService  = inject(VisitService);
  private readonly serviceOfferingApi = inject(ServiceOfferingService);
  private readonly serviceRequestApi  = inject(ServiceRequestService);
  private readonly messagesApi   = inject(MessagesApiService);
  private readonly profileApi    = inject(ProfileService);
  private readonly router        = inject(Router);
  private readonly authService   = inject(AuthService);
  private readonly route         = inject(ActivatedRoute);
  private readonly translate     = inject(TranslateService);
  private readonly toast         = inject(ToastService);
  private readonly destroyRef    = inject(DestroyRef);
  private readonly fb            = inject(FormBuilder);
  private readonly overlayBackHandler = inject(OverlayBackHandlerService);

  // ── State Signals ─────────────────────────────────────────────────────
  readonly property       = signal<Property | null>(null);
  readonly reviews        = signal<ReviewDto[]>([]);
  readonly loading        = signal(true);
  readonly loadingReviews = signal(false);
  readonly error          = signal('');
  readonly currentIndex   = signal(0);
  readonly modalOpen      = signal(false);
  readonly showVisitForm  = signal(false);
  readonly showReviewForm = signal(false);
  readonly showMessageForm = signal(false);
  readonly isLoggedIn     = computed(() => !!this.authService.getAccessToken());

  // ── Computed ──────────────────────────────────────────────────────────
  readonly images = computed(() =>
    this.property()?.images?.filter(img => !!img.url) ?? []
  );
  readonly hasImages = computed(() => this.images().length > 0);
  readonly currentImageUrl = computed(() =>
    this.images()[this.currentIndex()]?.url ?? '/images/no-image.svg'
  );
  readonly currentImageAlt = computed(() =>
    this.images()[this.currentIndex()]?.altText ?? this.property()?.title ?? ''
  );
  readonly isRTL = computed(() =>
    this.translate.currentLang === 'ar' || document.documentElement.dir === 'rtl'
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

  // ── AqarTech Verify request (Services Marketplace vertical slice) ──────
  // Only the "Verification" category is a live product this session — see
  // ServiceCategory's remarks in service.model.ts. The offering is fetched
  // lazily (once) the first time the panel opens, not on every page load,
  // since most visitors never click it.
  readonly showServiceForm = signal(false);
  readonly loadingVerifyOffering = signal(false);
  readonly verifyOffering = signal<ServiceOfferingDto | null>(null);
  readonly verifyOfferingUnavailable = signal(false);
  readonly savingServiceRequest = signal(false);
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
  private startX = 0;
  private isDragging = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';

    if (!id) {
      this.error.set('PROPERTY_DETAIL.NO_ID');
      this.loading.set(false);
      return;
    }

    this.loadProperty(id);
    this.loadReviews(id);

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
      this.scrollToElement('message-form-section');
    }
  }

  toggleServiceForm(): void {
    const opening = !this.showServiceForm();
    this.showServiceForm.set(opening);

    if (opening) {
      this.loadVerifyOfferingIfNeeded();
      this.scrollToElement('service-form-section');
    }
  }

  private loadVerifyOfferingIfNeeded(): void {
    if (this.verifyOffering() || this.verifyOfferingUnavailable() || this.loadingVerifyOffering()) {
      return;
    }

    this.loadingVerifyOffering.set(true);
    this.serviceOfferingApi.getByCategory('Verification')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: offerings => {
          this.verifyOffering.set(offerings[0] ?? null);
          this.verifyOfferingUnavailable.set(offerings.length === 0);
          this.loadingVerifyOffering.set(false);
        },
        error: () => {
          this.verifyOfferingUnavailable.set(true);
          this.loadingVerifyOffering.set(false);
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
  private loadProperty(id: string): void {
    this.loading.set(true);
    this.propertyApi
      .getProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.property.set(data);
          this.currentIndex.set(0);
          this.loading.set(false);
          this.loadOwnerProfile(data.ownerId);
        },
        error: () => {
          this.error.set('PROPERTY_DETAIL.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  /**
   * GET /api/users/{id} — لا داعي لجلبها لصاحب الإعلان نفسه (يرى بياناته
   * أصلاً)، ولا إن كان العقار بلا ownerId لأي سبب.
   */
  private loadOwnerProfile(ownerId: string | undefined): void {
    if (!ownerId || ownerId === this.authService.getCurrentUserId()) {
      return;
    }

    this.ownerProfileLoading.set(true);
    this.profileApi
      .getPublicProfile(ownerId)
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
    this.reviewService
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
    if (this.hasImages()) this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  onDragStart(event: MouseEvent | TouchEvent): void {
    this.isDragging = true;
    this.startX = 'touches' in event
      ? event.touches[0].clientX
      : event.pageX;
  }

  onDragEnd(event: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const endX = 'changedTouches' in event
      ? event.changedTouches[0].clientX
      : (event as MouseEvent).pageX;
    const diff = endX - this.startX;
    if (diff > 60)       { this.isRTL() ? this.next() : this.prev(); }
    else if (diff < -60) { this.isRTL() ? this.prev() : this.next(); }
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
        },
        error: () => {
          this.toast.show(this.translate.instant('VISIT.ERROR'), 'error');
          this.savingVisit.set(false);
        }
      });
  }

  // ── AqarTech Verify request ──────────────────────────────────────────
  submitServiceRequest(): void {
    const property = this.property();
    const offering = this.verifyOffering();
    if (!property || !offering) return;

    const payload = {
      propertyId: property.id,
      serviceOfferingId: offering.id,
      requesterNote: this.serviceRequestNote.trim() || null
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
        next: () => {
          this.toast.show(this.translate.instant('SERVICE_REQUEST.SUCCESS'), 'success');
          this.showServiceForm.set(false);
          this.serviceRequestNote = '';
          this.savingServiceRequest.set(false);
        },
        error: () => {
          this.toast.show(this.translate.instant('SERVICE_REQUEST.ERROR'), 'error');
          this.savingServiceRequest.set(false);
        }
      });
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
          this.showMessageForm.set(false);
          this.messageDraft = '';
          this.savingMessage.set(false);
        },
        error: () => {
          this.toast.show(this.translate.instant('MESSAGES.SEND_ERROR'), 'error');
          this.savingMessage.set(false);
        }
      });
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
        error: () => {
          this.toast.show(this.translate.instant('REVIEW.ERROR'), 'error');
          this.savingReview.set(false);
        }
      });
  }

  // ── Price Helpers ─────────────────────────────────────────────────────
  formatPrice(value: number | null | undefined): string {
    if (!value) return '—';
    const p = this.property();
    const currency = p?.currencyCode ?? 'EUR';
    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency', currency, maximumFractionDigits: 0
      }).format(value);
    } catch {
      return `${value.toLocaleString('ar')} ${currency}`;
    }
  }

  safe(value: unknown, fallback = '—'): string {
    const text = value == null ? '' : String(value).trim();
    return text || fallback;
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
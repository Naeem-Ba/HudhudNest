// Public subscription plans page (/pricing) — Free / Basic / Premium / Elite.
//
// Mirrors features/saved-searches/saved-searches.page.ts's shape (signals for view
// state, RxJS for transport, takeUntilDestroyed on every subscribe, error signal
// holding an i18n KEY rather than a message).
//
// Design note: the approved mockup ships a "Broadcast Red" palette, but this page is
// drawn with the app's own HudhudNest tokens (--navy / --gold / Cairo) so it matches the
// other ~25 pages and inherits dark mode and RTL for free. Only the layout and the plan
// content come from the mockup.

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, map, of, switchMap } from 'rxjs';

import { PlansApiService } from '../../core/api/plans-api.service';
import { PaymentsApiService } from '../../core/api/payments-api.service';
import { isNativeApp } from '../../core/native/is-native-app';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { knownErrorCodeKey } from '../../core/interceptors/api-error.interceptor';
import { ProfileService } from '../../core/api/profile.service';
import { AuthService } from '../../core/auth/auth.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { SubscriptionPlan } from '../../core/models/subscription-plan.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ToastService } from '../../shared/services/toast.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

/**
 * F-22: /pricing?autoSelect=<tier> used to POST the plan for any signed-in visitor who merely
 * opened the link, so a crafted link could change someone's plan without a tap. The auto-select
 * now only runs for the visitor who actually tapped a plan while signed out in THIS tab: that tap
 * leaves this single-use marker in sessionStorage, and the return from login consumes it.
 */
const PENDING_AUTO_SELECT_KEY = 'pricing.pendingAutoSelect';

/** Long enough for a login round trip, short enough that a stale marker cannot be replayed. */
const PENDING_AUTO_SELECT_MAX_AGE_MS = 15 * 60 * 1000;

@Component({
  selector: 'app-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, TranslateModule, LoadingSpinnerComponent],
  templateUrl: './pricing.page.html',
  styleUrls: ['./pricing.page.scss']
})
export class PricingPage implements OnInit {
  private readonly api = inject(PlansApiService);
  private readonly payments = inject(PaymentsApiService);
  private readonly profileService = inject(ProfileService);
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly pageMeta = inject(PageMetaService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  /** Tier currently being selected, if any — disables that card's button so a double
   * click can't fire two POSTs while the first is still in flight. */
  readonly selecting = signal<string | null>(null);

  /**
   * ✅ إصلاح: التمييز الذهبي كان مربوطًا بـ plan.isRecommended (علم ثابت من
   * الخادم)، فيظهر دائمًا على الخطة "الموصى بها" بصرف النظر عمّا يضغطه
   * المستخدم فعليًا. الآن التمييز الذهبي يتبع هذه الإشارة — الخطة التي
   * ضغطها المستخدم (بطاقة أو زر) — ولا شيء محدد افتراضيًا عند فتح الصفحة.
   * وسم "موصى بها" (plan-card__badge) يبقى مربوطًا بـ isRecommended كوسم
   * معلوماتي بحت، منفصل عن لون التحديد.
   */
  readonly selectedTier = signal<string | null>(null);

  /** Set when listing-eligibility.guard.ts redirected here with ?reason=plan-required —
   * i.e. the visitor already confirmed their contact info but still needs to pick a
   * plan before /property-form will let them in. */
  readonly showPlanRequiredBanner = signal(false);

  /** Set when the visitor was sent here because an office needs a paid plan. */
  readonly showAgencyPlanBanner = signal(false);

  /**
   * true when the signed-in visitor owns an office: the free plan does not cover offices,
   * and the API refuses it (AGENCY_FREE_PLAN_NOT_ALLOWED), so its button is disabled up
   * front instead of letting them click into an error.
   */
  readonly ownsAgency = signal(false);

  /**
   * The paid tier this visitor already asked for and an administrator has not activated yet.
   * It grants nothing; the card for it says so, and asking again is harmless (the server
   * keeps one outstanding request per user).
   */
  readonly pendingTier = signal<string | null>(null);

  /**
   * The plan that is IN FORCE right now, or null when the visitor has none that grants anything
   * (never chose one, expired, cancelled, or just the free tier). Taken from the server's
   * effective status, not from PlanTier alone: an expired plan keeps its tier but benefits nothing.
   */
  readonly currentPaidTier = signal<string | null>(null);

  /** When the plan in force ends (ISO), or null for no fixed end. */
  readonly currentPlanExpiresAt = signal<string | null>(null);

  /**
   * True when the server says online payments are switched on and at least one provider can be offered. Only then does a paid
   * plan lead to the payment checkout; otherwise the older request-and-contact flow is unchanged. Never true inside the
   * installed iOS/Android app: store rules require the store's own billing there, which is not implemented.
   */
  readonly onlinePayments = signal(false);

  ngOnInit(): void {
    // Public marketing page: own title/description and a canonical (SEO.PRICING in the i18n files).
    this.pageMeta.applyTranslated('SEO.PRICING', '/pricing', this.destroyRef);
    this.load();

    this.showPlanRequiredBanner.set(
      this.route.snapshot.queryParamMap.get('reason') === 'plan-required'
    );
    this.showAgencyPlanBanner.set(
      this.route.snapshot.queryParamMap.get('reason') === 'agency-plan-required'
    );
    this.loadAgencyOwnership();
    this.trackPendingPlan();
    this.loadPaymentAvailability();
  }

  private loadPaymentAvailability(): void {
    if (isNativeApp()) {
      return;
    }
    this.payments.catalog()
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(catalog => this.onlinePayments.set(catalog?.enabled === true && catalog.providers.length > 0));
  }

  private trackPendingPlan(): void {
    this.profileService.profile$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(profile => {
        this.pendingTier.set(profile?.PendingPlanTier ?? null);

        const tier = profile?.PlanTier ?? null;
        const inForce = !!tier && tier !== 'free' && profile?.PlanStatus === 'Active';
        this.currentPaidTier.set(inForce ? tier : null);
        this.currentPlanExpiresAt.set(inForce ? profile?.PlanExpiresAt ?? null : null);
      });
  }

  private loadAgencyOwnership(): void {
    if (!this.auth.getAccessToken()) {
      return;
    }

    this.agenciesApi
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: agency => {
          const id = this.auth.getCurrentUserId();
          this.ownsAgency.set(!!agency && !!id && agency.ownerUserId === id);
        },
        // The API refuses the free plan to an owner regardless; this only spares the click.
        error: () => this.ownsAgency.set(false)
      });
  }

  isBlockedForAgencyOwner(plan: SubscriptionPlan): boolean {
    return this.ownsAgency() && plan.tier === 'free';
  }

  /**
   * The free card is disabled while a paid plan is in force: the server refuses it
   * (PAID_PLAN_ACTIVE) because it would silently end what the visitor paid for. Only an
   * administrator can cancel a paid plan, so the card explains that instead of failing on click.
   */
  isBlockedByPaidPlan(plan: SubscriptionPlan): boolean {
    return plan.tier === 'free' && this.currentPaidTier() !== null;
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.getPlans()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.plans.set(data ?? []);
          this.loading.set(false);
          this.resumeAutoSelectAfterLogin();
        },
        error: () => {
          this.error.set('PRICING.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  /**
   * ✅ إضافة: يُكمل اختيار الخطة تلقائيًا بعد جولة تسجيل الدخول التي بدأها
   * onSelectPlan أدناه (?autoSelect=<tier>) — بدل أن يضطر المستخدم لضغط
   * "أضف إعلانك مجاناً" مرة ثانية بعد الدخول. لا يُشغَّل إلا إذا كان مسجَّل
   * الدخول فعليًا الآن (احتراز: رابط autoSelect قديم/معاد استخدامه لا يجب أن
   * يُطلق شيئًا لزائر ما زال مجهولاً).
   *
   * ✅ إصلاح F-22: وجود ?autoSelect في الرابط وحده لم يعد كافيًا — أي رابط مصنوع
   * كان يغيّر خطة أي مستخدم مسجَّل الدخول يفتحه بلا نقرة. الآن يلزم أيضًا علامة
   * لمرة واحدة تركها onSelectPlan في هذا التبويب حين ضغط الزائر الخطة وهو غير
   * مسجَّل. العلامة تُحذف عند أول قراءة سواء نجحت أم لا، فلا تكرار بإعادة التحميل
   * ولا بزر الرجوع. بدونها لا يحدث شيء ويضغط المستخدم الزر بنفسه.
   */
  private resumeAutoSelectAfterLogin(): void {
    const tier = this.route.snapshot.queryParamMap.get('autoSelect');
    if (!tier || !this.auth.getAccessToken()) {
      return;
    }

    if (!this.consumePendingAutoSelect(tier)) {
      return;
    }

    const plan = this.plans().find(p => p.tier === tier);
    if (plan) {
      this.onSelectPlan(plan);
    }
  }

  private rememberPendingAutoSelect(tier: string): void {
    try {
      sessionStorage.setItem(PENDING_AUTO_SELECT_KEY, JSON.stringify({ tier, at: Date.now() }));
    } catch {
      // Storage blocked: sign-in still works, the visitor just taps the plan again on return.
    }
  }

  /** Reads and always deletes the marker; true only if it is fresh and was left for `tier`. */
  private consumePendingAutoSelect(tier: string): boolean {
    try {
      const raw = sessionStorage.getItem(PENDING_AUTO_SELECT_KEY);
      if (raw === null) {
        return false;
      }
      sessionStorage.removeItem(PENDING_AUTO_SELECT_KEY);

      const marker: unknown = JSON.parse(raw);
      if (typeof marker !== 'object' || marker === null) {
        return false;
      }

      const { tier: markedTier, at } = marker as { tier?: unknown; at?: unknown };
      if (markedTier !== tier || typeof at !== 'number') {
        return false;
      }

      const age = Date.now() - at;
      return age >= 0 && age <= PENDING_AUTO_SELECT_MAX_AGE_MS;
    } catch {
      return false;
    }
  }

  trackByTier(_: number, plan: SubscriptionPlan): string {
    return plan.tier;
  }

  /** Card click / keyboard activation: only moves the gold highlight, does not submit
   * anything — mirrors a plain radio-style pick before the CTA button confirms it. */
  selectCard(plan: SubscriptionPlan): void {
    this.selectedTier.set(plan.tier);
  }

  /**
   * Records the choice (including "free" — a real selection, not an implicit default;
   * see UserAccount.PlanId's doc comment on the backend) before sending the visitor on
   * to ctaRoute, exactly as before (free → property-form, paid → the contact form —
   * still no payment gateway, see FRONTEND_BACKEND_CONTRACT.md §11.1).
   *
   * An anonymous visitor choosing a paid tier (ctaRoute '/kontakt', no auth required) is
   * sent straight there, unchanged. An anonymous visitor choosing the free tier
   * (ctaRoute '/property-form', behind AuthGuard) is routed through login ourselves —
   * see resumeAutoSelectAfterLogin() above — so the choice survives the round trip and
   * they land on property-form already selected, instead of AuthGuard bouncing them to
   * login with a plain returnUrl and losing the selection until they pick again.
   *
   * ✅ إصلاح: كانت الأخطاء هنا تُبتلع بالكامل (catchError(() => of(null))) والمستخدم
   * يُرسَل لـ ctaRoute حتى لو فشل حفظ الاختيار فعليًا في الخادم — فيصل لصفحة
   * "إضافة إعلان" بلا خطة محفوظة فعلًا، أو يظنّ أن اختياره نجح دون أي رسالة. الآن:
   * نجاح ⇐ رسالة نجاح واضحة (خاصة بالخطة المجانية) ثم الانتقال؛ فشل ⇐ رسالة خطأ
   * والبقاء في /pricing كي يعيد المحاولة، بدل الانتقال إلى حالة غير مؤكَّدة.
   */
  onSelectPlan(plan: SubscriptionPlan): void {
    // The CTA button is itself a selection control — clicking it must move the gold
    // highlight to this plan (and only this plan) before submitting it, so the visual
    // state and the plan actually sent to the backend can never disagree.
    if (this.isBlockedForAgencyOwner(plan) || this.isBlockedByPaidPlan(plan)) {
      return;
    }

    this.selectedTier.set(plan.tier);

    // Online payment: a priced plan goes to the payment checkout, where the server quotes the price. The old request flow
    // below (record a pending request, then contact an administrator) stays as it was for when payments are switched off.
    if (this.onlinePayments() && plan.priceKind === 'monthly') {
      const checkout = ['/payments/checkout'];
      const queryParams = { product: 'plan', plan: plan.tier };
      if (!this.auth.getAccessToken()) {
        void this.router.navigate(['/auth/login'], {
          queryParams: { returnUrl: `/payments/checkout?product=plan&plan=${encodeURIComponent(plan.tier)}` }
        });
        return;
      }
      void this.router.navigate(checkout, { queryParams });
      return;
    }

    const destination = (requestId?: string | null) =>
      void this.router.navigate([plan.ctaRoute], {
        // A paid plan is a pending request: carry its id to the contact form so the message
        // quotes the reference an administrator can match to the request.
        queryParams: requestId ? { ...plan.ctaQueryParams, ref: requestId } : plan.ctaQueryParams
      });

    if (!this.auth.getAccessToken()) {
      if (plan.ctaRoute === '/property-form') {
        this.rememberPendingAutoSelect(plan.tier);
        void this.router.navigate(['/auth/login'], {
          queryParams: { returnUrl: `/pricing?autoSelect=${plan.tier}` }
        });
        return;
      }

      destination();
      return;
    }

    // Prevents a repeat click/tap on ANY card from firing a second POST while the
    // first selection is still in flight — not just a repeat click on the same card.
    if (this.selecting()) {
      return;
    }

    this.selecting.set(plan.tier);

    this.api.selectPlan(plan.tier)
      .pipe(
        // Keep the shared profile$ (navbar, guard) in sync immediately rather than
        // waiting for their next independent load. A paid plan only becomes a pending
        // request here, so the refresh is what makes the "awaiting confirmation" note appear.
        switchMap(result => this.profileService.refresh().pipe(map(() => result))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: result => {
          this.selecting.set(null);
          // Only the free plan is a finished action. A paid tier is merely recorded as a
          // pending request here; the visitor still has to write and send the contact
          // message, so a success toast now would claim the request was received before
          // they have written anything. Guide them to the next step instead.
          if (plan.tier === 'free') {
            this.toast.success(this.translate.instant('PRICING.MESSAGES.FREE_SELECTED_SUCCESS'));
          } else {
            this.toast.info(this.translate.instant('PRICING.MESSAGES.PLAN_NEXT_STEP'));
          }
          destination(result?.requestId);
        },
        error: err => {
          this.selecting.set(null);
          // ApiErrorInterceptor already toasts a refusal with its own translated text
          // (AGENCY_FREE_PLAN_NOT_ALLOWED); the generic message would only bury it.
          if (!knownErrorCodeKey(err)) {
            this.toast.error(this.translate.instant('PRICING.MESSAGES.SELECT_ERROR'));
          }
          // Stay on /pricing — a failed save must not send the visitor on to a route
          // that assumes a plan was actually recorded.
        }
      });
  }
}

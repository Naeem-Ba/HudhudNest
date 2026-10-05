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
import { switchMap } from 'rxjs';

import { PlansApiService } from '../../core/api/plans-api.service';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { knownErrorCodeKey } from '../../core/interceptors/api-error.interceptor';
import { ProfileService } from '../../core/api/profile.service';
import { AuthService } from '../../core/auth/auth.service';
import { MetaService } from '../../core/services/meta.service';
import { SubscriptionPlan } from '../../core/models/subscription-plan.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule, LoadingSpinnerComponent],
  templateUrl: './pricing.page.html',
  styleUrls: ['./pricing.page.scss']
})
export class PricingPage implements OnInit {
  private readonly api = inject(PlansApiService);
  private readonly profileService = inject(ProfileService);
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(MetaService);
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

  ngOnInit(): void {
    this.applyMeta();
    this.load();

    this.showPlanRequiredBanner.set(
      this.route.snapshot.queryParamMap.get('reason') === 'plan-required'
    );
    this.showAgencyPlanBanner.set(
      this.route.snapshot.queryParamMap.get('reason') === 'agency-plan-required'
    );
    this.loadAgencyOwnership();
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
   */
  private resumeAutoSelectAfterLogin(): void {
    const tier = this.route.snapshot.queryParamMap.get('autoSelect');
    if (!tier || !this.auth.getAccessToken()) {
      return;
    }

    const plan = this.plans().find(p => p.tier === tier);
    if (plan) {
      this.onSelectPlan(plan);
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
    if (this.isBlockedForAgencyOwner(plan)) {
      return;
    }

    this.selectedTier.set(plan.tier);

    const destination = () =>
      void this.router.navigate([plan.ctaRoute], { queryParams: plan.ctaQueryParams });

    if (!this.auth.getAccessToken()) {
      if (plan.ctaRoute === '/property-form') {
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
        // waiting for their next independent load.
        switchMap(() => this.profileService.refresh()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.selecting.set(null);
          this.toast.success(
            this.translate.instant(
              plan.tier === 'free'
                ? 'PRICING.MESSAGES.FREE_SELECTED_SUCCESS'
                : 'PRICING.MESSAGES.PLAN_SELECTED_SUCCESS'
            )
          );
          destination();
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

  /**
   * Public marketing page, so it sets its own meta tags — same precedent as the
   * landing page. Uses translate.get() rather than instant() because the ngx-translate
   * HTTP loader may not have resolved yet on a cold navigation.
   */
  private applyMeta(): void {
    this.translate.get(['PRICING.META_TITLE', 'PRICING.META_DESCRIPTION'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(values => {
        this.meta.setMeta({
          title: values['PRICING.META_TITLE'],
          description: values['PRICING.META_DESCRIPTION']
        });
      });
  }
}

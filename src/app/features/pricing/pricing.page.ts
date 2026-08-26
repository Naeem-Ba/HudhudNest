// Public subscription plans page (/pricing) — Free / Basic / Premium / Elite.
//
// Mirrors features/saved-searches/saved-searches.page.ts's shape (signals for view
// state, RxJS for transport, takeUntilDestroyed on every subscribe, error signal
// holding an i18n KEY rather than a message).
//
// Design note: the approved mockup ships a "Broadcast Red" palette, but this page is
// drawn with the app's own Aqar Tech tokens (--navy / --gold / Cairo) so it matches the
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
import { catchError, of, switchMap } from 'rxjs';

import { PlansApiService } from '../../core/api/plans-api.service';
import { ProfileService } from '../../core/api/profile.service';
import { AuthService } from '../../core/auth/auth.service';
import { MetaService } from '../../core/services/meta.service';
import { SubscriptionPlan } from '../../core/models/subscription-plan.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

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
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(MetaService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  /** Tier currently being selected, if any — disables that card's button so a double
   * click can't fire two POSTs while the first is still in flight. */
  readonly selecting = signal<string | null>(null);

  /** Set when listing-eligibility.guard.ts redirected here with ?reason=plan-required —
   * i.e. the visitor already confirmed their contact info but still needs to pick a
   * plan before /property-form will let them in. */
  readonly showPlanRequiredBanner = signal(false);

  ngOnInit(): void {
    this.applyMeta();
    this.load();

    this.showPlanRequiredBanner.set(
      this.route.snapshot.queryParamMap.get('reason') === 'plan-required'
    );
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
        },
        error: () => {
          this.error.set('PRICING.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  trackByTier(_: number, plan: SubscriptionPlan): string {
    return plan.tier;
  }

  /**
   * Records the choice (including "free" — a real selection, not an implicit default;
   * see UserAccount.PlanId's doc comment on the backend) before sending the visitor on
   * to ctaRoute, exactly as before (free → property-form, paid → the contact form —
   * still no payment gateway, see FRONTEND_BACKEND_CONTRACT.md §11.1).
   *
   * An anonymous visitor is sent straight to ctaRoute without calling the [Authorize]
   * selection endpoint: AuthGuard on that route redirects them to login first, exactly
   * as the plain routerLink did before this method existed. They land back on
   * ctaRoute logged in but still without a plan selected — property-form's
   * ListingEligibilityGuard then bounces them back here to pick one for real, so
   * nothing is silently skipped, just deferred one extra round trip.
   */
  onSelectPlan(plan: SubscriptionPlan): void {
    const destination = () =>
      void this.router.navigate([plan.ctaRoute], { queryParams: plan.ctaQueryParams });

    if (!this.auth.getAccessToken()) {
      destination();
      return;
    }

    this.selecting.set(plan.tier);

    this.api.selectPlan(plan.tier)
      .pipe(
        // Keep the shared profile$ (navbar, guard) in sync immediately rather than
        // waiting for their next independent load.
        switchMap(() => this.profileService.refresh()),
        // Non-fatal: even if the POST failed, don't strand the visitor on /pricing —
        // send them on and let the destination route's own gate (which reads the
        // real, authoritative state) decide.
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.selecting.set(null);
        destination();
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

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
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PlansApiService } from '../../core/api/plans-api.service';
import { MetaService } from '../../core/services/meta.service';
import { SubscriptionPlan } from '../../core/models/subscription-plan.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

@Component({
  selector: 'app-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent],
  templateUrl: './pricing.page.html',
  styleUrls: ['./pricing.page.scss']
})
export class PricingPage implements OnInit {
  private readonly api = inject(PlansApiService);
  private readonly meta = inject(MetaService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    this.applyMeta();
    this.load();
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

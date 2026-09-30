// Checkout for the two one-off listing fees (/checkout/:kind/:propertyId).
//
// WHAT THIS PAGE IS NOT: it does not take a payment. There is no payment gateway in this
// system, so there are no card fields, no gateway redirect, and no "processing payment"
// screen. A screen that looked like it took a card would collect real card numbers and
// send them nowhere.
//
// WHAT IT ACTUALLY DOES, end to end and for real: the confirm button calls the endpoint
// that records a Pending transaction in HudhudNestApi and returns its id. That id is the
// reference the owner quotes on their bank transfer, and an administrator settles it
// through the admin-only confirmation endpoint. Every step on screen corresponds to
// something that exists.
//
// First page in the app drawn with Tailwind utilities rather than the SCSS component
// classes. Colours come from the same HudhudNest CSS variables through the @theme block in
// src/tailwind.css, so dark mode and RTL work here exactly as they do everywhere else,
// with no dark: utilities and no logical-property overrides.

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ListingFeesApiService } from '../../core/api/listing-fees-api.service';
import { MetaService } from '../../core/services/meta.service';
import {
  LISTING_FEE_PREVIEWS,
  ListingFeeKind,
  ListingFeePreview,
  ListingFeeQuote,
  isListingFeeKind
} from '../../core/models/listing-fee.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

@Component({
  selector: 'app-checkout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent],
  templateUrl: './checkout.page.html'
})
export class CheckoutPage implements OnInit {
  private readonly api = inject(ListingFeesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly meta = inject(MetaService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly preview = signal<ListingFeePreview | null>(null);
  readonly propertyId = signal<string>('');
  readonly quote = signal<ListingFeeQuote | null>(null);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly referenceCopied = signal(false);

  /** The review step is over once the server has given us a reference to pay against. */
  readonly isRecorded = computed(() => this.quote() !== null);

  ngOnInit(): void {
    const kind = this.route.snapshot.paramMap.get('kind') ?? '';
    const propertyId = this.route.snapshot.paramMap.get('propertyId') ?? '';

    // A bad URL must not render an empty page that still shows a confirm button. Anything
    // unrecognised goes home rather than offering to charge for an unknown product.
    if (!isListingFeeKind(kind) || propertyId.length === 0) {
      void this.router.navigate(['/home']);
      return;
    }

    this.preview.set(LISTING_FEE_PREVIEWS[kind as ListingFeeKind]);
    this.propertyId.set(propertyId);

    this.translate
      .get(['CHECKOUT.META_TITLE', 'CHECKOUT.META_DESCRIPTION'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(values => {
        this.meta.setMeta({
          title: values['CHECKOUT.META_TITLE'],
          description: values['CHECKOUT.META_DESCRIPTION']
        });
      });
  }

  confirm(): void {
    const preview = this.preview();
    if (preview === null || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    this.api
      .request(preview.kind, this.propertyId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: quote => {
          this.quote.set(quote);
          this.submitting.set(false);
        },
        error: () => {
          // The interceptor already surfaces the server's message as a toast. The signal
          // holds an i18n KEY, never a message, matching every other page here.
          this.error.set('CHECKOUT.ERROR');
          this.submitting.set(false);
        }
      });
  }

  async copyReference(): Promise<void> {
    const reference = this.quote()?.transactionId;
    if (!reference) {
      return;
    }

    try {
      await navigator.clipboard.writeText(reference);
      this.referenceCopied.set(true);
      setTimeout(() => this.referenceCopied.set(false), 2000);
    } catch {
      // Clipboard access is denied in some in-app browsers and over plain http. The
      // reference is selectable text on screen either way, so a failure here is not worth
      // an error state — the user can still read and type it.
    }
  }
}

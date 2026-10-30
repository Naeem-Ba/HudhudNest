import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { AdsService } from './ads.service';
import { logAdsIssue } from './ads-metrics.service';
import { AdPlacement } from './ads.model';
import { pathOnly } from './ads-policy';

interface AdsByGoogleQueue extends Array<unknown> {
  requestNonPersonalizedAds?: number;
}

/**
 * One labelled ad slot. It renders nothing at all (no label, no gap) unless every layer in evaluateAdEligibility()
 * allows a request, so hosts can drop it into a page unconditionally. Pages never contain provider code.
 *
 * Web: one <ins class="adsbygoogle"> created once per allowed state (never re-created by change detection or a
 * language switch). Native: the community AdMob plugin only draws an overlay banner, so the slot reserves its
 * own space and the overlay is shown only while that placeholder is on screen.
 */
@Component({
  selector: 'app-ad-slot',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <aside class="ad-slot" [class.ad-slot--native]="native" [attr.aria-label]="'ADS.LABEL' | translate">
        <div class="ad-slot__meta">
          <span class="ad-slot__label">{{ 'ADS.LABEL' | translate }}</span>
          @if (ads.consent.canManageChoices()) {
            <button type="button" class="ad-slot__choices" (click)="ads.openAdChoices()">{{ 'ADS.CHOICES' | translate }}</button>
          }
        </div>
        <div #host class="ad-slot__body"></div>
      </aside>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .ad-slot { margin-block: 1.25rem; padding: .5rem .75rem .75rem; border: 1px solid var(--gray-200, #e5e7eb); border-radius: 12px; background: var(--card-bg, transparent); contain: layout; }
      .ad-slot__meta { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-block-end: .35rem; font-size: .72rem; color: var(--gray-500, #6b7280); }
      .ad-slot__choices { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; }
      /* Space is reserved up front so a late ad does not push the content below it. */
      .ad-slot__body { min-height: 250px; width: 100%; overflow: hidden; }
      .ad-slot--native .ad-slot__body { min-height: 64px; }
    `
  ]
})
export class AdSlotComponent {
  readonly placement = input.required<AdPlacement>();

  protected readonly ads = inject(AdsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  protected readonly native = this.ads.config.platform !== 'web';
  private readonly collapsed = signal(false);
  private readonly decision = this.ads.decision(() => this.placement(), () => pathOnly(this.router.url));

  protected readonly visible = () => this.decision().allowed && !this.collapsed();

  private requested = false;
  private observer?: MutationObserver;
  private visibility?: IntersectionObserver;

  constructor() {
    effect(() => {
      const d = this.decision();
      const host = this.host();
      untracked(() => this.sync(d.allowed, d.reason, host?.nativeElement));
    });
    this.destroyRef.onDestroy(() => this.teardown());
  }

  private sync(allowed: boolean, reason: string | undefined, host: HTMLElement | undefined): void {
    if (!allowed) {
      this.teardown();
      // Native consent only exists after the UMP flow ran; start it as soon as every other layer passed.
      if (this.native && reason === 'consent-unknown') void this.ads.ensureNativeConsent();
      return;
    }
    if (!host || this.requested) return;
    this.requested = true;
    if (this.native) this.startNative(host);
    else void this.startWeb(host);
  }

  private async startWeb(host: HTMLElement): Promise<void> {
    const cfg = this.ads.config;
    const loaded = await this.ads.ensureWebLibrary();
    // The slot may have been destroyed or have lost permission while the script loaded.
    if (!loaded || !this.requested || !host.isConnected) return;
    try {
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', cfg.publisherId);
      ins.setAttribute('data-ad-slot', cfg.adsenseSlot(this.placement()));
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      if (cfg.testMode) ins.setAttribute('data-adtest', 'on');
      host.appendChild(ins);

      this.observer = new MutationObserver(() => {
        const status = ins.getAttribute('data-ad-status');
        if (status === 'unfilled') {
          this.ads.metrics.record('unfilled');
          this.collapsed.set(true);
        } else if (status === 'filled') {
          this.ads.metrics.record('filled');
        }
      });
      this.observer.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });

      const w = window as unknown as { adsbygoogle?: AdsByGoogleQueue };
      const queue = (w.adsbygoogle ??= [] as AdsByGoogleQueue);
      // Always non-personalised: the built-in consent choice is not a Google-certified CMP.
      queue.requestNonPersonalizedAds = 1;
      queue.push({});
      this.ads.metrics.record('requested');
    } catch {
      logAdsIssue('adsense-render-failed');
      this.ads.metrics.record('load-failed');
      this.collapsed.set(true);
    }
  }

  private startNative(host: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') {
      void this.ads.showNativeBanner();
      return;
    }
    this.visibility = new IntersectionObserver(entries => {
      const onScreen = entries.some(e => e.isIntersecting);
      void (onScreen ? this.ads.showNativeBanner() : this.ads.hideNativeBanner());
    });
    this.visibility.observe(host);
  }

  private teardown(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.visibility?.disconnect();
    this.visibility = undefined;
    if (this.requested && this.native) void this.ads.hideNativeBanner();
    this.requested = false;
    const host = this.host()?.nativeElement;
    if (host) host.replaceChildren();
  }
}

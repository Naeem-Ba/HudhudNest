import { PageMetaService } from '../../core/services/page-meta.service';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { ServiceCategory } from '../../core/models/service.model';

export type ExpatGoal = 'own' | 'find' | 'invest';

interface Step { key: string; link: string; queryParams?: Record<string, string>; }

/** What each goal leads to: existing pages only, in the order a person abroad needs them. */
export const EXPAT_STEPS: Record<ExpatGoal, Step[]> = {
  own: [
    { key: 'OWN_LIST', link: '/property-form' },
    { key: 'OWN_PRICE', link: '/price-estimate' },
    { key: 'OWN_SERVICES', link: '/services' }
  ],
  find: [
    { key: 'FIND_REQUEST', link: '/search-requests' },
    { key: 'FIND_MAP', link: '/map' },
    { key: 'FIND_ALERTS', link: '/saved-searches' },
    { key: 'FIND_PRICE', link: '/price-estimate' }
  ],
  invest: [
    { key: 'INVEST_PROJECTS', link: '/investments' },
    { key: 'INVEST_PRICE', link: '/price-estimate' }
  ]
};

/** Service categories that help each goal. Only those with at least one bookable offering are shown. */
export const EXPAT_SERVICES: Record<ExpatGoal, ServiceCategory[]> = {
  own: ['PropertyManagement', 'Verification', 'Inspection', 'Valuation', 'Photography', 'Legal', 'Maintenance', 'Cleaning'],
  find: ['Verification', 'Inspection', 'Legal', 'Moving', 'Financing'],
  invest: ['Valuation', 'Legal', 'Investment', 'Engineering', 'Financing']
};

/**
 * Growth engine P11: a short guided start for Syrians abroad. It only routes to features that exist, and it
 * offers a service category only when an approved provider really offers it (live availability counts), so the
 * page never promises a service nobody delivers.
 */
@Component({
  selector: 'app-expat-journey',
  standalone: true,
  imports: [RouterModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="xp-page">
      <header>
        <h1>{{ 'EXPATS.TITLE' | translate }}</h1>
        <p class="xp-lead">{{ 'EXPATS.LEAD' | translate }}</p>
      </header>

      <fieldset class="xp-goals">
        <legend>{{ 'EXPATS.QUESTION' | translate }}</legend>
        @for (g of goals; track g) {
          <button type="button" class="xp-goal" [class.xp-goal--active]="goal() === g" [attr.aria-pressed]="goal() === g"
                  (click)="goal.set(g)" [attr.data-testid]="'xp-goal-' + g">
            {{ ('EXPATS.GOAL.' + g) | translate }}
          </button>
        }
      </fieldset>

      @if (goal(); as g) {
        <section class="xp-card" data-testid="xp-steps">
          <h2>{{ 'EXPATS.STEPS_TITLE' | translate }}</h2>
          <ol class="xp-steps">
            @for (s of steps(); track s.key) {
              <li><a [routerLink]="s.link">{{ ('EXPATS.STEP.' + s.key) | translate }}</a></li>
            }
          </ol>
        </section>

        <section class="xp-card" data-testid="xp-services">
          <h2>{{ 'EXPATS.SERVICES_TITLE' | translate }}</h2>
          @if (servicesLoading()) {
            <p role="status">{{ 'COMMON.LOADING' | translate }}</p>
          } @else if (services().length) {
            <ul class="xp-services">
              @for (c of services(); track c) {
                <li><a [routerLink]="['/services']" [queryParams]="{ category: c }">{{ ('SERVICES.CATEGORY.' + c) | translate }}</a></li>
              }
            </ul>
            <p class="xp-hint">{{ 'EXPATS.SERVICES_HINT' | translate }}</p>
          } @else {
            <p data-testid="xp-no-services">{{ 'EXPATS.NO_SERVICES' | translate }}</p>
          }
        </section>
      }

      <p class="xp-hint">{{ 'EXPATS.FOOTNOTE' | translate }}</p>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .xp-page { max-width: 860px; margin-inline: auto; padding: 1.5rem 16px 3rem; display: grid; gap: 1rem; }
    h1 { margin: 0 0 .5rem; font-size: clamp(1.4rem, 3.5vw, 2rem); }
    h2 { margin: 0 0 .5rem; font-size: 1.15rem; }
    .xp-lead, .xp-hint { margin: 0; color: var(--text-muted, #5b6470); }
    .xp-hint { font-size: .9rem; }
    .xp-goals { border: 0; padding: 0; margin: 0; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
    .xp-goals legend { font-weight: 600; margin-bottom: .5rem; }
    .xp-goal { min-height: 56px; padding: .75rem 1rem; border-radius: 12px; border: 1px solid var(--border, #d1d5db); background: var(--surface, #fff); color: inherit; font: inherit; text-align: start; cursor: pointer; }
    .xp-goal--active { border-color: var(--primary, #1d4ed8); box-shadow: 0 0 0 2px var(--primary, #1d4ed8) inset; }
    .xp-card { border: 1px solid var(--border, #e5e7eb); border-radius: 12px; padding: 1rem; background: var(--surface, #fff); }
    .xp-steps { margin: 0; padding-inline-start: 1.25rem; display: grid; gap: .5rem; }
    .xp-steps a, .xp-services a { display: inline-flex; align-items: center; min-height: 44px; }
    .xp-services { list-style: none; margin: 0 0 .5rem; padding: 0; display: flex; flex-wrap: wrap; gap: .25rem 1rem; }
  `]
})
export class ExpatJourneyPage implements OnInit {
  private readonly offerings = inject(ServiceOfferingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

  readonly goals: ExpatGoal[] = ['own', 'find', 'invest'];
  readonly goal = signal<ExpatGoal | null>(null);
  readonly available = signal<ReadonlySet<ServiceCategory>>(new Set());
  readonly servicesLoading = signal(true);

  readonly steps = computed(() => { const g = this.goal(); return g ? EXPAT_STEPS[g] : []; });
  readonly services = computed(() => {
    const g = this.goal();
    return g ? EXPAT_SERVICES[g].filter(c => this.available().has(c)) : [];
  });

  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.EXPATS', '/expats', this.destroyRef);
    this.offerings.getAvailability().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => {
        this.available.set(new Set(items.filter(i => i.offeringCount > 0).map(i => i.category)));
        this.servicesLoading.set(false);
      },
      // Unknown availability: offer no service rather than one that may not exist.
      error: () => { this.available.set(new Set()); this.servicesLoading.set(false); }
    });
  }
}

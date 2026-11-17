import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { HudhudAiApiService } from '../../core/api/hudhud-ai-api.service';
import { AiStatus } from '../../core/models/hudhud-ai.model';
import { HudhudAiPanelComponent } from './hudhud-ai-panel.component';

/** Pages where a floating assistant button would cover the work at hand. */
const HIDDEN_ON = [/^\/admin(\/|$)/, /^\/(auth|login)(\/|$)/, /^\/property-form(\/|$)/, /^\/properties\/edit\//, /^\/checkout(\/|$)/];

export function launcherHiddenOn(url: string): boolean {
  const path = url.split(/[?#]/)[0] ?? '';
  return HIDDEN_ON.some(pattern => pattern.test(path));
}

/**
 * The floating "Hudhud AI" button. It asks the API once whether the assistant is switched on and renders nothing
 * otherwise (the feature ships switched off). The chat panel is a separate chunk, loaded on the first open.
 */
@Component({
  selector: 'app-hudhud-ai-launcher',
  standalone: true,
  imports: [TranslateModule, HudhudAiPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status(); as s) {
      @if (s.enabled && (!hidden() || open())) {
        @if (!open()) {
          <button type="button" class="ai-fab" (click)="open.set(true)" [attr.aria-label]="'AI.OPEN' | translate"
                  data-testid="ai-fab">
            <span class="ai-fab__icon" aria-hidden="true">✦</span>
            <span class="ai-fab__label">{{ 'AI.NAME' | translate }}</span>
          </button>
        }
        @defer (when open()) {
          @if (open()) {
            <app-hudhud-ai-panel [status]="s" (closed)="open.set(false)"></app-hudhud-ai-panel>
          }
        }
      }
    }
  `,
  styles: [`
    :host { display: contents; }
    .ai-fab {
      position: fixed;
      inset-inline-end: max(1rem, env(safe-area-inset-right));
      inset-block-end: calc(1rem + env(safe-area-inset-bottom, 0px));
      z-index: var(--z-overlay, 300);
      display: inline-flex; align-items: center; gap: .45rem;
      min-height: 48px; padding: .6rem 1rem;
      border: 0; border-radius: var(--r-pill, 9999px);
      background: var(--navy); color: #fff;
      font: inherit; font-weight: 700; cursor: pointer;
      box-shadow: var(--shadow-lg);
    }
    .ai-fab:hover { background: var(--navy-600); }
    .ai-fab:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
    .ai-fab__icon { color: var(--gold); font-size: 1.1rem; line-height: 1; }
    @media (max-width: 480px) { .ai-fab__label { display: none; } .ai-fab { width: 52px; justify-content: center; padding: 0; } }
    @media print { .ai-fab { display: none; } }
  `]
})
export class HudhudAiLauncherComponent {
  private readonly api = inject(HudhudAiApiService);
  private readonly router = inject(Router);

  readonly status = signal<AiStatus | null>(null);
  readonly open = signal(false);
  readonly hidden = signal(launcherHiddenOn(this.router.url));

  constructor() {
    const destroyRef = inject(DestroyRef);
    // A failed status call simply leaves the button hidden: the assistant is optional.
    this.api.status().pipe(takeUntilDestroyed(destroyRef)).subscribe({ next: s => this.status.set(s), error: () => this.status.set(null) });
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(destroyRef))
      .subscribe(e => this.hidden.set(launcherHiddenOn(e.urlAfterRedirects)));
  }
}

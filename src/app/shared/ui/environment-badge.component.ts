import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { BackendApiService } from '../../core/api/backend-api.service';

/** GET /api/operational/version (Admin only) — never contains secrets or connection details. */
interface ApiVersionInfo {
  environment: string;
  version: string;
  commitSha: string;
}

/** Maps the backend's ASPNETCORE_ENVIRONMENT to this app's environmentName; null = unknown. */
export function normalizeApiEnvironment(name: string | null | undefined): string | null {
  switch ((name ?? '').toLowerCase()) {
    case 'production':
      return 'production';
    case 'staging':
      return 'staging';
    case 'development':
      return 'local';
    default:
      return null;
  }
}

/**
 * Makes "which environment am I on?" visible without opening DevTools.
 *
 *  - Staging / local builds: a small pill for EVERYONE ("STAGING" / "LOCAL"), so a tester can never
 *    mistake the test site for the real one.
 *  - Production: nothing for ordinary users (no clutter).
 *  - Admins, in every environment: the pill also shows the API's own environment, version and
 *    commit (from /api/operational/version), and turns red if the app bundle and the API disagree
 *    — e.g. a Staging bundle pointed at the Production API, the exact mix-up this exists to catch.
 */
@Component({
  selector: 'app-environment-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="env-badge" [class]="'env-badge env-' + tone()" role="status" dir="ltr" data-testid="environment-badge">
        <strong>{{ icon() }} {{ label() }}</strong>
        @if (info(); as api) {
          <span class="env-detail">
            API: {{ api.environment }} · v{{ api.version }} · {{ shortSha(api.commitSha) }}
          </span>
        }
        @if (mismatch()) {
          <span class="env-detail">⚠ App and API environments differ</span>
        }
      </div>
    }
  `,
  styles: [
    `
      .env-badge {
        position: fixed;
        inset-block-end: 8px;
        inset-inline-start: 8px;
        z-index: 2147483000;
        display: flex;
        flex-wrap: wrap;
        gap: 2px 8px;
        max-width: calc(100vw - 16px);
        padding: 4px 10px;
        border-radius: 999px;
        font: 600 11px/1.4 system-ui, sans-serif;
        letter-spacing: 0.04em;
        color: #fff;
        opacity: 0.92;
        pointer-events: none;
      }
      .env-staging { background: #c2410c; }
      .env-production { background: #15803d; }
      .env-local { background: #475569; }
      .env-mismatch { background: #b91c1c; }
      .env-detail { font-weight: 500; letter-spacing: 0; }
    `
  ]
})
export class EnvironmentBadgeComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(BackendApiService);

  private readonly appEnv = environment.environmentName;
  private readonly isAdmin = toSignal(this.auth.isAdmin$, { initialValue: false });

  protected readonly info = signal<ApiVersionInfo | null>(null);
  private requested = false;

  protected readonly mismatch = computed(() => {
    const apiEnv = normalizeApiEnvironment(this.info()?.environment);
    return apiEnv !== null && apiEnv !== this.appEnv;
  });

  protected readonly visible = computed(() => this.appEnv !== 'production' || this.isAdmin());
  protected readonly tone = computed(() => (this.mismatch() ? 'mismatch' : this.appEnv));
  protected readonly icon = computed(() =>
    this.appEnv === 'production' ? '🟢' : this.appEnv === 'staging' ? '🟠' : '⚪'
  );
  protected readonly label = computed(() => this.appEnv.toUpperCase());

  constructor() {
    effect(() => {
      if (this.isAdmin() && !this.requested) {
        this.requested = true;
        this.api
          .get<ApiVersionInfo>('operational/version')
          .pipe(catchError(() => of(null)))
          .subscribe(value => this.info.set(value));
      }
    });
  }

  protected shortSha(sha: string): string {
    return sha && sha !== 'unknown' ? sha.slice(0, 7) : 'unknown';
  }
}

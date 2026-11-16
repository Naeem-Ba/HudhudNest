import { Injectable, InjectionToken, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';

import { environment } from '../../../environments/environment';
import { readClientErrorReportingEnabled } from '../../../environments/environment.model';
import {
  ClientErrorReport,
  ClientPlatform,
  MAX_REPORTS_PER_PAGE,
  MAX_REPORTS_PER_REQUEST,
  describeError,
  fingerprint,
  kindOf,
  routeOf
} from './client-error-report';

const FLUSH_DELAY_MS = 2_000;

/** On in every build except local development and CLIENT_ERROR_REPORTING_DISABLED=true. Tests provide their own. */
export const CLIENT_ERROR_REPORTING_ENABLED = new InjectionToken<boolean>('CLIENT_ERROR_REPORTING_ENABLED', {
  providedIn: 'root',
  factory: () => readClientErrorReportingEnabled() && environment.environmentName !== 'local'
});

/**
 * Sends unhandled errors to our own API in small batches (QA phase 21, D07). No third party, no cookie, no
 * identifier. It can never make things worse: it ignores its own failures, never reports an error caused by
 * reporting, repeats nothing, and stops after MAX_REPORTS_PER_PAGE per page life.
 */
@Injectable({ providedIn: 'root' })
export class ClientErrorReporterService {
  private readonly router = inject(Router, { optional: true });
  private readonly enabled = inject(CLIENT_ERROR_REPORTING_ENABLED);
  private readonly seen = new Set<string>();
  private queue: ClientErrorReport[] = [];
  private sentOrQueued = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private appVersion: string | null = null;

  /** Called by the global ErrorHandler and by the window listeners. Never throws. */
  report(error: unknown, options: { fromPromise?: boolean } = {}): void {
    try {
      if (!this.enabled || this.sentOrQueued >= MAX_REPORTS_PER_PAGE) {
        return;
      }

      const described = describeError(error);
      const report: ClientErrorReport = {
        kind: kindOf(error, options.fromPromise === true),
        platform: this.platform(),
        appVersion: this.appVersion ?? this.defaultVersion(),
        route: routeOf(this.router?.url ?? (typeof location !== 'undefined' ? location.pathname : '/')),
        ...described
      };

      const key = fingerprint(report);
      if (this.seen.has(key)) {
        return;
      }
      this.seen.add(key);
      this.sentOrQueued += 1;
      this.queue.push(report);
      this.scheduleFlush();
    } catch {
      // Reporting must never raise an error of its own.
    }
  }

  /** Native builds carry a real version; the web build has none, so it reports its environment. */
  setAppVersion(version: string): void {
    this.appVersion = version;
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.queue.length > 0) {
      this.send(this.queue.splice(0, MAX_REPORTS_PER_REQUEST));
    }
  }

  private scheduleFlush(): void {
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
    }
  }

  private send(errors: ClientErrorReport[]): void {
    if (typeof fetch === 'undefined') {
      return;
    }
    // fetch, not HttpClient: no interceptor may add credentials or turn a failed report into another error.
    fetch(`${environment.apiBaseUrl}/client-telemetry/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors }),
      credentials: 'omit',
      keepalive: true
    }).catch(() => undefined);
  }

  private platform(): ClientPlatform {
    if (!Capacitor.isNativePlatform()) {
      return 'web';
    }
    return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  }

  private defaultVersion(): string {
    return `web-${environment.environmentName}`;
  }
}

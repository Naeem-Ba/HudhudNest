import { ErrorHandler, Injectable, inject } from '@angular/core';

import { ClientErrorReporterService } from './client-error-reporter.service';

/**
 * Angular's default behaviour (log to the console) plus a report to our own API. Registered in app.config.ts.
 * Angular routes errors thrown in components, event handlers, and unhandled promise rejections inside its zone here.
 */
@Injectable()
export class ClientErrorHandler implements ErrorHandler {
  private readonly reporter = inject(ClientErrorReporterService);

  handleError(error: unknown): void {
    console.error(error);
    this.reporter.report(error);
  }
}

/** Errors that happen outside Angular's zone (a third-party script, an event listener we did not register). */
export function installWindowErrorListeners(reporter: ClientErrorReporterService, target: Window = window): void {
  target.addEventListener('error', event => {
    // Failed <img>/<script> loads fire 'error' without a message or error object; they are not app errors.
    if (event.error === undefined && !event.message) {
      return;
    }
    reporter.report(event.error ?? event.message);
  });
  target.addEventListener('unhandledrejection', event => {
    reporter.report(event.reason, { fromPromise: true });
  });
  // The tab may close right after a crash; deliver what is queued.
  target.addEventListener('pagehide', () => reporter.flush());
}

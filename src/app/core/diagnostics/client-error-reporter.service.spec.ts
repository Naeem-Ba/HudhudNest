import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { MAX_REPORTS_PER_PAGE, MAX_REPORTS_PER_REQUEST } from './client-error-report';
import { ClientErrorHandler, installWindowErrorListeners } from './client-error-handler';
import { CLIENT_ERROR_REPORTING_ENABLED, ClientErrorReporterService } from './client-error-reporter.service';

describe('ClientErrorReporterService', () => {
  let fetchSpy: jasmine.Spy;

  function setup(enabled: boolean): ClientErrorReporterService {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 204 })));
    TestBed.configureTestingModule({
      providers: [
        { provide: CLIENT_ERROR_REPORTING_ENABLED, useValue: enabled },
        { provide: Router, useValue: { url: '/properties/12?token=SECRET' } }
      ]
    });
    return TestBed.inject(ClientErrorReporterService);
  }

  function sentErrors(call = 0): Array<Record<string, unknown>> {
    return JSON.parse(fetchSpy.calls.argsFor(call)[1].body as string).errors;
  }

  it('sends nothing when reporting is off', () => {
    const service = setup(false);
    service.report(new Error('boom'));
    service.flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends one batch with the route stripped of its query and no credentials', () => {
    const service = setup(true);
    service.report(new TypeError('boom'));
    service.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.calls.argsFor(0);
    expect(String(url)).toContain('/client-telemetry/errors');
    expect((init as RequestInit).credentials).toBe('omit');
    const [report] = sentErrors();
    expect(report['route']).toBe('/properties/12');
    expect(report['kind']).toBe('js');
    expect(report['platform']).toBe('web');
    expect(JSON.stringify(report)).not.toContain('SECRET');
  });

  it('reports the same error once and counts a rejected promise as a promise error', () => {
    const service = setup(true);
    service.report(new Error('boom 1'));
    service.report(new Error('boom 2'));
    service.report(new Error('other'), { fromPromise: true });
    service.flush();

    const errors = sentErrors();
    expect(errors.length).toBe(2);
    expect(errors[1]['kind']).toBe('promise');
  });

  it('stops after the per-page limit and splits batches', () => {
    const service = setup(true);
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i += 1) {
      service.report(new Error(`distinct-${String.fromCharCode(97 + i)}`));
    }
    service.flush();

    const total = fetchSpy.calls.allArgs().reduce((sum, _args, index) => sum + sentErrors(index).length, 0);
    expect(total).toBe(MAX_REPORTS_PER_PAGE);
    expect(sentErrors(0).length).toBeLessThanOrEqual(MAX_REPORTS_PER_REQUEST);
  });

  it('uses the native version when the app sets one', () => {
    const service = setup(true);
    service.setAppVersion('1.4.2');
    service.report(new Error('boom'));
    service.flush();
    expect(sentErrors()[0]['appVersion']).toBe('1.4.2');
  });

  it('never throws, even when fetch itself fails', async () => {
    const service = setup(true);
    fetchSpy.and.returnValue(Promise.reject(new Error('offline')));
    expect(() => {
      service.report(new Error('boom'));
      service.flush();
    }).not.toThrow();
    await Promise.resolve();
  });

  it('ClientErrorHandler logs and reports', () => {
    const service = setup(true);
    const consoleSpy = spyOn(console, 'error');
    const reportSpy = spyOn(service, 'report');
    TestBed.runInInjectionContext(() => new ClientErrorHandler().handleError(new Error('boom')));
    expect(consoleSpy).toHaveBeenCalled();
    expect(reportSpy).toHaveBeenCalled();
  });

  it('window listeners report errors and rejections but ignore resource load failures', () => {
    const service = setup(true);
    const reportSpy = spyOn(service, 'report');
    const flushSpy = spyOn(service, 'flush');
    const target = document.createElement('div') as unknown as Window;
    installWindowErrorListeners(service, target);

    target.dispatchEvent(Object.assign(new Event('error'), { error: undefined, message: '' }));
    expect(reportSpy).not.toHaveBeenCalled();

    const boom = new Error('boom');
    target.dispatchEvent(Object.assign(new Event('error'), { error: boom, message: 'boom' }));
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'nope' }));
    target.dispatchEvent(new Event('pagehide'));

    expect(reportSpy).toHaveBeenCalledWith(boom);
    expect(reportSpy).toHaveBeenCalledWith('nope', { fromPromise: true });
    expect(flushSpy).toHaveBeenCalled();
  });
});

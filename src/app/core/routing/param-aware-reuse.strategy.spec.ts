import { ActivatedRouteSnapshot, Route } from '@angular/router';

import { ParamAwareReuseStrategy } from './param-aware-reuse.strategy';

function snapshot(routeConfig: Route | null, params: Record<string, string>, data: Record<string, unknown> = {}): ActivatedRouteSnapshot {
  return { routeConfig, params, data } as unknown as ActivatedRouteSnapshot;
}

describe('ParamAwareReuseStrategy', () => {
  const strategy = new ParamAwareReuseStrategy();
  const optedIn: Route = { path: 'short-stay/:id', data: { reloadOnParamChange: true } };
  const plain: Route = { path: 'properties/:id' };

  it('creates a fresh page for another id on a route that opts in', () => {
    expect(strategy.shouldReuseRoute(
      snapshot(optedIn, { id: 'b' }, { reloadOnParamChange: true }),
      snapshot(optedIn, { id: 'a' }, { reloadOnParamChange: true })
    )).toBeFalse();
  });

  it('keeps the page for the same id (query or fragment changes only)', () => {
    expect(strategy.shouldReuseRoute(
      snapshot(optedIn, { id: 'a' }, { reloadOnParamChange: true }),
      snapshot(optedIn, { id: 'a' }, { reloadOnParamChange: true })
    )).toBeTrue();
  });

  it('keeps Angular\'s default on routes that do not opt in', () => {
    expect(strategy.shouldReuseRoute(snapshot(plain, { id: 'b' }), snapshot(plain, { id: 'a' }))).toBeTrue();
  });

  it('never reuses across different routes', () => {
    expect(strategy.shouldReuseRoute(snapshot(plain, { id: 'a' }), snapshot(optedIn, { id: 'a' }))).toBeFalse();
  });
});

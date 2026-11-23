import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/** Route data flag: give this page a fresh component when its route parameters change. */
export const RELOAD_ON_PARAM_CHANGE = 'reloadOnParamChange';

/**
 * Angular keeps the same component instance when only a route parameter changes (/short-stay/A -> /short-stay/B).
 * Pages that read their id once from the snapshot then keep showing the first item. That happens with a shared link
 * opened while the app already shows another item of the same kind (share-links audit L-05).
 *
 * Pages that follow paramMap themselves (property detail, office page) do not need this. A route opts in with
 * `data: { reloadOnParamChange: true }` and is then created anew for a different id, which also resets its form
 * state, dates and in-flight requests. Every other route keeps Angular's default behaviour.
 */
@Injectable()
export class ParamAwareReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig !== current.routeConfig) {
      return false;
    }
    if (future.data?.[RELOAD_ON_PARAM_CHANGE] === true) {
      return sameParams(future.params, current.params);
    }
    return true;
  }
}

function sameParams(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

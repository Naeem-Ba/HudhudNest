import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ProfileService, isEligibleForListing } from '../api/profile.service';

/**
 * Route-level version of the same gate the navbar's canAddProperty$ applies to the
 * "Add property" link — and of what CreatePropertyCommandHandler enforces server-side,
 * which stays the actual source of truth (see property-form.page.ts's save() error
 * handling for the defense-in-depth 403 case this guard is meant to make rare).
 *
 * Applied only to the CREATE route ('property-form' in app.routes.ts) — not to
 * 'properties/edit/:id', which shares the same component but edits an already-owned
 * listing and is out of scope for this rule.
 *
 * Listed after AuthGuard in that route's canActivate array, so an anonymous visitor is
 * already redirected to login before this ever runs. Still fetches the profile fresh
 * (not the cached profile$) rather than trusting it to already be populated — a guard
 * that let someone through on a stale/never-loaded cache would be worse than one extra
 * request.
 */
export const ListingEligibilityGuard: CanActivateFn = () => {
  const profileService = inject(ProfileService);
  const router = inject(Router);

  return profileService.getMe().pipe(
    map(profile => {
      if (isEligibleForListing(profile)) {
        return true;
      }

      const contactConfirmed = !!(profile.EmailConfirmed || profile.PhoneConfirmed);

      // Whichever gate is still open decides where to send them: confirm contact info
      // first if that's what's missing, otherwise go straight to picking a plan.
      return contactConfirmed
        ? router.createUrlTree(['/pricing'], { queryParams: { reason: 'plan-required' } })
        : router.createUrlTree(['/profile'], { queryParams: { reason: 'confirm-required' } });
    }),
    // A failed profile fetch is treated the same as "not eligible" rather than letting
    // the create page through on missing information.
    catchError(() => of(router.createUrlTree(['/profile'])))
  );
};

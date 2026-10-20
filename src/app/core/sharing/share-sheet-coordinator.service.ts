// =============================================================
// src/app/core/sharing/share-sheet-coordinator.service.ts
//
// Ensures at most one share sheet is open at a time across the whole app — needed because
// PropertyShareButtonComponent is meant to be reusable (property-detail today, potentially a
// property card in a list tomorrow), and nothing else would stop two instances from both
// opening if a user could somehow trigger both.
// =============================================================

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShareSheetCoordinatorService {
  private readonly openOwner = signal<symbol | null>(null);

  /** Returns true and claims ownership if no sheet is currently open (or this same owner
   *  already holds it); returns false without side effects otherwise. */
  tryOpen(owner: symbol): boolean {
    const current = this.openOwner();
    if (current !== null && current !== owner) {
      return false;
    }

    this.openOwner.set(owner);
    return true;
  }

  /** No-op if a different owner holds it — a component can never accidentally close someone
   *  else's sheet. */
  release(owner: symbol): void {
    if (this.openOwner() === owner) {
      this.openOwner.set(null);
    }
  }

  isOpenElsewhere(owner: symbol): boolean {
    const current = this.openOwner();
    return current !== null && current !== owner;
  }
}

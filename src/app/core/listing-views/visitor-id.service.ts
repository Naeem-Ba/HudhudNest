// =============================================================
// src/app/core/listing-views/visitor-id.service.ts
//
// An opaque random id that stands for "this browser/app install" when nobody is signed in, so the
// server can tell the same visitor opening a listing again (not counted twice) from a different one.
// It is a random UUID with no relation to the person, the device hardware or the network, it is
// never sent anywhere except as the X-Visitor-Id header of the view-count call, and the server only
// ever keeps a keyed hash of it. Not a fingerprint and not for advertising.
//
// Storage can be unavailable (private window, blocked site data): the id then lives for the page
// session only, which at worst makes the server count that visitor once more.
// =============================================================

import { Injectable } from '@angular/core';

const STORAGE_KEY = 'hn.visitorId';

@Injectable({ providedIn: 'root' })
export class VisitorIdService {
  private inMemory: string | null = null;

  /** The visitor id: read from storage, created on first use, never empty. */
  get(): string {
    if (this.inMemory) {
      return this.inMemory;
    }

    let id: string | null = null;
    try {
      id = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      id = null;
    }

    if (!id || !VisitorIdService.isValid(id)) {
      id = VisitorIdService.generate();
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, id);
      } catch {
        /* storage unavailable: keep it for this session only */
      }
    }

    this.inMemory = id;
    return id;
  }

  /** The server accepts 16-64 characters of [A-Za-z0-9-]; anything else would be ignored there. */
  static isValid(id: string): boolean {
    return /^[A-Za-z0-9-]{16,64}$/.test(id);
  }

  private static generate(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) {
      return cryptoApi.randomUUID();
    }

    const bytes = new Uint8Array(16);
    if (cryptoApi?.getRandomValues) {
      cryptoApi.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
}

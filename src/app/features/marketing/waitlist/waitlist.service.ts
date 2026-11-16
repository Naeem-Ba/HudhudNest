import { Injectable, InjectionToken, inject, signal } from '@angular/core';

import { environment } from '../../../../environments/environment';
import { WaitlistContactType, WaitlistInterest } from './waitlist.validation';

export interface WaitlistConfig {
  url: string;
  anonKey: string;
  /** Local development only: with no Supabase settings, pretend to save so the form can be worked on. */
  mockWhenUnconfigured: boolean;
}

export const WAITLIST_CONFIG = new InjectionToken<WaitlistConfig>('WAITLIST_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    url: environment.supabase.url,
    anonKey: environment.supabase.anonKey,
    mockWhenUnconfigured: environment.environmentName === 'local'
  })
});

export interface WaitlistSignup {
  contact: string;
  contactType: WaitlistContactType;
  interest: WaitlistInterest | null;
  language: 'de' | 'ar' | 'en' | 'tr';
}

/** ok: stored (a repeat signup counts as ok); unavailable: not configured in this build; error: try again. */
export type WaitlistResult = 'ok' | 'unavailable' | 'error';

/** Postgres unique_violation: the contact is already on the list. */
const DUPLICATE_CODE = '23505';

/**
 * Stores a waitlist signup in Supabase with the PUBLIC anon key; the table accepts INSERT only (see
 * supabase/migrations). The SDK is loaded on the first signup, so visitors who never open the form never download it.
 * Nothing about the signup is logged: not the contact, not the error body.
 */
@Injectable({ providedIn: 'root' })
export class WaitlistService {
  private readonly config = inject(WAITLIST_CONFIG);
  private client: Promise<{ from: (table: string) => { insert: (row: object) => PromiseLike<{ error: { code?: string } | null }> } }> | null = null;

  /** Where the waitlist dialog is requested from (every call to action). */
  readonly dialog = signal<{ open: boolean; interest: WaitlistInterest | null }>({ open: false, interest: null });

  /** True once any call to action asked for the dialog; the shell then loads its (deferred) code and keeps it. */
  readonly requested = signal(false);

  open(interest: WaitlistInterest | null = null): void {
    this.requested.set(true);
    this.dialog.set({ open: true, interest });
  }

  close(): void {
    this.dialog.update(value => ({ ...value, open: false }));
  }

  get isConfigured(): boolean {
    return this.config.url.length > 0 && this.config.anonKey.length > 0;
  }

  async submit(signup: WaitlistSignup, consentAt: Date = new Date()): Promise<WaitlistResult> {
    if (!this.isConfigured) {
      if (this.config.mockWhenUnconfigured) {
        await new Promise(resolve => setTimeout(resolve, 400));
        return 'ok';
      }
      return 'unavailable';
    }
    try {
      const client = await this.getClient();
      const { error } = await client.from('waitlist_signups').insert({
        contact: signup.contact,
        contact_type: signup.contactType,
        interest: signup.interest,
        language: signup.language,
        consent_at: consentAt.toISOString()
      });
      if (!error || error.code === DUPLICATE_CODE) {
        return 'ok';
      }
      return 'error';
    } catch {
      this.client = null; // a failed SDK download may succeed on the next try
      return 'error';
    }
  }

  private getClient() {
    this.client ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(this.config.url, this.config.anonKey, {
        // No session, no token refresh, no storage: this client only ever inserts one anonymous row.
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    ) as never;
    return this.client!;
  }
}

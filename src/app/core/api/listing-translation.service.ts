import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export type TranslationListingKind = 'property' | 'short-stay';

export type TranslationLanguage = 'ar' | 'de' | 'en' | 'tr';

export type TranslationFieldState = 'ready' | 'pending' | 'same_language' | 'unavailable' | 'empty';

/** Mirrors HudhudNestApi.Application.Listings.Translations.ListingTranslationFieldDto (camelCase). */
export interface ListingTranslationField {
  state: TranslationFieldState;
  sourceLanguage?: string | null;
  text?: string | null;
  reason?: string | null;
}

/** Mirrors ListingTranslationDto. Only "ready" fields carry text; everything else means "show the original". */
export interface ListingTranslation {
  targetLanguage: TranslationLanguage;
  status: 'ready' | 'pending' | 'same_language' | 'unavailable';
  reason?: string | null;
  title: ListingTranslationField;
  description: ListingTranslationField;
  /** Sale/rent only; absent or "empty" when there is no public street. */
  street?: ListingTranslationField;
  retryAfterSeconds?: number | null;
}

/**
 * Asks the API for a listing's title/description in a language. The API stores the result permanently, so
 * only the first visitor of a listing/language pair can cause a translation to be made; the API alone
 * talks to the translation vendor (no key or vendor call ever exists in the app).
 */
@Injectable({ providedIn: 'root' })
export class ListingTranslationService {
  constructor(private readonly api: BackendApiService) {}

  ensure(listingId: string, language: TranslationLanguage, kind: TranslationListingKind = 'property'): Observable<ListingTranslation> {
    const base = kind === 'short-stay' ? '/short-stay/listings' : '/properties';
    return this.api.post<ListingTranslation>(
      `${base}/${encodeURIComponent(listingId)}/translation?lang=${language}`
    );
  }
}

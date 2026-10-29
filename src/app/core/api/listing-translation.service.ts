import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export type TranslationLanguage = 'ar' | 'de' | 'en';

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

  ensure(propertyId: string, language: TranslationLanguage): Observable<ListingTranslation> {
    return this.api.post<ListingTranslation>(
      `/properties/${encodeURIComponent(propertyId)}/translation?lang=${language}`
    );
  }
}

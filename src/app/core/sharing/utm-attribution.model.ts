// =============================================================
// src/app/core/sharing/utm-attribution.model.ts
//
// UTM / Attribution (Phase 2) — types shared by UtmAttributionService and
// AttributionContextService. Kept separate from share.model.ts (Phase 1's sharing contracts)
// since these describe a different concern: not "how do we share", but "where did this visitor
// come from".
// =============================================================

import { Property } from '../models/property.model';

/** The four UTM dimensions this feature tracks (section 4 of the feature spec). Every field is
 *  a short, stable, analytics-safe token — never free text, never personal data. */
export interface AttributionContext {
  readonly source: string;
  readonly medium: string;
  readonly campaign: string;
  readonly content: string;
}

/** Input to UtmAttributionService.buildAttributedPropertyUrl. Only `property` and `source` are
 *  required — `medium`/`campaign`/`content` default from the central per-platform mapping (see
 *  utm-platform-mapping.ts) when omitted, and an invalid override is dropped in favor of that
 *  default rather than propagated (same "never trust an unvalidated value" rule the backend
 *  applies to PropertyShareEvent). */
export interface AttributionUrlOptions {
  readonly property: Property;
  readonly source: string;
  readonly medium?: string;
  readonly campaign?: string;
  readonly content?: string;
}

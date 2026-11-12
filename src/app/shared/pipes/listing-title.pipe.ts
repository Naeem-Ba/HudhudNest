import { Pipe, PipeTransform, inject } from '@angular/core';

import { ListingTitleTranslationService } from '../../core/api/listing-title-translation.service';
import { TranslationListingKind } from '../../core/api/listing-translation.service';

/**
 * A listing's title in the visitor's language: the stored translation at once when there is one, otherwise the
 * original while the translation is fetched (one batched request per page). Impure on purpose: the answer
 * arrives after the first render and the visitor can flip between translated and original.
 */
@Pipe({ name: 'listingTitle', standalone: true, pure: false })
export class ListingTitlePipe implements PipeTransform {
  private readonly titles = inject(ListingTitleTranslationService);

  transform(title: string | null | undefined, kind: TranslationListingKind, id: string | null | undefined): string {
    return this.titles.display(kind, id, title);
  }
}

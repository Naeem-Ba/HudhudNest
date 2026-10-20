import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { amenityLabel } from '../core/i18n/amenity-label';

/** `{{ amenity | amenityLabel }}`: the amenity's name in the app language (see amenityLabel). Impure so
 *  it follows a language switch like the translate pipe does. */
@Pipe({ name: 'amenityLabel', standalone: true, pure: false })
export class AmenityLabelPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(amenity: { name: string; iconName?: string | null; icon?: string | null } | null | undefined): string {
    return amenity ? amenityLabel(this.translate, amenity) : '';
  }
}

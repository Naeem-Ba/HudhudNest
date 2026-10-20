import { TranslateService } from '@ngx-translate/core';

/**
 * The label to show for an amenity. The API stores an Arabic name plus a stable language-neutral
 * key (IconName); the key is translated through AMENITIES_CATALOG.* so the list follows the app
 * language. A row whose key is not in the catalog (an amenity an admin added) shows its stored name.
 */
export function amenityLabel(
  translate: Pick<TranslateService, 'instant'>,
  amenity: { name: string; iconName?: string | null; icon?: string | null }
): string {
  const key = (amenity.iconName ?? amenity.icon ?? '').trim();
  if (!key) return amenity.name;

  const path = `AMENITIES_CATALOG.${key}`;
  const translated = translate.instant(path);
  return typeof translated === 'string' && translated && translated !== path ? translated : amenity.name;
}

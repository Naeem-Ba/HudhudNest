import { AiUnderstoodFilter } from '../../core/models/hudhud-ai.model';

/** One understood criterion, shown as a chip: a translation key and the values it needs. */
export interface AiChip {
  key: string;
  params?: Record<string, string | number>;
  /** True when the value was guessed (currency) and the user may want to correct it. */
  guessed?: boolean;
}

/** The chips of an understood filter, in the order people read a search: what, where, how much, details. */
export function aiFilterChips(f: AiUnderstoodFilter | null | undefined): AiChip[] {
  if (!f) return [];
  const chips: AiChip[] = [];
  if (f.listingType) chips.push({ key: f.listingType === 'ForRent' ? 'AI.CHIP.FOR_RENT' : 'AI.CHIP.FOR_SALE' });
  if (f.propertyTypeCode) chips.push({ key: 'AI.TYPE.' + f.propertyTypeCode.toUpperCase().replace(/-/g, '_') });
  if (f.placeLabel) chips.push({ key: 'AI.CHIP.PLACE', params: { place: f.placeLabel } });
  else if (f.placeText) chips.push({ key: 'AI.CHIP.PLACE_TEXT', params: { place: f.placeText } });

  const currency = f.currencyCode ?? '';
  if (f.minPrice != null && f.maxPrice != null) chips.push({ key: 'AI.CHIP.PRICE_BETWEEN', params: { min: f.minPrice, max: f.maxPrice, currency }, guessed: f.currencyGuessed });
  else if (f.maxPrice != null) chips.push({ key: 'AI.CHIP.PRICE_MAX', params: { max: f.maxPrice, currency }, guessed: f.currencyGuessed });
  else if (f.minPrice != null) chips.push({ key: 'AI.CHIP.PRICE_MIN', params: { min: f.minPrice, currency }, guessed: f.currencyGuessed });

  if (f.minRooms != null && f.maxRooms != null && f.minRooms === f.maxRooms) chips.push({ key: 'AI.CHIP.ROOMS_EXACT', params: { n: f.minRooms } });
  else if (f.minRooms != null) chips.push({ key: 'AI.CHIP.ROOMS_MIN', params: { n: f.minRooms } });
  else if (f.maxRooms != null) chips.push({ key: 'AI.CHIP.ROOMS_MAX', params: { n: f.maxRooms } });

  if (f.minArea != null && f.maxArea != null) chips.push({ key: 'AI.CHIP.AREA_BETWEEN', params: { min: f.minArea, max: f.maxArea } });
  else if (f.minArea != null) chips.push({ key: 'AI.CHIP.AREA_MIN', params: { n: f.minArea } });
  else if (f.maxArea != null) chips.push({ key: 'AI.CHIP.AREA_MAX', params: { n: f.maxArea } });

  if (f.floorMode === 'Highest') chips.push({ key: 'AI.CHIP.FLOOR_HIGHEST' });
  else if (f.floorMode === 'Lowest') chips.push({ key: 'AI.CHIP.FLOOR_LOWEST' });
  else if (f.floorFrom === 0 && f.floorTo === 0) chips.push({ key: 'AI.CHIP.FLOOR_GROUND' });
  else if (f.floorFrom === 1 && f.floorTo == null) chips.push({ key: 'AI.CHIP.FLOOR_NOT_GROUND' });
  else if (f.floorFrom != null && f.floorFrom === f.floorTo) chips.push({ key: 'AI.CHIP.FLOOR_EXACT', params: { n: f.floorFrom } });
  else if (f.floorFrom != null) chips.push({ key: 'AI.CHIP.FLOOR_FROM', params: { n: f.floorFrom } });
  else if (f.floorTo != null) chips.push({ key: 'AI.CHIP.FLOOR_TO', params: { n: f.floorTo } });

  if (f.hasElevator != null) chips.push({ key: f.hasElevator ? 'AI.CHIP.ELEVATOR' : 'AI.CHIP.NO_ELEVATOR' });
  if (f.hasBalcony != null) chips.push({ key: f.hasBalcony ? 'AI.CHIP.BALCONY' : 'AI.CHIP.NO_BALCONY' });
  if (f.hasParkingSpace != null) chips.push({ key: f.hasParkingSpace ? 'AI.CHIP.PARKING' : 'AI.CHIP.NO_PARKING' });
  if (f.keywords) chips.push({ key: 'AI.CHIP.WORDS', params: { words: f.keywords } });
  if (f.sortBy === 'Price') chips.push({ key: f.sortDescending ? 'AI.CHIP.SORT_PRICE_DESC' : 'AI.CHIP.SORT_PRICE_ASC' });
  return chips;
}

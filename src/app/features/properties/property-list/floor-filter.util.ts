import { AvailableFloors, FloorMode } from '../../../core/models/property.model';

/**
 * The floors the screen offers when the server's list of available floors is not known (not loaded yet, or the
 * request failed): 0 (ground) to 50. Only a default for the UI - once the server answers, the choices follow the data,
 * so a building taller than this is still reachable, and the API itself accepts 0..200 (the rule for a listing's floor).
 */
export const DEFAULT_FLOOR_CEILING = 50;

/** The largest floor the API accepts (PropertyFilterDtoValidator.MaxFloor). */
export const MAX_FLOOR = 200;

export interface FloorSelection {
  from: number | null;
  to: number | null;
  mode: FloorMode | null;
}

/** A URL value as a floor: a whole number from 0 to 200, otherwise null (a negative or garbled value is dropped, never sent). */
export function parseFloorParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === '' || !/^\d{1,3}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= 0 && value <= MAX_FLOOR ? value : null;
}

export function parseFloorMode(raw: string | null): FloorMode | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'highest' || value === 'lowest' ? value : null;
}

/**
 * The floors to list in the selects: the available ones, or 0..50 while they are unknown. A floor already chosen
 * (from a shared link, say) is always kept in the list so the select can show it, even if it no longer exists.
 */
export function floorChoices(available: AvailableFloors | null, keep: readonly (number | null)[]): number[] {
  const base = available
    ? available.floors.map(f => f.floor)
    : Array.from({ length: DEFAULT_FLOOR_CEILING + 1 }, (_, i) => i);
  const all = new Set(base);
  keep.forEach(value => { if (value !== null) all.add(value); });
  return [...all].sort((a, b) => a - b);
}

/** Whether any floor matching the selection still exists. Highest/lowest always can: they pick whatever exists. */
export function selectionStillPossible(selection: FloorSelection, available: AvailableFloors): boolean {
  if (selection.mode) return true;
  if (selection.from === null && selection.to === null) return true;
  return available.floors.some(({ floor }) =>
    (selection.from === null || floor >= selection.from) && (selection.to === null || floor <= selection.to));
}

export function hasFloorSelection(selection: FloorSelection): boolean {
  return selection.mode !== null || selection.from !== null || selection.to !== null;
}

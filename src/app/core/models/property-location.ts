/** Returns true when latitude/longitude are finite values in their valid ranges. */
export function isValidCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === 'number'
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;
}

/** An absent location is valid; a partial or malformed coordinate pair is not. */
export function hasCompleteCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (latitude === null || latitude === undefined)
    && (longitude === null || longitude === undefined)
    || isValidCoordinates(latitude, longitude);
}

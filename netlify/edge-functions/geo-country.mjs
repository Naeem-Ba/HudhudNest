// =============================================================
// netlify/edge-functions/geo-country.mjs
//
// GET /geo -> { "country": "DE" | null }. See ./lib/geo-country.mjs for the behaviour, the privacy
// notes and the GEO_LANGUAGE_ENABLED kill switch.
// =============================================================
import { handleGeoCountry, isGeoLanguageEnabled } from './lib/geo-country.mjs';

export default async function geoCountry(request, context) {
  return handleGeoCountry(request, context, {
    enabled: isGeoLanguageEnabled(Netlify.env.get('GEO_LANGUAGE_ENABLED'))
  });
}

export const config = {
  path: '/geo'
};

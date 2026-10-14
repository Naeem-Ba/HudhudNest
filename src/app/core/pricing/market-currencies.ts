/**
 * The only currencies the product prices and searches in: the dollar, the euro and the Syrian
 * pound. Listings (sale, rent, short stay), price filters and saved searches all use this list;
 * the server refuses any other code with 422 and offers only these in GET /api/lookups/currencies.
 */
export const MARKET_CURRENCY_CODES: readonly string[] = ['USD', 'EUR', 'SYP'];

export function isMarketCurrency(code: string | null | undefined): boolean {
  return MARKET_CURRENCY_CODES.includes((code ?? '').trim().toUpperCase());
}

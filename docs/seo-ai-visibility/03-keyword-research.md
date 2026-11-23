# 03 — Keyword Research, Search Intent and Page Mapping

## Data honesty statement

No keyword tool data was available: no Google Keyword Planner, Trends, Search Console, Ahrefs or Semrush. Google Trends refused automated fetching on 2026-11-20.

What this means for the tables below:
- **Every volume is "unverified"**, with no estimated numbers.
- "SERP" observations come from a web-search tool (US-based, not localized Google results), run on 2026-11-20.
- Vocabulary was taken only from real Syrian listing pages observed that day.

Real volumes must come from Search Console (free) once it is verified and the site has impressions. Keyword Planner volumes for Syria are known to be coarse.

## 1. Who owns the queries today (observed 2026-11-20)

| Query | Who surfaced |
|---|---|
| عقارات سوريا | News: aljazeera.net, syria.tv, enabbaladi.net, majalla, almodon, al-ain. No listing site. |
| شقق للبيع في دمشق | News in a generic search. Restricted to domains: sy.opensooq.com category pages, aqarsyria.com `/property/`. |
| عقارات دمشق للإيجار شقة مفروشة | doushesh.com (`/furnished-flats-for-rent/damascus`, `/flats-for-rent/damascus`), sy.opensooq.com, manassa24aqar.com |
| موقع عقارات سوري / فروغ / طابو | doushesh, opensooq, kasioon.com ("أسعار عقارات في سوريا – أكثر من 850 إعلاناً"), sy.6abbo.com |
| مكاتب عقارية في دمشق | **No office directory surfaced.** This is a gap HudhudNest `/offices` could fill once it is crawlable. |
| أسعار العقارات في سوريا 2026 | News only |
| Syria real estate listings | syria.realigro.com (stale), Enab Baladi English, noise |
| Immobilien Syrien Wohnung kaufen Damaskus | Generic foreign-buying guides, EUAA reports. No listing site. |
| Suriye emlak Şam satılık daire | Turkish-market news about Syrians in Turkey. No Syrian listing site. |

Observed competitor SEO traits:

| Site | Traits |
|---|---|
| **doushesh.com** | Server-rendered type/city/neighbourhood landing pages with H1s and listing prices in raw HTML. Most mature. Backed by Saudi Aqar (Wamda, 2026-09). |
| **kasioon.com** | Region/category URL tree. Aggregate stats block (count, median price) plus FAQ. AI-citable format; numbers are self-reported. |
| **sy.opensooq.com** | Indexed city × neighbourhood × category pages in ar/en, with canonical. |
| **aqarsyria.com** | Listing pages with "طابو أخضر" features, mostly "السعر عند الاتصال". Broken taxonomy. |

Correction to the independent consulting report:
- Doushesh is the strongest SEO competitor, not "not specialized".
- Kasioon, 6abbo and manassa24aqar were missing from that report.
- HudhudNest has 4 languages, not 3.

## 2. Real vocabulary (from listings, not assumptions)

| Term | Seen in listings? | Use |
|---|---|---|
| شقة/شقق، بيت/منزل، فيلا، أرض، مزرعة، شاليه، دار عربية | Yes | Titles, H1, filters |
| طابو أخضر / سند طابو أخضر | Yes | Feature, guide topic |
| كسوة / إكساء، ديلوكس، سوبر ديلوكس، على الهيكل | Yes | Feature, glossary |
| مفروشة / فاضي، شهري / سنوي / يومي، تأمين، عمولة، شوفاج | Yes | Rent pages, glossary |
| السعر عند الاتصال | Yes | (do not use as content) |
| حكم محكمة، فروغ، الهبة | News only | Informational guides only, never filters |
| كاتب عدل | Not found | Do not target until evidenced |

Spelling variants (للإيجار / للايجار، بيت / منزل) are handled inside copy and titles, **never** as separate URLs.

## 3. Intent map and page mapping (volumes unverified)

### Arabic (primary market)

| Intent | Keyword cluster | Target page (existing / proposed) | Condition |
|---|---|---|---|
| Transactional | شقق للبيع في دمشق · بيوت للبيع في دمشق · منزل للبيع ريف دمشق | Proposed hub: `/properties/sale/damascus` (+ `/apartment`) | Index only with ≥ 5 live listings, otherwise noindex |
| Transactional | شقق للإيجار في دمشق · شقة مفروشة للإيجار دمشق · إيجار شهري | Proposed `/properties/rent/damascus`. Daily stays: `/short-stay` (+ city when inventory exists) | Same threshold |
| Local | شقق للإيجار في المزة · مشروع دمر · المالكي · كفرسوسة · جرمانا · قدسيا | Proposed neighbourhood × transaction pages | Only when ≥ 5 live listings. Never empty pages. |
| Local | مكاتب عقارية في دمشق · مكتب عقاري المزة | Existing `/offices` (+ area filter as a crawlable hub later), `/offices/:slug` | Needs edge snapshot first |
| Commercial | أسعار الشقق في دمشق · سعر متر الشقة · أسعار الإيجارات | `/price-estimate` (calculator). Future price-guide page per city. | Price guide only when n ≥ 30 per segment |
| Commercial | تقييم عقار · كم سعر بيتي | `/valuation` (office opinion), `/price-estimate` | Distinct primaries (see rule 4) |
| Commercial | طابو أخضر أم حكم محكمة · الفرق بين ديلوكس وسوبر ديلوكس · شراء عقار للمغترب | Guides; `/expats` | Legal review |
| Informational | كيف أتحقق من ملكية عقار · نقل ملكية · ما هو الفروغ · البيع بوكالة من الخارج | Guides | Disclaimer and lawyer review |
| Brand | هدهد نيست · HudhudNest | Home, About (`/ueber-uns`) | Entity work (04) |

### English (investors, diaspora, journalists)

| Intent | Cluster | Page |
|---|---|---|
| Transactional | apartments for sale in Damascus; furnished apartment Damascus monthly | Hubs (`?lang=en` + hreflang, once decided) |
| Commercial | Syria property prices; cost of renting in Damascus | Price guide (data-gated) |
| Informational | how to buy property in Syria as a foreigner; Syrian title deed types; power of attorney | Guides |
| Investment | Syria real estate investment | `/investments` |

### German and Turkish

The evidence says these are not listing-search markets in the local language:
- German queries surface only guides and asylum reports.
- Turkish "Suriye emlak" means the *Turkish* housing market or Syrians buying in Turkey.

Hypothesis (unverified): the diaspora searches for listings in **Arabic**, while de/tr serve partners, second-generation users, lawyers, and procedure questions.

| Lang | Cluster | Page |
|---|---|---|
| de | Immobilie in Syrien kaufen; Wohnung in Damaskus von Deutschland aus; Vollmacht Immobilie Syrien | `/expats` (de), guides |
| tr | Suriye'de ev almak; Şam kira fiyatları; Suriye tapu işlemleri | Guides, `/investments` |

Recommendation:
- de/tr get trust pages and guides only, not translated listing hubs.
- Search Console query and country data (8–12 weeks) decides any expansion.

## 4. Cannibalization and indexation rules

1. **One canonical URL** per language × place × property type × transaction.
   - All other filter combinations (price, rooms, finishing, sort, page beyond the pattern) use `noindex,follow` or canonical to the hub.
   - No URL per finishing grade or deed type.
2. **Spelling variants** never get separate URLs.
3. **Hubs own transactional intent.** "أسعار … في X" goes to the price page. Guides never target transactional terms.
4. **Distinct primaries:**
   - `/price-estimate` → "حاسبة سعر العقار".
   - `/valuation` → "تقييم عقاري من مكتب".
   - Price guide → "أسعار العقارات في دمشق".
5. **`/expats`** is the single diaspora hub per language.
6. **Hreflang only between true equivalents.** No hreflang to a page that is only UI-translated, if the content is the same.
7. **Thin place pages** get noindex or merge into the parent place. Expired listings follow the lifecycle matrix (02 §E).
8. Legacy duplicates are already handled: `/imprint` 301s to `/impressum` (`public/_redirects` + `app.routes.ts:459`). No `/contact` route exists, so there is no duplicate there.

## 5. Prerequisites before any keyword page is built

Hub pages need all four:
- Real inventory.
- Crawlable HTML (edge snapshot).
- Place slugs. `Location` has no slug field and the city level is empty (BE-12).
- A cached facet/count endpoint (BE-12).

Without these, a "شقق للبيع في دمشق" page is an empty doorway page. That violates the brief and Google's spam policies.

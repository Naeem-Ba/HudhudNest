# 06 — Structured Data Plan

## Principles

- Only real schema.org types and properties.
- Only fields the API actually returns.
- Only what is visible on the page.
- No `AggregateRating`, `Review`, `price` or `availability` unless the data is real and shown.
- Output the same JSON-LD in the edge snapshot (raw HTML) and in the client.

**Rich result reality**
- Google has **no** rich result for `RealEstateListing`.
- FAQ rich results are restricted to authoritative government and health sites (since 2023). HowTo is retired.
- The sitelinks search box (`SearchAction`) was retired in 2024.
- Listing markup therefore helps machines understand pages. It does not produce snippets.
- Eligible today: `BreadcrumbList`, `Organization` logo, and `AggregateRating` on `RealEstateAgent` (only with genuine, visible reviews).

## 1. Current state

| Where | Type | Rendered | Issues |
|---|---|---|---|
| `src/index.html:79-106` | Organization, WebSite+SearchAction | Raw HTML ✔ | No `@id`, `description` or `sameAs`; SearchAction is obsolete |
| Listing detail (`property-structured-data.service.ts`, `property-detail.page.ts:717-734`) | RealEstateListing + breadcrumb | **JS only** | `address` sits on `RealEstateListing` (a WebPage subtype; invalid there). Price is `purchasePrice ?? coldRent ?? warmRent` with no rent unit, so ForRentAndSale loses one offer. Breadcrumb names are hard-coded Arabic. Copies `streetAddress` even for private owners (privacy, 08). |
| Edge (`lib/social-crawler.mjs:381-440`) | RealEstateListing | Raw HTML for social UAs only | Reads `images`, but the DTO field is `imageUrls`. Same `address` issue. |
| Office (`office-seo.ts:64-135`) | RealEstateAgent + BreadcrumbList | JS only | Design is sound. Add `@id`, `image`, `areaServed`. |
| Short-stay, investments, services | none | — | Missing |

## 2. Target markup per page type

### Site-wide (static, `index.html`)

```json
{"@context":"https://schema.org","@graph":[
 {"@type":"Organization","@id":"https://hudhudnest.com/#org","name":"HudhudNest","alternateName":"هدهد نيست",
  "url":"https://hudhudnest.com","logo":"https://hudhudnest.com/images/horizontal-logo.png",
  "description":"<approved identity statement>","areaServed":{"@type":"Country","name":"Syria"},
  "knowsLanguage":["ar","en","de","tr"],"sameAs":["<only real official profiles>"]},
 {"@type":"WebSite","@id":"https://hudhudnest.com/#website","url":"https://hudhudnest.com","name":"HudhudNest",
  "alternateName":"هدهد نيست","inLanguage":"ar","publisher":{"@id":"https://hudhudnest.com/#org"}}]}
```

### Listing (`/properties/:id`)

```json
{"@context":"https://schema.org","@graph":[
 {"@type":"RealEstateListing","@id":"{url}#listing","url":"{url}","name":"{title}","description":"{description}",
  "datePosted":"{publishedAt}","image":["{mainImageUrl}","...{imageUrls}"],
  "mainEntity":{"@id":"{url}#place"},"offers":{"@id":"{url}#offer"},"breadcrumb":{"@id":"{url}#breadcrumb"}},
 {"@type":"Apartment","@id":"{url}#place","name":"{title}","numberOfRooms":"{rooms}",
  "floorSize":{"@type":"QuantitativeValue","value":"{area}","unitCode":"MTK"},"floorLevel":"{floor}",
  "address":{"@type":"PostalAddress","addressLocality":"{district/city name}","addressRegion":"{governorate name}","addressCountry":"SY"}},
 {"@type":"Offer","@id":"{url}#offer","price":"{purchasePrice}","priceCurrency":"{currencyCode}",
  "availability":"https://schema.org/InStock","offeredBy":{"@id":"https://hudhudnest.com/offices/{slug}#org"}},
 {"@type":"BreadcrumbList","@id":"{url}#breadcrumb","itemListElement":["Home","Properties","{governorate}","{title}"]}]}
```

Field rules (API sources):

| Rule | Mapping |
|---|---|
| Type from `propertyTypeId` → lookup `code` | apartment/studio → `Apartment`; house/villa/chalet → `House`; land/shop/office/warehouse/farm → `Place`; unknown → `Accommodation` |
| `floorSize.unitCode` | `MTK` for square metres, `DAA` for dunum, `HAR` for hectare. Omit for qasabah (region-dependent). |
| ForSale | `PurchasePrice`, no unit |
| ForRent | `ColdRent` (else `WarmRent`) with `UnitPriceSpecification` `unitCode` `MON` or `ANN` per `RentalDurationType` |
| ForRentAndSale | Two `Offer` nodes |
| No price shown on the page | No `price` |
| Availability | Available → `InStock`; Reserved → `LimitedAvailability`; Sold/Rented → `SoldOut` |
| **Privacy** | No `geo` by default (at most rounded, approximate coordinates when the page shows a map). `streetAddress` only for office listings with exact location shown. Never a `Person` node for a private owner. `offeredBy` only when an office exists. |
| Never emit | `yearBuilt`, utilities (dead columns per DB audit), `LicenseNumber` (unverified) |

### Short-stay (`/short-stay/:id`)

- `Accommodation` subtype (`Apartment`/`House`/`Room`/`Suite`) from `AccommodationTypeCode`.
- `numberOfBedrooms`, `numberOfBathroomsTotal`, `occupancy.maxValue` (`Capacity`), `petsAllowed`.
- Offer with `UnitPriceSpecification` `unitCode` `DAY` from `FromPricePerNight`. That field is on the summary DTO only, so it must be added to the detail DTO first.
- Do **not** use `VacationRental` rich-result markup; it requires a Google Hotel Center partnership.

### Office (`/offices/:slug`)

- Keep the current `RealEstateAgent`.
- Add `@id {url}#org`, `image` (cover), `telephone` (public business phone only), `areaServed` (governorate).
- Rating only with `ratingCount ≥ 3` real, visible reviews.
- Never emit `LicenseNumber`.

### Service (only once a public service page exists)

- `Service` with `name`, `description`, `serviceType`, `provider` (Organization), `areaServed`.
- Offer only if the price is shown.

### Investment (`/investments/:id`)

- `WebPage` + `BreadcrumbList`, `about` → `Place` (city, country).
- No `FinancialProduct`, no coordinates.

### Place hub (future)

- `CollectionPage` + `ItemList` of listing URLs.
- Optional `Dataset` describing the `AreaPriceStats` figures (variable measured, temporal coverage, sample count, method URL), only when published.

### Article / guide (future)

- `Article` with headline, `datePublished`/`dateModified`, image, a real `author` (Person or Organization), `publisher #org`.
- `FAQPage` only for genuine Q&A visible on the page. Expect no rich result.

## 3. Validation

- **Automated:** unit tests per builder, plus an edge test that parses the snapshot's JSON-LD and checks required fields and the absence of forbidden ones (geo/street for private listings, rating without reviews).
- **Manual, owner, after deploy:** Rich Results Test and validator.schema.org on 1 listing, 1 office and home. Then watch Search Console's Enhancements reports.

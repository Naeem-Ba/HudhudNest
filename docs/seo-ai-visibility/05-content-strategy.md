# 05 — Content Strategy and Digital PR (6 months)

## Gate 0: what must be true before publishing editorial content

1. The API is restored and always on (BE-01).
2. Content pages render in raw HTML, either through prerender (option A) or the edge snapshot (option C). Publishing guides into a CSR shell wastes the effort for every non-Google crawler.
3. Search Console and Bing are verified, so impact can be measured.

Until the gate opens, the useful work is:
- Write the drafts.
- Fix listing templates so owners use the real vocabulary (see 03 §2).
- Distribute through Facebook and WhatsApp. These are the main channels, and previews work again once MAIN is deployed.

## Cadence a solo founder can sustain

- One substantial **Arabic** piece per week. One translation (en, de or tr) every two weeks, adapted to the audience, not a literal translation.
- Over six months that is about 26 Arabic and about 12 translated pieces.
- **Human review is mandatory.** AI may produce first drafts. A native Syrian-Arabic reviewer checks every piece, and every fact is checked against its source.
- **Legal and procedure content** must carry:
  - "معلومات عامة وليست استشارة قانونية"
  - dated sources
  - a "last reviewed" date
  - a Syrian property lawyer's review (decision D-10)
- **No price statistics** unless they come from platform data that meets the thresholds, or from named and dated external sources.

## Article template (every piece)

1. Search intent stated (from 03).
2. Title (≤ 60 characters, natural wording).
3. Meta description (≤ 155 characters, accurate).
4. One H1, then logical H2 and H3 headings.
5. A direct answer in the first paragraph.
6. Original content: Syrian specifics, examples, checklists.
7. Sources, linked and dated, where facts or law are involved.
8. Internal links to the relevant hub, tool (`/price-estimate`, `/valuation`) or office directory.
9. Real published and updated dates.
10. Author or reviewer, only if real and consenting.
11. `Article` JSON-LD with the same data (06).

## Six-month plan

| Month | Theme | Pieces (ar first) | Needs platform data? |
|---|---|---|---|
| M1 | Trust and identity | About (4 languages, the entity page) · "How listings and offices appear on HudhudNest" (describe the real process only) · Glossary of Syrian property terms (طابو أخضر، كسوة، ديلوكس، على الهيكل، فروغ، حكم محكمة، الهبة) with disclaimer · Anti-fraud guide (deposits, verifying the owner) | No |
| M2 | Renting in Damascus | Rental steps (deposit, commission, annual payment, contract) · Primers for 3 neighbourhoods matching real inventory (no unsourced prices) · "Renting for your parents from Germany" (ar + de) | No |
| M3 | Ownership procedures (lawyer review) | Title-deed types · How to verify ownership · Buying or selling by power of attorney from abroad (ar, de, en) | No |
| M4 | Offices and services | Office spotlights (with written consent, linking to `/offices/:slug`) · How to choose an office · Service guides (inspection, photography, maintenance) only for services that exist in production | Partial |
| M5 | First data note (gated) | City price-per-m² note from `AreaPriceStats`, **only if** the thresholds are met. Otherwise publish the **methodology page** alone. | Yes, gated |
| M6 | Investment and diaspora; refresh | `/investments` explainer (en/tr/ar) citing reputable 2026 reporting · Returnee FAQ (ar/de/tr) · Update M1–M3 with dates | No |

Data rules for any statistic:
- n ≥ 30 de-duplicated listings per segment for a published median. `AreaPriceStats` itself uses ≥ 8 samples and ≥ 3 owners for the estimator. Editorial publishing uses the stricter bar.
- Asking prices are labelled as asking prices. "Price on request" listings are excluded.
- Currency and exchange-rate date are shown. Exchange rates are entered manually today (BE-17).
- Aggregates only. Nothing at neighbourhood level that could identify a unit.
- **Never use** `/api/analytics/market`: it averages across currencies (BE-10).

## Area pages (programmatic, gated)

- A place page (city or neighbourhood × transaction) is created only when **≥ 5 live listings** exist. Below that it is noindex, or merged into the parent.
- Each page needs unique value beyond the list: a short human-written area summary (reviewed), real counts, a price block (if the threshold is met), offices active in the area, and links to child or sibling places.
- No templated text with only the place name swapped.

## Digital PR and authority

**Targets, in order of realism**
1. **Syrian and diaspora media:** Enab Baladi (ar/en), Syria TV, Al-Modon, Al Jazeera economy. Pitch the anti-fraud checklist, the methodology, and later the gated data notes.
2. **Startup press:** Wamda (has covered Doushesh and other Syrian proptech), at a real milestone such as the store launch or an office count.
3. **Partner offices:** a "Find us on HudhudNest" badge and link; the office's Facebook "website" field pointing to its `/offices/:slug`; the existing QR feature (`/o/:code`).
4. **Diaspora communities** in Germany and Turkey: value-first posts only, no spam. No specific organisation was verified.
5. **Trustworthy directories:** Crunchbase, LinkedIn, app stores. GBP only with a real address. Wikidata later.
6. **Housing, land and property (HLP) legal-aid and NGO resources**, which may link to a neutral glossary.

**Avoid**
- Paid links, PBNs, guest-post farms, link exchanges, "DA" packages, expired-domain redirects.
- Doorway area pages without listings.
- Scraping Facebook, OpenSooq, AqarSyria or Doushesh content without consent.
- Fake reviews or badges, invented price indices, unreviewed AI legal advice.
- Political or sectarian hooks. Confiscation stories as marketing.
- Implying a partnership with the official real-estate registry (المصالح العقارية).

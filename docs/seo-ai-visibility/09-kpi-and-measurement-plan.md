# 09 — KPI and Measurement Plan

**No targets yet.** There is no baseline: Search Console and Bing are not connected, and the API is down. Targets are set only after 4 weeks of baseline data following P0. Below are the KPIs, their sources and the review rhythm.

## 1. KPI dashboard

| KPI | Source | How | Frequency | Baseline status |
|---|---|---|---|---|
| Indexed pages (by type: listing, office, static) | Search Console → Pages | Filter with sitemap-per-type (after the sitemap index) | Weekly | Unknown, needs GSC |
| Not-indexed reasons (soft 404, crawled not indexed, duplicate) | GSC → Pages | Track counts per reason | Weekly | Unknown |
| Organic clicks / impressions / CTR / position | GSC → Performance | 28-day windows; split by country (SY, DE, TR, others) and by page type | Monthly | Unknown |
| Non-brand traffic | GSC queries excluding the brand regex `hudhud|هدهد` | Brand vs non-brand ratio | Monthly | Unknown |
| Property-page indexing | GSC URL Inspection (sample of 10 listings) | Indexed? Rendered language? Content visible? | Monthly | Not started |
| Rendered language seen by Google | URL Inspection screenshot / HTML | Must be Arabic after P0-3 | Once after deploy, then quarterly | Suspected English (FE-01) |
| Core Web Vitals | CrUX via PageSpeed / GSC CWV report | p75 LCP, INP, CLS (field). Lab Lighthouse as a proxy. | Monthly | Lab only: LCP 3.3–3.4 s, TBT 240–280 ms, CLS ≈ 0 (2026-11-20, API down) |
| Valid structured data | GSC Enhancements (Breadcrumbs, Organization); Rich Results Test samples | Errors and warnings count | Monthly | n/a |
| Sitemap health | GSC Sitemaps + live smoke test | URLs submitted vs indexed; sitemap never below N | Weekly (automated) | 16 URLs (API down) |
| Bing indexing / clicks | Bing Webmaster Tools | Same as GSC | Monthly | Unknown |
| Backlinks / referring domains | GSC Links report (free); Bing Backlinks (free) | Count of referring domains; new vs lost | Monthly | None found |
| Brand mentions | Manual search + Google Alerts (free) for "هدهد نيست", "HudhudNest" | Log new mentions | Monthly | None found |
| AI citations | Fixed prompt protocol (§3) | % of prompts with mention or citation, accuracy | Monthly | Expected 0 |
| AI crawler hits | Netlify logs or an edge counter (optional, after the snapshot) | Hits by OAI-SearchBot, PerplexityBot, Claude-SearchBot, Googlebot | Monthly | Not measurable today |
| Organic conversions | Existing consent-gated analytics: registrations, listing creations, contact clicks, office profile views where the source is organic | Funnel by landing-page type | Monthly | Not started |

Paid tools (Ahrefs, Semrush) are not required. The free GSC, Bing, Google Alerts and manual protocol are sufficient at this stage.

## 2. Target-setting method (after baseline)

1. Collect 4 weeks of data after P0 is live.
2. Set targets relative to the baseline and to inventory. Indexed listings cannot exceed live listings. Example form, with numbers to be filled from data: "≥ 90% of sitemap listing URLs indexed within 30 days".
3. Review monthly and adjust. Never set targets from industry averages.

## 3. AI citation measurement protocol

**Engines:** ChatGPT (search on), Perplexity, Google AI Overviews / AI Mode, Microsoft Copilot, Gemini, Claude (web search on).

**Setup**
- Logged-out or fresh session where possible.
- Record location/VPN (none, DE or TR) and model/mode.
- Fixed wording.
- Each prompt once per engine per month; brand prompts twice.
- Keep a screenshot or share link.

**Prompts**

| ID | Prompt |
|---|---|
| B1 | ما هي منصة هدهد نيست العقارية؟ |
| B2 | What is HudhudNest (hudhudnest.com)? |
| B3 | Was ist HudhudNest? |
| B4 | HudhudNest nedir? |
| B5 | هل هدهد نيست موثوق؟ |
| C1 | ما أفضل مواقع العقارات في سوريا؟ |
| C2 | أين أجد شقق للإيجار في دمشق؟ |
| C3 | أفضل مكاتب عقارية في دمشق |
| C4 | Best websites to find apartments in Damascus, Syria |
| C5 | Wie finde ich eine Wohnung in Damaskus von Deutschland aus? |
| C6 | Şam'da kiralık ev nasıl bulunur? |
| C7 | شقة مفروشة إيجار شهري دمشق |
| I1 | كم سعر الشقة في دمشق 2026؟ |
| I2 | ما معنى طابو أخضر؟ |
| I3 | كيف أتحقق من ملكية عقار في سوريا؟ |
| I4 | How can a Syrian abroad buy property in Damascus? |
| I5 | Immobilie in Syrien per Vollmacht kaufen |
| I6 | Suriye'de tapu nasıl kontrol edilir? |

**Log template**

| date | engine | mode/model | location | prompt_id | brand mentioned (Y/N) | hudhudnest URL cited | position (first/mid/late/none) | accuracy (correct/partial/wrong/hallucinated) | competitors mentioned | cited domains | evidence link | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

**Descriptive KPIs**
- % of prompts with a brand mention.
- % of prompts with a hudhudnest.com citation.
- Hallucinated claims about the brand (target 0, each one gets a correction action).
- Competitor citation frequency.

Results vary by session, account, location and date. This is a trend signal, not a ranking.

## 4. Before/after records

For each implementation batch, store:
- Lighthouse JSON (mobile; same URLs: `/`, `/properties`, 1 listing, 1 office).
- A curl matrix (status, title, canonical, robots, JSON-LD presence, body word count) for the URL set in 10.
- GSC screenshots of Pages and Performance.

Keep them in the project folder `seo-ai-visibility/evidence/` with dates. The "before" for this audit is already stored there (Lighthouse 2026-11-20, robots, sitemap, build-info).

Passing code tests does **not** mean Google indexed anything. Only GSC proves indexing.

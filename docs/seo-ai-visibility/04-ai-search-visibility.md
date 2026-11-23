# 04 — AI Search Visibility (GEO / AEO / Entity SEO)

**No guarantee.** No method guarantees that ChatGPT, Google AI Overviews/AI Mode, Gemini, Copilot, Perplexity or Claude will mention or recommend HudhudNest. This file covers the preconditions:
- These systems can **read** the site.
- They can **identify** the brand as one entity.
- They find content **worth citing**.

## 1. What decides visibility today

1. **Readability (blocking).**
   - Every URL returns an empty shell.
   - Most AI crawlers do not execute JavaScript. Vercel's 2024-12 study found that none of the major AI crawlers render JS; the exceptions are Gemini via Googlebot and Applebot. That study is two years old, so re-check with logs once SSR or a snapshot exists.
   - So OAI-SearchBot, PerplexityBot, Claude-SearchBot and ClaudeBot see one generic Arabic title and description for the entire site, whatever robots.txt says.
   - Google AI Overviews and AI Mode draw on Google's index, which is affected by FE-01 (English rendering) and BE-01 (API down).
2. **Entity (missing).**
   - No web footprint was found for HudhudNest or هدهد نيست on 2026-11-20.
   - The Organization JSON-LD has no `sameAs`, `description`, `areaServed` or `contactPoint`.
   - The app has no official social profile links at all. The `instagram.com/office` and `wa.me/963944…` values found in the repo are test fixtures in spec files, not live links.
   - Name collisions exist: HudHud Maps (Saudi app), hudhud systems (Crunchbase), Hudhud Delivery, HudHudTrip, hodhod.ca.
3. **Citable content (missing).**
   - There are no guides, glossary, methodology or data pages.
   - Production has 2 listings.

## 2. Entity SEO plan

**One canonical identity statement.** Use it everywhere, in all 4 languages, with no claims that cannot be proven:

> HudhudNest (هدهد نيست) is a Syrian digital real-estate platform for buying, renting, short stays, investment projects, real-estate offices and property services in Syria, available in Arabic, English, German and Turkish.

Rules:
- Name only services that exist in production. Verify each against the live API after restore.
- Do not claim "verified", "certified" or "licensed" unless a real process exists (see 08).
- Do not invent a legal entity, address, registration number or founding date.

| Surface | Action | Owner / code |
|---|---|---|
| Organization JSON-LD | Add `@id: https://hudhudnest.com/#org`, `description`, `areaServed: Syria`, `knowsLanguage: [ar,en,de,tr]`, and `sameAs` (real profiles only). Add `contactPoint` only with a real public channel. Remove the obsolete `SearchAction`. | Code (S), after D-06 |
| About page (`/ueber-uns`) | Make it the entity page: what it is, services, market, team (only real, consenting people), contact. Must be in raw HTML (prerender, option A). | Content + code |
| Social profiles | Claim the same handle on Facebook, Instagram, LinkedIn, Telegram, WhatsApp Business, X and YouTube, and link the site from each. | **Owner** |
| App stores | Use the same name and description on the Play listing once it is published. | Owner |
| Directories | Crunchbase now. Google Business Profile only with a real address or service area. Wikidata only after independent coverage exists, otherwise it gets deleted. | Owner |
| Consistency | Same name, same description, same logo everywhere. | All |

## 3. AI crawler access

Classes:
- Search indexing: affects appearing in AI search answers.
- On-demand fetch: a user asked the assistant to open a page.
- Training: future model knowledge, no citation link.

Official documentation was checked 2026-11-20.

| Agent | Class | Honors robots | Runs JS | Doc |
|---|---|---|---|---|
| Googlebot | Search index (also feeds AI Overviews / AI Mode) | Yes | Yes | developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers |
| Google-Extended | **Token, not a crawler.** Gemini training/grounding opt-out; does not affect Search inclusion. | n/a | n/a | same |
| Bingbot | Search index; feeds Copilot | Yes | Partial | bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0 |
| OAI-SearchBot | AI search index (ChatGPT search) | Yes | No | developers.openai.com/api/docs/bots |
| ChatGPT-User | On-demand fetch | "may not apply" | No | same |
| GPTBot | Training | Yes | No | same |
| PerplexityBot | AI search index | Yes | No | docs.perplexity.ai/docs/resources/perplexity-crawlers |
| Perplexity-User | On-demand fetch | "generally ignores" | No | same |
| Claude-SearchBot | AI search index | Yes | Not documented | support.claude.com/en/articles/8896518 |
| Claude-User | On-demand fetch | Yes | Not documented | same |
| ClaudeBot | Training | Yes | No | same |
| Applebot | Search (Siri/Spotlight) | Yes | Yes | support.apple.com/en-us/HT6619 |
| Applebot-Extended | Token (training opt-out); "does not crawl" | n/a | n/a | same |
| meta-externalagent | Training and indexing | Yes | No | developers.facebook.com/docs/sharing/webmasters/web-crawlers |
| facebookexternalhit | Link previews (FB/WhatsApp) | Mostly | No | same |
| CCBot | Open dataset used by third parties for training | Yes | No | commoncrawl.org/ccbot |
| Amazonbot / Amzn-SearchBot | Training-capable / Alexa search | Yes | — | developer.amazon.com/amazonbot |
| DuckAssistBot | On-demand AI answers, not training | Yes | — | duckduckgo.com help pages |
| Bytespider | Presumed training; no official doc; reported non-compliance | Disputed | No | (press only) |

Upcoming, to revisit in Q1 2027:
- Bing announced separate AI training and grounding preferences on 2026-10-30, honoured from 2027-02-01. Source is secondary (seroundtable); confirm on Bing's own docs.
- Google says it will support the AIPREF `__usage_ai-training` signal in early 2027.

### Recommended robots policy (draft, not applied; decision D-07)

- **Allow on public pages:** search and on-demand agents (Googlebot, Bingbot, Applebot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, DuckAssistBot, Amzn-SearchBot, Meta-WebIndexer, facebookexternalhit).
- **Training bots** (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, meta-externalagent, CCBot, Amazonbot, Bytespider) are an owner decision:
  - **Option A, allow:** future models learn the brand, but third-party listing content is used for training. Check the ToS and office agreements first.
  - **Option B, block training, allow search and fetch:** recommended default for a marketplace hosting other people's content.
- **Implementation rule:** a named `User-agent` group *replaces* `*` for that bot. Every named group must repeat the full private Disallow list. Generate the groups from `tools/lib/private-paths.mjs` so they stay in sync.
- robots.txt is not access control. Private pages still need auth and noindex. Bytespider can only be enforced at the CDN/WAF.

**Allowing a crawler does not mean it will show the site.** That is a precondition only.

### llms.txt

- Currently `/llms.txt` returns the SPA shell with 200 (soft 404). Fix that first.
- No major engine has confirmed using llms.txt. Google says it is not needed for AI Overviews. Lighthouse has only an experimental audit.
- Verdict: optional, low value. If wanted, add a short static file (identity statement plus key URLs) after the snapshot or prerender work. Cost is near zero.

## 4. AI-friendly content principles

- **Answer first:** one or two sentences that directly answer the question, then details, sources and a date.
- **Clear headings** that match real questions, in the language's natural phrasing. Do not translate literally.
- **Stable facts in plain HTML**, not images or JS widgets: prices with currency and date, area units, the place hierarchy.
- **Visible dates** ("Published", "Last reviewed") and a real reviewer where one exists.
- **Methodology pages** for any statistic (sample size, period, exclusions). These make HudhudNest numbers citable and defensible.
- **Real FAQs** collected from user questions, support and Hudhud AI logs (after privacy review). FAQPage markup is fine for understanding, but Google shows FAQ rich results only for authoritative government/health sites (since 2023), so expect no snippet.
- **Original data advantage:** `AreaPriceStats` (P25/median/P75 per m² in USD, sample count, confidence, refreshed every 6 h) is already computed with privacy-safe thresholds. Once inventory exists, a city page with these numbers plus methodology is the most citable asset HudhudNest can own. Kasioon already uses this format.

## 5. Measurement

See 09 §3 for the fixed AI-citation prompt set (18 prompts × 6 engines, monthly) and logging template. The baseline today is expected to be zero.

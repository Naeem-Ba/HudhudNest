# 11 — Decisions and Owner Actions Required

Each item lists: problem, evidence, impact, proposal, cost/complexity, risk and priority. My recommendation is marked ✅.

## Owner actions (no code; you must do them)

| ID | Action | Why | Cost | Priority |
|---|---|---|---|---|
| D-01 | **Open Render, read the suspension reason on the API service, and restore it on an always-on instance.** | `api.hudhudnest.com` returns 503 `x-render-routing: suspend` (2026-11-20). The site has no data; crawlers get empty pages. Likely cause: free-tier hours exhausted by the keepalive. Not proven. | ~$7/month (Starter) ✅, or wait for the monthly reset (site stays broken) | **P0** |
| D-02 | Run the pending deploy chain: Migrator → Render → `main`→`release` + Netlify Publish. | 54 app commits are not live, including the share-preview fixes (#272). | 15 Netlify credits | **P0** |
| D-03 | Verify **Google Search Console** (Domain property, DNS TXT) and **Bing Webmaster Tools** (import from GSC). Submit `https://hudhudnest.com/sitemap.xml`. Run URL Inspection → Test live URL on `/` and send me the screenshot (rendered language). | No measurement exists. FE-01 needs confirmation. | Free | **P0** |
| D-04 | Check staging robots: `curl https://staging--hudhudnest.netlify.app/robots.txt` should be `Disallow: /`. | Proxy blocked my check. | Free | P1 |
| D-08 | Claim official social profiles with one consistent handle (Facebook, Instagram, LinkedIn, Telegram, WhatsApp Business; X/YouTube optional). Send me the URLs for `sameAs`. | Zero brand footprint; the site links no official profiles. | Free | P1 |
| D-09 | Confirm that the API repo `Naeem-Ba/HudhudNestApi` is meant to be public on GitHub. | A public PR from it is the only indexed "HudhudNest" result. | Free | P2 |

## Product and strategy decisions

### D-05 · Multilingual URL strategy
- **Problem:** one URL serves 4 languages. Googlebot likely renders English. No hreflang.
- **Options:**
  1. ✅ **Now:** crawlers default to Arabic (P0-3). **Later**, once translated content exists: `?lang=xx` self-canonical + hreflang (bare URL = ar + x-default). Effort M, low risk.
  2. Path prefixes `/en/ /de/ /tr/` now. Effort L, higher risk (router, deep links, Capacitor).
  3. Stay Arabic-only for indexing indefinitely.
- **Recommendation:** option 1. German and Turkish start as trust and guide pages only (evidence in 03); Search Console data decides any expansion.

### D-06 · Rendering approach
- **Options:**
  - ✅ Edge-rendered snapshot for detail pages (M), then build-time prerender of static pages (M).
  - Full Angular SSR (L). It has zero SSR guards today and goes down with the API.
- **Risk of the recommendation:** low. Same HTML for everyone; fails open to today's shell.

### D-07 · AI training crawlers policy
- **Options:**
  - A. Allow all.
  - ✅ B. Allow search and on-demand AI agents; block training bots (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, meta-externalagent, CCBot, Amazonbot, Bytespider).
- **Why B:** the site hosts third-party listing content, and Google-Extended does not affect Google Search inclusion.
- Review in Q1 2027, when Google AIPREF support and the new Bing preferences arrive.
- Related: do the ToS grant you rights to listing content for AI training? This needs the lawyer.

### D-10 · Legal review budget
- Ownership and procedure guides (M3) need a Syrian property lawyer's review.
- Without it, publish only the glossary and anti-fraud content with a disclaimer.

### D-11 · Data publication thresholds
- ✅ Published medians need n ≥ 30 per segment.
- ✅ Place pages are indexable only with ≥ 5 live listings.
- ✅ Aggregates only, never neighbourhood-level prices.
- Production has 2 listings today, so nothing qualifies yet.

### D-12 · Privacy defaults before more indexing (BE-02/03)
- ✅ Hide exact location by default for private owners.
- ✅ Show a display name instead of the full name.
- ✅ Remove `OwnerId` from public lists.
- ✅ Fix investment coordinates.
- Changes owner-visible behaviour, so it needs your OK.

### D-13 · Sold/rented listings
- ✅ Keep them indexed for 90 days after closing with a "sold/rented" banner and similar listings, then noindex.
- Today they are public forever.

### D-14 · Closed investments and expired-plan offices
- Closed investments: 200 + noindex, or 410?
- Offices with an expired plan: keep the public page indexable, or align it with the sitemap (excluded)?
- ✅ Investments: 200 + noindex (keeps history for users). Offices: page stays reachable but noindex while the plan is expired.

### D-15 · Sitemap thin pages
- Remove `/map` and `/price-estimate` from the sitemap until they carry unique text?
- ✅ Keep `/price-estimate` (a real tool, keyword target); drop `/map`.

### D-16 · llms.txt
- ✅ Make `/llms.txt` return 404 now.
- Optional short static file after the snapshot work. Low value either way.

### D-17 · Approve the first implementation batch
- ✅ App PR: P0-3, P0-4, P0-5, P0-6, P1-2, P1-8 and the i18n caching part of P1-12. No API change, shipped with the D-02 publish.
- Then the snapshot + structured data PR, then the API PR (lifecycle status, privacy, `X-Robots-Tag`, rate limits).
- Nothing is implemented until you approve.

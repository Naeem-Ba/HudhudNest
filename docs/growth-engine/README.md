# Growth Engine (pointer)

The plan, state and progress of the growth engine live in the API repository:
`Naeem-Ba/HudhudNestApi` → `docs/growth-engine/` (CURRENT-STATE, RECOVERY-REPORT, IMPLEMENTATION-ROADMAP,
DECISIONS, PROGRESS, HANDOFF).

App parts so far:
- P1 price history: `src/app/core/api/price-history-api.service.ts`, `src/app/features/property-detail/price-history.component.ts`.
- P2 search requests: `src/app/core/api/search-request-api.service.ts`, `src/app/features/search-requests/`
  (routes `/search-requests`, `/search-requests/board`, `/search-requests/for-listing/:propertyId`).

Release rule: merge the API PR and deploy the API first, then the app (`main → release`, Netlify Publish).

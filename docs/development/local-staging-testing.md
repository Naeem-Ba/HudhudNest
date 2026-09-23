# Running the app locally against the real Staging backend

`npm run start:staging` (`ng serve --configuration staging`) does **not** automatically point
at the deployed Staging API. Without one extra step, it silently falls back to the
**Production** backend, which correctly rejects `localhost` on CORS grounds — this looks
exactly like a Staging CORS bug but isn't one.

## Why

`src/environments/environment.staging.ts` reads its `apiBaseUrl` from the `API_URL`
environment variable (via `tools/generate-env.mjs`, which runs automatically before every
`ng serve`/`ng build` as `npm run generate:env`). If `API_URL` isn't set in your shell when
you run `start:staging`, the fallback baked into `environment.staging.ts` is
`https://wohnungen-api.onrender.com/api` — the real **Production** API, not Staging. Production's
CORS policy only allows the deployed Production frontend origin, so a request from
`http://localhost:4200` is correctly blocked, and the browser console shows a CORS error that
looks like a Staging misconfiguration.

The real deployed Staging site
(`https://staging--bizorealestateworld.netlify.app`) does not have this problem: Netlify sets
`API_URL` for that branch deploy via a per-branch environment variable override (see
`netlify.toml` and the Netlify dashboard's branch-scoped env vars), so its build always points
at the real Staging backend (`https://propertyapi-staging-api.onrender.com/api`).

## How to run `ng serve --configuration staging` locally against real Staging

Set `API_URL` in your shell before starting the dev server, then run the script as usual:

```powershell
# PowerShell
$env:API_URL = "https://propertyapi-staging-api.onrender.com/api"
npm run start:staging
```

```bash
# bash/zsh
API_URL="https://propertyapi-staging-api.onrender.com/api" npm run start:staging
```

`tools/generate-env.mjs` picks this up on the next `generate:env` step (which `start:staging`
already runs automatically) and writes it into the git-ignored
`src/environments/env.generated.ts`. No code change, no committed file, no Staging/Production
value is modified by doing this — it only affects your own local dev server process.

## Scope note

This is a local developer-experience gap only. It does **not** affect:
- The real deployed Staging site (already verified working end-to-end).
- Production (unaffected either way).
- CI (`build:ci` always runs against whatever `API_URL` the workflow/environment provides,
  same mechanism).

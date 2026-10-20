import { defineConfig, devices } from '@playwright/test';

// Phase A E2E (see docs/audit/REMEDIATION-PLAN.md — P1-4): a single, deterministic scenario
// guarding the historically worst regression class in this app (B-20: silent session refresh
// failing after the access token expires). Runs against a real deployed environment — never
// against production — so it exercises the real backend, the real refresh_token cookie, and
// real CORS/CSRF wiring, not a mock.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // deterministic or it doesn't ship — no masking flakiness with retries.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://staging--hudhudnest.netlify.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Only relevant when E2E_BASE_URL points at a local `ng serve` (self-signed dev cert);
    // the real Staging/Production origins always have valid certificates.
    ignoreHTTPSErrors: true
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});

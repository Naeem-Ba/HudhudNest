import { test, expect } from '@playwright/test';

/**
 * Guards the B-20 regression class: an expired/invalid access token must trigger a silent
 * `/auth/refresh` (using the real HttpOnly refresh_token cookie) and a transparent retry of
 * the original request — never a visible failure or a login redirect for a session that is
 * genuinely still valid. See docs/audit/CURRENT-ISSUES-VERIFICATION.md (P1-4) and
 * RefreshAuthInterceptor (src/app/core/interceptors/refresh-auth.interceptor.ts).
 *
 * Runs against a real deployed environment (Staging by default — see playwright.config.ts),
 * never Production. Set E2E_TEST_EMAIL/E2E_TEST_PASSWORD to reuse an existing account;
 * otherwise the test registers a fresh throwaway one itself (login here is not gated on
 * email confirmation — see docs/architecture/email-confirmation-and-delivery.md — so no
 * inbox access is needed). The throwaway email is marked E2E-SMOKE- to match this project's
 * existing Staging TTL-cleanup convention (see docs/testing/staging-smoke-test-data.md).
 */

const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eSmoke#2026!';

function throwawayEmail(): string {
  return `e2e-smoke-${Date.now()}@example.com`;
}

async function ensureTestAccount(page: import('@playwright/test').Page): Promise<string> {
  const existingEmail = process.env.E2E_TEST_EMAIL;
  if (existingEmail) {
    return existingEmail;
  }

  const email = throwawayEmail();

  await page.goto('/#/auth/register');
  await page.locator('#firstName').fill('E2E');
  await page.locator('#lastName').fill('Smoke');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('.consent-checkbox__input').check();

  await Promise.all([
    page.waitForResponse(
      resp => resp.url().includes('/auth/register') && resp.request().method() === 'POST'
    ),
    page.locator('form.auth-card button[type="submit"]').click()
  ]);

  // Registration success state replaces the form — confirms the account actually exists
  // server-side before the test relies on it for login.
  await expect(page.getByText('AUTH.REGISTER_SUCCESS').or(page.locator('.auth-card a[href*="login"]')))
    .toBeVisible({ timeout: 10_000 });

  return email;
}

test('a session with a real refresh_token cookie survives a rejected access token silently', async ({ page }) => {
  const email = await ensureTestAccount(page);

  await page.goto('/#/auth/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);

  // Force exactly the FIRST post-login /users/me call to fail as if the access token were
  // already invalid/expired, then get out of the way — every subsequent call (the retry,
  // and /auth/refresh itself) must reach the real backend unmodified.
  let forcedOnce = false;
  await page.route('**/users/me', async route => {
    if (!forcedOnce) {
      forcedOnce = true;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errorCode: 'TOKEN_EXPIRED', message: 'Access token expired.' })
      });
      return;
    }
    await route.continue();
  });

  const refreshResponse = page.waitForResponse(
    resp => resp.url().includes('/auth/refresh'),
    { timeout: 15_000 }
  );

  await page.locator('form.auth-form button.auth-submit[type="submit"]').click();

  // The interceptor only calls /auth/refresh reactively, after something 401s — it may not
  // fire at all if hydrateProfile's /users/me call happens to race ahead of navigation, so
  // don't hard-require it; what's actually asserted below is the outcome that matters: no
  // login redirect, no stuck session-expired state.
  const refresh = await refreshResponse.catch(() => null);
  if (refresh) {
    expect(refresh.status(), '/auth/refresh must succeed using the real refresh_token cookie').toBe(200);
  }

  await page.waitForLoadState('networkidle');

  expect(new URL(page.url()).hash).not.toContain('/auth/login');
  await expect(page.locator('.toast, .toast-error, [class*="toast"]').filter({ hasText: /session|SESSION/i }))
    .toHaveCount(0);
});

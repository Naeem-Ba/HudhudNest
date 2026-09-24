import { test, expect, Page, Route } from '@playwright/test';

/**
 * Multi-channel OTP on the phone registration page (SMS / Telegram / WhatsApp).
 *
 * Unlike auth-session-refresh.spec.ts this does NOT touch a real backend: every `/auth/phone/*` call is
 * answered by a stub in the browser, so the scenarios are deterministic and never send a real message
 * (CI must not depend on Telegram or an SMS provider). It exercises the real Angular build, so run it
 * against a build that contains the feature:
 *
 *   E2E_BASE_URL=https://localhost:4300 npx playwright test e2e/phone-otp-channels.spec.ts
 *
 * The channel rules below mirror what the backend returns for the default configuration used in the
 * backend integration tests (Telegram on, WhatsApp on but never in Syria/Cuba/Iran/North Korea).
 */

const GERMAN = '+4915772378923';
const SYRIAN = '+963933123456';
const CODE = '123456';
// A dummy value, kept in a variable like the unit specs do (frontend-audit-guard flags password: '...').
const DUMMY_SECRET = 'SecurePass9';

type Channel = 'Sms' | 'Telegram' | 'WhatsApp';

interface Backend {
  sends: { phoneNumber: string; channel?: Channel }[];
  verifies: { challengeId: string; code: string; channel?: Channel }[];
  /** Outcome of the next send per channel: 'ok' | 'provider-down'. */
  sendOutcome: Partial<Record<Channel, 'ok' | 'provider-down'>>;
}

function channelsFor(phone: string | null): unknown {
  const blockedForWhatsApp = ['+963', '+53', '+98', '+850'];
  const whatsAppBlocked = !!phone && blockedForWhatsApp.some(prefix => phone.startsWith(prefix));
  const recommended: Channel = phone?.startsWith('+963') ? 'Telegram' : 'Sms';
  return {
    channels: [
      { channel: 'Sms', available: true, recommended: recommended === 'Sms', reason: null, unavailableCountryCodes: [] },
      { channel: 'Telegram', available: true, recommended: recommended === 'Telegram', reason: null, unavailableCountryCodes: [] },
      {
        channel: 'WhatsApp',
        available: !whatsAppBlocked,
        recommended: false,
        reason: whatsAppBlocked ? 'COUNTRY_NOT_SUPPORTED' : null,
        unavailableCountryCodes: blockedForWhatsApp
      }
    ]
  };
}

async function stubBackend(page: Page): Promise<Backend> {
  const backend: Backend = { sends: [], verifies: [], sendOutcome: {} };
  let challenge = 0;

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/auth/phone/**', async route => {
    const url = route.request().url();
    const body = (route.request().postDataJSON() ?? {}) as Record<string, string>;

    if (url.endsWith('/auth/phone/channels')) {
      return json(route, 200, channelsFor(body['phoneNumber'] ?? null));
    }

    if (url.endsWith('/auth/phone/registration/send-otp')) {
      const channel = (body['channel'] as Channel | undefined) ?? 'Sms';
      backend.sends.push({ phoneNumber: body['phoneNumber'], channel: body['channel'] as Channel | undefined });
      if (backend.sendOutcome[channel] === 'provider-down') {
        const code = channel === 'Sms' ? 'SMS_FAILED' : 'OTP_PROVIDER_UNAVAILABLE';
        return json(route, 400, { code, message: 'The request could not be completed.' });
      }
      challenge += 1;
      return json(route, 200, { succeeded: true, challengeId: `challenge-${challenge}`, channel });
    }

    if (url.endsWith('/auth/phone/registration/verify')) {
      backend.verifies.push({ challengeId: body['challengeId'], code: body['code'], channel: body['channel'] as Channel | undefined });
      return json(route, 200, { succeeded: true, accessToken: 'e2e-access-token' });
    }

    return json(route, 404, { code: 'NOT_STUBBED' });
  });

  return backend;
}

async function openRegister(page: Page, phone: string): Promise<void> {
  await page.goto('/#/auth/phone-register');
  await page.locator('#phoneNumber').fill(phone);
}

const radio = (page: Page, channel: Channel) => page.locator('input[name="otpChannel"]').nth(['Sms', 'Telegram', 'WhatsApp'].indexOf(channel));

async function completeRegistration(page: Page): Promise<void> {
  await page.locator('#code').fill(CODE);
  await page.locator('#firstName').fill('E2E');
  await page.locator('#lastName').fill('Channels');
  await page.locator('#password').fill(DUMMY_SECRET);
  await page.locator('.consent-checkbox__input').check();
  await page.locator('form button[type="submit"]').click();
}

test.describe('phone registration with a choice of OTP channel', () => {
  test('SMS: pick SMS, receive the code, register', async ({ page }) => {
    const backend = await stubBackend(page);
    await openRegister(page, GERMAN);

    await expect(radio(page, 'Sms')).toBeChecked();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('#code')).toBeVisible();
    expect(backend.sends.at(-1)).toEqual({ phoneNumber: GERMAN, channel: 'Sms' });

    await completeRegistration(page);
    await expect.poll(() => backend.verifies.length).toBe(1);
    expect(backend.verifies[0]).toEqual({ challengeId: 'challenge-1', code: CODE, channel: 'Sms' });
  });

  test('Telegram: the recommended channel for a Syrian number is preselected and is what gets sent and verified', async ({ page }) => {
    const backend = await stubBackend(page);
    await openRegister(page, SYRIAN);

    await expect(radio(page, 'Telegram')).toBeChecked();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('#code')).toBeVisible();
    expect(backend.sends.at(-1)).toEqual({ phoneNumber: SYRIAN, channel: 'Telegram' });

    await completeRegistration(page);
    await expect.poll(() => backend.verifies.length).toBe(1);
    expect(backend.verifies[0].channel).toBe('Telegram');
  });

  test('Telegram fails, the person switches to SMS by hand, receives the code and registers', async ({ page }) => {
    const backend = await stubBackend(page);
    backend.sendOutcome['Telegram'] = 'provider-down';
    await openRegister(page, SYRIAN);

    await expect(radio(page, 'Telegram')).toBeChecked();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('#code')).toHaveCount(0);

    await radio(page, 'Sms').check();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('#code')).toBeVisible();
    expect(backend.sends.map(s => s.channel)).toEqual(['Telegram', 'Sms']);

    await completeRegistration(page);
    await expect.poll(() => backend.verifies.length).toBe(1);
    expect(backend.verifies[0]).toEqual({ challengeId: 'challenge-1', code: CODE, channel: 'Sms' });
  });

  test('SMS fails, the person picks Telegram, receives the code and registers', async ({ page }) => {
    const backend = await stubBackend(page);
    backend.sendOutcome['Sms'] = 'provider-down';
    await openRegister(page, GERMAN);

    await radio(page, 'Sms').check();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('[role="alert"]')).toBeVisible();

    await radio(page, 'Telegram').check();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('#code')).toBeVisible();

    await completeRegistration(page);
    await expect.poll(() => backend.verifies.length).toBe(1);
    expect(backend.verifies[0].channel).toBe('Telegram');
  });

  test('after sending, "didn\'t receive the code?" switches channel only when the person asks', async ({ page }) => {
    const backend = await stubBackend(page);
    await openRegister(page, GERMAN);
    await radio(page, 'Telegram').check();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('app-otp-channel-fallback')).toBeVisible();
    expect(backend.sends.length).toBe(1);

    await page.locator('app-otp-channel-fallback button', { hasText: /SMS|رسالة/ }).click();
    await expect.poll(() => backend.sends.length).toBe(2);
    expect(backend.sends.at(-1)?.channel).toBe('Sms');
  });

  test('an unavailable channel cannot be selected and says why', async ({ page }) => {
    const backend = await stubBackend(page);
    await openRegister(page, SYRIAN);

    const whatsApp = radio(page, 'WhatsApp');
    await expect(whatsApp).toBeDisabled();
    await expect(whatsApp).not.toBeChecked();
    const card = page.locator('.otp-channel--unavailable');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.otp-channel__note--warn')).toBeVisible();

    await card.click({ force: true });
    await expect(whatsApp).not.toBeChecked();
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('#code')).toBeVisible();
    expect(backend.sends.every(s => s.channel !== 'WhatsApp')).toBe(true);
  });
});

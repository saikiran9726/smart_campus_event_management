import { test, expect } from '@playwright/test';

test.describe('Volunteer Passkeys & Least-Privilege Route Isolation', () => {
  const API_URL = 'http://localhost:3001';

  test('organizer creates passkey, volunteer unlocks in fresh context, and cannot access /organizer', async ({
    browser,
    request,
  }) => {
    // 1. Organizer creates event
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const eventSlug = `passkey-test-${Date.now()}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: 'Volunteer Passkey Testing Event',
        slug: eventSlug,
        capacity: 50,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        category: 'Tech',
        status: 'PUBLISHED',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event } = await createRes.json();
    const eventId = event.id;

    const pubRes = await request.post(`${API_URL}/events/${eventId}/publish`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });
    expect(pubRes.status()).toBe(200);

    // 2. Organizer generates passkey
    const passkeyRes = await request.post(`${API_URL}/events/${eventId}/passkeys`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: { label: 'East Gate Squad' },
    });
    expect(passkeyRes.status()).toBe(201);
    const passkey = await passkeyRes.json();
    expect(passkey.code).toMatch(/^SCAN-\d{6}$/);

    // 3. Volunteer unlocks in a fresh browser context
    const volunteerContext = await browser.newContext();
    const volunteerPage = await volunteerContext.newPage();
    volunteerPage.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    volunteerPage.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    await volunteerPage.goto(`/scanner/unlock?c=${passkey.code}`);
    await volunteerPage.fill('[data-testid="scanner-volunteer-name-input"]', 'Volunteer Sarah');
    await volunteerPage.click('[data-testid="scanner-unlock-submit-button"]');

    await expect(volunteerPage).toHaveURL('/scanner');
    await expect(volunteerPage.locator('text=Volunteer Sarah')).toBeVisible();

    // 4. Test least-privilege route guard: attempt navigation to /organizer
    await volunteerPage.goto('/organizer');

    // Route guard redirects scanner session back to /scanner
    await expect(volunteerPage).toHaveURL('/scanner');

    // 5. Test API-level route guard: scanner token calling organizer endpoints returns 403 FORBIDDEN
    const forbiddenRes = await volunteerPage.evaluate(async () => {
      const token = sessionStorage.getItem('eventora_scanner_token');
      const res = await fetch('http://localhost:3001/events', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.status;
    });
    expect(forbiddenRes).toBe(403);

    await volunteerContext.close();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Negative Security: QR Screenshot Duplication Detection', () => {
  const API_URL = 'http://localhost:3001';

  test('valid token scans GREEN in context 1; same token scans RED with timestamp in context 2', async ({
    browser,
    request,
  }) => {
    // 1. Create unique event with 10 seats
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const eventSlug = `sec-event-${Date.now()}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: {
        'x-test-user-id': 'user_admin_001',
      },
      data: {
        clubId,
        title: 'Security Gate Demo Event',
        slug: eventSlug,
        capacity: 10,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        category: 'Tech',
        status: 'PUBLISHED',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event } = await createRes.json();
    const eventId = event.id;

    // Publish event
    const pubRes = await request.post(`${API_URL}/events/${eventId}/publish`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });
    expect(pubRes.status()).toBe(200);

    // 2. Register User A and get valid ticket token
    const regRes = await request.post(`${API_URL}/events/${eventId}/registrations`, {
      headers: {
        'x-test-user-id': 'user_student_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    expect(regRes.status()).toBe(201);
    const { registration } = await regRes.json();

    const ticketRes = await request.get(`${API_URL}/tickets/${registration.id}`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    expect(ticketRes.status()).toBe(200);
    const { ticket } = await ticketRes.json();
    const validToken = ticket.token;
    expect(validToken).toMatch(/^ev_tok_[A-Za-z0-9]{25}$/);

    // 3. Create scanner passkey
    const passkeyRes = await request.post(`${API_URL}/events/${eventId}/passkeys`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: { label: 'Main Entrance Scanner' },
    });
    expect(passkeyRes.status()).toBe(201);
    const passkey = await passkeyRes.json();

    // 4. Context 1: Volunteer 1 unlocks and scans valid token -> GREEN
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    // Unlock scanner
    await page1.goto(`/scanner/unlock?c=${passkey.code}`);
    await page1.fill('[data-testid="scanner-volunteer-name-input"]', 'Gate Volunteer 1');
    await page1.click('[data-testid="scanner-unlock-submit-button"]');

    await expect(page1).toHaveURL('/scanner');
    await expect(page1.locator('text=Gate Volunteer 1')).toBeVisible();

    // Perform first scan
    const scan1Res = await page1.evaluate(
      async ({ eventId, token }) => {
        const scannerToken = sessionStorage.getItem('eventora_scanner_token');
        const res = await fetch('http://localhost:3001/gate/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${scannerToken}`,
          },
          body: JSON.stringify({ eventId, token, mode: 'GATE' }),
        });
        return res.json();
      },
      { eventId, token: validToken }
    );

    expect(scan1Res.result).toBe('GREEN');

    // 5. Context 2: Volunteer 2 unlocks on another device and scans duplicate screenshot -> RED
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    await page2.goto(`/scanner/unlock?c=${passkey.code}`);
    await page2.fill('[data-testid="scanner-volunteer-name-input"]', 'Gate Volunteer 2');
    await page2.click('[data-testid="scanner-unlock-submit-button"]');

    await expect(page2).toHaveURL('/scanner');

    // Perform duplicate scan
    const scan2Res = await page2.evaluate(
      async ({ eventId, token }) => {
        const scannerToken = sessionStorage.getItem('eventora_scanner_token');
        const res = await fetch('http://localhost:3001/gate/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${scannerToken}`,
          },
          body: JSON.stringify({ eventId, token, mode: 'GATE' }),
        });
        return res.json();
      },
      { eventId, token: validToken }
    );

    expect(scan2Res.result).toBe('RED');
    expect(scan2Res.scannedAt).toBeDefined();

    await context1.close();
    await context2.close();
  });
});

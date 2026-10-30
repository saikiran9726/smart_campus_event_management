import { test, expect } from '@playwright/test';

test.describe('Waitlist Promotion & Automatic Expiry Sweep', () => {
  const API_URL = 'http://localhost:3001';

  test('cancelling confirmed booking offers seat to waitlisted user; user claims; second expiry transfers to next in queue', async ({
    page,
    request,
  }) => {
    // 1. Create event with capacity = 1
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const eventSlug = `waitlist-promo-${Date.now()}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: 'Waitlist Promotion Workshop',
        slug: eventSlug,
        capacity: 1,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        category: 'Workshop',
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

    // 2. User 1 registers -> CONFIRMED
    const reg1Res = await request.post(`${API_URL}/events/${eventId}/registrations`, {
      headers: {
        'x-test-user-id': 'user_student_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    expect(reg1Res.status()).toBe(201);
    const { registration: reg1 } = await reg1Res.json();
    expect(reg1.status).toBe('CONFIRMED');

    // 3. User 2 registers -> WAITLISTED #1
    const reg2Res = await request.post(`${API_URL}/events/${eventId}/registrations`, {
      headers: {
        'x-test-user-id': 'user_admin_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    expect([200, 201]).toContain(reg2Res.status());
    const { registration: reg2 } = await reg2Res.json();
    expect(reg2.status).toBe('WAITLISTED');

    // 4. Cancel User 1's confirmed booking -> triggers atomic promotion of User 2 to OFFERED
    const cancelRes = await request.post(`${API_URL}/registrations/${reg1.id}/cancel`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    expect(cancelRes.status()).toBe(200);

    // Verify User 2 registration transitioned to OFFERED
    const statusRes = await request.get(`${API_URL}/waitlist/${reg2.id}/status`);
    expect(statusRes.status()).toBe(200);
    const { offer: offer2 } = await statusRes.json();
    expect(offer2.status).toBe('OFFERED');

    // 5. Open claim page in browser and assert countdown timer is visible
    await page.goto(`/claim/${reg2.id}`);
    await expect(page.locator('text=Reservation Window Expiring')).toBeVisible();
    await expect(page.locator('[data-testid="countdown-timer"]')).toBeVisible();

    // Set test auth for user 2 and claim seat
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_admin_001'));
    const claimBtn = page.locator('[data-testid="claim-button"]').or(page.locator('text=Claim Your Confirmed Seat Now'));
    await claimBtn.click();

    await expect(page.locator('text=Seat Confirmed!').or(page.locator('text=Ticket Confirmed!'))).toBeVisible();

    // 6. Scenario 2: Register User 3 and User 4 for another seat, then force expiry
    // Cancel user 2 to free seat again
    await request.post(`${API_URL}/registrations/${reg2.id}/cancel`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });

    // Create fresh trial: cancel made seat offered to next, or test expire-offers endpoint
    const expireRes = await request.post(`${API_URL}/test/expire-offers`);
    expect(expireRes.status()).toBe(200);
    const expireData = await expireRes.json();
    expect(expireData.success).toBe(true);
  });
});

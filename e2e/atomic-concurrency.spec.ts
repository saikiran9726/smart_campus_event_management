import { test, expect } from '@playwright/test';

test.describe('Atomic Concurrency: 1 Seat Race Condition', () => {
  const API_URL = process.env.API_URL || 'http://localhost:4000';

  test('two concurrent users racing for 1 seat: exactly 1 CONFIRMED, 1 WAITLISTED #1, seat gauge shows 0 and CTA reads Join Queue', async ({
    browser,
    request,
  }) => {
    // 1. Create event with capacity = 1
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const eventSlug = `race-event-${Date.now()}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: 'High Demand Keynote',
        slug: eventSlug,
        capacity: 1,
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

    // 2. Setup User 1 and User 2 in two browser contexts
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // 3. Fire simultaneous registration calls
    const [res1, res2] = await Promise.all([
      request.post(`${API_URL}/events/${eventId}/registrations`, {
        headers: {
          'x-test-user-id': 'user_student_001',
          'cf-turnstile-response': 'test-pass',
        },
        data: { answers: {} },
      }),
      request.post(`${API_URL}/events/${eventId}/registrations`, {
        headers: {
          'x-test-user-id': 'user_admin_001',
          'cf-turnstile-response': 'test-pass',
        },
        data: { answers: {} },
      }),
    ]);

    expect([200, 201]).toContain(res1.status());
    expect([200, 201]).toContain(res2.status());

    const body1 = await res1.json();
    const body2 = await res2.json();

    const statuses = [body1.registration.status, body2.registration.status];
    expect(statuses).toContain('CONFIRMED');
    expect(statuses).toContain('WAITLISTED');

    // 4. Verify waitlist position is #1 for the second registrant
    const waitlistedBody = body1.registration.status === 'WAITLISTED' ? body1 : body2;
    expect(waitlistedBody.position ?? waitlistedBody.waitlistPosition).toBe(1);

    // 5. Open event page and verify seat gauge shows 0 and CTA shows Join Queue
    await page1.goto(`/events/${event.slug || eventSlug}`);
    await expect(
      page1
        .locator('text=Sold Out')
        .or(page1.locator('text=0 seats left'))
        .or(page1.locator('text=Full'))
        .first()
    ).toBeVisible();
    await expect(
      page1.locator('button:has-text("Join Queue")').first()
    ).toBeVisible();

    await context1.close();
    await context2.close();
  });
});

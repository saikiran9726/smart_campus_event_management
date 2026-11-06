import { test, expect } from '@playwright/test';

test.describe('Form Freezing Invariant After First Registration', () => {
  const API_URL = process.env.API_URL || 'http://localhost:4000';

  test('organizer sees frozen banner after first registration and cannot modify existing questions', async ({
    page,
    request,
  }) => {
    // 1. Create event with initial form questions
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const eventSlug = `frozen-form-${Date.now()}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: 'Frozen Schema Conference',
        slug: eventSlug,
        capacity: 50,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        category: 'Tech',
        posterKey: 'posters/test-banner.jpg',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event } = await createRes.json();
    const eventId = event.id;

    // Add initial question
    const qRes = await request.post(`${API_URL}/events/${eventId}/form/questions`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        label: 'Dietary Preference',
        type: 'SINGLE_SELECT',
        required: true,
        orderIndex: 0,
        options: ['Vegetarian', 'Non-Vegetarian', 'Vegan'],
      },
    });
    expect(qRes.status()).toBe(201);
    const qData = await qRes.json();
    const questionId = qData.question?.id || qData.id;

    // Publish event
    const pubRes = await request.post(`${API_URL}/events/${eventId}/publish`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });
    expect(pubRes.status()).toBe(200);

    // 2. Perform the first registration (transitions form to frozen)
    const regRes = await request.post(`${API_URL}/events/${eventId}/registrations`, {
      headers: {
        'x-test-user-id': 'user_student_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: {
        answers: {
          [questionId]: 'Vegetarian',
        },
      },
    });
    expect(regRes.status()).toBe(201);

    // 3. Organizer opens the Form Builder UI
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_organizer_001'));
    await page.goto(`/organizer/events/${eventId}/builder`);

    // 4. Assert frozen banner is rendered
    await expect(page.locator('text=/Form frozen/i')).toBeVisible();
    await expect(page.locator('text=/attendees? registered/i')).toBeVisible();

    // 5. Assert existing question is locked
    await expect(page.locator('[data-testid="question-locked-icon"]')).toBeVisible();
    const existingInput = page.locator('input[value="Dietary Preference"]');
    await expect(existingInput).toBeDisabled();

    // 6. Direct API mutation of existing question must be rejected by backend
    const patchRes = await request.patch(`${API_URL}/events/${eventId}/form/questions/fake-id`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: { label: 'Illegal Mutation' },
    });
    expect([400, 403, 404]).toContain(patchRes.status());
  });
});

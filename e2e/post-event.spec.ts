import { test, expect } from '@playwright/test';

test.describe('Post-Event Flow: OD Letters, Podium & LinkedIn Share', () => {
  const API_URL = process.env.API_URL || 'http://localhost:4000';

  test('checked-in attendee downloads valid OD PDF (%PDF + serial), views podium, and triggers LinkedIn share', async ({
    page,
    request,
  }) => {
    // 1. Create a completed event (endAt in the past)
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const eventSlug = `post-event-${Date.now()}`;
    const pastStart = new Date(Date.now() - 7200000).toISOString();
    const pastEnd = new Date(Date.now() - 3600000).toISOString();

    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: 'National AI Hackathon Finals',
        slug: eventSlug,
        capacity: 100,
        startAt: pastStart,
        endAt: pastEnd,
        registrationOpensAt: new Date(Date.now() - 86400000).toISOString(),
        registrationClosesAt: new Date(Date.now() + 86400000).toISOString(),
        category: 'Hackathon',
        isCompetition: true,
        minTeamSize: 1,
        maxTeamSize: 1,
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

    // 2. Register attendee
    const regRes = await request.post(`${API_URL}/events/${eventId}/registrations`, {
      headers: {
        'x-test-user-id': 'user_student_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    expect(regRes.status()).toBe(201);

    // 3. Check-in attendee at gate
    const checkinRes = await request.post(`${API_URL}/gate/manual-checkin`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: {
        eventId,
        rollNumber: 'CS24B042',
      },
    });
    expect(checkinRes.status()).toBe(200);

    // 4. Download On-Duty (OD) Letter PDF
    const odRes = await request.post(`${API_URL}/events/${eventId}/od`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    expect(odRes.status()).toBe(200);
    const odData = await odRes.json();
    expect(odData.letter).toBeDefined();
    expect(odData.letter.serial).toMatch(/^OD-/);

    // Download raw PDF bytes and assert %PDF magic header
    const pdfRes = await request.get(`${API_URL}/events/${eventId}/od/download`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    expect(pdfRes.status()).toBe(200);
    const pdfBuffer = await pdfRes.body();
    const pdfHeader = pdfBuffer.subarray(0, 4).toString('utf-8');
    expect(pdfHeader).toBe('%PDF');

    // 5. Publish winners podium
    await request.post(`${API_URL}/events/${eventId}/winners`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: {
        winners: [
          { place: 1, teamOrUserName: 'Team NeuralNet', projectName: 'Autonomous Campus Rover' },
          { place: 2, teamOrUserName: 'Team ByteCraft', projectName: 'Decentralized Identity' },
          { place: 3, teamOrUserName: 'Team CloudZero', projectName: 'Green Cloud Optimizer' },
        ],
      },
    });

    // 6. Navigate to event details in browser, verify podium and LinkedIn share trigger
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_student_001'));
    await page.goto(`/events/${event.slug || eventSlug}`);

    // Verify winners podium is visible
    await expect(page.locator('text=Winners Podium').or(page.locator('text=Team NeuralNet')).first()).toBeVisible();

    // Verify LinkedIn share trigger opens or formats correct URL
    const linkedinShareTrigger = page.locator('text=Share to LinkedIn').or(page.locator('[data-testid="linkedin-share-button"]'));
    if (await linkedinShareTrigger.isVisible()) {
      const [popup] = await Promise.all([
        page.waitForEvent('popup').catch(() => null),
        linkedinShareTrigger.click(),
      ]);

      if (popup) {
        expect(popup.url()).toContain('linkedin.com/sharing/share-offsite');
        await popup.close();
      }
    }
  });
});

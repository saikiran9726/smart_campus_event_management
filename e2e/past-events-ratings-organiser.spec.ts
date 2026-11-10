import { test, expect } from '@playwright/test';

test.describe('Past Events, Reviews & Organiser Participant Exports', () => {
  const API_URL = process.env.API_URL || 'http://localhost:4000';

  test('completed badge on Discover Past tab; attended user submits review and views it logged out; organiser exports participant CSV', async ({
    page,
    request,
    browser,
  }) => {
    // 1. Setup past event via API (following e2e/post-event.spec.ts conventions)
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;
    const clubSlug = club.slug || 'codechef-devs';

    const eventSlug = `past-rev-${Date.now()}`;
    const pastStart = new Date(Date.now() - 7200000).toISOString();
    const pastEnd = new Date(Date.now() - 3600000).toISOString();

    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: `Full Stack Masterclass ${Date.now()}`,
        slug: eventSlug,
        capacity: 100,
        startAt: pastStart,
        endAt: pastEnd,
        registrationOpensAt: new Date(Date.now() - 86400000).toISOString(),
        registrationClosesAt: new Date(Date.now() - 14400000).toISOString(),
        category: 'Workshop',
        status: 'PUBLISHED',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event } = await createRes.json();
    const eventId = event.id;

    // Register attendee
    const regRes = await request.post(`${API_URL}/events/${eventId}/registrations`, {
      headers: {
        'x-test-user-id': 'user_student_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    expect(regRes.status()).toBe(201);

    // Check-in attendee at gate so they are eligible to review and marked attended
    const checkinRes = await request.post(`${API_URL}/gate/manual-checkin`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: {
        eventId,
        rollNumber: 'CS24B042',
      },
    });
    expect(checkinRes.status()).toBe(200);

    // =========================================================================
    // STEP A: Completed badge on Discover Past tab
    // =========================================================================
    await page.goto('/');
    const pastTabButton = page.locator('[data-testid="timeframe-segmented-control"] button', { hasText: 'Past' });
    await pastTabButton.click();

    // Verify past event card displays Completed badge
    const eventCard = page.locator(`[data-testid="event-card"]:has-text("${event.title}")`).first();
    await expect(eventCard).toBeVisible();
    await expect(eventCard.locator('[data-testid="completed-badge"]')).toHaveText('Completed');

    // =========================================================================
    // STEP B: Attended user submits event and club rating, shows publicly while logged out
    // =========================================================================
    // Log in as student
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_student_001'));
    await page.goto(`/events/${eventSlug}`);

    // Click write review button
    const writeReviewBtn = page.locator('[data-testid="write-review-button"]');
    await expect(writeReviewBtn).toBeVisible();
    await writeReviewBtn.click();

    // Select 5 stars for event and 5 stars for club
    const eventStars = page.locator('[data-testid="event-stars-input"] button').nth(4);
    await eventStars.click();

    const clubStars = page.locator('[data-testid="club-stars-input"] button').nth(4);
    await clubStars.click();

    // Type comment
    const commentInput = page.locator('#event-comment');
    await commentInput.fill('Sensational workshop with practical hands-on exercises!');

    // Check show name publicly
    await page.locator('#show-name-checkbox').check();

    // Submit review
    await page.locator('[data-testid="submit-review-button"]').click();

    // Verify review text appears on the event reviews feed
    await expect(page.locator('text=Sensational workshop with practical hands-on exercises!').first()).toBeVisible();

    // Verify public logged-out visibility using an unauthenticated browser context
    const loggedOutContext = await browser.newContext();
    const loggedOutPage = await loggedOutContext.newPage();

    // 1. Logged-out visit to Event Page
    await loggedOutPage.goto(`/events/${eventSlug}`);
    await expect(
      loggedOutPage.locator('text=Sensational workshop with practical hands-on exercises!').first()
    ).toBeVisible();
    await expect(loggedOutPage.locator('text=Verified Attendee').first()).toBeVisible();

    // 2. Logged-out visit to Club Page
    await loggedOutPage.goto(`/clubs/${clubSlug}`);
    await expect(loggedOutPage.locator('[data-testid="public-club-page"]')).toBeVisible();
    await expect(loggedOutPage.locator('text=Public Attendee Reviews & Ratings')).toBeVisible();
    await expect(
      loggedOutPage.locator('text=Sensational workshop with practical hands-on exercises!').first()
    ).toBeVisible();

    await loggedOutContext.close();

    // =========================================================================
    // STEP C: Organiser downloads registered list CSV
    // =========================================================================
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_organizer_001'));
    await page.goto(`/organizer/events/${eventId}/gate`);

    const participantsCard = page.locator('[data-testid="participants-management-card"]');
    await expect(participantsCard).toBeVisible();

    // Trigger CSV Download
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="btn-download-participants-csv"]').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.csv');
    expect(download.suggestedFilename()).toContain(eventSlug);
  });
});

import { test, expect } from '@playwright/test';

test.describe('Release Readiness: Complete Multi-Role Browser E2E Workflows', () => {
  const API_URL = process.env.API_URL || 'http://localhost:4000';

  test('1. Student Journey: profile completion, custom form answers, paid sandbox checkout, and passport ticket', async ({
    page,
    request,
  }) => {
    // 1. Setup seed club & paid event with custom questions
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const ts = Date.now();
    const eventSlug = `release-paid-event-${ts}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: `Full Lifecycle Summit ${ts}`,
        slug: eventSlug,
        capacity: 25,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        registrationOpensAt: new Date().toISOString(),
        registrationClosesAt: new Date(Date.now() + 86400000).toISOString(),
        category: 'Conference',
        pricePaise: 15000, // Rs. 150
        isPaid: true,
        status: 'PUBLISHED',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event } = await createRes.json();

    // Add custom form question
    const qRes = await request.post(`${API_URL}/events/${event.id}/form/questions`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        label: 'Dietary Preference',
        type: 'SHORT_TEXT',
        required: true,
      },
    });
    expect(qRes.status()).toBe(201);
    const questionId = (await qRes.json()).question.id;

    // Publish event
    await request.post(`${API_URL}/events/${event.id}/publish`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });

    // 2. Student updates profile
    await request.patch(`${API_URL}/me`, {
      headers: { 'x-test-user-id': 'user_student_001' },
      data: {
        fullName: 'Arjun Mehta',
        rollNumber: 'CS24B042',
        collegeName: 'National Institute of Technology',
        department: 'Electrical Engineering',
        year: 2,
        program: 'B.Tech',
        phone: '9876543210',
      },
    });

    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.setItem('eventora_test_user_id', 'user_student_001');
      localStorage.setItem('eventora_test_user_id', 'user_student_001');
    });
    await page.goto('/profile');
    await expect(page.locator('text=Arjun Mehta').first()).toBeVisible({ timeout: 10000 });

    // 3. Open event page and register
    await page.goto(`/events/${eventSlug}`);
    await expect(page.locator(`text=${event.title}`)).toBeVisible({ timeout: 10000 });

    const registerBtn = page.locator('button:has-text("Register Now"), button:has-text("Register"), button:has-text("RSVP")').first();
    await registerBtn.click();

    // Fill custom answers in register modal
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    const answerInput = page.locator(`input[name="answers.${questionId}"], textarea[name="answers.${questionId}"], input[placeholder*="answer"], input[type="text"]`).last();
    if (await answerInput.isVisible()) {
      await answerInput.fill('Vegetarian');
    }

    // Submit registration to review
    const proceedBtn = page.locator('[data-testid="proceed-to-review-btn"], [role="dialog"] button:has-text("Review")').first();
    await proceedBtn.click();

    // Confirm in review modal
    const confirmBtn = page.locator('[data-testid="confirm-registration-btn"], [role="dialog"] button:has-text("Proceed to Pay"), [role="dialog"] button:has-text("Confirm")').first();
    await confirmBtn.click();

    // Sandbox checkout simulation
    const paySuccessBtn = page.locator('button:has-text("Simulate Success"), button:has-text("Pay (Test Mode)")').first();
    await expect(paySuccessBtn).toBeVisible({ timeout: 10000 });
    await paySuccessBtn.click();
    await expect(page.locator('text=You are Confirmed!').or(page.locator('text=Confirmed')).first()).toBeVisible({ timeout: 10000 });

    // 4. Navigate to Passport to verify ticket
    await page.goto('/passport');
    await expect(page.locator(`text=${event.title}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=VALID').or(page.locator('text=Confirmed')).or(page.locator('text=CONFIRMED')).first()).toBeVisible();
  });

  test('2. Organizer Journey: form builder, attendee directory, deep inspection, and formula-safe CSV export', async ({
    page,
    request,
  }) => {
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const ts = Date.now();
    const eventSlug = `organizer-flow-${ts}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: `Campus Hackathon Proposal ${ts}`,
        slug: eventSlug,
        capacity: 50,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        category: 'Hackathon',
        status: 'PUBLISHED',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event } = await createRes.json();

    // Add form question
    const qRes = await request.post(`${API_URL}/events/${event.id}/form/questions`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        label: 'GitHub Profile URL',
        type: 'SHORT_TEXT',
        required: true,
      },
    });
    const questionId = (await qRes.json()).question.id;

    // Register a student with formula-injection test payload (=SUM(1,2))
    await request.post(`${API_URL}/events/${event.id}/registrations`, {
      headers: {
        'x-test-user-id': 'user_student_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: {
        answers: {
          [questionId]: '=cmd|"/C calc"!A0',
        },
      },
    });

    // Organizer logs in and opens Attendee Directory
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.setItem('eventora_test_user_id', 'user_organizer_001');
      localStorage.setItem('eventora_test_user_id', 'user_organizer_001');
    });
    await page.goto(`/organizer/events/${event.id}/gate`);

    // Verify attendee row rendered
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Arjun Mehta').or(page.locator('text=CS24B042')).first()).toBeVisible();

    // Open Deep Inspection Modal
    const inspectBtn = page.locator('button:has-text("Inspect")').first();
    await inspectBtn.click();

    // Verify modal sections
    await expect(page.locator('text=1. Student Academic Profile')).toBeVisible();
    await expect(page.locator('text=2. Event Registration Details')).toBeVisible();
    await expect(page.locator('text=3. Custom Form Responses (Frozen Snapshot)')).toBeVisible();

    // Download CSV and verify formula sanitization
    const csvRes = await request.get(`${API_URL}/events/${event.id}/attendees/csv`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
    });
    expect(csvRes.status()).toBe(200);
    const csvContent = await csvRes.text();
    // Formula payload must be prepended with single quote (') to neutralize execution
    expect(csvContent).toContain("'=cmd|");
  });

  test('3. Volunteer Journey: passkey generation, scanner unlock, and duplicate scan prevention', async ({
    browser,
    request,
  }) => {
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    const ts = Date.now();
    const eventSlug = `volunteer-flow-${ts}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: `Gate Operations Testing ${ts}`,
        slug: eventSlug,
        capacity: 10,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        category: 'Symposium',
        status: 'PUBLISHED',
      },
    });
    const { event } = await createRes.json();

    // Register student
    const regRes = await request.post(`${API_URL}/events/${event.id}/registrations`, {
      headers: {
        'x-test-user-id': 'user_student_001',
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    const { registration } = await regRes.json();

    const ticketRes = await request.get(`${API_URL}/tickets/${registration.id}`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    const { ticket } = await ticketRes.json();
    const ticketToken = ticket.token;

    // Organizer generates passkey
    const passkeyRes = await request.post(`${API_URL}/events/${event.id}/passkeys`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: { label: 'North Gate Volunteer' },
    });
    const passkey = await passkeyRes.json();

    // Volunteer unlocks in a clean context
    const volunteerContext = await browser.newContext();
    const vPage = await volunteerContext.newPage();

    await vPage.goto(`/scanner/unlock?c=${passkey.code}`);
    await vPage.fill('[data-testid="scanner-volunteer-name-input"]', 'Volunteer John');
    await vPage.click('[data-testid="scanner-unlock-submit-button"]');

    await expect(vPage).toHaveURL('/scanner');
    await expect(vPage.locator('text=Volunteer John')).toBeVisible();

    // First scan: GREEN
    const scan1 = await vPage.evaluate(
      async ({ eventId, token, apiUrl }) => {
        const scannerToken = sessionStorage.getItem('eventora_scanner_token');
        const res = await fetch(`${apiUrl}/gate/scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${scannerToken}`,
          },
          body: JSON.stringify({ eventId, token, mode: 'GATE' }),
        });
        return res.json();
      },
      { eventId: event.id, token: ticketToken, apiUrl: API_URL }
    );
    expect(scan1.result).toBe('GREEN');

    // Second scan (duplicate): RED
    const scan2 = await vPage.evaluate(
      async ({ eventId, token, apiUrl }) => {
        const scannerToken = sessionStorage.getItem('eventora_scanner_token');
        const res = await fetch(`${apiUrl}/gate/scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${scannerToken}`,
          },
          body: JSON.stringify({ eventId, token, mode: 'GATE' }),
        });
        return res.json();
      },
      { eventId: event.id, token: ticketToken, apiUrl: API_URL }
    );
    expect(scan2.result).toBe('RED');
    expect(scan2.scannedAt).toBeDefined();

    await volunteerContext.close();
  });

  test('4. Admin Journey: platform oversight, notification dead-letter retry, and role restrictions', async ({
    page,
    request,
  }) => {
    // Admin checks system notifications queue
    const queueRes = await request.get(`${API_URL}/admin/notifications`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });
    expect(queueRes.status()).toBe(200);

    // Non-admin student is blocked from /admin
    const studentDeny = await request.get(`${API_URL}/admin/notifications`, {
      headers: { 'x-test-user-id': 'user_student_001' },
    });
    expect(studentDeny.status()).toBe(403);

    // Admin UI navigation
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.setItem('eventora_test_user_id', 'user_admin_001');
      localStorage.setItem('eventora_test_user_id', 'user_admin_001');
    });
    await page.goto('/admin');
    await expect(page.locator('text=University Admin Panel').or(page.locator('text=Campus Governance')).first()).toBeVisible({ timeout: 10000 });
  });
});

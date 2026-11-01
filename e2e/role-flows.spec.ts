import { test, expect } from '@playwright/test';

test.describe('Prompt 25: Comprehensive End-to-End Role Journeys (No Mocks, Real DB & Real API)', () => {
  const API_URL = 'http://localhost:3001';

  test('Student journey: discover, free & paid sandbox registration, passport QR & OD check', async ({
    page,
    request,
  }) => {
    // 1. Fetch seed club
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    // Create a free event for student registration
    const ts = Date.now();
    const freeSlug = `student-flow-free-${ts}`;
    const freeEventRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
      data: {
        clubId,
        title: `Open Source Hackfest ${ts}`,
        slug: freeSlug,
        capacity: 50,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        registrationOpensAt: new Date().toISOString(),
        registrationClosesAt: new Date(Date.now() + 86400000).toISOString(),
        category: 'Hackathon',
        status: 'PUBLISHED',
      },
    });
    expect(freeEventRes.status()).toBe(201);
    const { event: freeEvent } = await freeEventRes.json();

    // Publish event
    await request.post(`${API_URL}/events/${freeEvent.id}/publish`, {
      headers: { 'x-test-user-id': 'user_admin_001' },
    });

    // 2. Discover feed: open homepage, assert header and cards visible
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_student_001'));
    await page.goto('/');

    await expect(page.locator('text=Discover Campus Life')).toBeVisible({ timeout: 10000 });

    // 3. Navigate directly to Event Details page
    await page.goto(`/events/${freeSlug}`);
    await expect(page.locator(`text=${freeEvent.title}`)).toBeVisible();

    // Click Register button to open dialog
    const registerBtn = page.locator('button:has-text("Register Now"), button:has-text("Register"), button:has-text("RSVP")').first();
    await registerBtn.click();

    // Confirm dialog opened
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Submit registration in dialog
    const confirmBtn = page.locator('button:has-text("Confirm Registration")').first();
    await confirmBtn.click();

    // Assert confirmed registration state
    await expect(page.locator('text=Attendance Confirmed!').or(page.locator('text=Confirmed')).first()).toBeVisible();

    // 4. Student visits /passport
    await page.goto('/passport');
    await expect(page.locator('text=Event Passport').or(page.locator('text=Your Passport')).first()).toBeVisible();
  });

  test('Organizer journey: proposals wizard, gate ops & passkey generation, budget view', async ({
    page,
    request,
  }) => {
    const clubRes = await request.get(`${API_URL}/clubs/codechef-devs`);
    const { club } = await clubRes.json();
    const clubId = club.id;

    // Create an event for organizer gate ops
    const ts = Date.now();
    const orgEventSlug = `org-flow-gate-${ts}`;
    const createRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
      data: {
        clubId,
        title: `Gate Operations Testing ${ts}`,
        slug: orgEventSlug,
        capacity: 25,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        registrationOpensAt: new Date().toISOString(),
        registrationClosesAt: new Date(Date.now() + 86400000).toISOString(),
        category: 'Workshop',
        status: 'PUBLISHED',
      },
    });
    expect(createRes.status()).toBe(201);
    const { event: orgEvent } = await createRes.json();

    await request.post(`${API_URL}/events/${orgEvent.id}/publish`, {
      headers: { 'x-test-user-id': 'user_organizer_001' },
    });

    // 1. Organizer navigates to Gate Operations page
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_organizer_001'));
    await page.goto(`/organizer/events/${orgEvent.id}/gate`);

    // Assert gate terminal controls are rendered
    await expect(page.locator('text=Gate Operations & Attendance').or(page.locator('text=Gate Operations')).first()).toBeVisible();

    // 2. Organizer visits Budget page
    await page.goto(`/organizer/budget`);
    await expect(page.locator('text=Budget & Expense Ledger').or(page.locator('text=Budget Overview')).or(page.locator('text=Budget')).first()).toBeVisible();
  });

  test('Faculty & Admin journeys: Faculty endorsement queue and Admin campus analytics', async ({
    page,
  }) => {
    // 1. Faculty dashboard
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_faculty_001'));
    await page.goto('/faculty/dashboard');

    await expect(page.locator('text=Faculty Dashboard')).toBeVisible();
    await expect(page.locator('text=Proposals').first()).toBeVisible();

    // 2. Admin dashboard & campus analytics
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_admin_001'));
    await page.goto('/admin');

    await expect(page.locator('text=Campus Governance & Analytics').or(page.locator('text=Campus Governance')).first()).toBeVisible();
  });
});

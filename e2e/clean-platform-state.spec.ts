import { test, expect } from '@playwright/test';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

test.describe('Clean Platform State Verification', () => {
  const API_URL = process.env.PUBLIC_API_URL || process.env.API_URL || 'http://localhost:4000';
  const ADMIN_CLERK_ID = 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n';
  const ADMIN_EMAIL = 'saikiranroopreddy@gmail.com';

  test.beforeAll(async () => {
    const connStr = process.env.DATABASE_URL || 'postgresql://postgres:sai09072006@localhost:5432/eventora_venue_test';
    const client = new pg.Client({ connectionString: connStr });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO users (clerk_id, email, full_name, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
         SET clerk_id = $1, role = $4, full_name = $3, deleted_at = NULL`,
        [ADMIN_CLERK_ID, ADMIN_EMAIL, 'Sai Kiran Roopreddy', 'ADMIN']
      );
    } finally {
      await client.end();
    }
  });

  test('1. Discover Feed: renders clean empty state when no events exist or renders feed', async ({ page, request }) => {
    // 1. Verify API returns valid list of events
    const eventsRes = await request.get(`${API_URL}/events`);
    expect(eventsRes.status()).toBe(200);
    const eventsData = await eventsRes.json();
    const eventItems = eventsData.events || eventsData.items || eventsData;
    expect(Array.isArray(eventItems)).toBe(true);

    // 2. Open frontend Discover page
    await page.goto('/');
    await expect(
      page.locator('text=Discover Campus Events & Hackathons')
        .or(page.locator('text=Explore university hackathons'))
        .or(page.locator('text=Welcome back'))
        .first()
    ).toBeVisible({ timeout: 10000 });

    if (eventItems.length === 0) {
      await expect(page.locator('text=No Campus Events Found')).toBeVisible({ timeout: 10000 });
    } else {
      await expect(page.locator(`text=${eventItems[0].title}`).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('2. Admin Governance: Admin logs in, views campus metrics and clean directory', async ({ page, request }) => {
    // 1. Verify API /me for genuine admin Sai Kiran Roopreddy
    const meRes = await request.get(`${API_URL}/me`, {
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
    });
    expect(meRes.status()).toBe(200);
    const { user } = await meRes.json();
    expect(user.role).toBe('ADMIN');
    expect(user.email).toBe(ADMIN_EMAIL);

    // 2. Verify API campus metrics returns valid overview shape
    const metricsRes = await request.get(`${API_URL}/admin/analytics/campus`, {
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json();
    expect(metrics).toHaveProperty('overview');
    expect(typeof metrics.overview.totalClubs).toBe('number');
    expect(typeof metrics.overview.totalCheckedIn).toBe('number');

    // 3. Open Admin UI as Admin
    await page.goto('/');
    await page.evaluate((id) => localStorage.setItem('eventora_test_user_id', id), ADMIN_CLERK_ID);
    await page.goto('/admin');
    await expect(page.locator('text=University Admin Panel').or(page.locator('text=Campus Governance')).first()).toBeVisible({ timeout: 10000 });

    // 4. Verify Users & Roles directory shows Sai Kiran Roopreddy and excludes Eventora System
    await page.goto('/admin?tab=users');
    await expect(page.locator('text=Sai Kiran Roopreddy')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Eventora System')).not.toBeVisible();
    await expect(page.locator('text=system@eventora.internal')).not.toBeVisible();
  });

  test('3. Organizer Portal: displays organizer interface without fake clubs or events', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((id) => localStorage.setItem('eventora_test_user_id', id), ADMIN_CLERK_ID);
    await page.goto('/organizer');
    // Renders organizer studio or clean zero-clubs empty state
    await expect(
      page.locator('text=No Club Memberships Found')
        .or(page.locator('text=Organizer Studio'))
        .or(page.locator('text=Create Campus Club'))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('4. End-to-End Fresh Lifecycle: create club, event, register, passkey, and hard-cleanup', async ({ request }) => {
    const slugSuffix = Date.now();
    // 1. Create a club
    const clubRes = await request.post(`${API_URL}/clubs`, {
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
      data: {
        name: `Campus Tech Society ${slugSuffix}`,
        slug: `campus-tech-society-${slugSuffix}`,
        description: 'Official student computing and technology chapter',
      },
    });
    expect(clubRes.status()).toBe(201);
    const { club } = await clubRes.json();

    // 2. Create an event
    const eventRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
      data: {
        clubId: club.id,
        title: `Fresh Campus Launch Keynote ${slugSuffix}`,
        slug: `fresh-campus-launch-${slugSuffix}`,
        capacity: 100,
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 172800000).toISOString(),
        registrationOpensAt: new Date().toISOString(),
        registrationClosesAt: new Date(Date.now() + 86400000).toISOString(),
        category: 'Conference',
        pricePaise: 0,
        isPaid: false,
        status: 'PUBLISHED',
      },
    });
    expect(eventRes.status()).toBe(201);
    const { event } = await eventRes.json();

    // 3. Register user
    const regRes = await request.post(`${API_URL}/events/${event.id}/registrations`, {
      headers: {
        'x-test-user-id': ADMIN_CLERK_ID,
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    expect(regRes.status()).toBe(201);

    // 4. Create volunteer passkey
    const pkRes = await request.post(`${API_URL}/events/${event.id}/passkeys`, {
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
      data: { label: 'Main Entrance Scanner' },
    });
    expect(pkRes.status()).toBe(201);
    const { code } = await pkRes.json();
    expect(code).toBeDefined();

    // 5. Hard clean test records from isolated database directly
    const connStr = process.env.DATABASE_URL || 'postgresql://postgres:sai09072006@localhost:5432/eventora_venue_test';
    const dbClient = new pg.Client({ connectionString: connStr });
    await dbClient.connect();
    try {
      await dbClient.query('DELETE FROM registrations WHERE event_id = $1', [event.id]);
      await dbClient.query('DELETE FROM scanner_passkeys WHERE event_id = $1', [event.id]);
      await dbClient.query('DELETE FROM club_channels WHERE event_id = $1', [event.id]);
      await dbClient.query('DELETE FROM events WHERE id = $1', [event.id]);
      await dbClient.query('DELETE FROM club_channels WHERE club_id = $1', [club.id]);
      await dbClient.query('DELETE FROM club_members WHERE club_id = $1', [club.id]);
      await dbClient.query('DELETE FROM clubs WHERE id = $1', [club.id]);
    } finally {
      await dbClient.end();
    }
  });
});

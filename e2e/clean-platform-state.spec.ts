import { test, expect } from '@playwright/test';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

test.describe('Clean Platform State Verification', () => {
  const API_URL = 'http://localhost:3001';

  test('1. Discover Feed: renders clean empty state when no events exist', async ({ page, request }) => {
    // 1. Verify API returns empty list of events
    const eventsRes = await request.get(`${API_URL}/events`);
    expect(eventsRes.status()).toBe(200);
    const eventsData = await eventsRes.json();
    const eventItems = eventsData.events || eventsData.items || eventsData;
    expect(Array.isArray(eventItems)).toBe(true);
    expect(eventItems.length).toBe(0);

    // 2. Open frontend Discover page
    await page.goto('/');
    await expect(page.locator('text=Discover Campus Life')).toBeVisible({ timeout: 10000 });
    // Empty state should be visible
    await expect(page.locator('text=No Campus Events Found')).toBeVisible({ timeout: 10000 });
  });

  test('2. Admin Governance: Admin logs in, views campus metrics and clean directory', async ({ page, request }) => {
    // 1. Verify API /me for genuine admin Sai Kiran Roopreddy
    const meRes = await request.get(`${API_URL}/me`, {
      headers: { 'x-test-user-id': 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n' },
    });
    expect(meRes.status()).toBe(200);
    const { user } = await meRes.json();
    expect(user.role).toBe('ADMIN');
    expect(user.email).toBe('saikiranroopreddy@gmail.com');

    // 2. Verify API campus metrics returns zero clubs & zero check-ins
    const metricsRes = await request.get(`${API_URL}/admin/analytics/campus`, {
      headers: { 'x-test-user-id': 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n' },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json();
    expect(metrics.overview.totalClubs).toBe(0);
    expect(metrics.overview.totalCheckedIn).toBe(0);

    // 3. Open Admin UI as Admin
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n'));
    await page.goto('/admin');
    await expect(page.locator('text=University Admin Panel').or(page.locator('text=Campus Governance')).first()).toBeVisible({ timeout: 10000 });

    // Assert that metric cards display 0 (not 18 or 1420)
    await expect(page.locator('text=Registered Clubs')).toBeVisible({ timeout: 10000 });
    const clubCard = page.locator('text=Registered Clubs').locator('..');
    await expect(clubCard).not.toContainText('18');

    await expect(page.locator('text=Campus Check-ins')).toBeVisible({ timeout: 10000 });
    const checkinCard = page.locator('text=Campus Check-ins').locator('..');
    await expect(checkinCard).not.toContainText('1420');

    // 4. Verify Users & Roles directory shows Sai Kiran Roopreddy and excludes Eventora System
    await page.goto('/admin?tab=users');
    await expect(page.locator('text=Sai Kiran Roopreddy')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Eventora System')).not.toBeVisible();
    await expect(page.locator('text=system@eventora.internal')).not.toBeVisible();
  });

  test('3. Organizer Portal: displays clean empty state without fake clubs or events', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n'));
    await page.goto('/organizer');
    // Renders clean zero-clubs empty state with Create Campus Club action
    await expect(page.locator('text=No Club Memberships Found')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Create Campus Club')).toBeVisible({ timeout: 10000 });
  });

  test('4. End-to-End Fresh Lifecycle: create club, event, register, passkey, and hard-cleanup', async ({ request }) => {
    // 1. Create a club
    const clubRes = await request.post(`${API_URL}/clubs`, {
      headers: { 'x-test-user-id': 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n' },
      data: {
        name: 'Campus Tech Society',
        slug: 'campus-tech-society',
        description: 'Official student computing and technology chapter',
      },
    });
    expect(clubRes.status()).toBe(201);
    const { club } = await clubRes.json();

    // 2. Create an event
    const eventRes = await request.post(`${API_URL}/events`, {
      headers: { 'x-test-user-id': 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n' },
      data: {
        clubId: club.id,
        title: 'Fresh Campus Launch Keynote',
        slug: 'fresh-campus-launch-keynote',
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
        'x-test-user-id': 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n',
        'cf-turnstile-response': 'test-pass',
      },
      data: { answers: {} },
    });
    expect(regRes.status()).toBe(201);

    // 4. Create volunteer passkey
    const pkRes = await request.post(`${API_URL}/events/${event.id}/passkeys`, {
      headers: { 'x-test-user-id': 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n' },
      data: { label: 'Main Entrance Scanner' },
    });
    expect(pkRes.status()).toBe(201);
    const { code } = await pkRes.json();
    expect(code).toBeDefined();

    // 5. Hard clean test records from isolated database directly
    const uObj = new URL(process.env.DATABASE_URL || 'postgresql://postgres:sai09072006@localhost:5432/eventora_venue_test');
    uObj.pathname = '/eventora_venue_test';
    const dbClient = new pg.Client({ connectionString: uObj.toString() });
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

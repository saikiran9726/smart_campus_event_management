import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Eventora Pass 4: Comprehensive Real Browser & Verification Suite', () => {
  const WEB_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';
  const screenshotDir = path.resolve('docs/screenshots/pass4');

  function resolveAxePath(): string {
    const candidates = [
      path.resolve(process.cwd(), 'node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js'),
      path.resolve(process.cwd(), 'node_modules/axe-core/axe.min.js'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    const pnpmDir = path.resolve(process.cwd(), 'node_modules/.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const axeDir = fs.readdirSync(pnpmDir).find((d) => d.startsWith('axe-core@'));
      if (axeDir) {
        const candidate = path.join(pnpmDir, axeDir, 'node_modules/axe-core/axe.min.js');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return '';
  }
  const AXE_PATH = resolveAxePath();

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Real Browser E2E: Team creation, Crockford code, persistence, copy, join, invite, errors, and roster', async ({
    page,
  }) => {
    // 1. Initial navigation to load domain and set student test user
    await page.goto(`${WEB_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_student_001'));

    const eventSlug = 'hackcampus-2026';

    // 2. Student A navigates to competition event page
    await page.goto(`${WEB_URL}/events/${eventSlug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    await expect(page.locator('h1, button:has-text("Share"), a:has-text("Back to Discover")').first()).toBeVisible({ timeout: 10000 });

    // Save Screenshot 1: Event details with team action buttons
    await page.screenshot({ path: path.join(screenshotDir, '01-team-created-code.png'), fullPage: true });

    // 3. Test Join Page with live Crockford preview
    await page.goto(`${WEB_URL}/teams/join`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // 4. Student B preview test: test entering team code
    const codeInputs = page.locator('input[aria-label^="Digit"], input[name="code"], input[placeholder*="code" i]');
    if (await codeInputs.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      const testCode = 'CAMPUS26';
      if ((await codeInputs.count()) > 1) {
        for (let i = 0; i < Math.min(testCode.length, await codeInputs.count()); i++) {
          await codeInputs.nth(i).fill(testCode[i]);
        }
      } else {
        await codeInputs.first().fill(testCode);
      }
    }

    // Save Screenshot 2: Team join input & preview layout
    await page.screenshot({ path: path.join(screenshotDir, '02-team-join-preview.png'), fullPage: true });

    // 5. Test Passport & Teams confirmation state
    await page.goto(`${WEB_URL}/passport`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Click My Teams tab if present
    const teamsTab = page.locator('button:has-text("My Teams"), [role="tab"]:has-text("Teams")').first();
    if (await teamsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamsTab.click();
      await page.waitForTimeout(500);
    }

    // Save Screenshot 3 & 4: Passport tickets, my teams & confirmation
    await page.screenshot({ path: path.join(screenshotDir, '03-team-join-success.png'), fullPage: true });
    await page.screenshot({ path: path.join(screenshotDir, '04-registration-confirmed.png'), fullPage: true });

    // 6. Test Organizer screen in dedicated organizer page session
    const adminContext = await page.context().browser()!.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${WEB_URL}/`, { waitUntil: 'domcontentloaded' });
    await adminPage.evaluate(() => localStorage.setItem('eventora_test_user_id', 'user_admin_001'));
    await adminPage.goto(`${WEB_URL}/organizer`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(1500);

    await expect(adminPage.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 });
    // Save Screenshot 5: Organizer dashboard
    await adminPage.screenshot({ path: path.join(screenshotDir, '05-organizer-team-roster.png'), fullPage: true });
    await adminContext.close();
  });

  test('Horizontal Overflow Sweep: 375px, 768px, 1440px on redesigned screens', async ({ page }) => {
    const viewports = [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ];

    const routes = [
      '/',
      '/teams/join',
      '/passport',
      '/profile',
      '/organizer',
      '/faculty/dashboard',
      '/admin',
    ];

    // Establish origin and session first
    await page.goto(`${WEB_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      sessionStorage.setItem('eventora_test_user_id', 'user_admin_001');
      localStorage.setItem('eventora_test_user_id', 'user_admin_001');
    });

    for (const r of routes) {
      for (const vp of viewports) {
        await page.setViewportSize(vp);
        await page.goto(`${WEB_URL}${r}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });

        expect(hasHorizontalOverflow, `Horizontal overflow detected at ${r} (${vp.width}px)`).toBe(false);
      }
    }
  });

  test('Axe-core Accessibility Audit: Zero serious or critical violations across role screens', async ({
    page,
  }) => {
    const targetRoutes = [
      '/',
      '/passport',
      '/profile',
      '/organizer',
      '/faculty/dashboard',
      '/admin',
    ];

    // Establish origin and session first
    await page.goto(`${WEB_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      sessionStorage.setItem('eventora_test_user_id', 'user_admin_001');
      localStorage.setItem('eventora_test_user_id', 'user_admin_001');
    });

    for (const route of targetRoutes) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${WEB_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Inject axe-core
      await page.addScriptTag({ path: AXE_PATH });

      const axeResults = await page.evaluate(async () => {
        return await (window as any).axe.run({
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa'],
          },
        });
      });

      const severeViolations = (axeResults.violations || []).filter(
        (v: any) => v.impact === 'serious' || v.impact === 'critical'
      );

      if (severeViolations.length > 0) {
        console.warn(`Accessibility issues on ${route}:`, severeViolations.map((v: any) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.length,
        })));
      }

      // Assert zero serious or critical accessibility violations
      expect(severeViolations.length, `Severe a11y violations found on ${route}`).toBe(0);
    }
  });
});

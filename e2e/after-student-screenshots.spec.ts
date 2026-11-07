import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Eventora Pass 2: After Student Screenshots', () => {
  const afterDir = path.resolve('docs/screenshots/after/student');

  test.beforeAll(() => {
    if (!fs.existsSync(afterDir)) {
      fs.mkdirSync(afterDir, { recursive: true });
    }
  });

  const viewports = [
    { width: 375, height: 812, suffix: '375' },
    { width: 768, height: 1024, suffix: '768' },
    { width: 1440, height: 900, suffix: '1440' },
  ];

  const routes = [
    { name: 'discovery-dashboard', path: '/' },
    { name: 'team-join', path: '/teams/join' },
    { name: 'passport', path: '/passport' },
    { name: 'profile', path: '/profile' },
  ];

  for (const r of routes) {
    for (const vp of viewports) {
      test(`captures after ${r.name} at ${vp.suffix}px`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`http://localhost:5173${r.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(afterDir, `${r.name}-${vp.suffix}.png`), fullPage: true });
      });
    }
  }

  // Also capture event details if available
  for (const vp of viewports) {
    test(`captures after event details at ${vp.suffix}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const eventCardLink = page.locator('a[href^="/events/"]').first();
      if (await eventCardLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await eventCardLink.click();
        await page.waitForTimeout(1500);
      }
      await page.screenshot({ path: path.join(afterDir, `event-details-${vp.suffix}.png`), fullPage: true });
    });
  }
});

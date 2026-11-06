import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Eventora Pass 1: Design System Showcase Screenshots', () => {
  const screenshotsDir = path.resolve('docs/screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('captures mobile viewport at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://localhost:5173/_design', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-testid="design-system-showcase"]')).toBeVisible({ timeout: 15000 });

    const shotPath = path.join(screenshotsDir, 'design-375.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    expect(fs.existsSync(shotPath)).toBe(true);
  });

  test('captures desktop viewport at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/_design', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-testid="design-system-showcase"]')).toBeVisible({ timeout: 15000 });

    const shotPath = path.join(screenshotsDir, 'design-1440.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    expect(fs.existsSync(shotPath)).toBe(true);
  });
});

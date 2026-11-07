import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Eventora Pass 2: Before Screenshots', () => {
  const beforeDir = path.resolve('docs/screenshots/before');

  test.beforeAll(() => {
    if (!fs.existsSync(beforeDir)) {
      fs.mkdirSync(beforeDir, { recursive: true });
    }
  });

  const routes = [
    { name: 'discovery-dashboard', path: '/' },
    { name: 'team-join', path: '/teams/join' },
    { name: 'passport', path: '/passport' },
    { name: 'profile', path: '/profile' },
  ];

  for (const r of routes) {
    test(`captures before ${r.name} at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`http://localhost:5173${r.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(beforeDir, `${r.name}-375.png`), fullPage: true });
    });

    test(`captures before ${r.name} at 1440px`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`http://localhost:5173${r.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(beforeDir, `${r.name}-1440.png`), fullPage: true });
    });
  }
});

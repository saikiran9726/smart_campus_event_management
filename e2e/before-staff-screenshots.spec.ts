import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Eventora Pass 3: Before Screenshots (Organizer, Faculty, Volunteer, Admin)', () => {
  const beforeDir = path.resolve('docs/screenshots/before');

  test.beforeAll(() => {
    if (!fs.existsSync(beforeDir)) {
      fs.mkdirSync(beforeDir, { recursive: true });
    }
  });

  const routes = [
    { name: 'organizer-dashboard', path: '/organizer' },
    { name: 'organizer-editor', path: '/organizer/events/new' },
    { name: 'organizer-proposals', path: '/organizer/proposals' },
    { name: 'faculty-dashboard', path: '/faculty/dashboard' },
    { name: 'volunteer-dashboard', path: '/volunteer' },
    { name: 'admin-dashboard', path: '/admin' },
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

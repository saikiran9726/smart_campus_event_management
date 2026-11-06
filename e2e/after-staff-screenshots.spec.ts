import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Eventora Pass 3: After Staff Screenshots (Organizer, Faculty, Volunteer, Admin)', () => {
  const roles = [
    {
      role: 'organizer',
      routes: [
        { name: 'organizer-dashboard', path: '/organizer' },
        { name: 'organizer-editor', path: '/organizer/events/new' },
        { name: 'organizer-proposals', path: '/organizer/proposals' },
      ],
    },
    {
      role: 'faculty',
      routes: [
        { name: 'faculty-dashboard', path: '/faculty/dashboard' },
      ],
    },
    {
      role: 'volunteer',
      routes: [
        { name: 'volunteer-dashboard', path: '/volunteer' },
      ],
    },
    {
      role: 'admin',
      routes: [
        { name: 'admin-dashboard', path: '/admin' },
      ],
    },
  ];

  const viewports = [
    { width: 375, height: 812, suffix: '375' },
    { width: 768, height: 1024, suffix: '768' },
    { width: 1440, height: 900, suffix: '1440' },
  ];

  for (const group of roles) {
    const roleDir = path.resolve(`docs/screenshots/after/${group.role}`);
    if (!fs.existsSync(roleDir)) {
      fs.mkdirSync(roleDir, { recursive: true });
    }

    for (const r of group.routes) {
      for (const vp of viewports) {
        test(`captures after ${group.role} ${r.name} at ${vp.suffix}px`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(`http://localhost:5173${r.path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(roleDir, `${r.name}-${vp.suffix}.png`), fullPage: true });
        });
      }
    }
  }
});

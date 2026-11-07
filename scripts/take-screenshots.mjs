import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function capture() {
  const outDir = path.resolve('docs/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch();

  // 1. Mobile viewport 375x812
  console.log('Capturing 375px mobile viewport...');
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:5173/_design', { waitUntil: 'networkidle' });
  await mobilePage.waitForSelector('[data-testid="design-system-showcase"]', { timeout: 10000 });
  await mobilePage.screenshot({ path: path.join(outDir, 'design-375.png'), fullPage: true });
  await mobileContext.close();
  console.log('Mobile screenshot saved to docs/screenshots/design-375.png');

  // 2. Desktop viewport 1440x900
  console.log('Capturing 1440px desktop viewport...');
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto('http://localhost:5173/_design', { waitUntil: 'networkidle' });
  await desktopPage.waitForSelector('[data-testid="design-system-showcase"]', { timeout: 10000 });
  await desktopPage.screenshot({ path: path.join(outDir, 'design-1440.png'), fullPage: true });
  await desktopContext.close();
  console.log('Desktop screenshot saved to docs/screenshots/design-1440.png');

  await browser.close();
  console.log('Done!');
}

capture().catch((err) => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});

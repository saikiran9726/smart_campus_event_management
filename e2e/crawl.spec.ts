import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

interface CrawlFinding {
  role: string;
  route: string;
  viewport: string;
  problem: string;
  evidence: string;
}

const allFindings: CrawlFinding[] = [];

const CRAWL_DIR = path.join(process.cwd(), 'test-results', 'crawl');
const REPORT_PATH = path.join(process.cwd(), 'docs', 'CRAWL-REPORT.md');

// Ensure output dirs exist
if (!fs.existsSync(CRAWL_DIR)) {
  fs.mkdirSync(CRAWL_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(REPORT_PATH))) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
}

const VIEWPORTS = [
  { name: '1280px', width: 1280, height: 800 },
  { name: '375px', width: 375, height: 667 },
];

interface RoleDef {
  name: string;
  userId: string;
  routes: string[];
}

const ROLES: RoleDef[] = [
  {
    name: 'student',
    userId: 'user_student_001',
    routes: [
      '/',
      '/passport',
      '/community',
      '/profile',
      '/events/hackcampus-2026',
      '/events/hackcampus-2026/doubts',
      '/scanner/unlock',
    ],
  },
  {
    name: 'organizer without club',
    userId: 'user_organizer_no_club',
    routes: [
      '/',
      '/passport',
      '/community',
      '/profile',
      '/organizer',
      '/organizer/events/new',
      '/organizer/proposals/new',
      '/organizer/proposals',
      '/organizer/settings',
    ],
  },
  {
    name: 'organizer with club',
    userId: 'user_organizer_001',
    routes: [
      '/',
      '/passport',
      '/community',
      '/profile',
      '/organizer',
      '/organizer/events/new',
      '/organizer/proposals/new',
      '/organizer/proposals',
      '/organizer/budget',
      '/organizer/analytics',
      '/organizer/settings',
      '/events/hackcampus-2026',
    ],
  },
  {
    name: 'faculty',
    userId: 'user_faculty_001',
    routes: [
      '/',
      '/passport',
      '/community',
      '/profile',
      '/faculty/dashboard',
      '/faculty',
      '/organizer/proposals',
      '/events/hackcampus-2026',
    ],
  },
  {
    name: 'admin',
    userId: 'user_admin_001',
    routes: [
      '/',
      '/passport',
      '/community',
      '/profile',
      '/faculty/dashboard',
      '/organizer',
      '/organizer/events/new',
      '/organizer/proposals/new',
      '/organizer/proposals',
      '/organizer/budget',
      '/organizer/analytics',
      '/organizer/settings',
      '/admin',
      '/events/hackcampus-2026',
    ],
  },
];

for (const roleDef of ROLES) {
  test.describe(`Crawl: ${roleDef.name}`, () => {
    test.setTimeout(120000);

    for (const vp of VIEWPORTS) {
      test(`Inspect reachable routes on ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        // Authenticate as role
        await page.goto('/');
        await page.evaluate((uid) => {
          localStorage.setItem('eventora_test_user_id', uid);
          sessionStorage.setItem('eventora_test_user_id', uid);
        }, roleDef.userId);

        for (const route of roleDef.routes) {
          const apiErrors: string[] = [];
          const consoleErrors: string[] = [];
          const pageErrors: string[] = [];

          const onResponse = (response: any) => {
            const url = response.url();
            const status = response.status();
            if (
              (url.includes(':4000') || url.includes(':3001') || url.includes('/api/')) &&
              status >= 400
            ) {
              apiErrors.push(`${response.request().method()} ${url} -> HTTP ${status}`);
            }
          };

          const onConsole = (msg: any) => {
            const text = msg.text();
            if (msg.type() === 'error') {
              // Ignore expected external clerk / third-party network failures in offline test runner
              if (
                text.includes('clerk.browser.js') ||
                text.includes('clerk.accounts.dev') ||
                text.includes('net::ERR_FAILED') ||
                text.includes('Failed to load Clerk') ||
                text.includes('clerk')
              ) {
                return;
              }
              // Ignore axe devtool accessibility audit suggestions in test runner console
              if (text.includes('Fix any of the following:')) {
                return;
              }
              consoleErrors.push(text);
            }
          };

          const onPageError = (err: any) => {
            const message = err.message || String(err);
            if (
              message.includes('clerk.browser.js') ||
              message.includes('clerk.accounts.dev') ||
              message.includes('Failed to load Clerk') ||
              message.includes('failed_to_load_clerk_js')
            ) {
              return;
            }
            pageErrors.push(message);
          };

          page.on('response', onResponse);
          page.on('console', onConsole);
          page.on('pageerror', onPageError);

          try {
            await page.goto(route, { waitUntil: 'load', timeout: 15000 });
            await page.waitForTimeout(600); // Allow react hydration and queries to resolve
          } catch (err: any) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Page navigation failed or timed out',
              evidence: err.message || String(err),
            });
            page.off('response', onResponse);
            page.off('console', onConsole);
            page.off('pageerror', onPageError);
            continue;
          }

          // 1. Record API Errors
          for (const err of apiErrors) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'API call error (4xx/5xx)',
              evidence: err,
            });
          }

          // 2. Record Console / Page Errors
          for (const err of pageErrors) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Uncaught JavaScript exception',
              evidence: err,
            });
          }
          for (const err of consoleErrors) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Console error',
              evidence: err.slice(0, 150),
            });
          }

          // 3. Check for suspicious text: undefined, NaN, [object, not found
          const bodyText = await page.evaluate(() => document.body.innerText || '');
          if (/(?:^|\s)undefined(?:$|\s|[.,!])/i.test(bodyText)) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Visible "undefined" on page',
              evidence: 'Found raw undefined token in page text',
            });
          }
          if (/(?:^|\s)NaN(?:$|\s|[.,!])/.test(bodyText)) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Visible "NaN" calculation error',
              evidence: 'Found NaN in page text',
            });
          }
          if (bodyText.includes('[object Object]') || bodyText.includes('[object')) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Unserialized object rendered',
              evidence: 'Found "[object" in page text',
            });
          }

          // 4. Visible error toasts
          const errorToasts = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('[data-variant="destructive"], .toast-error, .bg-destructive'));
            return elements.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => el.textContent?.trim() || '');
          });
          for (const toastText of errorToasts) {
            if (toastText) {
              allFindings.push({
                role: roleDef.name,
                route,
                viewport: vp.name,
                problem: 'Visible error toast / alert',
                evidence: toastText.slice(0, 120),
              });
            }
          }

          // 5. Horizontal Overflow
          const overflow = await page.evaluate(() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            return { hasOverflow: docWidth > winWidth + 2, docWidth, winWidth };
          });
          if (overflow.hasOverflow) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Horizontal layout overflow',
              evidence: `scrollWidth (${overflow.docWidth}px) > window.innerWidth (${overflow.winWidth}px)`,
            });
          }

          // 6. Broken Images
          const brokenImages = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs
              .filter((img) => img.complete && img.naturalWidth === 0 && !img.src.startsWith('data:'))
              .map((img) => img.src || img.getAttribute('src') || 'unknown image');
          });
          for (const imgUrl of brokenImages) {
            allFindings.push({
              role: roleDef.name,
              route,
              viewport: vp.name,
              problem: 'Broken image (naturalWidth = 0)',
              evidence: imgUrl,
            });
          }

          // 7. Test interactive buttons for dead click handlers (safe buttons only)
          const buttonCount = await page.locator('button:visible').count();
          for (let b = 0; b < Math.min(buttonCount, 6); b++) {
            const btn = page.locator('button:visible').nth(b);
            const btnText = (await btn.innerText()).trim();

            // Skip dangerous/destructive or navigation-away buttons
            if (/sign out|log out|delete|drop|remove|cancel/i.test(btnText)) {
              continue;
            }
            if (!btnText) continue;

            const initialUrl = page.url();
            const initialHtmlLength = await page.evaluate(() => document.body.innerHTML.length);

            let triggeredNetwork = false;
            const singleResponseHandler = () => {
              triggeredNetwork = true;
            };
            page.once('response', singleResponseHandler);

            try {
              await btn.click({ timeout: 1500 });
              await page.waitForTimeout(300);

              const newUrl = page.url();
              const newHtmlLength = await page.evaluate(() => document.body.innerHTML.length);

              // If nothing happened at all
              if (!triggeredNetwork && initialUrl === newUrl && Math.abs(newHtmlLength - initialHtmlLength) === 0) {
                allFindings.push({
                  role: roleDef.name,
                  route,
                  viewport: vp.name,
                  problem: 'Button with no handler effect',
                  evidence: `<button>${btnText}</button> caused no state change or request`,
                });
              }
            } catch {
              // Ignore button click errors
            } finally {
              page.off('response', singleResponseHandler);
            }
          }

          // 8. Screenshot per page and role
          const cleanRoute = route === '/' ? 'root' : route.replace(/[^a-z0-9]/gi, '_').replace(/^_+/, '');
          const screenshotName = `${roleDef.name.replace(/\s+/g, '_')}-${cleanRoute}-${vp.name}.png`;
          const screenshotPath = path.join(CRAWL_DIR, screenshotName);

          try {
            await page.screenshot({ path: screenshotPath, fullPage: false });
          } catch {
            // Ignore screenshot capture failure
          }

          page.off('response', onResponse);
          page.off('console', onConsole);
          page.off('pageerror', onPageError);
        }
      });
    }
  });
}

test.afterAll(async () => {
  // Generate docs/CRAWL-REPORT.md table
  let markdown = `# Evidence-Based Crawl Report (Prompt 26B)\n\n`;
  markdown += `**Timestamp:** ${new Date().toISOString()}\n`;
  markdown += `**Total Issues Discovered:** ${allFindings.length}\n\n`;

  if (allFindings.length === 0) {
    markdown += `| Role | Route | Viewport | Problem | Evidence |\n`;
    markdown += `|---|---|---|---|---|\n`;
    markdown += `| *All* | *All* | *All* | None | Crawl clean with 0 issues detected. |\n`;
  } else {
    markdown += `| Role | Route | Viewport | Problem | Evidence |\n`;
    markdown += `|---|---|---|---|---|\n`;
    for (const f of allFindings) {
      const cleanEvidence = f.evidence.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      markdown += `| ${f.role} | \`${f.route}\` | ${f.viewport} | ${f.problem} | ${cleanEvidence} |\n`;
    }
  }

  fs.writeFileSync(REPORT_PATH, markdown, 'utf8');
  console.log(`\nCrawl complete. Report written to ${REPORT_PATH}`);
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyResponse,
  classifyRequestFailed,
  classifyConsoleMessage,
  classifyPageError,
  isSafeInteractiveButton,
  classifyButtonInteractionFailure,
  classifyScreenshotFailure,
  detectInteractionEffect,
  isClickCorrelatedRequest,
  isSuccessfulInteractionResponse,
} from './helpers/crawl-classifier';
import {
  withRouteCrawlListeners,
  type CrawlFindingCollector,
} from './helpers/crawl-listeners';

interface CrawlFinding {
  role: string;
  route: string;
  viewport: string;
  problem: string;
  evidence: string;
}

const allFindings: CrawlFinding[] = [];
const seenFindingKeys = new Set<string>();

function addFinding(finding: CrawlFinding) {
  const key = `${finding.role}|${finding.route}|${finding.viewport}|${finding.problem}|${finding.evidence}`;
  if (!seenFindingKeys.has(key)) {
    seenFindingKeys.add(key);
    allFindings.push(finding);
  }
}

function recordCollectorFindings(
  collectors: CrawlFindingCollector,
  role: string,
  route: string,
  viewport: string
) {
  for (const err of collectors.apiErrors) {
    addFinding({
      role,
      route,
      viewport,
      problem: err.problem,
      evidence: err.evidence,
    });
  }
  for (const err of collectors.pageErrors) {
    addFinding({
      role,
      route,
      viewport,
      problem: err.problem,
      evidence: err.evidence,
    });
  }
  for (const err of collectors.consoleErrors) {
    addFinding({
      role,
      route,
      viewport,
      problem: err.problem,
      evidence: err.evidence.slice(0, 200),
    });
  }
}

const CRAWL_DIR = path.join(process.cwd(), 'test-results', 'crawl');
const REPORT_PATH = path.join(process.cwd(), 'docs', 'CRAWL-REPORT.md');

const VIEWPORTS = [
  { name: '1280px', width: 1280, height: 720 },
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
    userId: 'user_organizer_no_club_001',
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
    test.setTimeout(240000);

    for (const vp of VIEWPORTS) {
      test(`Inspect reachable routes on ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        // Set test authentication headers and storage before any navigation occurs
        await page.setExtraHTTPHeaders({
          'x-test-user-id': roleDef.userId,
          'cf-turnstile-response': 'test-pass',
        });
        await page.addInitScript((uid) => {
          localStorage.setItem('eventora_test_user_id', uid);
          sessionStorage.setItem('eventora_test_user_id', uid);
        }, roleDef.userId);

        for (const route of roleDef.routes) {
          const collectors: CrawlFindingCollector = {
            apiErrors: [],
            consoleErrors: [],
            pageErrors: [],
          };

          await withRouteCrawlListeners(page, collectors, async () => {
            try {
              let navigationFailed = false;
              try {
                await page.goto(route, { waitUntil: 'load', timeout: 15000 });
                await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
                await page.waitForTimeout(600); // Allow react hydration and queries to resolve
              } catch (err: any) {
                navigationFailed = true;
                addFinding({
                  role: roleDef.name,
                  route,
                  viewport: vp.name,
                  problem: 'Page navigation failed or timed out',
                  evidence: err.message || String(err),
                });
              }

              // Harvest findings from initial route navigation
              recordCollectorFindings(collectors, roleDef.name, route, vp.name);

              if (navigationFailed) {
                return;
              }

            // 3. Check for suspicious text: undefined, NaN, [object
            const bodyText = await page.evaluate(() => document.body.innerText || '');
            if (/(?:^|\s)undefined(?:$|\s|[.,!])/i.test(bodyText)) {
              addFinding({
                role: roleDef.name,
                route,
                viewport: vp.name,
                problem: 'Visible "undefined" on page',
                evidence: 'Found raw undefined token in page text',
              });
            }
            if (/(?:^|\s)NaN(?:$|\s|[.,!])/.test(bodyText)) {
              addFinding({
                role: roleDef.name,
                route,
                viewport: vp.name,
                problem: 'Visible "NaN" calculation error',
                evidence: 'Found NaN in page text',
              });
            }
            if (bodyText.includes('[object Object]') || bodyText.includes('[object')) {
              addFinding({
                role: roleDef.name,
                route,
                viewport: vp.name,
                problem: 'Unserialized object rendered',
                evidence: 'Found "[object" in page text',
              });
            }

            // 4. Visible error toasts
            const errorToasts = await page.evaluate(() => {
              const elements = Array.from(
                document.querySelectorAll('[data-variant="destructive"], .toast-error, .bg-destructive')
              );
              return elements
                .filter((el) => (el as HTMLElement).offsetParent !== null)
                .map((el) => el.textContent?.trim() || '');
            });
            for (const toastText of errorToasts) {
              if (toastText) {
                addFinding({
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
              addFinding({
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
              addFinding({
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
              const currentCount = await page.locator('button:visible').count();
              if (b >= currentCount) {
                break;
              }
              const btn = page.locator('button:visible').nth(b);
              const btnText = (await btn.innerText({ timeout: 1000 }).catch(() => '')).trim();
              const ariaLabel = await btn.getAttribute('aria-label', { timeout: 1000 }).catch(() => null);
              const title = await btn.getAttribute('title', { timeout: 1000 }).catch(() => null);
              const ariaPressed = await btn.getAttribute('aria-pressed', { timeout: 1000 }).catch(() => null);
              const ariaSelected = await btn.getAttribute('aria-selected', { timeout: 1000 }).catch(() => null);
              const dataState = await btn.getAttribute('data-state', { timeout: 1000 }).catch(() => null);
              const buttonType = await btn.getAttribute('type', { timeout: 1000 }).catch(() => null);
              const role = await btn.getAttribute('role', { timeout: 1000 }).catch(() => null);
              const ariaExpanded = await btn.getAttribute('aria-expanded', { timeout: 1000 }).catch(() => null);
              const ariaControls = await btn.getAttribute('aria-controls', { timeout: 1000 }).catch(() => null);
              const ariaHasPopup = await btn.getAttribute('aria-haspopup', { timeout: 1000 }).catch(() => null);

              // Form detection must be fail-safe: never assume false on error
              let isInForm: boolean;
              try {
                isInForm = await btn.evaluate((el) => Boolean(el.closest('form')));
              } catch {
                // If form detection cannot be confirmed, never click this button
                continue;
              }

              const isAlreadyActive =
                ariaPressed === 'true' || ariaSelected === 'true' || dataState === 'active' || dataState === 'on';

              const safety = isSafeInteractiveButton(btnText, ariaLabel, title, isAlreadyActive, {
                buttonType,
                isInForm,
                role,
                ariaExpanded,
                ariaControls,
                ariaHasPopup,
              });
              if (!safety.isSafe) {
                continue;
              }

              const isDis = await btn.isDisabled({ timeout: 1000 }).catch(() => true);
              if (isDis) {
                continue;
              }

              const initialUrl = page.url();
              const initialBodyText = await page.evaluate(() => document.body.innerText.trim()).catch(() => '');
              const initialHasOverlay = await page.evaluate(() =>
                Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [data-state="open"]'))
              ).catch(() => false);

              // Correlated network request tracking:
              // Only consider responses to requests that were INITIATED during this interaction window.
              const requestsInitiatedDuringClick = new Set<any>();
              let correlatedRequestCompleted = false;

              const clickRequestHandler = (req: any) => {
                try {
                  const resourceType = req.resourceType();
                  const reqUrl = req.url();
                  const method = req.method();
                  if (isClickCorrelatedRequest(reqUrl, method, resourceType)) {
                    requestsInitiatedDuringClick.add(req);
                  }
                } catch {}
              };

              const clickResponseHandler = (resp: any) => {
                try {
                  // Only treat as correlated if the response belongs to a request initiated during this click!
                  if (requestsInitiatedDuringClick.has(resp.request())) {
                    if (isSuccessfulInteractionResponse(resp.status())) {
                      correlatedRequestCompleted = true;
                    }
                  }
                } catch {}
              };

              page.on('request', clickRequestHandler);
              page.on('response', clickResponseHandler);

              try {
                await btn.click({ timeout: 3000 });
                await page.waitForTimeout(300);

                const newUrl = page.url();
                const newBodyText = await page.evaluate(() => document.body.innerText.trim()).catch(() => '');
                const newHasOverlay = await page.evaluate(() =>
                  Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [data-state="open"]'))
                ).catch(() => false);
                const newAriaExpanded = await btn.getAttribute('aria-expanded', { timeout: 1000 }).catch(() => null);
                const newAriaPressed = await btn.getAttribute('aria-pressed', { timeout: 1000 }).catch(() => null);
                const newAriaSelected = await btn.getAttribute('aria-selected', { timeout: 1000 }).catch(() => null);
                const newDataState = await btn.getAttribute('data-state', { timeout: 1000 }).catch(() => null);

                const effect = detectInteractionEffect(
                  {
                    url: initialUrl,
                    bodyText: initialBodyText,
                    hasOpenOverlay: initialHasOverlay,
                    buttonAriaExpanded: ariaExpanded,
                    buttonAriaPressed: ariaPressed,
                    buttonAriaSelected: ariaSelected,
                    buttonDataState: dataState,
                  },
                  {
                    url: newUrl,
                    bodyText: newBodyText,
                    hasOpenOverlay: newHasOverlay,
                    buttonAriaExpanded: newAriaExpanded,
                    buttonAriaPressed: newAriaPressed,
                    buttonAriaSelected: newAriaSelected,
                    buttonDataState: newDataState,
                  },
                  correlatedRequestCompleted
                );

                if (!effect.hasEffect) {
                  addFinding({
                    role: roleDef.name,
                    route,
                    viewport: vp.name,
                    problem: 'Button with no handler effect',
                    evidence: `<button>${safety.accessibleName}</button> caused no state change or request`,
                  });
                }
              } catch (err: any) {
                const failure = classifyButtonInteractionFailure(safety.accessibleName, err);
                if (failure.isError && failure.problem && failure.evidence) {
                  addFinding({
                    role: roleDef.name,
                    route,
                    viewport: vp.name,
                    problem: failure.problem,
                    evidence: failure.evidence,
                  });
                }
              } finally {
                page.off('request', clickRequestHandler);
                page.off('response', clickResponseHandler);
                requestsInitiatedDuringClick.clear();
                // If button click navigated away, return to the route being crawled
                if (page.url() !== initialUrl) {
                  await page.goto(route, { waitUntil: 'load', timeout: 10000 }).catch(() => {});
                  await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
                  await page.waitForTimeout(300);
                } else {
                  // Press Escape to dismiss any open dropdown/sheet overlay that would block subsequent buttons
                  await page.keyboard.press('Escape').catch(() => {});
                }
              }
            }

            // 8. Screenshot per page and role
            const cleanRoute =
              route === '/' ? 'root' : route.replace(/[^a-z0-9]/gi, '_').replace(/^_+/, '');
            const screenshotName = `${roleDef.name.replace(/\s+/g, '_')}-${cleanRoute}-${vp.name}.png`;
            const screenshotPath = path.join(CRAWL_DIR, screenshotName);

            try {
              await page.screenshot({ path: screenshotPath, fullPage: false });
            } catch (err: any) {
              const failure = classifyScreenshotFailure(screenshotPath, err, page.isClosed());
              addFinding({
                role: roleDef.name,
                route,
                viewport: vp.name,
                problem: failure.problem,
                evidence: failure.evidence,
              });
            }
          } finally {
            // Ensure findings generated during button testing, interaction handlers,
            // or screenshot operations are harvested before the route listener scope finishes.
            recordCollectorFindings(collectors, roleDef.name, route, vp.name);
          }
        });
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
  markdown += `| Role | Route | Viewport | Problem | Evidence |\n`;
  markdown += `|---|---|---|---|---|\n`;

  if (allFindings.length === 0) {
    markdown += `| *All* | *All* | *All* | None | Crawl clean with 0 issues detected. |\n`;
  } else {
    for (const f of allFindings) {
      const cleanEv = f.evidence.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 200);
      markdown += `| ${f.role} | \`${f.route}\` | ${f.viewport} | ${f.problem} | ${cleanEv} |\n`;
    }
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, markdown, 'utf-8');
  console.log(`\nCrawl complete. Report written to ${REPORT_PATH}`);
});

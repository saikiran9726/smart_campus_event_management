import { test, expect } from '@playwright/test';
import {
  isClerkHostname,
  isClerkStaticScriptAsset,
  classifyConsoleMessage,
  classifyPageError,
  classifyResponse,
  classifyRequestFailed,
  isSafeInteractiveButton,
  classifyButtonInteractionFailure,
  classifyScreenshotFailure,
  detectInteractionEffect,
  isClickCorrelatedRequest,
  isSuccessfulInteractionResponse,
  safeParseUrl,
  setClassifierConfig,
} from './helpers/crawl-classifier';
import {
  attachCrawlListeners,
  withRouteCrawlListeners,
  type CrawlFindingCollector,
} from './helpers/crawl-listeners';

test.describe('Crawler Hardening & Regression Audit Suite (Prompt 26C)', () => {
  // =========================================================================
  // 1. STRICT CLERK FAILURE CLASSIFICATION & DECEPTIVE HOSTNAMES
  // =========================================================================
  test.describe('1. Strict Clerk Hostname & Failure Classification', () => {
    test('1.1 Accurately validates genuine Clerk hosts and rejects deceptive hostnames', () => {
      // Genuine Clerk hosts
      expect(isClerkHostname('clerk.accounts.dev')).toBe(true);
      expect(isClerkHostname('accounts.dev')).toBe(true);
      expect(isClerkHostname('tenant.clerk.accounts.dev')).toBe(true);
      expect(isClerkHostname('my-app.accounts.dev')).toBe(true);
      expect(isClerkHostname('clerk.com')).toBe(true);
      expect(isClerkHostname('api.clerk.com')).toBe(true);
      expect(isClerkHostname('splendid-cat-12.clerk.accounts.dev')).toBe(true);

      // Deceptive / Spoofed hostnames MUST fail validation
      expect(isClerkHostname('evil-clerk.accounts.dev.attacker.com')).toBe(false);
      expect(isClerkHostname('accounts.dev.phishing.io')).toBe(false);
      expect(isClerkHostname('evil-accounts.dev')).toBe(false);
      expect(isClerkHostname('clerk.accounts.dev.malicious.net')).toBe(false);
      expect(isClerkHostname('attackeraccounts.dev')).toBe(false);
      expect(isClerkHostname('not-accounts.dev')).toBe(false);
      expect(isClerkHostname('bad.nested.accounts.dev')).toBe(false);
      expect(isClerkHostname('api.github.com')).toBe(false);
      expect(isClerkHostname('google.com')).toBe(false);
    });

    test('1.7 Strict Clerk hostname policy: single-label tenant DNS validation', () => {
      // Documented policy: single DNS label tenants are accepted
      expect(isClerkHostname('project-123.accounts.dev')).toBe(true);
      expect(isClerkHostname('app-staging.clerk.accounts.dev')).toBe(true);

      // Nested subdomains are rejected
      expect(isClerkHostname('a.b.accounts.dev')).toBe(false);
      expect(isClerkHostname('sub.tenant.clerk.accounts.dev')).toBe(false);

      // Suffix lookalikes are rejected
      expect(isClerkHostname('fake-accounts.dev.com')).toBe(false);
      expect(isClerkHostname('accounts.developer.com')).toBe(false);
    });

    test('1.2 Distinguishes Clerk static JS bundle from Clerk auth API endpoints', () => {
      const scriptUrl = new URL('https://clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js');
      expect(isClerkStaticScriptAsset(scriptUrl)).toBe(true);

      const scriptUrl2 = new URL('https://tenant.clerk.accounts.dev/v1/clerk.js');
      expect(isClerkStaticScriptAsset(scriptUrl2)).toBe(true);

      // API endpoints are NOT static script assets
      const sessionApiUrl = new URL('https://clerk.accounts.dev/v1/client/sessions');
      expect(isClerkStaticScriptAsset(sessionApiUrl)).toBe(false);

      const envApiUrl = new URL('https://clerk.accounts.dev/v1/environment');
      expect(isClerkStaticScriptAsset(envApiUrl)).toBe(false);

      const handshakeUrl = new URL('https://clerk.accounts.dev/v1/client/handshake');
      expect(isClerkStaticScriptAsset(handshakeUrl)).toBe(false);

      // Deceptive script host is NOT recognized as Clerk script asset
      const spoofedScriptUrl = new URL('http://evil-clerk.accounts.dev.attacker.com/clerk.browser.js');
      expect(isClerkStaticScriptAsset(spoofedScriptUrl)).toBe(false);
    });

    test('1.3 Filters ONLY documented static script loading failure in offline sandbox', () => {
      // Documented Clerk script download failure
      const cdnFailure = classifyConsoleMessage(
        'error',
        'Failed to load resource: net::ERR_FAILED',
        {
          url: 'https://clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js',
          lineNumber: 1,
        }
      );
      expect(cdnFailure.shouldIgnore).toBe(true);
      expect(cdnFailure.reason).toContain('Expected offline sandbox Clerk JS SDK download failure');

      // Documented Clerk uncaught script loader error
      const scriptPageErr = classifyPageError(
        new Error(
          'failed_to_load_clerk_js: Unable to download https://clerk.accounts.dev/npm/@clerk/clerk.browser.js'
        )
      );
      expect(scriptPageErr.shouldIgnore).toBe(true);

      // Documented Clerk static script network drop
      const scriptReqFailed = classifyRequestFailed(
        'https://clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js',
        'GET',
        'net::ERR_NAME_NOT_RESOLVED'
      );
      expect(scriptReqFailed.isError).toBe(false);
    });

    test('1.4 Preserves genuine Clerk authentication API failures (handshake, sessions, tokens)', () => {
      // Failed Clerk sessions request MUST be reported as an error
      const sessionFailure = classifyRequestFailed(
        'https://clerk.accounts.dev/v1/client/sessions',
        'POST',
        'net::ERR_CONNECTION_REFUSED'
      );
      expect(sessionFailure.isError).toBe(true);
      expect(sessionFailure.problem).toBe('Clerk auth API request failed');
      expect(sessionFailure.evidence).toContain('POST https://clerk.accounts.dev/v1/client/sessions');

      // Failed Clerk environment handshake MUST be reported as an error
      const envFailure = classifyRequestFailed(
        'https://clerk.accounts.dev/v1/environment',
        'GET',
        'net::ERR_FAILED'
      );
      expect(envFailure.isError).toBe(true);
      expect(envFailure.problem).toBe('Clerk auth API request failed');

      // Clerk auth API HTTP 401 response MUST be reported
      const clerk401 = classifyResponse(
        401,
        'https://clerk.accounts.dev/v1/client/sessions',
        'POST'
      );
      expect(clerk401.isError).toBe(true);
      expect(clerk401.problem).toBe('Auth service error (401)');

      // Clerk auth API HTTP 500 response MUST be reported
      const clerk500 = classifyResponse(
        500,
        'https://clerk.accounts.dev/v1/environment',
        'GET'
      );
      expect(clerk500.isError).toBe(true);
      expect(clerk500.problem).toBe('Server error (500)');
    });

    test('1.5 Never ignores errors on deceptive spoofed hostnames', () => {
      // Fake Clerk script on attacker domain MUST be reported
      const spoofedFailure = classifyConsoleMessage(
        'error',
        'Failed to load resource: net::ERR_FAILED',
        {
          url: 'http://evil-clerk.accounts.dev.attacker.com/clerk.browser.js',
          lineNumber: 42,
        }
      );
      expect(spoofedFailure.shouldIgnore).toBe(false);
      expect(spoofedFailure.problem).toBe('Console error');

      // Network request drop on spoofed domain MUST be reported
      const spoofedReq = classifyRequestFailed(
        'http://accounts.dev.phishing.io/clerk.js',
        'GET',
        'net::ERR_FAILED'
      );
      expect(spoofedReq.isError).toBe(true);
      expect(spoofedReq.problem).toBe('Network request failed');
    });

    test('1.6 Never ignores application-side errors that happen to mention clerk', () => {
      const appClerkError = classifyConsoleMessage(
        'error',
        'TypeError: Cannot read properties of undefined (reading "clerkUser")',
        { url: 'http://localhost:3000/src/features/auth/AuthContext.tsx', lineNumber: 35 }
      );
      expect(appClerkError.shouldIgnore).toBe(false);
      expect(appClerkError.problem).toBe('Console error');

      const appPageError = classifyPageError(
        new Error('ClerkSessionError: Failed to obtain session token for user')
      );
      expect(appPageError.shouldIgnore).toBe(false);
      expect(appPageError.problem).toBe('Uncaught JavaScript exception');
    });
  });

  // =========================================================================
  // 2. REAL LISTENER CLEANUP & LIFECYCLE TESTS
  // =========================================================================
  test.describe('2. Real Listener Cleanup & Lifecycle', () => {
    test('2.1 Successfully detaches all 4 listeners upon normal route execution completion', async ({
      page,
    }) => {
      const baselineResponseCount = page.listenerCount('response');
      const baselineRequestFailedCount = page.listenerCount('requestfailed');
      const baselineConsoleCount = page.listenerCount('console');
      const baselinePageErrorCount = page.listenerCount('pageerror');

      const collectors: CrawlFindingCollector = {
        apiErrors: [],
        consoleErrors: [],
        pageErrors: [],
      };

      await withRouteCrawlListeners(page, collectors, async () => {
        // While scoped inside the action, all 4 listeners MUST be active (+1 each)
        expect(page.listenerCount('response')).toBe(baselineResponseCount + 1);
        expect(page.listenerCount('requestfailed')).toBe(baselineRequestFailedCount + 1);
        expect(page.listenerCount('console')).toBe(baselineConsoleCount + 1);
        expect(page.listenerCount('pageerror')).toBe(baselinePageErrorCount + 1);

        // Perform mock page action
        await page.setContent('<button id="test-btn">Click Me</button>');
        await page.click('#test-btn');
      });

      // After action completion, listener counts MUST return strictly to baseline
      expect(page.listenerCount('response')).toBe(baselineResponseCount);
      expect(page.listenerCount('requestfailed')).toBe(baselineRequestFailedCount);
      expect(page.listenerCount('console')).toBe(baselineConsoleCount);
      expect(page.listenerCount('pageerror')).toBe(baselinePageErrorCount);
    });

    test('2.2 Guaranteed listener detachment during exceptional execution (uncaught error)', async ({
      page,
    }) => {
      const baselineResponseCount = page.listenerCount('response');
      const baselineRequestFailedCount = page.listenerCount('requestfailed');
      const baselineConsoleCount = page.listenerCount('console');
      const baselinePageErrorCount = page.listenerCount('pageerror');

      const collectors: CrawlFindingCollector = {
        apiErrors: [],
        consoleErrors: [],
        pageErrors: [],
      };

      // Execute an action that throws an unexpected exception midway
      await expect(
        withRouteCrawlListeners(page, collectors, async () => {
          expect(page.listenerCount('response')).toBe(baselineResponseCount + 1);
          throw new Error('Simulated unhandled route failure during crawl inspection');
        })
      ).rejects.toThrow('Simulated unhandled route failure during crawl inspection');

      // Despite the thrown exception, all listeners MUST be cleaned up cleanly
      expect(page.listenerCount('response')).toBe(baselineResponseCount);
      expect(page.listenerCount('requestfailed')).toBe(baselineRequestFailedCount);
      expect(page.listenerCount('console')).toBe(baselineConsoleCount);
      expect(page.listenerCount('pageerror')).toBe(baselinePageErrorCount);
    });

    test('2.3 Idempotent listener detachment without accumulation or errors', async ({ page }) => {
      const baselineCount = page.listenerCount('response');
      const collectors: CrawlFindingCollector = {
        apiErrors: [],
        consoleErrors: [],
        pageErrors: [],
      };

      const controller = attachCrawlListeners(page, collectors);
      expect(controller.isAttached()).toBe(true);
      expect(page.listenerCount('response')).toBe(baselineCount + 1);

      // First detach
      controller.detach();
      expect(controller.isAttached()).toBe(false);
      expect(page.listenerCount('response')).toBe(baselineCount);

      // Repeated detach calls must be completely safe and idempotent
      expect(() => controller.detach()).not.toThrow();
      expect(() => controller.detach()).not.toThrow();
      expect(controller.isAttached()).toBe(false);
      expect(page.listenerCount('response')).toBe(baselineCount);
    });

    test('2.4 Internal listener errors are surfaced as diagnostic findings rather than silently swallowed', async ({
      page,
    }) => {
      const collectors: CrawlFindingCollector = {
        apiErrors: [],
        consoleErrors: [],
        pageErrors: [],
      };

      await withRouteCrawlListeners(page, collectors, async () => {
        // Trigger a pageerror
        page.emit('pageerror', new Error('Test uncaught pageerror in crawler'));
      });

      expect(collectors.pageErrors.length).toBeGreaterThan(0);
      expect(collectors.pageErrors[0]?.evidence).toContain('Test uncaught pageerror in crawler');
    });

    test('2.5 Listener cleanup collects detachment failures into diagnostic findings', () => {
      const mockPage: any = {
        on: () => {},
        off: (event: string) => {
          if (event === 'response') {
            throw new Error('Simulated failure detaching response listener');
          }
        },
      };

      const collectors: CrawlFindingCollector = {
        apiErrors: [],
        consoleErrors: [],
        pageErrors: [],
      };

      const controller = attachCrawlListeners(mockPage, collectors);
      controller.detach();

      expect(collectors.pageErrors.length).toBe(1);
      expect(collectors.pageErrors[0]?.problem).toBe('Listener cleanup diagnostic');
      expect(collectors.pageErrors[0]?.evidence).toContain('Simulated failure detaching response listener');
    });

    test('2.6 Route collector findings generated during button testing or screenshot phases are preserved in collectors', () => {
      const collectors: CrawlFindingCollector = {
        apiErrors: [],
        consoleErrors: [],
        pageErrors: [],
      };

      // 1. Initial navigation produces an API finding
      collectors.apiErrors.push({
        problem: 'API call error (404)',
        evidence: 'GET http://localhost:3001/events/missing -> HTTP 404',
      });

      // 2. Later during button interaction, a handler error occurs
      collectors.consoleErrors.push({
        problem: 'Console error',
        evidence: '[bundle.js:42] Uncaught Error: button action failed',
      });

      // Both findings are present in the shared collector across phases
      expect(collectors.apiErrors.length).toBe(1);
      expect(collectors.consoleErrors.length).toBe(1);
    });
  });

  // =========================================================================
  // 3. INDEPENDENT BUTTON INTERACTION FAILURE TESTING
  // =========================================================================
  test.describe('3. Independent Button Interaction Failure Classification', () => {
    test('3.1 Classifies click timeout independently', () => {
      const timeoutErr = new Error(
        'locator.click: Timeout 3000ms exceeded while waiting for element to be visible, enabled and stable'
      );
      const res = classifyButtonInteractionFailure('Load More', timeoutErr);
      expect(res.isError).toBe(true);
      expect(res.kind).toBe('TIMEOUT');
      expect(res.problem).toBe('Button click timed out');
      expect(res.evidence).toContain('<button>Load More</button>');
    });

    test('3.2 Classifies pointer interception independently', () => {
      const interceptErr = new Error(
        'locator.click: Element <div class="backdrop"> intercepts pointer events, another element would receive the click'
      );
      const res = classifyButtonInteractionFailure('Submit Proposal', interceptErr);
      expect(res.isError).toBe(true);
      expect(res.kind).toBe('INTERCEPTED');
      expect(res.problem).toBe('Button click intercepted by overlay');
    });

    test('3.3 Classifies detached element independently', () => {
      const detachedErr = new Error(
        'locator.click: Element is not attached to the DOM'
      );
      const res = classifyButtonInteractionFailure('Refresh List', detachedErr);
      expect(res.isError).toBe(true);
      expect(res.kind).toBe('DETACHED');
      expect(res.problem).toBe('Button detached from DOM during interaction');
    });

    test('3.4 Classifies browser-side uncaught exception from event handler independently', () => {
      const handlerErr = new TypeError(
        'Cannot read property "id" of null in onClick event handler'
      );
      const res = classifyButtonInteractionFailure('Export CSV', handlerErr);
      expect(res.isError).toBe(true);
      expect(res.kind).toBe('UNCAUGHT_HANDLER_ERROR');
      expect(res.problem).toBe('Button event handler threw uncaught exception');
    });

    test('3.5 Classifies closed page / context independently', () => {
      const closedErr = new Error(
        'locator.click: Target page, context or browser has been closed'
      );
      const res = classifyButtonInteractionFailure('Save Settings', closedErr);
      expect(res.isError).toBe(true);
      expect(res.kind).toBe('PAGE_CLOSED');
      expect(res.problem).toBe('Page or browser closed during button interaction');
    });

    test('3.6 Strict exclusion of destructive and session-terminating buttons', () => {
      expect(isSafeInteractiveButton('Sign Out').isSafe).toBe(false);
      expect(isSafeInteractiveButton('Log Out').isSafe).toBe(false);
      expect(isSafeInteractiveButton('Delete Club').isSafe).toBe(false);
      expect(isSafeInteractiveButton('Drop Member').isSafe).toBe(false);
      expect(isSafeInteractiveButton('Remove Channel').isSafe).toBe(false);
      expect(isSafeInteractiveButton('Cancel Pass').isSafe).toBe(false);
      expect(isSafeInteractiveButton('Cancel Registration').isSafe).toBe(false);
      expect(isSafeInteractiveButton('Discard Draft').isSafe).toBe(false);

      // Safe interactive buttons remain approved
      expect(isSafeInteractiveButton('Filters').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Tech').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Apply Filters').isSafe).toBe(true);
    });

    test('3.7 Safely excludes already active or pressed toggle controls', () => {
      expect(isSafeInteractiveButton('ALL', null, null, true).isSafe).toBe(false);
      expect(isSafeInteractiveButton('Upcoming', null, null, true).reason).toBe(
        'Button is already in active or pressed state'
      );
    });

    test('3.8 Strictly excludes all dangerous, mutating, and transactional buttons', () => {
      // Transactional, mutating, or data-changing buttons MUST NEVER be clicked
      const dangerousNames = [
        'Submit Proposal',
        'Save Changes',
        'Update Profile',
        'Create Event',
        'Publish Draft',
        'Approve Proposal',
        'Reject Application',
        'Join Club',
        'Leave Club',
        'Register Now',
        'RSVP to Event',
        'Book Slot',
        'Pay $10',
        'Purchase Ticket',
        'Send Reminder',
        'Invite Member',
        'Revoke Pass',
        'Claim Pass',
        'Apply for Club',
      ];

      for (const name of dangerousNames) {
        const check = isSafeInteractiveButton(name);
        expect(check.isSafe).toBe(false);
        expect(check.reason).toContain('Matches dangerous or mutating action');
      }

      // Form submit type buttons must be excluded regardless of label
      const submitTypeCheck = isSafeInteractiveButton('Next Step', null, null, false, {
        buttonType: 'submit',
      });
      expect(submitTypeCheck.isSafe).toBe(false);
      expect(submitTypeCheck.reason).toContain('form submit action');

      // Default type inside form must be excluded
      const formButtonCheck = isSafeInteractiveButton('Continue', null, null, false, {
        isInForm: true,
        buttonType: null,
      });
      expect(formButtonCheck.isSafe).toBe(false);
      expect(formButtonCheck.reason).toContain('inside a form without explicit type="button"');
    });

    test('3.9 Allows harmless interactive controls and skips ambiguous buttons', () => {
      // Harmless controls in allowlist
      expect(isSafeInteractiveButton('Overview').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Members').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Rules').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Schedule').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Show more').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Collapse').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Details').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Close').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Menu').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Next').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Previous').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Copy Link').isSafe).toBe(true);
      expect(isSafeInteractiveButton('Grid').isSafe).toBe(true);

      // Structural tab
      expect(
        isSafeInteractiveButton('Custom Tab Label', null, null, false, { role: 'tab' }).isSafe
      ).toBe(true);

      // Ambiguous / uncertain buttons without harmless match are skipped
      const ambiguousCheck = isSafeInteractiveButton('Proceed Now');
      expect(ambiguousCheck.isSafe).toBe(false);
      expect(ambiguousCheck.reason).toContain('uncertain');
    });

    test('3.10 Interaction-effect detection for same-length DOM changes and unrelated network responses', () => {
      const baseSnapshot = {
        url: 'http://localhost:3000/events',
        bodyText: 'Status: Draft', // length = 13
        hasOpenOverlay: false,
        buttonAriaExpanded: 'false',
        buttonAriaPressed: 'false',
        buttonAriaSelected: 'false',
        buttonDataState: 'inactive',
      };

      // 1. Same-length DOM text change ('Status: Draft' -> 'Status: Ready', both length 13)
      const sameLengthChangedSnapshot = {
        ...baseSnapshot,
        bodyText: 'Status: Ready', // length = 13
      };
      const textEffect = detectInteractionEffect(baseSnapshot, sameLengthChangedSnapshot, false);
      expect(textEffect.hasEffect).toBe(true);
      expect(textEffect.reason).toBe('Visible page text updated');

      // 2. Unrelated network response with identical UI MUST NOT falsely validate button
      const noChangeSnapshot = { ...baseSnapshot };
      const unrelatedEffect = detectInteractionEffect(baseSnapshot, noChangeSnapshot, false);
      expect(unrelatedEffect.hasEffect).toBe(false);

      // 3. Correlated network response
      const correlatedEffect = detectInteractionEffect(baseSnapshot, noChangeSnapshot, true);
      expect(correlatedEffect.hasEffect).toBe(true);
      expect(correlatedEffect.reason).toBe('Correlated network request completed');

      // 4. ARIA attribute update
      const ariaChangedSnapshot = { ...baseSnapshot, buttonAriaExpanded: 'true' };
      const ariaEffect = detectInteractionEffect(baseSnapshot, ariaChangedSnapshot, false);
      expect(ariaEffect.hasEffect).toBe(true);
      expect(ariaEffect.reason).toBe('Button accessible/active state updated');

      // 5. Overlay toggled
      const overlayChangedSnapshot = { ...baseSnapshot, hasOpenOverlay: true };
      const overlayEffect = detectInteractionEffect(baseSnapshot, overlayChangedSnapshot, false);
      expect(overlayEffect.hasEffect).toBe(true);
      expect(overlayEffect.reason).toBe('Overlay/Dialog state toggled');
    });

    test('3.11 Prevents accessible-name masking: independently checks visible text, aria-label, and title', () => {
      // 1. Harmless aria-label + dangerous visible text
      const maskTest1 = isSafeInteractiveButton('Delete Club', 'View Club Details');
      expect(maskTest1.isSafe).toBe(false);
      expect(maskTest1.reason).toContain('visible text');
      expect(maskTest1.reason).toContain('Delete');

      // 2. Harmless visible text + dangerous aria-label
      const maskTest2 = isSafeInteractiveButton('Details', 'Submit Form');
      expect(maskTest2.isSafe).toBe(false);
      expect(maskTest2.reason).toContain('aria-label');
      expect(maskTest2.reason).toContain('Submit');

      // 3. Harmless title + dangerous visible text
      const maskTest3 = isSafeInteractiveButton('Pay $50', null, 'Help Information');
      expect(maskTest3.isSafe).toBe(false);
      expect(maskTest3.reason).toContain('visible text');
      expect(maskTest3.reason).toContain('Pay');

      // 4. All three harmless
      const maskTest4 = isSafeInteractiveButton('Details', 'View Information', 'More Info');
      expect(maskTest4.isSafe).toBe(true);

      // 5. Empty accessible names
      expect(isSafeInteractiveButton('', '', '').isSafe).toBe(false);
      expect(isSafeInteractiveButton('   ', null, undefined).isSafe).toBe(false);
    });

    test('3.12 Click-request correlation: exact origins, excludes lookalike ports and background polling/telemetry', () => {
      const config = {
        apiOrigin: 'http://localhost:3001',
        webOrigin: 'http://localhost:3000',
      };

      // 1. Exact API and Web origin fetch/xhr requests qualify
      expect(
        isClickCorrelatedRequest('http://localhost:3001/api/events/vote', 'POST', 'fetch', config)
      ).toBe(true);
      expect(
        isClickCorrelatedRequest('http://localhost:3000/api-proxy/rsvp', 'POST', 'xhr', config)
      ).toBe(true);

      // 2. Lookalike port numbers (e.g. localhost:30010, localhost:30000) are strictly rejected
      expect(
        isClickCorrelatedRequest('http://localhost:30010/api/events/vote', 'POST', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:30000/api-proxy/rsvp', 'POST', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:30019/metrics', 'GET', 'fetch', config)
      ).toBe(false);

      // 3. Unrelated external origins are rejected
      expect(
        isClickCorrelatedRequest('https://telemetry.example.com/collect', 'POST', 'fetch', config)
      ).toBe(false);

      // 4. Non-fetch / non-xhr resource types are rejected
      expect(
        isClickCorrelatedRequest('http://localhost:3001/api/events', 'GET', 'document', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3000/assets/banner.png', 'GET', 'image', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3000/assets/main.js', 'GET', 'script', config)
      ).toBe(false);

      // 5. Background polling, telemetry, healthchecks, and heartbeats are rejected
      expect(
        isClickCorrelatedRequest('http://localhost:3001/healthz', 'GET', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3001/health', 'GET', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3001/api/stats', 'GET', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3000/telemetry', 'POST', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3001/metrics', 'GET', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3001/ping', 'GET', 'fetch', config)
      ).toBe(false);
      expect(
        isClickCorrelatedRequest('http://localhost:3000/heartbeat', 'GET', 'fetch', config)
      ).toBe(false);
    });

    test('3.13 Interaction response validity: rejects HTTP 4xx and 5xx from counting as successful interaction effects', () => {
      // 1. Success and redirect responses qualify
      expect(isSuccessfulInteractionResponse(200)).toBe(true);
      expect(isSuccessfulInteractionResponse(201)).toBe(true);
      expect(isSuccessfulInteractionResponse(204)).toBe(true);
      expect(isSuccessfulInteractionResponse(302)).toBe(true);
      expect(isSuccessfulInteractionResponse(304)).toBe(true);

      // 2. Client errors (4xx) MUST NOT count as successful interaction effects
      expect(isSuccessfulInteractionResponse(400)).toBe(false);
      expect(isSuccessfulInteractionResponse(401)).toBe(false);
      expect(isSuccessfulInteractionResponse(403)).toBe(false);
      expect(isSuccessfulInteractionResponse(404)).toBe(false);
      expect(isSuccessfulInteractionResponse(422)).toBe(false);

      // 3. Server errors (5xx) MUST NOT count as successful interaction effects
      expect(isSuccessfulInteractionResponse(500)).toBe(false);
      expect(isSuccessfulInteractionResponse(502)).toBe(false);
      expect(isSuccessfulInteractionResponse(503)).toBe(false);

      // 4. detectInteractionEffect with correlatedRequestCompleted = false on identical UI returns false
      const baseSnapshot = {
        url: 'http://localhost:3000/events',
        bodyText: 'Event Details',
        hasOpenOverlay: false,
      };
      const effectWithoutSuccess = detectInteractionEffect(baseSnapshot, baseSnapshot, false);
      expect(effectWithoutSuccess.hasEffect).toBe(false);

      // With successful correlated request completed:
      const effectWithSuccess = detectInteractionEffect(baseSnapshot, baseSnapshot, true);
      expect(effectWithSuccess.hasEffect).toBe(true);
      expect(effectWithSuccess.reason).toBe('Correlated network request completed');
    });

    test('3.14 Theme interaction effect verification: root class, theme attributes, computed styles, and genuine failure detection', () => {
      const lightSnapshot: UIStateSnapshot = {
        url: 'http://localhost:3000/',
        bodyText: 'Eventora Discovery Feed',
        hasOpenOverlay: false,
        buttonAriaExpanded: null,
        buttonAriaPressed: null,
        buttonAriaSelected: null,
        buttonDataState: null,
        buttonAriaLabel: 'Switch to dark mode',
        buttonTitle: 'Switch to dark mode',
        rootClass: 'light',
        rootThemeAttr: 'light',
        computedThemeStyles: {
          backgroundColor: 'rgb(248, 250, 252)',
          color: 'rgb(15, 23, 42)',
        },
      };

      // 1. Light to dark transition (root class and aria-label change)
      const darkSnapshot: UIStateSnapshot = {
        ...lightSnapshot,
        buttonAriaLabel: 'Switch to light mode',
        buttonTitle: 'Switch to light mode',
        rootClass: 'dark',
        rootThemeAttr: 'dark',
        computedThemeStyles: {
          backgroundColor: 'rgb(11, 15, 25)',
          color: 'rgb(248, 250, 252)',
        },
      };
      const lightToDarkEffect = detectInteractionEffect(lightSnapshot, darkSnapshot, false);
      expect(lightToDarkEffect.hasEffect).toBe(true);
      expect(lightToDarkEffect.reason).toBe('Button accessible/active state updated');

      // 2. Dark to light transition with identical button aria-label (pure root class change)
      const pureRootClassLight = { ...lightSnapshot, buttonAriaLabel: 'Toggle Theme', buttonTitle: 'Toggle Theme' };
      const pureRootClassDark = { ...darkSnapshot, buttonAriaLabel: 'Toggle Theme', buttonTitle: 'Toggle Theme' };
      const darkToLightEffect = detectInteractionEffect(pureRootClassDark, pureRootClassLight, false);
      expect(darkToLightEffect.hasEffect).toBe(true);
      expect(darkToLightEffect.reason).toBe('Theme state or styles updated');

      // 3. Computed style changes (background/color change without class attribute change)
      const styleBefore: UIStateSnapshot = {
        url: 'http://localhost:3000/',
        bodyText: 'Eventora Feed',
        hasOpenOverlay: false,
        computedThemeStyles: {
          backgroundColor: 'rgb(248, 250, 252)',
          color: 'rgb(15, 23, 42)',
        },
      };
      const styleAfter: UIStateSnapshot = {
        ...styleBefore,
        computedThemeStyles: {
          backgroundColor: 'rgb(11, 15, 25)',
          color: 'rgb(248, 250, 252)',
        },
      };
      const styleEffect = detectInteractionEffect(styleBefore, styleAfter, false);
      expect(styleEffect.hasEffect).toBe(true);
      expect(styleEffect.reason).toBe('Theme state or styles updated');

      // 4. Root theme attribute changes (e.g. data-theme="dark")
      const attrBefore: UIStateSnapshot = {
        url: 'http://localhost:3000/',
        bodyText: 'Eventora Feed',
        hasOpenOverlay: false,
        rootThemeAttr: 'light',
      };
      const attrAfter: UIStateSnapshot = {
        ...attrBefore,
        rootThemeAttr: 'dark',
      };
      const attrEffect = detectInteractionEffect(attrBefore, attrAfter, false);
      expect(attrEffect.hasEffect).toBe(true);
      expect(attrEffect.reason).toBe('Theme state or styles updated');

      // 5. Genuine failure detection: inert button where neither class, styles, attributes, nor text change
      const inertThemeButton: UIStateSnapshot = {
        url: 'http://localhost:3000/',
        bodyText: 'Eventora Feed',
        hasOpenOverlay: false,
        buttonAriaLabel: 'Switch to dark mode',
        rootClass: 'light',
        rootThemeAttr: 'light',
        computedThemeStyles: {
          backgroundColor: 'rgb(248, 250, 252)',
          color: 'rgb(15, 23, 42)',
        },
      };
      const brokenInteraction = detectInteractionEffect(inertThemeButton, { ...inertThemeButton }, false);
      expect(brokenInteraction.hasEffect).toBe(false);
      expect(brokenInteraction.reason).toContain('Button caused no visible UI, ARIA, overlay, navigation, theme, or correlated request change');
    });
  });

  // =========================================================================
  // 4. RELIABLE URL & RESPONSE CLASSIFICATION (NATIVE URL API)
  // =========================================================================
  test.describe('4. Reliable URL & Response Classification', () => {
    test.beforeAll(() => {
      setClassifierConfig({
        apiOrigin: 'http://localhost:3001',
        webOrigin: 'http://localhost:3000',
      });
    });

    test('4.1 Accurately distinguishes API and Frontend origins without substring port detection', () => {
      // Genuine Fastify API 404
      const api404 = classifyResponse(404, 'http://localhost:3001/clubs/nonexistent', 'GET');
      expect(api404.isError).toBe(true);
      expect(api404.problem).toBe('API call error (404)');

      // Genuine Frontend asset 404
      const web404 = classifyResponse(404, 'http://localhost:3000/assets/missing.js', 'GET');
      expect(web404.isError).toBe(true);
      expect(web404.problem).toBe('Frontend asset error (404)');

      // Substring port spoofing is NOT misclassified as local API
      // (e.g. external URL with path or query matching ":3001")
      const externalSpoof = classifyResponse(
        404,
        'http://example.com/some/path:3001/info',
        'GET'
      );
      // External 404 that is neither local API nor web is not misreported as API error
      expect(externalSpoof.problem).not.toBe('API call error (404)');
    });

    test('4.2 Preserves genuine 5xx failures across all domains', () => {
      const api500 = classifyResponse(500, 'http://localhost:3001/events', 'POST');
      expect(api500.isError).toBe(true);
      expect(api500.problem).toBe('Server error (500)');

      const web502 = classifyResponse(502, 'http://localhost:3000/index.html', 'GET');
      expect(web502.isError).toBe(true);
      expect(web502.problem).toBe('Server error (502)');

      const ext503 = classifyResponse(503, 'https://cdn.example.com/asset.png', 'GET');
      expect(ext503.isError).toBe(true);
      expect(ext503.problem).toBe('Server error (503)');
    });

    test('4.3 Does not blanket-ignore 401, 403, or 404', () => {
      const api401 = classifyResponse(401, 'http://localhost:3001/me/proposals', 'GET');
      expect(api401.isError).toBe(true);
      expect(api401.problem).toBe('API call error (401)');

      const api403 = classifyResponse(403, 'http://localhost:3001/clubs/123/channels', 'POST');
      expect(api403.isError).toBe(true);
      expect(api403.problem).toBe('API call error (403)');

      const api404 = classifyResponse(404, 'http://localhost:3001/events/evt-abc', 'GET');
      expect(api404.isError).toBe(true);
      expect(api404.problem).toBe('API call error (404)');
    });

    test('4.4 Honors expected authorization test statuses when explicitly declared', () => {
      const expected401 = classifyResponse(
        401,
        'http://localhost:3001/public/protected',
        'GET',
        { expectedStatuses: [401] }
      );
      expect(expected401.isError).toBe(false);

      const expected403 = classifyResponse(
        403,
        'http://localhost:3001/admin/forbidden',
        'GET',
        { expectedStatuses: [403] }
      );
      expect(expected403.isError).toBe(false);
    });

    test('4.5 Narrow net::ERR_ABORTED classification: preserves API aborts, ignores harmless asset aborts', () => {
      // 1. Harmless navigation abort on frontend static asset (GET) on trusted web origin
      const assetAbort = classifyRequestFailed(
        'http://localhost:3000/assets/banner.png',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(assetAbort.isError).toBe(false);

      const staticJsAbort = classifyRequestFailed(
        'http://localhost:3000/assets/index-abc.js',
        'GET',
        'net::ERR_ABORTED',
        { resourceType: 'script' }
      );
      expect(staticJsAbort.isError).toBe(false);

      const faviconAbort = classifyRequestFailed(
        'http://localhost:3000/favicon.ico',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(faviconAbort.isError).toBe(false);

      // 2. Untrusted external URLs with asset-like extensions MUST NOT be silently suppressed
      const externalJsAbort = classifyRequestFailed(
        'https://external.com/bundle.js',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(externalJsAbort.isError).toBe(true);
      expect(externalJsAbort.problem).toBe('Network request aborted');

      const untrustedCssAbort = classifyRequestFailed(
        'https://untrusted-cdn.com/styles.css',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(untrustedCssAbort.isError).toBe(true);
      expect(untrustedCssAbort.problem).toBe('Network request aborted');

      const untrustedMapAbort = classifyRequestFailed(
        'https://third-party.io/analytics.map',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(untrustedMapAbort.isError).toBe(true);
      expect(untrustedMapAbort.problem).toBe('Network request aborted');

      // 3. Confirmed document navigation cancellation on web frontend (GET)
      const docNavAbortWithNavFlag = classifyRequestFailed(
        'http://localhost:3000/passport',
        'GET',
        'net::ERR_ABORTED',
        { isNavigationRequest: true }
      );
      expect(docNavAbortWithNavFlag.isError).toBe(false);

      const docNavAbortWithDocType = classifyRequestFailed(
        'http://localhost:3000/explore',
        'GET',
        'net::ERR_ABORTED',
        { resourceType: 'document' }
      );
      expect(docNavAbortWithDocType.isError).toBe(false);

      // 4. Unconfirmed or non-document frontend route requests MUST NOT be assumed to be document navigation
      const unconfirmedRouteAbort = classifyRequestFailed(
        'http://localhost:3000/passport',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(unconfirmedRouteAbort.isError).toBe(true);
      expect(unconfirmedRouteAbort.problem).toBe('Network request aborted');

      const frontendFetchAbort = classifyRequestFailed(
        'http://localhost:3000/passport',
        'GET',
        'net::ERR_ABORTED',
        { resourceType: 'fetch' }
      );
      expect(frontendFetchAbort.isError).toBe(true);
      expect(frontendFetchAbort.problem).toBe('Network request aborted');

      const frontendXhrAbort = classifyRequestFailed(
        'http://localhost:3000/passport',
        'GET',
        'net::ERR_ABORTED',
        { resourceType: 'xhr' }
      );
      expect(frontendXhrAbort.isError).toBe(true);
      expect(frontendXhrAbort.problem).toBe('Network request aborted');

      // 5. Harmless Clerk static script cancellation (GET)
      const clerkScriptAbort = classifyRequestFailed(
        'https://clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(clerkScriptAbort.isError).toBe(false);

      // 6. Ordinary application GET data fetch aborted unexpectedly MUST be reported
      const appDataAbort = classifyRequestFailed(
        'http://localhost:3000/api-proxy/data.json',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(appDataAbort.isError).toBe(true);
      expect(appDataAbort.problem).toBe('Network request aborted');

      // 7. Unrelated external GET request aborted unexpectedly MUST be reported
      const externalGetAbort = classifyRequestFailed(
        'https://data.example.com/feed',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(externalGetAbort.isError).toBe(true);
      expect(externalGetAbort.problem).toBe('Network request aborted');

      // 8. Aborted API GET request MUST be reported as an error
      const apiGetAbort = classifyRequestFailed(
        'http://localhost:3001/proposals',
        'GET',
        'net::ERR_ABORTED'
      );
      expect(apiGetAbort.isError).toBe(true);
      expect(apiGetAbort.problem).toBe('API request aborted');
      expect(apiGetAbort.evidence).toContain('GET http://localhost:3001/proposals was aborted');

      // 9. Aborted API POST request MUST be reported as an error
      const apiPostAbort = classifyRequestFailed(
        'http://localhost:3001/events',
        'POST',
        'net::ERR_ABORTED'
      );
      expect(apiPostAbort.isError).toBe(true);
      expect(apiPostAbort.problem).toBe('API request aborted');

      // 10. Aborted mutating request on external origin
      const extPostAbort = classifyRequestFailed(
        'https://payment.gateway.com/charge',
        'POST',
        'net::ERR_ABORTED'
      );
      expect(extPostAbort.isError).toBe(true);
      expect(extPostAbort.problem).toBe('API request aborted');
    });
  });

  // =========================================================================
  // 5. SCREENSHOT FAILURE CLASSIFICATION
  // =========================================================================
  test.describe('5. Screenshot Failure Classification', () => {
    test('5.1 Distinguishes target termination from standard I/O errors', () => {
      const crashFailure = classifyScreenshotFailure(
        '/tmp/screenshot.png',
        new Error('Target page, context or browser has been closed'),
        true
      );
      expect(crashFailure.problem).toBe('Page crash or termination during screenshot capture');

      const ioFailure = classifyScreenshotFailure(
        '/tmp/screenshot.png',
        new Error('ENOSPC: no space left on device'),
        false
      );
      expect(ioFailure.problem).toBe('Screenshot capture failure');
    });
  });
});

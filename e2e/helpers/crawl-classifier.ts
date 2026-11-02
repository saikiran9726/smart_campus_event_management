/**
 * Eventora Crawl Classifier & Audit Engine (Prompt 26C)
 *
 * Provides strict, evidence-based classification for:
 * 1. Clerk script loading vs genuine Clerk authentication API errors.
 * 2. Exact native URL hostname parsing (eliminates substring spoofing).
 * 3. Exact origin matching for API (:3001) and Frontend (:3000) (eliminates substring port checks).
 * 4. Specific 4xx/5xx HTTP response classification with zero blanket ignores.
 * 5. Distinct button failure kinds: timeout, pointer interception, detached, page closed, handler errors.
 * 6. Screenshot error classification distinguishing target termination from I/O failure.
 */

export interface ConsoleClassification {
  shouldIgnore: boolean;
  reason?: string;
  problem?: string;
  evidence?: string;
}

export interface PageErrorClassification {
  shouldIgnore: boolean;
  reason?: string;
  problem?: string;
  evidence?: string;
}

export interface NetworkClassification {
  isError: boolean;
  problem?: string;
  evidence?: string;
}

export interface ButtonSafetyCheck {
  isSafe: boolean;
  reason?: string;
  accessibleName: string;
}

export type ButtonFailureKind =
  | 'TIMEOUT'
  | 'INTERCEPTED'
  | 'DETACHED'
  | 'PAGE_CLOSED'
  | 'UNCAUGHT_HANDLER_ERROR'
  | 'UNKNOWN';

export interface ButtonInteractionClassification {
  isError: boolean;
  kind: ButtonFailureKind;
  problem: string;
  evidence: string;
}

export interface ClassifierConfig {
  apiOrigin?: string;
  webOrigin?: string;
}

let activeConfig: ClassifierConfig = {
  apiOrigin: process.env.PUBLIC_API_URL || 'http://localhost:3001',
  webOrigin: process.env.PUBLIC_WEB_URL || 'http://localhost:3000',
};

export function setClassifierConfig(config: ClassifierConfig): void {
  activeConfig = { ...activeConfig, ...config };
}

export function getClassifierConfig(): ClassifierConfig {
  return activeConfig;
}

/**
 * Safely parses a URL string using native URL API without throwing.
 */
export function safeParseUrl(rawUrl: string, baseOrigin?: string): URL | null {
  try {
    return new URL(rawUrl, baseOrigin || activeConfig.webOrigin || 'http://localhost:3000');
  } catch {
    return null;
  }
}

/**
 * Validates that a hostname strictly adheres to Clerk's official domains.
 *
 * Intended Clerk Hostname Policy:
 * 1. Base Development: 'clerk.accounts.dev', 'accounts.dev'
 * 2. Production API: 'clerk.com', 'api.clerk.com'
 * 3. Tenant Development: '<tenant>.clerk.accounts.dev' and '<tenant>.accounts.dev'
 *    where <tenant> is a single DNS label ([a-z0-9]([a-z0-9-]*[a-z0-9])?).
 *    Multi-level nested subdomains (e.g. 'bad.nested.accounts.dev') are rejected.
 * 4. Lookalike and spoofed domains (e.g. 'evil-clerk.accounts.dev.attacker.com',
 *    'not-accounts.dev', 'accounts.dev.phishing.io') are strictly rejected.
 */
export function isClerkHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();

  // 1. Exact base hosts
  if (
    host === 'clerk.accounts.dev' ||
    host === 'accounts.dev' ||
    host === 'clerk.com' ||
    host === 'api.clerk.com'
  ) {
    return true;
  }

  const dnsLabelRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

  // 2. Tenant under .clerk.accounts.dev (e.g. tenant.clerk.accounts.dev)
  const clerkDevSuffix = '.clerk.accounts.dev';
  if (host.endsWith(clerkDevSuffix)) {
    const tenant = host.slice(0, -clerkDevSuffix.length);
    return dnsLabelRegex.test(tenant);
  }

  // 3. Tenant under .accounts.dev (e.g. my-app.accounts.dev)
  const accountsDevSuffix = '.accounts.dev';
  if (host.endsWith(accountsDevSuffix)) {
    const tenant = host.slice(0, -accountsDevSuffix.length);
    return dnsLabelRegex.test(tenant);
  }

  return false;
}

/**
 * Checks whether a URL targets the static Clerk frontend JS bundle
 * (which is legitimately unreachable in an offline/sandboxed test environment).
 */
export function isClerkStaticScriptAsset(urlObj: URL): boolean {
  if (!isClerkHostname(urlObj.hostname)) {
    return false;
  }
  const pathname = urlObj.pathname.toLowerCase();
  return (
    pathname.endsWith('.js') ||
    pathname.endsWith('.mjs') ||
    pathname.includes('/npm/@clerk/') ||
    pathname.includes('clerk.browser.js') ||
    pathname.includes('clerk.js')
  );
}

/**
 * Patterns for buttons that should NOT be clicked automatically by the crawler:
 * - Session termination (Sign out, Log out)
 * - Data destruction (Delete, Drop, Remove, Cancel Pass, Discard, Destroy)
 */
export const DESTRUCTIVE_OR_NAV_PATTERNS: RegExp[] = [
  /\bsign\s*out\b/i,
  /\blog\s*out\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\bremove\b/i,
  /\bcancel\s*pass\b/i,
  /\bcancel\s*registration\b/i,
  /\bdiscard\b/i,
  /\bdestroy\b/i,
];

/**
 * Strict set of dangerous, mutating, or transactional action patterns.
 * Crawler must NEVER trigger any persistent data modification or transaction.
 */
export const DANGEROUS_OR_MUTATING_PATTERNS: RegExp[] = [
  ...DESTRUCTIVE_OR_NAV_PATTERNS,
  /\bsubmit\b/i,
  /\bsave\b/i,
  /\bupdate\b/i,
  /\bcreate\b/i,
  /\bpublish\b/i,
  /\bpost\b/i,
  /\bapprove\b/i,
  /\breject\b/i,
  /\bdecide\b/i,
  /\bjoin\b/i,
  /\bleave\b/i,
  /\bregister\b/i,
  /\brsvp\b/i,
  /\bbook\b/i,
  /\breserve\b/i,
  /\bcheck\s*in\b/i,
  /\bscan\b/i,
  /\bpay\b/i,
  /\bpurchase\b/i,
  /\bbuy\b/i,
  /\bcheckout\b/i,
  /\btransfer\b/i,
  /\brefund\b/i,
  /\bsend\b/i,
  /\binvite\b/i,
  /\bresend\b/i,
  /\bnotify\b/i,
  /\brevoke\b/i,
  /\bstrike\b/i,
  /\bsign\s*in\b/i,
  /\blog\s*in\b/i,
  /\bsign\s*up\b/i,
  /\bclaim\b/i,
  /\bapply\s+(for|to|now|pass|membership|role)\b/i,
];

/**
 * Explicit allowlist of harmless interactive controls:
 * Navigation, tab switching, expanding/collapsing sections, opening menus, non-mutating filters.
 */
export const HARMLESS_INTERACTION_PATTERNS: RegExp[] = [
  // Tab and navigation view switching
  /\ball\b/i,
  /\bupcoming\b/i,
  /\bpast\b/i,
  /\bdetails\b/i,
  /\boverview\b/i,
  /\bgeneral\b/i,
  /\bmembers\b/i,
  /\bsettings\b/i,
  /\bteams\b/i,
  /\brules\b/i,
  /\bschedule\b/i,
  /\bfaq\b/i,
  /\babout\b/i,
  /\banalytics\b/i,
  /\bbudget\b/i,
  /\binfo\b/i,
  /\bdiscussion\b/i,
  /\bchannels?\b/i,
  // Filters & sorting & categories
  /\bfilters?\b/i,
  /\bsort\b/i,
  /\bcategory\b/i,
  /\bclear\s*filters?\b/i,
  /\breset\s*filters?\b/i,
  /\btech\b/i,
  /\bcultural\b/i,
  /\bsports\b/i,
  /\bacademic\b/i,
  /\bworkshop\b/i,
  /\bhackathon\b/i,
  /\bcompetition\b/i,
  // Accordions, expand/collapse
  /\bshow\s*more\b/i,
  /\bshow\s*less\b/i,
  /\bexpand\b/i,
  /\bcollapse\b/i,
  /\bread\s*more\b/i,
  /\bpreview\b/i,
  // Modals, menus, popovers (read-only inspection/dismissal)
  /\bmenu\b/i,
  /\bopen\s*menu\b/i,
  /\bclose\b/i,
  /\bdismiss\b/i,
  /\btoggle\b/i,
  // Pagination & simple navigation
  /\bnext\b/i,
  /\bprev\b/i,
  /\bprevious\b/i,
  /\bpage\s*\d+\b/i,
  /\bback\b/i,
  /\bgo\s*back\b/i,
  /\bexplore\b/i,
  // Read-only inspection / share
  /\bcopy\b/i,
  /\bcopy\s*link\b/i,
  /\bshare\b/i,
  /\bdownload\b/i,
  /\bexport\b/i,
  /\bprint\b/i,
  // View & theme switches
  /\bgrid\b/i,
  /\blist\b/i,
  /\bdark\b/i,
  /\blight\b/i,
];

/**
 * Classifies console messages with strict, native URL parsing.
 */
export function classifyConsoleMessage(
  type: string,
  text: string,
  location?: { url?: string; lineNumber?: number; columnNumber?: number }
): ConsoleClassification {
  // Only classify error-level messages
  if (type !== 'error') {
    return { shouldIgnore: true, reason: 'Non-error console level (log/info/debug/warn)' };
  }

  // Filter Axe devtool informational suggestions (not errors)
  if (text.startsWith('Fix any of the following:') || text.includes('https://dequeuniversity.com/rules/axe/')) {
    return {
      shouldIgnore: true,
      reason: 'Axe accessibility devtool suggestion notice',
    };
  }

  const rawUrl = location?.url || '';
  const parsedLocUrl = rawUrl ? safeParseUrl(rawUrl) : null;

  // Check if console error explicitly originates from a Clerk static script download failure
  if (parsedLocUrl && isClerkHostname(parsedLocUrl.hostname)) {
    const isScript = isClerkStaticScriptAsset(parsedLocUrl);
    const isNetworkLoadErr =
      text.includes('net::ERR_FAILED') ||
      text.includes('net::ERR_NAME_NOT_RESOLVED') ||
      text.includes('Failed to load resource: net::ERR_FAILED');

    if (isScript && isNetworkLoadErr) {
      return {
        shouldIgnore: true,
        reason: 'Expected offline sandbox Clerk JS SDK download failure',
      };
    }

    // Do NOT ignore genuine Clerk API errors, authentication rejections, or script errors!
    return {
      shouldIgnore: false,
      problem: 'Console error',
      evidence: `[${rawUrl}:${location?.lineNumber || 0}] ${text}`,
    };
  }

  // Check browser CORS preflight failure for Clerk static bundle
  if (text.includes('blocked by CORS policy')) {
    // Extract any URL mentioned in the text
    const match = text.match(/https?:\/\/[^\s'"]+/);
    if (match) {
      const parsedCorsUrl = safeParseUrl(match[0]);
      if (parsedCorsUrl && isClerkHostname(parsedCorsUrl.hostname) && isClerkStaticScriptAsset(parsedCorsUrl)) {
        return {
          shouldIgnore: true,
          reason: 'Expected CORS preflight failure for Clerk static script in sandbox',
        };
      }
    }
  }

  // All other console.error messages MUST be reported!
  return {
    shouldIgnore: false,
    problem: 'Console error',
    evidence: rawUrl ? `[${rawUrl}:${location?.lineNumber || 0}] ${text}` : text,
  };
}

/**
 * Classifies uncaught page errors (window.onerror / pageerror).
 */
export function classifyPageError(err: Error | string): PageErrorClassification {
  const message = typeof err === 'string' ? err : err.message || String(err);
  const stack = typeof err === 'string' ? '' : err.stack || '';

  // Extract URLs mentioned in stack or message to check if it's the specific Clerk CDN script failure
  const isClerkCdnScriptLoadError =
    message.includes('failed_to_load_clerk_js') &&
    (stack.includes('clerk.accounts.dev') ||
      stack.includes('clerk.browser.js') ||
      message.includes('clerk.accounts.dev') ||
      message.includes('clerk.browser.js'));

  if (isClerkCdnScriptLoadError) {
    return {
      shouldIgnore: true,
      reason: 'Expected external sandbox Clerk JS SDK download failure',
    };
  }

  // All other uncaught exceptions are genuine application failures!
  const evidence = stack || message;
  return {
    shouldIgnore: false,
    problem: 'Uncaught JavaScript exception',
    evidence: evidence.slice(0, 300),
  };
}

/**
 * Classifies HTTP network responses using exact parsed origin matching.
 */
export function classifyResponse(
  status: number,
  rawUrl: string,
  method: string,
  options?: { expectedStatuses?: number[] }
): NetworkClassification {
  if (options?.expectedStatuses && options.expectedStatuses.includes(status)) {
    return { isError: false };
  }

  const parsed = safeParseUrl(rawUrl);
  if (!parsed) {
    if (status >= 400) {
      return {
        isError: true,
        problem: `Invalid URL response (${status})`,
        evidence: `${method} ${rawUrl} -> HTTP ${status}`,
      };
    }
    return { isError: false };
  }

  const apiOrigin = safeParseUrl(activeConfig.apiOrigin || 'http://localhost:3001')?.origin;
  const webOrigin = safeParseUrl(activeConfig.webOrigin || 'http://localhost:3000')?.origin;

  const isApi = Boolean(apiOrigin && parsed.origin === apiOrigin);
  const isWeb = Boolean(webOrigin && parsed.origin === webOrigin);

  // 1. Genuine 5xx server errors across all origins
  if (status >= 500) {
    return {
      isError: true,
      problem: `Server error (${status})`,
      evidence: `${method} ${parsed.href} -> HTTP ${status}`,
    };
  }

  // 2. Fastify API 4xx errors
  if (isApi && status >= 400) {
    return {
      isError: true,
      problem: `API call error (${status})`,
      evidence: `${method} ${parsed.href} -> HTTP ${status}`,
    };
  }

  // 3. Vite frontend 4xx asset errors
  if (isWeb && status >= 400) {
    return {
      isError: true,
      problem: `Frontend asset error (${status})`,
      evidence: `${method} ${parsed.href} -> HTTP ${status}`,
    };
  }

  // 4. External authentication service 4xx errors (e.g. Clerk /auth API 401/403)
  if (isClerkHostname(parsed.hostname) && status >= 400) {
    return {
      isError: true,
      problem: `Auth service error (${status})`,
      evidence: `${method} ${parsed.href} -> HTTP ${status}`,
    };
  }

  return { isError: false };
}

export interface RequestFailedContext {
  resourceType?: string;
  isNavigationRequest?: boolean;
}

/**
 * Helper to determine if a cancelled request is a confirmed harmless cancellation.
 * Only confirmed document route navigation cancellations and known static frontend
 * assets on explicitly trusted frontend origins are harmless.
 */
function isHarmlessCancellation(
  url: URL,
  method: string,
  isWeb: boolean,
  context?: RequestFailedContext
): boolean {
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  // 1. Must be on trusted web origin (do not classify arbitrary external origins as harmless static assets)
  if (!isWeb) {
    return false;
  }

  const pathname = url.pathname.toLowerCase();

  // 2. Confirmed document navigation cancellation on trusted web frontend
  const isConfirmedDocumentNavigation =
    context?.isNavigationRequest === true || context?.resourceType === 'document';
  if (isConfirmedDocumentNavigation && !pathname.startsWith('/api')) {
    return true;
  }

  // If resourceType is fetch or xhr, it is an active application data request, not a static asset or document navigation
  if (context?.resourceType === 'fetch' || context?.resourceType === 'xhr') {
    return false;
  }

  // 3. Known static asset directory paths on trusted web origin
  if (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/images/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js'
  ) {
    return true;
  }

  // 4. Known static frontend asset extensions on trusted web origin
  const staticAssetExtRegex = /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|css|js|mjs|map)$/i;
  if (staticAssetExtRegex.test(pathname)) {
    // If context resourceType is provided, ensure it matches a static asset category
    if (context?.resourceType) {
      return ['image', 'font', 'stylesheet', 'script', 'manifest'].includes(context.resourceType);
    }
    return true;
  }

  return false;
}

/**
 * Classifies failed network requests (TCP drop, DNS failure, aborted).
 */
export function classifyRequestFailed(
  requestUrl: string,
  method: string,
  errorText: string,
  context?: RequestFailedContext
): NetworkClassification {
  const parsed = safeParseUrl(requestUrl);
  const normalizedMethod = method.toUpperCase();
  const apiOrigin = safeParseUrl(activeConfig.apiOrigin || 'http://localhost:3001')?.origin;
  const webOrigin = safeParseUrl(activeConfig.webOrigin || 'http://localhost:3000')?.origin;
  const isApi = Boolean(parsed && apiOrigin && parsed.origin === apiOrigin);
  const isWeb = Boolean(parsed && webOrigin && parsed.origin === webOrigin);
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod);

  // Correction 2: Narrow net::ERR_ABORTED suppression.
  // 1. Mutating requests aborted unexpectedly are always genuine errors
  if (errorText === 'net::ERR_ABORTED') {
    if (isMutation) {
      return {
        isError: true,
        problem: 'API request aborted',
        evidence: `${normalizedMethod} ${requestUrl} was aborted unexpectedly (${errorText})`,
      };
    }

    // 2. API GET/HEAD requests aborted unexpectedly are always genuine errors
    if (isApi) {
      return {
        isError: true,
        problem: 'API request aborted',
        evidence: `${normalizedMethod} ${requestUrl} was aborted unexpectedly (${errorText})`,
      };
    }

    // 3. Check for confirmed harmless cancellation (Clerk static script or trusted frontend cancellation)
    if (parsed) {
      const isClerk = isClerkHostname(parsed.hostname);
      const isClerkScript = isClerkStaticScriptAsset(parsed);
      if (isClerk && isClerkScript && (normalizedMethod === 'GET' || normalizedMethod === 'HEAD')) {
        return { isError: false };
      }

      if (isHarmlessCancellation(parsed, normalizedMethod, isWeb, context)) {
        return { isError: false };
      }
    }

    // 4. Any other unexpected abort (e.g. ordinary application GET data fetch aborted, untrusted external GET) MUST be reported!
    return {
      isError: true,
      problem: 'Network request aborted',
      evidence: `${normalizedMethod} ${requestUrl} was aborted unexpectedly (${errorText})`,
    };
  }

  if (parsed) {
    // Only ignore if it is strictly a static Clerk JS script bundle asset (GET/HEAD)
    const isClerk = isClerkHostname(parsed.hostname);
    const isScript = isClerkStaticScriptAsset(parsed);
    const isReadMethod = normalizedMethod === 'GET' || normalizedMethod === 'HEAD';

    if (isClerk && isScript && isReadMethod) {
      return { isError: false };
    }

    // Do NOT ignore failed Clerk API requests (e.g. POST /v1/client/sessions, GET /v1/environment)!
    if (isClerk) {
      return {
        isError: true,
        problem: 'Clerk auth API request failed',
        evidence: `${method} ${requestUrl} failed with ${errorText}`,
      };
    }
  }

  // Genuine application or external request failure
  return {
    isError: true,
    problem: 'Network request failed',
    evidence: `${method} ${requestUrl} failed with ${errorText}`,
  };
}

export interface ButtonSafetyCheckOptions {
  buttonType?: string | null;
  isInForm?: boolean;
  role?: string | null;
  ariaHasPopup?: string | null;
  ariaExpanded?: string | null;
  ariaControls?: string | null;
}

/**
 * Evaluates whether a button is eligible for automated clicking.
 * Independently checks visible text, aria-label, and title to prevent name masking.
 * Strictly avoids dangerous, mutating, transactional, or ambiguous actions.
 */
export function isSafeInteractiveButton(
  text: string,
  ariaLabel?: string | null,
  title?: string | null,
  isAlreadyActive?: boolean,
  options?: ButtonSafetyCheckOptions
): ButtonSafetyCheck {
  const rawText = (text || '').trim();
  const rawAriaLabel = (ariaLabel || '').trim();
  const rawTitle = (title || '').trim();

  // Collect all available names to evaluate independently
  const availableNames: { source: string; value: string }[] = [];
  if (rawAriaLabel) availableNames.push({ source: 'aria-label', value: rawAriaLabel });
  if (rawTitle) availableNames.push({ source: 'title', value: rawTitle });
  if (rawText) availableNames.push({ source: 'visible text', value: rawText });

  const primaryAccessibleName = rawAriaLabel || rawTitle || rawText;

  if (availableNames.length === 0 || !primaryAccessibleName) {
    return {
      isSafe: false,
      reason: 'Button has no accessible name or visible text',
      accessibleName: 'unnamed button',
    };
  }

  // 1. Submit buttons or buttons inside forms without explicit type="button" are dangerous
  if (options?.buttonType === 'submit') {
    return {
      isSafe: false,
      reason: 'Button is a form submit action (type="submit")',
      accessibleName: primaryAccessibleName,
    };
  }

  if (options?.isInForm && options.buttonType !== 'button') {
    return {
      isSafe: false,
      reason: 'Button is inside a form without explicit type="button"',
      accessibleName: primaryAccessibleName,
    };
  }

  // 2. Already active / pressed toggle
  if (isAlreadyActive) {
    return {
      isSafe: false,
      reason: 'Button is already in active or pressed state',
      accessibleName: primaryAccessibleName,
    };
  }

  // 3. Reject if ANY available name matches dangerous, mutating, or transactional patterns!
  // No harmless label or structural indicator can override a dangerous match on any name.
  for (const item of availableNames) {
    for (const pattern of DANGEROUS_OR_MUTATING_PATTERNS) {
      if (pattern.test(item.value)) {
        return {
          isSafe: false,
          reason: `Matches dangerous or mutating action in ${item.source} ("${item.value}"): ${pattern}`,
          accessibleName: primaryAccessibleName,
        };
      }
    }
  }

  // 4. Check structural harmless indicators: role="tab", aria-haspopup, aria-expanded, aria-controls
  const isStructuralTabOrToggle =
    options?.role === 'tab' ||
    Boolean(options?.ariaExpanded) ||
    Boolean(options?.ariaControls) ||
    Boolean(options?.ariaHasPopup);

  if (isStructuralTabOrToggle) {
    return { isSafe: true, accessibleName: primaryAccessibleName };
  }

  // 5. Must match explicit allowlist of harmless interaction patterns on at least one available name
  const matchesHarmless = availableNames.some((item) =>
    HARMLESS_INTERACTION_PATTERNS.some((p) => p.test(item.value))
  );
  if (matchesHarmless) {
    return { isSafe: true, accessibleName: primaryAccessibleName };
  }

  // 6. If uncertain, skip!
  return {
    isSafe: false,
    reason: 'Button behavior is uncertain (not in harmless allowlist)',
    accessibleName: primaryAccessibleName,
  };
}

export interface UIStateSnapshot {
  url: string;
  bodyText: string;
  hasOpenOverlay: boolean;
  buttonAriaExpanded?: string | null;
  buttonAriaPressed?: string | null;
  buttonAriaSelected?: string | null;
  buttonDataState?: string | null;
  buttonAriaLabel?: string | null;
  buttonTitle?: string | null;
  rootClass?: string;
  rootThemeAttr?: string | null;
  computedThemeStyles?: {
    backgroundColor?: string;
    color?: string;
  };
}

export interface InteractionEffectResult {
  hasEffect: boolean;
  reason?: string;
}

/**
 * Patterns for background polling, heartbeats, or telemetry paths that
 * should not be attributed as a user-initiated button interaction effect.
 */
export const BACKGROUND_POLLING_OR_TELEMETRY_PATTERNS: RegExp[] = [
  /\/stats\b/i,
  /\/health(?:z)?\b/i,
  /\/metrics\b/i,
  /\/telemetry\b/i,
  /\/ping\b/i,
  /\/heartbeat\b/i,
];

/**
 * Validates whether a network request initiated during a button click is eligible
 * for click correlation:
 * 1. Must be a data request (fetch or xhr).
 * 2. Must match the exact configured API or Web origin (eliminates port lookalikes like :30000).
 * 3. Excludes known background polling, healthcheck, and telemetry endpoints.
 */
export function isClickCorrelatedRequest(
  rawUrl: string,
  method: string,
  resourceType: string,
  config?: ClassifierConfig
): boolean {
  if (resourceType !== 'fetch' && resourceType !== 'xhr') {
    return false;
  }

  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return false;

  const cfg = config || getClassifierConfig();
  const apiOrigin = safeParseUrl(cfg.apiOrigin || 'http://localhost:3001')?.origin;
  const webOrigin = safeParseUrl(cfg.webOrigin || 'http://localhost:3000')?.origin;

  const isApi = Boolean(apiOrigin && parsed.origin === apiOrigin);
  const isWeb = Boolean(webOrigin && parsed.origin === webOrigin);
  if (!isApi && !isWeb) {
    return false;
  }

  const pathname = parsed.pathname.toLowerCase();
  for (const pattern of BACKGROUND_POLLING_OR_TELEMETRY_PATTERNS) {
    if (pattern.test(pathname)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates whether an HTTP status code represents a successful interaction response.
 * Only HTTP 2xx and 3xx qualify. HTTP 4xx (client errors) and 5xx (server errors)
 * are NEVER treated as successful interaction effects.
 */
export function isSuccessfulInteractionResponse(status: number): boolean {
  return status >= 200 && status < 400;
}

/**
 * Compares before and after UI states to determine if a button interaction produced a real effect.
 * Eliminates false positives/negatives from raw HTML length comparisons and background network requests.
 */
export function detectInteractionEffect(
  before: UIStateSnapshot,
  after: UIStateSnapshot,
  correlatedRequestCompleted: boolean
): InteractionEffectResult {
  // 1. Navigation occurred
  if (before.url !== after.url) {
    return { hasEffect: true, reason: 'URL navigation occurred' };
  }

  // 2. Correlated network request completed
  if (correlatedRequestCompleted) {
    return { hasEffect: true, reason: 'Correlated network request completed' };
  }

  // 3. Modal / Dialog / Sheet / Popover overlay state toggled
  if (before.hasOpenOverlay !== after.hasOpenOverlay) {
    return { hasEffect: true, reason: 'Overlay/Dialog state toggled' };
  }

  // 4. Accessible ARIA attributes or data-state updated on button
  if (
    before.buttonAriaExpanded !== after.buttonAriaExpanded ||
    before.buttonAriaPressed !== after.buttonAriaPressed ||
    before.buttonAriaSelected !== after.buttonAriaSelected ||
    before.buttonDataState !== after.buttonDataState ||
    (before.buttonAriaLabel && after.buttonAriaLabel && before.buttonAriaLabel !== after.buttonAriaLabel) ||
    (before.buttonTitle && after.buttonTitle && before.buttonTitle !== after.buttonTitle)
  ) {
    return { hasEffect: true, reason: 'Button accessible/active state updated' };
  }

  // 5. Theme root class, data-theme attribute, or computed theme styles updated
  const rootClassChanged =
    before.rootClass !== undefined &&
    after.rootClass !== undefined &&
    before.rootClass !== after.rootClass;

  const rootThemeAttrChanged =
    before.rootThemeAttr !== undefined &&
    after.rootThemeAttr !== undefined &&
    before.rootThemeAttr !== after.rootThemeAttr;

  const computedThemeChanged = Boolean(
    before.computedThemeStyles &&
      after.computedThemeStyles &&
      ((before.computedThemeStyles.backgroundColor &&
        after.computedThemeStyles.backgroundColor &&
        before.computedThemeStyles.backgroundColor !== after.computedThemeStyles.backgroundColor) ||
        (before.computedThemeStyles.color &&
          after.computedThemeStyles.color &&
          before.computedThemeStyles.color !== after.computedThemeStyles.color))
  );

  if (rootClassChanged || rootThemeAttrChanged || computedThemeChanged) {
    return { hasEffect: true, reason: 'Theme state or styles updated' };
  }

  // 6. Visible text content changed (even if HTML length happens to be identical)
  if (before.bodyText !== after.bodyText) {
    return { hasEffect: true, reason: 'Visible page text updated' };
  }

  return {
    hasEffect: false,
    reason: 'Button caused no visible UI, ARIA, overlay, navigation, theme, or correlated request change',
  };
}

/**
 * Classifies button interaction failures into distinct, independent categories.
 */
export function classifyButtonInteractionFailure(
  accessibleName: string,
  error: any
): ButtonInteractionClassification {
  const errName = error?.name || '';
  const errMsg = error?.message || String(error);
  const fullText = `${errName}: ${errMsg} ${String(error)}`;
  const tag = `<button>${accessibleName}</button>`;

  // 1. Closed page or target termination
  if (
    fullText.includes('Target page, context or browser has been closed') ||
    fullText.includes('Target closed') ||
    fullText.includes('Browser has been closed')
  ) {
    return {
      isError: true,
      kind: 'PAGE_CLOSED',
      problem: 'Page or browser closed during button interaction',
      evidence: `${tag} interaction failed because page/context was closed: ${errMsg.slice(0, 160)}`,
    };
  }

  // 2. Pointer interception (another element intercepts clicks)
  if (
    fullText.includes('intercepts pointer events') ||
    fullText.includes('subtree intercepts pointer events') ||
    fullText.includes('is not receiving click events')
  ) {
    return {
      isError: true,
      kind: 'INTERCEPTED',
      problem: 'Button click intercepted by overlay',
      evidence: `${tag} click intercepted by another element/overlay: ${errMsg.slice(0, 160)}`,
    };
  }

  // 3. Detached from DOM (unmounted or removed while interacting)
  if (
    fullText.includes('element is not attached') ||
    fullText.includes('Node is detached from document') ||
    fullText.includes('not attached to the DOM')
  ) {
    return {
      isError: true,
      kind: 'DETACHED',
      problem: 'Button detached from DOM during interaction',
      evidence: `${tag} was detached from DOM during click attempt: ${errMsg.slice(0, 160)}`,
    };
  }

  // 4. Click actionability timeout (element not stable/visible/enabled in time)
  if (
    fullText.includes('Timeout') &&
    (fullText.includes('waiting for locator') ||
      fullText.includes('waiting for element') ||
      fullText.includes('locator.click') ||
      fullText.includes('element is not stable'))
  ) {
    return {
      isError: true,
      kind: 'TIMEOUT',
      problem: 'Button click timed out',
      evidence: `${tag} click timed out waiting for actionability: ${errMsg.slice(0, 160)}`,
    };
  }

  // 5. Browser-side JavaScript exceptions from handler
  if (
    /^(TypeError|ReferenceError|RangeError|SyntaxError|EvalError|URIError)$/.test(errName) ||
    fullText.includes('ReferenceError') ||
    fullText.includes('TypeError') ||
    fullText.includes('RangeError') ||
    fullText.includes('SyntaxError') ||
    fullText.includes('Error in event handler') ||
    fullText.includes('event handler')
  ) {
    return {
      isError: true,
      kind: 'UNCAUGHT_HANDLER_ERROR',
      problem: 'Button event handler threw uncaught exception',
      evidence: `${tag} handler threw: ${errMsg.slice(0, 160)}`,
    };
  }

  return {
    isError: true,
    kind: 'UNKNOWN',
    problem: 'Button interaction failed',
    evidence: `${tag} failed with: ${errMsg.slice(0, 160)}`,
  };
}

/**
 * Classifies screenshot capture errors.
 */
export function classifyScreenshotFailure(
  screenshotPath: string,
  error: any,
  isPageClosed: boolean
): { problem: string; evidence: string } {
  const msg = error?.message || String(error);
  if (isPageClosed || msg.includes('Target page, context or browser has been closed')) {
    return {
      problem: 'Page crash or termination during screenshot capture',
      evidence: `Target closed while capturing screenshot at ${screenshotPath}: ${msg.slice(0, 150)}`,
    };
  }

  return {
    problem: 'Screenshot capture failure',
    evidence: `Failed to capture screenshot at ${screenshotPath}: ${msg.slice(0, 150)}`,
  };
}

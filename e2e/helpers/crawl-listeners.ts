import type { Page, Response, Request, ConsoleMessage } from '@playwright/test';
import {
  classifyConsoleMessage,
  classifyPageError,
  classifyResponse,
  classifyRequestFailed,
} from './crawl-classifier';

export interface CrawlFindingCollector {
  apiErrors: { problem: string; evidence: string }[];
  consoleErrors: { problem: string; evidence: string }[];
  pageErrors: { problem: string; evidence: string }[];
}

export interface CrawlListenerController {
  detach: () => void;
  isAttached: () => boolean;
}

/**
 * Attaches the four standardized crawl monitoring listeners to a Playwright page.
 * Returns a controller that safely and idempotently detaches all listeners in a single call.
 */
export function attachCrawlListeners(
  page: Page,
  collectors: CrawlFindingCollector
): CrawlListenerController {
  let attached = true;

  const onResponse = (response: Response) => {
    try {
      const url = response.url();
      const status = response.status();
      const method = response.request().method();
      const res = classifyResponse(status, url, method);
      if (res.isError && res.problem && res.evidence) {
        collectors.apiErrors.push({ problem: res.problem, evidence: res.evidence });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      collectors.pageErrors.push({
        problem: 'Listener internal error (response)',
        evidence: `Failed in response listener: ${msg}`,
      });
    }
  };

  const onRequestFailed = (request: Request) => {
    try {
      const url = request.url();
      const method = request.method();
      const errorText = request.failure()?.errorText || 'Unknown request failure';
      const resourceType = request.resourceType();
      const isNavigationRequest = request.isNavigationRequest();
      const res = classifyRequestFailed(url, method, errorText, {
        resourceType,
        isNavigationRequest,
      });
      if (res.isError && res.problem && res.evidence) {
        collectors.apiErrors.push({ problem: res.problem, evidence: res.evidence });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      collectors.pageErrors.push({
        problem: 'Listener internal error (requestfailed)',
        evidence: `Failed in requestfailed listener: ${msg}`,
      });
    }
  };

  const onConsole = (msg: ConsoleMessage) => {
    try {
      const res = classifyConsoleMessage(msg.type(), msg.text(), msg.location());
      if (!res.shouldIgnore && res.problem && res.evidence) {
        collectors.consoleErrors.push({ problem: res.problem, evidence: res.evidence });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      collectors.consoleErrors.push({
        problem: 'Listener internal error (console)',
        evidence: `Failed in console listener: ${errMsg}`,
      });
    }
  };

  const onPageError = (err: Error) => {
    try {
      const res = classifyPageError(err);
      if (!res.shouldIgnore && res.problem && res.evidence) {
        collectors.pageErrors.push({ problem: res.problem, evidence: res.evidence });
      }
    } catch (internalErr: unknown) {
      const msg = internalErr instanceof Error ? internalErr.message : String(internalErr);
      collectors.pageErrors.push({
        problem: 'Listener internal error (pageerror)',
        evidence: `Failed in pageerror listener: ${msg}`,
      });
    }
  };

  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  const detach = () => {
    if (!attached) return;
    attached = false;
    const detachErrors: string[] = [];

    // Isolate each detachment so failure in one never blocks the others
    try {
      page.off('response', onResponse);
    } catch (err: unknown) {
      detachErrors.push(`response: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      page.off('requestfailed', onRequestFailed);
    } catch (err: unknown) {
      detachErrors.push(`requestfailed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      page.off('console', onConsole);
    } catch (err: unknown) {
      detachErrors.push(`console: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      page.off('pageerror', onPageError);
    } catch (err: unknown) {
      detachErrors.push(`pageerror: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Expose any detachment failures through the existing diagnostic collector
    if (detachErrors.length > 0) {
      collectors.pageErrors.push({
        problem: 'Listener cleanup diagnostic',
        evidence: `Failed to detach listener(s): ${detachErrors.join('; ')}`,
      });
    }
  };

  return {
    detach,
    isAttached: () => attached,
  };
}

/**
 * Scopes crawl listeners to an async action with guaranteed cleanup in try / finally.
 */
export async function withRouteCrawlListeners<T>(
  page: Page,
  collectors: CrawlFindingCollector,
  action: () => Promise<T>
): Promise<T> {
  const controller = attachCrawlListeners(page, collectors);
  try {
    return await action();
  } finally {
    controller.detach();
  }
}

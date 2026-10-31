import { describe, it, expect } from 'vitest';
import { workboxConfig } from '../lib/workbox-config';

describe('Service Worker Workbox Cache Invariants (Section D.3)', () => {
  const { runtimeCaching } = workboxConfig;

  it('defines caching rules with explicit NetworkOnly guard for sensitive endpoints', () => {
    expect(runtimeCaching).toBeDefined();
    expect(runtimeCaching.length).toBeGreaterThanOrEqual(2);

    const networkOnlyRule = runtimeCaching.find((rule: any) => rule.handler === 'NetworkOnly');
    expect(networkOnlyRule).toBeDefined();
  });

  it('guarantees /gate/* requests are NEVER cached (NetworkOnly)', () => {
    const networkOnlyRule = runtimeCaching.find((rule: any) => rule.handler === 'NetworkOnly')!;
    const staleRule = runtimeCaching.find((rule: any) => rule.handler === 'StaleWhileRevalidate')!;

    const gateUrl = new URL('http://localhost:4000/gate/scan');
    const dummyReq = new Request(gateUrl.toString());

    expect(networkOnlyRule.urlPattern({ url: gateUrl, request: dummyReq })).toBe(true);
    expect(staleRule.urlPattern({ url: gateUrl, request: dummyReq })).toBe(false);
  });

  it('guarantees /scanner/* requests are NEVER cached (NetworkOnly)', () => {
    const networkOnlyRule = runtimeCaching.find((rule: any) => rule.handler === 'NetworkOnly')!;
    const staleRule = runtimeCaching.find((rule: any) => rule.handler === 'StaleWhileRevalidate')!;

    const scannerUrl = new URL('http://localhost:4000/scanner/status');
    const dummyReq = new Request(scannerUrl.toString());

    expect(networkOnlyRule.urlPattern({ url: scannerUrl, request: dummyReq })).toBe(true);
    expect(staleRule.urlPattern({ url: scannerUrl, request: dummyReq })).toBe(false);
  });

  it('guarantees /tickets/*/qr.* requests are NEVER cached (NetworkOnly)', () => {
    const networkOnlyRule = runtimeCaching.find((rule: any) => rule.handler === 'NetworkOnly')!;
    const staleRule = runtimeCaching.find((rule: any) => rule.handler === 'StaleWhileRevalidate')!;

    const qrUrl = new URL('http://localhost:4000/tickets/reg_12345/qr.svg');
    const dummyReq = new Request(qrUrl.toString());

    expect(networkOnlyRule.urlPattern({ url: qrUrl, request: dummyReq })).toBe(true);
    expect(staleRule.urlPattern({ url: qrUrl, request: dummyReq })).toBe(false);
  });

  it('guarantees all authenticated requests with Authorization header are NEVER cached', () => {
    const networkOnlyRule = runtimeCaching.find((rule: any) => rule.handler === 'NetworkOnly')!;
    const staleRule = runtimeCaching.find((rule: any) => rule.handler === 'StaleWhileRevalidate')!;

    const authedUrl = new URL('http://localhost:4000/events/hackfest-2026');
    const authedReq = new Request(authedUrl.toString(), {
      headers: { Authorization: 'Bearer token_xyz' },
    });

    expect(networkOnlyRule.urlPattern({ url: authedUrl, request: authedReq })).toBe(true);
    expect(staleRule.urlPattern({ url: authedUrl, request: authedReq })).toBe(false);
  });
});
